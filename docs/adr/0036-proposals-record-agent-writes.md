# ADR-0036: Agent writes become proposals that only a person answers

**Status:** Proposed

## Context

Two consuming harnesses reached the same design without sharing code: an agent never writes; it records a proposal, and the change is applied only after a person accepts it.

- RE;write keeps each extracted claim and each text change as `proposed`, `accepted` or `rejected`, with an append-only history of who moved it and when. Its proposal ids are hashes of the file, the base text, the change and, for a proposal made from another, that origin, so a retry cannot duplicate one. A decision made on a view that has since changed is refused as stale. Reverting an accepted change is a new proposal, built from the original change and located in the current text, and refused when later edits touched the passage. An evaluation journey checks that no tool of the agent can accept or reject.
- training-mcp turns every write tool into a proposal with a status of `accepted`, `pending` or `rejected` and a proposal id. A person answers with the four HCS-0005 option kinds; a stored answer covers an *action type*, so one answer covers every tool mapped to it. Repeating a call with the same client idempotency key returns the original result. A person undoes an accepted change from a stored before-image, as its own history entry with its own decision record, and the undo is refused when a later change depends on it.

Both already use HCS-0005 for the answer and the decision record. What neither has is a shared shape for the proposal itself, and HCS-0005 OQ-0005-1 (a shared permission vocabulary) was waiting for a second consumer.

## Decision

1. New document HCS-0010 with one record (`proposal`: id, action type, who proposed, target, payload digest, optional base, key and session, state, answer, `undoes`) and its JSON Schema. The record holds the digest of the change, never the change.
2. Three states, one transition: `pending` to `accepted` or `rejected`, once (R003). Nothing is applied unless `accepted` (R002).
3. The answer links to the HCS-0005 decision record by id (R005) and is given only by a person under HCS-0005-R015, or by a grant or denial the host holds, which traces to a person through `origin` (R004). The schema leaves no value of `answer.by` for an agent or a host rule.
4. A proposal that carries a `base` is refused when the target no longer matches (R006), and stays pending.
5. Undo is a new proposal with `undoes` (R007), refused when the undone proposal is not accepted, was already undone or was altered by a later change (R008). Answered records are never edited or removed (R009).
6. Retries return the existing proposal (R010) and a reused identity with other content is refused (R011). The record's `key` holds whatever identity the host uses. The mechanism (content hash or client key) is deliberately open.
7. An action type is an HCS-0005 permission id (R012). No new object: check, grant, denial and decision record are HCS-0005's with `permission` set to the action type, so a stored answer covers every tool mapped to it and no other type.

## Consequences

- OQ-0005-1 narrows without being closed. The grouping of tools is settled: a tool maps to a permission id that is also an action type. The vocabulary (filesystem, network, process, secrets) is still not defined: the two consumers' ids are domain ones (`set.log`, claim review), which is the first host's choices again, not shared ground. Suggested text for HCS-0005 is in the pull request.
- Where the two harnesses differ and a behaviour-level rule would hide the difference, it is an open question and not a MUST: intermediate states for applying and failing, the identity mechanism, the `entry` of a built-in tool, how undo detects dependence, an accept-everything setting, reopening a decision, and expiry of stored answers (OQ-0010-2 to OQ-0010-8).
- Alternatives rejected: reopening a decided proposal (RE;write does; it makes the answer a mutable fact and breaks R009, so a reopen is a new proposal here, OQ-0010-7); making the stale check depend on a fixed `base` format (it would force one harness's revision scheme on the other); defining an HCS-0006 code in this change (HCS-0006 is edited in its own change; HCS-0010 uses a refusal outside the HCS error object until `proposal_conflict` exists, OQ-0010-1).
- Conformance: the record shape is checked at `document` level and action-type grouping at `authority` level by the reference runner; the behaviours (transitions, stale state, retries, undo) are `host` cases, as most of HCS-0005's are, and are measured by the SDK functions in `sdk/ts/src/proposals.ts` meanwhile.
