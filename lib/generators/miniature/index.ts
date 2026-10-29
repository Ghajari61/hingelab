import { circle, rect } from "../geom";
import { FRET_NAMES, type FretKind } from "../fretKinds";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildMiniature, type MiniOutput } from "./build";
import { checkMiniature } from "./check";
import { OPENING_SHAPES, PANES, ROOF_FINISHES, WALL_FINISHES, type OpeningShape } from "./kit";
import {
  ACCESSORY_NAMES, BALCONY_NAMES, COLUMN_STYLES, DESIGN_NAMES, DOOR_NAMES, FENCE_STYLES, FIT_NAMES, FURNITURE_NAMES, FURNITURE_REAL, GROUNDS_NAMES, MINIATURE_DEFAULTS, MINIATURE_VERSION,
  NOOK_SCENES, PORCH_NAMES, RAIL_STYLES, ROOF_NAMES, SCALES, THEME_NAMES, TREE_NAMES,
  mergeMiniature, scaleOf, type AccessoryKind, type FurnitureKind, type HouseTheme, type JointFit, type MiniDesign, type MiniatureParams, type NookScene,
} from "./params";
import { MINIATURE_PRESETS } from "./presets";
import { REGIONS, TRADITIONS, traditionOf, type RoofKind } from "./traditions";

const is = (...d: MiniDesign[]) => (p: MiniatureParams) => d.includes(p.design);
const opts = <K extends string>(names: Record<K, string>) => (Object.keys(names) as K[]).map((v) => ({ v, text: names[v] }));
const LATTICES = (["lattice", "quatrefoil", "floral", "honeycomb", "stars", "circles", "leaves"] as FretKind[]).map((v) => ({ v, text: FRET_NAMES[v] }));
const BUILT_IN_NAMES = new Set<string>([MINIATURE_DEFAULTS.name, ...Object.values(DESIGN_NAMES), ...MINIATURE_PRESETS.map((p) => p.params.name ?? "")]);

/** A tradition's starting kit applied to the house and the nook (roof, openings, finishes). */
function applyTradition(p: MiniatureParams, id: string): MiniatureParams {
  const k = traditionOf(id).kit;
  return {
    ...p, tradition: id,
    house: { ...p.house, roof: k.roof, opening: k.opening, panes: k.panes, wall: k.wall, roofFinish: k.roofFinish, lattice: k.lattice ?? p.house.lattice, parapet: k.parapet ? Math.max(p.house.parapet, 10) : p.house.parapet },
    nook: { ...p.nook, opening: k.opening, panes: k.panes, wall: k.wall, lattice: k.lattice ?? p.nook.lattice },
  };
}

/** A theme: the country house or the town house, set in one go; every setting stays editable. */
function applyTheme(p: MiniatureParams, v: HouseTheme): MiniatureParams {
  const h = p.house;
  if (v === "rural") return { ...p, house: {
    ...h, theme: v, front: "panel", door: "planked", step: true, shopfront: false, chimney: true, porch: "veranda", porchDepth: 30, balcony: "none",
    grounds: "garden", yard: Math.max(h.yard, 80), yardSides: Math.max(h.yardSides, 24), fence: "picket", gate: true, path: true, beds: true, trees: 2, treeKind: "tree",
    shutters: true, wall: "boards", roof: h.roof === "flat" || h.roof === "mansard" ? "gable" : h.roof, roofFinish: "shingles", frontWindows: Math.max(h.frontWindows, 2), rail: "balusters",
    columns: "turned", windowBoxes: true, dormers: 2, stairRail: true, pilasters: false,
  } };
  if (v === "urban") return { ...p, house: {
    ...h, theme: v, front: "panel", door: "glazed", step: true, shopfront: true, chimney: true, porch: "none", balcony: "centre", balconyDepth: 20, rail: "bars",
    grounds: "street", yard: Math.max(40, Math.min(h.yard, 60)), yardSides: 0, trees: 1, treeKind: "tree", lamps: 2,
    floors: Math.max(h.floors, 3), wall: "brick", roof: "mansard", roofFinish: "tiles", shutters: false, frontWindows: Math.max(h.frontWindows, 2),
    columns: "classical", pilasters: true, dormers: 2, stairRail: true, windowBoxes: false,
  } };
  return { ...p, house: { ...h, theme: v } };
}
const front = (p: MiniatureParams) => p.house.front === "panel";

const traditionOptions = TRADITIONS.map((t) => ({ v: t.id, text: t.fictional ? `${t.name} (fictional)` : t.name }));

const sections: SectionSpec<MiniatureParams>[] = [
  {
    id: "design", title: "Design", open: true,
    help: "What to make: a dollhouse or building, a book nook, or a piece of miniature furniture, and the architectural tradition it starts from.",
    fields: [
      {
        kind: "choice", key: "design", label: "Make", rail: true,
        help: "A house with floors, rooms, stairs and a roof; a book nook that stands between books; or furniture at a dollhouse scale.",
        options: opts(DESIGN_NAMES),
        apply: (p, v) => ({ ...p, design: v as MiniDesign, name: BUILT_IN_NAMES.has(p.name) ? DESIGN_NAMES[v as MiniDesign] : p.name }),
      },
      {
        kind: "choice", key: "tradition", label: "Tradition", show: is("house", "nook"),
        help: "Sets the roof, windows and wall finish a tradition is often built with; change any of them after. The models are simplified, original interpretations, and the descriptions are unverified (see the help).",
        options: traditionOptions,
        apply: (p, v) => applyTradition(p, v),
      },
    ],
  },
  {
    id: "house", title: "Building", open: true, show: is("house"),
    help: "The outside size, the floors and the rooms; the side walls stand on a base that overhangs them.",
    fields: [
      { kind: "choice", key: "house.theme", label: "Theme", rail: true, help: "A country house (veranda on turned posts, chimney, dormers, window boxes, a fenced garden with a path, beds and trees) or a town house (a shopfront, balconies, pilasters, dormers in a mansard roof and a pavement with street lamps); every setting can be changed after.", options: opts(THEME_NAMES), apply: (p, v) => applyTheme(p, v as HouseTheme) },
      { kind: "number", key: "house.width", label: "Width", unit: "mm", min: 80, max: 900, step: 1, help: "Outside width, side wall to side wall." },
      { kind: "number", key: "house.depth", label: "Depth", unit: "mm", min: 80, max: 600, step: 1, help: "Outside depth, back to front." },
      { kind: "number", key: "house.floors", label: "Floors", unit: "", min: 1, max: 6, step: 1, int: true, help: "Storeys, one to six." },
      { kind: "number", key: "house.floorH", label: "Floor height", unit: "mm", min: 40, max: 300, step: 1, help: "Clear height of each floor; 1:12 rooms are about 200 to 250 mm, 1:24 rooms about 100 to 125 mm." },
      { kind: "number", key: "house.rooms", label: "Rooms per floor", unit: "", min: 1, max: 5, step: 1, int: true, help: "Partitions split each floor into this many rooms." },
      { kind: "toggle", key: "house.doorways", label: "Doorways", help: "Cuts a doorway through each partition." },
      { kind: "toggle", key: "house.stairs", label: "Stairs", help: "A stair in the first room on every floor but the top, under a stairwell in the floor above." },
      { kind: "toggle", key: "house.stairRail", label: "Stair railing", show: (p) => p.house.stairs && p.house.floors > 1, help: "A balustrade on the stair's open side, cut in one piece with its stringer." },
      { kind: "choice", key: "house.front", label: "Front", help: "Open for play, or a closed facade with a door and windows.", options: [{ v: "open", text: "Open" }, { v: "panel", text: "Facade" }] },
      { kind: "number", key: "house.plinth", label: "Base overhang", unit: "mm", min: 0, max: 40, step: 1, help: "How far the base reaches past the walls." },
    ],
  },
  {
    id: "roof", title: "Roof", open: true, show: is("house"),
    help: "The roof shape and finish. Gable, shed and gambrel roofs lock onto tabs on the side walls; hip and mansard roofs are glued on the top plate.",
    fields: [
      { kind: "choice", key: "house.roof", shuffle: true, label: "Roof", rail: true, help: "Flat with a parapet, gable, shed (one slope), hip, mansard or gambrel.", options: opts(ROOF_NAMES) },
      { kind: "number", key: "house.pitch", label: "Pitch", unit: "deg", min: 5, max: 70, step: 1, show: (p) => p.house.roof !== "flat" && p.house.roof !== "mansard", help: "Slope of the roof; on a gambrel, of its upper part." },
      { kind: "number", key: "house.overhang", label: "Overhang", unit: "mm", min: 0, max: 40, step: 1, show: (p) => p.house.roof !== "flat", help: "How far the roof reaches past the walls." },
      { kind: "number", key: "house.parapet", label: "Parapet", unit: "mm", min: 0, max: 40, step: 1, show: (p) => p.house.roof === "flat", help: "Height of the walls above a flat roof." },
      { kind: "number", key: "house.dormers", label: "Dormers", unit: "", min: 0, max: 4, step: 1, int: true, show: (p) => p.house.roof !== "flat", help: "Dormer windows standing on the front roof panel, as many as fit." },
      { kind: "toggle", key: "house.chimney", shuffle: true, label: "Chimney", help: "A brick-scored chimney standing on the top plate, up through a hole in the roof." },
      { kind: "toggle", key: "house.tower", label: "Windcatcher", show: (p) => p.house.roof === "flat", help: "A slotted square tower on the roof, as on windcatcher (badgir) houses." },
      { kind: "choice", key: "house.roofFinish", shuffle: true, label: "Roof finish", show: (p) => p.house.roof !== "flat", help: "Scored shingles, tiles or standing seams on the roof panels.", options: opts(ROOF_FINISHES) },
    ],
  },
  {
    id: "windows", title: "Windows and doors", open: false, show: is("house"),
    help: "The openings on every wall, their shape and what fills them.",
    fields: [
      { kind: "choice", key: "house.opening", shuffle: true, label: "Opening shape", help: "Square, round arch, pointed arch, horseshoe arch or round.", options: opts(OPENING_SHAPES) },
      { kind: "choice", key: "house.panes", shuffle: true, label: "Panes", help: "Open, cross bars, a grid, a shoji grid or a cut lattice screen.", options: opts(PANES) },
      { kind: "choice", key: "house.lattice", label: "Lattice", show: (p) => p.house.panes === "lattice", help: "The pattern of the screen.", options: LATTICES },
      { kind: "number", key: "house.winW", label: "Window width", unit: "mm", min: 8, max: 200, step: 1, help: "Width of each window." },
      { kind: "number", key: "house.winH", label: "Window height", unit: "mm", min: 8, max: 280, step: 1, help: "Height of each window; it has to fit the floor height." },
      { kind: "number", key: "house.sideWindows", label: "Side windows", unit: "", min: 0, max: 4, step: 1, int: true, help: "Windows on each side wall, per floor." },
      { kind: "number", key: "house.backWindows", label: "Back windows", unit: "", min: 0, max: 6, step: 1, int: true, help: "Windows on the back wall, per floor." },
      { kind: "number", key: "house.frontWindows", label: "Facade windows", unit: "", min: 0, max: 6, step: 1, int: true, show: (p) => p.house.front === "panel", help: "Windows on the facade, per floor (the door takes the middle of the ground floor)." },
      { kind: "number", key: "house.doorW", label: "Door width", unit: "mm", min: 10, max: 200, step: 1, help: "Width of the doors and doorways." },
      { kind: "number", key: "house.doorH", label: "Door height", unit: "mm", min: 20, max: 280, step: 1, help: "Height of the doors and doorways." },
      { kind: "toggle", key: "house.trim", shuffle: true, label: "Scored frames", help: "Scores a frame round every opening." },
      { kind: "toggle", key: "house.shutters", shuffle: true, label: "Shutters", help: "Scores a shutter each side of the windows." },
      { kind: "choice", key: "house.wall", shuffle: true, label: "Wall finish", help: "Scored brick, stone blocks, half-timber framing, boards or bands at each floor.", options: opts(WALL_FINISHES) },
    ],
  },
  {
    id: "front", title: "Front, porch and balconies", open: false, show: is("house"),
    help: "A door leaf in the front door, a step, a shopfront, a porch and balconies; they need the closed facade.",
    fields: [
      { kind: "choice", key: "house.door", shuffle: true, label: "Front door", help: "Leave the doorway open, or cut a door leaf to glue or pin in it: plain, panelled, planked or glazed. The door and the rest of this section need the closed facade (Front, under Building).", options: opts(DOOR_NAMES) },
      { kind: "toggle", key: "house.step", label: "Front step", show: front, help: "A step in front of the door, glued on the base." },
      { kind: "toggle", key: "house.shopfront", label: "Shopfront", show: front, help: "Two wide display windows either side of the door on the ground floor, with a scored sign band above them." },
      { kind: "choice", key: "house.porch", shuffle: true, label: "Porch", show: front, help: "A canopy over the door on two posts, or a veranda along the whole front with railings between its posts.", options: opts(PORCH_NAMES) },
      { kind: "choice", key: "house.columns", shuffle: true, label: "Posts", show: (p) => front(p) && p.house.porch !== "none", help: "The porch posts' shape: square, turned, or classical columns with a base and a capital.", options: opts(COLUMN_STYLES) },
      { kind: "number", key: "house.porchDepth", label: "Porch depth", unit: "mm", min: 14, max: 80, step: 1, show: (p) => front(p) && p.house.porch !== "none", help: "How far the porch reaches out from the facade." },
      { kind: "choice", key: "house.balcony", shuffle: true, label: "Balconies", show: front, help: "A balcony with a door on every floor above the ground floor: in the middle of the facade or across its width.", options: opts(BALCONY_NAMES) },
      { kind: "number", key: "house.balconyDepth", label: "Balcony depth", unit: "mm", min: 12, max: 60, step: 1, show: (p) => front(p) && p.house.balcony !== "none", help: "How far the balconies reach out from the facade." },
      { kind: "toggle", key: "house.windowBoxes", shuffle: true, label: "Window boxes", show: front, help: "A flower box under each facade window, where nothing else is in the way." },
      { kind: "toggle", key: "house.pilasters", shuffle: true, label: "Pilasters", show: front, help: "Pilasters scored up the facade at its corners and between the windows." },
      { kind: "choice", key: "house.rail", shuffle: true, label: "Railings", show: (p) => front(p) && (p.house.balcony !== "none" || p.house.porch === "veranda"), help: "The balconies' and veranda's railings: balusters, horizontal bars, a lattice or a solid panel.", options: opts(RAIL_STYLES) },
    ],
  },
  {
    id: "grounds", title: "Garden and street", open: false, show: is("house"),
    help: "The base grown into a garden with a fence, a gate, a path, flower beds and trees, or into a pavement with a kerb and street lamps.",
    fields: [
      { kind: "choice", key: "house.grounds", shuffle: true, label: "Grounds", help: "Just the base under the walls, a garden yard, or a street pavement.", options: opts(GROUNDS_NAMES) },
      { kind: "number", key: "house.yard", label: "Front yard", unit: "mm", min: 0, max: 250, step: 1, show: (p) => p.house.grounds !== "none", help: "How far the base reaches in front of the house." },
      { kind: "number", key: "house.yardSides", label: "Side yards", unit: "mm", min: 0, max: 150, step: 1, show: (p) => p.house.grounds !== "none", help: "How far the base reaches past each side wall." },
      { kind: "choice", key: "house.fence", shuffle: true, label: "Fence", show: (p) => p.house.grounds === "garden", help: "A picket fence, post and rail, a lattice fence or a low stone wall round the front and sides, tabbed into the base.", options: [{ v: "none", text: "No fence" }, ...opts(FENCE_STYLES)] },
      { kind: "toggle", key: "house.gate", label: "Gate", show: (p) => p.house.grounds === "garden" && p.house.fence !== "none", help: "A gate in the front fence, in line with the door." },
      { kind: "toggle", key: "house.path", label: "Path", show: (p) => p.house.grounds === "garden", help: "Stepping stones scored from the door to the gate." },
      { kind: "toggle", key: "house.beds", label: "Flower beds", show: (p) => p.house.grounds === "garden", help: "Flower beds scored along the front fence, either side of the path." },
      { kind: "number", key: "house.trees", label: "Trees", unit: "", min: 0, max: 6, step: 1, int: true, show: (p) => p.house.grounds !== "none", help: "Trees in the yard's corners and beside the house, as many as fit; each is two slotted halves." },
      { kind: "choice", key: "house.treeKind", shuffle: true, label: "Tree", show: (p) => p.house.grounds !== "none" && p.house.trees > 0, help: "A leafy tree, a pine tree or a bush.", options: opts(TREE_NAMES) },
      { kind: "number", key: "house.lamps", label: "Street lamps", unit: "", min: 0, max: 6, step: 1, int: true, show: (p) => p.house.grounds === "street", help: "Lamps along the kerb, as many as fit." },
    ],
  },
  {
    id: "accessory", title: "Garden and street piece", open: true, show: is("accessory"),
    help: "A piece on its own for a diorama, a book nook or another house, made at the size given.",
    fields: [
      { kind: "choice", key: "accessory.kind", label: "Piece", rail: true, help: "A leafy tree, a pine tree, a bush, a street lamp, a classical column, a run of fence or a planter box.", options: opts(ACCESSORY_NAMES) },
      { kind: "number", key: "accessory.height", label: "Height", unit: "mm", min: 15, max: 400, step: 1, help: "Height of the piece." },
      { kind: "number", key: "accessory.width", label: "Width", unit: "mm", min: 10, max: 300, step: 1, show: (p) => p.accessory.kind !== "fence", help: "Width of the tree, lamp or column, or depth of the planter." },
      { kind: "number", key: "accessory.length", label: "Length", unit: "mm", min: 20, max: 600, step: 1, show: (p) => p.accessory.kind === "fence" || p.accessory.kind === "planter", help: "Length of the fence run or the planter." },
      { kind: "choice", key: "accessory.fence", label: "Fence", show: (p) => p.accessory.kind === "fence", help: "Picket fence, post and rail, lattice or a low stone wall.", options: opts(FENCE_STYLES) },
      { kind: "toggle", key: "accessory.base", label: "Base", show: (p) => p.accessory.kind !== "planter", help: "A base it slots into, to stand on its own; leave it off to glue it into a scene." },
    ],
  },
  {
    id: "nook", title: "Book nook", open: true, show: is("nook"),
    help: "A box that stands between books, open at the front, with a scene in layers of depth, a light box and a battery bay.",
    fields: [
      { kind: "choice", key: "nook.scene", shuffle: true, label: "Scene", rail: true, help: "An alley between two facades, or arches receding between shelves of books.", options: opts(NOOK_SCENES) },
      { kind: "number", key: "nook.width", label: "Width", unit: "mm", min: 60, max: 250, step: 1, help: "Outside width: the gap it fills on the shelf." },
      { kind: "number", key: "nook.height", label: "Height", unit: "mm", min: 120, max: 400, step: 1, help: "Outside height; it should clear the shelf above." },
      { kind: "number", key: "nook.depth", label: "Depth", unit: "mm", min: 80, max: 350, step: 1, help: "Outside depth, back to front." },
      { kind: "number", key: "nook.buildings", label: "Buildings", unit: "", min: 1, max: 5, step: 1, int: true, help: "Buildings along each side of the alley, or the number of arches." },
      { kind: "number", key: "nook.storeys", label: "Storeys", unit: "", min: 1, max: 6, step: 1, int: true, show: (p) => p.nook.scene === "alley", help: "Rows of windows on each building." },
      { kind: "choice", key: "nook.opening", shuffle: true, label: "Opening shape", help: "The windows' and arches' shape.", options: opts(OPENING_SHAPES) },
      { kind: "choice", key: "nook.panes", shuffle: true, label: "Panes", show: (p) => p.nook.scene === "alley", help: "What fills the windows.", options: opts(PANES) },
      { kind: "choice", key: "nook.lattice", label: "Lattice", show: (p) => p.nook.scene === "alley" && p.nook.panes === "lattice", help: "The pattern of the screens.", options: LATTICES },
      { kind: "choice", key: "nook.wall", shuffle: true, label: "Wall finish", show: (p) => p.nook.scene === "alley", help: "Scored finish on the facades.", options: opts(WALL_FINISHES) },
      { kind: "toggle", key: "nook.light", label: "Light box", help: "A compartment under the top for an LED strip, lighting through slots in the ceiling, with a cable hole." },
      { kind: "toggle", key: "nook.battery", label: "Battery bay", help: "A bay under the scene floor with a hatch in the back." },
      { kind: "toggle", key: "nook.mirror", label: "Mirror", help: "A frame at the back holding a 2 mm acrylic mirror; the effect depends on the mirror and the light." },
    ],
  },
  {
    id: "furniture", title: "Furniture", open: true, show: is("furniture"),
    help: "A piece at a dollhouse scale: enter its full size and pick the scale. The material and the joints keep their real size.",
    fields: [
      {
        kind: "choice", key: "furniture.kind", label: "Piece", rail: true, help: "Chair, table, bed, bookshelf, cabinet, desk, dresser, bench, sofa, armchair, wardrobe, nightstand, fireplace or kitchen counter.", options: opts(FURNITURE_NAMES),
        apply: (p, v) => ({ ...p, furniture: { ...p.furniture, kind: v as FurnitureKind, ...FURNITURE_REAL[v as FurnitureKind] }, name: BUILT_IN_NAMES.has(p.name) ? FURNITURE_NAMES[v as FurnitureKind] : p.name }),
      },
      { kind: "choice", key: "furniture.scale", label: "Scale", help: "The common dollhouse scale is 1:12; 1:24 and 1:48 are smaller, and 1:6 suits fashion dolls.", options: opts(SCALES) },
      { kind: "number", key: "furniture.custom", label: "Custom scale 1:", unit: "", min: 1, max: 200, step: 1, show: (p) => p.furniture.scale === "custom", help: "The divisor of your scale." },
      { kind: "number", key: "furniture.width", label: "Full-size width", unit: "mm", min: 100, max: 4000, step: 10, help: "Width of the full-size piece." },
      { kind: "number", key: "furniture.depth", label: "Full-size depth", unit: "mm", min: 100, max: 4000, step: 10, help: "Depth of the full-size piece (a bed's length)." },
      { kind: "number", key: "furniture.height", label: "Full-size height", unit: "mm", min: 100, max: 4000, step: 10, help: "Height of the full-size piece." },
      { kind: "number", key: "furniture.shelves", label: "Shelves", unit: "", min: 0, max: 10, step: 1, int: true, show: (p) => ["bookshelf", "cabinet", "wardrobe", "counter"].includes(p.furniture.kind), help: "Shelves inside (a cabinet or counter takes up to three, a wardrobe two)." },
      { kind: "number", key: "furniture.drawers", label: "Drawers", unit: "", min: 1, max: 8, step: 1, int: true, show: (p) => p.furniture.kind === "dresser" || p.furniture.kind === "nightstand", help: "Drawer fronts (they are scored, not opening); a nightstand takes up to three." },
    ],
  },
  {
    id: "joints", title: "Joints", open: false,
    help: "How tightly the tabs go into their slots, on top of the kerf.",
    fields: [
      { kind: "choice", key: "joint.fit", label: "Fit", help: "Standard suits most plywood; go looser if the parts need force, tighter if they fall apart. Each step is 0.05 mm on every edge.", options: opts(FIT_NAMES) as { v: JointFit; text: string }[] },
    ],
  },
];

/** Rail pictures, drawn from simple outlines of each option. */
function art(key: string, v: string): { d: string; fill?: boolean }[] {
  const solid = (cs: Contour[]) => [{ d: fitArt(cs, 38).join(" "), fill: true }];
  if (key === "design") {
    switch (v as MiniDesign) {
      case "house": return solid([[[0, 18], [22, 2], [44, 18], [44, 44], [0, 44]], rect(17, 30, 10, 14), rect(6, 22, 8, 7), rect(30, 22, 8, 7)]);
      case "nook": return solid([rect(0, 0, 26, 46), rect(4, 6, 18, 36), [[8, 42], [8, 22], [13, 16], [18, 22], [18, 42]]]);
      case "furniture": return solid([[[0, 0], [5, 0], [5, 20], [26, 20], [26, 44], [21, 44], [21, 28], [5, 28], [5, 44], [0, 44]]]);
      case "accessory": return solid([rect(20, 30, 6, 16), circle(23, 18, 15), rect(0, 44, 48, 2)]);
    }
  }
  if (key === "house.theme") {
    switch (v as HouseTheme) {
      case "custom": return solid([[[4, 20], [24, 4], [44, 20], [44, 44], [4, 44]], rect(19, 32, 10, 12)]);
      case "rural": return solid([[[0, 22], [18, 8], [36, 22], [36, 44], [0, 44]], rect(28, 4, 5, 12), rect(38, 30, 2, 14), rect(43, 30, 2, 14), rect(36, 34, 12, 2), circle(44, 20, 6)]);
      case "urban": return solid([rect(6, 10, 30, 34), [[4, 10], [10, 2], [32, 2], [38, 10]], rect(2, 22, 38, 2), rect(2, 34, 38, 2), rect(42, 18, 2, 26), rect(40, 14, 6, 5)]);
    }
  }
  if (key === "accessory.kind") {
    switch (v as AccessoryKind) {
      case "tree": return solid([rect(21, 28, 6, 18), circle(24, 16, 14), circle(14, 22, 8), circle(34, 22, 8)]);
      case "pine": return solid([rect(21, 36, 6, 10), [[6, 38], [42, 38], [24, 16]], [[10, 26], [38, 26], [24, 6]], [[14, 16], [34, 16], [24, 0]]]);
      case "bush": return solid([circle(14, 32, 10), circle(34, 32, 10), circle(24, 24, 12), rect(10, 32, 28, 12)]);
      case "lamp": return solid([rect(21, 12, 6, 32), rect(17, 42, 14, 4), [[16, 4], [32, 4], [29, 14], [19, 14]], [[14, 4], [34, 4], [24, 0]]]);
      case "column": return solid([rect(12, 42, 24, 4), rect(14, 39, 20, 3), rect(16, 9, 16, 30), [[15, 9], [33, 9], [36, 5], [12, 5]], rect(11, 2, 26, 3)]);
      case "fence": return solid([rect(0, 38, 48, 3), rect(0, 26, 48, 3), ...[0, 10, 20, 30, 40].map((x): Contour => [[x, 46], [x, 16], [x + 3.5, 12], [x + 7, 16], [x + 7, 46]])]);
      case "planter": return solid([[[0, 18], [48, 18], [44, 44], [4, 44]], circle(14, 12, 7), circle(26, 8, 8), circle(37, 12, 7)]);
    }
  }
  if (key === "house.roof") {
    const walls = rect(4, 22, 40, 22);
    switch (v as RoofKind) {
      case "flat": return solid([rect(4, 14, 40, 30)]);
      case "gable": return solid([walls, [[0, 22], [24, 4], [48, 22]]]);
      case "shed": return solid([walls, [[0, 22], [48, 10], [48, 22]]]);
      case "hip": return solid([walls, [[0, 22], [14, 8], [34, 8], [48, 22]]]);
      case "mansard": return solid([walls, [[2, 22], [8, 8], [40, 8], [46, 22]]]);
      case "gambrel": return solid([walls, [[0, 22], [8, 10], [24, 2], [40, 10], [48, 22]]]);
    }
  }
  if (key === "nook.scene") {
    switch (v as NookScene) {
      case "alley": return solid([[[0, 46], [0, 6], [8, 0], [14, 8], [14, 46]], [[34, 46], [34, 12], [40, 4], [48, 10], [48, 46]], rect(16, 26, 16, 20)]);
      case "arches": return solid([rect(0, 0, 48, 46), [[14, 46], [14, 20], [24, 6], [34, 20], [34, 46]].reverse() as Contour]);
    }
  }
  if (key === "furniture.kind") {
    switch (v as FurnitureKind) {
      case "chair": return solid([[[0, 0], [5, 0], [5, 22], [22, 22], [22, 44], [17, 44], [17, 28], [5, 28], [5, 44], [0, 44]]]);
      case "table": return solid([rect(0, 10, 48, 5), rect(4, 15, 4, 29), rect(40, 15, 4, 29)]);
      case "bed": return solid([rect(0, 4, 6, 40), rect(6, 26, 36, 8), rect(42, 18, 6, 26)]);
      case "bookshelf": return solid([rect(0, 0, 4, 46), rect(26, 0, 4, 46), rect(4, 0, 22, 3), rect(4, 14, 22, 3), rect(4, 28, 22, 3), rect(4, 43, 22, 3)]);
      case "cabinet": return solid([rect(0, 6, 36, 38), circle(15, 25, 1.6), circle(21, 25, 1.6)]);
      case "desk": return solid([rect(0, 12, 48, 5), rect(2, 17, 6, 27), rect(40, 17, 6, 27)]);
      case "dresser": return solid([rect(0, 4, 36, 40), circle(18, 12, 1.6), circle(18, 24, 1.6), circle(18, 36, 1.6)]);
      case "bench": return solid([rect(0, 18, 48, 5), [[4, 23], [12, 23], [12, 44], [10, 44], [8, 34], [6, 44], [4, 44]], [[36, 23], [44, 23], [44, 44], [42, 44], [40, 34], [38, 44], [36, 44]]]);
      case "sofa": return solid([rect(0, 14, 8, 26), rect(40, 14, 8, 26), rect(8, 6, 32, 16), rect(8, 24, 32, 10), rect(2, 40, 4, 4), rect(42, 40, 4, 4)]);
      case "armchair": return solid([rect(4, 14, 8, 26), rect(36, 14, 8, 26), rect(12, 4, 24, 18), rect(12, 24, 24, 10), rect(6, 40, 4, 4), rect(38, 40, 4, 4)]);
      case "wardrobe": return solid([rect(4, 0, 40, 4), rect(6, 4, 17.5, 42), rect(24.5, 4, 17.5, 42)]);
      case "nightstand": return solid([rect(6, 16, 36, 4), rect(8, 20, 32, 12), rect(8, 33, 32, 9), rect(8, 42, 4, 4), rect(36, 42, 4, 4)]);
      case "fireplace": return solid([rect(0, 6, 48, 5), [[4, 11], [44, 11], [44, 44], [32, 44], [32, 26], [24, 18], [16, 26], [16, 44], [4, 44]]]);
      case "counter": return solid([rect(0, 14, 48, 4), rect(2, 18, 14, 26), rect(17, 18, 14, 26), rect(32, 18, 14, 26), rect(34, 8, 3, 6), rect(34, 8, 8, 2)]);
    }
  }
  return [];
}

function size(p: MiniatureParams): string {
  switch (p.design) {
    case "house": return `${p.house.width} × ${p.house.depth} mm, ${Math.round(p.house.floors)} ${p.house.floors === 1 ? "floor" : "floors"}, ${ROOF_NAMES[p.house.roof].toLowerCase()} roof`;
    case "nook": return `${p.nook.width} × ${p.nook.depth} × ${p.nook.height} mm, ${NOOK_SCENES[p.nook.scene].toLowerCase()}`;
    case "furniture": return `${FURNITURE_NAMES[p.furniture.kind].toLowerCase()} at 1:${Math.round(scaleOf(p.furniture))}`;
    case "accessory": return `${ACCESSORY_NAMES[p.accessory.kind].toLowerCase()}, ${p.accessory.height} mm tall`;
  }
}

const fileTail = (p: MiniatureParams) => (p.design === "house" ? `${Math.round(p.house.width)}x${Math.round(p.house.depth)}mm` : p.design === "nook" ? `${Math.round(p.nook.width)}x${Math.round(p.nook.height)}mm` : p.design === "accessory" ? `${p.accessory.kind}-${Math.round(p.accessory.height)}mm` : `${p.furniture.kind}-1-${Math.round(scaleOf(p.furniture))}`);

export const MINIATURE: GeneratorDef<MiniatureParams> = {
  id: "miniature",
  name: "World Miniature Studio",
  version: MINIATURE_VERSION,
  defaults: () => mergeMiniature({}),
  merge: mergeMiniature,
  sections,
  presets: MINIATURE_PRESETS,
  build: buildMiniature,
  check: (p, out) => checkMiniature(p, out as MiniOutput),
  art,
  railPreview: (key, p) => (key.startsWith("house.") ? { ...p, design: "house" } : key.startsWith("nook.") ? { ...p, design: "nook" } : key.startsWith("furniture.") ? { ...p, design: "furniture" } : key.startsWith("accessory.") ? { ...p, design: "accessory" } : p),
  fileName: (p) => namedFile(p.design === "house" ? "miniature-house" : p.design === "nook" ? "book-nook" : p.design === "accessory" ? "miniature-garden" : "miniature", p.name, fileTail(p)),
  summary: (p) => `${DESIGN_NAMES[p.design]}, ${size(p)}`,
  help: {
    intro: [
      "World Miniature Studio makes laser-cut miniature buildings, book nooks and dollhouse furniture that slot together with tabs. One parametric model drives the cut sheets and the 3D view, so what you see is what you cut.",
      "Dollhouses and buildings have one to six floors, rooms with doorways, stairs, an open front or a closed facade, and six roof shapes (flat, gable, shed, hip, mansard, gambrel). Windows come in square, round-arch, pointed-arch, horseshoe and round shapes with bars, grids, shoji grids or cut lattice screens, and walls and roofs can carry scored brick, stone, half-timbering, boards, shingles or tiles.",
      `Each design starts from an architectural tradition: ${TRADITIONS.length} traditions from ${Object.keys(REGIONS).length} world regions, from Persian courtyard houses and windcatchers to machiya, hanok, riads, havelis, chalets and Fachwerk. A tradition sets typical roofs, openings and finishes; the models are HingeLab's own simplified interpretations, and the tradition notes are general descriptions that have not yet been checked against sources (each is marked unverified).`,
      "Houses can have a door leaf (plain, panelled, planked or glazed), a front step, a shopfront, a canopy porch or a veranda with railings on square posts, turned posts or classical columns, window boxes with flowers, scored pilasters, dormers standing on the front roof, a stair railing, balconies with doors, railings and brackets on every upper floor, and a brick chimney through the roof. The base can grow into a garden with a picket, post-and-rail, lattice or stone fence, a gate, a stepping-stone path, flower beds and trees, or into a pavement with a kerb and street lamps. The Country house and Town house themes set all of this in one go.",
      "Book nooks stand between books on a shelf: an alley between two facades or arches receding between shelves of books, with a light box for an LED strip, a battery bay with a hatch, and an optional mirror at the back.",
      "Garden and street pieces (leafy trees, pines, bushes, street lamps, classical columns, a fence run and a planter box) can also be made on their own. Trees and lamps are two halves slotted into each other, standing in a plus-shaped slot.",
      "Miniature furniture (chair, table, bed, bookshelf, cabinet, desk, dresser, bench, sofa, armchair, wardrobe, nightstand, fireplace and kitchen counter) is entered at full size and divided by the scale (1:6 to 1:48 or your own). The sheet thickness, tabs, slots, fit and kerf keep their real size, so parts too small for their joints are made just wide enough, and the check says so.",
    ],
    tips: [
      "Measure the material with calipers and set Thick exactly: every tab and slot is made from it.",
      "Cut a small piece first and set the joint fit until the tabs press in by hand.",
      "Engrave and score before cutting, so the sheet does not move between jobs.",
      "For book nook lighting use only low-voltage LED kits made for book nooks or dollhouses.",
      "At small scales, 1.5 to 2 mm material looks closer to real furniture than 3 mm.",
    ],
    keywords: ["dollhouse", "miniature", "book nook", "booknook", "architecture", "building", "house", "roof", "gable", "mansard", "gambrel", "hip roof", "windcatcher", "machiya", "hanok", "riad", "haveli", "chalet", "fachwerk", "tudor", "victorian", "furniture", "1:12", "1:24", "diorama", "porch", "veranda", "balcony", "railing", "fence", "picket fence", "gate", "garden", "chimney", "tree", "street lamp", "sofa", "wardrobe", "fireplace", "kitchen", "country house", "town house", "shopfront", "dormer", "column", "pilaster", "window box", "stair railing", "balustrade"],
  },
};

export { MINIATURE_DEFAULTS };
// Keep the tradition kit's opening type reachable for consumers of this module.
export type { OpeningShape };
