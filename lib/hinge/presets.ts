import type { Preset } from "@/lib/presets";
import type { Params } from "./types";

export const HINGE_PRESETS: Preset<Params>[] = [
  { id: "gift-box", name: "Gift box", note: "140 × 90 × 70 mm, lift-off lid", params: { name: "Gift box" } },
  { id: "card-box", name: "Card deck box", note: "Fits a deck of playing cards", params: { name: "Card deck box", W: 100, D: 72, H: 45, R: 18 } },
  { id: "tea-box", name: "Tea box", note: "Large rounded box for tea bags", params: { name: "Tea box", W: 180, D: 110, H: 85, R: 30 } },
  { id: "pencil-cup", name: "Pencil cup", note: "Open round cup, 80 mm across", params: { name: "Pencil cup", shape: "cyl", dia: 80, H: 100, lid: "open" } },
  { id: "keepsake", name: "Round keepsake", note: "Wide cylinder with a lid", params: { name: "Round keepsake", shape: "cyl", dia: 120, H: 60 } },
  { id: "pill-tin", name: "Pill tin", note: "Long box with round ends", params: { name: "Pill tin", shape: "pill", W: 160, D: 60, H: 40, R: 30 } },
  { id: "hex-jewel", name: "Hexagon jewellery box", note: "Six sides, lift-off lid", params: { name: "Hexagon jewellery box", shape: "poly", sides: 6, W: 120, H: 50 } },
  { id: "oct-planter", name: "Octagon planter", note: "Eight sides, open top", params: { name: "Octagon planter", shape: "poly", sides: 8, W: 160, H: 120, lid: "open" } },
  { id: "wave-box", name: "Wave hinge box", note: "Decorative wave pattern", params: { name: "Wave hinge box", pattern: "wave", W: 150, D: 100, H: 70, R: 28 } },
  { id: "serpentine-cup", name: "Serpentine cup", note: "Very flexible hinge, tight bends", params: { name: "Serpentine cup", shape: "cyl", dia: 70, H: 90, lid: "open", pattern: "serpentine" } },
  { id: "relief-box", name: "Relief-cut box", note: "Stress-relief slits, stiffer walls", params: { name: "Relief-cut box", pattern: "relief", W: 130, D: 130, H: 60, R: 30 } },
  { id: "card-prototype", name: "Cardboard prototype", note: "2 mm chipboard, try a size first", params: { name: "Cardboard prototype", material: "card2", T: 2, K: 0.2 } },
];
