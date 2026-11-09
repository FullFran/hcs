// Runs every `projection`-level conformance case (HCS-0008; conformance/README.md "Projection cases") through the
// SDK's projectGeneration with a reference adapter that applies the same per-contribution checks as
// conformance/runner/projection.py. The core supplies everything else: unsupported kinds (R004), grants (R012),
// host-owned settings (R007), collisions (R006) and selection (R005, R017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectGeneration, type ContributionProjection, type EngineAdapter, type ProjectionContribution, type SecretInput, type SecretRef, type Setting } from '../../src/projection/index.ts';

const CASES = fileURLToPath(new URL('../../../../conformance/cases/', import.meta.url));
type Json = Record<string, any>;
type Err = { code: string; entry?: string; capability?: string };

const SERVER_REQUIRED = ['name', 'description', 'version'];
// HCS-0001-R005 relative path plus no empty segment (HCS-0008-R021), as in runner/projection.py.
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!(?:.*\/)?\.\.(?:\/|$))(?!.*\/\/)(?!.*\/$)[^\x00]+$/s;

function* withVariables(name: string | undefined, item: Json): Generator<[string | undefined, Json]> {
  yield [name, item];
  for (const [vname, variable] of Object.entries(item.variables ?? {})) yield [vname, variable as Json];
}
function* inputs(descriptor: Json): Generator<[string | undefined, Json]> {
  for (const pkg of descriptor.packages ?? []) {
    for (const key of ['environmentVariables', 'runtimeArguments', 'packageArguments']) for (const item of pkg[key] ?? []) yield* withVariables(item.name ?? item.valueHint, item);
  }
  for (const remote of descriptor.remotes ?? []) {
    for (const item of remote.headers ?? []) yield* withVariables(item.name, item);
    for (const [name, item] of Object.entries(remote.variables ?? {})) yield [name, item as Json];
  }
}
const normalise = (path: string) => path.split('/').filter(segment => segment !== '.').join('/');

// HCS-0008-R021 (manifest_invalid), then R024 and R023 (unsupported_contribution).
function checkFilePackage(descriptor: Json, files: Set<string>, runtimes: Record<string, string[]>): 'manifest_invalid' | 'unsupported_contribution' | undefined {
  const packages = (descriptor.packages ?? []).filter((p: Json) => p.registryType === 'file');
  if (packages.length === 0) return undefined;
  if (packages.length > 1) return 'manifest_invalid';
  const pkg = packages[0], ident = pkg.identifier, transport = pkg.transport;
  if (typeof transport !== 'object' || transport === null || transport.type !== 'stdio' || typeof ident !== 'string' || !RELATIVE_PATH.test(ident) || !files.has(normalise(ident))) return 'manifest_invalid';
  const args = ['packageArguments', 'runtimeArguments'].flatMap(key => pkg[key] ?? []);
  if (args.some((a: Json) => [...withVariables(undefined, a)].some(([, v]) => v.isSecret))) return 'unsupported_contribution';
  const control = typeof pkg.runtimeHint === 'string' ? runtimes[pkg.runtimeHint] : undefined;
  const envNames = new Set((pkg.environmentVariables ?? []).map((e: Json) => e.name));
  if (control === undefined || (pkg.runtimeArguments ?? []).length > 0 || control.some(name => envNames.has(name))) return 'unsupported_contribution';
  return undefined;
}

export function referenceAdapter(kinds: string[], runtimes: Record<string, string[]>): EngineAdapter {
  return {
    kinds,
    project(c: ProjectionContribution, ctx): ContributionProjection {
      if (c.kind === 'skill') {
        const name = String(c.name);
        return { ok: true, settings: [{ name: `skill/${name}`, effect: 'add' }], fragment: { files: [{ path: `skills/${encodeURIComponent(name)}`, link: join(ctx.entry.root, String(c.path ?? `skills/${name}`)) }] } };
      }
      if (c.kind === 'mcp-server') {
        const descriptor = c.descriptor as Json | undefined;
        if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor) || SERVER_REQUIRED.some(k => typeof descriptor[k] !== 'string')) {
          return { ok: false, code: 'manifest_invalid', message: 'server.json lacks a required member', requirement: 'HCS-0008-R010' };
        }
        if ([...inputs(descriptor)].some(([, item]) => item.isSecret && ('value' in item || 'default' in item))) {
          return { ok: false, code: 'manifest_invalid', message: 'secret input with a value or default', requirement: 'HCS-0008-R011' };
        }
        const code = checkFilePackage(descriptor, new Set((c.files as string[] | undefined) ?? []), runtimes);
        if (code) return { ok: false, code, message: `file package refused (${code})`, requirement: code === 'manifest_invalid' ? 'HCS-0008-R021' : 'HCS-0008-R023' };
        const secrets: SecretInput[] = [...inputs(descriptor)].filter(([name, item]) => item.isSecret && name !== undefined).map(([name, item]) => ({ input: name!, required: Boolean(item.isRequired) }));
        const env = Object.fromEntries(secrets.flatMap(s => { const ref = ctx.secretEnv(s.input); return ref ? [[s.input, `\${${ref}}`]] : []; }));
        return { ok: true, identity: descriptor.name, secrets, settings: [{ name: `mcp/${descriptor.name}`, effect: 'add' }],
          fragment: { files: [{ path: `mcp/${encodeURIComponent(descriptor.name)}.json`, content: JSON.stringify({ name: descriptor.name, env }) }] } };
      }
      return { ok: true, settings: (c.settings as Setting[] | undefined) ?? [] };
    },
  };
}

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.json') ? [join(dir, d.name)] : []));
const norm = (errors: Err[]) => errors.map(e => JSON.stringify({ ...(e.capability ? { capability: e.capability } : {}), code: e.code, ...(e.entry ? { entry: e.entry } : {}) })).sort();

export function runCase(input: Json): { errors: Err[]; selected: string[] } {
  const generation = { id: input.generation.id, entries: input.generation.entries.map((e: Json) => ({ id: e.id, root: `/conformance/${input.generation.id}/entries/${e.id}`, contributions: e.contributions })) };
  const secrets: SecretRef[] = Object.entries((input.grantedSecrets ?? {}) as Record<string, string[]>).flatMap(([entry, names]) => names.map((name, i) => ({ entry, input: name, env: `HCS_SECRET_${i}` })));
  const { report } = projectGeneration(generation, referenceAdapter(input.projectableKinds ?? [], input.hostRuntimes ?? {}), undefined,
    { runDir: '/conformance/run', hostOwned: input.hostOwned ?? [], secrets, activationPolicy: input.activationPolicy ?? 'all-or-nothing' });
  return { errors: report.errors, selected: report.selected };
}

test('HCS-0008 projection conformance cases', t => {
  let pass = 0;
  const failures: string[] = [];
  for (const path of walk(CASES).sort()) {
    const c = JSON.parse(readFileSync(path, 'utf8'));
    if (c.level !== 'projection') continue;
    let got: { errors: Err[]; selected: string[] };
    try { got = runCase(c.input); } catch (error) { failures.push(`${path.slice(CASES.length)}: threw ${(error as Error).message}`); continue; }
    const ok = JSON.stringify(norm(got.errors)) === JSON.stringify(norm(c.expect.errors)) && JSON.stringify(got.selected) === JSON.stringify(c.expect.selected);
    if (ok) pass++; else failures.push(`${path.slice(CASES.length)}: got ${JSON.stringify(norm(got.errors))} selected ${JSON.stringify(got.selected)}`);
  }
  const summary = `HCS-0008 projection conformance: ${pass} pass, ${failures.length} fail`;
  t.diagnostic(summary);
  console.log(summary);
  for (const failure of failures) t.diagnostic(`fail: ${failure}`);
  assert.deepEqual(failures, []);
  assert.ok(pass >= 41, `every projection case ran (${pass})`);
});

test('a wrong expectation is detected', () => {
  const input = { projectableKinds: ['skill'], generation: { id: 'g', entries: [{ id: 'dev.x.a', contributions: [{ kind: 'skill', name: 'x' }] }, { id: 'dev.x.b', contributions: [{ kind: 'skill', name: 'x' }] }] } };
  const got = runCase(input);
  assert.deepEqual(norm(got.errors), norm([{ code: 'ambiguous_provider', entry: 'dev.x.a' }, { code: 'ambiguous_provider', entry: 'dev.x.b' }]));
  assert.deepEqual(got.selected, []);
});
