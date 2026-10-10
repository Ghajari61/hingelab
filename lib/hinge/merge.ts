import { clone, DEFAULTS } from "./defaults";
import { migrate } from "./migrate";
import type { Params } from "./types";

/** Saved or uploaded settings over DEFAULTS. Migrating first keeps old projects on single-line cuts. */
export function mergeParams(partial?: Partial<Params> | null): Params {
  const base = clone(DEFAULTS);
  if (!partial || typeof partial !== "object") return base;
  const saved = migrate({ ...partial } as Record<string, unknown>) as Partial<Params>;
  return Object.assign(base, saved, {
    layers: Object.assign(clone(DEFAULTS.layers), saved.layers || {}),
  });
}
