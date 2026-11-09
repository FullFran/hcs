// What a host declares about itself (HCS-0003 host profile). Each distribution builds its own
// profile and passes it to the functions that need it; the SDK ships no default host (ADR-0029).
export interface HostProfile {
  id?: string;
  version?: string;
  platform: { os: string; architecture: string; variant?: string };
  contributionKinds: string[];
  mediaTypes: string[];
  builtins: string[];
  activationPolicy?: 'all-or-nothing' | 'partial';
}
