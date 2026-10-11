/**
 * Server-side validation of generator settings. `merge` only keeps values of the right type; this
 * also holds every field to what the editor itself allows (number ranges, the listed choices, text
 * length, picture format), so a hand-made request cannot ask the server for a billion puzzle pieces,
 * a NaN size or an unknown option.
 */
import { isImageDataURL } from "@/lib/security/svg";
import { getPath, setPath } from "./path";
import { MAX_BATCH_TEXT, MAX_COPIES, type GenBase, type GeneratorDef } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The shell's own fields (material, sheet, extras), with the ranges the dock allows. */
const BASE_RANGES: { key: string; min: number; max: number; int?: boolean }[] = [
  { key: "T", min: 0.5, max: 30 },
  { key: "K", min: 0, max: 1 },
  { key: "bedW", min: 50, max: 10000 },
  { key: "bedH", min: 50, max: 10000 },
  { key: "gap", min: 0, max: 1000 },
  { key: "sheet.copies", min: 1, max: MAX_COPIES, int: true },
  { key: "fit.sheets", min: 1, max: 100, int: true },
];

const MAX_NAME = 200;
/** Text fields without their own limit (custom outlines as SVG path data). */
const MAX_TEXT = 100_000;

export function sanitizeGeneratorParams<P extends GenBase>(def: GeneratorDef<P>, p: P): P {
  const d = def.defaults();
  let q = p;
  const set = (key: string, v: unknown) => { q = setPath(q, key, v); };
  for (const r of BASE_RANGES) {
    const cur = getPath(q, r.key);
    if (cur === undefined) continue;
    const dv = getPath(d, r.key);
    let v = finite(cur) ? cur : finite(dv) ? dv : r.min;
    v = clamp(v, r.min, r.max);
    if (r.int) v = Math.round(v);
    if (v !== cur) set(r.key, v);
  }
  if (typeof q.name !== "string") set("name", d.name);
  else if (q.name.length > MAX_NAME) set("name", q.name.slice(0, MAX_NAME));
  if (getPath(q, "job") !== undefined) {
    const mirror = getPath(q, "job.mirror");
    if (typeof mirror !== "boolean") set("job.mirror", false);
    const names = getPath(q, "job.names");
    if (typeof names !== "string") set("job.names", "");
    else if (names.length > MAX_BATCH_TEXT) set("job.names", names.slice(0, MAX_BATCH_TEXT));
  }
  for (const s of def.sections) {
    for (const f of s.fields) {
      const cur = getPath(q, f.key);
      const dv = getPath(d, f.key);
      if (f.kind === "number") {
        let v = finite(cur) ? cur : finite(dv) ? dv : f.min;
        v = clamp(v, f.min, f.max);
        if (f.int) v = Math.round(v);
        if (v !== cur) set(f.key, v);
      } else if (f.kind === "choice") {
        if (!f.options.some((o) => o.v === String(cur))) set(f.key, dv);
      } else if (f.kind === "toggle") {
        if (typeof cur !== "boolean") set(f.key, !!dv);
      } else if (f.kind === "text") {
        const max = f.maxLength ?? MAX_TEXT;
        if (typeof cur !== "string") set(f.key, dv);
        else if (cur.length > max) set(f.key, cur.slice(0, max));
      } else if (f.kind === "font") {
        if (typeof cur !== "string" || cur.length > 100) set(f.key, dv);
      } else if (f.kind === "image") {
        if (cur !== "" && !isImageDataURL(cur)) set(f.key, "");
      }
    }
  }
  return q;
}
