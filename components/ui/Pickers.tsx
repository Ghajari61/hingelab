"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Star } from "lucide-react";
import { fuzzyFilter } from "@/lib/studio/fuzzy";
import { formatShortcut } from "./shortcut";
import { MenuButton, type MenuItem } from "./Menu";

/** Text input with a filtered list (fonts, materials, machines). */
export function Combobox<T extends string>({ label, options, value, onChange, placeholder, hideLabel }: {
  label: string; options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void; placeholder?: string; hideLabel?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [act, setAct] = useState(0);
  const cur = options.find((o) => o.value === value);
  const list = useMemo(() => (q ? fuzzyFilter(options, q, (o) => o.label).map((x) => x.item) : options), [q, options]);
  const pick = (o: { value: T }) => { onChange(o.value); setOpen(false); setQ(""); };
  return (
    <div className="ui-combo" style={{ display: "grid" }}>
      {!hideLabel && <label className="ui-label" htmlFor={id}>{label}</label>}
      <input
        id={id} className="ui-text" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-label={hideLabel ? label : undefined}
        aria-activedescendant={open && list[act] ? `${id}-${act}` : undefined}
        value={open ? q : cur?.label ?? ""} placeholder={placeholder ?? cur?.label}
        onFocus={() => { setOpen(true); setAct(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setAct(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(list.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && list[act]) { e.preventDefault(); pick(list[act]); }
          else if (e.key === "Escape") { setOpen(false); setQ(""); }
        }}
      />
      {open && list.length > 0 && (
        <div className="ui-listbox" role="listbox" id={`${id}-list`} aria-label={label}>
          {list.map((o, i) => (
            <div key={o.value} id={`${id}-${i}`} role="option" aria-selected={i === act} className="ui-option" onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
              {o.label}{o.hint ? <span className="hint">{o.hint}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface PresetEntry { id: string; name: string; source: "built-in" | "mine" | "imported"; favourite?: boolean; thumbnail?: ReactNode; touches?: string[] }

/**
 * Preset picker (spec §11.3): grid with thumbnails, favourites, a "modified" dot when the values
 * differ from the active preset, and Update · Save as new · Rename · Delete · Export.
 */
export function PresetPicker({ presets, value, modified, onApply, onSaveNew, onUpdate, onRename, onDelete, onExport, onImport, onFavourite, label = "Preset" }: {
  presets: PresetEntry[]; value: string | null; modified: boolean; onApply: (id: string) => void;
  onSaveNew?: () => void; onUpdate?: () => void; onRename?: () => void; onDelete?: () => void; onExport?: () => void; onImport?: () => void;
  onFavourite?: (id: string, fav: boolean) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = presets.find((p) => p.id === value);
  const mine = cur?.source !== "built-in";
  const list = (q ? fuzzyFilter(presets, q, (p) => p.name).map((x) => x.item) : presets)
    .slice().sort((a, b) => Number(!!b.favourite) - Number(!!a.favourite));
  const actions: MenuItem[] = [
    { id: "update", label: "Update preset", disabled: !cur || !mine || !modified || !onUpdate, reason: cur && !mine ? "Built-in presets are read-only; save a copy" : undefined, run: onUpdate },
    { id: "save-new", label: "Save as new…", disabled: !onSaveNew, run: onSaveNew },
    { id: "rename", label: "Rename…", disabled: !cur || !mine || !onRename, run: onRename },
    { id: "delete", label: "Delete", disabled: !cur || !mine || !onDelete, run: onDelete },
    "-",
    { id: "export", label: "Export…", disabled: !cur || !onExport, run: onExport },
    { id: "import", label: "Import…", disabled: !onImport, run: onImport },
  ];
  return (
    <div className="ui-preset">
      <div className="ui-preset-head">
        <button type="button" className="ui-btn" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="preset-picker">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {modified && <span className="mod" title="Modified: the values differ from this preset" aria-label="Modified" />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{cur ? cur.name : `Choose a ${label.toLowerCase()}…`}</span>
          </span>
          <ChevronDown size={14} />
        </button>
        <MenuButton label={`${label} actions`} items={actions}>⋯</MenuButton>
      </div>
      {cur?.touches && cur.touches.length > 0 && <div style={{ fontSize: 11, color: "var(--text-disabled)" }}>Changes: {cur.touches.join(", ")}</div>}
      {open && (
        <>
          <input className="ui-text" placeholder={`Search ${label.toLowerCase()}s`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label.toLowerCase()}s`} autoFocus />
          <div className="ui-preset-grid" role="list">
            {list.map((p) => (
              <div key={p.id} role="listitem" style={{ position: "relative" }}>
                <button type="button" className="ui-preset-card" aria-pressed={p.id === value} onClick={() => { onApply(p.id); setOpen(false); }}>
                  <span className="thumb" aria-hidden>{p.thumbnail}</span>
                  <span>{p.name}</span>
                  <span className="src">{p.source}</span>
                </button>
                {onFavourite && (
                  <button type="button" className="star" style={{ position: "absolute", top: 4, right: 4, border: 0, background: "none", cursor: "pointer", color: p.favourite ? "var(--pro)" : "var(--text-disabled)" }}
                    aria-pressed={!!p.favourite} aria-label={p.favourite ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`} onClick={() => onFavourite(p.id, !p.favourite)}>
                    <Star size={13} fill={p.favourite ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface PaletteItem { id: string; label: string; category: string; shortcut?: string; disabled?: boolean; keywords?: string; run: () => void }

/** Command palette (spec §9.3): fuzzy search over everything, recently used first. */
export function CommandPalette({ open, onClose, items, recent = [], onRan }: {
  open: boolean; onClose: () => void; items: PaletteItem[]; recent?: string[]; onRan?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [act, setAct] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { if (open) { setQ(""); setAct(0); } }, [open]);
  const results = useMemo(() => {
    const boost = (it: PaletteItem) => { const r = recent.indexOf(it.id); return r < 0 ? 0 : 400 - r * 20; };
    return fuzzyFilter(items, q, (it) => `${it.label} ${it.keywords ?? ""}`, boost).slice(0, 60);
  }, [items, q, recent]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [act]);
  if (!open) return null;
  const run = (it: PaletteItem) => { if (it.disabled) return; onClose(); onRan?.(it.id); it.run(); };
  return (
    <div className="ui-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-palette" role="dialog" aria-modal="true" aria-label="Command palette" data-testid="command-palette">
        <input
          autoFocus value={q} placeholder="Type a command, generator, preset, panel or project…"
          role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={results[act] ? `pal-${act}` : undefined}
          onChange={(e) => { setQ(e.target.value); setAct(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(results.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && results[act]) { e.preventDefault(); run(results[act].item); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
        />
        {results.length === 0 ? <div className="none">Nothing matches “{q}”.</div> : (
          <ul id="palette-list" role="listbox" ref={listRef} aria-label="Results">
            {results.map(({ item, match }, i) => (
              <li key={item.id} id={`pal-${i}`} role="option" aria-selected={i === act} aria-disabled={item.disabled} onMouseEnter={() => setAct(i)} onClick={() => run(item)} style={item.disabled ? { opacity: 0.5 } : undefined}>
                <span>{highlight(item.label, match.ranges)}</span>
                <span className="cat">{item.category}</span>
                <kbd>{item.shortcut ? formatShortcut(item.shortcut) : ""}</kbd>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function highlight(text: string, ranges: [number, number][]): ReactNode {
  const r = ranges.filter(([a]) => a < text.length);
  if (!r.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  r.forEach(([a, b], i) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={i}>{text.slice(a, Math.min(b, text.length))}</mark>);
    at = Math.min(b, text.length);
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}
