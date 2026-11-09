import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate } from '../src/authority.ts';
import { grantPermission, readGrants, revokePermission } from '../src/grants.ts';
import { TEST_PERMISSIONS, TEST_RESERVED_PERMISSION } from './fixtures/host.ts';

const entry = 'example.package';
const permission = TEST_PERMISSIONS[0];
const check = { entry, permission };

test('authority requires the exact entry and permission (R001)', () => {
  for (const grants of [[], [{ entry: 'other.package', permission }], [{ entry, permission: TEST_PERMISSIONS[1] }]]) {
    const result = evaluate(check, grants);
    assert.equal(result.allow, false);
    if (!result.allow) assert.deepEqual(result.error, { code: 'permission_denied', message: `Permission denied: ${permission}`, entry, requirement: 'HCS-0005-R001' });
  }
  assert.deepEqual(evaluate(check, [{ entry, permission }]), { allow: true });
});

test('a matching stored denial wins over a grant, and session-limited ones match only their session (R007, R008)', () => {
  const denied = { allow: false, error: { code: 'permission_denied', message: `Permission denied: ${permission}`, entry, requirement: 'HCS-0005-R007' } };
  assert.deepEqual(evaluate(check, [check], [check]), denied);
  assert.deepEqual(evaluate({ ...check, session: 's1' }, [check], [{ ...check, session: 's1' }]), denied);
  assert.deepEqual(evaluate({ ...check, session: 's2' }, [check], [{ ...check, session: 's1' }]), { allow: true });
  assert.deepEqual(evaluate(check, [check], [{ ...check, permission: TEST_PERMISSIONS[1] }]), { allow: true });
  assert.deepEqual(evaluate({ ...check, session: 's1' }, [{ ...check, session: 's1' }]), { allow: true });
  for (const other of [check, { ...check, session: 's2' }]) {
    const result = evaluate(other, [{ ...check, session: 's1' }]);
    assert.equal(result.allow, false);
    if (!result.allow) assert.equal(result.error.requirement, 'HCS-0005-R001');
  }
});

test('requests, allowed-tools, and extension members do not grant authority (R002, R004)', () => {
  const request = { permission, 'x-autogrant': true, 'allowed-tools': [permission] };
  const input = { requests: [request], 'allowed-tools': [permission], 'x-autogrant': [check], grants: [] };
  assert.equal(evaluate(check, input.grants).allow, false);
  const extended = [{ entry: 'other.package', permission, 'x-autogrant': true }];
  assert.equal(evaluate(check, extended).allow, false);
});

test('persistent grants are read fresh and revocation affects the next check (R003)', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-authority-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(readGrants(dir, TEST_PERMISSIONS), []);
  assert.equal(evaluate(check, readGrants(dir, TEST_PERMISSIONS)).allow, false);
  grantPermission(dir, entry, permission, TEST_PERMISSIONS);
  grantPermission(dir, entry, permission, TEST_PERMISSIONS);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'grants.json'), 'utf8')), { grants: [check] });
  assert.equal(evaluate(check, readGrants(dir, TEST_PERMISSIONS)).allow, true);
  revokePermission(dir, entry, permission, TEST_PERMISSIONS);
  assert.deepEqual(readGrants(dir, TEST_PERMISSIONS), []);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'grants.json'), 'utf8')), { grants: [] });
  assert.equal(evaluate(check, readGrants(dir, TEST_PERMISSIONS)).allow, false);
});

test('review and unknown permissions cannot be granted', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-authority-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  grantPermission(dir, entry, permission, TEST_PERMISSIONS);
  for (const forbidden of [TEST_RESERVED_PERMISSION, 'example.unknown']) {
    assert.throws(() => grantPermission(dir, entry, forbidden, TEST_PERMISSIONS));
    assert.deepEqual(readGrants(dir, TEST_PERMISSIONS), [check]);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'grants.json'), 'utf8')), { grants: [check] });
  }
});

test('only the permissions the caller declares grantable can be granted or read back', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-authority-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const custom = ['dev.acme.custom'];
  assert.throws(() => grantPermission(dir, entry, 'dev.acme.custom', TEST_PERMISSIONS), /cannot be granted/);
  grantPermission(dir, entry, 'dev.acme.custom', custom);
  assert.deepEqual(readGrants(dir, custom), [{ entry, permission: 'dev.acme.custom' }]);
  assert.throws(() => readGrants(dir, TEST_PERMISSIONS), /Invalid grants file/);
  revokePermission(dir, entry, 'dev.acme.custom', custom);
  assert.deepEqual(readGrants(dir, TEST_PERMISSIONS), []);
});
