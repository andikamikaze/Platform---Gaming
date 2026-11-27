/* ==== snake.js ==== */
/* Snake — minimalist arena snake for the games template.
   Local: Solo or VS Bot. Online: host-authoritative 1v1 duel.
   Random solvable arenas, randomized fair starts, local cheat overlay. */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "snake", // must match the file name (snake.js)
    name: "Snake",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Eat, grow and outlast your rival on randomly generated arenas. Solo, vs bot or 1v1 multiplayer.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 36h11V23h13v13h9"/><circle cx="7" cy="36" r="3.5" fill="currentColor" stroke="none"/><circle cx="42" cy="36" r="4.5" fill="currentColor" stroke="none"/></svg>',
    bg: ["#d1fae5", "#6ee7b7"],
    bestKey: "snakeBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost); // local play is always authoritative
    const myProtocol = online && !room.isHost ? 1 : 0; // protocol actor id (fixed by room role)
    const local = !online;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* ---------- constants ---------- */
    const CELL = 24;
    const START_LEN = 3;
    const SIZES = { compact: 21, classic: 27, grand: 33 };
    const SPEEDS = { chill: 330, normal: 240, swift: 175 }; // ms per tick (much slower than the old 130ms)
    const MISTAKE = { easy: 0.22, normal: 0.07, hard: 0 };
    const TARGET_SOLO = 25;
    const TARGET_DUEL = 15;
    const DIRV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    const DV = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const OPP = { U: "D", D: "U", L: "R", R: "L" };
    const DIRNAME = { up: "U", down: "D", left: "L", right: "R" };
    const SIDES = ["West", "East", "North", "South"];
    const MAP_IDS = ["open", "pillars", "cross", "ring", "lanes", "scatter", "maze", "wrap"];
    const MAP_NAMES = {
        open: "Open Field", pillars: "Pillars", cross: "Crossroads", ring: "The Ring",
        lanes: "Lanes", scatter: "Rubble", maze: "Labyrinth", wrap: "Portal Field",
    };
    const uid = "snk" + Math.random().toString(36).slice(2, 7);

    /* ---------- local session data ---------- */
    const settings = { mode: "bot", map: "random", size: "classic", speed: "normal", bot: "normal" };
    const cheats = { ghost: false, slow: false, freeze: false, magnet: false, auto: false, double: false };
    const CHEAT_LIST = [
        ["ghost", "Ghost mode", "Pass through walls and snakes. Edges wrap around."],
        ["slow", "Slow motion", "Run the whole game at roughly half speed."],
        ["freeze", "Freeze rival", "The rival snake stops moving (duels only)."],
        ["magnet", "Food magnet", "Eat food from one cell away."],
        ["auto", "Auto-pilot", "A strong AI steers your snake for you."],
        ["double", "Double score", "Every food is worth 20 points instead of 10."],
    ];
    let usedCheats = false;
    let helpOpen = false;
    let cheatsOpen = false;
    let pausedFrom = null; // "play" | "count" — modal auto-pause origin
    let pending = null; // guest optimistic direction indicator
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* storage blocked */ }
    try {
        if (localStorage.getItem("snakeHelpSeen") !== "1") {
            helpOpen = true;
            localStorage.setItem("snakeHelpSeen", "1");
        }
    } catch (e) { /* storage blocked */ }
    let queues = [[], []]; // authoritative input buffers (host / local only)
    const cache = { seed: -1, size: 0, walls: new Set() };
    let wallSeed = -1;
    let ovSig = "";
    let prevPhase = "";
    const timers = {};
    const subs = [];

    /* ---------- shell ---------- */
    root.innerHTML = `
<style>
.snk{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--soft:#f8fafc;--acc:#10b981;--bad:#ef4444;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.snk *{box-sizing:border-box}
.snk [hidden]{display:none !important}
.snk-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:10px;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.snk-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:5px 9px;font-size:10.5px;color:var(--mut);background:#fff;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em}
.snk-chip b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:700}
.snk-sw{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.snk-spacer{flex:1 1 auto}
.snk-btn{height:38px;min-width:32px;padding:0 10px;border:1px solid var(--line);background:#fff;border-radius:9px;color:var(--ink);cursor:pointer;font-size:10px;font-weight:700;letter-spacing:.03em;display:inline-flex;align-items:center;justify-content:center;gap:5px;font-family:inherit}
.snk-btn:hover{background:var(--soft)}
.snk-btn:disabled{opacity:.4;cursor:default}
.snk-btn svg{flex:none;width:14px;height:14px;display:block}
.snk-icon-btn{display:inline-flex;align-items:center;gap:5px}
.snk-icon-btn svg{flex:none;display:block}
.snk-btn.on{border-color:var(--acc);color:var(--acc);background:#ecfdf5}
.snk-board{position:relative;display:grid;place-items:center;width:100%;min-height:0;padding:0;border:0;background:transparent;border-radius:12px;overflow:hidden}
.snk-boardwrap{position:relative;width:min(100%,620px);max-height:100%;aspect-ratio:1/1;background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
.snk-svg{width:100%;height:100%;display:block;border-radius:10px;touch-action:none;cursor:crosshair;background:var(--soft)}
.snk-ov{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:12px;background:rgba(248,250,252,.92);backdrop-filter:blur(3px);border-radius:12px}
.snk-card{display:flex;flex-direction:column;width:min(460px,100%);max-height:100%;overflow:hidden;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center}
.snk-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:10px;text-align:left}
.snk-head h3{margin:0;font-size:17px;letter-spacing:-.02em}
.snk-tag{font:600 9px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 8px;white-space:nowrap}
.snk-body{flex:1 1 auto;min-height:0;overflow:auto;text-align:left}
.snk-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.snk-sub{color:var(--mut);font-size:12.5px;margin:0 0 12px;line-height:1.55}
.snk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;text-align:left}
.snk-field{display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.snk-field select{height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:13px;padding:0 8px;font-family:inherit;width:100%}
.snk-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.snk-btn.primary:hover{opacity:.88}
.snk-btnrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px}
.snk-howto{text-align:left;font-size:12.5px;color:#334155;line-height:1.6;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:12px 0 0;background:#fff}
.snk-howto ul{margin:4px 0 0;padding-left:16px}
.snk-link{background:none;border:0;color:var(--acc);cursor:pointer;font-size:12px;font-weight:700;padding:0;font-family:inherit}
.snk-fair,.snk-note{font-size:10.5px;color:var(--mut);margin:12px 0 0;line-height:1.5}
.snk-count{font-size:60px;font-weight:800;letter-spacing:-.04em;line-height:1.1;text-align:center}
.snk-toast{position:absolute;top:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:12px;font-weight:600;padding:6px 13px;border-radius:999px;z-index:3;white-space:nowrap;box-shadow:0 4px 14px rgba(15,23,42,.25)}
.snk-pad{display:flex;justify-content:center;margin-top:6px;touch-action:none;user-select:none;-webkit-user-select:none}
.snk-dpad{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(2,40px);gap:5px;touch-action:none;user-select:none;-webkit-user-select:none}
.snk-dbtn{border:1px solid var(--line);background:#fff;border-radius:11px;color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.snk-dbtn:active{background:var(--soft);transform:scale(.94)}
.snk-dbtn svg{width:18px;height:18px}
.snk-help{text-align:left;font-size:12.5px;line-height:1.6;color:#334155}
.snk-help h4{margin:14px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.snk-help h4:first-child{margin-top:0}
.snk-help p{margin:0 0 6px}
.snk-help ul{margin:0;padding-left:18px}
.snk kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 6px;font-size:11px;background:var(--soft);font-family:inherit;white-space:nowrap}
.snk-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);text-align:left}
.snk-cheatrow:last-of-type{border-bottom:0}
.snk-cheatrow b{font-size:13px;display:block}
.snk-cheatrow small{color:var(--mut);font-size:11.5px;line-height:1.4;display:block}
.snk-switch{appearance:none;-webkit-appearance:none;width:38px;height:22px;border-radius:999px;background:var(--line);position:relative;cursor:pointer;flex:none;transition:background .15s;border:0;margin:0}
.snk-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.snk-switch:checked{background:var(--acc)}
.snk-switch:checked::after{left:19px}
.snk-stats{font-size:12.5px;color:#334155;font-weight:600;margin:0 0 12px}
.snk-win{color:var(--acc)}
.snk-lose{color:var(--bad)}
@media (pointer:coarse){
  .snk-dpad{grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,56px)}
}
@media (max-width:640px){
  .snk-boardwrap{padding:6px;border-radius:12px}
}

/* --- Batch 02 design polish --- */
.snk :focus-visible,.snk button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.snk-btn{min-height:44px}
.snk-field select{min-height:44px}
.snk-grid{gap:12px}
.snk-toast{box-shadow:none;border:1px solid var(--line)}
@media (pointer:coarse){.snk button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.snk *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (last: beats pointer:coarse) --- */
.snk.game-fill > .snk-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.snk-card{display:flex;flex-direction:column;overflow:hidden}
.snk-head,.snk-foot{flex:none}
.snk-body{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
.snk.game-fill > .snk-board:has(.snk-ov:not([hidden])){min-height:min(70dvh,620px);aspect-ratio:auto}
.snk .snk-hud{gap:5px;margin-bottom:8px}
.snk .snk-hud .snk-chip{padding:4px 6px;font-size:9px}
.snk .snk-hud .snk-chip[data-chip="map"],
.snk .snk-hud .snk-chip[data-chip="goal"]{display:none}
.snk .snk-hud .snk-btn{min-height:32px;padding:5px 9px;font-size:9px}
.snk .snk-hud .snk-btn-label,
.snk .snk-hud .snk-spacer{display:none}
.snk .snk-ov{padding:8px}
.snk .snk-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.snk .snk-body{scrollbar-width:none}
.snk .snk-body::-webkit-scrollbar{display:none}
.snk .snk-foot{position:static;margin:10px 0 0;padding-top:10px;border-top:1px solid var(--line)}
.snk .snk-note{display:none}
.snk .snk-grid{grid-template-columns:1fr}
}
</style>
<div class="game-app snk game-fill" data-snk>
  <div class="snk-hud">
    <span class="snk-chip"><span class="snk-sw" data-sw="you"></span>You <b data-hud="you">0</b></span>
    <span class="snk-chip" data-chip="rival"><span class="snk-sw" data-sw="rival"></span><span data-hud="rname">Rival</span> <b data-hud="rival">0</b></span>
    <span class="snk-chip" data-chip="best">Best <b data-hud="best">0</b></span>
    <span class="snk-chip" data-chip="map">Map <b data-hud="map">—</b></span>
    <span class="snk-chip" data-chip="goal">Goal <b data-hud="goal">—</b></span>
    <span class="snk-chip">Status <b data-hud="status">Ready</b></span>
    <span class="snk-spacer"></span>
    <button class="snk-btn snk-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="snk-btn-label">Help</span></button>
    <button class="snk-btn snk-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "hidden" : ""}>${iconSVG("wrench", { size: 14 })}<span class="snk-btn-label">Cheats</span></button>
    <button class="snk-btn snk-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="snk-btn-label">Pause</span></button>
    <button class="snk-btn snk-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="snk-btn-label">Restart</span></button>
    <button class="snk-btn snk-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="snk-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel snk-board" data-board>
    <div class="snk-boardwrap">
      <svg class="snk-svg" data-svg viewBox="0 0 648 648" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Snake arena">
        <defs>
          <pattern id="${uid}g" width="${CELL}" height="${CELL}" patternUnits="userSpaceOnUse">
            <path d="M ${CELL} 0 L 0 0 0 ${CELL}" fill="none" stroke="#e9eef5" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#f8fafc"/>
        <rect width="100%" height="100%" fill="url(#${uid}g)"/>
        <g data-walls></g>
        <g data-dyn></g>
      </svg>
      <div class="snk-toast" data-toast hidden></div>
    </div>
    <div class="snk-ov" data-ov hidden></div>
  </section>
  <div class="snk-pad" data-dpad>
    <button class="snk-dbtn" type="button" data-dir="up" style="grid-column:2;grid-row:1" aria-label="Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>
    <button class="snk-dbtn" type="button" data-dir="left" style="grid-column:1;grid-row:2" aria-label="Left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></button>
    <button class="snk-dbtn" type="button" data-dir="down" style="grid-column:2;grid-row:2" aria-label="Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>
    <button class="snk-dbtn" type="button" data-dir="right" style="grid-column:3;grid-row:2" aria-label="Right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg></button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (sel) => root.querySelector(sel);
    const svg = $("[data-svg]");
    const wallsG = $("[data-walls]");
    const dynG = $("[data-dyn]");
    const ov = $("[data-ov]");
    const toastEl = $("[data-toast]");
    const hudYou = $('[data-hud="you"]');
    const hudRival = $('[data-hud="rival"]');
    const hudRName = $('[data-hud="rname"]');
    const hudBest = $('[data-hud="best"]');
    const hudMap = $('[data-hud="map"]');
    const hudGoal = $('[data-hud="goal"]');
    const hudStatus = $('[data-hud="status"]');
    const chipRival = $('[data-chip="rival"]');
    const chipBest = $('[data-chip="best"]');
    const swYou = $('[data-sw="you"]');
    const swRival = $('[data-sw="rival"]');
    const btnCheats = $("[data-cheats]");
    const btnPause = $("[data-pause]");

    /* ---------- helpers ---------- */
    const X = (i) => i % state.size;
    const Y = (i) => (i / state.size) | 0;
    const slotOf = (protocol, swap) => (swap ? 1 - protocol : protocol);
    const mySlot = () => (state ? slotOf(myProtocol, state.swap) : myProtocol);
    const rivalSlot = () => 1 - mySlot();
    const youName = () => (local ? "You" : (playerName || "You"));
    const rivalName = () => (state && state.bot ? "Bot" : "Rival");
    const nameOf = (s) => (s === mySlot() ? youName() : rivalName());
    const anyCheat = () => Object.values(cheats).some(Boolean);
    const isGhost = (s) => local && cheats.ghost && s === mySlot();
    const isFrozen = (s) => local && cheats.freeze && state.twoPlayers && s !== mySlot();
    const isAuto = (s) => (state.bot && s === rivalSlot()) || (local && cheats.auto && s === mySlot());
    const tailVacates = (arr) => arr.length < 2 || arr[arr.length - 1] !== arr[arr.length - 2];

    function clearTimer(key) { if (timers[key]) { clearTimeout(timers[key]); timers[key] = null; } }
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.hidden = false;
        clearTimer("toast");
        timers.toast = setTimeout(() => { toastEl.hidden = true; }, 2600);
    }
    function ensureCache() {
        if (!state) return;
        if (state.seed !== cache.seed || state.size !== cache.size) {
            cache.seed = state.seed;
            cache.size = state.size;
            cache.walls = new Set(state.walls);
        }
    }
    function mulberry32(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---------- random arena generator (always solvable) ----------
       1. Build a symmetric / structured obstacle layout from a template.
       2. Clear a safe corridor around every spawn.
       3. Flood-fill from spawn A; seal every unreachable pocket as wall,
          so ALL remaining free cells form one connected region -> the food
          is always reachable and the level can always be completed.
       4. Retry with fresh randomness if the arena got too cramped. */
    function spawnFor(G, side) {
        const m = G >> 1;
        if (side === 0) return { x: 2, y: m, d: "R" };
        if (side === 1) return { x: G - 3, y: m, d: "L" };
        if (side === 2) return { x: m, y: 2, d: "D" };
        return { x: m, y: G - 3, d: "U" };
    }

    function templateWalls(G, tpl, rng) {
        const walls = new Set();
        const add = (x, y) => { if (x >= 0 && y >= 0 && x < G && y < G) walls.add(y * G + x); };
        const del = (x, y) => walls.delete(y * G + x);
        if (tpl === "wrap") return { walls, wrap: true };
        if (tpl === "open") return { walls, wrap: false };
        if (tpl === "pillars") {
            for (let px = 4; px < G - 4; px += 5)
                for (let py = 4; py < G - 4; py += 5) {
                    const jx = ((rng() * 3) | 0) - 1, jy = ((rng() * 3) | 0) - 1;
                    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) add(px + jx + dx, py + jy + dy);
                }
        } else if (tpl === "cross") {
            const m = G >> 1, q1 = G >> 2, q3 = (3 * G) >> 2;
            for (let i = 0; i < G; i++) { add(i, m); add(m, i); }
            del(q1, m); del(m, q1); del(q3, m); del(m, q3);
            for (let d = -1; d <= 1; d++) { del(m + d, m); del(m, m + d); }
        } else if (tpl === "ring") {
            const m = Math.max(4, G >> 2), lo = m, hi = G - 1 - m, mid = G >> 1;
            for (let i = lo; i <= hi; i++) { add(i, lo); add(i, hi); add(lo, i); add(hi, i); }
            for (let d = 0; d <= 1; d++) { del(mid + d, lo); del(mid + d, hi); del(lo, mid + d); del(hi, mid + d); }
        } else if (tpl === "lanes") {
            const vert = rng() < 0.5;
            for (let b = 5; b < G - 4; b += 5) {
                const g = 2 + ((rng() * (G - 6)) | 0);
                for (let i = 2; i < G - 2; i++) {
                    if (i >= g && i <= g + 2) continue;
                    if (vert) add(b, i); else add(i, b);
                }
            }
        } else if (tpl === "scatter") {
            const n = (G * 0.9) | 0;
            for (let k = 0; k < n; k++) {
                const x = 2 + ((rng() * (G - 4)) | 0), y = 2 + ((rng() * (G - 4)) | 0);
                const shape = (rng() * 5) | 0;
                const cells = [[x, y]];
                if (shape === 1) cells.push([x + 1, y]);
                else if (shape === 2) cells.push([x, y + 1]);
                else if (shape === 3) cells.push([x + 1, y], [x, y + 1]);
                else if (shape === 4) cells.push([x + 1, y], [x, y + 1], [x + 1, y + 1]);
                for (const [cx, cy] of cells) { add(cx, cy); add(G - 1 - cx, G - 1 - cy); } // 180 deg symmetry = fair
            }
        } else if (tpl === "maze") {
            const divide = (x, y, w, h) => {
                const canH = h >= 7, canV = w >= 7;
                if (!canH && !canV) return;
                const horiz = canH && (!canV || (h === w ? rng() < 0.5 : h > w));
                if (horiz) {
                    let wy = y + 2 + 2 * ((rng() * (((h - 4) >> 1) + 1)) | 0);
                    wy = Math.min(wy, y + h - 3);
                    for (let i = x; i < x + w; i++) add(i, wy);
                    del(x + ((rng() * w) | 0), wy);
                    del(x + ((rng() * w) | 0), wy);
                    divide(x, y, w, wy - y);
                    divide(x, wy + 1, w, y + h - wy - 1);
                } else {
                    let wx = x + 2 + 2 * ((rng() * (((w - 4) >> 1) + 1)) | 0);
                    wx = Math.min(wx, x + w - 3);
                    for (let i = y; i < y + h; i++) add(wx, i);
                    del(wx, y + ((rng() * h) | 0));
                    del(wx, y + ((rng() * h) | 0));
                    divide(x, y, wx - x, h);
                    divide(wx + 1, y, x + w - wx - 1, h);
                }
            };
            divide(0, 0, G, G);
        }
        return { walls, wrap: false };
    }

    function clearSpawn(walls, G, sp) {
        const dv = DIRV[sp.d], px = -dv[1], py = dv[0];
        for (let t = -2; t <= 4; t++) {
            const cx = sp.x + dv[0] * t, cy = sp.y + dv[1] * t;
            for (const [ox, oy] of [[0, 0], [px, py], [-px, -py]]) {
                const x = cx + ox, y = cy + oy;
                if (x >= 0 && y >= 0 && x < G && y < G) walls.delete(y * G + x);
            }
        }
    }

    function floodFree(G, walls, start, wrap) {
        const seen = new Set([start]);
        const q = [start];
        let qi = 0;
        while (qi < q.length) {
            const c = q[qi++], cx = c % G, cy = (c / G) | 0;
            for (const [dx, dy] of DV) {
                let nx = cx + dx, ny = cy + dy;
                if (wrap) { nx = (nx + G) % G; ny = (ny + G) % G; }
                else if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
                const ni = ny * G + nx;
                if (walls.has(ni) || seen.has(ni)) continue;
                seen.add(ni); q.push(ni);
            }
        }
        return seen;
    }

    function generateArena(G, choice, rng, spawns) {
        for (let attempt = 0; attempt < 24; attempt++) {
            const tpl = choice === "random" ? MAP_IDS[(rng() * MAP_IDS.length) | 0] : choice;
            const { walls, wrap } = templateWalls(G, tpl, rng);
            for (const sp of spawns) clearSpawn(walls, G, sp);
            const startA = spawns[0].y * G + spawns[0].x;
            const reach = floodFree(G, walls, startA, wrap);
            for (let i = 0; i < G * G; i++) if (!walls.has(i) && !reach.has(i)) walls.add(i); // seal pockets
            const okB = spawns.length < 2 || reach.has(spawns[1].y * G + spawns[1].x);
            if (okB && reach.size >= Math.max(80, (G * G * 0.42) | 0)) {
                return { walls: [...walls], wrap, name: MAP_NAMES[tpl] };
            }
        }
        return { walls: [], wrap: false, name: MAP_NAMES.open }; // guaranteed-solvable fallback
    }

    /* ---------- match setup ---------- */
    function newMatch(phase = "menu") {
        clearTimer("tick"); clearTimer("count");
        const G = SIZES[settings.size] || 27;
        const seed = (Math.random() * 0x7fffffff) | 0;
        const rng = mulberry32(seed);
        const two = online || settings.mode === "bot";
        const swap = rng() < 0.5; // randomizes WHICH player (P1/P2, color) you are
        let order = rng() < 0.5 ? [0, 1] : [1, 0]; // randomizes WHO moves first
        let sides;
        if (two) {
            const pair = rng() < 0.5 ? [0, 1] : [2, 3];
            sides = rng() < 0.5 ? pair : [pair[1], pair[0]]; // random spawn sides
        } else {
            const s0 = (rng() * 4) | 0;
            sides = [s0, s0];
        }
        const spawns = sides.map((sd) => spawnFor(G, sd));
        const arena = generateArena(G, settings.map, rng, two ? spawns : [spawns[0]]);
        const snakes = [[], []], dirs = ["R", "L"], alive = [false, false];
        for (let s = 0; s < (two ? 2 : 1); s++) {
            const sp = spawns[s], dv = DIRV[sp.d], arr = [];
            for (let i = 0; i < START_LEN; i++) arr.push((sp.y - dv[1] * i) * G + (sp.x - dv[0] * i));
            snakes[s] = arr; dirs[s] = sp.d; alive[s] = true;
        }
        if (!two) { const meFirst = slotOf(myProtocol, swap); order = [meFirst, 1 - meFirst]; }
        state = {
            v: 1, phase, size: G, seed,
            walls: arena.walls, wrap: arena.wrap, mapName: arena.name,
            snakes, dirs, alive, scores: [0, 0], food: -1,
            order, swap, sides,
            twoPlayers: two, bot: local && settings.mode === "bot",
            target: two ? TARGET_DUEL : TARGET_SOLO,
            speedKey: settings.speed, tick: 0, count: 3, winner: null, end: null,
        };
        queues = [[], []];
        pending = null;
        usedCheats = local && anyCheat();
        ensureCache();
        state.food = spawnFood();
    }

    function spawnFood() {
        const G = state.size;
        const occ = new Set(cache.walls);
        for (const sn of state.snakes) for (const c of sn) occ.add(c);
        const free = [];
        for (let i = 0; i < G * G; i++) if (!occ.has(i)) free.push(i);
        return free.length ? free[(Math.random() * free.length) | 0] : -1;
    }

    /* ---------- rules engine (authoritative side only) ---------- */
    function rivalWillMove(s, k) {
        if (state.tick <= 1) return false;
        const r = 1 - s;
        return state.twoPlayers && state.alive[r] && !isFrozen(r) && state.order.indexOf(r) > k;
    }

    function canStep(s, d, rwm, ghost) {
        const G = state.size, head = state.snakes[s][0], dv = DIRV[d];
        let nx = (head % G) + dv[0], ny = ((head / G) | 0) + dv[1];
        if (nx < 0 || ny < 0 || nx >= G || ny >= G) {
            if (state.wrap || ghost) { nx = (nx + G) % G; ny = (ny + G) % G; }
            else return { die: "wall" };
        }
        const ni = ny * G + nx;
        if (!ghost && cache.walls.has(ni)) return { die: "block" };
        const eat = ni === state.food;
        if (!ghost) {
            const me = state.snakes[s];
            const upto = me.length - (!eat && tailVacates(me) ? 1 : 0);
            for (let i = 0; i < upto; i++) if (me[i] === ni) return { die: "tail" };
            const r = 1 - s, rv = state.snakes[r];
            if (rv.length && state.alive[r]) {
                const uptoR = rv.length - (rwm && tailVacates(rv) ? 1 : 0);
                for (let i = 0; i < uptoR; i++) if (rv[i] === ni) return { die: "rival" };
            }
        }
        return { ni, eat };
    }

    /* ---------- bot brain: BFS to food + escape-space safety ---------- */
    function botPick(s) {
        const G = state.size, wrap = state.wrap;
        const me = state.snakes[s], r = 1 - s, rv = state.snakes[r];
        const rwm = rivalWillMove(s, state.order.indexOf(s));
        const opts = [];
        for (const d of ["U", "D", "L", "R"]) {
            if (d === OPP[state.dirs[s]]) continue;
            const res = canStep(s, d, rwm, false);
            if (!res.die) opts.push([d, res.ni]);
        }
        if (!opts.length) return null;
        const autopilot = local && cheats.auto && s === mySlot();
        const hard = autopilot || settings.bot === "hard";
        const mist = autopilot ? 0 : (MISTAKE[settings.bot] ?? 0.07);
        if (Math.random() < mist) return opts[(Math.random() * opts.length) | 0][0];

        const blocked = new Set(cache.walls);
        for (let i = 0; i < me.length - 1; i++) blocked.add(me[i]);
        if (rv.length && state.alive[r]) {
            const upto = rv.length - (rwm && tailVacates(rv) ? 1 : 0);
            for (let i = 0; i < upto; i++) blocked.add(rv[i]);
        }
        const nb = (c, fn) => {
            const cx = c % G, cy = (c / G) | 0;
            for (const [dx, dy] of DV) {
                let nx2 = cx + dx, ny2 = cy + dy;
                if (wrap) { nx2 = (nx2 + G) % G; ny2 = (ny2 + G) % G; }
                else if (nx2 < 0 || ny2 < 0 || nx2 >= G || ny2 >= G) continue;
                fn(ny2 * G + nx2);
            }
        };
        // BFS shortest path to the food
        const start = me[0], target = state.food;
        const prev = new Int32Array(G * G).fill(-2);
        prev[start] = -1;
        const q = [start];
        let qi = 0, found = false;
        while (qi < q.length && !found) {
            const c = q[qi++];
            nb(c, (ni) => {
                if (found || blocked.has(ni) || prev[ni] !== -2) return;
                prev[ni] = c; q.push(ni);
                if (ni === target) found = true;
            });
        }
        let choice = null;
        if (found && target >= 0) {
            let c = target;
            while (prev[c] !== start && prev[c] >= 0) c = prev[c];
            for (const [d, ni] of opts) if (ni === c) { choice = [d, ni]; break; }
        }
        const space = (c) => {
            const seen = new Set([c]);
            const qq = [c];
            let qj = 0;
            while (qj < qq.length) {
                const u = qq[qj++];
                let full = false;
                nb(u, (ni) => {
                    if (full || blocked.has(ni) || seen.has(ni)) return;
                    seen.add(ni); qq.push(ni);
                    if (seen.size >= 70) full = true;
                });
                if (full) return 70;
            }
            return seen.size;
        };
        const need = Math.min(me.length, 12);
        if (choice && space(choice[1]) >= need) return choice[0];
        // fallback: maximize open space, prefer moving toward food, avoid head-on risk
        let bestD = null, bestScore = -Infinity;
        const rHead = rv.length && state.alive[r] ? rv[0] : -1;
        for (const [d, ni] of opts) {
            let sc = space(ni);
            if (hard && rHead >= 0) {
                const dist = Math.abs((rHead % G) - (ni % G)) + Math.abs(((rHead / G) | 0) - ((ni / G) | 0));
                if (dist <= 1 && rv.length >= me.length) sc -= 4;
            }
            if (target >= 0) sc -= 0.05 * (Math.abs((target % G) - (ni % G)) + Math.abs(((target / G) | 0) - ((ni / G) | 0)));
            if (sc > bestScore) { bestScore = sc; bestD = d; }
        }
        return bestD;
    }

    function finish(end, winner) {
        state.phase = "over";
        state.end = end;
        state.winner = winner;
        clearTimer("tick"); clearTimer("count");
        if (local && !usedCheats) {
            const sc = state.scores[mySlot()];
            if (sc > best) {
                best = sc;
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ }
            }
        }
    }

    function step() {
        ensureCache();
        state.tick++;
        const deathCause = [null, null];
        const n = state.twoPlayers ? 2 : 1;
        for (let k = 0; k < n; k++) {
            const s = state.order[k];
            if (state.tick === 1 && k === 1) break; // the randomly chosen first player gets a 1-cell head start
            if (!state.alive[s] || !state.snakes[s].length) continue;
            if (isFrozen(s)) continue;
            if (isAuto(s)) {
                const d = botPick(s);
                if (d && d !== OPP[state.dirs[s]]) state.dirs[s] = d;
            } else if (queues[s].length) {
                const d = queues[s].shift();
                if (d !== OPP[state.dirs[s]]) state.dirs[s] = d;
            }
            const res = canStep(s, state.dirs[s], rivalWillMove(s, k), isGhost(s));
            if (res.die) { state.alive[s] = false; deathCause[s] = res.die; continue; }
            state.snakes[s].unshift(res.ni);
            const pts = local && cheats.double && s === mySlot() ? 20 : 10;
            if (res.eat) {
                state.scores[s] += pts;
                state.food = spawnFood();
            } else {
                state.snakes[s].pop();
            }
            // food magnet cheat: eat from one cell away
            if (local && cheats.magnet && s === mySlot() && state.food >= 0 && state.alive[s]) {
                const h = state.snakes[s][0], f = state.food;
                const dist = Math.abs((h % state.size) - (f % state.size)) + Math.abs(((h / state.size) | 0) - ((f / state.size) | 0));
                if (dist === 1) {
                    state.scores[s] += pts;
                    state.snakes[s].push(state.snakes[s][state.snakes[s].length - 1]);
                    state.food = spawnFood();
                }
            }
            if (state.snakes[s].length >= state.target) { finish({ type: "race", slot: s }, s); return; }
        }
        const a = state.alive, my = mySlot();
        if (!state.twoPlayers) {
            if (!a[my]) { finish({ type: "crash", slot: my, cause: deathCause[my] }, -1); return; }
        } else if (!a[0] && !a[1]) {
            const l0 = state.snakes[0].length, l1 = state.snakes[1].length;
            const w = l0 > l1 ? 0 : l1 > l0 ? 1 : state.scores[0] > state.scores[1] ? 0 : state.scores[1] > state.scores[0] ? 1 : -1;
            finish({ type: "double" }, w); return;
        } else if (!a[0]) { finish({ type: "crash", slot: 0, cause: deathCause[0] }, 1); return; }
        else if (!a[1]) { finish({ type: "crash", slot: 1, cause: deathCause[1] }, 0); return; }
        if (state.food < 0) {
            const l0 = state.snakes[0].length, l1 = state.snakes[1].length;
            const w = !state.twoPlayers ? my : l0 > l1 ? 0 : l1 > l0 ? 1 : -1;
            finish({ type: "full" }, w);
        }
    }

    /* ---------- host / local loop ---------- */
    function tickDelay() {
        const base = SPEEDS[state.speedKey] || 240;
        const players = state.twoPlayers ? 2 : 1;
        const eaten = state.snakes[0].length + state.snakes[1].length - START_LEN * players;
        let ms = Math.max(base * 0.62, base - eaten * 1.5); // gentle speed-up, never the old blur
        if (local && cheats.slow) ms *= 1.8;
        return Math.round(ms);
    }
    function scheduleTick() {
        clearTimer("tick");
        if (destroyed || !isHost || !state || state.phase !== "playing") return;
        timers.tick = setTimeout(tick, tickDelay());
    }
    function tick() {
        if (destroyed || !isHost || !state || state.phase !== "playing") return;
        step();
        publish();
        if (state.phase === "playing") scheduleTick();
    }
    function startCountdown() {
        clearTimer("tick"); clearTimer("count");
        state.phase = "count";
        state.count = 3;
        publish();
        const stepCount = () => {
            if (destroyed || !state || state.phase !== "count") return;
            state.count--;
            if (state.count <= 0) {
                state.phase = "playing";
                publish();
                toast(state.order[0] === mySlot() ? "You move first!" : `${rivalName()} moves first!`);
                scheduleTick();
            } else {
                publish();
                timers.count = setTimeout(stepCount, 750);
            }
        };
        timers.count = setTimeout(stepCount, 750);
    }

    /* ---------- actions (host-authoritative protocol) ---------- */
    function queueDir(slot, d) {
        const q = queues[slot];
        const last = q.length ? q[q.length - 1] : state.dirs[slot];
        if (d === last || d === OPP[last]) return; // no same-dir spam, no 180 deg reversal
        if (q.length < 2) q.push(d);
    }
    function sanitizeSettings(obj) {
        const out = {};
        if (obj.mode === "solo" || obj.mode === "bot") out.mode = obj.mode;
        if (obj.map === "random" || MAP_IDS.includes(obj.map)) out.map = obj.map;
        if (["compact", "classic", "grand"].includes(obj.size)) out.size = obj.size;
        if (["chill", "normal", "swift"].includes(obj.speed)) out.speed = obj.speed;
        if (["easy", "normal", "hard"].includes(obj.bot)) out.bot = obj.bot;
        return out;
    }
    function applyAction(a, actor) {
        if (destroyed || !isHost || !state || !a || typeof a !== "object") return;
        const slot = slotOf(actor, state.swap);
        if (a.t === "dir") {
            const d = DIRNAME[a.d];
            if (!d || (state.phase !== "playing" && state.phase !== "count")) return;
            if (!state.alive[slot] || !state.snakes[slot].length || isAuto(slot)) return;
            queueDir(slot, d);
            return; // direction shows up on the next published tick
        }
        if (a.t === "pause") {
            if (state.phase === "playing") { state.phase = "paused"; clearTimer("tick"); publish(); }
            else if (state.phase === "paused") { state.phase = "playing"; publish(); scheduleTick(); }
            return;
        }
        if (a.t === "restart") {
            if (state.phase === "menu") return;
            newMatch();
            startCountdown();
            return;
        }
        if (a.t === "start") {
            if (actor !== 0 || state.phase !== "menu") return;
            startCountdown();
            return;
        }
        if (a.t === "menu") {
            if (actor !== 0) return;
            clearTimer("tick"); clearTimer("count");
            state.phase = "menu";
            publish();
            return;
        }
        if (a.t === "settings") {
            if (actor !== 0 || state.phase !== "menu") return;
            Object.assign(settings, sanitizeSettings(a.settings || {}));
            newMatch();
            publish();
        }
    }
    function submitAction(a) {
        if (online && !isHost) {
            if (a.t === "dir" && state) pending = { d: DIRNAME[a.d], tick: state.tick };
            room.sendAction(a).catch(console.warn);
            return;
        }
        applyAction(a, myProtocol);
    }
    function publish() {
        render();
        if (online && isHost) room.publishState(state).catch(console.warn); // only the host writes canonical state
    }

    /* ---------- text helpers ---------- */
    function overTitle() {
        if (!state.twoPlayers) return state.winner === mySlot() ? "You win!" : "Game over";
        return state.winner === mySlot() ? "You win!" : state.winner === -1 ? "Draw" : "You lose";
    }
    function endText(end) {
        if (!end) return "";
        if (end.type === "race") return end.slot === mySlot() ? `You reached length ${state.target}. Well played!` : `${rivalName()} reached length ${state.target} first.`;
        if (end.type === "full") return "The arena is completely full.";
        if (end.type === "double") return "Both snakes crashed in the same tick — the longer snake wins.";
        const you = end.slot === mySlot();
        const S = you ? "You" : rivalName();
        const P = you ? "your" : "its";
        if (end.cause === "wall") return `${S} crashed into the wall.`;
        if (end.cause === "block") return `${S} crashed into an arena block.`;
        if (end.cause === "tail") return `${S} crashed into ${P} own tail.`;
        return `${S} crashed into the other snake.`;
    }

    /* ---------- overlay builders ---------- */
    function card(title, tag, body, foot) {
        return `<div class="snk-card">
      <div class="snk-head"><h3>${title}</h3>${tag ? `<span class="snk-tag">${tag}</span>` : ""}</div>
      <div class="snk-body">${body}</div>
      ${foot ? `<div class="snk-foot">${foot}</div>` : ""}
    </div>`;
    }
    function selHTML(key, label, opts, val) {
        return `<label class="snk-field">${label}<select data-set="${key}">${opts.map(([v, t]) => `<option value="${v}"${v === val ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
    }
    function menuHTML() {
        let fields = "";
        if (isHost) {
            if (local) fields += selHTML("mode", "Mode", [["solo", "Solo"], ["bot", "VS Bot"]], settings.mode);
            if (local && settings.mode === "bot") fields += selHTML("bot", "Bot skill", [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]], settings.bot);
            fields += selHTML("map", "Arena", [["random", "Random (surprise me)"], ...MAP_IDS.map((m) => [m, MAP_NAMES[m]])], settings.map);
            fields += selHTML("size", "Size", [["compact", "21 × 21"], ["classic", "27 × 27"], ["grand", "33 × 33"]], settings.size);
            fields += selHTML("speed", "Speed", [["chill", "Chill"], ["normal", "Normal"], ["swift", "Swift"]], settings.speed);
        }
        const setup = isHost
            ? `<div class="snk-grid">${fields}</div>`
            : `<div class="snk-howto">Arena <b>${state.mapName} · ${state.size}×${state.size}</b> · Speed <b>${state.speedKey}</b> · Race to <b>${state.target}</b>.<br>The host controls the match settings.</div>`;
        const goal = state.twoPlayers
            ? `First to length ${state.target} — or the last snake alive — wins.`
            : `Reach length ${state.target} to win.`;
        const body = `
      <p class="snk-sub">${state.twoPlayers ? (state.bot ? "Duel the bot" : "1v1 duel") : "Solo run"} on a fresh, always-solvable arena. Eat food to grow; avoid walls, blocks and tails.</p>
      ${setup}
      <div class="snk-howto"><b>Quick start</b>
        <ul>
          <li>Steer with <kbd>WASD</kbd> / arrows, the pad, swipes, or by clicking the board.</li>
          <li>Food = +10 points and +1 length. ${goal}</li>
          <li>Crashing into a wall, a block or any snake body ends your run.</li>
        </ul>
        <button class="snk-link" type="button" data-act="help">Full guide →</button>
      </div>
      <p class="snk-fair">Fair start: spawn sides, player colors and who moves first are re-randomized every match. The first mover gets a one-cell head start.</p>`;
        const foot = isHost
            ? `<span class="snk-note">H help · C cheats · P pause</span><button class="snk-btn primary" type="button" data-act="start">Start game</button>`
            : `<span class="snk-note">Waiting for the host…</span>`;
        return card("Snake", state.twoPlayers ? (state.bot ? "VS Bot" : "1v1 Duel") : "Solo", body, foot);
    }
    function countHTML() {
        const my = mySlot();
        const body = `<div class="snk-count">${state.count}</div>
      <p class="snk-sub">You are Player ${my + 1} (${my === 0 ? "green" : "amber"}) · spawning on the ${SIDES[state.sides[my]]} side.<br>${state.order[0] === my ? "You move first." : `${rivalName()} moves first.`}</p>`;
        return card("Get ready", `Length ${state.target}`, body, "");
    }
    function pausedHTML() {
        const body = `<p class="snk-sub">Take a breath. ${online ? "Both players are paused." : ""}</p>`;
        const foot = `<span class="snk-note">P / Esc to resume</span><span class="snk-btnrow">
        <button class="snk-btn primary" type="button" data-act="pause">Resume</button>
        <button class="snk-btn" type="button" data-act="restart">Restart</button>
        ${isHost ? `<button class="snk-btn" type="button" data-act="menu">Settings</button>` : ""}
      </span>`;
        return card("Paused", "", body, foot);
    }
    function overHTML() {
        const my = mySlot(), rs = rivalSlot();
        const win = state.winner === my;
        let stats = `You: ${state.scores[my]} pts · length ${state.snakes[my].length}`;
        if (state.twoPlayers) stats += ` — ${rivalName()}: ${state.scores[rs]} pts · length ${state.snakes[rs].length}`;
        if (local) stats += ` — Best: ${best}`;
        if (local && usedCheats) stats += ` (cheats used, best not saved)`;
        const body = `<p class="snk-sub ${win ? "snk-win" : state.winner === -1 ? "" : "snk-lose"}">${endText(state.end)}</p>
      <p class="snk-stats">${stats}</p>`;
        const foot = `<span class="snk-note">R to restart</span><span class="snk-btnrow">
        <button class="snk-btn primary" type="button" data-act="restart">Play again</button>
        ${isHost ? `<button class="snk-btn" type="button" data-act="menu">Settings</button>` : ""}
      </span>`;
        return card(overTitle(), local ? "Local" : "Online", body, foot);
    }
    function helpHTML() {
        const body = `<div class="snk-help">
      <h4>Goal</h4>
      <p>Solo: grow to length ${TARGET_SOLO}. Duel (bot or multiplayer): first to length ${TARGET_DUEL}, or be the last snake alive. If both crash together, the longer snake wins.</p>
      <h4>Controls — desktop</h4>
      <ul>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to steer.</li>
        <li>Mouse: click anywhere on the board to steer toward that point.</li>
        <li><kbd>Space</kbd> start / pause · <kbd>R</kbd> restart · <kbd>H</kbd> this guide · <kbd>C</kbd> cheats · <kbd>Esc</kbd> close / pause.</li>
      </ul>
      <h4>Controls — mobile</h4>
      <ul>
        <li>Swipe anywhere on the board, or tap the virtual D-pad.</li>
        <li>Tap a spot on the board to steer toward it.</li>
      </ul>
      <h4>Rules</h4>
      <ul>
        <li>Each food is worth 10 points and grows you by one cell.</li>
        <li>Walls, arena blocks and any snake body (including your own) are deadly.</li>
        <li>You cannot reverse 180°. Up to two turns are buffered, so quick combos work.</li>
        <li>The snake speeds up gently as it eats — never beyond a readable pace.</li>
      </ul>
      <h4>Arenas</h4>
      <p>Eight layout families (Open Field, Pillars, Crossroads, The Ring, Lanes, Rubble, Labyrinth, Portal Field) are generated randomly at three sizes. Every arena is flood-fill verified: all open cells stay connected, so the food is always reachable and the level is always completable. Portal Field has no walls — edges wrap around.</p>
      <h4>Fair start</h4>
      <p>Every match re-rolls your spawn side, which player you are (P1 green / P2 amber) and who moves first. The first mover gets a one-cell head start.</p>
      ${local ? `<h4>Cheats</h4><p>Press <kbd>C</kbd> or the wrench button. Cheats work in local play only and disable Best-score saving for that run.</p>` : `<p><b>Note:</b> in multiplayer the match keeps running while this guide is open. Cheats are disabled online.</p>`}
    </div>`;
        const foot = `<span class="snk-note">Press H to reopen this guide</span><button class="snk-btn primary" type="button" data-act="close">Got it</button>`;
        return card("How to play", local ? "Solo / Bot" : "Online", body, foot);
    }
    function cheatsHTML() {
        const rows = CHEAT_LIST.map(([k, t, d]) =>
            `<div class="snk-cheatrow"><span><b>${t}</b><small>${d}</small></span><input class="snk-switch" type="checkbox" data-cheat="${k}"${cheats[k] ? " checked" : ""} aria-label="${t}"></div>`
        ).join("");
        const body = `<p class="snk-sub">Toggle helpers to make the game easier. Local play only.</p>
      <div style="text-align:left">${rows}</div>
      <p class="snk-note">Using any cheat disables Best-score saving for the current run.</p>`;
        const foot = `<span class="snk-note">Press C to close</span><button class="snk-btn primary" type="button" data-act="close">Close</button>`;
        return card("Cheats", "Local", body, foot);
    }
    function overlayHTML() {
        if (helpOpen) return helpHTML();
        if (cheatsOpen) return cheatsHTML();
        if (!state) return card("Snake", "", `<p class="snk-sub">Connecting to the room…</p>`, "");
        if (state.phase === "menu") return menuHTML();
        if (state.phase === "count") return countHTML();
        if (state.phase === "paused") return pausedHTML();
        if (state.phase === "over") return overHTML();
        return "";
    }

    /* ---------- render ---------- */
    function render() {
        if (destroyed) return;
        if (!state) {
            hudStatus.textContent = "Connecting…";
            ov.hidden = false;
            ov.innerHTML = helpOpen ? helpHTML() : card("Snake", "", `<p class="snk-sub">Connecting to the room…</p>`, "");
            return;
        }
        ensureCache();
        const my = mySlot(), rs = rivalSlot();
        const me = state.snakes[my], rv = state.snakes[rs];
        hudYou.textContent = `${state.scores[my]} · ${me.length}`;
        chipRival.hidden = !state.twoPlayers;
        if (state.twoPlayers) {
            hudRival.textContent = `${state.scores[rs]} · ${rv.length}`;
            hudRName.textContent = rivalName();
        }
        chipBest.hidden = !local;
        hudBest.textContent = best;
        hudMap.textContent = `${state.mapName} ${state.size}×${state.size}`;
        hudGoal.textContent = `Length ${state.target}`;
        swYou.style.background = my === 0 ? "#10b981" : "#f59e0b";
        swRival.style.background = my === 0 ? "#f59e0b" : "#10b981";
        const ncheat = Object.values(cheats).filter(Boolean).length;
        const cheatLabel = btnCheats.querySelector(".snk-btn-label");
        if (cheatLabel) cheatLabel.textContent = ncheat ? `Cheats ${ncheat}` : "Cheats";
        btnCheats.classList.toggle("on", ncheat > 0);
        btnPause.disabled = !(state.phase === "playing" || state.phase === "paused");
        const pauseLabel = btnPause.querySelector(".snk-btn-label");
        const pauseText = state.phase === "paused" ? "Resume" : "Pause";
        if (pauseLabel) pauseLabel.textContent = pauseText;
        btnPause.setAttribute("aria-label", pauseText);
        let st = "Ready";
        if (state.phase === "count") st = "Get ready…";
        else if (state.phase === "playing") st = "Playing";
        else if (state.phase === "paused") st = "Paused";
        else if (state.phase === "over") st = overTitle();
        hudStatus.textContent = st;

        // static layer: rebuild only when a new arena arrives
        if (wallSeed !== state.seed) {
            wallSeed = state.seed;
            const G = state.size, vb = G * CELL;
            svg.setAttribute("viewBox", `0 0 ${vb} ${vb}`);
            let w = "";
            for (const i of state.walls) {
                w += `<rect x="${X(i) * CELL + 1}" y="${Y(i) * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="5" fill="#94a3b8"/>`;
            }
            if (state.wrap) w += `<rect x="2" y="2" width="${vb - 4}" height="${vb - 4}" rx="8" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="7 7" opacity=".55"/>`;
            wallsG.innerHTML = w;
        }

        // dynamic layer: food + snakes
        const G = state.size;
        let s = "";
        if (state.food >= 0) {
            const fx = X(state.food) * CELL + CELL / 2, fy = Y(state.food) * CELL + CELL / 2;
            s += `<circle cx="${fx}" cy="${fy}" r="${CELL / 2 - 5}" fill="#ef4444"/>`;
            s += `<circle cx="${fx - 3}" cy="${fy - 3}" r="2.4" fill="#fecaca"/>`;
        }
        for (const slot of [rs, my]) { // rival first, you on top
            const sn = state.snakes[slot];
            if (!sn.length) continue;
            const dead = !state.alive[slot];
            const green = slot === 0;
            const headC = dead ? "#cbd5e1" : green ? "#10b981" : "#f59e0b";
            const lineC = dead ? "#94a3b8" : green ? "#065f46" : "#92400e";
            const n = sn.length;
            for (let i = n - 1; i >= 0; i--) {
                const t = n > 1 ? i / (n - 1) : 0;
                const fill = i === 0 ? headC : dead ? "#e2e8f0" : green
                    ? `hsl(160 60% ${Math.round(48 - t * 18)}%)`
                    : `hsl(36 85% ${Math.round(52 - t * 16)}%)`;
                s += `<rect x="${X(sn[i]) * CELL + 1.5}" y="${Y(sn[i]) * CELL + 1.5}" width="${CELL - 3}" height="${CELL - 3}" rx="6.5" fill="${fill}" stroke="${lineC}" stroke-width="1"${dead ? ' opacity=".75"' : ""}/>`;
            }
            const h = sn[0], dv = DIRV[state.dirs[slot]] || DIRV.R;
            const cx = X(h) * CELL + CELL / 2, cy = Y(h) * CELL + CELL / 2;
            const fx = dv[0] * 3.2, fy = dv[1] * 3.2, px = -dv[1] * 4, py = dv[0] * 4;
            const eye = dead ? "#64748b" : green ? "#064e3b" : "#78350f";
            s += `<circle cx="${cx + fx + px}" cy="${cy + fy + py}" r="2.1" fill="${eye}"/>`;
            s += `<circle cx="${cx + fx - px}" cy="${cy + fy - py}" r="2.1" fill="${eye}"/>`;
            if (isFrozen(slot)) s += `<circle cx="${cx}" cy="${cy}" r="${CELL / 2 - 2}" fill="none" stroke="#38bdf8" stroke-dasharray="3 4" stroke-width="2"/>`;
        }
        if (pending && state.phase === "playing" && me.length) {
            const dv = DIRV[pending.d];
            if (dv) {
                let nx = X(me[0]) + dv[0], ny = Y(me[0]) + dv[1];
                if (state.wrap) { nx = (nx + G) % G; ny = (ny + G) % G; }
                if (nx >= 0 && ny >= 0 && nx < G && ny < G) {
                    s += `<circle cx="${nx * CELL + CELL / 2}" cy="${ny * CELL + CELL / 2}" r="6" fill="none" stroke="${my === 0 ? "#10b981" : "#f59e0b"}" stroke-width="2" stroke-dasharray="3 3"/>`;
                }
            }
        }
        dynG.innerHTML = s;

        // overlay: rebuild only when its signature changes (keeps selects usable)
        const sig = [state.phase, helpOpen, cheatsOpen, state.count, state.winner, state.seed, state.size, state.mapName,
        state.speedKey, state.target, state.twoPlayers, state.bot, my,
        settings.mode, settings.map, settings.size, settings.speed, settings.bot, online, isHost].join("|");
        if (sig !== ovSig) { ovSig = sig; ov.innerHTML = overlayHTML(); }
        ov.hidden = !(helpOpen || cheatsOpen || state.phase === "menu" || state.phase === "count" || state.phase === "paused" || state.phase === "over");
        prevPhase = state.phase;
    }

    /* ---------- input: mouse / touch / keyboard ---------- */
    function autoPauseForModal() {
        if (!local || !state || pausedFrom) return;
        if (state.phase === "playing") { submitAction({ t: "pause" }); pausedFrom = "play"; }
        else if (state.phase === "count") { clearTimer("count"); state.phase = "paused"; publish(); pausedFrom = "count"; }
    }
    function resumeAfterModal() {
        if (helpOpen || cheatsOpen || !pausedFrom || !state) return;
        const from = pausedFrom;
        pausedFrom = null;
        if (from === "count") startCountdown();
        else if (state.phase === "paused") submitAction({ t: "pause" });
    }
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !helpOpen;
        if (next === helpOpen) return;
        if (next) { autoPauseForModal(); cheatsOpen = false; helpOpen = true; }
        else { helpOpen = false; resumeAfterModal(); }
        render();
    }
    function toggleCheats(on) {
        if (!local) return;
        const next = typeof on === "boolean" ? on : !cheatsOpen;
        if (next === cheatsOpen) return;
        if (next) { autoPauseForModal(); helpOpen = false; cheatsOpen = true; }
        else { cheatsOpen = false; resumeAfterModal(); }
        render();
    }
    function closeModal() {
        if (!helpOpen && !cheatsOpen) return;
        helpOpen = false;
        cheatsOpen = false;
        resumeAfterModal();
        render();
    }
    function handleClick(e) {
        if (destroyed) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) {
            if (helpOpen || cheatsOpen) closeModal();
            else if (state && (state.phase === "playing" || state.phase === "paused")) submitAction({ t: "pause" });
            return;
        }
        if (t.closest("[data-restart]")) { closeModal(); if (state && state.phase !== "menu") submitAction({ t: "restart" }); return; }
        const b = t.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "help") { toggleHelp(); return; }
        if (act === "close") { closeModal(); return; }
        if (!state) return;
        if (act === "start") submitAction({ t: "start" });
        else if (act === "restart") { closeModal(); submitAction({ t: "restart" }); }
        else if (act === "pause") { if (helpOpen || cheatsOpen) closeModal(); else submitAction({ t: "pause" }); }
        else if (act === "menu") submitAction({ t: "menu" });
    }
    function handleChange(e) {
        const sel = e.target.closest("[data-set]");
        if (sel) {
            if (!isHost || !state || state.phase !== "menu") { render(); return; }
            settings[sel.dataset.set] = sel.value;
            submitAction({ t: "settings", settings: { ...settings } });
            return;
        }
        const ch = e.target.closest("[data-cheat]");
        if (ch && local) {
            cheats[ch.dataset.cheat] = ch.checked;
            if (ch.checked) usedCheats = true;
            render();
        }
    }
    let ptr = null;
    function onPointerDown(e) {
        if (helpOpen || cheatsOpen) return;
        const db = e.target.closest("[data-dir]");
        if (db) { e.preventDefault(); submitAction({ t: "dir", d: db.dataset.dir }); return; }
        if (e.target === svg || svg.contains(e.target)) {
            ptr = { x: e.clientX, y: e.clientY, id: e.pointerId };
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        }
    }
    function onPointerUp(e) {
        if (helpOpen || cheatsOpen) { ptr = null; return; }
        if (!ptr || e.pointerId !== ptr.id) return;
        const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
        ptr = null;
        if (!state || (state.phase !== "playing" && state.phase !== "count")) return;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) { // swipe
            const d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
            submitAction({ t: "dir", d });
            return;
        }
        const sn = state.snakes[mySlot()]; // click-to-steer toward the tapped cell
        if (!sn.length) return;
        const r = svg.getBoundingClientRect();
        const G = state.size, vb = G * CELL;
        const cx = Math.floor(((e.clientX - r.left) / r.width) * vb / CELL);
        const cy = Math.floor(((e.clientY - r.top) / r.height) * vb / CELL);
        const ddx = cx - X(sn[0]), ddy = cy - Y(sn[0]);
        if (!ddx && !ddy) return;
        const d = Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? "right" : "left") : (ddy > 0 ? "down" : "up");
        submitAction({ t: "dir", d });
    }
    const KEYS = {
        ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
        ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    };
    function onKey(e) {
        if (destroyed) return;
        const t = e.target;
        if (t && /^(SELECT|INPUT|TEXTAREA)$/.test(t.tagName || "")) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const code = e.code || "";
        const k = (e.key || "").toLowerCase();
        // priority 1 — help (works even before the room snapshot arrives)
        if (code === "KeyH" || k === "h" || k === "?") { e.preventDefault(); toggleHelp(); return; }
        // priority 2 — cheats
        if (code === "KeyC" || k === "c") { e.preventDefault(); if (local) toggleCheats(); return; }
        // priority 3 — pause / Escape (closes an open modal first)
        if (code === "KeyP" || k === "p" || k === "escape") {
            e.preventDefault();
            if (helpOpen || cheatsOpen) { closeModal(); return; }
            if (state && (state.phase === "playing" || state.phase === "paused")) submitAction({ t: "pause" });
            return;
        }
        // a modal owns the board: no steering or phase actions behind it
        if (helpOpen || cheatsOpen) {
            if (k === "enter" || k === " ") { e.preventDefault(); closeModal(); }
            return;
        }
        if (!state) return;
        // priority 4 — game actions
        if (code === "KeyR" || k === "r") {
            if (state.phase !== "menu") submitAction({ t: "restart" });
            e.preventDefault();
            return;
        }
        const dir = KEYS[code] || KEYS[e.key];
        if (dir) { e.preventDefault(); submitAction({ t: "dir", d: dir }); return; }
        if (k === " " && t && (t.tagName === "BUTTON" || t.tagName === "A")) return; // focused buttons handle Space natively
        if (k === " ") {
            e.preventDefault();
            if (state.phase === "menu") { if (isHost) submitAction({ t: "start" }); }
            else if (state.phase === "playing" || state.phase === "paused") submitAction({ t: "pause" });
            else if (state.phase === "over") submitAction({ t: "restart" });
        }
    }

    /* ---------- room state normalization (Firebase drops empty arrays/nulls) ---------- */
    function normState(s) {
        if (!s || typeof s !== "object") return null;
        s.snakes = [(s.snakes && s.snakes[0]) || [], (s.snakes && s.snakes[1]) || []];
        s.walls = s.walls || [];
        s.dirs = s.dirs || ["R", "L"];
        s.alive = s.alive || [true, false];
        s.scores = s.scores || [0, 0];
        s.order = s.order || [0, 1];
        s.sides = s.sides || [0, 1];
        if (typeof s.food !== "number") s.food = -1;
        if (typeof s.winner === "undefined") s.winner = null;
        if (typeof s.end === "undefined") s.end = null;
        return s;
    }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKey);

    if (online) {
        const u0 = room.onRoom && room.onRoom((r) => { if (destroyed) return; roomData = r; render(); });
        if (typeof u0 === "function") subs.push(u0);
        if (isHost) {
            newMatch();
            publish();
            const u1 = room.onAction && room.onAction((a) => applyAction(a, 1));
            if (typeof u1 === "function") subs.push(u1);
        } else {
            const u2 = room.onState && room.onState((raw) => {
                if (destroyed) return;
                const next = normState(raw);
                if (!next) return;
                state = next;
                ensureCache();
                if (pending && state.tick > pending.tick) pending = null;
                if (prevPhase === "count" && state.phase === "playing") {
                    toast(state.order[0] === mySlot() ? "You move first!" : `${rivalName()} moves first!`);
                }
                render();
            });
            if (typeof u2 === "function") subs.push(u2);
            render(); // "Connecting…" until the first snapshot arrives
        }
    } else {
        newMatch();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimer("tick"); clearTimer("count"); clearTimer("toast");
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("pointerdown", onPointerDown);
            root.removeEventListener("pointerup", onPointerUp);
            document.removeEventListener("keydown", onKey);
            for (const un of subs) { try { un(); } catch (e) { /* ignore */ } }
        },
    };
}