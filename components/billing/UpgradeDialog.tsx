"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PRICES, PRO_BENEFITS } from "@/lib/plans";

const BUSINESS_BENEFITS = [
  "Everything in Pro",
  "Unlimited batch generation",
  "Up to 3 devices signed in at once",
  "Commercial-use license",
  "Priority support",
];
import { startCheckout } from "./billingClient";

/**
 * "Upgrade to Pro" dialog shown when a locked feature is used. Signed-out visitors are sent to
 * sign up first and come back to Billing.
 */
/** Largest drawing shown as the preview (a very large file would make the dialog slow to open). */
const MAX_PREVIEW = 3 * 1024 * 1024;

export function UpgradeDialog({ reason, signedIn, onClose, preview }: {
  reason: string; signedIn: boolean; onClose: () => void;
  /** The design's cut file as drawn here, shown so the visitor sees what Pro downloads. */
  preview?: () => string | null;
}) {
  const previewSrc = useMemo(() => {
    const svg = preview?.();
    return svg && svg.length < MAX_PREVIEW ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once, when the dialog opens
  }, []);
  const [busy, setBusy] = useState<"month" | "year" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const business = reason.includes("unlimited batches");
  const plan = business ? "business" : "pro";
  const monthly = business ? PRICES.businessMonthly : PRICES.monthly;
  const yearly = business ? PRICES.businessYearly : PRICES.yearly;
  const yearlySaving = Math.round((1 - yearly / (monthly * 12)) * 100);
  const benefits = business ? BUSINESS_BENEFITS : PRO_BENEFITS;
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(".upgrade-buy .btn-export")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); back?.focus?.(); };
  }, []);

  async function buy(interval: "month" | "year") {
    setBusy(interval);
    setError(null);
    const err = await startCheckout(plan, interval);
    if (err) { setError(err); setBusy(null); }
  }

  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal upgrade" role="dialog" aria-modal="true" aria-label={business ? "Upgrade to Business" : "Upgrade to Pro"} ref={ref}>
        <header>{business ? "Upgrade to Business" : "Upgrade to Pro"}<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          <p className="upgrade-reason">{reason}</p>
          {previewSrc && (
            <figure className="upgrade-preview">
              <img src={previewSrc} alt="The cut file of this design" />
              <figcaption>Your design, ready to cut: this is the file Pro downloads.</figcaption>
            </figure>
          )}
          <ul className="upgrade-list">
            {benefits.map((b) => <li key={b}>{b}</li>)}
          </ul>
          {signedIn ? (
            <div className="upgrade-buy">
              <button type="button" className="btn-export" disabled={!!busy} onClick={() => buy("month")}>
                {busy === "month" ? "Opening checkout…" : `$${monthly} / month`}
              </button>
              <button type="button" className="btn-export" disabled={!!busy} onClick={() => buy("year")}>
                {busy === "year" ? "Opening checkout…" : `$${yearly} / year`}
              </button>
              <span className="upgrade-save">Yearly saves {yearlySaving}%</span>
            </div>
          ) : (
            <div className="upgrade-buy">
              <a className="btn-export" href="/signup?next=%2Fapp%2Fbilling">Create a free account</a>
              <a className="upgrade-link" href="/login?next=%2Fapp%2Fbilling">I already have one</a>
            </div>
          )}
          {error && <p className="upgrade-error" role="alert">{error}</p>}
          <p className="upgrade-fine">Cancel any time from Billing. Prices in {PRICES.currency}.</p>
        </div>
      </div>
    </div>
  );
}
