#!/usr/bin/env node
/** Pastikan warna UI terpusat di CSS/tokens.css, bukan di stylesheet komponen. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(path.join(root, p), "utf8");

const [tokens, style, community, index, communityPage] = await Promise.all([
  read("CSS/tokens.css"),
  read("CSS/style.css"),
  read("CSS/community.css"),
  read("index.html"),
  read("community.html"),
]);

const errors = [];

for (const theme of [":root {", ':root[data-theme="dark"] {']) {
  if (!tokens.includes(theme)) errors.push(`tokens.css tidak memiliki blok ${theme}`);
}
for (const name of ["--color-bg", "--color-surface", "--color-text", "--color-border", "--color-primary"]) {
  if (!tokens.includes(name)) errors.push(`Token ${name} tidak ditemukan di tokens.css`);
}

for (const [label, source] of [["index.html", index], ["community.html", communityPage]]) {
  const tokenIndex = source.indexOf("CSS/tokens.css");
  const sheetIndex = source.indexOf(label === "index.html" ? "CSS/style.css" : "CSS/community.css");
  if (tokenIndex === -1 || (sheetIndex !== -1 && tokenIndex > sheetIndex)) {
    errors.push(`${label} harus memuat CSS/tokens.css sebelum stylesheet utama`);
  }
}

const rootBlocks = (source) => source.match(/:root(?:\[data-theme="dark"\])?\s*\{[\s\S]*?\}/g) || [];
const colorDecl = /^\s*--(?:color-|page|bg|surface|ink|muted|line|border|accent|primary|success|warning|danger|green|amber|red|sidebar)\b[\w-]*\s*:/m;
for (const [label, source] of [["CSS/style.css", style], ["CSS/community.css", community]]) {
  for (const block of rootBlocks(source)) {
    if (colorDecl.test(block)) {
      errors.push(`${label} masih mendeklarasikan warna di :root; pindahkan ke tokens.css`);
      break;
    }
  }
}

if (errors.length) {
  console.error("Token check gagal:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("Token check lulus: warna UI terpusat di CSS/tokens.css.");
