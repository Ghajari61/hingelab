"use client";

import { useState } from "react";
import Link from "next/link";

export type PriceCard = {
  id: string;
  badge: string;
  quiet?: boolean;
  popular?: boolean;
  name: string;
  /** Null when the monthly/yearly toggle does not apply (Free, Lifetime). */
  monthly: number | null;
  yearly: number | null;
  once?: string;
  alt: string;
  features: string[];
  note?: string;
  cta: string;
  href: string;
  primary?: boolean;
};

export function Pricing({ cards }: { cards: PriceCard[] }) {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="pricing">
      <div className="bill-toggle" role="group" aria-label="Billing period">
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly <span className="save">Save ~30%</span></button>
      </div>
      <div className={`plan-grid${cards.length < 4 ? " three" : ""}`}>
        {cards.map((c) => {
          const fixed = c.once != null || (c.monthly === 0 && c.yearly === 0);
          const amount = c.once ?? (yearly && !fixed ? c.yearly : c.monthly);
          const unit = fixed || c.once ? "" : yearly ? " / year" : " / month";
          return (
            <article key={c.id} className={`plan-card${c.popular ? " pro-col" : ""}`} id={`pricing-${c.id}`}>
              <span className={`plan-badge${c.quiet ? " quiet" : ""}`}>{c.badge}</span>
              <span className="plan-kicker">{c.name}</span>
              <span className="price">{typeof amount === "number" ? `$${amount}` : amount}{unit && <small>{unit}</small>}</span>
              <span className="price-alt">{periodAlt(c, yearly)}</span>
              <ul>
                {c.features.map((f) => (
                  <li key={f}><Check />{f}</li>
                ))}
              </ul>
              {c.note && <p className="plan-note">{c.note}</p>}
              <Link href={c.href} className={`${c.primary ? "btn-primary" : "btn-ghost"} plan-cta`}>{c.cta}</Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function periodAlt(c: PriceCard, yearly: boolean): string {
  if (c.once != null || c.monthly == null || c.yearly == null || (c.monthly === 0 && c.yearly === 0)) return c.alt;
  if (yearly) return `or $${c.monthly} / month`;
  const save = c.monthly * 12 - c.yearly;
  return save > 0 ? `or $${c.yearly} / year · save $${save}` : `or $${c.yearly} / year`;
}

function Check() {
  return <svg className="check" width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="Included"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
