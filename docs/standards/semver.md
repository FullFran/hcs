# Semantic Versioning

| Field | Value |
| --- | --- |
| Owner | semver project (Tom Preston-Werner, original author; `semver/semver` on GitHub) |
| Version pinned | Semantic Versioning 2.0.0 |
| Source pinned | `semver/semver@v2.0.0` = commit `7c834b3f3a4940d77ab593bc32583004d6a426a9` (2013-06-18), file `semver.md`; current `master` = `f99d5485190a47c0863949e7da810a5553e0ed4d` (2025-11-05), still titled 2.0.0, adds FAQ regex and BNF grammar |
| Access date | 2026-11-06 |
| License | Creative Commons CC BY 3.0 (stated at the end of `semver.md`; GitHub detects no repo license) |
| Maturity | Stable since 2013; de facto standard, not from a standards body |
| HCS action | profile (HCS-0000 versioning of HCS itself; HCS-0003 resolution uses it only where a doc defines version semantics) |

## What it defines

A version string format `MAJOR.MINOR.PATCH` and rules for incrementing it relative to a
declared public API, plus pre-release and build metadata suffixes and a total precedence
order.

## Key objects and fields

- Normal version `X.Y.Z`: non-negative integers, no leading zeroes.
- Released contents of a version must not change; changes need a new version.
- `0.y.z`: initial development, anything may change. `1.0.0` defines the public API.
- Increment rules: PATCH for compatible fixes, MINOR for compatible additions (and
  deprecations), MAJOR for incompatible changes; lower fields reset to 0.
- Pre-release: `-` followed by dot-separated identifiers `[0-9A-Za-z-]`, non-empty, numeric
  ones without leading zeroes (for example `1.0.0-alpha.1`). Lower precedence than the normal
  version.
- Build metadata: `+` followed by dot-separated identifiers `[0-9A-Za-z-]`; ignored for
  precedence.
- Precedence: compare major, minor, patch numerically; a pre-release sorts before its normal
  version; pre-release identifiers compared left to right, numeric numerically, alphanumeric in
  ASCII order, numeric below alphanumeric, longer set wins when all preceding identifiers are
  equal. Canonical example: `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta <
  1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.

## Extension points

None in the format. Pre-release and build identifiers are free-form within the character set.
Version ranges (`^`, `~`, `>=`) are not part of SemVer; they come from package managers.

## Where HCS references it instead of redefining

- HCS-0000: HCS document and schema versions (for example `hcsVersion`) follow SemVer 2.0.0;
  HCS MUST NOT restate the precedence algorithm.
- HCS-0001: a package `version` in the catalog manifest is an **opaque string** compared for
  equality only (0.1 resolves exact versions). HCS does not assume a package uses SemVer.
- HCS-0002: a capability contract version MAY be declared SemVer by HCS-0002; if so, MAJOR
  defines compatibility and SemVer precedence applies.
- HCS-0003: version ranges, if added, must name their syntax explicitly (for example a SemVer
  range grammar from a cited package manager) rather than invent one; until then, exact match.
- CORE-0 conformance fixtures include pre-release and build-metadata strings to prove that
  opaque comparison does not normalise them.

## Pitfalls for HCS

- Build metadata is ignored for precedence: `1.0.0+a` and `1.0.0+b` are "equal" in SemVer but
  are different artifacts. Content identity must come from `contentHash`, never from version.
- Many ecosystems are not SemVer (calendar versions, PEP 440, Go pseudo-versions); requiring
  SemVer for packages would exclude them, hence the opaque rule.
- A leading `v` (`v1.2.3`) is not SemVer; decide whether HCS strips, rejects, or preserves it.
- The tagged v2.0.0 text lacks the regex/BNF later added on `master`; cite the tag for
  normative content and `master` only for the grammar.

## Sources

- https://semver.org/spec/v2.0.0.html [U: site not fetched; repo file read instead]
- https://github.com/semver/semver/blob/v2.0.0/semver.md
- https://github.com/semver/semver/blob/master/semver.md
