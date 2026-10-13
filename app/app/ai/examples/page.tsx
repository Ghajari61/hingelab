import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isCurator } from "@/lib/ai/examples";
import { AppHeader } from "@/components/site/AppHeader";
import { ExampleLibrary } from "@/components/ai/ExampleLibrary";

export const metadata: Metadata = { title: "AI example library · HingeLab", robots: { index: false } };

export default async function AIExamplesPage() {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp%2Fai%2Fexamples");
  if (!(await isCurator(session.user.id))) notFound();
  return (
    <div className="page site-page">
      <AppHeader current="ai" />
      <ExampleLibrary />
    </div>
  );
}
