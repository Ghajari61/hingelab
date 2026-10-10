import { describe, expect, it } from "vitest";
import {
  MAX_LOCAL_PER_PRODUCT, addMyPreset, cleanPresetName, mergeCloudPresets, parseMyPresets, removeMyPreset, type MyPreset,
} from "@/lib/userPresets";

const mk = (id: string, product: MyPreset["product"] = "hinge-box", createdAt = `2026-10-10T00:00:${id.padStart(2, "0")}Z`): MyPreset =>
  ({ id, product, name: `P${id}`, params: { W: Number(id) }, createdAt });

describe("my presets", () => {
  it("reads only well-formed entries and survives damaged storage", () => {
    expect(parseMyPresets(null)).toEqual([]);
    expect(parseMyPresets("{oops")).toEqual([]);
    expect(parseMyPresets(JSON.stringify({ not: "a list" }))).toEqual([]);
    const ok = mk("1");
    const bad = [{ ...ok, id: 3 }, { ...ok, product: "clock" }, { ...ok, params: [1] }, { ...ok, params: null }, "x"];
    expect(parseMyPresets(JSON.stringify([ok, ...bad]))).toEqual([ok]);
  });

  it("adds newest first, replaces the same id and caps each product separately", () => {
    let list: MyPreset[] = [mk("1", "letters")];
    for (let i = 2; i <= MAX_LOCAL_PER_PRODUCT + 5; i++) list = addMyPreset(list, mk(String(i)));
    expect(list.filter((p) => p.product === "hinge-box")).toHaveLength(MAX_LOCAL_PER_PRODUCT);
    expect(list.filter((p) => p.product === "letters")).toHaveLength(1);
    expect(list[0].id).toBe(String(MAX_LOCAL_PER_PRODUCT + 5));
    const renamed = { ...mk("9"), name: "Renamed" };
    list = addMyPreset(list, renamed);
    expect(list.filter((p) => p.id === "9")).toEqual([renamed]);
    expect(removeMyPreset(list, "9").some((p) => p.id === "9")).toBe(false);
  });

  it("merges the account's presets with this device's, one per id, newest first", () => {
    const merged = mergeCloudPresets([mk("1"), mk("3")], [mk("3"), mk("2")]);
    expect(merged.map((p) => p.id)).toEqual(["3", "2", "1"]);
    expect(merged.map((p) => !!p.cloud)).toEqual([true, true, false]);
  });

  it("cleans names", () => {
    expect(cleanPresetName("  my   tea\tbox ")).toBe("my tea box");
    expect(cleanPresetName("x".repeat(80))).toHaveLength(60);
  });
});
