"use client";

import type { Lid } from "@/lib/hinge";
import type { LetterMode, WallStyle } from "@/lib/letters";
import { ProductTabs, Seg, type Opt, type Product } from "@/components/editor/ControlBar";

export function LettersControlBar({ mode, wallStyle, lid, onMode, onWallStyle, onLid, onProduct }: {
  mode: LetterMode;
  wallStyle: WallStyle;
  lid: Lid;
  onMode: (m: LetterMode) => void;
  onWallStyle: (w: WallStyle) => void;
  onLid: (l: Lid) => void;
  onProduct: (p: Product) => void;
}) {
  const modes: Opt[] = [
    { v: "box", text: "Letter Box", title: "Every letter becomes a box: a base and a lid in the letter's shape, joined by walls", onClick: () => onMode("box"),
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M3 13.5L8 2.5l5 11M5 9.5h6" /><path d="M2.5 13.5h3M10.5 13.5h3" strokeDasharray="1 1.2" /></svg> },
    { v: "solid", text: "Solid", title: "Flat cut-out letters", onClick: () => onMode("solid"),
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.6 2h2.8l4.4 12h-2.9l-.9-2.6H6l-.9 2.6H2.2zM8 5.4L6.7 9.2h2.6z" /></svg> },
    { v: "stencil", text: "Stencil", title: "Letters cut out of a sheet, with bridges that hold the letter centres", onClick: () => onMode("stencil"),
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" /><path d="M5 12l3-8 3 8M6.2 9h3.6" /></svg> },
  ];
  const walls: Opt[] = [
    { v: "hinge", text: "Living hinge", title: "One bendable strip per outline, with hinge cuts where the letter curves", onClick: () => onWallStyle("hinge"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 1v5M3 8v5M7 1v12M11 1v5M11 8v5M15 1v12" /></svg> },
    { v: "faceted", text: "Flat panels", title: "Straight panels joined at the corners; curves become short flat sides", onClick: () => onWallStyle("faceted"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M2 12.5V5l4-3.5h6L16 5v7.5z" /></svg> },
  ];
  const lids: Opt[] = [
    { v: "open", text: "Open tray", onClick: () => onLid("open") },
    { v: "fixed", text: "Fixed lid", onClick: () => onLid("fixed") },
    { v: "removable", text: "Removable lid", onClick: () => onLid("removable") },
  ];
  return (
    <div className="controlbar">
      <Seg label="Mode" name="Letters mode" value={mode} options={modes} />
      {mode === "box" && (
        <>
          <div className="cb-sep" />
          <Seg label="Walls" name="Wall style" value={wallStyle} options={walls} />
          <div className="cb-sep" />
          <Seg label="Lid" name="Lid type" value={lid} options={lids} />
        </>
      )}
      <ProductTabs product="letters" onProduct={onProduct} />
    </div>
  );
}
