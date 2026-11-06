# ADR-0011: The core package format is an OCI layer, and `mediaType` is required

**Status:** Proposed (2026-11-06)

## Context

HCS-0001 left `mediaType` optional and named no archive format (OQ-0001-1), so two hosts could accept the same catalog and still fail to unpack each other's packages. HagaHarness, the first consumer, requires `mediaType` on every entry and accepts two types: its own vendor type for a gzip-compressed tar and the OCI layer type `application/vnd.oci.image.layer.v1.tar+gzip`. It reported an unknown type as `unsupported_capability`. It builds archives deterministically so that the digest changes only when the content does. OCI descriptors already require `mediaType` next to `digest` and `size` ([oci.md](../standards/oci.md)).

## Decision

- `mediaType` is required on every entry (HCS-0001-R011), as in an OCI descriptor.
- Every host implements `application/vnd.oci.image.layer.v1.tar+gzip`, applied to an empty directory that becomes the package root (R012). HCS mints no package media type of its own.
- Further types are vendor types a distribution defines. An entry in a type the host does not implement fails with `unsupported_contribution` (R013), not `unsupported_capability`, which HCS-0004 reserves for calls to inactive capabilities. Resolution receives the host's types as `host.mediaTypes` and checks them before contribution kinds.
- Deterministic archives are a producer SHOULD (R014). Document size and depth limits are a host SHOULD with a published floor of 4 MiB and 64 levels (R015).

## Consequences

- A catalog that uses only the core type can be consumed by any conforming host, and the same bytes can be stored in an OCI registry as a layer without conversion.
- Every existing case gained `mediaType` and `host.mediaTypes`; the draft schema is not backward compatible with catalogs that omit it. Acceptable while every document is Draft.
- OCI layers carry whiteout and link semantics meant for layer stacking. Which archive members a host refuses when unpacking a package is left open (OQ-0001-6) rather than guessed.
- Alternatives rejected: an HCS-specific media type (invention without a benefit over the OCI type); leaving the format to each distribution (no interoperability, which is the reason HCS exists); a new error code for unknown media types (same remedy as an unknown contribution kind, so the same code).
