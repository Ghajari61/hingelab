/**
 * The command registry (spec §9): every command the editor can run, with its label, category and
 * default shortcuts per shortcut set. Menus, the toolbar, context menus, the command palette and the
 * keyboard all read from here; the editor supplies what each command does.
 */
import { canonical } from "./keys";
import type { ShortcutSet } from "./prefs";

export type Category = "File" | "Edit" | "Object" | "Type" | "Select" | "Path" | "Laser" | "View" | "Window" | "Help" | "Tool";

export interface CommandDef {
  id: string;
  label: string;
  category: Category;
  /** HingeLab (Illustrator-compatible) default. */
  keys?: string[];
  /** Per-set overrides; `[]` removes the default in that set. */
  sets?: Partial<Record<Exclude<ShortcutSet, "hingelab">, string[]>>;
  description?: string;
}

const c = (id: string, label: string, category: Category, keys?: string | string[], sets?: CommandDef["sets"], description?: string): CommandDef =>
  ({ id, label, category, ...(keys ? { keys: Array.isArray(keys) ? keys : [keys] } : {}), ...(sets ? { sets } : {}), ...(description ? { description } : {}) });

export const TOOL_IDS = [
  "select", "direct", "pen", "pencil", "line", "rect", "ellipse", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart",
  "grid", "spiral", "text", "rotate", "scale", "reflect", "hand", "zoom",
  "lasso", "magicWand", "curvature", "scissors", "knife", "eraser", "shear", "shapeBuilder", "eyedropper", "measure",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_INFO: Record<ToolId, { label: string; description: string }> = {
  select: { label: "Selection", description: "Select, move, scale and rotate objects." },
  direct: { label: "Direct Selection", description: "Select objects inside groups and edit path nodes." },
  pen: { label: "Pen", description: "Click for corners, drag for curves. Click the first node to close." },
  pencil: { label: "Pencil", description: "Draw freehand; the line is smoothed when you let go." },
  line: { label: "Line Segment", description: "Drag a straight line. Shift keeps 45° steps." },
  rect: { label: "Rectangle", description: "Drag a rectangle. Shift for a square, Alt to draw from the centre." },
  ellipse: { label: "Ellipse", description: "Drag an ellipse. Shift for a circle, Alt to draw from the centre." },
  polygon: { label: "Polygon", description: "Drag a regular polygon; set the sides in the control bar." },
  star: { label: "Star", description: "Drag a star; set points and inner radius in the control bar." },
  arc: { label: "Arc / Pie", description: "Drag an arc or pie slice." },
  slot: { label: "Rounded Slot", description: "Drag a stadium-shaped slot." },
  gear: { label: "Gear", description: "Drag a spur gear; set teeth and module in the control bar." },
  arrow: { label: "Arrow", description: "Drag an arrow." },
  bubble: { label: "Speech Bubble", description: "Drag a speech bubble." },
  heart: { label: "Heart", description: "Drag a heart." },
  grid: { label: "Grid / Table", description: "Drag a grid of cells." },
  spiral: { label: "Spiral", description: "Drag a spiral." },
  text: { label: "Type", description: "Click to type point text, drag for area text." },
  rotate: { label: "Rotate", description: "Drag to rotate the selection around its centre. Shift keeps 15° steps." },
  scale: { label: "Scale", description: "Drag to scale the selection from its centre. Shift keeps proportions." },
  reflect: { label: "Reflect", description: "Click to mirror the selection left–right; Alt+click mirrors top–bottom." },
  hand: { label: "Hand", description: "Drag to pan. Hold Space with any tool." },
  zoom: { label: "Zoom", description: "Click to zoom in, Alt+click to zoom out, drag to zoom to an area." },
  lasso: { label: "Lasso", description: "Draw freehand around objects to select them. Shift adds, Alt removes." },
  magicWand: { label: "Magic Wand", description: "Click an object to select everything on the same cut layer. Shift adds." },
  curvature: { label: "Curvature", description: "Click points and the curve flows through them. Alt+click for a corner, click the first point to close, Enter to finish." },
  scissors: { label: "Scissors", description: "Click a path to cut it there: closed paths open, open paths split in two." },
  knife: { label: "Knife", description: "Drag across shapes to slice them into pieces. Hold Alt for a straight cut, Shift for 45° steps." },
  eraser: { label: "Eraser", description: "Drag to erase parts of shapes and lines; set the size in the control bar. Works on the selection, or everything." },
  shear: { label: "Shear", description: "Drag sideways to slant the selection horizontally, up or down to slant it vertically." },
  shapeBuilder: { label: "Shape Builder", description: "Select overlapping shapes, then drag across regions to merge them. Alt+click a region to delete it." },
  eyedropper: { label: "Eyedropper", description: "Click an object to give the selection its cut layer (and font, for text)." },
  measure: { label: "Measure", description: "Drag to measure distance and angle; snaps to points." },
};

const TOOL_KEYS: Partial<Record<ToolId, { keys?: string; sets?: CommandDef["sets"] }>> = {
  select: { keys: "V", sets: { inkscape: ["S"] } },
  direct: { keys: "A", sets: { corel: ["F10"], lightburn: ["Ctrl+`"], inkscape: ["N"] } },
  pen: { keys: "P", sets: { inkscape: ["B"] } },
  pencil: { keys: "N", sets: { corel: ["F5"], inkscape: ["P"] } },
  line: { keys: "\\", sets: { lightburn: ["L"], inkscape: [] } },
  rect: { keys: "M", sets: { corel: ["F6"], lightburn: ["R"], inkscape: ["R"] } },
  ellipse: { keys: "L", sets: { corel: ["F7"], lightburn: ["E"], inkscape: ["E"] } },
  polygon: { sets: { corel: ["Y"] } },
  star: { sets: { inkscape: ["*"] } },
  spiral: { sets: { inkscape: ["I"] } },
  text: { keys: "T", sets: { corel: ["F8"] } },
  rotate: { keys: "R", sets: { corel: [], lightburn: [], inkscape: [] } },
  scale: { keys: "S", sets: { inkscape: [] } },
  reflect: { keys: "O", sets: { lightburn: [], inkscape: [] } },
  hand: { keys: "H", sets: { inkscape: [] } },
  zoom: { keys: "Z" },
  lasso: { keys: "Q", sets: { inkscape: [] } },
  magicWand: { keys: "Y", sets: { corel: [], inkscape: [] } },
  curvature: { keys: "Shift+`" },
  scissors: { keys: "C", sets: { corel: [], inkscape: [] } },
  eraser: { keys: "Shift+E", sets: { corel: ["X"] } },
  shapeBuilder: { keys: "Shift+M", sets: { inkscape: ["X"] } },
  eyedropper: { keys: "I", sets: { inkscape: ["D", "F7"] } },
  measure: { sets: { inkscape: ["M"] } },
};

const LAYER_KEYS = Array.from({ length: 30 }, (_, k) =>
  c(`laser.assign.${k}`, `Assign to C${String(k).padStart(2, "0")}`, "Laser", k < 10 ? `Alt+${k}` : undefined));

export const COMMANDS: CommandDef[] = [
  // File
  c("file.new", "New…", "File", "Ctrl+Alt+N", undefined, "Open the start screen to create a project. (Ctrl+N belongs to the browser.)"),
  c("file.open", "Open…", "File", "Ctrl+O"),
  c("file.close", "Close", "File", "Ctrl+Alt+W"),
  c("file.save", "Save", "File", "Ctrl+S"),
  c("file.saveCopy", "Save a Copy…", "File", "Ctrl+Alt+S"),
  c("file.saveComputer", "Save to Computer (.hingelab)", "File"),
  c("file.rename", "Rename…", "File", "F2"),
  c("file.revert", "Revert to Saved", "File"),
  c("file.documentSetup", "Document Setup…", "File", "Ctrl+Alt+P"),
  c("file.exit", "Exit to Start Screen", "File"),
  // Edit
  c("edit.undo", "Undo", "Edit", "Ctrl+Z"),
  c("edit.redo", "Redo", "Edit", "Ctrl+Shift+Z"),
  c("edit.cut", "Cut", "Edit", "Ctrl+X"),
  c("edit.copy", "Copy", "Edit", "Ctrl+C"),
  c("edit.paste", "Paste", "Edit", "Ctrl+V"),
  c("edit.pasteFront", "Paste in Front", "Edit", "Ctrl+F"),
  c("edit.pasteBack", "Paste in Back", "Edit", "Ctrl+B"),
  c("edit.pasteInPlace", "Paste in Place", "Edit", "Ctrl+Shift+V", { lightburn: [] }),
  c("edit.duplicate", "Duplicate", "Edit", "Ctrl+D"),
  c("edit.transformAgain", "Transform Again", "Edit", "Ctrl+Alt+D"),
  c("edit.delete", "Delete", "Edit", ["Delete", "Backspace"]),
  c("edit.selectAll", "Select All", "Select", "Ctrl+A"),
  c("edit.reset.field", "Selected Field", "Edit"),
  c("edit.reset.section", "Section", "Edit"),
  c("edit.reset.workspace", "Workspace", "Edit"),
  c("edit.reset.preferences", "All Preferences…", "Edit"),
  c("edit.shortcuts", "Keyboard Shortcuts…", "Edit", "Ctrl+Alt+Shift+K"),
  c("edit.preferences", "Preferences…", "Edit", "Ctrl+K", { corel: ["Ctrl+J"], inkscape: ["Ctrl+Shift+P"] }),
  // Object
  c("object.move", "Move…", "Object", "Ctrl+Shift+M"),
  c("object.rotate90", "Rotate 90° Clockwise", "Object"),
  c("object.rotate-90", "Rotate 90° Counter-clockwise", "Object"),
  c("object.reflectH", "Reflect Left–Right", "Object", undefined, { lightburn: ["Ctrl+Shift+H"], inkscape: ["H"] }),
  c("object.reflectV", "Reflect Top–Bottom", "Object", undefined, { lightburn: ["Ctrl+Shift+V"], inkscape: ["V"] }),
  c("object.resetBox", "Reset Bounding Box", "Object"),
  c("object.front", "Bring to Front", "Object", "Ctrl+Shift+]", { corel: ["Shift+PageUp"], inkscape: ["Home"] }),
  c("object.forward", "Bring Forward", "Object", "Ctrl+]", { corel: ["Ctrl+PageUp"], inkscape: ["PageUp"] }),
  c("object.backward", "Send Backward", "Object", "Ctrl+[", { corel: ["Ctrl+PageDown"], inkscape: ["PageDown"] }),
  c("object.back", "Send to Back", "Object", "Ctrl+Shift+[", { corel: ["Shift+PageDown"], inkscape: ["End"] }),
  c("object.align.left", "Align Left", "Object", undefined, { corel: ["L"] }),
  c("object.align.hcenter", "Align Horizontal Centres", "Object", undefined, { corel: ["E"] }),
  c("object.align.right", "Align Right", "Object", undefined, { corel: ["R"] }),
  c("object.align.top", "Align Top", "Object", undefined, { corel: ["T"] }),
  c("object.align.vcenter", "Align Vertical Centres", "Object", undefined, { corel: ["C"] }),
  c("object.align.bottom", "Align Bottom", "Object", undefined, { corel: ["B"] }),
  c("object.distribute.x", "Distribute Horizontally", "Object"),
  c("object.distribute.y", "Distribute Vertically", "Object"),
  c("object.group", "Group", "Object", "Ctrl+G"),
  c("object.ungroup", "Ungroup", "Object", "Ctrl+Shift+G", { corel: ["Ctrl+U"], lightburn: ["Ctrl+U"] }),
  c("object.lock", "Lock", "Object", "Ctrl+2"),
  c("object.unlockAll", "Unlock All", "Object", "Ctrl+Alt+2"),
  c("object.hide", "Hide", "Object", "Ctrl+3"),
  c("object.showAll", "Show All", "Object", "Ctrl+Alt+3"),
  c("object.compound.make", "Make Compound Path", "Object", "Ctrl+8", { corel: ["Ctrl+L"], inkscape: ["Ctrl+K"] }),
  c("object.compound.release", "Release Compound Path", "Object", "Ctrl+Alt+Shift+8"),
  c("object.clip.make", "Make Clipping Mask", "Object", "Ctrl+7"),
  c("object.clip.release", "Release Clipping Mask", "Object", "Ctrl+Alt+7"),
  c("object.expand", "Expand", "Object", undefined, { corel: ["Ctrl+Q"], inkscape: ["Ctrl+Shift+C"] }, "Turn live shapes and text into plain paths."),
  c("object.sheets.fit", "Fit Sheet to Artwork", "Object"),
  c("object.sheets.add", "Add Sheet", "Object"),
  // Type
  c("type.outlines", "Create Outlines", "Type", "Ctrl+Shift+O"),
  c("type.dir.ltr", "Left to Right", "Type"),
  c("type.dir.rtl", "Right to Left", "Type"),
  c("type.case.upper", "UPPERCASE", "Type"),
  c("type.case.lower", "lowercase", "Type"),
  c("type.case.title", "Title Case", "Type"),
  // Select
  c("select.none", "Deselect", "Select", "Ctrl+Shift+A"),
  c("select.inverse", "Inverse", "Select"),
  c("select.sameLayer", "Same Cut Layer", "Select"),
  c("select.sameType", "Same Object Type", "Select"),
  c("select.openPaths", "Open Paths", "Select"),
  c("select.next", "Next Object", "Select", "Tab"),
  c("select.prev", "Previous Object", "Select", "Shift+Tab"),
  // Path
  c("path.join", "Join", "Path", "Ctrl+J", { corel: [] }),
  c("path.close", "Close Path", "Path"),
  c("path.reverse", "Reverse Direction", "Path"),
  c("path.breakApart", "Break Apart", "Path", undefined, { corel: ["Ctrl+K"], inkscape: ["Ctrl+Shift+K"] }),
  c("path.addAnchors", "Add Anchor Points", "Path"),
  c("path.offset", "Offset Path…", "Path", undefined, { corel: ["Ctrl+F9"] }, "Grow or shrink outlines by a distance — kerf compensation, inlays, borders"),
  c("path.simplify", "Simplify…", "Path", undefined, undefined, "Fewer anchor points within a tolerance"),
  c("path.smooth", "Smooth", "Path", undefined, undefined, "Turn every anchor into a smooth curve point"),
  c("path.roundCorners", "Round Corners…", "Path", undefined, undefined, "Fillet or chamfer sharp corners"),
  c("path.pf.unite", "Unite", "Path", undefined, { corel: [] }, "Merge the selected shapes into one outline"),
  c("path.pf.minusFront", "Minus Front", "Path", undefined, undefined, "Cut the front shapes out of the back one"),
  c("path.pf.minusBack", "Minus Back", "Path", undefined, undefined, "Cut the back shapes out of the front one"),
  c("path.pf.intersect", "Intersect", "Path", undefined, undefined, "Keep only where all shapes overlap"),
  c("path.pf.exclude", "Exclude Overlap", "Path", undefined, undefined, "Keep everything except the overlaps"),
  c("path.pf.divide", "Divide", "Path", undefined, undefined, "Split the shapes into every separate piece"),
  c("path.pf.trim", "Trim", "Path", undefined, undefined, "Remove the hidden parts of each shape"),
  c("path.pf.crop", "Crop", "Path", undefined, undefined, "Cut the shapes behind to the front shape"),
  c("path.cleanup", "Clean Up for Laser", "Path", undefined, undefined, "Close near-closed paths, drop stray points, empty paths and double cuts"),
  // Laser
  ...LAYER_KEYS,
  // View
  c("view.zoomIn", "Zoom In", "View", ["Ctrl+=", "Ctrl++"]),
  c("view.zoomOut", "Zoom Out", "View", "Ctrl+-"),
  c("view.fitArtboard", "Fit Artboard", "View", "Ctrl+0", { inkscape: ["5"] }),
  c("view.fitAll", "Fit All", "View", "Ctrl+Alt+0", { corel: ["F4"] }),
  c("view.actual", "Actual Size", "View", "Ctrl+1", { inkscape: ["1"] }),
  c("view.zoomSelection", "Zoom to Selection", "View", "Ctrl+Shift+0", { corel: ["Shift+F2"], inkscape: ["3"] }),
  c("view.outline", "Outline Mode", "View", "Ctrl+Y"),
  c("view.rulers", "Rulers", "View", "Ctrl+R"),
  c("view.guides.show", "Show Guides", "View", "Ctrl+;"),
  c("view.guides.lock", "Lock Guides", "View", "Ctrl+Alt+;"),
  c("view.guides.fromSelection", "Make Guides from Selection", "View", "Ctrl+5"),
  c("view.guides.clear", "Clear Guides", "View"),
  c("view.grid", "Grid", "View", "Ctrl+'"),
  c("view.snapGrid", "Snap to Grid", "View", "Ctrl+Shift+'"),
  c("view.snapPoint", "Snap to Point", "View", "Ctrl+Alt+'"),
  c("view.smartGuides", "Smart Guides", "View", "Ctrl+U", { corel: ["Alt+Shift+D"], lightburn: [] }),
  c("view.presentation", "Presentation Mode", "View", "F"),
  c("view.theme.dark", "Dark", "View"),
  c("view.theme.darker", "Darker", "View"),
  c("view.theme.light", "Light", "View"),
  c("view.theme.system", "System", "View"),
  // Window
  c("window.panel.properties", "Properties", "Window"),
  c("window.panel.layers", "Layers & Objects", "Window"),
  c("window.panel.cutLayers", "Cut Layers", "Window"),
  c("window.panel.align", "Align & Distribute", "Window"),
  c("window.panel.pathfinder", "Pathfinder", "Window", "Ctrl+Shift+F9", { corel: [] }),
  c("window.panel.history", "History", "Window"),
  c("window.panel.document", "Document", "Window"),
  c("window.workspace.essentials", "Essentials", "Window"),
  c("window.workspace.laser", "Laser Production", "Window"),
  c("window.workspace.typography", "Typography", "Window"),
  c("window.workspace.minimal", "Minimal", "Window"),
  c("window.workspace.reset", "Reset Workspace", "Window"),
  c("window.palette", "Command Palette", "Window", "Ctrl+/"),
  // Help
  c("help.search", "Search Help", "Help", "F1"),
  c("help.shortcuts", "Keyboard Shortcuts", "Help", "Ctrl+Alt+/"),
  c("help.whatsNew", "What's New", "Help"),
  c("help.about", "About HingeLab", "Help"),
  // Tools
  ...TOOL_IDS.map((t) => c(`tool.${t}`, TOOL_INFO[t].label, "Tool", TOOL_KEYS[t]?.keys, TOOL_KEYS[t]?.sets, TOOL_INFO[t].description)),
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((d) => [d.id, d]));

export type MenuEntry = string | "-" | { label: string; items: MenuEntry[] };
export interface MenuDef { id: string; label: string; items: MenuEntry[] }

export const MENUS: MenuDef[] = [
  { id: "file", label: "File", items: ["file.new", "file.open", "-", "file.close", "file.save", "file.saveCopy", "file.saveComputer", "file.rename", "file.revert", "-", "file.documentSetup", "-", "file.exit"] },
  { id: "edit", label: "Edit", items: [
    "edit.undo", "edit.redo", "-", "edit.cut", "edit.copy", "edit.paste", "edit.pasteFront", "edit.pasteBack", "edit.pasteInPlace", "-",
    "edit.duplicate", "edit.transformAgain", "edit.delete", "edit.selectAll", "-",
    { label: "Reset", items: ["edit.reset.field", "edit.reset.section", "edit.reset.workspace", "edit.reset.preferences"] }, "-",
    "edit.shortcuts", "edit.preferences",
  ] },
  { id: "object", label: "Object", items: [
    { label: "Transform", items: ["object.move", "object.rotate90", "object.rotate-90", "object.reflectH", "object.reflectV", "object.resetBox"] },
    { label: "Arrange", items: ["object.front", "object.forward", "object.backward", "object.back"] },
    { label: "Align", items: ["object.align.left", "object.align.hcenter", "object.align.right", "-", "object.align.top", "object.align.vcenter", "object.align.bottom"] },
    { label: "Distribute", items: ["object.distribute.x", "object.distribute.y"] }, "-",
    "object.group", "object.ungroup", "-", "object.lock", "object.unlockAll", "object.hide", "object.showAll", "-",
    { label: "Compound Path", items: ["object.compound.make", "object.compound.release"] },
    { label: "Clipping Mask", items: ["object.clip.make", "object.clip.release"] },
    "object.expand", "-",
    { label: "Sheets", items: ["object.sheets.fit", "object.sheets.add"] },
  ] },
  { id: "type", label: "Type", items: ["type.outlines", { label: "Change Case", items: ["type.case.upper", "type.case.lower", "type.case.title"] }, { label: "Direction", items: ["type.dir.ltr", "type.dir.rtl"] }] },
  { id: "select", label: "Select", items: ["edit.selectAll", "select.none", "select.inverse", "-", { label: "Same", items: ["select.sameLayer", "select.sameType"] }, { label: "Object", items: ["select.openPaths"] }, "-", "select.next", "select.prev"] },
  { id: "path", label: "Path", items: [
    "path.join", "path.close", "path.reverse", "path.breakApart", "path.addAnchors", "-",
    "path.offset", "path.simplify", "path.smooth", "path.roundCorners", "-",
    { label: "Shape Modes", items: ["path.pf.unite", "path.pf.minusFront", "path.pf.minusBack", "path.pf.intersect", "path.pf.exclude"] },
    { label: "Pathfinders", items: ["path.pf.divide", "path.pf.trim", "path.pf.crop"] }, "-",
    "path.cleanup",
  ] },
  { id: "laser", label: "Laser", items: [{ label: "Assign to Layer", items: LAYER_KEYS.map((l) => l.id) }] },
  { id: "view", label: "View", items: [
    "view.zoomIn", "view.zoomOut", "view.fitArtboard", "view.fitAll", "view.actual", "view.zoomSelection", "-", "view.outline", "-",
    "view.rulers", { label: "Guides", items: ["view.guides.show", "view.guides.lock", "view.guides.fromSelection", "view.guides.clear"] },
    "view.grid", "view.snapGrid", "view.snapPoint", "view.smartGuides", "-", "view.presentation",
    { label: "Theme", items: ["view.theme.dark", "view.theme.darker", "view.theme.light", "view.theme.system"] },
  ] },
  { id: "window", label: "Window", items: [
    "window.panel.properties", "window.panel.layers", "window.panel.cutLayers", "window.panel.align", "window.panel.history", "window.panel.document", "-",
    { label: "Workspace", items: ["window.workspace.essentials", "window.workspace.laser", "window.workspace.typography", "window.workspace.minimal", "-", "window.workspace.reset"] }, "-",
    "window.palette",
  ] },
  { id: "help", label: "Help", items: ["help.search", "help.shortcuts", "help.whatsNew", "-", "help.about"] },
];

/** Shortcuts per command for a set, with the user's custom bindings on top. */
export function bindingsFor(set: ShortcutSet, custom: Record<string, string[]> = {}): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const d of COMMANDS) {
    const keys = custom[d.id] ?? (set !== "hingelab" && d.sets?.[set] ? d.sets[set]! : d.keys ?? []);
    if (keys.length) out.set(d.id, keys);
  }
  return out;
}

/** Shortcuts used by more than one command. */
export function conflicts(bindings: Map<string, string[]>): { key: string; ids: string[] }[] {
  const byKey = new Map<string, Set<string>>();
  for (const [id, keys] of bindings) for (const k of keys) {
    const ck = canonical(k);
    byKey.set(ck, (byKey.get(ck) ?? new Set()).add(id));
  }
  return [...byKey].filter(([, ids]) => ids.size > 1).map(([key, ids]) => ({ key, ids: [...ids] }));
}

/** Every command id a menu refers to (for checks). */
export function menuIds(entries: MenuEntry[] = MENUS.flatMap((m) => m.items)): string[] {
  return entries.flatMap((e) => (e === "-" ? [] : typeof e === "string" ? [e] : menuIds(e.items)));
}

/** Single-key shortcuts (no Ctrl/Alt) must not fire while the user types. */
export function isSingleKey(shortcut: string): boolean {
  return !/\b(ctrl|alt|cmd)\b/i.test(shortcut) && !/^F\d+$/i.test(shortcut.replace(/^shift\+/i, ""));
}
