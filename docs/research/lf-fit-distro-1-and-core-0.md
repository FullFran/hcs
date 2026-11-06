# Linux Foundation fit: DISTRO-1 and the CORE-0 open questions

**Status:** research note, not normative. Access date for all sources: 2026-11-06.
**Labels:** [F] verified fact with a primary source; [I] inference by the author of this note; [U] could not be verified.

## Purpose

HagaHarness, the first consumer, has answered several HCS open questions in running code (issue #2) and ships a signed catalog envelope (issue #5). Before any of that becomes normative text, this note asks of each proposed change: would a project hosted by the Linux Foundation (LF), the Joint Development Foundation (JDF), the CNCF or the OpenSSF accept it in this form? The verdicts below decided what the pull request that adds this note contains.

## 1. The lens

The criteria come from [how-standards-are-built.md](how-standards-are-built.md) and the primary sources below.

| Criterion | What it means here | Sources |
| --- | --- | --- |
| Vendor neutrality | Nothing specific to one distribution in normative core; distribution detail under `x-<distribution>` (README rule 4). | README rule 4; HCS-0000 section 7 [I] |
| Reuse over invention | Profile an existing standard when it covers the need; when HCS adds something, say exactly what and why (README rule 6). | TUF 1.0.37, DSSE v1, RFC 8785, RFC 8032 ([docs/standards/](../standards/)) |
| Need-driven scope | A requirement enters only when a real harness needs it (README rule 1). One host counts as the trigger; it does not make a design general. | README |
| Conformance before claims | Every MUST has a satisfying and a violating case (HCS-0000-R001). | ADR-0001 |
| Two implementations | Nothing is called a standard until two independent hosts pass the same profile (README rule 3). OpenSSF Graduated requires mature release practice such as semantic versioning [F] ([ossf-lifecycle]). | README, [ossf-lifecycle] |
| IP hygiene | Apache-2.0 for code, DCO sign-off for inbound contributions, a specification licence decision, clean provenance (README rule 5). | CNCF charter: inbound code contributions carry a DCO sign-off and are made under Apache-2.0; new specifications not tied to one piece of software use the Community Specification License or a JDF template [F] ([cncf-charter]). OCI charter: contributions accompanied by a DCO sign-off [F] ([oci-charter]). |
| Stability and versioning | Draft until released; released documents immutable; contract versions in `hcsVersion` and schema `$id` (HCS-0000 sections 4 to 6). | HCS-0000 |

## 2. Verdicts

| # | Change proposed | Verdict | What changed versus the host's behaviour |
| --- | --- | --- | --- |
| 1 | OQ-0001-1: `mediaType` required on every entry; package archive format | **Fits with changes** | The core names one format, the OCI layer media type `application/vnd.oci.image.layer.v1.tar+gzip`, which every host MUST implement. The host's own `application/vnd.<distribution>.package.v1.tar+gzip` stays a distribution type a host MAY add. An unknown media type yields `unsupported_contribution`, not `unsupported_capability` (that code means "call to a capability that is not active", HCS-0004-R005). Deterministic archives are a SHOULD for producers. Archive member safety rules are left open (OQ-0001-6). |
| 2 | OQ-0001-3: host or runtime version compatibility | **Fits with changes** | A neutral core member `compatibility.hosts` (host id plus an exact list of opaque versions) replaces the host's extension member. Exact lists only, because versions are opaque ([ADR-0004](../adr/0004-opaque-package-versions.md)). Mismatch keeps the host's `version_incompatible`. |
| 3 | OQ-0001-4 (monotonic catalog version) and OQ-0001-5 (canonical JSON) | **Fits** | Moved to HCS-0007 as the envelope `sequence` and the canonical signature input. The catalog `version` stays opaque, as issue #2 asked. |
| 4 | OQ-0003-3: partial versus all-or-nothing activation | **Fits with changes** | Not one rule for every host: the activation policy is host-declared (`all-or-nothing` or `partial`), executable in resolution cases. DISTRO-1 requires `all-or-nothing`, because the signed set is the unit the distributor vouched for. |
| 5 | Document size and nesting limits before validation | **Fits with changes** | A SHOULD with host-declared limits and a floor (4 MiB, 64 levels) that producers can rely on. The host's exact values are the floor, not a cap. |
| 6 | Mandatory entries that policy cannot remove (issue #2) | **Does not fit core; dropped** | A product policy. It stays an extension member; HCS-0000-R004 already guarantees it cannot change a validity verdict. |
| 7 | DISTRO-1 envelope as shipped (sequence, expiry, binding, signatures, offline root, key set) | **Fits with changes** | Written as HCS-0007, a TUF-derived profile with an explicit property mapping (section 3), not a new framework. Changes: the private context string is replaced by the DSSE v1 pre-authentication encoding with two HCS payload types; `tenant`, `profile` and `channel` become a neutral `binding` map compared for exact equality; the catalog threshold is signed in the key set (TUF puts thresholds in signed root metadata) instead of local configuration; numbers are restricted to safe integers so RFC 8785 needs no floating-point serialisation; HCS-0007 does not claim TUF conformance. |
| 8 | Generations with an atomic active pointer and post-start health check | **Fits with changes** | Stated as observable behaviour (content of an active entry never modified in place; a failed health check is a failed transition under HCS-0004-R003), not as a mechanism. Generation directories and pointers are implementation detail. |
| 9 | Serving endpoint holds no private key; offline root | **Fits** as SHOULD | Deployment properties a host cannot test; SHOULD for distributions, no cases. |
| 10 | Provenance: SLSA v1 in an in-toto v1 Statement in a DSSE envelope | **Fits** as SHOULD | Pure reuse. HCS-0007 references the predicate and Statement types and restates nothing. |
| 11 | Reports: observed state as CloudEvents 1.0.2, errors as RFC 9457 | **Fits** as SHOULD | No event type names are minted (OQ-0004-3 stays open); RFC 9457 carriage is already HCS-0006-R004/R005. |
| 12 | Error codes `x-<distribution>-signature_invalid`, `x-<distribution>-rollback_rejected`, `x-<distribution>-intervention_needed` | **Fits with changes** | `signature_invalid` and `rollback_rejected` enter the single HCS-0006 registry, marked "defined by HCS-0007", instead of a profile-local code list. `intervention_needed` is not promoted (section 4). |
| 13 | DCO or CLA note in CONTRIBUTING | **Fits** | `CONTRIBUTING.md` added: Apache-2.0, DCO sign-off for external contributions, clean provenance, the requirement workflow. The specification licence stays OQ-0000-1. |
| 14 | Issue #4 (adapter against HagaHarness) | **Does not fit now; not done** | It would make HCS depend on private code whose licensing for this use is not settled. |
| 15 | Issue #3 (new contribution kinds) | **Does not fit now; not done** | One harness only; rule 1 waits for a second. HCS-0007 does not touch contribution kinds. |

## 3. DISTRO-1 against TUF: what HCS adds and why

TUF ([tuf.md](../standards/tuf.md)) already defines signed, versioned, expiring metadata, thresholds, root-signed key rotation and offline root keys. A neutral reviewer will ask why HCS-0007 exists at all. The honest answer is in this table.

| Property | TUF 1.0.37 | HCS-0007 | Why HCS differs |
| --- | --- | --- | --- |
| Signature wrapper | `signed` plus `signatures[{keyid, sig}]` over OLPC canonical JSON | document plus `signatures[{keyid, sig}]` over DSSE PAE of RFC 8785 bytes | Same signature list. RFC 8785 is an IETF RFC; OLPC canonical JSON is not [I]. PAE gives domain separation between envelope and key set signatures. |
| Rollback | `version` integer, clients MUST NOT accept lower | `sequence` integer; lower, or equal with different content, rejected | Same property. Named `sequence` because the catalog already has an opaque `version`. |
| Freeze | `expires` on every role, short-lived `timestamp` role | `expires` on the envelope only | No timestamp role: the envelope is the only metadata file, so its own expiry carries freshness. Expiry must be short; HCS-0007 recommends nothing yet (OQ-0007-2). |
| Mix-and-match | `snapshot` role binds metadata versions | not applicable | The whole desired set is one signed document; there is nothing to mix. |
| Key rotation | root signs new `root.json`; delegations | root signs a new key set; online keys have validity windows | Same pattern, one level of delegation only. |
| Threshold | per role in root metadata | key set `threshold`, counted over distinct key material | TUF requires unique keyids; HCS-0007 counts public keys so one key listed twice never counts twice. |
| Audience | none; every client of a repository sees the same metadata | `binding` map must equal the host's assignment | Not in TUF. Uptane's Director binds metadata to one vehicle [F] ([uptane.md](../standards/uptane.md)); HCS-0007 binds it to a host assignment. |
| Targets | `length` plus `hashes` per target, `custom` for application data | the HCS-0001 catalog (`size`, `contentHash`, contributions) | HCS-0001 carries what TUF puts in `custom` as first-class, validated members. |

Conclusion [I]: HCS-0007 adds the audience binding and a single-document deployment of TUF properties sized for a desired-state catalog. That is a profile, not a framework. The quarterly kill review (README rule 6) should ask whether a TUF POUF that carries the catalog as a target with `custom` data would serve the same hosts; OQ-0007-1 records that question.

## 4. The error-code question

The host emits three codes as `x-<distribution>-<code>` in `code`, which HCS-0006-R002 forbids. Fran's leaning was to promote all three into DISTRO-1 as profile codes.

- **One registry, not one per profile.** HCS-0006 already lists, per code, the document that defines it. That is how IANA registries for RFC 9457 problem types work: one registry, each entry pointing at its defining specification [F] ([rfc9457]). A profile-local list would make a code meaningful only if the consumer knows which profile the host claims, which defeats "consumers branch on `code`". So `signature_invalid` and `rollback_rejected` enter HCS-0006, defined by HCS-0007. A host that does not implement DISTRO-1 never raises them.
- **`x-` codes stay forbidden.** Allowing extension names in `code` (as for contribution kinds) was considered and rejected: a consumer cannot branch on a code it does not know, while a host can always ignore a contribution kind it does not know. Distribution detail keeps going in `details` ([ADR-0006](../adr/0006-error-codes-ride-in-data.md)).
- **`intervention_needed` is not promoted.** It reports that someone changed installed content locally and the host chose to touch nothing. Detecting out-of-band change is plausible for every desired-state host, but "touch nothing" is product policy, and no HCS document defines the condition. With one host and no defining requirement it fails the need-driven and two-implementations tests. It becomes OQ-0004-6. Until then the host reports it outside an HCS error object, for example as an RFC 9457 problem type URI owned by the distribution; HCS-0006 now says so in prose.
- **Expiry and binding keep the host's codes.** Expiry is `signature_invalid` (as in X.509 path validation, a signature outside its validity period does not verify [I]); binding mismatch is `permission_denied` (the host's assignment is an authority decision, HCS-0005). The HCS-0006 table records both uses.

## 5. Two implementations and stability

- Everything added is `Draft`. CORE-0 gains the new HCS-0001 and HCS-0003 requirements; DISTRO-1 is a separate profile file and is not part of CORE-0.
- HCS-0007 has one implementation that differs from it in the points listed in row 7 of section 2, and none that conforms. The host has to change its signature input and binding shape to conform; the reference runner is not a host.
- The DISTRO-1 document-level cases (shape, canonical bytes, signatures, expiry, sequence, binding) run in the reference runner today with fixture keys generated for the tests; the host-level cases (generations, health check, activation policy) are `pending`.

## 6. IP hygiene

- Licence: Apache-2.0 for the repository [F] (`LICENSE`). The CNCF charter would point a new specification to the Community Specification License or a JDF template [F] ([cncf-charter]); TUF and SLSA use the Community Specification License 1.0 [F] ([tuf.md](../standards/tuf.md), [slsa.md](../standards/slsa.md)). Moving the specification text is a decision for whoever would host HCS; OQ-0000-1 stays open.
- Inbound contributions: CNCF and OCI both require a DCO sign-off on code contributions [F] ([cncf-charter], [oci-charter]). `CONTRIBUTING.md` adopts the DCO for external contributions.
- Provenance: the host's behaviour is described in HCS's own normative words. No host code, file names, endpoints, customer names or internal identifiers appear in this pull request; the only name used is "HagaHarness, the first consumer". The Ed25519 and RFC 8785 code in the reference runner is written from RFC 8032 and RFC 8785, not copied.

## 7. Sources

- [cncf-charter]: https://github.com/cncf/foundation/blob/main/charter.md (read 2026-11-06)
- [oci-charter]: https://github.com/opencontainers/tob/blob/main/CHARTER.md (read 2026-11-06)
- [ossf-lifecycle]: https://github.com/ossf/tac/blob/main/process/project-lifecycle.md (read 2026-11-06)
- [dsse]: https://github.com/secure-systems-lab/dsse/blob/v1.0.2/protocol.md (tag v1.0.2, `440901313676fedd0e31f16125c302b0df81e006`; Apache-2.0; read 2026-11-06)
- [rfc8785]: https://www.rfc-editor.org/rfc/rfc8785 (JSON Canonicalization Scheme)
- [rfc8032]: https://www.rfc-editor.org/rfc/rfc8032 (Ed25519)
- [rfc3339]: https://www.rfc-editor.org/rfc/rfc3339
- [rfc9457]: https://www.rfc-editor.org/rfc/rfc9457
- [oci-layer]: https://github.com/opencontainers/image-spec/blob/v1.1.1/layer.md (read 2026-11-06)
- TUF, in-toto, Sigstore, SLSA, Uptane, CloudEvents: pinned notes in [docs/standards/](../standards/).

[cncf-charter]: https://github.com/cncf/foundation/blob/main/charter.md
[oci-charter]: https://github.com/opencontainers/tob/blob/main/CHARTER.md
[ossf-lifecycle]: https://github.com/ossf/tac/blob/main/process/project-lifecycle.md
[rfc9457]: https://www.rfc-editor.org/rfc/rfc9457
