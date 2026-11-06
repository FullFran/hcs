# SPDX (System Package Data Exchange)

| Field | Value |
| --- | --- |
| Owner | SPDX project (Linux Foundation) |
| Version pinned | SPDX 3.0.1 (released 2024-12-17); ISO/IEC 5962:2021 corresponds to SPDX 2.2.1; SPDX License List data v3.29.0 (2026-09-16) |
| Source pinned | spdx/spdx-spec@3.0.1 (`61a649da8ca27924ac1ca8d2a061cb228839b24c`); spdx/spdx-3-model@3.0.1 (`a745f63e8643d5ae0f0851fcfa6836085308f80b`); spdx/license-list-data@v3.29.0 (`31ba1a50e5397e00a304dbadc76531740e89ee48`) |
| Access date | 2026-11-06 |
| License | Community Specification License 1.0, with pre-existing portions under CC-BY-3.0 (spdx-spec `LICENSE`) |
| Maturity | 3.0.1 stable; v3.1-RC1 pre-release (2026-01-24); 2.2.1 is the ISO edition |
| HCS action | adopt license expressions for an optional HCS-0001 `license` field; profile (DISTRO-1, optional) for SBOMs |

## What it defines
An information model and serializations (JSON-LD among others) for describing software packages, files, snippets, their relationships, licensing, security, build, AI and dataset metadata. 3.0 is organized into profiles: Core (mandatory), Software, Security, Licensing, Dataset, AI, Build, Lite, Extension. It also defines the SPDX License Expression syntax (annex) used well beyond SPDX documents.

## Key objects and fields
- Core: `Element` hierarchy, `Relationship`, `CreationInfo`, `SpdxDocument`; every element has an `spdxId` IRI [U] property names not re-read beyond Hash.
- Integrity: `IntegrityMethod` (abstract) -> `Hash` with `algorithm` (vocabulary `HashAlgorithm`) and `hashValue` (string), each exactly once.
- `HashAlgorithm` entries include `sha1`, `sha224`, `sha256`, `sha384`, `sha512`, `sha3_224`, `sha3_256`, `sha3_384`, `sha3_512`, `blake2b256`, `blake2b384`, `blake2b512`, `blake3`, `md2`, `md4`, `md5`, `md6`, `adler32`, post-quantum names, and `other`.
- License expression grammar (annex "SPDX License Expressions"):
  - `simple-expression = license-id / license-id"+" / license-ref`
  - `license-ref = ["DocumentRef-"idstring":"]"LicenseRef-"idstring`; `addition-ref` analogous with `AdditionRef-`
  - compound operators `WITH`, `AND`, `OR` (upper or lower case), parentheses for precedence; `idstring = 1*(ALPHA / DIGIT / "-" / ".")`.
  - License and exception identifiers come from the SPDX License List and match case-insensitively; for `LicenseRef-`/`AdditionRef-` only the part after the prefix is case-insensitive.

## Extension points
- Extension profile (`Extension` class) for custom properties in 3.x.
- `LicenseRef-<id>` / `AdditionRef-<id>` for licenses and exceptions not on the list.
- `HashAlgorithm` value `other` for unlisted algorithms.
- New profiles in later versions (3.1 in RC).

## Where HCS references it instead of redefining
- If HCS-0001 adds an optional `license` field, its value MUST be an SPDX License Expression per SPDX 3.0.1 annex; HCS MUST NOT define its own license vocabulary.
- DISTRO-1 MAY require an SPDX SBOM per catalog entry, attached as an in-toto predicate (`spdx3`/`spdx2` predicate types) or OCI referrer; HCS does not restate the SPDX model.
- SPDX `Hash` (`algorithm: sha256`, `hashValue: <hex>`) maps to HCS `sha256:<hex>`; HCS cites the mapping, not the model.

## Pitfalls for HCS
- Citing "ISO SPDX" means 2.2.1, not 3.x; pin the version you mean.
- SPDX algorithm names differ from in-toto (`blake2b256` vs `blake2b`) and from OCI's string form; normalize via an explicit table.
- `LicenseRef-` values are document-local; a bare `LicenseRef-x` in an HCS catalog has no defining document.
- License List identifiers change over list releases (deprecations); pin the License List version used for validation.

## Sources
- https://github.com/spdx/spdx-spec/tree/3.0.1/docs (conformance.md, annexes/spdx-license-expressions.md; read 2026-11-06)
- https://github.com/spdx/spdx-spec/blob/3.0.1/LICENSE (read 2026-11-06)
- https://github.com/spdx/spdx-3-model/tree/3.0.1/model/Core (Classes/Hash.md, Classes/IntegrityMethod.md, Vocabularies/HashAlgorithm.md; read 2026-11-06)
- https://github.com/spdx/spdx-spec/releases (3.0.1, v3.1-RC1, v2.2.1 notes citing ISO/IEC 5962:2021; read 2026-11-06)
- https://github.com/spdx/license-list-data/releases/tag/v3.29.0 (release metadata read 2026-11-06)
