"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GenPreset } from "@/lib/generators/types";

const STEPS = ["Choose a design", "Make it yours", "Export"] as const;

/**
 * The phone flow for a generator: pick a preset, change its text, font or photo, and download the
 * files. Everything else stays in the full editor, one tap away.
 */
export default function PhoneFlow({
  name, summary, presets, thumb, current, onPreset, fields, svg, status, nesting, assembly, onSVG, onDXF, onFull, onHome,
}: {
  /** Assembly steps for the design. */
  assembly: string[];
  name: string;
  summary: string;
  presets: GenPreset<unknown>[];
  thumb: (pr: GenPreset<unknown>) => string;
  /** Id of the preset last applied, if any. */
  current: string | null;
  onPreset: (pr: GenPreset<unknown>) => void;
  fields: ReactNode;
  /** The design as it will be exported, or null while it loads or has an error. */
  svg: string | null;
  /** What stops the export (an error, still loading), or null. */
  status: string | null;
  nesting: boolean;
  onSVG: () => void;
  onDXF: () => void;
  onFull: () => void;
  onHome: () => void;
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? presets.filter((p) => `${p.name} ${p.note ?? ""}`.toLowerCase().includes(q)) : presets;
  }, [presets, query]);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!svg || step === 0) { setPreview(null); return; }
    // Hairline cuts vanish when a whole sheet shrinks to a phone, so draw lines at a fixed screen width.
    const look = svg.replace(/<svg\b[^>]*>/, (m) => `${m}<style>*{vector-effect:non-scaling-stroke!important;stroke-width:1.25px!important}</style>`);
    const url = URL.createObjectURL(new Blob([look], { type: "image/svg+xml" }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [svg, step]);

  return (
    <div className="phone-flow">
      <header className="pf-head">
        <button type="button" className="pf-link" onClick={onHome}>All products</button>
        <h1>{name}</h1>
        <button type="button" className="pf-link" onClick={onFull}>Full editor</button>
      </header>
      <nav aria-label="Steps">
        <ol className="pf-steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
                <span aria-hidden>{i + 1}</span> {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <main className="pf-body">
        {step === 0 && (
          <section aria-labelledby="pf-h0">
            <h2 id="pf-h0">Choose a design</h2>
            {presets.length > 6 && (
              <input type="search" className="gsearch" placeholder={`Search ${presets.length} designs`} aria-label="Search designs" value={query} onChange={(e) => setQuery(e.target.value)} />
            )}
            <div className="pf-grid">
              <button type="button" className="pf-card keep" onClick={() => setStep(1)}>
                <span className="pf-keep" aria-hidden>→</span>
                <span>Keep my current design</span>
              </button>
              {shown.map((pr) => (
                <button key={pr.id} type="button" className="pf-card" aria-pressed={current === pr.id} onClick={() => { onPreset(pr); setStep(1); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- static preset thumbnails */}
                  <img src={thumb(pr)} alt="" width={132} height={88} loading="lazy" />
                  <span>{pr.name}</span>
                </button>
              ))}
            </div>
            {!shown.length && <p className="note">No designs match. Try another word.</p>}
          </section>
        )}
        {step > 0 && (
          <figure className="pf-preview">
            {preview ? <img src={preview} alt={`Preview: ${summary}`} /> : <div className="pf-wait">{status ?? "Loading…"}</div>}
            <figcaption>{summary}</figcaption>
          </figure>
        )}
        {step === 1 && (
          <section aria-labelledby="pf-h1">
            <h2 id="pf-h1">Make it yours</h2>
            {fields}
            <button type="button" className="btn-export pf-next" onClick={() => setStep(2)}>Next: export</button>
          </section>
        )}
        {step === 2 && (
          <section aria-labelledby="pf-h2">
            <h2 id="pf-h2">Export</h2>
            <p className="note">Files are made on this phone. Open them in your laser software; check the material thickness and kerf there or in the full editor.</p>
            {status && <p className="note warn" role="alert">{status}</p>}
            {nesting && <p className="note" role="status">Nesting the parts by shape…</p>}
            <div className="pf-actions">
              <button type="button" className="btn-export" disabled={!!status || nesting} onClick={onSVG}>Download SVG</button>
              <button type="button" className="btn-auto" disabled={!!status || nesting} onClick={onDXF}>Download DXF</button>
            </div>
            {assembly.length > 0 && (
              <details className="gen-assembly" open>
                <summary>How it goes together</summary>
                <ol>{assembly.map((a, i) => <li key={i}>{a}</li>)}</ol>
              </details>
            )}
            <button type="button" className="pf-link" onClick={onFull}>Change sizes, material and more in the full editor</button>
          </section>
        )}
      </main>
    </div>
  );
}
