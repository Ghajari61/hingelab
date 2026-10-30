import { letterMarkField } from "../textOps";
import { shapeContours, unionShapes } from "@/lib/letters/polygon";
import { arc, circle, deg, ellipse, rect, roundedRect, stadium } from "../geom";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildQr, moduleShapes, stencilHoles, type QrOutput, CODE_AREA } from "./build";
import { checkQr } from "./check";
import { CONTENT_NAMES, qrMatrix } from "./encode";
import { EYE_BALL_NAMES, EYE_FRAME_NAMES, eyeContours, type EyeBall, type EyeFrame } from "./eyes";
import { BADGE_KINDS, BADGE_NAMES, badgeContours, type BadgeKind } from "./icons";
import { ECC_RECOVERY, QR_DEFAULTS, mergeQr, type ContentKind, type ModuleStyle, type QrParams } from "./params";
import { CORNERED, PLATE_NAMES, PLATE_SHAPES, plateOutline, type PlateShape } from "./plates";
import { QR_PRESETS } from "./presets";
import { byId, withPattern } from "../pattern";

const r1 = (v: number) => Math.round(v * 10) / 10;
const holds = (...k: ContentKind[]) => (p: QrParams) => k.includes(p.content.kind);
const outputs = (...k: QrParams["output"]["kind"][]) => (p: QrParams) => k.includes(p.output.kind);
const OUTPUT_NAMES = { engrave: "engraved", cutout: "cut out", stencil: "stencil" } as const;

const sections: SectionSpec<QrParams>[] = [
  {
    id: "content", title: "Content", open: true,
    help: "What the code holds: a web address, text, Wi-Fi login, contact card, email, text message, phone number, WhatsApp chat, map location or calendar event.",
    fields: [
      {
        kind: "choice", key: "content.kind", label: "Content", rail: true,
        help: "The kind of content; phones offer the matching action (open the page, join the network, save the contact).",
        options: (Object.keys(CONTENT_NAMES) as ContentKind[]).map((v) => ({ v, text: CONTENT_NAMES[v] })),
      },
      { kind: "text", key: "content.url", label: "Web address", placeholder: "example.com", show: holds("url"), help: "The page the code opens; https:// is added when you leave it out." },
      { kind: "text", key: "content.text", label: "Text", multiline: true, maxLength: 1000, show: holds("text"), help: "Plain text shown on the phone when the code is scanned." },
      { kind: "text", key: "content.ssid", label: "Network name", show: holds("wifi"), help: "The Wi-Fi network name (SSID), exactly as it appears on a phone." },
      { kind: "text", key: "content.password", label: "Password", show: (p) => p.content.kind === "wifi" && p.content.security !== "nopass", help: "The Wi-Fi password; anyone who scans the code can read it." },
      {
        kind: "choice", key: "content.security", label: "Security", show: holds("wifi"),
        help: "The network's security type; WPA covers WPA2 and WPA3.",
        options: [{ v: "WPA", text: "WPA" }, { v: "WEP", text: "WEP" }, { v: "nopass", text: "Open" }],
      },
      { kind: "toggle", key: "content.hidden", label: "Hidden network", show: holds("wifi"), help: "Turn on when the network does not broadcast its name." },
      { kind: "text", key: "content.first", label: "First name", show: holds("vcard"), help: "Given name on the contact card." },
      { kind: "text", key: "content.last", label: "Last name", show: holds("vcard"), help: "Family name on the contact card." },
      { kind: "text", key: "content.org", label: "Company", show: holds("vcard"), help: "Company or organisation." },
      { kind: "text", key: "content.jobTitle", label: "Job title", show: holds("vcard"), help: "Role or job title." },
      { kind: "text", key: "content.phone", label: "Phone", show: holds("vcard"), help: "Phone number, with the country code for numbers used abroad." },
      { kind: "text", key: "content.email", label: "Email", show: holds("vcard"), help: "Email address on the contact card." },
      { kind: "text", key: "content.website", label: "Website", show: holds("vcard"), help: "Website on the contact card." },
      { kind: "text", key: "content.to", label: "Send to", placeholder: "name@example.com", show: holds("email"), help: "The address the email goes to." },
      { kind: "text", key: "content.subject", label: "Subject", show: holds("email"), help: "Subject line filled in for the sender." },
      { kind: "text", key: "content.body", label: "Email text", multiline: true, maxLength: 500, show: holds("email"), help: "The start of the email; the sender can change it before sending." },
      { kind: "text", key: "content.smsTo", label: "Number", show: holds("sms"), help: "The phone number the text message goes to." },
      { kind: "text", key: "content.message", label: "Message", multiline: true, maxLength: 300, show: holds("sms"), help: "The message filled in for the sender." },
      { kind: "text", key: "content.tel", label: "Number to call", show: holds("phone"), help: "The phone number the code dials, with the country code if needed." },
      { kind: "text", key: "content.waTo", label: "WhatsApp number", placeholder: "+1 555 0123", show: holds("whatsapp"), help: "The number the chat opens with, including the country code." },
      { kind: "text", key: "content.waText", label: "Message", multiline: true, maxLength: 300, show: holds("whatsapp"), help: "A message filled in for the sender (they can change it before sending)." },
      { kind: "text", key: "content.place", label: "Place", placeholder: "Address, or 51.5007, -0.1246", show: holds("map"), help: "An address or a place name, or latitude and longitude separated by a comma; the code opens it in a map." },
      { kind: "text", key: "content.evTitle", label: "Event", show: holds("event"), help: "The event's name, as it appears in the calendar." },
      { kind: "text", key: "content.evDate", label: "Date", placeholder: "2026-12-31", show: holds("event"), help: "The day of the event, written year-month-day." },
      { kind: "text", key: "content.evStart", label: "Starts", placeholder: "19:30", show: holds("event"), help: "Start time (24-hour clock); leave it empty for an all-day event." },
      { kind: "text", key: "content.evEnd", label: "Ends", placeholder: "22:30", show: (p) => p.content.kind === "event" && !!p.content.evStart.trim(), help: "End time on the same day." },
      { kind: "text", key: "content.evPlace", label: "Where", show: holds("event"), help: "The venue or address, saved with the event." },
    ],
  },
  {
    id: "code", title: "Code", open: true,
    help: "Size, error correction and the look of the modules.",
    fields: [
      {
        kind: "choice", key: "code.style", shuffle: true, label: "Module style", rail: true,
        help: "Square modules scan best; the other styles look softer or more graphic and still scan when the modules are large enough.",
        options: [
          { v: "square", text: "Square" }, { v: "rounded", text: "Rounded" }, { v: "dots", text: "Dots" }, { v: "connected", text: "Connected" },
          { v: "diamond", text: "Diamonds" }, { v: "tiny", text: "Small squares" }, { v: "vlines", text: "Vertical bars" }, { v: "hlines", text: "Horizontal bars" },
        ],
      },
      {
        kind: "choice", key: "code.eyeFrame", shuffle: true, label: "Eye frame", rail: true, show: (p) => p.output.kind !== "stencil",
        help: "The shape of the three corner squares' outer ring. Match follows the module style. Scanners measure the eyes, so each shape keeps the ring, gap and centre the standard sizes.",
        options: (Object.keys(EYE_FRAME_NAMES) as EyeFrame[]).map((v) => ({ v, text: EYE_FRAME_NAMES[v] })),
      },
      {
        kind: "choice", key: "code.eyeBall", shuffle: true, label: "Eye centre", rail: true, show: (p) => p.output.kind !== "stencil",
        help: "The shape of the solid centre of each corner square.",
        options: (Object.keys(EYE_BALL_NAMES) as EyeBall[]).map((v) => ({ v, text: EYE_BALL_NAMES[v] })),
      },
      { kind: "number", key: "code.size", label: "Code size", unit: "mm", min: 10, max: 600, step: 1, help: "Width of the code itself, without the clear space around it." },
      {
        kind: "choice", key: "code.ecc", label: "Error correction",
        help: "How much of the code can be damaged or covered and still scan; higher levels need more modules, and a centre logo needs Q or H.",
        options: (["L", "M", "Q", "H"] as const).map((v) => ({ v, text: v, title: `Recovers ${ECC_RECOVERY[v]} %` })),
      },
      { kind: "number", key: "code.quiet", label: "Quiet zone", unit: "", min: 0, max: 8, step: 1, int: true, help: "Clear space around the code, in modules; standard QR symbols need at least four clear modules on every side." },
      { kind: "number", key: "code.dot", label: "Dot size", unit: "%", min: 50, max: 100, step: 1, show: (p) => !["square", "rounded"].includes(p.code.style), help: "Size of each dot, diamond, small square or bar as a share of a module; smaller looks lighter but scans less well." },
      { kind: "toggle", key: "code.invert", label: "Invert (light code)", show: outputs("engrave"), help: "Engraves the background instead of the modules, for materials that engrave lighter than they are (dark acrylic, anodised aluminium)." },
    ],
  },
  {
    id: "output", title: "Output", open: true,
    help: "How the code is made: engraved, cut through a top plate over a contrasting backplate, or cut as a paint stencil.",
    fields: [
      {
        kind: "choice", key: "output.kind", label: "Output", rail: true,
        help: "Engrave marks the modules; Cut out makes two plates (the light top one is cut through and glued on a dark backplate); Stencil cuts holes to paint through, with bridges so nothing falls out.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "cutout", text: "Cut out" }, { v: "stencil", text: "Stencil" }],
      },
      { kind: "number", key: "output.bridge", label: "Bridges", unit: "%", min: 5, max: 45, step: 1, show: outputs("stencil"), help: "Strip of material left between rows of the stencil, as a share of a module; wider bridges are sturdier but leave lines in the paint." },
    ],
  },
  {
    id: "plate", title: "Plate", open: false,
    help: "The plate around the code: shape, border, corners and an optional frame.",
    fields: [
      {
        kind: "choice", key: "plate.shape", shuffle: true, label: "Plate shape", rail: true, show: (p) => p.stand.kind !== "tent",
        help: "The outline round the code, label and picture: a rectangle, a circle (coasters, badges), sign shapes such as an arch or a speech bubble, a dog bone for pet tags, or a plant marker on a stake.",
        options: PLATE_SHAPES.map((v) => ({ v, text: PLATE_NAMES[v] })),
      },
      { kind: "number", key: "plate.stake", label: "Stake length", unit: "mm", min: 30, max: 250, step: 5, show: (p) => p.plate.shape === "stake", help: "How far the pointed stake reaches below the plate, into the soil." },
      { kind: "number", key: "plate.padding", label: "Border", unit: "mm", min: 0, max: 60, step: 0.5, help: "Plate border outside the quiet zone and label." },
      { kind: "number", key: "plate.corner", label: "Corner radius", unit: "mm", min: 0, max: 50, step: 0.5, show: (p) => CORNERED.includes(p.plate.shape) || p.stand.kind === "tent", help: "Rounds the plate's corners." },
      { kind: "toggle", key: "plate.frame", shuffle: true, label: "Frame", show: (p) => p.output.kind !== "stencil", help: "A thin line around the plate, in its border." },
      { kind: "number", key: "plate.frameWidth", label: "Frame width", unit: "mm", min: 0.3, max: 5, step: 0.1, show: (p) => p.plate.frame && p.output.kind !== "stencil", help: "Width of the frame line." },
      {
        kind: "choice", key: "plate.frameStyle", shuffle: true, label: "Frame style", show: (p) => p.plate.frame && p.output.kind !== "stencil",
        help: "A line all the way round, or only the four corners, like a scanner's viewfinder.", options: [{ v: "line", text: "Full line" }, { v: "corners", text: "Corners" }],
      },
    ],
  },
  {
    id: "label", title: "Label", open: false,
    help: "Text next to the code, such as “Scan for the menu” or a name.",
    fields: [
      { kind: "text", key: "label.text", label: "Label", multiline: true, maxLength: 120, placeholder: "e.g. Scan for the menu", help: "Text below, above or beside the code; each line is centred (left-aligned beside it)." },
      {
        kind: "choice", key: "label.position", label: "Position", show: (p) => !!p.label.text.trim(),
        help: "Where the label sits.", options: [{ v: "below", text: "Below" }, { v: "above", text: "Above" }, { v: "right", text: "Beside" }],
      },
      { kind: "font", key: "label.fontId", shuffle: true, label: "Font", show: (p) => !!p.label.text.trim() || p.logo.kind === "text", sample: (p) => `${p.label.text}${p.logo.kind === "text" ? p.logo.text : ""}` || "Aa", help: "Typeface of the label and a text logo (the same fonts as Letters)." },
      { kind: "number", key: "label.size", label: "Text height", unit: "mm", min: 2, max: 40, step: 0.5, show: (p) => !!p.label.text.trim(), help: "Cap height of the label." },
      {
        kind: "choice", key: "label.style", shuffle: true, label: "Label style", show: (p) => !!p.label.text.trim() && p.output.kind === "engrave",
        help: "Plain engraved text, or a solid engraved bar with the text left bare, like a “Scan me” banner.", options: [{ v: "plain", text: "Plain" }, { v: "bar", text: "Bar" }],
      },
      letterMarkField<QrParams>("label.mark", "Label mark", (p) => !!p.label.text.trim() && p.output.kind === "engrave" && p.label.style === "plain"),
    ],
  },
  {
    id: "logo", title: "Centre logo", open: false,
    help: "A small picture or initials in the middle of the code; error correction rebuilds the modules it covers.",
    fields: [
      {
        kind: "choice", key: "logo.kind", label: "Logo",
        help: "No logo, a heart, a star, the Wi-Fi sign, or up to four letters.",
        options: [{ v: "none", text: "None" }, { v: "heart", text: "Heart" }, { v: "star", text: "Star" }, { v: "wifi", text: "Wi-Fi" }, { v: "text", text: "Letters" }],
      },
      { kind: "number", key: "logo.size", label: "Logo size", unit: "%", min: 5, max: 40, step: 1, show: (p) => p.logo.kind !== "none", help: "Width of the cleared square as a share of the code; keep it small at level M." },
      { kind: "text", key: "logo.text", label: "Letters", maxLength: 4, show: (p) => p.logo.kind === "text", help: "Initials or a short word in the middle of the code." },
    ],
  },
  {
    id: "badge", title: "Header picture", open: false,
    help: "A picture above the code that says what it is for, like the icons on shop-counter and table signs.",
    fields: [
      {
        kind: "choice", key: "badge.kind", label: "Picture", rail: true, shuffle: true,
        help: "Five stars for a review sign, a menu or coffee cup for tables, Wi-Fi, a camera for photo sharing and social pages, a map pin, a payment card, the contactless tap waves (stick an NFC tag behind it), a chat bubble, a phone or a calendar.",
        options: BADGE_KINDS.map((v) => ({ v, text: BADGE_NAMES[v] })),
      },
      { kind: "number", key: "badge.size", label: "Picture height", unit: "mm", min: 4, max: 80, step: 0.5, show: (p) => p.badge.kind !== "none", help: "Height of the picture; five stars are about five times as wide as they are tall." },
    ],
  },
  {
    id: "stand", title: "Stand or mount", open: false, show: (p) => p.output.kind !== "stencil",
    help: "How the sign stands on a counter or table, or hangs on a wall.",
    fields: [
      {
        kind: "choice", key: "stand.kind", label: "Stand", rail: true, show: (p) => p.output.kind !== "stencil",
        help: "Flat; standing upright in a slotted base; leaning back on two slotted feet; a tent card folded on a living hinge with the code on both sides (engraved only); or holes to screw it to a wall or mount it on standoffs.",
        options: [
          { v: "none", text: "Flat" }, { v: "base", text: "Base" }, { v: "feet", text: "Feet" },
          { v: "tent", text: "Tent", title: "Engraved plates" }, { v: "wall", text: "Wall" },
        ],
      },
      { kind: "number", key: "stand.depth", label: "Depth", unit: "mm", min: 25, max: 200, step: 1, show: (p) => p.stand.kind === "base" || p.stand.kind === "feet", help: "Front-to-back depth of the base or feet; keep it at least a third of the sign's height so it does not tip." },
      { kind: "number", key: "stand.layers", label: "Base layers", unit: "", min: 1, max: 3, step: 1, int: true, show: (p) => p.stand.kind === "base", help: "Layers glued into the base. With two or more the bottom one is solid, so the tabs sit in pockets and the base is heavier." },
      { kind: "number", key: "stand.lean", label: "Lean", unit: "deg", min: 0, max: 25, step: 1, show: (p) => p.stand.kind === "feet", help: "How far the sign leans back in its feet; 10 to 15° faces a person sitting at a table." },
      { kind: "number", key: "stand.band", label: "Hinge band", unit: "mm", min: 8, max: 60, step: 1, show: (p) => p.stand.kind === "tent", help: "Height of the living hinge between the two faces; a wider band bends more gently." },
      { kind: "choice", key: "stand.holes", label: "Holes", show: (p) => p.stand.kind === "wall", help: "Two holes along the top to hang it, or four corner holes for standoffs.", options: [{ v: "two", text: "Two at the top" }, { v: "four", text: "Four corners" }] },
      { kind: "number", key: "stand.holeD", label: "Hole diameter", unit: "mm", min: 2, max: 12, step: 0.5, show: (p) => p.stand.kind === "wall", help: "Small screws need about 4 mm; most sign standoffs need 5 to 6 mm." },
    ],
  },
  {
    id: "keyring", title: "Keyring hole", open: false, show: (p) => p.stand.kind !== "tent",
    help: "A hole to hang the plate on a keyring or hook.",
    fields: [
      { kind: "choice", key: "keyring.kind", label: "Hole", show: (p) => p.stand.kind !== "tent", help: "No hole, a rounded tab on top, or a hole in the top-left corner (on a rectangle it sits in a rounded ear).", options: [{ v: "none", text: "None" }, { v: "top", text: "Tab on top" }, { v: "corner", text: "Corner" }] },
      { kind: "number", key: "keyring.diameter", label: "Hole diameter", unit: "mm", min: 2, max: 12, step: 0.5, show: (p) => p.keyring.kind !== "none", help: "Diameter of the hole; 4 to 5 mm fits a split ring." },
    ],
  },
];

const sample = qrMatrix("HL", "L")!;

/** Rail pictures: content icons, and the module styles and outputs drawn with the real geometry. */
function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "code.eyeFrame" || key === "code.eyeBall") {
    const f = (key === "code.eyeFrame" ? (v === "auto" ? "square" : v) : "square") as Exclude<EyeFrame, "auto">;
    const b = (key === "code.eyeBall" ? (v === "auto" ? "square" : v) : "square") as Exclude<EyeBall, "auto">;
    const cs = shapeContours(unionShapes(eyeContours(0, 0, 6, f, b), [], false, true));
    return [{ d: fitArt([rect(-3, -3, 48, 48), ...cs], 36).slice(1).join(" "), fill: true }];
  }
  if (key === "badge.kind") {
    if (v === "none") return [{ d: fitArt([[[-12, -12], [12, 12]], [[12, -12], [-12, 12]]], 18, [true, true]).join(" ") }];
    const cs = badgeContours(v as BadgeKind, 30);
    return [{ d: fitArt(cs, v === "stars" ? 40 : 32).join(" "), fill: true }];
  }
  if (key === "plate.shape") {
    const o = plateOutline(v as PlateShape, 30, 30, 4, 4, 40).outline;
    return [{ d: fitArt([o], 36).join(" ") }];
  }
  if (key === "stand.kind") return standArt(v);
  if (key === "code.style") {
    const cs = shapeContours(moduleShapes((r, c) => sample.dark[r][c], sample.n, 2, v as ModuleStyle, 85));
    return [{ d: fitArt([rect(0, 0, 42, 42), ...cs], 38).slice(1).join(" "), fill: true }];
  }
  if (key === "output.kind") {
    const on = (r: number, c: number) => sample.dark[r][c];
    if (v === "engrave") {
      const [b, ...m] = fitArt([roundedRect(-4, -4, 50, 50, 4), ...shapeContours(moduleShapes(on, sample.n, 2, "square", 85))], 38);
      return [{ d: b, fill: true }, { d: m.join(" "), fill: true }];
    }
    if (v === "cutout") {
      const [b, t, ...m] = fitArt([roundedRect(0, 0, 50, 50, 4), roundedRect(-4, -4, 50, 50, 4), ...shapeContours(moduleShapes(on, sample.n, 2, "square", 85)).map((c) => c.map(([x, y]) => [x - 2, y - 2] as [number, number]))], 38);
      return [{ d: b, fill: true }, { d: t }, { d: m.join(" ") }];
    }
    const [b, ...m] = fitArt([roundedRect(-4, -4, 50, 50, 4), ...stencilHoles(on, sample.n, 2, "square", 85, 0.6)], 38);
    return [{ d: b }, { d: m.join(" ") }];
  }
  if (key === "content.kind") {
    const icon: Record<string, { cs: Contour[]; open?: boolean[] }> = {
      url: { cs: [circle(0, 0, 18), ellipse(0, 0, 8, 18), [[-18, 0], [18, 0]], [[-15, -9], [15, -9]], [[-15, 9], [15, 9]]], open: [false, false, true, true, true] },
      text: { cs: [rect(-16, -18, 32, 36), [[-10, -9], [10, -9]], [[-10, 0], [10, 0]], [[-10, 9], [4, 9]]], open: [false, true, true, true] },
      wifi: { cs: [circle(0, 10, 3), arc(0, 12, 12, deg(-135), deg(-45)), arc(0, 12, 22, deg(-135), deg(-45))], open: [false, true, true] },
      vcard: { cs: [roundedRect(-22, -15, 44, 30, 3), circle(-10, -3, 5), [[-17, 9], [-3, 9]], [[3, -6], [16, -6]], [[3, 1], [16, 1]], [[3, 8], [12, 8]]], open: [false, false, true, true, true, true] },
      email: { cs: [rect(-22, -14, 44, 28), [[-22, -14], [0, 3], [22, -14]]], open: [false, true] },
      sms: { cs: [[[-20, -15], [20, -15], [20, 9], [-6, 9], [-14, 17], [-12, 9], [-20, 9]], circle(-9, -3, 2.2), circle(0, -3, 2.2), circle(9, -3, 2.2)] },
      whatsapp: { cs: [circle(0, -2, 18), [[-14, 9], [-19, 19], [-7, 15]], arc(0, -2, 9, deg(140), deg(250))], open: [false, false, true] },
      map: { cs: [[[0, 20], ...arc(0, -6, 14, deg(150), deg(390))], circle(0, -6, 5)] },
      event: { cs: [roundedRect(-18, -14, 36, 32, 3), [[-18, -5], [18, -5]], [[-9, -19], [-9, -10]], [[9, -19], [9, -10]], rect(-12, 1, 6, 5), rect(-3, 1, 6, 5), rect(6, 1, 6, 5), rect(-12, 9, 6, 5)], open: [false, true, true, true] },
      phone: { cs: [roundedRect(-11, -20, 22, 40, 4), stadium(-4, -15, 4, -15, 2), circle(0, 14, 2.5)] },
    };
    const it = icon[v];
    if (!it) return [];
    return fitArt(it.cs, 34, it.open).map((d) => ({ d }));
  }
  return [];
}

/** Stand pictures: the sign seen from the side (or flat, or on a wall). */
function standArt(v: string): { d: string; fill?: boolean }[] {
  const sign = (x: number, lean: number): Contour => { const a = (lean * Math.PI) / 180; return [[x, 30], [x + 3, 30], [x + 3 - 34 * Math.sin(a), 30 - 34 * Math.cos(a)], [x - 34 * Math.sin(a), 30 - 34 * Math.cos(a)]]; };
  const line: Contour = [[-24, 31.5], [24, 31.5]];
  const shapes: Record<string, { cs: Contour[]; open?: boolean[] }> = {
    none: { cs: [rect(-22, 22, 44, 6), line], open: [false, true] },
    base: { cs: [sign(-1.5, 0), roundedRect(-16, 24, 32, 6, 1.5), line], open: [false, false, true] },
    feet: { cs: [sign(2, 12), roundedRect(-14, 23, 28, 7, 3), line], open: [false, false, true] },
    tent: { cs: [[[-16, 30], [0, -4], [16, 30]], line], open: [true, true] },
    wall: { cs: [rect(-20, -16, 4, 48), roundedRect(-14, -8, 26, 30, 2), circle(-1, -3, 1.6), circle(-1, 17, 1.6)] },
  };
  const it = shapes[v];
  return it ? fitArt(it.cs, 34, it.open).map((d) => ({ d })) : [];
}

function scaleQr(p: QrParams, s: number): QrParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    code: { ...p.code, size: k(p.code.size) },
    plate: { ...p.plate, padding: k(p.plate.padding), corner: k(p.plate.corner), stake: k(p.plate.stake) },
    label: { ...p.label, size: Math.max(2, k(p.label.size)) },
    badge: { ...p.badge, size: Math.max(3, k(p.badge.size)) },
    stand: { ...p.stand, depth: Math.max(25, k(p.stand.depth)) },
  };
}

const QR_BASE: GeneratorDef<QrParams> = {
  id: "qr",
  name: "QR Code",
  version: 1,
  defaults: () => mergeQr({}),
  merge: mergeQr,
  sections,
  presets: QR_PRESETS,
  build: buildQr,
  check: (p, out) => checkQr(p, out as QrOutput),
  fonts: (p) => (p.label.text.trim() || (p.logo.kind === "text" && p.logo.text.trim()) ? [p.label.fontId] : []),
  scale: scaleQr,
  art,
  batch: (p) => (p.content.kind === "url" ? "content.url" : p.content.kind === "text" ? "content.text" : null),
  fileName: (p) => namedFile("qr", p.name, `${Math.round(p.code.size)}mm`),
  summary: (p) => `${CONTENT_NAMES[p.content.kind]}, ${p.code.size} mm, ${OUTPUT_NAMES[p.output.kind]}`,
  help: {
    intro: [
      "The QR Code generator makes scannable plates and signs: keychains, pet tags, plant markers, table and counter signs, tent cards, coasters, Wi-Fi cards, business cards and paint stencils. It encodes web addresses, text, Wi-Fi logins, contact cards, emails, text messages, phone numbers, WhatsApp chats, map locations and calendar events in the standard formats phones understand.",
      "Style the code the way online QR designers do: eight module styles, and the corner eyes' frame and centre in their own shapes. Add a header picture (review stars, a menu, Wi-Fi, a camera, a map pin, a payment card, the contactless tap sign…), a label, a centre logo and a frame, on a plate shaped as a rectangle, circle, arch, hexagon, shield, speech bubble, dog bone or plant stake.",
      "Stand it up: tabs into a slotted base, two feet with slots that lean it back toward the reader, a tent card folded on a living hinge with the code on both sides, or holes for screws and standoffs. Choose how it is made: engraved; cut through a light top plate over a dark backplate; or cut as a stencil with bridges, so no part falls out.",
      "Every design is checked: module size for the output, the clear space around the code, the size of a centre logo against the error correction, stencil bridges, holes near the code and stands that would tip over.",
    ],
    tips: [
      "On an engraved plate a plain label can be scored instead (Label mark); a bar label stays engraved, because its text is knocked out of the bar.",
      "Scan the screen before you cut: hold a phone up to the canvas; if it reads there, the plate will read too.",
      "Contrast matters more than size: engrave dark and even, or use a black backplate under a light top plate. Two-colour acrylic (a light skin over a dark core) gives the sharpest engraved codes.",
      "Keep modules at least 0.6 mm for engraving and 1.2 mm for cut-outs; a shorter web address makes fewer, larger modules.",
      "A centre logo needs error correction Q or H, and keep it under about a fifth of the code's width.",
      "Mask wood before engraving a code: it keeps the light modules clean of smoke, which phones read as dark.",
      "For a counter sign, a 50 to 70 mm code reads from an arm's length; for a wall sign, make the code about a tenth of the distance people scan from.",
      "With the Tap picture, stick an NFC tag behind it and write the same link to it, so phones can tap as well as scan.",
      "For a stencil, spray light coats straight down and lift it straight up; the thin lines left by the bridges do not stop phones reading the code.",
    ],
    keywords: ["qr", "qr code", "wifi", "vcard", "business card", "keychain", "stencil", "menu", "review sign", "table tent", "counter sign", "stand", "pet tag", "plant marker", "nfc", "whatsapp", "payment sign"],
  },
};

export { QR_DEFAULTS };

/** The generator with the cut-out pattern (lib/generators/pattern.ts). */
export const QR: GeneratorDef<QrParams> = withPattern(QR_BASE, [
  { v: "plate", text: "Plate", match: byId("plate", "top") },
  { v: "back", text: "Backplate", match: byId("back") },
], {
  help: "A decorative pattern in the plate's border, round the code: on the plate, or on a layered plate's top or backplate (showing through the top's openings). The code and its quiet zone stay solid, so it still scans; widen the border for more room.",
  keep: (_p, part) => CODE_AREA.get(part) ?? [],
});
