# ADR-0008: Reference conformance runner in Python with execution levels

**Status:** Proposed (2026-11-06)

## Context

How-standards-are-built section 4.5 asks for data-only cases and a language-agnostic runner, with document conformance first and host conformance later. Some HCS rules are pure schema; others (duplicate ids, digest checks, resolution, grant evaluation, type/code equality in problem details) need a few lines of semantics.

## Decision

- `conformance/runner/run.py` (python-jsonschema >= 4.18, Draft 2020-12) executes five levels: `document`, `integrity`, `resolution`, `authority` with reference semantics, and `host`, which is validated for shape and reported `pending`.
- Schema verdicts are cross-checked with a second validator (Ajv 8.17, draft 2020-12, `conformance/runner/xcheck-ajv.mjs`) on every document case whose expected verdict is schema-only.

## Consequences

- Every executable requirement is checked today, and the reference semantics double as an executable reading of HCS-0001/0003/0005.
- The runner is a reference, not a host adapter. Host-level MUSTs (no code execution before `prepared`, atomic set transitions, revocation at dispatch) are unproven until a host adapter exists.
- The Ajv cross-check (`conformance/runner/xcheck-ajv.mjs`) needs Node and a local `ajv@8.17.1`; it is not part of the default run.
