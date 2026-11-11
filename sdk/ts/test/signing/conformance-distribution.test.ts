// Runs every HCS-0007 conformance case the SDK can execute: all `distribution`-level cases
// (signing-input, key-set, envelope; see conformance/README.md) plus the `document`-level cases
// whose target is the HCS-0007 envelope or key set schema. Host-level cases are not applicable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnvelopeShape, checkKeySetShape, readEnvelope, readKeySet, signingInput, CanonicalError, verifyKeySet, verifySignedCatalog } from '../../src/signing/index.ts';
import { readCatalog } from '../../src/catalog.ts';

const CASES = fileURLToPath(new URL('../../../../conformance/cases/', import.meta.url));
const SIGNED = 'urn:hcs:schema:hcs-0007:signed-catalog:0.1';
type Err = { code: string; entry?: string; capability?: string };
type Case = { description: string; level: string; target?: string; input?: any; documentBase64?: string; expect: any };

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(d => d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.json') ? [join(dir, d.name)] : []);
const norm = (errors: Err[]) => errors.map(e => JSON.stringify({ code: e.code, ...(e.entry ? { entry: e.entry } : {}), ...(e.capability ? { capability: e.capability } : {}) })).sort();
const validateCatalog = (c: unknown) => { const r = readCatalog(JSON.stringify(c)); return r.ok ? [] : r.errors; };

function run(c: Case): { errors: Err[]; signing?: string } {
  let inp = c.input;
  if (c.documentBase64 !== undefined) {
    // The case carries the exact text of the document: read it as a host reads the received bytes
    // (readable, then hcsVersion, then R004 and shape), before any verification.
    const bytes = new Uint8Array(Buffer.from(c.documentBase64, 'base64'));
    const keySetText = c.level === 'document' ? c.target === `${SIGNED}#/$defs/keySet` : inp.check === 'key-set';
    const parsed = (keySetText ? readKeySet : readEnvelope)(bytes, inp?.limits);
    if (!parsed.ok) return { errors: parsed.errors };
    if (c.level === 'document') inp = parsed.value;
    else inp = { ...inp, [inp.check === 'key-set' ? 'keySet' : 'envelope']: parsed.value };
  }
  if (c.level === 'document') return { errors: (c.target === `${SIGNED}#/$defs/envelope` ? checkEnvelopeShape : checkKeySetShape)(inp) };
  if (inp.check === 'signing-input') {
    try { return { errors: [], signing: new TextDecoder().decode(signingInput(inp.payloadType, inp.document)) }; }
    catch (e) { if (e instanceof CanonicalError) return { errors: [{ code: 'manifest_invalid' }] }; throw e; }
  }
  if (inp.check === 'key-set') {
    const r = verifyKeySet(inp.keySet, { trustAnchor: inp.trustAnchor, lastAccepted: inp.lastKeySet, now: inp.now, limits: inp.limits });
    return { errors: r.ok ? [] : r.errors };
  }
  if (inp.check === 'envelope') {
    const r = verifySignedCatalog({ trustAnchor: inp.trustAnchor, keySet: inp.keySet, lastKeySet: inp.lastKeySet, envelope: inp.envelope,
      assignment: inp.assignment, lastAccepted: inp.lastAccepted, now: inp.now, validateCatalog, limits: inp.limits });
    return { errors: r.ok ? [] : r.errors };
  }
  throw new Error(`unknown check ${inp.check}`);
}

test('HCS-0007 conformance cases', t => {
  const counts = { pass: 0, fail: 0, notApplicable: 0 };
  const failures: string[] = [];
  for (const path of walk(CASES).sort()) {
    const c: Case = JSON.parse(readFileSync(path, 'utf8'));
    const hcs0007 = path.includes('/HCS-0007/');
    const shapeCase = c.level === 'document' && (c.target === `${SIGNED}#/$defs/envelope` || c.target === `${SIGNED}#/$defs/keySet`);
    if (c.level !== 'distribution' && !shapeCase) { if (hcs0007) counts.notApplicable++; continue; }
    const got = run(c), exp = c.expect;
    const outcome = got.errors.length ? 'invalid' : 'valid';
    const ok = (!('outcome' in exp) || exp.outcome === outcome)
      && (!('errors' in exp) || JSON.stringify(norm(got.errors)) === JSON.stringify(norm(exp.errors)))
      && (!('signingInput' in exp) || got.signing === exp.signingInput);
    if (ok) counts.pass++; else { counts.fail++; failures.push(`${path.slice(CASES.length)}: got ${outcome} ${JSON.stringify(norm(got.errors))}`); }
  }
  const summary = `HCS-0007 conformance: ${counts.pass} pass, ${counts.fail} fail, ${counts.notApplicable} not-applicable (host)`;
  t.diagnostic(summary);
  console.log(summary);
  assert.deepEqual(failures, []);
  assert.ok(counts.pass >= 37 + 13 + 34, 'every distribution case and every HCS-0007 shape case ran');
});
