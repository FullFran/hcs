# HCS-0009 Tool surface: effect classes of package tools

| Field | Value |
| --- | --- |
| Status | Draft |
| Version | 0.1.0-draft |
| Requires | HCS-0001, HCS-0005, HCS-0006, HCS-0008 |
| Replaces | none |
| Schema | `schemas/hcs-0009/tool-effects/v0.1/tool-effects.schema.json` (`urn:hcs:schema:hcs-0009:tool-effects:0.1`) |

## 1. Scope

A package can contribute an MCP server (HCS-0001 `mcp-server`, HCS-0008 section 6.4), and a host shows the tools of that server to an engine, a client and a person, who decide whether a call needs a question first. To decide, the host needs to know what a tool does to the world: only reads, only adds, or may change or remove something. MCP carries that as `ToolAnnotations` hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), but they are optional, they come from the server itself, and their defaults are the most dangerous values ([docs/standards/mcp.md](../docs/standards/mcp.md)). Three independent harnesses built the same step on their own: each classifies every tool it exposes into a small set of effects, maps the class to annotations, and treats a tool nobody classified as the most dangerous one ([ADR-0034](../docs/adr/0034-tool-effect-classes.md)).

This document defines the effect classes, where a package declares them, the mapping to MCP annotations, and what a host does with a tool that has no usable declaration. It does not define permission ids (HCS-0005 OQ-0005-1), approval modes, which classes ask a question (a distribution policy, README rule 4), or how a tool's arguments are judged.

## 2. Terms

- **Effect class:** one of `read`, `additive` or `destructive`.
  - `read`: the tool changes nothing the person could observe.
  - `additive`: the tool may create data or records, and never changes or removes existing ones.
  - `destructive`: the tool may change or remove existing data, or has an effect the person cannot undo (for example sending or publishing).
- **Declaration:** the entry for one tool, `{ "effect": <string>, "idempotent": <boolean, optional>, "openWorld": <boolean, optional> }`, plus extension members. `idempotent` says that repeating the same call with the same arguments has no further effect. `openWorld` says that the tool reaches things outside the system the server owns (the web, other people's accounts).
- **Tool name:** the name the server reports in `tools/list`. It is local to the server (HCS-0002 does not treat it as an identifier).

## 3. Where a package declares

The declarations are the member `tools` of the object at `_meta["io.github.fullfran.hcs"]` in the server's `server.json`: a map from tool name to declaration. `server.json` already is the descriptor of an `mcp-server` contribution (HCS-0008-R010) and, for a `file` server, travels in the same signed package as the code it describes; HCS-0000 section 7 names this `_meta` key for HCS's own extensions to MCP documents. The catalog manifest (HCS-0001) is not used: a tool list belongs to the server, not to the catalog entry, and the manifest would repeat it. A tool listed by the server can only be known at run time, so the declaration is checked against what the server lists when the host reads `tools/list`; a declaration for a tool the server does not list has no effect.

**[HCS-0009-R001]** If the `_meta["io.github.fullfran.hcs"]` member of a `server.json` of an `mcp-server` contribution is present, it MUST validate against the `serverMeta` definition of the HCS-0009 schema, and an adapter MUST report `manifest_invalid` for an entry whose member does not.

**[HCS-0009-R002]** A package that contributes an `mcp-server` SHOULD declare every tool its server lists.

R001 does not reject an unknown class: `effect` is any non-empty string, so a class added by a later version is a valid document (R004). It is part of the first check of HCS-0008 (`manifest_invalid`), before any `unsupported_contribution` or `permission_denied`.

## 4. Mapping to MCP annotations

Let `idempotent` be `true` only when the declaration says so, and `openWorld` be `false` only when the declaration says so.

| Effect class | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- |
| `read` | `true` | `false` | `true` | `openWorld` |
| `additive` | `false` | `false` | `idempotent` | `openWorld` |
| `destructive` | `false` | `true` | `idempotent` | `openWorld` |

**[HCS-0009-R003]** A host that presents the tools of a projected MCP server to an engine, a client or a person MUST present each tool with the four annotations that the table in section 4 gives for its declaration.

## 5. Fail closed

**[HCS-0009-R004]** A host MUST present a tool whose declaration is missing, or whose `effect` is not `read`, `additive` or `destructive`, as `destructive` with `idempotent` false and `openWorld` true, that is `readOnlyHint` false, `destructiveHint` true, `idempotentHint` false and `openWorldHint` true.

The values in R004 are the MCP defaults for a tool without annotations, written down so that a host that sends no annotations at all is not the only way to get them. A host MAY refuse to start a server that has undeclared tools; this document does not require it.

**[HCS-0009-R005]** A host MUST NOT take the effect of a tool from the annotations the server reports for itself, and MUST replace them with the annotations of R003 or R004 when it presents the tool.

MCP says a client must treat annotations from a server it does not trust as untrusted. A signed package can still contain a server that describes itself as read-only and writes; the declaration is covered by the package's content hash and signature, the server's run-time answer is not.

### 5.1 Finding the declaration

An engine does not present the name the server reports: it flattens it with the server name (for example `<server>_<tool>` or `mcp__<server>__<tool>`, HCS-0008 appendix A). Flattening can lose information: server `files` with tool `x_list` and server `files_x` with tool `list` both become `files_x_list` under `<server>_<tool>`. A host that splits the flattened name would read one tool's declaration for the other, and a `read` declaration could reach a `destructive` tool, which then runs without a question. HCS-0008-R040 keeps two tools from sharing an engine name; this requirement keeps the host from needing to parse one.

**[HCS-0009-R007]** A host MUST look up a tool's declaration by the projected `mcp-server` contribution that listed the tool and the tool name that server reports. It MUST NOT recover the server or the tool by parsing a name that an engine built.

- Valid: the host keeps a map from engine name to (contribution, tool name), built at projection time, and reads the declaration through it.
- Invalid: only server `file_store` is projected, with tool `list` declared `read`, under `<server>_<tool>`. The host splits the engine name `file_store_list` at the first `_`, looks for server `file` and tool `store_list`, finds no declaration and presents the tool under R004. Splitting at the last `_` fails the same way: a server name and a tool name can both contain the separator, so no split recovers the pair, even without a collision.

The map is part of the projection, and it changes with the tool list (R008): a host that keeps a map built for an earlier list presents a later list by the earlier one. The same identity, the contribution and the raw tool name, is what a call sends to the server: the engine name is never sent to it. One harness implements this shape; its public name is a pure function of the server name from local configuration and the raw tool name, and it is never parsed back ([ADR-0040](../docs/adr/0040-tool-identity-and-list-drift.md)).

### 5.2 Every list, not only the first

A server can list tools its package did not declare, and a server that is not shipped with the package (`remotes` in `server.json`) can add tools without a new package version. The declaration binds to the server by the entry's `server.json`; a listed tool without a declaration is already `destructive` and open-world (R004), a self-reported annotation is already ignored (R005) and a class grants nothing (R006). Drift therefore fails closed, if the host applies those rules to every list.

**[HCS-0009-R008]** A host MUST apply R003 and R004 to every `tools/list` result of a projected server, including results after a `notifications/tools/list_changed`, and MUST NOT keep the annotations it presented for a name across a list in which that name is absent.

- Valid: the first list has `search` (declared `read`). After `list_changed`, the list also has `purge_all`, which is undeclared, so the host presents `purge_all` as destructive and open-world.
- Invalid: the host reads the declaration only for the first list it received and presents later tools with the server's own `readOnlyHint: true`.

**[HCS-0009-R009]** A host SHOULD report, to its operator, the names a server lists that its package does not declare, so the publisher can declare them.

**[HCS-0009-R010]** When a later `tools/list` result of a projected server would give a tool an engine name already used by a tool of another projected server, by a tool the host provides, or by another tool of the same list, the host MUST NOT present the tools involved from that list and MUST report them to the operator. The map from engine name to (contribution, tool name) stays injective, and the tools of other servers presented earlier keep their names.

- Valid: server `files` is presented with `x_list` as `files_x_list` under `<server>_<tool>`. After a `list_changed`, server `files_x`, which listed nothing before, lists `list`. The host does not present that tool and reports it; `files_x_list` still reaches `files`.
- Invalid: the host presents `list` of `files_x` as `files_x_list` too and overwrites the map entry, so a call meant for `files` is presented with the declaration of `files_x`.

A tool already presented keeps its name and only the tool from the later list is withheld; this is deliberate, so that a running session is not disrupted, and it differs from R040's order-free "neither" because R040 applies before anything is presented. A withheld tool is evaluated again on every later list of its own server (R008): once its name no longer collides, for example because the latest list of the earlier server no longer has the tool, the host presents it under R003 or R004.

This is the run-time counterpart of HCS-0008-R040, which sees only the lists the host has at projection time. It does not reject the generation: R040's `ambiguous_provider` is a projection outcome, and a later list cannot reopen a generation the host already confirmed.

A remote server whose declarations a host cannot match by tool name (for example, a server that renames tools per account) is out of scope: every one of its tools is undeclared and falls under R004.

## 6. A class is metadata, not a grant

**[HCS-0009-R006]** A host MUST NOT treat a declared effect class, `read` included, as a grant, and MUST evaluate every `tools/call` of a package's server under HCS-0005-R001 as if the declaration did not exist.

This is HCS-0005-R002 applied to tool metadata: `readOnlyHint` and the class behind it are what the publisher says, and the host decides. A distribution may use the class to decide when to ask a person (for example never for `read` once a grant exists); it does so in its own policy, not by skipping the check.

## 7. Conformance

`document` cases check the shape of the member (R001) and, through the schema's `classification` definition, the annotations that follow from a declaration (R003) and from a missing or unknown one (R004). `authority` cases check that a declared class gives no grant (R006). `host` cases check what a host presents (R003 to R005), which declaration a call is presented with (R007) and what a host presents after a `list_changed` (R008, R010). R009 is a SHOULD and has no cases. The reference SDK implements the mapping in `sdk/ts/src/tool-effects.ts`.

## 8. Open questions

- OQ-0009-1: finer classes. One harness separates move, copy, rename and archive from create, delete and edit, and judges the call by whether its destination exists; this document maps all of them to `additive` or `destructive` and leaves the finer judgement to an `x-<distribution>` member of the declaration. A second harness that needs them would justify a core class.
- OQ-0009-2: a class for effects that leave the system and cannot be undone (send, publish). Today they are `destructive` with `openWorld` true.
- OQ-0009-3: closed (draft.12). A host does not trust a remote server to list only what was declared, and does not need to: the binding is the entry's `server.json`, read by name; R004 and R005 already cover the undeclared and self-reported cases, R008 applies them to every list, and R009 asks the host to report what is undeclared ([ADR-0040](../docs/adr/0040-tool-identity-and-list-drift.md)).
- OQ-0009-4: classes for MCP resources and prompts, and for tools a harness provides itself (not through a package).
