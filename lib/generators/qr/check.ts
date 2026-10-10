import type { Issue } from "@/lib/issues";
import { logoCells, type QrOutput } from "./build";
import { qrMatrix } from "./encode";
import { LOGO_MAX, type QrParams } from "./params";

/** Smallest module that still scans, mm, for each output. */
export const MIN_MODULE = { engrave: 0.6, cutout: 1.2, stencil: 1.5 } as const;
/** Narrowest stencil bridge that survives handling, mm. */
export const MIN_BRIDGE = 0.5;

export function checkQr(p: QrParams, out: QrOutput): Issue<QrParams>[] {
  const issues: Issue<QrParams>[] = [];
  const info = out.info;
  if (!info) return issues;
  const kind = p.output.kind;

  const minM = MIN_MODULE[kind];
  if (info.module < minM) {
    const size = Math.ceil(minM * 1.1 * info.n);
    issues.push({
      code: "SMALL_MODULES", level: "warn",
      message: `Modules are ${info.module.toFixed(2)} mm; ${kind === "engrave" ? "engraved" : kind === "cutout" ? "cut-out" : "stencil"} codes need ${minM} mm or more to scan reliably.`,
      fixes: [
        { id: "bigger", label: `Code size ${size} mm`, safe: true, apply: (q) => ({ ...q, code: { ...q.code, size } }) },
        ...(p.code.ecc !== "L" && p.logo.kind === "none" ? [{ id: "ecc-l", label: "Error correction L (fewer modules)", safe: false, apply: (q: QrParams) => ({ ...q, code: { ...q.code, ecc: "L" as const } }) }] : []),
      ],
    });
  }

  if (p.logo.kind !== "none" && info.logoShare > LOGO_MAX[p.code.ecc]) {
    const hN = p.code.ecc === "H" ? 0 : qrMatrix(info.payload, "H")?.n ?? 0;
    const toH = hN > 0 && logoCells(hN, p.logo.size) / (hN * hN) <= LOGO_MAX.H;
    let size = 0;
    if (p.code.ecc !== "L") for (let s = Math.floor(p.logo.size) - 1; s >= 5 && !size; s--) if (logoCells(info.n, s) / (info.n * info.n) <= LOGO_MAX[p.code.ecc]) size = s;
    issues.push({
      code: "LOGO_TOO_BIG", level: "error",
      message: p.code.ecc === "L"
        ? "A centre logo needs error correction M or higher; at L the code will not scan."
        : `The logo hides ${Math.round(info.logoShare * 100)} % of the code; at level ${p.code.ecc} keep it under ${Math.round(LOGO_MAX[p.code.ecc] * 100)} %.`,
      fixes: [
        ...(toH ? [{ id: "ecc-h", label: "Error correction H", safe: true, apply: (q: QrParams) => ({ ...q, code: { ...q.code, ecc: "H" as const } }) }] : []),
        ...(size ? [{ id: "smaller", label: `Logo size ${size} %`, safe: !toH, apply: (q: QrParams) => ({ ...q, logo: { ...q.logo, size } }) }] : []),
        { id: "no-logo", label: "No logo", safe: false, apply: (q) => ({ ...q, logo: { ...q.logo, kind: "none" as const } }) },
      ],
    });
  }

  if (info.margin < 2 * info.module - 1e-6) {
    issues.push({
      code: "QUIET_ZONE", level: "warn",
      message: `Only ${info.margin.toFixed(1)} mm of clear space around the code; scanners want at least two modules (${(2 * info.module).toFixed(1)} mm).`,
      fixes: [{ id: "quiet", label: "Quiet zone 2 modules", safe: true, apply: (q) => ({ ...q, code: { ...q.code, quiet: Math.max(2, q.code.quiet) } }) }],
    });
  }

  if (kind === "stencil" && info.bridge < MIN_BRIDGE) {
    const bridge = Math.min(45, Math.ceil(((MIN_BRIDGE * 1.2) / info.module) * 100));
    issues.push({
      code: "THIN_BRIDGE", level: "warn",
      message: `Bridges are ${info.bridge.toFixed(2)} mm and will tear; keep them at least ${MIN_BRIDGE} mm.`,
      fixes: bridge <= 45 ? [{ id: "bridge", label: `Bridges ${bridge} %`, safe: true, apply: (q) => ({ ...q, output: { ...q.output, bridge } }) }] : [],
    });
  }

  if (kind === "stencil" && info.counters > 0) {
    issues.push({
      code: "STENCIL_COUNTERS", level: "warn",
      message: `${info.counters} letter centre${info.counters === 1 ? "" : "s"} (as in O or A) will fall out of the stencil.`,
      fixes: [
        ...(p.label.text.trim() ? [{ id: "no-label", label: "Remove the label", safe: false, apply: (q: QrParams) => ({ ...q, label: { ...q.label, text: "" } }) }] : []),
        ...(p.logo.kind === "text" ? [{ id: "heart", label: "Heart logo instead", safe: false, apply: (q: QrParams) => ({ ...q, logo: { ...q.logo, kind: "heart" as const } }) }] : []),
      ],
    });
  }

  if (kind === "cutout" && info.islands > 0) {
    issues.push({
      code: "LOOSE_PIECES", level: "info",
      message: `${info.islands} light piece${info.islands === 1 ? "" : "s"} come loose from the top plate; lift it with transfer tape and glue them in place.`,
      fixes: [],
    });
  }

  if (p.plate.frame && kind !== "stencil" && p.plate.padding < p.plate.frameWidth + 2) {
    const padding = Math.ceil(p.plate.frameWidth + 3);
    issues.push({
      code: "FRAME_TIGHT", level: "warn",
      message: "The frame is squeezed against the code; give the plate a wider border.",
      fixes: [{ id: "padding", label: `Border ${padding} mm`, safe: true, apply: (q) => ({ ...q, plate: { ...q.plate, padding } }) }],
    });
  }

  if (info.holeInQuiet) {
    const padding = Math.ceil(p.keyring.diameter + 3);
    issues.push({
      code: "HOLE_IN_QUIET_ZONE", level: "warn",
      message: "The keyring hole cuts into the clear space around the code.",
      fixes: [
        { id: "padding", label: `Border ${padding} mm`, safe: true, apply: (q) => ({ ...q, plate: { ...q.plate, padding } }) },
        { id: "top", label: "Hole on a tab above", safe: false, apply: (q) => ({ ...q, keyring: { ...q.keyring, kind: "top" as const } }) },
      ],
    });
  }

  if (p.content.kind === "wifi" && p.content.security !== "nopass" && !p.content.password) {
    issues.push({ code: "NO_PASSWORD", level: "warn", message: "The Wi-Fi network has no password; phones will fail to join unless it is an open network.", fixes: [{ id: "open", label: "Open network", safe: false, apply: (q) => ({ ...q, content: { ...q.content, security: "nopass" as const } }) }] });
  }

  if (out.missing?.length) {
    const persian = out.missing.some((c) => /[\u0600-\u06FF]/.test(c));
    const font = persian ? "vazirmatn" : "fredoka";
    issues.push({
      code: "MISSING_GLYPHS", level: "error",
      message: `The font has no ${out.missing.map((c) => `“${c}”`).join(" ")}.`,
      fixes: p.label.fontId === font ? [] : [{ id: "font", label: `Use ${persian ? "Vazirmatn" : "Fredoka"}`, safe: true, apply: (q) => ({ ...q, label: { ...q.label, fontId: font } }) }],
    });
  }
  return issues;
}
