import { expect, it } from "vitest";
import * as THREE from "three";
import { POPUP, switchPattern } from "../popup";
import { mergePopup, modeDefaults, patternDefaults } from "../popup/params";
import { spiralRimMin } from "../popup/spiralSupports";
import { ACCESSORY_CLEARANCE, accessorySolids } from "../popup/hardware";
import { arrangeGenerator, buildBatch } from "../output";
import { assemblyExtentX } from "../batch3d";
import { generatorScene } from "../scene3d";
import { KEYCHAIN } from "../keychain";
import { unionShapes } from "@/lib/letters/polygon";
import { formHeight } from "@/lib/radialProfile";
import { placePoint } from "../place";
import { bboxOf, pointInContour } from "../geom";
import { checkSwitchedPreset, switched } from "./popupSpiralPresetChecks";
import type { GenOutput } from "../types";
import { CTX } from "./ctx";

it("the nested Kids Nursery Mobile builds as Spiral and Multi with 2, 3 and 4 arms", () => {
  for (const [kind, arms] of [["spiral", 2], ["multi", 2], ["multi", 3], ["multi", 4]] as const) {
    const { out } = checkSwitchedPreset("kids-nursery-mobile", kind, arms);
    const views = out.parts[0].views3d!.filter((v) => v.radialSurface);
    expect(views).toHaveLength(3);
    // each size is one continuous strip, its slots starting on solid land outside the opening it surrounds
    for (const v of views) expect(unionShapes([v.outer, ...v.holes], [], true), `${kind}${arms}: ${v.name}`).toHaveLength(1);
  }
});

it("nested spirals keep a solid land round each opening and a rim wide enough for their tabs", () => {
  for (const arms of [2, 3, 4]) for (const count of [2, 3, 4]) for (const scale of [0.5, 0.6, 0.7]) {
    const p = switchPattern(mergePopup({ outline: { width: 300, height: 300 }, sets: { count, scale }, pattern: { arms } }), "multi");
    const out = POPUP.build(p, CTX);
    const label = `${arms} arms, ${count} sets at ${scale}`;
    if (out.error) { expect(out.error, label).toMatch(/too little material|too short/); continue; }
    const views = out.parts[0].views3d!.filter((v) => v.radialSurface);
    expect(views, label).toHaveLength(count);
    views.forEach((v, i) => {
      expect(unionShapes([v.outer, ...v.holes], [], true), `${label}: size ${i + 1}`).toHaveLength(1);
      const width = 300 * scale ** i, s = v.radialSurface!.spiral!;
      // the rim holds the tabs at this size
      expect(width / 2 - s.end + 1e-6, `${label}: size ${i + 1} rim`).toBeGreaterThanOrEqual(spiralRimMin(p, width / 2));
      // the slots start clear of the opening the next size is cut from
      if (i < count - 1) expect(s.start - (width * scale + 2 * p.gap) / 2, `${label}: size ${i + 1} land`).toBeGreaterThanOrEqual(2 * p.T - 1e-6);
    });
  }
}, 240000);

it("choosing Spiral widens a rim that is too narrow for the tabs, and says so; opening a saved design does not", () => {
  const field = POPUP.sections.flatMap((s) => s.fields).find((f) => f.key === "pattern.kind")!;
  if (field.kind !== "choice" || !field.apply || !field.note) throw Error("Cut pattern needs an apply and a note");
  const rings = mergePopup({ outline: { shape: "heart" }, rings: { rim: 10, center: 30 } });
  const spiral = field.apply(rings, "spiral");
  expect(spiral.rings.rim).toBeGreaterThan(10);
  expect(spiral.rings.rim % 0.5).toBe(0);
  expect(field.note(rings, spiral)).toMatch(/Outer rim widened from 10 to .* mm/);
  expect(POPUP.build(spiral, CTX).error).toBeUndefined();
  // nothing else changes, and a rim that is already wide enough stays as it is
  expect({ ...spiral, rings: { ...spiral.rings, rim: 10 } }).toEqual(patternDefaults(rings, "spiral"));
  const wide = mergePopup({ rings: { rim: 20 } });
  expect(field.apply(wide, "multi").rings.rim).toBe(20);
  expect(field.note(wide, field.apply(wide, "multi"))).toBeUndefined();
  // a saved spiral with a narrow rim opens unchanged, with an error that offers the fix
  const saved = mergePopup({ pattern: { kind: "spiral" }, rings: { rim: 6 } });
  expect(saved.rings.rim).toBe(6);
  const out = POPUP.build(saved, CTX);
  expect(out.error).toMatch(/rim is too narrow/);
  const fix = POPUP.check(saved, out).find((i) => i.level === "error")!.fixes[0];
  expect(fix.label).toMatch(/rim/i);
  expect(POPUP.build(fix.apply(saved), CTX).error).toBeUndefined();
});

it("spiral supports keep clear of the bulb, socket, tealight and vase, and their joints avoid them", () => {
  for (const raw of [
    { mode: "hanging", profile: { kind: "bell", depth: 170 }, rings: { center: 80 }, extras: { socket: "E27" } },
    { mode: "hanging", rings: { center: 60 }, extras: { socket: "E14" } },
    { rings: { center: 70 }, extras: { tealight: true } },
    "sleeve",
  ] as const) for (const kind of ["spiral", "multi"] as const) {
    // a sleeve as the editor makes it: the Sleeve mode widens the centre round the vase
    const p = switchPattern(raw === "sleeve" ? modeDefaults(mergePopup({}), "sleeve") : mergePopup(raw), kind), out = POPUP.build(p, CTX);
    const label = `${JSON.stringify(raw)} ${kind}`;
    expect(out.error, label).toBeUndefined();
    const fittings = accessorySolids(p, { rings: [{ radius: 0, height: out.parts[0].views3d![0].radialSurface!.samples[0][1] }] }, -p.spiral.clearance - p.T);
    expect(fittings.length, label).toBeGreaterThan(0);
    for (const rib of out.parts.filter((v) => /^spiral-rib-/.test(v.id))) {
      const b = bboxOf([rib.outer]);
      for (let u = b.x0; u <= b.x1; u += 0.5) for (let v = b.y0; v <= b.y1; v += 0.5) {
        if (!pointInContour([u, v], rib.outer) || rib.holes.some((h) => pointInContour([u, v], h))) continue;
        const q = placePoint(rib.place!, u, v, p.T / 2), r = Math.hypot(q[0], q[1]);
        for (const a of fittings) {
          const inside = a.kind === "sphere" ? Math.hypot(r, q[2] - a.zc) < a.r + ACCESSORY_CLEARANCE - 0.3 : r < a.r + ACCESSORY_CLEARANCE - 0.3 && q[2] > a.z0 - ACCESSORY_CLEARANCE + 0.3 && q[2] < a.z1 + ACCESSORY_CLEARANCE - 0.3;
          expect(inside, `${label}: ${rib.id} within the ${a.what}'s clearance at ${q.map((x) => x.toFixed(1))}`).toBe(false);
        }
      }
    }
  }
}, 120000);

/** The x range of each name's assembly in a batch. */
function batchRanges(out: GenOutput, names: number) {
  return Array.from({ length: names }, (_, k) => assemblyExtentX({ ...out, parts: out.parts.filter((v) => v.id.endsWith(`~n${k + 1}`)), hardware: [] }));
}

it("a names batch shows one complete assembly per name, in a row, each with its own fittings", () => {
  for (const kind of ["rings", "spiral", "multi"] as const) {
    const base = mergePopup({ mode: "hanging", profile: { kind: "bell", depth: 170 }, rings: { center: 80 }, extras: { socket: "E27" }, engraving: { text: "A" } });
    const p = kind === "rings" ? base : switchPattern(base, kind);
    const one = POPUP.build(p, CTX), out = buildBatch(POPUP, p, CTX, ["Ann", "Bo", "Cy"]);
    expect(out.error, kind).toBeUndefined();
    const ranges = batchRanges(out, 3);
    for (let k = 1; k < 3; k++) expect(ranges[k][0], `${kind}: assembly ${k + 1} clears ${k}`).toBeGreaterThanOrEqual(ranges[k - 1][1] + 39.9);
    // every assembly has its own socket, bulb and cord, moved with it
    expect(out.hardware!.length, kind).toBe(3 * one.hardware!.length);
    const bulbs = out.hardware!.filter((h) => h.kind === "bulb").map((h) => (h as { at: number[] }).at[0]);
    const centres = out.parts.filter((v) => v.id.startsWith("blank~n")).map((v) => placePoint(v.views3d![0].place, 0, 0, 0)[0]);
    expect(bulbs, kind).toEqual(centres);
    // the cut parts themselves are unchanged
    expect(out.parts.filter((v) => v.id.endsWith("~n2")).map((v) => v.outer), kind).toEqual(POPUP.build({ ...p, engraving: { ...p.engraving, text: "Bo" } }, CTX).parts.map((v) => v.outer));
  }
  // the wedding favour preset: two bowls side by side in 3D, and the same parts on the sheets
  const wedding = POPUP.presets.find((v) => v.id === "wedding-favour-bowl-names-batch")!;
  for (const [kind, arms] of [["spiral", 2], ["multi", 4]] as const) {
    const p = switched(wedding.id, kind, arms), a = arrangeGenerator(POPUP, p, CTX);
    if ("error" in a.result) throw Error(a.result.error);
    const r = batchRanges(a.result.out, 2);
    expect(r[1][0]).toBeGreaterThanOrEqual(r[0][1] + 39.9);
  }
}, 120000);

it("other generators' batches stand apart in 3D too, with unchanged cut parts", () => {
  const p = KEYCHAIN.merge({});
  const out = buildBatch(KEYCHAIN, p, CTX, ["Ann", "Bob"]);
  expect(out.error).toBeUndefined();
  const r = batchRanges(out, 2);
  expect(r[1][0]).toBeGreaterThanOrEqual(r[0][1] + 39.9);
  const scene = generatorScene(out, p.T);
  try {
    const boxes = [1, 2].map((k) => {
      const box = new THREE.Box3();
      scene.group.traverse((o) => { if (o instanceof THREE.Mesh && o.name.includes(k === 1 ? "(Ann)" : "(Bob)")) box.expandByObject(o); });
      return box;
    });
    expect(boxes.some((b) => b.isEmpty())).toBe(false);
    expect(boxes[0].intersectsBox(boxes[1])).toBe(false);
  } finally { scene.dispose(); }
});

/** How far the formed strip's mesh strays from its target form, mm (cap triangles, sampled at centroids). */
function worstChord(out: GenOutput, T: number) {
  const scene = generatorScene(out, T);
  let worst = 0;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const surfaces = out.parts[0].views3d!.filter((w) => w.radialSurface);
  scene.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !/^Continuous .*spiral$/i.test(o.name) || o.userData.noMeasure) return;
    const view = surfaces.find((w) => w.name === o.name)!, s = view.radialSurface!;
    const g = o.geometry, pos = g.getAttribute("position"), idx = g.index!;
    const at = (q: THREE.Vector3) => formHeight(s, q.x, -q.y);
    for (let i = 0; i < idx.count; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx.getX(i + k));
      const off = v.map((q) => q.z - at(q));
      if (Math.max(...off) - Math.min(...off) > 1e-3) continue;
      if (new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).length() / 2 < 0.05) continue;
      const c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
      worst = Math.max(worst, Math.abs(c.z - at(c) - off[0]));
    }
  });
  scene.dispose();
  return worst;
}

it("formed strips follow their target form within 1 mm on nested, lamp, ornament and heart designs", () => {
  for (const [id, kind, arms] of [["kids-nursery-mobile", "multi", 4], ["bell-pendant", "spiral", 2], ["spiral-ornament-set-of-6", "multi", 3], ["heart-valentine-basket", "multi", 2]] as const) {
    const p = switched(id, kind, arms), out = POPUP.build(p, CTX);
    expect(out.error, id).toBeUndefined();
    expect(worstChord(out, p.T), id).toBeLessThan(1);
  }
}, 240000);
