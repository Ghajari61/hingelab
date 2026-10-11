/**
 * The second material of a mixed design (acrylic letters on a wood sign, a wood medal on an acrylic
 * trophy). Parts marked `material: "second"` are packed on their own sheets, tagged with this name.
 */
import type { ChoiceSpec, NumberSpec } from "./types";

export interface Material2 {
  name: string;
  T: number;
  K: number;
  /** Preview colour. */
  color: string;
}

export const SECOND_MATERIALS: Record<string, Material2> = {
  "acrylic-gold": { name: "Gold mirror acrylic", T: 3, K: 0.1, color: "#D4AF37" },
  "acrylic-silver": { name: "Silver mirror acrylic", T: 3, K: 0.1, color: "#C9CED6" },
  "acrylic-rose": { name: "Rose gold mirror acrylic", T: 3, K: 0.1, color: "#E3A99B" },
  "acrylic-glitter": { name: "Gold glitter acrylic", T: 3, K: 0.1, color: "#E6C35C" },
  "acrylic-clear": { name: "Clear acrylic", T: 3, K: 0.1, color: "#CFE8F2" },
  "acrylic-white": { name: "White acrylic", T: 3, K: 0.1, color: "#F4F4F2" },
  "acrylic-black": { name: "Black acrylic", T: 3, K: 0.1, color: "#2B2B2E" },
  "acrylic-red": { name: "Red acrylic", T: 3, K: 0.1, color: "#C8323C" },
  "acrylic-pink": { name: "Pink acrylic", T: 3, K: 0.1, color: "#EE8FB5" },
  "acrylic-blue": { name: "Blue acrylic", T: 3, K: 0.1, color: "#3C6FD1" },
  "acrylic-green": { name: "Green acrylic", T: 3, K: 0.1, color: "#3E9A5E" },
  "birch-3": { name: "Birch plywood 3 mm", T: 3, K: 0.15, color: "#E3C79C" },
  "walnut-3": { name: "Walnut veneer plywood 3 mm", T: 3, K: 0.16, color: "#7A5233" },
  "mdf-3": { name: "MDF 3 mm", T: 3, K: 0.18, color: "#B88A5E" },
};

export const MATERIAL2_OPTIONS = Object.entries(SECOND_MATERIALS).map(([v, m]) => ({ v, text: m.name }));

export const material2 = (id: string): Material2 => SECOND_MATERIALS[id] ?? SECOND_MATERIALS["acrylic-gold"];

/** Material and thickness fields for the second material, stored at `<prefix>.mat2` and `<prefix>.T2`. */
export function material2Fields<P>(prefix: string, show?: (p: P) => boolean): [ChoiceSpec<P>, NumberSpec<P>] {
  return [
    {
      kind: "choice", key: `${prefix}.mat2`, label: "Second material", options: MATERIAL2_OPTIONS, show,
      help: "The material for the contrasting parts; they are laid out on their own sheets, named for it.",
      apply: (p, v) => {
        const q = structuredClone(p) as Record<string, Record<string, unknown>>;
        q[prefix] = { ...q[prefix], mat2: v, T2: material2(v).T };
        return q as P;
      },
    },
    {
      kind: "number", key: `${prefix}.T2`, label: "Second thickness", unit: "mm", min: 1, max: 12, step: 0.1, show,
      help: "Thickness of the second material; slots that hold its parts follow it.",
    },
  ];
}
