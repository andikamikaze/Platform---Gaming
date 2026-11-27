/* ==== GAME: sudoku.js ==== */
/* =============================================================
SUDOKU - minimalist 9x9 sudoku (template: export META + mount)
- Generator: randomized backtracking + symmetric removal with a
  solution-counting solver => every puzzle has EXACTLY one solution.
- Modes: Solo, VS Bot (local AI), Room (online 2-player race).
- Race rules: shared board, alternate turns, correct digit = +1 cell,
  wrong digit = mistake (not placed), 3 mistakes = lose.
  First turn AND player seats are re-randomized every round.
- Notes (pencil marks): only digits still possible for that cell's
  row / column / box are allowed & shown; auto-pruned on placement.
- Cheat overlay, mobile virtual pad + D-pad, full keyboard/mouse.
============================================================= */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "sudoku",
    name: "Sudoku",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Fill the 9x9 grid so every row, column and box holds 1-9. Solo, vs bot, or an online turn-based race.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="3"/><path stroke-width="1" opacity=".3" d="M9.2 5v38M13.4 5v38M21.9 5v38M26.1 5v38M34.5 5v38M38.7 5v38M5 9.2h38M5 13.4h38M5 21.9h38M5 26.1h38M5 34.5h38M5 38.7h38"/><path stroke-width="2" opacity=".85" d="M17.7 5v38M30.3 5v38M5 17.7h38M5 30.3h38"/><g fill="currentColor" stroke="none" font-family="inherit" font-size="8" text-anchor="middle"><text x="11.3" y="14.1">5</text><text x="32.4" y="14.1">8</text><text x="24" y="26.8">7</text><text x="36.6" y="39.4">3</text></g></svg>',
    bg: ["#dcfce7", "#bbf7d0"],
    bestKey: "sudokuBestTimes",
};

/* ---------------- grid engine (pure, testable) ---------------- */
const ROW = (i) => (i / 9) | 0;
const COL = (i) => i % 9;
const BOX = (i) => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

function initMasks(g) {
    const rows = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const cols = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const boxes = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 81; i++) {
        const v = g[i];
        if (!v) continue;
        const bit = 1 << v;
        const r = ROW(i), c = COL(i), b = BOX(i);
        if ((rows[r] | cols[c] | boxes[b]) & bit) return null;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
    }
    return { rows: rows, cols: cols, boxes: boxes };
}

/* MRV backtracking. Counts solutions up to `limit`; the first
solution found is copied into out.solved. Returns the count. */
function search(g, limit, rand, out) {
    const m = initMasks(g);
    if (!m) return 0;
    let count = 0;
    const bt = () => {
        let best = -1, bestMask = 0, bestN = 10;
        for (let i = 0; i < 81; i++) {
            if (g[i]) continue;
            const mask = ~(m.rows[ROW(i)] | m.cols[COL(i)] | m.boxes[BOX(i)]) & 0x3fe;
            let n = 0;
            let t = mask;
            while (t) {
                n++;
                t &= t - 1;
            }
            if (n === 0) return;
            if (n < bestN) {
                bestN = n;
                best = i;
                bestMask = mask;
                if (n === 1) break;
            }
        }
        if (best < 0) {
            if (out && count === 0) out.solved = g.slice();
            count += 1;
            return;
        }
        const digits = [];
        for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
        if (rand) shuffle(digits);
        const r = ROW(best), c = COL(best), b = BOX(best);
        for (let k = 0; k < digits.length; k++) {
            const d = digits[k];
            const bit = 1 << d;
            g[best] = d;
            m.rows[r] |= bit;
            m.cols[c] |= bit;
            m.boxes[b] |= bit;
            bt();
            g[best] = 0;
            m.rows[r] ^= bit;
            m.cols[c] ^= bit;
            m.boxes[b] ^= bit;
            if (count >= limit) return;
        }
    };
    bt();
    return count;
}

function countSolutions(grid, limit) {
    const lim = typeof limit === "number" && limit > 0 ? limit : 2;
    return search(grid.slice(), lim, false, {});
}

function generateFull() {
    const g = new Array(81).fill(0);
    const out = {};
    search(g, 1, true, out);
    return out.solved || null;
}

const TARGETS = { easy: 40, medium: 32, hard: 26 };

/* Remove symmetric pairs while the solution stays unique.
A 2.5s budget guarantees this never hangs; the result is always
a valid, uniquely solvable puzzle. */
function generate(difficulty) {
    const target = TARGETS[difficulty] || TARGETS.medium;
    const t0 = Date.now();
    const solution = generateFull();
    const puzzle = solution.slice();
    let givens = 81;
    const anchors = [];
    for (let p = 0; p <= 40; p++) anchors.push(p);
    shuffle(anchors);
    for (let k = 0; k < anchors.length && givens > target; k++) {
        if (Date.now() - t0 > 2500) break;
        const p = anchors[k];
        const q = 80 - p;
        const a = puzzle[p];
        const b = puzzle[q];
        if (!a && !b) continue;
        puzzle[p] = 0;
        puzzle[q] = 0;
        if (countSolutions(puzzle, 2) === 1) {
            givens -= p === q ? 1 : (a ? 1 : 0) + (b ? 1 : 0);
        } else {
            puzzle[p] = a;
            puzzle[q] = b;
        }
    }
    return { puzzle: puzzle, solution: solution, givens: givens };
}

/* Bitmask of digits still possible at cell i (row/col/box scan). */
function candMask(grid, i) {
    if (grid[i]) return 0;
    const r = ROW(i), c = COL(i);
    const br = ((r / 3) | 0) * 3, bc = ((c / 3) | 0) * 3;
    let used = 0;
    for (let k = 0; k < 9; k++) {
        const a = grid[r * 9 + k], b = grid[k * 9 + c];
        if (a) used |= 1 << a;
        if (b) used |= 1 << b;
    }
    for (let rr = 0; rr < 3; rr++)
        for (let cc = 0; cc < 3; cc++) {
            const v = grid[(br + rr) * 9 + bc + cc];
            if (v) used |= 1 << v;
        }
    return ~used & 0x3fe;
}

function eachPeer(i, fn) {
    const r = ROW(i), c = COL(i);
    const br = ((r / 3) | 0) * 3, bc = ((c / 3) | 0) * 3;
    for (let k = 0; k < 9; k++) {
        fn(r * 9 + k);
        fn(k * 9 + c);
        fn((br + ((k / 3) | 0)) * 9 + bc + (k % 3));
    }
}

function popcount(x) {
    let n = 0;
    while (x) {
        n++;
        x &= x - 1;
    }
    return n;
}

/* ---------------- game mount ---------------- */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ----- local (per-client) UI state: never published ----- */
    const HELP_KEY = "sudokuHelpSeen";
    const icon = (name) => iconSVG(name, { size: 14 });
    const ZERO = new Array(81).fill(0);
    let notes = new Array(81).fill(0);   // pencil bitmask per cell (private)
    let notesMode = false;
    let reveal = false;                  // cheat: ghost solution (private)
    let selected = -1;
    let showHelp = false;
    let showCheats = false;
    let paused = false;
    let pauseStart = 0;
    let toast = "";
    let toastTimer = null;
    let botTimer = null;
    let tickTimer = null;
    let lastRound;
    let lastEvt = 0;
    let gridCache = new Array(81).fill(0);
    const flashSet = new Set();
    const popSet = new Set();
    const fxTimers = [];
    const unsubs = [];
    let destroyed = false;

    const esc = (s) =>
        String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const fmt = (s) => ((s / 60) | 0) + ":" + String(s % 60).padStart(2, "0");
    const SEAT_COLORS = ["#2563eb", "#d97706"];
    const blocked = () => paused || showHelp || showCheats;

    function loadBest() {
        try {
            return JSON.parse(localStorage.getItem(META.bestKey) || "{}") || {};
        } catch {
            return {};
        }
    }
    function saveBest(diff, secs) {
        try {
            const b = loadBest();
            if (!b[diff] || secs < b[diff]) {
                b[diff] = secs;
                localStorage.setItem(META.bestKey, JSON.stringify(b));
            }
        } catch { }
    }

    /* ----- skeleton: single HUD + fill-height board + sibling pad ----- */
    root.innerHTML = `
<style>
.sdk{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--box:#94a3b8;--soft:#f8fafc;--blue:#2563eb;--blue-bg:#dbeafe;--amber:#d97706;--green:#059669;--red:#dc2626;color:var(--ink);font-variant-numeric:tabular-nums;color-scheme:light;min-width:0;min-height:0;flex:1 1 auto;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.sdk [hidden]{display:none!important}
.sdk *,.sdk *::before,.sdk *::after{box-sizing:border-box}
.sdk :where(svg,canvas,img){max-width:100%;height:auto}
.sdk :where(button,[role="button"],select,input){touch-action:manipulation}
.sdk :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.sdk-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.sdk-chips{display:inline-flex;gap:8px;flex-wrap:wrap}
.sdk-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--soft);font-size:12.5px;color:var(--mut);white-space:nowrap}
.sdk-chip b{color:var(--ink);font-weight:700}
.sdk-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.sdk-spacer{flex:1 1 auto}
.sdk-btn{padding:7px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;touch-action:manipulation;transition:background .12s,border-color .12s}
.sdk-btn:hover:not(:disabled){background:var(--soft);border-color:var(--box)}
.sdk-btn:disabled{opacity:.4;cursor:default}
.sdk-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.sdk-btn.primary:hover:not(:disabled){background:#1e293b}
.sdk-btn.active{background:var(--blue-bg);border-color:var(--blue);color:var(--blue)}
.sdk-icon-btn{display:inline-flex;align-items:center;gap:6px}
.sdk-icon-btn svg{flex:none;display:block}
.sdk-btn-label{white-space:nowrap}
.sdk-big{padding:10px 22px;font-size:14px}
.sdk-app.game-fill>.sdk-board[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.sdk-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:8px;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden;container-type:size}
.sdk-gridboard{width:min(100cqw,100cqh,432px);height:auto;max-width:100%;aspect-ratio:1;display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(9,1fr);background:#fff;border:2px solid #334155;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,.08);user-select:none;touch-action:manipulation}
.sdk-cell{display:flex;align-items:center;justify-content:center;font-size:clamp(15px,4.6vw,22px);font-weight:600;color:var(--blue);cursor:pointer;background:#fff;border-right:1px solid var(--line);border-bottom:1px solid var(--line);transition:background .12s}
.sdk-cell:hover{background:#f1f5f9}
.sdk-nr{border-right:none}
.sdk-nb{border-bottom:none}
.sdk-bl{border-left:2px solid var(--box)}
.sdk-bt{border-top:2px solid var(--box)}
.sdk-given{color:var(--ink);font-weight:800;background:var(--soft)}
.sdk-p1{color:var(--amber)}
.sdk-hintv{color:var(--green)}
.sdk-peer{background:#f1f5f9}
.sdk-same{background:var(--blue-bg);font-weight:800}
.sdk-sel{background:var(--blue-bg);box-shadow:inset 0 0 0 2px var(--blue)}
.sdk-ghost{color:#94a3b8;font-weight:500;font-style:italic}
.sdk-notes{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);width:100%;height:100%;padding:2px;box-sizing:border-box}
.sdk-notes i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:clamp(6px,1.7vw,9.5px);font-weight:600;color:var(--mut);line-height:1}
.sdk-flash{animation:sdk-fl .5s}
.sdk-pop{animation:sdk-pop .25s}
@keyframes sdk-fl{0%,100%{background:#fee2e2}50%{background:#fecaca}}
@keyframes sdk-pop{0%{transform:scale(1.16)}100%{transform:scale(1)}}
.sdk-pad{display:flex;flex-direction:column;gap:8px;align-items:center;margin-top:10px}
.sdk-padmain{display:flex;gap:10px;align-items:flex-start;justify-content:center;flex-wrap:wrap;width:100%}
.sdk-padkeys{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;flex:1 1 180px;max-width:300px}
.sdk-key{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;height:46px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;font-family:inherit;touch-action:manipulation}
.sdk-key b{font-size:19px;font-weight:700;color:var(--ink)}
.sdk-key small{font-size:9.5px;color:var(--mut);line-height:1}
.sdk-key:hover:not(:disabled){background:var(--soft);border-color:var(--box)}
.sdk-key:disabled{opacity:.3;cursor:default}
.sdk-sidrest{display:flex;flex-direction:column;gap:8px;flex:0 1 150px}
.sdk-tools{display:grid;grid-template-columns:1fr;gap:6px}
.sdk-tool{height:36px;padding:0 6px;font-size:11.5px}
.sdk-dpad{display:grid;grid-template-columns:repeat(3,36px);grid-template-rows:repeat(2,30px);gap:4px;justify-content:center}
.sdk-dbtn{padding:0;font-size:11px;line-height:1}
.sdk-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px;color:var(--mut);justify-content:center}
.sdk-legend span{display:inline-flex;align-items:center;gap:4px}
.sdk-ov{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(248,250,252,.9);backdrop-filter:blur(3px)}
.sdk-ov-pause{z-index:5}
.sdk-ov-top{z-index:6}
.sdk-ov-top2{z-index:7}
.sdk-card{display:flex;flex-direction:column;width:min(440px,100%);max-height:100%;padding:18px;border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 12px rgba(15,23,42,.14);background:#fff;overflow:hidden;text-align:center;box-sizing:border-box}
.sdk-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;text-align:left}
.sdk-head h3{margin:0;font-size:18px}
.sdk-tag{font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 9px;white-space:nowrap}
.sdk-body,.sdk-cheats,.sdk-help,.sdk-stats{flex:1 1 auto;min-height:0;overflow:auto}
.sdk-sub{margin:0 0 12px;font-size:13px;color:var(--mut);line-height:1.55}
.sdk-seg{display:flex;gap:6px;justify-content:center;margin:0 0 10px;flex-wrap:wrap}
.sdk-seg .sdk-btn{flex:1;min-width:82px}
.sdk-stats{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:0 0 14px}
.sdk-badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:11px;font-weight:700;margin:0 0 12px}
.sdk-help{text-align:left;font-size:13px;line-height:1.6;color:#334155}
.sdk-help h4{margin:12px 0 4px;font-size:13px;color:var(--ink)}
.sdk-help ul{margin:4px 0;padding-left:18px}
.sdk-help kbd{background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:0 5px;font-size:11.5px;font-family:inherit}
.sdk-cheats{display:flex;flex-direction:column;gap:6px;text-align:left}
.sdk-cheat{display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:9px 12px}
.sdk-cheat small{color:var(--mut);font-size:11px;font-weight:500}
.sdk-foot{flex:none;margin-top:12px;font-size:11.5px;color:var(--mut);text-align:center;line-height:1.7}
.sdk-foot .sdk-note{margin-right:auto}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.sdk :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.sdk :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.sdk :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.sdk :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:480px){.sdk :where(kbd,[class*="kbd"]){display:none}}
@media (pointer:coarse){.sdk :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}}
@media (prefers-reduced-motion:reduce){.sdk *,.sdk *::before,.sdk *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* --- fill-height + mobile refinements (LAST: beat pointer:coarse 44px) --- */
@media (max-width:640px){
.sdk-app.game-fill>.sdk-board[data-board]{flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.sdk-app .sdk-hud{gap:5px;margin-bottom:8px}
.sdk-app .sdk-hud .sdk-chip{padding:4px 6px;font-size:9px}
.sdk-app .sdk-hud .sdk-chip[data-hud="best"]{display:none}
.sdk-app .sdk-hud .sdk-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.sdk-app .sdk-hud .sdk-btn-label,.sdk-app .sdk-hud .sdk-spacer{display:none}
.sdk-app .sdk-gridboard{width:min(100cqw,100cqh,432px)}
.sdk-app .sdk-padkeys{flex:1 1 100%;max-width:none}
.sdk-app .sdk-sidrest{flex:1 1 100%}
.sdk-app .sdk-ov{padding:8px}
.sdk-app .sdk-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.sdk-app .sdk-body,.sdk-app .sdk-cheats,.sdk-app .sdk-help,.sdk-app .sdk-stats{scrollbar-width:none}
.sdk-app .sdk-body::-webkit-scrollbar,.sdk-app .sdk-cheats::-webkit-scrollbar,.sdk-app .sdk-help::-webkit-scrollbar,.sdk-app .sdk-stats::-webkit-scrollbar{display:none}
.sdk-app .sdk-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
}
@media (pointer:coarse){
.sdk-app .sdk-hud .sdk-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.sdk-app .sdk-card .sdk-btn{min-height:44px}
}
</style>
<div class="game-app sdk sdk-app game-fill" data-sdk>
  <div class="sdk-hud">
    <span class="sdk-chip">TIME <b data-hud="time">0:00</b></span>
    <span class="sdk-chip"><i class="sdk-dot" data-el="dot"></i><b data-el="statustxt">Ready</b></span>
    <span class="sdk-chips" data-el="chips"></span>
    <span class="sdk-spacer"></span>
    <button class="sdk-btn" type="button" data-act="diff" data-el="diff" title="Cycle difficulty (starts a new puzzle)">Easy</button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-act="notestoggle" data-el="notesbtn" aria-label="Notes" title="Pencil mode (N)">${icon("pencil")}<span class="sdk-btn-label">Notes</span></button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-act="hint" data-el="hintbtn" aria-label="Hint" title="Hint (T)">${icon("lightbulb")}<span class="sdk-btn-label">Hint 3</span></button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${icon("helpCircle")}<span class="sdk-btn-label">Help</span></button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${icon("wrench")}<span class="sdk-btn-label">Cheats</span></button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-el="pauseicon">${icon("pause")}</span><span class="sdk-btn-label">Pause</span></button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${icon("refresh")}<span class="sdk-btn-label">Restart</span></button>
    <button class="sdk-btn sdk-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${icon("logOut")}<span class="sdk-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel sdk-board" data-board>
    <div class="sdk-gridboard" data-el="board" role="grid" aria-label="Sudoku board"></div>
    <div class="sdk-ov" data-ov="wait" hidden><div class="sdk-card"><div class="sdk-head"><h3>Connecting…</h3></div><div class="sdk-body"><p class="sdk-sub">Waiting for the host to set up the game.</p></div></div></div>
    <div class="sdk-ov" data-ov="lobby" hidden><div class="sdk-card" data-el="lobbycard"></div></div>
    <div class="sdk-ov" data-ov="over" hidden><div class="sdk-card" data-el="overcard"></div></div>
    <div class="sdk-ov sdk-ov-pause" data-ov="pause" hidden>
      <div class="sdk-card">
        <div class="sdk-head"><h3>Paused</h3><span class="sdk-tag">Sudoku</span></div>
        <div class="sdk-body"><p class="sdk-sub">The clock and the bot are frozen. Take your time.</p></div>
        <div class="sdk-foot"><span class="sdk-note">Press P or Esc to resume</span><button class="sdk-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="sdk-ov sdk-ov-top" data-ov="cheats" hidden><div class="sdk-card" data-el="cheatcard"></div></div>
    <div class="sdk-ov sdk-ov-top2" data-ov="help" hidden>
      <div class="sdk-card">
        <div class="sdk-head"><h3>How to play</h3><button class="sdk-btn" type="button" data-help-close>Close</button></div>
        <div class="sdk-help">
          <div>
            <h4>Goal</h4>
            <ul>
              <li>Fill the 9&times;9 grid so every row, column and 3&times;3 box contains the digits 1&ndash;9 exactly once.</li>
              <li>Given digits are locked. Every puzzle is generated fresh with <b>exactly one solution</b> (Easy ~40 givens, Medium ~32, Hard ~26).</li>
            </ul>
            <h4>Modes</h4>
            <ul>
              <li><b>Solo</b> &mdash; a wrong digit is not placed and costs a mistake; 3 mistakes ends the run. You get 3 hints. Best clean times are saved per difficulty.</li>
              <li><b>VS Bot / Room race</b> &mdash; one shared board, alternating turns. A correct digit scores that cell for you and locks it; a wrong digit costs a mistake. <b>Who starts and which player seat you get are randomized every round.</b></li>
            </ul>
          </div>
          <div>
            <h4>Desktop controls</h4>
            <ul>
              <li>Click a cell, then type <kbd>1</kbd>&ndash;<kbd>9</kbd> to place. <kbd>Shift</kbd>+digit adds a note in any mode.</li>
              <li><kbd>N</kbd> notes mode &middot; <kbd>&larr;&uarr;&darr;&rarr;</kbd> / <kbd>WASD</kbd> move &middot; <kbd>Backspace</kbd>/<kbd>0</kbd> erase notes.</li>
              <li><kbd>T</kbd> hint &middot; <kbd>H</kbd> help &middot; <kbd>C</kbd> cheats &middot; <kbd>P</kbd> pause &middot; <kbd>R</kbd> restart &middot; right-click toggles notes.</li>
            </ul>
            <h4>Mobile controls</h4>
            <ul>
              <li>Tap a cell, then tap the virtual number pad. Use <b>Notes</b>, <b>Erase</b>, <b>Hint</b> and the on-screen D-pad.</li>
            </ul>
            <h4>Hints &amp; cheats</h4>
            <ul>
              <li>A hint fills one random empty cell correctly (it uses your turn in a race).</li>
              <li>The <b>Cheats</b> menu can reveal the solution, fill cells, auto-write notes, reset mistakes, grant hints, force your turn or solve everything. Using any cheat flags the round and blocks best-time records.</li>
            </ul>
          </div>
        </div>
        <div class="sdk-foot"><span class="sdk-note">Press H to reopen this guide</span><button class="sdk-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
  <div class="sdk-pad">
    <div class="sdk-padmain">
      <div class="sdk-padkeys" data-el="pad"></div>
      <div class="sdk-sidrest">
        <div class="sdk-tools">
          <button class="sdk-btn sdk-tool" type="button" data-act="erase" data-el="erasebtn" title="Clear notes (Backspace)">Erase</button>
        </div>
        <div class="sdk-dpad">
          <span></span><button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="up" aria-label="Move up">&#9650;</button><span></span>
          <button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="left" aria-label="Move left">&#9664;</button><button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="down" aria-label="Move down">&#9660;</button><button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="right" aria-label="Move right">&#9654;</button>
        </div>
        <div class="sdk-legend" data-el="legend"></div>
      </div>
    </div>
  </div>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const els = {
        board: $('[data-el="board"]'),
        pad: $('[data-el="pad"]'),
        chips: $('[data-el="chips"]'),
        legend: $('[data-el="legend"]'),
        lobbycard: $('[data-el="lobbycard"]'),
        overcard: $('[data-el="overcard"]'),
        cheatcard: $('[data-el="cheatcard"]'),
        dot: $('[data-el="dot"]'),
        statustxt: $('[data-el="statustxt"]'),
        time: $('[data-hud="time"]'),
        diff: $('[data-el="diff"]'),
        restart: $('[data-restart]'),
        pausebtn: $('[data-pause]'),
        pauseicon: $('[data-el="pauseicon"]'),
        cheatbtn: $('[data-cheats]'),
        notesbtn: $('[data-el="notesbtn"]'),
        hintbtn: $('[data-el="hintbtn"]'),
        erasebtn: $('[data-el="erasebtn"]'),
        ovWait: $('[data-ov="wait"]'),
        ovLobby: $('[data-ov="lobby"]'),
        ovOver: $('[data-ov="over"]'),
        ovPause: $('[data-ov="pause"]'),
        ovCheats: $('[data-ov="cheats"]'),
        ovHelp: $('[data-ov="help"]'),
    };
    const dpadBtns = root.querySelectorAll('[data-act="move"]');

    /* ----- board + pad DOM (built once) ----- */
    const cells = [];
    const baseCls = [];
    for (let i = 0; i < 81; i++) {
        const r = ROW(i), c = COL(i);
        let cls = "sdk-cell";
        if (c === 3 || c === 6) cls += " sdk-bl";
        if (r === 3 || r === 6) cls += " sdk-bt";
        if (c === 8) cls += " sdk-nr";
        if (r === 8) cls += " sdk-nb";
        const el = document.createElement("div");
        el.className = cls;
        el.dataset.i = String(i);
        el.setAttribute("role", "gridcell");
        els.board.appendChild(el);
        cells.push(el);
        baseCls.push(cls);
    }
    const padKeys = [];
    for (let d = 1; d <= 9; d++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sdk-key";
        b.dataset.d = String(d);
        b.innerHTML = `<b>${d}</b><small>9</small>`;
        els.pad.appendChild(b);
        padKeys.push({ btn: b, small: b.querySelector("small") });
    }

    /* ----- small helpers ----- */
    function mySeat() {
        if (!online) return 0;
        if (!state) return playerIndex;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    function seatName(s) {
        if (!state || state.opp === "none") return "You";
        if (s === mySeat()) return "You";
        return online ? "Opponent" : "Bot";
    }
    function elapsed() {
        if (!state || !state.startedAt) return 0;
        const end = state.endedAt || (paused && pauseStart ? pauseStart : Date.now());
        return Math.max(0, Math.floor((end - state.startedAt) / 1000));
    }
    function emptyCells() {
        const a = [];
        for (let i = 0; i < 81; i++) if (!state.grid[i]) a.push(i);
        return a;
    }
    function complete() {
        for (let i = 0; i < 81; i++) if (!state.grid[i]) return false;
        return true;
    }
    function nudge(msg) {
        toast = msg;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast = "";
            if (!destroyed) render();
        }, 1500);
        render();
    }
    function addFx(set, i, ms) {
        set.add(i);
        const t = setTimeout(() => {
            set.delete(i);
            const idx = fxTimers.indexOf(t);
            if (idx >= 0) fxTimers.splice(idx, 1);
            if (!destroyed && cells[i])
                cells[i].classList.remove(set === flashSet ? "sdk-flash" : "sdk-pop");
        }, ms);
        fxTimers.push(t);
    }

    /* ----- state factory ----- */
    function makeLobby(diff, opp) {
        return {
            v: 1, phase: "lobby", difficulty: diff, opp: opp,
            puzzle: new Array(81).fill(0), solution: new Array(81).fill(0),
            grid: new Array(81).fill(0), owner: new Array(81).fill(-1),
            hinted: new Array(81).fill(0),
            scores: [0, 0], mistakes: [0, 0], hints: [3, 3],
            turn: 0, first: 0,
            hostSeat: online ? ((Math.random() < 0.5) ? 0 : 1) : 0,
            winner: null, endKind: "", cheated: false,
            startedAt: null, endedAt: null, lastEvent: null,
        };
    }
    function newRound() {
        const gen = generate(state.difficulty);
        const first = (Math.random() < 0.5) ? 0 : 1;   // random first move
        state = {
            v: 1, phase: "playing", difficulty: state.difficulty, opp: state.opp,
            puzzle: gen.puzzle, solution: gen.solution, grid: gen.puzzle.slice(),
            owner: new Array(81).fill(-1), hinted: new Array(81).fill(0),
            scores: [0, 0], mistakes: [0, 0], hints: [3, 3],
            turn: first, first: first,
            hostSeat: online ? ((Math.random() < 0.5) ? 0 : 1) : 0, // random seats
            winner: null, endKind: "", cheated: false,
            startedAt: Date.now(), endedAt: null, lastEvent: null,
        };
    }
    function fill(i, actor, isHint) {
        state.grid[i] = state.solution[i];
        state.owner[i] = actor;
        state.hinted[i] = isHint ? 1 : 0;
        state.scores[actor] += 1;
    }
    function evt(type, i, actor) {
        state.lastEvent = { type: type, i: i, actor: actor, n: (state.lastEvent ? state.lastEvent.n : 0) + 1 };
    }
    function finish(kind, elimLoser) {
        state.phase = "over";
        state.endedAt = Date.now();
        state.endKind = kind;
        if (kind === "elim") {
            state.winner = state.opp === "none" ? -1 : 1 - elimLoser;
        } else if (state.opp === "none") {
            state.winner = 0;
        } else {
            const a = state.scores[0], b = state.scores[1];
            state.winner = a === b ? -1 : (a > b ? 0 : 1);
        }
        if (!online && state.opp === "none" && state.winner === 0 && !state.cheated) {
            saveBest(state.difficulty, elapsed());
        }
    }

    /* ----- canonical state transitions (host / local only) ----- */
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action.type !== "string") return;
        if (actor !== 0 && actor !== 1) return;
        const versus = state.opp !== "none";
        switch (action.type) {
            case "start":
                if (state.phase !== "lobby") return;
                newRound();
                break;
            case "rematch":
                if (state.phase === "lobby") return;
                newRound();
                break;
            case "difficulty":
                if (!TARGETS[action.value]) return;
                state.difficulty = action.value;
                if (state.phase !== "lobby") newRound();
                break;
            case "mode":
                if (online || state.phase !== "lobby") return;
                if (action.value !== "bot" && action.value !== "none") return;
                state.opp = action.value;
                break;
            case "lobby":
                state = makeLobby(state.difficulty, state.opp);
                break;
            case "place": {
                if (state.phase !== "playing") return;
                const i = action.i | 0, d = action.d | 0;
                if (i < 0 || i > 80 || d < 1 || d > 9) return;
                if (state.puzzle[i] || state.grid[i]) return;
                if (versus && state.turn !== actor) return;
                if (d === state.solution[i]) {
                    fill(i, actor, false);
                    evt("place", i, actor);
                    if (complete()) finish("complete");
                    else if (versus) state.turn = 1 - state.turn;
                } else {
                    state.mistakes[actor] += 1;
                    evt("miss", i, actor);
                    if (state.mistakes[actor] >= 3) finish("elim", actor);
                    else if (versus) state.turn = 1 - state.turn;
                }
                break;
            }
            case "hint": {
                if (state.phase !== "playing" || state.hints[actor] <= 0) return;
                if (versus && state.turn !== actor) return;
                const empt = emptyCells();
                if (!empt.length) return;
                const i = empt[(Math.random() * empt.length) | 0];
                fill(i, actor, true);
                state.hints[actor] -= 1;
                evt("hint", i, actor);
                if (complete()) finish("complete");
                else if (versus) state.turn = 1 - state.turn;
                break;
            }
            case "cheat": {
                if (state.phase !== "playing") return;
                const c = action.cheat;
                if (c === "cell") {
                    const i = action.i | 0;
                    if (i < 0 || i > 80 || state.grid[i]) return;
                    state.cheated = true;
                    fill(i, actor, false);
                    evt("cheat", i, actor);
                    if (complete()) finish("complete");
                } else if (c === "five") {
                    state.cheated = true;
                    shuffle(emptyCells()).slice(0, 5).forEach((i) => fill(i, actor, false));
                    if (complete()) finish("complete");
                } else if (c === "mistakes") {
                    state.cheated = true;
                    state.mistakes[actor] = 0;
                } else if (c === "hints") {
                    state.cheated = true;
                    state.hints[actor] = Math.min(9, state.hints[actor] + 3);
                } else if (c === "turn") {
                    if (!versus) return;
                    state.cheated = true;
                    state.turn = actor;
                } else if (c === "solve") {
                    state.cheated = true;
                    emptyCells().forEach((i) => fill(i, actor, false));
                    finish("complete");
                } else if (c === "flag") {
                    state.cheated = true;
                } else {
                    return;
                }
                break;
            }
            default:
                return;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction?.(action)?.catch?.(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    function publish() {
        if (destroyed) return;
        render();
        // Only the host writes canonical state to Firebase.
        if (online && room.isHost && state)
            room.publishState?.(state)?.catch?.(console.warn);
        if (!online) scheduleBot();
    }

    /* ----- local bot (AI mode only) ----- */
    const BOT_ACC = { easy: 0.86, medium: 0.93, hard: 0.97 };
    function scheduleBot() {
        clearTimeout(botTimer);
        botTimer = null;
        if (destroyed || online || !state) return;
        if (blocked()) return;
        if (state.phase === "playing" && state.opp === "bot" && state.turn === 1) {
            botTimer = setTimeout(botMove, 700 + Math.random() * 900);
        }
    }
    function botMove() {
        botTimer = null;
        if (destroyed || !state || state.phase !== "playing") return;
        if (blocked() || state.opp !== "bot" || state.turn !== 1) return;
        const empt = emptyCells();
        if (!empt.length) return;
        // look smart: prefer cells with fewest candidates (MRV), random tie-break
        let best = [], bestN = 10;
        for (let k = 0; k < empt.length; k++) {
            const i = empt[k];
            const n = popcount(candMask(state.grid, i));
            if (n < bestN) { bestN = n; best = [i]; }
            else if (n === bestN) best.push(i);
        }
        const i = best[(Math.random() * best.length) | 0];
        const right = state.solution[i];
        let d = right;
        if (Math.random() > (BOT_ACC[state.difficulty] || 0.9)) {
            const wrong = [];
            const m = candMask(state.grid, i) & ~(1 << right);
            for (let x = 1; x <= 9; x++) if (m & (1 << x)) wrong.push(x);
            if (wrong.length) d = wrong[(Math.random() * wrong.length) | 0];
            else {
                const alt = [];
                for (let x = 1; x <= 9; x++) if (x !== right) alt.push(x);
                d = alt[(Math.random() * alt.length) | 0];
            }
        }
        applyAction({ type: "place", i: i, d: d }, 1);
    }

    /* ----- pause: freeze clock + bot, shift time anchors on resume ----- */
    function setPaused(on) {
        if (destroyed || paused === on) return;
        if (on) {
            pauseStart = Date.now();
            paused = true;
            clearTimeout(botTimer);
            botTimer = null;
        } else {
            const delta = Date.now() - pauseStart;
            if (state && (!online || room.isHost)) {
                if (state.startedAt) {
                    state.startedAt += delta;
                    lastRound = state.startedAt; // do not re-trigger round reset
                }
                if (state.endedAt) state.endedAt += delta;
            }
            paused = false;
            pauseStart = 0;
            if (online && room.isHost) publish();
            else scheduleBot();
        }
        render();
    }
    function togglePause() {
        if (showHelp) toggleHelp(false);
        else if (showCheats) toggleCheats(false);
        else setPaused(!paused);
    }
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !showHelp;
        showHelp = next;
        if (showHelp) {
            showCheats = false;
            if (paused) setPaused(false);
        } else scheduleBot();
        render();
    }
    function toggleCheats(on) {
        if (!state || state.phase !== "playing") return;
        const next = typeof on === "boolean" ? on : !showCheats;
        showCheats = next;
        if (showCheats) {
            showHelp = false;
            if (paused) setPaused(false);
        } else scheduleBot();
        render();
    }
    function doRestart() {
        if (!state) return;
        if (paused) setPaused(false);
        submitAction({ type: state.phase === "lobby" ? "start" : "rematch" });
    }

    /* ----- local sync: notes pruning, round resets, event FX ----- */
    function syncLocal() {
        if (!state) return;
        if (state.startedAt !== lastRound) {
            lastRound = state.startedAt;
            notes = new Array(81).fill(0);
            selected = -1;
            reveal = false;
            notesMode = false;
            lastEvt = state.lastEvent ? state.lastEvent.n : 0;
            gridCache = state.grid.slice();
            flashSet.clear();
            popSet.clear();
            if (state.phase === "playing" && state.opp !== "none") {
                const my = mySeat();
                toast = seatName(state.first) + (state.first === my ? " start" : " starts") +
                    " first" + (online ? " · you are P" + (my + 1) : "");
                clearTimeout(toastTimer);
                toastTimer = setTimeout(() => { toast = ""; if (!destroyed) render(); }, 2400);
            }
        } else {
            for (let i = 0; i < 81; i++) {
                if (state.grid[i] && !gridCache[i]) {
                    notes[i] = 0;
                    const keep = ~(1 << state.grid[i]);
                    eachPeer(i, (j) => { notes[j] &= keep; });
                }
            }
            gridCache = state.grid.slice();
            const ev = state.lastEvent;
            if (ev && ev.n !== lastEvt) {
                lastEvt = ev.n;
                if (ev.type === "miss") {
                    addFx(flashSet, ev.i, 520);
                    toast = seatName(ev.actor) + " missed (" + state.mistakes[ev.actor] + "/3)";
                    clearTimeout(toastTimer);
                    toastTimer = setTimeout(() => { toast = ""; if (!destroyed) render(); }, 1500);
                } else {
                    addFx(popSet, ev.i, 260);
                }
            }
        }
    }

    /* ----- render helpers ----- */
    function chip(label, val, dotColor) {
        return '<span class="sdk-chip">' +
            (dotColor ? '<span class="sdk-dot" style="background:' + dotColor + '"></span>' : "") +
            label + " <b>" + val + "</b></span>";
    }
    function notesHTML(mask) {
        let h = '<span class="sdk-notes">';
        for (let d = 1; d <= 9; d++) h += "<i>" + ((mask & (1 << d)) ? d : "") + "</i>";
        return h + "</span>";
    }
    function statusInfo() {
        if (!state) return { t: "Connecting…", c: "#94a3b8" };
        if (state.phase === "lobby") return { t: "Ready — pick settings", c: "#94a3b8" };
        if (state.phase === "over") {
            const w = state.winner;
            if (state.opp === "none")
                return w === 0 ? { t: "Solved!", c: "#22c55e" } : { t: "Game over", c: "#ef4444" };
            if (w === -1) return { t: "Draw", c: "#94a3b8" };
            return w === mySeat() ? { t: "You win!", c: "#22c55e" } : { t: "You lose", c: "#ef4444" };
        }
        if (paused) return { t: "Paused", c: "#f59e0b" };
        if (state.opp === "none") return { t: "Your move", c: "#22c55e" };
        return state.turn === mySeat()
            ? { t: "Your turn", c: "#22c55e" }
            : { t: online ? "Opponent's turn" : "Bot is thinking…", c: "#f59e0b" };
    }
    function lobbyHTML() {
        const versus = state.opp !== "none";
        const my = mySeat();
        const best = loadBest()[state.difficulty];
        let h = '<div class="sdk-head"><h3>Sudoku</h3><span class="sdk-tag">' + (versus ? "Race" : "Solo") + "</span></div>";
        h += '<div class="sdk-body">';
        h += '<p class="sdk-sub">' + (versus
            ? "Turn-based race on one shared board: a correct digit scores that cell for you, a wrong digit costs a mistake (3 = lose). Most cells wins. First turn and player seats are randomized every round."
            : "A wrong digit is not placed and costs a mistake — three mistakes ends the run. You get 3 hints. Every puzzle has exactly one solution.") + "</p>";
        h += '<div class="sdk-seg">' + ["easy", "medium", "hard"].map((d) =>
            '<button class="sdk-btn' + (state.difficulty === d ? " active" : "") +
            '" type="button" data-act="setdiff" data-diff="' + d + '">' + cap(d) + "</button>").join("") + "</div>";
        if (!online) {
            h += '<div class="sdk-seg">' +
                '<button class="sdk-btn' + (state.opp === "none" ? " active" : "") + '" type="button" data-act="mode" data-mode="none">Solo</button>' +
                '<button class="sdk-btn' + (state.opp === "bot" ? " active" : "") + '" type="button" data-act="mode" data-mode="bot">VS Bot</button></div>';
        } else {
            h += '<p class="sdk-sub">' + esc(playerName) + ' — you are <b style="color:' + SEAT_COLORS[my] + '">Player ' + (my + 1) + "</b> this round.</p>";
        }
        if (!versus)
            h += '<p class="sdk-sub">Best clean time (' + cap(state.difficulty) + "): <b>" + (best ? fmt(best) : "—") + "</b></p>";
        h += "</div>";
        h += '<div class="sdk-foot"><span class="sdk-note">Press Enter to start</span><button class="sdk-btn primary sdk-big" type="button" data-act="start">Start game</button></div>';
        return h;
    }
    function overHTML() {
        const st = state, versus = st.opp !== "none", my = mySeat();
        const w = st.winner, time = fmt(elapsed());
        let title, color, reason;
        if (!versus) {
            title = w === 0 ? "Solved!" : "Out of mistakes";
            color = w === 0 ? "#059669" : "#dc2626";
            reason = w === 0
                ? "All 81 cells correct in " + time + " on " + cap(st.difficulty) + "."
                : "Three wrong digits — run ended at " + time + ".";
        } else if (st.endKind === "elim") {
            title = w === my ? "You win!" : "You lose";
            color = w === my ? "#059669" : "#dc2626";
            reason = seatName(1 - w) + " hit 3 mistakes. " + seatName(w) + " takes the round.";
        } else if (w === -1) {
            title = "Draw"; color = "#64748b";
            reason = "Even split " + st.scores[0] + "–" + st.scores[1] + " in " + time + ".";
        } else {
            title = w === my ? "You win!" : "You lose";
            color = w === my ? "#059669" : "#dc2626";
            reason = seatName(w) + " filled " + st.scores[w] + " cells vs " + st.scores[1 - w] + " in " + time + ".";
        }
        let h = '<div class="sdk-head"><h3 style="color:' + color + '">' + title + "</h3><span class=\"sdk-tag\">" + cap(st.difficulty) + "</span></div>";
        h += '<div class="sdk-body"><p class="sdk-sub">' + reason + "</p>";
        if (st.cheated) h += '<span class="sdk-badge">Cheats used — no record saved</span>';
        h += '<div class="sdk-stats">' + chip("Time", time);
        if (versus) {
            h += chip("You", st.scores[my], SEAT_COLORS[my]);
            h += chip(seatName(1 - my), st.scores[1 - my], SEAT_COLORS[1 - my]);
            h += chip("Miss", st.mistakes[my] + "/3");
        } else {
            h += chip("Miss", st.mistakes[0] + "/3");
            h += chip("Hints left", st.hints[0]);
        }
        h += "</div></div>";
        h += '<div class="sdk-foot"><button class="sdk-btn primary" type="button" data-act="again">Play again</button>' +
            '<button class="sdk-btn" type="button" data-act="settings">Settings</button></div>';
        return h;
    }
    function cheatHTML() {
        const versus = state.opp !== "none";
        const cellOk = selected >= 0 && !state.grid[selected];
        const item = (key, label, sub, dis) =>
            '<button class="sdk-btn sdk-cheat" type="button" data-act="cheat" data-cheat="' + key + '"' +
            (dis ? " disabled" : "") + "><span>" + label + "</span><small>" + sub + "</small></button>";
        let h = '<div class="sdk-head"><h3>Cheats</h3><button class="sdk-btn" type="button" data-act="closecheats">Close</button></div>';
        h += '<div class="sdk-body"><p class="sdk-sub">Fun-only helpers. Using any cheat flags this round and blocks best-time records.</p></div>';
        h += '<div class="sdk-cheats">';
        h += item("reveal", "◉ Reveal solution — " + (reveal ? "ON" : "OFF"), "Ghost digits on empty cells (private to you).");
        h += item("cell", "✎ Fill selected cell", "Places the correct digit for free.", !cellOk);
        h += item("five", "⚄ Fill 5 random cells", "Five correct cells credited to you.");
        h += item("notes", "✐ Auto notes", "Write every possible candidate in all empty cells.");
        h += item("mistakes", "♥ Reset my mistakes", "Back to 0/3.");
        h += item("hints", "✦ +3 hints", "Top up your hint budget.");
        if (versus) h += item("turn", "⏭ Force my turn", "Steal the move from your rival.");
        h += item("solve", "⚑ Solve everything", "Fill the whole board and win instantly.");
        h += "</div>";
        h += '<div class="sdk-foot"><span class="sdk-note">Press Esc to close</span><button class="sdk-btn" type="button" data-act="closecheats">Close</button></div>';
        return h;
    }

    function render() {
        if (destroyed) return;
        syncLocal();
        const st = state;
        const playing = !!st && st.phase === "playing";
        const versus = !!st && st.opp !== "none";
        const my = mySeat();
        const grid = st ? st.grid : ZERO;
        const pz = st ? st.puzzle : ZERO;
        const hd = st ? st.hinted : ZERO;
        const ow = st ? st.owner : ZERO;
        const sol = st ? st.solution : ZERO;
        const selVal = selected >= 0 ? grid[selected] : 0;
        const sr = selected >= 0 ? ROW(selected) : -1;
        const sc = selected >= 0 ? COL(selected) : -1;
        const sb = selected >= 0 ? BOX(selected) : -1;

        /* board */
        for (let i = 0; i < 81; i++) {
            const el = cells[i];
            const v = grid[i];
            let cls = baseCls[i];
            if (pz[i]) cls += " sdk-given";
            else if (v) {
                if (hd[i]) cls += " sdk-hintv";
                else if (ow[i] === 1) cls += " sdk-p1";
            }
            if (i === selected) cls += " sdk-sel";
            else if (selected >= 0 && (ROW(i) === sr || COL(i) === sc || BOX(i) === sb)) cls += " sdk-peer";
            if (v && selVal && v === selVal && i !== selected) cls += " sdk-same";
            if (reveal && !v && sol[i]) cls += " sdk-ghost";
            if (flashSet.has(i)) cls += " sdk-flash";
            if (popSet.has(i)) cls += " sdk-pop";
            el.className = cls;
            if (v) el.textContent = String(v);
            else if (reveal && sol[i]) el.textContent = String(sol[i]);
            else if (notes[i]) el.innerHTML = notesHTML(notes[i]);
            else if (el.innerHTML !== "") el.innerHTML = "";
        }

        /* pad: remaining counts; in notes mode dim impossible digits */
        const counts = new Array(10).fill(0);
        for (let i = 0; i < 81; i++) counts[grid[i]]++;
        const cand = selected >= 0 ? candMask(grid, selected) : 0;
        for (let d = 1; d <= 9; d++) {
            const left = 9 - counts[d];
            const k = padKeys[d - 1];
            k.small.textContent = String(left);
            let dis = !playing || blocked();
            if (playing && !blocked()) dis = notesMode ? (selected >= 0 && !(cand & (1 << d))) : left <= 0;
            k.btn.disabled = dis;
        }

        /* HUD chips (all info lives in the HUD bar) */
        let chips = "";
        if (st && versus) {
            chips += chip("You · P" + (my + 1), st.scores[my], SEAT_COLORS[my]);
            chips += chip(seatName(1 - my) + " · P" + (2 - my), st.scores[1 - my], SEAT_COLORS[1 - my]);
            chips += chip("Miss", st.mistakes[my] + "/3");
            chips += chip("Hints", st.hints[my]);
        } else if (st) {
            const best = loadBest()[st.difficulty];
            chips += chip("Miss", st.mistakes[0] + "/3");
            chips += chip("Hints", st.hints[0]);
            chips += chip("Best", best ? fmt(best) : "—", null).replace('class="sdk-chip"', 'class="sdk-chip" data-hud="best"');
        }
        els.chips.innerHTML = chips;
        els.time.textContent = fmt(elapsed());

        /* status */
        const si = statusInfo();
        els.statustxt.textContent = toast || si.t;
        els.dot.style.background = si.c;

        /* HUD controls: update labels, never button.textContent */
        els.diff.textContent = cap(st ? st.difficulty : "easy");
        els.diff.disabled = !st || blocked();
        els.erasebtn.disabled = !playing || blocked();
        els.notesbtn.disabled = !playing || blocked();
        els.notesbtn.classList.toggle("active", notesMode);
        els.notesbtn.setAttribute("aria-pressed", String(notesMode));
        els.notesbtn.setAttribute("aria-label", notesMode ? "Notes on" : "Notes off");
        const hintLabel = els.hintbtn.querySelector(".sdk-btn-label");
        if (hintLabel) hintLabel.textContent = "Hint " + (st ? st.hints[my] : 3);
        els.hintbtn.setAttribute("aria-label", "Hint " + (st ? st.hints[my] : 3));
        els.hintbtn.disabled = !playing || blocked() || st.hints[my] <= 0 || (versus && st.turn !== my);
        els.cheatbtn.disabled = !playing;
        const restartLabel = els.restart.querySelector(".sdk-btn-label");
        if (restartLabel) restartLabel.textContent = !st ? "Restart" : st.phase === "over" ? "Play again" : st.phase === "lobby" ? "Start" : "Restart";
        els.restart.setAttribute("aria-label", restartLabel ? restartLabel.textContent : "Restart");
        const pauseLabel = els.pausebtn.querySelector(".sdk-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        els.pausebtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        els.pausebtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        els.pauseicon.innerHTML = icon(paused ? "play" : "pause");
        els.pausebtn.disabled = !playing;
        dpadBtns.forEach((b) => { b.disabled = !playing || blocked(); });

        /* legend */
        let leg = '<span><span class="sdk-dot" style="background:#0f172a"></span>Given</span>' +
            '<span><span class="sdk-dot" style="background:' + SEAT_COLORS[versus ? my : 0] + '"></span>You</span>' +
            '<span><span class="sdk-dot" style="background:#059669"></span>Hint</span>';
        if (versus)
            leg += '<span><span class="sdk-dot" style="background:' + SEAT_COLORS[1 - my] + '"></span>' + seatName(1 - my) + "</span>";
        els.legend.innerHTML = leg;

        /* overlays: help → cheats → pause → phase, all mutually suppressing */
        if (showCheats && !playing) showCheats = false;
        els.ovWait.hidden = !(online && !st) || showCheats || showHelp || paused;
        els.ovLobby.hidden = !(st && st.phase === "lobby") || showCheats || showHelp || paused;
        els.ovOver.hidden = !(st && st.phase === "over") || showCheats || showHelp || paused;
        els.ovPause.hidden = !paused || showCheats || showHelp;
        els.ovCheats.hidden = !showCheats || showHelp;
        els.ovHelp.hidden = !showHelp;
        if (!els.ovLobby.hidden) els.lobbycard.innerHTML = lobbyHTML();
        if (!els.ovOver.hidden) els.overcard.innerHTML = overHTML();
        if (showCheats) els.cheatcard.innerHTML = cheatHTML();
    }

    /* ----- player input ----- */
    function selectCell(i) {
        if (blocked() || !state || state.phase !== "playing") return;
        selected = i;
        render();
    }
    function placeDigit(d) {
        if (blocked() || !state || state.phase !== "playing" || selected < 0) return;
        const i = selected;
        if (state.puzzle[i] || state.grid[i]) { nudge("That cell is locked"); return; }
        if (state.opp !== "none" && state.turn !== mySeat()) { nudge("Wait for your turn"); return; }
        submitAction({ type: "place", i: i, d: d });
    }
    function toggleNote(i, d) {
        if (blocked() || !state || state.phase !== "playing" || i < 0) return;
        if (state.puzzle[i] || state.grid[i]) { nudge("That cell is filled"); return; }
        if (!(candMask(state.grid, i) & (1 << d))) { nudge(d + " is not possible here"); return; }
        notes[i] ^= 1 << d;
        render();
    }
    function padPress(d) {
        if (blocked() || !state || state.phase !== "playing") return;
        if (selected < 0) { nudge("Select a cell first"); return; }
        if (notesMode) toggleNote(selected, d);
        else placeDigit(d);
    }
    function eraseNotes() {
        if (blocked() || !state || state.phase !== "playing" || selected < 0) return;
        if (notes[selected]) { notes[selected] = 0; render(); }
        else if (state.grid[selected] && !state.puzzle[selected]) nudge("Correct digits are locked");
    }
    function moveSel(dir) {
        if (blocked() || !state || state.phase !== "playing") return;
        let r = selected >= 0 ? ROW(selected) : 4;
        let c = selected >= 0 ? COL(selected) : 4;
        if (dir === "left") c = Math.max(0, c - 1);
        else if (dir === "right") c = Math.min(8, c + 1);
        else if (dir === "up") r = Math.max(0, r - 1);
        else if (dir === "down") r = Math.min(8, r + 1);
        selected = r * 9 + c;
        render();
    }
    function fillAllNotes() {
        for (let i = 0; i < 81; i++)
            if (!state.grid[i]) notes[i] = candMask(state.grid, i);
    }
    function doCheat(kind) {
        if (blocked() || !state || state.phase !== "playing") return;
        if (kind === "reveal") {
            reveal = !reveal;
            if (reveal) submitAction({ type: "cheat", cheat: "flag" });
            render();
            return;
        }
        if (kind === "notes") {
            fillAllNotes();
            submitAction({ type: "cheat", cheat: "flag" });
            render();
            return;
        }
        if (kind === "cell") {
            if (selected < 0 || state.grid[selected]) { nudge("Select an empty cell first"); return; }
            submitAction({ type: "cheat", cheat: "cell", i: selected });
            return;
        }
        submitAction({ type: "cheat", cheat: kind });
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        if (t.closest("[data-restart]")) { doRestart(); return; }
        const cell = t.closest("[data-i]");
        if (cell) { selectCell(Number(cell.dataset.i)); return; }
        const key = t.closest("[data-d]");
        if (key) { padPress(Number(key.dataset.d)); return; }
        const actEl = t.closest("[data-act]");
        if (!actEl) return;
        switch (actEl.dataset.act) {
            case "help": toggleHelp(true); break;
            case "closehelp": toggleHelp(false); break;
            case "cheats": toggleCheats(); break;
            case "closecheats": toggleCheats(false); break;
            case "restart": doRestart(); break;
            case "diff": {
                if (!state || blocked()) break;
                const next = state.difficulty === "easy" ? "medium" : state.difficulty === "medium" ? "hard" : "easy";
                submitAction({ type: "difficulty", value: next });
                break;
            }
            case "start": if (!blocked()) submitAction({ type: "start" }); break;
            case "again": if (!blocked()) submitAction({ type: "rematch" }); break;
            case "settings": if (!blocked()) submitAction({ type: "lobby" }); break;
            case "setdiff": if (!blocked()) submitAction({ type: "difficulty", value: actEl.dataset.diff }); break;
            case "mode": if (!blocked()) submitAction({ type: "mode", value: actEl.dataset.mode }); break;
            case "erase": eraseNotes(); break;
            case "notestoggle": if (!blocked()) { notesMode = !notesMode; render(); } break;
            case "hint": if (!blocked()) submitAction({ type: "hint" }); break;
            case "move": moveSel(actEl.dataset.dir); break;
            case "cheat": doCheat(actEl.dataset.cheat); break;
        }
    }

    const DIRS = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down",
        A: "left", D: "right", W: "up", S: "down",
    };
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        const tag = e.target && e.target.tagName;
        if ((tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && root.contains(e.target)) return;
        const k = e.key;
        /* keyboard priority: help → cheats → pause → Escape → game actions */
        if (k === "h" || k === "H" || k === "?" || k === "F1") { e.preventDefault(); toggleHelp(); return; }
        if (k === "c" || k === "C") { e.preventDefault(); toggleCheats(); return; }
        if (k === "p" || k === "P") { e.preventDefault(); togglePause(); return; }
        if (k === "r" || k === "R") { e.preventDefault(); doRestart(); return; }
        if (k === "Escape") {
            if (showHelp) toggleHelp(false);
            else if (showCheats) toggleCheats(false);
            else if (paused) setPaused(false);
            e.preventDefault();
            return;
        }
        if (blocked()) {
            if (k === "Enter") {
                if (showHelp) toggleHelp(false);
                else if (showCheats) toggleCheats(false);
                else if (paused) setPaused(false);
                e.preventDefault();
            }
            return;
        }
        if (k === "Enter") {
            if (state && state.phase === "lobby") submitAction({ type: "start" });
            else if (state && state.phase === "over") submitAction({ type: "rematch" });
            return;
        }
        if (!state || state.phase !== "playing") return;
        if (k === "n" || k === "N" || k === " ") {
            e.preventDefault();
            notesMode = !notesMode;
            render();
            return;
        }
        if (k === "t" || k === "T") { submitAction({ type: "hint" }); return; }
        if (DIRS[k]) { e.preventDefault(); moveSel(DIRS[k]); return; }
        // digits: also read e.code so Shift+digit works on every layout
        let num = 0;
        if (k.length === 1 && k >= "1" && k <= "9") num = Number(k);
        else if (e.code && e.code.startsWith("Digit")) num = Number(e.code.slice(5)) || 0;
        else if (e.code && e.code.startsWith("Numpad") && e.code.length === 7) num = Number(e.code.slice(6)) || 0;
        if (num >= 1 && num <= 9) {
            e.preventDefault();
            if (selected < 0) { nudge("Select a cell first"); return; }
            if (e.shiftKey || notesMode) toggleNote(selected, num);
            else placeDigit(num);
            return;
        }
        if (k === "Backspace" || k === "Delete" || k === "0") {
            e.preventDefault();
            eraseNotes();
        }
    }
    function onCtx(e) {
        e.preventDefault();
        if (!blocked() && state && state.phase === "playing") { notesMode = !notesMode; render(); }
    }

    /* ----- wiring ----- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    els.board.addEventListener("contextmenu", onCtx);
    tickTimer = setInterval(() => {
        if (!destroyed && state && state.phase === "playing" && !paused)
            els.time.textContent = fmt(elapsed());
    }, 500);

    /* ----- first-run internal help (once per browser) ----- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        showHelp = true;
        try { localStorage.setItem(HELP_KEY, "1"); } catch (_) { /* storage blocked */ }
    }

    if (online) {
        const offRoom = room.onRoom?.((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            state = makeLobby("easy", "human");
            publish();
            // guest acts with the guest seat (seats are randomized per round)
            const offAct = room.onAction?.((action) => applyAction(action, 1 - (state ? state.hostSeat : 0)));
            if (typeof offAct === "function") unsubs.push(offAct);
        } else {
            const offState = room.onState?.((nextState) => {
                if (destroyed) return;
                state = nextState;
                render();
            });
            if (typeof offState === "function") unsubs.push(offState);
            render();
        }
    } else {
        state = makeLobby("easy", "none");
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            els.board.removeEventListener("contextmenu", onCtx);
            clearInterval(tickTimer);
            clearTimeout(botTimer);
            clearTimeout(toastTimer);
            fxTimers.forEach(clearTimeout);
            unsubs.forEach((fn) => { try { fn(); } catch { } });
        },
    };
}
