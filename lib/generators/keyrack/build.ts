import { markLetters, raisedLetters } from "../textOps";
import { MATERIALS } from "@/lib/hinge/defaults";
import { makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, deg, pointInContour, rect, roundedRect, stadium } from "../geom";
import { tagMarks } from "../items";
import { material2 } from "../material2";
import { motif, motifSize } from "../motifs";
import { motifRef } from "../motifRef";
import { orient, shapeOutline } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock } from "../weld";
import type { KeyrackParams } from "./params";

export interface KeyrackInfo {
  W: number;
  H: number;
  /** Text and motif block width, and the board width it should fit in. */
  contentW: number;
  room: number;
  /** Distance between hooks, mm (0 with one hook). */
  spacing: number;
  /** Holes or slots that fall outside the board's shape. */
  outside: string[];
  /** Mail pocket: its top and bottom, mm from the top of the board (0 without one). */
  pocketTop: number;
  pocketBottom: number;
  /** Top of the hook row's slots or holes, mm from the top of the board. */
  rowTop: number;
}

export type KeyrackOutput = GenOutput & { info?: KeyrackInfo };

const r0 = (v: number) => Math.round(v);
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const closed = (c: Contour): Contour => [...c, c[0]];
const largest = (cs: Contour[]) => unionShapes(cs.map(orient)).reduce((a, b) => (b.area > a.area ? b : a)).outer;

/** A hook's side profile: x outward from the board's face, y down; the tab (x < 0) goes through the board. */
export function hookProfile(p: KeyrackParams): { outer: Contour; yc: number; tabH: number } {
  const T = p.T, a = Math.max(6, p.hooks.size), L = Math.max(a, p.hooks.reach);
  const tipH = a * 0.6, tipW = Math.max(5, a * 0.4), tabH = Math.max(8, a * 0.75);
  const ball = p.hooks.profile === "ball";
  const r = a * 0.6;
  const yc = ball ? r : tipH + a / 2;
  const tab = rect(-T, yc - tabH / 2, T + 1, tabH);
  let cs: Contour[];
  switch (p.hooks.profile) {
    case "square": cs = [tab, rect(0, tipH, L, a), rect(L - tipW, 0, tipW, tipH + 1)]; break;
    case "round": cs = [tab, rect(0, tipH, L - a / 2, a), circle(L - a / 2, yc, a / 2), stadium(L - tipW / 2, yc, L - tipW / 2, tipW / 2, tipW)]; break;
    case "ball": cs = [tab, rect(0, yc - a * 0.35, L - r, a * 0.7), circle(L - r, yc, r)]; break;
    case "angled": {
      // a Shaker-style peg: an arm rising 25° to a ball, so keys and straps slide back, not off
      const k = deg(25), ex = (L - r) * Math.cos(k), ey = yc - (L - r) * Math.sin(k);
      cs = [tab, stadium(a * 0.4, yc - a * 0.4 * Math.tan(k), ex, ey, a * 0.75), rect(0, yc - a * 0.375 - a * 0.4 * Math.tan(k), a * 0.8, a * 0.75 + a * 0.4 * Math.tan(k)), circle(ex, ey, r * 0.85)];
      break;
    }
    case "double": {
      // a coat hook: a long lower arm with an upturned tip and a short upper arm angled up
      const up = deg(35), ux = L * 0.45 * Math.cos(up), uy = yc - a * 0.5 - L * 0.45 * Math.sin(up);
      cs = [tab, rect(0, tipH, L - a / 2, a), circle(L - a / 2, yc, a / 2), stadium(L - tipW / 2, yc, L - tipW / 2, tipW / 2, tipW),
        stadium(a * 0.35, yc - a * 0.5 - a * 0.35 * Math.tan(up), ux, uy, a * 0.6), circle(ux, uy, a * 0.4), rect(0, yc - a * 0.8 - a * 0.35 * Math.tan(up), a * 0.7, a * 0.8 + a * 0.35 * Math.tan(up))];
      break;
    }
  }
  return { outer: largest(cs), yc, tabH };
}

function keyhole(x: number, y: number): Contour {
  return largest([circle(x, y + 4, 4.5), stadium(x, y + 4, x, y - 5, 4.4)]);
}

export function buildKeyrack(p: KeyrackParams, ctx: BuildContext): KeyrackOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const T = p.T, b = p.board, W = b.width, H = b.height;
  const outline = orient(shapeOutline(b.shape, W, H, b.corner));
  const missing: string[] = [];
  let loading = false;
  const holes: Contour[] = [];
  const outside: string[] = [];
  const inside = (pt: Pt) => pointInContour(pt, outline);
  const m2 = material2(p.mat.mat2);

  // Text and motif, centred as a group.
  const t = textBlock(ctx, p.text.text, p.text.fontId, p.text.size, { spacing: p.text.spacing, missing, noWeld: p.text.noWeld, style: { ...p.textStyle, ...p.textForm } });
  const mr = motifRef(p.motif.kind, p.motif.art, ctx, missing);
  if (t.loading || mr.loading) loading = true;
  let content: Contour[] = [...t.contours];
  // each glyph's outlines (a motif is one glyph), moved with the content, for No Weld
  let glyphs: Contour[][] = t.glyphs?.length ? [...t.glyphs] : t.contours.length ? [t.contours] : [];
  const addMotif = (m: Contour[]) => { content.push(...m); glyphs.push(m); };
  if (mr.ref) {
    const id = mr.ref, sz = p.motif.size;
    const s = motifSize(id, sz), g = p.motif.gap, w = t.width, h = t.height;
    const has = t.contours.length > 0;
    switch (has ? p.motif.side : "above") {
      case "left": addMotif(motif(id, sz, -w / 2 - g - s.w / 2, 0)); break;
      case "right": addMotif(motif(id, sz, w / 2 + g + s.w / 2, 0)); break;
      case "both": addMotif(motif(id, sz, -w / 2 - g - s.w / 2, 0)); addMotif(motif(id, sz, w / 2 + g + s.w / 2, 0, true)); break;
      case "above": addMotif(motif(id, sz, 0, has ? -h / 2 - g - s.h / 2 : 0)); break;
    }
  }
  let contentW = 0;
  if (content.length) {
    const cb = bboxOf(content);
    contentW = cb.x1 - cb.x0;
    const dx = W / 2 - (cb.x0 + cb.x1) / 2, dy = (H * p.text.y) / 100 - (cb.y0 + cb.y1) / 2;
    content = move(content, dx, dy);
    glyphs = glyphs.map((g) => move(g, dx, dy));
  }

  // Hooks.
  const n = p.hooks.count;
  const rowY = (H * p.hooks.y) / 100;
  const xs = n <= 0 ? [] : n === 1 ? [W / 2] : Array.from({ length: n }, (_, i) => p.hooks.margin + ((W - 2 * p.hooks.margin) * i) / (n - 1));
  const parts: GenPart[] = [];
  const hk = hookProfile(p);
  xs.forEach((u, i) => {
    if (p.hooks.style === "hook") {
      holes.push(rect(u - T / 2, rowY - hk.tabH / 2, T, hk.tabH));
      if (![[u - T / 2, rowY - hk.tabH / 2], [u + T / 2, rowY + hk.tabH / 2]].every((q) => inside(q as Pt))) outside.push(`Hook ${i + 1}`);
      parts.push({ id: `hook${i + 1}`, name: `Hook ${i + 1}`, outer: hk.outer, holes: [], place: { x: u + T / 2, y: -hk.yc - (H - rowY), z: T, upright: true, yaw: 90 } });
    } else {
      const d = p.hooks.style === "screw" ? Math.min(p.hooks.hole, 5) : p.hooks.hole;
      holes.push(circle(u, rowY, d / 2));
      if (![[u - d / 2, rowY], [u + d / 2, rowY], [u, rowY - d / 2], [u, rowY + d / 2]].every((q) => inside(q as Pt))) outside.push(`Hole ${i + 1}`);
    }
  });

  // Magnets sit in through holes, on a strip glued behind the row (so they cannot push out the back).
  if (p.hooks.style === "magnet" && xs.length) {
    const d = p.hooks.hole, pad = 8;
    const sx0 = xs[0] - d / 2 - pad, sx1 = xs[xs.length - 1] + d / 2 + pad, sh = d + 2 * pad;
    const strip = roundedRect(sx0, rowY - sh / 2, sx1 - sx0, sh, Math.min(6, sh / 2 - 0.5));
    if (![[sx0 + 3, rowY - sh / 2 + 3], [sx1 - 3, rowY - sh / 2 + 3], [sx0 + 3, rowY + sh / 2 - 3], [sx1 - 3, rowY + sh / 2 - 3]].every((q) => inside(q as Pt))) outside.push("Magnet strip");
    parts.push({ id: "magnet-strip", name: "Magnet strip", outer: move([strip], -sx0, 0)[0], holes: [], place: { x: sx0, y: -H, z: -T, upright: true } });
  }

  // Names above the hooks.
  const names = p.hooks.labels.split(/\r?\n/).map((s) => s.trim());
  const labels: Contour[] = [];
  const top = p.hooks.style === "hook" ? hk.tabH / 2 : p.hooks.hole / 2;
  xs.forEach((u, i) => {
    const name = names[i];
    if (!name) return;
    const lt = textBlock(ctx, name, p.hooks.labelFont, p.hooks.labelSize, { missing });
    if (lt.loading) { loading = true; return; }
    labels.push(...move(lt.contours, u, rowY - top - 4 - lt.height / 2));
  });

  // Mail pocket: a bottom slotted into the board, two sides slotted into the board and the bottom,
  // and a front that stands in slots near the bottom's front edge.
  let pocketTop = 0, pocketBottom = 0;
  if (p.shelf.on && p.shelf.kind === "pocket") {
    const y0 = p.shelf.at, h = p.shelf.height, y1 = y0 + h, D = p.shelf.depth, x0 = Math.min(10, W * 0.05), SW = W - 2 * x0;
    pocketTop = y0; pocketBottom = y1;
    const wallH = h - T, sideD = D - T, BD = D + 4;
    const tabsX = [W * 0.25, W * 0.75];
    for (const sx of tabsX) holes.push(rect(sx - 12, y1 - T, 24, T));
    const sidesX = [x0 + T / 2 + 3, x0 + SW - T / 2 - 3];
    const frontX = [SW * 0.25, SW * 0.75];
    const bottom = largest([rect(0, 0, SW, BD), ...tabsX.map((sx) => rect(sx - x0 - 12, -T, 24, T + 1))]);
    const bottomSlots = [
      ...sidesX.map((bx) => rect(bx - x0 - T / 2, sideD * 0.3, T, sideD * 0.4)),
      ...frontX.map((fx) => rect(fx - 12, D - T, 24, T)),
    ];
    parts.push({ id: "pocket-bottom", name: "Pocket bottom", outer: bottom, holes: bottomSlots, place: { x: x0, y: T, z: H - y1 } });
    const side = largest([rect(0, 0, sideD, wallH), rect(-T, wallH * 0.25, T + 1, wallH * 0.4), rect(sideD * 0.3, wallH - 1, sideD * 0.4, T + 1)]);
    sidesX.forEach((bx, k) => {
      holes.push(rect(bx - T / 2, y0 + wallH * 0.25, T, wallH * 0.4));
      parts.push({ id: `pocket-side${k + 1}`, name: `Pocket side ${k + 1}`, outer: side, holes: [], place: { x: bx + T / 2, y: -(H - y0), z: T, upright: true, yaw: 90 } });
    });
    const front = largest([roundedRect(0, 0, SW, wallH, Math.min(6, wallH / 4)), ...frontX.map((fx) => rect(fx - 12, wallH - 1, 24, T + 1))]);
    parts.push({ id: "pocket-front", name: "Pocket front", outer: front, holes: [], place: { x: x0, y: -(H - y0), z: D, upright: true } });
    if (![[x0, y1], [x0 + SW, y1], [sidesX[0], y0 + wallH * 0.25], [sidesX[1], y0 + wallH * 0.25]].every((q) => inside(q as Pt))) outside.push("Pocket slots");
  }

  // Shelf with two brackets.
  if (p.shelf.on && p.shelf.kind === "shelf") {
    const at = p.shelf.at, D = p.shelf.depth, x0 = Math.min(10, W * 0.05), SW = W - 2 * x0;
    const tabsX = [W * 0.25, W * 0.75];
    for (const sx of tabsX) holes.push(rect(sx - 12, at - T / 2, 24, T));
    const shelf = largest([roundedRect(0, 0, SW, D, 3), ...tabsX.map((sx) => rect(sx - x0 - 12, -T, 24, T + 1))]);
    parts.push({ id: "shelf", name: "Shelf", outer: shelf, holes: [], place: { x: x0, y: T, z: H - at - T / 2 } });
    const bh = Math.max(20, Math.min(D * 0.8, H - at - T / 2 - 8)), Lb = D * 0.85;
    const bracket = largest([[[0, 0], [Lb, 0], [0, bh]], rect(-T, bh * 0.2, T + 1, bh * 0.5)]);
    for (const [k, bx] of [x0 + 14, x0 + SW - 14].entries()) {
      holes.push(rect(bx - T / 2, at + T / 2 + bh * 0.2, T, bh * 0.5));
      parts.push({ id: `bracket${k + 1}`, name: `Shelf bracket ${k + 1}`, outer: bracket, holes: [], place: { x: bx + T / 2, y: -(H - at - T / 2), z: T, upright: true, yaw: 90 } });
    }
  }

  // Wall mounting.
  if (p.mount.kind !== "none") {
    // Both holes at the same height so the board hangs level; on a roof, cloud or other shaped top the
    // pair slides down (then inward) from the asked height until each hole sits wholly in the board.
    const fits = (mx: number, my: number) => [[0, -7], [0, 10], [-6, 0], [6, 0], [-5, 7], [5, 7]].every(([dx, dy]) => inside([mx + dx, my + dy]));
    let my = (H * p.mount.y) / 100, xs2 = [W * 0.18, W * 0.82];
    search: for (const inset of [0, 0.05, 0.1, 0.15]) {
      const tryXs = [W * (0.18 + inset), W * (0.82 - inset)];
      for (let y = my; y <= H * 0.55; y += 1) if (tryXs.every((x) => fits(x, y))) { my = y; xs2 = tryXs; break search; }
    }
    for (const mx of xs2) {
      holes.push(p.mount.kind === "keyhole" ? keyhole(mx, my) : circle(mx, my, 2.5));
      if (!fits(mx, my)) outside.push("Wall-mount hole");
    }
  }

  const engrave: Contour[] = [];
  const score: Contour[] = [];
  if (content.length && (p.text.mark === "engrave" || p.text.mark === "score")) {
    const m = markLetters({ contours: content, glyphs }, p.text.mark, p.text.noWeld);
    engrave.push(...(m.engrave ?? []));
    score.push(...(m.score ?? []));
  }
  if (labels.length) {
    const u = shapeContours(unionShapes(labels));
    if (p.text.mark === "score") score.push(...u.map(closed)); else engrave.push(...u);
  }
  tagMarks({ engrave, score }, [{ item: "Text", cs: content.slice(0, t.contours.length) }, { item: "Motif", cs: content.slice(t.contours.length) }, { item: "Hook labels", cs: labels }]);
  if (b.frame) score.push(...shapeContours(offsetShapes([makeShape(outline, [])], -Math.max(4, Math.min(W, H) * 0.035))).map(closed));

  parts.unshift({ id: "board", name: "Board", outer: outline, holes, engrave, score, place: { x: 0, y: -H, z: 0, upright: true } });
  let mixed = false;
  if (p.text.mark === "raised" && content.length) {
    // one welded piece, or with No Weld every glyph and dot as its own piece
    const pieces = raisedLetters({ contours: content, glyphs }, { border: 0.8, minHole: 2, noWeld: p.text.noWeld });
    pieces.forEach((s, k) => parts.splice(1 + k, 0, { id: pieces.length > 1 ? `letters-${k + 1}` : "letters", name: pieces.length > 1 ? `Raised letters, piece ${k + 1}` : "Raised letters", outer: s.outer, holes: s.holes, material: "second", color: m2.color, t: p.mat.T2, place: { x: 0, y: -H, z: T, upright: true } }));
    mixed = pieces.length > 0;
  }

  const spacing = xs.length > 1 ? xs[1] - xs[0] : 0;
  return {
    parts,
    stats: [
      { label: "Board", value: `${r0(W)} × ${r0(H)} mm` },
      { label: p.hooks.style === "hook" ? "Hooks" : p.hooks.style === "peg" ? "Peg holes" : p.hooks.style === "magnet" ? "Magnets" : "Screw holes", value: n ? `${n}${p.hooks.style === "magnet" ? ` × ${p.hooks.hole} × ${p.hooks.magnetT} mm discs` : ""}${spacing ? `, ${r0(spacing)} mm apart` : ""}` : "none" },
      ...(p.shelf.on ? [{ label: p.shelf.kind === "pocket" ? "Mail pocket" : "Shelf", value: `${r0(W - 2 * Math.min(10, W * 0.05))} × ${r0(p.shelf.depth)} mm${p.shelf.kind === "pocket" ? `, ${r0(p.shelf.height)} mm high` : ""}` }] : []),
    ],
    assembly: [
      ...(p.hooks.style === "hook" ? ["Push each hook's tab into its slot from the front, arm up, and glue it flush at the back."] : []),
      ...(p.hooks.style === "peg" ? [`Glue ${p.hooks.hole} mm dowels about ${r0(p.hooks.reach + T)} mm long into the peg holes.`] : []),
      ...(p.hooks.style === "screw" ? ["Twist a brass cup hook into each pilot hole."] : []),
      ...(p.hooks.style === "magnet" && n ? [`Glue the magnet strip behind the row of holes, then glue a ${p.hooks.hole} × ${p.hooks.magnetT} mm disc magnet into each hole, flush with the front (all the same pole outward).`] : []),
      ...(p.shelf.on && p.shelf.kind === "shelf" ? ["Glue the brackets into their slots, then slide the shelf's tabs into the board and glue it onto the brackets."] : []),
      ...(p.shelf.on && p.shelf.kind === "pocket" ? ["Slide the pocket bottom's tabs into the board, push the two sides into their slots in the board and the bottom, then stand the front in its slots and glue it to the sides."] : []),
      ...(mixed ? ["Glue the raised letters on with a few dots of clear glue or double-sided tape."] : []),
      p.mount.kind === "keyhole" ? "Drive two screws into the wall at the keyhole spacing, leave the heads 3 mm proud, and hang the board on them." : p.mount.kind === "holes" ? "Screw the board to the wall through the two holes." : "Stand the board on a shelf or hang it with adhesive strips.",
    ],
    notice: loading ? "Loading the font." : undefined,
    missing: missing.length ? missing : undefined,
    materials: mixed ? { main: MATERIALS[p.material]?.name ?? `Main material ${T} mm`, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
    info: { W, H, contentW, room: W - 2 * Math.max(10, b.corner), spacing, outside, pocketTop, pocketBottom, rowTop: n ? (p.hooks.style === "hook" ? Math.min(rowY - hk.tabH / 2, rowY - hk.yc + bboxOf([hk.outer]).y0) : rowY - p.hooks.hole / 2) : H },
  };
}
