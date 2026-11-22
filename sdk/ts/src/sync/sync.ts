import { readCatalog } from '../catalog.ts';
import { HcsFailure, hcsError, type HcsError, type HcsErrorCode } from '../errors.ts';
import { checkDetailPrefix, DEFAULT_DETAIL_PREFIX } from '../extensions.ts';
import '../host-state.ts'; // registers the lock internals used below
import type { ApplyOptions, ApplyResult } from '../host-state.ts';
import { hostInternals } from '../host-state-internal.ts';
import { canonicalBytes, verifySignedCatalog, type AcceptedEnvelope, type AcceptedKeySet, type Clock, type TrustAnchor } from '../signing/index.ts';
import { fileAcceptedStateStore, type AcceptedState, type AcceptedStateStore } from './state.ts';

// Transport (HTTP, file, registry) is the host's implementation. Both members return parsed JSON;
// transport errors are thrown as ordinary errors.
export interface SignedSource {
  keySet(signal: AbortSignal): Promise<unknown>;
  envelope(signal: AbortSignal): Promise<unknown>;
}

export interface SyncOptions {
  source: SignedSource;
  trustAnchor: TrustAnchor;
  // The host's enrolled binding, opaque to the SDK (HCS-0007-R006).
  assignment: Record<string, string>;
  // State namespace, opaque to the SDK; defaults to "default".
  scope?: string;
  // Defaults to `fileAcceptedStateStore(apply.stateDir)`.
  store?: AcceptedStateStore;
  // The options `applyDesiredSet` takes.
  apply: ApplyOptions;
  now?: () => Clock;
  signal?: AbortSignal;
  // Verify and record only; do not call `applyDesiredSet`.
  verifyOnly?: boolean;
}

export type SyncResult =
  | { applied: true; apply: ApplyResult; accepted: { keySet: AcceptedKeySet; envelope: AcceptedEnvelope } }
  | { applied: false; accepted: { keySet: AcceptedKeySet; envelope: AcceptedEnvelope } };

const same = (a: AcceptedState, b: AcceptedState): boolean =>
  a.keySet?.version === b.keySet?.version && a.keySet?.digest === b.keySet?.digest &&
  a.envelope?.sequence === b.envelope?.sequence && a.envelope?.digest === b.envelope?.digest;

// Reads the accepted state, fetches, verifies, records the new accepted state, then applies.
//
// Verification goes only through `signing.verifySignedCatalog`: this function never compares a
// sequence or version itself, so the acceptance rule keeps a single definition (HCS-0007-R008, R012).
// A corrupt state file throws `AcceptedStateError` before anything is fetched or applied.
//
// Concurrency: the host lock for `apply.stateDir` is held for the whole call (read state, fetch,
// verify, record, apply), including with `verifyOnly`, so two syncers cannot interleave. A busy lock
// throws `HostBusyError`. A custom `store` that lives outside `apply.stateDir` is not covered by
// this lock; its own writers must be serialized by the host.
export async function syncSigned(options: SyncOptions): Promise<SyncResult> {
  checkDetailPrefix(options.apply.detailPrefix ?? DEFAULT_DETAIL_PREFIX);
  return hostInternals().withHostLock(options.apply.stateDir, () => syncLocked(options));
}

async function syncLocked(options: SyncOptions): Promise<SyncResult> {
  const prefix = options.apply.detailPrefix ?? DEFAULT_DETAIL_PREFIX;
  checkDetailPrefix(prefix);
  const scope = options.scope ?? 'default';
  const store = options.store ?? fileAcceptedStateStore(options.apply.stateDir);
  const signal = options.signal ?? new AbortController().signal;

  const state = await store.read(scope);
  const [keySet, envelope] = [await options.source.keySet(signal), await options.source.envelope(signal)];

  const verified = verifySignedCatalog({
    trustAnchor: options.trustAnchor, keySet, lastKeySet: state.keySet,
    envelope, assignment: options.assignment, lastAccepted: state.envelope,
    now: options.now?.() ?? new Date(),
    validateCatalog: catalog => {
      const read = readCatalog(canonicalBytes(catalog), undefined, prefix);
      return read.ok ? [] : read.errors;
    },
  });
  if (!verified.ok) {
    // Nothing is written (HCS-0007-R015).
    throw new HcsFailure(verified.errors.map((e): HcsError => hcsError(e.code as HcsErrorCode, e.message, {
      ...(e.requirement ? { requirement: e.requirement } : {}),
      ...(e.entry ? { entry: e.entry } : {}),
      ...(e.capability ? { capability: e.capability } : {}),
      details: { [`${prefix}-stage`]: verified.stage },
    })));
  }

  const accepted = { keySet: verified.keySet.accepted, envelope: verified.envelope.accepted };
  // HCS-0007-R015 ties acceptance to the section 5.2 checks, which have all passed here, and the
  // accepted state must survive restarts. The state is therefore recorded before apply and stays
  // recorded when apply fails: a failed or rolled-back apply cannot be followed by an older
  // envelope, and the same envelope can be retried because equal sequence and digest still pass
  // R008. Both parts go in one record, so a crash never advances one without the other. An
  // unchanged state is not rewritten.
  if (!same(state, accepted)) await store.write(scope, accepted);

  if (options.verifyOnly) return { applied: false, accepted };
  const apply = await hostInternals().applyDesiredSetLocked(canonicalBytes(verified.catalog), options.apply);
  return { applied: true, apply, accepted };
}
