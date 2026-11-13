import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchEnv, projectGeneration, type ProjectedContribution } from '../../src/projection/index.ts';
import { join, resolve, sep } from 'node:path';
import { entry, fakeAdapter, GEN, generation, POLICY, RUN, SERVER, skill, UNKNOWN } from './fake-adapter.ts';

const codes = (errors: { code: string; entry?: string }[]) => errors.map(e => `${e.code} ${e.entry}`).sort();

test('projects every contribution into one plan for the run (R003)', () => {
  const gen = generation(entry('dev.example.notes', skill('notes')), entry('dev.example.search', { kind: SERVER, path: 'mcp/server.json', name: 'search' }));
  const { plan, report } = projectGeneration(gen, fakeAdapter(), undefined, { runDir: RUN });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.selected, ['dev.example.notes', 'dev.example.search']);
  assert.deepEqual(report.contributions.map(c => `${c.entry} ${c.index} ${c.status}`), ['dev.example.notes 0 projected', 'dev.example.search 0 projected']);
  assert.equal(plan.generation, 'gen-7');
  assert.equal(plan.runDir, RUN);
  assert.deepEqual(plan.argv, ['--skill', join(RUN, 'skills', 'notes')]);
  assert.deepEqual(plan.files.map(f => f.path), ['skills/notes', 'servers/search.json']);
  assert.deepEqual(plan.files[0], { path: 'skills/notes', link: join(GEN, 'entries', 'dev.example.notes', 'skills', 'notes') });
});

test('a kind the adapter cannot project is reported unsupported_contribution and does not fail the switch (R004, R005, R017)', () => {
  const gen = generation(entry('dev.example.notes', skill('notes')), entry('dev.example.guard', { kind: UNKNOWN, path: 'p.json' }, skill('guard')));
  const { plan, report } = projectGeneration(gen, fakeAdapter(), undefined, { runDir: RUN });
  assert.deepEqual(codes(report.errors), ['unsupported_contribution dev.example.guard']);
  assert.equal(report.errors[0].requirement, 'HCS-0008-R004');
  assert.deepEqual(report.selected, ['dev.example.notes']);
  assert.deepEqual(report.contributions.map(c => c.status), ['projected', 'reported', 'withheld']);
  // The entry is not active, so none of its contributions reach the plan, not even the projectable one.
  assert.deepEqual(plan.files.map(f => f.path), ['skills/notes']);
});

test('two contributions with the same engine-level name: neither is projected, both entries get ambiguous_provider (R006)', () => {
  const gen = generation(entry('dev.example.a', skill('notes')), entry('dev.example.b', skill('notes')), entry('dev.example.c', skill('other')));
  const partial = projectGeneration(gen, fakeAdapter(), undefined, { runDir: RUN, activationPolicy: 'partial' });
  assert.deepEqual(codes(partial.report.errors), ['ambiguous_provider dev.example.a', 'ambiguous_provider dev.example.b']);
  assert.deepEqual(partial.report.selected, ['dev.example.c']);
  assert.deepEqual(partial.plan.files.map(f => f.path), ['skills/other']);
  // Under all-or-nothing a real failure empties the selection, and the plan.
  const strict = projectGeneration(gen, fakeAdapter(), undefined, { runDir: RUN });
  assert.deepEqual(strict.report.selected, []);
  assert.deepEqual(strict.plan.files, []);
  assert.deepEqual(strict.plan.argv, []);
});

test('two entries writing the same run file or environment variable are a collision too (R006)', () => {
  const file = (id: string) => entry(id, { kind: POLICY, path: 'p', fragment: { files: [{ path: 'shared.json', content: id }] } });
  const env = (id: string) => entry(id, { kind: POLICY, path: 'p', fragment: { env: { SHARED: id } } });
  assert.deepEqual(codes(projectGeneration(generation(file('dev.x.a'), file('dev.x.b')), fakeAdapter(), undefined, { runDir: RUN }).report.errors), ['ambiguous_provider dev.x.a', 'ambiguous_provider dev.x.b']);
  assert.deepEqual(codes(projectGeneration(generation(env('dev.x.a'), env('dev.x.b')), fakeAdapter(), undefined, { runDir: RUN }).report.errors), ['ambiguous_provider dev.x.a', 'ambiguous_provider dev.x.b']);
});

test('a contribution may narrow a host-owned setting but not add, replace, remove or widen it (R007)', () => {
  const policy = (id: string, effect: string) => entry(id, { kind: POLICY, path: 'p', settings: [{ name: 'permission/bash', effect }] });
  for (const effect of ['add', 'replace', 'remove', 'widen']) {
    const { report } = projectGeneration(generation(policy('dev.example.p', effect)), fakeAdapter(), undefined, { runDir: RUN, hostOwned: ['permission/bash'] });
    assert.deepEqual(codes(report.errors), ['permission_denied dev.example.p'], effect);
    assert.equal(report.errors[0].requirement, 'HCS-0008-R007');
  }
  const narrow = projectGeneration(generation(policy('dev.example.p', 'narrow')), fakeAdapter(), undefined, { runDir: RUN, hostOwned: ['permission/bash'] });
  assert.deepEqual(narrow.report.errors, []);
  assert.deepEqual(narrow.report.selected, ['dev.example.p']);
});

test('a generation contribution replaces a host-provided default without a collision (section 6.1)', () => {
  const { report } = projectGeneration(generation(entry('dev.example.notes', skill('notes'))), fakeAdapter(), undefined, { runDir: RUN, hostDefaults: ['skill/notes', 'skill/other'] });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.replacedDefaults, ['skill/notes']);
});

test('an adapter refusal is reported with its code; manifest_invalid is a failure under all-or-nothing', () => {
  const gen = generation(entry('dev.example.notes', skill('notes')), entry('dev.example.bad', { kind: SERVER, path: 'mcp/server.json' }));
  const { report } = projectGeneration(gen, fakeAdapter(), undefined, { runDir: RUN });
  assert.deepEqual(codes(report.errors), ['manifest_invalid dev.example.bad']);
  assert.equal(report.errors[0].requirement, 'HCS-0008-R010');
  assert.deepEqual(report.selected, []);
});

test('a secret reaches the run only by reference: the plan names the environment variable, never the value (R012, R024)', () => {
  const VALUE = 'sk-live-0123456789';
  const gen = generation(entry('dev.example.search', { kind: SERVER, path: 'mcp/server.json', name: 'search', secret: 'SEARCH_TOKEN' }));
  const { plan, report } = projectGeneration(gen, fakeAdapter(), undefined, { runDir: RUN, secrets: [{ entry: 'dev.example.search', input: 'SEARCH_TOKEN', env: 'HCS_SECRET_SEARCH' }] });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(plan.secrets, [{ entry: 'dev.example.search', input: 'SEARCH_TOKEN', env: 'HCS_SECRET_SEARCH' }]);
  const server = plan.files.find(f => f.path === 'servers/search.json');
  assert.ok(server && 'content' in server);
  assert.match(String(server.content), /\$\{HCS_SECRET_SEARCH\}/);
  const env = launchEnv(plan, ref => (ref.entry === 'dev.example.search' && ref.input === 'SEARCH_TOKEN' ? VALUE : undefined));
  assert.equal(env.HCS_SECRET_SEARCH, VALUE);
  const serialized = JSON.stringify({ ...plan, files: plan.files.map(f => ('content' in f ? { ...f, content: String(f.content) } : f)) });
  assert.ok(!serialized.includes(VALUE), 'the plan holds no secret value');
  assert.throws(() => launchEnv(plan, () => undefined), /HCS_SECRET_SEARCH/);
});

test('a required secret the host did not grant to that entry is permission_denied; an optional one is left out (R012)', () => {
  const server = (required: boolean) => generation(entry('dev.example.search', { kind: SERVER, path: 'mcp/server.json', name: 'search', secret: 'SEARCH_TOKEN', required }));
  const otherEntry = [{ entry: 'dev.example.other', input: 'SEARCH_TOKEN', env: 'HCS_SECRET_SEARCH' }];
  const denied = projectGeneration(server(true), fakeAdapter(), undefined, { runDir: RUN, secrets: otherEntry });
  assert.deepEqual(codes(denied.report.errors), ['permission_denied dev.example.search']);
  assert.equal(denied.report.errors[0].requirement, 'HCS-0008-R012');
  const optional = projectGeneration(server(false), fakeAdapter(), undefined, { runDir: RUN, secrets: otherEntry });
  assert.deepEqual(optional.report.errors, []);
  assert.deepEqual(optional.plan.secrets, []);
});

test('assemble runs once over the contributions of the selected entries only', () => {
  const assembled: ProjectedContribution[][] = [];
  const gen = generation(entry('dev.example.notes', skill('notes')), entry('dev.example.guard', { kind: UNKNOWN, path: 'p' }));
  const { plan } = projectGeneration(gen, fakeAdapter({ assembled, assemble: { files: [{ path: 'engine.json', content: '{}' }], argv: ['--config', join(RUN, 'engine.json')] } }), undefined, { runDir: RUN });
  assert.equal(assembled.length, 1);
  assert.deepEqual(assembled[0].map(p => p.entry), ['dev.example.notes']);
  assert.deepEqual(plan.files.map(f => f.path), ['skills/notes', 'engine.json']);
  assert.deepEqual(plan.argv, ['--skill', join(RUN, 'skills', 'notes'), '--config', join(RUN, 'engine.json')]);
});

test('the plan is complete and self-contained: files stay in the run directory, links point into the generation (R001, R025)', () => {
  const bad = (fragment: unknown) => generation(entry('dev.example.p', { kind: POLICY, path: 'p', fragment }));
  for (const fragment of [
    { files: [{ path: '../outside.json', content: '{}' }] },
    { files: [{ path: '/etc/engine.json', content: '{}' }] },
    { files: [{ path: 'skills/x', link: join(resolve('/home/someone'), '.config', 'engine', 'skills', 'x') }] },
    { files: [{ path: 'skills/x', link: join(resolve('/hcs/generations/active'), 'entries', 'dev.example.p', 'skills', 'x') }] },
    { files: [{ path: 'skills/x', link: [join(GEN, 'entries', 'dev.example.p'), '..', '..', '..', '8', 'x'].join(sep) }] },
  ]) assert.throws(() => projectGeneration(bad(fragment), fakeAdapter(), undefined, { runDir: RUN }), TypeError, JSON.stringify(fragment));
  assert.throws(() => projectGeneration(generation(), fakeAdapter(), undefined, { runDir: 'relative/run' }), TypeError);
});
