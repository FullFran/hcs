# Feature: standards definitions and HCS core spec drafts

Objective: pin the external standards HCS depends on, then draft the HCS-owned seams with schemas and conformance.
Branch: FullFran/hcs-standards-harness. Delivery: single-pr, local commits only (no push, no PR). Test runner: `python3 conformance/runner/run.py` (python-jsonschema).

## Specs

- S1: "Bring in the definitions of the open standards already listed in docs/research/standards-catalog.md" ... "fetch the primary source (official spec/repo), pin the exact version/commit and access date, and record the normative parts HCS depends on: what it defines, its key objects/fields, its extension points, and exactly where HCS must reference it instead of redefining it. Put this under docs/standards/<standard>.md (one file each, English, neutral), citing source URLs. Do not copy large verbatim spec text (licenses); summarize and link. Mark anything unverified as [U]."
- S2: "draft the HCS normative documents that the research identifies as HCS-owned seams (composition-map.md section 3 and 4), starting with HCS-0001 catalog manifest as the README says (id, version, contributions, content hash and size, compatibility), then whatever else the evidence supports (capabilities/IDs, resolution, lifecycle, authority requests vs host grants, typed errors)."
- S3: "spec/HCS-NNNN-*.md with RFC 2119 keywords and requirement IDs, schemas/ JSON Schema 2020-12 as source of truth, conformance/ valid+invalid fixtures for every MUST."
- S4: "Keep distribution-specific decisions (HagaHarness privacy guards, trust tiers) out, or under x-<distribution>. Only include requirements a real harness needs; list open questions instead of inventing requirements."
- S5: "Validate the schemas against the fixtures with any available JSON Schema validator (state the tool and result). Add an ADR in docs/adr/ for each meaningful design decision."
- S6: "commit in reviewable Conventional Commit slices (~400 lines each; standards definitions separate from spec drafts). No AI attribution in commits. Do not push or open PRs."
- S7: "update the worktree comment with a one-line status and leave a short summary of what was defined, what's open, and what was not verified."

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1 | delegated (4 parallel research writers, disjoint files) | done | 612af2d, 3b64a31, 3f3b22b, bba09f4, 9b0d540 |
| T2 | S2-S5 | inline: HCS-0000 conventions, runner, requirement extractor | done | 77995a9, 1b55b8b |
| T3 | S2-S5 | inline: HCS-0006 errors, HCS-0001 catalog manifest + schema + cases | done | 77995a9, 17a1669 |
| T4 | S2-S5 | inline: HCS-0002 capability IDs, HCS-0003 resolution + cases | done | 17a1669, a32dfa6 |
| T5 | S2-S5 | inline: HCS-0004 lifecycle, HCS-0005 authority + cases | done | 40513b9 |
| T6 | S5 | inline: ADRs | done | with each spec commit |
| T7 | S6-S7 | inline: commits, worktree comment, summary | done | 1b55b8b |

Route evidence: T1 delegated by the Writer trigger (parallelism: ~29 independent files, each needing primary-source fetches). T2-T6 inline (one author, shared conventions).

## Log

- L1 (2026-11-06, user request, verbatim excerpt): "Continue building HCS (Harness Composition Specification) in this repo. Read README.md (scope + growth rules) and everything in docs/research/ first ... At the end, update the worktree comment with a one-line status and leave a short summary of what was defined, what's open, and what was not verified."
- L2 (2026-11-06): T1 returned 29 files; corrections to the catalog recorded in docs/standards/README.md. Scratch clones removed by the parent.
- L3 (2026-11-06): python-jsonschema 4.10 (system) mis-resolves `#/$defs` refs inside urn: schemas; runner requires >= 4.18 (ADR-0002). Evidence: run.py with 4.26.0 -> 102 cases, 84 pass, 0 fail, 18 host pending, 0 coverage problems; Ajv 8.17.1 cross-check 48 agree / 0 disagree; mutation check (6 flipped expectations + 1 unknown id) all detected.
- L4 (2026-11-06): next step: host adapter for `host` cases (Goose v1.57.0 or HagaHarness), then answer OQ-0001-1 (artifact format) and OQ-0003-1 (provider selection).
