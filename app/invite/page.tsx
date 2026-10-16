import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Invite friends", alternates: { canonical: "/invite" } };

export default function InvitePage() {
  return (
    <PageShell title="Invite friends" lede="Send another maker to HingeLab. There is no referral fee and no credit balance.">
      <p>Share the site address. They create their own account if they want cloud projects. Their plan is separate from yours.</p>
    </PageShell>
  );
}
