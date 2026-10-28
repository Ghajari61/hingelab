/**
 * Every preset of the generators that gained text operations, with each new operation switched on:
 * it builds, its SVG cut regions match Lay Flat, and the SVG's score layer is exactly the parts'
 * score lines. (Digital checks of the cut file; a test cut still decides how it looks in material.)
 */
import { expect, it } from "vitest";
import { arrangeGenerator, flatOf, genSVG } from "../output";
import { flatScene } from "@/lib/three/flat";
import { assertFlatMatchesSVG } from "@/lib/three/__tests__/flatExportAssertions";
import { readScene } from "@/lib/export/scene";
import { setPath } from "../path";
import { TABLENUM } from "../tablenum";
import { KEYRACK } from "../keyrack";
import { TROPHY } from "../trophy";
import { PUZZLE } from "../puzzle";
import { CLOCK } from "../clock";
import { QR } from "../qr";
import { POPUP } from "../popup";
import { KEYCHAIN } from "../keychain";
import type { AnyGenerator, Contour } from "../types";
import { CTX } from "./ctx";

const length = (cs: Contour[]) => cs.reduce((n, c) => n + c.slice(1).reduce((m, q, i) => m + Math.hypot(q[0] - c[i][0], q[1] - c[i][1]), 0), 0);

/** Settings switched on (dot paths), per generator. */
const VARIANTS: [AnyGenerator, Record<string, unknown>[]][] = [
  [TABLENUM, [{ "text.mark": "score", "text.noWeld": true }, { "text.mark": "raised", "text.noWeld": true }]],
  [KEYRACK, [{ "text.mark": "score", "text.noWeld": true }, { "text.mark": "raised", "text.noWeld": true }]],
  [TROPHY, [{ "mark.kind": "score", "mark.noWeld": true }]],
  [PUZZLE, [{ "engrave.mark": "score", "engrave.noWeld": true }]],
  [CLOCK, [{ "markers.mark": "score", "inscription.mark": "score", "inscription.noWeld": true }]],
  [QR, [{ "label.mark": "score" }]],
  [POPUP, [{ "engraving.mark": "score" }]],
  [KEYCHAIN, [{ "text.noWeld": true }]],
];

for (const [def, variants] of VARIANTS) it(`${def.id}: every preset with its text operations switched on`, () => {
  for (const pr of def.presets) for (const v of variants) {
    let p = def.merge(pr.params);
    for (const [k, val] of Object.entries(v)) p = setPath(p, k, val);
    p = def.merge(p);
    const label = `${def.id}/${pr.id} ${JSON.stringify(v)}`;
    const a = arrangeGenerator(def, p, CTX);
    if ("error" in a.result) throw Error(`${label}: ${a.result.error}`);
    const svg = genSVG(def, a.params, a.lay!);
    expect(svg, label).not.toMatch(/NaN|Infinity|undefined/);
    const flat = flatScene(flatOf(a.lay!), p.T);
    try { assertFlatMatchesSVG(flat.group, svg); } finally { flat.dispose(); }
    const svgScore = readScene(svg).layers.filter((l) => /Score/.test(l.label)).flatMap((l) => l.items.flatMap((it) => it.polys.map((q) => q.pts)));
    expect(length(svgScore), label).toBeCloseTo(length(a.lay!.items.flatMap((it) => it.pt.score)), 0);
  }
}, 300000);
