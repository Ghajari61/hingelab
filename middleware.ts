import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, marksGuest, routeDecision } from "@/lib/auth/routes";

/** Refreshes the Supabase session cookie on every request and guards /app/*. */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const configured = supabaseConfigured();
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (configured) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = !!data.user;
    } catch {
      signedIn = false;
    }
  }

  const guest = request.cookies.get(GUEST_COOKIE)?.value === "1";
  const target = routeDecision({ path: pathname, search, signedIn, configured, guest });
  if (!target) {
    const h = request.headers;
    const prefetch = h.has("next-router-prefetch") || h.get("purpose") === "prefetch" || /prefetch/.test(h.get("sec-purpose") ?? "");
    if (!guest && marksGuest({ path: pathname, signedIn, configured, prefetch })) {
      response.cookies.set(GUEST_COOKIE, "1", { path: "/", maxAge: GUEST_COOKIE_MAX_AGE, sameSite: "lax", httpOnly: true, secure: request.nextUrl.protocol === "https:" });
    }
    return response;
  }
  const redirect = NextResponse.redirect(new URL(target, request.url));
  for (const c of response.cookies.getAll()) redirect.cookies.set(c);
  return redirect;
}

export const config = {
  // Skip static files, images and the API (API routes check the user themselves).
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|fonts/|hb/|wasm/|models/|library/|downloads/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|ttf|otf|woff2?)$).*)"],
};
