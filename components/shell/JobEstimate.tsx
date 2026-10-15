"use client";

import { useEffect, useState } from "react";
import type { Rect } from "@/lib/export/profiles";
import {
  ESTIMATE_EVENT, fmtArea, fmtDuration, fmtLength, fmtMoney, jobCost, jobTime, loadEstimate, measureSVG, saveEstimate, speedsFor,
  type EstimateSettings, type JobMeasure, type OpSpeed,
} from "@/lib/estimate";
import { loadMaterials, MATERIALS_EVENT, type LaserOp } from "@/lib/materials/library";
import { machineById, MACHINE_PROFILES } from "@/lib/studio/library";
import { loadPrefs } from "@/lib/studio/prefs";
import "./job-estimate.css";

const OP_NAME: Record<LaserOp, string> = { cut: "Cut", score: "Score", engrave: "Engrave" };

/**
 * Cut length, engraving, material, job time and cost of the design, measured from its SVG a moment
 * after it changes. `machine` fixes the machine (the export dialog's); otherwise it is chosen here.
 */
export default function JobEstimate({ svg, version, sheets, material, units, machine: fixed, title = "Job estimate" }: {
  /** The design's SVG built on this device, or null while it cannot be built. */
  svg: () => string | null;
  /** Changes whenever the design does. */
  version: unknown;
  sheets: Rect[] | null | undefined;
  material?: string;
  units: "mm" | "in";
  machine?: string;
  title?: string;
}) {
  const [m, setM] = useState<JobMeasure | null>(null);
  const [s, setS] = useState<EstimateSettings>(() => loadEstimate(loadPrefs().machineId));
  const [mats, setMats] = useState(() => loadMaterials());
  useEffect(() => {
    const t = window.setTimeout(() => {
      const text = svg();
      setM(text ? measureSVG(text, sheets) : null);
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, sheets]);
  useEffect(() => {
    const again = () => { setS(loadEstimate(loadPrefs().machineId)); setMats(loadMaterials()); };
    window.addEventListener(ESTIMATE_EVENT, again);
    window.addEventListener(MATERIALS_EVENT, again);
    return () => { window.removeEventListener(ESTIMATE_EVENT, again); window.removeEventListener(MATERIALS_EVENT, again); };
  }, []);

  const put = (next: EstimateSettings) => { setS(next); saveEstimate(next); };
  const machineId = fixed ?? s.machine;
  const mach = machineById(machineId);
  const mat = material ? mats.find((x) => x.id === material) : undefined;
  if (!m) return <div className="jobest" aria-label={title}><div className="jobest-h">{title}</div><p className="note">Measuring the design…</p></div>;

  const sp = speedsFor(mat, mach, s);
  const time = mach ? jobTime(m, sp) : null;
  const cost = s.price != null ? jobCost(m, s.price) : null;
  const dims = (w: number, h: number) => (units === "in" ? `${(w / 25.4).toFixed(1)} × ${(h / 25.4).toFixed(1)} in` : `${Math.round(w)} × ${Math.round(h)} mm`);
  const same = new Set(m.sheets.map((x) => `${Math.round(x.w)}x${Math.round(x.h)}`)).size === 1;
  const sheetText = m.sheets.length ? `${m.sheets.length} sheet${m.sheets.length > 1 ? "s" : ""}${same ? ` of ${dims(m.sheets[0].w, m.sheets[0].h)}` : ""}` : "";
  const share = cost ? cost.share : m.sheets.length ? Math.min(1, m.partsArea / m.sheets.reduce((a, x) => a + x.w * x.h, 0)) : 0;
  const mineFor = (op: LaserOp): OpSpeed | undefined => (mach ? s.speeds[mach.id]?.[op] : undefined);
  const setSpeed = (op: LaserOp, k: keyof OpSpeed, v: string) => {
    if (!mach) return;
    const cur = { ...(s.speeds[mach.id] ?? {}) };
    const n = Number(v);
    if (!v.trim() || !(n > 0)) { if (k === "speed") delete cur[op]; }
    else cur[op] = { ...(cur[op] ?? { speed: n, passes: 1 }), [k]: k === "passes" ? Math.max(1, Math.round(n)) : n };
    put({ ...s, speeds: { ...s.speeds, [mach.id]: cur } });
  };

  return (
    <div className="jobest" role="group" aria-label={title}>
      <div className="jobest-h">{title}</div>
      <dl className="jobest-grid">
        <dt>Cut</dt><dd>{fmtLength(m.cut, units)}{m.paths ? ` · ${m.paths} path${m.paths > 1 ? "s" : ""}` : ""}</dd>
        {m.score > 0 && <><dt>Score</dt><dd>{fmtLength(m.score, units)}</dd></>}
        {m.engraveArea > 0 && <><dt>Engrave</dt><dd>{fmtArea(m.engraveArea, units)}</dd></>}
        <dt>Material</dt><dd>{fmtArea(m.partsArea, units)} in the parts{sheetText ? ` · ${sheetText} (${Math.round(share * 100)} % used)` : ""}</dd>
      </dl>

      {!fixed && (
        <label className="jobest-row">
          <span>Machine</span>
          <select className="sel" aria-label="Estimate for machine" value={machineId} onChange={(e) => put({ ...s, machine: e.target.value })}>
            {MACHINE_PROFILES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      )}
      <p className="jobest-time" role="status">
        {!mach
          ? "Choose a machine to estimate the time."
          : time?.total != null
            ? <>Job time on {mach.name}: <b>about {fmtDuration(time.total)}</b>{Object.keys(time.parts).length > 1 ? ` (${(Object.entries(time.parts) as [string, number][]).map(([k, v]) => `${k === "travel" ? "moves" : OP_NAME[k as LaserOp].toLowerCase()} ${fmtDuration(v)}`).join(", ")})` : ""}</>
            : <>Job time: enter your {time?.missing.map((o) => OP_NAME[o].toLowerCase()).join(" and ")} speed{(time?.missing.length ?? 0) > 1 ? "s" : ""} for {mach.name}{mat ? ` or save them with “${mat.name}”` : ""}. HingeLab does not guess laser speeds.</>}
      </p>
      {mach && (
        <details className="jobest-speeds">
          <summary>Your speeds for {mach.name}</summary>
          <div className="jobest-sp">
            {(["cut", "score", "engrave"] as LaserOp[]).map((op) => (
              <div key={op} className="jobest-op">
                <span>{OP_NAME[op]}{sp.from[op] === "material" ? " (from your material)" : ""}</span>
                <input className="sel" type="number" min={0.1} step="any" inputMode="decimal" aria-label={`${OP_NAME[op]} speed (mm/s)`} placeholder="mm/s"
                  disabled={sp.from[op] === "material"} value={mineFor(op)?.speed ?? ""} onChange={(e) => setSpeed(op, "speed", e.target.value)} />
                {op !== "engrave" && (
                  <input className="sel" type="number" min={1} step={1} aria-label={`${OP_NAME[op]} passes`} placeholder="passes"
                    disabled={sp.from[op] === "material" || !mineFor(op)} value={mineFor(op)?.passes ?? ""} onChange={(e) => setSpeed(op, "passes", e.target.value)} />
                )}
              </div>
            ))}
            <label className="jobest-op">
              <span>Line interval (engraving)</span>
              <input className="sel" type="number" min={0.01} max={2} step={0.01} aria-label="Line interval (mm)" value={s.interval} onChange={(e) => { const n = Number(e.target.value); if (n >= 0.01 && n <= 2) put({ ...s, interval: n }); }} />
              <span className="unit">mm</span>
            </label>
            <p className="note">Speeds are kept on this device. Moves between paths use the machine&apos;s travel speed ({mach.maxSpeed} mm/s); acceleration is not counted, so real jobs run a little longer.</p>
          </div>
        </details>
      )}

      <div className="jobest-cost">
        <label className="jobest-row">
          <span>Price per sheet</span>
          <span className="jobest-money">
            <input className="sel cur" aria-label="Currency" maxLength={4} placeholder="$" value={s.currency} onChange={(e) => put({ ...s, currency: e.target.value })} />
            <input className="sel" type="number" min={0} step="any" inputMode="decimal" aria-label="Price per sheet" placeholder="0.00"
              value={s.price ?? ""} onChange={(e) => put({ ...s, price: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} />
          </span>
        </label>
        {cost && (
          <p className="jobest-total" role="status">
            Material cost: <b>{fmtMoney(cost.full, s.currency)}</b> for {cost.sheets} sheet{cost.sheets > 1 ? "s" : ""} · {fmtMoney(cost.used, s.currency)} for the parts alone
          </p>
        )}
      </div>
    </div>
  );
}
