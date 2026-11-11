// The reading order of HCS-0007 section 5.2 for an envelope and a key set received as text:
// (1) the document is readable (R003), (2) hcsVersion, (3) R004, shape, R022, R023.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnvelopeShape, checkKeySetShape, parseStrictJson, readEnvelope, readKeySet } from '../../src/signing/index.ts';
import type { SigningError } from '../../src/signing/index.ts';

type Limits = { maxKeys?: number; maxSignatures?: number };
const only = (errors: SigningError[]) => { assert.equal(errors.length, 1); return errors[0]; };
const read = {
  envelope: (text: string, limits?: Limits) => readEnvelope(text, limits),
  keySet: (text: string, limits?: Limits) => readKeySet(text, limits),
};
const rejected = (r: { ok: boolean; errors?: SigningError[] }) => { assert.equal(r.ok, false); return only(r.errors!); };
const sig = '{"keyid":"a","sig":"' + 'A'.repeat(86) + '=="}';
const dupSigs = `"signatures":[${sig},${sig}]`;
const envMembers = '"hcsVersion":"0.1","sequence":1,"expires":"2026-11-13T00:00:00Z","binding":{"t":"x"},"catalog":{}';

test('R004 covers range as well as spelling, with an offset; a token that is not JSON stays R003', () => {
  const big = '1' + '0'.repeat(399);
  for (const token of ['9007199254740992', '-9007199254740992', big, '-' + big, '1.5', '-0']) {
    const r = parseStrictJson(`{"x-n":${token}}`);
    assert.equal(r.ok, false, token.slice(0, 20));
    if (!r.ok) {
      assert.equal(only(r.errors).requirement, 'HCS-0007-R004', token.slice(0, 20));
      assert.match(r.errors[0].message, /offset 7/);
      assert.equal(r.errors[0].message.includes(token.slice(0, 12)), false);
    }
  }
  for (const token of ['01', '-01', '+1', '.5', '1.', '0x1']) {
    const r = parseStrictJson(`{"x-n":${token}}`);
    assert.equal(r.ok, false, token);
    if (!r.ok) assert.equal(only(r.errors).requirement, 'HCS-0007-R003', token);
  }
  assert.equal(parseStrictJson('{"x-n":9007199254740991}').ok, true);
});

test('a number violation leaves the readable value to the caller, so the version can be read first', () => {
  const r = parseStrictJson('{"hcsVersion":"0.2","x-n":1.5}');
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual((r as { value?: unknown }).value && Object.keys((r as { value: object }).value), ['hcsVersion', 'x-n']);
  const dup = parseStrictJson('{"hcsVersion":"0.2","x-n":1.5,"x-n":2}');
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal((dup as { value?: unknown }).value, undefined);
});

test('stage 1: an unreadable document is manifest_invalid (R003) whatever its hcsVersion', () => {
  for (const kind of ['envelope', 'keySet'] as const) {
    for (const text of ['{"hcsVersion":"0.2","x-n":1.5,"x-n":2}', '{"hcsVersion":"0.2","x-s":"\\ud800"}', '{"hcsVersion":"0.2",']) {
      const e = rejected(read[kind](text));
      assert.equal(e.code, 'manifest_invalid', `${kind} ${text}`);
      assert.equal(e.requirement, 'HCS-0007-R003', `${kind} ${text}`);
    }
  }
});

test('stage 2: another hcsVersion is unsupported_hcs_version even with a number, shape, keyid or bound violation', () => {
  const violations: [string, string][] = [
    ['fraction', '"x-n":1.5'], ['negative zero', '"x-n":-0'], ['out of range', '"x-n":9007199254740992'],
    ['repeated keyid', dupSigs], ['wrong shape', '"sequence":"x","version":"x"'],
  ];
  for (const [kind, requirement] of [['envelope', 'HCS-0007-R001'], ['keySet', 'HCS-0007-R002']] as const) {
    for (const [name, members] of violations) {
      const e = rejected(read[kind](`{"hcsVersion":"0.2",${members}}`, { maxSignatures: 1, maxKeys: 1 }));
      assert.equal(e.code, 'unsupported_hcs_version', `${kind} ${name}`);
      assert.equal(e.requirement, requirement, `${kind} ${name}`);
    }
  }
  // The parsed-object path gave this verdict before and still does.
  assert.equal(only(checkEnvelopeShape({ hcsVersion: '0.2', 'x-n': 1.5 })).code, 'unsupported_hcs_version');
});

test('stage 3: with the supported version R004 comes before shape, R022 and R023', () => {
  assert.equal(rejected(read.envelope(`{${envMembers},"signatures":[${sig},${sig}]}`)).requirement, 'HCS-0007-R022');
  const spelled = rejected(read.envelope(`{${envMembers},"x-n":1.5,"signatures":[${sig},${sig}]}`, { maxSignatures: 1 }));
  assert.equal(spelled.code, 'manifest_invalid');
  assert.equal(spelled.requirement, 'HCS-0007-R004');
  // Before the shape too: the document is also missing members.
  assert.equal(rejected(read.envelope('{"hcsVersion":"0.1","x-n":1.5}')).requirement, 'HCS-0007-R004');
  assert.equal(rejected(read.envelope('{"hcsVersion":"0.1"}')).requirement, 'HCS-0007-R001');
  assert.equal(rejected(read.keySet('{"hcsVersion":"0.1","version":3.0,"keys":[]}')).requirement, 'HCS-0007-R004');
  assert.equal(read.envelope(`{${envMembers}}`).ok, true);
});

test('a key set with a repeated key keyid is judged by R002 before R022 and R023', () => {
  const k = (id: string) => `{"keyid":"${id}","keytype":"ed25519","public":"${'A'.repeat(43)}=","notBefore":"2026-01-01T00:00:00Z","notAfter":"2027-01-01T00:00:00Z"}`;
  const text = `{"hcsVersion":"0.1","version":1,"keys":[${k('a')},${k('a')}],${dupSigs}}`;
  assert.equal(rejected(read.keySet(text, { maxKeys: 1, maxSignatures: 1 })).requirement, 'HCS-0007-R002');
  assert.equal(only(checkKeySetShape(JSON.parse(text), { maxKeys: 1 })).requirement, 'HCS-0007-R002');
  const unique = `{"hcsVersion":"0.1","version":1,"keys":[${k('a')},${k('b')}],${dupSigs}}`;
  assert.equal(rejected(read.keySet(unique, { maxKeys: 1 })).requirement, 'HCS-0007-R022');
  assert.equal(rejected(read.keySet(unique.replace(dupSigs, '"signatures":[]'), { maxKeys: 1 })).requirement, 'HCS-0007-R023');
});
