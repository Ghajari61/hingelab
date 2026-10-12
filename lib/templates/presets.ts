/**
 * Settings of the templates made with HingeLab's own generators and the living-hinge box editor.
 * Data only: the build script turns them into cut files and thumbnails, and the classic editors
 * open them from `?p=<product>&template=<id>` ("Customise in generator").
 */
import type { TemplateProduct } from "./types";

export interface TemplatePreset {
  product: TemplateProduct;
  name: string;
  note: string;
  params: Record<string, unknown>;
}

export const TEMPLATE_PRESETS: Record<string, TemplatePreset> = {
  // living-hinge boxes
  "hinge-pen-case": { product: "hinge", name: "Rounded pen case", note: "Long pill-shaped case with a lift-off lid", params: { name: "Rounded pen case", shape: "pill", W: 190, D: 46, H: 36, R: 23 } },
  "hinge-sweet-jar": { product: "hinge", name: "Sweet jar", note: "Round jar with a wave hinge and a lid", params: { name: "Sweet jar", shape: "cyl", dia: 100, H: 120, pattern: "wave" } },
  "hinge-hex-gift": { product: "hinge", name: "Hexagon gift box", note: "Six-sided box with a serpentine hinge", params: { name: "Hexagon gift box", shape: "poly", sides: 6, W: 150, H: 80, pattern: "serpentine" } },
  "hinge-desk-tub": { product: "hinge", name: "Desk tidy tub", note: "Open rounded square tub", params: { name: "Desk tidy tub", W: 110, D: 110, H: 90, R: 40, lid: "open", pattern: "relief" } },
  "hinge-ring-box": { product: "hinge", name: "Ring box", note: "Tiny rounded box with a fine hinge", params: { name: "Ring box", W: 60, D: 60, H: 40, R: 20, slit: 20, bridge: 2.5, pitch: 2 } },
  "hinge-cookie-tin": { product: "hinge", name: "Octagon cookie tin", note: "Eight sides, wave hinge, lift-off lid", params: { name: "Octagon cookie tin", shape: "poly", sides: 8, W: 180, H: 70, pattern: "wave" } },
  "hinge-cutlery-caddy": { product: "hinge", name: "Cutlery caddy", note: "Tall open pill for the table", params: { name: "Cutlery caddy", shape: "pill", W: 200, D: 90, H: 110, R: 45, lid: "open" } },

  // boxes generator
  "box-recipe": {
    product: "boxes", name: "Recipe card box", note: "Holds 5 × 3 inch cards, pin-hinged lid",
    params: { name: "Recipe card box", design: "box", joint: { finger: 8 }, box: { width: 140, depth: 95, height: 90, lid: "pin", clearance: 0.4, notch: true, pin: 3 }, engrave: { text: "Recipes", fontId: "pacifico", size: 18, motif: "leaf", motifSize: 26, border: 5 } },
  },
  "box-craft-caddy": {
    product: "boxes", name: "Craft caddy", note: "Three long bays for brushes, pens and tools",
    params: { name: "Craft caddy", design: "tray", tray: { width: 300, depth: 140, height: 70, cols: 3, rows: 1, dividers: 100 } },
  },
  "box-wren-house": {
    product: "boxes", name: "Wren house", note: "Small nest box with a 28 mm entrance",
    params: { name: "Wren house", design: "bird", bird: { width: 100, depth: 100, height: 140, pitch: 35, hole: 28, perch: false, overhang: 15 } },
  },
  "box-dream-bank": {
    product: "boxes", name: "Dream big money box", note: "Cube bank with a coin slot and stars",
    params: { name: "Dream big money box", design: "money", money: { width: 100, depth: 100, height: 100, slot: 36, plug: 40 }, engrave: { text: "Dream big", fontId: "fredoka", size: 14, motif: "stars", motifSize: 26, border: 0 } },
  },
  "box-three-drawers": {
    product: "boxes", name: "Three-drawer cabinet", note: "Desk cabinet with three drawers and knobs",
    params: { name: "Three-drawer cabinet", design: "drawer", drawer: { width: 180, depth: 140, height: 150, drawers: 3, pull: "knob", clearance: 0.5 } },
  },
  "box-hex-candy": {
    product: "boxes", name: "Hexagon treat box", note: "Hexagon box with a cupcake on the lid",
    params: { name: "Hexagon treat box", design: "hex", hex: { width: 120, height: 70, lid: "liftoff", clearance: 0.3 }, engrave: { text: "", motif: "cupcake", motifSize: 44, border: 4 } },
  },
  "box-domino": {
    product: "boxes", name: "Domino box", note: "Slim box with a sliding lid",
    params: { name: "Domino box", design: "box", joint: { finger: 8 }, box: { width: 180, depth: 60, height: 45, lid: "sliding", clearance: 0.3, notch: true }, engrave: { text: "DOMINOES", fontId: "archivo-black", size: 12, motif: "none", border: 4 } },
  },
  "box-frame-13x18": {
    product: "boxes", name: "Photo frame 13 × 18", note: "Three layers on a stand with rounded corners",
    params: { name: "Photo frame 13 × 18", design: "frame", frame: { photoW: 130, photoH: 180, border: 22, overlap: 4, corner: 12, mount: "stand" } },
  },
  "box-craft-stack": {
    product: "boxes", name: "Bead stacking trays", note: "Three shallow trays and a lid",
    params: { name: "Bead stacking trays", design: "stack", stack: { width: 200, depth: 140, height: 45, trays: 3, lid: true, clearance: 0.4 } },
  },

  // other generators
  "clock-scallop": {
    product: "clock", name: "Scalloped kitchen clock", note: "Scalloped face, dots and leaf hands",
    params: { name: "Scalloped kitchen clock", face: { shape: "scallop", size: 280, rays: 12, depth: 14, layers: "single" }, markers: { style: "dots", dot: 9, inset: 12, minutes: false }, hands: { style: "leaf", hour: 70, minute: 98, width: 12, tail: 16 } },
  },
  "clock-flower": {
    product: "clock", name: "Flower clock", note: "Petal face with Arabic numerals for a kids' room",
    params: { name: "Flower clock", face: { shape: "flower", size: 300, rays: 10, depth: 30, layers: "single" }, markers: { style: "numerals", numerals: "arabic", fontId: "fredoka", size: 22, inset: 10 }, hands: { style: "classic", hour: 70, minute: 100, width: 12, tail: 16 } },
  },
  "puzzle-hex-19": {
    product: "puzzle", name: "Hexagon puzzle", note: "19 classic pieces in a 240 mm hexagon",
    params: { name: "Hexagon puzzle", shape: { kind: "hexagon", width: 240, height: 208 }, pieces: { auto: true, count: 19 }, tabs: { style: "classic", size: 20, seed: 5 } },
  },
  "puzzle-cloud-kids": {
    product: "puzzle", name: "Cloud puzzle", note: "9 chunky pieces in a cloud tray",
    params: { name: "Cloud puzzle", shape: { kind: "cloud", width: 220, height: 150 }, pieces: { auto: true, count: 9 }, tabs: { style: "kids", size: 24 }, frame: { kind: "tray", border: 15, corner: 14 } },
  },
  "keyrack-leash": {
    product: "keyrack", name: "Dog leash hooks", note: "Paw prints and three round hooks",
    params: { name: "Dog leash hooks", board: { shape: "rounded", width: 260, height: 120, corner: 10 }, text: { text: "Walkies", fontId: "pacifico", size: 26, y: 40 }, motif: { kind: "paw", side: "both", size: 22, gap: 6 }, hooks: { count: 3, profile: "round", y: 82, margin: 50 }, mount: { kind: "keyhole", y: 30 } },
  },
  "sign-garden": {
    product: "sign", name: "Garden sign", note: "Bold capitals and a flower in an engraved frame",
    params: { name: "Garden sign", board: { shape: "rounded", auto: true, pad: 18, corner: 10 }, text: { text: "GARDEN", fontId: "bebas-neue", size: 44, spacing: 3 }, motif: { kind: "flower", side: "left", size: 36, gap: 8 }, border: { kind: "engrave", inset: 6, width: 2.5 }, mount: { kind: "hanging", hole: 5 } },
  },
  "tablenum-rustic": {
    product: "tablenum", name: "Rustic table numbers", note: "Tables 1–6 on rounded plates with scored borders",
    params: { name: "Rustic table numbers", batch: { from: 1, to: 6 }, plate: { shape: "rounded", pad: 12, corner: 10 }, text: { label: "Table", labelFont: "pacifico", fontId: "archivo-black", size: 48 }, border: { kind: "score", inset: 5 }, base: { layers: 1, depth: 45 } },
  },
  "topper-congrats": {
    product: "topper", name: "Congrats topper", note: "Script letters under a burst of stars",
    params: { name: "Congrats topper", text: { text: "Congrats!", fontId: "pacifico", size: 30 }, motif: { kind: "stars", place: "above", size: 44, gap: -4 } },
  },
  "topper-anniversary": {
    product: "topper", name: "Anniversary topper", note: "Two hearts above Happy Anniversary",
    params: { name: "Anniversary topper", text: { text: "Happy\nAnniversary", fontId: "pacifico", size: 24 }, motif: { kind: "hearts", place: "above", size: 40, gap: -4 } },
  },
  "trophy-quiz": {
    product: "trophy", name: "Quiz night trophy", note: "A crowned star with a name plate",
    params: { name: "Quiz night trophy", emblem: { kind: "star", width: 110, height: 105, text: "1", size: 30, laurel: false }, plate: { title: "Quiz Night", name: "The Know-It-Alls", year: "2026", width: 110, titleSize: 8, nameSize: 8 }, base: { tiers: 2, shape: "rounded", width: 130, depth: 60 } },
  },
  "qr-pet-tag": {
    product: "qr", name: "Pet tag", note: "25 mm round QR tag with a ring hole",
    params: { name: "Pet tag", content: { kind: "url", url: "https://example.com/my-pet" }, code: { ecc: "M", style: "rounded", size: 25, quiet: 2 }, plate: { shape: "circle", padding: 3 }, keyring: { kind: "top", diameter: 4 } },
  },
};
