/**
 * Upgrade saved settings from older versions in place.
 * Run it on the saved params BEFORE merging them over DEFAULTS, otherwise the defaults hide the
 * missing keys and old projects silently switch to slot-style cuts.
 */
export function migrate<T extends Record<string, unknown>>(p: T): T {
  const q = p as Record<string, unknown>;
  if (q.pattern === "bone") q.pattern = "relief";
  if (q.stretch == null) q.stretch = 0;
  if (q.testStrip == null) q.testStrip = false;
  if (q.cutStyle == null) q.cutStyle = "line";
  if (q.slotW == null) q.slotW = 0.8;
  return p;
}
