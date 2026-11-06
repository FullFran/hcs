# ADR-0009: Authority defines request and grant shapes, not a permission vocabulary

**Status:** Proposed (2026-11-06)

## Context

Every harness needs "plugins request, the host grants, deny by default". OAuth scopes, OPA decisions and Agent Skills `allowed-tools` each cover a slice ([oauth2.md](../standards/oauth2.md), [opa.md](../standards/opa.md), [agent-skills.md](../standards/agent-skills.md)). A concrete vocabulary (filesystem paths, network hosts, secrets) and trust tiers are product decisions; README rule 4 puts them in the distribution.

## Decision

HCS-0005 defines permission ids as dotted names, request/grant/check/decision objects, deny-by-default, "a request is never a grant", per-dispatch evaluation, and that extension members cannot turn requests into grants. Grants are keyed by entry id and permission only.

## Consequences

- HagaHarness can keep its trust tiers and privacy guards under `x-hagaharness-*` without HCS encoding them.
- Two distributions will not share permission ids until a vocabulary exists (OQ-0005-1). Interop on authority is therefore shape-only in 0.1.
- Grant scoping by project/session/operation is deferred (OQ-0005-2).
