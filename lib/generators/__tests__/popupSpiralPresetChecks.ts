/**
 * Shared checks for every built-in Pop-up preset switched to Spiral or Multi (2, 3 and 4 arms) the
 * way the editor switches it. Digital fit checks only: they do not replace a test cut.
 */
import { expect } from "vitest";
import * as THREE from "three";
import { POPUP, switchPattern } from "../popup";
import { mergePopup, type PopupParams } from "../popup/params";
import { popupGeometry } from "../popup/build";
import { arrangeGenerator, flatOf, genSVG } from "../output";
import { generatorScene } from "../scene3d";
import { placePoint } from "../place";
import { bboxOf, pointInContour, transform } from "../geom";
import { formHeight } from "@/lib/radialProfile";
import { flatScene } from "@/lib/three/flat";
import { assertFlatMatchesSVG } from "@/lib/three/__tests__/flatExportAssertions";
import type { Contour, GenOutput, Hardware3D, Pt } from "../types";
import { CTX } from "./ctx";

const inWood = (outer: Contour, holes: Contour[], xy: Pt) => pointInContour(xy, outer) && holes.filter((h) => pointInContour(xy, h)).length % 2 === 0;

/** A preset as the user gets it by choosing Spiral or Multi with `arms` arms in the editor. */
export function switched(id: string, kind: "spiral" | "multi", arms: number): PopupParams {
  const pr = POPUP.presets.find((v) => v.id === id)!;
  const base = mergePopup(pr.params as Record<string, unknown>);
  return switchPattern({ ...base, pattern: { ...base.pattern, arms } }, kind);
}

/** Formed strips that a support or fitting point would be inside of (at the point's plan position). */
function stripsAt(out: GenOutput) {
  return out.parts.flatMap((b) => (b.views3d ?? []).filter((v) => v.radialSurface).map((v) => ({ v, dx: v.place.x })));
}

/** Supports never pass into a formed strip, sampled along and through each support. */
export function expectSupportsClearStrips(out: GenOutput, T: number, label: string) {
  const strips = stripsAt(out);
  for (const rib of out.parts.filter((r) => /spiral-rib-/.test(r.id))) {
    const b = bboxOf([rib.outer]);
    for (let u = b.x0 + 0.01; u < b.x1; u += 0.5) for (const h of [0.01, T / 2, T - 0.01]) {
      const q = placePoint(rib.place!, u, 0, h);
      for (const { v, dx } of strips) {
        const xy: Pt = [q[0] - dx, q[1]];
        if (!inWood(v.outer, v.holes, xy)) continue;
        const z = formHeight(v.radialSurface!, xy[0], xy[1]);
        for (const dz of [0.01, T / 2, T - 0.01]) expect(inWood(rib.outer, rib.holes, [u, -z - dz]), `${label}: ${rib.id} enters the strip at u=${u.toFixed(2)}`).toBe(false);
      }
    }
  }
}

/** Supports, the base and the formed strips stay out of the fittings drawn in 3D (bulb, socket, tealight, vase). */
export function expectFittingsClear(out: GenOutput, T: number, label: string) {
  const solids = (out.hardware ?? []).filter((h): h is Extract<Hardware3D, { kind: "cylinder" | "bulb" }> => h.kind === "cylinder" || h.kind === "bulb");
  const inside = (q: [number, number, number], strip = false) => solids.find((c) => {
    // the shade ring clamps the centre disc by design; nothing else may touch the strip
    if (strip && c.kind === "cylinder" && c.metal) return false;
    const r = Math.hypot(q[0] - c.at[0], q[1] - c.at[1]);
    return c.kind === "bulb" ? Math.hypot(r, q[2] - c.at[2]) < c.r - 0.05 : r < c.r - 0.05 && q[2] > c.at[2] + 0.05 && q[2] < c.at[2] + c.h - 0.05;
  });
  if (!solids.length) return;
  // only points a fitting could reach are tested (round the centre axis of each assembly)
  const reach = Math.max(...solids.map((c) => c.r)) + 1;
  const near = (x: number, y: number) => solids.some((c) => Math.hypot(x - c.at[0], y - c.at[1]) <= reach);
  for (const part of out.parts.filter((r) => /spiral-(rib|base)/.test(r.id))) {
    const b = bboxOf([part.outer]), pl = part.place!;
    for (let u = b.x0; u <= b.x1; u += 1) for (let w = b.y0; w <= b.y1; w += 1) for (const h of [0.01, T - 0.01]) {
      const q = placePoint(pl, u, w, h);
      if (!near(q[0], q[1]) || !inWood(part.outer, part.holes, [u, w])) continue;
      const hit = inside(q);
      expect(hit, `${label}: ${part.id} meets a ${hit?.kind} at ${q.map((v) => v.toFixed(1))}`).toBeUndefined();
    }
  }
  for (const { v, dx } of stripsAt(out)) {
    for (let x = -reach; x <= reach; x += 1) for (let y = -reach; y <= reach; y += 1) {
      if (Math.hypot(x, y) > reach) continue;
      if (!inWood(v.outer, v.holes, [x, y])) continue;
      const z = formHeight(v.radialSurface!, x, y);
      for (const zz of [z + 0.01, z + T - 0.01]) {
        const hit = inside([x + dx, -y, zz], true);
        expect(hit, `${label}: the strip meets a ${hit?.kind} at ${x.toFixed(1)}, ${y.toFixed(1)}`).toBeUndefined();
      }
    }
  }
}

/** Every rim/centre slot is the tab plus the joint clearance, and every base mortise likewise. */
export function expectJointsMatch(p: PopupParams, label: string) {
  if (p.sets.count > 1) return; // nested sizes are checked through their own builds in the nested test
  const g = popupGeometry(p, CTX), a = g.cradle;
  if (!a) return;
  const T = p.T, fit = p.support.fit;
  for (const j of [...a.joints, ...a.baseJoints]) {
    const b = bboxOf([transform(j.slot, { rot: -j.angle })]);
    expect(b.x1 - b.x0, label).toBeCloseTo(3 * T + fit, 5);
    expect(b.y1 - b.y0, label).toBeCloseTo(T + fit, 5);
  }
  expect(a.joints.filter((j) => j.anchor === "rim").length, `${label}: every support has a rim anchor`).toBe(p.spiral.count);
}

/** The whole check for one preset and arm count. */
export function checkSwitchedPreset(id: string, kind: "spiral" | "multi", arms: number) {
  const label = `${id} ${kind}${kind === "multi" ? arms : ""}`;
  const p = switched(id, kind, arms), a = arrangeGenerator(POPUP, p, CTX);
  if ("error" in a.result) throw Error(`${label}: ${a.result.error}`);
  const out = a.result.out;
  expect(POPUP.check(a.params, out).filter((i) => i.level === "error").map((i) => i.message), label).toEqual([]);
  // one blank per size (nested sizes are cut as one) and the 3D strip of each
  expect(out.parts[0].views3d?.filter((v) => v.radialSurface).length, label).toBe(p.sets.count);
  const flat = flatScene(flatOf(a.lay!), p.T);
  try { assertFlatMatchesSVG(flat.group, genSVG(POPUP, a.params, a.lay!)); } finally { flat.dispose(); }
  expectSupportsClearStrips(out, p.T, label);
  expectFittingsClear(out, p.T, label);
  expectJointsMatch(a.params, label);
  // the formed mesh is finite and bounded
  const scene = generatorScene(out, p.T);
  try {
    let triangles = 0;
    scene.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute("position");
      triangles += (o.geometry.index?.count ?? pos.count) / 3;
      for (let i = 0; i < pos.count; i += 97) expect(Number.isFinite(pos.getZ(i)), label).toBe(true);
    });
    expect(triangles, label).toBeLessThan(150000 * p.sets.count);
  } finally { scene.dispose(); }
  return { p, out };
}

export const ARM_CASES = [["spiral", 2], ["multi", 2], ["multi", 3], ["multi", 4]] as const;
