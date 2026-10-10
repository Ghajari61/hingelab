"use client";

import { useAccount } from "@/components/auth/useAccount";
import { planOf, type Plan } from "@/lib/plans";

export type PlanState = {
  plan: Plan;
  /** Accounts exist on this server (Supabase is configured). */
  configured: boolean;
  signedIn: boolean;
  loading: boolean;
};

/**
 * The plan the editor should apply. Without Supabase there are no accounts and nothing to buy,
 * so every feature is open; the server applies the same rule in /api/export.
 */
export function usePlan(): PlanState {
  const a = useAccount();
  if (!a.configured) return { plan: "pro", configured: false, signedIn: false, loading: false };
  return { plan: planOf(a.profile?.plan), configured: true, signedIn: !!a.user, loading: a.loading };
}
