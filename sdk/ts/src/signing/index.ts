// HCS-0007 (DISTRO-1): canonical JSON, signature input, Ed25519, verification and signing.
export * from './types.ts';
export { CanonicalError, canonicalize, canonicalBytes, parseStrictJson } from './canonical.ts';
export { ENVELOPE_PAYLOAD_TYPE, KEY_SET_PAYLOAD_TYPE, type PayloadType, pae, unsignedBytes, signingInput, contentDigest } from './pae.ts';
export { ed25519PublicKey, ed25519Sign, ed25519Verify, generateKeyPair } from './ed25519.ts';
export { checkEnvelopeShape, checkKeySetShape, readEnvelope, readKeySet, isCanonicalValue, parseInstant } from './shape.ts';
export {
  verifyKeySet, verifyEnvelope, verifySignedCatalog, bindingCovers,
  type VerifiedKeySet, type CatalogValidator, type KeySetVerification, type EnvelopeVerification, type SignedCatalogVerification,
} from './verify.ts';
export { checkEnvelopeSequence, checkKeySetVersion, nextSequence, SigningRejection, type Acceptance } from './acceptance.ts';
export { signDocument, signEnvelope, signKeySet, createEnvelope, createKeySet } from './sign.ts';
export { isPrivateKeyMaterial, seedToPem, readSignerPem } from './keys.ts';
