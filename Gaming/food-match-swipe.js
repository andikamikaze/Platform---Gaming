/* ==== GAME: food-match-swipe.js ==== */
/*
  Template-compliant game module.
  1. META.id must match the file name (food-match-swipe.js).
  2. All game logic lives in mount(root, context).
  3. Regenerate manifest: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "food-match-swipe",
    name: "Food Match Swipe",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Minimal match-3 duel: swap adjacent treats, chain cascades and reach the goal first.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="16" height="16" rx="5"/><rect x="27" y="27" width="16" height="16" rx="5"/><circle cx="13" cy="13" r="3.5" fill="currentColor" stroke="none"/><circle cx="35" cy="35" r="3.5" fill="currentColor" stroke="none"/><path d="M27 14H11"/><path d="M16 9.5L11 14l5 4.5"/><path d="M21 34h16"/><path d="M32 29.5l5 4.5-5 4.5"/></svg>',
    bg: ["#ffedd5", "#fed7aa"],
    bestKey: "foodMatchSwipeBest",
};

/* ---------- constants ---------- */
const SIZE = 7;
const TYPES = 5;
const MOVES = 20;   /* moves per player */
const TARGET = 15;  /* goal treats to win */
const CELL = 64;    /* bigger cells = bigger play area */
const BOARD = SIZE * CELL;
const NS = "http://www.w3.org/2000/svg";

const FOODS = [
    { name: "Cherry", color: "#f87171", shape: "circle" },
    { name: "Lemon", color: "#facc15", shape: "diamond" },
    { name: "Grape", color: "#a78bfa", shape: "triangle" },
    { name: "Leaf", color: "#34d399", shape: "square" },
    { name: "Orange", color: "#fb923c", shape: "pentagon" },
];

/* ---------- pure logic ---------- */
/* Cells are either plain type numbers (simulation) or {t, id} tiles (play). */
function tv(v) {
    return v == null ? null : typeof v === "number" ? v : v.t;
}

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

function makeBoard(rnd) {
    let b = null;
    for (let attempt = 0; attempt < 12; attempt++) {
        b = [];
        for (let r = 0; r < SIZE; r++) {
            const row = [];
            for (let c = 0; c < SIZE; c++) {
                let t = 0, guard = 0;
                do {
                    t = Math.floor(rnd() * TYPES);
                    guard++;
                } while (
                    guard < 50 &&
                    ((c >= 2 && row[c - 1] === t && row[c - 2] === t) ||
                        (r >= 2 && b[r - 1][c] === t && b[r - 2][c] === t))
                );
                row.push(t);
            }
            b.push(row);
        }
        if (!findMatches(b).length && hasAnyMove(b)) return b;
    }
    return b;
}

/* matched cells (row-major keys), horizontal + vertical runs of 3+ */
function findMatches(b) {
    const set = new Set();
    for (let r = 0; r < SIZE; r++) {
        let run = 1;
        for (let c = 1; c <= SIZE; c++) {
            const cur = c < SIZE ? tv(b[r][c]) : null;
            const prev = tv(b[r][c - 1]);
            const same = c < SIZE && cur != null && cur === prev;
            if (same) run++;
            else {
                if (run >= 3 && prev != null) {
                    for (let k = c - run; k < c; k++) set.add(r * SIZE + k);
                }
                run = 1;
            }
        }
    }
    for (let c = 0; c < SIZE; c++) {
        let run = 1;
        for (let r = 1; r <= SIZE; r++) {
            const cur = r < SIZE ? tv(b[r][c]) : null;
            const prev = tv(b[r - 1][c]);
            const same = r < SIZE && cur != null && cur === prev;
            if (same) run++;
            else {
                if (run >= 3 && prev != null) {
                    for (let k = r - run; k < r; k++) set.add(k * SIZE + c);
                }
                run = 1;
            }
        }
    }
    return Array.from(set).sort((a, b2) => a - b2);
}

function swapped(b, r1, c1, r2, c2) {
    const nb = b.map((row) => row.slice());
    const t = nb[r1][c1];
    nb[r1][c1] = nb[r2][c2];
    nb[r2][c2] = t;
    return nb;
}

function hasAnyMove(b) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (c + 1 < SIZE && findMatches(swapped(b, r, c, r, c + 1)).length) return true;
            if (r + 1 < SIZE && findMatches(swapped(b, r, c, r + 1, c)).length) return true;
        }
    }
    return false;
}

function clearCells(b, cells) {
    const nb = b.map((row) => row.slice());
    cells.forEach((k) => {
        nb[Math.floor(k / SIZE)][k % SIZE] = null;
    });
    return nb;
}

/* gravity down + refill empty top slots via fillFn() */
function fallFill(b, fillFn) {
    const nb = b.map((row) => row.slice());
    for (let c = 0; c < SIZE; c++) {
        let w = SIZE - 1;
        for (let r = SIZE - 1; r >= 0; r--) {
            if (nb[r][c] != null) {
                nb[w][c] = nb[r][c];
                w--;
            }
        }
        for (; w >= 0; w--) nb[w][c] = fillFn();
    }
    return nb;
}

/* full resolution on a numeric grid (used by the solvability simulator) */
function resolveBoard(b, rnd) {
    let board = b.map((row) => row.slice());
    let cleared = 0, cascades = 0;
    const byType = new Array(TYPES).fill(0);
    for (let step = 0; step < 40; step++) {
        const m = findMatches(board);
        if (!m.length) break;
        cascades++;
        m.forEach((k) => {
            byType[tv(board[Math.floor(k / SIZE)][k % SIZE])]++;
        });
        board = clearCells(board, m);
        board = fallFill(board, () => Math.floor(rnd() * TYPES));
        cleared += m.length;
    }
    return { board, cleared, byType, cascades };
}

/* best adjacent swap for a goal type (goal-weighted, ties broken randomly) */
function bestMove(b, target, rnd = Math.random) {
    let best = -1;
    let picks = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const dirs = [[r, c + 1], [r + 1, c]];
            for (const [r2, c2] of dirs) {
                if (r2 >= SIZE || c2 >= SIZE) continue;
                const nb = swapped(b, r, c, r2, c2);
                const m = findMatches(nb);
                if (!m.length) continue;
                let goal = 0;
                m.forEach((k) => {
                    if (tv(nb[Math.floor(k / SIZE)][k % SIZE]) === target) goal++;
                });
                const sc = goal * 6 + m.length;
                if (sc > best) {
                    best = sc;
                    picks = [{ r1: r, c1: c, r2, c2 }];
                } else if (sc === best) {
                    picks.push({ r1: r, c1: c, r2, c2 });
                }
            }
        }
    }
    return picks.length ? picks[Math.floor(rnd() * picks.length)] : null;
}

/* greedy play-through: can this board reach TARGET within MOVES? */
function simulateGoal(grid, target, rnd) {
    let b = grid.map((row) => row.slice());
    let got = 0;
    for (let i = 0; i < MOVES; i++) {
        const mv = bestMove(b, target, rnd);
        if (!mv) break;
        const res = resolveBoard(swapped(b, mv.r1, mv.c1, mv.r2, mv.c2), rnd);
        got += res.byType[target];
        b = res.board;
        if (got >= TARGET) return got;
        if (!hasAnyMove(b)) break;
    }
    return got;
}

/* random level generator that verifies solvability before dealing */
function generateSolvableLevel(seed, target) {
    let best = null, bestGot = -1;
    for (let a = 0; a < 8; a++) {
        const rnd = rng((seed + a * 7919) >>> 0);
        const g = makeBoard(rnd);
        const got = simulateGoal(g, target, rng((seed ^ (0x9e3779b9 + a * 2654435761)) >>> 0));
        if (got > bestGot) {
            bestGot = got;
            best = g;
        }
        if (got >= TARGET) break;
    }
    return best;
}

export const _test = {
    SIZE, TYPES, MOVES, TARGET, FOODS,
    rng, makeBoard, findMatches, swapped, hasAnyMove,
    clearCells, fallFill, resolveBoard, bestMove, simulateGoal, generateSolvableLevel,
};

/* =============================================================
   MOUNT
============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;

    /* ---------- shell (minimal layout, no forced tutorial) ---------- */
    root.innerHTML = `
<style>
.fms{display:flex;flex-direction:column;gap:8px;outline:none;min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.fms [hidden]{display:none!important}
.fms *,.fms *::before,.fms *::after{box-sizing:border-box}
/* ---------- HUD: all match info lives here, board is arena only ---------- */
.fms-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.fms-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #ffffff1f;border-radius:999px;background:#ffffff08;color:#94a3b8;white-space:nowrap}
.fms-chip b{color:#e2e8f0;font-weight:700;font-variant-numeric:tabular-nums}
.fms-chip.good{color:#34d399;border-color:#34d39966}
.fms-chip.bad{color:#f87171;border-color:#f8717166}
.fms-pchip{--acc:#38bdf8;transition:border-color .2s,background .2s}
.fms-pchip[data-p="1"]{--acc:#f472b6}
.fms-pchip.fms-active{border-color:var(--acc);background:#ffffff12}
.fms-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
.fms-goal{display:inline-flex;align-items:center;gap:3px}
.fms-goal svg{display:block;width:13px;height:13px}
.fms-turn{font-size:8px;letter-spacing:.1em;color:var(--acc);border:1px solid var(--acc);border-radius:999px;padding:1px 5px;opacity:0}
.fms-active .fms-turn{opacity:1}
.fms-vs{color:#64748b;font-size:9px;letter-spacing:.1em}
.fms-spacer{flex:1 1 auto}
.fms-btn{border:1px solid #ffffff1f;background:#ffffff08;color:#cbd5e1;border-radius:9px;padding:6px 10px;min-height:30px;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.fms-btn:hover{background:#ffffff16}
.fms-btn:disabled{opacity:.4;cursor:not-allowed}
.fms-btn.primary{border-color:#38bdf8;background:#38bdf8;color:#0b1220}
.fms-btn.primary:hover{background:#7dd3fc}
.fms-icon-btn{display:inline-flex;align-items:center;gap:5px}
.fms-icon-btn svg{flex:none;display:block}
.fms-danger{border-color:#f8717166;color:#f87171}
/* ---------- fill-height board (SVG keeps its square ratio via preserveAspectRatio) ---------- */
.fms-board{position:relative;display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-height:0;padding:8px;background:#0b1220;border:1px solid #ffffff12;border-radius:16px;overflow:hidden}
.fms-svg{width:100%;height:100%;display:block;touch-action:none;user-select:none;-webkit-user-select:none}
.fms-svg [data-r]{cursor:pointer}
.fms-tile{transition:transform .3s cubic-bezier(.25,.8,.3,1.05);will-change:transform;pointer-events:none}
.fms-tin{transform-origin:0px 0px}
.fms-pop{animation:fmsPop .3s ease-out forwards}
@keyframes fmsPop{0%{transform:scale(1);opacity:1}55%{transform:scale(1.22);opacity:.9}100%{transform:scale(0);opacity:0}}
.fms-shake{animation:fmsShake .32s}
@keyframes fmsShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}50%{transform:translateX(4px)}75%{transform:translateX(-3px)}}
.fms-hint{animation:fmsPulse 1s ease-in-out infinite}
@keyframes fmsPulse{0%,100%{opacity:.25}50%{opacity:.9}}
/* ---------- touch pad is a sibling AFTER the board ---------- */
.fms-pad{display:none;grid-template-areas:". u ." "l o r" ". d .";gap:6px;margin-top:2px;justify-content:center}
.fms.pad-on .fms-pad{display:grid}
@media (pointer:coarse){.fms-pad{display:grid}}
.fms-padbtn{width:52px;height:44px;border-radius:12px;border:1px solid #ffffff1f;background:#ffffff08;color:#e2e8f0;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;padding:0}
.fms-padbtn:active{background:#ffffff18}
.fms-padbtn[data-pad="up"]{grid-area:u}
.fms-padbtn[data-pad="left"]{grid-area:l}
.fms-padbtn[data-pad="ok"]{grid-area:o;border-color:#38bdf8;color:#38bdf8}
.fms-padbtn[data-pad="right"]{grid-area:r}
.fms-padbtn[data-pad="down"]{grid-area:d}
/* ---------- overlays: help / cheats / pause / result ---------- */
.fms-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:12px;background:#0b1220d9;backdrop-filter:blur(3px);border-radius:inherit;animation:fmsFade .25s ease-out}
@keyframes fmsFade{from{opacity:0}to{opacity:1}}
.fms-card{display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;padding:18px;max-width:min(420px,100%);max-height:100%;overflow:hidden;border:1px solid #ffffff16;border-radius:14px;background:#0f172a}
.fms-head{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%}
.fms-card h3{margin:0;font-size:18px}
.fms-card p{margin:0;font-size:12.5px;color:#94a3b8}
.fms-cheats,.fms-help,.fms-stats{flex:1 1 auto;min-height:0;overflow:auto}
.fms-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.fms-help{font-size:12px;color:#94a3b8;line-height:1.5}
.fms-help ul{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:5px;text-align:left}
.fms-foot,.fms-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.fms-best{font-size:12px;color:#64748b}
.fms-note{font-size:10px;color:#64748b}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.fms :where(svg,canvas,img){max-width:100%}
.fms :where(button,[role="button"],select,input){touch-action:manipulation}
.fms :where(button,[role="button"],select,input):focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
.fms :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){flex-wrap:wrap;min-width:0;gap:8px}
.fms :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.fms :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.fms :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .fms :where([class*="stage"],[class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .fms :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){gap:8px}
}
@media (max-width:480px){
  .fms :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .fms :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .fms *,.fms *::before,.fms *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* --- fill height + mobile refinements LAST (beat pointer:coarse 44px) --- */
.fms .fms-hud .fms-btn{min-height:32px;padding:5px 9px;font-size:9px}
@media (max-width:640px){
  .fms.game-fill > .fms-board:not(:has(.fms-ov:not([hidden]))){aspect-ratio:1/1;flex:0 0 auto}
  .fms.game-fill > .fms-board:has(.fms-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .fms .fms-hud{gap:5px}
  .fms .fms-hud .fms-chip{padding:4px 6px;font-size:9px}
  .fms .fms-hud .fms-chip[data-hud="start"],.fms .fms-hud .fms-vs{display:none}
  .fms .fms-hud .fms-chip[data-hud="msg"]{max-width:130px;overflow:hidden;text-overflow:ellipsis}
  .fms .fms-hud .fms-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .fms .fms-hud .fms-btn-label,.fms .fms-hud .fms-spacer{display:none}
  .fms .fms-ov{padding:8px}
  .fms .fms-card{width:100%;height:100%;max-height:100%;padding:12px}
  .fms .fms-cheats,.fms .fms-help,.fms .fms-stats{scrollbar-width:none}
  .fms .fms-cheats::-webkit-scrollbar,.fms .fms-help::-webkit-scrollbar,.fms .fms-stats::-webkit-scrollbar{display:none}
  .fms .fms-note{display:none}
}
@media (max-width:480px){
  .fms .fms-hud{gap:4px}
  .fms .fms-hud .fms-vs,
  .fms .fms-hud .fms-chip[data-hud="goal"],
  .fms .fms-hud .fms-chip[data-hud="start"],
  .fms .fms-hud .fms-chip[data-hud="status"]{display:none}
  .fms .fms-hud .fms-pchip > span:not(.fms-goal):not(.fms-turn){display:none}
  .fms .fms-hud .fms-chip[data-hud="msg"]{max-width:100px}
  .fms .fms-hud .fms-btn{min-width:28px;padding:4px 6px;gap:3px}
}
</style>
<div class="game-app fms game-fill" data-fms>
  <div class="fms-hud">
    <span class="fms-chip fms-pchip" data-p="0">
      <i class="fms-dot"></i><b data-pname>P1</b>
      <span class="fms-goal"><span data-pgoal></span><b data-pcol>0</b>/${TARGET}</span>
      <span>MOV <b data-pmoves>${MOVES}</b></span>
      <span>PTS <b data-pscore>0</b></span>
      <span class="fms-turn">TURN</span>
    </span>
    <span class="fms-vs">VS</span>
    <span class="fms-chip fms-pchip" data-p="1">
      <i class="fms-dot"></i><b data-pname>P2</b>
      <span class="fms-goal"><span data-pgoal></span><b data-pcol>0</b>/${TARGET}</span>
      <span>MOV <b data-pmoves>${MOVES}</b></span>
      <span>PTS <b data-pscore>0</b></span>
      <span class="fms-turn">TURN</span>
    </span>
    <span class="fms-chip" data-hud="status">Ready</span>
    <span class="fms-chip fms-goal" data-hud="goal">GOAL <span data-hudgoal></span></span>
    <span class="fms-chip" data-hud="msg" hidden></span>
    <span class="fms-chip" data-hud="start">START —</span>
    <span class="fms-spacer"></span>
    <button class="fms-btn fms-icon-btn" type="button" data-act="pad" aria-label="Toggle D-pad" title="Toggle D-pad">${iconSVG("gamepad2", { size: 14 })}<span class="fms-btn-label">D-pad</span></button>
    <button class="fms-btn fms-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="fms-btn-label">Help</span></button>
    <button class="fms-btn fms-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="fms-btn-label">Cheats</span></button>
    <button class="fms-btn fms-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-ico="pause">${iconSVG("pause", { size: 14 })}</span><span data-ico="play" hidden>${iconSVG("play", { size: 14 })}</span><span class="fms-btn-label">Pause</span></button>
    <button class="fms-btn fms-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="fms-btn-label">Restart</span></button>
    <button class="fms-btn fms-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="fms-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel fms-board" data-board>
    <svg class="fms-svg" data-svg viewBox="0 0 ${BOARD} ${BOARD}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Food Match board">
      <g data-g="grid"></g>
      <g data-g="tiles"></g>
      <g data-g="marks"></g>
      <g data-g="hit"></g>
    </svg>
    <div class="fms-ov" data-ov="over" hidden>
      <div class="fms-card">
        <div class="fms-head"><h3 data-ovtitle>Game over</h3></div>
        <p data-ovreason></p>
        <p class="fms-best" data-ovbest></p>
        <div class="fms-foot">
          <button type="button" class="fms-btn" data-act="restart" data-again>Play again</button>
          <button type="button" class="fms-btn" data-exit>Exit game</button>
        </div>
        <p data-ovwait hidden>Waiting for the host to restart...</p>
      </div>
    </div>
    <div class="fms-ov" data-ov="cheat" hidden>
      <div class="fms-card">
        <div class="fms-head"><h3>Cheats</h3><button class="fms-btn" type="button" data-act="cheat-close">Close</button></div>
        <p>Offline only. Using cheats disables best-score saving.</p>
        <div class="fms-cheats">
          <button type="button" class="fms-btn" data-cheat="moves">+5 moves</button>
          <button type="button" class="fms-btn" data-cheat="goal">+5 goal</button>
          <button type="button" class="fms-btn" data-cheat="hint">Hint</button>
          <button type="button" class="fms-btn" data-cheat="shuffle">Reshuffle</button>
          <button type="button" class="fms-btn" data-cheat="skip">Skip bot turn</button>
          <button type="button" class="fms-btn" data-cheat="unlimited" data-unl>Unlimited moves: off</button>
          <button type="button" class="fms-btn fms-danger" data-cheat="win">Instant win</button>
        </div>
      </div>
    </div>
    <div class="fms-ov" data-ov="pause" hidden>
      <div class="fms-card">
        <div class="fms-head"><h3>Paused</h3></div>
        <p>Timers and the bot are frozen.</p>
        <div class="fms-foot">
          <button type="button" class="fms-btn" data-exit>Exit game</button>
          <button type="button" class="fms-btn primary" data-act="resume">Resume</button>
        </div>
      </div>
    </div>
    <div class="fms-ov" data-ov="help" hidden>
      <div class="fms-card">
        <div class="fms-head"><h3>How to play</h3><button class="fms-btn" type="button" data-help-close>Close</button></div>
        <div class="fms-help">
          <ul>
            <li>Swap two adjacent treats to line up 3 or more of a kind.</li>
            <li>Cleared goal treats fill your counter; cascades multiply score.</li>
            <li>Turns alternate. First to ${TARGET} goal treats wins; ${MOVES} moves each.</li>
            <li>Mouse: drag a treat, or click two neighbors. Keyboard: arrows move the cursor, Space selects, an arrow swaps, Esc cancels. Touch: swipe, tap-tap, or use the D-pad.</li>
            <li>Shortcuts: H help · C cheats · P pause · R restart.</li>
          </ul>
        </div>
        <div class="fms-foot"><span class="fms-note">Press H to reopen this guide</span><button type="button" class="fms-btn primary" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
  <div class="fms-pad" data-padwrap>
    <button type="button" class="fms-padbtn" data-pad="up" aria-label="Up"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg></button>
    <button type="button" class="fms-padbtn" data-pad="left" aria-label="Left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
    <button type="button" class="fms-padbtn" data-pad="ok" aria-label="Select or swap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg></button>
    <button type="button" class="fms-padbtn" data-pad="right" aria-label="Right"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
    <button type="button" class="fms-padbtn" data-pad="down" aria-label="Down"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg></button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const app = $("[data-fms]");
    const gridG = $('[data-g="grid"]');
    const tilesG = $('[data-g="tiles"]');
    const marksG = $('[data-g="marks"]');
    const hitG = $('[data-g="hit"]');
    const msgEl = $('[data-hud="msg"]');
    const statusEl = $('[data-hud="status"]');
    const flipEl = $('[data-hud="start"]');
    const goalEl = $('[data-hudgoal]');
    const pauseBtn = $("[data-pause]");
    const ov = {
        over: $('[data-ov="over"]'),
        cheat: $('[data-ov="cheat"]'),
        pause: $('[data-ov="pause"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTitle = $("[data-ovtitle]");
    const ovReason = $("[data-ovreason]");
    const ovBest = $("[data-ovbest]");
    const ovWait = $("[data-ovwait]");
    const againBtn = $("[data-again]");
    const cheatBtn = $("[data-cheats]");
    const restartBtn = $("[data-restart]");
    const unlBtn = $("[data-unl]");
    const pEls = [0, 1].map((i) => {
        const card = root.querySelector('.fms-pchip[data-p="' + i + '"]');
        return {
            card,
            name: card.querySelector("[data-pname]"),
            goal: card.querySelector("[data-pgoal]"),
            col: card.querySelector("[data-pcol]"),
            moves: card.querySelector("[data-pmoves]"),
            score: card.querySelector("[data-pscore]"),
        };
    });

    /* ---------- local (per-client) UI state ---------- */
    let destroyed = false;
    let sel = null;                 /* selected cell {r,c} */
    let cursor = { r: 3, c: 3 };    /* keyboard / hover cursor */
    let drag = null;                /* pointer drag tracker */
    let hint = null;                /* [[r,c],[r,c]] cheat hint */
    const tileEls = new Map();      /* tileKey -> {el, r, c, t} */
    let lastReject = 0;
    let lastTarget = -1;
    let timers = [];                /* pausable setTimeout records */
    const unsubs = [];
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* ignore */ }

    /* Overlays: help > cheats > pause. While any is open the game clock is frozen. */
    let cheatsOpen = false;
    let helpOpen = false;
    let paused = false;
    let frozen = false;
    let freezeAt = 0;
    let timeShift = 0;              /* accumulated pause: anchor never jumps on resume */
    let dateAnchor = Date.now();
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("foodMatchSwipeHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("foodMatchSwipeHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const perfNow = () => performance.now();
    /* performance.now() and Date.now() anchors both shift by the paused duration. */
    const gameNow = () => frozen ? freezeAt - timeShift : perfNow() - timeShift;
    const blocked = () => helpOpen || cheatsOpen || paused;

    function armTimer(rec) {
        rec.tm = setTimeout(() => {
            timers = timers.filter((x) => x !== rec);
            rec.tm = null;
            if (!destroyed && !frozen && !paused) rec.fn();
        }, Math.max(0, rec.due - gameNow()));
    }
    const later = (fn, ms) => {
        const rec = { fn, due: gameNow() + ms, tm: null };
        timers.push(rec);
        if (!frozen) armTimer(rec);
        return rec;
    };
    const clearTimers = () => {
        timers.forEach((r) => { if (r.tm) clearTimeout(r.tm); });
        timers = [];
    };
    /* Freeze on overlay open; on resume shift both the performance and Date anchors. */
    function syncFreeze() {
        const shouldFreeze = blocked();
        if (shouldFreeze === frozen) return;
        if (shouldFreeze) {
            freezeAt = perfNow();
            timers.forEach((r) => { if (r.tm) { clearTimeout(r.tm); r.tm = null; } });
            frozen = true;
        } else {
            frozen = false;
            const held = perfNow() - freezeAt;
            if (held > 0) { timeShift += held; dateAnchor += held; }
            timers.forEach((r) => { if (!r.tm) armTimer(r); });
            /* First-run help can open before the bot was ever queued. */
            if (state && !online && state.phase === "playing" && state.turn === 1 &&
                !timers.some((r) => r.fn === botPlay)) scheduleBot();
        }
    }
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* seat mapping: connection index -> board seat (randomized in multiplayer) */
    const seatOf = (actor) => (state && state.seatFlip ? 1 - actor : actor);
    const mySeat = () => seatOf(playerIndex);
    const canAct = () => !!state && state.phase === "playing" && state.turn === mySeat() && !blocked();

    /* ---------- shapes (centered at 0,0) ---------- */
    function shapeSvg(t, cx, cy) {
        const f = FOODS[t];
        const col = f.color;
        const stroke = 'stroke="#0b102077" stroke-width="2"';
        if (f.shape === "circle") {
            return `<circle cx="${cx}" cy="${cy}" r="14" fill="${col}" ${stroke}/>`;
        }
        if (f.shape === "diamond") {
            return `<polygon points="${cx},${cy - 16} ${cx + 16},${cy} ${cx},${cy + 16} ${cx - 16},${cy}" fill="${col}" ${stroke} stroke-linejoin="round"/>`;
        }
        if (f.shape === "triangle") {
            return `<polygon points="${cx},${cy - 16} ${cx + 16},${cy + 13} ${cx - 16},${cy + 13}" fill="${col}" ${stroke} stroke-linejoin="round"/>`;
        }
        if (f.shape === "square") {
            return `<rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" rx="6" fill="${col}" ${stroke}/>`;
        }
        const pts = [[0, -16], [15.2, -4.9], [9.4, 12.9], [-9.4, 12.9], [-15.2, -4.9]]
            .map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`)
            .join(" ");
        return `<polygon points="${pts}" fill="${col}" ${stroke} stroke-linejoin="round"/>`;
    }

    function tileInner(t) {
        const col = FOODS[t].color;
        return `<rect x="-28" y="-28" width="56" height="56" rx="14" fill="${col}" fill-opacity="0.13" stroke="${col}" stroke-opacity="0.45" stroke-width="1.5"/>` + shapeSvg(t, 0, 0);
    }

    function miniGoalSvg(t) {
        return `<svg viewBox="-20 -20 40 40" width="14" height="14" aria-hidden="true">${shapeSvg(t, 0, 0)}</svg>`;
    }

    function tileKey(id) {
        return state.gid + ":" + id;
    }

    /* ---------- rendering with fall / destroy animations ---------- */
    function createTileEl(t, x, y) {
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "fms-tile");
        g.style.transform = `translate(${x}px,${y}px)`;
        g.innerHTML = `<g class="fms-tin">${tileInner(t)}</g>`;
        return g;
    }

    function reconcileTiles() {
        const present = new Map();
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const cell = state.board[r][c];
                if (cell) present.set(tileKey(cell.id), { r, c, t: cell.t });
            }
        }
        /* destroy: pop + fade, then remove */
        for (const [key, rec] of tileEls) {
            const p = present.get(key);
            if (!p || p.t !== rec.t) {
                tileEls.delete(key);
                const inner = rec.el.querySelector(".fms-tin");
                if (inner) inner.classList.add("fms-pop");
                const el = rec.el;
                later(() => el.remove(), 320);
            }
        }
        /* move existing, collect fresh */
        const fresh = [];
        const newPerCol = new Array(SIZE).fill(0);
        for (const [key, p] of present) {
            const rec = tileEls.get(key);
            const x = p.c * CELL + CELL / 2;
            const y = p.r * CELL + CELL / 2;
            if (rec) {
                if (rec.r !== p.r || rec.c !== p.c) {
                    rec.el.style.transform = `translate(${x}px,${y}px)`;
                    rec.r = p.r;
                    rec.c = p.c;
                }
            } else {
                fresh.push({ key, p, x, y });
                newPerCol[p.c]++;
            }
        }
        /* spawn above the board, stacked in order, then fall in */
        for (const f of fresh) {
            const sy = (f.p.r - newPerCol[f.p.c]) * CELL + CELL / 2;
            const el = createTileEl(f.p.t, f.x, sy);
            tilesG.appendChild(el);
            tileEls.set(f.key, { el, r: f.p.r, c: f.p.c, t: f.p.t });
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!destroyed) el.style.transform = `translate(${f.x}px,${f.y}px)`;
            }));
        }
    }

    function renderMarks() {
        let s = "";
        if (hint) {
            for (const [r, c] of hint) {
                s += `<rect class="fms-hint" x="${c * CELL + 2}" y="${r * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="13" fill="none" stroke="#facc15" stroke-width="3"/>`;
            }
        }
        if (sel) {
            s += `<rect x="${sel.c * CELL + 2}" y="${sel.r * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="13" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="7 5"/>`;
        }
        s += `<rect x="${cursor.c * CELL + 4}" y="${cursor.r * CELL + 4}" width="${CELL - 8}" height="${CELL - 8}" rx="11" fill="none" stroke="#ffffff4d" stroke-width="1.5"/>`;
        marksG.innerHTML = s;
    }

    function shakeCells(cells) {
        cells.forEach(([r, c]) => {
            const cell = state.board[r] && state.board[r][c];
            const rec = cell && tileEls.get(tileKey(cell.id));
            if (!rec) return;
            const inner = rec.el.querySelector(".fms-tin");
            if (!inner) return;
            inner.classList.remove("fms-shake");
            void inner.getBoundingClientRect();
            inner.classList.add("fms-shake");
            later(() => inner.classList.remove("fms-shake"), 360);
        });
    }

    function renderHud() {
        if (state.target !== lastTarget) {
            lastTarget = state.target;
            pEls.forEach((p) => { p.goal.innerHTML = miniGoalSvg(state.target); });
            goalEl.innerHTML = miniGoalSvg(state.target);
        }
        for (let s = 0; s < 2; s++) {
            const p = state.players[s];
            const els = pEls[s];
            els.name.textContent = p.name + (s === mySeat() ? " (you)" : "");
            els.col.textContent = p.collected;
            els.moves.textContent = !online && state.unlimited && s === 0 ? "\u221e" : p.moves;
            els.score.textContent = p.score;
            els.card.classList.toggle("fms-active", state.phase !== "over" && state.turn === s);
        }
        let status = "Ready";
        if (state.phase === "over") {
            status = state.winner === "draw" ? "Draw" : state.winner === mySeat() ? "You win" : "Game over";
        } else if (state.phase === "resolving") {
            status = "Resolving...";
        } else if (paused) {
            status = "Paused";
        } else {
            status = canAct() ? "Your turn" : online ? state.players[state.turn].name + " to move" : "Bot thinking...";
        }
        statusEl.textContent = status;
        const msgText = (state.msg && state.msg.text) || "";
        msgEl.textContent = msgText;
        msgEl.hidden = !msgText;
        msgEl.className = "fms-chip" + (state.msg && state.msg.mood ? " " + state.msg.mood : "");
        flipEl.textContent = online
            ? "You are Player " + (mySeat() + 1) + " \u00b7 Player " + (state.startPlayer + 1) + " starts"
            : state.startPlayer === 0 ? "Coin flip: you start" : "Coin flip: Bot starts";
        if (state.reject && state.reject.n !== lastReject) {
            lastReject = state.reject.n;
            shakeCells(state.reject.cells);
        }
        cheatBtn.hidden = online;
        restartBtn.hidden = online && !room.isHost;
        againBtn.hidden = online && !room.isHost;
        ovWait.hidden = !(online && !room.isHost);
        unlBtn.textContent = "Unlimited moves: " + (state.unlimited ? "on" : "off");
        pauseBtn.disabled = online;
        pauseBtn.title = online ? "Pause unavailable online" : "Pause (P)";
        const label = pauseBtn.querySelector(".fms-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        const pauseIco = pauseBtn.querySelector('[data-ico="pause"]');
        const playIco = pauseBtn.querySelector('[data-ico="play"]');
        if (pauseIco) pauseIco.hidden = paused;
        if (playIco) playIco.hidden = !paused;
        /* Overlays suppress one another: help > cheats > pause > result. */
        ov.help.hidden = !helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.over.hidden = state.phase !== "over" || cheatsOpen || helpOpen || paused;
    }

    function renderOver() {
        if (state.phase !== "over") return;
        const w = state.winner;
        ovTitle.textContent = w === "draw" ? "Draw game" : w === mySeat() ? "You win!" : online ? state.players[w].name + " wins" : "Bot wins";
        ovTitle.style.color = w === "draw" ? "#e2e8f0" : w === mySeat() ? "#34d399" : "#f87171";
        const a = state.players[0], b = state.players[1];
        ovReason.textContent = a.name + " " + a.collected + "/" + TARGET + " (" + a.score + " pts) \u00b7 " + b.name + " " + b.collected + "/" + TARGET + " (" + b.score + " pts)";
        ovBest.textContent = online ? "" : "Best score: " + best + (state.cheated ? " \u00b7 cheats used" : "");
    }

    function render() {
        syncFreeze();
        if (!state) {
            statusEl.textContent = "Waiting for host...";
            return;
        }
        reconcileTiles();
        renderMarks();
        renderHud();
        renderOver();
    }

    function publish() {
        render();
        /* Only the host writes canonical state. */
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- game setup ---------- */
    function connName(conn) {
        if (conn === 0) {
            if (!online) return playerName || "You";
            return room.isHost ? playerName || "Host" : (roomData && (roomData.hostName || (roomData.players && roomData.players[0] && roomData.players[0].name))) || "Host";
        }
        if (!online) return "Bot";
        return (roomData && (roomData.guestName || (roomData.players && roomData.players[1] && roomData.players[1].name))) || "Player 2";
    }

    function newGame() {
        clearTimers();
        sel = null;
        hint = null;
        drag = null;
        lastReject = 0;
        const seed = (Math.random() * 0x7fffffff) | 0;
        const target = Math.floor(Math.random() * TYPES);
        const grid = generateSolvableLevel(seed, target);
        let nid = 1;
        const board = grid.map((row) => row.map((t) => ({ t, id: nid++ })));
        const flip = online ? Math.random() < 0.5 : false; /* random seat assignment (multiplayer) */
        const start = Math.random() < 0.5 ? 0 : 1;         /* random first turn (bot + multiplayer) */
        const sOf = (a) => (flip ? 1 - a : a);
        const players = [null, null];
        players[sOf(0)] = { name: connName(0), collected: 0, score: 0, moves: MOVES };
        players[sOf(1)] = { name: connName(1), collected: 0, score: 0, moves: MOVES };
        state = {
            v: 1,
            gid: Math.random().toString(36).slice(2, 9),
            seed,
            board,
            nextId: nid,
            target,
            players,
            turn: start,
            startPlayer: start,
            seatFlip: flip,
            phase: "playing",
            winner: null,
            cascade: 0,
            unlimited: false,
            cheated: false,
            reject: null,
            msg: { text: "Player " + (start + 1) + " moves first", mood: "" },
        };
        publish();
        scheduleBot();
    }

    /* ---------- swap + animated cascade resolution (host / offline) ---------- */
    function resolveStep() {
        if (!state || state.phase !== "resolving") return;
        const m = findMatches(state.board);
        if (!m.length) {
            finishResolve();
            return;
        }
        state.cascade++;
        let inc = 0;
        m.forEach((k) => {
            if (tv(state.board[Math.floor(k / SIZE)][k % SIZE]) === state.target) inc++;
        });
        const p = state.players[state.turn];
        p.collected += inc;
        p.score += m.length * 10 * state.cascade;
        state.board = clearCells(state.board, m);
        state.msg = state.cascade > 1
            ? { text: "Combo x" + state.cascade + " \u00b7 " + m.length + " cleared", mood: "good" }
            : { text: m.length + " cleared" + (inc ? " \u00b7 " + inc + " goal" : ""), mood: "" };
        publish(); /* clear phase -> pop animation on every client */
        later(() => {
            state.board = fallFill(state.board, () => ({
                t: Math.floor(Math.random() * TYPES),
                id: state.nextId++,
            }));
            publish(); /* fall phase -> gravity + spawn animation */
            later(resolveStep, 330);
        }, 300);
    }

    function finishResolve() {
        const p = state.players[state.turn];
        if (p.collected >= TARGET) {
            over(state.turn);
            return;
        }
        const other = 1 - state.turn;
        if (p.moves <= 0 && state.players[other].moves <= 0) {
            const a = state.players[0], b = state.players[1];
            let w = "draw";
            if (a.collected !== b.collected) w = a.collected > b.collected ? 0 : 1;
            else if (a.score !== b.score) w = a.score > b.score ? 0 : 1;
            over(w);
            return;
        }
        if (state.players[other].moves > 0) state.turn = other;
        if (!hasAnyMove(state.board)) doReshuffle();
        state.phase = "playing";
        if (!state.msg || state.msg.mood !== "good") {
            state.msg = { text: state.players[state.turn].name + " to move", mood: "" };
        }
        publish();
        scheduleBot();
    }

    function over(w) {
        state.phase = "over";
        state.winner = w;
        state.msg = {
            text: w === "draw" ? "Draw game" : "Player " + (w + 1) + " wins",
            mood: w === mySeat() ? "good" : "bad",
        };
        if (!online && !state.cheated) {
            const sc = state.players[mySeat()].score;
            if (sc > best) {
                best = sc;
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ }
            }
        }
        publish();
    }

    function doReshuffle() {
        const flat = [];
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) flat.push(state.board[r][c]);
        }
        for (let tries = 0; tries < 60; tries++) {
            for (let i = flat.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = flat[i];
                flat[i] = flat[j];
                flat[j] = t;
            }
            const nb = [];
            for (let r = 0; r < SIZE; r++) nb.push(flat.slice(r * SIZE, r * SIZE + SIZE));
            if (!findMatches(nb).length && hasAnyMove(nb)) {
                state.board = nb;
                state.msg = { text: "No moves \u00b7 treats reshuffled", mood: "good" };
                return;
            }
        }
        const grid = generateSolvableLevel((Math.random() * 0x7fffffff) | 0, state.target);
        state.board = grid.map((row) => row.map((t) => ({ t, id: state.nextId++ })));
        state.msg = { text: "No moves \u00b7 fresh board dealt", mood: "good" };
    }

    /* ---------- bot ---------- */
    function scheduleBot() {
        if (online || destroyed || blocked()) return;
        if (state && state.phase === "playing" && state.turn === 1) {
            later(botPlay, 700 + Math.random() * 600);
        }
    }

    function botPlay() {
        if (destroyed || blocked() || !state || state.phase !== "playing" || state.turn !== 1) return;
        const mv = bestMove(state.board, state.target);
        if (mv) {
            applyAction({ type: "swap", r1: mv.r1, c1: mv.c1, r2: mv.r2, c2: mv.c2 }, 1);
        } else {
            doReshuffle();
            publish();
            scheduleBot();
        }
    }

    /* ---------- cheats (offline only) ---------- */
    function applyCheat(kind) {
        if (online || !state || state.phase === "over") return;
        const me = state.players[0];
        state.cheated = true;
        switch (kind) {
            case "moves":
                me.moves += 5;
                state.msg = { text: "Cheat: +5 moves", mood: "good" };
                break;
            case "goal":
                if (state.phase !== "playing") return;
                me.collected += 5;
                if (me.collected >= TARGET) { over(0); return; }
                state.msg = { text: "Cheat: +5 goal treats", mood: "good" };
                break;
            case "hint": {
                const mv = bestMove(state.board, state.target);
                if (mv) {
                    hint = [[mv.r1, mv.c1], [mv.r2, mv.c2]];
                    later(() => { hint = null; renderMarks(); }, 2600);
                }
                break;
            }
            case "shuffle":
                doReshuffle();
                break;
            case "skip":
                if (state.phase === "playing" && state.turn === 1) {
                    state.turn = 0;
                    state.msg = { text: "Cheat: bot turn skipped", mood: "good" };
                }
                break;
            case "unlimited":
                state.unlimited = !state.unlimited;
                state.msg = { text: "Cheat: unlimited moves " + (state.unlimited ? "on" : "off"), mood: "good" };
                break;
            case "win":
                if (state.phase !== "playing") return;
                me.collected = Math.max(me.collected, TARGET);
                over(0);
                return;
            default:
                return;
        }
        publish();
    }

    /* ---------- actions ---------- */
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action !== "object") return;
        const seat = seatOf(actor);
        if (action.type === "swap") {
            if (state.phase !== "playing" || seat !== state.turn) return;
            const r1 = action.r1, c1 = action.c1, r2 = action.r2, c2 = action.c2;
            if (![r1, c1, r2, c2].every((v) => Number.isInteger(v) && v >= 0 && v < SIZE)) return;
            if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
            if (!state.board[r1][c1] || !state.board[r2][c2]) return;
            const nb = swapped(state.board, r1, c1, r2, c2);
            if (!findMatches(nb).length) {
                state.reject = { cells: [[r1, c1], [r2, c2]], n: ((state.reject && state.reject.n) || 0) + 1 };
                state.msg = { text: "That swap makes no match", mood: "bad" };
                publish();
                return;
            }
            const skipDec = !online && state.unlimited && seat === 0;
            if (!skipDec) state.players[seat].moves = Math.max(0, state.players[seat].moves - 1);
            state.board = nb;
            state.phase = "resolving";
            state.cascade = 0;
            state.msg = { text: "Matching...", mood: "" };
            publish();
            later(resolveStep, 230);
        } else if (action.type === "cheat") {
            if (!online && actor === 0) applyCheat(action.kind);
        } else if (action.type === "restart") {
            if (online && actor !== 0) return; /* host controls restarts */
            newGame();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- input helpers ---------- */
    function flashLocal(text) {
        msgEl.textContent = text;
        msgEl.hidden = false;
        msgEl.className = "fms-chip bad";
    }

    function trySwapLocal(r1, c1, r2, c2) {
        if (blocked() || !state || state.phase !== "playing") return;
        if (r2 < 0 || c2 < 0 || r2 >= SIZE || c2 >= SIZE) return;
        if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
        if (!canAct()) {
            flashLocal("Wait for your turn");
            return;
        }
        sel = null;
        hint = null;
        submitAction({ type: "swap", r1, c1, r2, c2 });
        renderMarks();
    }

    function moveCursor(dr, dc) {
        cursor = { r: clamp(cursor.r + dr, 0, SIZE - 1), c: clamp(cursor.c + dc, 0, SIZE - 1) };
        renderMarks();
    }

    function padDir(dr, dc) {
        if (sel) {
            const s = sel;
            sel = null;
            trySwapLocal(s.r, s.c, s.r + dr, s.c + dc);
            renderMarks();
        } else {
            moveCursor(dr, dc);
        }
    }

    function padOk() {
        if (sel && sel.r === cursor.r && sel.c === cursor.c) {
            sel = null;
        } else if (sel && Math.abs(sel.r - cursor.r) + Math.abs(sel.c - cursor.c) === 1) {
            const s = sel;
            sel = null;
            trySwapLocal(s.r, s.c, cursor.r, cursor.c);
        } else {
            sel = { r: cursor.r, c: cursor.c };
        }
        renderMarks();
    }

    /* ---------- overlay controls ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) { helpOpen = false; paused = false; }
        render();
    }
    function setPause(on) {
        if (online) return;
        paused = Boolean(on);
        if (paused) { helpOpen = false; cheatsOpen = false; }
        render();
    }
    function closeTopOverlay() {
        if (helpOpen) { toggleHelp(false); return true; }
        if (cheatsOpen) { toggleCheats(false); return true; }
        if (paused) { setPause(false); return true; }
        return false;
    }
    function restartGame() {
        if (online && !room.isHost) return;
        helpOpen = false;
        cheatsOpen = false;
        paused = false;
        render();              /* resume the clock before clearing timers */
        submitAction({ type: "restart" });
    }

    /* ---------- keyboard: help → cheats → pause → Escape → game actions ---------- */
    function handleKey(e) {
        if (!state || destroyed) return;
        const k = e.code;
        const key = e.key;
        if (e.repeat && (k === "KeyH" || k === "KeyC" || k === "KeyP" || k === "KeyR" || k === "Space" || k === "Enter" || key === "Escape")) return;
        if ((k === "Space" || k === "Enter") && e.target.closest && e.target.closest("button")) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (k === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (k === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (k === "KeyP") { if (!helpOpen && !cheatsOpen) setPause(!paused); e.preventDefault(); return; }
        if (key === "Escape") {
            if (!closeTopOverlay()) { sel = null; renderMarks(); }
            e.preventDefault(); return;
        }
        if (k === "KeyR") {
            if (blocked()) closeTopOverlay(); else restartGame();
            e.preventDefault(); return;
        }
        if (blocked()) {
            if (k === "Space" || k === "Enter") { closeTopOverlay(); e.preventDefault(); }
            return;
        }
        let handled = true;
        if (k === "ArrowUp") padDir(-1, 0);
        else if (k === "ArrowDown") padDir(1, 0);
        else if (k === "ArrowLeft") padDir(0, -1);
        else if (k === "ArrowRight") padDir(0, 1);
        else if (k === "Space" || k === "Enter") padOk();
        else handled = false;
        if (handled) e.preventDefault();
    }

    /* ---------- mouse / touch (drag + tap-tap) ---------- */
    function cellFromEvent(e) {
        const t = e.target;
        if (!t || !t.dataset || t.dataset.r === undefined) return null;
        return { r: Number(t.dataset.r), c: Number(t.dataset.c) };
    }

    function onPointerDown(e) {
        if (blocked() || !state) return;
        const cell = cellFromEvent(e);
        if (!cell) return;
        e.preventDefault();
        if (hitG.setPointerCapture) {
            try { hitG.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        drag = { x: e.clientX, y: e.clientY, r: cell.r, c: cell.c, moved: false };
        cursor = { r: cell.r, c: cell.c };
        renderMarks();
    }

    function onPointerMove(e) {
        if (blocked()) return;
        if (drag && !drag.moved) {
            const dx = e.clientX - drag.x;
            const dy = e.clientY - drag.y;
            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
            drag.moved = true;
            let dr = 0, dc = 0;
            if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
            else dr = dy > 0 ? 1 : -1;
            trySwapLocal(drag.r, drag.c, drag.r + dr, drag.c + dc);
        } else if (!drag) {
            const cell = cellFromEvent(e);
            if (cell && (cursor.r !== cell.r || cursor.c !== cell.c)) {
                cursor = cell;
                renderMarks();
            }
        }
    }

    function onPointerUp() {
        if (!drag) return;
        if (blocked()) { drag = null; return; }
        const wasDrag = drag.moved;
        const start = { r: drag.r, c: drag.c };
        drag = null;
        if (wasDrag || !state) return;
        if (sel && sel.r === start.r && sel.c === start.c) {
            sel = null;
        } else if (sel && Math.abs(sel.r - start.r) + Math.abs(sel.c - start.c) === 1) {
            const s = sel;
            sel = null;
            trySwapLocal(s.r, s.c, start.r, start.c);
        } else {
            sel = { r: start.r, c: start.c };
        }
        renderMarks();
    }

    function onPointerCancel() {
        drag = null;
    }

    /* ---------- clicks (HUD, D-pad, overlays, cheats) ---------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest('[data-act="cheat-close"]')) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { setPause(!paused); return; }
        if (t.closest('[data-act="resume"]')) { setPause(false); return; }
        const pad = t.closest("[data-pad]");
        if (pad) {
            if (!blocked()) {
                const d = pad.dataset.pad;
                if (d === "up") padDir(-1, 0);
                else if (d === "down") padDir(1, 0);
                else if (d === "left") padDir(0, -1);
                else if (d === "right") padDir(0, 1);
                else if (d === "ok") padOk();
            }
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) { applyCheat(ch.dataset.cheat); return; }
        if (t.closest('[data-act="pad"]')) { app.classList.toggle("pad-on"); return; }
        if (t.closest('[data-act="restart"]')) { restartGame(); }
    }

    function focusRoot() {
        if (root.focus) root.focus({ preventScroll: true });
    }

    /* ---------- static layers ---------- */
    {
        let grid = "", hit = "";
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                grid += `<rect x="${c * CELL + 3}" y="${r * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="12" fill="#ffffff05" stroke="#ffffff09"/>`;
                hit += `<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="transparent" data-r="${r}" data-c="${c}"/>`;
            }
        }
        gridG.innerHTML = grid;
        hitG.innerHTML = hit;
    }

    root.setAttribute("tabindex", "0");
    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", handleKey);
    root.addEventListener("pointerdown", focusRoot);
    hitG.addEventListener("pointerdown", onPointerDown);
    hitG.addEventListener("pointermove", onPointerMove);
    hitG.addEventListener("pointerup", onPointerUp);
    hitG.addEventListener("pointercancel", onPointerCancel);
    focusRoot();

    /* ---------- wire up mode ---------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => {
            roomData = nextRoom;
            if (room.isHost && state) {
                const guest = connName(1);
                const seat = seatOf(1);
                if (guest !== "Player 2" && state.players[seat].name === "Player 2") {
                    state.players[seat].name = guest;
                    publish();
                    return;
                }
            }
            render();
        });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            newGame();
            const offAction = room.onAction((action) => applyAction(action, 1));
            if (typeof offAction === "function") unsubs.push(offAction);
        } else {
            const offState = room.onState((nextState) => {
                if (!state && nextState && nextState.reject) lastReject = nextState.reject.n;
                state = nextState;
                render();
            });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        newGame();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("keydown", handleKey);
            root.removeEventListener("pointerdown", focusRoot);
            hitG.removeEventListener("pointerdown", onPointerDown);
            hitG.removeEventListener("pointermove", onPointerMove);
            hitG.removeEventListener("pointerup", onPointerUp);
            hitG.removeEventListener("pointercancel", onPointerCancel);
            unsubs.forEach((u) => {
                try { u(); } catch (e) { /* ignore */ }
            });
            tileEls.clear();
        },
    };
}