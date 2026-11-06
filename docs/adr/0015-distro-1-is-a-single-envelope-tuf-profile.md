# ADR-0015: DISTRO-1 is a single-envelope profile of TUF properties

**Status:** Proposed (2026-11-06)

## Context

Issue #5 asks for DISTRO-1 built from the signed envelope the first host ships: a monotonic sequence, an expiry, a tenant, profile and channel binding, threshold Ed25519 signatures over canonical JSON with a distribution-specific context string, and an offline root key that signs a versioned set of online keys. TUF 1.0.37 already defines most of these properties with four metadata roles ([tuf.md](../standards/tuf.md)). [lf-fit-distro-1-and-core-0.md](../research/lf-fit-distro-1-and-core-0.md) section 3 compares them.

## Decision

- HCS-0007 keeps the shipped architecture: one signed envelope around the catalog, one root-signed key set, the verification order and its error codes.
- It changes what a neutral standard cannot carry: the signature input is the DSSE v1 PAE with two HCS payload types instead of a private context string; the audience is a `binding` map compared for exact equality instead of three fixed members; the envelope threshold lives in the signed key set; numbers are restricted to safe integers so RFC 8785 needs no floating-point formatting.
- Thresholds count distinct public keys, not keyids. Key validity windows are `notBefore` inclusive and `notAfter` exclusive. An envelope equal in content to the last accepted one is accepted again.
- HCS-0007 does not claim TUF conformance and records the replacement question (OQ-0007-1).
- DISTRO-1 is a separate profile (`conformance/profiles/distro-1.json`) that builds on CORE-0 and requires `all-or-nothing` activation.
- The reference runner verifies real signatures. Ed25519 (RFC 8032), RFC 8785 and PAE are implemented in `conformance/runner/distro1.py` without new dependencies, checked against RFC 8032 test vector 1 and, during development, against the `cryptography` package. Cases are generated from public-seed fixture keys by `conformance/runner/gen_distro1_cases.py`.

## Consequences

- The first host must change its signature input and binding shape to conform; its keys, rotation model and verification order carry over.
- Document-level DISTRO-1 behaviour (shape, canonical bytes, signatures, thresholds, expiry, sequence, binding, key rotation) is executable today: 50 generated cases. Generations, health checks and persisted state are `host` cases, `pending` until a host adapter exists.
- The runner's Ed25519 is for verifying test fixtures. It is not constant-time and must not be used to sign anything real.
- Alternatives rejected: a full DSSE envelope with the catalog as base64 payload (no canonicalisation needed, but no implementation ships it and every catalog becomes opaque to readers; kept as an option under OQ-0007-1); requiring TUF itself (four roles for one document, and the first host would have to be rewritten); keeping the shipped context string (names one distribution).
