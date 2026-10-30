/**
 * The start page's choices: what people come to make, grouped by goal, each opening the editor on a
 * ready-made design. Every product the site offers appears once; the test keeps the list in step.
 */
import { siteProducts, type SiteProduct } from "./products";

export type Effort = "Easy" | "Some assembly" | "Advanced";

export interface StartChoice extends SiteProduct {
  /** What it is for, in a few words. */
  hint: string;
  effort: Effort;
  /** Opens the editor on the showcase design. */
  start: string;
}

const GROUPS: { id: string; title: string; text: string; items: [string, string, Effort][] }[] = [
  {
    id: "gifts", title: "Personalised gifts", text: "Type a name, pick a style, done.",
    items: [
      ["keychain", "Name keychains and tags", "Easy"],
      ["charm", "Ornaments, earrings and tags", "Easy"],
      ["family", "Family name trees and monograms", "Easy"],
      ["sign", "Name and welcome signs", "Easy"],
      ["puzzle", "Jigsaw puzzles in any shape", "Easy"],
      ["clock", "Wall and desk clocks", "Easy"],
    ],
  },
  {
    id: "events", title: "Parties and events", text: "Toppers, table numbers and awards for the day.",
    items: [
      ["topper", "Cake and cupcake toppers", "Easy"],
      ["tablenum", "Wedding and restaurant table numbers", "Easy"],
      ["trophy", "Trophies and awards", "Easy"],
      ["popup", "Pop-up bowls and spiral decor", "Some assembly"],
    ],
  },
  {
    id: "home", title: "Home and decor", text: "Pieces for the wall, the shelf and the door.",
    items: [
      ["keyrack", "Key holders and wall racks", "Easy"],
      ["shadowbox", "Layered 3D shadow boxes", "Some assembly"],
      ["miniature", "Dollhouses and book nooks", "Some assembly"],
      ["qr", "QR code plates and Wi-Fi signs", "Easy"],
    ],
  },
  {
    id: "boxes", title: "Boxes and packaging", text: "Boxes that fit together, from wood or card.",
    items: [
      ["boxes", "Finger-joint boxes and organisers", "Some assembly"],
      ["paperbox", "Card and paper boxes", "Some assembly"],
      ["hinge", "Living-hinge boxes that bend", "Advanced"],
    ],
  },
  {
    id: "more", title: "Leather, lettering and sculpture", text: "Bigger projects with more settings.",
    items: [
      ["leather", "Leather bags, wallets and straps", "Advanced"],
      ["letters", "Letter boxes and stencils", "Advanced"],
      ["parametric", "Sliced sculptures from 3D files and photos", "Advanced"],
    ],
  },
];

export function startGroups() {
  const all = new Map(siteProducts().map((p) => [p.id, p]));
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.flatMap(([id, hint, effort]): StartChoice[] => {
      const p = all.get(id);
      if (!p) return [];
      // the design its picture shows
      const f = p.picture.split("/").pop()?.replace(/\.svg$/, "");
      return [{ ...p, hint, effort, start: f ? `${p.href}&preset=${encodeURIComponent(f)}` : p.href }];
    }),
  }));
}
