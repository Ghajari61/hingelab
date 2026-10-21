/** The cut-out pattern kinds and grids as plain data, for settings and panels that draw no pattern. */
export type FretKind = "none" | "lattice" | "floral" | "quatrefoil" | "honeycomb" | "circles" | "stars" | "leaves" | "motif" | "tile";

export const FRET_NAMES: Record<FretKind, string> = {
  none: "None", lattice: "Diamond lattice", floral: "Floral rosettes", quatrefoil: "Moroccan quatrefoil",
  honeycomb: "Honeycomb", circles: "Circles", stars: "Stars", leaves: "Woven leaves",
  motif: "A motif (yours or from the library)",
  tile: "Your own tile (seamless)",
};
export const FRET_KINDS = Object.keys(FRET_NAMES) as FretKind[];
/** The kinds that need nothing of the user's: no tile picture (for products that cannot pick one). */
export const FRET_BUILT_IN = FRET_KINDS.filter((k) => k !== "tile");

/** How the motif or tile repeats: rows offset half a cell (the motif's default), a square grid, bricks, columns dropped half a cell, or mirrored neighbours. */
export type FretGrid = "auto" | "square" | "brick" | "half" | "mirror";
export const FRET_GRIDS: Record<FretGrid, string> = { auto: "Standard", square: "Square", brick: "Brick", half: "Half drop", mirror: "Mirrored" };
export const isFretKind = (v: unknown): v is FretKind => typeof v === "string" && v in FRET_NAMES && v !== "none";
