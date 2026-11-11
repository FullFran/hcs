# HCS reference SDK (TypeScript)

Reference implementation of HCS ([ADR-0029](../../docs/adr/0029-reference-sdk-in-typescript.md)). The spec in `spec/` and the schemas in `schemas/` are the source of truth; this SDK is measured against `conformance/` like any harness.

Requires Node 24 or later. Sources are TypeScript run directly by Node (type stripping); `npm test` runs the unit tests and the conformance measurement, `npm run typecheck` checks `src/` and `test/`, and `npm run build` emits JavaScript and declarations to `dist/` (Node refuses type stripping under `node_modules`, so consumers import the built files).

`test/conformance.test.ts` runs every case in `conformance/cases` of the levels the SDK implements (`document` for the HCS-0001 catalog and HCS-0004 lifecycle schemas, `integrity`, `resolution`, `authority`) and fails on any failing case; other levels are reported not applicable there. `test/signing/conformance-distribution.test.ts` measures `distribution`, and `test/projection/conformance-projection.test.ts` measures every `projection` case through `projection.projectGeneration` with a reference adapter equivalent to `conformance/runner/projection.py`.

Distribution-specific behaviour (extension kinds, detail-key prefixes, permission sets, host profiles) is passed in by each harness, never hard-coded here:

- **Host profile** (`HostProfile`, with its `builtins` and `contributionKinds`): required by `builtinCapabilities(host)`, `new CapabilityRegistry(input, host)`, `loadRegistry(stateDir, host)`, `generationCapabilities(stateDir, host)` and `applyDesiredSet(bytes, { host, ... })`. There is no default host.
- **Grantable permissions**: required by `readGrants(dir, grantable)`, `grantPermission(dir, entry, permission, grantable)`, `revokePermission(dir, entry, permission, grantable)` and `grantAuthorizer({ grantsDir, storeDir, grantable })`. `applyDesiredSet` takes `grantable` as an option and defaults to none, so a package that requests any permission is refused until the harness passes its set.
- **Detail-key prefix**: errors carry extension members in `details` named `<prefix>-pointer`, `<prefix>-archive`, `<prefix>-member`, `<prefix>-reason` and `<prefix>-rollback`. The prefix is an optional last argument of `readCatalog(bytes, limits, detailPrefix)` and `unpackPackage(bytes, expected, dir, limits, detailPrefix)`, and the `detailPrefix` option of `applyDesiredSet`; it defaults to `x-hcs-sdk` and must be an extension name (`x-...`), otherwise a `RangeError` is thrown.

## Package identity

`buildPackage(dir)` returns `bytes`, compressed `contentHash` / `size`, `mediaType`, and `contentId` (SHA-256 of the exact uncompressed tar stream). Pass the expected entry from a verified catalog to `verifyPackage`, `unpackPackage` or `packageRequests`; when `contentId` is present, they verify transport first, bound decompression and verify that identity before using package content. Extraction retains its member, payload and unsafe-member checks. The default whole-tar bound is 256 MiB + 10,000 × 1,023 + 1,024 bytes; `unpackPackage` derives its bound from the supplied `maxBytes` / `maxMembers`.

Without `contentId`, `verifyPackage` remains transport-only (it does not require valid gzip); extraction and permission reading still decompress as before. Missing identity means unknown, not equal. Identity covers headers, order, metadata, padding and terminators, not just file contents. No tar canonicalization, cache-key change or grant reuse is introduced. Consumers, not the hash, supply authority: DISTRO-1's signed catalog binds `contentId` to the entry and transport identity.

Older closed-schema catalog validators reject `contentId`; this draft addition does **not** promise compatibility. Upgrade consumers before emitting it, or publish a separately signed legacy catalog without the member. Removing it from an already signed envelope invalidates that signature. See [HCS-0001 section 3.5](../../spec/HCS-0001-catalog-manifest.md#35-optional-uncompressed-content-identity).

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
| `src/projection/` (exported as `projection`) | HCS-0008 (host adapter), host lock (SDK extension) | written from the spec and `conformance/runner/projection.py` |
| `src/mcp-server.ts` | HCS-0008 (R010, R011) | written from the spec and `conformance/runner/projection.py` |

## Projection (HCS-0008)

`projection.projectGeneration(generation, adapter, hostLock, options)` turns one generation into a launch plan for one engine run and a report. The SDK holds only the engine-neutral part; each engine (appendix A of HCS-0008 lists observed mappings) gets an `EngineAdapter` maintained outside the SDK:

- `kinds`: the contribution kinds the adapter can project. Any other kind, core or extension (`x-...`), is reported `unsupported_contribution` (R004) without special cases.
- `project(contribution, context)`: pure; returns the engine-level names it touches (`settings`, each with an `effect`: `add`, `replace`, `remove`, `widen`, `narrow`, and an optional permission `level`), the secret inputs it needs, an optional `identity` (for an MCP server, its `server.json` `name`), and a fragment of files (relative to the run directory, literal or a link into the generation), arguments and environment. Or a refusal with `manifest_invalid`, `unsupported_contribution` or `permission_denied`, checked in the order of HCS-0008 6.4.1. Literal delivery of MCP values (R030) is the adapter's job.
- `assemble(projected, context)` (optional): runs once over the contributions of the selected entries, for engine files that combine several of them.

An adapter for `mcp-server` contributions does not need its own `server.json` walk. `checkServerJson(doc, detailPrefix?)` checks the members HCS requires (`name`, `description` and `version` are strings; `packages` and `remotes` are arrays when present; R010) and that no secret input carries a `value` or a `default` (R011, read strictly: a templated value is a value too). It returns `manifest_invalid` errors with a JSON Pointer to the input and never echoes a value. It is not validation against the MCP Registry schema, which stays with the adapter (ADR 0017). `readServerJson` throws those errors as `HcsFailure` or returns the server `name` and every input (`environment`, `header`, `argument` or `variable`, with `isRequired` and `isSecret`), and `serverJsonSecretInputs(report)` turns that report into the `secrets` an adapter returns from `project`.

The core then applies, in order: missing required secret grants (`permission_denied`, R012), the host lock allow-lists, host-owned settings and permission ceilings (`permission_denied`, R007; narrowing is allowed), and collisions of engine-level names, run files or environment variables between entries (`ambiguous_provider` for every entry involved, R006). `selected` follows the activation policy: under `all-or-nothing` only a real failure empties it, never `unsupported_contribution` (R005, R017). Each contribution ends `projected`, `reported` or `withheld` (projectable, but its entry was not selected). Only selected entries reach the plan.

The plan (`generation`, `runDir`, `argv`, `env`, `secrets`, `files`) is complete by itself (R025): files live under the run directory, links must point inside an entry root of the generation (never a pointer such as `active/`, R001, or a user-global location), and `env` is the whole environment apart from secrets; the SDK never merges the host's environment. The only absolute paths in a plan are the run directory and the entry roots the host passed in, so the same generation is projected again on another machine with that machine's roots and run directory. Secrets never appear as values: the plan carries `{entry, input, env}` references, adapters write references to the environment variable (`context.secretEnv(input)`), and `projection.launchEnv(plan, lookup)` builds the environment at launch. An adapter defect (a file outside the run directory, a link outside the generation, two files at one path) throws a `TypeError` instead of producing a plan.

`projection.writeRunDir(plan, dir)` materializes the plan into its run directory, which must not exist or be empty; it refuses a non-empty (live) directory and builds the tree in a sibling staging directory that it renames into place.

### Host lock (SDK extension)

HCS has no schema for host-owned settings (HCS-0008 OQ-0008-2), so the host lock is an SDK extension pending an HCS proposal. It is a JSON object owned by the host, never by catalog content:

```json
{
  "format": "x-hcs-sdk-host-lock/0.1",
  "reserved": ["skill/host-help", "permission/bash"],
  "allow": { "mcp-server": ["io.example/search"] },
  "ceilings": { "permission/bash": "ask" },
  "secrets": [{ "entry": "dev.example.search", "input": "SEARCH_TOKEN", "env": "HCS_SECRET_SEARCH" }],
  "env": { "HOME": "/run/hcs/gen-7-a/home" },
  "argv": ["--no-user-config"]
}
```

| Member | Meaning |
|---|---|
| `format` | required, `x-hcs-sdk-host-lock/0.1` |
| `reserved` | engine-level names the host owns; contributions may only narrow them (R007) |
| `allow` | per contribution kind, the identities that may be projected; an unlisted kind is open, `[]` admits nothing |
| `ceilings` | per permission name, the widest level (`deny` < `ask` < `allow`) a contribution may set; removing or widening it is refused |
| `secrets` | when present, the only secret grants delivered, each with its environment variable name |
| `env`, `argv` | host-owned environment and arguments placed first in every plan; a contribution that sets a host-owned variable is refused. Host-owned components such as hooks or guards belong here or in the adapter, not in catalog content |

`projection.validateHostLock(value)` lists problems, `projection.readHostLock(text)` parses and validates, and `projection.lockWidenings(previous, next)` lists every way a replacement lock is looser (released names, wider allow-lists or ceilings, more secrets); a host keeps its lock tighten-only by refusing a replacement with any widening.
