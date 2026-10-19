/**
 * Generator code by id. The app loads a generator only when it is opened (`loadGenerator`), so
 * none of them adds to the start screen's bundle; tests, the help build and scripts use the list.
 */
import type { GeneratorId } from "./ids";
import type { AnyGenerator } from "./types";

export const loadGenerator: Record<GeneratorId, () => Promise<AnyGenerator>> = {
  clock: () => import("./clock").then((m) => m.CLOCK as AnyGenerator),
  puzzle: () => import("./puzzle").then((m) => m.PUZZLE as AnyGenerator),
  qr: () => import("./qr").then((m) => m.QR as AnyGenerator),
  boxes: () => import("./boxes").then((m) => m.BOXES as AnyGenerator),
  topper: () => import("./topper").then((m) => m.TOPPER as AnyGenerator),
  keyrack: () => import("./keyrack").then((m) => m.KEYRACK as AnyGenerator),
  sign: () => import("./sign").then((m) => m.SIGN as AnyGenerator),
  tablenum: () => import("./tablenum").then((m) => m.TABLENUM as AnyGenerator),
  trophy: () => import("./trophy").then((m) => m.TROPHY as AnyGenerator),
  shadowbox: () => import("./shadowbox").then((m) => m.SHADOWBOX as AnyGenerator),
  paperbox: () => import("./paperbox").then((m) => m.PAPERBOX as AnyGenerator),};
