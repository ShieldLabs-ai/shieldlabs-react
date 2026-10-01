import { vi } from 'vitest';

/** Silences console.error for this test and returns the calls it received so far and later. */
export function expectConsoleError(): unknown[][] {
  const spy = vi.mocked(console.error);
  spy.mockImplementation(() => undefined);
  return spy.mock.calls;
}

/** Forgets the console.error calls of this test (after asserting on them). */
export function clearConsoleError(): void {
  vi.mocked(console.error).mockClear();
}
