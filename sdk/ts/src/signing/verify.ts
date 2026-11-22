// Key set (HCS-0007 section 5.3) and envelope (section 5.2) verification, in the order the spec
// fixes, stopping at the first failure (R009).
import { checkEnvelopeSequence, checkKeySetVersion } from './acceptance.ts';
import { ed25519Verify } from './ed25519.ts';
import { contentDigest, ENVELOPE_PAYLOAD_TYPE, KEY_SET_PAYLOAD_TYPE, signingInput } from './pae.ts';
import { assertAssignment, assertTrustAnchor, checkEnvelopeShape, checkKeySetShape, parseInstant } from './shape.ts';
import { fail, type AcceptedEnvelope, type AcceptedKeySet, type Clock, type Envelope, type KeySet, type Limits, type SigningError, type TrustAnchor } from './types.ts';

declare const verified: unique symbol;
/** A key set that passed `verifyKeySet`; only such a key set can verify envelopes. */
export type VerifiedKeySet = Readonly<KeySet> & { readonly [verified]: true };
const VERIFIED = new WeakSet<object>();

/** Errors that a host-supplied HCS-0001 catalog validator reports for step 6. */
export type CatalogValidator = (catalog: Record<string, unknown>) => ReadonlyArray<{ code: string; message?: string; entry?: string; capability?: string }>;

export type KeySetVerification =
  | { ok: true; keySet: VerifiedKeySet; accepted: AcceptedKeySet }
  | { ok: false; errors: SigningError[] };

export type EnvelopeVerification =
  | { ok: true; envelope: Envelope; catalog: Record<string, unknown>; accepted: AcceptedEnvelope }
  | { ok: false; errors: SigningError[]; step: 1 | 2 | 3 | 4 | 5 | 6 };

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

function clock(now: Clock): bigint {
  if (now instanceof Date) {
    const ms = now.getTime();
    if (Number.isNaN(ms)) throw new TypeError('now is an invalid Date');
    return BigInt(ms) * 1_000_000n;
  }
  const ns = parseInstant(now);
  if (ns === null) throw new TypeError(`now ${JSON.stringify(now)} is not an RFC 3339 UTC timestamp`);
  return ns;
}

/** R014: notBefore inclusive, notAfter exclusive. */
const validAt = (key: { notBefore: string; notAfter: string }, now: bigint) =>
  parseInstant(key.notBefore)! <= now && now < parseInstant(key.notAfter)!;

/** Number of distinct public keys (not keyids) with a valid signature over the document. */
function countSigners(doc: { signatures?: { keyid: string; sig: string }[] }, payloadType: string, keys: Map<string, string>): number {
  const message = signingInput(payloadType, doc);
  const good = new Set<string>();
  for (const { keyid, sig } of doc.signatures ?? []) {
    const pub = keys.get(keyid);
    if (pub !== undefined && !good.has(pub) && ed25519Verify(b64(pub), message, b64(sig))) good.add(pub);
  }
  return good.size;
}

/**
 * Verifies a key set against the trust anchor (R002, R011, R012, R013), in that order.
 * `lastAccepted` is the host's accepted state for key sets, when it has one.
 */
export function verifyKeySet(keySet: unknown, opts: { trustAnchor: TrustAnchor; lastAccepted?: AcceptedKeySet; now: Clock; limits?: Limits }): KeySetVerification {
  assertTrustAnchor(opts.trustAnchor);
  const now = clock(opts.now);
  const errors = checkKeySetShape(keySet, opts.limits);
  if (errors.length) return { ok: false, errors };
  const ks = keySet as KeySet;
  const roots = new Map(opts.trustAnchor.keys.map(k => [k.keyid, k.public]));
  const threshold = opts.trustAnchor.threshold ?? 1;
  if (countSigners(ks, KEY_SET_PAYLOAD_TYPE, roots) < threshold)
    return { ok: false, errors: [fail('signature_invalid', `key set lacks valid signatures from ${threshold} distinct root key(s)`, 'HCS-0007-R011')] };
  const digest = contentDigest(ks);
  const accepted = checkKeySetVersion({ version: ks.version, digest }, opts.lastAccepted);
  if (!accepted.ok) return { ok: false, errors: [accepted.error] };
  if (!ks.keys.some(k => validAt(k, now)))
    return { ok: false, errors: [fail('signature_invalid', 'no key of the key set is within its validity window', 'HCS-0007-R013')] };
  const copy = structuredClone(ks) as VerifiedKeySet;
  VERIFIED.add(copy);
  return { ok: true, keySet: copy, accepted: { version: ks.version, digest } };
}

function sameBinding(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && a[k] === b[k]);
}

/**
 * HCS-0007-R030: true when a key with `scope` as its `binding` counts for an envelope with `binding`:
 * no scope, or every member of the scope is an own member of `binding` with an equal value. Equality
 * only, no patterns. Own-property checks, so an inherited name such as `constructor` never matches.
 */
export function bindingCovers(scope: Readonly<Record<string, string>> | undefined, binding: Readonly<Record<string, string>>): boolean {
  if (scope === undefined) return true;
  return Object.keys(scope).every(k => Object.hasOwn(binding, k) && binding[k] === scope[k]);
}

/**
 * Verifies an envelope per HCS-0007 section 5.2: (1) version and shape, (2) signatures (R005, with
 * the key scope of R030), (3) binding, (4) expiry, (5) sequence, (6) the catalog via `validateCatalog` (HCS-0001).
 */
export function verifyEnvelope(envelope: unknown, opts: {
  keySet: VerifiedKeySet; assignment: Record<string, string>; lastAccepted?: AcceptedEnvelope; now: Clock; validateCatalog: CatalogValidator; limits?: Limits;
}): EnvelopeVerification {
  if (!VERIFIED.has(opts.keySet)) throw new TypeError('keySet must be the result of verifyKeySet');
  assertAssignment(opts.assignment);
  if (typeof opts.validateCatalog !== 'function') throw new TypeError('validateCatalog is required (HCS-0007-R010)');
  const now = clock(opts.now);

  const shape = checkEnvelopeShape(envelope, opts.limits);
  if (shape.length) return { ok: false, errors: shape, step: 1 };
  const env = envelope as Envelope;

  // R014 and R030: only keys valid now and whose binding (if any) the envelope's binding covers count.
  const online = new Map(opts.keySet.keys.filter(k => validAt(k, now) && bindingCovers(k.binding, env.binding)).map(k => [k.keyid, k.public]));
  const threshold = opts.keySet.threshold ?? 1;
  if (countSigners(env, ENVELOPE_PAYLOAD_TYPE, online) < threshold)
    return { ok: false, step: 2, errors: [fail('signature_invalid', `envelope lacks valid signatures from ${threshold} distinct online key(s) valid now and in scope`, 'HCS-0007-R005')] };

  if (!sameBinding(env.binding, opts.assignment))
    return { ok: false, step: 3, errors: [fail('permission_denied', 'envelope binding differs from the host assignment', 'HCS-0007-R006')] };

  if (now >= parseInstant(env.expires)!)
    return { ok: false, step: 4, errors: [fail('signature_invalid', `envelope expired at ${env.expires}`, 'HCS-0007-R007')] };

  const digest = contentDigest(env);
  const accepted = checkEnvelopeSequence({ sequence: env.sequence, digest }, opts.lastAccepted);
  if (!accepted.ok) return { ok: false, step: 5, errors: [accepted.error] };

  const catalogErrors = opts.validateCatalog(env.catalog);
  if (catalogErrors.length)
    return {
      ok: false, step: 6, errors: catalogErrors.map(e => ({
        code: e.code, message: e.message ?? `catalog fails HCS-0001: ${e.code}`, requirement: 'HCS-0007-R010',
        ...(e.entry ? { entry: e.entry } : {}), ...(e.capability ? { capability: e.capability } : {}),
      })),
    };
  return { ok: true, envelope: env, catalog: env.catalog, accepted: { sequence: env.sequence, digest } };
}

export type SignedCatalogVerification =
  | { ok: true; catalog: Record<string, unknown>; keySet: { verified: VerifiedKeySet; accepted: AcceptedKeySet }; envelope: { accepted: AcceptedEnvelope } }
  | { ok: false; stage: 'key-set' | 'envelope'; errors: SigningError[] };

/**
 * Verifies the key set first, then the envelope with it. The caller records both accepted states
 * only when `ok` is true (R015). `lastKeySet` and `lastAccepted` MUST be the accepted state kept for
 * `assignment`, never the state of another assignment (R031); `sync.assignmentScope` names one.
 */
export function verifySignedCatalog(input: {
  trustAnchor: TrustAnchor; keySet: unknown; lastKeySet?: AcceptedKeySet;
  envelope: unknown; assignment: Record<string, string>; lastAccepted?: AcceptedEnvelope;
  now: Clock; validateCatalog: CatalogValidator; limits?: Limits;
}): SignedCatalogVerification {
  const ks = verifyKeySet(input.keySet, { trustAnchor: input.trustAnchor, lastAccepted: input.lastKeySet, now: input.now, limits: input.limits });
  if (!ks.ok) return { ok: false, stage: 'key-set', errors: ks.errors };
  const env = verifyEnvelope(input.envelope, { keySet: ks.keySet, assignment: input.assignment, lastAccepted: input.lastAccepted, now: input.now, validateCatalog: input.validateCatalog, limits: input.limits });
  if (!env.ok) return { ok: false, stage: 'envelope', errors: env.errors };
  return { ok: true, catalog: env.catalog, keySet: { verified: ks.keySet, accepted: ks.accepted }, envelope: { accepted: env.accepted } };
}

