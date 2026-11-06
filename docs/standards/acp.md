# Agent Client Protocol (ACP)

| Field | Value |
| --- | --- |
| Owner | Jointly governed by Zed and JetBrains under an interim governance model (`docs/community/governance.mdx`) |
| Version pinned | wire protocol version `1` (`protocolVersion` in `initialize`); schema artifact release `schema-v1.29.1` (2026-11-02) |
| Source pinned | `agentclientprotocol/agent-client-protocol@schema-v1.29.1` (tag object `62c3cc473b46e2d19b55e2c3a27ccd86b1e459e8`); docs read at `main@734309dc6ff8f5a3b93adca62826dd63cff85a26` |
| Access date | 2026-11-06 |
| License | Apache-2.0 |
| Maturity | v1 stable; v2 alpha (`schema-v2.0.0-alpha.13`, GitHub prerelease, 2026-11-02); `schema.unstable.json` files carry unstable features |
| HCS action | adapter (AGENT-1: ACP surface for clients) |

## What it defines

A JSON-RPC 2.0 protocol between a client (typically a code editor) and a coding agent. The defined transport is stdio: the client launches the agent as a subprocess, newline-delimited UTF-8 messages, stdout reserved for protocol messages, stderr free for logs. A Streamable HTTP remote transport is still being specified in an RFD; custom transports are allowed. The client initializes the connection, creates or loads sessions, sends prompt turns, and serves agent requests for permission, file system and terminals.

## Key objects and fields

- `initialize` (client → agent, before anything else): request `protocolVersion` (integer, latest the client supports), `clientCapabilities` (`fs.readTextFile`, `fs.writeTextFile`, `terminal`, `auth.terminal`), `clientInfo` (`name`, `title?`, `version`). Response `protocolVersion` (same if supported, else agent's latest), `agentCapabilities` (`loadSession`, `promptCapabilities` {`image`, `audio`, `embeddedContext`}, `mcpCapabilities` {`http`, `sse`}, `sessionCapabilities` {`list`, `delete`, `additionalDirectories`, `resume`, `close`}, `auth` {`logout`}, `_meta`), `agentInfo`, `authMethods`.
- Version rule: if the client does not support the agent's returned version it SHOULD close the connection. Omitted capabilities MUST be treated as unsupported.
- Agent methods (v1 `meta.json`): `initialize`, `authenticate`, `session/new`, `session/load`, `session/resume`, `session/list`, `session/delete`, `session/close`, `session/set_mode`, `session/set_config_option`, `session/prompt`, `session/cancel` (notification), `logout`. Baseline every agent MUST support: `session/new`, `session/prompt`, `session/cancel`, `session/update`.
- Client methods: `session/request_permission`, `session/update` (notification), `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, `terminal/output`, `terminal/release`, `terminal/wait_for_exit`, `terminal/kill`, `elicitation/create`, `elicitation/complete`. Protocol method: `$/cancel_request`.
- `session/new` params: `cwd`, `mcpServers` (the client hands MCP server configs to the agent); result `sessionId`.
- `session/prompt` result `stopReason`: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`.
- Errors (`error.mdx`): JSON-RPC `-32700`, `-32600` (also: request before `initialize`), `-32601` (also: un-advertised capability-gated method), `-32602`, `-32603`; ACP `-32800` request cancelled, `-32000` authentication required, `-32002` resource not found (`data.sessionId` for unknown sessions). Unknown codes MUST be treated as generic failure.

## Extension points

- `_meta` (`{ [key: string]: unknown }`) on many requests, responses, notifications, content blocks, tool calls, plan entries and capability objects; not on `Error`.
- Root `_meta` keys `traceparent`, `tracestate`, `baggage` SHOULD be reserved for W3C trace context (aligned with MCP).
- Custom fields MUST NOT be added at the root of spec-defined types; all names there are reserved.
- Extension methods: any method name starting with `_` is reserved for extensions (example `_com.example/workspace/buffers`). Unknown custom requests get `-32601`; unknown custom notifications SHOULD be ignored.
- Custom capabilities SHOULD be advertised in the `_meta` of capability objects during `initialize`, using MCP's reverse-DNS key naming.
- Implementation-specific error codes SHOULD avoid the reserved ranges `-32768..-32000` and `-32899..-32800`.

## Where HCS references it instead of redefining

- AGENT-1: an HCS host exposes its agent surface as an ACP agent at wire version `1`; HCS MUST NOT restate `initialize`, `session/*` or `stopReason` shapes.
- HCS-0001: if a contribution kind for an ACP agent is added, it points to an ACP agent launch descriptor; HCS pins the wire `protocolVersion`, never the schema release (`schema-v1.29.1` is an artifact version).
- HCS-0003: compatibility constraints compare integer `protocolVersion`, not crate or schema versions.
- HCS-0005: `session/request_permission` is the ACP channel to ask the user; HCS grants are decided by the host and MAY surface through it, but ACP capabilities (`fs.*`, `terminal`) describe client features, not plugin authority.
- HCS-0006: HCS error codes map onto ACP JSON-RPC codes (`-32601`, `-32602`, `-32002`, `-32800`); new HCS codes, if needed on the wire, go outside the reserved ranges.
- HCS-0000: HCS host extensions on ACP use `_`-prefixed methods with an HCS reverse-DNS namespace and `_meta` keys on capability objects.

## Pitfalls for HCS

- Name clash with IBM's "Agent Communication Protocol" (merged into A2A); always write "Agent Client Protocol". (catalog, pre-verified)
- Schema and crate releases move weekly (several per week in late October 2026) without changing the wire version; do not treat them as protocol versions.
- v2 renames and drops methods (`auth/login`, `auth/logout`, `tool_call/cancel`, `terminal/cancel`; no client `fs/*` or `terminal/*` in v2 `meta.json`). Do not bind AGENT-1 to v2 while it is alpha.
- `mcpServers` in `session/new` means the client, not the agent's host config, may decide MCP servers; HCS must define precedence between catalog-declared and client-supplied servers. [I]
- `docs/protocol/v1/draft/` exists alongside released v1 docs; read the released pages, not the draft. [I]

## Sources

Site URLs below were read as their source files in the pinned repository; the live sites were not fetched in this pass [U for any live-site drift].

- https://github.com/agentclientprotocol/agent-client-protocol/blob/main/README.md (versioning)
- https://github.com/agentclientprotocol/agent-client-protocol/blob/schema-v1.29.1/schema/v1/meta.json
- https://github.com/agentclientprotocol/agent-client-protocol/releases (schema-v1.29.1, schema-v2.0.0-alpha.13)
- https://agentclientprotocol.com/protocol/v1/initialization
- https://agentclientprotocol.com/protocol/v1/extensibility
- https://agentclientprotocol.com/protocol/v1/error
- https://agentclientprotocol.com/protocol/v1/transports
- https://agentclientprotocol.com/protocol/v1/prompt-turn
- https://agentclientprotocol.com/community/governance
