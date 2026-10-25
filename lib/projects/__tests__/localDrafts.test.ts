import { expect, it } from "vitest";
import { localGeneratorDrafts } from "../localDrafts";

it("lists only existing usable drafts, tolerating corrupt storage", () => {
  const data: Record<string, string> = {
    "hingelab-gen-popup-v1": JSON.stringify({ params: { mode: "bowl" }, units: "mm" }),
    "hingelab-gen-clock-v1": "{broken",
    "hingelab-gen-qr-v1": JSON.stringify({ params: [] }),
  };
  expect(localGeneratorDrafts((key) => data[key] ?? null).map((p) => p.product)).toEqual(["popup"]);
  expect(localGeneratorDrafts(() => { throw new Error("Storage denied"); })).toEqual([]);
});
