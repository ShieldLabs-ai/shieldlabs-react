import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ShieldLabsError,
  type IdentifyOptions,
  type IdentifyResult,
  type LoadOptions,
  type ShieldLabsAgent,
} from '@shieldlabs-ai/js';
import { ignore, isObject } from './internal';
import { createAgentLoader, keyOf, userIdOf, type LoadState, type ShieldLabsStatus } from './loader';

export type { ShieldLabsStatus } from './loader';

/**
 * Props of {@link ShieldLabsProvider}: the `load()` options of `@shieldlabs-ai/js` plus `autoLoad` and
 * `checkOnLoad`.
 */
export interface ShieldLabsProviderProps extends LoadOptions {
  /**
   * Loads the agent after the first render in the browser. With `false`, nothing loads until `load()`
   * from `useShieldLabs()` is called or `autoLoad` becomes `true`, for example once the user has given
   * consent. Default `true`.
   */
  autoLoad?: boolean;
  /**
   * Runs `check()` once per provider mount when the agent is ready, for passive monitoring of the
   * visit, unless an `identify()` or `check()` for the same User HID is running at that moment. `true`
   * checks anonymously, `{ userId }` passes a User HID. Default `false`.
   */
  checkOnLoad?: boolean | { userId?: string };
  children?: ReactNode;
}

/** What {@link useShieldLabs} returns. */
export interface UseShieldLabsResult {
  /** `'loading'` until the agent has loaded, then `'ready'`, or `'error'` when loading failed. */
  status: ShieldLabsStatus;
  /** Why loading failed while `status` is `'error'`, otherwise `null`. */
  error: ShieldLabsError | null;
  /**
   * Runs a fresh identification: a new request ID on every call. Waits for the agent while it is
   * loading; the call's timeout covers that wait and the agent's answer. Rejects with a
   * `ShieldLabsError` when there is no identification, with `not_initialized` at once while
   * `autoLoad={false}` and `load()` has not been called. For protected actions, `useIdentify()` adds
   * state and never rejects.
   */
  identify: (options?: IdentifyOptions) => Promise<IdentifyResult>;
  /**
   * Background check, limited by the agent to one per visit every five minutes. Resolves `null` when
   * the agent skipped it, and at once while `autoLoad={false}` and `load()` has not been called. Waits
   * for the agent while it is loading, within the call's timeout.
   */
  check: (options?: IdentifyOptions) => Promise<IdentifyResult | null>;
  /**
   * Starts loading the agent: needed only with `autoLoad={false}`, for example once the user has given
   * consent. Also loads again after a failed load. Safe to call more than once. Call it from an event
   * handler or an effect, never during render.
   */
  load: () => void;
  /**
   * The loaded agent of `@shieldlabs-ai/js`, for example for `agent.identifyOnInteraction(form)`. Waits
   * while the agent loads, and with `autoLoad={false}` until loading starts, with no timeout of its
   * own. Rejects with the load error when the agent cannot load; the next call loads again when that
   * can help.
   */
  getAgent: () => Promise<ShieldLabsAgent>;
}

/** What the provider gives the hooks below it. */
export interface ShieldLabsContextValue {
  /** What `useShieldLabs()` returns. */
  readonly shieldLabs: UseShieldLabsResult;
  /**
   * The timeout of a call without one of its own (the provider `timeout`, else 10000 ms), read when a
   * call starts. `useIdentify()` shares calls on the timeout they run with.
   */
  readonly defaultTimeout: () => number;
}

const ShieldLabsContext = createContext<ShieldLabsContextValue | null>(null);
ShieldLabsContext.displayName = 'ShieldLabsContext';

function loadOptionsOf(
  publicKey: string,
  environment: LoadOptions['environment'],
  scriptUrl: string | undefined,
  timeout: number | undefined,
): LoadOptions {
  const options: LoadOptions = { publicKey };
  if (environment !== undefined) options.environment = environment;
  if (scriptUrl !== undefined) options.scriptUrl = scriptUrl;
  if (timeout !== undefined) options.timeout = timeout;
  return options;
}

function warnCheckOnLoad(error: unknown): void {
  // A background check that is skipped or times out is normal. Invalid options are a mistake to fix.
  if (error instanceof ShieldLabsError && error.code === 'invalid_options') {
    console.warn('[ShieldLabs] checkOnLoad: ' + error.message);
  }
}

/**
 * Loads the ShieldLabs agent once, after the first render in the browser (or once `load()` is called
 * with `autoLoad={false}`), and gives the components below it `useShieldLabs()` and `useIdentify()`.
 * Renders only its children. Nothing runs during server-side rendering.
 */
export function ShieldLabsProvider(props: ShieldLabsProviderProps): ReactElement {
  const { publicKey, environment, scriptUrl, timeout, autoLoad, checkOnLoad = false, children } = props;
  const loadsByItself = autoLoad !== false;
  const key = keyOf(loadOptionsOf(publicKey, environment, scriptUrl, timeout));

  // Created once per provider. Creating it touches nothing: the agent loads in the effect below.
  const [loader] = useState(() =>
    createAgentLoader(loadOptionsOf(publicKey, environment, scriptUrl, timeout), loadsByItself),
  );
  const [loadState, setLoadState] = useState<LoadState>(() => ({ key, status: 'loading', error: null }));
  const checkedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = loader.subscribe(setLoadState);
    loader.update(loadOptionsOf(publicKey, environment, scriptUrl, timeout), loadsByItself);
    // No state updates after unmount: the loader stops reporting to this provider.
    return unsubscribe;
  }, [loader, publicKey, environment, scriptUrl, timeout, loadsByItself]);

  // A state of older options means the agent for the current options is still loading.
  const current = loadState.key === key ? loadState : null;
  const status: ShieldLabsStatus = current ? current.status : 'loading';
  const error = current ? current.error : null;

  const checkEnabled = checkOnLoad === true || isObject(checkOnLoad);
  const checkUserId = isObject(checkOnLoad) ? checkOnLoad.userId : undefined;

  useEffect(() => {
    if (status !== 'ready' || !checkEnabled || checkedRef.current) return;
    checkedRef.current = true;
    const checkOptions: IdentifyOptions = checkUserId === undefined ? {} : { userId: checkUserId };
    // A call for the same User HID that is still running already identifies the visit, and the agent
    // runs one identification at a time per User HID.
    if (loader.isRunning(userIdOf(checkOptions))) return;
    loader.check(checkOptions).then(ignore, warnCheckOnLoad);
  }, [loader, status, checkEnabled, checkUserId]);

  const shieldLabs = useMemo<UseShieldLabsResult>(
    () => ({
      status,
      error,
      identify: loader.identify,
      check: loader.check,
      load: loader.load,
      getAgent: loader.getAgent,
    }),
    [loader, status, error],
  );
  const value = useMemo<ShieldLabsContextValue>(
    () => ({ shieldLabs, defaultTimeout: loader.defaultTimeout }),
    [loader, shieldLabs],
  );

  return createElement(ShieldLabsContext.Provider, { value }, children);
}

/** The provider value, or an error that names the calling hook when there is no provider. */
export function useShieldLabsContext(hook: string): ShieldLabsContextValue {
  const value = useContext(ShieldLabsContext);
  if (value === null) {
    throw new Error(
      '[ShieldLabs] ' +
        hook +
        '() must be called inside <ShieldLabsProvider>. Render <ShieldLabsProvider publicKey="..."> above the component that calls it.',
    );
  }
  return value;
}

/**
 * The status of the ShieldLabs agent in the closest {@link ShieldLabsProvider}, its `identify()` and
 * `check()`, `load()` for deferred loading and `getAgent()`.
 * Throws when there is no provider above the component.
 */
export function useShieldLabs(): UseShieldLabsResult {
  return useShieldLabsContext('useShieldLabs').shieldLabs;
}
