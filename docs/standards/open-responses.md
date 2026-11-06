# Open Responses

| Field | Value |
| --- | --- |
| Owner | Open Responses a Series of LF Projects, LLC (Technical Charter adopted 2026-10-21); TSC with members from OpenAI, Databricks, Amazon, Hugging Face, Ollama, OpenRouter, Ramp (`MAINTAINERS.md`); AAIF project per the catalog [U: not re-checked] |
| Version pinned | revision `2026-04-24` (`info.version` in the dated OpenAPI document) |
| Source pinned | `openresponses/openresponses@dce9ddb91921427c2ba06901c7dfaf0cc7056799` (`main`, 2026-10-29; no git tags or releases); files `public/openapi/2026-04-24/openapi.json` (immutable dated release) and `src/specifications/2026-04-24.mdx` |
| Access date | 2026-11-06 |
| License | Apache-2.0 |
| Maturity | Dated revisions `2026-01-15` (launch) and `2026-04-24`; compliance suite (web tester and `bin/compliance-test.ts` CLI) |
| HCS action | out of core; optional adapter for a model-provider contribution (no HCS profile in 0.1) |

## What it defines

A multi-provider HTTP interface for calling language models, derived from the OpenAI Responses API. Authored in TypeSpec (`schema/*.tsp`) and emitted as OpenAPI per dated revision. It defines the request/response model, "items" as the unit of context (polymorphic, streamable, each a small state machine), semantic streaming events over SSE, an agentic loop with tool calls, and (since 2026-04-24) a WebSocket transport on the same resource plus a compaction endpoint. Paths: `/responses` and `/responses/compact` (served under a `/v1` base).

## Key objects and fields

- `CreateResponseBody`: `model`, `input`, `instructions`, `previous_response_id`, `tools`, `tool_choice`, `parallel_tool_calls`, `max_tool_calls`, `stream`, `stream_options`, `background`, `store`, `metadata`, `text`, `reasoning`, `truncation`, `service_tier`, `max_output_tokens`, `temperature`, `top_p`, `include`, `prompt_cache_key`, `safety_identifier`, and others.
- Tools: `FunctionToolParam` (`type`, `name` required; `description`, `parameters`, `strict`). Externally hosted tools (functions run by the client) vs internally hosted tools (run by the provider).
- `tool_choice`: `"auto"` (default), `"required"`, `"none"`, or an object forcing one tool; `allowed_tools` narrows invocable tools without changing `tools` (cache-preserving).
- Items: every item MUST carry `id`, `type`, `status` (`in_progress`, `completed`, `failed`, ...).
- `previous_response_id`: server loads prior input and output as context.
- Streaming: `Content-Type: text/event-stream`, SSE `event` equals body `type`, events carry `sequence_number`; terminal event required (`response.completed`, `response.failed`, ...). Delta events (e.g. `response.output_text.delta`) vs state-machine events (e.g. `response.in_progress`).
- WebSocket: client sends `{"type": "response.create", ...}` per turn; sequential turns; 60-minute connection limit.
- Errors: object `error {message, type, param, code}`; types `server_error` (500), `invalid_request` (400), `not_found` (404), `model_error` (500), `too_many_requests` (429). Streaming errors are emitted as events and followed by a failure event.

## Extension points

- Compliance means implementing the spec directly or a proper superset.
- Provider-specific item types, hosted tool types and streaming event types MUST be prefixed with the implementor slug (`acme:search_result`, `openai:web_search_call`, `acme:trace_event`).
- Hosted tools SHOULD have a matching item type so calls can be round-tripped.
- Extra fields on existing schemas are allowed but SHOULD be optional and MUST NOT change core meaning; treat them as vendor-specific.
- `metadata` on requests (developer-supplied key/values) [U: size/shape limits not checked].

## Where HCS references it instead of redefining

- HCS-0001: a future contribution kind for a model provider (e.g. `model-endpoint`) points to an Open Responses-compatible base URL and pins a revision string (`2026-04-24`); HCS MUST NOT restate `CreateResponseBody` or item schemas. [I]
- HCS-0002: provider slug prefixes (`acme:`) are vendor namespaces inside Open Responses; HCS capability IDs MUST NOT be derived from them.
- HCS-0005: `tools`/`allowed_tools` in a request reflect what the host already authorized; they are not a grant mechanism.
- HCS-0006: when an HCS host proxies a model call, HCS errors on HTTP use RFC 9457 (per HCS-0006), and Open Responses error objects pass through unchanged inside it [I].
- Conformance: HCS reuses the Open Responses compliance suite for any model adapter instead of writing its own model tests. [I]

## Pitfalls for HCS

- Model plane only: not a manifest, session or plugin format. (catalog)
- No git tags: the revision is a dated directory; pin both the revision string and a commit.
- Error type naming is inconsistent in the 2026-04-24 prose: the table says `invalid_request`, the example uses `invalid_request_error`. Test against the OpenAPI document, not prose.
- The OpenAPI `servers` entry is `https://api.openai.com/v1`; HCS must not treat it as a default endpoint.
- WebSocket and `store=false` state is connection-local; a host restart loses it.

## Sources

Site URLs below were read as their source files in the pinned repository; the live sites were not fetched in this pass [U for any live-site drift].

- https://github.com/openresponses/openresponses/blob/dce9ddb91921427c2ba06901c7dfaf0cc7056799/CHANGELOG.md
- https://github.com/openresponses/openresponses/blob/dce9ddb91921427c2ba06901c7dfaf0cc7056799/public/openapi/2026-04-24/openapi.json
- https://www.openresponses.org/specification/2026-04-24
- https://github.com/openresponses/openresponses/blob/dce9ddb91921427c2ba06901c7dfaf0cc7056799/CHARTER.md
- https://github.com/openresponses/openresponses/blob/dce9ddb91921427c2ba06901c7dfaf0cc7056799/MAINTAINERS.md
- https://www.openresponses.org/compliance
