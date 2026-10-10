"use client";

import { useEffect, useRef, useState } from "react";
import { polyD, r3 } from "@/lib/hinge";
import {
  LIBRARY, formatOf, finSpacingOf, mergeParametricParams,
  type LibraryId, type MeshData, type ParametricParams, type Shape, type SliceResult,
} from "@/lib/parametric";
import Viewport from "./Viewport3D";
import { Slicer } from "./slicerProtocol";

const shapeD = (s: Shape) => [s.outer, ...s.holes].map(c => polyD(c, 0, 0)).join(" ");

function SectionSvg({ shapes, title, wall = true }: { shapes: Shape[]; title: string; wall?: boolean }) {
  const xs = shapes.flatMap(s => [s.bbox.x0, s.bbox.x1]), ys = shapes.flatMap(s => [s.bbox.y0, s.bbox.y1]);
  const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 1), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 1);
  const m = 6;
  return (
    <section className="dbg-card">
      <h2>{title}</h2>
      <svg viewBox={`${r3(x0 - m)} ${r3(-y1 - m)} ${r3(x1 - x0 + 2 * m)} ${r3(y1 - y0 + 2 * m)}`} xmlns="http://www.w3.org/2000/svg">
        <g transform="scale(1,-1)">
          {wall && <line x1={x0 - m} x2={x1 + m} y1={0} y2={0} stroke="#4DA6FF" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
          {shapes.map((s, i) => <path key={i} d={shapeD(s)} fill="rgba(201,163,106,.35)" fillRule="evenodd" stroke="#C9A36A" vectorEffect="non-scaling-stroke" />)}
        </g>
      </svg>
    </section>
  );
}

/** Hidden page (not linked anywhere) for the Parametric slicing core. */
export default function ParametricDebug() {
  const [p, setP] = useState<ParametricParams>(() => mergeParametricParams({}));
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer; key: string } | null>(null);
  const [res, setRes] = useState<{ result: SliceResult; ms: number } | null>(null);
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState({ model: true, planes: true, parts: true });
  const [sel, setSel] = useState(0);
  const slicer = useRef<Slicer | null>(null);
  const meshKey = useRef("");

  useEffect(() => {
    slicer.current = new Slicer();
    return () => slicer.current?.dispose();
  }, []);

  useEffect(() => {
    const s = slicer.current;
    if (!s) return;
    const key = JSON.stringify([p.source, p.sourceSettings, file?.key ?? ""]);
    const wantMesh = key !== meshKey.current;
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      s.run({ params: p, file: p.source.kind === "mesh" ? file?.bytes.slice(0) : undefined, fileKey: file?.key, wantMesh })
        .then(r => {
          if (!live) return;
          if (r.mesh) { setMesh(r.mesh); meshKey.current = key; }
          setRes({ result: r.result, ms: r.ms });
          setErr(null);
        })
        .catch((e: Error) => live && setErr(e.message))
        .finally(() => live && setBusy(false));
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [p, file]);

  const set = (f: (q: ParametricParams) => void) => setP(q => { const n = structuredClone(q); f(n); return n; });
  const result = res?.result;
  const selIdx = result ? Math.min(sel, Math.max(0, result.sections.length - 1)) : 0;

  return (
    <div className="dbg">
      <div className="dbg-bar">
        <strong>Parametric debug</strong>
        <select
          aria-label="Source"
          value={p.source.kind === "library" ? p.source.id : "file"}
          onChange={e => set(q => {
            if (e.target.value === "file") { if (file) q.source = { kind: "mesh", fileName: file.name, units: "auto", upAxis: "Y" }; }
            else q.source = { kind: "library", id: e.target.value as LibraryId };
          })}
        >
          {LIBRARY.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          {file && <option value="file">{file.name}</option>}
        </select>
        <label>
          Import <input
            type="file"
            accept=".stl,.obj,.glb"
            aria-label="Import model"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!formatOf(f.name)) { setErr("Use an STL, OBJ or GLB file."); return; }
              const bytes = await f.arrayBuffer();
              setFile({ name: f.name, bytes, key: `${f.name}:${f.size}:${f.lastModified}` });
              set(q => { q.source = { kind: "mesh", fileName: f.name, units: "auto", upAxis: "Y" }; });
            }}
          />
        </label>
        {p.source.kind === "mesh" && (
          <select aria-label="Up axis" value={p.source.upAxis} onChange={e => set(q => { if (q.source.kind === "mesh") q.source.upAxis = e.target.value as "Y" | "Z"; })}>
            <option value="Y">Y up</option>
            <option value="Z">Z up</option>
          </select>
        )}
        <select aria-label="Axis" value={p.parallel.axis} onChange={e => set(q => { q.parallel.axis = e.target.value as "X" | "Y"; })}>
          <option value="X">Fins along X</option>
          <option value="Y">Fins along Y</option>
        </select>
        <label>Spacing <input type="number" aria-label="Spacing" min={p.material.T + 1} step={0.5} value={finSpacingOf(p)} onChange={e => set(q => { q.parallel.spacing = Number(e.target.value) || null; })} style={{ width: 70 }} /></label>
        <label>Phase <input type="range" min={0} max={1} step={0.05} value={p.parallel.phase} onChange={e => set(q => { q.parallel.phase = Number(e.target.value); })} /></label>
        <label>Smoothing <input type="range" min={0} max={1} step={0.05} value={p.quality.smoothing} onChange={e => set(q => { q.quality.smoothing = Number(e.target.value); })} /></label>
        <label>Scale <input type="number" aria-label="Scale" min={0.05} step={0.05} value={p.sourceSettings.transform.uniformScale} onChange={e => set(q => { q.sourceSettings.transform.uniformScale = Number(e.target.value) || 1; })} style={{ width: 60 }} /></label>
        {(["model", "planes", "parts"] as const).map(k => (
          <label key={k}><input type="checkbox" checked={show[k]} onChange={e => setShow(s => ({ ...s, [k]: e.target.checked }))} /> {k}</label>
        ))}
        <button type="button" onClick={() => { setP(mergeParametricParams({})); setFile(null); }}>Reset</button>
        <span className="dbg-status">{busy ? "Slicing…" : res ? `${result!.parts.length} parts · ${result!.planes.length} planes · ${result!.engine} · ${Math.round(res.ms)} ms` : ""}</span>
      </div>
      {err && <pre role="alert" style={{ color: "#EC5157" }}>{err}</pre>}
      <div className="pdbg">
        <Viewport mesh={mesh} result={result ?? null} T={p.material.T} show={show} />
        <div className="pdbg-side">
          {result && result.sections.length > 0 && (
            <>
              <label className="pdbg-pick">
                Plane {selIdx + 1} of {result.sections.length} ({result.planes[selIdx].offset.toFixed(1)} mm)
                <input type="range" min={0} max={result.sections.length - 1} value={selIdx} onChange={e => setSel(Number(e.target.value))} aria-label="Plane" />
              </label>
              <SectionSvg title={`Section ${selIdx + 1}`} shapes={result.sections[selIdx]} />
            </>
          )}
          <section className="dbg-card">
            <h2>Report</h2>
            <pre>
              {result ? [
                `bounds  ${result.bounds.min.map(v => v.toFixed(1)).join(", ")}  →  ${result.bounds.max.map(v => v.toFixed(1)).join(", ")}`,
                `spacing ${finSpacingOf(p)} mm · T ${p.material.T} mm`,
                `cut length ${(result.stats.cutLength / 1000).toFixed(2)} m · part area ${(result.stats.partArea / 1e4).toFixed(1)} dm²`,
                ...result.warnings.map(w => `${w.code}: ${w.message}${w.partIds?.length ? ` (${w.partIds.slice(0, 8).join(", ")}${w.partIds.length > 8 ? ", …" : ""})` : ""}`),
              ].join("\n") : "…"}
            </pre>
          </section>
        </div>
      </div>
      {result && (
        <div className="dbg-grid pdbg-fins">
          {result.parts.map(part => <SectionSvg key={part.id} title={part.id} shapes={[part.shape]} />)}
        </div>
      )}
    </div>
  );
}
