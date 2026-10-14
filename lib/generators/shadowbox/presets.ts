import type { DeepPartial, GenPreset } from "../types";
import type { FrameShape, PaletteId, ShadowBoxParams } from "./params";

type P = DeepPartial<ShadowBoxParams>;
type G = DeepPartial<ShadowBoxParams["design"]>;
type Frame = DeepPartial<ShadowBoxParams["frame"]>;

interface Opts { frame?: FrameShape | Frame; palette?: PaletteId; reverse?: boolean; layers?: number; extra?: P }

function preset(id: string, name: string, note: string, design: G, o: Opts = {}): GenPreset<ShadowBoxParams> {
  const frame: Frame = typeof o.frame === "string" ? { shape: o.frame } : (o.frame ?? {});
  const params: P = {
    name,
    ...o.extra,
    frame: { ...frame, ...o.extra?.frame },
    stack: { count: o.layers ?? (design.pattern === "tunnel" || design.pattern === "landscape" ? 8 : 7), ...o.extra?.stack },
    design: { ...design, ...o.extra?.design },
    look: { palette: o.palette ?? "sunset", reverse: o.reverse ?? false },
  };
  return { id, name, note, params };
}

const tunnel = (g: G): G => ({ pattern: "tunnel", twist: 0, ...g });
const mandala = (g: G): G => ({ pattern: "mandala", opening: "circle", min: 25, max: 110, twist: 0, ...g });
const sunburst = (g: G): G => ({ pattern: "sunburst", min: 22, max: 100, twist: 0, ...g });
const land = (g: G): G => ({ pattern: "landscape", min: 34, max: 84, twist: 0, ...g });
const lattice = (g: G): G => ({ pattern: "lattice", min: 25, max: 95, twist: 0, ...g });
const wide: Frame = { shape: "rect", width: 240, height: 180, corner: 0 };
const BLADE: P = { cutter: { kind: "blade" }, material: "custom", T: 0.5, K: 0, bedW: 292, bedH: 292, gap: 3 };

export const SHADOWBOX_PRESETS: GenPreset<ShadowBoxParams>[] = [
  // Tunnels
  preset("star-tunnel", "Star tunnel", "Six-point stars twisting into the distance", tunnel({ opening: "star", sides: 6, inner: 55, twist: 6, min: 18, max: 118 })),
  preset("circle-portal", "Circle portal", "Rings of a round tunnel in a square frame", tunnel({ opening: "circle", min: 15, max: 125 }), { frame: "rect", palette: "ocean" }),
  preset("hex-spiral", "Hexagon spiral", "Hexagons turning a little on every layer", tunnel({ opening: "polygon", sides: 6, twist: 8, min: 16, max: 120 }), { palette: "lavender" }),
  preset("square-vortex", "Square vortex", "Twelve squares spiralling inward", tunnel({ opening: "polygon", sides: 4, rotate: 45, twist: 7, min: 14, max: 128 }), { frame: "rect", palette: "mono", layers: 12 }),
  preset("triangle-vortex", "Triangle vortex", "Rainbow triangles spinning in a round frame", tunnel({ opening: "polygon", sides: 3, twist: 10, min: 16, max: 135 }), { frame: "circle", palette: "rainbow" }),
  preset("pentagon-well", "Pentagon well", "Deep green pentagons in a hexagon frame", tunnel({ opening: "polygon", sides: 5, min: 18, max: 115 }), { frame: "hexagon", palette: "forest" }),
  preset("octagon-gate", "Octagon gate", "Gold octagons in an octagon frame", tunnel({ opening: "polygon", sides: 8, rotate: 22.5, min: 18, max: 112 }), { frame: "octagon", palette: "gold" }),
  preset("eight-point-star", "Eight-point star", "An autumn star burst with a slow twist", tunnel({ opening: "star", sides: 8, inner: 45, twist: 4, min: 18, max: 120 }), { palette: "autumn" }),
  preset("night-star", "Night star", "Five-point stars with a light hole behind", tunnel({ opening: "star", sides: 5, inner: 45, min: 20, max: 125, moon: true }), { palette: "night" }),
  preset("heart-tunnel", "Heart tunnel", "Hearts inside a heart, for a wedding or Valentine's", tunnel({ opening: "heart", min: 16, max: 110 }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "rose" }),
  preset("heart-frame", "Heart in a square", "Candy-coloured hearts in a square frame", tunnel({ opening: "heart", min: 18, max: 118 }), { frame: "rect", palette: "candy" }),
  preset("flower-six", "Six-petal flower", "A round frame of mint flowers", tunnel({ opening: "flower", sides: 6, inner: 45, min: 18, max: 115 }), { frame: "circle", palette: "mint" }),
  preset("flower-eight", "Scalloped bloom", "Eight-petal flowers twisting in a scalloped frame", tunnel({ opening: "flower", sides: 8, inner: 55, twist: 5, min: 18, max: 112 }), { frame: "scalloped", palette: "coral" }),
  preset("daisy-spiral", "Daisy spiral", "Twelve-petal daisies turning toward you", tunnel({ opening: "flower", sides: 12, inner: 62, twist: 7, min: 16, max: 118 }), { palette: "sunset", reverse: true }),
  preset("arch-portal", "Arch portal", "Nested arches in an arched frame", tunnel({ opening: "arch", min: 22, max: 118 }), { frame: { shape: "arch", width: 180, height: 240 }, palette: "desert" }),
  preset("cathedral", "Cathedral", "Arches running down toward a low vanishing point", tunnel({ opening: "arch", min: 20, max: 118, shiftY: 45 }), { frame: { shape: "arch", width: 180, height: 240 }, palette: "kraft", layers: 12 }),
  preset("rabbit-hole", "Rabbit hole", "A round tunnel that bends off to one side", tunnel({ opening: "circle", min: 12, max: 125, shiftX: 45, shiftY: -30 }), { palette: "ocean", layers: 12 }),
  preset("corridor", "Corridor", "Frames receding to a vanishing point on the left", tunnel({ opening: "frame", min: 12, max: 100, shiftX: -55 }), { frame: wide, palette: "mono", reverse: true, layers: 12 }),
  preset("echo-rings", "Echo rings", "Even rainbow rings in a round frame", tunnel({ opening: "frame", min: 10, max: 100 }), { frame: "circle", palette: "rainbow" }),
  preset("soft-frames", "Soft frames", "Rounded frames inside rounded frames", tunnel({ opening: "frame", min: 12, max: 100 }), { frame: { shape: "rounded", width: 240, height: 180, corner: 20 }, palette: "lavender" }),
  preset("hive-frames", "Hive frames", "Hexagon rings turning layer by layer", tunnel({ opening: "frame", min: 12, max: 100, twist: 4 }), { frame: "hexagon", palette: "gold" }),
  preset("raindrop", "Raindrop", "Falling drops in a tall frame", tunnel({ opening: "drop", min: 18, max: 118, shiftY: 25 }), { frame: { shape: "rounded", width: 180, height: 240 }, palette: "ocean" }),
  preset("star-spiral", "Star spiral", "Twelve-point stars in a tight spiral", tunnel({ opening: "star", sides: 12, inner: 72, twist: 9, min: 16, max: 120 }), { palette: "candy", layers: 12 }),
  preset("home-door", "Home door", "Arched doorways in a house-shaped frame", tunnel({ opening: "arch", min: 20, max: 110, shiftY: 20 }), { frame: { shape: "house", width: 200, height: 230 }, palette: "kraft" }),
  preset("diamond-gem", "Diamond gem", "Diamonds inside a diamond", tunnel({ opening: "polygon", sides: 4, min: 16, max: 112 }), { frame: { shape: "diamond", width: 220, height: 260 }, palette: "candy", reverse: true }),

  // Mandalas
  preset("lotus-mandala", "Lotus mandala", "Eight teardrop petals around a round heart", mandala({ count: 8, petal: "drop" }), { frame: "circle", palette: "rose" }),
  preset("rosette", "Rosette", "Twelve leaves in a scalloped frame", mandala({ count: 12, petal: "leaf" }), { frame: "scalloped", palette: "lavender" }),
  preset("sun-mandala", "Sun mandala", "Sixteen petals in an octagon", mandala({ count: 16, petal: "drop" }), { frame: "octagon", palette: "sunset" }),
  preset("compass-rose", "Compass rose", "Diamond points around an eight-point star", mandala({ count: 8, petal: "diamond", opening: "star", sides: 8, inner: 50 }), { frame: "circle", palette: "kraft" }),
  preset("snowflake", "Snowflake", "Six leaves around a hexagon, in white card", mandala({ count: 6, petal: "leaf", opening: "polygon", sides: 6 }), { frame: "hexagon", palette: "snow" }),
  preset("daisy-mandala", "Daisy mandala", "Fourteen round petals", mandala({ count: 14, petal: "circle" }), { palette: "mint" }),
  preset("dahlia", "Dahlia", "Twenty slender leaves with a twist", mandala({ count: 20, petal: "leaf", twist: 4 }), { frame: "circle", palette: "autumn" }),
  preset("kaleidoscope", "Kaleidoscope", "Ten diamonds turning in rainbow colours", mandala({ count: 10, petal: "diamond", twist: 9 }), { palette: "rainbow" }),
  preset("star-flower", "Star flower", "Five petals around a five-point star", mandala({ count: 5, petal: "drop", opening: "star", sides: 5, inner: 50 }), { palette: "gold" }),
  preset("ocean-mandala", "Ocean mandala", "Twelve blue petals in a round frame", mandala({ count: 12, petal: "drop" }), { frame: "circle", palette: "ocean" }),
  preset("night-bloom", "Night bloom", "Nine leaves with a light hole behind", mandala({ count: 9, petal: "leaf", moon: true }), { palette: "night" }),
  preset("heart-mandala", "Heart mandala", "Petals around a heart in a heart frame", mandala({ count: 8, petal: "drop", opening: "heart" }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "candy" }),
  preset("lace", "Lace", "Twenty-four little round petals like a doily", mandala({ count: 24, petal: "circle", web: 1.2 }), { frame: "scalloped", palette: "snow" }),
  preset("henna", "Henna", "Sixteen leaves in warm coral", mandala({ count: 16, petal: "leaf" }), { palette: "coral" }),
  preset("mosaic", "Mosaic", "Twelve diamonds in a square frame", mandala({ count: 12, petal: "diamond" }), { frame: "rect", palette: "mint" }),
  preset("royal-crest", "Royal crest", "Ten petals in a shield", mandala({ count: 10, petal: "drop" }), { frame: { shape: "shield", width: 200, height: 230 }, palette: "gold" }),
  preset("forest-mandala", "Forest mandala", "Seven green leaves", mandala({ count: 7, petal: "leaf" }), { palette: "forest" }),
  preset("desert-rose", "Desert rose", "Eleven petals in an octagon", mandala({ count: 11, petal: "drop" }), { frame: "octagon", palette: "desert" }),
  preset("spiral-bloom", "Spiral bloom", "Eight petals that turn a lot on every layer", mandala({ count: 8, petal: "drop", twist: 12 }), { palette: "sunset", layers: 10 }),
  preset("mini-mandala", "Mini mandala", "A small eight-layer mandala, 140 mm across", mandala({ count: 8, petal: "drop" }), { frame: { shape: "circle", width: 140, height: 140, border: 9 }, palette: "lavender", layers: 8, extra: BLADE }),

  // Sunbursts
  preset("sunrise-rays", "Sunrise rays", "Sixteen rays in a round frame", sunburst({ count: 16, inner: 50 }), { frame: "circle", palette: "sunset" }),
  preset("starburst", "Starburst", "Twenty-four gold rays", sunburst({ count: 24, inner: 45 }), { palette: "gold" }),
  preset("swirl-sun", "Swirl sun", "Twelve rays curling clockwise", sunburst({ count: 12, swirl: 60 }), { frame: "circle", palette: "autumn" }),
  preset("pinwheel", "Pinwheel", "Eight curled blades in rainbow colours", sunburst({ count: 8, swirl: 120, inner: 60 }), { palette: "rainbow" }),
  preset("vortex", "Vortex", "Eighteen thin rays curling the other way", sunburst({ count: 18, swirl: -90, inner: 40 }), { palette: "night", layers: 8 }),
  preset("rising-sun", "Rising sun", "Rays fanning up from the bottom of an arch", sunburst({ count: 14, shiftY: 85 }), { frame: { shape: "arch", width: 220, height: 200 }, palette: "coral" }),
  preset("radiant-heart", "Radiant heart", "Twenty rays in a heart frame", sunburst({ count: 20 }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "rose" }),
  preset("tornado", "Tornado", "Six blades in a long, tight spiral", sunburst({ count: 6, swirl: 180, inner: 70 }), { palette: "mono", layers: 12 }),
  preset("sea-anemone", "Sea anemone", "Thirty fine tentacles curling gently", sunburst({ count: 30, swirl: 40, inner: 35 }), { frame: "circle", palette: "ocean" }),
  preset("dandelion", "Dandelion", "Thirty-six fine rays in white card", sunburst({ count: 36, inner: 30 }), { frame: "circle", palette: "snow" }),
  preset("deco-fan", "Art deco fan", "Ten rays fanning from the bottom edge", sunburst({ count: 10, inner: 55, shiftY: 90 }), { frame: { shape: "arch", width: 240, height: 180 }, palette: "gold" }),
  preset("galaxy", "Galaxy", "Five spiral arms around a light hole", sunburst({ count: 5, swirl: 150, inner: 80, moon: true }), { frame: "circle", palette: "lavender" }),
  preset("citrus-slice", "Citrus slice", "Ten wide segments like an orange", sunburst({ count: 10, inner: 75 }), { frame: "circle", palette: "autumn", reverse: true }),
  preset("propeller", "Propeller", "Three wide curled blades", sunburst({ count: 3, swirl: 90, inner: 80 }), { palette: "kraft" }),
  preset("light-speed", "Light speed", "Forty streaks running off to the side", sunburst({ count: 40, inner: 30, shiftX: 35 }), { frame: wide, palette: "night" }),
  preset("sunflower", "Sunflower", "Twenty petals with a slight curl", sunburst({ count: 20, inner: 55, swirl: 20 }), { frame: "scalloped", palette: "gold" }),

  // Landscapes
  preset("mountain-range", "Mountain range", "Night mountains under a moon", land({ ridge: "mountains", count: 3, amp: 26, moon: true }), { frame: wide, palette: "night" }),
  preset("alpine-dawn", "Alpine dawn", "Peaks at sunrise with the sun behind", land({ ridge: "mountains", count: 4, amp: 24, moon: true, seed: 21 }), { frame: wide, palette: "sunset" }),
  preset("rolling-hills", "Rolling hills", "Soft green hills and a sun", land({ ridge: "hills", count: 2, amp: 20, moon: true }), { frame: wide, palette: "forest" }),
  preset("ocean-waves", "Ocean waves", "Rows of breaking waves", land({ ridge: "waves", count: 4, amp: 14 }), { frame: wide, palette: "ocean" }),
  preset("sand-dunes", "Sand dunes", "Leaning dunes under a desert sun", land({ ridge: "dunes", count: 2, amp: 22, moon: true }), { frame: wide, palette: "desert" }),
  preset("zigzag-peaks", "Zigzag peaks", "Rainbow chevrons stacked into the distance", land({ ridge: "zigzag", count: 5, amp: 20 }), { frame: wide, palette: "rainbow" }),
  preset("city-skyline", "City skyline", "Twelve layers of buildings and a moon", land({ ridge: "skyline", count: 8, amp: 40, moon: true }), { frame: wide, palette: "night", layers: 12 }),
  preset("sunset-city", "Sunset city", "Towers against an evening sky", land({ ridge: "skyline", count: 6, amp: 45, seed: 42 }), { frame: wide, palette: "sunset" }),
  preset("canyon", "Canyon", "Rock walls above and below", land({ ridge: "mountains", from: "both", count: 3, amp: 18, min: 30, max: 90 }), { frame: wide, palette: "autumn" }),
  preset("ice-cave", "Ice cave", "Icicles hanging from the roof", land({ ridge: "zigzag", from: "top", count: 6, amp: 30 }), { frame: wide, palette: "snow", reverse: true }),
  preset("cloud-sky", "Cloud sky", "Billowing clouds hanging from the top", land({ ridge: "hills", from: "top", count: 3, amp: 16, moon: true }), { frame: wide, palette: "ocean", reverse: true }),
  preset("stormy-sea", "Stormy sea", "Tall grey waves", land({ ridge: "waves", count: 6, amp: 22, seed: 5 }), { frame: wide, palette: "mono" }),
  preset("lavender-fields", "Lavender fields", "Gentle purple rows", land({ ridge: "hills", count: 3, amp: 10, seed: 11 }), { frame: wide, palette: "lavender" }),
  preset("arctic-peaks", "Arctic peaks", "Sharp white peaks under a moon", land({ ridge: "mountains", count: 5, amp: 30, moon: true, seed: 3 }), { frame: wide, palette: "snow" }),
  preset("mountain-moon", "Mountain moon", "Mountains in a round frame", land({ ridge: "mountains", count: 3, amp: 24, moon: true, seed: 9 }), { frame: "circle", palette: "night" }),
  preset("arch-hills", "Window to the hills", "Rolling hills through an arched window", land({ ridge: "hills", count: 2, amp: 18, moon: true, seed: 14 }), { frame: { shape: "arch", width: 180, height: 240 }, palette: "forest" }),
  preset("heart-waves", "Heart of the sea", "Waves in a heart frame", land({ ridge: "waves", count: 3, amp: 14, seed: 8 }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "rose" }),
  preset("coral-reef", "Coral reef", "Waves above and below, like looking through water", land({ ridge: "waves", from: "both", count: 4, amp: 12, min: 30, max: 92 }), { frame: wide, palette: "ocean" }),
  preset("desert-canyon", "Desert canyon", "Dunes rising and overhanging", land({ ridge: "dunes", from: "both", count: 2, amp: 16, min: 30, max: 92, seed: 17 }), { frame: wide, palette: "desert" }),
  preset("pine-ridge", "Pine ridge", "Rows of pointed trees", land({ ridge: "zigzag", count: 9, amp: 26 }), { frame: wide, palette: "forest", layers: 12 }),
  preset("lone-peak", "Lone peak", "One tall mountain with ranges behind", land({ ridge: "mountains", count: 1, amp: 50, seed: 33 }), { frame: wide, palette: "coral" }),
  preset("hex-mountains", "Hexagon mountains", "Peaks in a hexagon frame", land({ ridge: "mountains", count: 3, amp: 26, seed: 27, moon: true }), { frame: "hexagon", palette: "mint" }),
  preset("candy-town", "Candy town", "A colourful skyline in an arch", land({ ridge: "skyline", count: 5, amp: 40, seed: 64 }), { frame: { shape: "arch", width: 180, height: 240 }, palette: "candy" }),
  preset("autumn-hills", "Autumn hills", "Warm hills under a low sun", land({ ridge: "hills", count: 3, amp: 18, moon: true, seed: 23 }), { frame: wide, palette: "autumn" }),
  preset("sea-cave", "Sea cave", "Rock overhead and waves below", land({ ridge: "waves", from: "both", count: 3, amp: 16, min: 30, max: 92, moon: true, seed: 12 }), { frame: { shape: "rounded", width: 240, height: 180, corner: 16 }, palette: "night" }),

  // Lattices
  preset("honeycomb", "Honeycomb", "Hexagon cells that open toward the middle", lattice({ cell: "hex", pitch: 28, fade: 40 }), { palette: "gold" }),
  preset("polka-tunnel", "Polka dot tunnel", "Dots growing toward the centre", lattice({ cell: "circle", pitch: 32, fade: 60 }), { palette: "candy" }),
  preset("checker-spin", "Checker spin", "Square holes turning layer by layer", lattice({ cell: "square", pitch: 28, fade: 30, twist: 5 }), { frame: "rect", palette: "mono" }),
  preset("diamond-grid", "Diamond grid", "Interlocking diamonds", lattice({ cell: "diamond", pitch: 28, fade: 40 }), { palette: "lavender" }),
  preset("triangles", "Triangles", "A rainbow triangle grid", lattice({ cell: "triangle", pitch: 30, fade: 40 }), { palette: "rainbow" }),
  preset("bubbles", "Bubbles", "Fine dots that open up in the middle", lattice({ cell: "circle", pitch: 30, fade: 100 }), { frame: "circle", palette: "ocean" }),
  preset("hex-vortex", "Hexagon vortex", "Honeycomb turning on every layer", lattice({ cell: "hex", pitch: 25, fade: 40, twist: 4 }), { palette: "night", layers: 8 }),
  preset("fish-scales", "Fish scales", "Diamonds that grow toward the edge", lattice({ cell: "diamond", pitch: 28, fade: -40 }), { palette: "mint" }),
  preset("op-art", "Op art", "Squares that swell in the middle", lattice({ cell: "square", pitch: 28, fade: 80 }), { frame: "rect", palette: "mono", reverse: true }),
  preset("hive-round", "Round hive", "Honeycomb in a round frame", lattice({ cell: "hex", pitch: 28, fade: 30 }), { frame: "circle", palette: "autumn" }),
  preset("starry-night", "Starry night", "Small dots at the edge, a moon behind", lattice({ cell: "circle", pitch: 30, fade: -50, moon: true }), { frame: wide, palette: "night" }),
  preset("tri-twist", "Triangle twist", "Triangles turning layer by layer", lattice({ cell: "triangle", pitch: 28, fade: 30, twist: 6 }), { palette: "coral" }),
  preset("dotted-heart", "Dotted heart", "Dots in a heart frame", lattice({ cell: "circle", pitch: 30, fade: 50 }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "rose" }),
  preset("diamond-mosaic", "Diamond mosaic", "Large diamonds turning in green", lattice({ cell: "diamond", pitch: 32, fade: 30, twist: 8 }), { palette: "forest" }),
];
