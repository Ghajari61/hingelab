import { describe, expect, it } from "vitest";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { mergeBoxes } from "../boxes/params";
import { pointInContour } from "../geom";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: Record<string, unknown>) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const PAT = { pattern: "circles", on: "both", cell: 8, bar: 2 };
const added = (o: BoxesOutput, plain: BoxesOutput, id: string) => {
  const a = o.parts.find((p) => p.id === id)!, b = plain.parts.find((p) => p.id === id)!;
  return a.holes.slice(b.holes.length);
};
const inBox = (c: GenPart["outer"], h: GenPart["outer"]) => {
  const xs = h.map((q) => q[0]), ys = h.map((q) => q[1]);
  return c.some(([x, y]) => x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys));
};

describe("cut-out pattern on every Boxes design", () => {
  const CASES: [string, string[]][] = [
    ["hex", ["wall1", "lid"]], ["stack", ["t1-front", "lid"]], ["drawer", ["cab-left", "d1-front", "cab-top"]],
    ["money", ["front", "top"]], ["bird", ["front", "left", "roof-l"]], ["stand", ["side-l"]],
    ["keys", ["plate"]], ["sign", ["plate"]], ["insert", ["divx1"]], ["frame", ["front"]],
  ];
  it.each(CASES)("%s: holes on its panels, None leaves it as it was", (design, ids) => {
    const plain = build({ design });
    const out = build({ design, pierce: PAT });
    for (const id of ids) expect(added(out, plain, id).length, id).toBeGreaterThan(0);
    expect(out.stats.find((s) => s.label === "Pattern")?.value).toMatch(/\d+ holes on \d+ panels?/);
    expect(build({ design, pierce: { ...PAT, pattern: "none" } })).toEqual(plain);
  });

  it("keeps clear of a part's own openings: the money slot, the bird house entrance, the frame's window, the key board's text", () => {
    for (const [design, id] of [["money", "top"], ["bird", "front"], ["frame", "front"], ["drawer", "d1-front"]] as const) {
      const plain = build({ design }), out = build({ design, pierce: PAT });
      const own = plain.parts.find((p) => p.id === id)!.holes;
      for (const h of added(out, plain, id)) for (const o of own) expect(inBox(h, o), `${design} ${id}`).toBe(false);
    }
    const keys = build({ design: "keys", pierce: PAT }), plate = keys.parts.find((p) => p.id === "plate")!;
    const text = plate.engrave!.flat();
    const [x0, x1] = [Math.min(...text.map((q) => q[0])), Math.max(...text.map((q) => q[0]))];
    const [y0, y1] = [Math.min(...text.map((q) => q[1])), Math.max(...text.map((q) => q[1]))];
    const box = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as GenPart["outer"];
    for (const h of plate.holes) expect(h.some((q) => pointInContour(q, box))).toBe(false);
  });

  it("Lid only leaves the walls plain; Walls leaves the roof plain", () => {
    const plain = build({ design: "bird" });
    const lid = build({ design: "bird", pierce: { ...PAT, on: "lid" } });
    expect(added(lid, plain, "front")).toHaveLength(0);
    expect(added(lid, plain, "roof-l").length).toBeGreaterThan(0);
    const walls = build({ design: "bird", pierce: { ...PAT, on: "walls" } });
    expect(added(walls, plain, "roof-l")).toHaveLength(0);
  });
});
