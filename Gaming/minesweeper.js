/* ==== GAME: minesweeper.js ==== */
import { iconSVG } from "../JS/icons.js";

/* =============================================================
MINESWEEPER - MGP puzzle module (ESM layout redesign)
Classic minesweeper: safe first click (3x3 mine-free zone),
flood reveal (BFS), flags, wrong-flag highlighting, timer and
three difficulty boards. Pure inline SVG, no canvas, no emoji.
============================================================= */
export const META = {
    id: "minesweeper",
    name: "Minesweeper",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Reveal every safe cell, flag the mines, never click the wrong one.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 19v-7M18 39v7M8 29H1M28 29h6M25 22l5-5M11 22l-5-5M25 36l5 5M11 36l-5 5" stroke-width="2.5"/><circle cx="18" cy="29" r="8" fill="currentColor" stroke="none"/><circle cx="15.2" cy="26.2" r="1.7" fill="#ffffff" stroke="none" opacity=".8"/><path d="M40 13v24"/><path d="M40 13l8 3.5-8 3.5z" fill="currentColor" stroke="none"/><path d="M36 37h8"/></svg>',
    bg: ["#fee2e2", "#fecaca"],
};

export function mount(root, context = {}) {
    const { onExit = () => { } } = context;

    /* ---------- scoped styles + shell ---------- */
    root.innerHTML = `
<style>
.msw{--msw-bg:#0b1020;--msw-panel:#111a30;--msw-ink:#e2e8f0;--msw-mut:#94a3b8;--msw-line:#334155;--msw-acc:#6366f1;--msw-ok:#22c55e;--msw-warn:#f59e0b;--msw-danger:#ef4444;
  display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0;color:var(--msw-ink);
  font:600 11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.msw *,.msw *::before,.msw *::after{box-sizing:border-box}
.msw [hidden]{display:none!important}
.msw :where(svg,canvas,img){max-width:100%}
.msw :where(button,[role="button"]){touch-action:manipulation}
.msw :where(button,[role="button"]):focus-visible{outline:2px solid var(--msw-acc);outline-offset:2px}
.msw-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;min-width:0}
.msw-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--msw-line);border-radius:999px;background:var(--msw-panel);color:var(--msw-mut);white-space:nowrap}
.msw-chip b{color:var(--msw-ink);font-weight:700;font-variant-numeric:tabular-nums}
.msw-chip[data-hud="status"]{color:var(--msw-ok)}
.msw-chip[data-hud="status"][data-state="over"]{color:var(--msw-danger)}
.msw-spacer{flex:1 1 auto}
.msw-btn{border:1px solid var(--msw-line);background:var(--msw-panel);color:var(--msw-ink);border-radius:9px;padding:7px 11px;min-height:34px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.04em;cursor:pointer}
.msw-btn:hover{border-color:var(--msw-acc);color:#fff}
.msw-btn.primary{background:var(--msw-acc);border-color:var(--msw-acc);color:#fff}
.msw-btn.on{border-color:var(--msw-warn);color:var(--msw-warn);background:#33240c}
.msw-icon-btn{display:inline-flex;align-items:center;gap:6px}
.msw-icon-btn svg{flex:none;display:block}
.msw-board{position:relative;display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-height:0;padding:10px;border:1px solid var(--msw-line);border-radius:14px;background:var(--msw-bg);overflow:hidden}
.msw-svg{display:block;width:100%;height:100%;max-width:min(100%,720px);max-height:100%;touch-action:manipulation}
.msw-cell{cursor:pointer}
.msw-hid{fill:#2c3a5e;stroke:#3d4f7d;stroke-width:1;transition:fill .12s}
.msw-hid:hover{fill:#3d5083}
.msw-open{fill:#151d33;stroke:#253156;stroke-width:1;cursor:default}
.msw-dead{fill:#b91c1c;stroke:#b91c1c}
.msw-num{pointer-events:none}
.msw-cur{fill:none;stroke:#f1f5f9;stroke-width:1.6;stroke-dasharray:5 4;opacity:.9;pointer-events:none}
.msw-xray{fill:rgba(239,68,68,.32);pointer-events:none}
.msw-ov{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,16,32,.86)}
.msw-card{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid var(--msw-line);border-radius:14px;background:var(--msw-panel);box-shadow:0 12px 34px rgba(0,0,0,.35)}
.msw-card.lg{width:min(720px,100%)}
.msw-head,.msw-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px}
.msw-head h3{margin:0;font-size:14px;font-weight:700;color:var(--msw-ink)}
.msw-body,.msw-help,.msw-cheats,.msw-stats{flex:1 1 auto;min-height:0;overflow:auto}
.msw-body p{margin:0 0 8px;font-size:12px;line-height:1.6;color:var(--msw-mut)}
.msw-body p:last-child{margin-bottom:0}
.msw-ov-title{margin:0;font-size:17px;font-weight:700;color:var(--msw-ink)}
.msw-ov-title.mgp-win{color:var(--msw-ok)}
.msw-ov-title.mgp-lose{color:var(--msw-danger)}
.msw-ov-sub{margin:0;font-size:12px;line-height:1.6;color:var(--msw-mut)}
.msw-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.msw-help b{display:block;margin-bottom:5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;color:var(--msw-mut);text-transform:uppercase}
.msw-help ul{margin:0 0 12px;padding-left:16px;font-size:11px;line-height:1.7;color:var(--msw-mut)}
.msw-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--msw-line);border-bottom-width:2px;border-radius:5px;background:var(--msw-bg);color:var(--msw-ink);font:inherit}
.msw-cheats{display:flex;flex-direction:column;gap:8px}
.msw-cheats .msw-btn{width:100%;text-align:left}
.msw-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.msw-stat{border:1px solid var(--msw-line);border-radius:10px;padding:10px}
.msw-stat u{display:block;font:700 9px/1 ui-monospace,monospace;letter-spacing:.1em;color:var(--msw-mut);text-decoration:none;text-transform:uppercase}
.msw-stat b{display:block;margin-top:6px;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--msw-ink)}
.msw-note{font:600 10px/1.4 ui-monospace,monospace;color:var(--msw-mut)}
@media (pointer:coarse){.msw button:not(:disabled){min-height:44px;min-width:44px}}
@media (prefers-reduced-motion:reduce){.msw *,.msw *::before,.msw *::after{transition-duration:.01ms!important;animation-duration:.01ms!important}}

/* --- fill height + mobile refinements (keep last) --- */
.msw.game-fill > .msw-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.msw.game-fill > .msw-board:not(:has(.msw-ov:not([hidden]))){aspect-ratio:var(--msw-ratio,1);flex:0 0 auto}
.msw.game-fill > .msw-board:has(.msw-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.msw .msw-hud{gap:5px}
.msw .msw-hud .msw-chip{padding:4px 6px;font-size:9px}
.msw .msw-hud .msw-chip[data-hud="status"]{display:none}
.msw .msw-hud .msw-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.msw .msw-hud .msw-btn-label,.msw .msw-hud .msw-spacer{display:none}
.msw .msw-ov{padding:8px}
.msw .msw-card{width:100%;height:100%;max-height:100%;padding:14px;border-radius:12px}
.msw .msw-help,.msw .msw-cheats,.msw .msw-stats{scrollbar-width:none}
.msw .msw-help::-webkit-scrollbar,.msw .msw-cheats::-webkit-scrollbar,.msw .msw-stats::-webkit-scrollbar{display:none}
.msw .msw-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--msw-line)}
.msw .msw-note{display:none}
}
</style>
<div class="game-app msw game-fill" data-msw>
  <div class="msw-hud">
    <span class="msw-chip">DIFF <b data-hud="diff">Easy 9x9</b></span>
    <span class="msw-chip">MINES <b data-hud="mines">10</b></span>
    <span class="msw-chip">TIME <b data-hud="time">0:00</b></span>
    <span class="msw-chip">CLEARED <b data-hud="score">0</b></span>
    <span class="msw-chip" data-hud="status" data-state="ready">READY</span>
    <span class="msw-spacer"></span>
    <button class="msw-btn msw-icon-btn" type="button" data-act="flag" aria-label="Flag mode" title="Flag mode (F)" aria-pressed="false">${iconSVG("flag", { size: 14 })}<span class="msw-btn-label">Flag: off</span></button>
    <button class="msw-btn msw-icon-btn" type="button" data-act="diff" aria-label="Change difficulty" title="Change difficulty">${iconSVG("grid", { size: 14 })}<span class="msw-btn-label">Difficulty</span></button>
    <button class="msw-btn msw-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="msw-btn-label">Help</span></button>
    <button class="msw-btn msw-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="msw-btn-label">Cheats</span></button>
    <button class="msw-btn msw-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="msw-btn-label">Pause</span></button>
    <button class="msw-btn msw-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="msw-btn-label">Restart</span></button>
    <button class="msw-btn msw-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="msw-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel msw-board" data-board>
    <svg class="msw-svg" viewBox="0 0 270 270" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Minesweeper board">
      <g class="msw-cells"></g>
      <rect class="msw-cur" x="1" y="1" width="28" height="28" rx="4" visibility="hidden"></rect>
    </svg>
    <div class="msw-ov" data-ov="start">
      <div class="msw-card">
        <div class="msw-head"><h3>Minesweeper</h3></div>
        <div class="msw-body"><p>Reveal every cell that is not a mine. A number shows how many mines touch that cell; an empty cell opens its neighbors. Flag the mines you find. Your first click is always safe. Clear every safe cell to win.</p></div>
        <div class="msw-foot"><span class="msw-note">Press H for the full guide</span><button class="msw-btn primary" type="button" data-act="start">Start game</button></div>
      </div>
    </div>
    <div class="msw-ov" data-ov="over" hidden>
      <div class="msw-card">
        <div class="msw-head"><h3 class="msw-ov-title" data-ov="title">Game over</h3></div>
        <div class="msw-body"><p class="msw-ov-sub" data-ov="reason">...</p></div>
        <div class="msw-foot"><span class="msw-note">R to restart</span><button class="msw-btn primary" type="button" data-act="restart">Play again</button></div>
      </div>
    </div>
    <div class="msw-ov" data-ov="pause" hidden>
      <div class="msw-card">
        <div class="msw-head"><h3>Paused</h3></div>
        <div class="msw-body"><p class="msw-ov-sub">The timer is stopped. Press P or Esc to resume.</p></div>
        <div class="msw-foot"><span class="msw-note">P / Esc</span><button class="msw-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="msw-ov" data-ov="cheat" hidden>
      <div class="msw-card">
        <div class="msw-head"><h3>Cheats</h3><button class="msw-btn" type="button" data-cheat-close>Close</button></div>
        <div class="msw-cheats">
          <button class="msw-btn" type="button" data-cheat="xray">Show mines: Off</button>
          <button class="msw-btn" type="button" data-cheat="freeze">Freeze timer: Off</button>
          <button class="msw-btn" type="button" data-cheat="flagall">Flag every mine</button>
          <button class="msw-btn" type="button" data-cheat="reveal">Reveal every safe cell</button>
        </div>
        <div class="msw-foot"><span class="msw-note">Cheats stay inside this overlay</span></div>
      </div>
    </div>
    <div class="msw-ov" data-ov="help" hidden>
      <div class="msw-card lg">
        <div class="msw-head"><h3>How to play</h3><button class="msw-btn" type="button" data-help-close>Close</button></div>
        <div class="msw-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="msw-kbd">Left click</span> — reveal · <span class="msw-kbd">Right click</span> — flag</li>
              <li><span class="msw-kbd">Arrows</span> — move cursor · <span class="msw-kbd">Space</span> — reveal</li>
              <li><span class="msw-kbd">F</span> — flag · <span class="msw-kbd">R</span> — restart</li>
              <li><span class="msw-kbd">H</span> help · <span class="msw-kbd">C</span> cheats · <span class="msw-kbd">P</span> pause</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a cell to reveal; tap the Flag button first to place flags.</li>
              <li>Use the HUD icon buttons for help, cheats, pause and restart.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>A number shows how many of the 8 neighbors are mines.</li>
              <li>An empty cell opens its whole safe neighborhood automatically.</li>
              <li>Your first reveal is always safe, with a mine-free 3x3 zone.</li>
              <li>Flags are guesses; wrong flags are crossed out in red when you lose.</li>
              <li>Reveal all safe cells to win the board.</li>
            </ul>
            <div class="msw-foot"><span class="msw-note">Press H to reopen this guide</span><button class="msw-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- helpers ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    const board = $("[data-board]");
    const svg = $(".msw-svg");
    const gCells = $(".msw-cells");
    const curEl = $(".msw-cur");
    const hud = {
        diff: $('[data-hud="diff"]'),
        mines: $('[data-hud="mines"]'),
        time: $('[data-hud="time"]'),
        score: $('[data-hud="score"]'),
        status: $('[data-hud="status"]'),
    };
    const ov = {
        start: $('[data-ov="start"]'),
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTitle = $('[data-ov="title"]', ov.over);
    const ovReason = $('[data-ov="reason"]', ov.over);
    const flagBtn = $('[data-act="flag"]');
    const diffBtn = $('[data-act="diff"]');
    const pauseBtn = $("[data-pause]");
    const pauseLabel = pauseBtn.querySelector(".msw-btn-label");
    const cheatBtns = Array.from(root.querySelectorAll("[data-cheat]"));

    const CS = 30; // svg units per cell
    const DIFFS = [
        { label: "Easy", cols: 9, rows: 9, mines: 10 },
        { label: "Medium", cols: 12, rows: 12, mines: 24 },
        { label: "Hard", cols: 16, rows: 14, mines: 45 },
    ];
    const NUM_COLORS = [
        "",
        "#93c5fd",
        "#86efac",
        "#fca5a5",
        "#c4b5fd",
        "#fbbf24",
        "#67e8f9",
        "#f9a8d4",
        "#cbd5e1",
    ];
    const RAYS = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
        [0.71, -0.71],
        [0.71, 0.71],
        [-0.71, -0.71],
        [-0.71, 0.71],
    ];

    /* ---------- pure rules (exposed via _test) ---------- */
    /* grid: 2D array rows[y][x], 1 = mine, 0 = safe */
    function neighborCount(grid, x, y) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx,
                    ny = y + dy;
                if (
                    ny < 0 ||
                    ny >= grid.length ||
                    nx < 0 ||
                    nx >= grid[0].length
                )
                    continue;
                if (grid[ny][nx]) n++;
            }
        }
        return n;
    }

    /* mine grid guaranteeing a mine-free 3x3 zone around (safeX, safeY);
       if the board is too small for that, at least the safe cell itself
       is kept mine-free. */
    function placeMines(cols, rows, count, safeX, safeY) {
        const grid = [];
        for (let y = 0; y < rows; y++) grid.push(new Array(cols).fill(0));
        const inSafe = (x, y) =>
            Math.abs(x - safeX) <= 1 && Math.abs(y - safeY) <= 1;
        let pool = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++)
                if (!inSafe(x, y)) pool.push([x, y]);
        }
        if (pool.length < count) {
            // tiny board fallback: protect only the clicked cell
            pool = [];
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++)
                    if (!(x === safeX && y === safeY)) pool.push([x, y]);
            }
        }
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = pool[i];
            pool[i] = pool[j];
            pool[j] = t;
        }
        const n = Math.max(0, Math.min(count, pool.length));
        for (let i = 0; i < n; i++) grid[pool[i][1]][pool[i][0]] = 1;
        return grid;
    }

    /* blank state builder: {cols, rows, mines, revealed, flags} */
    function makeState(cols, rows, mines) {
        const z = () => {
            const g = [];
            for (let y = 0; y < rows; y++) g.push(new Array(cols).fill(0));
            return g;
        };
        return {
            cols,
            rows,
            mines: mines || z(),
            revealed: z(),
            flags: z(),
        };
    }

    /* pure state transition: reveal (x, y) and BFS-flood every zero
       neighbor chain. Input state is never mutated; returns a NEW state
       (or the same object when nothing can be revealed: flagged, already
       open, or a mine). */
    function floodReveal(state, x, y) {
        if (x < 0 || y < 0 || x >= state.cols || y >= state.rows)
            return state;
        if (
            state.revealed[y][x] ||
            state.flags[y][x] ||
            state.mines[y][x]
        )
            return state;
        const revealed = state.revealed.map((r) => r.slice());
        const q = [[x, y]];
        let head = 0;
        revealed[y][x] = 1;
        while (head < q.length) {
            const c = q[head++];
            const cx = c[0],
                cy = c[1];
            if (neighborCount(state.mines, cx, cy) !== 0) continue;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = cx + dx,
                        ny = cy + dy;
                    if (
                        nx < 0 ||
                        ny < 0 ||
                        nx >= state.cols ||
                        ny >= state.rows
                    )
                        continue;
                    if (
                        revealed[ny][nx] ||
                        state.flags[ny][nx] ||
                        state.mines[ny][nx]
                    )
                        continue;
                    revealed[ny][nx] = 1;
                    q.push([nx, ny]);
                }
            }
        }
        return {
            cols: state.cols,
            rows: state.rows,
            mines: state.mines,
            flags: state.flags,
            revealed,
        };
    }

    /* ---------- state ---------- */
    let diffIdx = 0;
    let cfg = DIFFS[0];
    let mines = [],
        revealed = [],
        flags = [];
    let placed = false,
        started = false,
        over = false,
        active = true;
    let outcome = null; // "win" | "lose"
    let deadX = -1,
        deadY = -1;
    let flagMode = false;
    let timeSec = 0,
        timerOn = false,
        timerId = null;
    let curX = 0,
        curY = 0;
    let helpOpen = false,
        cheatOpen = false,
        paused = false,
        overShown = false;
    let cheatXray = false,
        cheatFreeze = false;
    let overTimer = null,
        overRemaining = 0,
        overAnchor = 0;

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("minesweeperHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("minesweeperHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    const fmt = (t) =>
        Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
    const uiBlocked = () => !active || paused || helpOpen || cheatOpen;

    /* ---------- drawing ---------- */
    function drawMine(parent, px, py) {
        const mx = px + CS / 2,
            my = py + CS / 2;
        for (let i = 0; i < RAYS.length; i++) {
            const dx = RAYS[i][0],
                dy = RAYS[i][1];
            mk(
                "line",
                {
                    x1: mx + dx * 8.5,
                    y1: my + dy * 8.5,
                    x2: mx + dx * 12.5,
                    y2: my + dy * 12.5,
                    stroke: "#cbd5e1",
                    "stroke-width": "2",
                    "stroke-linecap": "round",
                    "pointer-events": "none",
                },
                parent,
            );
        }
        mk(
            "circle",
            {
                cx: mx,
                cy: my,
                r: "7",
                fill: "#cbd5e1",
                stroke: "none",
                "pointer-events": "none",
            },
            parent,
        );
        mk(
            "circle",
            {
                cx: mx - 2.4,
                cy: my - 2.4,
                r: "1.6",
                fill: "#0b1020",
                opacity: ".55",
                stroke: "none",
                "pointer-events": "none",
            },
            parent,
        );
    }

    function drawFlag(parent, px, py, wrong) {
        const main = wrong ? "#ef4444" : "#fbbf24";
        const lineC = wrong ? "#fca5a5" : "#e2e8f0";
        mk(
            "line",
            {
                x1: px + 11,
                y1: py + 6,
                x2: px + 11,
                y2: py + 24,
                stroke: lineC,
                "stroke-width": "2",
                "stroke-linecap": "round",
                "pointer-events": "none",
            },
            parent,
        );
        mk(
            "path",
            {
                d: "M" + (px + 12) + " " + (py + 7) + "l10 4-10 4z",
                fill: main,
                stroke: "none",
                "pointer-events": "none",
            },
            parent,
        );
        mk(
            "line",
            {
                x1: px + 7,
                y1: py + 24,
                x2: px + 17,
                y2: py + 24,
                stroke: lineC,
                "stroke-width": "2",
                "stroke-linecap": "round",
                "pointer-events": "none",
            },
            parent,
        );
        if (wrong) {
            mk(
                "line",
                {
                    x1: px + 7,
                    y1: py + 7,
                    x2: px + 23,
                    y2: py + 23,
                    stroke: "#ef4444",
                    "stroke-width": "2.4",
                    "stroke-linecap": "round",
                    "pointer-events": "none",
                },
                parent,
            );
            mk(
                "line",
                {
                    x1: px + 23,
                    y1: py + 7,
                    x2: px + 7,
                    y2: py + 23,
                    stroke: "#ef4444",
                    "stroke-width": "2.4",
                    "stroke-linecap": "round",
                    "pointer-events": "none",
                },
                parent,
            );
        }
    }

    function render() {
        gCells.innerHTML = "";
        for (let y = 0; y < cfg.rows; y++) {
            for (let x = 0; x < cfg.cols; x++) {
                const px = x * CS,
                    py = y * CS;
                const g = mk("g", {}, gCells);
                const rect = mk(
                    "rect",
                    {
                        x: px + 1,
                        y: py + 1,
                        width: CS - 2,
                        height: CS - 2,
                        rx: "4",
                        "data-x": x,
                        "data-y": y,
                    },
                    g,
                );
                if (revealed[y][x]) {
                    const isDead = x === deadX && y === deadY;
                    rect.setAttribute(
                        "class",
                        "msw-cell msw-open" + (isDead ? " msw-dead" : ""),
                    );
                    if (mines[y][x]) {
                        drawMine(g, px, py);
                    } else {
                        const c = neighborCount(mines, x, y);
                        if (c > 0) {
                            const t = mk(
                                "text",
                                {
                                    x: px + CS / 2,
                                    y: py + CS / 2 + 5.4,
                                    "text-anchor": "middle",
                                    "font-family": "inherit",
                                    "font-size": "15",
                                    "font-weight": "700",
                                    fill: NUM_COLORS[c],
                                    class: "msw-num",
                                },
                                g,
                            );
                            t.textContent = String(c);
                        }
                    }
                } else {
                    rect.setAttribute("class", "msw-cell msw-hid");
                    if (flags[y][x]) {
                        drawFlag(g, px, py, over && !mines[y][x]); // wrong flags turn red on loss
                    } else if (mines[y][x] && over) {
                        drawMine(g, px, py); // lose: reveal unflagged mines
                    } else if (mines[y][x] && cheatXray) {
                        mk("rect", {
                            x: px + 2, y: py + 2, width: CS - 4, height: CS - 4,
                            rx: "4", class: "msw-xray",
                        }, g);
                    }
                }
            }
        }
        syncUI();
    }

    function positionCursor() {
        curEl.setAttribute("x", curX * CS + 1);
        curEl.setAttribute("y", curY * CS + 1);
        curEl.setAttribute("width", CS - 2);
        curEl.setAttribute("height", CS - 2);
        curEl.setAttribute(
            "visibility",
            started && !over && !uiBlocked() ? "visible" : "hidden",
        );
    }

    function flagCount() {
        let n = 0;
        for (let y = 0; y < cfg.rows; y++)
            for (let x = 0; x < cfg.cols; x++) if (flags[y][x]) n++;
        return n;
    }
    function revealedCount() {
        let n = 0;
        for (let y = 0; y < cfg.rows; y++)
            for (let x = 0; x < cfg.cols; x++) if (revealed[y][x]) n++;
        return n;
    }

    /* ---------- HUD + overlays ---------- */
    function syncUI() {
        hud.diff.textContent = cfg.label + " " + cfg.cols + "x" + cfg.rows;
        hud.mines.textContent = String(Math.max(0, cfg.mines - flagCount()));
        hud.time.textContent = fmt(timeSec);
        hud.score.textContent = String(revealedCount());
        const state = over ? "over" : paused ? "paused" : !started ? "ready" : "play";
        hud.status.textContent = {
            over: outcome === "win" ? "WON" : "LOST",
            paused: "PAUSED",
            ready: "READY",
            play: "PLAYING",
        }[state];
        hud.status.dataset.state = state;

        const flagLabel = flagBtn.querySelector(".msw-btn-label");
        if (flagLabel) flagLabel.textContent = flagMode ? "Flag: on" : "Flag: off";
        flagBtn.classList.toggle("on", flagMode);
        flagBtn.setAttribute("aria-pressed", String(flagMode));
        flagBtn.setAttribute("aria-label", flagMode ? "Flag mode on" : "Flag mode off");

        const diffLabel = diffBtn.querySelector(".msw-btn-label");
        if (diffLabel) diffLabel.textContent = cfg.label + " " + cfg.cols + "x" + cfg.rows;
        diffBtn.setAttribute("aria-label", "Difficulty: " + cfg.label + ". Click to change");

        const plabel = pauseLabel;
        if (plabel) plabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");

        cheatBtns.forEach((b) => {
            const key = b.dataset.cheat;
            if (key === "xray") b.textContent = "Show mines: " + (cheatXray ? "On" : "Off");
            else if (key === "freeze") b.textContent = "Freeze timer: " + (cheatFreeze ? "On" : "Off");
            b.classList.toggle("on", (key === "xray" && cheatXray) || (key === "freeze" && cheatFreeze));
        });

        ov.start.hidden = started || cheatOpen || helpOpen || paused;
        ov.over.hidden = !overShown || cheatOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatOpen || helpOpen;
        ov.cheat.hidden = !cheatOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        syncTimer();
        positionCursor();
    }

    /* ---------- timer (pause-safe) ---------- */
    function beginTick() {
        if (timerId !== null) clearInterval(timerId);
        timerId = setInterval(() => {
            timeSec++;
            hud.time.textContent = fmt(timeSec);
        }, 1000);
    }
    function syncTimer() {
        const run = timerOn && !paused && !helpOpen && !cheatOpen && !cheatFreeze && started && !over;
        if (run) {
            if (timerId === null) beginTick();
        } else if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
    }
    function stopTimer() {
        timerOn = false;
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    /* Deferred result overlay: freeze and shift the Date.now() anchor on
       pause so the "You win / Boom" card never pops while paused. */
    function scheduleOver(ms) {
        stopOverTimer();
        overRemaining = ms;
        overAnchor = Date.now();
        overTimer = setTimeout(() => {
            overTimer = null;
            overShown = true;
            syncUI();
        }, ms);
    }
    function stopOverTimer() {
        if (overTimer !== null) {
            overRemaining = Math.max(0, overRemaining - (Date.now() - overAnchor));
            clearTimeout(overTimer);
            overTimer = null;
        }
    }
    function resumeOverTimer() {
        if (!over || !outcome || overTimer !== null || overShown) return;
        overAnchor = Date.now();
        if (overRemaining <= 0) {
            overShown = true;
            syncUI();
            return;
        }
        overTimer = setTimeout(() => {
            overTimer = null;
            overShown = true;
            syncUI();
        }, overRemaining);
    }

    /* ---------- game flow ---------- */
    function blankGrid() {
        const g = [];
        for (let y = 0; y < cfg.rows; y++)
            g.push(new Array(cfg.cols).fill(0));
        return g;
    }

    function newGame() {
        stopTimer();
        stopOverTimer();
        overTimer = null;
        overRemaining = 0;
        overShown = false;
        cfg = DIFFS[diffIdx];
        mines = blankGrid();
        revealed = blankGrid();
        flags = blankGrid();
        placed = false;
        over = false;
        outcome = null;
        deadX = -1;
        deadY = -1;
        timeSec = 0;
        curX = 0;
        curY = 0;
        board.style.setProperty("--msw-ratio", String(cfg.cols / cfg.rows));
        svg.setAttribute(
            "viewBox",
            "0 0 " + cfg.cols * CS + " " + cfg.rows * CS,
        );
        render();
    }

    function startGame() {
        newGame();
        started = true;
        syncUI();
    }

    function restartGame() {
        paused = false;
        cheatOpen = false;
        helpOpen = false;
        flagMode = false;
        startGame();
    }

    function toggleFlag(x, y) {
        if (uiBlocked() || !started || over) return;
        if (revealed[y][x]) return;
        flags[y][x] = flags[y][x] ? 0 : 1;
        render();
    }

    function revealCell(x, y) {
        if (uiBlocked() || !started || over) return;
        if (revealed[y][x] || flags[y][x]) return;
        if (!placed) {
            // mines go in AFTER the first reveal, first click + neighbors safe
            mines = placeMines(cfg.cols, cfg.rows, cfg.mines, x, y);
            placed = true;
            timerOn = true;
            timeSec = 0;
            syncTimer();
        }
        if (mines[y][x]) {
            lose(x, y);
            return;
        }
        const st = floodReveal(
            { cols: cfg.cols, rows: cfg.rows, mines, revealed, flags },
            x,
            y,
        );
        revealed = st.revealed;
        render();
        if (revealedCount() === cfg.cols * cfg.rows - cfg.mines) win();
    }

    function win() {
        over = true;
        outcome = "win";
        stopTimer();
        for (let y = 0; y < cfg.rows; y++) {
            for (let x = 0; x < cfg.cols; x++)
                if (mines[y][x]) flags[y][x] = 1;
        }
        render();
        scheduleOver(650);
    }

    function lose(x, y) {
        over = true;
        outcome = "lose";
        deadX = x;
        deadY = y;
        revealed[y][x] = 1; // open the exploded cell so it renders with the red background
        stopTimer();
        render();
        scheduleOver(800);
    }

    function showOver() {
        ovTitle.classList.remove("mgp-win", "mgp-lose");
        if (outcome === "win") {
            ovTitle.textContent = "You win";
            ovTitle.classList.add("mgp-win");
            ovReason.textContent =
                "All " +
                (cfg.cols * cfg.rows - cfg.mines) +
                " safe cells cleared in " +
                fmt(timeSec) +
                " on " +
                cfg.label +
                " (" +
                cfg.cols +
                "x" +
                cfg.rows +
                ", " +
                cfg.mines +
                " mines).";
        } else {
            ovTitle.textContent = "Boom";
            ovTitle.classList.add("mgp-lose");
            ovReason.textContent =
                "You hit a mine after " +
                fmt(timeSec) +
                ". Every mine is now shown; wrong flags are crossed out in red.";
        }
    }

    /* ---------- overlay controls ---------- */
    function setHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) {
            cheatOpen = false;
            paused = false;
            stopOverTimer();
        } else {
            resumeOverTimer();
        }
        syncUI();
    }
    function setCheats(on) {
        cheatOpen = Boolean(on) && !helpOpen;
        if (cheatOpen) {
            paused = false;
            stopOverTimer();
        } else {
            resumeOverTimer();
        }
        syncUI();
    }
    function setPaused(on) {
        paused = Boolean(on) && !helpOpen && !cheatOpen;
        if (paused) stopOverTimer();
        else resumeOverTimer();
        syncUI();
    }

    function applyCheat(key) {
        if (key === "xray") cheatXray = !cheatXray;
        else if (key === "freeze") cheatFreeze = !cheatFreeze;
        else if (key === "flagall") {
            for (let y = 0; y < cfg.rows; y++)
                for (let x = 0; x < cfg.cols; x++)
                    if (mines[y][x]) flags[y][x] = 1;
        } else if (key === "reveal") {
            if (started && !over) {
                if (!placed) {
                    mines = placeMines(cfg.cols, cfg.rows, cfg.mines, curX, curY);
                    placed = true;
                    timerOn = true;
                }
                for (let y = 0; y < cfg.rows; y++)
                    for (let x = 0; x < cfg.cols; x++)
                        if (!mines[y][x]) revealed[y][x] = 1;
            }
        }
        render();
        if (key === "reveal" && started && !over &&
            revealedCount() === cfg.cols * cfg.rows - cfg.mines) win();
    }

    /* ---------- input ---------- */
    function onSvgClick(e) {
        if (uiBlocked()) return;
        const t = e.target;
        if (t.dataset && t.dataset.x !== undefined) {
            const x = Number(t.dataset.x),
                y = Number(t.dataset.y);
            if (flagMode) toggleFlag(x, y);
            else revealCell(x, y);
        }
    }
    function onSvgContext(e) {
        e.preventDefault();
        if (uiBlocked()) return;
        const t = e.target;
        if (t.dataset && t.dataset.x !== undefined) {
            toggleFlag(Number(t.dataset.x), Number(t.dataset.y));
        }
    }

    function onRootClick(e) {
        const t = e.target;
        if (t.closest("[data-help]")) { setHelp(); return; }
        if (t.closest("[data-help-close]")) { setHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { setCheats(!cheatOpen); return; }
        if (t.closest("[data-pause]")) { setPaused(!paused); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        if (t.closest("[data-cheat-close]")) { setCheats(false); return; }
        const cheat = t.closest("[data-cheat]");
        if (cheat) { applyCheat(cheat.dataset.cheat); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "start") startGame();
            else if (a === "restart") restartGame();
            else if (a === "resume") setPaused(false);
            else if (a === "flag") {
                flagMode = !flagMode;
                render();
            } else if (a === "diff") {
                diffIdx = (diffIdx + 1) % DIFFS.length;
                newGame();
            }
            return;
        }
    }

    function onKey(e) {
        if (e.repeat) return;
        const code = e.code,
            k = e.key;
        // Prioritas: help → cheats → pause/Escape → aksi game.
        if (code === "KeyH") { setHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen) setCheats(!cheatOpen); e.preventDefault(); return; }
        if (code === "KeyP" || code === "Escape") {
            if (helpOpen) setHelp(false);
            else if (cheatOpen) setCheats(false);
            else if (code === "KeyP") setPaused(!paused);
            else if (paused) setPaused(false);
            e.preventDefault();
            return;
        }
        if (code === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (uiBlocked()) return;
        if (e.target && /^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

        if (
            code === "ArrowUp" || code === "ArrowDown" ||
            code === "ArrowLeft" || code === "ArrowRight"
        ) {
            e.preventDefault();
            if (!started || over) return;
            if (code === "ArrowUp") curY = Math.max(0, curY - 1);
            else if (code === "ArrowDown") curY = Math.min(cfg.rows - 1, curY + 1);
            else if (code === "ArrowLeft") curX = Math.max(0, curX - 1);
            else curX = Math.min(cfg.cols - 1, curX + 1);
            positionCursor();
        } else if (k === " " || code === "Enter") {
            if (!started) { startGame(); e.preventDefault(); return; }
            if (over) return;
            e.preventDefault();
            if (flagMode) toggleFlag(curX, curY);
            else revealCell(curX, curY);
        } else if (code === "KeyF") {
            if (started && !over) { toggleFlag(curX, curY); e.preventDefault(); }
        }
    }

    root.addEventListener("click", onRootClick);
    svg.addEventListener("click", onSvgClick);
    svg.addEventListener("contextmenu", onSvgContext);
    document.addEventListener("keydown", onKey);

    /* ---------- boot ---------- */
    newGame();

    /* ---------- public API ---------- */
    return {
        destroy() {
            active = false;
            stopTimer();
            stopOverTimer();
            root.removeEventListener("click", onRootClick);
            svg.removeEventListener("click", onSvgClick);
            svg.removeEventListener("contextmenu", onSvgContext);
            document.removeEventListener("keydown", onKey);
        },
        _test: {
            neighborCount, // (grid, x, y) -> count of mines in the 8 neighbors
            placeMines, // (cols, rows, count, safeX, safeY) -> 2D mine grid, safe 3x3 zone
            floodReveal, // (state, x, y) -> new state with BFS flood reveal (pure)
            makeState, // (cols, rows, mines?) -> blank state for floodReveal
        },
    };
}
