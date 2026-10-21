/**
 * Open trays: a plain tray (a base and four walls, corner glue tabs) and the counter display (PDQ)
 * tray, with a low front, a tall back that carries a printed header, and sides that slope between
 * them.
 *
 * Sheet coordinates: the base at 0..l × 0..w (the back at y = 0, the front at y = w).
 */
import { edge, glueFlap, Net } from "../geom";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, sizeGroup, thick } from "../schema";
import type { BoxParams, Dieline, Pt } from "../types";
import { tray } from "./twoPiece";

export const OPEN_TRAY = registerBoxStyle({
  id: "tray", name: "Open tray", icon: "square", blurb: "A shallow tray with glued corners: for a sleeve, a drawer, a gift hamper or sorting.",
  defaultParams: { ...BASE_DEFAULTS, paper: "chip1", L: 150, W: 100, H: 30 } as BoxParams,
  paramSchema: [sizeGroup("Wall height"), boardGroup],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.H, p.dims === "outer" ? "outer" : "inner", t);
    return {
      style: "tray", parts: [tray("Tray", "tray", s.l, s.w, s.h, num(p, "bleed", 0), 25, { oneWinding: true })], outer: [s.outer[0], s.outer[1], s.inner[2] + t], inner: s.inner, warnings: [],
      assembly: ["Crease every fold line.", "Fold the four walls up and glue each corner tab inside the side wall next to it."],
    };
  },
});

export const DISPLAY = registerBoxStyle({
  id: "display", name: "Counter display (PDQ)", icon: "presentation", blurb: "A shop counter tray: low front, tall back with a printed header, sloping sides.",
  defaultParams: { ...BASE_DEFAULTS, paper: "eflute", L: 220, W: 160, H: 90, front: 40, header: 90, headerR: 15 } as BoxParams,
  paramSchema: [sizeGroup("Back height"), boardGroup, {
    id: "display", title: "Front and header", fields: [
      { key: "front", label: "Front height", kind: "length", min: 10, max: 500, step: 0.5, help: "How high the front wall stands; the sides slope from it to the back." },
      { key: "header", label: "Header height", kind: "length", min: 0, max: 500, step: 0.5, help: "The printed panel above the back wall; 0 leaves it off." },
      { key: "headerR", label: "Header corners", kind: "length", min: 0, max: 100, step: 0.5, help: "Rounds the header's top corners." },
    ],
  }],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.H, p.dims === "outer" ? "outer" : "inner", t);
    const { l, w, h } = s, hf = Math.min(num(p, "front", 40) + t, h), hd = num(p, "header", 90), net = new Net(true), warnings: string[] = [];
    net.panel("base", "Base", 0, 0, l, w, { printable: true });
    net.panel("back", "Back wall", 0, -h, l, h, { parent: "base", hinge: [[0, 0], [l, 0]], angle: 90, printable: true });
    net.panel("front", "Front wall", 0, w, l, hf, { parent: "base", hinge: [[0, w], [l, w]], angle: 90, printable: true });
    net.crease([[0, 0], [l, 0]]);
    net.crease([[0, w], [l, w]]);
    if (hd > 0) {
      const r = Math.min(num(p, "headerR", 15), l / 2 - 1, hd - 1);
      // From a sliver below the fold, so the union joins it to the back wall.
      const top: Pt[] = [[0, -h + 0.02], [0, -h - hd + r]];
      for (let i = 0; i <= 10; i++) { const a = Math.PI + (Math.PI / 2) * (i / 10); top.push([r + r * Math.cos(a), -h - hd + r + r * Math.sin(a)]); }
      for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / 10); top.push([l - r + r * Math.cos(a), -h - hd + r + r * Math.sin(a)]); }
      top.push([l, -h + 0.02]);
      net.outline(top);
      // A face only: the outline above has its rounded corners.
      net.faces.push({ id: "header", name: "Header", poly: top, origin: [0, -h - hd], u: [1, 0], v: [0, 1], w: l, h: hd, parent: "back", hinge: [[0, -h], [l, -h]], angle: 0, printable: true });
    }
    // Sloped sides: back end h high, front end hf high; glue tabs on both ends, inside the back and front.
    const tab = Math.min(25, w / 3);
    for (const [id, x, dir] of [["left", 0, -1], ["right", l, 1]] as const) {
      const side = net.flap(`${id}`, dir < 0 ? "Left wall" : "Right wall", edge([x, 0], [x, w], [x - dir, w / 2]), [[0, 0], [0, h], [w, hf], [w, 0]], { parent: "base", printable: true });
      const at = (a: number, b: number): Pt => [side.origin[0] + side.u[0] * a + side.v[0] * b, side.origin[1] + side.u[1] * a + side.v[1] * b];
      const inside = at(w / 2, h / 2);
      net.flap(`${id}-tab-back`, "Glue tab", edge(at(0, 0), at(0, h), inside), glueFlap(h, tab, 20), { parent: side.id });
      net.flap(`${id}-tab-front`, "Glue tab", edge(at(w, 0), at(w, hf), inside), glueFlap(hf, Math.min(tab, hf * 0.9), 20), { parent: side.id });
    }
    if (hf >= h) warnings.push("The front is as high as the back; lower it to show what is inside.");
    return {
      style: "display", parts: [net.build("display", "Counter display", num(p, "bleed", 0))], outer: [s.outer[0], s.outer[1], s.inner[2] + t + hd], inner: s.inner, warnings,
      assembly: [
        "Score every fold line; corrugated folds best across its flutes.",
        "Fold the back, the front and the two sloped sides up.",
        "Glue each side's tabs inside the back and the front.",
        "Fill it and stand it on the counter, header up.",
      ],
    };
  },
});
