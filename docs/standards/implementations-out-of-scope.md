# Implementations in the catalog that are not standards

| Field | Value |
| --- | --- |
| Owner | various (see table) |
| Version pinned | see table |
| Source pinned | see table (tag + commit) |
| Access date | 2026-11-06 |
| License | see table (from GitHub repo metadata) |
| Maturity | implementations, not specifications |
| HCS action | out (none is referenced normatively) |

## What it defines

These catalog entries are products. HCS cites standards, not implementations, so none of them
appears in normative text. Some are useful as test hosts or backends.

| Project | Pin | License | Why not normative | Test host candidate |
| --- | --- | --- | --- | --- |
| agentgateway (AAIF) | agentgateway/agentgateway@v1.7.0 (26f5aebe99a36a037fe54f8080a608aca5547e15), 2026-10-27 | Apache-2.0 | Network proxy for agents and MCP servers; deployment infrastructure of a distribution | No; possible fixture for TOOLS-1 remote MCP through a proxy [I] |
| Agent Router (AAIF, formerly Envoy AI Gateway) | theagentrouter/agent-router@v1.2.0 (daa9f891a8afcb18576d4593ad18870d1d18abac), 2026-10-07 | Apache-2.0 | Envoy-based model/MCP gateway; product config (CRDs), not a protocol | No |
| Goose (AAIF, from Block) | aaif-goose/goose@v1.57.0 (30bba95105e59bc3e7df624cf6b4d433690cfe12), 2026-10-28 | Apache-2.0 | Agent runtime; its extension model is product-specific | Yes: depends on `rmcp` 3.4.1 and `agent-client-protocol` 2.2.0 crates in `Cargo.toml`, so a second-host candidate for TOOLS-1/AGENT-1 [I: runtime behaviour not tested] |
| OpenEnv (AAIF, from Hugging Face) | openenv/OpenEnv@v0.12.0 (c22aa5f4eb5bb9eab7ad40c2baaefce0397464e4), 2026-11-05 | BSD-3-Clause | RL/eval environment framework (Gym-style API, MCP tools over `/mcp`) | Later, for evaluation harnesses; not for 0.1 |
| Google Omaha | google/omaha (archived, read-only); last GitHub release v1.3.36.261 (2023-05-25) | Apache-2.0 | Legacy Windows updater; v4 JSON protocol lives in Chromium docs as a product protocol | No; design reference for a desktop DISTRO-1 updater only |

## Key objects and fields

None normative.

## Extension points

Not applicable.

## Where HCS references it instead of redefining

- Nowhere normatively. Conformance reports MAY name these as hosts under test.

## Pitfalls for HCS

- Do not let a product's plugin format leak into HCS-0001 by being the first host tested.
- Omaha archive date (2025-08-04 in the catalog) not re-checked: the API only shows `archived: true` [U].

## Sources

- https://github.com/agentgateway/agentgateway/releases/tag/v1.7.0
- https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0
- https://github.com/aaif-goose/goose/blob/v1.57.0/Cargo.toml
- https://github.com/openenv/OpenEnv/blob/v0.12.0/README.md
- https://github.com/google/omaha
