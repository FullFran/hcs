// HCS-0008 section 7.1 (R031 to R035): a generation switch is crash-safe and failure marks survive a restart.
// A crash is simulated by making the rename of the `active` pointer throw (before or after it happens); the
// "restart" is a call to the recovery API on the state left on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildPackage } from '../src/package.ts';
import {
  applyDesiredSet, cleanupGenerations, planRecovery, readHostFacts, readHostState, recoverHostState, type Activator,
} from '../src/host-state.ts';
import { HcsFailure } from '../src/errors.ts';
import { TEST_HOST } from './fixtures/host.ts';

const host = TEST_HOST;
class Crash extends Error {}

interface Fixture {
  stateDir: string; storeDir: string;
  entry: (id: string) => Record<string, unknown>;
  catalog: (...entries: unknown[]) => string;
  options: { host: typeof host; stateDir: string; storeDir: string; activator: Activator };
}

function unseal(path: string): void {
  chmodSync(path, 0o700);
  for (const e of readdirSync(path, { withFileTypes: true })) if (e.isDirectory()) unseal(join(path, e.name));
}

function fixture(fn: (f: Fixture) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hcs-recovery-test-'));
    try {
      const source = join(dir, 'source'), storeDir = join(dir, 'store'), stateDir = join(dir, 'state');
      mkdirSync(source); writeFileSync(join(source, 'data'), 'payload');
      const pkg = buildPackage(source); mkdirSync(join(storeDir, 'sha256'), { recursive: true });
      writeFileSync(join(storeDir, 'sha256', pkg.contentHash.slice(7)), pkg.bytes);
      const entry = (id: string) => ({ id: `dev.test.${id}`, version: '1', contentHash: pkg.contentHash, size: pkg.size, mediaType: pkg.mediaType, contributions: [{ kind: 'skill', path: 'data', provides: [`dev.test.${id}.cap@1`] }] });
      const catalog = (...entries: unknown[]) => JSON.stringify({ hcsVersion: '0.1', id: 'dev.test.catalog', version: '1', entries });
      const activator: Activator = { activate: async e => { if (e.id.endsWith('.bad')) throw Error('bad'); }, stop: async () => {} };
      await fn({ stateDir, storeDir, entry, catalog, options: { host, stateDir, storeDir, activator } });
    } finally { unseal(dir); rmSync(dir, { recursive: true, force: true }); }
  };
}

const pointer = (stateDir: string) => existsSync(join(stateDir, 'active')) ? JSON.parse(readFileSync(join(stateDir, 'active'), 'utf8')).generation : null;

// Makes the `nth` (1-based, counted inside `run`) rename of the `active` pointer throw a Crash, before the rename happens or just after it.
async function crashingAt<T>(nth: number, when: 'before' | 'after', run: () => Promise<T>): Promise<void> {
  const original = fs.renameSync;
  let seen = 0;
  fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
    if (basename(String(to)) === 'active' && ++seen === nth) {
      if (when === 'after') original(from, to);
      throw new Crash('simulated crash');
    }
    return original(from, to);
  }) as typeof fs.renameSync;
  syncBuiltinESMExports();
  try { await assert.rejects(run(), Crash); } finally { fs.renameSync = original; syncBuiltinESMExports(); }
}

// Makes every rename of the `active` pointer fail, as a host that cannot change which generation is active.
async function withUnmovablePointer<T>(run: () => Promise<T>): Promise<T> {
  const original = fs.renameSync;
  fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
    if (basename(String(to)) === 'active') throw Object.assign(new Error('EROFS: read-only'), { code: 'EROFS' });
    return original(from, to);
  }) as typeof fs.renameSync;
  syncBuiltinESMExports();
  try { return await run(); } finally { fs.renameSync = original; syncBuiltinESMExports(); }
}

// Generation 1 is applied and confirmed; applying the failing set crashes the host after it records gen 2 as failed
// and before it moves the pointer back (the second pointer write of that run).
async function crashAfterFailedMark(f: Fixture): Promise<void> {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await crashingAt(2, 'before', () => applyDesiredSet(f.catalog(f.entry('bad')), f.options));
}

const checker = (result: boolean) => {
  const calls: number[] = [];
  return { calls, healthCheck: async (generation: number) => { calls.push(generation); return result; } };
};

test('R032: a failure mark persists across a restart and the failed generation is not retried', fixture(async f => {
  await crashAfterFailedMark(f);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 2, confirmed: 1, pending: 2, failed: [2] });
  const { calls, healthCheck } = checker(true);
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck });
  assert.equal(result.action, 'return');
  assert.equal(pointer(f.stateDir), 1);
  assert.deepEqual(calls, [1], 'only the confirmed generation is started');
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: null, failed: [2] });
  assert.equal((await recoverHostState({ stateDir: f.stateDir, healthCheck })).action, 'start');
}));

test('R031: pending and confirmed are recorded before the pointer moves', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await crashingAt(1, 'before', () => applyDesiredSet(f.catalog(f.entry('b')), f.options));
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: 2, failed: [] });
}));

test('R033 item 1: a pending generation that is active at restart is health-checked, not assumed good', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await crashingAt(1, 'after', () => applyDesiredSet(f.catalog(f.entry('b')), f.options));
  assert.deepEqual(readHostFacts(f.stateDir), { active: 2, confirmed: 1, pending: 2, failed: [] });
  // Without a health check the decision is returned and nothing is confirmed.
  const undecided = await recoverHostState({ stateDir: f.stateDir });
  assert.equal(undecided.action, 'health-check');
  assert.deepEqual(readHostFacts(f.stateDir), { active: 2, confirmed: 1, pending: 2, failed: [] });
  const { calls, healthCheck } = checker(true);
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck });
  assert.deepEqual(calls, [2]);
  assert.equal(result.action, 'health-check');
  assert.deepEqual(readHostFacts(f.stateDir), { active: 2, confirmed: 2, pending: null, failed: [] });
}));

test('R033 item 1: a pending generation whose check fails is marked failed and the host returns to the confirmed one', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await crashingAt(1, 'after', () => applyDesiredSet(f.catalog(f.entry('b')), f.options));
  const calls: number[] = [];
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck: async g => { calls.push(g); return g === 1; } });
  assert.deepEqual(calls, [2, 1]);
  assert.equal(pointer(f.stateDir), 1);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: null, failed: [2] });
  assert.equal(result.stopped, null);
}));

test('R033 item 2: a stale pending record is dropped and the active generation kept', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await crashingAt(1, 'before', () => applyDesiredSet(f.catalog(f.entry('b')), f.options));
  const { calls, healthCheck } = checker(true);
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck });
  assert.equal(result.discarded, 2);
  assert.equal(result.action, 'start');
  assert.deepEqual(calls, []);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: null, failed: [] });
}));

test('R033 item 3: an active generation with no record is adopted as pending and health-checked', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  rmSync(join(f.stateDir, 'generation-records.json'));
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: null, pending: null, failed: [] });
  const { calls, healthCheck } = checker(true);
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck });
  assert.equal(result.action, 'health-check');
  assert.deepEqual(calls, [1]);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: null, failed: [] });
}));

test('R035: with no confirmed generation a failing check stops and the failed generation is not started again', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  rmSync(join(f.stateDir, 'generation-records.json'));
  const { calls, healthCheck } = checker(false);
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck });
  assert.equal(result.stopped, 'no-confirmed');
  assert.equal(result.errors[0].code, 'plugin_failed');
  assert.deepEqual(readHostFacts(f.stateDir).failed, [1]);
  assert.equal((await recoverHostState({ stateDir: f.stateDir, healthCheck })).stopped, 'no-confirmed');
  assert.deepEqual(calls, [1], 'the failed generation is checked once, never retried');
}));

test('R016: the confirmed generation is started once; when it fails too the host stops', fixture(async f => {
  await crashAfterFailedMark(f);
  const { calls, healthCheck } = checker(false);
  const result = await recoverHostState({ stateDir: f.stateDir, healthCheck });
  assert.equal(result.stopped, 'return-failed');
  assert.equal(result.errors[0].code, 'plugin_failed');
  assert.deepEqual(calls, [1], 'no further rollback and no retry of the failed generation');
}));

test('R035: a pointer that cannot move stops the host without starting the failed generation', fixture(async f => {
  await crashAfterFailedMark(f);
  const { calls, healthCheck } = checker(true);
  const result = await withUnmovablePointer(() => recoverHostState({ stateDir: f.stateDir, healthCheck }));
  assert.equal(result.stopped, 'pointer-unmovable');
  assert.deepEqual(calls, []);
  assert.equal(readHostFacts(f.stateDir).active, 2);
  assert.deepEqual(readHostFacts(f.stateDir).failed, [2]);
}));

test('state written before the records file existed still loads and applies', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  rmSync(join(f.stateDir, 'generation-records.json'));
  assert.equal(readHostState(f.stateDir).generation, 1);
  assert.equal((await applyDesiredSet(f.catalog(f.entry('b')), f.options)).generation, 2);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 2, confirmed: 2, pending: null, failed: [] });
}));

test('applyDesiredSet keeps its behavior: success confirms, failure rolls back and marks the generation failed', fixture(async f => {
  assert.equal((await applyDesiredSet(f.catalog(f.entry('a')), f.options)).generation, 1);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: null, failed: [] });
  await assert.rejects(applyDesiredSet(f.catalog(f.entry('bad')), f.options), (e: unknown) => e instanceof HcsFailure && e.errors[0].code === 'plugin_failed');
  assert.equal(pointer(f.stateDir), 1);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 1, confirmed: 1, pending: null, failed: [2] });
  assert.equal((await applyDesiredSet(f.catalog(f.entry('c')), f.options)).generation, 3);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 3, confirmed: 3, pending: null, failed: [2] });
}));

test('R034: cleanup keeps the active, pending and confirmed generations and every failed record', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await assert.rejects(applyDesiredSet(f.catalog(f.entry('bad')), f.options));
  await applyDesiredSet(f.catalog(f.entry('c')), f.options);
  assert.deepEqual(cleanupGenerations(f.stateDir), [1, 2]);
  assert.deepEqual(readdirSync(join(f.stateDir, 'generations')).sort(), ['3']);
  assert.deepEqual(readHostFacts(f.stateDir), { active: 3, confirmed: 3, pending: null, failed: [2] });
  assert.equal((await applyDesiredSet(f.catalog(f.entry('d')), f.options)).generation, 4);
}));

test('R034: cleanup does not remove a pending generation', fixture(async f => {
  await applyDesiredSet(f.catalog(f.entry('a')), f.options);
  await crashingAt(1, 'after', () => applyDesiredSet(f.catalog(f.entry('b')), f.options));
  assert.deepEqual(cleanupGenerations(f.stateDir), []);
  assert.deepEqual(readdirSync(join(f.stateDir, 'generations')).sort(), ['1', '2']);
}));

test('planRecovery is the pure decision of HCS-0008 R033', () => {
  const facts = { active: 42, confirmed: 41, pending: 42, failed: [] as number[] };
  assert.deepEqual(planRecovery(facts, [40, 41, 42]), { action: 'health-check', generation: 42, returnTo: 41, retain: [41, 42], failed: [] });
  assert.equal(planRecovery({ ...facts, failed: [42] }).action, 'return');
  assert.equal(planRecovery({ ...facts, failed: [42], confirmed: null }).action, 'stop-and-report');
  assert.equal(planRecovery({ ...facts, pending: 43 }).action, 'discard-pending');
  assert.equal(planRecovery({ ...facts, pending: null }).action, 'health-check');
  assert.equal(planRecovery({ ...facts, pending: null, confirmed: 42 }).action, 'start');
});
