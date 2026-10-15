"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OPEN_ACCEPT } from "@/lib/projects/ext";
import { ArrowRight, Bookmark, Shapes, Trash2 } from "lucide-react";
import type { PresetProduct } from "@/lib/userPresets";
import { useMyPresets } from "./useMyPresets";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { ALL_PRODUCTS, CORE_PRODUCTS, PRODUCT_INFO, type Product } from "@/components/editor/ControlBar";
import { HINGE_KEY, readStored } from "@/hooks/useAutosave";
import { HINGE_PRESETS, hingePresetParams } from "@/lib/hinge/presets";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import { PRESET_PARTS } from "@/lib/parametric/presetParts";
import { GENERATOR_IDS, GENERATOR_INFO, isGeneratorId, type GeneratorId } from "@/lib/generators/ids";
import { START_LAZY, START_PRESETS, type LazyStart } from "@/lib/generators/startPresets";
import { hingeLocks, lettersLock, parametricLocks } from "@/lib/plans";
import type { Preset } from "@/lib/presets";

export const PRODUCT_KEYS: Record<Product, string> = {
  hinge: HINGE_KEY, letters: "hingelab-letters-v2", parametric: "hingelab-parametric-v1",
  ...(Object.fromEntries(GENERATOR_IDS.map((id) => [id, GENERATOR_INFO[id].storageKey])) as Record<(typeof GENERATOR_IDS)[number], string>),
};

const BLURB: Record<Product, string> = {
  hinge: "Rounded, round and many-sided boxes with living-hinge walls.",
  letters: "Letter boxes, solid signs and stencils from any text.",
  parametric: "Sliced sculptures: fins, layers, waffles and clocks.",
  ...(Object.fromEntries(GENERATOR_IDS.map((id) => [id, GENERATOR_INFO[id].blurb])) as Record<(typeof GENERATOR_IDS)[number], string>),
};

const fromPresetProduct = (id: PresetProduct): Product => (id === "hinge-box" ? "hinge" : id);

type AnyPreset = Preset<Record<string, unknown>>;
export type StartChoice = { product: Product; preset?: AnyPreset };

function isPro(product: Product, p: AnyPreset): boolean {
  if (isGeneratorId(product)) return !!(p as AnyPreset & { pro?: boolean }).pro;
  const q = p.params as Record<string, unknown>;
  if (product === "hinge") return hingeLocks("free", hingePresetParams(q)).length > 0;
  if (product === "letters") return lettersLock("free", { mode: (q.mode as string) ?? "solid", text: (q.text as string) ?? "" }) !== null;
  return parametricLocks("free", { source: (q.source as { kind: string }) ?? { kind: "library" }, method: (q.method as string) ?? "parallel" }, PRESET_PARTS[p.id]).length > 0;
}

/** First screen of the guest editor: pick a product (continue its autosave) or start from a preset. */
export function StartGallery({ onPick }: { onPick: (choice: StartChoice) => void }) {
  const saved = useMemo(() => {
    const out = {} as Record<Product, string | null>;
    for (const k of ALL_PRODUCTS) {
      const s = readStored<{ name?: string }>(PRODUCT_KEYS[k]);
      out[k] = s?.params ? (s.params.name as string | undefined) ?? "Untitled" : null;
    }
    return out;
  }, []);
  const [late, setLate] = useState<Partial<Record<GeneratorId, AnyPreset[]>>>({});
  useEffect(() => {
    let live = true;
    for (const [id, l] of Object.entries(START_LAZY) as [GeneratorId, LazyStart][]) {
      l.load().then((list) => { if (live) setLate((s) => ({ ...s, [id]: list as unknown as AnyPreset[] })); }, () => {});
    }
    return () => { live = false; };
  }, []);
  const lists: [Product, AnyPreset[]][] = [
    ["hinge", HINGE_PRESETS as unknown as AnyPreset[]],
    ["letters", LETTER_PRESETS as unknown as AnyPreset[]],
    ["parametric", PARAMETRIC_PRESETS as unknown as AnyPreset[]],
    ...GENERATOR_IDS.map((id) => [id, late[id] ?? (START_PRESETS[id] as unknown as AnyPreset[])] as [Product, AnyPreset[]]),
  ];
  const cover = (k: GeneratorId) => START_LAZY[k]?.cover ?? START_PRESETS[k][0]?.id;
  const mine = useMyPresets();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const noteT = useRef(0);
  const say = (m: string) => { setNote(m); window.clearTimeout(noteT.current); noteT.current = window.setTimeout(() => setNote(null), 3200); };
  async function openFrom(f: File, h: FileSystemFileHandle | null) {
    const { openProjectFile } = await import("./projectFiles");
    await openProjectFile(f, h, null, say).catch(() => say("That file is not a HingeLab project."));
  }
  async function openFile() {
    const pf = await import("./projectFiles");
    if (pf.canKeepFiles()) {
      try {
        const h = await pf.pickOpenHandle();
        if (h) await openFrom(await h.getFile(), h);
        return;
      } catch { /* fall back to the file input */ }
    }
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  }
  const go = (k: Product) => (saved[k] ? <>Continue “{saved[k]}”</> : "Start designing");

  return (
    <div className="start">
      <header className="start-head">
        <a className="logo" href="/" aria-label="HingeLab home"><LogoMark size={26} />HingeLab</a>
        <UserMenu />
      </header>
      <main className="start-main">
        <h1>What would you like to make?</h1>
        <p className="start-sub">
          Pick a product to continue where you left off, start from a preset below, <a href="/app/ai">describe it to the AI designer</a>, or{" "}
          <button type="button" className="linklike" onClick={() => void openFile()}>open a project file</button>.
        </p>
        <input ref={fileRef} type="file" accept={OPEN_ACCEPT} hidden aria-label="Open a project file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFrom(f, null); }} />
        {note && <div className="toast" role="status">{note}</div>}
        <div className="start-products">
          {CORE_PRODUCTS.map((k) => (
            <button key={k} type="button" className="start-tile" aria-label={PRODUCT_INFO[k].name} onClick={() => onPick({ product: k })}>
              <span className="ico" aria-hidden>{PRODUCT_INFO[k].icon}</span>
              <span className="nm">{PRODUCT_INFO[k].name}</span>
              <span className="bl">{BLURB[k]}</span>
              <span className="go">{go(k)}<ArrowRight size={14} aria-hidden /></span>
            </button>
          ))}
        </div>
        <section className="start-gens" aria-label="Generators">
          <h2><Shapes size={16} aria-hidden />Generators</h2>
          <div className="gen-tiles">
            {GENERATOR_IDS.map((k) => (
              <button key={k} type="button" className="gen-tile" aria-label={PRODUCT_INFO[k].name} onClick={() => onPick({ product: k })}>
                {cover(k) && <span className="pic" aria-hidden><img src={`/presets/${k}/${cover(k)}.svg`} alt="" loading="lazy" width={300} height={200} /></span>}
                <span className="ico" aria-hidden>{PRODUCT_INFO[k].icon}</span>
                <span className="nm">{PRODUCT_INFO[k].name}</span>
                <span className="bl">{BLURB[k]}</span>
                <span className="go">{go(k)}<ArrowRight size={13} aria-hidden /></span>
              </button>
            ))}
          </div>
        </section>
        {mine.list.length > 0 && (
          <section className="start-presets" aria-label="My presets">
            <h2><Bookmark size={16} aria-hidden />My presets</h2>
            <div className="preset-grid">
              {mine.list.map((m) => {
                const product = fromPresetProduct(m.product);
                return (
                  <div key={m.id} className="preset-card mine">
                    <button type="button" className="pick" data-my-preset={m.name} onClick={() => onPick({ product, preset: { id: m.id, name: m.name, note: "", params: m.params } })}>
                      <span className="thumb art" aria-hidden><span className="mine-ico">{PRODUCT_INFO[product].icon}</span></span>
                      <span className="nm">{m.name}</span>
                      <span className="nt">{PRODUCT_INFO[product].name}{m.cloud ? " · in your account" : " · this device"}</span>
                    </button>
                    <button type="button" className="del" aria-label={`Delete preset ${m.name}`} title="Delete preset" onClick={() => void mine.remove(m.id)}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {lists.filter(([, list]) => list.length > 0).map(([product, list]) => (
          <section key={product} className="start-presets" aria-label={`${PRODUCT_INFO[product].name} presets`}>
            <h2>{PRODUCT_INFO[product].icon}{PRODUCT_INFO[product].name} presets</h2>
            <div className="preset-grid">
              {list.map((p) => (
                <button key={p.id} type="button" className="preset-card" data-preset={p.id} onClick={() => onPick({ product, preset: p })}>
                  <span className="thumb" aria-hidden><img src={`/presets/${product}/${p.id}.svg`} alt="" loading="lazy" width={300} height={200} /></span>
                  <span className="nm">{p.name}{isPro(product, p) && <span className="pro-badge">Pro</span>}</span>
                  <span className="nt">{p.note}</span>
                </button>
              ))}
            </div>
            {isGeneratorId(product) && START_LAZY[product] && (
              <p className="start-more">
                {START_LAZY[product].count} designs in all, in the editor&apos;s Presets panel.{" "}
                <button type="button" onClick={() => onPick({ product })}>Open {PRODUCT_INFO[product].name}<ArrowRight size={13} aria-hidden /></button>
              </p>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
