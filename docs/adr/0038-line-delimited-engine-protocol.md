# ADR-0038: The line-delimited JSON engine protocol two harnesses use instead of ACP

**Status:** Proposed

## Context

HCS-0008 section 6.8 defines how a host projects a generation into an engine it drives over ACP, with an extension under `io.github.fullfran.hcs` ([ADR-0027](0027-projection-over-acp.md)). Two other harnesses drive an engine process (a Pi-based program with RE;write's or training-mcp's MCP server as its only tools) over a different protocol, and the second one took it from the first with an explicit decision not to use ACP. The question is what HCS should say about that protocol, if anything. This ADR decides nothing normative; section 6.8 does not change.

## Evidence

- RE;write (public), `src/adapters/engine-protocol.ts`: one JSON object per line on the engine's stdin and stdout; the parent's messages are a closed set (`start`, `login.start`, `refresh`, `token`, `prompt`, `models.get`, `reset`, ...); errors are a closed set of codes; everything the child sends is untrusted, parsed against fixed shapes, with unknown fields dropped; a line limit of 1 MiB; text from a model provider has no field to travel in. `docs/engines.md` describes the engine model and says the embedded engine is a flagged, off-by-default process per writer, with the MCP server as a host-owned server.
- training-mcp (public), `engine/protocol.ts` and `docs/coach.md`: the same protocol, with the Go side as the authority. Provider error text never travels; errors are a closed code set. The engine reaches the MCP server on loopback only, with an engine token. Section "Why this protocol and not ACP" gives its reasons: a dozen flat message types that a Go struct parses directly against JSON-RPC with sessions and permission methods; the credential, single refresher and device login are already messages while ACP would need extension methods; ACP permission and file-system callbacks would be dead surface when the engine has no tools besides MCP. ACP stays a later option.
- HCS-0008 6.8 and ADR-0027: the ACP path exists because the first host's sidecar is an ACP agent; it adds skills, a generation id and a loaded-resources report.
- What the line protocol does not carry today: skills, a generation identifier, a loaded-resources report, a fail-closed refusal on another generation. The two harnesses do not project a generation through it yet.

## Options

1. **Adopt it as a second engine profile in HCS-0008.** Name the transport, the closed message and error sets and the per-line limit, and add the three ACP gaps (generation id, skill paths, loaded report) as messages. Pro: two independent implementations already agree on the transport and the safety properties. Con: HCS would specify a product-shaped protocol (login, model lists) that the evidence does not show to be common; the parts both share are about a credential and a chat, not projection; it competes with ACP, which HCS prefers to profile (README rule 6).
2. **Profile ACP more narrowly.** Keep ACP as the only wire protocol HCS names and write down which ACP subset an engine needs (`session/new`, `mcpServers`, no file-system or permission callbacks) and which safety properties hold (closed error set, untrusted peer, line limit). Pro: one protocol; addresses the harnesses' stated objection (dead surface, client library cost) without a second protocol. Con: the cost objection (hand-written JSON-RPC) stays; does not describe what the two harnesses run.
3. **Keep it a distribution extension.** Leave HCS-0008 as is; the protocol stays in the harnesses (`x-<distribution>`), per README rule 4. Pro: no normative text before it is needed; matches rule 1 (only 2 of 3 harnesses, none projecting through it). Con: a third host would reimplement it; the properties (closed errors, untrusted peer, no provider text) are not stated anywhere HCS-wide.

## Recommendation

Option 3 now, with the properties of option 2 written as a non-normative note when a second harness projects a generation through either protocol. Reasons: the line protocol carries no projection yet, so there is nothing for HCS-0008 to require of it; the two harnesses share one author, so the agreement is weaker evidence than two independent consumers; and the safety properties (closed error codes, untrusted peer, provider text never travels, loopback-only token) are valuable but are properties of a host, not of projection. Revisit when a harness other than these two adopts the protocol, or when one of them projects a generation through it and needs R001, R005 and R014 to apply.

## Consequences

- No change to section 6.8 or to any requirement. Section 9 gains OQ-0008-8 pointing here.
- A host that drives an engine over the line protocol can follow HCS-0008 R001 to R005 and R014 only by its own means until a profile exists; its entries stay reported under R004 for kinds it cannot project.
- If option 1 is chosen later, the three ACP gaps get a second encoding and R026 to R029 need a transport-neutral wording.
- The user decides: the status stays Proposed until they accept it.
