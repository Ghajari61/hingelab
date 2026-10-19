import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isEditorProduct, productHref } from "@hingelab/app/routes";
import EditorRoute from "@/components/studio/editor/EditorRoute";

export const metadata: Metadata = { title: "Editor", robots: { index: false } };

type Props = { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/editor/<product>` opens that product's editor (the Windows app's route for it); any other id is a Studio project. */
export default async function EditorPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  if (isEditorProduct(projectId)) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(await searchParams)) if (k !== "p" && typeof v === "string") q.set(k, v);
    const rest = q.toString();
    redirect(`${productHref(projectId, "web")}${rest ? `&${rest}` : ""}`);
  }
  return <EditorRoute projectId={projectId} />;
}
