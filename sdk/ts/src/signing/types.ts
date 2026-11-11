// Shared types for HCS-0007 (DISTRO-1). No dependency on other SDK modules; error codes are the
// HCS-0006 codes that HCS-0007 names, so they can be mapped to the shared errors module unchanged.

export type SigningErrorCode =
  | 'manifest_invalid'
  | 'unsupported_hcs_version'
  | 'signature_invalid'
  | 'permission_denied'
  | 'rollback_rejected';

export interface SigningError {
  /** HCS error code; catalog errors returned by `validateCatalog` (step 6) pass through with their own code. */
  code: SigningErrorCode | (string & {});
  message: string;
  /** HCS requirement whose check failed, e.g. `HCS-0007-R005`. */
  requirement?: string;
  entry?: string;
  capability?: string;
}

export interface Signature { keyid: string; sig: string }
export interface PublicKey { keyid: string; keytype: 'ed25519'; public: string }
export interface OnlineKey extends PublicKey { notBefore: string; notAfter: string; [extension: `x-${string}`]: unknown }

export interface TrustAnchor { keys: PublicKey[]; threshold?: number }

export interface KeySet {
  hcsVersion: '0.1';
  version: number;
  threshold?: number;
  keys: OnlineKey[];
  signatures?: Signature[];
  [extension: `x-${string}`]: unknown;
}

export interface Envelope {
  hcsVersion: '0.1';
  sequence: number;
  expires: string;
  binding: Record<string, string>;
  catalog: Record<string, unknown>;
  signatures?: Signature[];
  [extension: `x-${string}`]: unknown;
}

/** Accepted state of the last key set (HCS-0007 section 3.3). */
export interface AcceptedKeySet { version: number; digest: string }
/** Accepted state of the last envelope (HCS-0007 section 3.3). */
export interface AcceptedEnvelope { sequence: number; digest: string }

/**
 * Bounds a host may set on a document (HCS-0007-R023); a document over a bound is `manifest_invalid`
 * before any signature is verified. HCS states no number.
 */
export interface Limits { maxKeys?: number; maxSignatures?: number }

/** A stated clock: an RFC 3339 UTC timestamp or a Date. */
export type Clock = string | Date;

/** A publisher's signing key: `privateKey` is the 32-byte Ed25519 seed or a node:crypto private KeyObject. */
export interface Signer { keyid: string; privateKey: Uint8Array | import('node:crypto').KeyObject }

export const HCS_VERSION = '0.1';
export const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export const fail = (code: SigningErrorCode, message: string, requirement?: string): SigningError =>
  requirement ? { code, message, requirement } : { code, message };
