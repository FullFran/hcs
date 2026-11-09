import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENVELOPE_PAYLOAD_TYPE, KEY_SET_PAYLOAD_TYPE, contentDigest, pae, signingInput } from '../../src/signing/index.ts';
import { createHash } from 'node:crypto';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

test('PAE uses byte lengths in ASCII decimal', () => {
  assert.equal(text(pae('t', new TextEncoder().encode('ab'))), 'DSSEv1 1 t 2 ab');
  assert.equal(text(pae('t', new TextEncoder().encode('é'))), 'DSSEv1 1 t 2 é');
});

test('payload types are the HCS-0007 section 4 values', () => {
  assert.equal(ENVELOPE_PAYLOAD_TYPE, 'application/vnd.hcs.catalog-envelope+json');
  assert.equal(KEY_SET_PAYLOAD_TYPE, 'application/vnd.hcs.key-set+json');
});

test('signing input drops signatures and canonicalises the rest', () => {
  const doc = { b: 1, signatures: [{ keyid: 'k', sig: 'x' }], a: 'z' };
  assert.equal(text(signingInput(KEY_SET_PAYLOAD_TYPE, doc)), 'DSSEv1 32 application/vnd.hcs.key-set+json 15 {"a":"z","b":1}');
});

test('content digest is sha256 of the canonical form without signatures', () => {
  const want = 'sha256:' + createHash('sha256').update('{"a":"z","b":1}').digest('hex');
  assert.equal(contentDigest({ a: 'z', b: 1, signatures: [] }), want);
  assert.equal(contentDigest({ b: 1, a: 'z' }), want);
});
