# ADR-0026: Profile `registryType: "file"` for MCP server code shipped in the generation

**Status:** Proposed (2026-11-07)

## Context

The first host ships local MCP servers whose code is inside the package: a `server.json` next to a script the engine starts over stdio. It has published, projected and run them end to end: publish, import, sync, materialize, and the projected server answers `tools/call`. MCP Registry `server.json` (schema 2025-12-11) only describes packages a client downloads (`npm`, `pypi`, `oci`, `nuget`, `mcpb`). `registryType` is an open string, but no value names code already on disk, so the host registered `file` as an unstable extension of its own. Issue #28.

## Decision

- Profile the value `file` in HCS-0008 section 6.4.1 instead of inventing a descriptor or reusing another format:
  - `identifier` is a relative path inside the contribution's directory (HCS-0001-R005 rules, no empty segments, links resolved inside the folder).
  - The transport is `stdio`, and there is at most one `file` package per document (R021).
- The server runs from the immutable generation, with its folder as working directory, and is never copied or rewritten (R022, applying R001 and R008's rule for skills).
- The host owns the runtime: `runtimeHint` must name a runtime the host provides, and `runtimeArguments` and the runtime's control variables (`NODE_OPTIONS`, `PYTHONPATH`, `LD_PRELOAD`, declared by the host) are refused (R023). Otherwise a signed descriptor could change the host's own interpreter.
- Secrets reach the server only through its environment, never as arguments. This includes arguments that take a secret through their `variables`. Any local user can read a process's arguments; only the same user and administrators can read its environment (R024).
- When several rules fire, an adapter reports only the first, in this order: `manifest_invalid` (R010, R011, R021), then `unsupported_contribution` (R024, R023), then `permission_denied` (R012). A host does not ask for authority for a server it will not start, and two hosts report the same error.
- Execution trust: whether to run the code is decided by the signed catalog and the content hash; what it may do is decided by HCS-0005 grants. HCS adds no separate allowlist of executable entries; a host may add one under its own policy.
- Integrity comes from the entry's `contentHash` in the signed catalog (HCS-0001-R007, HCS-0007); `fileSha256` is not used.
- HCS proposes `file` upstream to the MCP Registry. Until the registry adopts a value for code already on disk, this profile is Provisional like the rest of HCS-0008.

## Consequences

- An adapter can project a bundled server whose meaning every host agrees on. The reference projection checks R021, R023 and R024 (`files` and `hostRuntimes` inputs). Link resolution and the run itself are host-level cases.
- A runtime that exists but cannot start the server fails health (R014, R015); there is no separate projection error.
- What the first host counts as "loaded" (the server declared at least one tool) cannot tell a server with no tools from one that did not start. R014 stays as it is: a better engine signal (a completed `initialize`) is engine-specific (issue #30).
- Alternatives rejected:
  - **An MCPB bundle (`registryType: mcpb`):** a second archive format inside an HCS package (ADR-0017).
  - **A host-specific `registryType`:** two hosts would read the same signed catalog differently.
  - **A new HCS descriptor:** the registry already describes everything except the location.
- Versioning (HCS-0000 section 5): before this ADR, `registryType: "file"` had no meaning in HCS. R010 accepted it as an open string and nothing said how to start it, so a generation using it could not be projected the same way by two hosts. Giving it a meaning is additive. Refusing `oci` packages is different: HCS already projected them, so that change would alter the meaning of valid generations and needs the next minor.
- Open: whether packages of other registry types should be projected at all, since they make the engine fetch code the signed catalog does not cover (OQ-0008-7). The first host refuses them.
- Not covered here: confirming that a server completed `initialize` (R014 still accepts what the engine reports, issue #30), and what the engine does with values it interprets (issue #45).
