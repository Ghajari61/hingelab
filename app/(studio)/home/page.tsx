import type { Metadata } from "next";
import StartScreen from "@/components/studio/StartScreen";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

export default function HomePage() {
  return <StartScreen />;
}
