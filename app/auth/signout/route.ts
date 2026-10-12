import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GUEST_COOKIE } from "@/lib/auth/routes";

/** POST only, so a link or prefetch cannot sign the user out. Signing out also forgets an earlier guest choice. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.delete(GUEST_COOKIE);
  return res;
}
