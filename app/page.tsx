import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Award, Baby, Box, Cake, CheckCircle2, Clock, Download, FileDown, Gift, GraduationCap, Hash, Heart, KeyRound, Layers,
  LayoutGrid, Moon, Package, Puzzle, QrCode, Ruler, ScanLine, Shapes, ShieldCheck, Signpost, Sparkles, TreePine, Trophy,
  Type, Wand2, Wrench, type LucideIcon,
} from "lucide-react";
import { sceneSVG } from "@/components/editor/scene3d";
import { CutSheet } from "@/components/site/CutSheet";
import { HeroGenerator } from "@/components/site/HeroGenerator";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { FREE_PROJECT_LIMIT, PLAN_ROWS, PRICES, PRO_BENEFITS } from "@/lib/plans";
import { desktopRelease } from "@/lib/site/release";
import { siteProducts, totalPresets, type SiteIcon } from "@/lib/site/products";
import { GALLERY, isProSample, sheetFor } from "@/lib/site/samples";
import { SITE_DESCRIPTION } from "@/lib/site/config";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "HingeLab: laser-cut generators for boxes, toppers, signs and more" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const ICON: Record<SiteIcon, LucideIcon> = {
  hinge: Package, letters: Type, parametric: Layers, clock: Clock, puzzle: Puzzle, qr: QrCode, box: Box,
  cake: Cake, key: KeyRound, sign: Signpost, hash: Hash, trophy: Trophy,
};

const OCCASIONS: { name: string; icon: LucideIcon; preset: string }[] = [
  { name: "Birthday", icon: Cake, preset: "happy-birthday" },
  { name: "Wedding", icon: Heart, preset: "mr-mrs" },
  { name: "Eid & Ramadan", icon: Moon, preset: "eid-mubarak" },
  { name: "Graduation", icon: GraduationCap, preset: "graduation" },
  { name: "Baby shower", icon: Baby, preset: "baby-shower" },
  { name: "Christmas", icon: TreePine, preset: "merry-christmas" },
  { name: "Anniversary", icon: Gift, preset: "anniversary" },
  { name: "Milestone ages", icon: Sparkles, preset: "number-30" },
];

const STEPS = [
  { icon: LayoutGrid, title: "Pick a design", text: "Start from one of the ready-made designs or a blank generator: boxes, cake toppers, signs, table numbers, trophies, clocks, puzzles and more." },
  { icon: Wand2, title: "Make it yours", text: "Type your text, choose a font and a shape, and set the sizes. Checks flag anything that will not cut or fit, with a one-click fix." },
  { icon: Download, title: "Cut it", text: "Download one SVG or DXF with cuts, scores and engraving on their own layers, kerf already compensated, nested on your sheet." },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Ruler, title: "Kerf and fit built in", text: "Every outline is offset for your laser's kerf and every slot is sized for your material's thickness." },
  { icon: ShieldCheck, title: "Checks with fixes", text: "Thin bridges, loose slots, parts larger than your bed: each problem comes with a button that fixes it." },
  { icon: Layers, title: "Wood and acrylic together", text: "Layered signs, toppers and trophies put each material on its own sheet, ready for two jobs." },
  { icon: ScanLine, title: "Real 3D preview", text: "Turn the assembled piece in 3D, explode it into parts, and see how it goes together." },
  { icon: FileDown, title: "SVG, DXF and LightBurn layers", text: "Millimetre files with one colour per operation open in LightBurn, xTool Creative Space, Glowforge and Inkscape." },
  { icon: Wrench, title: "Batches in one go", text: "Table numbers 1 to 30, a name on every cupcake topper, ten copies of a box: all nested on as few sheets as possible." },
];

const FAQ = [
  {
    q: "What can I make with HingeLab?",
    a: "Living-hinge and finger-jointed boxes, cake and cupcake toppers for every occasion, key holders, wood and acrylic signs, wedding and restaurant table numbers, trophies and awards, wall clocks, jigsaw puzzles, QR code plates, letter boxes and sliced sculptures. Every product starts from ready-made designs you can change.",
  },
  {
    q: "What is kerf, and do I need to measure it?",
    a: "Kerf is the width of material the laser burns away, usually 0.1 to 0.2 mm. HingeLab offsets every outline by half the kerf and sizes slots to match, so parts fit snugly. Start with the material preset, cut the test square, and change the kerf by 0.02 mm if joints come out loose or tight.",
  },
  {
    q: "Which machines and software work?",
    a: "Any laser cutter that imports SVG or DXF: xTool, Glowforge, Ortur, Atomstack, Epilog, Trotec and CO2 machines through LightBurn, xTool Creative Space, RDWorks or Inkscape. Files are in millimetres with one layer per operation.",
  },
  {
    q: "Is there a desktop app?",
    a: "Yes. HingeLab for Windows has every generator in a native window with a true-scale bed, works with your account, and updates itself. The website's editors open inside it too.",
  },
  {
    q: "Do I need an account?",
    a: `No. The editors run in your browser and keep your work on this device. A free account adds up to ${FREE_PROJECT_LIMIT} cloud projects you can open on any computer.`,
  },
  {
    q: "What does Pro add?",
    a: `${PRO_BENEFITS.join(". ")}. Pro is $${PRICES.monthly} a month or $${PRICES.yearly} a year, and you can cancel at any time from Billing.`,
  },
];

export default function HomePage() {
  const products = siteProducts();
  const presets = totalPresets();
  const mosaic = products.slice(0, 9);
  const gallery = GALLERY.map((s) => ({ ...s, sheet: sheetFor(s.params)! }));
  const release = desktopRelease();
  return (
    <div className="page landing">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow"><Sparkles size={14} aria-hidden="true" />{products.length} generators · {presets}+ ready-made designs</p>
            <h1>Laser-ready designs, <span className="grad">made in seconds</span></h1>
            <p className="hero-lead">
              Boxes, cake toppers, signs, table numbers, trophies, clocks and puzzles. Pick a design, type your text, and download a file
              your laser cuts right the first time.
            </p>
            <div className="hero-actions">
              <Link href="/app/editor/local" className="btn-primary btn-lg">Start designing free<ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#desktop" className="btn-ghost btn-lg"><Download size={18} aria-hidden="true" />Windows app</a>
            </div>
            <ul className="hero-points">
              <li><CheckCircle2 size={16} aria-hidden="true" />No account needed</li>
              <li><CheckCircle2 size={16} aria-hidden="true" />SVG and DXF</li>
              <li><CheckCircle2 size={16} aria-hidden="true" />Kerf compensated</li>
            </ul>
          </div>
          <div className="mosaic" aria-hidden="true">
            {mosaic.map((p, i) => (
              <span key={p.id} className={`m-card m${i}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.picture} alt="" width={300} height={200} loading={i < 4 ? "eager" : "lazy"} />
                <b>{p.name}</b>
              </span>
            ))}
          </div>
        </section>

        <section className="works" aria-label="Works with">
          <span>Works with</span>
          <b>LightBurn</b><b>xTool Creative Space</b><b>Glowforge</b><b>Inkscape</b><b>RDWorks</b><b>AutoCAD (DXF)</b>
        </section>

        <section id="products" className="band">
          <div className="band-head">
            <h2>Everything you can make</h2>
            <p>Each generator starts from ready-made designs and gives you every option: sizes, shapes, fonts, materials, joints and engraving.</p>
          </div>
          <ul className="products">
            {products.map((p) => {
              const I = ICON[p.icon] ?? Shapes;
              return (
                <li key={p.id}>
                  <Link href={p.href} className="product">
                    <span className="p-pic">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.picture} alt="" width={300} height={200} loading="lazy" />
                    </span>
                    <span className="p-body">
                      <span className="p-title"><span className="p-ico"><I size={16} aria-hidden="true" /></span>{p.name}</span>
                      <span className="p-blurb">{p.blurb}</span>
                      <span className="p-meta">{p.presets} designs<ArrowRight size={14} aria-hidden="true" /></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="occasions" className="band occasions">
          <div className="band-head">
            <h2>A topper for every occasion</h2>
            <p>Cake and cupcake toppers with welded script text, sticks that hold, and decorations for each celebration. Cut them in wood, acrylic or both.</p>
          </div>
          <ul className="occ">
            {OCCASIONS.map((o) => (
              <li key={o.name}>
                <Link href={`/app/editor/local?p=topper&preset=${o.preset}`}><o.icon size={20} aria-hidden="true" />{o.name}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="band">
          <div className="band-head"><h2>How it works</h2></div>
          <ol className="landing-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-ico" aria-hidden="true"><s.icon size={22} /></span>
                <span className="step-n">Step {i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="band">
          <div className="band-head">
            <h2>Made for makers who sell what they cut</h2>
            <p>The details that save a sheet of plywood: checked before you cut, laid out to waste less.</p>
          </div>
          <ul className="features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="f-ico" aria-hidden="true"><f.icon size={20} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="try" className="band try">
          <div className="band-head">
            <h2>Try the living-hinge box, right here</h2>
            <p>Change the shape and size: the cut file below is the real one, with slots, hinge slits and outline on their own layers.</p>
          </div>
          <HeroGenerator />
          <ul className="landing-gallery">
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

        <section id="desktop" className="band">
          <div className="desktop">
            <div className="d-copy">
              <p className="hero-eyebrow"><Award size={14} aria-hidden="true" />HingeLab for Windows</p>
              <h2>Every generator, in a native app</h2>
              <p>A true-scale laser bed with rulers, export straight to your job folder, favourites and recent designs, and the website&apos;s editors built in. Signed in with your account; it updates itself.</p>
              {release ? (
                <>
                  <a href={release.url} className="btn-primary btn-lg" download><Download size={18} aria-hidden="true" />Download for Windows</a>
                  <p className="d-fine">Version {release.version} · {release.size} · Windows 10 and 11 (64-bit){release.sha256 && <><br />SHA-256 <code>{release.sha256}</code></>}</p>
                </>
              ) : (
                <p className="d-fine">The Windows installer will be available here soon.</p>
              )}
            </div>
            <div className="d-shot" aria-hidden="true">
              <span className="d-bar"><i /><i /><i /></span>
              <span className="d-body">
                <span className="d-side" />
                <span className="d-grid">
                  {products.slice(3, 9).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={p.picture} alt="" width={150} height={100} loading="lazy" />
                  ))}
                </span>
              </span>
            </div>
          </div>
        </section>

        <section id="pricing" className="band">
          <div className="band-head"><h2>Pricing</h2><p>Start free. Upgrade when you sell what you make.</p></div>
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
          <div className="band-head"><h2>Questions</h2></div>
          <div className="faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="band final">
          <div className="final-card">
            <h2>Your next project is a few clicks away</h2>
            <p>Open the editor, pick a design and download a file your laser cuts right the first time.</p>
            <Link href="/app/editor/local" className="btn-primary btn-lg">Start designing free<ArrowRight size={18} aria-hidden="true" /></Link>
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
