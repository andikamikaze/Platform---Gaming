/* ==== GAME: nonogram.js ==== */

/* =============================================================
NONOGRAM - MGP puzzle module (ESM / mount() template)
Picross: random mirror-symmetric pictures at ~55% density, run
length clues on top and left, clue dimming when a line matches,
X marks, 5-mistake limit and level progression. Pure inline SVG,
no canvas, no emoji, no assets.
============================================================= */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "nonogram",
    name: "Nonogram",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Fill cells from the number clues to reveal the hidden picture.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><text x="4" y="9" font-size="9" font-family="inherit" text-anchor="start" fill="currentColor" stroke="none">3 1</text><rect x="4" y="14" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="14" y="14" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="14" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="34" y="14" width="9" height="9" rx="1.5"/><rect x="4" y="24" width="9" height="9" rx="1.5"/><rect x="14" y="24" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="24" width="9" height="9" rx="1.5"/><rect x="34" y="24" width="9" height="9" rx="1.5"/><rect x="4" y="34" width="9" height="9" rx="1.5"/><rect x="14" y="34" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="34" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="34" y="34" width="9" height="9" rx="1.5"/></svg>',
    bg: ["#ffedd5", "#fed7aa"],
};

export function mount(root, context = {}) {
    const { onExit = () => { } } = context;
    const NS = "http://www.w3.org/2000/svg";
    const $ = (s, r) => (r || root).querySelector(s);
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const CELL = 34; // svg units per grid cell
    const MAX_MISTAKES = 5;
    const HELP_KEY = "nonogramHelpSeen";

    const icon = (name) => iconSVG(name, { size: 14 });

    root.innerHTML = `
<style>
.nono-app{--ink:#e5e7eb;--mut:#94a3b8;--line:#ffffff1a;--accent:#f59e0b;min-width:0;min-height:0;flex:1 1 auto;gap:10px;overflow-x:clip;-webkit-tap-highlight-color:transparent;color:var(--ink)}
.nono-app *{box-sizing:border-box}
.nono-app [hidden]{display:none!important}
.nono-app :where(button,[role="button"]){touch-action:manipulation}
.nono-app button:focus-visible,.nono-app .nono-cell:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.nono-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.nono-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#ffffff0d;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}
.nono-chip b{color:var(--ink);font-size:12px}
.nono-spacer{flex:1 1 auto}
.nono-btn{font:inherit;font-size:12px;font-weight:600;padding:7px 11px;min-height:36px;border:1px solid var(--line);border-radius:8px;background:#ffffff0d;color:var(--ink);cursor:pointer;transition:border-color .12s,background .12s}
.nono-btn:hover:not(:disabled){border-color:#94a3b8}
.nono-btn:disabled{opacity:.4;cursor:default}
.nono-btn.primary{background:var(--accent);border-color:var(--accent);color:#201400}
.nono-icon-btn{display:inline-flex;align-items:center;gap:6px}
.nono-icon-btn svg{flex:none;display:block}
.nono-btn-label{white-space:nowrap}
.nono-btn.nono-on{background:var(--accent);border-color:var(--accent);color:#201400}
.nono-app.game-fill>.nono-board[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.nono-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:10px;border:1px solid var(--line);border-radius:12px;background:#0d142b;overflow:hidden}
.nono-wrap{width:100%;height:100%;min-height:0;display:flex;align-items:center;justify-content:center}
#nonogram-svg{display:block;width:100%;height:100%;max-width:min(100%,620px);max-height:100%;touch-action:manipulation}
.nono-cell{cursor:pointer}
.nono-empty{fill:#31406a;stroke:#41548a;stroke-width:1;transition:fill .12s}
.nono-empty:hover{fill:#3d4f82}
.nono-fill{fill:#0c1226;stroke:#0c1226;stroke-width:1;cursor:default}
.nono-x{stroke:#8fa0c4;stroke-width:2;stroke-linecap:round;pointer-events:none}
.nono-clue{fill:#d7deeb;font-weight:600;pointer-events:none;transition:opacity .15s}
.nono-clue.nono-dim{opacity:.3}
.nono-tint{fill:#f59e0b;stroke:#f59e0b;stroke-width:1;cursor:default}
.nono-ghost{opacity:.32}
.nono-err{fill:#ef4444;pointer-events:none;animation:nonoFlash .5s ease-out forwards}
.nono-cursor{fill:none;stroke:#f59e0b;stroke-width:2;pointer-events:none}
@keyframes nonoFlash{0%{opacity:1}70%{opacity:.85}100%{opacity:0}}
.nono-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,16,32,.9);backdrop-filter:blur(2px)}
.nono-card{display:flex;flex-direction:column;width:min(440px,100%);max-height:100%;padding:16px;border:1px solid var(--line);border-radius:14px;background:#111a33;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.nono-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.nono-head h3{margin:0;font-size:15px;font-weight:700;line-height:1.25;letter-spacing:-.01em}
.nono-body,.nono-cheats,.nono-help{flex:1 1 auto;min-height:0;overflow:auto;font-size:13px;line-height:1.6;color:#c3cde2}
.nono-body p{margin:0 0 8px}
.nono-title.mgp-win{color:#86efac}
.nono-title.mgp-lose{color:#fca5a5}
.nono-cheats{display:flex;flex-direction:column;gap:8px}
.nono-cheats .nono-btn{width:100%;text-align:left}
.nono-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.nono-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.nono-help ul{margin:0 0 10px;padding-left:16px}
.nono-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#ffffff0d;color:var(--ink);font:600 10px/1.4 ui-monospace,monospace}
.nono-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px}
.nono-note{font-size:10px;line-height:1.45;color:var(--mut)}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.nono-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.nono-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.nono-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.nono-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .nono-app :where([class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .nono-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){gap:8px}
}
@media (max-width:480px){
  .nono-app :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .nono-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .nono-app *,.nono-app *::before,.nono-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* --- fill-height + mobile refinements (last, beat pointer:coarse 44px) --- */
@media (max-width:640px){
  .nono-app.game-fill>.nono-board[data-board]:not(:has(.nono-ov:not([hidden]))){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .nono-app.game-fill>.nono-board[data-board]:has(.nono-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .nono-app .nono-hud{gap:5px;margin-bottom:0}
  .nono-app .nono-hud .nono-chip{padding:4px 6px;font-size:9px}
  .nono-app .nono-hud .nono-chip[data-hud="size"],.nono-app .nono-hud .nono-chip[data-hud="filled"]{display:none}
  .nono-app .nono-hud .nono-btn-label,.nono-app .nono-hud .nono-spacer{display:none}
  .nono-app .nono-hud .nono-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .nono-app .nono-ov{padding:8px}
  .nono-app .nono-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .nono-app .nono-help{grid-template-columns:1fr;gap:8px}
  .nono-app .nono-body,.nono-app .nono-cheats,.nono-app .nono-help{scrollbar-width:none}
  .nono-app .nono-body::-webkit-scrollbar,.nono-app .nono-cheats::-webkit-scrollbar,.nono-app .nono-help::-webkit-scrollbar{display:none}
  .nono-app .nono-foot{padding-top:8px;border-top:1px solid var(--line)}
  .nono-app .nono-note{display:none}
}
@media (pointer:coarse){
  .nono-app .nono-hud .nono-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .nono-app .nono-card .nono-btn{min-height:44px}
}
</style>
<div class="game-app nono-app game-fill" data-nono>
  <div class="nono-hud">
    <span class="nono-chip">LV <b data-hud="level">1</b></span>
    <span class="nono-chip" data-hud="size">SIZE 5×5</span>
    <span class="nono-chip" data-hud="filled">FILLED 0</span>
    <span class="nono-chip">MISTAKES <b data-hud="mis">0/5</b></span>
    <span class="nono-chip">TIME <b data-hud="time">0:00</b></span>
    <span class="nono-chip" data-hud="status">READY</span>
    <span class="nono-spacer"></span>
    <button class="nono-btn nono-icon-btn" type="button" data-xmode aria-label="X mode: off" title="X mode (X)">${icon("x")}<span class="nono-btn-label" data-xlabel>X mode: off</span></button>
    <button class="nono-btn nono-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${icon("helpCircle")}<span class="nono-btn-label">Help</span></button>
    <button class="nono-btn nono-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${icon("wrench")}<span class="nono-btn-label">Cheats</span></button>
    <button class="nono-btn nono-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="nono-picon">${icon("pause")}</span><span class="nono-btn-label">Pause</span></button>
    <button class="nono-btn nono-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${icon("refresh")}<span class="nono-btn-label">Restart</span></button>
    <button class="nono-btn nono-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${icon("logOut")}<span class="nono-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel nono-board" data-board>
    <div class="nono-wrap">
      <svg id="nonogram-svg" viewBox="0 0 240 240" role="img" aria-label="Nonogram board">
        <g class="nono-clues"></g>
        <g class="nono-cells"></g>
        <g class="nono-fx"></g>
      </svg>
    </div>
    <div class="nono-ov" data-ov="over" hidden>
      <div class="nono-card">
        <div class="nono-head"><h3 class="nono-title" data-ov="title">Picture complete</h3></div>
        <div class="nono-body"><p data-ov="reason">...</p></div>
        <div class="nono-foot">
          <span class="nono-note">R restarts · Esc closes</span>
          <span>
            <button class="nono-btn" type="button" data-act="again">Play again</button>
            <button class="nono-btn primary" type="button" data-act="next" data-next>Next level</button>
          </span>
        </div>
      </div>
    </div>
    <div class="nono-ov" data-ov="pause" hidden>
      <div class="nono-card">
        <div class="nono-head"><h3>Paused</h3></div>
        <div class="nono-body"><p>The board and timer are frozen. Press P or Esc to resume.</p></div>
        <div class="nono-foot"><span class="nono-note">P or Esc resumes</span><button class="nono-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="nono-ov" data-ov="cheat" hidden>
      <div class="nono-card">
        <div class="nono-head"><h3>Cheats</h3><button class="nono-btn" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
        <div class="nono-cheats">
          <button class="nono-btn" type="button" data-cheat="cell">Reveal one correct cell</button>
          <button class="nono-btn" type="button" data-cheat="row">Complete one row</button>
          <button class="nono-btn" type="button" data-cheat="solve">Solve the picture</button>
          <button class="nono-btn" type="button" data-cheat="mistakes">Clear mistakes</button>
          <button class="nono-btn" type="button" data-cheat="time">Reset the clock</button>
        </div>
        <div class="nono-foot"><span class="nono-note">Cheats close the panel after use</span></div>
      </div>
    </div>
    <div class="nono-ov" data-ov="help" hidden>
      <div class="nono-card">
        <div class="nono-head"><h3>How to play</h3><button class="nono-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="nono-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a cell to fill it; right-click to mark it empty (X).</li>
              <li>Arrow keys move the cursor; <span class="nono-kbd">Space</span> / <span class="nono-kbd">Enter</span> acts on it.</li>
              <li><span class="nono-kbd">X</span> toggles X mode, <span class="nono-kbd">R</span> restarts.</li>
              <li><span class="nono-kbd">H</span> help · <span class="nono-kbd">C</span> cheats · <span class="nono-kbd">P</span> pause · <span class="nono-kbd">Esc</span> close.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a cell to fill it; turn on X mode to tap empty marks.</li>
              <li>The X-mode, Cheats and Pause buttons sit in the top bar.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Each clue is the length of an unbroken run of filled cells in that row or column, in order.</li>
              <li>A clue dims when that line already matches it exactly.</li>
              <li>Five wrong fills end the run; the hidden picture is revealed faintly.</li>
              <li>Finish the picture to unlock the next, larger board.</li>
            </ul>
            <div class="nono-foot"><span class="nono-note">Press H to reopen this guide</span><button class="nono-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    const svg = $("#nonogram-svg");
    const gClues = $(".nono-clues");
    const gCells = $(".nono-cells");
    const gFx = $(".nono-fx");
    const xBtn = $("[data-xmode]");
    const xLabel = $("[data-xlabel]");
    const pBtn = $("[data-pause]");
    const pIcon = $(".nono-picon");
    const hud = {
        level: $('[data-hud="level"]'),
        size: $('[data-hud="size"]'),
        filled: $('[data-hud="filled"]'),
        mis: $('[data-hud="mis"]'),
        time: $('[data-hud="time"]'),
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

    /* ---------- pure rules (unchanged) ---------- */
    /* run-length encoder: line is an array where 1 = filled, anything
       else counts as empty. Returns the clue, e.g. [1,2]; [] when empty. */
    function cluesFrom(line) {
        const out = [];
        let run = 0;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === 1) run++;
            else if (run > 0) {
                out.push(run);
                run = 0;
            }
        }
        if (run > 0) out.push(run);
        return out;
    }

    /* true when the filled pattern of line has exactly the given runs */
    function matchesClue(line, clues) {
        const a = cluesFrom(line);
        const b = clues || [];
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++)
            if (a[i] !== b[i]) return false;
        return true;
    }

    /* random solution: ~55% density with horizontal mirror symmetry */
    function genSolution(w, h) {
        for (; ;) {
            const half = Math.ceil(w / 2);
            const sol = [];
            let filled = 0;
            for (let y = 0; y < h; y++) {
                const row = new Array(w).fill(0);
                for (let x = 0; x < half; x++) {
                    const v = Math.random() < 0.55 ? 1 : 0;
                    row[x] = v;
                    row[w - 1 - x] = v;
                }
                for (let x = 0; x < w; x++) filled += row[x];
                sol.push(row);
            }
            if (filled >= w * h * 0.2 && filled <= w * h * 0.9) return sol;
        }
    }

    /* clue sets for a full solution: { rows: [[..]..], cols: [[..]..] } */
    function cluesOf(solution) {
        const h = solution.length,
            w = solution[0].length;
        const rows = solution.map((r) => cluesFrom(r));
        const cols = [];
        for (let x = 0; x < w; x++) {
            const col = [];
            for (let y = 0; y < h; y++) col.push(solution[y][x]);
            cols.push(cluesFrom(col));
        }
        return { rows, cols };
    }

    /* ---------- state ---------- */
    let level = 1,
        w = 5,
        h = 5;
    let sol = [],
        rowsClues = [],
        colsClues = [];
    let marks = []; // 0 empty, 1 filled, 2 X
    let mistakes = 0,
        xmode = false;
    let started = true,
        over = false,
        overShown = false,
        won = false;
    let destroyed = false,
        paused = false,
        cheatsOpen = false,
        helpOpen = false;
    let timeSec = 0,
        timerOn = false,
        timerId = null,
        clockBase = 0,
        pauseStart = 0,
        pauseOffset = 0;
    let cursor = { x: 0, y: 0 };
    /* layout metrics */
    let clueFont = 14,
        stepX = 17,
        stepY = 18,
        gridX = 60,
        gridY = 60;

    /* ---------- pause-aware timers ---------- */
    const clockNow = () => Date.now() - pauseOffset;
    const timers = new Map();
    let timerSeq = 0;
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
        if (timerOn || over || paused || blocked()) return;
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
        render();
    }

    /* ---------- level setup ---------- */
    function sizeFor(lv) {
        if (lv <= 2) return [5, 5];
        if (lv <= 4) return [7, 7];
        return [9, 7];
    }

    function layout() {
        clueFont = w <= 5 ? 14 : w <= 7 ? 13 : 12; // shrink font on big levels
        stepX = clueFont + 3;
        stepY = clueFont + 4;
        let maxRow = 1,
            maxCol = 1;
        for (let i = 0; i < rowsClues.length; i++)
            maxRow = Math.max(maxRow, rowsClues[i].length);
        for (let i = 0; i < colsClues.length; i++)
            maxCol = Math.max(maxCol, colsClues[i].length);
        gridX = maxRow * stepX + 12;
        gridY = maxCol * stepY + 10;
        svg.setAttribute(
            "viewBox",
            "0 0 " + (gridX + w * CELL) + " " + (gridY + h * CELL),
        );
    }

    function newLevel(lv) {
        clearTimers();
        stopTimer();
        level = lv;
        over = false;
        overShown = false;
        won = false;
        const sz = sizeFor(lv);
        w = sz[0];
        h = sz[1];
        sol = genSolution(w, h);
        const cl = cluesOf(sol);
        rowsClues = cl.rows;
        colsClues = cl.cols;
        resetMarks();
        cursor = { x: 0, y: 0 };
        layout();
        render();
        updateHud();
    }

    /* restart the CURRENT puzzle from scratch */
    function restartPuzzle() {
        if (paused) setPaused(false);
        helpOpen = false;
        cheatsOpen = false;
        clearTimers();
        stopTimer();
        resetMarks();
        over = false;
        overShown = false;
        won = false;
        started = true;
        render();
        updateHud();
    }

    function resetMarks() {
        mistakes = 0;
        timeSec = 0;
        clockBase = clockNow();
        marks = [];
        for (let y = 0; y < h; y++) marks.push(new Array(w).fill(0));
    }

    /* ---------- rendering ---------- */
    function render() {
        gClues.innerHTML = "";
        gCells.innerHTML = "";
        gFx.innerHTML = "";
        /* row clues (left, right-aligned toward the grid) */
        for (let y = 0; y < h; y++) {
            const clues = rowsClues[y];
            const list = clues.length ? clues : [0];
            const dim = matchesClue(marks[y], clues);
            const len = list.length;
            for (let k = 0; k < len; k++) {
                const tx = gridX - 10 - (len - k) * stepX + stepX / 2;
                const ty = gridY + y * CELL + CELL / 2 + clueFont * 0.36;
                const t = mk(
                    "text",
                    {
                        x: tx,
                        y: ty,
                        "text-anchor": "middle",
                        "font-family": "inherit",
                        "font-size": clueFont,
                        class: "nono-clue" + (dim ? " nono-dim" : ""),
                    },
                    gClues,
                );
                t.textContent = String(list[k]);
            }
        }
        /* column clues (top, stacked toward the grid) */
        for (let x = 0; x < w; x++) {
            const clues = colsClues[x];
            const list = clues.length ? clues : [0];
            const col = [];
            for (let y = 0; y < h; y++) col.push(marks[y][x] === 1 ? 1 : 0);
            const dim = matchesClue(col, clues);
            const len = list.length;
            for (let j = 0; j < len; j++) {
                const ty = gridY - 8 - (len - j) * stepY + stepY / 2;
                const tx = gridX + x * CELL + CELL / 2;
                const t = mk(
                    "text",
                    {
                        x: tx,
                        y: ty + clueFont * 0.36,
                        "text-anchor": "middle",
                        "font-family": "inherit",
                        "font-size": clueFont,
                        class: "nono-clue" + (dim ? " nono-dim" : ""),
                    },
                    gClues,
                );
                t.textContent = String(list[j]);
            }
        }
        /* cells */
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const px = gridX + x * CELL,
                    py = gridY + y * CELL;
                const g = mk("g", {}, gCells);
                const rect = mk(
                    "rect",
                    {
                        x: px + 1,
                        y: py + 1,
                        width: CELL - 2,
                        height: CELL - 2,
                        rx: "4",
                        "data-x": x,
                        "data-y": y,
                    },
                    g,
                );
                if (over) {
                    // end game: tint the picture (ghosted on a loss)
                    if (sol[y][x] === 1) {
                        rect.setAttribute(
                            "class",
                            "nono-cell nono-tint" + (won ? "" : " nono-ghost"),
                        );
                    } else {
                        rect.setAttribute("class", "nono-cell nono-empty");
                    }
                    continue;
                }
                const m = marks[y][x];
                if (m === 1) {
                    rect.setAttribute("class", "nono-cell nono-fill");
                } else {
                    rect.setAttribute("class", "nono-cell nono-empty");
                    if (m === 2) {
                        mk(
                            "line",
                            {
                                x1: px + 10,
                                y1: py + 10,
                                x2: px + CELL - 10,
                                y2: py + CELL - 10,
                                class: "nono-x",
                            },
                            g,
                        );
                        mk(
                            "line",
                            {
                                x1: px + CELL - 10,
                                y1: py + 10,
                                x2: px + 10,
                                y2: py + CELL - 10,
                                class: "nono-x",
                            },
                            g,
                        );
                    }
                }
            }
        }
        if (!over && !blocked()) {
            mk(
                "rect",
                {
                    x: gridX + cursor.x * CELL + 1,
                    y: gridY + cursor.y * CELL + 1,
                    width: CELL - 2,
                    height: CELL - 2,
                    rx: "4",
                    class: "nono-cursor",
                },
                gFx,
            );
        }
        /* overlays suppress each other; first-run help matches cheats/pause */
        ov.over.hidden = !overShown || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const pLabel = pBtn.querySelector(".nono-btn-label");
        if (pLabel) pLabel.textContent = paused ? "Resume" : "Pause";
        pBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        if (pIcon) pIcon.innerHTML = icon(paused ? "play" : "pause");
    }

    function filledCount() {
        let n = 0;
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) if (marks[y][x] === 1) n++;
        return n;
    }

    function updateHud() {
        hud.level.textContent = String(level);
        hud.size.textContent = "SIZE " + w + "×" + h;
        hud.filled.textContent = "FILLED " + filledCount() + "/" + w * h;
        hud.mis.textContent = mistakes + "/" + MAX_MISTAKES;
        hud.time.textContent = fmt(timeSec);
        hud.status.textContent = over
            ? won ? "WIN" : "LOSE"
            : paused ? "PAUSED"
                : blocked() ? "GUIDE"
                    : timerOn ? "PLAYING" : "READY";
    }

    function checkWin() {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (sol[y][x] === 1 && marks[y][x] !== 1) return false;
                if (sol[y][x] === 0 && marks[y][x] === 1) return false;
            }
        }
        return true;
    }

    /* ---------- game flow ---------- */
    function afterChange() {
        if (checkWin()) {
            over = true;
            won = true;
            stopTimer();
            render();
            updateHud();
            later(showOver, 650);
            return;
        }
        render();
        updateHud();
    }

    function wrongFill(x, y) {
        mistakes++;
        marks[y][x] = 2; // rejected fill: flash red, then auto-marked empty
        if (mistakes >= MAX_MISTAKES) {
            over = true;
            won = false;
            stopTimer();
        }
        render();
        addFlash(x, y);
        updateHud();
        if (over) later(showOver, 1000);
    }

    function addFlash(x, y) {
        const r = mk(
            "rect",
            {
                x: gridX + x * CELL + 1,
                y: gridY + y * CELL + 1,
                width: CELL - 2,
                height: CELL - 2,
                rx: "4",
                class: "nono-err",
            },
            gFx,
        );
        later(() => {
            if (r.parentNode) r.parentNode.removeChild(r);
        }, 550);
    }

    function showOver() {
        if (!over) return;
        ovTitle.classList.remove("mgp-win", "mgp-lose");
        if (won) {
            ovTitle.textContent = "Picture complete";
            ovTitle.classList.add("mgp-win");
            ovReason.textContent =
                "Level " +
                level +
                " solved in " +
                fmt(timeSec) +
                " with " +
                mistakes +
                " mistake" +
                (mistakes === 1 ? "" : "s") +
                ".";
        } else {
            ovTitle.textContent = "Too many mistakes";
            ovTitle.classList.add("mgp-lose");
            ovReason.textContent =
                "Five cells were filled that do not belong to the picture. The hidden picture is shown faintly behind the board.";
        }
        const againBtn = $('[data-act="again"]');
        const nextBtn = $("[data-next]");
        if (againBtn) againBtn.textContent = won ? "Play again" : "Try again";
        if (nextBtn) nextBtn.hidden = !won;
        overShown = true;
        render();
        updateHud();
    }

    /* ---------- input ---------- */
    function cellFill(x, y) {
        // left click / tap in fill mode
        if (destroyed || !started || over || blocked()) return;
        ensureTimer();
        const m = marks[y][x];
        if (m === 1 || m === 2) {
            // clear a fill or an X back to empty
            marks[y][x] = 0;
            afterChange();
            return;
        }
        if (sol[y][x] === 1) {
            marks[y][x] = 1;
            afterChange();
        } else {
            wrongFill(x, y);
        }
    }

    function cellX(x, y) {
        // X mode click or right click
        if (destroyed || !started || over || blocked()) return;
        ensureTimer();
        const m = marks[y][x];
        marks[y][x] = m === 2 ? 0 : m === 1 ? 0 : 2;
        afterChange();
    }

    function toggleXMode() {
        xmode = !xmode;
        xLabel.textContent = xmode ? "X mode: on" : "X mode: off";
        xBtn.classList.toggle("nono-on", xmode);
        xBtn.setAttribute("aria-label", xLabel.textContent);
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
        updateHud();
    }

    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
        updateHud();
    }

    function applyCheat(kind) {
        if (!over && !paused) {
            if (kind === "cell") {
                outer: for (let y = 0; y < h; y++)
                    for (let x = 0; x < w; x++)
                        if (sol[y][x] === 1 && marks[y][x] !== 1) {
                            marks[y][x] = 1;
                            break outer;
                        }
                afterChange();
            } else if (kind === "row") {
                let picked = -1;
                for (let y = 0; y < h && picked < 0; y++)
                    for (let x = 0; x < w; x++)
                        if (sol[y][x] === 1 && marks[y][x] !== 1) {
                            picked = y;
                            break;
                        }
                if (picked >= 0) {
                    for (let x = 0; x < w; x++)
                        marks[picked][x] = sol[picked][x] === 1 ? 1 : 2;
                    afterChange();
                }
            } else if (kind === "solve") {
                for (let y = 0; y < h; y++)
                    for (let x = 0; x < w; x++) marks[y][x] = sol[y][x];
                afterChange();
            } else if (kind === "mistakes") {
                mistakes = 0;
                updateHud();
            } else if (kind === "time") {
                timeSec = 0;
                clockBase = clockNow();
                updateHud();
            }
        }
        cheatsOpen = false;
        render();
        updateHud();
    }

    /* ---------- events ---------- */
    function handleClick(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheat-close]")) { cheatsOpen = false; render(); updateHud(); return; }
        if (t.closest("[data-cheat]")) { applyCheat(t.closest("[data-cheat]").dataset.cheat); return; }
        if (t.closest("[data-pause]")) {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused(!paused);
            return;
        }
        if (t.closest("[data-act=\"resume\"]")) { setPaused(false); return; }
        if (t.closest("[data-restart]")) { restartPuzzle(); return; }
        if (t.closest("[data-act=\"again\"]")) { restartPuzzle(); return; }
        if (t.closest("[data-next]")) { newLevel(level + 1); render(); updateHud(); return; }
        if (t.closest("[data-xmode]")) { toggleXMode(); return; }
        if (blocked() || over || !started) return;
        const cell = t.closest("[data-x]");
        if (cell && gCells.contains(cell)) {
            const x = Number(cell.dataset.x),
                y = Number(cell.dataset.y);
            cursor = { x, y };
            if (xmode) cellX(x, y);
            else cellFill(x, y);
        }
    }

    function handleContext(e) {
        e.preventDefault();
        if (destroyed || blocked() || over || !started) return;
        const t = e.target;
        if (t && t.dataset && t.dataset.x !== undefined) {
            const x = Number(t.dataset.x),
                y = Number(t.dataset.y);
            cursor = { x, y };
            cellX(x, y);
        }
    }

    function handleKey(e) {
        if (destroyed) return;
        const t = e.target;
        if (t && t.closest && t.closest("input,textarea,select,[contenteditable=true]")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const c = e.code;
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") {
            if (!helpOpen) toggleCheats();
            e.preventDefault(); return;
        }
        if (c === "KeyP") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused(!paused);
            e.preventDefault(); return;
        }
        if (c === "KeyR") { restartPuzzle(); e.preventDefault(); return; }
        if (c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            e.preventDefault(); return;
        }
        if (blocked() || over || !started) {
            if (c === "Enter" || c === "Space" || e.key === " ") {
                if (helpOpen) toggleHelp(false);
                else if (cheatsOpen) toggleCheats(false);
                else if (paused) setPaused(false);
                else if (over) restartPuzzle();
                e.preventDefault();
            }
            return;
        }
        let nx = cursor.x,
            ny = cursor.y;
        if (c === "ArrowLeft") nx = Math.max(0, nx - 1);
        else if (c === "ArrowRight") nx = Math.min(w - 1, nx + 1);
        else if (c === "ArrowUp") ny = Math.max(0, ny - 1);
        else if (c === "ArrowDown") ny = Math.min(h - 1, ny + 1);
        else if (c === "Space" || c === "Enter" || e.key === " ") {
            if (xmode) cellX(cursor.x, cursor.y);
            else cellFill(cursor.x, cursor.y);
            e.preventDefault();
            return;
        } else if (c === "KeyX") { toggleXMode(); e.preventDefault(); return; }
        else return;
        cursor = { x: nx, y: ny };
        render();
        e.preventDefault();
    }

    root.addEventListener("click", handleClick);
    gCells.addEventListener("contextmenu", handleContext);
    document.addEventListener("keydown", handleKey);

    /* ---------- first-run internal help ---------- */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem(HELP_KEY, "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- boot ---------- */
    newLevel(1);

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            gCells.removeEventListener("contextmenu", handleContext);
            document.removeEventListener("keydown", handleKey);
            clearTimers();
            stopTimer();
        },
        _test: {
            cluesFrom, // (line) -> run lengths, e.g. [1,2], [] when empty
            matchesClue, // (line, clues) -> bool (exact run-length match)
            genSolution, // (w, h) -> 2D 0/1 solution, ~55% density, mirrored
            cluesOf, // (solution) -> { rows: [...], cols: [...] }
        },
    };
}
