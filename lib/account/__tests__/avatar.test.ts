import { describe, expect, it } from "vitest";
import { avatarBackground, avatarHue, avatarInitials } from "../avatar";

describe("avatar", () => {
  it("takes two initials from the name, else from the email's local part", () => {
    expect(avatarInitials("x@y.com", "Sara Ahmadi")).toBe("SA");
    expect(avatarInitials("x@y.com", "Sara Maria Ahmadi")).toBe("SA");
    expect(avatarInitials("x@y.com", "Cher")).toBe("CH");
    expect(avatarInitials("sara.ahmadi@gmail.com", null)).toBe("SA");
    expect(avatarInitials("ghajari61@gmail.com", "")).toBe("GH");
    expect(avatarInitials("d@x.io")).toBe("D");
    expect(avatarInitials("123@x.io")).toBe("?");
    expect(avatarInitials(undefined, undefined)).toBe("?");
    expect(avatarInitials(null, "علی رضایی")).toBe("عر");
  });

  it("gives each account a stable colour", () => {
    expect(avatarHue("a@b.c")).toBe(avatarHue("A@B.C"));
    expect(avatarHue("a@b.c")).not.toBe(avatarHue("z@b.c"));
    const h = avatarHue("someone@example.com");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(avatarBackground("a@b.c")).toMatch(/^linear-gradient\(135deg, hsl\(\d+ /);
  });
});
