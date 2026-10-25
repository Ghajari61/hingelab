"use client";

import { useState } from "react";
import { Minus, Plus, RotateCw } from "lucide-react";
import { SHEET_PRESETS } from "@/lib/studio/library";
import { MAX_FIT_SHEETS, type FitSettings } from "@/lib/fit/fitToSheets";
import type { FitInfo } from "@/lib/fit/arrange";

const GROUPS = ["Machine bed", "Paper", "Common"] as const;

export const presetIdOf = (w: number, h: number) =>
  SHEET_PRESETS.find((s) => Math.abs(s.w - w) < 0.05 && Math.abs(s.h - h) < 0.05)?.id ?? "custom";

/** What a resize would do, worked out before it is applied. */
export interface ResizePreview { scale: number; fits: boolean; size: string | null }

/** What keeps its size when a product is resized to fit (each product's scale rules, lib/fit and def.scale). */
export const RESIZE_POLICY = "Material thickness, kerf, joint clearances, hinge cuts and hardware holes keep their sizes; the product and its decoration scale. The checks run again on the resized design.";

/** One line describing the layout or the resize, for the Sheet section and the status bar. */
export function fitSummary(fit: FitSettings, info: FitInfo | null, size: string | null): string {
  if (fit.mode === "off" || !info) return "Design size, parts in rows on one sheet.";
  const sheets = `${info.sheets} sheet${info.sheets === 1 ? "" : "s"}`;
  if (fit.mode === "auto") return `Design size, nested on ${sheets}${info.fits ? "" : ". A part is larger than the sheet"}.`;
  if (!info.fits) return `Does not fit ${fit.sheets} sheet${fit.sheets === 1 ? "" : "s"} at any size this design can be built at. Use a larger sheet or more sheets.`;
  const pct = Math.round(info.scale * 1000) / 10;
  return `${info.scale < 1 ? `Resized to ${pct} %` : "Design size"}${size ? ` · ${size}` : ""} · ${sheets}`;
}

/**
 * The "Sheet" section body shared by every product: the sheet preset, size fields (children), the
 * layout (rows, or nested on as many sheets as needed: never resized), and Resize to fit, a
 * separate step that shows the original size, the new size and the scale before it applies.
 */
export function SheetSection({ bedW, bedH, fit, info, size, original, preview, onSheet, onFit, children }: {
  bedW: number;
  bedH: number;
  fit: FitSettings;
  info: FitInfo | null;
  /** The built product's size, already formatted. */
  size: string | null;
  /** The product's size at its design size, already formatted. */
  original?: string | null;
  /** What resizing to these settings would give (not applied). */
  preview?: (f: FitSettings) => ResizePreview;
  onSheet: (w: number, h: number) => void;
  onFit: (f: FitSettings) => void;
  children?: React.ReactNode;
}) {
  const preset = presetIdOf(bedW, bedH);
  const resized = fit.mode === "sheets";
  const [ask, setAsk] = useState<number | null>(null);
  const warn = fit.mode !== "off" && !!info && !info.fits;
  const pv = ask !== null && preview ? preview({ mode: "sheets", sheets: ask }) : null;
  const pct = (s: number) => `${Math.round(s * 1000) / 10} %`;
  return (
    <>
      <div className="rowlabel">Sheet</div>
      <select
        className="sel" aria-label="Sheet preset" value={preset}
        onChange={(e) => { const s = SHEET_PRESETS.find((x) => x.id === e.target.value); if (s) onSheet(s.w, s.h); }}
      >
        {preset === "custom" && <option value="custom">Custom size</option>}
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {SHEET_PRESETS.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.name}{s.group === "Machine bed" ? ` (${s.w} × ${s.h} mm)` : ""}</option>)}
          </optgroup>
        ))}
      </select>
      {Math.abs(bedW - bedH) > 0.05 && (
        <button type="button" className="btn-auto sheet-rotate" onClick={() => onSheet(bedH, bedW)} title="Swap the sheet's width and height">
          <RotateCw size={14} aria-hidden /> Turn sheet ({bedH} × {bedW} mm)
        </button>
      )}
      {children}
      <div className="rowlabel">Layout</div>
      <div className="iconseg full" role="group" aria-label="Layout">
        <button type="button" aria-pressed={fit.mode === "off"} onClick={() => onFit({ ...fit, mode: "off" })} title="Parts in rows on one sheet, at the design size">In rows</button>
        <button type="button" aria-pressed={fit.mode === "auto"} onClick={() => onFit({ ...fit, mode: "auto" })} title="Keep the design size and nest the parts on as many sheets as needed">Nest on sheets</button>
      </div>
      <p className={`fit-result${warn ? " warn" : ""}`} role="status" aria-label="Fit result">{fitSummary(fit, info, size)}</p>
      <div className="rowlabel">Resize to fit</div>
      {resized ? (
        <div className="resize-card" role="group" aria-label="Resized to fit">
          <p>Resized to fit {fit.sheets} sheet{fit.sheets === 1 ? "" : "s"}{info ? `: ${pct(info.scale)}` : ""}{original ? ` of the design size (${original})` : ""}.</p>
          <button type="button" className="btn-auto" onClick={() => onFit({ mode: "auto", sheets: fit.sheets })}>Restore the design size</button>
        </div>
      ) : ask === null ? (
        <div className="iconseg full" role="group" aria-label="Resize to fit">
          <button type="button" onClick={() => setAsk(1)} title="Work out a smaller size that fits one sheet, and show it before applying">1 sheet…</button>
          <button type="button" onClick={() => setAsk(2)} title="Work out a smaller size that fits the number of sheets you choose, and show it before applying">N sheets…</button>
        </div>
      ) : (
        <div className="resize-card" role="dialog" aria-label="Resize to fit">
          {ask > 1 && (
            <div className="fit-count" role="group" aria-label="Number of sheets">
              <span>Sheets</span>
              <button type="button" aria-label="Fewer sheets" disabled={ask <= 2} onClick={() => setAsk(ask - 1)}><Minus size={13} /></button>
              <output aria-label="Sheets">{ask}</output>
              <button type="button" aria-label="More sheets" disabled={ask >= MAX_FIT_SHEETS} onClick={() => setAsk(ask + 1)}><Plus size={13} /></button>
            </div>
          )}
          {pv ? (
            pv.fits
              ? <p>{pv.scale < 1 ? <>From {original ?? "the design size"} to <b>{pv.size ?? pct(pv.scale)}</b>: scale <b>{pct(pv.scale)}</b>.</> : <>It already fits {ask} sheet{ask === 1 ? "" : "s"} at the design size; nothing changes.</>}</p>
              : <p className="warn">It does not fit {ask} sheet{ask === 1 ? "" : "s"} at any size it can be built at.</p>
          ) : <p>The product shrinks until every part fits.</p>}
          <p className="note">{RESIZE_POLICY}</p>
          <div className="resize-actions">
            <button type="button" className="btn-auto" disabled={!!pv && !pv.fits} onClick={() => { onFit({ mode: "sheets", sheets: ask }); setAsk(null); }}>Resize</button>
            <button type="button" className="btn-auto" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
