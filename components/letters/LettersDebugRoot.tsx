"use client";

import dynamic from "next/dynamic";

const LettersDebug = dynamic(() => import("./LettersDebug"), {
  ssr: false,
  loading: () => <div className="boot">Loading…</div>,
});

export default function LettersDebugRoot() {
  return <LettersDebug />;
}
