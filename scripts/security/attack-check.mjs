// Sends the requests an attacker would against a running server and checks each is refused.
// Usage: SHOTS_BASE=http://localhost:3457 node scripts/security/attack-check.mjs [--rate]
const BASE = process.env.SHOTS_BASE || "http://localhost:3457";
const json = { "content-type": "application/json" };
const evilImage = 'data:image/png;base64,AAAA"/><script>alert(document.cookie)</script><x y="';
let failed = 0;

async function expectStatus(name, init, want, path = "/api/export") {
  const r = await fetch(`${BASE}${path}`, { method: "POST", ...init });
  const ok = Array.isArray(want) ? want.includes(r.status) : r.status === want;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}: ${r.status}${ok ? "" : ` (expected ${want})`}`);
  return r;
}

await expectStatus("cross-site POST (Origin: evil)", { headers: { ...json, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ params: {} }) }, 403);
await expectStatus("HTML-form CSRF (text/plain body)", { headers: { "content-type": "text/plain" }, body: JSON.stringify({ params: {} }) }, 415);
await expectStatus("form-urlencoded body", { headers: { "content-type": "application/x-www-form-urlencoded" }, body: "params=1" }, 415);
await expectStatus("JSON array body", { headers: json, body: "[]" }, 400);
await expectStatus("oversized body", { headers: json, body: JSON.stringify({ params: { name: "x".repeat(300_000) } }) }, 413);
await expectStatus("giant Hinge Box", { headers: json, body: JSON.stringify({ params: { W: 1e7, D: 1e7, H: 1e7 } }) }, 400);
await expectStatus("NaN-ish Hinge pitch", { headers: json, body: JSON.stringify({ params: { pitch: 0.00001 } }) }, 400);
await expectStatus("Parametric icosphere detail 20", { headers: json, body: JSON.stringify({ product: "parametric", params: { source: { kind: "library", id: "sphere", detail: 20 } }, what: "zip" }) }, 400);
await expectStatus("Pro puzzle while signed out", { headers: json, body: JSON.stringify({ product: "puzzle", params: { pieces: { auto: true, count: 500 } } }) }, 403);
const r = await expectStatus("puzzle with script in picture (signed out, small)", { headers: json, body: JSON.stringify({ product: "puzzle", params: { engrave: { kind: "image", image: evilImage } } }) }, [200, 403]);
if (r.status === 200) {
  const text = await r.text();
  const clean = !/<script/i.test(text) && /^attachment/.test(r.headers.get("content-disposition") ?? "") && /sandbox/.test(r.headers.get("content-security-policy") ?? "");
  if (!clean) failed++;
  console.log(`${clean ? "✓" : "✗"}   file has no script, is an attachment and sandboxed`);
}
await expectStatus("checkout cross-site", { headers: { ...json, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: "{}" }, 403, "/api/stripe/checkout");
await expectStatus("checkout signed out", { headers: json, body: "{}" }, [401, 503], "/api/stripe/checkout");
await expectStatus("portal form CSRF", { headers: { "content-type": "text/plain" }, body: "{}" }, 415, "/api/stripe/portal");
await expectStatus("webhook without signature", { headers: json, body: JSON.stringify({ type: "customer.subscription.updated" }) }, [400, 503], "/api/stripe/webhook");

if (process.argv.includes("--rate")) {
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
  let first429 = 0;
  for (let i = 1; i <= 45 && !first429; i++) {
    const res = await fetch(`${BASE}/api/export`, { method: "POST", headers: { ...json, "x-forwarded-for": ip }, body: JSON.stringify({ params: {} }) });
    if (res.status === 429) first429 = i;
  }
  const ok = first429 > 0 && first429 <= 41;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} rate limit: first 429 at request ${first429 || "never"}`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll attacks refused.");
process.exit(failed ? 1 : 0);
