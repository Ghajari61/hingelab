import { MATERIALS } from "@/lib/hinge/defaults";
import { makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, pointInContour, rect, roundedRect, stadium } from "../geom";
import { tagMarks } from "../items";
import { material2 } from "../material2";
import { motif, motifSize } from "../motifs";
import { motifRef } from "../motifRef";
import { orient, shapeOutline } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock, weld } from "../weld";
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
  const t = textBlock(ctx, p.text.text, p.text.fontId, p.text.size, { spacing: p.text.spacing, missing, style: { ...p.textStyle, ...p.textForm } });
  const mr = motifRef(p.motif.kind, p.motif.art, ctx, missing);
  if (t.loading || mr.loading) loading = true;
  let content: Contour[] = [...t.contours];
  if (mr.ref) {
    const id = mr.ref, sz = p.motif.size;
    const s = motifSize(id, sz), g = p.motif.gap, w = t.width, h = t.height;
    const has = t.contours.length > 0;
    switch (has ? p.motif.side : "above") {
      case "left": content.push(...motif(id, sz, -w / 2 - g - s.w / 2, 0)); break;
      case "right": content.push(...motif(id, sz, w / 2 + g + s.w / 2, 0)); break;
      case "both": content.push(...motif(id, sz, -w / 2 - g - s.w / 2, 0), ...motif(id, sz, w / 2 + g + s.w / 2, 0, true)); break;
      case "above": content.push(...motif(id, sz, 0, has ? -h / 2 - g - s.h / 2 : 0)); break;
    }
  }
  let contentW = 0;
  if (content.length) {
    const cb = bboxOf(content);
    contentW = cb.x1 - cb.x0;
    content = move(content, W / 2 - (cb.x0 + cb.x1) / 2, (H * p.text.y) / 100 - (cb.y0 + cb.y1) / 2);
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
      const d = p.hooks.style === "peg" ? p.hooks.hole : Math.min(p.hooks.hole, 5);
      holes.push(circle(u, rowY, d / 2));
      if (![[u - d / 2, rowY], [u + d / 2, rowY], [u, rowY - d / 2], [u, rowY + d / 2]].every((q) => inside(q as Pt))) outside.push(`Hole ${i + 1}`);
    }
  });

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

  // Shelf with two brackets.
  if (p.shelf.on) {
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
    const my = (H * p.mount.y) / 100;
    for (const mx of [W * 0.18, W * 0.82]) {
      holes.push(p.mount.kind === "keyhole" ? keyhole(mx, my) : circle(mx, my, 2.5));
      if (!inside([mx, my - 6]) || !inside([mx, my + 9])) outside.push("Wall-mount hole");
    }
  }

  const engrave: Contour[] = [];
  const score: Contour[] = [];
  if (content.length) {
    const u = shapeContours(unionShapes(content));
    if (p.text.mark === "engrave") engrave.push(...u);
    if (p.text.mark === "score") score.push(...u.map(closed));
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
    const s = weld(content, { border: 0.8, minHole: 2 });
    if (s) {
      parts.splice(1, 0, { id: "letters", name: "Raised letters", outer: s.outer, holes: s.holes, material: "second", color: m2.color, t: p.mat.T2, place: { x: 0, y: -H, z: T, upright: true } });
      mixed = true;
    }
  }

  const spacing = xs.length > 1 ? xs[1] - xs[0] : 0;
  return {
    parts,
    stats: [
      { label: "Board", value: `${r0(W)} × ${r0(H)} mm` },
      { label: p.hooks.style === "hook" ? "Hooks" : p.hooks.style === "peg" ? "Peg holes" : "Screw holes", value: n ? `${n}${spacing ? `, ${r0(spacing)} mm apart` : ""}` : "none" },
      ...(p.shelf.on ? [{ label: "Shelf", value: `${r0(W - 2 * Math.min(10, W * 0.05))} × ${r0(p.shelf.depth)} mm` }] : []),
    ],
    assembly: [
      ...(p.hooks.style === "hook" ? ["Push each hook's tab into its slot from the front, arm up, and glue it flush at the back."] : []),
      ...(p.hooks.style === "peg" ? [`Glue ${p.hooks.hole} mm dowels about ${r0(p.hooks.reach + T)} mm long into the peg holes.`] : []),
      ...(p.hooks.style === "screw" ? ["Twist a brass cup hook into each pilot hole."] : []),
      ...(p.shelf.on ? ["Glue the brackets into their slots, then slide the shelf's tabs into the board and glue it onto the brackets."] : []),
      ...(mixed ? ["Glue the raised letters on with a few dots of clear glue or double-sided tape."] : []),
      p.mount.kind === "keyhole" ? "Drive two screws into the wall at the keyhole spacing, leave the heads 3 mm proud, and hang the board on them." : p.mount.kind === "holes" ? "Screw the board to the wall through the two holes." : "Stand the board on a shelf or hang it with adhesive strips.",
    ],
    notice: loading ? "Loading the font." : undefined,
    missing: missing.length ? missing : undefined,
    materials: mixed ? { main: MATERIALS[p.material]?.name ?? `Main material ${T} mm`, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
    info: { W, H, contentW, room: W - 2 * Math.max(10, b.corner), spacing, outside },
  };
}
