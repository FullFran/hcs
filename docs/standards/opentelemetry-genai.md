# OpenTelemetry (spec, semantic conventions, GenAI conventions)

| Field | Value |
| --- | --- |
| Owner | OpenTelemetry project (CNCF) |
| Version pinned | Spec v1.62.0; semantic-conventions v1.45.0; semantic-conventions-genai unreleased, manifest `schema_url` `https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev`, depends on semconv v1.45.0 |
| Source pinned | `open-telemetry/semantic-conventions-genai@e713f345c1d5f6d888b2f3bbddf1a863395b784c` (2026-11-06); `open-telemetry/semantic-conventions@v1.45.0` (release 2026-11-02); `open-telemetry/opentelemetry-specification@v1.62.0` (release published 2026-10-22) |
| Access date | 2026-11-06 |
| License | Apache-2.0 (all three repos, per GitHub license metadata) |
| Maturity | CNCF Graduated [U: not re-checked in this pass]; GenAI registry `stability: development`; `error.type` is stable |
| HCS action | adopt attribute and span names (non-normative in CORE-0; RECOMMENDED telemetry section in TOOLS-1 and AGENT-1) |

## What it defines

The OpenTelemetry specification defines the APIs, SDKs, data model and context propagation for
traces, metrics and logs. Semantic conventions define standard attribute keys, span names and
metrics. GenAI conventions, now in their own repository, cover model inference, agents, tool
execution, MCP, A2A and provider-specific attributes.

## Key objects and fields

Operation names (`gen_ai.operation.name`): `chat`, `generate_content`, `create_agent`,
`invoke_agent`, `execute_tool`, `invoke_workflow`, `invoke_runner`, among others.

Span names (all SHOULD):

- Tool: `execute_tool {gen_ai.tool.name}`; skill-backed variant `execute_tool {gen_ai.tool.name} {gen_ai.skill.name}`.
- Agent: `create_agent {gen_ai.agent.name}`; invoke: `{gen_ai.operation.name} {gen_ai.agent.name}` or just `{gen_ai.operation.name}`.
- MCP: `{mcp.method.name} {target}` where target is `gen_ai.tool.name` or `gen_ai.prompt.name`; else `{mcp.method.name}`. `mcp.resource.uri` only by opt-in (cardinality).
- Span status follows semconv "Recording Errors"; `error.type` is conditionally required on error.

Attributes relevant to HCS tool/agent calls (registry at the pinned commit):

- Tool: `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.description`, `gen_ai.tool.type`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, `gen_ai.tool.definitions`.
- Agent: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.agent.version`, `gen_ai.main_agent.id`, `gen_ai.main_agent.name`, `gen_ai.transfer.mode`, `gen_ai.transfer.target.name`.
- Skill: `gen_ai.skill.name`, `gen_ai.skill.description`, `gen_ai.skill.source.uri`, `gen_ai.skill.resource.name`.
- Context: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.conversation.id`.
- MCP: `mcp.method.name`, `mcp.session.id`, `mcp.resource.uri`, `mcp.protocol.version`; MCP spans also reference `jsonrpc.protocol.version`, `jsonrpc.request.id`, `rpc.response.status_code`, `network.transport`, `server.address`, `server.port`, `error.type`.

Context propagation: W3C Trace Context `traceparent` (format `00-<trace-id>-<parent-id>-<flags>`),
`tracestate`, and W3C `baggage`. For MCP, instrumentations SHOULD inject them unprefixed into
`params._meta` (per MCP SEP-414) and the receiver uses them as remote parent.

## Extension points

- Custom attributes under a vendor/project namespace (for example `hcs.*`); semconv reserves
  well-known prefixes.
- Weaver-managed registries that depend on core semconv (how the GenAI repo itself is built).
- `OTEL_SEMCONV_STABILITY_OPT_IN`-style transitions for breaking renames [U: not checked at this pin].

## Where HCS references it instead of redefining

- TOOLS-1: a host emitting traces for a granted tool dispatch uses `execute_tool` spans with
  `gen_ai.tool.*`; HCS MUST NOT define its own tool-span attribute names.
- TOOLS-1: MCP-backed tool calls use `mcp.*` attributes and `_meta` trace propagation as
  specified by the GenAI repo; HCS only states that hosts propagate context across the plugin
  boundary.
- AGENT-1: agent invocations use `invoke_agent` spans and `gen_ai.agent.*`.
- HCS-0004 lifecycle and HCS-0005 grant decisions have no semconv; HCS defines `hcs.*`
  attributes (for example `hcs.capability.id`, `hcs.plugin.id`, `hcs.grant.decision`) only for
  what GenAI does not cover.
- HCS-0006: when an operation fails, `error.type` carries the HCS error code
  (`permission_denied`, `timeout`, ...).

## Pitfalls for HCS

- GenAI conventions are `development`: names can change without deprecation; pin the commit and
  keep them non-normative in CORE-0.
- The MCP registry at this pin still lists `initialize` and `mcp.session.id`, and links MCP
  2025-11-25; MCP 2026-07-28 removed both the handshake and sessions. TOOLS-1 must state which
  MCP revision its telemetry mapping assumes.
- `gen_ai.tool.call.arguments` / `.result` and message attributes can hold sensitive content;
  HCS should require opt-in capture.
- The README's "Schema URL" is still TODO; there is no released GenAI schema URL to cite.

## Sources

- https://github.com/open-telemetry/semantic-conventions-genai (README, `model/manifest.yaml`, `model/gen-ai/registry.yaml`, `model/mcp/registry.yaml`, `docs/gen-ai/execute-tool.md`, `docs/gen-ai/gen-ai-agent-spans.md`, `docs/gen-ai/mcp.md`)
- https://github.com/open-telemetry/semantic-conventions/releases/tag/v1.45.0
- https://github.com/open-telemetry/opentelemetry-specification/releases/tag/v1.62.0
- https://www.w3.org/TR/trace-context/ [U: not fetched; format taken from the GenAI MCP doc example]
