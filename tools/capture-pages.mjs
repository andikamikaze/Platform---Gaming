#!/usr/bin/env node
/**
 * Captures every dashboard page and the community page at multiple viewports.
 * Used as visual regression baseline/verification during the frontend redesign.
 *
 * Usage:
 *   node tools/capture-pages.mjs --label=baseline
 *   node tools/capture-pages.mjs --label=after-batch-2 --pages=overview,library
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { projectRoot, reportsDir } from "./lib/report.mjs";
import { startStaticServer } from "./lib/static-server.mjs";
import { getArg } from "./lib/args.mjs";

const label = getArg("label", "capture").replace(/[^a-z0-9-]/gi, "-");
const pagesArg = getArg("pages", "");
const PAGES = pagesArg
  ? pagesArg.split(",").map((value) => value.trim()).filter(Boolean)
  : [
      "overview", "library", "play", "rooms", "progress",
      "settings", "help",
    ];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const outDir = path.join(reportsDir, "screenshots", label);
await mkdir(outDir, { recursive: true });

const server = await startStaticServer(projectRoot);
const browser = await launchBrowser();
const summary = { label, origin: server.origin, captured: [], errors: [] };

async function newPage(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    localStorage.setItem("gamespace_player_name", "Visual Tester");
    localStorage.setItem("gamespace_recent", '["tic-tac-toe","snake"]');
    localStorage.setItem("gamespace_favorites", '["tic-tac-toe"]');
    localStorage.setItem(
      "gamespace_stats",
      JSON.stringify({
        "tic-tac-toe": { sessions: 4, best: 12, wins: 2, losses: 1, lastPlayed: Date.now() },
        snake: { sessions: 2, best: 48, wins: 0, losses: 2, lastPlayed: Date.now() },
      }),
    );
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => summary.errors.push(`${viewport.name}: pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (/Failed to load resource/.test(text)) return;
      summary.errors.push(`${viewport.name}: console.error: ${text}`);
    }
  });
  return { context, page };
}

try {
  for (const viewport of VIEWPORTS) {
    const { context, page } = await newPage(viewport);
    for (const name of PAGES) {
      await page.goto(`${server.origin}/?test=1#${name}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true, { timeout: 15000 });
      await page.evaluate((target) => globalThis.__MGP_TEST__.navigate(target), name);
      await page.waitForTimeout(120);
      const file = path.join(outDir, `${viewport.name}-${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      summary.captured.push(path.relative(projectRoot, file).replace(/\\/g, "/"));
    }
    await page.goto(`${server.origin}/community.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(200);
    const communityFile = path.join(outDir, `${viewport.name}-community.png`);
    await page.screenshot({ path: communityFile, fullPage: false });
    summary.captured.push(path.relative(projectRoot, communityFile).replace(/\\/g, "/"));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(`Captured ${summary.captured.length} screenshots → reports/screenshots/${label}/`);
if (summary.errors.length) {
  console.log(`Console/page errors: ${summary.errors.length}`);
  for (const error of summary.errors.slice(0, 10)) console.log(`  - ${error}`);
}
