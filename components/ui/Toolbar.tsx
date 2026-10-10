"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "./primitives";
import { formatShortcut } from "./shortcut";

export interface ToolDef { id: string; label: string; shortcut?: string; description?: string; icon: ReactNode }
/** A toolbar slot: one tool, or a group whose other tools open in a flyout (long-press or right-click). */
export type ToolSlot = ToolDef | { group: string; tools: ToolDef[] } | "-";

const LONG_PRESS_MS = 350;

export function Toolbar({ slots, active, onSelect, columns = 1, label = "Tools" }: {
  slots: ToolSlot[]; active: string; onSelect: (id: string) => void; columns?: 1 | 2; label?: string;
}) {
  // The tool shown for a group is the last one used from it, like Illustrator.
  const [shown, setShown] = useState<Record<string, string>>({});
  const [flyout, setFlyout] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyout) return;
    const close = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setFlyout(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [flyout]);

  useEffect(() => {
    // Selecting a tool by shortcut makes it the group's visible tool.
    for (const s of slots) if (s !== "-" && "group" in s && s.tools.some((t) => t.id === active)) setShown((m) => (m[s.group] === active ? m : { ...m, [s.group]: active }));
  }, [active, slots]);

  return (
    <div className={`ui-toolbar${columns === 2 ? " two" : ""}`} role="toolbar" aria-label={label} aria-orientation="vertical" ref={rootRef}>
      {slots.map((s, i) => {
        if (s === "-") return <hr key={`sep-${i}`} />;
        if (!("group" in s)) {
          return <IconButton key={s.id} label={s.label} shortcut={s.shortcut} description={s.description} icon={s.icon} pressed={active === s.id} onClick={() => onSelect(s.id)} side="right" size="large" testId={`tool-${s.id}`} />;
        }
        const cur = s.tools.find((t) => t.id === (shown[s.group] ?? "")) ?? s.tools.find((t) => t.id === active) ?? s.tools[0];
        const pressed = s.tools.some((t) => t.id === active);
        return (
          <div key={s.group} style={{ position: "relative" }}>
            <IconButton
              label={cur.label} shortcut={cur.shortcut} description={cur.description ?? `Hold or right-click for more ${s.group.toLowerCase()} tools`}
              icon={cur.icon} pressed={pressed} side="right" size="large" flyout testId={`tool-${cur.id}`}
              onClick={() => onSelect(cur.id)}
              onContextMenu={(e) => { e.preventDefault(); setFlyout(s.group); }}
              onPointerDown={() => { timer.current = setTimeout(() => setFlyout(s.group), LONG_PRESS_MS); }}
              onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }}
            />
            {flyout === s.group && (
              <div className="ui-flyout" role="menu" aria-label={`${s.group} tools`}>
                {s.tools.map((t) => (
                  <button
                    key={t.id} type="button" role="menuitemradio" aria-checked={t.id === active} aria-pressed={t.id === active}
                    onClick={() => { setShown((m) => ({ ...m, [s.group]: t.id })); onSelect(t.id); setFlyout(null); }}
                  >
                    <span aria-hidden>{t.icon}</span><span>{t.label}</span><kbd>{t.shortcut ? formatShortcut(t.shortcut) : ""}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
