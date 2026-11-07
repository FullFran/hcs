# ADR-0025: Host guards sit on a boundary the engine cannot bypass and fail closed

**Status:** Proposed (2026-11-07)

## Context

Two guards a host owns can leak in the same way. Research on an engine the first host is adopting shows that its message hooks (`context`, before-provider-request, tool-result) catch a handler's exception, log it and continue with the unmodified data; only the pre-tool-call hook blocks on error. The engine also sends model requests of its own (compaction, branch summaries, cache warming) that never pass through those hooks. So a content-safety guard in the hooks misses requests (#29), and an approval path built on them lets a tool run when the dialog closes, the deadline passes or the handler throws (#31).

## Decision

- A guard on model requests sits on the model transport (a host-provided provider or base URL, or an egress proxy) so it sees every request of the run, the engine's own included (HCS-0008-R019). Engine hooks may add a second layer, never replace it.
- A guard that is unavailable or fails lets no request reach the provider (HCS-0008-R020).
- An operation waiting for a person runs only on an explicit allow before the deadline; reject, timeout, ACP `cancelled`, a handler error and a lost connection all deny with `permission_denied` (HCS-0005-R014). The decision record says which (`deny`, `timeout`, `error`), which also gives HCS-0005-R010 its timeout and error cases.
- Answers come only through the host's own channel to the person, never from model, tool or package text (HCS-0005-R015).

## Consequences

- A host whose engine cannot route all model traffic through a host-set provider or proxy cannot claim a guard under R019 on that engine.
- Failing closed turns a guard outage into a stopped run. That is intended: an outage that silently sends unmasked data is the failure the guard exists to prevent.
- Alternatives rejected: guards in engine hooks with a "fail closed" configuration (it depends on each engine's hook semantics and still misses the engine's own requests); treating a timeout as `timeout` instead of `permission_denied` (callers would need to branch on two codes for the same outcome; the record keeps the distinction).
