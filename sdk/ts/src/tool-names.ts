// The map from the name an engine presents for an MCP tool to the tool's identity (HCS-0009-R007), and the
// collisions an adapter reports under HCS-0008-R040. Pure: no I/O. The hash is computed in memory.
// Naming rules are the observed ones of HCS-0008 appendix A.1; they are facts about engine versions, not requirements.
import { createHash } from 'node:crypto';

/** A naming rule: one of the observed rules by name, or a function from (server, raw tool name) to an engine name. */
export type NamingRule = 'opencode' | 'pi' | 'mcp-double-underscore' | ((server: string, tool: string) => string);

/** The identity of a tool: the projected contribution that listed it and the name the server reports (HCS-0009 section 2). */
export interface ToolIdentity {
  contribution: string;
  tool: string;
}

/** One projected `mcp-server` contribution, in the generation's order. `tools` are the names the server reports. */
export interface ProjectedServer {
  contribution: string;
  /** The server name the engine uses in its tool names. */
  server: string;
  tools: string[];
}

/** Why an entry is reported: its tool shares a name with another entry (R006), with a host tool, or with another tool of the same entry. */
export type CollisionReason = 'entries' | 'host-tool' | 'same-entry';

/** An entry R040 reports: `ambiguous_provider` for a collision between entries (R006), `unsupported_contribution` otherwise. `tool` is its first colliding tool. */
export interface ReportedEntry {
  contribution: string;
  code: 'ambiguous_provider' | 'unsupported_contribution';
  reason: CollisionReason;
  tool: string;
  engineName: string;
}

export interface ToolNameMap {
  /** Engine name to identity; injective by construction. A reported entry contributes nothing. */
  map: Map<string, ToolIdentity>;
  /** One item per reported entry, in the generation's order. */
  reported: ReportedEntry[];
}

const PI_MAX = 64;
const PI_KEEP = 55;

/** The engine-level name of a tool under a naming rule. Pi's rule covers the length case; its run-time collision case is engine state. */
export function engineToolName(rule: NamingRule, server: string, tool: string): string {
  if (typeof rule === 'function') return rule(server, tool);
  if (rule === 'opencode') return `${server}_${tool}`.replace(/[^A-Za-z0-9_-]/g, '_');
  if (rule === 'mcp-double-underscore') return `mcp__${server}__${tool}`;
  // Pi's replacement unit for astral characters (one `_` per UTF-16 code unit or per code point) is not verified; this replaces per code unit.
  const flat = `mcp__${server}__${tool}`.replace(/[^A-Za-z0-9_]/g, '_');
  if (flat.length <= PI_MAX) return flat;
  const hash = createHash('sha256').update(`${server}\0${tool}`).digest('hex').slice(0, 8);
  return `${flat.slice(0, PI_KEEP)}_${hash}`;
}

/**
 * Builds the map for the projected servers. No entry wins by its place in the generation (R006, R040): every entry whose
 * tool shares an engine name with a tool of another entry is reported `ambiguous_provider` and left out whole. An entry
 * whose tool takes a host tool's name, or two of whose tools share a name, is reported `unsupported_contribution` and
 * left out whole. A collision between entries takes precedence over the other two. Throws a TypeError for two servers
 * with the same `contribution`.
 */
export function buildToolNameMap(rule: NamingRule, servers: readonly ProjectedServer[], hostTools: readonly string[] = []): ToolNameMap {
  const ids = new Set<string>();
  for (const { contribution } of servers) {
    if (ids.has(contribution)) throw new TypeError(`duplicate contribution id: ${contribution}`);
    ids.add(contribution);
  }
  const host = new Set(hostTools);
  const named = servers.map(s => ({ s, tools: s.tools.map(tool => ({ tool, engineName: engineToolName(rule, s.server, tool) })) }));
  const holders = new Map<string, Set<string>>();
  for (const { s, tools } of named) for (const { engineName } of tools) holders.set(engineName, (holders.get(engineName) ?? new Set()).add(s.contribution));
  const map = new Map<string, ToolIdentity>();
  const reported: ReportedEntry[] = [];
  for (const { s, tools } of named) {
    const report = (code: ReportedEntry['code'], reason: CollisionReason, t: { tool: string; engineName: string }) => reported.push({ contribution: s.contribution, code, reason, ...t });
    const shared = tools.find(t => (holders.get(t.engineName)?.size ?? 0) > 1);
    const onHost = tools.find(t => host.has(t.engineName));
    const seen = new Set<string>();
    const twice = tools.find(t => (seen.has(t.engineName) ? true : (seen.add(t.engineName), false)));
    if (shared) report('ambiguous_provider', 'entries', shared);
    else if (onHost) report('unsupported_contribution', 'host-tool', onHost);
    else if (twice) report('unsupported_contribution', 'same-entry', twice);
    else for (const { tool, engineName } of tools) map.set(engineName, { contribution: s.contribution, tool });
  }
  return { map, reported };
}
