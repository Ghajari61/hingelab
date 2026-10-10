import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleStripeEvent } from "@/lib/billing/events";
import { supabaseBillingStore } from "@/lib/billing/store";

/** Stripe → profiles. The signature is verified against the raw body before anything is read. */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Billing is not set up." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const stripe = getStripe();
  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const note = await handleStripeEvent(event, supabaseBillingStore(createAdminClient(), stripe));
    console.log(`[stripe] ${event.id} ${note}`);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(`[stripe] ${event.id} failed`, e);
    // 500 makes Stripe retry the event later.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}
