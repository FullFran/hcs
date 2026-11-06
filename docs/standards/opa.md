# Open Policy Agent (OPA) / Rego

| Field | Value |
| --- | --- |
| Owner | CNCF (Graduated project) |
| Version pinned | OPA v1.22.2 (GitHub release 2026-11-06); Rego v1 syntax (`rego_version: 1`) |
| Source pinned | open-policy-agent/opa@v1.22.2 (commit 482d9e368c2ddfed67ced59259fa6a247bb5f1e5): `docs/docs/rest-api.md`, `docs/docs/management-bundles/index.md`, `docs/docs/philosophy/index.md` |
| Access date | 2026-11-06 |
| License | Apache-2.0 |
| Maturity | CNCF Graduated (per catalog, pre-verified); implementation plus language, no separate standards body |
| HCS action | adapter (optional PDP behind HCS-0005 authority); not required by any profile |

## What it defines

A general-purpose policy engine. Services ("policy enforcement points", PEP) send a query with
structured input; OPA (the "policy decision point", PDP) evaluates Rego policies against input
plus loaded data and returns a decision document. OPA decides; it does not enforce.

## Key objects and fields

- Data API: `POST /v1/data/{path}` with JSON body `{"input": ...}`; response `{"result": ...}`.
  `GET /v1/data/{path}` exists for queries without input.
- Undefined decision: HTTP 200 with the `result` key omitted (not an error, not `false`).
- Optional response fields: `decision_id` (when decision logging is on), `metrics`,
  `provenance`; query parameters `pretty`, `provenance`, `explain`, `metrics`, `instrument`,
  `strict-builtin-errors`, `rule_labels`.
- Extra top-level request keys beyond `input` are request metadata (logged under
  `custom.request_metadata`).
- Status codes: 200, 400 (malformed input), 500. Error bodies carry `code`/`message`
  (e.g. `invalid_parameter`).
- Bundles: gzipped tarball with `.manifest` (`revision`, `roots`, `rego_version`,
  `file_rego_versions`, `wasm`, `metadata`), `data.json` files, `.rego` files, optional
  `policy.wasm`, optional `.signatures.json` for signed bundles.
- Decision logs: events per decision keyed by `decision_id`.

## Extension points

- Custom built-ins (Go embedding) and request/response metadata; OPA docs warn to namespace
  custom top-level keys because future versions may add keys.
- Bundle manifest `metadata` (free-form object).
- Plugins (Go) for discovery, status, decision log sinks.

## Where HCS references it instead of redefining

- HCS-0005 authority: the host is always the enforcement point; a host MAY delegate the grant
  decision to a PDP. HCS defines the decision input shape (subject, plugin, capability,
  operation, scope) and the effect `allow | deny`; an OPA adapter maps it to `input` and reads
  `result`. HCS MUST NOT restate the OPA REST API or Rego. [I]
- HCS-0006 errors: an undefined OPA result or PDP unavailability MUST map to deny
  (`permission_denied`), never to allow. [I]
- DISTRO-1: policy bundles, if shipped, are opaque content in an HCS-0001 entry; their
  signing stays OPA's `.signatures.json`. [I]

## Pitfalls for HCS

- Undefined vs `false`: a missing `result` is a 200; adapters must treat it as deny.
- Fail-closed is the PEP's job; OPA network errors must not become implicit allows.
- Rego v0 vs v1 syntax: bundles pin `rego_version`; v1 is the default since OPA 1.0 [U].
- Decision logs can capture full `input`; masking is a deployment concern for distributions.

## Sources

- https://github.com/open-policy-agent/opa/releases/tag/v1.22.2
- https://github.com/open-policy-agent/opa/blob/v1.22.2/docs/docs/rest-api.md
- https://github.com/open-policy-agent/opa/blob/v1.22.2/docs/docs/management-bundles/index.md
- https://github.com/open-policy-agent/opa/blob/v1.22.2/docs/docs/philosophy/index.md
- https://www.openpolicyagent.org/docs/rest-api
