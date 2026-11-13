import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, type CliIo } from '../src/cli/main.ts';
import { buildPackage, verifyPackage } from '../src/package.ts';
import { readCatalog } from '../src/catalog.ts';
import { canonicalize, verifySignedCatalog, type TrustAnchor } from '../src/signing/index.ts';

const root = mkdtempSync(join(tmpdir(), 'hcs-cli-test-'));
after(() => rmSync(root, { recursive: true, force: true }));
let dir = root, n = 0;
beforeEach(() => { dir = join(root, `t${n++}`); mkdirSync(dir, { mode: 0o700 }); });

const NOW = new Date('2026-11-06T12:00:00Z');
const transcript: string[] = [];
const WINDOWS = process.platform === 'win32';
async function run(...args: string[]) { return runOn(undefined, ...args); }
async function runOn(platform: NodeJS.Platform | undefined, ...args: string[]) {
  let out = '', err = '';
  const io: CliIo = { stdout: t => { out += t; }, stderr: t => { err += t; }, cwd: dir, now: () => NOW, ...(platform ? { platform } : {}) };
  const code = await runCli(args, io);
  transcript.push(out, err);
  return { code, out, err };
}
const p = (name: string) => join(dir, name);
const write = (name: string, value: unknown) => writeFileSync(p(name), typeof value === 'string' ? value : JSON.stringify(value));
const mode = (path: string) => statSync(path).mode & 0o777;
// The raw seed is the last 32 bytes of the PKCS#8 DER inside the PEM.
const seedOf = (path: string) => Buffer.from(readFileSync(path, 'utf8').replace(/-----[A-Z ]+-----|\s/g, ''), 'base64').subarray(-32);

const catalog = { hcsVersion: '0.1', id: 'dev.example.desktop', version: '2026.11.06-1', entries: [
  { id: 'dev.example.notes', version: '1.4.0', contentHash: 'sha256:' + '4f'.repeat(32), size: 18342, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', contributions: [{ kind: 'skill', path: 'skills/take-notes' }] },
] };
const binding = ['tenant=t-0001', 'profile=desktop', 'channel=stable'];

async function publishKeys() {
  const a = await run('keygen', '--keyid', 'root-1', '--out', 'root.pem');
  const b = await run('keygen', '--keyid', 'online-1', '--out', 'online.pem');
  assert.equal(a.code, 0); assert.equal(b.code, 0);
  const online = JSON.parse(b.out);
  write('keyset.json', { hcsVersion: '0.1', version: 1, keys: [{ keyid: 'online-1', keytype: 'ed25519', public: online.public, notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' }] });
  return { rootPublic: JSON.parse(a.out).public as string };
}

test('keygen writes a 0600 PEM, prints only the public record and refuses to overwrite', async () => {
  const r = await run('keygen', '--keyid', 'root-1', '--out', 'root.pem');
  assert.equal(r.code, 0);
  if (!WINDOWS) assert.equal(mode(p('root.pem')), 0o600); // Windows has no POSIX modes
  const printed = JSON.parse(r.out);
  assert.deepEqual(Object.keys(printed).sort(), ['keyid', 'keytype', 'public']);
  assert.equal(printed.keyid, 'root-1'); assert.equal(printed.keytype, 'ed25519');
  assert.equal(r.out, canonicalize(printed) + '\n');
  const before = readFileSync(p('root.pem'), 'utf8');
  assert.match(before, /^-----BEGIN PRIVATE KEY-----/);
  const again = await run('keygen', '--keyid', 'root-1', '--out', 'root.pem');
  assert.equal(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.equal(readFileSync(p('root.pem'), 'utf8'), before);
});

test('keygen --force replaces the file with a new 0600 key', async () => {
  await run('keygen', '--keyid', 'root-1', '--out', 'root.pem');
  const before = readFileSync(p('root.pem'), 'utf8');
  const r = await run('keygen', '--keyid', 'root-1', '--out', 'root.pem', '--force');
  assert.equal(r.code, 0);
  assert.notEqual(readFileSync(p('root.pem'), 'utf8'), before);
  if (!WINDOWS) assert.equal(mode(p('root.pem')), 0o600); // Windows has no POSIX modes
  assert.deepEqual(readdirSync(dir), ['root.pem']);
});

test('keygen usage errors exit 2', async () => {
  for (const args of [['keygen', '--out', 'k.pem'], ['keygen', '--keyid', 'a'], ['keygen', '--keyid', 'bad id!', '--out', 'k.pem'], ['keygen', '--keyid', 'a', '--out', 'k.pem', '--bogus']]) {
    const r = await run(...args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, /usage|--keyid|--out|bogus|keyid/i);
  }
  assert.equal(existsSync(p('k.pem')), false);
});

test('unknown command and missing command exit 2; --help exits 0 on stdout', async () => {
  assert.equal((await run('frobnicate')).code, 2);
  const none = await run();
  assert.equal(none.code, 2); assert.match(none.err, /hcs-sdk/);
  const help = await run('--help');
  assert.equal(help.code, 0); assert.match(help.out, /keygen[\s\S]*sign-keys[\s\S]*sign-catalog[\s\S]*pack/);
});

test('round trip: keygen, sign-keys, sign-catalog produce documents that verifySignedCatalog accepts', async () => {
  const { rootPublic } = await publishKeys();
  const sk = await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=root.pem', '--out', 'keys.json');
  assert.equal(sk.code, 0, sk.err);
  write('catalog.json', catalog);
  const sc = await run('sign-catalog', '--catalog', 'catalog.json', '--sequence', '42', '--expires', '2026-11-13T00:00:00Z',
    ...binding.flatMap(b => ['--binding', b]), '--signer', 'online-1=online.pem', '--out', 'envelope.json');
  assert.equal(sc.code, 0, sc.err);
  assert.equal(readFileSync(p('envelope.json'), 'utf8').endsWith('}\n'), true);
  const trustAnchor: TrustAnchor = { keys: [{ keyid: 'root-1', keytype: 'ed25519', public: rootPublic }] };
  const result = verifySignedCatalog({
    trustAnchor, keySet: JSON.parse(readFileSync(p('keys.json'), 'utf8')), envelope: JSON.parse(readFileSync(p('envelope.json'), 'utf8')),
    assignment: { tenant: 't-0001', profile: 'desktop', channel: 'stable' }, now: '2026-11-06T12:00:00Z',
    validateCatalog: c => { const r = readCatalog(JSON.stringify(c)); return r.ok ? [] : r.errors; },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.deepEqual(result.catalog, catalog);
});

test('sign-keys and sign-catalog refuse to overwrite --out unless --force', async () => {
  await publishKeys();
  write('keys.json', 'keep');
  const refused = await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=root.pem', '--out', 'keys.json');
  assert.equal(refused.code, 1); assert.match(refused.err, /already exists/);
  assert.equal(readFileSync(p('keys.json'), 'utf8'), 'keep');
  assert.equal((await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=root.pem', '--out', 'keys.json', '--force')).code, 0);
  assert.notEqual(readFileSync(p('keys.json'), 'utf8'), 'keep');
  write('catalog.json', catalog); write('envelope.json', 'keep');
  const args = ['sign-catalog', '--catalog', 'catalog.json', '--sequence', '1', '--expires', '2026-11-13T00:00:00Z', '--binding', 'tenant=t', '--signer', 'online-1=online.pem', '--out', 'envelope.json'];
  assert.equal((await run(...args)).code, 1);
  assert.equal(readFileSync(p('envelope.json'), 'utf8'), 'keep');
  assert.equal((await run(...args, '--force')).code, 0);
});

test('sign-keys rejects a key set containing private key material, without echoing it', async () => {
  await publishKeys();
  const pem = readFileSync(p('online.pem'), 'utf8');
  write('leaky.json', { hcsVersion: '0.1', version: 1, keys: [], note: pem });
  const r = await run('sign-keys', '--in', 'leaky.json', '--signer', 'root-1=root.pem', '--out', 'out.json');
  assert.equal(r.code, 1);
  assert.match(r.err, /private key material/);
  assert.equal(existsSync(p('out.json')), false);
  assert.equal((r.out + r.err).includes(pem.split('\n')[1]), false);
  // A key file passed where a key set is expected is refused the same way.
  const asInput = await run('sign-keys', '--in', 'online.pem', '--signer', 'root-1=root.pem', '--out', 'out.json');
  assert.equal(asInput.code, 1); assert.match(asInput.err, /private key material/);
});

test('sign-keys reports a malformed key set as manifest_invalid', async () => {
  await publishKeys();
  write('bad.json', { hcsVersion: '0.1', version: 0, keys: [] });
  const r = await run('sign-keys', '--in', 'bad.json', '--signer', 'root-1=root.pem', '--out', 'out.json');
  assert.equal(r.code, 1); assert.match(r.err, /^manifest_invalid: /);
  write('notjson.json', '{nope');
  assert.equal((await run('sign-keys', '--in', 'notjson.json', '--signer', 'root-1=root.pem', '--out', 'out.json')).code, 1);
  assert.equal(existsSync(p('out.json')), false);
});

test('sign-keys refuses a number spelled 1.0 (HCS-0007-R004) without echoing the file', async () => {
  await publishKeys();
  write('spelled.json', '{"hcsVersion":"0.1","version":1.0,"keys":[],"x-secret-note":1}');
  const r = await run('sign-keys', '--in', 'spelled.json', '--signer', 'root-1=root.pem', '--out', 'out.json');
  assert.equal(r.code, 1);
  assert.match(r.err, /^manifest_invalid: key set breaks HCS-0007-R004: number token at offset 30 is not spelled as a plain integer/);
  assert.equal((r.out + r.err).includes('secret'), false);
  write('catalog-spelled.json', '{"hcsVersion":"0.1","id":"dev.example.c","version":"1","entries":[],"x-n":1e2}');
  const c = await run('sign-catalog', '--catalog', 'catalog-spelled.json', '--sequence', '1', '--expires', '2026-11-13T00:00:00Z', '--binding', 'tenant=t',
    '--signer', 'online-1=online.pem', '--out', 'signed.json');
  assert.equal(c.code, 1); assert.match(c.err, /^manifest_invalid: catalog breaks HCS-0007-R004: number token at offset \d+ /);
  assert.equal(existsSync(p('out.json')), false);
});

test('a file that is not JSON is reported without echoing its contents', async () => {
  await publishKeys();
  write('seed.txt', 'SECRETSEEDabcdefghijklmnop');
  const keys = await run('sign-keys', '--in', 'seed.txt', '--signer', 'root-1=root.pem', '--out', 'out.json');
  assert.equal(keys.code, 1); assert.match(keys.err, /^manifest_invalid: key set is not valid JSON/);
  assert.equal((keys.out + keys.err).includes('SECRET'), false);
  const catalog = await run('sign-catalog', '--catalog', 'seed.txt', '--sequence', '1', '--expires', '2026-11-13T00:00:00Z', '--binding', 'tenant=t',
    '--signer', 'online-1=online.pem', '--out', 'signed.json');
  assert.equal(catalog.code, 1);
  assert.equal((catalog.out + catalog.err).includes('SECRET'), false);
});

test('a private key file readable by group or others is refused', async () => {
  await publishKeys();
  chmodSync(p('root.pem'), 0o644); // on Windows the file already reports 0o666
  const r = await runOn('linux', 'sign-keys', '--in', 'keyset.json', '--signer', 'root-1=root.pem', '--out', 'keys.json');
  assert.equal(r.code, 1);
  assert.match(r.err, /chmod 600/);
  assert.equal(existsSync(p('keys.json')), false);
});

test('on Windows the key file permissions are not checked: keygen and signing warn and go on', async () => {
  const key = await runOn('win32', 'keygen', '--keyid', 'root-1', '--out', 'root.pem');
  assert.equal(key.code, 0);
  assert.match(key.err, /not checked on Windows; root\.pem is protected only by the ACL of its directory/);
  write('keyset.json', { hcsVersion: '0.1', version: 1, keys: [{ keyid: 'online-1', keytype: 'ed25519', public: JSON.parse(key.out).public, notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' }] });
  chmodSync(p('root.pem'), 0o644);
  const r = await runOn('win32', 'sign-keys', '--in', 'keyset.json', '--signer', 'root-1=root.pem', '--out', 'keys.json');
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /not checked on Windows; root\.pem is protected only by the ACL/);
  assert.equal(existsSync(p('keys.json')), true);
});

test('signer problems: not a PEM, missing file, malformed --signer', async () => {
  await publishKeys();
  write('junk.pem', 'hello');
  chmodSync(p('junk.pem'), 0o600);
  const junk2 = await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=junk.pem', '--out', 'k.json');
  assert.equal(junk2.code, 1); assert.match(junk2.err, /PKCS#8 PEM/); assert.equal(junk2.err.includes('hello'), false);
  assert.equal((await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=missing.pem', '--out', 'k.json')).code, 1);
  assert.equal((await run('sign-keys', '--in', 'keyset.json', '--signer', 'nokeyid.pem', '--out', 'k.json')).code, 2);
  assert.equal((await run('sign-keys', '--in', 'keyset.json', '--out', 'k.json')).code, 2);
});

test('sign-catalog rejects a catalog that readCatalog rejects (duplicate entry) with the HCS error code', async () => {
  await publishKeys();
  write('dup.json', { ...catalog, entries: [catalog.entries[0], { ...catalog.entries[0], version: '2.0.0' }] });
  const r = await run('sign-catalog', '--catalog', 'dup.json', '--sequence', '1', '--expires', '2026-11-13T00:00:00Z', '--binding', 'tenant=t', '--signer', 'online-1=online.pem', '--out', 'e.json');
  assert.equal(r.code, 1); assert.match(r.err, /^duplicate_entry: /);
  assert.equal(existsSync(p('e.json')), false);
});

test('sign-catalog usage errors: bad --sequence, bad --expires, bad --binding', async () => {
  await publishKeys();
  write('catalog.json', catalog);
  const base = ['sign-catalog', '--catalog', 'catalog.json', '--signer', 'online-1=online.pem', '--out', 'e.json'];
  const ok = ['--sequence', '1', '--expires', '2026-11-13T00:00:00Z', '--binding', 'tenant=t'];
  const replace = (flag: string, value: string) => { const c = [...ok]; c[c.indexOf(flag) + 1] = value; return c; };
  for (const bad of ['0', '-1', '1.5', 'abc', '9007199254740993', '']) {
    const r = await run(...base, ...replace('--sequence', bad));
    assert.equal(r.code, 2, `sequence ${bad}`); assert.match(r.err, /--sequence/);
  }
  for (const bad of ['tomorrow', '2026-11-13', '2026-11-13T00:00:00+01:00', '2026-11-13 00:00:00Z']) {
    const r = await run(...base, ...replace('--expires', bad));
    assert.equal(r.code, 2, `expires ${bad}`); assert.match(r.err, /--expires/);
  }
  for (const bad of ['tenant', '=v', 'a=b', 'tenant=']) {
    const list = bad === 'a=b' ? [...ok, '--binding', 'tenant=u'] : replace('--binding', bad);
    const r = await run(...base, ...list);
    assert.equal(r.code, 2, `binding ${bad}`);
  }
  assert.equal(existsSync(p('e.json')), false);
});

test('pack matches buildPackage, is reproducible, prints the identity and refuses to overwrite', async () => {
  const src = p('src'); mkdirSync(join(src, 'skills'), { recursive: true });
  writeFileSync(join(src, 'skills', 'a.md'), 'hello');
  const r = await run('pack', 'src', '--out', 'pkg.tar.gz');
  assert.equal(r.code, 0, r.err);
  const built = buildPackage(src);
  const printed = JSON.parse(r.out);
  assert.deepEqual(printed, { contentHash: built.contentHash, size: built.size, contentId: built.contentId, mediaType: built.mediaType });
  assert.equal(r.out, canonicalize(printed) + '\n');
  assert.deepEqual(readFileSync(p('pkg.tar.gz')), built.bytes);
  assert.doesNotThrow(() => verifyPackage(readFileSync(p('pkg.tar.gz')), { size: printed.size, contentHash: printed.contentHash, contentId: printed.contentId } as any));
  const second = await run('pack', 'src', '--out', 'pkg2.tar.gz');
  assert.equal(JSON.parse(second.out).contentId, printed.contentId);
  const refused = await run('pack', 'src', '--out', 'pkg.tar.gz');
  assert.equal(refused.code, 1); assert.match(refused.err, /already exists/);
  assert.equal((await run('pack', 'src', '--out', 'pkg.tar.gz', '--force')).code, 0);
  assert.deepEqual(readdirSync(dir).sort(), ['pkg.tar.gz', 'pkg2.tar.gz', 'src']);
});

test('pack fails with exit 1 on a symlink member and exit 2 without a directory', async () => {
  const src = p('src'); mkdirSync(src); symlinkSync('/etc/hostname', join(src, 'link'));
  const r = await run('pack', 'src', '--out', 'pkg.tar.gz');
  assert.equal(r.code, 1); assert.match(r.err, /Unsupported source member: link/);
  assert.equal(existsSync(p('pkg.tar.gz')), false);
  assert.equal((await run('pack', '--out', 'pkg.tar.gz')).code, 2);
});

test('the built-in bin entry runs end to end in a child process', () => {
  const bin = fileURLToPath(new URL('../src/cli/bin.ts', import.meta.url));
  const child = spawnSync(process.execPath, [bin, 'keygen', '--keyid', 'k-1', '--out', 'k.pem'], { cwd: dir, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).keyid, 'k-1');
  const again = spawnSync(process.execPath, [bin, 'keygen', '--keyid', 'k-1', '--out', 'k.pem'], { cwd: dir, encoding: 'utf8' });
  assert.equal(again.status, 1);
  assert.equal(spawnSync(process.execPath, [bin, 'nope'], { cwd: dir, encoding: 'utf8' }).status, 2);
});

test('no command output ever contains a seed, in base64, base64url or hex form', async () => {
  await publishKeys();
  const seeds = ['root.pem', 'online.pem'].map(f => seedOf(p(f)));
  await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=root.pem', '--out', 'keys.json');
  await run('sign-keys', '--in', 'online.pem', '--signer', 'root-1=root.pem', '--out', 'x.json');
  await run('sign-keys', '--in', 'keyset.json', '--signer', 'root-1=nope.pem', '--out', 'x.json');
  const text = transcript.join('\n');
  for (const s of seeds) {
    for (const form of [s.toString('base64'), s.toString('base64url'), s.toString('hex'), s.toString('base64').replace(/=+$/, '')]) {
      assert.equal(text.includes(form), false);
    }
  }
  assert.equal(text.includes('PRIVATE KEY'), false);
});
