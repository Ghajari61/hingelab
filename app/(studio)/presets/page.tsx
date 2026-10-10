import type { Metadata } from "next";
import { PresetsPage } from "@/components/studio/pages/SettingsPages";

export const metadata: Metadata = { title: "Presets" };

export default function Page() {
  return <PresetsPage />;
}
