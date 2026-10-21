/**
 * Two-piece box: a base tray and a lid tray. The lid's inside is the base's outside plus the
 * clearance all round, so it slides over. Each tray has corner glue tabs on its long walls.
 */
import { edge, glueFlap, Net } from "../geom";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, sizeGroup, thick } from "../schema";
import type { BoxParams, Dieline, DielinePart } from "../types";

/**
 * An open tray whose base panel is l × w with walls h: corner tabs on the front and back walls.
 * `base` names the base face (a lid's is its Top); `more` adds cuts before the net is built.
 */
export function tray(name: string, id: string, l: number, w: number, h: number, bleed: number, tabTaper = 25, opts: { base?: string; more?: (net: Net) => void; oneWinding?: boolean } = {}): DielinePart {
  const net = new Net(opts.oneWinding), tab = Math.min(18, w / 3, h * 1.2);
  net.panel("base", opts.base ?? "Base", 0, 0, l, w, { printable: true });
  net.panel("front", "Front wall", 0, w, l, h, { parent: "base", hinge: [[0, w], [l, w]], angle: 90, printable: true });
  net.panel("back", "Back wall", 0, -h, l, h, { parent: "base", hinge: [[0, 0], [l, 0]], angle: 90, printable: true });
  net.panel("left", "Left wall", -h, 0, h, w, { parent: "base", hinge: [[0, 0], [0, w]], angle: 90, printable: true });
  net.panel("right", "Right wall", l, 0, h, w, { parent: "base", hinge: [[l, 0], [l, w]], angle: 90, printable: true });
  for (const c of [[[0, w], [l, w]], [[0, 0], [l, 0]], [[0, 0], [0, w]], [[l, 0], [l, w]]] as [number, number][][]) net.crease(c as [number, number][]);
  // Glue tabs on both ends of the front and back walls, folded inside the side walls.
  for (const [wall, y0, y1] of [["front", w, w + h], ["back", -h, 0]] as const) {
    net.flap(`${wall}-tab-l`, "Glue tab", edge([0, y1], [0, y0], [1, (y0 + y1) / 2]), glueFlap(h, tab, tabTaper), { parent: wall });
    net.flap(`${wall}-tab-r`, "Glue tab", edge([l, y0], [l, y1], [l - 1, (y0 + y1) / 2]), glueFlap(h, tab, tabTaper), { parent: wall });
  }
  opts.more?.(net);
  return net.build(id, name, bleed);
}

export const TWO_PIECE = registerBoxStyle({
  id: "two-piece", name: "Two-piece box", icon: "layers", blurb: "A base and a lift-off lid, the lid sized to slide over the base with a little clearance.",
  defaultParams: { ...BASE_DEFAULTS, paper: "chip1", L: 100, W: 100, H: 50, lidH: 0, clearance: 0.5 } as BoxParams,
  paramSchema: [sizeGroup("Base height"), boardGroup, {
    id: "lid", title: "Lid", fields: [
      { key: "lidH", label: "Lid height", kind: "length", min: 0, max: 500, step: 0.5, help: "Leave it at 0 for about a third of the base's height." },
      { key: "clearance", label: "Clearance", kind: "length", min: 0, max: 5, step: 0.1, help: "Room between the lid and the base, each side." },
    ],
  }],
  build(p): Dieline {
    const t = thick(p), base = panelSizes(p.L, p.W, p.H, p.dims === "outer" ? "outer" : "inner", t);
    const c = Math.max(0, num(p, "clearance", 0.5));
    const lidH = num(p, "lidH", 0) || Math.min(base.inner[2], Math.max(15, base.inner[2] / 3));
    const lid = panelSizes(base.outer[0] + 2 * c, base.outer[1] + 2 * c, lidH, "inner", t);
    const warnings: string[] = [];
    if (lidH > base.inner[2] + t) warnings.push("The lid is taller than the base; it will not sit on anything.");
    const bleed = num(p, "bleed", 0);
    return {
      style: "two-piece",
      parts: [tray("Base", "base", base.l, base.w, base.h, bleed), tray("Lid", "lid", lid.l, lid.w, lid.h, bleed, 25, { base: "Top" })],
      outer: [lid.outer[0], lid.outer[1], base.outer[2] + t], inner: base.inner, warnings,
      // In 3D: the lid turned over, lifted a little off the base.
      poses: [{ part: "lid", on: "base", flip: true, top: t + lid.h * 0.6 }],
      assembly: [
        "Crease every fold line.",
        "Base: fold the four walls up; glue each corner tab inside the side wall next to it.",
        "Lid: fold and glue it the same way.",
        "Put the lid on the base: it slides over with the clearance you set.",
      ],
    };
  },
});
