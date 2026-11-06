# gRPC Health Checking Protocol

| Field | Value |
| --- | --- |
| Owner | gRPC project, CNCF (Linux Foundation) |
| Version pinned | service `grpc.health.v1.Health` as documented at gRPC v1.83.2 |
| Source pinned | `grpc/grpc@v1.83.2` (`3b05ca3dff22b16879fde0a2852577ebdb493edc`), `doc/health-checking.md` |
| Access date | 2026-11-06 |
| License | Apache-2.0 |
| Maturity | Stable; used by Kubernetes gRPC probes and load balancers |
| HCS action | reference only (one possible health check transport; HCS-0008 names none) |

## What it defines

A gRPC service that a server exports so clients and control systems can ask whether it can handle requests: `Check` returns a `ServingStatus` (`UNKNOWN`, `SERVING`, `NOT_SERVING`, and `SERVICE_UNKNOWN` for watch) for the whole server or a named service, and `Watch` streams status changes. A server may answer "not serving" while starting, shutting down or for any other reason; the caller decides what to do when no answer arrives within its time window.

## Where HCS references it instead of redefining

- HCS-0008 defines no health check protocol. A host whose engine speaks gRPC can use this service; engines that expose HTTP use an HTTP status check (Kubernetes treats 200 to 399 as success, [kubernetes-probes.md](kubernetes-probes.md)). What HCS-0008 requires is the outcome: pass or fail, within a host deadline, before confirmation.

## Pitfalls for HCS

- `SERVING` says the process answers; it does not say that the generation's skills or MCP servers were loaded. HCS-0008 adds a loaded-set check where the engine exposes one.
- There is no neutral standard health response format for HTTP: the IETF "Health Check Response Format for HTTP APIs" draft expired without becoming an RFC [U: draft status not re-checked in this pass].

## Sources

- https://github.com/grpc/grpc/blob/v1.83.2/doc/health-checking.md
