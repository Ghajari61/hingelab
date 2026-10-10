"use client";

import type { Model } from "@/lib/hinge";
import { fmtLen, type Units } from "./format";

export function AnalysisPanel({ model, error, units }: { model: Model | null; error: string | null; units: Units }) {
  if (!model) {
    return <div className="verdict err"><span className="dot" /><span>{error}</span></div>;
  }
  const a = model.analysis;
  const msg = {
    ok: `Bends safely. The corners need a ${fmtLen(model.rN, units)} radius and this pattern should reach about ${fmtLen(a.rMin, units)}.`,
    warn: `Tight bend. The corners need ${fmtLen(model.rN, units)}, close to the estimated limit of ${fmtLen(a.rMin, units)}. Cut a test strip first.`,
    err: `Likely to crack. The corners need ${fmtLen(model.rN, units)} but the pattern only reaches about ${fmtLen(a.rMin, units)}. Lengthen the slits, tighten the spacing, or enlarge the corner radius.`,
  }[a.verdict];
  return (
    <>
      <div className={`verdict ${a.verdict}`}><span className="dot" /><span>{msg}</span></div>
      <dl className="stats">
        <dt>Corner bend radius (neutral)</dt><dd>{fmtLen(model.rN, units)}</dd>
        <dt>Estimated minimum radius</dt><dd>{fmtLen(a.rMin, units)}</dd>
        <dt>Wall strip length</dt><dd>{fmtLen(model.L, units)}</dd>
        <dt>Wall height (between plates)</dt><dd>{fmtLen(model.hBody, units)}</dd>
        <dt>Slit length (actual)</dt><dd>{fmtLen(a.Lp, units)}</dd>
        <dt>Slits per column</dt><dd>{a.nSeg}</dd>
        <dt>Torsion bar length × width</dt><dd>{fmtLen(a.barLen, units, true)} × {fmtLen(a.barW, units, true)}</dd>
        <dt>Hinge columns</dt><dd>{a.columns}</dd>
      </dl>
      {model.issues.length > 0 && (
        <ul className="issues">{model.issues.map((issue) => <li key={issue.msg}>{issue.msg}</li>)}</ul>
      )}
      <p className="note">The minimum radius is an engineering estimate from torsion-bar strain. Always cut a test piece in your own material.</p>
    </>
  );
}
