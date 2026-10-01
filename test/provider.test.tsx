import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, ShieldLabsError, type IdentifyOptions, type IdentifyResult, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { useShieldLabs } from '../src';
import { createAgent, deferred, OTHER_PUBLIC_KEY, PUBLIC_KEY, USER_HID } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

describe('ShieldLabsProvider', () => {
  it('starts in loading, loads the agent once with its options and becomes ready', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const view = renderInProvider(() => useShieldLabs(), {
      environment: 'development',
      scriptUrl: 'http://localhost:8080/snippet.js',
      timeout: 5000,
    });

    expect(view.value.status).toBe('loading');
    expect(view.value.error).toBeNull();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledWith({
      publicKey: PUBLIC_KEY,
      environment: 'development',
      scriptUrl: 'http://localhost:8080/snippet.js',
      timeout: 5000,
    });

    pending.resolve(createAgent().agent);
    await flush();
    expect(view.value.status).toBe('ready');
    expect(view.value.error).toBeNull();
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('passes only the options that are set', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    renderInProvider(() => useShieldLabs());
    await flush();
    expect(loadMock.mock.calls[0]?.[0]).toStrictEqual({ publicKey: PUBLIC_KEY });
  });

  it('goes to error with the ShieldLabsError of a failed load', async () => {
    const failure = new ShieldLabsError('load_failed', 'Could not load the agent.');
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useShieldLabs());
    expect(view.value.status).toBe('loading');
    await flush();
    expect(view.value.status).toBe('error');
    expect(view.value.error).toBe(failure);
  });

  it('wraps an unexpected failure (also a synchronous throw) in a load_failed ShieldLabsError', async () => {
    const cause = new TypeError('unexpected');
    loadMock.mockImplementation(() => {
      throw cause;
    });
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    expect(view.value.status).toBe('error');
    expect(view.value.error).toBeInstanceOf(ShieldLabsError);
    expect(view.value.error).toMatchObject({ code: 'load_failed', cause });
  });

  it.each([
    ['invalid options', new ShieldLabsError('invalid_options', 'publicKey must match ^[A-Za-z0-9_-]{1,128}$.')],
    ['a page that is not a secure context', new ShieldLabsError('unsupported_environment', 'The page is not a secure context.')],
  ])('warns once in the console for %s, also in StrictMode', async (_, failure) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useShieldLabs(), {}, { strict: true });
    await flush();
    view.rerender({});
    await flush();
    expect(view.value).toMatchObject({ status: 'error', error: failure });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[ShieldLabs] ShieldLabsProvider could not load the agent: ' + failure.message);
  });

  it.each([
    ['a failed download', new ShieldLabsError('load_failed', 'Network error.')],
    ['a load that timed out', new ShieldLabsError('timeout', 'The ShieldLabs agent did not load within 10000 ms.')],
  ])('does not warn for %s, which happens to some visitors', async (_, failure) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    expect(view.value.status).toBe('error');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when a load for older options fails after the options changed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs(), { publicKey: 'not a key' });
    view.rerender({ publicKey: PUBLIC_KEY });
    first.reject(new ShieldLabsError('invalid_options', 'publicKey must match ^[A-Za-z0-9_-]{1,128}$.'));
    await flush();
    expect(view.value.status).toBe('ready');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not load again when it renders again with the same options', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    view.rerender({});
    view.rerender({ checkOnLoad: false });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(view.value.status).toBe('ready');
  });

  it('loads again when an option changes, shows loading and ignores the older load', async () => {
    const first = deferred<ShieldLabsAgent>();
    const second = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const one = createAgent();
    const two = createAgent();
    const view = renderInProvider(() => useShieldLabs());

    view.rerender({ publicKey: OTHER_PUBLIC_KEY });
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(loadMock).toHaveBeenLastCalledWith({ publicKey: OTHER_PUBLIC_KEY });

    first.resolve(one.agent);
    await flush();
    expect(view.value.status).toBe('loading');

    second.resolve(two.agent);
    await flush();
    expect(view.value.status).toBe('ready');

    await act(() => view.value.identify());
    expect(two.identify).toHaveBeenCalledTimes(1);
    expect(one.identify).not.toHaveBeenCalled();
  });

  it.each(['loads', 'fails'] as const)(
    'stays ready when the load for older options %s after the load for the new options',
    async (outcome) => {
      const first = deferred<ShieldLabsAgent>();
      const second = deferred<ShieldLabsAgent>();
      loadMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const one = createAgent();
      const two = createAgent();
      const view = renderInProvider(() => useShieldLabs());
      view.rerender({ publicKey: OTHER_PUBLIC_KEY });

      second.resolve(two.agent);
      await flush();
      expect(view.value.status).toBe('ready');

      if (outcome === 'loads') first.resolve(one.agent);
      else first.reject(new ShieldLabsError('load_failed', 'Network error.'));
      await flush();
      expect(view.value).toMatchObject({ status: 'ready', error: null });

      await act(() => view.value.identify());
      expect(two.identify).toHaveBeenCalledTimes(1);
      expect(one.identify).not.toHaveBeenCalled();
    },
  );

  it('shows loading in the same render when an option changes after it was ready', async () => {
    loadMock.mockImplementation(() => Promise.resolve(createAgent().agent));
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    expect(view.value.status).toBe('ready');

    view.rerender({ timeout: 3000 });
    expect(view.value.status).toBe('loading');
    await flush();
    expect(view.value.status).toBe('ready');
    expect(loadMock).toHaveBeenLastCalledWith({ publicKey: PUBLIC_KEY, timeout: 3000 });
  });

  it('keeps identify, check, load and getAgent stable across renders', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs());
    const { identify, check, load: loadAgent, getAgent } = view.value;
    await flush();
    view.rerender({ checkOnLoad: false });
    expect(view.value.identify).toBe(identify);
    expect(view.value.check).toBe(check);
    expect(view.value.load).toBe(loadAgent);
    expect(view.value.getAgent).toBe(getAgent);
  });
});

describe('useShieldLabs().identify() and check()', () => {
  it('pass the options through to the agent once it is ready', async () => {
    const { agent, identify, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs());
    await flush();

    const result = await view.value.identify({ userId: USER_HID, timeout: 2000 });
    expect(result).toMatchObject({ userId: USER_HID });
    expect(identify).toHaveBeenCalledWith({ userId: USER_HID, timeout: 2000 });

    check.mockResolvedValueOnce(null);
    await expect(view.value.check()).resolves.toBeNull();
    expect(check).toHaveBeenCalledWith(undefined);
  });

  it('wait for the load instead of failing while the agent is loading', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify, check } = createAgent();
    const view = renderInProvider(() => useShieldLabs());

    const identified = view.value.identify({ userId: USER_HID });
    const checked = view.value.check();
    const settled: string[] = [];
    void identified.then(() => settled.push('identify'));
    void checked.then(() => settled.push('check'));
    await flush();
    expect(settled).toEqual([]);
    expect(identify).not.toHaveBeenCalled();

    pending.resolve(agent);
    await flush();
    await expect(identified).resolves.toMatchObject({ userId: USER_HID });
    await expect(checked).resolves.toMatchObject({ userId: null });
    expect(identify).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid_options', 'unsupported_environment'] as const)(
    'reject with the load error and do not load again after %s',
    async (code) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const failure = new ShieldLabsError(code, 'Cannot load here.');
      loadMock.mockRejectedValue(failure);
      const view = renderInProvider(() => useShieldLabs());
      await flush();

      await expect(view.value.identify()).rejects.toBe(failure);
      await expect(view.value.check()).rejects.toBe(failure);
      expect(loadMock).toHaveBeenCalledTimes(1);
      expect(view.value.status).toBe('error');
    },
  );

  it.each([
    ['a failed import', new ShieldLabsError('load_failed', 'Network error.')],
    ['a load that timed out', new ShieldLabsError('timeout', 'The ShieldLabs agent did not load within 10000 ms.')],
  ])('load the agent again after %s, and the provider becomes ready', async (_, failure) => {
    const { agent, identify } = createAgent();
    loadMock.mockRejectedValueOnce(failure).mockResolvedValueOnce(agent);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    expect(view.value.status).toBe('error');
    expect(view.value.error).toBe(failure);

    let identified: Promise<IdentifyResult> | undefined;
    act(() => {
      identified = view.value.identify();
    });
    expect(view.value.status).toBe('loading');
    expect(view.value.error).toBeNull();

    await flush();
    expect(view.value.status).toBe('ready');
    await expect(identified).resolves.toMatchObject({ userId: null });
    expect(identify).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('give up waiting for the load after the call timeout, then the provider timeout', async () => {
    vi.useFakeTimers();
    loadMock.mockReturnValue(new Promise<ShieldLabsAgent>(() => undefined));
    const view = renderInProvider(() => useShieldLabs(), { timeout: 3000 });

    const outcomes: string[] = [];
    view.value.identify({ timeout: 50 }).catch((error: unknown) => {
      outcomes.push('identify ' + (error as ShieldLabsError).code);
    });
    view.value.check().catch((error: unknown) => {
      outcomes.push('check ' + (error as ShieldLabsError).code);
    });

    await vi.advanceTimersByTimeAsync(49);
    expect(outcomes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(outcomes).toEqual(['identify timeout']);
    await vi.advanceTimersByTimeAsync(2950);
    expect(outcomes).toEqual(['identify timeout', 'check timeout']);
    expect(vi.getTimerCount()).toBe(0);
    expect(view.value.status).toBe('loading');
  });

  it('wait 10 seconds by default and leave no timer behind when the load wins', async () => {
    vi.useFakeTimers();
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValueOnce(new Promise<ShieldLabsAgent>(() => undefined));
    const view = renderInProvider(() => useShieldLabs());

    let failure: unknown;
    view.value.identify().catch((error: unknown) => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(9999);
    expect(failure).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(failure).toBeInstanceOf(ShieldLabsError);
    expect(failure).toMatchObject({ code: 'timeout', message: 'The ShieldLabs agent did not load within 10000 ms.' });

    // With other options the agent loads in time: the wait timer is cleared.
    loadMock.mockReturnValueOnce(pending.promise);
    view.rerender({ publicKey: OTHER_PUBLIC_KEY });
    const identified = view.value.identify();
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      pending.resolve(createAgent().agent);
      await vi.advanceTimersByTimeAsync(0);
    });
    await expect(identified).resolves.toMatchObject({ userId: null });
    expect(vi.getTimerCount()).toBe(0);
    expect(view.value.status).toBe('ready');
  });

  it('keep the whole call within its timeout when it waits for the load', async () => {
    vi.useFakeTimers();
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify, check } = createAgent();
    // An agent that never answers: each call rejects when the timeout it was given runs out.
    const silent = (options?: IdentifyOptions): Promise<never> =>
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new ShieldLabsError('timeout', 'The agent did not answer.'));
        }, options?.timeout ?? 60000);
      });
    identify.mockImplementation(silent);
    check.mockImplementation(silent);
    const view = renderInProvider(() => useShieldLabs(), { timeout: 8000 });

    const start = Date.now();
    let identifyFailedAt: number | undefined;
    let checkFailedAt: number | undefined;
    view.value.identify({ timeout: 3000, userId: USER_HID }).catch(() => {
      identifyFailedAt = Date.now();
    });
    view.value.check().catch(() => {
      checkFailedAt = Date.now();
    });

    // The agent loads after 2.9 seconds: the calls get what is left of their timeouts.
    await vi.advanceTimersByTimeAsync(2900);
    await act(async () => {
      pending.resolve(agent);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(identify).toHaveBeenCalledWith({ timeout: 100, userId: USER_HID });
    expect(check).toHaveBeenCalledWith({ timeout: 5100 });

    await vi.advanceTimersByTimeAsync(100);
    expect(identifyFailedAt).toBe(start + 3000);
    expect(checkFailedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(checkFailedAt).toBe(start + 8000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('give the agent what is left of the default timeout, and pass options it must reject unchanged', async () => {
    vi.useFakeTimers();
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify, check } = createAgent();
    const view = renderInProvider(() => useShieldLabs());

    const identified = view.value.identify();
    const badTimeout = view.value.identify({ timeout: -1 });
    const checked = view.value.check('not options' as unknown as IdentifyOptions);
    await vi.advanceTimersByTimeAsync(4000);
    await act(async () => {
      pending.resolve(agent);
      await vi.advanceTimersByTimeAsync(0);
    });

    await expect(identified).resolves.toMatchObject({ userId: null });
    await expect(badTimeout).resolves.toMatchObject({ userId: null });
    await expect(checked).resolves.toMatchObject({ userId: null });
    expect(identify).toHaveBeenNthCalledWith(1, { timeout: 6000 });
    expect(identify).toHaveBeenNthCalledWith(2, { timeout: -1 });
    expect(check).toHaveBeenCalledWith('not options');
  });

  it('never give the agent more than the call timeout, also when the clock is set back', async () => {
    vi.useFakeTimers();
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify } = createAgent();
    const view = renderInProvider(() => useShieldLabs(), { timeout: 5000 });

    const identified = view.value.identify();
    await vi.advanceTimersByTimeAsync(1000);
    vi.setSystemTime(Date.now() - 60000);
    await act(async () => {
      pending.resolve(agent);
      await vi.advanceTimersByTimeAsync(0);
    });
    await expect(identified).resolves.toMatchObject({ userId: null });
    expect(identify).toHaveBeenCalledWith({ timeout: 5000 });
  });

  it('settle calls made before the provider unmounts', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const view = renderInProvider(() => useShieldLabs());
    const identified = view.value.identify();
    view.unmount();

    pending.resolve(createAgent().agent);
    await flush();
    await expect(identified).resolves.toMatchObject({ userId: null });
  });
});
