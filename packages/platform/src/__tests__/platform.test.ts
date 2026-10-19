import { describe, expect, it } from "vitest";
import { platform, setPlatform, webPlatform, type Platform } from "..";
import { editorPath, isEditorProduct, matchRoute, productFromPath } from "@hingelab/app/routes";

/** Every implementation offers the whole interface. */
function contract(p: Platform) {
  for (const k of ["fetch", "saveFile", "exportFile", "openProject", "recentProjects", "chooseFolder", "openExternal"] as const) expect(typeof p[k], k).toBe("function");
  for (const k of ["session", "signIn", "signOut", "onChange", "refresh"] as const) expect(typeof p.auth[k], k).toBe("function");
  for (const k of ["path", "search", "navigate", "subscribe"] as const) expect(typeof p.router[k], k).toBe("function");
  expect(typeof p.updates.check).toBe("function");
  expect(Object.keys(p.capabilities).sort()).toEqual(["jobFolder", "offlineProjects", "recentFiles", "trueScaleBed", "updater"]);
}

describe("platform adapter", () => {
  it("the website's implementation keeps the contract and has no desktop capabilities", () => {
    const w = webPlatform();
    contract(w);
    expect(w.kind).toBe("web");
    expect(Object.values(w.capabilities).every((v) => v === false)).toBe(true);
  });

  it("the Windows app's implementation keeps the contract and turns on its capabilities", async () => {
    const { tauriPlatform } = await import("../tauri");
    const t = tauriPlatform();
    contract(t);
    expect(t.kind).toBe("tauri");
    expect(t.capabilities).toEqual({ trueScaleBed: true, jobFolder: true, recentFiles: true, offlineProjects: true, updater: true });
  });

  it("is the website's until the host sets another", async () => {
    expect(platform().kind).toBe("web");
    const { tauriPlatform } = await import("../tauri");
    setPlatform(tauriPlatform());
    expect(platform().kind).toBe("tauri");
    setPlatform(webPlatform());
  });
});

describe("routes, the same on both platforms", () => {
  it("open a product's editor at /editor/<product> and Studio projects at any other id", () => {
    expect(editorPath("hinge")).toBe("/editor/hinge");
    for (const p of ["hinge", "letters", "parametric", "clock", "boxes", "shadowbox", "paperbox"]) {
      expect(isEditorProduct(p)).toBe(true);
      expect(matchRoute(editorPath(p))).toEqual({ page: "editor", product: p });
    }
    expect(productFromPath("/editor/0b6f2c1a-9d3e-4f1a-8c2b-1234567890ab")).toBeNull();
    expect(matchRoute("/editor/0b6f2c1a-9d3e-4f1a-8c2b-1234567890ab")).toEqual({ page: "studio", projectId: "0b6f2c1a-9d3e-4f1a-8c2b-1234567890ab" });
    expect(matchRoute("/generators")).toEqual({ page: "generators" });
    expect(matchRoute("/projects")).toEqual({ page: "projects" });
    expect(matchRoute("/account")).toEqual({ page: "account" });
  });
});
