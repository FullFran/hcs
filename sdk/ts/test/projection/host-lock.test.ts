import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_LOCK_FORMAT, lockWidenings, projectGeneration, readHostLock, validateHostLock, type HostLock } from '../../src/projection/index.ts';
import { entry, fakeAdapter, generation, POLICY, RUN, SERVER, skill } from './fake-adapter.ts';

const codes = (errors: { code: string; entry?: string }[]) => errors.map(e => `${e.code} ${e.entry}`).sort();
const lock = (extra: Partial<HostLock> = {}): HostLock => ({ format: HOST_LOCK_FORMAT, ...extra });

test('validateHostLock accepts the documented members and names every problem', () => {
  assert.deepEqual(validateHostLock(lock({ reserved: ['skill/host'], allow: { [SERVER]: ['search'] }, ceilings: { 'permission/bash': 'ask' }, secrets: [{ entry: 'dev.example.search', input: 'T', env: 'HCS_T' }], env: { HOME: `${RUN}/home` }, argv: ['--no-discovery'] })), []);
  assert.deepEqual(validateHostLock(lock()), []);
  assert.notDeepEqual(validateHostLock({}), []);
  assert.notDeepEqual(validateHostLock(lock({ ceilings: { x: 'sometimes' as never } })), []);
  assert.notDeepEqual(validateHostLock({ ...lock(), unknown: true }), []);
  assert.notDeepEqual(validateHostLock(lock({ secrets: [{ entry: 'dev.example.search', input: 'T', env: 'not an env name' }] })), []);
  assert.notDeepEqual(validateHostLock(lock({ reserved: [1 as never] })), []);
  assert.throws(() => readHostLock('{"format":"other"}'), TypeError);
  assert.deepEqual(readHostLock(JSON.stringify(lock({ reserved: ['a'] }))), lock({ reserved: ['a'] }));
});

test('reserved names are host-owned: a contribution may only narrow them (R007)', () => {
  const gen = generation(entry('dev.example.notes', skill('host-help')), entry('dev.example.ok', skill('notes')));
  const { report } = projectGeneration(gen, fakeAdapter(), lock({ reserved: ['skill/host-help'] }), { runDir: RUN, activationPolicy: 'partial' });
  assert.deepEqual(codes(report.errors), ['permission_denied dev.example.notes']);
  assert.deepEqual(report.selected, ['dev.example.ok']);
});

test('an allow-list for a kind admits only the listed identities; unlisted kinds stay open', () => {
  const gen = generation(entry('dev.example.a', { kind: SERVER, path: 's', name: 'search' }), entry('dev.example.b', { kind: SERVER, path: 's', name: 'shell' }), entry('dev.example.c', skill('notes')));
  const { report } = projectGeneration(gen, fakeAdapter(), lock({ allow: { [SERVER]: ['search'] } }), { runDir: RUN, activationPolicy: 'partial' });
  assert.deepEqual(codes(report.errors), ['permission_denied dev.example.b']);
  assert.deepEqual(report.selected, ['dev.example.a', 'dev.example.c']);
});

test('a permission ceiling refuses a setting above it, and its removal or widening', () => {
  const policy = (level: string | undefined, effect = 'add') => generation(entry('dev.example.p', { kind: POLICY, path: 'p', settings: [{ name: 'permission/bash', effect, ...(level ? { level } : {}) }] }));
  const ceiling = lock({ ceilings: { 'permission/bash': 'ask' } });
  assert.deepEqual(codes(projectGeneration(policy('allow'), fakeAdapter(), ceiling, { runDir: RUN }).report.errors), ['permission_denied dev.example.p']);
  assert.deepEqual(codes(projectGeneration(policy(undefined, 'widen'), fakeAdapter(), ceiling, { runDir: RUN }).report.errors), ['permission_denied dev.example.p']);
  assert.deepEqual(codes(projectGeneration(policy(undefined, 'remove'), fakeAdapter(), ceiling, { runDir: RUN }).report.errors), ['permission_denied dev.example.p']);
  assert.deepEqual(projectGeneration(policy('ask'), fakeAdapter(), ceiling, { runDir: RUN }).report.errors, []);
  assert.deepEqual(projectGeneration(policy('deny', 'narrow'), fakeAdapter(), ceiling, { runDir: RUN }).report.errors, []);
});

test('lock secrets restrict the granted secrets: a grant the lock does not list is not delivered', () => {
  const gen = generation(entry('dev.example.search', { kind: SERVER, path: 's', name: 'search', secret: 'T' }));
  const grants = [{ entry: 'dev.example.search', input: 'T', env: 'HCS_T' }];
  const listed = projectGeneration(gen, fakeAdapter(), lock({ secrets: grants }), { runDir: RUN, secrets: grants });
  assert.deepEqual(listed.plan.secrets, grants);
  const other = projectGeneration(gen, fakeAdapter(), lock({ secrets: [{ ...grants[0], env: 'HCS_OTHER' }] }), { runDir: RUN, secrets: grants });
  assert.deepEqual(codes(other.report.errors), ['permission_denied dev.example.search']);
  assert.deepEqual(other.plan.secrets, []);
});

test('host-owned environment and arguments come first and win; a contribution that sets a host-owned variable is refused (R007)', () => {
  const gen = generation(entry('dev.example.notes', skill('notes')), entry('dev.example.p', { kind: POLICY, path: 'p', fragment: { env: { HOME: '/home/someone' } } }));
  const { plan, report } = projectGeneration(gen, fakeAdapter(), lock({ env: { HOME: `${RUN}/home` }, argv: ['--no-discovery'] }), { runDir: RUN, activationPolicy: 'partial' });
  assert.deepEqual(codes(report.errors), ['permission_denied dev.example.p']);
  assert.deepEqual(plan.env, { HOME: `${RUN}/home` });
  assert.deepEqual(plan.argv, ['--no-discovery', '--skill', `${RUN}/skills/notes`]);
});

test('lockWidenings lists every way a new lock is looser than the previous one', () => {
  const previous = lock({ reserved: ['skill/host'], allow: { [SERVER]: ['search'] }, ceilings: { 'permission/bash': 'ask' }, secrets: [{ entry: 'dev.x.a', input: 'T', env: 'HCS_T' }] });
  assert.deepEqual(lockWidenings(previous, previous), []);
  assert.deepEqual(lockWidenings(previous, { ...previous, reserved: ['skill/host', 'skill/more'], allow: { [SERVER]: [], [POLICY]: [] }, ceilings: { 'permission/bash': 'deny', other: 'deny' }, secrets: [] }), []);
  assert.equal(lockWidenings(previous, { ...previous, reserved: [] }).length, 1);
  assert.equal(lockWidenings(previous, { ...previous, allow: { [SERVER]: ['search', 'shell'] } }).length, 1);
  assert.equal(lockWidenings(previous, { ...previous, allow: {} }).length, 1);
  assert.equal(lockWidenings(previous, { ...previous, ceilings: { 'permission/bash': 'allow' } }).length, 1);
  assert.equal(lockWidenings(previous, { ...previous, ceilings: {} }).length, 1);
  assert.equal(lockWidenings(previous, { ...previous, secrets: [{ entry: 'dev.x.a', input: 'T', env: 'HCS_T' }, { entry: 'dev.x.b', input: 'T', env: 'HCS_B' }] }).length, 1);
  assert.equal(lockWidenings(previous, { ...previous, secrets: undefined }).length, 1);
});
