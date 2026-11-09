import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, signEnvelope, signKeySet, verifyEnvelope, verifyKeySet, verifySignedCatalog, contentDigest } from '../../src/signing/index.ts';

const now = '2026-11-06T12:00:00Z';
const root = generateKeyPair(), root2 = generateKeyPair(), online = generateKeyPair(), online2 = generateKeyPair();
const anchor = { keys: [{ keyid: 'root-1', keytype: 'ed25519' as const, public: root.publicKey }] };
const window = { notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' };
const keySetDoc = (threshold = 1, keys = [{ keyid: 'online-1', keytype: 'ed25519', public: online.publicKey, ...window }]) =>
  signKeySet({ hcsVersion: '0.1', version: 3, threshold, keys }, [{ keyid: 'root-1', privateKey: root.seed }]);
const binding = { tenant: 't-0001' };
const envelopeDoc = () => ({ hcsVersion: '0.1', sequence: 5, expires: '2026-11-13T00:00:00Z', binding, catalog: { hcsVersion: '0.1', entries: [] } });
const noCatalogErrors = () => [];
const codeOf = (r: { ok: boolean; errors?: { code: string }[] }) => r.ok ? null : r.errors![0].code;

test('verifyKeySet returns the accepted state', () => {
  const ks = keySetDoc();
  const r = verifyKeySet(ks, { trustAnchor: anchor, now });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.accepted, { version: 3, digest: contentDigest(ks) });
});

test('key-set checks run in order: signature, rollback, validity window', () => {
  const ks = keySetDoc();
  const unsigned = { ...ks, signatures: [] };
  assert.equal(codeOf(verifyKeySet(unsigned, { trustAnchor: anchor, now, lastAccepted: { version: 9, digest: 'sha256:' + '0'.repeat(64) } })), 'signature_invalid');
  assert.equal(codeOf(verifyKeySet(ks, { trustAnchor: anchor, now: '2030-01-01T00:00:00Z', lastAccepted: { version: 9, digest: 'sha256:' + '0'.repeat(64) } })), 'rollback_rejected');
  assert.equal(codeOf(verifyKeySet(ks, { trustAnchor: anchor, now: '2030-01-01T00:00:00Z' })), 'signature_invalid');
  assert.equal(verifyKeySet(ks, { trustAnchor: anchor, now, lastAccepted: { version: 3, digest: contentDigest(ks) } }).ok, true);
  assert.equal(codeOf(verifyKeySet(ks, { trustAnchor: anchor, now, lastAccepted: { version: 3, digest: 'sha256:' + '0'.repeat(64) } })), 'rollback_rejected');
});

test('root threshold counts distinct public keys, not keyids', () => {
  const twoIds = { keys: [...anchor.keys, { keyid: 'root-alias', keytype: 'ed25519' as const, public: root.publicKey }], threshold: 2 };
  const ks = signKeySet({ hcsVersion: '0.1', version: 1, keys: [{ keyid: 'online-1', keytype: 'ed25519', public: online.publicKey, ...window }] },
    [{ keyid: 'root-1', privateKey: root.seed }, { keyid: 'root-alias', privateKey: root.seed }]);
  assert.equal(codeOf(verifyKeySet(ks, { trustAnchor: twoIds, now })), 'signature_invalid');
  const two = { keys: [...anchor.keys, { keyid: 'root-2', keytype: 'ed25519' as const, public: root2.publicKey }], threshold: 2 };
  const ks2 = signKeySet({ hcsVersion: '0.1', version: 1, keys: [{ keyid: 'online-1', keytype: 'ed25519', public: online.publicKey, ...window }] },
    [{ keyid: 'root-1', privateKey: root.seed }, { keyid: 'root-2', privateKey: root2.seed }]);
  assert.equal(verifyKeySet(ks2, { trustAnchor: two, now }).ok, true);
});

test('an invalid trust anchor or assignment is a host configuration error', () => {
  assert.throws(() => verifyKeySet(keySetDoc(), { trustAnchor: { keys: [] } as never, now }), TypeError);
  assert.throws(() => verifyKeySet(keySetDoc(), { trustAnchor: anchor, now: 'yesterday' }), TypeError);
  const r = verifyKeySet(keySetDoc(), { trustAnchor: anchor, now });
  assert.ok(r.ok);
  const env = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }]);
  assert.throws(() => verifyEnvelope(env, { keySet: r.keySet, assignment: { tenant: 1 } as never, now, validateCatalog: noCatalogErrors }), TypeError);
});

test('verifyEnvelope only accepts a key set produced by verifyKeySet', () => {
  const env = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }]);
  assert.throws(() => verifyEnvelope(env, { keySet: keySetDoc() as never, assignment: binding, now, validateCatalog: noCatalogErrors }), TypeError);
});

test('envelope threshold comes from the key set and counts keys valid now', () => {
  const keys = [
    { keyid: 'online-1', keytype: 'ed25519', public: online.publicKey, ...window },
    { keyid: 'online-2', keytype: 'ed25519', public: online2.publicKey, notBefore: '2026-11-07T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' },
  ];
  const r = verifyKeySet(keySetDoc(2, keys), { trustAnchor: anchor, now });
  assert.ok(r.ok);
  const env = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }, { keyid: 'online-2', privateKey: online2.seed }]);
  assert.equal(codeOf(verifyEnvelope(env, { keySet: r.keySet, assignment: binding, now, validateCatalog: noCatalogErrors })), 'signature_invalid');
  assert.equal(verifyEnvelope(env, { keySet: r.keySet, assignment: binding, now: '2026-11-07T00:00:00Z', validateCatalog: noCatalogErrors }).ok, true);
});

test('catalog errors from the hook fail step 6 and carry R010', () => {
  const env = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }]);
  const r = verifySignedCatalog({ trustAnchor: anchor, keySet: keySetDoc(), envelope: env, assignment: binding, now,
    validateCatalog: () => [{ code: 'duplicate_entry', entry: 'dev.example.a', message: 'twice' }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual([r.stage, r.errors[0].code, r.errors[0].entry, r.errors[0].requirement], ['envelope', 'duplicate_entry', 'dev.example.a', 'HCS-0007-R010']);
});

test('now accepts a Date', () => {
  const env = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }]);
  const r = verifySignedCatalog({ trustAnchor: anchor, keySet: keySetDoc(), envelope: env, assignment: binding, now: new Date(now), validateCatalog: noCatalogErrors });
  assert.equal(r.ok, true);
});
