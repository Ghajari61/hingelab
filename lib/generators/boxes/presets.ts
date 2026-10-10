import type { GenPreset } from "../types";
import type { BoxesParams } from "./params";

export const BOXES_PRESETS: GenPreset<BoxesParams>[] = [
  { id: "small-box", name: "Small box", note: "120 × 80 × 60 mm inside, closed, glued", params: { name: "Small box", design: "box", box: { width: 120, depth: 80, height: 60, lid: "closed" } } },
  { id: "pencil-cup", name: "Pencil cup", note: "Open box, 75 mm square and 100 mm tall", params: { name: "Pencil cup", design: "box", joint: { finger: 8 }, box: { width: 75, depth: 75, height: 100, lid: "open" } } },
  { id: "keepsake", name: "Keepsake box", note: "Lift-off lid with a lip that drops inside the walls", params: { name: "Keepsake box", design: "box", box: { width: 160, depth: 110, height: 70, lid: "liftoff", clearance: 0.3 } } },
  { id: "organiser", name: "Drawer organiser", note: "3 × 2 compartments with half-lap dividers", params: { name: "Drawer organiser", design: "tray", tray: { width: 240, depth: 160, height: 50, cols: 3, rows: 2, dividers: 85 } } },
  { id: "tea-box", name: "Tea box", note: "4 × 2 compartments for tea bags", params: { name: "Tea box", design: "tray", tray: { width: 280, depth: 150, height: 80, cols: 4, rows: 2, dividers: 90 } } },
  { id: "screw-tray", name: "Screw tray", note: "Shallow 4 × 3 tray for small parts", params: { name: "Screw tray", design: "tray", joint: { finger: 8 }, tray: { width: 200, depth: 150, height: 30, cols: 4, rows: 3, dividers: 100 } } },
  { id: "desk-sign", name: "Desk sign", note: "Engraved sign standing in a slotted base", params: { name: "Desk sign", design: "sign", sign: { width: 200, height: 70, corner: 8, text: "Hello", fontId: "fredoka", size: 30, base: 50 } } },
  { id: "name-plate", name: "Name plate", note: "Long, low sign for a desk or counter", params: { name: "Name plate", design: "sign", sign: { width: 240, height: 55, corner: 4, text: "Sam Rivera", fontId: "fredoka", size: 20, base: 45 } } },
  { id: "office-sign", name: "Office sign", note: "Engraved border following the rounded outline", params: { name: "Office sign", design: "sign", sign: { width: 220, height: 80, corner: 14, text: "Studio", fontId: "archivo-black", size: 26, base: 50, border: 5, borderWidth: 1.5 } } },
  { id: "frame-10x15", name: "Photo frame 10 × 15", note: "Three layers on a stand; the photo slides in from the top", params: { name: "Photo frame 10 × 15", design: "frame", frame: { photoW: 100, photoH: 150, border: 20, overlap: 4, corner: 6, mount: "stand" } } },
  { id: "frame-square", name: "Square wall frame", note: "130 mm square photo with a keyhole to hang it", params: { name: "Square wall frame", design: "frame", frame: { photoW: 130, photoH: 130, border: 25, overlap: 5, corner: 3, mount: "hang" } } },
  { id: "phone-stand", name: "Phone stand", note: "Leans the phone back 65°; fits a phone in a case", params: { name: "Phone stand", design: "stand", stand: { width: 75, angle: 65, slot: 14, lip: 10, height: 95 } } },
  { id: "tablet-stand", name: "Tablet stand", note: "Wider and taller, for a tablet or cookbook", params: { name: "Tablet stand", design: "stand", stand: { width: 160, angle: 70, slot: 16, lip: 14, height: 140 } } },
  { id: "key-holder", name: "Key holder", note: "Wall board with four hooks", params: { name: "Key holder", design: "keys", keys: { width: 220, height: 90, corner: 10, hooks: 4, reach: 35, text: "KEYS", fontId: "fredoka", size: 18 } } },
  { id: "bird-house", name: "Bird house", note: "Nest box with a 32 mm entrance, vents and drain holes", params: { name: "Bird house", design: "bird", bird: { width: 120, depth: 120, height: 150, pitch: 40, hole: 32, perch: false, overhang: 20 } } },
];
