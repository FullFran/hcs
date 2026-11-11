import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkServerJson, readServerJson, serverJsonSecretInputs, HcsFailure } from '../src/index.ts';

const SENTINEL = 'sentinel-secret-value-1234';
const base = (extra: Record<string, unknown> = {}) => ({ name: 'io.example/notes', description: 'Notes server', version: '1.0.0', ...extra });
const pkg = (extra: Record<string, unknown> = {}) => ({ registryType: 'oci', identifier: 'registry.example/notes:1.0.0', transport: { type: 'stdio' }, ...extra });
const summary = (doc: unknown, prefix?: string) => checkServerJson(doc, prefix).map(e => [e.code, e.requirement, e.details?.[`${prefix ?? 'x-hcs-sdk'}-pointer`]]);

test('a document with the required members and no secret values passes (HCS-0008-R010, R011)', () => {
  assert.deepEqual(checkServerJson(base()), []);
  assert.deepEqual(checkServerJson(base({ packages: [pkg({ environmentVariables: [{ name: 'NOTES_TOKEN', isSecret: true, isRequired: true }] })] })), []);
});

test('a non-secret input may carry a value or a default', () => {
  assert.deepEqual(checkServerJson(base({ packages: [pkg({ environmentVariables: [{ name: 'LOG_LEVEL', value: 'info', default: 'warn' }] })] })), []);
});

test('a document that is not an object or lacks a required string member is manifest_invalid under R010', () => {
  for (const doc of [null, [], 'x', base({ version: undefined }), base({ name: 1 }), base({ packages: {} }), base({ remotes: 'x' })]) {
    const errors = checkServerJson(doc);
    assert.equal(errors.length, 1, JSON.stringify(doc));
    assert.deepEqual([errors[0].code, errors[0].requirement], ['manifest_invalid', 'HCS-0008-R010']);
  }
});

test('every secret input with a value or a default is one manifest_invalid error under R011, wherever it is declared', () => {
  const doc = base({
    packages: [pkg({
      environmentVariables: [{ name: 'A', isSecret: true, value: SENTINEL }, { name: 'B', isSecret: true, default: SENTINEL }, { name: 'C', isSecret: true, value: '' }],
      packageArguments: [{ type: 'named', name: '--token', value: '{tok}', variables: { tok: { isSecret: true, default: SENTINEL } } }],
    })],
    remotes: [{ type: 'streamable-http', url: 'https://notes.example/{tenant}', headers: [{ name: 'Authorization', isSecret: true, value: SENTINEL }], variables: { tenant: { isSecret: true, default: SENTINEL } } }],
  });
  assert.deepEqual(summary(doc), [
    ['manifest_invalid', 'HCS-0008-R011', '/packages/0/environmentVariables/0'],
    ['manifest_invalid', 'HCS-0008-R011', '/packages/0/environmentVariables/1'],
    ['manifest_invalid', 'HCS-0008-R011', '/packages/0/environmentVariables/2'],
    ['manifest_invalid', 'HCS-0008-R011', '/packages/0/packageArguments/0/variables/tok'],
    ['manifest_invalid', 'HCS-0008-R011', '/remotes/0/headers/0'],
    ['manifest_invalid', 'HCS-0008-R011', '/remotes/0/variables/tenant'],
  ]);
  assert.ok(!JSON.stringify(checkServerJson(doc)).includes(SENTINEL), 'errors never echo a value');
});

test('error pointers use the caller detail prefix, and an invalid prefix is refused', () => {
  assert.deepEqual(summary(base({ name: 1 }), 'x-acme'), [['manifest_invalid', 'HCS-0008-R010', '/name']]);
  assert.throws(() => checkServerJson(base(), 'acme'), RangeError);
});

test('readServerJson lists the inputs by kind and serverJsonSecretInputs gives the projection shape', () => {
  const report = readServerJson(base({
    packages: [pkg({
      environmentVariables: [{ name: 'NOTES_TOKEN', isSecret: true, isRequired: true }, { name: 'LOG_LEVEL', value: 'info' }],
      runtimeArguments: [{ type: 'positional', valueHint: 'port' }],
    })],
    remotes: [{ type: 'sse', url: 'https://notes.example/{region}', headers: [{ name: 'X-Key', isSecret: true }], variables: { region: { isRequired: true } } }],
  }));
  assert.equal(report.name, 'io.example/notes');
  assert.deepEqual(report.inputs.map(i => [i.kind, i.name, i.pointer, i.isRequired, i.isSecret]), [
    ['environment', 'NOTES_TOKEN', '/packages/0/environmentVariables/0', true, true],
    ['environment', 'LOG_LEVEL', '/packages/0/environmentVariables/1', false, false],
    ['argument', 'port', '/packages/0/runtimeArguments/0', false, false],
    ['header', 'X-Key', '/remotes/0/headers/0', false, true],
    ['variable', 'region', '/remotes/0/variables/region', true, false],
  ]);
  assert.deepEqual(serverJsonSecretInputs(report), [{ input: 'NOTES_TOKEN', required: true }, { input: 'X-Key', required: false }]);
});

test('readServerJson throws HcsFailure with the same errors as checkServerJson', () => {
  const doc = base({ packages: [pkg({ environmentVariables: [{ name: 'A', isSecret: true, value: SENTINEL }] })] });
  assert.throws(() => readServerJson(doc), (e: unknown) => e instanceof HcsFailure && JSON.stringify(e.errors) === JSON.stringify(checkServerJson(doc)) && !e.message.includes(SENTINEL));
});
