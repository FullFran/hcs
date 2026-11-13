// A fake engine adapter for the projection tests. Its "engine" reads skills from `<runDir>/skills/<name>` (links),
// servers from `<runDir>/servers/<name>.json`, and policy settings as stated by the contribution.
import { join, resolve } from 'node:path';
import type { ContributionProjection, EngineAdapter, PlanFragment, ProjectionContribution, ProjectionEntry, ProjectionGeneration, ProjectedContribution, Setting } from '../../src/projection/index.ts';

export const SKILL = 'skill';
export const SERVER = 'x-test-server';
export const POLICY = 'x-test-policy';
export const UNKNOWN = 'x-test-unknown';

export function fakeAdapter(options: { kinds?: string[]; assembled?: ProjectedContribution[][]; project?: (c: ProjectionContribution) => ContributionProjection | undefined; assemble?: PlanFragment } = {}): EngineAdapter {
  return {
    kinds: options.kinds ?? [SKILL, SERVER, POLICY],
    project(c, ctx) {
      const custom = options.project?.(c);
      if (custom) return custom;
      if (c.kind === SKILL) {
        const name = String(c.name);
        return { ok: true, settings: [{ name: `skill/${name}`, effect: 'add' }], fragment: {
          files: [{ path: `skills/${name}`, link: join(ctx.entry.root, String(c.path)) }],
          argv: ['--skill', join(ctx.runDir, 'skills', name)],
        } };
      }
      if (c.kind === SERVER) {
        if (typeof c.name !== 'string') return { ok: false, code: 'manifest_invalid', message: 'server without a name', requirement: 'HCS-0008-R010' };
        const secret = typeof c.secret === 'string' ? c.secret : undefined;
        const env = secret ? ctx.secretEnv(secret) : undefined;
        const config = { command: join(ctx.entry.root, 'server.mjs'), env: env ? { TOKEN: `\${${env}}` } : {} };
        return { ok: true, identity: c.name, settings: [{ name: `mcp/${c.name}`, effect: 'add' }],
          secrets: secret ? [{ input: secret, required: c.required !== false }] : [],
          fragment: { files: [{ path: `servers/${c.name}.json`, content: JSON.stringify(config) }], env: (c.env as Record<string, string> | undefined) ?? {} } };
      }
      return { ok: true, settings: (c.settings as Setting[] | undefined) ?? [], fragment: (c.fragment as PlanFragment | undefined) ?? {} };
    },
    assemble(projected) {
      options.assembled?.push(projected);
      return options.assemble ?? {};
    },
  };
}

export const entry = (id: string, ...contributions: ProjectionContribution[]): ProjectionEntry =>
  ({ id, root: join(GEN, 'entries', id), contributions });
export const skill = (name: string): ProjectionContribution => ({ kind: SKILL, path: `skills/${name}`, name });
export const generation = (...entries: ProjectionEntry[]): ProjectionGeneration => ({ id: 'gen-7', entries });
// Absolute paths of the platform the tests run on (`D:\hcs\...` on Windows).
export const GEN = resolve('/hcs/generations/7');
export const RUN = resolve('/hcs/runs/gen-7-a');
