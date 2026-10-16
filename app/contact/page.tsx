import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { CONTACT_EMAIL } from "@/lib/site/config";
import "../landing.css";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <PageShell title="Contact">
      {CONTACT_EMAIL
        ? <p>Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        : <p>A public contact address is not set yet. Signed-in billing questions stay on the Billing page.</p>}
    </PageShell>
  );
}
