/**
 * Rigid-fold polygon boxes: a pyramid (a square base and four triangles meeting at the top), a
 * triangular prism (three long panels and two triangular ends), a cube favour box (a cross of six
 * squares with a tuck lid), and a candy cone (a sector rolled into a cone, drawn curved in 3D).
 */
import { arc, edge, glueFlap, Net, rectFlap, tuckFlap } from "../geom";
import { slitFor } from "../locks";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, thick } from "../schema";
import type { BoxParams, Dieline, Face, ParamField, Pt } from "../types";
import { onFace } from "./ends";

const deg = (r: number) => (r * 180) / Math.PI;
const dims = (p: BoxParams) => (p.dims === "outer" ? "outer" : "inner");
const glue: ParamField[] = [
  { key: "glueW", label: "Glue tab width", kind: "length", min: 5, max: 40, step: 0.5 },
];
const insideOf = (f: Face) => { const at = onFace(f); return at(f.w / 2, f.h / 2); };

export const PYRAMID = registerBoxStyle({
  id: "pyramid", name: "Pyramid box", icon: "triangle", blurb: "A square base and four triangles that meet in a point: a favour, a party box or a desk ornament.",
  defaultParams: { ...BASE_DEFAULTS, paper: "300", L: 70, W: 70, H: 80, glueW: 12 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Base", kind: "length", min: 20, max: 500, step: 0.5, help: "Each side of the square base." },
      { key: "H", label: "Height", kind: "length", min: 10, max: 600, step: 0.5, help: "From the base to the point." },
      { key: "dims", label: "Sizes are", kind: "select", options: [{ v: "inner", text: "Inside" }, { v: "outer", text: "Outside" }] },
    ] },
    boardGroup, { id: "glue", title: "Glue tabs", fields: glue },
  ],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.L, p.H, dims(p), t), l = s.l, H = s.h;
    const net = new Net(true), slant = Math.hypot(H, l / 2), ang = 180 - deg(Math.atan2(H, l / 2));
    net.panel("base", "Base", 0, 0, l, l, { printable: true });
    const g = Math.min(num(p, "glueW", 12), l / 3);
    const sides: [string, string, Pt, Pt][] = [["back", "Back", [0, 0], [l, 0]], ["right", "Side", [l, 0], [l, l]], ["front", "Front", [l, l], [0, l]], ["left", "Side", [0, l], [0, 0]]];
    for (const [id, name, a, b] of sides) {
      const tri = net.flap(id, name, edge(a, b, [l / 2, l / 2]), [[0, 0], [l / 2, slant], [l, 0]], { parent: "base", angle: ang, printable: true });
      const at = onFace(tri), e = Math.hypot(l / 2, slant);
      net.flap(`${id}-tab`, "Glue tab", edge(at(l, 0), at(l / 2, slant), insideOf(tri)), glueFlap(e, g, 35), { parent: tri.id, angle: 180 - deg(Math.atan2(l / 2, H)) });
    }
    return {
      style: "pyramid", parts: [net.build("pyramid", "Pyramid box", num(p, "bleed", 0))], outer: [s.outer[0], s.outer[1], s.inner[2] + t], inner: s.inner, warnings: H < l / 4 ? ["The pyramid is very flat; its point will not hold. Make it taller."] : [],
      assembly: ["Crease every fold line.", "Fold the four triangles up and glue each glue tab inside the next triangle, round the base.", "Leave the last seam open to fill it, or glue it shut."],
    };
  },
});

export const PRISM = registerBoxStyle({
  id: "prism", name: "Triangle prism", icon: "triangle-right", blurb: "A long box with a triangular cross-section and glued triangular ends: chocolate bars, pens, a candle.",
  defaultParams: { ...BASE_DEFAULTS, paper: "350", L: 180, W: 45, H: 0, glueW: 12 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Length", kind: "length", min: 30, max: 800, step: 0.5, help: "End to end." },
      { key: "W", label: "Side", kind: "length", min: 15, max: 300, step: 0.5, help: "Each side of the triangular end." },
      { key: "dims", label: "Sizes are", kind: "select", options: [{ v: "inner", text: "Inside" }, { v: "outer", text: "Outside" }] },
    ] },
    boardGroup, { id: "glue", title: "Glue tabs", fields: glue },
  ],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.W, dims(p), t), l = s.l, w = s.w, tall = (w * Math.sqrt(3)) / 2;
    const net = new Net(true), g = Math.min(num(p, "glueW", 12), w / 3);
    net.panel("base", "Bottom", 0, 0, l, w, { printable: true });
    net.panel("side-a", "Back", 0, -w, l, w, { parent: "base", hinge: [[0, 0], [l, 0]], angle: 120, printable: true });
    net.panel("side-b", "Front", 0, w, l, w, { parent: "base", hinge: [[0, w], [l, w]], angle: 120, printable: true });
    net.crease([[0, 0], [l, 0]]);
    net.crease([[0, w], [l, w]]);
    net.flap("glue", "Glue flap", edge([0, 2 * w], [l, 2 * w], [l / 2, w]), glueFlap(l, g, 20), { parent: "side-b", angle: 120 });
    for (const [id, a, b] of [["end-l", [0, w], [0, 0]], ["end-r", [l, 0], [l, w]]] as [string, Pt, Pt][]) {
      const cap = net.flap(id, "Side", edge(a, b, [l / 2, w / 2]), [[0, 0], [w / 2, tall], [w, 0]], { parent: "base", printable: true });
      const at = onFace(cap);
      net.flap(`${id}-tab-a`, "Glue tab", edge(at(w / 2, tall), at(0, 0), insideOf(cap)), glueFlap(w, Math.min(g, w / 3), 30), { parent: cap.id, angle: 90 });
      net.flap(`${id}-tab-b`, "Glue tab", edge(at(w, 0), at(w / 2, tall), insideOf(cap)), glueFlap(w, Math.min(g, w / 3), 30), { parent: cap.id, angle: 90 });
    }
    return {
      style: "prism", parts: [net.build("prism", "Triangle prism", num(p, "bleed", 0))], outer: [s.outer[0], s.outer[1], tall + t], inner: [s.inner[0], s.inner[1], tall - t], warnings: [],
      assembly: ["Crease every fold line.", "Fold the two long panels up into a triangle and glue the glue flap inside the back panel.", "Fold one triangular end in and glue its tabs inside the long panels; fill the box, then close the other end."],
    };
  },
});

export const CUBE = registerBoxStyle({
  id: "cube", name: "Cube favour box", icon: "box", blurb: "Six squares in a cross, a tuck lid and glued sides: a small gift or wedding favour.",
  defaultParams: { ...BASE_DEFAULTS, paper: "300", L: 60, W: 60, H: 60, glueW: 12, tuckLen: 0 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Side", kind: "length", min: 20, max: 300, step: 0.5, help: "Each side of the cube." },
      { key: "dims", label: "Sizes are", kind: "select", options: [{ v: "inner", text: "Inside" }, { v: "outer", text: "Outside" }] },
    ] },
    boardGroup, { id: "glue", title: "Tabs", fields: [...glue, { key: "tuckLen", label: "Tuck length", kind: "length", min: 0, max: 80, step: 0.5, help: "Leave it at 0 to size it to the box." }] },
  ],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.L, p.L, dims(p), t), a = s.l, net = new Net(true);
    const g = Math.min(num(p, "glueW", 12), a / 3), tl = num(p, "tuckLen", 0) || Math.min(Math.max(12, a * 0.35), 25);
    net.panel("base", "Bottom", 0, 0, a, a, { printable: true });
    const back = net.flap("back", "Back", edge([a, 0], [0, 0], [a / 2, a / 2]), rectFlap(a, a), { parent: "base", printable: true });
    net.flap("front", "Front", edge([0, a], [a, a], [a / 2, a / 2]), rectFlap(a, a), { parent: "base", printable: true });
    const left = net.flap("left", "Side", edge([0, 0], [0, a], [a / 2, a / 2]), rectFlap(a, a), { parent: "base", printable: true });
    const right = net.flap("right", "Side", edge([a, a], [a, 0], [a / 2, a / 2]), rectFlap(a, a), { parent: "base", printable: true });
    // The lid on the back's top edge, its tuck into the front; the sides' top dust flaps under it.
    const bt = onFace(back);
    const lid = net.flap("lid", "Top lid", edge(bt(0, a), bt(a, a), bt(a / 2, 0)), rectFlap(a, a), { parent: back.id, printable: true });
    const lt = onFace(lid);
    net.flap("tuck", "Top tuck", edge(lt(0, a), lt(a, a), lt(a / 2, 0)), tuckFlap(a, tl, 5, t + 0.4), { parent: lid.id, slit: slitFor(a) });
    for (const sd of [left, right]) {
      const at = onFace(sd);
      net.flap(`dust-${sd.id}`, "Dust flap", edge(at(0, a), at(a, a), at(a / 2, 0)), [[0.5, 0], [a * 0.15, a * 0.4], [a * 0.85, a * 0.4], [a - 0.5, 0]], { parent: sd.id });
      // Glue tabs on the sides' edges, inside the back and the front.
      net.flap(`${sd.id}-tab-a`, "Glue tab", edge(at(0, 0), at(0, a), insideOf(sd)), glueFlap(a, g, 25), { parent: sd.id });
      net.flap(`${sd.id}-tab-b`, "Glue tab", edge(at(a, a), at(a, 0), insideOf(sd)), glueFlap(a, g, 25), { parent: sd.id });
    }
    return {
      style: "cube", parts: [net.build("cube", "Cube favour box", num(p, "bleed", 0))], outer: s.outer, inner: s.inner, warnings: [],
      assembly: ["Crease every fold line.", "Fold the four walls up and glue the side walls' tabs inside the back and the front.", "Fill it, fold the dust flaps in and tuck the lid into the front until the slits click."],
    };
  },
});

/** The cone for 3D: a fan of thin triangles from the point (at the bottom) to the rim. */
function coneSurface(r: number, H: number): [number, number, number][][] {
  const n = 36, out: [number, number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
    out.push([[0, 0, 0], [r * Math.cos(a0), r * Math.sin(a0), H], [r * Math.cos(a1), r * Math.sin(a1), H]]);
  }
  return out;
}

export const CONE = registerBoxStyle({
  id: "cone", name: "Candy cone", icon: "ice-cream-cone", blurb: "A paper cone rolled from one curved piece and glued down its seam: sweets, popcorn, flowers.",
  defaultParams: { ...BASE_DEFAULTS, paper: "250", L: 80, W: 80, H: 160, glueW: 12 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Opening", kind: "length", min: 20, max: 400, step: 0.5, help: "Across the open top." },
      { key: "H", label: "Height", kind: "length", min: 20, max: 800, step: 0.5, help: "From the point to the rim." },
    ] },
    boardGroup, { id: "glue", title: "Glue flap", fields: glue },
  ],
  build(p): Dieline {
    const t = thick(p), r = p.L / 2 + t / 2, H = p.H, s = Math.hypot(H, r), th = (2 * Math.PI * r) / s;
    const net = new Net(true), g = Math.min(num(p, "glueW", 12), s / 4);
    // The sector from its point at (0, 0), opening upward.
    const a0 = -Math.PI / 2 - th / 2, a1 = -Math.PI / 2 + th / 2;
    const rim = arc([0, 0], s, a0, a1);
    const poly: Pt[] = [[0, 0], ...rim];
    net.outline(poly);
    net.faces.push({ id: "cone", name: "Front", poly, origin: [0, 0], u: [1, 0], v: [0, 1], w: s, h: s, printable: true });
    const end = rim[rim.length - 1];
    net.flap("glue", "Glue flap", edge([0, 0], end, rim[0]), glueFlap(s, g, 10), { parent: "cone" });
    const part = net.build("cone", "Candy cone", num(p, "bleed", 0));
    part.surface = coneSurface(r, H);
    return {
      style: "cone", parts: [part], outer: [2 * r + t, 2 * r + t, H], inner: [p.L, p.L, H], warnings: th > Math.PI * 1.6 ? ["The cone is very wide for its height; it rolls into a flat dish. Make it taller."] : [],
      assembly: ["Score the glue flap's fold.", "Roll the piece into a cone, the point at the bottom, and glue the glue flap inside the far edge.", "Fill it and twist or fold the top closed, or stand it in a cone holder."],
    };
  },
});
