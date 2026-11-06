# UAPI.6 Configuration Files Specification

| Field | Value |
| --- | --- |
| Owner | The Linux Userspace API (UAPI) Group (community; see [uapi-boot-counting.md](uapi-boot-counting.md)) |
| Version pinned | UAPI.6 version 1.0 ("Initial Release") |
| Source pinned | `uapi-group/specifications@5e61460b42b91bb1e402b50a6149774d78fc0d8e`, `specs/configuration_files_specification.md` |
| Access date | 2026-11-06 |
| License | CC-BY-4.0 (repository README) |
| Maturity | Accepted UAPI specification, derived from systemd and openSUSE libeconf practice; extends the XDG Base Directory Specification |
| HCS action | reference: the layering model behind the HCS-0008 precedence rule ([ADR-0019](../adr/0019-host-owned-settings-take-precedence.md)) |

## What it defines

Where configuration files are looked for and how layers override each other: vendor defaults live in the read-only vendor tree (`/usr/`), administrator overrides in `/etc/` with higher priority, optional ephemeral overrides in `/run/`. Programs must work with nothing in `/etc/`. An administrator can mask a vendor file (an empty file or a symlink to `/dev/null`), and drop-in directories (`<name>.d/`) are merged in lexicographic order, later files winning. The specification is agnostic to file format.

## Where HCS references it instead of redefining

- HCS-0008 uses the same layering in reverse naming: the distribution's generation plays the vendor tree (shipped, read-only, signed), and host-owned settings play the administrator layer that always wins. Unlike UAPI.6, a host-owned setting cannot be masked or overridden by the lower layer at all, and a generation can only add or narrow.
- HCS does not adopt UAPI.6 paths: engines read their own configuration locations.

## Pitfalls for HCS

- UAPI.6 lets the higher layer replace a whole file; HCS-0008 needs per-setting precedence (one permission rule, one MCP server name), so the model is reused, not the file mechanics [I].

## Sources

- https://github.com/uapi-group/specifications/blob/5e61460b42b91bb1e402b50a6149774d78fc0d8e/specs/configuration_files_specification.md (canonical https://uapi-group.org/specifications/specs/configuration_files_specification/)
- https://specifications.freedesktop.org/basedir/latest/ (XDG Base Directory, referenced by UAPI.6; not re-read in this pass [U])
