#!/usr/bin/env node
/**
 * Targeted interactive bot check.
 * Launches a few representative games in "ai" mode and drives real input
 * (clicks / arrow keys) through the original dashboard hook. No game logic
 * or backend code is modified; failures are reported with a screenshot.
 *
 * Usage:
 *   node tools/check-bot-play.mjs
 *   node tools/check-bot-play.mjs --games=tic-tac-toe,snake --moves=6
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { projectRoot, reportsDir } from "./lib/report.mjs";
import { startStaticServer } from "./lib/static-server.mjs";
import { getArg } from "./lib/args.mjs";

const games = getArg("games", "tic-tac-toe,connect-four,chess,checkers,snake,rock-paper-scissors")
  .split(",").map((value) => value.trim()).filter(Boolean);
const moveCount = Math.max(1, Number(getArg("moves", "5")) || 5);
const shotDir = path.join(reportsDir, "screenshots", "bot-play");
await mkdir(shotDir, { recursive: true });

const server = await startStaticServer(projectRoot);
const browser = await launchBrowser();
const results = [];

const CANDIDATES = [
  "#gameHost [data-cell]",
  "#gameHost [data-col]",
  "#gameHost [role=gridcell]",
  "#gameHost .cell",
  "#gameHost .square",
  "#gameHost .tile",
  "#gameHost button",
];

function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) | 0;
  return value;
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("gamespace_player_name", "Bot Tester");
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();

  for (const id of games) {
    const errors = [];
    const warnings = [];
    page.removeAllListeners("pageerror");
    page.removeAllListeners("console");
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // External fonts are deliberately aborted by the route above.
      if (/Failed to load resource/.test(text)) return;
      errors.push(`console.error: ${text}`);
    });

    const started = Date.now();
    let clicks = 0;
    let keys = 0;
    let beforeHash = 0;
    let afterHash = 0;
    let shot = "";

    try {
      await page.goto(`${server.origin}/?test=1#library`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true, { timeout: 15000 });
      await page.evaluate(async (gameId) => {
        await globalThis.__MGP_TEST__.launchGame(gameId, "ai");
      }, id);
      await page.waitForSelector("#gameHost .mgp-app", { timeout: 10000 });
      await page.waitForTimeout(250);

      const beforeLength = await page.evaluate(() => document.querySelector("#gameHost")?.innerHTML.length || 0);
      beforeHash = hash(String(beforeLength));

      let used = "";
      // Some games show a start overlay before the actual board.
      const startButtons = page.locator("#gameHost button").filter({ hasText: /^(start|play|mulai|begin|new game)/i });
      const startCount = await startButtons.count();
      for (let i = 0; i < Math.min(2, startCount); i += 1) {
        try {
          await startButtons.nth(i).click({ timeout: 1200 });
          clicks += 1;
          used = "start button";
          await page.waitForTimeout(200);
        } catch (_) { /* try the next start button */ }
      }

      for (const selector of CANDIDATES) {
        const count = await page.locator(selector).count();
        if (count < 2) continue;
        used = selector;
        for (let i = 0; i < Math.min(moveCount, count); i += 1) {
          try {
            const target = page.locator(selector).nth(i);
            if (!(await target.isVisible())) continue;
            await target.click({ timeout: 1200, force: true });
            clicks += 1;
            await page.waitForTimeout(120);
          } catch (_) {
            /* A moving/animated target may be unavailable; try the next one. */
          }
        }
        break;
      }

      const hasCanvas = await page.locator("#gameHost canvas").count() > 0;
      if (!clicks || hasCanvas) {
        for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Space", "Enter"]) {
          try {
            await page.keyboard.press(key);
            keys += 1;
            await page.waitForTimeout(80);
          } catch (_) { /* ignore */ }
        }
      }

      await page.waitForTimeout(350);
      const afterLength = await page.evaluate(() => document.querySelector("#gameHost")?.innerHTML.length || 0);
      afterHash = hash(String(afterLength));
      if (afterHash === beforeHash && !hasCanvas && !clicks) {
        warnings.push(`Tidak ada interaksi atau perubahan DOM teramati (${used || "keyboard only"})`);
      }

      shot = path.relative(projectRoot, path.join(shotDir, `${id}.png`)).replace(/\\/g, "/");
      await page.screenshot({ path: path.join(shotDir, `${id}.png`), fullPage: false }).catch(() => {});

      const stillOpen = await page.evaluate(() => document.querySelector("#gameDialog")?.hidden === false);
      if (!stillOpen) errors.push("Game dialog tertutup sendiri saat bermain vs AI");

      await page.evaluate(async () => { await globalThis.__MGP_TEST__.closeGame(); });
      await page.waitForTimeout(80);
      const closed = await page.evaluate(() => document.querySelector("#gameDialog")?.hidden === true);
      if (!closed) errors.push("closeGame() gagal menutup dialog");
    } catch (error) {
      errors.push(`launch/play: ${error.message}`);
    }

    results.push({
      id,
      status: errors.length ? "fail" : warnings.length ? "warn" : "pass",
      clicks, keys, beforeHash, afterHash, shot,
      durationMs: Date.now() - started,
      errors, warnings,
    });
  }
  await context.close();
} finally {
  await browser.close();
  await server.close();
}

const lines = [
  "# Interactive bot play check",
  "",
  ...results.map((r) => `- ${r.id}: **${r.status.toUpperCase()}** · ${r.clicks} klik · ${r.keys} tombol · ${r.durationMs}ms`),
  "",
  "## Errors / warnings",
  "",
];
for (const r of results) {
  for (const message of [...r.errors.map((m) => `ERROR ${r.id}: ${m}`), ...r.warnings.map((m) => `WARN ${r.id}: ${m}`)]) {
    lines.push(`- ${message}`);
  }
}
if (!results.some((r) => r.errors.length || r.warnings.length)) lines.push("_Tidak ada._");
lines.push("");

await writeFile(path.join(reportsDir, "bot-play-report.md"), lines.join("\n"), "utf8");
await writeFile(path.join(reportsDir, "bot-play-report.json"), JSON.stringify(results, null, 2), "utf8");
console.log(`Bot play: ${results.length} game · ${results.filter((r) => r.status === "pass").length} lulus`);
for (const r of results) {
  if (r.status !== "pass") console.log(`  ${r.status.toUpperCase()} ${r.id}: ${[...r.errors, ...r.warnings].join(" | ")}`);
}
console.log("Laporan: reports/bot-play-report.md");
process.exitCode = results.some((r) => r.status === "fail") ? 1 : 0;
