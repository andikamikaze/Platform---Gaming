#!/usr/bin/env node
/**
 * Validasi sistem ikon terpusat:
 *  - semua nama ikon dikenal oleh JS/icons.js
 *  - semua 155 cover art persis berasal dari iconSVG(gameIconFor(...))
 *  - placeholder data-icon di HTML/template valid
 *  - tidak ada glyph ikon lama yang tersisa di UI
 *  - tidak ada workaround CSS untuk warna SVG hardcode
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { paths, iconSVG } from "../JS/icons.js";
import { GAME_ICON, gameIconFor, invalidIconNames } from "../JS/game-icons.js";
import { GAMES } from "../JS/games-manifest.js";
import { Report } from "./lib/report.mjs";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(toolsDir);
const read = (file) => readFile(path.join(root, file), "utf8");
const hasIcon = (name) => Object.prototype.hasOwnProperty.call(paths, name);

const report = new Report("Ikon");

function check(id, errors) {
  if (errors.length) report.fail("icons", id, { errors });
  else report.pass("icons", id, { detail: "ok" });
}

{
  const errors = invalidIconNames().map((entry) => `mapping ikon tidak dikenal: ${entry}`);
  check("nama mapping valid", errors);
}

{
  const errors = [];
  for (const game of GAMES) {
    if (!GAME_ICON[game.id]) errors.push(`${game.id}: belum ada mapping GAME_ICON`);
  }
  const extra = Object.keys(GAME_ICON).filter((id) => !GAMES.some((g) => g.id === id));
  for (const id of extra) errors.push(`GAME_ICON punya entri untuk game yang tidak ada: ${id}`);
  check("mapping mencakup semua game", errors);
}

{
  const errors = [];
  for (const game of GAMES) {
    if (game.art !== iconSVG(gameIconFor(game.id, game.category))) {
      errors.push(`${game.id}: art bukan hasil iconSVG dari library`);
    }
  }
  check("cover art dari library", errors);
}

{
  const errors = [];
  for (const game of GAMES) {
    const art = game.art || "";
    for (const required of [
      'viewBox="0 0 24 24"',
      'fill="none"',
      'stroke="currentColor"',
      'stroke-linecap="round"',
      'aria-hidden="true"',
    ]) {
      if (!art.includes(required)) errors.push(`${game.id}: art kehilangan ${required}`);
    }
    if (art.includes("#fff") || art.includes("#ffffff")) {
      errors.push(`${game.id}: art masih pakai warna hardcode`);
    }
  }
  check("atribut SVG seragam", errors);
}

{
  const errors = [];
  for (const file of ["index.html", "community.html"]) {
    const html = await read(file);
    for (const match of html.matchAll(/data-icon="([^"]+)"/g)) {
      if (!hasIcon(match[1])) errors.push(`${file}: data-icon "${match[1]}" tidak dikenal`);
    }
  }
  check("placeholder data-icon valid", errors);
}

{
  const errors = [];
  for (const file of ["index.html", "community.html", "JS/app.js", "JS/community.js", "JS/theme.js"]) {
    const source = await read(file);
    for (const glyph of ["⌂", "▦", "▣", "▤", "▷", "＋", "◈", "◉", "⚙", "☾", "☀", "◐", "⌁", "◎", "⌘", "◷", "ⓘ", "⋯", "♥", "♡", "↗", "▢"]) {
      if (source.includes(glyph)) errors.push(`${file}: glyph ikon lama "${glyph}" masih dipakai`);
    }
  }
  check("tidak ada glyph lama", errors);
}

{
  const errors = [];
  const css = await read("CSS/style.css");
  if (css.includes('svg[stroke="#fff"]') || css.includes('svg[fill="#fff"]')) {
    errors.push("CSS/style.css: workaround warna SVG lama masih ada");
  }
  check("tanpa workaround CSS", errors);
}

console.log(`Ikon: ${Object.keys(paths).length} path · ${Object.keys(GAME_ICON).length} mapping game · ${GAMES.length} cover art`);
report.print();
const written = await report.write();
console.log(`Laporan: ${path.relative(root, written.jsonPath)}`);
process.exitCode = report.ok ? 0 : 1;
