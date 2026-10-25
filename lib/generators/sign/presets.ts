import type { GenPreset } from "../types";
import type { SignParams } from "./params";

export const SIGN_PRESETS: GenPreset<SignParams>[] = [
  {
    id: "welcome-arch", name: "Welcome arch", note: "Script on an arch with a flower and a scored frame",
    params: { name: "Welcome sign" },
  },
  {
    id: "layered-name", name: "Layered name", note: "Gold mirror letters on a birch board",
    params: {
      name: "Name sign", style: { kind: "layered", weld: 1.2 }, board: { shape: "rounded", auto: true, pad: 16, corner: 10 },
      text: { text: "Olivia", fontId: "pacifico", size: 48, spacing: -0.5 }, motif: { kind: "stars", side: "right", size: 30, gap: 4 },
      border: { kind: "none" }, mount: { kind: "hanging", hole: 5 }, mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "cafe-hanging", name: "Café hanging sign", note: "Bold capitals and a sun in an engraved frame, on a cord",
    params: {
      name: "Coffee sign", board: { shape: "rect", auto: true, pad: 20, corner: 8 }, text: { text: "COFFEE\nHOUSE", fontId: "bebas-neue", size: 44, spacing: 2, lead: 1.15 },
      motif: { kind: "sun", side: "above", size: 34, gap: 8 }, border: { kind: "engrave", inset: 6, width: 3 }, mount: { kind: "hanging", hole: 6 },
    },
  },
  {
    id: "office-door", name: "Office door", note: "Clear acrylic, engraved from the back, on standoffs",
    params: {
      name: "Meeting room sign", material: "acr3", T: 3, K: 0.1, style: { kind: "engraved", mirror: true },
      board: { shape: "rect", auto: false, width: 300, height: 90, corner: 4 }, text: { text: "Meeting Room", fontId: "archivo-black", size: 22 },
      motif: { kind: "none" }, border: { kind: "none" }, mount: { kind: "standoff", hole: 8 },
    },
  },
  {
    id: "house-number", name: "House number", note: "Big black acrylic numbers on a wooden plaque",
    params: {
      name: "House number", style: { kind: "layered", weld: 0.6 }, board: { shape: "rounded", auto: true, pad: 18, corner: 12 },
      text: { text: "24\nMaple Lane", fontId: "archivo-black", size: 30, lead: 1.4 }, motif: { kind: "none" },
      border: { kind: "none" }, mount: { kind: "holes", hole: 5 }, mat: { mat2: "acrylic-black", T2: 3 },
    },
  },
  {
    id: "love-shelf", name: "Love on a stand", note: "A cut-out word on a slotted base for a shelf",
    params: {
      name: "Love shelf sign", style: { kind: "word", weld: 1.4 }, text: { text: "Love", fontId: "pacifico", size: 60, spacing: -1 },
      motif: { kind: "none" }, mount: { kind: "stand", depth: 60 },
    },
  },
  {
    id: "family-word", name: "Family word", note: "A cut-out script word for the wall",
    params: {
      name: "Family wall word", style: { kind: "word", weld: 1.2 }, text: { text: "Family", fontId: "pacifico", size: 70, spacing: -1 },
      motif: { kind: "heart", side: "right", size: 30, gap: -4 }, mount: { kind: "none" },
    },
  },
  {
    id: "inlay-home", name: "Walnut inlay", note: "HOME inlaid flush in walnut on birch", pro: true,
    params: {
      name: "Inlay home sign", style: { kind: "inlay" }, board: { shape: "rounded", auto: true, pad: 22, corner: 8 },
      text: { text: "HOME", fontId: "archivo-black", size: 50, spacing: 3 }, motif: { kind: "none" }, border: { kind: "none" },
      mount: { kind: "keyhole" }, mat: { mat2: "walnut-3", T2: 3 },
    },
  },
  {
    id: "kids-room", name: "Kids room", note: "A cloud with a name and stars on both sides",
    params: {
      name: "Kids room sign", board: { shape: "cloud", auto: true, pad: 42 }, text: { text: "Ava's Room", fontId: "fredoka", size: 30 },
      motif: { kind: "star", side: "both", size: 22, gap: 6 }, border: { kind: "none" }, mount: { kind: "hanging", hole: 5 },
    },
  },
  {
    id: "desk-name", name: "Desk name plate", note: "An engraved name that stands on a slotted base",
    params: {
      name: "Desk name plate", board: { shape: "rect", auto: true, pad: 14, corner: 4 }, text: { text: "Dr. Sara Reed\nArchitect", fontId: "archivo-black", size: 16, lead: 1.6 },
      motif: { kind: "none" }, border: { kind: "score", inset: 5 }, mount: { kind: "stand", depth: 55 },
    },
  },
  {
    id: "wedding-welcome", name: "Wedding welcome", note: "Large arch with rings and a raised gold frame", pro: true,
    params: {
      name: "Wedding welcome sign", board: { shape: "arch", auto: true, pad: 30 }, text: { text: "Welcome to\nour wedding", fontId: "pacifico", size: 40, lead: 1.35 },
      motif: { kind: "rings", side: "above", size: 50, gap: 10 }, border: { kind: "raised", inset: 6, width: 6 }, mount: { kind: "none" },
      mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "open-ticket", name: "Open sign", note: "A ticket-shaped shop sign on a cord",
    params: {
      name: "Open sign", board: { shape: "ticket", auto: true, pad: 26 }, text: { text: "OPEN", fontId: "bebas-neue", size: 60, spacing: 4 },
      motif: { kind: "none" }, border: { kind: "score", inset: 6 }, mount: { kind: "hanging", hole: 6 },
    },
  },
  {
    id: "garden-leaf", name: "Garden", note: "Script cut out of a big engraved leaf",
    params: {
      name: "Garden sign", board: { shape: "circle", auto: true, pad: 34 }, text: { text: "Garden", fontId: "pacifico", size: 26 },
      motif: { kind: "leaf", side: "behind", size: 110 }, border: { kind: "score", inset: 5 }, mount: { kind: "hanging", hole: 5 },
    },
  },
  {
    id: "pet-heart", name: "Pet name", note: "A heart with a paw and the pet's name in red acrylic",
    params: {
      name: "Pet sign", style: { kind: "layered", weld: 1 }, board: { shape: "heart", auto: true, pad: 12 },
      text: { text: "Max", fontId: "fredoka", size: 36 }, motif: { kind: "paw", side: "above", size: 26, gap: 4 },
      border: { kind: "none" }, mount: { kind: "hanging", hole: 4 }, mat: { mat2: "acrylic-red", T2: 3 },
    },
  },
  {
    id: "neon-love", name: "Neon-look love", note: "Glowing script outlines on clear acrylic, on a desk stand",
    params: {
      name: "Neon love", material: "acr3", T: 3, K: 0.1, style: { kind: "neon", border: 6 },
      text: { text: "love", fontId: "pacifico", size: 70, spacing: -1 }, motif: { kind: "heart", side: "right", size: 34, gap: 2 },
      mount: { kind: "stand", depth: 50 },
    },
  },
  {
    id: "paint-stencil", name: "Paint stencil", note: "Letters cut through with bridges, for crates and walls",
    params: {
      name: "Paint stencil", material: "card2", T: 2, K: 0.2, style: { kind: "stencil" },
      board: { shape: "rect", auto: true, pad: 20, corner: 0 }, text: { text: "GARDEN", fontId: "archivo-black", size: 50, spacing: 2 },
      motif: { kind: "none" }, border: { kind: "none" }, mount: { kind: "none" },
    },
  },
  {
    id: "neon-open", name: "Neon-look OPEN", note: "A shop-window OPEN sign for an LED base",
    params: {
      name: "Neon open", material: "acr5", T: 5, K: 0.12, style: { kind: "neon", border: 8 },
      text: { text: "OPEN", fontId: "archivo-black", size: 60, spacing: 2 }, motif: { kind: "none" }, mount: { kind: "none" },
    },
  },
  {
    id: "reception-plaque", name: "Reception plaque", note: "Engraved rounded plaque on standoffs for a front desk",
    params: {
      name: "Reception", style: { kind: "engraved" }, board: { shape: "rounded", auto: true, pad: 22, corner: 12 },
      text: { text: "Reception", fontId: "cinzel", size: 40 }, motif: { kind: "key", side: "above", size: 30, gap: 8 },
      border: { kind: "engrave", inset: 7, width: 1.5 }, mount: { kind: "standoff", hole: 5 },
    },
  },
  {
    id: "nowruz-scallop", name: "Nowruz scallop", note: "Layered Persian greeting on a scalloped board",
    params: {
      name: "Nowruz", style: { kind: "layered" }, board: { shape: "scalloped", auto: true, pad: 24, corner: 10 },
      text: { text: "نوروز مبارک", fontId: "lalezar", size: 44 }, motif: { kind: "sun", side: "above", size: 40, gap: 6 },
      border: { kind: "engrave", inset: 8, width: 2 }, mount: { kind: "hanging", hole: 5 },
    },
  },
  {
    id: "bakery-banner", name: "Bakery banner", note: "Hanging banner for a bakery storefront",
    params: {
      name: "Fresh bakery", style: { kind: "word" }, board: { shape: "banner", auto: true, pad: 20, corner: 8 },
      text: { text: "Fresh Bakery", fontId: "lobster", size: 46 }, motif: { kind: "cupcake", side: "left", size: 38, gap: 8 },
      border: { kind: "none" }, mount: { kind: "hanging", hole: 6 },
    },
  },
  {
    id: "cocktail-bar-neon", name: "Cocktail bar", note: "Neon-style sign with stars for a bar or lounge",
    params: {
      name: "Cocktail bar", style: { kind: "neon" }, board: { shape: "pill", auto: true, pad: 20 },
      text: { text: "Cocktail Bar", fontId: "pacifico", size: 44 }, motif: { kind: "stars", side: "right", size: 32, gap: 8 },
      mount: { kind: "standoff", hole: 4 },
    },
  },
  {
    id: "mandala-welcome", name: "Mandala welcome", note: "Cinzel capitals under a detailed mandala, engraved frame",
    params: {
      name: "Mandala welcome", board: { shape: "arch", auto: true, pad: 20, corner: 10 }, text: { text: "WELCOME", fontId: "cinzel", size: 30, spacing: 3 },
      motif: { kind: "mandala", side: "above", size: 70, gap: 8 }, border: { kind: "engrave", inset: 7, width: 2 }, mount: { kind: "hanging", hole: 5 },
    },
  },
  {
    id: "lake-house", name: "Lake house", note: "Mountain scene beside a serif family name, on a cord",
    params: {
      name: "Lake house sign", board: { shape: "rounded", auto: true, pad: 18, corner: 12 }, text: { text: "The Millers\nLake House", fontId: "playfair-display", size: 30, lead: 1.15 },
      motif: { kind: "mountains", side: "left", size: 64, gap: 10 }, border: { kind: "engrave", inset: 6, width: 2 }, mount: { kind: "hanging", hole: 5 },
    },
  },
  {
    id: "paisley-home", name: "Paisley home", note: "Script greeting with paisley motifs either side",
    params: {
      name: "Paisley home sign", board: { shape: "rounded", auto: true, pad: 18, corner: 10 }, text: { text: "Home Sweet Home", fontId: "great-vibes", size: 38 },
      motif: { kind: "paisley", side: "both", size: 44, gap: 8 }, border: { kind: "engrave", inset: 6, width: 2 }, mount: { kind: "hanging", hole: 5 },
    },
  },
];
