// Phase 5 (landing page): hero trace, live mini generator, sections, mobile, legal pages, SEO files.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, shot, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };

await withBrowser(async (page) => {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".hero-sheet");
  await page.waitForTimeout(1300);
  await shot(page, "main-5-hero-cutting");
  await page.waitForTimeout(2600);
  await shot(page, "main-5-hero");

  assert((await page.locator("h1").textContent()) === "Laser-ready designs, made in seconds", "hero headline");
  const before = await page.locator(".hero-readout").textContent();
  await page.getByRole("button", { name: "Cylinder" }).click();
  await page.locator(".hero-range input").nth(1).fill("100");
  const after = await page.locator(".hero-readout").textContent();
  assert(before !== after && after.startsWith("Ø98 × 100 mm"), `mini generator updates live (${after})`);
  await page.locator(".hero").screenshot({ path: path.join(OUT, "main-5-hero-cylinder.png") });

  await page.screenshot({ path: path.join(OUT, "main-5-landing-full.png"), fullPage: true });
  console.log("saved docs/screenshots/main-5-landing-full.png");
  assert((await page.locator(".gallery li").count()) === 4, "gallery shows 4 real boxes");
  assert((await page.locator("#pricing tbody tr").count()) >= 5, "pricing table from lib/plans");
  await page.locator("#faq summary").first().click();
  assert(await page.locator("#faq details").first().evaluate((d) => d.open), "FAQ opens");

  const head = await page.evaluate(() => ({
    desc: document.querySelector('meta[name="description"]')?.content,
    og: document.querySelector('meta[property="og:image"]')?.content,
    icon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  }));
  assert(head.desc && head.og && head.icon && head.canonical, `SEO tags present (og:image ${head.og})`);

  const og = await page.request.get(head.og);
  assert(og.ok() && og.headers()["content-type"] === "image/png", "Open Graph image renders");
  fs.writeFileSync(path.join(OUT, "main-5-og-image.png"), await og.body());
  const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
  assert(robots.includes("Disallow: /app/") && robots.includes("Sitemap:"), "robots.txt");
  assert((await page.request.get(`${BASE}/sitemap.xml`)).ok(), "sitemap.xml");

  await page.goto(`${BASE}/terms`);
  await page.waitForSelector(".legal h1");
  await shot(page, "main-5-terms");
});

await withBrowser(async (page) => {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".hero-sheet");
  await page.waitForTimeout(3600);
  await page.screenshot({ path: path.join(OUT, "main-5-landing-mobile.png"), fullPage: true });
  console.log("saved docs/screenshots/main-5-landing-mobile.png");
  const overflow = await page.evaluate(() => document.querySelector(".page").scrollWidth > window.innerWidth + 1);
  assert(!overflow, "no horizontal scroll on a phone");
}, { width: 390, height: 844 });
