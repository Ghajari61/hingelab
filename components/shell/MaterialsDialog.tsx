"use client";

import { platform } from "@hingelab/platform";
import { useEffect, useRef, useState } from "react";
import { MATERIALS } from "@/lib/hinge/defaults";
import {
  cleanMaterial, fromBuiltIn, importMaterials, LASER_OPS, loadMaterials, materialInfo, materialsFile, MATERIALS_EVENT, newMaterialId, RANGES, saveMaterials,
  type Grain, type LaserOp, type MaterialInfo, type RotatePolicy, type UserMaterial,
} from "@/lib/materials/library";
import { NumberField } from "@/components/editor/NumberField";
import type { BaseField } from "@/components/editor/fields";
import type { Units } from "@/components/editor/format";
import type { DesignMaterial } from "./MaterialPicker";
import { CouponResults } from "./CouponResults";
import "./materials.css";

type LaserText = Record<LaserOp, { speed: string; power: string; passes: string }>;
const OP_NAME: Record<LaserOp, string> = { cut: "Cut", score: "Score", engrave: "Engrave" };

const FIELDS: (BaseField & { id: "T" | "kx" | "ky" | "minFeature" })[] = [
  { id: "T", label: "Thick", len: true, step: 0.1, min: RANGES.T[0], max: RANGES.T[1], help: "The sheet's measured thickness." },
  { id: "kx", label: "Kerf X", len: true, step: 0.01, min: RANGES.kerf[0], max: RANGES.kerf[1], help: "Kerf across cuts that run up and down the sheet." },
  { id: "ky", label: "Kerf Y", len: true, step: 0.01, min: RANGES.kerf[0], max: RANGES.kerf[1], help: "Kerf across cuts that run left to right. The same as Kerf X on most machines." },
  { id: "minFeature", label: "Min feature", len: true, step: 0.1, min: RANGES.minFeature[0], max: RANGES.minFeature[1], help: "The narrowest bar or tab this sheet holds; 0 leaves it unchecked." },
];

const SPACING_FIELD: BaseField = { id: "mat-spacing", label: "Spacing", len: true, step: 0.5, min: RANGES.spacing[0], max: RANGES.spacing[1], help: "Space between parts on the sheet when this material is used." };
const GRAIN: Record<Grain, string> = { none: "No grain (MDF, acrylic, card)", x: "Along the sheet's width", y: "Along the sheet's height" };
const TURNS: Record<RotatePolicy, string> = { any: "Any turn", half: "Half turns only (keeps the grain)", none: "No turns" };

/** What the user has measured, or that the values are still an estimate. */
export function calibrationLine(m: Pick<UserMaterial, "calibration">, fmt: (v: number) => string): string {
  const c = m.calibration;
  if (!c) return "Not tested on your machine: these values are an estimate. Cut the calibration coupons to measure them.";
  const got = [c.kx != null && `kerf ${fmt(c.kx)}${c.ky != null && c.ky !== c.kx ? ` / ${fmt(c.ky)}` : ""}`, c.clearance != null && `fit clearance ${fmt(c.clearance)}`, c.hingeRadius != null && `hinge bends to ${fmt(c.hingeRadius)} radius`].filter(Boolean);
  return `Tested on your machine ${c.date.slice(0, 10)}${got.length ? `: ${got.join(", ")}` : ""}.`;
}

const laserText = (m: UserMaterial): LaserText => Object.fromEntries(LASER_OPS.map((op) => {
  const s = m.laser[op];
  return [op, { speed: s ? String(s.speed) : "", power: s ? String(s.power) : "", passes: s ? String(s.passes) : "" }];
})) as LaserText;

function download(name: string, text: string) {
  void platform().saveFile({ name, data: text, mime: "application/json" });
}

/**
 * The user's own materials: measured thickness, kerf X and Y, the narrowest feature, what it bends
 * like and their own laser settings for LightBurn. Kept on this device; moved as a JSON file.
 */
export default function MaterialsDialog({ selected, current, units, onUse, onClose }: {
  /** The design's material. Saving it updates the design too. */
  selected: string;
  current: DesignMaterial;
  units: Units;
  onUse: (id: string, info: MaterialInfo | null) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<UserMaterial[]>(() => loadMaterials());
  const [draft, setDraft] = useState<UserMaterial | null>(() => list.find((m) => m.id === selected) ?? null);
  const [laser, setLaser] = useState<LaserText | null>(() => (draft ? laserText(draft) : null));
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [sure, setSure] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    const read = () => setList(loadMaterials());
    document.addEventListener("keydown", key);
    window.addEventListener(MATERIALS_EVENT, read);
    return () => { document.removeEventListener("keydown", key); window.removeEventListener(MATERIALS_EVENT, read); };
  }, []);

  function edit(m: UserMaterial | null) {
    setDraft(m);
    setLaser(m ? laserText(m) : null);
    setSure(false);
    setMsg(null);
  }

  function store(next: UserMaterial[]) {
    saveMaterials(next);
    setList(loadMaterials());
  }

  function save(use: boolean) {
    if (!draft || !laser) return;
    const out: UserMaterial["laser"] = {};
    for (const op of LASER_OPS) {
      const t = laser[op];
      if (!t.speed.trim() && !t.power.trim() && !t.passes.trim()) continue;
      const speed = Number(t.speed), power = Number(t.power), passes = t.passes.trim() ? Number(t.passes) : 1;
      const ok = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;
      if (!t.speed.trim() || !t.power.trim() || !ok(speed, RANGES.speed) || !ok(power, RANGES.power) || !ok(passes, RANGES.passes)) {
        setMsg({ text: `${OP_NAME[op]}: enter a speed (${RANGES.speed[0]}–${RANGES.speed[1]} mm/s), a power (0–100 %) and passes (1–${RANGES.passes[1]}), or leave all three empty.`, bad: true });
        return;
      }
      out[op] = { speed, power, passes: Math.round(passes) };
    }
    const m = cleanMaterial({ ...draft, laser: out });
    if (!m) { setMsg({ text: "Give the material a name.", bad: true }); return; }
    const i = list.findIndex((x) => x.id === m.id);
    const next = i >= 0 ? list.map((x, j) => (j === i ? m : x)) : [...list, m];
    store(next);
    edit(m);
    if (use || m.id === selected) onUse(m.id, materialInfo(m.id, next));
    setMsg({ text: use ? `Saved and used “${m.name}” in this design.` : `Saved “${m.name}”.` });
  }

  function remove() {
    if (!draft) return;
    if (!sure) { setSure(true); return; }
    store(list.filter((m) => m.id !== draft.id));
    setMsg({ text: `Deleted “${draft.name}”.` });
    edit(null);
  }

  function readFile(f: File) {
    const rd = new FileReader();
    rd.onload = () => {
      const r = importMaterials(String(rd.result), list);
      if ("error" in r) { setMsg({ text: r.error, bad: true }); return; }
      store(r.list);
      setMsg({ text: `Imported: ${r.added} added, ${r.replaced} updated${r.skipped ? `, ${r.skipped} skipped (missing a name, thickness or kerf, or the list is full)` : ""}.` });
    };
    rd.readAsText(f);
  }

  const setNum = (id: (typeof FIELDS)[number]["id"], v: number) => setDraft((d) => (d ? { ...d, [id]: v } : d));
  const builtIns = Object.entries(MATERIALS).filter(([k]) => k !== "custom");
  const fmt = (v: number) => (units === "in" ? `${(v / 25.4).toFixed(3)} in` : `${Math.round(v * 1000) / 1000} mm`);

  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal mats" role="dialog" aria-modal="true" aria-label="My materials">
        <header>My materials<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          <div className="mats-grid">
            <div className="mats-side">
              <ul className="mats-list" aria-label="Your materials">
                {list.map((m) => (
                  <li key={m.id}>
                    <button type="button" aria-pressed={draft?.id === m.id} onClick={() => edit(m)}>
                      <span>{m.name}</span>
                      <small>{fmt(m.T)} · kerf {m.kx === m.ky ? fmt(m.kx) : `${fmt(m.kx)} / ${fmt(m.ky)}`}</small>
                    </button>
                  </li>
                ))}
                {!list.length && <li className="mats-empty">No materials yet. Start one from this design or from a built-in material.</li>}
              </ul>
              <button type="button" className="btn-auto" onClick={() => edit({ id: newMaterialId(), name: "My material", T: current.T, kx: current.kx, ky: current.ky, minFeature: current.minFeature, like: "custom", laser: {} })}>New from this design</button>
              <select className="sel" aria-label="Copy a built-in material" value="" onChange={(e) => e.target.value && edit(fromBuiltIn(e.target.value))}>
                <option value="">Copy a built-in material…</option>
                {builtIns.map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
              </select>
              <div className="mats-io">
                <button type="button" className="btn-ghost-sm" onClick={() => { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } }}>Import…</button>
                <button type="button" className="btn-ghost-sm" disabled={!list.length} onClick={() => download("hingelab-materials.json", materialsFile(list))}>Export all</button>
              </div>
            </div>
            {draft && laser ? (
              <div className="mats-edit">
                <label className="mats-name">Name
                  <input className="textin" type="text" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <div className="grid2">
                  {FIELDS.map((f) => (
                    <NumberField
                      key={f.id} field={{ ...f, id: `mat-${f.id}` }} value={draft[f.id]} units={units} label={f.label} hidden={false} slider={false}
                      onLive={(v) => setNum(f.id, v)} onCommit={(v) => setNum(f.id, v)}
                    />
                  ))}
                </div>
                <div className="grid2">
                  <label className="mats-name">Grain
                    <select className="sel" value={draft.grain ?? "none"} onChange={(e) => { const grain = e.target.value as Grain; setDraft({ ...draft, grain, rotate: grain === "none" ? "any" : "half" }); }}>
                      {(Object.keys(GRAIN) as Grain[]).map((g) => <option key={g} value={g}>{GRAIN[g]}</option>)}
                    </select>
                  </label>
                  <label className="mats-name">Nesting may turn parts
                    <select className="sel" value={draft.rotate ?? (draft.grain && draft.grain !== "none" ? "half" : "any")} onChange={(e) => setDraft({ ...draft, rotate: e.target.value as RotatePolicy })}>
                      {(Object.keys(TURNS) as RotatePolicy[]).map((r) => <option key={r} value={r}>{TURNS[r]}</option>)}
                    </select>
                  </label>
                </div>
                <label className="chk">
                  <input type="checkbox" checked={draft.spacing != null} onChange={(e) => { const { spacing: _drop, ...rest } = draft; setDraft(e.target.checked ? { ...rest, spacing: 3 } : rest); }} />
                  Own part spacing (otherwise each design&apos;s)
                </label>
                {draft.spacing != null && (
                  <NumberField
                    field={SPACING_FIELD} value={draft.spacing} units={units} label={SPACING_FIELD.label} hidden={false} slider={false}
                    onLive={(v) => setDraft((d) => (d ? { ...d, spacing: v } : d))} onCommit={(v) => setDraft((d) => (d ? { ...d, spacing: v } : d))}
                  />
                )}
                <p className="note" role="status">{calibrationLine(draft, fmt)}</p>
                <CouponResults key={draft.id} draft={draft} onRecord={(m, note) => { setDraft(m); setMsg(note); }} />
                <label className="mats-name">Bends like (Hinge Box stiffness)
                  <select className="sel" value={draft.like} onChange={(e) => setDraft({ ...draft, like: e.target.value })}>
                    <option value="custom">Not set (a generic sheet)</option>
                    {builtIns.map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
                  </select>
                </label>
                <div className="rowlabel">Your laser settings (LightBurn file)</div>
                <table className="mats-laser">
                  <thead><tr><th scope="col">Layer</th><th scope="col">Speed mm/s</th><th scope="col">Power %</th><th scope="col">Passes</th></tr></thead>
                  <tbody>
                    {LASER_OPS.map((op) => (
                      <tr key={op}>
                        <th scope="row">{OP_NAME[op]}</th>
                        {(["speed", "power", "passes"] as const).map((k) => (
                          <td key={k}>
                            <input
                              className="textin" type="text" inputMode="decimal" aria-label={`${OP_NAME[op]} ${k}`} value={laser[op][k]}
                              onChange={(e) => setLaser({ ...laser, [op]: { ...laser[op], [k]: e.target.value } })}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="note">Leave a row empty to keep LightBurn&apos;s own setting. Use only values you have tested on your machine: HingeLab never suggests power or speed.</p>
                <div className="rename-row">
                  {list.some((m) => m.id === draft.id) && <button type="button" className="btn-ghost-sm" onClick={remove}>{sure ? "Delete for good?" : "Delete"}</button>}
                  <button type="button" className="btn-ghost-sm" onClick={() => save(false)}>Save</button>
                  <button type="button" className="btn-export" onClick={() => save(true)}>Save and use</button>
                </div>
              </div>
            ) : (
              <div className="mats-edit mats-empty">Pick a material to edit, or start a new one. Measure thickness with calipers and kerf from a cut 20 mm square, then save them here.</div>
            )}
          </div>
          {msg && <p className={`note${msg.bad ? " err" : ""}`} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
          <p className="note">Your materials stay on this device. Export them to move them to another computer or browser.</p>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
      </div>
    </div>
  );
}
