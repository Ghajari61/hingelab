/**
 * The AI designer's example library against the local Supabase stack: only the owner's confirmed
 * account curates, users and visitors reach neither the functions nor the files, and an example
 * goes in, is found for a fitting request, and comes out with its files.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";
import { addExample, deleteExample, exampleFile, examplesFor, isCurator, listExamples } from "../examples";

const up = await localSupabaseUp();
const OWNER = "ghajari61@gmail.com";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="80mm" viewBox="0 0 60 80"><path d="M5 5h50v70h-50z" fill="none" stroke="#FF0000"/><path d="M15 40h30v10h-30z"/></svg>`;
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe.skipIf(!up)("AI example library (local Supabase)", () => {
  let owner: { id: string; created: boolean };
  let other: { id: string; client: Awaited<ReturnType<typeof newUser>>["client"] };

  beforeAll(async () => {
    const admin = adminClient();
    const made = await admin.auth.admin.createUser({ email: OWNER, password: "test-password-123", email_confirm: true });
    if (made.data.user) owner = { id: made.data.user.id, created: true };
    else {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
      owner = { id: data.users.find((u) => u.email === OWNER)!.id, created: false };
    }
    other = await newUser("ai-examples");
  });
  afterAll(async () => {
    if (owner?.created) await deleteUser(owner.id);
    if (other) await deleteUser(other.id);
  });

  it("lets only the owner curate", async () => {
    expect(await isCurator(owner.id)).toBe(true);
    expect(await isCurator(other.id)).toBe(false);
    await expect(addExample(other.id, { title: "x", description: "", tags: "", svg: SVG, photo: null })).rejects.toThrow(/curator/);
  });

  it("keeps the functions and files away from users and visitors", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const c of [anon, other.client]) {
      expect((await c.rpc("ai_examples_list")).error).not.toBeNull();
      expect((await c.rpc("ai_is_curator", { p_user: owner.id })).error).not.toBeNull();
      expect((await c.storage.from("ai-examples").list()).data ?? []).toEqual([]);
    }
  });

  it("stores an example, finds it for a fitting request and removes it with its files", async () => {
    const { id } = await addExample(owner.id, { title: "Cat keychain test", description: "Name engraved in script", tags: "keychain, pet", svg: SVG, photo: PHOTO });
    try {
      const listed = (await listExamples()).find((e) => e.id === id);
      expect(listed).toMatchObject({ title: "Cat keychain test", width: 50, height: 70, hasPhoto: true });
      expect((await exampleFile(id, "render"))?.subarray(1, 4).toString()).toBe("PNG");
      expect((await exampleFile(id, "svg"))?.toString()).toContain('stroke="#FF0000"');
      const parts = await examplesFor("A keychain for my cat Luna");
      expect(JSON.stringify(parts)).toContain("Cat keychain test (50 × 70 mm)");
      expect(JSON.stringify(parts)).toContain("image/jpeg");
      expect(await examplesFor("wedding cake topper")).toBeUndefined();
      const other2 = await deleteExample(other.id, id).catch((e: Error) => e.message);
      expect(other2).toMatch(/curator/);
    } finally {
      expect(await deleteExample(owner.id, id)).toBe(true);
    }
    expect(await exampleFile(id, "render")).toBeNull();
    expect((await listExamples()).some((e) => e.id === id)).toBe(false);
  });
});
