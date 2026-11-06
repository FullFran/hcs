# Linux Foundation fit: the host adapter contract (HCS-0008)

**Status:** research note, not normative. Access date for all sources: 2026-11-06.
**Labels:** [F] verified fact with a primary source; [I] inference by the author of this note; [U] could not be verified.

## Purpose

This note applies the method of [lf-fit-distro-1-and-core-0.md](lf-fit-distro-1-and-core-0.md) to the pull request that drafts HCS-0008: for each change, would a project hosted by the Linux Foundation (LF), the CNCF, the OpenSSF or the Agentic AI Foundation (AAIF) accept it in this form? The verdicts use the same vocabulary: **Fits**, **Fits with changes**, **Does not fit**.

## 1. The lens

The criteria are those of [lf-fit-distro-1-and-core-0.md](lf-fit-distro-1-and-core-0.md) section 1 (vendor neutrality, reuse over invention, need-driven scope, conformance before claims, two implementations, IP hygiene, stability and versioning). This pull request adds one criterion the brief asks for explicitly:

| Criterion | What it means here | Sources |
| --- | --- | --- |
| Provisional things clearly marked | A document that covers what no standard covers says so in its header and names what replaces it. | IETF Informational and Experimental RFC categories mark non-standards-track text [I]; README rule 6 (quarterly kill review) |
| Open process | Decisions recorded as ADRs with alternatives; research public with sources; open questions listed in the document. | README; [how-standards-are-built.md](how-standards-are-built.md) |

## 2. Verdicts

| # | Change | Verdict | What changed versus the first host's behaviour |
| --- | --- | --- | --- |
| 1 | New HCS-0008 host adapter contract | **Fits with changes** | Written as observable behaviour, not as the host's materializer. Engine mappings (three engines, versioned) are a non-normative appendix: normative text naming three products would fail vendor neutrality. Marked Provisional with a `Superseded when` clause, because no neutral standard exists to profile ([host-adapter-standards.md](host-adapter-standards.md) section 3). |
| 2 | `Provisional` and `Superseded when` header fields (HCS-0000 section 4) | **Fits** | Process only. Makes README rule 6 visible in each document instead of in a quarterly review alone. |
| 3 | Skills: Agent Skills adopted as is, never edited (R008), unprefixed names a SHOULD (R009) | **Fits** | Pure reuse of an AAIF format. R009 is a SHOULD because one engine only loads packaged skills under a prefix; a MUST would exclude it for a cosmetic reason. |
| 4 | MCP descriptors: `server.json` 2025-12-11, profiled with no secret values (R010 to R012) | **Fits with changes** | The host's own `integration.json` is replaced by the MCP project's descriptor (reuse over invention). The profile adds one constraint and restates nothing. The reference runner does not vendor the MCP schema (README rule 5); it checks the required members and the secret rule. |
| 5 | Instructions, agents, commands, policies | **Fits with changes** | Not promoted to core kinds (one harness; same reasoning as issue #3 in the earlier note, row 15). AGENTS.md content is a SHOULD. Policies may only narrow host-owned settings. The host's ad hoc "they arrive but nothing reads them" becomes a reported `unsupported_contribution`. |
| 6 | Precedence: host-owned settings cannot be replaced, removed or widened (R007); generation collisions rejected (R006) | **Fits with changes** | Derived from UAPI.6 layering, not invented. Changed from the host: the list of host-owned settings is declared by the host instead of hard-coded, and HCS defines no settings vocabulary (as HCS-0005 defines no permission vocabulary). Same-name collisions between generation packages are rejected instead of resolved by scan order. |
| 7 | One generation per engine run (R001, R002) | **Fits with changes** | Stated as what the engine sees, not as "use symlinks". Changed from the server-side box host: its static path through the `active` pointer does not conform. |
| 8 | Every contribution projected or reported; active only if projected (R003 to R005); unprojectable entries do not fail the switch (R017) | **Fits** | Applies the existing HCS-0001-R008 at projection time; no new concept. R017 ([ADR-0022](../adr/0022-host-adapter-open-questions-decided.md)) keeps one engine's gap from blocking a signed set it does not own; `all-or-nothing` stays for the catalog. |
| 9 | Confirm after health, one attempt, one rollback (R013 to R016) | **Fits with changes** | Reuses the UAPI.1 boot counting state model with N fixed to 1, the desktop host's behaviour. Changed from the server-side box host: confirmation moves from the sync service to after an engine run. HCS names no health protocol; R014 (loaded-set check) is a MUST only where the engine exposes the set. |
| 10 | Error codes | **Fits** | No new codes; five existing codes get wider "Raised when" text and HCS-0008 in their "Defined by" column, as ADR-0014 prescribes. No dedicated health-check code: health is a state (`healthy`, `unhealthy`, `unknown`, R018), as in Kubernetes conditions, gRPC health and boot assessment (ADR-0022). |
| 11 | `projection` conformance level and reference projection | **Fits** | Same pattern as `resolution` and `authority`: an executable reading of the rules. Host-level requirements stay `pending`; the runner is not a host. |
| 12 | Six new standards notes | **Fits** | Pinned by tag or commit, licences recorded, governance stated. The UAPI Group is a community, not a foundation [F]; HCS cites its specifications as precedent, not as normative dependencies. |
| 13 | Promote the host's materializer code into HCS | **Does not fit; not done** | It would copy private code and make HCS depend on one host. The implementation brief for the first host lives outside this repository. |
| 14 | Maintainer decisions of 2026-11-06 ([ADR-0022](../adr/0022-host-adapter-open-questions-decided.md)): no core `instructions` kind, no health code, no adapter profile, agents and commands per engine | **Fits** | Each declines to standardise what has one implementation; none changes an earlier verdict. |

## 3. Reuse versus invention

| HCS-0008 part | Reused | Invented, and why |
| --- | --- | --- |
| Skill format | Agent Skills (AAIF) | nothing |
| MCP descriptor | MCP Registry `server.json` (AAIF) | the no-secret-value constraint: a signed, cached generation must not hold secrets |
| Instruction content | AGENTS.md (AAIF) | nothing |
| Precedence | UAPI.6 layering | per-setting granularity and "narrow only": engines merge settings, not whole files |
| Atomicity | HCS-0007-R017; Kubernetes `AtomicWriter` pattern | the engine-run rule (R001, R002): no standard speaks about agent engines rescanning configuration |
| Confirmation | UAPI.1 boot counting | N = 1, and the loaded-set check (R014) |
| Health check | Kubernetes probes, gRPC health | nothing; HCS names none |
| Projection itself | none exists | the whole contract, hence Provisional |

## 4. Two implementations and stability

- HCS-0008 is `Draft` and `Provisional`. It is in no profile; a host adapter profile waits for a second host (ADR-0022, decision 4).
- One host implements part of it (the desktop host: skills, health, one rollback) and none conforms: the server-side box host fails R001, R002 and R013, and no host projects MCP, instructions or policies.
- Two engines' mechanisms in appendix A come from one host's observations [H in [host-adapter-standards.md](host-adapter-standards.md)]; a second host would confirm or correct them.

## 5. IP hygiene

- No host code, file names beyond the generic generation layout, hostnames, tenant names or customer names appear. The first host is referred to as "the first host", "a desktop host" and "a server-side box host".
- The MCP Registry schema is cited, not copied: the reference runner checks two rules by name.
- Commits carry a DCO sign-off (`git commit -s`), as `CONTRIBUTING.md` requires.

## 6. Sources

- [lf-fit-distro-1-and-core-0.md](lf-fit-distro-1-and-core-0.md) sources (CNCF and OCI charters, OpenSSF lifecycle).
- https://aaif.io/projects
- Pinned notes: [agent-skills.md](../standards/agent-skills.md), [agents-md.md](../standards/agents-md.md), [mcp-registry-server-json.md](../standards/mcp-registry-server-json.md), [mcpb.md](../standards/mcpb.md), [uapi-config-files.md](../standards/uapi-config-files.md), [uapi-boot-counting.md](../standards/uapi-boot-counting.md), [kubernetes-probes.md](../standards/kubernetes-probes.md), [grpc-health.md](../standards/grpc-health.md).
