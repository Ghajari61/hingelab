import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isMotifId } from "../motifs";
import { isShapeKind, type ShapeKind } from "../shapes";
import { SECOND_MATERIALS } from "../material2";
import { JOB_EXTRAS, SHEET_EXTRAS, type GenBase } from "../types";
import { TEXT_STYLE, cleanTextStyle, type TextStyle } from "../textStyle";
import { mergeInto } from "../util";

export type TableBuild = "stand" | "tent" | "plaque";
export type TableMark = "engrave" | "score" | "raised";
export type TableMotifPlace = "above" | "below" | "both";

export interface TablenumParams extends GenBase {
  batch: {
    /** Range numbers the tables from..to; List takes one table per line of `list`. */
    mode: "range" | "list";
    from: number;
    to: number;
    /** Leading zeros up to this many digits (0 = none). */
    pad: number;
    list: string;
    /** Range mode: an optional second line per table (for example a family's name). */
    names: string;
  };
  build: { kind: TableBuild; double: boolean };
  plate: { shape: ShapeKind; auto: boolean; pad: number; width: number; height: number; corner: number };
  text: {
    label: string;
    labelFont: string;
    labelSize: number;
    labelBelow: boolean;
    fontId: string;
    size: number;
    spacing: number;
    nameSize: number;
    mark: TableMark;
  };
  textStyle: TextStyle;
  motif: { kind: string; place: TableMotifPlace; size: number; gap: number };
  border: { kind: "none" | "score" | "engrave"; inset: number };
  base: { layers: number; depth: number; width: number; step: number; corner: number };
  hinge: { band: number; slit: number; bridge: number; pitch: number };
  plaque: { holes: "none" | "top" | "two" };
  mat: { mat2: string; T2: number };
}

export const TABLENUM_DEFAULTS: TablenumParams = {
  name: "Table numbers",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_EXTRAS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  batch: { mode: "range", from: 1, to: 6, pad: 0, list: "", names: "" },
  build: { kind: "stand", double: false },
  plate: { shape: "arch", auto: true, pad: 16, width: 110, height: 150, corner: 4 },
  text: { label: "Table", labelFont: "pacifico", labelSize: 18, labelBelow: false, fontId: "archivo-black", size: 60, spacing: 0, nameSize: 10, mark: "engrave" },
  textStyle: { ...TEXT_STYLE },
  motif: { kind: "none", place: "above", size: 22, gap: 4 },
  border: { kind: "score", inset: 5 },
  base: { layers: 2, depth: 60, width: 90, step: 4, corner: 4 },
  hinge: { band: 20, slit: 24, bridge: 3, pitch: 2 },
  plaque: { holes: "none" },
  mat: { mat2: "acrylic-gold", T2: 3 },
};

const BUILDS: TableBuild[] = ["stand", "tent", "plaque"];
const MARKS: TableMark[] = ["engrave", "score", "raised"];
const PLACES: TableMotifPlace[] = ["above", "below", "both"];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mergeTablenum(raw: unknown): TablenumParams {
  const d = TABLENUM_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  if (p.batch.mode !== "range" && p.batch.mode !== "list") p.batch.mode = d.batch.mode;
  if (!BUILDS.includes(p.build.kind)) p.build.kind = d.build.kind;
  p.textStyle = cleanTextStyle(p.textStyle);
  if (!MARKS.includes(p.text.mark)) p.text.mark = d.text.mark;
  if (!isShapeKind(p.plate.shape)) p.plate.shape = d.plate.shape;
  if (p.motif.kind !== "none" && !isMotifId(p.motif.kind)) p.motif.kind = "none";
  if (!PLACES.includes(p.motif.place)) p.motif.place = d.motif.place;
  if (!["none", "score", "engrave"].includes(p.border.kind)) p.border.kind = d.border.kind;
  if (!["none", "top", "two"].includes(p.plaque.holes)) p.plaque.holes = d.plaque.holes;
  if (!(p.mat.mat2 in SECOND_MATERIALS)) p.mat.mat2 = d.mat.mat2;
  p.batch.from = clamp(Math.round(p.batch.from), 0, 999);
  p.batch.to = clamp(Math.round(p.batch.to), 0, 999);
  p.batch.pad = clamp(Math.round(p.batch.pad), 0, 3);
  p.base.layers = clamp(Math.round(p.base.layers), 1, 3);
  return p;
}

/** The tables in the batch: each one's main text and optional second line. */
export function tableList(p: TablenumParams, max = MAX_TABLES): { main: string; sub: string }[] {
  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim());
  if (p.batch.mode === "list") return lines(p.batch.list).filter(Boolean).slice(0, max).map((main) => ({ main, sub: "" }));
  const names = lines(p.batch.names);
  const out: { main: string; sub: string }[] = [];
  const step = p.batch.to >= p.batch.from ? 1 : -1;
  for (let n = p.batch.from, i = 0; out.length < max; n += step, i++) {
    out.push({ main: formatNumber(n, p), sub: names[i] ?? "" });
    if (n === p.batch.to) break;
  }
  return out;
}

export const MAX_TABLES = 60;

export function formatNumber(n: number, p: Pick<TablenumParams, "batch">): string {
  return String(n).padStart(p.batch.pad, "0");
}
