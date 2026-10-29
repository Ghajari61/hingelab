/**
 * The World Miniature generator's build: one builder per design, then the joint fit on every part
 * (as Boxes does: the fit grows each outline and shrinks each hole by the same amount, so every tab
 * and slot tightens or loosens together; the kerf is added by the export).
 */
import { makeShape, offsetShapes } from "@/lib/letters/polygon";
import type { BuildContext, GenPart } from "../types";
import { buildFurniture } from "./furniture";
import { buildHouse, type MiniOutput } from "./house";
import { buildNook } from "./nook";
import { FIT_MM, FIT_NAMES, type MiniatureParams } from "./params";

export type { MiniOutput };

function fitPart(pt: GenPart, e: number): GenPart {
  const grown = offsetShapes([makeShape(pt.outer, [])], e, "miter");
  if (!grown.length) return pt;
  const outer = grown.reduce((a, b) => (b.area > a.area ? b : a)).outer;
  const holes = pt.holes.flatMap((h) => { const s = offsetShapes([makeShape(h, [])], -e, "miter"); return s.length ? s.map((x) => x.outer) : []; });
  return { ...pt, outer, holes };
}

export function buildMiniature(p: MiniatureParams, _ctx: BuildContext): MiniOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const out = p.design === "nook" ? buildNook(p) : p.design === "furniture" ? buildFurniture(p) : buildHouse(p);
  const d = FIT_MM[p.joint.fit] ?? 0;
  if (!d || out.error) return out;
  return { ...out, parts: out.parts.map((pt) => fitPart(pt, d / 2)), stats: [...out.stats, { label: "Fit", value: `${FIT_NAMES[p.joint.fit]} (${d > 0 ? "+" : ""}${d} mm on every joint)` }] };
}
