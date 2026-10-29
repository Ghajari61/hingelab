/**
 * The steps of an assembly booklet: which parts go in at each step, and a picture of the model so
 * far with the new parts picked out. The pictures are the thumbnails' projected drawing
 * (thumb.ts), all in one frame so the model does not move from step to step.
 */
import { placePoint } from "./place";
import { projectedSVG } from "./thumb";
import type { AssemblyGroup, GenOutput, GenPart } from "./types";

export interface BookStep { title: string; text: string; parts: string[]; svg: string }

const OLD = "#E4DED4", NEW = "#F2A541";
const baseName = (n: string) => n.replace(/\s*\(.*\)$/, "").replace(/\s+\d+$/, "").trim();
const lowZ = (p: GenPart) => Math.min(...p.outer.map(([u, v]) => placePoint(p.place ?? { x: 0, y: 0, z: 0 }, u, v, 0)[2]));

/**
 * A plan for any design: the bottom part first, then one end panel, the parts between, the other
 * end, and the rest bottom to top, parts of one kind together, at most six to a step.
 */
export function genericPlan(out: GenOutput): AssemblyGroup[] {
  const parts = [...out.parts].sort((a, b) => lowZ(a) - lowZ(b));
  const groups: AssemblyGroup[] = [];
  const used = new Set<string>();
  const take = (title: string, text: string, ps: GenPart[]) => { const ids = ps.map((p) => p.id).filter((id) => !used.has(id)); if (!ids.length) return; ids.forEach((id) => used.add(id)); groups.push({ title, text, ids }); };
  const endL = parts.filter((p) => /(^|-)end-l$/.test(p.id)), endR = parts.filter((p) => /(^|-)end-r$/.test(p.id));
  const flatBottom = parts.filter((p) => !p.place?.upright && !p.place?.m && lowZ(p) <= lowZ(parts[0]) + 0.01 && !endL.includes(p));
  if (flatBottom.length) take(flatBottom.length === 1 ? flatBottom[0].name : "Base", "Lay it flat, slots up.", flatBottom.slice(0, 1));
  if (endL.length) take(endL[0].name, "Stand it up; the parts between the ends go into its slots.", endL);
  // parts inside the frame go in before the second end; caps on top of the ends, after it
  const highZ = (p: GenPart) => Math.max(...p.outer.map(([u, v]) => placePoint(p.place ?? { x: 0, y: 0, z: 0 }, u, v, 0)[2]));
  const endTop = endR.length ? Math.max(...endR.map(highZ)) : Infinity;
  const runs = (ps: GenPart[]) => {
    for (let i = 0; i < ps.length;) {
      const kind = baseName(ps[i].name), run: GenPart[] = [];
      while (i < ps.length && run.length < 6 && (run.length === 0 || baseName(ps[i].name) === kind)) run.push(ps[i++]);
      take(run.length > 1 ? `${kind} (${run.length})` : run[0].name, "Push its tabs into their slots.", run);
    }
  };
  const rest = parts.filter((p) => !used.has(p.id) && !endR.includes(p));
  runs(rest.filter((p) => lowZ(p) < endTop - 2 * (p.t ?? 3)));
  if (endR.length) take(endR[0].name, "Press it on, every tab into its slot.", endR);
  runs(rest.filter((p) => !used.has(p.id)));
  take("Remaining parts", "Fit the remaining parts.", out.parts.filter((p) => !used.has(p.id)));
  return groups;
}

/** The booklet's steps and the finished model's picture, for a plan (every part is shown once). */
export function bookSteps(out: GenOutput, T: number, plan: AssemblyGroup[]): { cover: string; steps: BookStep[] } {
  const byId = new Map(out.parts.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const groups = plan.map((g) => ({ ...g, ids: g.ids.filter((id) => byId.has(id) && !seen.has(id) && (seen.add(id), true)) })).filter((g) => g.ids.length);
  const rest = out.parts.filter((p) => !seen.has(p.id));
  if (rest.length) groups.push({ title: "Remaining parts", text: "Fit the remaining parts.", ids: rest.map((p) => p.id) });
  const cover = projectedSVG(out, T, 600, 420);
  const vb = /viewBox="([^"]+)"/.exec(cover)?.[1];
  const steps: BookStep[] = [];
  const done: GenPart[] = [];
  for (const g of groups) {
    const fresh = g.ids.map((id) => byId.get(id)!);
    const shown = [...done.map((p) => ({ ...p, color: OLD })), ...fresh.map((p) => ({ ...p, color: NEW }))];
    let svg = projectedSVG({ ...out, parts: shown }, T, 600, 420);
    if (vb) svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${vb}"`);
    const names = [...new Map(fresh.map((p) => [baseName(p.name), 0])).keys()].map((n) => { const k = fresh.filter((p) => baseName(p.name) === n).length; return k > 1 ? `${n} ×${k}` : n; });
    steps.push({ title: g.title, text: g.text, parts: names, svg });
    done.push(...fresh);
  }
  return { cover, steps };
}
