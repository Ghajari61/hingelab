/**
 * Tuck-end cartons: a tube of four panels closed with a glue flap, a tuck lid at each end and dust
 * flaps on the sides. Reverse tuck puts the top lid on the front and the bottom lid on the back;
 * straight tuck puts both on the front. The tube builder is shared with the lock-bottom styles.
 *
 * Sheet coordinates: x to the right, y down; the body's top edge at y = 0.
 */
import { dustFlap, edge, glueFlap, Net, rectFlap, tuckFlap, type Edge } from "../geom";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, sizeGroup, thick } from "../schema";
import type { BoxParams, Dieline, Face, ParamField } from "../types";

export interface TubeLayout {
  net: Net;
  l: number; w: number; h: number; t: number;
  /** Panels by role. */
  front: Face; back: Face; sideA: Face; sideB: Face;
  inner: [number, number, number]; outer: [number, number, number];
  /** The top and bottom edge of a panel, flaps outward. */
  top: (f: Face) => Edge;
  bottom: (f: Face) => Edge;
  warnings: string[];
}

/** The four panels and the glue flap. Glue left: [back][side A][front][side B]; right: [side A][front][side B][back]. */
export function tube(p: BoxParams): TubeLayout {
  const t = thick(p), { l, w, h, inner, outer } = panelSizes(p.L, p.W, p.H, p.dims === "outer" ? "outer" : "inner", t);
  const net = new Net(), warnings: string[] = [];
  const g = Math.min(num(p, "glueW", 15), w - 1, l - 1), taper = num(p, "glueTaper", 15);
  const right = p.gluePos === "right";
  const order = right ? ["sideA", "front", "sideB", "back"] : ["back", "sideA", "front", "sideB"];
  const names: Record<string, string> = { back: "Back", front: "Front", sideA: "Side", sideB: "Side" };
  let x = right ? 0 : g;
  const faces: Record<string, Face> = {};
  let prev: Face | undefined;
  for (const id of order) {
    const pw = id === "front" || id === "back" ? l : w;
    const f = net.panel(id, names[id], x, 0, pw, h, { printable: true, ...(prev ? { parent: prev.id, hinge: [[x, 0], [x, h]], angle: 90 } : {}) });
    if (prev) net.crease([[x, 0], [x, h]]);
    faces[id] = f; prev = f; x += pw;
  }
  // The glue flap on the back panel's free edge, glued inside the last panel.
  const back = faces.back;
  const ge = right ? edge([back.origin[0] + l, 0], [back.origin[0] + l, h], [back.origin[0], h / 2]) : edge([g, h], [g, 0], [g + 1, h / 2]);
  net.flap("glue", "Glue flap", ge, glueFlap(h, g, taper), { parent: "back" });
  if (g < 8) warnings.push("The glue flap is narrower than 8 mm; it may not hold.");
  const top = (f: Face) => edge([f.origin[0], 0], [f.origin[0] + f.w, 0], [f.origin[0] + f.w / 2, 1]);
  const bottom = (f: Face) => edge([f.origin[0] + f.w, h], [f.origin[0], h], [f.origin[0] + f.w / 2, h - 1]);
  return { net, l, w, h, t, front: faces.front, back, sideA: faces.sideA, sideB: faces.sideB, inner, outer, top, bottom, warnings };
}

/**
 * A tuck closure on panel `f` at one end: a lid as deep as the side, a rounded tuck flap with slit
 * locks, and dust flaps on both sides. `leading` names the side panel next to the lid's hinge.
 */
export function tuckEnd(T: TubeLayout, p: BoxParams, f: Face, end: "top" | "bottom", sides: [Face, Face]) {
  const { net, l, w, t } = T;
  const e = end === "top" ? T.top(f) : T.bottom(f);
  const lid = net.flap(`lid-${end}`, end === "top" ? "Top lid" : "Bottom lid", e, rectFlap(l, w), { parent: f.id });
  // The lid's far edge, in sheet coordinates.
  const a = lid.poly[1], b = lid.poly[2];
  const tl = num(p, "tuckLen", 0) || Math.min(Math.max(12, w * 0.7), 30);
  const s = Math.min(l / 4, t + 0.4);
  const tuckE = edge(a, b, lid.origin);
  net.flap(`tuck-${end}`, end === "top" ? "Top tuck" : "Bottom tuck", tuckE, tuckFlap(l, tl, num(p, "tuckR", 6), s), { parent: lid.id, slit: p.slitLock ? Math.min(5, l / 6) : 0 });
  if (tl > T.h * 0.9) T.warnings.push(`The ${end} tuck is longer than the box is tall; it will hit the other end.`);
  const dd = num(p, "dustDepth", 0) || Math.min(l * 0.42, w * 0.95);
  if (dd > l / 2) T.warnings.push(`The ${end} dust flaps (${dd.toFixed(0)} mm) overlap in the middle; keep them under ${(l / 2).toFixed(0)} mm.`);
  for (const sd of sides) {
    const de = end === "top" ? T.top(sd) : T.bottom(sd);
    net.flap(`dust-${end}-${sd.id}`, "Dust flap", de, dustFlap(w, dd, Math.min(dd * 0.45, w * 0.3), num(p, "dustR", 3)), { parent: sd.id });
  }
}

const tuckFields: ParamField[] = [
  { key: "tuckLen", label: "Tuck length", kind: "length", min: 0, max: 200, step: 0.5, help: "Leave it at 0 to size it to the box." },
  { key: "tuckR", label: "Tuck corner radius", kind: "length", min: 0, max: 40, step: 0.5 },
  { key: "slitLock", label: "Slit locks", kind: "toggle", help: "Short cuts at the ends of the tuck's fold; the tuck clicks shut and stays." },
  { key: "dustDepth", label: "Dust flap depth", kind: "length", min: 0, max: 300, step: 0.5, help: "Leave it at 0 to size them to the box." },
  { key: "dustR", label: "Dust flap radius", kind: "length", min: 0, max: 30, step: 0.5 },
];
export const glueFields: ParamField[] = [
  { key: "glueW", label: "Glue flap width", kind: "length", min: 5, max: 60, step: 0.5 },
  { key: "glueTaper", label: "Glue flap taper", kind: "number", unit: "deg", min: 0, max: 45, step: 1 },
  { key: "gluePos", label: "Glue flap on", kind: "select", options: [{ v: "left", text: "Left" }, { v: "right", text: "Right" }] },
];
export const TUBE_DEFAULTS = { ...BASE_DEFAULTS, glueW: 15, glueTaper: 15, gluePos: "left" } as const;

function tuckBox(id: string, name: string, reverse: boolean, blurb: string) {
  return registerBoxStyle({
    id, name, icon: "package", blurb,
    defaultParams: { ...TUBE_DEFAULTS, L: 60, W: 40, H: 100, tuckLen: 0, tuckR: 6, slitLock: true, dustDepth: 0, dustR: 3 } as BoxParams,
    paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, { id: "tuck", title: "Tucks and dust flaps", fields: tuckFields }],
    build(p): Dieline {
      const T = tube(p);
      tuckEnd(T, p, T.front, "top", [T.sideA, T.sideB]);
      tuckEnd(T, p, reverse ? T.back : T.front, "bottom", [T.sideA, T.sideB]);
      return {
        style: id, parts: [T.net.build("carton", name, num(p, "bleed", 0))], outer: T.outer, inner: T.inner, warnings: T.warnings,
        assembly: [
          "Crease every fold line before folding: fold each one back and forth once.",
          "Fold the glue flap in and glue it inside the last side panel, making a flat tube.",
          `Open the tube square. Fold the bottom dust flaps in, then the bottom lid, and tuck it in${p.slitLock ? " until the slit locks click" : ""}.`,
          "Fill the box, fold the top dust flaps in, and close the top lid with its tuck.",
        ],
      };
    },
  });
}

export const REVERSE_TUCK = tuckBox("reverse-tuck", "Reverse tuck end", true, "The classic retail carton: the top tucks in from the front, the bottom from the back.");
export const STRAIGHT_TUCK = tuckBox("straight-tuck", "Straight tuck end", false, "Both tucks close from the front, so the front shows no fold lines.");
