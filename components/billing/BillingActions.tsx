"use client";

import { useState } from "react";
import { PRICES } from "@/lib/plans";
import { openPortal, startCheckout } from "./billingClient";

type Busy = "month" | "year" | "portal" | null;

export function UpgradeButtons({ disabled, plan = "pro" }: { disabled?: boolean; plan?: "pro" | "business" }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const monthly = plan === "business" ? PRICES.businessMonthly : PRICES.monthly;
  const yearly = plan === "business" ? PRICES.businessYearly : PRICES.yearly;
  async function buy(interval: "month" | "year") {
    setBusy(interval);
    setError(null);
    const err = await startCheckout(plan, interval);
    if (err) { setError(err); setBusy(null); }
  }
  return (
    <>
      <div className="plan-buy">
        <button type="button" className="btn-primary" disabled={disabled || !!busy} onClick={() => buy("month")}>
          {busy === "month" ? "Opening checkout…" : `$${monthly}/month`}
        </button>
        <button type="button" className="btn-ghost" disabled={disabled || !!busy} onClick={() => buy("year")}>
          {busy === "year" ? "Opening checkout…" : `$${yearly}/year`}
        </button>
      </div>
      {error && <p className="auth-msg err" role="alert">{error}</p>}
    </>
  );
}

export function ManageBilling() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button type="button" className="btn-ghost" disabled={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        const err = await openPortal();
        if (err) { setError(err); setBusy(false); }
      }}>
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="auth-msg err" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
