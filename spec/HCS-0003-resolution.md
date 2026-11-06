# HCS-0003 Resolution

| Field | Value |
| --- | --- |
| Status | Draft |
| Version | 0.1.0-draft |
| Requires | HCS-0001, HCS-0002, HCS-0006 |
| Replaces | none |
| Schema | `schemas/hcs-0003/resolution/v0.1/resolution.schema.json` (`urn:hcs:schema:hcs-0003:resolution:0.1`) |

## 1. Scope

Resolution turns a validated catalog manifest and a description of the host into an activation order and a list of typed errors, before any package code runs. Cordis resolves dependencies at runtime by service key; OpenClaw validates manifests without executing code ([standards-catalog.md](../docs/research/standards-catalog.md) section 2, precedents). HCS makes the declarative, pre-execution version deterministic so two hosts given the same input produce the same output.

## 2. Inputs and output

Input (`resolutionInput` in the schema):

- `catalog`: an HCS-0001 catalog manifest that already passed document validation.
- `host.platform`: the host's OCI platform object.
- `host.contributionKinds`: the contribution kinds the host implements.
- `host.builtins`: capability references the host provides itself.

Output (`resolutionResult`):

- `activationOrder`: ids of the entries that resolved, in the order they are to be activated.
- `errors`: HCS-0006 error objects, each with `entry` and, where relevant, `capability`.

## 3. Algorithm

1. **Eligibility.** An entry is ineligible if it has a contribution kind not in `host.contributionKinds` (`unsupported_contribution`, HCS-0001-R008) or a platform list with no match (`platform_incompatible`, HCS-0001-R009).
2. **Providers.** Each eligible entry provides the union of its contributions' `provides`. The host provides `host.builtins`.
3. **Matching.** For each eligible entry and each reference in its `requires`, the candidate providers are the host and the other eligible entries that provide that exact reference. An entry never satisfies its own requirement.
4. **Propagation.** An entry with an unsatisfied requirement fails. Repeat step 2 to 4 without failed entries until nothing changes.
5. **Ordering.** Build edges from each remaining entry to the entries that provide its requirements. Entries on a cycle fail. The remaining entries are ordered topologically, with ties broken by ascending entry id.

## 4. Requirements

**[HCS-0003-R001]** A host MUST resolve a catalog without executing code from any package.

**[HCS-0003-R002]** A host MUST report `missing_dependency` for an entry when no other eligible entry and no host built-in provides a capability id it requires.

**[HCS-0003-R003]** A host MUST report `version_incompatible`, not `missing_dependency`, when the required capability id is provided only at other majors.

**[HCS-0003-R004]** A host MUST report `ambiguous_provider` when more than one provider matches a required reference, and MUST NOT choose one of them implicitly.

**[HCS-0003-R005]** A host MUST fail an entry whose requirement was satisfiable only by entries that themselves failed, reporting `missing_dependency` for it.

**[HCS-0003-R006]** A host MUST report `dependency_cycle` for every entry whose requirements form a cycle, and MUST NOT activate any of them.

**[HCS-0003-R007]** A host MUST place every entry after all the entries that provide its requirements in the activation order, and MUST break ties by ascending entry id compared as byte strings.

Whether a host activates the entries that resolved when other entries failed, or rejects the whole catalog, is host policy (OQ-0003-3). Resolution only reports.

## 5. Open questions

- OQ-0003-1: explicit provider selection (an entry or the distribution pins which package satisfies a reference). Needed as soon as two packages provide the same contract; until then `ambiguous_provider` is the safe answer.
- OQ-0003-2: optional requirements (use the capability if present).
- OQ-0003-3: partial activation versus all-or-nothing when some entries fail. HagaHarness desired-state updates may want all-or-nothing; a developer host may want partial.
- OQ-0003-4: whether a host built-in and a package providing the same reference should be ambiguous (current rule) or the package should override.
- OQ-0003-5: package-level conflicts (two packages that must not coexist), as in exclusive slots in OpenClaw.
