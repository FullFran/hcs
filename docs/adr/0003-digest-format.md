# ADR-0003: `contentHash` uses the OCI digest grammar, sha256 or sha512 only

**Status:** Proposed (2026-11-06)

## Context

HCS-0001 needs one content digest per entry. The standards that already do this disagree on shape ([docs/standards/oci.md](../standards/oci.md), [tuf.md](../standards/tuf.md), [in-toto.md](../standards/in-toto.md), [sigstore.md](../standards/sigstore.md)):

- OCI: one string `algorithm:encoded`; registered `sha256` and `sha512`, lowercase hex; unregistered but grammatical digests SHOULD pass validation.
- TUF: object `hashes: {"sha256": "<hex>"}` next to `length`.
- in-toto DigestSet: object keyed by NIST-style names, consumers ignore unknown keys.
- Sigstore JSON: enum algorithm name plus base64 bytes.

## Decision

`contentHash` is a single string in the OCI grammar, restricted to `sha256:<64 lowercase hex>` or `sha512:<128 lowercase hex>`, next to `size` in bytes. It is computed over the exact package bytes, with no canonicalization.

## Consequences

- The value converts exactly into a TUF `hashes` entry, an in-toto DigestSet and an OCI descriptor, so DISTRO-1 can wrap the catalog without recomputing.
- HCS is stricter than OCI: it rejects unregistered algorithms. Accepting digests a host cannot verify would make HCS-0001-R007 unenforceable. Adding an algorithm is a schema minor change.
- A single digest per entry means no algorithm agility inside one catalog version. Accepted for 0.1.
