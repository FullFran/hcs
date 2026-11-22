import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnvelopeSequence, checkKeySetVersion, nextSequence, SigningRejection } from '../../src/signing/index.ts';

const D1 = 'sha256:' + '1'.repeat(64);
const D2 = 'sha256:' + '2'.repeat(64);
const MAX = Number.MAX_SAFE_INTEGER;

type Env = { sequence: number; digest: string };
type Ks = { version: number; digest: string };

const envCases: Array<[string, Env, Env | undefined, boolean | 'reject']> = [
  ['first acceptance (no last)', { sequence: 1, digest: D1 }, undefined, true],
  ['higher sequence', { sequence: 8, digest: D2 }, { sequence: 7, digest: D1 }, true],
  ['higher sequence, same digest', { sequence: 8, digest: D1 }, { sequence: 7, digest: D1 }, true],
  ['identical replay is a no-op', { sequence: 7, digest: D1 }, { sequence: 7, digest: D1 }, false],
  ['same sequence, another digest', { sequence: 7, digest: D2 }, { sequence: 7, digest: D1 }, 'reject'],
  ['lower sequence', { sequence: 6, digest: D2 }, { sequence: 7, digest: D1 }, 'reject'],
  ['lower sequence, same digest', { sequence: 6, digest: D1 }, { sequence: 7, digest: D1 }, 'reject'],
];

for (const [name, candidate, last, want] of envCases) {
  test(`checkEnvelopeSequence: ${name}`, () => {
    const r = checkEnvelopeSequence(candidate, last);
    if (want === 'reject') {
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.error.code, 'rollback_rejected');
        assert.equal(r.error.requirement, 'HCS-0007-R008');
        assert.equal(r.error.message, `envelope sequence ${candidate.sequence} rolls back accepted sequence ${last!.sequence}`);
      }
    } else assert.deepEqual(r, { ok: true, changed: want });
  });
}

const ksCases: Array<[string, Ks, Ks | undefined, boolean | 'reject']> = [
  ['first acceptance (no last)', { version: 1, digest: D1 }, undefined, true],
  ['higher version', { version: 3, digest: D2 }, { version: 2, digest: D1 }, true],
  ['identical replay is a no-op', { version: 2, digest: D1 }, { version: 2, digest: D1 }, false],
  ['same version, another digest', { version: 2, digest: D2 }, { version: 2, digest: D1 }, 'reject'],
  ['lower version', { version: 1, digest: D2 }, { version: 2, digest: D1 }, 'reject'],
];

for (const [name, candidate, last, want] of ksCases) {
  test(`checkKeySetVersion: ${name}`, () => {
    const r = checkKeySetVersion(candidate, last);
    if (want === 'reject') {
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.error.code, 'rollback_rejected');
        assert.equal(r.error.requirement, 'HCS-0007-R012');
        assert.equal(r.error.message, `key set version ${candidate.version} rolls back accepted version ${last!.version}`);
      }
    } else assert.deepEqual(r, { ok: true, changed: want });
  });
}

const nextCases: Array<[string, number[], number | undefined, number | 'reject']> = [
  ['nothing issued, nothing requested', [], undefined, 1],
  ['nothing issued, requested 5', [], 5, 5],
  ['one above the highest issued', [1, 2, 3], undefined, 4],
  ['unordered issued', [3, 1, 2], undefined, 4],
  ['requested above the highest', [1, 2, 3], 10, 10],
  ['requested equals the highest', [1, 2, 3], 3, 'reject'],
  ['requested below the highest', [1, 2, 3], 2, 'reject'],
  ['requested in a gap below the highest', [1, 5], 3, 'reject'],
];

for (const [name, issued, requested, want] of nextCases) {
  test(`nextSequence: ${name}`, () => {
    if (want === 'reject') {
      assert.throws(() => nextSequence(issued, requested), (e: unknown) => e instanceof SigningRejection && e.code === 'rollback_rejected' && e.requirement === 'HCS-0007-R008');
    } else assert.equal(nextSequence(issued, requested), want);
  });
}

test('nextSequence accepts any iterable', () => {
  assert.equal(nextSequence(new Set([4, 9])), 10);
  assert.equal(nextSequence((function* () { yield 2; yield 6; })()), 7);
});

test('nextSequence rejects values that are not sequences', () => {
  assert.throws(() => nextSequence([0]), TypeError);
  assert.throws(() => nextSequence([1.5]), TypeError);
  assert.throws(() => nextSequence([], 0), TypeError);
  assert.throws(() => nextSequence([], 1.5), TypeError);
  assert.throws(() => nextSequence([], MAX + 1), TypeError);
  assert.throws(() => nextSequence([MAX]), RangeError);
});
