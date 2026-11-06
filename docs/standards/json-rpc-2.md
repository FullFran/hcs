# JSON-RPC 2.0

| Field | Value |
| --- | --- |
| Owner | JSON-RPC Working Group (json-rpc@googlegroups.com); site jsonrpc.org |
| Version pinned | JSON-RPC 2.0 |
| Source pinned | https://www.jsonrpc.org/specification (origin date 2010-03-26, based on the 2009-05-24 version; last updated 2013-01-04) |
| Access date | 2026-11-06 |
| License | "Copyright (C) 2007-2010 by the JSON-RPC Working Group"; copying, implementing and derivative works allowed if the notice is kept; the specification text itself may not be modified (no SPDX identifier) |
| Maturity | Stable, frozen since 2013; no conformance suite |
| HCS action | adapter (HCS-0006 errors, JSON-RPC binding; used by TOOLS-1 via MCP and AGENT-1 via ACP) |

## What it defines

A stateless, transport-agnostic remote procedure call protocol encoded in JSON: requests,
notifications, responses, errors and batches.

## Key objects and fields

- Request: `jsonrpc` (exactly `"2.0"`), `method` (string; names starting with `rpc.` are
  reserved), `params` (optional, array or object), `id` (string, number or null).
- Notification: a request without `id`; the server must not reply, even on error.
- Response: `jsonrpc`, `id` (same as request; `null` if the request id could not be read),
  and exactly one of `result` or `error`.
- Error object: `code` (integer), `message` (short string), `data` (optional, any value,
  server-defined).
- Pre-defined codes: `-32700` Parse error, `-32600` Invalid Request, `-32601` Method not found,
  `-32602` Invalid params, `-32603` Internal error.
- `-32000` to `-32099`: "Server error", reserved for implementation-defined server errors.
- The whole range `-32768` to `-32000` inclusive is reserved for pre-defined errors; undefined
  codes in it are reserved for future use. Everything outside it is free for applications.
- Batch: array of requests; response array in any order, matched by `id`; no response at all if
  the batch held only notifications.

## Extension points

- `rpc.`-prefixed method names are reserved for extensions.
- `error.data` carries arbitrary structured detail.
- Application error codes anywhere outside `-32768..-32000`.
- Protocols built on JSON-RPC (MCP, ACP) add their own conventions on top, for example
  `params._meta` in MCP; those are not part of JSON-RPC.

## Where HCS references it instead of redefining

- HCS-0006 JSON-RPC binding: an HCS error surfaced through MCP (TOOLS-1) or ACP (AGENT-1) is a
  JSON-RPC error object; HCS MUST NOT restate the request/response/error envelope.
- HCS-0006 places the HCS code (for example `permission_denied`) and HCS context inside
  `error.data`, under one HCS-owned key, rather than inventing new top-level members.
- HCS-0006 picks integer codes outside `-32768..-32000` for HCS-specific errors, unless the host
  protocol (MCP or ACP revision pinned by the profile) already assigns a code for that case; the
  profile defers to the host protocol's assignment.
- Protocol-level failures keep their JSON-RPC meaning: malformed params stay `-32602`, unknown
  method stays `-32601`; HCS does not remap them.
- TOOLS-1 and AGENT-1 conformance cases assert both `code` and the HCS key in `data`.

## Pitfalls for HCS

- MCP and ACP each assign codes inside or near the reserved range [U: exact assignments not
  checked here; see the MCP and ACP standard files]. HCS must not collide with them; keep a
  table per pinned protocol revision.
- The `-32000..-32099` server range is per implementation; two hosts can use the same number
  for different meanings. HCS identity must live in `data`, not in the number alone.
- Notifications cannot report errors; any HCS operation that needs a typed failure must be a
  request with an `id`.
- `id` may be a string or number; do not assume integers when correlating with telemetry.
- `message` is human text; never match on it.

## Sources

- https://www.jsonrpc.org/specification
