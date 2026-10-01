import { StrictMode, useEffect, useRef, type SyntheticEvent } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load, ShieldLabsError, type InteractionIdentifier, type ShieldLabsAgent } from '@shieldlabs-ai/js';
import { ShieldLabsProvider, useShieldLabs, type ShieldLabsProviderProps } from '../src';
import { createAgent, deferred, PUBLIC_KEY } from './support/agent';
import { flush, renderInProvider } from './support/render';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

const loadMock = vi.mocked(load);

describe('useShieldLabs().getAgent()', () => {
  it('resolves the agent that load() of @shieldlabs-ai/js resolved, once it has loaded', async () => {
    const pending = deferred<ShieldLabsAgent>();
    loadMock.mockReturnValue(pending.promise);
    const { agent } = createAgent();
    const view = renderInProvider(() => useShieldLabs());

    let resolved: ShieldLabsAgent | undefined;
    void view.value.getAgent().then((value) => {
      resolved = value;
    });
    await flush();
    expect(resolved).toBeUndefined();

    pending.resolve(agent);
    await flush();
    expect(resolved).toBe(agent);
    await expect(view.value.getAgent()).resolves.toBe(agent);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with the load error, and loads again on the next call after a failure a new load can fix', async () => {
    const { agent } = createAgent();
    const failure = new ShieldLabsError('load_failed', 'Network error.');
    loadMock.mockRejectedValueOnce(failure).mockResolvedValueOnce(agent);
    const view = renderInProvider(() => useShieldLabs());
    const first = view.value.getAgent();
    await flush();
    await expect(first).rejects.toBe(failure);
    expect(view.value.status).toBe('error');

    let again: Promise<ShieldLabsAgent> | undefined;
    act(() => {
      again = view.value.getAgent();
    });
    expect(view.value.status).toBe('loading');
    await flush();
    await expect(again).resolves.toBe(agent);
    expect(view.value.status).toBe('ready');
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('rejects with invalid options without loading again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new ShieldLabsError('invalid_options', 'publicKey must match ^[A-Za-z0-9_-]{1,128}$.');
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useShieldLabs());
    await flush();
    await expect(view.value.getAgent()).rejects.toBe(failure);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('waits until load() with autoLoad={false}, and loads nothing before', async () => {
    const { agent } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });

    let resolved: ShieldLabsAgent | undefined;
    void view.value.getAgent().then((value) => {
      resolved = value;
    });
    void view.value.getAgent();
    await flush();
    expect(resolved).toBeUndefined();
    expect(loadMock).not.toHaveBeenCalled();

    act(() => {
      view.value.load();
    });
    await flush();
    expect(resolved).toBe(agent);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('has no timeout of its own while it waits for load() with autoLoad={false}', async () => {
    vi.useFakeTimers();
    const { agent } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false, timeout: 3000 });

    let outcome: 'resolved' | 'rejected' | undefined;
    void view.value.getAgent().then(
      () => {
        outcome = 'resolved';
      },
      () => {
        outcome = 'rejected';
      },
    );
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(outcome).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      view.value.load();
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(outcome).toBe('resolved');
  });

  it('rejects with the error of the load that load() starts with autoLoad={false}', async () => {
    const failure = new ShieldLabsError('load_failed', 'Network error.');
    loadMock.mockRejectedValue(failure);
    const view = renderInProvider(() => useShieldLabs(), { autoLoad: false });
    let rejection: unknown;
    void view.value.getAgent().catch((error: unknown) => {
      rejection = error;
    });
    await flush();
    expect(loadMock).not.toHaveBeenCalled();
    expect(rejection).toBeUndefined();

    act(() => {
      view.value.load();
    });
    await flush();
    expect(rejection).toBe(failure);
    expect(view.value).toMatchObject({ status: 'error', error: failure });
  });

  it('keeps load and getAgent stable across renders', async () => {
    loadMock.mockResolvedValue(createAgent().agent);
    const view = renderInProvider(() => useShieldLabs());
    const { load: loadAgent, getAgent } = view.value;
    await flush();
    view.rerender({ checkOnLoad: true });
    await flush();
    expect(view.value.load).toBe(loadAgent);
    expect(view.value.getAgent).toBe(getAgent);
  });
});

/** Early identification before a full-page post, as the README shows it. */
function SignupForm() {
  const { getAgent } = useShieldLabs();
  const formRef = useRef<HTMLFormElement>(null);
  const handle = useRef<InteractionIdentifier | null>(null);

  useEffect(() => {
    const form = formRef.current!;
    let active = true;
    getAgent().then(
      (agent) => {
        if (active) handle.current = agent.identifyOnInteraction(form);
      },
      () => undefined,
    );
    return () => {
      active = false;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [getAgent]);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await handle.current?.take().catch(() => null);
    (form.elements.namedItem('requestId') as HTMLInputElement).value = result?.requestId ?? '';
  }

  return (
    <form ref={formRef} aria-label="signup" onSubmit={(event) => void onSubmit(event)}>
      <input type="hidden" name="requestId" data-testid="requestId" />
      <button type="submit">Sign up</button>
    </form>
  );
}

function renderForm(props: Partial<ShieldLabsProviderProps> = {}, strict = false) {
  const tree = (
    <ShieldLabsProvider publicKey={PUBLIC_KEY} {...props}>
      <SignupForm />
    </ShieldLabsProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('early identification with getAgent() and identifyOnInteraction()', () => {
  it.each([false, true])('arms the form once and fills the request ID on submit (StrictMode: %s)', async (strict) => {
    const { agent, identifyOnInteraction, handle } = createAgent();
    loadMock.mockResolvedValue(agent);
    const view = renderForm({}, strict);
    await flush();

    const form = screen.getByRole('form', { name: 'signup' });
    expect(identifyOnInteraction).toHaveBeenCalledTimes(1);
    expect(identifyOnInteraction).toHaveBeenCalledWith(form);

    fireEvent.submit(form);
    await flush();
    expect(handle.take).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId<HTMLInputElement>('requestId').value).toMatch(/^[0-9a-f-]{36}$/);

    view.unmount();
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it('submits without a request ID when the agent cannot load', async () => {
    loadMock.mockRejectedValue(new ShieldLabsError('load_failed', 'Blocked by the page.'));
    renderForm();
    await flush();
    fireEvent.submit(screen.getByRole('form', { name: 'signup' }));
    await flush();
    expect(screen.getByTestId<HTMLInputElement>('requestId').value).toBe('');
  });

  it('with autoLoad={false}, arms the form once load() has been called', async () => {
    const { agent, identifyOnInteraction } = createAgent();
    loadMock.mockResolvedValue(agent);
    function ConsentButton() {
      const { load: loadAgent } = useShieldLabs();
      return <button onClick={loadAgent}>Accept</button>;
    }
    render(
      <ShieldLabsProvider publicKey={PUBLIC_KEY} autoLoad={false}>
        <ConsentButton />
        <SignupForm />
      </ShieldLabsProvider>,
    );
    await flush();
    expect(loadMock).not.toHaveBeenCalled();
    expect(identifyOnInteraction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(identifyOnInteraction).toHaveBeenCalledTimes(1);
  });
});
