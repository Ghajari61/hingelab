// Renders app/icon.svg to a 1024 px PNG for `tauri icon` (desktop/src-tauri/icons).
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const svg = await readFile(new URL("../../app/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="64" height="64"', 'width="1024" height="1024"')}</body></html>`);
await page.locator("svg").screenshot({ path: "desktop/src-tauri/icons/source.png", omitBackground: true });
await browser.close();
console.log("wrote desktop/src-tauri/icons/source.png");
