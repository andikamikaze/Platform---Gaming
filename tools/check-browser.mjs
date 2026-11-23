#!/usr/bin/env node
/**
 * Fase 3 — browser smoke test.
 *  - fungsi dashboard (search, filter, favorit, navigasi, pengaturan, reset)
 *  - buka & tutup semua game lewat hook __MGP_TEST__ di jalur kode asli
 * Semua error pageerror / console.error / request gagal lokal dikumpulkan.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./lib/browser.mjs";
import { Report, projectRoot, reportsDir } from "./lib/report.mjs";
import { startStaticServer } from "./lib/static-server.mjs";
import { filterIds, matchesFilter, hasFlag } from "./lib/args.mjs";

const report = new Report("Browser check");
const filter = filterIds();
const { GAMES } = await import(`${pathToFileURL(path.join(projectRoot, "JS", "games-manifest.js")).href}?t=${Date.now()}`);
const shotsDir = path.join(reportsDir, "screenshots");
await mkdir(shotsDir, { recursive: true });

let origin = "";
let browser = null;
let serverHandle = null;

try {
  serverHandle = await startStaticServer(projectRoot);
  origin = serverHandle.origin;
  browser = await launchBrowser();
} catch (error) {
  console.error("Gagal menyiapkan browser. Pasang Google Chrome atau jalankan: npm run setup:browser");
  console.error(error.message);
  process.exit(1);
}

function collectDiagnostics(page, errors, warnings) {
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") {
      const location = message.location();
      const url = location?.url || "";
      if (/Failed to load resource/.test(text) && url && !url.startsWith(origin)) {
        // Font eksternal sengaja di-abort oleh route di newPage(); bukan bug.
        return;
      }
      errors.push(`console.error: ${text}`);
    } else if (message.type() === "warning") warnings.push(`console.warn: ${text}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.startsWith(origin)) errors.push(`requestfailed: ${url} — ${request.failure()?.errorText || ""}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.startsWith(origin) && response.status() >= 400) errors.push(`HTTP ${response.status()}: ${url}`);
  });
}

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    // Seed hanya sekali agar tes reset-data benar-benar bisa mengosongkan data.
    if (!sessionStorage.getItem("__mgp_test_seeded")) {
      localStorage.setItem("gamespace_player_name", "Tester");
      sessionStorage.setItem("__mgp_test_seeded", "1");
    }
    localStorage.setItem("gamespace_recent", "[]");
  });
  // Font eksternal tidak relevan untuk smoke test dan memperlambat load.
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  collectDiagnostics(page, errors, warnings);
  await page.goto(`${origin}/?test=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true, { timeout: 15000 });
  return { context, page, errors, warnings };
}

async function dashboardChecks() {
  const { context, page, errors, warnings } = await newPage();
  const shotOnFail = async (name) => {
    if (errors.length) await page.screenshot({ path: path.join(shotsDir, `dashboard-${name}.png`), fullPage: false });
  };

  async function step(name, fn) {
    const before = errors.length;
    let detail = "";
    try {
      detail = (await fn()) || "";
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
    const newErrors = errors.slice(before);
    report.add({
      phase: "dashboard", id: name,
      status: newErrors.length ? "fail" : "pass",
      errors: newErrors, warnings, detail,
    });
    if (newErrors.length) await shotOnFail(name);
    errors.length = before;
  }

  await step("initial-render", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("library"));
    const count = await page.locator("#gameGrid .game-card").count();
    if (count !== GAMES.length) errors.push(`Harusnya ${GAMES.length} kartu, dapat ${count}`);
    const gameCount = await page.locator("#gameCount").textContent();
    if (!/\d/.test(gameCount || "")) errors.push(`#gameCount kosong: ${gameCount}`);
    return `${count} kartu`;
  });

  await step("search", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("library"));
    await page.locator("#gameSearch").fill("snake");
    await page.waitForTimeout(250);
    const count = await page.locator("#gameGrid .game-card").count();
    if (count === 0 || count >= GAMES.length) errors.push(`Filter search tidak bekerja: ${count} kartu`);
    await page.locator("#gameSearch").fill("");
    await page.waitForTimeout(250);
    return `${count} hasil untuk "snake"`;
  });

  await step("category-filter", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("library"));
    await page.locator("#filterList .filter-chip").nth(1).click();
    await page.waitForTimeout(150);
    const count = await page.locator("#gameGrid .game-card").count();
    if (count === 0 || count >= GAMES.length) errors.push(`Filter kategori tidak bekerja: ${count} kartu`);
    await page.locator('#filterList .filter-chip[data-filter="all"]').click();
    return `${count} kartu pada kategori`;
  });

  await step("play-page", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("play"));
    await page.locator("#playSearch").fill("snake");
    await page.waitForTimeout(200);
    const matches = await page.locator("#playGrid .picker-card").count();
    if (matches === 0 || matches >= GAMES.length) errors.push(`Play search tidak bekerja: ${matches} kartu`);
    await page.locator("#playSearch").fill("");
    const recentEmpty = await page.locator("#playRecentEmpty").isVisible();
    if (!recentEmpty) errors.push("Empty state recent tidak tampil saat riwayat kosong");
    return `${matches} hasil untuk "snake"`;
  });

  await step("create-room-dialog", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("rooms"));
    await page.locator('.room-create-section [data-action="create-room"]').click();
    const opened = await page.locator("#launchDialog").isVisible();
    if (!opened) errors.push("Tombol Create room tidak membuka dialog launch");
    const options = await page.locator("#launchGameSelect option").count();
    if (options === 0) errors.push("Dialog launch tidak memiliki pilihan game");
    await page.locator('[data-close="launchDialog"]').click();
    return `${options} game di dialog`;
  });

  await step("progress-page", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("progress"));
    const panels = ["#progressHistoryList", "#progressUsageList", "#progressAchievementsGrid"];
    for (const selector of panels) {
      if (await page.locator(selector).count() === 0) errors.push(`Panel ${selector} tidak ada di Progress`);
    }
    const emptyHistory = await page.locator("#progressHistoryEmpty").isVisible();
    if (!emptyHistory) errors.push("Empty state Play History tidak tampil saat data kosong");
    const achievements = await page.locator("#progressAchievementsGrid .achievement-card").count();
    if (achievements === 0) errors.push("Achievements tidak ter-render di Progress");
    return `${achievements} achievement cards`;
  });

  await step("favorites", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("library"));
    const id = GAMES[0].id;
    await page.locator(`[data-favorite="${id}"]`).first().click();
    await page.waitForTimeout(100);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gamespace_favorites") || "[]"));
    if (!stored.includes(id)) errors.push("Favorit tidak tersimpan di localStorage");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true);
    const pressed = await page.locator(`[data-favorite="${id}"]`).first().getAttribute("aria-pressed");
    if (pressed !== "true") errors.push(`Favorit hilang setelah reload (aria-pressed=${pressed})`);
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("play"));
    const favCards = await page.locator("#playFavoritesGrid .picker-card").count();
    if (favCards === 0) errors.push("Favorites tidak tampil di halaman Play");
    const hasFavorite = await page.locator(`#playFavoritesGrid [data-play="${id}"]`).count();
    if (!hasFavorite) errors.push(`Game ${id} tidak ada di panel Favorites halaman Play`);
    return `${id} · ${favCards} favorites di Play`;
  });

  await step("navigation", async () => {
    const pages = ["library", "play", "rooms", "progress", "settings", "help", "overview"];
    for (const name of pages) {
      await page.evaluate((target) => globalThis.__MGP_TEST__.navigate(target), name);
      const visible = await page.locator(`#page-${name}`).isVisible();
      if (!visible) errors.push(`Halaman ${name} tidak tampil`);
    }
    return `${pages.length} halaman`;
  });

  await step("settings", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("settings"));
    const compact = page.locator("#compactLayoutToggle");
    await compact.check();
    const hasClass = await page.evaluate(() => document.body.classList.contains("compact-ui"));
    if (!hasClass) errors.push("compactLayoutToggle tidak mengubah body class");
    const stored = await page.evaluate(() => localStorage.getItem("gamespace_compact_layout"));
    if (stored !== "true") errors.push(`Preferensi compact tidak tersimpan: ${stored}`);
    await compact.uncheck();
    return "compact + reduce-motion";
  });

  await step("player-name", async () => {
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("settings"));
    await page.locator("#topAvatar").click();
    await page.locator("#playerNameInput").fill("Pemain Uji");
    await page.locator("#saveProfile").click();
    const name = await page.evaluate(() => localStorage.getItem("gamespace_player_name"));
    if (name !== "Pemain Uji") errors.push(`Nama tidak tersimpan: ${name}`);
    return name;
  });

  await step("reset-data", async () => {
    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => globalThis.__MGP_TEST__.navigate("settings"));
    await page.locator("#resetDataButton").click();
    await page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true, { timeout: 15000 });
    const raw = await page.evaluate(() => localStorage.getItem("gamespace_player_name"));
    if (raw !== null) errors.push(`Reset data gagal, nama masih ada: ${raw}`);
    return "localStorage dikosongkan";
  });

  await context.close();
}

async function gameChecks() {
  const games = GAMES.filter((game) => matchesFilter(game.id, filter));
  console.log(`Browser check: ${games.length} game`);
  for (const game of games) {
    const { context, page, errors, warnings } = await newPage();
    const started = Date.now();
    try {
      await page.evaluate(async (id) => {
        await globalThis.__MGP_TEST__.launchGame(id, "ai");
      }, game.id);
      await page.waitForSelector("#gameHost .mgp-app", { timeout: 10000 });
      await page.waitForTimeout(350);
      const state = await page.evaluate(() => ({
        htmlLength: document.querySelector("#gameHost")?.innerHTML.length || 0,
        dialogOpen: document.querySelector("#gameDialog")?.hidden === false,
      }));
      if (!state.dialogOpen) errors.push("Dialog game tidak terbuka");
      if (state.htmlLength < 20) warnings.push(`Konten game pendek (${state.htmlLength} char)`);
      await page.evaluate(async () => { await globalThis.__MGP_TEST__.closeGame(); });
      await page.waitForTimeout(80);
      const closed = await page.evaluate(() => document.querySelector("#gameDialog")?.hidden === true);
      if (!closed) errors.push("Dialog game tidak tertutup setelah closeGame()");
    } catch (error) {
      errors.push(`launch/close: ${error.message}`);
    }
    if (errors.length) {
      await page.screenshot({ path: path.join(shotsDir, `${game.id}.png`), fullPage: false }).catch(() => {});
    }
    report.add({
      phase: "browser", id: game.id,
      status: errors.length ? "fail" : warnings.length ? "warn" : "pass",
      errors, warnings,
      detail: `${game.kind} · ${Date.now() - started}ms`,
      durationMs: Date.now() - started,
    });
    await context.close();
  }
}

try {
  if (!hasFlag("skip-dashboard")) await dashboardChecks();
  await gameChecks();
} finally {
  await browser?.close();
  await serverHandle?.close();
}

report.print();
const written = await report.write();
console.log(`Laporan: ${path.relative(projectRoot, written.mdPath)}`);
process.exitCode = report.ok ? 0 : 1;
