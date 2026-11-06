# OpenID Connect Core 1.0

| Field | Value |
| --- | --- |
| Owner | OpenID Foundation (OIDF), Connect Working Group |
| Version pinned | OpenID Connect Core 1.0 incorporating errata set 2 (2023-12-15) |
| Source pinned | https://openid.net/specs/openid-connect-core-1_0.html (title "Final: OpenID Connect Core 1.0 incorporating errata set 2", dated December 15, 2023) |
| Access date | 2026-11-06 |
| License | OIDF copyright license in the spec's Notices: royalty-free, worldwide license to reproduce and derive works for developing specifications and implementing them, with attribution to the OIDF; plus OIDF IPR policy |
| Maturity | Final Specification; also published as ISO/IEC 26131:2024 (listed on openid.net/developers/specs) |
| HCS action | out (user authentication belongs to the distribution) |

## What it defines

An identity layer on top of OAuth 2.0: the client (Relying Party, RP) receives an ID Token
(a JWT) from the OpenID Provider (OP) asserting the end-user's authentication, plus a
UserInfo endpoint for claims.

## Key objects and fields

- Request: `scope` containing `openid`; `response_type` (`code`, `id_token`, combinations);
  `nonce`, `prompt`, `max_age`, `acr_values`, `claims` request parameter.
- ID Token claims: `iss`, `sub`, `aud`, `exp`, `iat`, `auth_time`, `nonce`, `acr`, `amr`,
  `azp`. `iss` + `sub` together identify the user.
- Standard scopes for claims: `profile`, `email`, `address`, `phone`.
- UserInfo endpoint returning standard claims (`name`, `email`, `email_verified`, ...).
- Flows: Authorization Code, Implicit, Hybrid.

## Extension points

- Additional claims (collision-resistant or private names), `claims` parameter.
- Companion specs: Discovery, Dynamic Client Registration, Session/Logout [U: companion spec
  versions not checked in this pass].

## Where HCS references it instead of redefining

- HCS-0005 authority: the grant "subject" MAY be an OIDC-authenticated user; the distribution
  supplies a stable subject identifier (for example `iss` + `sub`). HCS MUST NOT define login,
  ID Token validation, or user claims. [I]
- DISTRO-1: Sigstore keyless signing relies on OIDC identity tokens; HCS points to Sigstore
  verification (certificate identity + OIDC issuer), not to OIDC directly. [I]

## Pitfalls for HCS

- `sub` is only unique per issuer; never key subjects on `sub` alone.
- OIDC authenticates users; it says nothing about plugin or workload identity (see SPIFFE).
- ID Tokens are not access tokens; do not let plugins use them to call APIs.
- Errata set 2 is the current text; older copies (errata set 1) differ in details.

## Sources

- https://openid.net/specs/openid-connect-core-1_0.html
- https://openid.net/developers/specs/
