/**
 * More tube cartons: a tuck top with a snap-lock (1-2-3) or crash-lock (auto) bottom, the glued
 * seal-end carton, and the hanging box (a reverse tuck with a hang tab for a peg hook).
 */
import { unionShapes } from "@/lib/letters/polygon";
import { registerBoxStyle } from "../registry";
import { boardGroup, num, sizeGroup } from "../schema";
import type { BoxParams, Dieline, Face, Pt } from "../types";
import { autoBottom, dustFields, onFace, sealEnd, snapLockBottom, stadium } from "./ends";
import { glueFields, tube, tuckEnd, tuckFields, TUBE_DEFAULTS } from "./tuck";

const TUCK_DEFAULTS = { tuckLen: 0, tuckR: 6, slitLock: true, dustDepth: 0, dustR: 3 };
const crease = "Crease every fold line before folding: fold each one back and forth once.";
const glue = "Fold the glue flap in and glue it inside the last side panel, making a flat tube.";

export const SNAP_LOCK = registerBoxStyle({
  id: "snap-lock", name: "Snap-lock bottom", icon: "package-check", blurb: "A tuck top with a 1-2-3 lock bottom: it holds heavier things than a tuck and needs no glue to close.",
  defaultParams: { ...TUBE_DEFAULTS, L: 80, W: 50, H: 120, ...TUCK_DEFAULTS } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "tuck", title: "Top tuck and dust flaps", fields: tuckFields }],
  build(p): Dieline {
    const T = tube(p, true);
    tuckEnd(T, p, T.front, "top", [T.sideA, T.sideB]);
    snapLockBottom(T, p);
    return {
      style: "snap-lock", parts: [T.net.build("carton", "Snap-lock carton", num(p, "bleed", 0))], outer: T.outer, inner: T.inner, warnings: T.warnings,
      assembly: [crease, glue, "Bottom: fold the two side flaps in, then the back flap, then the front flap, and push its tongue into the back flap's notch until the bottom lies flat.", "Fill the box, fold the top dust flaps in and tuck the lid shut."],
    };
  },
});

export const AUTO_BOTTOM = registerBoxStyle({
  id: "auto-bottom", name: "Auto bottom (crash lock)", icon: "package-open", blurb: "A tuck top with a pre-glued bottom that springs square as you open the flat carton: fast to pack.",
  defaultParams: { ...TUBE_DEFAULTS, L: 80, W: 60, H: 120, ...TUCK_DEFAULTS } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "tuck", title: "Top tuck and dust flaps", fields: tuckFields }],
  build(p): Dieline {
    const T = tube(p, true);
    tuckEnd(T, p, T.front, "top", [T.sideA, T.sideB]);
    autoBottom(T, p);
    return {
      style: "auto-bottom", parts: [T.net.build("carton", "Auto-bottom carton", num(p, "bleed", 0))], outer: T.outer, inner: T.inner, warnings: T.warnings,
      assembly: [
        crease,
        "With the carton flat, fold each bottom flap's glue triangle back along its diagonal crease and glue it to the next flap round.",
        glue,
        "Squeeze the flat carton open: the bottom unfolds and locks square.",
        "Fill the box, fold the top dust flaps in and tuck the lid shut.",
      ],
    };
  },
});

export const SEAL_END = registerBoxStyle({
  id: "seal-end", name: "Seal end carton", icon: "box", blurb: "Both ends glued shut, like a cereal box: tamper-evident, flat-topped and cheap to make.",
  defaultParams: { ...TUBE_DEFAULTS, L: 190, W: 60, H: 270, paper: "300", dustDepth: 0, dustR: 3 } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "dust", title: "Dust flaps", fields: dustFields }],
  build(p): Dieline {
    const T = tube(p, true);
    sealEnd(T, p, "top");
    sealEnd(T, p, "bottom");
    return {
      style: "seal-end", parts: [T.net.build("carton", "Seal end carton", num(p, "bleed", 0))], outer: T.outer, inner: T.inner, warnings: T.warnings,
      assembly: [crease, glue, "Bottom: fold the dust flaps in and the inner flap over them, then glue the outer flap down on top.", "Fill the box and close the top the same way."],
    };
  },
});

/** A peg-hook hole of the hang tab, centred on (cx, cy) of the tab's own frame. */
function hangHole(kind: string, f: Face, cx: number, cy: number, w: number): Pt[] | null {
  const at = onFace(f);
  const ring = (x: number, y: number, r: number) => Array.from({ length: 36 }, (_, i) => { const a = (2 * Math.PI * i) / 36; return at(x + r * Math.cos(a), y + r * Math.sin(a)); });
  if (kind === "round") return ring(cx, cy, 4.5);
  const slot = stadium(f, cx, cy, Math.min(30, w * 0.5), 6);
  if (kind === "slot") return slot;
  // The euro slot ("sombrero"): a slot with a round hole rising from its middle.
  if (kind === "euro") return unionShapes([slot, ring(cx, cy - 3, 5)])[0]?.outer ?? slot;
  return null;
}

export const HANGING = registerBoxStyle({
  id: "hanging", name: "Hanging box", icon: "tag", blurb: "A reverse tuck carton with a hang tab and a peg-hook hole, for shop displays.",
  defaultParams: { ...TUBE_DEFAULTS, L: 70, W: 25, H: 110, ...TUCK_DEFAULTS, hangH: 35, hangHole: "euro", hangDouble: true } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "tuck", title: "Tucks and dust flaps", fields: tuckFields }, {
    id: "hang", title: "Hang tab", fields: [
      { key: "hangH", label: "Tab height", kind: "length", min: 15, max: 120, step: 0.5 },
      { key: "hangHole", label: "Hole", kind: "select", options: [{ v: "euro", text: "Euro slot" }, { v: "round", text: "Round" }, { v: "slot", text: "Slot" }, { v: "none", text: "None" }], help: "The hole for a shop's peg hook." },
      { key: "hangDouble", label: "Double thickness", kind: "toggle", help: "A second layer folds behind the tab and is glued, so the hole does not tear." },
    ],
  }],
  build(p): Dieline {
    const T = tube(p, true), { net, l } = T;
    tuckEnd(T, p, T.front, "top", [T.sideA, T.sideB]);
    tuckEnd(T, p, T.back, "bottom", [T.sideA, T.sideB]);
    const hh = num(p, "hangH", 35), x0 = T.back.origin[0];
    const tab = net.panel("hang", "Hang tab", x0, -hh, l, hh, { parent: "back", hinge: [[x0, 0], [x0 + l, 0]], angle: 0, printable: true });
    const kind = String(p.hangHole);
    const cy = hh * 0.45;
    const hole = hangHole(kind, tab, l / 2, cy, l);
    if (hole) net.hole(hole);
    if (p.hangDouble) {
      net.panel("hang-lining", "Hang tab lining", x0, -2 * hh, l, hh, { parent: "hang", hinge: [[x0, -hh], [x0 + l, -hh]], angle: 180 });
      net.crease([[x0, -hh], [x0 + l, -hh]]);
      if (hole) net.hole(hole.map(([x, y]) => [x, -2 * hh - y] as Pt));
    }
    if (hh < 20 && kind !== "none") T.warnings.push("The hang tab is short for its hole; make it at least 20 mm.");
    return {
      style: "hanging", parts: [net.build("carton", "Hanging box", num(p, "bleed", 0))], outer: [T.outer[0], T.outer[1], T.outer[2] + hh], inner: T.inner, warnings: T.warnings,
      assembly: [crease, ...(p.hangDouble ? ["Fold the hang tab's lining down behind it and glue it, lining up the holes."] : []), glue, "Close the bottom: dust flaps in, then the bottom lid and its tuck.", "Fill the box and tuck the top lid shut behind the hang tab."],
    };
  },
});

