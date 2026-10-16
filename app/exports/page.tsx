import type { Metadata } from "next";
import { ExportHistoryList } from "@/components/site/LocalLists";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Export history", alternates: { canonical: "/exports" } };

export default function ExportsPage() {
  return (
    <PageShell title="Export history" lede="File names from exports downloaded in this browser. The files themselves are not stored here.">
      <ExportHistoryList />
    </PageShell>
  );
}
