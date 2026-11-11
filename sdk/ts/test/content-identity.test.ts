import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtempSync, readdirSync, rmSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCatalog, type CatalogEntry } from '../src/catalog.ts';
import { buildPackage, verifyPackage, unpackPackage } from '../src/package.ts';
import { packageRequests } from '../src/grants.ts';
import { writeTar } from '../src/tar.ts';
import { signEnvelope, signingInput, ENVELOPE_PAYLOAD_TYPE, ed25519Verify } from '../src/signing/index.ts';
import { createPrivateKey, createPublicKey } from 'node:crypto';

const digest = (bytes: Uint8Array, algorithm = 'sha256') => `${algorithm}:${createHash(algorithm).update(bytes).digest('hex')}`;
const entry = (bytes: Buffer, contentId?: string): CatalogEntry => ({ id: 'dev.example.a', version: '1', size: bytes.length, contentHash: digest(bytes), ...(contentId === undefined ? {} : { contentId }), mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', contributions: [{ kind: 'skill', path: 'skill' }] });
const mismatch = (error: any) => { assert.equal(error.errors?.[0]?.code, 'integrity_mismatch'); return true; };
const tar = writeTar([{ name: 'requests.json', data: Buffer.from('{"hcsVersion":"0.1","entry":"dev.example.a","requests":[]}') }]);

test('the signed catalog binds both identities: adding, removing or changing contentId breaks verification', () => {
  // Fixed public test seed, never a deployment key.
  const seed = Buffer.alloc(32, 1);
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
  const bytes = gzipSync(tar), original = entry(bytes, digest(tar));
  const document = { catalog: { entries: [original] } };
  const signed = signEnvelope(document, [{ keyid: 'test', privateKey: seed }]);
  const signature = Buffer.from(signed.signatures[0].sig, 'base64');
  const verify = (value: object) => ed25519Verify(publicKey, signingInput(ENVELOPE_PAYLOAD_TYPE, value), signature);
  assert.equal(verify(document), true);
  const { contentId: _ignored, ...absent } = original;
  for (const changed of [absent, { ...original, contentId: digest(Buffer.from('changed')) }, { ...original, contentHash: digest(tar) }]) assert.equal(verify({ catalog: { entries: [changed] } }), false);
  const legacy = { catalog: { entries: [absent] } };
  const legacySigned = signEnvelope(legacy, [{ keyid: 'test', privateKey: seed }]);
  assert.equal(ed25519Verify(publicKey, signingInput(ENVELOPE_PAYLOAD_TYPE, document), Buffer.from(legacySigned.signatures[0].sig, 'base64')), false);
});

test('contentId is optional and uses the existing digest grammar', () => {
  const catalog = (id?: unknown) => JSON.stringify({ hcsVersion: '0.1', id: 'dev.example.catalog', version: '1', entries: [{ ...entry(gzipSync(tar)), ...(id === undefined ? {} : { contentId: id }) }] });
  for (const id of [undefined, digest(tar), digest(tar, 'sha512')]) assert.equal(readCatalog(catalog(id)).ok, true);
  for (const id of [null, 1, '', digest(tar).toUpperCase(), 'md5:' + 'a'.repeat(32), digest(tar) + '\n']) assert.equal(readCatalog(catalog(id)).ok, false);
});

test('identity hashes exact tar bytes across gzip encodings and both algorithms', () => {
  const a = gzipSync(tar, { level: 1 }), b = gzipSync(tar, { level: 9 });
  assert.notEqual(digest(a), digest(b));
  for (const bytes of [a, b]) for (const algorithm of ['sha256', 'sha512']) verifyPackage(bytes, entry(bytes, digest(tar, algorithm)));
  // Trailing tar padding is part of identity, even though it does not change the tree.
  const padded = gzipSync(Buffer.concat([tar, Buffer.alloc(512)]));
  assert.throws(() => verifyPackage(padded, entry(padded, digest(tar))), mismatch);
  const changed = gzipSync(writeTar([{ name: 'different' }]));
  assert.throws(() => verifyPackage(changed, entry(changed, digest(tar))), mismatch);
});

test('identity is checked before extraction or permission requests, without filesystem effects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-identity-'));
  try {
    const bytes = gzipSync(tar), bad = entry(bytes, 'sha256:' + '0'.repeat(64));
    assert.throws(() => unpackPackage(bytes, bad, join(dir, 'out')), mismatch);
    assert.throws(() => packageRequests(bytes, bad), mismatch);
    assert.deepEqual(readdirSync(dir), []);
    assert.deepEqual(packageRequests(bytes, entry(bytes, digest(tar))), []);
    assert.deepEqual(packageRequests(bytes, entry(bytes)), []);
  } finally { if (existsSync(join(dir, 'out'))) chmodSync(join(dir, 'out'), 0o700); rmSync(dir, { recursive: true, force: true }); }
});

test('transport is verified first and missing identity retains transport-only verification', () => {
  const bytes = Buffer.from('not gzip');
  verifyPackage(bytes, entry(bytes));
  for (const expected of [{ ...entry(bytes, digest(tar)), size: 0 }, { ...entry(bytes, digest(tar)), contentHash: digest(tar) }]) {
    assert.throws(() => verifyPackage(bytes, expected), (error: any) => { mismatch(error); assert.equal(error.errors[0].requirement, 'HCS-0001-R007'); return true; });
  }
  assert.throws(() => verifyPackage(bytes, entry(bytes, digest(tar))), mismatch);
  assert.throws(() => verifyPackage(gzipSync(tar), entry(gzipSync(tar), digest(tar) + '\n')), mismatch);
});

test('bounded identity verification retains extraction limits and member safety', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-identity-'));
  try {
    const bytes = gzipSync(tar), expected = entry(bytes, digest(tar));
    assert.throws(() => unpackPackage(bytes, expected, join(dir, 'out'), { maxBytes: 0, maxMembers: 0 }), mismatch);
    const unsafeTar = writeTar([{ name: '.wh.deleted' }]), unsafeBytes = gzipSync(unsafeTar);
    assert.throws(() => unpackPackage(unsafeBytes, entry(unsafeBytes, digest(unsafeTar)), join(dir, 'out')), (error: any) => error.errors[0].code === 'package_invalid' && error.errors[0].requirement === 'HCS-0001-R019');
    assert.deepEqual(readdirSync(dir), []);
    mkdirSync(join(dir, 'src'));
    const built = buildPackage(join(dir, 'src'));
    assert.equal(built.contentId, digest(gunzipSync(built.bytes)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
