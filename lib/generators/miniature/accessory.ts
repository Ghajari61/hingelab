/**
 * Garden and street pieces on their own: trees, bushes and lamps as two slotted halves (kit.ts
 * crossPair), a run of fence on a base strip, and an open planter box. The same pieces stand in a
 * house's garden or on its pavement (house.ts); here they are made at the size given, for dioramas,
 * book nooks or another house.
 */
import { boxPanels } from "../boxes/joints";
import { circle, rect } from "../geom";
import type { Contour, GenPart } from "../types";
import { clamp, clipScore, crossPair, crossProfile, outerOf, r1, screenPanel, tabSpans, wallFinish, yUp, type CrossKind } from "./kit";
import { NOT_A_HOUSE, type MiniOutput } from "./house";
import { ACCESSORY_NAMES, FENCE_STYLES, FIT_MM, FIT_NAMES, type JointFit, type MiniatureParams } from "./params";

export function buildAccessory(p: MiniatureParams): MiniOutput {
  const T = p.T, a = p.accessory, name = ACCESSORY_NAMES[a.kind];
  const H = clamp(a.height, 15, 400), w = clamp(a.width, 10, 300), L = clamp(a.length, 20, 600);
  const parts: GenPart[] = [];
  const assembly: string[] = [];
  let size: [number, number, number] = [w, w, H];
  switch (a.kind) {
    case "fence": {
      const z0 = a.base ? T : 0;
      const r = screenPanel(L, H, a.fence, T, a.base);
      parts.push({ id: "fence", name: FENCE_STYLES[a.fence], outer: r.outer, holes: r.holes, ...(r.score.length ? { score: r.score } : {}), place: { x: 0, y: -(z0 + H), z: -T / 2, upright: true } });
      if (a.base) {
        const holes = tabSpans(0, L, T).map(([s, e]) => rect(s, -T / 2, e - s, T));
        parts.push({ id: "base", name: "Base strip", outer: rect(-2, -T / 2 - 4, L + 4, T + 8), holes, place: { x: 0, y: 0, z: 0 } });
        assembly.push("Push the fence's tabs into the base strip.");
      }
      size = [L + 4, T + 8, z0 + H];
      break;
    }
    case "fittest": {
      // One slot for every joint fit, each as that fit would cut it (the slot T minus the fit), and a
      // key cut from the same sheet: the slot that holds the key firmly by hand is the fit to use.
      // This part is never refitted (build.ts); the export's kerf applies to it as to everything.
      const fits = Object.keys(FIT_MM) as JointFit[], sl = 10, pitch = 16, W0 = fits.length * pitch + 8, H0 = 34;
      const holes: Contour[] = [], score: Contour[] = [];
      fits.forEach((f, i) => {
        const cx = 4 + pitch * (i + 0.5), w = T - FIT_MM[f];
        holes.push(rect(cx - sl / 2, 14 - w / 2, sl, w));
        // dots: 1 for the loosest to 5 for the tightest, above the slot
        for (let k = 0; k <= i; k++) { const c = circle(cx - (i * 1.6) / 2 + k * 1.6, 5, 0.55, 0.1); score.push([...c, c[0]]); }
      });
      score.push([[4, 24], [W0 - 4, 24]]);
      parts.push({ id: "fittest", name: "Joint fit test", outer: rect(0, 0, W0, H0), holes, score, place: { x: 0, y: 0, z: 0 } });
      // the key stands in the Standard slot in the 3D view
      const si = fits.indexOf("standard"), cxs = 4 + pitch * (si + 0.5), kH = 18;
      const key = outerOf([rect(0, 0, sl + 8, kH), rect(4.5, -T, sl - 1, T + 0.01)]);
      parts.push({ id: "fittest-key", name: "Fit test key", outer: yUp(key, kH), holes: [], score: [[[2, kH - 9], [sl + 6, kH - 9]]], place: { x: cxs - sl / 2 + 0.5 - 4.5, y: -(T + kH), z: 14 - T / 2, upright: true } });
      assembly.push(
        `Push the key into each slot. The slots run, left to right, ${fits.map((f, i) => `${i + 1} ${i ? "dots" : "dot"} ${FIT_NAMES[f]}`).join(", ")}.`,
        "Choose the fit whose slot holds the key firmly when pressed in by hand, and set it under Joints in every design cut from this sheet.",
        "Cut it with the same kerf, material and laser settings as the real job.",
      );
      size = [W0, H0, kH];
      break;
    }
    case "planter": {
      const D = clamp(w, 15, 300), f = Math.min(L, D, H) / 4;
      const k = boxPanels(L, D, H, T, f, false);
      const boards = (len: number, outer: Contour) => clipScore(wallFinish("stucco-bands", 0, len, 0, H, [H * 0.36, H * 0.68]), outer, []);
      parts.push(
        { id: "front", name: "Planter (front)", outer: k.face, holes: [], score: boards(L, k.face), place: { x: 0, y: -H, z: D - T, upright: true } },
        { id: "back", name: "Planter (back)", outer: k.face, holes: [], score: boards(L, k.face), place: { x: 0, y: -H, z: 0, upright: true } },
        { id: "left", name: "Planter (left)", outer: k.side, holes: [], score: boards(D, k.side), place: { x: T, y: -H, z: 0, upright: true, yaw: 90 } },
        { id: "right", name: "Planter (right)", outer: k.side, holes: [], score: boards(D, k.side), place: { x: L, y: -H, z: 0, upright: true, yaw: 90 } },
        { id: "bottom", name: "Planter (bottom)", outer: k.bottom, holes: [circle(L / 2, D / 2, Math.min(L, D) * 0.08, 0.05)], place: { x: 0, y: 0, z: 0 } },
      );
      assembly.push("Glue the finger joints; the hole in the bottom drains it if it is used for real plants.");
      size = [L, D, H];
      break;
    }
    default: {
      const kind = a.kind as CrossKind;
      const { profile, foot } = crossProfile(kind, H, w, T);
      const z0 = a.base ? T : 0;
      const c = crossPair(profile, T, [0, 0, z0], kind, name, foot, a.base);
      parts.push(...c.parts);
      if (a.base) {
        const r = Math.max(w * 0.32, foot + 6);
        parts.push({ id: "base", name: "Base", outer: kind === "lamp" ? rect(-r, -r, 2 * r, 2 * r) : circle(0, 0, r, 0.05), holes: c.hole, place: { x: 0, y: 0, z: 0 } });
      }
      assembly.push("Slide the two halves together at their slots until their feet are level.", ...(a.base ? ["Push the cross into the base's slot."] : []));
      size = [w, w, z0 + H];
    }
  }
  return {
    parts,
    stats: [{ label: "Piece", value: `${name}, ${r1(size[0])} × ${r1(size[1])} × ${r1(size[2])} mm` }],
    assembly: [...assembly, "A drop of glue in each slot holds it."],
    info: { size, parts: parts.length, ...NOT_A_HOUSE },
  };
}
