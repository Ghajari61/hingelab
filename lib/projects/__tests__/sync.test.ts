import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseInitial, SaveScheduler, type SaveStatus } from "../sync";
import { parseProjectFile, projectName } from "../index";
import { thumbnailSVG } from "../thumbnail";

describe("chooseInitial (newer copy wins)", () => {
  const remote = { params: { v: "cloud" }, updated_at: "2026-10-10T10:00:00.000Z" };

  it("opens the cloud copy when there is no unsaved local edit", () => {
    expect(chooseInitial(null, remote)).toEqual({ params: { v: "cloud" }, source: "remote", push: false });
    expect(chooseInitial({ params: { v: "local" }, editedAt: "2026-10-10T11:00:00.000Z", dirty: false }, remote).source).toBe("remote");
  });

  it("opens and pushes the local copy when it has newer unsaved edits", () => {
    expect(chooseInitial({ params: { v: "local" }, editedAt: "2026-10-10T11:00:00.000Z", dirty: true }, remote))
      .toEqual({ params: { v: "local" }, source: "local", push: true });
  });

  it("drops an older unsaved local edit (another computer saved later)", () => {
    expect(chooseInitial({ params: { v: "local" }, editedAt: "2026-10-10T09:00:00.000Z", dirty: true }, remote).source).toBe("remote");
  });
});

describe("SaveScheduler (1.5 s debounced cloud save)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(save: (p: number) => Promise<void>) {
    const statuses: SaveStatus[] = [];
    const s = new SaveScheduler<number>(save, (st) => statuses.push(st));
    return { s, statuses };
  }

  it("saves once, 1.5 s after the last change", async () => {
    const saved: number[] = [];
    const { s, statuses } = setup(async (p) => { saved.push(p); });
    s.change(1);
    await vi.advanceTimersByTimeAsync(1000);
    s.change(2);
    await vi.advanceTimersByTimeAsync(1499);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual([2]);
    expect(statuses).toEqual(["Saving…", "Saved to cloud"]);
  });

  it("reports offline, keeps the edit and retries", async () => {
    let fail = true;
    const saved: number[] = [];
    const { s, statuses } = setup(async (p) => {
      if (fail) throw new Error("offline");
      saved.push(p);
    });
    s.change(5);
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses.at(-1)).toBe("Offline — saved locally");
    expect(s.hasPending()).toBe(true);
    fail = false;
    s.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual([5]);
    expect(statuses.at(-1)).toBe("Saved to cloud");
  });

  it("retries by itself after 30 s", async () => {
    let calls = 0;
    const { s, statuses } = setup(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
    });
    s.change(1);
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(30000);
    expect(calls).toBe(2);
    expect(statuses.at(-1)).toBe("Saved to cloud");
  });

  it("saves edits made during a slow save afterwards, never two saves at once", async () => {
    let active = 0;
    let maxActive = 0;
    const saved: number[] = [];
    const { s } = setup(async (p) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 3000));
      saved.push(p);
      active--;
    });
    s.change(1);
    await vi.advanceTimersByTimeAsync(1500);
    s.change(2);
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(10000);
    expect(saved).toEqual([1, 2]);
    expect(maxActive).toBe(1);
  });
});

describe("project files and names", () => {
  it("reads old Hinge Box files without a product field", () => {
    expect(parseProjectFile(JSON.stringify({ app: "HingeLab", version: 1, params: { W: 140 } }))).toEqual({ product: "hinge-box", params: { W: 140 } });
    expect(parseProjectFile(JSON.stringify({ product: "letters", params: { text: "Sam" } }))).toEqual({ product: "letters", params: { text: "Sam" } });
    expect(parseProjectFile("not json")).toHaveProperty("error");
    expect(parseProjectFile(JSON.stringify({ params: [] }))).toHaveProperty("error");
  });

  it("takes the project name from params.name", () => {
    expect(projectName({ name: "  Gift box " }, "hinge-box")).toBe("Gift box");
    expect(projectName({}, "hinge-box")).toBe("Untitled box");
    expect(projectName({ name: "x".repeat(300) }, "letters")).toHaveLength(200);
  });
});

describe("thumbnail", () => {
  it("draws the outlines in a fixed box and rounds coordinates", () => {
    const svg = thumbnailSVG({ outline: ["M0.123456 0L100 0L100 50L0 50Z"], slots: [] }, 100, 50)!;
    expect(svg).toContain('viewBox="-3 -3 106 56"');
    expect(svg).toContain("M0.1 0L100 0");
    expect(svg).not.toContain("NaN");
    expect(thumbnailSVG({ outline: [], slots: [] }, 100, 50)).toBeNull();
  });
});
