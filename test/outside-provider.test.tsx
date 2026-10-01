import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { load } from '@shieldlabs-ai/js';
import { useIdentify, useShieldLabs } from '../src';
import { clearConsoleError, expectConsoleError } from './support/console';

vi.mock('@shieldlabs-ai/js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shieldlabs-ai/js')>()),
  load: vi.fn(),
}));

describe('hooks outside <ShieldLabsProvider>', () => {
  it('useShieldLabs() throws an error that names the hook and the provider', () => {
    expectConsoleError();
    expect(() => renderHook(() => useShieldLabs())).toThrow(
      '[ShieldLabs] useShieldLabs() must be called inside <ShieldLabsProvider>. Render <ShieldLabsProvider publicKey="..."> above the component that calls it.',
    );
    expect(load).not.toHaveBeenCalled();
    clearConsoleError();
  });

  it('useIdentify() throws an error that names the hook', () => {
    expectConsoleError();
    expect(() => renderHook(() => useIdentify({ runOnMount: true }))).toThrow(
      /^\[ShieldLabs\] useIdentify\(\) must be called inside <ShieldLabsProvider>\./,
    );
    expect(load).not.toHaveBeenCalled();
    clearConsoleError();
  });
});
