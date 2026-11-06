# Contributing to HCS

HCS is a draft. Read the six growth rules in [README.md](README.md) first; a change that does not follow them will not be merged.

## How a requirement enters HCS

1. A real harness needs it (rule 1). Say which one and what it does today.
2. Check whether an existing standard already covers it (rule 6, [docs/standards/](docs/standards/)). If one does, profile it instead of writing new text.
3. Write the requirement on its own line in `spec/HCS-NNNN-*.md` (`**[HCS-NNNN-RMMM]** ...`, BCP 14 keywords, [HCS-0000](spec/HCS-0000-conventions.md)).
4. Change the schema in `schemas/` if the requirement is about document shape (rule 2).
5. Add at least one `valid/` and one `invalid/` case per MUST in `conformance/cases/` (rule 3, HCS-0000-R001).
6. Record any real design decision as an ADR in `docs/adr/`.
7. Run the checks:

```sh
python3 tools/extract_requirements.py      # regenerate requirements/requirements.json
python3 tools/extract_requirements.py --check
python3 conformance/runner/run.py --selftest
```

Distribution-specific behaviour goes under an `x-<distribution>` extension, never in core text (rule 4).

## Licence and provenance

- Contributions are made under the Apache License 2.0 ([LICENSE](LICENSE)). The licence of the specification text is still open (HCS-0000 OQ-0000-1).
- External contributions carry a [Developer Certificate of Origin](https://developercertificate.org/) sign-off (`git commit -s`), as CNCF and OCI projects require.
- Do not copy code or text from private or third-party projects (rule 5). Describe the behaviour you need in your own words and cite public sources.
