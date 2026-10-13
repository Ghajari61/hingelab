/**
 * The desktop sign-in and API end to end, against the local Supabase stack: consent code, PKCE
 * exchange, bearer calls, refresh rotation, refresh-token reuse, sign-out, version gate and plans.
 * Route handlers are called directly with Request objects.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as tokenPOST } from "@/app/api/desktop/token/route";
import { POST as logoutPOST } from "@/app/api/desktop/logout/route";
import { GET as meGET } from "@/app/api/desktop/me/route";
import { GET as catalogGET } from "@/app/api/desktop/catalog/route";
import { POST as generatePOST } from "@/app/api/desktop/generate/route";
import { POST as aiPOST } from "@/app/api/desktop/ai/route";
import { GET as updateGET } from "@/app/api/desktop/update/[target]/[arch]/[version]/route";
import { POST as webSessionPOST } from "@/app/api/desktop/web-session/route";
import { createClient } from "@supabase/supabase-js";
import { adminClient, deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";
import stableManifest from "@/desktop/releases/stable.json";
import { randomToken, sha256 } from "../pkce";
import { createAuthCode } from "../session";

const up = await localSupabaseUp();
const BASE = "https://hingelab.test";
const REDIRECT = "http://127.0.0.1:49200/callback";
// A fresh address per run: the token rate limit is counted per IP in the shared local database.
const ip = () => Math.floor(Math.random() * 254) + 1;
const CLIENT = { "x-hingelab-client": "desktop/1.0.0", "x-forwarded-for": `10.${ip()}.${ip()}.${ip()}` };

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...CLIENT, ...headers }, body: JSON.stringify(body) });
const get = (path: string, headers: Record<string, string> = {}) => new Request(BASE + path, { headers: { ...CLIENT, ...headers } });
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function signIn(userId: string) {
  const verifier = randomToken() + randomToken();
  const code = await createAuthCode(userId, sha256(verifier), REDIRECT);
  const res = await tokenPOST(post("/api/desktop/token", { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, device: "test" }));
  expect(res.status).toBe(200);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

describe.skipIf(!up)("desktop API (local Supabase)", () => {
  let user: { id: string };

  beforeAll(async () => {
    user = await newUser("desktop");
  });
  afterAll(async () => {
    if (user) await deleteUser(user.id);
  });

  it("exchanges a code once, only with the right verifier and redirect", async () => {
    const verifier = randomToken() + randomToken();
    const code = await createAuthCode(user.id, sha256(verifier), REDIRECT);
    const wrong = await tokenPOST(post("/api/desktop/token", { grant_type: "authorization_code", code, code_verifier: randomToken() + "x", redirect_uri: REDIRECT }));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "invalid_grant" });
    // The failed attempt used the code up.
    const again = await tokenPOST(post("/api/desktop/token", { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT }));
    expect(again.status).toBe(400);

    const v2 = randomToken() + randomToken();
    const c2 = await createAuthCode(user.id, sha256(v2), REDIRECT);
    const otherPort = await tokenPOST(post("/api/desktop/token", { grant_type: "authorization_code", code: c2, code_verifier: v2, redirect_uri: "http://127.0.0.1:49201/callback" }));
    expect(otherPort.status).toBe(400);

    const t = await signIn(user.id);
    expect(t.expires_in).toBe(900);
    expect(t.access_token).not.toBe(t.refresh_token);
    const { data } = await adminClient().rpc("desktop_session_user", { p_access_hash: sha256(t.access_token) });
    expect(data?.[0]?.user_id).toBe(user.id);
  });

  it("serves account, catalog and designs with the plan from the database", async () => {
    const t = await signIn(user.id);
    expect((await meGET(get("/api/desktop/me"))).status).toBe(401);
    expect((await meGET(get("/api/desktop/me", { authorization: "Bearer nope" }))).status).toBe(401);
    const me = await meGET(get("/api/desktop/me", auth(t.access_token)));
    expect(me.status).toBe(200);
    const account = await me.json();
    expect(account).toMatchObject({ user: { id: user.id }, plan: "free", entitlements: { cleanExport: false }, minimumVersion: "1.0.0" });
    expect(me.headers.get("cache-control")).toBe("no-store");

    expect((await catalogGET(get("/api/desktop/catalog", auth(t.access_token)))).status).toBe(200);

    const locked = await generatePOST(post("/api/desktop/generate", { product: "hinge", change: { key: "pattern", value: "wave" } }, auth(t.access_token)));
    expect(locked.status).toBe(403);
    expect((await locked.json()).svg).toBeUndefined();

    await adminClient().from("profiles").update({ plan: "pro", plan_status: "active", current_period_end: new Date(Date.now() + 864e5).toISOString() }).eq("id", user.id);
    const open = await generatePOST(post("/api/desktop/generate", { product: "hinge", change: { key: "pattern", value: "wave" } }, auth(t.access_token)));
    expect(open.status).toBe(200);
    expect(open.headers.get("x-hingelab-plan")).toBe("pro");
    expect((await open.json()).svg).not.toContain("Made with HingeLab");

    // A lapsed period (webhook missed) does not keep Pro.
    await adminClient().from("profiles").update({ current_period_end: new Date(Date.now() - 10 * 864e5).toISOString() }).eq("id", user.id);
    const lapsed = await meGET(get("/api/desktop/me", auth(t.access_token)));
    expect((await lapsed.json()).plan).toBe("free");
    await adminClient().from("profiles").update({ plan: "free", plan_status: null, current_period_end: null }).eq("id", user.id);
  });

  it("lets only a signed-in app use the AI designer, with a description or a photo", async () => {
    expect((await aiPOST(post("/api/desktop/ai", { prompt: "a round box" }))).status).toBe(401);
    const t = await signIn(user.id);
    const had = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = had || "test-only";
    try {
      const empty = await aiPOST(post("/api/desktop/ai", { prompt: "  " }, auth(t.access_token)));
      expect(empty.status).toBe(400);
      expect(await empty.json()).toEqual({ error: "invalid", message: "Describe the product or add a photo of it." });
      const svg = await aiPOST(post("/api/desktop/ai", { image: "data:image/svg+xml;base64,PHN2Zz4=" }, auth(t.access_token)));
      expect(svg.status).toBe(400);
    } finally {
      if (had === undefined) delete process.env.AI_GATEWAY_API_KEY;
    }
  });

  it("rotates refresh tokens and revokes the session when an old one is reused", async () => {
    const t = await signIn(user.id);
    const r1 = await tokenPOST(post("/api/desktop/token", { grant_type: "refresh_token", refresh_token: t.refresh_token }));
    expect(r1.status).toBe(200);
    const t2 = await r1.json();
    expect(t2.refresh_token).not.toBe(t.refresh_token);
    // The old access token died with the rotation.
    expect((await meGET(get("/api/desktop/me", auth(t.access_token)))).status).toBe(401);
    expect((await meGET(get("/api/desktop/me", auth(t2.access_token)))).status).toBe(200);
    // Replaying the first refresh token (stolen copy) kills the whole session.
    const replay = await tokenPOST(post("/api/desktop/token", { grant_type: "refresh_token", refresh_token: t.refresh_token }));
    expect(replay.status).toBe(400);
    expect((await meGET(get("/api/desktop/me", auth(t2.access_token)))).status).toBe(401);
    const after = await tokenPOST(post("/api/desktop/token", { grant_type: "refresh_token", refresh_token: t2.refresh_token }));
    expect(after.status).toBe(400);
  });

  it("signs the app's website view in once, to a same-site page", async () => {
    const t = await signIn(user.id);
    expect((await webSessionPOST(post("/api/desktop/web-session", { next: "/home" }))).status).toBe(401);
    const res = await webSessionPOST(post("/api/desktop/web-session", { next: "/app/editor/local?p=letters" }, auth(t.access_token)));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { path } = (await res.json()) as { path: string };
    const link = new URL(path, BASE);
    expect(link.pathname).toBe("/auth/callback");
    expect(link.searchParams.get("next")).toBe("/app/editor/local?p=letters");
    const hash = link.searchParams.get("token_hash")!;
    const type = link.searchParams.get("type") as "email";
    const web = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const first = await web.auth.verifyOtp({ token_hash: hash, type });
    expect(first.error).toBeNull();
    expect(first.data.user?.id).toBe(user.id);
    expect((await web.auth.verifyOtp({ token_hash: hash, type })).error).not.toBeNull();

    for (const next of ["https://evil.test/", "//evil.test", "/api/desktop/me", "/auth/callback?x=1"]) {
      const r = await webSessionPOST(post("/api/desktop/web-session", { next }, auth(t.access_token)));
      expect(new URL(((await r.json()) as { path: string }).path, BASE).searchParams.get("next")).toBe("/home");
    }
  });

  it("signs out on the server", async () => {
    const t = await signIn(user.id);
    const out = await logoutPOST(post("/api/desktop/logout", { refresh_token: t.refresh_token }, auth(t.access_token)));
    expect(out.status).toBe(204);
    expect((await meGET(get("/api/desktop/me", auth(t.access_token)))).status).toBe(401);
    expect((await tokenPOST(post("/api/desktop/token", { grant_type: "refresh_token", refresh_token: t.refresh_token }))).status).toBe(400);
  });

  it("asks old apps to update and refuses other callers", async () => {
    const t = await signIn(user.id);
    process.env.DESKTOP_MIN_VERSION = "1.2.0";
    try {
      const old = await meGET(get("/api/desktop/me", { ...auth(t.access_token), "x-hingelab-client": "desktop/1.1.9" }));
      expect(old.status).toBe(426);
      expect(await old.json()).toMatchObject({ error: "update_required", minimumVersion: "1.2.0" });
      expect((await meGET(get("/api/desktop/me", { ...auth(t.access_token), "x-hingelab-client": "desktop/1.2.0" }))).status).toBe(200);
    } finally {
      delete process.env.DESKTOP_MIN_VERSION;
    }
    expect((await meGET(new Request(BASE + "/api/desktop/me", { headers: auth(t.access_token) }))).status).toBe(400);
  });

  it("answers the updater with 204 when there is nothing newer, 400 for junk", async () => {
    const params = (v: string) => ({ params: Promise.resolve({ target: "windows", arch: "x86_64", version: v }) });
    const latest = (stableManifest as { latest: { version: string } | null }).latest?.version;
    expect((await updateGET(get("/x"), params(latest ?? "1.0.0"))).status).toBe(204);
    expect((await updateGET(get("/x"), params("999.0.0"))).status).toBe(204);
    if (latest) {
      const offer = await updateGET(get("/x"), params("0.9.0"));
      expect(offer.status).toBe(200);
      expect((await offer.json()).version).toBe(latest);
    }
    expect((await updateGET(get("/x"), params("../../etc"))).status).toBe(400);
  });

  it("keeps the desktop tables away from API roles", async () => {
    const other = await newUser("desktop-anon");
    try {
      const { error } = await other.client.rpc("desktop_session_user" as never, { p_access_hash: "x".repeat(43) } as never);
      expect(error).toBeTruthy();
      const { error: e2 } = await other.client.rpc("desktop_code_create" as never, { p_user: user.id, p_code_hash: "x".repeat(43), p_challenge: "x".repeat(43), p_redirect: REDIRECT, p_ttl_seconds: 60 } as never);
      expect(e2).toBeTruthy();
    } finally {
      await deleteUser(other.id);
    }
  });
});
