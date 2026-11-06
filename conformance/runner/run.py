#!/usr/bin/env python3
"""HCS reference conformance runner (document, integrity, resolution and authority levels).

Usage:
  python3 conformance/runner/run.py [--report PATH] [--selftest] [-v]

It validates every case in conformance/cases against conformance/case.schema.json, executes
document/integrity/resolution/authority cases with the reference semantics below, reports host
cases as pending, and enforces HCS-0000-R001/R002 (case coverage) against
requirements/requirements.json. Exit code 0 only when every executed case passes and coverage holds.

Validator: python-jsonschema >= 4.18 (Draft202012Validator with a `referencing` registry; older
releases mis-resolve relative $refs under urn: base URIs). Formats are not asserted, as in the
2020-12 default (format-annotation).
"""
import base64
import hashlib
import json
import pathlib
import sys

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = pathlib.Path(__file__).resolve().parents[2]
SUPPORTED_HCS = {"0.1"}
CATALOG = "urn:hcs:schema:hcs-0001:catalog-manifest:0.1"
ERROR = "urn:hcs:schema:hcs-0006:error:0.1"
RESOLUTION = "urn:hcs:schema:hcs-0003:resolution:0.1"
AUTHORITY = "urn:hcs:schema:hcs-0005:authority:0.1"
CASE = "urn:hcs:schema:conformance:case:0.1"
COVERAGE_EXEMPT = {"HCS-0000-R001", "HCS-0000-R002"}


def load_store():
    store = {}
    paths = list((ROOT / "schemas").rglob("*.schema.json")) + [ROOT / "conformance" / "case.schema.json"]
    for path in paths:
        schema = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        store[schema["$id"]] = schema
    return store


STORE = load_store()
REGISTRY = Registry().with_resources(
    (uri, Resource.from_contents(schema, default_specification=DRAFT202012)) for uri, schema in STORE.items())


def validator_for(uri):
    return Draft202012Validator({"$ref": uri}, registry=REGISTRY)


def schema_valid(uri, instance):
    return not any(True for _ in validator_for(uri).iter_errors(instance))


def err(code, entry=None, capability=None):
    e = {"code": code}
    if entry:
        e["entry"] = entry
    if capability:
        e["capability"] = capability
    return e


# ---------- document level (HCS-0001, HCS-0006) ----------

def check_catalog(doc):
    if isinstance(doc, dict) and isinstance(doc.get("hcsVersion"), str) and doc["hcsVersion"] not in SUPPORTED_HCS:
        return [err("unsupported_hcs_version")]
    if not schema_valid(CATALOG, doc):
        return [err("manifest_invalid")]
    errors, seen = [], set()
    for entry in doc["entries"]:
        if entry["id"] in seen:
            errors.append(err("duplicate_entry", entry["id"]))
        seen.add(entry["id"])
    return errors


def check_document(target, doc):
    if target == CATALOG:
        return check_catalog(doc)
    if not schema_valid(target, doc):
        return [err("manifest_invalid")]
    if target == ERROR + "#/$defs/problemDetails" and doc["type"] != "urn:hcs:error:" + doc["hcsError"]["code"]:
        return [err("manifest_invalid")]
    return []


# ---------- integrity level (HCS-0001-R007) ----------

def check_integrity(inp):
    entry, data = inp["entry"], base64.b64decode(inp["contentBase64"], validate=True)
    algo, _, want = entry["contentHash"].partition(":")
    if len(data) != entry["size"] or hashlib.new(algo, data).hexdigest() != want:
        return [err("integrity_mismatch", entry["id"])]
    return []


# ---------- resolution level (HCS-0003) ----------

def platform_matches(item, host):
    if item["os"] != host["os"] or item["architecture"] != host["architecture"]:
        return False
    return "variant" not in item or item["variant"] == host.get("variant")


def resolve(inp):
    if not schema_valid(RESOLUTION + "#/$defs/resolutionInput", inp):
        raise ValueError("resolution input does not match its schema")
    catalog, host = inp["catalog"], inp["host"]
    entries = {e["id"]: e for e in catalog["entries"]}
    errors, failed = [], set()
    for eid, e in entries.items():
        if e["mediaType"] not in host["mediaTypes"] or any(
                c["kind"] not in host["contributionKinds"] for c in e["contributions"]):
            errors.append(err("unsupported_contribution", eid)); failed.add(eid)
        elif "platforms" in e.get("compatibility", {}) and not any(
                platform_matches(p, host["platform"]) for p in e["compatibility"]["platforms"]):
            errors.append(err("platform_incompatible", eid)); failed.add(eid)
        elif "hosts" in e.get("compatibility", {}) and not any(
                h["id"] == host.get("id") and host.get("version") in h["versions"] for h in e["compatibility"]["hosts"]):
            errors.append(err("version_incompatible", eid)); failed.add(eid)

    def provides(eid):
        return {r for c in entries[eid]["contributions"] for r in c.get("provides", [])}

    builtins = set(host["builtins"])
    edges = {}
    while True:
        live = [eid for eid in entries if eid not in failed]
        changed = False
        edges = {}
        for eid in live:
            edges[eid] = set()
            for ref in entries[eid].get("requires", []):
                cands = [p for p in live if p != eid and ref in provides(p)]
                count = len(cands) + (1 if ref in builtins else 0)
                if count == 1:
                    edges[eid].update(cands)
                    continue
                if count > 1:
                    code = "ambiguous_provider"
                else:
                    cid = ref.rsplit("@", 1)[0]
                    others = builtins | {r for p in live if p != eid for r in provides(p)}
                    code = "version_incompatible" if any(r.rsplit("@", 1)[0] == cid for r in others) else "missing_dependency"
                errors.append(err(code, eid, ref)); failed.add(eid); changed = True
                break
        if changed:
            continue
        cyclic = find_cycle_members(edges)
        if not cyclic:
            break
        for eid in sorted(cyclic):
            errors.append(err("dependency_cycle", eid)); failed.add(eid)
    order, done = [], set()
    remaining = set(edges)
    while remaining:
        ready = sorted((e for e in remaining if edges[e] <= done), key=lambda s: s.encode())
        nxt = ready[0]
        order.append(nxt); done.add(nxt); remaining.discard(nxt)
    result = {"activationOrder": order, "errors": errors}
    policy = host.get("activationPolicy")
    if policy is not None:
        result["selected"] = [] if policy == "all-or-nothing" and errors else list(order)
    return result


def find_cycle_members(edges):
    index, low, stack, on, out, counter = {}, {}, [], set(), set(), [0]

    def strong(v):
        index[v] = low[v] = counter[0]; counter[0] += 1
        stack.append(v); on.add(v)
        for w in edges[v]:
            if w not in index:
                strong(w); low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            comp = []
            while True:
                w = stack.pop(); on.discard(w); comp.append(w)
                if w == v:
                    break
            if len(comp) > 1 or v in edges[v]:
                out.update(comp)

    for v in sorted(edges):
        if v not in index:
            strong(v)
    return out


# ---------- authority level (HCS-0005) ----------

def evaluate(inp):
    if not schema_valid(AUTHORITY + "#/$defs/evaluationInput", inp):
        raise ValueError("authority input does not match its schema")
    chk = inp["check"]
    if any(g["entry"] == chk["entry"] and g["permission"] == chk["permission"] for g in inp["grants"]):
        return {"allow": True}
    return {"allow": False, "error": {"code": "permission_denied", "entry": chk["entry"],
                                      "message": f"{chk['entry']} has no grant for {chk['permission']}"}}


# ---------- case execution ----------

def norm(errors):
    return sorted(json.dumps({k: e[k] for k in ("code", "entry", "capability") if k in e}, sort_keys=True) for e in errors)


def run_case(case):
    level, inp, exp = case["level"], case["input"], case["expect"]
    if level == "host":
        return "pending", None
    if level in ("document", "integrity"):
        errors = check_document(case["target"], inp) if level == "document" else check_integrity(inp)
        outcome = "invalid" if errors else "valid"
        ok = outcome == exp["outcome"] and ("errors" not in exp or norm(errors) == norm(exp["errors"]))
        return ("pass" if ok else "fail"), {"outcome": outcome, "errors": errors}
    if level == "resolution":
        got = resolve(inp)
        assert schema_valid(RESOLUTION + "#/$defs/resolutionResult",
                            dict(got, errors=[dict(e, message=e["code"]) for e in got["errors"]]))
        ok = got["activationOrder"] == exp["activationOrder"] and norm(got["errors"]) == norm(exp["errors"]) and (
            "selected" not in exp or got.get("selected") == exp["selected"])
        return ("pass" if ok else "fail"), got
    if level == "authority":
        got = evaluate(inp)
        assert schema_valid(AUTHORITY + "#/$defs/decision", got)
        ok = got["allow"] == exp["decision"]["allow"] and (
            got["allow"] or got["error"]["code"] == exp["decision"]["error"]["code"])
        return ("pass" if ok else "fail"), got
    raise ValueError(level)


def coverage(requirements, refs):
    """HCS-0000-R001/R002. refs: list of (case path, requirement id, polarity)."""
    problems = []
    known = {r["id"] for r in requirements}
    for path, rid, _ in refs:
        if rid not in known:
            problems.append(f"{path}: unknown requirement {rid} (HCS-0000-R002)")
    for r in requirements:
        if r["keyword"] in ("MUST", "MUST NOT") and r["id"] not in COVERAGE_EXEMPT:
            for pol in ("valid", "invalid"):
                if not any(rid == r["id"] and p == pol for _, rid, p in refs):
                    problems.append(f"{r['id']}: no {pol} case (HCS-0000-R001)")
    return problems


def selftest():
    reqs = [{"id": "HCS-0009-R001", "keyword": "MUST"}, {"id": "HCS-0009-R002", "keyword": "SHOULD"}]
    assert coverage(reqs, [("a", "HCS-0009-R001", "valid"), ("b", "HCS-0009-R001", "invalid")]) == []
    assert len(coverage(reqs, [("a", "HCS-0009-R001", "valid")])) == 1
    assert len(coverage(reqs, [("a", "HCS-0009-R001", "valid"), ("b", "HCS-0009-R001", "invalid"),
                               ("c", "HCS-0009-R777", "valid")])) == 1
    assert coverage(reqs, [("a", "HCS-0009-R001", "valid"), ("b", "HCS-0009-R001", "invalid")]) == []
    print("selftest: coverage checks pass")


def main(argv):
    if "--selftest" in argv:
        selftest()
    verbose = "-v" in argv
    requirements = json.loads((ROOT / "requirements" / "requirements.json").read_text())["requirements"]
    case_validator = validator_for(CASE)
    results, refs, counts = [], [], {"pass": 0, "fail": 0, "pending": 0, "malformed": 0}
    for path in sorted((ROOT / "conformance" / "cases").rglob("*.json")):
        rel = str(path.relative_to(ROOT))
        polarity = path.parent.name
        case = json.loads(path.read_text(encoding="utf-8"))
        problems = [e.message for e in case_validator.iter_errors(case)]
        if polarity not in ("valid", "invalid"):
            problems.append("case must live in a valid/ or invalid/ directory")
        if problems:
            counts["malformed"] += 1
            results.append({"case": rel, "status": "malformed", "problems": problems})
            print(f"MALFORMED {rel}: {problems}")
            continue
        for rid in case["requirements"]:
            refs.append((rel, rid, polarity))
        try:
            status, got = run_case(case)
        except Exception as exc:  # a crash is a failure, reported with its reason
            status, got = "fail", {"exception": repr(exc)}
        counts[status] += 1
        results.append({"case": rel, "requirements": case["requirements"], "level": case["level"],
                        "status": status, "observed": got})
        if status == "fail" or verbose:
            print(f"{status.upper():8} {rel} observed={json.dumps(got)}")
    cov = coverage(requirements, refs)
    for c in cov:
        print(f"COVERAGE {c}")
    print(f"cases: {sum(counts.values())} | pass {counts['pass']} | fail {counts['fail']} | "
          f"pending(host) {counts['pending']} | malformed {counts['malformed']} | coverage problems {len(cov)}")
    print(f"validator: python-jsonschema {jsonschema_version()} Draft202012Validator")
    if "--report" in argv:
        out = pathlib.Path(argv[argv.index("--report") + 1])
        out.write_text(json.dumps({"hcsVersion": "0.1", "runner": "conformance/runner/run.py",
                                   "counts": counts, "coverage": cov, "results": results}, indent=2))
    return 0 if counts["fail"] == 0 and counts["malformed"] == 0 and not cov else 1


def jsonschema_version():
    from importlib.metadata import version
    return version("jsonschema")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
