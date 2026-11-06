# JSON Schema 2020-12

| Field | Value |
| --- | --- |
| Owner | JSON Schema organisation (`json-schema-org` on GitHub); the project describes itself as a member of the OpenJS Foundation (Linux Foundation) in its IETF-decoupling ADR |
| Version pinned | Dialect 2020-12 (`https://json-schema.org/draft/2020-12/schema`); documents `draft-bhutton-json-schema-01` and `draft-bhutton-json-schema-validation-01`, both dated 2022-06-16 |
| Source pinned | Published meta-schema and documents at `https://json-schema.org/draft/2020-12/`; work-in-progress repo `json-schema-org/json-schema-spec@8595c839899a81abf0cb09e8cc9774b9a0a23db7` (2026-11-02, read for license and governance only) |
| Access date | 2026-11-06 |
| License | Spec repo: BSD-3-Clause **or** Academic Free License v3.0 (dual, per `LICENSE` and README at the pinned commit). JSON-Schema-Test-Suite: MIT. Bowtie: no SPDX id detected by GitHub [U] |
| Maturity | Latest published dialect; the project left the IETF process (ADR `2022-09-decouple-from-ietf`) and the repo `main` holds the next, unreleased version |
| HCS action | adopt (HCS-0000 conventions; schema format for every `schemas/` file, starting with HCS-0001; CORE-0) |

## What it defines

A JSON-based vocabulary for describing and validating JSON documents. 2020-12 is split into a
core document (identification, referencing, applicators, vocabularies, output) and a
validation document (assertions, format, content, meta-data). A dialect is a set of
vocabularies declared by a meta-schema.

## Key objects and fields

- `$schema`: names the dialect / meta-schema; belongs at a resource root.
- `$id`: canonical URI of a schema resource and base URI for relative refs; no non-empty fragment.
- `$anchor`, `$dynamicAnchor`, `$dynamicRef`: plain-name fragments and dynamic extension points.
- `$ref`: applicator; siblings are still evaluated (change from draft-07).
- `$defs`: reserved location for reusable subschemas (replaces `definitions`).
- `$vocabulary`: meta-schema only; maps vocabulary URI to boolean (`true` = must understand, `false` = may ignore).
- Applicators: `allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`, `properties`, `patternProperties`, `additionalProperties`, `items`, `prefixItems`, `contains`, `propertyNames`, `dependentSchemas`.
- Unevaluated vocabulary (`.../vocab/unevaluated`): `unevaluatedProperties`, `unevaluatedItems`; they see annotations from adjacent and nested applicators, unlike `additionalProperties`.
- Validation: `type`, `enum`, `const`, `required`, `pattern`, `minLength`, `maximum`, `dependentRequired`, etc.
- `format`: two vocabularies, `.../vocab/format-annotation` (required support) and `.../vocab/format-assertion` (optional). Assertion MUST be off by default. The 2020-12 meta-schema lists `core`, `applicator`, `unevaluated`, `validation`, `meta-data`, `format-annotation`, `content`, all `true`; `format-assertion` is absent.
- Output formats: `flag`, `basic`, `detailed`, `verbose` (core section 12).

## Extension points

- Custom vocabularies: a meta-schema declares a vocabulary URI in `$vocabulary`; `true` forces
  implementations that lack it to refuse the schema.
- Unknown keywords are collected as annotations, not errors (so typos pass silently).
- `$dynamicRef`/`$dynamicAnchor` let a derived meta-schema extend a base one.
- Instance-level extension (for example `x-*` fields) is a schema-design choice via
  `patternProperties`; JSON Schema itself defines no `x-` convention.

## Where HCS references it instead of redefining

- HCS-0000 states that every HCS schema declares `"$schema": "https://json-schema.org/draft/2020-12/schema"` and an `$id` under an HCS-owned base URI; HCS MUST NOT define its own schema language or keyword semantics.
- HCS-0001 catalog manifest schema closes objects with `unevaluatedProperties: false` and admits `x-<distribution>` members via `patternProperties` (`^x-[a-z0-9-]+$` or similar); HCS defines the pattern, JSON Schema defines how it is evaluated.
- HCS-0001 / CORE-0 conformance fixtures rely on 2020-12 validation results; HCS does not restate keyword behaviour, it pins this dialect.
- HCS-0006 typed errors MAY carry a JSON Schema output unit (`basic` format) in error detail instead of an HCS-specific validation-error shape.
- Implementation checks: validators used by the HCS runner should be chosen from those passing JSON-Schema-Test-Suite (via Bowtie) for 2020-12.

## Pitfalls for HCS

- `format` (for example `uri`, `date-time`) does not reject anything by default. If HCS needs a
  digest or URI to be validated, use `pattern` or require format-assertion explicitly in a
  custom meta-schema, and test both validator modes.
- `additionalProperties: false` ignores properties declared under `allOf`/`$ref`; use
  `unevaluatedProperties: false` for composed schemas.
- Unknown keywords are silently ignored: add a lint step or a meta-schema with `unevaluatedProperties: false` for HCS schemas.
- `$id` and `$ref` resolution must not fetch from the network at validation time; bundle schemas.
- The repo `main` is the next unreleased version; do not cite it as 2020-12.
- JSON-Schema-Test-Suite's last release tag is `23.1.0` (2023-05-12) while `main` keeps moving (`245a45abc90190c0bff04d97e6d2b541b4bb9f12`, 2026-11-03); pin a commit, not the tag.

## Sources

- https://json-schema.org/specification
- https://json-schema.org/draft/2020-12/json-schema-core
- https://json-schema.org/draft/2020-12/json-schema-validation
- https://json-schema.org/draft/2020-12/schema
- https://github.com/json-schema-org/json-schema-spec (LICENSE, README, `adr/2022-09-decouple-from-ietf.md`)
- https://github.com/json-schema-org/JSON-Schema-Test-Suite
- https://github.com/bowtie-json-schema/bowtie (latest release `v2026.11.2`, 2026-11-04)
