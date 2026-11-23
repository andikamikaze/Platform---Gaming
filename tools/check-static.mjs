#!/usr/bin/env node
/**
 * Fase 1 — static check.
 *  - syntax check semua file JS
 *  - integritas JS/games-manifest.js (entri vs file, metadata, duplikat)
 *  - manifest freshness (regenerate ke temp, bandingkan tanpa timestamp)
 */
import { readdir, readFile, mkdir, mkdtemp, copyFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Report, projectRoot } from "./lib/report.mjs";
import { filterIds, matchesFilter } from "./lib/args.mjs";

const gamesDir = path.join(projectRoot, "Gaming");
const jsDir = path.join(projectRoot, "JS");
const toolsDir = path.join(projectRoot, "tools");
const manifestPath = path.join(jsDir, "games-manifest.js");

const report = new Report("Static check");
const filter = filterIds();
const tempRoot = await mkdtemp(path.join(tmpdir(), "mgp-static-"));

function kindOf(source) {
  if (/MGP_REGISTER\s*\(/.test(source)) return "mgp";
  if (/export\s+(async\s+)?function\s+mount\s*\(/.test(source)) return "esm";
  return "unknown";
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) files.push(full);
  }
  return files;
}

/* ---------- 1. Syntax check ---------- */
const allJs = [
  ...await walk(gamesDir),
  ...await walk(jsDir),
  ...await walk(toolsDir),
].sort();

for (const file of allJs) {
  const source = await readFile(file, "utf8");
  const relative = path.relative(projectRoot, file).replace(/\\/g, "/");
  const id = path.basename(file, path.extname(file));
  if (!matchesFilter(id, filter) && !matchesFilter(relative, filter)) continue;

  const isGame = file.startsWith(gamesDir + path.sep);
  const kind = isGame ? kindOf(source) : "esm";
  const ext = kind === "mgp" ? ".cjs" : ".mjs";
  const tempFile = path.join(tempRoot, `${Buffer.from(relative).toString("base64url")}${ext}`);
  await copyFile(file, tempFile);
  const result = spawnSync(process.execPath, ["--check", tempFile], { encoding: "utf8" });
  if (result.status === 0) {
    report.pass("syntax", relative, { detail: kind });
  } else {
    const message = (result.stderr || result.stdout || "node --check gagal")
      .split(/\r?\n/).filter(Boolean).slice(-3).join(" | ");
    report.fail("syntax", relative, { errors: [message] });
  }
}

/* ---------- 2. Manifest integrity ---------- */
const manifestSource = await readFile(manifestPath, "utf8");
const { GAMES } = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
const gameFiles = (await readdir(gamesDir)).filter((name) => name.endsWith(".js")).sort();
const byId = new Map(GAMES.map((game) => [game.id, game]));
const ids = GAMES.map((game) => game.id);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

if (duplicates.length) {
  report.fail("manifest", "duplicate-ids", { errors: [`ID duplikat: ${duplicates.join(", ")}`] });
} else {
  report.pass("manifest", "duplicate-ids");
}

const missingEntries = gameFiles.filter((file) => !byId.has(path.basename(file, ".js")));
const staleEntries = GAMES.filter((game) => !gameFiles.includes(`${game.id}.js`));
report.add({
  phase: "manifest", id: "file-coverage",
  status: missingEntries.length || staleEntries.length ? "fail" : "pass",
  errors: [
    ...missingEntries.map((file) => `Tidak ada entri manifest untuk ${file}`),
    ...staleEntries.map((game) => `Entri manifest "${game.id}" tidak punya file di Gaming/`),
  ],
  detail: `${gameFiles.length} file vs ${GAMES.length} entri`,
});

for (const file of gameFiles) {
  const id = path.basename(file, ".js");
  if (!matchesFilter(id, filter)) continue;
  const errors = [];
  const warnings = [];
  const source = await readFile(path.join(gamesDir, file), "utf8");
  const kind = kindOf(source);
  const entry = byId.get(id);

  if (kind === "unknown") errors.push("Bukan modul MGP_REGISTER maupun ESM mount()");
  if (!entry) {
    errors.push("Tidak ada di games-manifest.js");
  } else {
    if (entry.id !== id) errors.push(`id manifest "${entry.id}" != "${id}"`);
    if (entry.kind !== kind) errors.push(`kind manifest "${entry.kind}" != "${kind}"`);
    if (!entry.name) errors.push("name kosong");
    if (!entry.category) errors.push("category kosong");
    if (!entry.catLabel) errors.push("catLabel kosong");
    if (!entry.description) errors.push("description kosong");
    if (!entry.module) errors.push("module kosong");
    else {
      const modulePath = path.resolve(path.dirname(manifestPath), entry.module);
      try { await readFile(modulePath); } catch { errors.push(`File module tidak ada: ${entry.module}`); }
    }
    if (!Array.isArray(entry.bg) || entry.bg.length !== 2) warnings.push("bg tidak valid");
    if (!entry.art) warnings.push("art kosong (pakai inisial)");
  }

  if (kind === "mgp") {
    if (!/build\s*[:(]/.test(source)) errors.push("MGP_REGISTER tidak memiliki build(app)");
    const registeredId = source.match(/MGP_REGISTER\s*\(\s*\{[^}]*?\bid\s*:\s*["'`]([^"'`]+)["'`]/s);
    if (registeredId && registeredId[1] !== id) errors.push(`id registrasi "${registeredId[1]}" != "${id}"`);
  } else if (kind === "esm") {
    if (!/export\s+(const|let|var)\s+(META|meta)\s*=/.test(source)) {
      errors.push('Tidak ada "export const META = {...}"');
    }
    const metaId = source.match(/export\s+(?:const|let|var)\s+(?:META|meta)\s*=\s*\{[^}]*?\bid\s*:\s*["'`]([^"'`]+)["'`]/s);
    if (metaId && metaId[1] !== id) errors.push(`id META "${metaId[1]}" != "${id}"`);
  }

  report.add({
    phase: "manifest", id,
    status: errors.length ? "fail" : warnings.length ? "warn" : "pass",
    errors, warnings, detail: kind,
  });
}

/* ---------- 3. Manifest freshness ---------- */
const tempManifest = path.join(tempRoot, "games-manifest.generated.js");
const generated = spawnSync(process.execPath, [path.join(toolsDir, "build-games-manifest.mjs")], {
  encoding: "utf8",
  env: { ...process.env, GAMES_MANIFEST_OUT: tempManifest },
  cwd: projectRoot,
});
if (generated.status !== 0) {
  report.fail("manifest", "freshness", {
    errors: [(generated.stderr || generated.stdout || "regenerate gagal").split(/\r?\n/).filter(Boolean).slice(-3).join(" | ")],
  });
} else {
  const normalize = (text) => text.replace(/\/\* Sumber:.*?\*\//, "/* Sumber: <generated> */");
  const actual = normalize(manifestSource);
  const expected = normalize(await readFile(tempManifest, "utf8"));
  report.add({
    phase: "manifest", id: "freshness",
    status: actual === expected ? "pass" : "fail",
    errors: actual === expected ? [] : ["JS/games-manifest.js basi — jalankan: node tools/build-games-manifest.mjs"],
    detail: `${GAMES.length} game`,
  });
}

await rm(tempRoot, { recursive: true, force: true });

report.print();
const written = await report.write();
console.log(`Laporan: ${path.relative(projectRoot, written.mdPath)}`);
process.exitCode = report.ok ? 0 : 1;
