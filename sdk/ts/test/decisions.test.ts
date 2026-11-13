// Exhaustive tables for the SDK's pure decision functions. Each test enumerates every combination of a small input
// domain that still covers every case the requirement distinguishes, and checks the SDK against an oracle written
// from the spec text (not from the implementation), so a change in a decision cannot pass silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { evaluate, type Check, type Grant } from '../src/authority.ts';
import { planRecovery, type HostFactsInput, type RecordedStop } from '../src/host-state.ts';
import { ALLOWED_TRANSITIONS, ENTRY_STATES, canTransition } from '../src/lifecycle.ts';
import { ProposalRefusal, answerProposal, digestPayload, proposeUndo, submitProposal, type Proposal, type ProposalInput } from '../src/proposals.ts';
import { FAIL_CLOSED_ANNOTATIONS, annotationsFor, type ToolAnnotations } from '../src/tool-effects.ts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');

const product = <T extends unknown[][]>(...lists: T): { [K in keyof T]: T[K][number] }[] =>
  lists.reduce<unknown[][]>((acc, list) => acc.flatMap(prefix => list.map(item => [...prefix, item])), [[]]) as never;
const subsets = <T>(items: readonly T[]): T[][] =>
  items.reduce<T[][]>((acc, item) => acc.flatMap(subset => [subset, [...subset, item]]), [[]]);
const outcome = (run: () => unknown): unknown => {
  try { return run(); } catch (error) { if (error instanceof ProposalRefusal) return `refused:${error.reason}`; throw error; }
};

// ---- HCS-0008 section 7.1: recovery after a restart (R032 to R035) ----

// Every relation between three generation slots and the failed and on-disk sets: ids 1 to 3 or none in each slot.
const GENERATIONS = [null, 1, 2, 3] as const;
const STOPS: (RecordedStop | null | undefined)[] = [undefined, null, { generation: 1, reason: 'no-confirmed' }, { generation: 2, reason: 'return-failed' }];
const recoveryDomain = product([...GENERATIONS], [...GENERATIONS], [...GENERATIONS], subsets([1, 2, 3]), STOPS, subsets([1, 2, 3]))
  .map(([active, confirmed, pending, failed, stopped, onDisk]) => ({ facts: { active, confirmed, pending, failed, ...(stopped === undefined ? {} : { stopped }) } as HostFactsInput, onDisk }));

// R033 read as a decision list: item 5 first (it outranks the others), item 4 before item 1 (section 7.1),
// R035 when item 4 has nothing to return to; a host with no active generation has nothing to check.
function expectedRecovery({ active, confirmed, pending, failed, stopped }: HostFactsInput): { action: string; generation: number | null } {
  if (stopped) return { action: 'stop-and-report', generation: active };
  if (active === null) return pending === null ? { action: 'start', generation: null } : { action: 'discard-pending', generation: pending };
  if (failed.includes(active)) {
    const returnable = confirmed !== null && confirmed !== active && !failed.includes(confirmed);
    return { action: returnable ? 'return' : 'stop-and-report', generation: active };
  }
  if (pending === active) return { action: 'health-check', generation: active }; // item 1
  if (pending !== null) return { action: 'discard-pending', generation: pending }; // item 2
  if (active !== confirmed) return { action: 'health-check', generation: active }; // item 3
  return { action: 'start', generation: active };
}

test('planRecovery decides every combination of persisted facts as R033 lists them (R032, R033, R035)', () => {
  for (const { facts, onDisk } of recoveryDomain) {
    const plan = planRecovery(facts, onDisk);
    const where = JSON.stringify({ facts, onDisk });
    assert.deepEqual({ action: plan.action, generation: plan.generation }, expectedRecovery(facts), where);
    assert.equal(plan.returnTo, facts.confirmed, where);
    // R032: a generation recorded as failed is never started nor checked; R033: nothing unconfirmed starts.
    if (plan.action === 'start' && plan.generation !== null) assert.ok(plan.generation === facts.confirmed && facts.pending === null, where);
    if (plan.action === 'start' || plan.action === 'health-check') assert.ok(!facts.failed.includes(plan.generation!), where);
    if (plan.action === 'return') assert.ok(plan.returnTo !== null && !facts.failed.includes(plan.returnTo), where);
    if (facts.stopped) assert.equal(plan.action, 'stop-and-report', where);
  }
});

test('planRecovery retains exactly the active, pending and confirmed generations on disk and every failed record (R034)', () => {
  for (const { facts, onDisk } of recoveryDomain) {
    const plan = planRecovery(facts, onDisk);
    const keep = [...new Set([facts.active, facts.pending, facts.confirmed])].filter(g => g !== null && onDisk.includes(g)).sort();
    assert.deepEqual(plan.retain, keep, JSON.stringify({ facts, onDisk }));
    assert.deepEqual(plan.failed, [...facts.failed].sort());
    // The order and repetition of the failed records change nothing.
    assert.deepEqual(planRecovery({ ...facts, failed: [...facts.failed, ...facts.failed].reverse() }, [...onDisk].reverse()), plan);
  }
});

// planRecovery mirrors conformance/runner/recovery.py, which runs the `recovery` conformance cases: both must give
// the same plan for every input, or the SDK and the reference disagree on what the cases mean.
test('planRecovery and the reference conformance/runner/recovery.py agree on every combination', t => {
  const python = ['python3', 'python'].find(cmd => spawnSync(cmd, ['--version']).status === 0);
  if (!python) { t.skip('no python3 or python on PATH'); return; }
  const script = 'import json, sys; sys.path.insert(0, sys.argv[1]); from recovery import recover\n'
    + 'print(json.dumps([recover({"persisted": c["facts"], "onDisk": c["onDisk"]}) for c in json.load(sys.stdin)]))';
  const run = spawnSync(python, ['-I', '-c', script, resolve(REPO, 'conformance', 'runner')], { input: JSON.stringify(recoveryDomain), encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(run.status, 0, run.stderr);
  const reference = JSON.parse(run.stdout) as unknown[];
  assert.equal(reference.length, recoveryDomain.length);
  recoveryDomain.forEach(({ facts, onDisk }, i) => assert.deepEqual(planRecovery(facts, onDisk), reference[i], JSON.stringify({ facts, onDisk })));
});

// ---- HCS-0005: the authority decision (R001, R007, R008) ----

test('evaluate allows exactly when a held grant matches and no held denial does, for every holding (R001, R007, R008)', () => {
  // Held objects covering every relation to a check: same or other entry, same or other permission, and no
  // session, the check's session or another session.
  const held: Grant[] = product(['dev.a', 'dev.b'], ['perm.p', 'perm.q'], [undefined, 's1', 's2'])
    .map(([entry, permission, session]) => ({ entry, permission, ...(session === undefined ? {} : { session }) }));
  const checks: Check[] = [undefined, 's1', 's2'].map(session => ({ entry: 'dev.a', permission: 'perm.p', ...(session === undefined ? {} : { session }) }));
  const matches = (check: Check, h: Grant) => h.entry === check.entry && h.permission === check.permission && (h.session === undefined || h.session === check.session);
  const denialSets: Grant[][] = [[], ...held.map(h => [h]), held];
  let count = 0;
  for (const check of checks) for (const grants of subsets(held)) for (const denials of denialSets) {
    const denied = denials.some(d => matches(check, d));
    const allow = !denied && grants.some(g => matches(check, g));
    const decision = evaluate(check, grants, denials);
    count++;
    if (allow) { assert.deepEqual(decision, { allow: true }); continue; }
    assert.equal(decision.allow, false);
    if (decision.allow) continue;
    assert.equal(decision.error.code, 'permission_denied');
    assert.equal(decision.error.entry, check.entry);
    assert.equal(decision.error.requirement, denied ? 'HCS-0005-R007' : 'HCS-0005-R001');
  }
  assert.equal(count, 3 * 4096 * 14);
});

// ---- HCS-0004: the entry state machine ----

test('canTransition allows exactly the transitions of the HCS-0004 state diagram, and nothing for unknown states', () => {
  const diagram = new Set(['discovered>validated', 'validated>resolved', 'resolved>authorized', 'authorized>prepared', 'prepared>active',
    'active>draining', 'draining>stopped', 'discovered>failed', 'validated>failed', 'resolved>failed', 'authorized>failed', 'prepared>failed',
    'active>failed', 'draining>failed']);
  const states = [...ENTRY_STATES, 'unknown', '', 'constructor', '__proto__', 'toString'];
  for (const [from, to] of product(states, states)) assert.equal(canTransition(from, to), diagram.has(`${from}>${to}`), `${from} -> ${to}`);
  assert.deepEqual(Object.keys(ALLOWED_TRANSITIONS), [...ENTRY_STATES]);
});

// ---- HCS-0009: effect classes to MCP annotations (R003, R004) ----

test('annotationsFor gives the section 4 table for every usable declaration and fails closed for everything else (R003, R004)', () => {
  const ABSENT = Symbol('absent');
  const effects = [ABSENT, 'read', 'additive', 'destructive', 'delete', '', 1, null];
  const flags = [ABSENT, true, false, 'yes', null];
  // An extension member (HCS-0000 `^x-[a-z0-9]+(-[a-z0-9]+)*$`) is ignored; any other member makes the declaration unusable.
  const extras: Record<string, unknown>[] = [{}, { 'x-example': 1 }, { 'x-dev.example': 1 }, { unknown: 1 }];
  const notObjects = [undefined, null, 'read', ['read'], 1, true];
  for (const declared of notObjects) assert.deepEqual(annotationsFor(declared), FAIL_CLOSED_ANNOTATIONS, JSON.stringify(declared));
  for (const [effect, idempotent, openWorld, extra] of product(effects, flags, flags, extras)) {
    const decl: Record<string, unknown> = { ...extra };
    if (effect !== ABSENT) decl.effect = effect;
    if (idempotent !== ABSENT) decl.idempotent = idempotent;
    if (openWorld !== ABSENT) decl.openWorld = openWorld;
    const usable = typeof effect === 'string' && ['read', 'additive', 'destructive'].includes(effect)
      && (idempotent === ABSENT || typeof idempotent === 'boolean') && (openWorld === ABSENT || typeof openWorld === 'boolean')
      && Object.keys(extra).every(key => key === 'x-example');
    const expected: ToolAnnotations = usable ? {
      readOnlyHint: effect === 'read',
      destructiveHint: effect === 'destructive',
      idempotentHint: effect === 'read' ? true : idempotent === true,
      openWorldHint: openWorld !== false,
    } : { ...FAIL_CLOSED_ANNOTATIONS };
    assert.deepEqual(annotationsFor(decl), expected, JSON.stringify(decl));
  }
});

// ---- HCS-0010: proposals (R003 to R011) ----

const base: ProposalInput = {
  id: 'p-1', identity: 'k-1', actionType: 'dev.example.sets.log', proposedBy: 'dev.example.coach',
  target: 'session-7', payloadDigest: digestPayload('a'), time: '2026-11-12T10:00:00Z',
};
const goodAnswer = { decision: 'd-1', by: 'subject', time: '2026-11-12T10:05:00Z' } as const;
const inState = (state: 'pending' | 'accepted' | 'rejected', extra: Partial<ProposalInput> = {}): Proposal => {
  const pending = submitProposal([], { ...base, ...extra }).proposal;
  return state === 'pending' ? pending : answerProposal(pending, state === 'accepted' ? 'accept' : 'reject', goodAnswer, { currentBase: extra.base });
};

test('answerProposal answers a pending proposal once, only from a valid answer, and refuses a stale base on accept (R003 to R006)', () => {
  const answers = product(['d-1', ''], ['subject', 'grant', 'denial', 'agent'], ['2026-11-12T10:05:00Z', 'yesterday'])
    .map(([decision, by, time]) => ({ decision, by, time }));
  for (const [state, decision, answer, proposalBase, currentBase] of product(
    ['pending', 'accepted', 'rejected'] as const, ['accept', 'reject'] as const, answers, [undefined, 'b1'], [undefined, 'b1', 'b2'])) {
    const proposal = inState(state, proposalBase === undefined ? {} : { base: proposalBase });
    const before = structuredClone(proposal);
    const validAnswer = answer.decision !== '' && answer.by !== 'agent' && answer.time !== 'yesterday';
    const expected = state !== 'pending' ? 'refused:already_answered'
      : !validAnswer ? 'refused:invalid_answer'
      : decision === 'accept' && proposalBase !== undefined && currentBase !== proposalBase ? 'refused:stale'
      : { ...proposal, state: decision === 'accept' ? 'accepted' : 'rejected', answer };
    const got = outcome(() => answerProposal(proposal, decision, answer as never, currentBase === undefined ? {} : { currentBase }));
    assert.deepEqual(got, expected, JSON.stringify({ state, decision, answer, proposalBase, currentBase }));
    assert.deepEqual(proposal, before, 'the input record is never changed (R009)');
  }
});

test('submitProposal returns the held proposal for a retry in any state and refuses a reused identity (R010, R011)', () => {
  const variants: Partial<ProposalInput>[] = [{}, { actionType: 'dev.example.sets.delete' }, { target: 'session-8' }, { payloadDigest: digestPayload('b') }, { id: 'p-9' }];
  for (const [state, variant] of product(['pending', 'accepted', 'rejected'] as const, variants)) {
    const held = inState(state);
    const sameContent = !('actionType' in variant || 'target' in variant || 'payloadDigest' in variant);
    const got = outcome(() => submitProposal([held], { ...base, ...variant }));
    assert.deepEqual(got, sameContent ? { proposal: held, created: false } : 'refused:identity_reused', JSON.stringify({ state, variant }));
    // Another identity is a new pending proposal whatever is held.
    assert.equal(submitProposal([held], { ...base, ...variant, id: 'p-new', identity: 'k-new' }).created, true);
  }
});

test('proposeUndo creates an undo only of an accepted, not yet undone, unchanged proposal (R007, R008, R010)', () => {
  const undoInput: ProposalInput = { ...base, id: 'u-1', identity: 'ku-1', payloadDigest: digestPayload('undo') };
  for (const [original, priorUndo, changedSince, retry] of product(
    ['missing', 'pending', 'accepted', 'rejected'] as const, ['none', 'pending', 'accepted', 'rejected'] as const, [false, true], [false, true])) {
    const existing: Proposal[] = [];
    if (original !== 'missing') existing.push(inState(original));
    let prior: Proposal | undefined;
    if (priorUndo !== 'none' && original === 'accepted') {
      prior = proposeUndo(existing, 'p-1', undoInput).proposal;
      if (priorUndo !== 'pending') prior = answerProposal(prior, priorUndo === 'accepted' ? 'accept' : 'reject', goodAnswer);
      existing.push(prior);
    }
    const input = retry ? undoInput : { ...undoInput, id: 'u-2', identity: 'ku-2' };
    const expected = original === 'missing' ? 'refused:unknown_proposal'
      : original !== 'accepted' ? 'refused:not_accepted'
      : prior?.state === 'accepted' ? 'refused:already_undone'
      : changedSince ? 'refused:stale'
      : retry && prior ? { proposal: prior, created: false }
      : 'created';
    const got = outcome(() => proposeUndo(existing, 'p-1', input, { changedSince }));
    const where = JSON.stringify({ original, priorUndo, changedSince, retry });
    if (expected === 'created') {
      const { proposal, created } = got as { proposal: Proposal; created: boolean };
      assert.equal(created, true, where);
      assert.deepEqual({ state: proposal.state, undoes: proposal.undoes, id: proposal.id }, { state: 'pending', undoes: 'p-1', id: input.id }, where);
    } else assert.deepEqual(got, expected, where);
  }
});
