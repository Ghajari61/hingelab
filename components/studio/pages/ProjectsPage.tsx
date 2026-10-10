"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { EmptyState, SegmentedControl, useToast } from "@/components/ui";
import { generatorMeta } from "@/lib/generators/catalog";
import { inertSvgMarkup } from "@/lib/security/svg";
import { fuzzyFilter } from "@/lib/studio/fuzzy";
import { deleteLocalProject, listLocalProjects, loadLocalProject, saveLocalProject, type LocalProjectSummary } from "@/lib/studio/localStore";
import { editorPath } from "../projectActions";
import { StudioHeader } from "../StudioHeader";

export default function ProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<LocalProjectSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"modified" | "name">("modified");
  const refresh = () => { listLocalProjects().then(setList).catch(() => setList([])); };
  useEffect(refresh, []);
  const shown = useMemo(() => {
    const l = list ?? [];
    const f = q ? fuzzyFilter(l, q, (p) => p.name).map((x) => x.item) : l.slice();
    return q ? f : f.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [list, q, sort]);

  async function remove(p: LocalProjectSummary) {
    const doc = await loadLocalProject(p.id);
    await deleteLocalProject(p.id);
    refresh();
    toast({ message: `Deleted ${p.name}`, action: doc ? { label: "Undo", run: () => { void saveLocalProject(doc, p.thumbnail).then(refresh); } } : undefined });
  }

  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main">
        <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
          <h1 style={{ marginRight: "auto" }}>Projects</h1>
          <input className="ui-text" style={{ width: 260 }} placeholder="Search projects" aria-label="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
          <SegmentedControl label="Sort" hideLabel value={sort} onChange={setSort} options={[{ value: "modified", label: "Last modified" }, { value: "name", label: "Name" }]} />
        </div>
        <section aria-labelledby="on-device">
          <h2 id="on-device">On this device</h2>
          {list && list.length === 0 ? (
            <EmptyState icon={<FolderOpen size={32} />} title="No projects yet" action={<a className="ui-btn primary" href="/home">Start a project</a>}>
              Projects you create appear here. Sign in to keep them in the cloud and open them anywhere.
            </EmptyState>
          ) : (
            <div className="gen-grid" role="list">
              {shown.map((p) => (
                <div key={p.id} role="listitem" className="recent-card" style={{ cursor: "default" }}>
                  <button type="button" className="thumb" style={{ border: 0, cursor: "pointer" }} aria-label={`Open ${p.name}`} onClick={() => router.push(editorPath(p.id))} dangerouslySetInnerHTML={inertSvgMarkup(p.thumbnail) ? { __html: inertSvgMarkup(p.thumbnail)! } : undefined} />
                  <span className="nm">{p.name}</span>
                  <span className="meta">{p.generators[0] ? generatorMeta(p.generators[0])?.name : "Design"} · {new Date(p.updatedAt).toLocaleDateString()}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="ui-btn small" onClick={() => router.push(editorPath(p.id))}>Open</button>
                    <button type="button" className="ui-btn small ghost" onClick={() => void remove(p)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
