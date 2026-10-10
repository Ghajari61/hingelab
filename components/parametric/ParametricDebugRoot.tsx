"use client";

import dynamic from "next/dynamic";

const ParametricDebug = dynamic(() => import("./ParametricDebug"), {
  ssr: false,
  loading: () => <div className="boot">Loading…</div>,
});

export default function ParametricDebugRoot() {
  return <ParametricDebug />;
}
