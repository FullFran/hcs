// HCS-0007 R004 (number spelling), R002 (key set version before shape), R022 (one item per keyid in
// `signatures`) and R023 (host bounds). Each rule asserts the error code, the cited requirement and,
// where the rule says so, that the outcome was reached before any signature was verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, parseStrictJson, signEnvelope, signKeySet, verifyEnvelope, verifyKeySet, checkKeySetShape, checkEnvelopeShape } from '../../src/signing/index.ts';
import type { SigningError } from '../../src/signing/index.ts';

const now = '2026-11-06T12:00:00Z';
const root = generateKeyPair(), online = generateKeyPair(), online2 = generateKeyPair(), stranger = generateKeyPair();
const anchor = { keys: [{ keyid: 'root-1', keytype: 'ed25519' as const, public: root.publicKey }] };
const window = { notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' };
const key = (keyid: string, k: { publicKey: string }) => ({ keyid, keytype: 'ed25519', public: k.publicKey, ...window });
const keySetDoc = (keys = [key('online-1', online)], threshold = 1) =>
  signKeySet({ hcsVersion: '0.1', version: 3, threshold, keys }, [{ keyid: 'root-1', privateKey: root.seed }]);
const envelopeDoc = () => ({ hcsVersion: '0.1', sequence: 5, expires: '2026-11-13T00:00:00Z', binding: { tenant: 't-0001' }, catalog: { hcsVersion: '0.1', entries: [] } });
const verified = (ks = keySetDoc()) => {
  const r = verifyKeySet(ks, { trustAnchor: anchor, now });
  assert.ok(r.ok);
  return r.keySet;
};
const assignment = { tenant: 't-0001' };
const noCatalogErrors = () => [];
const only = (errors: SigningError[]) => { assert.equal(errors.length, 1); return errors[0]; };
const failure = (r: { ok: boolean; errors?: SigningError[] }) => { assert.equal(r.ok, false); return only(r.errors!); };

const plainDocument = (n: number) => `{"x-n":${n}}`;

// R004 -------------------------------------------------------------------------------------------

test('R004: a number token that is not a plain integer is refused whatever its value', () => {
  const spelled = ['1.0', '1e2', '1E2', '100e-2', '-0', '0.0', '1e-400', '1.0000000000000000001', '1e+2', '-0.0'];
  for (const token of spelled) {
    const r = parseStrictJson(`{"x-n":${token}}`);
    assert.equal(r.ok, false, token);
    if (!r.ok) {
      const e = only(r.errors);
      assert.equal(e.code, 'manifest_invalid', token);
      assert.equal(e.requirement, 'HCS-0007-R004', token);
    }
  }
  // Nested in an array and in the embedded catalog, at any depth.
  assert.equal(parseStrictJson('{"catalog":{"entries":[[1,2,[3.0]]]}}').ok, false);
});

test('R004: plain integers in the safe range are accepted, and string content is not a number', () => {
  const ok = parseStrictJson('{"a":0,"b":-12,"c":9007199254740991,"d":-9007199254740991,"e":[1,2],"f":"1.0e5","1.0":"-0"}');
  assert.deepEqual(ok, { ok: true, value: { a: 0, b: -12, c: 9007199254740991, d: -9007199254740991, e: [1, 2], f: '1.0e5', '1.0': '-0' } });
  assert.equal(parseStrictJson(plainDocument(1)).ok, true);
});

test('R004: the error names an offset and never quotes the text', () => {
  const r = parseStrictJson('{"secret-marker":1.0}');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.errors[0].message, /offset 17/);
    assert.equal(r.errors[0].message.includes('secret-marker'), false);
  }
  const dup = parseStrictJson('{"secret-marker":1,"secret-marker":2}');
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.errors[0].message.includes('secret-marker'), false);
  const syntax = parseStrictJson('{"secret-marker":nope}');
  assert.equal(syntax.ok, false);
  if (!syntax.ok) assert.equal(syntax.errors[0].message.includes('secret-marker'), false);
});

test('R004 does not change what the strict parser refused before', () => {
  const refused: [string | Uint8Array, string][] = [
    ['{"a":1,"a":2}', 'HCS-0007-R003'], ['{"a":9007199254740992}', 'HCS-0007-R003'], ['"\\ud800"', 'HCS-0007-R003'],
    ['{', 'HCS-0007-R003'], [new Uint8Array([0x22, 0xff, 0x22]), 'HCS-0007-R003'],
  ];
  for (const [input, requirement] of refused) {
    const r = parseStrictJson(input);
    assert.equal(r.ok, false);
    if (!r.ok) { assert.equal(only(r.errors).code, 'manifest_invalid'); assert.equal(r.errors[0].requirement, requirement); }
  }
  assert.deepEqual(parseStrictJson('{"a":{"a":1},"b":"\\ud83d\\ude00"}'), { ok: true, value: { a: { a: 1 }, b: '\u{1F600}' } });
});

// R002: version before shape for a key set ----------------------------------------------------------

test('R002: a key set with another hcsVersion is unsupported_hcs_version, read before the shape', () => {
  const noKeys = verifyKeySet({ hcsVersion: '0.2', version: 3 }, { trustAnchor: anchor, now });
  const e = failure(noKeys);
  assert.equal(e.code, 'unsupported_hcs_version');
  assert.equal(e.requirement, 'HCS-0007-R002');
  assert.equal(only(checkKeySetShape({ hcsVersion: '0.2' })).code, 'unsupported_hcs_version');
  // The same version with the same missing member keeps its previous verdict.
  const same = failure(verifyKeySet({ hcsVersion: '0.1', version: 3 }, { trustAnchor: anchor, now }));
  assert.equal(same.code, 'manifest_invalid');
  assert.equal(same.requirement, 'HCS-0007-R002');
  // A document that is not an object has no readable version.
  assert.equal(failure(verifyKeySet('0.2', { trustAnchor: anchor, now })).code, 'manifest_invalid');
});

// R022 ---------------------------------------------------------------------------------------------

function twoItems(doc: any, order: 'invalid-first' | 'valid-first') {
  const good = doc.signatures[0];
  const bad = { keyid: good.keyid, sig: good.sig.startsWith('A') ? 'B' + good.sig.slice(1) : 'A' + good.sig.slice(1) };
  return { ...doc, signatures: order === 'invalid-first' ? [bad, good] : [good, bad] };
}

test('R022: a repeated keyid in signatures is manifest_invalid in either order, before any verification', () => {
  const ks = verified();
  const signed = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }]);
  for (const order of ['invalid-first', 'valid-first'] as const) {
    const r = verifyEnvelope(twoItems(signed, order), { keySet: ks, assignment, now, validateCatalog: noCatalogErrors });
    const e = failure(r);
    // A verifier that tried signatures first would answer signature_invalid or accept the valid-first list.
    assert.equal(e.code, 'manifest_invalid', order);
    assert.equal(e.requirement, 'HCS-0007-R022', order);
    assert.equal(!r.ok && r.step, 1, order);
    const k = failure(verifyKeySet(twoItems(keySetDoc(), order), { trustAnchor: anchor, now }));
    assert.equal(k.code, 'manifest_invalid', order);
    assert.equal(k.requirement, 'HCS-0007-R022', order);
  }
  // The identical item twice is a repeat as well.
  const same = { ...signed, signatures: [signed.signatures[0], signed.signatures[0]] };
  assert.equal(failure(verifyEnvelope(same, { keySet: ks, assignment, now, validateCatalog: noCatalogErrors })).requirement, 'HCS-0007-R022');
  // The message names positions, not the keyid.
  const m = failure(verifyEnvelope(twoItems(signed, 'valid-first'), { keySet: ks, assignment, now, validateCatalog: noCatalogErrors })).message;
  assert.match(m, /signatures\[1\].*signatures\[0\]/);
  assert.equal(m.includes('online-1'), false);
});

test('R022 keeps distinct keyids working: threshold still counts distinct public keys', () => {
  const ks = verified(keySetDoc([key('online-1', online), key('online-2', online2)], 2));
  const both = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }, { keyid: 'online-2', privateKey: online2.seed }]);
  assert.equal(verifyEnvelope(both, { keySet: ks, assignment, now, validateCatalog: noCatalogErrors }).ok, true);
  // Previous behaviour: a valid signature by an unknown key next to a valid one is not an error by itself.
  const one = verified();
  const extra = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }, { keyid: 'stranger', privateKey: stranger.seed }]);
  assert.equal(verifyEnvelope(extra, { keySet: one, assignment, now, validateCatalog: noCatalogErrors }).ok, true);
  // Previous behaviour: one key under two keyids still counts once.
  const alias = verified(keySetDoc([key('online-1', online), key('online-alias', online)], 2));
  const twice = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }, { keyid: 'online-alias', privateKey: online.seed }]);
  assert.equal(failure(verifyEnvelope(twice, { keySet: alias, assignment, now, validateCatalog: noCatalogErrors })).code, 'signature_invalid');
});

// R023 ---------------------------------------------------------------------------------------------

test('R023: a document over a host bound is manifest_invalid before any verification, at the bound it is accepted', () => {
  const ks = verified(keySetDoc([key('online-1', online), key('online-2', online2)], 2));
  const both = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }, { keyid: 'online-2', privateKey: online2.seed }]);
  const run = (maxSignatures: number) => verifyEnvelope(both, { keySet: ks, assignment, now, validateCatalog: noCatalogErrors, limits: { maxSignatures } });
  assert.equal(run(2).ok, true);
  // Both signatures are valid and meet the threshold; only the bound refuses the envelope.
  const over = run(1);
  const e = failure(over);
  assert.equal(e.code, 'manifest_invalid');
  assert.equal(e.requirement, 'HCS-0007-R023');
  assert.equal(!over.ok && over.step, 1);

  const twoKeys = keySetDoc([key('online-1', online), key('online-2', online2)], 1);
  assert.equal(verifyKeySet(twoKeys, { trustAnchor: anchor, now, limits: { maxKeys: 2, maxSignatures: 1 } }).ok, true);
  const k = failure(verifyKeySet(twoKeys, { trustAnchor: anchor, now, limits: { maxKeys: 1 } }));
  assert.equal(k.code, 'manifest_invalid');
  assert.equal(k.requirement, 'HCS-0007-R023');
  assert.equal(failure(verifyKeySet(twoKeys, { trustAnchor: anchor, now, limits: { maxSignatures: 0 } })).requirement, 'HCS-0007-R023');
});

test('R023: no limits means no bound, and a bound does not change the order of the other checks', () => {
  const ks = verified(keySetDoc([key('online-1', online), key('online-2', online2)], 2));
  const both = signEnvelope(envelopeDoc(), [{ keyid: 'online-1', privateKey: online.seed }, { keyid: 'online-2', privateKey: online2.seed }]);
  assert.equal(verifyEnvelope(both, { keySet: ks, assignment, now, validateCatalog: noCatalogErrors, limits: {} }).ok, true);
  // Version before shape before R022 before R023.
  const dup = twoItems(both, 'valid-first');
  assert.equal(only(checkEnvelopeShape({ ...dup, hcsVersion: '0.2' }, { maxSignatures: 1 })).code, 'unsupported_hcs_version');
  assert.equal(only(checkEnvelopeShape({ ...dup, sequence: 0 }, { maxSignatures: 1 })).requirement, 'HCS-0007-R001');
  assert.equal(only(checkEnvelopeShape(dup, { maxSignatures: 1 })).requirement, 'HCS-0007-R022');
  assert.equal(only(checkEnvelopeShape(both, { maxSignatures: 1 })).requirement, 'HCS-0007-R023');
  assert.deepEqual(checkEnvelopeShape(both), []);
});
