/**
 * Sleeves and drawer boxes: a sleeve is a four-panel tube open at both ends (glued along one edge),
 * with thumb notches to push out what it holds; the drawer box is a sleeve with a tray that slides
 * in it, sized from the tray's outside plus the clearance.
 *
 * Sleeve sheet coordinates: panels side by side across x, the sleeve's length down y.
 */
import { edge, glueFlap, Net } from "../geom";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, sizeGroup, thick } from "../schema";
import type { BoxParams, Dieline, DielinePart, Pt } from "../types";
import { tray } from "./twoPiece";

const ring = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 40 }, (_, i) => { const a = (2 * Math.PI * i) / 40; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });

/** A sleeve: bottom a wide, sides b high, d long; the glue flap on the last side goes under the bottom. */
export function sleeve(id: string, name: string, a: number, b: number, d: number, o: { glue: number; taper: number; notch: number; bleed: number }): DielinePart {
  const net = new Net(true);
  net.panel("bottom", "Bottom", 0, 0, a, d, { printable: true });
  net.panel("side-l", "Side", a, 0, b, d, { parent: "bottom", hinge: [[a, 0], [a, d]], angle: 90, printable: true });
  net.panel("top", "Top", a + b, 0, a, d, { parent: "side-l", hinge: [[a + b, 0], [a + b, d]], angle: 90, printable: true });
  net.panel("side-r", "Side", 2 * a + b, 0, b, d, { parent: "top", hinge: [[2 * a + b, 0], [2 * a + b, d]], angle: 90, printable: true });
  for (const x of [a, a + b, 2 * a + b]) net.crease([[x, 0], [x, d]]);
  const X = 2 * a + 2 * b, g = Math.min(o.glue, a - 1);
  net.flap("glue", "Glue flap", edge([X, 0], [X, d], [X - 1, d / 2]), glueFlap(d, g, o.taper), { parent: "side-r" });
  if (o.notch > 0) for (const y of [0, d]) net.notch(ring(a + b + a / 2, y, Math.min(o.notch, a / 3, d / 4)));
  return net.build(id, name, o.bleed);
}

const glueGroup = {
  id: "glue", title: "Glue flap", fields: [
    { key: "glueW", label: "Glue flap width", kind: "length" as const, min: 5, max: 60, step: 0.5 },
    { key: "glueTaper", label: "Glue flap taper", kind: "number" as const, unit: "deg" as const, min: 0, max: 45, step: 1 },
  ],
};

export const SLEEVE = registerBoxStyle({
  id: "sleeve", name: "Sleeve", icon: "rectangle-horizontal", blurb: "A band that slides over a box, a tray or a bar of soap: printed all round, open at both ends.",
  defaultParams: { ...BASE_DEFAULTS, L: 90, W: 60, H: 30, glueW: 15, glueTaper: 15, notch: 10 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Across", kind: "length", min: 10, max: 1000, step: 0.5, help: "The width of what it wraps." },
      { key: "W", label: "Length", kind: "length", min: 10, max: 1000, step: 0.5, help: "How long the sleeve is, end to end." },
      { key: "H", label: "Height", kind: "length", min: 5, max: 1000, step: 0.5 },
      { key: "dims", label: "Sizes are", kind: "select", options: [{ v: "inner", text: "Inside" }, { v: "outer", text: "Outside" }], help: "Inside sizes fit what goes in; outside sizes fit a space." },
    ] },
    boardGroup, glueGroup,
    { id: "notch", title: "Thumb notches", fields: [{ key: "notch", label: "Notch radius", kind: "length", min: 0, max: 30, step: 0.5, help: "Half-moon notches at both ends of the top, to push out what it holds; 0 leaves them off." }] },
  ],
  build(p): Dieline {
    const t = thick(p), out = p.dims === "outer";
    const a = (out ? p.L - 2 * t : p.L) + t, b = (out ? p.H - 2 * t : p.H) + t, d = p.W;
    const part = sleeve("sleeve", "Sleeve", a, b, d, { glue: num(p, "glueW", 15), taper: num(p, "glueTaper", 15), notch: num(p, "notch", 10), bleed: num(p, "bleed", 0) });
    return {
      style: "sleeve", parts: [part], outer: [a + t, d, b + t], inner: [a - t, d, b - t], warnings: [],
      assembly: ["Crease the three folds.", "Fold the sleeve round and glue the glue flap under the bottom panel.", "Slide it over the box or the tray."],
    };
  },
});

export const DRAWER = registerBoxStyle({
  id: "drawer", name: "Drawer box", icon: "inbox", blurb: "A tray that slides out of a sleeve, like a matchbox: for jewellery, chocolates and gift sets.",
  defaultParams: { ...BASE_DEFAULTS, paper: "chip1", L: 100, W: 70, H: 30, clearance: 0.6, glueW: 15, glueTaper: 15, notch: 10, pull: "notch" } as BoxParams,
  paramSchema: [sizeGroup("Height"), boardGroup, glueGroup, {
    id: "drawer", title: "Drawer", fields: [
      { key: "clearance", label: "Clearance", kind: "length", min: 0, max: 5, step: 0.1, help: "Room round the tray inside the sleeve, so it slides." },
      { key: "pull", label: "Pull", kind: "select", options: [{ v: "notch", text: "Thumb notch in the front" }, { v: "hole", text: "Finger hole in the front" }, { v: "none", text: "None" }], help: "How you pull the tray out." },
      { key: "notch", label: "Sleeve notches", kind: "length", min: 0, max: 30, step: 0.5, help: "Half-moon notches at the sleeve's ends, to push the tray out; 0 leaves them off." },
    ],
  }],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.H, p.dims === "outer" ? "outer" : "inner", t), c = Math.max(0, num(p, "clearance", 0.6));
    const bleed = num(p, "bleed", 0), pull = String(p.pull), r = Math.min(12, s.h * 0.45, s.l / 5);
    const drawer = tray("Drawer", "tray", s.l, s.w, s.h, bleed, 25, {
      oneWinding: true,
      more: (net: Net) => {
        if (pull === "notch") net.notch(ring(s.l / 2, s.w + s.h, r));
        if (pull === "hole") net.hole(ring(s.l / 2, s.w + s.h - Math.max(4, s.h * 0.2) - r * 0.7, r * 0.7));
      },
    });
    const trayOut: [number, number, number] = [s.l + t, s.w + t, s.h + t / 2];
    const a = trayOut[0] + 2 * c + t, b = trayOut[2] + c + t, d = trayOut[1];
    const sl = sleeve("sleeve", "Sleeve", a, b, d, { glue: num(p, "glueW", 15), taper: num(p, "glueTaper", 15), notch: num(p, "notch", 10), bleed });
    const warnings: string[] = [];
    // the notch radius follows the tray height (at most 45 % of it), so it only gets too small for a thumb on a very low tray
    if (pull === "notch" && r < 5) warnings.push("The tray is low for a thumb notch: the notch is under 10 mm across. Use a ribbon pull or a taller tray.");
    return {
      style: "drawer", parts: [sl, drawer], outer: [a + t, d, b + t], inner: s.inner, warnings,
      poses: [{ part: "tray", on: "sleeve", bottom: t, shift: [0, d * 0.42, 0] }],
      assembly: [
        "Crease every fold line.",
        "Drawer: fold the four walls up and glue each corner tab inside the side wall next to it.",
        "Sleeve: fold it round and glue the glue flap under the bottom panel.",
        "Slide the drawer into the sleeve.",
      ],
    };
  },
});
