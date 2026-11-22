// The HCS-0007 acceptance rule (R008 for envelope sequences, R012 for key-set versions) as pure
// functions: no I/O, no lock, no clock. The caller owns persistence and concurrency, and decides
// which two states to compare (per assignment, per binding, ...).
import { fail, MAX_SAFE, type AcceptedEnvelope, type AcceptedKeySet, type SigningError } from './types.ts';

/** `changed: false` is an identical replay (same number, same digest): accepted as a no-op. */
export type Acceptance = { ok: true; changed: boolean } | { ok: false; error: SigningError };

/** Thrown by `nextSequence`; carries the HCS error code and requirement id of the rejection. */
export class SigningRejection extends Error implements SigningError {
  readonly code: SigningError['code'];
  readonly requirement?: string;
  constructor(error: SigningError) {
    super(error.message);
    this.name = 'SigningRejection';
    this.code = error.code;
    if (error.requirement) this.requirement = error.requirement;
  }
}

function check(number: number, digest: string, last: { number: number; digest: string } | undefined, rejection: () => SigningError): Acceptance {
  if (!last) return { ok: true, changed: true };
  if (number < last.number || (number === last.number && digest !== last.digest)) return { ok: false, error: rejection() };
  return { ok: true, changed: number !== last.number };
}

/**
 * HCS-0007-R008: may `candidate` follow `last` on this assignment? A lower sequence, or the same
 * sequence with another digest, is `rollback_rejected`; an identical replay is `changed: false`.
 */
export function checkEnvelopeSequence(candidate: AcceptedEnvelope, last?: AcceptedEnvelope): Acceptance {
  return check(candidate.sequence, candidate.digest, last && { number: last.sequence, digest: last.digest }, () =>
    fail('rollback_rejected', `envelope sequence ${candidate.sequence} rolls back accepted sequence ${last!.sequence}`, 'HCS-0007-R008'));
}

/** HCS-0007-R012: the same rule for key-set versions. */
export function checkKeySetVersion(candidate: AcceptedKeySet, last?: AcceptedKeySet): Acceptance {
  return check(candidate.version, candidate.digest, last && { number: last.version, digest: last.digest }, () =>
    fail('rollback_rejected', `key set version ${candidate.version} rolls back accepted version ${last!.version}`, 'HCS-0007-R012'));
}

const isSequence = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_SAFE;

/**
 * Publisher side: the next sequence above every one already issued (1 when none). With `requested`,
 * returns it when it is above every issued sequence and throws `rollback_rejected` (R008) otherwise,
 * so a sequence is never reused. Throws a TypeError for a value that is not a sequence (R001).
 */
export function nextSequence(issued: Iterable<number>, requested?: number): number {
  let highest = 0;
  for (const n of issued) {
    if (!isSequence(n)) throw new TypeError(`issued sequence ${String(n)} is not an integer from 1 to ${MAX_SAFE}`);
    if (n > highest) highest = n;
  }
  if (requested === undefined) {
    if (highest >= MAX_SAFE) throw new RangeError('no sequence is left above the highest issued one');
    return highest + 1;
  }
  if (!isSequence(requested)) throw new TypeError(`requested sequence ${String(requested)} is not an integer from 1 to ${MAX_SAFE}`);
  if (requested <= highest)
    throw new SigningRejection(fail('rollback_rejected', `requested sequence ${requested} is not above issued sequence ${highest}`, 'HCS-0007-R008'));
  return requested;
}
