import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { GRAPHICS } from "@/lib/generators/nav";
import "../landing.css";

export const metadata: Metadata = { title: "Graphics", alternates: { canonical: "/graphics" } };

export default function GraphicsPage() {
  return (
    <PageShell title="Graphics" lede="Original motif previews drawn by HingeLab generators. They are not a stock-art library.">
      <div className="ia-grid">
        {GRAPHICS.map((g) => (
          <figure key={g.id} className="ia-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.src} alt={g.name} width={240} height={180} />
            <figcaption><b>{g.name}</b></figcaption>
          </figure>
        ))}
      </div>
    </PageShell>
  );
}
