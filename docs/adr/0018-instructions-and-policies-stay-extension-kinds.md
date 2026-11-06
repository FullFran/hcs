# ADR-0018: Instructions and policies stay extension kinds

**Status:** Proposed (2026-11-06)

## Context

The first host ships instruction files (agents, commands, instructions) and policies as packages next to skills and MCP servers. HCS-0001 has two core kinds, `skill` and `mcp-server`; [lf-fit-distro-1-and-core-0.md](../research/lf-fit-distro-1-and-core-0.md) row 15 held new core kinds back until a second harness needs them. AGENTS.md (AAIF, [agents-md.md](../standards/agents-md.md)) is a widely supported convention for instruction content but defines no structure; agent and command definitions are engine-specific; there is no cross-engine standard for agent permission policies.

## Decision

- No new core kinds. Instructions, agents, commands and policies remain `x-<distribution>-...` kinds.
- HCS-0008's general rules apply to them: projected or reported (R003 to R005), never overriding host-owned settings (R007).
- Instruction content SHOULD be plain Markdown in the AGENTS.md convention, with no structure inside the file.
- A policy contribution can only narrow host-owned permissions; it never grants (HCS-0005-R002).
- Promoting `instructions` (AGENTS.md content) to a core kind waits for a second harness ([ADR-0022](0022-host-adapter-open-questions-decided.md), decision 1).

## Consequences

- An engine without an instructions or permissions mapping reports those entries `unsupported_contribution` instead of pretending they are active.
- Alternative rejected: core `instructions` and `policy` kinds now. AGENTS.md would support the first, but nothing neutral supports the second, and one harness does not meet README rule 1.
