import type { Metadata } from "next";
import { KerfForm } from "@/components/site/KerfForm";
import { PageShell } from "@/components/site/PageShell";
import "../../landing.css";

export const metadata: Metadata = { title: "Kerf and fit tools", alternates: { canonical: "/learn/kerf" } };

export default function KerfPage() {
  return (
    <PageShell title="Kerf and fit tools" lede="Measure the kerf your laser cuts and save it here. It stays on this device.">
      <KerfForm />
    </PageShell>
  );
}
