# OAuth 2.0 (RFC 6749) with RFC 9700, RFC 8707, RFC 9207

| Field | Value |
| --- | --- |
| Owner | IETF (OAuth WG) |
| Version pinned | RFC 6749 (October 2012); RFC 9700 = BCP 240 (January 2025, updates 6749, 6750, 6819); RFC 8707 Resource Indicators (February 2020); RFC 9207 Authorization Server Issuer Identification (March 2022). OAuth 2.1: `draft-ietf-oauth-v2-1-17` (2026-10-31), Internet-Draft, not an RFC |
| Source pinned | RFC texts at https://www.rfc-editor.org/rfc/rfc{6749,9700,8707,9207}.txt (RFCs are immutable); draft revision -17 on datatracker |
| Access date | 2026-11-06 |
| License | IETF Trust Legal Provisions for RFCs [U: TLP version not checked] |
| Maturity | RFC 6749, 8707, 9207: Proposed Standard. RFC 9700: Best Current Practice. OAuth 2.1: WG Document, "I-D Exists" |
| HCS action | out of core; referenced by remote profiles (TOOLS-1 remote MCP, AGENT-1 remote A2A) through those protocols' own auth profiles |

## What it defines

Delegated authorization: a client obtains an access token from an authorization server (AS)
to call a resource server (RS), with roles, grant types, endpoints, error codes and scope.
RFC 9700 is the current security baseline; RFC 8707 binds tokens to a target resource;
RFC 9207 lets the client verify which AS sent an authorization response.

## Key objects and fields

- Endpoints: authorization endpoint, token endpoint, redirection endpoint (RFC 6749).
- Grants: `authorization_code`, `client_credentials`, `refresh_token`; implicit and resource
  owner password are legacy.
- Token response: `access_token`, `token_type`, `expires_in`, `refresh_token`, `scope`.
- Errors: `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`,
  `unsupported_grant_type`, `invalid_scope`, `access_denied`; RFC 8707 adds `invalid_target`.
- Scope syntax (RFC 6749 section 3.3): space-delimited, case-sensitive list;
  `scope-token = 1*( %x21 / %x23-5B / %x5D-7E )` (printable ASCII minus space, `"`, `\`).
  Order is not significant. The AS may grant less than requested and must then return `scope`.
- RFC 8707: `resource` parameter (absolute URI, no fragment), may repeat, on authorization and
  token requests; AS restricts token audience accordingly.
- RFC 9207: `iss` response parameter; AS metadata `authorization_response_iss_parameter_supported`.
- RFC 9700 key rules: public clients MUST use PKCE; resource owner password credentials grant
  MUST NOT be used; implicit grant SHOULD NOT be used; exact redirect URI matching; refresh
  tokens for public clients sender-constrained or rotated; restrict token privileges
  (audience, scope); use `iss` (RFC 9207) against mix-up attacks.

## Extension points

- IANA registries: OAuth Parameters, Authorization Server Metadata (RFC 8414), Token Types,
  Extensions Error codes. New grant types by absolute URI.
- Scope values are deployment-defined strings.

## Where HCS references it instead of redefining

- HCS-0005 authority: HCS grants are host-internal and not OAuth scopes. A distribution MAY map
  HCS capability grants to OAuth scopes when a plugin calls a remote RS; HCS MUST NOT define
  scope strings or token formats. [I]
- TOOLS-1: remote MCP authorization follows the pinned MCP revision's auth profile (which uses
  RFC 8707 and RFC 9207); HCS points to it and does not restate flows.
- If HCS ever serializes a grant set as a string, reusing the `scope-token` grammar keeps it
  OAuth-compatible. [I]
- HCS-0006: OAuth error codes are not HCS error codes; adapters map, for example,
  `invalid_scope`/`access_denied` to `permission_denied`. [I]

## Pitfalls for HCS

- Do not equate "plugin requests vs host grants" with OAuth consent; the host is not an AS.
- Do not cite OAuth 2.1 as a standard: it is a draft (revision -17).
- Scope strings are opaque and case-sensitive; no hierarchy or wildcards in the RFC.
- Audience restriction needs RFC 8707 or AS policy; bare scopes do not bind a token to a server.

## Sources

- https://www.rfc-editor.org/rfc/rfc6749 (and `.json` metadata: updated by RFC 8252, 8996, 9700)
- https://www.rfc-editor.org/rfc/rfc9700
- https://www.rfc-editor.org/rfc/rfc8707
- https://www.rfc-editor.org/rfc/rfc9207
- https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/
