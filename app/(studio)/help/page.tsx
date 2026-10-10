import type { Metadata } from "next";
import { HelpPage } from "@/components/studio/pages/SettingsPages";

export const metadata: Metadata = { title: "Help" };

export default function Page() {
  return <HelpPage />;
}
