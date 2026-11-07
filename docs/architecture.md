# HCS architecture

Non-normative overview of how the HCS documents fit together. When this page and
a document in `spec/` disagree, the document wins. Requirement ids (`HCS-NNNN-RNNN`)
point to the rule each diagram summarizes.

## 1. Roles

HCS has three roles. A **distribution** publishes what hosts should run. A
**host** decides what it accepts and runs it. An **engine** (an agent runtime
such as a coding agent CLI or an agent server) is started by the host and only
sees what the host projects into it.

```mermaid
flowchart LR
    subgraph Distribution
        root["Root keys<br/>(offline)"]
        online["Online keys"]
        endpoint["Envelope + key set endpoint"]
        store[("Package bytes<br/>(OCI layers)")]
        root -->|signs key set| online
        online -->|signs envelope| endpoint
    end

    subgraph Host
        verify["Verify<br/>HCS-0007"]
        resolve["Resolve<br/>HCS-0003"]
        authz["Authorize<br/>HCS-0005"]
        prepare["Fetch, verify, unpack<br/>HCS-0001"]
        gen[("Generation<br/>immutable")]
        adapter["Host adapter<br/>HCS-0008"]
        verify --> resolve --> authz --> prepare --> gen --> adapter
    end

    subgraph Engine["Engine run"]
        skills["Skills<br/>Agent Skills"]
        mcp["MCP servers<br/>server.json"]
    end

    endpoint -->|envelope + key set| verify
    store -->|bytes by contentHash| prepare
    adapter -->|projection| Engine
    Host -.->|"observed state<br/>CloudEvents + HCS-0004 status"| Distribution
```

The lifecycle (HCS-0004) runs through every host step, and the typed errors
(HCS-0006) are what each step reports when it fails.

## 2. Document map

Arrows read "requires". HCS-0000 (conventions) is required by everything and is
left out of the arrows.

```mermaid
flowchart BT
    H2["HCS-0002<br/>Capability ids"]
    H6["HCS-0006<br/>Typed errors"]
    H1["HCS-0001<br/>Catalog manifest"]
    H3["HCS-0003<br/>Resolution"]
    H5["HCS-0005<br/>Authority"]
    H4["HCS-0004<br/>Lifecycle"]
    H7["HCS-0007<br/>Signed catalog · DISTRO-1"]
    H8["HCS-0008<br/>Host adapter · Provisional"]

    H1 --> H2
    H1 --> H6
    H3 --> H1
    H3 --> H2
    H5 --> H1
    H4 --> H1
    H4 --> H3
    H4 --> H5
    H7 --> H1
    H7 --> H3
    H7 --> H4
    H8 --> H1
    H8 --> H3
    H8 --> H4
    H8 --> H5
```

| Layer | Documents | Question it answers |
| --- | --- | --- |
| Data | HCS-0001, HCS-0002, HCS-0006 | What a catalog, a capability id and an error look like |
| Decision | HCS-0003, HCS-0005 | Which entries can run, in which order, with which permissions |
| Execution | HCS-0004, HCS-0008 | How entries move between states and reach an engine |
| Distribution | HCS-0007 | Who published the catalog, whether it is current and for this host |

The profiles group requirements: **CORE-0** (documents, resolution, typed errors)
and **DISTRO-1** (HCS-0007, on top of CORE-0, with the `all-or-nothing` policy).

## 3. From envelope to confirmed generation

One update, end to end. Each step stops at its first failure and reports an
HCS-0006 error; the previously confirmed generation keeps running throughout.

```mermaid
sequenceDiagram
    autonumber
    participant D as Distribution
    participant H as Host
    participant A as Host adapter
    participant E as Engine run

    D->>H: key set + envelope
    H->>H: verify key set against trust anchor (R011-R014)
    H->>H: verify envelope in order (R001, R005-R008)
    H->>H: validate enclosed catalog (HCS-0001, R010)
    H->>H: record sequence + digest as accepted (R015)
    H->>H: resolve: eligibility, providers, order, selection (HCS-0003)
    H->>H: authorize: requests vs host grants (HCS-0005)
    H->>D: fetch package bytes
    D-->>H: bytes
    H->>H: check size + contentHash, unpack (HCS-0001-R007)
    Note over H: new generation prepared next to the old one,<br/>never modifying active content (HCS-0007-R017)
    H->>A: generation + host-owned settings + granted secrets
    A-->>H: projection + per-entry result (projected or error)
    H->>E: start a new engine run from the projection
    E-->>H: health, loaded skills and MCP servers
    alt healthy within deadline
        H->>H: confirm generation, report entries active (HCS-0008-R013)
    else failed or timed out
        H->>E: start a run from the confirmed generation (R015)
    end
```

## 4. Envelope verification (HCS-0007 section 5.2)

The order is part of the contract: a host reports only the first failing check
(R009), so two hosts give the same error for the same envelope.

```mermaid
flowchart TD
    start(["Envelope received"]) --> shape{"Version and shape<br/>R001"}
    shape -->|fail| e1["manifest_invalid /<br/>unsupported_hcs_version"]
    shape -->|ok| sig{"Threshold of valid signatures<br/>from accepted key set<br/>R005, R014"}
    sig -->|fail| e2["signature_invalid"]
    sig -->|ok| bind{"binding equals<br/>host assignment<br/>R006"}
    bind -->|fail| e3["permission_denied"]
    bind -->|ok| exp{"now < expires<br/>R007"}
    exp -->|fail| e4["signature_invalid"]
    exp -->|ok| seq{"sequence newer, or equal<br/>with same content<br/>R008"}
    seq -->|fail| e5["rollback_rejected"]
    seq -->|ok| cat{"Catalog valid<br/>HCS-0001, R010"}
    cat -->|fail| e6["HCS-0001 error"]
    cat -->|ok| ok(["Accepted: record sequence + digest<br/>R015"])
```

Trust anchor and assignment are host inputs received at enrollment; how a host
is enrolled is outside HCS today (issue #26).

## 5. Resolution (HCS-0003)

Resolution runs before any package code. It is a pure function of the catalog
and a description of the host, which is what makes it testable by data-only
conformance cases.

```mermaid
flowchart TD
    in["catalog + host:<br/>platform, contributionKinds, mediaTypes,<br/>builtins, activationPolicy"] --> s1
    s1["1 Eligibility<br/>media type, kinds, platform, host version"] --> s2
    s2["2 Providers<br/>union of contributions' provides + host builtins"] --> s3
    s3["3 Matching<br/>exact capability references"] --> s4
    s4{"4 Unsatisfied<br/>requirement?"}
    s4 -->|yes: fail entry, repeat 2-4| s2
    s4 -->|no| s5["5 Ordering<br/>topological, ties by entry id;<br/>cycles fail"]
    s5 --> s6{"6 Selection"}
    s6 -->|partial| sel1["selected = activation order"]
    s6 -->|all-or-nothing, no errors| sel1
    s6 -->|all-or-nothing, any error| sel2["select nothing;<br/>previous desired set stays"]
```

Output: `activationOrder`, `errors` (each with `entry` and, where relevant,
`capability`) and `selected`.

## 6. Entry lifecycle (HCS-0004)

```mermaid
stateDiagram-v2
    [*] --> discovered
    discovered --> validated: HCS-0001 checks
    validated --> resolved: HCS-0003
    resolved --> authorized: HCS-0005 grants
    authorized --> prepared: bytes verified + unpacked
    prepared --> active: contributions registered
    active --> draining
    draining --> stopped
    discovered --> failed
    validated --> failed
    resolved --> failed
    authorized --> failed
    prepared --> failed
    active --> failed
    draining --> failed
```

No package code runs before `active`. Moving from one desired set to the next is
one step: the new set is prepared separately and switched to atomically
(HCS-0004-R003, HCS-0007-R017).

## 7. Generations and projection (HCS-0008)

A **generation** is the prepared, unpacked content of the selected entries,
identified by an id and never modified. An engine run sees exactly one
generation, whole (R001, R002). The `active` pointer only chooses the generation
of the *next* run.

```mermaid
flowchart LR
    subgraph Host
        g1[("generation g41<br/>confirmed")]
        g2[("generation g42<br/>new")]
        ptr{{"active pointer"}}
        ptr -.->|next run| g2
    end
    r1["engine run #1<br/>projection → g41"] --> g1
    r2["engine run #2<br/>projection → g42"] --> g2
```

For each contribution of each entry, the adapter either projects it or reports
an error; nothing is dropped silently (R003).

```mermaid
flowchart TD
    c(["Contribution"]) --> k{"Kind projectable<br/>on this engine?"}
    k -->|no| u["unsupported_contribution<br/>entry inactive on this engine,<br/>transition continues (R004, R017)"]
    k -->|yes| n{"Engine-level name used by<br/>another contribution?"}
    n -->|yes| amb["ambiguous_provider<br/>for every entry involved (R006)"]
    n -->|no| own{"Replaces, removes or widens<br/>a host-owned setting?"}
    own -->|yes| pd["permission_denied (R007)"]
    own -->|no| kind{"Kind"}
    kind -->|skill| sk["place directory unchanged<br/>under its Agent Skills name (R008, R009)"]
    kind -->|mcp-server| ms{"server.json valid,<br/>no secret values,<br/>required secrets granted?"}
    ms -->|invalid / secret value| mi["manifest_invalid (R010, R011)"]
    ms -->|secret not granted| pd2["permission_denied (R012)"]
    ms -->|ok| mp["project; secrets only from host grants"]
    kind -->|extension kind| ext["distribution-defined<br/>(x-&lt;distribution&gt;-...)"]
```

A contribution with the same name as a **host-provided default** (for example a
bundled skill) replaces it; that is not a collision. A contribution may
**narrow** a host-owned setting, never widen it.

## 8. Confirm after health (HCS-0008 section 7)

Boot counting with one try: a new generation is unconfirmed until the running
engine proves it, a failed generation is not retried, and there is exactly one
rollback.

```mermaid
stateDiagram-v2
    [*] --> Starting: run from new generation
    Starting --> Confirmed: healthy within deadline (R013, R014)
    Starting --> RollingBack: unhealthy or deadline passed<br/>report plugin_failed / timeout (R015)
    RollingBack --> Confirmed_previous: previous generation healthy
    RollingBack --> Stopped: previous also fails (R016)
    Stopped --> [*]: wait for new desired set<br/>or operator action
    Confirmed --> [*]
    Confirmed_previous --> [*]
```

When the engine reports what it loaded, a projected skill or MCP server missing
from that report fails the check (R014).

## 9. Authority (HCS-0005)

Packages request; the host grants. A request is never a grant, and the decision
is made by the host at the moment of the operation.

```mermaid
sequenceDiagram
    autonumber
    participant P as Package
    participant H as Host (enforcement point)
    participant G as Host grants
    participant PDP as Policy engine (optional, e.g. OPA)

    P-->>H: requests [{permission, reason}] (declared, not granted)
    Note over H,G: operator or host policy writes grants<br/>{entry, permission}
    P->>H: operation needing a permission
    H->>G: check {entry, permission}
    opt host delegates the decision
        H->>PDP: check
        PDP-->>H: allow / deny
    end
    alt granted
        H-->>P: run operation
    else not granted
        H-->>P: permission_denied (HCS-0006)
    end
```

HCS defines the shapes and enforcement rules only; the permission vocabulary,
policy language and trust tiers belong to the distribution (OQ-0005-1).

## 10. Errors on the wire (HCS-0006)

One error object, a closed set of codes, carried inside the transport's own
error shape. Consumers branch on `code`, never on `message`.

```mermaid
flowchart LR
    err["HCS error object<br/>{code, message, entry?,<br/>capability?, requirement?, details?}"]
    err -->|JSON-RPC 2.0: MCP, ACP| rpc["error.data.hcsError<br/>numeric code from the protocol<br/>(R003)"]
    err -->|HTTP| p9457["RFC 9457 problem details<br/>type = urn:hcs:error:&lt;code&gt;<br/>extension member hcsError<br/>(R004, R005)"]
```

## 11. How the repository is built

Prose is normative, schemas define shapes, and every MUST has a case that
satisfies it and one that violates it (HCS-0000-R001).

```mermaid
flowchart LR
    spec["spec/HCS-NNNN-*.md<br/>requirements in prose"] -->|tools/extract_requirements.py| reqs["requirements/<br/>requirements.json"]
    schemas["schemas/<br/>JSON Schema 2020-12<br/>urn:hcs:schema:..."]
    cases["conformance/cases/<br/>&lt;doc&gt;/&lt;req&gt;/{valid,invalid}"]
    profiles["conformance/profiles/<br/>CORE-0, DISTRO-1"]
    runner["conformance/runner/run.py<br/>reference semantics"]
    reqs --> runner
    schemas --> runner
    cases --> runner
    profiles -.->|lists requirement ids| reqs
    runner -->|"pass / fail / pending(host)<br/>+ coverage per requirement"| report["report"]

    spec & schemas & cases & profiles & reqs -->|tools/build_release.py| art["hcs-&lt;version&gt;.tar.gz<br/>index.json + SHA256SUMS"]
    art -->|pinned tag, vendored, checksummed| host["Host repository<br/>vendor/hcs/&lt;version&gt;/"]
```

The reference runner executes the `document`, `integrity`, `resolution`,
`authority`, `distribution` and `projection` levels. `host` cases describe a
scenario that needs a running host and are reported `pending` until a
system-under-test interface exists (issue #20). See the README, "How to pin
HCS", for the consumer side.

## 12. What HCS reuses instead of defining

| Need | Standard | Where in HCS |
| --- | --- | --- |
| Requirement keywords | BCP 14 (RFC 2119, RFC 8174) | HCS-0000 |
| Document shapes | JSON Schema 2020-12 | `schemas/` |
| Package format, platforms, digests | OCI image spec (layers, platform object) | HCS-0001 |
| Distribution security properties | TUF (sequence, expiry, thresholds, key rotation) | HCS-0007 |
| Canonical form and signing envelope | RFC 8785 JCS, DSSE, Ed25519 | HCS-0007 |
| Provenance | SLSA Provenance v1 in in-toto | HCS-0007-R020 |
| Skills | Agent Skills | HCS-0001, HCS-0008 |
| MCP server descriptor | MCP Registry `server.json` | HCS-0008 |
| Instructions | AGENTS.md | HCS-0008 (extension kinds) |
| Tool calls, client/agent | MCP, ACP over JSON-RPC 2.0 | HCS-0006 |
| HTTP errors | RFC 9457 problem details | HCS-0006 |
| Observed state | CloudEvents 1.0.2 | HCS-0007-R021 |
| Health states | Kubernetes conditions, gRPC health, UAPI boot counting | HCS-0008 |
| Policy decisions | OPA (optional) | HCS-0005 |

Pinned notes on each standard live in `docs/standards/`; the reasons behind
each choice live in `docs/adr/`.
