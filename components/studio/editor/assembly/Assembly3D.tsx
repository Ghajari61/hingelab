"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AlertTriangle, ArrowLeft, Check, Eye, EyeOff, Info, RotateCcw, Wrench } from "lucide-react";
import { assemble, type Assembly, type AsmPart, type Issue, type M34 } from "@/lib/studio/assembly";
import { applyFix, applyIssues, safeIssues } from "@/lib/studio/assembly/fixes";
import { MATERIAL_PRESETS } from "@/lib/studio/library";
import type { Document, PartAdjust } from "@/lib/studio/types";
import { finishScene, slab } from "@/lib/three/flat";
import { lookOf } from "@/lib/three/looks";
import QuadView, { type QuadModel } from "@/lib/three/QuadView";
import { quadProps, useView3D } from "@/components/shell/view3d";
import { View3DTools } from "@/components/shell/View3DTools";
import { useEditor, useEditorApi } from "../store";

const ROLE_NAMES: Record<AsmPart["role"], string> = {
  bottom: "Bottom", wall: "Wall", top: "Top", lid: "Lid", lip: "Lid lip", inserted: "In slots", divider: "Divider", loose: "Loose",
};

const m4 = (m: M34) => new THREE.Matrix4().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);

interface Built extends QuadModel { names: Map<string, string> }

/** The parts as slabs where the assembly puts them (or where they lie on the sheet), engraving drawn on top. */
function buildScene(asm: Assembly, flat: boolean): Built {
  const inner = new THREE.Group();
  const names = new Map<string, string>();
  const used = new Set<string>();
  const meshes: { mesh: THREE.Mesh; base: THREE.Matrix4; dir: THREE.Vector3 }[] = [];
  const mid = new THREE.Vector3((asm.lo[0] + asm.hi[0]) / 2, (asm.lo[1] + asm.hi[1]) / 2, (asm.lo[2] + asm.hi[2]) / 2);
  for (const p of asm.parts) {
    if (p.hidden || p.outer.length < 3) continue;
    let name = p.name;
    for (let k = 2; used.has(name); k++) name = `${p.name} (${k})`;
    used.add(name);
    names.set(name, p.key);
    const mesh = slab(p.outer, p.holes, 0, p.t, name);
    if (p.engrave.length) {
      const pts: number[] = [];
      for (const r of p.engrave) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        pts.push(a[0], -a[1], p.t + 0.05, b[0], -b[1], p.t + 0.05);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a2412, transparent: true, opacity: 0.85 }));
      lines.userData.keepMaterial = true;
      lines.raycast = () => {};
      mesh.add(lines);
    }
    const base = m4(flat ? p.flat : p.m);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(base);
    const c = new THREE.Vector3(p.w / 2, -p.h / 2, p.t / 2).applyMatrix4(base);
    meshes.push({ mesh, base, dir: c.sub(mid) });
    inner.add(mesh);
  }
  const sc = finishScene(inner);
  return {
    group: sc.group,
    dispose: sc.dispose,
    names,
    explode: flat ? undefined : (e: number) => {
      for (const { mesh, base, dir } of meshes) {
        mesh.matrix.copy(new THREE.Matrix4().makeTranslation(dir.x * e, dir.y * e, dir.z * e).multiply(base));
        mesh.matrixWorldNeedsUpdate = true;
      }
    },
  };
}

function Num({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const commit = () => { const v = parseFloat(text); if (Number.isFinite(v) && v !== value) onCommit(v); else setText(String(value)); };
  return (
    <label className="asm-num">
      <span>{label}</span>
      <input
        type="number" step={1} value={text} aria-label={`Move ${label}, mm`}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
    </label>
  );
}

const LEVEL_ICON = { fix: Wrench, warn: AlertTriangle, info: Info } as const;

/**
 * The Studio drawing put together in 3D (lib/studio/assembly): the safe fixes are applied when it
 * opens, the checks list what is left with their fixes, and each part can be moved, turned, laid
 * flat or hidden. Everything it changes is an ordinary edit of the document (one undo step each).
 */
export function Assembly3D({ onBack, onShow, toast }: {
  onBack: () => void;
  /** Back to the drawing with these objects selected. */
  onShow: (ids: string[]) => void;
  toast: (message: string, undo?: boolean) => void;
}) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const v = useView3D();
  const [sel, setSel] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const d = api.getState().doc;
    if (d.assembly?.autoFix === false) return;
    const fixes = safeIssues(assemble(d));
    if (!fixes.length) return;
    api.getState().edit("Fix for 3D", (draft) => applyIssues(draft, fixes));
    toast(`Fixed for 3D: ${fixes.map((f) => f.fixLabel ?? f.title).join(", ")}`, true);
  }, [api, toast]);

  const asm = useMemo(() => assemble(doc), [doc]);
  const scene = useMemo(() => buildScene(asm, v.flat), [asm, v.flat]);
  const keyName = useMemo(() => new Map([...scene.names].map(([n, k]) => [k, n])), [scene]);
  const frameKey = `${v.flat}|${asm.parts.map((p) => p.key).join(",")}`;
  const material = doc.sheets[0]?.materialId ?? "";
  const part = asm.parts.find((p) => p.key === sel) ?? null;
  const adj: PartAdjust = (sel && doc.assembly?.parts?.[sel]) || {};

  const edit = (label: string, recipe: (d: Document) => void, mergeKey?: string) => api.getState().edit(label, recipe, mergeKey ? { mergeKey } : undefined);
  const setAdj = (key: string, patch: Partial<PartAdjust>, label: string, mergeKey?: string) => edit(label, (d) => {
    const a = (d.assembly ??= {});
    const parts = (a.parts ??= {});
    const next: PartAdjust = { ...parts[key], ...patch };
    for (const k of Object.keys(next) as (keyof PartAdjust)[]) {
      const val = next[k];
      if (val === undefined || val === false || (Array.isArray(val) && val.every((x) => !x))) delete next[k];
    }
    if (Object.keys(next).length) parts[key] = next; else delete parts[key];
  }, mergeKey);
  const fix = (i: Issue, f = i.fix, label = i.fixLabel) => {
    if (!f) return;
    edit(label ?? "Fix", (d) => applyFix(d, f));
    toast(label ?? "Fixed", true);
  };
  const fixable = asm.issues.filter((i) => i.fix);
  const move = adj.move ?? [0, 0, 0];
  const turn = adj.turn ?? [0, 0, 0];

  return (
    <div className="asm" data-testid="assembly-3d">
      <div className="asm-stage">
        <div className="view-bar asm-bar">
          <button type="button" className="asm-back" onClick={onBack} data-testid="assembly-back" title="Back to the drawing (Ctrl+Shift+3)">
            <ArrowLeft size={14} aria-hidden /> Back to Studio
          </button>
          <View3DTools v={v} flat />
        </div>
        <QuadView
          {...quadProps(v)} model={scene} look={lookOf(material)} frameKey={frameKey} explode={v.explode}
          units={doc.units === "in" ? "in" : "mm"} measure={v.flat || v.explode === 0} testId="assembly-view"
          label="The drawing put together in 3D: Top, Front, Left and Perspective views"
          onSelect={(n) => setSel(n ? scene.names.get(n) ?? null : null)} selectName={sel ? keyName.get(sel) ?? null : null}
        />
      </div>
      <aside className="asm-side" aria-label="3D assembly">
        <section>
          <h2 className="asm-h">3D Assembly</h2>
          <p className="asm-summary" data-testid="assembly-summary">{asm.summary}</p>
          <label className="asm-row">
            <span>Material</span>
            <select
              className="ui-select" value={material} aria-label="Material"
              onChange={(e) => { const id = e.target.value; edit("Material", (d) => { for (const s of d.sheets) s.materialId = id; }); }}
            >
              {MATERIAL_PRESETS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.thickness} mm</option>)}
            </select>
          </label>
        </section>

        <section>
          <header className="asm-sh">
            <h3>Checks</h3>
            {fixable.length > 1 && (
              <button type="button" className="ui-btn small" data-testid="assembly-fix-all"
                onClick={() => { edit("Fix all for 3D", (d) => applyIssues(d, fixable)); toast(`Fixed ${fixable.length} things for 3D`, true); }}>Fix all</button>
            )}
          </header>
          {asm.issues.length === 0 && <p className="asm-ok"><Check size={14} aria-hidden /> Everything fits.</p>}
          <ul className="asm-issues" data-testid="assembly-issues">
            {asm.issues.map((i) => {
              const Icon = LEVEL_ICON[i.level];
              return (
                <li key={i.id} className={`asm-issue ${i.level}`}>
                  <Icon size={14} aria-hidden />
                  <div>
                    <b>{i.title}</b>
                    <p>{i.detail}</p>
                    {(i.fix || i.alt) && (
                      <div className="asm-actions">
                        {i.fix && <button type="button" className="ui-btn small" onClick={() => fix(i)}>{i.fixLabel ?? "Fix"}</button>}
                        {i.alt && <button type="button" className="ui-btn small" onClick={() => fix(i, i.alt!.fix, i.alt!.label)}>{i.alt.label}</button>}
                        {i.parts[0] && keyName.has(i.parts[0]) && <button type="button" className="asm-link" onClick={() => setSel(i.parts[0])}>Show</button>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="asm-sh">Settings</h3>
          <div className="asm-row">
            <span>Loose parts</span>
            <span className="v3-seg" role="group" aria-label="Loose parts">
              <button type="button" aria-pressed={doc.assembly?.loose !== "stack"} onClick={() => edit("Loose parts beside", (d) => { (d.assembly ??= {}).loose = "beside"; })}>Beside</button>
              <button type="button" aria-pressed={doc.assembly?.loose === "stack"} onClick={() => edit("Loose parts stacked", (d) => { (d.assembly ??= {}).loose = "stack"; })}>Stacked</button>
            </span>
          </div>
          <label className="asm-check">
            <input type="checkbox" checked={doc.assembly?.autoFix !== false} onChange={(e) => { const on = e.target.checked; edit(on ? "Auto-fix on" : "Auto-fix off", (d) => { (d.assembly ??= {}).autoFix = on; }); }} />
            Apply the safe fixes when 3D opens
          </label>
        </section>

        <section>
          <header className="asm-sh">
            <h3>Parts ({asm.parts.length})</h3>
            {doc.assembly?.parts && Object.keys(doc.assembly.parts).length > 0 && (
              <button type="button" className="asm-link" onClick={() => edit("Reset 3D adjustments", (d) => { if (d.assembly) delete d.assembly.parts; })}>Reset all</button>
            )}
          </header>
          <ul className="asm-parts" data-testid="assembly-parts">
            {asm.parts.map((p) => (
              <li key={p.key} className={p.key === sel ? "on" : undefined}>
                <button type="button" className="asm-part" onClick={() => setSel(p.key === sel ? null : p.key)} aria-pressed={p.key === sel}>
                  <span className="nm">{p.name}</span>
                  <span className="role">{ROLE_NAMES[p.role]}{p.adjusted ? " · adjusted" : ""}</span>
                </button>
                <button type="button" className="asm-eye" aria-label={p.hidden ? `Show ${p.name}` : `Hide ${p.name}`} title={p.hidden ? "Show" : "Hide"}
                  onClick={() => setAdj(p.key, { hidden: !p.hidden }, p.hidden ? "Show part in 3D" : "Hide part in 3D")}>
                  {p.hidden ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {part && (
          <section className="asm-sel" data-testid="assembly-selected">
            <header className="asm-sh">
              <h3>{part.name}</h3>
              <span className="role">{ROLE_NAMES[part.role]} · {Math.round(part.w * 10) / 10} × {Math.round(part.h * 10) / 10} × {part.t} mm</span>
            </header>
            <div className="asm-move">
              {(["X", "Y", "Z"] as const).map((ax, i) => (
                <Num key={ax} label={ax} value={move[i]} onCommit={(val) => { const m = [...move] as [number, number, number]; m[i] = val; setAdj(part.key, { move: m }, "Move part in 3D", `asm-move-${part.key}`); }} />
              ))}
            </div>
            <div className="asm-actions">
              {(["X", "Y", "Z"] as const).map((ax, i) => (
                <button key={ax} type="button" className="ui-btn small" title={`Turn 90° about ${ax}`}
                  onClick={() => { const t = [...turn] as [number, number, number]; t[i] = (t[i] + 90) % 360; setAdj(part.key, { turn: t }, "Turn part in 3D"); }}>
                  <RotateCcw size={12} aria-hidden /> {ax} 90°
                </button>
              ))}
            </div>
            <label className="asm-check">
              <input type="checkbox" checked={!!adj.flat} onChange={(e) => setAdj(part.key, { flat: e.target.checked }, e.target.checked ? "Lay part flat in 3D" : "Join part in 3D")} />
              Lay flat beside the assembly
            </label>
            <div className="asm-actions">
              <button type="button" className="ui-btn small" disabled={!part.adjusted} onClick={() => setAdj(part.key, { move: undefined, turn: undefined, flat: undefined, hidden: undefined }, "Reset part in 3D")}>Reset part</button>
              <button type="button" className="ui-btn small" onClick={() => onShow(part.nodes)} data-testid="assembly-show-2d">Show in Studio</button>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
