import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evaluate } from '../src/authority.ts';
import { ProposalRefusal, answerProposal, digestPayload, proposeUndo, readProposal, submitProposal, type Proposal, type ProposalInput } from '../src/proposals.ts';

const input: ProposalInput = {
  id: 'p-1', identity: 'k-1', actionType: 'dev.example.sets.log', proposedBy: 'dev.example.coach',
  target: 'session-7', payloadDigest: digestPayload('{"reps":10}'), time: '2026-11-12T10:00:00Z',
};
const answer = { decision: 'd-1', by: 'subject', time: '2026-11-12T10:05:00Z' } as const;
const refusal = (reason: string) => (error: unknown) => error instanceof ProposalRefusal && error.reason === reason;

test('readProposal accepts every valid HCS-0010 document case and rejects every invalid one (R001, R003, R004, R005, R007, R012)', () => {
  const root = resolve(import.meta.dirname, '..', '..', '..', 'conformance', 'cases', 'HCS-0010');
  let checked = 0;
  for (const requirement of readdirSync(root)) {
    for (const polarity of ['valid', 'invalid']) {
      const dir = join(root, requirement, polarity);
      for (const name of readdirSync(dir).filter(file => file.endsWith('.json'))) {
        const value = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        if (value.level !== 'document') continue;
        checked++;
        if (polarity === 'valid') assert.doesNotThrow(() => readProposal(value.input), `${requirement}/${name}`);
        else assert.throws(() => readProposal(value.input), `${requirement}/${name}`);
      }
    }
  }
  assert.ok(checked > 10);
});

test('a new proposal is pending and carries no answer (R003)', () => {
  const { proposal, created } = submitProposal([], input);
  assert.equal(created, true);
  assert.equal(proposal.state, 'pending');
  assert.equal(proposal.answer, undefined);
  assert.equal(proposal.key, 'k-1');
  assert.doesNotThrow(() => readProposal(proposal));
});

test('an answer moves pending to accepted or rejected once and a second answer is refused (R003, R005)', () => {
  const { proposal } = submitProposal([], input);
  const accepted = answerProposal(proposal, 'accept', answer);
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.answer?.decision, 'd-1');
  assert.equal(proposal.state, 'pending', 'the input record is not edited');
  assert.equal(answerProposal(proposal, 'reject', { ...answer, by: 'denial' }).state, 'rejected');
  assert.throws(() => answerProposal(accepted, 'reject', answer), refusal('already_answered'));
  assert.throws(() => answerProposal(proposal, 'accept', { ...answer, decision: '' }), refusal('invalid_answer'));
  assert.throws(() => answerProposal(proposal, 'accept', { ...answer, by: 'agent' as never }), refusal('invalid_answer'));
});

test('an answer is refused when the target no longer matches the base, and the proposal stays pending (R006)', () => {
  const { proposal } = submitProposal([], { ...input, base: 'rev-1' });
  assert.throws(() => answerProposal(proposal, 'accept', answer, { currentBase: 'rev-2' }), refusal('stale'));
  assert.equal(answerProposal(proposal, 'accept', answer, { currentBase: 'rev-1' }).state, 'accepted');
  assert.equal(answerProposal(proposal, 'reject', { ...answer, by: 'subject' }, { currentBase: 'rev-2' }).state, 'rejected');
  const { proposal: free } = submitProposal([], input);
  assert.equal(answerProposal(free, 'accept', answer, { currentBase: 'anything' }).state, 'accepted');
});

test('a retry returns the existing proposal whatever its state, and a reused identity with other content is refused (R010, R011)', () => {
  const first = submitProposal([], input).proposal;
  const accepted = answerProposal(first, 'accept', answer);
  const again = submitProposal([accepted], { ...input, id: 'p-9' });
  assert.equal(again.created, false);
  assert.equal(again.proposal, accepted);
  for (const change of [{ payloadDigest: digestPayload('{"reps":12}') }, { target: 'session-8' }, { actionType: 'dev.example.sets.remove' }]) {
    assert.throws(() => submitProposal([accepted], { ...input, id: 'p-9', ...change }), refusal('identity_reused'));
  }
  assert.equal(submitProposal([accepted], { ...input, id: 'p-9', identity: 'k-2' }).created, true);
});

test('an undo is a new record naming an accepted proposal, once, and the undone record is not touched (R007, R008, R009)', () => {
  const accepted = answerProposal(submitProposal([], input).proposal, 'accept', answer);
  const snapshot = JSON.stringify(accepted);
  const { proposal: undo } = proposeUndo([accepted], 'p-1', { ...input, id: 'p-2', identity: 'u-1', payloadDigest: digestPayload('undo') });
  assert.equal(undo.undoes, 'p-1');
  assert.equal(undo.state, 'pending');
  assert.equal(JSON.stringify(accepted), snapshot);
  const undone = answerProposal(undo, 'accept', answer);
  assert.throws(() => proposeUndo([accepted, undone], 'p-1', { ...input, id: 'p-3', identity: 'u-2' }), refusal('already_undone'));
  const pending = submitProposal([], input).proposal;
  assert.throws(() => proposeUndo([pending], 'p-1', { ...input, id: 'p-2', identity: 'u-1' }), refusal('not_accepted'));
  const rejected = answerProposal(pending, 'reject', { ...answer, by: 'denial' });
  assert.throws(() => proposeUndo([rejected], 'p-1', { ...input, id: 'p-2', identity: 'u-1' }), refusal('not_accepted'));
  assert.throws(() => proposeUndo([], 'p-1', { ...input, id: 'p-2', identity: 'u-1' }), refusal('unknown_proposal'));
});

test('an undo is refused when later changes touched the target (R008)', () => {
  const accepted = answerProposal(submitProposal([], input).proposal, 'accept', answer);
  assert.throws(() => proposeUndo([accepted], 'p-1', { ...input, id: 'p-2', identity: 'u-1' }, { changedSince: true }), refusal('stale'));
});

test('an action type is a permission id: a grant for it covers the proposal and no other type (R012)', () => {
  const grants = [{ entry: 'dev.example.a', permission: input.actionType }];
  assert.equal(evaluate({ entry: 'dev.example.a', permission: input.actionType }, grants).allow, true);
  assert.equal(evaluate({ entry: 'dev.example.a', permission: 'dev.example.sets.remove' }, grants).allow, false);
  assert.throws(() => readProposal({ ...(submitProposal([], input).proposal as Proposal), actionType: 'log_sets' }));
});
