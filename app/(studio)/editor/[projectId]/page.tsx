import type { Metadata } from "next";
import EditorRoute from "@/components/studio/editor/EditorRoute";

export const metadata: Metadata = { title: "Editor", robots: { index: false } };

export default async function EditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <EditorRoute projectId={projectId} />;
}
