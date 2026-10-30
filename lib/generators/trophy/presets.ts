import type { GenPreset } from "../types";
import type { TrophyParams } from "./params";

export const TROPHY_PRESETS: GenPreset<TrophyParams>[] = [
  {"id": "studio-maker-award", "name": "Maker excellence award", "note": "Maker award with a 120 mm emblem and wider stepped base.", "params": {"name": "Maker excellence award", "emblem": {"width": 120, "height": 120, "text": "01"}, "plate": {"title": "Maker Award", "name": "Design Studio", "year": "2026", "width": 120}, "base": {"width": 140, "depth": 65}}},
  {"id": "studio-team-cup", "name": "Team achievement cup", "note": "Team cup with a 145 x 72 mm base and editable dedication.", "params": {"name": "Team achievement cup", "emblem": {"kind": "cup", "width": 120, "height": 110, "text": "", "laurel": false}, "plate": {"title": "Team Award", "name": "Together", "year": "2026", "titleSize": 9, "nameSize": 8, "width": 100}, "stem": {"height": 0}, "base": {"tiers": 3, "width": 145, "depth": 72, "step": 6}}},
  {"id": "studio-design-shield", "name": "Design achievement shield", "note": "DESIGN shield with an editable name plate and deeper base.", "params": {"name": "Design achievement shield", "emblem": {"kind": "shield", "width": 100, "height": 110, "text": "DESIGN", "fontId": "bebas-neue", "size": 12, "laurel": true}, "plate": {"title": "Excellence", "name": "Creative Team", "year": "2026", "width": 120, "titleSize": 8, "nameSize": 9}, "stem": {"height": 6}, "base": {"tiers": 2, "width": 140, "depth": 70}}},
  {
    id: "star-award", name: "Star award", note: "A star with a number, a name plate and a two-tier base",
    params: { name: "Star award" },
  },
  {
    id: "champion-cup", name: "Champion cup", note: "A classic cup with handles and a laurel",
    params: {
      name: "Champion cup", emblem: { kind: "cup", width: 120, height: 110, text: "", laurel: false },
      plate: { title: "Champions", name: "Riverside FC", year: "2026", titleSize: 9, nameSize: 8, width: 100 }, stem: { height: 0 },
      base: { tiers: 3, width: 130, depth: 66, step: 6 },
    },
  },
  {
    id: "medal-acrylic", name: "Acrylic medal", note: "A clear acrylic medal on a walnut base",
    params: {
      name: "Acrylic medal award", build: { kind: "mixed" }, emblem: { kind: "medal", width: 100, height: 120, text: "1st", size: 15, laurel: true },
      plate: { on: false }, stem: { height: 10, width: 26 }, base: { tiers: 2, shape: "rounded", width: 100, depth: 55, step: 5, fit: 0.05, text: "Best in Show" },
      mat: { mat2: "acrylic-clear", T2: 3 },
    },
  },
  {
    id: "employee-shield", name: "Employee of the year", note: "A shield with a laurel and a long name plate",
    params: {
      name: "Employee award", emblem: { kind: "shield", width: 100, height: 110, text: "MVP", fontId: "bebas-neue", size: 18, laurel: true },
      plate: { title: "Employee of the Year", name: "Jordan Lee", year: "2026", width: 120, titleSize: 8, nameSize: 9 }, stem: { height: 6 },
      base: { tiers: 2, width: 140, depth: 60 },
    },
  },
  {
    id: "flame-sports", name: "Flame", note: "A torch flame for a sports day",
    params: {
      name: "Sports day flame", emblem: { kind: "flame", width: 80, height: 120, text: "", laurel: false },
      plate: { title: "Sports Day", name: "Gold Team", year: "2026", width: 90 }, stem: { height: 8, width: 22 }, base: { tiers: 2, width: 110 },
    },
  },
  {
    id: "laurel-winner", name: "Laurel wreath", note: "A wreath around a big W",
    params: {
      name: "Laurel award", emblem: { kind: "laurel", width: 120, height: 120, text: "W", size: 40 },
      plate: { title: "Winner", name: "Sam Carter", year: "2026", width: 90 }, stem: { height: 0 }, base: { tiers: 2, width: 130 },
    },
  },
  {
    id: "number-one", name: "Number one", note: "A six-point star on a round base",
    params: {
      name: "Number one award", emblem: { kind: "star", points: 6, width: 110, height: 110, text: "#1", size: 30 }, plate: { on: false },
      stem: { height: 20, width: 20 }, base: { tiers: 3, shape: "circle", width: 100, depth: 100, step: 8, text: "Number One" },
    },
  },
  {
    id: "best-dad", name: "Best Dad", note: "A heart with a name plate for Father's Day",
    params: {
      name: "Best Dad award", emblem: { kind: "motif", motif: "heart", width: 100, height: 90, text: "Dad", fontId: "pacifico", size: 26 },
      plate: { title: "World's Best", name: "Dad", year: "", titleFont: "pacifico", nameSize: 12, width: 80 }, stem: { height: 0 }, base: { tiers: 2, width: 110 },
    },
  },
  {
    id: "music-award", name: "Music award", note: "A note for a recital or a talent show",
    params: {
      name: "Music award", emblem: { kind: "motif", motif: "note", width: 90, height: 110, text: "" },
      plate: { title: "Best Performance", name: "Mia Rossi", year: "Spring Recital 2026", width: 100, nameSize: 8 }, stem: { height: 0 },
      base: { tiers: 2, shape: "octagon", width: 120, depth: 70 },
    },
  },
  {
    id: "gaming-crown", name: "Gaming crown", note: "A crown for the tournament champion", pro: true,
    params: {
      name: "Gaming champion", build: { kind: "layered" }, emblem: { kind: "motif", motif: "crown", width: 120, height: 90, text: "" },
      plate: { title: "Tournament Champion", name: "PlayerOne", year: "Season 4", fontId: "bebas-neue", nameSize: 11, width: 110 }, stem: { height: 0 },
      base: { tiers: 2, shape: "hexagon", width: 130, depth: 70 }, mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "graduation", name: "Graduation", note: "A cap over the graduate's name",
    params: {
      name: "Graduation award", emblem: { kind: "motif", motif: "cap", width: 120, height: 80, text: "" },
      plate: { title: "Class of 2026", name: "Lena Park", year: "", width: 100, nameSize: 10 }, stem: { height: 0 }, base: { tiers: 2, width: 130 },
    },
  },
  {
    id: "dog-show", name: "Dog show", note: "A paw print for the best in show",
    params: {
      name: "Dog show award", emblem: { kind: "motif", motif: "paw", width: 100, height: 100, text: "" },
      plate: { title: "Best in Show", name: "Biscuit", year: "2026", width: 90, nameSize: 11 }, stem: { height: 0 }, base: { tiers: 2, shape: "circle", width: 110, depth: 110 },
    },
  },
  {
    id: "mirror-star", name: "Gold star", note: "A gold mirror star and plate on a wooden figure", pro: true,
    params: {
      name: "Gold star award", build: { kind: "layered" }, emblem: { kind: "star", width: 120, height: 115, text: "", laurel: false },
      plate: { title: "Star Teacher", name: "Ms. Ahmadi", year: "2026", width: 100 }, base: { tiers: 3, width: 130, depth: 66, step: 6 },
      mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "top-sales-star", name: "Top sales", note: "Star emblem on a two-tier base for a sales award",
    params: {
      name: "Top sales award", emblem: { kind: "star", width: 100, height: 100, text: "#1", fontId: "anton", size: 22, laurel: false },
      plate: { title: "Top Sales", name: "Team Member", year: "2026", width: 110 }, base: { tiers: 2, shape: "rounded", width: 130, depth: 60 },
    },
  },
  {
    id: "chef-of-the-year", name: "Chef of the year", note: "Flame emblem on an octagon base for a kitchen award",
    params: {
      name: "Chef of the year", emblem: { kind: "flame", width: 90, height: 120, text: "", laurel: false },
      plate: { title: "Chef of the Year", name: "Head Chef", year: "2026", width: 115 }, base: { tiers: 2, shape: "octagon", width: 125, depth: 70 },
    },
  },
  {
    id: "innovation-medal", name: "Innovation medal", note: "Medal and laurel for a team prize",
    params: {
      name: "Innovation medal", emblem: { kind: "medal", width: 95, height: 115, text: "1st", fontId: "montserrat", size: 18, laurel: true },
      plate: { title: "Innovation Award", name: "Winning Team", year: "2026", width: 110 }, base: { tiers: 1, shape: "hexagon", width: 120, depth: 65 },
    },
  },
  {
    id: "golf-classic-cup", name: "Club cup", note: "Classic cup on a round three-tier base",
    params: {
      name: "Club classic cup", emblem: { kind: "cup", width: 110, height: 130, text: "", laurel: false },
      plate: { title: "Club Classic", name: "Champion", year: "2026", width: 120 }, base: { tiers: 3, shape: "circle", width: 120, depth: 120 },
    },
  },
  {
    id: "girih-award", name: "Girih award", note: "Eight-point girih star on a two-tier base",
    params: {
      name: "Girih award", emblem: { kind: "motif", motif: "girih", width: 110, height: 110, text: "", laurel: false },
      plate: { title: "Excellence Award", name: "Your Name", year: "2026", width: 120 }, base: { tiers: 2, shape: "octagon", width: 130, depth: 70 },
    },
  },
  {
    id: "tree-of-life-award", name: "Tree of life", note: "Tree of life emblem for a service or family award",
    params: {
      name: "Tree of life award", emblem: { kind: "motif", motif: "treeoflife", width: 110, height: 110, text: "", laurel: false },
      plate: { title: "In Gratitude", name: "Your Name", year: "2026", width: 120 }, base: { tiers: 1, shape: "rounded", width: 130, depth: 70 },
    },
  },
  {
    id: "led-glow-star", name: "Glowing star award", note: "A clear acrylic star lit from an LED base under two walnut tiers",
    params: {
      name: "Glowing star award", material: "walnut3", build: { kind: "mixed" }, emblem: { kind: "star", width: 110, height: 105, text: "1", fontId: "archivo-black", size: 30, laurel: true },
      plate: { title: "Champion", name: "Sam Rivera", year: "2026", width: 100 }, base: { tiers: 2, width: 130, depth: 64, step: 6, fit: 0.05, led: true },
      mat: { mat2: "acrylic-clear", T2: 3 },
    },
  },
  {
    id: "led-rosette", name: "LED rosette", note: "A first-place rosette in clear acrylic that glows on its base",
    params: {
      name: "First place rosette", material: "walnut3", build: { kind: "mixed" }, emblem: { kind: "rosette", width: 100, height: 120, text: "1st", fontId: "archivo-black", size: 20, laurel: false },
      plate: { on: false }, stem: { height: 0 }, base: { tiers: 1, shape: "rounded", width: 110, depth: 60, fit: 0.05, led: true },
      mat: { mat2: "acrylic-clear", T2: 3 },
    },
  },
  {
    id: "rosette-first", name: "Prize rosette", note: "A rosette with 1st and a name plate, on a two-tier base",
    params: {
      name: "Prize rosette award", emblem: { kind: "rosette", width: 100, height: 115, text: "1st", fontId: "anton", size: 20, laurel: false },
      plate: { title: "Best in Show", name: "Bella", year: "2026", width: 95 }, base: { tiers: 2, width: 125, depth: 62 },
    },
  },
  {
    id: "wall-plaque-shield", name: "Wall plaque", note: "Gold mirror shield and name plate on an arched walnut plaque",
    params: {
      name: "Service wall plaque", material: "walnut3", build: { kind: "mixed" }, display: { kind: "plaque", shape: "arch", margin: 22 },
      emblem: { kind: "shield", width: 100, height: 110, text: "10", fontId: "cinzel", size: 26, laurel: true },
      plate: { title: "Years of Service", name: "Jordan Lee", year: "2016 – 2026", width: 110 }, mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "race-medal", name: "Race medal", note: "A laurel medal with the distance, on a 25 mm ribbon",
    params: {
      name: "Race medal", display: { kind: "medal", ribbon: 25 }, emblem: { kind: "laurel", width: 75, height: 75, text: "5K", fontId: "anton", size: 18, laurel: false },
      plate: { on: false }, stem: { height: 0 },
    },
  },
  {
    id: "sports-day-medal", name: "Sports day medal", note: "A star medal with the winner's name on a plate below",
    params: {
      name: "Sports day medal", display: { kind: "medal", ribbon: 22 }, emblem: { kind: "star", width: 80, height: 76, text: "1", fontId: "archivo-black", size: 20, laurel: false },
      plate: { title: "Sports Day", name: "Mia", year: "2026", width: 60, titleSize: 6, nameSize: 7 }, stem: { height: 0 },
    },
  },
];
