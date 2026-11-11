# ADR-0032: Number spelling is judged by token; a repeated signature keyid invalidates the document

**Status:** Proposed

## Context

A second, independent implementation of HCS-0007 (issue 79) reported points the draft left open:

- R004 limited numbers to integers but did not say whether `1.0`, `1e2` or `-0` count. The implementation chose the value reading and accepted exactly integral spellings. Its first version decided integrality after converting to a double and wrongly accepted `1.0000000000000000001` and `1e-400`; it now decides from the token.
- `signatures` could repeat a `keyid`. With "try the first signature of each keyid" the order of the list decided validity: `[invalid, valid]` was refused and `[valid, invalid]` was accepted.
- The number of keys and signatures was unbounded; the second implementation saw a naive verifier spend seconds on a key set with tens of thousands of invalid signatures for one keyid.
- A key set with another `hcsVersion` was reported as `manifest_invalid` by one implementation and as `unsupported_hcs_version` for envelopes.
- Nothing said whether a host must refuse an Ed25519 public key of small order.

## Decision

1. **Spelling.** In a received envelope or key set, a number token MUST match `-?(0|[1-9][0-9]*)`, with a value within the I-JSON safe range, and `-0` is refused. Anything else is `manifest_invalid` citing HCS-0007-R004, whatever its value: `1.0`, `1e2`, `100e-2` and `-0` are all refused. The rule applies to the text as received, before a parse that loses the spelling.
2. **Version before shape for a key set.** A key set with an unsupported `hcsVersion` is `unsupported_hcs_version`, as an envelope and a catalog are, and the check comes before the shape check (R002).
3. **One item per keyid.** Two items of `signatures` with the same `keyid` make the document `manifest_invalid`, reported before any signature is verified (R022). Validity does not depend on the order of the list.
4. **Bounds.** A host MAY bound the number of keys and of signatures. A host that does MUST report `manifest_invalid` for a document that exceeds a bound, before any signature is verified (R023). HCS states no number.
5. **Order inside step 1.** Version, shape, repeated keyid, bounds; all before step 2.
6. **Small-order public keys** are recorded as an open question (OQ-0007-7), not as a requirement.
7. **Conformance.** A case may carry the exact bytes of the document in `documentBase64` (conformance/README.md) so a runner can exercise spelling, duplicated member names and unpaired surrogates. No error code is added.

## Reasons

- A signer that follows section 4 never writes those spellings, so refusing them costs no honest publisher anything.
- Issue 79 reports that the value reading produced a real bug (the two wrongly accepted values above). A token rule needs no arithmetic and no floating point, so two hosts cannot disagree about a number that one of them rounds.
- The signature covers the canonical form. Accepting `1.0` means two different texts verify against one signature; refusing them keeps one text per signed document.
- A repeated `keyid` has no honest reason. TUF 1.0.37, in the Document formats chapter (Object format), says the `keyid` MUST be unique in the `signatures` array and that multiple signatures with the same keyid are not allowed, and its client workflow says a client must not count more than one signature from a keyid towards a threshold. TUF therefore forbids the repetition in the format and protects the threshold in the client; HCS goes one step further and refuses the document, so that no host has to choose which item to ignore (the choice that made validity depend on order).
- One rule for every HCS document: the version check precedes the shape check for envelopes, catalogs and key sets alike.
- One implementation's cap (1024) is not enough evidence for a number; a bound is a deployment decision, and the requirement is only about where it is reported (before the cost of verification) and as which error.
- The behavior of small-order keys depends on how a deployment issues keys, and one implementation does not refuse them; a requirement needs a second data point.

## Consequences

- A document that was valid under the value reading (`1.0` in an extension member) becomes invalid. This is a draft contract change under the existing `0.1` identifier; a publisher that wrote such a spelling must sign and publish again.
- A host that receives a parsed document from a parser that keeps no spelling cannot apply R004; the rule is about the received text.
- A signer that wrote a repeated `keyid` must publish again.
- `[valid, invalid]` for one `keyid`, accepted by the second implementation, is now refused; that implementation said it would follow a decision either way.
- The reference runner and the SDK reuse their one strict parser; neither gains a second one.

## Alternatives rejected

- Value reading (accept exactly integral spellings): two hosts can disagree on rounding, and a signature then covers more than one text.
- Ignore later signatures of a keyid: validity depends on order.
- Count a keyid once and tolerate the rest: the document is still ambiguous.
- Fix a number for the bounds: no evidence beyond one implementation.
- Require refusing small-order keys now: no second data point.

## Open

OQ-0007-7 (small-order Ed25519 public keys). Whether the number spelling should move after the version check, so that a future version may define its own number rules, is not decided here: the reference reads the text first, and that is stricter than needed only for a version no host supports.
