"use client";

import { AlertTriangle, Info, OctagonAlert, Wand2 } from "lucide-react";
import { hasSafeFix, sortIssues, type Fix, type Issue } from "@/lib/issues";

const ICON = { error: OctagonAlert, warn: AlertTriangle, info: Info } as const;

/**
 * What to check, each with its fixes, and Auto-fix all for the safe ones. Notes (info) come last
 * and stay quiet unless they offer a fix.
 */
export function IssueList<P>({ issues, onFix, onAutoFix, onShow }: {
  issues: Issue<P>[];
  onFix: (fix: Fix<P>, issue: Issue<P>) => void;
  onAutoFix: () => void;
  /** Select the parts an issue is about (and frame where it is, when it knows). */
  onShow?: (ids: string[], at?: Issue<P>["at"]) => void;
}) {
  if (!issues.length) return null;
  const sorted = sortIssues(issues);
  const problems = sorted.filter((i) => i.level !== "info");
  const notes = sorted.filter((i) => i.level === "info");
  const row = (i: Issue<P>, k: number) => {
    const Icon = ICON[i.level];
    return (
      <li key={`${i.code}-${k}`} className={`issue ${i.level}`} data-code={i.code}>
        <Icon size={14} strokeWidth={2} aria-hidden className="issue-icon" />
        <div>
          <span>{i.message}</span>
          {(i.fixes.length > 0 || (onShow && i.partIds?.length)) && (
            <div className="issue-fixes">
              {i.fixes.map((f) => (
                <button key={f.id} type="button" className={f.safe ? "safe" : undefined} title={f.safe ? "Auto-fix all applies this one" : undefined} onClick={() => onFix(f, i)}>{f.label}</button>
              ))}
              {onShow && i.partIds?.length ? <button type="button" className="show" onClick={() => onShow(i.partIds!, i.at)}>Show</button> : null}
            </div>
          )}
        </div>
      </li>
    );
  };
  return (
    <div className="checks" aria-label="Checks">
      {problems.length > 0 && (
        <>
          <div className="checks-head">
            <p className="issues-title">To check</p>
            {hasSafeFix(problems) && (
              <button type="button" className="btn-autofix" onClick={onAutoFix}><Wand2 size={14} strokeWidth={2} aria-hidden /> Auto-fix all</button>
            )}
          </div>
          <ul className="issue-list">{problems.map(row)}</ul>
        </>
      )}
      {notes.length > 0 && (
        <>
          <p className="issues-title">Notes</p>
          <ul className="issue-list notes">{notes.map(row)}</ul>
        </>
      )}
    </div>
  );
}
