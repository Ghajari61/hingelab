/**
 * Shipping cartons (FEFCO 0201 family): four panels joined by a glue flap, with a flap on every
 * panel's top and bottom edge, slotted apart. Regular slotted (RSC): every flap half the width, the
 * long ones meeting in the middle; full overlap (FOL): the long flaps the full width; half slotted
 * (HSC): no top flaps, an open tray.
 */
import { rectFlap } from "../geom";
import { registerBoxStyle } from "../registry";
import { boardGroup, num, sizeGroup } from "../schema";
import type { BoxParams, Dieline, Face, Pt } from "../types";
import { glueFields, tube, TUBE_DEFAULTS } from "./tuck";

export const SHIPPING = registerBoxStyle({
  id: "shipping", name: "Shipping carton (RSC)", icon: "truck", blurb: "The everyday corrugated carton: four flaps top and bottom, taped shut. Regular slotted, full overlap or open top.",
  defaultParams: { ...TUBE_DEFAULTS, paper: "eflute", L: 250, W: 180, H: 150, glueW: 30, glueTaper: 10, flaps: "rsc", slot: 0 } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, { id: "glue", title: "Manufacturer's joint", fields: glueFields }, {
    id: "flaps", title: "Flaps", fields: [
      { key: "flaps", label: "Flaps", kind: "select", options: [{ v: "rsc", text: "Regular slotted (RSC)" }, { v: "fol", text: "Full overlap (FOL)" }, { v: "hsc", text: "Open top (HSC)" }], help: "RSC: the long flaps meet in the middle. FOL: they overlap fully, for strength. HSC: no top flaps." },
      { key: "slot", label: "Slot width", kind: "length", min: 0, max: 20, step: 0.5, help: "The gap between flaps; leave it at 0 for twice the board's thickness." },
    ],
  }],
  build(p): Dieline {
    const T = tube(p, true), { net, l, w, t } = T, kind = String(p.flaps);
    const s = num(p, "slot", 0) || 2 * t + 0.5;
    const flap = (f: Face, end: "top" | "bottom", depth: number, id: string, name: string, shown: boolean) => {
      const a = f.w, e = end === "top" ? T.top(f) : T.bottom(f);
      const shape: Pt[] = rectFlap(a, depth).map(([x, y]) => [Math.min(a - s / 2, Math.max(s / 2, x)), y] as Pt);
      net.flap(id, name, e, shape, { parent: f.id, printable: shown });
    };
    for (const end of ["top", "bottom"] as const) {
      if (end === "top" && kind === "hsc") continue;
      const outer = end === "top" ? "Top" : "Bottom", major = kind === "fol" ? w - 0.5 : w / 2 - 0.25;
      flap(T.front, end, major, `${end}-front`, outer, true);
      flap(T.back, end, major, `${end}-back`, kind === "fol" ? `Inner ${end} flap` : outer, kind !== "fol");
      for (const sd of [T.sideA, T.sideB]) flap(sd, end, w / 2 - 0.25, `${end}-${sd.id}`, `Inner ${end} flap`, false);
    }
    if (kind === "fol" && w > l * 0.9) T.warnings.push("Full overlap flaps this wide stand far out on a short box; regular slotted may suit it better.");
    const style = { rsc: "Regular slotted carton", fol: "Full overlap carton", hsc: "Open-top carton" }[kind] ?? "Shipping carton";
    return {
      style: "shipping", parts: [net.build("carton", style, num(p, "bleed", 0))], outer: T.outer, inner: T.inner, warnings: T.warnings,
      assembly: [
        "Crease or score every fold line; corrugated folds best across its flutes.",
        "Glue (or tape) the manufacturer's joint inside the last panel.",
        "Bottom: fold the short flaps in, then the long ones, and tape along the seam.",
        kind === "hsc" ? "The top stays open, as a tray or a crate." : "Fill the carton and close the top the same way.",
      ],
    };
  },
});
