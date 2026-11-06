# SPIFFE (with SPIRE as reference implementation)

| Field | Value |
| --- | --- |
| Owner | CNCF (Graduated); SPIFFE project |
| Version pinned | SPIFFE specs: unversioned, per-document stability labels (SPIFFE-ID, X509-SVID, JWT-SVID, Workload API, Trust Domain and Bundle, Federation: "Stable"; WIT-SVID: "Incubating"). SPIRE v1.16.0 (GitHub release 2026-11-05) |
| Source pinned | spiffe/spiffe@5d15e3ee8782e205048d1f206fbf944e075f7bae (`main`, `standards/`); spiffe/spire@v1.16.0 (commit 872c1d55b4d5ac7fc1bf05f0760f2ca740ab37aa) |
| Access date | 2026-11-06 |
| License | Apache-2.0 (both repos) |
| Maturity | CNCF Graduated (per catalog, pre-verified); specs stable per `standards/STABILITY.md` labels |
| HCS action | out (workload identity; not needed for a single-user desktop distribution). Possible future input to HCS-0005 subjects for multi-host deployments [I] |

## What it defines

Identity for software workloads: a URI-form SPIFFE ID, verifiable identity documents (SVIDs)
that carry it, trust domains with trust bundles, federation between trust domains, and a
local Workload API that workloads call to obtain their SVIDs. SPIRE implements issuance and
attestation.

## Key objects and fields

- SPIFFE ID: `spiffe://<trust-domain>/<path>`. Rules: scheme `spiffe`; no query or fragment;
  trust domain lowercase `[a-z0-9.-_]`, no userinfo, no port, no percent-encoding, at most
  255 bytes; path segments `[a-zA-Z0-9.-_]`, no empty, `.` or `..` segments, no trailing `/`;
  implementations MUST support IDs up to 2048 bytes.
- SVID formats: X509-SVID (ID in a URI SAN), JWT-SVID (ID in `sub`, with `aud`, `exp`),
  WIT-SVID (IETF WIMSE Workload Identity Token, incubating).
- Trust bundle: per trust domain, the keys used to validate SVIDs.
- Workload API (gRPC, `workloadapi.proto`): `FetchX509SVID`, `FetchX509Bundles`,
  `FetchJWTSVID`, `FetchJWTBundles`, `ValidateJWTSVID`.

## Extension points

- Path semantics are left to the administrator.
- New SVID document types via format-specific specifications.
- SPIRE plugins (node/workload attestors, key managers, upstream authorities).

## Where HCS references it instead of redefining

- HCS-0005 authority: if a host grants per workload (e.g. remote plugin processes), the
  subject identifier MAY be a SPIFFE ID; HCS MUST NOT define workload identity syntax or
  attestation. [I]
- AGENT-1 remote / TOOLS-1 remote: mTLS with X509-SVIDs is a transport-level choice of the
  distribution, outside HCS. [I]

## Pitfalls for HCS

- SPIFFE identifies workloads, not users; do not mix it with OIDC subjects in one field
  without a type tag.
- "WIT-SVID" means Workload Identity Token, unrelated to WebAssembly WIT.
- Specs are versioned by stability label and commit, not releases; pin a commit.
- Heavy for desktop: SPIRE needs a server and agent; out of scope for HagaHarness 0.1.

## Sources

- https://github.com/spiffe/spiffe/tree/5d15e3ee8782e205048d1f206fbf944e075f7bae/standards
  (SPIFFE-ID.md, JWT-SVID.md, WIT-SVID.md, STABILITY.md, SPIFFE_Workload_API.md)
- https://github.com/spiffe/spire/releases/tag/v1.16.0
