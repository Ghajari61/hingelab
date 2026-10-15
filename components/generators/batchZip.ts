import { strToU8, zipSync } from "fflate";
import { makeExport, type LaserFromMaterial } from "@/lib/export/bundle";
import { defaultExport, FORMAT_INFO, type ExportFormat } from "@/lib/export/profiles";
import { rowFolders, rowText, slugOf, type BatchRow } from "@/lib/batch/rows";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { setPath } from "@/lib/generators/path";
import type { AnyGenerator, BuildContext, FieldSpec, GenBase, ImageSpec } from "@/lib/generators/types";
import { pictureJpeg } from "./ImagePicker";
import { makePhoto, photoAspect } from "./photoClient";

type P = GenBase & Record<string, unknown>;

/** The image field a row's photo goes into: the first one shown for the design. */
export function photoField(def: AnyGenerator, p: P): ImageSpec<P> | null {
  for (const s of def.sections) {
    if (s.show && !(s.show as (q: P) => boolean)(p)) continue;
    for (const f of s.fields as FieldSpec<P>[]) if (f.kind === "image" && !f.trace && (!f.show || f.show(p))) return f;
  }
  return null;
}

const baseName = (f: string) => f.split(/[\\/]/).pop()!.trim().toLowerCase();

async function withPhoto(f: ImageSpec<P>, q: P, file: Blob): Promise<P> {
  if (f.look) {
    const aspect = await photoAspect(file);
    const made = await makePhoto(file, f.look.spec(setPath(q, f.aspectKey, aspect)));
    let next = setPath(q, f.key, made.url);
    next = setPath(next, f.aspectKey, made.width / made.height);
    return setPath(next, f.look.px, Math.max(made.width, made.height));
  }
  const pic = await pictureJpeg(file, f.color);
  return setPath(setPath(q, f.key, pic.url), f.aspectKey, pic.aspect);
}

export interface BatchJob {
  def: AnyGenerator;
  params: P;
  ctx: BuildContext;
  rows: BatchRow[];
  /** Photos chosen for the rows, by file name. */
  photos: File[];
  formats: ExportFormat[];
  machine: string;
  mat?: LaserFromMaterial;
  /** Pro designs are refused unless the plan allows them. */
  pro: boolean;
  onProgress: (done: number, total: number) => void;
  cancelled: () => boolean;
}

export interface BatchResult { zip: Uint8Array; made: number; failed: { row: number; name: string; why: string }[] }

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** One folder of files per row, and a summary.csv listing what was made; null when cancelled. */
export async function batchZip(job: BatchJob): Promise<BatchResult | null> {
  const { def, params, ctx, rows } = job;
  const key = def.batch?.(params as never);
  if (!key) throw new Error("This design has no text to personalise.");
  const field = def.sections.flatMap((s) => s.fields).find((f) => f.key === key);
  const multiline = !!(field && field.kind === "text" && field.multiline);
  const photos = new Map(job.photos.map((f) => [baseName(f.name), f]));
  const pf = photoField(def, params);
  const folders = rowFolders(rows);
  const files: Record<string, Uint8Array> = {};
  const failed: BatchResult["failed"] = [];
  const summary = ["row,name,date,photo,result"];
  let made = 0;
  for (let i = 0; i < rows.length; i++) {
    if (job.cancelled()) return null;
    job.onProgress(i, rows.length);
    await new Promise((r) => setTimeout(r, 0));
    const row = rows[i];
    const fail = (why: string) => { failed.push({ row: i + 1, name: row.name, why }); summary.push([String(i + 1), row.name, row.date, row.photo, why].map(csvCell).join(",")); };
    try {
      let q = setPath(setPath(params, key, rowText(row, multiline)), "job.names", "") as P;
      if (row.photo) {
        const file = photos.get(baseName(row.photo));
        if (!pf) { fail("This design has no photo to replace."); continue; }
        if (!file) { fail(`Photo “${row.photo}” was not chosen.`); continue; }
        q = await withPhoto(pf, q, file);
      }
      const a = arrangeGenerator(def, q, ctx);
      if ("error" in a.result) { fail(a.result.error); continue; }
      const out = a.result.out;
      if (out.notice) { fail(out.notice); continue; }
      if (out.missing?.length) { fail(`The font has no ${out.missing.join(" ")}.`); continue; }
      if (!a.lay) { fail("It does not fit on the sheet."); continue; }
      const lock = def.pro?.(a.params as never, out) ?? null;
      if (lock && !job.pro) { fail(lock); continue; }
      const svg = genSVG(def, a.params, a.lay);
      const slug = slugOf(row.name);
      for (const fmt of job.formats) {
        const name = `${folders[i]}/${slug}.${FORMAT_INFO[fmt].ext}`;
        if (fmt === "svg") { files[name] = strToU8(svg); continue; }
        const r = makeExport(svg, a.sheets, { ...defaultExport(job.machine), format: fmt, split: false }, slug, job.mat);
        files[name] = typeof r.file.data === "string" ? strToU8(r.file.data) : r.file.data;
      }
      made++;
      summary.push([String(i + 1), row.name, row.date, row.photo, "made"].map(csvCell).join(","));
    } catch (e) {
      fail(e instanceof Error && e.message ? e.message : "This row could not be built.");
    }
  }
  job.onProgress(rows.length, rows.length);
  files["summary.csv"] = strToU8("\uFEFF" + summary.join("\r\n") + "\r\n");
  return { zip: zipSync(files, { level: 6 }), made, failed };
}
