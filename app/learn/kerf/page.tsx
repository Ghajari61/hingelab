import type { Metadata } from "next";
import Link from "next/link";
import { KerfForm } from "@/components/site/KerfForm";
import { PageShell } from "@/components/site/PageShell";
import "../../landing.css";

export const metadata: Metadata = { title: "Kerf and fit tools", alternates: { canonical: "/learn/kerf" } };

export default function KerfPage() {
  return (
    <PageShell title="Kerf and fit tools" lede="Cut a test comb in the calibration starter, measure the slot that fits, then save that kerf here. It stays on this device.">
      <p><Link href="/home?generator=calibration">Open the test and calibration starter</Link></p>
      <KerfForm />
    </PageShell>
  );
}
