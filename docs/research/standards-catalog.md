# Standards catalog for HCS

**Status:** research note, not normative. Access date: 2026-11-06.
**Labels:** [F] verified against the cited primary source; [I] inference; [U] not verified.
Versions were checked against GitHub releases/tags or the official spec site on the access date; facts marked "(pre-verified)" come from the coordinator's earlier verification pass and keep its URLs. Full list in [sources.md](sources.md).

**HCS action key:** **adopt** = use as-is and reference normatively; **adapter** = HCS defines a mapping, the standard stays outside the core; **profile** = optional HCS profile depends on it; **out** = out of scope for HCS (may still be used by a distribution).

## 1. Summary table

| Standard | Owner | Current version (date) | Maturity | License | Spec format | Conformance | Plane | HCS action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MCP | AAIF (LF) | revision 2026-07-28 (2026-07-28) | AAIF Impact | MIT → Apache-2.0; docs CC-BY-4.0 | TS schema → JSON Schema + prose | `modelcontextprotocol/conformance` | tools (agent ↔ tools) | adapter (TOOLS-1) |
| A2A | AAIF (LF) | v1.0.1 (2026-05-28) | AAIF Growth | Apache-2.0 | protobuf (`a2a.proto`) + prose | `a2a-tck` | agent ↔ agent | adapter (AGENT-1, remote) |
| Agent Skills | AAIF (LF), contributed by Anthropic | unversioned (pin commit) | AAIF Impact | Apache-2.0 code, CC-BY-4.0 docs | prose (SKILL.md frontmatter) | `skills-ref validate` (demo-grade) | procedures | adopt as contribution type |
| AGENTS.md | AAIF (LF) | unversioned | AAIF Impact | MIT | prose convention | none | instructions | adapter (context only) |
| Open Responses | AAIF (LF), contributed by OpenAI | revision 2026-04-24 | AAIF Impact | Apache-2.0 | TypeSpec → OpenAPI | online compliance tester | model | out of core; optional adapter |
| OpenSandbox | AAIF (LF), contributed by Alibaba | release-1.2.0 (2026-10-27) | AAIF Sandbox | Apache-2.0 | OpenAPI (`specs/`) + OSEPs | none found | execution/sandbox | profile backend (ISOLATION-1) |
| agentgateway | AAIF (LF) | v1.7.0 (2026-10-27) | AAIF Growth | Apache-2.0 | implementation | n/a | network perimeter | out (distribution infra) |
| Agent Router | AAIF (LF), ex Envoy AI Gateway | v1.2.0 (2026-10-07) | AAIF Growth | Apache-2.0 | implementation (Envoy) | n/a | model/tool gateway | out |
| Goose | AAIF (LF), from Block | v1.57.0 (2026-10-28) | AAIF Impact | Apache-2.0 | implementation | n/a | agent runtime | out (reference host candidate) |
| OpenEnv | AAIF (LF), from Hugging Face | v0.12.0 (2026-11-05) | AAIF Growth | BSD-3-Clause | implementation (MCP + Gym) | n/a | training/eval env | out |
| ACP (Agent Client Protocol) | Zed Industries + JetBrains community | wire v1; schema-v1.29.1 (2026-11-02); v2 alpha | stable v1, v2 draft | Apache-2.0 | Rust → JSON Schema | none found | client ↔ agent | adapter (AGENT-1) |
| OAuth 2.0 / RFC 9700 | IETF | RFC 6749; RFC 9700 = BCP 240 (2025-01) | Internet Standard track / BCP | IETF Trust | RFC prose | none official | identity (delegated authz) | out of core; referenced by remote profiles |
| OpenID Connect | OpenID Foundation | Core 1.0 errata set 2 (2023-12-15) | final; ISO/IEC 26131:2024 | OIDF IPR | prose | OpenID Certification | identity (users) | out |
| JWT | IETF | RFC 7519 (2015-05) | Proposed Standard | IETF Trust | RFC prose | none | identity tokens | out |
| OPA / Rego | CNCF | v1.22.2 (2026-11-06) | CNCF Graduated | Apache-2.0 | implementation + language | n/a | policy decision | adapter (optional PDP) |
| SPIFFE / SPIRE | CNCF | SPIRE v1.16.0 (2026-11-05) | CNCF Graduated | Apache-2.0 | prose specs + impl | n/a | workload identity | out |
| OCI image / distribution / artifacts | OCI (LF) | image v1.1.1 (2025-03-03), distribution v1.1.1 (2025-01-29), runtime v1.3.0 (2025-11-04) | stable | Apache-2.0 | prose + JSON Schema + Go types | distribution `conformance/` | packaging, transport | profile (DISTRO-1) |
| Sigstore (cosign, Fulcio, Rekor) | OpenSSF (LF) | cosign v3.1.4, Fulcio v1.9.1, Rekor v1.5.5 / Rekor v2 GA | OpenSSF Graduated | Apache-2.0 | impl + protobuf-specs (bundle v0.3) | n/a | supply chain (signing) | profile (DISTRO-1) |
| SPDX | LF (SPDX project) | 3.0.1 (2024-12-17); ISO/IEC 5962:2021 = 2.2.1 | stable | CSL 1.0 (spec) | model + serializations | online tools | supply chain (SBOM) | profile (DISTRO-1, optional) |
| SLSA | OpenSSF | v1.2 (2025-11) | OpenSSF Graduated | CSL 1.0 | prose + provenance predicate | self-attested | supply chain (build provenance) | profile (DISTRO-1, optional) |
| OpenTelemetry (+ GenAI semconv) | CNCF | spec v1.62.0 (2026-10-21), semconv v1.45.0 (2026-11-02), GenAI semconv unreleased | CNCF Graduated; GenAI Development | Apache-2.0 | prose + proto + YAML | compliance matrix | telemetry | adopt (attribute names) |
| CloudEvents | CNCF | v1.0.2 (2022-02-05) | CNCF Graduated | Apache-2.0 | prose + JSON/proto/Avro formats | none | events | adopt for external events (optional) |
| WebAssembly Component Model / WIT / WASI | W3C WebAssembly CG; Bytecode Alliance tooling | WASI v0.3.2 (2026-10-13); Component Model no tagged release | pre-standard (CG) | Apache-2.0 / W3C CG terms [U] | WIT IDL + prose | Wasmtime as de-facto | execution ABI | profile (ISOLATION-1 option, later) |
| OpenFeature | CNCF | spec 0.9.0 (2026-07-24) | CNCF Incubating | Apache-2.0 | prose + `specification.json` + Gherkin | Gherkin + provider TCK | (feature flags) model for process | out as dependency; adopt as process model |
| JSON Schema 2020-12 | JSON Schema org (OpenJS) [U for host org] | 2020-12; next release WIP | stable dialect | BSD/AFL [U] | prose + meta-schemas | JSON-Schema-Test-Suite, Bowtie | contract format | adopt |
| RFC 9457 Problem Details | IETF | RFC 9457 (2023-07) | Proposed Standard | IETF Trust | RFC prose | none | errors over HTTP | adopt for HTTP mapping only |
| BCP 14 (RFC 2119 / 8174) | IETF | RFC 8174 (2017-05) | BCP | IETF Trust | RFC prose | n/a | spec language | adopt |
| TUF | CNCF | spec v1.0.37 (2026-10-08) | CNCF Graduated | CSL 1.0 | prose | reference impls | distribution metadata (rollback, freeze) | adopt properties (DISTRO-1) |
| Uptane | Joint Development Foundation (LF) | 2.1.0 (2023-06-23) | stable | CSL 1.0 | prose | none | distribution (fleet/automotive) | out; reference only |
| Google Omaha | Google | v3 archived (2025-08-04); v4 JSON protocol draft | legacy / draft | Apache-2.0 | prose | none | update protocol (desktop) | out; reference for desktop DISTRO |
| Cordis / DeepSeek Harness | DeepSeek | no release (repo created 2026-08-13) | precedent | MIT | implementation + docs | n/a | plugin composition | precedent; no code reuse |
| OpenClaw | OpenClaw community | v2026.11.1 (2026-11-05) | precedent | MIT | implementation + docs | `openclaw plugins doctor` | plugin composition | precedent; no code reuse |

OpenClaw release date: [F] ([releases][openclaw-rel]). Other versions: see the per-standard notes.

## 2. Per-standard notes

### AAIF projects

- **MCP.** [F] Latest revision 2026-07-28; source `schema/2026-07-28/schema.ts`, generated `schema.json`. ([repo][mcp-repo], [releases][mcp-releases]) 2026-07-28 made the protocol stateless (no `initialize`, no `Mcp-Session-Id`), added required `server/discover`, moved tasks into an extension, introduced Multi Round-Trip Requests replacing server-initiated `sampling`/`elicitation`/`roots` requests, and added `extensions` in capabilities and OTel trace-context keys in `_meta`. ([changelog][mcp-changelog]) Pitfall [I]: the Notion page says "MCP defines stdio and HTTP transports depending on revision" and plans an `McpToolAdapter` with per-call cancellation; that design must target 2026-07-28 semantics (no session, no resumable SSE: a broken stream loses the in-flight request) or explicitly pin 2025-11-25.
- **A2A.** [F] v1.0.1 (2026-05-28), normative `specification/a2a.proto`; JSON Schema is a non-committed build artifact; TSC of nine companies. ([releases][a2a-rel], [json README][a2a-json], [GOVERNANCE][a2a-gov]) Pitfall [I]: A2A is for remote, independently deployed agents; making local plugins into A2A agents adds identity and discovery cost for no gain (the Notion page says the same).
- **Agent Skills.** [F] (pre-verified) Directory with `SKILL.md`; frontmatter `name` (≤64 chars, lowercase/digits/hyphens, matches directory), `description`; optional `license`, `compatibility`, `metadata`, `allowed-tools` (marked experimental). ([spec][skills-spec]) `skills-ref` is "for demonstration purposes only". [F] ([skills-ref][skills-ref]) Pitfall: `allowed-tools` reads like a permission grant but is advisory and experimental; HCS must not treat it as authority. [I]
- **AGENTS.md.** [F] (pre-verified) Plain Markdown convention, MIT, no schema, no conformance. ([repo][agentsmd]) Pitfall [I]: free text, so it can only feed context, never policy.
- **Open Responses.** [F] TypeSpec → OpenAPI per dated revision; revisions 2026-01-15 and 2026-04-24 (WebSocket transport, `/v1/responses/compact`). ([CHANGELOG][or-changelog]) Compliance page is an interactive tester that validates an endpoint against the OpenAPI schema. [F] ([compliance][or-compliance]) Pitfall [I]: model plane only; not a manifest or session format.
- **OpenSandbox.** [F] release-1.2.0 (2026-10-27); OpenAPI specs `sandbox-lifecycle.yml`, `execd-api.yaml`, `egress-api.yaml`, `diagnostic-api.yml`; design proposals in `oseps/`; Docker and Kubernetes runtimes. ([repo][osb-repo], [AAIF announcement][aaif-news]) Sandbox stage (pre-verified). Pitfall [I]: a remote/containers platform, heavy for a desktop distribution; useful as one ISOLATION-1 backend, not as the definition of isolation.
- **agentgateway.** [F] Proxy implementation, v1.7.0, Apache-2.0. ([releases][agw-rel]) Out of HCS core: it sits at the network perimeter of a deployment. [I]
- **Agent Router.** [F] (pre-verified) Envoy-based gateway, renamed from Envoy AI Gateway, still uses `aigateway.envoyproxy.io` CRDs and the `aigw` CLI. ([repo][ar-repo]) Pitfall: name suggests agent routing; it is a model/MCP gateway. [I]
- **Goose.** [F] Canonical repo `aaif-goose/goose` (the `block/goose` URL redirects); v1.57.0. ([repo][goose-repo]) Candidate second host for interoperability tests (README rule 3) since it already speaks MCP and ACP [U: ACP support not checked in this pass].
- **OpenEnv.** [F] `openenv/OpenEnv` (redirect from `huggingface/OpenEnv`), BSD-3-Clause, v0.12.0; containerized environments exposing MCP and Gym. ([repo][openenv-repo], [AAIF announcement][aaif-news]) Useful later for evaluation, not for HCS 0.1. [I]

### Client/agent

- **ACP.** [F] Org `agentclientprotocol`; current stable wire protocol version 1, negotiated via `protocolVersion` in `initialize`; crate/schema versions are artifact versions only; `schema/v1`, `schema/v2`, plus `*.unstable.json`; v2 is alpha (`schema-v2.0.0-alpha.13`). ([README][acp-readme], [releases][acp-rel]) Governance page lists Zed Industries and JetBrains. [F] ([governance][acp-gov]) Pitfall: name clash with IBM's "Agent Communication Protocol", which merged into A2A (pre-verified). Pin the wire version, not the schema release. [F] ([README][acp-readme])

### Identity and policy

- **OAuth 2.0 / RFC 9700.** [F] (pre-verified) RFC 9700 = BCP 240 (January 2025): PKCE required for public clients, resource owner password grant MUST NOT be used. OAuth 2.1 is still an Internet-Draft (`draft-ietf-oauth-v2-1-17`, 2026-10-31). ([RFC 9700][rfc9700], [OAuth 2.1 draft][oauth21]) MCP 2026-07-28 tightened its OAuth profile (RFC 9207 `iss` validation, issuer-bound client credentials). [F] ([changelog][mcp-changelog])
- **OpenID Connect.** [F] (pre-verified) Core 1.0 with errata set 2 (2023-12-15), published as ISO/IEC 26131:2024; OpenID Certification uses a self-certification suite. ([OIDC specs][oidc]) Out of HCS: user authentication belongs to the distribution. [I]
- **JWT.** RFC 7519 (May 2015). [F] ([RFC 7519][rfc7519]) Out of core. [I]
- **OPA / Rego.** [F] CNCF Graduated; v1.22.2. ([landscape][cncf-landscape], [releases][opa-rel]) Pitfall [I]: OPA returns decisions; the host is the enforcement point (the Notion page says this correctly).
- **SPIFFE / SPIRE.** [F] CNCF Graduated; SPIRE v1.16.0; workload identity, not users. ([landscape][cncf-landscape], [releases][spire-rel]) Out for a single-user desktop distribution. [I]

### Supply chain and distribution

- **OCI.** [F] Versions above; distribution-spec v1.1 added the referrers API and ships a runnable conformance program. ([image-spec][oci-image], [distribution-spec][oci-dist]) Pitfall [I]: OCI gives content addressing and transport, not freshness or rollback protection.
- **Sigstore.** [F] (pre-verified) OpenSSF Graduated; cosign v3.1.4, Fulcio v1.9.1; Rekor v2 GA in October 2025 (repo `sigstore/rekor` v1.5.5 is the v1 line); bundle format v0.3 in `protobuf-specs`. ([cosign][cosign-rel], [Rekor][rekor-rel], [protobuf-specs][sigstore-pb]) Pitfall: verification must check both certificate identity and OIDC issuer. [F] (pre-verified)
- **SPDX.** [F] 3.0.1 (2024-12-17), 3.1 at release-candidate stage; ISO/IEC 5962:2021 corresponds to SPDX 2.2.1, not 3.x. ([spdx-spec releases][spdx-rel]) Discrepancy: the Notion page links SPDX as "LF / ISO standard, SPDX 3.x" without noting that the ISO edition is 2.2.1.
- **SLSA.** [F] (pre-verified) v1.2 (November 2025) adds a Source track; levels are self-attested. ([SLSA 1.2][slsa])
- **TUF.** [F] Spec v1.0.37 (2026-10-08); CNCF Graduated. ([releases][tuf-rel], [landscape][cncf-landscape]) It is the only standard here that defines rollback, freeze and mix-and-match protection for update metadata. [I] (based on the TUF spec's threat list, see [spec][tuf-spec])
- **Uptane.** [F] (pre-verified) Standard 2.1.0 (2023-06-23), Joint Development Foundation; TUF-derived for vehicles. ([releases][uptane-rel]) Relevant only as a pattern for multi-repository (director + image repo) trust in a fleet distribution. [I]
- **Google Omaha.** [F] (pre-verified) The `google/omaha` v3 repo was archived on 2025-08-04; Chromium's updater documents a v4 JSON protocol with CUP request signing. ([omaha][omaha], [protocol_4.md][omaha4]) Relevant only as a desktop-updater reference for the HagaHarness distribution, not for HCS. [I]

### Telemetry and events

- **OpenTelemetry.** [F] Graduated; spec v1.62.0; semconv v1.45.0; GenAI conventions moved to `semantic-conventions-genai` (created 2026-05-05), status Development, no release yet. ([landscape][cncf-landscape], [semconv][otel-semconv], [genai][otel-genai]) Pitfall [I]: pin a semconv commit for GenAI attributes; they can still change without deprecation.
- **CloudEvents.** [F] v1.0.2 (2022-02-05), Graduated, no conformance suite. ([release notes][ce-release], [v2 list][ce-v2])

### Execution ABI

- **WebAssembly Component Model / WIT / WASI.** [F] WASI v0.3.2 (2026-10-13) is "the current preview"; WASI 0.2 defined APIs in WIT. Component Model work happens in the W3C WebAssembly Community Group. ([WASI README][wasi], [component-model README][wcm]) Pitfall [I]: a CG specification, not a W3C Recommendation; isolation guarantees depend on the runtime (the Notion page says this).

### Spec-language and contract standards

- **OpenFeature.** [F] See [how-standards-are-built.md](how-standards-are-built.md#14-openfeature). Not a dependency; it is the process model.
- **JSON Schema 2020-12.** [F] Latest published dialect; project decoupled from IETF and works on a stable release. ([2020-12][js-2020], [ADRs][js-adr]) Host organisation and spec license not re-verified in this pass. [U]
- **RFC 9457.** [F] Obsoletes RFC 7807. ([RFC 9457][rfc9457]) Use only when an HCS error crosses HTTP. [I]
- **BCP 14.** [F] RFC 2119 + RFC 8174, uppercase only. ([RFC 8174][rfc8174])

### Precedents

- **Cordis / DeepSeek Harness.** [F] "Everything is a Plugin"; plugins declare `inject` dependencies on context services, register reversible effects (`ctx.effect()`), and use typed events with explicit dispatch modes (`emit`, `waterfall`, `parallel`, `serial`, `bail`). ([cordis-primer][cordis], [repo][dsh-repo]) Overlap with HCS lifecycle and dependency resolution is high; HCS must justify itself as a language-neutral, data-first version of these ideas. [I]
- **OpenClaw.** [F] Native manifest `openclaw.plugin.json`; four layers (manifest + discovery, enablement + validation, runtime loading, surface consumption); manifest/config validation must work without executing plugin code; capability registration (`api.registerProvider(...)` and others) is the intended direction while hook-only plugins remain supported. ([plugin architecture][openclaw-arch]) Overlap: discovery without execution, exclusive slots, capability registry. [I]

## 3. Discrepancies with the Notion page "02"

1. **Goose repository.** Notion links `aaif-goose/goose`, which is the canonical repo; aaif.io still links `block/goose` (redirects). Notion is right here. [F] ([aaif.io][aaif-projects], [repo][goose-repo])
2. **Agent Router.** Notion describes it as "Envoy gateway for models and MCP tools" but does not say it is the renamed Envoy AI Gateway. [F] (pre-verified)
3. **OpenEnv.** Repo moved to `openenv/OpenEnv`; Notion only links the announcement. [F]
4. **AAIF stages.** Notion lists the ten projects but not their lifecycle stages (Impact / Growth / Sandbox), which matter: OpenSandbox is Sandbox stage. [F] (pre-verified)
5. **MCP 2026-07-28.** Notion's MCP section does not reflect the stateless revision (no handshake, no sessions, `server/discover`, MRTR). [F]
6. **ACP v2.** Notion says "v2 announced as draft"; the repo publishes `schema-v2.0.0-alpha.13` and states the stable wire version is 1. Consistent, but the precise state is alpha schema artifacts. [F]
7. **OpenTelemetry maturity.** Notion lists OTel as CNCF without stage; landscape data shows Graduated. Notion correctly says GenAI conventions moved repos. [F]
8. **SPDX ISO edition.** See SPDX note. [F]
9. **Open Responses version.** Notion links the unversioned spec URL; the spec is date-versioned (latest 2026-04-24). [F]
10. **AAIF proposal process.** Notion links `aaif/project-proposals`; authoritative policy lives in `aaif/technical-committee`. [F]

## 4. Not verified in this pass

- JSON Schema organisation host and spec license. [U]
- Whether Goose currently implements ACP and the 2026-07-28 MCP revision. [U]
- W3C CG license terms for the Component Model. [U]
- Any official LSP conformance suite. [U]

[mcp-repo]: https://github.com/modelcontextprotocol/modelcontextprotocol
[mcp-releases]: https://github.com/modelcontextprotocol/modelcontextprotocol/releases
[mcp-changelog]: https://modelcontextprotocol.io/specification/2026-07-28/changelog
[a2a-rel]: https://github.com/a2aproject/A2A/releases
[a2a-json]: https://github.com/a2aproject/A2A/blob/main/specification/json/README.md
[a2a-gov]: https://github.com/a2aproject/A2A/blob/main/GOVERNANCE.md
[skills-spec]: https://agentskills.io/specification
[skills-ref]: https://github.com/agentskills/agentskills/tree/main/skills-ref
[agentsmd]: https://github.com/agentsmd/agents.md
[or-changelog]: https://github.com/openresponses/openresponses/blob/main/CHANGELOG.md
[or-compliance]: https://www.openresponses.org/compliance
[osb-repo]: https://github.com/opensandbox-group/OpenSandbox
[aaif-news]: https://aaif.io/news/agentic-ai-foundation-announces-four-new-projects
[aaif-projects]: https://aaif.io/projects
[agw-rel]: https://github.com/agentgateway/agentgateway/releases
[ar-repo]: https://github.com/theagentrouter/agent-router
[goose-repo]: https://github.com/aaif-goose/goose
[openenv-repo]: https://github.com/openenv/OpenEnv
[acp-readme]: https://github.com/agentclientprotocol/agent-client-protocol/blob/main/README.md
[acp-rel]: https://github.com/agentclientprotocol/agent-client-protocol/releases
[acp-gov]: https://agentclientprotocol.com/community/governance
[rfc9700]: https://www.rfc-editor.org/rfc/rfc9700
[oauth21]: https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/
[oidc]: https://openid.net/specs/openid-connect-core-1_0.html
[rfc7519]: https://www.rfc-editor.org/rfc/rfc7519
[opa-rel]: https://github.com/open-policy-agent/opa/releases
[spire-rel]: https://github.com/spiffe/spire/releases
[cncf-landscape]: https://github.com/cncf/landscape/blob/master/landscape.yml
[oci-image]: https://github.com/opencontainers/image-spec
[oci-dist]: https://github.com/opencontainers/distribution-spec
[cosign-rel]: https://github.com/sigstore/cosign/releases
[rekor-rel]: https://github.com/sigstore/rekor/releases
[sigstore-pb]: https://github.com/sigstore/protobuf-specs
[spdx-rel]: https://github.com/spdx/spdx-spec/releases
[slsa]: https://slsa.dev/spec/v1.2/
[tuf-rel]: https://github.com/theupdateframework/specification/releases
[tuf-spec]: https://theupdateframework.github.io/specification/latest/
[uptane-rel]: https://github.com/uptane/uptane-standard/releases
[omaha]: https://github.com/google/omaha
[omaha4]: https://chromium.googlesource.com/chromium/src/+/main/docs/updater/protocol_4.md
[otel-semconv]: https://github.com/open-telemetry/semantic-conventions/releases
[otel-genai]: https://github.com/open-telemetry/semantic-conventions-genai
[ce-release]: https://github.com/cloudevents/spec/blob/main/cloudevents/RELEASE_NOTES.md
[ce-v2]: https://github.com/cloudevents/spec/blob/main/cloudevents/v2.md
[wasi]: https://github.com/WebAssembly/WASI
[wcm]: https://github.com/WebAssembly/component-model
[js-2020]: https://json-schema.org/draft/2020-12
[js-adr]: https://github.com/json-schema-org/json-schema-spec/tree/main/adr
[rfc9457]: https://www.rfc-editor.org/rfc/rfc9457
[rfc8174]: https://www.rfc-editor.org/rfc/rfc8174
[cordis]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md
[dsh-repo]: https://github.com/deepseek-ai/deepseek-harness
[openclaw-arch]: https://docs.openclaw.ai/plugins/architecture
[openclaw-rel]: https://github.com/openclaw/openclaw/releases
