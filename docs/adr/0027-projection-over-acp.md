# ADR-0027: Project into ACP-driven engines through a namespaced ACP extension

**Status:** Proposed (2026-11-07)

## Context

The first host drives its engine over ACP: a sidecar runs the engine's SDK as an ACP agent, and the host creates each run with `session/new`. HCS-0008 defined a projection as files, arguments or environment the engine reads at start. ACP v1 (`schema-v1.29.1`) carries `cwd`, `mcpServers` and an open `_meta` in `session/new`, and its schema says implementations "MUST NOT make assumptions about values at these keys". It has no skills, no identifier for what a session was created from, and none of its 14 `session/update` kinds reports which MCP servers or skills were loaded. The first host filled the gaps with its own `_meta` keys and an extension method. In its first version the generation id was dropped before `session/new`, and `session/load` silently reopened a session on whatever generation was current. The host already starts its engine with a private home, an environment allow-list and discovery switched off. Its tests show that the run loads everything projected with an empty home, and that settings, extensions, skills, prompts and MCP configurations planted in the workspace are ignored. Issue #30.

## Decision

- **No ambient configuration** becomes a general requirement (HCS-0008-R025), not an ACP one. Every engine, file-configured or ACP-driven, reads nothing from user-global locations, and reads from the workspace only instruction files the host allows as a host-owned setting. Banning a repository's `AGENTS.md` outright would be a product decision for coding hosts, which no host has proven.
- The section 2 definition of a projection now includes the parameters of the request that creates an engine session, so R001, R002, R007 and R025 apply over ACP.
- An **ACP extension** under the HCS namespace `io.github.fullfran.hcs` (HCS-0000 section 7) covers the three gaps with the smallest surface that interoperates:
  - capability negotiation in `agentCapabilities._meta` (R026);
  - `generation.id` and absolute `generation.skills` paths in `session/new` `_meta` (R027). The paths are every skill the run gets: the generation's, resolved inside it without `..` or a moving pointer, plus host defaults no contribution replaces;
  - a `generation_mismatch` refusal of `session/load` or `session/resume` that is on another generation or does not say which (R028);
  - an `_io.github.fullfran.hcs/loaded` request that answers what the session loaded, used as the R014 report (R029).
- Host-specific `_meta` (model, policy, UI) stays under each host's own namespace. HCS standardises only what two independent hosts and agents need to agree on.
- A new registry code, `generation_mismatch` (HCS-0006). No existing code means "this session belongs to another generation".
- The namespace is GitHub-backed reverse-DNS, the convention the MCP Registry uses for publishers without a domain, and is provisional like the `urn:hcs:` schema ids. HCS proposes skills, a creation identifier and a "loaded resources" report to the ACP project. When ACP covers them, this section profiles ACP and the extension is withdrawn.

## Consequences

- An ACP agent from any vendor can be projected into, if it implements the extension; a host can tell whether it does from `initialize`.
- Reopening a conversation after an update starts a new session. This is deliberate: the session's history and its session-limited grants (HCS-0005-R006, R008) were created against the previous generation's code.
- What counts as a loaded MCP server stays the agent's observation; a server with no tools may look like one that did not start.
- Alternatives rejected:
  - Re-binding `session/load` to the current generation and dropping session grants: it keeps a conversation whose earlier tool calls refer to code that is gone, and it needs rules on which grants survive (#25).
  - A `session/update` kind for loaded resources: ACP owns its update kinds, and inventing one is a fork. An extension method is the extension point ACP provides.
  - Delivering skills through an extension method, or through a resource loader inside the agent that fetches them: both add a round trip and a second channel for the same paths. `_meta` on `session/new` already carries per-session parameters.
  - Standardising every host `_meta` key: most of them are product configuration, not interoperability.
