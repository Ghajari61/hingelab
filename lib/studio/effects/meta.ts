/** Names and search words of the Live Effects (no geometry here, so the command registry can use it). */
import type { EffectKind } from "../types";

export const EFFECT_META: Record<EffectKind, { label: string; description: string; keywords: string }> = {
  corners: { label: "Corners", description: "Round, chamfer or notch the sharp corners between straight segments", keywords: "fillet chamfer round corners radius inverse notch" },
  offset: { label: "Offset", description: "Grow or shrink the outline by a distance", keywords: "inset outset grow shrink outline kerf" },
  hatches: { label: "Hatches", description: "Fill the area with parallel lines for line engraving or scoring", keywords: "hatch fill lines crosshatch engrave scan" },
  rotateCopies: { label: "Rotate Copies", description: "Copies rotated around a centre, optionally fused into one shape", keywords: "rotate copies radial array kaleidoscope mandala polar" },
  mirror: { label: "Mirror", description: "A mirrored copy across a vertical, horizontal or free axis", keywords: "mirror symmetry reflect flip symmetric" },
  livingHinge: { label: "Living Hinge", description: "Fill a closed shape with a flexible hinge cut pattern", keywords: "living hinge kerf bend flex lattice slits cuts" },
};

export const EFFECT_ORDER: EffectKind[] = ["corners", "offset", "hatches", "rotateCopies", "mirror", "livingHinge"];
