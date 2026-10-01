import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, ShieldLabsError, type IdentifyOptions, type IdentifyResult, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { useIdentify, type UseIdentifyOptions } from '../src';
import { createAgent, deferred, OTHER_USER_HID, USER_HID } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

/** Renders `useIdentify(options)` in a provider whose agent has loaded. */
async function renderReady(options?: UseIdentifyOptions) {
  const fake = createAgent();
  loadMock.mockResolvedValue(fake.agent);
  const view = renderInProvider(() => useIdentify(options));
  await flush();
  return { ...fake, view };
}

describe('useIdentify()', () => {
  it('starts idle and does not identify on mount by default', async () => {
    const { view, identify } = await renderReady();
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: null });
    expect(identify).not.toHaveBeenCalled();
  });

  it('identify() shows loading, then stores and resolves the result', async () => {
    const { view, identify } = await renderReady();
    let identified: Promise<IdentifyResult | null> | undefined;
    act(() => {
      identified = view.value.identify();
    });
    expect(view.value.isLoading).toBe(true);

    await flush();
    const result = await identified;
    expect(result).toEqual({ requestId: expect.any(String) as string, userId: null });
    expect(view.value).toMatchObject({ result, isLoading: false, error: null });
    expect(identify).toHaveBeenCalledTimes(1);
    expect(identify).toHaveBeenCalledWith({});
  });

  it('passes the userId of the hook through', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    await act(() => view.value.identify());
    expect(identify).toHaveBeenCalledWith({ userId: USER_HID });
    expect(view.value.result).toMatchObject({ userId: USER_HID });
  });

  it('lets a userId passed to identify() override the hook option, and keeps other options', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    await act(() => view.value.identify({ userId: OTHER_USER_HID }));
    expect(identify).toHaveBeenLastCalledWith({ userId: OTHER_USER_HID });

    await act(() => view.value.identify({ timeout: 2500 }));
    expect(identify).toHaveBeenLastCalledWith({ timeout: 2500, userId: USER_HID });

    const anonymous = await renderReady();
    await act(() => anonymous.view.value.identify({ userId: OTHER_USER_HID }));
    expect(anonymous.identify).toHaveBeenLastCalledWith({ userId: OTHER_USER_HID });
  });

  it('lets a userId key set to undefined or null override the hook option: both identify anonymously', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    await act(() => view.value.identify({ userId: undefined }));
    expect(identify).toHaveBeenLastCalledWith({});
    expect(view.value.result).toMatchObject({ userId: null });

    // null from plain JavaScript: anonymous as well, and no null reaches the agent.
    await act(() => view.value.identify({ userId: null as unknown as string, timeout: 2500 }));
    expect(identify).toHaveBeenLastCalledWith({ timeout: 2500 });
    expect(view.value.result).toMatchObject({ userId: null });

    // Only options without the key use the User HID of the hook.
    await act(() => view.value.identify({}));
    expect(identify).toHaveBeenLastCalledWith({ userId: USER_HID });
    expect(view.value.result).toMatchObject({ userId: USER_HID });
  });

  it('passes options that are not an object to the agent unchanged, so that it can reject them', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    const notOptions = 'not options' as unknown as IdentifyOptions;
    await act(() => view.value.identify(notOptions));
    expect(identify).toHaveBeenLastCalledWith('not options');

    await act(() => view.value.identify(null as unknown as IdentifyOptions));
    expect(identify).toHaveBeenLastCalledWith({ userId: USER_HID });
  });

  it('stores a failure in error and resolves null instead of rejecting', async () => {
    const { view, identify } = await renderReady();
    const failure = new ShieldLabsError('not_initialized', 'The agent did not start an identification.');
    identify.mockRejectedValueOnce(failure);

    let outcome: IdentifyResult | null | undefined;
    await act(async () => {
      outcome = await view.value.identify();
    });
    expect(outcome).toBeNull();
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: failure });
  });

  it('wraps an unexpected failure in a ShieldLabsError', async () => {
    const { view, identify } = await renderReady();
    const cause = new Error('unexpected');
    identify.mockRejectedValueOnce(cause);

    let outcome: IdentifyResult | null | undefined;
    await act(async () => {
      outcome = await view.value.identify();
    });
    expect(outcome).toBeNull();
    expect(view.value.error).toBeInstanceOf(ShieldLabsError);
    expect(view.value.error).toMatchObject({ code: 'not_initialized', cause });
  });

  it('leaves no unhandled rejection when a failed identify() is not awaited', async () => {
    const { view, identify } = await renderReady();
    identify.mockRejectedValueOnce(new ShieldLabsError('timeout', 'The agent did not answer.'));
    act(() => {
      void view.value.identify();
    });
    await flush();
    expect(view.value.error).toMatchObject({ code: 'timeout' });
  });

  it('clears the previous result and error while a new identification runs', async () => {
    const { view, identify } = await renderReady();
    await act(() => view.value.identify());
    expect(view.value.result).not.toBeNull();

    const pending = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(pending.promise);
    act(() => {
      void view.value.identify();
    });
    expect(view.value).toMatchObject({ result: null, isLoading: true, error: null });

    pending.resolve({ requestId: '0b9f8e7d-6c5b-4a39-8281-7f6e5d4c3b2a', userId: null });
    await flush();
    expect(view.value.result).toEqual({ requestId: '0b9f8e7d-6c5b-4a39-8281-7f6e5d4c3b2a', userId: null });

    identify.mockRejectedValueOnce(new ShieldLabsError('timeout', 'The agent did not answer.'));
    await act(() => view.value.identify());
    expect(view.value.error).not.toBeNull();
    const next = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(next.promise);
    act(() => {
      void view.value.identify();
    });
    expect(view.value).toMatchObject({ result: null, isLoading: true, error: null });
    next.resolve({ requestId: '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d', userId: null });
    await flush();
  });

  it('keeps the state of the latest call when an earlier one settles later', async () => {
    const { view, identify } = await renderReady();
    const slow = deferred<IdentifyResult>();
    const fast = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    let first: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.identify();
      // Another timeout: a separate identification, not the running one.
      void view.value.identify({ timeout: 5000 });
    });
    await flush();
    expect(identify).toHaveBeenCalledTimes(2);
    fast.resolve({ requestId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', userId: null });
    await flush();
    expect(view.value.result?.requestId).toBe('1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f');

    slow.resolve({ requestId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', userId: null });
    await flush();
    await expect(first).resolves.toMatchObject({ requestId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a' });
    expect(view.value.result?.requestId).toBe('1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f');
  });

  it('reset() clears result and error, and a running call no longer updates the state', async () => {
    const { view, identify } = await renderReady();
    identify.mockRejectedValueOnce(new ShieldLabsError('timeout', 'The agent did not answer.'));
    await act(() => view.value.identify());
    expect(view.value.error).not.toBeNull();

    act(() => {
      view.value.reset();
    });
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: null });

    const pending = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(pending.promise);
    let identified: Promise<IdentifyResult | null> | undefined;
    act(() => {
      identified = view.value.identify();
    });
    act(() => {
      view.value.reset();
    });
    pending.resolve({ requestId: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b', userId: null });
    await flush();
    await expect(identified).resolves.toMatchObject({ requestId: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b' });
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: null });
  });

  it('keeps identify and reset stable, and makes a new identify when userId changes', async () => {
    const fake = createAgent();
    loadMock.mockResolvedValue(fake.agent);
    let options: UseIdentifyOptions = { userId: USER_HID };
    const view = renderInProvider(() => useIdentify(options));
    await flush();
    const { identify, reset } = view.value;

    view.rerender();
    expect(view.value.identify).toBe(identify);
    expect(view.value.reset).toBe(reset);

    options = { userId: OTHER_USER_HID };
    view.rerender();
    expect(view.value.identify).not.toBe(identify);
    expect(view.value.reset).toBe(reset);
    await act(() => view.value.identify());
    expect(fake.identify).toHaveBeenCalledWith({ userId: OTHER_USER_HID });
  });

  it('waits for the provider to load when called before the agent is ready', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify } = createAgent();
    const view = renderInProvider(() => useIdentify());

    let identified: Promise<IdentifyResult | null> | undefined;
    act(() => {
      identified = view.value.identify();
    });
    expect(view.value.isLoading).toBe(true);
    expect(identify).not.toHaveBeenCalled();

    pending.resolve(agent);
    await flush();
    await expect(identified).resolves.toMatchObject({ userId: null });
    expect(view.value.isLoading).toBe(false);
  });

  it('reports the load error when the agent cannot load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new ShieldLabsError('unsupported_environment', 'Not a secure context.');
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useIdentify({ runOnMount: true }));
    await flush();
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: failure });
    await act(async () => {
      expect(await view.value.identify()).toBeNull();
    });
  });
});

describe('useIdentify() while an identification runs', () => {
  it('returns the running call for a second call with the same User HID and timeout (a double submit)', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);

    let first: Promise<IdentifyResult | null> | undefined;
    let second: Promise<IdentifyResult | null> | undefined;
    let third: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.identify();
      second = view.value.identify();
      // The User HID of the hook, passed explicitly: the same identification.
      third = view.value.identify({ userId: USER_HID });
    });
    expect(second).toBe(first);
    expect(third).toBe(first);
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(view.value.isLoading).toBe(true);

    const result = { requestId: '8b9c0d1e-2f3a-4b4c-9d5e-6f7a8b9c0d1e', userId: USER_HID };
    running.resolve(result);
    await flush();
    await expect(first).resolves.toBe(result);
    await expect(second).resolves.toBe(result);
    expect(view.value).toMatchObject({ result, isLoading: false, error: null });
  });

  it('starts another identification for another User HID or another timeout', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));
    act(() => {
      void view.value.identify();
      void view.value.identify({ userId: OTHER_USER_HID });
      void view.value.identify({ timeout: 2000 });
      void view.value.identify({ timeout: 2000 });
    });
    await flush();
    expect(identify).toHaveBeenCalledTimes(3);
    expect(identify.mock.calls.map(([options]) => options)).toEqual([
      { userId: USER_HID },
      { userId: OTHER_USER_HID },
      { timeout: 2000, userId: USER_HID },
    ]);
  });

  it('shares on the effective User HID: a userId key set to undefined or null is an anonymous call', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));

    let forUser: Promise<IdentifyResult | null> | undefined;
    let anonymous: Promise<IdentifyResult | null> | undefined;
    let alsoAnonymous: Promise<IdentifyResult | null> | undefined;
    let againForUser: Promise<IdentifyResult | null> | undefined;
    act(() => {
      forUser = view.value.identify();
      anonymous = view.value.identify({ userId: undefined });
      alsoAnonymous = view.value.identify({ userId: null as unknown as string });
      againForUser = view.value.identify({});
    });
    expect(anonymous).not.toBe(forUser);
    expect(alsoAnonymous).toBe(anonymous);
    expect(againForUser).toBe(forUser);
    await flush();
    expect(identify.mock.calls.map(([options]) => options)).toEqual([{ userId: USER_HID }, {}]);

    // In a hook without a User HID, identify() is an anonymous call too.
    const withoutUser = await renderReady();
    withoutUser.identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));
    let first: Promise<IdentifyResult | null> | undefined;
    let withNull: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = withoutUser.view.value.identify();
      withNull = withoutUser.view.value.identify({ userId: null as unknown as string });
    });
    expect(withNull).toBe(first);
    await flush();
    expect(withoutUser.identify).toHaveBeenCalledTimes(1);
    expect(withoutUser.identify).toHaveBeenCalledWith({});
  });

  it('counts a call without a timeout as one with the default of 10000 ms', async () => {
    const { view, identify } = await renderReady({ userId: USER_HID });
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);

    let first: Promise<IdentifyResult | null> | undefined;
    let second: Promise<IdentifyResult | null> | undefined;
    let third: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.identify();
      second = view.value.identify({ timeout: 10000 });
      third = view.value.identify({ userId: USER_HID, timeout: 10000 });
    });
    expect(second).toBe(first);
    expect(third).toBe(first);
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    // The agent gets the options of the first call; without a timeout it applies the same default.
    expect(identify).toHaveBeenCalledWith({ userId: USER_HID });

    const result = { requestId: 'cf3a4b5c-6d7e-4f80-9b9c-0d1e2f3a4b5c', userId: USER_HID };
    running.resolve(result);
    await flush();
    await expect(first).resolves.toBe(result);
    expect(view.value).toMatchObject({ result, isLoading: false, error: null });
  });

  it('counts a call without a timeout as one with the provider timeout', async () => {
    const fake = createAgent();
    loadMock.mockResolvedValue(fake.agent);
    const view = renderInProvider(() => useIdentify(), { timeout: 4000 });
    await flush();
    fake.identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));

    let first: Promise<IdentifyResult | null> | undefined;
    let second: Promise<IdentifyResult | null> | undefined;
    let other: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.identify({ timeout: 4000 });
      second = view.value.identify();
      // 10000 ms is not the timeout this provider gives a call, so it is another identification.
      other = view.value.identify({ timeout: 10000 });
    });
    expect(second).toBe(first);
    expect(other).not.toBe(first);
    await flush();
    expect(fake.identify.mock.calls.map(([options]) => options)).toEqual([{ timeout: 4000 }, { timeout: 10000 }]);
  });

  it('reads the provider timeout when a call starts', async () => {
    const fake = createAgent();
    loadMock.mockResolvedValue(fake.agent);
    const view = renderInProvider(() => useIdentify(), { timeout: 4000 });
    await flush();
    fake.identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));
    const { identify } = view.value;
    let first: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = identify();
    });

    view.rerender({ timeout: 6000 });
    await flush();
    expect(view.value.identify).toBe(identify);
    let later: Promise<IdentifyResult | null> | undefined;
    let sameTimeout: Promise<IdentifyResult | null> | undefined;
    act(() => {
      // Runs with 6000 ms now: another identification.
      later = identify();
      // The running call runs with 4000 ms.
      sameTimeout = identify({ timeout: 4000 });
    });
    expect(later).not.toBe(first);
    expect(sameTimeout).toBe(first);
    await flush();
    expect(fake.identify).toHaveBeenCalledTimes(2);
  });

  it('never shares a call whose timeout @shieldlabs-ai/js rejects with one that can succeed', async () => {
    const { view, identify } = await renderReady();
    identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));
    let first: Promise<IdentifyResult | null> | undefined;
    const others: Promise<IdentifyResult | null>[] = [];
    act(() => {
      first = view.value.identify();
      others.push(view.value.identify({ timeout: '10000' as unknown as number }));
      others.push(view.value.identify({ timeout: null as unknown as number }));
    });
    for (const other of others) expect(other).not.toBe(first);
    await flush();
    expect(identify).toHaveBeenCalledTimes(3);
  });

  it('shares calls within one hook only', async () => {
    const fake = createAgent();
    loadMock.mockResolvedValue(fake.agent);
    const view = renderInProvider(() => ({ one: useIdentify(), two: useIdentify() }));
    await flush();
    fake.identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));

    let first: Promise<IdentifyResult | null> | undefined;
    let second: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.one.identify();
      second = view.value.two.identify();
    });
    expect(second).not.toBe(first);
    await flush();
    expect(fake.identify).toHaveBeenCalledTimes(2);
  });

  it('starts a new identification once the running one has settled, also after a failure', async () => {
    const { view, identify } = await renderReady();
    await act(() => view.value.identify());
    identify.mockRejectedValueOnce(new ShieldLabsError('timeout', 'The agent did not answer.'));
    await act(() => view.value.identify());
    await act(() => view.value.identify());
    expect(identify).toHaveBeenCalledTimes(3);
    expect(view.value).toMatchObject({ result: { userId: null }, isLoading: false, error: null });
  });

  it('shares a call that is still waiting for the agent to load', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify } = createAgent();
    const view = renderInProvider(() => useIdentify({ runOnMount: true }));
    await flush();

    let submitted: Promise<IdentifyResult | null> | undefined;
    act(() => {
      submitted = view.value.identify();
    });
    pending.resolve(agent);
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    await expect(submitted).resolves.toMatchObject({ userId: null });
  });

  it('resolves null for every caller of a shared call that fails', async () => {
    const { view, identify } = await renderReady();
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);
    let first: Promise<IdentifyResult | null> | undefined;
    let second: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.identify();
      second = view.value.identify();
    });
    const failure = new ShieldLabsError('not_initialized', 'The agent did not start an identification.');
    running.reject(failure);
    await flush();
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: failure });
  });

  it('starts a new identification after reset()', async () => {
    const { view, identify } = await renderReady();
    const stale = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(stale.promise);
    act(() => {
      void view.value.identify();
    });
    act(() => {
      view.value.reset();
    });
    let fresh: Promise<IdentifyResult | null> | undefined;
    act(() => {
      fresh = view.value.identify();
    });
    await flush();
    expect(identify).toHaveBeenCalledTimes(2);
    const result = await fresh;
    expect(view.value).toMatchObject({ result, isLoading: false, error: null });

    stale.resolve({ requestId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f', userId: null });
    await flush();
    expect(view.value.result).toBe(result);
  });

  it('shows the outcome of a shared earlier call when it was asked for last', async () => {
    const { view, identify } = await renderReady();
    const mine = deferred<IdentifyResult>();
    const other = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(mine.promise).mockReturnValueOnce(other.promise);

    let first: Promise<IdentifyResult | null> | undefined;
    let again: Promise<IdentifyResult | null> | undefined;
    act(() => {
      first = view.value.identify({ userId: USER_HID });
      void view.value.identify({ userId: OTHER_USER_HID });
    });
    act(() => {
      again = view.value.identify({ userId: USER_HID });
    });
    expect(again).toBe(first);
    await flush();
    expect(identify).toHaveBeenCalledTimes(2);

    other.resolve({ requestId: 'ad1e2f3a-4b5c-4d6e-9f7a-8b9c0d1e2f3a', userId: OTHER_USER_HID });
    await flush();
    expect(view.value).toMatchObject({ result: null, isLoading: true });

    mine.resolve({ requestId: 'be2f3a4b-5c6d-4e7f-8a8b-9c0d1e2f3a4b', userId: USER_HID });
    await flush();
    expect(view.value).toMatchObject({ result: { userId: USER_HID }, isLoading: false, error: null });
  });

  it('never shares options that are not an object', async () => {
    const { view, identify } = await renderReady();
    const notOptions = 'not options' as unknown as IdentifyOptions;
    identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));
    act(() => {
      void view.value.identify(notOptions);
      void view.value.identify(notOptions);
    });
    await flush();
    expect(identify).toHaveBeenCalledTimes(2);
  });
});

describe('useIdentify() timeout', () => {
  it('covers the wait for the agent: resolves null with a timeout error when the agent does not load in time', async () => {
    vi.useFakeTimers();
    loadMock.mockReturnValue(new Promise<ShieldLabsAgent>(() => undefined));
    const view = renderInProvider(() => useIdentify());

    let outcome: IdentifyResult | null | undefined;
    act(() => {
      void view.value.identify({ timeout: 3000 }).then((value) => {
        outcome = value;
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(outcome).toBeUndefined();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(outcome).toBeNull();
    expect(view.value).toMatchObject({ isLoading: false, error: { code: 'timeout' } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives the agent only what is left of the call timeout after the wait', async () => {
    vi.useFakeTimers();
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify } = createAgent();
    const view = renderInProvider(() => useIdentify({ userId: USER_HID }));

    act(() => {
      void view.value.identify({ timeout: 3000 });
    });
    await act(() => vi.advanceTimersByTimeAsync(1200));
    await act(async () => {
      pending.resolve(agent);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(identify).toHaveBeenCalledWith({ timeout: 1800, userId: USER_HID });
    expect(view.value).toMatchObject({ result: { userId: USER_HID }, isLoading: false });
  });
});

describe('useIdentify({ runOnMount: true })', () => {
  it('is loading from the first render and identifies once when the agent is ready', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, identify } = createAgent();
    const view = renderInProvider(() => useIdentify({ runOnMount: true, userId: USER_HID }));

    expect(view.value.isLoading).toBe(true);
    expect(identify).not.toHaveBeenCalled();

    pending.resolve(agent);
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    // It waited for the load, so the agent gets what is left of the 10-second default timeout.
    const [agentOptions] = identify.mock.calls[0]!;
    expect(agentOptions).toStrictEqual({ userId: USER_HID, timeout: expect.any(Number) as number });
    expect(agentOptions?.timeout).toBeGreaterThan(9000);
    expect(agentOptions?.timeout).toBeLessThanOrEqual(10000);
    expect(view.value).toMatchObject({ result: { userId: USER_HID }, isLoading: false, error: null });
  });

  it('does not identify again on re-renders, option changes or provider updates', async () => {
    const fake = createAgent();
    loadMock.mockResolvedValue(fake.agent);
    let options: UseIdentifyOptions = { runOnMount: true, userId: USER_HID };
    const view = renderInProvider(() => useIdentify(options));
    await flush();
    expect(fake.identify).toHaveBeenCalledTimes(1);

    view.rerender();
    options = { runOnMount: true, userId: OTHER_USER_HID };
    view.rerender();
    view.rerender({ checkOnLoad: false });
    await flush();
    expect(fake.identify).toHaveBeenCalledTimes(1);
  });

  it('runs again for a new mount of the component', async () => {
    const fake = createAgent();
    loadMock.mockResolvedValue(fake.agent);
    const first = renderInProvider(() => useIdentify({ runOnMount: true }));
    await flush();
    first.unmount();
    renderInProvider(() => useIdentify({ runOnMount: true }));
    await flush();
    expect(fake.identify).toHaveBeenCalledTimes(2);
  });
});
