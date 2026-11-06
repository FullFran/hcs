# BCP 14 (RFC 2119 + RFC 8174)

| Field | Value |
| --- | --- |
| Owner | IETF |
| Version pinned | BCP 14 = RFC 2119 (March 1997, S. Bradner) + RFC 8174 (May 2017, B. Leiba; updates RFC 2119) |
| Source pinned | https://www.rfc-editor.org/rfc/rfc2119 and https://www.rfc-editor.org/rfc/rfc8174 (RFCs are immutable; document dates above) |
| Access date | 2026-11-06 |
| License | IETF Trust legal provisions for RFCs [U: TLP version not checked in this pass] |
| Maturity | Best Current Practice |
| HCS action | adopt (HCS-0000 conventions; applies to every `spec/HCS-NNNN-*.md` and every profile) |

## What it defines

A fixed set of requirement keywords and their meaning in specifications. RFC 2119 defines the
keywords; RFC 8174 clarifies that they carry that meaning only in uppercase.

## Key objects and fields

- Absolute requirement: `MUST`, `REQUIRED`, `SHALL`.
- Absolute prohibition: `MUST NOT`, `SHALL NOT`.
- Strong recommendation, deviations need weighed reasons: `SHOULD`, `RECOMMENDED`; and
  `SHOULD NOT`, `NOT RECOMMENDED`.
- Truly optional: `MAY`, `OPTIONAL`; implementations with and without the item must still
  interoperate (possibly with reduced function).
- Uppercase rule (RFC 8174): the keywords have their BCP 14 meaning only when written in all
  capitals; lowercase "must", "should" are ordinary English. Normative text does not need the
  keywords to be normative.
- RFC 2119 section 6: use imperatives sparingly, only for interoperability or to limit harmful
  behaviour, never to force an implementation method.
- RFC 2119 section 7: authors should explain security implications of not following a
  MUST/SHOULD.

### Boilerplate HCS must include

Every normative HCS document includes, verbatim, the RFC 8174 sentence:

> The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
> "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be
> interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in
> all capitals, as shown here.

## Extension points

None. BCP 14 is a closed keyword set. Specifications may add their own conventions on top
(requirement IDs, conditional requirements) but must not redefine the keywords.

## Where HCS references it instead of redefining

- HCS-0000 conventions cites BCP 14 and includes the boilerplate; HCS MUST NOT define its own
  requirement-level vocabulary or change keyword meaning.
- HCS-0000 requirement IDs (see `openfeature.md` for the process model) record the keyword of
  each requirement, so the conformance runner can treat MUST/MUST NOT as failing cases and
  SHOULD as warnings.
- HCS-0001..HCS-0006 and the profiles CORE-0, TOOLS-1, AGENT-1, ISOLATION-1, DISTRO-1 inherit
  the convention from HCS-0000; they do not repeat the definitions.
- README rule 3 ("every MUST gets a case in `conformance/`") is an HCS rule layered on BCP 14,
  not part of it.

## Pitfalls for HCS

- Lowercase "must" in normative prose is not a requirement; either uppercase it or reword.
  A lint over `spec/` for lowercase keywords in normative sections is cheap.
- Do not use `SHALL` and `MUST` interchangeably in one document; pick `MUST` for consistency.
- `MAY` creates an interoperability obligation on the other side (it must cope with absence).
  Each HCS `MAY` needs a conformance case for both branches.
- Requirements inside examples or notes are ambiguous; mark examples as non-normative.
- Citing only RFC 2119 omits the uppercase clarification; always cite both.

## Sources

- https://www.rfc-editor.org/rfc/rfc2119
- https://www.rfc-editor.org/rfc/rfc8174
