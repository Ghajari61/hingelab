"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { localGeneratorDrafts } from "@/lib/projects/localDrafts";
import { GENERATOR_IDS, GENERATOR_INFO } from "@/lib/generators/ids";
import { NEW_LABEL, PRODUCT_LABEL, thumbnailURL, type ProductId } from "@/lib/projects";
import type { ProjectSummary } from "@/lib/projects/repo";
import { detectProject, OPEN_ACCEPT } from "@/lib/projects/file";
import { createProjectAction, deleteProjectAction, duplicateProjectAction, importProjectAction, renameProjectAction } from "@/app/app/actions";

function ago(iso: string | null) {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type Dialog = { type: "rename"; p: ProjectSummary; name: string } | { type: "delete"; p: ProjectSummary } | null;

/** Account projects and existing generator drafts, with explicit storage scope. */
export function ProjectsHome({ projects, products, localOnly = [], limit = Infinity }: {
  projects: ProjectSummary[];
  products: ProductId[];
  /** Products this plan designs in the browser instead of the cloud (Parametric on Free). */
  localOnly?: ProductId[];
  /** Cloud projects the plan keeps (Infinity on Pro). */
  limit?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dialogOpen = dialog !== null;
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    modal?.querySelector<HTMLElement>("input, button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setDialog(null); }
      if (event.key !== "Tab" || !modal) return;
      const nodes = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href], [tabindex='0']")];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [dialogOpen]);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("all");
  const [storage, setStorage] = useState("all");
  const [drafts, setDrafts] = useState<ReturnType<typeof localGeneratorDrafts>>([]);
  useEffect(() => {
    const read = () => setDrafts(localGeneratorDrafts((key) => localStorage.getItem(key)));
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("focus", read); };
  }, []);
  const matches = (name: string, kind: string) => (product === "all" || (kind === "paperbox" ? "boxes" : kind) === product) && name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visible = storage === "local" ? [] : projects.filter((p) => matches(`${p.name} ${PRODUCT_LABEL[p.product]}`, p.product));
  const local = storage === "account" ? [] : drafts.filter((p) => matches(p.name, p.product));

  function act(fn: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, open = false) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) { setError(r.error); return; }
      if (open && r.id) router.push(`/app/editor/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <main className="boxes">
      <div className="boxes-head">
          <h1>Projects</h1>
        <div className="boxes-actions">
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={pending}>Open project file…</button>
          {products.map((pr, i) => (
            <button
              key={pr}
              type="button"
              className={i === 0 ? "btn-primary" : "btn-ghost"}
              disabled={pending}
              title={limit === 0 || localOnly.includes(pr) ? "Designed in your browser on the Free plan; cloud saving needs Pro" : undefined}
              onClick={() => {
                if (limit > 0 && !localOnly.includes(pr)) { act(() => createProjectAction(pr), true); return; }
                try { localStorage.setItem("hingelab-product", pr === "hinge-box" ? "hinge" : pr); } catch { /* private mode */ }
                router.push(`/app/editor/local?p=${pr === "hinge-box" ? "hinge" : pr}`);
              }}
            >
              + {NEW_LABEL[pr]}
            </button>
          ))}
        </div>
      </div>
      {limit === 0 ? (
        <p className="limit-note">
          <span>The Free plan cannot save cloud projects or download cut files.</span>
          <Link href="/app/billing">Upgrade to Pro to save and export</Link>
        </p>
      ) : Number.isFinite(limit) && (
        <p className="limit-note">
          <span>{projects.length} of {limit} cloud projects on the Free plan{projects.length >= limit ? ". Delete one or upgrade to start another." : "."}</span>
          <Link href="/app/billing">Upgrade to Pro for unlimited projects</Link>
        </p>
      )}
        <div className="project-filters" role="search" aria-label="Find projects">
          <label>Search<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project name or product" /></label>
          <label>Product<select aria-label="Product" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {products.map((id) => <option key={id} value={id}>{PRODUCT_LABEL[id]}</option>)}
            {GENERATOR_IDS.map((id) => <option key={id} value={id}>{GENERATOR_INFO[id].name}</option>)}
          </select></label>
          <label>Saved in<select aria-label="Saved in" value={storage} onChange={(e) => setStorage(e.target.value)}><option value="all">Account and this device</option><option value="account">Account</option><option value="local">This device</option></select></label>
          <button type="button" className="btn-ghost" onClick={() => { setQuery(""); setProduct("all"); setStorage("all"); }}>Clear filters</button>
        </div>
        <p className="project-count" role="status">{visible.length + local.length} results · Device drafts stay in this browser. Save a project file to keep a separate copy.</p>
        {error && <p className="auth-msg err" role="alert">{error}</p>}
        {visible.length + local.length === 0 ? (
        <div className="boxes-empty">
            <p>{projects.length || drafts.length ? "No matching projects. Try another search or clear the filters." : "No projects yet. Start a design, or open a project file (.oclc) you saved earlier."}</p>
            <Link href="/start">Start a design</Link>
        </div>
      ) : (
        <ul className="boxes-grid">
            {visible.map((p) => (
            <li key={p.id} className="box-card">
              <Link href={`/app/editor/${p.id}`} className="box-thumb" aria-label={`Open ${p.name}`}>
                {p.thumbnail_svg ? <img src={thumbnailURL(p.thumbnail_svg)} alt="" /> : <span className="box-thumb-empty">No preview yet</span>}
              </Link>
              <div className="box-meta">
                <Link href={`/app/editor/${p.id}`} className="box-name">{p.name}</Link>
                <span>{PRODUCT_LABEL[p.product]} · edited {ago(p.updated_at)}</span>
                  <span className="project-storage">Account</span>
              </div>
              <div className="box-btns">
                <Link href={`/app/editor/${p.id}`}>Open</Link>
                <button type="button" disabled={pending || limit === 0} title={limit === 0 ? "Cloud saving needs Pro" : undefined} onClick={() => act(() => duplicateProjectAction(p.id))}>Duplicate</button>
                <button type="button" disabled={pending || limit === 0} title={limit === 0 ? "Cloud saving needs Pro" : undefined} onClick={() => setDialog({ type: "rename", p, name: p.name })}>Rename</button>
                <button type="button" disabled={pending} onClick={() => setDialog({ type: "delete", p })}>Delete</button>
              </div>
            </li>
          ))}
            {local.map((p) => <li className="box-card" key={`local-${p.product}`}>
              <Link href={p.href} className="box-thumb" aria-label={`Open ${p.name}`}><span className="box-thumb-empty">{GENERATOR_INFO[p.product].name}</span></Link>
              <div className="box-meta"><Link className="box-name" href={p.href}>{p.name}</Link><span className="project-storage">This device · latest autosave</span></div>
              <div className="box-btns"><Link href={p.href}>Continue editing</Link></div>
            </li>)}
        </ul>
      )}

      {dialog && (
        <div className="modal-back" onClick={() => setDialog(null)}>
          <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" onClick={(e) => e.stopPropagation()}>
            <header id="project-dialog-title">
              {dialog.type === "rename" ? "Rename project" : "Delete project"}
              <button type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button>
            </header>
            {dialog.type === "rename" ? (
              <form
                className="mb"
                onSubmit={(e) => {
                  e.preventDefault();
                  const { p, name } = dialog;
                  setDialog(null);
                  act(() => renameProjectAction(p.id, name));
                }}
              >
                <input
                  className="rename-input"
                  autoFocus
                  maxLength={200}
                  aria-label="Project name"
                  required
                  value={dialog.name}
                  onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                />
                <div className="rename-row">
                  <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={!dialog.name.trim()}>Rename</button>
                </div>
              </form>
            ) : (
              <div className="mb">
                <p>Delete <b>{dialog.p.name}</b>? This cannot be undone.</p>
                <div className="rename-row">
                  <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => {
                      const { p } = dialog;
                      setDialog(null);
                      act(() => deleteProjectAction(p.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={OPEN_ACCEPT}
        hidden
        aria-label="Open a project file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          void f.arrayBuffer().then(async (buf) => {
            const d = detectProject(new Uint8Array(buf));
            if ("error" in d) { setError(d.error); return; }
            if (d.section === "hinge" || d.section === "letters" || d.section === "parametric") {
              const text = new TextDecoder().decode(buf);
              act(() => importProjectAction(text), true);
              return;
            }
            // Generators and Studio design on this device: the file opens in its own editor.
            const { openProjectFile } = await import("@/components/shell/projectFiles");
            await openProjectFile(f, null, null, (m) => { if (!m.startsWith("Opening")) setError(m); });
          });
        }}
      />
    </main>
  );
}
