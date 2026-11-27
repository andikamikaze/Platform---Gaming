/* ==== games/basketball-shot.js ==== */
import { iconSVG } from "../JS/icons.js";

/* Template-compatible module: export function mount(root, context).
   Register its metadata + module path in GAMES inside app.js, e.g.:
   { id: "basketball-shot", name: "Basketball Shot", category: "Sports",
     module: "./games/basketball-shot.js" }   (match your existing entry shape)

   Realtime 2D side-scrolling basketball.
   - AI mode  : you vs bot, random first shooter, random solvable course.
   - Room mode: host-authoritative; shot params are synced and the ball is
     re-simulated deterministically on every client, so the flight animates
     in realtime on both screens. Random player slots + random first shooter.
*/

export const META = {
    id: "basketball-shot",
    name: "Basketball Shot",
    category: "sports",
    catLabel: "Sports",
    desc: "Aim, charge the power bar, and sink baskets from three distances.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7v34"/><path d="M16 13.6A15.5 15.5 0 0 0 16 34.4M32 13.6A15.5 15.5 0 0 1 32 34.4"/></svg>`,
    bg: ["#fdba74", "#f97316"],
};

/* ---------------- shared constants + pure physics (no DOM) ---------------- */
const WORLD = 1600, VW = 880, H = 520;
const FLOOR = 470, R = 13, HAND_Y = 338;
const GRAVITY = 620;
const REST_RIM = 0.6, REST_BOARD = 0.65, REST_FLOOR = 0.55;
const RIM_X = 1400, RIM_W = 72, RIM_Y = 280, TUBE = 5;
const BOARD_X = 1490, BOARD_TOP = 140, BOARD_BOT = 310;
const V_MIN = 350, V_MAX = 740;
const DT = 1 / 240, MAX_STEPS = 240 * 8, REST_STEPS = 90, REST_SPEED = 18;
const THREE_X = 950;
const ROUNDS = 5, MAX_ROUNDS = 8;
const BANDS = [
    { label: "Near", lo: 1120, hi: 1200 },
    { label: "Mid", lo: 980, hi: 1070 },
    { label: "Far", lo: 820, hi: 920 },
];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clamp01(v) { return clamp(v, 0, 1); }
function pointsFor(x) { return x < THREE_X ? 3 : 2; }
function launchSpeed(p) { return V_MIN + (V_MAX - V_MIN) * clamp01(p); }

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function collideTube(b, cx, cy) {
    const dx = b.x - cx, dy = b.y - cy;
    const d = Math.hypot(dx, dy), min = R + TUBE;
    if (d < min && d > 0.0001) {
        const nx = dx / d, ny = dy / d;
        b.x = cx + nx * min; b.y = cy + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
            b.vx -= (1 + REST_RIM) * vn * nx;
            b.vy -= (1 + REST_RIM) * vn * ny;
        }
        b.rim = true;
    }
}

function stepOnce(b) {
    b.vy += GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    collideTube(b, RIM_X, RIM_Y);
    collideTube(b, RIM_X + RIM_W, RIM_Y);
    if (b.vx > 0 && b.x + R > BOARD_X && b.y > BOARD_TOP - R && b.y < BOARD_BOT + R) {
        b.x = BOARD_X - R;
        b.vx = -b.vx * REST_BOARD;
        b.board = true;
    }
    if (b.y + R > FLOOR) {
        b.y = FLOOR - R;
        if (b.vy > 60) { b.vy = -b.vy * REST_FLOOR; b.vx *= 0.98; }
        else { b.vy = 0; b.vx *= Math.max(0, 1 - 3 * DT); }
    }
}

/* returns "", "made", "rest" or "out" */
function simStep(b) {
    b.py = b.y;
    stepOnce(b);
    if (b.py <= RIM_Y && b.y > RIM_Y && b.vy > 0 &&
        b.x > RIM_X + 2 && b.x < RIM_X + RIM_W - 2) return "made";
    if (b.x < -60 || b.x > WORLD + 60) return "out";
    if (Math.hypot(b.vx, b.vy) < REST_SPEED) {
        b.rest = (b.rest || 0) + 1;
        if (b.rest > REST_STEPS) return "rest";
    } else b.rest = 0;
    return "";
}

/* deterministic simulation - identical on host, guest and offline */
function simulateShot(x0, y0, angleDeg, power) {
    const v = launchSpeed(power), a = (angleDeg * Math.PI) / 180;
    const b = {
        x: x0, y: y0, py: y0,
        vx: Math.cos(a) * v, vy: -Math.sin(a) * v,
        rim: false, board: false, rest: 0,
    };
    let made = false, steps = 0;
    const samples = [[Math.round(x0), Math.round(y0)]];
    while (steps < MAX_STEPS) {
        steps++;
        const ev = simStep(b);
        if (ev === "made") { made = true; break; }
        if (ev === "out" || ev === "rest") break;
        if (steps % 12 === 0 && samples.length < 80) {
            samples.push([Math.round(b.x), Math.round(b.y)]);
        }
    }
    return {
        made: made, points: made ? pointsFor(x0) : 0,
        hitRim: !!b.rim, hitBoard: !!b.board,
        steps: steps, samples: samples,
    };
}

/* solvability search - guarantees every generated spot can be scored */
const SOL_ANGLES = [54, 57, 60, 63, 66, 69, 72, 51, 48, 45, 42, 39, 36, 75, 33, 30];
const SOL_CACHE = new Map();
function findSolution(x0) {
    if (SOL_CACHE.has(x0)) return SOL_CACHE.get(x0);
    let found = null;
    outer:
    for (let ai = 0; ai < SOL_ANGLES.length; ai++) {
        const a = SOL_ANGLES[ai];
        for (let pi = 0; pi <= 33; pi++) {
            const p = Math.round((0.30 + pi * 0.02) * 1000) / 1000;
            if (simulateShot(x0, HAND_Y, a, p).made) {
                found = { angle: a, power: p };
                break outer;
            }
        }
    }
    SOL_CACHE.set(x0, found);
    return found;
}

/* random level generator - every spot is verified solvable before use */
function makeSpot(rng, prevBand) {
    let band = Math.floor(rng() * 3);
    if (band === prevBand) band = (band + 1 + Math.floor(rng() * 2)) % 3;
    const B = BANDS[band];
    let x = B.lo + Math.floor(rng() * (B.hi - B.lo + 1));
    for (let i = 0; i < 8 && !findSolution(x); i++) {
        x = clamp(x + (rng() < 0.5 ? -12 : 12), B.lo, B.hi);
    }
    if (!findSolution(x)) x = Math.round((B.lo + B.hi) / 2);
    return { x: x, band: band, label: B.label, pts: pointsFor(x) };
}
function makeCourse(rng, n) {
    const spots = [];
    let prev = -1;
    for (let i = 0; i < n; i++) {
        const s = makeSpot(rng, prev);
        spots.push(s);
        prev = s.band;
    }
    return spots;
}

/* Firebase-safe state: no null fields that matter (winner: -1 = playing) */
function freshState(names, hostSlot) {
    const seed = Math.floor(Math.random() * 2147483647);
    const first = Math.random() < 0.5 ? 0 : 1;
    return {
        v: 1,
        gid: seed.toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36),
        phase: "aim",
        hostSlot: hostSlot,
        first: first,
        names: [names[0], names[1]],
        seed: seed,
        spots: makeCourse(mulberry32(seed), ROUNDS),
        shots: [0, 0], scores: [0, 0], makes: [0, 0],
        turn: first, shot: null, last: null, winner: -1, seq: 0,
    };
}

/* ------------------------------- module ------------------------------- */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room ? room.room : null;
    let state = null;
    let destroyed = false;

    const cleanName = (n) => String(n || "").trim().slice(0, 18) || "Player";
    const meName = cleanName(playerName);

    /* local (non-synced) UI state */
    let gid = "";
    let myAngle = 52, charging = false, phase = 0, power = 0;
    let pending = false, pendingTO = 0;
    let botTimer = 0, botPlan = null, resolveTimer = 0;
    let cheatOpen = false, helpOpen = false, paused = false;
    let frozen = false, freezeAt = 0;
    const liveTimers = new Set();
    const cheats = { preview: false, slow: false, blind: false };

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("basketballShotHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("basketballShotHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }
    let flashT = 0, lastPrev = 0;
    let cam = 0, lastCam = -1, raf = 0, lastT = 0;
    let svgDrag = false, helloSent = false;
    const anim = { active: false, id: 0, by: 0, x0: 0, ball: null, made: false, madeSteps: 0, steps: 0, acc: 0, trail: [] };
    const cleanups = [];

    /* ------------------------------ markup ------------------------------ */
    root.innerHTML = `
<style>
.bsh{--panel:#101a30;--court:#0f1830;--line:#24304d;--ink:#e8eefb;--mut:#8ea0c0;--acc:#fbbf24;--good:#34d399;--bad:#f87171;
  color:var(--ink);display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:0}
.bsh *{box-sizing:border-box}
.bsh [hidden]{display:none!important}
.bsh-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.bsh-info{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1 1 auto;min-width:0}
.bsh-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.bsh-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
.bsh-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.bsh .game-status{display:inline-flex;align-items:center;gap:7px;min-height:32px}
.bsh .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none}
.bsh-spacer{flex:1 1 auto}
.bsh-btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:9px;min-height:36px;padding:0 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;transition:border-color .16s,background .16s}
.bsh-btn:hover{border-color:var(--mut)}
.bsh-btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.bsh-btn:disabled{opacity:.35;cursor:default}
.bsh-btn.acc,.bsh-btn.on{border-color:var(--acc);color:var(--acc)}
.bsh .bsh-icon-btn{display:inline-flex;align-items:center;gap:6px}
.bsh .bsh-icon-btn svg{flex:none;display:block}
.bsh-side{display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--mut)}
.bsh-side .bsh-dot{width:8px;height:8px;border-radius:50%;border:1px solid var(--mut);flex:none}
.bsh-side.on{color:var(--ink)}
.bsh-side.on .bsh-dot{background:var(--acc);border-color:var(--acc)}
.bsh-side b{font-size:15px;font-variant-numeric:tabular-nums;color:var(--ink)}
.bsh-side .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:96px}
.bsh-ctrl{display:flex;align-items:center;gap:6px;flex-wrap:nowrap}
.bsh-angle{min-width:52px;text-align:center;font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}
.bsh-angle b{color:var(--ink);font-size:15px}
.bsh-power{width:96px;height:8px;border-radius:999px;background:var(--panel);border:1px solid var(--line);overflow:hidden}
.bsh-power i{display:block;height:100%;width:0;background:var(--good)}
.bsh-power i.mid{background:var(--acc)}
.bsh-power i.high{background:var(--bad)}
.bsh-shoot{min-width:108px;height:44px;letter-spacing:.1em}
.bsh-shoot.armed{background:var(--acc);color:#1a1206;border-color:var(--acc)}
.bsh-board{position:relative;width:100%;flex:1 1 auto;min-height:0;border:1px solid var(--line);border-radius:10px;background:var(--court);overflow:hidden}
.bsh-svg{display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none}
.bsh-flash{position:absolute;left:0;right:0;top:15%;text-align:center;font-size:22px;font-weight:800;color:var(--acc);pointer-events:none;letter-spacing:.02em}
.bsh-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(7,11,22,.74);backdrop-filter:blur(3px);z-index:5;padding:16px}
.bsh-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 20px;width:min(420px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;text-align:center;overflow:hidden}
.bsh-card h3{margin:0;font-size:18px}
.bsh-card h3.win{color:var(--good)}
.bsh-card h3.lose{color:var(--bad)}
.bsh-card .sub{margin:0;color:var(--mut);font-size:13px;line-height:1.5}
.bsh-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
.bsh-head h3{font-size:15px}
.bsh-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
.bsh-cheats,.bsh-help{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
.bsh-help{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
.bsh-help>div{display:flex;flex-direction:column;min-width:0}
.bsh-help b{display:block;margin-bottom:5px;color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
.bsh-help ul{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
.bsh-help .bsh-foot{margin-top:auto;padding-top:10px}
.bsh-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--court);color:var(--ink);font:inherit}
.bsh-note{color:var(--mut);font-size:11px;line-height:1.5}
.bsh-card .bsh-btn{min-height:44px}
.bsh-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;text-align:left;min-height:44px}
.bsh-switch{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid var(--line);background:var(--court);cursor:pointer;flex:none;padding:0;transition:border-color .16s,background .16s}
.bsh-switch:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.bsh-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mut);transition:left .16s,background .16s}
.bsh-switch[aria-pressed="true"]{border-color:var(--acc);background:rgba(251,191,36,.15)}
.bsh-switch[aria-pressed="true"]:after{left:20px;background:var(--acc)}
@media (pointer:coarse){.bsh-switch{width:48px;height:28px}.bsh-switch:after{width:22px;height:22px}.bsh-switch[aria-pressed="true"]:after{left:24px}}
@media (prefers-reduced-motion:reduce){.bsh *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
/* --- layout redesign overrides (keep last) --- */
.bsh.game-fill > .bsh-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.bsh.game-fill > .bsh-board:not(:has(.bsh-overlay:not([hidden]))){aspect-ratio:880/520;flex:0 0 auto}
.bsh.game-fill > .bsh-board:has(.bsh-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.bsh .bsh-hud{gap:5px;margin-bottom:0;flex-direction:column;align-items:stretch}
.bsh .bsh-info{gap:5px;flex-wrap:wrap}
.bsh .bsh-tools{gap:5px;flex-wrap:nowrap;justify-content:space-between}
.bsh .bsh-hud .bsh-chip{padding:4px 6px;font-size:9px}
.bsh .bsh-hud .bsh-chip[data-hud="first"],.bsh .bsh-hud .game-status{display:none}
.bsh .bsh-hud .bsh-btn{min-height:32px;padding:5px 4px;font-size:9px}
.bsh .bsh-hud .bsh-btn-label,.bsh .bsh-spacer{display:none}
.bsh .bsh-hud .bsh-ctrl{gap:3px}
.bsh .bsh-angle{min-width:28px;font-size:10px}
.bsh .bsh-angle b{font-size:12px}
.bsh .bsh-power{width:32px}
.bsh .bsh-shoot{min-width:58px;height:32px;padding:0 5px;font-size:10px}
.bsh .bsh-side .nm{max-width:58px}
.bsh-overlay{padding:8px}
.bsh .bsh-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.bsh .bsh-cheats,.bsh .bsh-help{scrollbar-width:none}
.bsh .bsh-cheats::-webkit-scrollbar,.bsh .bsh-help::-webkit-scrollbar{display:none}
.bsh .bsh-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.bsh .bsh-note{display:none}
}
</style>
<div class="game-app bsh game-fill" data-bsh>
  <div class="bsh-hud">
    <div class="bsh-info">
    <span class="bsh-chip game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <span class="bsh-chip bsh-score">
      <span class="bsh-side" data-side="0"><i class="bsh-dot"></i><span class="nm" data-nm="0">-</span><b data-pts="0">0</b></span>
      <span class="bsh-sep">:</span>
      <span class="bsh-side" data-side="1"><b data-pts="1">0</b><span class="nm" data-nm="1">-</span><i class="bsh-dot"></i></span>
    </span>
    <span class="bsh-chip" data-round>Round 1/${ROUNDS}</span>
    <span class="bsh-chip" data-hud="first">FIRST &mdash;</span>
    <span class="bsh-spacer"></span>
    </div>
    <div class="bsh-tools">
    <div class="bsh-ctrl">
      <button class="bsh-btn" type="button" data-hold="dn" aria-label="Angle down">&minus;</button>
      <span class="bsh-angle"><b data-angle>52</b>&deg;</span>
      <button class="bsh-btn" type="button" data-hold="up" aria-label="Angle up">+</button>
      <span class="bsh-power"><i data-power></i></span>
      <button class="bsh-btn acc bsh-shoot" type="button" data-shoot>SHOOT</button>
    </div>
    <button class="bsh-btn bsh-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bsh-btn-label">Help</span></button>
    <button class="bsh-btn bsh-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bsh-btn-label">Cheats</span></button>
    <button class="bsh-btn bsh-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bsh-btn-label">Pause</span></button>
    <button class="bsh-btn bsh-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bsh-btn-label">Restart</span></button>
    <button class="bsh-btn bsh-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bsh-btn-label">Exit game</span></button>
    </div>
  </div>
  <section class="game-panel bsh-board" data-board>
      <svg class="bsh-svg" data-svg viewBox="0 0 ${VW} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Basketball court">
        <rect x="0" y="${FLOOR}" width="${WORLD}" height="${H - FLOOR}" fill="#131f3a"/>
        <line x1="0" y1="${FLOOR}" x2="${WORLD}" y2="${FLOOR}" stroke="#2c3a5c" stroke-width="2"/>
        <line x1="${THREE_X}" y1="336" x2="${THREE_X}" y2="${FLOOR}" stroke="#2c3a5c" stroke-width="2" stroke-dasharray="6 8"/>
        <text x="${THREE_X - 14}" y="352" text-anchor="end" font-size="11" fill="#5c6f96" letter-spacing="2">3 PTS</text>
        <text x="${THREE_X + 14}" y="352" text-anchor="start" font-size="11" fill="#5c6f96" letter-spacing="2">2 PTS</text>
        <rect x="${BOARD_X + 8}" y="120" width="10" height="${FLOOR - 120}" fill="#22304f"/>
        <rect x="${BOARD_X}" y="${BOARD_TOP}" width="8" height="${BOARD_BOT - BOARD_TOP}" fill="#0f1830" stroke="#94a3b8" stroke-width="2"/>
        <rect x="${BOARD_X + 1.5}" y="252" width="5" height="48" fill="none" stroke="#ef4444" stroke-width="1.5"/>
        <path d="M${RIM_X + RIM_W} ${RIM_Y + 3} L${BOARD_X} ${RIM_Y + 10}" stroke="#f87171" stroke-width="4"/>
        <line x1="${RIM_X}" y1="${RIM_Y}" x2="${RIM_X + RIM_W}" y2="${RIM_Y}" stroke="#f87171" stroke-width="5" stroke-linecap="round"/>
        <g stroke="#64748b" stroke-width="1.2" opacity="0.55" fill="none">
          <line x1="${RIM_X + 3}" y1="${RIM_Y + 6}" x2="${RIM_X + 12}" y2="${RIM_Y + 52}"/>
          <line x1="${RIM_X + 19}" y1="${RIM_Y + 6}" x2="${RIM_X + 21}" y2="${RIM_Y + 52}"/>
          <line x1="${RIM_X + 36}" y1="${RIM_Y + 6}" x2="${RIM_X + 34}" y2="${RIM_Y + 52}"/>
          <line x1="${RIM_X + 52}" y1="${RIM_Y + 6}" x2="${RIM_X + 46}" y2="${RIM_Y + 52}"/>
          <line x1="${RIM_X + 69}" y1="${RIM_Y + 6}" x2="${RIM_X + 58}" y2="${RIM_Y + 52}"/>
          <line x1="${RIM_X + 5}" y1="${RIM_Y + 26}" x2="${RIM_X + 67}" y2="${RIM_Y + 26}"/>
          <line x1="${RIM_X + 8}" y1="${RIM_Y + 42}" x2="${RIM_X + 62}" y2="${RIM_Y + 42}"/>
        </g>
        <g data-el="spot" visibility="hidden">
          <polygon points="-7,${FLOOR} 7,${FLOOR} 0,${FLOOR - 11}" fill="#fbbf24"/>
          <text data-el="spotTxt" y="${FLOOR + 27}" text-anchor="middle" font-size="11" fill="#8ea0c0" letter-spacing="1.5"></text>
        </g>
        <g data-el="player" visibility="hidden" stroke="#38bdf8" fill="#38bdf8" stroke-width="5" stroke-linecap="round">
          <circle cx="0" cy="362" r="9" stroke="none"/>
          <line x1="0" y1="374" x2="0" y2="424" stroke-width="7"/>
          <line x1="0" y1="380" x2="-11" y2="352"/>
          <line x1="0" y1="380" x2="11" y2="348"/>
          <line x1="0" y1="424" x2="-9" y2="468"/>
          <line x1="0" y1="424" x2="9" y2="468"/>
        </g>
        <polyline data-el="preview" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="3 6" opacity="0.8" points=""/>
        <polyline data-el="trail" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.3" points=""/>
        <g data-el="aimG" visibility="hidden">
          <line data-el="aimLine" x1="18" y1="0" x2="52" y2="0" stroke="#fde047" stroke-width="3" stroke-linecap="round"/>
          <polygon data-el="aimHead" points="52,-6 66,0 52,6" fill="#fde047"/>
        </g>
        <text data-el="angleTxt" text-anchor="middle" font-size="13" font-weight="700" fill="#fde047" visibility="hidden"></text>
        <g data-el="ballG" visibility="hidden">
          <g data-el="ballRot">
            <circle r="${R}" fill="#fb923c" stroke="#9a3412" stroke-width="1.5"/>
            <path d="M-${R} 0H${R}M0 -${R}V${R}" stroke="#9a3412" stroke-width="1.5" fill="none"/>
            <path d="M-6.5 -11.2A14.5 14.5 0 0 0 -6.5 11.2M6.5 -11.2A14.5 14.5 0 0 1 6.5 11.2" stroke="#9a3412" stroke-width="1.5" fill="none"/>
          </g>
        </g>
      </svg>
      <div class="bsh-flash" data-flash></div>
      <div class="bsh-overlay" data-over data-ov="over" hidden>
        <div class="bsh-card">
          <h3 data-over-title></h3>
          <p class="sub" data-over-sub></p>
          <div class="bsh-foot">
            <span class="bsh-note" data-over-wait hidden>Waiting for host&hellip;</span>
            <button class="bsh-btn acc" type="button" data-act="rematch" data-over-rematch>Rematch</button>
          </div>
        </div>
      </div>
      <div class="bsh-overlay" data-ov="cheat" hidden>
        <div class="bsh-card">
          <div class="bsh-head"><h3>Cheats</h3><button class="bsh-btn" type="button" data-act="closeCheats">Close</button></div>
          <div class="bsh-cheats">
            <div class="bsh-cheatrow"><span>Trajectory preview</span><button class="bsh-switch" type="button" data-cheat="preview" aria-pressed="false" aria-label="Trajectory preview"></button></div>
            <div class="bsh-cheatrow"><span>Slow power bar</span><button class="bsh-switch" type="button" data-cheat="slow" aria-pressed="false" aria-label="Slow power bar"></button></div>
            <div class="bsh-cheatrow"><span>Bot always misses</span><button class="bsh-switch" type="button" data-cheat="blind" aria-pressed="false" aria-label="Bot always misses"></button></div>
          </div>
          <div class="bsh-foot"><span class="bsh-note">Host / solo only</span><button class="bsh-btn acc" type="button" data-act="perfect">Perfect shot</button></div>
        </div>
      </div>
      <div class="bsh-overlay" data-ov="pause" hidden>
        <div class="bsh-card">
          <div class="bsh-head"><h3>Paused</h3></div>
          <p class="sub">Flight, timers and the bot are frozen.</p>
          <div class="bsh-foot"><span class="bsh-note">Press P or Esc to resume</span><button class="bsh-btn acc" type="button" data-resume>Resume</button></div>
        </div>
      </div>
      <div class="bsh-overlay" data-ov="help" hidden>
        <div class="bsh-card">
          <div class="bsh-head"><h3>How to play</h3><button class="bsh-btn" type="button" data-help-close>Close</button></div>
          <div class="bsh-help">
            <div>
              <b>Desktop</b>
              <ul>
                <li>Move the mouse over the court to aim, hold left click to charge, release to shoot.</li>
                <li><span class="bsh-kbd">&uarr;</span> / <span class="bsh-kbd">&darr;</span> or <span class="bsh-kbd">W</span> / <span class="bsh-kbd">S</span> adjust the angle.</li>
                <li><span class="bsh-kbd">Space</span> hold to charge and release to shoot.</li>
                <li><span class="bsh-kbd">H</span> help &middot; <span class="bsh-kbd">C</span> cheats &middot; <span class="bsh-kbd">P</span> pause &middot; <span class="bsh-kbd">R</span> restart.</li>
              </ul>
              <b>Mobile</b>
              <ul>
                <li>Drag on the court to aim; use the angle buttons and charge the bar.</li>
                <li>Tap SHOOT (or drag then release) to take the shot.</li>
              </ul>
            </div>
            <div>
              <b>Rules</b>
              <ul>
                <li>Alternate shots with the bot; five rounds per player, then sudden death up to eight.</li>
                <li>Shots inside the three-point arc are worth 3, behind it worth 2.</li>
                <li>Every generated spot is verified solvable &mdash; find the right angle and power.</li>
                <li>The player with the higher score when the rounds end wins.</li>
              </ul>
              <div class="bsh-foot"><span class="bsh-note">Press H to reopen this guide</span><button class="bsh-btn acc" type="button" data-help-close>Got it</button></div>
            </div>
          </div>
        </div>
      </div>
  </section>
</div>`;

    /* ------------------------------- refs ------------------------------- */
    const $ = (s) => root.querySelector(s);
    const fx = (n) => (Math.round(n * 10) / 10).toFixed(1);
    const svg = $("[data-svg]");
    const flashEl = $("[data-flash]");
    const statusEl = $("[data-status]");
    const roundEl = $("[data-round]");
    const firstEl = $('[data-hud="first"]');
    const nmEls = [$('[data-nm="0"]'), $('[data-nm="1"]')];
    const ptsEls = [$('[data-pts="0"]'), $('[data-pts="1"]')];
    const sideEls = [$('[data-side="0"]'), $('[data-side="1"]')];
    const spotG = $('[data-el="spot"]');
    const spotTxt = $('[data-el="spotTxt"]');
    const playerG = $('[data-el="player"]');
    const trailEl = $('[data-el="trail"]');
    const previewEl = $('[data-el="preview"]');
    const aimG = $('[data-el="aimG"]');
    const aimLine = $('[data-el="aimLine"]');
    const aimHead = $('[data-el="aimHead"]');
    const angleTxt = $('[data-el="angleTxt"]');
    const ballG = $('[data-el="ballG"]');
    const ballRot = $('[data-el="ballRot"]');
    const powerFill = $("[data-power]");
    const angleVal = $("[data-angle]");
    const shootBtn = $("[data-shoot]");
    const holdDn = $('[data-hold="dn"]');
    const holdUp = $('[data-hold="up"]');
    const holdBtns = [holdDn, holdUp];
    const overEl = $("[data-over]");
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const overRematch = $("[data-over-rematch]");
    const overWait = $("[data-over-wait]");
    const cheatsEl = $('[data-ov="cheat"]');
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const helpEl = $('[data-ov="help"]');
    const pauseEl = $('[data-ov="pause"]');
    const perfectBtn = $('[data-act="perfect"]');
    const switchEls = Array.prototype.slice.call(root.querySelectorAll("[data-cheat]"));

    /* ------------------------------ helpers ------------------------------ */
    function mySlot() {
        if (!online) return 0;
        const hs = state ? state.hostSlot : 0;
        return room.isHost ? hs : 1 - hs;
    }
    function totalShots() { return state ? state.shots[0] + state.shots[1] : 0; }
    function roundOf() { return Math.floor(totalShots() / 2); }
    function curSpot() {
        if (!state) return null;
        return state.spots[Math.min(roundOf(), state.spots.length - 1)];
    }
    function canAim() {
        return !!state && state.phase === "aim" && state.winner === -1 &&
            state.turn === mySlot() && !anim.active;
    }
    function canShoot() { return canAim() && !pending && !frozen; }
    function toast(msg, secs) { flashEl.textContent = msg; flashT = secs || 1.3; }
    function setAngle(a) {
        myAngle = clamp(Math.round(a * 10) / 10, 15, 80);
        angleVal.textContent = String(Math.round(myAngle));
    }
    function startCharge() {
        if (charging || !canShoot()) return;
        charging = true; phase = 0; power = 0;
        shootBtn.classList.add("armed");
    }
    function releaseCharge() {
        if (!charging) return;
        charging = false;
        shootBtn.classList.remove("armed");
        const p = power;
        power = 0;
        if (canShoot()) submitAction({ type: "shoot", angle: myAngle, power: p });
    }
    function cancelCharge() {
        charging = false; power = 0;
        shootBtn.classList.remove("armed");
    }
    /* Pause-aware timers: wall-clock anchors are shifted on resume so that
       flight resolution, pending shots and the bot do not jump. */
    function later(fn, ms) {
        const rec = { fn: fn, due: Date.now() + ms, id: 0 };
        rec.arm = () => {
            rec.id = setTimeout(() => {
                rec.id = 0;
                if (frozen) return;
                liveTimers.delete(rec);
                fn();
            }, Math.max(0, rec.due - Date.now()));
        };
        liveTimers.add(rec);
        rec.arm();
        return rec;
    }
    function cancelTimer(rec) {
        if (!rec) return;
        if (rec.id) clearTimeout(rec.id);
        rec.id = 0;
        liveTimers.delete(rec);
    }
    function freezeTimers() {
        if (freezeAt) return;
        freezeAt = Date.now();
        liveTimers.forEach((rec) => { if (rec.id) clearTimeout(rec.id); rec.id = 0; });
    }
    function thawTimers() {
        if (!freezeAt) return;
        const shift = Date.now() - freezeAt;
        freezeAt = 0;
        liveTimers.forEach((rec) => { rec.due += shift; rec.arm(); });
    }
    function syncFreeze() {
        const next = paused || helpOpen || cheatOpen;
        if (next === frozen) return;
        frozen = next;
        if (frozen) { cancelCharge(); freezeTimers(); }
        else { thawTimers(); lastT = 0; }
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        syncFreeze();
        renderStatic();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        syncFreeze();
        renderStatic();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) cheatOpen = false;
        syncFreeze();
        renderStatic();
    }
    function clearRoundTimers() {
        if (resolveTimer) { cancelTimer(resolveTimer); resolveTimer = 0; }
        if (botTimer) { cancelTimer(botTimer); botTimer = 0; }
        if (pendingTO) { cancelTimer(pendingTO); pendingTO = 0; }
        botPlan = null; pending = false;
    }
    function resetLocal() {
        clearRoundTimers();
        anim.active = false; anim.id = 0; anim.trail = [];
        cancelCharge();
        setAngle(52);
        cheatOpen = false;
        const s = curSpot();
        cam = s ? clamp(s.x - 160, 0, WORLD - VW) : WORLD - VW;
        lastCam = -1;
        flashEl.textContent = ""; flashT = 0;
        previewEl.setAttribute("points", "");
    }

    /* ------------------------- state watch + anim ------------------------- */
    function watchGame() {
        if (!state) return;
        if (state.gid !== gid) {
            gid = state.gid;
            resetLocal();
            const f = state.first;
            toast(f === mySlot() ? "You shoot first" : state.names[f] + " shoots first", 1.8);
        }
    }
    function maybeStartAnim() {
        if (!state || !state.shot) return;
        if (state.shot.id === anim.id) return;
        startAnim(state.shot);
    }
    function startAnim(shot) {
        pending = false;
        if (pendingTO) { cancelTimer(pendingTO); pendingTO = 0; }
        cancelCharge();
        botPlan = null;
        const a = (shot.angle * Math.PI) / 180, v = launchSpeed(shot.power);
        anim.active = true; anim.id = shot.id; anim.by = shot.by; anim.x0 = shot.x0;
        anim.ball = {
            x: shot.x0, y: HAND_Y, py: HAND_Y,
            vx: Math.cos(a) * v, vy: -Math.sin(a) * v,
            rim: false, board: false, rest: 0, rot: 0,
        };
        anim.made = false; anim.madeSteps = 0; anim.steps = 0; anim.acc = 0; anim.trail = [];
        flashEl.textContent = ""; flashT = 0;
        renderStatic();
    }
    function stepAnim() {
        const b = anim.ball;
        const ev = simStep(b);
        anim.steps++;
        b.rot += (b.vx * DT) / R;
        if (anim.steps % 4 === 0) {
            anim.trail.push([b.x, b.y]);
            if (anim.trail.length > 90) anim.trail.shift();
        }
        if (ev === "made" && !anim.made) {
            anim.made = true;
            toast("+" + pointsFor(anim.x0) + " pts", 1.2);
        }
        if (anim.made) {
            anim.madeSteps++;
            if (anim.madeSteps > 300 || ev === "rest" || ev === "out") finishAnim();
        } else if (ev === "rest" || ev === "out" || anim.steps > MAX_STEPS) {
            finishAnim();
        }
    }
    function finishAnim() {
        anim.active = false;
        const l = state && state.last && state.last.id === anim.id ? state.last : null;
        const made = l ? l.made : anim.made;
        if (!made) {
            const rim = l ? l.rim : anim.ball.rim;
            const board = l ? l.board : anim.ball.board;
            toast(rim ? "Rim out" : board ? "Off the glass" : "Miss", 1.1);
        }
        renderStatic();
    }
    function afterState() { watchGame(); maybeStartAnim(); renderStatic(); }

    /* --------------------------- authoritative --------------------------- */
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action.type !== "string") return;

        if (action.type === "hello") {
            if (!online || actor === state.hostSlot) return;
            const n = cleanName(action.name);
            if (state.names[actor] !== n) { state.names[actor] = n; publish(); }
            return;
        }
        if (action.type === "restart") {
            if (actor !== (online ? state.hostSlot : 0)) return;
            clearRoundTimers();
            const prevHost = state.hostSlot, prevNames = state.names;
            if (online) {
                const hs = Math.random() < 0.5 ? 0 : 1; /* random slots again */
                state = freshState(prevNames, hs);
                if (hs !== prevHost) state.names = [prevNames[1], prevNames[0]];
            } else {
                state = freshState([meName, "Bot"], 0);
            }
            publish();
            return;
        }
        if (action.type === "shoot") {
            if (state.phase !== "aim" || state.winner !== -1 || actor !== state.turn) return;
            const spot = state.spots[roundOf()];
            if (!spot) return;
            let a = Number(action.angle), p = Number(action.power);
            if (!isFinite(a) || !isFinite(p)) return;
            a = Math.round(clamp(a, 15, 80) * 10) / 10;
            p = Math.round(clamp01(p) * 1000) / 1000;
            const sim = simulateShot(spot.x, HAND_Y, a, p);
            state.seq += 1;
            state.shot = { id: state.seq, by: actor, x0: spot.x, angle: a, power: p };
            state.phase = "flight";
            publish();
            const id = state.shot.id;
            const delay = (sim.steps * DT + (sim.made ? 1.6 : 1.05)) * 1000;
            resolveTimer = later(() => {
                resolveTimer = 0;
                if (!destroyed && state && state.shot && state.shot.id === id) resolveShot(sim, id);
            }, delay);
        }
    }
    function resolveShot(sim, id) {
        const by = state.shot.by, x0 = state.shot.x0;
        const pts = sim.made ? pointsFor(x0) : 0;
        state.scores[by] += pts;
        state.makes[by] += sim.made ? 1 : 0;
        state.shots[by] += 1;
        state.last = { id: id, by: by, made: sim.made, points: pts, rim: sim.hitRim, board: sim.hitBoard };
        state.shot = null;
        const total = state.shots[0] + state.shots[1];
        if (total >= state.spots.length * 2) {
            if (state.scores[0] !== state.scores[1]) {
                state.winner = state.scores[0] > state.scores[1] ? 0 : 1;
                state.phase = "over";
            } else if (state.spots.length < MAX_ROUNDS) {
                /* sudden death: one more verified-solvable spot */
                const rng = mulberry32((state.seed + state.spots.length * 7919) >>> 0);
                state.spots.push(makeSpot(rng, state.spots[state.spots.length - 1].band));
                state.phase = "aim";
                state.turn = state.first;
            } else {
                state.winner = "draw";
                state.phase = "over";
            }
        } else {
            state.phase = "aim";
            state.turn = total % 2 === 0 ? state.first : 1 - state.first;
        }
        publish();
    }
    function publish() {
        afterState();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            if (action.type === "shoot") {
                pending = true;
                if (pendingTO) cancelTimer(pendingTO);
                pendingTO = later(() => { pending = false; pendingTO = 0; renderStatic(); }, 2500);
            }
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySlot());
    }

    /* -------------------------------- bot -------------------------------- */
    function planBot() {
        const spot = curSpot();
        if (!spot) return null;
        const sol = findSolution(spot.x);
        if (!sol) return { angle: 75, power: 0.25 };
        if (!cheats.blind && Math.random() < 0.62) {
            return { angle: sol.angle, power: sol.power };
        }
        for (let i = 0; i < 8; i++) {
            const a = clamp(sol.angle + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 8), 15, 80);
            const p = clamp01(sol.power + (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.12));
            if (!simulateShot(spot.x, HAND_Y, a, p).made) {
                return { angle: Math.round(a * 10) / 10, power: Math.round(p * 1000) / 1000 };
            }
        }
        return { angle: 75, power: 0.25 }; /* verified airball fallback */
    }
    function maybeScheduleBot() {
        if (online || destroyed || !state) return;
        if (state.phase !== "aim" || state.winner !== -1 || state.turn !== 1) return;
        if (anim.active || botTimer || pending) return;
        botPlan = planBot();
        botTimer = later(() => {
            botTimer = 0;
            if (destroyed || !state || state.phase !== "aim" || state.turn !== 1) { botPlan = null; return; }
            const plan = botPlan || planBot();
            botPlan = null;
            if (plan) applyAction({ type: "shoot", angle: plan.angle, power: plan.power }, 1);
        }, 1000 + Math.random() * 1100);
    }

    /* ------------------------------ rendering ------------------------------ */
    function renderStatic() {
        if (destroyed) return;
        const st = state, mine = mySlot();
        for (let i = 0; i < 2; i++) {
            nmEls[i].textContent = st ? st.names[i] : "-";
            ptsEls[i].textContent = st ? String(st.scores[i]) : "0";
            sideEls[i].classList.toggle("on", !!st && st.winner === -1 && st.turn === i);
        }
        const r = roundOf();
        roundEl.textContent = !st ? "-" :
            st.phase === "over" ? "Final" :
                r < ROUNDS ? "Round " + (r + 1) + "/" + ROUNDS : "Sudden death";
        let status = "Connecting...";
        if (st) {
            if (st.phase === "over") {
                status = st.winner === "draw" ? "Draw" :
                    st.winner === mine ? "You win" : st.names[st.winner] + " wins";
            } else if (st.phase === "flight" || anim.active) status = "Ball in flight";
            else status = st.turn === mine ? "Your turn" : st.names[st.turn] + " aiming...";
        }
        statusEl.textContent = status;
        firstEl.textContent = "FIRST " + (st ? st.names[st.first] : "-");

        const spot = curSpot();
        const showField = !!st && !!spot && st.phase !== "over";
        spotG.setAttribute("visibility", showField ? "visible" : "hidden");
        playerG.setAttribute("visibility", showField ? "visible" : "hidden");
        if (spot) {
            spotG.setAttribute("transform", "translate(" + spot.x + ",0)");
            spotTxt.textContent = (spot.label + " - " + spot.pts + " pts").toUpperCase();
            playerG.setAttribute("transform", "translate(" + spot.x + ",0)");
        }
        const shooter = st ? (anim.active ? anim.by : st.turn) : 0;
        const col = shooter === mine ? "#38bdf8" : "#a78bfa";
        playerG.setAttribute("stroke", col);
        playerG.setAttribute("fill", col);

        const my = canAim() && !frozen;
        holdBtns.forEach((b) => { b.disabled = !my; });
        shootBtn.disabled = !canShoot();

        const over = !!st && st.phase === "over";
        overEl.hidden = !over || cheatOpen || helpOpen || paused;
        if (over) {
            const w = st.winner;
            overTitle.textContent = w === "draw" ? "Draw" :
                w === mine ? "You win!" : st.names[w] + " wins";
            overTitle.className = w === "draw" ? "" : w === mine ? "win" : "lose";
            overSub.textContent = st.names[0] + "  " + st.scores[0] + " - " + st.scores[1] + "  " + st.names[1];
            const canRestart = !online || room.isHost;
            overRematch.hidden = !canRestart;
            overWait.hidden = canRestart;
        }
        cheatsBtn.hidden = online;
        cheatsBtn.classList.toggle("on", Object.keys(cheats).some((k) => cheats[k]));
        const pauseLabel = pauseBtn.querySelector(".bsh-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseEl.hidden = !paused || cheatOpen || helpOpen;
        cheatsEl.hidden = online || !cheatOpen || helpOpen || paused;
        helpEl.hidden = !helpOpen;
        switchEls.forEach((sw) => {
            sw.setAttribute("aria-pressed", String(cheats[sw.dataset.cheat]));
        });
        perfectBtn.disabled = online || !canAim() || pending;
        syncFreeze();
    }
    function camTarget() {
        if (anim.active) return clamp(anim.ball.x - 380, 0, WORLD - VW);
        if (state && state.phase === "over") return WORLD - VW;
        const s = curSpot();
        return s ? clamp(s.x - 160, 0, WORLD - VW) : 0;
    }
    function drawDynamic(t) {
        const st = state;
        if (anim.active) {
            ballG.setAttribute("visibility", "visible");
            ballG.setAttribute("transform", "translate(" + fx(anim.ball.x) + "," + fx(anim.ball.y) + ")");
            ballRot.setAttribute("transform", "rotate(" + fx(anim.ball.rot * 57.29578) + ")");
            trailEl.setAttribute("points", anim.trail.map((p) => fx(p[0]) + "," + fx(p[1])).join(" "));
        } else {
            const spot = curSpot();
            const show = !!st && st.phase !== "over" && !!spot;
            ballG.setAttribute("visibility", show ? "visible" : "hidden");
            if (show) {
                ballG.setAttribute("transform", "translate(" + spot.x + "," + HAND_Y + ")");
                ballRot.setAttribute("transform", "rotate(0)");
            }
            if (trailEl.getAttribute("points")) trailEl.setAttribute("points", "");
        }
        const mineAim = canAim();
        const botAim = !online && !!st && st.phase === "aim" && st.turn === 1 && !!botPlan && !anim.active;
        if (mineAim || botAim) {
            const spot = curSpot();
            const a = mineAim ? myAngle : botPlan.angle;
            const len = 34 + 44 * (mineAim && charging ? power : 0);
            aimG.setAttribute("visibility", "visible");
            aimG.setAttribute("transform", "translate(" + spot.x + "," + HAND_Y + ") rotate(" + fx(-a) + ")");
            aimLine.setAttribute("x2", String(18 + len));
            aimHead.setAttribute("points", (18 + len) + ",-6 " + (32 + len) + ",0 " + (18 + len) + ",6");
            if (mineAim) {
                angleTxt.setAttribute("visibility", "visible");
                angleTxt.setAttribute("x", String(spot.x));
                angleTxt.setAttribute("y", String(HAND_Y - 44));
                angleTxt.textContent = Math.round(myAngle) + "\u00B0";
            } else angleTxt.setAttribute("visibility", "hidden");
        } else {
            aimG.setAttribute("visibility", "hidden");
            angleTxt.setAttribute("visibility", "hidden");
        }
        const p = charging ? power : 0;
        powerFill.style.width = (p * 100).toFixed(1) + "%";
        powerFill.className = p < 0.5 ? "" : p < 0.8 ? "mid" : "high";
        if (!online && cheats.preview && mineAim && charging) {
            if (t - lastPrev > 90) {
                lastPrev = t;
                const spot = curSpot();
                const sim = simulateShot(spot.x, HAND_Y, myAngle, p);
                previewEl.setAttribute("points", sim.samples.map((pt) => pt[0] + "," + pt[1]).join(" "));
            }
        } else if (previewEl.getAttribute("points")) {
            previewEl.setAttribute("points", "");
        }
    }

    /* ------------------------------ main loop ------------------------------ */
    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
        lastT = t;
        if (frozen) return; /* overlays/pause freeze flight, bot and charge */
        if (charging) {
            phase += dt / (cheats.slow ? 2.7 : 0.9);
            const pp = phase % 2;
            power = pp < 1 ? pp : 2 - pp;
        }
        maybeScheduleBot();
        if (anim.active) {
            anim.acc += dt;
            let guard = 0;
            while (anim.acc >= DT && anim.active && guard++ < 48) {
                anim.acc -= DT;
                stepAnim();
            }
        }
        const target = camTarget();
        cam += (target - cam) * Math.min(1, dt * 6);
        if (Math.abs(target - cam) < 0.5) cam = target;
        if (Math.abs(cam - lastCam) > 0.1) {
            svg.setAttribute("viewBox", fx(cam) + " 0 " + VW + " " + H);
            lastCam = cam;
        }
        drawDynamic(t);
        if (flashT > 0) {
            flashT -= dt;
            if (flashT <= 0) { flashT = 0; flashEl.textContent = ""; }
        }
    }

    /* -------------------------------- input -------------------------------- */
    function aimFromPointer(e) {
        if (!canAim()) return;
        const spot = curSpot();
        if (!spot || !svg.getScreenCTM) return;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const w = pt.matrixTransform(ctm.inverse());
        setAngle(Math.atan2(HAND_Y - w.y, w.x - spot.x) * 180 / Math.PI);
    }
    svg.addEventListener("pointerdown", (e) => {
        if (destroyed) return;
        if (e.pointerType === "touch") {
            svgDrag = true;
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            aimFromPointer(e);
            e.preventDefault();
        } else if (e.button === 0) {
            e.preventDefault();
            aimFromPointer(e);
            startCharge();
        }
    });
    svg.addEventListener("pointermove", (e) => {
        if (destroyed) return;
        if (e.pointerType === "touch") { if (svgDrag) aimFromPointer(e); }
        else aimFromPointer(e);
    });
    const onDocUp = () => { if (destroyed) return; svgDrag = false; releaseCharge(); };
    const onDocCancel = () => { if (destroyed) return; svgDrag = false; cancelCharge(); };
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocCancel);
    cleanups.push(() => {
        document.removeEventListener("pointerup", onDocUp);
        document.removeEventListener("pointercancel", onDocCancel);
    });

    shootBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (!destroyed) startCharge();
    });
    shootBtn.addEventListener("contextmenu", (e) => e.preventDefault());

    function bindHold(btn, delta) {
        let t1 = 0, iv = 0;
        const step = () => { if (canAim()) setAngle(myAngle + delta); };
        const stop = () => {
            if (t1) { clearTimeout(t1); t1 = 0; }
            if (iv) { clearInterval(iv); iv = 0; }
        };
        const down = (e) => {
            e.preventDefault();
            if (!canAim()) return;
            step(); stop();
            t1 = setTimeout(() => { iv = setInterval(step, 90); }, 380);
        };
        const click = (e) => { if (e.detail === 0) step(); }; /* keyboard activation */
        btn.addEventListener("pointerdown", down);
        btn.addEventListener("pointerup", stop);
        btn.addEventListener("pointerleave", stop);
        btn.addEventListener("pointercancel", stop);
        btn.addEventListener("click", click);
        cleanups.push(() => {
            stop();
            btn.removeEventListener("pointerdown", down);
            btn.removeEventListener("pointerup", stop);
            btn.removeEventListener("pointerleave", stop);
            btn.removeEventListener("pointercancel", stop);
            btn.removeEventListener("click", click);
        });
    }
    bindHold(holdDn, -1);
    bindHold(holdUp, 1);

    const onKeyDown = (e) => {
        if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target ? e.target.tagName : "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const c = e.code;
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen && !paused) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault();
            return;
        }
        if (frozen) { e.preventDefault(); return; }
        if (c === "KeyR") {
            if (!online || room.isHost) submitAction({ type: "restart" });
            e.preventDefault();
            return;
        }
        if (c === "ArrowUp" || c === "ArrowDown" || c === "KeyW" || c === "KeyS") {
            e.preventDefault();
            if (canAim()) setAngle(myAngle + ((c === "ArrowUp" || c === "KeyW") ? 1 : -1));
        } else if (c === "Space") {
            e.preventDefault();
            if (e.repeat) return;
            if (state && state.phase === "over") {
                if (!online || room.isHost) submitAction({ type: "restart" });
                return;
            }
            startCharge();
        }
    };
    const onKeyUp = (e) => {
        if (destroyed) return;
        if (e.key === " " || e.code === "Space") {
            e.preventDefault();
            releaseCharge();
        }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    cleanups.push(() => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
    });

    function handleClick(event) {
        if (destroyed) return;
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) {
            if (!online || room.isHost) submitAction({ type: "restart" });
            return;
        }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        const sw = t.closest("[data-cheat]");
        if (sw) {
            const k = sw.dataset.cheat;
            if (!online && Object.prototype.hasOwnProperty.call(cheats, k)) {
                cheats[k] = !cheats[k];
                renderStatic();
            }
            return;
        }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const a = btn.dataset.act;
        if (a === "rematch") {
            if (!online || room.isHost) submitAction({ type: "restart" });
        } else if (a === "cheats") {
            toggleCheats();
        } else if (a === "closeCheats") {
            toggleCheats(false);
        } else if (a === "perfect") {
            if (!online && canAim() && !pending) {
                const spot = curSpot();
                const sol = spot ? findSolution(spot.x) : null;
                if (sol) {
                    cheatOpen = false; helpOpen = false; paused = false;
                    syncFreeze();
                    setAngle(sol.angle);
                    submitAction({ type: "shoot", angle: sol.angle, power: sol.power });
                }
            }
        }
    }
    root.addEventListener("click", handleClick);

    /* ------------------------------ bootstrap ------------------------------ */
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; renderStatic(); });
        if (typeof u1 === "function") cleanups.push(u1);
        if (room.isHost) {
            const hs = Math.random() < 0.5 ? 0 : 1; /* random player slot */
            const names = ["Player 1", "Player 2"];
            names[hs] = meName;
            state = freshState(names, hs);
            publish();
            const u2 = room.onAction((action) => applyAction(action, 1 - state.hostSlot));
            if (typeof u2 === "function") cleanups.push(u2);
        } else {
            const u3 = room.onState((next) => {
                state = next;
                afterState();
                if (!helloSent && state) {
                    helloSent = true;
                    room.sendAction({ type: "hello", name: meName }).catch(console.warn);
                }
            });
            if (typeof u3 === "function") cleanups.push(u3);
        }
    } else {
        state = freshState([meName, "Bot"], 0);
        afterState();
    }
    renderStatic();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            clearRoundTimers();
            Array.from(liveTimers).forEach(cancelTimer);
            cleanups.forEach((fn) => { try { fn(); } catch (err) { /* ignore */ } });
            root.removeEventListener("click", handleClick);
            root.innerHTML = "";
        },
    };
}