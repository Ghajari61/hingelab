"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import EditorApp from "./EditorApp";
import type { Product } from "./ControlBar";
import { readLocalCopy, type CloudDoc } from "@/hooks/useCloudAutosave";
import { chooseInitial } from "@/lib/projects/sync";
import { openNewCloudProject } from "./cloud";

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

/**
 * Guest editor: holds the product choice (Hinge Box, Letters or Parametric); each product keeps its own autosave.
 * Cloud project: the product is fixed by the project; switching products starts a new cloud project.
 * Parametric is not saved to the cloud yet, so choosing it there opens the guest editor.
 */
export default function Workspace({ cloud = null }: { cloud?: CloudDoc | null }) {
  const [doc] = useState<CloudDoc | null>(() => {
    if (!cloud) return null;
    const choice = chooseInitial(readLocalCopy<Record<string, unknown>>(cloud.id), { params: cloud.params, updated_at: cloud.updatedAt });
    return { ...cloud, params: choice.params, push: choice.push };
  });
  const [product, setProduct] = useState<Product>(() => {
    if (doc) return doc.product === "letters" ? "letters" : "hinge";
    try {
      const v = localStorage.getItem(PRODUCT_KEY) as Product | null;
      return v && PRODUCTS.includes(v) ? v : "hinge";
    } catch {
      return "hinge";
    }
  });
  const choose = (p: Product) => {
    if (doc) {
      if (p === "parametric") { storeProduct(p); window.location.assign("/app/editor/local"); return; }
      if ((p === "letters") !== (doc.product === "letters")) void openNewCloudProject(p === "letters" ? "letters" : "hinge-box");
      return;
    }
    setProduct(p);
    storeProduct(p);
  };
  if (product === "parametric") return <ParametricEditor onProduct={choose} />;
  return product === "letters"
    ? <LettersEditor onProduct={choose} cloud={doc} />
    : <EditorApp onProduct={choose} cloud={doc} />;
}
