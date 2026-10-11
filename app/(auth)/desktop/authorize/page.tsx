import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DesktopConsent } from "@/components/auth/DesktopConsent";
import { isChallenge, isLoopbackRedirect, isState } from "@/lib/desktop/pkce";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in to HingeLab for Windows", robots: { index: false } };
export const dynamic = "force-dynamic";

type Search = { redirect_uri?: string; state?: string; code_challenge?: string; code_challenge_method?: string };

/**
 * Step two of the desktop sign-in: the app opened this page in the browser with a PKCE challenge
 * and its loopback address. The signed-in user approves, and the browser hands a one-time code to
 * the app. The middleware has already sent signed-out visitors through /login.
 */
export default async function DesktopAuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const valid = isLoopbackRedirect(q.redirect_uri) && isState(q.state) && isChallenge(q.code_challenge) && q.code_challenge_method === "S256";
  if (!valid) {
    return (
      <div className="auth-card">
        <h1>Desktop sign-in link not valid</h1>
        <p className="auth-lead">Go back to the HingeLab app and choose Sign in again.</p>
      </div>
    );
  }
  const session = await getUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/desktop/authorize?${new URLSearchParams(q as Record<string, string>)}`)}`);
  return <DesktopConsent email={session.user.email ?? ""} redirectURI={q.redirect_uri!} state={q.state!} challenge={q.code_challenge!} />;
}
