# ADR-0005: Capability references are `id@major`, matched exactly

**Status:** Proposed (2026-11-06)

## Context

The composition map asks for a stable capability ID separate from the implementing package, with a contract version. MCP tool names, A2A skills and Agent Skills names are all local to one implementation ([docs/standards/mcp.md](../standards/mcp.md), [a2a.md](../standards/a2a.md), [agent-skills.md](../standards/agent-skills.md)). Version ranges (SemVer caret/tilde) would need a version semantics HCS does not have (ADR-0004).

## Decision

A capability id is a lowercase dotted name; a reference is `<id>@<major>`. Providers match a requirement only when id and major are equal. Compatible contract changes keep the major; breaking changes bump it.

## Consequences

- Resolution is exact-match and deterministic, easy to test across hosts.
- A provider that implements majors 1 and 2 lists both references.
- There is no way to require "at least minor 3 of major 1". If a consumer needs that, it is a new contract or an HCS change (OQ-0002-3).
