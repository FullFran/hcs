import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvelope, ENVELOPE_PAYLOAD_TYPE, ed25519Verify, generateKeyPair, signDocument, signingInput, signEnvelope, CanonicalError } from '../../src/signing/index.ts';

const kp = generateKeyPair(), kp2 = generateKeyPair();
const raw = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));

test('signDocument signs the signature input and appends to existing signatures', () => {
  const doc = { hcsVersion: '0.1', a: 1 };
  const one = signDocument(ENVELOPE_PAYLOAD_TYPE, doc, [{ keyid: 'k1', privateKey: kp.seed }]);
  const two = signDocument(ENVELOPE_PAYLOAD_TYPE, one, [{ keyid: 'k2', privateKey: kp2.seed }]);
  assert.deepEqual(two.signatures.map(s => s.keyid), ['k1', 'k2']);
  assert.equal(two.signatures[0].sig, one.signatures[0].sig);
  const input = signingInput(ENVELOPE_PAYLOAD_TYPE, doc);
  assert.equal(ed25519Verify(raw(kp2.publicKey), input, raw(two.signatures[1].sig)), true);
  assert.equal('signatures' in doc, false, 'input is not mutated');
});

test('signing is deterministic (Ed25519)', () => {
  const doc = { hcsVersion: '0.1', b: [1, 2] };
  assert.deepEqual(signEnvelope(doc, [{ keyid: 'k', privateKey: kp.seed }]), signEnvelope(doc, [{ keyid: 'k', privateKey: kp.seed }]));
});

test('a document without a canonical form cannot be signed', () => {
  assert.throws(() => signEnvelope({ a: 0.5 }, [{ keyid: 'k', privateKey: kp.seed }]), CanonicalError);
});

test('createEnvelope builds a valid signed envelope and rejects an invalid one', () => {
  const env = createEnvelope({ sequence: 1, expires: new Date('2026-11-13T00:00:00Z'), binding: { tenant: 't' }, catalog: { hcsVersion: '0.1', entries: [] }, extensions: { 'x-note': 'hi' } }, [{ keyid: 'k', privateKey: kp.seed }]);
  assert.equal(env.hcsVersion, '0.1');
  assert.equal(env.expires, '2026-11-13T00:00:00.000Z');
  assert.equal(env['x-note'], 'hi');
  assert.equal(env.signatures.length, 1);
  assert.throws(() => createEnvelope({ sequence: 0, expires: '2026-11-13T00:00:00Z', binding: { tenant: 't' }, catalog: {} }, []), TypeError);
});
