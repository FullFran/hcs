import { isDottedId, isExtensionName, parseCapabilityRef } from './ids.ts';
import { validateHcsError } from './transport.ts';

// Closed set of HCS error codes (HCS-0006-R002). Product refusals are not HCS errors.
export const HCS_ERROR_CODES = [
  'manifest_invalid',
  'unsupported_hcs_version',
  'duplicate_entry',
  'integrity_mismatch',
  'package_invalid',
  'unsupported_contribution',
  'platform_incompatible',
  'missing_dependency',
  'version_incompatible',
  'ambiguous_provider',
  'dependency_cycle',
  'permission_denied',
  'unsupported_capability',
  'timeout',
  'plugin_failed',
  'signature_invalid',
  'rollback_rejected',
  'generation_mismatch',
] as const;

export type HcsErrorCode = (typeof HCS_ERROR_CODES)[number];

// HCS-0006 error object. `details` members must be extension names (`x-...`).
export interface HcsError {
  code: HcsErrorCode;
  message: string;
  entry?: string;
  capability?: string;
  requirement?: string;
  details?: Record<string, unknown>;
}

export function isHcsErrorCode(value: unknown): value is HcsErrorCode {
  return typeof value === 'string' && (HCS_ERROR_CODES as readonly string[]).includes(value);
}

const requirementPattern = /^HCS-[0-9]{4}-R[0-9]{3}$/;

export function hcsError(
  code: HcsErrorCode,
  message: string,
  extra: Omit<HcsError, 'code' | 'message'> = {},
): HcsError {
  if (!isHcsErrorCode(code)) throw new TypeError(`Not an HCS error code: ${String(code)}`);
  if (message.length === 0) throw new TypeError('HCS error message must not be empty');
  if (extra.entry !== undefined && !isDottedId(extra.entry)) throw new TypeError(`Not an HCS entry id: ${extra.entry}`);
  if (extra.capability !== undefined && !parseCapabilityRef(extra.capability).ok) throw new TypeError(`Not an HCS capability ref: ${extra.capability}`);
  if (extra.requirement !== undefined && (!requirementPattern.test(extra.requirement) || extra.requirement.length !== 13)) {
    throw new TypeError(`Not an HCS requirement id: ${extra.requirement}`);
  }
  for (const key of Object.keys(extra.details ?? {})) {
    if (!isExtensionName(key)) throw new TypeError(`HCS error details member must be an extension name: ${key}`);
  }
  const error: HcsError = { code, message };
  if (extra.entry !== undefined) error.entry = extra.entry;
  if (extra.capability !== undefined) error.capability = extra.capability;
  if (extra.requirement !== undefined) error.requirement = extra.requirement;
  if (extra.details !== undefined) error.details = { ...extra.details };
  return error;
}

// Thrown by host operations that fail with one or more HCS errors.
export class HcsFailure extends Error {
  readonly errors: readonly HcsError[];
  constructor(errors: readonly HcsError[]) {
    if (errors.length === 0) throw new TypeError('HcsFailure requires at least one error');
    super(errors.map(e => `${e.code}: ${e.message}`).join('; '));
    this.name = 'HcsFailure';
    this.errors = errors;
  }
}

// MCP tool result carrying an HCS error (HCS-0006 section 4.5): `isError`, the error object in
// `structuredContent.hcsError`, and human text in `content`.
export interface HcsToolResult {
  isError: true;
  content: [{ type: 'text'; text: string }];
  structuredContent: { hcsError: HcsError };
}

// `text` defaults to the error message; a host may add recovery guidance to it (clients do not read it).
export function toToolResult(error: HcsError, text: string = error.message): HcsToolResult {
  if (text.length === 0) throw new TypeError('Tool result text must not be empty');
  return { isError: true, content: [{ type: 'text', text }], structuredContent: { hcsError: error } };
}

// The HCS error of a tool result, or null (HCS-0006-R009). Only `isError: true` with a valid
// `structuredContent.hcsError` counts; text content and other members are never read.
export function fromToolResult(result: unknown): HcsError | null {
  if (result === null || typeof result !== 'object') return null;
  const { isError, structuredContent } = result as { isError?: unknown; structuredContent?: unknown };
  if (isError !== true || structuredContent === null || typeof structuredContent !== 'object' || Array.isArray(structuredContent)) return null;
  const candidate = (structuredContent as Record<string, unknown>).hcsError;
  return validateHcsError(candidate).length === 0 ? (candidate as HcsError) : null;
}

// A tool's outputSchema widened so that its error results validate (HCS-0006-R008). The input is not modified.
export function withHcsErrorOutput<S extends Record<string, unknown>>(outputSchema: S) {
  return {
    type: 'object' as const,
    anyOf: [outputSchema, { type: 'object', required: ['hcsError'], properties: { hcsError: { type: 'object' } } }] as [S, Record<string, unknown>],
  };
}
