"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { ToolId } from "@/lib/site/tools";

const MAX_BYTES = 8 * 1024 * 1024;

function save(name: string, data: string | Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** The SVG with hairline cuts drawn one screen pixel wide, so a whole sheet is readable in the preview. */
const forPreview = (svg: string) => svg.replace(/<svg\b[^>]*>/i, (tag) => `${tag}<style>path,rect,circle,ellipse,line,polyline,polygon{vector-effect:non-scaling-stroke}[stroke]:not([stroke="none"]) *,[stroke]:not([stroke="none"]){stroke-width:1.2px}</style>`);

const num = (s: string, d: number) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : d; };

/** One free tool: pick an SVG, set two or three numbers, see the result, download it. */
export function FreeTool({ tool }: { tool: ToolId }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("3"), [to, setTo] = useState("4");
  const [thick, setThick] = useState("3");
  const [sheetW, setSheetW] = useState("600"), [sheetH, setSheetH] = useState("400"), [gap, setGap] = useState("3"), [rotate, setRotate] = useState(true);
  const [out, setOut] = useState<{ name: string; data: string | Uint8Array; mime: string; note: string; preview?: string } | null>(null);
  const base = (file?.name ?? "design").replace(/\.svg$/i, "").replace(/[^\w.-]+/g, "-");

  async function pick(f: File | undefined) {
    setOut(null); setError("");
    if (!f) return;
    if (f.size > MAX_BYTES) { setError("The file is larger than 8 MB."); return; }
    const text = await f.text();
    if (!/<svg\b/i.test(text)) { setError("This file is not an SVG."); return; }
    setFile({ name: f.name, text });
  }

  async function run() {
    if (!file) return;
    setBusy(true); setError(""); setOut(null);
    try {
      if (tool === "thickness-resizer") {
        const { resizeForThickness } = await import("@/lib/tools/resize");
        const r = resizeForThickness(file.text, num(from, 3), num(to, 4));
        const mm = (x: number) => `${Math.round(x * 10) / 10}`;
        setOut({ name: `${base}-${to}mm.svg`, data: r.svg, mime: "image/svg+xml", preview: forPreview(r.svg), note: `Scaled by ${Math.round(r.factor * 1000) / 1000}: ${mm(r.before.w)} × ${mm(r.before.h)} mm becomes ${mm(r.after.w)} × ${mm(r.after.h)} mm.` });
      } else if (tool === "svg-to-stl") {
        const { svgToSTL } = await import("@/lib/export/stl");
        const r = svgToSTL(file.text, num(thick, 3));
        if (!r.pieces) throw new Error("No closed cut lines were found, so there is nothing to print.");
        setOut({ name: `${base}.stl`, data: r.data, mime: "model/stl", note: `${r.pieces} solid piece${r.pieces === 1 ? "" : "s"}, ${num(thick, 3)} mm thick, ${r.triangles.toLocaleString()} triangles.` });
      } else {
        const { nestSvg } = await import("@/lib/tools/nestSvg");
        await new Promise((res) => window.setTimeout(res, 30));
        const r = nestSvg(file.text, { sheetW: num(sheetW, 600), sheetH: num(sheetH, 400), margin: 5, gap: num(gap, 3), rotate });
        setOut({
          name: `${base}-nested.svg`, data: r.svg, mime: "image/svg+xml", preview: forPreview(r.svg),
          note: `${r.parts} part${r.parts === 1 ? "" : "s"} on ${r.sheets} sheet${r.sheets === 1 ? "" : "s"}, ${Math.round(r.used * 100)} % of the material used.${r.tooBig ? ` ${r.tooBig} part${r.tooBig === 1 ? " is" : "s are"} larger than the sheet and left out.` : ""}`,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work. Try another file.");
    } finally {
      setBusy(false);
    }
  }

  const previewUrl = useMemo(() => (out?.preview ? URL.createObjectURL(new Blob([out.preview], { type: "image/svg+xml" })) : null), [out]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div className="tool-box">
      <label className="tool-drop">
        <Upload size={22} aria-hidden="true" />
        <span>{file ? file.name : "Choose an SVG file"}</span>
        <small>It stays on your device.</small>
        <input type="file" accept=".svg,image/svg+xml" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      <div className="tool-fields">
        {tool === "thickness-resizer" && (
          <>
            <label>Drawn for, mm<input inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Your sheet, mm<input inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
        {tool === "svg-to-stl" && <label>Part thickness, mm<input inputMode="decimal" value={thick} onChange={(e) => setThick(e.target.value)} /></label>}
        {tool === "nesting" && (
          <>
            <label>Sheet width, mm<input inputMode="decimal" value={sheetW} onChange={(e) => setSheetW(e.target.value)} /></label>
            <label>Sheet height, mm<input inputMode="decimal" value={sheetH} onChange={(e) => setSheetH(e.target.value)} /></label>
            <label>Gap between parts, mm<input inputMode="decimal" value={gap} onChange={(e) => setGap(e.target.value)} /></label>
            <label className="tool-check"><input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />Turn parts to fit</label>
          </>
        )}
      </div>
      <div className="tool-actions">
        <button type="button" className="btn-primary" disabled={!file || busy} onClick={() => void run()}>{busy ? "Working…" : tool === "nesting" ? "Nest the parts" : tool === "svg-to-stl" ? "Make the STL" : "Resize"}</button>
        {out && <button type="button" className="btn-ghost" onClick={() => save(out.name, out.data, out.mime)}><Download size={16} aria-hidden="true" />Download {out.name}</button>}
      </div>
      {error && <p className="tool-error" role="alert">{error}</p>}
      {out && <p className="tool-note" role="status">{out.note}</p>}
      {previewUrl && <img className="tool-preview" src={previewUrl} alt="Preview of the result" />}
      <p className="tool-safety">Measure your real material thickness and kerf, and cut or print a small test before the whole job.</p>
    </div>
  );
}
