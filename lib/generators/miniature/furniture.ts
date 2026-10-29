/**
 * Miniature furniture on the tabbed frame (kit.ts): the full-size piece divided by the scale.
 *
 * The material does not scale: a 3 mm sheet is 3 mm at any scale, and so are the tabs, the slots, the
 * joint fit and the kerf. Only the piece's own dimensions are divided by the scale; legs, rails and
 * aprons are then made at least wide enough to hold their slots, and `info.thin` reports any that
 * had to grow beyond their scaled size.
 */
import { circle, rect } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { differenceShapes } from "@/lib/letters/polygon";
import { biggest, clamp, clipScore, openingShape, outerOf, r1, tabbedFrame, wallFinish, type FlatMember, type UprightMember, type Cap } from "./kit";
import { NOT_A_HOUSE, type MiniOutput } from "./house";
import { FURNITURE_NAMES, SCALES, scaleOf, type MiniatureParams } from "./params";

export function buildFurniture(p: MiniatureParams): MiniOutput {
  const T = p.T, f = p.furniture, s = scaleOf(f);
  const kind = f.kind;
  // the piece at scale; a bed's width runs front to back and its length between head and foot
  const bed = kind === "bed";
  const Wm = Math.max(4 * T, (bed ? f.depth : f.width) / s), Dm = Math.max(4 * T, (bed ? f.width : f.depth) / s), Hm = Math.max(5 * T, f.height / s);
  let thin = 0;
  /** A size of the piece that also has to hold a slot: at least `min`, counted when it had to grow. */
  const atLeast = (v: number, min: number) => { if (v < min) thin++; return Math.max(v, min); };
  const m = Math.max(2, T * 0.7); // wood kept round a slot near an edge
  let profile: Contour = rect(0, 0, Dm, Hm), rightProfile: Contour | undefined;
  const flats: FlatMember[] = [], ups: UprightMember[] = [], caps: Cap[] = [];
  const extra: GenPart[] = [];
  const shelves = clamp(Math.round(f.shelves), 0, 10);
  const knob = (x: number, z: number) => circle(x, z, clamp(Wm * 0.025, 0.6, 1.6), 0.02);

  switch (kind) {
    case "bookshelf": case "cabinet": case "dresser": case "wardrobe": case "nightstand": case "counter": {
      const kick = atLeast(Hm * 0.06, T + 2 * m);
      profile = rect(0, 0, Dm, Hm - T);
      const backY = m;
      flats.push({ id: "bottom", name: "Bottom", y0: backY + T, y1: Dm, z: kick });
      const drawerKind = kind === "dresser" || kind === "nightstand", doorKind = kind === "cabinet" || kind === "wardrobe" || kind === "counter";
      const n = drawerKind ? 0 : kind === "cabinet" || kind === "counter" ? Math.min(shelves, 3) : kind === "wardrobe" ? Math.min(shelves, 2) : shelves;
      const span = Hm - T - kick - T;
      // a wardrobe's shelves sit high, over the hanging space
      const at = (i: number) => (kind === "wardrobe" ? Hm - T - (span * 0.16 * i) - T : kick + T + (span * i) / (n + 1) - T / 2);
      for (let i = 1; i <= n; i++) flats.push({ id: `shelf${i}`, name: `Shelf ${i}`, y0: backY + T, y1: Dm - (doorKind ? 0.5 : 0), z: at(i) });
      ups.push({ id: "back", name: "Back", y: backY, z0: kick, z1: Hm - T });
      const topOv = kind === "wardrobe" ? Math.min(3, Wm * 0.04) : kind === "counter" ? Math.min(2.5, Wm * 0.03) : 0.5;
      const top: Cap = { id: "top", name: kind === "counter" ? "Worktop" : "Top", at: "top", z: Hm - T, x0: -topOv, x1: Wm + topOv, y0: 0, y1: Dm + (kind === "bookshelf" ? 0.5 : T + topOv) };
      if (kind === "counter") {
        // a sink cut through the worktop on the right and a hob's rings scored on the left
        const sw = Math.min(Wm * 0.24, 40), sd = Dm * 0.55;
        if (Wm - 2 * T > sw + 16) top.holes = [rect(Wm - T - 4 - sw, Dm * 0.18, sw, sd)];
        const r0 = Math.min(Dm * 0.14, Wm * 0.07);
        top.score = [[0.3, 0.3], [0.3, 0.7], [0.62, 0.3], [0.62, 0.7]].map(([fx, fy]) => { const c = circle(T + 4 + (Wm * 0.36) * fx, Dm * fy, r0, 0.1); return [...c, c[0]]; });
      }
      caps.push(top);
      if (drawerKind) {
        // drawer fronts on one panel: scored drawer lines and a knob hole each (they do not open)
        const z0 = kick, z1 = Hm - T, H = z1 - z0, lines: Contour[] = [], holes: Contour[] = [];
        const drawers = kind === "nightstand" ? clamp(Math.round(f.drawers), 1, 3) : clamp(Math.round(f.drawers), 1, 8);
        for (let i = 1; i < drawers; i++) { const z = H * (i / drawers); lines.push([[0, z], [Wm, z]]); }
        for (let i = 0; i < drawers; i++) for (const x of Wm > 40 ? [Wm * 0.3, Wm * 0.7] : [Wm / 2]) holes.push(knob(x, H * ((i + 0.5) / drawers)));
        extra.push({ id: "fronts", name: "Drawer fronts", outer: rect(0, 0, Wm, H), holes, score: lines, place: { x: 0, y: -z1, z: Dm, upright: true } });
      }
      if (doorKind) {
        const z0 = kick, z1 = Hm - T, H = z1 - z0, nd = kind === "counter" ? clamp(Math.round(Wm / 25), 2, 6) : 2, dw = Wm / nd;
        for (let i = 0; i < nd; i++) {
          const panel = rect(1.5, 1.5, dw - 3, H - 3), x = i * dw, right = i % 2 === 0;
          const kz = kind === "wardrobe" ? H * 0.45 : kind === "counter" ? 4 : H / 2;
          extra.push({ id: `door${i + 1}`, name: `Door ${i + 1}`, outer: rect(0, 0, dw, H), holes: [knob(right ? dw - 2.5 : 2.5, kz)], score: [[...panel, panel[0]]], place: { x, y: -z1, z: Dm, upright: true } });
        }
      }
      break;
    }
    case "desk": case "table": {
      const lw = atLeast(Dm * 0.07, T + 2 * m), ah = atLeast(Hm * 0.12, 3 * T + 2 * m), top = Hm - T;
      profile = outerOf([[[0, 0], [lw, 0], [lw, top - ah], [Dm - lw, top - ah], [Dm - lw, 0], [Dm, 0], [Dm, top], [0, top]]]);
      if (kind === "desk") {
        // a panel leg each side with a shelf low down and a modesty panel at the back
        profile = rect(0, 0, Dm, top);
        flats.push({ id: "shelf", name: "Shelf", y0: m + T, y1: Dm - m, z: atLeast(Hm * 0.1, T + m) });
        ups.push({ id: "modesty", name: "Back panel", y: m, z0: Hm * 0.45, z1: top - m });
      } else {
        ups.push({ id: "apron-b", name: "Back apron", y: lw / 2 - T / 2, z0: top - ah + m, z1: top - m }, { id: "apron-f", name: "Front apron", y: Dm - lw / 2 - T / 2, z0: top - ah + m, z1: top - m });
      }
      const ov = Math.min(Dm * 0.06, 6);
      caps.push({ id: "top", name: "Top", at: "top", z: top, x0: -ov, x1: Wm + ov, y0: -ov, y1: Dm + ov });
      break;
    }
    case "sofa": case "armchair": {
      // ends: an arm in front and the tall back post behind it; the seat between, the back rest above it
      const seat = clamp(430 / s, 2 * T + 6, Hm * 0.6), arm = clamp(620 / s, seat + 2 * T, Hm - 3 * T);
      const back = atLeast(Dm * 0.18, T + 2 * m), foot = atLeast(Dm * 0.1, T + m), nh = Math.min(seat * 0.28, seat - T - 3 * m - 3 * T);
      let prof = outerOf([[[0, 0], [Dm, 0], [Dm, arm], [back, arm], [back, Hm], [0, Hm]]]);
      if (nh > 2 && Dm - 2 * foot > 6) prof = biggest(differenceShapes([prof], [rect(foot, -1, Dm - 2 * foot, nh + 1)])).outer;
      profile = prof;
      const n = kind === "sofa" ? clamp(Math.round(Wm / (Dm * 0.9)), 2, 4) : 1;
      const cushions: Contour[] = Array.from({ length: n - 1 }, (_, i) => [[T + ((Wm - 2 * T) * (i + 1)) / n, back + 0.5], [T + ((Wm - 2 * T) * (i + 1)) / n, Dm - 0.5]]);
      flats.push({ id: "seat", name: "Seat", y0: back, y1: Dm, z: seat - T, score: cushions });
      ups.push({ id: "back", name: "Back rest", y: (back - T) / 2, z0: seat, z1: Hm - m });
      const az0 = Math.max(nh, 0) + m, az1 = seat - T - m;
      if (az1 - az0 >= T) ups.push({ id: "apron", name: "Front rail", y: Dm - m - T, z0: az0, z1: az1 });
      break;
    }
    case "fireplace": {
      const kick = atLeast(Hm * 0.08, T + 2 * m), H = Hm - T;
      profile = rect(0, 0, Dm, H);
      flats.push({ id: "hearth-floor", name: "Firebox floor", y0: m + T, y1: Dm, z: kick });
      ups.push({ id: "back", name: "Back", y: m, z0: kick, z1: H });
      caps.push({ id: "mantel", name: "Mantel shelf", at: "top", z: H, x0: -Math.min(4, Wm * 0.05), x1: Wm + Math.min(4, Wm * 0.05), y0: 0, y1: Dm + T + Math.min(4, Dm * 0.15) });
      // the front: the firebox opening in an arch, brick scored round it, standing on the floor
      const fw = Wm * 0.5, fh2 = Math.min(H * 0.55, H - kick - T - 6), cxf = Wm / 2;
      const open = openingShape("arch", cxf, kick + T, fw, fh2);
      const outer = rect(0, 0, Wm, H), lines = clipScore([...wallFinish("brick", 0, Wm, 0, H - 6), [[0, H - 6], [Wm, H - 6]]], outer, [open]);
      const yd = (c: Contour): Contour => c.map(([x, z]) => [x, H - z] as Pt);
      extra.push({ id: "front", name: "Fireplace front", outer: yd(outer), holes: [yd(open)], score: lines.map(yd), place: { x: 0, y: -H, z: Dm, upright: true } });
      extra.push({ id: "hearth", name: "Hearth", outer: rect(-2, Dm + T, Wm + 4, Math.max(6, Dm * 0.35)), holes: [], place: { x: 0, y: 0, z: 0 } });
      break;
    }
    case "chair": {
      const seat = clamp(450 / s, 2 * T + 6, Hm - 3 * T), lw = atLeast(Dm * 0.1, T + 2 * m), ah = atLeast(seat * 0.18, T + 2 * m + 1);
      profile = outerOf([[[0, 0], [lw, 0], [lw, seat - ah], [Dm - lw, seat - ah], [Dm - lw, 0], [Dm, 0], [Dm, seat], [lw, seat], [lw, Hm], [0, Hm]]]);
      flats.push({ id: "seat", name: "Seat", y0: lw, y1: Dm - lw * 0.2, z: seat - T - m });
      ups.push({ id: "back", name: "Back rest", y: (lw - T) / 2, z0: seat + Math.max(3, (Hm - seat) * 0.35), z1: Hm - m });
      ups.push({ id: "stretcher", name: "Front stretcher", y: Dm - lw + (lw - T) / 2, z0: seat * 0.2, z1: seat * 0.2 + atLeast(seat * 0.2, 3 * T) });
      break;
    }
    case "bench": {
      const top = Hm - T, foot = atLeast(Dm * 0.15, T + m);
      // an arch between the feet, cut from the bottom edge of each end
      const arch = openingShape("arch", Dm / 2, -1, Math.max(0, Dm - 2 * foot), Math.max(0, top * 0.55) + 1);
      profile = Dm - 2 * foot > 4 ? biggest(differenceShapes([rect(0, 0, Dm, top)], [arch])).outer : rect(0, 0, Dm, top);
      flats.push({ id: "shelf", name: "Stretcher shelf", y0: m, y1: Dm - m, z: top * 0.62 });
      caps.push({ id: "seat", name: "Seat", at: "top", z: top, x0: -Math.min(6, Wm * 0.04), x1: Wm + Math.min(6, Wm * 0.04), y0: -0.5, y1: Dm + 0.5 });
      break;
    }
    case "bed": {
      const legH = atLeast(Hm * 0.18, T + m), railH = atLeast(Hm * 0.22, 3 * T + 2 * m), foot = Math.max(legH + railH + m, Hm * 0.55);
      const arched = (H: number): Contour => {
        const pts: Pt[] = [[0, 0], [Dm, 0], [Dm, H - Dm * 0.12]];
        for (let i = 1; i < 16; i++) { const t = i / 16; pts.push([Dm * (1 - t), H - Dm * 0.12 + Math.sin(Math.PI * t) * Dm * 0.12]); }
        pts.push([0, H - Dm * 0.12]);
        return outerOf([pts]);
      };
      profile = arched(Hm);
      rightProfile = arched(foot);
      ups.push({ id: "rail-b", name: "Side rail (back)", y: m, z0: legH, z1: legH + railH }, { id: "rail-f", name: "Side rail (front)", y: Dm - m - T, z0: legH, z1: legH + railH });
      flats.push({ id: "base", name: "Mattress base", y0: m + T, y1: Dm - m - T, z: legH + m });
      break;
    }
  }
  return finish(p, { profile, rightProfile, flats, ups, caps, extra, Wm, Dm, Hm, thin, s });
}

function finish(p: MiniatureParams, o: { profile: Contour; rightProfile?: Contour; flats: FlatMember[]; ups: UprightMember[]; caps: Cap[]; extra: GenPart[]; Wm: number; Dm: number; Hm: number; thin: number; s: number }): MiniOutput {
  const T = p.T, f = p.furniture;
  const parts = [
    ...tabbedFrame({ T, W: o.Wm - 2 * T, profile: o.profile, rightProfile: o.rightProfile, ends: f.kind === "bed" ? ["Head board", "Foot board"] : f.kind === "sofa" || f.kind === "armchair" ? ["Left arm", "Right arm"] : f.kind === "fireplace" ? ["Left jamb", "Right jamb"] : ["Left side", "Right side"], flats: o.flats, uprights: o.ups, caps: o.caps }),
    ...o.extra,
  ];
  const name = FURNITURE_NAMES[f.kind];
  return {
    parts,
    stats: [
      { label: "Scale", value: `${f.scale === "custom" ? `1:${r1(o.s)}` : SCALES[f.scale]}: ${r1(f.width)} × ${r1(f.depth)} × ${r1(f.height)} mm full size` },
      { label: "Miniature", value: `${r1(o.Wm)} × ${r1(o.Dm)} × ${r1(o.Hm)} mm` },
      { label: "Material", value: `${p.T} mm (not scaled), so the joints stay the same size at any scale` },
    ],
    assembly: [
      `Push the ${name.toLowerCase()}'s members into one side, then press the other side on.`,
      ...(o.caps.length ? ["Press the top on last; the sides' tabs come through it."] : []),
      "Tweezers help at small scales; a drop of glue in each slot holds it.",
    ],
    info: { size: [o.Wm, o.Dm, o.Hm], thin: o.thin, parts: parts.length, ...NOT_A_HOUSE },
  };
}
