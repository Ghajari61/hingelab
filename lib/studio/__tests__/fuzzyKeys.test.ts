import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyMatch } from "../fuzzy";
import { canonical, formatShortcut, isTypingTarget, matches, parseShortcut, type KeyEventLike } from "../keys";

const ev = (key: string, o: Partial<KeyEventLike> = {}): KeyEventLike => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

describe("fuzzy", () => {
  it("matches characters in order and rejects missing ones", () => {
    expect(fuzzyMatch("hb", "Hinge Box")).not.toBeNull();
    expect(fuzzyMatch("bh", "Hinge Box")).toBeNull();
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, ranges: [] });
  });

  it("scores substrings and word starts above scattered matches", () => {
    const sub = fuzzyMatch("box", "Hinge Box")!;
    const scattered = fuzzyMatch("box", "Bevelled Outline X")!;
    expect(sub.score).toBeGreaterThan(scattered.score);
    expect(sub.ranges).toEqual([[6, 9]]);
  });

  it("merges consecutive ranges", () => {
    expect(fuzzyMatch("finbx", "Finger-Joint Box")!.ranges[0]).toEqual([0, 3]);
  });

  it("filters, sorts by score and keeps input order on ties", () => {
    const items = ["Save", "Save As…", "Export SVG", "Undo"];
    expect(fuzzyFilter(items, "sav", (s) => s).map((r) => r.item)).toEqual(["Save", "Save As…"]);
    expect(fuzzyFilter(items, "", (s) => s).map((r) => r.item)).toEqual(items);
    const boosted = fuzzyFilter(items, "s", (s) => s, (s) => (s === "Export SVG" ? 5000 : 0));
    expect(boosted[0].item).toBe("Export SVG");
  });
});

describe("keys", () => {
  it("parses modifiers and aliases", () => {
    expect(parseShortcut("Ctrl+Shift+S")).toEqual({ ctrl: true, alt: false, shift: true, key: "s" });
    expect(parseShortcut("Ctrl++").key).toBe("+");
    expect(parseShortcut("Space").key).toBe(" ");
    expect(parseShortcut("Esc").key).toBe("escape");
  });

  it("matches events exactly, using Cmd on macOS", () => {
    expect(matches(ev("s", { ctrlKey: true }), "Ctrl+S")).toBe(true);
    expect(matches(ev("S", { ctrlKey: true, shiftKey: true }), "Ctrl+S")).toBe(false);
    expect(matches(ev("S", { ctrlKey: true, shiftKey: true, code: "KeyS" }), "Ctrl+Shift+S")).toBe(true);
    expect(matches(ev("s", { metaKey: true }), "Ctrl+S", true)).toBe(true);
    expect(matches(ev("s", { ctrlKey: true }), "Ctrl+S", true)).toBe(false);
  });

  it("uses the physical key when Alt or Shift changes the character", () => {
    expect(matches(ev("º", { altKey: true, code: "Digit0" }), "Alt+0")).toBe(true);
    expect(matches(ev("}", { ctrlKey: true, shiftKey: true, code: "BracketRight" }), "Ctrl+Shift+]")).toBe(true);
  });

  it("accepts zoom-in with or without Shift", () => {
    expect(matches(ev("=", { ctrlKey: true, code: "Equal" }), "Ctrl++")).toBe(true);
    expect(matches(ev("+", { ctrlKey: true, shiftKey: true, code: "Equal" }), "Ctrl++")).toBe(true);
    expect(matches(ev("-", { ctrlKey: true }), "Ctrl++")).toBe(false);
  });

  it("canonicalises for conflict detection and formats for macOS", () => {
    expect(canonical("Shift+Ctrl+S")).toBe(canonical("Ctrl+Shift+S"));
    expect(canonical("Ctrl++")).toBe("ctrl+=");
    expect(formatShortcut("Ctrl+Shift+S")).toBe("Ctrl+Shift+S");
    expect(formatShortcut("Ctrl+Shift+S", true)).toBe("⌘⇧S");
    expect(formatShortcut("Alt+Space", true)).toBe("⌥Space");
  });

  it("detects typing targets", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
  });
});
