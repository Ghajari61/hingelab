import { beforeAll, describe, expect, it } from "vitest";
import { arrangeGenerator } from "@/lib/generators/output";
import { BOXES } from "@/lib/generators/boxes";
import type { BuildReply, BuildRequest } from "@/components/generators/buildProtocol";

const replies: BuildReply[] = [];
let handle: (e: MessageEvent<BuildRequest>) => Promise<void>;

beforeAll(async () => {
  const fake = { postMessage: (m: BuildReply) => replies.push(m), onmessage: null as unknown };
  (globalThis as unknown as { self: unknown }).self = fake;
  await import("@/components/generators/build.worker");
  handle = fake.onmessage as typeof handle;
});

const send = (m: BuildRequest) => handle({ data: m } as MessageEvent<BuildRequest>);

describe("build worker", () => {
  it("arranges a design exactly as the page does", async () => {
    const params = BOXES.merge({ design: "box", box: { lid: "liftoff" } });
    await send({ type: "arrange", id: 1, gen: "boxes", params, fonts: [] });
    const r = replies.pop()!;
    expect(r.type).toBe("arranged");
    if (r.type !== "arranged") return;
    expect(r.id).toBe(1);
    expect(r.arranged).toEqual(structuredClone(arrangeGenerator(BOXES, params, {})));
    expect(Array.isArray(r.jobs)).toBe(true);
  });

  it("drops a request that a newer one overtook", async () => {
    const a = send({ type: "arrange", id: 2, gen: "boxes", params: BOXES.merge({}), fonts: [] });
    const b = send({ type: "arrange", id: 3, gen: "boxes", params: BOXES.merge({ design: "tray" }), fonts: [] });
    await Promise.all([a, b]);
    expect(replies.map((r) => r.id)).toEqual([3]);
  });
});
