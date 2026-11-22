# ADR-0040: A tool's identity is (contribution, raw name); the host never parses an engine name

**Status:** Proposed

## Context

HCS-0009 keys a tool's declaration by the name the server reports in `tools/list`. Engines present another name: they flatten it with the server name (`<server>_<tool>`, `mcp__<server>__<tool>`; HCS-0008 appendix A.1). Two problems follow (issues #111 and #113).

- **Collisions.** Server `files` with tool `x_list` and server `files_x` with tool `list` both become `files_x_list`. A host that splits the name to find the declaration reads one tool's class for the other, and a `read` declaration can reach a `destructive` tool, which then runs without a question. The first host avoided this only by forbidding a server name that is a prefix of another.
- **Drift.** A server, remote ones above all, can list tools its package never declared and add them later (`notifications/tools/list_changed`). Evidence: a harness that ships declarations for eighteen vendor-hosted servers found one live list with about thirty more tools than the vendor's documentation, and one vendor that publishes no tool names. This closes OQ-0009-3.

## Decision

- HCS-0009-R007: the host looks a declaration up by (the contribution that listed the tool, the raw tool name), through a map built at projection time, and never by parsing an engine-built name.
- HCS-0008-R040: the tool name an engine gives is an engine-level name, so a collision between `mcp-server` entries is HCS-0008-R006: none is projected, each is reported `ambiguous_provider`. A host tool is not a contribution, and two tools of one entry are not two contributions: those entries are reported `unsupported_contribution`. An entry that collides both with another entry and with a host tool is `ambiguous_provider`. The map is therefore injective by construction. The two codes differ in effect: `unsupported_contribution` follows R017, while `ambiguous_provider` counts against the activation policy, so under `all-or-nothing` an entry-entry collision fails the new generation and the previous one stays active. A tool a remote server lists later can thus stop a generation from activating; that is intended, because the alternative is an implicit choice.
- HCS-0009-R010: the run-time counterpart of R040. A later `tools/list` that would reuse an engine name (of another server, a host tool or the same list) is not presented and is reported; earlier names stay. It does not fail a confirmed generation. A presented tool keeps its name (a running session is not disrupted) and a withheld tool is re-evaluated on each later list of its server.
- HCS-0009-R008: R003 and R004 apply to every `tools/list`, including after `list_changed`; annotations are not kept for a name absent from the latest list. No new field: R004 (undeclared is destructive and open-world), R005 (self-reported annotations ignored) and R006 (a class is no grant) already make drift fail closed.
- HCS-0009-R009 (SHOULD): the host reports undeclared listed names to its operator.
- The SDK offers a pure helper (`buildToolNameMap`, `sdk/ts/src/tool-names.ts`) that builds the map for a naming rule and returns the entries R040 reports.

## Alternatives rejected

- **First entry in generation order keeps the name, the others are reported `unsupported_contribution`** (as proposed in #111). Adding or reordering a package would silently change which server survives, an implicit choice that HCS-0003-R004 and R006 avoid, and it would treat a tool name differently from every other engine-level name.

- **Forbid server names that are a prefix of another.** Enough for one separator rule, not for every engine's rule (character replacement, truncation). R040 covers any naming rule.
- **Leave it to the declaration.** The declaration is local to one server and cannot see the others.
- **A hash suffix chosen by the adapter on every collision** (as some engines do). It would make engine names depend on the whole generation and break stable names; the adapter reports every entry involved and leaves the name alone.
- **A new error code.** The existing codes fit: `ambiguous_provider` for a collision between entries (R006), `unsupported_contribution` where no other contribution is involved. They differ in effect on the activation policy (see the decision), which is the point: the entry-entry case is a failure, not a per-engine limit.

## Prior art

DeepSeek Harness (MIT, commit `d98f5d6`, read without running; mcp-client README, "Tool identity" section) gives each MCP tool the identity `(serverName, rawName)`, with `serverName` from local configuration. Its public name `mcp__<server>__<tool>` is a pure function of that identity, is "never sent to the server and never parsed to recover the raw name", gets a 12-hex SHA-256 suffix when normalization loses information, and the map swaps atomically with the tool list (a failed fetch keeps the previous generation). This is evidence that the design is reachable independently, not code to copy (README rule 5): the shape matches R007, the suffix is an engine-side answer to what R040 reports, and the atomic swap is what R008 requires of the map.

## Consequences

- The conformance cases are `host` cases and stay `pending`: they need running engines and servers. The SDK tests cover the helper.
- R040 needs the tool names of each server at projection time, from a listing the host makes (as for R037); with none, nothing is compared.
- Requirements are unprofiled for now.
- A host that renames tools per account is out of scope; every such tool is undeclared (R004).
