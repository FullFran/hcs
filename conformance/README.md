# HCS conformance

Cases are data (`case.schema.json`), one file per case, in `cases/<document>/<requirement-id>/{valid,invalid}/`. The directory gives the polarity ([ADR-0001](../docs/adr/0001-requirement-ids-and-case-polarity.md)).

| Level | Executed by the reference runner | What it checks |
| --- | --- | --- |
| `document` | yes | a JSON document against an HCS schema (`target`), plus semantic checks: `hcsVersion` first, duplicate entry ids, problem-details `type`/code equality |
| `integrity` | yes | `size` and `contentHash` against base64 bytes (HCS-0001-R007) |
| `resolution` | yes | the HCS-0003 algorithm: activation order and typed errors |
| `authority` | yes | the HCS-0005 grant evaluation |
| `host` | no, reported `pending` | a scenario and expected behaviour that needs a running host |

## Run

```sh
# python-jsonschema >= 4.18 (uses the `referencing` registry)
python3 -m venv .venv && .venv/bin/pip install 'jsonschema>=4.18'
.venv/bin/python tools/extract_requirements.py --check
.venv/bin/python conformance/runner/run.py --selftest [--report report.json] [-v]

# optional second validator for schema-only verdicts
npm i --prefix /some/dir ajv@8.17.1
node conformance/runner/xcheck-ajv.mjs . /some/dir
```

The runner exits non-zero on any failing or malformed case, and when a MUST/MUST NOT requirement lacks a `valid` or an `invalid` case, or a case names an unknown requirement (HCS-0000-R001/R002).

## Profiles

`profiles/core-0.json` lists the requirement ids of the CORE-0 draft profile. A host claims a profile by passing every case of every listed requirement, host-level cases included; no host does yet.
