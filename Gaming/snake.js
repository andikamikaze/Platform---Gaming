/* ==== snake.js ==== */
/* Snake — minimalist arena snake for the games template.
   Local: Solo or VS Bot. Online: host-authoritative 1v1 duel.
   Random solvable arenas, randomized fair starts, local cheat overlay. */

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
    let panel = null; // "help" | "cheats" | null
    let pending = null; // guest optimistic direction indicator
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* storage blocked */ }
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
.snk{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--soft:#f8fafc;--acc:#10b981;--acc2:#f59e0b;--bad:#ef4444;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.snk *{box-sizing:border-box}
.snk [hidden]{display:none !important}
.snk-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0 12px}
.snk-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:12px;color:var(--mut);background:#fff;white-space:nowrap}
.snk-chip b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:700}
.snk-sw{width:8px;height:8px;border-radius:50%;display:inline-block}
.snk-spacer{flex:1}
.snk-ibtn{height:34px;min-width:34px;padding:0 11px;border:1px solid var(--line);background:#fff;border-radius:10px;color:var(--ink);cursor:pointer;font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}
.snk-ibtn:hover{background:var(--soft)}
.snk-ibtn:disabled{opacity:.4;cursor:default}
.snk-ibtn svg{width:15px;height:15px}
.snk-panel{padding:0;background:transparent;border:0}
.snk-boardwrap{position:relative;width:min(100%,620px);margin:0 auto;aspect-ratio:1/1;background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
.snk-svg{width:100%;height:100%;display:block;border-radius:10px;touch-action:none;cursor:crosshair;background:var(--soft)}
.snk-overlay{position:absolute;inset:10px;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.9);backdrop-filter:blur(3px);border-radius:10px;overflow:auto;padding:18px;z-index:3}
.snk-card{max-width:430px;width:100%;text-align:center;margin:auto}
.snk-card h3{margin:0 0 6px;font-size:22px;letter-spacing:-.02em}
.snk-sub{color:var(--mut);font-size:13px;margin:0 0 14px;line-height:1.55}
.snk-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 0 12px;text-align:left}
.snk-field{display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.snk-field select{height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:13px;padding:0 8px;font-family:inherit;width:100%}
.snk-btn{height:38px;padding:0 18px;border:1px solid var(--line);background:#fff;border-radius:10px;color:var(--ink);cursor:pointer;font-size:14px;font-weight:600;font-family:inherit}
.snk-btn:hover{background:var(--soft)}
.snk-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.snk-btn.primary:hover{opacity:.88}
.snk-btnrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px}
.snk-howto{text-align:left;font-size:12.5px;color:#334155;line-height:1.6;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0 0 12px;background:#fff}
.snk-howto ul{margin:4px 0 0;padding-left:16px}
.snk-link{background:none;border:0;color:var(--acc);cursor:pointer;font-size:12px;font-weight:700;padding:0;font-family:inherit}
.snk-fair{font-size:11px;color:var(--mut);margin:12px 0 0;line-height:1.5}
.snk-count{font-size:64px;font-weight:800;letter-spacing:-.04em;line-height:1.1}
.snk-toast{position:absolute;top:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:12px;font-weight:600;padding:6px 13px;border-radius:999px;z-index:4;white-space:nowrap;box-shadow:0 4px 14px rgba(15,23,42,.25)}
.snk-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;flex-wrap:wrap}
.snk-dpad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:6px;touch-action:none;user-select:none;-webkit-user-select:none}
.snk-dbtn{border:1px solid var(--line);background:#fff;border-radius:12px;color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.snk-dbtn:active{background:var(--soft);transform:scale(.94)}
.snk-dbtn svg{width:20px;height:20px}
.snk-hints{color:var(--mut);font-size:12px;line-height:1.7;flex:1;min-width:210px}
.snk-help{text-align:left;font-size:13px;line-height:1.65;color:#334155}
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
.snk-note{font-size:11px;color:var(--mut);margin:12px 0 0;line-height:1.5}
.snk-stats{font-size:13px;color:#334155;font-weight:600;margin:0 0 12px}
.snk-dot--live{background:#10b981 !important}
.snk-dot--warn{background:#f59e0b !important}
.snk-dot--end{background:#ef4444 !important}
.snk-win{color:var(--acc)}
.snk-lose{color:var(--bad)}
@media (pointer:coarse){
  .snk-dpad{grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,56px)}
  .snk-ibtn{height:40px}
  .snk-btn{height:44px}
}
@media (max-width:560px){
  .snk-boardwrap{padding:6px;border-radius:12px}
  .snk-overlay{inset:6px;padding:12px}
  .snk-hints{display:none}
}
</style>
<div class="game-app snk">
  <div class="game-intro">
    <div><h2>Snake</h2><p>Minimalist snake arena — eat, grow and outlast your rival. Every match builds a fresh, always-solvable map.</p></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
  </div>
  <div class="snk-toolbar">
    <span class="snk-chip"><span class="snk-sw" data-sw="you"></span>You <b data-hud="you">0</b></span>
    <span class="snk-chip" data-chip="rival"><span class="snk-sw" data-sw="rival"></span><span data-hud="rname">Rival</span> <b data-hud="rival">0</b></span>
    <span class="snk-chip" data-chip="best">Best <b data-hud="best">0</b></span>
    <span class="snk-chip">Map <b data-hud="map">—</b></span>
    <span class="snk-chip">Goal <b data-hud="goal">—</b></span>
    <span class="snk-spacer"></span>
    <button class="snk-ibtn" type="button" data-act="pause" data-btn="pause" title="Pause / resume (Space)" aria-label="Pause or resume"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>
    <button class="snk-ibtn" type="button" data-act="restart" title="Restart match (R)" aria-label="Restart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button>
    <button class="snk-ibtn" type="button" data-act="help" title="How to play (H)" aria-label="How to play">?</button>
    <button class="snk-ibtn" type="button" data-act="cheats" data-btn="cheats" title="Cheats (C)" aria-label="Cheats" ${online ? "hidden" : ""}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg><span data-hud="cheatn"></span></button>
  </div>
  <section class="game-panel snk-panel" data-board>
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
      <div class="snk-overlay" data-ov hidden></div>
    </div>
  </section>
  <div class="snk-foot">
    <div class="snk-dpad" data-dpad>
      <button class="snk-dbtn" type="button" data-dir="up" style="grid-column:2;grid-row:1" aria-label="Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>
      <button class="snk-dbtn" type="button" data-dir="left" style="grid-column:1;grid-row:2" aria-label="Left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></button>
      <button class="snk-dbtn" type="button" data-dir="down" style="grid-column:2;grid-row:2" aria-label="Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>
      <button class="snk-dbtn" type="button" data-dir="right" style="grid-column:3;grid-row:2" aria-label="Right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg></button>
    </div>
    <div class="snk-hints">
      <b>Desktop:</b> <kbd>WASD</kbd> / <kbd>arrows</kbd> steer · click the board to steer toward the cursor · <kbd>Space</kbd> pause · <kbd>R</kbd> restart · <kbd>H</kbd> help.<br>
      <b>Mobile:</b> swipe on the board or use the pad above.
    </div>
  </div>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (sel) => root.querySelector(sel);
    const svg = $("[data-svg]");
    const wallsG = $("[data-walls]");
    const dynG = $("[data-dyn]");
    const ov = $("[data-ov]");
    const toastEl = $("[data-toast]");
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const hudYou = $('[data-hud="you"]');
    const hudRival = $('[data-hud="rival"]');
    const hudRName = $('[data-hud="rname"]');
    const hudBest = $('[data-hud="best"]');
    const hudMap = $('[data-hud="map"]');
    const hudGoal = $('[data-hud="goal"]');
    const hudCheatN = $('[data-hud="cheatn"]');
    const chipRival = $('[data-chip="rival"]');
    const chipBest = $('[data-chip="best"]');
    const swYou = $('[data-sw="you"]');
    const swRival = $('[data-sw="rival"]');
    const btnPause = $('[data-btn="pause"]');

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
        return `<div class="snk-card">
      <h3>Snake</h3>
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
      ${isHost ? `<button class="snk-btn primary" type="button" data-act="start">Start game</button>` : `<p class="snk-sub">Waiting for the host to start…</p>`}
      <p class="snk-fair">Fair start: spawn sides, player colors and who moves first are re-randomized every match. The first mover gets a one-cell head start.</p>
    </div>`;
    }
    function countHTML() {
        const my = mySlot();
        return `<div class="snk-card">
      <div class="snk-count">${state.count}</div>
      <p class="snk-sub">You are Player ${my + 1} (${my === 0 ? "green" : "amber"}) · spawning on the ${SIDES[state.sides[my]]} side.<br>${state.order[0] === my ? "You move first." : `${rivalName()} moves first.`}</p>
    </div>`;
    }
    function pausedHTML() {
        return `<div class="snk-card">
      <h3>Paused</h3>
      <p class="snk-sub">Take a breath. ${online ? "Both players are paused." : ""}</p>
      <div class="snk-btnrow">
        <button class="snk-btn primary" type="button" data-act="pause">Resume</button>
        <button class="snk-btn" type="button" data-act="restart">Restart</button>
        ${isHost ? `<button class="snk-btn" type="button" data-act="menu">Settings</button>` : ""}
      </div>
    </div>`;
    }
    function overHTML() {
        const my = mySlot(), rs = rivalSlot();
        const win = state.winner === my;
        let stats = `You: ${state.scores[my]} pts · length ${state.snakes[my].length}`;
        if (state.twoPlayers) stats += ` — ${rivalName()}: ${state.scores[rs]} pts · length ${state.snakes[rs].length}`;
        if (local) stats += ` — Best: ${best}`;
        if (local && usedCheats) stats += ` (cheats used, best not saved)`;
        return `<div class="snk-card">
      <h3 class="${win ? "snk-win" : state.winner === -1 ? "" : "snk-lose"}">${overTitle()}</h3>
      <p class="snk-sub">${endText(state.end)}</p>
      <p class="snk-stats">${stats}</p>
      <div class="snk-btnrow">
        <button class="snk-btn primary" type="button" data-act="restart">Play again</button>
        ${isHost ? `<button class="snk-btn" type="button" data-act="menu">Settings</button>` : ""}
      </div>
    </div>`;
    }
    function helpHTML() {
        return `<div class="snk-card snk-help">
      <h3 style="text-align:center">How to play</h3>
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
      ${local ? `<h4>Cheats</h4><p>Press <kbd>C</kbd> or the bolt button. Cheats work in local play only and disable Best-score saving for that run.</p>` : `<p><b>Note:</b> in multiplayer the match keeps running while this guide is open. Cheats are disabled online.</p>`}
      <div class="snk-btnrow"><button class="snk-btn primary" type="button" data-act="close">Got it</button></div>
    </div>`;
    }
    function cheatsHTML() {
        const rows = CHEAT_LIST.map(([k, t, d]) =>
            `<div class="snk-cheatrow"><span><b>${t}</b><small>${d}</small></span><input class="snk-switch" type="checkbox" data-cheat="${k}"${cheats[k] ? " checked" : ""} aria-label="${t}"></div>`
        ).join("");
        return `<div class="snk-card">
      <h3>Cheats</h3>
      <p class="snk-sub">Toggle helpers to make the game easier. Local play only.</p>
      <div style="text-align:left">${rows}</div>
      <p class="snk-note">Using any cheat disables Best-score saving for the current run.</p>
      <div class="snk-btnrow"><button class="snk-btn primary" type="button" data-act="close">Close</button></div>
    </div>`;
    }
    function overlayHTML() {
        if (panel === "help") return helpHTML();
        if (panel === "cheats") return cheatsHTML();
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
            statusEl.textContent = "Connecting…";
            ov.hidden = false;
            ov.innerHTML = `<div class="snk-card"><h3>Snake</h3><p class="snk-sub">Connecting to the room…</p></div>`;
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
        hudCheatN.textContent = ncheat ? String(ncheat) : "";
        btnPause.disabled = !(state.phase === "playing" || state.phase === "paused");
        let st = "Ready", dc = "";
        if (state.phase === "count") { st = "Get ready…"; dc = "snk-dot--warn"; }
        else if (state.phase === "playing") { st = "Playing"; dc = "snk-dot--live"; }
        else if (state.phase === "paused") { st = "Paused"; dc = "snk-dot--warn"; }
        else if (state.phase === "over") { st = overTitle(); dc = state.winner === my ? "snk-dot--live" : "snk-dot--end"; }
        statusEl.textContent = st;
        dotEl.className = "game-status-dot" + (dc ? " " + dc : "");

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
        const sig = [state.phase, panel, state.count, state.winner, state.seed, state.size, state.mapName,
        state.speedKey, state.target, state.twoPlayers, state.bot, my,
        settings.mode, settings.map, settings.size, settings.speed, settings.bot, online, isHost].join("|");
        if (sig !== ovSig) { ovSig = sig; ov.innerHTML = overlayHTML(); }
        ov.hidden = !(panel || state.phase === "menu" || state.phase === "count" || state.phase === "paused" || state.phase === "over");
        prevPhase = state.phase;
    }

    /* ---------- input: mouse / touch / keyboard ---------- */
    function togglePanel(name) {
        if (panel === name) panel = null;
        else {
            if (name === "help" && local && state && state.phase === "playing") submitAction({ t: "pause" });
            panel = name;
        }
        render();
    }
    function handleClick(e) {
        if (destroyed) return;
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "help") { togglePanel("help"); return; }
        if (act === "cheats") { if (local) togglePanel("cheats"); return; }
        if (act === "close") { panel = null; render(); return; }
        if (!state) return;
        if (act === "start") submitAction({ t: "start" });
        else if (act === "restart") submitAction({ t: "restart" });
        else if (act === "pause") submitAction({ t: "pause" });
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
        const db = e.target.closest("[data-dir]");
        if (db) { e.preventDefault(); submitAction({ t: "dir", d: db.dataset.dir }); return; }
        if (e.target === svg || svg.contains(e.target)) {
            ptr = { x: e.clientX, y: e.clientY, id: e.pointerId };
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        }
    }
    function onPointerUp(e) {
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
        if (destroyed || !state) return;
        const t = e.target;
        if (t && /^(SELECT|INPUT|TEXTAREA)$/.test(t.tagName || "")) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const dir = KEYS[e.code] || KEYS[e.key];
        if (dir) { e.preventDefault(); submitAction({ t: "dir", d: dir }); return; }
        const k = e.key;
        if (k === " " && t && (t.tagName === "BUTTON" || t.tagName === "A")) return; // focused buttons handle Space natively
        if (k === " ") {
            e.preventDefault();
            if (state.phase === "menu") { if (isHost) submitAction({ t: "start" }); }
            else if (state.phase === "playing" || state.phase === "paused") submitAction({ t: "pause" });
            else if (state.phase === "over") submitAction({ t: "restart" });
        } else if (k === "p" || k === "P") {
            if (state.phase === "playing" || state.phase === "paused") submitAction({ t: "pause" });
        } else if (k === "r" || k === "R") {
            if (state.phase !== "menu") submitAction({ t: "restart" });
        } else if (k === "h" || k === "H" || k === "?") togglePanel("help");
        else if ((k === "c" || k === "C") && local) togglePanel("cheats");
        else if (k === "Escape") {
            if (panel) { panel = null; render(); }
            else if (state.phase === "playing") submitAction({ t: "pause" });
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