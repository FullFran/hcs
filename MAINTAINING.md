# Maintaining HCS

What keeping HCS going costs, and where the details are.

## A release in three steps

1. `python3 tools/release.py prepare 0.1.0-draft.12` sets the SDK version and writes
   `docs/releases/v0.1.0-draft.12.md`; replace its `TODO(release)` lines.
2. Open one pull request with those three files and merge it when CI is green.
3. `git fetch origin && git tag v0.1.0-draft.12 origin/main && git push origin v0.1.0-draft.12`.

The tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): checks, reproducible
build, SDK pack, release notes with the sha256 table, GitHub release, download check. Details,
rehearsals and what to do when it fails: [docs/releasing.md](docs/releasing.md).

## What CI checks

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and on `main`, on
Linux, Windows and macOS:

- `extract_requirements.py --check`: `requirements/` matches the `**[HCS-NNNN-RMMM]**` lines of the
  specs.
- `conformance/runner/run.py --selftest`: every conformance case is well formed and the reference
  functions give the expected results.
- TypeScript SDK: typecheck, tests (including the SDK's own run of the conformance cases) and build.

A pull request that changes the release machinery also rehearses a release (see above).

## How a consumer bumps

A consumer vendors one release with the [consumer kit](tools/consumer-kit/README.md):

1. `python3 kit/hcs_kit.py sync <version> <sha256 of hcs-<version>.tar.gz>` (the sha256 is the
   `.sha256` asset or the table in the release notes); it refuses any byte that does not match.
2. Run its conformance report against the new vendored runner and `compare` it with its
   baseline; only a case that gets worse fails. Read "Changes a host must make" in the notes.
3. If it uses the SDK, `npm install` the tarball URL at the end of the release notes.

Then it commits the vendored tree, `PIN.json`, the new baseline and the lockfile together.
