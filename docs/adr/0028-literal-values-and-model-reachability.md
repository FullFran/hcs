# ADR-0028: MCP values are delivered literally, and the model guard is a reachability property

**Status:** Proposed (2026-11-07)

## Context

The first host found two leaks while moving to an engine it drives over ACP.

- **Interpreted values (#45).** The engine (Pi 1.5.0) treats MCP environment and header values as configuration values: a leading `!` runs a shell command and `$VAR` expands. A `!touch <file>` value in a signed `server.json` was executed. The host now escapes every value (`$` as `$$`, a leading `!` as `$!`) and tests it against the engine's own resolver.
- **Guard bypass (#46).** HCS-0008-R019 put the content-safety guard on the model transport. A code-execution extension resolved a model through its own provider lookup and skipped a guard that wrapped only the session's provider. The host confines provider credentials: an environment allow-list, credentials held in memory, and a test showing that, with provider keys planted in the environment and in the engine's credential file, no request reaches anything but the mock behind the guard.

## Decision

- **R030:** the server receives exactly the string that the `server.json` substitutions and the granted secrets produce. Those substitutions are `{name}` in input values from `variables`, and `{name}` in transport URLs. They are applied once and never to inserted text, so a secret containing braces is not substituted again. An adapter decides whether it can deliver an input without reading secret values. The adapter escapes values for the engine, or uses a channel the engine does not interpret, or reports `unsupported_contribution`. HCS profiles the substitution `server.json` already defines and forbids a second, engine-specific one; it invents no templating. Appendix A records, per engine, what it interprets and how to escape it. Precedent: Kubernetes `env` defines `$(VAR)` expansion together with `$$` as its escape, and Compose does the same, so the interpretation belongs to the documented format and always has a way out.
- **R019, rewritten as a reachability property:** no request from a process of the run (the engine, its extensions and tools, the MCP servers it starts) can leave toward a model provider except through the guard, which runs outside those processes. A hook or a wrapper around the session's provider object never counts.
  - **Network confinement** meets the property: default-deny egress with the guard as the only allowed destination (precedents: Kubernetes `NetworkPolicy`, the OpenSandbox egress API).
  - **Credential confinement** alone does not. A bypassing request fails at the provider only after its body has been delivered, which for a masking guard is the leak. It stays a second layer. The first host has proven credential confinement only, so network confinement is the gap it has to close before claiming R019.
  - The guard's own provider or base URL is how the engine is pointed at the guard; it confines nothing.

## Consequences

- R019 is stricter than in v0.1.0-draft.2: a host that met it only by wrapping the session provider no longer conforms. This changes a requirement on hosts, not the schema or meaning of any instance document (HCS-0000 section 5).
- Alternatives rejected:
  - Forbidding `!` and `$` in generation values: it breaks passwords, URLs and regular expressions, and moves the problem to the next interpreted character.
  - Listing engine-internal model paths for the adapter to wrap: the list depends on the engine and breaks with each new extension, which is how the bypass happened.
  - Requiring a full sandbox profile: the neutral sandbox APIs are young. HCS states the property and cites them as ways to meet it.
- Both cases are `host` level until a system-under-test interface exists (#20).
