// Compile-time checks of the public types. `npm run typecheck` verifies them; at runtime they are no-ops.
import { describe, expectTypeOf, it } from 'vitest';
import {
  ShieldLabsError,
  ShieldLabsProvider,
  useIdentify,
  useShieldLabs,
  type IdentifyOptions,
  type IdentifyResult,
  type InteractionIdentifier,
  type LoadOptions,
  type ShieldLabsAgent,
  type ShieldLabsProviderProps,
  type ShieldLabsStatus,
  type UseIdentifyOptions,
  type UseIdentifyResult,
  type UseShieldLabsResult,
} from '../src';

describe('public types', () => {
  it('give the browser only the request ID and the User HID', () => {
    expectTypeOf<keyof IdentifyResult>().toEqualTypeOf<'requestId' | 'userId'>();
    expectTypeOf<IdentifyResult['requestId']>().toEqualTypeOf<string>();
    expectTypeOf<IdentifyResult['userId']>().toEqualTypeOf<string | null>();
  });

  it('describe the provider props', () => {
    expectTypeOf<ShieldLabsProviderProps>().toExtend<LoadOptions>();
    expectTypeOf<ShieldLabsProviderProps['publicKey']>().toEqualTypeOf<string>();
    expectTypeOf<ShieldLabsProviderProps['environment']>().toEqualTypeOf<'production' | 'development' | undefined>();
    expectTypeOf<ShieldLabsProviderProps['checkOnLoad']>().toEqualTypeOf<boolean | { userId?: string } | undefined>();
    expectTypeOf<ShieldLabsProviderProps['autoLoad']>().toEqualTypeOf<boolean | undefined>();
    // @ts-expect-error publicKey is required
    const missingKey: ShieldLabsProviderProps = {};
    expectTypeOf(missingKey).not.toBeAny();
    expectTypeOf(ShieldLabsProvider).parameter(0).toEqualTypeOf<ShieldLabsProviderProps>();
  });

  it('describe useShieldLabs()', () => {
    expectTypeOf(useShieldLabs).parameters.toEqualTypeOf<[]>();
    expectTypeOf(useShieldLabs).returns.toEqualTypeOf<UseShieldLabsResult>();
    expectTypeOf<UseShieldLabsResult['status']>().toEqualTypeOf<ShieldLabsStatus>();
    expectTypeOf<ShieldLabsStatus>().toEqualTypeOf<'loading' | 'ready' | 'error'>();
    expectTypeOf<UseShieldLabsResult['error']>().toEqualTypeOf<ShieldLabsError | null>();
    expectTypeOf<UseShieldLabsResult['identify']>().toEqualTypeOf<(options?: IdentifyOptions) => Promise<IdentifyResult>>();
    expectTypeOf<UseShieldLabsResult['check']>().toEqualTypeOf<
      (options?: IdentifyOptions) => Promise<IdentifyResult | null>
    >();
    expectTypeOf<UseShieldLabsResult['load']>().toEqualTypeOf<() => void>();
    expectTypeOf<UseShieldLabsResult['getAgent']>().toEqualTypeOf<() => Promise<ShieldLabsAgent>>();
    expectTypeOf<keyof UseShieldLabsResult>().toEqualTypeOf<'status' | 'error' | 'identify' | 'check' | 'load' | 'getAgent'>();
  });

  it('re-export the agent types of @shieldlabs-ai/js for getAgent()', () => {
    expectTypeOf<ShieldLabsAgent['identifyOnInteraction']>().toEqualTypeOf<
      (target: EventTarget, options?: IdentifyOptions) => InteractionIdentifier
    >();
    expectTypeOf<InteractionIdentifier['take']>().toEqualTypeOf<() => Promise<IdentifyResult>>();
    expectTypeOf<InteractionIdentifier['dispose']>().toEqualTypeOf<() => void>();
  });

  it('describe useIdentify()', () => {
    expectTypeOf(useIdentify).parameter(0).toEqualTypeOf<UseIdentifyOptions | undefined>();
    expectTypeOf<keyof UseIdentifyOptions>().toEqualTypeOf<'userId' | 'runOnMount'>();
    expectTypeOf(useIdentify).returns.toEqualTypeOf<UseIdentifyResult>();
    expectTypeOf<keyof UseIdentifyResult>().toEqualTypeOf<'identify' | 'result' | 'isLoading' | 'error' | 'reset'>();
    expectTypeOf<UseIdentifyResult['result']>().toEqualTypeOf<IdentifyResult | null>();
    expectTypeOf<UseIdentifyResult['error']>().toEqualTypeOf<ShieldLabsError | null>();
    expectTypeOf<UseIdentifyResult['identify']>().toEqualTypeOf<
      (options?: IdentifyOptions) => Promise<IdentifyResult | null>
    >();
  });

  it('re-export the error class of @shieldlabs-ai/js', () => {
    expectTypeOf(new ShieldLabsError('timeout', 'message').code).toEqualTypeOf<
      'invalid_options' | 'unsupported_environment' | 'load_failed' | 'not_initialized' | 'timeout'
    >();
  });
});
