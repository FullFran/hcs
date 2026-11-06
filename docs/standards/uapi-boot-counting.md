# UAPI.1 boot counting and systemd Automatic Boot Assessment

| Field | Value |
| --- | --- |
| Owner | The Linux Userspace API (UAPI) Group, an open community of Linux distribution and tooling developers; not a foundation (uapi-group.org: "in the process of constituting itself") [F]. systemd implements the scheme |
| Version pinned | UAPI.1 Boot Loader Specification, section "Boot counting"; systemd `docs/AUTOMATIC_BOOT_ASSESSMENT.md` at v262.2 |
| Source pinned | `uapi-group/specifications@5e61460b42b91bb1e402b50a6149774d78fc0d8e` (`specs/boot_loader_specification.md`); `systemd/systemd@v262.2` (`63511d7283d7d0e2a2fc28075481afaf1a7be8f5`) |
| Access date | 2026-11-06 |
| License | UAPI specifications CC-BY-4.0 (repository README); systemd documentation LGPL-2.1-or-later (SPDX header of the document) |
| Maturity | Accepted UAPI specification; implemented by systemd-boot and used by image-based Linux distributions |
| HCS action | reference: the confirm-after-health model of HCS-0008 ([ADR-0020](../adr/0020-confirm-after-health-one-attempt.md)) |

## What it defines

How a new boot entry is tried a bounded number of times and kept only if the operating system says the boot succeeded. A new entry starts "indeterminate" with a number of tries left; each boot attempt decrements it. If the operating system considers the boot successful, the counter is removed and the entry becomes "good". When the tries are exhausted, the entry is "bad" and the boot loader prefers other entries, which returns the machine to the previous version.

## Key objects and fields

- Counter in the entry file name: `+<tries-left>[-<tries-done>]` before the suffix.
- "Successful" is decided by the operating system, not the boot loader. systemd's extension point is `boot-complete.target`: units that must pass before a boot counts as good order before it (`systemd-boot-check-no-failures.service` fails it when any unit failed), and `systemd-bless-boot.service` marks the entry good only after it is reached.
- The initial number of tries is configurable (`/etc/kernel/tries`).

## Where HCS references it instead of redefining

- HCS-0008: a new generation is "indeterminate" until an engine started from it passes the health check; only then is it confirmed ("blessed"). The bounded attempt count is one: a failed check returns to the previous confirmed generation, and the failed one is not retried automatically.
- HCS does not use file-name counters or boot loaders; it adopts the state model (indeterminate, good, bad), the rule that the running system, not the installer, decides success, and the bounded retry.

## Pitfalls for HCS

- Boot counting allows N tries; HCS-0008 fixes N to 1 because the first host never loops and a failed generation is rejected until a new one arrives.
- The UAPI Group is not a foundation-hosted body; citing it is reuse of a documented pattern, not adoption of a governed standard [I].

## Sources

- https://github.com/uapi-group/specifications/blob/5e61460b42b91bb1e402b50a6149774d78fc0d8e/specs/boot_loader_specification.md (section "Boot counting"; canonical https://uapi-group.org/specifications/specs/boot_loader_specification/#boot-counting)
- https://github.com/systemd/systemd/blob/v262.2/docs/AUTOMATIC_BOOT_ASSESSMENT.md (rendered at https://systemd.io/AUTOMATIC_BOOT_ASSESSMENT)
- https://uapi-group.org/
