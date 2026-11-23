/*
  number-connect.js
  - META.id harus sama dengan nama file tanpa .js ("number-connect").
  - Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "number-connect",
    name: "Number Connect",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Chain equal neighbours — only the last tile doubles. Race the bot or a friend to the target.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 5v38M31 5v38M5 17h38M5 31h38"/><polyline points="11,11 24,11 24,24 37,24" opacity=".7"/><text x="11" y="11" dy=".35em" font-size="9" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">2</text><text x="24" y="11" dy=".35em" font-size="9" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">2</text><text x="24" y="24" dy=".35em" font-size="9" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">2</text><text x="37" y="24" dy=".35em" font-size="9" font-weight="700" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">4</text></svg>',
    bg: ["#ccfbf1", "#99f6e4"],
    bestKey: "numberConnectBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const baseIndex = online && !room.isHost ? 1 : 0; // slot mentah dari room (host=0, guest=1)
    let roomData = room?.room || null;
    let state = null;      // state kanonik (serializable, dipublish host)
    let solution = null;   // sertifikat solusi dari generator (lokal saja, tidak dipublish)
    let disposed = false;

    /* ================= UI state (lokal, tidak dibagikan) ================= */
    let sel = [];                       // path pilihan {r,c}
    let cursor = { r: 0, c: 0 };        // cursor keyboard / virtual pad
    let hint = null;                    // {a,b} highlight saran
    let overlay = null;                 // "start" | "help" | "cheat" | "round" | null
    let dragging = false, gesture = "", downCell = null, dragMoved = false;
    let builtKey = "";                  // cache rebuild tile SVG
    let prevStatus = "", prevRound = 0, prevSwap = null, seatNoted = false;
    let padOn = false, padConsumed = false;
    let botTimer = null, noteTimer = null;
    const padHold = { delay: null, repeat: null };
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* private mode */ }

    /* ================= shell + scoped minimalist styles ================= */
    root.innerHTML = `
<style>
.ncx{color:#0f172a;font-variant-numeric:tabular-nums}
.ncx .game-intro p{color:#64748b}
.ncx-score{display:flex;gap:10px;align-items:stretch;margin:10px 0}
.ncx-pcard{flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:8px 12px;transition:border-color .2s}
.ncx-pcard.on{border-color:#0d9488;box-shadow:inset 0 0 0 1px #0d9488}
.ncx-pname{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ncx-pname b{color:#0f172a;font-weight:600}
.ncx-pscore{font-size:22px;font-weight:700;line-height:1.2}
.ncx-psub{font-size:11px;color:#94a3b8}
.ncx-mid{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:84px;text-align:center}
.ncx-chip{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
.ncx-chip b{color:#0f172a;font-size:13px;margin-left:4px}
.ncx-stage{position:relative;display:flex;justify-content:center;padding:6px 0}
.ncx svg.ncx-svg{width:100%;max-width:432px;height:auto;touch-action:none;-webkit-user-select:none;user-select:none;display:block}
.ncx svg.ncx-live{cursor:pointer}
.ncx .ncx-cell{fill:#f8fafc}
.ncx .ncx-tile rect{stroke:rgba(15,23,42,.10);stroke-width:1}
.ncx .ncx-tile text{font-family:inherit;font-weight:600;text-anchor:middle;pointer-events:none}
.ncx .ncx-pop{transform-box:fill-box;transform-origin:center;animation:ncx-pop .3s ease-out}
@keyframes ncx-pop{0%{transform:scale(.55)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
.ncx .ncx-hl{fill:rgba(13,148,136,.10);stroke:#0d9488;stroke-width:1.5;pointer-events:none}
.ncx .ncx-line{fill:none;stroke:#0d9488;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.8;pointer-events:none}
.ncx .ncx-last{fill:none;stroke:#f59e0b;stroke-width:2.5;pointer-events:none}
.ncx .ncx-badge{font-size:11px;font-weight:700;fill:#b45309;text-anchor:middle;pointer-events:none}
.ncx .ncx-cursor{fill:none;stroke:#94a3b8;stroke-width:1.5;stroke-dasharray:4 4;pointer-events:none}
.ncx .ncx-hint{fill:none;stroke:#f59e0b;stroke-width:2;stroke-dasharray:5 4;pointer-events:none}
.ncx .ncx-hintline{fill:none;stroke:#f59e0b;stroke-width:2;stroke-dasharray:5 4;opacity:.7;pointer-events:none}
.ncx-bar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;margin:10px 0 4px}
.ncx-btn{border:1px solid #e2e8f0;background:#fff;color:#0f172a;border-radius:10px;padding:8px 13px;font-size:13px;font-family:inherit;cursor:pointer;touch-action:manipulation}
.ncx-btn:hover:not(:disabled){background:#f8fafc}
.ncx-btn:focus-visible{outline:2px solid #0d9488;outline-offset:2px}
.ncx-btn:disabled{opacity:.35;cursor:default}
.ncx-btn.primary{background:#0d9488;border-color:#0d9488;color:#fff}
.ncx-btn.primary:hover:not(:disabled){background:#0f766e}
.ncx-btn.ghost{border-color:transparent;color:#64748b}
.ncx-btn.ghost:hover:not(:disabled){color:#0f172a}
.ncx-btn.toggled{border-color:#0d9488;color:#0d9488}
.ncx-pad{display:none;justify-content:center;gap:26px;align-items:center;margin:8px 0 2px}
.ncx-pad.show{display:flex}
.ncx-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,46px);gap:4px}
.ncx-padbtn{border:1px solid #e2e8f0;background:#fff;border-radius:10px;color:#334155;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.ncx-padbtn:active{background:#ccfbf1;border-color:#0d9488}
.ncx-padacts{display:grid;grid-template-columns:repeat(2,72px);gap:6px}
.ncx-padacts .ncx-padbtn{height:46px}
.ncx-padacts .go{background:#0d9488;border-color:#0d9488;color:#fff}
.ncx-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.88);backdrop-filter:blur(2px);padding:12px}
.ncx-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.10);padding:18px;max-width:350px;width:100%;max-height:100%;overflow:auto}
.ncx-card h3{margin:0 0 8px;font-size:17px}
.ncx-card h4{margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
.ncx-card p,.ncx-card li{font-size:13px;color:#475569;line-height:1.5;margin:4px 0}
.ncx-card ul{margin:4px 0;padding-left:18px}
.ncx-card kbd{border:1px solid #e2e8f0;border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;background:#f8fafc;font-family:inherit}
.ncx-cardrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ncx-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9}
.ncx-cheatrow:last-of-type{border-bottom:0}
.ncx-cheatrow div b{font-size:13px;display:block}
.ncx-cheatrow div span{font-size:11px;color:#94a3b8}
.ncx-cheatrow .ncx-btn{flex:none;padding:6px 11px;font-size:12px}
.ncx-note{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);background:#0f172a;color:#f8fafc;font-size:12px;padding:6px 12px;border-radius:999px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:7;max-width:92%;text-align:center}
.ncx-note.show{opacity:.94}
.ncx .game-status-dot{background:#0d9488}
.ncx.wait .game-status-dot{background:#f59e0b;animation:ncx-pulse 1s ease-in-out infinite}
@keyframes ncx-pulse{50%{opacity:.3}}
.ncx .game-actions{margin-top:8px}
@media (max-width:520px){
  .ncx-pscore{font-size:18px}
  .ncx-mid{min-width:64px}
  .ncx-btn{padding:7px 10px;font-size:12px}
  .ncx-dpad{grid-template-columns:repeat(3,42px);grid-template-rows:repeat(3,42px)}
}
@media (prefers-reduced-motion:reduce){
  .ncx .ncx-pop{animation:none}
  .ncx.wait .game-status-dot{animation:none}
}
</style>
<div class="game-app ncx">
  <div class="game-intro">
    <div><h2>Number Connect</h2><p>Chain equal adjacent tiles — only the last tile doubles, once. First to the target wins the round.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>

  <div class="ncx-score">
    <div class="ncx-pcard" data-card="0">
      <div class="ncx-pname" data-pname="0">P1</div>
      <div class="ncx-pscore" data-pscore="0">0</div>
      <div class="ncx-psub" data-psub="0">Round 0 · Wins 0</div>
    </div>
    <div class="ncx-mid">
      <span class="ncx-chip">Level<b data-hud="level">1</b></span>
      <span class="ncx-chip">Target<b data-hud="target">64</b></span>
      <span class="ncx-chip">Best<b data-hud="best">0</b></span>
    </div>
    <div class="ncx-pcard" data-card="1">
      <div class="ncx-pname" data-pname="1">P2</div>
      <div class="ncx-pscore" data-pscore="1">0</div>
      <div class="ncx-psub" data-psub="1">Round 0 · Wins 0</div>
    </div>
  </div>

  <section class="game-panel ncx-stage" data-board>
    <svg class="ncx-svg" viewBox="0 0 402 402" role="img" aria-label="Number Connect board">
      <g data-layer="bg"></g>
      <g data-layer="tiles"></g>
      <g data-layer="path"></g>
    </svg>

    <div class="ncx-ov" data-ovz="start" hidden>
      <div class="ncx-card" role="dialog" aria-label="Start">
        <h3>Number Connect</h3>
        <ul>
          <li>Connect <b>2 or more equal tiles</b>, up / down / left / right only.</li>
          <li>Only the <b>last tile doubles (×2 once)</b>. The rest stay on the board — nothing is removed or refilled.</li>
          <li>Create the <b>target tile</b> to win the round. If the board freezes, the higher round score wins.</li>
        </ul>
        <p>A coin flip decides who moves first.</p>
        <div class="ncx-cardrow">
          <button class="ncx-btn primary" type="button" data-act="start-bot">Play vs Bot</button>
          <button class="ncx-btn" type="button" data-act="start-solo">Play solo</button>
          <button class="ncx-btn ghost" type="button" data-act="help">How to play</button>
        </div>
      </div>
    </div>

    <div class="ncx-ov" data-ovz="help" hidden>
      <div class="ncx-card" role="dialog" aria-label="How to play">
        <h3>How to play</h3>
        <h4>Goal</h4>
        <p>Be the first to build a tile worth the target: 64, then 128, 256, then 512 from level 4 on. Every board is generated with a verified solution.</p>
        <h4>Merging</h4>
        <ul>
          <li>Chain <b>two or more equal</b> tiles. Steps are orthogonal only — <b>no diagonals</b>.</li>
          <li>On confirm, <b>only the last tile is multiplied by 2, exactly once</b> — a longer chain never multiplies more.</li>
          <li>Connected tiles are <b>not deleted</b> and no new tiles drop in. You score the new value.</li>
        </ul>
        <h4>Turns &amp; rounds</h4>
        <ul>
          <li>One merge per turn. A <b>coin flip</b> picks who starts each round.</li>
          <li>Online: your slot (P1 / P2) is <b>drawn at random</b> at match start and re-drawn on restart.</li>
          <li>Reach the target to win instantly. If no adjacent equal pair remains, the higher <b>round score</b> takes the round.</li>
        </ul>
        <h4>Mouse</h4>
        <p>Drag through tiles and release to merge, or click tile by tile — click the last tile again (or Confirm) to merge. Click the previous tile to step back.</p>
        <h4>Keyboard</h4>
        <p><kbd>Arrows</kbd>/<kbd>WASD</kbd> move cursor · <kbd>Space</kbd> pick / extend · <kbd>Enter</kbd> merge · <kbd>Backspace</kbd> undo step · <kbd>Esc</kbd> clear · <kbd>C</kbd> cheats · <kbd>H</kbd> help</p>
        <h4>Touch</h4>
        <p>Tap or drag tiles, or use the virtual pad: arrows move the cursor, <b>Pick</b> selects, <b>Merge</b> confirms, <b>Undo</b> steps back, <b>Clear</b> resets.</p>
        <div class="ncx-cardrow"><button class="ncx-btn primary" type="button" data-act="ov-close">Got it</button></div>
      </div>
    </div>

    <div class="ncx-ov" data-ovz="cheat" hidden>
      <div class="ncx-card" role="dialog" aria-label="Cheats">
        <h3>Cheats</h3>
        <p>Helpers below. In online matches they apply to <b>you</b>. Cheats marked * do not use your turn.</p>
        <div class="ncx-cheatrow"><div><b>Hint</b><span>Highlight a strong merge *</span></div><button class="ncx-btn" type="button" data-cheat="hint">Show</button></div>
        <div class="ncx-cheatrow"><div><b>Best move</b><span>Play the strongest merge for you</span></div><button class="ncx-btn" type="button" data-cheat="best">Play</button></div>
        <div class="ncx-cheatrow"><div><b>Free ×2</b><span>Double the dashed cursor tile, no rules *</span></div><button class="ncx-btn" type="button" data-cheat="double">×2</button></div>
        <div class="ncx-cheatrow"><div><b>+500 points</b><span>Add 500 to your score *</span></div><button class="ncx-btn" type="button" data-cheat="score">Add</button></div>
        <div class="ncx-cheatrow"><div><b>Instant target</b><span>Place the target on the cursor tile and win *</span></div><button class="ncx-btn" type="button" data-cheat="target">Win</button></div>
        <div class="ncx-cheatrow"><div><b>Reshuffle</b><span>Fresh verified-solvable board, same level *</span></div><button class="ncx-btn" type="button" data-cheat="reshuffle">New board</button></div>
        <div class="ncx-cheatrow"><div><b>Skip level</b><span>Jump to the next level, no win credited *</span></div><button class="ncx-btn" type="button" data-cheat="skip">Skip</button></div>
        <div class="ncx-cardrow"><button class="ncx-btn ghost" type="button" data-act="ov-close">Close</button></div>
      </div>
    </div>

    <div class="ncx-ov" data-ovz="round" hidden>
      <div class="ncx-card" role="dialog" aria-label="Round result">
        <h3 data-round="title">Round over</h3>
        <p data-round="sub">…</p>
        <p data-round="wins"></p>
        <div class="ncx-cardrow">
          <button class="ncx-btn primary" type="button" data-act="next">Next round</button>
          <button class="ncx-btn" type="button" data-act="restart">Restart match</button>
          <button class="ncx-btn ghost" type="button" data-act="ov-close">View board</button>
        </div>
      </div>
    </div>

    <div class="ncx-note" data-note aria-live="polite"></div>
  </section>

  <div class="ncx-bar">
    <button class="ncx-btn" type="button" data-act="undo">Undo</button>
    <button class="ncx-btn" type="button" data-act="clear">Clear</button>
    <button class="ncx-btn primary" type="button" data-act="confirm">Confirm</button>
    <button class="ncx-btn primary" type="button" data-act="next" data-next hidden>Next round</button>
    <button class="ncx-btn ghost" type="button" data-act="cheat">Cheats</button>
    <button class="ncx-btn ghost" type="button" data-act="help">How to play</button>
    <button class="ncx-btn ghost" type="button" data-act="pad" aria-pressed="false">Pad</button>
    <button class="ncx-btn ghost" type="button" data-act="restart">Restart</button>
  </div>

  <div class="ncx-pad" data-padwrap>
    <div class="ncx-dpad">
      <span></span>
      <button class="ncx-padbtn" type="button" data-pad="up" aria-label="Move up"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg></button>
      <span></span>
      <button class="ncx-padbtn" type="button" data-pad="left" aria-label="Move left"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
      <span></span>
      <button class="ncx-padbtn" type="button" data-pad="right" aria-label="Move right"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
      <span></span>
      <button class="ncx-padbtn" type="button" data-pad="down" aria-label="Move down"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg></button>
      <span></span>
    </div>
    <div class="ncx-padacts">
      <button class="ncx-padbtn" type="button" data-pad="pick">Pick</button>
      <button class="ncx-padbtn go" type="button" data-pad="merge">Merge</button>
      <button class="ncx-padbtn" type="button" data-pad="undo">Undo</button>
      <button class="ncx-padbtn" type="button" data-pad="clear">Clear</button>
    </div>
  </div>

  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ================= refs ================= */
    const $ = (s, r) => (r || root).querySelector(s);
    const svg = $(".ncx-svg");
    const gBg = $('[data-layer="bg"]');
    const gTiles = $('[data-layer="tiles"]');
    const gPath = $('[data-layer="path"]');
    const statusEl = $("[data-status]");
    const statusWrap = $(".game-status");
    const noteEl = $("[data-note]");
    const padWrap = $("[data-padwrap]");
    const btnConfirm = $('[data-act="confirm"]');
    const btnClear = $('[data-act="clear"]');
    const btnUndo = $('[data-act="undo"]');
    const btnNext = $("[data-next]");
    const btnPad = $('[data-act="pad"]');
    const ovz = {
        start: $('[data-ovz="start"]'),
        help: $('[data-ovz="help"]'),
        cheat: $('[data-ovz="cheat"]'),
        round: $('[data-ovz="round"]'),
    };
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    /* ================= constants ================= */
    const N = 6, PAD = 6, CELL = 60, STEP = 66, VW = 402;
    const TARGETS = [64, 128, 256, 512];
    const COLORS = {
        2: "#ffffff", 4: "#f8fafc", 8: "#f1f5f9", 16: "#e2e8f0",
        32: "#ccfbf1", 64: "#99f6e4", 128: "#5eead4", 256: "#2dd4bf",
        512: "#14b8a6", 1024: "#0d9488", 2048: "#0f766e", 4096: "#115e59", 8192: "#134e4a",
    };
    const targetFor = (lv) => TARGETS[Math.min(lv - 1, TARGETS.length - 1)];
    const xOf = (c) => PAD + c * STEP, yOf = (r) => PAD + r * STEP;
    const cxOf = (c) => xOf(c) + CELL / 2, cyOf = (r) => yOf(r) + CELL / 2;
    const fsOf = (v) => (v < 100 ? 22 : v < 1000 ? 19 : 16);
    const colorOf = (v) => COLORS[v] || "#134e4a";
    const textOf = (v) => (v >= 256 ? "#ffffff" : "#0f172a");
    const clampName = (s) => (String(s || "Player").replace(/[<>]/g, "").trim().slice(0, 20) || "Player");
    const cloneGrid = (g) => g.map((row) => row.slice());
    const sameCell = (a, b) => a.r === b.r && a.c === b.c;
    const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; // tanpa diagonal
    const inSel = (cell) => sel.some((p) => sameCell(p, cell));

    for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
            mk("rect", { x: xOf(c), y: yOf(r), width: CELL, height: CELL, rx: 10, class: "ncx-cell" }, gBg);

    /* ================= pure rules ================= */
    function pathValid(g, path) {
        if (!Array.isArray(path) || path.length < 2 || !g || !g.length) return false;
        const seen = Object.create(null);
        let prev = null;
        for (const raw of path) {
            if (!raw || typeof raw.r !== "number" || typeof raw.c !== "number") return false;
            const p = { r: raw.r, c: raw.c };
            if (p.r < 0 || p.c < 0 || p.r >= N || p.c >= N) return false;
            if (g[p.r][p.c] == null) return false;
            const key = p.r * 100 + p.c;
            if (seen[key]) return false;
            seen[key] = true;
            if (prev) {
                if (!adjacent(prev, p)) return false;                 // ortogonal saja
                if (g[prev.r][prev.c] !== g[p.r][p.c]) return false;  // nilai harus sama
            }
            prev = p;
        }
        return true;
    }

    // Aturan baru: TIDAK ada sel yang dihapus. Hanya sel terakhir ×2, satu kali,
    // berapa pun panjang rantainya. Tidak ada gravitasi / refill.
    function applyMerge(g, path) {
        const out = cloneGrid(g);
        if (!pathValid(g, path)) return { grid: out, gained: 0, at: null };
        const last = path[path.length - 1];
        const v = g[path[0].r][path[0].c];
        out[last.r][last.c] = v * 2;
        return { grid: out, gained: v * 2, at: { r: last.r, c: last.c } };
    }

    function hasAnyMove(g) {
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                const v = g[r][c];
                if (v == null) continue;
                if (r + 1 < N && g[r + 1][c] === v) return true;
                if (c + 1 < N && g[r][c + 1] === v) return true;
            }
        return false;
    }

    function listPairs(g) {
        const out = [];
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                const v = g[r][c];
                if (v == null) continue;
                if (r + 1 < N && g[r + 1][c] === v) {
                    out.push({ a: { r, c }, b: { r: r + 1, c }, v });
                    out.push({ a: { r: r + 1, c }, b: { r, c }, v });
                }
                if (c + 1 < N && g[r][c + 1] === v) {
                    out.push({ a: { r, c }, b: { r, c: c + 1 }, v });
                    out.push({ a: { r, c: c + 1 }, b: { r, c }, v });
                }
            }
        return out;
    }

    function scoreMove(g, p, mx) {
        const nv = p.v * 2;
        let sc = p.v * 4;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dr, dc] of dirs) {
            const rr = p.b.r + dr, cc = p.b.c + dc;
            if (rr >= 0 && cc >= 0 && rr < N && cc < N && !(rr === p.a.r && cc === p.a.c) && g[rr][cc] === nv) sc += 3;
        }
        if (nv > mx) sc += 2;
        return sc;
    }

    const maxOf = (g) => { let m = 0; for (const row of g) for (const v of row) if (v > m) m = v; return m; };

    /* ================= solvable level generator =================
       Papan acak diverifikasi dengan rollout greedy acak sampai target
       tercapai; jalur kemenangan disimpan sebagai sertifikat. Distribusi
       angka diperkaya per level. Fallback: papan "subur" semua 2 yang
       juga diverifikasi (praktis selalu lolos). */
    function spawnVal(level) {
        const r = Math.random();
        let p2, p4;
        if (level <= 1) { p2 = 0.60; p4 = 0.30; }
        else if (level === 2) { p2 = 0.50; p4 = 0.35; }
        else if (level === 3) { p2 = 0.42; p4 = 0.36; }
        else { p2 = 0.34; p4 = 0.38; }
        return r < p2 ? 2 : r < p2 + p4 ? 4 : 8;
    }

    function findSolution(grid, target, rollouts = 40, cap = 320, budgetMs = 260) {
        const t0 = Date.now();
        for (let t = 0; t < rollouts; t++) {
            if (Date.now() - t0 > budgetMs) return null;
            const g = cloneGrid(grid);
            const moves = [];
            for (let s = 0; s < cap; s++) {
                const ps = listPairs(g);
                if (!ps.length) break;
                const mx = maxOf(g);
                let bestP = null, bestS = -Infinity;
                for (const p of ps) {
                    const sc = scoreMove(g, p, mx) + Math.random() * 2.5;
                    if (sc > bestS) { bestS = sc; bestP = p; }
                }
                g[bestP.b.r][bestP.b.c] = bestP.v * 2;
                moves.push([{ r: bestP.a.r, c: bestP.a.c }, { r: bestP.b.r, c: bestP.b.c }]);
                if (bestP.v * 2 >= target) return moves;
            }
        }
        return null;
    }

    function generateBoard(level, target) {
        const t0 = Date.now();
        for (let att = 0; att < 10 && Date.now() - t0 < 400; att++) {
            const g = [];
            for (let r = 0; r < N; r++) {
                const row = [];
                for (let c = 0; c < N; c++) row.push(spawnVal(level));
                g.push(row);
            }
            const sol = findSolution(g, target, 40, 320, 120);
            if (sol) return { grid: g, solution: sol };
        }
        const g = Array.from({ length: N }, () => new Array(N).fill(2));
        return { grid: g, solution: findSolution(g, target, 160, 400, 900) };
    }

    function bestMoveFor(g, target) {
        const sol = findSolution(g, target, 20, 300, 140);
        if (sol) return sol[0];
        const ps = listPairs(g);
        if (!ps.length) return null;
        const mx = maxOf(g);
        let bestP = null, bestS = -Infinity;
        for (const p of ps) {
            const sc = scoreMove(g, p, mx) + Math.random() * 0.5;
            if (sc > bestS) { bestS = sc; bestP = p; }
        }
        return [bestP.a, bestP.b];
    }

    function botPick(g, target) {
        const ps = listPairs(g);
        if (!ps.length) return null;
        for (const p of ps) if (p.v * 2 >= target) return [p.a, p.b]; // langsung menang
        const mx = maxOf(g);
        const scored = ps
            .map((p) => ({ p, sc: scoreMove(g, p, mx) + Math.random() * 2.5 }))
            .sort((x, y) => y.sc - x.sc);
        const pick = Math.random() < 0.15
            ? scored[Math.floor(Math.random() * Math.min(3, scored.length))].p
            : scored[0].p;
        return [pick.a, pick.b];
    }

    /* ================= state helpers ================= */
    const mySeat = () => (online && state?.swap ? 1 - baseIndex : baseIndex); // undian posisi acak
    const nameOf = (seat) => (state?.names?.[seat] || "Player " + (seat + 1));
    const canAct = () =>
        Boolean(state) && state.status === "playing" &&
        (state.vs === "solo" || state.turn === mySeat());

    function startRound(lv) {
        const gen = generateBoard(lv, targetFor(lv));
        solution = gen.solution;
        state.level = lv;
        state.grid = gen.grid;
        state.boardId++;
        state.round++;
        state.moves = 0;
        state.roundScores = [0, 0];
        state.first = Math.random() < 0.5 ? 0 : 1; // coin flip: siapa jalan duluan
        state.turn = state.first;
        state.status = "playing";
        state.winner = null;
        state.reason = "";
        state.last = null;
        sel = []; hint = null;
    }

    function initMatch(vs) {
        const swap = online ? Math.random() < 0.5 : false; // undian slot P1/P2
        const names = ["Player 1", "Player 2"];
        if (online) names[swap ? 1 : 0] = clampName(playerName);
        else { names[0] = clampName(playerName); names[1] = vs === "bot" ? "Bot" : "—"; }
        state = {
            v: 1, vs, swap, names,
            boardId: 0, round: 0, level: 1, grid: null,
            turn: 0, first: 0, status: "playing",
            winner: null, reason: "",
            scores: [0, 0], roundScores: [0, 0], wins: [0, 0],
            moves: 0, last: null,
        };
        startRound(1);
        if (!online) state.status = "ready";
        sel = []; hint = null; cursor = { r: 0, c: 0 };
    }

    function endRound(winner, reason) {
        state.status = "round";
        state.winner = winner;
        state.reason = reason;
        if (winner >= 0) state.wins[winner]++;
        sel = []; hint = null;
    }

    function freezeWinner() {
        if (state.vs === "solo") return -1;
        const [a, b] = state.roundScores;
        return a > b ? 0 : b > a ? 1 : -1;
    }

    function mergeIntoState(seat, path) {
        const res = applyMerge(state.grid, path);
        if (!res.at) return false;
        state.grid = res.grid;
        state.scores[seat] += res.gained;
        state.roundScores[seat] += res.gained;
        state.moves++;
        state.last = { r: res.at.r, c: res.at.c, seq: state.round * 1000 + state.moves };
        sel = []; hint = null;
        if (res.gained >= targetFor(state.level)) { endRound(seat, "target"); return true; }
        if (!hasAnyMove(state.grid)) { endRound(freezeWinner(), "freeze"); return true; }
        if (state.vs !== "solo") state.turn = 1 - state.turn;
        return true;
    }

    /* ================= rendering ================= */
    function renderTiles() {
        const key = state.boardId + "|" + state.moves + "|" + state.level + "|" + state.round;
        if (key === builtKey) return;
        builtKey = key;
        gTiles.innerHTML = "";
        const tgt = targetFor(state.level);
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++) {
                const v = state.grid[r][c];
                if (v == null) continue;
                const isPop = state.last && state.last.r === r && state.last.c === c;
                const g = mk("g", { class: "ncx-tile" + (isPop ? " ncx-pop" : "") }, gTiles);
                mk("rect", {
                    x: xOf(c), y: yOf(r), width: CELL, height: CELL, rx: 10,
                    fill: colorOf(v),
                    stroke: v >= tgt ? "#f59e0b" : "rgba(15,23,42,.10)",
                    "stroke-width": v >= tgt ? 2 : 1,
                }, g);
                const t = mk("text", {
                    x: cxOf(c), y: cyOf(r), dy: ".35em",
                    "font-size": fsOf(v), fill: textOf(v),
                }, g);
                t.textContent = v;
            }
    }

    function renderPath() {
        gPath.innerHTML = "";
        if (!state || !state.grid) return;
        if (hint) {
            for (const p of [hint.a, hint.b])
                mk("rect", { x: xOf(p.c) + 2, y: yOf(p.r) + 2, width: CELL - 4, height: CELL - 4, rx: 9, class: "ncx-hint" }, gPath);
            mk("polyline", {
                points: cxOf(hint.a.c) + "," + cyOf(hint.a.r) + " " + cxOf(hint.b.c) + "," + cyOf(hint.b.r),
                class: "ncx-hintline",
            }, gPath);
        }
        for (const p of sel)
            mk("rect", { x: xOf(p.c), y: yOf(p.r), width: CELL, height: CELL, rx: 10, class: "ncx-hl" }, gPath);
        if (sel.length >= 2)
            mk("polyline", { points: sel.map((p) => cxOf(p.c) + "," + cyOf(p.r)).join(" "), class: "ncx-line" }, gPath);
        if (sel.length) {
            const l = sel[sel.length - 1];
            mk("rect", { x: xOf(l.c) + 4, y: yOf(l.r) + 4, width: CELL - 8, height: CELL - 8, rx: 8, class: "ncx-last" }, gPath);
            const badge = mk("text", { x: cxOf(l.c), y: yOf(l.r) - 3, class: "ncx-badge" }, gPath);
            badge.textContent = "×2";
        }
        mk("rect", { x: xOf(cursor.c) + 1, y: yOf(cursor.r) + 1, width: CELL - 2, height: CELL - 2, rx: 9, class: "ncx-cursor" }, gPath);
        updateControls();
    }

    function updateControls() {
        const ok = canAct();
        btnConfirm.disabled = !(ok && sel.length >= 2);
        btnClear.disabled = !(sel.length > 0);
        btnUndo.disabled = !(sel.length > 0);
        btnNext.hidden = !(state && state.status === "round");
        svg.classList.toggle("ncx-live", ok);
    }

    function renderOverlays() {
        for (const k in ovz) ovz[k].hidden = overlay !== k;
        if (overlay === "round" && state) {
            const w = state.winner, tgt = targetFor(state.level);
            const solo = state.vs === "solo";
            let title, sub;
            if (w === -1) {
                title = solo ? "Board frozen" : "Draw";
                sub = solo
                    ? "No adjacent equal tiles left. Round score " + state.roundScores[0] + "."
                    : "No moves left and round scores are tied " + state.roundScores[0] + " – " + state.roundScores[1] + ".";
            } else {
                title = online ? nameOf(w) + " wins the round"
                    : w === mySeat() ? "You win the round"
                        : state.vs === "bot" ? "Bot wins the round" : "Round complete";
                sub = state.reason === "target"
                    ? "Built the " + tgt + " tile."
                    : "No moves left — higher round score takes it (" + state.roundScores[0] + " – " + state.roundScores[1] + ").";
                sub += solo ? " Total score " + state.scores[0] + "." : " Match score " + state.scores[0] + " – " + state.scores[1] + ".";
            }
            $('[data-round="title"]').textContent = title;
            $('[data-round="sub"]').textContent = sub;
            $('[data-round="wins"]').textContent = solo ? "" :
                "Rounds won: " + nameOf(0) + " " + state.wins[0] + " · " + nameOf(1) + " " + state.wins[1];
            const nb = $('[data-act="next"]', ovz.round);
            nb.textContent = "Next round — target " + targetFor(state.level + 1);
        }
    }

    function render() {
        if (disposed) return;
        if (!state || !state.grid) {
            statusEl.textContent = "Connecting…";
            gTiles.innerHTML = ""; gPath.innerHTML = "";
            updateControls(); renderOverlays();
            return;
        }
        // transisi overlay otomatis + pengumuman (untuk guest yang menerima state)
        if (state.status === "round" && prevStatus !== "round") overlay = "round";
        if (state.status === "playing" && overlay === "round") overlay = null;
        if (online) {
            if (!seatNoted || state.swap !== prevSwap) {
                if (seatNoted || prevSwap !== null) note("Random draw — you are Player " + (mySeat() + 1));
                seatNoted = true; prevSwap = state.swap;
            }
            if (state.round !== prevRound && state.status === "playing")
                note("Coin flip — " + nameOf(state.first) + " starts");
        }
        prevRound = state.round;
        prevStatus = state.status;

        renderTiles();
        renderPath();

        const me = mySeat();
        for (let s = 0; s < 2; s++) {
            const card = $('[data-card="' + s + '"]');
            card.hidden = state.vs === "solo" && s === 1;
            card.classList.toggle("on", state.status === "playing" && state.vs !== "solo" && state.turn === s);
            $('[data-pname="' + s + '"]').innerHTML =
                "P" + (s + 1) + " · <b></b>" + (s === me ? " (You)" : "");
            $('[data-pname="' + s + '"] b').textContent = nameOf(s);
            $('[data-pscore="' + s + '"]').textContent = state.scores[s];
            $('[data-psub="' + s + '"]').textContent =
                "Round " + state.roundScores[s] + " · Wins " + state.wins[s];
        }
        $('[data-hud="level"]').textContent = state.level;
        $('[data-hud="target"]').textContent = targetFor(state.level);
        const mine = state.scores[me] || 0;
        if (mine > best) {
            best = mine;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ }
        }
        $('[data-hud="best"]').textContent = best;

        let status, wait = false;
        if (state.status === "ready") status = "Choose a mode to start";
        else if (state.status === "round") status = "Round over";
        else if (state.vs === "solo" || state.turn === me) status = "Your turn";
        else if (state.vs === "bot") { status = "Bot is thinking…"; wait = true; }
        else { status = "Waiting for " + nameOf(1 - me) + "…"; wait = true; }
        statusEl.textContent = status;
        statusWrap.parentElement.classList.toggle("wait", wait);
        root.querySelector(".ncx").classList.toggle("wait", wait);

        updateControls();
        renderOverlays();
    }

    function note(msg) {
        noteEl.textContent = msg;
        noteEl.classList.add("show");
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => noteEl.classList.remove("show"), 2600);
    }

    /* ================= networking / turn flow ================= */
    function scheduleBot() {
        clearTimeout(botTimer);
        botTimer = null;
        if (online || !state || state.vs !== "bot") return;
        if (state.status !== "playing" || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            if (disposed || !state || state.status !== "playing" || state.turn !== 1) return;
            const mv = botPick(state.grid, targetFor(state.level));
            if (mv) applyAction({ type: "merge", path: mv }, 1);
        }, 650 + Math.random() * 550);
    }

    function publish() {
        render();
        scheduleBot();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actorBase) {
        if (!state || !action || typeof action.type !== "string") return;
        const seat = online && state.swap ? 1 - actorBase : actorBase; // slot hasil undian
        switch (action.type) {
            case "hello": {
                if (!online || actorBase !== 1) return;
                state.names[seat] = clampName(action.name);
                publish();
                return;
            }
            case "start": {
                if (online || state.status !== "ready") return;
                state.vs = action.opponent === "solo" ? "solo" : "bot";
                state.names[1] = state.vs === "bot" ? "Bot" : "—";
                state.status = "playing";
                overlay = null;
                note("Coin flip — " + nameOf(state.first) + " starts");
                publish();
                return;
            }
            case "merge": {
                if (state.status !== "playing") return;
                if (state.vs !== "solo" && seat !== state.turn) return;
                if (!pathValid(state.grid, action.path)) return;
                mergeIntoState(seat, action.path.map((p) => ({ r: p.r, c: p.c })));
                publish();
                return;
            }
            case "next": {
                if (state.status !== "round") return;
                startRound(state.level + 1);
                note("Coin flip — " + nameOf(state.first) + " starts");
                publish();
                return;
            }
            case "restart": {
                const vs = state.vs;
                const guestName = online ? state.names[state.swap ? 0 : 1] : null;
                initMatch(vs);
                if (online) {
                    state.names[state.swap ? 0 : 1] = guestName;
                    note("Random draw — you are Player " + (mySeat() + 1));
                } else {
                    state.status = "playing";
                }
                overlay = null;
                prevSwap = state.swap; seatNoted = true;
                note("Coin flip — " + nameOf(state.first) + " starts");
                publish();
                return;
            }
            case "cheat": {
                const kind = action.kind;
                const playing = state.status === "playing";
                const cell = action.cell && typeof action.cell.r === "number" &&
                    action.cell.r >= 0 && action.cell.r < N && action.cell.c >= 0 && action.cell.c < N
                    ? { r: action.cell.r, c: action.cell.c } : { r: cursor.r, c: cursor.c };
                if (kind === "best") {
                    if (!playing || (state.vs !== "solo" && seat !== state.turn)) return;
                    const mv = bestMoveFor(state.grid, targetFor(state.level));
                    if (mv) { mergeIntoState(seat, mv); publish(); }
                    return;
                }
                if (kind === "double") {
                    if (!playing) return;
                    const nv = state.grid[cell.r][cell.c] * 2;
                    state.grid[cell.r][cell.c] = nv;
                    state.scores[seat] += nv; state.roundScores[seat] += nv;
                    state.moves++;
                    state.last = { r: cell.r, c: cell.c, seq: state.round * 1000 + state.moves };
                    hint = null;
                    if (nv >= targetFor(state.level)) endRound(seat, "target");
                    else if (!hasAnyMove(state.grid)) endRound(freezeWinner(), "freeze");
                    publish();
                    return;
                }
                if (kind === "score") {
                    if (!playing) return;
                    state.scores[seat] += 500; state.roundScores[seat] += 500;
                    publish();
                    return;
                }
                if (kind === "target") {
                    if (!playing) return;
                    const tgt = targetFor(state.level);
                    state.grid[cell.r][cell.c] = tgt;
                    state.scores[seat] += tgt; state.roundScores[seat] += tgt;
                    state.moves++;
                    state.last = { r: cell.r, c: cell.c, seq: state.round * 1000 + state.moves };
                    endRound(seat, "target");
                    publish();
                    return;
                }
                if (kind === "reshuffle") {
                    if (!playing) return;
                    const gen = generateBoard(state.level, targetFor(state.level));
                    solution = gen.solution;
                    state.grid = gen.grid;
                    state.boardId++;
                    state.last = null;
                    sel = []; hint = null;
                    publish();
                    return;
                }
                if (kind === "skip") {
                    if (state.status !== "playing" && state.status !== "round") return;
                    startRound(state.level + 1);
                    note("Coin flip — " + nameOf(state.first) + " starts");
                    publish();
                    return;
                }
                return;
            }
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, baseIndex);
    }

    function receiveState(next) {
        state = next;
        sel = []; hint = null;
        render();
    }

    /* ================= local interactions ================= */
    function submitMerge() {
        if (!canAct() || sel.length < 2 || !pathValid(state.grid, sel)) return;
        const path = sel.map((p) => ({ r: p.r, c: p.c }));
        sel = []; hint = null;
        submitAction({ type: "merge", path });
        if (online && !room.isHost) renderPath();
    }

    function clearSel() { sel = []; renderPath(); }
    function undoSel() { if (sel.length) { sel.pop(); renderPath(); } }

    function moveCursor(dr, dc) {
        cursor = {
            r: Math.max(0, Math.min(N - 1, cursor.r + dr)),
            c: Math.max(0, Math.min(N - 1, cursor.c + dc)),
        };
        renderPath();
    }

    function pickAtCursor() {
        if (!canAct()) { note("Not your turn"); return; }
        const cell = { r: cursor.r, c: cursor.c };
        if (!sel.length) { sel = [cell]; renderPath(); return; }
        const last = sel[sel.length - 1];
        if (sameCell(last, cell)) {
            if (sel.length >= 2) submitMerge();
            else note("Pick a neighbouring equal tile first");
            return;
        }
        if (sel.length >= 2 && sameCell(sel[sel.length - 2], cell)) { sel.pop(); renderPath(); return; }
        const v = state.grid[cell.r][cell.c];
        if (!inSel(cell) && v != null && state.grid[last.r][last.c] === v && adjacent(last, cell)) {
            sel.push(cell); renderPath(); return;
        }
        note("Pick an adjacent tile with the same number");
    }

    function doCheat(kind) {
        if (!state) return;
        if (kind === "hint") {
            if (state.status !== "playing") { note("Start a round first"); return; }
            const mv = bestMoveFor(state.grid, targetFor(state.level));
            if (!mv) { note("No merge available — try Reshuffle"); return; }
            hint = { a: mv[0], b: mv[1] };
            overlay = null;
            renderOverlays(); renderPath();
            note("Hint: merge the highlighted pair");
            return;
        }
        if (kind === "best" && !canAct()) { note("Best move needs your turn"); return; }
        overlay = null;
        renderOverlays();
        submitAction({ type: "cheat", kind, cell: { r: cursor.r, c: cursor.c } });
        const labels = {
            best: "Cheat: best move played", double: "Cheat: tile doubled",
            score: "Cheat: +500 points", target: "Cheat: target placed",
            reshuffle: "Cheat: fresh solvable board", skip: "Cheat: level skipped",
        };
        note(labels[kind] || "Cheat applied");
    }

    function openOverlay(name) {
        overlay = overlay === name ? null : name;
        renderOverlays();
    }

    /* ================= pointer input (drag + click-click) ================= */
    function cellAt(e) {
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * VW;
        const y = ((e.clientY - rect.top) / rect.height) * VW;
        const c = Math.floor((x - PAD) / STEP);
        const r = Math.floor((y - PAD) / STEP);
        if (x < PAD || y < PAD || c < 0 || c >= N || r < 0 || r >= N) return null;
        return { r, c };
    }

    function press(cell, e) {
        const v = state.grid[cell.r][cell.c];
        const len = sel.length;
        const begin = (g) => {
            dragging = true; gesture = g; dragMoved = false; downCell = cell;
            try { svg.setPointerCapture(e.pointerId); } catch (err) { /* pointer gone */ }
        };
        if (len > 0) {
            const last = sel[len - 1];
            if (sameCell(last, cell)) { begin(len >= 2 ? "confirmLast" : "new"); return; }
            if (len >= 2 && sameCell(sel[len - 2], cell)) { sel.pop(); begin("extend"); renderPath(); return; }
            if (!inSel(cell) && v != null && state.grid[last.r][last.c] === v && adjacent(last, cell)) {
                sel.push({ r: cell.r, c: cell.c }); begin("extend"); renderPath(); return;
            }
        }
        if (v != null) { sel = [{ r: cell.r, c: cell.c }]; begin("new"); renderPath(); return; }
        sel = []; renderPath();
    }

    function moveSel(cell) {
        if (!sel.length) return;
        if (downCell && !sameCell(downCell, cell)) dragMoved = true;
        const len = sel.length;
        const last = sel[len - 1];
        if (sameCell(last, cell)) return;
        if (len >= 2 && sameCell(sel[len - 2], cell)) { sel.pop(); renderPath(); return; }
        if (inSel(cell)) return;
        const v = state.grid[cell.r][cell.c];
        if (v != null && state.grid[last.r][last.c] === v && adjacent(last, cell)) {
            sel.push({ r: cell.r, c: cell.c }); renderPath();
        }
    }

    function release() {
        if (!dragging) return;
        dragging = false;
        if (sel.length >= 2 && canAct()) {
            if (gesture === "new") { submitMerge(); return; }
            if (gesture === "confirmLast" && !dragMoved) { submitMerge(); return; }
        }
        updateControls();
    }

    const onPointerDown = (e) => {
        if (!state || !state.grid) return;
        const cell = cellAt(e);
        if (!cell) return;
        cursor = { r: cell.r, c: cell.c };
        if (!canAct()) { renderPath(); return; }
        press(cell, e);
    };
    const onPointerMove = (e) => {
        if (!dragging) return;
        const cell = cellAt(e);
        if (!cell) { dragMoved = true; return; }
        moveSel(cell);
    };
    const onPointerUp = () => release();
    const onPointerCancel = () => { dragging = false; };
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerCancel);

    /* ================= keyboard (desktop) ================= */
    const onKey = (e) => {
        if (disposed || !state || e.defaultPrevented) return;
        const t = e.target;
        if (t && t.closest && t.closest("input,textarea,select,[contenteditable]")) return;
        const k = e.key;
        if (k === "Escape") {
            if (overlay) { overlay = null; renderOverlays(); }
            else if (sel.length) clearSel();
            e.preventDefault();
            return;
        }
        if (k === "c" || k === "C") { openOverlay("cheat"); e.preventDefault(); return; }
        if (k === "h" || k === "H" || k === "?") { openOverlay("help"); e.preventDefault(); return; }
        if (overlay) {
            if (overlay === "round" && k === "Enter") { submitAction({ type: "next" }); e.preventDefault(); }
            return;
        }
        const dirs = {
            ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
            w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
            W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
        };
        if (dirs[k]) { moveCursor(dirs[k][0], dirs[k][1]); e.preventDefault(); return; }
        if (k === " ") { pickAtCursor(); e.preventDefault(); return; }
        if (k === "Enter") {
            if (canAct() && sel.length >= 2) { submitMerge(); e.preventDefault(); }
            return;
        }
        if (k === "Backspace") { if (sel.length) { undoSel(); e.preventDefault(); } }
    };
    document.addEventListener("keydown", onKey);

    /* ================= virtual pad (mobile) ================= */
    const padStep = (dir) => {
        if (dir === "up") moveCursor(-1, 0);
        else if (dir === "down") moveCursor(1, 0);
        else if (dir === "left") moveCursor(0, -1);
        else if (dir === "right") moveCursor(0, 1);
        else if (dir === "pick") pickAtCursor();
        else if (dir === "merge") submitMerge();
        else if (dir === "undo") undoSel();
        else if (dir === "clear") clearSel();
    };
    const stopPadHold = () => {
        clearTimeout(padHold.delay); clearInterval(padHold.repeat);
        padHold.delay = padHold.repeat = null;
    };
    const padButtons = Array.from(root.querySelectorAll("[data-pad]"));
    const padDownHandlers = [];
    for (const btn of padButtons) {
        const dir = btn.getAttribute("data-pad");
        const isDir = dir === "up" || dir === "down" || dir === "left" || dir === "right";
        const h = (e) => {
            e.preventDefault();
            padConsumed = true;
            padStep(dir);
            if (isDir) {
                stopPadHold();
                padHold.delay = setTimeout(() => {
                    padHold.repeat = setInterval(() => padStep(dir), 110);
                }, 280);
            }
        };
        btn.addEventListener("pointerdown", h);
        padDownHandlers.push([btn, h]);
    }
    const stopPadHoldGlobal = () => stopPadHold();
    document.addEventListener("pointerup", stopPadHoldGlobal);
    document.addEventListener("pointercancel", stopPadHoldGlobal);

    try { padOn = window.matchMedia("(pointer: coarse)").matches; } catch (e) { padOn = false; }
    padWrap.classList.toggle("show", padOn);
    btnPad.classList.toggle("toggled", padOn);
    btnPad.setAttribute("aria-pressed", String(padOn));

    /* ================= click routing ================= */
    function handleClick(event) {
        const el = event.target;
        if (el.closest("[data-exit]")) { onExit(); return; }
        const pad = el.closest("[data-pad]");
        if (pad) {
            if (padConsumed) { padConsumed = false; return; } // sudah diproses pointerdown
            padStep(pad.getAttribute("data-pad"));            // aktivasi keyboard (a11y)
            return;
        }
        const cheat = el.closest("[data-cheat]");
        if (cheat) { doCheat(cheat.getAttribute("data-cheat")); return; }
        const actEl = el.closest("[data-act]");
        if (actEl) {
            const act = actEl.getAttribute("data-act");
            if (act === "confirm") submitMerge();
            else if (act === "clear") clearSel();
            else if (act === "undo") undoSel();
            else if (act === "cheat") openOverlay("cheat");
            else if (act === "help") openOverlay("help");
            else if (act === "ov-close") { overlay = null; renderOverlays(); }
            else if (act === "pad") {
                padOn = !padOn;
                padWrap.classList.toggle("show", padOn);
                btnPad.classList.toggle("toggled", padOn);
                btnPad.setAttribute("aria-pressed", String(padOn));
            }
            else if (act === "restart") submitAction({ type: "restart" });
            else if (act === "next") submitAction({ type: "next" });
            else if (act === "start-bot") submitAction({ type: "start", opponent: "bot" });
            else if (act === "start-solo") submitAction({ type: "start", opponent: "solo" });
            return;
        }
        if (el.classList && el.classList.contains("ncx-ov")) { overlay = null; renderOverlays(); }
    }
    root.addEventListener("click", handleClick);

    /* ================= boot ================= */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            initMatch("human");
            overlay = null;
            note("Random draw — you are Player " + (mySeat() + 1));
            prevSwap = state.swap; seatNoted = true; prevRound = state.round;
            publish();
            note("Coin flip — " + nameOf(state.first) + " starts");
            room.onAction((action) => applyAction(action, 1));
        } else {
            render(); // "Connecting…" sampai snapshot pertama tiba
            room.onState((nextState) => receiveState(nextState));
            submitAction({ type: "hello", name: clampName(playerName) });
        }
    } else {
        initMatch("bot");
        overlay = "start";
        prevStatus = state.status; prevRound = state.round;
        render();
    }

    return {
        destroy() {
            disposed = true;
            clearTimeout(botTimer);
            clearTimeout(noteTimer);
            stopPadHold();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerup", stopPadHoldGlobal);
            document.removeEventListener("pointercancel", stopPadHoldGlobal);
            svg.removeEventListener("pointerdown", onPointerDown);
            svg.removeEventListener("pointermove", onPointerMove);
            svg.removeEventListener("pointerup", onPointerUp);
            svg.removeEventListener("pointercancel", onPointerCancel);
            for (const [btn, h] of padDownHandlers) btn.removeEventListener("pointerdown", h);
        },
        // hook pengujian opsional (murni, tanpa efek samping)
        _test: { pathValid, applyMerge, hasAnyMove, findSolution, generateBoard, targetFor },
    };
}