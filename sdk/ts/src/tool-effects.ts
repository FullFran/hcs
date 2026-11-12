// Effect classes of the tools of an MCP server a package contributes (HCS-0009, ADR-0034).
// Pure: no I/O. The declarations live in the `_meta["io.github.fullfran.hcs"].tools` member of the server's
// server.json; a class is metadata the host maps to MCP annotations, never a grant (R006).
import { hcsError, HcsFailure, type HcsError } from './errors.ts';
import { checkDetailPrefix, DEFAULT_DETAIL_PREFIX } from './extensions.ts';
import { isExtensionName } from './ids.ts';

export const TOOL_EFFECTS_META_KEY = 'io.github.fullfran.hcs';
export const EFFECT_CLASSES = ['read', 'additive', 'destructive'] as const;
export type EffectClass = (typeof EFFECT_CLASSES)[number];

/** The four MCP ToolAnnotations hints a host presents for a tool (section 4). */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** What a host presents for a tool without a usable declaration (R004): the MCP defaults. */
export const FAIL_CLOSED_ANNOTATIONS: Readonly<ToolAnnotations> = Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const escape = (token: string) => token.replace(/~/g, '~0').replace(/\//g, '~1');
const knownMembers = new Set(['effect', 'idempotent', 'openWorld']);

// One problem per declaration at most: the pointer (relative to the member) of the first member that breaks the schema.
function declarationProblem(decl: unknown): string | undefined {
  if (!isObject(decl)) return '';
  if (typeof decl.effect !== 'string' || decl.effect === '') return '/effect';
  for (const key of ['idempotent', 'openWorld']) if (Object.hasOwn(decl, key) && typeof decl[key] !== 'boolean') return `/${key}`;
  for (const key of Object.keys(decl)) if (!knownMembers.has(key) && !isExtensionName(key)) return `/${escape(key)}`;
  return undefined;
}

function memberProblem(meta: unknown): string | undefined {
  if (!isObject(meta)) return '';
  for (const key of Object.keys(meta)) if (key !== 'tools' && !isExtensionName(key)) return `/${escape(key)}`;
  if (!isObject(meta.tools)) return '/tools';
  for (const [name, decl] of Object.entries(meta.tools)) {
    if (name.length === 0 || name.length > 128) return `/tools/${escape(name)}`;
    const problem = declarationProblem(decl);
    if (problem !== undefined) return `/tools/${escape(name)}${problem}`;
  }
  return undefined;
}

/**
 * Checks the value of the `io.github.fullfran.hcs` member of a server's `_meta` against the HCS-0009 `serverMeta`
 * definition (R001). Returns `manifest_invalid` errors; empty when the member is valid. An unknown class is valid (R004).
 * `base` is the JSON Pointer of the member inside server.json, used in the error detail.
 */
export function checkToolEffects(meta: unknown, detailPrefix: string = DEFAULT_DETAIL_PREFIX, base = ''): HcsError[] {
  const problem = memberProblem(meta);
  if (problem === undefined) return [];
  return [hcsError('manifest_invalid', 'Tool effect declarations do not match the HCS-0009 schema', { requirement: 'HCS-0009-R001', details: { [`${checkDetailPrefix(detailPrefix)}-pointer`]: base + problem } })];
}

/** The HCS member of a server.json `_meta`, or undefined when the document does not have one. */
function memberOf(doc: unknown): unknown {
  const meta = isObject(doc) ? doc._meta : undefined;
  return isObject(meta) && Object.hasOwn(meta, TOOL_EFFECTS_META_KEY) ? meta[TOOL_EFFECTS_META_KEY] : undefined;
}

/** R001 for a whole server.json: checks the `_meta` member if there is one. */
export function checkServerToolEffects(doc: unknown, detailPrefix: string = DEFAULT_DETAIL_PREFIX): HcsError[] {
  const meta = isObject(doc) ? doc._meta : undefined;
  if (!isObject(meta) || !Object.hasOwn(meta, TOOL_EFFECTS_META_KEY)) return [];
  return checkToolEffects(meta[TOOL_EFFECTS_META_KEY], detailPrefix, `/_meta/${escape(TOOL_EFFECTS_META_KEY)}`);
}

/**
 * The annotations to present for one declaration (R003). Anything that is not a valid declaration of a class this
 * version defines (missing, malformed, unknown class) gives the most dangerous annotations (R004).
 */
export function annotationsFor(declared: unknown): ToolAnnotations {
  if (declarationProblem(declared) !== undefined) return { ...FAIL_CLOSED_ANNOTATIONS };
  const d = declared as Json;
  if (!(EFFECT_CLASSES as readonly string[]).includes(d.effect as string)) return { ...FAIL_CLOSED_ANNOTATIONS };
  const effect = d.effect as EffectClass;
  return {
    readOnlyHint: effect === 'read',
    destructiveHint: effect === 'destructive',
    idempotentHint: effect === 'read' || d.idempotent === true,
    openWorldHint: d.openWorld !== false,
  };
}

/**
 * The annotations to present for each tool the server lists (`tools/list`), keyed by tool name. A declaration for a tool
 * that is not listed has no effect, and a listed tool without a usable one is the most dangerous class. The server's own
 * annotations are not an input (R005). Throws `HcsFailure` with the R001 errors when the member is invalid.
 */
export function classifyTools(doc: unknown, listedTools: readonly string[], detailPrefix: string = DEFAULT_DETAIL_PREFIX): Record<string, ToolAnnotations> {
  const errors = checkServerToolEffects(doc, detailPrefix);
  if (errors.length) throw new HcsFailure(errors);
  const member = memberOf(doc);
  const declared = isObject(member) && isObject(member.tools) ? member.tools : {};
  const out: Record<string, ToolAnnotations> = Object.create(null);
  for (const name of listedTools) {
    Object.defineProperty(out, name, { value: annotationsFor(Object.hasOwn(declared, name) ? declared[name] : undefined), enumerable: true, writable: true, configurable: true });
  }
  return out;
}
