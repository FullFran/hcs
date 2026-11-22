import { createHash, randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalBytes, type AcceptedEnvelope, type AcceptedKeySet } from '../signing/index.ts';
import { assertAssignment } from '../signing/shape.ts';

// What a host keeps between runs (HCS-0007 section 3.3). Either part is absent until first acceptance.
export interface AcceptedState {
  keySet?: AcceptedKeySet;
  envelope?: AcceptedEnvelope;
}

// Where accepted state lives. `scope` is an opaque string chosen by the host ("default" for one binding).
// A host that is or was enrolled for more than one assignment keeps one scope per assignment and
// compares only with the scope of the assignment it verifies for (HCS-0007-R031): `assignmentScope`.
export interface AcceptedStateStore {
  read(scope: string): Promise<AcceptedState>;
  // Must be durable (survive a crash after returning) and atomic (never leave a torn record).
  write(scope: string, state: AcceptedState): Promise<void>;
}

// The stored record is unreadable or malformed. It is never treated as "no state": that would
// let a corrupted file switch off the rollback checks of HCS-0007-R008 and R012.
export class AcceptedStateError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AcceptedStateError';
  }
}

export const ACCEPTED_STATE_FORMAT = 'hcs-accepted-state/1';
const SCOPE = /^[A-Za-z0-9._-]{1,128}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function checkScope(scope: string): string {
  if (typeof scope !== 'string' || !SCOPE.test(scope) || scope === '.' || scope === '..') {
    throw new TypeError(`Not a valid accepted-state scope: ${String(scope)}`);
  }
  return scope;
}

const isCounter = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const isDigest = (d: unknown): d is string => typeof d === 'string' && DIGEST.test(d);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseRecord(text: string, file: string): AcceptedState {
  const bad = (why: string, cause?: unknown): never => { throw new AcceptedStateError(`Accepted state ${file} is unusable: ${why}`, { cause }); };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (cause) { return bad('not valid JSON', cause); }
  if (!isObject(raw)) return bad('not an object');
  if (raw.format !== ACCEPTED_STATE_FORMAT) return bad(`unsupported format ${JSON.stringify(raw.format)}`);
  const state: AcceptedState = {};
  if (raw.keySet !== undefined) {
    const k = raw.keySet;
    if (!isObject(k) || !isCounter(k.version) || !isDigest(k.digest)) return bad('invalid keySet');
    state.keySet = { version: k.version, digest: k.digest };
  }
  if (raw.envelope !== undefined) {
    const e = raw.envelope;
    if (!isObject(e) || !isCounter(e.sequence) || !isDigest(e.digest)) return bad('invalid envelope');
    state.envelope = { sequence: e.sequence, digest: e.digest };
  }
  return state;
}

function fsyncDir(dir: string): void {
  // Directories cannot be opened for fsync on Windows; the rename is still atomic there.
  if (process.platform === 'win32') return;
  const fd = openSync(dir, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

// `<dir>/accepted/<scope>.json`, written through a temp file in the same directory, fsync and rename.
// A missing file is the first run (`{}`); a file that exists but cannot be read or validated throws.
export function fileAcceptedStateStore(dir: string): AcceptedStateStore {
  const base = join(dir, 'accepted');
  return {
    async read(scope) {
      const file = join(base, `${checkScope(scope)}.json`);
      let text: string;
      try { text = readFileSync(file, 'utf8'); } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return {};
        throw new AcceptedStateError(`Accepted state ${file} cannot be read`, { cause });
      }
      return parseRecord(text, file);
    },
    async write(scope, state) {
      const file = join(base, `${checkScope(scope)}.json`);
      const record: Record<string, unknown> = { format: ACCEPTED_STATE_FORMAT };
      if (state.keySet) record.keySet = { version: state.keySet.version, digest: state.keySet.digest };
      if (state.envelope) record.envelope = { sequence: state.envelope.sequence, digest: state.envelope.digest };
      mkdirSync(base, { recursive: true, mode: 0o700 });
      const tmp = join(base, `.${scope}.${randomBytes(6).toString('hex')}.tmp`);
      const fd = openSync(tmp, 'wx', 0o600);
      try {
        try { writeSync(fd, `${JSON.stringify(record)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(tmp, file);
      } catch (error) {
        try { unlinkSync(tmp); } catch { /* the temp file may not exist */ }
        throw error;
      }
      fsyncDir(base);
    },
  };
}

/**
 * The scope of the accepted state of one assignment (HCS-0007-R031): `assignment-` and the hex sha256
 * of the RFC 8785 serialization of the assignment. Two assignments get the same scope exactly when
 * they are equal as R006 defines it (same member names, same values). Throws TypeError on a value
 * that is not a binding.
 */
export function assignmentScope(assignment: Readonly<Record<string, string>>): string {
  assertAssignment(assignment);
  return `assignment-${createHash('sha256').update(canonicalBytes(assignment)).digest('hex')}`;
}
