import type { Metadata } from "next";
import { TemplatesPage } from "@/components/studio/pages/SettingsPages";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return <TemplatesPage />;
}
