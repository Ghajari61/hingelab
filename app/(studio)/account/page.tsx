import type { Metadata } from "next";
import { AccountPage } from "@/components/studio/pages/SettingsPages";

export const metadata: Metadata = { title: "Account" };

export default function Page() {
  return <AccountPage />;
}
