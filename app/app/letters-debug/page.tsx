import type { Metadata } from "next";
import LettersDebugRoot from "@/components/letters/LettersDebugRoot";

export const metadata: Metadata = { title: "Letters debug · HingeLab", robots: { index: false, follow: false } };

/** Hidden page (not linked anywhere) that shows each step of the Letters pipeline. */
export default function LettersDebugPage() {
  return <LettersDebugRoot />;
}
