// Signature input (HCS-0007 section 4, R003): PAE(payloadType, JCS(document without "signatures")).
import { createHash } from 'node:crypto';
import { canonicalBytes } from './canonical.ts';

export const ENVELOPE_PAYLOAD_TYPE = 'application/vnd.hcs.catalog-envelope+json';
export const KEY_SET_PAYLOAD_TYPE = 'application/vnd.hcs.key-set+json';
export type PayloadType = typeof ENVELOPE_PAYLOAD_TYPE | typeof KEY_SET_PAYLOAD_TYPE;

/** DSSE v1 pre-authentication encoding: "DSSEv1" SP LEN(type) SP type SP LEN(body) SP body, lengths in bytes. */
export function pae(payloadType: string, body: Uint8Array): Uint8Array {
  const type = Buffer.from(payloadType, 'utf8');
  const head = Buffer.from(`DSSEv1 ${type.length} `, 'ascii');
  return new Uint8Array(Buffer.concat([head, type, Buffer.from(` ${body.length} `, 'ascii'), body]));
}

function withoutSignatures(doc: object): Record<string, unknown> {
  const { signatures: _ignored, ...rest } = doc as Record<string, unknown>;
  return rest;
}

/** Canonical bytes of a document without its `signatures` member. Throws CanonicalError. */
export function unsignedBytes(doc: object): Uint8Array {
  return canonicalBytes(withoutSignatures(doc));
}

/** The bytes an envelope or key set signature covers. Throws CanonicalError. */
export function signingInput(payloadType: string, doc: object): Uint8Array {
  return pae(payloadType, unsignedBytes(doc));
}

/** `sha256:<hex>` of the canonical form without signatures: the content identity of section 3.3. */
export function contentDigest(doc: object): string {
  return 'sha256:' + createHash('sha256').update(unsignedBytes(doc)).digest('hex');
}
