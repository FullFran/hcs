# The Update Framework (TUF)

| Field | Value |
| --- | --- |
| Owner | TUF project (CNCF); editors listed in the spec header |
| Version pinned | Specification 1.0.37 (document date 2026-10-08) |
| Source pinned | theupdateframework/specification@v1.0.37 (`d4cb70582ba507b9265672792c0fc8a5f390b851`), file `tuf-spec.md` |
| Access date | 2026-11-06 |
| License | Community Specification License 1.0 (`LICENSE.md` in the repo) |
| Maturity | Stable living spec ("Status: LS"); CNCF Graduated [U] not re-checked in this pass |
| HCS action | adopt properties, not the wire format: HCS-0001 borrows the targets-entry `length` + `hashes` idea; DISTRO-1 adopts TUF roles/expiry/versioning (or TUF itself) for signed catalog metadata |

## What it defines
A framework for securing software update systems: a repository layout, four mandatory signed metadata roles plus an optional mirrors role, a deterministic client update workflow, and the attacks that workflow defeats. It is deliberately agnostic to the payload ("target files") and to the serialization; the JSON shown in the spec is illustrative, with signatures computed over OLPC "canonical JSON". Concrete encodings belong in POUF documents.

## Key objects and fields
- Signed envelope: `{"signed": ROLE, "signatures": [{"keyid", "sig"}]}`; `keyid` is the hex SHA-256 of the canonical key form and MUST be unique within `signatures`.
- Common role fields: `_type`, `spec_version` (SemVer string; clients MUST check it matches what they expect), `version` (integer > 0; clients MUST NOT accept a lower version than the trusted one), `expires` (date-time; clients MUST NOT trust expired metadata).
- `root.json`: `consistent_snapshot` (optional boolean), `keys`, `roles` (`root`, `targets`, `snapshot`, `timestamp` required; `mirrors` optional), each with `keyids` and `threshold` (>= 1).
- `targets.json` and delegated targets: `targets` map of `TARGETPATH` -> `{ "length": <int bytes>, "hashes": {<alg>: <hexdigest>}, ("custom": {...}) }`.
- `delegations`: `keys`, `roles[]` with `name`, `keyids`, `threshold`, exactly one of `paths` or `path_hash_prefixes`, and `terminating`.
- `snapshot.json` `meta` (METAFILES): per metadata file `version`, optional `length`, optional `hashes`; if `hashes` is omitted, `version` alone MUST identify the file.
- `timestamp.json`: points at the current snapshot with `version` (and optional `length`/`hashes`).

### Digest format (for HCS-0001)
- `hashes` is a JSON object keyed by a hash-function name string, value = lowercase hex digest, e.g. `{"sha256": "<hex>"}`. One or more entries.
- The spec gives `sha256` as the example key but defines no registry of algorithm names; names are whatever the deployment agrees on.
- `length` is an integer byte count; clients download at most `length` bytes (endless-data defence) and then verify `hashes`.

## Extension points
- `custom` object on each target entry: opaque to TUF, delivered to the application (versions, dependencies, requirements, etc.).
- TAPs (TUF Augmentation Proposals) extend the spec; POUFs document a concrete implementation's format and protocol.
- The spec does not state a general rule for unknown top-level fields (none found in this pass) [U].

## Where HCS references it instead of redefining
- HCS-0001 `contentHash` + `size` mirror TUF's targets `hashes` + `length` integrity property; HCS cites TUF as the origin and MUST NOT claim TUF conformance from these two fields alone.
- DISTRO-1 requires TUF's protections (rollback, indefinite freeze, mix-and-match, fast-forward, endless data, threshold signing) over the catalog; it SHOULD reference TUF roles and the client workflow rather than restating them.
- If DISTRO-1 carries HCS entries inside TUF targets, HCS-specific data goes in `custom`, not in new top-level fields.
- HCS-0006 errors for "expired", "rollback", "threshold not met" map to TUF client-workflow failures; HCS names the error codes, TUF defines when they occur.

## Pitfalls for HCS
- Hash + size alone gives integrity of one file, not freshness: without signed `version` + `expires` + snapshot/timestamp, HCS gets none of the rollback/freeze/mix-and-match guarantees.
- `hashes` is an object, not a prefixed string. HCS's single `algorithm:hex` string must be converted (`sha256:abc` <-> `{"sha256":"abc"}`); define the mapping explicitly.
- Unregistered algorithm keys: HCS must fix its own allowed set (at least `sha256`).
- Canonical JSON (OLPC) differs from RFC 8785 JCS; do not assume one signature-input format interoperates with the other.
- With consistent snapshots, target files are fetched as `HASH.FILENAME.EXT`; HCS distribution paths must not collide with that naming.

## Sources
- https://github.com/theupdateframework/specification/blob/v1.0.37/tuf-spec.md (read 2026-11-06)
- https://github.com/theupdateframework/specification/releases/tag/v1.0.37 (read 2026-11-06)
- https://theupdateframework.github.io/specification/latest/ (rendered spec, link only; content read from the repo file)
