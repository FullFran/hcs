# How technical standards are defined, built and consumed

**Status:** research note, not normative. Access date for all sources: 2026-11-06.
**Labels:** [F] verified fact with a primary source; [I] inference by the author of this note; [U] could not be verified.
Full URL list: [sources.md](sources.md).

## Purpose

HCS must decide, before writing `HCS-0001`, where its source of truth lives, how requirements are numbered, how versions and stability are signalled, and how a host proves conformance. This note looks at nine working exemplars and distills a template consistent with the rules in the repository README (need-driven growth, JSON Schema as source of truth, no MUST without a conformance test, spec vs distribution split, clean provenance, quarterly kill review).

## 1. Exemplars

### 1.1 Model Context Protocol (MCP)

- **Repo layout.** One repository, `modelcontextprotocol/modelcontextprotocol`, with `schema/<revision>/` (`schema.ts`, generated `schema.json`, `examples/`), `docs/specification/<revision>/` (prose, `changelog.mdx`, generated `schema.mdx`), `seps/` and `docs/seps/` (enhancement proposals), plus `GOVERNANCE.md`, `MAINTAINERS.md`, `SECURITY.md`. [F] ([repo][mcp-repo])
- **Source of truth.** The TypeScript schema per revision. `npm run generate:schema:json` derives JSON Schema from it, and `check:schema:json` fails CI if the committed JSON drifts; `check:schema:examples` validates example messages against the schema. [F] ([package.json][mcp-pkg]) Prose remains normative for behaviour (MUST/SHOULD language in the docs). [F] ([2026-07-28 changelog][mcp-changelog])
- **Requirement IDs.** No numbered requirement IDs; requirements are BCP 14 keywords inside prose sections. Changes are tracked by SEP number (for example SEP-2106, SEP-2577, both "Final"). [F] ([SEP-2106][mcp-sep2106])
- **Versioning.** Date-stamped revisions: 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25, 2026-07-28, plus `draft`. A release candidate tag (`2026-07-28-RC`, 2026-05-29) preceded the final revision (2026-07-28) by two months. [F] ([releases][mcp-releases]) Revision 2026-07-28 removed the `initialize` handshake and protocol-level sessions; every request now carries its protocol version in `_meta`, and servers MUST implement `server/discover`. [F] ([changelog][mcp-changelog]) Lesson for HCS [I]: a dated revision can break wire compatibility, so adapters must pin the revision they test against.
- **Conformance.** A separate repository, `modelcontextprotocol/conformance` ("Conformance Tests for MCP"), active in November 2026. [F] ([repo][mcp-conformance])
- **Adoption.** SDKs per language import a revision; clients negotiate the revision on the wire. [F] ([changelog][mcp-changelog]) No badge programme found. [U]
- **Governance and license.** AAIF project (Impact stage per the coordinator's verified facts). License in transition from MIT to Apache-2.0 for code and spec, CC-BY-4.0 for non-spec docs. [F] ([LICENSE][mcp-license], [AAIF projects][aaif-projects])

### 1.2 Language Server Protocol (LSP)

- **Layout.** Prose spec in `microsoft/language-server-protocol` under `_specifications/lsp/<minor>/` (3.17, 3.18, 3.19); reference TypeScript protocol in `microsoft/vscode-languageserver-node/protocol`. [F] ([spec repo][lsp-repo], [protocol package][lsp-protocol])
- **Source of truth.** TypeScript protocol definitions. A generator (`tools/src/generator-main.ts`) emits `protocol/metaModel.json` (version field `3.18.0` today), and a second step emits `metaModel.schema.json`. [F] ([package.json][lsp-protocol-pkg], [metaModel.json][lsp-metamodel]) Other languages generate their bindings from the meta model rather than from prose. [I] (the spec page lists `metaModel.json` as "the actual meta model" for each version) [F] ([3.17 spec][lsp-317])
- **Versioning.** Minor versions with capability negotiation in `initialize`; 3.18 is described as current, 3.19 as under development. [F] ([3.18 spec][lsp-318], [3.19 spec][lsp-319])
- **Conformance.** No official conformance suite found. [U]
- **Governance and license.** Microsoft-led; spec repo licensed CC-BY-4.0. [F] ([repo][lsp-repo])
- **Lesson [I]:** a language-neutral meta model (data, not code) is what makes multi-language codegen cheap. HCS can get the same property from JSON Schema directly.

### 1.3 OpenTelemetry

- **Layout.** Three normative repositories plus the GenAI split: `opentelemetry-specification` (prose, `oteps/` with 49 enhancement proposals, `spec-compliance-matrix.md`), `opentelemetry-proto` (wire format, v1.11.1, 2026-09-29), `semantic-conventions` (YAML model in `model/`, generated docs, `policies/`, v1.45.0, 2026-11-02). [F] ([spec][otel-spec], [proto][otel-proto], [semconv][otel-semconv])
- **GenAI conventions moved.** Since 2026-05 the GenAI conventions (including `mcp.md` and agent spans) live in `open-telemetry/semantic-conventions-genai`; their documents are marked **Development** and the repo has no release yet (changelog shows only "Unreleased"). [F] ([semconv moved notice][otel-genai-moved], [genai repo][otel-genai])
- **Source of truth.** Prose for API/SDK behaviour; protobuf for OTLP; YAML for conventions, from which docs and code are generated. [F] ([semconv repo][otel-semconv])
- **API vs SDK split.** The spec separates the API (what instrumentation calls) from the SDK (the implementation), so libraries depend only on the API. [F] ([library guidelines][otel-libguide])
- **Stability markers.** Per document or per section: Development, Alpha, Beta, Release Candidate, Stable, Deprecated, Unmaintained; "Experimental" is an old name for Development; a document with mixed sections is marked "Mixed". [F] ([maturity levels][otel-maturity], [document status][otel-docstatus])
- **Versioning.** The spec itself is SemVer-released (v1.62.0, 2026-10-21). [F] ([CHANGELOG][otel-changelog])
- **Conformance.** A self-reported compliance matrix per language SDK, not an executable suite. [F] ([matrix][otel-matrix])
- **Governance.** CNCF **Graduated** (landscape data, November 2026). [F] ([CNCF landscape.yml][cncf-landscape]) The Notion page only says "CNCF".

### 1.4 OpenFeature

- **Layout.** `open-feature/spec`: `specification/sections/*.md` (prose), `specification.json` (machine-readable requirements), `specification/assets/gherkin/*.feature`, `tools/specification_parser`, `version.txt`, `release-please-config.json`. [F] ([repo][of-repo])
- **Requirement IDs.** Every normative statement is a heading `Requirement 1.1.2.1`; the parser extracts each into `specification.json` with `id`, `machine_id`, `content` and its BCP 14 keyword. [F] ([specification.json][of-specjson]) This is the strongest precedent for README rule 3 ("every MUST gets a test"): tests can reference `requirement_1_1_2_1` directly. [I]
- **Stability markers.** Per section: Experimental, Hardening, Stable, each with explicit change rules (for example Hardening breaking changes need TSC consensus). [F] ([spec README][of-readme])
- **Versioning.** Spec 0.9.0 (tag 2026-07-24; previous 0.8.0 in 2024-03). Provider TCK versioned independently (`specification/assets/provider-tck/v0.1.0`, 2026-10-16). [F] ([tags][of-tags])
- **Conformance.** Gherkin suites executed by each SDK, plus a provider test kit and the `flagd-testbed` repo. [F] ([gherkin appendix][of-gherkin], [flagd-testbed][of-testbed])
- **Governance and license.** CNCF **Incubating**; Apache-2.0. [F] ([CNCF landscape.yml][cncf-landscape], [repo][of-repo])

### 1.5 CloudEvents

- **Layout.** `cloudevents/spec`: `cloudevents/spec.md` (core), `bindings/` (HTTP, AMQP, Kafka, MQTT, NATS, WebSockets), `formats/` (JSON with `cloudevents.json` schema, Avro, Protobuf), `extensions/`, `SDK.md` (SDK requirements), `primer.md` (non-normative rationale), plus sibling specs `cesql/`, `subscriptions/`. [F] ([repo][ce-repo])
- **Versioning.** Latest release v1.0.2 (2022-02-05); `main` reads "1.0.3-wip"; a v2 consideration list exists with no commitment. [F] ([release notes][ce-release], [v2 list][ce-v2]) A small core plus separately evolving bindings has stayed stable for years. [I]
- **Conformance.** No formal suite; "SDK conformance tests" is still an open discussion item on the v2 list. [F] ([v2 list][ce-v2])
- **Governance.** CNCF **Graduated**; Apache-2.0. [F] ([CNCF landscape.yml][cncf-landscape])

### 1.6 JSON Schema

- **Layout.** `json-schema-org/json-schema-spec`: `specs/` (Core, Validation, meta-schemas, output), `adr/`, `PROCESS.md`. [F] ([repo][js-repo])
- **Process.** The project decoupled from the IETF Internet-Draft track (ADR 2022-09) and defined its own stable-spec process (ADR 2022-11). `PROCESS.md` defines stability operationally: two releases are compatible if every schema keeps the same defined pass/fail result. [F] ([ADRs][js-adr], [PROCESS.md][js-process]) The repository holds work in progress for the next release; 2020-12 remains the latest published dialect. [F] ([README][js-repo]), [F] ([2020-12][js-2020])
- **Conformance.** The shared `JSON-Schema-Test-Suite` (MIT) and Bowtie, which runs it across implementations. [F] ([test suite][js-suite], [Bowtie][bowtie])
- **Relevance.** MCP already moved tool `inputSchema`/`outputSchema` to full 2020-12 (SEP-2106). [F] ([SEP-2106][mcp-sep2106]) Picking 2020-12 for HCS aligns with the main tool protocol. [I]

### 1.7 IETF RFC / BCP process

- **Keywords.** BCP 14 = RFC 2119 + RFC 8174; RFC 8174 says the keywords carry their special meaning only in uppercase. [F] ([RFC 8174][rfc8174])
- **Errors.** RFC 9457 (Problem Details for HTTP APIs, July 2023) obsoletes RFC 7807 and defines an IANA registry of problem types. [F] ([RFC 9457][rfc9457])
- **Versioning model.** RFCs are immutable; changes ship as a new RFC that updates or obsoletes the old one, with errata in between; BCPs are stable labels that can point to a changing set of RFCs (BCP 240 = RFC 9700). [F] ([RFC 9700][rfc9700])
- **Lesson [I]:** HCS normative documents should be immutable once released (`HCS-0001` v1 never edited), and changes should be new documents or new major versions.

### 1.8 OCI (image, distribution, runtime)

- **Layout.** Separate repos per spec. `image-spec` holds prose (`manifest.md`, `descriptor.md`, `artifacts-guidance.md`), JSON Schemas in `schema/` with Go tests, and Go types in `specs-go/`. `distribution-spec` adds a runnable `conformance/` program (Go, emits JUnit). [F] ([image-spec][oci-image], [distribution-spec][oci-dist])
- **Versions.** image-spec v1.1.1 (2025-03-03), distribution-spec v1.1.1 (2025-01-29), runtime-spec v1.3.0 (2025-11-04). [F] ([image releases][oci-image-rel], [dist releases][oci-dist-rel], [runtime releases][oci-runtime-rel])
- **Release process.** Releases are tagged after a maintainer vote on the OCI dev list (`RELEASES.md`). [F] ([RELEASES.md][oci-releases])
- **Lesson [I]:** a conformance program that any implementer runs against their own endpoint is the model for an HCS runner that points at a host.

### 1.9 CNCF and AAIF project lifecycles

- **CNCF:** Sandbox, Incubating, Graduated; graduated and incubating projects "are considered stable". [F] ([CNCF projects][cncf-projects])
- **AAIF:** stages Sandbox, Growth, Impact, Emeritus. Admission and graduation require an absolute majority (>50%) of the Technical Committee, then Governing Board approval. Sandbox needs a 1–2 page thesis, gets standard infrastructure only, a six-month checkpoint, and must apply for Growth within twelve months or face an Emeritus discussion. Growth projects are expected to exit within two years. [F] ([lifecycle policy][aaif-lifecycle]) Proposals are GitHub issue forms in `aaif/project-proposals` with labels New, Approved, Declined, Waiting on Comment, Too Early; the authoritative process document lives in `aaif/technical-committee`. [F] ([project-proposals][aaif-proposals])
- **Relevance [I]:** an eventual AAIF Sandbox application would need a thesis, neutral governance and early external interest; README rule 3 (two independent hosts) is the natural Growth-plan metric.

## 2. Comparison

| Exemplar | Source of truth | Req. IDs | Version scheme | Stability markers | Conformance |
| --- | --- | --- | --- | --- | --- |
| MCP | TS schema → JSON Schema; prose | SEP numbers | dated revision + RC | draft vs released revision | separate repo [F] |
| LSP | TS → metaModel.json | none | minor + capabilities | "under development" | none found [U] |
| OpenTelemetry | prose + proto + YAML | none | SemVer per repo | 7 maturity levels per doc/section | self-reported matrix |
| OpenFeature | prose → specification.json | `Requirement N.N.N` | 0.x SemVer | Experimental / Hardening / Stable | Gherkin + provider TCK |
| CloudEvents | prose + JSON/proto/Avro formats | none | 1.0.x | none (wip suffix) | none (open item) |
| JSON Schema | prose + meta-schemas | none | dated dialect | process-defined stability | shared test suite + Bowtie |
| A2A | `a2a.proto` → JSON Schema (generated, not committed) | none | SemVer v1.0.1 | — | TCK repo |
| ACP | Rust types → JSON Schema (v1, v2, `*.unstable.json`) | none | wire `protocolVersion` separate from schema release | stable vs unstable files | none found |
| OCI | prose + JSON Schema + Go types | none | SemVer, maintainer vote | rc tags | runnable conformance (distribution) |

A2A and ACP rows: [F] ([A2A json README][a2a-json], [ACP README][acp-readme]); everything else as cited above.

## 3. Patterns that matter for HCS

1. **Machine-readable source, generated everything else.** MCP, LSP, A2A and ACP all generate JSON Schema from a typed source and check drift in CI. [F] (above) HCS README already chooses JSON Schema as the source itself; generating TS/Rust from it removes one layer. [I]
2. **Separate wire version from artifact version.** ACP states this explicitly: schema or crate releases do not imply wire compatibility; use the negotiated `protocolVersion`. [F] ([ACP README][acp-readme]) HCS needs three independent versions: spec version, schema/contract version, package version (the Notion page already says this). [I]
3. **Requirement IDs that tests can cite.** Only OpenFeature does it, and it is the only exemplar where "every MUST has a test" is mechanically checkable. [F]/[I]
4. **Per-section stability.** OTel and OpenFeature mark stability per document or section, which lets a spec ship stable cores with experimental edges. [F]
5. **Conformance in its own versioned artifact.** MCP, A2A and OpenFeature version the conformance kit separately from the spec. [F]
6. **RC before final, and dated or SemVer, not both.** MCP uses dated revisions with RCs; OCI and A2A use SemVer with rc tags. [F] Mixing schemes confuses consumers. [I]
7. **Small core, separate bindings.** CloudEvents and OCI keep the core tiny and add bindings/formats as separate documents. [F] That matches HCS profiles (CORE-0, TOOLS-1...). [I]

## 4. Recommended template for the HCS repo

All of this is a recommendation [I]; it refines the "Planned layout" in the README without contradicting it.

### 4.1 Directories

```txt
spec/
  HCS-0000-conventions.md     # BCP 14, requirement ID format, stability markers, versioning
  HCS-0001-catalog-manifest.md
  profiles/                   # CORE-0.md, later TOOLS-1.md ...
schemas/
  hcs-0001/catalog-manifest/v0.1/catalog-manifest.schema.json
requirements/
  requirements.json           # extracted from spec/ by a script; checked in CI
conformance/
  cases/HCS-0001/<req-id>/{valid,invalid}/*.json
  runner/                     # language-agnostic CLI, see 4.5
  profiles/core-0.json        # list of requirement IDs per profile
sdk/ts/  sdk/rust/            # generated only, when a consumer needs them
examples/
docs/adr/  docs/research/
```

### 4.2 Document numbering and lifecycle

- `HCS-NNNN-<slug>.md`, four digits, never reused. Each has a header block: `Status` (Draft, Candidate, Released, Deprecated), `Version`, `Requires`, `Replaces`.
- A Released document is immutable; changes create a new version of the same number (`HCS-0001` v0.2) recorded in a changelog, following the IETF immutability idea. [I]
- Change proposals: an ADR in `docs/adr/` linked from the PR; no separate SEP repo until there is a second contributor. [I]

### 4.3 Requirement IDs

- Format `HCS-0001-R012` (document number plus a three-digit sequence). IDs are never renumbered; removed requirements are tombstoned.
- Each requirement is a single sentence with one uppercase BCP 14 keyword, prefixed by the ID as an anchor, in the OpenFeature style. [I]
- A script extracts `{id, keyword, text, document, status}` into `requirements/requirements.json`. CI fails if a MUST has no conformance case referencing its ID (README rule 3), and if a case references an unknown ID. [I]

### 4.4 Schema and codegen pipeline

- JSON Schema 2020-12 is authored by hand in `schemas/`; every schema has a canonical `$id` under a URL the project controls, with the version in the path. [I]
- Instance documents point at the HCS schema (`$schema` or a dedicated `hcsVersion` plus `$id`), never at the 2020-12 meta-schema (the Notion example does the latter, and the page itself flags it). [I]
- Generation: TypeScript types with a JSON-Schema-to-TS generator; Rust types with a JSON-Schema-to-Rust generator (for example `typify`). Tool choice is open and goes in an ADR. [U] for tool fitness: not evaluated here.
- CI drift check like MCP's `check:schema:json`: regenerate and diff. [F] precedent ([MCP package.json][mcp-pkg])
- Extensions: unknown properties allowed only under `x-<distribution>` keys (README rule 4); core schemas use `additionalProperties: false` elsewhere or `patternProperties: {"^x-": {}}`. [I]

### 4.5 Language-agnostic conformance runner

- Cases are data: `input`, `expect` (`valid` | `invalid` plus expected error code), `requirements: [ids]`. [I]
- Two levels: (a) **document conformance** (validate fixtures against the schema, with any 2020-12 validator, cross-checked like Bowtie does); (b) **host conformance** later, where the runner drives a host through a small JSON-over-stdio adapter (the OCI distribution model of "point the runner at your implementation"). [I]
- Output: JUnit XML and a JSON report `{profile, hcsVersion, host, results[]}` that is the evidence for any compatibility claim. [I]

### 4.6 Release and versioning policy

- Spec releases: SemVer `0.MINOR.PATCH` until two independent hosts pass the same profile (README rule 3), then 1.0. Pre-releases `0.1.0-rc.1`. [I]
- Contract (schema) versions follow the spec document version; package versions in manifests are opaque strings unless a document defines their semantics (Notion page warns against assuming SemVer). [I]
- Stability markers per section: Draft / Candidate / Stable, with the OpenFeature rule set as the starting point. [I]
- Consumers adopt by pinning a release tag and the schema `$id` (README rule 5); no floating `latest` URL for schemas. [I]
- Quarterly kill review (README rule 6) gets a fixed checklist: for each HCS document, list the external standard that could replace it and why it does not yet. [I]

## 5. Open questions

- License of the spec text versus code (MCP splits code/spec Apache-2.0 and docs CC-BY-4.0). [F] precedent; decision open.
- Whether `requirements.json` is generated or authored. OpenFeature generates it from prose. [F] precedent.
- Rust/TS generator selection. [U]

[mcp-repo]: https://github.com/modelcontextprotocol/modelcontextprotocol
[mcp-pkg]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/package.json
[mcp-changelog]: https://modelcontextprotocol.io/specification/2026-07-28/changelog
[mcp-sep2106]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/seps/2106-json-schema-2020-12.mdx
[mcp-releases]: https://github.com/modelcontextprotocol/modelcontextprotocol/releases
[mcp-conformance]: https://github.com/modelcontextprotocol/conformance
[mcp-license]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/LICENSE
[aaif-projects]: https://aaif.io/projects
[lsp-repo]: https://github.com/microsoft/language-server-protocol
[lsp-protocol]: https://github.com/microsoft/vscode-languageserver-node/tree/main/protocol
[lsp-protocol-pkg]: https://github.com/microsoft/vscode-languageserver-node/blob/main/protocol/package.json
[lsp-metamodel]: https://github.com/microsoft/vscode-languageserver-node/blob/main/protocol/metaModel.json
[lsp-317]: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
[lsp-318]: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/specification.md
[lsp-319]: https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.19/specification.md
[otel-spec]: https://github.com/open-telemetry/opentelemetry-specification
[otel-proto]: https://github.com/open-telemetry/opentelemetry-proto/releases
[otel-semconv]: https://github.com/open-telemetry/semantic-conventions
[otel-genai-moved]: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/README.md
[otel-genai]: https://github.com/open-telemetry/semantic-conventions-genai
[otel-libguide]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/library-guidelines.md
[otel-maturity]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/maturity-levels.md
[otel-docstatus]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/document-status.md
[otel-changelog]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/CHANGELOG.md
[otel-matrix]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/spec-compliance-matrix.md
[cncf-landscape]: https://github.com/cncf/landscape/blob/master/landscape.yml
[cncf-projects]: https://www.cncf.io/projects/
[of-repo]: https://github.com/open-feature/spec
[of-specjson]: https://github.com/open-feature/spec/blob/main/specification.json
[of-readme]: https://github.com/open-feature/spec/blob/main/specification/README.md
[of-tags]: https://github.com/open-feature/spec/tags
[of-gherkin]: https://github.com/open-feature/spec/blob/main/specification/appendix-b-gherkin-suites.md
[of-testbed]: https://github.com/open-feature/flagd-testbed
[ce-repo]: https://github.com/cloudevents/spec
[ce-release]: https://github.com/cloudevents/spec/blob/main/cloudevents/RELEASE_NOTES.md
[ce-v2]: https://github.com/cloudevents/spec/blob/main/cloudevents/v2.md
[js-repo]: https://github.com/json-schema-org/json-schema-spec
[js-adr]: https://github.com/json-schema-org/json-schema-spec/tree/main/adr
[js-process]: https://github.com/json-schema-org/json-schema-spec/blob/main/PROCESS.md
[js-2020]: https://json-schema.org/draft/2020-12
[js-suite]: https://github.com/json-schema-org/JSON-Schema-Test-Suite
[bowtie]: https://github.com/bowtie-json-schema/bowtie
[rfc8174]: https://www.rfc-editor.org/rfc/rfc8174
[rfc9457]: https://www.rfc-editor.org/rfc/rfc9457
[rfc9700]: https://www.rfc-editor.org/rfc/rfc9700
[oci-image]: https://github.com/opencontainers/image-spec
[oci-dist]: https://github.com/opencontainers/distribution-spec
[oci-image-rel]: https://github.com/opencontainers/image-spec/releases
[oci-dist-rel]: https://github.com/opencontainers/distribution-spec/releases
[oci-runtime-rel]: https://github.com/opencontainers/runtime-spec/releases
[oci-releases]: https://github.com/opencontainers/image-spec/blob/main/RELEASES.md
[aaif-lifecycle]: https://github.com/aaif/technical-committee/blob/main/governance/project-lifecycle-policy.md
[aaif-proposals]: https://github.com/aaif/project-proposals
[a2a-json]: https://github.com/a2aproject/A2A/blob/main/specification/json/README.md
[acp-readme]: https://github.com/agentclientprotocol/agent-client-protocol/blob/main/README.md
