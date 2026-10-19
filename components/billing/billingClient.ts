"use client";

import { platform } from "@hingelab/platform";

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

/** The Windows app pays on the website, in the browser, signed in there. */
async function inBrowser(path: string): Promise<string | null> {
  try {
    await platform().openExternal(path);
    return null;
  } catch {
    return "Could not open your web browser.";
  }
}

export function startCheckout(plan: "pro" | "business", interval: "month" | "year" = "month") {
  if (platform().kind !== "web") return inBrowser(`/billing?plan=${plan}&interval=${interval}`);
  return goTo("/api/stripe/checkout", { plan, interval });
}

export function openPortal() {
  if (platform().kind !== "web") return inBrowser("/billing");
  return goTo("/api/stripe/portal");
}
