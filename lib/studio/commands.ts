/**
 * The command registry (spec §9): every command the editor can run, with its label, category and
 * default shortcuts per shortcut set. Menus, the toolbar, context menus, the command palette and the
 * keyboard all read from here; the editor supplies what each command does.
 */
import { EFFECT_META, EFFECT_ORDER } from "./effects/meta";
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
  /** Other names the command palette matches (other apps' terms). */
  keywords?: string;
}

const c = (id: string, label: string, category: Category, keys?: string | string[], sets?: CommandDef["sets"], description?: string, keywords?: string): CommandDef =>
  ({ id, label, category, ...(keys ? { keys: Array.isArray(keys) ? keys : [keys] } : {}), ...(sets ? { sets } : {}), ...(description ? { description } : {}), ...(keywords ? { keywords } : {}) });

export const TOOL_IDS = [
  "select", "direct", "pen", "pencil", "line", "rect", "ellipse", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart",
  "grid", "spiral", "text", "rotate", "scale", "reflect", "hand", "zoom",
  "lasso", "magicWand", "curvature", "scissors", "knife", "eraser", "shear", "shapeBuilder", "eyedropper", "measure",
  "fill", "calligraphy", "tweak", "spray",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_INFO: Record<ToolId, { label: string; description: string; keywords?: string }> = {
  select: { label: "Selection", description: "Select, move, scale and rotate objects." },
  direct: { label: "Direct Selection", description: "Select objects inside groups and edit path nodes." },
  pen: { label: "Pen", description: "Click for corners, drag for curves. Click the first node to close." },
  pencil: { label: "Pencil", description: "Draw freehand; the line is smoothed when you let go." },
  line: { label: "Line Segment", description: "Drag a straight line. Shift keeps 45° steps, Ctrl+Shift the snap angle (Preferences)." },
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
  rotate: { label: "Rotate", description: "Drag to rotate the selection around its rotation centre; Shift snaps to the snap angle (Preferences). Drag the centre marker to move it, double-click it to reset." },
  scale: { label: "Scale", description: "Drag to scale the selection from its centre. Shift keeps proportions." },
  reflect: { label: "Reflect", description: "Click to mirror the selection left–right; Alt+click mirrors top–bottom." },
  hand: { label: "Hand", description: "Drag to pan. Hold Space with any tool." },
  zoom: { label: "Zoom", description: "Click to zoom in, Alt+click to zoom out, drag to zoom to an area." },
  lasso: { label: "Lasso", description: "Draw freehand around objects to select them. Shift adds, Alt removes." },
  magicWand: { label: "Magic Wand", description: "Click an object to select everything on the same cut layer. Shift adds." },
  curvature: { label: "Curvature", description: "Click points and the curve flows through them. Alt+click for a corner, click the first point to close, Enter to finish." },
  scissors: { label: "Scissors", description: "Click a path to cut it there: closed paths open, open paths split in two." },
  knife: { label: "Knife", description: "Drag across shapes to slice them into pieces. Hold Alt for a straight cut, Shift for 45° steps, Ctrl+Shift for the snap angle." },
  eraser: { label: "Eraser", description: "Drag to erase: cut away what the brush covers, or delete every object it touches. Works on the selection, or everything.", keywords: "rubber delete objects cut away" },
  shear: { label: "Shear", description: "Drag sideways to slant the selection horizontally, up or down to slant it vertically." },
  shapeBuilder: { label: "Shape Builder", description: "Select overlapping shapes, then drag across regions to merge them. Alt+click a region to delete it." },
  eyedropper: { label: "Eyedropper", description: "Click an object to give the selection its cut layer (and font, for text)." },
  measure: { label: "Measure", description: "Drag to measure distance, angle and the lengths of the paths it crosses; Enter keeps it as a dimension.", keywords: "ruler distance dimension length" },
  fill: { label: "Fill Bounded Area", description: "Click inside an area closed by any mix of paths to fill it with a new shape. Shift+click adds to the last fill, Alt+click removes.", keywords: "paint bucket live paint flood fill region" },
  calligraphy: { label: "Calligraphy", description: "Draw with a flat nib: the stroke becomes a filled outline whose width follows the nib angle, speed and pressure.", keywords: "brush nib ink lettering pen" },
  tweak: { label: "Tweak", description: "Brush over objects or nodes to push, shrink, attract, roughen, move, scale or rotate them. Alt inverts.", keywords: "sculpt push brush warp" },
  spray: { label: "Spray", description: "Spray copies or clones of the selection around the brush, or one combined path. Optional no-overlap for laser parts.", keywords: "scatter spray can copies" },
};

const TOOL_KEYS: Partial<Record<ToolId, { keys?: string; sets?: CommandDef["sets"] }>> = {
  select: { keys: "V", sets: { inkscape: ["S"] } },
  direct: { keys: "A", sets: { corel: ["F10"], lightburn: ["Ctrl+`"], inkscape: ["N"] } },
  pen: { keys: "P", sets: { inkscape: ["B", "Shift+F6"] } },
  pencil: { keys: "N", sets: { corel: ["F5"], inkscape: ["P", "F6"] } },
  line: { keys: "\\", sets: { lightburn: ["L"], inkscape: [] } },
  rect: { keys: "M", sets: { corel: ["F6"], lightburn: ["R"], inkscape: ["R", "F4"] } },
  ellipse: { keys: "L", sets: { corel: ["F7"], lightburn: ["E"], inkscape: ["E", "F5"] } },
  polygon: { sets: { corel: ["Y"] } },
  star: { sets: { inkscape: ["*", "Shift+F9"] } },
  spiral: { sets: { inkscape: ["I", "F9"] } },
  text: { keys: "T", sets: { corel: ["F8"], inkscape: ["T", "F8"] } },
  rotate: { keys: "R", sets: { corel: [], lightburn: [], inkscape: [] } },
  scale: { keys: "S", sets: { inkscape: [] } },
  reflect: { keys: "O", sets: { lightburn: [], inkscape: [] } },
  hand: { keys: "H", sets: { inkscape: [] } },
  zoom: { keys: "Z", sets: { inkscape: ["Z", "F3"] } },
  lasso: { keys: "Q", sets: { inkscape: [] } },
  magicWand: { keys: "Y", sets: { corel: [], inkscape: [] } },
  curvature: { keys: "Shift+`", sets: { inkscape: [] } },
  scissors: { keys: "C", sets: { corel: [], inkscape: [] } },
  eraser: { keys: "Shift+E", sets: { corel: ["X"] } },
  shapeBuilder: { keys: "Shift+M", sets: { inkscape: ["X"] } },
  eyedropper: { keys: "I", sets: { inkscape: ["D", "F7"] } },
  measure: { sets: { inkscape: ["M"] } },
  fill: { sets: { inkscape: ["U", "Shift+F7"] } },
  calligraphy: { sets: { inkscape: ["C", "Ctrl+F6"] } },
  tweak: { sets: { inkscape: ["W", "Shift+F2"] } },
  spray: { sets: { inkscape: ["A", "Shift+F3"] } },
};

const LAYER_KEYS = Array.from({ length: 30 }, (_, k) =>
  c(`laser.assign.${k}`, `Assign to C${String(k).padStart(2, "0")}`, "Laser", k < 10 ? `Alt+${k}` : undefined));

export const COMMANDS: CommandDef[] = [
  // File
  c("file.new", "New…", "File", "Ctrl+Alt+N", undefined, "Open the start screen to create a project. (Ctrl+N belongs to the browser.)"),
  c("file.open", "Open…", "File", "Ctrl+O"),
  c("file.close", "Close", "File", "Ctrl+Alt+W"),
  c("file.save", "Save", "File", "Ctrl+S"),
  c("file.saveCopy", "Save a Copy…", "File", "Ctrl+Alt+S", { inkscape: ["Ctrl+Shift+Alt+S", "Ctrl+Alt+S"] }),
  c("file.saveComputer", "Save to Computer (.hingelab)", "File"),
  c("file.rename", "Rename…", "File", "F2"),
  c("file.revert", "Revert to Saved", "File"),
  c("file.documentSetup", "Document Setup…", "File", "Ctrl+Alt+P", { inkscape: ["Ctrl+Shift+D", "Ctrl+Alt+P"] }, "Page size, units, background, guides and grids", "document properties page setup sheet size grid guides background units"),
  c("file.exit", "Exit to Start Screen", "File"),
  // Edit
  c("edit.undo", "Undo", "Edit", "Ctrl+Z"),
  c("edit.redo", "Redo", "Edit", "Ctrl+Shift+Z", { inkscape: ["Ctrl+Shift+Z", "Ctrl+Y"] }),
  c("edit.cut", "Cut", "Edit", "Ctrl+X"),
  c("edit.copy", "Copy", "Edit", "Ctrl+C"),
  c("edit.paste", "Paste", "Edit", "Ctrl+V"),
  c("edit.pasteFront", "Paste in Front", "Edit", "Ctrl+F"),
  c("edit.pasteBack", "Paste in Back", "Edit", "Ctrl+B"),
  c("edit.pasteInPlace", "Paste in Place", "Edit", "Ctrl+Shift+V", { lightburn: [], inkscape: ["Ctrl+Alt+V"] }),
  c("edit.pasteStyle", "Paste Style", "Edit", undefined, { inkscape: ["Ctrl+Shift+V"] }, "The selection takes the copied object's cut layer and Live Effects", "match properties copy attributes format painter"),
  c("edit.pasteSize.width", "Paste Width", "Edit", undefined, undefined, "Scale the selection to the copied object's width", "paste size match width"),
  c("edit.pasteSize.height", "Paste Height", "Edit", undefined, undefined, "Scale the selection to the copied object's height", "paste size match height"),
  c("edit.pasteSize.both", "Paste Size", "Edit", undefined, undefined, "Scale the selection to the copied object's width and height", "paste size match size"),
  c("edit.pasteSize.widthSep", "Paste Width Separately", "Edit", undefined, undefined, "Scale each selected object to the copied object's width", "paste size match width each"),
  c("edit.pasteSize.heightSep", "Paste Height Separately", "Edit", undefined, undefined, "Scale each selected object to the copied object's height", "paste size match height each"),
  c("edit.pasteSize.bothSep", "Paste Size Separately", "Edit", undefined, undefined, "Scale each selected object to the copied object's width and height", "paste size match size each"),
  c("edit.duplicate", "Duplicate", "Edit", "Ctrl+D"),
  c("edit.transformAgain", "Transform Again", "Edit", "Ctrl+Alt+D", { inkscape: ["Ctrl+Alt+T"] }, "Repeat the last move, scale, rotate or shear on the selection", "reapply transform repeat again"),
  c("edit.delete", "Delete", "Edit", ["Delete", "Backspace"]),
  c("edit.selectAll", "Select All", "Select", "Ctrl+A", { inkscape: ["Ctrl+A", "Ctrl+Alt+A"] }),
  c("edit.reset.field", "Selected Field", "Edit"),
  c("edit.reset.section", "Section", "Edit"),
  c("edit.reset.workspace", "Workspace", "Edit"),
  c("edit.reset.preferences", "All Preferences…", "Edit"),
  c("edit.shortcuts", "Keyboard Shortcuts…", "Edit", "Ctrl+Alt+Shift+K", { inkscape: [] }),
  c("edit.preferences", "Preferences…", "Edit", "Ctrl+K", { corel: ["Ctrl+J"], inkscape: ["Ctrl+Shift+P"] }),
  // Object
  c("object.move", "Move…", "Object", "Ctrl+Shift+M", { inkscape: [] }),
  c("object.transform", "Transform…", "Object", undefined, { inkscape: ["Ctrl+Shift+M"] }, "Move, scale, rotate, skew or set the matrix by exact values — the whole selection or each object", "transform dialog skew shear matrix scale rotate move"),
  c("object.arrange", "Arrange…", "Object", undefined, undefined, "Lay the selected objects out in a grid or round a circle or ellipse", "arrange grid polar circle layout rows columns"),
  c("object.clone", "Clone", "Object", undefined, { inkscape: ["Alt+D"] }, "A linked copy that follows every change to the original", "clone linked copy symbol instance use"),
  c("object.clone.unlink", "Unlink Clone", "Object", undefined, { inkscape: ["Shift+Alt+D"] }, "Turn clones into ordinary paths", "unlink clone release symbol break link"),
  c("object.clone.selectOriginal", "Select Original", "Object", undefined, { inkscape: ["Shift+D"] }, "Select the object the clone follows", "clone original source symbol"),
  c("object.clone.relink", "Relink to Copied", "Object", undefined, undefined, "Make the selected clones follow the copied object instead", "relink clone symbol replace"),
  c("object.clone.linkedOffset", "Linked Offset", "Object", undefined, { inkscape: ["Ctrl+Alt+D"] }, "A clone with a live Offset effect — follows the original at a distance", "linked offset clone outset inset kerf"),
  c("object.clone.tiled", "Create Tiled Clones…", "Object", undefined, undefined, "Fill an area with clones of one object using any of the 17 symmetry groups", "tiled clones pattern fill wallpaper symmetry tile"),
  c("object.clone.removeTiled", "Remove Tiled Clones", "Object", undefined, undefined, "Delete the clones of the selected objects", "tiled clones remove delete pattern"),
  c("object.removeOverlaps", "Remove Overlaps", "Object", undefined, undefined, "Push overlapping objects apart, keeping the Align panel gap between them", "remove overlaps spread separate"),
  c("object.exchange.selection", "Exchange Positions (Selection Order)", "Object", undefined, undefined, "Each object moves to the next one's place, in the order you selected them", "exchange swap positions"),
  c("object.exchange.stack", "Exchange Positions (Stacking Order)", "Object", undefined, undefined, "Each object moves to the next one's place, bottom to top", "exchange swap positions z-order"),
  c("object.exchange.clockwise", "Exchange Positions (Clockwise)", "Object", undefined, undefined, "Each object moves to the next one's place going clockwise", "exchange swap positions rotate"),
  c("object.exchange.random", "Exchange Positions (Random)", "Object", undefined, undefined, "Shuffle the objects' places", "exchange swap positions shuffle random"),
  c("object.rotate90", "Rotate 90° Clockwise", "Object", undefined, { inkscape: ["Ctrl+]"] }),
  c("object.rotate-90", "Rotate 90° Counter-clockwise", "Object", undefined, { inkscape: ["Ctrl+["] }),
  c("object.reflectH", "Reflect Left–Right", "Object", undefined, { lightburn: ["Ctrl+Shift+H"], inkscape: ["H"] }),
  c("object.reflectV", "Reflect Top–Bottom", "Object", undefined, { lightburn: ["Ctrl+Shift+V"], inkscape: ["V"] }),
  c("object.resetBox", "Reset Bounding Box", "Object"),
  c("object.front", "Bring to Front", "Object", "Ctrl+Shift+]", { corel: ["Shift+PageUp"], inkscape: ["Home"] }),
  c("object.forward", "Bring Forward", "Object", "Ctrl+]", { corel: ["Ctrl+PageUp"], inkscape: ["PageUp"] }),
  c("object.backward", "Send Backward", "Object", "Ctrl+[", { corel: ["Ctrl+PageDown"], inkscape: ["PageDown"] }),
  c("object.back", "Send to Back", "Object", "Ctrl+Shift+[", { corel: ["Shift+PageDown"], inkscape: ["End"] }),
  c("object.align.left", "Align Left", "Object", undefined, { corel: ["L"], inkscape: ["Ctrl+Alt+4"] }),
  c("object.align.hcenter", "Align Horizontal Centres", "Object", undefined, { corel: ["E"], inkscape: ["Ctrl+Alt+1"] }),
  c("object.align.right", "Align Right", "Object", undefined, { corel: ["R"], inkscape: ["Ctrl+Alt+6"] }),
  c("object.align.top", "Align Top", "Object", undefined, { corel: ["T"], inkscape: ["Ctrl+Alt+8"] }),
  c("object.align.vcenter", "Align Vertical Centres", "Object", undefined, { corel: ["C"], inkscape: ["Ctrl+Alt+7"] }),
  c("object.align.bottom", "Align Bottom", "Object", undefined, { corel: ["B"], inkscape: ["Ctrl+Alt+2"] }),
  c("object.distribute.x", "Distribute Horizontally", "Object"),
  c("object.distribute.y", "Distribute Vertically", "Object"),
  c("object.group", "Group", "Object", "Ctrl+G", { inkscape: ["Ctrl+G", "Ctrl+Shift+U"] }),
  c("object.ungroup", "Ungroup", "Object", "Ctrl+Shift+G", { corel: ["Ctrl+U"], lightburn: ["Ctrl+U"] }),
  c("object.lock", "Lock", "Object", "Ctrl+2"),
  c("object.unlockAll", "Unlock All", "Object", "Ctrl+Alt+2", { inkscape: [] }),
  c("object.hide", "Hide", "Object", "Ctrl+3"),
  c("object.showAll", "Show All", "Object", "Ctrl+Alt+3"),
  c("object.compound.make", "Make Compound Path", "Object", "Ctrl+8", { corel: ["Ctrl+L"], inkscape: ["Ctrl+K"] }, undefined, "combine paths combine curves"),
  c("object.compound.release", "Release Compound Path", "Object", "Ctrl+Alt+Shift+8"),
  c("object.clip.make", "Make Clipping Mask", "Object", "Ctrl+7", { inkscape: [] }, undefined, "set clip powerclip place inside frame container mask"),
  c("object.clip.release", "Release Clipping Mask", "Object", "Ctrl+Alt+7", { inkscape: ["Alt+M"] }, undefined, "release clip extract contents powerclip"),
  c("object.expand", "Expand", "Object", undefined, { corel: ["Ctrl+Q"], inkscape: ["Ctrl+Shift+C"] }, "Turn live shapes and text into plain paths (Object to Path) and apply Live Effects.", "object to path convert to curves outline apply live effects bake"),
  c("object.sheets.fit", "Fit Sheet to Artwork", "Object", undefined, { inkscape: ["Ctrl+Shift+R"] }, undefined, "resize page to drawing selection"),
  c("object.sheets.add", "Add Sheet", "Object"),
  // Type
  c("type.outlines", "Create Outlines", "Type", "Ctrl+Shift+O", { inkscape: [] }),
  c("type.dir.ltr", "Left to Right", "Type"),
  c("type.dir.rtl", "Right to Left", "Type"),
  c("type.case.upper", "UPPERCASE", "Type"),
  c("type.case.lower", "lowercase", "Type"),
  c("type.case.title", "Title Case", "Type"),
  // Select
  c("select.none", "Deselect", "Select", "Ctrl+Shift+A", { inkscape: [] }),
  c("select.inverse", "Inverse", "Select", undefined, { inkscape: ["Shift+1"] }),
  c("select.sameLayer", "Same Cut Layer", "Select", undefined, undefined, undefined, "same fill same stroke same colour"),
  c("select.sameType", "Same Object Type", "Select", undefined, { inkscape: ["Shift+Alt+A"] }),
  c("select.openPaths", "Open Paths", "Select"),
  c("select.next", "Next Object", "Select", "Tab"),
  c("select.prev", "Previous Object", "Select", "Shift+Tab"),
  // Path
  c("path.join", "Join", "Path", "Ctrl+J", { corel: [], inkscape: [] }),
  c("path.close", "Close Path", "Path"),
  c("path.reverse", "Reverse Direction", "Path", undefined, { inkscape: ["Shift+R"] }),
  c("path.breakApart", "Break Apart", "Path", undefined, { corel: ["Ctrl+K"], inkscape: ["Ctrl+Shift+K"] }),
  c("path.addAnchors", "Add Anchor Points", "Path"),
  c("path.offset", "Offset Path…", "Path", undefined, { corel: ["Ctrl+F9"] }, "Grow or shrink outlines by a distance — kerf compensation, inlays, borders", "contour outset inset kerf"),
  c("path.simplify", "Simplify…", "Path", undefined, { inkscape: ["Ctrl+L"] }, "Fewer anchor points within a tolerance"),
  c("path.smooth", "Smooth", "Path", undefined, undefined, "Turn every anchor into a smooth curve point"),
  c("path.roundCorners", "Round Corners…", "Path", undefined, undefined, "Fillet or chamfer sharp corners"),
  c("path.pf.unite", "Unite", "Path", undefined, { corel: [] }, "Merge the selected shapes into one outline", "union weld merge"),
  c("path.pf.minusFront", "Minus Front", "Path", undefined, undefined, "Cut the front shapes out of the back one", "difference subtract back minus front"),
  c("path.pf.minusBack", "Minus Back", "Path", undefined, undefined, "Cut the back shapes out of the front one", "subtract front"),
  c("path.pf.intersect", "Intersect", "Path", undefined, { inkscape: ["Ctrl+*"] }, "Keep only where all shapes overlap", "intersection"),
  c("path.pf.exclude", "Exclude Overlap", "Path", undefined, { inkscape: ["Ctrl+^"] }, "Keep everything except the overlaps", "exclusion xor"),
  c("path.pf.divide", "Divide", "Path", undefined, undefined, "Split the shapes into every separate piece", "division"),
  c("path.fracture", "Fracture", "Path", undefined, { inkscape: ["Shift+Alt+F"] }, "Split overlapping shapes into every non-overlapping piece, each its own path", "divide pieces"),
  c("path.flatten", "Flatten", "Path", undefined, { inkscape: ["Shift+F"] }, "Remove the hidden parts of each shape; shapes hidden completely are deleted", "remove overlap trim"),
  c("path.cutPath", "Cut Path", "Path", undefined, undefined, "The top path cuts the lines of the paths below into open pieces where it crosses them", "split stroke slice"),
  c("path.splitPath", "Split Path", "Path", undefined, { inkscape: ["Ctrl+Shift+Alt+K"] }, "One path per outer contour; holes stay with the contour around them", "break apart separate"),
  c("path.strokeToPath", "Stroke to Path…", "Path", undefined, { inkscape: ["Ctrl+Alt+C"] }, "Replace each line by the filled outline of its stroke at a width — engrave lines as areas", "outline stroke expand stroke"),
  c("path.inset", "Inset", "Path", undefined, { inkscape: ["Ctrl+("] }, "Shrink closed shapes by the inset/outset step (Preferences)", "shrink offset contract"),
  c("path.outset", "Outset", "Path", undefined, { inkscape: ["Ctrl+)"] }, "Grow closed shapes by the inset/outset step (Preferences)", "grow offset expand"),
  c("path.dynamicOffset", "Dynamic Offset", "Path", undefined, { inkscape: ["Ctrl+J"] }, "Add a live Offset effect you can change later in the Live Effects panel", "dynamic offset live inset outset kerf"),
  c("path.removeDuplicates", "Remove Duplicate Nodes", "Path", undefined, undefined, "Merge nodes that sit on top of each other", "clean up points"),
  c("path.traceBitmap", "Trace Bitmap…", "Path", undefined, { inkscape: ["Shift+Alt+B"] }, "Turn the selected image into vector paths: brightness, edges, colours, multiple scans or centre-lines", "image trace vectorize vectorise live trace bitmap raster to vector"),
  c("path.joinNearby", "Join Nearby Endpoints…", "Path", undefined, undefined, "Connect open ends that are closer than a tolerance — fixes imported drawings", "close gaps weld ends"),
  // Nodes (Direct Selection)
  c("node.insert", "Insert Nodes", "Path", undefined, { inkscape: ["Insert", "Shift+I"] }, "Add a node in the middle of each selected segment", "add node anchor midpoint"),
  c("node.break", "Break Path at Nodes", "Path", undefined, { inkscape: ["Shift+B"] }, "Open or split the path at the selected nodes"),
  c("node.join", "Join Nodes", "Path", undefined, { inkscape: ["Shift+J"] }, "Merge two selected end nodes into one"),
  c("node.joinSegment", "Join Nodes with Segment", "Path", undefined, { inkscape: ["Alt+J"] }, "Connect two selected end nodes with a straight segment"),
  c("node.deleteSegment", "Delete Segment", "Path", undefined, { inkscape: ["Alt+Delete", "Alt+Backspace"] }, "Remove the segment between two selected nodes"),
  c("node.corner", "Make Nodes Corner", "Path", undefined, { inkscape: ["Shift+C"] }, "Handles move independently", "cusp node type"),
  c("node.smooth", "Make Nodes Smooth", "Path", undefined, { inkscape: ["Shift+S"] }, "Handles stay in line", "node type"),
  c("node.symmetric", "Make Nodes Symmetric", "Path", undefined, { inkscape: ["Shift+Y"] }, "Handles in line and of equal length", "node type"),
  c("node.auto", "Make Nodes Auto-Smooth", "Path", undefined, { inkscape: ["Shift+A"] }, "Handles follow the neighbouring nodes", "auto smooth node type"),
  c("node.straighten", "Straighten Segments", "Path", undefined, { inkscape: ["Shift+L"] }, "Selected segments become straight lines", "line"),
  c("node.curve", "Make Segments Curves", "Path", undefined, { inkscape: ["Shift+U"] }, "Selected straight segments get curve handles"),
  c("node.scaleUp", "Scale Nodes Up", "Path", undefined, { inkscape: [">"] }, "Spread the selected nodes 10% from their centre"),
  c("node.scaleDown", "Scale Nodes Down", "Path", undefined, { inkscape: ["<"] }, "Draw the selected nodes 10% towards their centre"),
  c("node.rotateCCW", "Rotate Nodes Counter-clockwise", "Path", undefined, { inkscape: ["["] }, "Turn the selected nodes by the snap angle (Preferences) around their centre"),
  c("node.rotateCW", "Rotate Nodes Clockwise", "Path", undefined, { inkscape: ["]"] }, "Turn the selected nodes by the snap angle (Preferences) around their centre"),
  c("path.pf.trim", "Trim", "Path", undefined, undefined, "Remove the hidden parts of each shape"),
  c("path.pf.crop", "Crop", "Path", undefined, undefined, "Cut the shapes behind to the front shape"),
  c("path.cleanup", "Clean Up for Laser", "Path", undefined, undefined, "Close near-closed paths, drop stray points, empty paths and double cuts"),
  ...EFFECT_ORDER.map((k) => c(`path.effect.add.${k}`, `Add Live Effect: ${EFFECT_META[k].label}`, "Path", undefined, undefined, EFFECT_META[k].description, `path effect lpe live effect ${EFFECT_META[k].keywords}`)),
  c("path.effect.expand", "Expand Live Effects", "Path", undefined, undefined, "Apply the Live Effects: the result becomes a plain path", "object to path bake flatten apply path effect lpe"),
  // Laser
  ...LAYER_KEYS,
  // View
  c("view.zoomIn", "Zoom In", "View", ["Ctrl+=", "Ctrl++"], { inkscape: ["Ctrl+=", "Ctrl++", "=", "+"] }),
  c("view.zoomOut", "Zoom Out", "View", "Ctrl+-", { inkscape: ["Ctrl+-", "-"] }),
  c("view.fitArtboard", "Fit Artboard", "View", "Ctrl+0", { inkscape: ["5"] }, "Zoom so the whole sheet fits the window", "zoom page fit page"),
  c("view.fitAll", "Fit All", "View", "Ctrl+Alt+0", { corel: ["F4"], inkscape: ["4", "Ctrl+Alt+0"] }, "Zoom so every object fits the window", "zoom drawing fit drawing"),
  c("view.actual", "Actual Size", "View", "Ctrl+1", { inkscape: ["1"] }, "Zoom 1:1 — real size on screen", "zoom 1:1 100%"),
  c("view.zoom.half", "Zoom 1:2", "View", undefined, { inkscape: ["2"] }, "Half of real size", "zoom 50% half"),
  c("view.zoom.double", "Zoom 2:1", "View", undefined, undefined, "Twice real size", "zoom 200% double"),
  c("view.zoomSelection", "Zoom to Selection", "View", "Ctrl+Shift+0", { corel: ["Shift+F2"], inkscape: ["3"] }, undefined, "fit selection"),
  c("view.zoom.prev", "Previous Zoom", "View", undefined, { inkscape: ["`"] }, "Go back to the zoom and position before the last zoom change", "zoom history back"),
  c("view.zoom.next", "Next Zoom", "View", undefined, { inkscape: ["Shift+`"] }, "Go forward again in the zoom history", "zoom history forward"),
  c("view.rotate.cw", "Rotate View Clockwise", "View", undefined, undefined, "Turn the canvas by the snap angle (Preferences); the drawing itself does not change", "rotate canvas turn view"),
  c("view.rotate.ccw", "Rotate View Counter-clockwise", "View", undefined, undefined, "Turn the canvas back by the snap angle (Preferences); the drawing itself does not change", "rotate canvas turn view"),
  c("view.rotate.reset", "Reset View Rotation & Flip", "View", undefined, undefined, "Show the canvas upright and unmirrored again", "rotate canvas reset flip"),
  c("view.flipH", "Flip View Horizontally", "View", undefined, undefined, "Mirror the canvas left–right on screen only — handy to check a design; nothing in the file changes", "flip canvas mirror view"),
  c("view.flipV", "Flip View Vertically", "View", undefined, undefined, "Mirror the canvas top–bottom on screen only; nothing in the file changes", "flip canvas mirror view"),
  c("view.outline", "Outline Mode", "View", "Ctrl+Y", { inkscape: ["Ctrl+5"] }, undefined, "wireframe display mode"),
  c("view.outlineOverlay", "Outline Overlay", "View", undefined, undefined, "Draw the outlines on top of the normal view, which fades back", "wireframe display mode overlay"),
  c("view.split", "Split View", "View", undefined, undefined, "Normal on the left, outlines on the right of a divider you can drag", "split canvas outline compare"),
  c("view.rulers", "Rulers", "View", "Ctrl+R"),
  c("view.guides.show", "Show Guides", "View", "Ctrl+;", { inkscape: ["Shift+\\", "Ctrl+;"] }),
  c("view.guides.lock", "Lock Guides", "View", "Ctrl+Alt+;"),
  c("view.guides.fromSelection", "Make Guides from Selection", "View", "Ctrl+5", { inkscape: ["Shift+G"] }, undefined, "object to guides"),
  c("view.guides.clear", "Clear Guides", "View"),
  c("view.grid", "Grid", "View", "Ctrl+'", { inkscape: ["Shift+3", "Ctrl+'"] }),
  c("view.snap.toggle", "Snapping", "View", undefined, { inkscape: ["Shift+5"] }, "Turn all snapping on or off; the snapping options stay as they are", "snap enable disable global"),
  c("view.snap.options", "Snapping Options…", "View", undefined, undefined, "Choose what snaps to what: boxes, nodes, paths, centres, page, guides and grid", "snap bar snap controls targets"),
  c("view.snapGrid", "Snap to Grid", "View", "Ctrl+Shift+'"),
  c("view.snapPoint", "Snap to Point", "View", "Ctrl+Alt+'"),
  c("view.smartGuides", "Smart Guides", "View", "Ctrl+U", { corel: ["Alt+Shift+D"], lightburn: [] }),
  c("view.swatchBar", "Swatch Bar", "View", undefined, { inkscape: ["Shift+Alt+P"] }, "Cut-layer swatches under the canvas: click assigns the selection, Shift+click selects the layer", "palette swatches colours fill and stroke"),
  c("view.nodeHandles", "Show Handles of All Nodes", "View", undefined, { inkscape: ["Ctrl+H"] }, "Direct Selection shows the curve handles of every node, not only the selected ones"),
  c("view.pathDirection", "Show Path Direction", "View", undefined, undefined, "Direct Selection draws arrows along the edited paths in their drawing direction", "path outline direction arrows"),
  c("view.presentation", "Presentation Mode", "View", "F"),
  c("view.theme.dark", "Dark", "View"),
  c("view.theme.darker", "Darker", "View"),
  c("view.theme.light", "Light", "View"),
  c("view.theme.system", "System", "View"),
  // Window
  c("object.stepRepeat", "Step and Repeat…", "Object", undefined, { corel: ["Ctrl+Shift+D"] }, "Copies that each move, turn and scale from the one before"),
  c("object.transformEach", "Transform Each…", "Object", "Ctrl+Alt+Shift+D", undefined, "Scale, move and turn every object around its own centre"),
  c("object.array.grid", "Grid Array…", "Object", undefined, undefined, "Rows and columns of the selection with exact gaps — nesting parts on a sheet"),
  c("object.array.circular", "Circular Array…", "Object", undefined, undefined, "Copies spread round a circle"),
  c("object.array.path", "Repeat Along Path…", "Object", undefined, undefined, "Copies spaced evenly along the top-most selected path"),
  c("object.distribute.spaceX", "Distribute Spacing Horizontally", "Object", undefined, undefined, "Equal (or exact) gaps between objects, left to right"),
  c("object.distribute.spaceY", "Distribute Spacing Vertically", "Object", undefined, undefined, "Equal (or exact) gaps between objects, top to bottom"),
  c("window.panel.properties", "Properties", "Window", undefined, { inkscape: ["Ctrl+Shift+O"] }, undefined, "object properties"),
  c("window.panel.layers", "Layers & Objects", "Window", undefined, { inkscape: ["Ctrl+Shift+L"] }),
  c("window.panel.cutLayers", "Cut Layers", "Window", undefined, { inkscape: ["Ctrl+Shift+F"] }, undefined, "fill and stroke colours swatches"),
  c("window.panel.align", "Align & Distribute", "Window", undefined, { inkscape: ["Ctrl+Shift+A"] }),
  c("window.panel.pathfinder", "Pathfinder", "Window", "Ctrl+Shift+F9", { corel: [] }, undefined, "shaping boolean operations"),
  c("window.panel.history", "History", "Window", undefined, { inkscape: ["Ctrl+Shift+H"] }, undefined, "undo history"),
  c("window.panel.document", "Document", "Window"),
  c("window.panel.liveEffects", "Live Effects", "Window", undefined, { inkscape: ["Ctrl+&"] }, "Non-destructive effects on the selected path: corners, offset, hatches, copies, mirror, living hinge", "path effects lpe editor"),
  c("window.panel.inspector", "Structure Inspector", "Window", undefined, { inkscape: ["Ctrl+Shift+X"] }, "Read-only tree of the selected objects: type, id, layer, transform, effects", "xml editor inspector structure json debug tree"),
  c("window.workspace.essentials", "Essentials", "Window"),
  c("window.workspace.laser", "Laser Production", "Window"),
  c("window.workspace.typography", "Typography", "Window"),
  c("window.workspace.minimal", "Minimal", "Window"),
  c("window.workspace.reset", "Reset Workspace", "Window"),
  c("window.palette", "Command Palette", "Window", "Ctrl+/", { inkscape: ["Ctrl+/", "Shift+/"] }),
  // Help
  c("help.search", "Search Help", "Help", "F1"),
  c("help.shortcuts", "Keyboard Shortcuts", "Help", "Ctrl+Alt+/"),
  c("help.whatsNew", "What's New", "Help"),
  c("help.about", "About HingeLab", "Help"),
  // Tools
  ...TOOL_IDS.map((t) => c(`tool.${t}`, TOOL_INFO[t].label, "Tool", TOOL_KEYS[t]?.keys, TOOL_KEYS[t]?.sets, TOOL_INFO[t].description, TOOL_INFO[t].keywords)),
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((d) => [d.id, d]));

export type MenuEntry = string | "-" | { label: string; items: MenuEntry[] };
export interface MenuDef { id: string; label: string; items: MenuEntry[] }

export const MENUS: MenuDef[] = [
  { id: "file", label: "File", items: ["file.new", "file.open", "-", "file.close", "file.save", "file.saveCopy", "file.saveComputer", "file.rename", "file.revert", "-", "file.documentSetup", "-", "file.exit"] },
  { id: "edit", label: "Edit", items: [
    "edit.undo", "edit.redo", "-", "edit.cut", "edit.copy", "edit.paste", "edit.pasteFront", "edit.pasteBack", "edit.pasteInPlace", "edit.pasteStyle",
    { label: "Paste Size", items: ["edit.pasteSize.both", "edit.pasteSize.width", "edit.pasteSize.height", "-", "edit.pasteSize.bothSep", "edit.pasteSize.widthSep", "edit.pasteSize.heightSep"] }, "-",
    "edit.duplicate", "edit.transformAgain", "edit.delete", "edit.selectAll", "-",
    { label: "Reset", items: ["edit.reset.field", "edit.reset.section", "edit.reset.workspace", "edit.reset.preferences"] }, "-",
    "edit.shortcuts", "edit.preferences",
  ] },
  { id: "object", label: "Object", items: [
    { label: "Transform", items: ["object.transform", "object.move", "object.transformEach", "-", "object.rotate90", "object.rotate-90", "object.reflectH", "object.reflectV", "-", "object.resetBox"] },
    { label: "Repeat", items: ["object.stepRepeat", "-", "object.array.grid", "object.array.circular", "object.array.path"] },
    { label: "Clone", items: ["object.clone", "object.clone.linkedOffset", "-", "object.clone.unlink", "object.clone.selectOriginal", "object.clone.relink", "-", "object.clone.tiled", "object.clone.removeTiled"] },
    { label: "Arrange", items: ["object.front", "object.forward", "object.backward", "object.back", "-", "object.arrange"] },
    { label: "Align", items: ["object.align.left", "object.align.hcenter", "object.align.right", "-", "object.align.top", "object.align.vcenter", "object.align.bottom"] },
    { label: "Distribute", items: [
      "object.distribute.x", "object.distribute.y", "-", "object.distribute.spaceX", "object.distribute.spaceY", "-", "object.removeOverlaps", "-",
      "object.exchange.selection", "object.exchange.stack", "object.exchange.clockwise", "object.exchange.random",
    ] }, "-",
    "object.group", "object.ungroup", "-", "object.lock", "object.unlockAll", "object.hide", "object.showAll", "-",
    { label: "Compound Path", items: ["object.compound.make", "object.compound.release"] },
    { label: "Clipping Mask", items: ["object.clip.make", "object.clip.release"] },
    "object.expand", "-",
    { label: "Sheets", items: ["object.sheets.fit", "object.sheets.add"] },
  ] },
  { id: "type", label: "Type", items: ["type.outlines", { label: "Change Case", items: ["type.case.upper", "type.case.lower", "type.case.title"] }, { label: "Direction", items: ["type.dir.ltr", "type.dir.rtl"] }] },
  { id: "select", label: "Select", items: ["edit.selectAll", "select.none", "select.inverse", "-", { label: "Same", items: ["select.sameLayer", "select.sameType"] }, { label: "Object", items: ["select.openPaths"] }, "-", "select.next", "select.prev"] },
  { id: "path", label: "Path", items: [
    "path.join", "path.close", "path.reverse", "path.breakApart", "path.splitPath", "path.addAnchors", "-",
    "path.offset", "path.inset", "path.outset", "path.dynamicOffset", "object.clone.linkedOffset", "path.strokeToPath", "path.simplify", "path.smooth", "path.roundCorners", "-",
    { label: "Shape Modes", items: ["path.pf.unite", "path.pf.minusFront", "path.pf.minusBack", "path.pf.intersect", "path.pf.exclude"] },
    { label: "Pathfinders", items: ["path.pf.divide", "path.pf.trim", "path.pf.crop", "-", "path.fracture", "path.flatten", "path.cutPath"] },
    { label: "Nodes", items: [
      "node.insert", "node.break", "node.join", "node.joinSegment", "node.deleteSegment", "-",
      "node.corner", "node.smooth", "node.symmetric", "node.auto", "-", "node.straighten", "node.curve", "-",
      "node.scaleUp", "node.scaleDown", "node.rotateCCW", "node.rotateCW",
    ] }, "-",
    "path.removeDuplicates", "path.joinNearby", "path.cleanup", "-", "path.traceBitmap", "-",
    { label: "Live Effects", items: [...EFFECT_ORDER.map((k) => `path.effect.add.${k}`), "-", "path.effect.expand", "window.panel.liveEffects"] },
  ] },
  { id: "laser", label: "Laser", items: [{ label: "Assign to Layer", items: LAYER_KEYS.map((l) => l.id) }] },
  { id: "view", label: "View", items: [
    "view.zoomIn", "view.zoomOut", "view.fitArtboard", "view.fitAll", "view.actual", "view.zoomSelection",
    { label: "Zoom", items: ["view.actual", "view.zoom.half", "view.zoom.double", "-", "view.fitArtboard", "view.fitAll", "view.zoomSelection", "-", "view.zoom.prev", "view.zoom.next"] },
    { label: "Orientation", items: ["view.rotate.cw", "view.rotate.ccw", "-", "view.flipH", "view.flipV", "-", "view.rotate.reset"] }, "-",
    "view.outline", "view.outlineOverlay", "view.split", "-",
    "view.rulers", { label: "Guides", items: ["view.guides.show", "view.guides.lock", "view.guides.fromSelection", "view.guides.clear"] },
    "view.grid", { label: "Snapping", items: ["view.snap.toggle", "view.snap.options", "-", "view.snapGrid", "view.snapPoint", "view.smartGuides"] }, "-",
    "view.swatchBar", "-", "view.nodeHandles", "view.pathDirection", "-", "view.presentation",
    { label: "Theme", items: ["view.theme.dark", "view.theme.darker", "view.theme.light", "view.theme.system"] },
  ] },
  { id: "window", label: "Window", items: [
    "window.panel.properties", "window.panel.layers", "window.panel.cutLayers", "window.panel.align", "window.panel.history", "window.panel.document", "window.panel.liveEffects", "window.panel.inspector", "-",
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

/** The name the command palette shows ("Tool: Pen", "Assign to C03", "Offset Path…"). */
export const paletteLabel = (d: CommandDef): string => (d.category === "Tool" ? `Tool: ${d.label}` : d.label);

/** What the command palette searches: name, category and other apps' names for the command. */
export const paletteSearchText = (d: { label: string; category: string; keywords?: string }): string =>
  `${d.label} ${d.category}${d.keywords ? ` ${d.keywords}` : ""}`;

/** Every command id a menu refers to (for checks). */
export function menuIds(entries: MenuEntry[] = MENUS.flatMap((m) => m.items)): string[] {
  return entries.flatMap((e) => (e === "-" ? [] : typeof e === "string" ? [e] : menuIds(e.items)));
}

/** Single-key shortcuts (no Ctrl/Alt) must not fire while the user types. */
export function isSingleKey(shortcut: string): boolean {
  return !/\b(ctrl|alt|cmd)\b/i.test(shortcut) && !/^F\d+$/i.test(shortcut.replace(/^shift\+/i, ""));
}
