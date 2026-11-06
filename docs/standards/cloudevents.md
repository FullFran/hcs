# CloudEvents

| Field | Value |
| --- | --- |
| Owner | CloudEvents project (CNCF Serverless WG) |
| Version pinned | v1.0.2 (release `ce@v1.0.2`, published 2022-02-06) |
| Source pinned | `cloudevents/spec@ce@v1.0.2` = commit `fc1f6f31f5f011a72183f1bcea20c987cb683ade` (see pitfall on the tag date); files `cloudevents/spec.md`, `cloudevents/formats/json-format.md` |
| Access date | 2026-11-06 |
| License | Apache-2.0 (GitHub license metadata) |
| Maturity | Stable v1.0.x; CNCF Graduated [U: not re-checked in this pass]; no conformance suite |
| HCS action | adopt for external events, optional (HCS-0004 lifecycle events when a host exports them; not in CORE-0) |

## What it defines

A vendor-neutral envelope for event metadata ("context attributes") plus event data, with
protocol bindings (HTTP, Kafka, AMQP, ...) and event formats (JSON, Avro, Protobuf).

## Key objects and fields

REQUIRED context attributes:

- `id` (String, non-empty): `source` + `id` must be unique per distinct event; resends may reuse it.
- `source` (URI-reference, non-empty): the context in which the event happened.
- `specversion` (String): `"1.0"` for this version.
- `type` (String, non-empty): event type, reverse-DNS prefix recommended.

OPTIONAL context attributes:

- `datacontenttype` (String, RFC 2046 media type of `data`).
- `dataschema` (URI): schema that `data` adheres to.
- `subject` (String): subject within `source`.
- `time` (Timestamp, RFC 3339).

JSON format (`formats/json-format.md`): media type `application/cloudevents+json`; batch
`application/cloudevents-batch+json`; payload in `data` (JSON value) or `data_base64` (binary),
never both.

## Extension points

- Extension context attributes: any number, sharing the type system and naming rule of
  standard attributes: names MUST use only lowercase ASCII letters and digits (`a`-`z`,
  `0`-`9`), SHOULD be terse and SHOULD NOT exceed 20 characters. No `-`, `_` or `.`.
- Documented extensions (`cloudevents/extensions/`): `dataref`, `distributed-tracing`
  (`traceparent`, `tracestate`), `partitioning`, `sampledrate`, `sequence`, and others in the
  documented-extensions list.
- New extensions should be fully defined (name, type, semantics, values) and checked for
  collisions against the documented list.

## Where HCS references it instead of redefining

- HCS-0004 lifecycle: if a host exports lifecycle transitions (`activated`, `failed`,
  `stopped`, ...) to external systems, it emits CloudEvents; HCS defines only the `type` values
  (for example `dev.hcs.plugin.activated` [I: illustrative]) and the `data` JSON Schema, and MUST
  NOT define its own event envelope.
- HCS-0004: `source` identifies the host/catalog, `subject` the plugin id, `dataschema` points to
  the HCS schema `$id` for that event's data.
- HCS-0005 grant decisions exported for audit follow the same pattern.
- Tracing correlation uses the CloudEvents `distributed-tracing` extension or OTel directly
  (`opentelemetry-genai.md`); HCS does not add its own trace fields.
- HCS extension attributes, if any, use a lowercase alnum prefix such as `hcscapability`, not
  `hcs.capability` or `x-hcs-*`.

## Pitfalls for HCS

- The naming rule forbids HCS's `x-<distribution>` style; distribution metadata belongs in
  `data`, not in extension attributes.
- `time` is optional; HCS should require it in its own profile if ordering matters.
- Uniqueness is `source` + `id`; consumers deduplicate on that pair, so hosts must not reuse ids
  across different events.
- The tag `ce@v1.0.2` (and `v1.0.2`) currently resolves to a commit dated 2025-08-19 although
  the release was published 2022-02-06; the tag appears to have been moved. Pin the commit SHA
  and treat the content (`# CloudEvents - Version 1.0.2`) as authoritative [U: reason not checked].
- CloudEvents v2 work exists on `main`; do not cite `main` as 1.0.2.

## Sources

- https://github.com/cloudevents/spec/blob/ce@v1.0.2/cloudevents/spec.md
- https://github.com/cloudevents/spec/blob/ce@v1.0.2/cloudevents/formats/json-format.md
- https://github.com/cloudevents/spec/tree/ce@v1.0.2/cloudevents/extensions
- https://github.com/cloudevents/spec/releases/tag/ce@v1.0.2
