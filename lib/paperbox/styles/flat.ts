/**
 * Flat packaging: a CD or envelope sleeve (a front and a back folded at the bottom, glued at the
 * sides, a thumb notch at the open top or a tuck flap to close it), and a cell divider insert for
 * any tray or carton (a base card and slotted strips that cross in a grid, standing in 3D).
 */
import { circle } from "@/lib/generators/geom";
import { edge, glueFlap, Net, tuckFlap } from "../geom";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, thick } from "../schema";
import type { BoxParams, Dieline, DielinePart } from "../types";

export const SLEEVE_FLAT = registerBoxStyle({
  id: "cd-sleeve", name: "CD / envelope sleeve", icon: "disc", blurb: "A flat sleeve folded at the bottom and glued at the sides: CDs, cards, photos, gift vouchers.",
  defaultParams: { ...BASE_DEFAULTS, paper: "250", L: 125, W: 1, H: 125, glueW: 12, closure: "notch" } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Width", kind: "length", min: 30, max: 500, step: 0.5, help: "Inside, across." },
      { key: "H", label: "Height", kind: "length", min: 30, max: 500, step: 0.5, help: "Inside, bottom to the open top." },
    ] },
    boardGroup,
    { id: "close", title: "Closing", fields: [
      { key: "closure", label: "Top", kind: "select", options: [{ v: "notch", text: "Open, with a thumb notch" }, { v: "flap", text: "A tuck flap" }] },
      { key: "glueW", label: "Glue flap width", kind: "length", min: 5, max: 30, step: 0.5 },
    ] },
  ],
  build(p): Dieline {
    const t = thick(p), l = p.L + 2 * t, h = p.H + t, net = new Net(true), g = Math.min(num(p, "glueW", 12), l / 6);
    net.panel("front", "Front", 0, 0, l, h, { printable: true });
    net.panel("back", "Back", 0, h, l, h, { parent: "front", hinge: [[0, h], [l, h]], angle: 178, printable: true });
    net.crease([[0, h], [l, h]]);
    net.flap("glue-a", "Glue flap", edge([0, 2 * h], [0, h], [l / 2, 1.5 * h]), glueFlap(h, g, 20), { parent: "back", angle: 178 });
    net.flap("glue-b", "Glue flap", edge([l, h], [l, 2 * h], [l / 2, 1.5 * h]), glueFlap(h, g, 20), { parent: "back", angle: 178 });
    if (p.closure === "flap") net.flap("tuck", "Top tuck", edge([l, 2 * h], [0, 2 * h], [l / 2, 1.5 * h]), tuckFlap(l, Math.min(h * 0.3, 40), 8, 2), { parent: "back", angle: 178 });
    else net.notch(circle(l / 2, 0, Math.min(15, l / 6)));
    return {
      style: "cd-sleeve", parts: [net.build("envelope", "Sleeve", num(p, "bleed", 0))], outer: [l + t, t * 3, h + t], inner: [p.L, t, p.H], warnings: [],
      assembly: ["Crease the bottom fold and the glue flaps' folds.", "Fold the back up behind the front and glue the two side flaps to the front's back.", p.closure === "flap" ? "Slide the contents in and tuck the top flap behind the front." : "Slide the contents in; the thumb notch helps take them out."],
    };
  },
});

/** One slotted strip of the divider grid: slots from its top (or bottom) at `at`. */
function strip(id: string, name: string, len: number, h: number, t: number, at: number[], fromTop: boolean): DielinePart {
  const net = new Net(true), sw = t + 0.3;
  net.panel("strip", "Divider", 0, 0, len, h, { printable: true });
  for (const x of at) net.notch(fromTop ? [[x - sw / 2, -1], [x + sw / 2, -1], [x + sw / 2, h / 2], [x - sw / 2, h / 2]] : [[x - sw / 2, h / 2], [x + sw / 2, h / 2], [x + sw / 2, h + 1], [x - sw / 2, h + 1]]);
  return net.build(id, name);
}

export const INSERT = registerBoxStyle({
  id: "cell-insert", name: "Cell divider insert", icon: "grid-3x3", blurb: "A base card and slotted strips that cross into cells: for any tray or carton (glasses, ornaments, bottles, jars).",
  defaultParams: { ...BASE_DEFAULTS, paper: "chip1", L: 200, W: 150, H: 60, cols: 3, rows: 2, base: true, clearance: 1 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Length", kind: "length", min: 30, max: 1000, step: 0.5, help: "Inside of the box it goes in." },
      { key: "W", label: "Width", kind: "length", min: 30, max: 1000, step: 0.5 },
      { key: "H", label: "Height", kind: "length", min: 10, max: 600, step: 0.5, help: "How high the dividers stand." },
    ] },
    boardGroup,
    { id: "cells", title: "Cells", fields: [
      { key: "cols", label: "Across", kind: "number", unit: "", min: 1, max: 12, step: 1, help: "Cells along the length." },
      { key: "rows", label: "Deep", kind: "number", unit: "", min: 1, max: 12, step: 1, help: "Cells across the width." },
      { key: "base", label: "Base card", kind: "toggle", help: "A card the dividers stand on." },
      { key: "clearance", label: "Clearance", kind: "length", min: 0, max: 5, step: 0.1, help: "Room left round the insert in its box, each side." },
    ] },
  ],
  build(p): Dieline {
    const t = thick(p), c = Math.max(0, num(p, "clearance", 1)), l = p.L - 2 * c, w = p.W - 2 * c, h = p.H;
    const cols = Math.max(1, Math.min(12, Math.round(num(p, "cols", 3)))), rows = Math.max(1, Math.min(12, Math.round(num(p, "rows", 2))));
    const base = new Net(true);
    base.panel("base", "Base", 0, 0, l, w, { printable: true });
    const parts: DielinePart[] = [base.build("base", "Base card")];
    const poses: NonNullable<Dieline["poses"]> = [];
    for (let j = 1; j < rows; j++) {
      parts.push(strip(`long-${j}`, `Long divider ${j}`, l, h, t, Array.from({ length: cols - 1 }, (_, i) => ((i + 1) * l) / cols), true));
      poses.push({ part: `long-${j}`, on: "base", turn: [90, 0, 0], bottom: t, shift: [0, -w / 2 + (j * w) / rows, 0] });
    }
    for (let i = 1; i < cols; i++) {
      parts.push(strip(`cross-${i}`, `Cross divider ${i}`, w, h, t, Array.from({ length: rows - 1 }, (_, j) => ((j + 1) * w) / rows), false));
      poses.push({ part: `cross-${i}`, on: "base", turn: [90, 0, 90], bottom: t, shift: [-l / 2 + (i * l) / cols, 0, 0] });
    }
    const warnings = cols * rows === 1 ? ["One cell needs no dividers: set more cells across or deep."] : [];
    return {
      style: "cell-insert", parts: p.base === false && parts.length > 1 ? parts.slice(1) : parts, poses: p.base === false ? [] : poses, outer: [l, w, h + t], inner: [l / cols - t, w / rows - t, h], warnings,
      assembly: ["Cut the strips; no folding.", "Slide the long dividers' slots down over the cross dividers' slots, so they lock in a grid.", "Stand the grid on the base card (glue it if you like) and set it in the box."],
    };
  },
});
