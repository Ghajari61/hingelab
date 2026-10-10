"use client";

import dynamic from "next/dynamic";
import type { CloudDoc } from "@/hooks/useCloudAutosave";

const Workspace = dynamic(() => import("./Workspace"), {
  ssr: false,
  loading: () => <div className="boot">Loading HingeLab…</div>,
});

/** The editor reads localStorage and the window size, so it mounts only in the browser. */
export default function EditorRoot({ cloud }: { cloud?: CloudDoc }) {
  return <Workspace cloud={cloud ?? null} />;
}
