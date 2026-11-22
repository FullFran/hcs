# ADR-0041: Online keys may be limited to a binding; accepted state is kept per assignment

**Status:** Proposed

## Context

HCS-0007 verifies an envelope against one key set (section 3.2) and one assignment (R006), and remembered one accepted state per host (section 3.3, R015). Two gaps follow when a distribution serves more than one binding (issue #61):

1. **A valid key can sign for any binding.** R006 checks that the envelope's `binding` equals the host's assignment, and R005 checks that enough keys of the key set signed. Nothing links the two: a key trusted for binding B can sign an envelope addressed to binding A, and a host assigned to A accepts it.
2. **Rollback state was one value per host.** When a host moves to another assignment, the new binding's `sequence` or key set `version` is compared with the old binding's. Counters of different bindings are not comparable, so the host either refuses a legitimate envelope as `rollback_rejected` or, if it resets its state, accepts an old one.

ADR-0039 left this as OQ-0007-10 (one harness, README rule 1). Issue #61 brings the evidence and the owner's design.

## Evidence

- The first consumer, on its integration branch (observed 2026-11): a key in its key file can be limited to one binding, and a key limited to another binding cannot sign this binding's catalog; it keeps the last accepted sequence and key set separately for each binding; a switch from one binding to another is crash-safe, so after a restart in the middle of the switch the host is in one binding with that binding's state, never a mix.
- TUF limits what a delegated role may sign with `paths` ([tuf.md](../standards/tuf.md)); the Uptane Director pattern already motivates `binding` ([uptane.md](../standards/uptane.md)).
- The kubelet's `AtomicWriter` replaces a pointer in one step so a reader sees the old or the new set, never a mix ([kubernetes-probes.md](../standards/kubernetes-probes.md)); HCS-0007-R017 and HCS-0008 already use the same idea for generations.
- The SDK's `Envelope.binding` is `Record<string, string>`, enough to express the limit. Since draft.12 the SDK's `sync.syncSigned` keeps accepted state under an opaque `scope` string chosen by the host (default `"default"`), one state per scope; the spec itself had no notion of more than one state.

## Decision

1. **A key may carry `binding` (section 3.2, schema).** It is an object with the grammar of the envelope `binding` (`#/$defs/binding`: at least one member, member-name pattern, non-empty string values). The key stays a closed object. A key without `binding` is unrestricted, as before.
2. **Counting rule (R030, MUST).** A signature counts toward the R005 threshold only when its key has no `binding`, or every member of that `binding` appears in the envelope's `binding` with an equal value. Equality of members only, no patterns. It applies at step (2) against the envelope's `binding`, which the signature covers; once step (3) passes that equals the assignment. An envelope whose valid signatures are all out of scope reports `signature_invalid`, before the binding check of R006 (R009 order). No new error code.
3. **Accepted state per assignment (R031, MUST).** The host keeps the state of section 3.3 separately for each assignment it is or was enrolled for, compares `sequence` (R008) and `version` (R012) only with the state of the assignment it verifies for, and does not discard the state of an assignment it has left. A rollback within an assignment is `rollback_rejected`, as today.
4. **Atomic switch of assignment (R032, MUST).** After a restart at any point of the change, the host is on the previous assignment with its state or on the new one with its state, never a combination. How the new assignment arrives stays enrollment (issue #26).
5. **Conformance.** Generated cases for R002 (key `binding` shape), R030 and R031; a new optional distribution input `states` (records `{assignment, keySet?, envelope?}`) that replaces `lastKeySet` and `lastAccepted`; host-level cases for R032. R030 to R032 stay out of `profiles/distro-1.json` (unprofiled) until a consumer passes their cases.
6. **SDK.** `OnlineKey.binding`, shape validation with the envelope binding check, `signing.bindingCovers(scope, binding)` with own-property checks, the count in `verifyEnvelope`, `signing.createKeySet` for key sets with scoped keys, and `sync.assignmentScope(assignment)`, which gives the opaque `scope` of `syncSigned` one value per assignment. The SDK stays stateless about which assignment is current.

### Adaptations of the design in issue #61

The design comment on issue #61 was written before draft.12 and the key lifecycle change (ADR-0039). This ADR follows it with these changes:

- **Requirement ids.** The design numbered the new requirements R022, R023 and R024. R022 (repeated `keyid` in `signatures`), R023 (host limits) and R024 to R029 (key lifecycle) are taken, and ids are never reused (HCS-0000 section 3), so the counting rule is R030, per-assignment state R031 and the atomic switch R032. The conformance case directories follow the new ids.
- **R030 in its own subsection.** It goes in section 5.2.2 next to R022 and R023 and cites R024, which already says that a host ignores signatures it cannot count; an out-of-scope signature is ignored the same way.
- **Reuse of the SDK `scope`.** Draft.12 already keeps one accepted state per `scope` in `syncSigned`, `fileAcceptedStateStore`, `checkEnvelopeSequence` and `checkKeySetVersion` (the latter two compare whatever two states the caller passes). Per-assignment state is therefore already expressible: the assignment is the scope. No second mechanism is added; the design's `assignmentKey(assignment)` helper becomes `sync.assignmentScope(assignment)`, whose value fits the existing scope grammar (`^[A-Za-z0-9._-]{1,128}$`, which a `sha256:` prefix would not). What was missing, and is added, is the MUST that the host keeps a scope per assignment and never compares across them (R031), and the atomic switch (R032). The default scope stays `"default"`, so existing state files keep working.
- **Section 3.3 wording.** The accepted state is described per assignment "the host is or was enrolled for", to match R031.
- **ADR number.** The design proposed ADR-0032, which is taken; this is ADR-0041.
- **Cases.** The design's `invalid/key-set-version-other-assignment-ignored` is split into `valid/key-set-version-of-other-assignment-ignored` (another assignment's key set version does not count) and `invalid/key-set-rollback-within-assignment` (a rollback within one assignment is still refused), so each polarity says what it tests. Three cases are added for R030: a scope equal to the whole binding, a scope member absent from the binding, and a scope judged before the binding check.

## Consequences

- Adding an optional member is additive within `0.1` (HCS-0000 section 5): a key set valid before stays valid. A verifier built for an earlier draft has a closed key schema and refuses a key set with a scoped key as `manifest_invalid` (R002). That fails closed, but a distribution upgrades its hosts before it publishes scoped keys, or publishes a separate, newly signed key set without scopes for old hosts, as ADR-0030 does for `contentId`. An already signed key set is never edited.
- A host that held one accepted state treats it as the state of its current assignment on upgrade; nothing is lost. Keys without `binding` behave exactly as before.
- R031 forbids discarding the state of a left assignment and states no bound; whether a host may bound it, and must then require enrollment again for an evicted assignment, is OQ-0007-11.
- Several current assignments at once (issue #27) are OQ-0007-12. A scope is matched against the envelope's `binding`, so R030 works with either answer.
- OQ-0007-10 is closed. Its wording ("one `binding` member") is replaced by a partial binding compared member by member.

## Alternatives rejected

- **The limit as an `x-` extension member.** HCS-0000-R004 forbids an extension member from changing a validity verdict, and old verifiers would ignore it silently, which fails open.
- **One key set per binding, with no member on the key.** It works, but a distribution then runs one root signing per binding, and it does not stop cross-use of keys inside one key set.
- **Glob or range scopes (TUF `paths` semantics).** No consumer needs them, and a second implementation would have to agree on the glob dialect.
- **A new error code for out-of-scope signatures.** No consumer branches on it; telling it apart from a missing signature is OQ-0006-4.
- **`permission_denied` for an out-of-scope key.** The check is a signature check at step (2); R009 gives the order, and `permission_denied` stays the code of R006.
- **A second state mechanism in the SDK keyed by assignment.** The draft.12 `scope` already gives one state per name; a helper that derives the name from the assignment is enough.
