"use client";

import { useState } from "react";
import { MATERIALS } from "@/lib/hinge/defaults";
import { loadMaterials, saveMaterials, saveMeasured } from "@/lib/materials/library";

const IDS = Object.keys(MATERIALS).filter((id) => id !== "custom");

/** Saves a measured kerf onto the material library on this device. Built-ins are copied, not edited. */
export function KerfForm() {
  const [id, setId] = useState("birch3");
  const [t, setT] = useState("3");
  const [k, setK] = useState("0.15");
  const [note, setNote] = useState("");
  return (
    <form className="tool-box" onSubmit={(e) => {
      e.preventDefault();
      const T = Number(t), K = Number(k);
      if (!Number.isFinite(T) || !Number.isFinite(K) || T <= 0 || K < 0) {
        setNote("Enter a thickness above 0 and a kerf of 0 or more.");
        return;
      }
      const saved = saveMeasured(loadMaterials(), id, T, K, { T, kx: K, ky: K });
      saveMaterials(saved.list);
      setNote(`Saved on this device as “${saved.list.find((m) => m.id === saved.id)?.name ?? "your material"}”. The editor uses it the next time you pick that material.`);
    }}>
      <div className="tool-fields">
        <label>Material
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {IDS.map((mid) => <option key={mid} value={mid}>{MATERIALS[mid].name}</option>)}
          </select>
        </label>
        <label>Measured thickness, mm <input value={t} onChange={(e) => setT(e.target.value)} inputMode="decimal" /></label>
        <label>Measured kerf, mm <input value={k} onChange={(e) => setK(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div className="tool-actions"><button type="submit" className="btn-primary">Save on this device</button></div>
      {note && <p className="tool-note" role="status">{note}</p>}
    </form>
  );
}
