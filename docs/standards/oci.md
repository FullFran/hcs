# OCI (Image, Distribution and Runtime specifications)

| Field | Value |
| --- | --- |
| Owner | Open Container Initiative (Linux Foundation) |
| Version pinned | image-spec v1.1.1; distribution-spec v1.1.1; runtime-spec v1.3.0 |
| Source pinned | opencontainers/image-spec@v1.1.1 (`147f9c13cedb47a0c4d9a11a222961073d585877`, released 2025-03-03); opencontainers/distribution-spec@v1.1.1 (`a139cc423184af6078077b9b7ee336eddbd03f8f`, released 2025-01-29); opencontainers/runtime-spec@v1.3.0 (`92249139eea7161e13745abd4cb6d0ea02a3227a`, released 2025-11-04) |
| Access date | 2026-11-06 |
| License | Apache-2.0 (image-spec and distribution-spec `LICENSE` read; runtime-spec [U] not re-read) |
| Maturity | Stable; distribution-spec ships a runnable conformance suite (`conformance/`) |
| HCS action | adopt the digest grammar in HCS-0000/HCS-0001; profile DISTRO-1 for OCI as optional transport; runtime-spec out (ISOLATION-1 backends may reference it) |

## What it defines
- **image-spec**: content descriptors, image manifest, image index, config, layers, annotations, media types; v1.1 added `artifactType` and `subject` for non-image artifacts.
- **distribution-spec**: the registry HTTP API (pull, push, content discovery, management) and, since v1.1, the referrers API.
- **runtime-spec**: container configuration and lifecycle for runtimes; not used by the HCS catalog.

## Key objects and fields
- Descriptor: `mediaType` (REQUIRED, RFC 6838), `digest` (REQUIRED), `size` (REQUIRED, int64 bytes), `urls` (optional), `annotations` (optional string-string map), `data` (optional base64 embedded content), `artifactType` (optional, RFC 6838). Index entries pointing to image manifests SHOULD add `platform`.
- Verification: check `size` before hashing; retrieved content whose length differs SHOULD NOT be trusted; content from untrusted sources SHOULD be verified against `digest`.
- Image manifest: `artifactType` MUST be set when `config.mediaType` is the empty descriptor `application/vnd.oci.empty.v1+json`; `subject` (descriptor) creates a weak link used by the referrers API.
- Referrers API: `GET /v2/<name>/referrers/<digest>`, optional `?artifactType=` filter (response header `OCI-Filters-Applied: artifactType`); fallback tag schema `<alg>-<ref>` (e.g. `sha256-<hex>`); registries supporting it MUST NOT return 404; push response may carry `OCI-Subject`.

### Digest format (for HCS-0001)
- Grammar: `digest ::= algorithm ":" encoded`; `algorithm ::= algorithm-component (algorithm-separator algorithm-component)*`; `algorithm-component ::= [a-z0-9]+`; `algorithm-separator ::= [+._-]`; `encoded ::= [a-zA-Z0-9=_-]+`.
- Registered algorithms: `sha256` (encoded MUST match `[a-f0-9]{64}`, implementations MUST support it) and `sha512` (`[a-f0-9]{128}`, MAY support). Uppercase hex MUST NOT be used. Compliant implementations SHOULD use sha256.
- Unregistered but grammatical digests (e.g. `sha256+b64u:...`, `multihash+base58:...`) SHOULD pass validation.
- Digest = `'<alg>:' + Encode(H(bytes))` over the exact bytes, no implicit canonicalization.

## Extension points
- Annotations: keys SHOULD use reverse-domain notation (`com.example.myKey`); prefix `org.opencontainers` is reserved for OCI specs, and `org.opencontainers.image` for image-spec only; consumers MUST NOT error on unknown keys; values are strings (may be empty).
- Custom media types and `artifactType` values (vendor tree `application/vnd.<org>...`); implementations MUST NOT error on unknown `artifactType`.
- New descriptor fields SHOULD first be proposed to image-spec; new digest algorithms SHOULD be submitted for registration.

## Where HCS references it instead of redefining
- HCS-0000/HCS-0001 `contentHash` SHOULD reuse the OCI digest grammar and registered algorithms verbatim (`sha256:<64 lowercase hex>`) and cite image-spec `descriptor.md#digests` rather than defining a new grammar.
- HCS-0001 `size` has the same meaning as descriptor `size` (exact byte length); HCS cites it.
- DISTRO-1 MAY ship an HCS package as an OCI artifact (`artifactType` = an HCS media type) and attach signatures/SBOMs via `subject` + referrers; HCS MUST NOT restate the registry API.
- HCS annotations on OCI objects use a non-reserved reverse-domain prefix, never `org.opencontainers.*`.

## Pitfalls for HCS
- OCI gives content addressing and transport, not freshness, rollback or freeze protection (see TUF).
- The grammar permits unregistered algorithms; HCS should restrict its accepted set (at least `sha256`, optionally `sha512`) and fail closed on others.
- Mapping to DigestSet/TUF: `sha256:<hex>` -> `{"sha256": "<hex>"}` is lossless only for registered hex algorithms; `+` encodings have no DigestSet equivalent.
- Hash the exact bytes; re-serializing JSON changes the digest.
- Referrers API support varies by registry; the tag-schema fallback has races (conditional requests are only MAY).

## Sources
- https://github.com/opencontainers/image-spec/blob/v1.1.1/descriptor.md (read 2026-11-06)
- https://github.com/opencontainers/image-spec/blob/v1.1.1/annotations.md (read 2026-11-06)
- https://github.com/opencontainers/image-spec/blob/v1.1.1/manifest.md (read 2026-11-06)
- https://github.com/opencontainers/distribution-spec/blob/v1.1.1/spec.md (read 2026-11-06)
- https://github.com/opencontainers/runtime-spec/releases/tag/v1.3.0 (release metadata read 2026-11-06)
