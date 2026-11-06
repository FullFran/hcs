# Agent2Agent Protocol (A2A)

| Field | Value |
| --- | --- |
| Owner | Linux Foundation project contributed by Google (`README.md`), Technical Steering Committee per `GOVERNANCE.md`; AAIF stage per the catalog [U: not re-checked] |
| Version pinned | v1.0.1 (released 2026-05-28); proto package `lf.a2a.v1`; protocol version string `1.0` |
| Source pinned | `a2aproject/A2A@v1.0.1` (commit `3303592588e388e62e0f69f701af531d2f4e3991`); normative `specification/a2a.proto` |
| Access date | 2026-11-06 |
| License | Apache-2.0 |
| Maturity | Stable 1.x; `main` has moved on (`9fff3e08ab33bb7674e7d98fc7c08ae8592bb4bd`), not read for this note |
| HCS action | adapter (AGENT-1, optional remote delegation only) |

## What it defines

A protocol for independently deployed agents to discover each other and exchange messages, tasks and artifacts. The data model and the abstract operations are defined once in `a2a.proto` (`service A2AService`: `SendMessage`, `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`, `SubscribeToTask`, push-notification config CRUD, `GetExtendedAgentCard`). Three official protocol bindings map them onto the wire: `JSONRPC` (JSON-RPC 2.0 over HTTP, SSE for streaming, PascalCase method names), `GRPC`, and `HTTP+JSON` (REST). Discovery is through an Agent Card, typically at `https://{domain}/.well-known/agent-card.json`.

## Key objects and fields

(proto field names; the JSON form uses lowerCamelCase, e.g. `supportedInterfaces`)

- `AgentCard`: `name`, `description`, `supported_interfaces` (ordered, first preferred), `provider`, `version`, `documentation_url?`, `capabilities`, `security_schemes` (map), `security_requirements`, `default_input_modes`, `default_output_modes` (media types), `skills`, `signatures` (JWS, `AgentCardSignature`), `icon_url?`. Required: name, description, supported_interfaces, version, capabilities, default modes, skills.
- `AgentInterface`: `url`, `protocol_binding` (open string; core values `JSONRPC`, `GRPC`, `HTTP+JSON`), `tenant?`, `protocol_version` (e.g. `"1.0"`).
- `AgentCapabilities`: `streaming?`, `push_notifications?`, `extensions` (repeated `AgentExtension`), `extended_agent_card?`.
- `AgentExtension`: `uri`, `description`, `required` (bool), `params` (`google.protobuf.Struct`).
- `AgentSkill`: `id`, `name`, `description`, `tags` (required), `examples`, `input_modes`, `output_modes`, `security_requirements`. Skills are descriptive, not callable endpoints.
- `AgentProvider`: `url`, `organization`.
- Service parameters: `A2A-Version` (clients MUST send it; unsupported → `VersionNotSupportedError`) and `A2A-Extensions` (comma-separated extension URIs), as HTTP headers or gRPC metadata.
- Errors (spec §5.4): A2A errors map to JSON-RPC codes `-32001`..`-32009` (e.g. `TaskNotFoundError -32001`, `UnsupportedOperationError -32004`, `ExtensionSupportRequiredError -32008`, `VersionNotSupportedError -32009`), with parallel gRPC status and HTTP status mappings; range `-32001`..`-32099` reserved for A2A.

## Extension points

- Extensions are identified by URI and declared in `AgentCard.capabilities.extensions`; `required: true` means clients that do not activate it get rejected.
- Activation is per request: client sends `A2A-Extensions`; agent ignores unsupported ones and SHOULD echo the activated list in the response.
- Data goes in `metadata` maps on core objects (`Message`, `Artifact`, etc.), keyed by extension URI, plus an `extensions` URI list on the object. Extensions MUST NOT add fields to core messages or new enum values.
- Kinds named in the docs: data-only, profile, method (new RPCs, "extended skills"), state-machine extensions. Extensions may depend on others; the client activates dependencies.
- Official extensions use the `https://a2a-protocol.org/extensions/` prefix and `ext-` repos (`experimental-ext-` for experimental).
- Custom protocol bindings SHOULD be identified by a URI in `protocol_binding`.

## Where HCS references it instead of redefining

- AGENT-1: a remote-agent contribution points to an A2A Agent Card URL (or embeds a pinned card); HCS MUST NOT restate `AgentCard`, `AgentSkill` or `AgentInterface`.
- HCS-0002: `AgentSkill.id` is local to one card; HCS capability IDs MAY reference it as `(card, skill id)` but MUST NOT reuse it as a global capability ID.
- HCS-0003: compatibility on A2A uses `AgentInterface.protocol_version` (`Major.Minor`) and the binding string, not the agent's own `version`.
- HCS-0005: `security_schemes`/`security_requirements` describe how to authenticate to the remote agent; they are inputs to an HCS grant decision, never a grant themselves.
- HCS-0006: HCS errors crossing an A2A boundary map to the §5.4 table (JSON-RPC, gRPC and HTTP columns); HCS does not invent codes in `-32001..-32099`.
- DISTRO-1 (optional): `AgentCard.signatures` (JWS) can serve as provenance for a remote agent entry.

## Pitfalls for HCS

- A2A targets remote, independently deployed agents; modelling local plugins as A2A agents adds identity, discovery and auth cost for nothing. (catalog)
- "Skill" collides with Agent Skills (`SKILL.md`); an A2A skill is a descriptive capability, not a procedure package.
- "Task" collides with MCP Tasks; different object and lifecycle.
- JSON Schema is a build artifact, not committed; validate against the proto or a generated schema pinned to the tag. (catalog, `specification/json/README.md`)
- Three bindings with different method naming; HCS fixtures must name the binding.

## Sources

Read as repository files at tag `v1.0.1`; https://a2a-protocol.org was not fetched in this pass [U for live-site drift].

- https://github.com/a2aproject/A2A/blob/v1.0.1/specification/a2a.proto
- https://github.com/a2aproject/A2A/blob/v1.0.1/docs/specification.md (§3.6 versioning, §4.6 extensions, §5.4 error mappings, §8 Agent Card, §9-11 bindings)
- https://github.com/a2aproject/A2A/blob/v1.0.1/docs/topics/extensions.md
- https://github.com/a2aproject/A2A/releases/tag/v1.0.1
- https://github.com/a2aproject/A2A/blob/v1.0.1/GOVERNANCE.md
