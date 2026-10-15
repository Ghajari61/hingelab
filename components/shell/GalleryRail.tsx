"use client";

import type { ReactNode } from "react";
import { useContext } from "react";
import { Lightbulb, Redo2, Star, Undo2 } from "lucide-react";
import { LockIcon } from "@/components/billing/Lock";
import { HelpContext, HelpMark } from "@/components/help/HelpContext";
import type { Opt } from "@/components/editor/ControlBar";
import { railPic } from "@/lib/railArt";
import { ART } from "./cardArt";

export type GalleryGroup = {
  /** Heading shown above the cards. */
  label: string;
  /** Accessible group name (kept stable for scripts and screen readers). */
  name: string;
  /** Prefix into the card art table, e.g. "shape" for "shape:rect". */
  art: string;
  /** Prefix into the rendered 3D picture table when it differs from `art`. */
  pics?: string;
  value: string;
  options: Opt[];
  cols?: 2 | 3;
  /** Shown under the heading (a search box). */
  head?: ReactNode;
  /** Shown instead of the cards when there are none. */
  empty?: string;
  /** A star on each card that adds it to (or removes it from) the favourites. */
  fav?: { has: (v: string) => boolean; toggle: (v: string, text: string) => void };
  /** A small control after the heading (a Randomise lock). */
  tools?: ReactNode;
};

function TipsButton() {
  const help = useContext(HelpContext);
  if (!help) return null;
  return <button type="button" className="hdr-btn" aria-label="Tips" title="Tips for this product" onClick={() => help.open(help.map.tips)}><Lightbulb size={16} /></button>;
}

/** Rendered 3D picture (from scripts/rail-art.ts) when one exists, else the line art. */
function CardArt({ pic, children }: { pic?: string; children: ReactNode }) {
  if (!pic) return <span className="art" aria-hidden="true">{children}</span>;
  return (
    <span className="art pic" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pic} alt="" width={96} height={66} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}

export type History = { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };

/** Left rail: undo/redo on top, then the product's big choices as picture cards (Atomm-style), grouped. */
export function GalleryRail({ title, icon, groups, history, children, inert }: {
  title: string;
  icon?: ReactNode;
  groups: GalleryGroup[];
  history: History;
  children?: ReactNode;
  /** A shared design being viewed: nothing here can be changed. */
  inert?: boolean;
}) {
  return (
    <aside className="gallery" aria-label={`${title} options`} inert={inert || undefined}>
      <div className="gallery-head">
        {icon}<span>{title}</span>
        <span className="hist">
          <TipsButton />
          <button type="button" className="hdr-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={16} /></button>
          <button type="button" className="hdr-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={16} /></button>
        </span>
      </div>
      <div className="gallery-scroll">
        {children}
        {groups.map((g) => (
          <section key={g.name} className="gallery-group">
            <h3>{g.label}<HelpMark title={g.label} kind="rail" />{g.tools}</h3>
            {g.head}
            {!g.options.length && g.empty && <p className="gempty">{g.empty}</p>}
            <div className={`gcards c${g.cols ?? 2}`} role="group" aria-label={g.name}>
              {g.options.map((o) => {
                const tip = o.title && o.title !== o.text ? `${o.text}: ${o.title}` : o.text;
                const card = (
                  <button
                    key={o.v} type="button" data-v={o.v}
                    className={`gcard${o.locked ? " locked" : ""}`}
                    title={o.locked ? `${tip} (Pro)` : tip}
                    aria-pressed={g.value === o.v} disabled={o.disabled} onClick={o.onClick}
                  >
                    <CardArt pic={railPic(g.pics ?? g.art, o.v)}>{ART[`${g.art}:${o.v}`] ?? o.icon}</CardArt>
                    <span className="lbl"><span className="t">{o.text}</span>{o.locked && <LockIcon />}</span>
                    {o.soon && <span className="soon">{o.soon}</span>}
                  </button>
                );
                if (!g.fav) return card;
                const on = g.fav.has(o.v);
                return (
                  <div key={o.v} className="gcell">
                    {card}
                    <button
                      type="button" className="gfav" aria-pressed={on} aria-label={`${on ? "Remove" : "Add"} ${o.text} ${on ? "from" : "to"} favourites`}
                      title={on ? "Remove from favourites" : "Add to favourites"} onClick={() => g.fav!.toggle(o.v, o.text)}
                    ><Star size={13} aria-hidden /></button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
