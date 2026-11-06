# Model Context Protocol (MCP)

| Field | Value |
| --- | --- |
| Owner | Model Context Protocol a Series of LF Projects, LLC (per `GOVERNANCE.md`); AAIF project [F] (https://aaif.io/projects, read 2026-11-06) |
| Version pinned | revision `2026-07-28` (`LATEST_PROTOCOL_VERSION` in `schema/2026-07-28/schema.ts`) |
| Source pinned | `modelcontextprotocol/modelcontextprotocol@2026-07-28` (tag, commit `5f5440bb26a62e2cf3440b92da5a667efa03b267`); docs read at `main@3c4d91b7e832d9b74338d56eed03403ccc662123` |
| Access date | 2026-11-06 |
| License | In transition MIT → Apache-2.0 for code and specification; documentation (excluding specs) CC-BY-4.0 (`LICENSE`, `GOVERNANCE.md`) |
| Maturity | Dated stable revision; previous revision `2025-11-25`; `schema/draft/` exists for the next one |
| HCS action | adapter (TOOLS-1); contribution kind by name only in HCS-0001 |

## What it defines

A JSON-RPC 2.0 protocol between an MCP client (inside a host) and an MCP server that exposes tools, resources and prompts, plus client-side features (sampling, elicitation, roots). Transports: stdio and Streamable HTTP. Revision 2026-07-28 is stateless: no `initialize` handshake and no session; each request carries its protocol version and client capabilities in `_meta`, and servers advertise themselves through `server/discover`. Server-initiated requests were replaced by `InputRequiredResult` (multi round-trip: the client retries the original request with the requested input).

## Key objects and fields

- `server/discover` (servers MUST implement, clients MAY call) → `DiscoverResult`: `supportedVersions: string[]`, `capabilities: ServerCapabilities`, `instructions?`, plus `ttlMs` from `CacheableResult`.
- `ServerCapabilities`: `experimental?`, `logging?`, `completions?`, `prompts.listChanged?`, `resources.subscribe?`/`listChanged?`, `tools.listChanged?`, `extensions?` (map of extension id → settings object).
- `ClientCapabilities`: sent per request in `_meta["io.modelcontextprotocol/clientCapabilities"]`; also has `extensions?`. Servers MUST NOT infer capabilities from prior requests.
- `tools/list` → `ListToolsResult` (extends `PaginatedResult` and `CacheableResult`): `tools: Tool[]`, `nextCursor?`, `ttlMs`.
- `Tool` (extends `BaseMetadata`, `Icons`): `name`, `title?`, `description?`, `inputSchema` (`type: "object"`), `outputSchema?`, `annotations?` (`ToolAnnotations`), `_meta?`. Tool names SHOULD be 1-128 chars, case-sensitive, unique within a server.
- `tools/call` → `CallToolResult`: `content: ContentBlock[]`, `structuredContent?`, `isError?`; or `InputRequiredResult` (`inputRequests?`, `requestState?`).
- `Result.resultType`: `"complete"` | `"input_required"` | string; servers on this revision MUST include it.
- Reserved request `_meta` keys: `io.modelcontextprotocol/protocolVersion` (required; must match the `MCP-Protocol-Version` HTTP header), `io.modelcontextprotocol/clientInfo`, `io.modelcontextprotocol/clientCapabilities` (required), `io.modelcontextprotocol/logLevel` (deprecated). Result: `io.modelcontextprotocol/serverInfo`. Notification: `io.modelcontextprotocol/subscriptionId`.
- Trace context: `_meta` keys `traceparent`, `tracestate`, `baggage` are reserved (exception to the prefix rule) and follow W3C Trace Context / W3C Baggage.
- Errors: JSON-RPC `Error {code, message, data?}`; standard codes `-32700`, `-32600`, `-32601`, `-32602`, `-32603`; MCP codes `HEADER_MISMATCH = -32020`, `MISSING_REQUIRED_CLIENT_CAPABILITY = -32021`, `UNSUPPORTED_PROTOCOL_VERSION = -32022`. Tool execution failures go in `CallToolResult` with `isError: true`, not as protocol errors.

## Extension points

- `_meta` on requests, results and notifications: keys are `prefix/name`; prefix is dot-separated labels, reverse DNS recommended; any prefix whose second label is `modelcontextprotocol` or `mcp` is reserved.
- `capabilities.extensions`: extension identifiers follow the `_meta` key rules with a mandatory prefix (e.g. `io.modelcontextprotocol/tasks`, `io.modelcontextprotocol/ui`). If only one side supports an extension, the supporting side MUST fall back to core behavior or reject with an error.
- Extension stages: Experimental → Beta → Stable (or promoted to core); official extensions live in `ext-*` repos, experimental ones may live in `experimental-ext-*`.
- Tasks: moved out of core in 2026-07-28 into extension `io.modelcontextprotocol/tasks` (repo `modelcontextprotocol/ext-tasks`, `main@cc9aaac1047a9440b07486e38f37060bbebeef4c`, no release). Extensions overview lists it as "Beta, to Core". Uses `tasks/get` polling and `tasks/update`.
- `capabilities.experimental` remains for non-standard capabilities.

## Where HCS references it instead of redefining

- HCS-0001: contribution kind `mcp-server` points to an MCP server (launch/transport descriptor). HCS MUST NOT restate `DiscoverResult`, `Tool` or `ListToolsResult`.
- HCS-0002: an HCS capability ID MAY map to one or more MCP tool names, but MCP tool names stay server-local; HCS MUST NOT use them as global IDs.
- HCS-0003: "requires MCP revision X" is a compatibility constraint on the pinned revision string (`2026-07-28`), compared to `supportedVersions`.
- HCS-0004: readiness of an `mcp-server` contribution is a successful `server/discover`; no session to establish on 2026-07-28.
- HCS-0005: per-call grant checks wrap `tools/call`; `ToolAnnotations` are hints and MUST NOT be read as grants.
- HCS-0006: HCS error codes map onto JSON-RPC `Error`; HCS reuses `-32601`/`-32602`/`-32021`/`-32022` semantics rather than inventing parallel codes.
- TOOLS-1: pins exactly one revision; trace propagation uses the reserved `traceparent`/`tracestate`/`baggage` keys; HCS host metadata uses its own reverse-DNS `_meta` prefix.

## Pitfalls for HCS

- Stateless break: designs assuming `initialize`, `Mcp-Session-Id` or server-initiated `sampling`/`elicitation` requests target 2025-11-25, not 2026-07-28. Pin and test one.
- `clientCapabilities` are per request; a host cannot negotiate once and cache.
- Tool errors are in-band (`isError`); mapping every failure to a JSON-RPC error hides it from the model.
- Tasks is a Beta extension, not core; do not make TOOLS-1 depend on it normatively.
- Licensing is mixed MIT/Apache-2.0 during transition; quote identifiers only.
- Extension stage table comes from `docs/` on `main`, which may be newer than the 2026-07-28 tag. [I]

## Sources

Site URLs below were read as their source files in the pinned repository; the live sites were not fetched in this pass [U for any live-site drift].

- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/2026-07-28/schema/2026-07-28/schema.ts
- https://modelcontextprotocol.io/specification/2026-07-28/basic/index (`_meta`, trace context)
- https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning (extension negotiation)
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://modelcontextprotocol.io/docs/extensions/overview
- https://github.com/modelcontextprotocol/ext-tasks
- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/GOVERNANCE.md
