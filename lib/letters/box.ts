/**
 * Letter Box: every letter becomes a closed box, a base and a lid in the letter's shape joined
 * by walls along every outline and counter. Walls are living-hinge strips or flat panels.
 */
import { halfKerf } from "./kerf";
import { bendAnalysis, cutWidth } from "@/lib/hinge";
import { bendLimitOf, bendRadiusOf, cleanCutout, concaveRadiusOf, cornerRadiusOf, cornersKept, hingeParamsOf, minPieceOf, wallHeightOf } from "./defaults";
import { cornerPath, jointedWall, type CorneredPath } from "./corners";
import { facetContour, facetedWall } from "./facets";
import { filletByContour, smoothShapes } from "./fillet";
import { MIN_PIECE_AREA, differenceShapes, dropSpecks, makeShape, offsetShapes, pointInContour, pointInShape, shapeContours, signedArea, unionShapes } from "./polygon";
import { marqueeCenters, marqueeHoles } from "./marquee";
import { fretHoles, type KeepOut } from "@/lib/generators/fretwork";
import { labelPoint } from "./solid";
import { hingeWall } from "./strips";
import type { BoxInfo, BoxLetterStat, Contour, LetterIssue, LetterParams, PanelPart, PartMark, PlatePart, Shape, StripPart, Wall } from "./types";

export interface BoxLetter {
  shape: Shape;
  name: string;
}

export interface BoxResult {
  walls: (StripPart | PanelPart)[];
  plates: PlatePart[];
  box: BoxInfo;
  issues: LetterIssue[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const centroid = (c: Contour) => c.reduce((m, q) => [m[0] + q[0] / c.length, m[1] + q[1] / c.length], [0, 0]) as [number, number];

/** Check the inputs a box needs; returns an error message or null. */
export function boxError(p: LetterParams): string | null {
  const hBody = wallHeightOf(p);
  if (p.K >= p.T) return "Kerf must be between 0 and the material thickness.";
  if (p.wallStyle === "hinge") {
    const hp = hingeParamsOf(p);
    if (p.cutStyle === "slot" && p.slotW < p.K + 0.05) return "Slot width must be at least 0.05 mm wider than the kerf.";
    if (p.pitch <= cutWidth(hp) + 0.3) return p.cutStyle === "slot" ? "Slit spacing is too tight for this slot width. Increase the spacing or narrow the slots." : "Slit spacing is too tight for this kerf. Increase the spacing.";
    if (hBody < 2 * p.bridge + 6) return "The box is too shallow for this bridge size. Increase the depth or reduce the bridge.";
  } else if (hBody < 3 * p.T) {
    return "The box is too shallow. Increase the depth.";
  }
  return null;
}

/**
 * Base, lid and lid lip. `shapes` is the letter's outer wall face; slots and marks are in the
 * same coordinates. Each kerf-compensated piece gets the slots and marks that fall inside it.
 */
function boxPlates(shapes: Shape[], name: string, p: LetterParams, slots: Contour[], marks: PartMark[], lights: Contour[], join: "round" | "miter", issues: LetterIssue[]): PlatePart[] {
  const out: PlatePart[] = [];
  const pattern = { base: cutoutHoles(shapes, p, "base", slots, marks, lights), lid: cutoutHoles(shapes, p, "lid", slots, marks, lights) };
  const patternOf = (label: string) => (label.includes("· base") ? pattern.base : label.includes("· lid") ? pattern.lid : []);
  // marquee light holes go through the face: the lid, or the base of an open box
  const lit = (label: string) => (p.lid === "open" ? label.includes("· base") : label.includes("· lid"));
  const make = (s: Shape, label: string, withSlots: boolean, withMarks: boolean): PlatePart => {
    const lp = labelPoint(s);
    return {
      kind: "plate",
      name: label,
      outer: s.outer,
      holes: [...(lit(label) ? [...s.holes, ...lights.filter(h => pointInShape(centroid(h), s))] : s.holes), ...patternOf(label).filter(h => pointInShape(centroid(h), s))],
      slots: withSlots ? slots.filter(sl => pointInShape(centroid(sl), s)) : [],
      marks: withMarks ? marks.filter(m => pointInShape([m.x, m.y], s)) : [],
      label: { x: lp[0], y: lp[1], size: Math.max(2.5, Math.min(6, Math.sqrt(s.area) / 10)) },
      bbox: s.bbox,
    };
  };
  const series = (pieces: Shape[], label: string, withSlots: boolean, withMarks: boolean) =>
    pieces.forEach((s, k) => out.push(make(s, pieces.length > 1 ? `${label} ${k + 1}` : label, withSlots, withMarks)));

  const rim = Math.max(0, p.baseRim ?? 0);
  const plate = dropSpecks(offsetShapes(shapes, rim + halfKerf(p), join), MIN_PIECE_AREA);
  series(plate, `${name} · base`, true, true);
  if (p.lid === "fixed") series(plate, `${name} · lid`, true, false);
  if (p.lid === "removable") {
    series(plate, `${name} · lid`, false, false);
    const lip = dropSpecks(offsetShapes(shapes, -(p.T + p.lidGap) + halfKerf(p), join), 4);
    if (lip.length) series(lip, `${name} · lid lip`, false, false);
    else issues.push({ lvl: "warn", msg: `“${name}” is too narrow for a lid lip, so the lip was left out.` });
  }
  return out;
}

/**
 * The cut-out pattern for a letter's base or lid (and its lip, which takes the same holes so they
 * stay open): inside the walls (and the lip's edge) by a bar, clear of the tab slots, the labels
 * and the light holes. Kerf-compensated.
 */
function cutoutHoles(shapes: Shape[], p: LetterParams, plate: "base" | "lid", slots: Contour[], marks: PartMark[], lights: Contour[]): Contour[] {
  const c = cleanCutout(p.cutout);
  if (!c || (c.on !== "both" && c.on !== plate) || (plate === "lid" && p.lid === "open")) return [];
  const inset = p.T + (plate === "lid" && p.lid === "removable" ? p.T + p.lidGap : 0) + c.bar + 1;
  const inner = dropSpecks(offsetShapes(shapes, -inset), MIN_PIECE_AREA);
  if (!inner.length) return [];
  const boxOf = (cs: Contour[], pad: number): KeepOut => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of cs) for (const [x, y] of k) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  };
  const keep = [...slots, ...(plate === (p.lid === "open" ? "base" : "lid") ? lights : [])].map((k) => boxOf([k], c.bar));
  for (const m of marks) keep.push({ x0: m.x - 12, y0: m.y - 5, x1: m.x + 12, y1: m.y + 5 });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of inner) { x0 = Math.min(x0, s.bbox.x0); y0 = Math.min(y0, s.bbox.y0); x1 = Math.max(x1, s.bbox.x1); y1 = Math.max(y1, s.bbox.y1); }
  const holes = fretHoles({ kind: c.kind, cell: c.cell, bar: c.bar }, x0, y0, x1, y1, keep, (q) => inner.some((s) => pointInShape(q, s)));
  return p.K > 0 ? holes.flatMap((h) => offsetShapes([makeShape(signedArea(h) < 0 ? [...h].reverse() : h, [])], -halfKerf(p)).map((s) => s.outer)) : holes;
}

/**
 * Counters the rounding filled, because they are too small to bend a hinge wall around, get a
 * flat-panel wall instead: each is cut back into the rounded shape as a faceted hole, the same
 * way Flat panels shape every counter. Returns the shape and those counters' panel centerlines.
 */
function panelCounters(F: Shape, original: Shape, p: LetterParams, name: string, issues: LetterIssue[]) {
  let shape = F;
  const panelHoles: Contour[] = [];
  for (const h of original.holes) {
    const region = unionShapes([h]);
    if (!region.length || !pointInShape(labelPoint(region[0]), shape)) continue;
    const center = smoothShapes(offsetShapes(region, p.T / 2))[0];
    const poly = center ? facetContour(center.outer, p.facetTol, p.panelMin) : [];
    const cut = poly.length >= 3 ? offsetShapes([makeShape(poly, [])], -p.T / 2, "miter") : [];
    const shortSide = poly.some((q, i) => Math.hypot(poly[(i + 1) % poly.length][0] - q[0], poly[(i + 1) % poly.length][1] - q[1]) < 3 * p.T);
    const next = cut.length ? dropSpecks(differenceShapes(shapeContours([shape]), shapeContours(cut)), MIN_PIECE_AREA) : [];
    const holes = (s: Shape[]) => s.reduce((n, x) => n + x.holes.length, 0);
    // two walls back to back need 2T of material between the counter and every other edge
    const webs = dropSpecks(offsetShapes(next, -p.T), MIN_PIECE_AREA);
    if (shortSide || next.length !== 1 || holes(next) !== shape.holes.length + 1 || webs.length !== 1 || holes(webs) !== holes(next)) {
      issues.push({ lvl: "warn", msg: `A counter of “${name}” is too small for a wall, so it was filled. Use a larger size or Flat panels.` });
      continue;
    }
    shape = next[0];
    panelHoles.push(poly);
  }
  if (panelHoles.length) {
    issues.push({ lvl: "info", msg: `${panelHoles.length === 1 ? "A counter" : `${panelHoles.length} counters`} of “${name}” ${panelHoles.length === 1 ? "is" : "are"} too small to bend the hinge around, so ${panelHoles.length === 1 ? "it gets" : "they get"} flat panels.` });
  }
  return { shape, panelHoles };
}

/** Pieces and holes of a shape set, to compare topology. */
const topo = (s: Shape[]) => `${s.length}:${s.reduce((n, x) => n + x.holes.length, 0)}`;

/**
 * A letter whose hinge walls keep its corners: every outline and counter centerline is broken at
 * its corners (lib/letters/corners.ts). Counters too close to the outline (or to each other) for
 * two walls back to back are filled. Null when the letter itself is too thin for walls, so the
 * caller rounds it instead.
 */
function keptCorners(shape: Shape, p: LetterParams) {
  const T = p.T;
  const ok = (s: Shape) => {
    const c = smoothShapes(dropSpecks(offsetShapes([s], -T / 2), MIN_PIECE_AREA));
    const web = dropSpecks(offsetShapes([s], -T), MIN_PIECE_AREA);
    return c.length === 1 && topo(c) === topo([s]) && topo(web) === topo([s]) ? c[0] : null;
  };
  let s = shape, filled = 0;
  let center = ok(s);
  // fill the smallest counters until two walls fit everywhere
  const holes = [...shape.holes].sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)));
  while (!center && holes.length) {
    holes.shift();
    filled++;
    s = makeShape(shape.outer, shape.holes.filter(h => holes.includes(h)), shape.group);
    center = ok(s);
  }
  if (!center) return null;
  const rLimit = bendLimitOf(p), rBend = bendRadiusOf(p), minPiece = minPieceOf(p), tol = Math.max(0.5, p.facetTol);
  // concave corners may cut into the stroke by up to maxThin; where that leaves too little room for
  // the two walls, try again with shallower ones
  for (const maxThin of [T]) {
    const paths: { cp: CorneredPath; hole: boolean }[] = [{ cp: cornerPath(center.outer, rLimit, minPiece, tol, rBend, maxThin), hole: false }];
    for (const h of center.holes) paths.push({ cp: cornerPath(h, rLimit, minPiece, tol, rBend, maxThin), hole: true });
    // the plates follow the new centerlines; any crossing they make shows up as a changed topology
    const plate = dropSpecks(unionShapes(shapeContours(offsetShapes([makeShape(paths[0].cp.pts, paths.slice(1).map(x => x.cp.pts))], T / 2, "miter"))), MIN_PIECE_AREA);
    if (topo(plate) === topo([center]) && topo(dropSpecks(offsetShapes(plate, -T), MIN_PIECE_AREA)) === topo(plate)) return { paths, plate, filled };
  }
  return null;
}

export function letterBoxes(letters: BoxLetter[], p: LetterParams): BoxResult {
  const issues: LetterIssue[] = [];
  const hp = hingeParamsOf(p);
  const hBody = wallHeightOf(p);
  const rMin = bendAnalysis(hp, hBody, 1).rMin;
  const rCorner = cornerRadiusOf(p);
  const topTabs = p.lid === "fixed";
  const hinge = p.wallStyle === "hinge";

  const wallParts: (StripPart | PanelPart)[] = [];
  const plates: PlatePart[] = [];
  const filleted: Shape[] = [];
  const walls: Wall[] = [];
  const stats: BoxLetterStat[] = [];
  let lights = 0;

  const used = new Map<string, number>();
  const unique = (base: string) => {
    const k = (used.get(base) ?? 0) + 1;
    used.set(base, k);
    return k > 1 ? `${base} ${k}` : base;
  };

  for (const L of letters) {
    const kept = hinge && cornersKept(p) ? keptCorners(L.shape, p) : null;
    if (kept) {
      const name = unique(L.name);
      if (kept.filled) issues.push({ lvl: "warn", msg: `${kept.filled === 1 ? "A counter" : `${kept.filled} counters`} of “${name}” ${kept.filled === 1 ? "is" : "are"} too close to the outline for two walls, so ${kept.filled === 1 ? "it was" : "they were"} filled. Use a larger size or a thinner material.` });
      const before = walls.length;
      const slots: Contour[] = [];
      const marks: PartMark[] = [];
      let seamNo = 1, holeNo = 0;
      for (const { cp, hole } of kept.paths) {
        const label = hole ? `hole ${++holeNo}` : "outer";
        if (!cp.joints.length) {
          const w = hingeWall(cp.pts, { letter: name, contour: label, p, hp, hBody, topTabs, rMin, seamNo });
          seamNo += w.seamCount;
          wallParts.push(...w.parts); walls.push(w.wall); slots.push(...w.wall.slots); issues.push(...w.issues);
          continue;
        }
        const w = jointedWall(cp, { letter: name, contour: label, p, hp, hBody, topTabs, rMin, seamNo });
        seamNo += w.seamCount;
        wallParts.push(...w.parts); walls.push(w.wall); slots.push(...w.wall.slots); marks.push(...w.marks); issues.push(...w.issues);
      }
      const plateShapes = kept.plate;
      filleted.push(...plateShapes);
      const lightCenters = p.marquee.enabled ? marqueeCenters(plateShapes, p) : [];
      if (p.marquee.enabled && !lightCenters.length) issues.push({ lvl: "warn", msg: `“${name}” is too narrow for ${r1(p.marquee.holeDia)} mm light holes with a ${r1(p.marquee.margin)} mm margin. Use smaller holes, a smaller margin or a larger size.` });
      lights += lightCenters.length;
      plates.push(...boxPlates(plateShapes, name, p, slots, marks, marqueeHoles(lightCenters, p), "miter", issues));
      const mine = walls.slice(before);
      const curves = mine.flatMap(w => w.zones.filter(z => z.kind === "curve" && !z.splice));
      const rank = { ok: 0, tight: 1, crack: 2 } as const;
      stats.push({
        letter: name,
        perimeter: mine.reduce((s, w) => s + w.length, 0),
        strips: mine.reduce((s, w) => s + w.pieceLengths.length, 0),
        panels: 0,
        zones: curves.length,
        rTight: curves.reduce((r, z) => Math.min(r, z.rTight), Infinity),
        verdict: curves.reduce<BoxLetterStat["verdict"]>((v, z) => (z.verdict && (!v || rank[z.verdict] > rank[v]) ? z.verdict : v), null),
        lights: lightCenters.length,
      });
      continue;
    }
    if (hinge && cornersKept(p)) issues.push({ lvl: "warn", msg: `“${L.name}” has spots too narrow for walls along its corners, so it is rounded instead. Use a larger size, Thicken or a thinner material.` });
    const fr = filletByContour([L.shape], rCorner, hinge ? 2 * p.T : 0, concaveRadiusOf(p));
    if (!fr.shapes.length) {
      issues.push({ lvl: "warn", msg: `“${L.name}” has strokes narrower than twice the corner radius (R ${r1(rCorner)} mm), so a wall cannot follow it and it was left out. Use a larger size, Thicken, a longer slit for a smaller radius, or Flat panels.` });
      continue;
    }
    if (fr.changed) issues.push({ lvl: "warn", msg: `Part of “${L.name}” is too thin or too sharp for a hinge wall with R ${r1(rCorner)} mm corners, so it was rounded off. Use a bolder font, a larger size, Thicken, or a smaller corner radius.` });
    fr.shapes.forEach(rounded => {
      const name = unique(L.name);
      const { shape: F, panelHoles } = hinge ? panelCounters(rounded, L.shape, p, name, issues) : { shape: rounded, panelHoles: [] };
      const centers = smoothShapes(dropSpecks(offsetShapes([F], -p.T / 2), MIN_PIECE_AREA));
      if (!centers.length) {
        issues.push({ lvl: "warn", msg: `“${name}” is too thin for box walls and was left out. Use a larger size or a bolder font.` });
        return;
      }
      if (centers.length > 1 || centers.reduce((n, c) => n + c.holes.length, 0) !== F.holes.length) {
        issues.push({ lvl: "warn", msg: `Some strokes of “${name}” are too thin for box walls, so the walls do not follow the whole letter.` });
      }
      const contours: { c: Contour; label: string; hole: boolean }[] = [];
      let holeNo = 0;
      centers.forEach((c, ci) => {
        contours.push({ c: c.outer, label: centers.length > 1 ? `outer ${ci + 1}` : "outer", hole: false });
        for (const h of c.holes) contours.push({ c: h, label: `hole ${++holeNo}`, hole: true });
      });

      const before = walls.length;
      const slots: Contour[] = [];
      const marks: PartMark[] = [];
      let plateShapes: Shape[];
      if (hinge) {
        // seams and panels share one numbering per letter, so every engraved number is unique
        let seamNo = 1;
        for (const { c, label, hole } of contours) {
          const poly = hole ? panelHoles.find(q => pointInContour(labelPoint(makeShape(q, [])), c)) : undefined;
          if (poly) {
            const fw = facetedWall(Math.sign(signedArea(poly)) === Math.sign(signedArea(c)) ? poly : poly.slice().reverse(), { letter: name, contour: label, p, hBody, topTabs, panelNo: seamNo });
            seamNo += fw.parts.length;
            wallParts.push(...fw.parts);
            walls.push(fw.wall);
            slots.push(...fw.wall.slots);
            marks.push(...fw.marks);
            issues.push(...fw.issues);
            continue;
          }
          const w = hingeWall(c, { letter: name, contour: label, p, hp, hBody, topTabs, rMin, seamNo });
          seamNo += w.seamCount;
          wallParts.push(...w.parts);
          walls.push(w.wall);
          slots.push(...w.wall.slots);
          issues.push(...w.issues);
        }
        plateShapes = [F];
      } else {
        let panelNo = 1;
        const facetShapes: Shape[] = [];
        const facet = (c: Contour) => facetContour(c, p.facetTol, p.panelMin);
        centers.forEach(c => facetShapes.push(makeShape(facet(c.outer), c.holes.map(facet))));
        for (const { c, label } of contours) {
          const fw = facetedWall(facet(c), { letter: name, contour: label, p, hBody, topTabs, panelNo });
          panelNo += fw.parts.length;
          wallParts.push(...fw.parts);
          walls.push(fw.wall);
          slots.push(...fw.wall.slots);
          marks.push(...fw.marks);
          issues.push(...fw.issues);
        }
        plateShapes = dropSpecks(unionShapes(shapeContours(offsetShapes(facetShapes, p.T / 2, "miter"))), MIN_PIECE_AREA);
      }
      filleted.push(...plateShapes);
      const lightCenters = p.marquee.enabled ? marqueeCenters(plateShapes, p) : [];
      if (p.marquee.enabled && !lightCenters.length) {
        issues.push({ lvl: "warn", msg: `“${name}” is too narrow for ${r1(p.marquee.holeDia)} mm light holes with a ${r1(p.marquee.margin)} mm margin. Use smaller holes, a smaller margin or a larger size.` });
      }
      lights += lightCenters.length;
      plates.push(...boxPlates(plateShapes, name, p, slots, marks, marqueeHoles(lightCenters, p), hinge ? "round" : "miter", issues));

      const mine = walls.slice(before);
      const curves = mine.flatMap(w => w.zones.filter(z => z.kind === "curve" && !z.splice));
      const rank = { ok: 0, tight: 1, crack: 2 } as const;
      const worst = curves.reduce<BoxLetterStat["verdict"]>((v, z) => (z.verdict && (!v || rank[z.verdict] > rank[v]) ? z.verdict : v), null);
      stats.push({
        letter: name,
        perimeter: mine.reduce((s, w) => s + w.length, 0),
        strips: mine.reduce((s, w) => s + (w.style === "hinge" ? w.pieceLengths.length : 0), 0),
        panels: mine.reduce((s, w) => s + (w.style === "faceted" ? w.pieceLengths.length : 0), 0),
        zones: curves.length,
        rTight: curves.reduce((r, z) => Math.min(r, z.rTight), Infinity),
        verdict: worst,
        lights: lightCenters.length,
      });
    });
  }

  if (lights) {
    const face = p.lid === "open" ? "base" : p.lid === "removable" ? "lid and the lid lip" : "lid";
    issues.push({ lvl: "info", msg: `${lights} light hole${lights > 1 ? "s" : ""} of ${r1(p.marquee.holeDia)} mm go through the ${face}.` });
  }
  if (hinge) {
    for (const s of stats) {
      if (s.verdict === "crack") issues.push({ lvl: "warn", msg: `“${s.letter}” bends tighter (R ${r1(s.rTight)} mm) than this hinge allows (about ${r1(rMin)} mm). Use Auto-fit, a larger size or a larger corner radius.` });
      else if (s.verdict === "tight") issues.push({ lvl: "info", msg: `“${s.letter}” bends close to the hinge limit (R ${r1(s.rTight)} mm). Cut a test piece first.` });
    }
    if (p.pitch - cutWidth(hp) < 0.9) issues.push({ lvl: "warn", msg: "Torsion bars are under 0.9 mm wide and may char or snap. Widen the slit spacing" + (p.cutStyle === "slot" ? " or narrow the slots." : ".") });
    if (p.material === "acr3") issues.push({ lvl: "warn", msg: "Acrylic living hinges crack easily. Use them only for gentle curves or heat-assisted bends." });
  } else if (!p.labels) {
    issues.push({ lvl: "info", msg: "Turn on Labels to engrave the panel numbers on the panels and the base, so they are easy to match." });
  }

  return {
    walls: wallParts,
    plates,
    box: { style: p.wallStyle, hBody, rCorner, rMin, filleted, walls, letters: stats },
    issues,
  };
}
