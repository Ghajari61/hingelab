import { ProductIcon, type ProductIconId } from "@/components/icons/ProductIcon";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Award, Baby, Cake, CheckCircle2, Download, FileDown, Gift, Globe, GraduationCap, Heart, Layers, LayoutGrid, MonitorDown, Moon, Ruler, ScanLine, ShieldCheck, Sparkles, TreePine, Wand2, Wrench, type LucideIcon } from "lucide-react";
import { sceneSVG } from "@/components/editor/scene3d";
import { CutSheet } from "@/components/site/CutSheet";
import { DownloadNote } from "@/components/site/DownloadNote";
import { HeroGenerator } from "@/components/site/HeroGenerator";
import { heroText } from "@/components/site/heroEngine";
import { HERO_HEIGHT, HERO_WIDTH } from "@/lib/site/hero";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Pricing, type PriceCard } from "@/components/site/Pricing";
import { BATCH_FREE, BATCH_PRO, BUSINESS_SEATS, LICENSES, PLAN_ROWS, PRICES, PRO_BENEFITS } from "@/lib/plans";
import { desktopRelease } from "@/lib/site/release";
import { siteProducts, totalPresets } from "@/lib/site/products";
import { GALLERY, heroParams, isProSample, sheetFor } from "@/lib/site/samples";
import { SITE_DESCRIPTION } from "@/lib/site/config";
import { motif, MOTIF_NAMES, type MotifId } from "@/lib/generators/motifs";
import { collectionBySlug } from "@/lib/site/collections";
import "./landing.css";
import "./start/start.css";

/** Detailed motifs shown on the landing page, drawn from the same geometry the generators cut. */
const SHOWCASE: { id: MotifId; preset: string }[] = [
  { id: "mandala", preset: "sign&preset=mandala-welcome" }, { id: "girih", preset: "trophy&preset=girih-award" },
  { id: "treeoflife", preset: "trophy&preset=tree-of-life-award" }, { id: "compass", preset: "tablenum&preset=compass-voyage" },
  { id: "mountains", preset: "sign&preset=lake-house" }, { id: "lotus", preset: "topper&preset=lotus-namaste" },
  { id: "triquetra", preset: "sign" }, { id: "fleur", preset: "sign" }, { id: "dreamcatcher", preset: "sign" },
  { id: "anchor", preset: "keyrack&preset=harbour-keys" }, { id: "olive", preset: "tablenum&preset=olive-grove" }, { id: "paisley", preset: "sign&preset=paisley-home" },
];
/** The collection to feature for the time of year the page is built: Christmas from October, Valentine's in January and February. */
function seasonal() {
  const m = new Date().getMonth();
  const slug = m >= 9 ? "christmas" : m <= 1 ? "valentines" : null;
  return slug ? collectionBySlug(slug) ?? null : null;
}
const motifPath = (id: MotifId) => motif(id, 88, 50, 50).map((c) => "M" + c.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");

export const metadata: Metadata = {
  title: { absolute: "HingeLab: laser-cut generators for boxes, toppers, signs and more" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
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
  { icon: LayoutGrid, title: "Pick what to make", text: "Choose a project and start from a ready-made design: boxes, cake toppers, signs, table numbers, trophies, clocks, puzzles and more." },
  { icon: Wand2, title: "Make it yours", text: "Type your text, choose a font and a shape, and set the sizes. Checks flag anything that will not cut or fit, with a one-click fix." },
  { icon: Download, title: "Check it and cut it", text: "See it assembled in 3D, then download one SVG or DXF with cuts, scores and engraving on their own layers, kerf compensated and nested on your sheet." },
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
    a: "Living-hinge and finger-jointed boxes, cake and cupcake toppers for every occasion, key holders, wood and acrylic signs, wedding and restaurant table numbers, trophies and awards, wall clocks, jigsaw puzzles, QR code plates, layered 3D paper-cut shadow boxes for a laser or a Cricut, letter boxes and sliced sculptures. Every product starts from ready-made designs you can change.",
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
    a: "Yes. HingeLab for Windows is the same editors as the website in their own window: designs are made on your computer, also offline, project files open with a double-click, exports go straight to your folder, and it updates itself. It uses your HingeLab account and plan.",
  },
  {
    q: "Do I need an account?",
    a: "No. The editors run in your browser so you can try designs on this device. Saving projects, cloud sync and downloading cut files need Pro.",
  },
  {
    q: "What does Pro add?",
    a: `${PRO_BENEFITS.join(". ")}. Batches of up to ${BATCH_PRO} items. Pro is $${PRICES.monthly} a month or $${PRICES.yearly} a year, and you can cancel at any time from Billing.`,
  },
  {
    q: "Can I sell what I make?",
    a: `On Pro: ${LICENSES.pro.charAt(0).toLowerCase()}${LICENSES.pro.slice(1)} On Business: ${LICENSES.business.charAt(0).toLowerCase()}${LICENSES.business.slice(1)}`,
  },
  {
    q: "What does Business add?",
    a: `Business is everything in Pro, plus unlimited batches, ${BUSINESS_SEATS.toLowerCase()}, priority support, and a commercial-use license. It is $${PRICES.businessMonthly} a month or $${PRICES.businessYearly} a year.`,
  },
];

export default async function HomePage() {
  const products = siteProducts();
  const presets = totalPresets();
  const mosaic = products.slice(0, 9);
  const gallery = GALLERY.map((s) => ({ ...s, sheet: sheetFor(s.params)! }));
  const heroSheet = sheetFor(heroParams("rect", HERO_WIDTH.start, HERO_HEIGHT.start));
  const release = desktopRelease();
  return (
    <div className="page landing">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow"><Sparkles size={14} aria-hidden="true" />{products.length} generators · {presets}+ ready-made designs</p>
            <h1>Laser-cut designs, <span className="grad">ready in minutes.</span></h1>
            <p className="hero-lead">
              Boxes, cake toppers, signs, table numbers, trophies, clocks, puzzles and more. Pick what you want to make, type your text,
              check it in 3D, and download a file your laser cuts right the first time.
            </p>
            <div className="hero-actions">
              <Link href="/start" className="btn-primary btn-lg">Try it online, free<ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#desktop" className="btn-ghost btn-lg"><Download size={18} aria-hidden="true" />Download for Windows</a>
            </div>
            <ul className="hero-points">
              <li><CheckCircle2 size={16} aria-hidden="true" />Try every design free, no account</li>
              <li><CheckCircle2 size={16} aria-hidden="true" />3D preview before you cut</li>
              <li><CheckCircle2 size={16} aria-hidden="true" />SVG and DXF export with Pro</li>
            </ul>
          </div>
          <div className="mosaic" aria-hidden="true">
            {mosaic.map((p, i) => (
              <span key={p.id} className={`m-card m${i}`}>
                { }
                <img src={p.picture} alt="" width={300} height={200} loading={i < 4 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding={i < 4 ? "sync" : "async"} />
                <b>{p.name}</b>
              </span>
            ))}
          </div>
        </section>

        <section className="works" aria-label="Works with">
          <span>Works with</span>
          <b>LightBurn</b><b>xTool Creative Space</b><b>Glowforge</b><b>Inkscape</b><b>RDWorks</b><b>AutoCAD (DXF)</b>
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

        <section id="ways" className="band start-ways home-ways" aria-labelledby="ways-h">
          <h2 id="ways-h">Try it online, or install it</h2>
          <div className="ways">
            <div className="way">
              <span className="way-ico"><Globe size={22} aria-hidden="true" /></span>
              <h3>Online, in your browser</h3>
              <ul>
                <li><CheckCircle2 size={15} aria-hidden="true" />Nothing to install: pick what to make and start</li>
                <li><CheckCircle2 size={15} aria-hidden="true" />Every generator and the 3D preview, free to try</li>
                <li><CheckCircle2 size={15} aria-hidden="true" />Downloading cut files needs Pro</li>
              </ul>
              <Link href="/start" className="btn-primary btn-lg">Try it online<ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
            <div className="way">
              <span className="way-ico"><MonitorDown size={22} aria-hidden="true" /></span>
              <h3>Windows app</h3>
              <ul>
                <li><CheckCircle2 size={15} aria-hidden="true" />The same editors in their own window, working offline</li>
                <li><CheckCircle2 size={15} aria-hidden="true" />Exports go straight to your job folder</li>
                <li><CheckCircle2 size={15} aria-hidden="true" />Sign in with your HingeLab account</li>
              </ul>
              <a href="#desktop" className="btn-ghost btn-lg"><Download size={18} aria-hidden="true" />Get the Windows app</a>
            </div>
          </div>
        </section>

        <section id="products" className="band">
          <div className="band-head">
            <h2>Everything you can make</h2>
            <p>Each generator starts from ready-made designs and gives you every option: sizes, shapes, fonts, materials, joints and engraving.</p>
          </div>
          <ul className="products">
            {products.map((p) => {
              return (
                <li key={p.id}>
                  <Link href={p.href} className="product">
                    <span className="p-pic">
                      { }
                      <img src={p.picture} alt="" width={300} height={200} loading="lazy" />
                    </span>
                    <span className="p-body">
                      <span className="p-title"><span className="p-ico"><ProductIcon id={p.id as ProductIconId} size={18} /></span>{p.name}</span>
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

        {(() => {
          const season = seasonal();
          if (!season) return null;
          return (
            <section id="season" className="band season">
              <div className="season-card">
                <div className="season-copy">
                  <p className="hero-eyebrow"><Sparkles size={14} aria-hidden="true" />New for the season</p>
                  <h2>{season.name} designs, ready to cut</h2>
                  <p>{season.intro}</p>
                  <Link href={`/collections/${season.slug}`} className="btn-primary btn-lg">See all {season.items.length} designs<ArrowRight size={18} aria-hidden="true" /></Link>
                </div>
                <ul className="season-pics">
                  {season.items.slice(0, 6).map((it) => (
                    <li key={`${it.product}/${it.id}`}><Link href={it.href} aria-label={it.name}><img src={it.picture} alt="" width={300} height={200} loading="lazy" /><span>{it.name}</span></Link></li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })()}

        <section id="motifs" className="band motifs">
          <div className="band-head">
            <h2>Detailed motifs that cut in one piece</h2>
            <p>Mandalas, girih stars, a tree of life and more, built so every part stays joined. Use them on signs, toppers, table numbers, trophies and key holders.</p>
          </div>
          <ul className="motif-grid">
            {SHOWCASE.map((m) => (
              <li key={m.id}>
                <Link href={m.preset.includes("&preset=") ? `/app/editor/local?p=${m.preset}` : `/generators/${m.preset}`} aria-label={`${MOTIF_NAMES[m.id]}: ${m.preset.includes("&preset=") ? "open a design with it" : "see the generator"}`}>
                  <svg viewBox="0 0 100 100" aria-hidden="true"><path d={motifPath(m.id)} fillRule="evenodd" /></svg>
                  <span>{MOTIF_NAMES[m.id]}</span>
                </Link>
              </li>
            ))}
          </ul>
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
          {heroSheet && (
            <HeroGenerator
              scene={sceneSVG(heroSheet.model, heroSheet.params, -0.6, 0.35)}
              sheet={<CutSheet sheet={heroSheet} trace className="hero-sheet" />}
              {...heroText(heroSheet, "rect", HERO_WIDTH.start, HERO_HEIGHT.start)}
            />
          )}
          <ul className="landing-gallery">
            {gallery.map((g, i) => (
              <li key={g.title}>
                { }
                <img className="g-box" src={`/landing-art/box-${i}.svg`} alt="" width={280} height={186} loading="lazy" decoding="async" />
                { }
                <img className="g-sheet" src={`/landing-art/sheet-${i}.svg`} alt={`Cut file: ${g.sheet.content.outline.length} parts`} width={560} height={280} loading="lazy" decoding="async" />
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
              <h2>The same editors, in their own window</h2>
              <p>Every generator, made on your computer and working offline. Exports go straight to your job folder, project files open with a double-click, and it updates itself. Signed in with your HingeLab account.</p>
              {release ? (
                <>
                  <a href={release.url} className="btn-primary btn-lg" download><Download size={18} aria-hidden="true" />Download for Windows</a>
                  <p className="d-fine">Version {release.version} · {release.size} · Windows 10 and 11 (64-bit)</p>
                  {release.sha256 && <p className="d-fine d-sha">SHA-256 <code>{release.sha256}</code></p>}
                  <DownloadNote />
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
                     
                    <img key={p.id} src={p.picture} alt="" width={150} height={100} loading="lazy" />
                  ))}
                </span>
              </span>
            </div>
          </div>
        </section>

        <section id="pricing" className="band">
          <div className="band-head"><h2>Pricing</h2><p>Start free. Upgrade when you sell what you make.</p></div>
          <Pricing cards={priceCards()} />
          <div className="pricing-sr">
          <table>
            <caption>Plan comparison</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Free</th>
                <th scope="col">Pro</th>
                <th scope="col">Business</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((r) => (
                <tr key={r.feature}>
                  <th scope="row">{r.feature}</th>
                  <td>{r.free === "✓" ? "Included" : r.free}</td>
                  <td>{r.pro === "✓" ? "Included" : r.pro}</td>
                  <td>{r.pro === "✓" ? "Included" : r.feature === "Batch generation" ? "Unlimited" : r.pro}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">License</th>
                <td>{LICENSES.free}</td>
                <td>{LICENSES.pro}</td>
                <td>{LICENSES.business}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <section id="faq" className="band faq">
          <div className="band-head"><h2>Questions</h2><p>Anything else? The guides cover materials, kerf, every generator and export.</p><p><Link href="/help" className="btn-ghost">Read the guides<ArrowRight size={16} aria-hidden="true" /></Link></p></div>
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
            <Link href="/start" className="btn-primary btn-lg">Start designing free<ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

const billingNext = (plan: string) => `/signup?next=${encodeURIComponent(`/app/billing?plan=${plan}`)}`;

function priceCards(): PriceCard[] {
  return [
    {
      id: "free", badge: "To try it", quiet: true, name: "Free", monthly: 0, yearly: 0, alt: "No account needed",
      features: ["Preview designs in the browser", "Rounded + Straight hinges", "Letters and parametric preview", `Batches of ${BATCH_FREE} (preview)`, "No save or download"],
      cta: "Start free", href: "/start",
    },
    {
      id: "pro", badge: "Most popular", popular: true, name: "Pro", monthly: PRICES.monthly, yearly: PRICES.yearly,
      alt: "",
      features: ["Save and export cut files", "Unlimited cloud projects", "All shapes and patterns", "Letters and every tool", "Full parametric sculptures", `Batches of ${BATCH_PRO}`, "Sell the items you cut"],
      cta: "Get Pro", href: billingNext("pro"), primary: true,
    },
    {
      id: "business", badge: "For a shop", name: "Business", monthly: PRICES.businessMonthly, yearly: PRICES.businessYearly,
      alt: "",
      features: ["Everything in Pro", "Unlimited batches", BUSINESS_SEATS, "Commercial-use license", "Priority support"],
      note: LICENSES.business,
      cta: "Get Business", href: billingNext("business"), primary: true,
    },
  ];
}

