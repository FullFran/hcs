import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapabilityRef, isDottedId, isExtensionName, capabilitySatisfies } from '../src/ids.ts';

test('HCS-0002-R001 parses only capability references with valid majors', () => {
  assert.deepEqual(parseCapabilityRef('com.example.read@0'), { ok: true, id: 'com.example.read', major: 0 });
  assert.deepEqual(parseCapabilityRef('com.example.read@999999999'), { ok: true, id: 'com.example.read', major: 999999999 });
  for (const value of ['com.example.read', 'com.example.read@01', 'Com.example@1', 'single@1', 'com.example@1000000000', 'com.-bad@1', 'com.example@1\n']) {
    const result = parseCapabilityRef(value);
    assert.equal(result.ok, false, value);
    if (!result.ok) assert.equal(typeof result.reason, 'string');
  }
  assert.equal(isDottedId('com.example.read'), true);
  for (const value of ['single', 'com.Example', 'com.-bad', 'com.bad-', 'com.example\n']) assert.equal(isDottedId(value), false, value);
  assert.equal(isExtensionName('x-example-ext'), true);
  for (const value of ['x_bad', 'x-Bad', 'x-bad_', 'x-bad\n']) assert.equal(isExtensionName(value), false, value);
});

test('HCS-0002-R002 and R003 match exact valid references', () => {
  assert.equal(capabilitySatisfies('com.example.read@1', 'com.example.read@1'), true);
  for (const provided of ['com.example.read@2', 'com.example.other@1', 'com.example.read', 'com.example.read@01']) assert.equal(capabilitySatisfies('com.example.read@1', provided), false);
  assert.equal(capabilitySatisfies('invalid', 'invalid'), false);
});
