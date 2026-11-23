#!/usr/bin/env node
/**
 * Community check — integrasi dua halaman + data real-time Firebase.
 *
 * Dua browser dengan identitas berbeda:
 *   - nama dari index.html terbawa ke halaman komunitas
 *   - presence, join komunitas, post, like, komentar, dan RSVP tersinkron
 *   - data uji dibersihkan di akhir
 *
 *   npm run check:community
 *   SKIP_COMMUNITY_TEST=1 npm run check:community   # lewati (offline)
 */
import path from "node:path";
import { Report, projectRoot, reportsDir } from "./lib/report.mjs";
import { launchBrowser } from "./lib/browser.mjs";
import { startStaticServer } from "./lib/static-server.mjs";

const report = new Report("Community check");

if (process.env.SKIP_COMMUNITY_TEST === "1" || process.env.SKIP_ROOM_TEST === "1") {
  report.skip("community", "live", { detail: "dilewati (butuh Firebase live)" });
  report.print();
  await report.write();
  process.exit(0);
}

const runId = `cmtest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const communityUrl = "community.html?test=1";
const errors = [];
let serverHandle = null;
let browser = null;

function collectDiagnostics(page, label) {
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    if (/Failed to load resource/.test(text) && url && !url.startsWith(serverHandle.origin)) return;
    errors.push(`${label} console.error: ${text}`);
  });
}

async function openCommunity(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((displayName) => {
    localStorage.setItem("gamespace_player_name", displayName);
  }, name);
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  collectDiagnostics(page, name);
  return { context, page };
}

async function ready(page) {
  await page.waitForFunction(() => globalThis.__COMMUNITY_TEST_READY__ === true, null, { timeout: 60000 });
}

async function step(id, fn) {
  const before = errors.length;
  let detail = "";
  try {
    detail = (await fn()) || "";
  } catch (error) {
    errors.push(`${id}: ${error.message}`);
  }
  const newErrors = errors.slice(before);
  report.add({
    phase: "community", id,
    status: newErrors.length ? "fail" : "pass",
    errors: newErrors, detail,
  });
  errors.length = before;
  console.log(`  ${newErrors.length ? "✖" : "✔"} ${id}${detail ? ` — ${detail}` : ""}`);
}

try {
  serverHandle = await startStaticServer(projectRoot);
  browser = await launchBrowser();
} catch (error) {
  console.error("Gagal menyiapkan browser/server:", error.message);
  process.exit(1);
}

const nameA = `${runId}_A`.slice(0, 20);
const nameB = `${runId}_B`.slice(0, 20);
let a = null;
let b = null;
let title = "";

try {
  await step("onboarding-redirect", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    collectDiagnostics(page, "onboarding");
    await page.goto(`${serverHandle.origin}/community.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.pathname.endsWith("/index.html")
      && new URLSearchParams(location.search).get("next") === "community.html", null, { timeout: 20000 });
    if (!await page.locator("#welcomeDialog").isVisible()) throw new Error("Dialog welcome tidak tampil");
    await context.close();
    return "community.html → index.html?next=community.html";
  });

  await step("identity-link", async () => {
    a = await openCommunity(nameA);
    await a.page.goto(`${serverHandle.origin}/?test=1`, { waitUntil: "domcontentloaded" });
    await a.page.waitForFunction(() => globalThis.__MGP_TEST_READY__ === true, null, { timeout: 20000 });
    const dashboardName = await a.page.locator("#profileName").textContent();
    if (dashboardName?.trim() !== nameA) throw new Error(`Nama dashboard salah: ${dashboardName}`);
    await a.page.locator('a.side-link[href="community.html"]').click();
    await ready(a.page);
    const communityName = await a.page.locator("#profileName").textContent();
    if (communityName?.trim() !== nameA) throw new Error(`Nama tidak terbawa: ${communityName}`);
    return nameA;
  });

  await step("presence", async () => {
    b = await openCommunity(nameB);
    await b.page.goto(`${serverHandle.origin}/${communityUrl}`, { waitUntil: "domcontentloaded" });
    await ready(b.page);
    await a.page.waitForFunction((name) =>
      [...document.querySelectorAll("#onlineList strong")].some((node) => node.textContent.includes(name)),
    nameB, { timeout: 20000 });
    const onlineCount = await a.page.locator("#onlineCount").textContent();
    if (Number(onlineCount) < 2) throw new Error(`Harusnya ≥2 online, dapat ${onlineCount}`);
    return `${onlineCount} pemain online`;
  });

  const communityId = await a.page.locator("[data-join]").first().getAttribute("data-join");
  const uidA = await a.page.evaluate(() => globalThis.__COMMUNITY_TEST__.uid());

  await step("join-community", async () => {
    await a.page.locator(`[data-join="${communityId}"]`).click();
    await a.page.waitForFunction((id) =>
      document.querySelector(`[data-join="${id}"]`)?.textContent.includes("Joined"),
    communityId, { timeout: 15000 });
    await b.page.waitForFunction(({ id, uid }) =>
      Boolean(globalThis.__COMMUNITY_TEST__.state.members[id]?.[uid]),
    { id: communityId, uid: uidA }, { timeout: 20000 });
    return communityId;
  });

  title = `${runId} Hello community`;
  await step("post-sync", async () => {
    await a.page.locator("#createPost").click();
    await a.page.locator("#postTitle").fill(title);
    await a.page.locator("#postBody").fill(`Posted by ${runId} #smoke`);
    await a.page.locator('#postForm button[type="submit"]').click();
    await a.page.waitForFunction((text) =>
      [...document.querySelectorAll("#feedList .feed-item p")].some((node) => node.textContent.includes(text)),
    title, { timeout: 20000 });
    await b.page.waitForFunction((text) =>
      [...document.querySelectorAll("#feedList .feed-item p")].some((node) => node.textContent.includes(text)),
    title, { timeout: 20000 });
    return title;
  });

  await step("like-sync", async () => {
    const postB = b.page.locator("#feedList .feed-item", { hasText: title });
    await postB.locator("[data-like]").click();
    const postA = a.page.locator("#feedList .feed-item", { hasText: title });
    await a.page.waitForFunction((text) => {
      const article = [...document.querySelectorAll("#feedList .feed-item")]
        .find((node) => node.textContent.includes(text));
      return Number(article?.querySelector("[data-like] span")?.textContent || 0) >= 1;
    }, title, { timeout: 20000 });
    return "1 like";
  });

  await step("comment-sync", async () => {
    const comment = `reply ${runId}`;
    const postB = b.page.locator("#feedList .feed-item", { hasText: title });
    await postB.locator("[data-comment]").click();
    await b.page.locator("#commentBody").fill(comment);
    await b.page.locator('#commentForm button[type="submit"]').click();
    await a.page.waitForFunction((text) =>
      [...document.querySelectorAll("#feedList .comment p")].some((node) => node.textContent.includes(text)),
    comment, { timeout: 20000 });
    return comment;
  });

  await step("rsvp-sync", async () => {
    const eventId = await a.page.locator("[data-rsvp]").first().getAttribute("data-rsvp");
    const uidB = await b.page.evaluate(() => globalThis.__COMMUNITY_TEST__.uid());
    await b.page.locator(`[data-rsvp="${eventId}"]`).click();
    await a.page.waitForFunction(({ id, uid }) =>
      Boolean(globalThis.__COMMUNITY_TEST__.state.rsvps[id]?.[uid]),
    { id: eventId, uid: uidB }, { timeout: 20000 });
    return eventId;
  });

  await step("search", async () => {
    await a.page.locator("#globalSearch").fill(runId);
    await a.page.waitForFunction(() => document.querySelectorAll("#feedList .feed-item").length === 1, null, { timeout: 10000 });
    const count = await a.page.locator("#feedList .feed-item").count();
    await a.page.locator("#globalSearch").fill("");
    return `${count} post`;
  });
} catch (error) {
  report.fail("community", "fatal", { errors: [error.message] });
} finally {
  // Bersihkan data uji memakai client aslinya. Setiap user hanya menghapus
  // record yang menjadi miliknya sesuai aturan database.
  try {
    let postId = "";
    const notes = [];
    if (a) {
      const result = await a.page.evaluate(async ({ titleText }) => {
        const hook = globalThis.__COMMUNITY_TEST__;
        const { dbSdk, ref, uid } = hook.state.client;
        const output = [];
        const run = async (label, fn) => {
          try { await fn(); output.push(`${label}:ok`); }
          catch (error) { output.push(`${label}:${error.message}`); }
        };
        const id = Object.entries(hook.state.posts || {}).find(([, post]) => post.title === titleText)?.[0] || "";
        if (id) await run("post", () => dbSdk.remove(ref("posts", id)));
        for (const communityId of Object.keys(hook.state.members || {})) {
          await run(`member:${communityId}`, () => dbSdk.remove(ref("members", communityId, uid)));
        }
        await run("user", () => dbSdk.remove(ref("users", uid)));
        return { id, output };
      }, { titleText: title }).catch((error) => {
        notes.push(`A:${error.message}`);
        return { id: "", output: [] };
      });
      postId = result.id;
      notes.push(...result.output);
    }
    if (b) {
      const result = await b.page.evaluate(async ({ id }) => {
        const hook = globalThis.__COMMUNITY_TEST__;
        const { dbSdk, ref, uid } = hook.state.client;
        const output = [];
        const run = async (label, fn) => {
          try { await fn(); output.push(`${label}:ok`); }
          catch (error) { output.push(`${label}:${error.message} @ ${String(error.stack || "").split("\n").slice(1, 4).join(" | ")}`); }
        };
        if (id) {
          await run("like", () => dbSdk.remove(ref("likes", id, uid)));
          const commentsForPost = hook.state.comments?.[id] || {};
          for (const commentId of Object.keys(commentsForPost)) {
            if (commentsForPost[commentId]?.authorUid === uid) {
              await run("comment", () => dbSdk.remove(ref("comments", id, commentId)));
            }
          }
        }
        for (const eventId of Object.keys(hook.state.rsvps || {})) {
          await run(`rsvp:${eventId}`, () => dbSdk.remove(ref("rsvps", eventId, uid)));
        }
        await run("user", () => dbSdk.remove(ref("users", uid)));
        return output;
      }, { id: postId }).catch((error) => {
        notes.push(`B:${error.message}`);
        return [];
      });
      notes.push(...result);
    }
    const failed = notes.filter((note) => !note.endsWith(":ok"));
    if (failed.length) report.warn("community", "cleanup", { detail: failed.join(" | ") });
  } catch (error) {
    report.warn("community", "cleanup", { detail: `Gagal membersihkan data uji: ${error.message}` });
  }
  if (a) await a.context.close().catch(() => { });
  if (b) await b.context.close().catch(() => { });
  if (browser) await browser.close().catch(() => { });
  if (serverHandle) await serverHandle.close().catch(() => { });
}

report.print();
const written = await report.write();
console.log(`Laporan: ${path.relative(projectRoot, written.mdPath)}`);
process.exitCode = report.ok ? 0 : 1;
