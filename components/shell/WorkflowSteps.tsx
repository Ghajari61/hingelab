"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { STEPS, STEP_NAMES, type Step } from "@/lib/editor/workflow";

const shown = (el: Element) => el.getClientRects().length > 0;

/**
 * The workflow above the panels: each step jumps to its first section, the one in view is marked,
 * Validation counts the problems the checks list, and Export goes to the export button. It reads
 * the panels it sits over (sections carry data-step), so every editor gets it unchanged.
 */
export function WorkflowSteps({ body, col, simple, onAdvanced }: {
  body: RefObject<HTMLElement | null>;
  col: RefObject<HTMLElement | null>;
  simple: boolean;
  onAdvanced: () => void;
}) {
  const [present, setPresent] = useState("");
  const [counts, setCounts] = useState({ err: 0, warn: 0, hidden: 0 });
  const [current, setCurrent] = useState<Step | null>(null);
  const simpleRef = useRef(simple);
  simpleRef.current = simple;

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const read = () => {
      const steps = [...new Set([...el.querySelectorAll<HTMLElement>("[data-step]")].filter(shown).map((x) => x.dataset.step!))].sort().join(",");
      setPresent((p) => (p === steps ? p : steps));
      // Advanced fields that differ from their defaults while Simple hides them.
      const changed = el.querySelectorAll("[data-advanced][data-changed], [data-advanced] [data-changed], [data-advanced] .rst-mark");
      const hidden = simpleRef.current ? new Set([...changed].map((node) => node.closest("[data-changed]") ?? node)).size : 0;
      const err = el.querySelectorAll(".issue.error").length, warn = el.querySelectorAll(".issue.warn").length;
      setCounts((c) => (c.err === err && c.warn === warn && c.hidden === hidden ? c : { err, warn, hidden }));
    };
    const scroller = el.querySelector<HTMLElement>(".dock");
    const onScroll = () => {
      if (!scroller) return;
      const top = scroller.getBoundingClientRect().top + 24;
      let at: Step | null = null;
      for (const s of scroller.querySelectorAll<HTMLElement>("[data-step]")) {
        if (!shown(s)) continue;
        if (s.getBoundingClientRect().top <= top) at = s.dataset.step as Step;
        else { at ??= s.dataset.step as Step; break; }
      }
      setCurrent(at);
    };
    read();
    onScroll();
    const mo = new MutationObserver(() => { read(); onScroll(); });
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-step", "data-changed", "class", "hidden", "open"] });
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => { mo.disconnect(); scroller?.removeEventListener("scroll", onScroll); };
  }, [body, simple]);

  const go = (s: Step) => {
    if (s === "export") { col.current?.querySelector<HTMLButtonElement>(".btn-export.wide")?.focus(); setCurrent(s); return; }
    const t = [...(body.current?.querySelectorAll<HTMLElement>(`[data-step="${s}"]`) ?? [])].find(shown);
    if (!t) return;
    const d = t.querySelector("details");
    if (d) d.open = true;
    const smooth = !document.documentElement.hasAttribute("data-reduce-motion") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    t.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    setCurrent(s);
  };

  const has = new Set(present.split(","));
  return (
    <nav className="steps" aria-label="Workflow">
      <ol>
        {STEPS.map((s, i) => {
          const off = s !== "export" && !has.has(s);
          const badge = s === "validation" && (counts.err || counts.warn) ? (counts.err ? counts.err : counts.warn) : 0;
          return (
            <li key={s}>
              <button
                type="button" disabled={off} aria-current={current === s ? "step" : undefined} onClick={() => go(s)}
                title={off ? `${STEP_NAMES[s]}: nothing to set for this design` : badge ? `${STEP_NAMES[s]}: ${counts.err} to fix, ${counts.warn} to check` : STEP_NAMES[s]}
              >
                <span className="n" aria-hidden>{i + 1}</span>{STEP_NAMES[s]}
                {badge ? <span className={`b ${counts.err ? "err" : "warn"}`} aria-label={`${badge} ${counts.err ? "to fix" : "to check"}`}>{badge}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
      {simple && counts.hidden > 0 && (
        <p className="steps-note" role="status">
          {counts.hidden} hidden setting{counts.hidden === 1 ? " differs" : "s differ"} from the default. <button type="button" className="linkish" onClick={onAdvanced}>Show all settings</button>
        </p>
      )}
    </nav>
  );
}
