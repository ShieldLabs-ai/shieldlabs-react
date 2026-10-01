import { describe, expect, it, vi } from 'vitest';
import { load, type IdentifyResult, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { useIdentify, useShieldLabs } from '../src';
import { createAgent, deferred } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

/** Counts the state setter calls of the package, and those made after the test unmounted. */
const updates = vi.hoisted(() => ({ total: 0, afterUnmount: 0, unmounted: false }));

// The package's own imports of React get a useState whose setter is counted. React itself and the
// testing library keep the real module.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = ((initial: unknown) => {
    const [state, setState] = actual.useState(initial);
    const countedSetState = (next: unknown): void => {
      updates.total += 1;
      if (updates.unmounted) updates.afterUnmount += 1;
      setState(next);
    };
    return [state, countedSetState];
  }) as typeof actual.useState;
  return { ...actual, useState, default: { ...actual, useState } };
});

const loadMock = vi.mocked(load);

function unmountNow(view: { unmount(): void }): void {
  view.unmount();
  updates.unmounted = true;
}

describe('after unmount', () => {
  it('the provider makes no state update when the load settles', async () => {
    Object.assign(updates, { total: 0, afterUnmount: 0, unmounted: false });
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const view = renderInProvider(() => useShieldLabs());
    unmountNow(view);

    pending.resolve(createAgent().agent);
    await flush();
    expect(updates.afterUnmount).toBe(0);
  });

  it('the provider makes no state update when a failed load settles', async () => {
    Object.assign(updates, { total: 0, afterUnmount: 0, unmounted: false });
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const view = renderInProvider(() => useShieldLabs());
    unmountNow(view);

    pending.reject(new Error('offline'));
    await flush();
    expect(updates.afterUnmount).toBe(0);
  });

  it('useIdentify() makes no state update when a running identification settles', async () => {
    Object.assign(updates, { total: 0, afterUnmount: 0, unmounted: false });
    const { agent, identify } = createAgent();
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useIdentify({ runOnMount: true }));
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    const before = updates.total;
    expect(before).toBeGreaterThan(0);

    unmountNow(view);
    running.resolve({ requestId: '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c', userId: null });
    await flush();
    expect(updates.afterUnmount).toBe(0);
  });

  it('a stale load() or getAgent() of a provider with autoLoad={false} makes no state update', async () => {
    Object.assign(updates, { total: 0, afterUnmount: 0, unmounted: false });
    const { agent } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });
    await flush();
    const { load: loadAgent, getAgent } = view.value;

    unmountNow(view);
    const waiting = getAgent();
    loadAgent();
    await expect(waiting).resolves.toBe(agent);
    await flush();
    expect(updates.afterUnmount).toBe(0);
  });

  it('a stale identify() or reset() makes no state update and still settles', async () => {
    Object.assign(updates, { total: 0, afterUnmount: 0, unmounted: false });
    const { agent } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useIdentify());
    await flush();
    const { identify, reset } = view.value;

    unmountNow(view);
    reset();
    await expect(identify()).resolves.toMatchObject({ userId: null });
    await flush();
    expect(updates.afterUnmount).toBe(0);
  });
});
