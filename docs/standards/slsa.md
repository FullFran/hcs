# SLSA (Supply-chain Levels for Software Artifacts)

| Field | Value |
| --- | --- |
| Owner | OpenSSF (slsa-framework) |
| Version pinned | SLSA specification v1.2 (tag commit dated 2025-11-24) |
| Source pinned | slsa-framework/slsa@v1.2 (`19e4e2f005f871270c4f555fc47afecfb37f3efe`), files under `docs/spec/v1.2/`; main at access was `4d3f9d44a803aaa52eef08fdafd04a7409c263e7` |
| Access date | 2026-11-06 |
| License | Community Specification License 1.0 (`LICENSE.md`) |
| Maturity | Stable release; levels are self-attested by producers/platforms; OpenSSF Graduated [U] not re-checked |
| HCS action | profile (DISTRO-1, optional): HCS MAY require SLSA Build provenance for catalog entries; HCS does not define provenance |

## What it defines
Incremental supply-chain security levels organized in tracks. v1.2 has two tracks:
- **Build track**: L0 (none), L1 (provenance exists), L2 (signed provenance from a hosted build platform), L3 (hardened build platform).
- **Source track** (new in v1.2): L1 (version controlled), L2 (history and source provenance), L3 (continuous technical controls), L4 (two-party review).
Plus a threat model, verification guidance for artifacts and sources, and recommended attestation formats (Build Provenance, Verification Summary Attestation).

## Key objects and fields
- Build Provenance predicate: `predicateType` = `https://slsa.dev/provenance/v1` (use this string exactly, not the browser URL), carried in an in-toto Statement.
  - `buildDefinition`: `buildType` (URI), `externalParameters`, `internalParameters`, `resolvedDependencies` (ResourceDescriptor list).
  - `runDetails`: `builder` (`id`, `version`, `builderDependencies`), `metadata` (`invocationId`, `startedOn`, `finishedOn`), `byproducts`.
  - Required for Build L1: `buildDefinition`, `runDetails`, `buildType`, `externalParameters`, `builder`.
- Verification Summary Attestation: `predicateType` = `https://slsa.dev/verification_summary/v1`; field `verifiedLevels` holds strings such as `SLSA_BUILD_LEVEL_0`..`SLSA_BUILD_LEVEL_3` and `SLSA_SOURCE_LEVEL_<n>`. Source VSA requires `subject.annotations.sourceRefs` (SHOULD) and `resourceUri` (MUST).
- Source track evidence: "source provenance attestations" are a generic category in v1.2; the spec gives examples but defines no dedicated source-provenance predicate URI.
- Digests inside provenance use in-toto ResourceDescriptor / DigestSet (`{"sha256": "<hex>"}`).

## Extension points
- `buildType` URIs define the schema of `externalParameters`/`internalParameters`; each ecosystem publishes its own.
- Consumers MUST ignore unrecognized fields unless noted; the `predicateType` carries only the major version, so minor additions do not change it.
- `byproducts` and `resolvedDependencies` carry arbitrary ResourceDescriptors.

## Where HCS references it instead of redefining
- DISTRO-1 MAY state "entry MUST have SLSA Build L<n> provenance whose subject digest equals HCS-0001 `contentHash`"; HCS MUST NOT restate provenance fields or level requirements.
- HCS conformance (CORE-0) does not depend on SLSA; it is an optional DISTRO-1 attestation.
- Expected-provenance policy (which `builder.id`, which `buildType`) belongs to the distribution operator, referenced from DISTRO-1, not to HCS-0001.

## Pitfalls for HCS
- Levels are self-attested: a claimed level is not proof; verification needs trusted `builder.id` expectations.
- Inconsistency in v1.2: the Source track defines L1-L4, but the Source VSA rule says `verifiedLevels` MUST be one of `SLSA_SOURCE_LEVEL_0`..`SLSA_SOURCE_LEVEL_3`, while verification_summary.md examples show `SLSA_SOURCE_LEVEL_4`.
- The Source track is new; do not require a Source level in HCS 0.x without a concrete predicate to verify.
- Pin the `predicateType` URI, not "SLSA 1.2": v1.0, v1.1 and v1.2 all use `https://slsa.dev/provenance/v1`.
- Provenance binds to digests only; the HCS digest format must map exactly to DigestSet keys.

## Sources
- https://github.com/slsa-framework/slsa/tree/v1.2/docs/spec/v1.2 (index.md, whats-new.md, tracks.md, build-track-basics.md, build-provenance.md, source-requirements.md, verification_summary.md; read 2026-11-06)
- https://slsa.dev/spec/v1.2/ (rendered site; link only)
- https://slsa.dev/provenance/v1 (predicate URI; link only)
