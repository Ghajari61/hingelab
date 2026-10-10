import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing · HingeLab" };

export default async function BillingPage() {
  const session = await getUser();
  const profile = session
    ? (await session.supabase.from("profiles").select("plan").eq("id", session.user.id).maybeSingle()).data
    : null;
  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h1>Billing</h1>
        <p className="auth-lead">You are on the {profile?.plan === "pro" ? "Pro" : "Free"} plan.</p>
        <Link className="btn-ghost" href="/app">Back to My boxes</Link>
      </div>
    </div>
  );
}
