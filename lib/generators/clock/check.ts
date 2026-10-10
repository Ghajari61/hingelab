/**
 * Clock checks: will it go together with a real quartz movement, will the hands turn freely, will
 * the markers read and the small parts survive the cut. Every issue offers the fix a maker would
 * reach for; the safe ones keep the design what it is.
 */
import type { Fix, Issue } from "@/lib/issues";
import { distToContour } from "../geom";
import type { Contour, GenOutput } from "../types";
import { centreLayers, clockGeometry, handNeck, markerDepth, numeral, type ClockOutput } from "./build";
import { MAX_STANDARD_HAND, MOVEMENTS, MOVEMENT_BOX, type ClockParams } from "./params";

type CIssue = Issue<ClockParams>;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Smallest distance from the centre to the outline. */
const inradius = (c: Contour) => distToContour([0, 0], c);

const withFace = (p: ClockParams, face: Partial<ClockParams["face"]>): ClockParams => ({ ...p, face: { ...p.face, ...face } });
const withMarkers = (p: ClockParams, m: Partial<ClockParams["markers"]>): ClockParams => ({ ...p, markers: { ...p.markers, ...m } });
const withInscription = (p: ClockParams, i: Partial<ClockParams["inscription"]>): ClockParams => ({ ...p, inscription: { ...p.inscription, ...i } });
const withHands = (p: ClockParams, h: Partial<ClockParams["hands"]>): ClockParams => ({ ...p, hands: { ...p.hands, ...h } });

/** Rough widest numeral, in cap heights (Archivo-like proportions). */
function widestNumeral(p: ClockParams): number {
  const hours = p.markers.quarters || p.markers.style === "mixed" ? [0, 3, 6, 9] : [...Array(12).keys()];
  const k = p.markers.numerals === "roman" ? 0.62 : 0.68;
  return Math.max(...hours.map((h) => numeral(p.markers.numerals, h).length)) * k * p.markers.size;
}

export function checkClock(p: ClockParams, out: GenOutput): CIssue[] {
  const issues: CIssue[] = [];
  if (out.error) return issues;
  const g = clockGeometry(p);
  if ("error" in g) return issues;
  const f = p.face, m = p.markers, h = p.hands, mv = p.movement;

  // Thickness at the centre against the movement's thread.
  const thick = centreLayers(p) * p.T;
  if (thick > mv.maxDial) {
    const fixes: Fix<ClockParams>[] = [];
    const longer = MOVEMENTS.find((q) => q.maxDial >= thick);
    if (longer && mv.id !== "custom") fixes.push({ id: "longer-shaft", label: `Use the ${longer.name.toLowerCase()}`, safe: true, apply: (q) => ({ ...q, movement: { ...longer } }) });
    if (f.layers === "stack") fixes.push({ id: "drop-centre", label: "Leave out the centre disc", safe: false, apply: (q) => withFace(q, { layers: "ring" }) });
    issues.push({ code: "DIAL_TOO_THICK", level: "error", message: `The face is ${r1(thick)} mm thick at the centre, but this movement's shaft clamps at most ${mv.maxDial} mm.`, fixes });
  }

  // The movement box must hide behind the face.
  const rIn = inradius(g.outline), box = (MOVEMENT_BOX / 2) * Math.SQRT2 + 2;
  if (rIn < box) {
    const s = box / Math.max(rIn, 1);
    issues.push({
      code: "MOVEMENT_SHOWS", level: "warn",
      message: `The ${MOVEMENT_BOX} mm movement box would stick out past the face; it needs about ${Math.ceil(box * 2)} mm of face across.`,
      fixes: [{ id: "bigger-face", label: `Make the face ${Math.ceil(f.size * s)} mm`, safe: true, apply: (q) => withFace(q, { size: Math.ceil(q.face.size * s) }) }],
    });
  }

  // Markers that cross the inner edge of the ring are cut in half by it.
  if (g.straddle && m.style !== "none") {
    const depth = markerDepth(p);
    issues.push({
      code: "MARKERS_STRADDLE_RING", level: "warn",
      message: "The markers cross the inner edge of the ring, so part of each one is hidden.",
      fixes: [
        { id: "wider-ring", label: `Widen the ring to ${Math.ceil(m.inset + depth + 3)} mm`, safe: true, apply: (q) => withFace(q, { ring: Math.ceil(q.markers.inset + markerDepth(q) + 3) }) },
        { id: "inset-markers", label: "Move the markers inside the ring", safe: false, apply: (q) => withMarkers(q, { inset: Math.ceil(q.face.ring + 3) }) },
      ],
    });
  }

  // Numerals bumping into each other on a small face.
  if ((m.style === "numerals" || m.style === "mixed") && g.outline.length) {
    const r = Math.max(1, rIn - m.inset - m.size * 0.65);
    const step = m.style === "mixed" || m.quarters ? 90 : 30;
    const room = 2 * r * Math.sin((step * Math.PI) / 360) - 3;
    const wide = widestNumeral(p);
    if (wide > room) {
      const size = Math.max(4, Math.floor((m.size * room) / wide));
      issues.push({
        code: "NUMERALS_CROWDED", level: "warn",
        message: "The numerals are too big for the face and run into each other.",
        fixes: [{ id: "smaller-numerals", label: `Make the numerals ${size} mm`, safe: true, apply: (q) => withMarkers(q, { size }) }],
      });
    }
  }

  // Markers that reach the hands' hub.
  if (m.style !== "none" && rIn - m.inset - markerDepth(p) < 24) {
    issues.push({
      code: "MARKERS_CENTRE", level: "warn",
      message: "The markers reach the middle of the face, where the movement's nut and hands sit.",
      fixes: [{ id: "smaller-inset", label: "Move the markers out to the edge", safe: true, apply: (q) => withMarkers(q, { inset: Math.min(q.markers.inset, 6) }) }],
    });
  }

  if (h.style !== "none") {
    const reach = (g.ringInner ? inradius(g.ringInner) : rIn) - 2;
    if (h.minute > reach) {
      const len = Math.max(20, Math.floor(reach - 2));
      issues.push({
        code: "HAND_TOO_LONG", level: "warn",
        message: g.ringInner
          ? "The minute hand reaches over the ring and will catch on it as it turns."
          : "The minute hand reaches past the edge of the face.",
        fixes: [{ id: "shorter-minute", label: `Shorten the minute hand to ${len} mm`, safe: true, apply: (q) => withHands(q, { minute: len, hour: Math.min(q.hands.hour, Math.round(len * 0.7)) }) }],
      });
    }
    if (h.hour >= h.minute) {
      issues.push({
        code: "HOUR_HAND_LONGER", level: "warn",
        message: "The hour hand is as long as the minute hand, so the time is hard to read.",
        fixes: [{ id: "shorter-hour", label: `Make the hour hand ${Math.round(h.minute * 0.7)} mm`, safe: true, apply: (q) => withHands(q, { hour: Math.round(q.hands.minute * 0.7) }) }],
      });
    }
    if (h.minute > MAX_STANDARD_HAND) {
      issues.push({
        code: "HIGH_TORQUE", level: "warn",
        message: `Minute hands longer than ${MAX_STANDARD_HAND} mm need a high-torque movement; a standard one stalls at a quarter past.`,
        fixes: [{ id: "standard-hand", label: `Shorten the minute hand to ${MAX_STANDARD_HAND} mm`, safe: false, apply: (q) => withHands(q, { minute: MAX_STANDARD_HAND, hour: Math.min(q.hands.hour, Math.round(MAX_STANDARD_HAND * 0.7)) }) }],
      });
    }
    const neck = handNeck(h.style, h.width);
    if (neck < 2.5) {
      const width = Math.ceil((2.5 / neck) * h.width * 2) / 2;
      issues.push({
        code: "HAND_TOO_THIN", level: "warn",
        message: `The narrowest part of the hands is ${r1(neck)} mm and may snap when you press them on.`,
        fixes: [{ id: "wider-hands", label: `Make the hands ${width} mm wide`, safe: true, apply: (q) => withHands(q, { width }) }],
      });
    }
  }

  if (!g.keyholeFits) {
    issues.push({
      code: "KEYHOLE_FIT", level: "warn",
      message: "The keyhole does not fit inside the back plate.",
      fixes: [
        { id: "no-hanger", label: "Use the movement's own hanger instead", safe: true, apply: (q) => ({ ...q, hanger: "none" }) },
        { id: "hole-hanger", label: "Use a small hole near the top", safe: false, apply: (q) => ({ ...q, hanger: "hole" }) },
      ],
    });
  } else if (!g.hangerHidden) {
    const single = f.layers === "single";
    issues.push({
      code: "HANGER_SHOWS", level: "info",
      message: single ? "On a single-layer face the hanger shows from the front." : "The ring is too narrow to hide the hanger behind it.",
      fixes: single
        ? [{ id: "ring-layers", label: "Add a back plate (ring layers)", safe: false, apply: (q) => withFace(q, { layers: "ring" }) }]
        : [{ id: "wider-ring", label: "Widen the ring to 26 mm", safe: false, apply: (q) => withFace(q, { ring: Math.max(q.face.ring, 26) }) }],
    });
  }

  if (m.cut && m.style !== "none") {
    if (m.tickWidth < 1.5 && (m.style === "ticks" || m.style === "mixed" || m.minutes)) {
      issues.push({
        code: "TICKS_THIN", level: "warn",
        message: "Cut-through ticks narrower than 1.5 mm burn away or break.",
        fixes: [{ id: "wider-ticks", label: "Make the ticks 1.5 mm wide", safe: true, apply: (q) => withMarkers(q, { tickWidth: 1.5 }) }],
      });
    }
    if (f.layers === "single" && (m.style === "numerals" || m.style === "mixed")) {
      issues.push({
        code: "NUMERAL_ISLANDS", level: "info",
        message: "Cut-through numerals lose their inner pieces (the middle of 0, 4, 6, 8, 9) on a single face.",
        fixes: [{ id: "ring-layers", label: "Add a back plate behind them", safe: false, apply: (q) => withFace(q, { layers: "ring" }) }],
      });
    }
  }

  if (f.layers === "stack" && f.centre < mv.shaft + 20) {
    issues.push({
      code: "CENTRE_SMALL", level: "warn",
      message: "The centre disc is barely wider than the shaft hole.",
      fixes: [{ id: "bigger-centre", label: `Make the centre disc ${Math.ceil(mv.shaft + 30)} mm`, safe: true, apply: (q) => withFace(q, { centre: Math.ceil(q.movement.shaft + 30) }) }],
    });
  }

  // Text on the dial: too long to read round the curve, or squeezed into the middle.
  const ins = (out as ClockOutput).inscription;
  if (ins && p.inscription.text.trim()) {
    if (ins.span > Math.PI) {
      const size = Math.max(3, Math.floor(((p.inscription.size * Math.PI * 0.8) / ins.span) * 2) / 2);
      issues.push({
        code: "INSCRIPTION_LONG", level: "warn",
        message: "The text on the dial wraps more than half way round and gets hard to read.",
        fixes: [{ id: "smaller-text", label: `Make the text ${size} mm`, safe: true, apply: (q) => withInscription(q, { size }) }],
      });
    }
    if (ins.R - ins.size * 0.6 < 30) {
      issues.push({
        code: "INSCRIPTION_CENTRE", level: "warn",
        message: "The text on the dial runs into the middle of the face, where the nut and the hands sit.",
        fixes: [
          ...(p.inscription.gap > 2 ? [{ id: "smaller-gap", label: "Move the text out to the markers", safe: true, apply: (q: ClockParams) => withInscription(q, { gap: 2 }) }] : []),
          { id: "smaller-text", label: `Make the text ${Math.max(3, Math.floor(p.inscription.size * 0.7))} mm`, safe: true, apply: (q) => withInscription(q, { size: Math.max(3, Math.floor(q.inscription.size * 0.7)) }) },
        ],
      });
    }
  }

  if (out.missing?.length) {
    const font = m.numerals === "persian" ? "vazirmatn" : "archivo-black";
    const fixes: Fix<ClockParams>[] = [{ id: "font", label: m.numerals === "persian" ? "Use Vazirmatn" : "Use Archivo Black", safe: true, apply: (q) => withMarkers(q, { fontId: font }) }];
    if (p.inscription.text.trim()) fixes.push({ id: "text-font", label: "Use Vazirmatn for the text on the dial", safe: true, apply: (q) => withInscription(q, { fontId: "vazirmatn" }) });
    issues.push({
      code: "MISSING_GLYPHS", level: "error",
      message: `The font has no glyph for ${out.missing.map((c) => `"${c}"`).join(", ")}.`,
      fixes,
    });
  }
  return issues;
}
