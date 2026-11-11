import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { collectVerifiedBlob, verifyBlobStream, verifyingTransform, HcsFailure, verifiedPackageTar, verifyPackage, type PackageExpected } from '../src/index.ts';

function descriptor(bytes: Uint8Array, algorithm = 'sha256') { return { size: bytes.length, digest: `${algorithm}:${createHash(algorithm).update(bytes).digest('hex')}` }; }
function mismatch(error: unknown) {
  assert.ok(error instanceof HcsFailure);
  assert.equal(error.errors[0].code, 'integrity_mismatch'); assert.equal(error.errors[0].requirement, 'HCS-0001-R007');
  return true;
}
// A source that records how often it was pulled and whether its `finally` ran (iterator closed).
function tracked(chunks: Uint8Array[]) {
  const state = { pulled: 0, closed: false };
  async function* source() { try { for (const chunk of chunks) { state.pulled++; yield chunk; } } finally { state.closed = true; } }
  return { state, source: source() };
}
async function* plain(chunks: Uint8Array[]) { yield* chunks; }
const bytes = Buffer.from('hello streaming blob');

test('valid blobs verify in one chunk, in 1-byte chunks and when empty', async () => {
  const d = descriptor(bytes);
  assert.deepEqual(await verifyBlobStream(plain([bytes]), d), d);
  const singles = [...bytes].map(b => Uint8Array.of(b));
  assert.deepEqual(await collectVerifiedBlob(plain(singles), d), bytes);
  const empty = descriptor(Buffer.alloc(0));
  assert.deepEqual(await collectVerifiedBlob(plain([]), empty), Buffer.alloc(0));
  assert.deepEqual(await collectVerifiedBlob(plain([new Uint8Array(0)]), empty), Buffer.alloc(0));
  assert.deepEqual(await collectVerifiedBlob(plain([bytes]), descriptor(bytes, 'sha512')), bytes);
});

test('an over-size stream aborts at the offending chunk and closes the source', async () => {
  const { state, source } = tracked([bytes, Uint8Array.of(1), new Uint8Array(100), new Uint8Array(100)]);
  await assert.rejects(verifyBlobStream(source, descriptor(bytes)), (error: unknown) => {
    mismatch(error); assert.equal((error as HcsFailure).errors[0].message, 'Package download exceeds expected size'); return true;
  });
  assert.equal(state.pulled, 2); assert.equal(state.closed, true);
  const zero = tracked([Uint8Array.of(1), Uint8Array.of(2)]);
  await assert.rejects(collectVerifiedBlob(zero.source, descriptor(Buffer.alloc(0))), mismatch);
  assert.equal(zero.state.pulled, 1); assert.equal(zero.state.closed, true);
});

test('short streams, wrong digests, wrong algorithms and uppercase hex are integrity mismatches', async () => {
  await assert.rejects(verifyBlobStream(plain([bytes.subarray(1)]), descriptor(bytes)), mismatch);
  const wrong = Buffer.from(bytes); wrong[0] ^= 1;
  await assert.rejects(verifyBlobStream(plain([wrong]), descriptor(bytes)), mismatch);
  await assert.rejects(collectVerifiedBlob(plain([wrong]), descriptor(bytes, 'sha512')), mismatch);
  const d = descriptor(bytes);
  const upper = d.digest.slice(0, 7) + d.digest.slice(7).toUpperCase().replace(/[0-9]/g, 'A');
  for (const digest of [d.digest.replace('sha256:', 'md5:'), d.digest.replace('sha256:', 'sha512:'), upper, d.digest.slice(0, -1), 'sha256:']) {
    const { state, source } = tracked([bytes]);
    await assert.rejects(verifyBlobStream(source, { ...d, digest }), (error: unknown) => {
      mismatch(error); assert.equal((error as HcsFailure).errors[0].message, 'Invalid package content hash'); return true;
    });
    assert.equal(state.pulled, 0);
  }
});

test('an invalid size is a RangeError before anything is read', async () => {
  for (const size of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { state, source } = tracked([bytes]);
    await assert.rejects(verifyBlobStream(source, { ...descriptor(bytes), size }), RangeError);
    assert.equal(state.pulled, 0);
  }
});

test('a large stream is consumed chunk by chunk without being retained', async () => {
  const chunk = new Uint8Array(64 * 1024), total = 1024, hash = createHash('sha256');
  for (let i = 0; i < total; i++) hash.update(chunk);
  const state = { pulled: 0 };
  async function* big() { for (let i = 0; i < total; i++) { state.pulled++; yield chunk; } }
  const d = { size: chunk.length * total, digest: `sha256:${hash.digest('hex')}` };
  assert.deepEqual(await verifyBlobStream(big(), d), d);
  assert.equal(state.pulled, total);
});

test('aborting the signal rejects with the reason and closes the source', async () => {
  const controller = new AbortController(), reason = new Error('deadline');
  const state = { closed: false };
  async function* source() { try { yield bytes.subarray(0, 4); controller.abort(reason); yield bytes.subarray(4); } finally { state.closed = true; } }
  await assert.rejects(verifyBlobStream(source(), descriptor(bytes), { signal: controller.signal }), (error: unknown) => error === reason);
  assert.equal(state.closed, true);
  const already = new AbortController(); already.abort(reason);
  const idle = tracked([bytes]);
  await assert.rejects(collectVerifiedBlob(idle.source, descriptor(bytes), { signal: already.signal }), (error: unknown) => error === reason);
  assert.equal(idle.state.pulled, 0);
});

test('aborting while the source is stalled rejects without waiting for it', async () => {
  const controller = new AbortController(), reason = new Error('stalled');
  const source: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}), return: () => Promise.resolve({ done: true, value: undefined }) }) };
  const pending = verifyBlobStream(source, descriptor(bytes), { signal: controller.signal });
  setTimeout(() => controller.abort(reason), 10);
  await assert.rejects(pending, (error: unknown) => error === reason);
});

test('verifyingTransform yields unchanged chunks and fails after the last one', async () => {
  const d = descriptor(bytes), seen: Uint8Array[] = [];
  for await (const chunk of verifyingTransform(plain([bytes.subarray(0, 5), bytes.subarray(5)]), d)) seen.push(chunk);
  assert.deepEqual(Buffer.concat(seen), bytes);
  const wrong = Buffer.from(bytes); wrong[0] ^= 1; const out: Uint8Array[] = [];
  await assert.rejects((async () => { for await (const chunk of verifyingTransform(plain([wrong]), d)) out.push(chunk); })(), mismatch);
  assert.equal(out.length, 1);
  const over = tracked([bytes, Uint8Array.of(1), Uint8Array.of(2)]); out.length = 0;
  await assert.rejects((async () => { for await (const chunk of verifyingTransform(over.source, d)) out.push(chunk); })(), mismatch);
  assert.equal(out.length, 1); assert.equal(over.state.pulled, 2); assert.equal(over.state.closed, true);
});

// Parity: the streamed decision equals the buffered decision for every integrity conformance case of R007 and R018.
function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? jsonFiles(join(dir, e.name)) : e.name.endsWith('.json') ? [join(dir, e.name)] : []);
}
test('streamed verification matches the buffered path on the HCS-0001 R007 and R018 conformance cases', async () => {
  const root = resolve(import.meta.dirname, '..', '..', '..', 'conformance', 'cases', 'HCS-0001');
  let count = 0;
  for (const file of [...jsonFiles(join(root, 'HCS-0001-R007')), ...jsonFiles(join(root, 'HCS-0001-R018'))]) {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (value.level !== 'integrity') continue;
    const { entry, contentBase64, maxUncompressedBytes } = value.input as { entry: PackageExpected; contentBase64: string; maxUncompressedBytes?: number };
    const content = Buffer.from(contentBase64, 'base64');
    const check = (bytes: Uint8Array) => entry.contentId !== undefined && maxUncompressedBytes !== undefined ? verifiedPackageTar(bytes, entry, maxUncompressedBytes) : verifyPackage(bytes, entry);
    const buffered = (() => { try { check(content); return 'valid'; } catch { return 'invalid'; } })();
    const streamed = await (async () => {
      try {
        const verified = await collectVerifiedBlob(plain([content.subarray(0, 7), content.subarray(7)]), { digest: entry.contentHash, size: entry.size });
        check(verified); return 'valid';
      } catch { return 'invalid'; }
    })();
    assert.equal(streamed, buffered, file); assert.equal(streamed, value.expect.outcome, file); count++;
  }
  assert.ok(count >= 3);
});

test('integrity failures say which check failed and what arrived, without changing code or message', async () => {
  const d = descriptor(bytes);
  const details = async (run: Promise<unknown>) => {
    try { await run; } catch (error) { mismatch(error); return (error as HcsFailure).errors[0].details; }
    assert.fail('expected an integrity failure');
  };
  assert.deepEqual(await details(verifyBlobStream(plain([bytes, Buffer.from('x')]), d)),
    { 'x-hcs-sdk-reason': 'size_exceeded', 'x-hcs-sdk-expected-size': bytes.length });
  assert.deepEqual(await details(verifyBlobStream(plain([bytes.subarray(0, 5)]), d)),
    { 'x-hcs-sdk-reason': 'size_short', 'x-hcs-sdk-expected-size': bytes.length, 'x-hcs-sdk-observed-size': 5 });
  const other = Buffer.from(bytes); other[0] ^= 1;
  assert.deepEqual(await details(collectVerifiedBlob(plain([other]), d)),
    { 'x-hcs-sdk-reason': 'digest_mismatch', 'x-hcs-sdk-observed-digest': descriptor(other).digest });
  // A host passes its own extension prefix, as the other SDK entry points allow.
  assert.deepEqual(await details(verifyBlobStream(plain([other]), d, { detailPrefix: 'x-example' })),
    { 'x-example-reason': 'digest_mismatch', 'x-example-observed-digest': descriptor(other).digest });
  await assert.rejects(verifyBlobStream(plain([bytes]), d, { detailPrefix: 'example' }), RangeError);
  const viaTransform = async () => { for await (const _ of verifyingTransform(plain([other]), d, { detailPrefix: 'x-example' })) { /* drain */ } };
  assert.deepEqual(await details(viaTransform()), { 'x-example-reason': 'digest_mismatch', 'x-example-observed-digest': descriptor(other).digest });
});
