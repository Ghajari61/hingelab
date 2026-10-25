/** The free browser tools: one page each, so people searching for the job find it. */
export type ToolId = "thickness-resizer" | "svg-to-stl" | "nesting";

export interface ToolInfo {
  id: ToolId;
  name: string;
  /** Page title for search. */
  title: string;
  blurb: string;
  steps: string[];
  faq: { q: string; a: string }[];
}

export const TOOLS: ToolInfo[] = [
  {
    id: "thickness-resizer", name: "Thickness resizer", title: "Resize a laser cut file for a different material thickness",
    blurb: "A box or puzzle drawn for 3 mm plywood, scaled so its slots and tabs fit 4 mm, 6 mm or 1/8\" stock. Upload an SVG, enter both thicknesses, download.",
    steps: ["Upload the SVG you want to cut.", "Enter the thickness it was drawn for and the thickness of your sheet (measure it with calipers).", "Download the scaled file and cut a small test piece first."],
    faq: [
      { q: "Why does the whole file get bigger?", a: "Slots are as wide as the material. To make them fit thicker stock everything has to grow by the same factor, or the parts stop meeting. A 3 mm design on 4 mm stock comes out a third larger." },
      { q: "Does it change my paths?", a: "No. Only the size on the <svg> tag changes, so every line, layer and colour stays exactly as it was." },
      { q: "Is my file uploaded?", a: "No. The file is read and scaled in your browser and never leaves your device." },
    ],
  },
  {
    id: "svg-to-stl", name: "Laser to 3D print", title: "Convert a laser cut SVG to an STL for 3D printing",
    blurb: "The parts of a laser cut file as solid pieces at the thickness you choose, ready for your slicer. Cut lines become parts and holes; engraving and score lines are left out.",
    steps: ["Upload a laser SVG (HingeLab files, or any SVG whose cut lines are closed shapes).", "Choose how thick the printed parts should be.", "Download the STL and open it in your slicer."],
    faq: [
      { q: "Which lines become parts?", a: "Closed cut lines: red and green layers in HingeLab files, or every stroked layer in other files. Shapes inside shapes become holes." },
      { q: "Will slotted parts fit together?", a: "Usually, at the same thickness as the slots. Printers vary, so print one joint first and adjust the thickness by a tenth of a millimetre if it is tight." },
      { q: "Is my file uploaded?", a: "No. The conversion runs in your browser." },
    ],
  },
  {
    id: "nesting", name: "Sheet nesting", title: "Nest laser cut parts on sheets to save material",
    blurb: "Upload an SVG and the parts are packed onto sheets of your size by their real shapes, turned where it helps, with engraving kept on its part.",
    steps: ["Upload an SVG with the parts drawn as closed cut lines.", "Enter your sheet size, the margin and the gap between parts.", "Download the nested file: one sheet under another, layers and colours kept."],
    faq: [
      { q: "What counts as a part?", a: "A shape closed by cut lines (red or green layers in HingeLab files, every stroked layer otherwise), with its holes. Engraving and score lines inside it move with it." },
      { q: "Are curves kept?", a: "Curves are written as fine straight segments (well under the laser's kerf), which every laser program reads." },
      { q: "Is my file uploaded?", a: "No. Nesting runs in your browser; a big file can take a few seconds." },
    ],
  },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);
