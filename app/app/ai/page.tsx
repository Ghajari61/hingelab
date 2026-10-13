import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { planOf } from "@/lib/plans";
import { AppHeader } from "@/components/site/AppHeader";
import { AIDesigner } from "@/components/ai/AIDesigner";

export const metadata: Metadata = { title: "AI designer · HingeLab" };

export default async function AIDesignPage() {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp%2Fai");
  const { data } = await session.supabase.from("profiles").select("plan").eq("id", session.user.id).maybeSingle();
  return (
    <div className="page site-page">
      <AppHeader current="ai" />
      <AIDesigner plan={planOf(data?.plan)} />
    </div>
  );
}
