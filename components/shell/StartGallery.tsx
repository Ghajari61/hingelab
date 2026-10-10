"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { PRODUCT_INFO, type Product } from "@/components/editor/ControlBar";
import { sceneSVG } from "@/components/editor/scene3d";
import { HINGE_KEY, readStored } from "@/hooks/useAutosave";
import { computeModel, mergeParams } from "@/lib/hinge";
import { HINGE_PRESETS } from "@/lib/hinge/presets";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import { hingeLocks, lettersLock, parametricLocks } from "@/lib/plans";
import type { Preset } from "@/lib/presets";
import { ART } from "./cardArt";

export const PRODUCT_KEYS: Record<Product, string> = { hinge: HINGE_KEY, letters: "hingelab-letters-v2", parametric: "hingelab-parametric-v1" };

const BLURB: Record<Product, string> = {
  hinge: "Rounded, round and many-sided boxes with living-hinge walls.",
  letters: "Letter boxes, solid signs and stencils from any text.",
  parametric: "Sliced sculptures: fins, layers, waffles and clocks.",
};

type AnyPreset = Preset<Record<string, unknown>>;
export type StartChoice = { product: Product; preset?: AnyPreset };

function hingeThumb(p: AnyPreset): string {
  const params = mergeParams(p.params as Parameters<typeof mergeParams>[0]);
  const m = computeModel(params);
  return "error" in m ? "" : sceneSVG(m, params, -0.6, params.lid === "removable" ? 0.35 : 0);
}

function artFor(product: Product, p: AnyPreset): ReactNode {
  const q = p.params as Record<string, unknown>;
  if (product === "letters") return ART[`mode:${(q.mode as string) ?? "box"}`];
  return ART[`method:${(q.method as string) ?? "parallel"}`];
}

function isPro(product: Product, p: AnyPreset): boolean {
  const q = p.params as Record<string, unknown>;
  if (product === "hinge") return hingeLocks("free", mergeParams(q)).length > 0;
  if (product === "letters") return lettersLock("free", { mode: (q.mode as string) ?? "solid", text: (q.text as string) ?? "" }) !== null;
  return parametricLocks("free", { source: (q.source as { kind: string }) ?? { kind: "library" }, method: (q.method as string) ?? "parallel" }).length > 0;
}

/** First screen of the guest editor: pick a product (continue its autosave) or start from a preset. */
export function StartGallery({ onPick }: { onPick: (choice: StartChoice) => void }) {
  const saved = useMemo(() => {
    const out = {} as Record<Product, string | null>;
    for (const k of Object.keys(PRODUCT_KEYS) as Product[]) {
      const s = readStored<{ name?: string }>(PRODUCT_KEYS[k]);
      out[k] = s?.params ? (s.params.name as string | undefined) ?? "Untitled" : null;
    }
    return out;
  }, []);
  const lists: [Product, AnyPreset[]][] = [
    ["hinge", HINGE_PRESETS as unknown as AnyPreset[]],
    ["letters", LETTER_PRESETS as unknown as AnyPreset[]],
    ["parametric", PARAMETRIC_PRESETS as unknown as AnyPreset[]],
  ];
  const thumbs = useMemo(() => Object.fromEntries(HINGE_PRESETS.map((p) => [p.id, hingeThumb(p as unknown as AnyPreset)])), []);

  return (
    <div className="start">
      <header className="start-head">
        <a className="logo" href="/" aria-label="HingeLab home"><LogoMark size={26} />HingeLab</a>
        <UserMenu />
      </header>
      <main className="start-main">
        <h1>What would you like to make?</h1>
        <p className="start-sub">Pick a product to continue where you left off, or start from a preset below.</p>
        <div className="start-products">
          {(Object.keys(PRODUCT_INFO) as Product[]).map((k) => (
            <button key={k} type="button" className="start-tile" aria-label={PRODUCT_INFO[k].name} onClick={() => onPick({ product: k })}>
              <span className="ico" aria-hidden>{PRODUCT_INFO[k].icon}</span>
              <span className="nm">{PRODUCT_INFO[k].name}</span>
              <span className="bl">{BLURB[k]}</span>
              <span className="go">{saved[k] ? <>Continue “{saved[k]}”</> : "Start designing"}<ArrowRight size={14} aria-hidden /></span>
            </button>
          ))}
        </div>
        {lists.map(([product, list]) => (
          <section key={product} className="start-presets" aria-label={`${PRODUCT_INFO[product].name} presets`}>
            <h2>{PRODUCT_INFO[product].icon}{PRODUCT_INFO[product].name} presets</h2>
            <div className="preset-grid">
              {list.map((p) => (
                <button key={p.id} type="button" className="preset-card" data-preset={p.id} onClick={() => onPick({ product, preset: p })}>
                  {product === "hinge"
                    ? <span className="thumb" aria-hidden dangerouslySetInnerHTML={{ __html: thumbs[p.id] }} />
                    : <span className="thumb art" aria-hidden>{artFor(product, p)}</span>}
                  <span className="nm">{p.name}{isPro(product, p) && <span className="pro-badge">Pro</span>}</span>
                  <span className="nt">{p.note}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
