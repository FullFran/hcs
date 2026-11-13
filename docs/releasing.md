# Releasing HCS

How a maintainer publishes a release. A release is the tag `v<version>` (HCS-0000 section 5) plus a
GitHub release with three assets: `hcs-<version>.tar.gz`, its `.sha256` and the SDK tarball
`fullfran-hcs-sdk-<version>.tgz`. A tag never moves: a mistake is fixed by a new release.

The SDK is not published to npm: consumers install the tarball attached to the release (the notes
end with the `npm install <url>` line). The workflow has no npm step and needs no secret.

## Steps

`V` is the version: `0.MINOR.PATCH[-draft.N]`, the next `draft.N` while HCS is a draft. `main` holds
every change of the release, merged through pull requests, with CI green.

1. **Prepare.** `python3 tools/release.py prepare $V` sets the SDK version in `sdk/ts/package.json`
   and `sdk/ts/package-lock.json` and writes `docs/releases/v$V.md` from a skeleton. Replace every
   `TODO(release)` in the notes: what kind of release it is, the changes a host must make, what
   changed (artefact, specification and conformance with case and requirement counts, SDK).
2. **Merge.** Open one pull request with those three files, titled `chore(release): prepare v$V`,
   and merge it when CI is green.
3. **Tag.** Tag the merge commit and push the tag (a lightweight tag, as every earlier release):

   ```sh
   git fetch origin && git tag v$V origin/main && git push origin v$V
   ```

The tag starts [the release workflow](../.github/workflows/release.yml). It publishes the release
in about five minutes; nothing else is manual.

## What the release workflow does

On a pushed tag `v*`:

1. `tools/release.py check $V` fails unless the SDK version is `V`, `docs/releases/v$V.md` exists,
   holds no `TODO(release)` and has no `## Artefact` or `## Install the SDK` section (the workflow
   writes those).
2. Runs the CI checks (`ci.yml`, the same jobs as a pull request, on Linux, Windows and macOS).
3. Refuses a tag whose commit is not on `main`.
4. Builds the artefact with `tools/build_release.py --check` (two builds must be byte-identical),
   then the artefact itself, and checks the `.sha256` file. The build fails on a broken relative
   link or a path Windows cannot create; fix it on `main` and tag a new version.
5. Builds and packs the SDK at the tag (`npm ci`, `npm run build`, `npm pack`).
6. Writes the release body: the notes file with the sha256 table of the tarball, `SHA256SUMS`,
   `index.json` and the SDK tarball, the build command, and the SDK install line. It goes where
   the notes hold `<!-- release:artefact -->`, or at the end.
7. Creates the GitHub release from the tag (a pre-release when the version has a `-` suffix) with
   the three assets, then downloads them and compares them byte for byte.

The built files and the body are also kept as a workflow artefact for seven days.

## Rehearsal

A pull request that changes `release.yml`, `ci.yml`, `tools/release.py` or
`tools/build_release.py`, and a manual run (`gh workflow run release.yml`), rehearse every step with
the version `0.0.0-rehearsal`: `prepare`, `check`, the build, the SDK pack and the notes. A
rehearsal never creates a tag or a release; its output is the workflow artefact.

## When something fails

- **Before the release exists** (`check`, the CI checks or the build failed): nothing was published.
  Delete the tag (`git push origin :refs/tags/v$V`), fix it on `main` and tag again.
- **After the release exists** (the download check failed): the version is spent. Delete the
  release and its tag and release the next version; never publish other bytes under a version.

The SDK tarball is not byte-reproducible across machines (`npm pack` output differs), so its
sha256 is the one the workflow published, not one a maintainer can rebuild.
