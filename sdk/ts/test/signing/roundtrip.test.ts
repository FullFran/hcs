import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvelope, generateKeyPair, signKeySet, verifySignedCatalog, type TrustAnchor } from '../../src/signing/index.ts';
import { readCatalog } from '../../src/catalog.ts';

// Publisher side: an offline root signs the key set; an online key signs the envelope.
const root = generateKeyPair(), online = generateKeyPair(), stranger = generateKeyPair();
const trustAnchor: TrustAnchor = { keys: [{ keyid: 'root-1', keytype: 'ed25519', public: root.publicKey }] };
const keySet = signKeySet({ hcsVersion: '0.1', version: 1, keys: [{ keyid: 'online-1', keytype: 'ed25519', public: online.publicKey, notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' }] },
  [{ keyid: 'root-1', privateKey: root.seed }]);
const assignment = { tenant: 't-0001', profile: 'desktop', channel: 'stable' };
const catalog = { hcsVersion: '0.1', id: 'dev.example.desktop', version: '2026.11.06-1', entries: [
  { id: 'dev.example.notes', version: '1.4.0', contentHash: 'sha256:' + '4f'.repeat(32), size: 18342, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', contributions: [{ kind: 'skill', path: 'skills/take-notes' }] },
] };
const publish = (sequence: number, signer = { keyid: 'online-1', privateKey: online.seed }) =>
  createEnvelope({ sequence, expires: '2026-11-13T00:00:00Z', binding: assignment, catalog }, [signer]);
const validateCatalog = (c: unknown) => { const r = readCatalog(JSON.stringify(c)); return r.ok ? [] : r.errors; };
// Host side: bytes on the wire, parsed and verified.
const host = (envelopeBytes: string, extra: Partial<Parameters<typeof verifySignedCatalog>[0]> = {}) =>
  verifySignedCatalog({ trustAnchor, keySet, envelope: JSON.parse(envelopeBytes), assignment, now: '2026-11-06T12:00:00Z', validateCatalog, ...extra });
const code = (r: ReturnType<typeof verifySignedCatalog>) => (r.ok ? 'accepted' : r.errors[0].code);

test('round trip: a signed catalog verifies and yields the accepted state', () => {
  const r = host(JSON.stringify(publish(42)));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.envelope.accepted.sequence, 42);
    assert.match(r.envelope.accepted.digest, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(r.catalog, catalog);
    assert.equal(r.keySet.accepted.version, 1);
  }
});

test('one changed byte fails with signature_invalid', () => {
  const bytes = JSON.stringify(publish(42));
  const changed = bytes.replace('take-notes', 'take-noteZ');
  assert.equal(changed.length, bytes.length);
  assert.equal(code(host(changed)), 'signature_invalid');
});

test('an expired envelope fails with signature_invalid', () => {
  assert.equal(code(host(JSON.stringify(publish(42)), { now: '2026-11-13T00:00:00Z' })), 'signature_invalid');
});

test('a rolled-back sequence fails with rollback_rejected; the same content again is accepted', () => {
  const first = host(JSON.stringify(publish(42)));
  assert.ok(first.ok);
  const lastAccepted = first.envelope.accepted;
  assert.equal(code(host(JSON.stringify(publish(41)), { lastAccepted })), 'rollback_rejected');
  assert.equal(code(host(JSON.stringify(publish(42)), { lastAccepted })), 'accepted');
  assert.equal(code(host(JSON.stringify(publish(43)), { lastAccepted })), 'accepted');
});

test('an unknown key fails with signature_invalid', () => {
  assert.equal(code(host(JSON.stringify(publish(42, { keyid: 'online-1', privateKey: stranger.seed })))), 'signature_invalid');
  assert.equal(code(host(JSON.stringify(publish(42, { keyid: 'online-9', privateKey: stranger.seed })))), 'signature_invalid');
});
