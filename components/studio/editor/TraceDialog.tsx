"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLocalAsset } from "@/lib/studio/localStore";
import { locate } from "@/lib/studio/scene";
import { traceNodeCount, TRACE_DEFAULTS, type TraceMode, type TraceOptions, type TraceResult } from "@/lib/studio/trace";
import { placeTrace, traceLayer } from "@/lib/studio/trace/place";
import { pathD } from "@/lib/studio/geom";
import type { Document, ImageNode } from "@/lib/studio/types";
import { Dialog, NumberInput, SegmentedControl, Select } from "@/components/ui";
import { loadTraceRaster, traceAsync, type TraceRaster } from "./traceClient";
import { useEditor, useEditorApi } from "./store";

type Props = { open: boolean; onClose: () => void; onDone?: (id: string, lines: boolean) => void };

const MODES: { value: TraceMode; label: string }[] = [
  { value: "brightness", label: "Brightness cut-off" },
  { value: "edges", label: "Edge detection" },
  { value: "colors", label: "Colour quantisation" },
  { value: "scans", label: "Multiple scans" },
  { value: "centerline", label: "Centre-line (single strokes)" },
];
const MODE_NOTE: Record<TraceMode, string> = {
  brightness: "Pixels darker than the cut-off become filled shapes.",
  edges: "Outlines where the brightness changes sharply.",
  colors: "Reduces the image to a few colours and traces one path per colour.",
  scans: "Several passes through brightness or colour, one path per pass.",
  centerline: "Follows the middle of dark strokes: open lines for scoring or single-line engraving.",
};
const DETAIL = [{ value: "400", label: "Fast (400 px)" }, { value: "800", label: "Standard (800 px)" }, { value: "1600", label: "Fine (1600 px)" }];

const pickImage = (s: { doc: Document; selection: string[] }): ImageNode | null => {
  if (s.selection.length !== 1) return null;
  const n = locate(s.doc.root, s.selection[0])?.node;
  return n?.type === "image" ? n : null;
};

/** Trace Bitmap…: turns the selected image into vector paths with a live side-by-side preview. */
export function TraceDialog({ open, onClose, onDone }: Props) {
  const api = useEditorApi();
  const image = useEditor(pickImage);
  const docId = useEditor((s) => s.doc.id);
  const [opts, setOpts] = useState<TraceOptions>(TRACE_DEFAULTS);
  const [detail, setDetail] = useState("800");
  const [target, setTarget] = useState<"cut" | "engrave">("cut");
  const [raster, setRaster] = useState<TraceRaster | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [res, setRes] = useState<{ result: TraceResult; ms: number; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assetId = image?.assetId;
  const set = <K extends keyof TraceOptions>(k: K, v: TraceOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const key = useMemo(() => JSON.stringify([opts, detail]), [opts, detail]);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!open || !assetId) return;
    let alive = true, made: string | null = null;
    setRaster(null); setRes(null); setError(null);
    loadTraceRaster(docId, assetId, Number(detail))
      .then((r) => { if (alive) { if (r) setRaster(r); else setError("This image isn't stored on this device, so it can't be traced here."); } })
      .catch(() => { if (alive) setError("The image couldn't be read."); });
    void getLocalAsset(docId, assetId).then((b) => {
      if (!alive || !b) return;
      made = URL.createObjectURL(new Blob([b as BlobPart]));
      setUrl(made);
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); setUrl(null); };
  }, [open, docId, assetId, detail]);

  useEffect(() => {
    if (!open || !raster) return;
    const k = key;
    setBusy(true);
    const t = setTimeout(() => {
      traceAsync(raster, opts)
        .then((r) => { if (r && keyRef.current === k) { setRes({ ...r, key: k }); setBusy(false); setError(null); } })
        .catch((e: Error) => { if (keyRef.current === k) { setBusy(false); setError(e.message); } });
    }, 180);
    return () => clearTimeout(t);
  }, [open, raster, opts, key]);

  const lines = opts.mode === "centerline";

  const ok = async () => {
    if (!image || !raster) return;
    let result = res?.key === key ? res.result : null;
    if (!result) {
      setBusy(true);
      result = (await traceAsync(raster, opts))?.result ?? null;
      setBusy(false);
    }
    if (!result) return;
    const s = api.getState();
    const layer = traceLayer(s.doc, s.currentLayer, !lines && target === "engrave");
    const id = s.edit("Trace Bitmap", (d) => placeTrace(d, image.id, result, layer));
    if (id) {
      api.getState().select([id]);
      // Doubled edges only matter for cutting; engraved areas are filled whatever their outlines share.
      if (s.doc.cutLayers[layer]?.mode !== "fill") onDone?.(id, result.lines);
    }
    onClose();
  };

  const nodes = res ? traceNodeCount(res.result) : 0;
  const paths = res ? res.result.layers.reduce((a, l) => a + l.subpaths.length, 0) : 0;
  const empty = !!res && res.key === key && paths === 0;
  return (
    <Dialog open={open} title="Trace Bitmap" onClose={onClose} size="wide" testId="trace-dialog"
      footer={<>
        <span className="dlg-note" data-testid="trace-stats" aria-live="polite">
          {error ? error : !raster ? "Reading image…" : busy ? "Tracing…" : res ? `${paths} path${paths === 1 ? "" : "s"}, ${nodes} nodes · ${Math.round(res.ms)} ms` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ui-btn primary" onClick={() => void ok()} disabled={!raster || empty || !!error} data-testid="dlg-ok">Trace</button>
      </>}>
      {!image ? <p className="dlg-note">Select one image to trace.</p> : (
        <div className="trace-dlg">
          <div className="trace-previews">
            <figure>
              <div className="trace-pane">{url ? <img src={url} alt="Original image" /> : null}</div>
              <figcaption>Original</figcaption>
            </figure>
            <figure>
              <div className="trace-pane traced" data-testid="trace-preview">
                {res ? <TracePreview result={res.result} /> : null}
              </div>
              <figcaption>Traced{busy ? " (updating…)" : ""}</figcaption>
            </figure>
          </div>
          <div className="form-grid">
            <div className="full"><Select label="Mode" value={opts.mode} options={MODES} onChange={(v) => set("mode", v)} testId="trace-mode" /></div>
            <p className="dlg-note full" style={{ marginTop: -6 }}>{MODE_NOTE[opts.mode]}</p>
            {(opts.mode === "brightness" || opts.mode === "centerline") && (
              <NumberInput label="Brightness cut-off" value={Math.round(opts.threshold * 100)} min={1} max={99} integer suffix="%" onChange={(v) => set("threshold", v / 100)} testId="trace-threshold" />
            )}
            {opts.mode === "edges" && (
              <NumberInput label="Edge strength" value={Math.round(opts.edgeThreshold * 100)} min={1} max={99} integer suffix="%" onChange={(v) => set("edgeThreshold", v / 100)} testId="trace-edge" />
            )}
            {opts.mode === "colors" && (
              <NumberInput label="Colours" value={opts.colors} min={2} max={16} integer onChange={(v) => set("colors", v)} testId="trace-colors" />
            )}
            {opts.mode === "scans" && <>
              <NumberInput label="Scans" value={opts.scans} min={2} max={16} integer onChange={(v) => set("scans", v)} testId="trace-scans" />
              <SegmentedControl label="Scan by" value={opts.scanBy} onChange={(v) => set("scanBy", v)} options={[{ value: "brightness", label: "Brightness" }, { value: "colors", label: "Colours" }]} />
              <SegmentedControl label="Paths" value={opts.stack ? "stacked" : "separate"} onChange={(v) => set("stack", v === "stacked")}
                options={[{ value: "separate", label: "Separate", title: "Bands that don't overlap" }, { value: "stacked", label: "Stacked", title: "Each scan also covers everything darker" }]} />
            </>}
            {(opts.mode === "colors" || opts.mode === "scans") && (
              <label className="pn-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={opts.skipBackground} onChange={(e) => set("skipBackground", e.target.checked)} /> Leave out the background</label>
            )}
            {(opts.mode === "brightness" || opts.mode === "centerline" || (opts.mode === "scans" && opts.scanBy === "brightness")) && (
              <label className="pn-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={opts.invert} onChange={(e) => set("invert", e.target.checked)} data-testid="trace-invert" /> Invert (trace light parts)</label>
            )}
            <NumberInput label="Remove speckles under" value={opts.speckles} min={0} max={500} integer suffix="px" onChange={(v) => set("speckles", v)} testId="trace-speckles" />
            <NumberInput label="Corner smoothing" value={opts.smooth} min={0} max={1.3} step={0.1} onChange={(v) => set("smooth", v)} testId="trace-smooth" />
            <NumberInput label="Optimise tolerance" value={opts.optimize} min={0} max={5} step={0.1} suffix="px" onChange={(v) => set("optimize", v)} testId="trace-optimize" />
            <Select label="Detail" value={detail} options={DETAIL} onChange={setDetail} testId="trace-detail" />
            {!lines && (
              <div className="full">
                <SegmentedControl label="Put the paths on" value={target} onChange={setTarget} full
                  options={[{ value: "cut", label: "Current layer" }, { value: "engrave", label: "Engrave (fill) layer" }]} />
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function TracePreview({ result }: { result: TraceResult }) {
  const w = Math.max(1, result.width), h = Math.max(1, result.height);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-label="Traced preview">
      {result.layers.slice().reverse().map((l, i) => (
        result.lines
          ? <path key={i} d={pathD(l.subpaths)} fill="none" stroke={l.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          : <path key={i} d={pathD(l.subpaths)} fill={l.color} fillRule="evenodd" stroke="none" />
      ))}
    </svg>
  );
}
