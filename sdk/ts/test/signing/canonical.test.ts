import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalError, canonicalize, parseStrictJson } from '../../src/signing/index.ts';

test('RFC 8785 3.2.2.2: string escaping', () => {
  const value = JSON.parse('{"string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/"}');
  assert.equal(canonicalize(value), '{"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}');
});

test('RFC 8785 3.2.2: literals and nested ordering', () => {
  assert.equal(canonicalize(JSON.parse('[56, {"d": true, "10": null, "1": [ ]}]')), '[56,{"1":[],"10":null,"d":true}]');
});

test('RFC 8785 3.2.3: members sort by UTF-16 code units', () => {
  const value = JSON.parse('{"\\u20ac":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\\ud83d\\ude00":"Emoji: Grinning Face","\\u0080":"Control","\\u00f6":"Latin Small Letter O With Diaeresis"}');
  assert.equal(canonicalize(value), '{"\\r":"Carriage Return","1":"One","\u0080":"Control","\u00f6":"Latin Small Letter O With Diaeresis","\u20ac":"Euro Sign","\ud83d\ude00":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}');
});

test('U+1F600 sorts before U+E000 (code units, not code points); controls escape as \\u00xx', () => {
  assert.equal(canonicalize({ '\ue000': 1, '\u{1f600}': 2, a: [true, null, '\u000f'] }), '{"a":[true,null,"\\u000f"],"\u{1f600}":2,"\ue000":1}');
});

test('integers serialise as decimal digits, -0 as 0, safe limits accepted', () => {
  assert.equal(canonicalize([0, -0, 9007199254740991, -9007199254740991]), '[0,0,9007199254740991,-9007199254740991]');
});

test('values without a canonical form throw CanonicalError', () => {
  for (const bad of [1.5, 2 ** 53, -(2 ** 53), NaN, Infinity, '\ud800', { '\udc00': 1 }, undefined, 10n, new Date(0), () => 1]) {
    assert.throws(() => canonicalize(bad), CanonicalError, String(bad));
  }
});

test('parseStrictJson rejects duplicate member names at any depth', () => {
  assert.equal(parseStrictJson('{"a":1,"a":2}').ok, false);
  assert.equal(parseStrictJson('{"x":[{"b":1,"\\u0062":2}]}').ok, false);
  assert.equal(parseStrictJson('{"a":{"a":1},"b":"a"}').ok, true);
});

test('parseStrictJson rejects syntax errors, invalid UTF-8, lone surrogates and unsafe numbers', () => {
  for (const bad of ['{', '{"a":1.5}', '{"a":9007199254740992}', '"\\ud800"', new Uint8Array([0x22, 0xff, 0x22])]) {
    const r = parseStrictJson(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.errors[0].code, 'manifest_invalid');
  }
  const ok = parseStrictJson(new TextEncoder().encode('{"a":[1,"é"]}'));
  assert.deepEqual(ok, { ok: true, value: { a: [1, 'é'] } });
});
