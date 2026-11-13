#!/usr/bin/env python3
"""Release helpers for HCS maintainers (see docs/releasing.md).

Usage:
  python3 tools/release.py prepare <version>   set the SDK version and create docs/releases/v<version>.md
  python3 tools/release.py check <version>     fail unless the tree is ready to tag as v<version>
  python3 tools/release.py notes <version> --dist <dir> --ref <commit>
                                               print the GitHub release body: the notes file with the
                                               generated artefact table and SDK install line

`prepare` edits only sdk/ts/package.json, sdk/ts/package-lock.json and the new notes file; it never
commits, tags or publishes. `check` and `notes` are what the release workflow runs.
No dependencies beyond Python 3.10+.
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SDK = ROOT / "sdk" / "ts"
RELEASES = ROOT / "docs" / "releases"
REPO_URL = "https://github.com/FullFran/hcs"
SEMVER = re.compile(r"^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$")
# Where `notes` puts the generated sections; without it they go at the end.
MARKER = "<!-- release:artefact -->"
# Left in the skeleton by `prepare`; `check` refuses notes that still hold it.
TODO = "TODO(release)"

SKELETON = f"""# HCS v{{version}}

{TODO}: what kind of release this is (artefact, specification or SDK), whether instance documents
keep `"hcsVersion": "0.1"`, and why it exists, in a few sentences.

{MARKER}

## Changes a host must make

{TODO}: what a host or consumer changes in code or records, or "None".

## What changed

### Artefact

- {TODO}

### Specification and conformance

- {TODO}: changes, with case and requirement counts (see `index.json` of the build).

### SDK

- Version {{version}}.
- The SDK still requires Node 24 or later.
"""


def fail(message):
    sys.exit(f"release: {message}")


def valid_version(version):
    if not SEMVER.match(version):
        fail(f"{version!r} is not SemVer 0.MINOR.PATCH[-prerelease] (HCS-0000 section 5)")
    return version


def notes_path(version):
    return RELEASES / f"v{version}.md"


def write_json(path, value):
    # npm's own layout: two-space indent and a final newline.
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def prepare(version):
    package_path, lock_path = SDK / "package.json", SDK / "package-lock.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    package["version"] = version
    lock["version"] = version
    lock["packages"][""]["version"] = version
    write_json(package_path, package)
    write_json(lock_path, lock)
    notes = notes_path(version)
    if notes.exists():
        print(f"kept {notes.relative_to(ROOT)} (already exists)")
    else:
        notes.write_text(SKELETON.format(version=version), encoding="utf-8")
        print(f"wrote {notes.relative_to(ROOT)}: replace every {TODO}")
    print(f"set the SDK version to {version}")
    print("next: open one pull request with these files, merge it, then tag the merge commit:")
    print(f"  git tag v{version} <merge commit> && git push origin v{version}")


def check(version):
    problems = []
    for path in (SDK / "package.json", SDK / "package-lock.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        found = [data.get("version")] + ([data["packages"][""].get("version")] if "packages" in data else [])
        if any(v != version for v in found):
            problems.append(f"{path.relative_to(ROOT)} has version {found}, not {version}")
    notes = notes_path(version)
    if not notes.exists():
        problems.append(f"{notes.relative_to(ROOT)} is missing: run `python3 tools/release.py prepare {version}`")
    else:
        text = notes.read_text(encoding="utf-8")
        if TODO in text:
            problems.append(f"{notes.relative_to(ROOT)} still holds {TODO}")
        for heading in ("## Artefact", "## Install the SDK"):
            if re.search(rf"^{heading}\s*$", text, re.M):
                problems.append(f"{notes.relative_to(ROOT)} has a '{heading}' section: the release workflow writes it")
    if problems:
        fail("not ready to release v" + version + ":\n  " + "\n  ".join(problems))
    print(f"ready to release v{version}")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def notes(version, dist, ref):
    check(version)
    dist = pathlib.Path(dist)
    sdk_tgz = f"fullfran-hcs-sdk-{version}.tgz"
    files = {
        f"hcs-{version}.tar.gz": dist / f"hcs-{version}.tar.gz",
        f"hcs-{version}/SHA256SUMS": dist / f"hcs-{version}" / "SHA256SUMS",
        f"hcs-{version}/index.json": dist / f"hcs-{version}" / "index.json",
        sdk_tgz: dist / sdk_tgz,
    }
    missing = [str(p) for p in files.values() if not p.is_file()]
    if missing:
        fail("missing build outputs:\n  " + "\n  ".join(missing))
    count = sum(1 for p in (dist / f"hcs-{version}").rglob("*") if p.is_file())
    rows = "\n".join(f"| `{name}` | `{sha256(path)}` |" for name, path in files.items())
    generated = f"""## Artefact

| File | sha256 |
| --- | --- |
{rows}

Built with `python3 tools/build_release.py --version {version} --ref {ref[:7]}`
(`--check`: byte-identical across two builds; {count} files). The SDK tarball is `npm run build` and
`npm pack` of `sdk/ts` at the tag.
"""
    install = f"""## Install the SDK

```sh
npm install {REPO_URL}/releases/download/v{version}/{sdk_tgz}
```
"""
    text = notes_path(version).read_text(encoding="utf-8").rstrip("\n") + "\n"
    if MARKER in text:
        text = text.replace(MARKER, generated.rstrip("\n"))
    else:
        text += "\n" + generated
    text += "\n" + install
    sys.stdout.write(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)
    for name in ("prepare", "check", "notes"):
        p = sub.add_parser(name)
        p.add_argument("version", type=valid_version)
        if name == "notes":
            p.add_argument("--dist", required=True, help="output directory of build_release.py and npm pack")
            p.add_argument("--ref", required=True, help="commit the artefact was built from")
    args = ap.parse_args()
    if args.command == "prepare":
        prepare(args.version)
    elif args.command == "check":
        check(args.version)
    else:
        notes(args.version, args.dist, args.ref)


if __name__ == "__main__":
    main()
