// HCS-0008 projection core: turns one generation into a launch plan for one engine run through an engine adapter,
// and reports every contribution as projected or with an HCS-0006 error. Engine knowledge stays in the adapter.
import { isAbsolute, posix } from 'node:path';
import { hcsError, type HcsError, type HcsErrorCode } from '../errors.ts';
import { levelRank, validateHostLock, type HostLock } from './host-lock.ts';
import type {
  ContributionContext, ContributionOutcome, EngineAdapter, LaunchPlan, PlanFile, PlanFragment, ProjectedContribution,
  ProjectionGeneration, ProjectionResult, ProjectOptions, SecretRef, Setting,
} from './types.ts';

const CLAIMING = new Set(['add', 'replace']);
const FORBIDDEN_ON_HOST_OWNED = new Set(['add', 'replace', 'remove', 'widen']);
const FORBIDDEN_UNDER_CEILING = new Set(['remove', 'widen']);

interface Accepted { entry: string; index: number; projected: ProjectedContribution; fragment: PlanFragment; secrets: SecretRef[] }

// A relative path that stays inside the run directory: no absolute path, backslash, empty, `.` or `..` segment.
function checkRunPath(path: string): void {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.includes('\\') || path.includes('\0')
      || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`Adapter placed a file outside the run directory: ${JSON.stringify(path)}`);
  }
}

// A link target must name content inside the generation by its identifier (R001), never a user-global location
// (R025) or a pointer the host moves.
function checkLinkTarget(target: string, roots: string[]): void {
  const inside = typeof target === 'string' && target.startsWith('/') && posix.normalize(target) === target
    && roots.some(root => target === root || target.startsWith(`${root}/`));
  if (!inside) throw new TypeError(`Adapter linked outside the generation: ${JSON.stringify(target)}`);
}

function checkFragment(fragment: PlanFragment, roots: string[]): void {
  for (const file of fragment.files ?? []) {
    checkRunPath(file.path);
    if ('link' in file) checkLinkTarget(file.link, roots);
  }
  if (fragment.argv !== undefined && !(Array.isArray(fragment.argv) && fragment.argv.every(arg => typeof arg === 'string'))) throw new TypeError('Adapter argv must be strings');
  for (const value of Object.values(fragment.env ?? {})) if (typeof value !== 'string') throw new TypeError('Adapter environment values must be strings');
}

export function projectGeneration(generation: ProjectionGeneration, adapter: EngineAdapter, hostLock: HostLock | undefined, options: ProjectOptions): ProjectionResult {
  if (!isAbsolute(options.runDir) || posix.normalize(options.runDir) !== options.runDir.replace(/\/$/, '')) throw new TypeError(`Run directory must be an absolute normalized path: ${options.runDir}`);
  const runDir = options.runDir.replace(/(.)\/$/, '$1');
  if (hostLock !== undefined) {
    const problems = validateHostLock(hostLock);
    if (problems.length > 0) throw new TypeError(`Invalid host lock: ${problems.join('; ')}`);
  }
  for (const entry of generation.entries) {
    if (!isAbsolute(entry.root) || posix.normalize(entry.root) !== entry.root) throw new TypeError(`Entry root must be an absolute normalized path: ${entry.root}`);
  }
  const roots = generation.entries.map(entry => entry.root);
  const hostOwned = new Set([...(options.hostOwned ?? []), ...(hostLock?.reserved ?? [])]);
  const ceilings = hostLock?.ceilings ?? {};
  const lockEnv = hostLock?.env ?? {};
  const grants = (options.secrets ?? []).filter(grant => hostLock?.secrets === undefined
    || hostLock.secrets.some(ref => ref.entry === grant.entry && ref.input === grant.input && ref.env === grant.env));
  const secretEnvNames = new Set(grants.map(grant => grant.env));

  const errors: HcsError[] = [];
  const failed = new Set<string>();
  const unprojected = new Set<string>();
  const outcomes: ContributionOutcome[] = [];
  const accepted: Accepted[] = [];
  const claims = { names: new Map<string, Set<string>>(), files: new Map<string, Set<string>>(), env: new Map<string, Set<string>>() };

  const report = (code: HcsErrorCode, entry: string, message: string, requirement?: string) => {
    if (!errors.some(error => error.code === code && error.entry === entry)) {
      errors.push(hcsError(code, message, requirement === undefined ? { entry } : { entry, requirement }));
    }
    if (code === 'unsupported_contribution') unprojected.add(entry); // R017: reported, not a failure
    else failed.add(entry);
  };
  const claim = (map: Map<string, Set<string>>, key: string, entry: string) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(entry);
  };

  for (const entry of generation.entries) {
    const eid = entry.id;
    const secretEnv = (input: string) => grants.find(grant => grant.entry === eid && grant.input === input)?.env;
    const context: ContributionContext = { generation: generation.id, entry, runDir, secretEnv };
    entry.contributions.forEach((contribution, index) => {
      const outcome: ContributionOutcome = { entry: eid, index, kind: contribution.kind, status: 'reported' };
      outcomes.push(outcome);
      const refuse = (code: HcsErrorCode, message: string, requirement?: string) => { outcome.code = code; report(code, eid, message, requirement); };

      if (!adapter.kinds.includes(contribution.kind)) {                                   // R003, R004
        return refuse('unsupported_contribution', `The engine cannot take contributions of kind ${contribution.kind}`, 'HCS-0008-R004');
      }
      const result = adapter.project(contribution, context);
      if (!result.ok) return refuse(result.code, result.message, result.requirement);
      const missing = (result.secrets ?? []).find(secret => secret.required && secretEnv(secret.input) === undefined);
      if (missing) return refuse('permission_denied', `Required secret ${missing.input} is not granted to ${eid}`, 'HCS-0008-R012');
      const allowed = hostLock?.allow?.[contribution.kind];
      if (allowed !== undefined && (result.identity === undefined || !allowed.includes(result.identity))) {
        return refuse('permission_denied', `The host lock does not allow ${contribution.kind} ${result.identity ?? '(unnamed)'}`);
      }
      const fragment = result.fragment ?? {};
      checkFragment(fragment, roots);
      const settings: Setting[] = result.settings;
      for (const setting of settings) {
        if (hostOwned.has(setting.name) && FORBIDDEN_ON_HOST_OWNED.has(setting.effect)) {  // R007; narrowing is allowed
          return refuse('permission_denied', `Contribution would ${setting.effect} host-owned setting ${setting.name}`, 'HCS-0008-R007');
        }
        const ceiling = ceilings[setting.name];
        if (ceiling !== undefined && (FORBIDDEN_UNDER_CEILING.has(setting.effect) || (setting.level !== undefined && levelRank(setting.level) > levelRank(ceiling)))) {
          return refuse('permission_denied', `Contribution would raise ${setting.name} above the host ceiling ${ceiling}`, 'HCS-0008-R007');
        }
      }
      for (const name of Object.keys(fragment.env ?? {})) {
        if (name in lockEnv || secretEnvNames.has(name)) return refuse('permission_denied', `Contribution would set host-owned environment variable ${name}`, 'HCS-0008-R007');
      }
      for (const setting of settings) if (!hostOwned.has(setting.name) && CLAIMING.has(setting.effect)) claim(claims.names, setting.name, eid);
      for (const file of fragment.files ?? []) claim(claims.files, file.path, eid);
      for (const name of Object.keys(fragment.env ?? {})) claim(claims.env, name, eid);
      const secrets = (result.secrets ?? []).flatMap(secret => grants.filter(grant => grant.entry === eid && grant.input === secret.input));
      outcome.status = 'projected';
      accepted.push({ entry: eid, index, fragment, secrets, projected: { entry: eid, contribution, settings, ...(result.identity !== undefined ? { identity: result.identity } : {}) } });
    });
  }

  // R006: the same engine-level name, run file or environment variable from two entries projects neither.
  const ambiguous = new Set<string>();
  for (const [kind, map] of Object.entries(claims)) {
    for (const [name, owners] of [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (owners.size < 2) continue;
      for (const eid of [...owners].sort()) {
        ambiguous.add(eid);
        report('ambiguous_provider', eid, `Two entries project the same ${kind === 'names' ? 'engine-level name' : kind === 'files' ? 'run file' : 'environment variable'} ${name}`, 'HCS-0008-R006');
      }
    }
  }
  for (const outcome of outcomes) {
    if (outcome.status === 'projected' && ambiguous.has(outcome.entry)) { outcome.status = 'reported'; outcome.code = 'ambiguous_provider'; }
  }

  const ids = generation.entries.map(entry => entry.id);
  const selected = (options.activationPolicy ?? 'all-or-nothing') === 'partial'
    ? ids.filter(id => !failed.has(id) && !unprojected.has(id))                         // R005
    : failed.size > 0 ? [] : ids.filter(id => !unprojected.has(id));                     // R017
  const chosen = new Set(selected);
  for (const outcome of outcomes) if (outcome.status === 'projected' && !chosen.has(outcome.entry)) outcome.status = 'withheld';

  const parts = accepted.filter(item => chosen.has(item.entry));
  const plan: LaunchPlan = { generation: generation.id, runDir, argv: [...(hostLock?.argv ?? [])], env: { ...lockEnv }, secrets: [], files: [] };
  const add = (fragment: PlanFragment) => {
    for (const file of fragment.files ?? []) {
      if (plan.files.some(existing => existing.path === file.path)) throw new TypeError(`Adapter placed two files at ${file.path}`);
      plan.files.push({ ...file } as PlanFile);
    }
    plan.argv.push(...(fragment.argv ?? []));
    for (const [name, value] of Object.entries(fragment.env ?? {})) {
      if (name in plan.env || secretEnvNames.has(name)) throw new TypeError(`Adapter set environment variable ${name} twice`);
      plan.env[name] = value;
    }
  };
  for (const part of parts) {
    add(part.fragment);
    for (const ref of part.secrets) if (!plan.secrets.some(s => s.entry === ref.entry && s.input === ref.input)) plan.secrets.push({ ...ref });
  }
  if (adapter.assemble) {
    const fragment = adapter.assemble(parts.map(part => part.projected), { generation: generation.id, runDir, secrets: plan.secrets.map(ref => ({ ...ref })) });
    checkFragment(fragment, roots);
    add(fragment);
  }

  const defaults = new Set(options.hostDefaults ?? []);
  const replacedDefaults = [...new Set(parts.flatMap(part => part.projected.settings).filter(s => CLAIMING.has(s.effect) && defaults.has(s.name)).map(s => s.name))];
  return { plan, report: { errors, contributions: outcomes, selected, replacedDefaults } };
}
