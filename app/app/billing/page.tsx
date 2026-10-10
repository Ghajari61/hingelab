import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppHeader } from "@/components/site/AppHeader";

export const metadata: Metadata = { title: "Billing · HingeLab" };

export default async function BillingPage() {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp%2Fbilling");
  const { data: profile } = await session.supabase.from("profiles").select("plan").eq("id", session.user.id).maybeSingle();
  return (
    <div className="page site-page">
      <AppHeader current="billing" />
      <main className="boxes">
        <h1>Billing</h1>
        <p>You are on the {profile?.plan === "pro" ? "Pro" : "Free"} plan.</p>
      </main>
    </div>
  );
}
