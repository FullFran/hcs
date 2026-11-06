# ADR-0006: HCS error codes are strings carried inside the transport's error

**Status:** Proposed (2026-11-06)

## Context

HCS needs typed errors that survive JSON-RPC (MCP, ACP) and HTTP. JSON-RPC reserves `-32768..-32000` and leaves `-32000..-32099` for implementations, and the protocols HCS adapts already use that range differently: MCP `-32020..-32022`, ACP `-32000`, `-32002`, `-32800`, A2A `-32001..-32009` ([json-rpc-2.md](../standards/json-rpc-2.md), [mcp.md](../standards/mcp.md), [acp.md](../standards/acp.md), [a2a.md](../standards/a2a.md)). RFC 9457 identifies problem types by URI ([rfc9457-problem-details.md](../standards/rfc9457-problem-details.md)).

## Decision

- A closed set of snake_case string codes in an HCS error object (HCS-0006).
- Over JSON-RPC, the object goes in `error.data.hcsError`; the numeric `error.code` is whatever the carrying protocol prescribes. HCS allocates no numbers.
- Over HTTP, `type` is `urn:hcs:error:<code>` and the object goes in the `hcsError` extension member.

## Consequences

- No collisions with MCP, ACP or A2A codes, and no per-protocol HCS number table.
- Clients that only read numeric codes cannot tell HCS errors apart; they must read `data`.
- Adding a code is a minor version change of HCS-0006; distribution detail goes in `details` under `x-` members.
