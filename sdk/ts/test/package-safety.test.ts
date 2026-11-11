import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { unpackPackage, buildPackage } from '../src/package.ts';
import { HcsFailure } from '../src/errors.ts';

// Hostile archives are written byte by byte: the SDK writer (and any tar library) refuses these names and types.
const BLOCK = 512;
interface RawMember { name: string | Buffer; type?: string; data?: string; linkname?: string }
function rawTar(members: RawMember[], terminator = true): Buffer {
  const chunks: Buffer[] = [];
  for (const m of members) {
    const data = Buffer.from(m.data ?? ''), h = Buffer.alloc(BLOCK);
    (Buffer.isBuffer(m.name) ? m.name : Buffer.from(m.name)).copy(h, 0, 0, 100);
    h.write('0000644\0', 100, 'ascii'); h.write('0000000\0', 108, 'ascii'); h.write('0000000\0', 116, 'ascii');
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); h.write('00000000000\0', 136, 'ascii');
    h.fill(32, 148, 156); h.write(m.type ?? '0', 156, 'ascii'); h.write(m.linkname ?? '', 157, 'ascii');
    h.write('ustar\0', 257, 'ascii'); h.write('00', 263, 'ascii');
    h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    chunks.push(h, data, Buffer.alloc((BLOCK - data.length % BLOCK) % BLOCK));
  }
  if (terminator) chunks.push(Buffer.alloc(2 * BLOCK));
  return Buffer.concat(chunks);
}
const expected = (bytes: Buffer) => ({ size: bytes.length, contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
const OK: RawMember = { name: 'ok', data: 'x' };
const MARKER = 'payload-marker';
const P = 'x-hcs-sdk';

// `work` holds the destination parent, `outside` is a sentinel directory that must stay empty.
function sandbox(fn: (work: string, target: string, outside: string) => void) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'hcs-package-safety-')), work = join(root, 'work'), outside = join(root, 'outside');
    mkdirSync(work); mkdirSync(outside);
    try { fn(work, join(work, 'out'), outside); } finally { chmodTree(root); rmSync(root, { recursive: true, force: true }); }
  };
}
function chmodTree(dir: string) { if (!existsSync(dir)) return; chmodSync(dir, 0o700); for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) chmodTree(join(dir, e.name)); }

interface Want { requirement: string; archive: string; reason: string; member?: string }
// Asserts every observable effect of a refusal: code, requirement, details, no content echo, filesystem state.
function refused(gz: Buffer, want: Want, work: string, target: string, outside: string, limits = {}, expectedInput = expected(gz)) {
  assert.throws(() => unpackPackage(gz, expectedInput, target, limits), (e: any) => {
    assert.ok(e instanceof HcsFailure); assert.equal(e.errors.length, 1);
    const err = e.errors[0];
    assert.equal(err.code, 'package_invalid');
    assert.equal(err.requirement, want.requirement);
    const details: Record<string, unknown> = { [`${P}-archive`]: want.archive, [`${P}-reason`]: want.reason };
    if (want.member !== undefined) details[`${P}-member`] = want.member;
    assert.deepEqual(err.details, details);
    assert.ok(!JSON.stringify(err).includes(MARKER), 'member content is not echoed');
    return true;
  });
  assert.equal(existsSync(target), false, 'nothing at the final location');
  assert.deepEqual(readdirSync(work), [], 'temporary directory removed');
  assert.deepEqual(readdirSync(outside), [], 'nothing written outside the destination');
}
const refuse = (members: RawMember[], want: Want, work: string, target: string, outside: string, limits = {}) =>
  refused(gzipSync(rawTar(members)), want, work, target, outside, limits);

test('R019 refuses empty, absolute, parent, backslash and whiteout paths', sandbox((work, target, outside) => {
  const escape = join(outside, 'escaped');
  const path = (reason: string, member: string): Want => ({ requirement: 'HCS-0001-R019', archive: 'unsafe-member', reason, member });
  refuse([OK, { name: escape, data: MARKER }], path('invalid path', escape), work, target, outside);
  refuse([OK, { name: '../outside/escaped', data: MARKER }], path('invalid path', '../outside/escaped'), work, target, outside);
  refuse([OK, { name: 'a/../../outside/escaped', data: MARKER }], path('invalid path', 'a/../../outside/escaped'), work, target, outside);
  refuse([OK, { name: 'a\\b', data: MARKER }], path('invalid path', 'a\\b'), work, target, outside);
  refuse([OK, { name: '', data: MARKER }], path('empty path', ''), work, target, outside);
  refuse([OK, { name: './', type: '5' }], path('empty path', './'), work, target, outside);
  refuse([OK, { name: 'd/.wh.old' }], path('whiteout', 'd/.wh.old'), work, target, outside);
  refuse([OK, { name: '.wh..wh..opq' }], path('whiteout', '.wh..wh..opq'), work, target, outside);
}));

test('R019 refuses a name with bytes hidden after a NUL', sandbox((work, target, outside) => {
  const hidden = Buffer.from('safe\0hidden');
  refuse([OK, { name: hidden }], { requirement: 'HCS-0001-R019', archive: 'unsafe-member', reason: 'invalid path', member: 'safe\0hidden' }, work, target, outside);
}));

test('R019 accepts dots and wh text that are not traversal or whiteouts', sandbox((work, target) => {
  const bytes = gzipSync(rawTar([{ name: './a.wh.b', data: 'x' }, { name: '..a', data: 'y' }, { name: 'dir/', type: '5' }, { name: 'dir/.whx', data: 'z' }]));
  unpackPackage(bytes, expected(bytes), target);
  assert.deepEqual(readdirSync(target).sort(), ['..a', 'a.wh.b', 'dir']);
  assert.equal(readFileSync(join(target, 'dir', '.whx'), 'utf8'), 'z');
}));

test('R020 refuses every member that is not a regular file or a directory, and directory data', sandbox((work, target, outside) => {
  const type = (reason: string, member: string): Want => ({ requirement: 'HCS-0001-R020', archive: 'unsafe-member', reason, member });
  refuse([OK, { name: 'link', type: '2', linkname: 'ok' }], type('unsupported type', 'link'), work, target, outside);
  refuse([OK, { name: 'link', type: '2', linkname: '../outside' }], type('unsupported type', 'link'), work, target, outside);
  refuse([OK, { name: 'link', type: '1', linkname: 'ok' }], type('unsupported type', 'link'), work, target, outside);
  refuse([OK, { name: 'dev', type: '3' }], type('unsupported type', 'dev'), work, target, outside);
  refuse([OK, { name: 'dev', type: '4' }], type('unsupported type', 'dev'), work, target, outside);
  refuse([OK, { name: 'pipe', type: '6' }], type('unsupported type', 'pipe'), work, target, outside);
  refuse([OK, { name: 'pax', type: 'x', data: `20 path=${MARKER}\n` }], type('unsupported type', 'pax'), work, target, outside);
  refuse([OK, { name: 'd/', type: '5', data: MARKER }], type('directory data', 'd/'), work, target, outside);
}));

test('R020 accepts regular files, the legacy NUL type flag and directories', sandbox((work, target) => {
  const bytes = gzipSync(rawTar([{ name: 'd/', type: '5' }, { name: 'd/f', data: 'x' }, { name: 'legacy', type: '\0', data: 'y' }]));
  unpackPackage(bytes, expected(bytes), target);
  assert.equal(readFileSync(join(target, 'legacy'), 'utf8'), 'y');
}));

test('R021 refuses a duplicate path and a member below a regular file in either order', sandbox((work, target, outside) => {
  const dup = (reason: string, member: string): Want => ({ requirement: 'HCS-0001-R021', archive: 'unsafe-member', reason, member });
  refuse([{ name: 'a', data: '1' }, { name: 'a', data: MARKER }], dup('duplicate path', 'a'), work, target, outside);
  refuse([{ name: 'a/', type: '5' }, { name: 'a', data: MARKER }], dup('duplicate path', 'a'), work, target, outside);
  refuse([{ name: 'a/b', data: '1' }, { name: 'a/./b', data: MARKER }], dup('duplicate path', 'a/./b'), work, target, outside);
  refuse([{ name: 'a', data: '1' }, { name: 'a/b', data: MARKER }], dup('below regular file', 'a/b'), work, target, outside);
  refuse([{ name: 'a/b', data: MARKER }, { name: 'a', data: '1' }], dup('below regular file', 'a'), work, target, outside);
}));

test('R021 accepts a directory before the files below it', sandbox((work, target) => {
  const bytes = gzipSync(rawTar([{ name: 'a/', type: '5' }, { name: 'a/b', data: '1' }, { name: 'a2', data: '2' }]));
  unpackPackage(bytes, expected(bytes), target);
  assert.equal(readFileSync(join(target, 'a', 'b'), 'utf8'), '1');
}));

test('R023 refuses a tar that cannot be parsed and verified bytes that are not gzip', sandbox((work, target, outside) => {
  const malformed: Want = { requirement: 'HCS-0001-R023', archive: 'malformed', reason: 'malformed archive' };
  const flipped = rawTar([OK]); flipped[0] ^= 1;
  refused(gzipSync(flipped), malformed, work, target, outside);
  refused(gzipSync(rawTar([OK]).subarray(0, BLOCK + 3)), malformed, work, target, outside);
  refused(gzipSync(rawTar([OK], false)), malformed, work, target, outside);
  const plain = Buffer.from('hello hcs\n');
  refused(plain, malformed, work, target, outside);
}));

test('R023 refuses a package over the host member, unpacked size and decompression limits', sandbox((work, target, outside) => {
  const limit = (reason: string): Want => ({ requirement: 'HCS-0001-R023', archive: 'limit', reason });
  refuse([{ name: 'a' }, { name: 'b' }], limit('member limit'), work, target, outside, { maxMembers: 1 });
  refuse([{ name: 'a', data: '12345' }], limit('size limit'), work, target, outside, { maxBytes: 4 });
  const bomb = gzipSync(Buffer.alloc(64 * 1024));
  refused(bomb, limit('size limit'), work, target, outside, { maxBytes: 1, maxMembers: 1 });
  const bytes = gzipSync(rawTar([{ name: 'a', data: '1234' }, { name: 'b' }]));
  unpackPackage(bytes, expected(bytes), target, { maxBytes: 4, maxMembers: 2 });
  assert.equal(readFileSync(join(target, 'a'), 'utf8'), '1234');
}));

test('R022 keeps size, contentHash and contentId errors ahead of member safety', sandbox((work, target) => {
  const bytes = gzipSync(rawTar([{ name: '/abs', data: MARKER }]));
  const mismatch = (e: any) => { assert.equal(e.errors[0].code, 'integrity_mismatch'); assert.equal(e.errors[0].details, undefined); return true; };
  assert.throws(() => unpackPackage(bytes, { ...expected(bytes), size: bytes.length + 1 }, target), mismatch);
  assert.throws(() => unpackPackage(bytes, { ...expected(bytes), contentHash: 'sha256:' + '0'.repeat(64) }, target), mismatch);
  assert.throws(() => unpackPackage(bytes, { ...expected(bytes), contentId: 'sha256:' + '0'.repeat(64) }, target), (e: any) => { assert.equal(e.errors[0].code, 'integrity_mismatch'); assert.equal(e.errors[0].requirement, 'HCS-0001-R018'); return true; });
  const tar = rawTar([{ name: '/abs', data: MARKER }]), contentId = `sha256:${createHash('sha256').update(tar).digest('hex')}`;
  assert.throws(() => unpackPackage(bytes, { ...expected(bytes), contentId }, target), (e: any) => e.errors[0].code === 'package_invalid');
  assert.equal(existsSync(target), false);
  assert.deepEqual(readdirSync(work), []);
}));

test('R023 leaves a failed or over-limit decompression with contentId declared as integrity_mismatch (R018)', sandbox((work, target) => {
  const plain = Buffer.from('hello hcs\n');
  assert.throws(() => unpackPackage(plain, { ...expected(plain), contentId: 'sha256:' + '0'.repeat(64) }, target), (e: any) => e.errors[0].code === 'integrity_mismatch' && e.errors[0].requirement === 'HCS-0001-R018');
  assert.equal(existsSync(target), false);
}));

test('a normal package still unpacks, and the detail prefix names the package_invalid details', sandbox((work, target, outside) => {
  const src = join(work, '..', 'src'); mkdirSync(join(src, 'd'), { recursive: true });
  const built = buildPackage(src);
  unpackPackage(built.bytes, built, target);
  assert.deepEqual(readdirSync(target), ['d']);
  const bad = gzipSync(rawTar([{ name: '/abs' }]));
  assert.throws(() => unpackPackage(bad, expected(bad), join(work, 'again'), {}, 'x-acme'), (e: any) => {
    assert.deepEqual(Object.keys(e.errors[0].details).sort(), ['x-acme-archive', 'x-acme-member', 'x-acme-reason']); return true;
  });
  assert.deepEqual(readdirSync(outside), []);
}));
