/**
 * The architectural library behind the miniature templates: regions and traditions as plain data.
 *
 * Principles:
 * - A tradition is not a country. One country can have many traditions and one tradition can span
 *   several countries, so traditions list their countries and regions instead of belonging to one.
 * - Nothing here is a historical claim beyond broad, widely described characteristics. Every entry
 *   is `unverified` until sources are attached (`sources`, from traditionSources.ts), `sourced` once the
 *   claims have been compared with them, and `reviewed` only after a specialist has checked it. The
 *   miniature models are simplified, original interpretations: `accuracy` says so per tradition.
 * - Fictional or hybrid styles are flagged `fictional`.
 * - The catalogue is small data loaded with the generator; templates reference traditions by id, so
 *   a much larger catalogue can move to a server-side search without changing the templates.
 *
 * The `kit` is the geometric vocabulary a template starts from (roof, openings, finishes); it is a
 * design default, not a statement that every building of the tradition looks like that.
 */
import type { FretKind } from "../fretKinds";
import type { OpeningShape, Panes, RoofFinish, WallFinish } from "./kit";
import { TRADITION_SOURCES } from "./traditionSources";

export type RegionId =
  | "west-asia" | "central-asia" | "south-asia" | "east-asia" | "southeast-asia"
  | "northern-europe" | "southern-europe" | "eastern-europe" | "western-europe"
  | "north-africa" | "sub-saharan-africa" | "north-america" | "central-america" | "south-america"
  | "caribbean" | "oceania";

export const REGIONS: Record<RegionId, string> = {
  "west-asia": "Western Asia and the Middle East", "central-asia": "Central Asia", "south-asia": "South Asia",
  "east-asia": "East Asia", "southeast-asia": "Southeast Asia", "northern-europe": "Northern Europe",
  "southern-europe": "Southern Europe", "eastern-europe": "Eastern Europe", "western-europe": "Western Europe",
  "north-africa": "North Africa", "sub-saharan-africa": "Sub-Saharan Africa", "north-america": "North America",
  "central-america": "Central America", "south-america": "South America", caribbean: "The Caribbean", oceania: "Oceania and Pacific Islands",
};

export type RoofKind = "flat" | "gable" | "shed" | "hip" | "mansard" | "gambrel";
/**
 * `unverified`: no sources yet. `sourced`: sources are attached and the short claims were compared
 * with them, with any contradiction corrected, but no specialist has reviewed the entry.
 * `reviewed`: a reviewer has checked it.
 */
export type Verification = "unverified" | "sourced" | "reviewed";

export interface Source { title: string; url?: string; publisher?: string; accessed?: string }

export interface Tradition {
  id: string;
  name: string;
  altNames?: string[];
  /** Countries today (ISO 3166-1 alpha-2), where the tradition is commonly associated. */
  countries: string[];
  regions: RegionId[];
  period: string;
  typologies: string[];
  roof: string;
  windows: string;
  doors: string;
  structure: string;
  decoration: string;
  materials: string[];
  /** What the miniature simplifies or leaves out. */
  accuracy: string;
  sources: Source[];
  verification: Verification;
  /** A style made for the library, not a real tradition. */
  fictional?: boolean;
  /** The text here is HingeLab's own; the templates are original designs. */
  license: "CC0-1.0";
  kit: { roof: RoofKind; opening: OpeningShape; panes: Panes; wall: WallFinish; roofFinish: RoofFinish; lattice?: FretKind; parapet?: boolean };
}

const T = (t: Omit<Tradition, "sources" | "verification" | "license"> & { sources?: Source[] }): Tradition => {
  const found = TRADITION_SOURCES[t.id]?.sources ?? [];
  const sources = t.sources ?? found;
  return { license: "CC0-1.0", ...t, sources, verification: sources.length && !t.fictional ? "sourced" : "unverified" };
};
const SIMPLE = "Simplified: one rectangular volume, flat cut sheets, openings and ornament reduced to laser-cuttable outlines.";

export const TRADITIONS: Tradition[] = [
  T({ id: "persian-courtyard", name: "Persian courtyard house", altNames: ["Iranian courtyard house"], countries: ["IR"], regions: ["west-asia", "central-asia"], period: "Pre-modern to 20th century", typologies: ["courtyard house"], roof: "Flat roofs, sometimes with domes and vaults", windows: "Arched openings, coloured-glass lattice windows (orosi) facing the courtyard", doors: "Arched entrances, often recessed", structure: "Load-bearing brick and mud brick", decoration: "Brick patterns, tile work, geometric lattice", materials: ["brick", "mud brick", "timber", "glass"], accuracy: `${SIMPLE} The courtyard is shown as one open-fronted block.`, kit: { roof: "flat", opening: "pointed", panes: "lattice", wall: "brick", roofFinish: "plain", lattice: "quatrefoil", parapet: true } }),
  T({ id: "iranian-windcatcher", name: "Windcatcher house", altNames: ["Badgir house"], countries: ["IR", "AE", "QA", "BH"], regions: ["west-asia"], period: "Pre-modern to present", typologies: ["town house"], roof: "Flat roofs with a windcatcher tower", windows: "Small openings, arched niches", doors: "Arched", structure: "Mud brick and brick, thick walls", decoration: "Plain plaster, brick detail", materials: ["mud brick", "brick", "plaster"], accuracy: `${SIMPLE} The windcatcher is a slotted square tower.`, kit: { roof: "flat", opening: "pointed", panes: "none", wall: "stucco-bands", roofFinish: "plain", parapet: true } }),
  T({ id: "japanese-machiya", name: "Machiya", altNames: ["Kyoto town house"], countries: ["JP"], regions: ["east-asia"], period: "Edo period to early 20th century", typologies: ["town house", "shop house"], roof: "Low-pitched tiled gable roofs", windows: "Slatted wooden lattices (koshi) and paper screens", doors: "Sliding doors", structure: "Timber post-and-beam", decoration: "Lattice screens", materials: ["timber", "clay tile", "paper"], accuracy: `${SIMPLE} Lattices are shown as shoji-style grids.`, kit: { roof: "gable", opening: "rect", panes: "shoji", wall: "boards", roofFinish: "tiles" } }),
  T({ id: "japanese-minka", name: "Minka", countries: ["JP"], regions: ["east-asia"], period: "Pre-modern", typologies: ["farmhouse"], roof: "Steep thatched or hipped roofs", windows: "Few windows, sliding screens", doors: "Sliding doors", structure: "Timber frame", decoration: "Exposed timber", materials: ["timber", "thatch", "paper"], accuracy: `${SIMPLE} Thatch is drawn as a plain or seamed roof.`, kit: { roof: "hip", opening: "rect", panes: "shoji", wall: "timber", roofFinish: "seams" } }),
  T({ id: "chinese-siheyuan", name: "Siheyuan", altNames: ["Courtyard house"], countries: ["CN"], regions: ["east-asia"], period: "Imperial era to 20th century", typologies: ["courtyard house"], roof: "Tiled gable and hip roofs with curved eaves", windows: "Wooden lattice windows", doors: "Gate houses, panelled doors", structure: "Timber frame on masonry", decoration: "Lattice, painted beams", materials: ["timber", "grey brick", "clay tile"], accuracy: `${SIMPLE} Curved eaves are straight.`, kit: { roof: "gable", opening: "rect", panes: "lattice", wall: "brick", roofFinish: "tiles", lattice: "lattice" } }),
  T({ id: "korean-hanok", name: "Hanok", countries: ["KR", "KP"], regions: ["east-asia"], period: "Joseon era to present", typologies: ["house"], roof: "Tiled hipped-and-gabled roofs with curved lines", windows: "Paper-covered lattice doors and windows", doors: "Lattice doors", structure: "Timber frame on stone base", decoration: "Lattice patterns", materials: ["timber", "clay tile", "hanji paper", "stone"], accuracy: `${SIMPLE} The roof is a straight hip roof.`, kit: { roof: "hip", opening: "rect", panes: "shoji", wall: "timber", roofFinish: "tiles" } }),
  T({ id: "indian-haveli", name: "Haveli", countries: ["IN", "PK"], regions: ["south-asia"], period: "Mughal era to early 20th century", typologies: ["town house", "mansion"], roof: "Flat roofs with terraces", windows: "Projecting balconies (jharokha), lattice screens (jali)", doors: "Carved arched doorways", structure: "Masonry around courtyards", decoration: "Carving, painted walls, jali screens", materials: ["sandstone", "brick", "timber"], accuracy: `${SIMPLE} Balconies are flat; jali are cut lattices.`, kit: { roof: "flat", opening: "arch", panes: "lattice", wall: "stucco-bands", roofFinish: "plain", lattice: "floral", parapet: true } }),
  T({ id: "moroccan-riad", name: "Riad", countries: ["MA"], regions: ["north-africa"], period: "Pre-modern to present", typologies: ["courtyard house"], roof: "Flat roof terraces", windows: "Few outward windows, arched openings to the courtyard", doors: "Horseshoe-arched doors", structure: "Masonry, rammed earth", decoration: "Zellige tile, carved plaster, wooden screens", materials: ["earth", "brick", "plaster", "cedar"], accuracy: `${SIMPLE} Screens use a quatrefoil lattice.`, kit: { roof: "flat", opening: "horseshoe", panes: "lattice", wall: "stucco-bands", roofFinish: "plain", lattice: "quatrefoil", parapet: true } }),
  T({ id: "ottoman-house", name: "Ottoman house", countries: ["TR", "GR", "BG", "MK", "BA", "AL"], regions: ["west-asia", "eastern-europe", "southern-europe"], period: "16th to early 20th century", typologies: ["town house"], roof: "Low hipped tiled roofs with deep eaves", windows: "Rows of windows on a projecting upper floor", doors: "Panelled wooden doors", structure: "Stone ground floor, timber frame above", decoration: "Wooden window frames, eaves brackets", materials: ["stone", "timber", "clay tile"], accuracy: `${SIMPLE} The projecting upper floor is flush.`, kit: { roof: "hip", opening: "rect", panes: "grid", wall: "timber", roofFinish: "tiles" } }),
  T({ id: "scandinavian-timber", name: "Scandinavian timber house", countries: ["NO", "SE", "FI", "DK"], regions: ["northern-europe"], period: "Pre-modern to present", typologies: ["house", "cabin"], roof: "Gable roofs, often low-pitched with birch bark and sod (turf) covering", windows: "Small framed windows", doors: "Plank doors", structure: "Log or timber frame", decoration: "Painted boarding, trim", materials: ["timber"], accuracy: `${SIMPLE} Boarding is scored lines.`, kit: { roof: "gable", opening: "rect", panes: "cross", wall: "boards", roofFinish: "plain" } }),
  T({ id: "swiss-chalet", name: "Alpine chalet", altNames: ["Swiss chalet"], countries: ["CH", "AT", "DE", "FR", "IT"], regions: ["western-europe", "southern-europe"], period: "Pre-modern to present", typologies: ["house", "farmhouse"], roof: "Low-pitched gable roofs with wide overhangs", windows: "Small windows, often with shutters", doors: "Plank doors", structure: "Timber over a masonry base", decoration: "Carved balconies and eaves", materials: ["timber", "stone"], accuracy: `${SIMPLE} Balconies can be added on the front; carving is left out.`, kit: { roof: "gable", opening: "rect", panes: "cross", wall: "boards", roofFinish: "shingles" } }),
  T({ id: "german-fachwerk", name: "Fachwerk", altNames: ["Half-timbered house"], countries: ["DE", "FR", "DK", "PL", "NL"], regions: ["western-europe", "northern-europe", "eastern-europe"], period: "Medieval to 19th century", typologies: ["town house"], roof: "Steep gable roofs", windows: "Small casement windows", doors: "Panelled doors", structure: "Timber frame with infill", decoration: "Exposed frame patterns", materials: ["timber", "infill plaster", "clay tile"], accuracy: `${SIMPLE} The frame pattern is generic, not a regional pattern.`, kit: { roof: "gable", opening: "rect", panes: "cross", wall: "timber", roofFinish: "tiles" } }),
  T({ id: "british-tudor", name: "Tudor house", countries: ["GB"], regions: ["western-europe"], period: "Late 15th to early 17th century, and later revivals", typologies: ["house"], roof: "Steep gables", windows: "Leaded casements", doors: "Arched or panelled", structure: "Timber frame", decoration: "Close studding, herringbone infill", materials: ["timber", "brick", "plaster"], accuracy: `${SIMPLE} Leaded lights are a grid.`, kit: { roof: "gable", opening: "rect", panes: "grid", wall: "timber", roofFinish: "tiles" } }),
  T({ id: "victorian", name: "Victorian house", countries: ["GB", "US", "CA", "AU", "NZ"], regions: ["western-europe", "north-america", "oceania"], period: "19th century", typologies: ["town house", "villa"], roof: "Steep gables, sometimes mansards and towers", windows: "Tall sash windows, bay windows", doors: "Panelled doors with transom", structure: "Brick or timber frame", decoration: "Decorative bargeboards and trim", materials: ["brick", "timber", "slate"], accuracy: `${SIMPLE} Bay windows and trim are reduced to framed openings.`, kit: { roof: "gable", opening: "arch", panes: "cross", wall: "boards", roofFinish: "shingles" } }),
  T({ id: "haussmann", name: "Haussmann apartment building", countries: ["FR"], regions: ["western-europe"], period: "Second half of the 19th century", typologies: ["apartment building"], roof: "Mansard roofs", windows: "Tall French windows, balconies on some floors", doors: "Carriage doors", structure: "Load-bearing stone", decoration: "Cut-stone facades, iron balconies", materials: ["limestone", "zinc", "iron"], accuracy: `${SIMPLE} Balconies with railings can be added on the front.`, kit: { roof: "mansard", opening: "arch", panes: "cross", wall: "stone", roofFinish: "seams" } }),
  T({ id: "italian-renaissance", name: "Renaissance palazzo", countries: ["IT"], regions: ["southern-europe"], period: "15th to 16th century", typologies: ["palace", "town house"], roof: "Low hipped roofs behind cornices", windows: "Arched windows in regular rows", doors: "Arched portals", structure: "Masonry", decoration: "Rusticated stone, string courses", materials: ["stone", "brick", "clay tile"], accuracy: `${SIMPLE} The cornice is left out.`, kit: { roof: "hip", opening: "arch", panes: "cross", wall: "stone", roofFinish: "tiles" } }),
  T({ id: "greek-cycladic", name: "Cycladic house", countries: ["GR"], regions: ["southern-europe"], period: "Pre-modern to present", typologies: ["house"], roof: "Flat roofs, some vaults and domes", windows: "Small openings", doors: "Small doors, often painted", structure: "Whitewashed masonry", decoration: "Plain whitewash", materials: ["stone", "lime"], accuracy: `${SIMPLE} Domes are left out.`, kit: { roof: "flat", opening: "arch", panes: "none", wall: "plain", roofFinish: "plain", parapet: true } }),
  T({ id: "spanish-colonial", name: "Spanish colonial house", countries: ["MX", "PE", "CO", "CU", "PH", "US"], regions: ["central-america", "south-america", "caribbean", "southeast-asia", "north-america"], period: "16th to 19th century", typologies: ["courtyard house"], roof: "Tiled low roofs or flat roofs", windows: "Grilled windows", doors: "Arched wooden doors", structure: "Adobe and masonry", decoration: "Ironwork, plaster", materials: ["adobe", "stone", "clay tile", "iron"], accuracy: `${SIMPLE} Ironwork grilles are grids.`, kit: { roof: "shed", opening: "arch", panes: "grid", wall: "stucco-bands", roofFinish: "tiles" } }),
  T({ id: "mexican-vernacular", name: "Mexican vernacular house", countries: ["MX"], regions: ["central-america"], period: "Pre-modern to present", typologies: ["house"], roof: "Flat or low tiled roofs", windows: "Small openings", doors: "Plank doors", structure: "Adobe, masonry", decoration: "Bright painted walls", materials: ["adobe", "plaster"], accuracy: SIMPLE, kit: { roof: "flat", opening: "rect", panes: "none", wall: "plain", roofFinish: "plain", parapet: true } }),
  T({ id: "andean", name: "Andean house", countries: ["PE", "BO", "EC"], regions: ["south-america"], period: "Pre-modern to present", typologies: ["house"], roof: "Steep thatched or tiled gable roofs", windows: "Few small openings", doors: "Trapezoidal or rectangular", structure: "Stone or adobe", decoration: "Stonework", materials: ["stone", "adobe", "thatch"], accuracy: `${SIMPLE} Trapezoidal openings are rectangles.`, kit: { roof: "gable", opening: "rect", panes: "none", wall: "stone", roofFinish: "seams" } }),
  T({ id: "maya", name: "Maya-inspired temple house", countries: ["MX", "GT", "BZ", "HN"], regions: ["central-america"], period: "Inspired by the Classic period", typologies: ["shrine"], roof: "Flat roofs with roof combs", windows: "Few openings", doors: "Post-and-lintel doorways of wood or stone; corbel vaults over rooms and passages", structure: "Masonry", decoration: "Relief friezes", materials: ["limestone"], accuracy: `${SIMPLE} An interpretation, not a reconstruction of a specific building.`, kit: { roof: "flat", opening: "pointed", panes: "none", wall: "stone", roofFinish: "plain", parapet: true } }),
  T({ id: "west-african-earthen", name: "West African earthen architecture", countries: ["ML", "BF", "NE", "NG", "GH"], regions: ["sub-saharan-africa"], period: "Pre-modern to present", typologies: ["house", "mosque", "granary"], roof: "Flat earthen roofs, some conical thatched roofs", windows: "Small openings", doors: "Wooden doors", structure: "Mud brick and rammed earth, timber projections", decoration: "Buttresses, projecting timbers", materials: ["earth", "timber"], accuracy: `${SIMPLE} Projecting timbers are left out.`, kit: { roof: "flat", opening: "rect", panes: "none", wall: "plain", roofFinish: "plain", parapet: true } }),
  T({ id: "swahili-coastal", name: "Swahili coastal house", countries: ["KE", "TZ", "MZ"], regions: ["sub-saharan-africa"], period: "Pre-modern to present", typologies: ["town house"], roof: "Flat roofs, some thatch", windows: "Shuttered windows", doors: "Heavily carved wooden doors", structure: "Coral stone and lime", decoration: "Carved doors", materials: ["coral stone", "lime", "timber"], accuracy: `${SIMPLE} Door carving is an engraved panel.`, kit: { roof: "flat", opening: "arch", panes: "grid", wall: "plain", roofFinish: "plain", parapet: true } }),
  T({ id: "indigenous-north-america", name: "Pueblo-inspired house", countries: ["US"], regions: ["north-america"], period: "Inspired by pueblo architecture", typologies: ["terraced house"], roof: "Flat roofs on timber beams", windows: "Small openings", doors: "Small doorways, roof access", structure: "Adobe and stone", decoration: "Projecting beams", materials: ["adobe", "stone", "timber"], accuracy: `${SIMPLE} A respectful generic interpretation; it does not represent any specific community or building.`, kit: { roof: "flat", opening: "rect", panes: "none", wall: "plain", roofFinish: "plain", parapet: true } }),
  T({ id: "pacific-vernacular", name: "Pacific Island vernacular house", countries: ["WS", "FJ", "TO", "PG"], regions: ["oceania"], period: "Pre-modern to present", typologies: ["house", "meeting house"], roof: "Steep thatched roofs", windows: "Open sides", doors: "Open sides in the Samoan fale; the Fijian bure had one door on a long side and no windows", structure: "Timber posts", decoration: "Lashings, carving", materials: ["timber", "thatch"], accuracy: `${SIMPLE} Open sides are drawn as large openings.`, kit: { roof: "hip", opening: "rect", panes: "none", wall: "plain", roofFinish: "seams" } }),
  T({ id: "gothic", name: "Gothic", countries: ["FR", "GB", "DE", "IT", "ES"], regions: ["western-europe", "southern-europe"], period: "12th to 16th century, and revivals", typologies: ["library", "church", "hall"], roof: "Steep roofs", windows: "Pointed arches with tracery", doors: "Pointed portals", structure: "Masonry", decoration: "Tracery, vaults", materials: ["stone", "glass"], accuracy: `${SIMPLE} Tracery is a cut lattice.`, kit: { roof: "gable", opening: "pointed", panes: "lattice", wall: "stone", roofFinish: "tiles", lattice: "quatrefoil" } }),
  T({ id: "modern", name: "Modern house", countries: [], regions: [], period: "20th century to present", typologies: ["house"], roof: "Flat or single-pitch roofs", windows: "Large rectangular windows", doors: "Plain doors", structure: "Frame or masonry", decoration: "Minimal", materials: ["concrete", "glass", "timber"], accuracy: SIMPLE, kit: { roof: "flat", opening: "rect", panes: "none", wall: "plain", roofFinish: "plain" } }),
  T({ id: "american-barn", name: "Gambrel barn house", countries: ["US", "CA"], regions: ["north-america"], period: "Gambrel roofs in North America from the late 17th century; gambrel barns mostly from about 1900", typologies: ["barn", "house"], roof: "Gambrel roofs", windows: "Small windows, loft door", doors: "Large doors", structure: "Timber frame", decoration: "Boarding, trim", materials: ["timber"], accuracy: SIMPLE, kit: { roof: "gambrel", opening: "rect", panes: "cross", wall: "boards", roofFinish: "shingles" } }),
  T({ id: "storybook", name: "Storybook cottage", countries: [], regions: [], period: "Fictional", typologies: ["cottage"], roof: "Steep shingled roofs", windows: "Round-top windows", doors: "Round-top doors", structure: "Imagined", decoration: "Whimsical trim", materials: ["imagined"], accuracy: "A fictional style for play and book nooks.", fictional: true, kit: { roof: "gable", opening: "arch", panes: "cross", wall: "stone", roofFinish: "shingles" } }),
];

export const TRADITION_BY_ID: Record<string, Tradition> = Object.fromEntries(TRADITIONS.map((t) => [t.id, t]));
export const traditionOf = (id: string): Tradition => TRADITION_BY_ID[id] ?? TRADITION_BY_ID.modern;
