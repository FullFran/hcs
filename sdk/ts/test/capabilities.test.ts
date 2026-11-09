import assert from 'node:assert/strict';
import { test } from 'node:test';
import { builtinCapabilities, dispatch } from '../src/capabilities.ts';
import { TEST_HOST } from './fixtures/host.ts';
import { HcsFailure } from '../src/errors.ts';

const ref = 'dev.test.host.read@1';
test('builtins snapshot and dispatch enforce active and draining capabilities', () => {
  const snapshot = builtinCapabilities(TEST_HOST).snapshot();
  assert.equal(snapshot.generation, null);
  assert.deepEqual([...snapshot.active], TEST_HOST.builtins);
  assert.ok(snapshot.active.has('dev.test.host.check@1'));
  assert.doesNotThrow(() => dispatch(snapshot, ref));
  for (const draining of [false, true]) {
    assert.throws(() => dispatch({ generation: 1, active: new Set(), draining: new Set(draining ? [ref] : []) }, ref), (e: unknown) => {
      assert.ok(e instanceof HcsFailure);
      assert.equal(e.errors[0].code, 'unsupported_capability');
      assert.equal(e.errors[0].capability, ref);
      assert.equal(e.errors[0].requirement, draining ? 'HCS-0004-R006' : 'HCS-0004-R005');
      return true;
    });
  }
});

test('builtins come from the host profile passed by the caller', () => {
  const snapshot = builtinCapabilities({ ...TEST_HOST, builtins: ['dev.acme.only@2'] }).snapshot();
  assert.deepEqual([...snapshot.active], ['dev.acme.only@2']);
  assert.throws(() => dispatch(snapshot, ref), HcsFailure);
});
