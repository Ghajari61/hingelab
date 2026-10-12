// The editor's left rail keeps its layout after arriving from the home page without a reload
// (the home page stylesheet stays loaded), and in Studio's onboarding steps.
// Usage: node scripts/shots/rail-after-landing.mjs (dev server on BASE).
import { BASE, withBrowser } from "./lib.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };

for (const [width, height] of [[1920, 1000], [1280, 720], [1024, 620]]) {
  await withBrowser(async (page) => {
    for (const p of ["hinge", "letters", "parametric", "clock"]) {
      await page.goto(`${BASE}/`);
      // Client-side navigation from the home page product cards: the home page CSS stays loaded.
      await page.locator(`a.product[href$="p=${p}"]`).click();
      await page.waitForURL(new RegExp(`p=${p}`));
      await page.waitForSelector(".gallery .gcard");
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const g = document.querySelector(".gallery"), h = g.querySelector(".gallery-head"), s = g.querySelector(".gallery-scroll");
        const r = (e) => e.getBoundingClientRect();
        const card = g.querySelector(".gcard");
        return { landingCss: [...document.styleSheets].some((sh) => { try { return [...sh.cssRules].some((x) => x.cssText.includes(".landing-gallery")); } catch { return false; } }),
          gw: Math.round(r(g).width), headW: Math.round(r(h).width), scrollW: Math.round(r(s).width), headAbove: r(h).bottom <= r(s).top + 1, cardW: Math.round(r(card).width) };
      });
      check(m.headAbove && m.headW >= m.gw - 2 && m.scrollW >= m.gw - 2 && m.cardW >= 50,
        `${width}px ${p}: rail ${m.gw}px, head ${m.headW}px above the cards, cards area ${m.scrollW}px, card ${m.cardW}px${m.landingCss ? " (home page CSS still loaded)" : ""}`);
    }
    await page.screenshot({ path: `docs/screenshots/rail-after-landing-${width}.png` });
  }, { width, height });
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
