import { StrictMode, type ReactElement } from 'react';
import { act, render } from '@testing-library/react';
import { ShieldLabsProvider, type ShieldLabsProviderProps } from '../../src';
import { PUBLIC_KEY } from './agent';

type ProviderProps = Partial<Omit<ShieldLabsProviderProps, 'children'>>;

export interface RenderedHook<T> {
  /** The value the hook returned in the latest render. */
  readonly value: T;
  /** How many times the component that calls the hook rendered. */
  readonly renders: number;
  rerender(props?: ProviderProps): void;
  unmount(): void;
}

/**
 * Renders a component that calls `useValue()` inside a `ShieldLabsProvider` (with a placeholder
 * Public Key unless `props` sets one), optionally in `StrictMode`.
 */
export function renderInProvider<T>(
  useValue: () => T,
  props: ProviderProps = {},
  options: { strict?: boolean } = {},
): RenderedHook<T> {
  const seen: { value?: T; renders: number } = { renders: 0 };

  function Consumer(): null {
    seen.value = useValue();
    seen.renders += 1;
    return null;
  }

  const tree = (next: ProviderProps): ReactElement => {
    const provider = (
      <ShieldLabsProvider publicKey={PUBLIC_KEY} {...next}>
        <Consumer />
      </ShieldLabsProvider>
    );
    return options.strict ? <StrictMode>{provider}</StrictMode> : provider;
  };

  const utils = render(tree(props));

  return {
    get value(): T {
      if (seen.value === undefined) throw new Error('The component has not rendered.');
      return seen.value;
    },
    get renders(): number {
      return seen.renders;
    },
    rerender(next: ProviderProps = props) {
      utils.rerender(tree(next));
    },
    unmount() {
      utils.unmount();
    },
  };
}

/** Lets pending promises settle and React apply the updates they cause. Needs real timers. */
export async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
