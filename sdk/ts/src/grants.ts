import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { join, posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evaluate, readRequestDocument, type Grant, type PermissionRequest } from './authority.ts';
import type { CatalogEntry } from './catalog.ts';
import { HcsFailure, hcsError } from './errors.ts';
import { isDottedId } from './ids.ts';
import { fetchPackageBytes, readPackageMembers } from './package.ts';

// Grants held by the host, one record per entry and permission (HCS-0005). They live in
// `<data-dir>/grants.json` and are read again on every check, so a revocation applies to the next
// dispatched operation without a restart (HCS-0005-R003).
const GRANTS_FILE = 'grants.json';
// The request document at the root of a package (HCS-0005 request document).
export const REQUEST_DOCUMENT = 'requests.json';
const MAX_REQUEST_DOCUMENT = 65_536;


// `grantable` is the distribution's permission set: only these permissions can be granted to a package,
// and a grants file holding any other permission is invalid.
export function readGrants(dataDir: string, grantable: readonly string[]): Grant[] {
  let text: string;
  try { text = readFileSync(join(dataDir, GRANTS_FILE), 'utf8'); } catch (error: any) { if (error.code === 'ENOENT') return []; throw error; }
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || !('grants' in value) || !Array.isArray(value.grants)) throw new Error('Invalid grants file');
  return value.grants.map((grant: unknown) => {
    if (!grant || typeof grant !== 'object' || !('entry' in grant) || !('permission' in grant)
      || typeof grant.entry !== 'string' || !isDottedId(grant.entry)
      || typeof grant.permission !== 'string' || !grantable.includes(grant.permission)) {
      throw new Error('Invalid grants file');
    }
    return { entry: grant.entry, permission: grant.permission };
  });
}

// Replace the file in one step: write a sibling temp file, fsync, rename.
function writeGrants(dataDir: string, grants: Grant[]): void {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, GRANTS_FILE);
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeSync(fd, `${JSON.stringify({ grants }, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
}

// Administrative: run from the host's shell. A permission outside `grantable` is never granted to a package.
export function grantPermission(dataDir: string, entry: string, permission: string, grantable: readonly string[]): void {
  if (!isDottedId(entry)) throw new Error(`invalid entry id: ${entry}`);
  if (!grantable.includes(permission)) throw new Error(`permission cannot be granted: ${permission}`);
  const grants = readGrants(dataDir, grantable);
  if (!grants.some(grant => grant.entry === entry && grant.permission === permission)) grants.push({ entry, permission });
  writeGrants(dataDir, grants);
}

export function revokePermission(dataDir: string, entry: string, permission: string, grantable: readonly string[]): void {
  const grants = readGrants(dataDir, grantable);
  writeGrants(dataDir, grants.filter(grant => grant.entry !== entry || grant.permission !== permission));
}

// The permissions a verified package requests. No package code runs: the archive is only read.
export function packageRequests(bytes: Uint8Array, entry: CatalogEntry): PermissionRequest[] {
  const members = readPackageMembers(bytes, entry)
    .filter(member => posix.normalize(member.name).replace(/\/$/, '') === REQUEST_DOCUMENT);
  if (members.length === 0) return [];
  if (members.length > 1 || members[0].type !== '0') throw new Error('Invalid request document');
  if (members[0].size > MAX_REQUEST_DOCUMENT) throw new Error('Request document is too large');
  let value: unknown;
  try { value = JSON.parse(members[0].data.toString('utf8')); } catch { throw new Error('Request document is not valid JSON'); }
  return readRequestDocument(value, entry.id);
}

// The lifecycle's default authorization: an entry is authorized only when every permission its
// package requests is granted. A package that requests nothing needs no grant. Aborting `signal`
// aborts the package download.
export function grantAuthorizer(options: { grantsDir: string; storeDir: string; grantable: readonly string[] }): (entry: CatalogEntry, signal?: AbortSignal) => Promise<boolean> {
  return async (entry, signal) => {
    let bytes: Uint8Array;
    try { bytes = await fetchPackageBytes(entry, { storeDir: options.storeDir, signal }); } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : String(error);
      throw new HcsFailure([hcsError('integrity_mismatch', `Package content unavailable: ${reason}`, { entry: entry.id, requirement: 'HCS-0001-R007' })]);
    }
    const requests = packageRequests(bytes, entry);
    const grants = readGrants(options.grantsDir, options.grantable);
    for (const request of requests) {
      const decision = evaluate({ entry: entry.id, permission: request.permission }, grants);
      if (!decision.allow) throw new HcsFailure([decision.error]);
    }
    return true;
  };
}
