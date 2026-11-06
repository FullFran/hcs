# ADR-0004: Package and catalog versions are opaque strings

**Status:** Proposed (2026-11-06)

## Context

The README fields include `version`. Package ecosystems version differently (SemVer, dates, commit IDs), and the research warns against assuming SemVer ([docs/standards/semver.md](../standards/semver.md)). A desired-state catalog pins exact versions; it does not need ranges.

## Decision

`version` (catalog and entry) is a non-empty string without whitespace, at most 128 characters, compared for equality only. Compatibility between packages goes through capability references (HCS-0002), not package version ranges.

## Consequences

- No version-range semantics to specify or test in 0.1.
- Host compatibility ranges (`compatibility.hosts`) cannot be expressed yet (OQ-0001-3).
- Rollback protection cannot compare catalog versions; DISTRO-1 will need a monotonic number (TUF `version`), not this field (OQ-0001-4).
