# ADR-0021: Projection failures reuse existing HCS-0006 codes

**Status:** Proposed (2026-11-06)

## Context

HCS-0008 needs to report: a kind the engine cannot take, a name collision, an attempt to override a host-owned setting, a missing secret, an invalid MCP descriptor, and a failed health check. HCS-0006 is one closed registry ([ADR-0014](0014-profile-error-codes-join-the-core-registry.md)); every new code costs every consumer a branch.

## Decision

Reuse, and widen the "Raised when" text of, existing codes:

| Condition | Code | Why it fits |
| --- | --- | --- |
| kind not projectable | `unsupported_contribution` | the host does not implement the kind for that engine (HCS-0001-R008) |
| same engine-level name twice | `ambiguous_provider` | two providers, nothing selects one |
| override of a host-owned setting, secret not granted | `permission_denied` | authority the host did not grant (HCS-0005), as for the DISTRO-1 binding |
| `server.json` invalid or carrying a secret | `manifest_invalid` | a document fails its schema or profile |
| health check fails or its deadline passes | `plugin_failed`, `timeout` | the lifecycle step from `prepared` to `active` failed |

## Consequences

- No schema change; consumers need no new branch.
- `plugin_failed` for a health check blurs "package code crashed" and "engine did not come up". OQ-0008-4 records a dedicated code if a consumer needs to tell them apart.
- Alternative rejected: new codes `projection_conflict` and `health_check_failed`. Clearer names, but no consumer branches on the difference yet.
