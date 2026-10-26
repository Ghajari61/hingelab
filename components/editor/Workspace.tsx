"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { platform } from "@hingelab/platform";
import { productFromPath, productHref } from "@hingelab/app/routes";
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
import { Onboarding } from "@/components/shell/Onboarding";

// Each product is its own chunk, loaded when it opens.
const LettersEditor = lazy(() => import("@/components/letters/LettersEditor"));
const ParametricEditor = lazy(() => import("@/components/parametric/ParametricEditor"));
const GeneratorEditor = lazy(() => import("@/components/generators/GeneratorEditor"));

const PRODUCT_KEY = "hingelab-product";

function storeProduct(p: Product) {
  try { localStorage.setItem(PRODUCT_KEY, p); } catch { /* private mode */ }
}

const search = () => platform().router.search();

/** The open product is in the path (`/editor/hinge`), or `?p=` on older links, so a reload returns to the editor. */
function urlProduct(): Product | null {
  try {
    const v = (productFromPath(platform().router.path()) ?? search().get("p")) as Product | null;
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
    const q = search();
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

/** The address for the open product (or the start gallery), without the one-time preset, template or AI parameters. */
function setUrlProduct(p: Product | null) {
  const keep = new URLSearchParams(search());
  for (const k of ["preset", "template", "ai", "p", "open", "desktop-open"]) keep.delete(k);
  const [path, own] = productHref(p, platform().kind).split("?");
  const q = new URLSearchParams(own);
  keep.forEach((v, k) => q.set(k, v));
  const rest = q.toString();
  platform().router.navigate(`${path}${rest ? `?${rest}` : ""}${typeof window !== "undefined" && platform().kind === "web" ? window.location.hash : ""}`, { replace: true });
}

/** Drops one parameter from the address. */
function dropParam(name: string) {
  const q = new URLSearchParams(search());
  q.delete(name);
  const rest = q.toString();
  platform().router.navigate(`${platform().router.path()}${rest ? `?${rest}` : ""}${platform().kind === "web" ? window.location.hash : ""}`, { replace: true });
}

const PRODUCT_ID: Record<CoreProduct, ProductId> = { hinge: "hinge-box", letters: "letters", parametric: "parametric" };
const fromId = (id: ProductId): Product => (id === "letters" ? "letters" : id === "parametric" ? "parametric" : "hinge");

/**
 * Guest editor: opens on the Hinge Box unless `?p=` names a product (Home shows the start gallery); each product keeps its own autosave.
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
  // with no product named, the editor opens on the Hinge Box (the product picker in the header switches)
  const [product, setProduct] = useState<Product | null>(() => (doc ? fromId(doc.product) : urlProduct() ?? "hinge"));
  const [start, setStart] = useState<StartChoice | null>(() => (doc ? null : urlPreset(product)));
  // A share link (`#share=…`) opens its design read-only; the decoder loads only for such links.
  const [opening, setOpening] = useState(() => !doc && !!product && /(?:^#|&)share=/.test(window.location.hash));
  // `?open=1`: a project file opened in another section waits in IndexedDB.
  const [handoff, setHandoff] = useState(() => !doc && !!product && search().get("open") === "1");
  useEffect(() => {
    if (!handoff) return;
    dropParam("open");
    void import("@/components/shell/projectFiles").then(async ({ takeHandoff, handoffPreset }) => {
      const h = await takeHandoff();
      if (!h) return;
      setProduct(h.section);
      storeProduct(h.section);
      setUrlProduct(h.section);
      setStart({ product: h.section, preset: handoffPreset(h) as StartChoice["preset"] });
    }, () => {}).finally(() => setHandoff(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // `?desktop-open=1`: the Windows app hands over a project file it opened (Letters, Parametric, Studio).
  const [desktopOpen, setDesktopOpen] = useState<string | null>(() => (!doc && search().get("desktop-open") === "1" ? "Opening the project file…" : null));
  useEffect(() => {
    if (!desktopOpen) return;
    dropParam("desktop-open");
    const w = window as Window & { hingelabDesktopOpen?: (b64: string, name: string) => void };
    const idle = window.setTimeout(() => setDesktopOpen(null), 15000);
    w.hingelabDesktopOpen = (b64, name) => {
      window.clearTimeout(idle);
      delete w.hingelabDesktopOpen;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      void import("@/components/shell/projectFiles")
        .then(({ openProjectFile }) => openProjectFile(new File([bytes], name), null, null, setDesktopOpen))
        .catch(() => setDesktopOpen("That file is not a HingeLab project."));
    };
    return () => { window.clearTimeout(idle); delete w.hingelabDesktopOpen; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!start || doc) return;
    setUrlProduct(start.product);
    try { sessionStorage.removeItem(AI_START_KEY); } catch { /* storage off */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!opening || !product) return;
    void import("@/lib/share").then(({ readShareHash, productName, SHARED_ID }) => {
      const s = readShareHash(window.location.hash, (x) => x === product);
      if (s) {
        const name = typeof s.params.name === "string" && s.params.name.trim() ? s.params.name.trim().slice(0, 80) : productName(product);
        setStart({ product, preset: { id: SHARED_ID, name, note: "Shared design", params: s.params } });
      } else {
        platform().router.navigate(`${platform().router.path()}${search().toString() ? `?${search()}` : ""}`, { replace: true });
      }
    }, () => {}).finally(() => setOpening(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: Product) => {
    if (doc) {
      if (isGeneratorId(p)) { storeProduct(p); platform().router.navigate(productHref(p, platform().kind)); return; }
      if (PRODUCT_ID[p] === doc.product) return;
      void openNewCloudProject(PRODUCT_ID[p]).then((err) => {
        if (err && p === "parametric") { storeProduct(p); platform().router.navigate(productHref("parametric", platform().kind)); }
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
    if (doc) { platform().router.navigate("/projects"); return; }
    setStart(null);
    setProduct(null);
    setUrlProduct(null);
  };

  if (opening) return <div className="boot">Opening the shared design…</div>;
  if (handoff) return <div className="boot">Opening the project file…</div>;
  if (desktopOpen) {
    return (
      <div className="boot" role="status">
        {desktopOpen}
        {!desktopOpen.startsWith("Opening") && <button type="button" className="linklike" onClick={() => setDesktopOpen(null)}>Continue</button>}
      </div>
    );
  }
  if (!product) return <StartGallery onPick={pick} />;
  const preset = start?.product === product ? start.preset : undefined;
  const key = `${product}|${preset?.id ?? "autosave"}`;
  const boot = <div className="boot">Loading{product === "letters" ? " Letters" : product === "parametric" ? " Parametric" : ""}…</div>;
  const editor = isGeneratorId(product)
    ? <Suspense fallback={boot}><GeneratorEditor key={key} id={product} onProduct={choose} onHome={home} start={preset} /></Suspense>
    : product === "parametric"
      ? <Suspense fallback={boot}><ParametricEditor key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} /></Suspense>
      : product === "letters"
        ? <Suspense fallback={boot}><LettersEditor key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} /></Suspense>
        : <EditorApp key={key} onProduct={choose} onHome={home} start={preset} cloud={doc} />;
  return <>{editor}<Onboarding /></>;
}
