# WASI + WebAssembly Component Model + WIT

| Field | Value |
| --- | --- |
| Owner | WASI Subgroup of the W3C WebAssembly Community Group (WASI); W3C WebAssembly CG (Component Model, WIT); Bytecode Alliance tooling (Wasmtime, wasm-tools) |
| Version pinned | WASI v0.3.2 (GitHub release 2026-10-13); Component Model: no tagged release, pinned by commit |
| Source pinned | WebAssembly/WASI@v0.3.2 (commit bdadbbb8cadd287cc5014c4b5a0bf76efc60291c); WebAssembly/component-model@d230073ce81c6634f175b4d0c5ad900b5253f1f4 (`main`, `design/mvp/WIT.md`) |
| Access date | 2026-11-06 |
| License | WASI repo `LICENSE.md`: contributions under the W3C Community Contributor License Agreement (CLA), published by the WebAssembly CG. component-model repo `LICENSE`: all files Apache-2.0 unless a subdirectory says otherwise. |
| Maturity | Pre-standard: CG work, not a W3C Recommendation. WASI 0.3 is "the current preview"; WASI 0.2 and 0.1 (Preview 1) remain in use. |
| HCS action | profile (ISOLATION-1, optional backend; later). Out of CORE-0. |

## What it defines

- **Component Model**: a binary and text format for components (modules wrapped with typed
  imports and exports), a Canonical ABI for passing high-level values across component
  boundaries, linking, and (for 0.3) native async with `future` and `stream` types.
- **WIT** (Wasm Interface Type): an IDL for interfaces and worlds that components implement.
- **WASI**: a modular set of WIT packages (`wasi:cli`, `wasi:clocks`, `wasi:filesystem`,
  `wasi:http`, `wasi:random`, `wasi:sockets` in the v0.3.2 tree) providing system APIs.

## Key objects and fields

- Package name: `namespace:package@version`, e.g. `wasi:cli@0.3.2`; version is optional full
  semver. Grammar: `package-decl ::= 'package' ( id ':' )+ id ( '/' id )* ('@' valid-semver)?`
  (nested namespaces are a gated, not-yet-MVP feature).
- `interface <id> { ... }`: named group of functions and types.
- `world <id> { ... }`: the full contract of a component: `import` and `export` items,
  `include` of other worlds, `use` of types. Example: `wasi:cli` world `command` includes
  `imports` and exports `run`.
- Identifiers: kebab-case labels; `%` prefix escapes keywords.
- Feature gates on items: `@since(version = ...)`, `@unstable(feature = ...)`,
  `@deprecated(version = ...)`.
- Capability model: a component can only reach what its world imports and the host supplies
  (e.g. `wasi:filesystem` `preopens`); there is no ambient authority by default.

## Extension points

- New WIT packages under any namespace (non-`wasi` namespaces for vendors).
- `@unstable` feature gates for in-progress items; new WASI APIs go through the WASI proposal
  process (`docs/Proposals.md`, proposal template repo).
- `@external-id(...)` attribute on import/export items (flagged with a feature marker in WIT.md [U: marker meaning not checked]).

## Where HCS references it instead of redefining

- ISOLATION-1 MAY list `wasi-component` as an isolation backend; the plugin's contract is its
  WIT world identified by package name (`ns:pkg@version`) plus world name. HCS MUST NOT
  restate WIT types, the Canonical ABI or WASI interfaces.
- HCS-0005 authority: for a WASI backend, host grants map to which world imports the host
  links (filesystem preopens, sockets, http). HCS defines the grant record; WASI defines the
  capability surface. [I]
- HCS-0001 contribution kinds MAY carry an opaque `wasm-component` kind whose content is a
  component binary; HCS only hashes and sizes it.
- HCS-0002 capability IDs are not WIT package names; a mapping MAY be declared, but HCS
  capability versions stay independent from WIT semver. [I]

## Pitfalls for HCS

- WIT `@version` is per-package semver, not a WASI release number; WASI v0.3.2 ships packages
  at `@0.3.2` while items carry `@since(version = 0.3.0)`.
- 0.2 and 0.3 are not ABI-compatible (0.3 replaces explicit streams/polling with native async);
  a backend must declare which preview it hosts.
- Isolation strength depends on the runtime (Wasmtime, etc.), not on the spec. Negative tests
  in ISOLATION-1 must run against the real runtime. [I]
- Do not confuse WIT (Wasm Interface Type) with SPIFFE "WIT-SVID" (Workload Identity Token).

## Sources

- https://github.com/WebAssembly/WASI/tree/v0.3.2 (README.md, LICENSE.md, `proposals/`)
- https://github.com/WebAssembly/WASI/releases/tag/v0.3.2
- https://github.com/WebAssembly/component-model/blob/d230073ce81c6634f175b4d0c5ad900b5253f1f4/design/mvp/WIT.md
- https://github.com/WebAssembly/component-model/blob/main/LICENSE
- https://www.w3.org/community/about/agreements/cla/
