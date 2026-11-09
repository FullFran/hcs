# HCS reference SDK (TypeScript)

Reference implementation of HCS ([ADR-0029](../../docs/adr/0029-reference-sdk-in-typescript.md)). The spec in `spec/` and the schemas in `schemas/` are the source of truth; this SDK is measured against `conformance/` like any harness.

Requires Node 24 or later. Sources are TypeScript run directly by Node (type stripping); `npm test` runs the unit tests and the conformance measurement, `npm run typecheck` checks `src/` and `test/`, and `npm run build` emits JavaScript and declarations to `dist/` (Node refuses type stripping under `node_modules`, so consumers import the built files).

`test/conformance.test.ts` runs every case in `conformance/cases` of the levels the SDK implements (`document` for the HCS-0001 catalog and HCS-0004 lifecycle schemas, `integrity`, `resolution`, `authority`) and fails on any failing case; other levels are reported not applicable.

Distribution-specific behaviour (extension kinds, detail-key prefixes, permission sets, host profiles) is passed in by each harness, never hard-coded here:

- **Host profile** (`HostProfile`, with its `builtins` and `contributionKinds`): required by `builtinCapabilities(host)`, `new CapabilityRegistry(input, host)`, `loadRegistry(stateDir, host)`, `generationCapabilities(stateDir, host)` and `applyDesiredSet(bytes, { host, ... })`. There is no default host.
- **Grantable permissions**: required by `readGrants(dir, grantable)`, `grantPermission(dir, entry, permission, grantable)`, `revokePermission(dir, entry, permission, grantable)` and `grantAuthorizer({ grantsDir, storeDir, grantable })`. `applyDesiredSet` takes `grantable` as an option and defaults to none, so a package that requests any permission is refused until the harness passes its set.
- **Detail-key prefix**: errors carry extension members in `details` named `<prefix>-pointer`, `<prefix>-archive`, `<prefix>-member`, `<prefix>-reason` and `<prefix>-rollback`. The prefix is an optional last argument of `readCatalog(bytes, limits, detailPrefix)` and `unpackPackage(bytes, expected, dir, limits, detailPrefix)`, and the `detailPrefix` option of `applyDesiredSet`; it defaults to `x-hcs-sdk` and must be an extension name (`x-...`), otherwise a `RangeError` is thrown.

## Modules

| Module | Spec | Origin |
|---|---|---|
| `src/errors.ts` | HCS-0006 | RE;write 7e9e903 `src/hcs/errors.ts` |
| `src/ids.ts` | HCS-0002, HCS-0000 (extension names) | RE;write 7e9e903 `src/hcs/ids.ts` |
| `src/version.ts` | HCS-0000 | RE;write 7e9e903 `src/hcs/version.ts` |
| `src/extensions.ts` | HCS-0000 (extension members) | RE;write 7e9e903 `src/hcs/extensions.ts` |
| `src/catalog.ts` | HCS-0001 | RE;write 7e9e903 `src/hcs/catalog.ts` |
| `src/tar.ts` | HCS-0001 (package archive) | RE;write 7e9e903 `src/hcs/tar.ts` |
| `src/package.ts` | HCS-0001 (R007, R012) | RE;write 7e9e903 `src/hcs/package.ts` |
| `src/resolve.ts` | HCS-0003 | RE;write 7e9e903 `src/hcs/resolve.ts` |
| `src/lifecycle.ts` | HCS-0004 | RE;write 7e9e903 `src/hcs/lifecycle.ts` |
| `src/capabilities.ts` | HCS-0004 (R005, R006) | RE;write 7e9e903 `src/hcs/capabilities.ts` |
| `src/registry.ts` | HCS-0004 (R005, R006) | RE;write 7e9e903 `src/hcs/registry.ts` |
| `src/authority.ts` | HCS-0005 | RE;write 7e9e903 `src/hcs/authority.ts` |
| `src/grants.ts` | HCS-0005 | RE;write 7e9e903 `src/hcs/grants.ts` |
| `src/host-state.ts` | HCS-0003, HCS-0004, HCS-0005 | RE;write 7e9e903 `src/hcs/host-state.ts` |
| `src/transport.ts` | HCS-0006 | RE;write 7e9e903 `src/hcs/transport.ts` |
| `src/host.ts` | HCS-0003 (host profile) | RE;write 7e9e903 `src/hcs/host.ts` |
| `src/signing/` (exported as `signing`) | HCS-0007 (DISTRO-1) | written from the spec and `conformance/runner/distro1.py` |
