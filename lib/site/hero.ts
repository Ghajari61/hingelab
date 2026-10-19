/** The landing page's mini generator: its shapes and size ranges (no geometry here, so the page can load it at once). */
export type HeroShape = "rect" | "pill" | "poly" | "cyl";
export const HERO_SHAPES: { v: HeroShape; label: string }[] = [
  { v: "rect", label: "Rounded" },
  { v: "pill", label: "Pill" },
  { v: "poly", label: "Hexagon" },
  { v: "cyl", label: "Cylinder" },
];
export const HERO_WIDTH = { min: 90, max: 200, start: 140 };
export const HERO_HEIGHT = { min: 50, max: 110, start: 70 };
