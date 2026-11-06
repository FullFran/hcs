# Uptane

| Field | Value |
| --- | --- |
| Owner | Uptane Series, Joint Development Foundation Projects, LLC (Linux Foundation JDF) |
| Version pinned | Uptane Standard for Design and Implementation 2.1.0 (released 2023-06-23) |
| Source pinned | uptane/uptane-standard@2.1.0 (`46497aaa1cc59a50b1b06e0c625d5794e4c19081`), file `uptane-standard.md` |
| Access date | 2026-11-06 |
| License | Apache-2.0 (repo `LICENSE` and the notice at the end of `uptane-standard.md`) |
| Maturity | Stable standard; predecessor IEEE-ISTO 6100.1.0.0 (2019) |
| HCS action | out; reference only (multi-repository pattern informing DISTRO-1) |

## What it defines
A compromise-resilient software-update system for vehicles, derived from TUF. It adds a second repository and per-vehicle direction: an **Image repository** (offline-keyed, holds images and their signed metadata) and a **Director repository** (online, generates per-vehicle metadata on demand from an inventory database and the vehicle version manifest). ECUs install an image only when both repositories agree, as described by repository mapping metadata. It also covers in-vehicle requirements (Primary/Secondary ECUs, full vs partial verification).

## Key objects and fields
- Roles per repository: Root, Targets (with delegations), Snapshot, Timestamp (same as TUF).
- Common metadata: role type, expiration, version, signatures; serialization left to implementers (ASN.1 or JSON examples in the Deployment Best Practices).
- Targets metadata about images: filename, size in bytes, one or more hashes with the hash function used; Director targets with no images SHALL include a vehicle identifier.
- Custom image metadata (SHOULD): release counter (rollback protection even if the Director is compromised), hardware identifier(s); encrypted-image filename/hashes/size when applicable; an optional "SHALL match" section compared across repositories.
- Repository mapping metadata: repository names + URLs, and path -> repositories mappings; basic case maps `*` to both Director and Image repository (TAP-4).
- Vehicle version manifest and ECU version reports (with nonce/counter) sent by the Primary to the Director.

## Extension points
- Custom targets metadata, including the "SHALL match" section.
- Repository mapping metadata allows more than two repositories (TAP-4).
- Encoding choices and many details are delegated to the Deployment Best Practices document.

## Where HCS references it instead of redefining
- DISTRO-1 MAY cite Uptane's Director + Image repository split as the pattern for "operator-chosen desired set" vs "publisher-signed packages": the HCS catalog (desired set) plays the director role, package publishers the image role. HCS MUST NOT adopt Uptane's vehicle/ECU model.
- HCS-0003 resolution vs Uptane Director dependency resolution: reference only; HCS defines its own resolution.

## Pitfalls for HCS
- Uptane is automotive-specific (ECUs, vehicle identifiers, Primaries/Secondaries); copying its terms would confuse HCS.
- Its threat model assumes an online Director key; HCS distribution should not depend on an always-online signer without the Image-repository cross-check.
- The repo README at the 2.1.0 tag still calls 2.0.0 (2022-03-18) "the most recent version"; pin from the release tag and the document title, not the README.
- No wire format is mandated; there is nothing to interoperate with directly.

## Sources
- https://github.com/uptane/uptane-standard/blob/2.1.0/uptane-standard.md (read 2026-11-06)
- https://github.com/uptane/uptane-standard/blob/2.1.0/README.md (read 2026-11-06)
- https://github.com/uptane/uptane-standard/releases/tag/2.1.0 (release metadata read 2026-11-06)
