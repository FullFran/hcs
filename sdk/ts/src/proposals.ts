import { createHash } from 'node:crypto';
import { isBlobDigest } from './blob.ts';
import { isDottedId, isExtensionName } from './ids.ts';

// HCS-0010 proposal records. A proposal is the host's record of a change an agent asked for; it becomes a change
// only through an answer from a person or a grant or denial the host holds. The functions here are pure: they
// return new records and never edit one, so a host stores what they return (HCS-0010-R009).
export type ProposalState = 'pending' | 'accepted' | 'rejected';
export type AnswerBy = 'subject' | 'grant' | 'denial';
export interface ProposalAnswer { decision: string; by: AnswerBy; time: string }
export interface Proposal {
  id: string; actionType: string; proposedBy: string; entry?: string; target: string; payloadDigest: string;
  base?: string; key?: string; session?: string; time: string; state: ProposalState; answer?: ProposalAnswer; undoes?: string;
  [member: `x-${string}`]: unknown;
}

// Why the SDK refuses. HCS-0006 has no code for these yet (HCS-0010 OQ-0010-1), so they are not HCS errors.
export type RefusalReason = 'already_answered' | 'stale' | 'identity_reused' | 'invalid_answer' | 'unknown_proposal' | 'not_accepted' | 'already_undone';
export class ProposalRefusal extends Error {
  readonly reason: RefusalReason;
  constructor(reason: RefusalReason, message: string) { super(message); this.name = 'ProposalRefusal'; this.reason = reason; }
}

type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 256;
const timestamp = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?Z$/;
const isTime = (value: unknown): value is string => typeof value === 'string' && timestamp.test(value);
const MEMBERS = ['id', 'actionType', 'proposedBy', 'entry', 'target', 'payloadDigest', 'base', 'key', 'session', 'time', 'state', 'answer', 'undoes'];

/** The digest `sha256:<hex>` of the exact bytes (a string is hashed as UTF-8). What bytes stand for the change is the host's choice. */
export function digestPayload(payload: string | Uint8Array): string { return `sha256:${createHash('sha256').update(payload).digest('hex')}`; }

// Reads a proposal record and throws on anything the HCS-0010 schema rejects (R001).
export function readProposal(value: unknown): Proposal {
  const fail = (why: string): never => { throw new Error(`Invalid proposal: ${why}`); };
  if (!object(value)) return fail('not an object');
  for (const key of Object.keys(value)) if (!MEMBERS.includes(key) && !isExtensionName(key)) fail(`unknown member ${key}`);
  for (const key of ['id', 'proposedBy', 'target']) if (!identifier(value[key])) fail(key);
  for (const key of ['base', 'key', 'session', 'undoes']) if (value[key] !== undefined && !identifier(value[key])) fail(key);
  if (typeof value.actionType !== 'string' || !isDottedId(value.actionType)) fail('actionType');
  if (value.entry !== undefined && (typeof value.entry !== 'string' || !isDottedId(value.entry))) fail('entry');
  if (!isBlobDigest(value.payloadDigest)) fail('payloadDigest');
  if (!isTime(value.time)) fail('time');
  if (value.state !== 'pending' && value.state !== 'accepted' && value.state !== 'rejected') fail('state');
  if ((value.state === 'pending') !== (value.answer === undefined)) fail('answer is present exactly when the state is not pending');
  if (value.answer !== undefined) {
    const a = value.answer;
    if (!object(a) || !Object.keys(a).every(key => ['decision', 'by', 'time'].includes(key) || isExtensionName(key))
      || !identifier(a.decision) || !['subject', 'grant', 'denial'].includes(a.by as string) || !isTime(a.time)) fail('answer');
  }
  return value as unknown as Proposal;
}

export interface ProposalInput {
  id: string;
  /** The identity the host recognises a retry by: a hash of the content or a client key (R010). */
  identity: string;
  actionType: string; proposedBy: string; entry?: string; target: string; payloadDigest: string; base?: string; session?: string; time: string;
}

function toRecord(input: ProposalInput, undoes?: string): Proposal {
  const { identity, ...rest } = input;
  const record = { ...rest, key: identity, state: 'pending' as const, ...(undoes === undefined ? {} : { undoes }) };
  return readProposal(Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)));
}

// A retry (same identity, same action type, target and payload) returns the existing proposal, whatever its state
// (R010). The same identity with other content is refused and nothing changes (R011).
export function submitProposal(existing: readonly Proposal[], input: ProposalInput): { proposal: Proposal; created: boolean } {
  const held = existing.find(p => p.key === input.identity);
  if (held === undefined) return { proposal: toRecord(input), created: true };
  if (held.actionType === input.actionType && held.target === input.target && held.payloadDigest === input.payloadDigest) return { proposal: held, created: false };
  throw new ProposalRefusal('identity_reused', `Identity ${input.identity} already names a different proposal`);
}

// Answers a pending proposal once (R003). `by` names who answered: never an agent (R004). The caller writes the
// decision record first and passes its id (R005). A proposal with a `base` is refused when `currentBase` differs
// (R006); the input record is not changed, so the proposal stays pending. A rejection applies nothing, so it
// needs no check of the target.
export function answerProposal(proposal: Proposal, decision: 'accept' | 'reject', answer: ProposalAnswer, target: { currentBase?: string } = {}): Proposal {
  if (proposal.state !== 'pending') throw new ProposalRefusal('already_answered', `Proposal ${proposal.id} is already ${proposal.state}`);
  if (!identifier(answer.decision) || !['subject', 'grant', 'denial'].includes(answer.by) || !isTime(answer.time)) {
    throw new ProposalRefusal('invalid_answer', 'An answer needs the id of its decision record, a person or a stored grant or denial, and a time');
  }
  if (decision === 'accept' && proposal.base !== undefined && target.currentBase !== proposal.base) {
    throw new ProposalRefusal('stale', `The target of ${proposal.id} changed since it was proposed`);
  }
  return { ...proposal, state: decision === 'accept' ? 'accepted' : 'rejected', answer };
}

// An undo is a new pending proposal naming an accepted one (R007). It is refused when the named proposal is unknown,
// not accepted or already undone by an accepted proposal, or when `changedSince` says a later change touched the
// target (R008). The undone record is not changed (R009).
export function proposeUndo(existing: readonly Proposal[], undoes: string, input: ProposalInput, options: { changedSince?: boolean } = {}): { proposal: Proposal; created: boolean } {
  const original = existing.find(p => p.id === undoes);
  if (original === undefined) throw new ProposalRefusal('unknown_proposal', `No proposal ${undoes}`);
  if (original.state !== 'accepted') throw new ProposalRefusal('not_accepted', `Proposal ${undoes} is ${original.state}`);
  if (existing.some(p => p.undoes === undoes && p.state === 'accepted')) throw new ProposalRefusal('already_undone', `Proposal ${undoes} was already undone`);
  if (options.changedSince) throw new ProposalRefusal('stale', `A later change touched the target of ${undoes}`);
  const retry = existing.find(p => p.key === input.identity);
  if (retry !== undefined) return submitProposal(existing, input);
  return { proposal: toRecord(input, undoes), created: true };
}
