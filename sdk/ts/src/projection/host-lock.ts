// Host lock: a host-owned document that can only tighten what a generation gets on an engine. It is an SDK
// extension pending an HCS proposal: HCS-0008 leaves the vocabulary of host-owned settings open (OQ-0008-2),
// so nothing here is an HCS schema. Its format is described in sdk/ts/README.md.
import { PERMISSION_LEVELS, type PermissionLevel, type SecretRef } from './types.ts';

export const HOST_LOCK_FORMAT = 'x-hcs-sdk-host-lock/0.1';

export interface HostLock {
  format: typeof HOST_LOCK_FORMAT;
  // Engine-level names the host owns: a contribution may only narrow them (HCS-0008-R007).
  reserved?: string[];
  // Per contribution kind, the identities that may be projected (for an MCP server, its server.json `name`).
  // A kind that is not listed is not restricted; a kind listed with [] admits nothing.
  allow?: Record<string, string[]>;
  // Per engine-level permission name, the widest level a contribution may set. A contribution may not remove or
  // widen a name under a ceiling.
  ceilings?: Record<string, PermissionLevel>;
  // When present, the only secret grants delivered to the run, each with its environment variable.
  secrets?: SecretRef[];
  // Host-owned environment and arguments of every run; a contribution can neither set nor override them.
  env?: Record<string, string>;
  argv?: string[];
}

const MEMBERS = new Set(['format', 'reserved', 'allow', 'ceilings', 'secrets', 'env', 'argv']);
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const isStringRecord = (value: unknown): value is Record<string, string> => isObject(value) && Object.values(value).every(item => typeof item === 'string');

export function isSecretRef(value: unknown): value is SecretRef {
  return isObject(value) && typeof value.entry === 'string' && typeof value.input === 'string' && typeof value.env === 'string' && ENV_NAME.test(value.env);
}

// Returns one message per problem; an empty list means the value is a host lock.
export function validateHostLock(value: unknown): string[] {
  if (!isObject(value)) return ['host lock must be a JSON object'];
  const problems: string[] = [];
  if (value.format !== HOST_LOCK_FORMAT) problems.push(`format must be "${HOST_LOCK_FORMAT}"`);
  for (const key of Object.keys(value)) if (!MEMBERS.has(key)) problems.push(`unknown member "${key}"`);
  if (value.reserved !== undefined && !isStringArray(value.reserved)) problems.push('reserved must be an array of names');
  if (value.allow !== undefined && !(isObject(value.allow) && Object.values(value.allow).every(isStringArray))) problems.push('allow must map kinds to arrays of identities');
  if (value.ceilings !== undefined && !(isObject(value.ceilings) && Object.values(value.ceilings).every(level => (PERMISSION_LEVELS as readonly unknown[]).includes(level)))) {
    problems.push(`ceilings must map names to one of ${PERMISSION_LEVELS.join(', ')}`);
  }
  if (value.secrets !== undefined && !(Array.isArray(value.secrets) && value.secrets.every(isSecretRef))) problems.push('secrets must be an array of {entry, input, env} with env an environment variable name');
  if (value.env !== undefined && !(isStringRecord(value.env) && Object.keys(value.env).every(name => ENV_NAME.test(name)))) problems.push('env must map environment variable names to strings');
  if (value.argv !== undefined && !isStringArray(value.argv)) problems.push('argv must be an array of strings');
  return problems;
}

export function readHostLock(text: string): HostLock {
  const value: unknown = JSON.parse(text);
  const problems = validateHostLock(value);
  if (problems.length > 0) throw new TypeError(`Invalid host lock: ${problems.join('; ')}`);
  return value as HostLock;
}

export const levelRank = (level: PermissionLevel) => PERMISSION_LEVELS.indexOf(level);
const sameRef = (a: SecretRef, b: SecretRef) => a.entry === b.entry && a.input === b.input && a.env === b.env;

// Lists every way `next` is looser than `previous`; an empty list means `next` only tightens. A host that keeps
// its lock tighten-only refuses a replacement with any widening. `env` and `argv` are host content, not limits,
// and are not compared.
export function lockWidenings(previous: HostLock, next: HostLock): string[] {
  const widenings: string[] = [];
  const reserved = new Set(next.reserved ?? []);
  for (const name of previous.reserved ?? []) if (!reserved.has(name)) widenings.push(`reserved name "${name}" released`);
  for (const [kind, allowed] of Object.entries(previous.allow ?? {})) {
    const nextAllowed = next.allow?.[kind];
    if (nextAllowed === undefined) { widenings.push(`allow-list for kind "${kind}" removed`); continue; }
    for (const identity of nextAllowed) if (!allowed.includes(identity)) widenings.push(`"${identity}" added to the allow-list for kind "${kind}"`);
  }
  for (const [name, level] of Object.entries(previous.ceilings ?? {})) {
    const nextLevel = next.ceilings?.[name];
    if (nextLevel === undefined) widenings.push(`ceiling for "${name}" removed`);
    else if (levelRank(nextLevel) > levelRank(level)) widenings.push(`ceiling for "${name}" raised from ${level} to ${nextLevel}`);
  }
  if (previous.secrets !== undefined) {
    if (next.secrets === undefined) widenings.push('secret restriction removed');
    else for (const ref of next.secrets) if (!previous.secrets.some(old => sameRef(old, ref))) widenings.push(`secret ${ref.input} of ${ref.entry} added as ${ref.env}`);
  }
  return widenings;
}
