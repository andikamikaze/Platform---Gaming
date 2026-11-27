/* ==== games/arrow-maze.js ==== */
/* Arrow Maze — ES module for the mount(root, context) template.
   Modes: "ai" (vs bot, local) and "room" (host-authoritative Firebase sync).
   Controls: mouse click / tap; keyboard WASD-arrows + Enter/Space, H hint, C cheats, R restart;
   on-screen D-pad appears automatically on coarse pointers (mobile). */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "arrow-maze",
    name: "Arrow Maze",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Fire arrows out of the grid in the right order before time ends.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="40" height="40" rx="6" fill="#1e1b4b"/><g stroke="#60a5fa"><line x1="12" y1="16" x2="12" y2="32"/><path d="M7 27l5 6 5-6" fill="none"/></g><g stroke="#34d399" transform="rotate(90 32 24)"><line x1="32" y1="16" x2="32" y2="32" transform="translate(-8 8)"/><path d="M19 35l5 6 5-6" fill="none" transform="translate(-8 -19)"/></g><g stroke="#f87171"><line x1="16" y1="36" x2="32" y2="36"/><path d="M27 31l6 5-6 5" fill="none"/></g></svg>`,
    bg: ["#312e81", "#1e1b4b"],
};

const DV = [
    [0, -1], // 0 up
    [1, 0],  // 1 right
    [0, 1],  // 2 down
    [-1, 0], // 3 left
];
const LEVELS = [
    { n: 5, fill: 0.75, lives: 3, time: 60 },
    { n: 6, fill: 0.8, lives: 3, time: 75 },
    { n: 7, fill: 0.85, lives: 3, time: 95 },
    { n: 8, fill: 0.9, lives: 2, time: 120 },
];
/* arrow types: 0 normal, 1 twin (x2 points, also removes the cell behind it),
   2 blast (also removes 4 orthogonal neighbours), 3 heavy (needs two hits) */
const PTS = [10, 20, 15, 25];

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pathLen(grid, W, H, x, y, d) {
    const [dx, dy] = DV[d];
    let k = 1;
    for (; ;) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) return k - 1;
        if (grid[ny * W + nx]) return -1;
        k++;
    }
}

function removable(grid, W, H, i) {
    const a = grid[i];
    if (!a) return false;
    return pathLen(grid, W, H, i % W, (i / W) | 0, a.d) >= 0;
}

function removableList(grid, W, H) {
    const out = [];
    for (let i = 0; i < grid.length; i++) if (removable(grid, W, H, i)) out.push(i);
    return out;
}

/* Solvable-by-construction generator: every arrow is placed only when its exit
   corridor is empty, so removing arrows in reverse placement order always works.
   Twin/blast only remove extra arrows (never block), heavy only needs an extra
   tap — solvability is preserved for every seed. */
function genLevel(rnd, li) {
    const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, li))];
    const W = cfg.n, H = cfg.n;
    const grid = new Array(W * H).fill(null);
    const target = Math.floor(W * H * cfg.fill);
    let placed = 0, guard = 0;
    while (placed < target && guard++ < 6000) {
        const cands = [];
        for (let i = 0; i < W * H; i++) {
            if (grid[i]) continue;
            const x = i % W, y = (i / W) | 0;
            for (let d = 0; d < 4; d++) {
                const len = pathLen(grid, W, H, x, y, d);
                if (len >= 0) cands.push({ i, d, len });
            }
        }
        if (!cands.length) break;
        let total = 0;
        const wts = cands.map((c) => { const w = c.len + 1; total += w; return w; });
        let r = rnd() * total, pick = 0;
        for (let k = 0; k < cands.length; k++) { r -= wts[k]; if (r <= 0) { pick = k; break; } }
        const c = cands[pick];
        const tr = rnd();
        const t = tr < 0.58 ? 0 : tr < 0.74 ? 1 : tr < 0.88 ? 2 : 3;
        grid[c.i] = { d: c.d, t, hp: t === 3 ? 2 : 1 };
        placed++;
    }
    return { grid, W, H, cfg };
}

function bestMove(grid, W, H) {
    const list = removableList(grid, W, H);
    if (!list.length) return -1;
    let best = -1, bestV = -Infinity;
    for (const i of list) {
        const a = grid[i], x = i % W, y = (i / W) | 0;
        let v;
        if (a.t === 3) v = a.hp === 1 ? 26 : 6;
        else if (a.t === 1) {
            const [dx, dy] = DV[a.d];
            const bx = x - dx, by = y - dy;
            v = 20 + (bx >= 0 && bx < W && by >= 0 && by < H && grid[by * W + bx] ? 10 : 0);
        } else if (a.t === 2) {
            let n = 0;
            for (const [dx, dy] of DV) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx]) n++;
            }
            v = 15 + 5 * n;
        } else v = 10;
        v += Math.random() * 1.5;
        if (v > bestV) { bestV = v; best = i; }
    }
    return best;
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    const coarse =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        "ontouchstart" in window;

    root.innerHTML = `
<style>
.am-app{--ink:#111827;--line:#e5e7eb;--mut:#6b7280;--acc:#2563eb;--ok:#059669;--bad:#dc2626;--warn:#d97706;color:var(--ink)}
.am-app [hidden]{display:none!important}
.am-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px}
.am-spacer{flex:1 1 auto}
.am-app .am-hbtn{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;min-height:30px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation}
.am-app .am-hbtn svg{flex:none;display:block}
.am-app .am-hbtn.on{border-color:var(--acc);color:var(--acc)}
.am-app .am-hbtn:disabled{opacity:.4;cursor:default}
.am-chip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:#fff;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.am-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.am-chip.turn{border-color:var(--acc);color:var(--acc)}
.am-chip.turn b{color:var(--acc)}
.am-chip.warn{border-color:var(--bad);color:var(--bad)}
.am-chip.warn b{color:var(--bad)}
.am-dots{display:inline-flex;gap:3px}
.am-dot{width:5px;height:5px;border-radius:50%;background:var(--ok)}
.am-dot.off{background:var(--line)}
.am-badge{border-color:var(--warn);color:var(--warn)}
.am-panel{position:relative;background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden}
.am-svg{display:block;width:min(100%,440px);margin:0 auto;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.am-cell{fill:#fafafa;stroke:var(--line);stroke-width:.35;cursor:pointer}
.am-arrow{color:var(--ink);cursor:pointer}
.am-arrow.am-open{color:var(--ok)}
.am-cursor{fill:none;stroke:var(--acc);stroke-width:1;pointer-events:none}
.am-flyer{transition:transform .38s cubic-bezier(.5,0,.9,.4),opacity .38s ease-in}
.am-ring{fill:none;pointer-events:none}
.am-ring.hint{stroke:var(--acc);stroke-width:1.1;animation:amPulse .45s ease-in-out 4 alternate}
.am-ring.bad{stroke:var(--bad);stroke-width:1.2;animation:amFade .45s ease-out forwards}
.am-ring.crack{stroke:var(--warn);stroke-width:1.2;animation:amFade .5s ease-out forwards}
@keyframes amPulse{from{opacity:.15}to{opacity:1}}
@keyframes amFade{from{opacity:1}to{opacity:0}}
.am-veil{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.88);backdrop-filter:blur(3px);border-radius:16px}
.am-card{text-align:center;padding:20px;max-width:320px}
.am-card h3{margin:0 0 6px;font-size:20px;letter-spacing:-.01em}
.am-card p{margin:0 0 14px;color:var(--mut);font-size:13px;line-height:1.5}
.am-btn{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:10px;padding:8px 14px;font-size:13px;cursor:pointer;margin:0 3px}
.am-btn.ghost{background:#fff;color:var(--ink);border-color:var(--line)}
.am-btn:disabled{opacity:.4;cursor:default}
.am-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(255,255,255,.9);border-radius:16px}
.am-cheats{width:min(320px,100%);max-height:100%;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:none}
.am-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;text-align:left}
.am-help b{display:block;margin-bottom:4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.am-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;color:var(--mut)}
.am-cheats h4{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.am-cheats h4 button{border:0;background:none;color:var(--mut);font-size:14px;cursor:pointer;padding:0 2px}
.am-crow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:13px}
.am-toggle{border:1px solid var(--line);background:#fff;color:var(--mut);border-radius:999px;padding:2px 10px;font-size:11px;cursor:pointer;min-width:44px}
.am-toggle.on{background:var(--acc);border-color:var(--acc);color:#fff}
.am-mini{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer}
.am-pad{display:none;margin-top:10px;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(3,46px);grid-template-areas:". up ." "left fire right" ". down .";gap:6px;justify-content:center}
.am-coarse .am-pad{display:grid}
.am-pad button{border:1px solid var(--line);background:#fff;border-radius:12px;font-size:16px;color:var(--ink);cursor:pointer}
.am-pad button:active{background:#f3f4f6}
.am-pad .am-fire{grid-area:fire;background:var(--ink);border-color:var(--ink);color:#fff;font-size:12px;letter-spacing:.08em}
.am-pad [data-act="pad-up"]{grid-area:up}
.am-pad [data-act="pad-left"]{grid-area:left}
.am-pad [data-act="pad-right"]{grid-area:right}
.am-pad [data-act="pad-down"]{grid-area:down}
.am-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.am-app{min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.am-app *,.am-app *::before,.am-app *::after{box-sizing:border-box}
.am-app :where(svg,canvas,img){max-width:100%;height:auto}
.am-app :where(button,[role="button"],select,input){touch-action:manipulation}
.am-app :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
/* 4px spacing grid: HUD/control rows wrap instead of overflowing on narrow screens. */
.am-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){flex-wrap:wrap;min-width:0;gap:8px}
/* Thin borders and calm surfaces instead of heavy elevation. */
.am-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
/* Clear type hierarchy: 12px metadata, compact headings. */
.am-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.am-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .am-app :where([class*="stage"],[class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .am-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){gap:8px}
}
@media (max-width:480px){
  .am-app :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .am-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .am-app *,.am-app *::before,.am-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* --- layout redesign overrides (keep last) --- */
@media (max-width:640px){
.am-app .am-hud{gap:5px 8px;margin-bottom:6px}
.am-app .am-hbtn{min-width:28px;min-height:28px;padding:4px 6px;font-size:10px}
.am-app .am-hbtn .am-hlbl,.am-app .am-spacer{display:none}
.am-panel{flex:0 0 auto;min-height:min(70dvh,620px)}
.am-card{padding:14px}
.am-pad button{min-width:44px;min-height:44px}
}
</style>
<div class="game-app am-app game-fill${coarse ? " am-coarse" : ""}">
  <div class="am-hud">
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <div class="am-hud-chips" data-hud></div>
    <span class="am-spacer"></span>
    <button class="am-btn am-hbtn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="am-hlbl">Help</span></button>
    <button class="am-btn am-hbtn" type="button" data-act="hint" data-hintbtn aria-label="Hint" title="Hint (I)">${iconSVG("lightbulb", { size: 14 })}<span class="am-hlbl">Hint · 3</span></button>
    <button class="am-btn am-hbtn" type="button" data-act="cheat-open" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="am-hlbl">Cheats</span></button>
    <button class="am-btn am-hbtn" type="button" data-act="pause" data-pause-btn aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="am-hlbl">Pause</span></button>
    <button class="am-btn am-hbtn" type="button" data-act="restart" data-restart-btn aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="am-hlbl">Restart</span></button>
    <button class="am-btn am-hbtn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="am-hlbl">Exit</span></button>
  </div>
  <section class="game-panel am-panel" data-board>
    <svg class="am-svg" data-svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arrow maze grid">
      <g data-cells></g>
      <rect class="am-cursor" data-cursor rx="2" x="0" y="0" width="0" height="0"></rect>
      <g data-fx></g>
    </svg>
    <div class="am-ov" data-cheats hidden>
      <div class="am-cheats">
        <h4><span>Cheats</span><button type="button" data-act="cheat-close" aria-label="Close cheats">&#215;</button></h4>
        <div class="am-crow"><span>Freeze time</span><button type="button" class="am-toggle" data-act="cheat-toggle" data-key="freeze">OFF</button></div>
        <div class="am-crow"><span>Reveal exits</span><button type="button" class="am-toggle" data-act="cheat-toggle" data-key="reveal">OFF</button></div>
        <div class="am-crow"><span>Safe taps</span><button type="button" class="am-toggle" data-act="cheat-toggle" data-key="safe">OFF</button></div>
        <div class="am-crow"><span>Add 30 seconds</span><button type="button" class="am-mini" data-act="cheat-time">+30s</button></div>
        <div class="am-crow"><span>Auto best move</span><button type="button" class="am-mini" data-act="cheat-auto">Fire</button></div>
        <div class="am-crow"><span>Skip board</span><button type="button" class="am-mini" data-act="cheat-skip">Skip</button></div>
      </div>
    </div>
    <div class="am-veil" data-veil hidden></div>
    <div class="am-ov" data-ov="help" hidden>
      <div class="am-card">
        <h3>How to play</h3>
        <div class="am-help">
          <div>
            <b>Goal</b>
            <ul>
              <li>Fire every arrow out of the grid before time runs out.</li>
              <li>An arrow can only exit if the cells beyond it are empty.</li>
              <li>Wrong taps cost a life and pass the turn.</li>
            </ul>
            <b>Arrows</b>
            <ul>
              <li>Normal: 10 pts · Twin: 20 pts (clears the cell behind).</li>
              <li>Blast: 15 pts (clears 4 neighbours) · Heavy: 25 pts (needs two hits).</li>
            </ul>
          </div>
          <div>
            <b>Controls</b>
            <ul>
              <li>Click or tap an arrow to fire it; hover to move the cursor.</li>
              <li>WASD / arrows move, Enter or Space fires.</li>
              <li>I hint · C cheats · P pause · R restart · H help.</li>
            </ul>
            <button class="am-btn" type="button" data-act="help-close">Got it</button>
          </div>
        </div>
      </div>
    </div>
    <div class="am-ov" data-ov="pause" hidden>
      <div class="am-card">
        <h3>Paused</h3>
        <p>The timer and the bot are stopped.</p>
        <button class="am-btn" type="button" data-act="resume">Resume <kbd>P</kbd></button>
      </div>
    </div>
  </section>
  <div class="am-pad" data-pad>
    <button type="button" data-act="pad-up" aria-label="Move up">&#8593;</button>
    <button type="button" data-act="pad-left" aria-label="Move left">&#8592;</button>
    <button type="button" class="am-fire" data-act="pad-fire" aria-label="Fire arrow">FIRE</button>
    <button type="button" data-act="pad-right" aria-label="Move right">&#8594;</button>
    <button type="button" data-act="pad-down" aria-label="Move down">&#8595;</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svg = $("[data-svg]");
    const cellsG = $("[data-cells]");
    const fxG = $("[data-fx]");
    const cursorEl = $("[data-cursor]");
    const hudEl = $("[data-hud]");
    const statusEl = $("[data-status]");
    const veilEl = $("[data-veil]");
    const cheatsEl = $("[data-cheats]");
    const hintBtn = $("[data-hintbtn]");
    const ovHelp = $('[data-ov="help"]'), ovPause = $('[data-ov="pause"]');
    const pauseBtn = $("[data-pause-btn]");

    let helpOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("arrowMazeHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("arrowMazeHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsEl.hidden = true;
        render();
    }
    function togglePause(on) {
        if (online && !room.isHost) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) {
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        } else maybeBot();
        render();
    }

    const rnd = rng((Math.random() * 1e9) | 0);
    const MARG = 2;
    let cursor = { x: 2, y: 2 };
    let lastFx = 0, fxSeq = 0;
    let botTimer = null, tickTimer = null, lastTick = Date.now();
    const fxTimeouts = new Set();
    const offs = [];

    /* ---------- seats & turns ---------- */
    function mySeat() {
        if (!online) return 0; // local: player 0, bot 1
        const hs = state && typeof state.hostSeat === "number" ? state.hostSeat : 0;
        return room.isHost ? hs : 1 - hs;
    }
    function labels() { return online ? ["P1", "P2"] : ["You", "Bot"]; }
    function byScore() {
        const [a, b] = state.scores;
        return a > b ? 0 : b > a ? 1 : -1;
    }

    /* ---------- state factory (host / local only) ---------- */
    function newBoard(level, scores, hostSeat, cheats) {
        const gen = genLevel(rnd, level);
        const cfg = LEVELS[level];
        return {
            level, W: gen.W, H: gen.H, grid: gen.grid,
            turn: rnd() < 0.5 ? 0 : 1,          // random first turn on every board
            hostSeat, scores,
            lives: [cfg.lives, cfg.lives],
            hints: 3, timeLeft: cfg.time,
            phase: "play", winner: null, reason: "",
            cheats, fx: null,
        };
    }
    function newMatch() {
        // random seat assignment for multiplayer: host may play as P1 or P2
        const hostSeat = online ? (rnd() < 0.5 ? 0 : 1) : 0;
        state = newBoard(0, [0, 0], hostSeat, { freeze: false, reveal: false, safe: false });
        lastTick = Date.now();
    }
    function setFx(kind, i, d, t) { state.fx = { id: ++fxSeq, kind, i, d, t: t || 0 }; }

    /* ---------- canonical reducer (host / local only) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || (actor !== 0 && actor !== 1)) return;
        const s = state;
        if (action.type === "fire") {
            if (s.phase !== "play" || actor !== s.turn) return;
            const i = action.i | 0;
            if (i < 0 || i >= s.grid.length) return;
            const a = s.grid[i];
            if (!a) return;
            const x = i % s.W, y = (i / s.W) | 0;
            if (removable(s.grid, s.W, s.H, i)) {
                if (a.t === 3 && a.hp === 2) {         // heavy: first hit only cracks it
                    a.hp = 1;
                    setFx("crack", i, a.d, a.t);
                    s.turn = 1 - actor;
                } else {
                    const [dx, dy] = DV[a.d];
                    s.grid[i] = null;
                    let gain = PTS[a.t];
                    if (a.t === 1) {                     // twin: also removes the cell behind
                        const bx = x - dx, by = y - dy;
                        if (bx >= 0 && bx < s.W && by >= 0 && by < s.H && s.grid[by * s.W + bx]) {
                            s.grid[by * s.W + bx] = null;
                            gain += 10;
                        }
                    } else if (a.t === 2) {              // blast: also removes 4 neighbours
                        for (const [ex, ey] of DV) {
                            const nx = x + ex, ny = y + ey;
                            if (nx >= 0 && nx < s.W && ny >= 0 && ny < s.H && s.grid[ny * s.W + nx]) {
                                s.grid[ny * s.W + nx] = null;
                                gain += 5;
                            }
                        }
                    }
                    s.scores[actor] += gain;
                    setFx("fly", i, a.d, a.t);
                    if (s.grid.every((v) => !v)) {
                        s.scores[actor] += 25;             // closer bonus
                        if (s.level >= LEVELS.length - 1) {
                            s.phase = "over"; s.winner = byScore(); s.reason = "done";
                        } else s.phase = "clear";
                    } else s.turn = 1 - actor;
                }
            } else {
                setFx("bad", i, a.d, a.t);
                if (!s.cheats.safe) {
                    s.scores[actor] = Math.max(0, s.scores[actor] - 5);
                    s.lives[actor] -= 1;
                    if (s.lives[actor] <= 0) {
                        s.phase = "over"; s.winner = 1 - actor; s.reason = "lives";
                    } else s.turn = 1 - actor;
                }                                      // safe cheat: no penalty, keep turn
            }
            publish();
        } else if (action.type === "hint") {
            if (s.phase !== "play" || s.hints <= 0) return;
            const h = bestMove(s.grid, s.W, s.H);
            if (h < 0) return;
            s.hints--;
            setFx("hint", h, s.grid[h].d, s.grid[h].t);
            publish();
        } else if (action.type === "next") {
            if (s.phase !== "clear") return;
            if (s.level + 1 >= LEVELS.length) {
                s.phase = "over"; s.winner = byScore(); s.reason = "done";
            } else {
                state = newBoard(s.level + 1, s.scores, s.hostSeat, s.cheats);
                lastTick = Date.now();
            }
            publish();
        } else if (action.type === "restart") {
            newMatch();
            publish();
        } else if (action.type === "cheat") {
            const k = action.key;
            if (k === "freeze" || k === "reveal" || k === "safe") s.cheats[k] = !s.cheats[k];
            else if (k === "time" && s.phase === "play") s.timeLeft = Math.min(999, s.timeLeft + 30);
            else if (k === "skip" && s.phase === "play") {
                if (s.level >= LEVELS.length - 1) {
                    s.phase = "over"; s.winner = byScore(); s.reason = "done";
                } else s.phase = "clear";
            } else return;
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    function publish() {
        render();
        // Only the host writes canonical state to Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        maybeBot();
    }

    /* ---------- bot (AI mode only) ---------- */
    function botPick() {
        if (Math.random() < 0.08) {                // occasional human-like mistake
            const all = [];
            for (let i = 0; i < state.grid.length; i++) if (state.grid[i]) all.push(i);
            return all.length ? all[(Math.random() * all.length) | 0] : -1;
        }
        return bestMove(state.grid, state.W, state.H);
    }
    function maybeBot() {
        if (online || paused || !state) return;
        if (state.phase !== "play" || state.turn !== 1 || botTimer) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (state && state.phase === "play" && state.turn === 1) {
                const i = botPick();
                if (i >= 0) applyAction({ type: "fire", i }, 1);
            }
        }, 600 + Math.random() * 700);
    }

    /* ---------- clock (host / local only, ~1 publish per second) ---------- */
    function startTick() {
        tickTimer = setInterval(() => {
            const now = Date.now();
            const dt = Math.min(1, (now - lastTick) / 1000);
            lastTick = now;
            if (!state || state.phase !== "play" || state.cheats.freeze || paused) return;
            const before = Math.ceil(state.timeLeft);
            state.timeLeft = Math.max(0, state.timeLeft - dt);
            if (state.timeLeft <= 0) {
                state.phase = "over"; state.winner = byScore(); state.reason = "time";
                publish();
            } else if (Math.ceil(state.timeLeft) !== before) publish();
        }, 200);
    }

    /* ---------- rendering ---------- */
    function cellSize() { return (100 - MARG * 2) / state.W; }
    function cellXY(i) {
        const c = cellSize();
        return [MARG + (i % state.W) * c, MARG + ((i / state.W) | 0) * c, c];
    }

    /* Base glyph points UP; rotate(d*90) matches DV exactly (0 up, 1 right, 2 down, 3 left). */
    function glyph(a, c) {
        const s = c * 0.34;
        const w = c * (a.t === 3 ? 0.19 : 0.115);
        const dash = a.t === 3 && a.hp === 1 ? ' stroke-dasharray="' + (c * 0.12).toFixed(2) + " " + (c * 0.1).toFixed(2) + '" opacity=".55"' : "";
        let g =
            '<line x1="0" y1="' + (s * (a.t === 2 ? 0.62 : 0.85)).toFixed(2) + '" x2="0" y2="' + (-s * 0.45).toFixed(2) +
            '" stroke="currentColor" stroke-width="' + w.toFixed(2) + '" stroke-linecap="round"' + dash + "/>" +
            '<path d="M' + (-s * 0.55).toFixed(2) + " " + (-s * 0.15).toFixed(2) + "L0 " + (-s * 0.85).toFixed(2) +
            "L" + (s * 0.55).toFixed(2) + " " + (-s * 0.15).toFixed(2) +
            '" fill="none" stroke="currentColor" stroke-width="' + w.toFixed(2) +
            '" stroke-linecap="round" stroke-linejoin="round"' + dash + "/>";
        if (a.t === 1)
            g += '<path d="M' + (-s * 0.55).toFixed(2) + " " + (s * 0.45).toFixed(2) + "L0 " + (-s * 0.25).toFixed(2) +
                "L" + (s * 0.55).toFixed(2) + " " + (s * 0.45).toFixed(2) +
                '" fill="none" stroke="currentColor" stroke-width="' + w.toFixed(2) +
                '" stroke-linecap="round" stroke-linejoin="round"/>';
        if (a.t === 2)
            g += '<circle cx="0" cy="' + (s * 0.92).toFixed(2) + '" r="' + (c * 0.085).toFixed(2) + '" fill="currentColor"/>';
        return g;
    }

    function arrowMarkup(i) {
        const a = state.grid[i];
        const [x, y, c] = cellXY(i);
        const open = state.cheats.reveal && removable(state.grid, state.W, state.H, i);
        return (
            '<g class="am-arrow' + (open ? " am-open" : "") + '" data-cell="' + i +
            '" transform="translate(' + (x + c / 2).toFixed(2) + " " + (y + c / 2).toFixed(2) + ')">' +
            '<g transform="rotate(' + a.d * 90 + ')">' + glyph(a, c) + "</g></g>"
        );
    }

    function setCursorRect() {
        if (!state) return;
        const c = cellSize();
        cursor.x = Math.max(0, Math.min(state.W - 1, cursor.x));
        cursor.y = Math.max(0, Math.min(state.H - 1, cursor.y));
        cursorEl.setAttribute("x", (MARG + cursor.x * c + 0.6).toFixed(2));
        cursorEl.setAttribute("y", (MARG + cursor.y * c + 0.6).toFixed(2));
        cursorEl.setAttribute("width", (c - 1.2).toFixed(2));
        cursorEl.setAttribute("height", (c - 1.2).toFixed(2));
    }

    function later(fn, ms) {
        const id = setTimeout(() => { fxTimeouts.delete(id); fn(); }, ms);
        fxTimeouts.add(id);
    }

    function spawnFx(fx) {
        if (!state || fx.i == null || fx.i >= state.W * state.H) return;
        const [x, y, c] = cellXY(fx.i);
        const NS = "http://www.w3.org/2000/svg";
        if (fx.kind === "fly") {
            const [dx, dy] = DV[fx.d];
            const outer = document.createElementNS(NS, "g");
            outer.setAttribute("transform", "translate(" + (x + c / 2).toFixed(2) + " " + (y + c / 2).toFixed(2) + ")");
            const flyer = document.createElementNS(NS, "g");
            flyer.setAttribute("class", "am-flyer");
            const rot = document.createElementNS(NS, "g");
            rot.setAttribute("transform", "rotate(" + fx.d * 90 + ")");
            rot.innerHTML = glyph({ t: fx.t, hp: 1 }, c);
            rot.setAttribute("color", "#111827");
            flyer.appendChild(rot);
            outer.appendChild(flyer);
            fxG.appendChild(outer);
            requestAnimationFrame(() => {
                flyer.style.transform = "translate(" + dx * 130 + "px," + dy * 130 + "px)";
                flyer.style.opacity = "0";
            });
            later(() => { if (outer.parentNode) outer.parentNode.removeChild(outer); }, 420);
        } else {
            const ring = document.createElementNS(NS, "rect");
            ring.setAttribute("class", "am-ring " + fx.kind);
            ring.setAttribute("x", (x + 0.7).toFixed(2));
            ring.setAttribute("y", (y + 0.7).toFixed(2));
            ring.setAttribute("width", (c - 1.4).toFixed(2));
            ring.setAttribute("height", (c - 1.4).toFixed(2));
            ring.setAttribute("rx", "2");
            fxG.appendChild(ring);
            later(() => { if (ring.parentNode) ring.parentNode.removeChild(ring); }, fx.kind === "hint" ? 1900 : 520);
        }
    }

    function veilHTML() {
        const L = labels();
        const sc = L[0] + " " + state.scores[0] + " &#8212; " + L[1] + " " + state.scores[1];
        if (state.phase === "clear") {
            return (
                '<div class="am-card"><h3>Board ' + (state.level + 1) + " cleared</h3><p>" + sc +
                '</p><button type="button" class="am-btn" data-act="next">Next board</button>' +
                '<button type="button" class="am-btn ghost" data-act="restart">Restart</button></div>'
            );
        }
        const title =
            state.winner === -1 ? "Draw" :
                state.winner === mySeat() ? "You win" :
                    online ? L[state.winner] + " wins" : "Bot wins";
        const why =
            state.reason === "time" ? "Time up. " :
                state.reason === "lives" ? "Out of lives. " : "All boards cleared. ";
        return (
            '<div class="am-card"><h3>' + title + "</h3><p>" + why + sc +
            '</p><button type="button" class="am-btn" data-act="restart">Rematch</button>' +
            '<button type="button" class="am-btn ghost" data-exit>Exit game</button></div>'
        );
    }

    function render() {
        if (helpOpen || paused) cheatsEl.hidden = true;
        ovHelp.hidden = !helpOpen;
        ovPause.hidden = !paused || helpOpen;
        if (pauseBtn) {
            pauseBtn.disabled = online && !room.isHost;
            const want = paused ? "play" : "pause";
            if (pauseBtn.dataset.iconState !== want) {
                pauseBtn.dataset.iconState = want;
                const ico = pauseBtn.querySelector("svg");
                if (ico) ico.outerHTML = iconSVG(want, { size: 14 });
                const label = pauseBtn.querySelector(".am-hlbl");
                if (label) label.textContent = paused ? "Resume" : "Pause";
            }
        }
        const restartBtn = $("[data-restart-btn]");
        if (restartBtn) restartBtn.disabled = online && !room.isHost;
        if (!state) {
            statusEl.textContent = online && !room.isHost ? "Waiting for host\u2026" : "Ready";
            cellsG.innerHTML = "";
            veilEl.hidden = true;
            return;
        }
        const s = state, L = labels(), me = mySeat();
        const left = s.grid.filter(Boolean).length;
        const t = Math.ceil(s.timeLeft);
        const cfg = LEVELS[s.level];

        let chips =
            '<span class="am-chip">Lv <b>' + (s.level + 1) + "/" + LEVELS.length + "</b></span>" +
            '<span class="am-chip">Arrows <b>' + left + "</b></span>" +
            '<span class="am-chip' + (t <= 10 && s.phase === "play" ? " warn" : "") + '">Time <b>' + t + "</b></span>";
        for (let seat = 0; seat < 2; seat++) {
            let dots = '<span class="am-dots">';
            for (let k = 0; k < cfg.lives; k++)
                dots += '<i class="am-dot' + (k < s.lives[seat] ? "" : " off") + '"></i>';
            dots += "</span>";
            const name = L[seat] + (online && seat === me ? " \u00b7 you" : "");
            chips +=
                '<span class="am-chip' + (s.phase === "play" && s.turn === seat ? " turn" : "") + '">' +
                name + " <b>" + s.scores[seat] + "</b>" + dots + "</span>";
        }
        if (s.cheats.freeze || s.cheats.reveal || s.cheats.safe)
            chips += '<span class="am-chip am-badge">Cheat on</span>';
        hudEl.innerHTML = chips;

        statusEl.textContent =
            s.phase === "play" ? (s.turn === me ? "Your turn" : online ? L[s.turn] + " is thinking\u2026" : "Bot is thinking\u2026") :
                s.phase === "clear" ? "Board cleared" :
                    s.winner === -1 ? "Draw" : s.winner === me ? "You win" : online ? L[s.winner] + " wins" : "Bot wins";

        const c = cellSize();
        let out = "";
        for (let i = 0; i < s.grid.length; i++) {
            const [x, y] = cellXY(i);
            out += '<rect class="am-cell" data-cell="' + i + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) +
                '" width="' + c.toFixed(2) + '" height="' + c.toFixed(2) + '" rx="1.6"/>';
        }
        for (let i = 0; i < s.grid.length; i++) if (s.grid[i]) out += arrowMarkup(i);
        cellsG.innerHTML = out;
        setCursorRect();

        veilEl.hidden = s.phase === "play" || helpOpen || paused;
        if (!veilEl.hidden) veilEl.innerHTML = veilHTML();

        const hintLabel = hintBtn.querySelector(".am-hlbl");
        if (hintLabel) hintLabel.textContent = "Hint \u00b7 " + s.hints;
        hintBtn.disabled = s.phase !== "play" || s.hints <= 0;
        cheatsEl.querySelectorAll("[data-key]").forEach((b) => {
            const on = Boolean(s.cheats[b.dataset.key]);
            b.textContent = on ? "ON" : "OFF";
            b.classList.toggle("on", on);
        });

        if (s.fx && s.fx.id !== lastFx) {
            lastFx = s.fx.id;
            spawnFx(s.fx);
        }
    }

    /* ---------- input ---------- */
    function cursorIndex() { return cursor.y * state.W + cursor.x; }
    function moveCursor(dx, dy) {
        if (!state) return;
        cursor.x = Math.max(0, Math.min(state.W - 1, cursor.x + dx));
        cursor.y = Math.max(0, Math.min(state.H - 1, cursor.y + dy));
        setCursorRect();
    }
    function fireAt(i) {
        if (!state || state.phase !== "play" || state.turn !== mySeat()) return;
        if (!state.grid[i]) return;
        submitAction({ type: "fire", i });
    }

    function handleClick(event) {
        if (event.target.closest && event.target.closest("[data-help]")) { toggleHelp(); return; }
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const actEl = event.target.closest("[data-act]");
        if (actEl) {
            const act = actEl.dataset.act;
            if (act === "pad-up") moveCursor(0, -1);
            else if (act === "pad-down") moveCursor(0, 1);
            else if (act === "pad-left") moveCursor(-1, 0);
            else if (act === "pad-right") moveCursor(1, 0);
            else if (act === "pad-fire") { if (state) fireAt(cursorIndex()); }
            else if (act === "hint") submitAction({ type: "hint" });
            else if (act === "restart") submitAction({ type: "restart" });
            else if (act === "next") submitAction({ type: "next" });
            else if (act === "cheat-open") { if (!helpOpen && !paused) cheatsEl.hidden = !cheatsEl.hidden; }
            else if (act === "cheat-close") cheatsEl.hidden = true;
            else if (act === "help-close") toggleHelp(false);
            else if (act === "pause") togglePause();
            else if (act === "resume") togglePause(false);
            else if (act === "cheat-toggle") submitAction({ type: "cheat", key: actEl.dataset.key });
            else if (act === "cheat-time") submitAction({ type: "cheat", key: "time" });
            else if (act === "cheat-skip") submitAction({ type: "cheat", key: "skip" });
            else if (act === "cheat-auto") {
                if (state && state.phase === "play" && state.turn === mySeat()) {
                    const i = bestMove(state.grid, state.W, state.H);
                    if (i >= 0) submitAction({ type: "fire", i });
                }
            }
            return;
        }
        const cellEl = event.target.closest("[data-cell]");
        if (cellEl && state) {
            const i = +cellEl.dataset.cell;
            cursor.x = i % state.W;
            cursor.y = (i / state.W) | 0;
            setCursorRect();
            fireAt(i);
        }
    }

    function handleHover(event) {
        if (!state || coarse) return;
        const el = event.target.closest("[data-cell]");
        if (!el) return;
        const i = +el.dataset.cell;
        const x = i % state.W, y = (i / state.W) | 0;
        if (x !== cursor.x || y !== cursor.y) {
            cursor.x = x; cursor.y = y;
            setCursorRect();
        }
    }

    function handleKey(event) {
        if (!root.isConnected) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = event.key;
        if (helpOpen) {
            if (k === "Escape" || k === "h" || k === "H" || k === "Enter" || k === " ") toggleHelp(false);
            event.preventDefault(); return;
        }
        if (paused) {
            if (k === "p" || k === "P" || k === "Escape" || k === "Enter" || k === " ") togglePause(false);
            event.preventDefault(); return;
        }
        let used = true;
        if (k === "ArrowUp" || k === "w" || k === "W") moveCursor(0, -1);
        else if (k === "ArrowDown" || k === "s" || k === "S") moveCursor(0, 1);
        else if (k === "ArrowLeft" || k === "a" || k === "A") moveCursor(-1, 0);
        else if (k === "ArrowRight" || k === "d" || k === "D") moveCursor(1, 0);
        else if (k === "Enter" || k === " ") {
            if (!state) used = false;
            else if (state.phase === "clear") submitAction({ type: "next" });
            else if (state.phase === "over") submitAction({ type: "restart" });
            else fireAt(cursorIndex());
        }
        else if (k === "h" || k === "H") toggleHelp();
        else if (k === "i" || k === "I") submitAction({ type: "hint" });
        else if (k === "p" || k === "P") togglePause();
        else if (k === "c" || k === "C") cheatsEl.hidden = !cheatsEl.hidden;
        else if (k === "r" || k === "R") submitAction({ type: "restart" });
        else if (k === "Escape") cheatsEl.hidden = true;
        else used = false;
        if (used) event.preventDefault();
    }

    root.addEventListener("click", handleClick);
    svg.addEventListener("pointermove", handleHover);
    document.addEventListener("keydown", handleKey);

    /* ---------- wiring ---------- */
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            newMatch();
            publish();
            startTick();
            offs.push(room.onAction((action) => {
                if (!action || ["fire", "hint", "next", "restart", "cheat"].indexOf(action.type) < 0) return;
                applyAction(action, 1 - state.hostSeat);   // guest always occupies the other seat
            }));
        } else {
            offs.push(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        newMatch();
        publish();
        startTick();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            svg.removeEventListener("pointermove", handleHover);
            document.removeEventListener("keydown", handleKey);
            if (tickTimer) clearInterval(tickTimer);
            if (botTimer) clearTimeout(botTimer);
            fxTimeouts.forEach((id) => clearTimeout(id));
            fxTimeouts.clear();
            offs.forEach((off) => { try { if (typeof off === "function") off(); } catch (e) { /* noop */ } });
        },
    };
}