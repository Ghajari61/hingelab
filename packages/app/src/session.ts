/**
 * The one session hook for both platforms: the website's cookie session (Supabase) or the Windows
 * app's account (loopback sign-in, then the same API through Rust).
 */
import { platform } from "@hingelab/platform";
import { useAccount } from "@/components/auth/useAccount";
import { hasPro, planOf, type Plan } from "@/lib/plans";

export interface Session {
  configured: boolean;
  loading: boolean;
  signedIn: boolean;
  plan: Plan;
  pro: boolean;
  email: string | null;
  signIn: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useSession(): Session {
  const a = useAccount();
  // Without accounts there is nothing to buy, so everything is open (the server applies the same rule).
  const plan: Plan = a.configured ? planOf(a.profile?.plan) : "pro";
  return {
    configured: a.configured, loading: a.loading, signedIn: !!a.user, plan, pro: hasPro(plan), email: a.user?.email ?? null,
    signIn: (next) => platform().auth.signIn(next),
    signOut: () => platform().auth.signOut(),
  };
}
