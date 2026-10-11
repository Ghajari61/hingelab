"use client";

import { useEffect, useRef, useState } from "react";
import { areaItems, editPaths, offsetNodes, roundCorners, simplifySubpath, type JoinKind } from "@/lib/studio/pathfinder";
import { isEditable, topLevel } from "@/lib/studio/scene";
import type { Document } from "@/lib/studio/types";
import { Dialog, NumberInput, SegmentedControl, Slider } from "@/components/ui";
import { useEditor, useEditorApi } from "./store";

type Recipe = (d: Document, ids: string[]) => void;

/**
 * A dialog that previews its result on the canvas while it is open. Cancel (or Esc) restores the
 * document; OK commits one undo step.
 */
export function useLivePreview(open: boolean, label: string) {
  const api = useEditorApi();
  const ids = useRef<string[]>([]);
  const live = useRef(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!open) return;
    const s = api.getState();
    ids.current = topLevel(s.doc.root, s.selection).filter((id) => isEditable(s.doc.root, id));
    setCount(ids.current.length);
    s.begin();
    live.current = true;
    return () => { if (live.current) { live.current = false; api.getState().end(label, null); } };
  }, [open, api, label]);
  return {
    count,
    preview: (on: boolean, recipe: Recipe) => {
      if (live.current) api.getState().preview(on ? (d) => { recipe(d, ids.current); } : () => {});
    },
    apply: <T,>(recipe: (d: Document, ids: string[]) => T): T | undefined => {
      if (!live.current) return undefined;
      live.current = false;
      let out: T | undefined;
      api.getState().end(label, (d) => { out = recipe(d, ids.current); });
      return out;
    },
    anchors: () => areaItems(api.getState().doc, ids.current).reduce((n, it) => n + it.subs.reduce((m, s) => m + s.nodes.length, 0), 0),
  };
}

export function Footer({ onCancel, onOk, okLabel = "OK", preview, setPreview }: { onCancel: () => void; onOk: () => void; okLabel?: string; preview: boolean; setPreview: (v: boolean) => void }) {
  return (
    <>
      <label className="pn-check"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} data-testid="dlg-preview" /> Preview</label>
      <span style={{ flex: 1 }} />
      <button type="button" className="ui-btn" onClick={onCancel}>Cancel</button>
      <button type="button" className="ui-btn primary" onClick={onOk} data-testid="dlg-ok">{okLabel}</button>
    </>
  );
}

// ---------- Offset Path… ----------

export function OffsetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useEditorApi();
  const units = useEditor((s) => s.doc.units);
  const [delta, setDelta] = useState(2);
  const [join, setJoin] = useState<JoinKind>("round");
  const [miter, setMiter] = useState(4);
  const [show, setShow] = useState(true);
  const lp = useLivePreview(open, "Offset Path");
  const run = (d: Document, ids: string[]) => offsetNodes(d, ids, delta, join, miter);
  useEffect(() => { if (open) lp.preview(show, run); }); // every render: values, preview toggle
  const ok = () => {
    const out = lp.apply(run);
    if (out?.length) api.getState().select(out);
    onClose();
  };
  return (
    <Dialog open={open} title="Offset Path" onClose={onClose} size="narrow" testId="offset-dialog"
      footer={<Footer onCancel={onClose} onOk={ok} preview={show} setPreview={setShow} />}>
      <div style={{ display: "grid", gap: 12 }}>
        <NumberInput label="Offset" value={delta} length units={units} min={-200} max={200} defaultValue={2} onChange={(v) => setDelta(v)} testId="offset-delta" />
        <SegmentedControl label="Joins" value={join} onChange={setJoin} full options={[{ value: "round", label: "Round" }, { value: "miter", label: "Miter" }, { value: "bevel", label: "Bevel" }]} />
        {join === "miter" && <NumberInput label="Miter limit" value={miter} min={1} max={20} defaultValue={4} onChange={(v) => setMiter(v)} />}
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>
        Positive grows each outline, negative shrinks it; open lines become an outline on both sides. The originals stay — for kerf
        compensation offset by half the beam width.
      </p>
    </Dialog>
  );
}

// ---------- Simplify… ----------

export function SimplifyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [precision, setPrecision] = useState(70);
  const [straight, setStraight] = useState(false);
  const [show, setShow] = useState(true);
  const [stats, setStats] = useState<{ before: number; after: number } | null>(null);
  const lp = useLivePreview(open, "Simplify");
  // 100% keeps every detail (0.01 mm), 0% allows 2 mm of drift.
  const tol = 0.01 + ((100 - precision) / 100) ** 2 * 2;
  const run = (d: Document, ids: string[]) => { editPaths(d, ids, (s) => simplifySubpath(s, tol, straight)); };
  const before = useRef(0);
  useEffect(() => {
    if (!open) { setStats(null); return; }
    lp.preview(false, run);
    before.current = lp.anchors();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    lp.preview(show, run);
    setStats({ before: before.current, after: lp.anchors() });
  }, [open, precision, straight, show]); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = () => { lp.apply(run); onClose(); };
  return (
    <Dialog open={open} title="Simplify" onClose={onClose} size="narrow" testId="simplify-dialog"
      footer={<Footer onCancel={onClose} onOk={ok} preview={show} setPreview={setShow} />}>
      <div style={{ display: "grid", gap: 12 }}>
        <Slider label="Precision" min={0} max={100} value={precision} onChange={setPrecision} format={(v) => `${v}%`} />
        <label className="pn-check"><input type="checkbox" checked={straight} onChange={(e) => setStraight(e.target.checked)} /> Straight lines only</label>
        {stats && <p className="dlg-note" data-testid="simplify-stats">Anchor points: {stats.before} → {stats.after} (within {tol.toFixed(2)} mm)</p>}
      </div>
    </Dialog>
  );
}

// ---------- Round Corners… ----------

export function CornersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const units = useEditor((s) => s.doc.units);
  const [radius, setRadius] = useState(3);
  const [kind, setKind] = useState<"round" | "chamfer">("round");
  const [show, setShow] = useState(true);
  const lp = useLivePreview(open, "Round Corners");
  const run = (d: Document, ids: string[]) => { editPaths(d, ids, (s) => roundCorners(s, radius, kind)); };
  useEffect(() => { if (open) lp.preview(show, run); });
  const ok = () => { lp.apply(run); onClose(); };
  return (
    <Dialog open={open} title="Round Corners" onClose={onClose} size="narrow" testId="corners-dialog"
      footer={<Footer onCancel={onClose} onOk={ok} preview={show} setPreview={setShow} />}>
      <div style={{ display: "grid", gap: 12 }}>
        <SegmentedControl label="Corner" value={kind} onChange={setKind} full options={[{ value: "round", label: "Fillet" }, { value: "chamfer", label: "Chamfer" }]} />
        <NumberInput label={kind === "round" ? "Radius" : "Size"} value={radius} length units={units} min={0} max={500} defaultValue={3} onChange={(v) => setRadius(v)} testId="corners-radius" />
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>Sharp corners between straight edges are rounded; curves are left alone. Each corner is limited to half of its edges.</p>
    </Dialog>
  );
}
