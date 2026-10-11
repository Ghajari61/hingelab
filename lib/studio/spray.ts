/**
 * Spray tool: scatters copies or clones of the selection round the pointer, each with its own random
 * place, size and turn (seeded, so a drag is repeatable). With "no overlap" a new item is dropped when
 * its outline, grown by the gap, would touch an item already sprayed or any other object — parts for
 * a laser sheet stay apart. "Single path" unites everything sprayed into one path.
 */
import * as ClipperLib from "clipper-lib";
import type { Paths } from "clipper-lib";
import { newId } from "./doc";
import { apply, boxCenter, boxesTouch, emptyBox, flatten, invert, isEmptyBox, mul, nodePaths, nodeBox, rotateAt, scaleAt, transformSubpaths, translate, type Box } from "./geom";
import { cloneNodes } from "./links";
import { areaOfPaths, FLAT_TOL, inter, regionOf, toPath, toSubpaths, union, UNIT } from "./pathfinder";
import { duplicateNodes, locate, topLevel, transformNodes, walk, type IdFactory } from "./scene";
import type { Document, Mat, PathNode, Subpath, Vec } from "./types";

export type SprayMode = "copies" | "clones" | "single";

export interface SprayParams {
  mode: SprayMode;
  /** Brush radius, mm. */
  radius: number;
  /** Items per step (each pointer move). */
  amount: number;
  /** 0: spread evenly over the brush; 100: packed at its centre. */
  focus: number;
  /** ± size change, percent. */
  scaleVar: number;
  /** ± turn, degrees. */
  rotateVar: number;
  noOverlap: boolean;
  /** Smallest distance between items with no overlap, mm. */
  gap: number;
  seed: number;
}

export const SPRAY_DEFAULTS: SprayParams = { mode: "copies", radius: 15, amount: 2, focus: 30, scaleVar: 0, rotateVar: 0, noOverlap: false, gap: 1, seed: 1 };

export const SPRAY_PRESETS: { id: string; label: string; params: Partial<SprayParams> }[] = [
  { id: "scatter", label: "Scatter", params: { radius: 20, amount: 2, focus: 20, scaleVar: 30, rotateVar: 180, noOverlap: false } },
  { id: "parts", label: "Laser parts (no overlap)", params: { radius: 25, amount: 3, focus: 0, scaleVar: 0, rotateVar: 0, noOverlap: true, gap: 2 } },
  { id: "confetti", label: "Confetti", params: { radius: 30, amount: 4, focus: 0, scaleVar: 50, rotateVar: 180, noOverlap: true, gap: 0.5 } },
  { id: "cluster", label: "Cluster", params: { radius: 12, amount: 3, focus: 80, scaleVar: 20, rotateVar: 30, noOverlap: false } },
];

/** An object to spray: its id, the centre it is placed by, and its outline (world) for overlap tests. */
export interface SpraySource { id: string; centre: Vec; area: Paths }
export interface SprayItem { src: number; /** World transform from the source to this item. */ m: Mat; area: Paths; box: Box }
export interface Obstacle { area: Paths; box: Box }

/** Outline of world subpaths for overlap tests: closed areas plus open lines widened by 0.05 mm. */
export function outlineArea(subs: Subpath[]): Paths {
  const region = regionOf(subs);
  const lines = subs.filter((s) => !s.closed && s.nodes.length > 1).map((s) => toPath(flatten(s, FLAT_TOL)));
  if (!lines.length) return region;
  const co = new ClipperLib.ClipperOffset(2, FLAT_TOL * UNIT * 0.25);
  co.AddPaths(lines, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
  const out: Paths = [];
  co.Execute(out, 0.05 * UNIT);
  return union([region, out]);
}

const pathsBox = (p: Paths): Box => {
  const b = emptyBox();
  for (const q of p) for (const v of q) { b.minX = Math.min(b.minX, v.X / UNIT); b.minY = Math.min(b.minY, v.Y / UNIT); b.maxX = Math.max(b.maxX, v.X / UNIT); b.maxY = Math.max(b.maxY, v.Y / UNIT); }
  return b;
};
const movePaths = (p: Paths, m: Mat): Paths => p.map((q) => q.map((v) => { const r = apply(m, { x: v.X / UNIT, y: v.Y / UNIT }); return { X: Math.round(r.x * UNIT), Y: Math.round(r.y * UNIT) }; }));
/** An outline grown by `by` mm (round corners). */
export const growArea = (p: Paths, by: number): Paths => {
  if (by <= 0) return p;
  const co = new ClipperLib.ClipperOffset(2, FLAT_TOL * UNIT * 0.25);
  co.AddPaths(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: Paths = [];
  co.Execute(out, by * UNIT);
  return out;
};
const pad = (b: Box, by: number): Box => ({ minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by });

/** Sources for the selected top-level objects. */
export function spraySources(d: Document, ids: string[]): SpraySource[] {
  const out: SpraySource[] = [];
  for (const id of topLevel(d.root, ids)) {
    const l = locate(d.root, id);
    if (!l) continue;
    const box = nodeBox(l.node, l.world);
    if (isEmptyBox(box)) continue;
    out.push({ id, centre: boxCenter(box), area: outlineArea(transformSubpaths(nodePaths(l.node), l.world)) });
  }
  return out;
}

/** Every visible object's outline (no-overlap tests count them as taken space). */
export function sprayObstacles(d: Document): Obstacle[] {
  const out: Obstacle[] = [];
  walk(d.root, (l) => {
    if (l.node.hidden) return "skip";
    if (l.node.type === "group") return;
    const area = outlineArea(transformSubpaths(nodePaths(l.node), l.world));
    if (area.length) out.push({ area, box: pathsBox(area) });
  });
  return out;
}

/** One spray step at `c`: up to `amount` new items (fewer with no overlap when there is no room). */
export function sprayStep(sources: SpraySource[], c: Vec, p: SprayParams, rnd: () => number, placed: Obstacle[], obstacles: Obstacle[] = []): SprayItem[] {
  const out: SprayItem[] = [];
  if (!sources.length) return out;
  const focus = Math.max(0, Math.min(100, p.focus)) / 100;
  const tries = p.noOverlap ? 6 : 1;
  for (let k = 0; k < Math.max(1, Math.round(p.amount)); k++) {
    for (let attempt = 0; attempt < tries; attempt++) {
      const src = Math.min(sources.length - 1, Math.floor(rnd() * sources.length)), s = sources[src];
      const dist = p.radius * Math.pow(rnd(), 0.5 + 2.5 * focus), a = rnd() * Math.PI * 2;
      const scale = Math.max(0.05, 1 + (rnd() * 2 - 1) * (p.scaleVar / 100));
      const turn = (rnd() * 2 - 1) * p.rotateVar;
      const at = { x: c.x + Math.cos(a) * dist, y: c.y + Math.sin(a) * dist };
      const m = mul(translate(at.x, at.y), mul(rotateAt(turn), mul(scaleAt(scale, scale), translate(-s.centre.x, -s.centre.y))));
      const area = movePaths(s.area, m);
      const box = pathsBox(area);
      if (p.noOverlap) {
        const gap = Math.max(0, p.gap), bb = pad(box, gap);
        const near = [...placed, ...out, ...obstacles].filter((o) => boxesTouch(bb, o.box));
        if (near.length) {
          const mine = growArea(area, gap);
          if (near.some((o) => Math.abs(areaOfPaths(inter(mine, o.area))) > 0)) continue;
        }
      }
      out.push({ src, m, area, box });
      break;
    }
  }
  return out;
}

/**
 * Adds sprayed items to a draft: copies or clones right above their source, or (single path) one path
 * on the first source's layer uniting every item's outline. Returns the new ids.
 */
export function applySpray(d: Document, sources: string[], items: SprayItem[], mode: SprayMode, id: IdFactory = newId): string[] {
  if (!items.length) return [];
  if (mode !== "single") {
    const out: string[] = [];
    for (const it of items) {
      const src = sources[it.src];
      if (!locate(d.root, src)) continue;
      const [nid] = mode === "clones" ? cloneNodes(d, [src], id) : duplicateNodes(d, [src], { x: 0, y: 0 }, id);
      if (!nid) continue;
      transformNodes(d, [nid], it.m);
      out.push(nid);
    }
    return out;
  }
  const first = locate(d.root, sources[0]);
  if (!first) return [];
  const areas: Paths[] = [];
  const lines: Subpath[] = [];
  for (const it of items) {
    const l = locate(d.root, sources[it.src]);
    if (!l) continue;
    const subs = transformSubpaths(nodePaths(l.node), mul(it.m, l.world));
    const region = regionOf(subs);
    if (region.length) areas.push(region);
    lines.push(...subs.filter((s) => !s.closed && s.nodes.length > 1));
  }
  const subs = [...toSubpaths(union(areas)), ...lines];
  if (!subs.length) return [];
  const node: PathNode = { id: id(), type: "path", name: "Spray", transform: [1, 0, 0, 1, 0, 0], layer: first.node.layer, subpaths: transformSubpaths(subs, invert(first.parentWorld)) };
  first.parent.children.splice(first.parent.children.indexOf(first.node) + 1, 0, node);
  return [node.id];
}
