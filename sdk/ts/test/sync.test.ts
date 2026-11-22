import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPackage } from '../src/package.ts';
import { HcsFailure } from '../src/errors.ts';
import { activeGeneration, type Activator } from '../src/host-state.ts';
import { createEnvelope, generateKeyPair, signKeySet, type TrustAnchor } from '../src/signing/index.ts';
import { AcceptedStateError, fileAcceptedStateStore, syncSigned, type AcceptedState, type AcceptedStateStore, type SignedSource, type SyncOptions } from '../src/sync/index.ts';
import { TEST_HOST } from './fixtures/host.ts';

function unseal(path: string): void {
  chmodSync(path, 0o700);
  for (const d of readdirSync(path, { withFileTypes: true })) if (d.isDirectory()) unseal(join(path, d.name));
}

const root = generateKeyPair(), online = generateKeyPair();
const trustAnchor: TrustAnchor = { keys: [{ keyid: 'root-1', keytype: 'ed25519', public: root.publicKey }] };
const keySet = signKeySet({ hcsVersion: '0.1', version: 1, keys: [{ keyid: 'online-1', keytype: 'ed25519', public: online.publicKey, notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' }] },
  [{ keyid: 'root-1', privateKey: root.seed }]);
const assignment = { tenant: 't-0001', channel: 'stable' };
const now = () => new Date('2026-11-06T12:00:00Z');

type CountingSource = SignedSource & { calls: number };
interface Env {
  stateDir: string;
  entry: Record<string, unknown>;
  publish: (sequence: number, entries?: unknown[]) => unknown;
  options: (envelope: unknown, extra?: Partial<SyncOptions>) => SyncOptions & { source: CountingSource };
}

function withEnv(fn: (e: Env) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hcs-sync-test-'));
    try {
      const src = join(dir, 'src'), storeDir = join(dir, 'store'), stateDir = join(dir, 'state');
      mkdirSync(src); writeFileSync(join(src, 'data'), 'payload');
      const pkg = buildPackage(src); mkdirSync(join(storeDir, 'sha256'), { recursive: true });
      writeFileSync(join(storeDir, 'sha256', pkg.contentHash.slice(7)), pkg.bytes);
      const entry = { id: 'dev.test.a', version: '1', contentHash: pkg.contentHash, size: pkg.size, mediaType: pkg.mediaType, contributions: [{ kind: 'skill', path: 'data', provides: ['dev.test.a.cap@1'] }] };
      const publish = (sequence: number, entries: unknown[] = [entry]) => createEnvelope({
        sequence, expires: '2026-11-13T00:00:00Z', binding: assignment,
        catalog: { hcsVersion: '0.1', id: 'dev.test.catalog', version: String(sequence), entries },
      }, [{ keyid: 'online-1', privateKey: online.seed }]);
      const options = (envelope: unknown, extra: Partial<SyncOptions> = {}) => {
        const source: CountingSource = { calls: 0, keySet: async () => { source.calls++; return keySet; }, envelope: async () => { source.calls++; return envelope; } };
        return { trustAnchor, assignment, now, apply: { host: TEST_HOST, stateDir, storeDir }, ...extra, source: extra.source ?? source } as SyncOptions & { source: CountingSource };
      };
      await fn({ stateDir, entry, publish, options });
    } finally { unseal(dir); rmSync(dir, { recursive: true, force: true }); }
  };
}

const stateFile = (stateDir: string, scope = 'default') => join(stateDir, 'accepted', `${scope}.json`);
const readState = (stateDir: string) => readFileSync(stateFile(stateDir), 'utf8');
const failure = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e; } throw new Error('expected a rejection'); };

test('first sync records the accepted state, then applies', withEnv(async e => {
  const r = await syncSigned(e.options(e.publish(42)));
  assert.equal(r.applied, true);
  assert.equal(r.accepted.envelope.sequence, 42);
  assert.equal(r.accepted.keySet.version, 1);
  const rec = JSON.parse(readState(e.stateDir));
  assert.equal(rec.format, 'hcs-accepted-state/1');
  assert.equal(rec.envelope.sequence, 42);
  assert.equal(rec.keySet.version, 1);
  assert.match(rec.envelope.digest, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(activeGeneration(e.stateDir), null);
}));

test('an identical re-sync is accepted and leaves the state untouched', withEnv(async e => {
  const env = e.publish(42);
  await syncSigned(e.options(env));
  const before = readState(e.stateDir);
  const writes: string[] = [];
  const inner = fileAcceptedStateStore(e.stateDir);
  const store: AcceptedStateStore = { read: s => inner.read(s), write: async (s, st) => { writes.push(s); await inner.write(s, st); } };
  const r = await syncSigned(e.options(env, { store }));
  assert.equal(r.accepted.envelope.sequence, 42);
  assert.equal(readState(e.stateDir), before);
  assert.deepEqual(writes, []);
}));

test('a rollback is rejected and the state is unchanged, also after a restart', withEnv(async e => {
  await syncSigned(e.options(e.publish(42)));
  const before = readState(e.stateDir);
  const err = await failure(syncSigned(e.options(e.publish(41), { store: fileAcceptedStateStore(e.stateDir) })));
  assert.ok(err instanceof HcsFailure);
  assert.equal(err.errors[0].code, 'rollback_rejected');
  assert.equal(err.errors[0].requirement, 'HCS-0007-R008');
  assert.equal(readState(e.stateDir), before);
}));

test('same sequence with other content is rejected', withEnv(async e => {
  await syncSigned(e.options(e.publish(42)));
  const before = readState(e.stateDir);
  const err = await failure(syncSigned(e.options(e.publish(42, [{ ...e.entry, version: '2' }]))));
  assert.equal((err as HcsFailure).errors[0].code, 'rollback_rejected');
  assert.equal(readState(e.stateDir), before);
}));

test('a tampered envelope is rejected and nothing is written', withEnv(async e => {
  const tampered = JSON.parse(JSON.stringify(e.publish(42)));
  tampered.catalog.version = 'tampered';
  const err = await failure(syncSigned(e.options(tampered)));
  assert.ok(err instanceof HcsFailure);
  assert.equal(err.errors[0].code, 'signature_invalid');
  assert.equal(existsSync(stateFile(e.stateDir)), false);
  assert.equal(activeGeneration(e.stateDir), null);
}));

test('a catalog that fails HCS-0001 does not advance the state (R015)', withEnv(async e => {
  await syncSigned(e.options(e.publish(41)));
  const before = readState(e.stateDir);
  const err = await failure(syncSigned(e.options(e.publish(43, [e.entry, e.entry]))));
  assert.equal((err as HcsFailure).errors[0].code, 'duplicate_entry');
  assert.equal(readState(e.stateDir), before);
  const r = await syncSigned(e.options(e.publish(42)));
  assert.equal(r.accepted.envelope.sequence, 42);
}));

test('a corrupt state file fails closed before any fetch or apply', withEnv(async e => {
  mkdirSync(join(e.stateDir, 'accepted'), { recursive: true });
  writeFileSync(stateFile(e.stateDir), '{"format": "hcs-accepted-st');
  const opts = e.options(e.publish(42));
  const err = await failure(syncSigned(opts));
  assert.ok(err instanceof AcceptedStateError);
  assert.equal(opts.source.calls, 0);
  assert.equal(activeGeneration(e.stateDir), null);
  assert.equal(readState(e.stateDir), '{"format": "hcs-accepted-st');
}));

test('a malformed or future-format record is rejected, not treated as empty', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-sync-state-'));
  try {
    mkdirSync(join(dir, 'accepted'));
    const store = fileAcceptedStateStore(dir);
    const digest = 'sha256:' + 'a'.repeat(64);
    const bad = [
      '{"format":"hcs-accepted-state/2"}',
      `{"format":"hcs-accepted-state/1","envelope":{"sequence":1.5,"digest":"${digest}"}}`,
      '{"format":"hcs-accepted-state/1","envelope":{"sequence":1,"digest":"sha256:ABC"}}',
      `{"format":"hcs-accepted-state/1","keySet":{"version":9007199254740992,"digest":"${digest}"}}`,
      '[]', '',
    ];
    for (const text of bad) {
      writeFileSync(join(dir, 'accepted', 'default.json'), text);
      await assert.rejects(store.read('default'), AcceptedStateError, text);
    }
    rmSync(join(dir, 'accepted', 'default.json'));
    assert.deepEqual(await store.read('default'), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('file store: atomic write leaves no temp files, scopes are independent and checked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-sync-state-'));
  try {
    const store = fileAcceptedStateStore(dir);
    const a: AcceptedState = { envelope: { sequence: 1, digest: 'sha256:' + 'a'.repeat(64) } };
    const b: AcceptedState = { keySet: { version: 2, digest: 'sha256:' + 'b'.repeat(64) } };
    await store.write('one', a); await store.write('two', b); await store.write('one', a);
    assert.deepEqual(await store.read('one'), a);
    assert.deepEqual(await store.read('two'), b);
    assert.deepEqual(readdirSync(join(dir, 'accepted')).sort(), ['one.json', 'two.json']);
    for (const scope of ['../x', '.', '..', '', 'a/b', 'a'.repeat(129)]) {
      await assert.rejects(store.read(scope), TypeError, scope);
      await assert.rejects(store.write(scope, a), TypeError, scope);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an apply failure after verification keeps the accepted state', withEnv(async e => {
  const activator: Activator = { activate: async () => { throw Error('start failed'); }, stop: async () => {} };
  const env = e.publish(42);
  const opts = e.options(env);
  opts.apply.activator = activator;
  const err = await failure(syncSigned(opts));
  assert.ok(err instanceof HcsFailure);
  assert.equal(JSON.parse(readState(e.stateDir)).envelope.sequence, 42);
  // An older envelope stays rejected; the same one may be retried.
  const old = await failure(syncSigned(e.options(e.publish(41))));
  assert.equal((old as HcsFailure).errors[0].code, 'rollback_rejected');
  const retry = await syncSigned(e.options(env));
  assert.equal(retry.applied, true);
}));

test('verifyOnly records the state and applies nothing', withEnv(async e => {
  const r = await syncSigned(e.options(e.publish(42), { verifyOnly: true }));
  assert.equal(r.applied, false);
  assert.equal(JSON.parse(readState(e.stateDir)).envelope.sequence, 42);
  assert.equal(activeGeneration(e.stateDir), null);
}));

test('a source failure propagates and writes nothing', withEnv(async e => {
  const source: SignedSource = { keySet: async () => { throw new Error('unreachable'); }, envelope: async () => ({}) };
  await assert.rejects(syncSigned(e.options(null, { source })), /unreachable/);
  assert.equal(existsSync(stateFile(e.stateDir)), false);
}));
