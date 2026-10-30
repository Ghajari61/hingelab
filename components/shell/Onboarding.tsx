"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Download, LayoutGrid, SlidersHorizontal, X } from "lucide-react";

const KEY = "hingelab-onboarded-v1";

const STEPS = [
  { icon: LayoutGrid, title: "Start from a ready-made design", text: "Every card in the design list is a ready design you can change: pick one to load it. To make something else, use the product menu at the top." },
  { icon: SlidersHorizontal, title: "Make it yours", text: "Change the size, text and pattern in the settings; the sheet updates as you type. Simple shows the main settings; switch to All for kerf and fine-tuning. Anything that would not cut well shows below the settings, often with a one-click fix." },
  { icon: Box, title: "Check it in 3D", text: "Switch to 3D view at the top of the sheet to see the finished piece assembled, or exploded into its parts, before you cut anything." },
  { icon: Download, title: "Export at true size", text: "Export writes SVG, DXF, PDF or LightBurn in millimetres, with the cut, score and engrave colours your laser software knows. Designing and previewing are free; exporting needs Pro." },
];

/** Four short steps the first time an editor opens; Skip or Done and it does not come back. */
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
  return createPortal(
    <section className="onboarding" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
      <button type="button" className="onboarding-x" aria-label="Skip the tour" onClick={done}><X size={14} aria-hidden /></button>
      <span className="onboarding-ico" aria-hidden><s.icon size={18} /></span>
      <p className="onboarding-step">Step {step + 1} of {STEPS.length}</p>
      <h2 id="onboarding-title">{s.title}</h2>
      <p>{s.text}</p>
      {step === 0 && <p className="onboarding-alt">Not what you wanted to make? <a href="/start">Pick another project</a>.</p>}
      <div className="onboarding-dots" aria-hidden>{STEPS.map((_, i) => <i key={i} className={i === step ? "on" : undefined} />)}</div>
      <div className="onboarding-actions">
        <button type="button" className="btn-ghost-sm" onClick={done}>Skip</button>
        <span>
          {step > 0 && <button type="button" className="btn-ghost-sm" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="button" className="btn-dark-sm" onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : done())} autoFocus>{step < STEPS.length - 1 ? "Next" : "Done"}</button>
        </span>
      </div>
    </section>, document.body
  );
}
