"""Tests for hcs_kit.py. A fake release is built in a temp directory; nothing touches the network.

Run: python3 -B -m unittest discover -s tools/consumer-kit -p 'test_*.py'
"""
import contextlib
import hashlib
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import hcs_kit  # noqa: E402

VERSION = "0.1.0-draft.9"
CASE_A = "HCS-0005/HCS-0005-R001/valid/granted.json"
CASE_B = "HCS-0005/HCS-0005-R005/valid/asked.json"
CASE_C = "HCS-0006/HCS-0006-R006/invalid/parse.json"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build_release(out, files=None, version=VERSION, extra_members=()):
    """Write hcs-<version>.tar.gz under out; return (tarball path, sha256)."""
    files = files or {"LICENSE": b"licence\n", "spec/a.md": b"# a\n", "conformance/cases/x.json": b"{}\n"}
    sums = "".join(f"{sha(files[p])}  {p}\n" for p in sorted(files)).encode()
    members = {**files, "SHA256SUMS": sums}
    path = pathlib.Path(out) / f"hcs-{version}.tar.gz"
    with tarfile.open(path, "w:gz") as tar:
        for name, data in sorted(members.items()):
            info = tarfile.TarInfo(f"hcs-{version}/{name}")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        for info in extra_members:
            tar.addfile(info)
    return path, sha(path.read_bytes())


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = hcs_kit.main(list(argv))
    return code, out.getvalue() + err.getvalue()


class TmpCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = pathlib.Path(self._tmp.name)
        (self.tmp / "assets").mkdir()
        (self.tmp / "root").mkdir()
        self.root = str(self.tmp / "root")


class SyncAndVerify(TmpCase):
    def test_sync_vendors_and_writes_pin(self):
        tarball, digest = build_release(self.tmp / "assets")
        code, text = run("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)
        self.assertEqual(code, 0, text)
        vendor = pathlib.Path(self.root) / "vendor" / "hcs"
        self.assertEqual((vendor / VERSION / "spec" / "a.md").read_bytes(), b"# a\n")
        pin = json.loads((vendor / "PIN.json").read_text())
        self.assertEqual(pin["version"], VERSION)
        self.assertEqual(pin["sha256"], digest)
        self.assertTrue(pin["url"].endswith(f"/v{VERSION}/hcs-{VERSION}.tar.gz"))
        self.assertEqual(run("verify", "--root", self.root)[0], 0)

    def test_sync_accepts_the_top_directory_member_of_a_release(self):
        top = tarfile.TarInfo(f"hcs-{VERSION}")  # build_release.py writes the directory without a trailing slash
        top.type = tarfile.DIRTYPE
        tarball, digest = build_release(self.tmp / "assets", extra_members=[top])
        self.assertEqual(run("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)[0], 0)

    def test_sync_downloads_from_a_file_url(self):
        tarball, digest = build_release(self.tmp / "assets")
        code, text = run("sync", VERSION, digest, "--url", tarball.as_uri(), "--root", self.root)
        self.assertEqual(code, 0, text)
        pin = json.loads((pathlib.Path(self.root) / "vendor/hcs/PIN.json").read_text())
        self.assertEqual(pin["url"], tarball.as_uri())

    def test_sync_refuses_a_wrong_digest_and_writes_nothing(self):
        tarball, _ = build_release(self.tmp / "assets")
        code, text = run("sync", VERSION, "0" * 64, "--tarball", str(tarball), "--root", self.root)
        self.assertEqual(code, 1)
        self.assertIn("sha256", text)
        self.assertFalse((pathlib.Path(self.root) / "vendor").exists())

    def test_sync_refuses_a_tree_that_disagrees_with_its_sums(self):
        tarball, _ = build_release(self.tmp / "assets")
        # Rebuild with a SHA256SUMS that lies about spec/a.md.
        files = {"LICENSE": b"l\n", "spec/a.md": b"# a\n"}
        tarball, digest = build_release(self.tmp / "assets", files)
        data = tarball.read_bytes()
        with tarfile.open(fileobj=io.BytesIO(data)) as src, tarfile.open(tarball, "w:gz") as dst:
            for m in src.getmembers():
                body = src.extractfile(m).read()
                if m.name.endswith("spec/a.md"):
                    body = b"tampered\n"
                m.size = len(body)
                dst.addfile(m, io.BytesIO(body))
        digest = sha(tarball.read_bytes())
        code, text = run("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)
        self.assertEqual(code, 1)
        self.assertIn("spec/a.md", text)
        self.assertFalse((pathlib.Path(self.root) / "vendor").exists())

    def test_sync_refuses_unsafe_members(self):
        link = tarfile.TarInfo(f"hcs-{VERSION}/evil")
        link.type, link.linkname = tarfile.SYMTYPE, "/etc/passwd"
        tarball, digest = build_release(self.tmp / "assets", extra_members=[link])
        code, text = run("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)
        self.assertEqual(code, 1)
        self.assertIn("evil", text)

    def test_sync_refuses_a_path_outside_the_release_directory(self):
        info = tarfile.TarInfo("../escape")
        info.size = 0
        tarball, digest = build_release(self.tmp / "assets", extra_members=[info])
        code, text = run("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)
        self.assertEqual(code, 1)
        self.assertIn("escape", text)

    def test_sync_does_not_replace_an_existing_version_without_force(self):
        tarball, digest = build_release(self.tmp / "assets")
        args = ("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)
        self.assertEqual(run(*args)[0], 0)
        self.assertEqual(run(*args)[0], 1)
        self.assertEqual(run(*args, "--force")[0], 0)

    def test_sync_usage_errors(self):
        self.assertEqual(run("sync", "../x", "0" * 64, "--root", self.root)[0], 2)
        self.assertEqual(run("sync", VERSION, "nothex", "--root", self.root)[0], 2)

    def test_verify_detects_edit_missing_and_extra_files(self):
        tarball, digest = build_release(self.tmp / "assets")
        run("sync", VERSION, digest, "--tarball", str(tarball), "--root", self.root)
        tree = pathlib.Path(self.root) / "vendor/hcs" / VERSION
        (tree / "spec/a.md").write_text("edited\n")
        code, text = run("verify", "--root", self.root)
        self.assertEqual(code, 1)
        self.assertIn("spec/a.md", text)
        (tree / "spec/a.md").write_bytes(b"# a\n")
        (tree / "LICENSE").unlink()
        self.assertIn("LICENSE", run("verify", "--root", self.root)[1])
        (tree / "LICENSE").write_bytes(b"licence\n")
        (tree / "extra.txt").write_text("x")
        code, text = run("verify", "--root", self.root)
        self.assertEqual(code, 1)
        self.assertIn("extra.txt", text)

    def test_verify_without_a_pin_fails(self):
        self.assertEqual(run("verify", "--root", self.root)[0], 1)


def write(path, value):
    pathlib.Path(path).write_text(json.dumps(value))
    return str(path)


def report(**statuses):
    """A runner report: keyword names are case ids, 'A', 'B', 'C'."""
    names = {"A": CASE_A, "B": CASE_B, "C": CASE_C}
    return {"hcsVersion": "0.1", "results": [
        {"case": f"conformance/cases/{names[k]}", "level": "authority", "status": v} for k, v in statuses.items()]}


class Compare(TmpCase):
    def compare(self, current, baseline=None, divergences=None, *extra):
        rep = write(self.tmp / "report.json", current)
        base = self.tmp / "baseline.json"
        div = self.tmp / "divergences.json"
        if baseline is not None:
            write(base, {"hcsVersion": "0.1", "cases": baseline})
        write(div, divergences or {"divergences": [], "notApplicable": []})
        return run("compare", "--report", rep, "--baseline", str(base), "--divergences", str(div), *extra)

    def test_baseline_command_records_effective_statuses(self):
        rep = write(self.tmp / "report.json", report(A="pass", B="not-implemented"))
        div = write(self.tmp / "d.json", {"divergences": [], "notApplicable": [
            {"requirement": "HCS-0005-R005", "reason": "no person asks"}]})
        out = self.tmp / "baseline.json"
        self.assertEqual(run("baseline", "--report", rep, "--divergences", div, "--out", str(out))[0], 0)
        self.assertEqual(json.loads(out.read_text())["cases"], {CASE_A: "pass", CASE_B: "not-applicable"})

    def test_same_results_pass(self):
        code, text = self.compare(report(A="pass", B="fail"), {CASE_A: "pass", CASE_B: "fail"})
        self.assertEqual(code, 0, text)

    def test_pass_to_fail_is_a_regression(self):
        code, text = self.compare(report(A="fail"), {CASE_A: "pass"})
        self.assertEqual(code, 1)
        self.assertIn(CASE_A, text)

    def test_pass_to_crash_and_to_not_implemented_regress(self):
        self.assertEqual(self.compare(report(A="crash"), {CASE_A: "pass"})[0], 1)
        self.assertEqual(self.compare(report(A="not-implemented"), {CASE_A: "pass"})[0], 1)

    def test_known_failure_staying_failed_is_not_a_regression(self):
        self.assertEqual(self.compare(report(A="crash"), {CASE_A: "fail"})[0], 0)

    def test_fail_to_crash_is_not_worse(self):
        self.assertEqual(self.compare(report(A="crash"), {CASE_A: "fail"})[0], 0)

    def test_new_failing_case_is_a_regression_new_passing_is_not(self):
        self.assertEqual(self.compare(report(A="pass", B="fail"), {CASE_A: "pass"})[0], 1)
        self.assertEqual(self.compare(report(A="pass", B="pass"), {CASE_A: "pass"})[0], 0)

    def test_improvement_and_removed_case_do_not_fail(self):
        code, text = self.compare(report(A="pass"), {CASE_A: "fail", CASE_B: "pass"})
        self.assertEqual(code, 0, text)
        self.assertIn("improved", text)
        self.assertIn("removed", text)

    def test_divergence_rule_accepts_a_failure(self):
        div = {"divergences": [{"requirement": "HCS-0005-R001", "reason": "deliberate"}], "notApplicable": []}
        code, text = self.compare(report(A="fail"), {CASE_A: "pass"}, div)
        self.assertEqual(code, 0, text)

    def test_rule_with_cases_covers_only_those_cases(self):
        div = {"divergences": [], "notApplicable": [
            {"requirement": "HCS-0005-R001", "reason": "r", "cases": ["HCS-0005/HCS-0005-R001/valid/other.json"]}]}
        self.assertEqual(self.compare(report(A="fail"), {CASE_A: "pass"}, div)[0], 1)

    def test_rule_does_not_hide_a_pass(self):
        div = {"divergences": [{"requirement": "HCS-0005-R001", "reason": "r"}], "notApplicable": []}
        code, text = self.compare(report(A="pass"), {CASE_A: "pass"}, div)
        self.assertEqual(code, 0, text)

    def test_missing_baseline_is_an_error_unless_updating(self):
        self.assertEqual(self.compare(report(A="pass"))[0], 2)
        code, _ = self.compare(report(A="pass"), None, None, "--update")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads((self.tmp / "baseline.json").read_text())["cases"], {CASE_A: "pass"})

    def test_invalid_divergences_file_is_a_usage_error(self):
        bad = {"divergences": [{"requirement": "HCS-0005-R001"}], "notApplicable": []}
        code, text = self.compare(report(A="pass"), {CASE_A: "pass"}, bad)
        self.assertEqual(code, 2)
        self.assertIn("reason", text)

    def test_schemas_accept_what_the_kit_writes(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest("jsonschema not installed")
        here = pathlib.Path(hcs_kit.__file__).parent / "schemas"
        base = json.loads((here / "baseline.schema.json").read_text())
        div = json.loads((here / "divergences.schema.json").read_text())
        jsonschema.validate({"hcsVersion": "0.1", "cases": {CASE_A: "pass"}}, base)
        jsonschema.validate({"divergences": [{"requirement": "HCS-0005-R001", "reason": "r"}],
                             "notApplicable": [{"requirement": "HCS-0005-R005", "reason": "r", "cases": [CASE_B]}]}, div)
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate({"divergences": [{"requirement": "HCS-0005-R001"}]}, div)


if __name__ == "__main__":
    unittest.main()
