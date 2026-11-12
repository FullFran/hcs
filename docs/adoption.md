# Adopting HCS in a harness

HCS informs a harness; it does not block it (README rule 3). The usual path, with the optional [consumer kit](../tools/consumer-kit/README.md):

1. **Pin and vendor one release.** Download the tarball of a `v0.1.0-draft.N` release, check it against `SHA256SUMS`, vendor it under `vendor/hcs/<version>/` and record `PIN.json`. The kit's `sync` and `verify` commands do this without dependencies.
2. **Measure your system.** Implement the `--sut` process protocol ([conformance/README.md](../conformance/README.md#system-under-test)) and run the vendored runner with `--report`.
3. **Record where you differ and guard against regression.** List deliberate differences and features you do not implement in `divergences.json`, commit a baseline, and let CI fail only when a case gets worse than the baseline.

The kit is non-normative: no requirement of HCS depends on it, and you can replace any part of it.
