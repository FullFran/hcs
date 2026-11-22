import type { ApplyOptions, ApplyResult } from './host-state.ts';

// Package-internal hand-off from `host-state.ts` to `sync/`. This module is deliberately not
// re-exported from `index.ts`: the locked variant assumes the caller holds the host lock, so it
// must not be part of the public API.
export interface HostInternals {
  // Runs `fn` while holding the host lock for `stateDir`; a busy lock throws HostBusyError.
  withHostLock<T>(stateDir: string, fn: () => Promise<T>): Promise<T>;
  // The body of `applyDesiredSet`. The caller MUST hold the host lock for `options.stateDir`.
  applyDesiredSetLocked(catalogBytes: Uint8Array | string, options: ApplyOptions): Promise<ApplyResult>;
}

let registered: HostInternals | undefined;

export function registerHostInternals(internals: HostInternals): void { registered = internals; }

export function hostInternals(): HostInternals {
  if (!registered) throw new Error('host-state.ts has not been loaded');
  return registered;
}
