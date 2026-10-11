"use client";

import { useEffect, useState } from "react";
import { circularArray, gridArray, pathArray, stepAndRepeat, transformEach, type CircularArray, type GridArray, type StepRepeat, type TransformEach } from "@/lib/studio/arrays";
import type { Document } from "@/lib/studio/types";
import { Dialog, NumberInput } from "@/components/ui";
import { Footer, useLivePreview } from "./PathDialogs";
import { useEditor, useEditorApi } from "./store";

type Props = { open: boolean; onClose: () => void };

/** Shared body: preview on every change, OK selects originals plus copies. */
function useArrayDialog<T>(open: boolean, onClose: () => void, label: string, run: (d: Document, ids: string[], o: T) => string[] | void, o: T) {
  const api = useEditorApi();
  const [show, setShow] = useState(true);
  const lp = useLivePreview(open, label);
  useEffect(() => { if (open) lp.preview(show, (d, ids) => { run(d, ids, o); }); });
  const ok = () => {
    const before = api.getState().selection;
    const out = lp.apply((d, ids) => run(d, ids, o));
    if (Array.isArray(out) && out.length) api.getState().select([...before, ...out]);
    onClose();
  };
  return { show, setShow, ok, count: lp.count };
}

export function StepRepeatDialog({ open, onClose }: Props) {
  const units = useEditor((s) => s.doc.units);
  const [o, setO] = useState<StepRepeat>({ copies: 4, dx: 15, dy: 0, rotate: 0, scale: 1 });
  const f = useArrayDialog(open, onClose, "Step and Repeat", stepAndRepeat, o);
  const set = (p: Partial<StepRepeat>) => setO((q) => ({ ...q, ...p }));
  return (
    <Dialog open={open} title="Step and Repeat" onClose={onClose} size="narrow" testId="step-repeat-dialog" footer={<Footer onCancel={onClose} onOk={f.ok} okLabel="Repeat" preview={f.show} setPreview={f.setShow} />}>
      <div className="form-grid">
        <NumberInput label="Copies" value={o.copies} integer min={1} max={500} defaultValue={4} onChange={(v) => set({ copies: v })} testId="sr-copies" />
        <span />
        <NumberInput label="Horizontal" value={o.dx} length units={units} defaultValue={15} onChange={(v) => set({ dx: v })} testId="sr-dx" />
        <NumberInput label="Vertical" value={o.dy} length units={units} defaultValue={0} onChange={(v) => set({ dy: v })} />
        <NumberInput label="Rotate" value={o.rotate} suffix="°" min={-360} max={360} defaultValue={0} onChange={(v) => set({ rotate: v })} />
        <NumberInput label="Scale" value={Math.round(o.scale * 1000) / 10} suffix="%" min={1} max={1000} defaultValue={100} onChange={(v) => set({ scale: v / 100 })} />
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>Each copy moves, turns and scales by the amounts above from the one before — like CorelDRAW&apos;s Step and Repeat.</p>
    </Dialog>
  );
}

export function GridArrayDialog({ open, onClose }: Props) {
  const units = useEditor((s) => s.doc.units);
  const [o, setO] = useState<GridArray>({ rows: 3, cols: 4, gapX: 5, gapY: 5 });
  const f = useArrayDialog(open, onClose, "Grid Array", gridArray, o);
  const set = (p: Partial<GridArray>) => setO((q) => ({ ...q, ...p }));
  return (
    <Dialog open={open} title="Grid Array" onClose={onClose} size="narrow" testId="grid-array-dialog" footer={<Footer onCancel={onClose} onOk={f.ok} okLabel="Make Grid" preview={f.show} setPreview={f.setShow} />}>
      <div className="form-grid">
        <NumberInput label="Columns" value={o.cols} integer min={1} max={100} defaultValue={4} onChange={(v) => set({ cols: v })} testId="ga-cols" />
        <NumberInput label="Rows" value={o.rows} integer min={1} max={100} defaultValue={3} onChange={(v) => set({ rows: v })} testId="ga-rows" />
        <NumberInput label="Gap X" value={o.gapX} length units={units} defaultValue={5} onChange={(v) => set({ gapX: v })} />
        <NumberInput label="Gap Y" value={o.gapY} length units={units} defaultValue={5} onChange={(v) => set({ gapY: v })} />
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>{o.rows * o.cols} items in all. Gaps are edge to edge, so the material between parts stays exactly this wide.</p>
    </Dialog>
  );
}

export function CircularArrayDialog({ open, onClose }: Props) {
  const units = useEditor((s) => s.doc.units);
  const [o, setO] = useState<CircularArray>({ count: 8, radius: 40, angle: 360, rotateCopies: true });
  const f = useArrayDialog(open, onClose, "Circular Array", circularArray, o);
  const set = (p: Partial<CircularArray>) => setO((q) => ({ ...q, ...p }));
  return (
    <Dialog open={open} title="Circular Array" onClose={onClose} size="narrow" testId="circular-array-dialog" footer={<Footer onCancel={onClose} onOk={f.ok} okLabel="Make Array" preview={f.show} setPreview={f.setShow} />}>
      <div className="form-grid">
        <NumberInput label="Count" value={o.count} integer min={2} max={500} defaultValue={8} onChange={(v) => set({ count: v })} testId="ca-count" />
        <NumberInput label="Radius" value={o.radius} length units={units} min={0} defaultValue={40} onChange={(v) => set({ radius: v })} testId="ca-radius" />
        <NumberInput label="Angle" value={o.angle} suffix="°" min={-360} max={360} defaultValue={360} onChange={(v) => set({ angle: v })} />
        <label className="pn-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={o.rotateCopies} onChange={(e) => set({ rotateCopies: e.target.checked })} /> Rotate copies</label>
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>The circle&apos;s centre is {o.radius} mm below the selection; 360° spreads the copies evenly all the way round.</p>
    </Dialog>
  );
}

export function PathArrayDialog({ open, onClose }: Props) {
  const [o, setO] = useState({ count: 10, rotate: true });
  const [error, setError] = useState<string | null>(null);
  const run = (d: Document, ids: string[], q: typeof o) => { const r = pathArray(d, ids, q); queueMicrotask(() => setError(r.error ?? null)); return r.ids; };
  const f = useArrayDialog(open, onClose, "Repeat Along Path", run, o);
  return (
    <Dialog open={open} title="Repeat Along Path" onClose={onClose} size="narrow" testId="path-array-dialog" footer={<Footer onCancel={onClose} onOk={f.ok} okLabel="Repeat" preview={f.show} setPreview={f.setShow} />}>
      <div className="form-grid">
        <NumberInput label="Count" value={o.count} integer min={1} max={500} defaultValue={10} onChange={(v) => setO((q) => ({ ...q, count: v }))} testId="pa-count" />
        <label className="pn-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={o.rotate} onChange={(e) => setO((q) => ({ ...q, rotate: e.target.checked }))} /> Turn to follow the path</label>
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>{error ?? "The top-most selected object is the path; the others are spaced evenly along it by length."}</p>
    </Dialog>
  );
}

export function TransformEachDialog({ open, onClose }: Props) {
  const units = useEditor((s) => s.doc.units);
  const [o, setO] = useState<TransformEach>({ scaleX: 1, scaleY: 1, dx: 0, dy: 0, rotate: 0, random: false, seed: 1 });
  const f = useArrayDialog(open, onClose, "Transform Each", (d, ids, q: TransformEach) => { transformEach(d, ids, q); }, o);
  const set = (p: Partial<TransformEach>) => setO((q) => ({ ...q, ...p }));
  return (
    <Dialog open={open} title="Transform Each" onClose={onClose} size="narrow" testId="transform-each-dialog" footer={<Footer onCancel={onClose} onOk={f.ok} preview={f.show} setPreview={f.setShow} />}>
      <div className="form-grid">
        <NumberInput label="Scale H" value={Math.round(o.scaleX * 1000) / 10} suffix="%" min={1} max={1000} defaultValue={100} onChange={(v) => set({ scaleX: v / 100 })} testId="te-sx" />
        <NumberInput label="Scale V" value={Math.round(o.scaleY * 1000) / 10} suffix="%" min={1} max={1000} defaultValue={100} onChange={(v) => set({ scaleY: v / 100 })} />
        <NumberInput label="Move H" value={o.dx} length units={units} defaultValue={0} onChange={(v) => set({ dx: v })} />
        <NumberInput label="Move V" value={o.dy} length units={units} defaultValue={0} onChange={(v) => set({ dy: v })} />
        <NumberInput label="Rotate" value={o.rotate} suffix="°" min={-360} max={360} defaultValue={0} onChange={(v) => set({ rotate: v })} />
        <span style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <label className="pn-check"><input type="checkbox" checked={o.random} onChange={(e) => set({ random: e.target.checked })} /> Random</label>
          {o.random && <button type="button" className="ui-btn small" onClick={() => set({ seed: o.seed + 1 })}>Shuffle</button>}
        </span>
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>Every object changes around its own centre ({f.count} selected). Random gives each one a different share of the amounts.</p>
    </Dialog>
  );
}
