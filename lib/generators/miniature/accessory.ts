/**
 * Garden and street pieces on their own: trees, bushes and lamps as two slotted halves (kit.ts
 * crossPair), a run of fence on a base strip, and an open planter box. The same pieces stand in a
 * house's garden or on its pavement (house.ts); here they are made at the size given, for dioramas,
 * book nooks or another house.
 *
 * - Garden bridge: an arched footbridge on the tabbed frame (kit.ts): the two side rails are its
 *   end panels, each plank a flat member tabbed into both, set level at the height where the arch
 *   leaves `m` of rail under its slot; balusters are cut through the rail above the deck.
 * - Fairy door: an arched door to stand against a skirting board or a tree, in three layers: a back
 *   plate, the frame with the door leaf inside it (a hair smaller than its opening), and the hinges
 *   and knob on top; a step lies on the floor in front.
 */
import { boxPanels } from "../boxes/joints";
import { circle, rect, roundedRect } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { differenceShapes } from "@/lib/letters/polygon";
import { biggest, clamp, clipScore, crossPair, crossProfile, openingHoles, openingShape, outerOf, r1, screenPanel, tabbedFrame, tabSpans, wallFinish, yUp, type CrossKind } from "./kit";
import { NOT_A_HOUSE, type MiniOutput } from "./house";
import { ACCESSORY_NAMES, FENCE_STYLES, FIT_MM, FIT_NAMES, type JointFit, type MiniatureParams } from "./params";

export function buildAccessory(p: MiniatureParams): MiniOutput {
  const T = p.T, a = p.accessory, name = ACCESSORY_NAMES[a.kind];
  const H = clamp(a.height, 15, 400), w = clamp(a.width, 10, 300), L = clamp(a.length, 20, 600);
  const parts: GenPart[] = [];
  const assembly: string[] = [];
  let size: [number, number, number] = [w, w, H];
  let info: Record<string, number> = {};
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
    case "bridge": {
      const wd = clamp(a.width, 3 * T + 10, 300), b = gardenBridge(T, clamp(a.length, 40, 600), wd, H);
      parts.push(...b.parts);
      info = { slope: b.slope, rise: b.rise };
      assembly.push("Push every plank's tabs into one side rail, then press the other rail on; glue the tabs from below.");
      size = [wd, clamp(a.length, 40, 600), H];
      break;
    }
    case "fairydoor": {
      parts.push(...fairyDoor(T, w, H));
      assembly.push(
        "Glue the frame on the back plate, lined up by the outline, then the door leaf inside the frame.",
        "Glue the hinges and the knob on the door leaf, and stand the door on its step.",
        "Paint before gluing the layers; a dab of reusable adhesive holds it against a skirting board or a tree.",
      );
      size = [w + 6, 4 * T, H];
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
    stats: [
      { label: "Piece", value: `${name}, ${r1(size[0])} × ${r1(size[1])} × ${r1(size[2])} mm` },
      ...(a.kind === "bridge" ? [{ label: "Deck", value: `${parts.filter((q) => /^plank/.test(q.id)).length} planks, arch rises ${r1(info.rise)} mm, ends at ${Math.round((Math.atan(info.slope) * 180) / Math.PI)}°` }] : []),
    ],
    assembly: [...assembly, "A drop of glue in each slot holds it."],
    info: { size, parts: parts.length, ...NOT_A_HOUSE, ...info },
  };
}

/** Steepest a bridge deck should be for figures to stand on it: about 30°. */
export const BRIDGE_MAX_SLOPE = 0.58;

/**
 * An arched footbridge L long, Wd wide and H tall at the middle of its rail. The underside is a
 * sine arch rising `rise`; the rail stands a band above it that holds each plank's slot with `m` of
 * wood under it and above it, plus the railing.
 */
export function gardenBridge(T: number, L: number, Wd: number, H: number): { parts: GenPart[]; slope: number; rise: number } {
  const m = Math.max(2, T * 0.7), railH = clamp(H * 0.3, 8, 40);
  const pw = Math.max(3 * T + 0.5, Math.min(16, L / 12)), gap = 1.2;
  // A plank level across its width sits at most slope × width above the arch at its low end, so the
  // band grows by that much: H = rise + m + T + 2 + railH + (π·rise/L)·pw at the middle.
  const base = m + T + 2 + railH;
  const rise = Math.max(0, (H - base) / (1 + (Math.PI * pw) / L));
  const zb = (y: number) => rise * Math.sin((Math.PI * clamp(y, 0, L)) / L);
  const slope = (rise * Math.PI) / L;
  const allow = slope * pw;
  const c0 = m + T + 2 + allow, zt = (y: number) => zb(y) + c0 + railH;
  const n = Math.max(2, Math.floor((L - 2) / (pw + gap)));
  const start = (L - (n * pw + (n - 1) * gap)) / 2;
  const flats = Array.from({ length: n }, (_, i) => {
    const y0 = start + i * (pw + gap), y1 = y0 + pw;
    let lo = 0;
    for (let k = 0; k <= 8; k++) lo = Math.max(lo, zb(y0 + (pw * k) / 8));
    return { id: `plank${i + 1}`, name: `Plank ${i + 1}`, y0, y1, z: lo + m };
  });
  const N = 48, ys = Array.from({ length: N + 1 }, (_, i) => (L * i) / N);
  const profile: Contour = [...ys.map((y): Pt => [y, zt(y)]).reverse(), ...ys.map((y): Pt => [y, zb(y)])];
  // balusters: windows through the rail between the deck and a top rail, following the curve
  const holes: Contour[] = [], seg = Math.max(5, Math.min(9, L / 18)), post = Math.max(2.5, T);
  const hz0 = c0 + 1.5, hz1 = c0 + railH - 3;
  if (hz1 - hz0 >= 3) for (let y = post + 2; y + seg <= L - post - 2 + 1e-6; y += seg + post) {
    const y1 = y + seg;
    holes.push([[y, zb(y) + hz0], [y1, zb(y1) + hz0], [y1, zb(y1) + hz1], [y, zb(y) + hz1]]);
  }
  const parts = tabbedFrame({ T, W: Wd - 2 * T, profile, ends: ["Side rail (left)", "Side rail (right)"], endHoles: holes, flats });
  return { parts, slope, rise };
}

/**
 * A fairy door W wide and H tall, standing on z = 0 with its back on the wall (plan y = 0): back
 * plate, frame and leaf, then hinges and knob, each a layer T thick in front of the last.
 */
export function fairyDoor(T: number, W: number, H: number): GenPart[] {
  const fw = clamp(W * 0.12, Math.max(3, T), 10), g = 0.3;
  const outer = openingShape("arch", W / 2, 0, W, H);
  const lw = W - 2 * fw, lh = H - fw;
  const opening = openingShape("arch", W / 2, -1, lw, lh + 1);
  const frame = biggest(differenceShapes([outer], [opening])).outer;
  const leaf = openingShape("arch", W / 2, 0, lw - 2 * g, lh - g);
  // the window: a round light high in the leaf with cross bars
  const wr = Math.min(lw * 0.28, lh * 0.14), wz = lh - Math.max(lw / 2, wr * 2.2) - wr * 0.2;
  const win = openingHoles(circle(W / 2, wz, wr, 0.05), "cross", Math.max(1.2, wr * 0.18));
  // planks scored up the leaf, stopping at the window
  const planks: Contour[] = [];
  const np = clamp(Math.round(lw / 7), 3, 9);
  for (let i = 1; i < np; i++) { const x = W / 2 - lw / 2 + (lw * i) / np; planks.push([[x, 0], [x, lh]]); }
  const leafScore = clipScore(planks, leaf, [circle(W / 2, wz, wr + 1.2, 0.05)]);
  // stones round the arch: radial joints over the head, level joints down the jambs
  const stones: Contour[] = [];
  const r0 = lw / 2, spring = lh - r0;
  for (let k = 1; k < 7; k++) { const t = (Math.PI * k) / 7, c = Math.cos(t), s = Math.sin(t); stones.push([[W / 2 + c * r0, spring + s * r0], [W / 2 + c * (r0 + fw), spring + s * (r0 + fw)]]); }
  for (let z = fw * 1.4; z < spring - 2; z += fw * 1.4) for (const x of [0, W - fw]) stones.push([[x, z], [x + fw, z]]);
  const frameScore = clipScore(stones, frame, [opening]);
  const hw = lw * 0.5, hh = Math.max(3, T + 0.5);
  const hinge = (z: number) => roundedRect(W / 2 - lw / 2 + 1.5, Math.min(z, spring - hh - 1), hw, hh, hh / 2);
  const kr = clamp(W * 0.035, 1.6, 4), knob = circle(W / 2 + lw / 2 - kr - 3, lh * 0.42, kr, 0.05);
  const Y = (c: Contour) => yUp(c, H);
  const up = (z: number) => ({ x: 0, y: -H, z, upright: true as const });
  const sd = clamp(H * 0.14, 6, 22);
  return [
    { id: "door-back", name: "Fairy door back plate", outer: Y(outer), holes: [], place: up(0) },
    { id: "door-frame", name: "Fairy door frame", outer: Y(frame), holes: [], score: frameScore.map(Y), place: up(T) },
    { id: "door-leaf", name: "Fairy door", outer: Y(leaf), holes: win.map(Y), score: leafScore.map(Y), place: up(T) },
    { id: "door-hinge-1", name: "Hinge (top)", outer: Y(hinge(lh * 0.62)), holes: [], place: up(2 * T) },
    { id: "door-hinge-2", name: "Hinge (bottom)", outer: Y(hinge(lh * 0.16)), holes: [], place: up(2 * T) },
    { id: "door-knob", name: "Door knob", outer: Y(knob), holes: [], place: up(2 * T) },
    { id: "door-step", name: "Step", outer: roundedRect(-3, 2 * T, W + 6, sd, Math.min(3, sd / 3)), holes: [], place: { x: 0, y: 0, z: 0 } },
  ];
}
