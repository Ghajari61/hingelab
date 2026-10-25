import { expect, it } from "vitest";
import { jointedWall } from "../corners";
import { LETTER_DEFAULTS, hingeParamsOf, wallHeightOf } from "../defaults";

it.each([50, 55, 60, 65, 70, 80, 90, 100, 120, 150])("split corner walls at %s mm keep slots aligned with surviving tabs", (maxLength) => {
  const p = { ...structuredClone(LETTER_DEFAULTS), wallMaxLength: maxLength };
  const result = jointedWall({ pts: [[0,0],[300,0],[300,100],[0,100]], joints: [0,1,2,3] }, {
    p, hp: hingeParamsOf(p), hBody: wallHeightOf(p), topTabs: true,
    letter: "test", contour: "outer", rMin: 10, seamNo: 1,
  });
  expect(result.parts.length).toBeGreaterThan(4);
  const tabs = result.parts.reduce((sum, part) => sum + part.tabs.length, 0);
  expect(result.wall.slots.length).toBe(tabs);
  expect(result.wall.tabs.length).toBe(tabs);
});
