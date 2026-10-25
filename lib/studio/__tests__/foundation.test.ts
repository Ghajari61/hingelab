import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { evalNumberExpr } from "../expr";
import { cleanName, defaultProjectName, uniqueName } from "../naming";
import { assertDocument, createDocument, migrateDocument, SCHEMA_VERSION } from "../doc";
import { openHingelab, packHingelab, projectFileName } from "../file";
import { LAYER_COLORS, defaultCutLayers, layerCode, nearestLayer } from "../cutLayers";
import { DEFAULT_PREFS, normalizePrefs, noteGeneratorUse } from "../prefs";
import { fmtLength, toMM } from "../units";
import { SHEET_PRESETS, MATERIAL_PRESETS, MACHINE_PROFILES } from "../library";
import {
  deleteLocalProject, getLocalAsset, listLocalProjects, loadLocalProject, newLocalId, putLocalAsset,
  resetLocalStoreForTests, saveLocalProject, touchLocalProject,
} from "../localStore";
import { GENERATORS } from "@/lib/generators/catalog";
import { isProtected, routeDecision } from "@/lib/auth/routes";

const NOW = "2026-10-10T12:00:00.000Z";

describe("number field expressions", () => {
  const mm = { current: 100, unit: "mm" as const };
  it("evaluates math, units, relative and percent", () => {
    expect(evalNumberExpr("25.4*2", mm)).toBeCloseTo(50.8, 9);
    expect(evalNumberExpr("3in", mm)).toBeCloseTo(76.2, 9);
    expect(evalNumberExpr("12mm + 1cm", mm)).toBeCloseTo(22, 9);
    expect(evalNumberExpr("+10", mm)).toBe(110);
    expect(evalNumberExpr("-=5", mm)).toBe(95);
    expect(evalNumberExpr("*=2", mm)).toBe(200);
    expect(evalNumberExpr("-5", mm)).toBe(-5);
    expect(evalNumberExpr("50%", mm)).toBe(50);
    expect(evalNumberExpr("(2+3)*4", mm)).toBe(20);
    expect(evalNumberExpr("1,5", mm)).toBe(1.5);
    expect(evalNumberExpr("72pt", { current: 0, unit: "in" })).toBeCloseTo(1, 9);
    expect(evalNumberExpr('2"', mm)).toBeCloseTo(50.8, 9);
  });
  it("rejects garbage and never evaluates code", () => {
    for (const bad of ["", "abc", "2**", "1/0", "alert(1)", "2 3", "(1+2", "constructor"]) expect(evalNumberExpr(bad, mm)).toBeNull();
  });
  it("ignores units on unitless fields", () => {
    expect(evalNumberExpr("6", { current: 3, unit: null })).toBe(6);
  });
});

describe("project names", () => {
  it("numbers untitled projects and keeps names unique", () => {
    expect(defaultProjectName("Hinge Box", [])).toBe("Untitled Hinge Box 1");
    expect(defaultProjectName("Design", ["Untitled Design 1", "untitled design 2"])).toBe("Untitled Design 3");
    expect(uniqueName("Box", ["Box"])).toBe("Box (2)");
    expect(uniqueName("Box (2)", ["Box", "Box (2)"])).toBe("Box (3)");
    expect(uniqueName("  New\u0007  box ", [])).toBe("New box");
    expect(cleanName("x".repeat(200))).toHaveLength(120);
  });
});

describe("documents", () => {
  it("creates a valid document with 30 LightBurn layers and the chosen sheet", () => {
    const d = createDocument({ name: "Test", sheet: { w: 210, h: 297 }, orientation: "landscape", units: "in", now: NOW, id: "d1" });
    assertDocument(d);
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d.sheets[0]).toMatchObject({ w: 297, h: 210 });
    expect(d.cutLayers).toHaveLength(30);
    expect(d.cutLayers[2]).toMatchObject({ color: "#FF0000", mode: "cut" });
    expect(d.units).toBe("in");
  });
  it("migrates a version-0 document and refuses newer or broken ones", () => {
    const v0 = { id: "x", name: "Old", units: "mm", sheets: [{ id: "s", name: "S", x: 0, y: 0, w: 100, h: 100, materialId: "birch3", machineId: "co2-50" }], layers: [] };
    const d = migrateDocument(v0);
    expect(d.schemaVersion).toBe(1);
    expect(d.cutLayers).toHaveLength(30);
    expect(d.root.children).toEqual([]);
    expect(() => migrateDocument({ ...d, schemaVersion: 99 })).toThrow(/newer version/);
    expect(() => migrateDocument({ ...d, sheets: [] })).toThrow(/not a HingeLab document/);
    expect(() => migrateDocument(null)).toThrow();
  });
});

describe(".hingelab files", () => {
  const doc = createDocument({ name: "Gift box", now: NOW, id: "d2" });
  it("round-trips document, assets and thumbnail, byte-identical for the same input", () => {
    const a = packHingelab({ doc, assets: { "img-1": new Uint8Array([1, 2, 3]) }, thumbnail: new Uint8Array([137, 80, 78, 71]), savedAt: NOW });
    const b = packHingelab({ doc, assets: { "img-1": new Uint8Array([1, 2, 3]) }, thumbnail: new Uint8Array([137, 80, 78, 71]), savedAt: NOW });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const o = openHingelab(a);
    if (o.kind !== "studio") throw new Error("expected a studio file");
    expect(o.doc).toEqual(doc);
    expect([...o.assets["img-1"]]).toEqual([1, 2, 3]);
    expect(o.thumbnail?.length).toBe(4);
    expect(o.manifest).toMatchObject({ app: "HingeLab Studio", schemaVersion: SCHEMA_VERSION });
    expect(o.manifest.files).toEqual(["assets/img-1", "document.json", "thumbnail.png"]);
  });
  it("opens old single-product project files as legacy", () => {
    const o = openHingelab(strToU8(JSON.stringify({ app: "HingeLab", product: "letters", params: { text: "Sam" } })));
    expect(o).toEqual({ kind: "legacy", product: "letters", params: { text: "Sam" } });
  });
  it("explains damaged files", () => {
    expect(() => openHingelab(strToU8("hello"))).toThrow(/not a HingeLab project/);
    expect(() => openHingelab(zipSync({ "readme.txt": strToU8("x") }))).toThrow(/no document/);
    expect(() => openHingelab(zipSync({ "document.json": strToU8("{oops") }))).toThrow(/damaged/);
    expect(() => openHingelab(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow(/damaged/);
  });
  it("makes safe file names", () => {
    expect(projectFileName('Box: "v2"?')).toBe("Box- -v2--.hingelab");
    expect(projectFileName("  ")).toBe("Untitled.hingelab");
  });
});

describe("library and layers", () => {
  it("has the LightBurn palette, sheet presets, materials and machines", () => {
    expect(LAYER_COLORS).toHaveLength(30);
    expect(layerCode(7)).toBe("C07");
    expect(nearestLayer("#fe0101")).toBe(2);
    expect(defaultCutLayers().map((l) => l.index)).toEqual([...Array(30).keys()]);
    expect(SHEET_PRESETS.find((s) => s.id === "a4")).toMatchObject({ w: 210, h: 297 });
    expect(MATERIAL_PRESETS.every((m) => m.thickness > 0 && m.kerf >= 0)).toBe(true);
    expect(new Set(MACHINE_PROFILES.map((m) => m.laser))).toEqual(new Set(["co2", "diode", "fiber"]));
    expect(fmtLength(toMM(1, "in"), "in", true)).toBe("1 in");
  });
  it("lists the ten generators with existing plans and Pop-up", () => {
    expect(GENERATORS).toHaveLength(13);
    expect(GENERATORS.filter((g) => g.plan === "free").map((g) => g.id).sort()).toEqual(["calibration", "finger-box", "jigsaw", "paper-box", "shadow-box", "tray"]);
    expect(GENERATORS.map((g) => g.n)).toEqual([15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("preferences", () => {
  it("normalises anything into valid preferences", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    const p = normalizePrefs({ theme: "light", units: "in", accent: "pink", machineId: "nope", recentGenerators: [{ id: "tray", at: NOW }, 4] });
    expect(p).toMatchObject({ theme: "light", units: "in", accent: "blue", machineId: DEFAULT_PREFS.machineId });
    expect(p.recentGenerators).toEqual([{ id: "tray", at: NOW }]);
    const q = noteGeneratorUse(noteGeneratorUse(p, "jigsaw", "2026-10-11"), "tray", "2026-10-12");
    expect(q.recentGenerators.map((r) => r.id)).toEqual(["tray", "jigsaw"]);
  });
});

describe("studio routes", () => {
  it("guards account pages and cloud editors, not local ones", () => {
    expect(isProtected("/projects")).toBe(true);
    expect(isProtected("/account")).toBe(true);
    expect(isProtected("/editor/0b7c6a7e-1d55-4b39-9a3f-0d2c2a1e3c11")).toBe(true);
    expect(isProtected("/editor/local-abc")).toBe(false);
    expect(isProtected("/home")).toBe(false);
    expect(isProtected("/templates")).toBe(false);
    expect(routeDecision({ path: "/projects", search: "", signedIn: false, configured: false })).toBe("/home");
    expect(routeDecision({ path: "/projects", search: "", signedIn: false, configured: true })).toBe("/login?next=%2Fprojects");
    expect(routeDecision({ path: "/editor/local-abc", search: "", signedIn: false, configured: true })).toBeNull();
  });
});

describe("local project store", () => {
  beforeEach(async () => {
    resetLocalStoreForTests();
    await new Promise<void>((r) => { const q = indexedDB.deleteDatabase("hingelab-studio"); q.onsuccess = q.onerror = () => r(); });
  });
  it("saves, lists by last opened, loads, keeps assets and deletes", async () => {
    const a = createDocument({ name: "A", id: newLocalId(), now: NOW });
    const b = createDocument({ name: "B", id: newLocalId(), now: NOW });
    await saveLocalProject(a, "<svg/>");
    await new Promise((r) => setTimeout(r, 5));
    await saveLocalProject(b);
    expect((await listLocalProjects()).map((p) => p.name)).toEqual(["B", "A"]);
    await new Promise((r) => setTimeout(r, 5));
    await touchLocalProject(a.id);
    const list = await listLocalProjects();
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
    expect(list[0].thumbnail).toBe("<svg/>");
    expect(await loadLocalProject(a.id)).toEqual(a);
    await putLocalAsset(a.id, "img", new Uint8Array([9]));
    expect([...(await getLocalAsset(a.id, "img"))!]).toEqual([9]);
    await deleteLocalProject(a.id);
    expect(await loadLocalProject(a.id)).toBeNull();
    expect(await getLocalAsset(a.id, "img")).toBeNull();
    expect((await listLocalProjects()).map((p) => p.name)).toEqual(["B"]);
  });
});
