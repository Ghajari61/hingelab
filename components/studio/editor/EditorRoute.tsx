"use client";

import dynamic from "next/dynamic";

const StudioEditor = dynamic(() => import("./StudioEditor"), {
  ssr: false,
  loading: () => <div className="st-boot">Loading the editor…</div>,
});

export default function EditorRoute({ projectId }: { projectId: string }) {
  return <StudioEditor projectId={projectId} />;
}
