import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { FIT_MM, FIT_NAMES, type JointFit } from "../boxes/params";
import { FRET_NAMES, type FretKind } from "../fretKinds";
import { OPENING_SHAPES, PANES, ROOF_FINISHES, WALL_FINISHES, type OpeningShape, type Panes, type RoofFinish, type WallFinish } from "./kit";
import { TRADITION_BY_ID, type RoofKind } from "./traditions";

export { FIT_MM, FIT_NAMES, type JointFit };

export type MiniDesign = "house" | "nook" | "furniture";
export const DESIGN_NAMES: Record<MiniDesign, string> = { house: "Dollhouse and building", nook: "Book nook", furniture: "Miniature furniture" };

export const ROOF_NAMES: Record<RoofKind, string> = { flat: "Flat", gable: "Gable", shed: "Shed", hip: "Hip", mansard: "Mansard", gambrel: "Gambrel" };

export type NookScene = "alley" | "arches";
export const NOOK_SCENES: Record<NookScene, string> = { alley: "Alley street", arches: "Arcade or library" };

export type FurnitureKind = "chair" | "table" | "bed" | "bookshelf" | "cabinet" | "desk" | "dresser" | "bench";
export const FURNITURE_NAMES: Record<FurnitureKind, string> = { chair: "Chair", table: "Table", bed: "Bed", bookshelf: "Bookshelf", cabinet: "Cabinet", desk: "Desk", dresser: "Dresser", bench: "Bench" };
/** Typical full-size furniture, mm (width × depth × height): the starting size before the scale. */
export const FURNITURE_REAL: Record<FurnitureKind, { width: number; depth: number; height: number }> = {
  chair: { width: 450, depth: 480, height: 900 }, table: { width: 1200, depth: 800, height: 750 }, bed: { width: 950, depth: 2000, height: 900 },
  bookshelf: { width: 800, depth: 300, height: 1800 }, cabinet: { width: 800, depth: 450, height: 900 }, desk: { width: 1200, depth: 600, height: 750 },
  dresser: { width: 900, depth: 450, height: 850 }, bench: { width: 1200, depth: 350, height: 450 },
};
export type Scale = "6" | "12" | "16" | "18" | "24" | "48" | "custom";
export const SCALES: Record<Scale, string> = { "6": "1:6", "12": "1:12", "16": "1:16", "18": "1:18", "24": "1:24", "48": "1:48", custom: "Custom" };

export interface MiniatureParams extends GenBase {
  design: MiniDesign;
  /** The architectural tradition the design starts from (see traditions.ts). */
  tradition: string;
  joint: { fit: JointFit };
  house: {
    width: number; depth: number; floors: number; floorH: number; rooms: number; front: "open" | "panel";
    roof: RoofKind; pitch: number; overhang: number; parapet: number; plinth: number;
    sideWindows: number; backWindows: number; frontWindows: number;
    opening: OpeningShape; panes: Panes; lattice: FretKind; winW: number; winH: number;
    doorW: number; doorH: number; doorways: boolean; trim: boolean; shutters: boolean;
    wall: WallFinish; roofFinish: RoofFinish; stairs: boolean; tower: boolean;
  };
  nook: {
    width: number; height: number; depth: number; scene: NookScene; buildings: number; storeys: number;
    opening: OpeningShape; panes: Panes; lattice: FretKind; light: boolean; battery: boolean; mirror: boolean; wall: WallFinish;
  };
  furniture: { kind: FurnitureKind; scale: Scale; custom: number; width: number; depth: number; height: number; shelves: number; drawers: number };
}

export const MINIATURE_DEFAULTS: MiniatureParams = {
  name: "Dollhouse",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  design: "house",
  tradition: "victorian",
  joint: { fit: "standard" },
  house: {
    width: 300, depth: 180, floors: 2, floorH: 110, rooms: 2, front: "open",
    roof: "gable", pitch: 40, overhang: 8, parapet: 12, plinth: 8,
    sideWindows: 1, backWindows: 2, frontWindows: 2,
    opening: "arch", panes: "cross", lattice: "lattice", winW: 30, winH: 45,
    doorW: 34, doorH: 70, doorways: true, trim: true, shutters: false,
    wall: "boards", roofFinish: "shingles", stairs: true, tower: false,
  },
  nook: { width: 110, height: 220, depth: 180, scene: "alley", buildings: 3, storeys: 3, opening: "rect", panes: "cross", lattice: "lattice", light: true, battery: true, mirror: false, wall: "brick" },
  furniture: { kind: "chair", scale: "12", custom: 20, ...FURNITURE_REAL.chair, shelves: 3, drawers: 3 },
};

export function mergeMiniature(raw: unknown): MiniatureParams {
  const p = mergeInto(clone(MINIATURE_DEFAULTS), raw);
  if (!(p.design in DESIGN_NAMES)) p.design = "house";
  if (!(p.tradition in TRADITION_BY_ID)) p.tradition = "modern";
  if (!(p.joint.fit in FIT_MM)) p.joint.fit = "standard";
  const h = p.house, n = p.nook, f = p.furniture;
  if (!(h.roof in ROOF_NAMES)) h.roof = "gable";
  if (h.front !== "panel") h.front = "open";
  if (!(h.opening in OPENING_SHAPES)) h.opening = "rect";
  if (!(h.panes in PANES)) h.panes = "none";
  if (!(h.lattice in FRET_NAMES) || h.lattice === "none" || h.lattice === "motif" || h.lattice === "tile") h.lattice = "lattice";
  if (!(h.wall in WALL_FINISHES)) h.wall = "plain";
  if (!(h.roofFinish in ROOF_FINISHES)) h.roofFinish = "plain";
  if (!(n.scene in NOOK_SCENES)) n.scene = "alley";
  if (!(n.opening in OPENING_SHAPES)) n.opening = "rect";
  if (!(n.panes in PANES)) n.panes = "none";
  if (!(n.lattice in FRET_NAMES) || n.lattice === "none" || n.lattice === "motif" || n.lattice === "tile") n.lattice = "lattice";
  if (!(n.wall in WALL_FINISHES)) n.wall = "plain";
  if (!(f.kind in FURNITURE_NAMES)) f.kind = "chair";
  if (!(f.scale in SCALES)) f.scale = "12";
  return p;
}

/** The scale divisor: 12 for 1:12. */
export const scaleOf = (f: MiniatureParams["furniture"]) => (f.scale === "custom" ? Math.max(1, f.custom) : Number(f.scale));

export const MINIATURE_VERSION = 1;
