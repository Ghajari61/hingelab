import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function PageShell({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <div className="page landing">
      <SiteHeader />
      <main className="legal ia-page">
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
