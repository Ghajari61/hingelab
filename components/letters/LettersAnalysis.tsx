"use client";

import { ZONE_COLORS, type BoxInfo, type LetterModel } from "@/lib/letters";
import { fmtLen, type Units } from "@/components/editor/format";

const VERDICT = { ok: "bends safely", tight: "close to the limit", crack: "too tight" } as const;

function BoxStats({ box, units }: { box: BoxInfo; units: Units }) {
  const hinge = box.style === "hinge";
  return (
    <>
      <dl className="stats">
        <dt>Wall height</dt><dd>{fmtLen(box.hBody, units, true)}</dd>
        {hinge && <><dt>Corner radius</dt><dd>{fmtLen(box.rCorner, units, true)}</dd></>}
        {hinge && <><dt>Hinge bends to about</dt><dd>R {fmtLen(box.rMin, units, true)}</dd></>}
      </dl>
      <ul className="letter-stats">
        {box.letters.map((s) => (
          <li key={s.letter} className={s.verdict ?? "flat"}>
            <strong>{s.letter}</strong>
            <span>
              {fmtLen(s.perimeter, units, true)} of wall, {s.pieces} {hinge ? (s.pieces === 1 ? "strip" : "strips") : (s.pieces === 1 ? "panel" : "panels")}
              {hinge && (s.zones ? `, ${s.zones} curve${s.zones === 1 ? "" : "s"}, tightest R ${fmtLen(s.rTight, units, true)}` : ", no curves")}
              {hinge && s.verdict && ` · ${VERDICT[s.verdict]}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LettersAnalysis({ model, error, units, showZones, onShowZones }: {
  model: LetterModel | null;
  error: string | null;
  units: Units;
  showZones: boolean;
  onShowZones: (on: boolean) => void;
}) {
  if (!model) {
    return error ? <div className="verdict err"><span className="dot" /><span>{error}</span></div> : <p className="note">Loading…</p>;
  }
  const warns = model.issues.filter((i) => i.lvl === "warn");
  const holes = model.parts.reduce((n, p) => n + (p.kind === "solid" ? p.holes.length : 0), 0);
  const w = model.bbox.x1 - model.bbox.x0, h = model.bbox.y1 - model.bbox.y0;
  const n = model.parts.length;
  const hinge = model.box?.style === "hinge";
  return (
    <>
      <div className={`verdict ${warns.length ? "warn" : "ok"}`}>
        <span className="dot" />
        <span>{warns.length ? `${n} part${n === 1 ? "" : "s"}, with ${warns.length} thing${warns.length === 1 ? "" : "s"} to check below.` : `Ready to cut: ${n} part${n === 1 ? "" : "s"}.`}</span>
      </div>
      <dl className="stats">
        <dt>Text size (ink)</dt><dd>{fmtLen(w, units, true)} × {fmtLen(h, units, true)}</dd>
        <dt>Parts</dt><dd>{n}</dd>
        {!model.box && <><dt>Inner cuts (counters)</dt><dd>{holes}</dd></>}
        <dt>Small pieces (dots, accents)</dt><dd>{model.islands.length}</dd>
        {model.bridges.length > 0 && <><dt>Weld bridges</dt><dd>{model.bridges.length}</dd></>}
        <dt>Direction</dt><dd>{model.shaped.direction === "rtl" ? "Right to left" : "Left to right"}</dd>
      </dl>
      {model.box && (
        <>
          <BoxStats box={model.box} units={units} />
          <label className="chk">
            <input type="checkbox" checked={showZones} onChange={(e) => onShowZones(e.target.checked)} /> Show {hinge ? "bend zones" : "panel corners"} on the base plates
          </label>
          {showZones && (
            <ul className="zone-legend">
              {hinge ? (
                <>
                  <li><span style={{ background: ZONE_COLORS.flat }} />Flat, no hinge cuts</li>
                  <li><span style={{ background: ZONE_COLORS.ok }} />Curve that bends safely</li>
                  <li><span style={{ background: ZONE_COLORS.tight }} />Curve close to the limit</li>
                  <li><span style={{ background: ZONE_COLORS.crack }} />Curve too tight for this hinge</li>
                  <li><span className="ring" style={{ borderColor: ZONE_COLORS.seam }} />Seam where a strip starts</li>
                </>
              ) : (
                <>
                  <li><span style={{ background: ZONE_COLORS.flat }} />Panel centerline</li>
                  <li><span className="ring" style={{ borderColor: ZONE_COLORS.ok }} />Finger joint</li>
                  <li><span className="ring" style={{ borderColor: ZONE_COLORS.tight }} />Butt joint to glue</li>
                </>
              )}
            </ul>
          )}
        </>
      )}
      {model.issues.length > 0 && <ul className="issues">{model.issues.map((i, k) => <li key={k}>{i.msg}</li>)}</ul>}
    </>
  );
}
