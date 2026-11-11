# HCS conformance

Cases are data (`case.schema.json`), one file per case, in `cases/<document>/<requirement-id>/{valid,invalid}/`. The directory gives the polarity ([ADR-0001](../docs/adr/0001-requirement-ids-and-case-polarity.md)).

| Level | Executed by the reference runner | What it checks |
| --- | --- | --- |
| `document` | yes | a JSON document (`input`, or its exact bytes in `documentBase64`) against an HCS schema (`target`), plus semantic checks: `hcsVersion` first, duplicate entry ids, problem-details `type`/code equality |
| `integrity` | yes | `size` and `contentHash` against base64 bytes, then optional `contentId` against the bounded uncompressed tar stream (HCS-0001-R007/R018) |
| `resolution` | yes | the HCS-0003 algorithm: activation order and typed errors |
| `authority` | yes | the HCS-0005 evaluation: grants, stored denials (a matching denial wins) and session limits |
| `distribution` | yes | HCS-0007: signature input, key set and envelope verification with fixture keys and a stated clock |
| `projection` | yes | HCS-0008: the reference projection of a generation (`runner/projection.py`): errors per entry and the entries the host may report active |
| `recovery` | yes | HCS-0008 section 7.1: the reference decision after a restart (`runner/recovery.py`): from the persisted facts, the action (`start`, `health-check`, `discard-pending`, `return`, `stop-and-report`) and the generations a cleanup retains |
| `client` | yes | HCS-0006-R006: the HCS error a client extracts from a JSON-RPC response (`input.response`) or an RFC 9457 problem (`input.problem`); `expect.hcsError` is the error or `null`. Client test suites can run the same fixtures against their own parser |
| `host` | no, reported `pending` | a scenario and expected behaviour that needs a running host |

## Run

```sh
# python-jsonschema >= 4.18 (uses the `referencing` registry)
python3 -m venv .venv && .venv/bin/pip install 'jsonschema>=4.18'
.venv/bin/python tools/extract_requirements.py --check
.venv/bin/python conformance/runner/run.py --selftest [--report report.json] [-v]
.venv/bin/python conformance/runner/gen_distro1_cases.py --check

# optional second validator for schema-only verdicts
npm i --prefix /some/dir ajv@8.17.1
node conformance/runner/xcheck-ajv.mjs . /some/dir
```

The runner exits non-zero on any failing or malformed case, and when a MUST/MUST NOT requirement lacks a `valid` or an `invalid` case, or a case names an unknown requirement (HCS-0000-R001/R002).

## Integrity cases (HCS-0001)

`input.entry` gives the expected `id`, `size`, `contentHash` and optional `contentId`; `input.contentBase64` contains the fetched compressed bytes. Transport verification precedes decompression. Without `contentId`, the integrity level retains transport-only behavior (the existing valid non-gzip fixture remains valid). With it, gzip/decompression-limit failures or a mismatched identity yield `integrity_mismatch`. This level hashes exact tar bytes; it does not extract or validate archive members.

The reference runner bounds total decompressed output to 256 MiB + 10,000 × 1,023 + 1,024 bytes and hashes fixed-size chunks. Fixtures can set `input.maxUncompressedBytes` to a smaller nonnegative whole-stream cap to exercise boundaries without allocating large archives. The SDK conformance adapter applies the same fixture cap. The focused runner tests are `python3 -B -m unittest discover -s conformance/runner -p test_content_identity.py` (requires the same jsonschema dependency as the runner).

`contentId` is a draft schema addition, not a compatibility guarantee: older closed validators reject it. See HCS-0001 section 3.5 for migration and the authenticated catalog binding required for identity-based decisions.

## Distribution cases (HCS-0007)

`input.check` selects what is verified:

- `signing-input`: `payloadType` and `document`; `expect.signingInput` is the expected signature input as text, or `expect.outcome` is `invalid` when the document has no canonical form.
- `key-set`: `trustAnchor`, `keySet`, optional `lastKeySet` (`{version, digest}`) and `now`.
- `envelope`: the same plus `envelope`, `assignment` and optional `lastAccepted` (`{sequence, digest}`); the key set is verified first, then section 5.2 of HCS-0007 in order.

`input.limits` (optional, `{maxKeys, maxSignatures}`) states the bounds a host has set on the number of keys of a key set and of items of `signatures` (HCS-0007-R023); without it no bound applies.

### Cases that carry the document as text

Number spelling, a duplicated member name and an unpaired surrogate (HCS-0007 section 4, R003, R004) cannot be told apart once a document is a parsed JSON value, so a case may carry the exact bytes of the document in the optional member `documentBase64`:

- At `document` level it replaces `input`; `input` is then absent.
- At `distribution` level `input` keeps every other member and `documentBase64` replaces `input.envelope` (`check: envelope`) or `input.keySet` (`check: key-set`).
- A runner decodes the base64, parses the bytes as strict JSON text (invalid UTF-8, a syntax error, a duplicated member name, an unpaired surrogate and a number spelled other than `-?(0|[1-9][0-9]*)` are `manifest_invalid`), and only then continues as with a parsed document. The reference does this where the document is first read: the key set is read before the envelope.
- Base64 of the bytes was chosen over a JSON string because the case file is itself JSON: an unpaired surrogate cannot be a string value in every tool, a pretty-printer or a loader may merge a duplicated member name or rewrite `1.0`, and bytes are what a host receives. It is the same encoding as `contentBase64` at the integrity level. The text may use JSON escapes (`\ud800`), so a case stays easy to regenerate and to decode by hand: `base64 -d`.
- Existing cases have no `documentBase64` and are unchanged.

The cases are generated by `runner/gen_distro1_cases.py` from fixture keys derived from public seeds; they are test keys only. Ed25519 signatures are deterministic, so the generator is reproducible (`--check` fails on drift). Host-level HCS-0007 cases are written by hand. Ed25519, RFC 8785 and DSSE PAE are implemented in `runner/distro1.py` without dependencies; `--selftest` checks them against RFC 8032 test vector 1 ([ADR-0015](../docs/adr/0015-distro-1-is-a-single-envelope-tuf-profile.md)).

## Projection cases (HCS-0008)

`input` states the `generation` (entries in activation order with their contributions), `projectableKinds`, `hostOwned` engine-level names, `grantedSecrets` per entry and the `activationPolicy`; `expect` gives `errors` and `selected`. An `mcp-server` contribution with a `registryType: "file"` package also lists the regular `files` in its directory, and `hostRuntimes` lists the `runtimeHint` values the host provides (HCS-0008 6.4.1). A skill projects the engine-level name `skill/<name>`, an MCP server `mcp/<server.json name>`; extension kinds list their `settings` with an `effect` (`add`, `replace`, `remove`, `widen`, `narrow`). The reference checks only the members `server.json` requires; full MCP Registry schema validation is the adapter's.

## Recovery cases (HCS-0008)

`input.persisted` states the facts a host reconstructs after a restart as generation ids (`active`, `confirmed`, `pending`, `failed`); `input.onDisk` lists the generations whose content is present. `expect.action` is one of `start`, `health-check`, `discard-pending`, `return`, `stop-and-report`; `generation`, `returnTo`, `retain` and `failed` are optional and compared only when present. No storage format is implied. `invalid/` cases state the action or the retained set of a non-conforming host; the runner passes them when the reference decision differs from `expect`. Writes and faults (a crash between the pending record and the pointer change, a pointer that cannot be replaced) need a running host and are `host` cases.

## Profiles

`profiles/core-0.json` lists the requirement ids of the CORE-0 draft profile. `profiles/distro-1.json` lists DISTRO-1 (HCS-0007), which builds on CORE-0 and fixes the host property `activationPolicy` to `all-or-nothing`. A host claims a profile by passing every case of every listed requirement, host-level cases included; no host does yet.

A requirement enters a profile when a host can pass all of its cases, host-level ones included. Until then it stays out, and the release `index.json` lists it under `unprofiled` (each requirement also carries its `profiles` and `cases` count), so a host that selects cases by profile can still see and track it. A new profile is defined when a host can pass it, not before (README rule 3).
