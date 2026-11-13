# Maintenance automation
Objective: make maintaining HCS mechanical (CI matrix, tag-driven release, exhaustive decision tests, MAINTAINING.md).
Branches: one per PR off main; delivery: one PR per item, self-merged on green CI (authorized). Checks: CI on each PR.

## Specs
- S1 (item 1): "a release workflow triggered by pushing a tag `v*` that runs the same checks, builds the artefact with build_release.py (--check reproducibility), creates the GitHub release (prerelease for -draft.N) attaching the .tar.gz, .sha256 and the SDK .tgz, with notes taken from docs/releases/<version>.md (fail if missing)." "Decide with evidence whether the SDK is also published to npm today". "Update the documented procedure so a release is: write notes, bump version (or a script that does it), push tag." "Do not publish any release yourself."
- S2 (item 2): "add Windows and macOS to the selftest and SDK jobs (matrix), so platform breakages like nul.json fail in HCS, not in consumers. Keep it fast (cache, timeouts)."
- S3 (item 3): "for pure decision functions in the SDK (start with planRecovery in sdk/ts; find the others), a table/property test over every combination of their inputs, so they cannot break silently." "Also make HCS-0008-R032..R035 conformance cases runnable as tables if that is the reason consumers cannot run them (report what it would take if it changes spec text; spec changes follow HCS-0000)."
- S4 (item 4): "A short MAINTAINING.md: the release in 3 steps, what CI checks, how a consumer bump works."
- S5: "Verify each workflow for real (a PR run; for the tag workflow use workflow_dispatch with a dry-run input ...; never publish a real release)."

## Tasks
- T1 [S2] inline: done, PR #107 (75c5e47). Windows SDK found three defects, filed #108; their 20 tests are skipped by name on Windows.
- T2 [S1, S5] inline: release workflow with dry-run dispatch; bump script; docs/releasing.md.
- T3 [S3] inline: exhaustive tests for SDK decision functions; R032-R035 assessment.
- T4 [S4] inline: MAINTAINING.md (in the T2 PR).

## Log
- L1 (2026-11-13): task brief pasted by Fran (items 1-4, coordination with the draft.11 release, self-merge on green CI).
- L2: draft.11 is published and its procedure PR #106 is merged, so item 1 is unblocked. `npm view @fullfran/hcs-sdk` returns 404 and the release notes install the SDK from the release tarball: the SDK is not on npm, so the workflow does not publish to npm. The repository has no Actions secrets.
- L3: #107 run 43490340326 green on the three OS (Windows SDK: 230 tests, 228 pass, 0 fail). Rebuilding draft.11 at 2829836 reproduces the published sha256 of the tarball, SHA256SUMS and index.json; the SDK .tgz from npm pack does not reproduce (1bdd08... vs published d6b128...).
