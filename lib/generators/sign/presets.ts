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
    id: "persian-welcome", name: "خوش آمدید", note: "Persian welcome on an arch with pomegranates",
    params: {
      name: "Persian welcome sign", board: { shape: "arch", auto: true, pad: 18 }, text: { text: "خوش آمدید", fontId: "lalezar", size: 46 },
      motif: { kind: "pomegranate", side: "both", size: 64, gap: 10 }, border: { kind: "score", inset: 7 }, mount: { kind: "keyhole" },
    },
  },
  {
    id: "persian-home", name: "خانه ما", note: "Gold Persian letters layered on wood",
    params: {
      name: "Our home sign", style: { kind: "layered", weld: 0.8, join: false }, board: { shape: "scalloped", auto: true, pad: 24, corner: 0 },
      text: { text: "خانه ما", fontId: "vazirmatn", size: 42 }, motif: { kind: "none" }, border: { kind: "none" }, mount: { kind: "hanging" },
      mat: { mat2: "acrylic-gold", T2: 3 },
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
];
