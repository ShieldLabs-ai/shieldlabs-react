import { ShieldLabsError, type ShieldLabsErrorCode } from '@shieldlabs-ai/js';

/** Default time in milliseconds for each agent call, the same as `@shieldlabs-ai/js`. */
export const DEFAULT_TIMEOUT = 10000;

/** Largest delay `setTimeout` accepts without overflowing. */
const MAX_TIMEOUT = 2147483647;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isValidTimeout(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= MAX_TIMEOUT;
}

/** Keeps a `ShieldLabsError` as it is and wraps anything else, with the original as `cause`. */
export function asShieldLabsError(error: unknown, code: ShieldLabsErrorCode, message: string): ShieldLabsError {
  return error instanceof ShieldLabsError ? error : new ShieldLabsError(code, message, error);
}

/**
 * Settles like `promise`, or rejects with a `timeout` error after `ms` milliseconds. The timer is
 * always cleared when `promise` settles first.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ShieldLabsError('timeout', message));
    }, ms);
    const clear = (): void => {
      clearTimeout(timer);
    };
    promise.then(clear, clear);
    promise.then(resolve, reject);
  });
}

export function ignore(): void {
  // Intentionally empty: the outcome is reported another way.
}
