import { afterAll, describe, expect, it } from "vitest";
import { deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";

const up = await localSupabaseUp();

describe.skipIf(!up)("My presets in the account (local Supabase)", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await deleteUser(id); });

  it("a user saves, lists and deletes their own presets; others cannot see or touch them", async () => {
    const a = await newUser("up-a");
    const b = await newUser("up-b");
    created.push(a.id, b.id);

    const { data: row, error } = await a.client.from("user_presets").insert({ product: "hinge-box", name: "Tea box", params: { W: 180 } }).select().single();
    expect(error).toBeNull();
    expect(row!.user_id).toBe(a.id);
    const { data: mine } = await a.client.from("user_presets").select("name, params");
    expect(mine).toEqual([{ name: "Tea box", params: { W: 180 } }]);

    const { data: theirs } = await b.client.from("user_presets").select("id");
    expect(theirs).toEqual([]);
    await b.client.from("user_presets").delete().eq("id", row!.id);
    const { error: forged } = await b.client.from("user_presets").insert({ user_id: a.id, product: "letters", name: "Forged", params: {} });
    expect(forged).not.toBeNull();
    expect((await a.client.from("user_presets").select("id")).data).toHaveLength(1);

    const { error: badProduct } = await a.client.from("user_presets").insert({ product: "clock" as "letters", name: "x", params: {} });
    expect(badProduct).not.toBeNull();
    const { error: badName } = await a.client.from("user_presets").insert({ product: "letters", name: "", params: {} });
    expect(badName).not.toBeNull();

    await a.client.from("user_presets").delete().eq("id", row!.id);
    expect((await a.client.from("user_presets").select("id")).data).toEqual([]);
  });
});
