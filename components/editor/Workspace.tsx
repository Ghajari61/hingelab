"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import EditorApp from "./EditorApp";
import { ALL_PRODUCTS, type CoreProduct, type Product } from "./ControlBar";
import { readLocalCopy, type CloudDoc } from "@/hooks/useCloudAutosave";
import { chooseInitial } from "@/lib/projects/sync";
import { openNewCloudProject } from "./cloud";
import type { ProductId } from "@/lib/supabase/types";
import { isGeneratorId } from "@/lib/generators/ids";
import { START_LAZY, START_PRESETS } from "@/lib/generators/startPresets";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import { AI_START_KEY } from "@/lib/ai/types";
import { StartGallery, type StartChoice } from "@/components/shell/StartGallery";

const LettersEditor = dynamic(() => import("@/components/letters/LettersEditor"), {
  ssr: false,
  loading: () => <div className="boot">Loading Letters…</div>,
});

const ParametricEditor = dynamic(() => import("@/components/parametric/ParametricEditor"), {
  ssr: false,
  loading: () => <div className="boot">Loading Parametric…</div>,
});

const GeneratorEditor = dynamic(() => import("@/components/generators/GeneratorEditor"), {
  ssr: false,
  loading: () => <div className="boot">Loading…</div>,
});

const PRODUCT_KEY = "hingelab-product";

function storeProduct(p: Product) {
  try { localStorage.setItem(PRODUCT_KEY, p); } catch { /* private mode */ }
}

/** The open product is kept in `?p=` so a reload returns to the editor instead of the start page. */
function urlProduct(): Product | null {
  try {
    const v = new URLSearchParams(window.location.search).get("p") as Product | null;
    return v && ALL_PRODUCTS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** The design the AI designer left in this tab for product `p`. */
function aiStart(p: Product): StartChoice | null {
  const s = JSON.parse(sessionStorage.getItem(AI_START_KEY) ?? "null") as StartChoice | null;
  return s?.product === p && s.preset && typeof s.preset.params === "object" ? s : null;
}

/**
 * `?p=<generator>&preset=<id>` (links from the site) opens that built-in preset once;
 * `?p=<product>&template=<id>` opens a template's settings from the template library;
 * `?p=<product>&ai=1` opens the AI designer's result.
 */
function urlPreset(p: Product | null): StartChoice | null {
  if (!p) return null;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("ai") === "1") return aiStart(p);
    const tid = q.get("template");
    const t = tid && Object.prototype.hasOwnProperty.call(TEMPLATE_PRESETS, tid) ? TEMPLATE_PRESETS[tid] : undefined;
    if (t && t.product === p) return { product: p, preset: { id: `template-${tid}`, name: t.name, note: t.note, params: t.params } };
    if (!isGeneratorId(p)) return null;
    const id = q.get("preset");
    if (!id) return null;
    const preset = START_PRESETS[p].find((x) => x.id === id);
    if (preset) return { product: p, preset: preset as StartChoice["preset"] };
    // Presets the shell does not carry are looked up by id once the generator loads.
    return START_LAZY[p] && /^[a-z0-9-]{1,60}$/.test(id) ? { product: p, preset: { id, name: id, note: "", params: {} } } : null;
  } catch {
    return null;
  }
}

function setUrlProduct(p: Product | null) {
  const u = new URL(window.location.href);
  u.searchParams.delete("preset");
  u.searchParams.delete("template");
  u.searchParams.delete("ai");
  if (p) u.searchParams.set("p", p); else u.searchParams.delete("p");
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
}

const PRODUCT_ID: Record<CoreProduct, ProductId> = { hinge: "hinge-box", letters: "letters", parametric: "parametric" };
const fromId = (id: ProductId): Product => (id === "letters" ? "letters" : id === "parametric" ? "parametric" : "hinge");

/**
 * Guest editor: opens on the start gallery unless `?p=` names a product; each product keeps its own autosave.
 * Cloud project: the product is fixed by the project; switching products starts a new cloud project.
 * Parametric cloud projects are Pro; when the plan refuses one, Parametric opens in the guest editor.
 * Generators design on the device, so picking one from a cloud project opens the guest editor.
 */
export default function Workspace({ cloud = null }: { cloud?: CloudDoc | null }) {
  const [doc] = useState<CloudDoc | null>(() => {
    if (!cloud) return null;
    const choice = chooseInitial(readLocalCopy<Record<string, unknown>>(cloud.id), { params: cloud.params, updated_at: cloud.updatedAt });
    return { ...cloud, params: choice.params, push: choice.push };
  });
  const [product, setProduct] = useState<Product | null>(() => (doc ? fromId(doc.product) : urlProduct()));
  const [start, setStart] = useState<StartChoice | null>(() => (doc ? null : urlPreset(product)));
  useEffect(() => {
    if (!start || doc) return;
    setUrlProduct(start.product);
    try { sessionStorage.removeItem(AI_START_KEY); } catch { /* storage off */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: Product) => {
    if (doc) {
      if (isGeneratorId(p)) { storeProduct(p); window.location.assign(`/app/editor/local?p=${p}`); return; }
      if (PRODUCT_ID[p] === doc.product) return;
      void openNewCloudProject(PRODUCT_ID[p]).then((err) => {
        if (err && p === "parametric") { storeProduct(p); window.location.assign("/app/editor/local?p=parametric"); }
      });
      return;
    }
    setStart(null);
    setProduct(p);
    storeProduct(p);
    setUrlProduct(p);
  };
  const pick = (c: StartChoice) => {
    setStart(c.preset ? c : null);
    setProduct(c.product);
    storeProduct(c.product);
    setUrlProduct(c.product);
  };
  const home = () => {
    if (doc) { window.location.assign("/app"); return; }
    setStart(null);
    setProduct(null);
    setUrlProduct(null);
  };

  if (!product) return <StartGallery onPick={pick} />;
  const preset = start?.product === product ? start.preset : undefined;
  const key = `${product}|${preset?.id ?? "autosave"}`;
  if (isGeneratorId(product)) return <GeneratorEditor key={key} id={product} onProduct={choose} onHome={home} start={preset} />;
  if (product === "parametric") return <ParametricEditor key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />;
  return product === "letters"
    ? <LettersEditor key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />
    : <EditorApp key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />;
}
