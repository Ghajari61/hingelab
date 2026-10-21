/**
 * What a wall piece needs beyond its cut parts: the sheet count in words, the rails' lumber, length
 * and screws, and the assembled piece as a GLB model (three.js's exporter, loaded only when asked).
 */
import type * as THREE from "three";
import { cleanRails, LUMBER } from "./backboard";
import type { ParametricParams, SliceResult } from "./types";

export interface MountEstimate {
  rails: number;
  lumber: string;
  /** Each rail's length, mm (the run across the slats plus 20 mm each end). */
  railLength: number;
  /** Screws into the wall: one every 400 mm along each rail (a stud's spacing), and one at each end. */
  wallScrews: number;
  /** A pin or a dab of glue where every slat crosses a rail. */
  pins: number;
}

export function mountEstimate(p: ParametricParams, r: SliceResult | null): MountEstimate | null {
  if (!r || p.method !== "parallel" || p.parallel.backboard !== "rails") return null;
  const slats = r.parts.filter((q) => q.kind === "slat" || q.kind === "fin");
  if (!slats.length || !r.planes.length) return null;
  const m = cleanRails(p.parallel.rails), offs = r.planes.map((pl) => pl.offset);
  const railLength = Math.round(Math.max(...offs) - Math.min(...offs) + p.material.T + 40);
  return { rails: m.count, lumber: LUMBER[m.lumber].name, railLength, wallScrews: m.count * (Math.ceil(railLength / 400) + 1), pins: slats.length * m.count };
}

/** "~10 sheets of 24 × 12 in" (or mm): the sheet count and size, in the units shown. */
export function sheetsLabel(p: ParametricParams, sheets: number, inches: boolean): string {
  const f = (v: number) => (inches ? `${Math.round((v / 25.4) * 10) / 10}` : `${Math.round(v)}`);
  return `${sheets === 1 ? "1 sheet" : `~${sheets} sheets`} of ${f(p.material.sheetW)} × ${f(p.material.sheetH)} ${inches ? "in" : "mm"}`;
}

/** The assembled piece as a binary glTF (GLB), for other 3D programs and AR viewers. */
export async function glbOf(object: THREE.Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const out = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
  if (!(out instanceof ArrayBuffer)) throw new Error("The 3D model could not be written.");
  return out;
}
