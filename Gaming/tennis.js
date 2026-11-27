/* ==== GAME: tennis.js ==== */
/*
  Tenis top-down minimalis - sesuai template META + mount().
  Setelah menambah/mengubah file ini jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "tennis", // harus sama dengan nama file (tanpa .js)
    name: "Tennis",
    category: "sports",
    catLabel: "Sports",
    desc: "Tenis top-down minimalis: atur posisi, timing ayunan, charge servis di zona hijau, dan menangkan set melawan bot atau teman online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="10" width="36" height="28" rx="2" fill="#166534"/><rect x="12" y="16" width="24" height="16" fill="none" stroke="#fff" stroke-width="2"/><line x1="24" y1="16" x2="24" y2="32" stroke="#fff" stroke-width="2"/><line x1="6" y1="24" x2="12" y2="24" stroke="#fff" stroke-width="2"/><line x1="36" y1="24" x2="42" y2="24" stroke="#fff" stroke-width="2"/><rect x="4" y="21" width="40" height="6" rx="2" fill="#e2e8f0" stroke="#94a3b8"/><circle cx="35" cy="12" r="4.5" fill="#fde047" stroke="#a16207"/></svg>',
    bg: ["#166534", "#14532d"],
    bestKey: "tennisBestLevel",
};

/* =============================================================
   PURE LOGIC (diekspos lewat __test untuk unit test)
   ============================================================= */
const C = { W: 600, H: 800, x0: 100, x1: 500, y0: 50, y1: 750, netY: 400, netH: 24, srvY0: 190, srvY1: 610, cx: 300 };
const G = 700;
const PT = ["0", "15", "30", "40"];
const REACH = 46, CPU_REACH = 42, PSPEED = 165;
const SWING_T = 0.24, TOSS_T = 0.3, CHARGE_TIME = 0.95;
const SWEET = [0.45, 0.85];
const SURFACES = [
    { id: "hard", label: "Hard", rest: 0.62, fric: 0.94, court: "#5b9e7d", apron: "#4b8a6c" },
    { id: "clay", label: "Clay", rest: 0.70, fric: 0.90, court: "#c98a5e", apron: "#b3744c" },
    { id: "grass", label: "Grass", rest: 0.55, fric: 0.97, court: "#63a86e", apron: "#52945d" },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Integrasi balistik eksak + waktu pantul eksak di dalam step.
   Ini memperbaiki drift Euler lama sehingga bola mendarat TEPAT di target
   (servis tidak lagi "selalu jauh dan out"). */
function stepBall(b, dt, surf) {
    const rest = surf ? surf.rest : 0.62, fric = surf ? surf.fric : 0.96;
    const px = b.x, py = b.y, pz = b.z;
    let vx = b.vx, vy = b.vy, vz = b.vz;
    let x, y, z, bounced = false, bx = 0, by = 0;
    const disc = vz * vz + 2 * G * pz;
    let tHit = -1;
    if (disc >= 0) {
        const th = (vz + Math.sqrt(disc)) / G;
        if (th > 0 && th <= dt && (pz > 0 || vz < 0)) tHit = th;
    }
    if (tHit >= 0) {
        x = px + vx * tHit; y = py + vy * tHit; bx = x; by = y;
        const vzh = vz - G * tHit;
        vz = -vzh * rest; vx *= fric; vy *= fric;
        const r = dt - tHit;
        x += vx * r; y += vy * r;
        z = Math.max(0, vz * r - 0.5 * G * r * r);
        vz -= G * r;
        bounced = true;
    } else {
        x = px + vx * dt; y = py + vy * dt;
        z = pz + vz * dt - 0.5 * G * dt * dt;
        vz -= G * dt;
        if (z < 0) { z = 0; vz = 0; bounced = true; bx = x; by = y; }
    }
    let netHit = false, crossed = false;
    if (py !== y && (py - C.netY) * (y - C.netY) <= 0) {
        crossed = true;
        const t = Math.abs(py - C.netY) / Math.abs(y - py);
        if (pz + (z - pz) * t < C.netH) netHit = true;
    }
    return { b: { x, y, z, vx, vy, vz }, bounced, netHit, crossed, bx, by };
}

function landPos(b) {
    if (b.z <= 0 && b.vz <= 0) return { x: b.x, y: b.y, t: 0 };
    const disc = b.vz * b.vz + 2 * G * b.z;
    const t = (b.vz + Math.sqrt(Math.max(0, disc))) / G;
    return { x: b.x + b.vx * t, y: b.y + b.vy * t, t };
}

function flightTo(x, y, z, tx, ty, T) {
    return { x, y, z, vx: (tx - x) / T, vy: (ty - y) / T, vz: 0.5 * G * T - z / T };
}

function zAtNet(f) {
    if (f.vy === 0) return 999;
    const t = Math.abs(f.y - C.netY) / Math.abs(f.vy);
    return f.z + f.vz * t - 0.5 * G * t * t;
}

/* Naikkan waktu terbang sampai bola pasti melewati net (untuk lob/drop/servis). */
function ensureClear(f, tx, ty) {
    let T = f.vy !== 0 ? Math.abs((ty - f.y) / f.vy) : 1;
    for (let i = 0; i < 10; i++) {
        if (zAtNet(f) >= C.netH + 6) break;
        T += 0.06;
        f = flightTo(f.x, f.y, f.z, tx, ty, T);
    }
    return f;
}

/* Variasi pukulan: drive / smash / lob / drop (animasi mengikuti kind ini). */
function hitBall(x, y, z, side, aimX, q, kind) {
    const a = clamp(aimX, -1.35, 1.35);
    const tx = C.cx + a * (C.x1 - C.cx - 22);
    let T, ty;
    if (kind === "smash") { T = 0.72; ty = side === 0 ? 120 : 680; }
    else if (kind === "lob") { T = 1.6; ty = side === 0 ? 95 : 705; }
    else if (kind === "drop") { T = 1.05; ty = side === 0 ? C.netY - 58 : C.netY + 58; }
    else { T = 1.35 - 0.45 * q; ty = side === 0 ? 300 - 190 * q : 500 + 190 * q; }
    let f = flightTo(x, y, z, tx, ty, T);
    if (kind === "lob" || kind === "drop") f = ensureClear(f, tx, ty);
    return f;
}

/* Target servis di dalam kotak servis yang benar (dekat net, bukan belakang baseline). */
function serveTarget(server, p, aimX, boxLeft) {
    const bx0 = boxLeft ? C.x0 : C.cx, bx1 = boxLeft ? C.cx : C.x1;
    const cxb = (bx0 + bx1) / 2, half = (bx1 - bx0) / 2;
    const depth = 0.26 + clamp(p, 0, 1) * 0.8;
    const netEdge = server === 0 ? C.netY - 10 : C.netY + 10;
    const lineY = server === 0 ? C.srvY0 : C.srvY1;
    return { x: cxb + clamp(aimX, -1, 1) * (half - 16), y: netEdge + (lineY - netEdge) * depth };
}

function serveBall(server, p, aimX, boxLeft, noiseX) {
    const sx = C.cx + (boxLeft ? 26 : -26);
    const sy = server === 0 ? C.y1 - 30 : C.y0 + 30;
    const t = serveTarget(server, p, aimX, boxLeft);
    const tx = t.x + (noiseX || 0), ty = t.y;
    const T = 1.02 - 0.34 * clamp(p, 0, 1);
    return ensureClear(flightTo(sx, sy, 30, tx, ty, T), tx, ty);
}

function isIn(x, y) {
    if (x < C.x0 || x > C.x1 || y < C.y0 || y > C.y1) return false;
    return Math.abs(y - C.netY) > 8;
}

function inServiceBox(x, y, recvSide, boxLeft) {
    const bx0 = boxLeft ? C.x0 : C.cx, bx1 = boxLeft ? C.cx : C.x1;
    if (x < bx0 || x > bx1) return false;
    return recvSide === 1 ? (y >= C.srvY0 && y <= C.netY - 6) : (y >= C.netY + 6 && y <= C.srvY1);
}

function sideOf(y) { return y < C.netY ? 1 : 0; }

/* Skor tenis: poin -> game -> set. target game (default 4), win by 2, sudden death di target..target. */
function scorePoint(g, w, target) {
    const tg = target || 4;
    const pts = g.pts.slice(), games = g.games.slice();
    pts[w]++;
    let ev = "point";
    if (pts[w] >= 4 && pts[w] - pts[1 - w] >= 2) { games[w]++; pts[0] = pts[1] = 0; ev = "game"; }
    let setWin = -1;
    if (ev === "game") {
        if ((games[w] >= tg && games[w] - games[1 - w] >= 2) || games[w] === tg + 1) setWin = w;
    }
    const server = ev === "game" ? 1 - g.server : g.server;
    return { g: { pts, games, server }, ev, setWin };
}

function pointLabel(pts) {
    const a = pts[0], b = pts[1];
    let la = PT[Math.min(a, 3)], lb = PT[Math.min(b, 3)];
    if (a >= 3 && b >= 3) {
        if (a === b) { la = "40"; lb = "40"; }
        else if (a > b) { la = "A"; lb = "40"; }
        else { la = "40"; lb = "A"; }
    }
    return [la, lb];
}

/* Generator level acak yang DIJAMIN bisa diselesaikan:
   kecepatan bot < kecepatan pemain, error & reaksi bot punya batas bawah. */
function levelBeatable(L) {
    return L.speed < PSPEED * 0.98 && L.error >= 0.06 && L.reaction >= 0.1 && L.serveErr >= 0.04 && L.target <= 5;
}

function generateLevel(num, seed) {
    let s = seed >>> 0;
    for (let i = 0; i < 8; i++) {
        const r = rng(s);
        const d = Math.min(num, 12);
        const surf = SURFACES[Math.floor(r() * SURFACES.length)];
        const speed = clamp(118 + d * 4.5 + r() * 12, 118, 160);
        const reaction = clamp(0.34 - d * 0.015 + r() * 0.05, 0.12, 0.38);
        const error = clamp(0.24 - d * 0.013 + r() * 0.04, 0.07, 0.26);
        const aggr = clamp(0.25 + d * 0.04 + r() * 0.25, 0.2, 0.85);
        const lob = r() * 0.3, drop = r() * 0.25;
        const serveErr = clamp(0.14 - d * 0.008 + r() * 0.05, 0.05, 0.16);
        let style = "Baseliner";
        if (aggr > 0.6) style = "Net Rusher";
        else if (lob > 0.2) style = "Moonballer";
        else if (error < 0.12) style = "Counterpuncher";
        const L = { num, seed: s, surf, speed, reaction, error, aggr, lob, drop, serveErr, style, target: 4 };
        if (levelBeatable(L)) return L;
        s = (s + 0x9e3779b9) >>> 0;
    }
    return { num, seed: s, surf: SURFACES[0], speed: 118, reaction: 0.35, error: 0.24, aggr: 0.3, lob: 0.1, drop: 0.1, serveErr: 0.14, style: "Baseliner", target: 4 };
}

export const __test = { C, G, PT, REACH, PSPEED, SWEET, rng, stepBall, landPos, flightTo, hitBall, serveTarget, serveBall, isIn, inServiceBox, sideOf, scorePoint, pointLabel, generateLevel, levelBeatable };

/* =============================================================
   MOUNT
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const myIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const unsubs = [];

    /* ---------- shell ---------- */
    root.innerHTML = `
<style>
.tn-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--paper:#ffffff;--acc:#2563eb;--good:#16a34a;--bad:#dc2626;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);width:100%}
.tn-app [hidden]{display:none!important}
.tn-app *{box-sizing:border-box}
.tn-app .tn-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.tn-app .tn-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;min-height:32px;font-size:12px;color:var(--mut);letter-spacing:.02em}
.tn-app .tn-chip b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:700}
.tn-app .tn-score .tn-num{font-size:16px}
.tn-app .tn-dot{width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block;flex:none}
.tn-app .tn-spacer{flex:1 1 8px}
.tn-app .tn-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:6px 10px;min-height:34px;font-size:11px;font-weight:600;cursor:pointer;transition:background .16s,border-color .16s}
.tn-app .tn-btn svg{flex:none;display:block}
.tn-app .tn-btn:hover{background:#f8fafc;border-color:#94a3b8}
.tn-app .tn-btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.tn-app .tn-btn[aria-pressed="true"],.tn-app .tn-btn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.tn-app .tn-btn:disabled{opacity:.45;cursor:not-allowed}
.tn-app .tn-btn-label{white-space:nowrap}
.tn-app.game-fill>.tn-panel[data-board]{display:flex;align-items:center;justify-content:center;position:relative;padding:0;min-height:0;border:1px solid var(--line);border-radius:10px;background:#eef2f6;overflow:hidden}
.tn-app .tn-court{display:block;height:100%;width:auto;max-width:100%;aspect-ratio:600/800;border-radius:9px;touch-action:none;cursor:crosshair;background:#eef2f6}
.tn-app .tn-banner{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);background:rgba(15,23,42,.92);color:#fff;font-weight:700;font-size:16px;padding:8px 12px;border-radius:9px;opacity:0;pointer-events:none;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;z-index:4}
.tn-app .tn-banner.good{background:rgba(22,163,74,.94)}
.tn-app .tn-banner.bad{background:rgba(220,38,38,.92)}
.tn-app .tn-banner.show{animation:tn-pop 1.15s ease forwards}
@keyframes tn-pop{0%{opacity:0;transform:translate(-50%,-40%)}15%{opacity:1;transform:translate(-50%,-50%)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-62%)}}
.tn-app .tn-toast{position:absolute;left:50%;top:8px;transform:translateX(-50%);background:#fff;border:1px solid var(--line);color:var(--ink);font-size:12px;font-weight:600;padding:6px 12px;border-radius:9px;opacity:0;pointer-events:none;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;z-index:4}
.tn-app .tn-toast.show{animation:tn-toast 2.6s ease forwards}
@keyframes tn-toast{0%{opacity:0;transform:translate(-50%,-6px)}12%{opacity:1;transform:translate(-50%,0)}82%{opacity:1}100%{opacity:0}}
.tn-app .tn-power{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:80%;max-width:100%;background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:10px;padding:8px 12px;z-index:3}
.tn-app .tn-power-top{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:600;color:var(--mut);margin-bottom:4px}
.tn-app .tn-power-bar{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#e2e8f0 0 45%,#bbf7d0 45% 85%,#fecaca 85% 100%)}
.tn-app .tn-power-mark{position:absolute;top:-3px;width:3px;height:16px;border-radius:2px;background:var(--ink);transform:translateX(-50%)}
.tn-app .tn-power-hint{font-size:10.5px;color:var(--mut);margin-top:4px;text-align:center;line-height:1.4}
.tn-app .tn-ov{position:absolute;inset:0;display:grid;place-items:center;padding:12px;background:rgba(248,250,252,.86);backdrop-filter:blur(4px);border-radius:10px;z-index:5}
.tn-app .tn-card{display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;width:min(88%,380px);max-height:100%;text-align:center}
.tn-app .tn-card h3{margin:0 0 8px;font-size:19px}
.tn-app .tn-card p{margin:0 0 12px;font-size:13px;color:var(--mut);line-height:1.5}
.tn-app .tn-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;text-align:left}
.tn-app .tn-head h3{margin:0;font-size:17px}
.tn-app .tn-foot{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;margin-top:12px;text-align:center}
.tn-app .tn-card .tn-btn{display:inline-block;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:9px;padding:8px 16px;min-height:44px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .16s}
.tn-app .tn-card .tn-btn.ghost{background:#fff;color:var(--ink);border-color:var(--line)}
.tn-app .tn-card .tn-btn:hover{opacity:.9}
.tn-app .tn-help,.tn-app .tn-cheats{flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
.tn-app .tn-help{padding-right:4px;width:100%}
.tn-app .tn-help h4{margin:12px 0 4px;font-size:13px}
.tn-app .tn-help h4:first-child{margin-top:4px}
.tn-app .tn-help ul{margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.55}
.tn-app kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;background:#f8fafc;font-family:inherit}
.tn-app .tn-cheats{padding:0 2px}
.tn-app .tn-cheats label{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:36px;font-size:12.5px;padding:4px 0;color:#334155;cursor:pointer;border-top:1px solid var(--line)}
.tn-app .tn-cheats input{accent-color:var(--acc);flex:none}
.tn-app .tn-cheat-acts{display:flex;flex-wrap:wrap;gap:4px}
.tn-app .tn-mini{border:1px solid var(--line);background:#f8fafc;border-radius:8px;padding:6px 10px;min-height:36px;font-size:11px;font-weight:600;cursor:pointer;color:var(--ink)}
.tn-app .tn-vpad{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;width:min(100%,470px);margin:8px auto 0;user-select:none;-webkit-user-select:none}
.tn-app .tn-dpad{display:grid;grid-template-areas:". u ." "l . r" ". d .";gap:8px}
.tn-app .tn-db{width:48px;height:48px;border-radius:10px;border:1px solid var(--line);background:#fff;font-size:16px;color:var(--ink);touch-action:none;cursor:pointer}
.tn-app .tn-db:active{background:#f1f5f9}
.tn-app .tn-swing{width:84px;height:84px;border-radius:50%;border:none;background:var(--ink);color:#fff;font-weight:800;font-size:13px;letter-spacing:.06em;touch-action:none;cursor:pointer}
.tn-app .tn-swing:active{transform:scale(.96)}
.tn-app .tn-good{color:var(--good)}
.tn-app .tn-bad{color:var(--bad)}
@media (max-width:560px){
  .tn-app .tn-banner{font-size:14px}
  .tn-app .tn-card{padding:12px}
  .tn-app .tn-power{width:80%}
}
@media (pointer:coarse){.tn-app button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.tn-app *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
/* --- layout redesign overrides (keep last) --- */
@media (max-width:640px){
  .tn-app .tn-hud{gap:5px 6px;margin-bottom:6px}
  .tn-app .tn-hud .tn-chip{padding:4px 6px;font-size:9px;min-height:28px}
  .tn-app .tn-hud .tn-chip[data-low]{display:none}
  .tn-app .tn-hud .tn-btn{min-height:32px;padding:5px 9px;font-size:9px;border-radius:8px}
  .tn-app .tn-hud .tn-btn-label,.tn-app .tn-hud .tn-spacer{display:none}
  .tn-app.game-fill>.tn-panel[data-board]{flex:0 0 auto;min-height:min(70dvh,620px)}
  .tn-app .tn-ov{padding:8px}
  .tn-app .tn-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .tn-app .tn-help,.tn-app .tn-cheats{scrollbar-width:none}
  .tn-app .tn-help::-webkit-scrollbar,.tn-app .tn-cheats::-webkit-scrollbar{display:none}
  .tn-app .tn-foot{margin-top:8px}
  .tn-app .tn-mini{min-height:32px;padding:4px 8px}
}
</style>
<div class="game-app tn-app game-fill" data-tn>
  <div class="tn-hud">
    <span class="tn-chip tn-status"><i class="tn-dot"></i><b data-status>Siap</b></span>
    <span class="tn-chip tn-score"><i class="tn-dot" data-srv-you hidden></i><b data-name-you>Kamu</b> <b class="tn-num" data-pts-you>0</b><span>&middot;</span><b class="tn-num" data-pts-opp>0</b> <b data-name-opp>CPU</b><i class="tn-dot" data-srv-opp hidden></i></span>
    <span class="tn-chip">Game <b data-games>0-0</b></span>
    <span class="tn-chip" data-state-chip hidden></span>
    <span class="tn-chip" data-low data-level-chip></span>
    <span class="tn-chip" data-cheat-chip hidden>CHEAT AKTIF</span>
    <span class="tn-spacer"></span>
    <button class="tn-btn" type="button" data-help aria-label="Cara bermain" title="Cara bermain (H)">${iconSVG("helpCircle", { size: 14 })}<span class="tn-btn-label">Bantuan</span></button>
    <button class="tn-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="tn-btn-label">Cheat</span></button>
    <button class="tn-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P)">${iconSVG("pause", { size: 14 })}<span class="tn-btn-label">Jeda</span></button>
    <button class="tn-btn" type="button" data-restart aria-label="Ulangi pertandingan" title="Ulangi (R)">${iconSVG("refresh", { size: 14 })}<span class="tn-btn-label">Ulang</span></button>
    <button class="tn-btn" type="button" data-padtoggle aria-pressed="false" aria-label="Tampilkan tombol sentuh" title="Tombol sentuh">${iconSVG("smartphone", { size: 14 })}<span class="tn-btn-label">Pad</span></button>
    <button class="tn-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">${iconSVG("logOut", { size: 14 })}<span class="tn-btn-label">Keluar</span></button>
  </div>
  <section class="game-panel tn-panel" data-board>
    <svg class="tn-court" data-court viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lapangan tenis">
      <g data-world><g data-static></g><g data-net></g><g data-dyn></g></g>
    </svg>
    <div class="tn-banner" data-banner aria-live="polite"></div>
    <div class="tn-toast" data-toast></div>
    <div class="tn-power" data-power hidden>
      <div class="tn-power-top"><span>Power servis</span><span data-power-pct>0%</span></div>
      <div class="tn-power-bar"><i class="tn-power-mark" data-power-mark style="left:0%"></i></div>
      <div class="tn-power-hint">Tahan untuk charge &middot; lepas di zona hijau &middot; &larr;/&rarr; untuk arah</div>
    </div>
    <div class="tn-ov" data-ov-start>
      <div class="tn-card">
        <div class="tn-head"><h3>Tennis</h3></div>
        <p data-start-info></p>
        <p data-start-best style="font-size:12px"></p>
        <div class="tn-foot"><button class="tn-btn" type="button" data-start>Mulai pertandingan</button><button class="tn-btn ghost" type="button" data-help>Cara bermain</button></div>
      </div>
    </div>
    <div class="tn-ov" data-ov-help hidden>
      <div class="tn-card">
        <div class="tn-head"><h3>Cara bermain</h3><button class="tn-btn" type="button" data-help-close aria-label="Tutup">Tutup</button></div>
        <div class="tn-help">
          <h4>Tujuan</h4>
          <ul><li>Poin &rarr; game &rarr; set. Skor 0/15/30/40, deuce &amp; advantage.</li>
          <li>Pertama ke 4 game (selisih 2, sudden death di 4-4) memenangkan set.</li></ul>
          <h4>Gerak</h4>
          <ul><li>Desktop: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / panah, atau tahan &amp; geser mouse di lapangan.</li>
          <li>Mobile: D-pad virtual, atau tahan &amp; geser jari di lapangan.</li></ul>
          <h4>Memukul</h4>
          <ul><li><kbd>Space</kbd> / klik-lepas / tombol SWING. Bola harus dalam jangkauan &amp; di sisimu.</li>
          <li>Tinggi kontak = power: kontak tinggi = smash, kontak rendah = lob otomatis.</li>
          <li>Tahan &uarr; saat memukul = lob, &darr; = drop shot.</li>
          <li>Arah dari posisi kontak: bola di kanan badan &rarr; ke kiri, dan sebaliknya.</li></ul>
          <h4>Servis</h4>
          <ul><li>Tahan <kbd>Space</kbd>/SWING/sentuhan untuk charge, lepas di zona hijau (45-85%).</li>
          <li>&larr;/&rarr; atau geser jari untuk menempatkan bola. Power &gt;92% = fault panjang.</li>
          <li>Dua fault = double fault. Kotak servis bergantian tiap poin.</li></ul>
          <h4>Level &amp; online</h4>
          <ul><li>Tiap set menang &rarr; level baru acak (permukaan &amp; gaya bot) yang dijamin bisa diselesaikan.</li>
          <li>Online: posisi (atas/bawah) &amp; servis pertama diundi acak; tampilan diputar agar kamu selalu di bawah.</li>
          <li>Cheat hanya tersedia offline.</li>
          <li>Tombol: <kbd>H</kbd> bantuan, <kbd>C</kbd> cheat, <kbd>P</kbd> jeda, <kbd>R</kbd> ulang, <kbd>Esc</kbd> tutup.</li></ul>
        </div>
        <div class="tn-foot"><button class="tn-btn" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>
    <div class="tn-ov" data-ov-over hidden>
      <div class="tn-card">
        <div class="tn-head"><h3 data-over-title></h3></div>
        <p data-over-sub></p>
        <div class="tn-foot">
          <button class="tn-btn" type="button" data-next hidden>Level berikutnya</button>
          <button class="tn-btn ghost" type="button" data-again>Coba lagi</button>
          <button class="tn-btn ghost" type="button" data-reroll hidden>Lawan baru</button>
        </div>
      </div>
    </div>
    <div class="tn-ov" data-ov-pause hidden>
      <div class="tn-card">
        <div class="tn-head"><h3>Dijeda</h3></div>
        <p>Waktu, bot, dan animasi dihentikan. Tekan <kbd>P</kbd> atau lanjutkan untuk bermain.</p>
        <div class="tn-foot"><button class="tn-btn" type="button" data-resume>Lanjutkan</button></div>
      </div>
    </div>
    <div class="tn-ov" data-ov-cheat hidden>
      <div class="tn-card">
        <div class="tn-head"><h3>Cheat</h3><button class="tn-btn" type="button" data-cheats-close aria-label="Tutup">Tutup</button></div>
        <div class="tn-cheats">
          <label>Auto-pukul <input type="checkbox" data-cheat="auto"></label>
          <label>Slow motion <input type="checkbox" data-cheat="slow"></label>
          <label>Jangkauan lebar <input type="checkbox" data-cheat="reach"></label>
          <label>Servis sempurna <input type="checkbox" data-cheat="perfect"></label>
          <label>Lari cepat <input type="checkbox" data-cheat="speed"></label>
          <label>CPU lemah <input type="checkbox" data-cheat="weak"></label>
        </div>
        <div class="tn-foot tn-cheat-acts">
          <button class="tn-mini" type="button" data-cheat-act="point">+Poin</button>
          <button class="tn-mini" type="button" data-cheat-act="game">+Game</button>
          <button class="tn-mini" type="button" data-cheat-act="set">Menang set</button>
          <button class="tn-mini" type="button" data-cheat-act="reroll">Acak lawan</button>
        </div>
      </div>
    </div>
  </section>
  <div class="tn-vpad" data-vpad hidden>
    <div class="tn-dpad">
      <button class="tn-db" type="button" data-vk="up" style="grid-area:u" aria-label="Atas">&#9650;</button>
      <button class="tn-db" type="button" data-vk="left" style="grid-area:l" aria-label="Kiri">&#9664;</button>
      <button class="tn-db" type="button" data-vk="right" style="grid-area:r" aria-label="Kanan">&#9654;</button>
      <button class="tn-db" type="button" data-vk="down" style="grid-area:d" aria-label="Bawah">&#9660;</button>
    </div>
    <button class="tn-swing" type="button" data-vk="swing" aria-label="Ayun / Servis">SWING</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $("[data-court]");
    const worldG = $("[data-world]");
    const staticG = $("[data-static]");
    const netG = $("[data-net]");
    const dynG = $("[data-dyn]");
    const bannerEl = $("[data-banner]");
    const toastEl = $("[data-toast]");
    const statusEl = $("[data-status]");
    const powerEl = $("[data-power]");
    const powerPct = $("[data-power-pct]");
    const powerMark = $("[data-power-mark]");
    const ovStart = $("[data-ov-start]");
    const ovHelp = $("[data-ov-help]");
    const ovOver = $("[data-ov-over]");
    const ovPause = $("[data-ov-pause]");
    const ovCheat = $("[data-ov-cheat]");
    const startInfo = $("[data-start-info]");
    const startBest = $("[data-start-best]");
    const startBtn = $("[data-start]");
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const nextBtn = $("[data-next]");
    const againBtn = $("[data-again]");
    const rerollBtn = $("[data-reroll]");
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const cheatChip = $("[data-cheat-chip]");
    const padEl = $("[data-vpad]");
    const padToggle = $("[data-padtoggle]");
    const stateChip = $("[data-state-chip]");
    const levelChip = $("[data-level-chip]");
    const hud = {
        ptsYou: $("[data-pts-you]"), ptsOpp: $("[data-pts-opp]"),
        nameYou: $("[data-name-you]"), nameOpp: $("[data-name-opp]"),
        games: $("[data-games]"), srvYou: $("[data-srv-you]"), srvOpp: $("[data-srv-opp]"),
    };

    /* ---------- state ---------- */
    let S = null;
    let snapAt = 0, active = true, raf = null, lastT = 0, pubAcc = 0, seq = 0;
    let held = {}, vpad = { up: false, down: false, left: false, right: false };
    let pointer = { down: false, x: 0, y: 0, charging: false };
    let chargingLocal = false, padSwing = false;
    let lastSentDir = { x: 0, y: 0 }, lastDirSend = 0, lastGuestInput = 0, helloSent = false;
    let helpOpen = false, cheatsOpen = false, paused = false, overVisible = false;
    let timeShift = 0, pauseStarted = 0, frozenNow = 0;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("tennisHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("tennisHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const nowMs = () => clock() - timeShift;
    const cheats = { auto: false, slow: false, reach: false, perfect: false, speed: false, weak: false };
    const view = { trail: [], rings: [], sparks: [], netT: 0, squash: 0, msgId: 0, toastId: 0, overTimer: 0, vp: [{ x: 300, y: 660 }, { x: 300, y: 140 }], vb: null, staticKey: "" };
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }
    const rnd = rng((Math.random() * 1e9) | 0);
    const randSeed = () => (Math.random() * 1e9) | 0;

    const mySide = () => (S && S.sides ? S.sides[myIndex] : 0);
    const flip = () => mySide() === 1;
    function nameOfSide(side) {
        if (side === mySide()) return "Kamu";
        if (!online) return "CPU";
        const idx = S.sides.indexOf(side);
        return (S.names && S.names[idx]) || "Lawan";
    }
    const defaultNames = () => (online ? [playerName || "Host", "Lawan"] : ["Kamu", "CPU"]);

    /* ---------- match flow ---------- */
    function makeMatch(levelNum, level, names) {
        const server = rnd() < 0.5 ? 0 : 1;               // undian koin: siapa servis duluan
        const sides = online ? (rnd() < 0.5 ? [0, 1] : [1, 0]) : [0, 1]; // undian posisi multiplayer
        S = {
            v: 1, phase: "serve", levelNum, level, sides, names,
            pts: [0, 0], games: [0, 0], server, serveNum: 1, boxLeft: true,
            ball: null, ballKind: "serve", lastHitter: -1, bounces: 0, serveFlight: false,
            players: [
                { x: C.cx, y: 660, charge: 0, charging: false, swingT: 0, swingDir: 1, shot: "", input: { x: 0, y: 0 } },
                { x: C.cx, y: 140, charge: 0, charging: false, swingT: 0, swingDir: 1, shot: "", input: { x: 0, y: 0 } },
            ],
            plan: null, tossT: 0, waitT: 0, cpuT: 0, cpuWait: 0,
            hits: 0, bestRally: 0, aces: [0, 0], winner: -1, msg: null, toast: null, t: 0,
        };
        placeServe();
        S.toast = { code: "toss", side: server, id: ++seq };
        view.trail.length = 0; view.rings.length = 0; view.sparks.length = 0; view.vb = null;
        forcePub();
    }

    function placeServe() {
        const even = (S.pts[0] + S.pts[1]) % 2 === 0;
        S.boxLeft = S.server === 0 ? even : !even;
        S.phase = "serve"; S.ball = null; S.lastHitter = -1;
        S.bounces = 0; S.serveFlight = false; S.hits = 0; S.plan = null;
        const srv = S.server, recv = 1 - srv;
        const sp = S.players[srv], rp = S.players[recv];
        sp.x = C.cx + (S.boxLeft ? 26 : -26); sp.y = srv === 0 ? C.y1 - 30 : C.y0 + 30;
        rp.x = S.boxLeft ? (C.x0 + C.cx) / 2 : (C.cx + C.x1) / 2; rp.y = recv === 0 ? 690 : 120;
        sp.charge = 0; sp.charging = false; sp.input.x = 0; sp.input.y = 0;
        rp.charge = 0; rp.charging = false; rp.input.x = 0; rp.input.y = 0;
        S.cpuT = (!online && srv === 1) ? 0.9 + rnd() * 0.5 : 0;
        S.cpuWait = 0;
        forcePub();
    }
    function newPoint() { S.serveNum = 1; placeServe(); }

    function banner(code, side) { S.msg = { code, side: side == null ? -1 : side, id: ++seq }; forcePub(); }
    function toastMsg(code, side) { S.toast = { code, side: side == null ? -1 : side, id: ++seq }; forcePub(); }

    function fault() {
        if (S.serveNum === 1) { S.serveNum = 2; banner("fault", S.server); placeServe(); }
        else pointTo(1 - S.server, "doublefault");
    }

    function serveNoise(p) { return p > 0.85 ? (rnd() - 0.5) * 2 * (p - 0.85) * 260 : 0; }

    function startToss(side, p, aim, noiseX) {
        if (S.phase !== "serve" || S.server !== side) return;
        if (!online && side === 0 && cheats.perfect) { p = 0.65; noiseX = 0; }
        S.plan = { p: clamp(p, 0, 1), aim: clamp(aim, -1, 1), noiseX: noiseX || 0 };
        S.phase = "toss"; S.tossT = TOSS_T;
        S.players[side].charging = false;
        forcePub();
    }

    function launchServe() {
        const srv = S.server, pl = S.players[srv];
        S.ball = serveBall(srv, S.plan.p, S.plan.aim, S.boxLeft, S.plan.noiseX);
        S.phase = "rally"; S.serveFlight = true; S.bounces = 0; S.lastHitter = srv; S.hits = 1;
        S.ballKind = "serve";
        pl.swingT = SWING_T; pl.swingDir = 1; pl.shot = "serve"; pl.charge = 0;
        S.cpuWait = 0;
        forcePub();
    }

    function trySwing(side, opts) {
        if (S.phase !== "rally" || !S.ball) return;
        if (S.lastHitter === side) return;
        if (S.serveFlight && S.bounces === 0) return; // receiver wajib membiarkan servis memantul
        const pl = S.players[side];
        const reach = (!online && side === 0 && cheats.reach) ? 84 : (!online && side === 1 ? CPU_REACH : REACH);
        const dx = S.ball.x - pl.x, dy = S.ball.y - pl.y;
        const onSide = side === 0 ? S.ball.y > C.netY - 10 : S.ball.y < C.netY + 10;
        pl.swingT = SWING_T; pl.swingDir = dx >= 0 ? 1 : -1;
        if (dx * dx + dy * dy > reach * reach || S.ball.z > 62 || !onSide) { pl.shot = "whiff"; return; }
        const aim = opts && opts.aim != null ? opts.aim : clamp(dx / 40, -1, 1);
        const mod = opts ? opts.mod : null;
        let kind = "drive";
        if (S.ball.z >= 44) kind = "smash";
        else if (mod === "lob") kind = "lob";
        else if (mod === "drop") kind = "drop";
        else if (S.ball.z < 10) kind = "lob";
        const q = clamp(1.15 - Math.abs(S.ball.z - 26) / 30, 0.2, 1);
        S.ball = hitBall(S.ball.x, S.ball.y, S.ball.z, side, aim, q, kind);
        S.lastHitter = side; S.bounces = 0; S.serveFlight = false; S.hits++;
        S.ballKind = kind; pl.shot = kind;
        if (kind === "smash") { view.sparks.push({ x: S.ball.x, y: S.ball.y, t: 0.3 }); banner("smash", side); }
        else if (kind === "lob") banner("lob", side);
        else if (kind === "drop") banner("drop", side);
        if (!online && side === 0) S.cpuWait = S.level.reaction * (cheats.weak ? 1.6 : 1);
        if (S.hits > 60) { banner("let", -1); newPoint(); return; }
        forcePub();
    }

    function cpuServePlan() {
        const L = S.level, second = S.serveNum === 2;
        const errP = L.serveErr * (cheats.weak ? 1.8 : 1);
        let p = second ? 0.5 + rnd() * 0.15 : 0.5 + rnd() * 0.32;
        let aim = (rnd() - 0.5) * (second ? 0.7 : 1.2);
        let noiseX = 0;
        if (!second && rnd() < errP) {
            if (rnd() < 0.5) p = 0.96 + rnd() * 0.04;
            else noiseX = (rnd() < 0.5 ? -1 : 1) * 125;
        }
        return { p, aim, noiseX };
    }

    function cpuTrySwing() {
        if (S.phase !== "rally" || !S.ball || S.lastHitter !== 0) return;
        if (S.serveFlight && S.bounces === 0) return;
        const pl = S.players[1];
        const dx = S.ball.x - pl.x, dy = S.ball.y - pl.y;
        if (dx * dx + dy * dy > CPU_REACH * CPU_REACH || S.ball.z > 62 || S.ball.y > C.netY + 10) return;
        const L = S.level;
        const err = Math.min(0.5, L.error * (cheats.weak ? 1.9 : 1));
        let aim;
        if (rnd() < err) aim = (1.12 + rnd() * 0.25) * (rnd() < 0.5 ? -1 : 1);
        else aim = (0.35 + rnd() * 0.55) * (S.players[0].x < C.cx ? 1 : -1);
        const q = clamp(0.5 + rnd() * 0.55, 0.25, 1);
        let kind = "drive";
        if (S.ball.z >= 44 && rnd() < L.aggr) kind = "smash";
        else if (S.ball.z < 12 && rnd() < L.lob) kind = "lob";
        else if (rnd() < L.drop && S.ball.y > C.netY - 150) kind = "drop";
        S.ball = hitBall(S.ball.x, S.ball.y, S.ball.z, 1, aim, q, kind);
        S.lastHitter = 1; S.bounces = 0; S.serveFlight = false; S.hits++;
        S.ballKind = kind; pl.swingT = SWING_T; pl.swingDir = dx >= 0 ? 1 : -1; pl.shot = kind;
        if (kind === "smash") banner("smash", 1);
        else if (kind === "lob") banner("lob", 1);
        else if (kind === "drop") banner("drop", 1);
        if (S.hits > 60) { banner("let", -1); newPoint(); return; }
        forcePub();
    }

    function autoSwing() {
        if (S.phase !== "rally" || !S.ball || S.lastHitter !== 1) return;
        if (S.serveFlight && S.bounces === 0) return;
        const pl = S.players[0];
        const dx = S.ball.x - pl.x, dy = S.ball.y - pl.y;
        const reach = cheats.reach ? 84 : REACH;
        if (dx * dx + dy * dy > reach * reach || S.ball.z > 62 || S.ball.y < C.netY - 10) return;
        trySwing(0, { aim: S.players[1].x < C.cx ? 0.8 : -0.8 });
    }

    function onSetWon(w) {
        if (!online && w === 0 && S.levelNum > best) {
            best = S.levelNum;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }

    function pointTo(w, code) {
        S.phase = "point"; S.waitT = 1.15; S.serveFlight = false;
        S.bestRally = Math.max(S.bestRally, S.hits);
        if (code === "ace") S.aces[w]++;
        const res = scorePoint({ pts: S.pts, games: S.games, server: S.server }, w, S.level.target);
        S.pts = res.g.pts; S.games = res.g.games; S.server = res.g.server;
        const loserCodes = { out: 1, net: 1, own: 1, doublefault: 1 };
        banner(code, loserCodes[code] ? 1 - w : w);
        if (res.setWin >= 0) { S.winner = res.setWin; S.phase = "over"; onSetWon(res.setWin); }
        else if (res.ev === "game") banner("game", w);
        forcePub();
    }

    function awardGame(w) {
        S.games[w]++; S.pts = [0, 0]; S.server = 1 - S.server;
        banner("game", w);
        const g = S.games, t = S.level.target;
        if ((g[w] >= t && g[w] - g[1 - w] >= 2) || g[w] === t + 1) { S.winner = w; S.phase = "over"; onSetWon(w); }
        else { S.phase = "point"; S.waitT = 0.6; }
        forcePub();
    }

    function handleBounce(bx, by) {
        const bs = sideOf(by);
        if (S.serveFlight && S.bounces === 0) {
            const recv = 1 - S.server;
            if (bs !== recv || !inServiceBox(bx, by, recv, S.boxLeft)) fault();
            else { S.serveFlight = false; S.bounces = 1; }
        } else if (bs === S.lastHitter) {
            pointTo(1 - S.lastHitter, "own");
        } else if (S.bounces >= 1) {
            pointTo(S.lastHitter, S.hits === 1 ? "ace" : "winner");
        } else {
            if (!isIn(bx, by)) pointTo(1 - S.lastHitter, "out");
            else S.bounces = 1;
        }
    }

    /* ---------- movement ---------- */
    function stepToward(pl, tx, ty, step) {
        const dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy);
        if (d > 2) { const m = Math.min(step, d); pl.x += dx / d * m; pl.y += dy / d * m; }
    }
    function bounds(pl, side) {
        pl.x = clamp(pl.x, C.x0 - 34, C.x1 + 34);
        pl.y = side === 0 ? clamp(pl.y, C.netY + 18, C.y1 + 30) : clamp(pl.y, C.y0 - 30, C.netY - 18);
    }
    function moveHuman(side, dt) {
        if ((S.phase === "serve" || S.phase === "toss") && S.server === side) return;
        const pl = S.players[side];
        let sp = PSPEED;
        if (!online && side === 0 && cheats.speed) sp *= 1.45;
        let dx = pl.input.x, dy = pl.input.y;
        const n = Math.hypot(dx, dy);
        if (n > 0.01) {
            const k = n > 1 ? 1 / n : 1;
            pl.x += dx * k * sp * dt; pl.y += dy * k * sp * dt;
        }
        bounds(pl, side);
    }
    function moveCpu(side, dt) {
        const L = S.level, pl = S.players[1];
        const spd = L.speed * (cheats.weak ? 0.55 : 1);
        if (S.phase === "rally" && S.ball) {
            if (S.lastHitter === 0) {
                if (S.cpuWait > 0) return;
                const lp = landPos(S.ball);
                stepToward(pl, clamp(lp.x, C.x0 - 30, C.x1 + 30), clamp(lp.y - 22, C.y0 - 26, C.netY - 20), spd * dt);
            } else {
                stepToward(pl, C.cx, 120, spd * 0.75 * dt);
            }
        }
        bounds(pl, side);
    }

    /* ---------- sim ---------- */
    function update(dt) {
        S.t += dt;
        const ts = (!online && cheats.slow) ? 0.45 : 1;
        const bdt = dt * ts;
        for (const pl of S.players) pl.swingT = Math.max(0, pl.swingT - dt);
        for (let side = 0; side < 2; side++) {
            if (!online && side === 1) moveCpu(side, dt * ts);
            else moveHuman(side, dt);
        }
        if (S.phase === "serve") {
            const srv = S.server, pl = S.players[srv];
            if (pl.charging) pl.charge = Math.min(1, pl.charge + dt / CHARGE_TIME);
            if (!online && srv === 1) {
                S.cpuT -= dt;
                if (S.cpuT <= 0) { const plan = cpuServePlan(); startToss(1, plan.p, plan.aim, plan.noiseX); }
            }
        } else if (S.phase === "toss") {
            S.tossT -= dt;
            if (S.tossT <= 0) launchServe();
        } else if (S.phase === "rally" && S.ball) {
            if (!online && S.lastHitter === 0) { S.cpuWait = Math.max(0, S.cpuWait - bdt); cpuTrySwing(); }
            if (!online && cheats.auto) autoSwing();
            const st = stepBall(S.ball, bdt, S.level.surf);
            S.ball = st.b;
            if (st.netHit) {
                view.netT = 0.4;
                if (S.serveFlight && S.bounces === 0) fault();
                else pointTo(1 - S.lastHitter, "net");
                return;
            }
            if (st.bounced) {
                view.rings.push({ x: st.bx, y: st.by, t: 0.4 });
                view.squash = 0.12;
                handleBounce(st.bx, st.by);
                if (S.phase !== "rally") return;
            }
            if (S.ball && (S.ball.x < -90 || S.ball.x > C.W + 90 || S.ball.y < -90 || S.ball.y > C.H + 90)) {
                // FIX bug "serve selalu out": bola yang SUDAH memantul in lalu keluar arena
                // adalah winner untuk pemukul, bukan out.
                if (S.bounces >= 1) pointTo(S.lastHitter, S.hits === 1 ? "ace" : "winner");
                else pointTo(1 - S.lastHitter, "out");
                return;
            }
        } else if (S.phase === "point") {
            S.waitT -= dt;
            if (S.waitT <= 0) newPoint();
        }
    }

    /* ---------- actions / networking ---------- */
    function publish() { if (online && isHost && S) room.publishState(S).catch(console.warn); }
    function forcePub() { pubAcc = 1; }

    function applyAction(action, actor) {
        if (!isHost || !S || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        const side = S.sides[actor];
        const pl = S.players[side];
        switch (action.t) {
            case "hello":
                if (actor === 1 && typeof action.name === "string") { S.names[1] = action.name.slice(0, 20) || "Lawan"; forcePub(); }
                break;
            case "input": {
                pl.input.x = clamp(Number(action.dx) || 0, -1, 1);
                pl.input.y = clamp(Number(action.dy) || 0, -1, 1);
                if (actor === 1) lastGuestInput = nowMs();
                break;
            }
            case "swing":
                if (S.phase === "rally") trySwing(side, { mod: action.mod === "lob" ? "lob" : action.mod === "drop" ? "drop" : null });
                break;
            case "charge":
                if (S.phase === "serve" && S.server === side) { pl.charging = true; pl.charge = 0; forcePub(); }
                break;
            case "release":
                if (S.phase === "serve" && S.server === side && pl.charging) {
                    startToss(side, pl.charge, clamp(Number(action.aim) || 0, -1, 1), serveNoise(pl.charge));
                }
                break;
            case "rematch":
                if (S.phase === "over" || S.phase === "idle") makeMatch(S.levelNum, S.level, S.names);
                break;
        }
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, myIndex);
    }

    /* ---------- input ---------- */
    function currentMod() {
        if (held.ArrowUp || held.KeyW || vpad.up) return "lob";
        if (held.ArrowDown || held.KeyS || vpad.down) return "drop";
        return null;
    }
    function keyAim() {
        const v = (held.ArrowRight || held.KeyD || vpad.right ? 0.7 : 0) + (held.ArrowLeft || held.KeyA || vpad.left ? -0.7 : 0);
        return flip() ? -v : v;
    }
    function pointerAim() {
        if (!S) return 0;
        return clamp((pointer.x - S.players[mySide()].x) / 120, -1, 1);
    }
    function currentAimPreview() { return pointer.charging ? pointerAim() : keyAim(); }
    function currentCharge() {
        if (!S) return 0;
        const pl = S.players[mySide()];
        if (!online && cheats.perfect && S.server === mySide()) return 0.65;
        if (isHost) return pl.charge;
        const el = Math.min(0.3, (nowMs() - snapAt) / 1000);
        return chargingLocal ? clamp(pl.charge + el / CHARGE_TIME, 0, 1) : pl.charge;
    }
    function pressAction() {
        if (!S) return;
        if (S.phase === "serve" && S.server === mySide()) { chargingLocal = true; submitAction({ t: "charge" }); }
        else submitAction({ t: "swing", mod: currentMod() });
    }
    function releaseAction() {
        if (chargingLocal) {
            chargingLocal = false;
            submitAction({ t: "release", aim: pointer.down ? pointerAim() : keyAim() });
        }
    }
    function courtPoint(e) {
        const r = svgEl.getBoundingClientRect();
        const scale = Math.min(r.width / C.W, r.height / C.H);
        const ox = (r.width - C.W * scale) / 2, oy = (r.height - C.H * scale) / 2;
        let x = (e.clientX - r.left - ox) / scale, y = (e.clientY - r.top - oy) / scale;
        if (flip()) { x = C.W - x; y = C.H - y; }
        return { x, y };
    }
    function gatherInput(now) {
        let dx = (held.ArrowRight || held.KeyD || vpad.right ? 1 : 0) - (held.ArrowLeft || held.KeyA || vpad.left ? 1 : 0);
        let dy = (held.ArrowDown || held.KeyS || vpad.down ? 1 : 0) - (held.ArrowUp || held.KeyW || vpad.up ? 1 : 0);
        if (flip()) { dx = -dx; dy = -dy; }
        if (pointer.down && !pointer.charging && S) {
            const pl = S.players[mySide()];
            const px = pointer.x - pl.x, py = pointer.y - pl.y;
            const d = Math.hypot(px, py);
            if (d > 8 && dx === 0 && dy === 0) { dx = px / d; dy = py / d; }
        }
        if (isHost) { applyAction({ t: "input", dx, dy }, 0); return; }
        const changed = Math.abs(dx - lastSentDir.x) > 0.05 || Math.abs(dy - lastSentDir.y) > 0.05;
        if (changed || now - lastDirSend > 150) {
            lastSentDir = { x: dx, y: dy }; lastDirSend = now;
            room.sendAction({ t: "input", dx, dy }).catch(console.warn);
        }
    }

    function onKeyDown(e) {
        if (!active) return;
        const k = e.code;
        if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Space") e.preventDefault();
        if (k === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (k === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (k === "KeyP" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            else if (k === "KeyP") setPaused(true);
            e.preventDefault(); return;
        }
        if (helpOpen || cheatsOpen || paused) return;
        if (k === "KeyR") { restartMatch(); e.preventDefault(); return; }
        if (k === "Enter" && !ovStart.hidden) { begin(); return; }
        if (k === "Space" && !held[k]) pressAction();
        held[k] = true;
    }
    function onKeyUp(e) {
        held[e.code] = false;
        if (e.code === "Space") releaseAction();
    }
    function onBlur() { clearInputs(); }

    function onCourtDown(e) {
        if (!active || !S) return;
        e.preventDefault();
        try { svgEl.setPointerCapture(e.pointerId); } catch (err) { }
        const p = courtPoint(e);
        pointer.down = true; pointer.x = p.x; pointer.y = p.y;
        if (S.phase === "serve" && S.server === mySide()) { pointer.charging = true; pressAction(); }
    }
    function onCourtMove(e) {
        if (!pointer.down) return;
        const p = courtPoint(e);
        pointer.x = p.x; pointer.y = p.y;
    }
    function onCourtUp(e) {
        if (!pointer.down) return;
        if (pointer.charging) { pointer.charging = false; releaseAction(); }
        else submitAction({ t: "swing", mod: currentMod() });
        pointer.down = false;
    }

    /* ---------- guest interpolation ---------- */
    function guestAdvance(dt, now) {
        const el = Math.min(0.25, (now - snapAt) / 1000);
        for (const pl of S.players) pl.swingT = Math.max(0, pl.swingT - dt);
        if (S.ball) {
            const b = S.ball;
            const x = b.x + b.vx * el, y = b.y + b.vy * el;
            let z = b.z + b.vz * el - 0.5 * G * el * el;
            if (z < 0) z = 0;
            if (!view.vb) view.vb = { x, y, z };
            const k = 1 - Math.exp(-dt * 14);
            view.vb.x += (x - view.vb.x) * k;
            view.vb.y += (y - view.vb.y) * k;
            view.vb.z += (z - view.vb.z) * k;
        } else view.vb = null;
        for (let side = 0; side < 2; side++) {
            const sp = S.players[side], vp = view.vp[side];
            let tx = sp.x + sp.input.x * PSPEED * el, ty = sp.y + sp.input.y * PSPEED * el;
            tx = clamp(tx, C.x0 - 34, C.x1 + 34);
            ty = side === 0 ? clamp(ty, C.netY + 18, C.y1 + 30) : clamp(ty, C.y0 - 30, C.netY - 18);
            const k = 1 - Math.exp(-dt * 12);
            vp.x += (tx - vp.x) * k; vp.y += (ty - vp.y) * k;
        }
    }

    /* ---------- render ---------- */
    function renderStatic() {
        const s = S ? S.level.surf : SURFACES[0];
        staticG.innerHTML =
            '<rect x="0" y="0" width="600" height="800" fill="#eef2f6"/>' +
            '<rect x="20" y="14" width="560" height="772" rx="18" fill="' + s.apron + '"/>' +
            '<rect x="' + C.x0 + '" y="' + C.y0 + '" width="' + (C.x1 - C.x0) + '" height="' + (C.y1 - C.y0) + '" fill="' + s.court + '"/>' +
            '<g stroke="#f8fafc" stroke-width="2.5" fill="none">' +
            '<rect x="' + C.x0 + '" y="' + C.y0 + '" width="' + (C.x1 - C.x0) + '" height="' + (C.y1 - C.y0) + '"/>' +
            '<line x1="' + C.x0 + '" y1="' + C.srvY0 + '" x2="' + C.x1 + '" y2="' + C.srvY0 + '"/>' +
            '<line x1="' + C.x0 + '" y1="' + C.srvY1 + '" x2="' + C.x1 + '" y2="' + C.srvY1 + '"/>' +
            '<line x1="' + C.cx + '" y1="' + C.srvY0 + '" x2="' + C.cx + '" y2="' + C.srvY1 + '"/>' +
            '<line x1="' + C.cx + '" y1="' + (C.y0 + 6) + '" x2="' + C.cx + '" y2="' + (C.y0 + 20) + '"/>' +
            '<line x1="' + C.cx + '" y1="' + (C.y1 - 20) + '" x2="' + C.cx + '" y2="' + (C.y1 - 6) + '"/>' +
            '</g>';
        netG.innerHTML =
            '<rect x="40" y="' + (C.netY - 6) + '" width="520" height="12" rx="3" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>' +
            '<line x1="40" y1="' + C.netY + '" x2="560" y2="' + C.netY + '" stroke="#475569" stroke-width="1" stroke-dasharray="2 3"/>' +
            '<circle cx="40" cy="' + C.netY + '" r="5" fill="#94a3b8"/><circle cx="560" cy="' + C.netY + '" r="5" fill="#94a3b8"/>';
    }

    function drawPlayer(side, P, B) {
        const pl = P[side], sp = S.players[side];
        const mine = side === mySide();
        const body = mine ? "#2563eb" : "#dc2626";
        const dark = mine ? "#1e40af" : "#991b1b";
        let base = B ? Math.atan2(B.y - pl.y, B.x - pl.x) : (side === 0 ? -Math.PI / 2 : Math.PI / 2);
        let ang = base, arc = "";
        if (sp.swingT > 0) {
            const pr = 1 - sp.swingT / SWING_T;
            const ease = 1 - Math.pow(1 - pr, 3);
            const a0 = base + sp.swingDir * (-1.4);
            ang = base + sp.swingDir * (-1.4 + 2.6 * ease);
            const x0 = Math.cos(a0) * 27, y0 = Math.sin(a0) * 27;
            const x1 = Math.cos(ang) * 27, y1 = Math.sin(ang) * 27;
            arc = '<path d="M ' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A 27 27 0 0 ' + (sp.swingDir > 0 ? 1 : 0) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '" fill="none" stroke="' + dark + '" stroke-width="3" stroke-linecap="round" opacity="' + (0.35 * (1 - pr)).toFixed(2) + '"/>';
        }
        if (S.phase === "toss" && S.server === side) {
            ang = (side === 0 ? -Math.PI / 2 : Math.PI / 2) - 0.9 * (1 - S.tossT / TOSS_T);
        }
        const lx = sp.input.x * 2, ly = sp.input.y * 2;
        return '<g transform="translate(' + (pl.x + lx).toFixed(1) + ',' + (pl.y + ly).toFixed(1) + ')">' +
            (mine ? '<circle r="17" fill="none" stroke="' + body + '" stroke-width="1.5" opacity="0.35"/>' : '') +
            '<circle r="13" fill="' + body + '" stroke="' + dark + '" stroke-width="2.5"/>' +
            '<g transform="rotate(' + (ang * 180 / Math.PI).toFixed(1) + ')"><line x1="10" y1="0" x2="26" y2="0" stroke="' + dark + '" stroke-width="4" stroke-linecap="round"/><ellipse cx="31" cy="0" rx="6" ry="4.5" fill="none" stroke="' + dark + '" stroke-width="2.5"/></g>' +
            arc + '</g>';
    }

    function trailColor() {
        const k = S ? S.ballKind : "serve";
        if (k === "smash") return "#fb923c";
        if (k === "lob") return "#7dd3fc";
        if (k === "drop") return "#a7f3d0";
        return "#fde047";
    }

    function renderDyn(now) {
        const me = mySide();
        const P = isHost ? S.players : view.vp;
        const B = isHost ? S.ball : view.vb;
        let s = "";
        if (S.phase === "rally" && B && S.lastHitter !== me) {
            const a = clamp((B.x - P[me].x) / 40, -1, 1);
            const tx = C.cx + a * 178;
            const gy = me === 0 ? 122 : 626;
            s += '<rect x="' + (tx - 34).toFixed(0) + '" y="' + gy + '" width="68" height="52" rx="10" fill="#ffffff" opacity="0.14"/>';
        }
        if ((S.phase === "serve" || S.phase === "toss") && S.server === me) {
            const p = currentCharge(), aim = currentAimPreview();
            const t = serveTarget(me, p, aim, S.boxLeft);
            const ok = inServiceBox(t.x, t.y, 1 - me, S.boxLeft) && p <= 0.925;
            const col = ok ? "#16a34a" : "#dc2626";
            s += '<circle cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="13" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-dasharray="4 4" opacity="0.85"/>' +
                '<circle cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="3" fill="' + col + '" opacity="0.85"/>';
        }
        const tc = trailColor();
        for (let i = 0; i < view.trail.length; i++) {
            const tr = view.trail[i];
            const op = (i + 1) / view.trail.length * 0.28;
            s += '<circle cx="' + tr.x.toFixed(1) + '" cy="' + (tr.y - tr.z * 0.55).toFixed(1) + '" r="5" fill="' + tc + '" opacity="' + op.toFixed(2) + '"/>';
        }
        for (const r of view.rings) {
            const pr = 1 - r.t / 0.4;
            s += '<circle cx="' + r.x.toFixed(1) + '" cy="' + r.y.toFixed(1) + '" r="' + (6 + pr * 22).toFixed(1) + '" fill="none" stroke="#ffffff" stroke-width="2" opacity="' + (0.5 * (1 - pr)).toFixed(2) + '"/>';
        }
        if (S.phase === "toss") {
            const pl = P[S.server], pr = 1 - S.tossT / TOSS_T, z = 30 * pr;
            s += '<ellipse cx="' + pl.x.toFixed(1) + '" cy="' + pl.y.toFixed(1) + '" rx="6" ry="3.5" fill="#000" opacity="0.2"/>' +
                '<circle cx="' + pl.x.toFixed(1) + '" cy="' + (pl.y - z * 0.55).toFixed(1) + '" r="6" fill="#fde047" stroke="#ca8a04" stroke-width="2"/>';
        }
        if (B) {
            s += '<ellipse cx="' + B.x.toFixed(1) + '" cy="' + B.y.toFixed(1) + '" rx="' + (7 + B.z * 0.03).toFixed(1) + '" ry="4" fill="#000" opacity="0.22"/>';
            const by = B.y - B.z * 0.55;
            if (view.squash > 0) {
                s += '<ellipse cx="' + B.x.toFixed(1) + '" cy="' + by.toFixed(1) + '" rx="9" ry="5.5" fill="#fde047" stroke="#ca8a04" stroke-width="2"/>';
            } else {
                s += '<circle cx="' + B.x.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="' + (7 + B.z * 0.02).toFixed(1) + '" fill="#fde047" stroke="#ca8a04" stroke-width="2"/>';
            }
        }
        for (const sp of view.sparks) {
            const pr = 1 - sp.t / 0.3;
            s += '<circle cx="' + sp.x.toFixed(1) + '" cy="' + sp.y.toFixed(1) + '" r="' + (8 + pr * 26).toFixed(1) + '" fill="none" stroke="#fb923c" stroke-width="3" opacity="' + (0.6 * (1 - pr)).toFixed(2) + '"/>';
        }
        s += drawPlayer(0, P, B);
        s += drawPlayer(1, P, B);
        dynG.innerHTML = s;
        if (B && S.phase === "rally") {
            view.trail.push({ x: B.x, y: B.y, z: B.z });
            if (view.trail.length > 10) view.trail.shift();
        } else if (view.trail.length) view.trail.shift();
        netG.setAttribute("transform", "translate(" + (Math.sin(now * 0.06) * view.netT * 10).toFixed(1) + ",0)");
    }

    function bannerText(m) {
        const me = mySide();
        const n = m.side >= 0 ? nameOfSide(m.side) : "";
        switch (m.code) {
            case "out": return "Out!";
            case "net": return "Net!";
            case "own": return "Masuk lapangan sendiri";
            case "fault": return "Fault";
            case "doublefault": return "Double fault";
            case "ace": return m.side === me ? "Ace!" : "Ace lawan";
            case "winner": return m.side === me ? "Winner!" : "Terlambat!";
            case "game": return "Game - " + n;
            case "set": return n + " memenangkan set";
            case "smash": return "Smash!";
            case "lob": return "Lob";
            case "drop": return "Drop shot";
            case "let": return "Let - ulang poin";
            case "cheat": return "Poin cheat";
            default: return "";
        }
    }
    function toneOf(m) {
        const me = mySide();
        const loserCodes = { out: 1, net: 1, own: 1, doublefault: 1 };
        if (m.code === "smash" || m.code === "lob" || m.code === "drop" || m.code === "fault" || m.code === "let") return "";
        const beneficiary = loserCodes[m.code] ? 1 - m.side : m.side;
        return beneficiary === me ? "good" : "bad";
    }
    function toastText(m) {
        switch (m.code) {
            case "toss": return "Undian koin: " + nameOfSide(m.side) + " servis duluan" + (online ? " - posisi diundi" : "");
            case "level": return "Level " + S.levelNum + " - " + S.level.surf.label + " - " + S.level.style;
            case "reroll": return "Lawan baru dibuat (seed baru)";
            case "rematch": return "Rematch - servis & posisi diundi ulang";
            default: return "";
        }
    }

    function updateHud() {
        if (!S) { statusEl.textContent = "Menghubungkan..."; return; }
        const me = mySide();
        const lab = pointLabel(S.pts);
        hud.ptsYou.textContent = lab[me];
        hud.ptsOpp.textContent = lab[1 - me];
        hud.nameYou.textContent = "Kamu";
        hud.nameOpp.textContent = nameOfSide(1 - me);
        hud.games.textContent = S.games[me] + "-" + S.games[1 - me];
        hud.srvYou.hidden = S.server !== me;
        hud.srvOpp.hidden = S.server === me;
        const a = S.pts[0], b = S.pts[1];
        let st = "";
        if (S.serveNum === 2) st = "Servis ke-2";
        else if (a >= 3 && b >= 3) st = a === b ? "Deuce" : (a > b ? "Adv " + nameOfSide(0) : "Adv " + nameOfSide(1));
        stateChip.hidden = !st;
        stateChip.textContent = st;
        levelChip.textContent = online ? ("Online - " + (isHost ? "Host" : "Guest")) : ("Lv " + S.levelNum + " - " + S.level.surf.label + " - " + S.level.style);
        const phaseText = { idle: "Siap", serve: S.server === me ? "Servismu" : "Servis lawan", toss: "Servis!", rally: "Reli", point: "Poin", over: "Set selesai" };
        statusEl.textContent = phaseText[S.phase] || "Siap";
        const anyCheat = Object.keys(cheats).some((k) => cheats[k]);
        cheatChip.hidden = !anyCheat || online;
        startBest.textContent = (!online && best > 0) ? ("Level terbaik: " + best) : "";
        if (S.phase === "idle") {
            startInfo.textContent = online
                ? (isHost ? "Mode online - kamu host. Posisi & servis pertama diundi saat mulai." : "Menunggu host memulai pertandingan...")
                : ("Level " + S.levelNum + " - lapangan " + S.level.surf.label + " - lawan: " + S.level.style + ". First to 4 game.");
            startBtn.hidden = online && !isHost;
        }
    }

    function showOver() {
        if (!S) return;
        const w = S.winner, me = mySide();
        overTitle.textContent = w === me ? "Kamu memenangkan set!" : nameOfSide(w) + " memenangkan set";
        overTitle.className = w === me ? "tn-good" : "tn-bad";
        overSub.textContent = "Game akhir " + S.games[me] + "-" + S.games[1 - me] + " - Ace " + S.aces[me] + " - Reli terpanjang " + S.bestRally + " pukulan";
        nextBtn.hidden = online || w !== me;
        againBtn.textContent = online ? "Rematch" : (w === me ? "Ulangi level" : "Coba lagi");
        rerollBtn.hidden = online || w === me;
        overVisible = true;
        syncOverlays();
    }

    function render(now) {
        worldG.setAttribute("transform", flip() ? "rotate(180 300 400)" : "");
        const key = S ? S.level.surf.id : "hard";
        if (key !== view.staticKey) { view.staticKey = key; renderStatic(); }
        updateHud();
        syncOverlays();
        if (!S) { dynG.innerHTML = ""; return; }
        if (S.msg && S.msg.id !== view.msgId) {
            view.msgId = S.msg.id;
            bannerEl.textContent = bannerText(S.msg);
            bannerEl.className = "tn-banner " + toneOf(S.msg);
            void bannerEl.getBoundingClientRect();
            bannerEl.classList.add("show");
            if (S.msg.code === "smash" && !isHost) view.sparks.push({ x: S.ball ? S.ball.x : 300, y: S.ball ? S.ball.y : 400, t: 0.3 });
        }
        if (S.toast && S.toast.id !== view.toastId) {
            view.toastId = S.toast.id;
            toastEl.textContent = toastText(S.toast);
            void toastEl.getBoundingClientRect();
            toastEl.classList.add("show");
        }
        const me = mySide();
        const showPower = (S.phase === "serve" || S.phase === "toss") && S.server === me;
        powerEl.hidden = !showPower;
        if (showPower) {
            const p = currentCharge();
            powerMark.style.left = (p * 100).toFixed(1) + "%";
            powerPct.textContent = Math.round(p * 100) + "%";
        }
        if (S.phase !== "over") overVisible = false;
        renderDyn(now);
    }

    function decayView(dt) {
        view.netT = Math.max(0, view.netT - dt);
        view.squash = Math.max(0, view.squash - dt);
        for (const r of view.rings) r.t -= dt;
        view.rings = view.rings.filter((r) => r.t > 0);
        for (const sp of view.sparks) sp.t -= dt;
        view.sparks = view.sparks.filter((sp) => sp.t > 0);
    }

    /* ---------- controls ---------- */
    function syncOverlays() {
        ovHelp.hidden = !helpOpen;
        ovCheat.hidden = !cheatsOpen || helpOpen;
        ovPause.hidden = !paused || cheatsOpen || helpOpen;
        ovStart.hidden = !S || S.phase !== "idle" || cheatsOpen || helpOpen || paused;
        ovOver.hidden = !overVisible || cheatsOpen || helpOpen || paused;
        if (cheatsBtn) cheatsBtn.setAttribute("aria-pressed", cheatsOpen ? "true" : "false");
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".tn-btn-label");
            if (label) label.textContent = paused ? "Lanjut" : "Jeda";
            pauseBtn.setAttribute("aria-label", paused ? "Lanjutkan" : "Jeda");
            pauseBtn.setAttribute("title", paused ? "Lanjutkan (P)" : "Jeda (P)");
            pauseBtn.disabled = !S || S.phase === "idle" || S.phase === "over" || (online && !isHost);
        }
    }
    function clearInputs() {
        held = {};
        vpad.up = vpad.down = vpad.left = vpad.right = false;
        pointer.down = false; pointer.charging = false;
        chargingLocal = false; padSwing = false;
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        clearInputs();
        syncOverlays();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncOverlays();
    }
    function setPaused(on) {
        if (!S || (online && !isHost) || on === paused) return;
        if (on && (S.phase === "idle" || S.phase === "over")) return;
        paused = on;
        if (paused) {
            frozenNow = nowMs();
            pauseStarted = clock();
            clearInputs();
            if (view.overTimer) { clearTimeout(view.overTimer); view.overTimer = 0; }
        } else {
            /* Resume: geser semua penanda waktu agar tidak loncat setelah jeda. */
            timeShift += clock() - pauseStarted;
        }
        syncOverlays();
    }
    function begin() {
        if (online && !isHost) return;
        if (paused) setPaused(false);
        makeMatch(S ? S.levelNum : 1, S ? S.level : generateLevel(1, randSeed()), S ? S.names : defaultNames());
        overVisible = false;
        syncOverlays();
    }
    function nextLevel() {
        const n = S.levelNum + 1;
        makeMatch(n, generateLevel(n, randSeed()), S.names);
        toastMsg("level", -1);
        overVisible = false;
        syncOverlays();
    }
    function retryLevel() {
        if (paused) setPaused(false);
        if (online) { submitAction({ t: "rematch" }); overVisible = false; syncOverlays(); return; }
        makeMatch(S.levelNum, S.level, S.names);
        overVisible = false;
        syncOverlays();
    }
    function rerollLevel() {
        makeMatch(S.levelNum, generateLevel(S.levelNum, randSeed()), S.names);
        toastMsg("reroll", -1);
        overVisible = false;
        syncOverlays();
    }
    function restartMatch() {
        if (!S) return;
        if (paused) setPaused(false);
        if (online && !isHost) submitAction({ t: "rematch" });
        else makeMatch(S.levelNum, S.level, S.names);
        overVisible = false;
        syncOverlays();
    }
    function setPadVisible(v) { padEl.hidden = !v; padToggle.setAttribute("aria-pressed", v ? "true" : "false"); }
    function updateCheatChip() { cheatChip.hidden = online || !Object.keys(cheats).some((k) => cheats[k]); }

    function handleClick(e) {
        const b = e.target.closest("[data-exit],[data-start],[data-help],[data-help-close],[data-restart],[data-next],[data-again],[data-reroll],[data-cheats],[data-cheats-close],[data-pause],[data-resume],[data-padtoggle],[data-cheat-act]");
        if (!b) return;
        if (b.hasAttribute("data-exit")) { onExit(); return; }
        if (b.hasAttribute("data-start")) { begin(); return; }
        if (b.hasAttribute("data-help")) { toggleHelp(true); return; }
        if (b.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (b.hasAttribute("data-restart")) { restartMatch(); return; }
        if (b.hasAttribute("data-next")) { nextLevel(); return; }
        if (b.hasAttribute("data-again")) { retryLevel(); return; }
        if (b.hasAttribute("data-reroll")) { rerollLevel(); return; }
        if (b.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (b.hasAttribute("data-cheats-close")) { toggleCheats(false); return; }
        if (b.hasAttribute("data-pause")) { setPaused(!paused); return; }
        if (b.hasAttribute("data-resume")) { setPaused(false); return; }
        if (b.hasAttribute("data-padtoggle")) { setPadVisible(padEl.hidden); return; }
        if (b.hasAttribute("data-cheat-act")) {
            if (online || !isHost || !S) return;
            const act = b.getAttribute("data-cheat-act");
            if (act === "point" && S.phase !== "over" && S.phase !== "idle") pointTo(0, "cheat");
            else if (act === "game" && S.phase !== "over" && S.phase !== "idle") awardGame(0);
            else if (act === "set" && S.phase !== "idle") { S.winner = 0; S.phase = "over"; banner("set", 0); onSetWon(0); forcePub(); }
            else if (act === "reroll") rerollLevel();
            return;
        }
    }
    function handleChange(e) {
        const c = e.target.closest("[data-cheat]");
        if (!c) return;
        cheats[c.getAttribute("data-cheat")] = c.checked;
        updateCheatChip();
    }

    root.addEventListener("click", handleClick, sig);
    root.addEventListener("change", handleChange, sig);
    document.addEventListener("keydown", onKeyDown, sig);
    document.addEventListener("keyup", onKeyUp, sig);
    window.addEventListener("blur", onBlur, sig);
    svgEl.addEventListener("pointerdown", onCourtDown, sig);
    svgEl.addEventListener("pointermove", onCourtMove, sig);
    svgEl.addEventListener("pointerup", onCourtUp, sig);
    svgEl.addEventListener("pointercancel", onCourtUp, sig);
    svgEl.addEventListener("contextmenu", (e) => e.preventDefault(), sig);

    const padBtns = root.querySelectorAll("[data-vk]");
    padBtns.forEach((btn) => {
        const k = btn.getAttribute("data-vk");
        btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            try { btn.setPointerCapture(e.pointerId); } catch (err) { }
            if (k === "swing") { padSwing = true; pressAction(); }
            else vpad[k] = true;
        }, sig);
        const up = (e) => {
            if (k === "swing") { if (padSwing) { padSwing = false; releaseAction(); } }
            else vpad[k] = false;
        };
        btn.addEventListener("pointerup", up, sig);
        btn.addEventListener("pointercancel", up, sig);
        btn.addEventListener("contextmenu", (e) => e.preventDefault(), sig);
    });

    const coarse = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
    setPadVisible(coarse);
    if (online) { cheatsBtn.hidden = true; }

    /* ---------- frame ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        const dt = Math.min(0.033, (t - lastT) / 1000);
        lastT = t;
        if (!active) return;
        const now = paused ? frozenNow : nowMs();
        if (S && !paused) {
            gatherInput(now);
            if (isHost) {
                if (S.phase !== "idle" && S.phase !== "over") update(dt);
                else for (const pl of S.players) pl.swingT = Math.max(0, pl.swingT - dt);
                if (online) {
                    pubAcc += dt;
                    if (pubAcc >= 0.1) { pubAcc = 0; publish(); }
                    if (now - lastGuestInput > 1200) { const gs = S.sides[1]; S.players[gs].input.x = 0; S.players[gs].input.y = 0; }
                }
            } else {
                guestAdvance(dt, now);
            }
            if (S.phase === "over" && !overVisible && !view.overTimer) {
                view.overTimer = setTimeout(() => { view.overTimer = 0; if (S && S.phase === "over") showOver(); }, 900);
            }
            if (S.phase !== "over" && view.overTimer) { clearTimeout(view.overTimer); view.overTimer = 0; }
        }
        if (!paused) decayView(dt);
        render(now);
    }

    /* ---------- init / networking ---------- */
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (isHost) {
            makeMatch(1, generateLevel(1, randSeed()), defaultNames());
            S.phase = "idle";
            publish();
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                if (!nextState) return;
                S = nextState; snapAt = nowMs();
                if (!helloSent) { helloSent = true; room.sendAction({ t: "hello", name: playerName }).catch(console.warn); }
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        makeMatch(1, generateLevel(1, randSeed()), defaultNames());
        S.phase = "idle";
    }
    renderStatic();
    updateHud();
    syncOverlays();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            active = false;
            if (raf) cancelAnimationFrame(raf);
            clearTimeout(view.overTimer);
            ac.abort();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            for (const u of unsubs) { try { u(); } catch (e) { } }
        },
    };
}