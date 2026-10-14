"use client";

import { Lock, LockOpen } from "lucide-react";

/** Keeps a setting when the design is randomised. */
export function LockToggle({ on, toggle, label }: { on: boolean; toggle: () => void; label: string }) {
  return (
    <button
      type="button" className="lck" aria-pressed={on} aria-label={`${on ? "Unlock" : "Lock"} ${label}`}
      title={on ? `${label} stays when you randomise. Click to unlock.` : `Lock ${label} so Randomise keeps it`}
      onPointerDown={(e) => e.preventDefault()} onClick={toggle}
    >{on ? <Lock size={12} strokeWidth={2.2} /> : <LockOpen size={12} strokeWidth={2.2} />}</button>
  );
}
