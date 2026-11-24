#!/usr/bin/env node
/**
 * Membuat JS/games-manifest.js dari seluruh modul game di folder Gaming/.
 *
 * Cara pakai:
 *   node tools/build-games-manifest.mjs
 *
 * Dua format modul yang dikenali:
 *   1. "mgp" — IIFE yang memanggil global MGP_REGISTER({ id, name, category, catLabel, desc, bg, build })
 *      (field `art` lama masih diterima tetapi diabaikan; cover art berasal dari JS/icons.js)
 *   2. "esm" — ES module yang mengekspor `mount(root, context)` + `export const meta = {...}`
 *
 * Manifest ini di-commit ke repo karena GitHub Pages tidak bisa melakukan
 * directory listing; browser tidak dapat membaca isi folder secara runtime.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { makeSandbox, installGlobals } from "./lib/sandbox.mjs";
import { iconSVG } from "../JS/icons.js";
import { GAME_ICON, gameIconFor } from "../JS/game-icons.js";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolsDir);
const gamesDir = path.join(projectRoot, "Gaming");
const outFile = process.env.GAMES_MANIFEST_OUT
  ? path.resolve(process.env.GAMES_MANIFEST_OUT)
  : path.join(projectRoot, "JS", "games-manifest.js");

/* ---------- ekstraksi metadata ---------- */

function pickMetadata(meta, id, file, kind) {
  const entry = {
    id: typeof meta.id === "string" && meta.id ? meta.id : id,
    name: String(meta.name || "").trim(),
    category: String(meta.category || "").trim(),
    catLabel: String(meta.catLabel || meta.category || "").trim(),
    description: String(meta.desc ?? meta.description ?? "").trim(),
    art: typeof meta.art === "string" ? meta.art : "",
    bg: Array.isArray(meta.bg) ? meta.bg.slice(0, 2).map((color) => String(color)) : [],
    module: `../Gaming/${file}`,
    kind,
  };
  if (!entry.name) throw new Error(`${file}: metadata "name" wajib ada.`);
  if (!entry.category) throw new Error(`${file}: metadata "category" wajib ada.`);
  if (!entry.description) throw new Error(`${file}: metadata "desc" wajib ada.`);
  return entry;
}

async function readClassicModule(file, source, id) {
  let meta = null;
  const { sandbox } = makeSandbox({
    onRegister: (registered) => { meta = registered; },
  });
  try {
    vm.runInNewContext(source, sandbox, { filename: file, timeout: 5000 });
  } catch (error) {
    throw new Error(`${file}: gagal mengeksekusi modul (${error.message}).`);
  }
  if (!meta || typeof meta !== "object") {
    throw new Error(`${file}: MGP_REGISTER tidak pernah dipanggil.`);
  }
  if (typeof meta.build !== "function") {
    throw new Error(`${file}: metadata MGP_REGISTER tidak memiliki build(app).`);
  }
  if (meta.id !== id) {
    throw new Error(`${file}: id registrasi "${meta.id}" berbeda dari nama file "${id}".`);
  }
  return pickMetadata(meta, id, file, "mgp");
}

async function readEsmModule(file, id) {
  installGlobals(makeSandbox()); // modul ESM bisa menyentuh DOM saat top-level evaluation
  const mod = await import(pathToFileURL(path.join(gamesDir, file)).href);
  const meta = mod.meta || mod.META;
  if (!meta || typeof meta !== "object") {
    throw new Error(`${file}: tambahkan "export const META = { name, category, catLabel, desc, bg }".`);
  }
  if (meta.id && meta.id !== id) {
    throw new Error(`${file}: id meta "${meta.id}" berbeda dari nama file "${id}".`);
  }
  const entry = pickMetadata(meta, id, file, "esm");
  entry.id = id;
  if (typeof meta.bestKey === "string" && meta.bestKey) entry.bestKey = meta.bestKey;
  return entry;
}

/* ---------- main ---------- */

const fileNames = (await readdir(gamesDir)).filter((name) => name.endsWith(".js")).sort();
if (!fileNames.length) throw new Error(`Tidak ada file .js di ${gamesDir}.`);

const entries = [];
const warnings = [];

for (const file of fileNames) {
  const id = path.basename(file, ".js");
  const source = await readFile(path.join(gamesDir, file), "utf8");

  let entry;
  if (/MGP_REGISTER\s*\(/.test(source)) {
    entry = await readClassicModule(file, source, id);
  } else if (/export\s+(async\s+)?function\s+mount/.test(source)) {
    entry = await readEsmModule(file, id);
  } else {
    throw new Error(`${file}: bukan modul game yang dikenali (MGP_REGISTER atau mount).`);
  }

  // Cover art diambil dari library ikon pusat; META.art lama tidak dipakai lagi.
  if (!GAME_ICON[id]) warnings.push(`${file}: belum ada mapping GAME_ICON, memakai fallback kategori "${entry.category}".`);
  entry.art = iconSVG(gameIconFor(id, entry.category));

  if (!Array.isArray(entry.bg) || entry.bg.length !== 2 || entry.bg.some((color) => !/^#[0-9a-fA-F]{3,8}$/.test(color))) {
    warnings.push(`${file}: bg tidak valid, kartu akan memakai warna default.`);
    entry.bg = [];
  }
  entries.push(entry);
}

const duplicateIds = entries
  .map((entry) => entry.id)
  .filter((id, index, all) => all.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`ID game duplikat: ${[...new Set(duplicateIds)].join(", ")}`);

entries.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

const generatedAt = new Date().toISOString();
const body = entries.map((entry) => `  ${JSON.stringify(entry)},`).join("\n");
const content = [
  "/* AUTO-GENERATED oleh tools/build-games-manifest.mjs — jangan edit manual. */",
  `/* Sumber: ${entries.length} game di Gaming/ · dibuat ${generatedAt} */`,
  "/* Regenerate setelah menambah/menghapus game: node tools/build-games-manifest.mjs */",
  "",
  "export const GAMES = [",
  body,
  "];",
  "",
].join("\n");

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, content, "utf8");

const categories = [...new Set(entries.map((entry) => entry.catLabel))].sort();
console.log(`✔ ${entries.length} game · ${categories.length} kategori → ${path.relative(projectRoot, outFile)}`);
for (const warning of warnings) console.warn(`⚠ ${warning}`);
