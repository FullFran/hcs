# ADR-0014: Profile error codes join the single HCS-0006 registry

**Status:** Proposed (2026-11-06)

## Context

HagaHarness, the first consumer, reports three distribution failures by putting `x-<distribution>-signature_invalid`, `x-<distribution>-rollback_rejected` and `x-<distribution>-intervention_needed` in the `code` member, which HCS-0006-R002 forbids. The proposal on the table was to promote the three into DISTRO-1 as profile codes. [lf-fit-distro-1-and-core-0.md](../research/lf-fit-distro-1-and-core-0.md) section 4 weighs it.

## Decision

- `signature_invalid` and `rollback_rejected` are added to the HCS-0006 closed set, with HCS-0007 in the "Defined by" column. The table is the only registry of codes; profiles add rows instead of keeping their own lists, as IANA registries point each entry at its defining specification.
- Extension names stay forbidden in `code` (HCS-0006-R002 unchanged): a consumer cannot branch on a code it does not know.
- `intervention_needed` is not promoted. No HCS document defines out-of-band modification of installed content, and "touch nothing" is product policy with one implementation. It becomes OQ-0004-6; until then the host reports it outside an HCS error object, for example as a distribution-owned RFC 9457 problem type.
- Expiry stays under `signature_invalid` and binding mismatch under `permission_denied`, as the host does; the HCS-0006 table records both uses.

## Consequences

- The first host replaces two prefixed codes with core codes and moves the third out of the HCS error object.
- Consumers branch on one code list whatever profile a host claims; a host without DISTRO-1 never raises the two new codes.
- Adding a code still changes HCS-0006 ([ADR-0006](0006-error-codes-ride-in-data.md)); a profile cannot add codes without that change, which keeps the registry reviewable.
- Alternatives rejected: profile-local code lists (a code would mean something only if the consumer knows the profile); allowing `x-` codes (unbranchable); a separate code for expiry (one more code for a reason operators can already read in `message`, tracked as OQ-0006-4).
