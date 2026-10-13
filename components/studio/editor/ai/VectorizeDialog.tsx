"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Info, Wand2, XCircle } from "lucide-react";
import { Dialog, NumberInput, SegmentedControl, Select } from "@/components/ui";
import { machineById, materialById } from "@/lib/studio/library";
import { pathD } from "@/lib/studio/geom";
import { safeFeature, type SafetyContext } from "@/lib/imaging/safety";
import { cleanVectorize, VECTORIZE_DEFAULTS, type VectorizeOptions } from "@/lib/imaging/vectorize";
import type { VectorResult } from "@/lib/imaging/ops";
import type { Img } from "@/lib/imaging/image";
import { useEditor, useEditorApi } from "../store";
import { imaging } from "./imagingClient";
import { pickImage, readNodeImage, uploadUrl } from "./assets";
import { generatorParams, openInGenerator, placeTarget, TARGETS, type TargetId } from "./targets";

export interface VectorizeStart {
  target?: TargetId;
  widthMm?: number;
  lines?: boolean;
}

type Props = {
  open: boolean;
  onClose: () => void;
  start?: VectorizeStart;
  onDone: (id: string, label: string, cut: boolean) => void;
  beforeLeave: () => Promise<void>;
  toast: (m: string) => void;
};

const USE_FOR: Record<TargetId, SafetyContext["use"]> = { canvas: "cut", topper: "cut", sign: "engrave", lamp: "cut", trophy: "cut", clock: "cut", puzzle: "engrave", relief: "cut" };

/** AI Studio ▸ Vectorize: the selected image to cut-ready outlines, checked for cutting before it is placed. */
export function VectorizeDialog({ open, onClose, start, onDone, beforeLeave, toast }: Props) {
  const api = useEditorApi();
  const image = useEditor(pickImage);
  const docId = useEditor((s) => s.doc.id);
  const sheet = useEditor((s) => s.doc.sheets[0]);
  const [img, setImg] = useState<Img | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<TargetId>(start?.target ?? "canvas");
  const [use, setUse] = useState<SafetyContext["use"]>(USE_FOR[start?.target ?? "canvas"]);
  const [opts, setOpts] = useState<VectorizeOptions>(() => ({ ...VECTORIZE_DEFAULTS, lines: !!start?.lines, widthMm: start?.widthMm ?? 100 }));
  const [res, setRes] = useState<{ v: VectorResult; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const key = JSON.stringify([opts, use]);
  const keyRef = useRef(key);
  keyRef.current = key;

  const machine = sheet ? machineById(sheet.machineId) : undefined;
  const material = sheet ? materialById(sheet.materialId) : undefined;
  const ctx: SafetyContext = useMemo(() => ({
    bedW: machine?.bedW ?? sheet?.w ?? 600, bedH: machine?.bedH ?? sheet?.h ?? 400,
    minFeatureMm: safeFeature(material?.thickness ?? 3), use,
  }), [machine, material, sheet, use]);

  const assetId = image?.assetId;
  useEffect(() => {
    if (!open || !image) return;
    let alive = true;
    setImg(null); setRes(null); setError(null);
    const sx = Math.hypot(image.transform[0], image.transform[1]) || 1;
    if (!start?.widthMm) setOpts((o) => ({ ...o, widthMm: Math.round(image.w * sx) }));
    readNodeImage(docId, image, 1400).then((i) => { if (alive) setImg(i); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, docId, assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !img) return;
    const k = key;
    setBusy(true);
    const t = setTimeout(() => {
      imaging({ op: "vectorize", img, options: opts, ctx })
        .then((r) => { if (r.kind === "vector" && keyRef.current === k) { setRes({ v: r.vector, key: k }); setBusy(false); setError(null); } })
        .catch((e: Error) => { if (keyRef.current === k) { setBusy(false); setError(e.message); } });
    }, 220);
    return () => clearTimeout(t);
  }, [open, img, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof VectorizeOptions>(k: K, v: VectorizeOptions[K]) => setOpts((o) => cleanVectorize({ ...o, [k]: v }));
  const fixAll = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const r = await imaging({ op: "vectorize", img, options: opts, ctx, fixAll: true });
      if (r.kind === "vector") {
        setOpts(r.vector.settings);
        toast(r.vector.applied.length ? `Fixed: ${r.vector.applied.join(", ")}` : "No safe fix left; change the settings by hand.");
      }
    } finally {
      setBusy(false);
    }
  };

  const ok = async () => {
    if (!image || !img) return;
    let v = res?.key === key ? res.v : null;
    if (!v) {
      setBusy(true);
      const r = await imaging({ op: "vectorize", img, options: opts, ctx }).finally(() => setBusy(false));
      v = r.kind === "vector" ? r.vector : null;
    }
    if (!v || !v.subpaths.length) return;
    const info = TARGETS.find((t) => t.id === target)!;
    if (info.where === "editor") {
      setPlacing(true);
      try {
        const picture = target === "puzzle" ? await uploadUrl(img, 1024) : undefined;
        const g = generatorParams(target, v.subpaths, v.widthMm, v.heightMm, picture);
        if (!g) return;
        await beforeLeave();
        openInGenerator(g.product, image.name?.replace(/\.[a-z]+$/i, "") || "AI design", g.params);
      } finally {
        setPlacing(false);
      }
      return;
    }
    const id = placeTarget(api, target as "canvas" | "topper" | "sign" | "lamp", v.subpaths, v.widthMm, v.heightMm, { source: image }, {
      lines: v.lines, engrave: use === "engrave" && target === "canvas",
      lamp: { width: Math.max(120, Math.round(v.widthMm)), height: Math.max(80, Math.round(v.heightMm)) },
    });
    if (id) onDone(id, info.name, !v.lines && use !== "engrave");
    onClose();
  };

  const v = res?.v;
  const errors = v?.issues.filter((i) => i.level === "error").length ?? 0;
  const info = TARGETS.find((t) => t.id === target)!;
  return (
    <Dialog open={open} title="Vectorize with cut check" onClose={onClose} size="wide" testId="ai-vectorize-dialog"
      footer={<>
        <span className="dlg-note" aria-live="polite" data-testid="ai-vector-stats">
          {error ? error : !img ? "Reading image…" : busy ? "Vectorizing…" : v ? `${v.subpaths.length} paths, ${v.nodes.toLocaleString("en")} nodes · ${Math.round(v.widthMm)} × ${Math.round(v.heightMm)} mm · ${(v.lengthMm / 1000).toFixed(2)} m to cut${v.bridges ? ` · ${v.bridges} bridges` : ""}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ui-btn primary" onClick={() => void ok()} disabled={!v || !v.subpaths.length || placing} data-testid="ai-vector-ok"
          title={errors ? "There are errors left; you can still place it." : undefined}>
          {info.where === "editor" ? `Open in ${info.name}` : target === "canvas" ? "Place" : `Make ${info.name.toLowerCase()}`}
        </button>
      </>}>
      {!image ? <p className="dlg-note">Select one image to vectorize.</p> : (
        <div className="trace-dlg">
          <div className="trace-previews">
            <figure>
              <div className="trace-pane traced" data-testid="ai-vector-preview">{v ? <VectorPreview v={v} /> : null}</div>
              <figcaption>Result{busy ? " (updating…)" : ""}</figcaption>
            </figure>
            <figure>
              <div className="ai-issues" data-testid="ai-safety">
                {!v ? <p className="dlg-note">Checking…</p> : v.issues.length === 0 ? (
                  <p className="ai-ok"><Check size={14} aria-hidden /> Ready to cut: fits the {Math.round(ctx.bedW)} × {Math.round(ctx.bedH)} mm bed{use !== "engrave" && !v.lines ? `, no parts thinner than ${ctx.minFeatureMm} mm, no loose pieces` : ""}.</p>
                ) : (
                  <>
                    <ul>
                      {v.issues.map((i) => (
                        <li key={i.code} className={i.level}>
                          {i.level === "error" ? <XCircle size={14} aria-hidden /> : i.level === "warn" ? <AlertTriangle size={14} aria-hidden /> : <Info size={14} aria-hidden />}
                          <span>{i.message}</span>
                          <span className="fixes">
                            {i.fixes.map((f) => <button key={f.id} type="button" className="ui-btn small" onClick={() => setOpts(f.settings)}>{f.label}</button>)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="ui-btn" onClick={() => void fixAll()} disabled={busy || !v.issues.some((i) => i.fixes.some((f) => f.safe))} data-testid="ai-fix-all">
                      <Wand2 size={14} aria-hidden /> Fix all
                    </button>
                  </>
                )}
              </div>
              <figcaption>Cut check ({material?.name ?? "material"}, {machine?.name ?? "sheet size"})</figcaption>
            </figure>
          </div>
          <div className="form-grid">
            <div className="full">
              <Select label="Use it for" value={target} testId="ai-vector-target" onChange={(t) => { setTarget(t); setUse(USE_FOR[t]); }}
                options={TARGETS.map((t) => ({ value: t.id, label: t.name, group: t.where === "studio" ? "In this project" : "Open in a generator" }))} />
              <p className="dlg-note" style={{ marginTop: 4 }}>{info.note}</p>
            </div>
            <SegmentedControl label="Trace" value={opts.source} onChange={(x) => set("source", x)}
              options={[{ value: "dark", label: "Dark parts" }, { value: "light", label: "Light parts" }, { value: "edges", label: "Edges" }]} />
            <SegmentedControl label="Make" value={opts.lines ? "lines" : "shapes"} onChange={(x) => set("lines", x === "lines")}
              options={[{ value: "shapes", label: "Outlines", title: "Closed shapes to cut or fill" }, { value: "lines", label: "Centre-lines", title: "Single strokes to score" }]} />
            {target === "canvas" && !opts.lines && (
              <SegmentedControl label="Check as" value={use} onChange={setUse}
                options={[{ value: "cut", label: "Cut-out" }, { value: "stencil", label: "Stencil" }, { value: "engrave", label: "Engraving" }]} />
            )}
            <NumberInput label={opts.source === "edges" ? "Edge strength" : "Cut-off"} value={Math.round(opts.threshold * 100)} min={1} max={99} integer suffix="%" onChange={(x) => set("threshold", x / 100)} testId="ai-vector-threshold" />
            <NumberInput label="Width" value={opts.widthMm} min={5} max={3000} suffix="mm" onChange={(x) => set("widthMm", x)} testId="ai-vector-width" />
            <NumberInput label="Thinnest part" value={opts.minFeatureMm} min={0} max={20} step={0.1} suffix="mm" onChange={(x) => set("minFeatureMm", x)} testId="ai-vector-minfeature" />
            <NumberInput label="Thicken" value={opts.thickenMm} min={0} max={10} step={0.1} suffix="mm" onChange={(x) => set("thickenMm", x)} />
            <NumberInput label="Drop specks under" value={opts.minAreaMm2} min={0} max={10000} step={0.5} suffix="mm²" onChange={(x) => set("minAreaMm2", x)} />
            {!opts.lines && (
              <Select label="Connect" value={opts.connect} onChange={(x) => set("connect", x)}
                options={[{ value: "none", label: "Leave pieces as they are" }, { value: "islands", label: "Join islands with bridges" }, { value: "holes", label: "Bridge stencil pockets" }]} />
            )}
            {!opts.lines && opts.connect !== "none" && <NumberInput label="Bridge width" value={opts.bridgeMm} min={0.3} max={20} step={0.1} suffix="mm" onChange={(x) => set("bridgeMm", x)} />}
            <NumberInput label="Smoothing" value={opts.smooth} min={0} max={1.3} step={0.1} onChange={(x) => set("smooth", x)} testId="ai-vector-smooth" />
            <NumberInput label="Simplify" value={opts.optimize} min={0} max={5} step={0.1} suffix="px" onChange={(x) => set("optimize", x)} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

function VectorPreview({ v }: { v: VectorResult }) {
  const d = useMemo(() => pathD(v.subpaths), [v]);
  const w = Math.max(1, v.widthMm), h = Math.max(1, v.heightMm), sw = Math.max(w, h) / 400;
  return (
    <svg viewBox={`${-sw * 2} ${-sw * 2} ${w + sw * 4} ${h + sw * 4}`} preserveAspectRatio="xMidYMid meet" aria-label="Vectorized preview">
      {v.lines
        ? <path d={d} fill="none" stroke="#1d4ed8" strokeWidth={sw * 1.5} />
        : <path d={d} fill="#1d4ed8" fillOpacity={0.18} fillRule="evenodd" stroke="#1d4ed8" strokeWidth={sw} />}
    </svg>
  );
}