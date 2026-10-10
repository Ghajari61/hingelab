import { afterAll, describe, expect, it } from "vitest";
import { deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";

const up = await localSupabaseUp();

describe.skipIf(!up)("profiles (local Supabase)", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await deleteUser(id); });

  it("creates a free profile when a user signs up", async () => {
    const a = await newUser("profile");
    created.push(a.id);
    const { data, error } = await a.client.from("profiles").select("*").eq("id", a.id).single();
    expect(error).toBeNull();
    expect(data?.email).toBe(a.email);
    expect(data?.plan).toBe("free");
  });

  it("hides other users' profiles and does not let a user change their own plan", async () => {
    const a = await newUser("rls-a");
    const b = await newUser("rls-b");
    created.push(a.id, b.id);
    const other = await a.client.from("profiles").select("*").eq("id", b.id);
    expect(other.data).toEqual([]);
    const upgrade = await a.client.from("profiles").update({ plan: "pro" }).eq("id", a.id).select();
    expect(upgrade.data ?? []).toEqual([]);
    const after = await a.client.from("profiles").select("plan").eq("id", a.id).single();
    expect(after.data?.plan).toBe("free");
  });
});
