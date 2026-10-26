import { MATERIALS } from "@/lib/hinge/defaults";
import type { DeepPartial, GenPreset } from "../types";
import type { FrameShape, PaletteId, Sample, ShadowBoxParams } from "./params";

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
const flow = (g: G): G => ({ pattern: "flow", min: 25, max: 85, count: 7, waves: 3, amp: 30, swirl: 90, twist: 0, ...g });
type Pic = DeepPartial<ShadowBoxParams["picture"]>;
/** A picture-pattern design from a built-in sample shape. */
const pic = (id: string, name: string, note: string, sample: Sample, pc: Pic, o: Opts & { design?: G } = {}) =>
  preset(id, name, note, { pattern: "picture", min: 20, max: 100, twist: 0, ...o.design }, { ...o, extra: { ...o.extra, picture: { sample, ...pc } } });
const wide: Frame = { shape: "rect", width: 240, height: 180, corner: 0 };
const BLADE: P = { cutter: { kind: "blade" }, material: "custom", T: 0.5, K: 0, bedW: 292, bedH: 292, gap: 3 };
/** Laser-cut plywood (thickness and kerf from the material table), spacer frames between the layers. */
const PLY: P = { cutter: { kind: "laser" }, material: "birch3", T: MATERIALS.birch3.T!, K: MATERIALS.birch3.K!, bedW: 600, bedH: 400, gap: 4 };

export const SHADOWBOX_PRESETS: GenPreset<ShadowBoxParams>[] = [
  {"id": "studio-lagoon-relief", "name": "Lagoon relief", "note": "Four seeded organic basins in twelve sage contour layers.", "params": {"name": "Lagoon relief", "cutter": {"kind": "laser"}, "material": "birch3", "T": 3, "K": 0.15, "bedW": 600, "bedH": 400, "gap": 4, "design": {"pattern": "topographic", "basins": 4, "min": 12, "max": 116, "amp": 35, "waves": 2, "seed": 318, "twist": 0, "web": 2.2}, "stack": {"count": 12, "spacer": "frames"}, "box": {"numbers": true}, "frame": {"shape": "circle", "width": 260, "height": 260, "border": 18}, "look": {"palette": "sage", "reverse": false}}},
  {"id": "studio-silk-portal", "name": "Silk portal", "note": "Eight flowing ribbons in a rounded 240 x 280 mm portal.", "params": {"name": "Silk portal", "cutter": {"kind": "laser"}, "material": "birch3", "T": 3, "K": 0.15, "bedW": 600, "bedH": 400, "gap": 4, "design": {"pattern": "flow", "min": 25, "max": 85, "count": 8, "waves": 2, "amp": 44, "swirl": 150, "twist": 0, "rotate": 25, "web": 2.2}, "stack": {"count": 12, "spacer": "frames"}, "box": {"numbers": true}, "frame": {"shape": "rounded", "width": 240, "height": 280, "border": 18, "corner": 22}, "look": {"palette": "lavender", "reverse": false}}},
  {"id": "studio-quiet-arch", "name": "Quiet arch lightbox", "note": "Twelve arch layers with a light cavity and removable back.", "params": {"name": "Quiet arch lightbox", "cutter": {"kind": "laser"}, "material": "birch3", "T": 3, "K": 0.15, "bedW": 600, "bedH": 400, "gap": 4, "design": {"pattern": "tunnel", "twist": 0, "opening": "arch", "min": 22, "max": 96, "shiftY": 30, "web": 2.2}, "stack": {"count": 12, "spacer": "frames", "back": false}, "light": {"on": true, "depth": 12}, "box": {"back": "screwed", "walls": true, "hang": "keyhole", "pins": true, "numbers": true}, "frame": {"shape": "rect", "width": 240, "height": 300, "corner": 0, "border": 20}, "look": {"palette": "desert", "reverse": false}}},
  // Contemporary wood collection: editable geometry, numbered layers and stock-thickness spacers.
  preset("delta-contours", "Delta contours", "Fourteen organic contour layers merging three basins", { pattern: "topographic", basins: 3, min: 14, max: 120, amp: 55, waves: 3, seed: 17, twist: 0 }, { frame: { shape: "circle", width: 260, height: 260, border: 18 }, palette: "ocean", layers: 14, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("archipelago-relief", "Archipelago relief", "Five merging islands with broad, flowing contour ledges", { pattern: "topographic", basins: 5, min: 12, max: 112, amp: 60, waves: 2, seed: 81, twist: 0 }, { frame: { shape: "rounded", width: 280, height: 220, border: 18, corner: 24 }, palette: "sage", layers: 12, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("obsidian-caldera", "Obsidian caldera", "Dark sculptural contours with a gentle inter-layer rotation", { pattern: "topographic", basins: 3, min: 10, max: 118, amp: 35, waves: 4, seed: 213, twist: 3 }, { frame: { shape: "squircle", width: 240, height: 240, border: 18 }, palette: "mono", layers: 14, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("tidal-atlas", "Tidal atlas", "Four asymmetric basins receding toward an offset vanishing point", { pattern: "topographic", basins: 4, min: 12, max: 118, amp: 65, waves: 3, seed: 46, twist: 1, shiftX: 20, shiftY: -15 }, { frame: { shape: "rounded", width: 280, height: 200, border: 18 }, palette: "mint", layers: 14, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("aurora-ribbons", "Aurora ribbons", "Fourteen layers of broad ribbons drifting across a tall arch", flow({ count: 6, waves: 2, amp: 44, swirl: 150, rotate: 18 }), { frame: { shape: "arch", width: 220, height: 280, border: 18 }, palette: "lavender", layers: 14, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("desert-passage", "Desert passage", "Opposing dune profiles open into a panoramic canyon", land({ ridge: "dunes", from: "both", count: 3, amp: 22, seed: 62 }), { frame: { shape: "rounded", width: 280, height: 190, border: 18 }, palette: "desert", layers: 12, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("kinetic-iris", "Kinetic iris", "Twenty-four curved rays in a deep circular relief", sunburst({ count: 24, swirl: 130, min: 20, max: 95 }), { frame: { shape: "circle", width: 240, height: 240, border: 18 }, palette: "gold", layers: 12, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("orbital-lens", "Orbital lens", "Crossed ellipses rotate through fourteen softly squared layers", tunnel({ opening: "orbit", sides: 3, min: 18, max: 110, twist: 5 }), { frame: { shape: "squircle", width: 240, height: 240, border: 18 }, palette: "coral", layers: 14, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("moire-ellipse", "Moire ellipse", "Rotated oval lattices form a layered optical screen", lattice({ cell: "oval", pitch: 34, rotate: 32, fade: 40, min: 40, max: 90 }), { frame: { shape: "rounded", width: 260, height: 220, border: 18 }, palette: "mono", layers: 10, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
  preset("cathedral-light", "Cathedral light", "Receding arches in a serviceable LED enclosure with registration pins", tunnel({ opening: "arch", min: 30, max: 110, shiftY: 30 }), { frame: { shape: "rect", width: 220, height: 280, corner: 0, border: 18 }, palette: "kraft", layers: 10, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames", back: false }, light: { on: true, depth: 12 }, box: { back: "screwed", walls: true, hang: "keyhole", pins: true, numbers: true } } }),
  preset("urban-nocturne", "Urban nocturne", "Ten skyline layers with a removable LED back and numbered assembly", land({ ridge: "skyline", count: 8, amp: 32, seed: 97 }), { frame: { shape: "rect", width: 280, height: 220, corner: 0, border: 18 }, palette: "night", layers: 10, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames", back: false }, light: { on: true, depth: 12 }, box: { back: "screwed", walls: true, hang: "keyhole", pins: true, numbers: true } } }),
  pic("botanical-relief", "Botanical relief", "A bridged leaf silhouette floats within twelve organic halos", "leaf", { mode: "grow", paper: true, size: 46, step: 5 }, { frame: { shape: "arch", width: 200, height: 260, border: 18 }, palette: "forest", layers: 12, design: { loose: "bridge", bridge: 2.5 }, extra: { ...PLY, design: { web: 2.2 }, stack: { spacer: "frames" }, box: { numbers: true } } }),
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
  preset("heart-frame", "Heart in a square", "Candy-coloured hearts in a square frame, with Love on the front", tunnel({ opening: "heart", min: 18, max: 118 }), { frame: "rect", palette: "candy", extra: { text: { text: "Love", fontId: "lobster", size: 26 } } }),
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
  preset("home-door", "Home door", "Arched doorways in a house-shaped frame", tunnel({ opening: "arch", min: 20, max: 110, shiftY: 20 }), { frame: { shape: "house", width: 200, height: 230 }, palette: "kraft", extra: { text: { text: "Home", fontId: "pacifico", size: 24 } } }),
  preset("diamond-gem", "Diamond gem", "Diamonds inside a diamond", tunnel({ opening: "polygon", sides: 4, min: 16, max: 112 }), { frame: { shape: "diamond", width: 220, height: 260 }, palette: "candy", reverse: true }),

  // Mandalas
  preset("lotus-mandala", "Lotus mandala", "Eight teardrop petals around a round heart", mandala({ count: 8, petal: "drop" }), { frame: "circle", palette: "rose" }),
  preset("rosette", "Rosette", "Twelve leaves in a scalloped frame", mandala({ count: 12, petal: "leaf" }), { frame: "scalloped", palette: "lavender" }),
  preset("sun-mandala", "Sun mandala", "Sixteen petals in an octagon", mandala({ count: 16, petal: "drop" }), { frame: "octagon", palette: "sunset" }),
  preset("compass-rose", "Compass rose", "Diamond points around an eight-point star", mandala({ count: 8, petal: "diamond", opening: "star", sides: 8, inner: 50 }), { frame: "circle", palette: "kraft" }),
  preset("snowflake", "Snowflake", "Six leaves around a hexagon, in white card", mandala({ count: 6, petal: "leaf", opening: "polygon", sides: 6, moon: true, hole: "snowflake", holeSize: 24 }), { frame: "hexagon", palette: "snow" }),
  preset("daisy-mandala", "Daisy mandala", "Fourteen round petals", mandala({ count: 14, petal: "circle" }), { palette: "mint" }),
  preset("dahlia", "Dahlia", "Twenty slender leaves with a twist", mandala({ count: 20, petal: "leaf", twist: 4 }), { frame: "circle", palette: "autumn" }),
  preset("kaleidoscope", "Kaleidoscope", "Ten diamonds turning in rainbow colours", mandala({ count: 10, petal: "diamond", twist: 9 }), { palette: "rainbow" }),
  preset("star-flower", "Star flower", "Five petals around a five-point star", mandala({ count: 5, petal: "drop", opening: "star", sides: 5, inner: 50 }), { palette: "gold" }),
  preset("ocean-mandala", "Ocean mandala", "Twelve blue petals in a round frame", mandala({ count: 12, petal: "drop" }), { frame: "circle", palette: "ocean" }),
  preset("night-bloom", "Night bloom", "Nine leaves around a star of light", mandala({ count: 9, petal: "leaf", moon: true, hole: "star", holeSize: 16 }), { palette: "night" }),
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
  preset("rolling-hills", "Rolling hills", "Soft green hills and a sun", land({ ridge: "hills", count: 2, amp: 20, moon: true, hole: "sun", holeSize: 22 }), { frame: wide, palette: "forest" }),
  preset("ocean-waves", "Ocean waves", "Rows of breaking waves", land({ ridge: "waves", count: 4, amp: 14 }), { frame: wide, palette: "ocean" }),
  preset("sand-dunes", "Sand dunes", "Leaning dunes under a desert sun", land({ ridge: "dunes", count: 2, amp: 22, moon: true }), { frame: wide, palette: "desert" }),
  preset("zigzag-peaks", "Zigzag peaks", "Rainbow chevrons stacked into the distance", land({ ridge: "zigzag", count: 5, amp: 20 }), { frame: wide, palette: "rainbow" }),
  preset("city-skyline", "City skyline", "Twelve layers of buildings and a moon", land({ ridge: "skyline", count: 8, amp: 40, moon: true }), { frame: wide, palette: "night", layers: 12 }),
  preset("sunset-city", "Sunset city", "Towers against an evening sky", land({ ridge: "skyline", count: 6, amp: 45, seed: 42 }), { frame: wide, palette: "sunset" }),
  preset("canyon", "Canyon", "Rock walls above and below", land({ ridge: "mountains", from: "both", count: 3, amp: 18, min: 30, max: 90 }), { frame: wide, palette: "autumn" }),
  preset("ice-cave", "Ice cave", "Icicles hanging from the roof", land({ ridge: "zigzag", from: "top", count: 6, amp: 30 }), { frame: wide, palette: "snow", reverse: true }),
  preset("cloud-sky", "Sweet dreams", "Puffy clouds and a crescent moon, with Sweet dreams on the front", land({ ridge: "clouds", count: 3, amp: 18, moon: true, hole: "moonstar", holeSize: 22 }), { frame: wide, palette: "ocean", extra: { text: { text: "Sweet dreams", fontId: "lobster", size: 22 } } }),
  preset("stormy-sea", "Stormy sea", "Tall grey waves", land({ ridge: "waves", count: 6, amp: 22, seed: 5 }), { frame: wide, palette: "mono" }),
  preset("lavender-fields", "Lavender fields", "Gentle purple rows", land({ ridge: "hills", count: 3, amp: 10, seed: 11 }), { frame: wide, palette: "lavender" }),
  preset("arctic-peaks", "Arctic peaks", "Sharp white peaks under a moon", land({ ridge: "mountains", count: 5, amp: 30, moon: true, seed: 3 }), { frame: wide, palette: "snow" }),
  preset("mountain-moon", "Mountain moon", "Mountains under a crescent moon in a round frame", land({ ridge: "mountains", count: 3, amp: 24, moon: true, hole: "moon", holeSize: 20, seed: 9 }), { frame: "circle", palette: "night" }),
  preset("arch-hills", "Window to the hills", "Rolling hills through an arched window", land({ ridge: "hills", count: 2, amp: 18, moon: true, seed: 14 }), { frame: { shape: "arch", width: 180, height: 240 }, palette: "forest" }),
  preset("heart-waves", "Heart of the sea", "Waves in a heart frame", land({ ridge: "waves", count: 3, amp: 14, seed: 8 }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "rose" }),
  preset("coral-reef", "Coral reef", "Waves above and below, like looking through water", land({ ridge: "waves", from: "both", count: 4, amp: 12, min: 30, max: 92 }), { frame: wide, palette: "ocean" }),
  preset("desert-canyon", "Desert canyon", "Dunes rising and overhanging", land({ ridge: "dunes", from: "both", count: 2, amp: 16, min: 30, max: 92, seed: 17 }), { frame: wide, palette: "desert" }),
  preset("pine-ridge", "Pine forest", "Rows of pine trees under a crescent moon", land({ ridge: "trees", count: 5, amp: 30, moon: true, hole: "moon", holeSize: 18 }), { frame: wide, palette: "forest", layers: 10 }),
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
  preset("starry-night", "Starry night", "Small dots at the edge, a moon behind", lattice({ cell: "circle", pitch: 30, fade: -50, moon: true, hole: "moonstar", holeSize: 26 }), { frame: wide, palette: "night" }),
  preset("tri-twist", "Triangle twist", "Triangles turning layer by layer", lattice({ cell: "triangle", pitch: 28, fade: 30, twist: 6 }), { palette: "coral" }),
  preset("dotted-heart", "Dotted heart", "Dots in a heart frame", lattice({ cell: "circle", pitch: 30, fade: 50 }), { frame: { shape: "heart", width: 210, height: 190 }, palette: "rose" }),
  preset("diamond-mosaic", "Diamond mosaic", "Large diamonds turning in green", lattice({ cell: "diamond", pitch: 32, fade: 30, twist: 8 }), { palette: "forest" }),
  // Soft curves: ovals, squircles, sine waves and flowing stripes
  preset("oval-portal", "Oval portal", "Nested ovals in a tall oval frame", tunnel({ opening: "oval", min: 18, max: 112 }), { frame: { shape: "circle", width: 170, height: 230 }, palette: "pastel" }),
  preset("squircle-steps", "Squircle steps", "Soft-cornered squares stepping back", tunnel({ opening: "squircle", min: 16, max: 108 }), { frame: "squircle", palette: "sage" }),
  preset("ripple", "Ripple", "Wavy rings spreading like a drop in water", tunnel({ opening: "wavy", sides: 10, inner: 86, twist: 3, min: 16, max: 120 }), { frame: "circle", palette: "ocean" }),
  preset("sine-bloom", "Sine bloom", "A five-wave flower turning in a blossom frame", tunnel({ opening: "wavy", sides: 5, inner: 62, twist: 7, min: 18, max: 118 }), { frame: "blossom", palette: "candy" }),
  preset("orbit-rosette", "Orbit rosette", "Three crossed ellipses, like an atom", tunnel({ opening: "orbit", sides: 3, inner: 34, min: 20, max: 115 }), { frame: "circle", palette: "lavender" }),
  preset("orbit-spin", "Orbit spin", "Four ellipses spinning into the distance", tunnel({ opening: "orbit", sides: 4, inner: 30, twist: 9, min: 18, max: 120 }), { palette: "night", layers: 10 }),
  preset("soft-mandala", "Soft mandala", "Round petals around a wavy middle", mandala({ opening: "wavy", sides: 8, inner: 80, petal: "circle", count: 12 }), { frame: "blossom", palette: "rose" }),
  preset("egg-nest", "Egg nest", "Ovals sinking toward the bottom", tunnel({ opening: "oval", min: 16, max: 110, shiftY: 35 }), { frame: { shape: "pill", width: 170, height: 230 }, palette: "kraft" }),
  preset("capsule-tunnel", "Capsule tunnel", "Rings of a capsule frame", tunnel({ opening: "frame", min: 20, max: 100 }), { frame: { shape: "pill", width: 240, height: 150 }, palette: "mint" }),
  preset("blossom-rings", "Blossom rings", "Wavy-edged rings in a blossom frame", tunnel({ opening: "frame", min: 22, max: 100 }), { frame: "blossom", palette: "coral" }),
  preset("gentle-flow", "Gentle flow", "Slow wavy stripes rippling in depth", flow({ count: 7, waves: 2, amp: 30 }), { frame: wide, palette: "ocean" }),
  preset("silk-ribbons", "Silk ribbons", "Five broad ribbons swinging high", flow({ count: 5, waves: 3, amp: 45, swirl: 180 }), { frame: "squircle", palette: "rose" }),
  preset("ripple-stripes", "Ripple stripes", "Ten fine wavy stripes in pastels", flow({ count: 10, waves: 4, amp: 24 }), { frame: "rounded", palette: "pastel" }),
  preset("diagonal-flow", "Diagonal flow", "Wavy stripes on the slant", flow({ count: 8, waves: 2, amp: 32, rotate: 30 }), { frame: "rect", palette: "sage" }),
  preset("sea-swell", "Sea swell", "Smooth sine swells under a sun", land({ ridge: "sine", count: 2, amp: 26, moon: true, hole: "sun", holeSize: 18 }), { frame: wide, palette: "ocean" }),
  preset("calm-water", "Calm water", "Low ripples with Breathe on the front", land({ ridge: "sine", count: 4, amp: 12 }), { frame: "squircle", palette: "pastel", extra: { text: { text: "Breathe", fontId: "great-vibes", size: 30 } } }),
  preset("sine-canyon", "Sine canyon", "Smooth waves above and below", land({ ridge: "sine", from: "both", count: 2, amp: 20 }), { frame: wide, palette: "autumn" }),
  preset("pebbles", "Pebbles", "Ovals that grow toward the middle", lattice({ cell: "oval", pitch: 34, fade: 60 }), { frame: "squircle", palette: "desert" }),
  preset("oval-weave", "Oval weave", "Turned ovals in mint", lattice({ cell: "oval", pitch: 30, fade: 30, rotate: 45 }), { frame: "circle", palette: "mint" }),
  preset("hello-baby", "Hello baby", "Soft squircles, a moon and star, and a name", tunnel({ opening: "squircle", min: 18, max: 108, moon: true, hole: "moonstar", holeSize: 20 }), { frame: "squircle", palette: "pastel", extra: { text: { text: "Hello baby", fontId: "pacifico", size: 22 } } }),
  // Your picture: sample shapes in rings, tunnels and paper cameos (add your own picture or SVG to replace them)
  pic("cat-rings", "Cat rings", "A sitting cat in soft contour rings", "cat", { mode: "grow", size: 42, step: 6 }, { palette: "lavender" }),
  pic("goldfish-pond", "Goldfish pond", "A fish deep in rippling water", "fish", { mode: "grow", size: 36, step: 7 }, { frame: { shape: "rounded", width: 175, height: 251 }, palette: "ocean", layers: 8, design: { loose: "bridge" } }),
  pic("pear-contours", "Pear contours", "A pear in warm stepped rings", "pear", { mode: "grow", size: 40, step: 6 }, { palette: "autumn" }),
  pic("bird-tunnel", "Bird tunnel", "Birds nested into the distance", "bird", { mode: "scale" }, { design: { min: 22, max: 82, loose: "bridge" }, palette: "sunset", layers: 9 }),
  pic("butterfly-cameo", "Butterfly cameo", "A paper butterfly floating in halos", "butterfly", { mode: "grow", paper: true, size: 48, step: 7 }, { palette: "rose", design: { loose: "parts" } }),
  pic("heart-rings", "Heart rings", "A heart in widening rings", "heart", { mode: "grow", size: 34, step: 7 }, { frame: "circle", palette: "candy" }),
  pic("tree-tunnel", "Tree tunnel", "Pine trees nested in green", "tree", { mode: "scale" }, { design: { min: 20, max: 96 }, palette: "forest", layers: 8 }),
  pic("leaf-rings", "Leaf rings", "A leaf in sage contour rings", "leaf", { mode: "grow", size: 40, step: 6 }, { frame: "squircle", palette: "sage", design: { loose: "bridge" } }),
  pic("paw-steps", "Paw steps", "Paw pads that join as they grow", "paw", { mode: "grow", size: 40, step: 5 }, { palette: "kraft", design: { loose: "bridge" } }),
  pic("home-cameo", "Home cameo", "A paper house with its own halos", "house", { mode: "grow", paper: true, size: 44, step: 8 }, { frame: "house", palette: "coral", design: { loose: "parts" } }),
  pic("moon-rings", "Moon rings", "A crescent and star in night rings", "moonstar", { mode: "grow", size: 40, step: 6 }, { frame: "circle", palette: "night" }),
  pic("flower-cameo", "Flower cameo", "A paper flower on pastel halos", "flower", { mode: "grow", paper: true, size: 46, step: 7 }, { frame: "blossom", palette: "pastel", design: { loose: "parts" } }),
  // Boxes: plywood with a light box, a back, a way to hang or stand it and a finger-jointed box
  preset("lit-forest-box", "Lit forest box", "Plywood forest layers in a finger-jointed box, lit from behind", land({ ridge: "trees", count: 3, amp: 30 }), {
    frame: { shape: "rect", width: 240, height: 180, corner: 0, border: 16 }, palette: "forest", layers: 6,
    extra: { ...PLY, stack: { back: false, spacer: "frames", per: 1 }, light: { on: true, depth: 12, cable: 6, diffuser: true, diffT: 3 }, box: { back: "screwed", hang: "keyhole", walls: true, lip: 3, pins: true, numbers: true } },
  }),
  preset("mandala-stand", "Mandala on feet", "A plywood mandala with a back board, standing in two feet", mandala({ count: 10, petal: "drop", min: 26, max: 104 }), {
    frame: { shape: "squircle", border: 14 }, palette: "kraft", layers: 6,
    extra: { ...PLY, stack: { spacer: "frames", per: 1 }, box: { back: "glued", hang: "stand", pins: true } },
  }),
];
