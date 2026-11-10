import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { HcsFailure, hcsError } from './errors.ts';
import { checkDetailPrefix, DEFAULT_DETAIL_PREFIX } from './extensions.ts';
import { readTar, writeTar, TarUnsafeNameError, type TarInput } from './tar.ts';

export interface PackageExpected { size: number; contentHash: string; contentId?: string }
export interface PackageLimits { maxBytes?: number; maxMembers?: number }
const mediaType = 'application/vnd.oci.image.layer.v1.tar+gzip';
const hashPattern = /^(sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128})$/;
function failure(message: string, requirement = 'HCS-0001-R007'): never { throw new HcsFailure([hcsError('integrity_mismatch', message, { requirement })]); }
function unsafe(prefix: string, name: string, reason: string): never {
  throw new HcsFailure([hcsError('integrity_mismatch', 'Unsafe archive member', { details: { [`${prefix}-archive`]: 'unsafe-member', [`${prefix}-member`]: name, [`${prefix}-reason`]: reason } })]);
}
export function buildPackage(dir: string) {
  const members: TarInput[] = [];
  function walk(path: string, prefix: string) {
    for (const name of readdirSync(path)) {
      const full = join(path, name), relative = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(full);
      if (stat.isDirectory()) { members.push({ name: relative, type: 'directory' }); walk(full, relative); }
      else if (stat.isFile()) members.push({ name: relative, data: readFileSync(full), executable: (stat.mode & 0o100) !== 0 });
      else throw new Error(`Unsupported source member: ${relative}`);
    }
  }
  if (!lstatSync(dir).isDirectory()) throw new Error('Package source must be a directory');
  walk(dir, ''); const tar = writeTar(members), bytes = gzipSync(tar, { level: 9 });
  return { bytes, contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, contentId: `sha256:${createHash('sha256').update(tar).digest('hex')}`, size: bytes.length, mediaType };
}
function verifyTransport(bytes: Uint8Array, expected: PackageExpected): void {
  if (bytes.length !== expected.size) failure('Package size does not match');
  if (!hashPattern.test(expected.contentHash)) failure('Invalid package content hash');
  const [algorithm, digest] = expected.contentHash.split(':');
  if (createHash(algorithm).update(bytes).digest('hex') !== digest) failure('Package digest does not match');
}
// Shared by verification, extraction and grant request reading. The cap bounds the entire
// decompressed stream, including headers and padding, not only regular-file payloads.
const DEFAULT_TAR_LIMIT = 256 * 1024 * 1024 + 10000 * 1023 + 1024;
export function verifiedPackageTar(bytes: Uint8Array, expected: PackageExpected, maxOutputLength = DEFAULT_TAR_LIMIT): Buffer {
  verifyTransport(bytes, expected);
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 0) throw new RangeError('Invalid package decompression limit');
  const hasIdentity = expected.contentId !== undefined;
  if (hasIdentity && (typeof expected.contentId !== 'string' || !hashPattern.test(expected.contentId) || expected.contentId.endsWith('\n'))) failure('Invalid package content identity', 'HCS-0001-R018');
  let tar: Buffer;
  try {
    tar = gunzipSync(bytes, { maxOutputLength: Math.max(1, maxOutputLength) });
    if (tar.length > maxOutputLength) throw new Error('Package decompression limit exceeded');
  }
  catch (error) {
    if (hasIdentity) failure('Package content identity could not be verified', 'HCS-0001-R018');
    throw error;
  }
  if (hasIdentity) {
    const [algorithm, digest] = expected.contentId!.split(':');
    if (createHash(algorithm).update(tar).digest('hex') !== digest) failure('Package content identity does not match', 'HCS-0001-R018');
  }
  return tar;
}
export function verifyPackage(bytes: Uint8Array, expected: PackageExpected): void {
  if (expected.contentId === undefined) verifyTransport(bytes, expected);
  else verifiedPackageTar(bytes, expected);
}
export function sealTree(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sealTree(path);
    else if (entry.isFile()) chmodSync(path, lstatSync(path).mode & 0o111 ? 0o555 : 0o444);
    else throw new Error('Cannot seal non-regular member');
  }
  chmodSync(dir, 0o555);
}
// lstat, not existsSync: a dangling symlink at the target must also count as taken.
function taken(path: string): boolean {
  try { lstatSync(path); return true; } catch (error: any) { if (error.code === 'ENOENT') return false; throw error; }
}
function unsealTree(dir: string): void {
  chmodSync(dir, 0o700);
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) unsealTree(join(dir, entry.name));
}
// `detailPrefix` names the extension members of an unsafe-member error (`<prefix>-archive`, `-member`, `-reason`).
export function unpackPackage(bytes: Uint8Array, expected: PackageExpected, targetDir: string, limits: PackageLimits = {}, detailPrefix = DEFAULT_DETAIL_PREFIX): void {
  const prefix = checkDetailPrefix(detailPrefix);
  verifyTransport(bytes, expected);
  const maxBytes = limits.maxBytes ?? 256 * 1024 * 1024, maxMembers = limits.maxMembers ?? 10000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(maxMembers) || maxMembers < 0) throw new RangeError('Invalid package limits');
  if (taken(targetDir)) throw new Error('Package target already exists');
  // Allow each member a header and up to one padding block, plus the terminator.
  const cap = Math.min(maxBytes + maxMembers * 1023 + 1024, 0x7fffffff);
  let members: ReturnType<typeof readTar>;
  try { members = readTar(verifiedPackageTar(bytes, expected, cap)); }
  catch (error) {
    if (error instanceof TarUnsafeNameError) unsafe(prefix, error.memberName, 'invalid path');
    throw error;
  }
  if (members.length > maxMembers) throw new Error('Package member limit exceeded');
  let total = 0; const names = new Set<string>();
  for (const member of members) {
    const name = member.name;
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').includes('..')) unsafe(prefix, name, 'invalid path');
    const normalized = posix.normalize(name).replace(/\/$/, '');
    if (!normalized || normalized === '.' || names.has(normalized)) unsafe(prefix, name, 'duplicate or empty path');
    names.add(normalized);
    if (name.split('/').some(part => part.startsWith('.wh.'))) unsafe(prefix, name, 'whiteout');
    if (member.type !== '0' && member.type !== '5') unsafe(prefix, name, 'unsupported type');
    if (member.type === '5' && member.size !== 0) unsafe(prefix, name, 'directory data');
    total += member.size; if (total > maxBytes) throw new Error('Package size limit exceeded');
  }
  const partial = `${targetDir}.partial-${randomBytes(16).toString('hex')}`;
  mkdirSync(partial, { mode: 0o700 });
  try {
    for (const member of members) {
      const dest = join(partial, member.name);
      if (member.type === '5') mkdirSync(dest, { recursive: true });
      else { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, member.data, { flag: 'wx', mode: member.mode & 0o111 ? 0o755 : 0o644 }); }
    }
    sealTree(partial);
    // Callers that share a state directory serialize through the host lock, so no writer races this check.
    if (taken(targetDir)) throw new Error('Package target already exists');
    renameSync(partial, targetDir);
  } catch (error) { unsealTree(partial); rmSync(partial, { recursive: true, force: true }); throw error; }
}
// Package bytes come only from the content-addressed store or an `https:` location; any other
// location (including `file:`) is refused like an unavailable one. Aborting `signal` aborts the download.
export async function fetchPackageBytes(entry: PackageExpected & { locations?: string[] }, options: { storeDir: string; signal?: AbortSignal }): Promise<Buffer> {
  if (!hashPattern.test(entry.contentHash)) throw new Error('Invalid package content hash');
  const [algorithm, digest] = entry.contentHash.split(':');
  try { return readFileSync(join(options.storeDir, algorithm, digest)); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  let lastError: unknown = new Error('No package location available');
  for (const location of entry.locations ?? []) {
    try {
      const url = new URL(location);
      if (url.protocol !== 'https:') throw new Error('Unsupported package location');
      options.signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
        if (!response.ok || !response.body) throw new Error(`Package fetch failed: ${response.status}`);
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of response.body) { length += chunk.length; if (length > entry.size) { controller.abort(); throw new Error('Package download exceeds expected size'); } chunks.push(Buffer.from(chunk)); }
        return Buffer.concat(chunks, length);
      } finally { options.signal?.removeEventListener('abort', abort); controller.abort(); }
    } catch (error) { if (options.signal?.aborted) throw error; lastError = error; }
  }
  throw lastError;
}
