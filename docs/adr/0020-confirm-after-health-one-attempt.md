# ADR-0020: Confirm a generation after a health check, with one attempt and one rollback

**Status:** Proposed (2026-11-06)

## Context

The desktop host confirms a generation only after the engine server is healthy, else rolls back once and never loops. The server-side box host confirms in its sync service, without any engine having started from the generation. HCS-0007-R018 already says a failed health check is a failed transition, but not what "confirmed" means or how often to retry. UAPI.1 boot counting and systemd Automatic Boot Assessment ([uapi-boot-counting.md](../standards/uapi-boot-counting.md)) define the established pattern: a new entry is indeterminate, the running system decides success, a bounded number of tries, then fallback.

## Decision

- Adopt that state model with the number of tries fixed to one (HCS-0008-R013, R015, R016): confirm only after an engine run started from the generation passed the host's health check within its deadline; on failure report `plugin_failed` or `timeout`, start the confirmed generation, never retry the failed one automatically; if the rollback also fails, stop.
- Where the engine reports what it loaded, the health check includes that every projected skill and MCP server is loaded (R014). A process that answers is not proof that the generation reached it.
- HCS names no health protocol: HTTP status (Kubernetes semantics), gRPC `grpc.health.v1`, or a command are all acceptable ([kubernetes-probes.md](../standards/kubernetes-probes.md), [grpc-health.md](../standards/grpc-health.md)).

## Consequences

- The server-side box host must move confirmation from the sync service to after an engine run.
- Alternatives rejected: N tries (boot counting's general form), because a generation is immutable and a deterministic failure repeats; automatic retry after a delay, because it is the loop the first host already avoids.
