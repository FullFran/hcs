// Private key files: PKCS#8 PEM (openssl-compatible) read and write, and a guard against private key material.
// A bare 32-byte seed is byte-for-byte indistinguishable from a 32-byte public key, so it cannot be detected;
// key files use PEM because PEM is self-describing.
import { createPrivateKey } from 'node:crypto';
import { PKCS8_PREFIX } from './ed25519.ts';
import type { Signer } from './types.ts';

const PEM_PRIVATE = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const PEM_PKCS8 = /^\s*-----BEGIN PRIVATE KEY-----[A-Za-z0-9+/=\s]+-----END PRIVATE KEY-----\s*$/;
const BASE64 = /^[A-Za-z0-9+/\-_]+={0,2}$/;
const MAX_DEPTH = 32;

/** PKCS#8 PEM of a seed (openssl-compatible: `openssl pkey -in key.pem -text`). */
export function seedToPem(seed: Uint8Array): string {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new TypeError('an Ed25519 seed is 32 bytes');
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  return key.export({ format: 'pem', type: 'pkcs8' }) as string;
}

/** Reads a PKCS#8 PEM Ed25519 private key into a Signer. Throws TypeError on anything else; the message never includes the input. */
export function readSignerPem(keyid: string, pem: string): Signer {
  const invalid = () => new TypeError('not a PKCS#8 PEM Ed25519 private key');
  if (typeof pem !== 'string' || !PEM_PKCS8.test(pem)) throw invalid();
  let key;
  try { key = createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' }); } catch { throw invalid(); }
  if (key.asymmetricKeyType !== 'ed25519') throw invalid();
  return { keyid, privateKey: key };
}

function startsWithPrefix(bytes: Uint8Array): boolean {
  return bytes.length >= PKCS8_PREFIX.length && PKCS8_PREFIX.every((b, i) => bytes[i] === b);
}

function inspect(value: unknown, depth: number, seen: Set<object>): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof value === 'string') {
    if (PEM_PRIVATE.test(value)) return true;
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { if (inspect(JSON.parse(trimmed), depth + 1, seen)) return true; } catch { /* not JSON */ }
    }
    if (BASE64.test(trimmed) && trimmed.length >= 22) return startsWithPrefix(Buffer.from(trimmed, 'base64'));
    return false;
  }
  if (value instanceof Uint8Array) {
    if (startsWithPrefix(value)) return true;
    return value.length >= 26 && value.length <= 1 << 20 ? PEM_PRIVATE.test(Buffer.from(value).toString('latin1')) : false;
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (!Array.isArray(value) && typeof record.d === 'string' && typeof record.kty === 'string') return true;
    return Object.values(record).some(v => inspect(v, depth + 1, seen));
  }
  return false;
}

/** True when `value` looks like private key material: PEM `PRIVATE KEY` / `ENCRYPTED PRIVATE KEY` / `OPENSSH PRIVATE KEY`
 *  blocks, a JWK with a `d` member, or a PKCS#8 DER prefix of an Ed25519 key. Never throws. */
export function isPrivateKeyMaterial(value: string | Uint8Array | Record<string, unknown>): boolean {
  try { return inspect(value, 0, new Set()); } catch { return false; }
}
