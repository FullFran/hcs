# Releasing HCS

How a maintainer publishes a release. It writes down what releases v0.1.0-draft.7 to draft.11 did.
A release is the tag `v<version>` (HCS-0000 section 5) plus a GitHub release with three assets. A tag
never moves: a mistake is fixed by a new release.

## Before

- `main` holds every change of the release, merged through pull requests, with CI green.
- Pick the version: `0.MINOR.PATCH[-draft.N]`, the next `draft.N` while HCS is a draft.

## Steps

`V` is the version (for example `0.1.0-draft.11`).

1. **Bump the SDK version.** A pull request with only `sdk/ts/package.json` and
   `sdk/ts/package-lock.json` (`npm version $V --no-git-tag-version` in `sdk/ts`), titled
   `chore(sdk): bump version to $V`. Merge it; its commit on `main` is the release commit (`REF`).
2. **Build the artefact** at that commit, outside the repository:

   ```sh
   python3 tools/build_release.py --version $V --ref $REF --out $OUT --check
   python3 tools/build_release.py --version $V --ref $REF --out $OUT
   ```

   `--check` must report the archive reproducible. The build fails on a broken relative link or a
   path Windows cannot create; fix it on `main` first.
3. **Tag the release commit** and push the tag: `git tag v$V $REF && git push origin v$V`
   (a lightweight tag, as every earlier release).
4. **Pack the SDK at the tag**: in a checkout of `v$V`, `cd sdk/ts && npm ci && npm run build &&
   npm pack --pack-destination $OUT`.
5. **Write the release notes** in `docs/releases/v$V.md`, following the previous one: what kind of
   release it is, the sha256 of `hcs-$V.tar.gz`, `SHA256SUMS`, `index.json` and the SDK tarball, the
   build command with its `--ref`, the changes a host must make, what changed (artefact,
   specification and conformance with case and requirement counts, SDK) and the SDK install line.
6. **Publish** the GitHub release from the tag, as a pre-release while the version is a draft:

   ```sh
   gh release create v$V --verify-tag --prerelease --title "HCS v$V" \
     --notes-file docs/releases/v$V.md \
     $OUT/hcs-$V.tar.gz $OUT/hcs-$V.tar.gz.sha256 $OUT/fullfran-hcs-sdk-$V.tgz
   ```

7. **Check the download**: fetch `hcs-$V.tar.gz` from the release and compare its sha256 with the notes.
8. **Merge the notes**: a pull request with `docs/releases/v$V.md`, titled
   `docs(release): notes for v$V`.
