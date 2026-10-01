import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IdentifyOptions, IdentifyResult, ShieldLabsError } from '@shieldlabs-ai/js';
import { asShieldLabsError, isObject } from './internal';
import { useShieldLabsContext } from './provider';

/** Options of {@link useIdentify}. */
export interface UseIdentifyOptions {
  /**
   * User HID for every identification of this hook: a hashed or pseudonymous account ID computed on
   * your server. Omit it for anonymous visitors. Options of `identify()` with a `userId` key override
   * it, also when the value is `undefined` or `null`, which both identify anonymously.
   */
  userId?: string;
  /**
   * Runs `identify()` once when the component mounts, as soon as the agent is ready. With
   * `autoLoad={false}`, a mount before `load()` ends at once with a `not_initialized` error and does
   * not run again after `load()`. Every run is a billable identification, so use it sparingly.
   * Default `false`.
   */
  runOnMount?: boolean;
}

/** What {@link useIdentify} returns. */
export interface UseIdentifyResult {
  /**
   * Runs a fresh identification (a new request ID on every call) and resolves its result, or `null`
   * when there is no identification: the reason is then in `error`. Never rejects. While a call of
   * this hook with the same User HID and `timeout` is running (a double submit), returns that call
   * instead of starting another identification. The User HID of a call is its own `userId` when the
   * options have that key (`undefined` and `null` both mean anonymous), else the hook's. A call
   * without `timeout` counts as one with the provider `timeout` (10000 ms by default).
   */
  identify: (options?: IdentifyOptions) => Promise<IdentifyResult | null>;
  /** The result of the latest identification, `null` before it resolves, when it failed or after `reset()`. */
  result: IdentifyResult | null;
  /** `true` while the latest identification is running. */
  isLoading: boolean;
  /** Why the latest identification failed, otherwise `null`. */
  error: ShieldLabsError | null;
  /** Clears `result` and `error`. A running identification no longer updates the state. */
  reset: () => void;
}

interface IdentifyState {
  readonly result: IdentifyResult | null;
  readonly isLoading: boolean;
  readonly error: ShieldLabsError | null;
}

/** An identification that has not settled yet, shared with calls for the same User HID and timeout. */
interface RunningCall {
  readonly userId: string | undefined;
  /** The timeout the call runs with: its own `timeout` (even an invalid one), else the provider's default. */
  readonly timeout: unknown;
  readonly promise: Promise<IdentifyResult | null>;
  /** Identifies the call. The state shows the outcome of the call whose token is in `latestRef`. */
  readonly token: object;
}

/**
 * The call options with the effective User HID: the call's own when its options have a `userId`
 * key, even one set to `undefined` or `null` (both identify anonymously), else the hook's. An
 * anonymous call carries no `userId`, so it goes to the agent and is shared like any other.
 */
function agentOptionsOf(callOptions: IdentifyOptions | undefined, userId: string | undefined): IdentifyOptions | undefined {
  // Anything but an options object goes to the agent unchanged, so that @shieldlabs-ai/js reports it.
  const raw: unknown = callOptions;
  if (raw != null && !isObject(raw)) return callOptions;
  const { userId: ownUserId, ...rest } = callOptions ?? {};
  const effectiveUserId = callOptions != null && 'userId' in callOptions ? ownUserId : userId;
  return effectiveUserId == null ? rest : { ...rest, userId: effectiveUserId };
}

/**
 * The timeout a call with `options` runs with: its own, else `defaultTimeout`. As in `@shieldlabs-ai/js`,
 * only an omitted timeout takes the default. Any other value stays as it is, so a timeout the agent
 * rejects is never shared with a call that can succeed.
 */
function timeoutOf(options: IdentifyOptions | undefined, defaultTimeout: number): unknown {
  // Not `??`: a null timeout is invalid, and `??` would give it the default.
  const timeout: unknown = options?.timeout;
  return timeout === undefined ? defaultTimeout : timeout;
}

/** Whether a call with `options` that runs with `timeout` asks for the same identification as `running`. */
function isSameCall(running: RunningCall, options: IdentifyOptions | undefined, timeout: unknown): boolean {
  const raw: unknown = options;
  return isObject(raw) && running.userId === options?.userId && running.timeout === timeout;
}

// Shared objects, so that setting the same state again does not render again.
const IDLE: IdentifyState = { result: null, isLoading: false, error: null };
const LOADING: IdentifyState = { result: null, isLoading: true, error: null };

/**
 * Identification with loading and error state, for protected actions such as signup, login or
 * checkout. Must be called inside a {@link ShieldLabsProvider}.
 */
export function useIdentify(options: UseIdentifyOptions = {}): UseIdentifyResult {
  const { shieldLabs, defaultTimeout } = useShieldLabsContext('useIdentify');
  const identifyWithAgent = shieldLabs.identify;
  const { userId, runOnMount = false } = options;

  const [state, setState] = useState<IdentifyState>(runOnMount ? LOADING : IDLE);
  // True between the mount effect and its cleanup. The effects also disconnect while the component is
  // inside a hidden <Activity>, which keeps the state: an update that arrives then waits in queuedRef
  // until the component is shown again, and one that arrives after an unmount is dropped.
  const connectedRef = useRef(false);
  const queuedRef = useRef<IdentifyState | null>(null);
  // The token of the call whose outcome the state shows: the call asked for last.
  const latestRef = useRef<object>({});
  const runningRef = useRef<readonly RunningCall[]>([]);
  // Consumed by the first effect run, so identify() runs once per mount (also in StrictMode).
  const mountRunRef = useRef(runOnMount);

  const apply = useCallback((next: IdentifyState): void => {
    if (connectedRef.current) setState(next);
    else queuedRef.current = next;
  }, []);

  useEffect(() => {
    connectedRef.current = true;
    const queued = queuedRef.current;
    queuedRef.current = null;
    if (queued) apply(queued);
    return () => {
      connectedRef.current = false;
    };
  }, [apply]);

  const identify = useCallback(
    (callOptions?: IdentifyOptions): Promise<IdentifyResult | null> => {
      const agentOptions = agentOptionsOf(callOptions, userId);
      // Read now: the provider timeout can change between calls.
      const timeout = timeoutOf(agentOptions, defaultTimeout());
      // A double submit gets the running identification instead of a second one, which the agent
      // would refuse while the first one runs.
      const shared = runningRef.current.find((running) => isSameCall(running, agentOptions, timeout));
      if (shared) {
        if (latestRef.current !== shared.token) {
          latestRef.current = shared.token;
          apply(LOADING);
        }
        return shared.promise;
      }

      const token = {};
      latestRef.current = token;
      // Only the call asked for last changes the state.
      const publish = (next: IdentifyState): void => {
        if (latestRef.current === token) apply(next);
      };
      let entry: RunningCall | null = null;
      const settle = (next: IdentifyState): void => {
        runningRef.current = runningRef.current.filter((running) => running !== entry);
        publish(next);
      };

      publish(LOADING);
      // Started inside the promise, so that even a synchronous throw ends up in `error`.
      const promise = new Promise<IdentifyResult>((resolve) => {
        resolve(identifyWithAgent(agentOptions));
      }).then(
        (result) => {
          settle({ result, isLoading: false, error: null });
          return result;
        },
        (error: unknown) => {
          // No rejection: the protected action goes ahead without a request ID, as unverified.
          settle({
            result: null,
            isLoading: false,
            error: asShieldLabsError(error, 'not_initialized', 'The identification did not complete.'),
          });
          return null;
        },
      );

      // Options that are not an object go to the agent, which rejects them: nothing to share.
      const raw: unknown = agentOptions;
      if (isObject(raw)) {
        entry = { userId: agentOptions?.userId, timeout, promise, token };
        runningRef.current = [...runningRef.current, entry];
      }
      return promise;
    },
    [identifyWithAgent, defaultTimeout, userId, apply],
  );

  const reset = useCallback((): void => {
    latestRef.current = {};
    runningRef.current = [];
    apply(IDLE);
  }, [apply]);

  useEffect(() => {
    if (!mountRunRef.current) return;
    mountRunRef.current = false;
    void identify();
  }, [identify]);

  return useMemo<UseIdentifyResult>(
    () => ({ identify, result: state.result, isLoading: state.isLoading, error: state.error, reset }),
    [identify, state, reset],
  );
}
