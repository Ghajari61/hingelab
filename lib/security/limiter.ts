/** Fixed-window request counting in memory: the fallback when the shared counter is unavailable. */

export interface LimitRule {
  name: string;
  limit: number;
  windowSec: number;
}

export interface LimitResult {
  ok: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfter: number;
}

const MAX_KEYS = 10_000;

export function memoryLimiter(now: () => number = Date.now) {
  const windows = new Map<string, { count: number; reset: number }>();
  return {
    hit(key: string, rule: LimitRule): LimitResult {
      const t = now();
      let w = windows.get(key);
      if (!w || w.reset <= t) {
        if (windows.size >= MAX_KEYS) for (const [k, v] of windows) if (v.reset <= t || windows.size >= MAX_KEYS) windows.delete(k);
        w = { count: 0, reset: t + rule.windowSec * 1000 };
        windows.set(key, w);
      }
      w.count++;
      return w.count <= rule.limit ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.ceil((w.reset - t) / 1000) };
    },
    refund(key: string, amount: number) {
      const w = windows.get(key);
      if (w && w.reset > now()) w.count = Math.max(0, w.count - amount);
    },
  };
}
