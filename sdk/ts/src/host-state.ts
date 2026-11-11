import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { readCatalog, type CatalogEntry } from './catalog.ts';
import { HcsFailure, hcsError, type HcsError } from './errors.ts';
import { checkDetailPrefix, DEFAULT_DETAIL_PREFIX } from './extensions.ts';
import { grantAuthorizer } from './grants.ts';
import type { HostProfile } from './host.ts';
import { canTransition, type EntryState, type EntryStatus } from './lifecycle.ts';
import { fetchPackageBytes, sealTree, unpackPackage } from './package.ts';
import { resolve } from './resolve.ts';

// Starts and stops prepared entries. Both calls receive a signal that the host aborts when the step
// exceeds its deadline; an activator MUST stop its work when the signal aborts (HCS-0004-R007).
export interface Activator {
  activate(entry: CatalogEntry, dir: string, signal: AbortSignal): Promise<void>;
  stop(entry: CatalogEntry, signal: AbortSignal): Promise<void>;
}
export interface ApplyOptions {
  stateDir: string;
  storeDir?: string;
  // The host profile resolution runs against (HCS-0003); the SDK has no default host.
  host: HostProfile;
  activator?: Activator;
  // Authorization hook. The default authorizes an entry only when every permission its package
  // requests is granted in `<grantsDir>/grants.json` (HCS-0005); an HcsFailure it throws is reported as is.
  // The signal aborts when the step exceeds its deadline.
  authorize?: (entry: CatalogEntry, signal: AbortSignal) => Promise<boolean>;
  // Where the default authorization reads grants; defaults to `stateDir`.
  grantsDir?: string;
  // Permissions the default authorization accepts in the grants file; defaults to none, so a package
  // that requests any permission is refused until the caller passes its permission set.
  grantable?: readonly string[];
  // Extension prefix of the `details` members of reported errors; defaults to `x-hcs-sdk`.
  detailPrefix?: string;
  stepDeadlineMs?: number;
}
export interface ApplyResult { generation: number; status: EntryStatus[] }
export interface GenerationRecord { catalog: { id: string; version: string }; entries: CatalogEntry[] }
export interface HostState { generation: number | null; record: GenerationRecord | null; entries: EntryStatus[] }

// Runs no package code: activating an entry only makes its provided capabilities callable.
export const NO_CODE_ACTIVATOR: Activator = { activate: async () => {}, stop: async () => {} };
export const DEFAULT_STEP_DEADLINE_MS = 30_000;

// Another writer holds the state directory. A host refusal, not an HCS error.
export class HostBusyError extends Error {
  readonly code = 'host_busy';
  readonly holder: number | undefined;
  constructor(holder: number | undefined, message?: string) {
    super(message ?? (holder === undefined ? 'Host state is locked by another writer' : `Host state is locked by process ${holder}`));
    this.name = 'HostBusyError';
    this.holder = holder;
  }
}

// When a takeover mutex was left by a process that is no longer alive, it must be removed by hand.
export class HostTakeoverLockError extends HostBusyError {
  readonly takeoverPath: string;
  constructor(takeoverPath: string, holder: number | undefined) {
    const holderMsg = holder === undefined ? 'dead process' : `process ${holder}`;
    super(holder, `Host lock takeover was abandoned by ${holderMsg}; remove ${takeoverPath} by hand`);
    this.name = 'HostTakeoverLockError';
    this.takeoverPath = takeoverPath;
  }
}

const generationsDir = (stateDir: string) => join(stateDir, 'generations');
const generationDir = (stateDir: string, n: number) => join(generationsDir(stateDir), String(n));
export const entryDir = (stateDir: string, n: number, entry: string) => join(generationDir(stateDir, n), 'entries', entry);

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error: any) { if (error.code === 'ENOENT') return undefined; throw error; }
}

// Replace a small file in one step: write a sibling temp file, fsync, rename.
function writeAtomic(dir: string, name: string, value: unknown): void {
  const temp = join(dir, `.${name}.${randomBytes(8).toString('hex')}.tmp`);
  const fd = openSync(temp, 'wx', 0o644);
  try { writeSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, join(dir, name));
}

export function activeGeneration(stateDir: string): number | null {
  const pointer = readJson(join(stateDir, 'active')) as { generation?: unknown } | undefined;
  return pointer && Number.isSafeInteger(pointer.generation) ? pointer.generation as number : null;
}
export function readGeneration(stateDir: string, n: number): GenerationRecord {
  return JSON.parse(readFileSync(join(generationDir(stateDir, n), 'generation.json'), 'utf8')) as GenerationRecord;
}

interface StatusFile { generation: number | null; entries: EntryStatus[] }

// The pointed generation with the persisted state of its entries. Persistence across restarts is
// open in HCS (OQ-0004-4): without a status written for that generation its entries are `prepared`.
export function readHostState(stateDir: string): HostState {
  const generation = activeGeneration(stateDir);
  if (generation === null) return { generation, record: null, entries: [] };
  const record = readGeneration(stateDir, generation);
  const saved = readJson(join(stateDir, 'status.json')) as StatusFile | undefined;
  const known = saved?.generation === generation ? new Map(saved.entries.map(s => [s.entry, s])) : new Map<string, EntryStatus>();
  const entries = record.entries.map(e => known.get(e.id) ?? { entry: e.id, version: e.version, state: 'prepared' as EntryState });
  return { generation, record, entries };
}

// Statuses of the active generation's entries in activation order, followed by entries that failed
// in the last transition and are not part of the active generation (HCS-0004-R002).
export function statusReport(stateDir: string): EntryStatus[] {
  const saved = readJson(join(stateDir, 'status.json')) as StatusFile | undefined;
  return saved?.entries ?? [];
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error: any) { return error.code === 'EPERM'; }
}

// The start time of a process (field 22 of /proc/<pid>/stat on Linux), so a reused PID is not
// mistaken for the writer that left a lock. Undefined where it cannot be read.
function processStart(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // The command name (field 2) may hold spaces and parentheses; the fields after it follow the last ')'.
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    return start && /^[0-9]+$/.test(start) ? start : undefined;
  } catch { return undefined; }
}

// A lock is held while its process is alive and, when both start times are known, is the same process.
// Locks written before the start time was recorded only have `pid`.
function held(pid: number, start: string | undefined): boolean {
  if (!alive(pid)) return false;
  const current = start === undefined ? undefined : processStart(pid);
  return current === undefined || current === start;
}

function checkTakeoverMutex(takeoverPath: string): void {
  let content: string;
  try {
    content = readFileSync(takeoverPath, 'utf8');
  } catch (error: any) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  let pid: number | undefined, start: string | undefined;
  try {
    const value = JSON.parse(content);
    if (Number.isSafeInteger(value.pid) && value.pid > 0) pid = value.pid;
    if (typeof value.start === 'string') start = value.start;
  } catch { /* being written */ }
  if (pid === undefined) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    try {
      content = readFileSync(takeoverPath, 'utf8');
      const value = JSON.parse(content);
      if (Number.isSafeInteger(value.pid) && value.pid > 0) pid = value.pid;
      if (typeof value.start === 'string') start = value.start;
    } catch (retryError: any) {
      if (retryError.code === 'ENOENT') return;
    }
  }
  if (pid === undefined) {
    throw new HostBusyError(undefined, `Host lock takeover is being written: ${takeoverPath}; retry later`);
  }
  if (held(pid, start)) {
    throw new HostBusyError(pid);
  }
  throw new HostTakeoverLockError(takeoverPath, pid);
}

// Single writer for the host's installed state. A lock whose process is gone is taken over.
function acquireLock(stateDir: string): () => void {
  mkdirSync(stateDir, { recursive: true });
  const path = join(stateDir, 'lock');
  const takeoverPath = join(stateDir, 'lock.takeover');
  for (let attempt = 0; attempt < 3; attempt++) {
    checkTakeoverMutex(takeoverPath);
    let fd: number;
    try { fd = openSync(path, 'wx', 0o644); } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      let content: string;
      try { content = readFileSync(path, 'utf8'); } catch (readError: any) { if (readError.code === 'ENOENT') continue; throw readError; }
      let pid: number | undefined, start: string | undefined;
      try {
        const value = JSON.parse(content);
        if (Number.isSafeInteger(value.pid) && value.pid > 0) pid = value.pid;
        if (typeof value.start === 'string') start = value.start;
      } catch { /* a lock being written */ }
      if (pid === undefined || held(pid, start)) throw new HostBusyError(pid);
      // To remove a stale lock, a process must first hold the takeover mutex.
      let takeoverFd: number;
      try {
        takeoverFd = openSync(takeoverPath, 'wx', 0o644);
      } catch (takeoverError: any) {
        if (takeoverError.code !== 'EEXIST') throw takeoverError;
        checkTakeoverMutex(takeoverPath);
        continue;
      }
      const myStart = processStart(process.pid);
      const takeoverContent = JSON.stringify({ pid: process.pid, ...(myStart === undefined ? {} : { start: myStart }), at: new Date().toISOString() });
      try { writeSync(takeoverFd, takeoverContent); fsyncSync(takeoverFd); } finally { closeSync(takeoverFd); }
      try {
        let currentLock: string | undefined;
        try { currentLock = readFileSync(path, 'utf8'); } catch (readErr: any) { if (readErr.code !== 'ENOENT') throw readErr; }
        if (currentLock === content && !held(pid, start)) {
          unlinkSync(path);
        }
      } finally {
        try {
          if (readFileSync(takeoverPath, 'utf8') === takeoverContent) {
            unlinkSync(takeoverPath);
          }
        } catch (unlinkErr: any) {
          if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
        }
      }
      continue;
    }
    const start = processStart(process.pid);
    const content = JSON.stringify({ pid: process.pid, ...(start === undefined ? {} : { start }), at: new Date().toISOString() });
    try { writeSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
    // Release only our own lock.
    return () => {
      try { if (readFileSync(path, 'utf8') === content) unlinkSync(path); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    };
  }
  throw new HostBusyError(undefined);
}

type StepResult<T> = { ok: true; value: T } | { ok: false; timeout: boolean; error: unknown };
const DEADLINE = Symbol('deadline');

// Runs one lifecycle step under the deadline. On expiry the signal is aborted and the step is
// abandoned: the host does not wait for it any longer.
async function runStep<T>(deadlineMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<StepResult<T>> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const work = Promise.resolve().then(() => fn(controller.signal));
  work.catch(() => {});
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(DEADLINE), deadlineMs); });
  expired.catch(() => {});
  try { return { ok: true, value: await Promise.race([work, expired]) }; }
  catch (error) {
    if (error === DEADLINE) { controller.abort(new Error('Lifecycle step deadline exceeded')); return { ok: false, timeout: true, error }; }
    return { ok: false, timeout: false, error };
  } finally { clearTimeout(timer); }
}

const reason = (error: unknown) => error instanceof Error && error.message ? error.message : String(error);

function stepError(prefix: string, step: string, entry: string, result: { timeout: boolean; error: unknown }, rollback: boolean): HcsError {
  const details = rollback ? { details: { [`${prefix}-rollback`]: 'incomplete' } } : {};
  if (result.timeout) return hcsError('timeout', `Step ${step} exceeded the deadline`, { entry, requirement: 'HCS-0004-R007', ...details });
  return hcsError('plugin_failed', `Step ${step} failed: ${reason(result.error)}`, { entry, ...(rollback ? { requirement: 'HCS-0004-R003' } : {}), ...details });
}

function unsealTree(dir: string): void {
  chmodSync(dir, 0o700);
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) unsealTree(join(dir, entry.name));
}

// Generation numbers are never reused, so a number always names one generation even after the host
// removes old or failed ones. The last number handed out is persisted before the generation is prepared;
// the directory scan only covers state written before this record existed.
function nextGeneration(stateDir: string, current: number | null): number {
  const last = readJson(join(stateDir, 'last-generation')) as { generation?: unknown } | null;
  let max = Math.max(current ?? 0, last && Number.isSafeInteger(last.generation) ? last.generation as number : 0);
  for (const name of readdirSync(generationsDir(stateDir))) if (/^[1-9][0-9]*$/.test(name)) max = Math.max(max, Number(name));
  writeAtomic(stateDir, 'last-generation', { generation: max + 1 });
  return max + 1;
}

class Statuses {
  readonly stateDir: string;
  generation: number | null;
  entries: EntryStatus[];
  extras: EntryStatus[] = [];
  constructor(stateDir: string, generation: number | null, entries: EntryStatus[]) {
    this.stateDir = stateDir; this.generation = generation; this.entries = entries;
  }
  save(): void {
    const ids = new Set(this.entries.map(s => s.entry));
    writeAtomic(this.stateDir, 'status.json', { generation: this.generation, entries: [...this.entries, ...this.extras.filter(s => !ids.has(s.entry))] });
  }
}

function move(status: EntryStatus, to: EntryState, error?: HcsError): void {
  if (!canTransition(status.state, to)) throw new Error(`Invalid lifecycle transition ${status.state} -> ${to}`);
  status.state = to;
  if (error) status.error = error; else delete status.error;
}
const fresh = (e: CatalogEntry): EntryStatus => ({ entry: e.id, version: e.version, state: 'discovered' });

// Moves the host from its active desired set to the set in `catalogBytes` as one transition
// (HCS-0004-R003): the new set is prepared as a new immutable generation, the pointer switches in
// one step, and any entry failing to reach `active` rolls every entry back.
export async function applyDesiredSet(catalogBytes: Uint8Array | string, options: ApplyOptions): Promise<ApplyResult> {
  checkDetailPrefix(options.detailPrefix ?? DEFAULT_DETAIL_PREFIX);
  const release = acquireLock(options.stateDir);
  try { return await transition(catalogBytes, options); } finally { release(); }
}

async function transition(catalogBytes: Uint8Array | string, options: ApplyOptions): Promise<ApplyResult> {
  const { stateDir } = options;
  const host = options.host, activator = options.activator ?? NO_CODE_ACTIVATOR;
  const prefix = options.detailPrefix ?? DEFAULT_DETAIL_PREFIX;
  const deadline = options.stepDeadlineMs ?? DEFAULT_STEP_DEADLINE_MS;
  const storeDir = options.storeDir ?? join(stateDir, 'store');
  const authorize = options.authorize ?? grantAuthorizer({ grantsDir: options.grantsDir ?? stateDir, storeDir, grantable: options.grantable ?? [] });
  mkdirSync(generationsDir(stateDir), { recursive: true });

  const previous = readHostState(stateDir);
  const view = new Statuses(stateDir, previous.generation, previous.entries.map(s => ({ ...s })));
  const reject = (failed: EntryStatus[], errors: HcsError[]): never => {
    view.extras = failed; view.save();
    throw new HcsFailure(errors);
  };

  const read = readCatalog(catalogBytes, undefined, prefix);
  if (!read.ok) throw new HcsFailure(read.errors);
  const catalog = read.catalog;
  const statuses = new Map(catalog.entries.map(e => [e.id, fresh(e)]));
  for (const status of statuses.values()) move(status, 'validated');

  // All-or-nothing: any resolution error leaves the previous generation active (HCS-0003-R008).
  const resolution = resolve(catalog, host);
  if (resolution.errors.length) {
    const failed: EntryStatus[] = [];
    for (const error of resolution.errors) {
      const status = error.entry === undefined ? undefined : statuses.get(error.entry);
      if (status && status.state !== 'failed') { move(status, 'failed', error); failed.push(status); }
    }
    reject(failed, resolution.errors);
  }
  const byId = new Map(catalog.entries.map(e => [e.id, e]));
  const selected = resolution.selected.map(id => byId.get(id)!);
  for (const e of selected) move(statuses.get(e.id)!, 'resolved');

  const denied: HcsError[] = [];
  for (const e of selected) {
    const result = await runStep(deadline, signal => authorize(e, signal));
    const error = !result.ok ? (result.timeout ? stepError(prefix, 'authorize', e.id, result, false)
      : result.error instanceof HcsFailure ? { ...result.error.errors[0], entry: e.id }
      : hcsError('permission_denied', `Authorization failed: ${reason(result.error)}`, { entry: e.id }))
      : result.value ? undefined : hcsError('permission_denied', 'Entry is not authorized', { entry: e.id });
    move(statuses.get(e.id)!, error ? 'failed' : 'authorized', error);
    if (error) denied.push(error);
  }
  if (denied.length) reject(selected.map(e => statuses.get(e.id)!).filter(s => s.state === 'failed'), denied);

  // Prepare a NEW generation directory; content of a prepared generation is never modified (HCS-0007-R017).
  // No package code runs before this point (HCS-0004-R001).
  const n = nextGeneration(stateDir, previous.generation);
  const partial = join(generationsDir(stateDir), `.${n}.partial-${randomBytes(8).toString('hex')}`);
  mkdirSync(join(partial, 'entries'), { recursive: true });
  try {
    for (const e of selected) {
      const result = await runStep(deadline, signal => fetchPackageBytes(e, { storeDir, signal }));
      let error: HcsError | undefined;
      if (!result.ok) error = result.timeout ? stepError(prefix, 'prepare', e.id, result, false) : hcsError('integrity_mismatch', `Package content unavailable: ${reason(result.error)}`, { entry: e.id, requirement: 'HCS-0001-R007' });
      else {
        try { unpackPackage(result.value, e, join(partial, 'entries', e.id), {}, prefix); } catch (unpackError) {
          if (!(unpackError instanceof HcsFailure)) throw unpackError;
          error = { ...unpackError.errors[0], entry: e.id };
        }
      }
      if (error) { move(statuses.get(e.id)!, 'failed', error); reject([statuses.get(e.id)!], [error]); }
      move(statuses.get(e.id)!, 'prepared');
    }
    const record: GenerationRecord = { catalog: { id: catalog.id, version: catalog.version }, entries: selected };
    writeFileSync(join(partial, 'generation.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    sealTree(partial);
    renameSync(partial, generationDir(stateDir, n));
  } catch (error) {
    unsealTree(partial); rmSync(partial, { recursive: true, force: true });
    throw error;
  }

  const errors: HcsError[] = [];
  const oldEntries = (previous.record?.entries ?? []).map((e, i) => ({ entry: e, status: view.entries[i] }));
  const stoppedOld: typeof oldEntries = [];

  // Stop the previous generation in reverse activation order (HCS-0004-R004).
  const stopAll = async (list: { entry: CatalogEntry; status: EntryStatus }[], rollback: boolean) => {
    for (const { entry, status } of [...list].reverse()) {
      if (status.state !== 'active') continue;
      move(status, 'draining'); view.save();
      const result = await runStep(deadline, signal => activator.stop(entry, signal));
      if (result.ok) { move(status, 'stopped'); view.save(); continue; }
      const error = stepError(prefix, 'stop', entry.id, result, rollback);
      move(status, 'failed', error); view.save(); errors.push(error);
      if (!rollback) return false;
    }
    return true;
  };
  for (const item of oldEntries) if (item.status.state === 'active') stoppedOld.push(item);

  const started: { entry: CatalogEntry; status: EntryStatus }[] = [];
  // HCS-0008-R031: the generation being tried and the one to return to are on disk before the pointer moves.
  // A host with no records yet vouches for the generation it is leaving (section 7.1).
  const records: Records = readRecords(stateDir) ?? { confirmed: previous.generation, pending: null, failed: [], stopped: null };
  let moved = false;
  let ok = await stopAll(oldEntries, false);
  if (ok) {
    writeRecords(stateDir, { ...records, pending: n, stopped: null }); // a new desired set ends a recorded stop (R016)
    writeAtomic(stateDir, 'active', { generation: n });
    moved = true;
    view.generation = n; view.entries = selected.map(e => statuses.get(e.id)!); view.save();
    for (const e of selected) {
      const status = statuses.get(e.id)!;
      const result = await runStep(deadline, signal => activator.activate(e, entryDir(stateDir, n, e.id), signal));
      if (result.ok) { move(status, 'active'); started.push({ entry: e, status }); view.save(); continue; }
      const error = stepError(prefix, 'activate', e.id, result, false);
      move(status, 'failed', error); view.save(); errors.push(error);
      ok = false; break;
    }
  }
  if (ok) {
    writeRecords(stateDir, { ...records, confirmed: n, pending: null, stopped: null });
    view.extras = []; view.save();
    return { generation: n, status: statusReport(stateDir) };
  }

  // HCS-0008-R032: the failed mark is durable before anything is started from the previous generation.
  const marked: Records = moved ? { ...records, stopped: null, pending: n, failed: [...new Set([...records.failed, n])].sort((a, b) => a - b) } : records;
  if (moved) writeRecords(stateDir, marked);

  // Roll back (HCS-0004-R003): stop what this transition started, restore the pointer, restart the previous set.
  await stopAll(started, true);
  if (previous.generation === null) rmSync(join(stateDir, 'active'), { force: true });
  else writeAtomic(stateDir, 'active', { generation: previous.generation });
  // R032: never restart a generation recorded as failed. The host stays stopped on it and reports (R035).
  const stayStopped = previous.generation !== null && marked.failed.includes(previous.generation);
  if (moved || stayStopped) writeRecords(stateDir, { ...marked, pending: null, stopped: stayStopped ? { generation: previous.generation!, reason: 'no-confirmed' } : marked.stopped });
  view.generation = previous.generation; view.entries = oldEntries.map(o => o.status); view.extras = selected.map(e => statuses.get(e.id)!).filter(s => s.state === 'failed'); view.save();
  for (const { entry, status } of stoppedOld) {
    if (status.state !== 'stopped' || stayStopped) continue;
    const result = await runStep(deadline, signal => activator.activate(entry, entryDir(stateDir, previous.generation!, entry.id), signal));
    // A restarted entry returns to the state it had before the transition began.
    if (result.ok) { status.state = 'active'; delete status.error; }
    else { const error = stepError(prefix, 'activate', entry.id, result, true); status.state = 'failed'; status.error = error; errors.push(error); }
    view.save();
  }
  throw new HcsFailure(errors);
}
// ---- Crash-safe generation switch and persisted failure marks (HCS-0008 section 7.1) ----

// The facts a host reconstructs after a restart, as generation ids. `active` is the pointer; the other three
// are the records file. No file format is implied by HCS; this one is internal to the SDK.
// A stop recorded under HCS-0008-R016 or R035: the host starts nothing until a new desired set or an operator action.
export interface RecordedStop { generation: number; reason: 'no-confirmed' | 'return-failed' }
export interface HostFacts { active: number | null; confirmed: number | null; pending: number | null; failed: number[]; stopped: RecordedStop | null }
// What planRecovery needs; `stopped` may be left out.
export type HostFactsInput = Omit<HostFacts, 'stopped'> & { stopped?: RecordedStop | null };
export type RecoveryAction = 'start' | 'health-check' | 'discard-pending' | 'return' | 'stop-and-report';
export interface RecoveryPlan { action: RecoveryAction; generation: number | null; returnTo: number | null; retain: number[]; failed: number[] }

const RECORDS = 'generation-records.json';
interface Records { confirmed: number | null; pending: number | null; failed: number[]; stopped: RecordedStop | null }

const generationId = (value: unknown): number | null => Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;

// Undefined when the host never recorded these facts (state written before this section existed).
function readRecords(stateDir: string): Records | undefined {
  const saved = readJson(join(stateDir, RECORDS)) as { confirmed?: unknown; pending?: unknown; failed?: unknown; stopped?: { generation?: unknown; reason?: unknown } | null } | undefined;
  if (!saved) return undefined;
  const failed = Array.isArray(saved.failed) ? saved.failed.filter(g => generationId(g) !== null) as number[] : [];
  const stoppedGeneration = generationId(saved.stopped?.generation);
  const stopped: RecordedStop | null = stoppedGeneration !== null && (saved.stopped?.reason === 'no-confirmed' || saved.stopped?.reason === 'return-failed')
    ? { generation: stoppedGeneration, reason: saved.stopped.reason } : null;
  return { confirmed: generationId(saved.confirmed), pending: generationId(saved.pending), failed: [...new Set(failed)].sort((a, b) => a - b), stopped };
}
const writeRecords = (stateDir: string, records: Records): void => writeAtomic(stateDir, RECORDS, records);

export function readHostFacts(stateDir: string): HostFacts {
  const records = readRecords(stateDir) ?? { confirmed: null, pending: null, failed: [], stopped: null };
  return { active: activeGeneration(stateDir), ...records };
}

function generationsOnDisk(stateDir: string): number[] {
  try { return readdirSync(generationsDir(stateDir)).filter(name => /^[1-9][0-9]*$/.test(name)).map(Number).sort((a, b) => a - b); }
  catch (error: any) { if (error.code === 'ENOENT') return []; throw error; }
}

// What a host does after a restart, from its persisted facts alone (HCS-0008-R033), and the generations a
// cleanup must keep (R034). Mirrors conformance/runner/recovery.py. A failed generation is never started (R032),
// so item 4 outranks item 1. `health-check` is for the caller to run: the check is host-defined (R013).
export function planRecovery(facts: HostFactsInput, onDisk: readonly number[] = []): RecoveryPlan {
  const { active, confirmed, pending } = facts;
  const failed = [...new Set(facts.failed)].sort((a, b) => a - b);
  const present = new Set(onDisk);
  const retain = [...new Set([active, pending, confirmed].filter((g): g is number => g !== null && present.has(g)))].sort((a, b) => a - b);
  const canReturn = confirmed !== null && confirmed !== active && !failed.includes(confirmed);
  const plan = (action: RecoveryAction, generation: number | null): RecoveryPlan => ({ action, generation, returnTo: confirmed, retain, failed });
  if (facts.stopped) return plan('stop-and-report', active); // R033 item 5: a recorded stop outranks every other item
  if (active === null) return pending !== null ? plan('discard-pending', pending) : plan('start', null);
  if (failed.includes(active)) return plan(canReturn ? 'return' : 'stop-and-report', active);
  if (pending === active) return plan('health-check', active);
  if (pending !== null) return plan('discard-pending', pending);
  if (active !== confirmed) return plan('health-check', active);
  return plan('start', active);
}

export interface RecoveryOptions {
  stateDir: string;
  // The host's health check of the engine run started from a generation (HCS-0008-R013); true when it passes.
  // Without it recovery returns the decision of R033 items 1 and 3 and confirms nothing.
  healthCheck?: (generation: number, signal: AbortSignal) => Promise<boolean>;
  stepDeadlineMs?: number;
}
export interface RecoveryResult {
  action: RecoveryAction;
  // The generation the host runs from when recovery ends (the pointer).
  active: number | null;
  // A pending record that was discarded (R033 item 2).
  discarded: number | null;
  // Why the host stopped (R016, R035), or null. The host starts nothing until a new desired set or an operator action.
  stopped: 'no-confirmed' | 'pointer-unmovable' | 'return-failed' | null;
  // The failures to report as R015 requires: `plugin_failed` or `timeout`.
  errors: HcsError[];
}

// Completes what a restart finds half done (HCS-0008-R033), under the host lock. The health check is the
// caller's; one failed generation is returned from once (R015) and never started again (R032).
export async function recoverHostState(options: RecoveryOptions): Promise<RecoveryResult> {
  const release = acquireLock(options.stateDir);
  try { return await recover(options); } finally { release(); }
}

async function recover(options: RecoveryOptions): Promise<RecoveryResult> {
  const { stateDir } = options;
  const deadline = options.stepDeadlineMs ?? DEFAULT_STEP_DEADLINE_MS;
  const result: RecoveryResult = { action: 'start', active: null, discarded: null, stopped: null, errors: [] };
  const check = async (generation: number): Promise<boolean> => {
    const run = options.healthCheck!;
    const step = await runStep(deadline, signal => run(generation, signal));
    if (step.ok && step.value) return true;
    result.errors.push(!step.ok && step.timeout
      ? hcsError('timeout', `Health check of generation ${generation} exceeded the deadline`, { requirement: 'HCS-0008-R015' })
      : hcsError('plugin_failed', step.ok ? `Health check of generation ${generation} failed` : `Health check of generation ${generation} failed: ${reason(step.error)}`, { requirement: 'HCS-0008-R015' }));
    return false;
  };
  const finish = (action: RecoveryAction, stopped: RecoveryResult['stopped'] = null): RecoveryResult => {
    result.action = action; result.stopped = stopped; result.active = activeGeneration(stateDir);
    return result;
  };
  const records = (): Records => readRecords(stateDir) ?? { confirmed: null, pending: null, failed: [], stopped: null };

  let plan = planRecovery(readHostFacts(stateDir), generationsOnDisk(stateDir));
  if (plan.action === 'discard-pending') {
    result.discarded = plan.generation;
    writeRecords(stateDir, { ...records(), pending: null });
    plan = planRecovery(readHostFacts(stateDir), generationsOnDisk(stateDir));
  }
  let action = plan.action;
  if (action === 'health-check') {
    if (!options.healthCheck) return finish('health-check');
    const generation = plan.generation!;
    if (await check(generation)) {
      writeRecords(stateDir, { ...records(), confirmed: generation, pending: null });
      return finish('health-check');
    }
    // Record the failure before anything else happens (R032), then return from it.
    const current = records();
    writeRecords(stateDir, { ...current, failed: [...new Set([...current.failed, generation])].sort((a, b) => a - b) });
    plan = planRecovery(readHostFacts(stateDir), generationsOnDisk(stateDir));
    action = plan.action;
  }
  if (action === 'stop-and-report') {
    // R035 and R016: the stop is durable, so a restart reports it instead of starting anything.
    const current = records();
    const stop: RecordedStop = current.stopped ?? { generation: plan.generation ?? activeGeneration(stateDir) ?? 0, reason: 'no-confirmed' };
    if (!current.stopped) writeRecords(stateDir, { ...current, pending: null, stopped: stop });
    else result.errors.push(hcsError('plugin_failed', `The host is stopped on generation ${stop.generation} (${stop.reason}) until a new desired set or an operator action`, { requirement: 'HCS-0008-R016' }));
    return finish(action, stop.reason);
  }
  if (action === 'return') {
    const target = plan.returnTo!;
    try { writeAtomic(stateDir, 'active', { generation: target }); } catch { return finish(action, 'pointer-unmovable'); }
    writeRecords(stateDir, { ...records(), pending: null });
    // One engine run from the confirmed generation; if it fails too the host stops (R016) and does not roll back again.
    if (options.healthCheck && !await check(target)) {
      writeRecords(stateDir, { ...records(), stopped: { generation: target, reason: 'return-failed' } });
      return finish(action, 'return-failed');
    }
  }
  return finish(action);
}

// Removes generation directories the host no longer needs (HCS-0008-R034): it keeps the active, pending and
// confirmed generations and every failed record, and removes the content of failed generations too.
export function cleanupGenerations(stateDir: string): number[] {
  const release = acquireLock(stateDir);
  try {
    const keep = new Set(planRecovery(readHostFacts(stateDir), generationsOnDisk(stateDir)).retain);
    const removed = generationsOnDisk(stateDir).filter(n => !keep.has(n));
    for (const n of removed) { unsealTree(generationDir(stateDir, n)); rmSync(generationDir(stateDir, n), { recursive: true, force: true }); }
    return removed;
  } finally { release(); }
}


// An operator action ends a recorded stop (HCS-0008-R016); a new desired set ends it too.
export function clearStop(stateDir: string): void {
  const release = acquireLock(stateDir);
  try {
    const current = readRecords(stateDir);
    if (current?.stopped) writeRecords(stateDir, { ...current, stopped: null });
  } finally { release(); }
}
