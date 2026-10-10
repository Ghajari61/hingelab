"use client";

import type { ReactNode } from "react";
import { LockIcon } from "@/components/billing/Lock";
import type { Opt } from "@/components/editor/ControlBar";
import { ART } from "./cardArt";

export type GalleryGroup = {
  /** Heading shown above the cards. */
  label: string;
  /** Accessible group name (kept stable for scripts and screen readers). */
  name: string;
  /** Prefix into the card art table, e.g. "shape" for "shape:rect". */
  art: string;
  value: string;
  options: Opt[];
  cols?: 2 | 3;
};

/** Left rail: the product's big choices as picture cards (Atomm-style), grouped. */
export function GalleryRail({ title, icon, groups, children }: {
  title: string;
  icon?: ReactNode;
  groups: GalleryGroup[];
  children?: ReactNode;
}) {
  return (
    <aside className="gallery" aria-label={`${title} options`}>
      <div className="gallery-head">{icon}<span>{title}</span></div>
      <div className="gallery-scroll">
        {children}
        {groups.map((g) => (
          <section key={g.name} className="gallery-group">
            <h3>{g.label}</h3>
            <div className={`gcards c${g.cols ?? 2}`} role="group" aria-label={g.name}>
              {g.options.map((o) => (
                <button
                  key={o.v} type="button" data-v={o.v}
                  className={`gcard${o.locked ? " locked" : ""}`}
                  title={o.locked ? `${o.title ?? o.text} (Pro)` : o.title}
                  aria-pressed={g.value === o.v} disabled={o.disabled} onClick={o.onClick}
                >
                  <span className="art" aria-hidden="true">{ART[`${g.art}:${o.v}`] ?? o.icon}</span>
                  <span className="lbl">{o.text}{o.locked && <LockIcon />}</span>
                  {o.soon && <span className="soon">{o.soon}</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
