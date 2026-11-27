/*
 * Color Block — duel blok 9x9 (mode AI vs Bot & mode room multiplayer).
 * 1. META.id harus sama dengan nama file tanpa .js.
 * 2. Logika game ada di mount().
 * 3. Jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "color-block",
    name: "Color Block",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Take turns placing blocks on a shared 9x9 grid. Clear rows and columns to outscore your opponent.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/><rect x="19.5" y="7" width="11" height="11" rx="2.5"/><rect x="32" y="7" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/><rect x="7" y="19.5" width="11" height="11" rx="2.5"/><rect x="19.5" y="19.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/><rect x="32" y="19.5" width="11" height="11" rx="2.5"/><rect x="7" y="32" width="11" height="11" rx="2.5"/><rect x="19.5" y="32" width="11" height="11" rx="2.5"/><rect x="32" y="32" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
    bestKey: "colorBlockBest",
};

/* ================= pure logic ================= */
const GRID = 9;
const CELL = 40;
const BOARD = GRID * CELL;
const MINI = 16;

/* 16 famili shape -> rotasi unik digenerate otomatis (38 varian) */
function rotationsOf(cells) {
    const out = [], seen = new Set();
    let cur = cells.map((c) => [...c]);
    for (let r = 0; r < 4; r++) {
        const mx = Math.min(...cur.map((c) => c[0]));
        const my = Math.min(...cur.map((c) => c[1]));
        const norm = cur.map(([x, y]) => [x - mx, y - my]);
        const key = norm.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((c) => c.join(",")).join(";");
        if (!seen.has(key)) { seen.add(key); out.push(norm); }
        cur = norm.map(([x, y]) => [-y, x]);
    }
    return out;
}

const FAMILIES = [
    { fam: "dot", color: "#06b6d4", cells: [[0, 0]] },
    { fam: "I2", color: "#eab308", cells: [[0, 0], [1, 0]] },
    { fam: "I3", color: "#8b5cf6", cells: [[0, 0], [1, 0], [2, 0]] },
    { fam: "I4", color: "#3b82f6", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { fam: "I5", color: "#0ea5e9", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { fam: "O2", color: "#22c55e", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { fam: "O3", color: "#ef4444", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] },
    { fam: "R23", color: "#60a5fa", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    { fam: "L3", color: "#f97316", cells: [[0, 0], [1, 0], [0, 1]] },
    { fam: "L4", color: "#fb923c", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
    { fam: "J4", color: "#f472b6", cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },
    { fam: "T4", color: "#a78bfa", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { fam: "S4", color: "#34d399", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    { fam: "Z4", color: "#f87171", cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    { fam: "C3", color: "#14b8a6", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] },
    { fam: "X5", color: "#d946ef", cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
];

const SHAPES = [];
for (const f of FAMILIES) {
    rotationsOf(f.cells).forEach((cells, i) => {
        SHAPES.push({ id: `${f.fam}-${i}`, fam: f.fam, color: f.color, cells });
    });
}
const SHAPE_BY_ID = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
const EASY_POOL = SHAPES.filter((s) => ["dot", "I2", "L3", "O2"].includes(s.fam));
const SEAT_COLORS = ["#6366f1", "#f59e0b"];

const idx = (x, y) => y * GRID + x;

function fitsAt(board, cells, gx, gy) {
    for (const [cx, cy] of cells) {
        const x = gx + cx, y = gy + cy;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
        if (board[idx(x, y)]) return false;
    }
    return true;
}

function fitsAnywhere(board, cells) {
    for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++)
            if (fitsAt(board, cells, x, y)) return true;
    return false;
}

/* clear baris+kolom penuh sekaligus; kembalikan sel yg hancur utk animasi */
function clearLines(board) {
    const rows = [], cols = [];
    for (let y = 0; y < GRID; y++) {
        let full = true;
        for (let x = 0; x < GRID; x++) if (!board[idx(x, y)]) { full = false; break; }
        if (full) rows.push(y);
    }
    for (let x = 0; x < GRID; x++) {
        let full = true;
        for (let y = 0; y < GRID; y++) if (!board[idx(x, y)]) { full = false; break; }
        if (full) cols.push(x);
    }
    const n = rows.length + cols.length;
    if (!n) return { board, cleared: [], lines: 0, gained: 0 };
    const nb = board.slice();
    const cleared = [];
    const wipe = (x, y) => {
        const c = nb[idx(x, y)];
        if (c) { cleared.push({ x, y, color: c }); nb[idx(x, y)] = null; }
    };
    rows.forEach((y) => { for (let x = 0; x < GRID; x++) wipe(x, y); });
    cols.forEach((x) => { for (let y = 0; y < GRID; y++) wipe(x, y); });
    return { board: nb, cleared, lines: n, gained: 10 * n + 5 * n * (n - 1) };
}

function randTray(easy) {
    const pool = easy ? EASY_POOL : SHAPES;
    return [0, 1, 2].map(() => pool[Math.floor(Math.random() * pool.length)].id);
}

/* heuristic: skor langsung + jaga mobilitas tray + hindari lubang terisolasi */
function bestMove(state, seat) {
    const board = state.board;
    let best = null, bestVal = -Infinity;
    state.tray.forEach((id, slot) => {
        const sh = id && SHAPE_BY_ID[id];
        if (!sh) return;
        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                if (!fitsAt(board, sh.cells, gx, gy)) continue;
                let nb = board.slice();
                sh.cells.forEach(([cx, cy]) => { nb[idx(gx + cx, gy + cy)] = sh.color; });
                const res = clearLines(nb);
                nb = res.board;
                let rest = 0;
                state.tray.forEach((oid, oslot) => {
                    if (oslot === slot || !oid) return;
                    if (fitsAnywhere(nb, SHAPE_BY_ID[oid].cells)) rest++;
                });
                let holes = 0;
                for (let y = 0; y < GRID; y++) {
                    for (let x = 0; x < GRID; x++) {
                        if (nb[idx(x, y)]) continue;
                        const closed = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
                            const nx = x + dx, ny = y + dy;
                            return nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || nb[idx(nx, ny)];
                        });
                        if (closed) holes++;
                    }
                }
                const v = sh.cells.length + res.gained * 1.4 + rest * 0.3 - holes * 0.15 + Math.random() * 0.05;
                if (v > bestVal) { bestVal = v; best = { slot, x: gx, y: gy }; }
            }
        }
    });
    return best;
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // indeks koneksi: 0 host, 1 guest
    let roomData = room?.room || null;
    let state = null;

    let destroyed = false;
    let selected = -1;
    let cursor = { x: 4, y: 4 };
    let cheatsOpen = false;
    let helpOpen = false;
    let paused = false;
    let pauseStart = 0;
    let pauseOffset = 0;
    let botTimer = null;
    let botDue = 0;
    let fxTimer = null;
    let lastFxKey = null;
    let bestSavedFor = null;
    let resultDismissed = false;
    let joinSent = false;
    const offs = [];
    const cleanName = (n) => String(n || "").trim().slice(0, 20);

    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey) || 0) || 0; } catch (_) { }

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("colorBlockHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("colorBlockHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* Game clock excludes paused time so timers never jump on resume. */
    const clockNow = () => Date.now() - pauseOffset;
    const perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) - pauseOffset;
    const blocked = () => paused || helpOpen || cheatsOpen;

    /* ---------- state factory ---------- */
    function newGame(prev) {
        // acak posisi duduk tiap match (multiplayer); mode AI: manusia selalu seat 0
        const seats = online && Math.random() < 0.5 ? [1, 0] : [0, 1];
        // acak siapa jalan duluan (semua mode)
        const turn = Math.random() < 0.5 ? 0 : 1;
        let names;
        if (prev) {
            const connNames = [prev.names[prev.seats[0]], prev.names[prev.seats[1]]];
            names = [null, null];
            names[seats[0]] = connNames[0];
            names[seats[1]] = connNames[1];
        } else if (online) {
            names = [null, null];
            names[seats[0]] = cleanName(playerName) || "Player 1";
            names[seats[1]] = "Player 2";
        } else {
            names = [cleanName(playerName) || "You", "Bot"];
        }
        return {
            gameId: (prev?.gameId || 0) + 1,
            board: new Array(GRID * GRID).fill(null), // flat, serializable
            tray: randTray(false),                    // simpan id shape
            seats, turn, names,
            scores: [0, 0],
            lines: [0, 0],
            moves: 0,
            phase: "playing",
            winner: null,
            easy: false,
            fx: null, // {key, placed[], cleared[]} utk animasi lintas klien
        };
    }

    const mySeat = () => (online ? state?.seats[playerIndex] ?? 0 : 0);
    const trayShape = (i) => (state?.tray[i] ? SHAPE_BY_ID[state.tray[i]] : null);

    /* ---------- shell: HUD bar + fill-height board + overlay sheets ---------- */
    root.innerHTML = `
<style>
.cbx{--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--soft:#f6f7f9;--acc:#4f46e5;
  width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:10px;
  color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cbx *{box-sizing:border-box}
.cbx [hidden]{display:none!important}
.cbx :is(button,[role="button"],select,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.cbx-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.cbx-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;min-height:30px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--muted);white-space:nowrap}
.cbx-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.cbx-dot{width:8px;height:8px;border-radius:50%;background:#9ca3af;flex:none}
.cbx-dot.me{background:#10b981}
.cbx-dot.wait{background:#f59e0b}
.cbx-spacer{flex:1 1 auto;min-width:6px}
.cbx-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:6px 10px;min-height:32px;
  font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.cbx-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.cbx-btn:disabled{opacity:.4;cursor:default}
.cbx-btn.on{border-color:var(--acc);color:var(--acc);background:#eef0ff}
.cbx-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.cbx-btn.primary:hover:not(:disabled){color:#fff;opacity:.92}
.cbx-icon-btn{display:inline-flex;align-items:center;gap:5px}
.cbx-icon-btn svg{flex:none;display:block}
.cbx-btn-label{white-space:nowrap}
.cbx.game-fill>.cbx-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;
  min-width:0;padding:0;border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}
.cbx-svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%;touch-action:manipulation}
.cbx-ov{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:14px;
  background:rgba(255,255,255,.88);backdrop-filter:blur(3px)}
.cbx-card{width:min(420px,100%);max-height:100%;overflow:hidden;display:flex;flex-direction:column;gap:12px;
  padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(17,24,39,.1)}
.cbx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.cbx-head h3{margin:0;font-size:16px;font-weight:700}
.cbx-body{flex:1 1 auto;min-height:0;overflow:auto;font-size:13px;color:var(--muted)}
.cbx-body p{margin:0 0 8px}
.cbx-cheats{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
.cbx-cheats .cbx-btn{width:100%;text-align:left}
.cbx-help{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cbx-help b{display:block;margin-bottom:5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
.cbx-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6}
.cbx-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;
  font:600 10px/1.4 ui-monospace,monospace;background:var(--soft);color:var(--ink)}
.cbx-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.cbx-note{font-size:11px;color:var(--muted)}
.cbx-result{font-size:15px;font-weight:700;color:var(--ink)}
.cbx-tray{display:flex;gap:10px;justify-content:center;flex:none;padding-top:2px}
.cbx-slot{position:relative;width:78px;height:78px;border:1px solid var(--line);border-radius:14px;background:#fff;
  display:grid;place-items:center;cursor:pointer;padding:0;font:inherit;transition:border-color .15s,box-shadow .15s,opacity .2s}
.cbx-slot:hover:not(:disabled){border-color:#c7cbd4}
.cbx-slot.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.cbx-slot:disabled{cursor:default}
.cbx-slot.empty{opacity:.35}
.cbx-slot.dead{opacity:.3;filter:grayscale(.9)}
.cbx-slot kbd{position:absolute;top:5px;left:7px;font-size:9px;color:#b0b5bf;font-family:inherit}
.cbx-slot svg{display:block}
.cbx-fill rect{transform-box:fill-box;transform-origin:center}
.cbx-pop{animation:cbxPop .28s cubic-bezier(.2,.9,.3,1.4)}
@keyframes cbxPop{from{transform:scale(.5);opacity:.3}to{transform:scale(1);opacity:1}}
.cbx-burst{transform-box:fill-box;transform-origin:center;animation:cbxBurst .55s ease-out forwards;pointer-events:none}
@keyframes cbxBurst{
  0%{transform:scale(1) rotate(0deg);opacity:.95}
  100%{transform:scale(1.7) rotate(14deg);opacity:0}}
@media (prefers-reduced-motion:reduce){.cbx *,.cbx *::before,.cbx *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- fill-height + mobile refinements (last, beat pointer:coarse 44px) --- */
@media (max-width:640px){
  .cbx.game-fill>.cbx-board:not(:has(.cbx-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
  .cbx.game-fill>.cbx-board:has(.cbx-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .cbx{gap:6px}
  .cbx .cbx-hud{gap:4px}
  .cbx .cbx-hud .cbx-chip{padding:4px 6px;font-size:9px;min-height:0}
  .cbx .cbx-hud .cbx-chip[data-hud="best"],.cbx .cbx-hud .cbx-chip[data-hud="lines"]{display:none}
  .cbx .cbx-hud .cbx-btn-label,.cbx .cbx-hud .cbx-spacer{display:none}
  .cbx .cbx-hud .cbx-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .cbx .cbx-tray{gap:8px}
  .cbx .cbx-slot{width:64px;height:64px}
  .cbx .cbx-slot kbd{display:none}
  .cbx .cbx-ov{padding:8px}
  .cbx .cbx-card{width:100%;height:100%;max-height:100%;padding:12px}
  .cbx .cbx-help{grid-template-columns:1fr;gap:8px}
  .cbx .cbx-body,.cbx .cbx-cheats,.cbx .cbx-help{scrollbar-width:none}
  .cbx .cbx-body::-webkit-scrollbar,.cbx .cbx-cheats::-webkit-scrollbar,.cbx .cbx-help::-webkit-scrollbar{display:none}
  .cbx .cbx-foot{padding-top:8px;border-top:1px solid var(--line)}
  .cbx .cbx-note{display:none}
}
@media (pointer:coarse){
  .cbx .cbx-hud .cbx-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .cbx .cbx-card .cbx-btn{min-height:44px}
}
</style>
<div class="game-app cbx game-fill" data-cbx>
  <div class="cbx-hud">
    <span class="cbx-chip"><i class="cbx-dot" data-dot></i><b data-hud="status">Ready</b></span>
    <span class="cbx-chip">YOU <b data-hud="me">0</b></span>
    <span class="cbx-chip"><span data-hud="opname">Bot</span> <b data-hud="opp">0</b></span>
    <span class="cbx-chip">LINES <b data-hud="lines">0</b></span>
    <span class="cbx-chip">BEST <b data-hud="best">0</b></span>
    <span class="cbx-spacer"></span>
    <button class="cbx-btn cbx-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="cbx-btn-label">Help</span></button>
    <button class="cbx-btn cbx-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="cbx-btn-label">Cheats</span></button>
    <button class="cbx-btn cbx-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="cbx-btn-label">Pause</span></button>
    <button class="cbx-btn cbx-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="cbx-btn-label">Restart</span></button>
    <button class="cbx-btn cbx-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="cbx-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel cbx-board" data-board>
    <svg class="cbx-svg" data-svg viewBox="0 0 ${BOARD} ${BOARD}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Color Block board">
      <g data-bg></g><g class="cbx-fill" data-fill></g><g data-fx></g>
      <g data-ghost></g><g data-cursor></g><g data-hit></g>
    </svg>
    <div class="cbx-ov" data-ov="over" hidden>
      <div class="cbx-card">
        <div class="cbx-head"><h3 data-res-title>Game over</h3><button class="cbx-btn" type="button" data-act="close" aria-label="Close">Close</button></div>
        <div class="cbx-body"><p class="cbx-result" data-res-sub></p></div>
        <div class="cbx-foot"><span class="cbx-note">Press R to restart</span><button class="cbx-btn primary" type="button" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="cbx-ov" data-ov="pause" hidden>
      <div class="cbx-card">
        <div class="cbx-head"><h3>Paused</h3></div>
        <div class="cbx-body"><p>The board, bot and timers are frozen.</p></div>
        <div class="cbx-foot"><span class="cbx-note">Press P or Esc to resume</span><button class="cbx-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="cbx-ov" data-ov="cheat" hidden>
      <div class="cbx-card">
        <div class="cbx-head"><h3>Cheats</h3><button class="cbx-btn" type="button" data-cheat-close aria-label="Close">Close</button></div>
        <div class="cbx-cheats">
          <button class="cbx-btn" type="button" data-cheat="wipe">Clear board</button>
          <button class="cbx-btn" type="button" data-cheat="score">+100 points</button>
          <button class="cbx-btn" type="button" data-cheat="reroll">New pieces</button>
          <button class="cbx-btn" type="button" data-cheat="easy" data-easy-btn>Easy pieces: Off</button>
          <button class="cbx-btn" type="button" data-cheat="best" data-best-btn>Best move</button>
        </div>
      </div>
    </div>
    <div class="cbx-ov" data-ov="help" hidden>
      <div class="cbx-card">
        <div class="cbx-head"><h3>How to play</h3><button class="cbx-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="cbx-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a piece in the tray, then a cell to place it.</li>
              <li><span class="cbx-kbd">1</span> <span class="cbx-kbd">2</span> <span class="cbx-kbd">3</span> select piece · arrows move the cursor.</li>
              <li><span class="cbx-kbd">Enter</span> place · <span class="cbx-kbd">Esc</span> clear selection.</li>
              <li><span class="cbx-kbd">H</span> help · <span class="cbx-kbd">C</span> cheats · <span class="cbx-kbd">P</span> pause · <span class="cbx-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a piece in the tray, then tap a cell on the board.</li>
              <li>Use the HUD buttons for Help, Cheats, Pause, Restart and Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Take turns placing one of your three pieces on the shared 9×9 grid.</li>
              <li>Fill an entire row or column to clear it and score bonus points.</li>
              <li>Score = piece size + 10 per cleared line + 5 per extra line.</li>
              <li>You lose when none of your remaining pieces fit anywhere.</li>
              <li>Cheats: clear board, add points, reroll pieces, easy set or best move.</li>
            </ul>
            <div class="cbx-foot"><span class="cbx-note">Press H to reopen this guide</span><button class="cbx-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="cbx-tray" data-tray></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $("[data-svg]");
    const bgG = $("[data-bg]"), fillG = $("[data-fill]"), fxG = $("[data-fx]");
    const ghostG = $("[data-ghost]"), cursorG = $("[data-cursor]"), hitG = $("[data-hit]");
    const trayEl = $("[data-tray]");
    const dotEl = $("[data-dot]");
    const hud = {
        status: $("[data-hud='status']"),
        me: $("[data-hud='me']"),
        opp: $("[data-hud='opp']"),
        opname: $("[data-hud='opname']"),
        lines: $("[data-hud='lines']"),
        best: $("[data-hud='best']"),
    };
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const resTitle = $("[data-res-title]"), resSub = $("[data-res-sub]");
    const easyBtn = $("[data-easy-btn]"), bestBtn = $("[data-best-btn]");
    const cheatBtns = Array.from(ov.cheat.querySelectorAll("[data-cheat]"));

    /* papan statis: background + hit-layer sekali saja */
    {
        let bg = "", hit = "";
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                bg += `<rect x="${x * CELL + 1}" y="${y * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="6" fill="#f1f3f7"/>`;
                hit += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="transparent" data-cell data-x="${x}" data-y="${y}"/>`;
            }
        }
        bgG.innerHTML = bg;
        hitG.innerHTML = hit;
    }

    /* ---------- render ---------- */
    function miniSvg(sh) {
        const w = (Math.max(...sh.cells.map((c) => c[0])) + 1) * MINI;
        const h = (Math.max(...sh.cells.map((c) => c[1])) + 1) * MINI;
        let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`;
        sh.cells.forEach(([x, y]) => {
            s += `<rect x="${x * MINI + 1}" y="${y * MINI + 1}" width="${MINI - 2}" height="${MINI - 2}" rx="3.5" fill="${sh.color}"/>`;
        });
        return s + "</svg>";
    }

    function renderBoard() {
        let s = "";
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                const c = state.board[idx(x, y)];
                if (c) s += `<rect data-idx="${idx(x, y)}" x="${x * CELL + 3}" y="${y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${c}" stroke="#00000012"/>`;
            }
        }
        fillG.innerHTML = s;
    }

    function renderTray() {
        if (selected >= 0 && !trayShape(selected)) selected = -1;
        trayEl.innerHTML = "";
        state.tray.forEach((id, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.slot = i;
            const sh = id ? SHAPE_BY_ID[id] : null;
            const dead = sh && !fitsAnywhere(state.board, sh.cells);
            b.className = "cbx-slot" + (i === selected ? " sel" : "") + (!sh ? " empty" : "") + (dead ? " dead" : "");
            b.innerHTML = `<kbd>${i + 1}</kbd>`;
            if (!sh || dead || state.phase !== "playing" || blocked()) b.disabled = true;
            b.setAttribute("aria-label", sh ? `Piece ${sh.fam}` : "Empty slot");
            if (sh) b.innerHTML += miniSvg(sh);
            trayEl.appendChild(b);
        });
    }

    function drawGhost() {
        const sh = selected >= 0 ? trayShape(selected) : null;
        if (!sh || blocked() || state.phase !== "playing" || state.turn !== mySeat()) { ghostG.innerHTML = ""; return; }
        const ok = fitsAt(state.board, sh.cells, cursor.x, cursor.y);
        const color = ok ? "#10b981" : "#ef4444";
        let s = "";
        for (const [cx, cy] of sh.cells) {
            const x = cursor.x + cx, y = cursor.y + cy;
            if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
            s += `<rect x="${x * CELL + 3}" y="${y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${color}" fill-opacity=".25" stroke="${color}" stroke-opacity=".6" stroke-width="1.5"/>`;
        }
        ghostG.innerHTML = s;
    }

    function drawCursor() {
        if (blocked() || state.phase !== "playing" || state.turn !== mySeat()) { cursorG.innerHTML = ""; return; }
        cursorG.innerHTML = `<rect x="${cursor.x * CELL + 2}" y="${cursor.y * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="7" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }

    function playFx() {
        const fx = state.fx;
        if (!fx || fx.key === lastFxKey) return;
        lastFxKey = fx.key;
        // pop-in blok yang baru dipasang
        (fx.placed || []).forEach((p) => {
            const r = fillG.querySelector(`[data-idx="${idx(p.x, p.y)}"]`);
            if (r) r.classList.add("cbx-pop");
        });
        // ledakan blok yang hancur
        let s = "";
        (fx.cleared || []).forEach((p, i) => {
            s += `<rect class="cbx-burst" style="animation-delay:${i * 18}ms" x="${p.x * CELL + 3}" y="${p.y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${p.color}"/>`;
        });
        fxG.innerHTML = s;
        clearTimeout(fxTimer);
        fxTimer = setTimeout(() => { fxG.innerHTML = ""; }, 900);
    }

    /* Overlays suppress each other: help > cheats > pause > result. HUD labels
       are updated on the label span so the icon is never destroyed. */
    function syncUI() {
        const resultOpen = Boolean(state && state.phase !== "playing") && !resultDismissed;
        ov.over.hidden = !resultOpen || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", cheatsOpen);
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".cbx-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pbtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        }
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            hud.status.textContent = "Connecting…";
            dotEl.className = "cbx-dot wait";
            fillG.innerHTML = ""; trayEl.innerHTML = "";
            syncUI();
            return;
        }
        const me = mySeat();
        const mine = state.turn === me;
        const playing = state.phase === "playing";

        renderBoard();
        renderTray();
        drawGhost();
        drawCursor();
        playFx();

        hud.status.textContent = !playing ? "Game over"
            : mine ? "Your turn"
                : !online ? "Bot is thinking…" : `${state.names[state.turn]}'s turn`;
        dotEl.className = "cbx-dot" + (!playing ? "" : mine ? " me" : " wait");
        hud.me.textContent = String(state.scores[me]);
        hud.opp.textContent = String(state.scores[1 - me]);
        hud.opname.textContent = online ? (state.names[1 - me] || "Opponent") : "Bot";
        hud.lines.textContent = String(state.lines[me]);
        hud.best.textContent = String(best);

        if (!playing) {
            const w = state.winner;
            resTitle.textContent = w === "draw" ? "Draw" : `${state.names[w]} wins`;
            resTitle.style.color = w === "draw" ? "" : SEAT_COLORS[w];
            resSub.textContent = `${state.scores[0]} — ${state.scores[1]}`;
            if (bestSavedFor !== state.gameId) {
                bestSavedFor = state.gameId;
                if (state.scores[me] > best) {
                    best = state.scores[me];
                    try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
                    hud.best.textContent = String(best);
                }
            }
        }

        easyBtn.textContent = `Easy pieces: ${state.easy ? "On" : "Off"}`;
        easyBtn.classList.toggle("on", state.easy);
        cheatBtns.forEach((b) => {
            if (b.dataset.cheat === "best") b.disabled = !playing || !mine || paused || helpOpen;
            else b.disabled = !playing || paused || helpOpen;
        });
        bestBtn.classList.toggle("on", cheatsOpen && state.easy);
        syncUI();
    }

    /* ---------- overlays ---------- */
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !helpOpen;
        if (next === helpOpen) return;
        helpOpen = next;
        if (helpOpen) {
            if (paused) togglePause(false);
            cheatsOpen = false;
            freezeBot();
        } else ensureBot();
        render();
    }

    function toggleCheats(on) {
        const next = typeof on === "boolean" ? on : !cheatsOpen;
        if (next === cheatsOpen) return;
        cheatsOpen = next;
        if (cheatsOpen) {
            if (paused) togglePause(false);
            helpOpen = false;
            freezeBot();
        } else ensureBot();
        render();
    }

    function togglePause(on) {
        if (online || destroyed) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        if (next) {
            paused = true;
            pauseStart = Date.now();
            freezeBot();
            clearTimeout(fxTimer); fxTimer = null;
            fxG.innerHTML = "";
            cheatsOpen = false; helpOpen = false;
        } else {
            if (pauseStart) pauseOffset += Date.now() - pauseStart;
            pauseStart = 0;
            paused = false;
            ensureBot();
        }
        render();
    }

    /* ---------- bot (mode AI, giliran diacak di newGame) ---------- */
    function freezeBot() {
        clearTimeout(botTimer);
        botTimer = null;
    }

    function ensureBot() {
        if (destroyed || online || blocked() || botTimer) return;
        if (state?.phase === "playing" && state.turn === 1) {
            botDue = clockNow() + 700 + Math.random() * 600;
            botTimer = setTimeout(() => {
                botTimer = null;
                if (destroyed || blocked() || !state || state.phase !== "playing" || state.turn !== 1) return;
                const mv = bestMove(state, 1);
                if (mv) applyAction({ type: "place", ...mv }, 1);
            }, Math.max(0, botDue - clockNow()));
        }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        ensureBot();
    }

    /* ---------- mutasi state (hanya host / lokal) ---------- */
    function checkEnd() {
        if (state.phase !== "playing") return;
        const alive = state.tray.some((id) => id && fitsAnywhere(state.board, SHAPE_BY_ID[id].cells));
        if (!alive) {
            state.phase = "over";
            state.winner = state.scores[0] > state.scores[1] ? 0 : state.scores[1] > state.scores[0] ? 1 : "draw";
        }
    }

    function doPlace(seat, slot, gx, gy) {
        const id = state.tray[slot];
        const sh = id && SHAPE_BY_ID[id];
        if (!sh || !fitsAt(state.board, sh.cells, gx, gy)) return false;
        const placed = sh.cells.map(([cx, cy]) => ({ x: gx + cx, y: gy + cy }));
        placed.forEach((p) => { state.board[idx(p.x, p.y)] = sh.color; });
        state.scores[seat] += sh.cells.length;
        const res = clearLines(state.board);
        state.board = res.board;
        state.scores[seat] += res.gained;
        state.lines[seat] += res.lines;
        state.tray[slot] = null;
        if (state.tray.every((t) => !t)) state.tray = randTray(state.easy);
        state.moves++;
        state.turn = 1 - seat;
        state.fx = { key: `${state.gameId}:${state.moves}`, placed, cleared: res.cleared };
        checkEnd();
        return true;
    }

    function applyAction(action, actor) {
        if (destroyed || !action) return;
        const seat = state ? state.seats[actor] : 0;

        if (action.type === "join") {
            if (!online || actor !== 1 || !state) return;
            const nm = cleanName(action.name);
            if (nm) { state.names[state.seats[1]] = nm; publish(); }
            return;
        }
        if (action.type === "restart") {
            clearTimeout(botTimer); botTimer = null;
            clearTimeout(fxTimer); fxTimer = null;
            fxG.innerHTML = "";
            if (pauseStart) pauseOffset += Date.now() - pauseStart;
            pauseStart = 0;
            paused = false;
            helpOpen = false; cheatsOpen = false; resultDismissed = false;
            selected = -1;
            state = newGame(state);
            publish();
            return;
        }
        if (!state || state.phase !== "playing") return;

        if (action.type === "place") {
            if (state.turn !== seat) return;
            const slot = Number(action.slot), gx = Number(action.x), gy = Number(action.y);
            if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
            if (!Number.isInteger(gx) || !Number.isInteger(gy)) return;
            if (doPlace(seat, slot, gx, gy)) publish();
            return;
        }
        if (action.type === "cheat") {
            const kind = action.kind;
            if (kind === "wipe") {
                const cleared = [];
                for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
                    const c = state.board[idx(x, y)];
                    if (c) { cleared.push({ x, y, color: c }); state.board[idx(x, y)] = null; }
                }
                state.moves++;
                state.fx = { key: `${state.gameId}:${state.moves}`, placed: [], cleared };
            } else if (kind === "score") {
                state.scores[seat] += 100;
            } else if (kind === "reroll") {
                state.tray = randTray(state.easy);
                checkEnd();
            } else if (kind === "easy") {
                state.easy = !state.easy;
            } else if (kind === "best") {
                if (state.turn !== seat) return;
                const mv = bestMove(state, seat);
                if (!mv || !doPlace(seat, mv.slot, mv.x, mv.y)) return;
            } else return;
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------- input: mouse / tap ---------- */
    function handleClick(event) {
        const t = event.target;
        if (destroyed) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-pause]")) { togglePause(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-resume]")) { togglePause(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-restart]")) { submitAction({ type: "restart" }); root.focus({ preventScroll: true }); return; }
        const act = t.closest("[data-act]");
        if (act) {
            if (act.dataset.act === "close") { resultDismissed = true; render(); }
            root.focus({ preventScroll: true });
            return;
        }
        if (!state) return;
        const cheat = t.closest("[data-cheat]");
        if (cheat && !cheat.disabled && !paused && !helpOpen) {
            submitAction({ type: "cheat", kind: cheat.dataset.cheat });
            root.focus({ preventScroll: true });
            return;
        }
        if (blocked() || state.phase !== "playing") return;

        const slotBtn = t.closest("[data-slot]");
        if (slotBtn && !slotBtn.disabled) {
            const i = Number(slotBtn.dataset.slot);
            selected = selected === i ? -1 : i;
            renderTray(); drawGhost();
            return;
        }
        const cell = t.closest("[data-cell]");
        if (cell) {
            cursor = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
            tryPlace();
        }
    }

    function tryPlace() {
        if (!state || blocked() || state.phase !== "playing" || state.turn !== mySeat() || selected < 0) return;
        submitAction({ type: "place", slot: selected, x: cursor.x, y: cursor.y });
        selected = -1;
        if (!online) { drawGhost(); } // host: render datang dari publish
    }

    function handlePointerMove(e) {
        if (!state || blocked() || state.phase !== "playing") return;
        const c = e.target.closest?.("[data-cell]");
        if (!c) return;
        cursor = { x: Number(c.dataset.x), y: Number(c.dataset.y) };
        drawGhost(); drawCursor();
    }
    function handlePointerLeave() { ghostG.innerHTML = ""; }

    /* ---------- input: keyboard (desktop) ---------- */
    function handleKey(e) {
        if (destroyed || e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = e.code;
        /* priority: help -> cheats -> pause -> escape -> restart -> game actions */
        if (k === "KeyH" || e.key === "?") {
            e.preventDefault();
            if (!e.repeat) toggleHelp();
            return;
        }
        if (k === "KeyC") {
            e.preventDefault();
            if (!e.repeat && !helpOpen) toggleCheats();
            return;
        }
        if (k === "KeyP") {
            e.preventDefault();
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            return;
        }
        if (k === "Escape") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            else { selected = -1; renderTray(); drawGhost(); drawCursor(); }
            return;
        }
        if (k === "KeyR") {
            e.preventDefault();
            if (!e.repeat && !helpOpen && !cheatsOpen) submitAction({ type: "restart" });
            return;
        }
        if (tag === "BUTTON") return; // keep native Enter/Space on HUD buttons
        if (!state || blocked()) { e.preventDefault(); return; }
        const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (move) {
            e.preventDefault();
            cursor.x = Math.min(GRID - 1, Math.max(0, cursor.x + move[0]));
            cursor.y = Math.min(GRID - 1, Math.max(0, cursor.y + move[1]));
            drawGhost(); drawCursor();
            return;
        }
        if (k === "Digit1" || k === "Digit2" || k === "Digit3") {
            e.preventDefault();
            const i = Number(k.slice(-1)) - 1;
            const btn = trayEl.querySelector(`[data-slot="${i}"]`);
            if (btn && !btn.disabled) { selected = selected === i ? -1 : i; renderTray(); drawGhost(); }
            return;
        }
        if (k === "Enter" || k === "Space") {
            e.preventDefault();
            if (state.phase !== "playing" || state.turn !== mySeat()) return;
            if (selected < 0) { // pilih piece pertama yang masih hidup
                const i = state.tray.findIndex((id, j) => id && fitsAnywhere(state.board, SHAPE_BY_ID[id].cells));
                if (i >= 0) { selected = i; renderTray(); drawGhost(); }
            } else tryPlace();
        }
    }

    root.tabIndex = 0;
    root.addEventListener("click", handleClick);
    svgEl.addEventListener("pointermove", handlePointerMove);
    svgEl.addEventListener("pointerleave", handlePointerLeave);
    root.addEventListener("keydown", handleKey);

    /* ---------- wiring mode ---------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = newGame();
            publish();
            const offAct = room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = room.onState((nextState) => {
                state = nextState;
                if (!joinSent && state) {
                    joinSent = true;
                    room.sendAction({ type: "join", name: playerName }).catch(console.warn);
                }
                render();
            });
            if (typeof offState === "function") offs.push(offState);
            room.sendAction({ type: "join", name: playerName }).catch(console.warn);
            joinSent = true;
            render();
        }
    } else {
        state = newGame();
        render();
        ensureBot();
    }
    root.focus({ preventScroll: true });

    return {
        destroy() {
            destroyed = true;
            clearTimeout(botTimer); botTimer = null;
            clearTimeout(fxTimer); fxTimer = null;
            root.removeEventListener("click", handleClick);
            svgEl.removeEventListener("pointermove", handlePointerMove);
            svgEl.removeEventListener("pointerleave", handlePointerLeave);
            root.removeEventListener("keydown", handleKey);
            offs.forEach((off) => { try { off(); } catch (_) { } });
        },
    };
}
