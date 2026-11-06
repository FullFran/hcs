# Agent Skills (SKILL.md)

| Field | Value |
| --- | --- |
| Owner | Agent Skills project (governance adopted 2026-11-04; to be established as "Agent Skills a Series of LF Projects, LLC"); originally contributed by Anthropic; AAIF project per the catalog [U: AAIF membership not re-checked] |
| Version pinned | unversioned specification; pinned by commit (last change to `docs/specification.mdx`: `217be548739f21d6008915c29aefe320ea1a90af`, 2026-08-04) |
| Source pinned | `agentskills/agentskills@83021e2be457a9b6679148719c1f6074f0ad975e` (`main`, 2026-11-04; no tags or releases); rendered at https://agentskills.io/specification |
| Access date | 2026-11-06 |
| License | Code and specification Apache-2.0; documentation (excluding spec) CC-BY-4.0 (`GOVERNANCE.md`, `docs/LICENSE`) |
| Maturity | Widely implemented format, no version number; `allowed-tools` marked Experimental; reference library `skills-ref` is demonstration-only |
| HCS action | adopt as contribution kind `skill` (HCS-0001); no restated format |

## What it defines

A file-system format for packaging procedural knowledge for agents. A skill is a directory containing at least `SKILL.md`: YAML frontmatter followed by free-form Markdown instructions. Optional conventional subdirectories: `scripts/` (executable code), `references/` (extra docs loaded on demand), `assets/` (templates, images, data). It also describes how agents should load skills progressively and how to validate them.

## Key objects and fields

- Frontmatter `name` (required): 1-64 chars; lowercase alphanumerics and hyphens; no leading/trailing hyphen; no `--`; MUST match the parent directory name.
- `description` (required): 1-1024 chars, non-empty; says what the skill does and when to use it.
- `license` (optional): license name or bundled license file reference.
- `compatibility` (optional): 1-500 chars; environment requirements (product, packages, network).
- `metadata` (optional): map of string keys to string values for client-defined properties.
- `allowed-tools` (optional, Experimental): space-separated string of pre-approved tools, e.g. `Bash(git:*) Read`; support varies by implementation.
- Body: Markdown, no format restrictions; recommended < 5000 tokens and `SKILL.md` under 500 lines.
- Progressive disclosure: (1) `name` + `description` (~100 tokens) loaded at startup for all skills; (2) full body on activation; (3) files in `scripts/`, `references/`, `assets/` only when needed.
- File references: relative paths from the skill root, kept one level deep.
- `skills-ref` (Python): `skills-ref validate`, `read-properties` (JSON), `to-prompt` (generates an `<available_skills>` XML block with `name`, `description`, `location`).

## Extension points

- `metadata` is the only sanctioned place for extra properties; the spec recommends reasonably unique keys.
- Any extra files and directories are allowed inside the skill directory.
- No `x-` prefix or vendor namespace for frontmatter keys. `skills-ref` rejects frontmatter fields outside `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`.
- Delivery over MCP is a separate MCP extension ("Skills over MCP", `modelcontextprotocol/ext-skills`, Beta per the MCP extensions overview).

## Where HCS references it instead of redefining

- HCS-0001: contribution kind `skill` points to a skill directory (inside the package, covered by the package `contentHash`/`size`); HCS MUST NOT restate frontmatter rules.
- HCS-0001: HCS-specific data about a skill (capability ID, required grants) lives in the HCS manifest entry, not in `SKILL.md` frontmatter, since unknown keys break `skills-ref validate`. [I]
- HCS-0002: skill `name` is unique only per directory/package; an HCS capability ID MAY reference it but MUST NOT equal it.
- HCS-0004: progressive disclosure is a host loading policy; HCS lifecycle states do not depend on whether the body is loaded.
- HCS-0005: `allowed-tools` is a request, never a grant; the host decides through HCS grants and MAY treat `allowed-tools` as input to a prompt for consent.
- CORE-0 conformance: HCS document fixtures MAY run `skills-ref validate` as an advisory check, not as an HCS MUST.

## Pitfalls for HCS

- `allowed-tools` reads like a permission grant but is experimental and implementation-dependent. (catalog)
- Spec text says `a-z`, `0-9` for `name` but also says "unicode lowercase alphanumeric"; `skills-ref` NFKC-normalizes and accepts Unicode lowercase letters. HCS should not tighten or loosen this itself; pin a commit and test both.
- `skills-ref` is "for demonstration purposes only"; do not treat it as a conformance suite.
- No versioning: changes land on `main`; pin a commit SHA.
- `scripts/` are executable; an HCS host that runs them needs an isolation decision (ISOLATION-1).
- `to-prompt` XML is a suggestion for Anthropic models, not part of the format.

## Sources

Site URLs below were read as their source files in the pinned repository; the live sites were not fetched in this pass [U for any live-site drift].

- https://agentskills.io/specification
- https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/docs/specification.mdx
- https://github.com/agentskills/agentskills/tree/83021e2be457a9b6679148719c1f6074f0ad975e/skills-ref
- https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/GOVERNANCE.md
- https://modelcontextprotocol.io/docs/extensions/overview (Skills over MCP)
