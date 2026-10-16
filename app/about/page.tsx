import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import "../landing.css";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <PageShell title="About HingeLab" lede="HingeLab makes cut files for boxes, signs, toppers, clocks and layered art.">
      <p>You set the size, the material and the kerf. The app draws the parts, checks whether they can be cut, and shows them flat and in 3D. Free is a preview. Pro saves projects and downloads the cut files.</p>
      <p>Files are for your own laser or blade cutter. HingeLab does not sell machines and does not require one brand of software.</p>
    </PageShell>
  );
}
