/* ==== GAME: tic-tac-toe.js ==== */
/*
  Tic Tac Toe — minimalist red vs blue.
  - Solo vs bot (perfect minimax / easy), sisi X/O diacak tiap ronde.
  - Room mode: host-authoritative, mark diacak host lalu di-publish.
  - Puzzle generator acak yang diverifikasi minimax (selalu solvable).
  - Cheat overlay (solo): hint, best move, undo, freeze bot.
  - Mouse + keyboard (1-9, panah, Enter, R/P/C/H) + keypad virtual mobile.
  Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "tic-tac-toe", // harus sama dengan nama file (tanpa .js)
    name: "Tic Tac Toe",
    category: "board",
    catLabel: "Board",
    desc: "Line up three marks. Blue X versus red O — solo against a minimax bot or a friend in a room.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 6v36M31 6v36M6 17h36M6 31h36" stroke="#94a3b8" stroke-width="2.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#2563eb" stroke-width="3.4"/><circle cx="24" cy="24" r="4.6" stroke="#dc2626" stroke-width="3.4"/><path d="M32.5 32.5l7 7M39.5 32.5l-7 7" stroke="#2563eb" stroke-width="3.4"/></svg>',
    bg: ["#bfdbfe", "#fecaca"],
    bestKey: "ticTacToeBestStreak",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- markup + scoped styles (minimalist, red vs blue) ---------- */
    root.innerHTML = `
<style>
.ttt-game{--x:#2563eb;--o:#dc2626;--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--soft:#f3f4f6;
  max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:12px;color:var(--ink);
  font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:6px 2px}
.ttt-game *{box-sizing:border-box}
.ttt-game .game-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ttt-game .game-intro h2{margin:0;font-size:19px;font-weight:650;letter-spacing:-.01em}
.ttt-game .game-intro p{margin:2px 0 0;color:var(--mut);font-size:12.5px}
.ttt-game .game-status{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);
  border-radius:999px;padding:5px 11px;font-size:12px;color:var(--mut);white-space:nowrap;background:#fff}
.ttt-game .game-status-dot{width:8px;height:8px;border-radius:50%;background:#9ca3af;display:inline-block}
.ttt-game .game-status-dot.is-you{background:var(--x)}
.ttt-game .game-status-dot.is-opp{background:var(--o)}
.ttt-game .game-status-dot.is-think{animation:ttt-pulse 1.1s infinite}
@keyframes ttt-pulse{50%{opacity:.35}}
.ttt-meta{display:flex;flex-direction:column;gap:6px}
.ttt-role{font-size:13px;color:var(--mut)}
.ttt-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;
  padding:0 5px;border-radius:6px;font-size:12px;font-weight:700;color:#fff;vertical-align:-4px}
.ttt-badge.is-x{background:var(--x)} .ttt-badge.is-o{background:var(--o)}
.ttt-chips{display:flex;flex-wrap:wrap;gap:6px}
.ttt-chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:3px 10px;
  font-size:11.5px;color:var(--mut)}
.ttt-board{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;padding:12px}
.ttt-svg{display:block;width:100%;max-width:340px;margin:0 auto;aspect-ratio:1/1}
.ttt-cell{fill:rgba(0,0,0,0);transition:fill .15s}
.ttt-cell.ttt-play{cursor:pointer}
.ttt-svg[data-turn="1"] .ttt-cell.ttt-play:hover{fill:rgba(37,99,235,.08)}
.ttt-svg[data-turn="2"] .ttt-cell.ttt-play:hover{fill:rgba(220,38,38,.08)}
.ttt-cell.ttt-hint-x{fill:rgba(37,99,235,.10);stroke:var(--x);stroke-width:1.5;stroke-dasharray:5 4}
.ttt-cell.ttt-hint-o{fill:rgba(220,38,38,.10);stroke:var(--o);stroke-width:1.5;stroke-dasharray:5 4}
.ttt-cell.ttt-wincell-x{fill:rgba(37,99,235,.10)} .ttt-cell.ttt-wincell-o{fill:rgba(220,38,38,.10)}
.ttt-grid line{stroke:var(--line);stroke-width:2;stroke-linecap:round}
.ttt-x{stroke:var(--x);stroke-width:8;stroke-linecap:round;fill:none}
.ttt-o{stroke:var(--o);stroke-width:8;fill:none}
.ttt-mark{transition:opacity .3s}
.ttt-svg.ttt-dim .ttt-mark{opacity:.25}
.ttt-svg.ttt-dim .ttt-mark.ttt-hit{opacity:1}
.ttt-ghost{opacity:.22;pointer-events:none}
.ttt-ax{stroke-dasharray:56;stroke-dashoffset:56;animation:ttt-draw .18s ease-out forwards}
.ttt-ao{stroke-dasharray:128;stroke-dashoffset:128;animation:ttt-draw .3s ease-out forwards}
@keyframes ttt-draw{to{stroke-dashoffset:0}}
.ttt-wl{stroke-width:5;stroke-linecap:round;opacity:.9;stroke-dasharray:300;stroke-dashoffset:300;
  animation:ttt-draw .4s .05s ease-out forwards}
.ttt-wl.is-x{stroke:var(--x)} .ttt-wl.is-o{stroke:var(--o)}
.ttt-cursor{fill:none;stroke:#9ca3af;stroke-width:1.5;stroke-dasharray:4 3;pointer-events:none}
.ttt-hide{display:none!important}
.ttt-controls{display:flex;flex-wrap:wrap;gap:8px}
.ttt-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);
  border-radius:10px;padding:8px 13px;font-size:12.5px;font-weight:550;cursor:pointer;
  transition:background .15s,transform .05s}
.ttt-btn:hover{background:var(--soft)} .ttt-btn:active{transform:translateY(1px)}
.ttt-btn:disabled{opacity:.45;cursor:default}
.ttt-btn.ttt-primary{background:var(--ink);border-color:var(--ink);color:#fff}
.ttt-btn.ttt-primary:hover{background:#000}
.ttt-btn[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff}
.ttt-btn.ttt-cheaty{border-style:dashed}
.ttt-pad{display:none;grid-template-columns:repeat(3,1fr);gap:8px;max-width:280px;margin:0 auto;width:100%}
@media (pointer:coarse),(max-width:640px){.ttt-pad{display:grid}}
.ttt-game.pad-on .ttt-pad{display:grid}
.ttt-game.pad-off .ttt-pad{display:none}
.ttt-key{aspect-ratio:1/1;border:1px solid var(--line);border-radius:12px;background:#fff;
  font-size:17px;font-weight:650;color:var(--mut);cursor:pointer}
.ttt-key:active{background:var(--soft)}
.ttt-key:disabled{opacity:.5;cursor:default}
.ttt-key.has-x{color:var(--x)} .ttt-key.has-o{color:var(--o)}
.ttt-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.88);backdrop-filter:blur(3px);border-radius:18px;z-index:20;
  animation:ttt-fade .25s ease-out}
.ttt-ov[data-ov="result"]{z-index:30}
.ttt-ov[data-ov="wait"]{z-index:40}
@keyframes ttt-fade{from{opacity:0}}
.ttt-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 22px;
  max-width:310px;width:calc(100% - 32px);text-align:center;box-shadow:0 8px 28px rgba(17,24,39,.08)}
.ttt-card h3{margin:0 0 6px;font-size:18px;font-weight:650}
.ttt-card h3.ttt-good{color:var(--x)} .ttt-card h3.ttt-bad{color:var(--o)}
.ttt-card p{margin:0 0 14px;color:var(--mut);font-size:12.5px}
.ttt-card .ttt-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.ttt-card.ttt-cheatcard{border-style:dashed;text-align:left}
.ttt-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:7px 0;border-bottom:1px solid var(--soft);font-size:12.5px}
.ttt-cheatrow:last-of-type{border-bottom:0}
.ttt-note{font-size:11px;color:var(--mut);margin:10px 0 12px}
.ttt-help{border:1px solid var(--line);border-radius:14px;background:#fff;font-size:12.5px}
.ttt-help summary{cursor:pointer;padding:10px 14px;font-weight:600;color:var(--ink);list-style:none}
.ttt-help summary::before{content:"+ ";color:var(--mut)}
.ttt-help[open] summary::before{content:"– "}
.ttt-help .ttt-helpbody{padding:0 14px 12px;color:var(--mut)}
.ttt-help ol{margin:4px 0 10px;padding-left:18px}
.ttt-help li{margin:3px 0}
.ttt-help kbd{font:11px ui-monospace,monospace;background:var(--soft);border:1px solid var(--line);
  border-radius:5px;padding:1px 5px;color:var(--ink)}
.ttt-game .game-actions{display:flex;justify-content:flex-end}
@media (prefers-reduced-motion:reduce){.ttt-game *{animation:none!important;transition:none!important}}
</style>
<div class="game-app ttt-game" data-wrap>
  <div class="game-intro">
    <div><h2>Tic Tac Toe</h2><p>Three in a row wins. Blue X versus red O.</p></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
  </div>
  <div class="ttt-meta">
    <div class="ttt-role" data-role></div>
    <div class="ttt-chips">
      <span class="ttt-chip" data-chip="round">Round 1</span>
      <span class="ttt-chip" data-chip="score">—</span>
      <span class="ttt-chip" data-chip="streak">Streak 0 · Best 0</span>
      <span class="ttt-chip" data-chip="puzzle" hidden>Puzzles solved 0</span>
    </div>
  </div>
  <section class="game-panel" data-board>
    <div class="ttt-board">
      <svg class="ttt-svg" viewBox="0 0 300 300" data-svg data-turn="0" role="img" aria-label="Tic tac toe board">
        <g data-cells></g>
        <g class="ttt-grid">
          <line x1="100" y1="14" x2="100" y2="286"/><line x1="200" y1="14" x2="200" y2="286"/>
          <line x1="14" y1="100" x2="286" y2="100"/><line x1="14" y1="200" x2="286" y2="200"/>
        </g>
        <g data-ghost class="ttt-ghost"></g>
        <g data-marks></g>
        <g data-win></g>
        <rect data-cursor class="ttt-cursor ttt-hide" width="84" height="84" rx="12"/>
      </svg>
      <div class="ttt-ov" data-ov="wait"><div class="ttt-card">
        <h3>Waiting for host</h3><p>The host is setting up the first round. Marks are drawn randomly.</p>
      </div></div>
      <div class="ttt-ov" data-ov="cheats" hidden><div class="ttt-card ttt-cheatcard">
        <h3>Cheats</h3>
        <div class="ttt-cheatrow"><span>Hint: outline my best move</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-hint" aria-pressed="false">Off</button></div>
        <div class="ttt-cheatrow"><span>Play my best move now</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-best">Play</button></div>
        <div class="ttt-cheatrow"><span>Undo my last move</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-undo">Undo</button></div>
        <div class="ttt-cheatrow"><span>Freeze bot: skip its next turn</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-skip">Freeze</button></div>
        <p class="ttt-note">Solo mode only. Cheat-assisted rounds do not count toward score or streak.</p>
        <div class="ttt-row"><button class="ttt-btn" type="button" data-act="cheats-close">Close</button></div>
      </div></div>
      <div class="ttt-ov" data-ov="result" hidden><div class="ttt-card">
        <h3 data-res="title">Round over</h3>
        <p data-res="sub"></p>
        <div class="ttt-row">
          <button class="ttt-btn ttt-primary" type="button" data-act="restart" data-res="again">Play again</button>
          <button class="ttt-btn" type="button" data-act="retry" data-res="retry" hidden>Retry puzzle</button>
          <button class="ttt-btn" type="button" data-act="puzzle" data-res="newpuzzle" hidden>New puzzle</button>
        </div>
      </div></div>
    </div>
  </section>
  <div class="ttt-controls">
    <button class="ttt-btn" type="button" data-act="diff" data-btn="diff">Bot: Perfect</button>
    <button class="ttt-btn" type="button" data-act="puzzle" data-btn="puzzle">Puzzle</button>
    <button class="ttt-btn ttt-cheaty" type="button" data-act="cheats" data-btn="cheats" aria-pressed="false">Cheats</button>
    <button class="ttt-btn" type="button" data-act="pad" data-btn="pad" aria-pressed="false">Keypad</button>
    <button class="ttt-btn" type="button" data-act="restart">Restart</button>
  </div>
  <div class="ttt-pad" data-pad></div>
  <details class="ttt-help">
    <summary>How to play</summary>
    <div class="ttt-helpbody">
      <ol>
        <li>Place your mark on an empty cell. Three in a row, column or diagonal wins.</li>
        <li>Marks are drawn randomly every round: blue X always opens, so you may start or answer — versus the bot or versus a friend in a room.</li>
        <li><b>Puzzle</b> deals a random mid-game position that is verified solvable: find the forced win against perfect defense. Retry keeps the same position.</li>
        <li><b>Cheats</b> (solo only) can hint, auto-play, undo or freeze the bot. Assisted rounds are not counted.</li>
      </ol>
      <div>Mouse: click a cell, hover previews your mark. Keyboard: <kbd>1</kbd>–<kbd>9</kbd> place (left to right, top to bottom),
      <kbd>←↑↓→</kbd> + <kbd>Enter</kbd> move and place, <kbd>R</kbd> restart, <kbd>P</kbd> puzzle, <kbd>C</kbd> cheats, <kbd>H</kbd> hint, <kbd>Esc</kbd> close.
      On touch devices a 3×3 keypad appears under the board.</div>
    </div>
  </details>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- refs + helpers ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const wrap = $("[data-wrap]");
    const svg = $("[data-svg]");
    const gCells = $("[data-cells]");
    const gGhost = $("[data-ghost]");
    const gMarks = $("[data-marks]");
    const gWin = $("[data-win]");
    const cursorEl = $("[data-cursor]");
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const roleEl = $("[data-role]");
    const chips = {
        round: $('[data-chip="round"]'), score: $('[data-chip="score"]'),
        streak: $('[data-chip="streak"]'), puzzle: $('[data-chip="puzzle"]'),
    };
    const ovWait = $('[data-ov="wait"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovResult = $('[data-ov="result"]');
    const resTitle = $('[data-res="title"]');
    const resSub = $('[data-res="sub"]');
    const resAgain = $('[data-res="again"]');
    const resRetry = $('[data-res="retry"]');
    const resNew = $('[data-res="newpuzzle"]');
    const btnDiff = $('[data-btn="diff"]');
    const btnPuzzle = $('[data-btn="puzzle"]');
    const btnCheats = $('[data-btn="cheats"]');
    const btnPad = $('[data-btn="pad"]');
    const padEl = $("[data-pad]");
    const cheatHintBtn = $('[data-act="cheat-hint"]');
    const cheatBestBtn = $('[data-act="cheat-best"]');
    const cheatUndoBtn = $('[data-act="cheat-undo"]');
    const cheatSkipBtn = $('[data-act="cheat-skip"]');

    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const CX = (i) => 50 + (i % 3) * 100;
    const CY = (i) => 50 + Math.floor(i / 3) * 100;

    const LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }
    const saveBest = () => { try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { } };

    /* UI lokal (tidak diserialisasi ke room) */
    const ui = {
        cursor: 4, hover: -1, kbd: false, hint: false, cheats: false,
        resultShown: false, resultPending: false, animKey: "",
    };

    let timers = [];
    const later = (fn, ms) => {
        const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms);
        timers.push(t);
        return t;
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

    /* ---------- rules + AI (minimax + alpha-beta, perspektif X) ---------- */
    function winnerOf(b) {
        for (const L of LINES) {
            const a = L[0];
            if (b[a] && b[a] === b[L[1]] && b[a] === b[L[2]]) return { p: b[a], line: L };
        }
        return b.every((v) => v) ? { p: 0, line: null } : null;
    }
    const emptyCells = (b) => { const e = []; for (let i = 0; i < 9; i++) if (!b[i]) e.push(i); return e; };

    function scoreBoard(b, mover, depth, alpha, beta) {
        const w = winnerOf(b);
        if (w) return w.p === 1 ? 10 - depth : w.p === 2 ? depth - 10 : 0;
        if (mover === 1) {
            let bestS = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (b[i]) continue;
                b[i] = 1; const s = scoreBoard(b, 2, depth + 1, alpha, beta); b[i] = 0;
                if (s > bestS) bestS = s;
                if (bestS > alpha) alpha = bestS;
                if (beta <= alpha) break;
            }
            return bestS;
        }
        let bestS = Infinity;
        for (let i = 0; i < 9; i++) {
            if (b[i]) continue;
            b[i] = 2; const s = scoreBoard(b, 1, depth + 1, alpha, beta); b[i] = 0;
            if (s < bestS) bestS = s;
            if (bestS < beta) beta = bestS;
            if (beta <= alpha) break;
        }
        return bestS;
    }

    function bestMoveFor(b, mark) {
        let bestS = mark === 1 ? -Infinity : Infinity, pool = [];
        for (const i of emptyCells(b)) {
            b[i] = mark;
            const s = scoreBoard(b, 3 - mark, 1, -Infinity, Infinity);
            b[i] = 0;
            if (mark === 1 ? s > bestS : s < bestS) { bestS = s; pool = [i]; }
            else if (s === bestS) pool.push(i);
        }
        return pool.length ? pool[(Math.random() * pool.length) | 0] : -1;
    }

    /* ---------- puzzle generator: dijamin solvable via verifikasi minimax ---------- */
    function generatePuzzle() {
        const cands = [];
        for (let t = 0; t < 300; t++) {
            const b = new Array(9).fill(0);
            const plies = 2 + ((Math.random() * 3) | 0); // 2..4 langkah pembuka acak
            let mover = 1, dead = false;
            for (let k = 0; k < plies; k++) {
                const e = emptyCells(b);
                b[e[(Math.random() * e.length) | 0]] = mover;
                if (winnerOf(b)) { dead = true; break; }
                mover = 3 - mover;
            }
            if (dead || emptyCells(b).length < 4) continue;
            const v = scoreBoard(b, mover, 0, -Infinity, Infinity);
            const forced = mover === 1 ? v > 0 : v < 0; // sisi jalan punya forced win
            if (!forced) continue;
            cands.push({ board: b, mover, winPlies: 10 - Math.abs(v) });
        }
        const deep = cands.filter((c) => c.winPlies >= 3); // hindari puzzle "tinggal klik menang"
        const pool = deep.length ? deep : cands;
        if (pool.length) {
            const c = pool[(Math.random() * pool.length) | 0];
            return { board: c.board.slice(), mover: c.mover };
        }
        return { board: [1, 0, 0, 0, 2, 0, 0, 0, 1], mover: 1 }; // fallback fork klasik (terverifikasi)
    }

    /* ---------- state (serializable, host-authoritative) ---------- */
    const freshMarks = () => (Math.random() < 0.5 ? [1, 2] : [2, 1]); // undian X/O tiap ronde
    function initialState() {
        return {
            board: new Array(9).fill(0), base: new Array(9).fill(0), moves: [],
            turn: 1, phase: "play", winner: 0, winLine: null, last: -1,
            round: 1, marks: freshMarks(), score: { x: 0, o: 0, d: 0 }, streak: 0,
            difficulty: "perfect", cheated: false, skipAI: false,
            puzzle: null, puzzleCount: 0, puzzlesSolved: 0,
        };
    }
    const myMark = () => (state ? state.marks[playerIndex] : 0);
    const canPlay = (i) => Boolean(state && state.phase === "play" && state.turn === myMark() && !state.board[i]);
    const rebuild = () => { const b = state.base.slice(); for (const mv of state.moves) b[mv.c] = mv.m; return b; };
    const scoreOf = (idx) => (state.marks[idx] === 1 ? state.score.x : state.score.o);
    const nameOf = (idx) => online
        ? (roomData?.players?.[idx]?.name || roomData?.names?.[idx] ||
            (idx === playerIndex ? playerName : idx === 0 ? "Host" : "Guest"))
        : (idx === 0 ? "You" : "Bot");

    /* ---------- board cells + keypad (dibuat sekali, tetap persisten) ---------- */
    const cellEls = [], padKeys = [];
    for (let i = 0; i < 9; i++) {
        const rc = mk("rect", {
            x: CX(i) - 42, y: CY(i) - 42, width: 84, height: 84, rx: 12,
            class: "ttt-cell", "data-cell": i,
        }, gCells);
        cellEls.push(rc);
        const key = document.createElement("button");
        key.type = "button";
        key.className = "ttt-key";
        key.setAttribute("data-cell", String(i));
        key.setAttribute("aria-label", "Cell " + (i + 1));
        key.textContent = String(i + 1);
        padEl.appendChild(key);
        padKeys.push(key);
    }

    function drawMark(parent, i, mark, opts = {}) {
        const g = mk("g", { class: "ttt-mark" }, parent);
        g.setAttribute("data-i", String(i));
        const anim = opts.anim ? (mark === 1 ? " ttt-ax" : " ttt-ao") : "";
        if (mark === 1) {
            const cls = "ttt-x" + anim;
            mk("line", { x1: CX(i) - 19, y1: CY(i) - 19, x2: CX(i) + 19, y2: CY(i) + 19, class: cls }, g);
            mk("line", { x1: CX(i) + 19, y1: CY(i) - 19, x2: CX(i) - 19, y2: CY(i) + 19, class: cls }, g);
        } else {
            mk("circle", { cx: CX(i), cy: CY(i), r: 20, class: "ttt-o" + anim }, g);
        }
        return g;
    }

    /* ---------- rendering ---------- */
    function updateCursor() {
        const showKbd = ui.kbd && state && state.phase === "play";
        cursorEl.classList.toggle("ttt-hide", !showKbd);
        if (showKbd) {
            cursorEl.setAttribute("x", CX(ui.cursor) - 42);
            cursorEl.setAttribute("y", CY(ui.cursor) - 42);
        }
        gGhost.innerHTML = "";
        const i = ui.hover >= 0 ? ui.hover : ui.kbd ? ui.cursor : -1;
        if (i >= 0 && canPlay(i)) drawMark(gGhost, i, myMark());
    }

    function render() {
        if (!state) { // guest menunggu state pertama dari host
            ovWait.hidden = false;
            statusEl.textContent = "Waiting for host…";
            dotEl.className = "game-status-dot";
            return;
        }
        ovWait.hidden = true;
        const my = myMark(), opp = 3 - my;
        const over = state.phase === "over";
        const myTurn = state.phase === "play" && state.turn === my;

        svg.setAttribute("data-turn", myTurn ? String(my) : "0");
        svg.classList.toggle("ttt-dim", over && Boolean(state.winLine));

        const hintCell = ui.hint && myTurn && !online
            ? bestMoveFor(state.board.slice(), my) : -1;

        for (let i = 0; i < 9; i++) {
            const cl = cellEls[i].classList;
            cl.toggle("ttt-play", canPlay(i));
            cl.toggle("ttt-hint-x", i === hintCell && my === 1);
            cl.toggle("ttt-hint-o", i === hintCell && my === 2);
            const winHit = over && state.winLine && state.winLine.indexOf(i) >= 0;
            cl.toggle("ttt-wincell-x", Boolean(winHit) && state.winner === 1);
            cl.toggle("ttt-wincell-o", Boolean(winHit) && state.winner === 2);
        }

        const animKey = state.round + ":" + state.moves.length + ":" + state.last;
        const animate = animKey !== ui.animKey;
        ui.animKey = animKey;
        gMarks.innerHTML = "";
        for (let i = 0; i < 9; i++) {
            if (!state.board[i]) continue;
            const g = drawMark(gMarks, i, state.board[i], { anim: animate && i === state.last });
            if (over && state.winLine && state.winLine.indexOf(i) >= 0) g.classList.add("ttt-hit");
        }
        gWin.innerHTML = "";
        if (over && state.winLine) {
            const a = state.winLine[0], b = state.winLine[2];
            mk("line", {
                x1: CX(a), y1: CY(a), x2: CX(b), y2: CY(b),
                class: "ttt-wl " + (state.winner === 1 ? "is-x" : "is-o"),
            }, gWin);
        }
        updateCursor();

        /* HUD */
        dotEl.className = "game-status-dot";
        if (over) { statusEl.textContent = "Round over"; }
        else if (myTurn) { statusEl.textContent = "Your turn"; dotEl.classList.add("is-you"); }
        else {
            statusEl.textContent = online ? "Opponent's turn" : "Bot thinking…";
            dotEl.classList.add("is-opp");
            if (!online) dotEl.classList.add("is-think");
        }

        const badge = (m) => `<b class="ttt-badge ${m === 1 ? "is-x" : "is-o"}">${m === 1 ? "X" : "O"}</b>`;
        if (state.puzzle) {
            roleEl.innerHTML = `Puzzle #${state.puzzle.num}: you are ${badge(my)} — find the forced win.`;
        } else if (online) {
            roleEl.innerHTML = `You are ${badge(my)} vs ${esc(nameOf(1 - playerIndex))} ${badge(opp)}. X opens; marks are re-drawn every round.`;
        } else {
            roleEl.innerHTML = `You are ${badge(my)} · Bot is ${badge(opp)}. ${my === 1 ? "You open this round." : "Bot opens this round."}`;
        }
        chips.round.textContent = state.puzzle ? "Puzzle #" + state.puzzle.num : "Round " + state.round;
        chips.score.textContent = online
            ? `${nameOf(0)} ${scoreOf(0)} · ${nameOf(1)} ${scoreOf(1)} · Draws ${state.score.d}`
            : `You ${scoreOf(0)} · Bot ${scoreOf(1)} · Draws ${state.score.d}`;
        chips.streak.hidden = online;
        chips.streak.textContent = `Streak ${state.streak} · Best ${best}`;
        chips.puzzle.hidden = !state.puzzle;
        chips.puzzle.textContent = `Puzzles solved ${state.puzzlesSolved}`;

        /* controls */
        btnDiff.hidden = online;
        btnDiff.textContent = state.difficulty === "perfect" ? "Bot: Perfect" : "Bot: Easy";
        btnPuzzle.hidden = online;
        btnCheats.hidden = online;
        btnCheats.setAttribute("aria-pressed", String(ui.cheats));

        /* keypad virtual */
        for (let i = 0; i < 9; i++) {
            const v = state.board[i];
            padKeys[i].textContent = v ? (v === 1 ? "X" : "O") : String(i + 1);
            padKeys[i].classList.toggle("has-x", v === 1);
            padKeys[i].classList.toggle("has-o", v === 2);
            padKeys[i].disabled = !canPlay(i);
        }

        /* cheat overlay */
        if (over) ui.cheats = false;
        ovCheats.hidden = !ui.cheats || online;
        cheatHintBtn.setAttribute("aria-pressed", String(ui.hint));
        cheatHintBtn.textContent = ui.hint ? "On" : "Off";
        cheatBestBtn.disabled = !myTurn;
        cheatUndoBtn.disabled = !(state.phase === "play" && state.moves.some((m) => m.m === state.marks[0]));
        cheatSkipBtn.disabled = !(state.phase === "play") || state.skipAI;

        /* result overlay (muncul sedikit tertunda agar garis menang terlihat) */
        if (over && !ui.resultShown && !ui.resultPending) {
            ui.resultPending = true;
            later(() => {
                ui.resultPending = false;
                if (state && state.phase === "over") { ui.resultShown = true; render(); }
            }, 650);
        }
        if (!over) { ui.resultShown = false; }
        ovResult.hidden = !(over && ui.resultShown);
        if (over && ui.resultShown) renderResult();
    }

    function renderResult() {
        const my = myMark(), w = state.winner;
        const cheatNote = state.cheated ? " Cheat-assisted round — not counted." : "";
        const sess = online
            ? `Session: ${nameOf(0)} ${scoreOf(0)} · ${nameOf(1)} ${scoreOf(1)} · ${state.score.d} draws.`
            : `Session: ${scoreOf(0)}W / ${scoreOf(1)}L / ${state.score.d}D.`;
        let title, sub, tone = "";
        if (state.puzzle) {
            if (state.puzzle.result === "solved") {
                title = "Puzzle solved"; tone = "ttt-good";
                sub = `You found the forced win. Solved ${state.puzzlesSolved} this session.` + cheatNote;
            } else {
                title = "Puzzle failed"; tone = "ttt-bad";
                sub = (w === 0 ? "The win slipped away — perfect defense holds a draw."
                    : "The bot punished the mistake.") + " Retry the same position or deal a new one." + cheatNote;
            }
        } else if (w === 0) {
            title = "Draw"; sub = "Board full, no line of three. " + sess + cheatNote;
        } else if (online) {
            const idx = state.marks.indexOf(w);
            title = idx === playerIndex ? "You win" : nameOf(idx) + " wins";
            tone = idx === playerIndex ? "ttt-good" : "ttt-bad";
            sub = `Three ${w === 1 ? "blue X" : "red O"} marks in a line. ` + sess;
        } else {
            const iWon = w === my;
            title = iWon ? "You win" : "Bot wins";
            tone = iWon ? "ttt-good" : "ttt-bad";
            sub = (iWon ? `Three ${my === 1 ? "blue X" : "red O"} marks in a line. `
                : `The bot lined up three ${w === 1 ? "blue X" : "red O"} marks. `) + sess + cheatNote;
        }
        resTitle.textContent = title;
        resTitle.className = tone;
        resSub.textContent = sub;
        resAgain.textContent = state.puzzle ? "New round" : "Play again";
        resRetry.hidden = !state.puzzle;
        resNew.hidden = !state.puzzle;
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- round flow ---------- */
    function finishRound(w) {
        state.phase = "over";
        state.winner = w.p;
        state.winLine = w.line;
        ui.cheats = false;
        const human = state.marks[0];
        if (state.puzzle) {
            state.puzzle.result = w.p === human ? "solved" : "failed";
            if (w.p === human && !state.cheated) state.puzzlesSolved++;
        } else if (!state.cheated) {
            if (w.p === 1) state.score.x++;
            else if (w.p === 2) state.score.o++;
            else state.score.d++;
            if (!online) {
                if (w.p === human) {
                    state.streak++;
                    if (state.streak > best) { best = state.streak; saveBest(); }
                } else if (w.p === 3 - human) state.streak = 0;
            }
        }
        publish();
    }

    function resetRoundUi() {
        clearTimers();
        ui.resultShown = false;
        ui.resultPending = false;
        ui.cheats = false;
        state.moves = [];
        state.phase = "play";
        state.winner = 0;
        state.winLine = null;
        state.last = -1;
        state.cheated = false;
        state.skipAI = false;
    }

    function startRound() {
        resetRoundUi();
        state.board = new Array(9).fill(0);
        state.base = new Array(9).fill(0);
        state.turn = 1;
        state.round++;
        state.marks = freshMarks(); // undian lagi: siapa X (jalan dulu) siapa O
        state.puzzle = null;
        publish();
        if (!online && state.marks[1] === 1) later(aiTurn, 650); // bot kebagian X → bot buka
    }

    function startPuzzle() {
        resetRoundUi();
        const p = generatePuzzle();
        state.puzzleCount++;
        state.puzzle = { board: p.board.slice(), mover: p.mover, num: state.puzzleCount, result: null };
        state.base = p.board.slice();
        state.board = p.board.slice();
        state.marks = [p.mover, 3 - p.mover]; // kamu selalu sisi yang harus menang
        state.turn = p.mover;
        publish();
    }

    function retryPuzzle() {
        resetRoundUi();
        state.board = state.puzzle.board.slice();
        state.base = state.puzzle.board.slice();
        state.turn = state.puzzle.mover;
        state.puzzle.result = null;
        publish();
    }

    function aiTurn() {
        if (online || !state || state.phase !== "play" || state.turn !== state.marks[1]) return;
        if (state.skipAI) { // cheat freeze: bot lewati giliran
            state.skipAI = false;
            state.turn = state.marks[0];
            publish();
            return;
        }
        const mark = state.marks[1];
        let mv = bestMoveFor(state.board, mark);
        if (state.difficulty === "easy" && Math.random() < 0.4) {
            const e = emptyCells(state.board);
            mv = e[(Math.random() * e.length) | 0];
        }
        applyAction({ type: "place", cell: mv }, 1);
    }

    function applyCheat(a) {
        const human = state.marks[0];
        switch (a.kind) {
            case "hint":
                if (a.on) state.cheated = true;
                publish();
                break;
            case "best": {
                if (state.phase !== "play" || state.turn !== human) return;
                state.cheated = true;
                applyAction({ type: "place", cell: bestMoveFor(state.board, human) }, 0);
                break;
            }
            case "undo": {
                if (state.phase !== "play") return;
                let idx = -1;
                for (let i = state.moves.length - 1; i >= 0; i--)
                    if (state.moves[i].m === human) { idx = i; break; }
                if (idx < 0) return;
                clearTimers(); // batalkan langkah bot yang tertunda
                state.moves = state.moves.slice(0, idx);
                state.board = rebuild();
                state.turn = human;
                state.last = state.moves.length ? state.moves[state.moves.length - 1].c : -1;
                state.cheated = true;
                state.skipAI = false;
                publish();
                break;
            }
            case "skip":
                if (state.phase !== "play" || state.skipAI) return;
                state.skipAI = true;
                state.cheated = true;
                publish();
                break;
        }
    }

    /* ---------- actions (host-authoritative di room mode) ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        if (online && !room.isHost) return; // guest tidak pernah mutasi lokal
        switch (action.type) {
            case "place": {
                const c = action.cell;
                if (state.phase !== "play") return;
                if (!Number.isInteger(c) || c < 0 || c > 8 || state.board[c]) return;
                const mark = state.marks[actor];
                if (!mark || mark !== state.turn) return; // validasi giliran sesuai mark
                if (!online && actor === 0 && ui.hint) state.cheated = true;
                state.board[c] = mark;
                state.moves.push({ c, m: mark });
                state.last = c;
                const w = winnerOf(state.board);
                if (w) finishRound(w);
                else {
                    state.turn = 3 - mark;
                    publish();
                    if (!online && state.turn === state.marks[1])
                        later(aiTurn, 420 + Math.random() * 260);
                }
                break;
            }
            case "restart": startRound(); break;
            case "puzzle": if (!online) startPuzzle(); break;
            case "retry": if (!online && state.puzzle) retryPuzzle(); break;
            case "difficulty":
                if (online) return;
                state.difficulty = state.difficulty === "perfect" ? "easy" : "perfect";
                publish();
                break;
            case "cheat": if (!online) applyCheat(action); break;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- input: mouse / touch ---------- */
    function togglePad() {
        const visible = getComputedStyle(padEl).display !== "none";
        wrap.classList.toggle("pad-on", !visible);
        wrap.classList.toggle("pad-off", visible);
        btnPad.setAttribute("aria-pressed", String(!visible));
    }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const cellEl = event.target.closest("[data-cell]");
        if (cellEl) {
            ui.kbd = false;
            submitAction({ type: "place", cell: Number(cellEl.getAttribute("data-cell")) });
            return;
        }
        const actEl = event.target.closest("[data-act]");
        if (!actEl) return;
        switch (actEl.getAttribute("data-act")) {
            case "restart": submitAction({ type: "restart" }); break;
            case "puzzle": submitAction({ type: "puzzle" }); break;
            case "retry": submitAction({ type: "retry" }); break;
            case "diff": submitAction({ type: "difficulty" }); break;
            case "cheats": ui.cheats = !ui.cheats; render(); break;
            case "cheats-close": ui.cheats = false; render(); break;
            case "cheat-hint":
                ui.hint = !ui.hint;
                submitAction({ type: "cheat", kind: "hint", on: ui.hint });
                render();
                break;
            case "cheat-best": submitAction({ type: "cheat", kind: "best" }); break;
            case "cheat-undo": submitAction({ type: "cheat", kind: "undo" }); break;
            case "cheat-skip": submitAction({ type: "cheat", kind: "skip" }); break;
            case "pad": togglePad(); break;
        }
    }

    function onOver(e) {
        const c = e.target.closest ? e.target.closest("[data-cell]") : null;
        if (c && svg.contains(c)) {
            ui.hover = Number(c.getAttribute("data-cell"));
            ui.kbd = false;
            updateCursor();
        }
    }
    function onOut(e) {
        const c = e.target.closest ? e.target.closest("[data-cell]") : null;
        if (c) { ui.hover = -1; updateCursor(); }
    }

    /* ---------- input: keyboard desktop ---------- */
    function onKey(e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
        if (t && !root.contains(t) && t !== document.body) return;
        const k = e.key;
        if ((k === "Enter" || k === " ") && t && t.closest && t.closest("button,summary,a")) return;
        if (k >= "1" && k <= "9") {
            ui.kbd = true;
            ui.cursor = Number(k) - 1;
            submitAction({ type: "place", cell: ui.cursor });
            updateCursor();
            e.preventDefault();
            return;
        }
        switch (k) {
            case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": {
                ui.kbd = true;
                let r = Math.floor(ui.cursor / 3), c = ui.cursor % 3;
                if (k === "ArrowLeft") c = (c + 2) % 3;
                if (k === "ArrowRight") c = (c + 1) % 3;
                if (k === "ArrowUp") r = (r + 2) % 3;
                if (k === "ArrowDown") r = (r + 1) % 3;
                ui.cursor = r * 3 + c;
                updateCursor();
                e.preventDefault();
                break;
            }
            case "Enter": case " ":
                if (ui.kbd) { submitAction({ type: "place", cell: ui.cursor }); e.preventDefault(); }
                break;
            case "r": case "R": submitAction({ type: "restart" }); break;
            case "p": case "P": if (!online) submitAction({ type: "puzzle" }); break;
            case "c": case "C": if (!online) { ui.cheats = !ui.cheats; render(); } break;
            case "h": case "H":
                if (!online) {
                    ui.hint = !ui.hint;
                    submitAction({ type: "cheat", kind: "hint", on: ui.hint });
                    render();
                }
                break;
            case "Escape": if (ui.cheats) { ui.cheats = false; render(); } break;
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    document.addEventListener("keydown", onKey);

    /* ---------- wiring room / solo ---------- */
    const subs = [];
    if (online) {
        subs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = initialState(); // host mengundi mark lalu publish ke semua pemain
            publish();
            subs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            render(); // tampilkan "Waiting for host" sampai state pertama tiba
            // Firebase RTDB membuang key null dan array kosong saat menyimpan
            // state (mis. moves: [], winLine: null). Lengkapi dengan default
            // agar guest tidak crash saat merender state awal dari host.
            subs.push(room.onState((nextState) => {
                state = nextState ? { ...initialState(), ...nextState } : nextState;
                render();
            }));
        }
    } else {
        state = initialState();
        render();
        if (state.marks[1] === 1) later(aiTurn, 700); // bot kebagian X → bot jalan duluan
    }

    return {
        destroy() {
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerover", onOver);
            root.removeEventListener("pointerout", onOut);
            document.removeEventListener("keydown", onKey);
            subs.forEach((off) => { if (typeof off === "function") off(); });
        },
    };
}