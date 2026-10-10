import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { SHEET_EXTRAS, type GenBase } from "../types";
import { mergeInto } from "../util";

export type ContentKind = "url" | "text" | "wifi" | "vcard" | "email" | "sms" | "phone";
export type Ecc = "L" | "M" | "Q" | "H";
export type ModuleStyle = "square" | "rounded" | "dots" | "connected";
export type OutputKind = "engrave" | "cutout" | "stencil";
export type PlateShape = "rect" | "circle";
export type LabelPos = "below" | "above" | "right";
export type LogoKind = "none" | "heart" | "star" | "wifi" | "text";
export type KeyringKind = "none" | "top" | "corner";

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
  };
  label: {
    text: string;
    position: LabelPos;
    fontId: string;
    size: number;
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
  sheet: { ...SHEET_EXTRAS },
  layers: clone(HINGE.layers),
  content: {
    kind: "url", url: "https://hingelab.vercel.app", text: "",
    ssid: "", password: "", security: "WPA", hidden: false,
    first: "", last: "", org: "", jobTitle: "", phone: "", email: "", website: "",
    to: "", subject: "", body: "", smsTo: "", message: "", tel: "",
  },
  code: { ecc: "M", style: "square", size: 50, quiet: 2, dot: 85, invert: false },
  output: { kind: "engrave", bridge: 20 },
  plate: { shape: "rect", padding: 5, corner: 4, frame: false, frameWidth: 1.2 },
  label: { text: "", position: "below", fontId: "fredoka", size: 6 },
  logo: { kind: "none", size: 20, text: "HL" },
  keyring: { kind: "none", diameter: 5 },
};

export function mergeQr(raw: unknown): QrParams {
  return mergeInto(clone(QR_DEFAULTS), raw);
}
