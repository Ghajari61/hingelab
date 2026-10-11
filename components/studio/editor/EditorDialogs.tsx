"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GENERATORS } from "@/lib/generators/catalog";
import { COMMANDS, COMMAND_BY_ID, bindingsFor, conflicts, paletteLabel, paletteSearchText, type CommandDef } from "@/lib/studio/commands";
import { fuzzyFilter } from "@/lib/studio/fuzzy";
import { clearShortcut, exportKeymap, parseKeymap, reassign, usersOf, type Keymap } from "@/lib/studio/keymap";
import { shortcutFromEvent } from "@/lib/studio/keys";
import { MACHINE_PROFILES, MATERIAL_PRESETS } from "@/lib/studio/library";
import { listLocalProjects } from "@/lib/studio/localStore";
import { DEFAULT_PREFS, SHORTCUT_SET_NAMES, type Accent, type Preferences, type ShortcutSet, type Theme } from "@/lib/studio/prefs";
import { duplicateNodes, isEditable, topLevel, transformNodes } from "@/lib/studio/scene";
import { translate } from "@/lib/studio/geom";
import { UNIT_LIST } from "@/lib/studio/units";
import type { GridKind, GridSpec, Units } from "@/lib/studio/types";
import { applyDocumentSetup, BACKGROUNDS, pagePresets, presetFor, readSetup, type DocumentSetup } from "@/lib/studio/documentSetup";
import { GRID_DEFAULTS, GRID_KINDS } from "@/lib/studio/grids";
import { Dialog, NumberInput, SegmentedControl, Select, Tabs, formatShortcut } from "@/components/ui";
import { downloadBytes } from "../projectActions";
import { useEditor, useEditorApi } from "./store";
import type { Handler } from "./commandHandlers";

// ---------- Command palette ----------

interface PaletteItem { id: string; label: string; category: string; shortcut?: string; run: () => void; disabled?: boolean; reason?: string; keywords?: string }

const RECENT_KEY = "hingelab-palette-recent";
const loadRecent = (): string[] => { try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(r) ? r.filter((x) => typeof x === "string").slice(0, 20) : []; } catch { return []; } };

export function CommandPalette({ open, onClose, handlers, bindings, navigate }: {
  open: boolean; onClose: () => void; handlers: Record<string, Handler>; bindings: Map<string, string[]>; navigate: (href: string) => void;
}) {
  const [q, setQ] = useState("");
  const [act, setAct] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) { setQ(""); setAct(0); return; }
    setRecent(loadRecent());
    listLocalProjects().then((l) => setProjects(l.slice(0, 10).map((p) => ({ id: p.id, name: p.name })))).catch(() => setProjects([]));
  }, [open]);

  const items = useMemo((): PaletteItem[] => [
    ...COMMANDS.map((c: CommandDef) => {
      const h = handlers[c.id];
      return { id: c.id, label: paletteLabel(c), category: c.category, shortcut: bindings.get(c.id)?.[0], run: h?.run ?? (() => {}), disabled: !h || h.enabled === false, reason: h?.reason, keywords: c.keywords };
    }),
    ...GENERATORS.map((g) => ({ id: `gen.${g.id}`, label: `New ${g.name}…`, category: "Generator", run: () => navigate(`/home?generator=${g.id}`) })),
    ...projects.map((p) => ({ id: `proj.${p.id}`, label: `Open ${p.name}`, category: "Recent project", run: () => navigate(`/editor/${p.id}`) })),
  ], [handlers, bindings, projects, navigate]);

  const results = useMemo(() => {
    const boost = (i: PaletteItem) => { const r = recent.indexOf(i.id); return r < 0 ? 0 : 400 - r * 10; };
    return fuzzyFilter(items, q, paletteSearchText, boost).slice(0, 80);
  }, [items, q, recent]);

  useEffect(() => { listRef.current?.querySelector(`[data-i="${act}"]`)?.scrollIntoView({ block: "nearest" }); }, [act]);

  const choose = (i: PaletteItem | undefined) => {
    if (!i || i.disabled) return;
    const next = [i.id, ...loadRecent().filter((x) => x !== i.id)].slice(0, 20);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    onClose();
    setTimeout(i.run, 0);
  };

  const highlight = (text: string, ranges: [number, number][], offset = 0) => {
    if (!ranges.length) return text;
    const out: React.ReactNode[] = [];
    let at = 0;
    for (const [a0, b0] of ranges) {
      const a = a0 - offset, b = Math.min(b0 - offset, text.length);
      if (b <= 0 || a >= text.length) continue;
      if (a > at) out.push(text.slice(at, a));
      out.push(<mark key={a}>{text.slice(Math.max(a, 0), b)}</mark>);
      at = b;
    }
    out.push(text.slice(at));
    return out;
  };

  return (
    <Dialog open={open} title="Command Palette" onClose={onClose} testId="command-palette">
      <div className="cp">
        <input
          autoFocus data-autofocus value={q} placeholder="Type a command, tool, panel, generator or project…" aria-label="Search commands"
          role="combobox" aria-expanded aria-controls="cp-list" aria-activedescendant={results[act] ? `cp-${act}` : undefined}
          onChange={(e) => { setQ(e.target.value); setAct(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(results[act]?.item); }
          }}
        />
        <div className="cp-list" id="cp-list" role="listbox" aria-label="Commands" ref={listRef}>
          {results.map(({ item, match }, k) => (
            <div key={item.id} id={`cp-${k}`} data-i={k} role="option" aria-selected={k === act} aria-disabled={item.disabled || undefined} className="cp-item"
              title={item.disabled ? item.reason : undefined} onMouseEnter={() => setAct(k)} onClick={() => choose(item)} data-command={item.id}>
              <span>{highlight(item.label, match.ranges)}{item.disabled && item.reason ? <span className="cat"> — {item.reason}</span> : null}</span>
              <span className="cat">{item.category}</span>
              <kbd>{item.shortcut ? formatShortcut(item.shortcut) : ""}</kbd>
            </div>
          ))}
          {!results.length && <p className="pn-empty">No command matches “{q}”.</p>}
        </div>
      </div>
    </Dialog>
  );
}

// ---------- Keyboard shortcuts ----------

export function ShortcutsDialog({ open, onClose, set, onSet, keymap, onKeymap, toast }: {
  open: boolean; onClose: () => void; set: ShortcutSet; onSet: (s: ShortcutSet) => void; keymap: Keymap; onKeymap: (k: Keymap) => void;
  toast: (m: string, action?: { label: string; run: () => void }) => void;
}) {
  const [q, setQ] = useState("");
  const [rec, setRec] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ id: string; key: string; others: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bindings = useMemo(() => bindingsFor(set, keymap), [set, keymap]);
  const clash = useMemo(() => new Set(conflicts(bindings).flatMap((c) => c.ids)), [bindings]);
  const list = useMemo(() => fuzzyFilter(COMMANDS, q, (c) => `${c.label} ${c.category} ${(bindings.get(c.id) ?? []).join(" ")}`).map((r) => r.item), [q, bindings]);

  useEffect(() => {
    if (!rec) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === "Escape") { setRec(null); return; }
      const key = shortcutFromEvent(e);
      if (!key) return;
      const others = usersOf(set, keymap, key).filter((x) => x !== rec);
      setRec(null);
      if (others.length) setAsk({ id: rec, key, others });
      else onKeymap(reassign(set, keymap, rec, key));
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [rec, set, keymap, onKeymap]);

  const label = (id: string) => COMMAND_BY_ID.get(id)?.label ?? id;
  return (
    <Dialog open={open} title="Keyboard Shortcuts" onClose={() => { if (!rec) onClose(); }} size="wide" testId="shortcuts-dialog"
      footer={<>
        <button type="button" className="ui-btn" onClick={() => downloadBytes(exportKeymap(set, keymap), "hingelab-shortcuts.json", "application/json")}>Export…</button>
        <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}>Import…</button>
        <button type="button" className="ui-btn" disabled={!Object.keys(keymap).length} onClick={() => { const prev = keymap; onKeymap({}); toast(`Restored the ${SHORTCUT_SET_NAMES[set]} shortcuts`, { label: "Undo", run: () => onKeymap(prev) }); }}>Restore set defaults</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="ui-btn primary" onClick={onClose}>Done</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import shortcuts" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (f) void f.text().then((t) => { try { const r = parseKeymap(t); const prev = { set, keymap }; onSet(r.set); onKeymap(r.bindings); toast(`Imported ${Object.keys(r.bindings).length} custom shortcuts`, { label: "Undo", run: () => { onSet(prev.set); onKeymap(prev.keymap); } }); } catch (err) { toast((err as Error).message); } });
        }} />
      </>}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <div className="form-grid">
          <Select label="Shortcut set" value={set} options={(Object.keys(SHORTCUT_SET_NAMES) as ShortcutSet[]).map((s) => ({ value: s, label: SHORTCUT_SET_NAMES[s] }))} onChange={onSet} testId="shortcut-set" />
          <div style={{ display: "grid" }}>
            <label className="ui-label" htmlFor="ks-search">Search</label>
            <input id="ks-search" className="ui-text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Command or key…" />
          </div>
        </div>
        {clash.size > 0 && <p className="dlg-note" style={{ color: "var(--warning)" }}>{clash.size} commands share a shortcut. They are highlighted below.</p>}
        {ask && (
          <div className="info-card" role="alertdialog" aria-label="Shortcut conflict">
            <p><b>{formatShortcut(ask.key)}</b> is used by {ask.others.map(label).join(", ")}. Give it to <b>{label(ask.id)}</b> instead?</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="ui-btn primary" autoFocus onClick={() => { onKeymap(reassign(set, keymap, ask.id, ask.key)); setAsk(null); }}>Reassign</button>
              <button type="button" className="ui-btn" onClick={() => setAsk(null)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="ks-list" role="list">
          {list.map((c) => {
            const keys = bindings.get(c.id) ?? [];
            return (
              <div key={c.id} role="listitem" className={`ks-row${clash.has(c.id) ? " conflict" : ""}`} data-command={c.id}>
                <span>{c.label}</span>
                <span className="cat">{c.category}</span>
                <span className="keys">
                  {rec === c.id ? <span className="ks-key rec">Press keys… (Esc cancels)</span> : (
                    <>
                      {keys.map((k) => <kbd key={k}>{formatShortcut(k)}</kbd>)}
                      <button type="button" className="ks-key" onClick={() => setRec(c.id)} aria-label={`Change shortcut for ${c.label}`}>{keys.length ? "Change" : "Add"}</button>
                      {keys.length > 0 && <button type="button" className="ks-key" onClick={() => onKeymap(clearShortcut(keymap, c.id))} aria-label={`Remove shortcut for ${c.label}`}>×</button>}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

// ---------- Preferences ----------

type PrefTab = "general" | "shortcuts" | "laser";
const TAB_DEFAULTS: Record<PrefTab, (keyof Preferences)[]> = {
  general: ["editorTheme", "theme", "accent", "units", "showStartScreen", "resetTo", "offsetStep", "snapAngle"],
  shortcuts: ["shortcutSet"],
  laser: ["laser", "machineId", "materialId"],
};

export function PreferencesDialog({ open, onClose, prefs, setPrefs, openShortcuts, toast }: {
  open: boolean; onClose: () => void; prefs: Preferences; setPrefs: (p: Partial<Preferences>) => void; openShortcuts: () => void;
  toast: (m: string, action?: { label: string; run: () => void }) => void;
}) {
  const [tab, setTab] = useState<PrefTab>("general");
  const restore = (tabs: PrefTab[]) => {
    const keys = tabs.flatMap((t) => TAB_DEFAULTS[t]);
    const prev = Object.fromEntries(keys.map((k) => [k, prefs[k]])) as Partial<Preferences>;
    setPrefs(Object.fromEntries(keys.map((k) => [k, DEFAULT_PREFS[k]])) as Partial<Preferences>);
    toast(tabs.length > 1 ? "Restored all preferences" : `Restored ${tab} preferences`, { label: "Undo", run: () => setPrefs(prev) });
  };
  return (
    <Dialog open={open} title="Preferences" onClose={onClose} testId="preferences-dialog"
      footer={<>
        <button type="button" className="ui-btn" onClick={() => restore([tab])}>Restore defaults</button>
        <button type="button" className="ui-btn" onClick={() => restore(["general", "shortcuts", "laser"])}>Restore all</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="ui-btn primary" onClick={onClose}>Done</button>
      </>}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <Tabs label="Preference groups" value={tab} onChange={setTab} tabs={[{ id: "general", label: "General" }, { id: "shortcuts", label: "Shortcuts" }, { id: "laser", label: "Laser" }]} />
        {tab === "general" && (
          <div className="form-grid">
            <Select label="Editor theme" value={prefs.editorTheme} options={(["dark", "darker", "light", "system"] as Theme[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} onChange={(editorTheme) => setPrefs({ editorTheme })} testId="pref-theme" />
            <Select label="Start screen theme" value={prefs.theme} options={(["dark", "darker", "light", "system"] as Theme[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} onChange={(theme) => setPrefs({ theme })} />
            <Select label="Accent" value={prefs.accent} options={(["blue", "violet", "teal", "orange"] as Accent[]).map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))} onChange={(accent) => setPrefs({ accent })} />
            <Select label="Units for new projects" value={prefs.units} options={UNIT_LIST.map((u) => ({ value: u, label: u }))} onChange={(units) => setPrefs({ units: units as Units })} />
            <Select label="Reset ↺ goes to" value={prefs.resetTo} options={[{ value: "default", label: "The default value" }, { value: "preset", label: "The active preset's value" }]} onChange={(resetTo) => setPrefs({ resetTo })} />
            <NumberInput label="Inset / Outset step" value={prefs.offsetStep} length units={prefs.units} min={0.01} max={100} step={0.1} defaultValue={DEFAULT_PREFS.offsetStep} onChange={(offsetStep) => setPrefs({ offsetStep })} testId="pref-offset-step" />
            <NumberInput label="Snap angle" value={prefs.snapAngle} suffix="°" min={1} max={90} step={1} defaultValue={DEFAULT_PREFS.snapAngle} onChange={(snapAngle) => setPrefs({ snapAngle })} testId="pref-snap-angle" />
            <p className="dlg-note full">Snap angle: Shift while rotating or shearing, Ctrl+Shift while drawing lines and with the Pen, Knife and Measure, the [ and ] node keys, and view rotation.</p>
            <label className="pn-check full"><input type="checkbox" checked={prefs.showStartScreen} onChange={(e) => setPrefs({ showStartScreen: e.target.checked })} /> Show the start screen when HingeLab opens</label>
          </div>
        )}
        {tab === "shortcuts" && (
          <div style={{ display: "grid", gap: 10 }}>
            <Select label="Shortcut set" value={prefs.shortcutSet} options={(Object.keys(SHORTCUT_SET_NAMES) as ShortcutSet[]).map((s) => ({ value: s, label: SHORTCUT_SET_NAMES[s] }))} onChange={(shortcutSet) => setPrefs({ shortcutSet })} />
            <p className="dlg-note">Single-key tool shortcuts never fire while you type in a field or edit text. Some browser shortcuts (Ctrl+N, Ctrl+W, Ctrl+T) cannot be taken over, so HingeLab uses Ctrl+Alt+N for New and Ctrl+Alt+W for Close.</p>
            <div><button type="button" className="ui-btn" onClick={openShortcuts}>Edit shortcuts…</button></div>
          </div>
        )}
        {tab === "laser" && (
          <div className="form-grid">
            <Select label="Laser type" value={prefs.laser} options={[{ value: "co2", label: "CO₂" }, { value: "diode", label: "Diode" }, { value: "fiber", label: "Fiber" }]} onChange={(laser) => setPrefs({ laser })} />
            <Select label="Machine" value={prefs.machineId} options={MACHINE_PROFILES.map((m) => ({ value: m.id, label: m.name }))} onChange={(machineId) => setPrefs({ machineId })} />
            <div className="full"><Select label="Favourite material" value={prefs.materialId} options={MATERIAL_PRESETS.map((m) => ({ value: m.id, label: m.name }))} onChange={(materialId) => setPrefs({ materialId })} /></div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------- Move… ----------

export function MoveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useEditorApi();
  const units = useEditor((s) => s.doc.units);
  const [dx, setDx] = useState(10);
  const [dy, setDy] = useState(0);
  const apply = (copy: boolean) => {
    const s = api.getState();
    const ids = topLevel(s.doc.root, s.selection).filter((id) => isEditable(s.doc.root, id));
    if (!ids.length) return;
    const m = translate(dx, dy);
    let out = ids;
    s.edit(copy ? "Move Copy" : "Move", (d) => { out = copy ? duplicateNodes(d, ids) : ids; transformNodes(d, out, m); });
    s.select(out);
    s.set({ lastTransform: m });
    onClose();
  };
  return (
    <Dialog open={open} title="Move" onClose={onClose} size="narrow" testId="move-dialog"
      footer={<><button type="button" className="ui-btn" onClick={() => apply(true)}>Copy</button><span style={{ flex: 1 }} /><button type="button" className="ui-btn" onClick={onClose}>Cancel</button><button type="button" className="ui-btn primary" onClick={() => apply(false)}>Move</button></>}>
      <div className="form-grid">
        <NumberInput label="Horizontal" value={dx} length units={units} onChange={(v) => setDx(v)} testId="move-dx" />
        <NumberInput label="Vertical" value={dy} length units={units} onChange={(v) => setDy(v)} testId="move-dy" />
      </div>
      <p className="dlg-note" style={{ marginTop: 10 }}>Positive values move right and down. Edit → Transform Again (Ctrl+Alt+D) repeats the move.</p>
    </Dialog>
  );
}

// ---------- Document Setup… ----------

type SetupTab = "page" | "guides" | "grid";
const SETUP_TABS: { id: SetupTab; label: string }[] = [{ id: "page", label: "Page" }, { id: "guides", label: "Guides" }, { id: "grid", label: "Grid" }];

export function DocumentSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const guidesLocked = useEditor((s) => s.ui.guidesLocked);
  const [tab, setTab] = useState<SetupTab>("page");
  const [setup, setSetup] = useState<DocumentSetup>(() => readSetup(doc));
  const [lockGuides, setLockGuides] = useState(guidesLocked);
  const [newAxis, setNewAxis] = useState<"x" | "y">("x");
  const [newAt, setNewAt] = useState(0);
  useEffect(() => { if (open) { setSetup(readSetup(doc)); setLockGuides(guidesLocked); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const presets = useMemo(() => pagePresets(), []);
  const units = setup.units;
  const patch = (p: Partial<DocumentSetup>) => setSetup((s) => ({ ...s, ...p }));
  const gridPatch = (p: Partial<GridSpec>) => setSetup((s) => ({ ...s, grid: { ...s.grid, ...p } }));
  const preset = presetFor(setup.sheetW, setup.sheetH)?.id ?? "custom";
  const kind = setup.grid.kind ?? "rectangular";
  const apply = () => {
    api.getState().edit("Document Setup", (d) => { applyDocumentSetup(d, setup); });
    if (lockGuides !== guidesLocked) api.getState().setUi({ guidesLocked: lockGuides });
    onClose();
  };
  const guideRows = setup.guides.map((g, k) => ({ ...g, k })).sort((a, b) => (a.axis === b.axis ? a.at - b.at : a.axis === "x" ? -1 : 1));
  return (
    <Dialog open={open} title="Document Setup" onClose={onClose} size="wide" testId="document-setup"
      footer={<><span style={{ flex: 1 }} /><button type="button" className="ui-btn" onClick={onClose}>Cancel</button><button type="button" className="ui-btn primary" onClick={apply} data-testid="dlg-ok">OK</button></>}>
      <Tabs label="Document Setup sections" tabs={SETUP_TABS} value={tab} onChange={setTab} />
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {tab === "page" && <>
          <div className="form-grid">
            <div className="full">
              <Select label="Sheet size" value={preset} testId="setup-preset"
                options={[{ value: "custom", label: "Custom size" }, ...presets.map((p) => ({ value: p.id, label: `${p.name} (${p.w} × ${p.h} mm)`, group: p.group }))]}
                onChange={(id) => { const p = presets.find((x) => x.id === id); if (p) patch({ sheetW: p.w, sheetH: p.h }); }} />
            </div>
            <NumberInput label="Sheet width" value={setup.sheetW} length units={units} min={10} max={3000} onChange={(v) => patch({ sheetW: v })} testId="setup-w" />
            <NumberInput label="Sheet height" value={setup.sheetH} length units={units} min={10} max={3000} onChange={(v) => patch({ sheetH: v })} testId="setup-h" />
            <div className="full">
              <SegmentedControl label="Display units" value={units} onChange={(u) => patch({ units: u as Units })} options={UNIT_LIST.map((u) => ({ value: u, label: u }))} />
            </div>
            <p className="dlg-note full">Document units are always millimetres: shapes, files and exports keep their real size. Display units only change how lengths are shown and typed.</p>
            <div className="full">
              <SegmentedControl label="Sheet background (screen only)" value={setup.background} onChange={(v) => patch({ background: v })} options={BACKGROUNDS} full />
            </div>
            <div className="full setup-swatches" aria-hidden>
              {BACKGROUNDS.map((b) => <span key={b.value} className={`st-material ${b.value}`} title={b.label} />)}
            </div>
            <p className="dlg-note full">A preview of the material behind your design. It is never cut, engraved or exported.</p>
          </div>
        </>}
        {tab === "guides" && <>
          <div className="setup-guides" data-testid="setup-guides">
            {guideRows.length === 0 ? <p className="dlg-note">No guides yet. Drag one from a ruler or add one here.</p> : guideRows.map((g) => (
              <div key={g.k} className="setup-guide-row">
                <span className="ax">{g.axis === "x" ? "Vertical" : "Horizontal"}</span>
                <NumberInput label={g.axis === "x" ? "X" : "Y"} value={g.at} length units={units} min={-10000} max={10000} hideLabel
                  onChange={(v) => setSetup((s) => ({ ...s, guides: s.guides.map((x, i) => (i === g.k ? { ...x, at: v } : x)) }))} />
                <button type="button" className="ui-btn" onClick={() => setSetup((s) => ({ ...s, guides: s.guides.filter((_, i) => i !== g.k) }))} aria-label={`Delete ${g.axis === "x" ? "vertical" : "horizontal"} guide`}>Delete</button>
              </div>
            ))}
          </div>
          <div className="form-grid" style={{ alignItems: "end" }}>
            <SegmentedControl label="New guide" value={newAxis} onChange={setNewAxis} options={[{ value: "x", label: "Vertical" }, { value: "y", label: "Horizontal" }]} />
            <NumberInput label={newAxis === "x" ? "At X" : "At Y"} value={newAt} length units={units} min={-10000} max={10000} onChange={(v) => setNewAt(v)} testId="setup-guide-at" />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="ui-btn" onClick={() => patch({ guides: [...setup.guides, { axis: newAxis, at: newAt }] })} data-testid="setup-guide-add">Add guide</button>
            <button type="button" className="ui-btn" disabled={!setup.guides.length} onClick={() => patch({ guides: [] })}>Clear all</button>
            <span style={{ flex: 1 }} />
            <label className="pn-check"><input type="checkbox" checked={lockGuides} onChange={(e) => setLockGuides(e.target.checked)} /> Lock guides</label>
          </div>
        </>}
        {tab === "grid" && (
          <div className="form-grid">
            <label className="pn-check"><input type="checkbox" checked={setup.grid.show} onChange={(e) => gridPatch({ show: e.target.checked })} data-testid="setup-grid-show" /> Show grid</label>
            <label className="pn-check"><input type="checkbox" checked={setup.snapGrid} onChange={(e) => patch({ snapGrid: e.target.checked })} data-testid="setup-grid-snap" /> Snap to grid</label>
            <div className="full">
              <Select label="Grid type" value={kind} options={GRID_KINDS} onChange={(k) => gridPatch({ kind: k })} testId="setup-grid-kind" />
            </div>
            {kind !== "modular" && <>
              <NumberInput label={kind === "polar" ? "Ring spacing" : "Spacing"} value={setup.grid.size} length units={units} min={0.5} max={500} defaultValue={10} onChange={(v) => gridPatch({ size: v })} testId="setup-grid-size" />
              <NumberInput label="Subdivisions" value={setup.grid.subdivisions} integer min={1} max={20} defaultValue={5} onChange={(v) => gridPatch({ subdivisions: v })} />
            </>}
            {kind === "axonometric" && <>
              <NumberInput label="Angle X" value={setup.grid.angleX ?? GRID_DEFAULTS.angleX} min={5} max={85} suffix="°" onChange={(v) => gridPatch({ angleX: v })} />
              <NumberInput label="Angle Z" value={setup.grid.angleZ ?? GRID_DEFAULTS.angleZ} min={5} max={85} suffix="°" onChange={(v) => gridPatch({ angleZ: v })} />
            </>}
            {kind === "modular" && <>
              <NumberInput label="Module width" value={setup.grid.moduleW ?? GRID_DEFAULTS.moduleW} length units={units} min={1} max={2000} onChange={(v) => gridPatch({ moduleW: v })} />
              <NumberInput label="Module height" value={setup.grid.moduleH ?? GRID_DEFAULTS.moduleH} length units={units} min={1} max={2000} onChange={(v) => gridPatch({ moduleH: v })} />
              <NumberInput label="Gutter X" value={setup.grid.gutterX ?? GRID_DEFAULTS.gutterX} length units={units} min={0} max={500} onChange={(v) => gridPatch({ gutterX: v })} />
              <NumberInput label="Gutter Y" value={setup.grid.gutterY ?? GRID_DEFAULTS.gutterY} length units={units} min={0} max={500} onChange={(v) => gridPatch({ gutterY: v })} />
            </>}
            {kind === "polar" && (
              <NumberInput label="Spokes" value={setup.grid.divisions ?? GRID_DEFAULTS.divisions} integer min={2} max={360} onChange={(v) => gridPatch({ divisions: v })} />
            )}
            {kind !== "rectangular" && <>
              <NumberInput label={kind === "polar" ? "Centre X" : "Origin X"} value={setup.grid.originX ?? 0} length units={units} min={-10000} max={10000} onChange={(v) => gridPatch({ originX: v })} />
              <NumberInput label={kind === "polar" ? "Centre Y" : "Origin Y"} value={setup.grid.originY ?? 0} length units={units} min={-10000} max={10000} onChange={(v) => gridPatch({ originY: v })} />
            </>}
            <p className="dlg-note full">{GRID_NOTES[kind]}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

const GRID_NOTES: Record<GridKind, string> = {
  rectangular: "Squares from the page origin. Objects snap their edges to the lines.",
  axonometric: "Two slanted line families (30° and 30° is isometric). Objects snap a corner or their centre to the nearest crossing.",
  modular: "Modules separated by gutters, for layouts and nesting. Object edges snap to module edges.",
  polar: "Rings round a centre with evenly spaced spokes. Objects snap a corner or their centre to the nearest crossing.",
};

// ---------- Reset ▸ All Preferences… ----------

export function ResetPrefsDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} title="Reset all preferences?" onClose={onClose} size="narrow" testId="reset-prefs"
      footer={<><span style={{ flex: 1 }} /><button type="button" className="ui-btn" onClick={onClose}>Cancel</button><button type="button" className="ui-btn danger" onClick={() => { onConfirm(); onClose(); }}>Reset preferences</button></>}>
      <p className="dlg-note">Theme, units, shortcut set, custom shortcuts and workspace layouts go back to their defaults. Your projects are not touched. You can undo this from the message that appears.</p>
    </Dialog>
  );
}
