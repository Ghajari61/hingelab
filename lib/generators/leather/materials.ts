/**
 * Leathers and leather-like materials, with what the laser may do with them.
 *
 * Safety rules (they decide what the generator lets you export):
 * - No leather is assumed safe for the laser. Laser output needs the user to confirm they have the
 *   material's composition and the maker's guidance for laser processing (`verified`), and an
 *   extraction, filtration and fire-watch setup.
 * - PVC and vinyl, and leatherette of unknown make (which may be PVC), are never laser cut: the
 *   generator gives a hand-cutting template instead.
 * - Chrome-tanned leather, PU and synthetic leathers, and leather of unknown tannage are not
 *   approved by default; they need the same confirmation.
 * - No laser settings are given: they depend on the machine and the hide and must be found by test.
 *
 * Thicknesses are typical starting points; set the real thickness measured with calipers.
 */

export type LaserStatus = "verify" | "not-approved" | "blocked";
export const LASER_STATUS: Record<LaserStatus, string> = {
  verify: "Laser cutting only once the composition and the maker's laser guidance are checked",
  "not-approved": "Not approved for the laser by default; needs the maker's composition and laser guidance",
  blocked: "Never laser cut (may give off chlorine or other toxic fumes); cut by hand",
};

export interface Leather {
  id: string;
  name: string;
  laser: LaserStatus;
  /** Typical thickness, mm. */
  T: number;
  /** 0 (soft, drapes) to 1 (firm, holds a shape). */
  stiffness: number;
  /** Approximate density, g/cm³, for weight. */
  density: number;
  finish: string;
  notes: string;
}

export const LEATHERS: Leather[] = [
  { id: "vegtan", name: "Vegetable-tanned leather", laser: "verify", T: 2, stiffness: 0.75, density: 0.9, finish: "Natural, can be tooled and dyed", notes: "Holds a shape and burnishes well; ask the tannery about finishes before lasering." },
  { id: "fullgrain", name: "Full-grain leather (tannage unknown)", laser: "not-approved", T: 1.8, stiffness: 0.55, density: 0.85, finish: "Full grain", notes: "Grain describes the surface, not the tannage: find out how it was tanned." },
  { id: "topgrain", name: "Top-grain leather (tannage unknown)", laser: "not-approved", T: 1.4, stiffness: 0.45, density: 0.8, finish: "Corrected grain", notes: "Often has a pigmented or coated surface: check the coating." },
  { id: "chrome", name: "Chrome-tanned leather", laser: "not-approved", T: 1.4, stiffness: 0.3, density: 0.8, finish: "Soft, often finished", notes: "Contains chromium salts; not approved for the laser by default." },
  { id: "suede", name: "Suede", laser: "not-approved", T: 1.2, stiffness: 0.2, density: 0.7, finish: "Napped flesh side", notes: "Usually chrome tanned; frays at a cut edge." },
  { id: "nubuck", name: "Nubuck", laser: "not-approved", T: 1.4, stiffness: 0.3, density: 0.75, finish: "Sanded grain", notes: "Usually chrome tanned." },
  { id: "board", name: "Leatherboard (bonded fibre)", laser: "verify", T: 1.5, stiffness: 0.85, density: 1.1, finish: "Smooth, paper-like", notes: "Used for stiffeners; binders vary, so check the sheet's data." },
  { id: "synthetic", name: "Synthetic leather (known make)", laser: "not-approved", T: 1.2, stiffness: 0.3, density: 0.9, finish: "Coated textile", notes: "Needs the maker's composition: many contain PVC." },
  { id: "pu", name: "PU leather", laser: "not-approved", T: 1.2, stiffness: 0.3, density: 0.9, finish: "Polyurethane coated", notes: "Polyurethane gives off harmful fumes when burnt; only with the maker's guidance." },
  { id: "leatherette", name: "Unknown leatherette", laser: "blocked", T: 1.2, stiffness: 0.3, density: 0.9, finish: "Unknown coating", notes: "May be PVC: cut by hand." },
  { id: "pvc", name: "PVC or vinyl leatherette", laser: "blocked", T: 1.2, stiffness: 0.3, density: 1.3, finish: "Vinyl", notes: "PVC releases chlorine compounds when lasered and damages the machine: cut by hand only." },
];

export const LEATHER_BY_ID: Record<string, Leather> = Object.fromEntries(LEATHERS.map((l) => [l.id, l]));
export const leatherOf = (id: string): Leather => LEATHER_BY_ID[id] ?? LEATHER_BY_ID.vegtan;

/** Whether laser output is allowed for this material and this confirmation. */
export const laserAllowed = (l: Leather, verified: boolean) => l.laser !== "blocked" && verified;

/** The setup the laser needs for any leather, shown with the export. */
export const LASER_CHECKLIST = [
  "Use extraction vented outside or through a filter rated for the fumes, and run it during and after the job.",
  "Never leave the laser unattended; keep a suitable extinguisher at hand.",
  "Find speed, power and passes on an offcut of the same hide: no settings are given here.",
  "Cut the stitch-hole test strip first and check the holes against your needle and thread.",
];
