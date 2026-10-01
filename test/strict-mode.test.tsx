import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, type IdentifyResult } from '@shieldlabs-ai/js';
import { useIdentify, useShieldLabs } from '../src';
import { createAgent, USER_HID } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

describe('React StrictMode (effects run twice on mount)', () => {
  it('loads the agent once and becomes ready', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs(), {}, { strict: true });
    expect(view.value.status).toBe('loading');
    await flush();
    expect(view.value.status).toBe('ready');
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('runs checkOnLoad once', async () => {
    const { agent, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: USER_HID } }, { strict: true });
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('runs runOnMount once and stores its result', async () => {
    const { agent, identify } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useIdentify({ runOnMount: true }), {}, { strict: true });
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(view.value).toMatchObject({ result: { userId: null }, isLoading: false, error: null });
  });

  it('with autoLoad={false}, loads nothing until load(), then loads once', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false }, { strict: true });
    await flush();
    expect(loadMock).not.toHaveBeenCalled();
    act(() => {
      view.value.load();
      view.value.load();
    });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(view.value.status).toBe('ready');
  });

  it('skips checkOnLoad while runOnMount identifies the same User HID', async () => {
    const { agent, check, identify } = createAgent();
    identify.mockReturnValueOnce(new Promise<IdentifyResult>(() => undefined));
    loadMock.mockResolvedValue(agent);
    renderInProvider(() => useIdentify({ runOnMount: true, userId: USER_HID }), { checkOnLoad: { userId: USER_HID } }, { strict: true });
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(check).not.toHaveBeenCalled();
  });

  it('calls load() again for a new provider mount, which @shieldlabs-ai/js memoizes', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const first = renderInProvider(() => useShieldLabs(), {}, { strict: true });
    await flush();
    first.unmount();
    renderInProvider(() => useShieldLabs(), {}, { strict: true });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(2);
  });
});
