import "server-only";
import { lockedPriceCopy } from "@/lib/plans";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/** The locked-price line for a customer still on the original $9 or $79 Pro price, or null. */
export async function lockedPriceCopyFor(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId || !stripeConfigured()) return null;
  try {
    const list = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const live = list.data.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
    return lockedPriceCopy(live?.items.data[0]?.price?.id);
  } catch {
    return null;
  }
}
