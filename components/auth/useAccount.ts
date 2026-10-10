"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/types";

export type Account = {
  /** False in guest mode (no Supabase settings on this server). */
  configured: boolean;
  /** Still checking the session. */
  loading: boolean;
  user: User | null;
  profile: ProfileRow | null;
};

/** The signed-in user and their profile (plan), kept in sync with auth changes. */
export function useAccount(): Account {
  const supabase = getBrowserClient();
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

  return state;
}
