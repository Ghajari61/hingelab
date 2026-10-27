import { MATERIALS } from "@/lib/hinge/defaults";
import { differenceShapes, dropSpecks, makeShape, offsetShapes, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, pointInContour, rect, stadium, transform } from "../geom";
import { tagByPlace, tagMarks, type ItemBlock } from "../items";
import { material2 } from "../material2";
import { motif, motifSize, type MotifRef } from "../motifs";
import { motifRef } from "../motifRef";
import { orient, shapeOutline } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { bottomAt, distTo, mirrorX, textBlock, weld, letterShapes, letterTraces, withSticks } from "../weld";
import type { SignParams } from "./params";

export interface SignInfo {
  W: number;
  H: number;
  /** Text and motif block, mm. */
  contentW: number;
  contentH: number;
  /** Room for the content inside the board's padding, mm. */
  roomW: number;
  roomH: number;
  /** Narrowest inlay letter, mm (0 when not an inlay). */
  thinInlay: number;
  /** Mounting holes that fall outside the board's shape. */
  outside: string[];
  /** Separate inlay and counter pieces. */
  pieces: number;
  /** Mounting holes that overlap the text and motif's box. */
  onText: number;
}

export type SignOutput = GenOutput & { info?: SignInfo };

const r0 = (v: number) => Math.round(v);
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const closed = (c: Contour): Contour => [...c, c[0]];

/** Highest point of the outline at x (y down), or null when x misses it. */
function topAt(c: Contour, x: number): number | null {
  let y: number | null = null;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [x0, y0] = c[j], [x1, y1] = c[i];
    if ((x0 <= x && x < x1) || (x1 <= x && x < x0)) {
      const yy = y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
      if (y == null || yy < y) y = yy;
    }
  }
  return y;
}

function keyhole(x: number, y: number): Contour {
  const u = unionShapes([orient(circle(x, y + 4, 4.5)), orient(stadium(x, y + 4, x, y - 5, 4.4))]);
  return u.reduce((a, b) => (b.area > a.area ? b : a)).outer;
}

/** The motif around a text block w × h centred on (0, 0). */
function placeMotif(id: MotifRef, m: SignParams["motif"], w: number, h: number, hasText: boolean): Contour[] {
  const s = motifSize(id, m.size), g = m.gap;
  if (!hasText || m.side === "behind") return motif(id, m.size);
  switch (m.side) {
    case "above": return motif(id, m.size, 0, -h / 2 - g - s.h / 2);
    case "below": return motif(id, m.size, 0, h / 2 + g + s.h / 2);
    case "left": return motif(id, m.size, -w / 2 - g - s.w / 2, 0);
    case "right": return motif(id, m.size, w / 2 + g + s.w / 2, 0);
    case "both": return [...motif(id, m.size, -w / 2 - g - s.w / 2, 0), ...motif(id, m.size, w / 2 + g + s.w / 2, 0, true)];
  }
}

/** Narrowest width of a shape: twice the largest inset that still leaves something. */
function narrowest(s: Shape): number {
  let lo = 0, hi = 20;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (offsetShapes([s], -mid).length) lo = mid; else hi = mid;
  }
  return 2 * lo;
}

export function buildSign(p: SignParams, ctx: BuildContext): SignOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const T = p.T, missing: string[] = [];
  const m2 = material2(p.mat.mat2);
  const second = (pt: GenPart): GenPart => ({ ...pt, material: "second", color: m2.color, t: p.mat.T2 });

  // Text and motif, centred on (0, 0).
  const t = textBlock(ctx, p.text.text, p.text.fontId, p.text.size, { spacing: p.text.spacing, lead: p.text.lead, align: p.text.align, missing, noWeld: p.style.noWeld, style: { ...p.textStyle, ...p.textForm } });
  const mr = motifRef(p.motif.kind, p.motif.art, ctx, missing);
  if (t.loading || mr.loading) return { parts: [], stats: [], notice: "Loading the font." };
  const hasText = t.contours.length > 0;
  const mot = mr.ref ? placeMotif(mr.ref, p.motif, t.width, t.height, hasText) : [];
  const behind = hasText && mot.length > 0 && p.motif.side === "behind";
  const all = [...t.contours, ...mot];
  const cutout = p.style.kind === "word" || p.style.kind === "neon";
  if (!all.length && cutout) return { parts: [], stats: [], error: "Type some text or pick a motif." };
  const cb = all.length ? bboxOf(all) : { x0: 0, y0: 0, x1: 0, y1: 0 };
  const contentW = cb.x1 - cb.x0, contentH = cb.y1 - cb.y0;
  const ccx = (cb.x0 + cb.x1) / 2, ccy = (cb.y0 + cb.y1) / 2;

  const info: SignInfo = { W: 0, H: 0, contentW, contentH, roomW: 0, roomH: 0, thinInlay: 0, outside: [], pieces: 0, onText: 0 };
  const parts: GenPart[] = [];
  const holes: Contour[] = [];
  const engrave: Contour[] = [];
  const score: Contour[] = [];
  const stand = p.mount.kind === "stand";
  const tabW = 20;

  // The board (or, for a word sign, the welded letters) in a frame starting at (0, 0).
  let outline: Contour;
  let boardHoles: Contour[] = [];
  let content: Contour[];
  let W: number, H: number;
  const separateWord = p.style.kind === "word" && p.style.noWeld && p.style.operation !== "score" && !stand;
  const wordBacker = p.style.kind === "word" && (p.style.operation === "score" || (p.style.noWeld && stand));
  const glyphs = [...(t.glyphs ?? [t.contours]), ...(mot.length ? [mot] : [])];
  let looseWord: Shape[] = [];
  if (cutout) {
    const neon = p.style.kind === "neon";
    let s = neon || wordBacker
      ? weld(all, { border: Math.max(2, p.style.border), solid: true, bridge: Math.max(4, p.style.border) })
      : weld(all, { border: Math.max(0.2, p.style.weld), minHole: 2, bridge: Math.max(2.5, p.style.weld * 2.5) });
    if (!s) return { parts: [], stats: [], error: "The letters are too thin to cut. Raise the weld." };
    if (stand) {
      const b = bboxOf([s.outer]);
      const bar = orient(rect(b.x0 - 4, b.y1 - Math.max(4, p.text.size * 0.12), b.x1 - b.x0 + 8, Math.max(8, p.text.size * 0.22)));
      const u = differenceShapes([orient(s.outer), bar], s.holes.map(orient));
      s = u.reduce((a, c) => (c.area > a.area ? c : a));
    }
    const b = separateWord ? bboxOf(all) : bboxOf([s.outer]);
    if (separateWord) looseWord = letterShapes(all, { noWeld: true, border: 0 }, glyphs).map(q => makeShape(transform(q.outer, { x: -b.x0, y: -b.y0 }), q.holes.map(h => transform(h, { x: -b.x0, y: -b.y0 }))));
    W = b.x1 - b.x0; H = b.y1 - b.y0;
    outline = transform(s.outer, { x: -b.x0, y: -b.y0 });
    boardHoles = s.holes.map((h) => transform(h, { x: -b.x0, y: -b.y0 }));
    content = neon || wordBacker ? move(all, -b.x0, -b.y0) : [];
  } else {
    const auto = p.board.auto && all.length > 0;
    const arch = p.board.shape === "arch" ? 0.14 : 0;
    W = auto ? contentW + 2 * p.board.pad : p.board.width;
    H = auto ? contentH + 2 * p.board.pad + contentW * arch : p.board.height;
    if (auto && ["circle", "star", "scalloped", "octagon", "hexagon", "heart", "diamond", "shield"].includes(p.board.shape)) {
      const k = p.board.shape === "star" ? 1.9 : p.board.shape === "diamond" ? 1.6 : p.board.shape === "heart" ? 1.35 : 1.15;
      W = H = Math.max(W, H) * k;
    }
    outline = orient(shapeOutline(p.board.shape, W, H, p.board.corner));
    const cy = H / 2 + (auto ? (contentW * arch) / 2 : 0) + (H * p.text.offset) / 100;
    content = move(all, W / 2 - ccx, cy - ccy);
  }
  const contentGlyphs = content.length && all.length ? glyphs.map(g => move(g, content[0][0][0] - all[0][0][0], content[0][0][1] - all[0][0][1])) : [];
  info.W = W; info.H = H;
  const pad = cutout ? 0 : Math.max(6, p.board.pad * 0.6);
  info.roomW = W - 2 * pad;
  info.roomH = H - 2 * pad;
  const inside = (pt: Pt) => pointInContour(pt, outline);

  // Stand tabs, under the board.
  const square = cutout || ["rect", "rounded", "house", "banner", "ticket", "tag", "arch", "shield"].includes(p.board.shape);
  const tabXs = square ? [W * 0.22, W * 0.78] : [W * 0.32, W * 0.68];
  if (stand) {
    const s = withSticks(makeShape(orient(outline), boardHoles.map(orient)), tabXs.map((x) => ({ x, length: T, width: tabW, tip: 0 })));
    outline = s.outer;
    boardHoles = s.holes;
  }

  // Marks: knock the text out of a motif behind it so the letters stay readable.
  let markShapes: Shape[] = [];
  if (content.length && p.style.kind !== "word") {
    if (behind) {
      const dx = content[0][0][0] - all[0][0][0], dy = content[0][0][1] - all[0][0][1];
      const text = move(t.contours, dx, dy);
      const mo = move(mot, dx, dy);
      const ring = offsetShapes(unionShapes(text), Math.max(1.2, p.text.size * 0.05));
      markShapes = [...differenceShapes(mo, shapeContours(ring)), ...unionShapes(text)];
    } else markShapes = unionShapes(content);
  }
  const markContours = shapeContours(markShapes);
  const flip = (cs: Contour[]) => (p.style.mirror ? mirrorX(cs, W / 2) : cs);
  const blocks = (): ItemBlock[] => [{ item: "Text", cs: flip(content.slice(0, t.contours.length)) }, { item: "Motif", cs: flip(content.slice(t.contours.length)) }];

  // Border.
  const bw = Math.max(1, p.border.width), inset = Math.max(1, p.border.inset);
  const base = makeShape(outline, []);
  const rimOut = cutout ? [] : offsetShapes([base], -inset);
  const rimIn = rimOut.length ? offsetShapes(rimOut, -bw) : [];
  const rim = rimOut.length ? differenceShapes(shapeContours(rimOut), shapeContours(rimIn)) : [];
  if (p.border.kind === "score" && rimOut.length) score.push(...shapeContours(rimOut).map(closed));
  if (p.border.kind === "engrave") engrave.push(...shapeContours(rim));

  // Mounting.
  const mk = p.mount.kind;
  if (!cutout && (mk === "holes" || mk === "keyhole" || mk === "hanging" || mk === "standoff")) {
    const e = Math.max(10, Math.min(W, H) * 0.08);
    const top = (x: number) => (topAt(outline, x) ?? 0) + e;
    const low = (x: number) => (bottomAt(outline, x) ?? H) - e;
    const at: Pt[] =
      mk === "standoff" ? [[e, top(e)], [W - e, top(W - e)], [e, low(e)], [W - e, low(W - e)]]
      : mk === "hanging" ? [[W * 0.18, top(W * 0.18)], [W * 0.82, top(W * 0.82)]]
      : mk === "keyhole" ? [[W * 0.22, Math.max(H * 0.2, top(W * 0.22) + 4)], [W * 0.78, Math.max(H * 0.2, top(W * 0.78) + 4)]]
      : [[e, top(e)], [W - e, top(W - e)]];
    const d = mk === "keyhole" ? 9 : Math.max(2, p.mount.hole);
    const marks = content.length ? bboxOf(content) : null;
    for (const [x, y] of at) {
      holes.push(mk === "keyhole" ? keyhole(x, y) : circle(x, y, d / 2));
      const r = mk === "keyhole" ? 9.5 : d / 2 + 1.5;
      if (![[x - r, y], [x + r, y], [x, y - r], [x, y + r]].every((q) => inside(q as Pt))) info.outside.push(mk === "standoff" ? "Standoff hole" : "Mounting hole");
      if (marks && x + r > marks.x0 && x - r < marks.x1 && y + r > marks.y0 && y - r < marks.y1) {
        if (distTo([x, y], content) < r + 1 || content.some((c) => pointInContour([x, y], c))) info.onText++;
      }
    }
  }

  const depth = stand ? Math.max(30, p.mount.depth) : 0;
  const z0 = stand ? depth / 2 - T / 2 : 0;
  const lift = stand ? T : 0;
  const place = (z: number) => ({ x: 0, y: -H - lift, z, upright: true });

  switch (p.style.kind) {
    case "engraved": {
      let mc = markContours;
      if (p.style.mirror) mc = mirrorX(mc, W / 2);
      if (p.style.mark === "engrave") engrave.push(...mc); else score.push(...mc.map(closed));
      tagMarks({ engrave, score }, blocks());
      parts.push({ id: "board", name: "Sign", outer: outline, holes: [...boardHoles, ...holes], engrave, score, place: place(z0) });
      break;
    }
    case "layered": {
      parts.push({ id: "board", name: "Board", outer: outline, holes: [...boardHoles, ...holes], engrave, score, place: place(z0) });
      if (content.length && p.style.operation === "score") {
        parts[parts.length - 1].score = [...score, ...letterTraces(content, p.style.noWeld, contentGlyphs)];
      } else if (content.length && p.style.noWeld) {
        letterShapes(content, { noWeld: true, border: 0 }, contentGlyphs).forEach((s, i) => parts.push(second({ id: `letter${i + 1}`, name: `Letter ${i + 1}`, outer: s.outer, holes: s.holes, place: place(z0 + T) })));
      } else if (content.length && p.style.join) {
        const s = weld(content, { border: Math.max(0.2, p.style.weld), minHole: 2, bridge: Math.max(2.5, p.style.weld * 2.5) });
        if (s) parts.push(second({ id: "letters", name: "Letters", outer: s.outer, holes: s.holes, place: place(z0 + T) }));
      } else if (content.length) {
        const pieces = dropSpecks(offsetShapes(unionShapes(content), Math.max(0.2, p.style.weld)), 2);
        pieces.forEach((s, i) => parts.push(second({ id: `letter${i + 1}`, name: `Letter ${i + 1}`, outer: s.outer, holes: s.holes.filter((h) => Math.abs(signedArea(h)) >= 2), place: place(z0 + T) })));
      }
      break;
    }
    case "word": {
      if (separateWord) {
        looseWord.forEach((s, i) => parts.push({ id: `letter${i + 1}`, name: `Letter ${i + 1}`, outer: s.outer, holes: s.holes, place: place(z0) }));
      } else {
        parts.push({ id: "board", name: wordBacker ? "Word backer" : "Word", outer: outline, holes: boardHoles, ...(p.style.operation === "score" ? { score: letterTraces(content, p.style.noWeld, contentGlyphs) } : {}), place: place(z0) });
        if (wordBacker && p.style.operation !== "score") letterShapes(content, { noWeld: true, border: 0 }, contentGlyphs).forEach((s, i) => parts.push(second({ id: `letter${i + 1}`, name: `Letter ${i + 1}`, outer: s.outer, holes: s.holes, place: place(z0 + T) })));
      }
      break;
    }
    case "stencil": {
      const bw = Math.max(1.5, p.text.size * 0.06), cuts: Contour[] = [];
      for (const s of markShapes) {
        if (!s.holes.length) { cuts.push(s.outer); continue; }
        const sb = bboxOf([s.outer]);
        const strips = s.holes.map((h) => {
          const b = bboxOf([h]), cx = (b.x0 + b.x1) / 2;
          return orient(rect(cx - bw / 2, sb.y0 - 1, bw, sb.y1 - sb.y0 + 2));
        });
        for (const q of differenceShapes(shapeContours([s]), strips)) if (q.area >= 1) cuts.push(q.outer);
      }
      parts.push({ id: "board", name: "Stencil", outer: outline, holes: [...boardHoles, ...holes, ...cuts], engrave, score, place: place(z0) });
      break;
    }
    case "neon": {
      const g = Math.max(0.8, p.text.size * 0.03), tw = Math.max(0.8, p.text.size * 0.035);
      const inner = offsetShapes(markShapes, g), outer = offsetShapes(markShapes, g + tw);
      let tube = shapeContours(differenceShapes(shapeContours(outer), shapeContours(inner)));
      if (p.style.mirror) tube = mirrorX(tube, W / 2);
      engrave.push(...tagByPlace(tube, blocks()));
      parts.push({ id: "board", name: "Sign", outer: outline, holes: [...boardHoles, ...holes], engrave, place: place(z0) });
      break;
    }
    case "inlay": {
      const letters = markShapes.length ? markShapes : [];
      const cutHoles = letters.map((s) => s.outer);
      const hidden = mk === "keyhole" && !stand;
      if (hidden) info.onText = 0;
      parts.push({ id: "board", name: "Top board", outer: outline, holes: [...boardHoles, ...(hidden ? [] : holes), ...cutHoles], engrave, score, place: place(z0) });
      let n = 0, c = 0;
      info.thinInlay = letters.length ? Math.min(...letters.map(narrowest)) : 0;
      for (const s of letters) {
        parts.push(second({ id: `inlay${++n}`, name: `Inlay ${n}`, outer: s.outer, holes: s.holes, place: place(z0), t: Math.min(p.mat.T2, T) }));
        for (const h of s.holes) parts.push({ id: `counter${++c}`, name: `Counter ${c}`, outer: orient(h), holes: [], place: place(z0) });
      }
      info.pieces = n + c;
      if (!stand) parts.push({ id: "backer", name: "Backer", outer: outline, holes: [...boardHoles, ...holes], place: place(z0 - T) });
      break;
    }
  }

  if (p.border.kind === "raised" && rim.length) {
    const s = rim.reduce((a, c) => (c.area > a.area ? c : a));
    parts.push(second({ id: "frame", name: "Frame", outer: s.outer, holes: s.holes, place: place(z0 + T) }));
  }

  if (stand) {
    const ext = 12, BW = W + 2 * ext;
    const slots = tabXs.map((x) => rect(x + ext - tabW / 2 - 0.1, depth / 2 - T / 2, tabW + 0.2, T));
    parts.push({ id: "base", name: "Stand base", outer: orient(shapeOutline("rounded", BW, depth, 6)), holes: slots, place: { x: -ext, y: 0, z: 0 } });
  }

  const mixed = parts.some((pt) => pt.material === "second");
  const mat = MATERIALS[p.material]?.name ?? `Main material ${T} mm`;
  const stats = [
    { label: p.style.kind === "word" ? "Word" : "Sign", value: `${r0(W)} × ${r0(H)} mm` },
    ...(info.pieces ? [{ label: "Inlay pieces", value: String(info.pieces) }] : []),
    ...(mixed ? [{ label: "Second material", value: `${m2.name} ${p.mat.T2} mm` }] : []),
    { label: "Parts", value: String(parts.length) },
  ];
  const assembly = [
    ...(mixed ? [`Cut the ${mat} sheets, then the ${m2.name} sheets.`] : []),
    ...((p.style.kind === "engraved" || p.style.kind === "neon") && p.style.mirror ? ["The engraving is mirrored: lay the acrylic face down and engrave the back, then paint or leave it frosted."] : []),
    ...(p.style.kind === "engraved" && !p.style.mirror && engrave.length ? ["Engrave first, then cut without moving the sheet."] : []),
    ...(p.style.kind === "layered" ? ["Glue the letters onto the board with dots of clear epoxy or double-sided tape; press flat for an hour."] : []),
    ...(p.style.kind === "stencil" ? ["Tape the stencil flat and dab or spray light coats; the bridges hold the middles of letters such as O and A in place."] : []),
    ...(p.style.kind === "neon" ? ["Engrave the outlines on clear or frosted acrylic, then cut the outline without moving the sheet.", "Stand the sign in an LED base or light it from the edge; the engraved lines glow like neon tubes."] : []),
    ...(p.style.kind === "inlay" ? ["Glue the top board onto the backer, then press each inlay letter into its hole and each counter back into its letter. A drop of thin glue holds them; sand the face flush."] : []),
    ...(p.border.kind === "raised" ? ["Glue the frame around the edge."] : []),
    ...(stand ? ["Push the sign's two tabs into the base's slots; a drop of glue makes it permanent."] : []),
    ...(mk === "keyhole" && !cutout ? ["Drive two screws into the wall at the keyhole spacing, leave the heads 3 mm proud, and hang the sign on them."] : []),
    ...(mk === "holes" && !cutout ? ["Screw the sign to the wall through the two holes."] : []),
    ...(mk === "hanging" && !cutout ? ["Thread a cord or chain through the two top holes to hang the sign."] : []),
    ...(mk === "standoff" && !cutout ? [`Mount the sign on four ${p.mount.hole} mm standoffs through the corner holes.`] : []),
  ];
  return {
    parts, stats, assembly, info,
    missing: missing.length ? missing : undefined,
    materials: mixed ? { main: mat, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
  };
}
