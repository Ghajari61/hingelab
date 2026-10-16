import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "For developers", alternates: { canonical: "/developers" } };

export default function DevelopersPage() {
  return (
    <PageShell title="For developers" lede="HingeLab generators are part of this app. There is no public generator kit and no embed for other sites.">
      <p>Each generator is a definition in the repository: defaults, a field list, presets, a build, and checks. The same shell draws the panels, the 3D view and the export. A third-party generator cannot be installed from outside that repository.</p>
      <p>If that changes, this page will say how. Until then, use the generators that are already listed.</p>
    </PageShell>
  );
}
