# Kubernetes probes and projected configuration

| Field | Value |
| --- | --- |
| Owner | Kubernetes project, CNCF (Linux Foundation) |
| Version pinned | documentation at `kubernetes/website@380372f60632ed7ce70516ecaaab4710ffb8703a` (`main`, 2026-11-06); `pkg/volume/util/atomic_writer.go` on `kubernetes/kubernetes` `master` |
| Source pinned | `content/en/docs/concepts/workloads/pods/probes.md`, `content/en/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes.md`, `content/en/docs/concepts/configuration/configmap.md` |
| Access date | 2026-11-06 |
| License | Apache-2.0 (code); documentation CC-BY-4.0 [U: website licence not re-checked] |
| Maturity | Stable API (probes in `core/v1`); CNCF Graduated |
| HCS action | reference: health-check semantics and atomic projection in HCS-0008 |

## What it defines

- **Probes.** The kubelet runs three kinds of diagnostic on a container: a startup probe (runs only at start; liveness and readiness wait until it succeeds; on failure the container is killed and its restart policy applies), a liveness probe (restart when it fails more than the configured tolerance), and a readiness probe (stop routing traffic while it fails). A probe is a command, a TCP connection, a gRPC health call or an HTTP GET; for HTTP, any status from 200 to 399 is success.
- **Projected configuration.** A ConfigMap mounted as a volume is updated "eventually" when the ConfigMap changes; consumed as environment variables or through `subPath`, it is not updated until the pod restarts. The kubelet's `AtomicWriter` "atomically projects" a set of files by writing a new timestamped directory and switching a `..data` symlink to it, so a reader sees either the old or the new set, never a mix.

The relation between health probes and deployment strategy (how readiness gates a rolling update, `minReadySeconds`, `progressDeadlineSeconds`, `maxUnavailable`) is outside what this note pins. Kubernetes documents it in the Deployment concept page, sections "Progressing Deployment", "Failed Deployment", "Min Ready Seconds" and "Progress Deadline Seconds": https://github.com/kubernetes/website/blob/380372f60632ed7ce70516ecaaab4710ffb8703a/content/en/docs/concepts/workloads/controllers/deployment.md (sections located 2026-11-11, not summarized here).

## Where HCS references it instead of redefining

- HCS-0008 health check: "the engine started from this generation" is the startup probe, and "passed the health check" is the first success after it. HCS does not prescribe probe types or thresholds; the host declares them.
- HCS-0008 atomicity: the generation directory plus an `active` pointer is the `AtomicWriter` pattern. The Kubernetes caveat carries over: a reader that keeps following the pointer during a run can see the new set mid-run, which is why HCS-0008 makes the engine read an immutable generation reference and change generation only by starting a new run.

## Pitfalls for HCS

- Kubernetes rolls a failing container back only through its restart policy or a controller; there is no built-in "return to the previous configuration" for ConfigMaps. The one-rollback rule comes from boot counting ([uapi-boot-counting.md](uapi-boot-counting.md)), not from Kubernetes.
- `AtomicWriter` is an implementation, not a specification; cite it as precedent only.

## Sources

- https://github.com/kubernetes/website/blob/380372f60632ed7ce70516ecaaab4710ffb8703a/content/en/docs/concepts/workloads/pods/probes.md
- https://github.com/kubernetes/website/blob/380372f60632ed7ce70516ecaaab4710ffb8703a/content/en/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes.md
- https://github.com/kubernetes/website/blob/380372f60632ed7ce70516ecaaab4710ffb8703a/content/en/docs/concepts/configuration/configmap.md
- https://github.com/kubernetes/kubernetes/blob/master/pkg/volume/util/atomic_writer.go (read on `master`, not pinned [U for drift])
