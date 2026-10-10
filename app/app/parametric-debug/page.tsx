import type { Metadata } from "next";
import ParametricDebugRoot from "@/components/parametric/ParametricDebugRoot";

export const metadata: Metadata = { title: "Parametric debug · HingeLab", robots: { index: false, follow: false } };

/** Hidden page (not linked anywhere) that shows the slicing planes, sections and fins. */
export default function ParametricDebugPage() {
  return <ParametricDebugRoot />;
}
