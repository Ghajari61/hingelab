"use client";

import type { Lid } from "@/lib/hinge";
import type { LetterMode, WallStyle } from "@/lib/letters";
import { LETTER_DEFAULTS } from "@/lib/letters/defaults";
import { LID_OPTS, type Opt } from "@/components/editor/ControlBar";
import type { GalleryGroup } from "@/components/shell/GalleryRail";

/** Letters gallery: mode, and for letter boxes the wall style and lid. */
export function lettersGroups({ mode, wallStyle, lid, pro = true, onMode, onWallStyle, onLid }: {
  mode: LetterMode;
  /** Free plan: only a single-letter box exports, so Solid and Stencil show a lock. */
  pro?: boolean;
  wallStyle: WallStyle;
  lid: Lid;
  onMode: (m: LetterMode) => void;
  onWallStyle: (w: WallStyle) => void;
  onLid: (l: Lid) => void;
}): GalleryGroup[] {
  const modes: Opt[] = [
    { v: "box", text: "Letter Box", title: "Every letter becomes a box: a base and a lid in the letter's shape, joined by walls", onClick: () => onMode("box") },
    { v: "solid", text: "Solid", title: "Flat cut-out letters", onClick: () => onMode("solid") },
    { v: "stencil", text: "Stencil", title: "Letters cut out of a sheet, with bridges that hold the letter centres", onClick: () => onMode("stencil") },
  ].map((o) => ({ ...o, locked: !pro && o.v !== "box" }));
  const walls: Opt[] = [
    { v: "hinge", text: "Living hinge", title: "One bendable strip per outline, with hinge cuts where the letter curves", onClick: () => onWallStyle("hinge") },
    { v: "faceted", text: "Flat panels", title: "Straight panels joined at the corners; curves become short flat sides", onClick: () => onWallStyle("faceted") },
  ];
  const groups: GalleryGroup[] = [{ label: "Mode", name: "Letters mode", art: "mode", value: mode, options: modes, cols: 3, home: LETTER_DEFAULTS.mode }];
  if (mode === "box") {
    groups.push(
      { label: "Walls", name: "Wall style", art: "wall", pics: "letters-wall", value: wallStyle, options: walls, home: LETTER_DEFAULTS.wallStyle },
      { label: "Lid", name: "Lid type", art: "lid", pics: "letters-lid", value: lid, options: LID_OPTS((v) => onLid(v as Lid)), cols: 3, home: LETTER_DEFAULTS.lid },
    );
  }
  return groups;
}
