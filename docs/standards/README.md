# External standards HCS depends on

**Status:** reference notes, not normative. Access date for every file: 2026-11-06.
Each file pins a version and a source (tag or commit), summarizes the normative parts HCS touches, and says where HCS must reference the standard instead of redefining it. Claims that could not be checked against the primary source are marked [U]; inferences are marked [I]. Nothing here copies spec text beyond identifiers and field names.

Template per file: header table (owner, version pinned, source pinned, access date, license, maturity, HCS action), then *What it defines*, *Key objects and fields*, *Extension points*, *Where HCS references it instead of redefining*, *Pitfalls for HCS*, *Sources*.

## Index

| Area | Files | Bound normatively by HCS 0.1 drafts |
| --- | --- | --- |
| Spec language and contracts | [bcp14](bcp14.md), [json-schema-2020-12](json-schema-2020-12.md), [json-rpc-2](json-rpc-2.md), [rfc9457-problem-details](rfc9457-problem-details.md), [semver](semver.md), [openfeature](openfeature.md) (process model only) | BCP 14, JSON Schema 2020-12, JSON-RPC 2.0 and RFC 9457 (HCS-0006 mappings) |
| Agent protocols and contributions | [mcp](mcp.md), [acp](acp.md), [a2a](a2a.md), [open-responses](open-responses.md), [agent-skills](agent-skills.md), [agents-md](agents-md.md) | Agent Skills (HCS-0001 kind `skill`); MCP by name only (kind `mcp-server`, details in TOOLS-1) |
| Telemetry and events | [opentelemetry-genai](opentelemetry-genai.md), [cloudevents](cloudevents.md) | none (SHOULD only, HCS-0004) |
| Supply chain and distribution | [oci](oci.md), [tuf](tuf.md), [in-toto](in-toto.md), [slsa](slsa.md), [sigstore](sigstore.md), [spdx](spdx.md), [uptane](uptane.md) | OCI digest grammar and platform object (HCS-0001); the rest is DISTRO-1 |
| Execution and isolation | [wasi-component-model](wasi-component-model.md), [opensandbox](opensandbox.md) | none (ISOLATION-1) |
| Identity and policy | [oauth2](oauth2.md), [openid-connect](openid-connect.md), [jwt](jwt.md), [spiffe](spiffe.md), [opa](opa.md) | none (HCS-0005 cites OPA and OAuth as non-goals) |
| Implementations, not standards | [implementations-out-of-scope](implementations-out-of-scope.md) (agentgateway, Agent Router, Goose, OpenEnv, Google Omaha) | none |

## Corrections to docs/research/standards-catalog.md found in this pass

1. JSON Schema: the project is an OpenJS Foundation member and the spec is dual-licensed BSD-3-Clause / AFL-3.0; the catalog's [U] marks can close ([json-schema-2020-12](json-schema-2020-12.md)).
2. JSON Schema 2020-12 meta-schema enables `format-annotation`, not `format-assertion`: `format` never rejects by default. HCS schemas therefore use `pattern`, not `format`.
3. Uptane 2.1.0 is Apache-2.0, not CSL 1.0 ([uptane](uptane.md)).
4. Rekor v2 ships from `sigstore/rekor-tiles` (v2.4.1); `sigstore/rekor` stays on v1.x ([sigstore](sigstore.md)).
5. in-toto had no row: Attestation Framework v1.2.0, spec text in `in-toto/docs` ([in-toto](in-toto.md)).
6. WASI contributions fall under the W3C Community CLA; the component-model repo is Apache-2.0 ([wasi-component-model](wasi-component-model.md)).
7. Goose v1.57.0 depends on `agent-client-protocol` 2.2.0 and `rmcp` 3.4.1 (declared dependencies, runtime behaviour not tested): a candidate second host ([implementations-out-of-scope](implementations-out-of-scope.md)).
8. RFC 6749, 7519, 8707 and 9207 are Proposed Standards, not Internet Standards ([oauth2](oauth2.md)).
9. MCP 2026-07-28 adds JSON-RPC codes `-32020..-32022`; ACP uses `-32000`, `-32002`, `-32800`; A2A uses `-32001..-32009`. HCS therefore allocates no numeric codes ([ADR-0006](../adr/0006-error-codes-ride-in-data.md)).
10. OpenTelemetry GenAI's MCP conventions (at the pinned commit) still describe MCP 2025-11-25 (`initialize`, `mcp.session.id`) ([opentelemetry-genai](opentelemetry-genai.md)).
11. The CloudEvents tag `ce@v1.0.2` was moved to a 2025 commit; pin by SHA ([cloudevents](cloudevents.md)).
12. Agent Skills `skills-ref` rejects frontmatter keys outside its six fields, so HCS metadata cannot live in `SKILL.md` ([agent-skills](agent-skills.md)).
