/* ==== GAME: tic-tac-toe.js ==== */
/*
  Tic Tac Toe — minimalist red vs blue.
  - Solo vs bot (perfect minimax / easy), sisi X/O diacak tiap ronde.
  - Room mode: host-authoritative, mark diacak host lalu di-publish.
  - Puzzle generator acak yang diverifikasi minimax (selalu solvable).
  - Cheat overlay (solo): hint, best move, undo, freeze bot.
  - Mouse + keyboard (1-9, panah, Enter, N, R/P/C/H) + keypad virtual mobile.
  Jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

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

    /* overlays + timer state (UI lokal, tidak diserialisasi ke room) */
    let helpOpen = false;
    let paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("ticTacToeHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("ticTacToeHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- markup + scoped styles (minimalist, red vs blue) ---------- */
    root.innerHTML = `
<style>
.ttt-game{--x:#2563eb;--o:#dc2626;--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--soft:#f3f4f6;
  width:100%;max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:10px;color:var(--ink);
  font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:4px 2px}
.ttt-game *{box-sizing:border-box}
.ttt-game [hidden]{display:none!important}
.ttt-game :is(button,summary,[tabindex]):focus-visible{outline:2px solid var(--x);outline-offset:2px}

/* --- satu bar HUD: info di kiri, tombol ikon di kanan --- */
.ttt-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;
  font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.ttt-hud-info,.ttt-hud-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.ttt-hud-info{min-width:0}
.ttt-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:#fff;
  border-radius:999px;padding:5px 9px;min-height:28px;color:var(--mut);white-space:nowrap}
.ttt-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.ttt-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;display:inline-block;flex:none}
.ttt-dot.is-you{background:var(--x)}
.ttt-dot.is-opp{background:var(--o)}
.ttt-dot.is-think{animation:ttt-pulse 1.1s infinite}
@keyframes ttt-pulse{50%{opacity:.35}}
.ttt-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;
  padding:0 4px;border-radius:5px;font-size:10px;font-weight:700;color:#fff;vertical-align:-3px}
.ttt-badge.is-x{background:var(--x)}
.ttt-badge.is-o{background:var(--o)}
.ttt-spacer{flex:1 1 auto}
.ttt-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);
  border-radius:9px;padding:7px 11px;min-height:34px;font-size:11px;font-weight:600;cursor:pointer;
  transition:background .15s,transform .05s}
.ttt-btn:hover{background:var(--soft)}
.ttt-btn:active{transform:translateY(1px)}
.ttt-btn:disabled{opacity:.45;cursor:default}
.ttt-btn.ttt-primary{background:var(--ink);border-color:var(--ink);color:#fff}
.ttt-btn.ttt-primary:hover{background:#000}
.ttt-btn[aria-pressed="true"],.ttt-btn.on{background:var(--ink);border-color:var(--ink);color:#fff}
.ttt-btn.ttt-cheaty{border-style:dashed}
.ttt-icon-btn{display:inline-flex;align-items:center;gap:6px}
.ttt-icon-btn svg{flex:none;display:block}

/* --- board: arena + overlay, tanpa wrapper tengah --- */
.ttt-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;
  padding:10px;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;
  container-type:size}
.ttt-svg{display:block;width:100%;max-width:560px;aspect-ratio:1/1;height:auto;
  margin:0 auto;touch-action:manipulation}
@supports (width:1cqw){.ttt-svg{width:min(100cqw,100cqh,560px);max-width:none}}
.ttt-cell{fill:rgba(0,0,0,0);transition:fill .15s}
.ttt-cell.ttt-play{cursor:pointer}
.ttt-svg[data-turn="1"] .ttt-cell.ttt-play:hover{fill:rgba(37,99,235,.08)}
.ttt-svg[data-turn="2"] .ttt-cell.ttt-play:hover{fill:rgba(220,38,38,.08)}
.ttt-cell.ttt-hint-x{fill:rgba(37,99,235,.10);stroke:var(--x);stroke-width:1.5;stroke-dasharray:5 4}
.ttt-cell.ttt-hint-o{fill:rgba(220,38,38,.10);stroke:var(--o);stroke-width:1.5;stroke-dasharray:5 4}
.ttt-cell.ttt-wincell-x{fill:rgba(37,99,235,.10)}
.ttt-cell.ttt-wincell-o{fill:rgba(220,38,38,.10)}
.ttt-grid line{stroke:var(--line);stroke-width:2;stroke-linecap:round}
.ttt-x{stroke:var(--x);stroke-width:8;stroke-linecap:round;fill:none}
.ttt-o{stroke:var(--o);stroke-width:8;fill:none}
.ttt-mark{transition:opacity .2s}
.ttt-svg.ttt-dim .ttt-mark{opacity:.25}
.ttt-svg.ttt-dim .ttt-mark.ttt-hit{opacity:1}
.ttt-ghost{opacity:.22;pointer-events:none}
.ttt-ax{stroke-dasharray:56;stroke-dashoffset:56;animation:ttt-draw .18s ease-out forwards}
.ttt-ao{stroke-dasharray:128;stroke-dashoffset:128;animation:ttt-draw .28s ease-out forwards}
@keyframes ttt-draw{to{stroke-dashoffset:0}}
.ttt-wl{stroke-width:5;stroke-linecap:round;opacity:.9;stroke-dasharray:300;stroke-dashoffset:300;
  animation:ttt-draw .35s .05s ease-out forwards}
.ttt-wl.is-x{stroke:var(--x)}
.ttt-wl.is-o{stroke:var(--o)}
.ttt-cursor{fill:none;stroke:#9ca3af;stroke-width:1.5;stroke-dasharray:4 3;pointer-events:none}
.ttt-hide{display:none!important}

/* --- overlay modal: flex column, head/foot tetap, body scroll --- */
.ttt-ov{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:12px;
  background:rgba(255,255,255,.88);backdrop-filter:blur(3px);border-radius:12px;
  animation:ttt-fade .2s ease-out}
.ttt-ov[data-ov="cheats"]{z-index:25}
.ttt-ov[data-ov="result"]{z-index:30}
.ttt-ov[data-ov="pause"]{z-index:35}
.ttt-ov[data-ov="wait"]{z-index:40}
.ttt-ov[data-ov="help"]{z-index:50}
@keyframes ttt-fade{from{opacity:0}}
.ttt-card{display:flex;flex-direction:column;gap:10px;width:min(360px,100%);max-width:100%;
  max-height:100%;padding:18px;background:#fff;border:1px solid var(--line);border-radius:12px;
  box-shadow:0 8px 24px rgba(17,24,39,.08);overflow:hidden}
.ttt-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.ttt-head h3{margin:0;font-size:17px;font-weight:650}
.ttt-head h3.ttt-good{color:var(--x)}
.ttt-head h3.ttt-bad{color:var(--o)}
.ttt-body{flex:1 1 auto;min-height:0;overflow:auto}
.ttt-body p{margin:0;color:var(--mut);font-size:12.5px}
.ttt-body.ttt-center{text-align:center}
.ttt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.ttt-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.ttt-card.ttt-cheatcard{text-align:left}
.ttt-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:8px 0;min-height:44px;border-bottom:1px solid var(--soft);font-size:12.5px}
.ttt-cheatrow:last-of-type{border-bottom:0}
.ttt-note{font-size:11px;color:var(--mut)}
.ttt-help{color:var(--mut);font-size:12.5px}
.ttt-help ol{margin:0 0 10px;padding-left:18px}
.ttt-help li{margin:5px 0}
.ttt-help kbd{font:11px ui-monospace,monospace;background:var(--soft);border:1px solid var(--line);
  border-radius:5px;padding:1px 5px;color:var(--ink)}

/* --- keypad virtual: sibling setelah board --- */
.ttt-pad{display:none;grid-template-columns:repeat(3,1fr);gap:8px;max-width:260px;margin:0 auto;width:100%;flex:none}
@media (pointer:coarse),(max-width:640px){.ttt-pad{display:grid}}
.ttt-game.pad-on .ttt-pad{display:grid}
.ttt-game.pad-off .ttt-pad{display:none}
.ttt-key{aspect-ratio:1/1;min-height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;
  font-size:17px;font-weight:650;color:var(--mut);cursor:pointer}
.ttt-key:active{background:var(--soft)}
.ttt-key:disabled{opacity:.5;cursor:default}
.ttt-key.has-x{color:var(--x)}
.ttt-key.has-o{color:var(--o)}
@media (pointer:coarse){.ttt-btn{min-height:44px}.ttt-chip{min-height:44px;padding:8px 12px}}
@media (prefers-reduced-motion:reduce){.ttt-game *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- fill height + mobile refinements (PALING AKHIR) --- */
.ttt-icon-btn svg{flex:none;display:block}
.ttt-card{overflow:hidden}
.ttt-head,.ttt-foot{flex:none}
.ttt-body{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
.ttt-game{gap:8px}
.ttt-game .ttt-hud{gap:5px}
.ttt-game .ttt-hud .ttt-hud-info,
.ttt-game .ttt-hud .ttt-hud-actions{gap:5px}
.ttt-game .ttt-hud .ttt-hud-actions{margin-left:auto}
.ttt-game .ttt-hud .ttt-chip{padding:4px 6px;min-height:0;font-size:9px}
.ttt-game .ttt-hud .ttt-chip[data-hud="puzzlechip"],
.ttt-game .ttt-hud .ttt-chip[data-hud="bestchip"]{display:none}
.ttt-game .ttt-hud .ttt-btn{min-height:32px;padding:5px 8px;font-size:9px}
.ttt-game .ttt-hud .ttt-btn-label,
.ttt-game .ttt-hud .ttt-spacer{display:none}
.ttt-game .ttt-board:not(:has(.ttt-ov:not([hidden]))){flex:1 1 auto;min-height:0}
.ttt-game .ttt-board:has(.ttt-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px)}
.ttt-game .ttt-ov{padding:8px}
.ttt-game .ttt-card{width:100%;height:100%;max-height:100%;padding:12px}
.ttt-game .ttt-body{scrollbar-width:none}
.ttt-game .ttt-body::-webkit-scrollbar{display:none}
}
</style>
<div class="game-app ttt-game game-fill" data-wrap>
  <div class="ttt-hud">
    <div class="ttt-hud-info">
      <span class="ttt-chip"><i class="ttt-dot" data-hud="dot"></i><b data-hud="status">Ready</b></span>
      <span class="ttt-chip">YOU <b data-hud="role">—</b></span>
      <span class="ttt-chip" data-hud="roundchip">RND <b data-hud="round">1</b></span>
      <span class="ttt-chip">SCORE <b data-hud="score">—</b></span>
      <span class="ttt-chip" data-hud="bestchip">STREAK <b data-hud="streak">0</b> · BEST <b data-hud="best">0</b></span>
      <span class="ttt-chip" data-hud="puzzlechip" hidden>PUZZLES <b data-hud="puzzles">0</b></span>
    </div>
    <span class="ttt-spacer"></span>
    <div class="ttt-hud-actions">
      <button class="ttt-btn ttt-icon-btn" type="button" data-act="diff" data-btn="diff"
              aria-label="Bot difficulty" title="Toggle bot difficulty (Perfect / Easy)">${iconSVG("brain", { size: 14 })}<span class="ttt-btn-label">Perfect</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-act="puzzle" data-btn="puzzle"
              aria-label="Puzzle" title="Deal a solvable puzzle (N)">${iconSVG("puzzle", { size: 14 })}<span class="ttt-btn-label">Puzzle</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-act="pad" data-btn="pad" aria-pressed="false"
              aria-label="Keypad" title="Toggle on-screen keypad">${iconSVG("grid", { size: 14 })}<span class="ttt-btn-label">Pad</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-help
              aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ttt-btn-label">Help</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-cheats
              aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ttt-btn-label">Cheats</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-pause
              aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="ttt-btn-label">Pause</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-restart
              aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ttt-btn-label">Restart</span></button>
      <button class="ttt-btn ttt-icon-btn" type="button" data-exit
              aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ttt-btn-label">Exit game</span></button>
    </div>
  </div>
  <section class="game-panel ttt-board" data-board>
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

    <div class="ttt-ov" data-ov="wait" hidden><div class="ttt-card">
      <div class="ttt-head"><h3>Waiting for host</h3></div>
      <div class="ttt-body ttt-center"><p>The host is setting up the first round. Marks are drawn randomly.</p></div>
    </div></div>

    <div class="ttt-ov" data-ov="cheats" hidden><div class="ttt-card ttt-cheatcard">
      <div class="ttt-head"><h3>Cheats</h3><button class="ttt-btn" type="button" data-act="cheats-close" aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
      <div class="ttt-body">
        <div class="ttt-cheatrow"><span>Hint: outline my best move</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-hint" aria-pressed="false">Off</button></div>
        <div class="ttt-cheatrow"><span>Play my best move now</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-best">Play</button></div>
        <div class="ttt-cheatrow"><span>Undo my last move</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-undo">Undo</button></div>
        <div class="ttt-cheatrow"><span>Freeze bot: skip its next turn</span>
          <button class="ttt-btn ttt-cheaty" type="button" data-act="cheat-skip">Freeze</button></div>
      </div>
      <div class="ttt-foot"><span class="ttt-note">Solo only · assisted rounds don't count</span><button class="ttt-btn" type="button" data-act="cheats-close">Close</button></div>
    </div></div>

    <div class="ttt-ov" data-ov="result" hidden><div class="ttt-card">
      <div class="ttt-head"><h3 data-res="title">Round over</h3></div>
      <div class="ttt-body ttt-center"><p data-res="sub"></p></div>
      <div class="ttt-foot"><span class="ttt-note"></span><div class="ttt-row">
        <button class="ttt-btn ttt-primary" type="button" data-act="restart" data-res="again">Play again</button>
        <button class="ttt-btn" type="button" data-act="retry" data-res="retry" hidden>Retry puzzle</button>
        <button class="ttt-btn" type="button" data-act="puzzle" data-res="newpuzzle" hidden>New puzzle</button>
      </div></div>
    </div></div>

    <div class="ttt-ov" data-ov="pause" hidden><div class="ttt-card">
      <div class="ttt-head"><h3>Paused</h3></div>
      <div class="ttt-body ttt-center"><p>Bot turns and pending timers are frozen. Take your time.</p></div>
      <div class="ttt-foot"><span class="ttt-note">Press P or Esc to resume</span><button class="ttt-btn ttt-primary" type="button" data-resume>Resume</button></div>
    </div></div>

    <div class="ttt-ov" data-ov="help" hidden><div class="ttt-card">
      <div class="ttt-head"><h3>How to play</h3><button class="ttt-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
      <div class="ttt-body ttt-help">
        <ol>
          <li>Place your mark on an empty cell. Three in a row, column or diagonal wins.</li>
          <li>Marks are drawn randomly every round: blue X always opens, so you may start or answer — versus the bot or versus a friend in a room.</li>
          <li><b>Puzzle</b> deals a random mid-game position verified solvable: find the forced win against perfect defense. Retry keeps the same position.</li>
          <li><b>Cheats</b> (solo only) can hint, auto-play, undo or freeze the bot. Assisted rounds are not counted.</li>
        </ol>
        <div>Mouse: click a cell, hover previews your mark. Keyboard: <kbd>1</kbd>–<kbd>9</kbd> place (left to right, top to bottom),
        <kbd>←↑↓→</kbd> + <kbd>Enter</kbd> move and place, <kbd>N</kbd> puzzle, <kbd>R</kbd> restart,
        <kbd>P</kbd> pause, <kbd>C</kbd> cheats, <kbd>H</kbd> help, <kbd>Esc</kbd> close.
        On touch devices a 3×3 keypad appears under the board.</div>
      </div>
      <div class="ttt-foot"><span class="ttt-note">Press H to reopen this guide</span><button class="ttt-btn ttt-primary" type="button" data-help-close>Got it</button></div>
    </div></div>
  </section>
  <div class="ttt-pad" data-pad></div>
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
    const hud = {
        dot: $('[data-hud="dot"]'), status: $('[data-hud="status"]'),
        role: $('[data-hud="role"]'), round: $('[data-hud="round"]'),
        score: $('[data-hud="score"]'), streak: $('[data-hud="streak"]'),
        best: $('[data-hud="best"]'), puzzles: $('[data-hud="puzzles"]'),
        puzzleChip: $('[data-hud="puzzlechip"]'),
    };
    const ov = {
        wait: $('[data-ov="wait"]'), cheats: $('[data-ov="cheats"]'),
        result: $('[data-ov="result"]'), pause: $('[data-ov="pause"]'),
        help: $('[data-ov="help"]'),
    };
    const resTitle = $('[data-res="title"]');
    const resSub = $('[data-res="sub"]');
    const resAgain = $('[data-res="again"]');
    const resRetry = $('[data-res="retry"]');
    const resNew = $('[data-res="newpuzzle"]');
    const btnDiff = $('[data-btn="diff"]');
    const btnPuzzle = $('[data-btn="puzzle"]');
    const btnCheats = $('[data-cheats]');
    const btnPause = $('[data-pause]');
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

    /* Jeda: semua timer memakai jam virtual yang berhenti saat help/cheats/pause
       terbuka. Saat dilanjutkan, penanda Date.now() digeser sebesar jeda agar
       bot tidak loncat. */
    let timers = [];
    let timerTick = null;
    let frozenAt = 0;
    const frozen = () => paused || helpOpen || ui.cheats;

    function ensureTimer() {
        if (timerTick || frozen() || !timers.length) return;
        const next = Math.min.apply(null, timers.map((t) => t.due));
        timerTick = setTimeout(() => {
            timerTick = null;
            if (frozen()) return;
            const now = Date.now();
            const due = timers.filter((t) => t.due <= now);
            timers = timers.filter((t) => t.due > now);
            due.forEach((t) => t.fn());
            ensureTimer();
        }, Math.max(0, next - Date.now()));
    }
    const later = (fn, ms) => { timers.push({ fn, due: Date.now() + ms }); ensureTimer(); };
    const clearTimers = () => {
        if (timerTick) clearTimeout(timerTick);
        timerTick = null;
        timers = [];
    };
    function freezeTimers() {
        if (frozenAt) return;
        frozenAt = Date.now();
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
    }
    function thawTimers() {
        if (!frozenAt) return;
        const shift = Date.now() - frozenAt;
        frozenAt = 0;
        timers.forEach((t) => { t.due += shift; });
        ensureTimer();
    }
    const syncFreeze = () => { if (frozen()) freezeTimers(); else thawTimers(); };

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
    const canPlay = (i) => Boolean(state && state.phase === "play" && state.turn === myMark()
        && !state.board[i] && !paused && !helpOpen && !ui.cheats);
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
        const showKbd = ui.kbd && state && state.phase === "play" && !frozen();
        cursorEl.classList.toggle("ttt-hide", !showKbd);
        if (showKbd) {
            cursorEl.setAttribute("x", CX(ui.cursor) - 42);
            cursorEl.setAttribute("y", CY(ui.cursor) - 42);
        }
        gGhost.innerHTML = "";
        const i = ui.hover >= 0 ? ui.hover : ui.kbd ? ui.cursor : -1;
        if (i >= 0 && canPlay(i)) drawMark(gGhost, i, myMark());
    }

    function syncOverlays() {
        const waiting = !state;
        const over = Boolean(state && state.phase === "over");
        ov.help.hidden = !helpOpen;
        ov.cheats.hidden = !ui.cheats || helpOpen || waiting || online;
        ov.pause.hidden = !paused || helpOpen || ui.cheats || waiting;
        ov.wait.hidden = !waiting || helpOpen || ui.cheats || paused;
        ov.result.hidden = !(over && ui.resultShown) || helpOpen || ui.cheats || paused;

        const pLabel = btnPause.querySelector(".ttt-btn-label");
        if (pLabel) pLabel.textContent = paused ? "Resume" : "Pause";
        btnPause.setAttribute("aria-label", paused ? "Resume" : "Pause");
        btnPause.disabled = online;

        const cLabel = btnCheats.querySelector(".ttt-btn-label");
        if (cLabel) cLabel.textContent = ui.cheats ? "Cheats on" : "Cheats";
        btnCheats.setAttribute("aria-pressed", String(ui.cheats));
        btnCheats.classList.toggle("on", ui.cheats || ui.hint);
        btnCheats.disabled = online;

        btnDiff.hidden = online;
        btnPuzzle.hidden = online;
        if (!online) {
            const dLabel = btnDiff.querySelector(".ttt-btn-label");
            if (dLabel) dLabel.textContent = state && state.difficulty === "easy" ? "Easy" : "Perfect";
            btnDiff.setAttribute("aria-label", state && state.difficulty === "easy"
                ? "Bot: Easy — click for Perfect" : "Bot: Perfect — click for Easy");
        }
    }

    function render() {
        syncOverlays();
        if (!state) { // guest menunggu state pertama dari host
            hud.status.textContent = "Waiting for host…";
            hud.dot.className = "ttt-dot";
            hud.role.textContent = "—";
            hud.round.textContent = "—";
            hud.score.textContent = "—";
            hud.streak.textContent = "—";
            hud.best.textContent = String(best);
            hud.puzzleChip.hidden = true;
            return;
        }
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
        hud.dot.className = "ttt-dot";
        if (over) { hud.status.textContent = "Round over"; }
        else if (myTurn) { hud.status.textContent = "Your turn"; hud.dot.classList.add("is-you"); }
        else {
            hud.status.textContent = online ? "Opponent's turn" : "Bot thinking…";
            hud.dot.classList.add("is-opp");
            if (!online) hud.dot.classList.add("is-think");
        }

        const badge = (m) => `<b class="ttt-badge ${m === 1 ? "is-x" : "is-o"}">${m === 1 ? "X" : "O"}</b>`;
        if (state.puzzle) {
            hud.role.innerHTML = `Puzzle ${badge(my)} — find the forced win.`;
        } else if (online) {
            hud.role.innerHTML = `${badge(my)} vs ${esc(nameOf(1 - playerIndex))} ${badge(opp)}`;
        } else {
            hud.role.innerHTML = `${badge(my)} / ${badge(opp)}`;
        }
        hud.round.textContent = state.puzzle ? "P#" + state.puzzle.num : String(state.round);
        hud.score.textContent = online
            ? `${scoreOf(0)}–${scoreOf(1)} · D${state.score.d}`
            : `${scoreOf(0)}–${scoreOf(1)} · D${state.score.d}`;
        hud.streak.textContent = String(state.streak);
        hud.best.textContent = String(best);
        hud.puzzleChip.hidden = !state.puzzle;
        hud.puzzles.textContent = String(state.puzzlesSolved);

        /* keypad virtual */
        for (let i = 0; i < 9; i++) {
            const v = state.board[i];
            padKeys[i].textContent = v ? (v === 1 ? "X" : "O") : String(i + 1);
            padKeys[i].classList.toggle("has-x", v === 1);
            padKeys[i].classList.toggle("has-o", v === 2);
            padKeys[i].disabled = !canPlay(i);
        }

        /* cheat overlay controls */
        if (over) ui.cheats = false;
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
        syncFreeze();
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
        helpOpen = false;
        paused = false;
        syncFreeze();
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
        if (online || !state || state.phase !== "play" || state.turn !== state.marks[1] || frozen()) return;
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
        if (!action || typeof action !== "object") return;
        if (frozen() && (action.type === "place" || action.type === "cheat")) return;
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- overlay toggles ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { ui.cheats = false; paused = false; }
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        ui.cheats = typeof on === "boolean" ? on : !ui.cheats;
        if (ui.cheats) { helpOpen = false; paused = false; }
        syncFreeze();
        render();
    }
    function setPaused(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) { helpOpen = false; ui.cheats = false; }
        syncFreeze();
        render();
    }

    /* ---------- input: mouse / touch ---------- */
    function togglePad() {
        const visible = getComputedStyle(padEl).display !== "none";
        wrap.classList.toggle("pad-on", !visible);
        wrap.classList.toggle("pad-off", visible);
        btnPad.setAttribute("aria-pressed", String(!visible));
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { setPaused(); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        const cellEl = t.closest("[data-cell]");
        if (cellEl) {
            if (frozen()) return;
            ui.kbd = false;
            submitAction({ type: "place", cell: Number(cellEl.getAttribute("data-cell")) });
            return;
        }
        const actEl = t.closest("[data-act]");
        if (!actEl) return;
        switch (actEl.getAttribute("data-act")) {
            case "restart": submitAction({ type: "restart" }); break;
            case "puzzle": submitAction({ type: "puzzle" }); break;
            case "retry": submitAction({ type: "retry" }); break;
            case "diff": submitAction({ type: "difficulty" }); break;
            case "cheats": toggleCheats(); break;
            case "cheats-close": toggleCheats(false); break;
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
        if (c && svg.contains(c) && !frozen()) {
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

        /* prioritas: help → cheats → pause/Escape → aksi game */
        if (k === "h" || k === "H") { toggleHelp(); e.preventDefault(); return; }
        if (k === "c" || k === "C") { toggleCheats(); e.preventDefault(); return; }
        if (k === "p" || k === "P" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (ui.cheats) toggleCheats(false);
            else setPaused();
            e.preventDefault();
            return;
        }
        if (k === "r" || k === "R") { submitAction({ type: "restart" }); e.preventDefault(); return; }
        if (frozen()) { e.preventDefault(); return; }

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
            case "n": case "N": if (!online) submitAction({ type: "puzzle" }); break;
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
    syncFreeze();

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
