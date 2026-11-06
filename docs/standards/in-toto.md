# in-toto (Attestation Framework and Specification)

| Field | Value |
| --- | --- |
| Owner | in-toto project (CNCF) |
| Version pinned | Attestation Framework v1.2.0 (Statement `https://in-toto.io/Statement/v1`); in-toto Specification 1.0.0 (layout/link) |
| Source pinned | in-toto/attestation@v1.2.0 (`df02077bf97218a8860a5c534eff1f1381f56984`, released 2026-03-18); in-toto/docs@master (`6459afd8e94a332e423ba05c2862b534acbe741d`, file `in-toto-spec.md`, header "Version 1.0.0"); stable tag in-toto/docs@v1.0 (`926031f40be8db78f992f02f3e50e97a09db5320`) |
| Access date | 2026-11-06 |
| License | Apache-2.0 (in-toto/attestation `LICENSE`); in-toto/docs license [U] not checked |
| Maturity | Attestation v1 stable, SemVer per type; spec 1.0 stable; CNCF Graduated [U] not checked in this pass |
| HCS action | profile (DISTRO-1, optional): HCS catalog entries MAY be attestation subjects; HCS reuses the DigestSet key vocabulary |

## What it defines
- **Attestation Framework**: a layered format for authenticated claims about software artifacts: Envelope (signature wrapper, DSSE recommended) -> Statement (binds subjects to a typed predicate) -> Predicate (type-specific claim, e.g. SLSA Provenance, SPDX, link, VSA). Bundles group several envelopes (JSON Lines; media type `application/vnd.in-toto.bundle`).
- **in-toto Specification 1.0**: the original supply-chain layout model: a project owner signs a *layout* (steps, functionaries, artifact rules, inspections, sublayouts), and functionaries emit *link* metadata per step. It adheres to ITE-4 (non-file artifacts) and ITE-5 (envelope detached; DSSE recommended). The link format is now also expressed as the attestation predicate `https://in-toto.io/attestation/link/v0.3`.

## Key objects and fields
- Statement: `_type` (always `https://in-toto.io/Statement/v1`), `subject` (array of ResourceDescriptor, each MUST set `digest`), `predicateType` (TypeURI), `predicate` (object, optional).
- ResourceDescriptor: `name`, `uri`, `digest` (DigestSet), `content` (base64), `downloadLocation`, `mediaType`, `annotations` (map). At least one of `uri`, `digest`, `content` MUST be present.
- Envelope: DSSE `payloadType` MUST be `application/vnd.in-toto+json` or (since v1.2) `application/vnd.in-toto.<predicate>+json`; single-attestation media type form `application/vnd.in-toto.<predicate>+dsse`.
- Subjects are matched purely by digest, regardless of content type.

### DigestSet (for HCS-0001)
- JSON object: algorithm name -> string digest, e.g. `{"sha256": "<lowercase hex>"}`; multiple entries allowed for agility.
- Named standard algorithms use NIST names lowercased with `-` replaced by `_`, lowercase hex values: `sha256`, `sha224`, `sha384`, `sha512`, `sha512_224`, `sha512_256`, `sha3_224`, `sha3_256`, `sha3_384`, `sha3_512`, `shake128`, `shake256`, `blake2b`, `blake2s`, `ripemd160`, `sm3`, `gost`, `sha1`, `md5`.
- Special keys: `dirHash` (Go dirhash h1 as hex), `gitCommit`, `gitTree`, `gitBlob`, `gitTag` (SHA-1 or SHA-256 hex of git objects). Non-cryptographic immutable IDs (e.g. `arn`) are allowed since v1.1.
- RECOMMENDED at least `sha256`. Consumers MUST accept only algorithms they consider secure and MUST ignore unrecognized ones; two DigestSets match if ANY acceptable entry matches.

## Extension points
- New predicates: any `predicateType` URI; predicates version independently (SemVer, major version in the TypeURI).
- Parsing rule: consumers MUST ignore unrecognized fields unless a predicate says otherwise (monotonic principle); extension fields and `annotations` follow the naming conventions in the framework README.
- New DigestSet algorithms MUST document their value encoding.
- Spec-level changes go through ITEs (in-toto Enhancements).

## Where HCS references it instead of redefining
- DISTRO-1 MAY require an in-toto Statement whose `subject[].digest` equals the HCS-0001 entry `contentHash`; HCS MUST NOT define its own attestation envelope or statement shape.
- HCS-0001 SHOULD use DigestSet algorithm names (`sha256`, `sha512`) as its algorithm vocabulary so a `sha256:<hex>` string maps 1:1 to `{"sha256": "<hex>"}`.
- Provenance and SBOM claims are referenced by `predicateType` (SLSA, SPDX); HCS does not restate predicate bodies.
- in-toto layouts are out of scope for HCS 0.1; reference only.

## Pitfalls for HCS
- DigestSet is an object keyed by algorithm; OCI uses a single `alg:encoded` string. Spell out the conversion and reject entries whose algorithm is not in HCS's allowed set.
- Naming drift: the DigestSet doc's heading says `dirHash` while its example uses `dirHash1`; avoid relying on those keys.
- "Ignore unrecognized algorithms" means a subject with only an unknown algorithm silently matches nothing; HCS verification must fail closed, not pass.
- Unsigned Statements carry no authority; signing comes from the envelope (DSSE / Sigstore bundle).

## Sources
- https://github.com/in-toto/attestation/tree/v1.2.0/spec/v1 (statement.md, resource_descriptor.md, digest_set.md, envelope.md, bundle.md, README.md, CHANGELOG.md; read 2026-11-06)
- https://github.com/in-toto/attestation/blob/v1.2.0/spec/versioning.md (read 2026-11-06)
- https://github.com/in-toto/attestation/blob/v1.2.0/spec/predicates/link.md (read 2026-11-06)
- https://github.com/in-toto/docs/blob/master/in-toto-spec.md (read 2026-11-06)
- https://github.com/in-toto/specification (README pointing to in-toto/docs; read 2026-11-06)
