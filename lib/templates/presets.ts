import {POPUP_PRESETS} from '@/lib/generators/popup/presets';
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
  ...Object.fromEntries(POPUP_PRESETS.map(p => [`popup-${p.id}`, {product:"popup" as const,name:p.name,note:p.note,params:p.params as Record<string,unknown>}])),
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
  "sign-reception": { product: "sign", name: "Reception plaque", note: "Engraved plaque on standoffs", params: { name: "Reception", style: { kind: "engraved" }, board: { shape: "rounded", auto: true, pad: 22, corner: 12 }, text: { text: "Reception", fontId: "cinzel", size: 40 }, motif: { kind: "key", side: "above", size: 30, gap: 8 }, border: { kind: "engrave", inset: 7, width: 1.5 }, mount: { kind: "standoff", hole: 5 } } },
  "sign-nowruz": { product: "sign", name: "Nowruz scallop", note: "Layered Persian greeting", params: { name: "Nowruz", style: { kind: "layered" }, board: { shape: "scalloped", auto: true, pad: 24, corner: 10 }, text: { text: "نوروز مبارک", fontId: "lalezar", size: 44 }, motif: { kind: "sun", side: "above", size: 40, gap: 6 }, border: { kind: "engrave", inset: 8, width: 2 }, mount: { kind: "hanging", hole: 5 } } },
  "sign-bakery": { product: "sign", name: "Bakery banner", note: "Hanging bakery banner", params: { name: "Fresh bakery", style: { kind: "word" }, board: { shape: "banner", auto: true, pad: 20, corner: 8 }, text: { text: "Fresh Bakery", fontId: "lobster", size: 46 }, motif: { kind: "cupcake", side: "left", size: 38, gap: 8 }, border: { kind: "none" }, mount: { kind: "hanging", hole: 6 } } },
  "sign-cocktail": { product: "sign", name: "Cocktail bar", note: "Neon-style bar sign", params: { name: "Cocktail bar", style: { kind: "neon" }, board: { shape: "pill", auto: true, pad: 20 }, text: { text: "Cocktail Bar", fontId: "pacifico", size: 44 }, motif: { kind: "stars", side: "right", size: 32, gap: 8 }, mount: { kind: "standoff", hole: 4 } } },
  "topper-nowruz": { product: "topper", name: "Nowruz sweets", note: "Sun over نوروز", params: { name: "Nowruz topper", text: { text: "نوروز", fontId: "lalezar", size: 34 }, motif: { kind: "sun", place: "above", size: 34, gap: -4 }, style: { kind: "layered", weld: 1 } } },
  "topper-yalda": { product: "topper", name: "Yalda night", note: "Moon and star over شب یلدا", params: { name: "Yalda topper", text: { text: "شب یلدا", fontId: "vazirmatn", size: 28 }, motif: { kind: "moonstar", place: "above", size: 32, gap: -2 }, style: { kind: "letters" } } },
  "topper-yes": { product: "topper", name: "She said yes", note: "Rings over script", params: { name: "She said yes", text: { text: "She Said Yes", fontId: "dancing-script", size: 30 }, motif: { kind: "rings", place: "above", size: 34, gap: -4 }, style: { kind: "outline" } } },
  "topper-stroller": { product: "topper", name: "Oh baby", note: "Pram beside the words", params: { name: "Oh baby topper", text: { text: "Oh Baby", fontId: "fredoka", size: 30 }, motif: { kind: "stroller", place: "left", size: 32, gap: -2 }, style: { kind: "letters" } } },
  "trophy-sales": { product: "trophy", name: "Top sales", note: "Star on a two-tier base", params: { name: "Top sales award", emblem: { kind: "star", width: 100, height: 100, text: "#1", fontId: "anton", size: 22, laurel: false }, plate: { title: "Top Sales", name: "Team Member", year: "2026", width: 110 }, base: { tiers: 2, shape: "rounded", width: 130, depth: 60 } } },
  "trophy-chef": { product: "trophy", name: "Chef of the year", note: "Flame on an octagon base", params: { name: "Chef of the year", emblem: { kind: "flame", width: 90, height: 120, text: "", laurel: false }, plate: { title: "Chef of the Year", name: "Head Chef", year: "2026", width: 115 }, base: { tiers: 2, shape: "octagon", width: 125, depth: 70 } } },
  "trophy-innovation": { product: "trophy", name: "Innovation medal", note: "Medal and laurel", params: { name: "Innovation medal", emblem: { kind: "medal", width: 95, height: 115, text: "1st", fontId: "montserrat", size: 18, laurel: true }, plate: { title: "Innovation Award", name: "Winning Team", year: "2026", width: 110 }, base: { tiers: 1, shape: "hexagon", width: 120, depth: 65 } } },
  "trophy-club": { product: "trophy", name: "Club cup", note: "Cup on a round base", params: { name: "Club classic cup", emblem: { kind: "cup", width: 110, height: 130, text: "", laurel: false }, plate: { title: "Club Classic", name: "Champion", year: "2026", width: 120 }, base: { tiers: 3, shape: "circle", width: 120, depth: 120 } } },
  "tables-banquet": { product: "tablenum", name: "Banquet arch", note: "Tables 1 to 12", params: { name: "Banquet table numbers", batch: { from: 1, to: 12 }, plate: { shape: "arch", pad: 14, corner: 8 }, text: { label: "Table", labelFont: "cinzel", fontId: "cinzel", size: 44 }, border: { kind: "score", inset: 5 } } },
  "tables-bistro": { product: "tablenum", name: "Bistro circle", note: "Round cafe numbers", params: { name: "Bistro table numbers", batch: { from: 1, to: 12 }, plate: { shape: "circle", pad: 12, corner: 0 }, text: { label: "No.", labelFont: "bebas-neue", fontId: "bebas-neue", size: 52 }, border: { kind: "engrave", inset: 6 } } },
  "tables-miz": { product: "tablenum", name: "Persian table cards", note: "میز on scalloped plates", params: { name: "Persian table numbers", batch: { from: 1, to: 12 }, plate: { shape: "scalloped", pad: 14, corner: 8 }, text: { label: "میز", labelFont: "vazirmatn", fontId: "vazirmatn", size: 40 }, border: { kind: "score", inset: 6 } } },
  "tables-garden": { product: "tablenum", name: "Garden hexagon", note: "Hexagon plates 1 to 10", params: { name: "Garden table numbers", batch: { from: 1, to: 10 }, plate: { shape: "hexagon", pad: 14, corner: 4 }, text: { label: "Table", labelFont: "montserrat", fontId: "montserrat", size: 38 }, border: { kind: "none" } } },
  "box-saffron": { product: "boxes", name: "Saffron chest", note: "Sliding spice chest", params: { name: "Saffron chest", design: "box", box: { width: 200, depth: 120, height: 60, lid: "sliding", clearance: 0.3, notch: true }, engrave: { text: "Saffron", fontId: "playfair-display", size: 18, motif: "flower", motifSize: 30, border: 4 } } },
  "box-cutlery": { product: "boxes", name: "Cutlery caddy", note: "Three open bays", params: { name: "Cutlery caddy", design: "tray", tray: { width: 280, depth: 140, height: 70, cols: 3, rows: 1, dividers: 80 } } },
  "box-wedding-cards": { product: "boxes", name: "Wedding card box", note: "Slot for envelopes", params: { name: "Wedding card box", design: "money", money: { width: 200, depth: 120, height: 180, slot: 60, plug: 45 }, engrave: { text: "Cards", fontId: "dancing-script", size: 22, motif: "rings", motifSize: 36, border: 4 } } },
  "box-hex-trinket": { product: "boxes", name: "Hexagon trinket box", note: "Diamond on the lid", params: { name: "Hexagon trinket box", design: "hex", hex: { width: 130, height: 55, lid: "liftoff", clearance: 0.3 }, engrave: { text: "", fontId: "cinzel", size: 14, motif: "gem", motifSize: 34, border: 4 } } },
  "clock-lounge": { product: "clock", name: "Lounge sunburst", note: "360 mm sunburst", params: { name: "Lounge sunburst", face: { shape: "sunburst", size: 360, rays: 32, depth: 40, layers: "single" }, markers: { style: "ticks", minutes: false }, hands: { style: "baton", hour: 80, minute: 120, width: 8, tail: 18 } } },
  "clock-kitchen": { product: "clock", name: "Kitchen scallop", note: "Dots and leaf hands", params: { name: "Kitchen scallop", face: { shape: "scallop", size: 300, layers: "single" }, markers: { style: "dots", fontId: "fredoka", size: 16 }, hands: { style: "leaf", hour: 65, minute: 100, width: 9, tail: 16 } } },
  "clock-studio": { product: "clock", name: "Studio hexagon", note: "Six-sided studio clock", params: { name: "Studio hexagon", face: { shape: "polygon", sides: 6, size: 320, corner: 8, layers: "single" }, markers: { style: "mixed", numerals: "arabic", fontId: "oswald", size: 18 }, hands: { style: "arrow", hour: 70, minute: 110, width: 14, tail: 16 } } },
  "clock-bloom": { product: "clock", name: "Bloom numerals", note: "Flower face", params: { name: "Bloom clock", face: { shape: "flower", size: 340, rays: 8, layers: "single" }, markers: { style: "numerals", numerals: "arabic", fontId: "playfair-display", size: 22 }, hands: { style: "classic", hour: 75, minute: 115, width: 14, tail: 16 } } },
  "keys-hotel": { product: "keyrack", name: "Hotel key board", note: "Six hooks for room keys", params: { name: "Room keys", board: { shape: "rect", width: 420, height: 130, corner: 6 }, text: { text: "Room Keys", fontId: "cinzel", size: 24 }, motif: { kind: "key", side: "left", size: 30 }, hooks: { count: 6, profile: "round" }, mount: { kind: "holes" } } },
  "keys-farmhouse": { product: "keyrack", name: "Farmhouse entry", note: "House board with square hooks", params: { name: "Home keys", board: { shape: "house", width: 300, height: 160, corner: 10 }, text: { text: "Home", fontId: "playfair-display", size: 24 }, motif: { kind: "house", side: "left", size: 26 }, hooks: { count: 4, profile: "square" }, mount: { kind: "keyhole" } } },
  "keys-garage": { product: "keyrack", name: "Garage banner", note: "Five hooks for workshop keys", params: { name: "Garage keys", board: { shape: "banner", width: 340, height: 120, corner: 8 }, text: { text: "Garage Keys", fontId: "anton", size: 24 }, motif: { kind: "none" }, hooks: { count: 5, profile: "round" }, mount: { kind: "holes" } } },
  "keys-kelid": { product: "keyrack", name: "Persian key rack", note: "Cloud board labelled کلید", params: { name: "Persian keys", board: { shape: "cloud", width: 300, height: 120, corner: 12 }, text: { text: "کلید", fontId: "vazirmatn", size: 26 }, motif: { kind: "key", side: "right", size: 26 }, hooks: { count: 4, profile: "round" }, mount: { kind: "keyhole" } } },
};
