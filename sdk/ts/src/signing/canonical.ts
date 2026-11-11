// RFC 8785 (JCS) restricted to the HCS-0007 value domain: every number is an integer in the I-JSON
// safe range (HCS-0007-R004), so no floating-point formatting is needed (HCS-0007 section 4).
import { fail, type SigningError } from './types.ts';

export class CanonicalError extends TypeError {
  override name = 'CanonicalError';
}

/** A number token whose spelling HCS-0007-R004 does not allow. */
class NumberSpellingError extends CanonicalError {
  override name = 'NumberSpellingError';
}

// R004: the token, not the value, decides. No fraction, no exponent, no `-0`, no leading zero or plus sign.
const INTEGER_TOKEN = /^-?(0|[1-9][0-9]*)$/;

const SHORT_ESCAPES: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

function string(s: string): string {
  if (!s.isWellFormed()) throw new CanonicalError('string contains an unpaired surrogate');
  // Only `"`, `\` and C0 controls are escaped; everything else is written as is.
  return '"' + s.replace(/["\\\u0000-\u001f]/g, ch => SHORT_ESCAPES[ch] ?? '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
}

function isPlainObject(v: object): v is Record<string, unknown> {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** RFC 8785 serialization of a value in the HCS-0007 domain. Throws CanonicalError when it has no canonical form. */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false';
    case 'string': return string(value);
    case 'number':
      if (!Number.isSafeInteger(value)) throw new CanonicalError(`number ${value} is not an integer in the safe range`);
      return String(value); // -0 prints as "0"
    case 'object':
      if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
      if (!isPlainObject(value)) throw new CanonicalError('only plain objects have a canonical form');
      // Default sort compares UTF-16 code units, which is the RFC 8785 member order.
      return '{' + Object.keys(value).sort().map(k => string(k) + ':' + canonicalize(value[k])).join(',') + '}';
    default:
      throw new CanonicalError(`a ${typeof value} has no canonical form`);
  }
}

/** UTF-8 bytes of the canonical form. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

/**
 * Throws CanonicalError when a member name repeats inside one object, and NumberSpellingError when a
 * number token is not spelled as R004 allows. Assumes `text` is valid JSON. Messages carry offsets only.
 */
function assertUniqueMembers(text: string): void {
  const stack: { keys: Set<string> | null; expectKey: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') stack.push({ keys: new Set(), expectKey: true });
    else if (ch === '[') stack.push({ keys: null, expectKey: false });
    else if (ch === '}' || ch === ']') stack.pop();
    else if (ch === ',') { const top = stack.at(-1); if (top?.keys) top.expectKey = true; }
    else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE+-]/.test(text[j])) j++;
      const token = text.slice(i, j);
      if (!INTEGER_TOKEN.test(token) || token === '-0') throw new NumberSpellingError(`number token at offset ${i} is not spelled as a plain integer`);
      i = j - 1;
    }
    else if (ch === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const top = stack.at(-1);
      if (top?.keys && top.expectKey) {
        const key: string = JSON.parse(text.slice(i, j + 1));
        if (top.keys.has(key)) throw new CanonicalError(`duplicated member name at offset ${i}`);
        top.keys.add(key);
        top.expectKey = false;
      }
      i = j;
    }
  }
}

/**
 * Parses JSON bytes or text received from the wire and rejects what has no canonical form
 * (HCS-0007 section 4): invalid UTF-8, duplicated member names, unpaired surrogates and numbers
 * outside the canonical domain or spelled other than `-?(0|[1-9][0-9]*)` (R004: `1.0`, `1e2`, `-0`).
 * `JSON.parse` alone silently keeps the last duplicated member. Error messages never quote the text.
 */
export function parseStrictJson(input: string | Uint8Array): { ok: true; value: unknown } | { ok: false; errors: SigningError[] } {
  try {
    const text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
    const value: unknown = JSON.parse(text);
    assertUniqueMembers(text);
    canonicalize(value);
    return { ok: true, value };
  } catch (e) {
    // Echo nothing of the text: JSON.parse messages quote it, so only our own errors keep their reason.
    const message = e instanceof CanonicalError ? e.message : 'the text is not valid UTF-8 JSON';
    return { ok: false, errors: [fail('manifest_invalid', `document has no canonical form: ${message}`, e instanceof NumberSpellingError ? 'HCS-0007-R004' : 'HCS-0007-R003')] };
  }
}
