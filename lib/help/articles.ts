/** The help centre's articles. Option lists come from the field definitions (`fieldEntries`). */
import { GENERATOR_IDS, GENERATOR_INFO, type GeneratorId } from "@/lib/generators/ids";
import type { HelpProduct } from "./sections";

export type HelpBlock = { h?: string; p?: string; list?: string[] };

export interface HelpImage {
  /** Under public/: `/help/svg/…` is drawn from the geometry, `/help/shots/…` is a screenshot, `/presets/…` a preset. */
  src: string;
  alt: string;
  caption?: string;
}

/** The number fields of these panel sections, listed with their units, range and help. */
export interface FieldGroupRef {
  product: HelpProduct | GeneratorId;
  secs: string[];
  title?: string;
  /** Other products with the same fields (same ids and meaning). */
  alsoFor?: HelpProduct[];
}

export interface HelpArticle {
  slug: string;
  product: HelpProduct | GeneratorId | "general";
  title: string;
  summary: string;
  blocks: HelpBlock[];
  images?: HelpImage[];
  fields?: FieldGroupRef[];
  related?: string[];
  /** Extra words people search for. */
  keywords?: string[];
}

export const PRODUCT_NAMES: Record<HelpArticle["product"], string> = {
  general: "Getting around",
  hinge: "Hinge Box",
  letters: "Letters",
  parametric: "Parametric",
  ...(Object.fromEntries(GENERATOR_IDS.map((id) => [id, GENERATOR_INFO[id].name])) as Record<GeneratorId, string>),
};

const shot = (name: string, alt: string, caption?: string): HelpImage => ({ src: `/help/shots/${name}.jpg`, alt, caption });
const svg = (name: string, alt: string, caption?: string): HelpImage => ({ src: `/help/svg/${name}.svg`, alt, caption });
const preset = (product: HelpProduct, id: string, alt: string, caption?: string): HelpImage => ({ src: `/presets/${product}/${id}.svg`, alt, caption });

export const ARTICLES: HelpArticle[] = [
  // ── Getting around ───────────────────────────────────────────────────────
  {
    slug: "getting-started", product: "general", title: "Make your first cut",
    summary: "Pick a product and a preset, adjust it, check it and export an SVG for your laser.",
    keywords: ["start", "begin", "first", "tutorial", "new"],
    images: [shot("start", "The start gallery with the three products and their presets")],
    blocks: [
      { list: [
        "Open the app and pick a product: Hinge Box (a box whose walls bend round the corners), Letters (boxes, signs and stencils from text) or Parametric (a 3D model sliced into flat parts).",
        "Pick a preset from the gallery. Every preset is a finished design, so you can export it straight away or use it as a starting point.",
        "Set your material first: its thickness and kerf decide every slot and hinge. Then change the size and options in the panels on the right.",
        "Read the checks under Analysis. Anything that will not cut well is listed with buttons that fix it; Auto-fix all applies the safe ones.",
        "Export the SVG and open it in your laser software (LightBurn, xTool Creative Space, Glowforge, RDWorks, LaserGRBL or Inkscape).",
        "Cut a small test first, such as a bend test strip, before you cut the whole design in good material.",
      ] },
      { h: "Where things are", list: [
        "Left: the big choices as picture cards (shape, lid, pattern, mode or method), with Undo and Redo on top.",
        "Middle: the sheet view or the 3D view, with zoom and fit tools at the bottom.",
        "Right: the settings, in sections you can fold. Each section has a ? that opens its help, and a reset icon.",
        "Bottom: the status bar shows the cursor position, the zoom and whether the parts fit the sheet.",
      ] },
    ],
    related: ["presets", "material-and-kerf", "checks-and-fixes", "layers-and-export"],
  },
  {
    slug: "presets", product: "general", title: "Presets and your own presets",
    summary: "Every product starts from a gallery of ready designs; save your own settings as presets too.",
    keywords: ["template", "gallery", "save", "my presets"],
    images: [preset("hinge", "tea-box", "Tea box preset"), preset("letters", "name-box", "Name box preset"), preset("parametric", "leaf-clock", "Leaf clock preset")],
    blocks: [
      { p: "The start gallery shows a dozen or more presets for each product. Their pictures are drawn from the real geometry, so what you see is what the preset cuts." },
      { h: "Save your own", list: [
        "File → Save as my preset… stores the current settings under a name.",
        "Your presets appear in the gallery beside the built-in ones. Signed in, they follow your account; otherwise they stay on this device.",
        "The Hinge Box rail also has hinge styles (Standard, Fine, Flexible and more): ready-made hinge settings you can apply to any box.",
      ] },
    ],
    related: ["getting-started", "undo-and-reset"],
  },
  {
    slug: "ai-designer", product: "general", title: "AI designer",
    summary: "Describe a product or add a photo of one, and the AI designer sets up the closest HingeLab product for you to fine-tune and cut.",
    keywords: ["ai", "artificial intelligence", "prompt", "photo", "picture", "describe", "generate", "assistant"],
    blocks: [
      { p: "The AI designer is at AI designer in the account menu bar (and in the sidebar of the Windows app). Sign in to use it." },
      { list: [
        "Write what you want to make, with sizes if you know them: “a round tea tin, 9 cm across and 12 cm tall, with a removable lid”. Any language works, and words that go on the product keep their own script.",
        "Or add a photo of a product (pick a file, drop it or paste it). A description and a photo together work best.",
        "Choose Design it. In 10 to 30 seconds you get the product it picked, the design's settings and, for the Hinge Box and generators, the cut file.",
        "Open in editor applies the design over your current one as a single undo step, so Ctrl+Z brings your last design back. Download SVG saves the cut file straight away.",
      ] },
      { h: "What it can and cannot do", list: [
        "It chooses one of HingeLab's products and fills in its settings; the geometry is always made by that product, so every slot, hinge and joint is the same as a design you set up by hand.",
        "It cannot invent a new kind of product. When nothing fits well, it says “Nearest product” and notes what is different.",
        "Check the sizes it chose before you cut. Notes under the design list anything it had to guess or could not do.",
        "Free accounts get 10 AI designs a day and Pro accounts 60. Designs that use Pro shapes or generators still need Pro to preview and export.",
      ] },
    ],
    related: ["ai-studio", "getting-started", "presets", "checks-and-fixes"],
  },
  {
    slug: "ai-studio", product: "general", title: "AI Studio",
    summary: "Make pictures from words, clean up photos, prepare engravings and cut-ready outlines, and ask the assistant, all inside a Studio project.",
    keywords: ["ai", "ai studio", "text to image", "image to image", "sketch", "dither", "engrave photo", "vectorize", "upscale", "cutout", "remove background", "inpaint", "outpaint", "depth", "relief", "assistant", "chat", "credits"],
    blocks: [
      { p: "Open a Studio project and pick AI Studio in the panel dock (or Window → AI Studio). In the Windows app, the AI Studio tile on the dashboard opens a new project with the panel showing." },
      { h: "Create", list: [
        "Text to image: describe the picture, pick a style (line art, flat vector, engraving hatch, woodcut, stencil, mandala, silhouette, sticker or layered) and the shape. The picture lands on the canvas as an image object.",
        "Image to design: select a picture or a photo of a hand sketch and the model redraws it in the chosen style.",
        "Design kits fill in the words for you (cake topper, pet coaster, door sign, trophy emblem, lantern pattern, kids' puzzle, mandala set, layered wall art) and take the result to the next step.",
      ] },
      { h: "Image", list: [
        "Smart Adjust suggests black point, white point and mid-tones for the selected image; change them and apply. Auto enhance and Upscale 2× or 4× sharpen and enlarge it.",
        "Cutout removes the background: Quick works on a plain background, AI cutout on any. Image Redraw repaints a part you brush over; Creative Expand adds room around the picture.",
        "Line art, Portrait outline and Cartoon turn a photo into lines or flat colour areas.",
      ] },
      { h: "Laser", list: [
        "Photo to engraving dithers the image for wood, acrylic, leather, slate or anodised aluminium (Floyd–Steinberg, Jarvis, Stucki, Atkinson, ordered or halftone) and can set the engrave layer's power, speed and line interval from the material library.",
        "Vectorize with cut check traces the image with smoothing, a thinnest-part limit and bridges, then checks it against your material and machine: parts too thin, loose pieces, stencil pockets and a design bigger than the bed are listed with fixes, and Fix all applies the safe ones.",
        "The same dialog makes a cake topper with its stake, a sign board with hanging holes, a perforated lamp panel, or opens the Trophy, Clock or Puzzle generator with the art.",
        "Depth map and Stacked relief read the depth of a photo on this computer and cut it into sheets to glue in a stack; Open as a 3D relief hands the photo to Parametric.",
      ] },
      { h: "Assistant, jobs and credits", list: [
        "The assistant knows the project's material, machine and layers. It suggests power and speed from the material library, makes finished designs (“a 120 mm hinge box with my name on the lid”) and prepares pictures; nothing changes until you press Apply.",
        "Every job shows its progress in Jobs, where you can cancel it, select its result, run it again or change its prompt. Results are ordinary objects, so Ctrl+Z undoes them.",
        "Tools that run on this computer are free. Cloud tools (pictures, redraw, expand, AI cutout and the assistant) use credits: 12 a day on the free plan and 150 on Pro. Sign in to use them.",
      ] },
    ],
    related: ["ai-designer", "checks-and-fixes"],
  },
  {
    slug: "undo-and-reset", product: "general", title: "Undo, redo and reset",
    summary: "Every change can be undone. Reset a field, a section or the whole design back to its defaults.",
    keywords: ["undo", "redo", "reset", "defaults", "history"],
    blocks: [
      { list: [
        "Undo and Redo sit at the top of the left rail (Ctrl+Z and Ctrl+Shift+Z). The last 100 steps are kept.",
        "Double-click a field's label, or click its reset icon, to put it back to its default.",
        "The reset icon on a section header resets the whole section.",
        "Reset all (top right) resets the whole design. It is one undo step, so Ctrl+Z brings your design back.",
        "Fixes and Auto-fix all are single undo steps too.",
      ] },
    ],
    related: ["shortcuts", "checks-and-fixes"],
  },
  {
    slug: "material-and-kerf", product: "general", title: "Material, thickness and kerf",
    summary: "Pick a material preset, then measure your real sheet thickness and your laser's kerf.",
    keywords: ["kerf", "thickness", "plywood", "mdf", "acrylic", "calibration", "material"],
    fields: [{ product: "hinge", secs: ["secMat"], alsoFor: ["letters"] }],
    blocks: [
      { p: "Material presets fill in a typical thickness and kerf, and pick how the 3D view looks (plywood, MDF, card or acrylic). Changing either number switches the preset to Custom." },
      { h: "Measure your thickness", p: "Measure the sheet with calipers in a few places. Sheet sold as 3 mm is often 2.7 to 3.2 mm, and slots cut for the wrong thickness are loose or will not close." },
      { h: "Measure your kerf", list: [
        "Cut a 20 mm square and measure it with calipers.",
        "Kerf is 20 minus the measured size. For example, a 19.84 mm square means a 0.16 mm kerf.",
        "HingeLab offsets every outline by half the kerf, so parts come out at their true size and joints fit.",
      ] },
    ],
    related: ["box-joints", "hinge-pattern", "parametric-material"],
  },
  {
    slug: "sheet-and-fit", product: "general", title: "Sheet size and Fit to sheets",
    summary: "Set your laser bed or sheet, then let HingeLab scale the design to fit one sheet, a set number of sheets, or use as many as needed.",
    keywords: ["bed", "sheet", "fit", "scale", "nesting", "too big", "k40"],
    images: [shot("sheet-fit", "The Sheet section with Fit product to set to 1 sheet")],
    fields: [{ product: "hinge", secs: ["secSheet"], alsoFor: ["letters"] }],
    blocks: [
      { p: "Sheet preset fills in common laser beds (K40, Glowforge, xTool P2 and S1, OMTech) and paper and stock sheet sizes. You can type any size." },
      { h: "Fit product to", list: [
        "Off: parts are laid out in rows on one sheet at the design size. If they do not fit, the status bar says so.",
        "1 sheet: the design is scaled down until every part fits one sheet. Your typed sizes stay as they are; the result shows the scale used.",
        "N sheets: the same, but over the number of sheets you choose.",
        "Auto: keeps the design size and uses as many sheets as it needs.",
      ] },
      { p: "Scaling keeps the material thickness, kerf and joint sizes, so the parts still fit together. Turning the sheet (swapping width and height) sometimes fits a long wall without scaling." },
    ],
    related: ["checks-and-fixes", "layers-and-export"],
  },
  {
    slug: "view-3d", product: "general", title: "The 3D view",
    summary: "See the assembled design in 3D, explode it, or lay every part flat as it will be cut.",
    keywords: ["3d", "preview", "orbit", "explode", "lay flat", "view cube", "dimensions", "size", "top", "front", "left", "perspective", "edges", "quad", "viewport"],
    images: [shot("hinge-3d", "The 3D view of a Hinge Box")],
    blocks: [
      { list: [
        "Switch between Sheets and 3D view at the top of the stage; the 3D toolbar sits beside the switch. The same 3D workspace is in every editor and in the Windows app.",
        "Like a 3D modelling program, it shows four views: Top, Front, Left and Perspective. The active view has a yellow frame. The four-views button, Alt+W or a double-click on a view's name shows one view large and back again; T, F, L and P pick a view.",
        "In the Perspective view, drag to orbit; in every view, middle- or right-drag to pan and scroll to zoom. The view cube turns the model to a set view and its home button goes back to the start. Z frames the model in the active view, Shift+Z or the zoom-extents button in every view.",
        "Shaded or Edges (F4) chooses how the parts are drawn; Edges outlines every part. Click a part to select it, Esc to clear.",
        "The overall width, depth and height are drawn on every view, in your units; the ruler button hides them. A top view shows width and depth, a front view width and height. They are hidden while the model is exploded.",
        "Explode (Lift lid for a letter box) pulls the parts apart so you can see how they go together.",
        "Assembled shows the finished piece; Lay flat shows every part as a slab where it sits on the sheet, with the hinge cuts drawn on top.",
        "The material look follows your material preset: plywood, MDF, card or clear acrylic.",
      ] },
    ],
    related: ["getting-started", "parametric-inspector"],
  },
  {
    slug: "checks-and-fixes", product: "general", title: "Checks and Auto-fix",
    summary: "Each product checks your design as you edit. Problems come with buttons that fix them; Auto-fix all applies the safe fixes in one step.",
    keywords: ["warning", "error", "issue", "problem", "auto-fix", "fix", "crack"],
    images: [shot("checks", "To check with a problem and its fix buttons")],
    blocks: [
      { p: "Checks appear under Analysis (Bend Analysis for the Hinge Box). Red rows stop the design from being built, amber rows will probably not cut or assemble well, and notes are worth knowing." },
      { h: "Fixes", list: [
        "Each row offers one or more fixes as buttons. A fix changes your settings, and you can undo it with Ctrl+Z.",
        "Fixes with an accent border are safe: they keep your design's intent (fit the sheet, pick a font that has your letters, auto-fit the hinge).",
        "Other fixes change the design's character, such as switching to the Serpentine pattern or using a bigger hub, so they are only applied when you click them.",
        "Fixes are tried before they are offered, so a fix always clears its problem.",
      ] },
      { h: "Auto-fix all", p: "Applies the safe fixes one at a time, worst problem first, and checks again after each. It is one undo step." },
    ],
    related: ["hinge-analysis", "letters-analysis", "parametric-analysis"],
  },
  {
    slug: "layers-and-export", product: "general", title: "Layers and export",
    summary: "Each kind of cut has its own coloured layer, so your laser software can give it its own speed and power.",
    keywords: ["svg", "export", "lightburn", "layers", "colours", "cut order", "zip", "engrave", "labels"],
    images: [shot("layers", "The Layers section with its colours and switches")],
    blocks: [
      { list: [
        "Outline cut (red, LightBurn C02): the outer edge of every part.",
        "Inner cuts (green, C03): slots and holes inside parts.",
        "Hinge slits (blue, C01): the living hinge.",
        "Part labels (black, C00): engraved names, so you know which part is which.",
      ] },
      { p: "Layers are written in cut order: inner cuts first, then the hinge, then the outline, so parts do not move before they are finished." },
      { h: "Switches", list: [
        "The eye shows or hides a layer on screen.",
        "The tick box includes or leaves out a layer in the export.",
        "Engrave part names adds the labels layer.",
      ] },
      { h: "Export", list: [
        "Export SVG saves every sheet in one file, sized in millimetres.",
        "Parametric exports every sheet as a ZIP or the current sheet as one SVG, and prints an assembly guide.",
      ] },
    ],
    related: ["sheet-and-fit", "getting-started"],
  },
  {
    slug: "shortcuts", product: "general", title: "Keyboard shortcuts",
    summary: "Move round the sheet, undo, save and export from the keyboard.",
    keywords: ["keyboard", "keys", "hotkeys"],
    blocks: [
      { list: [
        "H: hand tool. Z: zoom tool. Hold Space to pan.",
        "Ctrl+0: fit sheet. Ctrl+1: actual size. Ctrl+Plus and Ctrl+Minus: zoom.",
        "Ctrl+Z: undo. Ctrl+Shift+Z: redo.",
        "Ctrl+S: save project. Ctrl+O: open. Ctrl+E: export SVG.",
        "In a field: Up and Down step the value, with Shift for ten steps. Drag a field's label to scrub.",
        "On macOS, use ⌘ for Ctrl.",
        "In the Studio editor, every menu item shows its shortcut and the command palette (Ctrl+/) finds every command.",
      ] },
    ],
    related: ["undo-and-reset"],
  },

  // ── Hinge Box ────────────────────────────────────────────────────────────
  {
    slug: "hinge-shape-and-lid", product: "hinge", title: "Box shape and lid",
    summary: "Rounded, pill, polygon or cylinder; open, with a fixed lid, or with a lid that lifts off.",
    keywords: ["rounded", "pill", "polygon", "cylinder", "lid", "tray"],
    images: [preset("hinge", "tea-box", "A rounded box with a removable lid"), preset("hinge", "hex-jewel", "A hexagonal box"), preset("hinge", "pencil-cup", "A cylinder")],
    blocks: [
      { h: "Shape", list: [
        "Rounded: a rectangle with rounded corners. The hinge wraps each corner.",
        "Pill: a rectangle with fully round ends.",
        "Polygon: 3 to 12 sides with rounded corners.",
        "Cylinder: the whole wall bends; tabs sit on short flats.",
      ] },
      { h: "Lid", list: [
        "Open tray: no lid.",
        "Fixed lid: a lid joined to the walls with tabs, like the base.",
        "Removable lid: a lid with a lip that sits inside the walls, so it lifts off. Lid gap sets how loose it is.",
      ] },
      { p: "Pill, Polygon and Cylinder are Pro shapes; you can preview them on the Free plan." },
    ],
    related: ["hinge-dimensions", "box-joints"],
  },
  {
    slug: "hinge-dimensions", product: "hinge", title: "Dimensions",
    summary: "The outside size of the box and its corner radius.",
    keywords: ["size", "width", "depth", "height", "radius", "corner"],
    fields: [{ product: "hinge", secs: ["secDims"] }],
    blocks: [
      { p: "All sizes are outside sizes, base and lid included. The corner radius matters most: the hinge has to bend round it, so a small radius needs a softer hinge. Bend Analysis checks it for you." },
    ],
    related: ["hinge-pattern", "hinge-analysis"],
  },
  {
    slug: "hinge-pattern", product: "hinge", title: "Hinge pattern",
    summary: "How the living hinge is cut: the pattern, the cut style and the size of every slit and bar.",
    keywords: ["living hinge", "slit", "bridge", "spacing", "lattice", "wave", "relief", "serpentine", "auto-fit", "kerf bending"],
    images: [
      svg("pattern-straight", "Straight hinge close-up", "Straight: the classic lattice"),
      svg("pattern-wave", "Wave hinge close-up", "Wave: parallel waves"),
      svg("pattern-relief", "Relief hinge close-up", "Relief: round holes at the cut ends"),
      svg("pattern-serpentine", "Serpentine hinge close-up", "Serpentine: cuts from alternate edges"),
    ],
    fields: [{ product: "hinge", secs: ["secHinge"], alsoFor: ["letters"] }],
    blocks: [
      { p: "A living hinge is a field of parallel slits that lets a stiff sheet bend. Each bar between the slits twists a little, and hundreds of small twists add up to a curve." },
      { h: "Patterns", list: [
        "Straight: the classic lattice. Strong and predictable; the best default.",
        "Wave: every cut is a parallel copy of the same wave, so bars keep one width. A little softer than Straight, and it hides the slits.",
        "Relief: Straight with a small round hole at every cut end, which spreads stress and resists cracking in brittle sheet such as MDF.",
        "Serpentine: cuts run in from alternate edges, turning the wall into a spring. Bends very tightly but stretches, so glue the wall.",
      ] },
      { h: "Cut style", list: [
        "Slots: each cut is a round-ended slot of set width. Best for thick or stiff sheet.",
        "Single line: each cut is one laser line, as wide as the kerf. Best for thin sheet and card.",
      ] },
      { h: "Auto-fit", p: "Auto-fit picks the stiffest hinge that still reaches your corner radius with a 30% safety margin. Stiffer means fewer cuts, less charring and a stronger wall." },
    ],
    related: ["hinge-analysis", "material-and-kerf", "hinge-tips"],
  },
  {
    slug: "hinge-analysis", product: "hinge", title: "Bend Analysis",
    summary: "Will the hinge bend round your corners without cracking? Bend Analysis estimates it and lists what to check.",
    keywords: ["crack", "strain", "radius", "torsion", "safe", "analysis", "bend test"],
    images: [shot("checks", "Bend Analysis with To check and Auto-fix all")],
    blocks: [
      { p: "Bend Analysis works out the tightest radius the hinge can reach from the torsion-bar strain of your material, and compares it with your corners." },
      { list: [
        "Green: the hinge bends round your corners with room to spare.",
        "Amber: close to the limit. It may crack; Auto-fit or a longer slit helps.",
        "Red: it will crack. Use a fix from the list.",
      ] },
      { p: "The minimum radius is an engineering estimate. Cut a bend test strip (Sheet section) in your own material before the whole box." },
    ],
    related: ["checks-and-fixes", "hinge-pattern"],
  },
  {
    slug: "box-joints", product: "general", title: "Joints and fit",
    summary: "Tabs on the walls fit slots in the base and lid. Set their width and how tight they fit.",
    keywords: ["tabs", "slots", "fit", "tight", "loose", "press fit", "lid gap", "split"],
    fields: [{ product: "hinge", secs: ["secJoints"], alsoFor: ["letters"] }, { product: "letters", secs: ["joints"], title: "Letters joints" }],
    blocks: [
      { list: [
        "Tabs too tight to push in: raise Slot play by 0.05 mm at a time.",
        "Tabs loose: lower Slot play, or check your kerf.",
        "Removable lid sticks: raise Lid gap.",
        "Slots right at the edge of a letter's base (Letters): raise Base rim, so the base reaches past the walls and keeps a solid edge.",
        "Wall in two halves (Hinge Box): splits a long wall into two strips, so each fits a smaller bed.",
      ] },
    ],
    related: ["material-and-kerf", "sheet-and-fit"],
  },
  {
    slug: "hinge-tips", product: "hinge", title: "Tips for the Hinge Box",
    summary: "Small things that make a living-hinge box come out right first time.",
    keywords: ["tips", "advice", "char", "grain"],
    blocks: [
      { list: [
        "Measure your sheet with calipers and enter the real thickness before anything else.",
        "Cut the bend test strip first, in the same sheet. If it cracks, use Auto-fit or the fixes in Bend Analysis.",
        "Cut the green slots first, then the blue hinge, then the red outline (the SVG is already in that order).",
        "Run the hinge layer a little faster or with less power than the outline to reduce charring.",
        "Bend with the face veneer's grain running across the slits, and pre-flex the strip gently before assembly.",
        "If the wall comes out a little long once bent, raise Stretch by 0.5 % at a time.",
        "MDF is brittle: use the Relief pattern or a larger corner radius.",
      ] },
    ],
    related: ["hinge-pattern", "hinge-analysis"],
  },

  // ── Letters ──────────────────────────────────────────────────────────────
  {
    slug: "letters-modes", product: "letters", title: "Letters modes",
    summary: "Letter Box builds a box in the shape of your text; Solid cuts the letters as flat pieces; Stencil cuts them out of one sheet.",
    keywords: ["letter box", "solid", "stencil", "sign", "name"],
    images: [preset("letters", "name-box", "A letter box"), preset("letters", "hello-sign", "Solid letters"), preset("letters", "bar-stencil", "A stencil")],
    blocks: [
      { list: [
        "Letter Box: each letter becomes a box, with a base, walls that follow the outline, and an optional lid.",
        "Solid: each letter is cut as a flat piece, with counters (the holes in A, O and 8) as inner cuts.",
        "Stencil: the letters are cut out of one sheet, with bridges holding the counters in place.",
      ] },
      { h: "Walls (Letter Box)", list: [
        "Living hinge: one bendable strip follows each outline, with hinge cuts only where the letter curves.",
        "Flat panels: the outline is approximated by flat panels joined at the corners.",
      ] },
    ],
    related: ["letters-text", "letters-box", "letters-stencil"],
  },
  {
    slug: "letters-text", product: "letters", title: "Text and font",
    summary: "Type your text, pick a font, and set its size, spacing and stroke weight.",
    keywords: ["font", "upload", "weld", "direction"],
    fields: [{ product: "letters", secs: ["text"] }],
    blocks: [
      { list: [
        "More than 50 free fonts, grouped as Sans, Rounded, Serif, Script, Display, Stencil and Calligraphy. Search by name, and every font shows your own text. If your font has no glyph for a letter, the check suggests a font that has.",
        "Upload your own font (TTF or OTF); it stays on this device.",
        "Size measures: Cap height measures a capital letter such as H; Total height measures the whole text, ascenders and descenders included.",
        "Weld: Whole word joins letters that touch into one piece; Each letter keeps every letter separate.",
        "Direction: Auto follows the script; force Left to right or Right to left if you need to.",
      ] },
    ],
    related: ["letters-modes", "letters-analysis"],
  },
  {
    slug: "letters-box", product: "letters", title: "Letter Box",
    summary: "Box walls that follow your letters, as a living hinge or as flat panels, with optional marquee light holes.",
    keywords: ["box", "walls", "depth", "marquee", "lights", "islands", "faceted", "lid"],
    images: [preset("letters", "love-box", "A letter box with a living-hinge wall"), preset("letters", "home-faceted", "A letter box with flat panels")],
    fields: [{ product: "letters", secs: ["box"] }, { product: "letters", secs: ["marquee"], title: "Marquee holes" }],
    blocks: [
      { list: [
        "Living-hinge walls: each outline and counter gets one bendable strip. Sharp corners are rounded to the corner radius so the hinge can follow them; seams land on flat stretches. Tick Corner radius follows the hinge to let the hinge settings decide it.",
        "Flat-panel walls: each outline is approximated by flat panels within the tolerance. Square corners get finger joints; other corners are glued.",
        "Small pieces such as dots and accents can be cut flat (to glue on top, or stacked to full height) or left out.",
        "Marquee holes put a row of light holes in the lid (or the base of an open tray).",
      ] },
    ],
    related: ["hinge-pattern", "box-joints", "letters-analysis"],
  },
  {
    slug: "letters-stencil", product: "letters", title: "Stencil",
    summary: "Letters cut out of one sheet, with bridges that hold the centres in place.",
    keywords: ["stencil", "bridge", "spray", "paint"],
    images: [preset("letters", "open-stencil", "A stencil with bridges")],
    fields: [{ product: "letters", secs: ["solid"] }],
    blocks: [
      { list: [
        "One bridge crosses the thinnest stroke of each centre.",
        "Two bridges add a second one at least 120° from the first, for large or flexible stencils.",
        "Margin is the border of sheet round the text.",
      ] },
    ],
    related: ["letters-modes"],
  },
  {
    slug: "letters-solid", product: "letters", title: "Solid letters",
    summary: "Each letter as a flat piece; Weld dots joins dots and accents to their word.",
    keywords: ["solid", "sign", "weld dots", "accents"],
    images: [preset("letters", "script-sign", "Solid script letters")],
    fields: [{ product: "letters", secs: ["solid"] }],
    blocks: [
      { p: "Solid cuts each letter shape as a flat piece, with counters as inner cuts. Weld dots joins every separate piece of a word, dots and accents included, with small bridges, so each word cuts as one part." },
    ],
    related: ["letters-modes", "letters-text"],
  },
  {
    slug: "letters-analysis", product: "letters", title: "Letters analysis",
    summary: "The size, parts and bend zones of your letters, and what to check before cutting.",
    keywords: ["analysis", "zones", "missing glyphs", "crack"],
    images: [shot("letters-checks", "Letters analysis suggesting a font that has every letter")],
    blocks: [
      { list: [
        "Text size is the inked size of the letters; parts counts every piece to cut.",
        "Show bend zones colours where the hinge wall bends (Letter Box with living-hinge walls).",
        "To check lists anything that will not cut well, with fixes: a font that has your letters, Auto-fit for the hinge, or fitting the sheet.",
      ] },
    ],
    related: ["checks-and-fixes", "letters-text"],
  },
  {
    slug: "letters-tips", product: "letters", title: "Tips for Letters",
    summary: "Getting clean letters, strong boxes and stencils that hold together.",
    keywords: ["tips", "advice"],
    blocks: [
      { list: [
        "Bold, rounded fonts make the strongest letter boxes; thin serifs are hard to wrap with a hinge.",
        "Thicken by 0.3 to 1 mm helps thin fonts survive cutting.",
        "In a letter box, cut flat dots and accents and glue them on the lid, or tick Stack to full height.",
        "Use two bridges for large stencils so the centres do not twist.",
      ] },
    ],
    related: ["letters-text", "letters-box"],
  },

  // ── Parametric ───────────────────────────────────────────────────────────
  {
    slug: "parametric-source", product: "parametric", title: "Source model",
    summary: "What gets sliced: a library model, your own mesh, a photo, text, or a formula.",
    keywords: ["stl", "obj", "glb", "mesh", "photo", "depth", "formula", "text", "library", "import"],
    images: [preset("parametric", "head-fins", "A library head as parallel fins"), preset("parametric", "dunes", "A formula surface")],
    fields: [
      { product: "parametric", secs: ["transform"], title: "Size and rotation" },
      { product: "parametric", secs: ["formula"], title: "Formula" },
      { product: "parametric", secs: ["photo"], title: "Photo" },
      { product: "parametric", secs: ["text"], title: "Text" },
    ],
    blocks: [
      { list: [
        "Library: ready models that slice well.",
        "Mesh: import an STL, OBJ or GLB file. If its size looks wrong, pick its units (mm, cm, m or inches) and which axis is up.",
        "Photo: a depth map is made from your photo on this device, and the photo becomes a relief.",
        "Text: your text as a solid with a flat or rounded profile.",
        "Formula: a surface, a turned shape or a radial profile from shape buttons, or a formula you type under Advanced.",
      ] },
      { p: "Size sets the model's size along one axis, or use Scale. Turn X, Y and Z rotate it before slicing." },
    ],
    related: ["parametric-shapes", "parametric-method"],
  },
  {
    slug: "parametric-shapes", product: "parametric", title: "Shape buttons",
    summary: "Pick a shape and set its sliders instead of typing a formula.",
    keywords: ["formula", "sine", "wave", "arch", "bulge", "ramp", "steps", "leaf", "ellipse", "heart", "star", "custom"],
    images: [shot("shape-buttons", "Shape buttons for the outline of an Along a curve design")],
    blocks: [
      { p: "Formula fields (the fin length, height, twist and outline of Along a curve, and the Formula sources) show ten shape buttons: Constant, Wave, Arch, Bulge, Ramp, Steps, Leaf, Ellipse, Heart and Star." },
      { list: [
        "Sliders show only what changes the chosen shape: base, amount, waves (points for a star, steps for Steps), phase and ease.",
        "The formula the shape writes is under Advanced: formula. Type your own there; it shows as Custom formula and the buttons leave it alone.",
        "Formulas are checked before they run: only maths, no code.",
      ] },
    ],
    related: ["parametric-source", "parametric-method"],
  },
  {
    slug: "parametric-method", product: "parametric", title: "Slicing method",
    summary: "How the model becomes flat parts: parallel fins, stacked layers, a waffle, radial fins or fins along a curve.",
    keywords: ["parallel", "stacked", "waffle", "radial", "curve", "fins", "slices", "ribs", "dowels", "backboard"],
    images: [
      preset("parametric", "wave-fins", "Parallel fins"), preset("parametric", "vase-stack", "Stacked layers"),
      preset("parametric", "sphere-waffle", "Waffle"), preset("parametric", "vase-radial", "Radial fins"), preset("parametric", "leaf-clock", "Fins along a curve"),
    ],
    fields: [{ product: "parametric", secs: ["method"] }],
    blocks: [
      { list: [
        "Parallel fins: slices standing out of a backboard, side by side. The backboard can be one board, slats or none.",
        "Stacked layers: slices glued on top of each other, lined up with dowels; they can be hollowed to save material.",
        "Waffle: two crossing sets of ribs joined by half-lap slots.",
        "Radial: fins round a central axis, held by slotted hub rings.",
        "Along a curve: fins square to an oval or circle, shaped by formulas (or shape buttons) for their length, height, twist and outline.",
      ] },
    ],
    related: ["parametric-joints", "parametric-shapes"],
  },
  {
    slug: "parametric-material", product: "parametric", title: "Material and sheets",
    summary: "The material, its grain, and the sheets the parts are packed on.",
    keywords: ["grain", "sheet", "margin", "gap", "thickness"],
    fields: [{ product: "parametric", secs: ["material"] }, { product: "parametric", secs: ["sheet"], title: "Sheets" }],
    blocks: [
      { p: "Grain: Any lets parts turn to pack better; Along sheet width or Along sheet height keeps the grain of every part one way, which looks better on plywood but uses more sheets." },
    ],
    related: ["material-and-kerf", "sheet-and-fit"],
  },
  {
    slug: "parametric-joints", product: "parametric", title: "Parametric joints",
    summary: "Tabs, slots, dowels and half-laps that hold the parts together.",
    keywords: ["tabs", "slots", "dowels", "half lap", "clearance"],
    fields: [{ product: "parametric", secs: ["joints"] }],
    blocks: [
      { p: "Tabs per fin can be automatic (one for every Tab every of length) or a set count. Slot play and Lap play loosen the fit; use small negative values for a press fit." },
    ],
    related: ["parametric-method", "box-joints"],
  },
  {
    slug: "parametric-quality", product: "parametric", title: "Quality",
    summary: "How smooth the outlines are and which tiny details are dropped.",
    keywords: ["smooth", "tolerance", "detail", "file size"],
    fields: [{ product: "parametric", secs: ["quality"] }],
    blocks: [{ p: "Lower tolerance and smoothing follow the model more closely but make bigger files and slower cuts. Min detail and Island size drop slivers the laser cannot cut cleanly." }],
    related: ["parametric-analysis"],
  },
  {
    slug: "parametric-inspector", product: "parametric", title: "Slice Inspector",
    summary: "Step through the parts one by one: their outline, size, cut length and where they sit.",
    keywords: ["part", "inspect", "slice", "fidelity", "deviation"],
    blocks: [
      { list: [
        "Use the arrows or the slider to step through parts; click a part in the 3D view to jump to it.",
        "Each part shows its outline as it will be cut, its area, cut length and sheet.",
        "Fidelity compares the model with the parts; turn on Deviation in the 3D view to see where they differ.",
      ] },
    ],
    related: ["parametric-analysis", "view-3d"],
  },
  {
    slug: "parametric-analysis", product: "parametric", title: "Parametric analysis",
    summary: "Parts, sheets, cut time and fidelity, with what to check and how to fix it.",
    keywords: ["cut time", "sheets", "warnings", "too big", "collide", "fix"],
    blocks: [
      { list: [
        "Cut time is estimated from the material's cutting speed on a 40 to 60 W CO2 laser.",
        "To check lists problems such as parts larger than the sheet or fins that touch, with fixes: scale the model, let parts turn, fewer fins or wider spacing.",
        "Show selects the parts a problem is about.",
      ] },
    ],
    related: ["checks-and-fixes", "parametric-inspector"],
  },
  {
    slug: "parametric-tips", product: "parametric", title: "Tips for Parametric",
    summary: "Getting sculptures that slice cleanly and go together easily.",
    keywords: ["tips", "advice"],
    blocks: [
      { list: [
        "Start from a preset with the method you want, then swap the source.",
        "Fewer, thicker fins read better from a distance and cut faster than many thin ones.",
        "Number labels (Engrave part names) save a lot of time at assembly.",
        "Check Fidelity: if it is low, lower the spacing or raise the formula samples.",
        "Print the assembly guide before you cut.",
      ] },
    ],
    related: ["parametric-method", "parametric-analysis"],
  },
];
