/**
 * End closures for tube cartons, besides the tuck end (tuck.ts): the snap-lock (1-2-3) bottom, the
 * crash-lock (auto) bottom and the glued seal end. Each puts a flap on the bottom (or top) edge of
 * the four panels. Flaps named Bottom or Top are the ones seen from outside.
 */
import { dustFlap, edge, fillet, rectFlap, type Edge } from "../geom";
import { num } from "../schema";
import type { BoxParams, Face, ParamField, Pt } from "../types";
import type { TubeLayout } from "./tuck";

/** A point of a face's own frame (u along its width, v along its depth) on the sheet. */
export const onFace = (f: Face) => (a: number, b: number): Pt => [f.origin[0] + f.u[0] * a + f.v[0] * b, f.origin[1] + f.u[1] * a + f.v[1] * b];

/** A rounded slot (a stadium) w × h centred on (cx, cy) of a face's frame, on the sheet. */
export function stadium(f: Face, cx: number, cy: number, w: number, h: number): Pt[] {
  const at = onFace(f), r = Math.min(h, w) / 2, pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 12; pts.push(at(cx + w / 2 - r + r * Math.cos(a), cy + r * Math.sin(a))); }
  for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + (Math.PI * i) / 12; pts.push(at(cx - w / 2 + r + r * Math.cos(a), cy + r * Math.sin(a))); }
  return pts;
}

const endEdge = (T: TubeLayout, f: Face, end: "top" | "bottom"): Edge => (end === "top" ? T.top(f) : T.bottom(f));

/**
 * Snap-lock (1-2-3) bottom: the side flaps fold in first, then the back flap, then the front flap,
 * whose tongue pushes into the notch of the back flap and locks the bottom flat. No glue.
 */
export function snapLockBottom(T: TubeLayout, p: BoxParams) {
  const { net, l, w, t } = T, half = w / 2, tl = Math.min(w * 0.22, 25), tw = l * 0.4, k = Math.min(w * 0.12, l * 0.1);
  const front: Pt[] = [[0, 0], [k, half], [(l - tw) / 2, half], [(l - tw) / 2 + 1, half + tl], [(l + tw) / 2 - 1, half + tl], [(l + tw) / 2, half], [l - k, half], [l, 0]];
  const c = 0.6 + t, back: Pt[] = [[0, 0], [k, half + tl], [(l - tw) / 2 - c, half + tl], [(l - tw) / 2 - c, half], [(l + tw) / 2 + c, half], [(l + tw) / 2 + c, half + tl], [l - k, half + tl], [l, 0]];
  net.flap("bottom-front", "Bottom", endEdge(T, T.front, "bottom"), fillet(front, 2, [3, 4]), { parent: T.front.id, printable: true });
  net.flap("bottom-back", "Bottom flap", endEdge(T, T.back, "bottom"), back, { parent: T.back.id });
  const sd = Math.min(l / 2 - t - 0.5, w * 0.9);
  for (const s of [T.sideA, T.sideB]) net.flap(`bottom-${s.id}`, "Bottom side flap", endEdge(T, s, "bottom"), dustFlap(w, sd, Math.min(sd * 0.5, w * 0.3), num(p, "dustR", 3), t + 0.3), { parent: s.id });
  if (half + tl > T.h * 0.9) T.warnings.push("The box is short for its snap-lock bottom; make it taller or narrower.");
}

/**
 * Crash-lock (auto) bottom: four hooked flaps, each with a glue triangle beyond a 45° crease. Glued
 * at the factory (or by you) while the carton is flat, the bottom springs square when it is opened.
 */
export function autoBottom(T: TubeLayout, p: BoxParams) {
  const { net, l, w, t } = T;
  const panels: [Face, number, number][] = [[T.back, l, w], [T.sideA, w, l], [T.front, l, w], [T.sideB, w, l]];
  for (const [f, a, across] of panels) {
    const d = Math.min(across / 2 + across * 0.18, a * 0.9), hook = Math.min(a * 0.55, a - 2);
    const shape: Pt[] = [[0, 0], [0, d], [hook, d], [a - t - 0.5, Math.min(d, across * 0.12)], [a - t - 0.5, 0]];
    const isFront = f === T.front;
    const fl = net.flap(`bottom-${f.id}`, isFront ? "Bottom" : "Bottom flap", endEdge(T, f, "bottom"), shape, { parent: f.id, printable: isFront });
    const at = onFace(fl), g = Math.min(d, hook) * 0.9;
    net.crease([at(0, 0), at(g, g)]);
  }
  if (num(p, "H", 100) < w * 0.8) T.warnings.push("Auto bottoms need some height to fold flat; make the box taller.");
}

/** Seal end: an outer flap as deep as the end, an inner flap under it and two dust flaps, glued shut. */
export function sealEnd(T: TubeLayout, p: BoxParams, end: "top" | "bottom") {
  const { net, l, w, t } = T, s = Math.min(l / 6, t + 0.3);
  const outerName = end === "top" ? "Top" : "Bottom";
  const outer = end === "top" ? T.front : T.back, inner = end === "top" ? T.back : T.front;
  net.flap(`${end}-outer`, outerName, endEdge(T, outer, end), rectFlap(l, w - 0.5), { parent: outer.id, printable: true });
  net.flap(`${end}-inner`, "Inner end flap", endEdge(T, inner, end), [[s, 0], [s, w * 0.55], [l - s, w * 0.55], [l - s, 0]], { parent: inner.id });
  const dd = num(p, "dustDepth", 0) || Math.min(l * 0.42, w * 0.9);
  for (const sd of [T.sideA, T.sideB]) net.flap(`${end}-dust-${sd.id}`, "Dust flap", endEdge(T, sd, end), dustFlap(w, dd, Math.min(dd * 0.4, w * 0.3), num(p, "dustR", 3)), { parent: sd.id });
}

export const dustFields: ParamField[] = [
  { key: "dustDepth", label: "Dust flap depth", kind: "length", min: 0, max: 300, step: 0.5, help: "Leave it at 0 to size them to the box." },
  { key: "dustR", label: "Dust flap radius", kind: "length", min: 0, max: 30, step: 0.5 },
];
