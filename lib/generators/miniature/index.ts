import { circle, rect } from "../geom";
import { FRET_NAMES, type FretKind } from "../fretKinds";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildMiniature, type MiniOutput } from "./build";
import { checkMiniature } from "./check";
import { OPENING_SHAPES, PANES, ROOF_FINISHES, WALL_FINISHES, type OpeningShape } from "./kit";
import {
  DESIGN_NAMES, FIT_NAMES, FURNITURE_NAMES, FURNITURE_REAL, MINIATURE_DEFAULTS, MINIATURE_VERSION, NOOK_SCENES, ROOF_NAMES, SCALES,
  mergeMiniature, scaleOf, type FurnitureKind, type JointFit, type MiniDesign, type MiniatureParams, type NookScene,
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
      { kind: "number", key: "house.width", label: "Width", unit: "mm", min: 80, max: 900, step: 1, help: "Outside width, side wall to side wall." },
      { kind: "number", key: "house.depth", label: "Depth", unit: "mm", min: 80, max: 600, step: 1, help: "Outside depth, back to front." },
      { kind: "number", key: "house.floors", label: "Floors", unit: "", min: 1, max: 6, step: 1, int: true, help: "Storeys, one to six." },
      { kind: "number", key: "house.floorH", label: "Floor height", unit: "mm", min: 40, max: 300, step: 1, help: "Clear height of each floor; 1:12 rooms are about 200 to 250 mm, 1:24 rooms about 100 to 125 mm." },
      { kind: "number", key: "house.rooms", label: "Rooms per floor", unit: "", min: 1, max: 5, step: 1, int: true, help: "Partitions split each floor into this many rooms." },
      { kind: "toggle", key: "house.doorways", label: "Doorways", help: "Cuts a doorway through each partition." },
      { kind: "toggle", key: "house.stairs", label: "Stairs", help: "A stair in the first room on every floor but the top, under a stairwell in the floor above." },
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
        kind: "choice", key: "furniture.kind", label: "Piece", rail: true, help: "Chair, table, bed, bookshelf, cabinet, desk, dresser or bench.", options: opts(FURNITURE_NAMES),
        apply: (p, v) => ({ ...p, furniture: { ...p.furniture, kind: v as FurnitureKind, ...FURNITURE_REAL[v as FurnitureKind] }, name: BUILT_IN_NAMES.has(p.name) ? FURNITURE_NAMES[v as FurnitureKind] : p.name }),
      },
      { kind: "choice", key: "furniture.scale", label: "Scale", help: "The common dollhouse scale is 1:12; 1:24 and 1:48 are smaller, and 1:6 suits fashion dolls.", options: opts(SCALES) },
      { kind: "number", key: "furniture.custom", label: "Custom scale 1:", unit: "", min: 1, max: 200, step: 1, show: (p) => p.furniture.scale === "custom", help: "The divisor of your scale." },
      { kind: "number", key: "furniture.width", label: "Full-size width", unit: "mm", min: 100, max: 4000, step: 10, help: "Width of the full-size piece." },
      { kind: "number", key: "furniture.depth", label: "Full-size depth", unit: "mm", min: 100, max: 4000, step: 10, help: "Depth of the full-size piece (a bed's length)." },
      { kind: "number", key: "furniture.height", label: "Full-size height", unit: "mm", min: 100, max: 4000, step: 10, help: "Height of the full-size piece." },
      { kind: "number", key: "furniture.shelves", label: "Shelves", unit: "", min: 0, max: 10, step: 1, int: true, show: (p) => p.furniture.kind === "bookshelf" || p.furniture.kind === "cabinet", help: "Shelves inside (a cabinet takes up to three)." },
      { kind: "number", key: "furniture.drawers", label: "Drawers", unit: "", min: 1, max: 8, step: 1, int: true, show: (p) => p.furniture.kind === "dresser", help: "Drawer fronts on the dresser (they are scored, not opening)." },
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
    }
  }
  return [];
}

function size(p: MiniatureParams): string {
  switch (p.design) {
    case "house": return `${p.house.width} × ${p.house.depth} mm, ${Math.round(p.house.floors)} ${p.house.floors === 1 ? "floor" : "floors"}, ${ROOF_NAMES[p.house.roof].toLowerCase()} roof`;
    case "nook": return `${p.nook.width} × ${p.nook.depth} × ${p.nook.height} mm, ${NOOK_SCENES[p.nook.scene].toLowerCase()}`;
    case "furniture": return `${FURNITURE_NAMES[p.furniture.kind].toLowerCase()} at 1:${Math.round(scaleOf(p.furniture))}`;
  }
}

const fileTail = (p: MiniatureParams) => (p.design === "house" ? `${Math.round(p.house.width)}x${Math.round(p.house.depth)}mm` : p.design === "nook" ? `${Math.round(p.nook.width)}x${Math.round(p.nook.height)}mm` : `${p.furniture.kind}-1-${Math.round(scaleOf(p.furniture))}`);

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
  railPreview: (key, p) => (key.startsWith("house.") ? { ...p, design: "house" } : key.startsWith("nook.") ? { ...p, design: "nook" } : key.startsWith("furniture.") ? { ...p, design: "furniture" } : p),
  fileName: (p) => namedFile(p.design === "house" ? "miniature-house" : p.design === "nook" ? "book-nook" : "miniature", p.name, fileTail(p)),
  summary: (p) => `${DESIGN_NAMES[p.design]}, ${size(p)}`,
  help: {
    intro: [
      "World Miniature Studio makes laser-cut miniature buildings, book nooks and dollhouse furniture that slot together with tabs. One parametric model drives the cut sheets and the 3D view, so what you see is what you cut.",
      "Dollhouses and buildings have one to six floors, rooms with doorways, stairs, an open front or a closed facade, and six roof shapes (flat, gable, shed, hip, mansard, gambrel). Windows come in square, round-arch, pointed-arch, horseshoe and round shapes with bars, grids, shoji grids or cut lattice screens, and walls and roofs can carry scored brick, stone, half-timbering, boards, shingles or tiles.",
      `Each design starts from an architectural tradition: ${TRADITIONS.length} traditions from ${Object.keys(REGIONS).length} world regions, from Persian courtyard houses and windcatchers to machiya, hanok, riads, havelis, chalets and Fachwerk. A tradition sets typical roofs, openings and finishes; the models are HingeLab's own simplified interpretations, and the tradition notes are general descriptions that have not yet been checked against sources (each is marked unverified).`,
      "Book nooks stand between books on a shelf: an alley between two facades or arches receding between shelves of books, with a light box for an LED strip, a battery bay with a hatch, and an optional mirror at the back.",
      "Miniature furniture is entered at full size and divided by the scale (1:6 to 1:48 or your own). The sheet thickness, tabs, slots, fit and kerf keep their real size, so parts too small for their joints are made just wide enough, and the check says so.",
    ],
    tips: [
      "Measure the material with calipers and set Thick exactly: every tab and slot is made from it.",
      "Cut a small piece first and set the joint fit until the tabs press in by hand.",
      "Engrave and score before cutting, so the sheet does not move between jobs.",
      "For book nook lighting use only low-voltage LED kits made for book nooks or dollhouses.",
      "At small scales, 1.5 to 2 mm material looks closer to real furniture than 3 mm.",
    ],
    keywords: ["dollhouse", "miniature", "book nook", "booknook", "architecture", "building", "house", "roof", "gable", "mansard", "gambrel", "hip roof", "windcatcher", "machiya", "hanok", "riad", "haveli", "chalet", "fachwerk", "tudor", "victorian", "furniture", "1:12", "1:24", "diorama"],
  },
};

export { MINIATURE_DEFAULTS };
// Keep the tradition kit's opening type reachable for consumers of this module.
export type { OpeningShape };
