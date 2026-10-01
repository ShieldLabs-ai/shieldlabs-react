import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, ShieldLabsError, type IdentifyResult, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { useIdentify, useShieldLabs, type ShieldLabsProviderProps } from '../src';
import { createAgent, deferred, OTHER_PUBLIC_KEY, OTHER_USER_HID, USER_HID } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

describe('checkOnLoad', () => {
  it('runs one anonymous check() when the agent is ready with checkOnLoad', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, check, identify } = createAgent();
    renderInProvider(() => useShieldLabs(), { checkOnLoad: true });
    await flush();
    expect(check).not.toHaveBeenCalled();

    pending.resolve(agent);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({});
    expect(identify).not.toHaveBeenCalled();
  });

  it('passes the User HID of checkOnLoad={{ userId }}', async () => {
    const { agent, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: USER_HID } });
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ userId: USER_HID });
  });

  it('checks anonymously for checkOnLoad={{}}', async () => {
    const { agent, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    renderInProvider(() => useShieldLabs(), { checkOnLoad: {} });
    await flush();
    expect(check).toHaveBeenCalledWith({});
  });

  it.each([{}, { checkOnLoad: false }] satisfies Partial<ShieldLabsProviderProps>[])(
    'does not check for %o',
    async (props) => {
      const { agent, check } = createAgent();
      loadMock.mockResolvedValue(agent);
      const view = renderInProvider(() => useShieldLabs(), props);
      await flush();
      expect(view.value.status).toBe('ready');
      expect(check).not.toHaveBeenCalled();
    },
  );

  it('runs once per provider mount, whatever changes afterwards', async () => {
    const first = createAgent();
    const second = createAgent();
    loadMock.mockResolvedValueOnce(first.agent).mockResolvedValueOnce(second.agent);
    const view = renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: USER_HID } });
    await flush();
    expect(first.check).toHaveBeenCalledTimes(1);

    view.rerender({ checkOnLoad: { userId: USER_HID } });
    view.rerender({ checkOnLoad: { userId: OTHER_USER_HID } });
    view.rerender({ checkOnLoad: true, publicKey: OTHER_PUBLIC_KEY });
    await flush();
    expect(view.value.status).toBe('ready');
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(first.check).toHaveBeenCalledTimes(1);
    expect(second.check).not.toHaveBeenCalled();
  });

  it('runs once when it is turned on after the agent is ready', async () => {
    const { agent, check } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { checkOnLoad: false });
    await flush();
    expect(check).not.toHaveBeenCalled();

    view.rerender({ checkOnLoad: { userId: USER_HID } });
    await flush();
    view.rerender({ checkOnLoad: true });
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ userId: USER_HID });
  });

  it('runs when a later load succeeds after a failed one', async () => {
    const { agent, check } = createAgent();
    loadMock.mockRejectedValueOnce(new ShieldLabsError('load_failed', 'Network error.')).mockResolvedValueOnce(agent);
    const view = renderInProvider(() => useShieldLabs(), { checkOnLoad: true });
    await flush();
    expect(view.value.status).toBe('error');
    expect(check).not.toHaveBeenCalled();

    // The identify() that loads the agent again has settled by the time the check runs.
    await act(() => view.value.identify());
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('is skipped when an identify() for the same User HID is running as the agent becomes ready', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, check, identify } = createAgent();
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);
    // runOnMount waits for the agent, anonymously, like checkOnLoad={true}.
    renderInProvider(() => useIdentify({ runOnMount: true }), { checkOnLoad: true });
    await flush();

    pending.resolve(agent);
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(check).not.toHaveBeenCalled();

    // It stays skipped: checkOnLoad runs at most once per provider mount.
    running.resolve({ requestId: 'cf3a4b5c-6d7e-4f8a-9b9c-0d1e2f3a4b5c', userId: null });
    await flush();
    expect(check).not.toHaveBeenCalled();
  });

  it('is skipped when a check() for the same User HID is running', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, check } = createAgent();
    check.mockReturnValueOnce(new Promise<IdentifyResult | null>(() => undefined));
    const view = renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: USER_HID } });
    act(() => {
      void view.value.check({ userId: USER_HID });
    });

    pending.resolve(agent);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ userId: USER_HID, timeout: expect.any(Number) as number });
  });

  it('runs when the running call is for another User HID', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, check, identify } = createAgent();
    identify.mockReturnValueOnce(new Promise<IdentifyResult>(() => undefined));
    const view = renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: USER_HID } });
    act(() => {
      void view.value.identify({ userId: OTHER_USER_HID });
    });

    pending.resolve(agent);
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith({ userId: USER_HID });
  });

  it('runs when an anonymous call is running and checkOnLoad passes a User HID, and the reverse', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, check, identify } = createAgent();
    identify.mockReturnValue(new Promise<IdentifyResult>(() => undefined));
    const anonymousCall = renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: USER_HID } });
    act(() => {
      void anonymousCall.value.identify();
    });
    pending.resolve(agent);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    anonymousCall.unmount();

    loadMock.mockResolvedValue(agent);
    const userCall = renderInProvider(() => useShieldLabs(), { checkOnLoad: true });
    act(() => {
      void userCall.value.identify({ userId: USER_HID });
    });
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenLastCalledWith({});
  });

  it('ignores a check that is skipped or fails, and keeps the provider ready', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { agent, check } = createAgent();
    check.mockRejectedValueOnce(new ShieldLabsError('timeout', 'The agent did not answer.'));
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { checkOnLoad: true });
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(view.value).toMatchObject({ status: 'ready', error: null });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when the check options are invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { agent, check } = createAgent();
    check.mockRejectedValueOnce(new ShieldLabsError('invalid_options', 'userId "anonymous" is reserved.'));
    loadMock.mockResolvedValue(agent);
    renderInProvider(() => useShieldLabs(), { checkOnLoad: { userId: 'anonymous' } });
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[ShieldLabs] checkOnLoad: userId "anonymous" is reserved.');
  });
});
