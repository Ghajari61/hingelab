import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { LEATHERS, LASER_CHECKLIST, LASER_STATUS } from "@/lib/generators/leather/materials";
import { DECOR_NAMES, PRODUCTS, type ProductKind } from "@/lib/generators/leather/params";
import { LEATHER_PRESETS } from "@/lib/generators/leather/presets";
import { STITCH_NAMES, CUT_MODES } from "@/lib/generators/leather/stitch";
import { HW_NAMES } from "@/lib/generators/leather/hardware";
import "../landing.css";
import "../miniature-studio/studio.css";

export const metadata: Metadata = {
  title: "Leather Studio",
  description: "Parametric leather patterns for bags, wallets, cases and straps: seams matched hole for hole, hardware holes, lining, decoration, a laser safety check and a hand-cutting template.",
  alternates: { canonical: "/leather-studio" },
};

const editor = (preset?: string) => `/app/editor/local?p=leather${preset ? `&preset=${encodeURIComponent(preset)}` : ""}`;
const pic = (id: string) => `/presets/leather/${id}.svg`;
const productOf = (id: string) => (LEATHER_PRESETS.find((p) => p.id === id)?.params as { product: ProductKind }).product;

/** The studio's sections, in the brief's order; each says where in the one editor it lives. */
const SECTIONS: { id: string; title: string; text: string; start?: { label: string; preset: string }[] }[] = [
  { id: "dashboard", title: "Dashboard", text: "Start from a template below, or open the editor and pick a product on the left rail. Your saved designs are under My Projects." },
  { id: "library", title: "Product Library", text: `${Object.keys(PRODUCTS).length} products: bags built from faces and a gusset, wrapped bags, a bucket bag, a one-piece folded bag, small leather goods and straps. Each product loads its own starting sizes.` },
  { id: "advanced", title: "Advanced Designer", text: "Every product shows the settings it uses: size, construction (lining, zips, flaps, closures, handles, straps, feet, dividers, compartments), pockets and straps, stitching, hardware, decoration and material.", start: [{ label: "Structured handbag", preset: "structured-handbag" }, { label: "Executive briefcase", preset: "executive-briefcase" }] },
  { id: "generator", title: "Parametric Generator", text: "The pattern is rebuilt from the settings on every change: panels, gussets, linings, pockets, tabs and straps, with their stitch holes and hardware holes. Gussets longer than the bed are cut in two parts with a stitched joint, and long bag straps in two halves joined by a buckle." },
  { id: "pattern", title: "2D Pattern Editor", text: "The sheet view shows every part as it will be cut, with cut, score (folds, alignment ticks, hole marks) and engrave layers. Parts are shaped by their settings; there is no free-form node editor for leather parts yet." },
  { id: "assembly3d", title: "3D Assembly Studio", text: "The 3D view places the panels where they go and lays the loose pieces flat behind the product. It is a simplified preview: drape, stretch and stitching are not simulated, and flat goods and straps are shown laid out flat." },
  { id: "stitching", title: "Stitching Studio", text: `Seams are matched by arc length, so both sides of every seam get the same number of holes; any length difference is reported. Stitches: ${Object.values(STITCH_NAMES).join(", ")}. Holes are round or slanted.`, start: [{ label: "Wood and leather handbag (lacing)", preset: "wood-leather-bag" }] },
  { id: "hardware", title: "Hardware Studio", text: `Mounting holes are cut from the sizes you measure on your own hardware: ${Object.values(HW_NAMES).join(", ")}. Each design lists its hardware.`, start: [{ label: "Roll-top backpack", preset: "rolltop-backpack" }] },
  { id: "decor", title: "Decorative Pattern Studio", text: `${Object.keys(DECOR_NAMES).length - 1} styles, perforated, engraved or scored, kept clear of the stitching and fittings: ${Object.entries(DECOR_NAMES).filter(([k]) => k !== "none").map(([, v]) => v).join(", ")}. All are HingeLab's own procedural patterns; none copies a maker's design.`, start: [{ label: "Perforated coaster", preset: "perforated-coaster" }, { label: "Notebook cover", preset: "notebook-cover" }] },
  { id: "materials", title: "Leather Materials", text: "Laser safety is decided by the material, and nothing is assumed safe. The material list and what each allows is below." },
  { id: "laser", title: "Laser Manufacturing", text: `Three cut files: ${Object.values(CUT_MODES).join(", ")}. Laser files need the material confirmed first, and carry the safety list below. No laser settings are given: find them by testing on an offcut.` },
  { id: "nesting", title: "Nesting Optimizer", text: "Parts are packed on the sheets by the editor's layout, which can also nest by outline. It finds a good layout, not a proven optimum." },
  { id: "cost", title: "Cost Estimator", text: "The export's job summary estimates cut length, time and material cost, labelled as estimates. Each design also lists its leather area, thread and hardware. Leather, hardware and labour prices are not built in." },
  { id: "instructions", title: "Assembly Instructions", text: "Every design comes with its assembly steps, and the export can make the step-by-step assembly booklet (PDF)." },
  { id: "projects", title: "My Projects", text: "Designs save to your projects like every other generator's." },
  { id: "export", title: "Export Center", text: "SVG, DXF, PDF, LightBurn, a 3D model (GLB), the parts list (CSV) and the assembly booklet. Laser formats are refused until the material is confirmed; the hand-cutting template is always available." },
];

export default function LeatherStudio() {
  return (
    <PageShell title="Leather Studio" lede="Parametric leather patterns for bags, wallets, cases and straps, with seams matched hole for hole. Everything here opens in the same editor.">
      <p className="gen-actions"><Link className="btn-primary btn-lg" href={editor()}>Open the studio</Link></p>
      <nav aria-label="Studio sections" className="mstudio-toc">
        <ol>{SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
      </nav>
      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} className="mstudio-sec">
          <h2>{i + 1}. {s.title}</h2>
          <p>{s.text}</p>
          {s.start && (
            <ul className="ia-grid mstudio-start">
              {s.start.map((x) => <li key={x.preset}><Link className="ia-card" href={editor(x.preset)}><span className="ia-pic"><img src={pic(x.preset)} alt="" width={300} height={200} loading="lazy" /></span><b>{x.label}</b></Link></li>)}
            </ul>
          )}
          {s.id === "library" && <Templates />}
          {s.id === "materials" && <Materials />}
          {s.id === "laser" && <ul className="mstudio-list">{LASER_CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ul>}
        </section>
      ))}
      <p className="note">Nothing here has been checked on a real build. Make a test piece before cutting good leather. <Link href="/help">Help centre</Link>.</p>
    </PageShell>
  );
}

function Templates() {
  const cats = [...new Set(LEATHER_PRESETS.map((p) => PRODUCTS[productOf(p.id)].category))];
  return (
    <>
      {cats.map((c) => {
        const list = LEATHER_PRESETS.filter((p) => PRODUCTS[productOf(p.id)].category === c);
        return (
          <div key={c}>
            <h3>{c} ({list.length})</h3>
            <ul className="ia-grid mstudio-templates">
              {list.map((p) => <li key={p.id}><Link className="ia-card" href={editor(p.id)}><span className="ia-pic"><img src={pic(p.id)} alt="" width={240} height={160} loading="lazy" /></span><b>{p.name}</b><span className="mstudio-note">{p.note} · {PRODUCTS[productOf(p.id)].complexity}</span></Link></li>)}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Materials() {
  return (
    <div className="mstudio-scroll">
      <table className="mstudio-table">
        <thead><tr><th>Material</th><th>Laser</th><th>Typical thickness</th><th>Notes</th></tr></thead>
        <tbody>{LEATHERS.map((l) => <tr key={l.id}><td><b>{l.name}</b></td><td>{LASER_STATUS[l.laser]}</td><td>{l.T} mm</td><td>{l.notes}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
