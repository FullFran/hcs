// Version and shape checks (HCS-0007-R001, R002, R004), mirroring
// schemas/hcs-0007/signed-catalog/v0.1/signed-catalog.schema.json without a schema validator.
import { CanonicalError, canonicalize } from './canonical.ts';
import { fail, HCS_VERSION, MAX_SAFE, type Limits, type SigningError } from './types.ts';

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const matches = (re: RegExp, v: unknown): v is string => typeof v === 'string' && re.test(v);

const X_MEMBER = /^x-[a-z0-9]+(-[a-z0-9]+)*$/;
const KEYID = /^[A-Za-z0-9._:-]{1,128}$/;
const SIG = /^[A-Za-z0-9+/]{86}==$/;
const PUBLIC = /^[A-Za-z0-9+/]{43}=$/;
const BINDING_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

/**
 * Nanoseconds since the Unix epoch of an RFC 3339 UTC timestamp with the `Z` designator and up to
 * nine fractional digits, or null when the text is not one or names a day that does not exist.
 */
export function parseInstant(text: unknown): bigint | null {
  const m = typeof text === 'string' ? TIMESTAMP.exec(text) : null;
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, 0);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return BigInt(date.getTime()) * 1_000_000n + BigInt((m[7] ?? '').padEnd(9, '0'));
}

/** Any JSON value whose numbers are safe integers (schema `canonicalValue`). */
export function isCanonicalValue(v: unknown): boolean {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return true;
  if (typeof v === 'number') return Number.isSafeInteger(v);
  if (Array.isArray(v)) return v.every(isCanonicalValue);
  if (isObject(v)) return Object.values(v).every(isCanonicalValue);
  return false;
}

const isSignature = (v: unknown) => isObject(v) && Object.keys(v).every(k => k === 'keyid' || k === 'sig')
  && matches(KEYID, v.keyid) && matches(SIG, v.sig);
const isSignatures = (v: unknown) => Array.isArray(v) && v.every(isSignature);
const isTimestamp = (v: unknown) => parseInstant(v) !== null;

const isPublicKey = (v: unknown) => isObject(v) && Object.keys(v).every(k => ['keyid', 'keytype', 'public'].includes(k))
  && matches(KEYID, v.keyid) && v.keytype === 'ed25519' && matches(PUBLIC, v.public);

const isOnlineKey = (v: unknown) => isObject(v)
  && Object.entries(v).every(([k, x]) => ['keyid', 'keytype', 'public', 'notBefore', 'notAfter'].includes(k) || (X_MEMBER.test(k) && isCanonicalValue(x)))
  && matches(KEYID, v.keyid) && v.keytype === 'ed25519' && matches(PUBLIC, v.public) && isTimestamp(v.notBefore) && isTimestamp(v.notAfter);

const isBinding = (v: unknown) => isObject(v) && Object.keys(v).length >= 1
  && Object.entries(v).every(([k, x]) => BINDING_NAME.test(k) && typeof x === 'string' && [...x].length >= 1 && [...x].length <= 256);

type MemberRules = Record<string, (v: unknown) => boolean>;

/**
 * R022 and R023, after the shape: one item per `keyid` in `signatures`, then the host's bounds.
 * Messages name list positions, never the document's text. Nothing is verified here.
 */
function checkSignatureList(doc: Obj, what: string, limits: Limits | undefined): SigningError[] {
  const signatures = (doc.signatures ?? []) as { keyid: string }[];
  const first = new Map<string, number>();
  for (const [i, { keyid }] of signatures.entries()) {
    const seen = first.get(keyid);
    if (seen !== undefined) return [fail('manifest_invalid', `${what} signatures[${i}] repeats the keyid of signatures[${seen}]`, 'HCS-0007-R022')];
    first.set(keyid, i);
  }
  if (limits?.maxSignatures !== undefined && signatures.length > limits.maxSignatures)
    return [fail('manifest_invalid', `${what} has ${signatures.length} signatures, over the host limit of ${limits.maxSignatures}`, 'HCS-0007-R023')];
  const keys = doc.keys as unknown[] | undefined;
  if (limits?.maxKeys !== undefined && keys && keys.length > limits.maxKeys)
    return [fail('manifest_invalid', `${what} has ${keys.length} keys, over the host limit of ${limits.maxKeys}`, 'HCS-0007-R023')];
  return [];
}

/** Runs `hcsVersion` first, then the schema rules, then the canonical form, then R022 and R023; returns at most one error. */
function checkDocument(doc: unknown, what: string, rules: MemberRules, required: string[], versionRequirement: string, shapeRequirement: string, limits?: Limits): SigningError[] {
  if (isObject(doc) && typeof doc.hcsVersion === 'string' && doc.hcsVersion !== HCS_VERSION)
    return [fail('unsupported_hcs_version', `${what} hcsVersion ${JSON.stringify(doc.hcsVersion)} is not supported`, versionRequirement)];
  const invalid = (detail: string, requirement = shapeRequirement) => [fail('manifest_invalid', `${what} ${detail}`, requirement)];
  if (!isObject(doc)) return invalid('is not a JSON object');
  for (const name of required) if (doc[name] === undefined) return invalid(`is missing "${name}"`);
  for (const [name, value] of Object.entries(doc)) {
    if (name in rules) { if (!rules[name](value)) return invalid(`member "${name}" is invalid`); }
    else if (!X_MEMBER.test(name)) return invalid(`has unknown member "${name}"`);
    else if (!isCanonicalValue(value)) return invalid(`member "${name}" contains a number outside the canonical domain`, 'HCS-0007-R004');
  }
  try { canonicalize(doc); }
  catch (e) { if (e instanceof CanonicalError) return invalid(`has no canonical form: ${e.message}`, 'HCS-0007-R004'); throw e; }
  return checkSignatureList(doc, what, limits);
}

/** Step 1 of HCS-0007 section 5.2: version and shape of an envelope (R001, R004). */
export function checkEnvelopeShape(doc: unknown, limits?: Limits): SigningError[] {
  return checkDocument(doc, 'envelope', {
    hcsVersion: v => v === HCS_VERSION,
    sequence: v => isInt(v, 1, MAX_SAFE),
    expires: isTimestamp,
    binding: isBinding,
    catalog: v => isObject(v) && isCanonicalValue(v),
    signatures: isSignatures,
  }, ['hcsVersion', 'sequence', 'expires', 'binding', 'catalog'], 'HCS-0007-R001', 'HCS-0007-R001', limits);
}

/** Version and shape of a key set, including unique keyids (R002, R004). */
export function checkKeySetShape(doc: unknown, limits?: Limits): SigningError[] {
  const errors = checkDocument(doc, 'key set', {
    hcsVersion: v => v === HCS_VERSION,
    version: v => isInt(v, 1, MAX_SAFE),
    threshold: v => isInt(v, 1, 255),
    keys: v => Array.isArray(v) && v.length >= 1 && v.every(isOnlineKey),
    signatures: isSignatures,
  }, ['hcsVersion', 'version', 'keys'], 'HCS-0007-R002', 'HCS-0007-R002', limits);
  if (errors.length) return errors;
  const ids = (doc as { keys: { keyid: string }[] }).keys.map(k => k.keyid);
  if (new Set(ids).size !== ids.length) return [fail('manifest_invalid', 'key set lists the same keyid twice', 'HCS-0007-R002')];
  return [];
}

/** A trust anchor is a host input, so a malformed one is a configuration error, not a verdict. */
export function assertTrustAnchor(anchor: unknown): asserts anchor is { keys: { keyid: string; public: string }[]; threshold?: number } {
  if (!isObject(anchor) || !Object.keys(anchor).every(k => k === 'keys' || k === 'threshold')
    || !Array.isArray(anchor.keys) || anchor.keys.length < 1 || !anchor.keys.every(isPublicKey)
    || (anchor.threshold !== undefined && !isInt(anchor.threshold, 1, 255)))
    throw new TypeError('trust anchor does not match the HCS-0007 trustAnchor shape');
}

export function assertAssignment(assignment: unknown): asserts assignment is Record<string, string> {
  if (!isBinding(assignment)) throw new TypeError('assignment must be a non-empty map of binding names to strings');
}
