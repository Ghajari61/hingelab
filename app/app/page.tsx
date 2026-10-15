import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { listProjects } from "@/lib/projects/repo";
import { hasPro, planOf, projectLimit } from "@/lib/plans";
import { AppHeader } from "@/components/site/AppHeader";
import { ProjectsHome } from "@/components/projects/ProjectsHome";

export const metadata: Metadata = { title: "My boxes · HingeLab" };

export default async function MyBoxesPage() {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp");
  const [projects, profile] = await Promise.all([
    listProjects(session.supabase).catch(() => []),
    session.supabase.from("profiles").select("plan").eq("id", session.user.id).maybeSingle(),
  ]);
  const plan = planOf(profile.data?.plan);
  return (
    <div className="page site-page">
      <AppHeader current="boxes" />
      <ProjectsHome projects={projects} products={["hinge-box", "letters", "parametric"]} localOnly={hasPro(plan) ? [] : ["parametric"]} limit={projectLimit(plan)} />
    </div>
  );
}
