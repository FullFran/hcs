# OpenSandbox

| Field | Value |
| --- | --- |
| Owner | AAIF (Linux Foundation), contributed by Alibaba; repo `opensandbox-group/OpenSandbox` |
| Version pinned | release-1.2.0 (GitHub release 2026-10-27); OpenAPI documents `OpenSandbox Lifecycle API` and `OpenSandbox Egress API`, each `info.version: 0.1.0` |
| Source pinned | opensandbox-group/OpenSandbox@release-1.2.0 (commit 62a64f0b48cdd6b410f36e53c74dc7559c87719a): `specs/sandbox-lifecycle.yml`, `specs/egress-api.yaml` |
| Access date | 2026-11-06 |
| License | Apache-2.0 |
| Maturity | AAIF Sandbox stage (per catalog, pre-verified); API documents still at 0.1.0; no conformance suite found |
| HCS action | profile backend (ISOLATION-1, one optional backend) |

## What it defines

A sandbox platform for agents: an HTTP lifecycle API to create, inspect, pause, resume,
snapshot and delete sandboxes (Docker or Kubernetes runtimes), an in-sandbox execution API
(`execd-api.yaml` [U: not read]), a sidecar egress API for outbound network policy, and a diagnostic API (`diagnostic-api.yml` [U: not read]).
Design changes go through OSEPs (`oseps/0001`..`0020` at this tag).

## Key objects and fields

- Lifecycle paths: `/sandboxes`, `/sandboxes/{sandboxId}`, `/pause`, `/resume`,
  `/renew-expiration`, `/endpoints/{port}`, `/metadata`, `/snapshots`, `/networkpolicy`,
  `/credential-vault`, `/templates`, `/metrics/events`.
- `CreateSandboxRequest`: `image` or `snapshotId` or `templateId`, `platform`, `timeout`,
  `resourceLimits`, `resourceRequests`, `env`, `metadata`, `lifecycle`, `entrypoint`,
  `networkPolicy`, `credentialProxy`, `secureAccess`, `volumes`, `extensions`.
- `Sandbox`: `id`, `status`, `createdAt`, `entrypoint` (required), `image`, `metadata`,
  `extensions`, `allocation`, `expiresAt`.
- `SandboxStatus`: `state` (required), `reason`, `message`, `lastTransitionAt`.
  `SandboxState`: `Pending`, `Running`, `Pausing`, `Paused`, `Resuming`, `Stopping`,
  `Terminated`, `Failed`; clients must tolerate unknown values.
- `NetworkPolicy`: `defaultAction` (`allow | deny`), `egress` list of `NetworkRule`
  (`action`, `target` FQDN / wildcard domain / IP, `ports`).
- Egress API (sidecar, reached via the lifecycle endpoint for the egress port): `/policy`
  `GET`, `PATCH`, `DELETE`; `/credential-vault` routes; optional `OPENSANDBOX-EGRESS-AUTH` header.
- Auth: lifecycle API key header `OPEN-SANDBOX-API-KEY`.

## Extension points

- `extensions`: string-to-string map on create and on `Sandbox` (e.g. `extensions.poolRef`,
  `extensions["access.renew.extend.seconds"]`).
- `metadata` map; new states may be added (documented forward-compatibility rule).
- OSEP process for new API surface.

## Where HCS references it instead of redefining

- ISOLATION-1 MAY name `opensandbox` as a backend: an HCS isolation request (no fs, no net,
  limits) maps to `CreateSandboxRequest` fields (`networkPolicy` with `defaultAction: deny`,
  `resourceLimits`). HCS MUST NOT restate the OpenSandbox schemas. [I]
- HCS-0004 lifecycle stays HCS's own state machine; an adapter maps OpenSandbox `SandboxState`
  to HCS states, not the reverse. [I]
- HCS-0006: OpenSandbox HTTP errors (`BadRequest`, `Forbidden`, `Conflict`, ...) map to HCS
  error codes in the adapter. [I]

## Pitfalls for HCS

- API is 0.1.0 and fast-moving; pin the release tag, not `main`.
- Egress policy can change at runtime via the sidecar; ISOLATION-1 negative tests must check
  that the plugin cannot reach the egress API itself. [I]
- Remote/container platform: heavy for a desktop distribution; one backend, not the definition
  of isolation.
- Credential vault features overlap HCS-0005 secrets handling; keep HCS out of credential
  formats. [I]

## Sources

- https://github.com/opensandbox-group/OpenSandbox/releases/tag/release-1.2.0
- https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/specs/sandbox-lifecycle.yml
- https://github.com/opensandbox-group/OpenSandbox/blob/release-1.2.0/specs/egress-api.yaml
- https://github.com/opensandbox-group/OpenSandbox/tree/release-1.2.0/oseps
