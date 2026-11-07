# ADR-0023: "Always" answers become host-held grants and denials, limited to the session

**Status:** Proposed (2026-11-07)

## Context

ACP `session/request_permission` offers the option kinds `allow_once`, `allow_always`, `reject_once` and `reject_always`; ACP describes "always" as "remember the choice" and says nothing about who remembers it, for how long, or how it is undone ([acp.md](../standards/acp.md), schema `v1.29.1`). HCS-0005 knows only grants held by the host and evaluated at each dispatch (R003). If the engine or the client remembers an "always" answer, one click becomes an allowance the host cannot see or revoke. Issue #35.

## Decision

- `allow_once` and `reject_once` decide one operation and are never stored (HCS-0005-R005).
- `allow_always` becomes a grant held by the host, limited to the session in which it was given, with `origin` naming the decision record of the answer (R006). It is revoked like any grant.
- `reject_always` becomes a stored denial with the same limit; a matching denial wins over a matching grant (R007).
- A grant or denial with a `session` matches only checks from that session (R008). `session` is the only scope dimension HCS defines for now; project, subject and operation stay in OQ-0005-2 (#17).
- The host is the only place a remembered answer lives (R009). A host that cannot stop an engine from remembering answers does not offer the "always" options on that engine.

## Consequences

- The grant and check objects gain optional `id`, `session` and `origin` members, and the reference evaluator gains denials. Existing grants without `session` behave as before.
- Alternatives rejected: a session cache that is never written down (it cannot be audited or revoked from outside the session, and it hides the answer from decision records, ADR-0024); "always" meaning "forever" (one click turns into an allowance that outlives the context in which the person gave it).
- Still open: refusing "always" for permissions that need a person every time (#16), whether a grant survives a package version change (#25), and what no answer means (#31).
