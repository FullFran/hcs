// HCS-0008 host adapter: engine-neutral projection of a generation through an engine adapter, the host lock,
// and materialization of the launch plan into a run directory.
export * from './types.ts';
export { HOST_LOCK_FORMAT, type HostLock, ENV_NAME, isSecretRef, validateHostLock, readHostLock, lockWidenings } from './host-lock.ts';
export { projectGeneration } from './project.ts';
export { writeRunDir, launchEnv } from './run-dir.ts';
