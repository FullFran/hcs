# HCS · Harness Composition Specification

**Status:** draft, private, pre-0.1. Nothing here is a published standard.

HCS defines how an agent harness composes plugins: manifest, capabilities,
dependency resolution, lifecycle, authority (plugins request, the host grants),
typed errors, distribution and conformance. It reuses existing standards
instead of replacing them (MCP for tools, ACP for client/agent, Agent Skills
for procedures, OpenTelemetry for telemetry, TUF-style properties for
distribution metadata).

## Rules for growing this repo

1. **Need-driven.** A requirement enters HCS only when a real harness needs it.
   HagaHarness is the first consumer; RE;write is expected to be the second.
2. **Schema is the source of truth.** Normative prose lives in `spec/`
   (MUST/SHOULD/MAY per RFC 2119/8174); machine-readable contracts live in
   `schemas/` (JSON Schema 2020-12). Language SDKs are generated from the
   schemas, never the other way around.
3. **No claim without a test.** Every MUST gets a case in `conformance/`.
   HCS is not called a standard until two independent hosts pass the same
   profile.
4. **Specification versus distribution.** Anything every harness would need
   belongs here. Product decisions (for example HagaHarness privacy guards or
   trust tiers) belong to the distribution, under an `x-<distribution>`
   extension namespace.
5. **Clean provenance.** No code copied from private or third-party projects.
   Consumers adopt HCS by pinning a released version.
6. **Quarterly kill review.** If an existing standard covers what HCS
   covers, adopt it and migrate.

## Planned layout

```txt
spec/          HCS-NNNN-*.md normative documents
schemas/       versioned JSON Schemas
conformance/   runner, valid and invalid fixtures
sdk/ts/        generated types and host interfaces (when needed)
sdk/rust/      generated types (when needed)
examples/
docs/adr/
```

## First milestone (HCS 0.1)

`HCS-0001` catalog manifest: only the fields a desired-state distribution
needs today (id, version, contributions, content hash and size, compatibility),
with its JSON Schema and conformance fixtures.

## Current state

- `docs/standards/`: pinned notes on every external standard HCS touches.
- `spec/`: Draft HCS-0000 (conventions), HCS-0001 (catalog manifest),
  HCS-0002 (capability ids), HCS-0003 (resolution), HCS-0004 (lifecycle),
  HCS-0005 (authority), HCS-0006 (typed errors). Each lists its open questions.
- `schemas/`, `conformance/`, `requirements/`: schemas, cases and the
  reference runner ([conformance/README.md](conformance/README.md)).
- `docs/adr/`: design decisions behind the drafts.

## License

Apache License 2.0. See [LICENSE](LICENSE). Copyright 2026 Francisco (FullFran).
