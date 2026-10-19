"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { platform } from "@hingelab/platform";
import { getBrowserClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/types";
import { planOf } from "@/lib/plans";

export type Account = {
  /** False in guest mode (no Supabase settings on this server). */
  configured: boolean;
  /** Still checking the session. */
  loading: boolean;
  user: User | null;
  profile: ProfileRow | null;
};

/** The desktop app's account (from the HingeLab server through Rust), in the website's shape. */
function useDesktopAccount(on: boolean): Account {
  const [state, setState] = useState<Account>({ configured: true, loading: on, user: null, profile: null });
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const load = () => platform().auth.session().then((s) => {
      if (!alive) return;
      const user = s.user ? ({ id: s.user.id, email: s.user.email ?? undefined, user_metadata: { full_name: s.user.name } } as unknown as User) : null;
      const profile = s.user ? ({ id: s.user.id, email: s.user.email, plan: planOf(s.plan), plan_status: s.status, current_period_end: s.periodEnd, founder: false, stripe_customer_id: null, stripe_price_id: null, created_at: null } as ProfileRow) : null;
      setState({ configured: true, loading: false, user, profile });
    });
    void load();
    const off = platform().auth.onChange(() => void load());
    return () => { alive = false; off(); };
  }, [on]);
  return state;
}

/** The signed-in user and their profile (plan), kept in sync with auth changes, on the website or in the app. */
export function useAccount(): Account {
  const desktop = platform().kind !== "web";
  const fromDesktop = useDesktopAccount(desktop);
  const supabase = desktop ? null : getBrowserClient();
  const [state, setState] = useState<Account>({ configured: !!supabase, loading: !!supabase, user: null, profile: null });

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = async (user: User | null) => {
      let profile: ProfileRow | null = null;
      if (user) {
        const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        profile = data;
      }
      if (alive) setState({ configured: true, loading: false, user, profile });
    };
    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load(session?.user ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return desktop ? fromDesktop : state;
}
