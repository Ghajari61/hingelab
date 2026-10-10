import type { Metadata } from "next";
import Link from "next/link";
import { sceneSVG } from "@/components/editor/scene3d";
import { CutSheet } from "@/components/site/CutSheet";
import { HeroGenerator } from "@/components/site/HeroGenerator";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { FREE_PROJECT_LIMIT, PLAN_ROWS, PRICES, PRO_BENEFITS } from "@/lib/plans";
import { GALLERY, isProSample, sheetFor } from "@/lib/site/samples";
import { SITE_DESCRIPTION } from "@/lib/site/config";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "HingeLab: living-hinge boxes, ready for your laser" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Set the size and shape",
    text: "Type outside or inside dimensions and pick a rounded box, a pill, a polygon or a cylinder. Thickness and kerf come from your material preset.",
  },
  {
    title: "Check the bend",
    text: "Bend analysis estimates the tightest radius the hinge can take before the wood cracks. Auto-fit tunes slit length, bridge and spacing for your corner.",
  },
  {
    title: "Cut and assemble",
    text: "Run the layers in order: slots, hinge, outline. Flex the wall gently, then press its tabs into the base and lid.",
  },
];

const FAQ = [
  {
    q: "What is kerf, and do I need to measure it?",
    a: "Kerf is the width of material the laser burns away, usually 0.1 to 0.2 mm. HingeLab offsets every outline by half the kerf and shrinks the slots to match, so tabs fit snugly. Start with the material preset, cut the bend test strip, and change the kerf by 0.02 mm if the joints come out loose or tight.",
  },
  {
    q: "Which materials work?",
    a: "3 mm Baltic birch plywood is the most forgiving. Poplar plywood, MDF and 2 mm chipboard work with the right pattern, and bend analysis uses a different strain limit for each. Acrylic is brittle: it cracks at room temperature unless the bend is very gentle.",
  },
  {
    q: "Does the file work with LightBurn?",
    a: "Yes. The SVG is in millimeters and has one layer per operation in LightBurn's palette: green slots (C03), blue hinge slits (C01), red outline (C02) and black engraved labels (C00). It also opens in Inkscape and other laser software that imports SVG.",
  },
  {
    q: "Do I need an account?",
    a: `No. The editor runs in your browser and keeps your box on this device. A free account adds up to ${FREE_PROJECT_LIMIT} cloud projects you can open on any computer.`,
  },
  {
    q: "What does Pro add?",
    a: `${PRO_BENEFITS.join(". ")}. Pro is $${PRICES.monthly} a month or $${PRICES.yearly} a year.`,
  },
  {
    q: "Can I cancel?",
    a: "Yes, at any time from Billing. Pro stays on until the end of the period you paid for, and your projects stay in your account.",
  },
];

export default function HomePage() {
  const gallery = GALLERY.map((s) => ({ ...s, sheet: sheetFor(s.params)! }));
  return (
    <div className="page landing">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Living-hinge boxes, ready for your laser</h1>
            <p className="hero-lead">
              Pick a shape, type the size, and download one SVG with every slot, hinge slit and outline on its own layer.
              Kerf is already compensated.
            </p>
            <div className="hero-actions">
              <Link href="/app/editor/local" className="btn-primary btn-lg">Open the editor</Link>
              <a href="#pricing" className="btn-ghost btn-lg">See pricing</a>
            </div>
            <p className="hero-note">Free to start. No account needed to try it.</p>
          </div>
          <HeroGenerator />
        </section>

        <section id="how" className="band">
          <h2>How it works</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-n" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="layers-key" aria-label="Layers in the exported file">
            <span><i className="k-slots" />Slots cut first</span>
            <span><i className="k-hinge" />Hinge slits</span>
            <span><i className="k-outline" />Outline cut last</span>
          </div>
        </section>

        <section id="examples" className="band">
          <h2>Four boxes from the same editor</h2>
          <ul className="gallery">
            {gallery.map((g) => (
              <li key={g.title}>
                <div className="g-box" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sceneSVG(g.sheet.model, g.sheet.params, -0.6, 0.35) }} />
                <CutSheet sheet={g.sheet} className="g-sheet" />
                <h3>{g.title}{isProSample(g.params) && <span className="pro-tag">Pro</span>}</h3>
                <p>{g.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="band">
          <h2>Pricing</h2>
          <div className="pricing">
            <table>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Feature</span></th>
                  <th scope="col">Free<span className="price">$0</span></th>
                  <th scope="col" className="pro-col">Pro<span className="price">${PRICES.monthly}<small> / month</small></span><span className="price-alt">or ${PRICES.yearly} / year</span></th>
                </tr>
              </thead>
              <tbody>
                {PLAN_ROWS.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row">{r.feature}</th>
                    <td>{r.free === "✓" ? <Check /> : r.free}</td>
                    <td className="pro-col">{r.pro === "✓" ? <Check /> : r.pro}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td><Link href="/app/editor/local" className="btn-ghost">Start free</Link></td>
                  <td className="pro-col"><Link href="/signup?next=%2Fapp%2Fbilling" className="btn-primary">Get Pro</Link></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section id="faq" className="band faq">
          <h2>Questions</h2>
          <div className="faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Check() {
  return <svg className="check" width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="Included"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
