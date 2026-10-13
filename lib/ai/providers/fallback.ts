import { ProviderError } from "./types";

/**
 * Runs `call` on each provider in turn until one succeeds. Stops at once when the caller cancels or a
 * provider says the next one would refuse too; otherwise the last error is thrown.
 */
export async function withFallback<P extends { id: string }, T>(
  providers: P[], call: (p: P) => Promise<T>, signal?: AbortSignal, onFail?: (p: P, e: unknown) => void,
): Promise<{ result: T; provider: P }> {
  if (!providers.length) throw new ProviderError("No AI provider is set up on this server.", "none", false);
  let last: unknown;
  for (const p of providers) {
    if (signal?.aborted) throw signal.reason ?? new Error("Cancelled");
    try {
      return { result: await call(p), provider: p };
    } catch (e) {
      last = e;
      onFail?.(p, e);
      if (signal?.aborted || (e instanceof ProviderError && !e.retry)) throw e;
    }
  }
  throw last;
}
