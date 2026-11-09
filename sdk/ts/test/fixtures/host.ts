import type { HostProfile } from '../../src/host.ts';

// A host profile and permission set owned by the tests. Distributions pass their own (ADR-0029).
export const TEST_HOST: HostProfile = {
  id: 'dev.test.host', version: '1.0.0',
  platform: { os: 'linux', architecture: 'amd64' },
  contributionKinds: ['skill', 'mcp-server', 'x-test-kind'],
  mediaTypes: ['application/vnd.oci.image.layer.v1.tar+gzip'],
  builtins: ['dev.test.host.read@1', 'dev.test.host.check@1'],
  activationPolicy: 'all-or-nothing',
};

export const TEST_PERMISSIONS = ['dev.test.host.read', 'dev.test.host.import', 'dev.test.host.propose'] as const;
// Held by the host for its own use and never grantable to a package.
export const TEST_RESERVED_PERMISSION = 'dev.test.host.review.decide';
