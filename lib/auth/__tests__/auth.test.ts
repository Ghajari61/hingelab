import { describe, expect, it } from "vitest";
import { isProtected, marksGuest, routeDecision, safeNext } from "../routes";
import { checkCredentials, friendlyAuthError, validEmail } from "../validate";

describe("protected routes", () => {
  it("protects /app and its pages except the guest editor and debug pages", () => {
    expect(isProtected("/app")).toBe(true);
    expect(isProtected("/app/editor/0b7c6a7e-1d55-4b39-9a3f-0d2c2a1e3c11")).toBe(true);
    expect(isProtected("/app/billing")).toBe(true);
    expect(isProtected("/app/editor/local")).toBe(false);
    expect(isProtected("/app/letters-debug")).toBe(false);
    expect(isProtected("/app/parametric-debug")).toBe(false);
    expect(isProtected("/")).toBe(false);
    expect(isProtected("/login")).toBe(false);
    expect(isProtected("/apple")).toBe(false);
  });

  it("sends signed-out users to /login and keeps where they were going", () => {
    expect(routeDecision({ path: "/app/billing", search: "?x=1", signedIn: false, configured: true }))
      .toBe("/login?next=%2Fapp%2Fbilling%3Fx%3D1");
    expect(routeDecision({ path: "/app/editor/local", search: "", signedIn: false, configured: true })).toBeNull();
  });

  it("sends signed-in users away from the sign-in pages", () => {
    expect(routeDecision({ path: "/login", search: "", signedIn: true, configured: true })).toBe("/app");
    expect(routeDecision({ path: "/login", search: "?next=%2Fapp%2Fbilling", signedIn: true, configured: true })).toBe("/app/billing");
    expect(routeDecision({ path: "/signup", search: "?next=https://evil.example", signedIn: true, configured: true })).toBe("/app");
    expect(routeDecision({ path: "/app", search: "", signedIn: true, configured: true })).toBeNull();
  });

  it("falls back to the guest editor when accounts are not configured", () => {
    expect(routeDecision({ path: "/app", search: "", signedIn: false, configured: false })).toBe("/app/editor/local");
    expect(routeDecision({ path: "/app/editor/local", search: "", signedIn: false, configured: false })).toBeNull();
    expect(routeDecision({ path: "/login", search: "", signedIn: false, configured: false })).toBeNull();
  });
});

describe("guest choice", () => {
  it("takes a signed-out visitor who chose guest mode from /app to the guest editor", () => {
    expect(routeDecision({ path: "/app", search: "", signedIn: false, configured: true, guest: true })).toBe("/app/editor/local");
    expect(routeDecision({ path: "/app", search: "", signedIn: false, configured: true })).toBe("/login?next=%2Fapp");
  });

  it("only changes /app: account pages still ask for sign-in, signed-in users are unaffected", () => {
    expect(routeDecision({ path: "/app/billing", search: "", signedIn: false, configured: true, guest: true })).toBe("/login?next=%2Fapp%2Fbilling");
    expect(routeDecision({ path: "/projects", search: "", signedIn: false, configured: true, guest: true })).toBe("/login?next=%2Fprojects");
    expect(routeDecision({ path: "/app", search: "", signedIn: true, configured: true, guest: true })).toBeNull();
    expect(routeDecision({ path: "/login", search: "", signedIn: true, configured: true, guest: true })).toBe("/app");
    expect(routeDecision({ path: "/login", search: "", signedIn: false, configured: true, guest: true })).toBeNull();
  });

  it("is recorded by a signed-out, non-prefetch visit to the guest editor", () => {
    const base = { signedIn: false, configured: true, prefetch: false };
    expect(marksGuest({ ...base, path: "/app/editor/local" })).toBe(true);
    expect(marksGuest({ ...base, path: "/app/editor/local", prefetch: true })).toBe(false);
    expect(marksGuest({ ...base, path: "/app/editor/local", signedIn: true })).toBe(false);
    expect(marksGuest({ ...base, path: "/app/editor/local", configured: false })).toBe(false);
    expect(marksGuest({ ...base, path: "/app" })).toBe(false);
    expect(marksGuest({ ...base, path: "/login" })).toBe(false);
    expect(marksGuest({ ...base, path: "/app/editor/localx" })).toBe(false);
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/app/editor/abc")).toBe("/app/editor/abc");
    expect(safeNext(null)).toBe("/app");
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext("javascript:alert(1)")).toBe("/app");
    expect(safeNext("/ok\nSet-Cookie:x")).toBe("/app");
  });
});

describe("credential checks", () => {
  it("validates email and password per form", () => {
    expect(validEmail("sam@example.com")).toBe(true);
    expect(validEmail("sam@example")).toBe(false);
    expect(checkCredentials("login", "sam@example.com", "x")).toEqual({});
    expect(checkCredentials("login", "nope", "")).toEqual({ email: "Enter a valid email address.", password: "Enter your password." });
    expect(checkCredentials("signup", "sam@example.com", "short", "short").password).toMatch(/8 characters/);
    expect(checkCredentials("signup", "sam@example.com", "longenough", "different").confirm).toMatch(/do not match/);
    expect(checkCredentials("update", "", "longenough", "longenough")).toEqual({});
    expect(checkCredentials("reset", "sam@example.com", "")).toEqual({});
  });

  it("rewrites common Supabase errors", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/do not match/);
    expect(friendlyAuthError("Unsupported provider: provider is not enabled")).toMatch(/Google sign-in is not set up/);
    expect(friendlyAuthError("Something else")).toBe("Something else");
  });
});
