import { describe, expect, it } from "vitest";
import { bindingsFor, COMMAND_BY_ID, COMMANDS, conflicts, isSingleKey, MENUS, menuIds, TOOL_IDS } from "../commands";
import { parseShortcut } from "../keys";
import type { ShortcutSet } from "../prefs";

const SETS: ShortcutSet[] = ["hingelab", "corel", "lightburn", "inkscape"];

describe("command registry", () => {
  it("has unique ids and every menu entry exists", () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
    for (const id of menuIds()) expect(COMMAND_BY_ID.has(id), id).toBe(true);
    expect(MENUS.map((m) => m.label)).toEqual(["File", "Edit", "Object", "Type", "Select", "Path", "Laser", "View", "Window", "Help"]);
  });

  it("has no shortcut conflicts in any set", () => {
    for (const set of SETS) expect(conflicts(bindingsFor(set)), set).toEqual([]);
  });

  it("every shortcut parses to a key", () => {
    for (const set of SETS) for (const [id, keys] of bindingsFor(set)) for (const k of keys) expect(parseShortcut(k).key, `${set} ${id} ${k}`).not.toBe("");
  });

  it("sets differ where the spec says they do", () => {
    expect(bindingsFor("hingelab").get("tool.rect")).toEqual(["M"]);
    expect(bindingsFor("corel").get("tool.rect")).toEqual(["F6"]);
    expect(bindingsFor("inkscape").get("tool.select")).toEqual(["S"]);
    expect(bindingsFor("corel").get("object.ungroup")).toEqual(["Ctrl+U"]);
    expect(bindingsFor("lightburn").has("edit.pasteInPlace")).toBe(false);
    expect(bindingsFor("hingelab").get("laser.assign.3")).toEqual(["Alt+3"]);
  });

  it("custom bindings override the set and conflicts are reported", () => {
    const b = bindingsFor("hingelab", { "object.group": ["Ctrl+Shift+G"] });
    expect(b.get("object.group")).toEqual(["Ctrl+Shift+G"]);
    const found = conflicts(b);
    expect(found.map((f) => f.key)).toEqual(["ctrl+shift+g"]);
    expect(found[0].ids.sort()).toEqual(["object.group", "object.ungroup"]);
  });

  it("every tool is a command and single-key detection works", () => {
    for (const t of TOOL_IDS) expect(COMMAND_BY_ID.get(`tool.${t}`)?.category).toBe("Tool");
    expect(isSingleKey("V")).toBe(true);
    expect(isSingleKey("Shift+Tab")).toBe(true);
    expect(isSingleKey("Ctrl+G")).toBe(false);
    expect(isSingleKey("F2")).toBe(false);
  });
});
