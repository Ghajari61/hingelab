/**
 * The paper box engine's types. Everything is in millimetres; units are a display matter
 * (units.ts). A box style turns a `BoxParams` into a `Dieline`: flat parts made of paths, each
 * path with its line type, plus the faces (for decoration and the fold preview).
 */

export type Pt = [number, number];

/** What a line does: cut through, crease (fold), perforate, half-cut (kiss cut), engrave, or mark the bleed. */
export type LineType = "cut" | "crease" | "perforation" | "halfCut" | "engrave" | "bleed";
export const LINE_TYPES: LineType[] = ["cut", "crease", "perforation", "halfCut", "engrave", "bleed"];

export interface DielinePath {
  type: LineType;
  pts: Pt[];
  closed: boolean;
}

/**
 * A flat face of the box, for decoration (its frame: origin, the u axis along its width and the v
 * axis along its height, so artwork lands upright) and for the fold preview (the face it folds
 * from, the hinge on that face's edge, and its angle when the box is assembled).
 */
export interface Face {
  id: string;
  name: string;
  /** Outline on the sheet. */
  poly: Pt[];
  origin: Pt;
  u: Pt;
  v: Pt;
  w: number;
  h: number;
  parent?: string;
  /** The crease it folds on (two points on the sheet). */
  hinge?: [Pt, Pt];
  /** Fold angle when assembled, degrees (positive folds toward the viewer: the printed side out). */
  angle?: number;
  /** A face that holds the print (the outside of the box). */
  printable?: boolean;
}

export interface DielinePart {
  id: string;
  name: string;
  paths: DielinePath[];
  faces: Face[];
}

export interface Dieline {
  style: string;
  parts: DielinePart[];
  /** Outside and inside sizes of the finished box, mm (length × width × height). */
  outer: [number, number, number];
  inner: [number, number, number];
  /** Step-by-step assembly. */
  assembly: string[];
  warnings: string[];
}

/** Parameters every style shares. Styles add their own. */
export interface BoxBase {
  /** Length, width and height, mm. */
  L: number;
  W: number;
  H: number;
  /** Whether L, W and H are inside or outside sizes. */
  dims: "inner" | "outer";
  /** Board thickness, mm. */
  thickness: number;
  /** Bleed round printed faces, mm (0: none). */
  bleed: number;
}

export type BoxParams = BoxBase & Record<string, number | string | boolean>;

/** One setting in a style's schema; the UI is made from these. */
export type ParamField =
  | { key: string; label: string; kind: "length"; min: number; max: number; step: number; help?: string }
  | { key: string; label: string; kind: "number"; min: number; max: number; step: number; unit?: "deg" | "%" | ""; help?: string }
  | { key: string; label: string; kind: "toggle"; help?: string }
  | { key: string; label: string; kind: "select"; options: { v: string; text: string }[]; help?: string };

export interface BoxStyle<P extends BoxParams = BoxParams> {
  id: string;
  name: string;
  /** Lucide icon name for the picker. */
  icon: string;
  blurb: string;
  defaultParams: P;
  paramSchema: { id: string; title: string; fields: ParamField[] }[];
  build(params: P): Dieline;
}
