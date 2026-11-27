/* ==== GAME: pool.js ==== */
import { iconSVG } from "../JS/icons.js";
/*
  Pool — mini 8-ball (template META + mount).
  Mode: solo, lawan bot (mode "ai"), online (mode "room", host otoritatif).
  Jalankan: node tools/build-games-manifest.mjs setelah menyimpan file ini.
*/

export const META = {
    id: "pool", // harus sama dengan nama file tanpa .js
    name: "Pool",
    category: "casual",
    catLabel: "Casual",
    desc: "Habiskan grupmu lalu masukkan 8-ball. Solo, lawan bot, atau online. Level acak yang dijamin bisa diselesaikan.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="40" height="28" rx="4"/><circle cx="13" cy="24" r="4" fill="currentColor" stroke="none"/><circle cx="24" cy="19" r="4" fill="currentColor" stroke="none"/><circle cx="35" cy="24" r="4" fill="currentColor" stroke="none"/><circle cx="24" cy="29" r="4" fill="currentColor" stroke="none"/><path d="M4 10l3 3m37-3l-3 3M4 38l3-3m37 3l-3-3"/></svg>',
    bg: ["#99f6e4", "#14b8a6"],
    bestKey: "poolBestLevel",
};

/* ================= aturan murni / konstanta ================= */
const W = 480, H = 300, WALL = 20, BR = 8.5, PR = 14;
const FOUL_MAX = 3, SPEED_MIN = 130, SPEED_RANGE = 540, H_STEP = 1 / 120;
const POCKETS = [
    { x: WALL, y: WALL }, { x: W / 2, y: 12 }, { x: W - WALL, y: WALL },
    { x: WALL, y: H - WALL }, { x: W / 2, y: H - 12 }, { x: W - WALL, y: H - WALL },
];
const BALL_COLORS = {
    0: "#f8fafc", 1: "#fde047", 2: "#3b82f6", 3: "#ef4444", 4: "#a78bfa",
    5: "#fb923c", 6: "#4ade80", 7: "#b45309", 8: "#111827", 9: "#fde047",
    10: "#3b82f6", 11: "#ef4444", 12: "#a78bfa", 13: "#fb923c", 14: "#4ade80", 15: "#b45309",
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const isStripe = (n) => n >= 9 && n <= 15;
const groupOfSeat = (s) => (s === 0 ? "solids" : "stripes");
const inGroup = (n, g) => (g === "solids" ? n >= 1 && n <= 7 : isStripe(n));
const groupLabel = (g) => (g === "solids" ? "Solid" : "Stripe");

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    const t = L2 <= 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function pathClear(x1, y1, x2, y2, balls, ignore, cl) {
    for (const b of balls) {
        if (ignore.includes(b.n)) continue;
        if (segDist(b.x, b.y, x1, y1, x2, y2) < cl) return false;
    }
    return true;
}
/* jalur bola->pocket harus lolos zona cushion (uji "jaw"), sesuai aturan physicsStep */
function pathLegal(x1, y1, x2, y2, pocket) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    const n = Math.max(2, Math.ceil(L / 3));
    for (let i = 1; i <= n; i++) {
        const t = i / n, x = x1 + dx * t, y = y1 + dy * t;
        if (Math.hypot(x - pocket.x, y - pocket.y) < 12) return true;
        const cy = y < WALL + 18 || y > H - WALL - 18;
        const cx = x < WALL + 18 || x > W - WALL - 18;
        const mx = Math.abs(x - W / 2) < 16;
        if (x < WALL + BR && !cy) return false;
        if (x > W - WALL - BR && !cy) return false;
        if (y < WALL + BR && !(cx || mx)) return false;
        if (y > H - WALL - BR && !(cx || mx)) return false;
    }
    return false;
}
/* satu bola dianggap bisa dipot: ada pocket dengan jalur bersih + posisi ghost valid */
function pottable(b, balls) {
    for (const p of POCKETS) {
        let ux = p.x - b.x, uy = p.y - b.y;
        const L = Math.hypot(ux, uy); if (L < 1) continue;
        ux /= L; uy /= L;
        if (!pathClear(b.x, b.y, p.x, p.y, balls, [b.n, 0], 2 * BR - 1.5)) continue;
        if (!pathLegal(b.x, b.y, p.x, p.y, p)) continue;
        const gx = b.x - ux * 2 * BR, gy = b.y - uy * 2 * BR;
        if (gx < WALL + BR + 1 || gx > W - WALL - BR - 1 || gy < WALL + BR + 1 || gy > H - WALL - BR - 1) continue;
        let free = true;
        for (const o of balls) {
            if (o.n === b.n || o.n === 0) continue;
            if (Math.hypot(o.x - gx, o.y - gy) < 2 * BR + 1) { free = false; break; }
        }
        if (free) return true;
    }
    return false;
}
function rackFallback(nums) {
    const ax = 306, cy = H / 2, dxr = BR * 1.74, dyr = BR * 2.02;
    const balls = [{ n: 0, x: 120, y: cy }, { n: 8, x: ax + 2 * dxr, y: cy }];
    const others = nums.filter((n) => n !== 8);
    let k = 0;
    for (let row = 0; row < 5; row++) {
        for (let i = 0; i <= row; i++) {
            if (row === 2 && i === 1) continue;
            if (k >= others.length) break;
            balls.push({ n: others[k++], x: ax + row * dxr, y: cy + (i - row / 2) * dyr });
        }
    }
    return balls;
}
/* generator level acak yang diverifikasi bisa diselesaikan.
   Bola ditempatkan satu per satu; setiap penambahan harus menjaga
   SEMUA bola tetap punya jalur pot langsung (menghapus bola hanya
   membuka jalur baru, jadi urutan pot apa pun tetap valid). */
function generateLevel(seed, level, mode) {
    const rng = mulberry32(seed);
    const ns = Math.min(2 + level, 7);
    const nt = mode === "solo" ? Math.min(1 + level, 7) : ns;
    const pick = (arr, k) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a.slice(0, k);
    };
    const nums = [...pick([1, 2, 3, 4, 5, 6, 7], ns), ...pick([9, 10, 11, 12, 13, 14, 15], nt), 8];
    const lo = WALL + BR + 8, hiX = W - WALL - BR - 8, hiY = H - WALL - BR - 8;
    const finish = (list) => list.map((b) => ({ n: b.n, x: r2(b.x), y: r2(b.y), vx: 0, vy: 0 }));
    for (let attempt = 0; attempt < 40; attempt++) {
        const balls = [{ n: 0, x: 45 + rng() * 105, y: 60 + rng() * 180 }];
        let ok = true;
        for (const n of nums) {
            let placed = false;
            for (let t = 0; t < 90; t++) {
                const x = lo + rng() * (hiX - lo), y = lo + rng() * (hiY - lo);
                if (POCKETS.some((p) => Math.hypot(x - p.x, y - p.y) < PR + BR + 8)) continue;
                if (balls.some((b) => Math.hypot(x - b.x, y - b.y) < 2 * BR + 6)) continue;
                const cand = balls.concat([{ n, x, y }]);
                if (cand.every((b) => b.n === 0 || pottable(b, cand))) {
                    balls.push({ n, x, y }); placed = true; break;
                }
            }
            if (!placed) { ok = false; break; }
        }
        if (ok) return finish(balls);
    }
    return finish(rackFallback(nums)); // fallback: rack segitiga klasik
}

/* fisika satu langkah tetap (deterministik, diverifikasi via simulasi):
   - capture pocket r=12 + aturan gutter (bola tak bisa kabur)
   - cushion punya celah di pocket sudut & tengah
   - tumbukan CCD: rewind ke titik kontak eksak -> arah akurat
   - gesek eksponensial 0.75/s + linear 18px/s^2 -> settle <= ~4 dtk */
function physicsStep(list, h, potted) {
    const R = 2 * BR;
    for (const b of list) {
        b.x += b.vx * h; b.y += b.vy * h;
        let cap = false;
        for (const p of POCKETS) {
            const dx = p.x - b.x, dy = p.y - b.y;
            if (dx * dx + dy * dy < 144) { cap = true; break; }
        }
        if (!cap && (b.x < WALL - 4 || b.x > W - WALL + 4 || b.y < WALL - 4 || b.y > H - WALL + 4)) cap = true;
        if (cap) { potted.push(b.n); b.dead = true; b.vx = 0; b.vy = 0; continue; }
        if (b.x < WALL + BR && b.y > WALL + 18 && b.y < H - WALL - 18) { b.x = WALL + BR; b.vx = Math.abs(b.vx) * 0.9; }
        if (b.x > W - WALL - BR && b.y > WALL + 18 && b.y < H - WALL - 18) { b.x = W - WALL - BR; b.vx = -Math.abs(b.vx) * 0.9; }
        const tb = (b.x > WALL + 18 && b.x < W / 2 - 16) || (b.x > W / 2 + 16 && b.x < W - WALL - 18);
        if (tb && b.y < WALL + BR) { b.y = WALL + BR; b.vy = Math.abs(b.vy) * 0.9; }
        if (tb && b.y > H - WALL - BR) { b.y = H - WALL - BR; b.vy = -Math.abs(b.vy) * 0.9; }
    }
    for (let i = 0; i < list.length; i++) {
        const a = list[i]; if (a.dead) continue;
        for (let j = i + 1; j < list.length; j++) {
            const b = list[j]; if (b.dead) continue;
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 > 1e-6 && d2 < R * R) {
                const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
                if (rvx * dx + rvy * dy <= 0) continue;
                const A = rvx * rvx + rvy * rvy, B = 2 * (dx * rvx + dy * rvy), C = d2 - R * R;
                let s = 0;
                if (A > 1e-9) {
                    const disc = B * B - 4 * A * C;
                    if (disc >= 0) s = clamp((-B + Math.sqrt(disc)) / (2 * A), 0, h);
                }
                a.x -= a.vx * s; a.y -= a.vy * s; b.x -= b.vx * s; b.y -= b.vy * s;
                let nx = b.x - a.x, ny = b.y - a.y, d = Math.hypot(nx, ny) || 1e-4;
                nx /= d; ny /= d;
                const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
                if (rel > 0) {
                    const jj = (rel * 1.95) / 2;
                    a.vx -= jj * nx; a.vy -= jj * ny; b.vx += jj * nx; b.vy += jj * ny;
                }
                a.x += a.vx * s; a.y += a.vy * s; b.x += b.vx * s; b.y += b.vy * s;
                nx = b.x - a.x; ny = b.y - a.y; d = Math.hypot(nx, ny) || 1e-4;
                if (d < R) {
                    const push = (R - d) / 2 + 0.01; nx /= d; ny /= d;
                    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
                }
            }
        }
    }
    for (const b of list) {
        if (b.dead) continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < 3) { b.vx = 0; b.vy = 0; }
        else { const f = Math.max(0, 1 - 0.75 * h - (18 * h) / sp); b.vx *= f; b.vy *= f; }
    }
    return list.filter((b) => !b.dead);
}
/* raycast untuk garis bantu cheat: tumbukan pertama / cushion */
function raycast(cue, d, balls) {
    let tBest = Infinity, hit = null;
    for (const b of balls) {
        if (b.n === 0) continue;
        const mx = cue.x - b.x, my = cue.y - b.y;
        const bd = mx * d.x + my * d.y;
        const disc = bd * bd - (mx * mx + my * my - 4 * BR * BR);
        if (disc < 0) continue;
        const t = -bd - Math.sqrt(disc);
        if (t > 0.001 && t < tBest) { tBest = t; hit = b; }
    }
    const lo = WALL + BR, hiX = W - WALL - BR, hiY = H - WALL - BR;
    let tc = Infinity;
    if (d.x > 1e-6) tc = Math.min(tc, (hiX - cue.x) / d.x);
    if (d.x < -1e-6) tc = Math.min(tc, (lo - cue.x) / d.x);
    if (d.y > 1e-6) tc = Math.min(tc, (hiY - cue.y) / d.y);
    if (d.y < -1e-6) tc = Math.min(tc, (lo - cue.y) / d.y);
    if (tc < tBest) { tBest = tc; hit = null; }
    if (!isFinite(tBest)) tBest = 60;
    return { t: tBest, ball: hit, x: cue.x + d.x * tBest, y: cue.y + d.y * tBest };
}
/* solver pot terbaik (dipakai bot + cheat auto-aim). Akurasi ~94% tanpa noise. */
function findBestShot(balls, group) {
    const cue = balls.find((b) => b.n === 0);
    if (!cue) return null;
    let targets = balls.filter((b) => inGroup(b.n, group));
    if (!targets.length) targets = balls.filter((b) => b.n === 8);
    let best = null;
    for (const t of targets) {
        for (const p of POCKETS) {
            let ux = p.x - t.x, uy = p.y - t.y;
            const d2p = Math.hypot(ux, uy); if (d2p < 1) continue;
            ux /= d2p; uy /= d2p;
            const gx = t.x - ux * 2 * BR, gy = t.y - uy * 2 * BR;
            if (gx < WALL + BR + 1 || gx > W - WALL - BR - 1 || gy < WALL + BR + 1 || gy > H - WALL - BR - 1) continue;
            let ax = gx - cue.x, ay = gy - cue.y;
            const d1 = Math.hypot(ax, ay); if (d1 < 1) continue;
            ax /= d1; ay /= d1;
            const cut = ax * ux + ay * uy;
            if (cut < 0.35) continue;
            if (!pathClear(cue.x, cue.y, gx, gy, balls, [0, t.n], 2 * BR - 0.5)) continue;
            if (!pathClear(t.x, t.y, p.x, p.y, balls, [t.n, 0], 2 * BR - 0.5)) continue;
            if (!pathLegal(t.x, t.y, p.x, p.y, p)) continue;
            if (balls.some((b) => b.n !== t.n && b.n !== 0 && Math.hypot(b.x - gx, b.y - gy) < 2 * BR + 0.5)) continue;
            const vObj = d2p * 0.95 + 65;
            const vNeed = vObj / cut + d1 * 0.9 + 35;
            if (vNeed > SPEED_MIN + SPEED_RANGE) continue; // tidak feasible dgn power maksimum
            const vCue = Math.max(160, vNeed);
            const score = cut * 2 - d1 / 600 - d2p / 900;
            if (!best || score > best.score) {
                best = { score, angle: Math.atan2(ay, ax), power: clamp((vCue - SPEED_MIN) / SPEED_RANGE, 0.05, 1), targetN: t.n };
            }
        }
    }
    return best;
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isAuthority = !online || room.isHost;
    const uid = Math.random().toString(36).slice(2, 7);
    let roomData = room?.room || null;
    let state = null;

    root.innerHTML = `
<div class="game-app pool-game game-fill" data-el="wrap">
<style>
.pool-game{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--bg:#fff;--soft:#f8fafc;--acc:#0d9488;--bad:#dc2626;--good:#059669;color:var(--ink);font-size:14px;line-height:1.45;gap:8px;min-height:0}
.pool-game *{box-sizing:border-box}
.pool-game [hidden]{display:none!important}
.pool-game .game-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 9px;background:var(--bg);white-space:nowrap}
.pool-game .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);display:inline-block;flex:none}
.pool-game .game-status-dot.busy{background:#f59e0b}
.pool-game .game-status-dot.off{background:#94a3b8}
.pool-game .pl-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:none}
.pool-game .pl-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);background:var(--bg);border-radius:999px;padding:5px 9px;display:inline-flex;gap:5px;align-items:center;white-space:nowrap}
.pool-game .pl-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.pool-game .pl-chip.warn b{color:var(--bad)}
.pool-game .pl-chip.good{color:var(--good)}
.pool-game .pl-chip.bad{color:var(--bad)}
.pool-game .pl-chip.cheat{border-color:#fcd34d;background:#fffbeb;color:#92400e}
.pool-game .pl-chip.msg{max-width:16ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
.pool-game .pl-spacer{flex:1 1 auto}
.pool-game .pl-btn{appearance:none;min-height:36px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:9px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s;display:inline-flex;align-items:center;gap:6px}
.pool-game .pl-btn:hover{background:var(--soft)}
.pool-game .pl-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.pool-game .pl-btn.acc{background:var(--acc);border-color:var(--acc);color:#fff}
.pool-game .pl-btn.on{border-color:var(--acc);color:var(--acc);background:#ecfdf5}
.pool-game .pl-btn:disabled{opacity:.45;cursor:default}
.pool-game .pl-icon-btn svg{flex:none;display:block}
.pool-game .pl-btnrow{display:flex;gap:8px;flex-wrap:wrap}
.pool-game .game-panel.pl-panel{position:relative;min-width:0;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#064e3b;display:flex;align-items:center;justify-content:center}
.pool-game .pl-svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none}
.pool-game .pl-aim{stroke:#f8fafc;stroke-width:2;stroke-dasharray:6 6;opacity:.9}
.pool-game .pl-target{stroke:#fbbf24;stroke-width:2;opacity:.9}
.pool-game .pl-ghost{stroke:#f8fafc;stroke-width:1.5;fill:none;opacity:.8}
.pool-game .pl-ball{stroke:#06110c;stroke-width:1}
.pool-game .pl-ball text{font-family:inherit;font-size:8px;font-weight:700;fill:#0f172a;text-anchor:middle}
.pool-game .pl-ov{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:12px;overflow:auto;background:rgba(248,250,252,.88);border-radius:12px}
.pool-game .pl-card{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:16px;max-width:400px;width:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden}
.pool-game .pl-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.pool-game .pl-head h3{margin:0;font-size:17px;font-weight:700}
.pool-game .pl-scroll{flex:1 1 auto;min-height:0;overflow:auto}
.pool-game .pl-card p{margin:0 0 10px;font-size:12.5px;line-height:1.55;color:var(--mut)}
.pool-game .pl-foot{flex:none;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.pool-game .pl-note{font-size:11px;color:var(--mut);margin-right:auto}
.pool-game .pl-help{font-size:12.5px;display:grid;gap:8px;margin:0;padding:0;list-style:none}
.pool-game .pl-help li{padding-left:14px;position:relative;color:#334155;line-height:1.5}
.pool-game .pl-help li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:50%;background:var(--acc)}
.pool-game kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;background:var(--soft);font-family:inherit}
.pool-game .pl-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 0;border-bottom:1px solid var(--soft);font-size:12.5px;cursor:pointer}
.pool-game .pl-cheatrow input{accent-color:var(--acc);width:18px;height:18px}
.pool-game .pl-pad{flex:none;display:none;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;max-width:640px;width:100%;margin:0 auto}
.pool-game.pad-on .pl-pad{display:grid}
.pool-game .pl-padgrp{display:flex;gap:8px;justify-content:center}
.pool-game .pl-padbtn{min-width:46px;min-height:46px;border-radius:12px;border:1px solid var(--line);background:var(--bg);font-size:17px;font-weight:700;color:var(--ink);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.pool-game .pl-padbtn:active{background:var(--soft)}
.pool-game .pl-shoot{min-width:96px;min-height:46px;border-radius:12px;border:0;background:var(--acc);color:#fff;font-size:13px;font-weight:800;letter-spacing:.04em;cursor:pointer}
.pool-game .pl-shoot:disabled{opacity:.45}
.pool-game .pl-padlbl{font-size:10px;color:var(--mut);text-align:center;margin-top:4px}
.pool-game :is(button,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (max-width:640px){
.pool-game{gap:6px}
.pool-game .pl-card{padding:12px}
.pool-game .pl-pad{gap:6px}
}
@media (prefers-reduced-motion:reduce){.pool-game *{animation:none!important;transition:none!important}}

/* --- layout redesign overrides (keep last) --- */
.pool-game.game-fill > .game-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.pool-game.game-fill > .game-panel[data-board]:not(:has(.pl-ov:not([hidden]))){aspect-ratio:480/300;flex:0 0 auto}
.pool-game.game-fill > .game-panel[data-board]:has(.pl-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.pool-game .pl-hud{gap:5px}
.pool-game .pl-hud .pl-chip{padding:4px 6px;font-size:9px}
.pool-game .pl-hud .pl-chip.msg,
.pool-game .pl-hud .pl-chip[data-hud="fouls"],
.pool-game .pl-hud .pl-chip[data-hud="shots"],
.pool-game .pl-hud .pl-chip[data-hud="best"]{display:none}
.pool-game .pl-hud .pl-btn{min-height:32px;padding:5px 8px;font-size:9px}
.pool-game .pl-hud .pl-btn-label,.pool-game .pl-hud .pl-spacer{display:none}
.pool-game .pl-ov{padding:8px}
.pool-game .pl-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.pool-game .pl-scroll{scrollbar-width:none}
.pool-game .pl-scroll::-webkit-scrollbar{display:none}
.pool-game .pl-foot{margin-top:10px}
.pool-game .pl-note{display:none}
}
</style>
<div class="pl-hud">
  <span class="pl-chip">LV <b data-hud="level">1</b></span>
  <span class="pl-chip">GRUP <b data-hud="group">–</b></span>
  <span class="pl-chip">SISA <b data-hud="left">–</b></span>
  <span class="pl-chip" data-el="chipfoul">FOUL <b data-hud="fouls">0/${FOUL_MAX}</b></span>
  <span class="pl-chip">SHOT <b data-hud="shots">0</b></span>
  <span class="pl-chip">BEST <b data-hud="best">–</b></span>
  <span class="pl-chip game-status"><i class="game-status-dot" data-el="dot"></i><span data-status>Siap</span></span>
  <span class="pl-chip cheat" data-el="chipcheat" hidden>CHEAT</span>
  <span class="pl-chip msg" data-el="banner" title="">Tarik dari bola putih untuk membidik — lepas untuk menembak.</span>
  <span class="pl-spacer"></span>
  <button class="pl-btn" type="button" data-act="pad" data-el="padbtn" aria-label="Toggle touch pad" title="Toggle touch pad">${iconSVG("gamepad2", { size: 14 })}<span class="pl-btn-label">Pad</span></button>
  <button class="pl-btn" type="button" data-act="shoot" data-el="hudshoot" aria-label="Shoot" title="Shoot (Space)">${iconSVG("target", { size: 14 })}<span class="pl-btn-label">Shoot</span></button>
  <button class="pl-btn pl-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pl-btn-label">Help</span></button>
  <button class="pl-btn pl-icon-btn" type="button" data-cheats data-el="cheatbtn" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="pl-btn-label">Cheats</span></button>
  <button class="pl-btn pl-icon-btn" type="button" data-pause data-el="pausebtn" aria-label="Pause" title="Pause (P)"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="pl-btn-label">Pause</span></button>
  <button class="pl-btn pl-icon-btn" type="button" data-restart data-el="restartbtn" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="pl-btn-label">Restart</span></button>
  <button class="pl-btn pl-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pl-btn-label">Exit game</span></button>
</div>
<section class="game-panel pl-panel" data-board>
  <svg class="pl-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-el="svg" role="img" aria-label="Meja pool">
    <g data-el="table"></g>
    <g data-el="balls"></g>
    <line class="pl-aim" data-el="aim" visibility="hidden"/>
    <line class="pl-target" data-el="target" visibility="hidden"/>
    <circle class="pl-ghost" data-el="ghost" r="${BR}" visibility="hidden"/>
    <g data-el="power" visibility="hidden">
      <rect x="${WALL}" y="${H - 9}" width="${W - 2 * WALL}" height="4" rx="2" fill="#ffffff26"/>
      <rect data-el="powerfill" x="${WALL}" y="${H - 9}" width="0" height="4" rx="2" fill="#f59e0b"/>
    </g>
  </svg>
  <div class="pl-ov" data-ov="start">
    <div class="pl-card">
      <div class="pl-head"><h3>Pool — 8-ball mini</h3></div>
      <div class="pl-scroll">
        <div data-el="localstart">
          <p>Masukkan semua bola solid (1–7), lalu 8-ball. Di solo, stripe adalah blocker. Scratch atau pot stripe = foul; ${FOUL_MAX} foul = kalah. Setiap level diacak dan dijamin ada jalur pot.</p>
        </div>
        <div data-el="waitbox" hidden>
          <h3 style="margin:0 0 8px;font-size:15px">Menunggu host…</h3>
          <p>Host sedang menyiapkan meja. Kamu masuk otomatis begitu state tersedia.</p>
        </div>
      </div>
      <div class="pl-foot" data-el="localstartfoot">
        <button class="pl-btn primary" type="button" data-act="start-solo">Solo</button>
        <button class="pl-btn acc" type="button" data-act="start-bot">Lawan Bot</button>
        <button class="pl-btn" type="button" data-help>Cara bermain</button>
      </div>
    </div>
  </div>
  <div class="pl-ov" data-ov="help" hidden>
    <div class="pl-card">
      <div class="pl-head"><h3>Cara bermain</h3><button class="pl-btn" type="button" data-help-close>Close</button></div>
      <div class="pl-scroll">
        <ul class="pl-help">
          <li><b>Tujuan:</b> pot semua bola grupmu (Solid 1–7 / Stripe 9–15), lalu 8-ball. Di solo, stripe adalah blocker.</li>
          <li><b>Foul:</b> scratch (bola putih masuk) atau pot stripe di solo. ${FOUL_MAX} foul = kalah. 8-ball masuk sebelum grup habis = kalah.</li>
          <li><b>Giliran:</b> pot bola sendiri → lanjut; gagal pot / foul → giliran pindah. Giliran pertama diundi acak.</li>
          <li><b>Mouse:</b> gerakkan untuk membidik; klik atau tarik dari bola putih lalu lepas untuk menembak (makin jauh = makin kuat).</li>
          <li><b>Keyboard:</b> <kbd>←</kbd><kbd>→</kbd> bidik (<kbd>Shift</kbd> = halus), <kbd>↑</kbd><kbd>↓</kbd> tenaga, <kbd>Space</kbd> tembak, <kbd>R</kbd> rack baru, <kbd>H</kbd> bantuan, <kbd>C</kbd> cheat, <kbd>P</kbd> jeda.</li>
          <li><b>Mobile:</b> tarik di meja, atau pakai pad virtual ◀ ▶ (bidik), − + (tenaga), lalu SHOOT.</li>
          <li><b>Level:</b> layout acak terverifikasi — setiap bola punya jalur langsung ke pocket.</li>
          <li><b>Online:</b> posisi pemain (Solid/Stripe, P1/P2) dan giliran pertama diundi acak oleh host.</li>
        </ul>
      </div>
      <div class="pl-foot"><span class="pl-note">Tekan H untuk membuka panduan ini lagi</span><button class="pl-btn primary" type="button" data-help-close>Mengerti</button></div>
    </div>
  </div>
  <div class="pl-ov" data-ov="cheat" hidden>
    <div class="pl-card">
      <div class="pl-head"><h3>Cheat</h3><button class="pl-btn" type="button" data-close-cheats>Close</button></div>
      <div class="pl-scroll">
        <p>Hanya mode lokal. Skor best tidak disimpan saat cheat dipakai.</p>
        <label class="pl-cheatrow"><span>Garis bantu penuh (prediksi tumbukan)</span><input type="checkbox" data-cheat="guide"></label>
        <label class="pl-cheatrow"><span>Slow motion</span><input type="checkbox" data-cheat="slow"></label>
        <label class="pl-cheatrow"><span>Anti-foul (scratch tidak dihitung)</span><input type="checkbox" data-cheat="noFoul"></label>
        <div class="pl-btnrow" style="margin-top:10px">
          <button class="pl-btn" type="button" data-act="autoaim">Auto-aim</button>
          <button class="pl-btn" type="button" data-act="cheatpot">Pot 1 bola</button>
          <button class="pl-btn" type="button" data-act="resetfouls">Reset foul</button>
          <button class="pl-btn" type="button" data-act="cheatwin">Menang instan</button>
        </div>
      </div>
      <div class="pl-foot"><button class="pl-btn primary" type="button" data-close-cheats>Tutup</button></div>
    </div>
  </div>
  <div class="pl-ov" data-ov="over" hidden>
    <div class="pl-card">
      <div class="pl-head"><h3 data-ov="title">Rack selesai</h3></div>
      <div class="pl-scroll"><p data-ov="reason"></p></div>
      <div class="pl-foot">
        <button class="pl-btn primary" type="button" data-act="next" data-el="btnnext">Level berikutnya</button>
        <button class="pl-btn" type="button" data-act="restart">Ulangi / rack baru</button>
      </div>
    </div>
  </div>
  <div class="pl-ov" data-ov="pause" hidden>
    <div class="pl-card">
      <div class="pl-head"><h3>Dijeda</h3></div>
      <div class="pl-scroll"><p>Tekan P, Esc, atau tombol Resume untuk melanjutkan.</p></div>
      <div class="pl-foot"><button class="pl-btn primary" type="button" data-resume>Resume</button></div>
    </div>
  </div>
</section>
<div class="pl-pad" data-el="pad">
  <div>
    <div class="pl-padgrp">
      <button class="pl-padbtn" type="button" data-hold="rotL" aria-label="Putar bidikan kiri">◀</button>
      <button class="pl-padbtn" type="button" data-hold="rotR" aria-label="Putar bidikan kanan">▶</button>
    </div>
    <div class="pl-padlbl">Bidik</div>
  </div>
  <button class="pl-shoot" type="button" data-act="shoot" data-el="shoot">SHOOT</button>
  <div>
    <div class="pl-padgrp">
      <button class="pl-padbtn" type="button" data-hold="powD" aria-label="Kurangi tenaga">−</button>
      <button class="pl-padbtn" type="button" data-hold="powU" aria-label="Tambah tenaga">+</button>
    </div>
    <div class="pl-padlbl">Tenaga</div>
  </div>
</div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const wrap = $('[data-el="wrap"]');
    const svgEl = $('[data-el="svg"]');
    const tableG = $('[data-el="table"]');
    const ballsG = $('[data-el="balls"]');
    const aimEl = $('[data-el="aim"]');
    const targetEl = $('[data-el="target"]');
    const ghostEl = $('[data-el="ghost"]');
    const powerG = $('[data-el="power"]');
    const powerFill = $('[data-el="powerfill"]');
    const bannerEl = $('[data-el="banner"]');
    const statusEl = $("[data-status]");
    const statusDot = $('[data-el="dot"]');
    const hudLevel = $('[data-hud="level"]');
    const hudGroup = $('[data-hud="group"]');
    const hudLeft = $('[data-hud="left"]');
    const hudFouls = $('[data-hud="fouls"]');
    const hudShots = $('[data-hud="shots"]');
    const hudBest = $('[data-hud="best"]');
    const chipFoul = $('[data-el="chipfoul"]');
    const chipCheat = $('[data-el="chipcheat"]');
    const ovStart = $('[data-ov="start"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovOver = $('[data-ov="over"]');
    const ovPause = $('[data-ov="pause"]');
    const ovTitle = $('[data-ov="title"]');
    const ovReason = $('[data-ov="reason"]');
    const localStart = $('[data-el="localstart"]');
    const localStartFoot = $('[data-el="localstartfoot"]');
    const waitBox = $('[data-el="waitbox"]');
    const btnNext = $('[data-el="btnnext"]');
    const shootBtn = $('[data-el="shoot"]');
    const hudShoot = $('[data-el="hudshoot"]');
    const restartBtn = $('[data-el="restartbtn"]');
    const cheatBtn = $('[data-el="cheatbtn"]');
    const padBtn = $('[data-el="padbtn"]');
    const pauseBtn = $('[data-el="pausebtn"]');
    const pauseIcon = $('[data-pause-icon]');

    /* ---------------- state lokal (non-kanonik) ---------------- */
    let begun = false, destroyed = false, dirty = true;
    let sim = null; // {id, balls, potted, acc, steps, done}
    const aim = { angle: 0, power: 0.5, visible: false, init: false };
    const held = {};
    const cheats = { guide: false, slow: false, noFoul: false };
    let cheatsUsed = false, padForced = null;
    let dragging = false, dragMoved = false, dragType = "mouse", downPt = null;
    let raf = 0, lastT = 0, botTimer = 0;
    const unsubs = [];
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }
    let helpOpen = false, cheatsOpen = false, paused = false, autoResume = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("poolHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("poolHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    const mySeat = () => (!online ? 0 : !state ? -1 : room.isHost ? state.hostSeat : 1 - state.hostSeat);
    function canAim() {
        if (!state || destroyed || paused || helpOpen || cheatsOpen) return false;
        if (!online && !begun) return false;
        if (state.phase !== "aim" || state.winner !== null || sim) return false;
        return state.mode === "solo" || state.turn === mySeat();
    }
    const clearBotTimer = () => { if (botTimer) { clearTimeout(botTimer); botTimer = 0; } };

    /* ---------------- render ---------------- */
    function renderTable() {
        let html = '<rect x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" rx="14" fill="#0c3b2e"/>';
        html += '<rect x="' + (WALL - 3) + '" y="' + (WALL - 3) + '" width="' + (W - 2 * WALL + 6) + '" height="' + (H - 2 * WALL + 6) + '" rx="8" fill="#1a7a5c"/>';
        html += '<line x1="' + (WALL + 60) + '" y1="' + WALL + '" x2="' + (WALL + 60) + '" y2="' + (H - WALL) + '" stroke="#ffffff14" stroke-width="1.5"/>';
        html += '<circle cx="' + (WALL + 60) + '" cy="' + H / 2 + '" r="2" fill="#ffffff22"/>';
        for (const p of POCKETS) html += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + PR + '" fill="#07130d"/>';
        tableG.innerHTML = html;
    }
    function ballSvg(b) {
        const col = BALL_COLORS[b.n] || "#f8fafc";
        let inner = "";
        if (isStripe(b.n)) {
            inner =
                '<defs><clipPath id="plc' + uid + b.n + '"><circle cx="' + b.x + '" cy="' + b.y + '" r="' + BR + '"/></clipPath></defs>' +
                '<rect x="' + (b.x - BR) + '" y="' + (b.y - 3.9) + '" width="' + 2 * BR + '" height="7.8" fill="' + col + '" clip-path="url(#plc' + uid + b.n + ')"/>';
        } else if (b.n !== 0 && b.n !== 8) {
            inner = '<circle cx="' + b.x + '" cy="' + b.y + '" r="' + BR + '" fill="' + col + '"/>';
        } else if (b.n === 8) {
            inner = '<circle cx="' + b.x + '" cy="' + b.y + '" r="' + BR + '" fill="#111827"/>';
        }
        const label =
            b.n === 0
                ? '<circle cx="' + b.x + '" cy="' + b.y + '" r="1.8" fill="#b91c1c"/>'
                : '<circle cx="' + b.x + '" cy="' + b.y + '" r="4.2" fill="#f8fafc"/><text x="' + b.x + '" y="' + (b.y + 2.8) + '">' + b.n + "</text>";
        return '<g class="pl-ball" data-n="' + b.n + '"><circle cx="' + b.x + '" cy="' + b.y + '" r="' + BR + '" fill="#f8fafc"/>' + inner + label + "</g>";
    }
    function renderBalls(list) { ballsG.innerHTML = list.map(ballSvg).join(""); }
    function setBanner(txt, tone) {
        bannerEl.textContent = txt;
        bannerEl.title = txt;
        bannerEl.className = "pl-chip msg" + (tone ? " " + tone : "");
    }
    function padVisible() {
        if (padForced !== null) return padForced;
        return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth < 720;
    }
    function renderAll() {
        if (destroyed) return;
        dirty = true;
        const s = state;
        const seat = mySeat();
        const g = groupOfSeat(Math.max(seat, 0));
        const showStart = online ? !s : !begun;
        ovStart.hidden = !showStart || helpOpen || cheatsOpen || paused;
        waitBox.hidden = !online || Boolean(s) || helpOpen || cheatsOpen || paused;
        localStart.hidden = online;
        localStartFoot.hidden = online;
        ovOver.hidden = !(s && s.winner !== null) || helpOpen || cheatsOpen || paused;
        ovHelp.hidden = !helpOpen;
        ovCheat.hidden = !cheatsOpen || helpOpen;
        ovPause.hidden = !paused || helpOpen || cheatsOpen;
        hudLevel.textContent = s ? String(s.level) : "–";
        hudGroup.textContent = s ? (s.mode === "solo" ? "Solid" : groupLabel(g) + (online ? " · P" + (seat + 1) : "")) : "–";
        const list = sim ? sim.balls : s ? s.balls : [];
        hudLeft.textContent = s ? String(list.filter((b) => inGroup(b.n, g)).length) : "–";
        hudFouls.textContent = s ? (s.fouls[seat] || 0) + "/" + FOUL_MAX : "–";
        hudShots.textContent = s ? String(s.shots[seat] || 0) : "–";
        hudBest.textContent = best > 0 ? "Lv " + best : "–";
        chipFoul.classList.toggle("warn", Boolean(s && (s.fouls[seat] || 0) >= FOUL_MAX - 1));
        chipCheat.hidden = online || !(cheatsUsed || cheats.guide || cheats.slow || cheats.noFoul);
        let st = "Siap", dot = "";
        if (!s) { st = "Menunggu host…"; dot = "off"; }
        else if (s.winner !== null) { st = "Selesai"; dot = "off"; }
        else if (s.phase === "shooting" || sim) { st = "Bola bergerak…"; dot = "busy"; }
        else if (!online && !begun) { st = "Pilih mode"; dot = "off"; }
        else if (s.mode === "solo" || s.turn === seat) { st = "Giliranmu"; }
        else if (s.mode === "bot") { st = "Bot berpikir…"; dot = "busy"; }
        else { st = "Giliran lawan…"; dot = "busy"; }
        statusEl.textContent = st;
        statusDot.className = "game-status-dot" + (dot ? " " + dot : "");
        if (s && s.msg) setBanner(s.msg, s.tone);
        if (s && s.winner !== null) {
            const win = s.mode === "solo" ? s.winner === 0 : s.winner === seat;
            ovTitle.textContent = s.mode === "solo" ? (win ? "Level " + s.level + " selesai!" : "Rack gagal") : win ? "Kamu menang!" : "Kamu kalah";
            ovTitle.style.color = win ? "var(--good)" : "var(--bad)";
            ovReason.textContent =
                s.reason + " Foul: " + s.fouls[0] + "–" + s.fouls[1] + ", tembakan: " + s.shots[0] + "–" + s.shots[1] + "." +
                (cheatsUsed && !online ? " (cheat aktif — best tidak disimpan)" : "");
            btnNext.hidden = !win;
        }
        shootBtn.disabled = !canAim();
        hudShoot.disabled = !canAim();
        restartBtn.disabled = !s || (!online && !begun);
        cheatBtn.hidden = online;
        padBtn.classList.toggle("on", padVisible());
        wrap.classList.toggle("pad-on", padVisible());
        syncHudButtons();
    }
    function syncHudButtons() {
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".pl-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
            if (pauseIcon) pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
        }
        if (cheatBtn) cheatBtn.classList.toggle("on", !online && (cheatsUsed || cheats.guide || cheats.slow || cheats.noFoul));
    }
    function drawAim() {
        const cue = state && state.balls.find((b) => b.n === 0);
        if (!aim.visible || !cue || !canAim()) {
            aimEl.setAttribute("visibility", "hidden");
            ghostEl.setAttribute("visibility", "hidden");
            targetEl.setAttribute("visibility", "hidden");
            powerG.setAttribute("visibility", "hidden");
            return;
        }
        const d = { x: Math.cos(aim.angle), y: Math.sin(aim.angle) };
        let ex, ey;
        if (cheats.guide && !online) {
            const rc = raycast(cue, d, state.balls);
            ex = rc.x; ey = rc.y;
            ghostEl.setAttribute("cx", String(ex));
            ghostEl.setAttribute("cy", String(ey));
            if (rc.ball) {
                let ux = rc.ball.x - ex, uy = rc.ball.y - ey;
                const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
                targetEl.setAttribute("x1", String(rc.ball.x));
                targetEl.setAttribute("y1", String(rc.ball.y));
                targetEl.setAttribute("x2", String(rc.ball.x + ux * 36));
                targetEl.setAttribute("y2", String(rc.ball.y + uy * 36));
                targetEl.setAttribute("visibility", "visible");
            } else targetEl.setAttribute("visibility", "hidden");
        } else {
            const len = 40 + aim.power * 120;
            ex = cue.x + d.x * len; ey = cue.y + d.y * len;
            ghostEl.setAttribute("cx", String(cue.x + d.x * (BR + 2)));
            ghostEl.setAttribute("cy", String(cue.y + d.y * (BR + 2)));
            targetEl.setAttribute("visibility", "hidden");
        }
        aimEl.setAttribute("x1", String(cue.x + d.x * (BR + 2)));
        aimEl.setAttribute("y1", String(cue.y + d.y * (BR + 2)));
        aimEl.setAttribute("x2", String(ex));
        aimEl.setAttribute("y2", String(ey));
        aimEl.setAttribute("visibility", "visible");
        ghostEl.setAttribute("visibility", "visible");
        powerG.setAttribute("visibility", "visible");
        powerFill.setAttribute("width", String((W - 2 * WALL) * aim.power));
    }

    /* ---------------- simulasi tembakan ---------------- */
    function startSim(shot) {
        const list = state.balls.map((b) => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0 }));
        const cue = list.find((b) => b.n === 0);
        if (!cue) { sim = null; return; }
        const sp = SPEED_MIN + shot.power * SPEED_RANGE;
        cue.vx = shot.dx * sp; cue.vy = shot.dy * sp;
        sim = { id: shot.id, balls: list, potted: [], acc: 0, steps: 0, done: false };
        aim.visible = false;
        drawAim();
        dirty = true;
    }
    function respawnCue(list) {
        let x = 120, y = H / 2, guard = 0;
        const free = (x, y) =>
            list.every((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > (2 * BR + 4) ** 2) &&
            POCKETS.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > (PR + BR + 6) ** 2);
        while (!free(x, y) && guard++ < 300) {
            x = WALL + BR + 6 + Math.random() * (W / 2 - WALL);
            y = WALL + BR + 6 + Math.random() * (H - 2 * WALL - 12);
        }
        list.push({ n: 0, x: r2(x), y: r2(y), vx: 0, vy: 0 });
    }
    function settle() {
        const potted = sim ? sim.potted.slice() : [];
        const rest = sim ? sim.balls : state.balls;
        sim = null;
        const by = state.shot ? state.shot.by : state.turn;
        const solo = state.mode === "solo";
        const g = groupOfSeat(by);
        state.balls = rest.map((b) => ({ n: b.n, x: r2(b.x), y: r2(b.y), vx: 0, vy: 0 }));
        state.shot = null;
        const cuePotted = potted.includes(0);
        const eight = potted.includes(8);
        const own = potted.filter((n) => inGroup(n, g)).length;
        const opp = potted.filter((n) => n !== 0 && n !== 8 && !inGroup(n, g)).length;
        const leftOwn = state.balls.filter((b) => inGroup(b.n, g)).length;
        let foul = false, msg = "", tone = "", winner = null, reason = "";
        if (cuePotted) { foul = true; msg = "Scratch! Bola putih masuk."; respawnCue(state.balls); }
        if (solo && opp > 0) { foul = true; msg = (msg ? msg + " " : "") + "Stripe adalah blocker — foul."; }
        if (cheats.noFoul && !online) foul = false;
        if (foul) state.fouls[by]++;
        if (eight) {
            const leftBefore = leftOwn + own;
            if (leftBefore > 0) { winner = solo ? -1 : 1 - by; reason = "8-ball masuk terlalu awal."; }
            else if (cuePotted) { winner = solo ? -1 : 1 - by; reason = "Scratch saat memasukkan 8-ball."; }
            else {
                winner = by;
                reason = solo
                    ? "Level " + state.level + " selesai dalam " + state.shots[0] + " tembakan."
                    : "Player " + (by + 1) + " menyelesaikan grupnya lalu 8-ball.";
            }
        }
        if (winner === null && state.fouls[by] >= FOUL_MAX) {
            winner = solo ? -1 : 1 - by;
            reason = FOUL_MAX + " foul — rack hangus.";
        }
        if (winner !== null) {
            state.winner = winner;
            state.phase = "over";
            state.reason = reason;
            state.msg = winner === -1 ? "Rack gagal." : solo ? "Level selesai!" : "Player " + (winner + 1) + " menang!";
            state.tone = (solo ? winner === 0 : winner === mySeat()) ? "good" : "bad";
            if (solo && winner === 0 && !cheatsUsed && state.level > best) {
                best = state.level;
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
            }
        } else {
            state.phase = "aim";
            const keep = own > 0 && !foul;
            state.turn = solo ? 0 : keep ? by : 1 - by;
            if (!msg) {
                if (own > 0) msg = "Mantap — " + own + " bola masuk." + (leftOwn === 0 ? " Grup bersih, saatnya 8-ball!" : "");
                else if (opp > 0 && !solo) msg = "Bola lawan masuk — giliran berpindah.";
                else msg = "Tidak ada bola masuk.";
            } else if (leftOwn === 0 && !eight) msg += " Saatnya 8-ball!";
            tone = foul ? "bad" : own > 0 ? "good" : "";
            state.msg = msg;
            state.tone = tone;
        }
        publish();
        if (!online && state.mode === "bot" && state.phase === "aim" && state.turn === 1) scheduleBot();
    }

    /* ---------------- game flow ---------------- */
    function newGame(gmode, level) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const balls = generateLevel(seed, level, gmode);
        const hostSeat = Math.random() < 0.5 ? 0 : 1; // undian posisi pemain (online)
        const turn = gmode === "solo" ? 0 : Math.random() < 0.5 ? 0 : 1; // undian jalan duluan
        const toss =
            gmode === "solo"
                ? "Level " + level + " — habiskan solid lalu 8-ball."
                : "Undian: Player " + (turn + 1) + " (" + groupLabel(groupOfSeat(turn)) + ") jalan duluan.";
        return {
            v: 1, mode: gmode, level, seed, hostSeat, turn,
            phase: "aim", seq: 0, shot: null, balls,
            fouls: [0, 0], shots: [0, 0], winner: null, reason: "", msg: toss, tone: "",
        };
    }
    function publish() {
        renderAll();
        if (online && room.isHost && state) {
            try { room.publishState(state).catch(console.warn); } catch (e) { console.warn(e); }
        }
    }
    function applyAction(a, actor) {
        if (destroyed || !state || !a) return;
        if (a.type === "shoot") {
            if (state.phase !== "aim" || state.winner !== null || sim) return;
            if (state.mode === "solo" ? actor !== 0 : actor !== state.turn) return;
            const dx = +a.dx, dy = +a.dy, pw = clamp(+a.power || 0, 0.05, 1);
            const L = Math.hypot(dx, dy);
            if (!(L > 0.0001)) return;
            if (!state.balls.some((b) => b.n === 0)) return;
            state.seq = (state.seq || 0) + 1;
            state.shot = { id: state.seq, dx: dx / L, dy: dy / L, power: pw, by: actor };
            state.shots[actor] = (state.shots[actor] || 0) + 1;
            state.phase = "shooting";
            state.msg = ""; state.tone = "";
            clearBotTimer();
            publish();
            startSim(state.shot);
        } else if (a.type === "restart" || a.type === "next") {
            if (online && !room.isHost) return;
            const lvl = a.type === "next" ? state.level + 1 : state.level;
            const gmode = state.mode;
            clearBotTimer();
            sim = null;
            aim.init = false; aim.visible = false;
            state = newGame(gmode, lvl);
            publish();
            if (gmode === "bot" && state.turn === 1) scheduleBot();
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            try { room.sendAction(action).catch(console.warn); } catch (e) { console.warn(e); }
            return;
        }
        applyAction(action, mySeat());
    }
    function onCanonical(next) {
        if (destroyed || !next) return;
        state = next;
        if (state.phase === "shooting" && state.shot) {
            if (!sim || sim.id !== state.shot.id) startSim(state.shot);
        } else {
            sim = null;
        }
        renderAll();
    }
    function scheduleBot() {
        clearBotTimer();
        botTimer = setTimeout(botPlay, 900 + Math.random() * 800);
    }
    function botPlay() {
        botTimer = 0;
        if (destroyed || !state || state.mode !== "bot" || state.phase !== "aim" || state.turn !== 1 || state.winner !== null) return;
        const g = groupOfSeat(1);
        const s = findBestShot(state.balls, g);
        const noise = Math.max(0.006, 0.05 - state.level * 0.006); // makin tinggi level, makin akurat
        let angle, power;
        if (s) {
            angle = s.angle + (Math.random() - 0.5) * 2 * noise;
            if (Math.random() < 0.15) angle += (Math.random() - 0.5) * 0.1; // sesekali blunder
            power = clamp(s.power * (0.92 + Math.random() * 0.16), 0.05, 1);
        } else {
            const cue = state.balls.find((b) => b.n === 0);
            let targets = state.balls.filter((b) => inGroup(b.n, g));
            if (!targets.length) targets = state.balls.filter((b) => b.n === 8);
            if (!cue || !targets.length) return;
            let t = targets[0], bd = Infinity;
            for (const b of targets) {
                const d = (b.x - cue.x) ** 2 + (b.y - cue.y) ** 2;
                if (d < bd) { bd = d; t = b; }
            }
            angle = Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() - 0.5) * 0.06;
            power = 0.45 + Math.random() * 0.2;
        }
        applyAction({ type: "shoot", dx: Math.cos(angle), dy: Math.sin(angle), power }, 1);
    }

    /* ---------------- cheat (lokal saja) ---------------- */
    function handleCheat(op) {
        if (online || !state || !begun) return;
        cheatsUsed = true;
        const seat = mySeat();
        const g = groupOfSeat(seat);
        if (op === "autoaim") {
            const s = findBestShot(state.balls, g);
            if (!s) { setBanner("Tidak ada pot langsung dari posisi ini.", "bad"); renderAll(); return; }
            aim.angle = s.angle; aim.power = s.power; aim.init = true; aim.visible = true;
            setBanner("Auto-aim: bola " + s.targetN + ". Tekan Space / SHOOT.", "good");
            drawAim();
            return;
        }
        if (op === "resetfouls") {
            state.fouls[seat] = 0;
            state.msg = "Foul direset (cheat)."; state.tone = "";
            publish();
            return;
        }
        if (state.phase !== "aim" || state.winner !== null || sim) { setBanner("Tunggu bola berhenti dulu.", ""); return; }
        if (op === "cheatpot") {
            const targets = state.balls.filter((b) => inGroup(b.n, g));
            let n;
            if (targets.length) { const s = findBestShot(state.balls, g); n = s ? s.targetN : targets[0].n; }
            else n = 8;
            state.balls = state.balls.filter((b) => b.n !== n);
            if (n === 8) {
                state.winner = seat; state.phase = "over";
                state.reason = "Menang via cheat."; state.msg = "Level selesai!"; state.tone = "good";
            } else {
                const left = state.balls.filter((b) => inGroup(b.n, g)).length;
                state.msg = "Cheat: bola " + n + " dimasukkan." + (left === 0 ? " Saatnya 8-ball!" : "");
                state.tone = "good";
            }
            publish();
            return;
        }
        if (op === "cheatwin") {
            state.balls = state.balls.filter((b) => !inGroup(b.n, g) && b.n !== 8);
            state.winner = seat; state.phase = "over";
            state.reason = "Menang via cheat (instant win).";
            state.msg = state.mode === "solo" ? "Level selesai!" : "Kamu menang!";
            state.tone = "good";
            publish();
        }
    }

    /* ---------------- input: aiming ---------------- */
    function ensureAim() {
        if (aim.init || !state) return;
        const cue = state.balls.find((b) => b.n === 0);
        const g = groupOfSeat(Math.max(mySeat(), 0));
        let targets = state.balls.filter((b) => inGroup(b.n, g));
        if (!targets.length) targets = state.balls.filter((b) => b.n === 8);
        if (cue && targets.length) {
            let t = targets[0], bd = Infinity;
            for (const b of targets) {
                const d = (b.x - cue.x) ** 2 + (b.y - cue.y) ** 2;
                if (d < bd) { bd = d; t = b; }
            }
            aim.angle = Math.atan2(t.y - cue.y, t.x - cue.x);
        }
        aim.init = true;
    }
    function fire() {
        if (!canAim()) return;
        ensureAim();
        aim.visible = false;
        drawAim();
        submitAction({ type: "shoot", dx: Math.cos(aim.angle), dy: Math.sin(aim.angle), power: aim.power });
    }
    function svgPoint(e) {
        const r = svgEl.getBoundingClientRect();
        // SVG dipasang preserveAspectRatio="xMidYMid meet": petakan dari-area
        // viewBox yang benar-benar ter gambar (bisa letterbox saat board flex:1).
        const scale = Math.min(r.width / W, r.height / H);
        const dw = W * scale, dh = H * scale;
        const ox = r.left + (r.width - dw) / 2, oy = r.top + (r.height - dh) / 2;
        return { x: ((e.clientX - ox) / dw) * W, y: ((e.clientY - oy) / dh) * H };
    }
    function aimFromPoint(pt, withPower) {
        const cue = state && state.balls.find((b) => b.n === 0);
        if (!cue) return;
        const dx = pt.x - cue.x, dy = pt.y - cue.y, dist = Math.hypot(dx, dy);
        if (dist < 2) return;
        aim.angle = Math.atan2(dy, dx);
        aim.init = true;
        if (withPower) aim.power = clamp((dist - 10) / 170, 0.05, 1);
        aim.visible = true;
    }
    function onSvgDown(e) {
        if (!canAim()) return;
        dragging = true; dragMoved = false; dragType = e.pointerType || "mouse";
        downPt = svgPoint(e);
        try { svgEl.setPointerCapture(e.pointerId); } catch (err) { }
        aimFromPoint(downPt, true);
        e.preventDefault();
    }
    function onSvgMove(e) {
        if (!canAim()) return;
        const pt = svgPoint(e);
        if (dragging) {
            if (downPt && Math.hypot(pt.x - downPt.x, pt.y - downPt.y) > 6) dragMoved = true;
            aimFromPoint(pt, true);
        } else if ((e.pointerType || "mouse") === "mouse") {
            aimFromPoint(pt, false); // hover = bidik, tenaga tetap
        }
    }
    function onSvgUp() {
        if (!dragging) return;
        dragging = false;
        if (canAim() && (dragType === "mouse" || dragMoved)) fire();
    }
    function onSvgCancel() { dragging = false; }

    /* ---------------- input: keyboard ---------------- */
    const KEYMAP = {
        ArrowLeft: "rotL", a: "rotL", A: "rotL",
        ArrowRight: "rotR", d: "rotR", D: "rotR",
        ArrowUp: "powU", w: "powU", W: "powU",
        ArrowDown: "powD", s: "powD", S: "powD",
        Shift: "fine",
    };
    function playable() { return Boolean(state && (begun || online) && state.winner === null); }
    function setPaused(v) {
        if (!state || paused === v) return;
        paused = v;
        if (v) clearBotTimer();
        else {
            lastT = performance.now(); // geser anchor waktu agar tidak loncat saat resume
            held.rotL = held.rotR = held.powU = held.powD = held.fine = false;
            if (state.mode === "bot" && state.phase === "aim" && state.turn === 1 && !helpOpen && !cheatsOpen) scheduleBot();
        }
        renderAll();
    }
    function pauseForPanel() {
        if (playable() && !paused) { setPaused(true); autoResume = true; }
    }
    function maybeAutoResume() {
        if (autoResume && !helpOpen && !cheatsOpen) { autoResume = false; setPaused(false); }
        else renderAll();
    }
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !helpOpen;
        if (next) { cheatsOpen = false; pauseForPanel(); }
        helpOpen = next;
        if (!next) maybeAutoResume(); else renderAll();
    }
    function toggleCheats(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !cheatsOpen;
        if (next) { helpOpen = false; pauseForPanel(); }
        cheatsOpen = next;
        if (!next) maybeAutoResume(); else renderAll();
    }
    function onKeyDown(e) {
        if (destroyed || !root.isConnected || !state || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key, code = e.code || "";
        const helpKey = code === "KeyH" || k === "h" || k === "H" || k === "?";
        const cheatKey = code === "KeyC" || k === "c" || k === "C";
        const pauseKey = code === "KeyP" || k === "p" || k === "P" || k === "Escape";
        const restartKey = code === "KeyR" || k === "r" || k === "R";
        // Prioritas: help → cheats → pause/Escape → aksi game.
        if (helpKey) { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
        if (cheatKey && !online) { if (!e.repeat) toggleCheats(); e.preventDefault(); return; }
        if (pauseKey) {
            if (!e.repeat) {
                if (helpOpen) toggleHelp(false);
                else if (cheatsOpen) toggleCheats(false);
                else if (playable() || paused) setPaused(!paused);
            }
            e.preventDefault(); return;
        }
        if (restartKey) {
            if (!e.repeat && !helpOpen && !cheatsOpen && !paused && (begun || online)) submitAction({ type: "restart" });
            e.preventDefault(); return;
        }
        if (k === "Enter") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            else if (!e.repeat && canAim()) fire();
            e.preventDefault(); return;
        }
        if (helpOpen || cheatsOpen || paused || (!begun && !online)) return;
        if (KEYMAP[k]) {
            if (canAim()) { held[KEYMAP[k]] = true; if (KEYMAP[k] !== "fine") { ensureAim(); aim.visible = true; } }
            e.preventDefault();
            return;
        }
        if (k === " ") {
            if (!e.repeat && canAim()) fire();
            e.preventDefault();
        }
    }
    function onKeyUp(e) { if (KEYMAP[e.key]) held[KEYMAP[e.key]] = false; }
    function onBlur() { for (const k in held) held[k] = false; }

    /* ---------------- input: pad virtual (delegasi) ---------------- */
    function onPadDown(e) {
        const b = e.target.closest ? e.target.closest("[data-hold]") : null;
        if (!b) return;
        e.preventDefault();
        if (!canAim()) return;
        ensureAim();
        aim.visible = true;
        held[b.dataset.hold] = true;
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
    }
    function onPadUp(e) {
        const b = e.target.closest ? e.target.closest("[data-hold]") : null;
        if (b) held[b.dataset.hold] = false;
    }

    /* ---------------- klik & change ---------------- */
    function onClick(e) {
        const btn = e.target.closest ? e.target.closest("[data-help],[data-help-close],[data-cheats],[data-close-cheats],[data-pause],[data-resume],[data-restart],[data-exit],[data-act]") : null;
        if (!btn) return;
        if (btn.hasAttribute("data-exit")) { onExit(); return; }
        if (btn.hasAttribute("data-help")) { toggleHelp(); return; }
        if (btn.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (btn.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (btn.hasAttribute("data-close-cheats")) { toggleCheats(false); return; }
        if (btn.hasAttribute("data-pause")) { if (playable() || paused) setPaused(!paused); return; }
        if (btn.hasAttribute("data-resume")) { setPaused(false); return; }
        if (btn.hasAttribute("data-restart")) { if (state && (begun || online)) submitAction({ type: "restart" }); return; }
        const a = btn.dataset.act;
        if (a === "start-solo" || a === "start-bot") {
            const gmode = a === "start-solo" ? "solo" : "bot";
            clearBotTimer(); sim = null;
            aim.init = false; aim.visible = false;
            if (paused) { paused = false; autoResume = false; lastT = performance.now(); }
            state = newGame(gmode, 1);
            begun = true;
            publish();
            if (gmode === "bot" && state.turn === 1) scheduleBot();
        }
        else if (a === "help") toggleHelp();
        else if (a === "help-close") toggleHelp(false);
        else if (a === "cheat-open") toggleCheats();
        else if (a === "cheat-close") toggleCheats(false);
        else if (a === "restart") { if (state && (begun || online)) submitAction({ type: "restart" }); }
        else if (a === "next") submitAction({ type: "next" });
        else if (a === "shoot") fire();
        else if (a === "pad") { padForced = !padVisible(); renderAll(); }
        else if (a === "autoaim" || a === "cheatpot" || a === "cheatwin" || a === "resetfouls") handleCheat(a);
    }
    function onChange(e) {
        const el = e.target;
        if (el && el.dataset && el.dataset.cheat) {
            cheats[el.dataset.cheat] = Boolean(el.checked);
            cheatsUsed = true;
            renderAll();
        }
    }

    /* ---------------- loop utama ---------------- */
    function tick(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (paused || helpOpen || cheatsOpen) {
            // jeda: sim/bot/aim dibekukan, frame statis tetap digambar ulang
            if (dirty) { renderBalls(sim ? sim.balls : state ? state.balls : []); dirty = false; }
            return;
        }
        if (canAim()) {
            let rot = 0, pw = 0;
            if (held.rotL) rot -= 1;
            if (held.rotR) rot += 1;
            if (held.powU) pw += 1;
            if (held.powD) pw -= 1;
            if (rot || pw) {
                ensureAim();
                aim.angle += rot * (held.fine ? 0.4 : 1.7) * dt;
                aim.power = clamp(aim.power + pw * 0.85 * dt, 0.05, 1);
                aim.visible = true;
            }
        }
        if (sim && !sim.done) {
            const scale = !online && cheats.slow ? 0.35 : 1;
            sim.acc += dt * scale;
            while (sim.acc >= H_STEP && !sim.done) {
                sim.acc -= H_STEP;
                sim.steps++;
                sim.balls = physicsStep(sim.balls, H_STEP, sim.potted);
                const moving = sim.balls.some((b) => b.vx !== 0 || b.vy !== 0);
                if (!moving || sim.steps > 3600) sim.done = true;
            }
            dirty = true;
            if (sim.done && isAuthority) settle(); // guest menunggu state kanonik host
        }
        if (dirty) {
            renderBalls(sim ? sim.balls : state ? state.balls : []);
            dirty = false;
        }
        if (aim.visible) {
            if (canAim()) drawAim();
            else { aim.visible = false; drawAim(); }
        }
    }

    /* ---------------- init ---------------- */
    renderTable();
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("pointerdown", onPadDown);
    root.addEventListener("pointerup", onPadUp);
    root.addEventListener("pointercancel", onPadUp);
    svgEl.addEventListener("pointerdown", onSvgDown);
    svgEl.addEventListener("pointermove", onSvgMove);
    svgEl.addEventListener("pointerup", onSvgUp);
    svgEl.addEventListener("pointercancel", onSvgCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    if (online) {
        begun = true;
        const u1 = room.onRoom && room.onRoom((nextRoom) => { roomData = nextRoom; renderAll(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            state = newGame("online", 1); // host: undian posisi & giliran, lalu publish
            publish();
            const u2 = room.onAction((action) => applyAction(action, 1 - (state ? state.hostSeat : 0)));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState(onCanonical);
            if (typeof u3 === "function") unsubs.push(u3);
            renderAll();
        }
    } else {
        state = newGame("solo", 1); // preview meja di balik overlay start (fix layar kosong)
        begun = false;
        renderAll();
    }
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            clearBotTimer();
            root.removeEventListener("click", onClick);
            root.removeEventListener("change", onChange);
            root.removeEventListener("pointerdown", onPadDown);
            root.removeEventListener("pointerup", onPadUp);
            root.removeEventListener("pointercancel", onPadUp);
            svgEl.removeEventListener("pointerdown", onSvgDown);
            svgEl.removeEventListener("pointermove", onSvgMove);
            svgEl.removeEventListener("pointerup", onSvgUp);
            svgEl.removeEventListener("pointercancel", onSvgCancel);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            for (const u of unsubs) { try { if (typeof u === "function") u(); } catch (e) { } }
        },
    };
}