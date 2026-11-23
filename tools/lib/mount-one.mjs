#!/usr/bin/env node
/**
 * Worker: mount SATU game dalam satu proses terisolasi.
 * Dipanggil oleh tools/check-mount.mjs.
 *
 * Usage:
 *   node tools/lib/mount-one.mjs --id <game-id> --mode <ai|room-host|room-guest>
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { getArg } from "./args.mjs";
import { makeSandbox, makeHappyBundle, installHappyGlobals } from "./sandbox.mjs";
import { createRoomPair, aiContext } from "./mock-room.mjs";
import { projectRoot } from "./report.mjs";

const originalSetTimeout = globalThis.setTimeout;
const sleep = (ms) => new Promise((resolve) => originalSetTimeout(resolve, ms));

const id = getArg("id");
const mode = getArg("mode", "ai");
const errors = [];
const warnings = [];

if (!id) {
  process.stdout.write(`__MGP_RESULT__${JSON.stringify({ id: "", mode, errors: ["--id wajib diisi"], warnings: [] })}\n__MGP_END__\n`);
  process.exit(1);
}

function formatArg(arg) {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${String(arg.stack || "").split(/\r?\n/).slice(1, 5).join("\n")}`;
  }
  return String(arg);
}
console.error = (...args) => { errors.push(args.map(formatArg).join(" ")); };
console.warn = (...args) => {
  warnings.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "));
};
process.on("unhandledRejection", (reason) => {
  errors.push(`unhandledRejection: ${reason?.message || String(reason)}`);
});
process.on("uncaughtException", (error) => {
  errors.push(`uncaughtException: ${error?.message || String(error)}`);
});

const started = Date.now();
let destroyed = false;
let rendered = false;
let leak = { timers: 0, listeners: [] };

(async () => {
  const file = path.join(projectRoot, "Gaming", `${id}.js`);
  const source = await readFile(file, "utf8");
  const bundle = await makeHappyBundle();
  installHappyGlobals(bundle);
  const { tracker, document, window: happyWindow } = bundle;
  const isMGP = /MGP_REGISTER\s*\(/.test(source) && !/export\s+(async\s+)?function\s+mount\s*\(/.test(source);

  const root = document.createElement("div");
  root.id = `${id}-app`;
  root.className = "mgp-app";
  const pair = mode === "ai" ? null : createRoomPair({ gameId: id, code: "TEST42" });
  const onExit = () => { destroyed = true; };
  const playerName = mode === "room-guest" ? "Guest" : "Host";

  let context;
  if (mode === "ai") {
    context = aiContext(playerName, onExit);
  } else {
    const isHost = mode === "room-host";
    context = {
      mode: "room",
      room: isHost ? pair.host : pair.guest,
      playerName,
      onExit,
    };
  }

  const before = tracker.snapshot();
  let instance = null;
  let hostInstance = null;

  if (isMGP) {
    let meta = null;
    const localSandbox = makeSandbox({
      trackResources: true,
      onRegister: (registered) => { meta = registered; },
    });
    // MGP dijalankan di VM, tapi memakai DOM sungguhan dari happy-dom.
    Object.assign(localSandbox.sandbox, {
      document,
      window: happyWindow,
      navigator: happyWindow.navigator,
      localStorage: happyWindow.localStorage,
      sessionStorage: happyWindow.sessionStorage,
      matchMedia: happyWindow.matchMedia,
      getComputedStyle: happyWindow.getComputedStyle,
      AudioContext: happyWindow.AudioContext,
      Path2D: happyWindow.Path2D,
    });
    const localRoot = document.createElement("div");
    localRoot.id = root.id;
    localRoot.className = root.className;
    vm.runInNewContext(source, localSandbox.sandbox, { filename: `${id}.js`, timeout: 5000 });
    if (!meta || typeof meta !== "object") throw new Error("MGP_REGISTER tidak dipanggil.");
    if (typeof meta.build !== "function") throw new Error("meta.build bukan function.");
    instance = meta.build(localRoot);
    if (!instance || typeof instance !== "object") throw new Error("build() harus mengembalikan objek.");
    instance.open?.();
    rendered = Boolean(localRoot.innerHTML || localRoot.children.length);
    if (typeof instance.close !== "function") warnings.push("build() tidak mengembalikan close().");
  } else {
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    if (typeof mod.mount !== "function") throw new Error("Modul tidak mengekspor mount(root, context).");

    if (mode === "room-guest") {
      // Pasang host lebih dulu supaya guest menerima state nyata hasil
      // publishState() game (bukan state tiruan yang bisa salah format).
      const hostRoot = document.createElement("div");
      hostRoot.className = "mgp-app";
      hostInstance = mod.mount(hostRoot, {
        mode: "room", room: pair.host, playerName: "Host", onExit,
      });
      if (!hostInstance || typeof hostInstance.destroy !== "function") {
        throw new Error("mount() host tidak mengembalikan destroy().");
      }
      await sleep(20);
    }

    instance = mod.mount(root, context);
    if (!instance || typeof instance !== "object") throw new Error("mount() harus mengembalikan objek.");
    if (typeof instance.destroy !== "function") throw new Error("mount() tidak mengembalikan destroy().");
    rendered = Boolean(root.innerHTML || root.children.length);
  }

  await sleep(40);
  if (!rendered) warnings.push("Root tidak terisi setelah mount (innerHTML kosong).");

  if (isMGP) {
    instance.close?.();
  } else {
    instance.destroy();
    hostInstance?.destroy();
  }
  destroyed = true;
  leak = tracker.diff(before, tracker.snapshot());
  if (leak.timers > 0) warnings.push(`${leak.timers} timer masih aktif setelah destroy().`);
  if (leak.listeners.length) warnings.push(`Listener belum dilepas: ${leak.listeners.join(", ")}`);
})().catch((error) => {
  const stack = String(error?.stack || "").split(/\r?\n/).slice(1, 5).join("\n");
  errors.push(`${error?.name || "Error"}: ${error?.message || String(error)}\n${stack}`);
}).finally(() => {
  const payload = {
    id,
    mode,
    errors,
    warnings,
    destroyed,
    rendered,
    leak,
    durationMs: Date.now() - started,
  };
  process.stdout.write(`\n__MGP_RESULT__${JSON.stringify(payload)}\n__MGP_END__\n`);
  // Paksa keluar: beberapa game menyisakan interval yang tidak dibersihkan.
  originalSetTimeout(() => process.exit(errors.length ? 1 : 0), 5);
});
