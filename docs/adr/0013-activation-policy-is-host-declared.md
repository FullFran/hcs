# ADR-0013: Activation policy is host-declared, not a single rule

**Status:** Proposed (2026-11-06)

## Context

OQ-0003-3 asked what a host does when some entries of a new desired set fail resolution. HagaHarness, the first consumer, a desired-state host, chose all-or-nothing: if any entry fails, the whole new set is blocked and the previous set stays active. A developer host that loads whatever it can would want the opposite. HCS-0004-R003 already makes a transition atomic for the entries selected for activation, but nothing said which entries are selected.

## Decision

- Two policies, `all-or-nothing` and `partial`, defined in HCS-0003 step 6. A host declares one and applies it to every transition (HCS-0003-R008 to R010).
- Resolution input carries the declaration as `host.activationPolicy`; the result then carries `selected`, so the policy is executable in resolution cases.
- A profile may require a policy. CORE-0 does not; DISTRO-1 requires `all-or-nothing` (HCS-0007), because a signed catalog is the unit the distributor vouched for.

## Consequences

- Two hosts with the same declared policy select the same entries from the same input, which is what CORE-0 needs to compare them.
- `activationPolicy` is optional in the resolution schema so that existing cases stay valid; whether a real host declared one is checked by the host-level case of R008, which is `pending` until a host adapter exists.
- Alternatives rejected: a single rule for every host (forces developer hosts into all-or-nothing or desired-state hosts into partial); leaving it unspecified (two conforming hosts could activate different sets from the same catalog).
