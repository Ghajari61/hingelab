"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Dices, LayoutGrid, RefreshCw, Search, Shuffle, Sparkles, Trash2, X } from "lucide-react";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { previewData } from "@/lib/parametric/designPreview";
import {
  BUILD_AS, RECIPES, designName, designParams, newSeed, randomDesign, recipeOf, variations, type BuildAs, type Design, type Knob, type RecipeId,
} from "@/lib/parametric/generator";
import { PARAMETRIC_CATEGORIES, PARAMETRIC_PRESETS, type Finish, type ParametricCategory, type ParametricPreset } from "@/lib/parametric/presets";
import { PRESET_PARTS } from "@/lib/parametric/presetParts";
import type { ParametricParams } from "@/lib/parametric/types";
import { hasPro, parametricLocks, type Plan } from "@/lib/plans";
import type { MyPreset } from "@/lib/userPresets";
import { drawPreview } from "./designDraw";
import "./designs.css";

export type DesignTab = "gallery" | "generate" | "mine";

const METHOD_NAMES: Record<string, string> = { parallel: "Fins", stacked: "Layers", waffle: "Waffle", radial: "Radial", curveNormal: "Along a curve", folded: "Folded" };
const methodOf = (p: ParametricPreset) => (p.params.method as string | undefined) ?? "parallel";
const isLocked = (p: { source?: { kind: string }; method?: string }, parts?: number) =>
  parametricLocks("free", { source: p.source ?? { kind: "library" }, method: p.method ?? "parallel" }, parts).length > 0;

function matches(p: ParametricPreset, words: string[]) {
  if (!words.length) return true;
  const cat = PARAMETRIC_CATEGORIES.find((c) => c.id === p.category)?.name ?? "";
  const hay = [p.name, p.note, cat, METHOD_NAMES[methodOf(p)], ...(p.tags ?? [])].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

function Preview({ params, className, label, detail = 44 }: { params: Partial<ParametricParams>; className: string; label: string; detail?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => previewData(mergeParametricParams(params), detail), [params, detail]);
  useEffect(() => {
    if (!ref.current) return;
    const dark = /dark/.test(document.documentElement.dataset.theme ?? "");
    drawPreview(ref.current, data, dark);
  }, [data]);
  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}

function KnobSlider({ knob, value, onChange }: { knob: Knob; value: number; onChange: (v: number) => void }) {
  if (knob.options) {
    return (
      <div className="ds-knob">
        <span className="ds-knob-l">{knob.label}</span>
        <div className="iconseg full" role="group" aria-label={knob.label}>
          {knob.options.map((o, i) => <button key={o} type="button" aria-pressed={Math.round(value) === i} onClick={() => onChange(i)}>{o}</button>)}
        </div>
      </div>
    );
  }
  const shown = knob.step < 1 ? value.toFixed(knob.step < 0.1 ? 2 : 1) : String(Math.round(value));
  return (
    <label className="ds-knob">
      <span className="ds-knob-l">{knob.label}</span>
      <input type="range" min={knob.min} max={knob.max} step={knob.step} value={value} aria-label={knob.label} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <output>{shown}{knob.unit ? (knob.unit === "°" ? "°" : ` ${knob.unit}`) : ""}</output>
    </label>
  );
}

/** The Parametric design library and generator, in one dialog. */
export default function DesignStudio({ initialTab, plan, mine, onRemoveMine, onApply, onClose }: {
  initialTab: DesignTab;
  plan: Plan;
  /** The user's saved Parametric presets. */
  mine: MyPreset[];
  onRemoveMine: (id: string) => void;
  onApply: (params: Partial<ParametricParams>, name: string, finish?: Finish) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DesignTab>(initialTab);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<ParametricCategory | "all">("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [design, setDesign] = useState<Design>(() => randomDesign(newSeed()));
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const showPro = !hasPro(plan);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => (tab === "gallery" ? searchRef.current : rootRef.current?.querySelector<HTMLElement>(".ds-tabs [aria-selected='true']"))?.focus());
    return () => before?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = PARAMETRIC_PRESETS.filter((p) => matches(p, words));
  const shown = found.filter((p) => cat === "all" || p.category === cat);
  const count = (c: ParametricCategory) => found.filter((p) => p.category === c).length;
  const pickedPreset = PARAMETRIC_PRESETS.find((p) => p.id === picked) ?? null;

  const recipe = recipeOf(design.recipe);
  const genParams = useMemo(() => designParams(design), [design]);
  const vars = useMemo(() => variations(design, 6), [design]);
  const varParams = useMemo(() => vars.map(designParams), [vars]);
  const genLocked = showPro && isLocked(genParams as { source?: { kind: string }; method?: string });

  const applyPreset = (p: ParametricPreset) => onApply(p.params, p.name, p.finish);
  const setKnob = (id: string, v: number) => setDesign((d) => ({ ...d, knobs: { ...d.knobs, [id]: v } }));
  const setRecipe = (id: RecipeId) => setDesign((d) => (d.recipe === id ? d : { ...randomDesign(d.seed, id), buildAs: d.buildAs }));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !rootRef.current) return;
    const items = [...rootRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, [tabindex='0']")].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const tabs: { id: DesignTab; text: string; icon: React.ReactNode }[] = [
    { id: "gallery", text: "Gallery", icon: <LayoutGrid size={15} aria-hidden /> },
    { id: "generate", text: "Generate", icon: <Sparkles size={15} aria-hidden /> },
    { id: "mine", text: `My designs${mine.length ? ` (${mine.length})` : ""}`, icon: <Bookmark size={15} aria-hidden /> },
  ];

  return (
    <div className="modal-back ds-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={rootRef} className="modal ds" role="dialog" aria-modal="true" aria-label="Designs" onKeyDown={onKey}>
        <header className="ds-head">
          <div className="ds-tabs" role="tablist" aria-label="Designs">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" id={`ds-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`ds-panel-${t.id}`} onClick={() => setTab(t.id)}>{t.icon}{t.text}</button>
            ))}
          </div>
          <button type="button" className="ds-close" aria-label="Close designs" onClick={onClose}><X size={18} /></button>
        </header>

        {tab === "gallery" && (
          <div className="ds-body" role="tabpanel" id="ds-panel-gallery" aria-labelledby="ds-tab-gallery">
            <div className="ds-filter">
              <label className="ds-search">
                <Search size={15} aria-hidden />
                <input ref={searchRef} type="search" placeholder="Search designs: face, lamp, clock, wave…" aria-label="Search designs" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <div className="ds-cats" role="group" aria-label="Categories">
                <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All <span>{found.length}</span></button>
                {PARAMETRIC_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" aria-pressed={cat === c.id} disabled={!count(c.id)} onClick={() => setCat(c.id)}>{c.name} <span>{count(c.id)}</span></button>
                ))}
              </div>
            </div>
            <div className="ds-scroll">
              {shown.length ? (
                <div className="preset-grid ds-grid">
                  {shown.map((p) => {
                    const parts = PRESET_PARTS[p.id];
                    return (
                      <button
                        key={p.id} type="button" className="preset-card ds-card" data-design={p.id} aria-pressed={picked === p.id}
                        onClick={() => setPicked(p.id)} onDoubleClick={() => applyPreset(p)}
                      >
                        <span className="thumb" aria-hidden><img src={`/presets/parametric/${p.id}.svg`} alt="" loading="lazy" width={300} height={200} /></span>
                        <span className="nm">{p.name}{showPro && isLocked(p.params as { source?: { kind: string }; method?: string }, parts) && <span className="pro-badge">Pro</span>}</span>
                        <span className="nt">{p.note}</span>
                        <span className="ds-meta">{METHOD_NAMES[methodOf(p)]}{parts ? ` · ${parts} parts` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ds-empty" role="status">
                  <p>No designs match “{query}”.</p>
                  <button type="button" className="btn-ghost-sm" onClick={() => { setQuery(""); setCat("all"); }}>Show all designs</button>
                </div>
              )}
            </div>
            <footer className="ds-foot">
              <div className="ds-pick" aria-live="polite">
                {pickedPreset ? <><b>{pickedPreset.name}</b><span>{pickedPreset.note}</span></> : <span>Pick a design to preview its details. Double-click opens it straight away.</span>}
              </div>
              <button type="button" className="btn-dark-sm ds-use" disabled={!pickedPreset} onClick={() => pickedPreset && applyPreset(pickedPreset)}>Use this design</button>
            </footer>
          </div>
        )}

        {tab === "generate" && (
          <div className="ds-body" role="tabpanel" id="ds-panel-generate" aria-labelledby="ds-tab-generate">
            <div className="ds-gen">
              <div className="ds-gen-side">
                <div className="ds-recipes" role="group" aria-label="Recipe">
                  {RECIPES.map((r) => (
                    <button key={r.id} type="button" data-recipe={r.id} aria-pressed={design.recipe === r.id} title={r.blurb} onClick={() => setRecipe(r.id)}>{r.name}</button>
                  ))}
                </div>
                <p className="ds-blurb">{recipe.blurb}</p>
                {recipe.kind === "surface" && (
                  <div className="ds-knob">
                    <span className="ds-knob-l">Cut as</span>
                    <div className="iconseg full" role="group" aria-label="Cut as">
                      {BUILD_AS.map((b) => <button key={b.id} type="button" title={b.title} aria-pressed={design.buildAs === b.id} onClick={() => setDesign((d) => ({ ...d, buildAs: b.id as BuildAs }))}>{b.name}</button>)}
                    </div>
                  </div>
                )}
                {recipe.knobs.filter((k) => !(k.id === "spacing" && (design.buildAs === "layers" || recipe.kind !== "surface"))).map((k) => (
                  <KnobSlider key={k.id} knob={k} value={design.knobs[k.id] ?? recipe.defaults[k.id]} onChange={(v) => setKnob(k.id, v)} />
                ))}
                <div className="ds-seed">
                  <label>Seed <input type="number" min={1} max={999999} value={design.seed} aria-label="Seed" onChange={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 999999) setDesign((d) => ({ ...d, seed: v })); }} /></label>
                  <button type="button" className="btn-ghost-sm" title="Same sliders, a new seed" onClick={() => setDesign((d) => ({ ...d, seed: newSeed() }))}><Dices size={14} aria-hidden />New seed</button>
                </div>
              </div>
              <div className="ds-gen-main">
                <figure className="ds-hero">
                  <Preview params={genParams} className="ds-canvas big" detail={110} label={`Preview of ${designName(design)}`} />
                  <figcaption>{designName(design)}{genLocked && <span className="pro-badge">Pro</span>}</figcaption>
                </figure>
                <div className="ds-vars" role="group" aria-label="Variations">
                  {vars.map((v, i) => (
                    <button key={v.seed} type="button" className="ds-var" title={`Use variation ${i + 1}`} aria-label={`Variation ${i + 1}`} onClick={() => setDesign(v)}>
                      <Preview params={varParams[i]} className="ds-canvas" label="" />
                    </button>
                  ))}
                </div>
                <p className="ds-hint">A quick drawing of the formula and where the fins fall. The full model is sliced when you use it.{genLocked ? " Generated designs use formulas: preview them freely; exporting needs Pro." : ""}</p>
              </div>
            </div>
            <footer className="ds-foot">
              <div className="ds-foot-btns">
                <button type="button" className="btn-ghost-sm" onClick={() => setDesign(randomDesign(newSeed()))}><Shuffle size={14} aria-hidden />Surprise me</button>
                <button type="button" className="btn-ghost-sm" onClick={() => setDesign((d) => variations(d, 1)[0])}><RefreshCw size={14} aria-hidden />New variation</button>
              </div>
              <button type="button" className="btn-dark-sm ds-use" onClick={() => onApply(genParams, designName(design))}>Use this design</button>
            </footer>
          </div>
        )}

        {tab === "mine" && (
          <div className="ds-body" role="tabpanel" id="ds-panel-mine" aria-labelledby="ds-tab-mine">
            <div className="ds-scroll">
              {mine.length ? (
                <div className="preset-grid ds-grid">
                  {mine.map((m) => (
                    <div key={m.id} className="preset-card mine ds-card">
                      <button type="button" className="pick" data-my-design={m.name} onClick={() => onApply(m.params as Partial<ParametricParams>, m.name)}>
                        <span className="thumb art" aria-hidden><Bookmark size={34} /></span>
                        <span className="nm">{m.name}</span>
                        <span className="nt">{m.cloud ? "In your account" : "On this device"} · {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </button>
                      <button type="button" className="del" aria-label={`Delete design ${m.name}`} title="Delete design" onClick={() => onRemoveMine(m.id)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ds-empty" role="status">
                  <Bookmark size={28} aria-hidden />
                  <p>No saved designs yet.</p>
                  <p className="ds-sub">Use File › Save as my preset… to keep the current design here and on the start page.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
