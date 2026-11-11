// hcs-sdk publisher CLI: keygen, sign-keys, sign-catalog, pack. All process access goes through CliIo.
import { randomBytes } from 'node:crypto';
import { closeSync, fstatSync, linkSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readCatalog } from '../catalog.ts';
import { HcsFailure } from '../errors.ts';
import { buildPackage } from '../package.ts';
import {
  canonicalize, checkKeySetShape, createEnvelope, generateKeyPair, isPrivateKeyMaterial, parseInstant, parseStrictJson,
  readSignerPem, seedToPem, signKeySet, type Signer,
} from '../signing/index.ts';

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd: string;
  now(): Date;
}

const USAGE = `usage: hcs-sdk <command> [options]

commands:
  keygen        --keyid <id> --out <private.pem> [--force]
  sign-keys     --in <keyset.json> --signer <keyid>=<private.pem> [--signer ...] --out <keys.json> [--force]
  sign-catalog  --catalog <catalog.json> --sequence <n> --expires <RFC 3339 UTC> --binding <k=v> [--binding ...]
                --signer <keyid>=<private.pem> [--signer ...] --out <envelope.json> [--force]
  pack          <dir> --out <package.tar.gz> [--force]

exit codes: 0 success, 1 operational error, 2 usage error
`;

const KEYID = /^[A-Za-z0-9._:-]{1,128}$/;

/** A bad command line: exit code 2. */
class UsageError extends Error {}
/** A failure after the command line was accepted: exit code 1. `lines` are printed verbatim. */
class CliFailure extends Error {
  readonly lines: readonly string[];
  constructor(...lines: string[]) { super(lines.join('\n')); this.lines = lines; }
}

const hcsLines = (errors: readonly { code: string; message?: string }[]) => errors.map(e => `${e.code}: ${e.message ?? ''}`);
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

type Options = Record<string, { type: 'string' | 'boolean'; multiple?: boolean }>;
function parse<const O extends Options>(args: readonly string[], options: O, positionals = false) {
  try {
    return parseArgs({ args: [...args], options, allowPositionals: positionals, strict: true });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message.replace(/\. To specify a positional.*$/, '') : String(e));
  }
}
function required(value: string | undefined, flag: string): string {
  if (value === undefined || value === '') throw new UsageError(`missing required option ${flag}`);
  return value;
}
function requiredList(value: string[] | undefined, flag: string): string[] {
  if (!value || value.length === 0) throw new UsageError(`missing required option ${flag}`);
  return value;
}

function readInput(io: CliIo, path: string, what: string): string {
  try { return readFileSync(resolve(io.cwd, path), 'utf8'); }
  catch (e) { throw new CliFailure(`cannot read ${what} ${path}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`); }
}

/** Reads `keyid=path`; refuses a key file readable by group or others (like ssh). Never echoes file contents. */
function readSigner(io: CliIo, spec: string): Signer {
  const at = spec.indexOf('=');
  if (at <= 0 || at === spec.length - 1) throw new UsageError(`--signer expects <keyid>=<private.pem>, got "${spec}"`);
  const keyid = spec.slice(0, at), path = spec.slice(at + 1);
  if (!KEYID.test(keyid)) throw new UsageError(`--signer keyid "${keyid}" is not a valid keyid`);
  const full = resolve(io.cwd, path);
  let fd: number;
  try { fd = openSync(full, 'r'); }
  catch (e) { throw new CliFailure(`cannot read private key ${path}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new CliFailure(`private key ${path} is not a regular file`);
    if (stat.mode & 0o077) throw new CliFailure(`private key ${path} is accessible by group or others (mode ${(stat.mode & 0o777).toString(8).padStart(3, '0')}); run: chmod 600 ${path}`);
    try { return readSignerPem(keyid, readFileSync(fd, 'utf8')); }
    catch { throw new CliFailure(`${path} is not a PKCS#8 PEM Ed25519 private key (create one with: hcs-sdk keygen)`); }
  } finally { closeSync(fd); }
}

/**
 * Writes `data` to a temporary name in the target directory (exclusive, with `mode` set at open), then moves it into place:
 * `rename` with `force`, otherwise a hard link that fails if the target exists. A reader never sees a partial file.
 */
function writeOutput(io: CliIo, path: string, data: string | Uint8Array, force: boolean, mode: number): void {
  const full = resolve(io.cwd, path);
  const tmp = join(dirname(full), `.${basename(full)}.${randomBytes(6).toString('hex')}.tmp`);
  let fd: number;
  try { fd = openSync(tmp, 'wx', mode); }
  catch (e) { throw new CliFailure(`cannot write ${path}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`); }
  try {
    try { writeFileSync(fd, data); } finally { closeSync(fd); }
    if (force) renameSync(tmp, full);
    else {
      try { linkSync(tmp, full); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new CliFailure(`${path} already exists; pass --force to overwrite`);
        throw new CliFailure(`cannot write ${path}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`);
      }
    }
  } catch (e) {
    if (e instanceof CliFailure) throw e;
    throw new CliFailure(`cannot write ${path}: ${(e as NodeJS.ErrnoException).code ?? 'error'}`);
  } finally {
    try { unlinkSync(tmp); } catch { /* already renamed */ }
  }
}

function parseJsonText(text: string, what: string): unknown {
  const parsed = parseStrictJson(text);
  // Fixed text: parser messages can quote the input, and the input may be a misplaced private key.
  if (!parsed.ok) throw new CliFailure(`${parsed.errors[0]?.code ?? 'manifest_invalid'}: ${what} is not valid JSON`);
  return parsed.value;
}

function keygen(args: readonly string[], io: CliIo): number {
  const { values } = parse(args, { keyid: { type: 'string' }, out: { type: 'string' }, force: { type: 'boolean' } });
  const keyid = required(values.keyid, '--keyid'), out = required(values.out, '--out');
  if (!KEYID.test(keyid)) throw new UsageError(`--keyid "${keyid}" must match ${KEYID.source}`);
  const parent = dirname(resolve(io.cwd, out));
  try {
    if (statSync(parent).mode & 0o077) io.stderr(`warning: ${parent} is accessible by group or others\n`);
  } catch { /* the write below reports a missing directory */ }
  const { seed, publicKey } = generateKeyPair();
  writeOutput(io, out, seedToPem(seed), values.force === true, 0o600);
  io.stdout(canonicalize({ keyid, keytype: 'ed25519', public: publicKey }) + '\n');
  return 0;
}

function signKeys(args: readonly string[], io: CliIo): number {
  const { values } = parse(args, { in: { type: 'string' }, signer: { type: 'string', multiple: true }, out: { type: 'string' }, force: { type: 'boolean' } });
  const input = required(values.in, '--in'), out = required(values.out, '--out');
  const specs = requiredList(values.signer, '--signer');
  const text = readInput(io, input, 'key set');
  if (isPrivateKeyMaterial(text)) throw new CliFailure(`${input} contains private key material; a key set holds public keys only`);
  const doc = parseJsonText(text, 'key set');
  if (isPrivateKeyMaterial(doc as Record<string, unknown>)) throw new CliFailure(`${input} contains private key material; a key set holds public keys only`);
  const shape = checkKeySetShape(doc);
  if (shape.length) throw new CliFailure(...hcsLines(shape));
  const signers = specs.map(s => readSigner(io, s));
  writeOutput(io, out, json(signKeySet(doc as object, signers)), values.force === true, 0o666);
  return 0;
}

function bindingFrom(items: readonly string[]): Record<string, string> {
  const binding: Record<string, string> = Object.create(null);
  for (const item of items) {
    const at = item.indexOf('=');
    if (at <= 0 || at === item.length - 1) throw new UsageError(`--binding expects <key>=<value>, got "${item}"`);
    const key = item.slice(0, at);
    if (key in binding) throw new UsageError(`--binding "${key}" is given twice`);
    binding[key] = item.slice(at + 1);
  }
  return { ...binding };
}

function signCatalog(args: readonly string[], io: CliIo): number {
  const { values } = parse(args, {
    catalog: { type: 'string' }, sequence: { type: 'string' }, expires: { type: 'string' }, binding: { type: 'string', multiple: true },
    signer: { type: 'string', multiple: true }, out: { type: 'string' }, force: { type: 'boolean' },
  });
  const file = required(values.catalog, '--catalog'), out = required(values.out, '--out');
  const sequenceText = required(values.sequence, '--sequence'), expires = required(values.expires, '--expires');
  const sequence = /^[0-9]+$/.test(sequenceText) ? Number(sequenceText) : NaN;
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new UsageError(`--sequence must be a positive safe integer, got "${sequenceText}"`);
  if (parseInstant(expires) === null) throw new UsageError(`--expires must be an RFC 3339 UTC timestamp such as 2026-11-13T00:00:00Z, got "${expires}"`);
  const binding = bindingFrom(requiredList(values.binding, '--binding'));
  const specs = requiredList(values.signer, '--signer');
  const text = readInput(io, file, 'catalog');
  const checked = readCatalog(text);
  if (!checked.ok) throw new CliFailure(...hcsLines(checked.errors));
  const catalog = parseJsonText(text, 'catalog') as Record<string, unknown>;
  const signers = specs.map(s => readSigner(io, s));
  let envelope;
  try { envelope = createEnvelope({ sequence, expires, binding, catalog }, signers); }
  catch (e) { throw new CliFailure(`manifest_invalid: ${e instanceof Error ? e.message : String(e)}`); }
  writeOutput(io, out, json(envelope), values.force === true, 0o666);
  return 0;
}

function pack(args: readonly string[], io: CliIo): number {
  const { values, positionals } = parse(args, { out: { type: 'string' }, force: { type: 'boolean' } }, true);
  const out = required(values.out, '--out');
  if (positionals.length !== 1) throw new UsageError('pack expects exactly one source directory');
  const built = buildPackage(resolve(io.cwd, positionals[0]));
  writeOutput(io, out, built.bytes, values.force === true, 0o666);
  io.stdout(canonicalize({ contentHash: built.contentHash, size: built.size, contentId: built.contentId, mediaType: built.mediaType }) + '\n');
  return 0;
}

const COMMANDS: Record<string, (args: readonly string[], io: CliIo) => number> = {
  keygen, 'sign-keys': signKeys, 'sign-catalog': signCatalog, pack,
};

/** Runs one CLI invocation and returns its exit code: 0 success, 1 operational error, 2 usage error. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h' || command === 'help') { io.stdout(USAGE); return 0; }
  if (command === undefined) { io.stderr(USAGE); return 2; }
  const handler = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!handler) { io.stderr(`unknown command "${command}"\n${USAGE}`); return 2; }
  try {
    return handler(rest, io);
  } catch (e) {
    if (e instanceof UsageError) { io.stderr(`hcs-sdk ${command}: ${e.message}\nrun "hcs-sdk --help" for usage\n`); return 2; }
    if (e instanceof CliFailure) { io.stderr(e.lines.join('\n') + '\n'); return 1; }
    if (e instanceof HcsFailure) { io.stderr(hcsLines(e.errors).join('\n') + '\n'); return 1; }
    io.stderr(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
