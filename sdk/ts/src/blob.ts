import { createHash, timingSafeEqual, type Hash } from 'node:crypto';
import { HcsFailure, hcsError } from './errors.ts';
import { DEFAULT_DETAIL_PREFIX, checkDetailPrefix } from './extensions.ts';

/** OCI-style descriptor subset: what HCS-0001 entries already carry as `contentHash` and `size`. */
export interface BlobDescriptor {
  /** `sha256:<64 hex>` or `sha512:<128 hex>`, lowercase. */
  digest: string;
  size: number;
}
export type ByteSource = AsyncIterable<Uint8Array>;
export interface BlobVerifyOptions {
  /** Aborts reading; the iterator is closed (`return()`) so the underlying stream is released. */
  signal?: AbortSignal;
  /**
   * Extension prefix of the `details` members of an integrity failure: `<prefix>-reason` (`size_exceeded`,
   * `size_short` or `digest_mismatch`), `<prefix>-expected-size`, `<prefix>-observed-size` and
   * `<prefix>-observed-digest`. Defaults to the SDK's neutral prefix.
   */
  detailPrefix?: string;
}

const digestPattern = /^(sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128})$/;
/** True when `value` is a lowercase `sha256:` or `sha512:` digest string (the single parser of `<algorithm>:<hex>`). */
export function isBlobDigest(value: unknown): value is string { return typeof value === 'string' && digestPattern.test(value); }
function failure(message: string, details?: Record<string, unknown>): never {
  throw new HcsFailure([hcsError('integrity_mismatch', message, details ? { requirement: 'HCS-0001-R007', details } : { requirement: 'HCS-0001-R007' })]);
}

// Incremental size and digest check shared by all three entry points.
class BlobVerifier {
  private readonly hash: Hash;
  private readonly expected: Buffer;
  private received = 0;
  private detail(reason: string, more: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries([['reason', reason], ...Object.entries(more)].map(([key, value]) => [`${this.prefix}-${key}`, value]));
  }
  private readonly descriptor: BlobDescriptor;
  private readonly prefix: string;
  private readonly algorithm: string;
  constructor(descriptor: BlobDescriptor, detailPrefix = DEFAULT_DETAIL_PREFIX) {
    this.descriptor = descriptor; this.prefix = checkDetailPrefix(detailPrefix);
    if (!isBlobDigest(descriptor.digest)) failure('Invalid package content hash');
    if (!Number.isSafeInteger(descriptor.size) || descriptor.size < 0) throw new RangeError('Invalid blob size');
    const [algorithm, hex] = descriptor.digest.split(':');
    this.algorithm = algorithm; this.hash = createHash(algorithm); this.expected = Buffer.from(hex, 'hex');
  }
  // Throws before the offending chunk is hashed, so bytes beyond the declared size are never processed.
  push(chunk: Uint8Array): void {
    if (this.received + chunk.length > this.descriptor.size) failure('Package download exceeds expected size', this.detail('size_exceeded', { 'expected-size': this.descriptor.size }));
    this.received += chunk.length; this.hash.update(chunk);
  }
  finish(): BlobDescriptor {
    if (this.received !== this.descriptor.size) failure('Package size does not match', this.detail('size_short', { 'expected-size': this.descriptor.size, 'observed-size': this.received }));
    const actual = this.hash.digest();
    if (actual.length !== this.expected.length || !timingSafeEqual(actual, this.expected)) failure('Package digest does not match', this.detail('digest_mismatch', { 'observed-digest': `${this.algorithm}:${actual.toString('hex')}` }));
    return { digest: this.descriptor.digest, size: this.descriptor.size };
  }
}

// Closes the iterator without letting a close error mask the original outcome.
async function close(iterator: AsyncIterator<Uint8Array>): Promise<void> {
  try { await iterator.return?.(); } catch { /* the original outcome wins */ }
}
const neverAborted = new Promise<never>(() => {});

async function drain(source: ByteSource, descriptor: BlobDescriptor, options: BlobVerifyOptions | undefined, onChunk: (chunk: Uint8Array) => void): Promise<BlobDescriptor> {
  const verifier = new BlobVerifier(descriptor, options?.detailPrefix), signal = options?.signal;
  signal?.throwIfAborted();
  const iterator = source[Symbol.asyncIterator]();
  let onAbort: (() => void) | undefined;
  const aborted = signal ? new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); }) : neverAborted;
  aborted.catch(() => {});
  try {
    for (;;) {
      const step = await Promise.race([iterator.next(), aborted]);
      if (step.done) break;
      verifier.push(step.value); onChunk(step.value);
      signal?.throwIfAborted();
    }
    return verifier.finish();
  } catch (error) {
    // A stalled `next()` may never settle, so closing is not awaited when the abort won the race.
    if (signal?.aborted && error === signal.reason) void close(iterator); else await close(iterator);
    throw error;
  } finally {
    if (onAbort) signal!.removeEventListener('abort', onAbort);
  }
}

/**
 * Reads `source` to the end without retaining it: counts bytes, hashes incrementally and stops at the
 * first byte beyond `descriptor.size`. Resolves with the verified descriptor.
 * Throws HcsFailure integrity_mismatch (HCS-0001-R007) when the stream is longer, shorter, or hashes differently.
 */
export function verifyBlobStream(source: ByteSource, descriptor: BlobDescriptor, options?: BlobVerifyOptions): Promise<BlobDescriptor> {
  return drain(source, descriptor, options, () => {});
}

/** Same checks; returns the bytes (at most `descriptor.size` are ever allocated). */
export async function collectVerifiedBlob(source: ByteSource, descriptor: BlobDescriptor, options?: BlobVerifyOptions): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await drain(source, descriptor, options, chunk => { chunks.push(Buffer.from(chunk)); });
  return Buffer.concat(chunks, descriptor.size);
}

/**
 * Tee-style helper for writing to a store while verifying: yields each chunk unchanged and throws after the
 * last chunk when the digest or size is wrong. Callers MUST NOT use the data before the iterator completes.
 */
export async function* verifyingTransform(source: ByteSource, descriptor: BlobDescriptor, options?: Pick<BlobVerifyOptions, 'detailPrefix'>): AsyncGenerator<Uint8Array, void, void> {
  const verifier = new BlobVerifier(descriptor, options?.detailPrefix);
  for await (const chunk of source) { verifier.push(chunk); yield chunk; }
  verifier.finish();
}
