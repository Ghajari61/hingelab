"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { NEW_LABEL, PRODUCT_LABEL, thumbnailURL, type ProductId } from "@/lib/projects";
import type { ProjectSummary } from "@/lib/projects/repo";
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

/** "My boxes": the user's cloud projects with Open / Duplicate / Rename / Delete. */
export function ProjectsHome({ projects, products }: { projects: ProjectSummary[]; products: ProductId[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
        <h1>My boxes</h1>
        <div className="boxes-actions">
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={pending}>Open project file…</button>
          {products.map((pr, i) => (
            <button key={pr} type="button" className={i === 0 ? "btn-primary" : "btn-ghost"} disabled={pending} onClick={() => act(() => createProjectAction(pr), true)}>
              + {NEW_LABEL[pr]}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="auth-msg err" role="alert">{error}</p>}
      {projects.length === 0 ? (
        <div className="boxes-empty">
          <p>No projects yet. Start a box, or open a <code>.hingelab.json</code> file you saved earlier.</p>
        </div>
      ) : (
        <ul className="boxes-grid">
          {projects.map((p) => (
            <li key={p.id} className="box-card">
              <Link href={`/app/editor/${p.id}`} className="box-thumb" aria-label={`Open ${p.name}`}>
                {p.thumbnail_svg ? <img src={thumbnailURL(p.thumbnail_svg)} alt="" /> : <span className="box-thumb-empty">No preview yet</span>}
              </Link>
              <div className="box-meta">
                <Link href={`/app/editor/${p.id}`} className="box-name">{p.name}</Link>
                <span>{PRODUCT_LABEL[p.product]} · edited {ago(p.updated_at)}</span>
              </div>
              <div className="box-btns">
                <Link href={`/app/editor/${p.id}`}>Open</Link>
                <button type="button" disabled={pending} onClick={() => act(() => duplicateProjectAction(p.id))}>Duplicate</button>
                <button type="button" disabled={pending} onClick={() => setDialog({ type: "rename", p, name: p.name })}>Rename</button>
                <button type="button" disabled={pending} onClick={() => setDialog({ type: "delete", p })}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <div className="modal-back" onClick={() => setDialog(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
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
                  value={dialog.name}
                  onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                />
                <div className="rename-row">
                  <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="btn-primary">Rename</button>
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
        accept=".json,.hingelab.json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          f.text().then((text) => act(() => importProjectAction(text), true));
        }}
      />
    </main>
  );
}
