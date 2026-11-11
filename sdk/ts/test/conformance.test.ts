// HCS conformance of the SDK: every case in the repository's conformance/cases is fed to the SDK code that owns
// its level and classified pass, fail or not-applicable. The SDK claims every level it has a runner for, so any
// `fail` fails the test (no baseline). Levels without a runner here (distribution, projection, client, host) are
// not applicable; `distribution` is measured by the signing tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { evaluate as evaluateAuthority, type Check, type Denial, type Grant } from '../src/authority.ts';
import { readCatalog, type CatalogManifest } from '../src/catalog.ts';
import { HcsFailure } from '../src/errors.ts';
import { planRecovery, type HostFactsInput } from '../src/host-state.ts';
import type { HostProfile } from '../src/host.ts';
import { validateEntryStatus } from '../src/lifecycle.ts';
import { verifyPackage, verifiedPackageTar, type PackageExpected } from '../src/package.ts';
import { resolve as resolveCatalog } from '../src/resolve.ts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const CASES = join(REPO, 'conformance', 'cases');
const STATUSES = ['pass', 'fail', 'not-applicable'] as const;
type Status = typeof STATUSES[number];

interface HcsCase { polarity: string; requirements: string[]; level: string; target?: string; input: unknown; expect: Record<string, unknown> }
interface Result { path: string; level: string; status: Status; reason: string }
type ExpectedError = { code: string; entry?: string; capability?: string };

// One runner per level and target the SDK implements. Each asserts the case's `expect` against the SDK's verdict;
// an assertion failure is the case's `fail` reason.
const runners: Record<string, (value: HcsCase) => void> = {
  'document urn:hcs:schema:hcs-0001:catalog-manifest:0.1': value => {
    const result = readCatalog(JSON.stringify(value.input));
    assert.equal(result.ok ? 'valid' : 'invalid', value.expect.outcome);
    for (const expected of (value.expect.errors ?? []) as ExpectedError[]) {
      assert.ok(!result.ok && result.errors.some(error => error.code === expected.code && (expected.entry === undefined || error.entry === expected.entry)), `missing expected error ${expected.code}`);
    }
  },
  'document urn:hcs:schema:hcs-0004:lifecycle:0.1': value => {
    assert.equal(validateEntryStatus(value.input).length === 0 ? 'valid' : 'invalid', value.expect.outcome);
  },
  integrity: value => {
    const { entry, contentBase64, maxUncompressedBytes } = value.input as { entry: PackageExpected; contentBase64: string; maxUncompressedBytes?: number };
    assert.equal(typeof contentBase64, 'string');
    const verify = () => entry.contentId !== undefined && maxUncompressedBytes !== undefined
      ? verifiedPackageTar(Buffer.from(contentBase64, 'base64'), entry, maxUncompressedBytes)
      : verifyPackage(Buffer.from(contentBase64, 'base64'), entry);
    if (value.expect.outcome === 'valid') { assert.doesNotThrow(verify); return; }
    assert.equal(value.expect.outcome, 'invalid');
    assert.throws(verify, (error: unknown) => {
      assert.ok(error instanceof HcsFailure);
      assert.deepEqual(error.errors.map(e => e.code), (value.expect.errors as ExpectedError[] | undefined)?.map(e => e.code));
      return true;
    });
  },
  resolution: value => {
    const { catalog, host } = value.input as { catalog: CatalogManifest; host: HostProfile };
    const expected = value.expect as { activationOrder: string[]; selected?: string[]; errors: ExpectedError[] };
    const actual = resolveCatalog(catalog, host);
    assert.deepEqual(actual.activationOrder, expected.activationOrder);
    if (expected.selected !== undefined) assert.deepEqual(actual.selected, expected.selected);
    const remaining = actual.errors.slice();
    for (const error of expected.errors) {
      const index = remaining.findIndex(e => e.code === error.code && e.entry === error.entry && (error.capability === undefined || e.capability === error.capability));
      assert.notEqual(index, -1, `missing ${JSON.stringify(error)} in ${JSON.stringify(remaining)}`);
      remaining.splice(index, 1);
    }
    assert.deepEqual(remaining, []);
  },
  // An invalid case states the decision of a non-conforming host: the SDK's decision must differ from it.
  recovery: value => {
    const input = value.input as { persisted: HostFactsInput; onDisk?: number[] };
    const got = planRecovery(input.persisted, input.onDisk ?? []) as unknown as Record<string, unknown>;
    const matches = Object.entries(value.expect).every(([key, expected]) => JSON.stringify(got[key]) === JSON.stringify(expected));
    assert.equal(matches, value.polarity === 'valid');
  },
  authority: value => {
    // Requests are part of the case input but never reach the evaluator (HCS-0005-R002, R004).
    const input = value.input as { grants: Grant[]; denials?: Denial[]; check: Check };
    const expected = (value.expect as { decision: { allow: boolean; error?: { code: string } } }).decision;
    const decision = evaluateAuthority(input.check, input.grants, input.denials);
    assert.equal(decision.allow, expected.allow);
    if (!decision.allow) {
      assert.equal(decision.error.code, expected.error?.code);
      assert.equal(decision.error.entry, input.check.entry);
    }
  },
};

const runnerFor = (value: HcsCase) => runners[`${value.level} ${value.target}`] ?? runners[value.level];

function classify(value: HcsCase): { status: Status; reason: string } {
  if (value.level === 'host') return { status: 'not-applicable', reason: 'host-level case: needs a running host' };
  const runner = runnerFor(value);
  if (!runner) return { status: 'not-applicable', reason: `no runner for level ${value.level}${value.target ? ` target ${value.target}` : ''}` };
  try { runner(value); return { status: 'pass', reason: '' }; }
  catch (error) { return { status: 'fail', reason: (error instanceof Error ? error.message : String(error)).split('\n')[0] }; }
}

function caseFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return caseFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }).sort();
}

const results: Result[] = caseFiles(CASES).map(file => {
  const value = { ...JSON.parse(readFileSync(file, 'utf8')), polarity: basename(dirname(file)) } as HcsCase;
  return { path: relative(REPO, file), level: value.level, ...classify(value) };
});

test('reports the conformance per level and fails on any case the SDK claims and does not pass', t => {
  const summary: Record<string, Record<Status, number>> = {};
  for (const { level, status } of results) {
    summary[level] ??= { pass: 0, fail: 0, 'not-applicable': 0 };
    summary[level][status]++;
  }
  t.diagnostic('HCS conformance of the SDK');
  for (const [level, counts] of Object.entries(summary).sort()) t.diagnostic(`${level.padEnd(13)} ${STATUSES.map(status => `${status} ${counts[status]}`).join(', ')}`);
  const failures = results.filter(result => result.status === 'fail');
  for (const { path, reason } of failures) t.diagnostic(`fail: ${path}: ${reason}`);
  assert.ok(results.some(result => result.status === 'pass'), 'no case passes: the runners are not wired');
  assert.deepEqual(failures, []);
});

test('every case is read and classified, and every claimed level has cases', () => {
  assert.ok(results.length > 0, `no cases under ${CASES}`);
  for (const result of results) assert.ok((STATUSES as readonly string[]).includes(result.status), result.path);
  for (const level of ['integrity', 'resolution', 'authority']) assert.ok(results.some(r => r.level === level && r.status === 'pass'), level);
});

test('host cases and levels without a runner are not applicable; a wrong expectation fails', () => {
  const failing: HcsCase = { polarity: 'valid', requirements: ['HCS-0005-R001'], level: 'authority', input: { grants: [], check: { entry: 'a.b', permission: 'a.b.c' } }, expect: { decision: { allow: true } } };
  assert.equal(classify(failing).status, 'fail');
  assert.equal(classify({ ...failing, level: 'host' }).status, 'not-applicable');
  assert.match(classify({ ...failing, level: 'client' }).reason, /no runner for level client/);
  assert.match(classify({ ...failing, level: 'distribution' }).reason, /no runner for level distribution/);
});
