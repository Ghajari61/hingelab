"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const KEY = "hingelab-onboarded-v1";

const STEPS = [
  { title: "Start from a design", text: "Pick a preset on the left, or a product at the top. Every preset is a real cut file you can change." },
  { title: "Make it yours", text: "Change the size, text and pattern on the right; the sheet updates as you type. The checks under the panel point out anything that would not cut well, often with a one-click fix." },
  { title: "Export at true size", text: "Export writes SVG, DXF, PDF or LightBurn in millimetres, with the cut, score and engrave colours your laser software knows. Designing is free; exporting needs Pro." },
];

/** Three short steps the first time an editor opens; Skip or Done and it does not come back. */
export function Onboarding() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      if (navigator.webdriver || localStorage.getItem(KEY)) return;
      setStep(0);
    } catch { /* storage off: no tour */ }
  }, []);
  if (step === null) return null;
  const done = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* storage off */ }
    setStep(null);
  };
  const s = STEPS[step];
  return (
    <section className="onboarding" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
      <button type="button" className="onboarding-x" aria-label="Skip the tour" onClick={done}><X size={14} aria-hidden /></button>
      <p className="onboarding-step">Step {step + 1} of {STEPS.length}</p>
      <h2 id="onboarding-title">{s.title}</h2>
      <p>{s.text}</p>
      <div className="onboarding-actions">
        <button type="button" className="btn-ghost-sm" onClick={done}>Skip</button>
        <span>
          {step > 0 && <button type="button" className="btn-ghost-sm" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="button" className="btn-dark-sm" onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : done())} autoFocus>{step < STEPS.length - 1 ? "Next" : "Done"}</button>
        </span>
      </div>
    </section>
  );
}
