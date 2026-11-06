# MCP Registry `server.json`

| Field | Value |
| --- | --- |
| Owner | Model Context Protocol a Series of LF Projects, LLC; the registry is a sub-project of the MCP organisation (`modelcontextprotocol/registry`); MCP is an AAIF project [F] (https://aaif.io/projects, read 2026-11-06) |
| Version pinned | schema `2025-12-11` (`$id` `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`); a `draft` schema exists for the next revision |
| Source pinned | `modelcontextprotocol/registry@v1.8.7` (`741d575fc2ffe774fa51f442ec6fb2987dd03e18`, released 2026-10-30), files `internal/validators/schemas/2025-12-11.json`, `docs/reference/server-json/CHANGELOG.md` |
| Access date | 2026-11-06 |
| License | MCP licensing transition: new code and specification contributions Apache-2.0, documentation CC-BY-4.0, older contributions MIT until relicensed (repository `LICENSE`) |
| Maturity | Dated schema revisions (2025-07-09 to 2025-12-11) with a changelog; used by the official MCP registry and its downstream registries [F]; the registry service itself is described as community driven |
| HCS action | profile: the descriptor of an `mcp-server` contribution ([ADR-0017](../adr/0017-mcp-descriptors-profile-server-json.md), HCS-0008) |

## What it defines

A static JSON description of one MCP server: who it is, which versions exist, and how a client installs and configures it, either as a package that the client runs locally (`packages`) or as a remote endpoint (`remotes`). It is what an MCP registry stores and what a client reads to configure a server. It does not define the client's own configuration file; each client still has its own (`mcp{}` in one engine, `mcp.json` in another).

## Key objects and fields

- `ServerDetail`: required `name` (reverse-DNS namespace, exactly one `/`, for example `io.github.user/weather`), `description`, `version`; optional `title`, `repository`, `websiteUrl`, `icons`, `packages[]`, `remotes[]`, `_meta`.
- `Package`: required `registryType` (examples `npm`, `pypi`, `cargo`, `oci`, `nuget`, `mcpb`), `identifier`, `transport`; optional `version`, `registryBaseUrl`, `fileSha256` (required for `mcpb`), `runtimeHint`, `runtimeArguments[]`, `packageArguments[]`, `environmentVariables[]`.
- Transports: `stdio`, `streamable-http`, `sse`. A remote transport has `url` (a template with `{variables}`), `headers[]` and `variables{}`.
- `Input` (used by environment variables, headers, arguments and URL variables): `description`, `isRequired`, `isSecret` (default false; "clients should handle the value securely"), `format`, `value`, `default`, `placeholder`, `choices`. `KeyValueInput` adds `name`.

## Extension points

- `_meta` with reverse-DNS keys; `io.modelcontextprotocol.registry/publisher-provided` is reserved for publisher data.
- New schema revisions get a new dated `$id`; the changelog lists the differences.

## Where HCS references it instead of redefining

- HCS-0008: the content of an `mcp-server` contribution is a `server.json` document of a pinned schema revision. HCS restates none of its members.
- HCS-0008 profiles it in one point: an input with `isSecret: true` carries no `value` and no `default` inside a generation; the host supplies secrets. The schema allows a literal secret value; a distributed, signed and cached generation must not contain one.
- HCS-0005: `isRequired` and `isSecret` describe what the server needs; they are requests, never grants.

## Pitfalls for HCS

- `name` uses a `/` and mixed case; it is not an HCS capability id (HCS-0002) and must not be treated as one.
- URL templates may start with a variable in the `draft` schema (CHANGELOG); pinning `2025-12-11` excludes that until a new revision is chosen.
- `fileSha256` integrity is the client's job for `mcpb` packages; inside an HCS package the package `contentHash` already covers the bytes.
- The schema is published as draft-07 style (`definitions`), not JSON Schema 2020-12; HCS schemas must not `$ref` into it without checking dialect compatibility [I].

## Sources

- https://github.com/modelcontextprotocol/registry/blob/741d575fc2ffe774fa51f442ec6fb2987dd03e18/internal/validators/schemas/2025-12-11.json
- https://github.com/modelcontextprotocol/registry/blob/741d575fc2ffe774fa51f442ec6fb2987dd03e18/docs/reference/server-json/CHANGELOG.md
- https://github.com/modelcontextprotocol/registry/blob/741d575fc2ffe774fa51f442ec6fb2987dd03e18/LICENSE
- https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json (canonical URL, not fetched separately [U for drift])
- https://aaif.io/projects
