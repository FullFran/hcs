# JSON Web Token (JWT, RFC 7519)

| Field | Value |
| --- | --- |
| Owner | IETF (OAuth WG; JOSE family) |
| Version pinned | RFC 7519 (May 2015); updated by RFC 7797 and RFC 8725 (JWT BCP) per RFC Editor metadata |
| Source pinned | https://www.rfc-editor.org/rfc/rfc7519.txt (immutable RFC) |
| Access date | 2026-11-06 |
| License | IETF Trust Legal Provisions for RFCs [U: TLP version not checked] |
| Maturity | Proposed Standard |
| HCS action | out of core; appears only inside other standards' tokens (OIDC ID Tokens, JWT-SVID, OAuth access tokens) |

## What it defines

A compact, URL-safe format for a set of claims (a JSON object) carried as a JWS (signed) or
JWE (encrypted) payload, plus registered claim names and validation rules.

## Key objects and fields

- JOSE header: `typ` (e.g. `JWT`), `cty`; algorithm and key fields come from JWS/JWE
  (RFC 7515/7516).
- Registered claims (section 4.1): `iss` (issuer), `sub` (subject), `aud` (audience, string or
  array), `exp` (expiration, NumericDate), `nbf` (not before), `iat` (issued at), `jti` (JWT ID).
  All are optional at RFC level; profiles make them required.
- NumericDate: seconds since the epoch, may be non-integer.
- Claim name classes: registered, public (IANA-registered or collision-resistant), private.
- Unsecured JWT: `alg` `none` (allowed by the RFC, dangerous in practice).

## Extension points

- IANA "JSON Web Token Claims" registry for public claims.
- Collision-resistant names (e.g. URIs) for unregistered public claims; private claims by
  agreement between parties.

## Where HCS references it instead of redefining

- HCS does not define a token. If a profile needs a signed grant or attestation, it SHOULD
  reuse JWT registered claims (`iss`, `sub`, `aud`, `exp`, `iat`, `jti`) rather than invent
  equivalents, and MUST follow RFC 8725 practices. [I]
- HCS-0005: a host MAY accept JWT-based credentials from a distribution (OIDC, JWT-SVID); HCS
  only consumes the validated subject, never the raw token format. [I]

## Pitfalls for HCS

- RFC 7519 alone is not a safe profile; RFC 8725 (BCP 225 [U: BCP number not checked]) covers
  algorithm confusion, `none`, and audience checks.
- `aud` can be a string or an array; validators must handle both.
- JWTs are bearer by default; replay protection needs `jti`, short `exp`, or sender constraint.

## Sources

- https://www.rfc-editor.org/rfc/rfc7519
- https://www.rfc-editor.org/rfc/rfc7519.json
- https://www.iana.org/assignments/jwt/jwt.xhtml [U: registry contents not checked in this pass]
