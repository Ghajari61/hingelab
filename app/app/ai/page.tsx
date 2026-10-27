import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { effectivePlan } from "@/lib/plans";
import { AppHeader } from "@/components/site/AppHeader";
import { AIDesigner } from "@/components/ai/AIDesigner";
import { isCurator } from "@/lib/ai/examples";

export const metadata: Metadata = { title: "AI designer · HingeLab" };

export default async function AIDesignPage() {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp%2Fai");
  const [{ data }, curator] = await Promise.all([
    session.supabase.from("profiles").select("plan, current_period_end").eq("id", session.user.id).maybeSingle(),
    isCurator(session.user.id),
  ]);
  return (
    <div className="page site-page">
      <AppHeader current="ai" />
      <AIDesigner plan={effectivePlan(data?.plan, data?.current_period_end)} curator={curator} />
    </div>
  );
}
