import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnvelopeShape, checkKeySetShape, parseInstant } from '../../src/signing/index.ts';

const sig = { keyid: 'online-1', sig: 'A'.repeat(86) + '==' };
const envelope = (): Record<string, unknown> => ({
  hcsVersion: '0.1', sequence: 1, expires: '2026-11-13T00:00:00Z',
  binding: { tenant: 't-0001' }, catalog: { hcsVersion: '0.1', entries: [] }, signatures: [sig],
});
const key = () => ({ keyid: 'online-1', keytype: 'ed25519', public: 'A'.repeat(43) + '=', notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' });
const keySet = (): Record<string, unknown> => ({ hcsVersion: '0.1', version: 1, threshold: 1, keys: [key()], signatures: [] });
const codes = (errors: { code: string }[]) => errors.map(e => e.code);

test('a well-formed envelope and key set have no shape errors', () => {
  assert.deepEqual(checkEnvelopeShape(envelope()), []);
  assert.deepEqual(checkEnvelopeShape({ ...envelope(), 'x-note': { n: [1, 'a'] } }), []);
  assert.deepEqual(checkKeySetShape(keySet()), []);
});

test('hcsVersion is checked before the shape', () => {
  assert.deepEqual(codes(checkEnvelopeShape({ hcsVersion: '9.9', sequence: 'broken' })), ['unsupported_hcs_version']);
  assert.deepEqual(codes(checkKeySetShape({ hcsVersion: '9.9' })), ['unsupported_hcs_version']);
  assert.deepEqual(codes(checkEnvelopeShape({ ...envelope(), hcsVersion: 1 })), ['manifest_invalid']);
});

test('envelope shape violations are manifest_invalid', () => {
  const cases: unknown[] = [
    (() => { const e = envelope(); delete e.sequence; return e; })(),
    { ...envelope(), sequence: 0 },
    { ...envelope(), sequence: 2 ** 53 },
    { ...envelope(), expires: '2026-11-13T00:00:00+01:00' },
    { ...envelope(), expires: '2026-02-30T00:00:00Z' },
    { ...envelope(), binding: {} },
    { ...envelope(), binding: { Tenant: 'x' } },
    { ...envelope(), binding: { tenant: '' } },
    { ...envelope(), binding: { tenant: 'x'.repeat(257) } },
    { ...envelope(), catalog: [] },
    { ...envelope(), catalog: { n: 1.5 } },
    { ...envelope(), signatures: [{ keyid: 'online-1', sig: 'AA==' }] },
    { ...envelope(), signatures: [{ ...sig, extra: 1 }] },
    { ...envelope(), tenant: 't-0001' },
    { ...envelope(), 'x-big': 2 ** 53 },
    { ...envelope(), 'x-s': '\ud800' },
    [], null, 'envelope',
  ];
  for (const c of cases) assert.deepEqual(codes(checkEnvelopeShape(c)), ['manifest_invalid'], JSON.stringify(c));
});

test('binding length counts code points', () => {
  assert.deepEqual(checkEnvelopeShape({ ...envelope(), binding: { tenant: '😀'.repeat(256) } }), []);
});

test('key set shape violations, including duplicate keyids, are manifest_invalid', () => {
  const cases: Record<string, unknown>[] = [
    { ...keySet(), keys: [] },
    { ...keySet(), keys: [key(), key()] },
    { ...keySet(), keys: [{ ...key(), keytype: 'rsa' }] },
    { ...keySet(), keys: [{ ...key(), notAfter: undefined }] },
    { ...keySet(), threshold: 0 },
    { ...keySet(), threshold: 256 },
    { ...keySet(), version: 1.5 },
    { ...keySet(), other: 1 },
  ];
  for (const c of cases) assert.deepEqual(codes(checkKeySetShape(c)), ['manifest_invalid'], JSON.stringify(c));
});

test('parseInstant keeps nanosecond precision and rejects impossible dates', () => {
  assert.equal(parseInstant('1970-01-01T00:00:00Z'), 0n);
  assert.equal(parseInstant('1970-01-01T00:00:00.000000001Z'), 1n);
  assert.equal(parseInstant('1970-01-01T00:00:01.5Z'), 1_500_000_000n);
  assert.equal(parseInstant('2026-02-29T00:00:00Z'), null);
  assert.equal(parseInstant('2026-11-13T00:00:00z'), null);
  assert.equal(parseInstant('2026-11-13T00:00:00Z\n'), null);
});
