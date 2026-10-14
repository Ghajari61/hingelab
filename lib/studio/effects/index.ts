/**
 * Live Effects: a stack of non-destructive path operations on a path, shape or text node. The node
 * keeps its own geometry; `nodePaths` (geom.ts) shows, hits, measures and exports the stack's output.
 * Every effect works in the node's local coordinates and is pure: same input and parameters, same output.
 */
import { HINGE_VARIANTS } from "@/lib/hinge/presets";
import { DEFAULTS as HINGE } from "@/lib/hinge/defaults";
import { newId } from "../doc";
import { nodeBasePaths, transformSubpaths } from "../geom";
import type { EffectKind, EffectParamsMap, LiveEffect, Mat, SceneNode, Subpath, Units, Vec } from "../types";
import { applyCorners } from "./corners";
import { applyDistort } from "./distort";
import { applyMirror, applyRotateCopies, boxOf } from "./copies";
import { applyHatches } from "./hatches";
import { applyInterpolate } from "./interpolate";
import { applyLiveBoolean } from "./liveBoolean";
import { applyLivingHinge } from "./livingHinge";
import { measureGuides, type EffectGuides } from "./measureSegments";
import { EFFECT_META, EFFECT_ORDER } from "./meta";
import { applyOffset } from "./offset";
import { applyRoughen } from "./roughen";
import { applyPowerStroke, applyTaperStroke, powerDrag, powerHandles, powerOutline } from "./stroke";
import { applyBend, applyEnvelope, applyPatternAlongPath, bendDrag, bendGuide, bendHandles, bendOutline, envelopeCorners, envelopeDrag, envelopeHandles, envelopeOutline } from "./warp";

export type { EffectGuides } from "./measureSegments";

export interface EffectDef<K extends EffectKind> {
  label: string;
  description: string;
  /** Extra words for the command palette. */
  keywords: string;
  /** Starting parameters; some depend on the geometry the effect receives (centres, axes). */
  defaults(input: Subpath[]): EffectParamsMap[K];
  presets?: { name: string; params: Partial<EffectParamsMap[K]> }[];
  apply(subs: Subpath[], params: EffectParamsMap[K], node: SceneNode): Subpath[];
  /** On-canvas handles in object coordinates, for the geometry the effect receives. */
  handles?(params: EffectParamsMap[K], input: Subpath[]): Vec[];
  /** The parameters that put handle `index` at `at` (object coordinates). */
  drag?(params: EffectParamsMap[K], index: number, at: Vec, input: Subpath[]): Partial<EffectParamsMap[K]>;
  /** Lines drawn with the handles (guide curve, frame), object coordinates. */
  outline?(params: EffectParamsMap[K], input: Subpath[]): Subpath[];
  /** Canvas-only marks (never output) for the effect's input in page coordinates. */
  guides?(page: Subpath[], params: EffectParamsMap[K], units: Units): EffectGuides;
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
  patternAlongPath: {
    ...EFFECT_META.patternAlongPath,
    defaults: () => ({ mode: "repeated", spacing: 0, normalOffset: 0, widthScale: 1, rotate90: false }),
    presets: [
      { name: "Repeated", params: { mode: "repeated", spacing: 0 } },
      { name: "Repeated, stretched to fit", params: { mode: "repeatedStretched" } },
      { name: "One copy, stretched", params: { mode: "singleStretched" } },
    ],
    apply: (subs, p) => applyPatternAlongPath(subs, p),
  },
  bend: {
    ...EFFECT_META.bend,
    defaults: (input) => ({ guide: bendGuide(input, false), widthScale: 1, widthInLength: false, vertical: false }),
    presets: [
      { name: "Keep width", params: { widthScale: 1, widthInLength: false } },
      { name: "Keep proportions", params: { widthScale: 1, widthInLength: true } },
    ],
    apply: (subs, p) => applyBend(subs, p),
    handles: (p) => bendHandles(p),
    drag: (p, k, at) => bendDrag(p, k, at),
    outline: (p) => bendOutline(p),
  },
  envelope: {
    ...EFFECT_META.envelope,
    defaults: (input) => ({ mode: "perspective", ...envelopeCorners(input) }),
    presets: [
      { name: "Perspective", params: { mode: "perspective" } },
      { name: "Bilinear (four corners)", params: { mode: "bilinear" } },
    ],
    apply: (subs, p) => applyEnvelope(subs, p),
    handles: (p) => envelopeHandles(p),
    drag: (_p, k, at) => envelopeDrag(k, at),
    outline: (p) => envelopeOutline(p),
  },
  roughen: {
    ...EFFECT_META.roughen,
    defaults: () => ({ subdivide: "length", maxSegment: 2, segments: 3, direction: "xy", maxX: 0.5, maxY: 0.5, maxNormal: 0.5, smooth: false, seed: 1 }),
    presets: [
      { name: "Subtle", params: { subdivide: "length", maxSegment: 2, direction: "normal", maxNormal: 0.2, smooth: true } },
      { name: "Torn paper", params: { subdivide: "length", maxSegment: 0.8, direction: "xy", maxX: 0.6, maxY: 0.6, smooth: false } },
      { name: "Hand-drawn", params: { subdivide: "length", maxSegment: 5, direction: "normal", maxNormal: 0.6, smooth: true } },
    ],
    apply: (subs, p) => applyRoughen(subs, p),
  },
  interpolate: {
    ...EFFECT_META.interpolate,
    defaults: () => ({ steps: 5, spacing: "time" }),
    presets: [
      { name: "3 steps", params: { steps: 3 } },
      { name: "10 steps", params: { steps: 10 } },
    ],
    apply: (subs, p) => applyInterpolate(subs, p),
  },
  taperStroke: {
    ...EFFECT_META.taperStroke,
    defaults: () => ({ width: 2, start: 20, end: 20, smoothing: 0.5 }),
    presets: [
      { name: "Leaf", params: { start: 50, end: 50, smoothing: 0.5 } },
      { name: "Brush tip", params: { start: 0, end: 40, smoothing: 0.7 } },
      { name: "Even line", params: { start: 0, end: 0 } },
    ],
    apply: (subs, p) => applyTaperStroke(subs, p),
  },
  powerStroke: {
    ...EFFECT_META.powerStroke,
    defaults: () => ({ points: [{ t: 0.1, w: 1 }, { t: 0.5, w: 3 }, { t: 0.9, w: 1 }], interpolation: "smooth" }),
    presets: [
      { name: "Swell", params: { points: [{ t: 0.1, w: 1 }, { t: 0.5, w: 3 }, { t: 0.9, w: 1 }] } },
      { name: "Thick to thin", params: { points: [{ t: 0, w: 3 }, { t: 1, w: 0.3 }] } },
    ],
    apply: (subs, p) => applyPowerStroke(subs, p),
    handles: (p, input) => powerHandles(p, input),
    drag: (p, k, at, input) => powerDrag(p, k, at, input),
    outline: (p, input) => powerOutline(p, input),
  },
  measureSegments: {
    ...EFFECT_META.measureSegments,
    defaults: () => ({ decimals: 2, prefix: "", suffix: "", showUnit: true, offset: 3, ends: "arrows", fontSize: 3 }),
    presets: [
      { name: "Arrows", params: { ends: "arrows" } },
      { name: "Ticks", params: { ends: "ticks" } },
    ],
    apply: (subs) => subs,
    guides: (page, p, units) => measureGuides(page, p, units),
  },
  liveBoolean: {
    ...EFFECT_META.liveBoolean,
    defaults: () => ({ op: "difference" }),
    apply: (subs, p) => applyLiveBoolean(subs, p),
  },
  distort: {
    ...EFFECT_META.distort,
    defaults: (input) => {
      const b = boxOf(input);
      return { mode: "pushPull", amount: 40, amplitude: 1, frequency: 5, smooth: false, random: false, seed: 1, angle: 90, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
    },
    presets: [
      { name: "Push 40%", params: { mode: "pushPull", amount: 40 } },
      { name: "Pull 40%", params: { mode: "pushPull", amount: -40 } },
      { name: "Zipper", params: { mode: "zipper", amplitude: 1, frequency: 5, smooth: false } },
      { name: "Wave", params: { mode: "zipper", amplitude: 1, frequency: 4, smooth: true } },
      { name: "Twister 90°", params: { mode: "twister", angle: 90 } },
      { name: "Twister 360°", params: { mode: "twister", angle: 360 } },
    ],
    apply: (subs, p) => applyDistort(subs, p),
    handles: (p) => (p.mode === "zipper" ? [] : [{ x: p.cx, y: p.cy }]),
    drag: (_p, _k, at) => ({ cx: at.x, cy: at.y }),
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

/** Canvas-only marks of the node's enabled effects (e.g. Measure Segments labels), in page coordinates via `world`. */
export function effectGuides(n: SceneNode, world: Mat, units: Units): EffectGuides | null {
  if (!canHaveEffects(n) || !n.effects?.length) return null;
  let subs = nodeBasePaths(n), out: EffectGuides | null = null;
  for (const e of n.effects) {
    const def = defOf(e.kind);
    if (!e.enabled || !def) continue;
    const params = { ...def.defaults(subs), ...e.params } as EffectParamsMap[EffectKind];
    try {
      if (def.guides) {
        const g = def.guides(transformSubpaths(subs, world), params, units);
        out = out ? { lines: [...out.lines, ...g.lines], labels: [...out.labels, ...g.labels] } : g;
      }
      subs = def.apply(subs, params, n);
    } catch { /* keep the input */ }
  }
  return out;
}

function located(n: SceneNode, effectId: string) {
  if (!canHaveEffects(n)) return null;
  const k = n.effects?.findIndex((e) => e.id === effectId) ?? -1;
  const e = k >= 0 ? n.effects![k] : null;
  const def = e && defOf(e.kind);
  if (!e || !def) return null;
  const input = effectInput(n, k);
  return { def, input, params: { ...def.defaults(input), ...e.params } as EffectParamsMap[EffectKind] };
}

/** On-canvas handles of effect `effectId` of the node, in object coordinates (empty when the effect has none). */
export function effectHandles(n: SceneNode, effectId: string): Vec[] {
  const l = located(n, effectId);
  try { return l?.def.handles?.(l.params, l.input) ?? []; } catch { return []; }
}

/** Lines shown with the effect's handles, in object coordinates. */
export function effectHandleOutline(n: SceneNode, effectId: string): Subpath[] {
  const l = located(n, effectId);
  try { return l?.def.outline?.(l.params, l.input) ?? []; } catch { return []; }
}

/** The parameter patch that moves handle `index` of effect `effectId` to `at` (object coordinates). */
export function effectDragPatch(n: SceneNode, effectId: string, index: number, at: Vec): Record<string, unknown> | null {
  const l = located(n, effectId);
  if (!l?.def.drag) return null;
  return l.def.drag(l.params, index, at, l.input) as Record<string, unknown>;
}

export const effectHasHandles = (kind: EffectKind) => !!defOf(kind)?.handles;

export const hasEffects = (n: SceneNode): boolean =>
  (n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone") && !!n.effects?.length;

export const canHaveEffects = (n: SceneNode): n is Extract<SceneNode, { type: "path" | "shape" | "text" | "clone" }> =>
  n.type === "path" || n.type === "shape" || n.type === "text" || n.type === "clone";
