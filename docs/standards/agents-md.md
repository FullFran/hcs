# AGENTS.md

| Field | Value |
| --- | --- |
| Owner | AGENTS.md a Series of LF Projects, LLC (Technical Charter adopted 2025-12-08); site states it is stewarded by the Agentic AI Foundation under the Linux Foundation |
| Version pinned | unversioned convention; pinned by commit |
| Source pinned | `agentsmd/agents.md@d001185d792eb6402a58e4cbef1c228b309ec25d` (`main`, 2026-09-10; no tags or releases) |
| Access date | 2026-11-06 |
| License | MIT (copyright 2025 OpenAI) |
| Maturity | De-facto convention listed as supported by ~20 agents/tools on the site (Codex, Jules, Cursor, Aider, Gemini CLI, goose, opencode, Zed, VS Code, Devin, Junie, ...); no schema, no conformance suite |
| HCS action | adapter (context only); out of HCS core |

## What it defines

A plain Markdown file named `AGENTS.md`, placed in a repository, that gives coding agents project context and instructions ("a README for agents"). The repository holds a README with a sample and the source of the https://agents.md website; the website's FAQ and how-to sections are the only behavioral guidance. There is no normative specification document.

## Key objects and fields

- File name: `AGENTS.md` (the FAQ shows migrating from `AGENT.md` with a symlink for compatibility).
- Content: standard Markdown; no required fields or headings.
- Suggested sections: project overview, build and test commands, code style guidelines, testing instructions, security considerations; also commit/PR guidelines, deployment steps.
- Nesting: monorepos may place `AGENTS.md` in subprojects.
- Precedence (FAQ): the `AGENTS.md` closest to the edited file wins; explicit user chat prompts override everything.
- Execution expectation (FAQ): agents attempt to run listed programmatic checks and fix failures before finishing.

## Extension points

- None formal: no frontmatter, no reserved keys, no vendor prefix, no versioning.
- Tools configure discovery themselves (FAQ examples for Aider and Gemini CLI via `.gemini/settings.json`); HCS-relevant behavior is therefore tool-specific.

## Where HCS references it instead of redefining

- HCS-0001: if a contribution kind for instructions is ever needed (e.g. `instructions` pointing to an `AGENTS.md` file), HCS references this convention by name and MUST NOT define a structure inside the file. [I]
- HCS-0004: discovery and precedence of `AGENTS.md` files (nearest file wins, user prompt overrides) is host context assembly, outside HCS lifecycle states. [I]
- HCS-0005: content of `AGENTS.md` MUST NOT be read as grants, policy or capability declarations; commands it lists run only under host-granted authority.
- HCS-0002/0003: no capability IDs, dependencies or versions can be derived from it.

## Pitfalls for HCS

- Free text only: it can feed model context, never policy or resolution. (catalog)
- "Agents will run listed tests" is a FAQ statement about agent behavior, not an enforceable rule; an HCS host must still gate execution.
- No versioning: pin a commit if HCS ever cites specific behavior (e.g. precedence).
- Repository-supplied content is untrusted input for the agent (prompt-injection surface); hosts should treat it like any other repo file. [I]
- Overlaps with tool-specific files (`CLAUDE.md`, `.cursorrules`, etc.); HCS should not pick a winner. [I]

## Sources

Site text was read from the website source in the pinned repository (`components/*.tsx`); https://agents.md itself was not fetched in this pass [U for live-site drift].

- https://github.com/agentsmd/agents.md/blob/d001185d792eb6402a58e4cbef1c228b309ec25d/README.md
- https://github.com/agentsmd/agents.md/blob/d001185d792eb6402a58e4cbef1c228b309ec25d/components/FAQSection.tsx
- https://github.com/agentsmd/agents.md/blob/d001185d792eb6402a58e4cbef1c228b309ec25d/components/HowToUseSection.tsx
- https://github.com/agentsmd/agents.md/blob/d001185d792eb6402a58e4cbef1c228b309ec25d/components/AboutSection.tsx
- https://github.com/agentsmd/agents.md/blob/d001185d792eb6402a58e4cbef1c228b309ec25d/Technical_Charter.pdf
- https://github.com/agentsmd/agents.md/blob/d001185d792eb6402a58e4cbef1c228b309ec25d/LICENSE
- https://agents.md
