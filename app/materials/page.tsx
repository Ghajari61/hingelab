import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { MATERIALS } from "@/lib/hinge/defaults";
import "../landing.css";

export const metadata: Metadata = { title: "Materials", alternates: { canonical: "/materials" } };

export default function MaterialsPage() {
  const rows = Object.entries(MATERIALS).filter(([id]) => id !== "custom");
  return (
    <PageShell title="Materials" lede="Starting thickness and kerf. Measure your own sheet, then save it with the kerf tool. These numbers are estimates, not machine settings.">
      <p><Link href="/learn/kerf">Save a measured kerf</Link></p>
      <table>
        <thead><tr><th>Material</th><th>Thickness</th><th>Kerf</th></tr></thead>
        <tbody>
          {rows.map(([id, m]) => (
            <tr key={id}>
              <td>{m.name}</td>
              <td>{m.T == null ? "—" : `${m.T} mm`}</td>
              <td>{m.K == null ? "—" : `${m.K} mm`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}
