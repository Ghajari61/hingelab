import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/lib/site/config";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="page landing">
      <SiteHeader />
      <main className="legal">
        <h1>{title}</h1>
        <p className="legal-date">Last updated {updated}</p>
        {children}
        <h2>Contact</h2>
        <p>
          {CONTACT_EMAIL
            ? <>Questions about this page: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>
            : "A contact address for questions about this page will be published here before launch."}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
