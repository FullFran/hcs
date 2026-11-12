import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { annotationsFor, checkServerToolEffects, checkToolEffects, classifyTools, FAIL_CLOSED_ANNOTATIONS, HcsFailure } from '../src/index.ts';

const CASES = join(resolve(import.meta.dirname, '..', '..', '..'), 'conformance', 'cases', 'HCS-0009');
const load = (req: string, polarity: string) => {
  const dir = join(CASES, `HCS-0009-${req}`, polarity);
  return readdirSync(dir).sort().map(name => ({ name, ...JSON.parse(readFileSync(join(dir, name), 'utf8')) as { level: string; input: any; expect: any } }));
};
const META = 'io.github.fullfran.hcs';
const server = (tools?: unknown) => ({ name: 'io.example/notes', description: 'Notes', version: '1.0.0', ...(tools === undefined ? {} : { _meta: { [META]: { tools } } }) });

test('R001 cases: the member validates exactly when the case says so', () => {
  for (const polarity of ['valid', 'invalid']) {
    for (const { name, input } of load('R001', polarity)) {
      const errors = checkToolEffects(input);
      assert.equal(errors.length === 0, polarity === 'valid', `${polarity}/${name}`);
      for (const e of errors) assert.deepEqual([e.code, e.requirement], ['manifest_invalid', 'HCS-0009-R001']);
    }
  }
});

test('R003 and R004 cases: the annotations follow the mapping; a presentation that differs from it is the invalid case', () => {
  for (const req of ['R003', 'R004']) {
    for (const polarity of ['valid', 'invalid']) {
      for (const { name, level, input } of load(req, polarity)) {
        if (level !== 'document') continue;
        assert.equal(JSON.stringify(annotationsFor(input.declared)) === JSON.stringify(input.annotations), polarity === 'valid', `${req}/${polarity}/${name}`);
      }
    }
  }
});

test('the mapping of section 4', () => {
  assert.deepEqual(annotationsFor({ effect: 'read', openWorld: false }), { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  assert.deepEqual(annotationsFor({ effect: 'additive' }), { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
  assert.deepEqual(annotationsFor({ effect: 'destructive', idempotent: true, 'x-example-a': 1 }), { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true });
});

test('R004: a missing, unknown or malformed declaration is the most dangerous class, even when it has flags', () => {
  for (const declared of [undefined, null, 'read', [], {}, { effect: 'quarantine', idempotent: true, openWorld: false }, { effect: 'READ' }, { effect: 'read', idempotent: 'yes' }, { effect: 'read', reversible: true }]) {
    assert.deepEqual(annotationsFor(declared), FAIL_CLOSED_ANNOTATIONS, JSON.stringify(declared));
  }
  assert.deepEqual(FAIL_CLOSED_ANNOTATIONS, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
});

test('the declaration of a name that is an Object.prototype member is not inherited', () => {
  const classified = classifyTools(server({ list: { effect: 'read' } }), ['list', 'constructor', '__proto__', 'toString']);
  assert.equal(classified.list?.readOnlyHint, true);
  for (const name of ['constructor', '__proto__', 'toString']) assert.deepEqual(Object.getOwnPropertyDescriptor(classified, name)?.value, FAIL_CLOSED_ANNOTATIONS, name);
});

test('classifyTools covers exactly the tools the server lists and ignores declarations for others', () => {
  const classified = classifyTools(server({ list: { effect: 'read' }, gone: { effect: 'read' } }), ['list', 'wipe']);
  assert.deepEqual(Object.keys(classified), ['list', 'wipe']);
  assert.deepEqual(classified.wipe, FAIL_CLOSED_ANNOTATIONS);
});

test('a server.json without the member classifies every tool as the most dangerous (R004)', () => {
  assert.deepEqual(classifyTools(server(), ['list']).list, FAIL_CLOSED_ANNOTATIONS);
  assert.deepEqual(checkServerToolEffects(server()), []);
});

test('an invalid member is manifest_invalid under R001 and classifyTools throws it', () => {
  const bad = server({ list: { effect: 5 } });
  const errors = checkServerToolEffects(bad);
  assert.equal(errors.length, 1);
  assert.deepEqual([errors[0].code, errors[0].requirement, errors[0].details?.['x-hcs-sdk-pointer']], ['manifest_invalid', 'HCS-0009-R001', `/_meta/${META}/tools/list/effect`]);
  assert.throws(() => classifyTools(bad, ['list']), (e: unknown) => e instanceof HcsFailure && e.errors[0].code === 'manifest_invalid');
});
