import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519PublicKey, ed25519Sign, ed25519Verify, generateKeyPair } from '../../src/signing/index.ts';

const hex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
// RFC 8032 section 7.1, TEST 1 (empty message)
const seed = hex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const pub = hex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
const sig = hex('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b');

test('RFC 8032 test vector 1: public key, signature and verification', () => {
  assert.deepEqual(ed25519PublicKey(seed), pub);
  assert.deepEqual(ed25519Sign(seed, new Uint8Array()), sig);
  assert.equal(ed25519Verify(pub, new Uint8Array(), sig), true);
});

test('verification fails on another message, a flipped bit or malformed inputs', () => {
  assert.equal(ed25519Verify(pub, new Uint8Array([0x78]), sig), false);
  const flipped = sig.slice(); flipped[0] ^= 1;
  assert.equal(ed25519Verify(pub, new Uint8Array(), flipped), false);
  assert.equal(ed25519Verify(pub, new Uint8Array(), sig.slice(0, 63)), false);
  assert.equal(ed25519Verify(pub.slice(0, 31), new Uint8Array(), sig), false);
});

test('generated key pairs sign and verify', () => {
  const kp = generateKeyPair();
  assert.equal(kp.seed.length, 32);
  const raw = new Uint8Array(Buffer.from(kp.publicKey, 'base64'));
  assert.deepEqual(raw, ed25519PublicKey(kp.seed));
  const msg = new TextEncoder().encode('hello');
  assert.equal(ed25519Verify(raw, msg, ed25519Sign(kp.seed, msg)), true);
});
