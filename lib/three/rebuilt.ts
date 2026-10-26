import * as THREE from "three";
import type { QuadModel } from "./QuadView";

/** A model whose explode rebuilds it: the view repaints it after each step. */
export interface RebuiltModel extends QuadModel {
  rebuilds: true;
}

/**
 * Pulls a design apart where it stands by rebuilding it at each explode value, behind one stable
 * root, so the 3D views treat it like a model that explodes in place (they frame the opened
 * model and glide with the eased slider). The closed and fully opened builds are kept, since the
 * views measure both.
 */
export function rebuiltExplode<S extends QuadModel>(build: (e: number) => S, start = 0): RebuiltModel & { current: () => S } {
  const group = new THREE.Group();
  const kept = new Map<number, S>();
  let shown: S | null = null, at = -1;
  const get = (e: number) => {
    if (e === 0 || e === 1) {
      let s = kept.get(e);
      if (!s) { s = build(e); kept.set(e, s); }
      return s;
    }
    return build(e);
  };
  const explode = (to: number) => {
    const e = Math.round(Math.min(1, Math.max(0, to)) * 1000) / 1000;
    if (e === at && shown) return;
    const next = get(e);
    if (shown && shown !== next) {
      group.remove(shown.group);
      if (![...kept.values()].includes(shown)) shown.dispose();
    }
    if (shown !== next) group.add(next.group);
    shown = next;
    at = e;
  };
  explode(start);
  return {
    group,
    rebuilds: true,
    explode,
    current: () => shown!,
    get ready() { return shown?.ready; },
    dispose: () => {
      if (shown && ![...kept.values()].includes(shown)) shown.dispose();
      for (const s of kept.values()) s.dispose();
      kept.clear();
      shown = null;
    },
  };
}
