// Publisher helpers: sign envelopes and key sets. Signatures are appended so several holders can
// sign the same document in turn; Ed25519 is deterministic, so re-signing yields the same bytes.
import { ed25519Sign } from './ed25519.ts';
import { ENVELOPE_PAYLOAD_TYPE, KEY_SET_PAYLOAD_TYPE, signingInput } from './pae.ts';
import { checkEnvelopeShape } from './shape.ts';
import { HCS_VERSION, type Envelope, type KeySet, type Signature, type Signer } from './types.ts';

/** Returns a copy of `doc` with one signature per signer appended. Throws CanonicalError. */
export function signDocument<T extends object>(payloadType: string, doc: T, signers: readonly Signer[]): T & { signatures: Signature[] } {
  const input = signingInput(payloadType, doc);
  const existing = ((doc as { signatures?: Signature[] }).signatures ?? []).map(s => ({ ...s }));
  const added = signers.map(s => ({ keyid: s.keyid, sig: Buffer.from(ed25519Sign(s.privateKey, input)).toString('base64') }));
  return { ...structuredClone(doc), signatures: [...existing, ...added] };
}

/** Signs an envelope with online keys. */
export function signEnvelope<T extends object>(envelope: T, signers: readonly Signer[]) {
  return signDocument(ENVELOPE_PAYLOAD_TYPE, envelope, signers);
}

/** Signs a key set with root keys (keep them offline, HCS-0007-R019). */
export function signKeySet<T extends object = KeySet>(keySet: T, rootSigners: readonly Signer[]) {
  return signDocument(KEY_SET_PAYLOAD_TYPE, keySet, rootSigners);
}

/** Builds an `hcsVersion` 0.1 envelope, checks its shape and signs it. Throws TypeError on an invalid envelope. */
export function createEnvelope(fields: {
  sequence: number; expires: string | Date; binding: Record<string, string>; catalog: Record<string, unknown>;
  extensions?: Record<`x-${string}`, unknown>;
}, signers: readonly Signer[]): Envelope & { signatures: Signature[] } {
  const envelope = {
    ...fields.extensions,
    hcsVersion: HCS_VERSION,
    sequence: fields.sequence,
    expires: fields.expires instanceof Date ? fields.expires.toISOString() : fields.expires,
    binding: fields.binding,
    catalog: fields.catalog,
  } as Envelope;
  const errors = checkEnvelopeShape(envelope);
  if (errors.length) throw new TypeError(errors[0].message);
  return signEnvelope(envelope, signers);
}
