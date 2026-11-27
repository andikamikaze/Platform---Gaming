/* ==== GAME: connect-four.js ==== */
/* =============================================================
   CONNECT FOUR - minimalist red vs blue
   - AI mode  : minimax + alpha-beta (Hard depth 4 / Easy depth 1),
                 random first mover, cheat overlay (offline only).
   - Room mode: host-authoritative state, random seat (red/blue)
                 and random first mover on every round.
   - Input    : tap/click a column (no virtual mobile buttons),
                 keys 1-7, arrows + Enter/Space, H, C, P, R, Esc.
   - Layout   : HUD bar + fill-height board, internal How-to-play
                 modal (once per install), pause freezes AI timers.
   - No level generator, no emoji, no assets.
   ============================================================= */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "connect-four", // harus sama dengan nama file (tanpa .js)
    name: "Connect Four",
    category: "board",
    catLabel: "Board",
    desc: "Drop discs and connect four in a row before your opponent does.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><rect x="5" y="9" width="38" height="34" rx="5"/><circle cx="14.5" cy="18.5" r="3.6" fill="currentColor" stroke="none"/><circle cx="24" cy="18.5" r="3.6"/><circle cx="33.5" cy="18.5" r="3.6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="28" r="3.6"/><circle cx="24" cy="28" r="3.6" fill="currentColor" stroke="none"/><circle cx="33.5" cy="28" r="3.6"/><circle cx="14.5" cy="37.5" r="3.6" fill="currentColor" stroke="none"/><circle cx="24" cy="37.5" r="3.6"/><circle cx="33.5" cy="37.5" r="3.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#f87171", "#3b82f6"],
};

/* ---------- pure rules + AI helpers (no DOM) ---------- */
const COLS = 7,
    ROWS = 6;
const COLORS = { 1: "#ef4444", 2: "#3b82f6" }; // red / blue
const NAMES = { 1: "Red", 2: "Blue" };
const ORDER = [3, 2, 4, 1, 5, 0, 6]; // center-first move preference

const emptyGrid = () =>
    Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

const lowRow = (g, c) => {
    for (let r = ROWS - 1; r >= 0; r--) if (!g[r][c]) return r;
    return -1;
};

function winCellsAt(g, r, c) {
    const p = g[r][c];
    if (!p) return null;
    const dirs = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
    ];
    for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        for (let s = 1; s < 4; s++) {
            const rr = r + dr * s,
                cc = c + dc * s;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || g[rr][cc] !== p) break;
            cells.push([rr, cc]);
        }
        for (let s = 1; s < 4; s++) {
            const rr = r - dr * s,
                cc = c - dc * s;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || g[rr][cc] !== p) break;
            cells.unshift([rr, cc]);
        }
        if (cells.length >= 4) return cells;
    }
    return null;
}

function score4(a, b, c, d) {
    let me = 0,
        yo = 0;
    if (a === 2) me++;
    else if (a === 1) yo++;
    if (b === 2) me++;
    else if (b === 1) yo++;
    if (c === 2) me++;
    else if (c === 1) yo++;
    if (d === 2) me++;
    else if (d === 1) yo++;
    if (me && yo) return 0;
    if (me === 4) return 100000;
    if (yo === 4) return -100000;
    if (me === 3) return 60;
    if (yo === 3) return -80;
    if (me === 2) return 9;
    if (yo === 2) return -10;
    return 0;
}

function evaluate(g) {
    let s = 0;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 4; c++)
            s += score4(g[r][c], g[r][c + 1], g[r][c + 2], g[r][c + 3]);
    for (let c = 0; c < COLS; c++)
        for (let r = 0; r < 3; r++)
            s += score4(g[r][c], g[r + 1][c], g[r + 2][c], g[r + 3][c]);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) {
            s += score4(g[r][c], g[r + 1][c + 1], g[r + 2][c + 2], g[r + 3][c + 3]);
            s += score4(g[r + 3][c], g[r + 2][c + 1], g[r + 1][c + 2], g[r][c + 3]);
        }
    for (let r = 0; r < ROWS; r++) {
        if (g[r][3] === 2) s += 4;
        else if (g[r][3] === 1) s -= 4;
    }
    return s;
}

function winnerOf(g) {
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 4; c++) {
            const w = g[r][c];
            if (w && g[r][c + 1] === w && g[r][c + 2] === w && g[r][c + 3] === w) return w;
        }
    for (let c = 0; c < COLS; c++)
        for (let r = 0; r < 3; r++) {
            const w = g[r][c];
            if (w && g[r + 1][c] === w && g[r + 2][c] === w && g[r + 3][c] === w) return w;
        }
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) {
            const w = g[r][c];
            if (w && g[r + 1][c + 1] === w && g[r + 2][c + 2] === w && g[r + 3][c + 3] === w) return w;
            const v = g[r + 3][c];
            if (v && g[r + 2][c + 1] === v && g[r + 1][c + 2] === v && g[r][c + 3] === v) return v;
        }
    return 0;
}

function minimax(g, depth, alpha, beta, maxing) {
    const w = winnerOf(g);
    if (w === 2) return 100000 + depth * 10;
    if (w === 1) return -100000 - depth * 10;
    const cols = [];
    for (const c of ORDER) if (!g[0][c]) cols.push(c);
    if (!cols.length) return 0;
    if (depth === 0) return evaluate(g);
    if (maxing) {
        let best = -Infinity;
        for (const c of cols) {
            const r = lowRow(g, c);
            g[r][c] = 2;
            const s = minimax(g, depth - 1, alpha, beta, false);
            g[r][c] = 0;
            if (s > best) best = s;
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        return best;
    }
    let best = Infinity;
    for (const c of cols) {
        const r = lowRow(g, c);
        g[r][c] = 1;
        const s = minimax(g, depth - 1, alpha, beta, true);
        g[r][c] = 0;
        if (s < best) best = s;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
    }
    return best;
}

/* Best column for `seat` (1 = red, 2 = blue). Random tie-break. */
function bestColumn(g, seat, depth) {
    const cols = [];
    for (const c of ORDER) if (!g[0][c]) cols.push(c);
    if (!cols.length) return -1;
    let best = seat === 2 ? -Infinity : Infinity;
    let picks = [];
    for (const c of cols) {
        const r = lowRow(g, c);
        g[r][c] = seat;
        const s = minimax(g, depth - 1, -Infinity, Infinity, seat !== 2);
        g[r][c] = 0;
        const better = seat === 2 ? s > best : s < best;
        if (better) {
            best = s;
            picks = [c];
        } else if (s === best) picks.push(c);
    }
    return picks[(Math.random() * picks.length) | 0];
}
/* ---------- end pure helpers ---------- */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* ---------- local (non-synced) state ---------- */
    let diff = "hard";
    let busy = false;
    let aiQueued = false;
    let hoverC = null;
    let cursor = 3;
    let cursorVisible = false;
    let hintCol = null;
    let skipAI = false;
    const cheats = { weak: false, threats: false };
    let history = []; // offline snapshots for the Undo cheat
    const score = { w: 0, l: 0, d: 0 };
    let talliedRound = 0;
    let resultShown = false;
    let resultOpen = false;
    let renderedRound = -1;
    let renderedMoves = -1;
    let discEls = [];
    let helpOpen = false, cheatsOpen = false, paused = false;

    /* Pause-aware timers: keep Date.now() due anchors and replay only the
       remaining delay on resume so the AI drop / result never jump ahead. */
    const timers = new Map();
    let deferredTimers = [];
    let pauseStart = 0, pauseOffset = 0;
    const nowMs = () => Date.now() - pauseOffset;

    function later(key, fn, ms) {
        clearTimer(key);
        if (paused) {
            deferredTimers.push({ key, fn, wait: Math.max(0, ms) });
            return;
        }
        const id = setTimeout(() => {
            timers.delete(key);
            if (!destroyed && !paused) fn();
        }, ms);
        timers.set(key, { id, due: nowMs() + ms, fn });
    }
    function clearTimer(key) {
        const rec = timers.get(key);
        if (rec) {
            clearTimeout(rec.id);
            timers.delete(key);
        }
        deferredTimers = deferredTimers.filter((t) => t.key !== key);
    }
    function clearTimers() {
        for (const rec of timers.values()) clearTimeout(rec.id);
        timers.clear();
        deferredTimers = [];
    }
    function pauseTimers() {
        const now = nowMs();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferredTimers.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function resumeTimers() {
        const queue = deferredTimers;
        deferredTimers = [];
        for (const t of queue) later(t.key, t.fn, t.wait);
    }

    /* First-run internal guide, shown once per install. */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("connectFourHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("connectFourHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- markup: HUD bar + fill-height board ---------- */
    root.innerHTML = `
<style>
/* Connect Four — deep-blue bridge, red/blue discs, HUD + fill-height board. */
.cf{--cf-acc:#3b82f6;width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:10px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cf *{box-sizing:border-box}
.cf :is(button,select,input):focus-visible{outline:2px solid var(--cf-acc);outline-offset:2px}
.cf [hidden]{display:none!important}
.cf-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.cf-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid rgba(148,163,184,.28);border-radius:999px;background:rgba(148,163,184,.08);white-space:nowrap}
.cf-chip b{font-weight:700;font-variant-numeric:tabular-nums}
.cf-dot{width:8px;height:8px;border-radius:50%;background:#64748b;flex:none}
.cf-spacer{flex:1 1 auto;min-width:6px}
.cf-btn{font:inherit;font-size:11px;padding:7px 10px;min-height:32px;border:1px solid rgba(148,163,184,.28);background:rgba(148,163,184,.08);color:inherit;border-radius:9px;cursor:pointer;transition:background .15s,border-color .15s}
.cf-btn:hover:not(:disabled){background:rgba(148,163,184,.16)}
.cf-btn:disabled{opacity:.4;cursor:default}
.cf-btn.on{border-color:var(--cf-acc);color:var(--cf-acc)}
.cf-icon-btn{display:inline-flex;align-items:center;gap:6px}
.cf-icon-btn svg{flex:none;display:block}
.cf-btn-label{white-space:nowrap}
.cf.game-fill>.cf-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:0;border-radius:12px;overflow:hidden;background:#0a0f1e}
.cf svg.cf-svg{display:block;width:100%;height:100%;max-width:none;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.cf .cf-frame{fill:#141a2e;stroke:rgba(148,163,184,.16);stroke-width:1.5}
.cf .cf-hole{fill:#0a0f1e}
.cf .cf-hit{fill:transparent;cursor:pointer}
.cf .cf-hl{fill:#94a3b8;opacity:0;transition:opacity .12s}
.cf .cf-ghost{opacity:0;transition:opacity .15s}
.cf .cf-ghost.cf-on{opacity:.5}
.cf .cf-disc{transition:opacity .2s}
.cf .cf-dim .cf-disc{opacity:.22}
.cf .cf-dim .cf-disc.cf-winner{opacity:1}
.cf .cf-ring{fill:none;stroke:#fff;stroke-width:3;animation:cf-pop .3s ease-out}
@keyframes cf-pop{from{opacity:0;stroke-width:10}to{opacity:1;stroke-width:3}}
.cf .cf-threat{fill:none;stroke:var(--cf-acc);stroke-width:2.5;stroke-dasharray:5 5;opacity:.9}
.cf .cf-hintmark{animation:cf-bob 1s ease-in-out infinite}
@keyframes cf-bob{50%{transform:translateY(5px)}}
.cf .cf-thinking{animation:cf-blink 1.1s infinite}
@keyframes cf-blink{50%{opacity:.4}}
.cf-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55);backdrop-filter:blur(3px);border-radius:12px;z-index:5;padding:12px}
.cf-card{width:min(380px,100%);max-height:100%;overflow:hidden;background:#0f1526;border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:16px 18px;color:#e2e8f0;display:flex;flex-direction:column;gap:10px}
.cf-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}
.cf-head h3{margin:0;font-size:16px;font-weight:600}
.cf-x{min-width:36px;min-height:36px;background:none;border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.6;padding:2px 6px}
.cf-x:hover{opacity:1}
.cf-cheats,.cf-stats,.cf-help{flex:1 1 auto;min-height:0;overflow:auto}
.cf-cheats{display:flex;flex-direction:column;gap:2px}
.cf-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cf-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;opacity:.6;text-transform:uppercase}
.cf-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6}
.cf-kbd{display:inline-block;padding:1px 5px;border:1px solid rgba(148,163,184,.32);border-bottom-width:2px;border-radius:5px;font:600 10px/1.4 ui-monospace,monospace}
.cf-meta{margin:0;font-size:12.5px;opacity:.62;letter-spacing:.02em}
.cf-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13.5px;min-height:40px}
.cf-row span{opacity:.85}
.cf-btn.cf-active{border-color:var(--cf-acc);background:rgba(59,130,246,.18)}
.cf-primary{background:var(--cf-acc);border-color:var(--cf-acc);color:#fff;padding:10px 14px;min-height:40px}
.cf-primary:hover:not(:disabled){background:#2f6fe0}
.cf-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.cf-note{font-size:11px;opacity:.6}
.cf-result-card{align-items:center;text-align:center}
@media (prefers-reduced-motion:reduce){.cf *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
  .cf.game-fill>.cf-panel:not(:has(.cf-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
  .cf.game-fill>.cf-panel:has(.cf-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .cf{gap:6px}
  .cf .cf-hud{gap:5px}
  .cf .cf-hud .cf-chip{padding:4px 6px;font-size:9px;min-height:0}
  .cf .cf-hud .cf-chip[data-you],.cf .cf-hud .cf-chip[data-mode]{display:none}
  .cf .cf-hud .cf-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .cf .cf-hud .cf-btn-label,.cf .cf-hud .cf-spacer{display:none}
  .cf-ov{padding:8px}
  .cf-card{width:100%;height:100%;max-height:100%;padding:12px}
  .cf-help{grid-template-columns:1fr;gap:8px}
  .cf-cheats,.cf-stats,.cf-help{scrollbar-width:none}
  .cf-cheats::-webkit-scrollbar,.cf-stats::-webkit-scrollbar,.cf-help::-webkit-scrollbar{display:none}
  .cf-foot{padding-top:8px;border-top:1px solid rgba(148,163,184,.2)}
  .cf-note{display:none}
}
@media (pointer:coarse){
  .cf .cf-hud .cf-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .cf .cf-card .cf-primary,.cf .cf-card .cf-x{min-height:44px}
}
</style>
<div class="game-app cf game-fill" data-cf>
  <div class="cf-hud">
    <span class="cf-chip"><i class="cf-dot" data-dot></i><b data-turn>—</b></span>
    <span class="cf-chip" data-status>Ready</span>
    <span class="cf-chip" data-you>You: Red</span>
    <span class="cf-chip" data-score>0W · 0L · 0D</span>
    <span class="cf-chip" data-mode>Solo</span>
    <span class="cf-spacer"></span>
    <button class="cf-btn" type="button" data-diff title="Toggle AI strength" ${online ? "hidden" : ""} aria-label="AI difficulty">AI: <span data-diff-label>Hard</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="cf-btn-label">Help</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "disabled" : ""}>${iconSVG("wrench", { size: 14 })}<span class="cf-btn-label">Cheats</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="cf-btn-label">Pause</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="cf-btn-label">Restart</span></button>
    <button class="cf-btn cf-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="cf-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel cf-panel" data-board>
    <svg class="cf-svg" viewBox="0 0 472 472" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Connect Four board">
      <rect x="4" y="64" width="464" height="408" rx="18" class="cf-frame"/>
      <g data-holes></g>
      <g data-hls></g>
      <g data-threats></g>
      <g data-discs></g>
      <g data-marks></g>
      <circle class="cf-ghost" data-ghost r="22" cy="32" fill="#ef4444"/>
      <g data-hits></g>
    </svg>
    <div class="cf-ov" data-ov="cheat" hidden>
      <div class="cf-card">
        <div class="cf-head"><h3>Cheats</h3><button class="cf-x" type="button" data-cheats-close aria-label="Close">&times;</button></div>
        <div class="cf-cheats">
          <div class="cf-row"><span>Best move hint</span><button class="cf-btn" type="button" data-cheat="hint">Show</button></div>
          <div class="cf-row"><span>Undo my last move</span><button class="cf-btn" type="button" data-cheat="undo">Undo</button></div>
          <div class="cf-row"><span>Skip AI turn (once)</span><button class="cf-btn" type="button" data-cheat="skip">Arm</button></div>
          <div class="cf-row"><span>Weak AI (random moves)</span><button class="cf-btn" type="button" data-cheat="weak">Off</button></div>
          <div class="cf-row"><span>Threat scanner</span><button class="cf-btn" type="button" data-cheat="threats">Off</button></div>
        </div>
        <div class="cf-foot"><span class="cf-note">Offline games only</span></div>
      </div>
    </div>
    <div class="cf-ov" data-ov="over" hidden>
      <div class="cf-card cf-result-card">
        <div class="cf-head"><h3 data-result-title>Result</h3></div>
        <div class="cf-stats"><p class="cf-meta" data-result-sub></p></div>
        <div class="cf-foot"><span class="cf-note">Press R for a new round</span><button class="cf-btn cf-primary" type="button" data-again>Play again</button></div>
      </div>
    </div>
    <div class="cf-ov" data-ov="pause" hidden>
      <div class="cf-card">
        <div class="cf-head"><h3>Paused</h3></div>
        <div class="cf-stats"><p>The board and AI timer are frozen.</p></div>
        <div class="cf-foot"><span class="cf-note">Press P or Esc to resume</span><button class="cf-btn cf-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="cf-ov" data-ov="help" hidden>
      <div class="cf-card">
        <div class="cf-head"><h3>How to play</h3><button class="cf-x" type="button" data-help-close aria-label="Close">&times;</button></div>
        <div class="cf-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a column to drop your disc.</li>
              <li><span class="cf-kbd">1</span>–<span class="cf-kbd">7</span> drop directly into a column.</li>
              <li><span class="cf-kbd">←</span> <span class="cf-kbd">→</span> aim, <span class="cf-kbd">Enter</span> / <span class="cf-kbd">Space</span> / <span class="cf-kbd">↓</span> drop.</li>
              <li><span class="cf-kbd">H</span> help · <span class="cf-kbd">C</span> cheats · <span class="cf-kbd">P</span> pause · <span class="cf-kbd">R</span> restart · <span class="cf-kbd">Esc</span> close</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a column to drop a disc; the board keeps its square shape.</li>
              <li>Use the HUD buttons for Help, Cheats, Pause, Restart and Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Connect four of your discs horizontally, vertically or diagonally to win.</li>
              <li>The board is 7 columns × 6 rows; a full board with no winner is a draw.</li>
              <li>Who moves first is random. In Room mode your red/blue seat is random too.</li>
              <li>Your seat, turn, W-L-D tally and AI strength live in the HUD bar.</li>
              <li>Cheats (hint, undo, skip AI, weak AI, threat scan) are offline only.</li>
            </ul>
            <div class="cf-foot"><span class="cf-note">Press H to reopen this guide</span><button class="cf-btn cf-primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- dom helpers ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    const svg = $(".cf-svg");
    const gHoles = $("[data-holes]");
    const gHls = $("[data-hls]");
    const gThreats = $("[data-threats]");
    const gDiscs = $("[data-discs]");
    const gMarks = $("[data-marks]");
    const gHits = $("[data-hits]");
    const ghost = $("[data-ghost]");
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const turnEl = $("[data-turn]");
    const youEl = $("[data-you]");
    const scoreEl = $("[data-score]");
    const modeEl = $("[data-mode]");
    const ov = {
        cheat: $('[data-ov="cheat"]'),
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        help: $('[data-ov="help"]'),
    };
    const resultTitle = $("[data-result-title]");
    const resultSub = $("[data-result-sub]");
    const diffLabel = $("[data-diff-label]");
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const hintBtn = $('[data-cheat="hint"]');
    const undoBtn = $('[data-cheat="undo"]');
    const skipBtn = $('[data-cheat="skip"]');
    const weakBtn = $('[data-cheat="weak"]');
    const threatBtn = $('[data-cheat="threats"]');

    const cxOf = (c) => 44 + c * 64;
    const cyOf = (r) => 108 + r * 64;

    /* ---------- static board + pointer input (mouse & touch) ---------- */
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            mk("circle", { cx: cxOf(c), cy: cyOf(r), r: 27, class: "cf-hole" }, gHoles);

    const hlEls = [];
    for (let c = 0; c < COLS; c++) {
        hlEls.push(
            mk("rect", { x: 12 + c * 64, y: 64, width: 64, height: 408, class: "cf-hl" }, gHls),
        );
        const hit = mk(
            "rect",
            { x: 12 + c * 64, y: 0, width: 64, height: 472, class: "cf-hit" },
            gHits,
        );
        hit.addEventListener("pointerdown", () => tryDrop(c));
        hit.addEventListener("pointerenter", () => {
            hoverC = c;
            cursor = c;
            refreshHover();
        });
        hit.addEventListener("pointerleave", () => {
            hoverC = null;
            refreshHover();
        });
    }
    svg.addEventListener("pointerleave", () => {
        hoverC = null;
        refreshHover();
    });

    /* ---------- seats / turns ---------- */
    // Random seat assignment in multiplayer: the host draws a seat (1 or 2)
    // every round, the guest gets the other one. Offline the human is red.
    function mySeat() {
        if (!online) return 1;
        if (!state) return room.isHost ? 1 : 2;
        return room.isHost ? state.hostSeat : 3 - state.hostSeat;
    }

    function freshState(prevRound) {
        return {
            grid: emptyGrid(),
            turn: Math.random() < 0.5 ? 1 : 2, // random first mover (both modes)
            moves: 0,
            over: false,
            winner: 0,
            winCells: null,
            lastMove: null,
            hostSeat: online ? (Math.random() < 0.5 ? 1 : 2) : 1, // random seat
            round: prevRound + 1,
        };
    }

    function canPlay() {
        return Boolean(state) && !state.over && !busy && !paused && !helpOpen && !cheatsOpen && state.turn === mySeat();
    }

    /* ---------- canonical state flow (template pattern) ---------- */
    function publish() {
        settle();
        render();
        // Only the host writes canonical state to Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, seat) {
        if (destroyed || !state || !action) return;
        if (action.type === "restart") {
            resetRound();
            publish();
            return;
        }
        if (action.type !== "drop") return;
        if (state.over || state.turn !== seat) return;
        const c = Number(action.col);
        if (!Number.isInteger(c) || c < 0 || c >= COLS) return;
        const r = lowRow(state.grid, c);
        if (r < 0) return;
        if (!online && seat === 1) history.push(JSON.parse(JSON.stringify(state)));
        if (seat === 2) hintCol = null;
        state.grid[r][c] = seat;
        state.moves++;
        state.lastMove = { r, c, p: seat };
        const cells = winCellsAt(state.grid, r, c);
        if (cells) {
            state.over = true;
            state.winner = seat;
            state.winCells = cells;
        } else if (state.moves >= ROWS * COLS) {
            state.over = true;
            state.winner = 0;
            state.winCells = null;
        } else {
            let next = 3 - seat;
            if (!online && seat === 1 && skipAI) {
                skipAI = false; // cheat: extra turn, AI is skipped once
                next = 1;
            }
            state.turn = next;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    function tryDrop(c) {
        if (!canPlay()) return;
        hintCol = null;
        submitAction({ type: "drop", col: c });
    }

    /* ---------- round management ---------- */
    function resetRound() {
        clearTimers();
        aiQueued = false;
        busy = false;
        history = [];
        hintCol = null;
        skipAI = false;
        talliedRound = 0;
        resultShown = false;
        resultOpen = false;
        cheatsOpen = false;
        state = freshState(state ? state.round : 0);
    }

    /* Score tally + offline AI scheduling after any state change. */
    function settle() {
        if (!state) return;
        if (state.over && talliedRound !== state.round) {
            talliedRound = state.round;
            const me = mySeat();
            if (state.winner === 0) score.d++;
            else if (state.winner === me) score.w++;
            else score.l++;
            if (!resultShown) {
                resultShown = true;
                later("result", showResult, 900);
            }
        }
        if (!online && !state.over && state.turn === 2 && !aiQueued) {
            aiQueued = true;
            later("ai", () => {
                aiQueued = false;
                aiTurn();
            }, 720);
        }
    }

    /* ---------- AI ---------- */
    function aiTurn() {
        if (destroyed || online || !state || state.over || state.turn !== 2) return;
        const cols = [];
        for (const c of ORDER) if (!state.grid[0][c]) cols.push(c);
        if (!cols.length) return;
        let pick;
        if (cheats.weak) pick = cols[(Math.random() * cols.length) | 0];
        else {
            pick = bestColumn(state.grid, 2, diff === "easy" ? 1 : 4);
            if (pick < 0) pick = cols[0];
        }
        applyAction({ type: "drop", col: pick }, 2);
    }

    /* ---------- cheats (offline only) ---------- */
    function undoCheat() {
        if (online || !state || !history.length) return;
        clearTimers();
        aiQueued = false;
        busy = false;
        if (talliedRound === state.round) {
            const me = mySeat();
            if (state.winner === 0) score.d = Math.max(0, score.d - 1);
            else if (state.winner === me) score.w = Math.max(0, score.w - 1);
            else score.l = Math.max(0, score.l - 1);
            talliedRound = 0;
        }
        resultShown = false;
        resultOpen = false;
        state = history.pop(); // back to before your last move (AI reply included)
        hintCol = null;
        render();
    }

    function handleCheat(kind) {
        if (online) return;
        if (kind === "hint") {
            if (canPlay()) hintCol = bestColumn(state.grid, 1, 4);
        } else if (kind === "undo") undoCheat();
        else if (kind === "skip") {
            if (state && !state.over) skipAI = !skipAI;
        } else if (kind === "weak") cheats.weak = !cheats.weak;
        else if (kind === "threats") cheats.threats = !cheats.threats;
        updateButtons();
        render();
    }

    /* ---------- rendering ---------- */
    function renderDiscs(animateLast) {
        gDiscs.innerHTML = "";
        discEls = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
        svg.classList.remove("cf-dim");
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++) {
                const p = state.grid[r][c];
                if (!p) continue;
                const el = mk(
                    "circle",
                    { cx: cxOf(c), cy: cyOf(r), r: 27, class: "cf-disc", fill: COLORS[p] },
                    gDiscs,
                );
                discEls[r][c] = el;
                if (animateLast && state.lastMove && state.lastMove.r === r && state.lastMove.c === c) {
                    el.style.transform = "translateY(" + -(cyOf(r) - 32) + "px)";
                    el.style.transition = "transform .5s cubic-bezier(.3,.6,.4,1.08)";
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => {
                            if (!destroyed) el.style.transform = "translateY(0)";
                        }),
                    );
                }
            }
        if (state.over && state.winCells) {
            svg.classList.add("cf-dim");
            state.winCells.forEach((cell) => {
                const el = discEls[cell[0]][cell[1]];
                if (el) el.classList.add("cf-winner");
                mk("circle", { cx: cxOf(cell[1]), cy: cyOf(cell[0]), r: 27, class: "cf-ring" }, gDiscs);
            });
        }
    }

    function renderMarks() {
        gThreats.innerHTML = "";
        gMarks.innerHTML = "";
        if (!state || state.over || online) return;
        if (cheats.threats) {
            for (let c = 0; c < COLS; c++) {
                const r = lowRow(state.grid, c);
                if (r < 0) continue;
                state.grid[r][c] = 2;
                const w = winCellsAt(state.grid, r, c);
                state.grid[r][c] = 0;
                if (w)
                    mk("circle", { cx: cxOf(c), cy: cyOf(r), r: 27, class: "cf-threat" }, gThreats);
            }
        }
        if (hintCol != null && !state.grid[0][hintCol]) {
            const x = cxOf(hintCol);
            mk(
                "polygon",
                {
                    points: x - 9 + ",12 " + (x + 9) + ",12 " + x + ",30",
                    fill: COLORS[1],
                    class: "cf-hintmark",
                },
                gMarks,
            );
        }
    }

    function refreshHover() {
        hlEls.forEach((h) => (h.style.opacity = 0));
        const c = hoverC != null ? hoverC : cursorVisible ? cursor : null;
        if (c != null && canPlay() && lowRow(state.grid, c) >= 0) {
            ghost.setAttribute("cx", cxOf(c));
            ghost.setAttribute("fill", COLORS[mySeat()]);
            ghost.classList.add("cf-on");
            hlEls[c].style.opacity = 0.12;
        } else {
            ghost.classList.remove("cf-on");
        }
    }

    function setStatus(text, color, thinking) {
        statusEl.textContent = text;
        dotEl.style.background = color;
        statusEl.classList.toggle("cf-thinking", Boolean(thinking));
    }

    function updateButtons() {
        if (diffLabel) diffLabel.textContent = diff === "hard" ? "Hard" : "Easy";
        weakBtn.textContent = cheats.weak ? "On" : "Off";
        weakBtn.classList.toggle("cf-active", cheats.weak);
        threatBtn.textContent = cheats.threats ? "On" : "Off";
        threatBtn.classList.toggle("cf-active", cheats.threats);
        skipBtn.textContent = skipAI ? "Armed" : "Arm";
        skipBtn.classList.toggle("cf-active", skipAI);
        skipBtn.disabled = !state || state.over;
        undoBtn.disabled = online || !history.length;
        hintBtn.disabled = !canPlay();
    }

    /* Overlays suppress each other: help > cheats > pause > result.
       HUD labels update via the label span so the icon is never destroyed. */
    function syncUI() {
        ov.over.hidden = !resultOpen || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        if (cheatsBtn) cheatsBtn.classList.toggle("on", cheatsOpen || cheats.weak || cheats.threats || skipAI);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".cf-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        }
        if (diffLabel) diffLabel.textContent = diff === "hard" ? "Hard" : "Easy";
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }

    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) {
            pauseStart = Date.now();
            pauseTimers();
        } else {
            if (pauseStart) pauseOffset += Date.now() - pauseStart;
            pauseStart = 0;
            resumeTimers();
        }
        render();
    }

    function restartRound() {
        helpOpen = false;
        cheatsOpen = false;
        if (paused) togglePause(false);
        submitAction({ type: "restart" });
    }

    function render() {
        if (destroyed) return;
        updateButtons();
        if (!state) {
            setStatus("Waiting for host", "#64748b", false);
            turnEl.textContent = "—";
            youEl.textContent = "You: " + NAMES[mySeat()];
            scoreEl.textContent = score.w + "W · " + score.l + "L · " + score.d + "D";
            modeEl.textContent = online ? "Room" : "Solo";
            gDiscs.innerHTML = "";
            gThreats.innerHTML = "";
            gMarks.innerHTML = "";
            refreshHover();
            syncUI();
            return;
        }
        const me = mySeat();
        const newRound = state.round !== renderedRound;
        const advanced = !newRound && state.lastMove && state.moves === renderedMoves + 1;
        if (newRound || state.moves !== renderedMoves) {
            renderDiscs(advanced);
            renderedRound = state.round;
            renderedMoves = state.moves;
            if (advanced) {
                busy = true;
                later("busy", () => {
                    busy = false;
                    render();
                }, 500);
            }
        }
        renderMarks();
        refreshHover();
        if (state.over) {
            if (state.winner === 0) setStatus("Draw", "#94a3b8", false);
            else
                setStatus(
                    state.winner === me ? "You win" : online ? "Rival wins" : "AI wins",
                    COLORS[state.winner],
                    false,
                );
        } else if (state.turn === me) {
            setStatus("Your turn", COLORS[me], false);
        } else {
            setStatus(online ? "Rival's turn" : "AI thinking", COLORS[state.turn], !online);
        }
        turnEl.textContent = NAMES[state.turn];
        youEl.textContent = "You: " + NAMES[me];
        scoreEl.textContent = score.w + "W · " + score.l + "L · " + score.d + "D";
        modeEl.textContent = online ? "Room" : "Solo";
        syncUI();
    }

    function showResult() {
        if (destroyed || !state || !state.over) return;
        const me = mySeat();
        if (state.winner === 0) {
            resultTitle.textContent = "Draw";
            resultTitle.style.color = "";
        } else {
            resultTitle.textContent =
                state.winner === me ? "You win" : online ? "Rival wins" : "AI wins";
            resultTitle.style.color = COLORS[state.winner];
        }
        resultSub.textContent = "Session " + score.w + " - " + score.l + " - " + score.d;
        resultOpen = true;
        syncUI();
    }

    /* ---------- click delegation ---------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) {
            if (!online) { cheatsOpen = !cheatsOpen; render(); }
            return;
        }
        if (t.closest("[data-cheats-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]") || t.closest("[data-again]")) { restartRound(); return; }
        if (t.closest("[data-diff]")) {
            if (!online) { diff = diff === "hard" ? "easy" : "hard"; updateButtons(); syncUI(); }
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) handleCheat(ch.getAttribute("data-cheat"));
    }

    /* ---------- keyboard (desktop) ---------- */
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
        const code = e.code || "";
        const k = e.key;
        /* priority: help -> cheats -> pause -> escape -> restart -> game actions */
        if (code === "KeyH" || k === "?") {
            if (!e.repeat) toggleHelp();
            e.preventDefault();
            return;
        }
        if (code === "KeyC") {
            if (!e.repeat && !online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); }
            e.preventDefault();
            return;
        }
        if (code === "KeyP") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault();
            return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (paused) togglePause(false);
            else if (cursorVisible) { cursorVisible = false; refreshHover(); }
            e.preventDefault();
            return;
        }
        if (code === "KeyR") {
            if (!e.repeat) restartRound();
            e.preventDefault();
            return;
        }
        if (tag === "BUTTON") return; /* keep native Enter/Space on HUD buttons */
        if (helpOpen || cheatsOpen || paused) { e.preventDefault(); return; }
        if (k >= "1" && k <= "7") {
            cursor = Number(k) - 1;
            tryDrop(cursor);
            return;
        }
        if (k === "ArrowLeft" || k === "ArrowRight") {
            e.preventDefault();
            cursor = Math.min(COLS - 1, Math.max(0, cursor + (k === "ArrowRight" ? 1 : -1)));
            cursorVisible = true;
            hoverC = null;
            refreshHover();
            return;
        }
        if (k === "Enter" || k === " " || k === "ArrowDown") {
            if (cursorVisible) {
                e.preventDefault();
                tryDrop(cursor);
            }
            return;
        }
    }

    /* ---------- boot ---------- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        room.onRoom((nextRoom) => {
            if (destroyed) return;
            roomData = nextRoom;
            render();
        });
        if (room.isHost) {
            resetRound();
            publish();
            // Guest seat is the opposite of the randomly drawn host seat.
            room.onAction((action) => applyAction(action, 3 - state.hostSeat));
        } else {
            render();
            room.onState((nextState) => {
                if (destroyed) return;
                state = nextState;
                settle();
                render();
            });
        }
    } else {
        resetRound();
        publish();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
        },
    };
}
