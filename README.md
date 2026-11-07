# HCS · Harness Composition Specification

**Status:** draft, pre-0.1. Nothing here is a published standard; pre-releases are tagged `v0.1.0-draft.N`.

HCS defines how an agent harness composes plugins: manifest, capabilities,
dependency resolution, lifecycle, authority (plugins request, the host grants),
typed errors, distribution and conformance. It reuses existing standards
instead of replacing them (MCP for tools, ACP for client/agent, Agent Skills
for procedures, OpenTelemetry for telemetry, TUF-style properties for
distribution metadata).

## Rules for growing this repo

1. **Need-driven.** A requirement enters HCS only when a real harness needs it.
   The first host is the first consumer; a second, independent host is expected.
2. **Schema is the source of truth.** Normative prose lives in `spec/`
   (MUST/SHOULD/MAY per RFC 2119/8174); machine-readable contracts live in
   `schemas/` (JSON Schema 2020-12). Language SDKs are generated from the
   schemas, never the other way around.
3. **No claim without a test.** Every MUST gets a case in `conformance/`.
   HCS is not called a standard until two independent hosts pass the same
   profile.
4. **Specification versus distribution.** Anything every harness would need
   belongs here. Product decisions (for example a host's privacy guards or
   trust tiers) belong to the distribution, under an `x-<distribution>`
   extension namespace.
5. **Clean provenance.** No code copied from private or third-party projects.
   Consumers adopt HCS by pinning a released version.
6. **Quarterly kill review.** If an existing standard covers what HCS
   covers, adopt it and migrate.

## Planned layout

```txt
spec/          HCS-NNNN-*.md normative documents
schemas/       versioned JSON Schemas
conformance/   runner, valid and invalid fixtures
sdk/ts/        generated types and host interfaces (when needed)
sdk/rust/      generated types (when needed)
examples/
docs/adr/
```

## First milestone (HCS 0.1)

`HCS-0001` catalog manifest: only the fields a desired-state distribution
needs today (id, version, contributions, content hash and size, compatibility),
with its JSON Schema and conformance fixtures.

## Current state

- [docs/architecture.md](docs/architecture.md): how the documents fit together, with diagrams.
- `docs/standards/`: pinned notes on every external standard HCS touches.
- `spec/`: Draft HCS-0000 (conventions), HCS-0001 (catalog manifest),
  HCS-0002 (capability ids), HCS-0003 (resolution), HCS-0004 (lifecycle),
  HCS-0005 (authority), HCS-0006 (typed errors), HCS-0007 (signed catalog
  distribution, the DISTRO-1 profile), HCS-0008 (host adapter: projecting a
  generation into an agent engine; Provisional). Each lists its open questions.
- `docs/research/lf-fit-distro-1-and-core-0.md`: how the DISTRO-1 and CORE-0
  changes fare against Linux Foundation practice.
- `docs/research/host-adapter-standards.md` and `lf-fit-host-adapter.md`: the
  standards behind HCS-0008 and its Linux Foundation fit.
- [CONTRIBUTING.md](CONTRIBUTING.md): how a requirement enters HCS, DCO.
- `schemas/`, `conformance/`, `requirements/`: schemas, cases, the
  reference runner and the CORE-0 and DISTRO-1 profiles
  ([conformance/README.md](conformance/README.md)).
- `docs/adr/`: design decisions behind the drafts.

## How to pin HCS

A consumer pins one exact release tag and vendors its artefact. Releases are
tagged `vMAJOR.MINOR.PATCH[-draft.N]` (HCS-0000 section 5); a tag never moves.
Do not use a git submodule (it ties your build to this repository's history and
hides the version change inside a pointer) and do not track `main` (it holds
unreleased drafts that change without notice).

The release attaches `hcs-<version>.tar.gz` and `hcs-<version>.tar.gz.sha256`.
The archive holds `spec/`, `schemas/`, `conformance/` (cases, `case.schema.json`,
profiles, reference runner), `requirements/requirements.json`, `LICENSE`,
`index.json` and `SHA256SUMS` (one line per file, `sha256sum -c` format).

1. **Pin the tag and its digest.** Record the version and the tarball sha256
   from the release notes in your repository (for example in your sync script),
   so a changed download fails instead of being accepted.
2. **Vendor and verify.**

   ```sh
   V=0.1.0-draft.1
   EXPECTED=<tarball sha256 from the release notes>
   curl -fsSLO "https://github.com/FullFran/hcs/releases/download/v$V/hcs-$V.tar.gz"
   echo "$EXPECTED  hcs-$V.tar.gz" | sha256sum -c -
   mkdir -p vendor/hcs
   tar -xzf "hcs-$V.tar.gz" -C vendor/hcs && mv "vendor/hcs/hcs-$V" "vendor/hcs/$V"
   (cd "vendor/hcs/$V" && sha256sum -c --quiet SHA256SUMS)   # macOS: shasum -a 256 -c
   ```

   The archive is reproducible: `python3 tools/build_release.py --version $V
   --ref v$V` on a checkout of this repository gives the same bytes, so the
   digest can be checked independently of the download.
3. **Commit the vendored tree** (`vendor/hcs/<version>/`) as it is. Never edit
   files under it; re-run `sha256sum -c SHA256SUMS` in CI to keep it intact.
4. **Run the conformance cases in your test suite.** `index.json` lists every
   case with its `requirements`, `level` and `polarity` (`valid`/`invalid`),
   the profiles with their requirement ids, the schemas by `$id` and the
   documents with `status`, `version` and `provisional`. Select the cases of the
   profile you implement, feed each case's `input` to your implementation and
   compare with its `expect`. `python3 vendor/hcs/<version>/conformance/runner/run.py`
   (needs `jsonschema>=4.18`) runs the reference semantics on the same cases;
   `host`-level cases are reported `pending` until a system-under-test
   interface exists (#20).
5. **One pull request per HCS release.** Bump `V` and the digest, vendor the
   new directory, remove the old one, read the release notes (pre-releases may
   change incompatibly) and fix what the new cases reject in the same pull
   request.

`index.json` has `indexFormat: 1`; a new member is added without a format
change, a removed or renamed member bumps it.

Maintainers build the artefact with `python3 tools/build_release.py --version
<version>` (output in `dist/`, ignored by git); `--check` builds twice and
fails unless the bytes match. Release notes live in `docs/releases/`.

## License

Apache License 2.0. See [LICENSE](LICENSE). Copyright 2026 FullFran.
