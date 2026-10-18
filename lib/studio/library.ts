/**
 * Built-in sheet presets, material presets and machine profiles (spec §3, §5.8, §11.5).
 * Cut settings are starting points only; the Test & Calibration generator writes measured values
 * into the user's own copies.
 */
import { MATERIALS } from "@/lib/hinge";

export const STARTING_POINT_NOTE = "Starting point — run a test grid first";

export interface SheetPreset { id: string; name: string; w: number; h: number; group: "Machine bed" | "Paper" | "Common" }

export const SHEET_PRESETS: SheetPreset[] = [
  { id: "bed-glowforge", name: "Glowforge bed", w: 495, h: 279, group: "Machine bed" },
  { id: "bed-xtool-p2", name: "xTool P2 bed", w: 600, h: 308, group: "Machine bed" },
  { id: "bed-xtool-s1", name: "xTool S1 bed", w: 498, h: 319, group: "Machine bed" },
  { id: "bed-omtech-50", name: "OMTech 50 W bed", w: 500, h: 300, group: "Machine bed" },
  { id: "bed-k40", name: "K40 bed", w: 300, h: 200, group: "Machine bed" },
  { id: "bed-xtool-f1", name: "xTool F1 bed", w: 115, h: 115, group: "Machine bed" },
  { id: "bed-xtool-m1", name: "xTool M1 bed", w: 385, h: 300, group: "Machine bed" },
  { id: "bed-xtool-d1pro", name: "xTool D1 Pro bed", w: 430, h: 390, group: "Machine bed" },
  { id: "bed-ortur-lm3", name: "Ortur Laser Master 3 bed", w: 400, h: 380, group: "Machine bed" },
  { id: "bed-atomstack-a10", name: "Atomstack A10 Pro / Sculpfun S30 bed", w: 410, h: 400, group: "Machine bed" },
  { id: "bed-falcon2", name: "Creality Falcon2 bed", w: 400, h: 415, group: "Machine bed" },
  { id: "bed-epilog-edge24", name: "Epilog Fusion Edge 24 bed", w: 610, h: 305, group: "Machine bed" },
  { id: "bed-omtech-80", name: "OMTech 80 W bed", w: 700, h: 500, group: "Machine bed" },
  { id: "a5", name: "A5", w: 148, h: 210, group: "Paper" },
  { id: "a4", name: "A4", w: 210, h: 297, group: "Paper" },
  { id: "a3", name: "A3", w: 297, h: 420, group: "Paper" },
  { id: "a2", name: "A2", w: 420, h: 594, group: "Paper" },
  { id: "letter", name: "Letter", w: 215.9, h: 279.4, group: "Paper" },
  { id: "12x12", name: "12 × 12 in", w: 304.8, h: 304.8, group: "Common" },
  { id: "300x200", name: "300 × 200 mm", w: 300, h: 200, group: "Common" },
  { id: "600x400", name: "600 × 400 mm", w: 600, h: 400, group: "Common" },
  { id: "400x400", name: "400 × 400 mm", w: 400, h: 400, group: "Common" },
  { id: "900x600", name: "900 × 600 mm", w: 900, h: 600, group: "Common" },
  { id: "1300x900", name: "1300 × 900 mm", w: 1300, h: 900, group: "Common" },
];

export type LaserType = "co2" | "diode" | "fiber";

export interface CutSetting { speed: number; power: number; passes: number }

export interface MaterialPreset {
  id: string;
  name: string;
  /** Measured thickness, mm. */
  thickness: number;
  /** Kerf (full cut width), mm. */
  kerf: number;
  /** Bend strain capacity γ for the living-hinge analysis (brittleness class). */
  gamma: number;
  hinge: { pitch: number; slit: number; bridge: number };
  cut: Record<LaserType, CutSetting | null>;
  engrave: Record<LaserType, CutSetting | null>;
  notes: string;
  builtIn: boolean;
}

const wood = (cut: number, diodeCut: number | null): MaterialPreset["cut"] => ({
  co2: { speed: cut, power: 65, passes: 1 },
  diode: diodeCut ? { speed: diodeCut, power: 100, passes: 2 } : null,
  fiber: null,
});
const engraveWood: MaterialPreset["engrave"] = {
  co2: { speed: 250, power: 25, passes: 1 },
  diode: { speed: 120, power: 60, passes: 1 },
  fiber: null,
};

const fromHinge = (id: string) => MATERIALS[id];

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "birch3", name: fromHinge("birch3").name, thickness: 3, kerf: 0.15, gamma: fromHinge("birch3").gamma, hinge: { pitch: 2.5, slit: 28, bridge: 3 }, cut: wood(12, 5), engrave: engraveWood, notes: "Mask the top face to avoid smoke marks.", builtIn: true },
  { id: "birch18", name: fromHinge("birch18").name, thickness: 3.175, kerf: 0.15, gamma: fromHinge("birch18").gamma, hinge: { pitch: 2.6, slit: 28, bridge: 3.2 }, cut: wood(11, 4.5), engrave: engraveWood, notes: "", builtIn: true },
  { id: "poplar3", name: fromHinge("poplar3").name, thickness: 3, kerf: 0.16, gamma: fromHinge("poplar3").gamma, hinge: { pitch: 2.4, slit: 28, bridge: 3 }, cut: wood(15, 6), engrave: engraveWood, notes: "Softer than birch; voids in the core can stop a cut.", builtIn: true },
  { id: "mdf3", name: fromHinge("mdf3").name, thickness: 3, kerf: 0.18, gamma: fromHinge("mdf3").gamma, hinge: { pitch: 3, slit: 26, bridge: 3.5 }, cut: wood(10, 4), engrave: engraveWood, notes: "Use dog-bone relief on finger joints; MDF does not compress.", builtIn: true },
  { id: "card2", name: fromHinge("card2").name, thickness: 2, kerf: 0.2, gamma: fromHinge("card2").gamma, hinge: { pitch: 2, slit: 24, bridge: 2.5 }, cut: { co2: { speed: 30, power: 40, passes: 1 }, diode: { speed: 10, power: 80, passes: 1 }, fiber: null }, engrave: { co2: { speed: 300, power: 15, passes: 1 }, diode: { speed: 150, power: 40, passes: 1 }, fiber: null }, notes: "Watch for flare-ups; keep air assist on.", builtIn: true },
  { id: "acr3", name: fromHinge("acr3").name, thickness: 3, kerf: 0.1, gamma: fromHinge("acr3").gamma, hinge: { pitch: 3.5, slit: 24, bridge: 4 }, cut: { co2: { speed: 8, power: 70, passes: 1 }, diode: null, fiber: null }, engrave: { co2: { speed: 300, power: 20, passes: 1 }, diode: null, fiber: null }, notes: "Cast acrylic engraves white; extruded engraves clear. Living hinges in acrylic crack easily.", builtIn: true },
  { id: "leather2", name: "Veg-tan leather 2 mm", thickness: 2, kerf: 0.2, gamma: 0.05, hinge: { pitch: 2, slit: 20, bridge: 2 }, cut: { co2: { speed: 20, power: 45, passes: 1 }, diode: { speed: 6, power: 90, passes: 2 }, fiber: null }, engrave: { co2: { speed: 300, power: 15, passes: 1 }, diode: { speed: 150, power: 40, passes: 1 }, fiber: null }, notes: "Never cut chrome-tanned leather or PVC (toxic fumes).", builtIn: true },
  { id: "anod-al", name: "Anodised aluminium (marking)", thickness: 1, kerf: 0, gamma: 0, hinge: { pitch: 0, slit: 0, bridge: 0 }, cut: { co2: null, diode: null, fiber: null }, engrave: { co2: { speed: 300, power: 40, passes: 1 }, diode: { speed: 100, power: 100, passes: 1 }, fiber: { speed: 1000, power: 30, passes: 1 } }, notes: "Marking only; cannot be cut on CO₂ or diode lasers.", builtIn: true },
];

export const materialById = (id: string) => MATERIAL_PRESETS.find((m) => m.id === id);

export interface MachineProfile {
  id: string;
  name: string;
  laser: LaserType;
  watts: number;
  bedW: number;
  bedH: number;
  /** Maximum travel speed, mm/s. */
  maxSpeed: number;
  origin: "top-left" | "bottom-left" | "top-right" | "bottom-right";
  exportFormat: "svg" | "dxf" | "lbrn2" | "pdf";
  builtIn: boolean;
}

export const MACHINE_PROFILES: MachineProfile[] = [
  { id: "co2-50", name: "Generic CO₂ 50 W", laser: "co2", watts: 50, bedW: 500, bedH: 300, maxSpeed: 500, origin: "top-left", exportFormat: "svg", builtIn: true },
  { id: "co2-100", name: "Generic CO₂ 100 W", laser: "co2", watts: 100, bedW: 900, bedH: 600, maxSpeed: 600, origin: "top-left", exportFormat: "dxf", builtIn: true },
  { id: "k40", name: "K40 (40 W CO₂)", laser: "co2", watts: 40, bedW: 300, bedH: 200, maxSpeed: 300, origin: "top-left", exportFormat: "svg", builtIn: true },
  { id: "glowforge", name: "Glowforge Basic / Plus", laser: "co2", watts: 40, bedW: 495, bedH: 279, maxSpeed: 400, origin: "top-left", exportFormat: "svg", builtIn: true },
  { id: "xtool-p2", name: "xTool P2 (55 W CO₂)", laser: "co2", watts: 55, bedW: 600, bedH: 308, maxSpeed: 600, origin: "top-left", exportFormat: "svg", builtIn: true },
  { id: "diode-10", name: "Diode 10 W (xTool D1, Ortur, Sculpfun)", laser: "diode", watts: 10, bedW: 430, bedH: 390, maxSpeed: 400, origin: "top-left", exportFormat: "svg", builtIn: true },
  { id: "diode-20", name: "Diode 20 W", laser: "diode", watts: 20, bedW: 430, bedH: 400, maxSpeed: 400, origin: "top-left", exportFormat: "svg", builtIn: true },
  { id: "fiber-30", name: "Fiber 30 W (marking)", laser: "fiber", watts: 30, bedW: 110, bedH: 110, maxSpeed: 7000, origin: "top-left", exportFormat: "svg", builtIn: true },
];

export const machineById = (id: string) => MACHINE_PROFILES.find((m) => m.id === id);

export const DEFAULT_MATERIAL = "birch3";
export const DEFAULT_MACHINE = "co2-50";
