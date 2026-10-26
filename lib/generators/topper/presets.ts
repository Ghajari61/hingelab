import type { GenPreset } from "../types";
import type { TopperParams } from "./params";

export const TOPPER_PRESETS: GenPreset<TopperParams>[] = [
  {"id": "studio-celebrate-topper", "name": "Celebrate script topper", "note": "Celebrate script joined to a star motif.", "params": {"name": "Celebrate script topper", "text": {"text": "Celebrate", "fontId": "pacifico", "size": 32}, "motif": {"kind": "stars", "place": "above", "size": 38, "gap": -4}}},
  {"id": "studio-milestone-topper", "name": "Milestone topper", "note": "Class of 2027 under a graduation cap, with editable text.", "params": {"name": "Milestone topper", "text": {"text": "Class of\n2027", "fontId": "archivo-black", "size": 24, "spacing": 0.5}, "style": {"kind": "outline", "border": 4, "mark": "engrave"}, "motif": {"kind": "cap", "place": "above", "size": 60, "gap": -4}}},
  {"id": "studio-anniversary-topper", "name": "Anniversary topper", "note": "Always script with wedding rings in contrasting layers.", "params": {"name": "Anniversary topper", "text": {"text": "Always", "fontId": "pacifico", "size": 38}, "style": {"kind": "layered", "border": 4, "weld": 1}, "motif": {"kind": "rings", "place": "above", "size": 46, "gap": -3}, "mat": {"mat2": "acrylic-gold", "T2": 3}}},
  {
    id: "happy-birthday", name: "Happy Birthday", note: "Script letters with balloons, two sticks",
    params: { name: "Happy Birthday topper", text: { text: "Happy\nBirthday", fontId: "pacifico", size: 30 }, motif: { kind: "balloons", place: "above", size: 46, gap: -4 } },
  },
  {
    id: "mr-mrs", name: "Mr & Mrs", note: "Gold mirror letters on a white acrylic backing, rings above",
    params: {
      name: "Mr and Mrs topper", text: { text: "Mr & Mrs", fontId: "pacifico", size: 30 }, style: { kind: "layered", border: 4, weld: 1 },
      motif: { kind: "rings", place: "above", size: 40, gap: -3 }, mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "eid-mubarak", name: "Eid Mubarak", note: "Crescent and star beside script letters",
    params: { name: "Eid Mubarak topper", text: { text: "Eid\nMubarak", fontId: "pacifico", size: 28 }, motif: { kind: "moonstar", place: "left", size: 62, gap: -6 } },
  },
  {
    id: "graduation", name: "Graduation", note: "Class of 2026 under a mortarboard",
    params: {
      name: "Graduation topper", text: { text: "Class of\n2026", fontId: "archivo-black", size: 22, spacing: 0.5 }, style: { kind: "outline", border: 4, mark: "engrave" },
      motif: { kind: "cap", place: "above", size: 56, gap: -4 },
    },
  },
  {
    id: "baby-shower", name: "Baby shower", note: "Oh Baby with little feet",
    params: { name: "Baby shower topper", text: { text: "Oh Baby", fontId: "pacifico", size: 34 }, motif: { kind: "feet", place: "above", size: 34, gap: -3 } },
  },
  {
    id: "merry-christmas", name: "Merry Christmas", note: "Script letters between two snowflakes",
    params: { name: "Christmas topper", text: { text: "Merry\nChristmas", fontId: "pacifico", size: 28 }, motif: { kind: "snowflake", place: "both", size: 34, gap: -2 } },
  },
  {
    id: "anniversary", name: "Anniversary", note: "Rose gold letters with hearts on a wood backing",
    params: {
      name: "Anniversary topper", material: "birch3", T: 3, K: 0.15, text: { text: "Happy\nAnniversary", fontId: "pacifico", size: 26 },
      style: { kind: "layered", border: 4, weld: 1 }, motif: { kind: "hearts", place: "above", size: 36, gap: -3 }, mat: { mat2: "acrylic-rose", T2: 3 },
    },
  },
  {
    id: "love", name: "Love", note: "One word with a heart, a single stick",
    params: { name: "Love topper", text: { text: "Love", fontId: "pacifico", size: 46 }, motif: { kind: "heart", place: "right", size: 34, gap: -6 }, sticks: { count: 1 } },
  },
  {
    id: "just-married", name: "Just Married", note: "Silver mirror letters on black acrylic",
    params: {
      name: "Just Married topper", text: { text: "Just\nMarried", fontId: "pacifico", size: 30 }, style: { kind: "layered", border: 4, weld: 1 },
      motif: { kind: "infinity", place: "below", size: 46, gap: -2 }, mat: { mat2: "acrylic-silver", T2: 3 },
    },
  },
  {
    id: "number-30", name: "Number 30", note: "Bold age numbers with stars",
    params: { name: "30th birthday topper", text: { text: "30", fontId: "archivo-black", size: 70, spacing: 1 }, style: { kind: "letters", weld: 1 }, motif: { kind: "stars", place: "right", size: 44, gap: -6 } },
  },
  {
    id: "ramadan-plate", name: "Ramadan plate", note: "An arch plate with a lantern and engraved text", pro: true,
    params: {
      name: "Ramadan topper", material: "birch3", T: 3, K: 0.15, text: { text: "Ramadan\nKareem", fontId: "pacifico", size: 22 },
      style: { kind: "plate", mark: "engrave" }, motif: { kind: "lantern", place: "above", size: 36, gap: 4 }, plate: { shape: "arch", auto: true, pad: 10, frame: true },
    },
  },
  {
    id: "bride-to-be", name: "Bride to be", note: "Script with a diamond, gold glitter",
    params: {
      name: "Bride to be topper", text: { text: "Bride\nto be", fontId: "pacifico", size: 30 }, style: { kind: "layered", border: 3.5, weld: 1 },
      motif: { kind: "gem", place: "above", size: 30, gap: -3 }, mat: { mat2: "acrylic-glitter", T2: 3 },
    },
  },
  {
    id: "cupcake-hearts", name: "Cupcake hearts", note: "12 heart picks, cut as silhouettes",
    params: { name: "Heart cupcake picks", kit: { kind: "cupcake" }, cupcake: { count: 12, shape: "motif", motif: "heart", size: 45, text: "" } },
  },
  {
    id: "cupcake-names", name: "Cupcake names", note: "Scalloped picks with a name and star on each",
    params: {
      name: "Name cupcake picks", kit: { kind: "cupcake" }, material: "birch3", T: 3, K: 0.15,
      cupcake: { count: 6, shape: "scalloped", motif: "star", size: 58, text: "Mia\nNoah\nAva\nLeo\nZoe\nSam", fontId: "fredoka", textSize: 8 },
    },
  },
  {
    id: "party-set", name: "Party set", note: "Happy Birthday topper plus 12 star picks", pro: true,
    params: {
      name: "Birthday party set", kit: { kind: "set" }, text: { text: "Happy\nBirthday", fontId: "pacifico", size: 28 }, motif: { kind: "stars", place: "above", size: 36, gap: -3 },
      cupcake: { count: 12, shape: "motif", motif: "star", size: 42 },
    },
  },
  {
    id: "nowruz-sweets", name: "Nowruz sweets", note: "Persian New Year cake topper with a rising sun",
    params: { name: "Nowruz topper", text: { text: "نوروز", fontId: "lalezar", size: 34 }, motif: { kind: "sun", place: "above", size: 34, gap: -4 }, style: { kind: "layered", weld: 1 } },
  },
  {
    id: "yalda-night", name: "Yalda night", note: "Moon and star topper for a Yalda dessert",
    params: { name: "Yalda topper", text: { text: "شب یلدا", fontId: "vazirmatn", size: 28 }, motif: { kind: "moonstar", place: "above", size: 32, gap: -2 }, style: { kind: "letters" } },
  },
  {
    id: "she-said-yes", name: "She said yes", note: "Script engagement topper with wedding rings",
    params: { name: "She said yes", text: { text: "She Said Yes", fontId: "dancing-script", size: 30 }, motif: { kind: "rings", place: "above", size: 34, gap: -4 }, style: { kind: "outline" } },
  },
  {
    id: "oh-baby-stroller", name: "Oh baby", note: "Baby shower topper with a pram beside the words",
    params: { name: "Oh baby topper", text: { text: "Oh Baby", fontId: "fredoka", size: 30 }, motif: { kind: "stroller", place: "left", size: 32, gap: -2 }, style: { kind: "letters" } },
  },
  {
    id: "anchor-ahoy", name: "Ahoy anchor", note: "Nautical baby shower topper with an anchor",
    params: { name: "Ahoy topper", text: { text: "Ahoy!", fontId: "alfa-slab-one", size: 32 }, motif: { kind: "anchor", place: "above", size: 38, gap: -3 }, style: { kind: "letters" } },
  },
  {
    id: "lotus-namaste", name: "Lotus", note: "Lotus over a flowing script word",
    params: { name: "Lotus topper", text: { text: "Namaste", fontId: "great-vibes", size: 32 }, motif: { kind: "lotus", place: "above", size: 38, gap: -4 }, style: { kind: "letters" } },
  },
];
