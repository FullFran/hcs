// Materializes a launch plan into a new run directory, and builds the run's environment at launch.
import { mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { LaunchPlan, SecretRef } from './types.ts';

// Writes the plan's files under `dir`, which must be the plan's run directory and must not exist or be empty:
// a run directory is never shared with a live run (R002). The tree is built in a sibling staging directory and
// renamed into place, so a failure leaves no partial run directory.
export function writeRunDir(plan: LaunchPlan, dir: string): void {
  const target = resolve(dir);
  if (target !== resolve(plan.runDir)) throw new Error(`${dir} is not the plan's run directory ${plan.runDir}`);
  let existing: string[] | undefined;
  try { existing = readdirSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing !== undefined && existing.length > 0) throw new Error(`Run directory ${target} is not empty`);
  const staging = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.staging`);
  mkdirSync(staging, { mode: 0o700 });
  try {
    for (const file of plan.files) {
      const path = join(staging, file.path);
      if (!path.startsWith(`${staging}${sep}`)) throw new Error(`Plan file outside the run directory: ${file.path}`);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      if ('link' in file) symlinkSync(file.link, path, linkType(file.link));
      else {
        writeFileSync(path, file.content, { flag: 'wx', mode: file.mode ?? 0o600 });
        if (file.mode !== undefined) chmodSync(path, file.mode);
      }
    }
    // POSIX rename replaces an empty directory and refuses a non-empty one. Windows refuses both, so the empty
    // directory is removed first; rmdir refuses a directory that is no longer empty.
    if (existing !== undefined && process.platform === 'win32') rmdirSync(target);
    renameSync(staging, target);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

// On Windows a directory is linked as a junction, which needs no privilege; elsewhere the type is ignored.
function linkType(target: string): 'junction' | undefined {
  if (process.platform !== 'win32') return undefined;
  try { return statSync(target).isDirectory() ? 'junction' : undefined; } catch { return undefined; }
}

// The complete environment of the run: the plan's environment plus each granted secret, looked up by the host
// at launch. The SDK merges nothing from the host's own environment (R025); a missing secret is an error.
export function launchEnv(plan: LaunchPlan, lookup: (ref: SecretRef) => string | undefined): Record<string, string> {
  const env = { ...plan.env };
  for (const ref of plan.secrets) {
    const value = lookup({ ...ref });
    if (value === undefined) throw new Error(`No value for secret ${ref.input} of ${ref.entry} (${ref.env})`);
    env[ref.env] = value;
  }
  return env;
}
