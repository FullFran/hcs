// MCP Registry server.json documents as HCS-0008 uses them for `mcp-server` contributions (ADR 0017).
// Only the members HCS requires (R010) and the secret profile (R011) are checked, as in
// conformance/runner/projection.py; full validation against the MCP schema stays with the adapter.
// Pure: no I/O, the document is never modified, and no value of an input is ever echoed.
import { HcsFailure, hcsError, type HcsError } from './errors.ts';
import { checkDetailPrefix, DEFAULT_DETAIL_PREFIX } from './extensions.ts';
import type { SecretInput } from './projection/types.ts';

/** One input of a server.json document: an environment variable, a header, an argument or a variable. */
export interface ServerJsonInput {
  kind: 'environment' | 'header' | 'argument' | 'variable';
  /** `name` of the input (`valueHint` for an unnamed argument; the key for a variable). Absent when it has none. */
  name?: string;
  /** RFC 6901 pointer to the input inside the document. */
  pointer: string;
  isRequired: boolean;
  isSecret: boolean;
}

export interface ServerJsonReport {
  /** `name` member of the document: the identity of the MCP server in a projection. */
  name: string;
  inputs: ServerJsonInput[];
}

type Json = Record<string, unknown>;
const SERVER_REQUIRED = ['name', 'description', 'version'] as const;
const PACKAGE_INPUTS = [['environmentVariables', 'environment'], ['runtimeArguments', 'argument'], ['packageArguments', 'argument']] as const;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const escape = (token: string) => token.replace(/~/g, '~0').replace(/\//g, '~1');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

interface Found { input: ServerJsonInput; item: Json }

function* withVariables(kind: ServerJsonInput['kind'], name: unknown, item: Json, pointer: string): Generator<Found> {
  yield { input: describe(kind, name, item, pointer), item };
  if (isObject(item.variables)) yield* variables(item.variables, `${pointer}/variables`);
}
function* variables(map: Json, pointer: string): Generator<Found> {
  for (const [key, value] of Object.entries(map)) if (isObject(value)) yield { input: describe('variable', key, value, `${pointer}/${escape(key)}`), item: value };
}
function describe(kind: ServerJsonInput['kind'], name: unknown, item: Json, pointer: string): ServerJsonInput {
  return { kind, ...(typeof name === 'string' ? { name } : {}), pointer, isRequired: Boolean(item.isRequired), isSecret: Boolean(item.isSecret) };
}

// Every input of the document, variables included, in document order (the runner's `_inputs`).
function* inputs(doc: Json): Generator<Found> {
  for (const [p, pkg] of list(doc.packages).entries()) {
    if (!isObject(pkg)) continue;
    for (const [key, kind] of PACKAGE_INPUTS) {
      for (const [i, item] of list(pkg[key]).entries()) {
        if (isObject(item)) yield* withVariables(kind, item.name ?? item.valueHint, item, `/packages/${p}/${key}/${i}`);
      }
    }
  }
  for (const [r, remote] of list(doc.remotes).entries()) {
    if (!isObject(remote)) continue;
    for (const [i, item] of list(remote.headers).entries()) if (isObject(item)) yield* withVariables('header', item.name, item, `/remotes/${r}/headers/${i}`);
    if (isObject(remote.variables)) yield* variables(remote.variables, `/remotes/${r}/variables`);
  }
}

/**
 * Checks the members HCS requires of a server.json document (HCS-0008-R010) and that no secret input
 * carries a `value` or a `default` (R011). Returns `manifest_invalid` errors; empty when the document passes.
 */
export function checkServerJson(doc: unknown, detailPrefix: string = DEFAULT_DETAIL_PREFIX): HcsError[] {
  const pointerKey = `${checkDetailPrefix(detailPrefix)}-pointer`;
  const fail = (message: string, pointer: string, requirement: string) => hcsError('manifest_invalid', message, { requirement, details: { [pointerKey]: pointer } });
  if (!isObject(doc)) return [fail('server.json is not an object', '', 'HCS-0008-R010')];
  for (const key of SERVER_REQUIRED) if (typeof doc[key] !== 'string') return [fail(`server.json member ${key} is not a string`, `/${key}`, 'HCS-0008-R010')];
  for (const key of ['packages', 'remotes']) if (key in doc && !Array.isArray(doc[key])) return [fail(`server.json member ${key} is not an array`, `/${key}`, 'HCS-0008-R010')];
  const errors: HcsError[] = [];
  for (const { input, item } of inputs(doc)) {
    if (!input.isSecret || !(Object.hasOwn(item, 'value') || Object.hasOwn(item, 'default'))) continue;
    errors.push(fail(`Secret input ${input.name ?? input.pointer} carries a value or a default`, input.pointer, 'HCS-0008-R011'));
  }
  return errors;
}

/** `checkServerJson`, then the server name and its inputs. Throws HcsFailure with the same errors. */
export function readServerJson(doc: unknown, detailPrefix: string = DEFAULT_DETAIL_PREFIX): ServerJsonReport {
  const errors = checkServerJson(doc, detailPrefix);
  if (errors.length) throw new HcsFailure(errors);
  const valid = doc as Json;
  return { name: valid.name as string, inputs: [...inputs(valid)].map(f => f.input) };
}

/** The named secret inputs of a document, in the shape an adapter returns to projection (HCS-0008-R012). */
export function serverJsonSecretInputs(report: ServerJsonReport): SecretInput[] {
  return report.inputs.filter(i => i.isSecret && i.name !== undefined).map(i => ({ input: i.name!, required: i.isRequired }));
}
