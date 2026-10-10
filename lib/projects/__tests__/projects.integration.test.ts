import { afterAll, describe, expect, it } from "vitest";
import { deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";
import { createProject, deleteProject, duplicateProject, getProject, listProjects, renameProject, saveProject } from "../repo";

const up = await localSupabaseUp();

describe.skipIf(!up)("cloud projects (local Supabase)", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await deleteUser(id); });

  it("creates, lists, saves, renames, duplicates and deletes a project", async () => {
    const a = await newUser("projects");
    created.push(a.id);
    const p = await createProject(a.client, "hinge-box");
    expect(p.user_id).toBe(a.id);
    expect(p.name).toBe("Untitled box");
    expect(p.engine_version).toBe(1);

    const before = p.updated_at!;
    await new Promise((r) => setTimeout(r, 20));
    const at = await saveProject(a.client, p.id, "hinge-box", { ...(p.params as object), name: "Gift box", W: 150 }, "<svg/>");
    expect(Date.parse(at)).toBeGreaterThan(Date.parse(before));
    const saved = await getProject(a.client, p.id);
    expect(saved?.name).toBe("Gift box");
    expect((saved?.params as { W: number }).W).toBe(150);

    await renameProject(a.client, p.id, "Tea box");
    const copy = await duplicateProject(a.client, p.id);
    expect(copy.name).toBe("Tea box copy");
    expect((copy.params as { name: string }).name).toBe("Tea box copy");

    const list = await listProjects(a.client);
    expect(list.map((x) => x.id).sort()).toEqual([p.id, copy.id].sort());

    await deleteProject(a.client, copy.id);
    expect((await listProjects(a.client)).map((x) => x.id)).toEqual([p.id]);
  });

  it("keeps each user's projects private", async () => {
    const a = await newUser("owner");
    const b = await newUser("intruder");
    created.push(a.id, b.id);
    const p = await createProject(a.client, "letters");
    expect(await getProject(b.client, p.id)).toBeNull();
    expect(await listProjects(b.client)).toEqual([]);
    await expect(saveProject(b.client, p.id, "letters", { name: "hacked" })).rejects.toThrow();
    await deleteProject(b.client, p.id);
    expect(await getProject(a.client, p.id)).not.toBeNull();
    const forged = await b.client.from("projects").insert({ user_id: a.id, params: {} }).select();
    expect(forged.error).not.toBeNull();
  });
});
