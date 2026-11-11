# OpenTelemetry Protocol (OTLP)

| Field | Value |
| --- | --- |
| Owner | OpenTelemetry project (CNCF) |
| Version pinned | none. HCS pins no OTLP version; no requirement under `spec/` cites OTLP (searched 2026-11-11). Latest `opentelemetry-proto` release read: v1.11.1 (published 2026-09-29) |
| Source pinned | none; read `open-telemetry/opentelemetry-proto@v1.11.1` (tag object `58232798eae2f0d08ea6682c6885299db08177da`), file `docs/specification.md` |
| Access date | 2026-11-11 |
| License | Apache-2.0 [U: not re-checked in this pass] |
| Maturity | Stable for traces, metrics and logs; Development for profiles (per `docs/specification.md`) |
| HCS action | none (reference only; see [opentelemetry-genai](opentelemetry-genai.md) for the attribute conventions) |

## What it defines

OTLP is a general-purpose protocol for delivering telemetry between sources, intermediate nodes such as collectors, and backends. It has one request type, `Export`, over two transports: OTLP/gRPC (default port 4317) and OTLP/HTTP with binary or JSON Protobuf payloads (default port 4318; paths `/v1/traces`, `/v1/metrics`, `/v1/logs`). The messages are defined in the Protobuf files of the `opentelemetry-proto` repository.

## Relation to the semantic conventions

OTLP is the transport and data-model encoding; the semantic conventions ([opentelemetry-genai](opentelemetry-genai.md)) name attribute keys, span names and metrics. The OTLP specification text read does not mention semantic conventions, so it fixes no attribute name. [I] An attribute named by a convention travels in OTLP as an ordinary key-value pair.

## Version line

- OTLP "does not use explicit protocol version numbering" (`docs/specification.md`, "Future Versions and Interoperability"): compatibility rests on backward-compatible Protobuf evolution and optional capabilities.
- The versioned artifact is the `opentelemetry-proto` repository: its latest release read is v1.11.1. That tag is the line a consumer pins when it says "OTLP 1.11.1"; it is a release of the proto files, not a protocol version negotiated on the wire.
- The OTLP text that used to live in the OpenTelemetry specification repository now redirects: `specification/protocol/otlp.md` at `opentelemetry-specification@v1.62.0` only points to https://opentelemetry.io/docs/specs/otlp/ (not fetched; the proto repository file above was read instead).

## Where HCS references it instead of redefining

Nowhere. HCS requirements name no OTLP version or transport; a host chooses its exporter. A requirement that cites OTLP would have to pin a proto release here first.

## Sources

- https://github.com/open-telemetry/opentelemetry-proto/blob/v1.11.1/docs/specification.md (read 2026-11-11)
- https://github.com/open-telemetry/opentelemetry-proto/releases/tag/v1.11.1 (published 2026-09-29, via the GitHub releases API, read 2026-11-11)
- https://github.com/open-telemetry/opentelemetry-specification/blob/v1.62.0/specification/protocol/otlp.md (redirect notice, read 2026-11-11)
