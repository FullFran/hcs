# ADR-0030: Separate uncompressed tar identity from transport integrity

**Status:** Proposed

## Decision

Add optional entry `contentId`: the SHA-256 or SHA-512 digest of the exact uncompressed tar stream, inspired by OCI image-spec v1.1.1 DiffID (`config.md#layer-diffid`). Keep `contentHash` and `size` unchanged: they describe the compressed bytes fetched, and are always verified first. HCS-0001 section 3.5 and R017/R018 define the contract.

## Context

Gzip settings or headers can change transport bytes without changing the tar they contain. One digest cannot simultaneously identify both representations. OCI already separates a layer descriptor's digest from the DiffID of its uncompressed tar, so HCS reuses that distinction rather than defining a new canonical archive.

## Consequences

- Hash every decompressed byte, including tar headers, order, metadata, padding and terminators. Equal extracted trees need not have equal identities. This is not universal tree identity, and producers are not required to rebuild existing archives canonically.
- Verify transport size and digest, decompress with a whole-stream bound, verify `contentId`, then use package content. Extraction safety, member and payload bounds still apply. Permission-request reading and extraction use the same verified decompression helper in the SDK; a mismatched identity cannot authorize content.
- Keep the association in the authenticated catalog. DISTRO-1's existing signed envelope covers both identities and the entry metadata; changing, adding or removing `contentId` breaks that signature. An untrusted sidecar cannot authorize a content-equivalence decision. No grant reuse, activation skipping or cache-key change is introduced.
- Missing identity is unknown. The existing compressed verification path remains unchanged when it is absent; in particular a transport-only integrity test does not suddenly validate archive structure. Equality comparisons require both identities verified with the same algorithm.
- The reference runner streams decompressed bytes through a fixed buffer and bounds total output. The SDK uses bounded gunzip before parsing tar. Invalid gzip, identity mismatch and exceeded decompression bounds with an identity report `integrity_mismatch`; existing no-identity archive errors remain unchanged.

## Migration and alternatives

This is a draft contract/schema extension under the existing `0.1` identifier, not a backward-compatibility promise: old validators have closed entry schemas and reject `contentId`. Upgrade hosts before adding the field, or publish a separate, newly signed legacy catalog without it. Never remove it from an already signed envelope. No negotiation mechanism is added.

Rejected: redefining `contentHash` (would lose transport verification); hashing an extracted tree (requires new metadata and canonicalization rules); using an extension member (extensions cannot change validity); accepting an advertised identity without verifying the package and its authenticated entry binding (would trust an attacker's equality claim).

## Review path

1. HCS-0001 section 3.5 and R017/R018: byte domain, ordering, authority and migration.
2. `sdk/ts/src/package.ts` and `grants.ts`: shared bounded verification before use.
3. `conformance/runner/run.py`, identity cases and SDK tests: exact tar bytes, distinct gzip representations, rejection, absence and preservation of safety checks.
