# HCS-0006 Typed errors

| Field | Value |
| --- | --- |
| Status | Draft |
| Version | 0.1.0-draft |
| Requires | HCS-0000 |
| Replaces | none |
| Schema | `schemas/hcs-0006/error/v0.1/error.schema.json` (`urn:hcs:schema:hcs-0006:error:0.1`) |

## 1. Scope

A host that composes plugins fails in a small number of ways that callers need to tell apart without parsing text: a document is malformed, content does not match its digest, a dependency is missing or ambiguous, an operation is denied, a plugin fails. This document defines a closed set of error codes, the error object that carries them, and how the object travels over the two transports HCS adapters use: JSON-RPC 2.0 (MCP, ACP) and HTTP (RFC 9457). It does not define new transport error codes; it rides on the ones those standards already define ([ADR-0006](../docs/adr/0006-error-codes-ride-in-data.md)).

## 2. Error object

```json
{
  "code": "missing_dependency",
  "message": "dev.example.notes requires dev.example.search@1, which no entry provides",
  "entry": "dev.example.notes",
  "capability": "dev.example.search@1",
  "details": { "x-hagaharness-hint": "enable the search pack" }
}
```

- `code` (required): one value from section 3.
- `message` (required): human-readable text. Consumers branch on `code`, never on `message`.
- `entry` (optional): the catalog entry id the error is about (HCS-0001).
- `capability` (optional): the capability reference involved (HCS-0002).
- `requirement` (optional): the HCS requirement id that was violated, when the host knows it.
- `details` (optional): an object with extension members only (`x-<distribution>...`), for distribution-specific diagnostics.

**[HCS-0006-R001]** An error a host reports for an HCS-defined failure MUST validate against the HCS-0006 error schema.

**[HCS-0006-R002]** A host MUST NOT report a `code` outside the closed set in section 3; distribution-specific detail goes in `details` under extension members.

## 3. Codes

| Code | Raised when | Defined by |
| --- | --- | --- |
| `manifest_invalid` | a document fails its HCS schema | HCS-0001 |
| `unsupported_hcs_version` | `hcsVersion` names a contract the host does not implement | HCS-0001 |
| `duplicate_entry` | two catalog entries share an `id` | HCS-0001 |
| `integrity_mismatch` | fetched content does not match `size` or `contentHash` | HCS-0001 |
| `unsupported_contribution` | the host does not implement a contribution `kind` | HCS-0001 |
| `platform_incompatible` | no `compatibility.platforms` item matches the host platform | HCS-0001 |
| `missing_dependency` | no entry or host built-in provides a required capability id | HCS-0003 |
| `version_incompatible` | the capability id is provided, but not at the required contract major | HCS-0003 |
| `ambiguous_provider` | more than one provider matches and nothing selects one | HCS-0003 |
| `dependency_cycle` | activation order cannot be computed because requirements form a cycle | HCS-0003 |
| `permission_denied` | an operation needs a permission the host has not granted | HCS-0005 |
| `unsupported_capability` | a call targets a capability that is not active on this host | HCS-0004 |
| `timeout` | a lifecycle step or call exceeded the host's deadline | HCS-0004 |
| `plugin_failed` | plugin code failed during a lifecycle step or call | HCS-0004 |

## 4. Transport mappings

### 4.1 JSON-RPC 2.0 (MCP, ACP)

The numeric `error.code` is whatever the carrying protocol prescribes for the situation (for example `-32602` for invalid params, or an implementation-defined code in `-32000..-32099`). HCS does not allocate numeric codes, because MCP and ACP already use parts of the server-error range. See [docs/standards/json-rpc-2.md](../docs/standards/json-rpc-2.md).

**[HCS-0006-R003]** When an HCS error is carried in a JSON-RPC 2.0 error response, the HCS error object MUST be the value of `error.data.hcsError`.

### 4.2 HTTP (RFC 9457)

**[HCS-0006-R004]** When an HCS error is carried as an RFC 9457 problem details object, its `type` MUST be `urn:hcs:error:<code>`, where `<code>` equals `hcsError.code`.

**[HCS-0006-R005]** When an HCS error is carried as an RFC 9457 problem details object, the HCS error object MUST be the value of the extension member `hcsError`.

`title` SHOULD be the code; `detail` SHOULD be the `message`; `status` is chosen by the HTTP surface. See [docs/standards/rfc9457-problem-details.md](../docs/standards/rfc9457-problem-details.md).

## 5. Open questions

- OQ-0006-1: whether errors need a stable machine-readable `retryable` hint (`timeout` usually is, `integrity_mismatch` is not). No consumer needs it yet.
- OQ-0006-2: whether one failure may carry several errors (a resolution pass usually finds several). The reference runner returns a list; the wire shape for a list is not defined.
- OQ-0006-3: mapping to OpenTelemetry `error.type` (the GenAI conventions are Development status; see [docs/standards/opentelemetry-genai.md](../docs/standards/opentelemetry-genai.md)).
