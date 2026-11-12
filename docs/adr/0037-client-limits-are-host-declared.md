# ADR-0037: MCP client limits are declared by the host and checked at projection time

**Status:** Proposed

## Context

Two harnesses that expose an MCP server to ChatGPT found the same two problems, each in its own code:

- ChatGPT does not promise to show a model all of a server's `instructions`. A harness for Go (a training log) caps its instructions at 512 characters and tests it; a harness for writers writes its instructions so the order of calls, the review URL and the limit of the agent's authority all appear in the first 512 characters, and tests that head. Both cite the same reason.
- A harness whose tool list grew had to move its tool-list budget from 30 KB to 36 KB, and keeps a test that fails the build when the list passes it. The figure is the harness's own.

HCS-0008 projects `mcp-server` contributions (section 6.4) and reports what a client cannot take (R003, R004, R017), but says nothing about a client that keeps only part of what a server sends. A generation can therefore add a server whose tool list a client silently cuts, and the host reports the entry `active`.

## Evidence

- RE;write (public), `src/adapters/mcp.ts` (server instructions written so the first 512 characters stand alone), `tests/evals.test.ts` and `evals/journeys/chatgpt-tool-metadata.json` (a journey checks the head of the instructions and that the tool list stays under 36,000 bytes; a self-test makes the list grow and expects the failure).
- training-mcp (public), `internal/mcpsrv/annotations.go` (comment: ChatGPT only guarantees the first 512 characters count) and `internal/mcpsrv/server_test.go` (fails if the instructions pass 512 characters).
- OpenAI, Apps SDK, "Build your MCP server" (https://developers.openai.com/apps-sdk/build/mcp-server, read 2026-11-12): "Keep the most important details in the first 512 characters" of the server instructions. It is guidance, not a stated limit, and the page states no limit on the size or number of tools.
- Not verified: the 36 KB tool-list figure. Public reports of other numbers exist (a community forum post about roughly 100 KB for ChatGPT Desktop; a Claude Code issue about truncation of tool descriptions and instructions at 2,048 characters); none is an official source. They do show that clients differ.
- The MCP specification defines `instructions` and `tools/list` but no size limit on either ([docs/standards/mcp.md](../standards/mcp.md)).

## Decision

1. **Limits are declared, not defined.** HCS names no number. A host declares, per client, an object valid against `schemas/hcs-0008/client-limits/v0.1/client-limits.schema.json` with `instructionsPrefix` (characters) and/or `toolListBytes` (bytes) (R036). A limit that is not declared is not applied. The 512 figure is the evidence for a value a host may declare for ChatGPT; it is not a default and is not in any MUST.
2. **Tool-list budget is checked at projection time (R037, R038).** The size is the UTF-8 length of the compact JSON `tools` array across all pages of `tools/list`, measured by the host on the server it will start. A server over the declared budget, or one with no measurement while a budget is declared, is reported `unsupported_contribution`.
3. **Instructions are an authoring rule (R039, SHOULD).** What a model needs to use the server belongs within the smallest declared prefix. It is not machine-checkable and an adapter cannot read instructions of a server that is not running. The adapter never edits, truncates or reorders them.
4. **Error code.** `unsupported_contribution`, as ADR-0021 does for a kind the engine cannot take: the client cannot take that contribution. R017 keeps it from failing the generation. No new HCS-0006 code is needed.

## Consequences

- A host that wants the check needs a probe that starts the server and lists its tools before projection. A host that cannot measure declares no `toolListBytes`.
- A server whose tool list changes after projection (`tools/list_changed`) is not re-checked by projection; the health check (R013, R014) is where a host catches it. Open question OQ-0008-9 covers a static declaration.
- A client whose limit is wrong in the declaration makes the host report entries that would have worked, or accept entries that do not. Hosts own that declaration.
- Conformance: R036 has `document` cases against the new schema; R037 and R038 have `projection` cases (`clientLimits` in the input and `toolListBytes` on the contribution); R039 has none. `conformance/README.md` and `docs/architecture.md` do not mention the new input members yet (outside this change's edit surface).

## Alternatives rejected

- Fixing 512 characters and 36 KB in the specification: only the first is documented by the client's vendor, and as guidance; the second is one harness's choice.
- A new error code such as `client_limit_exceeded`: the recovery is the same as for `unsupported_contribution` (the entry is reported and the rest proceeds), and ADR-0014 asks for a defined condition and more than one implementation per code.
- Truncating or summarizing a server's instructions in the adapter: it changes content the publisher signed (HCS-0008-R008 treats generation files as unmodified) and hides the problem from the person who can fix it.
- Failing the whole generation: R017 and ADR-0022 decision 2 keep a per-engine fact from deciding the fate of the generation.
