# HCS reference SDK (TypeScript)

Reference implementation of HCS ([ADR-0029](../../docs/adr/0029-reference-sdk-in-typescript.md)). The spec in `spec/` and the schemas in `schemas/` are the source of truth; this SDK is measured against `conformance/` like any harness.

Requires Node 24 or later. Sources are TypeScript run directly by Node (type stripping); `npm test` runs the unit tests and the conformance measurement.

Distribution-specific behaviour (extension kinds, detail-key prefixes, permission sets, host profiles) is passed in by each harness, never hard-coded here.

## Modules

| Module | Spec | Origin |
|---|---|---|
| _filled in as modules land_ | | |
