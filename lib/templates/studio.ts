/**
 * Templates drawn with Studio's own live shapes and Live Effects: they open as editable objects
 * (change a living hinge's pattern, a rosette's count, a hatch's spacing) rather than flat paths.
 * Layers: C00 engrave fill, C01 score, C02 cut, C03 inner cuts (cut first).
 */
import { createEffect } from "@/lib/studio/effects";
import { mul, PathBuilder, rotateAt, translate } from "@/lib/studio/geom";
import { motif, type MotifId } from "@/lib/generators/motifs";
import type { EffectKind, EffectParamsMap, GroupNode, LiveEffect, Mat, PathNode, SceneNode, ShapeNode, ShapeParams, Subpath, TextNode } from "@/lib/studio/types";

export interface StudioTemplate { sheet: { w: number; h: number }; nodes: SceneNode[] }

const ENGRAVE = 0, SCORE = 1, CUT = 2, INNER = 3;

// ---------- shapes ----------

const circle = (r: number): ShapeParams => ({ kind: "ellipse", rx: r, ry: r });
const ellipse = (rx: number, ry: number): ShapeParams => ({ kind: "ellipse", rx, ry });
const rect = (w: number, h: number, r = 0): ShapeParams => ({ kind: "rect", w, h, r: [r, r, r, r], corner: "round" });
const polygon = (sides: number, r: number, round = 0): ShapeParams => ({ kind: "polygon", sides, r, round });
const star = (points: number, r: number, inner: number, round = 0): ShapeParams => ({ kind: "star", points, r, inner, round });
const heart = (w: number, h: number): ShapeParams => ({ kind: "heart", w, h });
const slot = (w: number, h: number): ShapeParams => ({ kind: "slot", w, h });
const gear = (teeth: number, module: number, bore: number): ShapeParams => ({ kind: "gear", teeth, module, pressure: 20, bore });
const spiral = (turns: number, r: number, inner = 0): ShapeParams => ({ kind: "spiral", turns, r, inner });

interface Place { rot?: number; fx?: LiveEffect[]; name?: string }

class Builder {
  constructor(readonly id: () => string) {}

  shape(s: ShapeParams, x: number, y: number, layer: number, o: Place = {}): ShapeNode {
    const m: Mat = o.rot ? mul(translate(x, y), rotateAt(o.rot)) : translate(x, y);
    return { id: this.id(), type: "shape", shape: s, transform: m, layer, ...(o.name ? { name: o.name } : {}), ...(o.fx ? { effects: o.fx } : {}) };
  }

  path(subs: Subpath[], layer: number, o: Place = {}): PathNode {
    return { id: this.id(), type: "path", subpaths: subs, transform: [1, 0, 0, 1, 0, 0], layer, ...(o.name ? { name: o.name } : {}), ...(o.fx ? { effects: o.fx } : {}) };
  }

  group(name: string, children: SceneNode[]): GroupNode {
    return { id: this.id(), type: "group", name, transform: [1, 0, 0, 1, 0, 0], layer: children[0]?.layer ?? CUT, children };
  }

  fx<K extends EffectKind>(kind: K, params: Partial<EffectParamsMap[K]>): LiveEffect {
    const e = createEffect(kind, [], this.id);
    return { ...e, params: { ...e.params, ...params } } as LiveEffect;
  }

  /**
   * Copies around a point `dy` mm below (and `dx` right of) the shape's centre on the page. The effect
   * works in the shape's own, unrotated coordinates, so the point is turned back by the shape's `rot`.
   */
  around(count: number, dy: number, o: { dx?: number; rot?: number; start?: number; fuse?: boolean } = {}): LiveEffect {
    const a = ((o.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = o.dx ?? 0;
    return this.fx("rotateCopies", { count, start: o.start ?? 0, cx: c * dx + s * dy, cy: -s * dx + c * dy, fuse: o.fuse ?? false });
  }

  text(s: string, x: number, y: number, size: number, layer: number, name?: string): TextNode {
    return { id: this.id(), type: "text", text: s, font: "fredoka", size, tracking: 0, lineHeight: 1.2, align: "center", direction: "ltr", transform: translate(x, y), layer, ...(name ? { name } : {}) };
  }

  hinge(o: Partial<EffectParamsMap["livingHinge"]>): LiveEffect {
    return this.fx("livingHinge", { angle: 0, keepOutline: false, ...o });
  }

  hatch(o: Partial<EffectParamsMap["hatches"]>): LiveEffect {
    return this.fx("hatches", o);
  }

  motif(id: MotifId, size: number, x: number, y: number, name?: string): PathNode {
    const subs = motif(id, size, x, y).map((c) => ({ closed: true, nodes: c.map(([px, py]) => ({ x: px, y: py })) }));
    return this.path(subs, ENGRAVE, { name: name ?? `${id[0].toUpperCase()}${id.slice(1)} motif` });
  }
}

const polyline = (pts: [number, number][], closed = true): Subpath[] => {
  const b = new PathBuilder();
  pts.forEach(([x, y], k) => (k ? b.line(x, y) : b.move(x, y)));
  if (closed) b.close();
  return b.done();
};

/** A rectangle with rounded top corners and a slot cut into its top or bottom edge (cross-lap joints). */
function notchedPlate(cx: number, cy: number, w: number, h: number, r: number, slotW: number, slotDepth: number, fromTop: boolean): Subpath[] {
  const L = cx - w / 2, R = cx + w / 2, T = cy - h / 2, Bo = cy + h / 2;
  const b = new PathBuilder().move(L, Bo);
  if (!fromTop) b.line(cx - slotW / 2, Bo).line(cx - slotW / 2, Bo - slotDepth).line(cx + slotW / 2, Bo - slotDepth).line(cx + slotW / 2, Bo);
  b.line(R, Bo).line(R, T + r).arc(R - r, T + r, r, r, 0, -90);
  if (fromTop) b.line(cx + slotW / 2, T).line(cx + slotW / 2, T + slotDepth).line(cx - slotW / 2, T + slotDepth).line(cx - slotW / 2, T);
  b.line(L + r, T).arc(L + r, T + r, r, r, -90, -180).line(L, Bo);
  return b.close().done();
}

const SLOT = 3.1; // 3 mm plywood plus a little play

// ---------- templates ----------

type Make = (b: Builder) => StudioTemplate;

const notebookCover: Make = (b) => {
  const W = 330, H = 216, cx = 180, cy = 120, spine = 30;
  const front = cx + spine / 2 + 74;
  return {
    sheet: { w: 360, h: 240 },
    nodes: [
      b.shape(rect(W, H, 6), cx, cy, CUT, { name: "Cover" }),
      b.shape(rect(spine, H, 0), cx, cy, CUT, { name: "Spine hinge", fx: [b.hinge({ pattern: "straight", slit: 30, bridge: 3, pitch: 2.5, margin: 3 })] }),
      b.shape(slot(10, 3.5), cx - W / 2 + 12, cy - 40, INNER, { name: "Band slot", rot: 90 }),
      b.shape(slot(10, 3.5), cx - W / 2 + 12, cy + 40, INNER, { name: "Band slot", rot: 90 }),
      b.shape(ellipse(5, 16), front, cy - 22, SCORE, { name: "Rosette", fx: [b.around(12, 22)] }),
      b.shape(circle(6), front, cy, SCORE, { name: "Rosette centre" }),
      b.shape(circle(44), front, cy, SCORE, { name: "Rosette ring" }),
    ],
  };
};

const bracelet: Make = (b) => ({
  sheet: { w: 220, h: 60 },
  nodes: [
    b.shape(rect(190, 36, 18), 110, 30, CUT, { name: "Cuff" }),
    b.shape(rect(140, 36, 0), 110, 30, CUT, { name: "Wave hinge", fx: [b.hinge({ pattern: "wave", slit: 12, bridge: 2.5, pitch: 2.2, margin: 3 })] }),
    b.shape(circle(2.2), 25, 30, INNER, { name: "Cord hole" }),
    b.shape(circle(2.2), 195, 30, INNER, { name: "Cord hole" }),
  ],
});

const lampWrap: Make = (b) => ({
  sheet: { w: 420, h: 180 },
  nodes: [
    b.shape(rect(400, 160, 0), 210, 90, CUT, { name: "Shade wrap", fx: [b.hinge({ pattern: "serpentine", slit: 24, bridge: 3, pitch: 3, margin: 14, keepOutline: true })] }),
    b.path(polyline([[25, 18], [25, 162]], false), SCORE, { name: "Glue line" }),
  ],
});

const cardWallet: Make = (b) => ({
  sheet: { w: 230, h: 90 },
  nodes: [
    b.shape(rect(210, 70, 8), 115, 45, CUT, { name: "Wallet" }),
    b.shape(rect(22, 70, 0), 115, 45, CUT, { name: "Fold hinge", fx: [b.hinge({ pattern: "straight", slit: 14, bridge: 2.5, pitch: 2, margin: 3 })] }),
    b.shape(heart(26, 23), 172, 45, SCORE, { name: "Heart", fx: [b.hatch({ angle: 45, spacing: 2, inset: 0.6, keepOutline: true })] }),
  ],
});

const mandalaCoasters: Make = (b) => {
  const r = 47.5, at = [[55, 55], [165, 55], [55, 165], [165, 165]] as const;
  const [a, c, d, e] = at;
  return {
    sheet: { w: 220, h: 220 },
    nodes: [
      b.group("Petal coaster", [
        b.shape(circle(r), a[0], a[1], CUT, { name: "Coaster" }),
        b.shape(ellipse(6, 16), a[0], a[1] - 22, SCORE, { name: "Petals", fx: [b.around(12, 22)] }),
        b.shape(ellipse(3, 7), a[0], a[1] - 38, SCORE, { name: "Outer petals", fx: [b.around(12, 38, { start: 15 })] }),
        b.shape(circle(5), a[0], a[1], SCORE, { name: "Centre" }),
      ]),
      b.group("Star coaster", [
        b.shape(circle(r), c[0], c[1], CUT, { name: "Coaster" }),
        b.shape(star(8, 32, 0.45), c[0], c[1], SCORE, { name: "Star", fx: [b.hatch({ angle: 30, spacing: 2.2, inset: 0.5, keepOutline: true })] }),
        b.shape(circle(39), c[0], c[1], SCORE, { name: "Ring" }),
      ]),
      b.group("Hexagon coaster", [
        b.shape(circle(r), d[0], d[1], CUT, { name: "Coaster" }),
        ...[10, 18, 26, 34].map((rr, k) => b.shape(polygon(6, rr), d[0], d[1], SCORE, { name: "Hexagon", rot: k % 2 ? 30 : 0 })),
      ]),
      b.group("Spiral coaster", [
        b.shape(circle(r), e[0], e[1], CUT, { name: "Coaster" }),
        b.shape(spiral(6, 38, 2), e[0], e[1], SCORE, { name: "Spiral" }),
      ]),
    ],
  };
};

const snowflakes: Make = (b) => {
  // six arms turned 30° so the hanging hole sits between two of them; each arm carries a V of branches
  const flake = (cx: number, outline: ShapeParams, arm: number, hole: number, name: string) => {
    const at = arm * 0.6, len = arm * 0.34, d = Math.SQRT1_2 * (len / 2 - 1);
    const branch = (side: 1 | -1) => b.shape(slot(3, len), cx + side * d, 50 - at - d, INNER, {
      name: side > 0 ? "Right branches" : "Left branches", rot: side * 45,
      fx: [b.around(6, at + d, { dx: -side * d, rot: side * 45, start: 30, fuse: true })],
    });
    return b.group(name, [
      b.shape(outline, cx, 50, CUT, { name: "Ornament" }),
      b.shape(slot(3.6, arm), cx, 50 - arm / 2, INNER, { name: "Arms", fx: [b.around(6, arm / 2, { start: 30, fuse: true })] }),
      branch(1), branch(-1),
      b.shape(circle(1.8), cx, 50 - hole, INNER, { name: "Hanging hole" }),
    ]);
  };
  return {
    sheet: { w: 270, h: 100 },
    nodes: [
      flake(47, circle(40), 30, 35, "Round snowflake"),
      flake(135, polygon(12, 41, 2), 30, 35, "Twelve-sided snowflake"),
      flake(223, star(12, 42, 0.93, 0.5), 28, 33, "Scalloped snowflake"),
    ],
  };
};

const hatchOrnaments: Make = (b) => {
  const items: SceneNode[] = [];
  const kinds: { s: ShapeParams; hatch: Partial<EffectParamsMap["hatches"]>; hole: number; name: string }[] = [
    { s: heart(66, 60), hatch: { angle: 45, spacing: 2.5 }, hole: -9, name: "Heart" },
    { s: star(5, 38, 0.48, 0.15), hatch: { angle: 0, spacing: 2.4, cross: true }, hole: -24, name: "Star" },
    { s: circle(32), hatch: { angle: 90, spacing: 3 }, hole: -26, name: "Bauble" },
    { s: polygon(6, 34, 3), hatch: { angle: 60, spacing: 2.5 }, hole: -26, name: "Hexagon" },
    { s: ellipse(26, 34), hatch: { angle: -30, spacing: 2.6, cross: true }, hole: -28, name: "Egg" },
    { s: star(8, 36, 0.62, 0.3), hatch: { angle: 22.5, spacing: 2.5 }, hole: -27, name: "Sparkle" },
  ];
  kinds.forEach((k, i) => {
    const x = 45 + (i % 3) * 85, y = 45 + Math.floor(i / 3) * 85;
    items.push(b.group(`${k.name} ornament`, [
      b.shape(k.s, x, y, CUT, { name: k.name }),
      b.shape(k.s, x, y, SCORE, { name: `${k.name} hatching`, fx: [b.hatch({ ...k.hatch, inset: 5, keepOutline: false })] }),
      b.shape(circle(1.8), x, y + k.hole, INNER, { name: "Hanging hole" }),
    ]));
  });
  return { sheet: { w: 260, h: 180 }, nodes: items };
};

const gearFidget: Make = (b) => {
  const m = 3, peg = 6.2;
  // peg centres a pitch radius apart (plus play) so the 12-, 18- and 24-tooth gears mesh in a row
  const r = [12, 18, 24].map((t) => (t * m) / 2);
  const c1 = { x: 50, y: 80 }, c2 = { x: c1.x + r[0] + r[1] + 0.3, y: 80 }, c3 = { x: c2.x + r[1] + r[2] + 0.3, y: 80 };
  return {
    sheet: { w: 420, h: 160 },
    nodes: [
      b.group("Base", [
        b.shape(rect(200, 140, 12), 110, 80, CUT, { name: "Base plate" }),
        ...[c1, c2, c3].map((c) => b.shape(circle(peg / 2), c.x, c.y, INNER, { name: "Peg hole" })),
      ]),
      b.shape(gear(12, m, peg), 250, 45, CUT, { name: "Gear 12" }),
      b.shape(gear(18, m, peg), 250, 118, CUT, { name: "Gear 18" }),
      b.shape(gear(24, m, peg), 345, 80, CUT, { name: "Gear 24" }),
      b.shape(circle(peg / 2 + 5), 345, 80, SCORE, { name: "Hub ring" }),
      ...[0, 1, 2].map((k) => b.shape(rect(peg, 22, 1), 400 + (k % 2) * 10, 30 + k * 30, CUT, { name: "Peg (or a 6 mm dowel)" })),
    ],
  };
};

const tangram: Make = (b) => {
  const s = 150 / 4, ox = 10, oy = 10;
  const P = (pts: [number, number][]) => polyline(pts.map(([x, y]) => [ox + x * s, oy + y * s] as [number, number]));
  const pieces: [string, [number, number][]][] = [
    ["Large triangle", [[0, 0], [4, 0], [2, 2]]],
    ["Large triangle", [[0, 0], [2, 2], [0, 4]]],
    ["Small triangle", [[4, 0], [4, 2], [3, 1]]],
    ["Square", [[3, 1], [4, 2], [3, 3], [2, 2]]],
    ["Small triangle", [[2, 2], [3, 3], [1, 3]]],
    ["Parallelogram", [[0, 4], [1, 3], [3, 3], [2, 4]]],
    ["Medium triangle", [[4, 2], [4, 4], [2, 4]]],
  ];
  return {
    sheet: { w: 360, h: 190 },
    nodes: [
      b.group("Tangram pieces", pieces.map(([name, pts]) => b.path(P(pts), CUT, { name }))),
      b.group("Tray frame", [
        b.shape(rect(175, 175, 10), 265, 95, CUT, { name: "Frame" }),
        b.shape(rect(151, 151, 0), 265, 95, INNER, { name: "Opening" }),
      ]),
    ],
  };
};

const headphoneStand: Make = (b) => {
  const hex = (cx: number, cy: number) => [-28, 28].flatMap((dx) => [-35, 0, 35].map((dy) => b.shape(polygon(6, 10, 1.5), cx + dx, cy + dy, INNER, { name: "Window", rot: 30 })));
  return {
    sheet: { w: 260, h: 280 },
    nodes: [
      b.group("Front plate", [b.path(notchedPlate(65, 140, 110, 250, 30, SLOT, 125, true), CUT, { name: "Plate with top slot" }), ...hex(65, 200)]),
      b.group("Back plate", [b.path(notchedPlate(195, 140, 110, 250, 30, SLOT, 125, false), CUT, { name: "Plate with bottom slot" }), ...hex(195, 80)]),
    ],
  };
};

const earringCards: Make = (b) => {
  const motifs: MotifId[] = ["heart", "star", "flower", "leaf", "moon", "butterfly", "sparkle", "gem"];
  return {
    sheet: { w: 290, h: 200 },
    nodes: motifs.map((id, i) => {
      const x = 40 + (i % 4) * 70, y = 52 + Math.floor(i / 4) * 96;
      return b.group(`Earring card ${i + 1}`, [
        b.shape(rect(60, 85, 6), x, y, CUT, { name: "Card" }),
        b.shape(slot(16, 4), x, y - 34, INNER, { name: "Hanging slot" }),
        ...[-12, 12].flatMap((dx) => [-12, 6].map((dy) => b.shape(circle(0.8), x + dx, y + dy, INNER, { name: "Earring hole" }))),
        b.motif(id, 14, x, y + 28),
      ]);
    }),
  };
};

const plantMarkers: Make = (b) => {
  const motifs: MotifId[] = ["leaf", "flower", "sun", "butterfly", "tree", "heart", "star", "cloud"];
  const stake = (cx: number): Subpath[] => {
    const top = 10, w = 40, lh = 30, sw = 10, tip = 140;
    const r = 8;
    return new PathBuilder()
      .move(cx - w / 2, top + r).arc(cx - w / 2 + r, top + r, r, r, 180, 270)
      .line(cx + w / 2 - r, top).arc(cx + w / 2 - r, top + r, r, r, -90, 0)
      .line(cx + w / 2, top + lh).line(cx + sw / 2, top + lh + 6).line(cx + sw / 2, tip - 12).line(cx, tip)
      .line(cx - sw / 2, tip - 12).line(cx - sw / 2, top + lh + 6).line(cx - w / 2, top + lh)
      .close().done();
  };
  return {
    sheet: { w: 390, h: 150 },
    nodes: motifs.map((id, i) => {
      const cx = 30 + i * 47;
      return b.group(`Plant marker ${i + 1}`, [b.path(stake(cx), CUT, { name: "Stake" }), b.motif(id, 18, cx, 25)]);
    }),
  };
};

/** A smooth ridge for shadow boxes: y on a 150 mm panel for x across the opening. */
function ridge(x: number, base: number, amp: number, seed: number, waves = false): number {
  const k = waves ? 0.09 : 0.045;
  return base - amp * (0.55 * Math.sin(x * k + seed * 1.7) + 0.3 * Math.sin(x * k * 2.4 + seed * 0.6) + 0.15 * Math.sin(x * k * 5.1 + seed));
}

function shadowBox(b: Builder, title: string, layers: { base: number; amp: number; seed: number }[], waves: boolean, back: (cx: number, cy: number) => SceneNode[]): StudioTemplate {
  const S = 150, border = 12, gap = 15;
  const nodes: SceneNode[] = [];
  const cells = [...layers.map((l) => l as typeof l | null), null];
  cells.forEach((l, i) => {
    const ox = 10 + (i % 2) * (S + gap), oy = 10 + Math.floor(i / 2) * (S + gap);
    const panel = b.shape(rect(S, S, 4), ox + S / 2, oy + S / 2, CUT, { name: "Panel" });
    if (!l) { nodes.push(b.group(`${title}: back`, [panel, ...back(ox + S / 2, oy + S / 2)])); return; }
    const pts: [number, number][] = [[ox + border, oy + border], [ox + S - border, oy + border]];
    for (let x = S - border; x >= border; x -= 3) pts.push([ox + x, oy + Math.min(S - border - 4, Math.max(border + 8, ridge(x, l.base, l.amp, l.seed, waves)))]);
    nodes.push(b.group(`${title}: layer ${i + 1}`, [panel, b.path(polyline(pts), INNER, { name: "Window" })]));
  });
  return { sheet: { w: 2 * S + gap + 20, h: 2 * S + gap + 20 }, nodes };
}

const mountainBox: Make = (b) => shadowBox(b, "Mountains", [
  { base: 120, amp: 10, seed: 1 }, { base: 98, amp: 18, seed: 2.4 }, { base: 78, amp: 24, seed: 4.1 },
], false, (cx, cy) => {
  const bird = (x: number, y: number) => new PathBuilder().move(x - 5, y).cubic(x - 3.5, y - 2.5, x - 1, y - 2.5, x, y).cubic(x + 1, y - 2.5, x + 3.5, y - 2.5, x + 5, y).done();
  return [
    b.shape(circle(16), cx + 30, cy - 30, ENGRAVE, { name: "Sun" }),
    b.path([...bird(cx - 35, cy - 40), ...bird(cx - 22, cy - 47), ...bird(cx - 26, cy - 32)], SCORE, { name: "Birds" }),
  ];
});

const oceanBox: Make = (b) => shadowBox(b, "Ocean", [
  { base: 118, amp: 7, seed: 0.5 }, { base: 102, amp: 8, seed: 2 }, { base: 86, amp: 9, seed: 3.3 },
], true, (cx, cy) => [
  b.motif("moon", 40, cx - 25, cy - 30),
  ...[[30, -45], [45, -25], [10, -55], [55, -50]].map(([dx, dy]) => b.shape(star(4, 3.5, 0.35), cx + dx, cy + dy, ENGRAVE, { name: "Star" })),
]);

const moonPhases: Make = (b) => {
  const R = 22, y = 62;
  /** The dark part of a waxing moon lit on the right; `a` is the terminator's x-radius, `bulgeRight` for crescents. */
  const dark = (cx: number, a: number, bulgeRight: boolean): Subpath[] => {
    const p = new PathBuilder().move(cx, y - R).arc(cx, y, R, R, -90, -270);
    if (a < 0.01) p.line(cx, y - R);
    else if (bulgeRight) p.arc(cx, y, a, R, 90, -90);
    else p.arc(cx, y, a, R, 90, 270);
    return p.close().done();
  };
  const mirror = (subs: Subpath[], cx: number): Subpath[] => subs.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((n) => ({ x: 2 * cx - n.x, y: n.y, ...(n.i ? { i: { x: 2 * cx - n.i.x, y: n.i.y } } : {}), ...(n.o ? { o: { x: 2 * cx - n.o.x, y: n.o.y } } : {}) })),
  }));
  const phases = [{ a: 0.6, right: true }, { a: 0, right: true }, { a: 0.6, right: false }, null, { a: 0.6, right: false, wane: true }, { a: 0, right: true, wane: true }, { a: 0.6, right: true, wane: true }];
  const nodes: SceneNode[] = [b.group("Hanging bar", [
    b.shape(rect(380, 14, 7), 200, 14, CUT, { name: "Bar" }),
    ...phases.map((_, i) => b.shape(circle(1.6), 44 + i * 52, 14, INNER, { name: "String hole" })),
  ])];
  phases.forEach((ph, i) => {
    const cx = 44 + i * 52;
    const parts: SceneNode[] = [b.shape(circle(R), cx, y, CUT, { name: "Moon" }), b.shape(circle(1.6), cx, y - R + 4, INNER, { name: "String hole" })];
    if (ph) {
      const d = dark(cx, ph.a * R, ph.right);
      parts.push(b.path("wane" in ph ? mirror(d, cx) : d, ENGRAVE, { name: "Shadow" }));
    } else parts.push(b.shape(circle(R - 4), cx, y, SCORE, { name: "Full moon ring" }));
    nodes.push(b.group(["Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"][i], parts));
  });
  return { sheet: { w: 400, h: 100 }, nodes };
};

const heartGarland: Make = (b) => ({
  sheet: { w: 290, h: 110 },
  nodes: Array.from({ length: 10 }, (_, i) => {
    const x = 30 + (i % 5) * 57, y = 30 + Math.floor(i / 5) * 52;
    return b.group(`Heart ${i + 1}`, [
      b.shape(heart(48, 43), x, y, CUT, { name: "Heart" }),
      b.shape(circle(1.6), x - 11, y - 8, INNER, { name: "Thread hole" }),
      b.shape(circle(1.6), x + 11, y - 8, INNER, { name: "Thread hole" }),
      ...(i % 2 ? [b.shape(heart(30, 27), x, y + 3, SCORE, { name: "Hatched heart", fx: [b.hatch({ angle: 45, spacing: 1.5, inset: 0, keepOutline: true })] })] : [b.motif("sparkle", 14, x, y + 4)]),
    ]);
  }),
});

const hexPanel: Make = (b) => {
  const W = 300, H = 200, r = 9, web = 3.2;
  const ri = r * Math.cos(Math.PI / 6), dx = 2 * ri + web, dy = dx * Math.cos(Math.PI / 6);
  const holes: Subpath[] = [];
  for (let row = 0, y = 25; y <= H - 25 + 0.01; row++, y += dy) {
    for (let x = 25 + (row % 2 ? dx / 2 : 0); x <= W - 25 + 0.01; x += dx) {
      const pts: [number, number][] = Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        return [10 + x + r * Math.cos(a), 10 + y + r * Math.sin(a)];
      });
      holes.push(...polyline(pts));
    }
  }
  return {
    sheet: { w: W + 20, h: H + 20 },
    nodes: [
      b.shape(rect(W, H, 10), 10 + W / 2, 10 + H / 2, CUT, { name: "Panel" }),
      b.path(holes, INNER, { name: "Honeycomb", fx: [b.fx("corners", { mode: "fillet", radius: 1.5 })] }),
      ...[[22, 22], [W - 2, 22]].map(([x, y]) => b.shape(circle(2), x, y, INNER, { name: "Screw hole" })),
    ],
  };
};

const lanternPanels: Make = (b) => {
  const pw = 90, ph = 150;
  const archWindow = (cx: number, cy: number, w: number, h: number): Subpath[] => {
    const top = cy - h / 2 + w / 2;
    return new PathBuilder().move(cx - w / 2, cy + h / 2).line(cx - w / 2, top).arc(cx, top, w / 2, w / 2, 180, 360).line(cx + w / 2, cy + h / 2).close().done();
  };
  const panels = [0, 1, 2, 3].map((i) => {
    const cx = 55 + i * 100, cy = 85;
    return b.group(`Side panel ${i + 1}`, [
      b.shape(rect(pw, ph, 3), cx, cy, CUT, { name: "Panel" }),
      b.path(archWindow(cx, cy + 8, 52, 92), INNER, { name: "Arch window" }),
      b.path(archWindow(cx, cy + 8, 62, 102), SCORE, { name: "Window border" }),
      b.shape(star(8, 7, 0.55), cx - 30, cy - 60, INNER, { name: "Star" }),
      b.shape(star(8, 7, 0.55), cx + 30, cy - 60, INNER, { name: "Star" }),
    ]);
  });
  return {
    sheet: { w: 420, h: 280 },
    nodes: [
      ...panels,
      b.group("Base", [b.shape(rect(96, 96, 3), 60, 220, CUT, { name: "Base" }), b.shape(circle(21), 60, 220, SCORE, { name: "Tea light ring" })]),
      b.group("Top", [b.shape(rect(96, 96, 3), 170, 220, CUT, { name: "Top" }), b.shape(circle(22), 170, 220, INNER, { name: "Vent" }), b.shape(ellipse(3.5, 7), 170, 220 - 34, INNER, { name: "Vent petals", fx: [b.around(8, 34, { start: 22.5 })] })]),
    ],
  };
};

const bookmarks: Make = (b) => {
  const deco: { s: ShapeParams; h: Partial<EffectParamsMap["hatches"]>; name: string }[] = [
    { s: heart(30, 27), h: { angle: 45, spacing: 2 }, name: "Heart" },
    { s: star(5, 18, 0.45, 0.1), h: { angle: 0, spacing: 2, cross: true }, name: "Star" },
    { s: polygon(6, 16, 1), h: { angle: 60, spacing: 2 }, name: "Hexagon" },
    { s: ellipse(13, 18), h: { angle: 90, spacing: 2 }, name: "Leaf" },
    { s: star(8, 17, 0.6, 0.2), h: { angle: 22.5, spacing: 2 }, name: "Sparkle" },
  ];
  return {
    sheet: { w: 290, h: 175 },
    nodes: deco.map((d, i) => {
      const x = 32 + i * 56;
      return b.group(`${d.name} bookmark`, [
        b.shape(rect(45, 155, 6), x, 87, CUT, { name: "Bookmark" }),
        b.shape(circle(2.5), x, 20, INNER, { name: "Tassel hole" }),
        b.shape(rect(37, 120, 3), x, 98, SCORE, { name: "Border" }),
        b.shape(d.s, x, 120, SCORE, { name: d.name, fx: [b.hatch({ ...d.h, inset: 0.6, keepOutline: true })] }),
        b.path(polyline([[x - 14, 40], [x + 14, 40]], false), SCORE, { name: "Rule" }),
      ]);
    }),
  };
};

const opArtCoasters: Make = (b) => {
  const r = 47.5;
  const c = [[55, 55], [165, 55], [55, 165], [165, 165]];
  const ray = (x: number, y: number) => b.path(polyline([[x, y - 40], [x, y - 9]], false), SCORE, { name: "Rays", fx: [b.fx("rotateCopies", { count: 36, start: 0, cx: x, cy: y, fuse: false })] });
  return {
    sheet: { w: 220, h: 220 },
    nodes: [
      b.group("Rings coaster", [b.shape(circle(r), c[0][0], c[0][1], CUT, { name: "Coaster" }), ...Array.from({ length: 9 }, (_, k) => b.shape(circle(6 + k * 4.2), c[0][0] + k * 0.6, c[0][1], SCORE, { name: "Ring" }))]),
      b.group("Spiral coaster", [b.shape(circle(r), c[1][0], c[1][1], CUT, { name: "Coaster" }), b.shape(spiral(9, 40, 1), c[1][0], c[1][1], SCORE, { name: "Spiral" })]),
      b.group("Twisted squares coaster", [b.shape(circle(r), c[2][0], c[2][1], CUT, { name: "Coaster" }), ...Array.from({ length: 8 }, (_, k) => b.shape(rect(58 - k * 5, 58 - k * 5), c[2][0], c[2][1], SCORE, { name: "Square", rot: k * 11.25 }))]),
      b.group("Sunburst coaster", [b.shape(circle(r), c[3][0], c[3][1], CUT, { name: "Coaster" }), ray(c[3][0], c[3][1]), b.shape(circle(6), c[3][0], c[3][1], SCORE, { name: "Centre" })]),
    ],
  };
};

const keychains: Make = (b) => {
  const set: { s: ShapeParams; m: MotifId; hole: [number, number]; name: string }[] = [
    { s: polygon(6, 24, 2), m: "paw", hole: [0, -17], name: "Hexagon" },
    { s: heart(46, 42), m: "infinity", hole: [-11, -9], name: "Heart" },
    { s: star(5, 26, 0.5, 0.25), m: "sparkle", hole: [0, -16], name: "Star" },
    { s: circle(22), m: "sun", hole: [0, -16], name: "Circle" },
    { s: rect(42, 42, 9), m: "key", hole: [0, -14], name: "Square" },
    { s: polygon(8, 23, 2), m: "flower", hole: [0, -16], name: "Octagon" },
    { s: ellipse(19, 25), m: "leaf", hole: [0, -18], name: "Oval" },
    { s: polygon(5, 25, 3), m: "house", hole: [0, -16], name: "Pentagon" },
    { s: heart(46, 42), m: "paw", hole: [-11, -9], name: "Paw heart" },
    { s: circle(22), m: "note", hole: [0, -16], name: "Music" },
    { s: polygon(6, 24, 2), m: "crown", hole: [0, -17], name: "Crown" },
    { s: star(6, 26, 0.6, 0.3), m: "snowflake", hole: [0, -17], name: "Snow star" },
  ];
  return {
    sheet: { w: 230, h: 170 },
    nodes: set.map((k, i) => {
      const x = 30 + (i % 4) * 57, y = 30 + Math.floor(i / 4) * 55;
      return b.group(`${k.name} keychain`, [
        b.shape(k.s, x, y, CUT, { name: k.name }),
        b.shape(circle(2.6), x + k.hole[0], y + k.hole[1], INNER, { name: "Ring hole" }),
        b.motif(k.m, 16, x, y + 4),
      ]);
    }),
  };
};

const cableOrganiser: Make = (b) => {
  const bar = (cx: number, cy: number): Subpath[] => {
    const w = 200, h = 40, L = cx - w / 2, T = cy - h / 2, r = 6;
    const p = new PathBuilder().move(L, T + r).arc(L + r, T + r, r, r, 180, 270);
    for (let k = 0; k < 5; k++) {
      const sx = L + 30 + k * 35, ch = 3.2, hr = 4.2, hy = T + 14;
      const a = (Math.asin(ch / 2 / hr) * 180) / Math.PI;
      // down the channel, round the keyhole by its left, bottom and right, back up
      p.line(sx - ch / 2, T).line(sx - ch / 2, hy - Math.sqrt(hr * hr - (ch / 2) ** 2)).arc(sx, hy, hr, hr, -90 - a, -450 + a).line(sx + ch / 2, T);
    }
    p.line(L + w - r, T).arc(L + w - r, T + r, r, r, -90, 0).line(L + w, T + h - r).arc(L + w - r, T + h - r, r, r, 0, 90)
      .line(L + r, T + h).arc(L + r, T + h - r, r, r, 90, 180);
    return p.close().done();
  };
  return {
    sheet: { w: 230, h: 105 },
    nodes: [
      b.group("Cable bar", [
        b.path(bar(115, 30), CUT, { name: "Bar" }),
        b.shape(circle(2), 22, 40, INNER, { name: "Screw hole" }),
        b.shape(circle(2), 208, 40, INNER, { name: "Screw hole" }),
      ]),
      ...Array.from({ length: 5 }, (_, k) => b.group(`Cable tag ${k + 1}`, [
        b.shape(rect(36, 14, 7), 30 + k * 42, 80, CUT, { name: "Tag" }),
        b.shape(slot(9, 4), 30 + k * 42 - 10, 80, INNER, { name: "Cable slot" }),
        b.motif((["note", "star", "heart", "sun", "leaf"] as MotifId[])[k], 8, 30 + k * 42 + 7, 80),
      ])),
    ],
  };
};

const mandalaWallArt: Make = (b) => {
  const c = 150, R = 135;
  return {
    sheet: { w: 300, h: 300 },
    nodes: [
      b.shape(star(36, R, 0.97, 0.6), c, c, CUT, { name: "Scalloped disc" }),
      b.shape(circle(2.2), c, c - 121, INNER, { name: "Hanging hole" }),
      b.shape(ellipse(4, 12), c, c - 110, INNER, { name: "Ring of petals", fx: [b.around(24, 110, { start: 7.5 })] }),
      b.shape(ellipse(7, 15), c, c - 86, INNER, { name: "Ring of drops", fx: [b.around(16, 86)] }),
      b.shape(circle(6.5), c, c - 63, INNER, { name: "Ring of dots", fx: [b.around(12, 63, { start: 15 })] }),
      b.shape(polygon(4, 9, 1), c, c - 43, INNER, { name: "Ring of diamonds", fx: [b.around(8, 43, { start: 22.5 })] }),
      b.shape(star(8, 19, 0.45, 0.1), c, c, INNER, { name: "Centre star" }),
      ...[99, 74, 53, 30].map((rr) => b.shape(circle(rr), c, c, SCORE, { name: "Scored ring" })),
    ],
  };
};

const stringArt: Make = (b) => {
  const pts: [number, number][] = [];
  for (let k = 0; k < 44; k++) {
    const t = (k / 44) * Math.PI * 2;
    pts.push([100 + 4.6 * 16 * Math.sin(t) ** 3, 96 - 4.6 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  return {
    sheet: { w: 220, h: 220 },
    nodes: [
      b.shape(rect(200, 200, 12), 110, 110, CUT, { name: "Board" }),
      b.path(pts.flatMap(([x, y]) => new PathBuilder().arc(x + 10, y + 10, 0.8, 0.8, 0, 360).close().done()), INNER, { name: "Nail holes" }),
      b.path(polyline(pts.map(([x, y]) => [x + 10, y + 10] as [number, number])), SCORE, { name: "Guide line" }),
      ...[[22, 22], [198, 22]].map(([x, y]) => b.shape(circle(2), x, y, INNER, { name: "Hanging hole" })),
    ],
  };
};

const spinningTops: Make = (b) => {
  const top = (cx: number, deco: SceneNode[], name: string) => b.group(name, [
    b.shape(circle(30), cx, 40, CUT, { name: "Disc" }),
    b.shape(circle(3.1), cx, 40, INNER, { name: "Spindle hole" }),
    ...deco,
  ]);
  return {
    sheet: { w: 260, h: 110 },
    nodes: [
      top(40, [b.path(yinYang(40, 40, 25), ENGRAVE, { name: "Yin and yang" }), b.shape(circle(25), 40, 40, SCORE, { name: "Ring" })], "Yin top"),
      top(110, [b.shape(ellipse(4, 11), 110, 40 - 17, SCORE, { name: "Swirl", rot: 25, fx: [b.around(8, 17, { rot: 25 })] })], "Swirl top"),
      top(180, [b.shape(spiral(4, 26, 5), 180, 40, SCORE, { name: "Spiral" })], "Spiral top"),
      ...[40, 110, 180].map((x) => b.shape(rect(6, 34, 1), x, 92, CUT, { name: "Spindle (6 mm dowel or 3 layers)" })),
      b.shape(rect(6, 34, 1), 232, 40, CUT, { name: "Spare spindle" }),
    ],
  };
};

/** The dark half (with its light eye cut out) and the dark eye, filled even-odd. */
function yinYang(cx: number, cy: number, R: number): Subpath[] {
  const h = R / 2, eye = R / 7;
  const dot = (y: number) => new PathBuilder().move(cx + eye, y).arc(cx, y, eye, eye, 0, 360).close().done();
  const dark = new PathBuilder().move(cx, cy - R).arc(cx, cy, R, R, -90, 90).arc(cx, cy + h, h, h, 90, 270).arc(cx, cy - h, h, h, 90, -90).close().done();
  return [...dark, ...dot(cy + h), ...dot(cy - h)];
}

// ---------- registry ----------

export const STUDIO_TEMPLATES: Record<string, Make> = {
  "hinge-notebook-cover": notebookCover,
  "hinge-bracelet": bracelet,
  "hinge-lamp-wrap": lampWrap,
  "hinge-card-wallet": cardWallet,
  "mandala-coasters": mandalaCoasters,
  "snowflake-ornaments": snowflakes,
  "hatched-ornaments": hatchOrnaments,
  "gear-fidget": gearFidget,
  "tangram": tangram,
  "headphone-stand": headphoneStand,
  "earring-cards": earringCards,
  "plant-markers": plantMarkers,
  "mountain-shadow-box": mountainBox,
  "ocean-shadow-box": oceanBox,
  "moon-phases": moonPhases,
  "heart-garland": heartGarland,
  "honeycomb-panel": hexPanel,
  "lantern-panels": lanternPanels,
  "hatched-bookmarks": bookmarks,
  "op-art-coasters": opArtCoasters,
  "motif-keychains": keychains,
  "cable-organiser": cableOrganiser,
  "mandala-wall-art": mandalaWallArt,
  "heart-string-art": stringArt,
  "spinning-tops": spinningTops,
};

// ---------- start screen cards drawn in Studio ----------

/** Hinge Pattern Fill: a panel already filled with a living hinge, to reshape or copy the effect from. */
const hingeFill = (b: Builder): StudioTemplate => ({
  sheet: { w: 300, h: 200 },
  nodes: [b.shape(rect(180, 110, 8), 150, 100, CUT, { name: "Hinge panel", fx: [b.hinge({ pattern: "straight", margin: 10, keepOutline: true })] })],
});

/** The starting design of a start screen card that opens in Studio, or null when the card opens elsewhere. */
export function buildGeneratorStarter(id: string, makeId: () => string, thickness = 3): StudioTemplate | null {
  const b = new Builder(makeId);
  if (id === "hinge-fill") return hingeFill(b);
  return null;
}

/** Builds a Studio template's sheet and objects (document mm), or null for unknown ids. */
export function buildStudioTemplate(id: string, makeId: () => string): StudioTemplate | null {
  const make = STUDIO_TEMPLATES[id];
  return make ? make(new Builder(makeId)) : null;
}
