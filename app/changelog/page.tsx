import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Changelog", alternates: { canonical: "/changelog" } };

export default function ChangelogPage() {
  return (
    <PageShell title="Changelog" lede="Recent changes to the Windows app and the public site.">
      <h2>15 October 2026</h2>
      <ul>
        <li>The public site groups pages into Make, Community and Learn, with a generator catalogue.</li>
        <li>Windows app 1.0.38 removes the Full editor button from the workspace toolbar.</li>
        <li>Windows app 1.0.37 removes the Studio item from the desktop sidebar. Saved work on the website stays under Studio in this menu.</li>
        <li>Windows app 1.0.36 keeps Free as preview only: no save and no cut-file download.</li>
      </ul>
    </PageShell>
  );
}
