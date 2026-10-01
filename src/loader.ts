import {
  load,
  ShieldLabsError,
  type IdentifyOptions,
  type IdentifyResult,
  type LoadOptions,
  type ShieldLabsAgent,
} from '@shieldlabs-ai/js';
import { asShieldLabsError, DEFAULT_TIMEOUT, isObject, isValidTimeout, withTimeout } from './internal';

/** Where the agent is: `'loading'`, `'ready'`, or `'error'` when it could not be loaded. */
export type ShieldLabsStatus = 'loading' | 'ready' | 'error';

/** The status of the agent for one set of load options (`key`). */
export interface LoadState {
  readonly key: string;
  readonly status: ShieldLabsStatus;
  readonly error: ShieldLabsError | null;
}

/**
 * The agent of one provider. Plain JavaScript without React: it never runs during render, only when
 * an effect or an event handler calls it, so nothing touches the browser during server-side rendering.
 */
export interface AgentLoader {
  /**
   * Sets the load options. Starts loading when they differ from the current load and loading is
   * allowed: from now on with `autoLoad`, otherwise once `load()` has been called.
   */
  update(options: LoadOptions, autoLoad: boolean): void;
  /**
   * Receives the status of the latest load until the returned function is called, starting with the
   * last status it reported, if any.
   */
  subscribe(listener: (state: LoadState) => void): () => void;
  /** Whether an `identify()` or `check()` for this User HID (`null`: anonymous) has not settled yet. */
  isRunning(userId: string | null): boolean;
  /** The timeout of a call without one of its own: the provider timeout, else the default of 10000 ms. */
  defaultTimeout: () => number;
  /** Allows loading from now on and starts it, or loads again after a failure a new load can fix. */
  load: () => void;
  /** The loaded agent. Waits while it loads, and until loading is allowed. */
  getAgent: () => Promise<ShieldLabsAgent>;
  /** Rejects with `not_initialized` at once while loading is not allowed. */
  identify: (options?: IdentifyOptions) => Promise<IdentifyResult>;
  /** Resolves `null` at once while loading is not allowed. */
  check: (options?: IdentifyOptions) => Promise<IdentifyResult | null>;
}

/** One load of the agent for one set of options. */
interface AgentSlot {
  readonly key: string;
  readonly promise: Promise<ShieldLabsAgent>;
  agent: ShieldLabsAgent | null;
  error: ShieldLabsError | null;
}

const LOAD_FAILED = 'Could not load the ShieldLabs agent.';
const NOT_LOADED =
  'The ShieldLabs agent is not loaded: ShieldLabsProvider has autoLoad={false} and load() from useShieldLabs() has not been called.';

/** Identifies one set of load options. The agent is loaded again when it changes. */
export function keyOf(options: LoadOptions): string {
  return [options.publicKey, options.environment, options.scriptUrl, options.timeout]
    .map((value) => typeof value + ':' + String(value))
    .join('|');
}

/** The User HID that call options pass, `null` for an anonymous call. */
export function userIdOf(options: unknown): string | null {
  return isObject(options) && typeof options.userId === 'string' ? options.userId : null;
}

/** Calls `load()` of `@shieldlabs-ai/js`, which is memoized per agent URL and Public Key. */
function startLoad(options: LoadOptions): Promise<ShieldLabsAgent> {
  return new Promise<ShieldLabsAgent>((resolve) => {
    resolve(load(options));
  }).catch((error: unknown) => {
    throw asShieldLabsError(error, 'load_failed', LOAD_FAILED);
  });
}

/**
 * A failed import is imported again by the next `load()`, and a load that timed out keeps running
 * so the next `load()` can use it. Invalid options and unsupported pages stay as they are.
 */
function canRetry(slot: AgentSlot): boolean {
  const code = slot.error?.code;
  return code === 'load_failed' || code === 'timeout';
}

/**
 * A load that fails for a reason loading again cannot fix is a setup problem (a missing or wrong
 * `publicKey`, a page without HTTPS). The provider only shows it in `status`, so it also goes to the
 * console. Blocked or failed downloads are normal for some visitors and stay quiet.
 */
function warnSetupProblem(error: ShieldLabsError): void {
  if (error.code === 'invalid_options' || error.code === 'unsupported_environment') {
    console.warn('[ShieldLabs] ShieldLabsProvider could not load the agent: ' + error.message);
  }
}

/** How long one call may take in all: its own timeout, the provider timeout or the default. */
function callTimeout(callOptions: IdentifyOptions | undefined, loadOptions: LoadOptions): number {
  const perCall = callOptions?.timeout;
  if (isValidTimeout(perCall)) return perCall;
  if (isValidTimeout(loadOptions.timeout)) return loadOptions.timeout;
  return DEFAULT_TIMEOUT;
}

/**
 * The options for an agent call that waited for the load since `startedAt`: what is left of the
 * call's `total` timeout becomes its timeout, so the wait and the agent's answer together stay within
 * one timeout (clamped, in case the clock changes). Options that are not an object and an invalid
 * timeout go to the agent unchanged, and `@shieldlabs-ai/js` rejects them.
 */
function withTimeLeft(
  callOptions: IdentifyOptions | undefined,
  total: number,
  startedAt: number,
): IdentifyOptions | undefined {
  const raw: unknown = callOptions;
  if (raw != null && !isObject(raw)) return callOptions;
  if (callOptions?.timeout !== undefined && !isValidTimeout(callOptions.timeout)) return callOptions;
  const left = total - (Date.now() - startedAt);
  return { ...callOptions, timeout: Math.min(total, Math.max(1, left)) };
}

export function createAgentLoader(initialOptions: LoadOptions, autoLoad: boolean): AgentLoader {
  let options = initialOptions;
  let slot: AgentSlot | null = null;
  let listener: ((state: LoadState) => void) | null = null;
  // The last state the current load reported, kept for a listener that subscribes later.
  let latest: LoadState | null = null;
  // Whether the agent may load: from the start with autoLoad, otherwise from the first load().
  let allowed = autoLoad;
  // Resolves when loading becomes allowed, for the getAgent() calls made before.
  let allowedPromise: Promise<void> | null = null;
  let resolveAllowed: (() => void) | null = null;
  // Unsettled identify() and check() calls per User HID (null: anonymous).
  const running = new Map<string | null, number>();

  // The load for the current options: the running or finished one, or a new one.
  const currentSlot = (): AgentSlot => {
    const key = keyOf(options);
    const previous = slot;
    if (previous?.key === key && !canRetry(previous)) return previous;

    const next: AgentSlot = { key, promise: startLoad(options), agent: null, error: null };
    slot = next;
    latest = null;
    // Only the latest load reports. Without a listener (the provider is unmounted, or its effects are
    // disconnected inside a hidden <Activity>) the state waits in `latest`.
    const publish = (state: LoadState): void => {
      if (slot !== next) return;
      latest = state;
      if (listener) listener(state);
    };
    if (previous?.key === key) publish({ key, status: 'loading', error: null });
    next.promise.then(
      (agent) => {
        next.agent = agent;
        publish({ key, status: 'ready', error: null });
      },
      (error: unknown) => {
        next.error = asShieldLabsError(error, 'load_failed', LOAD_FAILED);
        if (slot === next) warnSetupProblem(next.error);
        publish({ key, status: 'error', error: next.error });
      },
    );
    return next;
  };

  const allow = (): void => {
    if (allowed) return;
    allowed = true;
    if (resolveAllowed) resolveAllowed();
    allowedPromise = null;
    resolveAllowed = null;
  };

  const whenAllowed = (): Promise<void> =>
    (allowedPromise ??= new Promise<void>((resolve) => {
      resolveAllowed = resolve;
    }));

  // Calls the agent at once when it has loaded, with the options as they are. Otherwise the call waits
  // for the load and then passes the agent only the rest of its timeout: one deadline for the whole call.
  const withAgent = <T>(
    callOptions: IdentifyOptions | undefined,
    call: (agent: ShieldLabsAgent, agentOptions: IdentifyOptions | undefined) => Promise<T>,
  ): Promise<T> => {
    const current = currentSlot();
    if (current.agent) return Promise.resolve(current.agent).then((agent) => call(agent, callOptions));
    const ms = callTimeout(callOptions, options);
    const startedAt = Date.now();
    return withTimeout(current.promise, ms, 'The ShieldLabs agent did not load within ' + String(ms) + ' ms.').then(
      (agent) => call(agent, withTimeLeft(callOptions, ms, startedAt)),
    );
  };

  // Counts the call as running for its User HID until it settles, including a wait for the load.
  const track = <T>(callOptions: IdentifyOptions | undefined, promise: Promise<T>): Promise<T> => {
    const userId = userIdOf(callOptions);
    running.set(userId, (running.get(userId) ?? 0) + 1);
    return promise.finally(() => {
      const left = (running.get(userId) ?? 1) - 1;
      if (left > 0) running.set(userId, left);
      else running.delete(userId);
    });
  };

  return {
    update(nextOptions, nextAutoLoad) {
      options = nextOptions;
      if (nextAutoLoad) allow();
      if (allowed) currentSlot();
    },
    subscribe(nextListener) {
      listener = nextListener;
      // A state reported while nobody listened arrives now. The provider already holds the same
      // object when it did listen, so React skips that update.
      if (latest) nextListener(latest);
      return () => {
        if (listener === nextListener) listener = null;
      };
    },
    isRunning(userId) {
      return running.has(userId);
    },
    defaultTimeout: () => callTimeout(undefined, options),
    load: () => {
      allow();
      currentSlot();
    },
    getAgent: () => (allowed ? currentSlot().promise : whenAllowed().then(() => currentSlot().promise)),
    identify: (callOptions) =>
      allowed
        ? track(callOptions, withAgent(callOptions, (agent, agentOptions) => agent.identify(agentOptions)))
        : Promise.reject(new ShieldLabsError('not_initialized', NOT_LOADED)),
    check: (callOptions) =>
      allowed
        ? track(callOptions, withAgent(callOptions, (agent, agentOptions) => agent.check(agentOptions)))
        : Promise.resolve(null),
  };
}
