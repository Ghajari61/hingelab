/**
 * Workspaces (spec §4.2): which panels the dock shows, in what order, which is open, and the dock and
 * toolbar layout. Built-ins can be changed by the user; "Reset workspace" restores the built-in layout.
 */
export const PANEL_IDS = ["properties", "layers", "cutLayers", "align", "history", "document"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_LABELS: Record<PanelId, string> = {
  properties: "Properties", layers: "Layers", cutLayers: "Cut Layers", align: "Align", history: "History", document: "Document",
};

export interface Workspace {
  id: string;
  label: string;
  panels: PanelId[];
  active: PanelId;
  dockWidth: number;
  toolbarColumns: 1 | 2;
}

export const WORKSPACES: Workspace[] = [
  { id: "essentials", label: "Essentials", panels: ["properties", "layers", "cutLayers", "align", "history", "document"], active: "properties", dockWidth: 280, toolbarColumns: 1 },
  { id: "laser", label: "Laser Production", panels: ["cutLayers", "layers", "properties", "document", "history"], active: "cutLayers", dockWidth: 300, toolbarColumns: 1 },
  { id: "typography", label: "Typography", panels: ["properties", "layers", "history"], active: "properties", dockWidth: 300, toolbarColumns: 1 },
  { id: "minimal", label: "Minimal", panels: ["properties", "layers"], active: "properties", dockWidth: 240, toolbarColumns: 1 },
];

const KEY = "hingelab-workspace";

export interface WorkspaceState { current: string; layouts: Record<string, Workspace> }

export const builtIn = (id: string): Workspace => structuredClone(WORKSPACES.find((w) => w.id === id) ?? WORKSPACES[0]);

/** Accepts stored data of any shape and returns a valid layout for the workspace. */
export function cleanWorkspace(raw: unknown, id: string): Workspace {
  const base = builtIn(id);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Workspace>;
  const panels = Array.isArray(r.panels) ? [...new Set(r.panels.filter((p): p is PanelId => (PANEL_IDS as readonly string[]).includes(p as string)))] : base.panels;
  if (!panels.length) return base;
  return {
    ...base,
    panels,
    active: panels.includes(r.active as PanelId) ? (r.active as PanelId) : panels[0],
    dockWidth: typeof r.dockWidth === "number" && r.dockWidth >= 200 && r.dockWidth <= 600 ? Math.round(r.dockWidth) : base.dockWidth,
    toolbarColumns: r.toolbarColumns === 2 ? 2 : 1,
  };
}

export function loadWorkspaces(): WorkspaceState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<WorkspaceState>;
    const current = WORKSPACES.some((w) => w.id === raw.current) ? raw.current! : "essentials";
    const layouts: Record<string, Workspace> = {};
    for (const w of WORKSPACES) layouts[w.id] = cleanWorkspace(raw.layouts?.[w.id], w.id);
    return { current, layouts };
  } catch {
    return { current: "essentials", layouts: Object.fromEntries(WORKSPACES.map((w) => [w.id, builtIn(w.id)])) };
  }
}

export function saveWorkspaces(s: WorkspaceState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Makes a panel visible (adding it to the dock if needed) and opens it. */
export function showPanel(w: Workspace, id: PanelId): Workspace {
  return { ...w, panels: w.panels.includes(id) ? w.panels : [...w.panels, id], active: id };
}
