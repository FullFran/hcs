# Host adapter: existing standards per concern

**Status:** research note, not normative. Access date for all sources: 2026-11-06.
**Labels:** [F] verified fact with a primary source; [I] inference by the author of this note; [U] could not be verified; [H] reported by the first host, not verified independently.

## 1. The gap

The first host already has signed catalog distribution (HCS-0007), resolution before activation (entries with `platform_incompatible` or `version_incompatible` are dropped before a generation is built), and an atomic `active` pointer to the current generation directory: `<generation>/generation.json` plus `packages/<package-id>/` holding `skills/<name>/SKILL.md`, `mcp/<name>/integration.json`, `instructions/{agents,commands,instructions}/*.md` and `policies/*` [H].

What it lacks is the step that turns the active generation into each engine's runtime configuration. Today [H]:

- **A desktop host** exports one engine's inline configuration with a single skills path to `<generation>/packages`. Bundled skills still load and a generation skill with the same name wins; MCP, permissions and the content-safety proxy stay from the bundle. It confirms a generation only after the engine server is healthy, else rolls back once and never loops.
- **A server-side box host** keeps a static skills path to `<root>/<tenant>/active/packages` in the engine configuration. Its confirmation is done by the sync service, without checking that an engine loaded anything.
- **MCP, policy and instruction packages** arrive but no engine uses them. From the catalog's point of view they are active; the engine ignores them.

Three defects follow, each a requirement in HCS-0008: a projection that follows a moving pointer (R001, R002), contributions that are dropped silently while reported active (R003 to R005), and confirmation without an engine (R013 to R016). The precedence rule the desktop host applies only in code becomes R006 and R007.

## 2. Standards per concern

| Concern | Candidate | Owner and governance | Version pinned | Adoption | Covers | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Skill content | Agent Skills ([agent-skills.md](../standards/agent-skills.md)) | AAIF project (Linux Foundation) [F] (aaif.io/projects) | unversioned, commit `83021e2` | implemented by the three engines the first host drives [H] | the skill directory and `SKILL.md`; not where an engine looks for it | **adopt** as is |
| Instruction content | AGENTS.md ([agents-md.md](../standards/agents-md.md)) | AAIF project (Linux Foundation) [F] | unversioned, commit `d001185` | about 20 agents listed on the site [F] | plain Markdown, nearest-file precedence; no structure, no install location | **adopt** as content convention (SHOULD); kind stays extension |
| MCP server descriptor | MCP Registry `server.json` ([mcp-registry-server-json.md](../standards/mcp-registry-server-json.md)) | MCP, a Series of LF Projects; AAIF project [F] | schema 2025-12-11, registry v1.8.7 | official MCP registry and downstream registries [F] | identity, packages, remotes, inputs with `isSecret`; not the client's own config file | **profile**: no secret values |
| MCP bundle | MCPB `manifest.json` ([mcpb.md](../standards/mcpb.md)) | MCP organisation | manifest 0.3, v2.1.2 | desktop MCP clients [U] | one local MCP server as a zip with user config | reference only |
| Engine configuration projection | none found | | | | | **provisional HCS-0008** |
| Plugin manifest (skills + MCP + instructions in one unit) | none neutral; vendor formats only (one engine's `plugin.json`, another's config file) [H] | vendors | | per engine | per engine | not adopted; appendix A only |
| Layered precedence | UAPI.6 Configuration Files ([uapi-config-files.md](../standards/uapi-config-files.md)) | UAPI Group (community, not a foundation) [F] | 1.0 | systemd, libeconf, image-based distributions [F] | vendor versus administrator layers, masking, drop-ins | **reference** for the model |
| Atomic activation | Kubernetes `AtomicWriter` ([kubernetes-probes.md](../standards/kubernetes-probes.md)); generations in HCS-0007-R017 | CNCF (implementation, not a spec) | `master` | every Kubernetes node [I] | one directory switch per update | already covered by HCS-0007-R017; reference |
| Health and readiness | Kubernetes startup and readiness probes; gRPC `grpc.health.v1` ([grpc-health.md](../standards/grpc-health.md)) | CNCF | k8s docs `380372f`; gRPC v1.83.2 | ubiquitous [I] | "is it up", by HTTP status, gRPC or command | **reference**: outcome only |
| Confirm after health, bounded retry | UAPI.1 boot counting, systemd Automatic Boot Assessment ([uapi-boot-counting.md](../standards/uapi-boot-counting.md)) | UAPI Group; systemd | UAPI.1; systemd v262.2 | systemd-boot users [F] | indeterminate, good, bad; the running system decides; N tries | **reference** with N = 1 |
| Signing, rollback, freshness | TUF, DSSE ([tuf.md](../standards/tuf.md)) | CNCF / OpenSSF | as pinned | | already HCS-0007 | no change |
| Secrets | MCP `isSecret`, MCPB `sensitive` | MCP | as above | | declare the secret, the client holds the value | adopted inside the `server.json` profile |

## 3. Why no standard covers projection

Every widely used standard in this space stops at the content: Agent Skills defines the directory, AGENTS.md the file, `server.json` the server. Each engine then defines where it reads them, with different mechanisms even for the same content: a recursive path list, a repeatable flag, a project directory layout, a plugin directory that prefixes names, managed files with highest precedence (HCS-0008 appendix A) [H]. Searches of the AAIF project list, the MCP organisation and the CNCF and OCI specifications found no engine-neutral installation format [F for the lists read; I for absence]:

- OCI runtime-spec defines a bundle (`config.json` plus root filesystem) that a container runtime consumes. It is the right shape (a runtime reads one prepared, immutable bundle) but its content is a process and a filesystem, not agent configuration.
- Kubernetes projected volumes and `AtomicWriter` project configuration files into a container atomically, with the caveat that a reader following the pointer can see a new set mid-run.
- Development Container `devcontainer.json` configures a tool environment, not an agent engine [U: not re-read in this pass].
- MCP clients read MCP server lists from their own files; the registry's `server.json` is the only neutral descriptor.

Defining a new universal engine configuration file would be inventing a standard no engine reads. HCS-0008 therefore defines only what a host must guarantee when it projects, and keeps engine mappings out of normative text. It is Provisional, superseded when a neutral body publishes an installation format for skills, MCP servers and instructions ([ADR-0016](../adr/0016-host-adapter-contract-is-provisional.md)).

## 4. Decisions

| Concern | Decision | ADR |
| --- | --- | --- |
| Contract | Provisional HCS-0008, behaviour only | [ADR-0016](../adr/0016-host-adapter-contract-is-provisional.md) |
| Skills | Agent Skills as is; place, never edit | ADR-0016 |
| MCP | `server.json` 2025-12-11, no secret values | [ADR-0017](../adr/0017-mcp-descriptors-profile-server-json.md) |
| Instructions, policies | extension kinds; AGENTS.md content; policies narrow only | [ADR-0018](../adr/0018-instructions-and-policies-stay-extension-kinds.md) |
| Precedence | host-owned settings win; generation collisions rejected | [ADR-0019](../adr/0019-host-owned-settings-take-precedence.md) |
| Confirmation | after health, one attempt, one rollback | [ADR-0020](../adr/0020-confirm-after-health-one-attempt.md) |
| Errors | existing HCS-0006 codes | [ADR-0021](../adr/0021-projection-reuses-existing-error-codes.md) |

## 5. Sources

Primary sources are listed in each file under [docs/standards/](../standards/). Additionally:

- https://aaif.io/projects (read 2026-11-06: Agent Router, Agent Skills, Agent2Agent, AGENTS.md, agentgateway, Goose, Model Context Protocol, Open Responses, OpenEnv, OpenSandbox)
- https://github.com/opencontainers/runtime-spec (v1.3.0 per [standards-catalog.md](standards-catalog.md); not re-read in this pass)
