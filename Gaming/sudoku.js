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
    const ZERO = new Array(81).fill(0);
    let notes = new Array(81).fill(0);   // pencil bitmask per cell (private)
    let notesMode = false;
    let reveal = false;                  // cheat: ghost solution (private)
    let selected = -1;
    let showHelp = false;
    let showCheats = false;
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

    /* ----- skeleton (minimalist light theme, scoped under .sdk) ----- */
    root.innerHTML = `
<style>
.sdk{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--box:#94a3b8;--soft:#f8fafc;--blue:#2563eb;--blue-bg:#dbeafe;--amber:#d97706;--green:#059669;--red:#dc2626;color:var(--ink);font-variant-numeric:tabular-nums}
.sdk [hidden]{display:none!important}
.sdk .sdk-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:2px 0 12px}
.sdk .sdk-chips{display:inline-flex;gap:8px;flex-wrap:wrap}
.sdk .sdk-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--soft);font-size:12.5px;color:var(--mut);white-space:nowrap}
.sdk .sdk-chip b{color:var(--ink);font-weight:700}
.sdk .sdk-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.sdk .sdk-spacer{flex:1}
.sdk .sdk-btn{padding:7px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;touch-action:manipulation;transition:background .12s,border-color .12s}
.sdk .sdk-btn:hover:not(:disabled){background:var(--soft);border-color:var(--box)}
.sdk .sdk-btn:disabled{opacity:.4;cursor:default}
.sdk .sdk-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.sdk .sdk-btn.primary:hover:not(:disabled){background:#1e293b}
.sdk .sdk-btn.active{background:var(--blue-bg);border-color:var(--blue);color:var(--blue)}
.sdk .sdk-big{padding:10px 22px;font-size:14px}
.sdk .sdk-stage{position:relative;display:flex;gap:18px;align-items:flex-start;justify-content:center;flex-wrap:wrap;padding:2px 0}
.sdk .sdk-board{display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(9,1fr);width:min(92vw,432px);aspect-ratio:1;background:#fff;border:2px solid #334155;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);user-select:none;touch-action:manipulation}
.sdk .sdk-cell{display:flex;align-items:center;justify-content:center;font-size:clamp(15px,4.6vw,22px);font-weight:600;color:var(--blue);cursor:pointer;background:#fff;border-right:1px solid var(--line);border-bottom:1px solid var(--line);transition:background .12s}
.sdk .sdk-cell:hover{background:#f1f5f9}
.sdk .sdk-nr{border-right:none}
.sdk .sdk-nb{border-bottom:none}
.sdk .sdk-bl{border-left:2px solid var(--box)}
.sdk .sdk-bt{border-top:2px solid var(--box)}
.sdk .sdk-given{color:var(--ink);font-weight:800;background:var(--soft)}
.sdk .sdk-p1{color:var(--amber)}
.sdk .sdk-hintv{color:var(--green)}
.sdk .sdk-peer{background:#f1f5f9}
.sdk .sdk-same{background:var(--blue-bg);font-weight:800}
.sdk .sdk-sel{background:var(--blue-bg);box-shadow:inset 0 0 0 2px var(--blue)}
.sdk .sdk-ghost{color:#94a3b8;font-weight:500;font-style:italic}
.sdk .sdk-notes{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);width:100%;height:100%;padding:2px;box-sizing:border-box}
.sdk .sdk-notes i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:clamp(6px,1.7vw,9.5px);font-weight:600;color:var(--mut);line-height:1}
.sdk .sdk-flash{animation:sdk-fl .5s}
.sdk .sdk-pop{animation:sdk-pop .25s}
@keyframes sdk-fl{0%,100%{background:#fee2e2}50%{background:#fecaca}}
@keyframes sdk-pop{0%{transform:scale(1.16)}100%{transform:scale(1)}}
.sdk .sdk-side{display:flex;flex-direction:column;gap:10px;width:176px}
.sdk .sdk-sidrest{display:flex;flex-direction:column;gap:10px}
.sdk .sdk-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.sdk .sdk-key{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;height:46px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;font-family:inherit;touch-action:manipulation}
.sdk .sdk-key b{font-size:19px;font-weight:700;color:var(--ink)}
.sdk .sdk-key small{font-size:9.5px;color:var(--mut);line-height:1}
.sdk .sdk-key:hover:not(:disabled){background:var(--soft);border-color:var(--box)}
.sdk .sdk-key:disabled{opacity:.3;cursor:default}
.sdk .sdk-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.sdk .sdk-tool{height:40px;padding:0 4px;font-size:11.5px}
.sdk .sdk-dpad{display:grid;grid-template-columns:repeat(3,36px);grid-template-rows:repeat(2,30px);gap:4px;justify-content:center}
.sdk .sdk-dbtn{padding:0;font-size:11px;line-height:1}
.sdk .sdk-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px;color:var(--mut);justify-content:center}
.sdk .sdk-legend span{display:inline-flex;align-items:center;gap:4px}
.sdk .sdk-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.9);backdrop-filter:blur(3px);padding:12px}
.sdk .sdk-ov-top{z-index:6}
.sdk .sdk-ov-top2{z-index:7}
.sdk .sdk-card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 16px 48px rgba(15,23,42,.14);padding:20px;max-width:440px;width:100%;max-height:100%;overflow:auto;text-align:center;box-sizing:border-box}
.sdk .sdk-card h3{margin:0 0 6px;font-size:20px}
.sdk .sdk-sub{margin:0 0 12px;font-size:13px;color:var(--mut);line-height:1.55}
.sdk .sdk-seg{display:flex;gap:6px;justify-content:center;margin:0 0 10px;flex-wrap:wrap}
.sdk .sdk-seg .sdk-btn{flex:1;min-width:82px}
.sdk .sdk-stats{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:0 0 14px}
.sdk .sdk-badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:11px;font-weight:700;margin:0 0 12px}
.sdk .sdk-help{text-align:left;font-size:13px;line-height:1.6;color:#334155}
.sdk .sdk-help h4{margin:12px 0 4px;font-size:13px;color:var(--ink)}
.sdk .sdk-help ul{margin:4px 0;padding-left:18px}
.sdk .sdk-help kbd{background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:0 5px;font-size:11.5px;font-family:inherit}
.sdk .sdk-cheats{display:flex;flex-direction:column;gap:6px;text-align:left}
.sdk .sdk-cheat{display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:9px 12px}
.sdk .sdk-cheat small{color:var(--mut);font-size:11px;font-weight:500}
.sdk .sdk-foot{margin-top:12px;font-size:11.5px;color:var(--mut);text-align:center;line-height:1.7}
@media (max-width:760px){
.sdk .sdk-stage{flex-direction:column;align-items:center}
.sdk .sdk-side{width:min(92vw,432px);flex-direction:row;align-items:flex-start}
.sdk .sdk-pad{flex:1;min-width:140px}
.sdk .sdk-sidrest{flex:1;min-width:140px}
.sdk .sdk-key{height:42px}
}
</style>
<div class="game-app sdk">
  <div class="game-intro">
    <div><h2>Sudoku</h2><p>Classic 9&times;9 logic puzzle &mdash; every row, column and 3&times;3 box holds 1&ndash;9. Every puzzle has exactly one solution.</p></div>
    <span class="game-status"><i class="game-status-dot" data-el="dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="sdk-bar">
      <button class="sdk-btn" type="button" data-act="diff" data-el="diff" title="Cycle difficulty (starts a new puzzle)">Easy</button>
      <span class="sdk-chip">Time <b data-hud="time">0:00</b></span>
      <span class="sdk-chips" data-el="chips"></span>
      <span class="sdk-spacer"></span>
      <button class="sdk-btn" type="button" data-act="help" title="How to play (?)">How to play</button>
      <button class="sdk-btn" type="button" data-act="cheats" data-el="cheatbtn" title="Cheat menu (C)">Cheats</button>
      <button class="sdk-btn" type="button" data-act="restart" data-el="restart">Restart</button>
    </div>
    <div class="sdk-stage">
      <div class="sdk-board" data-el="board" role="grid" aria-label="Sudoku board"></div>
      <div class="sdk-side">
        <div class="sdk-pad" data-el="pad"></div>
        <div class="sdk-sidrest">
          <div class="sdk-tools">
            <button class="sdk-btn sdk-tool" type="button" data-act="erase" data-el="erasebtn" title="Clear notes (Backspace)">Erase</button>
            <button class="sdk-btn sdk-tool" type="button" data-act="notestoggle" data-el="notesbtn" title="Pencil mode (N / right-click)">Notes</button>
            <button class="sdk-btn sdk-tool" type="button" data-act="hint" data-el="hintbtn" title="Hint (H)">Hint 3</button>
          </div>
          <div class="sdk-dpad">
            <span></span><button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="up" aria-label="Move up">&#9650;</button><span></span>
            <button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="left" aria-label="Move left">&#9664;</button><button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="down" aria-label="Move down">&#9660;</button><button class="sdk-btn sdk-dbtn" type="button" data-act="move" data-dir="right" aria-label="Move right">&#9654;</button>
          </div>
          <div class="sdk-legend" data-el="legend"></div>
        </div>
      </div>
      <div class="sdk-ov" data-ov="wait" hidden><div class="sdk-card"><h3>Connecting&hellip;</h3><p class="sdk-sub">Waiting for the host to set up the game.</p></div></div>
      <div class="sdk-ov" data-ov="lobby" hidden><div class="sdk-card" data-el="lobbycard"></div></div>
      <div class="sdk-ov" data-ov="over" hidden><div class="sdk-card" data-el="overcard"></div></div>
      <div class="sdk-ov sdk-ov-top" data-ov="cheats" hidden><div class="sdk-card" data-el="cheatcard"></div></div>
      <div class="sdk-ov sdk-ov-top2" data-ov="help" hidden>
        <div class="sdk-card">
          <h3>How to play</h3>
          <div class="sdk-help">
            <h4>Goal</h4>
            <ul>
              <li>Fill the 9&times;9 grid so every row, column and 3&times;3 box contains the digits 1&ndash;9 exactly once.</li>
              <li>Given digits are locked. Every puzzle is generated fresh with <b>exactly one solution</b> (Easy ~40 givens, Medium ~32, Hard ~26).</li>
            </ul>
            <h4>Modes</h4>
            <ul>
              <li><b>Solo</b> &mdash; a wrong digit is not placed and costs a mistake; 3 mistakes ends the run. You get 3 hints. Best clean times are saved per difficulty.</li>
              <li><b>VS Bot / Room race</b> &mdash; one shared board, alternating turns. A correct digit scores that cell for you and locks it; a wrong digit costs a mistake. 3 mistakes loses the round; otherwise the most cells wins when the board is full. <b>Who starts and which player seat you get are randomized every round.</b></li>
            </ul>
            <h4>Notes (pencil marks)</h4>
            <ul>
              <li>Toggle Notes, then tap digits to mark candidates in an empty cell.</li>
              <li>Only digits still possible for that cell&rsquo;s row, column and box are allowed &mdash; impossible digits are dimmed on the pad.</li>
              <li>Notes auto-clean when a matching digit is placed in a peer cell. In a race, notes are private to you.</li>
            </ul>
            <h4>Desktop controls</h4>
            <ul>
              <li>Click a cell, then type <kbd>1</kbd>&ndash;<kbd>9</kbd> to place. <kbd>Shift</kbd>+digit adds a note in any mode.</li>
              <li><kbd>N</kbd> notes mode &middot; <kbd>&larr;&uarr;&darr;&rarr;</kbd> / <kbd>WASD</kbd> move &middot; <kbd>Backspace</kbd>/<kbd>0</kbd> erase notes.</li>
              <li><kbd>H</kbd> hint &middot; <kbd>C</kbd> cheats &middot; <kbd>?</kbd> help &middot; <kbd>Esc</kbd> close &middot; <kbd>Enter</kbd> start / play again &middot; right-click toggles notes.</li>
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
          <button class="sdk-btn primary" type="button" data-act="closehelp" style="margin-top:14px">Got it</button>
        </div>
      </div>
    </div>
    <div class="sdk-foot">
      Desktop: click a cell, type 1&ndash;9 &middot; Shift+digit / N = notes &middot; arrows or WASD move &middot; H hint &middot; C cheats &middot; ? help.<br>
      Mobile: tap a cell, then the pad &middot; Notes = pencil mode &middot; Erase clears notes &middot; D-pad moves the selection.
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
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
        status: $("[data-status]"),
        time: $('[data-hud="time"]'),
        diff: $('[data-el="diff"]'),
        restart: $('[data-el="restart"]'),
        cheatbtn: $('[data-el="cheatbtn"]'),
        notesbtn: $('[data-el="notesbtn"]'),
        hintbtn: $('[data-el="hintbtn"]'),
        erasebtn: $('[data-el="erasebtn"]'),
        ovWait: $('[data-ov="wait"]'),
        ovLobby: $('[data-ov="lobby"]'),
        ovOver: $('[data-ov="over"]'),
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
        return Math.max(0, Math.floor(((state.endedAt || Date.now()) - state.startedAt) / 1000));
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
        if (state.phase === "playing" && state.opp === "bot" && state.turn === 1) {
            botTimer = setTimeout(botMove, 700 + Math.random() * 900);
        }
    }
    function botMove() {
        botTimer = null;
        if (destroyed || !state || state.phase !== "playing") return;
        if (state.opp !== "bot" || state.turn !== 1) return;
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
        if (state.opp === "none") return { t: "Your move", c: "#22c55e" };
        return state.turn === mySeat()
            ? { t: "Your turn", c: "#22c55e" }
            : { t: online ? "Opponent's turn" : "Bot is thinking…", c: "#f59e0b" };
    }
    function lobbyHTML() {
        const versus = state.opp !== "none";
        const my = mySeat();
        const best = loadBest()[state.difficulty];
        let h = "<h3>Sudoku</h3>";
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
        h += '<button class="sdk-btn primary sdk-big" type="button" data-act="start">Start game</button>';
        h += '<div style="margin-top:10px"><button class="sdk-btn" type="button" data-act="help">How to play</button></div>';
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
        let h = '<h3 style="color:' + color + '">' + title + "</h3>";
        h += '<p class="sdk-sub">' + reason + "</p>";
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
        h += "</div>";
        h += '<div class="sdk-seg"><button class="sdk-btn primary" type="button" data-act="again">Play again</button>' +
            '<button class="sdk-btn" type="button" data-act="settings">Settings</button></div>';
        return h;
    }
    function cheatHTML() {
        const versus = state.opp !== "none";
        const cellOk = selected >= 0 && !state.grid[selected];
        const item = (key, label, sub, dis) =>
            '<button class="sdk-btn sdk-cheat" type="button" data-act="cheat" data-cheat="' + key + '"' +
            (dis ? " disabled" : "") + "><span>" + label + "</span><small>" + sub + "</small></button>";
        let h = "<h3>Cheats</h3>";
        h += '<p class="sdk-sub">Fun-only helpers. Using any cheat flags this round and blocks best-time records.</p>';
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
        h += '<button class="sdk-btn" type="button" data-act="closecheats" style="margin-top:12px">Close (Esc)</button>';
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
            let dis = !playing;
            if (playing) dis = notesMode ? (selected >= 0 && !(cand & (1 << d))) : left <= 0;
            k.btn.disabled = dis;
        }

        /* HUD chips */
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
            chips += chip("Best", best ? fmt(best) : "—");
        }
        els.chips.innerHTML = chips;
        els.time.textContent = fmt(elapsed());

        /* status */
        const si = statusInfo();
        els.status.textContent = toast || si.t;
        els.dot.style.background = si.c;

        /* toolbar + tools */
        els.diff.textContent = cap(st ? st.difficulty : "easy");
        els.diff.disabled = !st;
        els.restart.disabled = !st;
        els.restart.textContent = st && st.phase === "over" ? "Play again" : st && st.phase === "lobby" ? "Start" : "Restart";
        els.cheatbtn.disabled = !playing;
        els.erasebtn.disabled = !playing;
        els.notesbtn.disabled = !playing;
        els.notesbtn.classList.toggle("active", notesMode);
        els.notesbtn.setAttribute("aria-pressed", String(notesMode));
        els.hintbtn.disabled = !playing || st.hints[my] <= 0 || (versus && st.turn !== my);
        els.hintbtn.textContent = "Hint " + (st ? st.hints[my] : 3);
        dpadBtns.forEach((b) => { b.disabled = !playing; });

        /* legend */
        let leg = '<span><span class="sdk-dot" style="background:#0f172a"></span>Given</span>' +
            '<span><span class="sdk-dot" style="background:' + SEAT_COLORS[versus ? my : 0] + '"></span>You</span>' +
            '<span><span class="sdk-dot" style="background:#059669"></span>Hint</span>';
        if (versus)
            leg += '<span><span class="sdk-dot" style="background:' + SEAT_COLORS[1 - my] + '"></span>' + seatName(1 - my) + "</span>";
        els.legend.innerHTML = leg;

        /* overlays */
        if (showCheats && !playing) showCheats = false;
        els.ovWait.hidden = !(online && !st);
        els.ovLobby.hidden = !(st && st.phase === "lobby");
        els.ovOver.hidden = !(st && st.phase === "over");
        els.ovCheats.hidden = !showCheats;
        els.ovHelp.hidden = !showHelp;
        if (!els.ovLobby.hidden) els.lobbycard.innerHTML = lobbyHTML();
        if (!els.ovOver.hidden) els.overcard.innerHTML = overHTML();
        if (showCheats) els.cheatcard.innerHTML = cheatHTML();
    }

    /* ----- player input ----- */
    function selectCell(i) {
        if (!state || state.phase !== "playing") return;
        selected = i;
        render();
    }
    function placeDigit(d) {
        if (!state || state.phase !== "playing" || selected < 0) return;
        const i = selected;
        if (state.puzzle[i] || state.grid[i]) { nudge("That cell is locked"); return; }
        if (state.opp !== "none" && state.turn !== mySeat()) { nudge("Wait for your turn"); return; }
        submitAction({ type: "place", i: i, d: d });
    }
    function toggleNote(i, d) {
        if (!state || state.phase !== "playing" || i < 0) return;
        if (state.puzzle[i] || state.grid[i]) { nudge("That cell is filled"); return; }
        if (!(candMask(state.grid, i) & (1 << d))) { nudge(d + " is not possible here"); return; }
        notes[i] ^= 1 << d;
        render();
    }
    function padPress(d) {
        if (!state || state.phase !== "playing") return;
        if (selected < 0) { nudge("Select a cell first"); return; }
        if (notesMode) toggleNote(selected, d);
        else placeDigit(d);
    }
    function eraseNotes() {
        if (!state || state.phase !== "playing" || selected < 0) return;
        if (notes[selected]) { notes[selected] = 0; render(); }
        else if (state.grid[selected] && !state.puzzle[selected]) nudge("Correct digits are locked");
    }
    function moveSel(dir) {
        if (!state || state.phase !== "playing") return;
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
        if (!state || state.phase !== "playing") return;
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
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const cell = event.target.closest("[data-i]");
        if (cell) { selectCell(Number(cell.dataset.i)); return; }
        const key = event.target.closest("[data-d]");
        if (key) { padPress(Number(key.dataset.d)); return; }
        const actEl = event.target.closest("[data-act]");
        if (!actEl) return;
        switch (actEl.dataset.act) {
            case "help": showHelp = true; showCheats = false; render(); break;
            case "closehelp": showHelp = false; render(); break;
            case "cheats":
                if (state && state.phase === "playing") { showCheats = !showCheats; showHelp = false; render(); }
                break;
            case "closecheats": showCheats = false; render(); break;
            case "restart":
                submitAction({ type: state && state.phase === "lobby" ? "start" : "rematch" });
                break;
            case "diff": {
                if (!state) break;
                const next = state.difficulty === "easy" ? "medium" : state.difficulty === "medium" ? "hard" : "easy";
                submitAction({ type: "difficulty", value: next });
                break;
            }
            case "start": submitAction({ type: "start" }); break;
            case "again": submitAction({ type: "rematch" }); break;
            case "settings": submitAction({ type: "lobby" }); break;
            case "setdiff": submitAction({ type: "difficulty", value: actEl.dataset.diff }); break;
            case "mode": submitAction({ type: "mode", value: actEl.dataset.mode }); break;
            case "erase": eraseNotes(); break;
            case "notestoggle": notesMode = !notesMode; render(); break;
            case "hint": submitAction({ type: "hint" }); break;
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
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const k = e.key;
        if (k === "Escape") {
            if (showCheats) { showCheats = false; render(); }
            else if (showHelp) { showHelp = false; render(); }
            return;
        }
        if (k === "?" || k === "F1") {
            e.preventDefault();
            showHelp = !showHelp; showCheats = false; render();
            return;
        }
        if (k === "c" || k === "C") {
            if (state && state.phase === "playing") { showCheats = !showCheats; showHelp = false; render(); }
            return;
        }
        if (showHelp || showCheats) return;
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
        if (k === "h" || k === "H") { submitAction({ type: "hint" }); return; }
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
        if (state && state.phase === "playing") { notesMode = !notesMode; render(); }
    }

    /* ----- wiring ----- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    els.board.addEventListener("contextmenu", onCtx);
    tickTimer = setInterval(() => {
        if (!destroyed && state && state.phase === "playing")
            els.time.textContent = fmt(elapsed());
    }, 500);

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