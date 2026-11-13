// HCS-0008 projection: the engine-neutral shapes a host adapter works with. Engine-specific adapters live
// outside the SDK and plug in through `EngineAdapter`; nothing here names an engine or an engine path.
import type { HcsError } from '../errors.ts';

// A contribution as the adapter receives it: the catalog contribution (HCS-0001 section 3.2) plus whatever the
// host read from the package (for example a skill's Agent Skills `name`, or the `server.json` document).
export interface ProjectionContribution { kind: string; path?: string; [key: string]: unknown }

// One selected entry of a generation, in activation order, with the absolute root of its unpacked content, as a
// normalized path of the host's platform (native separators).
// The root resolves inside the generation by its identifier, never through a pointer the host moves (R001).
export interface ProjectionEntry { id: string; version?: string; root: string; contributions: ProjectionContribution[] }
export interface ProjectionGeneration { id: string; entries: ProjectionEntry[] }

// Effect of a contribution on an engine-level name (HCS-0008 section 6.2; conformance/README.md).
export type SettingEffect = 'add' | 'replace' | 'remove' | 'widen' | 'narrow';
// Permission levels for host-lock ceilings, from strictest to widest.
export type PermissionLevel = 'deny' | 'ask' | 'allow';
export const PERMISSION_LEVELS: readonly PermissionLevel[] = ['deny', 'ask', 'allow'];

// An engine-level name a contribution touches (a skill name, an MCP server name, a permission rule's target).
// `level` is the permission a setting grants, compared against a host-lock ceiling.
export interface Setting { name: string; effect: SettingEffect; level?: PermissionLevel }

// A secret input a contribution needs; its value comes only from the host's grants to that entry (R012).
export interface SecretInput { input: string; required: boolean }

// A secret the host grants to an entry (HCS-0005), delivered to the engine run as environment variable `env`.
// The SDK never holds the value: the plan carries this reference, and the host fills it at launch.
export interface SecretRef { entry: string; input: string; env: string }

// A file the plan places under the run directory, by path relative to it: literal content, or a symbolic link
// to an absolute path inside the generation (a skill directory is linked, never copied with changes, R008). `path`
// always uses `/`; `link` is a normalized path of the host's platform under an entry root.
export type PlanFile =
  | { path: string; content: string | Uint8Array; mode?: number }
  | { path: string; link: string };

// What one contribution, or the adapter's final assembly, adds to the run.
export interface PlanFragment { files?: PlanFile[]; argv?: string[]; env?: Record<string, string> }

// The adapter's answer for one contribution. A refusal names the HCS-0006 error the core reports for the entry;
// an adapter checks in the order of HCS-0008 6.4.1 (manifest_invalid, then unsupported_contribution), and the core
// adds permission_denied for missing grants (R012) and host-owned settings (R007) after it.
export type ContributionProjection =
  | { ok: true; settings: Setting[]; secrets?: SecretInput[]; identity?: string; fragment?: PlanFragment }
  | { ok: false; code: 'manifest_invalid' | 'unsupported_contribution' | 'permission_denied'; message: string; requirement?: string };

export interface ContributionContext {
  generation: string;
  entry: ProjectionEntry;
  // Absolute path where the plan will be materialized (`writeRunDir`). Everything the engine reads goes there
  // or in the generation (R025); the adapter never points the engine at a user-global location.
  runDir: string;
  // The environment variable that will hold a granted secret of this entry, for writing a reference instead of
  // a value; undefined when the host grants no such secret.
  secretEnv(input: string): string | undefined;
}

// A contribution the core accepted, handed to `assemble` so an adapter can write one combined engine file.
export interface ProjectedContribution { entry: string; contribution: ProjectionContribution; settings: Setting[]; identity?: string }

export interface EngineAdapter {
  // Contribution kinds the adapter can project into its engine (HCS-0008 section 3 input 4, R004).
  readonly kinds: readonly string[];
  // Projects one contribution. Must be pure: it describes files, arguments and environment; it writes nothing.
  project(contribution: ProjectionContribution, context: ContributionContext): ContributionProjection;
  // Optional final step over the contributions of the selected entries, for engine files that combine several
  // contributions (for example one MCP configuration). Runs once, after selection.
  assemble?(projected: ProjectedContribution[], context: { generation: string; runDir: string; secrets: SecretRef[] }): PlanFragment;
}

// The launch plan for one engine run: complete by itself (R025). `env` is the whole environment apart from
// `secrets`, never merged with the host's own environment by the SDK.
export interface LaunchPlan {
  generation: string;
  runDir: string;
  argv: string[];
  env: Record<string, string>;
  secrets: SecretRef[];
  files: PlanFile[];
}

export interface ContributionOutcome { entry: string; index: number; kind: string; status: 'projected' | 'reported' | 'withheld'; code?: HcsError['code'] }

export interface ProjectionReport {
  // HCS-0006 errors with the entry id, at most one per code and entry.
  errors: HcsError[];
  // Every contribution of every entry (R003): projected into the plan, reported with an error, or withheld
  // because another contribution of its entry kept the entry from being selected (R005).
  contributions: ContributionOutcome[];
  // Entries the host may report `active` on this engine (R005, R017), in activation order.
  selected: string[];
  // Host-provided defaults a generation contribution replaced (section 6.1).
  replacedDefaults: string[];
}

export interface ProjectionResult { plan: LaunchPlan; report: ProjectionReport }

export interface ProjectOptions {
  runDir: string;
  // Engine-level names of host-owned settings (R007), added to the host lock's `reserved`.
  hostOwned?: readonly string[];
  // Engine-level names of host-provided defaults; a generation contribution replaces them (section 6.1).
  hostDefaults?: readonly string[];
  // Secrets the host grants per entry (HCS-0005), with the environment variable each is delivered in.
  secrets?: readonly SecretRef[];
  activationPolicy?: 'all-or-nothing' | 'partial';
}
