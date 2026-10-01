// <Activity mode="hidden"> (React 19.2 and later) keeps the state of its children but disconnects their
// effects until it is visible again. Agent loads and identifications that settle meanwhile must show up
// when the content is visible again. Skipped on React versions without <Activity>.
import * as React from 'react';
import type { ComponentType, ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, ShieldLabsError, type IdentifyResult, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { ShieldLabsProvider, useIdentify, useShieldLabs, type ShieldLabsProviderProps } from '../src';
import { createAgent, deferred, PUBLIC_KEY, USER_HID } from './support/agent';
import { flush } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

type ActivityComponent = ComponentType<{ mode: 'visible' | 'hidden'; children?: ReactNode }>;
const Activity = (React as unknown as { Activity?: ActivityComponent }).Activity;

const REQUEST_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

interface InActivity<T> {
  /** The value the hook returned in the latest render. */
  readonly value: T;
  hide(): void;
  show(): void;
}

/**
 * Renders a component that calls `useValue()` inside a provider, with an <Activity> boundary that the
 * test hides and shows: around the provider, or between the provider and the component.
 */
function renderInActivity<T>(
  useValue: () => T,
  boundary: 'around provider' | 'around component',
  props: Partial<ShieldLabsProviderProps> = {},
): InActivity<T> {
  if (!Activity) throw new Error('<Activity> needs React 19.2 or later.');
  const Boundary = Activity;
  const seen: { value?: T } = {};
  function Consumer(): null {
    seen.value = useValue();
    return null;
  }
  const tree = (hidden: boolean) => {
    const mode = hidden ? 'hidden' : 'visible';
    return boundary === 'around provider' ? (
      <Boundary mode={mode}>
        <ShieldLabsProvider publicKey={PUBLIC_KEY} {...props}>
          <Consumer />
        </ShieldLabsProvider>
      </Boundary>
    ) : (
      <ShieldLabsProvider publicKey={PUBLIC_KEY} {...props}>
        <Boundary mode={mode}>
          <Consumer />
        </Boundary>
      </ShieldLabsProvider>
    );
  };
  const utils = render(tree(false));
  return {
    get value(): T {
      if (seen.value === undefined) throw new Error('The component has not rendered.');
      return seen.value;
    },
    hide: () => {
      utils.rerender(tree(true));
    },
    show: () => {
      utils.rerender(tree(false));
    },
  };
}

describe.skipIf(!Activity)('inside a hidden <Activity>', () => {
  it('the provider becomes ready and runs checkOnLoad once when the agent loaded while it was hidden', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent, check } = createAgent();
    const view = renderInActivity(() => useShieldLabs(), 'around provider', { checkOnLoad: true });
    await flush();
    expect(view.value.status).toBe('loading');

    view.hide();
    pending.resolve(agent);
    await flush();
    expect(check).not.toHaveBeenCalled();

    view.show();
    await flush();
    expect(view.value.status).toBe('ready');
    expect(check).toHaveBeenCalledTimes(1);

    view.hide();
    view.show();
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('the provider shows a load error that happened while it was hidden', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const view = renderInActivity(() => useShieldLabs(), 'around provider');
    view.hide();
    // An error that loading again does not fix, so showing the provider does not start a new load.
    const failure = new ShieldLabsError('unsupported_environment', 'The page is not a secure context.');
    pending.reject(failure);
    await flush();

    view.show();
    await flush();
    expect(view.value).toMatchObject({ status: 'error', error: failure });
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('useIdentify() shows a result that arrived while the component was hidden', async () => {
    const { agent, identify } = createAgent();
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);
    loadMock.mockResolvedValue(agent);
    const view = renderInActivity(() => useIdentify({ runOnMount: true, userId: USER_HID }), 'around component');
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(view.value.isLoading).toBe(true);

    view.hide();
    running.resolve({ requestId: REQUEST_ID, userId: USER_HID });
    await flush();

    view.show();
    await flush();
    expect(view.value).toMatchObject({ result: { requestId: REQUEST_ID, userId: USER_HID }, isLoading: false, error: null });
    // Showing the component again is not a new mount: runOnMount does not identify again.
    expect(identify).toHaveBeenCalledTimes(1);
  });

  it('useIdentify() shows a failure that arrived while the component was hidden', async () => {
    const { agent, identify } = createAgent();
    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);
    loadMock.mockResolvedValue(agent);
    const view = renderInActivity(() => useIdentify(), 'around component');
    await flush();
    let identified: Promise<IdentifyResult | null> | undefined;
    act(() => {
      identified = view.value.identify();
    });
    await flush();

    view.hide();
    const failure = new ShieldLabsError('not_initialized', 'The agent did not start an identification.');
    running.reject(failure);
    await expect(identified).resolves.toBeNull();
    await flush();

    view.show();
    await flush();
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: failure });
  });

  it('useIdentify() applies reset() and identify() called while the component was hidden', async () => {
    const { agent, identify } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInActivity(() => useIdentify(), 'around component');
    await flush();
    await act(() => view.value.identify());
    expect(view.value.result).not.toBeNull();

    view.hide();
    act(() => {
      view.value.reset();
    });
    view.show();
    await flush();
    expect(view.value).toMatchObject({ result: null, isLoading: false, error: null });

    const running = deferred<IdentifyResult>();
    identify.mockReturnValueOnce(running.promise);
    view.hide();
    act(() => {
      void view.value.identify();
    });
    view.show();
    expect(view.value).toMatchObject({ result: null, isLoading: true, error: null });

    running.resolve({ requestId: REQUEST_ID, userId: null });
    await flush();
    expect(view.value).toMatchObject({ result: { requestId: REQUEST_ID }, isLoading: false });
  });
});
