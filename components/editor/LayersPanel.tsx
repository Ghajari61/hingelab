"use client";

import { EXPORT_LAYERS, type ExportLayer, type LayerKey, type Layers } from "@/lib/hinge";

export function LayersPanel({
  layers, labels, only, onVis, onExp, onLabels,
}: {
  layers: Layers;
  labels: boolean;
  /** Layers this product uses (default: all). */
  only?: LayerKey[];
  onVis: (key: LayerKey) => void;
  onExp: (key: LayerKey, exp: boolean) => void;
  onLabels: (on: boolean) => void;
}) {
  const shown: ExportLayer[] = only ? EXPORT_LAYERS.filter((l) => only.includes(l.key)) : EXPORT_LAYERS;
  return (
    <>
      <div className="layers">
        {shown.map((l) => (
          <div className="layer" key={l.key}>
            <button className="eye" type="button" aria-pressed={layers[l.key].vis} aria-label={`Show ${l.name}`} onClick={() => onVis(l.key)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>
            </button>
            <span className="sw" style={{ background: l.ui }} />
            <span className="nm">{l.name}</span>
            <span className="code">C{l.code}</span>
            <input type="checkbox" checked={layers[l.key].exp} aria-label={`Include ${l.name} in export`} title="Include in export" onChange={(e) => onExp(l.key, e.target.checked)} />
          </div>
        ))}
        <label className="chk" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={labels} onChange={(e) => onLabels(e.target.checked)} /> Engrave part names
        </label>
      </div>
      <p className="note">Colors follow the LightBurn palette, so each layer can get its own speed and power.</p>
    </>
  );
}
