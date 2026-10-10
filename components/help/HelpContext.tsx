"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CircleHelp, ExternalLink, X } from "lucide-react";
import { RAIL_HELP, SECTION_HELP, TIPS_HELP, type HelpProduct } from "@/lib/help/sections";
import type { MenuEntry } from "@/components/editor/MenuBar";

const NAMES: Record<HelpProduct, string> = { hinge: "the Hinge Box", letters: "Letters", parametric: "Parametric" };

/** The editor's help panel: the context for "?" marks, Help menu entries and the drawer itself. */
export function useHelpPanel(product: HelpProduct) {
  const [slug, setSlug] = useState<string | null>(null);
  const ctx = useMemo(() => ({ product, open: setSlug }), [product]);
  const close = useCallback(() => setSlug(null), []);
  const menu: MenuEntry[] = [
    { label: "Help centre", kbd: "", run: () => { window.open("/help", "_blank", "noopener"); } },
    { label: `Tips for ${NAMES[product]}`, kbd: "", run: () => setSlug(TIPS_HELP[product]) },
  ];
  return { ctx, menu, drawer: slug ? <HelpDrawer slug={slug} onClose={close} /> : null };
}

/** Set by each editor, so panel sections can open their help article. */
export const HelpContext = createContext<{ product: HelpProduct; open: (slug: string) => void } | null>(null);

/** A "?" that opens the article for a dock section (`kind: "section"`) or a left-rail group. */
export function HelpMark({ title, kind = "section" }: { title: string; kind?: "section" | "rail" }) {
  const help = useContext(HelpContext);
  const slug = help && (kind === "rail" ? RAIL_HELP : SECTION_HELP)[help.product][title];
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
