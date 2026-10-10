import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import "../landing.css";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 10, 2026">
      <p>HingeLab collects as little as it needs to run the editor, your account and your subscription.</p>

      <h2>Without an account</h2>
      <p>The editor stores your current box and settings in your browser’s local storage. When you export, your box settings are sent to our server, which builds the file and does not keep it.</p>

      <h2>With an account</h2>
      <ul>
        <li><b>Account:</b> your email address, and your name and profile picture if you sign in with Google.</li>
        <li><b>Projects:</b> the settings, name and a small preview image of each cloud project you save.</li>
        <li><b>Plan:</b> your plan, subscription status and renewal date.</li>
      </ul>
      <p>We use this data only to provide HingeLab. We do not sell it, and we do not use advertising or tracking cookies.</p>

      <h2>Payments</h2>
      <p>Payments are handled by Stripe. Your card details go directly to Stripe and never reach our servers. We keep only a Stripe customer id to link your subscription to your account.</p>

      <h2>Service providers</h2>
      <ul>
        <li>Supabase: account sign-in and project database.</li>
        <li>Stripe: subscriptions and payments.</li>
        <li>Vercel: website hosting.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We set only the cookies needed to keep you signed in. Stripe sets its own cookies on its checkout pages.</p>

      <h2>Your rights</h2>
      <p>You can delete your projects at any time from My boxes. To delete your account or get a copy of your data, contact us at the address below and we will respond within 30 days.</p>
    </LegalPage>
  );
}
