# ADR-0031: A generation switch is crash-safe and failure marks are persistent

**Status:** Proposed

## Context

HCS-0008 section 7 confirms a generation only after a health check (R013) and returns to the confirmed generation once when it fails (R015, R016). Those rules say nothing about what survives a crash or a restart. A host that keeps "pending" and "failed" in memory forgets a failure by restarting and starts the failed generation again, in a loop; a host that moves the active pointer before recording what it is trying cannot tell, after a crash, whether the generation it finds active was ever checked.

## Decision

1. A host persists four facts as generation ids: `active`, `confirmed`, `pending` and `failed` (HCS-0008 section 7.1). HCS defines no file format.
2. The order of writes is: record pending and confirmed (R031); change the active pointer; run the health check; on success record confirmed and clear pending; on failure record failed (R032), change the pointer back, clear pending. A failed generation is never started and its identifier is never reused (R032).
3. After a restart the host decides from the persisted facts alone (R033): a pending active generation is health-checked; a pending record for a non-active generation is discarded; an active generation with no record is treated as pending; an active generation recorded as failed is returned from. Item 4 outranks item 1.
4. A cleanup keeps the active, pending and confirmed generations and every failed record (R034).
5. A host that cannot return to the confirmed generation (no pointer change, or no confirmed generation) does not start the failed generation, stops and reports as R016 requires (R035).
6. No HCS-0006 code is added for a failed pointer change. It is a host-internal fault; R015 already reports the original failure with `plugin_failed` or `timeout`. Revisit when a second host reports the same condition (ADR-0014).
7. A new conformance level `recovery` checks R033 and R034 with a pure reference function over abstract facts (`conformance/runner/recovery.py`). Writes and faults stay `host` cases.

## Consequences

- No wire format changes, so no existing document becomes invalid.
- A host with no records finds its active generation under R033 item 3, checks it once and confirms or fails it. It has no confirmed generation, so a failing check ends in R035; a host that can vouch for its active generation seeds `confirmed` with it when it first records facts.
- Marks are permanent: identifiers are never reused, so a mark stays small. A host may bound them if it does not allow reuse.
- Two writers recording these facts concurrently are out of scope; a lock that serializes writers is assumed.

## Alternatives rejected

- A counter of tries: ADR-0020 chose one try.
- A file format in HCS: it is host-internal and would need a migration story.
- In-memory failure marks: they loop after a restart.
- A registry code for a pointer fault now: it needs a defined condition and more than one implementation (ADR-0014).

## Open

The first consumer keeps a "previous" and a "last good" generation apart; HCS keeps only `confirmed` as the return target. Whether they differ in practice, and whether a health-checked generation with nothing to return to is confirmed on success (this ADR: yes), is to be confirmed by a second host.
