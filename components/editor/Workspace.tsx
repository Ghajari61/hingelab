"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import EditorApp from "./EditorApp";
import type { Product } from "./ControlBar";

const LettersEditor = dynamic(() => import("@/components/letters/LettersEditor"), {
  ssr: false,
  loading: () => <div className="boot">Loading Letters…</div>,
});

const PRODUCT_KEY = "hingelab-product";

/** Holds the product choice (Hinge Box or Letters); each product keeps its own autosave. */
export default function Workspace() {
  const [product, setProduct] = useState<Product>(() => {
    try {
      return localStorage.getItem(PRODUCT_KEY) === "letters" ? "letters" : "hinge";
    } catch {
      return "hinge";
    }
  });
  const choose = (p: Product) => {
    setProduct(p);
    try { localStorage.setItem(PRODUCT_KEY, p); } catch { /* private mode */ }
  };
  return product === "letters" ? <LettersEditor onProduct={choose} /> : <EditorApp onProduct={choose} />;
}
