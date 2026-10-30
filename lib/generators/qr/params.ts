import { cleanMark } from "../textOps";
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { EYE_BALL_NAMES, EYE_FRAME_NAMES, type EyeBall, type EyeFrame } from "./eyes";
import { BADGE_KINDS, type BadgeKind } from "./icons";
import { PLATE_SHAPES, type PlateShape } from "./plates";

export type ContentKind = "url" | "text" | "wifi" | "vcard" | "email" | "sms" | "phone" | "whatsapp" | "map" | "event";
export type Ecc = "L" | "M" | "Q" | "H";
export type ModuleStyle = "square" | "rounded" | "dots" | "connected" | "diamond" | "tiny" | "vlines" | "hlines";
export type OutputKind = "engrave" | "cutout" | "stencil";
export type LabelPos = "below" | "above" | "right";
export type LabelStyle = "plain" | "bar";
export type FrameStyle = "line" | "corners";
export type LogoKind = "none" | "heart" | "star" | "wifi" | "text";
export type KeyringKind = "none" | "top" | "corner";
/** How the sign stands or hangs: flat, in a slotted base, on two feet, folded as a tent, or screwed to a wall. */
export type StandKind = "none" | "base" | "feet" | "tent" | "wall";
export type { BadgeKind, EyeBall, EyeFrame, PlateShape };

/** Share of the code a logo may cover at each error-correction level (none at L). */
export const LOGO_MAX: Record<Ecc, number> = { L: 0, M: 0.05, Q: 0.09, H: 0.14 };
/** What each level can recover, for the panel and stats. */
export const ECC_RECOVERY: Record<Ecc, number> = { L: 7, M: 15, Q: 25, H: 30 };

export interface QrParams extends GenBase {
  content: {
    kind: ContentKind;
    url: string;
    text: string;
    ssid: string;
    password: string;
    security: "WPA" | "WEP" | "nopass";
    hidden: boolean;
    first: string;
    last: string;
    org: string;
    jobTitle: string;
    phone: string;
    email: string;
    website: string;
    to: string;
    subject: string;
    body: string;
    smsTo: string;
    message: string;
    tel: string;
    /** WhatsApp: the number (with country code) and a message filled in for the sender. */
    waTo: string;
    waText: string;
    /** A place: an address or "lat, long", opened in a map. */
    place: string;
    /** A calendar event: title, date (YYYY-MM-DD), start and end time (HH:MM), place. */
    evTitle: string;
    evDate: string;
    evStart: string;
    evEnd: string;
    evPlace: string;
  };
  code: {
    ecc: Ecc;
    style: ModuleStyle;
    /** Width of the code without its quiet zone, mm. */
    size: number;
    /** Quiet zone, modules. */
    quiet: number;
    /** Dot size for dots and connected, % of a module. */
    dot: number;
    /** Engrave the light modules instead (dark materials). */
    invert: boolean;
    /** Shapes of the three corner finders ("eyes"): their frame and their centre. */
    eyeFrame: EyeFrame;
    eyeBall: EyeBall;
  };
  output: {
    kind: OutputKind;
    /** Stencil bridges between rows, % of a module. */
    bridge: number;
  };
  plate: {
    shape: PlateShape;
    /** Plate border outside the quiet zone, mm. */
    padding: number;
    corner: number;
    frame: boolean;
    frameWidth: number;
    /** A full line, or only the four corners (a scanner's viewfinder). */
    frameStyle: FrameStyle;
    /** Plant stake: length of the stake below the plate, mm. */
    stake: number;
  };
  label: {
    text: string;
    position: LabelPos;
    fontId: string;
    size: number;
    /** Plain text, or the text knocked out of an engraved bar. */
    style: LabelStyle;
    /** A plain label on an engraved plate: engraved (filled) or scored (outlines). */
    mark: "engrave" | "score";
  };
  logo: {
    kind: LogoKind;
    /** Logo width, % of the code. */
    size: number;
    text: string;
  };
  keyring: {
    kind: KeyringKind;
    diameter: number;
  };
  /** A picture above the code, saying what it is for (stars for reviews, a menu, Wi-Fi…). */
  badge: {
    kind: BadgeKind;
    /** Height, mm. */
    size: number;
  };
  stand: {
    kind: StandKind;
    /** Base or feet depth (front to back), mm. */
    depth: number;
    /** Base: layers stacked (the bottom one solid when there are two or more). */
    layers: number;
    /** Feet: how far the sign leans back, degrees. */
    lean: number;
    /** Tent: depth of the living hinge band, mm. */
    band: number;
    /** Wall: two holes at the top or four in the corners (for standoffs), and their diameter. */
    holes: "two" | "four";
    holeD: number;
  };
}

export const QR_DEFAULTS: QrParams = {
  name: "QR code",
  material: "birch3",
  T: HINGE.T,
  K: HINGE.K,
  bedW: 600,
  bedH: 400,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  content: {
    kind: "url", url: "https://hingelab.vercel.app", text: "",
    ssid: "", password: "", security: "WPA", hidden: false,
    first: "", last: "", org: "", jobTitle: "", phone: "", email: "", website: "",
    to: "", subject: "", body: "", smsTo: "", message: "", tel: "",
    waTo: "", waText: "", place: "", evTitle: "", evDate: "", evStart: "", evEnd: "", evPlace: "",
  },
  code: { ecc: "M", style: "square", size: 50, quiet: 4, dot: 85, invert: false, eyeFrame: "auto", eyeBall: "auto" },
  output: { kind: "engrave", bridge: 20 },
  plate: { shape: "rect", padding: 5, corner: 4, frame: false, frameWidth: 1.2, frameStyle: "line", stake: 90 },
  label: { text: "", position: "below", fontId: "fredoka", size: 6, style: "plain", mark: "engrave" },
  logo: { kind: "none", size: 20, text: "HL" },
  keyring: { kind: "none", diameter: 5 },
  badge: { kind: "none", size: 12 },
  stand: { kind: "none", depth: 50, layers: 2, lean: 12, band: 18, holes: "two", holeD: 4 },
};

export function mergeQr(raw: unknown): QrParams {
  const p = mergeInto(clone(QR_DEFAULTS), raw);
  // saves from before scoring keep their engraved label
  p.label.mark = cleanMark(p.label.mark, ["engrave", "score"] as const, "engrave");
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  p.plate.shape = pick(p.plate.shape, PLATE_SHAPES, "rect");
  p.badge.kind = pick(p.badge.kind, BADGE_KINDS, "none");
  p.stand.kind = pick(p.stand.kind, ["none", "base", "feet", "tent", "wall"] as const, "none");
  p.stand.holes = pick(p.stand.holes, ["two", "four"] as const, "two");
  p.code.style = pick(p.code.style, ["square", "rounded", "dots", "connected", "diamond", "tiny", "vlines", "hlines"] as const, "square");
  p.code.eyeFrame = pick(p.code.eyeFrame, Object.keys(EYE_FRAME_NAMES) as EyeFrame[], "auto");
  p.code.eyeBall = pick(p.code.eyeBall, Object.keys(EYE_BALL_NAMES) as EyeBall[], "auto");
  return p;
}
