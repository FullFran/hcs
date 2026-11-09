# ADR-0029: A hand-written reference SDK in TypeScript lives in `sdk/ts`

**Status:** Accepted (2026-11-09)

## Context

Rule 2 of the README says language SDKs are generated from the schemas, and the planned layout reserved `sdk/ts/` for generated types and host interfaces. Three harnesses now implement HCS by hand, each covering only what its product needed:

- RE;write: catalog validation, package archives, capability ids, HCS-0003 resolution, lifecycle and generations, authority (91 pass, 0 fail, 0 divergences on v0.1.0-draft.3).
- A company harness: signed catalogs (HCS-0007), projection into OpenCode, Pi and Claude Code (HCS-0008), a host lock, a content-addressed store and a publish pipeline, with divergences from HCS.
- metaharness (in progress): composes coding-agent configuration from catalog packages and needs all of the above.

Each new harness re-implements the same algorithms, and packages are not interchangeable between harnesses that diverge differently. Generated types alone do not fix that: the shared part is behaviour (resolution, generations, signature verification, projection), not only shapes.

## Decision

- `sdk/ts/` holds a TypeScript reference implementation of HCS, written by hand, plus types derived from `schemas/`.
- The schemas and the spec stay the source of truth. The SDK is a consumer: it is measured against `conformance/` like any harness, and a disagreement between the SDK and a schema is a bug in the SDK.
- Distribution-specific behaviour stays out of the SDK. Extension kinds, detail-key prefixes, permission sets and host profiles are parameters supplied by each harness (rule 4).
- Rule 5 still applies: code comes from public projects whose author contributes it under the Apache License 2.0, or is written from the spec. Behaviour that exists only in private projects is re-implemented from the spec and from a description in our own words, never copied.
- The SDK is versioned with the spec: a release of HCS releases the SDK built for that contract version.

## Consequences

- Harnesses that adopt the SDK get the same verdicts for the same inputs, so a package valid for one is valid for all of them, and differences live only in adapters and host profiles.
- The SDK becomes the place where gaps in the spec show up first; they are fixed in the spec (rule 1), not patched in the SDK.
- Alternatives rejected:
  - A separate repository: the SDK would drift from the spec and its conformance cases between releases.
  - Generated types only: every harness keeps its own resolver, generation store and signature verifier, which is the duplication this ADR removes.
  - Importing one harness's implementation directly: it couples other harnesses to that product's release cycle and namespace.
