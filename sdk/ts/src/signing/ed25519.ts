// Ed25519 (RFC 8032) on node:crypto, with raw 32-byte keys wrapped as SPKI / PKCS#8 DER.
import { createPrivateKey, createPublicKey, KeyObject, randomBytes, sign, verify } from 'node:crypto';

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function privateKeyObject(key: Uint8Array | KeyObject): KeyObject {
  if (key instanceof KeyObject) {
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') throw new TypeError('expected an Ed25519 private key');
    return key;
  }
  if (key.length !== 32) throw new TypeError('an Ed25519 seed is 32 bytes');
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, key]), format: 'der', type: 'pkcs8' });
}

/** Raw 32-byte public key of a seed or private KeyObject. */
export function ed25519PublicKey(privateKey: Uint8Array | KeyObject): Uint8Array {
  const der = createPublicKey(privateKeyObject(privateKey)).export({ format: 'der', type: 'spki' });
  return new Uint8Array(der.subarray(SPKI_PREFIX.length));
}

export function ed25519Sign(privateKey: Uint8Array | KeyObject, message: Uint8Array): Uint8Array {
  return new Uint8Array(sign(null, message, privateKeyObject(privateKey)));
}

/** True only for a valid 64-byte signature by a well-formed 32-byte public key; never throws. */
export function ed25519Verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, publicKey]), format: 'der', type: 'spki' });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}

/** A fresh key pair: the 32-byte seed (keep it secret) and the base64 public key for a key set or trust anchor. */
export function generateKeyPair(): { seed: Uint8Array; publicKey: string } {
  const seed = new Uint8Array(randomBytes(32));
  return { seed, publicKey: Buffer.from(ed25519PublicKey(seed)).toString('base64') };
}
