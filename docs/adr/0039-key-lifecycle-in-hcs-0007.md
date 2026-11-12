# ADR-0039: Root replacement and key revocation in HCS-0007

**Status:** Proposed

## Context

HCS-0007 says the trust anchor is received at enrollment and puts enrollment out of scope (section 1). R011 checks that a key set carries the anchor's threshold of root signatures, and section 3.2 says online keys rotate when the root signs a key set with a higher `version`. Nothing says how a distribution replaces a root key, how it revokes an online key, what a host does with signatures it cannot count, or whether a document can change the anchor.

The first harness that ships HCS-0007-style distribution to customers had to answer all four while preparing its first release, in its own code and documentation.

## Evidence

- A desktop assistant (HagaHarness, private) compiles its root set into the application. A root key carried in its distribution configuration is a cache and is never used to verify. Changing the roots takes a new application version through its signed updater.
- The same harness replaces a root in two steps: the next key set is signed by the old and the new root, and only later by the new root alone. Its signing tool refuses to sign with fewer roots than the previous version unless the operator passes an explicit flag. A device without the new root refuses the later key set and keeps the key set it already accepted; it must be enrolled again to follow further changes.
- On an online key leak it publishes a key set with a higher version without the leaked key and re-publishes every channel. It has no revocation list.
- Its tests replace the compiled root set through a local variable that a server cannot set, and use a static keyring of test keys.
- The HCS reference implementations (Python `conformance/runner/distro1.py`, TypeScript `sdk/ts/src/signing/verify.ts`) already count only valid signatures by known keys and ignore the rest, so a key set signed by an old and a new root verifies on a host that holds either. No case pinned it.
- TUF (specification, "Update the root role" in the client workflow, read 2026-11-12) replaces a root with a chain of root documents: version N+1 must be signed by a threshold of the keys of version N and a threshold of the keys of version N+1. Each key contributes one signature; signatures by other keys do not count.

## Decision

1. **Signatures a host cannot count are ignored, not refused (R024, MUST).** A signature by an unknown key, one that does not verify, and one by a key outside its window do not count and do not make the document invalid. This is what makes overlap signing work; R022 and R023 still refuse repeated `keyid`s and oversized lists first. Cases pin the behavior the reference already has.
2. **The anchor never comes from a document (R025, MUST).** A host verifies every key set against the anchor it already holds. A case shows a key set whose extension names its own signer as root: it is refused.
3. **A refused key set changes nothing (R026, MUST).** R015 said this for envelopes only; R026 states it for key sets, so a host that refuses a key set keeps verifying with the one it has. Host-level cases.
4. **Root replacement is overlap signing (R027, SHOULD) and revocation is omission (R028, SHOULD).** Both are distribution practices with no conformance case, like R019 to R021. Re-signing the current envelope needs no new `sequence`, because the content digest excludes `signatures`.
5. **Test roots stay out of production anchors (R029, SHOULD).** An input that a document, a package or the serving endpoint can set never replaces the anchor; conformance fixture roots never appear in a production anchor.
6. **No root document yet.** A TUF-style root chain would let a host reach a new anchor without enrollment. One harness, and no second one, has asked for it; it is OQ-0007-8.

## Consequences

- Before this change no rule or case said whether a host may refuse a document for carrying an unknown signer; R024 says it may not. The two reference implementations pass the new cases unchanged.
- A host that misses the overlap window must be enrolled again. That is the cost of having no root document, and it is stated in section 5.3.1.
- Revoking a key does not say what happens to a desired set already running from an envelope that key signed; OQ-0007-9.
- Keys limited to one tenant, which the same harness uses, stay out (OQ-0007-10) until a second harness needs them.
- `conformance/profiles/distro-1.json` gains R024 to R029. It did not list R022 and R023 before this change; that gap is left as it was.

## Alternatives rejected

- A TUF root chain now: more text, a new document type and new cases for a need one harness has met without it.
- A revocation list: TUF has none either; a higher key set version without the key already does the job, and a list would need its own freshness rules.
- Refusing documents with unknown signatures: it breaks overlap signing, and TUF does not do it.
- Scoping keys to a `binding` member now: one harness, README rule 1.
