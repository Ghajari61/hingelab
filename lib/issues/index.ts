/**
 * One problem model for every product: an issue says what is wrong and offers fixes; a fix is a
 * pure function from settings to new settings. Safe fixes are the ones Auto-fix all may apply
 * without asking (they solve the problem without changing what the design is).
 */
export type IssueLevel = "error" | "warn" | "info";

export interface Fix<P> {
  id: string;
  label: string;
  /** Auto-fix all applies it. */
  safe: boolean;
  apply: (p: P) => P;
}

export interface Issue<P> {
  code: string;
  level: IssueLevel;
  message: string;
  fixes: Fix<P>[];
  /** Parts the issue is about (Parametric: Show selects them). */
  partIds?: string[];
  /** Where on the layout (every sheet stacked, mm) the problem is, for Show to frame. */
  at?: { x0: number; y0: number; x1: number; y1: number };
}

const RANK: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
export const sortIssues = <P>(list: Issue<P>[]) => [...list].sort((a, b) => RANK[a.level] - RANK[b.level]);

export const hasSafeFix = <P>(list: Issue<P>[]) => list.some((i) => i.fixes.some((f) => f.safe));

export interface AutoFixResult<P> {
  params: P;
  /** Labels of the fixes applied, in order. */
  applied: string[];
  remaining: Issue<P>[];
}

/**
 * Apply safe fixes one at a time, worst issue first, re-checking after each, until none is left
 * or a fix has already been tried (so it can never loop).
 */
export function autoFixAll<P>(p: P, check: (p: P) => Issue<P>[], maxSteps = 8): AutoFixResult<P> {
  const tried = new Set<string>();
  const applied: string[] = [];
  let cur = p;
  let issues = sortIssues(check(cur));
  for (let step = 0; step < maxSteps; step++) {
    let pick: { issue: Issue<P>; fix: Fix<P> } | null = null;
    for (const issue of issues) {
      const fix = issue.fixes.find((f) => f.safe && !tried.has(`${issue.code}:${f.id}`));
      if (fix) { pick = { issue, fix }; break; }
    }
    if (!pick) break;
    tried.add(`${pick.issue.code}:${pick.fix.id}`);
    cur = pick.fix.apply(cur);
    applied.push(pick.fix.label);
    issues = sortIssues(check(cur));
  }
  return { params: cur, applied, remaining: issues };
}

/**
 * One pass for products whose check needs a slow rebuild (Parametric slices in a worker): the
 * first safe fix of every issue, applied together.
 */
export function applySafeFixes<P>(p: P, issues: Issue<P>[]): AutoFixResult<P> {
  let cur = p;
  const applied: string[] = [];
  const seen = new Set<string>();
  for (const issue of sortIssues(issues)) {
    const fix = issue.fixes.find((f) => f.safe);
    if (!fix || seen.has(fix.id)) continue;
    seen.add(fix.id);
    cur = fix.apply(cur);
    applied.push(fix.label);
  }
  return { params: cur, applied, remaining: [] };
}
