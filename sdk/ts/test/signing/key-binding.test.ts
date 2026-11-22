// HCS-0007-R030: a key with a `binding` counts toward the R005 threshold only for envelopes whose
// binding has every member of it with an equal value. A key without `binding` is unrestricted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindingCovers, checkKeySetShape, createEnvelope, createKeySet, generateKeyPair, signKeySet, verifyEnvelope, verifyKeySet,
  type OnlineKey, type SigningError,
} from '../../src/signing/index.ts';

const now = '2026-11-06T12:00:00Z';
const window = { notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' };
const root = generateKeyPair(), one = generateKeyPair(), two = generateKeyPair();
const anchor = { keys: [{ keyid: 'root-1', keytype: 'ed25519' as const, public: root.publicKey }] };
const stable = { tenant: 't-0001', profile: 'desktop', channel: 'stable' };
const key = (keyid: string, pub: string, binding?: Record<string, string>): OnlineKey =>
  ({ keyid, keytype: 'ed25519', public: pub, ...window, ...(binding ? { binding } : {}) });
const noCatalogErrors = () => [];

function verified(keys: OnlineKey[], threshold = 1) {
  const r = verifyKeySet(signKeySet({ hcsVersion: '0.1', version: 3, threshold, keys }, [{ keyid: 'root-1', privateKey: root.seed }]), { trustAnchor: anchor, now });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  return r.keySet;
}

function verdict(keys: OnlineKey[], binding: Record<string, string>, signers: ('online-1' | 'online-2')[], threshold = 1): SigningError | null {
  const seeds = { 'online-1': one.seed, 'online-2': two.seed };
  const env = createEnvelope({ sequence: 42, expires: '2026-11-13T00:00:00Z', binding, catalog: { hcsVersion: '0.1', entries: [] } },
    signers.map(keyid => ({ keyid, privateKey: seeds[keyid] })));
  const r = verifyEnvelope(env, { keySet: verified(keys, threshold), assignment: binding, now, validateCatalog: noCatalogErrors });
  if (r.ok) return null;
  assert.equal(r.step, 2);
  return r.errors[0];
}

test('bindingCovers: no scope covers every binding; a scope is matched member by member, by equality', () => {
  assert.equal(bindingCovers(undefined, stable), true);
  assert.equal(bindingCovers({ channel: 'stable' }, stable), true);
  assert.equal(bindingCovers({ ...stable }, stable), true);
  assert.equal(bindingCovers({ channel: 'beta' }, stable), false);
  assert.equal(bindingCovers({ channel: 'stable', tenant: 't-0002' }, stable), false, 'every member must match, not one');
  assert.equal(bindingCovers({ region: 'eu' }, stable), false);
  assert.equal(bindingCovers({ channel: 'stabl' }, stable), false, 'no prefix or pattern matching');
  assert.equal(bindingCovers({ channel: 'stable*' }, stable), false, 'no glob');
});

test('bindingCovers only reads own members: inherited names never match', () => {
  for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(bindingCovers({ [name]: 'x' }, stable), false, name);
    assert.equal(bindingCovers({ [name]: Object.prototype[name as keyof object] as unknown as string }, stable), false, name);
  }
  const parsed = JSON.parse('{"__proto__":"x"}') as Record<string, string>;
  assert.equal(Object.hasOwn(parsed, '__proto__'), true);
  assert.equal(bindingCovers(parsed, stable), false);
  assert.equal(bindingCovers(parsed, JSON.parse('{"__proto__":"x","channel":"stable"}')), true);
  assert.equal(bindingCovers({ constructor: 'x' } as Record<string, string>, { constructor: 'x' } as Record<string, string>), true);
});

test('a key binding is shape-checked with the envelope binding grammar (R002)', () => {
  const ks = (binding: unknown) => ({ hcsVersion: '0.1', version: 1, keys: [{ ...key('online-1', one.publicKey), binding }] });
  assert.deepEqual(checkKeySetShape(ks({ channel: 'stable' })), []);
  for (const bad of [{}, { channel: 1 }, { channel: '' }, { Channel: 'stable' }, { '1channel': 'stable' }, ['stable'], 'stable', null, { channel: 'a'.repeat(257) }]) {
    const errors = checkKeySetShape(ks(bad));
    assert.deepEqual(errors.map(e => [e.code, e.requirement]), [['manifest_invalid', 'HCS-0007-R002']], JSON.stringify(bad));
  }
});

test('a scoped key counts for an envelope whose binding has its members (R030)', () => {
  assert.equal(verdict([key('online-1', one.publicKey, { channel: 'stable' })], stable, ['online-1']), null);
  assert.equal(verdict([key('online-1', one.publicKey)], stable, ['online-1']), null, 'a key without binding is unrestricted');
});

test('a key scoped to another binding does not count: signature_invalid at step 2 (R030, R005)', () => {
  const a = { ...stable, tenant: 't-0001' };
  const scopedToB = [key('online-1', one.publicKey, { tenant: 't-0002' })];
  assert.equal(verdict(scopedToB, a, ['online-1'])?.code, 'signature_invalid');
  const partial = [key('online-1', one.publicKey, { tenant: 't-0001', channel: 'beta' })];
  assert.equal(verdict(partial, stable, ['online-1'])?.code, 'signature_invalid', 'one member of two matches');
});

test('with threshold 2 a scoped and an unscoped key both count, an out-of-scope one does not', () => {
  const inScope = [key('online-1', one.publicKey, { channel: 'stable' }), key('online-2', two.publicKey)];
  assert.equal(verdict(inScope, stable, ['online-1', 'online-2'], 2), null);
  const outOfScope = [key('online-1', one.publicKey, { channel: 'beta' }), key('online-2', two.publicKey)];
  assert.equal(verdict(outOfScope, stable, ['online-1', 'online-2'], 2)?.code, 'signature_invalid');
  assert.equal(verdict(outOfScope, stable, ['online-2'], 1), null, 'the unscoped key alone meets threshold 1');
});

test('createKeySet builds, checks and signs a key set whose keys may carry a binding', () => {
  const ks = createKeySet({ version: 4, threshold: 1, keys: [key('online-1', one.publicKey, { channel: 'stable' })], extensions: { 'x-note': 'hi' } },
    [{ keyid: 'root-1', privateKey: root.seed }]);
  assert.equal(ks.hcsVersion, '0.1');
  assert.deepEqual(ks.keys[0].binding, { channel: 'stable' });
  assert.equal(ks['x-note'], 'hi');
  assert.equal(ks.signatures.length, 1);
  assert.equal(verifyKeySet(ks, { trustAnchor: anchor, now }).ok, true);
  assert.throws(() => createKeySet({ version: 4, keys: [key('online-1', one.publicKey, {})] }, []), TypeError);
  assert.throws(() => createKeySet({ version: 0, keys: [key('online-1', one.publicKey)] }, []), TypeError);
});
