import type { GenPreset } from "../types";
import type { KeyrackParams } from "./params";

export const KEYRACK_PRESETS: GenPreset<KeyrackParams>[] = [
  {
    id: "home-sweet-home", name: "Home Sweet Home", note: "Script and a little house over four round hooks",
    params: { name: "Home Sweet Home key holder" },
  },
  {
    id: "house-hooks", name: "House", note: "A house-shaped board with three hooks",
    params: {
      name: "House key holder", board: { shape: "house", width: 200, height: 190, corner: 4 }, text: { text: "Keys", fontId: "pacifico", size: 26, y: 48 },
      motif: { kind: "none" }, hooks: { count: 3, profile: "round", y: 80, margin: 45 }, mount: { kind: "keyhole", y: 40 },
    },
  },
  {
    id: "family-keys", name: "Family", note: "A hook for everyone, with names above",
    params: {
      name: "Family key holder", board: { shape: "rounded", width: 320, height: 140 }, text: { text: "Family", fontId: "pacifico", size: 24, y: 24 },
      motif: { kind: "heart", side: "right", size: 18, gap: 4 }, hooks: { count: 4, profile: "round", y: 76, margin: 45, labels: "Mom\nDad\nAva\nNoah", labelSize: 7 },
    },
  },
  {
    id: "persian-home", name: "خانه", note: "Persian lettering on an arch with brass-look hooks",
    params: {
      name: "Persian key holder", board: { shape: "arch", width: 220, height: 170 }, text: { text: "خانه", fontId: "lalezar", size: 34, y: 42 },
      motif: { kind: "none" }, hooks: { count: 3, profile: "ball", y: 80, margin: 40 }, mount: { kind: "keyhole", y: 24 },
    },
  },
  {
    id: "shelf-organiser", name: "Keys and mail", note: "Hooks below and a shelf on top for post and phones", pro: true,
    params: {
      name: "Key and mail organiser", board: { shape: "rect", width: 320, height: 180, corner: 6 }, text: { text: "Keys & Mail", fontId: "archivo-black", size: 16, y: 52 },
      motif: { kind: "none" }, hooks: { count: 5, profile: "square", y: 84, margin: 40 }, shelf: { on: true, depth: 80, at: 14 }, mount: { kind: "holes", y: 30 },
    },
  },
  {
    id: "cloud-kids", name: "Kids cloud", note: "A cloud for bags and hats, ball-end pegs",
    params: {
      name: "Kids cloud hooks", board: { shape: "cloud", width: 300, height: 170 }, text: { text: "Hats & Bags", fontId: "fredoka", size: 18, y: 50 },
      motif: { kind: "none" }, hooks: { count: 3, profile: "ball", reach: 40, size: 18, y: 76, margin: 70 }, mount: { kind: "keyhole", y: 36 },
    },
  },
  {
    id: "peg-rail", name: "Peg rail", note: "A long rail with holes for six 10 mm dowels",
    params: {
      name: "Peg rail", board: { shape: "rounded", width: 500, height: 80, corner: 6 }, text: { text: "" }, motif: { kind: "none" },
      hooks: { count: 6, style: "peg", hole: 10, y: 55, margin: 40 }, mount: { kind: "holes", y: 22 },
    },
  },
  {
    id: "layered-welcome", name: "Welcome, layered", note: "Gold mirror letters raised on a wood board", pro: true,
    params: {
      name: "Welcome key holder", board: { shape: "rounded", width: 300, height: 130 }, text: { text: "Welcome", fontId: "pacifico", size: 30, mark: "raised", y: 34 },
      motif: { kind: "none" }, hooks: { count: 4, profile: "round", y: 78, margin: 45 }, mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "heart-love", name: "Heart", note: "A heart with two hooks for a couple",
    params: {
      name: "Heart key holder", board: { shape: "heart", width: 220, height: 200 }, text: { text: "Love", fontId: "pacifico", size: 30, y: 34 },
      motif: { kind: "none" }, hooks: { count: 2, profile: "round", y: 58, margin: 70, labels: "His\nHers", labelSize: 7 }, mount: { kind: "keyhole", y: 22 },
    },
  },
  {
    id: "car-keys", name: "Car keys", note: "A banner with a key motif and three hooks",
    params: {
      name: "Car keys holder", board: { shape: "banner", width: 280, height: 110 }, text: { text: "Car Keys", fontId: "archivo-black", size: 16, y: 30 },
      motif: { kind: "key", side: "left", size: 34, gap: 6 }, hooks: { count: 3, profile: "square", y: 74, margin: 60 },
    },
  },
  {
    id: "dog-leash", name: "Dog leads", note: "Long hooks for leads and collars, with paws",
    params: {
      name: "Dog lead hooks", board: { shape: "rounded", width: 280, height: 120 }, text: { text: "Walkies", fontId: "pacifico", size: 24, y: 30 },
      motif: { kind: "paw", side: "both", size: 22, gap: 8 }, hooks: { count: 3, profile: "round", reach: 45, size: 18, y: 74, margin: 50 },
    },
  },
  {
    id: "cup-hooks", name: "Mug rack", note: "Pilot holes for six brass cup hooks",
    params: {
      name: "Mug rack", board: { shape: "rounded", width: 420, height: 110 }, text: { text: "Coffee", fontId: "pacifico", size: 22, y: 30 },
      motif: { kind: "cup", side: "right", size: 22, gap: 6 }, hooks: { count: 6, style: "screw", hole: 3, y: 76, margin: 40 },
    },
  },
  {
    id: "stockings", name: "Stockings", note: "Merry Christmas with five stocking hooks",
    params: {
      name: "Stocking holder", board: { shape: "rounded", width: 420, height: 120 }, text: { text: "Merry Christmas", fontId: "pacifico", size: 22, y: 30 },
      motif: { kind: "tree", side: "both", size: 26, gap: 8 }, hooks: { count: 5, profile: "round", reach: 36, y: 76, margin: 45 },
    },
  },
  {
    id: "minimal-bar", name: "Minimal", note: "A plain slim bar with three square hooks",
    params: {
      name: "Minimal key bar", board: { shape: "pill", width: 220, height: 60 }, text: { text: "" }, motif: { kind: "none" },
      hooks: { count: 3, profile: "square", y: 62, margin: 45 }, mount: { kind: "holes", y: 25 },
    },
  },
];
