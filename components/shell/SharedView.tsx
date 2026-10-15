"use client";

import { useState, type ReactNode } from "react";
import { Eye, Shuffle } from "lucide-react";
import { SHARED_ID } from "@/lib/share/id";

/**
 * A design opened from a share link is shown read-only: nothing is autosaved over the visitor's own
 * design and the panels are inert until they press Remix, which makes it their design here.
 */
export function useSharedView(start: { id: string } | undefined, name: string, toast: (msg: string) => void): { viewing: boolean; banner: ReactNode } {
  const [viewing, setViewing] = useState(() => start?.id === SHARED_ID);
  const clearHash = () => {
    const u = new URL(window.location.href);
    u.hash = "";
    window.history.replaceState(window.history.state, "", u.pathname + u.search);
  };
  const remix = () => {
    setViewing(false);
    clearHash();
    toast(`Remixing “${name}”: it is your design here now. Ctrl+Z returns to your last design.`);
  };
  const leave = () => {
    clearHash();
    window.location.reload();
  };
  const banner = viewing ? (
    <div className="share-bar" role="region" aria-label="Shared design">
      <Eye size={16} aria-hidden />
      <span>Shared design <b dir="auto">“{name}”</b>, view only. Look round it in 2D and 3D; remix it to make it yours.</span>
      <button type="button" className="btn-export" onClick={remix}><Shuffle size={15} aria-hidden />Remix</button>
      <button type="button" className="btn-ghost-sm" onClick={leave}>Back to my design</button>
    </div>
  ) : null;
  return { viewing, banner };
}
