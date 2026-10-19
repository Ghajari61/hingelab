"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CircleHelp, ExternalLink, X } from "lucide-react";
import { RAIL_HELP, SECTION_HELP, TIPS_HELP, type HelpProduct } from "@/lib/help/sections";
import { platform } from "@hingelab/platform";
import type { MenuEntry } from "@/components/editor/MenuBar";

const NAMES: Record<HelpProduct, string> = { hinge: "the Hinge Box", letters: "Letters", parametric: "Parametric" };

/** Where a product's help lives: section and rail headings to article slugs, and its tips article. */
export interface HelpMap {
  name: string;
  section: Record<string, string>;
  rail: Record<string, string>;
  tips: string;
}

const mapOf = (p: HelpProduct): HelpMap => ({ name: NAMES[p], section: SECTION_HELP[p], rail: RAIL_HELP[p], tips: TIPS_HELP[p] });

/** The editor's help panel: the context for "?" marks, Help menu entries and the drawer itself. */
export function useHelpPanel(product: HelpProduct | HelpMap) {
  const [slug, setSlug] = useState<string | null>(null);
  const map = useMemo(() => (typeof product === "string" ? mapOf(product) : product), [product]);
  // The Windows app shows website pages in the browser (its window loads only its own files).
  const open = useCallback((s: string) => (platform().kind === "web" ? setSlug(s) : void platform().openExternal(`/help/${s}`).catch(() => {})), []);
  const ctx = useMemo(() => ({ map, open }), [map, open]);
  const close = useCallback(() => setSlug(null), []);
  const menu: MenuEntry[] = [
    { label: "Help centre", kbd: "", run: () => { if (platform().kind === "web") window.open("/help", "_blank", "noopener"); else void platform().openExternal("/help").catch(() => {}); } },
    { label: `Tips for ${map.name}`, kbd: "", run: () => open(map.tips) },
  ];
  return { ctx, menu, drawer: slug ? <HelpDrawer slug={slug} onClose={close} /> : null };
}

/** Set by each editor, so panel sections can open their help article. */
export const HelpContext = createContext<{ map: HelpMap; open: (slug: string) => void } | null>(null);

/** A "?" that opens the article for a dock section (`kind: "section"`) or a left-rail group. */
export function HelpMark({ title, kind = "section" }: { title: string; kind?: "section" | "rail" }) {
  const help = useContext(HelpContext);
  const slug = help && help.map[kind][title];
  if (!help || !slug) return null;
  return (
    <button
      type="button" className="help-mark" aria-label={`Help: ${title}`} title={`Help: ${title}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); help.open(slug); }}
    ><CircleHelp size={13} aria-hidden /></button>
  );
}

/** The help article beside the editor, without leaving it. */
export function HelpDrawer({ slug, onClose }: { slug: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className="help-drawer" role="dialog" aria-label="Help">
      <div className="help-drawer-head">
        <CircleHelp size={16} aria-hidden /><span>Help</span>
        <a href={`/help/${slug}`} target="_blank" rel="noopener" className="hdr-btn" title="Open in the help centre" aria-label="Open in the help centre"><ExternalLink size={15} /></a>
        <button type="button" className="hdr-btn" aria-label="Close help" title="Close (Esc)" onClick={onClose}><X size={16} /></button>
      </div>
      <iframe key={slug} src={`/help/embed/${slug}`} title="Help article" />
    </aside>
  );
}
