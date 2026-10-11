/**
 * Live Effects: a stack of non-destructive path operations on a path, shape or text node. The node
 * keeps its own geometry; `nodePaths` (geom.ts) shows, hits, measures and exports the stack's output.
 * Every effect works in the node's local coordinates and is pure: same input and parameters, same output.
 */
import { HINGE_VARIANTS } from "@/lib/hinge/presets";
import { DEFAULTS as HINGE } from "@/lib/hinge/defaults";
import { newId } from "../doc";
import { nodeBasePaths } from "../geom";
import type { EffectKind, EffectParamsMap, LiveEffect, SceneNode, Subpath } from "../types";
import { applyCorners } from "./corners";
import { applyMirror, applyRotateCopies, boxOf } from "./copies";
import { applyHatches } from "./hatches";
import { applyLivingHinge } from "./livingHinge";
import { EFFECT_META, EFFECT_ORDER } from "./meta";
import { applyOffset } from "./offset";

export interface EffectDef<K extends EffectKind> {
  label: string;
  description: string;
  /** Extra words for the command palette. */
  keywords: string;
  /** Starting parameters; some depend on the geometry the effect receives (centres, axes). */
  defaults(input: Subpath[]): EffectParamsMap[K];
  presets?: { name: string; params: Partial<EffectParamsMap[K]> }[];
  apply(subs: Subpath[], params: EffectParamsMap[K], node: SceneNode): Subpath[];
}

export const EFFECTS: { [K in EffectKind]: EffectDef<K> } = {
  corners: {
    ...EFFECT_META.corners,
    defaults: () => ({ mode: "fillet", radius: 2 }),
    presets: [
      { name: "Rounded 2 mm", params: { mode: "fillet", radius: 2 } },
      { name: "Chamfer 1 mm", params: { mode: "chamfer", radius: 1 } },
    ],
    apply: (subs, p) => applyCorners(subs, p),
  },
  offset: {
    ...EFFECT_META.offset,
    defaults: () => ({ distance: 1, join: "round", miterLimit: 4 }),
    apply: (subs, p) => applyOffset(subs, p),
  },
  hatches: {
    ...EFFECT_META.hatches,
    defaults: () => ({ angle: 45, spacing: 1, phase: 0, cross: false, inset: 0, keepOutline: true }),
    presets: [
      { name: "Fine 0.3 mm", params: { spacing: 0.3 } },
      { name: "Coarse 1 mm", params: { spacing: 1 } },
    ],
    apply: (subs, p) => applyHatches(subs, p),
  },
  rotateCopies: {
    ...EFFECT_META.rotateCopies,
    defaults: (input) => {
      const b = boxOf(input);
      return { count: 6, start: 0, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, fuse: false };
    },
    presets: [
      { name: "6-fold", params: { count: 6 } },
      { name: "12-fold", params: { count: 12 } },
    ],
    apply: (subs, p) => applyRotateCopies(subs, p),
  },
  mirror: {
    ...EFFECT_META.mirror,
    defaults: (input) => {
      const b = boxOf(input);
      return { axis: "vertical", x: b.maxX, y: b.maxY, x1: b.maxX, y1: b.minY, x2: b.maxX, y2: b.maxY, keepOriginal: true, fuse: false };
    },
    apply: (subs, p) => applyMirror(subs, p),
  },
  livingHinge: {
    ...EFFECT_META.livingHinge,
    defaults: () => ({
      pattern: "straight", cutStyle: HINGE.cutStyle, slit: HINGE.slit, bridge: HINGE.bridge, pitch: HINGE.pitch, slotW: HINGE.slotW,
      kerf: HINGE.K, material: HINGE.material, thickness: HINGE.T, angle: 0, margin: 0, keepOutline: true,
    }),
    presets: HINGE_VARIANTS.map((v) => ({
      name: v.name,
      params: {
        ...(v.params.slit !== undefined ? { slit: v.params.slit } : {}),
        ...(v.params.bridge !== undefined ? { bridge: v.params.bridge } : {}),
        ...(v.params.pitch !== undefined ? { pitch: v.params.pitch } : {}),
        ...(v.params.cutStyle ? { cutStyle: v.params.cutStyle } : {}),
      },
    })),
    apply: (subs, p) => applyLivingHinge(subs, p),
  },
};

export const EFFECT_KINDS = EFFECT_ORDER;

type AnyDef = EffectDef<EffectKind>;
const defOf = (kind: string): AnyDef | undefined => (EFFECTS as unknown as Record<string, AnyDef>)[kind];

/** The stack's output: each enabled effect in order on the previous one's output. A failing effect passes its input on. */
export function applyEffects(subs: Subpath[], effects: readonly LiveEffect[], node: SceneNode): Subpath[] {
  let out = subs;
  for (const e of effects) {
    const def = defOf(e.kind);
    if (!e.enabled || !def) continue;
    try {
      out = def.apply(out, { ...def.defaults(out), ...e.params } as EffectParamsMap[EffectKind], node);
    } catch {
      /* keep the input */
    }
  }
  return out;
}

/** A new effect of `kind` with defaults fitted to `input` (the geometry it will receive). */
export function createEffect(kind: EffectKind, input: Subpath[], id: () => string = newId): LiveEffect {
  return { id: id(), kind, enabled: true, params: EFFECTS[kind].defaults(input) } as LiveEffect;
}

/** What effect `index` of the node's stack receives: the base geometry through the enabled effects before it. */
export function effectInput(n: SceneNode, index: number): Subpath[] {
  const fx = canHaveEffects(n) ? n.effects ?? [] : [];
  return applyEffects(nodeBasePaths(n), fx.slice(0, Math.max(0, index)), n);
}

export const hasEffects = (n: SceneNode): boolean =>
  (n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone") && !!n.effects?.length;

export const canHaveEffects = (n: SceneNode): n is Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }> =>
  n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone";
