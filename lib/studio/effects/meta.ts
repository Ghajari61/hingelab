/** Names and search words of the Live Effects (no geometry here, so the command registry can use it). */
import type { EffectKind } from "../types";

export const EFFECT_META: Record<EffectKind, { label: string; description: string; keywords: string }> = {
  corners: { label: "Corners", description: "Round, chamfer or notch the sharp corners between straight segments", keywords: "fillet chamfer round corners radius inverse notch" },
  offset: { label: "Offset", description: "Grow or shrink the outline by a distance", keywords: "inset outset grow shrink outline kerf" },
  hatches: { label: "Hatches", description: "Fill the area with parallel lines for line engraving or scoring", keywords: "hatch fill lines crosshatch engrave scan" },
  rotateCopies: { label: "Rotate Copies", description: "Copies rotated around a centre, optionally fused into one shape", keywords: "rotate copies radial array kaleidoscope mandala polar" },
  mirror: { label: "Mirror", description: "A mirrored copy across a vertical, horizontal or free axis", keywords: "mirror symmetry reflect flip symmetric" },
  symmetry: { label: "Kaleidoscope", description: "Mirror lines through a centre: the artwork repeats in every wedge, mirrored in turn, and stays editable", keywords: "symmetry kaleidoscope mandala mirror lines dihedral corel symmetric drawing" },
  blockShadow: { label: "Solid Shadow", description: "A solid shadow swept out behind the shape: one piece to cut from a second colour and glue behind, or fused into one outline", keywords: "block shadow solid shadow offset layer sign letters 3d stacked corel" },
  depth: { label: "Depth", description: "A 3D-looking extrusion drawn as lines: side edges and the back face, in perspective if you like, for engraving or scoring", keywords: "extrude extrusion depth 3d perspective isometric box corel" },
  livingHinge: { label: "Living Hinge", description: "Fill a closed shape with a flexible hinge cut pattern", keywords: "living hinge kerf bend flex lattice slits cuts" },
  patternAlongPath: { label: "Pattern Along Path", description: "Repeat or stretch another object along this path (borders, frames, chains)", keywords: "pattern along path brush repeat stretch skeleton spine border art brush" },
  bend: { label: "Bend", description: "Bend the artwork along a guide you shape on the canvas", keywords: "bend warp arc curve text along guide flex distort" },
  envelope: { label: "Envelope", description: "Warp the artwork by moving the four corners of its box (bilinear or perspective)", keywords: "envelope distort perspective deform warp four corners free distort" },
  roughen: { label: "Roughen", description: "Split segments and jitter the nodes for organic, hand-made edges (seeded)", keywords: "roughen jitter random distort organic rough edges noise zig zag" },
  interpolate: { label: "Interpolate", description: "Shapes in between two outlines in equal steps (contour art)", keywords: "interpolate blend steps tween morph contour" },
  taperStroke: { label: "Taper Stroke", description: "A filled stroke that tapers to points at its ends (engraving art)", keywords: "taper stroke variable width brush calligraphic fill outline" },
  powerStroke: { label: "Power Stroke", description: "A filled stroke whose width you set at points along the path", keywords: "power stroke variable width profile brush fill outline pressure" },
  measureSegments: { label: "Measure Segments", description: "Length labels on every segment; shown on the canvas, never cut", keywords: "measure segments dimension length label ruler annotate" },
  liveBoolean: { label: "Live Boolean", description: "Union, difference, intersection and more with another object that stays editable", keywords: "boolean operation live pathfinder union difference intersection exclusion division cut path combine" },
  distort: { label: "Distort", description: "Push & Pull, Zipper or Twister distortion that stays editable", keywords: "distort push pull zipper zigzag wave twister twirl swirl pucker bloat corel" },
};

export const EFFECT_ORDER: EffectKind[] = [
  "corners", "offset", "hatches", "rotateCopies", "mirror", "symmetry", "blockShadow", "depth", "livingHinge",
  "patternAlongPath", "bend", "envelope", "roughen", "distort", "interpolate", "taperStroke", "powerStroke", "measureSegments", "liveBoolean",
];

/**
 * Effects that read another object, and the space of their cached copy: "page" = the object as it sits on
 * the page (its world transform applied); "local" = the object in the coordinates of the object carrying
 * the effect, so it keeps its place on the page when either one moves.
 */
export const LINK_SPACE: Partial<Record<EffectKind, "page" | "local">> = { patternAlongPath: "page", interpolate: "local", liveBoolean: "local" };
