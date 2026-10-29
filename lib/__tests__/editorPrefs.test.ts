import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EDITOR_PREFS, keepSetup, normalizeEditorPrefs } from "@/lib/prefs/editor";
import { THEME_BOOT_SCRIPT } from "@/lib/studio/themeBoot";

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("editor preferences", () => {
  it("fills in defaults and drops bad values", () => {
    expect(normalizeEditorPrefs({})).toEqual(DEFAULT_EDITOR_PREFS);
    const p = normalizeEditorPrefs({ decimals: 5, uiSize: "huge", shade: "wire", autosave: "no", confirmReset: false, quad: false, decimals2: 1 });
    expect(p.decimals).toBe(1);
    expect(p.uiSize).toBe("normal");
    expect(p.shade).toBe("shaded");
    expect(p.autosave).toBe(true);
    expect(p.confirmReset).toBe(false);
    expect(p.quad).toBe(false);
    expect(Object.keys(p).sort()).toEqual(Object.keys(DEFAULT_EDITOR_PREFS).sort());
  });

  it("takes the 3D toolbar's old keys when there are no preferences yet", () => {
    vi.stubGlobal("localStorage", memoryStorage({ "hl.view3d": JSON.stringify({ quad: false, shade: "edges" }), "hl.dims3d": "0" }));
    expect(normalizeEditorPrefs(undefined)).toMatchObject({ quad: false, shade: "edges", dims3d: false });
    expect(normalizeEditorPrefs({})).toMatchObject({ quad: true, shade: "shaded", dims3d: true });
  });

  it("keeps only the material and the sheet, and only keys the new design has", () => {
    const prev = { name: "Old", material: "birch", T: 6, K: 0.2, sheetW: 600, sheetH: 400, slit: 9, style: { a: 1 } };
    const next = { name: "", material: "mdf", T: 3, K: 0.1, sheetW: 300, sheetH: 200, slit: 4 };
    const out = keepSetup(prev, next);
    expect(out).toEqual({ name: "", material: "birch", T: 6, K: 0.2, sheetW: 600, sheetH: 400, slit: 4 });
    expect(next.material).toBe("mdf");
    const obj = { material: { id: "acrylic", T: 3 } };
    const copy = keepSetup(obj, { material: { id: "mdf", T: 6 } });
    expect(copy.material).toEqual(obj.material);
    expect(copy.material).not.toBe(obj.material);
  });

  it("the Studio's save does not overwrite the editor part", async () => {
    vi.stubGlobal("localStorage", memoryStorage({ "hingelab-prefs": JSON.stringify({ editor: { decimals: 2, uiSize: "large" } }) }));
    const { loadPrefs, savePrefs } = await import("@/lib/studio/prefs");
    const p = loadPrefs();
    expect(p.editor.decimals).toBe(2);
    savePrefs({ ...p, accent: "teal", editor: DEFAULT_EDITOR_PREFS });
    const stored = JSON.parse(localStorage.getItem("hingelab-prefs")!);
    expect(stored.accent).toBe("teal");
    expect(stored.editor).toEqual({ decimals: 2, uiSize: "large" });
  });

  it("the boot script sets the interface size and reduced motion", () => {
    const dataset: Record<string, string> = {};
    const run = new Function("localStorage", "location", "document", "matchMedia", THEME_BOOT_SCRIPT);
    const doc = { documentElement: { dataset } };
    run(memoryStorage({ "hingelab-prefs": JSON.stringify({ editor: { uiSize: "large", reduceMotion: true } }) }), { pathname: "/hinge" }, doc, () => ({ matches: false }));
    expect(dataset.uiSize).toBe("large");
    expect(dataset.reduceMotion).toBe("");
    const d2: Record<string, string> = {};
    run(memoryStorage({ "hingelab-prefs": JSON.stringify({ editor: { uiSize: "normal" } }) }), { pathname: "/" }, { documentElement: { dataset: d2 } }, () => ({ matches: false }));
    expect(d2.uiSize).toBeUndefined();
    expect(d2.reduceMotion).toBeUndefined();
  });

  it("keeps the idle 3D turn preference: auto by default, on or off when set", () => {
    expect(normalizeEditorPrefs({}).idleTurn).toBe("auto");
    expect(normalizeEditorPrefs({ idleTurn: "on" }).idleTurn).toBe("on");
    expect(normalizeEditorPrefs({ idleTurn: "off" }).idleTurn).toBe("off");
    expect(normalizeEditorPrefs({ idleTurn: "sometimes" }).idleTurn).toBe("auto");
  });
});
