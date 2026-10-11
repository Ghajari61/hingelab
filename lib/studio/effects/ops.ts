/**
 * Live Effects stack edits on a draft document (each runs inside one history step): add, remove,
 * reorder, duplicate, enable, set parameters and reset. Nodes are found by id; unknown ids do nothing.
 */
import { newId } from "../doc";
import { nodePaths } from "../geom";
import { findNode } from "../scene";
import type { Document, EffectKind, EffectParamsMap, LiveEffect, SceneNode } from "../types";
import { canHaveEffects, createEffect, EFFECTS, effectInput } from "./index";

type FxNode = Extract<SceneNode, { type: "path" | "shape" | "text" }>;

function fxNode(d: Document, id: string): FxNode | null {
  const n = findNode(d.root, id);
  return n && canHaveEffects(n) ? n : null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Adds an effect of `kind` on top of the stack of every path, shape or text among `ids`; returns the new effects' ids per node. */
export function addEffect(d: Document, ids: string[], kind: EffectKind, id: () => string = newId): Map<string, string> {
  const out = new Map<string, string>();
  for (const nid of ids) {
    const n = fxNode(d, nid);
    if (!n) continue;
    const e = createEffect(kind, nodePaths(n), id);
    n.effects = [...(n.effects ?? []), clone(e)];
    out.set(nid, e.id);
  }
  return out;
}

function at(d: Document, nodeId: string, effectId: string): { n: FxNode; k: number } | null {
  const n = fxNode(d, nodeId);
  const k = n?.effects?.findIndex((e) => e.id === effectId) ?? -1;
  return n && k >= 0 ? { n, k } : null;
}

export function removeEffect(d: Document, nodeId: string, effectId: string): boolean {
  const h = at(d, nodeId, effectId);
  if (!h) return false;
  h.n.effects!.splice(h.k, 1);
  if (!h.n.effects!.length) delete h.n.effects;
  return true;
}

/** Moves an effect `delta` places along the stack (negative = earlier, applied first). */
export function moveEffect(d: Document, nodeId: string, effectId: string, delta: number): boolean {
  const h = at(d, nodeId, effectId);
  if (!h) return false;
  const list = h.n.effects!;
  const to = Math.max(0, Math.min(list.length - 1, h.k + delta));
  if (to === h.k) return false;
  const [e] = list.splice(h.k, 1);
  list.splice(to, 0, e);
  return true;
}

export function duplicateEffect(d: Document, nodeId: string, effectId: string, id: () => string = newId): string | null {
  const h = at(d, nodeId, effectId);
  if (!h) return null;
  const copy = { ...clone(h.n.effects![h.k]), id: id() };
  h.n.effects!.splice(h.k + 1, 0, copy);
  return copy.id;
}

export function setEffectEnabled(d: Document, nodeId: string, effectId: string, enabled: boolean): boolean {
  const h = at(d, nodeId, effectId);
  if (!h || h.n.effects![h.k].enabled === enabled) return false;
  h.n.effects![h.k].enabled = enabled;
  return true;
}

export function setEffectParams<K extends EffectKind>(d: Document, nodeId: string, effectId: string, patch: Partial<EffectParamsMap[K]>): boolean {
  const h = at(d, nodeId, effectId);
  if (!h) return false;
  const e = h.n.effects![h.k];
  const params = e.params as unknown as Record<string, unknown>;
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) delete params[key];
    else params[key] = clone(v);
  }
  return true;
}

/** Back to the defaults for the geometry the effect receives. */
export function resetEffect(d: Document, nodeId: string, effectId: string): boolean {
  const h = at(d, nodeId, effectId);
  if (!h) return false;
  const e = h.n.effects![h.k];
  (e as LiveEffect).params = clone(EFFECTS[e.kind].defaults(effectInput(h.n, h.k))) as never;
  return true;
}
