"use client";

import { useMemo, useState } from "react";
import { EYE_BALL_NAMES, EYE_FRAME_NAMES, EYE_SAFE, resolveEyes, type EyeBall, type EyeFrame } from "@/lib/generators/qr/eyes";
import type { Ecc, ModuleStyle } from "@/lib/generators/qr/params";
import { pathD } from "@/lib/studio/geom";
import { placeQr, qrOutlines, QR_INSERT_DEFAULTS, type QrInsert } from "@/lib/studio/qrCode";
import { Dialog, NumberInput, Select } from "@/components/ui";
import { useEditor, useEditorApi } from "./store";

const STYLES: { value: ModuleStyle; label: string }[] = [
  { value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "dots", label: "Dots" }, { value: "connected", label: "Connected" },
  { value: "diamond", label: "Diamonds" }, { value: "tiny", label: "Small squares" }, { value: "vlines", label: "Vertical bars" }, { value: "hlines", label: "Horizontal bars" },
];
const ECC: { value: Ecc; label: string }[] = [
  { value: "L", label: "L (recovers 7 %)" }, { value: "M", label: "M (15 %)" }, { value: "Q", label: "Q (25 %)" }, { value: "H", label: "H (30 %)" },
];

/** Insert QR Code: a scannable code placed in the middle of the view on an engrave (fill) layer. */
export function QrCodeDialog({ open, onClose, center }: { open: boolean; onClose: () => void; center: () => { x: number; y: number } }) {
  const api = useEditorApi();
  const units = useEditor((s) => s.doc.units);
  const [o, setO] = useState<QrInsert>(QR_INSERT_DEFAULTS);
  const set = <K extends keyof QrInsert>(k: K, v: QrInsert[K]) => setO((q) => ({ ...q, [k]: v }));
  const q = useMemo(() => (open ? qrOutlines(o) : null), [open, o]);
  const eyes = resolveEyes(o.style, o.eyeFrame, o.eyeBall);
  const risky = (o.eyeFrame !== "auto" || o.eyeBall !== "auto") && !EYE_SAFE[eyes.frame].includes(eyes.ball);
  const small = q && q.module < 0.6;
  const ok = () => {
    const s = api.getState();
    let id: string | null = null;
    s.edit("Insert QR Code", (d) => { id = placeQr(d, o, s.currentLayer, center()); });
    if (id) s.select([id]);
    onClose();
  };
  const half = o.size / 2 + 4 * (q?.module ?? 1);
  return (
    <Dialog open={open} title="Insert QR Code" onClose={onClose} testId="qr-dialog"
      footer={<>
        <span style={{ flex: 1 }} />
        <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ui-btn primary" onClick={ok} disabled={!q} data-testid="dlg-ok">Insert</button>
      </>}>
      <label className="ui-label" htmlFor="qr-text">Content (a web address, text, or a WIFI:… / BEGIN:VCARD… string)</label>
      <textarea id="qr-text" className="ui-text" rows={3} spellCheck={false} value={o.text} onChange={(e) => set("text", e.target.value)} data-testid="qr-text" style={{ width: "100%" }} />
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 8 }}>
        <svg viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`} width={150} height={150} style={{ background: "#fff", borderRadius: 6, flex: "none" }} aria-label="QR code preview" data-testid="qr-preview">
          {q && <path d={pathD(q.subpaths)} fill="#111" fillRule="evenodd" />}
        </svg>
        <div className="form-grid" style={{ flex: 1 }}>
          <NumberInput label="Size" value={o.size} length units={units} min={5} max={1000} defaultValue={40} onChange={(v) => set("size", v)} testId="qr-size" />
          <Select label="Error correction" value={o.ecc} options={ECC} onChange={(v) => set("ecc", v as Ecc)} />
          <Select label="Modules" value={o.style} options={STYLES} onChange={(v) => set("style", v as ModuleStyle)} testId="qr-style" />
          <Select label="Eye frame" value={o.eyeFrame} options={(Object.keys(EYE_FRAME_NAMES) as EyeFrame[]).map((v) => ({ value: v, label: EYE_FRAME_NAMES[v] }))} onChange={(v) => set("eyeFrame", v as EyeFrame)} />
          <Select label="Eye centre" value={o.eyeBall} options={(Object.keys(EYE_BALL_NAMES) as EyeBall[]).map((v) => ({ value: v, label: EYE_BALL_NAMES[v] }))} onChange={(v) => set("eyeBall", v as EyeBall)} />
          <label className="pn-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={o.invert} onChange={(e) => set("invert", e.target.checked)} /> Invert (for materials that engrave light)</label>
        </div>
      </div>
      <p className="dlg-note" role="status">
        {!o.text.trim() ? "Type what the code should hold." : !q ? "Too much content for one QR code: shorten it or lower the error correction."
          : `${q.n} × ${q.n} modules of ${q.module.toFixed(2)} mm. It goes on an engrave (fill) layer; keep ${(4 * q.module).toFixed(1)} mm clear round it.`}
        {small ? " Modules under 0.6 mm may not scan once engraved: make it bigger." : ""}
        {risky ? " This eye centre in this frame does not scan on every phone; a rounded centre is safe in every frame." : ""}
      </p>
    </Dialog>
  );
}
