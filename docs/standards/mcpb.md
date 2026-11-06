# MCP Bundles (MCPB, `manifest.json`)

| Field | Value |
| --- | --- |
| Owner | MCP organisation (`modelcontextprotocol/mcpb`), formerly "Desktop Extensions" (DXT) |
| Version pinned | manifest `manifest_version` `0.3` |
| Source pinned | `modelcontextprotocol/mcpb@v2.1.2` (`2a788100a60db19a6b1c018fb1cf84ae85de9537`, released 2025-12-04); `MANIFEST.md` read on `main` |
| Access date | 2026-11-06 |
| License | MCP licensing transition (see [mcp.md](mcp.md)); the GitHub licence field reports `NOASSERTION` [F] |
| Maturity | Versioned manifest (0.x); implemented by desktop MCP clients [U: client list not checked]; the registry accepts `mcpb` as a `registryType` |
| HCS action | out; reference only (the closest neutral precedent for a plugin manifest) |

## What it defines

A zip archive (`.mcpb`) that holds one local MCP server and a `manifest.json` describing it, so that a desktop client can install it in one step. The manifest carries identity, the command that starts the server, compatibility (client versions, `platforms` as `darwin`, `win32`, `linux`, runtime versions) and `user_config`: inputs the user supplies at install time, with `sensitive: true` for secrets, referenced from the server's environment as `${user_config.<key>}`.

## Key objects and fields

- Required: `manifest_version`, `name`, `version`, `description`, `author`, `server`.
- Optional: `compatibility`, `user_config`, `tools`, `prompts`, `icons`, `_meta` (reverse-DNS keys).

## Where HCS references it instead of redefining

- Nowhere normatively. An HCS package is already the unit of distribution (HCS-0001), and an MCPB archive inside it would be a second package format. A `server.json` with `registryType: mcpb` can still point to one ([mcp-registry-server-json.md](mcp-registry-server-json.md)).
- The `sensitive` input pattern (declare the secret, let the client hold the value) is the same rule HCS-0008 applies to `server.json` inputs.

## Pitfalls for HCS

- MCPB covers one MCP server, not skills, instructions or policies; it is not a general agent plugin manifest. No neutral general plugin manifest exists for agent engines (see [host-adapter-standards.md](../research/host-adapter-standards.md)).
- `compatibility.platforms` uses Node.js `process.platform` names, not the OCI platform object HCS-0001 uses.

## Sources

- https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md
- https://github.com/modelcontextprotocol/mcpb/releases/tag/v2.1.2
