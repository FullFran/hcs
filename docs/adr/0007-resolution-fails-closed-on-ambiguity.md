# ADR-0007: Resolution reports ambiguity and orders by dependency then id

**Status:** Proposed (2026-11-06)

## Context

Two hosts given the same catalog must produce the same activation order and the same errors (CORE-0 exit test in the composition map). Cordis resolves services at runtime; OpenClaw has exclusive slots; neither is specified declaratively.

## Decision

- More than one matching provider (packages or host built-ins) is `ambiguous_provider`; the host never picks implicitly.
- Failure propagates: entries whose only providers failed fail with `missing_dependency`; entries on a cycle fail with `dependency_cycle`.
- Activation order is topological, ties broken by ascending entry id as bytes.
- Whether a host activates the survivors or rejects the whole catalog is host policy.

## Consequences

- Deterministic and testable at the `resolution` level without a host.
- Distributions that ship an alternative implementation of a host built-in get an error until provider selection exists (OQ-0003-1, OQ-0003-4). That is deliberately safe and possibly annoying.
