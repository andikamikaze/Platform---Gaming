#!/usr/bin/env node
/**
 * Fase 4 — live room test dengan dua browser (host + guest) memakai Firebase
 * proyek asli. Membuat room uji, join, verifikasi sinkronisasi state/action,
 * lalu menghapus room uji dari database.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { Report, projectRoot, reportsDir } from "./lib/report.mjs";
import { startStaticServer } from "./lib/static-server.mjs";
import { getArg } from "./lib/args.mjs";

const gameId = getArg("game", "tic-tac-toe");
const report = new Report("Room check");
const shotsDir = path.join(reportsDir, "screenshots");
await mkdir(shotsDir, { recursive: true });

if (process.env.SKIP_ROOM_TEST === "1") {
  report.skip("room", "live-two-browser", { detail: "SKIP_ROOM_TEST=1" });
  report.print();
  await report.write();
  process.exit(0);
}

let origin = "";
let browser = null;
let serverHandle = null;
let hostPage = null;
let guestPage = null;
let code = "";

const errors = [];
const warnings = [];
const details = [];
let stage = "setup";

function watch(page, label) {
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const url = message.location()?.url || "";
    if (/Failed to load resource/.test(text) && url && !url.startsWith(origin)) return;
    if (/permission_denied/.test(text) && (text.includes("gstatic.com/firebasejs") || url.includes("gstatic.com/firebasejs"))) {
      // Error async dari transaction rerun SDK saat room dibuat/dihapus cepat.
      // Fitur tetap terverifikasi; tetap dilaporkan agar rules produksi dicek.
      warnings.push(`[${stage}] Firebase SDK permission_denied saat transaction rerun — verifikasi rules database di produksi.`);
      return;
    }
    errors.push(`[${stage}] ${label} console.error: ${text}`);
  });
}

async function makePage(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((player) => {
    localStorage.setItem("gamespace_player_name", player);
    localStorage.setItem("gamespace_recent", "[]");
  }, name);
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  watch(page, name);
  await page.goto(`${origin}/?test=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true, { timeout: 20000 });
  return { context, page };
}

async function boardHtml(page) {
  return page.evaluate(() => document.querySelector("#gameHost")?.innerHTML || "");
}

/** Klik sel ttt yang sedang aktif (giliran pemain di halaman ini). */
async function clickPlayableCell(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll("#gameHost [data-cell]")];
    const cell = cells.find((node) => String(node.getAttribute("class") || "").includes("ttt-play"));
    if (!cell) return null;
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return cell.getAttribute("data-cell");
  });
}

async function waitForChange(page, previous, label, timeout = 15000) {
  try {
    await page.waitForFunction(
      ({ prev }) => (document.querySelector("#gameHost")?.innerHTML || "") !== prev,
      { prev: previous },
      { timeout }
    );
    details.push(`${label}: board berubah`);
    return true;
  } catch (_) {
    errors.push(`${label}: board guest/host tidak berubah dalam ${timeout}ms`);
    return false;
  }
}

try {
  serverHandle = await startStaticServer(projectRoot);
  origin = serverHandle.origin;
  browser = await launchBrowser();
} catch (error) {
  console.error("Gagal menyiapkan browser. Pasang Google Chrome atau jalankan: npm run setup:browser");
  console.error(error.message);
  process.exit(1);
}

let hostContext = null;
let guestContext = null;

try {
  const host = await makePage("Host");
  const guest = await makePage("Guest");
  hostContext = host.context;
  guestContext = guest.context;
  hostPage = host.page;
  guestPage = guest.page;

  /* ---------- 1. Host membuat room ---------- */
  stage = "host-create";
  try {
    const created = await hostPage.evaluate(async (id) => {
      try {
        const room = await globalThis.__MGP_TEST__.createRoom(id, "Host");
        await globalThis.__MGP_TEST__.launchGame(id, "room", room);
        return { ok: true, code: room.code };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    }, gameId);
    if (!created.ok) {
      errors.push(`Host gagal membuat room: ${created.error}. Cek koneksi internet, Firebase config, Anonymous auth, dan rules database.`);
      throw new Error("host-room-failed");
    }
    code = created.code || "";
  } catch (error) {
    if (!errors.length) errors.push(`Host gagal membuat room: ${error.message}`);
    throw error;
  }
  try {
    await hostPage.waitForSelector("#gameDialog:not([hidden])", { timeout: 15000 });
  } catch (_) {
    errors.push("Dialog game host tidak terbuka setelah room dibuat.");
    throw new Error("host-dialog-failed");
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) errors.push(`Kode room tidak valid: ${code}`);
  details.push(`room ${code} · game ${gameId}`);

  const hostMeta = await hostPage.locator("#gameDialogMeta").textContent();
  if (!/host/i.test(hostMeta || "")) errors.push(`Meta host salah: ${hostMeta}`);

  /* ---------- 2. Guest join lewat UI ---------- */
  stage = "guest-join";
  await guestPage.evaluate(() => globalThis.__MGP_TEST__.navigate("rooms"));
  await guestPage.locator("#roomsJoinCode").fill(code);
  await guestPage.locator("#roomsJoinSubmit").click();
  try {
    await guestPage.waitForSelector("#gameDialog:not([hidden])", { timeout: 30000 });
  } catch (_) {
    const joinError = await guestPage.locator("#joinError").textContent().catch(() => "");
    errors.push(`Guest gagal join: ${joinError?.trim() || "timeout"}`);
    throw new Error("guest-join-failed");
  }
  const guestMeta = await guestPage.locator("#gameDialogMeta").textContent();
  if (!/guest/i.test(guestMeta || "")) errors.push(`Meta guest salah: ${guestMeta}`);
  await guestPage.waitForSelector("#gameHost .mgp-app", { timeout: 15000 });
  await hostPage.waitForSelector("#gameHost .mgp-app", { timeout: 15000 });
  await guestPage.waitForTimeout(500);

  details.push(`meta host="${hostMeta?.trim()}" guest="${guestMeta?.trim()}"`);

  /* ---------- 3 & 4. Sinkronisasi action dua arah ---------- */
  stage = "sync";
  let actor = hostPage;
  let receiver = guestPage;
  let actorLabel = "host";
  let before = await boardHtml(receiver);
  let cell = await clickPlayableCell(actor);

  if (cell === null) {
    // Giliran X diundi; bisa jadi guest yang jalan duluan.
    actor = guestPage;
    receiver = hostPage;
    actorLabel = "guest";
    before = await boardHtml(receiver);
    cell = await clickPlayableCell(actor);
  }
  if (cell === null) {
    errors.push("Tidak ada sel yang bisa diklik di host maupun guest.");
  } else {
    details.push(`action pertama dari ${actorLabel} di sel ${cell}`);
    await waitForChange(receiver, before, `${actorLabel}→other`);

    // Giliran berganti; sekarang lawan yang mengirim action balasan.
    const replyActor = receiver;
    const replyReceiver = actor;
    const beforeReply = await boardHtml(replyReceiver);
    const replyCell = await clickPlayableCell(replyActor);
    if (replyCell === null) errors.push("Tidak ada sel untuk action balasan.");
    else {
      details.push(`action balasan di sel ${replyCell}`);
      await waitForChange(replyReceiver, beforeReply, "balasan");
    }
  }

  /* ---------- 5. Tutup game ---------- */
  stage = "close";
  await guestPage.evaluate(async () => { await globalThis.__MGP_TEST__.closeGame(); });
  await hostPage.evaluate(async () => { await globalThis.__MGP_TEST__.closeGame(); });
  const hostClosed = await hostPage.evaluate(() => document.querySelector("#gameDialog")?.hidden === true);
  const guestClosed = await guestPage.evaluate(() => document.querySelector("#gameDialog")?.hidden === true);
  if (!hostClosed) errors.push("Dialog host tidak tertutup");
  if (!guestClosed) errors.push("Dialog guest tidak tertutup");
} catch (error) {
  if (!errors.length) errors.push(`${error.name}: ${error.message}`);
} finally {
  await guestPage?.screenshot({ path: path.join(shotsDir, "room-guest.png") }).catch(() => {});
  await hostPage?.screenshot({ path: path.join(shotsDir, "room-host.png") }).catch(() => {});

  stage = "cleanup";
  if (code) {
    try {
      const deleted = await hostPage?.evaluate(async (roomCode) => {
        const { firebaseConfig, firebaseSdkVersion } = await import("/JS/firebase-config.js");
        const base = `https://www.gstatic.com/firebasejs/${firebaseSdkVersion}`;
        const appSdk = await import(`${base}/firebase-app.js`);
        const authSdk = await import(`${base}/firebase-auth.js`);
        const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
        const auth = authSdk.getAuth(app);
        const token = await auth.currentUser?.getIdToken();
        if (!token) return false;
        const response = await fetch(
          `${firebaseConfig.databaseURL}rooms/${roomCode}.json?auth=${encodeURIComponent(token)}`,
          { method: "DELETE" }
        );
        return response.ok;
      }, code);
      if (deleted) details.push("room uji dihapus");
      else warnings.push(`Gagal menghapus room uji ${code} — hapus manual di Firebase Console`);
    } catch (error) {
      warnings.push(`Gagal menghapus room uji ${code}: ${error.message}`);
    }
  }

  await guestContext?.close().catch(() => {});
  await hostContext?.close().catch(() => {});
  await browser?.close();
  await serverHandle?.close();
}

report.add({
  phase: "room",
  id: "live-two-browser",
  status: errors.length ? "fail" : warnings.length ? "warn" : "pass",
  errors,
  warnings,
  detail: details.join(" · "),
});
report.print();
const written = await report.write();
console.log(`Laporan: ${path.relative(projectRoot, written.mdPath)}`);
process.exitCode = report.ok ? 0 : 1;
