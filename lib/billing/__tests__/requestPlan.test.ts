import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/export/route";

const exportReq = (headers: Record<string, string>) =>
  new Request("https://hingelab.vercel.app/api/export", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ product: "hinge", params: {} }) });

describe("export with the Windows app's token", () => {
  it("passes the desktop version gate before anything else", async () => {
    const res = await POST(exportReq({ authorization: "Bearer abc" }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_client");
  });

  it("asks old app versions to update", async () => {
    const res = await POST(exportReq({ authorization: "Bearer abc", "x-hingelab-client": "desktop/0.0.1" }) as never);
    expect(res.status).toBe(426);
  });
});
