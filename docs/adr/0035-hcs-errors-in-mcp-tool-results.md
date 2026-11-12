# ADR-0035: HCS errors may travel in MCP tool results

**Status:** Proposed

## Context

HCS-0006 section 4.1 carried an HCS error over MCP only as a JSON-RPC error (`error.data.hcsError`, [ADR-0006](0006-error-codes-ride-in-data.md)). MCP has a second path for failures: a `CallToolResult` with `isError: true`, which clients are asked to show to the model so it can retry. A 2026-11-12 survey of three harnesses found each handling tool failures in its own way:

- RE;write (public) returns refusals as tool results with `isError` and a problem object in `structuredContent`, adds a recovery hint (`next_step`) to that object and to the text, and builds the tool's `outputSchema` so that error results validate. It raises HCS failures as JSON-RPC errors.
- training-mcp (public) lets a fixed set of known errors through as plain text messages and collapses every other error to a generic message. It has no HCS-0006 mapping.
- HagaHarness (private; named only) puts errors in a member of its own with its own `urn:` prefix instead of `hcsError`.

So one consumer had the tool-result path without a place for an HCS error, and the others had no typed error at all in tool results. MCP's own text says protocol errors are for problems with the request that a model is unlikely to fix, and tool execution errors are for actionable feedback ([mcp.md](../standards/mcp.md)).

## Decision

- HCS-0006 gets section 4.5. An HCS error in a tool result is `isError: true`, the error object at `structuredContent.hcsError` (the member HCS-0006 already uses on the other two transports), and at least one text item in `content` (R007).
- The two transports are chosen by what failed: a failure of the tool's own execution that a model can act on uses the tool result; a failure of the request or of the host stays a JSON-RPC error. One failure is reported one way. This is prose guidance, not a MUST: a host that reports everything as JSON-RPC errors stays conformant to R003.
- MCP requires structured results to conform to a declared `outputSchema` and exempts nothing, so R008 requires the error result's `structuredContent` to validate against it. The SDK offers `withHcsErrorOutput`, which wraps a schema in `anyOf` with an alternative that requires `hcsError`.
- A client reads an HCS error from a tool result only when `isError` is `true` and `structuredContent.hcsError` validates (R009, and R006 gains this source). Text and other members are never read, for the reason R006 exists.
- Conditions no HCS document defines stay outside the HCS error object. The existing rule (section 3, last paragraph) applies; section 4.5 only says where they go in a tool result: other members of `structuredContent`.
- No recovery-hint member. It is OQ-0006-5.

## Consequences

- Additive: no code, no JSON-RPC mapping and no existing case changes. R006's list of sources grows by one.
- A tool with an `outputSchema` that requires result members rejects error results until it is widened; the failure shows up at the server, not in the model.
- Runner: the `client` level reads a `tools/call` response in `input.response`; the `document` level has a `toolCallOutput` target whose `outputSchema` check is semantic. The case schema is unchanged.
- The new requirements are in no profile yet.

## Alternatives rejected

- Always use the tool result for HCS errors: an unknown tool or a malformed request has no tool to return a result from, and R003 would break.
- An HCS-specific error member beside `hcsError` (as the private harness does): a second place to read means the mistake R006 describes.
- `next_step` as a core member: it comes from one harness, and its content names that product's tools. A model that reads the text item gets the same help.

## Open

OQ-0006-5, the recovery hint, until a second consumer needs one with product-neutral wording. A list of several errors in one result (OQ-0006-2) is still undefined.
