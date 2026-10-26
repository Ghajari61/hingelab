import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { ShadowBoxOutput } from "./build";
import { MIN_WALL } from "./enclosure";
import type { ShadowBoxParams } from "./params";

/** Below this share of the window, the layers hide most of the photo (%). */
const PHOTO_MIN_SHOWN = 25;
/** Below this, a printed photo looks soft. */
const PHOTO_MIN_DPI = 150;
/** Thinnest board finger-jointed walls and feet hold in, mm. */
const MIN_BOX_T = 2;

export function checkShadowBox(p: ShadowBoxParams, out: ShadowBoxOutput): Issue<ShadowBoxParams>[] {
  const issues: Issue<ShadowBoxParams>[] = [];
  const info = out.info;
  if (!info) return issues;
  if (info.missingMounts) issues.push({ code: "MOUNTING_HOLES", level: "error", message: `${info.missingMounts} mounting holes could not fit fully inside their parts. Widen the shared border or spacer frames, reduce hole diameters, or disable the affected mounting option before cutting.`, fixes: [] });
  if (p.light.on && p.light.cable > p.light.depth) issues.push({ code: "CABLE_DEPTH", level: "info", message: "The light cavity was made deeper to fit the cable diameter. The depth and ring count include this allowance.", fixes: [] });
  if (info.noWindow) {
    const border = Math.max(5, Math.floor(Math.min(p.frame.width, p.frame.height) / 6));
    issues.push({ code: "NO_WINDOW", level: "error", message: "The frame's border leaves no window for the pattern.", fixes: [{ id: "border", label: `Border ${border} mm`, safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border } }) }] });
    return issues;
  }
  if (p.frame.border < 5) {
    issues.push({ code: "THIN_BORDER", level: "warn", message: "A frame border under 5 mm is fragile and leaves little room for glue or foam tape.", fixes: [{ id: "border", label: "Border 10 mm", safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border: 10 } }) }] });
  }
  if (p.design.web < 1) {
    issues.push({ code: "THIN_WEB", level: "warn", message: "Paper bridges under 1 mm tear when you weed the cut, or burn through on a laser.", fixes: [{ id: "web", label: "Bridges 1.5 mm", safe: true, apply: (q) => ({ ...q, design: { ...q.design, web: 1.5 } }) }] });
  }
  if (info.open > 1) {
    const max = Math.max(p.design.min + 10, Math.round(p.design.max * 0.85));
    issues.push({
      code: "OPEN_LAYERS", level: "info",
      message: `${info.open} layers are only the frame: their cut-outs fill the whole window.`,
      fixes: [{ id: "smaller", label: `Front cut-out ${max}%`, safe: false, apply: (q) => ({ ...q, design: { ...q.design, max } }) }],
    });
  }
  issues.push(...missingGlyphs<ShadowBoxParams>(out.missing, p.text.fontId, (q, fontId) => ({ ...q, text: { ...q.text, fontId } })));
  const fitted = info.textSize;
  if (fitted !== undefined && fitted < p.text.size - 0.5) {
    const middle = p.text.place !== "middle" ? [{ id: "middle", label: "Words in the middle", safe: true, apply: (q: ShadowBoxParams) => ({ ...q, text: { ...q.text, place: "middle" as const } }) }] : [];
    issues.push(fitted < 10
      ? { code: "TEXT_SMALL", level: "warn", message: `The words only fit the window at ${fitted} mm: letters that small tear easily in paper. Use fewer words or a wider frame.`, fixes: middle }
      : { code: "TEXT_FIT", level: "info", message: `The words were set at ${fitted} mm instead of ${p.text.size} mm to fit the window.`, fixes: [] });
  }
  if (info.photoShown !== undefined && info.photoShown < PHOTO_MIN_SHOWN) {
    const min = Math.max(p.design.min, 80), max = Math.max(p.design.max, min + 30);
    issues.push({
      code: "PHOTO_HIDDEN", level: "info",
      message: `Only about ${info.photoShown}% of the photo shows through the layers in front of it.`,
      fixes: p.design.min < 80 ? [{ id: "open", label: max > p.design.max ? `Cut-outs ${min}–${max}%` : `Back cut-out ${min}%`, safe: false, apply: (q) => ({ ...q, design: { ...q.design, min, max } }) }] : [],
    });
  }
  if (info.photoDpi) {
    if (p.photo.look === "engrave" && info.photoDpi < Number(p.photo.dpi) * 0.9) {
      issues.push({ code: "PHOTO_DOTS", level: "info", message: `At this zoom the engraving dots come out at about ${info.photoDpi} dpi instead of ${p.photo.dpi}. Choose the dot spacing again to remake the engraving for this zoom, or zoom out.`, fixes: [] });
    } else if (p.photo.look !== "engrave" && p.photo.mount === "board" && info.photoDpi < PHOTO_MIN_DPI) {
      issues.push({ code: "PHOTO_SOFT", level: "info", message: `The photo in the SVG is about ${info.photoDpi} dpi at this size and may print soft. Print photo makes the print from the original on this device, at up to 300 dpi.`, fixes: [] });
    }
  }
  if (info.dropped > 0) {
    const how = (loose: ShadowBoxParams["design"]["loose"]) => (q: ShadowBoxParams) => ({ ...q, design: { ...q.design, loose } });
    issues.push({
      code: "LOOSE", level: "info",
      message: `${info.dropped} loose piece${info.dropped > 1 ? "s" : ""} inside the cut-outs ${info.dropped > 1 ? "were" : "was"} left out: nothing held ${info.dropped > 1 ? "them" : "it"} to the frame.`,
      fixes: p.design.loose === "drop"
        ? [{ id: "bridge", label: "Hold them with bridges", safe: false, apply: how("bridge") }, { id: "parts", label: "Cut them as parts", safe: false, apply: how("parts") }]
        : [],
    });
  }
  const solidBack = (p.stack.back && !p.design.moon) || !!p.photo.image;
  if (p.light.on && solidBack) {
    issues.push({
      code: "LIGHT_BLOCKED", level: "warn",
      message: p.photo.image
        ? "The photo's back board is solid, so the light box behind it only glows through the paper of the photo."
        : "The back layer is a whole board, so the light box behind it cannot shine through the pattern.",
      fixes: p.photo.image ? [] : [
        { id: "pattern", label: "Make the back layer a pattern layer", safe: false, apply: (q) => ({ ...q, stack: { ...q.stack, back: false } }) },
        { id: "hole", label: "Cut a light hole in it", safe: false, apply: (q) => ({ ...q, design: { ...q.design, moon: true } }) },
      ],
    });
  }
  const holes = [p.box.pins ? p.box.pin : 0, p.box.back === "screwed" ? p.box.screw : 0];
  const needBand = Math.max(...holes) + 2 * MIN_WALL;
  if (info.band !== undefined && Math.max(...holes) > 0 && info.band < needBand) {
    const border = Math.ceil(Math.max(p.frame.border, needBand));
    const narrow = p.stack.spacer === "frames" && p.stack.spacerW > 0 && p.stack.spacerW < needBand;
    issues.push({
      code: "BAND_TIGHT", level: "warn",
      message: `The border is ${info.band} mm wide where the parts overlap: too narrow for ${Math.max(...holes)} mm holes with ${MIN_WALL} mm of material round them.`,
      fixes: [{ id: "wider", label: narrow ? `Spacer frames ${Math.ceil(needBand)} mm wide` : `Border ${border} mm`, safe: true, apply: (q) => (narrow ? { ...q, stack: { ...q.stack, spacerW: Math.ceil(needBand) } } : { ...q, frame: { ...q.frame, border } }) }],
    });
  }
  if (info.keyBorder) {
    const border = info.keyBorder;
    issues.push({
      code: "KEYHOLE_ROOM", level: "warn",
      message: `The keyholes need a border at least ${border} mm wide at the top${p.light.on ? "" : ", or a back board with a light box behind it to sit in"}.`,
      fixes: [{ id: "border", label: `Border ${border} mm`, safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border } }) }],
    });
  }
  if ((p.box.walls || p.box.hang === "stand") && p.T < MIN_BOX_T) {
    issues.push({
      code: "BOX_THIN", level: "warn",
      message: `${p.box.walls ? "Finger-jointed walls" : "The feet"} need board at least ${MIN_BOX_T} mm thick to hold; at ${p.T} mm cut ${p.box.walls ? "them" : "the feet"} from thicker board, or leave ${p.box.walls ? "them" : "the feet"} out.`,
      fixes: [{ id: "off", label: p.box.walls ? "No box walls" : "No feet", safe: false, apply: (q) => ({ ...q, box: { ...q.box, ...(p.box.walls ? { walls: false } : { hang: "none" as const }) } }) }],
    });
  }
  if (p.design.pattern === "picture") {
    if (!p.picture.levels) {
      issues.push({ code: "PICTURE_SAMPLE", level: "info", message: "The layers show a sample shape. Add your own picture or SVG in the Picture section; it is traced on this device and never uploaded.", fixes: [] });
    }
    if (p.picture.mode === "levels" && p.picture.levels && !p.picture.levels.includes("|")) {
      issues.push({ code: "PICTURE_ONE_LEVEL", level: "info", message: "Brightness levels need a photo or drawing: an SVG has a single shape, so it grows from layer to layer instead.", fixes: [] });
    }
  }
  return issues;
}
