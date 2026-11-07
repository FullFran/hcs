#!/usr/bin/env python3
"""Build the versioned HCS release artefact reproducibly.

Usage:
  python3 tools/build_release.py --version 0.1.0-draft.1 [--ref HEAD] [--out dist] [--check]

The artefact is built from the committed tree at --ref (never from the working tree), so the
same commit and version always give the same bytes. It writes:

  <out>/hcs-<version>/                 the artefact tree (what a consumer vendors)
    LICENSE
    index.json                         machine-readable index (documents, schemas, requirements,
                                       profiles, cases, runner)
    SHA256SUMS                         sha256 of every other file in the tree, `sha256sum -c` format
    spec/ schemas/ conformance/ requirements/ tools/extract_requirements.py
  <out>/hcs-<version>.tar.gz           the same tree; fixed mtime, owner and mode, sorted members
  <out>/hcs-<version>.tar.gz.sha256    `sha256sum -c` line for the tarball

--check builds twice into temporary directories and fails unless both builds are byte-identical.
No dependencies beyond Python 3.10+ and git.
"""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
INCLUDE = ["LICENSE", "spec", "schemas", "conformance", "requirements", "tools/extract_requirements.py"]
SEMVER = re.compile(r"^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$")
HEADER_ROW = re.compile(r"^\| ([^|]+?) \| (.+?) \|$")
INDEX_FORMAT = 1


def git(*args, binary=False):
    out = subprocess.run(["git", "-C", str(ROOT), *args], check=True, capture_output=True)
    return out.stdout if binary else out.stdout.decode()


def read_tree(ref):
    """Return {path: bytes} for INCLUDE at ref, from git's object store."""
    data = git("archive", "--format=tar", ref, "--", *INCLUDE, binary=True)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            if member.isfile():
                files[member.name] = tar.extractfile(member).read()
            elif not member.isdir():
                sys.exit(f"unsupported member type in release tree: {member.name}")
    return files


def document_entry(path, text):
    lines = text.splitlines()
    title = re.match(r"^# (HCS-\d{4}) (.+)$", lines[0])
    if not title:
        sys.exit(f"{path}: first line is not '# HCS-NNNN <title>'")
    fields = {}
    for line in lines[1:]:
        if not line.startswith("|"):
            if fields:
                break
            continue
        m = HEADER_ROW.match(line)
        if m and m.group(1) not in ("Field", "---"):
            fields[m.group(1)] = m.group(2)
    entry = {
        "id": title.group(1),
        "title": title.group(2),
        "path": path,
        "status": fields["Status"],
        "version": fields["Version"],
        "provisional": fields.get("Provisional", "no").startswith("yes"),
    }
    if "Superseded when" in fields:
        entry["supersededWhen"] = fields["Superseded when"]
    return entry


def build_index(version, files):
    documents = [document_entry(p, files[p].decode()) for p in sorted(files)
                 if p.startswith("spec/HCS-") and p.endswith(".md")]
    schemas = []
    for p in sorted(files):
        if p.endswith(".schema.json"):
            schemas.append({"$id": json.loads(files[p])["$id"], "path": p})
    reqs = json.loads(files["requirements/requirements.json"])["requirements"]
    profiles = []
    for p in sorted(files):
        if p.startswith("conformance/profiles/") and p.endswith(".json"):
            doc = json.loads(files[p])
            profiles.append({"profile": doc["profile"], "status": doc["status"], "hcsVersion": doc["hcsVersion"],
                             "path": p, "requirements": doc["requirements"]})
    cases = []
    for p in sorted(files):
        if p.startswith("conformance/cases/") and p.endswith(".json"):
            doc = json.loads(files[p])
            polarity = pathlib.PurePosixPath(p).parent.name
            cases.append({"path": p, "requirements": doc["requirements"], "level": doc["level"],
                          "polarity": polarity})
    major, minor = version.split(".")[:2]
    return {
        "indexFormat": INDEX_FORMAT,
        "release": version,
        "hcsVersion": f"{major}.{minor}",
        "documents": documents,
        "schemas": schemas,
        "requirements": {
            "path": "requirements/requirements.json",
            "items": [{"id": r["id"], "document": r["document"], "keyword": r["keyword"]} for r in reqs],
        },
        "profiles": profiles,
        "conformance": {
            "caseSchema": json.loads(files["conformance/case.schema.json"])["$id"],
            "cases": cases,
        },
        "runner": {
            "path": "conformance/runner/run.py",
            "requires": ["python>=3.10", "jsonschema>=4.18"],
            "command": "python3 conformance/runner/run.py [--report PATH] [-v]",
        },
    }


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def build(version, ref, out):
    files = read_tree(ref)
    files["index.json"] = (json.dumps(build_index(version, files), indent=2, ensure_ascii=False) + "\n").encode()
    files["SHA256SUMS"] = "".join(f"{sha256(files[p])}  {p}\n" for p in sorted(files)).encode()

    name = f"hcs-{version}"
    tree = out / name
    if tree.exists():
        shutil.rmtree(tree)
    for path, data in files.items():
        target = tree / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.PAX_FORMAT) as tar:
        dirs = {str(parent) for p in files for parent in pathlib.PurePosixPath(name, p).parents
                if str(parent) != "."}
        members = [(d, None) for d in dirs] + [(f"{name}/{p}", files[p]) for p in files]
        for arcname, data in sorted(members, key=lambda m: m[0]):
            info = tarfile.TarInfo(arcname)
            info.mtime, info.uid, info.gid, info.uname, info.gname = 0, 0, 0, "", ""
            if data is None:
                info.type, info.mode = tarfile.DIRTYPE, 0o755
                tar.addfile(info)
            else:
                info.size, info.mode = len(data), 0o644
                tar.addfile(info, io.BytesIO(data))
    tgz = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=tgz, mtime=0, compresslevel=9) as gz:
        gz.write(raw.getvalue())
    archive = out / f"{name}.tar.gz"
    archive.write_bytes(tgz.getvalue())
    (out / f"{name}.tar.gz.sha256").write_text(f"{sha256(tgz.getvalue())}  {archive.name}\n")
    return archive, files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", required=True, help="SemVer 0.MINOR.PATCH[-prerelease] (HCS-0000 section 5)")
    ap.add_argument("--ref", default="HEAD", help="git ref to build from (default HEAD)")
    ap.add_argument("--out", default=str(ROOT / "dist"), help="output directory (default dist/)")
    ap.add_argument("--check", action="store_true", help="build twice and fail unless byte-identical")
    args = ap.parse_args()
    if not SEMVER.match(args.version):
        sys.exit(f"--version {args.version!r} is not SemVer 0.MINOR.PATCH[-prerelease] (HCS-0000 section 5)")

    if args.check:
        digests = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as tmp:
                archive, _ = build(args.version, args.ref, pathlib.Path(tmp))
                digests.append(sha256(archive.read_bytes()))
        if digests[0] != digests[1]:
            sys.exit(f"not reproducible: {digests[0]} != {digests[1]}")
        print(f"reproducible: hcs-{args.version}.tar.gz sha256 {digests[0]}")
        return

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    archive, files = build(args.version, args.ref, out)
    print(f"built {archive} ({len(files)} files) from {args.ref}")
    print((out / f"{archive.name}.sha256").read_text(), end="")


if __name__ == "__main__":
    main()
