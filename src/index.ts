/**
 * @shieldlabs/react — thin React wrapper over @shieldlabs/js.
 * No signal-collection logic lives here.
 *
 * Status: pre-launch scaffold. Hook surface is a placeholder.
 */
import type { IdentificationResult, ShieldLabsOptions } from "@shieldlabs/js";

export type { IdentificationResult, ShieldLabsOptions };

export interface UseShieldLabsState {
  data?: IdentificationResult;
  error?: Error;
  isLoading: boolean;
}

/** Placeholder hook. Not implemented yet. */
export function useShieldLabs(_options: ShieldLabsOptions): UseShieldLabsState {
  return { isLoading: false, error: new Error("@shieldlabs/react is not published yet.") };
}
