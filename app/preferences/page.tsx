import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Preferences", alternates: { canonical: "/preferences" } };

export default function PreferencesPage() {
  return (
    <PageShell title="Preferences" lede="Units, theme and the default material are stored with the editor on this device.">
      <ul>
        <li><Link href="/app/editor/local">Open the editor</Link> and use Settings for millimetres or inches, and for the theme.</li>
        <li><Link href="/learn/kerf">Kerf and fit tools</Link> save a measured thickness and kerf on this device.</li>
        <li><Link href="/materials">Materials</Link> lists the built-in starting values.</li>
      </ul>
    </PageShell>
  );
}
