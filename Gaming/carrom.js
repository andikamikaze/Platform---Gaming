/* ==== GAME: carrom.js ==== */
/* Minimal Carrom — new template (META + mount).
   Fixed coin layout, no tutorial, cheat overlay (AI mode only),
   virtual buttons + keyboard + slingshot drag, random first turn,
   random side assignment in room mode. */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "carrom", // harus sama dengan nama file (tanpa .js)
    name: "Carrom",
    category: "board",
    catLabel: "Board",
    desc: "Minimalist carrom duel — versus AI or a friend online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="8"/><circle cx="24" cy="24" r="4.5" fill="currentColor" stroke="none"/><circle cx="14" cy="14" r="2.6" fill="currentColor" stroke="none"/><circle cx="34" cy="14" r="2.6" fill="currentColor" stroke="none"/><circle cx="14" cy="34" r="2.6" fill="currentColor" stroke="none"/><circle cx="34" cy="34" r="2.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#f1ece1", "#d8cfba"],
    bestKey: "carromBest",
};

/* ================= pure physics (no DOM) ================= */
const BOARD = 440;
const WALL = 10;
const R_COIN = 9;
const R_STR = 12;
const M_COIN = 1;
const M_STR = 2.2;
const FRICTION = 0.985;
const STOP_V = 9;
const REST_WALL = 0.72;
const REST_HIT = 0.95;
const DT = 1 / 60;
const POCKETS = [
    [30, 30],
    [410, 30],
    [30, 410],
    [410, 410],
];
const POCKET_R = 19;
const BASE_Y = { w: 398, b: 42 };
const BASE_X_MIN = 70;
const BASE_X_MAX = 370;
const N_COINS = 9;

const clampX = (x) => Math.max(BASE_X_MIN, Math.min(BASE_X_MAX, x));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function mkBody(x, y, r, m, color) {
    return { x, y, vx: 0, vy: 0, r, m, color, pocketed: false, queen: false };
}

/* fixed standard layout: queen center, ring of 6, ring of 12 */
function makeCoins() {
    const coins = [];
    const q = mkBody(220, 220, R_COIN, M_COIN, "queen");
    q.queen = true;
    coins.push(q);
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        coins.push(
            mkBody(220 + 20 * Math.cos(a), 220 + 20 * Math.sin(a), R_COIN, M_COIN, i % 2 ? "black" : "white"),
        );
    }
    for (let i = 0; i < 12; i++) {
        const a = (Math.PI / 6) * i;
        coins.push(
            mkBody(220 + 41 * Math.cos(a), 220 + 41 * Math.sin(a), R_COIN, M_COIN, i % 2 ? "white" : "black"),
        );
    }
    return coins;
}

function resolveHits(bodies, pocketRFor) {
    for (const b of bodies) {
        if (b.pocketed) continue;
        const pr = pocketRFor(b);
        for (const p of POCKETS) {
            const dx = b.x - p[0], dy = b.y - p[1];
            if (dx * dx + dy * dy < pr * pr) {
                b.pocketed = true;
                b.vx = 0;
                b.vy = 0;
                break;
            }
        }
    }
    for (const b of bodies) {
        if (b.pocketed) continue;
        const lo = WALL + b.r, hi = BOARD - WALL - b.r;
        if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx) * REST_WALL; }
        else if (b.x > hi) { b.x = hi; b.vx = -Math.abs(b.vx) * REST_WALL; }
        if (b.y < lo) { b.y = lo; b.vy = Math.abs(b.vy) * REST_WALL; }
        else if (b.y > hi) { b.y = hi; b.vy = -Math.abs(b.vy) * REST_WALL; }
    }
    for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < bodies.length; j++) {
            const c = bodies[j];
            if (c.pocketed) continue;
            const dx = c.x - a.x, dy = c.y - a.y;
            const rr = a.r + c.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 === 0) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            const overlap = rr - d;
            const tm = 1 / a.m + 1 / c.m;
            a.x -= (nx * overlap * (1 / a.m)) / tm;
            a.y -= (ny * overlap * (1 / a.m)) / tm;
            c.x += (nx * overlap * (1 / c.m)) / tm;
            c.y += (ny * overlap * (1 / c.m)) / tm;
            const rv = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
            if (rv > 0) {
                const jimp = ((1 + REST_HIT) * rv) / tm;
                a.vx -= (jimp * nx) / a.m;
                a.vy -= (jimp * ny) / a.m;
                c.vx += (jimp * nx) / c.m;
                c.vy += (jimp * ny) / c.m;
            }
        }
    }
}

function stepPhysics(st, pocketRFor = () => POCKET_R) {
    const bodies = [st.striker].concat(st.coins);
    for (let sub = 0; sub < 2; sub++) {
        for (const b of bodies) {
            if (b.pocketed || (b.vx === 0 && b.vy === 0)) continue;
            b.x += (b.vx * DT) / 2;
            b.y += (b.vy * DT) / 2;
        }
        resolveHits(bodies, pocketRFor);
    }
    for (const b of bodies) {
        if (b.pocketed || (b.vx === 0 && b.vy === 0)) continue;
        b.vx *= FRICTION;
        b.vy *= FRICTION;
        if (b.vx * b.vx + b.vy * b.vy < STOP_V * STOP_V) { b.vx = 0; b.vy = 0; }
    }
}

function allStopped(st) {
    return [st.striker].concat(st.coins).every((b) => b.pocketed || (b.vx === 0 && b.vy === 0));
}

function clearedCount(st, color) {
    return st.coins.filter((c) => c.pocketed && !c.queen && c.color === color).length;
}

function shotVel(angle, power) {
    const s = 260 + power * 640;
    return { vx: Math.cos(angle) * s, vy: Math.sin(angle) * s };
}

/* AI plays black from the top baseline */
function aiAim(st, rnd, err = 0.07, powMin = 0.62, powVar = 0.38) {
    const blacks = st.coins.filter((c) => !c.pocketed && c.color === "black");
    if (!blacks.length) return null;
    const s = st.striker;
    let best = null;
    for (const coin of blacks) {
        for (const p of POCKETS) {
            const dpx = p[0] - coin.x, dpy = p[1] - coin.y;
            const dp = Math.hypot(dpx, dpy);
            if (!dp) continue;
            const ux = dpx / dp, uy = dpy / dp;
            const ix = coin.x - ux * (coin.r + s.r);
            const iy = coin.y - uy * (coin.r + s.r);
            if (ix < WALL + s.r || ix > BOARD - WALL - s.r || iy < WALL + s.r || iy > BOARD - WALL - s.r) continue;
            const sx = clampX(ix);
            const cost = Math.hypot(ix - sx, iy - BASE_Y.b);
            if (!best || cost < best.cost) best = { cost, sx, ix, iy };
        }
    }
    if (!best) return { sx: 220, angle: Math.PI / 2, power: 0.8 };
    const ang = Math.atan2(best.iy - BASE_Y.b, best.ix - best.sx) + (rnd() - 0.5) * err;
    return { sx: best.sx, angle: ang, power: powMin + rnd() * powVar };
}

/* ray-march prediction for the aim-assist cheat (max 2 wall bounces) */
function predictPath(st, angle, maxLen = 900) {
    let x = st.striker.x, y = st.striker.y;
    let ux = Math.cos(angle), uy = Math.sin(angle);
    const r = R_STR, lo = WALL + r, hi = BOARD - WALL - r;
    const pts = [[x, y]];
    let remaining = maxLen, bounces = 0, hit = null;
    while (remaining > 0 && bounces <= 2) {
        let tX = Infinity, tY = Infinity;
        if (ux < 0) tX = (lo - x) / ux; else if (ux > 0) tX = (hi - x) / ux;
        if (uy < 0) tY = (lo - y) / uy; else if (uy > 0) tY = (hi - y) / uy;
        let tCoin = Infinity, coinHit = null;
        for (const c of st.coins) {
            if (c.pocketed) continue;
            const fx = x - c.x, fy = y - c.y, R = r + c.r;
            const b = fx * ux + fy * uy;
            const disc = b * b - (fx * fx + fy * fy - R * R);
            if (disc < 0) continue;
            const t = -b - Math.sqrt(disc);
            if (t > 1e-6 && t < tCoin) { tCoin = t; coinHit = c; }
        }
        const t = Math.min(tX, tY, tCoin, remaining);
        x += ux * t; y += uy * t; remaining -= t;
        if (coinHit && t === tCoin) { pts.push([x, y]); hit = { coin: coinHit, x, y }; break; }
        if (t === tX && tX <= tY) { pts.push([x, y]); ux = -ux; bounces++; }
        else if (t === tY) { pts.push([x, y]); uy = -uy; bounces++; }
        else { pts.push([x, y]); break; }
    }
    return { pts, hit };
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost;
    let roomData = room?.room || null;
    let state = null;

    /* local-only UI / cheat state (never synced) */
    const cheats = { assist: false, magnet: false, noFoul: false, slow: false, weakAI: false };
    let aimAngle = -Math.PI / 2;
    let aimPower = 0.55;
    let pulling = false, pullPt = null, ptrMode = null;
    let lastTurnId = -1;
    let before = { o: 0, q: 0, s: false };
    let acc = 0, simTime = 0, pubT = 0, lastT = 0, raf = null;
    let best = 0;
    let destroyed = false;
    let cheatsOpen = false;
    let helpOpen = false;
    let paused = false;
    const timers = new Set();
    const timerRec = new Map();
    let deferredTimers = [];
    const holdStops = [];
    const unsubs = [];

    /* pause-aware timers: keep Date.now() due anchors, replay the remaining
       delay on resume so the AI bot and FX never jump ahead after a pause. */
    const later = (fn, ms) => {
        if (paused) { deferredTimers.push({ wait: ms, fn }); return null; }
        const id = setTimeout(() => {
            timers.delete(id);
            timerRec.delete(id);
            if (!destroyed) fn();
        }, ms);
        timers.add(id);
        timerRec.set(id, { due: Date.now() + ms, fn });
        return id;
    };
    const clearAiTimers = () => {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        timerRec.clear();
        deferredTimers = [];
    };
    function pauseTimers() {
        const now = Date.now();
        for (const [id, rec] of timerRec) {
            clearTimeout(id);
            deferredTimers.push({ wait: Math.max(0, rec.due - now), fn: rec.fn });
        }
        timers.clear();
        timerRec.clear();
    }
    function resumeTimers() {
        const queue = deferredTimers;
        deferredTimers = [];
        for (const t of queue) later(t.wait, t.fn);
    }

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("carromHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("carromHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }

    /* ---------- DOM ---------- */
    root.innerHTML = `
<style>
/* Carrom — single HUD bar, fill-height square board, overlay sheets. */
.carrom-game{--ca-ink:#3a3f47;--ca-mut:#9aa1ab;--ca-line:#e4e1d8;--ca-acc:#4c7dff;--ca-soft:#f1efe8;
  width:100%;height:100%;min-height:0;margin:0;display:flex;flex-direction:column;gap:8px;color:var(--ca-ink);font-family:inherit;font-size:13px;line-height:1.45}
.carrom-game *{box-sizing:border-box}
.carrom-game [hidden]{display:none!important}
.carrom-game :is(button,input,select,[tabindex]):focus-visible{outline:2px solid var(--ca-acc);outline-offset:2px}
.ca-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.ca-hud .ca-chip{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:5px 8px;border:1px solid var(--ca-line);border-radius:999px;background:#fff;white-space:nowrap;color:var(--ca-mut)}
.ca-hud .ca-chip b{color:var(--ca-ink);font-weight:700;font-variant-numeric:tabular-nums}
.ca-hud .ca-chip em{font-style:normal;color:var(--ca-mut)}
.ca-hud .ca-chip.on{border-color:var(--ca-acc);box-shadow:0 0 0 1px #4c7dff22}
.ca-dot{width:9px;height:9px;border-radius:50%;flex:none}
.ca-dot-w{background:#fff;border:1.5px solid #c9c4b8}
.ca-dot-b{background:#2b2f36}
.ca-hud .ca-note{max-width:190px;overflow:hidden;text-overflow:ellipsis}
.ca-spacer{flex:1 1 auto;min-width:6px}
.ca-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:6px 10px;border:1px solid var(--ca-line);border-radius:9px;background:#fff;color:var(--ca-ink);font:700 10px/1 inherit;letter-spacing:.04em;cursor:pointer}
.ca-btn svg{flex:none;display:block}
.ca-btn:hover:not(:disabled){border-color:var(--ca-acc);color:var(--ca-acc)}
.ca-btn:active:not(:disabled){background:var(--ca-soft)}
.ca-btn:disabled{opacity:.45;cursor:default}
.ca-btn.on{border-color:var(--ca-acc);background:#f0f4ff;color:var(--ca-acc)}
.ca-btn-label{white-space:nowrap}
.ca-icon-btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.carrom-game.game-fill>.ca-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:1px solid var(--ca-line);border-radius:12px;background:#f4f1e8;overflow:hidden}
.ca-svg{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair}
.ca-controls{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:center}
.ca-controls.off{opacity:.45;pointer-events:none}
.ca-group{display:flex;align-items:center;gap:5px}
.ca-lab{font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:var(--ca-mut)}
.ca-btns{display:flex;gap:4px;align-items:center}
.ca-controls .ca-btn{width:36px;height:36px;min-height:36px;padding:0;font-size:14px;touch-action:none}
.ca-controls .ca-btn svg{width:15px;height:15px}
.ca-meter{width:48px;height:6px;border-radius:3px;background:#e8e5dd;overflow:hidden}
.ca-meter i{display:block;height:100%;width:55%;background:var(--ca-acc);border-radius:3px;transition:width .08s}
.ca-shoot{min-height:36px;padding:0 16px;border:1px solid var(--ca-acc);border-radius:9px;background:var(--ca-acc);color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer}
.ca-shoot:active{background:#3d68e0}
.ca-shoot:disabled{opacity:.45;cursor:default}
.ca-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(250,249,245,.88);backdrop-filter:blur(2px)}
.ca-card{width:min(380px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;padding:16px;border:1px solid var(--ca-line);border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(30,30,40,.1)}
.ca-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.ca-head h3{margin:0;font-size:15px;font-weight:800}
.ca-x{width:36px;height:36px;min-height:36px;border:1px solid var(--ca-line);border-radius:9px;background:#fff;color:var(--ca-mut);font-size:18px;line-height:1;cursor:pointer}
.ca-cheats,.ca-help,.ca-stats{flex:1 1 auto;min-height:0;overflow:auto}
.ca-cheats{display:flex;flex-direction:column;gap:2px;margin-top:10px}
.ca-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:4px 0;font-size:12.5px;cursor:pointer}
.ca-row input{position:absolute;opacity:0;pointer-events:none}
.ca-sw{width:36px;height:20px;border-radius:10px;background:#e2dfd6;position:relative;flex:none;transition:background .15s}
.ca-sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
.ca-row input:checked+.ca-sw{background:var(--ca-acc)}
.ca-row input:checked+.ca-sw::after{left:18px}
.ca-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:10px}
.ca-foot .ca-note{font-size:11px;color:var(--ca-mut)}
.ca-acts{display:flex;gap:8px;flex-wrap:wrap}
.ca-acts button,.ca-again{min-height:38px;padding:0 14px;border:1px solid var(--ca-line);border-radius:9px;background:#faf9f5;color:var(--ca-ink);font-size:11.5px;font-weight:700;cursor:pointer}
.ca-acts button:active,.ca-again:active{background:var(--ca-soft)}
.ca-again{border-color:var(--ca-acc);background:var(--ca-acc);color:#fff}
.ca-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:10px}
.ca-help b{display:block;margin-bottom:5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.09em;color:var(--ca-mut);text-transform:uppercase}
.ca-help ul{margin:0 0 10px;padding-left:16px;font-size:11.5px;line-height:1.6;color:var(--ca-ink)}
.ca-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--ca-line);border-bottom-width:2px;border-radius:5px;background:var(--ca-soft);font:600 10px/1.4 ui-monospace,monospace}
.ca-stats{text-align:center;padding:10px 0}
.ca-over-title{margin:0;font-size:20px;font-weight:800}
.ca-over-title.win{color:#2f9e6e}
.ca-over-title.lose{color:#d9534f}
.ca-over-sub{margin:6px 0 0;color:var(--ca-mut);font-size:13px}
@keyframes carrom-pop{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-28px)}}
.ca-pop{font:800 15px inherit;fill:var(--ca-ink);paint-order:stroke;stroke:#faf9f5;stroke-width:4px;animation:carrom-pop .8s ease-out forwards;pointer-events:none}
@media (prefers-reduced-motion:reduce){.carrom-game *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* --- layout overrides (last, higher specificity than touch defaults) --- */
@media (max-width:640px){
  .carrom-game{gap:6px}
  .carrom-game .ca-hud{gap:4px}
  .carrom-game .ca-hud .ca-chip{padding:4px 6px;font-size:9px;min-height:0}
  .carrom-game .ca-hud .ca-note{display:none}
  .carrom-game .ca-hud .ca-btn-label,.carrom-game .ca-hud .ca-spacer{display:none}
  .carrom-game .ca-hud .ca-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .carrom-game .ca-board:has(.ca-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px)}
  .carrom-game .ca-ov{padding:8px}
  .carrom-game .ca-card{width:100%;height:100%;max-height:100%;padding:12px}
  .carrom-game .ca-help{grid-template-columns:1fr;gap:8px}
  .carrom-game .ca-cheats,.carrom-game .ca-help,.carrom-game .ca-stats{scrollbar-width:none}
  .carrom-game .ca-cheats::-webkit-scrollbar,.carrom-game .ca-help::-webkit-scrollbar,.carrom-game .ca-stats::-webkit-scrollbar{display:none}
  .carrom-game .ca-foot{margin-top:8px}
}
@media (pointer:coarse){
  .carrom-game .ca-hud .ca-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .carrom-game .ca-controls .ca-btn{min-height:40px;padding:0}
  .carrom-game .ca-x{min-height:40px}
}
</style>
<div class="game-app carrom-game game-fill" data-carrom>
  <div class="ca-hud">
    <span class="ca-chip ca-chip-w"><i class="ca-dot ca-dot-w"></i>W <b data-hud="wleft">9</b><em data-hud="wscore">0</em></span>
    <span class="ca-chip ca-chip-b"><i class="ca-dot ca-dot-b"></i>B <b data-hud="bleft">9</b><em data-hud="bscore">0</em></span>
    <span class="ca-chip" data-hud="turn">TURN —</span>
    <span class="ca-chip" data-hud="power-chip">PWR <b data-hud="power">55</b>%</span>
    <span class="ca-chip ca-note" data-hud="note"></span>
    <span class="ca-spacer"></span>
    <button class="ca-btn ca-icon-btn" type="button" data-shoot aria-label="Shoot" title="Shoot (Space)">${iconSVG("target", { size: 14 })}<span class="ca-btn-label">Shoot</span></button>
    <button class="ca-btn ca-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ca-btn-label">Help</span></button>
    <button class="ca-btn ca-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "disabled" : ""}>${iconSVG("wrench", { size: 14 })}<span class="ca-btn-label">Cheats</span></button>
    <button class="ca-btn ca-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="ca-btn-label">Pause</span></button>
    <button class="ca-btn ca-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ca-btn-label">Restart</span></button>
    <button class="ca-btn ca-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ca-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel ca-board" data-board>
    <svg class="ca-svg" viewBox="0 0 440 440" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carrom board">
      <g data-g="world">
        <g data-g="board"></g>
        <g data-g="guide"></g>
      </g>
      <g data-g="fx"></g>
      <rect data-hit x="0" y="0" width="440" height="440" fill="transparent"/>
    </svg>
    <div class="ca-ov" data-ov="cheat" hidden>
      <div class="ca-card">
        <div class="ca-head"><h3>Cheats</h3><button class="ca-x" type="button" data-close aria-label="Close">×</button></div>
        <div class="ca-cheats">
          <label class="ca-row"><span>Aim assist</span><input type="checkbox" data-cheat="assist"><i class="ca-sw"></i></label>
          <label class="ca-row"><span>Magnet pockets</span><input type="checkbox" data-cheat="magnet"><i class="ca-sw"></i></label>
          <label class="ca-row"><span>Ignore fouls</span><input type="checkbox" data-cheat="noFoul"><i class="ca-sw"></i></label>
          <label class="ca-row"><span>Slow motion</span><input type="checkbox" data-cheat="slow"><i class="ca-sw"></i></label>
          <label class="ca-row"><span>Weak AI</span><input type="checkbox" data-cheat="weakAI"><i class="ca-sw"></i></label>
        </div>
        <div class="ca-foot"><span class="ca-note">AI mode only</span><span class="ca-acts">
          <button type="button" data-cheat-act="skip">Skip AI turn</button>
          <button type="button" data-cheat-act="pocket">Pocket a white</button>
        </span></div>
      </div>
    </div>
    <div class="ca-ov" data-ov="pause" hidden>
      <div class="ca-card">
        <div class="ca-head"><h3>Paused</h3></div>
        <div class="ca-stats"><p class="ca-over-sub">The board, AI and timers are frozen.</p></div>
        <div class="ca-foot"><span class="ca-note">Press P or Esc to resume</span><button class="ca-again" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="ca-ov" data-ov="over" hidden>
      <div class="ca-card">
        <div class="ca-head"><h3>Game over</h3></div>
        <div class="ca-stats">
          <h3 class="ca-over-title" data-over-title></h3>
          <p class="ca-over-sub" data-over-sub></p>
        </div>
        <div class="ca-foot"><span class="ca-note">Press R to restart</span><button class="ca-again" type="button" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="ca-ov" data-ov="help" hidden>
      <div class="ca-card">
        <div class="ca-head"><h3>How to play</h3><button class="ca-x" type="button" data-help-close aria-label="Close">×</button></div>
        <div class="ca-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="ca-kbd">← →</span> slide the striker, <span class="ca-kbd">A D</span> rotate aim</li>
              <li><span class="ca-kbd">↑ ↓</span> raise / lower power, <span class="ca-kbd">Space</span> shoot</li>
              <li>Drag the striker backwards on the board to slingshot.</li>
              <li><span class="ca-kbd">H</span> help · <span class="ca-kbd">C</span> cheats · <span class="ca-kbd">P</span> pause · <span class="ca-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Use the Move / Aim / Power buttons below the board, then Shoot.</li>
              <li>Or drag on the board to aim and release to shoot.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Pocket all 9 of your colour before your opponent does.</li>
              <li>The red queen is worth +200; every normal coin is +100.</li>
              <li>Pocketing a coin earns an extra turn; a foul costs 50 points.</li>
              <li>A coin toss decides who starts; in rooms sides are random.</li>
              <li>Cheats are available in AI mode only.</li>
            </ul>
            <div class="ca-foot"><span class="ca-note">Press H to reopen this guide</span><button class="ca-again" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="ca-controls" data-controls>
    <div class="ca-group"><span class="ca-lab">Move</span><span class="ca-btns">
      <button class="ca-btn" type="button" data-ctl="left" aria-label="Move striker left" title="Move left">${iconSVG("arrowLeft", { size: 15 })}</button>
      <button class="ca-btn" type="button" data-ctl="right" aria-label="Move striker right" title="Move right">${iconSVG("arrowRight", { size: 15 })}</button>
    </span></div>
    <div class="ca-group"><span class="ca-lab">Aim</span><span class="ca-btns">
      <button class="ca-btn" type="button" data-ctl="rotl" aria-label="Rotate aim left" title="Aim left">${iconSVG("rotateCcw", { size: 15 })}</button>
      <button class="ca-btn" type="button" data-ctl="rotr" aria-label="Rotate aim right" title="Aim right">${iconSVG("rotateCw", { size: 15 })}</button>
    </span></div>
    <div class="ca-group"><span class="ca-lab">Power</span><span class="ca-btns">
      <button class="ca-btn" type="button" data-ctl="powd" aria-label="Less power" title="Less power">${iconSVG("minus", { size: 15 })}</button>
      <span class="ca-meter"><i data-power></i></span>
      <button class="ca-btn" type="button" data-ctl="powu" aria-label="More power" title="More power">${iconSVG("plus", { size: 15 })}</button>
    </span></div>
    <button class="ca-shoot" type="button" data-ctl="shoot">Shoot</button>
  </div>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const app = $("[data-carrom]");
    const board = $("[data-board]");
    const svgEl = $(".ca-svg");
    const worldG = $('[data-g="world"]');
    const boardG = $('[data-g="board"]');
    const guideG = $('[data-g="guide"]');
    const fxG = $('[data-g="fx"]');
    const controlsEl = $("[data-controls]");
    const powerEl = $("[data-power]");
    const shootBtn = $('[data-ctl="shoot"]');
    const hudShoot = $("[data-shoot]");
    const ov = {
        cheat: $('[data-ov="cheat"]'),
        pause: $('[data-ov="pause"]'),
        over: $('[data-ov="over"]'),
        help: $('[data-ov="help"]'),
    };
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const hud = {
        wleft: $('[data-hud="wleft"]'),
        bleft: $('[data-hud="bleft"]'),
        wscore: $('[data-hud="wscore"]'),
        bscore: $('[data-hud="bscore"]'),
        turn: $('[data-hud="turn"]'),
        power: $('[data-hud="power"]'),
        note: $('[data-hud="note"]'),
    };
    const chips = { w: $(".ca-chip-w"), b: $(".ca-chip-b") };

    /* ---------- helpers ---------- */
    const mySide = () => (online ? (state ? state.sides[playerIndex] : "w") : "w");
    const flipped = () => mySide() === "b";
    const isMyTurnAim = () =>
        Boolean(state) && !paused && !helpOpen && !cheatsOpen &&
        state.phase === "aim" && !state.winner && state.turn === mySide();
    const pocketRFor = (b) =>
        !online && cheats.magnet && (b.queen || b.color === "white") ? 27 : POCKET_R;

    function freshState() {
        const turn = Math.random() < 0.5 ? "w" : "b"; // random first turn
        const sides = online ? (Math.random() < 0.5 ? ["w", "b"] : ["b", "w"]) : ["w", "b"]; // random player side
        const striker = mkBody(220, BASE_Y[turn], R_STR, M_STR, "striker");
        return {
            coins: makeCoins(),
            striker,
            turn,
            turnId: 0,
            phase: "aim",
            scores: { w: 0, b: 0 },
            winner: null,
            sides,
            note: "Coin toss · " + (turn === "w" ? "White" : "Black") + " starts",
            seq: 0,
        };
    }

    function respawn(side) {
        const s = state.striker;
        s.pocketed = false;
        s.vx = 0;
        s.vy = 0;
        s.x = 220;
        s.y = BASE_Y[side];
    }

    function syncTurnUi() {
        if (!state || state.turnId === lastTurnId) return;
        lastTurnId = state.turnId;
        pulling = false;
        pullPt = null;
        ptrMode = null;
        if (state.phase === "aim" && state.turn === mySide()) {
            aimAngle = mySide() === "w" ? -Math.PI / 2 : Math.PI / 2;
            aimPower = 0.55;
        }
    }

    /* ---------- render ---------- */
    function staticBoard() {
        let s = "";
        s += `<rect x="1" y="1" width="438" height="438" rx="16" fill="#f4f1e8" stroke="#e2ddcf" stroke-width="2"/>`;
        s += `<rect x="10" y="10" width="420" height="420" rx="10" fill="#fbf9f3" stroke="#ece7da" stroke-width="1.5"/>`;
        for (const p of POCKETS) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${POCKET_R}" fill="#2e2a24"/>`;
        s += `<circle cx="220" cy="220" r="54" fill="none" stroke="#e3ddcc" stroke-width="1.5"/>`;
        s += `<circle cx="220" cy="220" r="14" fill="none" stroke="#e8c9c4" stroke-width="1.5"/>`;
        for (const y of [BASE_Y.w, BASE_Y.b]) {
            s += `<path d="M${BASE_X_MIN} ${y}H${BASE_X_MAX}" stroke="#d8d2c2" stroke-width="2" fill="none"/>`;
            s += `<circle cx="${BASE_X_MIN}" cy="${y}" r="4" fill="#cf6b5f"/><circle cx="${BASE_X_MAX}" cy="${y}" r="4" fill="#cf6b5f"/>`;
        }
        return s;
    }
    const STATIC = staticBoard();

    function coinSvg(b) {
        if (b.pocketed) return "";
        if (b.queen) return `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#d9534f" stroke="#b03e3a" stroke-width="1.5"/>`;
        if (b.color === "white") return `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#c9c4b8" stroke-width="1.5"/>`;
        return `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#2b2f36" stroke="#171a1f" stroke-width="1.5"/>`;
    }

    function strikerSvg(b) {
        if (b.pocketed) return "";
        let s = `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#4c7dff" stroke="#ffffff" stroke-width="2"/><circle cx="${b.x}" cy="${b.y}" r="3.5" fill="#ffffff"/>`;
        if (isMyTurnAim())
            s += `<circle cx="${b.x}" cy="${b.y}" r="${b.r + 7}" fill="none" stroke="#4c7dff55" stroke-width="1.5" stroke-dasharray="2 4"/>`;
        return s;
    }

    function renderGuide() {
        if (!isMyTurnAim()) { guideG.innerHTML = ""; return; }
        const s = state.striker;
        const col = aimPower > 0.75 ? "#d9534f" : aimPower > 0.45 ? "#dfa63e" : "#4c7dff";
        let g = "";
        if (!online && cheats.assist) {
            const pr = predictPath(state, aimAngle);
            g += `<polyline points="${pr.pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="6 6" opacity="0.85"/>`;
            if (pr.hit) {
                g += `<circle cx="${pr.hit.x}" cy="${pr.hit.y}" r="${R_STR}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.7"/>`;
                const c = pr.hit.coin;
                let nx = c.x - pr.hit.x, ny = c.y - pr.hit.y;
                const d = Math.hypot(nx, ny) || 1;
                nx /= d; ny /= d;
                g += `<line x1="${c.x}" y1="${c.y}" x2="${c.x + nx * 52}" y2="${c.y + ny * 52}" stroke="${col}" stroke-width="2" opacity="0.8"/>`;
                g += `<circle cx="${c.x + nx * 52}" cy="${c.y + ny * 52}" r="3.5" fill="${col}"/>`;
            }
        } else {
            const len = 54 + aimPower * 130;
            const ux = Math.cos(aimAngle), uy = Math.sin(aimAngle);
            g += `<line x1="${s.x}" y1="${s.y}" x2="${s.x + ux * len}" y2="${s.y + uy * len}" stroke="${col}" stroke-width="2.5" stroke-dasharray="7 6"/>`;
            g += `<circle cx="${s.x + ux * len}" cy="${s.y + uy * len}" r="4.5" fill="${col}"/>`;
        }
        if (pulling && pullPt) {
            g += `<line x1="${s.x}" y1="${s.y}" x2="${pullPt.x}" y2="${pullPt.y}" stroke="#9aa1ab" stroke-width="1.5" stroke-dasharray="3 5" opacity="0.8"/>`;
            g += `<circle cx="${pullPt.x}" cy="${pullPt.y}" r="5" fill="none" stroke="#9aa1ab" stroke-width="1.5"/>`;
        }
        guideG.innerHTML = g;
    }

    function render() {
        if (!state) {
            boardG.innerHTML = STATIC;
            hud.note.textContent = "Waiting for host…";
            hud.note.hidden = false;
            hud.turn.textContent = "WAIT HOST";
            controlsEl.classList.add("off");
            shootBtn.disabled = true;
            hudShoot.disabled = true;
        } else {
            syncTurnUi();
            const flip = flipped();
            worldG.setAttribute("transform", flip ? "rotate(180 220 220)" : "");
            let s = STATIC;
            for (const c of state.coins) s += coinSvg(c);
            s += strikerSvg(state.striker);
            boardG.innerHTML = s;
            renderGuide();

            hud.wleft.textContent = N_COINS - clearedCount(state, "white");
            hud.bleft.textContent = N_COINS - clearedCount(state, "black");
            hud.wscore.textContent = state.scores.w;
            hud.bscore.textContent = state.scores.b;
            const live = state.phase !== "over";
            chips.w.classList.toggle("on", live && state.turn === "w");
            chips.b.classList.toggle("on", live && state.turn === "b");
            hud.turn.textContent =
                state.phase === "over"
                    ? "GAME OVER"
                    : state.phase === "sim"
                        ? "IN PLAY"
                        : isMyTurnAim()
                            ? "YOUR TURN"
                            : online ? "RIVAL TURN" : "AI TURN";
            const noteText = state.note || "";
            hud.note.textContent = noteText;
            hud.note.hidden = !noteText;
            hud.power.textContent = Math.round(aimPower * 100);
            powerEl.style.width = Math.round(aimPower * 100) + "%";
            const can = isMyTurnAim();
            controlsEl.classList.toggle("off", !can);
            shootBtn.disabled = !can;
            hudShoot.disabled = !can;

            const isOver = state.phase === "over";
            if (isOver) {
                const iWin = state.winner === mySide();
                overTitle.textContent = online ? (iWin ? "You win" : "Opponent wins") : (iWin ? "You win" : "AI wins");
                overTitle.className = "ca-over-title " + (iWin ? "win" : "lose");
                overSub.textContent =
                    "White " + state.scores.w + " · Black " + state.scores.b +
                    (!online ? " · Best " + best : "");
            }
        }
        syncUI();
    }

    function syncUI() {
        const isOver = Boolean(state && state.phase === "over");
        ov.over.hidden = !isOver || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", Object.values(cheats).some(Boolean));
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".ca-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        }
    }

    function pop(wx, wy, text) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
        const x = flipped() ? BOARD - wx : wx;
        const y = flipped() ? BOARD - wy : wy;
        el.setAttribute("x", x);
        el.setAttribute("y", y - 18);
        el.setAttribute("text-anchor", "middle");
        el.setAttribute("class", "ca-pop");
        el.textContent = text;
        fxG.appendChild(el);
        later(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 850);
    }

    /* ---------- sync ---------- */
    function publish() {
        state.seq++;
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    function applyAction(a, actor) {
        if (!authority || !a) return;
        if (a.t === "restart") { newGame(); return; }
        if (!state || state.phase !== "aim" || state.winner) return;
        const side = online ? state.sides[actor] : "w";
        if (side !== state.turn) return;
        if (a.t === "shoot") {
            if (!Number.isFinite(a.angle) || !Number.isFinite(a.power) || !Number.isFinite(a.x)) return;
            doShoot(clampX(a.x), a.angle, clamp01(a.power));
        }
    }

    /* ---------- turn flow (authority only) ---------- */
    function snapshotBefore() {
        const own = state.turn === "w" ? "white" : "black";
        before = {
            o: clearedCount(state, own),
            q: state.coins.filter((c) => c.pocketed && c.queen).length,
            s: state.striker.pocketed,
        };
    }

    function doShoot(x, angle, power) {
        state.striker.x = clampX(x);
        state.striker.y = BASE_Y[state.turn];
        const v = shotVel(angle, power);
        state.striker.vx = v.vx;
        state.striker.vy = v.vy;
        snapshotBefore();
        state.phase = "sim";
        state.note = "";
        simTime = 0;
        acc = 0;
        pubT = 0;
        pulling = false;
        pullPt = null;
        ptrMode = null;
        publish();
    }

    function finishBest() {
        if (online) return;
        try {
            if (state.scores.w > best) {
                best = state.scores.w;
                localStorage.setItem(META.bestKey, String(best));
            }
        } catch (_) { }
    }

    function resolveShot() {
        const side = state.turn;
        const own = side === "w" ? "white" : "black";
        const name = side === "w" ? "White" : "Black";
        const now = {
            o: clearedCount(state, own),
            q: state.coins.filter((c) => c.pocketed && c.queen).length,
            s: state.striker.pocketed,
        };
        const dO = now.o - before.o, dQ = now.q - before.q;
        const foul = now.s && !before.s;
        const ignoreFoul = !online && cheats.noFoul && side === "w";
        let extra = false;
        if (dO > 0) { state.scores[side] += 100 * dO; pop(220, side === "w" ? 300 : 140, "+" + 100 * dO); }
        if (dQ > 0) { state.scores[side] += 200; pop(220, side === "w" ? 278 : 162, "Queen +200"); }
        if (foul && !ignoreFoul) {
            state.scores[side] = Math.max(0, state.scores[side] - 50);
            state.note = name + " foul −50";
        } else if (dO + dQ > 0) {
            extra = true;
            state.note = name + (dQ > 0 ? " · queen +200" : " +" + 100 * dO) + " · extra turn";
        } else {
            state.note = name + " · no pocket";
        }
        if (foul && ignoreFoul) state.note += " · foul ignored";

        const wDone = clearedCount(state, "white") >= N_COINS;
        const bDone = clearedCount(state, "black") >= N_COINS;
        if (wDone || bDone) {
            state.winner = wDone ? "w" : "b";
            state.phase = "over";
            finishBest();
            publish();
            return;
        }
        if (!extra) state.turn = side === "w" ? "b" : "w";
        state.turnId++;
        respawn(state.turn);
        state.phase = "aim";
        publish();
        if (!online && state.turn === "b") scheduleAi();
    }

    function scheduleAi() {
        clearAiTimers();
        later(() => {
            if (!state || state.phase !== "aim" || state.turn !== "b") return;
            const a = aiAim(
                state, Math.random,
                cheats.weakAI ? 0.55 : 0.07,
                cheats.weakAI ? 0.3 : 0.62,
                cheats.weakAI ? 0.7 : 0.38,
            );
            state.striker.x = a ? a.sx : 220;
            state.striker.y = BASE_Y.b;
            state.note = "AI aiming";
            render();
            later(() => {
                if (!state || state.phase !== "aim" || state.turn !== "b") return;
                doShoot(a ? a.sx : 220, a ? a.angle : Math.PI / 2, a ? a.power : 0.8);
            }, 600);
        }, 700);
    }

    function newGame() {
        clearAiTimers();
        paused = false;
        lastT = 0;
        state = freshState();
        lastTurnId = -1;
        acc = 0;
        simTime = 0;
        pubT = 0;
        cheatsOpen = false;
        publish();
        if (!online && state.turn === "b") scheduleAi();
    }

    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) pauseTimers();
        else { resumeTimers(); lastT = 0; /* discard the wall-clock gap */ }
        render();
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }

    /* ---------- main loop ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) { lastT = t; return; }
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (paused) return; /* freeze physics + bot; lastT keeps advancing */
        if (!state || state.phase !== "sim") return;
        const scale = !online && cheats.slow ? 0.45 : 1;
        acc += dt * scale;
        let guard = 0;
        while (acc >= DT && guard < 6) {
            stepPhysics(state, pocketRFor);
            acc -= DT;
            simTime += DT;
            guard++;
        }
        if (guard >= 6) acc = 0;
        render();
        if (authority) {
            if (online) {
                pubT += dt;
                if (pubT > 0.12) { pubT = 0; publish(); }
            }
            if (allStopped(state) || simTime > 9) {
                [state.striker].concat(state.coins).forEach((b) => { b.vx = 0; b.vy = 0; });
                resolveShot();
            }
        } else if (allStopped(state) || simTime > 9) {
            /* guest freezes and waits for the host snapshot */
            acc = 0;
        }
    }

    /* ---------- pointer input (slingshot pull + baseline slide) ---------- */
    function toBoard(e) {
        const r = svgEl.getBoundingClientRect();
        const scale = Math.min(r.width, r.height) / BOARD || 1; /* xMidYMid meet */
        const ox = (r.width - BOARD * scale) / 2;
        const oy = (r.height - BOARD * scale) / 2;
        let x = (e.clientX - r.left - ox) / scale;
        let y = (e.clientY - r.top - oy) / scale;
        if (flipped()) { x = BOARD - x; y = BOARD - y; }
        return { x, y };
    }

    function slideTo(x) {
        /* local preview only; final x travels with the shoot action */
        state.striker.x = clampX(x);
        state.striker.y = BASE_Y[mySide()];
        render();
    }

    function updatePull(p) {
        pullPt = p;
        const s = state.striker;
        const dx = s.x - p.x, dy = s.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
            aimAngle = Math.atan2(dy, dx);
            aimPower = clamp01(d / 150);
        }
        render();
    }

    function fireShot() {
        if (!isMyTurnAim()) return;
        submitAction({ t: "shoot", x: state.striker.x, angle: aimAngle, power: aimPower });
    }

    function onPointerDown(e) {
        if (!isMyTurnAim()) return;
        const p = toBoard(e);
        const s = state.striker;
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < 46) {
            ptrMode = "pull";
            pulling = true;
            updatePull(p);
        } else if (Math.abs(p.y - BASE_Y[mySide()]) < 24) {
            ptrMode = "slide";
            slideTo(p.x);
        } else return;
        if (svgEl.setPointerCapture) { try { svgEl.setPointerCapture(e.pointerId); } catch (_) { } }
        e.preventDefault();
    }
    function onPointerMove(e) {
        if (!ptrMode || !isMyTurnAim()) return;
        const p = toBoard(e);
        if (ptrMode === "pull") updatePull(p);
        else slideTo(p.x);
    }
    function onPointerUp(e) {
        if (ptrMode === "pull") {
            const p = toBoard(e);
            const s = state.striker;
            const d = Math.hypot(s.x - p.x, s.y - p.y);
            pulling = false;
            pullPt = null;
            ptrMode = null;
            if (d >= 14) fireShot();
            else render();
        } else {
            ptrMode = null;
        }
    }
    function onPointerCancel() {
        pulling = false;
        pullPt = null;
        ptrMode = null;
        render();
    }

    svgEl.addEventListener("pointerdown", onPointerDown);
    svgEl.addEventListener("pointermove", onPointerMove);
    svgEl.addEventListener("pointerup", onPointerUp);
    svgEl.addEventListener("pointercancel", onPointerCancel);

    /* ---------- virtual buttons (hold to repeat) ---------- */
    const screenDir = (d) => (flipped() ? -d : d);
    const ctlFns = {
        left: () => { if (isMyTurnAim()) slideTo(state.striker.x + screenDir(-6)); },
        right: () => { if (isMyTurnAim()) slideTo(state.striker.x + screenDir(6)); },
        rotl: () => { if (isMyTurnAim()) { aimAngle -= 0.03; render(); } },
        rotr: () => { if (isMyTurnAim()) { aimAngle += 0.03; render(); } },
        powd: () => { if (isMyTurnAim()) { aimPower = clamp01(aimPower - 0.04); render(); } },
        powu: () => { if (isMyTurnAim()) { aimPower = clamp01(aimPower + 0.04); render(); } },
    };
    root.querySelectorAll("[data-ctl]").forEach((btn) => {
        const key = btn.dataset.ctl;
        if (key === "shoot") return; // handled by click delegation
        const fn = ctlFns[key];
        let iv = null;
        const stop = () => { if (iv) { clearInterval(iv); iv = null; } };
        const start = (e) => {
            e.preventDefault();
            if (btn.disabled || !isMyTurnAim()) return;
            fn();
            stop();
            iv = setInterval(() => { if (isMyTurnAim()) fn(); else stop(); }, 70);
            if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (_) { } }
        };
        btn.addEventListener("pointerdown", start);
        btn.addEventListener("pointerup", stop);
        btn.addEventListener("pointercancel", stop);
        holdStops.push(stop);
    });

    /* ---------- keyboard (desktop) ---------- */
    function onKey(e) {
        if (destroyed) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const c = e.code;
        /* priority: help -> cheats -> pause/escape -> game actions */
        if (c === "KeyH") { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!e.repeat && !online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); } e.preventDefault(); return; }
        if (c === "KeyP") { if (!e.repeat && !helpOpen && !cheatsOpen) togglePause(); e.preventDefault(); return; }
        if (c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (paused) togglePause(false);
            e.preventDefault();
            return;
        }
        if (c === "KeyR") { if (!e.repeat && !helpOpen && !cheatsOpen) submitAction({ t: "restart" }); e.preventDefault(); return; }
        if (helpOpen || cheatsOpen || paused) { e.preventDefault(); return; }
        const gameKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter", "KeyA", "KeyD"];
        if (!gameKeys.includes(c)) return;
        e.preventDefault();
        if (!isMyTurnAim()) return;
        if (c === "ArrowLeft") slideTo(state.striker.x + screenDir(-8));
        else if (c === "ArrowRight") slideTo(state.striker.x + screenDir(8));
        else if (c === "ArrowUp") { aimPower = clamp01(aimPower + 0.05); render(); }
        else if (c === "ArrowDown") { aimPower = clamp01(aimPower - 0.05); render(); }
        else if (c === "KeyA") { aimAngle -= 0.035; render(); }
        else if (c === "KeyD") { aimAngle += 0.035; render(); }
        else if ((c === "Space" || c === "Enter") && !e.repeat) fireShot();
    }
    document.addEventListener("keydown", onKey);

    /* ---------- cheats (AI mode only) ---------- */
    function onCheatChange(e) {
        const k = e.target && e.target.dataset ? e.target.dataset.cheat : null;
        if (!k || online) return;
        cheats[k] = Boolean(e.target.checked);
        render();
    }
    ov.cheat.addEventListener("change", onCheatChange);

    function cheatAction(kind) {
        if (online || !state) return;
        if (kind === "skip") {
            if (state.phase === "aim" && state.turn === "b" && !state.winner) {
                clearAiTimers();
                state.turn = "w";
                state.turnId++;
                respawn("w");
                state.note = "Cheat · AI turn skipped";
                render();
            }
        } else if (kind === "pocket") {
            if (!isMyTurnAim()) return;
            const c = state.coins.find((x) => !x.pocketed && x.color === "white");
            if (!c) return;
            let np = POCKETS[0], nd = Infinity;
            for (const p of POCKETS) {
                const d = Math.hypot(c.x - p[0], c.y - p[1]);
                if (d < nd) { nd = d; np = p; }
            }
            c.pocketed = true;
            c.x = np[0];
            c.y = np[1];
            state.scores.w += 100;
            pop(220, 300, "+100");
            state.note = "Cheat · white pocketed";
            if (clearedCount(state, "white") >= N_COINS) {
                state.winner = "w";
                state.phase = "over";
                finishBest();
            }
            render();
        }
    }

    /* ---------- click delegation ---------- */
    function handleClick(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { if (!online) { cheatsOpen = !cheatsOpen; render(); } return; }
        if (t.closest("[data-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { submitAction({ t: "restart" }); return; }
        const ca = t.closest("[data-cheat-act]");
        if (ca) { cheatAction(ca.dataset.cheatAct); return; }
        if (t.closest("[data-shoot]") || t.closest('[data-ctl="shoot"]')) { fireShot(); return; }
        if (t === ov.cheat) { cheatsOpen = false; render(); return; }
        if (t === ov.pause) { togglePause(false); return; }
        if (t === ov.help) { toggleHelp(false); return; }
    }
    root.addEventListener("click", handleClick);

    /* ---------- boot ---------- */
    boardG.innerHTML = STATIC;
    syncUI();
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            newGame();
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            render();
            const u3 = room.onState((nextState) => {
                if (!nextState) return;
                if (state && nextState.seq < state.seq) return;
                state = nextState;
                if (state.phase !== "sim") { acc = 0; simTime = 0; }
                render();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        newGame(); // random coin toss decides who starts
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            svgEl.removeEventListener("pointerdown", onPointerDown);
            svgEl.removeEventListener("pointermove", onPointerMove);
            svgEl.removeEventListener("pointerup", onPointerUp);
            svgEl.removeEventListener("pointercancel", onPointerCancel);
            ov.cheat.removeEventListener("change", onCheatChange);
            clearAiTimers();
            holdStops.forEach((stop) => stop());
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
            if (raf) { cancelAnimationFrame(raf); raf = null; }
        },
    };
}