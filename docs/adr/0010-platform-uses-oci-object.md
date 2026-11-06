# ADR-0010: Platform compatibility reuses the OCI platform object

**Status:** Proposed (2026-11-06)

## Context

`compatibility` is one of the README fields. The concrete need today is platform: an MCP server binary differs per OS and architecture. OCI image indexes already define `platform` with `os`, `architecture`, `variant` and Go-style values ([oci.md](../standards/oci.md)).

## Decision

`compatibility.platforms` is a list of OCI platform objects (subset: `os`, `architecture`, optional `variant`). Absent means any platform. Matching is equality, with `variant` checked only when the item has one.

## Consequences

- No new platform vocabulary. Values follow OCI/Go conventions (`linux`, `amd64`, `arm64`).
- Multi-platform entries (one id, several digests) are not supported in 0.1; distributions use separate entries or catalogs per platform (OQ-0001-2).
- `os.version` and `os.features` from OCI are not adopted; add them if a host needs them.
