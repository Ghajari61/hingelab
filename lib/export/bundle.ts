/**
 * The export dialog's files: an editor's exported SVG in the chosen format, all sheets in one file or
 * one file per sheet in a ZIP, mirrored or with hairlines. With no option changed an SVG comes back
 * exactly as the editor wrote it. Everything runs on the device.
 */
import { strToU8, zipSync } from "fflate";
import { svgToDXF } from "./dxf";
import { sceneLBRN } from "./lbrn2";
import type { LaserOp, LaserSetting } from "@/lib/materials/library";
import { scenePDF } from "./pdfVector";
import { FORMAT_INFO, HAIRLINE_MM, type ExportSettings, type Rect } from "./profiles";
import { readScene } from "./scene";
import { sceneSVG, sheetName, sheetRects, tailOf, type Place } from "./sheets";
import { mergedNote, mergeSharedCuts } from "./watertight";

export interface ExportFile { name: string; data: string | Uint8Array; mime: string }
export interface ExportResult {
  /** One file to download (a ZIP when there are several). */
  file: ExportFile;
  /** Files inside the ZIP, or just the file. */
  count: number;
  /** Things the user should know (pictures left out, and so on). */
  notes: string[];
}

/** The user's own laser settings for the LightBurn file, and the material they belong to. */
export interface LaserFromMaterial { name: string; laser: Partial<Record<LaserOp, LaserSetting>> }

/** The STL file (3D print) of an exported SVG, loaded only when asked for so the triangulation stays out of the editors. */
export async function makeSTLExport(svg: string, s: ExportSettings, base: string, thickness?: number): Promise<ExportResult> {
  const { loopsToSTL, cutLoops } = await import("./stl");
  const T = s.stlT ?? thickness ?? 3;
  const r = loopsToSTL(cutLoops(readScene(svg)), T);
  const note = `${r.pieces} solid piece${r.pieces === 1 ? "" : "s"}, ${Math.round(T * 100) / 100} mm thick. Open the file in your slicer; the parts lie flat as on the sheet.`;
  return { file: { name: `${base}.stl`, data: r.data, mime: FORMAT_INFO.stl.mime }, count: 1, notes: [note] };
}

export function makeExport(svg: string, sheets: Rect[] | null | undefined, s: ExportSettings, base: string, mat?: LaserFromMaterial): ExportResult {
  const fmt = FORMAT_INFO[s.format];
  const notes: string[] = [];
  const merged = s.merge === false ? { scene: readScene(svg), removed: 0 } : mergeSharedCuts(readScene(svg));
  const scene = merged.scene;
  const plain = !s.mirror && !s.hairline && !merged.removed;
  if (merged.removed) notes.push(mergedNote(merged.removed));
  const rects = sheetRects(scene, sheets);
  const split = s.split && rects.length > 1;
  const whole: Place = { rect: { x: 0, y: 0, w: scene.W, h: scene.H }, sheet: null, mirror: s.mirror };
  // A sheet on its own keeps what lies below the sheets (the Free plan's mark) under it.
  const tail = tailOf(scene, rects);
  const sheetPlace = (i: number): Place => ({ rect: { ...rects[i], h: rects[i].h + tail }, sheet: i, mirror: s.mirror });
  const places: Place[] = split ? rects.map((_, i) => sheetPlace(i)) : [whole];
  const svgOf = (pl: Place) => (pl.sheet === null && plain ? svg : sceneSVG(scene, rects, pl, { hairline: s.hairline ? HAIRLINE_MM : undefined }));
  const files: ExportFile[] = [];
  let skipped = 0, set = 0;

  if (s.format === "pdf") {
    // One PDF, a page per sheet; with "one file per sheet", one PDF per sheet.
    const pagesOf = (pl: Place[]) => scenePDF(scene, rects, pl, s.hairline ? HAIRLINE_MM : 0.1);
    const all = rects.length > 1 ? rects.map((_, i) => sheetPlace(i)) : [whole];
    if (split) all.forEach((pl, i) => { const r = pagesOf([pl]); skipped += r.skipped; files.push({ name: sheetName(base, i, rects.length, fmt.ext), data: r.pdf, mime: fmt.mime }); });
    else { const r = pagesOf(all); skipped = r.skipped; files.push({ name: `${base}.${fmt.ext}`, data: r.pdf, mime: fmt.mime }); }
    if (skipped) notes.push(`${skipped} picture${skipped === 1 ? " is" : "s are"} not a JPEG or a plain PNG and ${skipped === 1 ? "is" : "are"} left out of the PDF.`);
  } else {
    places.forEach((pl, i) => {
      const name = split ? sheetName(base, i, rects.length, fmt.ext) : `${base}.${fmt.ext}`;
      if (s.format === "svg") files.push({ name, data: svgOf(pl), mime: fmt.mime });
      else if (s.format === "dxf") {
        const r = svgToDXF(svgOf(pl), { inches: s.inches });
        skipped += r.skipped;
        files.push({ name, data: r.dxf, mime: fmt.mime });
      } else {
        const r = sceneLBRN(scene, rects, pl, mat?.laser);
        skipped += r.skipped;
        set = Math.max(set, r.set);
        files.push({ name, data: r.xml, mime: fmt.mime });
      }
    });
    if (skipped && s.format === "dxf") notes.push("Pictures cannot go into a DXF: engrave them from the SVG.");
    if (skipped && s.format === "lbrn2") notes.push("Text and pictures are not in the LightBurn file: import the SVG into LightBurn for those.");
    if (set && mat) notes.push(`Your laser settings for “${mat.name}” are in the LightBurn file. Check them in LightBurn before you cut.`);
  }
  if (!split && rects.length > 1 && s.format !== "pdf") notes.push(`The ${rects.length} sheets are stacked in one file. Choose One file per sheet to cut them one at a time.`);
  if (files.length === 1) return { file: files[0], count: 1, notes };
  const zip: Record<string, Uint8Array> = {};
  for (const fl of files) zip[fl.name] = typeof fl.data === "string" ? strToU8(fl.data) : fl.data;
  return { file: { name: `${base}-sheets.zip`, data: zipSync(zip, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") }), mime: "application/zip" }, count: files.length, notes };
}
