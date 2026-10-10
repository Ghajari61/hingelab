"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";
import { Dock, MenuBar, NumberInput, PanelSection, Select, useToast, type MenuItem } from "@/components/ui";
import { generatorMeta } from "@/lib/generators/catalog";
import { matches, isTypingTarget } from "@/lib/studio/keys";
import { MACHINE_PROFILES, MATERIAL_PRESETS } from "@/lib/studio/library";
import { isLocalId, loadLocalProject, saveLocalProject, touchLocalProject } from "@/lib/studio/localStore";
import { cleanName } from "@/lib/studio/naming";
import { documentThumbnail } from "@/lib/studio/thumbnail";
import { fmtLength, UNIT_LIST } from "@/lib/studio/units";
import type { Document, Units } from "@/lib/studio/types";
import { downloadProject, editorPath, importProjectFile } from "../projectActions";
import { usePrefs } from "../usePrefs";
import { isMac } from "@/components/ui";

type SaveState = "saved" | "saving" | "error";
const AUTOSAVE_MS = 1500;

export default function StudioEditor({ projectId }: { projectId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [prefs, setPrefs] = usePrefs();
  const [doc, setDoc] = useState<Document | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [renaming, setRenaming] = useState(false);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [dockTab, setDockTab] = useState(search.get("panel") === "generator" ? "generator" : "document");
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const space = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!isLocalId(projectId)) { setFailed("cloud"); return; }
    loadLocalProject(projectId).then((d) => {
      if (!alive) return;
      if (!d) { setFailed("missing"); return; }
      setDoc(d);
      void touchLocalProject(projectId);
    }).catch((e) => setFailed(e instanceof Error ? e.message : "This project could not be opened."));
    return () => { alive = false; };
  }, [projectId]);

  const persist = useCallback(async (d: Document) => {
    setSave("saving");
    try { await saveLocalProject(d, documentThumbnail(d)); setSave("saved"); } catch { setSave("error"); }
  }, []);

  const update = useCallback((fn: (d: Document) => Document) => {
    setDoc((d) => {
      if (!d) return d;
      const next = { ...fn(d), updatedAt: new Date().toISOString() };
      if (timer.current) clearTimeout(timer.current);
      setSave("saving");
      timer.current = setTimeout(() => void persist(next), AUTOSAVE_MS);
      return next;
    });
  }, [persist]);

  const fit = useCallback(() => {
    const el = stageRef.current;
    if (!el || !doc) return;
    const xs = doc.sheets.flatMap((s) => [s.x, s.x + s.w]), ys = doc.sheets.flatMap((s) => [s.y, s.y + s.h]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const z = Math.min((el.clientWidth - 80) / w, (el.clientHeight - 80) / h);
    setView({ zoom: z, x: (el.clientWidth - w * z) / 2 - Math.min(...xs) * z, y: (el.clientHeight - h * z) / 2 - Math.min(...ys) * z });
  }, [doc]);
  const fitted = useRef(false);
  useEffect(() => { if (doc && !fitted.current) { fitted.current = true; requestAnimationFrame(fit); } }, [doc, fit]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = stageRef.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    setView((v) => {
      const z = Math.min(64, Math.max(0.02, v.zoom * factor));
      return { zoom: z, x: px - ((px - v.x) / v.zoom) * z, y: py - ((py - v.y) / v.zoom) * z };
    });
  }, []);

  const saveNow = useCallback(() => {
    if (!doc) return;
    if (timer.current) clearTimeout(timer.current);
    void persist(doc).then(() => toast({ message: "Saved on this device", kind: "success" }));
  }, [doc, persist, toast]);

  const menus = useMemo((): { id: string; label: string; items: MenuItem[] }[] => [
    { id: "file", label: "File", items: [
      { id: "file.new", label: "New…", shortcut: "Ctrl+N", run: () => router.push("/home") },
      { id: "file.open", label: "Open…", shortcut: "Ctrl+O", run: () => fileRef.current?.click() },
      "-",
      { id: "file.save", label: "Save", shortcut: "Ctrl+S", run: saveNow },
      { id: "file.saveComputer", label: "Save to Computer (.hingelab)", shortcut: "Ctrl+Alt+S", run: () => { if (doc) void downloadProject(doc); } },
      { id: "file.rename", label: "Rename…", shortcut: "F2", run: () => setRenaming(true) },
      "-",
      { id: "file.exit", label: "Exit to Start Screen", run: () => router.push("/home") },
    ] },
    { id: "view", label: "View", items: [
      { id: "view.zoomIn", label: "Zoom In", shortcut: "Ctrl+=", run: () => zoomAt(1.25) },
      { id: "view.zoomOut", label: "Zoom Out", shortcut: "Ctrl+-", run: () => zoomAt(0.8) },
      { id: "view.fitArtboard", label: "Fit Artboard", shortcut: "Ctrl+0", run: fit },
      "-",
      { id: "view.theme", label: "Theme", items: (["dark", "darker", "light", "system"] as const).map((t) => ({ id: `view.theme.${t}`, label: t[0].toUpperCase() + t.slice(1), checked: prefs.theme === t, run: () => setPrefs({ theme: t }) })) },
    ] },
    { id: "help", label: "Help", items: [
      { id: "help.shortcuts", label: "Keyboard Shortcuts", shortcut: "Ctrl+Alt+/", run: () => router.push("/help#shortcuts") },
      { id: "help.about", label: "About HingeLab", run: () => toast({ message: "HingeLab Studio — laser design studio." }) },
    ] },
  ], [doc, fit, prefs.theme, router, saveNow, setPrefs, toast, zoomAt]);

  useEffect(() => {
    const flat: Extract<MenuItem, { run?: unknown }>[] = [];
    const walk = (items: MenuItem[]) => items.forEach((i) => { if (i !== "-") { if (i.items) walk(i.items); else flat.push(i); } });
    menus.forEach((m) => walk(m.items));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && !isTypingTarget(e.target)) { space.current = true; }
      if (isTypingTarget(e.target) && !(e.ctrlKey || e.metaKey)) return;
      const hit = flat.find((i) => i.shortcut && matches(e, i.shortcut, isMac()));
      if (hit && !hit.disabled) { e.preventDefault(); hit.run?.(); }
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === " ") space.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onUp); };
  }, [menus]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, doc]);

  if (failed) {
    return (
      <div className="st-boot">
        <div style={{ textAlign: "center", display: "grid", gap: 12 }}>
          <b>{failed === "missing" ? "This project is not on this device." : failed === "cloud" ? "Cloud projects open after you sign in." : failed}</b>
          <Link className="ui-btn" href="/home">Back to the start screen</Link>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="st-boot">Opening…</div>;

  const units = doc.units;
  const sheet = doc.sheets[0];
  const generators = doc.root.children.filter((n) => n.type === "generator");
  const toDoc = (cx: number, cy: number) => ({ x: (cx - view.x) / view.zoom, y: (cy - view.y) / view.zoom });

  return (
    <div className="st-app" data-testid="studio-editor">
      <header className="st-menubar">
        <Link href="/home" className="brand" aria-label="HingeLab start screen"><LogoMark /></Link>
        <MenuBar menus={menus} />
        <div className="right"><UserMenu /></div>
      </header>
      <div className="st-tabs" role="tablist" aria-label="Open documents">
        <div className="st-tab on" role="tab" aria-selected="true">
          {renaming ? (
            <input
              autoFocus defaultValue={doc.name} aria-label="Project name" data-testid="rename-input"
              onBlur={(e) => { const n = cleanName(e.target.value); if (n) update((d) => ({ ...d, name: n })); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
            />
          ) : (
            <span className="nm" onDoubleClick={() => setRenaming(true)} title="Double-click to rename" data-testid="doc-name">{doc.name}</span>
          )}
          {save === "saving" && <span className="dot" aria-label="Unsaved changes" />}
        </div>
      </div>
      <div className="st-control" aria-label="Control bar">
        <div className="grp"><span className="lbl">Document</span></div>
        <div className="grp">
          <NumberInput label="W" value={sheet.w} length units={units} min={10} max={3000} onChange={(w, c) => c && w !== sheet.w && update((d) => ({ ...d, sheets: d.sheets.map((s, i) => (i === 0 ? { ...s, w, name: "Custom size" } : s)) }))} testId="sheet-w" />
          <NumberInput label="H" value={sheet.h} length units={units} min={10} max={3000} onChange={(h, c) => c && h !== sheet.h && update((d) => ({ ...d, sheets: d.sheets.map((s, i) => (i === 0 ? { ...s, h, name: "Custom size" } : s)) }))} testId="sheet-h" />
        </div>
      </div>
      <div className="st-main">
        <div style={{ width: 44, background: "var(--surface-panel)", borderRight: "1px solid var(--line)" }} aria-hidden />
        <div
          className="st-stage" ref={stageRef} data-testid="stage"
          onPointerDown={(e) => { if (e.button === 1 || space.current) { pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; e.currentTarget.setPointerCapture(e.pointerId); } }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setCursor(toDoc(e.clientX - r.left, e.clientY - r.top));
            const p = pan.current;
            if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
          }}
          onPointerUp={() => { pan.current = null; }}
          onPointerLeave={() => setCursor(null)}
        >
          <svg width="100%" height="100%" style={{ display: "block" }}>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
              {doc.sheets.map((s) => (
                <g key={s.id}>
                  <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="var(--surface-sheet)" stroke="var(--sheet-edge)" strokeWidth={1 / view.zoom} />
                  <text x={s.x} y={s.y - 6 / view.zoom} fontSize={11 / view.zoom} fill="var(--text-secondary)">{s.name} · {fmtLength(s.w, units)} × {fmtLength(s.h, units, true)}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
        <Dock
          active={dockTab}
          onActive={setDockTab}
          tabs={[
            { id: "document", label: "Document", content: (
              <PanelSection title="Sheet" meta={`${fmtLength(sheet.w, units)} × ${fmtLength(sheet.h, units)} ${units}`}>
                <Select label="Material" value={sheet.materialId} options={MATERIAL_PRESETS.map((m) => ({ value: m.id, label: m.name }))} onChange={(materialId) => update((d) => ({ ...d, sheets: d.sheets.map((s, i) => (i === 0 ? { ...s, materialId } : s)) }))} />
                <Select label="Machine" value={sheet.machineId} options={MACHINE_PROFILES.map((m) => ({ value: m.id, label: m.name }))} onChange={(machineId) => update((d) => ({ ...d, sheets: d.sheets.map((s, i) => (i === 0 ? { ...s, machineId } : s)) }))} />
              </PanelSection>
            ) },
            ...(generators.length ? [{ id: "generator", label: "Generator", content: (
              <PanelSection title={generatorMeta((generators[0] as { generatorId: string }).generatorId)?.name ?? "Generator"}>
                <p className="dlg-note">{generatorMeta((generators[0] as { generatorId: string }).generatorId)?.blurb}</p>
              </PanelSection>
            ) }] : []),
          ]}
        />
      </div>
      <footer className="st-status" aria-label="Status bar">
        <span>X {cursor ? fmtLength(cursor.x, units) : "—"}</span>
        <span>Y {cursor ? fmtLength(cursor.y, units) : "—"}</span>
        <span>{Math.round(view.zoom * 100 / 3.78)}%</span>
        <span className="sp" />
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <span className="ui-sr">Units</span>
          <select className="ui-select" style={{ height: 20 }} value={units} aria-label="Units" onChange={(e) => update((d) => ({ ...d, units: e.target.value as Units }))}>
            {UNIT_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <span className={`save ${save === "saved" ? "ok" : save === "saving" ? "busy" : "off"}`} data-testid="save-state">
          {save === "saved" ? "Saved on this device" : save === "saving" ? "Saving…" : "Not saved"}
        </span>
      </footer>
      <input ref={fileRef} type="file" accept=".hingelab,application/zip" hidden aria-label="Open a project file" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f) void importProjectFile(f).then((r) => { if ("id" in r) router.push(editorPath(r.id)); else toast({ message: "That file belongs to the classic editor." }); }).catch((err) => toast({ message: err.message, kind: "danger" }));
      }} />
    </div>
  );
}
