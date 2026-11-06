# ADR-0012: Host compatibility is a core member with exact version lists

**Status:** Proposed (2026-11-06)

## Context

OQ-0001-3 asked how an entry says which host or harness versions it runs on. HagaHarness, the first consumer, does it with an extension member that lists exact runtime versions, without ranges because versions are opaque, and reports a mismatch as `version_incompatible`. A list of host ids and versions is not specific to one distribution; only the values are.

## Decision

- `compatibility.hosts` is a core member: items of `{ id, versions }`, where `id` is a dotted id naming a host implementation and `versions` is a non-empty list of opaque version strings (HCS-0001 section 3.3).
- An item matches when `id` equals the host's id and `versions` contains the host's version as an equal string. No ranges, prefixes or ordering ([ADR-0004](0004-opaque-package-versions.md)).
- A mismatch fails the entry with `version_incompatible` and no `capability` member (HCS-0001-R016). Resolution receives `host.id` and `host.version`; a host that states neither matches no list.
- Eligibility order: media type and contribution kinds, then platforms, then hosts; only the first failure is reported.

## Consequences

- The host's extension member moves into the core with the same semantics, so the first host changes a member name, not its logic.
- Catalog producers must list every supported host version. That is verbose for long-lived packages; ranges stay open until HCS defines a version ordering (remaining part of OQ-0001-3).
- Alternatives rejected: keeping it as an `x-` member (every harness has versions, so it is not distribution detail); reusing `platform_incompatible` (that code means the OCI platform object); a new error code (the host's existing `version_incompatible` already reads correctly, and the absent `capability` member tells the two uses apart).
