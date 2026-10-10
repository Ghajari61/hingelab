import { afterAll, describe, expect, it } from "vitest";
import { adminClient, deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";
import { createProject, getProject } from "@/lib/projects/repo";
import { MODELS_BUCKET, copyModelFile, deleteProjectFiles, downloadModelFile, uploadModelFile } from "../files";

const up = await localSupabaseUp();

describe.skipIf(!up)("Parametric cloud projects and their files (local Supabase)", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await deleteUser(id); });

  const pro = async (tag: string) => {
    const u = await newUser(tag);
    created.push(u.id);
    await adminClient().from("profiles").update({ plan: "pro", plan_status: "active" }).eq("id", u.id);
    return u;
  };

  it("Pro saves a parametric project with params and keeps its model file in a private folder", async () => {
    const a = await pro("pm-a");
    const params = { name: "Head", method: "radial", source: { kind: "mesh", fileName: "head.stl", units: "mm", upAxis: "Y" } };
    const row = await createProject(a.client, "parametric", params);
    expect(row.product).toBe("parametric");
    const bytes = new TextEncoder().encode("solid head\nendsolid head\n").buffer as ArrayBuffer;
    const path = await uploadModelFile(a.client, a.id, row.id, "head.stl", bytes);
    expect(path.startsWith(`${a.id}/${row.id}/`)).toBe(true);
    expect(new TextDecoder().decode(await downloadModelFile(a.client, path))).toBe("solid head\nendsolid head\n");
    expect((await getProject(a.client, row.id))!.params).toMatchObject({ method: "radial", source: { kind: "mesh" } });

    // another user cannot read it, list it or write into that folder
    const b = await pro("pm-b");
    await expect(downloadModelFile(b.client, path)).rejects.toThrow(/could not be loaded/);
    const { data: listed } = await b.client.storage.from(MODELS_BUCKET).list(`${a.id}/${row.id}`);
    expect(listed ?? []).toHaveLength(0);
    await expect(uploadModelFile(b.client, a.id, row.id, "evil.stl", bytes)).rejects.toThrow();

    // Duplicate copies the file into the new project's folder; Delete removes a project's files
    const copy = await copyModelFile(a.client, path, a.id, "00000000-0000-4000-8000-000000000001");
    expect(copy).toMatch(new RegExp(`^${a.id}/00000000-0000-4000-8000-000000000001/[0-9a-f-]{36}-head\\.stl$`));
    expect(await deleteProjectFiles(a.client, a.id, row.id)).toBe(1);
    await expect(downloadModelFile(a.client, path)).rejects.toThrow();
    expect(await deleteProjectFiles(a.client, a.id, "00000000-0000-4000-8000-000000000001")).toBe(1);
  });

  it("Free cannot upload model files, and parametric cloud projects stay Pro", async () => {
    const f = await newUser("pm-free");
    created.push(f.id);
    await expect(createProject(f.client, "parametric")).rejects.toThrow(/Pro feature/);
    await expect(uploadModelFile(f.client, f.id, "00000000-0000-4000-8000-000000000002", "head.stl", new ArrayBuffer(8))).rejects.toThrow(/needs Pro/);
  });
});
