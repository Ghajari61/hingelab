import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { TOOLS } from "@/lib/site/tools";
import "../landing.css";

export const metadata: Metadata = {
  title: "Free laser cutting tools",
  description: "Free browser tools for laser cut files: resize for a new material thickness, convert to STL for 3D printing, and nest parts on sheets. No account, nothing uploaded.",
  alternates: { canonical: "/tools" },
};

export default function ToolsPage() {
  return (
    <PageShell title="Free laser cutting tools" lede="Small jobs every maker meets, done in your browser. No account, and your files never leave your device.">
      <div className="ia-grid tool-grid">
        {TOOLS.map((t) => (
          <Link key={t.id} className="ia-card" href={`/tools/${t.id}`}>
            <span className="ia-chip">FREE</span>
            <b>{t.name}</b>
            <p>{t.blurb}</p>
          </Link>
        ))}
        <Link className="ia-card" href="/learn/kerf">
          <span className="ia-chip">FREE</span>
          <b>Kerf and fit</b>
          <p>Cut a test comb, measure the slot that fits and save your kerf for every design.</p>
        </Link>
      </div>
    </PageShell>
  );
}
