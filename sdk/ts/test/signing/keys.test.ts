import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, ed25519PublicKey, ed25519Sign, ed25519Verify, isPrivateKeyMaterial, seedToPem, readSignerPem } from '../../src/signing/index.ts';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const seed = generateKeyPair().seed;
const pem = seedToPem(seed);

test('seedToPem emits a PKCS#8 PEM that readSignerPem reads back to the same key', () => {
  assert.match(pem, /^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+-----END PRIVATE KEY-----\n$/);
  const signer = readSignerPem('k-1', pem);
  assert.equal(signer.keyid, 'k-1');
  assert.deepEqual(ed25519PublicKey(signer.privateKey), ed25519PublicKey(seed));
  const sig = ed25519Sign(signer.privateKey, new Uint8Array([1, 2, 3]));
  assert.equal(ed25519Verify(ed25519PublicKey(seed), new Uint8Array([1, 2, 3]), sig), true);
});

test('seedToPem rejects a seed that is not 32 bytes', () => {
  assert.throws(() => seedToPem(new Uint8Array(31)), TypeError);
});

test('readSignerPem throws TypeError on anything that is not a PKCS#8 Ed25519 PEM, without echoing input', () => {
  const secret = 'SUPERSECRETMARKER';
  for (const bad of ['', 'not a pem', `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----\n`,
    '-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----\n',
    Buffer.from(seed).toString('base64')]) {
    assert.throws(() => readSignerPem('k-1', bad), (e: unknown) => e instanceof TypeError && !String(e.message).includes(secret));
  }
});

test('isPrivateKeyMaterial is true for private key encodings', () => {
  assert.equal(isPrivateKeyMaterial(pem), true);
  assert.equal(isPrivateKeyMaterial('-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n'), true);
  assert.equal(isPrivateKeyMaterial('-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----\n'), true);
  assert.equal(isPrivateKeyMaterial({ kty: 'OKP', crv: 'Ed25519', x: 'AAAA', d: 'BBBB' }), true);
  assert.equal(isPrivateKeyMaterial(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'AAAA', d: 'BBBB' })), true);
  assert.equal(isPrivateKeyMaterial(new Uint8Array(Buffer.concat([PKCS8_PREFIX, seed]))), true);
  assert.equal(isPrivateKeyMaterial(Buffer.concat([PKCS8_PREFIX, seed]).toString('base64')), true);
  assert.equal(isPrivateKeyMaterial(new TextEncoder().encode(pem)), true);
  assert.equal(isPrivateKeyMaterial({ keys: [{ keyid: 'a', note: pem }] }), true);
});

test('isPrivateKeyMaterial is false for public material and never throws', () => {
  const { publicKey } = generateKeyPair();
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64')]);
  assert.equal(isPrivateKeyMaterial(publicKey), false);
  assert.equal(isPrivateKeyMaterial(Buffer.from(publicKey, 'base64')), false);
  assert.equal(isPrivateKeyMaterial(`-----BEGIN PUBLIC KEY-----\n${spki.toString('base64')}\n-----END PUBLIC KEY-----\n`), false);
  assert.equal(isPrivateKeyMaterial({ hcsVersion: '0.1', version: 1, keys: [{ keyid: 'a', keytype: 'ed25519', public: publicKey }] }), false);
  assert.equal(isPrivateKeyMaterial(''), false);
  assert.equal(isPrivateKeyMaterial(new Uint8Array(0)), false);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.doesNotThrow(() => isPrivateKeyMaterial(cyclic));
});
