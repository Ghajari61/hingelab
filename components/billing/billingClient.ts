"use client";

/** Sends the browser to Stripe Checkout or the Customer Portal. Returns an error message, or null while redirecting. */
async function goTo(endpoint: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) return json.error ?? "Billing is unavailable right now. Try again in a minute.";
    window.location.assign(json.url);
    return null;
  } catch {
    return "You seem to be offline. Try again when you are connected.";
  }
}

export function startCheckout(interval: "month" | "year") {
  return goTo("/api/stripe/checkout", { interval });
}

export function openPortal() {
  return goTo("/api/stripe/portal");
}
