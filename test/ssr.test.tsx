// @vitest-environment node
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from '@shieldlabs-ai/js';
import { ShieldLabsProvider, useIdentify, useShieldLabs } from '../src';
import { PUBLIC_KEY, USER_HID } from './support/agent';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

function Status() {
  const { status, error } = useShieldLabs();
  const { isLoading, result } = useIdentify({ runOnMount: true, userId: USER_HID });
  return <p>{`status=${status} error=${String(error)} isLoading=${String(isLoading)} result=${JSON.stringify(result)}`}</p>;
}

// Records every read of `window` or `document`, including `typeof window` checks.
const touched: string[] = [];

beforeEach(() => {
  touched.length = 0;
  for (const name of ['window', 'document']) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        return undefined;
      },
    });
  }
});

afterEach(() => {
  for (const name of ['window', 'document']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('server-side rendering', () => {
  it('renders the loading state, touches no browser global and loads nothing', () => {
    const html = renderToString(
      <ShieldLabsProvider publicKey={PUBLIC_KEY} checkOnLoad={{ userId: USER_HID }}>
        <Status />
      </ShieldLabsProvider>,
    );
    expect(html).toBe('<p>status=loading error=null isLoading=true result=null</p>');
    expect(touched).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('renders with autoLoad={false} and loads nothing', () => {
    const html = renderToString(
      <ShieldLabsProvider publicKey={PUBLIC_KEY} autoLoad={false} checkOnLoad>
        <Status />
      </ShieldLabsProvider>,
    );
    expect(html).toBe('<p>status=loading error=null isLoading=true result=null</p>');
    expect(touched).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('also renders in StrictMode with every provider option set', () => {
    const html = renderToString(
      <StrictMode>
        <ShieldLabsProvider
          publicKey={PUBLIC_KEY}
          environment="development"
          scriptUrl="http://localhost:8080/snippet.js"
          timeout={5000}
          autoLoad
          checkOnLoad
        >
          <Status />
        </ShieldLabsProvider>
      </StrictMode>,
    );
    expect(html).toContain('status=loading');
    expect(touched).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});
