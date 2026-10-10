"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, ImagePlus, Search, X } from "lucide-react";
import { Badge, ContextMenu, Dialog, TextField, useToast, type MenuItem } from "@/components/ui";
import { useAccount } from "@/components/auth/useAccount";
import { GENERATORS, generatorMeta } from "@/lib/generators/catalog";
import { fuzzyFilter } from "@/lib/studio/fuzzy";
import { deleteLocalProject, listLocalProjects, loadLocalProject, newLocalId, saveLocalProject, type LocalProjectSummary } from "@/lib/studio/localStore";
import { uniqueName } from "@/lib/studio/naming";
import { noteGeneratorUse } from "@/lib/studio/prefs";
import { GeneratorArt } from "./GeneratorArt";
import { NewDocumentDialog, NewProjectDialog, OnboardingDialog, type NewProjectResult } from "./NewDialogs";
import { createLocalProject, createProjectFromImage, downloadProject, editorPath, importProjectFile } from "./projectActions";
import { StudioHeader } from "./StudioHeader";
import { usePrefs } from "./usePrefs";

const WHATS_NEW_ID = "whats-new-studio-1";

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default function StartScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAccount();
  const [prefs, setPrefs, prefsReady] = usePrefs();
  const [recents, setRecents] = useState<LocalProjectSummary[] | null>(null);
  const [gen, setGen] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [act, setAct] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; p: LocalProjectSummary } | null>(null);
  const [renaming, setRenaming] = useState<{ p: LocalProjectSummary; name: string } | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => { listLocalProjects().then((l) => setRecents(l.slice(0, 12))).catch(() => setRecents([])); }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => { if (prefsReady && !prefs.onboarded) setOnboarding(true); }, [prefsReady, prefs.onboarded]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get("generator");
    if (g && GENERATORS.some((x) => x.id === g)) setGen(g);
    else if (p.get("new") === "blank") setBlank(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const firstName = (meta?.full_name || meta?.name || "").trim().split(/\s+/)[0];
  const names = useMemo(() => (recents ?? []).map((r) => r.name), [recents]);
  const lastUsed = (id: string) => prefs.recentGenerators.find((r) => r.id === id);

  type Hit = { kind: "generator" | "project" | "action"; id: string; label: string; hint: string; run: () => void };
  const hits = useMemo<Hit[]>(() => {
    if (!q.trim()) return [];
    const all: Hit[] = [
      { kind: "action", id: "blank", label: "Blank canvas", hint: "New document", run: () => setBlank(true) },
      ...GENERATORS.map((g) => ({ kind: "generator" as const, id: g.id, label: g.name, hint: `Generator · ${g.category}`, run: () => setGen(g.id) })),
      ...(recents ?? []).map((p) => ({ kind: "project" as const, id: p.id, label: p.name, hint: `Project · ${ago(p.openedAt)}`, run: () => router.push(editorPath(p.id)) })),
    ];
    return fuzzyFilter(all, q, (h) => `${h.label} ${h.hint}`).map((x) => x.item).slice(0, 12);
  }, [q, recents, router]);

  async function create(r: NewProjectResult, generatorId?: string) {
    try {
      const id = await createLocalProject({ ...r, generatorId });
      if (generatorId) setPrefs((p) => noteGeneratorUse(p, generatorId));
      router.push(editorPath(id, generatorId ? "generator" : undefined));
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "The project could not be created.", kind: "danger" });
    }
  }

  async function openFile(f: File) {
    try {
      const r = await importProjectFile(f);
      if ("id" in r) { router.push(editorPath(r.id)); return; }
      toast({
        message: "This project was saved by the classic single-product editor.",
        action: { label: "Open it there", run: () => { try { localStorage.setItem("hingelab-product", r.legacy.product === "hinge-box" ? "hinge" : r.legacy.product); } catch { /* ignore */ } router.push(`/app/editor/local?p=${r.legacy.product === "hinge-box" ? "hinge" : r.legacy.product}`); } },
      });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "That file could not be opened.", kind: "danger" });
    }
  }

  async function projectAction(kind: string, p: LocalProjectSummary) {
    try {
      if (kind === "open") router.push(editorPath(p.id));
      else if (kind === "rename") setRenaming({ p, name: p.name });
      else if (kind === "duplicate") {
        const doc = await loadLocalProject(p.id);
        if (!doc) return;
        const now = new Date().toISOString();
        await saveLocalProject({ ...doc, id: newLocalId(), name: uniqueName(doc.name, names), createdAt: now, updatedAt: now }, p.thumbnail);
        refresh();
        toast({ message: `Duplicated ${p.name}` });
      } else if (kind === "download") {
        const doc = await loadLocalProject(p.id);
        if (doc) await downloadProject(doc, p.thumbnail);
      } else if (kind === "delete") {
        const doc = await loadLocalProject(p.id);
        await deleteLocalProject(p.id);
        refresh();
        toast({ message: `Deleted ${p.name}`, action: doc ? { label: "Undo", run: () => { void saveLocalProject(doc, p.thumbnail).then(refresh); } } : undefined });
      }
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "That did not work.", kind: "danger" });
    }
  }

  const menuItems = (p: LocalProjectSummary): MenuItem[] => [
    { id: "open", label: "Open", run: () => projectAction("open", p) },
    { id: "rename", label: "Rename…", shortcut: "F2", run: () => projectAction("rename", p) },
    { id: "duplicate", label: "Duplicate", run: () => projectAction("duplicate", p) },
    { id: "download", label: "Download (.hingelab)", run: () => projectAction("download", p) },
    { id: "move", label: "Move to folder…", disabled: true, reason: "Folders are for cloud projects; sign in to use them" },
    "-",
    { id: "delete", label: "Delete", run: () => projectAction("delete", p) },
  ];

  const dismissed = prefs.dismissed.includes(WHATS_NEW_ID);

  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main">
        <section className="home-hero" aria-labelledby="greet">
          <h1 id="greet">What do you want to make today{firstName ? `, ${firstName}` : ""}?</h1>
          <div className="home-search ui-combo">
            <Search size={16} className="ic" aria-hidden />
            <input
              ref={searchRef} value={q} placeholder="Search generators, templates and projects…" aria-label="Search generators, templates and projects"
              role="combobox" aria-expanded={searchOpen && hits.length > 0} aria-controls="home-search-list" aria-autocomplete="list"
              aria-activedescendant={searchOpen && hits[act] ? `hs-${act}` : undefined}
              onChange={(e) => { setQ(e.target.value); setAct(0); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(hits.length - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
                else if (e.key === "Enter" && hits[act]) { e.preventDefault(); hits[act].run(); setSearchOpen(false); }
                else if (e.key === "Escape") { setQ(""); }
              }}
              data-testid="home-search"
            />
            <kbd>Ctrl+/</kbd>
            {searchOpen && hits.length > 0 && (
              <div className="ui-listbox" role="listbox" id="home-search-list" aria-label="Results">
                {hits.map((h, i) => (
                  <div key={h.kind + h.id} id={`hs-${i}`} role="option" aria-selected={i === act} className="ui-option" onMouseDown={(e) => { e.preventDefault(); h.run(); setSearchOpen(false); }}>
                    {h.label}<span className="hint">{h.hint}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="gens">
          <h2 id="gens">Start something new</h2>
          <div className="gen-grid">
            <button type="button" className="gen-card blank" onClick={() => setBlank(true)} data-testid="blank-canvas">
              <span className="art"><GeneratorArt id="blank" /></span>
              <span className="txt"><span className="name">Blank canvas</span><span className="blurb">Start from scratch — draw with pen, shapes and text.</span></span>
            </button>
            {GENERATORS.map((g) => {
              const lu = lastUsed(g.id);
              return (
                <button key={g.id} type="button" className="gen-card" onClick={() => setGen(g.id)} data-testid={`gen-${g.id}`} aria-label={`${g.name}${g.plan === "pro" ? " (Pro)" : ""}: ${g.blurb}`}>
                  <span className="art"><GeneratorArt id={g.id} /></span>
                  <span className="chips">{lu && <span className="chip">Last used {ago(lu.at)}</span>}{g.plan === "pro" && <Badge kind="pro" />}</span>
                  <span className="txt">
                    <span className="name">{g.name}</span>
                    <span className="blurb">{g.blurb}</span>
                    {g.freeLimit && <span className="limit">{g.freeLimit}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="open">
          <h2 id="open">Open</h2>
          <div className="open-actions">
            <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}><FolderOpen size={15} /> Open from computer…</button>
            <button type="button" className="ui-btn" onClick={() => imageRef.current?.click()}><ImagePlus size={15} /> Import image to trace…</button>
          </div>
          <input ref={fileRef} type="file" accept=".hingelab,application/zip,application/json" hidden aria-label="Open a project file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />
          <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Import an image" onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) void createProjectFromImage(f, prefs.materialId, prefs.machineId).then((id) => router.push(editorPath(id))).catch((err) => toast({ message: err.message, kind: "danger" }));
          }} />
        </section>

        <section aria-labelledby="recent">
          <h2 id="recent">Recent projects {recents && recents.length > 0 && <a className="more" href="/projects">All projects</a>}</h2>
          {recents === null ? null : recents.length === 0 ? (
            <div className="info-card welcome" data-testid="welcome">
              <h3>Welcome to HingeLab</h3>
              <p>Pick a generator above for a ready-to-cut design in seconds, or start from a blank canvas and draw your own. Your recent projects will appear here.</p>
              <div><button type="button" className="ui-btn primary" onClick={() => setOnboarding(true)}>Set up my laser (30 seconds)</button></div>
            </div>
          ) : (
            <div className="home-row" role="list" aria-label="Recent projects">
              {recents.map((p) => {
                const g = p.generators[0] ? generatorMeta(p.generators[0]) : null;
                return (
                  <button
                    key={p.id} type="button" role="listitem" className="recent-card" data-testid="recent-project"
                    onClick={() => router.push(editorPath(p.id))}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, p }); }}
                    onKeyDown={(e) => { if (e.key === "F2") { e.preventDefault(); setRenaming({ p, name: p.name }); } if (e.key === "ContextMenu") { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left + 20, y: r.top + 20, p }); } }}
                  >
                    <span className="thumb" dangerouslySetInnerHTML={p.thumbnail ? { __html: p.thumbnail } : undefined} />
                    <span className="nm">{p.name}</span>
                    <span className="meta">{g ? g.name : "Design"} · {ago(p.updatedAt)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="cards-2" aria-label="News and tutorials">
          {!dismissed && (
            <div className="info-card" data-testid="whats-new">
              <button type="button" className="ui-icon-btn x" aria-label="Dismiss What's new" onClick={() => setPrefs((p) => ({ ...p, dismissed: [...p.dismissed, WHATS_NEW_ID] }))}><X size={14} /></button>
              <h3>What&apos;s new: HingeLab Studio</h3>
              <p>One studio for all your laser work: a vector editor built for cutting, and ten generators that place live, editable parts on your sheets.</p>
            </div>
          )}
          <div className="info-card">
            <h3>Learn</h3>
            <ul>
              <li><a href="/help#first-cut">Make your first cut in five minutes</a></li>
              <li><a href="/help#kerf">Measure your kerf with the calibration card</a></li>
              <li><a href="/help#shortcuts">Keyboard shortcuts</a></li>
            </ul>
          </div>
        </section>
      </main>

      <NewProjectDialog generatorId={gen} prefs={prefs} names={names} onCancel={() => setGen(null)} onCreate={(r) => { const g = gen!; setGen(null); void create(r, g); }} />
      <NewDocumentDialog open={blank} prefs={prefs} names={names} onCancel={() => setBlank(false)} onCreate={(r) => { setBlank(false); void create(r); }} />
      <OnboardingDialog open={onboarding} prefs={prefs} onDone={(patch) => { setPrefs(patch); setOnboarding(false); }} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.p)} label={`${menu.p.name} actions`} onClose={() => setMenu(null)} />}
      <Dialog
        open={!!renaming} title="Rename project" size="narrow" onClose={() => setRenaming(null)}
        footer={<><button type="button" className="ui-btn ghost" onClick={() => setRenaming(null)}>Cancel</button><button type="button" className="ui-btn primary" onClick={() => void doRename()}>Rename</button></>}
      >
        {renaming && <TextField label="Name" value={renaming.name} onChange={(name) => setRenaming({ ...renaming, name })} onEnter={() => void doRename()} autoFocus />}
      </Dialog>
    </div>
  );

  async function doRename() {
    if (!renaming) return;
    const doc = await loadLocalProject(renaming.p.id);
    if (doc) {
      const name = uniqueName(renaming.name, names.filter((n) => n !== renaming.p.name));
      await saveLocalProject({ ...doc, name, updatedAt: new Date().toISOString() });
    }
    setRenaming(null);
    refresh();
  }
}
