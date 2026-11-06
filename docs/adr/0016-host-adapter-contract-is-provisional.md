# ADR-0016: The host adapter contract is a provisional HCS document

**Status:** Proposed (2026-11-06)

## Context

The first host resolves, verifies and prepares generations (HCS-0003, HCS-0007), but turns a generation into engine configuration ad hoc: a desktop host exports one engine's inline configuration with a skills path, a server-side box host keeps a static skills path through the `active` pointer, and MCP, policy and instruction packages reach no engine while being reported active. [host-adapter-standards.md](../research/host-adapter-standards.md) looked for a standard that defines how a desired set is installed into an agent engine and found none: Agent Skills, AGENTS.md and MCP define the content, each engine defines its own configuration, and the closest general precedents (OCI runtime bundles, Kubernetes projected volumes, UAPI.6 layering, boot counting) are not about agent engines.

## Decision

- Write HCS-0008 as a contract on observable behaviour: inputs, one generation per engine run, every contribution projected or reported, precedence of host-owned settings, confirm after health. Engine mappings stay in a non-normative appendix.
- Adopt Agent Skills as is for skills: the adapter places skill directories and never edits them (R008). The prefix some engines add to packaged skill names is a SHOULD (R009), not a MUST, because one engine cannot load a packaged skill without it.
- Mark HCS-0008 `Provisional: yes` with a `Superseded when` clause, a convention added to HCS-0000 section 4.
- Add no schema: the adapter's output is engine-specific and its outcomes are HCS-0006 errors in HCS-0004 status.
- Make the projection rules executable in the reference runner (`projection` level, `conformance/runner/projection.py`), as resolution and authority already are.

## Consequences

- The first host can build one shared materializer against R001 to R016 and claim nothing it cannot show; R001, R002, R008 and R013 to R016 stay `pending` until a host adapter runs them.
- "Active" becomes honest: under DISTRO-1's `all-or-nothing`, an entry an engine cannot take fails the transition (R005), so distributions must target catalogs per engine capability. That is a behaviour change for the first host.
- Alternatives rejected: a full HCS engine-configuration format (one HCS file every engine would read) would invent a standard no engine implements; leaving projection to each host keeps the gap that motivated this.
