# ADR-0001: One-line requirement IDs and directory-based case polarity

**Status:** Proposed (2026-11-06)

## Context

README rule 3 says every MUST gets a conformance case. To enforce that mechanically, requirements need stable IDs that a script can extract, and cases need to say whether they satisfy or violate a requirement. OpenFeature extracts requirement headings into `specification.json` ([docs/standards/openfeature.md](../standards/openfeature.md)); MCP keeps BCP 14 keywords in prose with no IDs ([docs/standards/mcp.md](../standards/mcp.md)).

## Decision

- Each requirement is one Markdown line `**[HCS-NNNN-RMMM]** <sentence>`; its level is the first BCP 14 keyword. `tools/extract_requirements.py` generates `requirements/requirements.json`, with `--check` for drift.
- Cases live in `conformance/cases/<doc>/<req>/{valid,invalid}/`. The directory gives the polarity: `valid/` exercises the satisfied path, `invalid/` the violation path (input that triggers the error, or that a non-conforming implementation gets wrong).
- The runner fails when a MUST/MUST NOT lacks either polarity, or a case names an unknown ID (HCS-0000-R001/R002).

## Consequences

- Coverage is checkable without a host. Host-only requirements still need case files, which are reported as `pending` until a host adapter exists, so "covered" does not mean "executed".
- One line per requirement makes long requirements awkward to read in raw Markdown. Accepted for now.
- Alternative rejected: headings per requirement (OpenFeature style). More verbose for the small HCS documents; can be revisited without renumbering.
