"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LayoutTemplate, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge, Dialog, EmptyState, useToast } from "@/components/ui";
import { GENERATOR_INFO, isGeneratorId } from "@/lib/generators/ids";
import { templateCategories, templateThumb, TEMPLATE_BY_ID, TEMPLATES } from "@/lib/templates/catalog";
import { searchTemplates } from "@/lib/templates/search";
import type { Template, TemplateCategory } from "@/lib/templates/types";
import { createProjectFromTemplate, editorPath, templateEditorPath } from "../projectActions";
import { StudioHeader } from "../StudioHeader";
import { usePrefs } from "../usePrefs";

export const productName = (p: string) => (p === "hinge" ? "Hinge Box" : isGeneratorId(p) ? GENERATOR_INFO[p].name : "generator");

const mm = (v: number) => `${Math.round(v)}`;
export const templateSize = (t: Template) => `${mm(t.w)} × ${mm(t.h)} mm${t.sheets > 1 ? `, ${t.sheets} sheets` : ""}`;

/** Gallery state lives in the URL (?q=, ?c=, ?t=) so a search or a template can be linked to. */
function readUrl() {
  const q = new URLSearchParams(window.location.search);
  const c = q.get("c");
  return { q: q.get("q") ?? "", c: (c && templateCategories().some((x) => x.id === c) ? c : "") as TemplateCategory | "", t: q.get("t") ?? "" };
}
function writeUrl(s: { q: string; c: string; t: string }) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(s)) if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
}

export function TemplatesGallery() {
  const router = useRouter();
  const toast = useToast();
  const [prefs] = usePrefs();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<TemplateCategory | "">("");
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const cats = useMemo(templateCategories, []);

  useEffect(() => {
    const s = readUrl();
    setQ(s.q); setCat(s.c); setSelId(TEMPLATE_BY_ID[s.t] ? s.t : ""); setReady(true);
  }, []);
  useEffect(() => { if (ready) writeUrl({ q: q.trim(), c: cat, t: selId }); }, [q, cat, selId, ready]);

  const list = useMemo(() => searchTemplates(TEMPLATES, q, cat || undefined), [q, cat]);
  const sel = selId ? TEMPLATE_BY_ID[selId] : undefined;

  async function openInStudio(t: Template) {
    setBusy(true);
    try {
      const id = await createProjectFromTemplate(t.id, prefs.materialId, prefs.machineId);
      router.push(editorPath(id));
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "The template could not be opened.", kind: "danger" });
      setBusy(false);
    }
  }
  const customise = (t: Template) => { if (t.product) window.location.assign(templateEditorPath(t.product, t.id)); };

  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main tpl-main">
        <header className="tpl-head">
          <h1>Templates</h1>
          <p>{TEMPLATES.length} ready-to-cut projects. Open one in Studio to edit every part, or customise its settings in a generator.</p>
        </header>

        <div className="tpl-tools">
          <div className="home-search">
            <Search size={16} className="ic" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates: box, lamp, coaster, wedding…" aria-label="Search templates" data-testid="template-search" />
            {q && <button type="button" className="ui-icon-btn tpl-clear" aria-label="Clear search" onClick={() => setQ("")}><X size={14} /></button>}
          </div>
          <div className="tpl-cats" role="group" aria-label="Categories">
            <button type="button" className="tpl-cat" aria-pressed={!cat} onClick={() => setCat("")}>All <span>{TEMPLATES.length}</span></button>
            {cats.map((c) => (
              <button key={c.id} type="button" className="tpl-cat" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? "" : c.id)}>{c.id} <span>{c.count}</span></button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState icon={<LayoutTemplate size={30} />} title="No templates match" action={<button type="button" className="ui-btn" onClick={() => { setQ(""); setCat(""); }}>Show all templates</button>}>
            Try another word, or clear the category.
          </EmptyState>
        ) : (
          <div className="tpl-grid" role="list" aria-label="Templates" data-testid="template-grid">
            {list.map((t) => (
              <button key={t.id} type="button" role="listitem" className="tpl-card" onClick={() => setSelId(t.id)} data-testid={`template-${t.id}`} aria-label={`${t.title}: ${t.category}, ${t.difficulty}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static template thumbnails */}
                <span className="thumb"><img src={templateThumb(t.id)} alt="" loading="lazy" decoding="async" width={300} height={200} /></span>
                <span className="chips">
                  {t.pro && <Badge kind="pro" />}
                  {t.source === "studio" && <span className="chip">Live effects</span>}
                  {t.credit && <span className="chip">CC BY</span>}
                </span>
                <span className="txt">
                  <span className="name">{t.title}</span>
                  <span className="meta">{t.category} · {t.difficulty} · {templateSize(t)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      <Dialog
        open={!!sel} title={sel?.title ?? ""} size="wide" testId="template-dialog" onClose={() => setSelId("")}
        footer={sel && (
          <>
            {sel.product && (
              <button type="button" className={`ui-btn${sel.source === "editor" ? " primary" : ""}`} onClick={() => customise(sel)} data-testid="template-customise">
                <SlidersHorizontal size={15} /> Customise in {productName(sel.product)}
              </button>
            )}
            {sel.source !== "editor" && (
              <button type="button" className="ui-btn primary" disabled={busy} onClick={() => void openInStudio(sel)} data-testid="template-open">
                {busy ? "Opening…" : "Open in Studio"}
              </button>
            )}
          </>
        )}
      >
        {sel && <TemplateDetail t={sel} />}
      </Dialog>
    </div>
  );
}

function TemplateDetail({ t }: { t: Template }) {
  return (
    <div className="tpl-detail">
      {/* eslint-disable-next-line @next/next/no-img-element -- static template thumbnails */}
      <div className="preview"><img src={templateThumb(t.id)} alt={`${t.title} preview`} width={300} height={200} /></div>
      <div className="info">
        <p>{t.description}</p>
        <dl className="tpl-facts">
          <dt>Size</dt><dd>{templateSize(t)}</dd>
          <dt>Material</dt><dd>{t.material}, {t.thickness} mm</dd>
          <dt>Difficulty</dt><dd>{t.difficulty}</dd>
          <dt>Category</dt><dd>{t.category}</dd>
          <dt>Opens</dt><dd>{t.source === "studio" ? "In Studio, as live shapes and effects you can edit" : t.source === "svg" ? "In Studio, as cut paths on their layers" : `In the ${productName(t.product ?? "")} editor`}</dd>
        </dl>
        {t.pro && <p className="dlg-note"><Badge kind="pro" /> {t.pro}. On the Free plan you can open, preview and edit it; exporting needs Pro.</p>}
        {t.credit && (
          <div className="tpl-credit">
            <strong>Credit</strong>
            <p>
              “{t.credit.title}” by {t.credit.author}, <a href={t.credit.sourceUrl} target="_blank" rel="noopener noreferrer">{t.credit.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")} <ExternalLink size={11} aria-hidden /></a>,
              licensed under <a href={t.credit.licenceUrl} target="_blank" rel="noopener noreferrer">{t.credit.licence}</a>. {t.credit.changes}
            </p>
          </div>
        )}
        <p className="tpl-tags">{t.tags.map((g) => <span key={g}>{g}</span>)}</p>
      </div>
    </div>
  );
}
