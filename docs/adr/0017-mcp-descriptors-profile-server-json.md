# ADR-0017: MCP descriptors are MCP Registry `server.json`, profiled to carry no secrets

**Status:** Proposed (2026-11-06)

## Context

The first host ships MCP packages as `mcp/<name>/integration.json` in its own shape. The MCP project publishes `server.json` (MCP Registry schema 2025-12-11, [mcp-registry-server-json.md](../standards/mcp-registry-server-json.md)) to describe how a client installs and configures a server, including inputs flagged `isRequired` and `isSecret`. The schema allows a literal `value` or `default` for a secret input. A generation is signed, cached on disk and shared between engine runs; a secret inside it leaks to everyone who can read the generation.

## Decision

- The content of an `mcp-server` contribution is a `server.json` document of schema revision 2025-12-11 (HCS-0008-R010). HCS restates none of its members.
- Profile: no `value` or `default` for a secret input inside a generation (R011). The adapter fills secret inputs only from the secrets the host grants to that entry, never writes them inside the generation, and prefers engine-side references such as environment placeholders (R012).
- A required secret the host has not granted is `permission_denied`: who gets a credential is an authority decision (HCS-0005).

## Consequences

- The first host replaces `integration.json` with `server.json`, or maps it at build time. Engine-specific MCP blocks are produced by the adapter (HCS-0008 appendix A).
- The reference runner checks the required members and the secret rule only; it does not vendor the MCP schema (README rule 5). Full validation is the adapter's.
- When the MCP Registry publishes a new schema revision, HCS-0008 picks it explicitly; the draft revision already changes URL template rules.
- Alternatives rejected: MCPB `manifest.json` ([mcpb.md](../standards/mcpb.md)) as descriptor, because it is a second package format inside an HCS package; the de facto `mcpServers` client file, because it has no owner or schema.
