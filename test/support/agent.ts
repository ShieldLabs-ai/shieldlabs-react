import { vi } from 'vitest';
import type { IdentifyOptions, IdentifyResult, InteractionIdentifier, ShieldLabsAgent } from '@shieldlabs-ai/js';

/** Placeholder Public Keys in the issued format (32 lowercase hex characters). */
export const PUBLIC_KEY = '0123456789abcdef0123456789abcdef';
export const OTHER_PUBLIC_KEY = 'fedcba9876543210fedcba9876543210';

/** A User HID as a server would compute it (64 hex characters). */
export const USER_HID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
export const OTHER_USER_HID = '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752';

let counter = 0;

/** UUIDv4-shaped request IDs, unique within a test run. */
export function nextRequestId(): string {
  counter += 1;
  return '6f1c2a9e-7b3d-4c5e-8f90-' + counter.toString(16).padStart(12, '0');
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function answer(options?: IdentifyOptions): Promise<IdentifyResult> {
  return Promise.resolve({ requestId: nextRequestId(), userId: options?.userId ?? null });
}

/**
 * A stand-in for the agent that `load()` of `@shieldlabs-ai/js` resolves. `identify()` and `check()`
 * answer with a new request ID and echo the User HID. `identifyOnInteraction()` returns `handle`,
 * whose `take()` answers the same way. Create it inside each test: the config resets mocks before
 * every test.
 */
export function createAgent() {
  const identify = vi.fn<(options?: IdentifyOptions) => Promise<IdentifyResult>>(answer);
  const check = vi.fn<(options?: IdentifyOptions) => Promise<IdentifyResult | null>>(answer);
  const handle = {
    take: vi.fn<() => Promise<IdentifyResult>>(() => answer()),
    dispose: vi.fn<() => void>(),
  } satisfies InteractionIdentifier;
  const identifyOnInteraction = vi.fn<(target: EventTarget, options?: IdentifyOptions) => InteractionIdentifier>(
    () => handle,
  );
  const agent: ShieldLabsAgent = { identify, check, identifyOnInteraction };
  return { agent, identify, check, identifyOnInteraction, handle };
}
