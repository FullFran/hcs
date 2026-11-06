# RFC 9457 Problem Details for HTTP APIs

| Field | Value |
| --- | --- |
| Owner | IETF (authors M. Nottingham, E. Wilde, S. Dalal) |
| Version pinned | RFC 9457, July 2023; obsoletes RFC 7807 |
| Source pinned | https://www.rfc-editor.org/rfc/rfc9457 (immutable RFC, July 2023) |
| Access date | 2026-11-06 |
| License | IETF Trust legal provisions for RFCs [U: TLP version not checked in this pass] |
| Maturity | Proposed Standard (Standards Track) |
| HCS action | adopt for HTTP mapping only (HCS-0006 errors, HTTP binding section; relevant to DISTRO-1 and any HTTP host API) |

## What it defines

A JSON (and XML) object that carries machine-readable details of an error in an HTTP response
body, so APIs do not invent their own error envelope. It also creates an IANA "HTTP Problem
Types" registry.

## Key objects and fields

- `type` (string, URI reference): primary identifier of the problem type; defaults to
  `about:blank`; absolute URIs recommended; consumers should not auto-dereference it.
- `status` (number): HTTP status code for this occurrence; advisory only, it must match the
  actual response status.
- `title` (string): short human summary of the type; stable across occurrences except for
  localisation.
- `detail` (string): human explanation of this occurrence; consumers should not parse it.
- `instance` (string, URI reference): identifies this occurrence.
- A member whose value has the wrong type is ignored.
- Media types: `application/problem+json`, `application/problem+xml` (XML namespace
  `urn:ietf:rfc:7807`).
- `about:blank`: the only registered problem type; means "no semantics beyond the status code";
  its `title` should be the HTTP reason phrase.

## Extension points

- Problem types may define extension members at the top level of the object.
- Clients MUST ignore extension members they do not recognise.
- Extension member names should start with a letter, use only letters, digits and `_`, and be
  at least three characters long (so they also work in XML).
- New common problem types can be registered (Specification Required); vendor-, application-
  or deployment-specific types cannot be registered and just use their own URIs.

## Where HCS references it instead of redefining

- HCS-0006 defines the closed HCS error code set (`missing_dependency`, `version_incompatible`,
  `permission_denied`, `timeout`, `plugin_failed`, `unsupported_capability`). When an HCS error
  crosses HTTP, it is serialised as `application/problem+json`; HCS MUST NOT define a separate
  HTTP error envelope.
- HCS-0006 maps each HCS code to one `type` URI under an HCS-owned base (for example
  `https://<hcs-base>/errors/permission_denied`) and a recommended `status`; the HCS code itself
  can also appear as an extension member (for example `code`) for clients that do not parse URIs.
- HCS-specific context (capability ID, plugin id, requested vs granted authority from HCS-0005)
  goes into extension members, not into `detail`.
- Non-HTTP transports (JSON-RPC in MCP/ACP) use `json-rpc-2.md` instead; HCS-0006 keeps one
  error model with two bindings, not two models.

## Pitfalls for HCS

- `status` in the body can disagree with the real HTTP status after intermediaries; tests must
  check the HTTP status, not only the body.
- Do not put secrets, stack traces, local paths or grant details that reveal policy into
  `detail` or extensions (RFC 9457 security considerations).
- `type` is an identifier, not a link to fetch; do not require it to resolve.
- Extension names like `id` (two letters) or `x-foo` (hyphen) violate the naming
  recommendation; choose names such as `hcs_code` or `capability`.
- RFC 7807 references in older material are obsolete; cite RFC 9457.

## Sources

- https://www.rfc-editor.org/rfc/rfc9457
