import { describe, expect, it } from "vitest";
import stable from "@/desktop/releases/stable.json";
import { manifestError, type ReleaseManifest } from "../releases";

const with256 = (sha256: unknown) => {
  const m = structuredClone(stable) as ReleaseManifest;
  (m.latest!.platforms["windows-x86_64"] as unknown as Record<string, unknown>).sha256 = sha256;
  return m;
};

describe("installer SHA-256 in the release manifest", () => {
  it("the published manifest carries a valid hash", () => {
    expect(manifestError(stable)).toBeNull();
    expect(stable.latest?.platforms["windows-x86_64"].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a hash that is not 64 lower-case hex digits; an older manifest without one is fine", () => {
    expect(manifestError(with256("ABC"))).toBe("windows-x86_64.sha256");
    expect(manifestError(with256("1A9F72FCD3D449574F0C4C927BF9111901E8084B160420B29FC31A0D55846654"))).toBe("windows-x86_64.sha256");
    expect(manifestError(with256(undefined))).toBeNull();
  });
});
