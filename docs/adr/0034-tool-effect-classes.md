# ADR-0034: Tools declare one of three effect classes, mapped to MCP annotations, and an undeclared tool is the most dangerous

**Status:** Proposed

## Context

A host shows the tools of a package's MCP server to an engine and a person and has to decide when a call needs a question first. MCP gives it `ToolAnnotations` hints, but they are optional, a server reports them about itself, and their defaults mean "destructive and open-world". Three harnesses built the same step independently (survey of 2026-11-12, README rule 1):

- A manuscript-analysis harness (RE;write, public) defines two annotation presets: a reading preset (read-only, not destructive, closed world) and a proposing preset (not read-only, not destructive, idempotent, closed world). Every tool it registers takes one of them. The agent can only read and propose; a person decides.
- A strength-training log server (training-mcp, public) classifies each tool as read-only, additive, keyed (additive and safe to repeat with the same idempotency key) or overwriting (deletes or replaces, idempotent), maps each to annotations, always sets closed world, and refuses to start when a tool has no entry, because the protocol defaults would call it destructive and open-world.
- A desktop assistant (HagaHarness, private) describes each file-touching tool of a local server as one of read, create, move, copy, rename, archive, delete or edit. Its policy asks nothing for read and create, asks for move, copy, rename and archive only when the destination exists, and always asks for delete and edit. A tool with no entry, or a call it cannot classify, is never treated as free.

The common core is small: all three separate "reads only" from "changes something", two separate "adds only" from "changes or removes existing data", two use idempotency, two always declare a closed world, and all three treat the unknown as the dangerous case.

## Decision

1. A new document, HCS-0009, binds packages and hosts. It is not a section of HCS-0008: HCS-0008 describes what an adapter writes into an engine, while this is a contract on the package (what it declares) and on every host that presents the tool, whether or not it runs an adapter.
2. Three classes: `read`, `additive`, `destructive`. `destructive` also covers effects that cannot be undone (send, publish). Each declaration may add `idempotent` (default false) and `openWorld` (default true). The defaults are the MCP ones, so omitting a flag never lowers the danger.
3. The declaration is the member `tools` of `_meta["io.github.fullfran.hcs"]` in the `server.json` of the `mcp-server` contribution, a map from the server's tool name to the declaration. `server.json` is already the descriptor HCS-0008 reads (R010), for a `file` server it is signed with the code it describes, and HCS-0000 section 7 reserves this reverse-DNS key for HCS's own members of MCP documents. The catalog manifest is not used: it would repeat a tool list that belongs to the server.
4. The mapping to the four MCP hints is a table (HCS-0009 section 4). The host presents its own annotations and discards those the server reports about itself (R005): a signed declaration is covered by the package's hash and signature, a run-time self-report is not.
5. Fail closed (R004): a missing declaration, an unknown class and any malformed declaration present the MCP defaults (read-only false, destructive true, idempotent false, open-world true). `effect` is any non-empty string in the schema, so a class added by a later version is a valid document that an older host treats as destructive; only a wrongly typed member makes the entry `manifest_invalid` (R001).
6. A declared class is metadata, not a grant (R006): HCS-0005-R001 and R002 apply to every `tools/call` as if the declaration did not exist. Which classes ask a person is a distribution policy.
7. Packages SHOULD declare every tool (R002). Refusing to start a server with undeclared tools is allowed, as training-mcp does, but not required: the fail-closed rule already makes the omission safe.
8. Conformance uses the existing levels. The mapping and the fail-closed rule are `document` cases against a `classification` definition in the schema, which JSON Schema can express with conditionals; the schema cannot say that two members are equal, so each expected annotation set is spelled out per case. What a host actually presents (R003 to R005) is `host` cases; R006 is `authority` cases. No new case level.

## How the three harnesses map

| Harness | Their classes | HCS-0009 |
| --- | --- | --- |
| RE;write | reading; proposing | `read` (closed world); `additive`, idempotent, closed world |
| training-mcp | read-only; additive; keyed; overwriting | `read`; `additive`; `additive`, idempotent; `destructive`, idempotent. All closed world |
| HagaHarness | read; create; copy; move; rename; archive; delete; edit | `read`; `additive` for create and copy; `destructive` for the rest. The finer judgement (a move onto a name that does not exist is free) stays in the product's policy, under an `x-<distribution>` member of the declaration |

## Alternatives rejected

- Copy the union of all class names (eight Haga kinds, four training kinds). Only one harness separates move, copy, rename and archive, and its rule depends on whether a path exists, which is a property of a call, not of a tool.
- Take MCP annotations as the declaration itself. They have no unknown value: absent means destructive for `destructiveHint` and `openWorldHint`, but absent `readOnlyHint` means false, and a server can state `readOnlyHint: true` about itself with no signature. Classes with a signed home and a defined translation are the profile; the annotations are the output.
- A new field in the catalog manifest. It would duplicate the tool list per entry and change the shape of the catalog manifest for something that is not about distribution.
- A class `external` for send and publish. One harness (Haga) treats them specially and the other two have no such tools; kept as an open question.

## Consequences

- A package adopting HCS-0009 adds one `_meta` member to its `server.json`; one that does not is presented as destructive and open-world, which is what MCP clients already assume.
- HCS-0008 would gain one pointer: the sentence "A host presents the tools of an `mcp-server` contribution under HCS-0009" in section 6.4. This change does not edit HCS-0008.
- No new HCS-0006 code: an invalid member uses `manifest_invalid`, and the fail-closed rule is a presentation rule, not an error.
- The shape of the `_meta` member inside the MCP Registry `server.json` schema (2025-12-11) was not checked against the schema file: the standards note says only that `_meta` takes reverse-DNS keys and reserves `io.modelcontextprotocol.registry/publisher-provided` for publisher data. If the schema rejects other keys, the declaration moves under that reserved key.

## Open

OQ-0009-1 to OQ-0009-4 in the document: finer classes, a class for irreversible external effects, remote servers, and resources, prompts and host-provided tools.
