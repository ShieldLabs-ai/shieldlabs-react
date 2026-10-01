import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, ShieldLabsError, type IdentifyResult, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { useIdentify, useShieldLabs } from '../src';
import { createAgent, deferred, OTHER_PUBLIC_KEY, PUBLIC_KEY, USER_HID } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

describe('autoLoad={false}', () => {
  it.each([false, true])('loads nothing until load() is called, then loads once (StrictMode: %s)', async (strict) => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false, timeout: 5000 }, { strict });
    await flush();
    expect(loadMock).not.toHaveBeenCalled();
    expect(view.value).toMatchObject({ status: 'loading', error: null });

    // load() returns nothing: there is no promise to await.
    const loadAgent: () => unknown = view.value.load;
    let returned: unknown = 'not called';
    act(() => {
      returned = loadAgent();
    });
    expect(returned).toBeUndefined();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledWith({ publicKey: PUBLIC_KEY, timeout: 5000 });

    pending.resolve(createAgent().agent);
    await flush();
    expect(view.value.status).toBe('ready');
    act(() => {
      view.value.load();
    });
    view.rerender({ autoLoad: false, timeout: 5000 });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('loads when autoLoad becomes true', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });
    await flush();
    expect(loadMock).not.toHaveBeenCalled();

    view.rerender({ autoLoad: true });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(view.value.status).toBe('ready');
  });

  it('keeps the agent when autoLoad goes back to false', async () => {
    const { agent, identify } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    view.rerender({ autoLoad: false });
    await flush();
    expect(view.value.status).toBe('ready');
    await act(() => view.value.identify());
    expect(identify).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('loads with the options of the latest render when load() is called', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });
    view.rerender({ autoLoad: false, publicKey: OTHER_PUBLIC_KEY });
    await flush();
    expect(loadMock).not.toHaveBeenCalled();

    act(() => {
      view.value.load();
    });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledWith({ publicKey: OTHER_PUBLIC_KEY });
    expect(view.value.status).toBe('ready');
  });

  it('loads again for new options once load() has been called', async () => {
    loadMock.mockImplementation(() => Promise.resolve(createAgent().agent));
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });
    act(() => {
      view.value.load();
    });
    await flush();
    view.rerender({ autoLoad: false, publicKey: OTHER_PUBLIC_KEY });
    expect(view.value.status).toBe('loading');
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(loadMock).toHaveBeenLastCalledWith({ publicKey: OTHER_PUBLIC_KEY });
    expect(view.value.status).toBe('ready');
  });

  it('answers calls made before load() at once and loads nothing: identify() rejects, check() resolves null', async () => {
    const { agent, identify, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });
    await flush();

    await expect(view.value.identify({ userId: USER_HID })).rejects.toMatchObject({
      name: 'ShieldLabsError',
      code: 'not_initialized',
      message: expect.stringContaining('autoLoad={false}') as string,
    });
    await expect(view.value.check()).resolves.toBeNull();
    expect(loadMock).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
    expect(view.value.status).toBe('loading');
  });

  it('useIdentify().identify() resolves null with a not_initialized error before load(), then identifies after it', async () => {
    const { agent, identify } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(
      () => ({ shieldLabs: useShieldLabs(), helper: useIdentify({ userId: USER_HID }) }),
      { autoLoad: false },
    );

    let outcome: IdentifyResult | null | undefined;
    await act(async () => {
      outcome = await view.value.helper.identify();
    });
    expect(outcome).toBeNull();
    expect(view.value.helper.error).toBeInstanceOf(ShieldLabsError);
    expect(view.value.helper).toMatchObject({ result: null, isLoading: false, error: { code: 'not_initialized' } });
    expect(loadMock).not.toHaveBeenCalled();

    act(() => {
      view.value.shieldLabs.load();
    });
    await act(async () => {
      outcome = await view.value.helper.identify();
    });
    expect(outcome).toMatchObject({ userId: USER_HID });
    expect(identify).toHaveBeenCalledTimes(1);
    expect(view.value.helper).toMatchObject({ result: outcome, isLoading: false, error: null });
  });

  it('runOnMount before load() ends with a not_initialized error instead of waiting, and does not run again after load()', async () => {
    const { agent, identify } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(
      () => ({ shieldLabs: useShieldLabs(), helper: useIdentify({ runOnMount: true }) }),
      { autoLoad: false },
    );
    expect(view.value.helper.isLoading).toBe(true);
    await flush();
    expect(view.value.helper).toMatchObject({ result: null, isLoading: false, error: { code: 'not_initialized' } });
    expect(loadMock).not.toHaveBeenCalled();

    act(() => {
      view.value.shieldLabs.load();
    });
    await flush();
    expect(view.value.shieldLabs.status).toBe('ready');
    expect(identify).not.toHaveBeenCalled();
    expect(view.value.helper).toMatchObject({ result: null, isLoading: false, error: { code: 'not_initialized' } });
  });

  it('runs checkOnLoad once the agent is ready after load()', async () => {
    const { agent, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false, checkOnLoad: { userId: USER_HID } });
    await flush();
    expect(check).not.toHaveBeenCalled();

    act(() => {
      view.value.load();
    });
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ userId: USER_HID });
  });
});

describe('useShieldLabs().load()', () => {
  it('loads again after a failed load, and the status follows', async () => {
    const { agent } = createAgent();
    loadMock.mockRejectedValueOnce(new ShieldLabsError('load_failed', 'Network error.')).mockResolvedValueOnce(agent);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    expect(view.value.status).toBe('error');

    act(() => {
      view.value.load();
    });
    expect(view.value).toMatchObject({ status: 'loading', error: null });
    await flush();
    expect(view.value.status).toBe('ready');
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('does not load again after invalid options', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new ShieldLabsError('invalid_options', 'publicKey must match ^[A-Za-z0-9_-]{1,128}$.');
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    act(() => {
      view.value.load();
    });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(view.value).toMatchObject({ status: 'error', error: failure });
  });
});
