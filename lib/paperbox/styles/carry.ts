/**
 * Boxes you carry: a carry-handle box (a snap-lock bottom, a flat top and two handle panels back
 * to back), a wine or bottle carrier (a crash-lock bottom, the same handle top, and a partition
 * insert that stands inside it), and a paper bag (side gussets, a glued block bottom, a folded-in
 * top band and holes for rope handles).
 */
import { circle } from "@/lib/generators/geom";
import { dustFlap, edge, glueFlap, Net, rectFlap } from "../geom";
import { registerBoxStyle } from "../registry";
import { boardGroup, num, sizeGroup } from "../schema";
import type { BoxParams, Dieline, DielinePart, Face } from "../types";
import { autoBottom, dustFields, onFace, sealEnd, snapLockBottom, stadium } from "./ends";
import { glueFields, tube, TUBE_DEFAULTS, type TubeLayout } from "./tuck";

/** A flat top from the front and back panels meeting in the middle, each rising into a handle with a hand hole. */
function handleTop(T: TubeLayout, p: BoxParams) {
  const { net, l, w } = T, hh = num(p, "handleH", 40);
  const holeW = Math.min(num(p, "handleW", 0) || l * 0.55, l - 10, 95), holeH = Math.min(24, hh * 0.5);
  for (const f of [T.front, T.back]) {
    const top = net.flap(`top-${f.id}`, "Top", T.top(f), rectFlap(l, w / 2), { parent: f.id, printable: true });
    const tt = onFace(top);
    const handle = net.flap(`handle-${f.id}`, "Handle", edge(tt(0, w / 2), tt(l, w / 2), tt(l / 2, 0)), rectFlap(l, hh), { parent: top.id, angle: -90, printable: true });
    net.hole(stadium(handle, l / 2, hh * 0.55, holeW, holeH));
  }
  const dd = Math.min(w * 0.9, l * 0.42);
  for (const sd of [T.sideA, T.sideB]) net.flap(`top-dust-${sd.id}`, "Dust flap", T.top(sd), dustFlap(w, dd, Math.min(dd * 0.45, w * 0.3), num(p, "dustR", 3)), { parent: sd.id });
  if (holeH + 8 > hh) T.warnings.push("The handle is short for its hand hole; make it taller.");
}

const handleFields = [
  { key: "handleH", label: "Handle height", kind: "length" as const, min: 20, max: 150, step: 0.5 },
  { key: "handleW", label: "Hand hole width", kind: "length" as const, min: 0, max: 200, step: 0.5, help: "Leave it at 0 to size it to the box." },
];

export const CARRY = registerBoxStyle({
  id: "carry", name: "Carry box (handle)", icon: "briefcase", blurb: "A box with a flat top and a handle on it: take-away, party favours, a gift to carry.",
  defaultParams: { ...TUBE_DEFAULTS, paper: "400", L: 160, W: 90, H: 110, handleH: 45, handleW: 0, dustDepth: 0, dustR: 3 } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "handle", title: "Handle", fields: handleFields }, { id: "dust", title: "Bottom flaps", fields: dustFields }],
  build(p): Dieline {
    const T = tube(p, true);
    snapLockBottom(T, p);
    handleTop(T, p);
    return {
      style: "carry", parts: [T.net.build("carry", "Carry box", num(p, "bleed", 0))], outer: [T.outer[0], T.outer[1], T.outer[2] + num(p, "handleH", 45)], inner: T.inner, warnings: T.warnings,
      assembly: [
        "Crease every fold line.", "Glue the glue flap inside the last side panel, making a tube.",
        "Close the snap-lock bottom: side flaps in, then the back flap, then the front flap's tongue into its notch.",
        "Fill it, fold the top dust flaps in, close the two top halves and stand the handles up back to back (glue or staple them).",
      ],
    };
  },
});

const BOTTLES: Record<string, [number, number]> = { "1": [1, 1], "2": [2, 1], "4": [2, 2], "6": [3, 2] };

/** One partition strip, `len` long and `h` high, with slots `from` its top or bottom at `at` and end flaps glued to the walls. */
function divider(id: string, name: string, len: number, h: number, t: number, at: number[], from: "top" | "bottom", flaps: boolean): DielinePart {
  const net = new Net(true), sw = t + 0.3;
  net.panel("divider", "Divider", 0, 0, len, h, { printable: true });
  for (const x of at) net.notch(from === "top" ? [[x - sw / 2, -1], [x + sw / 2, -1], [x + sw / 2, h / 2], [x - sw / 2, h / 2]] : [[x - sw / 2, h / 2], [x + sw / 2, h / 2], [x + sw / 2, h + 1], [x - sw / 2, h + 1]]);
  if (flaps) {
    const g = Math.min(15, len / 4);
    net.flap("end-a", "Glue flap", edge([0, h], [0, 0], [len / 2, h / 2]), glueFlap(h, g, 15), { parent: "divider" });
    net.flap("end-b", "Glue flap", edge([len, 0], [len, h], [len / 2, h / 2]), glueFlap(h, g, 15), { parent: "divider" });
  }
  return net.build(id, name);
}

export const WINE = registerBoxStyle({
  id: "wine", name: "Wine carrier", icon: "wine", blurb: "A bottle carrier with a crash-lock bottom, a handle top and a partition insert that keeps the bottles apart.",
  defaultParams: { ...TUBE_DEFAULTS, paper: "eflute", L: 0, W: 0, H: 250, bottles: "2", bottleD: 80, insertH: 0, handleH: 45, handleW: 0, dustR: 3 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Bottles", fields: [
      { key: "bottles", label: "Bottles", kind: "select", options: [{ v: "1", text: "One" }, { v: "2", text: "Two" }, { v: "4", text: "Four" }, { v: "6", text: "Six" }] },
      { key: "bottleD", label: "Bottle diameter", kind: "length", min: 40, max: 160, step: 0.5, help: "A wine bottle is about 75 to 80 mm across." },
      { key: "H", label: "Carrier height", kind: "length", min: 60, max: 500, step: 0.5, help: "Up to the bottles' shoulders is enough." },
      { key: "insertH", label: "Insert height", kind: "length", min: 0, max: 500, step: 0.5, help: "Leave it at 0 for about two thirds of the carrier." },
    ] },
    boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "handle", title: "Handle", fields: handleFields },
  ],
  build(p): Dieline {
    const [cols, rows] = BOTTLES[String(p.bottles)] ?? BOTTLES["2"], D = num(p, "bottleD", 80) + 2;
    const q = { ...p, L: cols * D, W: rows * D, dims: "inner" } as BoxParams;
    const T = tube(q, true);
    autoBottom(T, q);
    handleTop(T, q);
    const parts: DielinePart[] = [T.net.build("carrier", "Carrier", num(p, "bleed", 0))];
    const poses: NonNullable<Dieline["poses"]> = [];
    const hi = Math.min(num(p, "insertH", 0) || T.h * 0.66, T.h - 5), { l, w, t } = T;
    for (let i = 1; i < cols; i++) {
      parts.push(divider(`across-${i}`, `Divider ${i}`, w, hi, t, Array.from({ length: rows - 1 }, (_, j) => ((j + 1) * w) / rows), "top", true));
      poses.push({ part: `across-${i}`, on: "carrier", turn: [90, 0, 90], bottom: t, shift: [-l / 2 + (i * l) / cols, 0, 0] });
    }
    for (let j = 1; j < rows; j++) {
      parts.push(divider(`along-${j}`, `Long divider ${j}`, l, hi, t, Array.from({ length: cols - 1 }, (_, i) => ((i + 1) * l) / cols), "bottom", true));
      poses.push({ part: `along-${j}`, on: "carrier", turn: [90, 0, 0], bottom: t, shift: [0, -w / 2 + (j * w) / rows, 0] });
    }
    return {
      style: "wine", parts, poses, outer: [T.outer[0], T.outer[1], T.outer[2] + num(p, "handleH", 45)], inner: T.inner, warnings: T.warnings,
      assembly: [
        "Crease every fold line.", "Glue the glue flap inside the last side panel, and glue each bottom flap's glue triangle to the next flap round, with the carrier flat.",
        "Open the carrier: the crash-lock bottom springs square.",
        ...(parts.length > 1 ? ["Slot the dividers together where they cross, glue their end flaps inside the walls and stand them in the carrier."] : []),
        "Put the bottles in, close the top halves and stand the handles up back to back.",
      ],
    };
  },
});

export const BAG = registerBoxStyle({
  id: "bag", name: "Paper bag", icon: "shopping-bag", blurb: "A gusseted bag with a block bottom, a folded-in top band and rope handle holes: shopping, gifts, take-away.",
  defaultParams: { ...TUBE_DEFAULTS, paper: "kraft300", L: 200, W: 90, H: 250, cuff: 35, handles: true, dustDepth: 0, dustR: 2 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Width", kind: "length", min: 50, max: 600, step: 0.5, help: "Across the front." },
      { key: "W", label: "Gusset", kind: "length", min: 20, max: 300, step: 0.5, help: "The depth of the side folds (and of the bottom)." },
      { key: "H", label: "Height", kind: "length", min: 50, max: 800, step: 0.5 },
      { key: "dims", label: "Sizes are", kind: "select", options: [{ v: "inner", text: "Inside" }, { v: "outer", text: "Outside" }] },
    ] },
    boardGroup, { id: "glue", title: "Glue flap", fields: glueFields },
    { id: "top", title: "Top and handles", fields: [
      { key: "cuff", label: "Top band", kind: "length", min: 0, max: 120, step: 0.5, help: "The band folded inside the top for strength; 0 leaves it off." },
      { key: "handles", label: "Handle holes", kind: "toggle", help: "Two holes in the front and the back for rope handles, through the top band too." },
    ] },
  ],
  build(p): Dieline {
    const T = tube(p, true), { net, l, w } = T, cuff = Math.min(num(p, "cuff", 35), T.h / 3);
    // The gussets fold in down the middle of each side.
    for (const sd of [T.sideA, T.sideB]) net.crease([[sd.origin[0] + w / 2, 0], [sd.origin[0] + w / 2, T.h]]);
    sealEnd(T, p, "bottom");
    const rope = (f: Face, v: number) => { const at = onFace(f); for (const u of [l * 0.3, l * 0.7]) net.hole(circle(...at(u, v), 3)); };
    for (const f of [T.front, T.back, T.sideA, T.sideB]) {
      if (cuff > 0) {
        const band = net.flap(`band-${f.id}`, "Inner top fold", T.top(f), rectFlap(f.w, cuff), { parent: f.id, angle: 180 });
        if (p.handles && (f === T.front || f === T.back)) rope(band, cuff / 2);
      }
      if (p.handles && (f === T.front || f === T.back)) rope(f, Math.max(cuff, 30) / 2);
    }
    return {
      style: "bag", parts: [net.build("bag", "Paper bag", num(p, "bleed", 0))], outer: T.outer, inner: T.inner, warnings: T.warnings,
      assembly: [
        "Crease every fold line, the gussets' middle folds too.",
        ...(cuff > 0 ? ["Fold the top band inside and glue it down."] : []),
        "Glue the glue flap inside the last panel, making a tube; push the gussets in along their middle folds.",
        "Fold the bottom: the side flaps in, then the inner flap, then glue the outer flap over them.",
        ...(p.handles ? ["Thread rope handles through the holes and knot them inside."] : []),
      ],
    };
  },
});
