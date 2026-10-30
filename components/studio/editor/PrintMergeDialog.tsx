"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mergeFields, parseMergeData, printMerge } from "@/lib/studio/printMerge";
import { Dialog, NumberInput } from "@/components/ui";
import { Footer, useLivePreview } from "./PathDialogs";
import { useEditor, useEditorApi } from "./store";

const SAMPLE = "Name\tYear\nOlivia\t2026\nNoah\t2026\nAva\t2027";

/**
 * Print Merge: the fields in the selected artwork's text ([Name], [Year]…) filled from a table,
 * one copy per record in a grid under the original.
 */
export function PrintMergeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useEditorApi();
  const units = useEditor((s) => s.doc.units);
  const [raw, setRaw] = useState("");
  const [o, setO] = useState({ columns: 4, gapX: 4, gapY: 4 });
  const [show, setShow] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const lp = useLivePreview(open, "Print Merge");
  // the fields the artwork uses, read once when the dialog opens (the preview changes the document)
  const [used, setUsed] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    const s = api.getState(), f = mergeFields(s.doc, s.selection);
    setUsed(f);
    // start from them, so the table only needs filling in
    setRaw((r) => r || (f.length ? `${f.join("\t")}\n` : SAMPLE));
  }, [open, api]);
  const data = useMemo(() => parseMergeData(raw), [raw]);
  const missing = used.filter((f) => !data.fields.some((g) => g.toLowerCase() === f.toLowerCase()));
  useEffect(() => { if (open) lp.preview(show, (d, ids) => { printMerge(d, ids, data, o); }); });
  const ok = () => {
    const out = lp.apply((d, ids) => printMerge(d, ids, data, o));
    if (out?.length) api.getState().select(out);
    onClose();
  };
  const load = async (f: File | undefined) => { if (f) setRaw(await f.text()); };
  return (
    <Dialog open={open} title="Print Merge" onClose={onClose} testId="print-merge-dialog"
      footer={<Footer onCancel={onClose} onOk={ok} okLabel={`Merge ${data.records.length} cop${data.records.length === 1 ? "y" : "ies"}`} preview={show} setPreview={setShow} />}>
      <p className="dlg-note">
        Type field names in square brackets in the artwork&apos;s text, such as <b>[Name]</b>. Each row below makes one copy with its own values, laid out under the original.
      </p>
      <p className="dlg-note">{used.length ? <>Fields in the selection: {used.map((f) => <b key={f}>[{f}] </b>)}</> : <>No fields in the selected text yet: add one, such as [Name].</>}</p>
      <label className="ui-label" htmlFor="pm-data">Records (the first row names the fields; paste from a spreadsheet, or CSV)</label>
      <textarea id="pm-data" className="ui-text" rows={8} spellCheck={false} value={raw} onChange={(e) => setRaw(e.target.value)} data-testid="pm-data" style={{ width: "100%", fontFamily: "var(--font-num)" }} />
      <div className="pn-btns" style={{ margin: "6px 0 10px" }}>
        <button type="button" className="ui-btn small" onClick={() => file.current?.click()}>Load CSV or text file…</button>
        <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => void load(e.target.files?.[0])} />
        <span className="dlg-note">{data.records.length} record{data.records.length === 1 ? "" : "s"}{data.fields.length ? ` · fields ${data.fields.join(", ")}` : ""}</span>
      </div>
      {missing.length > 0 && <p className="dlg-note" role="status">No column for {missing.map((f) => `[${f}]`).join(", ")}: those stay as they are.</p>}
      <div className="form-grid">
        <NumberInput label="Columns" value={o.columns} integer min={1} max={50} defaultValue={4} onChange={(v) => setO((q) => ({ ...q, columns: v }))} testId="pm-cols" />
        <span />
        <NumberInput label="Gap X" value={o.gapX} length units={units} min={0} defaultValue={4} onChange={(v) => setO((q) => ({ ...q, gapX: v }))} />
        <NumberInput label="Gap Y" value={o.gapY} length units={units} min={0} defaultValue={4} onChange={(v) => setO((q) => ({ ...q, gapY: v }))} />
      </div>
      {data.records.length > 500 && <p className="dlg-note">Only the first 500 records are merged.</p>}
    </Dialog>
  );
}
