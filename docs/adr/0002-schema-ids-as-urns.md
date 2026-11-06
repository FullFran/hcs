# ADR-0002: Schema `$id` values are URNs until HCS controls a domain

**Status:** Proposed (2026-11-06)

## Context

JSON Schema 2020-12 needs an absolute URI for `$id`, and cross-schema `$ref` resolves against it ([docs/standards/json-schema-2020-12.md](../standards/json-schema-2020-12.md)). The research recommends a URL the project controls, with the version in the path. HCS has no domain, and publishing schemas under a URL someone else may own later would break consumers that pin `$id` (README rule 5).

## Decision

Use `urn:hcs:schema:<document>:<name>:<MAJOR.MINOR>` for every schema `$id`, and `urn:hcs:error:<code>` for RFC 9457 `type` values. Validators load schemas from the repository into a registry; nothing is fetched over the network.

## Consequences

- No accidental network fetches and no domain dependency.
- Some validators handle relative `$ref` under `urn:` bases badly: python-jsonschema 4.10 (Debian package) failed to resolve `#/$defs/...` inside a referenced URN schema; 4.26 with `referencing` and Ajv 8.17 work. The runner requires python-jsonschema >= 4.18.
- Moving to HTTPS later is a breaking change for anyone who pinned the URN. OQ-0000-2 tracks it; a 0.x release is the moment to do it.
