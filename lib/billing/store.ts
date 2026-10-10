import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BillingStore, ProfilePatch } from "./events";

/** BillingStore backed by the service-role Supabase client (profiles are read-only for users). */
export function supabaseBillingStore(admin: SupabaseClient<Database>, stripe: Pick<Stripe, "subscriptions">): BillingStore {
  return {
    async updateByCustomer(customerId: string, patch: ProfilePatch) {
      const { data, error } = await admin.from("profiles").update(patch).eq("stripe_customer_id", customerId).select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async updateByUser(userId: string, patch: ProfilePatch) {
      const { data, error } = await admin.from("profiles").update(patch).eq("id", userId).select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    retrieveSubscription: (id: string) => stripe.subscriptions.retrieve(id),
  };
}
