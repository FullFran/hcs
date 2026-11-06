# ADR-0019: Host-owned settings take precedence over generation content

**Status:** Proposed (2026-11-06)

## Context

Today the desktop host lets a generation skill replace a bundled skill of the same name, while permissions, MCP servers and the content-safety proxy stay from the bundle and no generation can touch them. That rule exists only in launcher code. UAPI.6 ([uapi-config-files.md](../standards/uapi-config-files.md)) defines the general layering: vendor defaults, administrator overrides that always win, masking. Engines have their own versions of it, for example one engine's managed settings at highest precedence.

## Decision

- Two host layers: **host-owned settings** (non-negotiable; the host declares the list) and **host-provided defaults** (replaceable).
- A generation contribution may add, may replace a host-provided default, and may narrow a host-owned setting; it MUST NOT replace, remove or widen a host-owned setting (HCS-0008-R007), reported as `permission_denied`.
- Two generation contributions with the same engine-level name are a collision: neither is projected, `ambiguous_provider` for both (R006). The generation is one signed set; an order-dependent winner would make the result depend on scan order.
- HCS defines no vocabulary of settings (OQ-0008-2), as HCS-0005 defines no permission vocabulary.

## Consequences

- The desktop host's current behaviour conforms once it declares permissions, MCP servers and the proxy as host-owned and bundled skills as defaults.
- Reference cases model settings as engine-level names with an effect (`add`, `replace`, `remove`, `widen`, `narrow`); the effect of an extension kind is stated by the case, because its meaning is distribution-defined.
- Alternative rejected: "generation always wins" (it would let a signed but compromised catalog disable the safety proxy) and "last package wins" (order-dependent).
