"use server";

import { isChallenge, isLoopbackRedirect, isState } from "@/lib/desktop/pkce";
import { createAuthCode } from "@/lib/desktop/session";
import { getUser } from "@/lib/supabase/server";

/**
 * The user pressed Allow: a one-time code for the desktop app, sent to its loopback listener.
 * Server Actions only accept same-origin posts, and the user is read from the session here again.
 */
export async function approveDesktop(redirectURI: string, state: string, challenge: string): Promise<{ url: string } | { error: string }> {
  if (!isLoopbackRedirect(redirectURI) || !isState(state) || !isChallenge(challenge)) return { error: "This sign-in link is not valid. Start again from the app." };
  const session = await getUser();
  if (!session) return { error: "Your session has ended. Sign in again." };
  try {
    const code = await createAuthCode(session.user.id, challenge, redirectURI);
    return { url: `${redirectURI}?${new URLSearchParams({ code, state })}` };
  } catch (e) {
    console.error("desktop code failed", e);
    return { error: "Could not sign in the app. Try again." };
  }
}
