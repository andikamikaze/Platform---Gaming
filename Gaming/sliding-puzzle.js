/* ==== GAME: sliding-puzzle.js ==== */

/* =============================================================
SLIDING PUZZLE - MGP puzzle module (ESM / mount() template)
Classic 15-puzzle in 3x3, 4x4 and 5x5. Shuffle is always
solvable: 150+ random legal moves from the solved state, never
undoing the previous move. Tiles are SVG groups animated with a
CSS transform transition. No canvas, no emoji, no assets.
============================================================= */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "sliding-puzzle",
    name: "Sliding Puzzle",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Slide tiles into the gap and order the board, classic 15-puzzle.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="3"/><rect x="17" y="2" width="14" height="14" rx="3"/><rect x="32" y="2" width="14" height="14" rx="3"/><rect x="2" y="17" width="14" height="14" rx="3"/><rect x="17" y="17" width="14" height="14" rx="3"/><rect x="32" y="17" width="14" height="14" rx="3"/><rect x="2" y="32" width="14" height="14" rx="3"/><rect x="17" y="32" width="14" height="14" rx="3"/><g font-size="9" text-anchor="middle" font-family="inherit" fill="currentColor" stroke="none"><text x="9" y="12.5">1</text><text x="24" y="12.5">2</text><text x="39" y="12.5">3</text><text x="9" y="27.5">4</text><text x="24" y="27.5">5</text><text x="39" y="27.5">6</text><text x="9" y="42.5">7</text><text x="24" y="42.5">8</text></g></svg>',
    bg: ["#ede9fe", "#c4b5fd"],
};

export function mount(root, context = {}) {
    const { onExit = () => {} } = context;
    const NS = "http://www.w3.org/2000/svg";
    const $ = (s, r) => (r || root).querySelector(s);
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const icon = (name) => iconSVG(name, { size: 14 });
    const HELP_KEY = "slidingPuzzleHelpSeen";
    const SIZES = [3, 4, 5];
    const U = 36; // svg units per tile

    /* ---------- pure rules (exposed via _test) ---------- */
    /* tiles: array of length cols*rows, values 1..N-1, 0 = the gap */
    function solvedTiles(cols, rows) {
        const t = [];
        for (let i = 1; i < cols * rows; i++) t.push(i);
        t.push(0);
        return t;
    }

    function isSolved(tiles, cols) {
        const n = tiles.length;
        for (let i = 0; i < n - 1; i++)
            if (tiles[i] !== i + 1) return false;
        return tiles[n - 1] === 0;
    }

    /* pure: slide the tile at index idx into the gap when it is
         orthogonally adjacent; returns a NEW array, or null when the
         move is illegal. */
    function applyMove(tiles, idx, cols) {
        const n = tiles.length;
        if (idx < 0 || idx >= n || tiles[idx] === 0) return null;
        const gap = tiles.indexOf(0);
        const dr = Math.floor(idx / cols) - Math.floor(gap / cols);
        const dc = (idx % cols) - (gap % cols);
        if (Math.abs(dr) + Math.abs(dc) !== 1) return null;
        const out = tiles.slice();
        out[gap] = tiles[idx];
        out[idx] = 0;
        return out;
    }

    /* always-solvable shuffle: 150+ random legal moves from the
         solved state, never immediately undoing the previous move.
         Returns { tiles, moves } where moves lists the tile values in
         the order they were slid. */
    function genShuffle(cols, rows) {
        let tiles = solvedTiles(cols, rows);
        const n = cols * rows;
        const steps = Math.max(150, n * 18);
        const moves = [];
        let prevTile = -1;
        for (let s = 0; s < steps; s++) {
            const gap = tiles.indexOf(0);
            const r = Math.floor(gap / cols),
                c = gap % cols;
            const cand = [];
            if (r > 0) cand.push(gap - cols);
            if (r < rows - 1) cand.push(gap + cols);
            if (c > 0) cand.push(gap - 1);
            if (c < cols - 1) cand.push(gap + 1);
            let pool = cand.filter((i) => tiles[i] !== prevTile);
            if (!pool.length) pool = cand;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const val = tiles[pick];
            moves.push(val);
            tiles = tiles.slice();
            tiles[gap] = val;
            tiles[pick] = 0;
            prevTile = val;
        }
        if (isSolved(tiles, cols)) return genShuffle(cols, rows); // astronomically rare
        return { tiles, moves };
    }

    /* proof of solvability: replay every shuffle move backwards.
         Returns the solved board, or null when any inverse move is
         illegal (which would mean the shuffle was broken). */
    function replayInverse(tiles, moves, cols) {
        let t = tiles.slice();
        for (let k = moves.length - 1; k >= 0; k--) {
            const idx = t.indexOf(moves[k]);
            const next = applyMove(t, idx, cols);
            if (!next) return null;
            t = next;
        }
        return t;
    }

    /* ---------- state ---------- */
    let destroyed = false;
    let paused = false,
        cheatsOpen = false,
        helpOpen = false;
    let sizeIdx = 0;
    let cols = 3,
        rows = 3;
    let tiles = solvedTiles(3, 3);
    let moves = 0,
        timeSec = 0,
        timerOn = false,
        timerId = null;
    let over = false,
        overShown = false;
    let clockBase = 0,
        pauseStart = 0,
        pauseOffset = 0;
    const timers = new Map();
    let timerSeq = 0;
    const tileEls = {}; // value -> <g>

    /* ---------- markup ---------- */
    root.innerHTML = `
<style>
.slp-app{--ink:#e5e7eb;--mut:#94a3b8;--line:#ffffff1a;--accent:#8b5cf6;display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;flex:1 1 auto;overflow-x:clip;-webkit-tap-highlight-color:transparent;color:var(--ink)}
.slp-app *{box-sizing:border-box}
.slp-app [hidden]{display:none!important}
.slp-app :where(button,[role="button"]){touch-action:manipulation}
.slp-app button:focus-visible,.slp-app .slp-tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.slp-app.game-fill>.slp-board[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.slp-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:#111a33;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.slp-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#ffffff0d;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}
.slp-chip b{color:var(--ink);font-weight:700}
.slp-spacer{flex:1 1 auto}
.slp-btn{font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;padding:8px 12px;min-height:36px;border:1px solid var(--line);border-radius:9px;background:#ffffff0d;color:var(--ink);text-transform:uppercase;cursor:pointer;transition:border-color .12s,background .12s}
.slp-btn:hover:not(:disabled){border-color:var(--accent)}
.slp-btn:disabled{opacity:.45;cursor:not-allowed}
.slp-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.slp-btn.on{background:var(--accent);border-color:var(--accent);color:#fff}
.slp-icon-btn{display:inline-flex;align-items:center;gap:6px}
.slp-icon-btn svg{flex:none;display:block}
.slp-btn-label{white-space:nowrap}
.slp-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:10px;border:1px solid var(--line);border-radius:12px;background:#111831;overflow:hidden}
.slp-wrap{width:100%;height:100%;min-height:0;display:flex;align-items:center;justify-content:center}
.slp-svg{display:block;width:100%;height:100%;max-width:min(100%,520px);max-height:100%;touch-action:manipulation}
.slp-bg{fill:#111831;stroke:#ffffff14;stroke-width:1}
.slp-tile{cursor:pointer;transition:transform .13s ease}
.slp-r{fill:#6d28d9;stroke:#8b5cf6;stroke-width:1;transition:fill .15s}
.slp-tile:hover .slp-r{fill:#7c3aed}
.slp-ok .slp-r{fill:#047857;stroke:#10b981}
.slp-hint .slp-r{fill:#b45309;stroke:#fbbf24}
.slp-t{fill:#ffffff;pointer-events:none}
.slp-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(17,24,49,.9);backdrop-filter:blur(2px)}
.slp-card{display:flex;flex-direction:column;width:min(460px,100%);max-height:100%;padding:16px;border:1px solid var(--line);border-radius:14px;background:#151d38;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.slp-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.slp-head h3{margin:0;font-size:15px;font-weight:700;line-height:1.25;letter-spacing:-.01em}
.slp-title.mgp-win{color:#86efac}
.slp-body,.slp-cheats,.slp-help{flex:1 1 auto;min-height:0;overflow:auto;font-size:13px;line-height:1.6;color:#c3cde2}
.slp-body p{margin:0}
.slp-cheats{display:flex;flex-direction:column;gap:8px}
.slp-cheats .slp-btn{width:100%;text-align:left}
.slp-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.slp-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.slp-help ul{margin:0 0 10px;padding-left:16px}
.slp-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#ffffff0d;color:var(--ink);font:600 10px/1.4 ui-monospace,monospace}
.slp-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px}
.slp-note{font-size:10px;line-height:1.45;color:var(--mut)}
.slp-pad{display:none;justify-content:space-between;align-items:center;gap:12px;user-select:none}
.slp-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,44px);gap:4px}
.slp-dpad [data-dir="up"]{grid-area:1/2}
.slp-dpad [data-dir="left"]{grid-area:2/1}
.slp-dpad [data-dir="right"]{grid-area:2/3}
.slp-dpad [data-dir="down"]{grid-area:3/2}
.slp-dbtn{display:grid;place-items:center;min-width:46px;min-height:44px;border:1px solid var(--line);border-radius:12px;background:#111a33;color:var(--ink);touch-action:manipulation;cursor:pointer}
.slp-dbtn svg{width:1.15em;height:1.15em;display:block}
@media (pointer:coarse){.slp-app .slp-pad{display:flex}}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.slp-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.slp-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.slp-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.slp-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .slp-app :where([class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .slp-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){gap:8px}
}
@media (max-width:480px){
  .slp-app :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .slp-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .slp-app *,.slp-app *::before,.slp-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* --- fill height + mobile refinements (last, beat pointer:coarse 44px) --- */
@media (max-width:640px){
  .slp-app.game-fill>.slp-board[data-board]{flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .slp-app .slp-hud{gap:5px;margin-bottom:0}
  .slp-app .slp-hud .slp-chip{padding:4px 6px;font-size:9px}
  .slp-app .slp-hud .slp-chip[data-hud="size"]{display:none}
  .slp-app .slp-hud .slp-btn-label,.slp-app .slp-hud .slp-spacer{display:none}
  .slp-app .slp-hud .slp-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .slp-app .slp-ov{padding:8px}
  .slp-app .slp-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .slp-app .slp-help{grid-template-columns:1fr;gap:8px}
  .slp-app .slp-body,.slp-app .slp-cheats,.slp-app .slp-help{scrollbar-width:none}
  .slp-app .slp-body::-webkit-scrollbar,.slp-app .slp-cheats::-webkit-scrollbar,.slp-app .slp-help::-webkit-scrollbar{display:none}
  .slp-app .slp-foot{padding-top:8px;border-top:1px solid var(--line)}
  .slp-app .slp-note{display:none}
}
@media (pointer:coarse){
  .slp-app .slp-hud .slp-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .slp-app .slp-card .slp-btn{min-height:44px}
}
</style>
<div class="game-app slp-app game-fill" data-slp>
  <div class="slp-hud">
    <span class="slp-chip">MOVES <b data-hud="moves">0</b></span>
    <span class="slp-chip">TIME <b data-hud="time">0:00</b></span>
    <span class="slp-chip" data-hud="size">SIZE 3×3</span>
    <span class="slp-chip" data-hud="status">READY</span>
    <span class="slp-spacer"></span>
    <button class="slp-btn slp-icon-btn" type="button" data-size aria-label="Board size: 3 by 3" title="Board size (S)">${icon("grid")}<span class="slp-btn-label" data-size-label>3×3</span></button>
    <button class="slp-btn slp-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${icon("helpCircle")}<span class="slp-btn-label">Help</span></button>
    <button class="slp-btn slp-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${icon("wrench")}<span class="slp-btn-label">Cheats</span></button>
    <button class="slp-btn slp-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="slp-picon">${icon("pause")}</span><span class="slp-btn-label">Pause</span></button>
    <button class="slp-btn slp-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${icon("refresh")}<span class="slp-btn-label">Restart</span></button>
    <button class="slp-btn slp-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${icon("logOut")}<span class="slp-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel slp-board" data-board>
    <div class="slp-wrap">
      <svg class="slp-svg" viewBox="0 0 108 108" role="img" aria-label="Sliding puzzle board">
        <rect class="slp-bg" x="0.5" y="0.5" width="107" height="107" rx="10"></rect>
        <g class="slp-tiles"></g>
      </svg>
    </div>
    <div class="slp-ov" data-ov="over" hidden>
      <div class="slp-card">
        <div class="slp-head"><h3 class="slp-title" data-ov="title">You win</h3></div>
        <div class="slp-body"><p data-ov="reason">...</p></div>
        <div class="slp-foot">
          <span class="slp-note">R restarts · Esc closes</span>
          <button class="slp-btn primary" type="button" data-act="again">Play again</button>
        </div>
      </div>
    </div>
    <div class="slp-ov" data-ov="pause" hidden>
      <div class="slp-card">
        <div class="slp-head"><h3>Paused</h3></div>
        <div class="slp-body"><p>The board and the clock are frozen. Press P or Esc to resume.</p></div>
        <div class="slp-foot"><span class="slp-note">P or Esc resumes</span><button class="slp-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="slp-ov" data-ov="cheat" hidden>
      <div class="slp-card">
        <div class="slp-head"><h3>Cheats</h3><button class="slp-btn" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
        <div class="slp-cheats">
          <button class="slp-btn" type="button" data-cheat="solve">Solve the board</button>
          <button class="slp-btn" type="button" data-cheat="hint">Highlight a misplaced tile</button>
          <button class="slp-btn" type="button" data-cheat="shuffle">New shuffle</button>
          <button class="slp-btn" type="button" data-cheat="time">Reset the clock</button>
        </div>
        <div class="slp-foot"><span class="slp-note">Cheats close the panel after use</span></div>
      </div>
    </div>
    <div class="slp-ov" data-ov="help" hidden>
      <div class="slp-card">
        <div class="slp-head"><h3>How to play</h3><button class="slp-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="slp-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a tile next to the gap to slide it.</li>
              <li>Arrow keys slide the tile below / above / beside the gap.</li>
              <li><span class="slp-kbd">S</span> changes board size, <span class="slp-kbd">R</span> restarts.</li>
              <li><span class="slp-kbd">H</span> help · <span class="slp-kbd">C</span> cheats · <span class="slp-kbd">P</span> pause · <span class="slp-kbd">Esc</span> close.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a tile or use the on-screen arrow pad.</li>
              <li>Size, Cheats and Pause sit in the top bar.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Arrange the tiles in order, 1 in the top left through to the last tile in the bottom right.</li>
              <li>Green tiles already sit in their final spot.</li>
              <li>The clock starts on your first move.</li>
              <li>Every shuffle is guaranteed solvable.</li>
            </ul>
            <div class="slp-foot"><span class="slp-note">Press H to reopen this guide</span><button class="slp-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="slp-pad" aria-label="Direction pad">
    <div class="slp-dpad">
      <button class="slp-dbtn" type="button" data-dir="up" aria-label="Slide tile up">${icon("arrowUp")}</button>
      <button class="slp-dbtn" type="button" data-dir="left" aria-label="Slide tile left">${icon("arrowLeft")}</button>
      <button class="slp-dbtn" type="button" data-dir="right" aria-label="Slide tile right">${icon("arrowRight")}</button>
      <button class="slp-dbtn" type="button" data-dir="down" aria-label="Slide tile down">${icon("arrowDown")}</button>
    </div>
    <span class="slp-note">Arrow keys work too</span>
  </div>
</div>`;

    /* ---------- element refs ---------- */
    const svg = $(".slp-svg");
    const bg = $(".slp-bg");
    const gTiles = $(".slp-tiles");
    const sizeBtn = $("[data-size]");
    const sizeLabel = $("[data-size-label]");
    const pBtn = $("[data-pause]");
    const pIcon = $(".slp-picon");
    const hud = {
        moves: $('[data-hud="moves"]'),
        time: $('[data-hud="time"]'),
        size: $('[data-hud="size"]'),
        status: $('[data-hud="status"]'),
    };
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTitle = $('[data-ov="title"]', ov.over);
    const ovReason = $('[data-ov="reason"]', ov.over);

    /* ---------- pause-aware timers ---------- */
    const clockNow = () => Date.now() - pauseOffset;
    const later = (fn, ms) => {
        const id = ++timerSeq;
        const due = clockNow() + ms;
        const t = setTimeout(() => runTimer(id), ms);
        timers.set(id, { id, fn, due, t });
        return id;
    };
    function runTimer(id) {
        const rec = timers.get(id);
        if (!rec) return;
        timers.delete(id);
        rec.fn();
    }
    function freezeTimers() {
        for (const rec of timers.values()) {
            if (rec.t) clearTimeout(rec.t);
            rec.t = null;
        }
    }
    function resumeTimers() {
        for (const rec of timers.values()) {
            rec.t = setTimeout(() => runTimer(rec.id), Math.max(0, rec.due - clockNow()));
        }
    }
    function clearTimers() {
        for (const rec of timers.values()) if (rec.t) clearTimeout(rec.t);
        timers.clear();
    }
    const blocked = () => paused || helpOpen || cheatsOpen;
    const fmt = (t) =>
        Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");

    /* ---------- timer ---------- */
    function beginTick() {
        if (timerId !== null) clearInterval(timerId);
        timerId = setInterval(() => {
            if (paused) return;
            timeSec = Math.max(0, Math.floor((clockNow() - clockBase) / 1000));
            hud.time.textContent = fmt(timeSec);
        }, 250);
    }
    function ensureTimer() {
        if (timerOn || over || blocked()) return;
        timerOn = true;
        clockBase = clockNow() - timeSec * 1000;
        beginTick();
    }
    function stopTimer() {
        if (timerOn && timerId !== null)
            timeSec = Math.max(timeSec, Math.floor((clockNow() - clockBase) / 1000));
        timerOn = false;
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
        hud.time.textContent = fmt(timeSec);
    }
    function setPaused(on) {
        if (destroyed || paused === on || over) return;
        if (on) {
            if (timerOn) timeSec = Math.max(timeSec, Math.floor((clockNow() - clockBase) / 1000));
            pauseStart = Date.now();
            paused = true;
            if (timerId !== null) {
                clearInterval(timerId);
                timerId = null;
            }
            freezeTimers();
        } else {
            paused = false;
            pauseOffset += Date.now() - pauseStart;
            if (timerOn) beginTick();
            resumeTimers();
        }
        syncUI();
    }

    /* ---------- board ---------- */
    function buildBoard() {
        gTiles.innerHTML = "";
        for (const k in tileEls) delete tileEls[k];
        const W = cols * U,
            H = rows * U;
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        bg.setAttribute("width", W - 1);
        bg.setAttribute("height", H - 1);
        for (let v = 1; v < cols * rows; v++) {
            const idx = tiles.indexOf(v);
            const g = mk("g", { class: "slp-tile", "data-v": v }, gTiles);
            mk(
                "rect",
                {
                    x: 2,
                    y: 2,
                    width: U - 4,
                    height: U - 4,
                    rx: 8,
                    class: "slp-r",
                },
                g,
            );
            const t = mk(
                "text",
                {
                    x: U / 2,
                    y: U / 2 + 6,
                    "text-anchor": "middle",
                    "font-family": "inherit",
                    "font-size": "17",
                    "font-weight": "700",
                    class: "slp-t",
                },
                g,
            );
            t.textContent = String(v);
            /* set the transform before the node enters the layout tree so
                 the slide transition does not fire on creation */
            g.style.transform =
                "translate(" +
                (idx % cols) * U +
                "px," +
                Math.floor(idx / cols) * U +
                "px)";
            tileEls[v] = g;
        }
        markCorrect();
    }

    function markCorrect() {
        for (let v = 1; v < cols * rows; v++) {
            const idx = tiles.indexOf(v);
            tileEls[v].classList.toggle("slp-ok", idx === v - 1);
        }
    }

    function renderTiles() {
        for (let v = 1; v < cols * rows; v++) {
            const idx = tiles.indexOf(v);
            tileEls[v].style.transform =
                "translate(" +
                (idx % cols) * U +
                "px," +
                Math.floor(idx / cols) * U +
                "px)";
        }
        markCorrect();
    }

    function updateHud() {
        hud.moves.textContent = String(moves);
        hud.time.textContent = fmt(timeSec);
        hud.size.textContent = "SIZE " + cols + "×" + rows;
        sizeLabel.textContent = cols + "×" + rows;
        sizeBtn.setAttribute("aria-label", "Board size: " + cols + " by " + rows);
        hud.status.textContent = over ? "WIN" : paused ? "PAUSED" : moves > 0 ? "PLAYING" : "READY";
    }

    function syncUI() {
        /* overlays suppress each other; first-run help matches cheats/pause */
        ov.over.hidden = !overShown || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const label = pBtn.querySelector(".slp-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        if (pIcon) pIcon.innerHTML = icon(paused ? "play" : "pause");
        $("[data-cheats]").classList.toggle("on", cheatsOpen);
        hud.size.textContent = "SIZE " + cols + "×" + rows;
        sizeLabel.textContent = cols + "×" + rows;
        hud.status.textContent = over ? "WIN" : paused ? "PAUSED" : moves > 0 ? "PLAYING" : "READY";
    }

    /* ---------- game flow ---------- */
    function newGame() {
        clearTimers();
        if (paused) {
            pauseOffset += Date.now() - pauseStart;
            paused = false;
        }
        stopTimer();
        cols = rows = SIZES[sizeIdx];
        const sh = genShuffle(cols, rows);
        tiles = sh.tiles;
        moves = 0;
        timeSec = 0;
        over = false;
        overShown = false;
        buildBoard();
        updateHud();
        syncUI();
    }

    function tryMove(idx) {
        if (destroyed || blocked() || over) return;
        const next = applyMove(tiles, idx, cols);
        if (!next) return;
        tiles = next;
        ensureTimer();
        moves++;
        renderTiles();
        updateHud();
        if (isSolved(tiles, cols)) winGame();
    }

    /* dir "up" = the tile BELOW the gap moves up, etc. */
    function moveDir(dir) {
        const gap = tiles.indexOf(0);
        const r = Math.floor(gap / cols),
            c = gap % cols;
        let idx = -1;
        if (dir === "up" && r < rows - 1) idx = gap + cols;
        else if (dir === "down" && r > 0) idx = gap - cols;
        else if (dir === "left" && c < cols - 1) idx = gap + 1;
        else if (dir === "right" && c > 0) idx = gap - 1;
        if (idx >= 0) tryMove(idx);
    }

    function winGame() {
        over = true;
        stopTimer();
        updateHud();
        later(() => {
            if (destroyed || !over) return;
            ovTitle.classList.remove("mgp-win", "mgp-lose");
            ovTitle.textContent = "You win";
            ovTitle.classList.add("mgp-win");
            ovReason.textContent =
                "Solved the " + cols + "x" + rows + " board in " + moves +
                " moves and " + fmt(timeSec) + ".";
            overShown = true;
            syncUI();
        }, 450);
    }

    /* ---------- cheats ---------- */
    function applyCheat(kind) {
        if (!over && !paused) {
            if (kind === "solve") {
                tiles = solvedTiles(cols, rows);
                renderTiles();
                updateHud();
                if (isSolved(tiles, cols)) winGame();
            } else if (kind === "shuffle") {
                newGame();
            } else if (kind === "time") {
                timeSec = 0;
                clockBase = clockNow();
                updateHud();
            } else if (kind === "hint") {
                let v = -1;
                for (let i = 0; i < cols * rows - 1; i++) {
                    if (tiles[i] !== i + 1) { v = i + 1; break; }
                }
                if (v > 0 && tileEls[v]) {
                    const g = tileEls[v];
                    g.classList.add("slp-hint");
                    later(() => g.classList.remove("slp-hint"), 900);
                }
            }
        }
        cheatsOpen = false;
        syncUI();
    }

    /* ---------- overlays ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncUI();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncUI();
    }

    /* ---------- events ---------- */
    function handleClick(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        const hit = (sel) => t.closest(sel);
        if (hit("[data-size]")) {
            sizeIdx = (sizeIdx + 1) % SIZES.length;
            newGame();
            return;
        }
        if (hit("[data-help]")) { toggleHelp(); return; }
        if (hit("[data-help-close]")) { toggleHelp(false); return; }
        if (hit("[data-exit]")) { onExit(); return; }
        if (hit("[data-cheats]")) { toggleCheats(); return; }
        if (hit("[data-cheat-close]")) { cheatsOpen = false; syncUI(); return; }
        const cheat = hit("[data-cheat]");
        if (cheat) { applyCheat(cheat.dataset.cheat); return; }
        if (hit("[data-pause]")) {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused(!paused);
            return;
        }
        if (hit('[data-act="resume"]')) { setPaused(false); return; }
        if (hit("[data-restart]") || hit('[data-act="again"]')) { newGame(); return; }
        const dir = hit("[data-dir]");
        if (dir) { moveDir(dir.dataset.dir); return; }
        if (destroyed || blocked() || over) return;
        const tile = hit(".slp-tile");
        if (tile && gTiles.contains(tile)) tryMove(tiles.indexOf(Number(tile.dataset.v)));
    }

    function handleKey(e) {
        if (destroyed) return;
        const t = e.target;
        if (t && t.closest && t.closest("input,textarea,select,[contenteditable=true]")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const c = e.code;
        /* priority: help -> cheats -> pause -> escape -> game actions */
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyS") { sizeIdx = (sizeIdx + 1) % SIZES.length; newGame(); e.preventDefault(); return; }
        if (c === "KeyR") { newGame(); e.preventDefault(); return; }
        if (c === "KeyP") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused(!paused);
            e.preventDefault(); return;
        }
        if (c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            e.preventDefault(); return;
        }
        if (blocked()) {
            if (c === "Enter" || c === "Space" || e.key === " ") {
                if (helpOpen) toggleHelp(false);
                else if (cheatsOpen) toggleCheats(false);
                else if (paused) setPaused(false);
                e.preventDefault();
            }
            return;
        }
        if (over) {
            if (c === "Enter" || c === "Space" || e.key === " ") { newGame(); e.preventDefault(); }
            return;
        }
        const dir = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        }[c];
        if (dir) { moveDir(dir); e.preventDefault(); }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------- first-run internal help ---------- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem(HELP_KEY, "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- boot ---------- */
    newGame();
    syncUI();

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            clearTimers();
            stopTimer();
        },
        _test: {
            isSolved, // (tiles, cols) -> bool
            applyMove, // (tiles, idx, cols) -> new tiles | null (pure)
            genShuffle, // (cols, rows) -> { tiles, moves } (always solvable)
            replayInverse, // (tiles, moves, cols) -> solved tiles | null (solvability proof)
            solvedTiles, // (cols, rows) -> [1..N-1, 0]
        },
    };
}
