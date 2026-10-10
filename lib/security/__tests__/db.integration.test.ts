import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";
import { createProject } from "@/lib/projects/repo";

const up = await localSupabaseUp();

describe.skipIf(!up)("database hardening (local Supabase)", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await deleteUser(id); });

  it("the shared rate limiter counts per key and only the service role may call it", async () => {
    const admin = adminClient();
    const key = `test:${Date.now()}:${Math.random()}`;
    const hits = [];
    for (let i = 0; i < 4; i++) {
      const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_limit: 3, p_window_seconds: 60 });
      expect(error).toBeNull();
      hits.push(data![0]);
    }
    expect(hits.map((h) => h.allowed)).toEqual([true, true, true, false]);
    expect(hits[3].retry_after).toBeGreaterThan(0);
    expect(hits[3].retry_after).toBeLessThanOrEqual(60);

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("rate_limit_hit", { p_key: key, p_limit: 1000, p_window_seconds: 1 })).error).not.toBeNull();
    const u = await newUser("ratelimit");
    created.push(u.id);
    expect((await u.client.rpc("rate_limit_hit", { p_key: key, p_limit: 1000, p_window_seconds: 1 })).error).not.toBeNull();
  });

  it("parallel inserts cannot pass the Free project limit", async () => {
    const u = await newUser("race");
    created.push(u.id);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => createProject(u.client, "hinge-box")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const { count } = await u.client.from("projects").select("id", { count: "exact", head: true });
    expect(count).toBe(3);
  });

  it("a project cannot be handed to another user or stuffed with megabytes", async () => {
    const a = await newUser("owner-a");
    const b = await newUser("owner-b");
    created.push(a.id, b.id);
    const p = await createProject(a.client, "hinge-box");
    const moved = await a.client.from("projects").update({ user_id: b.id }).eq("id", p.id).select("id");
    expect(moved.error?.message ?? (moved.data?.length === 0 ? "blocked" : "")).toMatch(/owner|blocked|row-level security/);
    const { data: still } = await adminClient().from("projects").select("user_id").eq("id", p.id).single();
    expect(still?.user_id).toBe(a.id);

    const big = { blob: "x".repeat(1_200_000) };
    const huge = await a.client.from("projects").update({ params: big as never }).eq("id", p.id);
    expect(huge.error).not.toBeNull();
  });

  it("users cannot call trigger functions or grant themselves Pro", async () => {
    const u = await newUser("rpc");
    created.push(u.id);
    expect((await u.client.rpc("handle_new_user" as never)).error).not.toBeNull();
    await u.client.from("profiles").update({ plan: "pro" } as never).eq("id", u.id);
    const { data } = await u.client.from("profiles").select("plan").eq("id", u.id).single();
    expect(data?.plan).toBe("free");
  });
});
