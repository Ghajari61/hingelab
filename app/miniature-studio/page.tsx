import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { MINIATURE_PRESETS } from "@/lib/generators/miniature/presets";
import { REGIONS, TRADITIONS } from "@/lib/generators/miniature/traditions";
import { TRADITION_SOURCES } from "@/lib/generators/miniature/traditionSources";
import { FORMAT_INFO, EXPORT_FORMATS } from "@/lib/export/profiles";
import { MACHINE_PROFILES } from "@/lib/studio/library";
import "../landing.css";
import "./studio.css";

export const metadata: Metadata = {
  title: "World Miniature Studio",
  description: "Laser-cut dollhouses from 29 architectural traditions, book nooks, dollhouse furniture and garden pieces: templates, the architecture library with sources, joints and fit test, machines, 3D and exports.",
  alternates: { canonical: "/miniature-studio" },
};

const editor = (preset?: string) => `/app/editor/local?p=miniature${preset ? `&preset=${encodeURIComponent(preset)}` : ""}`;
const pic = (id: string) => `/presets/miniature/${id}.svg`;
const byDesign = (d: string) => MINIATURE_PRESETS.filter((p) => (p.params as { design: string }).design === d);

/** The twelve parts of the studio, each with where to start. */
const SECTIONS: { id: string; title: string; text: string; start: { label: string; preset: string }[] }[] = [
  { id: "buildings", title: "1. Dollhouses and buildings", text: "One to six floors, rooms with doorways, stairs with a railing, an open front or a facade, and six roof shapes. Windows come in five shapes with bars, grids, shoji grids or lattice screens, and walls and roofs carry scored brick, stone, half-timbering, boards, shingles or tiles.", start: [{ label: "Victorian dollhouse", preset: "victorian-dollhouse" }, { label: "Kyoto machiya", preset: "kyoto-machiya" }] },
  { id: "themes", title: "2. Country and town houses", text: "Two themes set a whole look at once. The country house gets a veranda on turned posts, dormers, window boxes, a chimney and a fenced garden. The town house gets a shopfront, balconies, pilasters, a mansard and a pavement with lamps. Every setting stays editable.", start: [{ label: "Country farmhouse", preset: "country-farmhouse" }, { label: "Town shop house", preset: "town-shop-house" }] },
  { id: "details", title: "3. Fronts, roofs and details", text: "Door leaves, steps, porches, verandas on square, turned or classical posts, balconies with railings and brackets, pilasters, window boxes, dormers and a chimney through the roof, each placed only where it fits and tabbed into what it stands on.", start: [{ label: "Manor house", preset: "manor-house" }, { label: "Attic cottage", preset: "attic-cottage" }] },
  { id: "nooks", title: "4. Book nooks", text: "Boxes that stand between books: an alley between facades or arches receding between shelves, with a light box for an LED strip, a battery bay with a hatch and an optional mirror frame. Use only low-voltage LED kits made for book nooks; the mirror's effect is not simulated.", start: [{ label: "Gothic library", preset: "nook-gothic-library" }, { label: "Old town alley", preset: "nook-old-town-alley" }] },
  { id: "furniture", title: "5. Miniature furniture", text: "Fourteen pieces, from chairs and beds to sofas, wardrobes, fireplaces and kitchen counters, entered at full size and divided by the scale (1:6 to 1:48 or your own). The sheet, tabs, fit and kerf are never scaled.", start: [{ label: "Sofa, 1:12", preset: "sofa-1-12" }, { label: "Fireplace, 1:12", preset: "fireplace-1-12" }] },
  { id: "garden", title: "6. Garden and street", text: "Houses can stand in a garden (fence, gate, path, beds, trees) or on a pavement (kerb, lamps). The same trees, pines, bushes, lamps, columns, fence runs and planters can be made on their own for a diorama.", start: [{ label: "Garden tree", preset: "garden-tree" }, { label: "Street lamp", preset: "street-lamp" }] },
  { id: "library", title: "7. Architecture library", text: "The traditions the designs start from, listed below with the sources their short descriptions were compared with.", start: [] },
  { id: "templates", title: "8. Templates", text: "Every ready-made design, listed below. Each opens in the editor, where any setting can be changed.", start: [] },
  { id: "joints", title: "9. Joints and the fit test", text: "Every part slots together with tabs one sheet thick through slots cut to them. Cut the fit test first: five slots from Looser to Tighter and a key. Choose the slot that holds the key firmly and set that fit under Joints. Kerf is added by the export.", start: [{ label: "Joint fit test", preset: "fit-test" }] },
  { id: "machines", title: "10. Materials and machines", text: "Set the material's real thickness in the editor. The export checks the sheets against the machine's bed. The built-in machines are listed below with their published bed size, power and top speed.", start: [] },
  { id: "export", title: "11. 3D preview, export and cost", text: "The 3D view shows the assembly as cut. It is a preview, not a physical simulation. The export makes cut files, a 3D model and a parts list, and its job summary estimates the cut length, the time and the material cost, labelled as estimates.", start: [] },
  { id: "ai", title: "12. AI designer", text: "Describe a house, a nook or a piece of furniture and the AI designer picks the template and settings that make it, using only what the generator can build. It runs on HingeLab's server; no keys are in the browser.", start: [] },
];

export default function MiniatureStudio() {
  return (
    <PageShell title="World Miniature Studio" lede="Laser-cut dollhouses, book nooks, dollhouse furniture and garden pieces that slot together with tabs, from 29 architectural traditions. Everything here opens in the same editor.">
      <p className="gen-actions"><Link className="btn-primary btn-lg" href={editor()}>Open the studio</Link></p>
      <nav aria-label="Studio sections" className="mstudio-toc">
        <ol>{SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title.replace(/^\d+\. /, "")}</a></li>)}</ol>
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="mstudio-sec">
          <h2>{s.title}</h2>
          <p>{s.text}</p>
          {s.start.length > 0 && (
            <ul className="ia-grid mstudio-start">
              {s.start.map((x) => (
                <li key={x.preset}><Link className="ia-card" href={editor(x.preset)}><span className="ia-pic"><img src={pic(x.preset)} alt="" width={300} height={200} loading="lazy" /></span><b>{x.label}</b></Link></li>
              ))}
            </ul>
          )}
          {s.id === "library" && <Library />}
          {s.id === "templates" && <Templates />}
          {s.id === "machines" && <Machines />}
          {s.id === "export" && (
            <ul className="mstudio-list">
              {EXPORT_FORMATS.map((f) => <li key={f}><b>{FORMAT_INFO[f].name}</b>: {FORMAT_INFO[f].about}</li>)}
            </ul>
          )}
          {s.id === "ai" && <p><Link href="/app/ai">Open the AI designer</Link> (sign-in needed).</p>}
        </section>
      ))}
    </PageShell>
  );
}

function Library() {
  return (
    <>
      <p className="note">
        Marked <b>sourced</b>: the short description was compared with the sources listed and corrected where a source disagreed. No specialist has reviewed it yet. The models are simplified, original interpretations, not reconstructions. The storybook style is fictional.
      </p>
      <div className="mstudio-scroll">
        <table className="mstudio-table">
          <thead><tr><th>Tradition</th><th>Regions</th><th>Period</th><th>Roof</th><th>Sources</th><th>Status</th></tr></thead>
          <tbody>
            {TRADITIONS.map((t) => (
              <tr key={t.id}>
                <td><b>{t.name}</b>{t.fictional ? " (fictional)" : ""}{TRADITION_SOURCES[t.id]?.note ? <details><summary>Notes</summary>{TRADITION_SOURCES[t.id]!.note}</details> : null}</td>
                <td>{t.regions.map((r) => REGIONS[r]).join(", ")}</td>
                <td>{t.period}</td>
                <td>{t.roof}</td>
                <td>{t.sources.length ? t.sources.map((s, i) => <span key={i}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.publisher || s.title}</a></span>) : "None"}</td>
                <td>{t.verification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Templates() {
  const groups: [string, string][] = [["house", "Buildings"], ["nook", "Book nooks"], ["furniture", "Furniture"], ["accessory", "Garden, street and tools"]];
  return (
    <>
      {groups.map(([d, title]) => (
        <div key={d}>
          <h3>{title} ({byDesign(d).length})</h3>
          <ul className="ia-grid mstudio-templates">
            {byDesign(d).map((p) => (
              <li key={p.id}><Link className="ia-card" href={editor(p.id)}><span className="ia-pic"><img src={pic(p.id)} alt="" width={240} height={160} loading="lazy" /></span><b>{p.name}</b><span className="mstudio-note">{p.note}</span></Link></li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Machines() {
  return (
    <div className="mstudio-scroll">
      <table className="mstudio-table">
        <thead><tr><th>Machine</th><th>Laser</th><th>Bed</th><th>Top speed</th></tr></thead>
        <tbody>
          {MACHINE_PROFILES.map((m) => (
            <tr key={m.id}><td>{m.name}</td><td>{m.watts} W {m.laser === "co2" ? "CO₂" : m.laser}</td><td>{m.bedW} × {m.bedH} mm</td><td>{m.maxSpeed} mm/s</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
