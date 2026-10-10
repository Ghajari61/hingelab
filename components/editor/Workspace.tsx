"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import EditorApp from "./EditorApp";
import type { Product } from "./ControlBar";
import { readLocalCopy, type CloudDoc } from "@/hooks/useCloudAutosave";
import { chooseInitial } from "@/lib/projects/sync";
import { openNewCloudProject } from "./cloud";
import type { ProductId } from "@/lib/supabase/types";
import { StartGallery, type StartChoice } from "@/components/shell/StartGallery";

const LettersEditor = dynamic(() => import("@/components/letters/LettersEditor"), {
  ssr: false,
  loading: () => <div className="boot">Loading Letters…</div>,
});

const ParametricEditor = dynamic(() => import("@/components/parametric/ParametricEditor"), {
  ssr: false,
  loading: () => <div className="boot">Loading Parametric…</div>,
});

const PRODUCT_KEY = "hingelab-product";
const PRODUCTS: Product[] = ["hinge", "letters", "parametric"];

function storeProduct(p: Product) {
  try { localStorage.setItem(PRODUCT_KEY, p); } catch { /* private mode */ }
}

/** The open product is kept in `?p=` so a reload returns to the editor instead of the start page. */
function urlProduct(): Product | null {
  try {
    const v = new URLSearchParams(window.location.search).get("p") as Product | null;
    return v && PRODUCTS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function setUrlProduct(p: Product | null) {
  const u = new URL(window.location.href);
  if (p) u.searchParams.set("p", p); else u.searchParams.delete("p");
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
}

const PRODUCT_ID: Record<Product, ProductId> = { hinge: "hinge-box", letters: "letters", parametric: "parametric" };
const fromId = (id: ProductId): Product => (id === "letters" ? "letters" : id === "parametric" ? "parametric" : "hinge");

/**
 * Guest editor: opens on the start gallery unless `?p=` names a product; each product keeps its own autosave.
 * Cloud project: the product is fixed by the project; switching products starts a new cloud project.
 * Parametric cloud projects are Pro; when the plan refuses one, Parametric opens in the guest editor.
 */
export default function Workspace({ cloud = null }: { cloud?: CloudDoc | null }) {
  const [doc] = useState<CloudDoc | null>(() => {
    if (!cloud) return null;
    const choice = chooseInitial(readLocalCopy<Record<string, unknown>>(cloud.id), { params: cloud.params, updated_at: cloud.updatedAt });
    return { ...cloud, params: choice.params, push: choice.push };
  });
  const [product, setProduct] = useState<Product | null>(() => (doc ? fromId(doc.product) : urlProduct()));
  const [start, setStart] = useState<StartChoice | null>(null);

  const choose = (p: Product) => {
    if (doc) {
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
  const key = preset?.id ?? "autosave";
  if (product === "parametric") return <ParametricEditor key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />;
  return product === "letters"
    ? <LettersEditor key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />
    : <EditorApp key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />;
}
