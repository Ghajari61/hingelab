import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import EditorRoot from "@/components/editor/EditorRoot";
import { getUser } from "@/lib/supabase/server";
import { getProject } from "@/lib/projects/repo";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (id === "local" || !UUID.test(id)) return { title: "HingeLab" };
  const session = await getUser();
  const project = session ? await getProject(session.supabase, id) : null;
  return { title: project ? `${project.name} · HingeLab` : "HingeLab" };
}

/** `/app/editor/local` is the guest editor (browser storage); any other id is a cloud project. */
export default async function EditorPage({ params }: Props) {
  const { id } = await params;
  if (id === "local") return <EditorRoot />;
  if (!UUID.test(id)) notFound();
  const session = await getUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/app/editor/${id}`)}`);
  const project = await getProject(session.supabase, id);
  if (!project) notFound();
  return (
    <EditorRoot
      cloud={{
        id: project.id,
        product: project.product,
        params: project.params as Record<string, unknown>,
        updatedAt: project.updated_at,
      }}
    />
  );
}
