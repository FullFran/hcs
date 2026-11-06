# Sigstore (bundle, cosign, Fulcio, Rekor)

| Field | Value |
| --- | --- |
| Owner | Sigstore project (OpenSSF) |
| Version pinned | Bundle format v0.3 (`application/vnd.dev.sigstore.bundle.v0.3+json`) in protobuf-specs v0.5.2; cosign v3.1.4; Fulcio v1.9.1; Rekor v1 line v1.5.5; Rekor v2 (repo `sigstore/rekor-tiles`) v2.4.1 |
| Source pinned | sigstore/protobuf-specs@v0.5.2 (`0342fe5797edd558c58098033220fb27a2542a28`, 2026-08-21); sigstore/cosign@v3.1.4 (`0e48502cf5ef34e2e60bbd3617aa19945712f705`, 2026-10-20); sigstore/fulcio@v1.9.1 (`306dfb1d3fce59f8a731e2e9525bd04351995081`, 2026-10-21); sigstore/rekor@v1.5.5 (`206912e3cf61ba3fed587896e10d4812411e6913`, 2026-10-21); sigstore/rekor-tiles@v2.4.1 (`14044fd86047c5e46e28d8a46c65f5476b153d60`, 2026-10-30) |
| Access date | 2026-11-06 |
| License | Apache-2.0 (protobuf-specs `LICENSE`; other repos [U] assumed Apache-2.0, not re-read) |
| Maturity | Production; Rekor v2 first release v2.0.0 published 2025-10-10; OpenSSF Graduated [U] not re-checked |
| HCS action | profile (DISTRO-1, optional): Sigstore bundle as one accepted signature format over HCS catalog/entries |

## What it defines
A signing ecosystem: Fulcio issues short-lived X.509 certificates bound to an OIDC identity ("keyless"), Rekor is a transparency log, cosign is the client CLI. The interoperable artifact is the **Sigstore bundle**, defined as protobuf messages in `sigstore/protobuf-specs` with a JSON encoding, carrying everything needed for offline verification. Trust roots are distributed as `TrustedRoot` (itself typically fetched via TUF).

## Key objects and fields
- `Bundle`: `media_type` (string), `verification_material`, `content` oneof `message_signature` | `dsse_envelope`.
  - `media_type` MUST be `application/vnd.dev.sigstore.bundle.v0.3+json` for v0.3 JSON; clients must also accept `application/vnd.dev.sigstore.bundle+json;version=0.1|0.2|0.3`.
  - Versioning is "semver-ish" major/minor carried in `media_type`.
- `VerificationMaterial`: `content` oneof `public_key` | `x509_certificate_chain` | `certificate`; `tlog_entries`; `timestamp_verification_data` (RFC 3161 timestamps). For v0.3 keyless with the public-good instance, the single `certificate` form MUST be used.
- DSSE envelopes in a bundle MUST have exactly one signature.
- Verification policy `CertificateIdentity`: `issuer` (Fulcio OIDC issuer extension, OID 1.3.6.1.4.1.57264.1.1), `san` (subject alternative name), `oids` (extra exact-match OID/value pairs).
- cosign v3.1.4 `verify` (keyless): one of `--certificate-identity` / `--certificate-identity-regexp` AND one of `--certificate-oidc-issuer` / `--certificate-oidc-issuer-regexp` must be set.

### Digest format (for HCS-0001)
- `HashOutput` = `algorithm` (enum `HashAlgorithm`: `SHA2_256`, `SHA2_384`, `SHA2_512`; `SHA3_256`/`SHA3_384` deprecated) + `digest` (raw bytes).
- In the JSON encoding, protobuf `bytes` serialize as base64, so the digest is base64, not hex, and the algorithm is an enum name, not `sha256`.

## Extension points
- New bundle versions via `media_type`; new algorithms via protobuf enum additions (e.g. ML-DSA-44 in v0.5.1).
- DSSE `payloadType` selects the signed payload type (e.g. in-toto Statement).
- `CertificateIdentity.oids` lets policies pin extra Fulcio certificate extensions (e.g. source repository, workflow).

## Where HCS references it instead of redefining
- DISTRO-1 MAY accept a Sigstore bundle (by `media_type`) whose signed subject digest equals the HCS-0001 `contentHash`; HCS MUST NOT define its own certificate or log-entry format.
- HCS-0005 authority: the host's trust policy for a publisher is expressed as (issuer, identity) pairs, reusing `CertificateIdentity` semantics; HCS does not invent identity fields.
- HCS-0006 maps "signature invalid", "identity mismatch", "no tlog entry" to typed errors; Sigstore defines the checks.

## Pitfalls for HCS
- Verifying a certificate without checking BOTH identity and issuer accepts anyone who can get a Fulcio cert; HCS policy MUST require both.
- Digest encodings differ: Sigstore JSON uses base64 bytes + `SHA2_256`; OCI uses `sha256:<hex>`; in-toto/TUF use `{"sha256":"<hex>"}`. HCS must normalize before comparing.
- "Rekor v2" is a separate repo (`rekor-tiles`, v2.x) while `sigstore/rekor` stays on v1.x; pin both explicitly.
- Short-lived certs mean verification time relies on tlog/timestamp evidence; offline verification needs the bundle plus a current TrustedRoot.

## Sources
- https://github.com/sigstore/protobuf-specs/blob/v0.5.2/protos/sigstore_bundle.proto (read 2026-11-06)
- https://github.com/sigstore/protobuf-specs/blob/v0.5.2/protos/sigstore_common.proto (read 2026-11-06)
- https://github.com/sigstore/protobuf-specs/blob/v0.5.2/protos/sigstore_verification.proto (read 2026-11-06)
- https://github.com/sigstore/protobuf-specs/blob/v0.5.2/CHANGELOG.md (read 2026-11-06)
- https://github.com/sigstore/cosign/blob/v3.1.4/doc/cosign_verify.md (read 2026-11-06)
- https://github.com/sigstore/cosign/releases, https://github.com/sigstore/fulcio/releases, https://github.com/sigstore/rekor/releases, https://github.com/sigstore/rekor-tiles/releases (release metadata read 2026-11-06)
