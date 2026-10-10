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

const PRODUCT_KEY = "hingelab-product";

/**
 * Guest editor: holds the product choice (Hinge Box or Letters); each product keeps its own autosave.
 * Cloud project: the product is fixed by the project; switching products starts a new cloud project.
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
      return localStorage.getItem(PRODUCT_KEY) === "letters" ? "letters" : "hinge";
    } catch {
      return "hinge";
    }
  });
  const choose = (p: Product) => {
    if (doc) {
      if ((p === "letters") !== (doc.product === "letters")) void openNewCloudProject(p === "letters" ? "letters" : "hinge-box");
      return;
    }
    setProduct(p);
    try { localStorage.setItem(PRODUCT_KEY, p); } catch { /* private mode */ }
  };
  return product === "letters"
    ? <LettersEditor onProduct={choose} cloud={doc} />
    : <EditorApp onProduct={choose} cloud={doc} />;
}
