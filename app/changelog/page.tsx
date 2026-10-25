import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "Changelog", alternates: { canonical: "/changelog" } };

export default function ChangelogPage() {
  return (
    <PageShell title="Changelog" lede="Recent changes to the Windows app and the public site.">
      <h2>Version 1.5.0 — Letter corners</h2><p>Keep sharp letter corners with numbered wall joints, or choose Round off for the earlier shape. Split-wall base slots now match the tabs on each strip. Available on the website and in the updated Windows installer.</p>
      <h2>Version 1.4.0 — Guided workflow</h2><p>Seven design-to-export steps, Simple and Advanced settings, adjustable panels and searchable projects, plus the latest Pop-up support and tiered-stand improvements.</p>
      <h2>Version 1.3.0 — Pop-up</h2><p>27 editable bowls, baskets, trees, lampshades and ornaments. Ring and spiral blanks, profile controls, supports, shaped engraving and animated flat-to-open previews. Prototype material flexure before cutting a full design.</p>
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
