/* ==== js/games/road-crossing.js ==== */

import { iconSVG } from "../JS/icons.js";

/*
  Road Crossing — race bergaya Crossy Road.
  - Format template baru: export META + mount(root, context).
  - Mode "ai": race vs Bot. Mode "room": race vs pemain lain (host authoritative).
  - Level prosedural dijamin bisa diselesaikan (lihat auditLevel).
  - Kamera selalu maju (anti-AFK), cheat overlay, D-pad, keyboard + mouse + swipe.
  Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "road-crossing", // harus sama dengan nama file (tanpa .js)
    name: "Road Crossing",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Race a rival across procedurally generated roads, rivers and rails. The camera never stops — keep hopping!",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 40h36" stroke-dasharray="7 5"/><rect x="16" y="13" width="17" height="16" rx="4" fill="currentColor" stroke="none"/><rect x="20" y="8" width="4" height="5" rx="1.5" fill="currentColor" stroke="none"/><path d="M33 19l6 2-6 2"/><circle cx="28" cy="18" r="1.7" fill="#ffffff" stroke="none"/><path d="M20 29v4m8-4v4"/></svg>',
    bg: ["#d9f99d", "#86efac"],
    bestKey: "roadCrossingBest",
};

/* =============================================================
   PURE CORE — deterministik & bisa dites tanpa DOM
============================================================= */
const COLS = 10, CELL = 40, W = COLS * CELL, VIS = 14, H = VIS * CELL;
const TARGET = 40, LIVES = 3;
const HOP_MS = 150, FAST_HOP_MS = 70, SLIDE_MS = 75, INVULN_MS = 1600;
const COUNTDOWN_MS = 3000, RELEASE_STAGGER = 700;
const CAM_DELAY = 2200, CAM_MIN = 0.30, CAM_MAX = 0.52; // baris per detik
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------- generator level (solvable by construction) ----------
   Aturan yang menjamin level bisa diselesaikan:
   - 3 baris awal & setiap baris ke-7 = rumput aman (rest row).
   - Maksimal 2 sungai / 2 es / 3 jalan beruntun, lalu dipaksa rumput.
   - Rel tidak boleh tepat setelah rel/sungai; sungai tidak setelah rel.
   - Jalan: jarak antar kendaraan >= gapMin (celah selalu cukup).
   - Sungai: jarak antar log <= gapMax & waktu tunggu log <= 2.6 detik.
   - Sungai "pads": selalu ada 3 daun teratai bersebelahan di jalur aman.
   - Pohon/batu: maks 3, tidak pernah 3 bersebelahan, jalur aman selalu
     bebas, dan hanya muncul setelah baris rumput/es (bebas geser).
   - Rel: jendela aman antar kereta >= 2.4 detik + lampu peringatan 1.5 dtk.
------------------------------------------------------------------ */
const levelCache = new Map();
function rowFor(seed, i) {
    if (i < 0) i = 0;
    let lv = levelCache.get(seed);
    if (!lv) {
        if (levelCache.size > 40) levelCache.delete(levelCache.keys().next().value);
        lv = { rows: [], path: [] };
        levelCache.set(seed, lv);
    }
    while (lv.rows.length <= i) lv.rows.push(genRow(seed, lv, lv.rows.length));
    return lv.rows[i];
}

function genRow(seed, lv, i) {
    const r = mulberry((seed ^ ((i * 0x9e3779b9) >>> 0)) >>> 0);
    const s0 = r();
    const path = clamp((i ? lv.path[i - 1] : 4) + (s0 < 0.33 ? -1 : s0 < 0.66 ? 0 : 1), 1, 8);
    lv.path[i] = path;
    const rows = lv.rows, p1 = rows[i - 1];
    const back = (f) => { let n = 0; for (let j = i - 1; j >= 0 && f(rows[j]); j--) n++; return n; };

    if (i < 3 || i % 7 === 6 || i >= TARGET) return { type: "grass", sub: "plain", path };

    const riverS = back((t) => t.type === "river");
    const roadS = back((t) => t.type === "road");
    const iceS = back((t) => t.type === "ice");
    const d = Math.min(1, i / 55);
    let type;
    if (riverS >= 2 || iceS >= 2 || roadS >= 3) type = "grass";
    else {
        const roll = r();
        type = roll < 0.24 ? "grass" : roll < 0.55 ? "road" : roll < 0.76 ? "river" : roll < 0.88 ? "rail" : "ice";
    }
    if (type === "rail" && (p1.type === "rail" || p1.type === "river")) type = "road";
    if (type === "river" && p1.type === "rail") type = "grass";

    if (type === "grass") {
        if (((p1.type === "grass" && p1.sub !== "trees") || p1.type === "ice") && r() < 0.4) {
            const cand = [];
            for (let c = 0; c < COLS; c++) if (Math.abs(c - path) > 1) cand.push(c);
            for (let j = cand.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1));[cand[j], cand[k]] = [cand[k], cand[j]]; }
            let cols = cand.slice(0, 2 + Math.floor(r() * 2)).sort((a, b) => a - b);
            if (cols.length === 3 && cols[1] === cols[0] + 1 && cols[2] === cols[1] + 1) cols = [cols[0], cols[2]];
            return { type: "grass", sub: "trees", cols, path };
        }
        return { type: "grass", sub: "plain", path };
    }
    if (type === "ice") return { type: "ice", sub: "plain", path };

    if (type === "road") {
        const s = r();
        const sub = s < 0.18 + 0.1 * d ? "truck" : s < 0.36 + 0.2 * d ? "highway" : "cars";
        let len, speed, gapMin;
        if (sub === "truck") { len = 88 + Math.floor(r() * 16); speed = 46 + Math.floor(r() * 26); gapMin = 132; }
        else if (sub === "highway") { len = 44; speed = 135 + Math.floor(r() * 45); gapMin = 118; }
        else { len = 46 + Math.floor(r() * 12); speed = 62 + Math.floor(r() * 50) + Math.floor(d * 30); gapMin = 112; }
        const span = W + len + 60;
        const n = clamp(Math.floor(span / (len + gapMin)), 1, 4);
        return { type: "road", sub, dir: r() < 0.5 ? 1 : -1, speed, n, len, off: r() * 600, gapMin, path };
    }
    if (type === "river") {
        const s = r();
        const sub = s < 0.22 ? "pads" : s < 0.40 + 0.1 * d ? "rapids" : "logs";
        if (sub === "pads") {
            const c2 = clamp((path + 5) % COLS, 1, COLS - 2);
            const pads = [...new Set([path - 1, path, path + 1, c2 - 1, c2, c2 + 1])].sort((a, b) => a - b);
            return { type: "river", sub, len: 100, speed: 36, n: 2, dir: r() < 0.5 ? 1 : -1, off: r() * 600, pads, path };
        }
        let len, speed, gapMax;
        if (sub === "rapids") { len = 118 + Math.floor(r() * 36); speed = 72 + Math.floor(r() * 24); gapMax = 78; }
        else { len = 92 + Math.floor(r() * 40); speed = 34 + Math.floor(r() * 26); gapMax = 84; }
        const span = W + len + 60;
        const n = clamp(Math.ceil(span / (len + gapMax)), 2, 4);
        return { type: "river", sub, len, speed, n, dir: r() < 0.5 ? 1 : -1, off: r() * 600, gapMax, path };
    }
    return { type: "rail", sub: "rail", dir: r() < 0.5 ? 1 : -1, period: 5.6 + r() * 2.8, phase: r() * 10, len: 260, speed: 520 + Math.floor(r() * 80), warn: 1.5, path };
}

/* Audit independen: memastikan semua constraint di atas terpenuhi. */
function auditLevel(seed, upto) {
    const issues = [];
    const rows = [];
    for (let i = 0; i < upto; i++) rows.push(rowFor(seed, i));
    for (let i = 0; i < upto; i++) {
        const sp = rows[i], p1 = rows[i - 1];
        if (i >= 3 && i < TARGET && i % 7 === 6 && (sp.type !== "grass" || sp.sub !== "plain")) issues.push(i + ":rest");
        if (sp.type === "rail") {
            if (p1 && (p1.type === "rail" || p1.type === "river")) issues.push(i + ":rail-after");
            if (sp.period - (W + sp.len) / sp.speed - sp.warn < 2.4) issues.push(i + ":rail-window");
        }
        if (sp.type === "river" && p1 && p1.type === "rail") issues.push(i + ":river-after-rail");
        if (sp.type === "road" && (W + sp.len + 60) / sp.n - sp.len < sp.gapMin - 0.5) issues.push(i + ":road-gap");
        if (sp.type === "river" && sp.sub !== "pads") {
            const g = (W + sp.len + 60) / sp.n - sp.len;
            if (g > sp.gapMax + 0.5 || g / sp.speed > 2.6) issues.push(i + ":log-gap");
        }
        if (sp.type === "river" && sp.sub === "pads" && ![sp.path - 1, sp.path, sp.path + 1].every((c) => sp.pads.includes(c))) issues.push(i + ":pads");
        if (sp.type === "grass" && sp.sub === "trees") {
            const cs = sp.cols;
            if (cs.length > 3 || [sp.path - 1, sp.path, sp.path + 1].some((c) => cs.includes(c))) issues.push(i + ":trees");
            if (!p1 || !((p1.type === "grass" && p1.sub !== "trees") || p1.type === "ice")) issues.push(i + ":trees-prev");
        }
    }
    return issues;
}
function pickSeed() {
    for (let t = 0; t < 8; t++) {
        const s = ((Math.random() * 0x7fffffff) >>> 0) || 1;
        if (auditLevel(s, TARGET + VIS).length === 0) return s;
    }
    return 1;
}

/* ---------- fisika item bergerak ---------- */
function itemX(spec, t, k) {
    const span = W + spec.len + 60, gap = span / spec.n;
    let x = spec.off + k * gap + (t / 1000) * spec.speed * spec.dir;
    x = ((x % span) + span) % span;
    return x - spec.len;
}
function carHit(spec, x, t) {
    for (let k = 0; k < spec.n; k++) { const cx = itemX(spec, t, k); if (x > cx - 12 && x < cx + spec.len + 12) return true; }
    return false;
}
function logAt(spec, x, t) {
    for (let k = 0; k < spec.n; k++) { const lx = itemX(spec, t, k); if (x > lx + 7 && x < lx + spec.len - 7) return { x: lx, vx: spec.speed * spec.dir }; }
    return null;
}
function padAt(spec, x) { return (spec.pads || []).some((c) => Math.abs(x - (c * CELL + 20)) <= 15); }
function treeAt(spec, col) { return spec.sub === "trees" && spec.cols.includes(col); }
function trainState(spec, t) {
    const p = spec.period, cyc = (((t / 1000 + spec.phase) % p) + p) % p, cross = (W + spec.len) / spec.speed;
    if (cyc < cross) return { x: spec.dir === 1 ? -spec.len + cyc * spec.speed : W - cyc * spec.speed, warn: false };
    return { x: null, warn: cyc > p - spec.warn };
}
function railHit(spec, x, t) {
    const tr = trainState(spec, t);
    return tr.x != null && x > tr.x - 12 && x < tr.x + spec.len + 12;
}
const colOf = (p) => clamp(Math.round((p.x - 20) / CELL), 0, COLS - 1);

/* Diekspos untuk unit test (opsional, tidak dipakai build manifest). */
export const _test = { COLS, CELL, VIS, TARGET, LIVES, W, rowFor, auditLevel, itemX, carHit, logAt, padAt, treeAt, trainState, railHit };

/* =============================================================
   MOUNT
============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- state lokal (tidak diserialisasi) ---------- */
    let destroyed = false, paused = false, pausedAt = 0, raf = null, lastT = 0, forcePub = false;
    const ui = { help: false, cheats: false };
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("road-crossing-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        ui.help = true;
        try { localStorage.setItem("road-crossing-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }
    const cheats = { god: false, slow: false, freeze: false, fast: false };
    let cheatsUsed = false;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }
    const view = {
        seed: -1, gt: 0, camY: 0, lastPhase: "", staticKey: "",
        disp: [{ x: 140, row: 0, lift: 0 }, { x: 260, row: 0, lift: 0 }],
        anim: [null, null], toast: null, lastPub: 0, botNext: 0, botFwd: 0,
    };
    const padTimers = new Map();
    const offs = [];
    const SLOT_COLOR = ["#f59e0b", "#3b82f6"];
    const SLOT_NAME = ["Chick", "Duck"];
    const god = (a) => !online && cheats.god && a === playerIndex;

    /* ---------- shell (UI minimalis) ---------- */
    root.innerHTML = `
<style>
.rc-app{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--card:#fff;--soft:#f6f8fa;--accent:#16a34a;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);
  display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%;min-height:0}
.rc-app *{box-sizing:border-box}
.rc-app [hidden]{display:none!important}
.rc-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.rc-chip{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-chip small{color:var(--muted);font-weight:600}
.rc-dot{width:9px;height:9px;border-radius:50%;flex:none}
.rc-status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;flex:none}
.rc-chip[data-state="running"] .rc-status-dot{background:#16a34a;animation:rc-pulse 1.2s infinite}
.rc-chip[data-state="finished"] .rc-status-dot{background:#f59e0b}
@keyframes rc-pulse{50%{opacity:.35}}
.rc-heart{width:12px;height:12px;color:#ef4444;flex:none}
.rc-bar{display:inline-block;width:44px;height:5px;border-radius:999px;background:var(--line);overflow:hidden;vertical-align:middle}
.rc-bar i{display:block;height:100%;width:0;border-radius:999px;transition:width .25s}
.rc-badge{font-size:10px;font-weight:700;letter-spacing:.06em;color:#b45309;background:#fef3c7;border-radius:999px;padding:5px 8px}
.rc-spacer{flex:1 1 auto}
.rc-btn{appearance:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:9px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,transform .05s;font-family:inherit}
.rc-btn:hover{background:var(--soft)}
.rc-btn:active{transform:scale(.97)}
.rc-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.rc-btn.primary:hover{background:#1e293b}
.rc-btn[disabled]{opacity:.45;cursor:not-allowed}
.rc-icon-btn{display:inline-flex;align-items:center;gap:6px}
.rc-icon-btn svg{flex:none;display:block}
.rc-btnrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.rc-app.game-fill > .rc-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;width:100%;border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:0 12px 32px rgba(2,6,23,.10);background:#9fd964}
.rc-svg{display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none}
.rc-blink{animation:rc-blink .5s steps(2) infinite}
@keyframes rc-blink{50%{opacity:.2}}
.rc-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;z-index:6;pointer-events:none;white-space:nowrap}
.rc-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.88);backdrop-filter:blur(3px);padding:14px}
.rc-card{display:flex;flex-direction:column;overflow:hidden;max-height:100%;width:min(440px,100%);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 16px 40px rgba(2,6,23,.14);text-align:center}
.rc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.rc-head h3{margin:0;font-size:19px;letter-spacing:-.01em}
.rc-foot{flex:none;display:flex;flex-direction:column;gap:8px;margin-top:14px}
.rc-card p{margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--muted)}
.rc-role{display:inline-block;font-size:11.5px;font-weight:700;background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:4px 10px;margin:0 0 12px}
.rc-bullets,.rc-help,.rc-stats,.rc-cheat-body{flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
.rc-bullets{font-size:12.5px;color:#334155;margin:0 0 14px;padding-left:16px;line-height:1.6}
.rc-help h5{margin:12px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.rc-help ul{margin:0;padding-left:16px;font-size:12.5px;line-height:1.6;color:#334155}
.rc-legend{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;font-size:12px;color:#334155}
.rc-legend svg{width:36px;height:22px;display:block}
.rc-cheat-body{padding-right:2px}
.rc-cheat-row{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:6px 0;cursor:pointer;text-align:left}
.rc-cheat-row input{accent-color:var(--accent);width:15px;height:15px;margin:0}
.rc-cheat-body .rc-btnrow{margin-top:10px}
.rc-note{font-size:10.5px;line-height:1.4;color:var(--muted)}
.rc-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 14px;font-size:12px;color:var(--muted)}
.rc-stats div{background:var(--soft);border-radius:10px;padding:8px}
.rc-stats b{display:block;font-size:16px;color:var(--ink)}
.rc-count{font-size:64px;font-weight:800;letter-spacing:-.03em;line-height:1}
.rc-win{color:#16a34a}.rc-lose{color:#dc2626}
.rc-controls{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.rc-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,46px);gap:5px}
.rc-dbtn{border:1px solid var(--line);background:var(--card);border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#334155;touch-action:none;padding:0}
.rc-dbtn:hover{background:var(--soft)}
.rc-dbtn:active{background:#e2e8f0}
.rc-dbtn svg{width:20px;height:20px}
.rc-side{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.rc-hint{font-size:11px;color:var(--muted)}

/* --- Batch 02 design polish --- */
.rc-app :focus-visible,.rc-app button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rc-chip{padding:6px 11px}
.rc-btn{min-height:44px;padding:10px 16px}
.rc-dbtn{min-width:44px;min-height:44px}
@media (pointer:coarse){.rc-app button:not(:disabled){min-height:44px;min-width:44px}}
@media (prefers-reduced-motion:reduce){.rc-app *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (last: highest specificity) --- */
.rc-app.game-fill > .rc-board{width:100%;max-width:none}
.rc-app .rc-hud{gap:6px}
.rc-app .rc-hud .rc-chip{padding:4px 8px;font-size:10px}
.rc-app .rc-hud .rc-chip .rc-bar{width:32px}
.rc-app .rc-hud .rc-btn{min-height:36px;padding:7px 10px;font-size:11px}
@media (max-width:640px){
.rc-app.game-fill > .rc-board:not(:has(.rc-ov:not([hidden]))){aspect-ratio:400/560;flex:0 0 auto}
.rc-app.game-fill > .rc-board:has(.rc-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.rc-app .rc-hud{gap:5px;margin-bottom:0}
.rc-app .rc-hud .rc-chip{padding:4px 6px;font-size:9px}
.rc-app .rc-hud .rc-chip[data-first-chip]{display:none}
.rc-app .rc-hud .rc-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.rc-app .rc-hud .rc-btn-label,.rc-app .rc-hud .rc-spacer{display:none}
.rc-app .rc-ov{padding:8px}
.rc-app .rc-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.rc-app .rc-bullets,.rc-app .rc-help,.rc-app .rc-stats,.rc-app .rc-cheat-body{scrollbar-width:none}
.rc-app .rc-bullets::-webkit-scrollbar,.rc-app .rc-help::-webkit-scrollbar,.rc-app .rc-stats::-webkit-scrollbar,.rc-app .rc-cheat-body::-webkit-scrollbar{display:none}
.rc-app .rc-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.rc-app .rc-note{display:none}
.rc-app .rc-controls{gap:8px}
}
</style>
<div class="game-app rc-app game-fill" data-rc>
  <div class="rc-hud">
    <span class="rc-chip"><i class="rc-dot" data-dot="0"></i><span data-name="0">You</span><b data-score="0">0</b><small>/${TARGET}</small>
      <svg class="rc-heart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.6 5 6 5c2.2 0 3.7 1.2 6 3.6C14.3 6.2 15.8 5 18 5c3.4 0 5.4 3.6 4 6.7C19.5 16.3 12 21 12 21z"/></svg><b data-lives="0">${LIVES}</b>
      <span class="rc-bar"><i data-bar="0"></i></span></span>
    <span class="rc-chip"><i class="rc-dot" data-dot="1"></i><span data-name="1">Rival</span><b data-score="1">0</b><small>/${TARGET}</small>
      <svg class="rc-heart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.6 5 6 5c2.2 0 3.7 1.2 6 3.6C14.3 6.2 15.8 5 18 5c3.4 0 5.4 3.6 4 6.7C19.5 16.3 12 21 12 21z"/></svg><b data-lives="1">${LIVES}</b>
      <span class="rc-bar"><i data-bar="1"></i></span></span>
    <span class="rc-chip"><small>TIME</small><b data-timer>0:00</b></span>
    <span class="rc-chip" data-status-wrap data-state="ready"><i class="rc-status-dot"></i><span data-status>Ready</span></span>
    <span class="rc-chip" data-first-chip>FIRST <b data-first>—</b></span>
    <span class="rc-chip"><small>BEST</small><b data-best>0</b></span>
    <span class="rc-chip rc-badge" data-cheatbadge hidden>CHEATS</span>
    <span class="rc-spacer"></span>
    <button class="rc-btn rc-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="rc-btn-label">Help</span></button>
    <button class="rc-btn rc-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" data-btncheats>${iconSVG("wrench", { size: 14 })}<span class="rc-btn-label">Cheats</span></button>
    <button class="rc-btn rc-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" data-btnpause><span class="rc-ico" data-pause-ico>${iconSVG("pause", { size: 14 })}</span><span class="rc-btn-label" data-pause-label>Pause</span></button>
    <button class="rc-btn rc-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="rc-btn-label">Restart</span></button>
    <button class="rc-btn rc-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="rc-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel rc-board" data-board>
      <svg class="rc-svg" data-svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Road Crossing board">
        <defs><linearGradient id="rc-danger" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ef4444" stop-opacity="0"/><stop offset="1" stop-color="#ef4444" stop-opacity=".55"/>
        </linearGradient></defs>
        <g data-g="rows"></g><g data-g="items"></g><g data-g="players"></g><g data-g="fx"></g>
        <rect data-g="danger" x="0" y="${H - 60}" width="${W}" height="60" fill="url(#rc-danger)" opacity="0"/>
        <rect data-g="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
      </svg>
      <div class="rc-toast" data-toast hidden></div>

      <div class="rc-ov" data-ov="intro">
        <div class="rc-card">
          <div class="rc-head"><h3>Road Crossing</h3></div>
          <span class="rc-role" data-role>Preparing the race…</span>
          <ul class="rc-bullets">
            <li>Race to row <b>${TARGET}</b> before your rival. ${LIVES} lives each.</li>
            <li>The camera <b>never stops</b> — fall behind and you lose a life.</li>
            <li>Cross roads through gaps, ride logs, wait out trains.</li>
          </ul>
          <p class="rc-note">Your best row is shown in the HUD.</p>
          <div class="rc-foot"><div class="rc-btnrow">
            <button class="rc-btn primary" type="button" data-act="start">Start race</button>
            <button class="rc-btn" type="button" data-help>How to play</button>
          </div></div>
        </div>
      </div>

      <div class="rc-ov" data-ov="count" hidden>
        <div class="rc-card" style="background:transparent;border:0;box-shadow:none">
          <div class="rc-count" data-count>3</div>
          <p class="rc-note" data-countnote style="margin-top:8px"></p>
        </div>
      </div>

      <div class="rc-ov" data-ov="pause" hidden>
        <div class="rc-card">
          <div class="rc-head"><h3>Paused</h3></div>
          <p>The camera is waiting. Take a breath.</p>
          <div class="rc-foot"><button class="rc-btn primary" type="button" data-pause>Resume</button></div>
        </div>
      </div>

      <div class="rc-ov" data-ov="end" hidden>
        <div class="rc-card">
          <div class="rc-head"><h3 data-endtitle>Finished</h3></div>
          <p data-endreason></p>
          <div class="rc-stats" data-endstats></div>
          <p class="rc-note" data-endbest></p>
          <div class="rc-foot"><div class="rc-btnrow">
            <button class="rc-btn primary" type="button" data-act="restart">Rematch</button>
            <button class="rc-btn" type="button" data-exit>Exit game</button>
          </div></div>
        </div>
      </div>

      <div class="rc-ov" data-ov="help" hidden>
        <div class="rc-card">
          <div class="rc-head"><h3>How to play</h3><button class="rc-btn" type="button" data-close="help" aria-label="Close help">Close</button></div>
          <div class="rc-help">
          <h5>Goal</h5>
          <ul>
            <li>Be the first to reach row <b>${TARGET}</b> (checkered line). ${LIVES} lives each; losing all lives eliminates you.</li>
            <li>A <b>coin flip</b> decides who moves first — the other joins 0.7s later.</li>
            <li>Your character, <b>P1/P2 slot</b> and spawn side are randomized every match (also in multiplayer).</li>
          </ul>
          <h5>Camera</h5>
          <ul><li>The camera scrolls forward non-stop and speeds up as the leader advances. Drop below the screen and you lose a life. No AFK!</li></ul>
          <h5>Controls</h5>
          <ul>
            <li>Keyboard: <b>WASD / arrows</b>, <b>Space</b> = hop forward. <b>R</b> restart, <b>P</b> pause (vs Bot), <b>H</b> help, <b>C</b> cheats.</li>
            <li>Mouse: <b>click a tile</b> to hop toward it. Touch: <b>swipe</b> or tap a tile, or use the <b>D-pad</b> (hold to repeat).</li>
          </ul>
          <h5>Hazards</h5>
          <div class="rc-legend">
            <svg viewBox="0 0 36 22"><rect x="2" y="4" width="26" height="13" rx="4" fill="#ef6461"/><rect x="7" y="6" width="7" height="5" rx="1.5" fill="#1f2430" opacity=".55"/><rect x="6" y="16" width="6" height="3" rx="1.5" fill="#1f2430"/><rect x="18" y="16" width="6" height="3" rx="1.5" fill="#1f2430"/></svg><span><b>Cars & trucks</b> — cross through the gaps.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="10" width="36" height="2" fill="#e2e8f0"/><rect x="4" y="3" width="20" height="11" rx="3" fill="#5aa9e6"/></svg><span><b>Highway</b> — fast traffic, time your hops.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="0" width="36" height="22" fill="#4fb3e8"/><rect x="4" y="5" width="28" height="12" rx="6" fill="#a9744f"/></svg><span><b>Logs</b> — ride them; touching water is fatal.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="0" width="36" height="22" fill="#4fb3e8"/><circle cx="12" cy="11" r="8" fill="#58c26a"/><circle cx="27" cy="11" r="8" fill="#58c26a"/></svg><span><b>Lily pads</b> — safe static spots on the river.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="0" width="36" height="22" fill="#4fb3e8"/><rect x="2" y="6" width="32" height="10" rx="5" fill="#a9744f"/><path d="M4 3h8m8 0h8" stroke="#bfe6f7" stroke-width="2" stroke-linecap="round"/></svg><span><b>Rapids</b> — logs drift fast, don't ride off the edge.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="0" width="36" height="22" fill="#808693"/><rect x="2" y="6" width="32" height="10" rx="3" fill="#e25555"/><circle cx="31" cy="4" r="3" fill="#ef4444"/></svg><span><b>Train</b> — red lights blink 1.5s before it arrives. Cross only on clear tracks.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="0" width="36" height="22" fill="#9fd964"/><polygon points="10,18 26,18 18,3" fill="#2f7a3d"/><rect x="16" y="17" width="4" height="4" fill="#8a5a3b"/></svg><span><b>Trees & rocks</b> — block your hop, go around.</span>
            <svg viewBox="0 0 36 22"><rect x="0" y="0" width="36" height="22" fill="#d6f0fa"/><path d="M6 16L16 6m6 10l8-8" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/></svg><span><b>Ice</b> — you keep sliding until you leave the ice.</span>
          </div>
          <h5>Fair play</h5>
          <ul>
            <li>Every 7th row is safe grass. Levels are generated with guaranteed car gaps, log coverage and train windows — every seed is winnable.</li>
            <li>Cheats (solo vs Bot only) disable best-score saving. In online rooms the host simulates the world; pause & cheats are disabled.</li>
          </ul>
          </div>
          <div class="rc-foot"><span class="rc-note">Press H to reopen this guide</span><button class="rc-btn primary" type="button" data-close="help">Got it</button></div>
        </div>
      </div>

      <div class="rc-ov" data-ov="cheat" hidden>
        <div class="rc-card">
          <div class="rc-head"><h3>Cheats</h3><button class="rc-btn" type="button" data-close="cheats" aria-label="Close cheats">Close</button></div>
          <div class="rc-cheat-body">
            <label class="rc-cheat-row"><input type="checkbox" data-cheat="god"><span>God mode (invincible)</span></label>
            <label class="rc-cheat-row"><input type="checkbox" data-cheat="slow"><span>Slow motion world</span></label>
            <label class="rc-cheat-row"><input type="checkbox" data-cheat="freeze"><span>Freeze camera</span></label>
            <label class="rc-cheat-row"><input type="checkbox" data-cheat="fast"><span>Quick hops</span></label>
            <div class="rc-btnrow">
              <button class="rc-btn" type="button" data-cheatbtn="lives">+3 lives</button>
              <button class="rc-btn" type="button" data-cheatbtn="warp">Warp +5 rows</button>
            </div>
          </div>
          <div class="rc-foot"><span class="rc-note">Using cheats disables best-score saving. Available in solo vs Bot only.</span></div>
        </div>
      </div>
  </section>

  <div class="rc-controls">
    <div class="rc-dpad" data-pad aria-label="Direction pad">
      <span></span>
      <button class="rc-dbtn" type="button" data-dir="up" aria-label="Hop up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-7 6 7"/></svg></button>
      <span></span>
      <button class="rc-dbtn" type="button" data-dir="left" aria-label="Hop left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-7 6 7 6"/></svg></button>
      <button class="rc-dbtn" type="button" data-dir="down" aria-label="Hop down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 7 6-7"/></svg></button>
      <button class="rc-dbtn" type="button" data-dir="right" aria-label="Hop right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l7 6-7 6"/></svg></button>
    </div>
    <div class="rc-side"><span class="rc-hint">WASD / arrows · click a tile · swipe · hold D-pad</span></div>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const svg = $("[data-svg]");
    const rowsG = $('[data-g="rows"]'), itemsG = $('[data-g="items"]'), playersG = $('[data-g="players"]'), fxG = $('[data-g="fx"]');
    const dangerRect = $('[data-g="danger"]'), hitRect = $('[data-g="hit"]');
    const hud = {
        name: [$('[data-name="0"]'), $('[data-name="1"]')],
        score: [$('[data-score="0"]'), $('[data-score="1"]')],
        lives: [$('[data-lives="0"]'), $('[data-lives="1"]')],
        dot: [$('[data-dot="0"]'), $('[data-dot="1"]')],
        bar: [$('[data-bar="0"]'), $('[data-bar="1"]')],
        timer: $("[data-timer]"), status: $("[data-status]"), statusWrap: $("[data-status-wrap]"),
        cheatBadge: $("[data-cheatbadge]"), first: $("[data-first]"),
        pauseLabel: $("[data-pause-label]"), pauseIcon: $("[data-pause-ico]"),
    };
    const ov = { intro: $('[data-ov="intro"]'), count: $('[data-ov="count"]'), pause: $('[data-ov="pause"]'), end: $('[data-ov="end"]'), cheat: $('[data-ov="cheat"]'), help: $('[data-ov="help"]') };
    const el = {
        role: $("[data-role]"), best: $("[data-best]"), count: $("[data-count]"), countNote: $("[data-countnote]"),
        endTitle: $("[data-endtitle]"), endReason: $("[data-endreason]"), endStats: $("[data-endstats]"), endBest: $("[data-endbest]"),
        toast: $("[data-toast]"),
    };
    if (online) { $('[data-btncheats]').style.display = "none"; $('[data-btnpause]').style.display = "none"; }

    /* ---------- nama & slot ---------- */
    function rivalName() {
        if (!online) return "Bot";
        const p = roomData?.players;
        const r = Array.isArray(p) ? p[1 - playerIndex] : p?.[1 - playerIndex] ?? p?.[String(1 - playerIndex)];
        return r?.name || "Rival";
    }
    const nameOf = (i) => (i === playerIndex ? playerName || "You" : rivalName());
    const slotOf = (i) => (state ? state.slots[i] : i);

    /* ---------- state serializable ---------- */
    function mkPlayer(slot) {
        const x = (slot === 0 ? 3 : 6) * CELL + 20;
        return { row: 0, x, lives: LIVES, maxRow: 0, alive: true, invulnUntil: 0, nextHopAt: 0, releaseAt: 0, slide: null, fx: null };
    }
    function initState() {
        const seed = pickSeed();
        const flip = Math.random() < 0.5;
        return {
            seed,
            phase: "intro", // intro | countdown | running | finished
            gt: 0, camY: 0, cdEnd: 0, camStartAt: 0, finishGt: 0,
            firstMover: Math.random() < 0.5 ? 0 : 1, // koin: siapa jalan duluan
            slots: flip ? [0, 1] : [1, 0],           // karakter + sisi spawn acak
            pnum: Math.random() < 0.5 ? [1, 2] : [2, 1], // posisi P1/P2 acak (multiplayer & vs bot)
            players: [mkPlayer(flip ? 0 : 1), mkPlayer(flip ? 1 : 0)],
            winner: null, reason: "",
        };
    }
    function beginCountdown() {
        state.phase = "countdown";
        state.cdEnd = state.gt + COUNTDOWN_MS;
        state.camStartAt = state.cdEnd + CAM_DELAY;
        const f = state.firstMover;
        state.players[f].releaseAt = state.cdEnd;
        state.players[1 - f].releaseAt = state.cdEnd + RELEASE_STAGGER;
        publish();
    }
    function newGame() {
        state = initState();
        cheatsUsed = cheats.god || cheats.slow || cheats.freeze || cheats.fast;
        paused = false; pausedAt = 0;
        ui.help = false; ui.cheats = false;
        view.anim = [null, null];
        view.botNext = 0; view.botFwd = 0;
        beginCountdown();
    }

    /* ---------- aksi (template pattern) ---------- */
    function publish() {
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action.type !== "string") return;
        actor = actor === 1 ? 1 : 0;
        if (action.type === "start") { if (state.phase === "intro") beginCountdown(); return; }
        if (action.type === "restart") { newGame(); return; }
        if (action.type !== "hop" || state.phase !== "running") return;
        const p = state.players[actor];
        if (!p || !p.alive) return;
        const dr = Math.sign(Number(action.dr) || 0), dc = Math.sign(Number(action.dc) || 0);
        if ((dr !== 0) === (dc !== 0)) return; // tepat satu sumbu
        if (state.gt < p.releaseAt || state.gt < p.nextHopAt || p.slide) return;
        performHop(actor, dr, dc);
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------- gerakan & fisika ---------- */
    function performHop(a, dr, dc) {
        const p = state.players[a];
        const nr = p.row + dr, nc = clamp(colOf(p) + dc, 0, COLS - 1);
        if (nr < 0 || nr < Math.floor(state.camY)) return;
        const sp = rowFor(state.seed, nr);
        if (treeAt(sp, nc)) { p.nextHopAt = state.gt + 120; return; } // terhalang pohon/batu
        const x0 = p.x, r0 = p.row;
        p.row = nr; p.x = nc * CELL + 20;
        p.maxRow = Math.max(p.maxRow, nr);
        p.nextHopAt = state.gt + (!online && cheats.fast && a === playerIndex ? FAST_HOP_MS : HOP_MS);
        p.slide = sp.type === "ice" ? { dr, dc, nextAt: state.gt + SLIDE_MS } : null;
        view.anim[a] = { x0, r0, x1: p.x, r1: nr, t0: performance.now(), dur: 90, arc: dr !== 0 };
        stepPlayer(a, 0); // cek pendaratan langsung
        if (p.alive && p.maxRow >= TARGET) return finish(a, nameOf(a) + " reached row " + TARGET + ".");
        forcePub = true;
    }

    function stepPlayer(a, wdt) {
        const p = state.players[a];
        if (!p.alive || state.phase !== "running" || state.gt < p.releaseAt) return;
        /* es: luncur sampai keluar es / terhalang */
        if (p.slide && state.gt >= p.slide.nextAt) {
            const { dr, dc } = p.slide;
            const nr = p.row + dr, nc = clamp(colOf(p) + dc, 0, COLS - 1);
            const sp = rowFor(state.seed, nr);
            if (sp.type === "ice" && !treeAt(sp, nc) && nr >= Math.floor(state.camY) && (nr !== p.row || nc !== colOf(p))) {
                const x0 = p.x, r0 = p.row;
                p.row = nr; p.x = nc * CELL + 20; p.maxRow = Math.max(p.maxRow, nr);
                view.anim[a] = { x0, r0, x1: p.x, r1: nr, t0: performance.now(), dur: 70, arc: false };
                p.slide.nextAt = state.gt + SLIDE_MS;
                if (p.maxRow >= TARGET) return finish(a, nameOf(a) + " reached row " + TARGET + ".");
            } else p.slide = null;
        }
        const spec = rowFor(state.seed, p.row);
        const inv = state.gt < p.invulnUntil || god(a);
        if (spec.type === "river") {
            if (!padAt(spec, p.x)) {
                const lg = logAt(spec, p.x, state.gt);
                if (lg) {
                    p.x += lg.vx * wdt;
                    if (p.x < 10 || p.x > W - 10) return hitPlayer(a, "Fell off the log", "splash");
                    if (!logAt(spec, p.x, state.gt) && !padAt(spec, p.x)) return hitPlayer(a, "Swept away by the river", "splash");
                } else if (!inv) return hitPlayer(a, "Swept away by the river", "splash");
            }
        } else if (!inv && spec.type === "road" && carHit(spec, p.x, state.gt)) return hitPlayer(a, "Flattened by traffic", "crash");
        else if (!inv && spec.type === "rail" && railHit(spec, p.x, state.gt)) return hitPlayer(a, "Hit by the train", "zap");
        if (p.row < state.camY - 0.55) return hitPlayer(a, "Left behind by the camera", "cam");
    }

    function respawn(a, startRow, invMs) {
        const p = state.players[a];
        let r = Math.max(startRow ?? p.row, Math.floor(state.camY) + 2);
        while (r < TARGET) {
            const sp = rowFor(state.seed, r);
            if (sp.type === "grass" || sp.type === "ice") {
                const cands = [sp.path, sp.path - 1, sp.path + 1, ...Array(COLS).keys()];
                const c = cands.find((c) => c >= 0 && c < COLS && !treeAt(sp, c));
                if (c != null) { p.row = r; p.x = c * CELL + 20; break; }
            }
            r++;
        }
        if (r >= TARGET) { p.row = TARGET - 1; p.x = rowFor(state.seed, TARGET - 1).path * CELL + 20; }
        p.maxRow = Math.max(p.maxRow, p.row);
        p.invulnUntil = state.gt + (invMs ?? INVULN_MS);
        p.slide = null;
        view.anim[a] = null;
        view.disp[a] = { x: p.x, row: p.row, lift: 0 };
    }

    function hitPlayer(a, reason, kind) {
        const p = state.players[a];
        if (!p.alive) return;
        if (god(a)) { respawn(a, p.row, 900); return; } // cheat: selamat gratis
        p.lives -= 1;
        p.fx = { kind, x: p.x, row: p.row, until: state.gt + 550 };
        forcePub = true;
        if (p.lives <= 0) {
            p.alive = false;
            const other = state.players[1 - a];
            if (!other.alive) finish(null, "Both runners are down.");
            else finish(1 - a, nameOf(a) + " ran out of lives.");
            return;
        }
        respawn(a);
        toast(nameOf(a) + " lost a life — " + reason.toLowerCase());
    }

    function finish(winner, reason) {
        if (state.phase === "finished") return;
        state.phase = "finished";
        state.winner = winner;
        state.reason = reason;
        state.finishGt = state.gt;
        if (!online && !cheatsUsed) {
            const mine = state.players[playerIndex].maxRow;
            if (mine > best) { best = mine; try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { } }
        }
        publish();
    }

    /* ---------- Bot (mode ai, actor 1) ---------- */
    function botSafe(p, dr, dc, look) {
        const nr = p.row + dr, nc = clamp(colOf(p) + dc, 0, COLS - 1);
        if (nr < 0 || nr < Math.floor(state.camY)) return false;
        const sp = rowFor(state.seed, nr), nx = nc * CELL + 20, t = state.gt;
        if (sp.type === "grass") return !treeAt(sp, nc);
        if (sp.type === "ice") return true;
        if (sp.type === "road") return !carHit(sp, nx, t) && (look === 0 || !carHit(sp, nx, t + look));
        if (sp.type === "rail") {
            for (const tt of look === 0 ? [t] : [t, t + look]) { const tr = trainState(sp, tt); if (tr.x != null || tr.warn) return false; }
            return true;
        }
        if (sp.type === "river") return padAt(sp, nx) || !!logAt(sp, nx, t);
        return true;
    }
    function botThink() {
        if (online || state.phase !== "running") return;
        const p = state.players[1];
        if (!p.alive || state.gt < p.releaseAt || p.slide || state.gt < view.botNext) return;
        const sp = rowFor(state.seed, p.row);
        const urgent = p.row - state.camY < 2.0;
        let danger = false;
        if (sp.type === "road") danger = carHit(sp, p.x, state.gt + 300);
        else if (sp.type === "rail") { const tr = trainState(sp, state.gt + 300); danger = tr.x != null || tr.warn; }
        else if (sp.type === "river" && !padAt(sp, p.x)) {
            const lg = logAt(sp, p.x, state.gt);
            danger = !lg || !logAt(sp, p.x + lg.vx * 0.2, state.gt + 200);
        }
        const idle = () => { view.botNext = state.gt + 300 + Math.random() * 260; };
        const tryHop = (dr, dc) => {
            if (dr === 1 && state.gt < view.botFwd && !urgent && !danger) return false;
            applyAction({ type: "hop", dr, dc }, 1);
            if (dr === 1) view.botFwd = state.gt + 480 + Math.random() * 340; // pace bot bisa dikalahkan
            view.botNext = state.gt + 180 + Math.random() * 160;
            return true;
        };
        if (Math.random() < 0.12 && !urgent && !danger) return idle();
        const look = urgent ? 0 : 260;
        if (botSafe(p, 1, 0, look)) { if (tryHop(1, 0)) return; }
        else if (Math.random() < 0.04 && sp.type !== "river" && !urgent) { if (tryHop(1, 0)) return; } // sesekali nekat
        if (danger) {
            for (const dc of Math.random() < 0.5 ? [-1, 1] : [1, -1]) if (botSafe(p, 0, dc, 120) && tryHop(0, dc)) return;
            if (botSafe(p, -1, 0, 120) && tryHop(-1, 0)) return;
            if (botSafe(p, 1, 0, 0) && tryHop(1, 0)) return;
        } else {
            const nxt = rowFor(state.seed, p.row + 1), c = colOf(p);
            if ((sp.type === "grass" || sp.type === "ice") && nxt.type === "river" && !padAt(nxt, p.x) && !logAt(nxt, p.x, state.gt + 300)) {
                for (const dc of [-1, 1]) {
                    const nc = c + dc;
                    if (nc >= 0 && nc < COLS && !treeAt(sp, nc) && (padAt(nxt, nc * CELL + 20) || logAt(nxt, nc * CELL + 20, state.gt + 200))) { if (tryHop(0, dc)) return; }
                }
            } else if ((sp.type === "grass" || sp.type === "ice") && treeAt(nxt, c)) {
                for (const dc of [-1, 1]) {
                    const nc = c + dc;
                    if (nc >= 0 && nc < COLS && !treeAt(sp, nc) && !treeAt(nxt, nc)) { if (tryHop(0, dc)) return; }
                }
            }
        }
        idle();
    }

    /* ---------- cheat (solo vs Bot saja) ---------- */
    function applyCheatButton(kind) {
        if (online || !state) return;
        const p = state.players[playerIndex];
        cheatsUsed = true;
        if (kind === "lives") { p.lives = Math.min(9, p.lives + 3); toast("+3 lives"); }
        if (kind === "warp" && state.phase === "running" && p.alive) { respawn(playerIndex, Math.min(p.row + 5, TARGET - 1), 900); toast("Warped +5 rows"); }
        forcePub = true;
    }

    /* ---------- toast ---------- */
    function toast(msg) { view.toast = { msg, until: performance.now() + 1900 }; }

    /* ---------- render ---------- */
    const rowY = (i, camY) => (VIS - 1 - (i - camY)) * CELL;

    function renderRows(camY) {
        let s = "";
        const i0 = Math.floor(camY) - 1, i1 = i0 + VIS + 2;
        for (let i = i0; i <= i1; i++) {
            const spec = rowFor(state.seed, Math.max(0, i));
            const y = rowY(i, camY);
            if (spec.type === "grass") {
                s += `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${CELL + 0.5}" fill="${i % 2 ? "#96d15c" : "#9fd964"}"/>`;
                s += `<circle cx="${((i * 97) % 360) + 14}" cy="${y + 12}" r="4" fill="#8bc355"/>`;
                s += `<circle cx="${((i * 61 + 180) % 350) + 20}" cy="${y + 30}" r="3" fill="#8bc355"/>`;
                if (spec.sub === "trees") {
                    for (const c of spec.cols) {
                        const cx = c * CELL + 20;
                        if ((i + c) % 3 === 0) s += `<rect x="${cx - 11}" y="${y + 13}" width="22" height="17" rx="7" fill="#aab4bd"/><rect x="${cx - 6}" y="${y + 16}" width="8" height="4" rx="2" fill="#c3ccd4"/>`;
                        else s += `<rect x="${cx - 3}" y="${y + 26}" width="6" height="9" fill="#8a5a3b"/><polygon points="${cx - 14},${y + 28} ${cx + 14},${y + 28} ${cx},${y + 4}" fill="#2f7a3d"/>`;
                    }
                }
                if (i === TARGET) {
                    for (let c = 0; c < COLS; c++) {
                        s += `<rect x="${c * 40}" y="${y + 8}" width="20" height="12" fill="#0f172a"/><rect x="${c * 40 + 20}" y="${y + 8}" width="20" height="12" fill="#ffffff"/>`;
                        s += `<rect x="${c * 40}" y="${y + 20}" width="20" height="12" fill="#ffffff"/><rect x="${c * 40 + 20}" y="${y + 20}" width="20" height="12" fill="#0f172a"/>`;
                    }
                    s += `<text x="200" y="${y + 39}" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="3" fill="#14532d">FINISH</text>`;
                }
            } else if (spec.type === "road") {
                s += `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${CELL + 0.5}" fill="#565d6d"/>`;
                s += `<path d="M0 ${y + 20}h${W}" stroke="#e2e8f0" stroke-opacity=".35" stroke-width="3" stroke-dasharray="16 14"/>`;
            } else if (spec.type === "river") {
                s += `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${CELL + 0.5}" fill="#4fb3e8"/>`;
                for (let k = 0; k < 7; k++) {
                    const wx = ((i * 61 + k * 53) % 340) + 10;
                    s += `<path d="M${wx} ${y + (k % 2 ? 28 : 12)}h14" stroke="#bfe6f7" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/>`;
                }
            } else if (spec.type === "rail") {
                s += `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${CELL + 0.5}" fill="#808693"/>`;
                for (let x = 4; x < W; x += 26) s += `<rect x="${x}" y="${y + 8}" width="10" height="24" rx="2" fill="#6a707c"/>`;
                s += `<path d="M0 ${y + 13}h${W}M0 ${y + 27}h${W}" stroke="#d7dbe2" stroke-width="3"/>`;
            } else {
                s += `<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${CELL + 0.5}" fill="#d6f0fa"/>`;
                s += `<path d="M${(i * 37) % 300 + 20} ${y + 30}l22 -20M${(i * 37) % 300 + 90} ${y + 32}l18 -16" stroke="#ffffff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round"/>`;
                s += `<rect x="0" y="${y + CELL - 2}" width="${W}" height="2" fill="#bfe4f2"/>`;
            }
        }
        rowsG.innerHTML = s;
    }

    function renderItems(gt, camY) {
        let s = "";
        const i0 = Math.floor(camY) - 1, i1 = i0 + VIS + 2;
        const CAR_COLS = ["#ef6461", "#f4a259", "#5aa9e6", "#9b5de5", "#43aa8b"];
        for (let i = i0; i <= i1; i++) {
            const spec = rowFor(state.seed, Math.max(0, i));
            const y = rowY(i, camY);
            if (spec.type === "road") {
                for (let k = 0; k < spec.n; k++) {
                    const x = itemX(spec, gt, k), col = CAR_COLS[(i + k * 2) % CAR_COLS.length];
                    if (spec.sub === "truck") {
                        const cabX = spec.dir === 1 ? x + spec.len - 24 : x;
                        const trX = spec.dir === 1 ? x : x + 24;
                        s += `<rect x="${trX.toFixed(1)}" y="${y + 7}" width="${spec.len - 26}" height="25" rx="4" fill="#cbd5e1"/>`;
                        s += `<rect x="${cabX.toFixed(1)}" y="${y + 9}" width="24" height="23" rx="5" fill="${col}"/>`;
                        s += `<rect x="${(cabX + (spec.dir === 1 ? 12 : 4)).toFixed(1)}" y="${y + 12}" width="8" height="8" rx="2" fill="#1f2430" opacity=".55"/>`;
                        s += `<rect x="${(x + 8).toFixed(1)}" y="${y + 30}" width="9" height="4" rx="2" fill="#1f2430"/><rect x="${(x + spec.len - 17).toFixed(1)}" y="${y + 30}" width="9" height="4" rx="2" fill="#1f2430"/>`;
                    } else {
                        s += `<rect x="${x.toFixed(1)}" y="${y + 8}" width="${spec.len}" height="24" rx="7" fill="${col}"/>`;
                        s += `<rect x="${(x + 7).toFixed(1)}" y="${y + 12}" width="12" height="9" rx="2" fill="#1f2430" opacity=".55"/>`;
                        s += `<rect x="${(x + spec.len - 19).toFixed(1)}" y="${y + 12}" width="12" height="9" rx="2" fill="#1f2430" opacity=".55"/>`;
                        s += `<rect x="${(x + 6).toFixed(1)}" y="${y + 29}" width="9" height="4" rx="2" fill="#1f2430"/><rect x="${(x + spec.len - 15).toFixed(1)}" y="${y + 29}" width="9" height="4" rx="2" fill="#1f2430"/>`;
                    }
                }
            } else if (spec.type === "river") {
                for (const c of spec.pads || []) {
                    s += `<circle cx="${c * CELL + 20}" cy="${y + 20}" r="15" fill="#58c26a"/><circle cx="${c * CELL + 20}" cy="${y + 20}" r="9" fill="#6fd683"/>`;
                }
                for (let k = 0; k < spec.n; k++) {
                    const x = itemX(spec, gt, k);
                    s += `<rect x="${x.toFixed(1)}" y="${y + 6}" width="${spec.len}" height="28" rx="13" fill="#a9744f"/>`;
                    s += `<path d="M${(x + 12).toFixed(1)} ${y + 20}h${spec.len - 24}" stroke="#8a5a3b" stroke-width="3" stroke-linecap="round"/>`;
                    s += `<ellipse cx="${(x + 5).toFixed(1)}" cy="${y + 20}" rx="4" ry="11" fill="#c08a5e"/><ellipse cx="${(x + spec.len - 5).toFixed(1)}" cy="${y + 20}" rx="4" ry="11" fill="#c08a5e"/>`;
                }
            } else if (spec.type === "rail") {
                const tr = trainState(spec, gt);
                if (tr.warn && tr.x == null) {
                    s += `<circle cx="20" cy="${y + 7}" r="6" fill="#ef4444" class="rc-blink"/><circle cx="380" cy="${y + 7}" r="6" fill="#ef4444" class="rc-blink"/>`;
                }
                if (tr.x != null) {
                    s += `<rect x="${tr.x.toFixed(1)}" y="${y + 5}" width="${spec.len}" height="30" rx="6" fill="#e25555"/>`;
                    for (let w = 14; w < spec.len - 22; w += 28) s += `<rect x="${(tr.x + w).toFixed(1)}" y="${y + 11}" width="16" height="10" rx="2" fill="#ffe3e3"/>`;
                    const lx = spec.dir === 1 ? tr.x + spec.len - 10 : tr.x + 2;
                    s += `<rect x="${lx.toFixed(1)}" y="${y + 13}" width="8" height="9" rx="2" fill="#fde047"/>`;
                }
            }
        }
        itemsG.innerHTML = s;
    }

    function renderPlayers(gt, camY, now) {
        let s = "";
        for (let a = 0; a < 2; a++) {
            const p = state.players[a];
            /* posisi tampilan: host pakai animasi hop, guest pakai interpolasi */
            if (online && !room.isHost) {
                /* disp sudah di-ease di guestInterpolate */
            } else {
                const an = view.anim[a];
                if (an) {
                    const t = (now - an.t0) / an.dur;
                    if (t >= 1) { view.anim[a] = null; view.disp[a] = { x: p.x, row: p.row, lift: 0 }; }
                    else {
                        const e = 1 - (1 - t) * (1 - t);
                        view.disp[a] = { x: lerp(an.x0, an.x1, e), row: lerp(an.r0, an.r1, e), lift: an.arc ? Math.sin(Math.PI * t) * 5 : 0 };
                    }
                } else view.disp[a] = { x: p.x, row: p.row, lift: 0 };
            }
            if (!p.alive) continue;
            const d = view.disp[a];
            const y = rowY(d.row, camY) - d.lift;
            const slot = slotOf(a);
            const blink = gt < p.invulnUntil ? (Math.floor(gt / 120) % 2 ? 0.3 : 1) : 1;
            const body = slot === 0 ? "#fffdf7" : "#8ec9ff";
            const wing = slot === 0 ? "#f3ead8" : "#6db2f2";
            const beak = slot === 0 ? "#f59e0b" : "#fbbf24";
            const crest = slot === 0
                ? `<rect x="-4" y="1" width="4" height="6" rx="1.5" fill="#ef4444"/><rect x="1" y="2" width="4" height="5" rx="1.5" fill="#ef4444"/>`
                : `<rect x="-2" y="1" width="5" height="5" rx="2" fill="#5aa7e8"/>`;
            let tag = "";
            if (a === playerIndex) tag = `<text x="0" y="-5" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1" fill="#0f172a" stroke="#ffffff" stroke-width="3" style="paint-order:stroke">YOU</text>`;
            else if (state.phase === "running" && gt < p.releaseAt) tag = `<text x="0" y="-5" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1" fill="#64748b" stroke="#ffffff" stroke-width="3" style="paint-order:stroke">WAIT</text>`;
            if (a === playerIndex && state.phase === "running" && gt < p.releaseAt) tag = `<text x="0" y="-5" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1" fill="#64748b" stroke="#ffffff" stroke-width="3" style="paint-order:stroke">WAIT</text>`;
            s += `<g transform="translate(${d.x.toFixed(1)},${y.toFixed(1)})" opacity="${blink}">` +
                `<ellipse cx="0" cy="29" rx="12" ry="4" fill="#00000030"/>` +
                `<rect x="-11" y="6" width="22" height="20" rx="6" fill="${body}"/>` +
                `<rect x="-9" y="12" width="8" height="9" rx="3" fill="${wing}"/>` +
                crest +
                `<polygon points="11,12 18,14 11,17" fill="${beak}"/>` +
                `<circle cx="5" cy="11" r="1.8" fill="#1f2937"/>` +
                `<rect x="-7" y="26" width="5" height="4" rx="1.5" fill="${beak}"/><rect x="2" y="26" width="5" height="4" rx="1.5" fill="${beak}"/>` +
                tag + `</g>`;
        }
        playersG.innerHTML = s;
        let f = "";
        for (let a = 0; a < 2; a++) {
            const fx = state.players[a].fx;
            if (fx && gt < fx.until) {
                const k = (fx.until - gt) / 550;
                const col = fx.kind === "splash" ? "#38bdf8" : fx.kind === "zap" ? "#ef4444" : fx.kind === "cam" ? "#64748b" : "#f97316";
                f += `<circle cx="${fx.x.toFixed(1)}" cy="${(rowY(fx.row, camY) + 20).toFixed(1)}" r="${(16 + (1 - k) * 26).toFixed(1)}" fill="none" stroke="${col}" stroke-width="4" opacity="${(k * 0.8).toFixed(2)}"/>`;
            }
        }
        fxG.innerHTML = f;
        const me = state.players[playerIndex];
        const lead = me.row - camY;
        dangerRect.setAttribute("opacity", me.alive && state.phase === "running" && lead < 2 ? ((2 - lead) / 2 * 0.5).toFixed(2) : "0");
    }

    function renderStatic() {
        const key = [state.phase, state.seed, state.winner, rivalName(), ui.help, ui.cheats, paused, cheatsUsed, best].join("|");
        if (key === view.staticKey) return;
        view.staticKey = key;
        const mine = state.players[playerIndex], slot = slotOf(playerIndex);
        for (let a = 0; a < 2; a++) {
            hud.name[a].textContent = nameOf(a) + " · P" + state.pnum[a];
            hud.dot[a].style.background = SLOT_COLOR[slotOf(a)];
            hud.bar[a].style.background = SLOT_COLOR[slotOf(a)];
        }
        el.role.textContent = `You are the ${SLOT_NAME[slot]} · P${state.pnum[playerIndex]} · ${slot === 0 ? "left" : "right"} spawn — coin flip: ${nameOf(state.firstMover)} moves first`;
        el.best.textContent = best > 0 ? String(best) : "—";
        hud.first.textContent = nameOf(state.firstMover);
        el.countNote.textContent = nameOf(state.firstMover) + " moves first, " + nameOf(1 - state.firstMover) + " joins 0.7s later";
        /* overlay visibility: help > cheats > phase overlays */
        ov.intro.hidden = state.phase !== "intro" || ui.cheats || ui.help;
        ov.count.hidden = state.phase !== "countdown" || ui.cheats || ui.help;
        ov.end.hidden = state.phase !== "finished" || ui.cheats || ui.help;
        ov.pause.hidden = !(paused && state.phase === "running") || ui.cheats || ui.help;
        ov.cheat.hidden = !ui.cheats || ui.help || online;
        ov.help.hidden = !ui.help;
        hud.cheatBadge.hidden = !(cheatsUsed || cheats.god || cheats.slow || cheats.freeze || cheats.fast);
        /* HUD pause button keeps its icon (label span only) */
        hud.pauseLabel.textContent = paused ? "Resume" : "Pause";
        hud.pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
        /* status */
        const st = paused && state.phase === "running" ? "paused" : state.phase === "running" ? "running" : state.phase === "finished" ? "finished" : "ready";
        hud.status.textContent = st === "paused" ? "Paused" : st === "running" ? "Racing" : st === "finished" ? "Finished" : state.phase === "countdown" ? "Get set" : "Ready";
        hud.statusWrap.dataset.state = st;
        /* hasil akhir */
        if (state.phase === "finished") {
            const win = state.winner === playerIndex, draw = state.winner == null;
            el.endTitle.textContent = draw ? "Draw" : win ? "You win!" : nameOf(state.winner) + " wins";
            el.endTitle.className = draw ? "" : win ? "rc-win" : "rc-lose";
            el.endReason.textContent = state.reason;
            const t = Math.max(0, (state.finishGt - state.cdEnd) / 1000);
            el.endStats.innerHTML =
                `<div>${nameOf(0)}<b>${state.players[0].maxRow} rows</b>${state.players[0].lives} lives left</div>` +
                `<div>${nameOf(1)}<b>${state.players[1].maxRow} rows</b>${state.players[1].lives} lives left</div>` +
                `<div>Race time<b>${fmtTime(t)}</b></div>` +
                `<div>Best row<b>${best}</b></div>`;
            el.endBest.textContent = online ? "Online race — host simulates the world." : cheatsUsed ? "Cheats were used — best score not saved." : "Best score saved locally.";
        }
    }
    const fmtTime = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

    function renderFrame(now) {
        if (!state) { hud.status.textContent = "Connecting"; return; }
        const guest = online && !room.isHost;
        if (!guest) { view.gt = state.gt; view.camY = state.camY; }
        renderStatic();
        renderRows(view.camY);
        renderItems(view.gt, view.camY);
        renderPlayers(view.gt, view.camY, now);
        for (let a = 0; a < 2; a++) {
            const p = state.players[a];
            hud.score[a].textContent = p.maxRow;
            hud.lives[a].textContent = p.lives;
            hud.bar[a].style.width = Math.min(100, (p.maxRow / TARGET) * 100) + "%";
        }
        const endT = state.phase === "finished" ? state.finishGt : view.gt;
        hud.timer.textContent = fmtTime(Math.max(0, (endT - state.cdEnd) / 1000));
        if (state.phase === "countdown") el.count.textContent = Math.max(1, Math.ceil((state.cdEnd - view.gt) / 1000));
        if (view.toast && now < view.toast.until) { el.toast.hidden = false; el.toast.textContent = view.toast.msg; }
        else el.toast.hidden = true;
    }

    /* ---------- interpolasi untuk guest ---------- */
    function guestInterpolate(dt) {
        if (view.seed !== state.seed || view.lastPhase !== state.phase) {
            view.seed = state.seed; view.lastPhase = state.phase;
            view.gt = state.gt; view.camY = state.camY;
            for (let a = 0; a < 2; a++) view.disp[a] = { x: state.players[a].x, row: state.players[a].row, lift: 0 };
            return;
        }
        const diff = state.gt - view.gt;
        if (Math.abs(diff) > 400) view.gt = state.gt; else view.gt += diff * 0.12;
        if (state.phase !== "finished") view.gt += dt * 1000;
        view.camY += (state.camY - view.camY) * Math.min(1, dt * 10);
        for (let a = 0; a < 2; a++) {
            const p = state.players[a], d = view.disp[a];
            if (Math.abs(p.row - d.row) > 2) { d.x = p.x; d.row = p.row; }
            else { d.x += (p.x - d.x) * Math.min(1, dt * 14); d.row += (p.row - d.row) * Math.min(1, dt * 14); }
            d.lift = 0;
        }
    }

    /* ---------- main loop ---------- */
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (destroyed) return;
        if (!lastT) { lastT = now; renderFrame(now); return; }
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        if (!state) { renderFrame(now); return; }
        if (online && !room.isHost) { guestInterpolate(dt); renderFrame(now); return; }
        if (paused) { renderFrame(now); return; }
        const scale = !online && cheats.slow ? 0.45 : 1;
        state.gt += dt * 1000 * scale;
        const wdt = dt * scale;
        if (state.phase === "countdown" && state.gt >= state.cdEnd) {
            state.phase = "running";
            toast("GO! " + nameOf(state.firstMover) + " moves first");
            forcePub = true;
        }
        if (state.phase === "running") {
            if (state.gt >= state.camStartAt) {
                let leader = 0;
                for (const p of state.players) if (p.alive) leader = Math.max(leader, p.row, p.maxRow);
                let spd = CAM_MIN + (CAM_MAX - CAM_MIN) * clamp(leader / TARGET, 0, 1);
                if (!online && cheats.freeze) spd = 0;
                state.camY += wdt * spd; // kamera SELALU maju (anti-AFK)
                const follow = leader - (VIS - 3);
                if (state.camY < follow) state.camY += (follow - state.camY) * Math.min(1, dt * 8);
            }
            stepPlayer(0, wdt);
            stepPlayer(1, wdt);
            botThink();
        }
        if (online && room.isHost && (forcePub || now - view.lastPub > 120) && state.phase !== "intro") {
            view.lastPub = now; forcePub = false; publish();
        }
        renderFrame(now);
    }

    /* ---------- input: keyboard ---------- */
    const KEYMAP = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], KeyW: [1, 0], KeyS: [-1, 0], KeyA: [0, -1], KeyD: [0, 1], Space: [1, 0] };
    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) ui.cheats = false;
        view.staticKey = "";
    }
    function toggleCheats(on) {
        if (online) return;
        ui.cheats = typeof on === "boolean" ? on : !ui.cheats;
        if (ui.cheats) ui.help = false;
        view.staticKey = "";
    }
    /* Pause membekukan state.gt & bot; penanda performance.now() digeser saat resume. */
    function setPaused(on) {
        if (online || !state || state.phase !== "running" || on === paused) return;
        if (on) {
            paused = true;
            pausedAt = performance.now();
        } else {
            const shift = performance.now() - pausedAt;
            pausedAt = 0;
            for (const an of view.anim) if (an) an.t0 += shift;
            if (view.toast) view.toast.until += shift;
            lastT += shift;
            view.lastPub += shift;
            paused = false;
        }
        view.staticKey = "";
    }
    function togglePause() { setPaused(!paused); }
    function onVis() { if (document.hidden && !online && state?.phase === "running" && !paused) setPaused(true); }
    function onKey(e) {
        if (destroyed || e.metaKey || e.ctrlKey || e.altKey) return;
        const c = e.code;
        /* prioritas: help → cheats → pause/Escape → aksi game */
        if (c === "KeyH") { e.preventDefault(); toggleHelp(); return; }
        if (c === "KeyC") { e.preventDefault(); if (!ui.help) toggleCheats(); return; }
        if (c === "KeyP" || c === "Escape") {
            e.preventDefault();
            if (ui.help) toggleHelp(false);
            else if (ui.cheats) toggleCheats(false);
            else togglePause();
            return;
        }
        if (c === "KeyR") {
            e.preventDefault();
            if (!ui.help && !ui.cheats) submitAction({ type: "restart" });
            return;
        }
        if (c === "Enter") {
            const focused = e.target && e.target.closest && e.target.closest("button,input");
            if (!focused) {
                if (ui.help) toggleHelp(false);
                else if (ui.cheats) toggleCheats(false);
                else if (state && state.phase === "intro") submitAction({ type: "start" });
                else if (state && state.phase === "finished") submitAction({ type: "restart" });
            }
            e.preventDefault();
            return;
        }
        const mv = KEYMAP[c];
        if (mv) {
            e.preventDefault();
            if (!ui.help && !ui.cheats && !paused) submitAction({ type: "hop", dr: mv[0], dc: mv[1] });
        }
    }

    /* ---------- input: mouse / touch di papan ---------- */
    let swipe = null;
    function svgPoint(e) {
        const m = svg.getScreenCTM();
        if (!m) return null;
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    }
    function onBoardDown(e) {
        if (!state || state.phase !== "running" || ui.help || ui.cheats || paused) return;
        e.preventDefault();
        swipe = { x: e.clientX, y: e.clientY };
        try { hitRect.setPointerCapture(e.pointerId); } catch (_) { }
    }
    function onBoardUp(e) {
        if (!swipe) return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (!state || state.phase !== "running" || ui.help || ui.cheats || paused) return;
        if (Math.abs(dx) >= 24 || Math.abs(dy) >= 24) {
            if (Math.abs(dx) > Math.abs(dy)) submitAction({ type: "hop", dr: 0, dc: dx > 0 ? 1 : -1 });
            else submitAction({ type: "hop", dr: dy < 0 ? 1 : -1, dc: 0 });
            return;
        }
        /* tap / klik petak: lompat satu langkah ke arah petak itu */
        const pt = svgPoint(e);
        if (!pt) return;
        const me = state.players[playerIndex];
        const targetCol = clamp(Math.floor(pt.x / CELL), 0, COLS - 1);
        const targetRow = Math.round(view.camY + VIS - 1 - pt.y / CELL);
        const dRow = targetRow - me.row, dCol = targetCol - colOf(me);
        if (dRow === 0 && dCol === 0) submitAction({ type: "hop", dr: 1, dc: 0 });
        else if (Math.abs(dRow) >= Math.abs(dCol)) submitAction({ type: "hop", dr: Math.sign(dRow), dc: 0 });
        else submitAction({ type: "hop", dr: 0, dc: Math.sign(dCol) });
    }

    /* ---------- input: D-pad (tahan untuk ulang) ---------- */
    const PAD_MAP = { up: [1, 0], down: [-1, 0], left: [0, -1], right: [0, 1] };
    function stopPad(btn) {
        const t = padTimers.get(btn);
        if (t) { clearTimeout(t.delay); clearInterval(t.rep); padTimers.delete(btn); }
    }
    root.querySelectorAll("[data-pad] .rc-dbtn").forEach((btn) => {
        btn.addEventListener("pointerdown", (e) => {
            if (ui.help || ui.cheats || paused) return;
            e.preventDefault();
            const mv = PAD_MAP[btn.dataset.dir];
            if (!mv) return;
            submitAction({ type: "hop", dr: mv[0], dc: mv[1] });
            stopPad(btn);
            const delay = setTimeout(() => {
                const rep = setInterval(() => {
                    if (!paused && !ui.help && !ui.cheats) submitAction({ type: "hop", dr: mv[0], dc: mv[1] });
                }, 170);
                padTimers.set(btn, { delay: null, rep });
            }, 280);
            padTimers.set(btn, { delay, rep: null });
        });
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => btn.addEventListener(ev, () => stopPad(btn)));
        btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    /* ---------- klik tombol (template handleClick) ---------- */
    function handleClick(event) {
        const exit = event.target.closest("[data-exit]");
        if (exit) { onExit(); return; }
        const b = event.target.closest("[data-act],[data-restart],[data-help],[data-cheats],[data-pause],[data-close],[data-cheatbtn]");
        if (!b) return;
        if (b.dataset.act === "start" || b.dataset.act === "restart") submitAction({ type: b.dataset.act });
        else if (b.hasAttribute("data-restart")) submitAction({ type: "restart" });
        else if (b.hasAttribute("data-help")) toggleHelp();
        else if (b.hasAttribute("data-cheats")) toggleCheats();
        else if (b.hasAttribute("data-pause")) togglePause();
        else if (b.dataset.close === "help") toggleHelp(false);
        else if (b.dataset.close) toggleCheats(false);
        else if (b.dataset.cheatbtn) applyCheatButton(b.dataset.cheatbtn);
        if (b.blur) b.blur();
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat]");
        if (!c || online) return;
        cheats[c.dataset.cheat] = c.checked;
        if (c.checked) cheatsUsed = true;
        view.staticKey = "";
        toast("Cheat " + (c.checked ? "enabled" : "disabled") + ": " + c.dataset.cheat);
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    hitRect.addEventListener("pointerdown", onBoardDown);
    hitRect.addEventListener("pointerup", onBoardUp);

    /* ---------- wiring mode (template) ---------- */
    const sub = (fn) => { const u = fn(); if (typeof u === "function") offs.push(u); };
    if (online) {
        sub(() => room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; view.staticKey = ""; }));
        if (room.isHost) {
            state = initState();
            publish();
            sub(() => room.onAction((action) => applyAction(action, 1)));
        } else {
            sub(() => room.onState((nextState) => { if (destroyed || !nextState) return; state = nextState; view.staticKey = ""; }));
        }
    } else {
        state = initState();
    }
    raf = requestAnimationFrame(frame);

    /* ---------- cleanup ---------- */
    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("visibilitychange", onVis);
            hitRect.removeEventListener("pointerdown", onBoardDown);
            hitRect.removeEventListener("pointerup", onBoardUp);
            padTimers.forEach((_, btn) => stopPad(btn));
            offs.forEach((u) => { try { u(); } catch (_) { } });
            root.innerHTML = "";
        },
    };
}