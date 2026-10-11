/**
 * Type menu commands on the document (mutate a draft): put text on a path or flow it into a shape and
 * back, vertical text, and the manual kerns / baseline shifts / glyph turns kept per character index
 * (all in 1/1000 em, turns in degrees). The linked object's geometry (`frame`) is filled in by
 * the link sync pass in the same undo step.
 */
import { resolveDirection } from "@/lib/letters/shape";
import { mul, nodePaths, subpathsBox, translate } from "./geom";
import { wouldCycle } from "./links";
import { findNode } from "./scene";
import { pathWalker } from "./textGeom";
import type { Document, SceneNode, TextNode } from "./types";

type Manual = "kerns" | "shifts" | "rotations";
const MANUAL: Manual[] = ["kerns", "shifts", "rotations"];

const textOf = (d: Document, id: string) => { const n = findNode(d.root, id); return n?.type === "text" ? n : null; };
const unframe = (t: TextNode) => { delete t.onPath; delete t.pathStart; delete t.pathSide; delete t.flowInto; delete t.frame; };

/** True when an object's outline can carry text (some subpath with two or more nodes). */
export const canCarryText = (n: SceneNode) => n.type !== "text" && nodePaths(n).some((s) => s.nodes.length > 1);
/** True when text can flow inside an object (some closed subpath with three or more nodes). */
export const canHoldText = (n: SceneNode) => n.type !== "text" && nodePaths(n).some((s) => s.closed && s.nodes.length > 2);

/**
 * Lays the text along `pathId`. Right-to-left text on an open path starts at its far end so it reads
 * from there. False when either object is missing or unsuitable, or the link would loop.
 */
export function putOnPath(d: Document, textId: string, pathId: string): boolean {
  const t = textOf(d, textId), src = findNode(d.root, pathId);
  if (!t || !src || !canCarryText(src) || wouldCycle(d, textId, pathId)) return false;
  const first = nodePaths(src).find((s) => s.nodes.length > 1)!;
  const keep = t.onPath === pathId ? t.pathStart : undefined;
  unframe(t);
  delete t.width;
  delete t.vertical;
  t.onPath = pathId;
  t.pathStart = keep ?? (!first.closed && resolveDirection(t.direction, t.text) === "rtl" ? 100 : 0);
  return true;
}

/** The text leaves its path as point text whose anchor is where the text started on the path. */
export function removeFromPath(d: Document, id: string): boolean {
  const t = textOf(d, id);
  if (!t?.onPath) return false;
  const sub = t.frame?.find((s) => s.nodes.length > 1);
  if (sub) {
    const w = pathWalker(sub, t.pathSide === "right");
    const p = w.at(((t.pathStart ?? 0) / 100) * w.length).p;
    t.transform = mul(t.transform, translate(p.x, p.y));
  }
  unframe(t);
  return true;
}

/** Text fills the inside of `shapeId` (its closed outlines). False when unsuitable or looping. */
export function flowIntoShape(d: Document, textId: string, shapeId: string): boolean {
  const t = textOf(d, textId), src = findNode(d.root, shapeId);
  if (!t || !src || !canHoldText(src) || wouldCycle(d, textId, shapeId)) return false;
  unframe(t);
  delete t.width;
  delete t.vertical;
  t.flowInto = shapeId;
  return true;
}

/**
 * Flowed text becomes area text as wide as the shape's box, its first line staying put when
 * `firstBaseline` (the flowed layout's, in the text's coordinates) is known.
 */
export function unflow(d: Document, id: string, firstBaseline?: number): boolean {
  const t = textOf(d, id);
  if (!t?.flowInto) return false;
  if (t.frame?.length) {
    const b = subpathsBox(t.frame);
    t.width = Math.max(1e-3, b.maxX - b.minX);
    t.transform = mul(t.transform, translate(b.minX, firstBaseline ?? b.minY + t.size));
  }
  unframe(t);
  return true;
}

/** Vertical or horizontal type for texts that are neither on a path nor flowed. Returns the ids changed. */
export function setVertical(d: Document, ids: string[], on: boolean): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const t = textOf(d, id);
    if (!t || t.onPath || t.flowInto || !!t.vertical === on) continue;
    if (on) t.vertical = true; else delete t.vertical;
    out.push(id);
  }
  return out;
}

const round = (v: number) => Math.round(v * 10) / 10;

function bump(t: TextNode, key: Manual, index: number, by: number) {
  const r = { ...(t[key] ?? {}) };
  const v = round((r[index] ?? 0) + by);
  if (v) r[index] = v; else delete r[index];
  if (Object.keys(r).length) t[key] = r; else delete t[key];
}

/** Extra space before the character at `index` (1/1000 em; negative tightens). */
export const kernAt = (t: TextNode, index: number, by: number) => bump(t, "kerns", index, by);

/** Moves the characters in [from, to) off the baseline (1/1000 em: up, or right in vertical text). */
export function shiftChars(t: TextNode, from: number, to: number, by: number) {
  for (let i = from; i < Math.max(to, from + 1); i++) bump(t, "shifts", i, by);
}

/** Turns the characters in [from, to) about their own centres (degrees, clockwise). */
export function rotateChars(t: TextNode, from: number, to: number, by: number) {
  for (let i = from; i < Math.max(to, from + 1); i++) {
    const r = { ...(t.rotations ?? {}) };
    let v = round((((r[i] ?? 0) + by) % 360 + 540) % 360 - 180);
    if (v === -180) v = 180;
    if (v) r[i] = v; else delete r[i];
    if (Object.keys(r).length) t.rotations = r; else delete t.rotations;
  }
}

export const hasManual = (t: Pick<TextNode, Manual>) => MANUAL.some((k) => Object.keys(t[k] ?? {}).length > 0);

export function clearManual(t: TextNode) { for (const k of MANUAL) delete t[k]; }

/**
 * Keeps manual settings on the same characters after the text changed from `before` to `after`:
 * indices before the edit stay, ones after it move with the text, and ones inside it are dropped.
 */
export function remapManual(t: TextNode, before: string, after: string) {
  if (!hasManual(t) || before === after) return;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  const tail = before.length - q, delta = after.length - before.length;
  for (const k of MANUAL) {
    const r = t[k];
    if (!r) continue;
    const next: Record<number, number> = {};
    for (const [key, v] of Object.entries(r)) {
      const i = Number(key);
      if (i < p) next[i] = v;
      else if (i >= tail) next[i + delta] = v;
    }
    if (Object.keys(next).length) t[k] = next; else delete t[k];
  }
}
