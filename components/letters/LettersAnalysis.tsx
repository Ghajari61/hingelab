"use client";

import { ZONE_COLORS, type BoxInfo, type LetterModel } from "@/lib/letters";
import { fmtLen, type Units } from "@/components/editor/format";

const VERDICT = { ok: "bends safely", tight: "close to the limit", crack: "too tight" } as const;

/** "2 strips and 3 panels", leaving out a kind there are none of. */
const count = (a: number, aName: string, b: number, bName: string) =>
  [[a, aName], [b, bName]].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(" and ") || "no walls";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function BoxStats({ box, units }: { box: BoxInfo; units: Units }) {
  const hinge = box.style === "hinge";
  const longest = box.walls.reduce((m, w) => Math.max(m, ...w.pieceLengths), 0);
  const lights = box.letters.reduce((n, s) => n + s.lights, 0);
  return (
    <>
      <dl className="stats">
        <dt>Wall height</dt><dd>{fmtLen(box.hBody, units, true)}</dd>
        {hinge && <><dt>Corner radius</dt><dd>{fmtLen(box.rCorner, units, true)}</dd></>}
        {hinge && <><dt>Hinge bends to about</dt><dd>R {fmtLen(box.rMin, units, true)}</dd></>}
        {longest > 0 && <><dt>Longest {hinge ? "strip" : "panel"}</dt><dd>{fmtLen(longest, units, true)}</dd></>}
        {lights > 0 && <><dt>Light holes</dt><dd>{lights}</dd></>}
      </dl>
      <ul className="letter-stats">
        {box.letters.map((s) => (
          <li key={s.letter} className={s.verdict ?? "flat"}>
            <strong>{s.letter}</strong>
            <span>
              {fmtLen(s.perimeter, units, true)} of wall, {count(s.strips, "strip", s.panels, "panel")}
              {hinge && (s.zones ? `, ${plural(s.zones, "curve")}, tightest R ${fmtLen(s.rTight, units, true)} (limit R ${fmtLen(box.rMin, units, true)})` : ", no curves")}
              {hinge && s.verdict && ` · ${VERDICT[s.verdict]}`}
              {s.lights > 0 && `, ${plural(s.lights, "light hole")}`}
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
  const notes = model.issues.filter((i) => i.lvl === "info");
  const holes = model.parts.reduce((n, p) => n + (p.kind === "solid" ? p.holes.length : 0), 0);
  const w = model.bbox.x1 - model.bbox.x0, h = model.bbox.y1 - model.bbox.y0;
  const n = model.parts.length;
  const hinge = model.box?.style === "hinge";
  const stencil = model.mode === "stencil";
  return (
    <>
      <div className={`verdict ${warns.length ? "warn" : "ok"}`}>
        <span className="dot" />
        <span>{warns.length ? `${plural(n, "part")}, with ${plural(warns.length, "thing")} to check below.` : `Ready to cut: ${plural(n, "part")}.`}</span>
      </div>
      <dl className="stats">
        <dt>Text size (ink)</dt><dd>{fmtLen(w, units, true)} × {fmtLen(h, units, true)}</dd>
        <dt>Parts</dt><dd>{n}</dd>
        {!model.box && <><dt>{stencil ? "Letter cut-outs" : "Inner cuts (counters)"}</dt><dd>{holes}</dd></>}
        {!stencil && <><dt>Small pieces (dots, accents)</dt><dd>{model.islands.length}</dd></>}
        {model.bridges.length > 0 && <><dt>{stencil ? "Stencil bridges" : "Weld bridges"}</dt><dd>{model.bridges.length}</dd></>}
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
                  {model.box.walls.some((w) => w.style === "faceted") && (
                    <>
                      <li><span className="ring" style={{ borderColor: ZONE_COLORS.ok }} />Panel corner, finger joint</li>
                      <li><span className="ring" style={{ borderColor: ZONE_COLORS.tight }} />Panel corner, butt joint to glue</li>
                    </>
                  )}
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
      {warns.length > 0 && (
        <>
          <p className="issues-title">To check</p>
          <ul className="issues warn">{warns.map((i, k) => <li key={k}>{i.msg}</li>)}</ul>
        </>
      )}
      {notes.length > 0 && (
        <>
          <p className="issues-title">Notes</p>
          <ul className="issues">{notes.map((i, k) => <li key={k}>{i.msg}</li>)}</ul>
        </>
      )}
    </>
  );
}
