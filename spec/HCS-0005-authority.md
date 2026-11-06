# HCS-0005 Authority: requests and grants

| Field | Value |
| --- | --- |
| Status | Draft |
| Version | 0.1.0-draft |
| Requires | HCS-0001, HCS-0006 |
| Replaces | none |
| Schema | `schemas/hcs-0005/authority/v0.1/authority.schema.json` (`urn:hcs:schema:hcs-0005:authority:0.1`) |

## 1. Scope

Packages ask for authority; the host decides. This document defines the shape of a permission request, the shape of a host grant, and the enforcement rules every host needs. It does not define a permission vocabulary, a policy language or trust tiers: those are distribution decisions (README rule 4) and go under `x-<distribution>` members or in the host's policy engine.

What existing standards cover and what they do not:

- OAuth 2.0 scopes authorize a client against a resource server, not a plugin inside a host ([docs/standards/oauth2.md](../docs/standards/oauth2.md)).
- OPA returns decisions; it is a policy decision point, and the host stays the enforcement point ([docs/standards/opa.md](../docs/standards/opa.md)). A host MAY delegate the decision to OPA; the rules below still apply to enforcement.
- Agent Skills `allowed-tools` is experimental and advisory ([docs/standards/agent-skills.md](../docs/standards/agent-skills.md)).

## 2. Objects

- **Permission id:** a dotted id (HCS-0000 common `dottedId`), for example `dev.example.fs.read`. HCS 0.1 defines no permission ids (OQ-0005-1).
- **Request** (`permissionRequest`): `{ "permission": <permission id>, "reason": <string, optional> }`, listed in an entry's `requests` array in an HCS-0005 request document, or in the catalog manifest under a future version (OQ-0005-3).
- **Grant** (`grant`): `{ "entry": <package id>, "permission": <permission id> }`, a record held by the host. Scoping a grant to a project, session or operation is OQ-0005-2.
- **Check** (`check`): `{ "entry": <package id>, "permission": <permission id> }`, the question the host asks before an operation.
- **Decision** (`decision`): `{ "allow": true }` or `{ "allow": false, "error": <HCS-0006 error with code permission_denied> }`.

## 3. Requirements

**[HCS-0005-R001]** A host MUST deny an operation that needs a permission unless it holds a grant for that entry and that permission, and MUST report the denial with code `permission_denied`.

**[HCS-0005-R002]** A host MUST NOT treat a permission request, or any contribution metadata such as Agent Skills `allowed-tools`, as a grant.

**[HCS-0005-R003]** A host MUST evaluate grants when each operation is dispatched, so that a revoked grant denies every operation dispatched after the revocation.

**[HCS-0005-R004]** A host MUST NOT let an extension member on a request turn the request into a grant.

R001 and R002 are checked by the reference evaluator in the runner (`authority` cases). R003 needs a running host and has `host` cases only.

## 4. Open questions

- OQ-0005-1: a minimal shared permission vocabulary (filesystem, network, process, secrets). Every harness needs one; defining it before a second consumer exists risks encoding HagaHarness choices.
- OQ-0005-2: grant scope dimensions (subject, project, session, operation) named in the composition map.
- OQ-0005-3: whether requests live in the catalog manifest entry or in a document inside the package. A catalog-side list lets the host decide before fetching; a package-side list travels with the code.
- OQ-0005-4: whether a grant survives a package version change. The current rule (grants keyed by entry id) means it does; a host can still re-ask through policy.
- OQ-0005-5: mapping a grant to OAuth tokens when the operation calls a remote MCP server (TOOLS-1).
