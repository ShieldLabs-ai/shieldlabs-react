import { afterEach, beforeEach, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// Makes React report state updates outside act() (the testing library only sets this when test
// globals are enabled, which this project does not use).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Every test fails on an unexpected console.error, which is how React reports updates outside
// act(), errors during render and similar problems. A test that expects an error calls
// `expectConsoleError()` from `./support/console`.
beforeEach(() => {
  vi.spyOn(console, 'error');
});

afterEach(async () => {
  vi.useRealTimers();
  // Unmount what the test rendered. Imported lazily so that tests in the node environment (server-side
  // rendering, the built files) do not load the DOM testing library.
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
  const calls = vi.mocked(console.error).mock.calls;
  if (calls.length > 0) {
    throw new Error('Unexpected console.error: ' + calls.map((args) => args.map(String).join(' ')).join('\n'));
  }
});
