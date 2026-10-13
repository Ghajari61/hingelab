/** Applies assembly fixes to a document draft (inside an editor edit, so one fix or many is one undo step). */
import { invert, mul } from "../geom";
import { locate } from "../scene";
import type { Document } from "../types";
import type { Assembly, Fix, Issue } from "./index";

export function applyFix(d: Document, fix: Fix) {
  switch (fix.kind) {
    case "anchors":
      for (const m of fix.moves) {
        const n = locate(d.root, m.node)?.node;
        const a = n?.type === "path" ? n.subpaths[m.sub]?.nodes[m.index] : undefined;
        if (!a) continue;
        a.x += m.dx; a.y += m.dy;
        if (a.i) a.i = { x: a.i.x + m.dx, y: a.i.y + m.dy };
        if (a.o) a.o = { x: a.o.x + m.dx, y: a.o.y + m.dy };
      }
      return;
    case "material":
      for (const s of d.sheets) if (!fix.from || s.materialId === fix.from) s.materialId = fix.materialId;
      return;
    case "close":
      for (const c of fix.cuts) {
        const n = locate(d.root, c.node)?.node;
        const s = n?.type === "path" ? n.subpaths[c.sub] : undefined;
        if (!s || s.closed) continue;
        const first = s.nodes[0], last = s.nodes[s.nodes.length - 1];
        if (s.nodes.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) < 0.01) {
          if (last.i) first.i = last.i;
          s.nodes.pop();
        }
        s.closed = true;
      }
      return;
    case "place":
      for (const p of fix.nodes) {
        const l = locate(d.root, p.node);
        if (l) l.node.transform = mul(invert(l.parentWorld), mul(p.m, l.world));
      }
      return;
  }
}

/** The fixes applied by themselves when the 3D view opens. */
export const safeIssues = (asm: Assembly): Issue[] => asm.issues.filter((i) => i.safe && i.fix);

export function applyIssues(d: Document, issues: Issue[]) {
  for (const i of issues) if (i.fix) applyFix(d, i.fix);
}
