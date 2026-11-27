/* =============================================================
 * GAME THEME — menyesuaikan stylesheet modul game dengan tema shell.
 *
 * Hampir semua modul di Gaming/ menyisipkan <style> mereka sendiri dengan
 * palet terang (hard-coded). File ini menerjemahkan deklarasi warna tersebut
 * saat mode gelap aktif, tanpa mengubah sumber game satu per satu.
 *
 * Yang tidak disentuh: warna yang digambar langsung ke canvas oleh game
 * (mis. bidang catur, pesawat, partikel) — itu bagian dari seni game.
 * ============================================================= */

const SURFACE = "#171b23";
const SURFACE_ALT = "#222833";
const LINE = "#2b3340";
const INK = "#e8ecf3";
const INK_SOFT = "#cbd5e1";
const MUTED = "#9aa4b5";
const ACCENT_SOFT = "rgba(122, 167, 255, .18)";

const DECLARATION = /(^|[{};])\s*([-\w]+)\s*:\s*([^;{}]+)/g;
const COLOR = /#([0-9a-f]{3,8})\b|rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/gi;

const originals = new WeakMap();
const transformed = new WeakMap();
const observers = new WeakMap();

function hexToRGB(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function luminance({ r, g, b }) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function hueSaturation({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (delta) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / delta + 2) / 6;
    else h = ((rn - gn) / delta + 4) / 6;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function lightenSaturated(color, target) {
  const { h, s } = hueSaturation(color);
  return hslToHex(h, Math.max(s, 0.55), target);
}

function chroma({ r, g, b }) {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

function withAlpha(hex, alpha) {
  if (hex.startsWith("rgba")) return hex.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
  const rgb = hexToRGB(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function format(hex, alpha) {
  return alpha >= 1 ? hex : withAlpha(hex, alpha);
}

function mappedColor(color, kind, alpha) {
  const l = luminance(color);
  const vivid = chroma(color) > 0.25;

  if (kind === "fg") {
    if (vivid && l < 0.65) return format(lightenSaturated(color, 0.66), alpha);
    if (l < 0.18) return format(INK, alpha);
    if (l < 0.38) return format(INK_SOFT, alpha);
    if (l < 0.55) return format(MUTED, alpha);
    return null;
  }

  if (kind === "line") {
    if (l > 0.55) return format(LINE, alpha);
    return null;
  }

  // kind === "bg"
  if (vivid && l > 0.86) return format(ACCENT_SOFT, alpha);
  if (l > 0.88) return format(SURFACE, alpha);
  if (l > 0.7) return format(SURFACE_ALT, alpha);
  if (l > 0.55) return format(LINE, alpha);
  return null;
}

function mapValue(value, kind) {
  return value.replace(COLOR, (match, hex, r, g, b, a) => {
    const color = hex ? hexToRGB(hex) : { r: +r, g: +g, b: +b };
    if (!color) return match;
    const alpha = a === undefined ? 1 : Number(a);
    return mappedColor(color, kind, alpha) || match;
  });
}

function kindOf(property) {
  const prop = property.toLowerCase();
  if (prop.startsWith("--")) {
    if (/bg|surface|panel|card|paper|chip|field|stage|sheet/.test(prop)) return "bg";
    if (/ink|text|txt|tx|mut|muted|sub|dim|fg|label/.test(prop)) return "fg";
    if (/line|ln|border|bd/.test(prop)) return "line";
    return null;
  }
  if (/^(background|background-color|background-image)$/.test(prop)) return "bg";
  if (/^(color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(prop)) return "fg";
  if (/^(border|outline|box-shadow|text-shadow)/.test(prop)) return "line";
  return null;
}

function transformCSS(css) {
  return css.replace(DECLARATION, (match, prefix, property, value) => {
    if (/url\(|data:/i.test(value)) return match;
    const kind = kindOf(property);
    if (!kind) return match;
    const next = mapValue(value, kind);
    return next === value ? match : `${prefix}${property}: ${next}`;
  });
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Terjemahkan semua <style> di dalam root game sesuai tema aktif. */
export function applyGameTheme(root, theme = currentTheme()) {
  if (!root) return;
  for (const style of root.querySelectorAll("style")) {
    if (!originals.has(style)) originals.set(style, style.textContent);
    const source = originals.get(style);
    const next = theme === "dark" ? transformCSS(source) : source;
    if (transformed.get(style) === next && style.textContent === next) continue;
    transformed.set(style, next);
    style.textContent = next;
  }
}

/** Pasang observer agar <style> yang disuntikkan belakangan ikut diterjemahkan. */
export function watchGameTheme(root, theme = currentTheme()) {
  if (!root || observers.has(root)) return () => {};
  let busy = false;
  const observer = new MutationObserver(() => {
    if (busy) return;
    busy = true;
    observer.disconnect();
    applyGameTheme(root, currentTheme());
    observer.observe(root, { childList: true, subtree: true });
    busy = false;
  });
  observer.observe(root, { childList: true, subtree: true });
  observers.set(root, observer);
  applyGameTheme(root, theme);
  return () => {
    observer.disconnect();
    observers.delete(root);
  };
}

/** Kembalikan stylesheet game ke sumber aslinya (dipakai saat game ditutup). */
export function restoreGameTheme(root) {
  if (!root) return;
  observers.get(root)?.disconnect();
  observers.delete(root);
  for (const style of root.querySelectorAll("style")) {
    if (!originals.has(style)) continue;
    style.textContent = originals.get(style);
    transformed.delete(style);
  }
}
