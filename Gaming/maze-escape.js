/* ==== GAME: maze-escape.js ==== */
/*
 * Maze Escape — ESM game module (mount(root, context) -> { destroy }).
 * Metadata diekspor lewat META dan dibaca oleh tools/build-games-manifest.mjs.
 * - Fixed handcrafted levels (NO runtime random generator), BFS-validated on mount.
 * - Minimalist light UI, fully self-contained (markup + styles + logic in mount()).
 * - Desktop: keyboard (WASD/arrows) + mouse click-to-walk with hover highlight.
 * - Mobile: tap-to-walk + swipe-to-run. No virtual buttons.
 * - Cheat console overlay; using cheats disables best-score saving.
 * - Room mode: gameplay stays local; a lightweight "progress race" is synced
 *   (host writes canonical state, guest sends actions — per template contract).
 */

const CELL = 32;
const SVG_NS = "http://www.w3.org/2000/svg";
const BEST_KEY = "mgp_maze_best";
const STEP_MS = 105;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: "down", down: "up", left: "right", right: "left" };
const GHOST_COLORS = ["#e11d48", "#f43f5e", "#f97316", "#fb7185", "#dc2626", "#ef4444"];

/* ---------------- metadata (dibaca tools/build-games-manifest.mjs) ---------------- */
export const META = {
    id: "maze-escape",
    name: "Maze Escape",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Race through handcrafted mazes, grab the key and gems, escape before the ghosts catch you.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h36v36H6z"/><path d="M14 6v12H6M14 18h12M26 6v12M26 18h12M14 30v12H6M26 30h12M38 30v12M26 42h12"/></svg>',
    bg: ["#465c45", "#8ca07b"],
    bestKey: "mgp_maze_best",
};

/* ---------------- fixed levels ----------------
 * Legend: # wall · . floor · P player · K key · E exit · * gem · 1-9 ghost spawn.
 * Every map is pre-verified: all floor cells connected, key/exit/gems reachable.
 */
const LEVELS = [
    {
        name: "The Hallway", time: 60, ghostMs: 430,
        map: [
            "###########",
            "#P..#*1...#",
            "###.#.###.#",
            "#...#...#E#",
            "#.###.#.###",
            "#*#*..#...#",
            "#.#######.#",
            "#.......K.#",
            "###########",
        ],
    },
    {
        name: "Crossroads", time: 75, ghostMs: 390,
        map: [
            "#############",
            "#P.........*#",
            "#.#####.#####",
            "#.....#..*..#",
            "#####.###.#2#",
            "#...#.*.#...#",
            "#1#.###.###.#",
            "#.#*..#.#K..#",
            "#.###.#.#.#.#",
            "#..E#.....#.#",
            "#############",
        ],
    },
    {
        name: "The Vaults", time: 90, ghostMs: 350,
        map: [
            "###############",
            "#P.......*#E..#",
            "#########.###.#",
            "#.....#.....#.#",
            "#.###.#.###.#2#",
            "#.#*.....3#.#.#",
            "#.#########.#.#",
            "#...#*..#.*.#*#",
            "#.#.#.#.#.###.#",
            "#K#1..#.......#",
            "###############",
        ],
    },
    {
        name: "Twin Galleries", time: 95, ghostMs: 320,
        map: [
            "###############",
            "#P........#...#",
            "#.#######.#1#.#",
            "#.....#.*.#*#E#",
            "#####.#.###.#.#",
            "#.*...#.#...#.#",
            "#.#####3#.###.#",
            "#.#.....#*#*..#",
            "#.#.#####.#.###",
            "#.#K#.....#...#",
            "#.#.#.#######.#",
            "#.........2..*#",
            "###############",
        ],
    },
    {
        name: "The Catacombs", time: 110, ghostMs: 290,
        map: [
            "#################",
            "#P......#...1.*.#",
            "#####.#.#.#####.#",
            "#....*#.#E#.....#",
            "#.#.###.#.#.###.#",
            "#*#..4.*#...#...#",
            "#.###########.#.#",
            "#.#...3*......#.#",
            "#.#.#.#########*#",
            "#.....#....K#...#",
            "#.#####2#.###.#.#",
            "#...*...#.......#",
            "#################",
        ],
    },
    {
        name: "Final Gate", time: 140, ghostMs: 260,
        map: [
            "###################",
            "#P..#......*......#",
            "#.#.#*#########.#*#",
            "#.#.#.2....K#...#.#",
            "#.#.#########.###.#",
            "#...#.....*.....#.#",
            "#.###.#########3#.#",
            "#...#*#..*#...#*..#",
            "###.#4#.###.#.#.#.#",
            "#E#...#...#.#...#.#",
            "#.#####.#.#*#####.#",
            "#...1...#...5.....#",
            "###################",
        ],
    },
];

/* ---------------- pure helpers ---------------- */
function bfs(grid, sx, sy) {
    const rows = grid.length, cols = grid[0].length;
    const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
    const q = [[sx, sy]];
    dist[sy][sx] = 0;
    for (let i = 0; i < q.length; i++) {
        const x = q[i][0], y = q[i][1];
        for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dd[0], ny = y + dd[1];
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && grid[ny][nx] === 0 && dist[ny][nx] < 0) {
                dist[ny][nx] = dist[y][x] + 1;
                prev[ny][nx] = [x, y];
                q.push([nx, ny]);
            }
        }
    }
    return { dist, prev };
}

function tracePath(prev, x, y) {
    const path = [[x, y]];
    let c = prev[y][x], guard = 0;
    while (c && guard++ < 5000) { path.push(c); c = prev[c[1]][c[0]]; }
    return path;
}

/* Parse + validate a fixed level. Throws if unsolvable (never happens with the maps above). */
function parseLevel(def) {
    const rows = def.map.length, cols = def.map[0].length;
    const grid = [];
    let start = null, key = null, exit = null;
    const gems = [], ghosts = [];
    for (let y = 0; y < rows; y++) {
        const line = def.map[y];
        if (line.length !== cols) throw new Error(def.name + ": ragged map");
        grid.push([]);
        for (let x = 0; x < cols; x++) {
            const c = line[x];
            grid[y].push(c === "#" ? 1 : 0);
            if (c === "P") start = { x, y };
            else if (c === "K") key = { x, y };
            else if (c === "E") exit = { x, y };
            else if (c === "*") gems.push({ x, y });
            else if (c >= "1" && c <= "9") ghosts[Number(c) - 1] = { x, y };
        }
    }
    if (!start || !key || !exit || !gems.length || ghosts.some((g) => !g))
        throw new Error(def.name + ": missing entities");
    const { dist } = bfs(grid, start.x, start.y);
    const ok = (c) => dist[c.y][c.x] >= 0;
    if (!ok(key) || !ok(exit) || !gems.every(ok) || !ghosts.every(ok))
        throw new Error(def.name + ": unreachable entities");
    for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
            if (grid[y][x] === 0 && dist[y][x] < 0) throw new Error(def.name + ": disconnected floor");
    return { name: def.name, time: def.time, ghostMs: def.ghostMs, cols, rows, grid, start, key, exit, gems, ghosts };
}

/* ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    let levels;
    try {
        levels = LEVELS.map(parseLevel);
    } catch (err) {
        console.error("[maze-escape]", err);
        root.innerHTML = `<div class="game-app"><div class="game-intro"><div><h2>Maze Escape</h2><p>Level data error: ${err.message}</p></div></div><div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div></div>`;
        const h = (e) => { if (e.target.closest("[data-exit]")) onExit(); };
        root.addEventListener("click", h);
        return { destroy() { root.removeEventListener("click", h); } };
    }

    /* ---------------- markup + scoped styles (minimalist) ---------------- */
    root.innerHTML = `
  <style>
    .mz{--bg:#fafaf9;--panel:#fff;--ink:#1c1917;--mut:#78716c;--line:#e7e5e4;--acc:#4f46e5;--acc-soft:#eef2ff;--gold:#d97706;--gem:#0d9488;--bad:#e11d48;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-tap-highlight-color:transparent}
    .mz [hidden]{display:none!important}
    .mz .game-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
    .mz .game-intro h2{margin:0 0 4px;font-size:20px;font-weight:650;letter-spacing:-.01em}
    .mz .game-intro p{margin:0;font-size:13px;color:var(--mut);line-height:1.5;max-width:52ch}
    .mz .game-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);border:1px solid var(--line);background:var(--panel);padding:5px 10px;border-radius:999px;white-space:nowrap}
    .mz .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);display:inline-block}
    .mz-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-bottom:12px}
    .mz-stat{display:inline-flex;flex-direction:column;gap:1px;min-width:44px}
    .mz-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
    .mz-stat b{font-size:14px;font-weight:650;font-variant-numeric:tabular-nums}
    .mz-stat.mz-got b{color:var(--gold)}
    .mz-stat.mz-hot b{color:var(--bad)}
    .mz-stat.mz-frozen b{color:var(--acc)}
    .mz-lives{display:inline-flex;gap:3px;height:16px;align-items:center}
    .mz-lives svg{width:14px;height:14px}
    .mz-spacer{flex:1}
    .mz-btn{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;font:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:10px;cursor:pointer;transition:opacity .15s,background .15s}
    .mz-btn:hover{opacity:.88}
    .mz-btn-ghost{background:var(--panel);color:var(--ink);border-color:var(--line)}
    .mz-btn-ghost:hover{background:var(--bg);opacity:1}
    .mz-btn:disabled{opacity:.4;cursor:default}
    .mz-btn:focus-visible,.mz-iconbtn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
    .mz-iconbtn{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--line);background:var(--panel);border-radius:10px;cursor:pointer;color:var(--ink);padding:0}
    .mz-iconbtn:hover{background:var(--bg)}
    .mz-iconbtn:disabled{opacity:.4;cursor:default}
    .mz-iconbtn svg{width:15px;height:15px}
    .mz-cheatbtn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px}
    .mz-badge{min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--acc);color:#fff;font-size:10px;font-weight:700;display:inline-grid;place-items:center}
    .mz-stage{position:relative;border:1px solid var(--line);border-radius:16px;background:var(--panel);overflow:hidden;max-width:680px;margin:0 auto;box-shadow:0 1px 2px rgba(28,25,23,.04)}
    .mz-stage.mz-shaking{animation:mz-shake .4s}
    .mz-maze{display:block;width:100%;height:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:pointer}
    .mz-floor{fill:#fff}
    .mz-wall{fill:#1c1917}
    .mz-hack .mz-wall{opacity:.35}
    .mz-fog{fill:#f5f5f4;transition:opacity .25s}
    .mz-player{transition:transform .11s linear}
    .mz-player-body{fill:var(--acc)}
    .mz-player-eye{fill:#fff}
    .mz-ring{fill:none;stroke:var(--acc);stroke-width:2;stroke-dasharray:4 4;display:none}
    .mz-shielded .mz-ring{display:block}
    .mz-invuln{animation:mz-blink .5s steps(2) infinite}
    .mz-ghost-eye{fill:#fff}
    .mz-frozen{opacity:.45}
    .mz-gem-body{fill:var(--gem)}
    .mz-gem-facet{fill:#fff;opacity:.35}
    .mz-key-ring{fill:none;stroke:var(--gold);stroke-width:2.6}
    .mz-key-bar{fill:none;stroke:var(--gold);stroke-width:2.6;stroke-linecap:round}
    .mz-door-frame{fill:none;stroke:var(--ink);stroke-width:2.4}
    .mz-door-arch{fill:#fff;stroke:var(--ink);stroke-width:1.6}
    .mz-door.open .mz-door-arch{fill:var(--acc-soft);stroke:var(--acc)}
    .mz-door.open .mz-lock{display:none}
    .mz-lock-body{fill:var(--ink)}
    .mz-lock-shackle{fill:none;stroke:var(--ink);stroke-width:1.8}
    .mz-door-inner.mz-shake{animation:mz-shake .45s}
    .mz-cursor{fill:none;stroke:var(--acc);stroke-width:2;opacity:.55;pointer-events:none}
    .mz-target{fill:none;stroke:var(--acc);stroke-width:2;opacity:.7;pointer-events:none}
    .mz-xray{fill:none;stroke:var(--acc);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 8;opacity:.9;pointer-events:none}
    .mz-xray2{fill:none;stroke:var(--gold);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 8;opacity:.8;pointer-events:none}
    .mz-pop{transform-box:fill-box;transform-origin:center;animation:mz-pop .32s forwards}
    .mz-msg{position:absolute;left:50%;bottom:12px;transform:translate(-50%,6px);background:var(--ink);color:#fff;font-size:12px;font-weight:500;padding:7px 14px;border-radius:999px;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;max-width:92%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:3}
    .mz-msg-show{opacity:1;transform:translate(-50%,0)}
    .mz-msg-gem{background:var(--gem)}.mz-msg-gold{background:var(--gold)}.mz-msg-danger{background:var(--bad)}.mz-msg-cheat{background:var(--acc)}
    .mz-screen{position:absolute;inset:0;display:grid;place-items:center;background:rgba(250,250,249,.88);backdrop-filter:blur(3px);padding:16px;z-index:4}
    .mz-card{width:min(100%,330px);background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center;box-shadow:0 8px 24px rgba(28,25,23,.06)}
    .mz-card h3{margin:0 0 6px;font-size:18px;font-weight:650}
    .mz-card p{margin:0 0 14px;font-size:13px;color:var(--mut);line-height:1.55}
    .mz-card .mz-btn{width:100%;margin-top:8px}
    .mz-bestline{font-size:13px;color:var(--mut);margin-bottom:6px}
    .mz-bestline b{color:var(--ink);font-variant-numeric:tabular-nums}
    .mz-fine{font-size:11px!important;color:var(--mut);margin:10px 0 0!important}
    .mz-rows{margin:0 0 6px;border-top:1px solid var(--line)}
    .mz-row{display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)}
    .mz-row span{color:var(--mut)}.mz-row b{font-variant-numeric:tabular-nums}
    .mz-row-total b{color:var(--acc)}
    .mz-note{font-size:11px;color:var(--gold);margin:8px 0 0}
    .mz-newbest{display:inline-block;font-size:11px;font-weight:700;color:var(--acc);background:var(--acc-soft);border-radius:999px;padding:3px 10px;margin-bottom:8px}
    .mz-overlay{position:absolute;inset:0;display:grid;place-items:center;background:rgba(28,25,23,.32);padding:14px;z-index:5}
    .mz-cheats{width:min(100%,360px);max-height:100%;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
    .mz-cheats-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .mz-cheats-head h3{margin:0;font-size:16px;font-weight:650}
    .mz-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer}
    .mz-cheatrow b{display:block;font-size:13px;font-weight:600}
    .mz-cheatrow small{display:block;font-size:11px;color:var(--mut);margin-top:1px}
    .mz-cheatrow input{position:absolute;opacity:0;pointer-events:none}
    .mz-switch{flex:none;width:36px;height:21px;border-radius:999px;background:var(--line);position:relative;transition:background .15s}
    .mz-switch::after{content:"";position:absolute;top:2.5px;left:2.5px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
    .mz-cheatrow input:checked+.mz-switch{background:var(--acc)}
    .mz-cheatrow input:checked+.mz-switch::after{transform:translateX(15px)}
    .mz-cheatrow input:focus-visible+.mz-switch{outline:2px solid var(--acc);outline-offset:2px}
    .mz-cheat-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .mz-cheat-actions .mz-btn{font-size:12px;padding:8px 10px}
    .mz-cheats-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:12px;color:var(--mut)}
    .mz-hint{margin:10px 4px 0;font-size:11.5px;color:var(--mut);text-align:center;line-height:1.6}
    .mz-room{display:flex;align-items:stretch;gap:8px;margin-bottom:12px}
    .mz-room-card{flex:1;border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:8px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
    .mz-room-name{font-size:12px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mz-room-meta{font-size:11px;color:var(--mut);font-variant-numeric:tabular-nums}
    .mz-room-vs{align-self:center;font-size:11px;color:var(--mut)}
    .mz .game-actions{margin-top:14px}
    @keyframes mz-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
    @keyframes mz-blink{50%{opacity:.25}}
    @keyframes mz-pop{to{transform:scale(1.8);opacity:0}}
    @media (max-width:520px){.mz-hud{gap:6px 10px}.mz-stat{min-width:38px}.mz-card{padding:18px}}
    @media (prefers-reduced-motion:reduce){.mz *{animation:none!important;transition:none!important}}
  </style>
  <div class="game-app mz">
    <div class="game-intro">
      <div><h2>Maze Escape</h2><p>Grab the golden key, unlock the door, and get out before time runs out. ${levels.length} fixed levels — every one is solvable.</p></div>
      <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    </div>
    <section class="game-panel" data-board>
      <div class="mz-room" data-room hidden>
        <div class="mz-room-card"><span class="mz-room-name" data-room-you-name>You</span><span class="mz-room-meta" data-room-you-meta>—</span></div>
        <span class="mz-room-vs">vs</span>
        <div class="mz-room-card"><span class="mz-room-name" data-room-rival-name>Rival</span><span class="mz-room-meta" data-room-rival-meta>Waiting…</span></div>
      </div>
      <div class="mz-hud">
        <span class="mz-stat"><span class="mz-label">Level</span><b data-level>1/${levels.length}</b></span>
        <span class="mz-stat"><span class="mz-label">Score</span><b data-score>0</b></span>
        <span class="mz-stat"><span class="mz-label">Gems</span><b data-gems>0/0</b></span>
        <span class="mz-stat" data-keychip><span class="mz-label">Key</span><b data-keytext>No key</b></span>
        <span class="mz-stat"><span class="mz-label">Lives</span><span class="mz-lives" data-lives></span></span>
        <span class="mz-stat" data-timerchip><span class="mz-label">Time</span><b data-timer>0:00</b></span>
        <span class="mz-spacer"></span>
        <button class="mz-btn mz-btn-ghost mz-cheatbtn" type="button" data-action="cheats">Cheats<span class="mz-badge" data-cheatbadge hidden>0</span></button>
        <button class="mz-iconbtn" type="button" data-action="pause" aria-label="Pause"></button>
        <button class="mz-iconbtn" type="button" data-action="mute" aria-label="Mute sound"></button>
      </div>
      <div class="mz-stage" data-stage>
        <svg class="mz-maze" data-maze role="img" aria-label="Maze"></svg>
        <div class="mz-msg" data-msg></div>

        <div class="mz-screen" data-screen="start">
          <div class="mz-card">
            <h3>Maze Escape</h3>
            <p>Find the golden key, then reach the door. Avoid the ghosts — you have 3 lives.</p>
            <div class="mz-bestline">Best score <b data-best>0</b></div>
            <button class="mz-btn" type="button" data-action="start">Start run</button>
            <p class="mz-fine">${levels.length} handcrafted levels · no random layouts</p>
          </div>
        </div>

        <div class="mz-screen" data-screen="pause" hidden>
          <div class="mz-card">
            <h3>Paused</h3>
            <p>Take a breath. The ghosts will wait.</p>
            <button class="mz-btn" type="button" data-action="resume">Resume</button>
            <button class="mz-btn mz-btn-ghost" type="button" data-action="restart">Restart level</button>
            <button class="mz-btn mz-btn-ghost" type="button" data-action="quit">Quit to menu</button>
          </div>
        </div>

        <div class="mz-screen" data-screen="level" hidden>
          <div class="mz-card">
            <h3 data-lv-title>Level cleared</h3>
            <div class="mz-rows">
              <div class="mz-row"><span>Gems</span><b data-lv-gems>0/0</b></div>
              <div class="mz-row"><span>Clear bonus</span><b>+150</b></div>
              <div class="mz-row"><span>Time bonus</span><b data-lv-time>+0</b></div>
              <div class="mz-row"><span>Lives bonus</span><b data-lv-bonus>+0</b></div>
              <div class="mz-row mz-row-total"><span>Total score</span><b data-lv-total>0</b></div>
            </div>
            <p class="mz-note" data-cheatnote hidden>Cheats were used — best score is not recorded.</p>
            <button class="mz-btn" type="button" data-action="next">Next level</button>
          </div>
        </div>

        <div class="mz-screen" data-screen="over" hidden>
          <div class="mz-card">
            <h3>Game over</h3>
            <p data-over-reason>The ghosts caught you.</p>
            <span class="mz-newbest" data-over-best hidden>New best score!</span>
            <div class="mz-rows">
              <div class="mz-row"><span>Level reached</span><b data-over-level>1</b></div>
              <div class="mz-row mz-row-total"><span>Score</span><b data-over-score>0</b></div>
              <div class="mz-row"><span>Best</span><b data-best>0</b></div>
            </div>
            <p class="mz-note" data-cheatnote hidden>Cheats were used — best score is not recorded.</p>
            <button class="mz-btn" type="button" data-action="retry">Retry level</button>
            <button class="mz-btn mz-btn-ghost" type="button" data-action="newrun">New run</button>
          </div>
        </div>

        <div class="mz-screen" data-screen="win" hidden>
          <div class="mz-card">
            <h3>You escaped!</h3>
            <p>All ${levels.length} levels cleared. The maze has nothing left on you.</p>
            <span class="mz-newbest" data-win-best hidden>New best score!</span>
            <div class="mz-rows">
              <div class="mz-row mz-row-total"><span>Final score</span><b data-win-score>0</b></div>
              <div class="mz-row"><span>Best</span><b data-best>0</b></div>
            </div>
            <p class="mz-note" data-cheatnote hidden>Cheats were used — best score is not recorded.</p>
            <button class="mz-btn" type="button" data-action="again">Play again</button>
            <button class="mz-btn mz-btn-ghost" type="button" data-action="menu">Back to menu</button>
          </div>
        </div>

        <div class="mz-overlay" data-cheat-overlay hidden>
          <div class="mz-cheats">
            <div class="mz-cheats-head">
              <h3>Cheat console</h3>
              <button class="mz-iconbtn" type="button" data-action="cheat-close" aria-label="Close cheats"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            </div>
            <p class="mz-fine">Cheats make the run easier but disable best-score saving.</p>
            <label class="mz-cheatrow"><span><b>X-Ray path</b><small>Show the route to the key / exit</small></span><input type="checkbox" data-cheat="path"><i class="mz-switch"></i></label>
            <label class="mz-cheatrow"><span><b>Reveal map</b><small>Remove the fog of war</small></span><input type="checkbox" data-cheat="map"><i class="mz-switch"></i></label>
            <label class="mz-cheatrow"><span><b>Wall hack</b><small>Walk through walls</small></span><input type="checkbox" data-cheat="wallhack"><i class="mz-switch"></i></label>
            <label class="mz-cheatrow"><span><b>Freeze ghosts</b><small>Stop every ghost in place</small></span><input type="checkbox" data-cheat="freezeghosts"><i class="mz-switch"></i></label>
            <label class="mz-cheatrow"><span><b>Freeze time</b><small>Stop the countdown</small></span><input type="checkbox" data-cheat="freezetime"><i class="mz-switch"></i></label>
            <label class="mz-cheatrow"><span><b>Ghost shield</b><small>Ignore all ghost collisions</small></span><input type="checkbox" data-cheat="shield"><i class="mz-switch"></i></label>
            <div class="mz-cheat-actions">
              <button class="mz-btn mz-btn-ghost" type="button" data-action="ck-gems">Collect all gems</button>
              <button class="mz-btn mz-btn-ghost" type="button" data-action="ck-warp">Warp to exit</button>
            </div>
            <div class="mz-cheats-foot"><span data-cheat-count>0 cheats active</span><button class="mz-btn mz-btn-ghost" type="button" data-action="cheat-off">Disable all</button></div>
          </div>
        </div>
      </div>
      <p class="mz-hint">Keyboard: WASD / arrows · Mouse: click a tile to walk · Touch: tap a tile, or swipe to run until a wall · P pause · C cheats · M mute</p>
    </section>
    <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
  </div>`;

    /* ---------------- refs + lifecycle plumbing ---------------- */
    const q = (s) => root.querySelector(s);
    const qa = (s) => Array.from(root.querySelectorAll(s));
    const el = {
        status: q("[data-status]"), stage: q("[data-stage]"), maze: q("[data-maze]"), msg: q("[data-msg]"),
        level: q("[data-level]"), score: q("[data-score]"), gems: q("[data-gems]"),
        keychip: q("[data-keychip]"), keytext: q("[data-keytext]"), lives: q("[data-lives]"),
        timerchip: q("[data-timerchip]"), timer: q("[data-timer]"),
        pausebtn: q('[data-action="pause"]'), mutebtn: q('[data-action="mute"]'),
        cheatbtn: q('[data-action="cheats"]'), cheatbadge: q("[data-cheatbadge]"),
        cheatOverlay: q("[data-cheat-overlay]"), cheatCount: q("[data-cheat-count]"),
        lvTitle: q("[data-lv-title]"), lvGems: q("[data-lv-gems]"), lvTime: q("[data-lv-time]"),
        lvBonus: q("[data-lv-bonus]"), lvTotal: q("[data-lv-total]"),
        overReason: q("[data-over-reason]"), overLevel: q("[data-over-level]"),
        overScore: q("[data-over-score]"), overBest: q("[data-over-best]"),
        winScore: q("[data-win-score]"), winBest: q("[data-win-best]"),
        room: q("[data-room]"), roomYouName: q("[data-room-you-name]"), roomYouMeta: q("[data-room-you-meta]"),
        roomRivalName: q("[data-room-rival-name]"), roomRivalMeta: q("[data-room-rival-meta]"),
    };
    const screens = {
        start: q('[data-screen="start"]'), pause: q('[data-screen="pause"]'),
        level: q('[data-screen="level"]'), over: q('[data-screen="over"]'), win: q('[data-screen="win"]'),
    };

    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
    const unsubs = [];
    const sub = (fn) => { try { const u = fn(); if (typeof u === "function") unsubs.push(u); } catch (err) { console.warn(err); } };

    /* ---------------- icons ---------------- */
    const HEART = "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";
    const ICON = {
        pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
        play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8V4z"/></svg>',
        volOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
        volOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/></svg>',
        heartOn: '<svg viewBox="0 0 24 24" fill="#e11d48" stroke="#e11d48" stroke-width="2" aria-hidden="true"><path d="' + HEART + '"/></svg>',
        heartOff: '<svg viewBox="0 0 24 24" fill="none" stroke="#d6d3d1" stroke-width="2" aria-hidden="true"><path d="' + HEART + '"/></svg>',
    };

    /* ---------------- tiny WebAudio blips ---------------- */
    let AC = null, muted = false;
    function beep(freq, dur, type, vol, delay) {
        if (muted) return;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!AC) AC = new Ctx();
            if (AC.state === "suspended") AC.resume();
            const t = AC.currentTime + (delay || 0);
            const o = AC.createOscillator(), g = AC.createGain();
            o.type = type || "sine"; o.frequency.value = freq;
            g.gain.setValueAtTime(vol || 0.05, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.1));
            o.connect(g); g.connect(AC.destination);
            o.start(t); o.stop(t + (dur || 0.1) + 0.03);
        } catch (err) { /* audio unavailable */ }
    }
    const SFX = {
        gem: () => beep(880, 0.09, "sine", 0.05),
        key: () => { beep(660, 0.1); beep(990, 0.16, "sine", 0.05, 0.1); },
        hit: () => beep(150, 0.22, "sawtooth", 0.06),
        win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.15, "sine", 0.05, i * 0.11)),
        over: () => [330, 262, 196].forEach((f, i) => beep(f, 0.2, "triangle", 0.06, i * 0.16)),
        cheat: () => beep(520, 0.06, "square", 0.03),
        lock: () => beep(200, 0.12, "square", 0.05),
    };

    /* ---------------- game state ---------------- */
    const G = {
        running: false, paused: false, consoleOpen: false,
        level: 1, score: 0, scoreAtLevelStart: 0, lives: 3,
        cols: 11, rows: 9, grid: [], explored: [],
        player: null, ghosts: [], gems: [], gemsTotal: 0, gemsTaken: 0,
        key: null, exit: null, keyExitPath: [], keyTaken: false,
        timeLeft: 0, lastSec: -1, invulnUntil: 0, cheatUses: 0, best: 0, lastTick: 0,
    };
    const cheats = { path: false, map: false, wallhack: false, freezeghosts: false, freezetime: false, shield: false };

    let fogRects = [], doorNode = null, keyNode = null, playerNode = null;
    let eyeL = null, eyeR = null, xray1 = null, xray2 = null, cursorNode = null, targetNode = null;
    const held = new Set();
    let swipeDir = null;      // touch: run in this direction until a wall
    let autoPath = [];        // mouse/tap: BFS walk queue of [x,y]
    let ptr = null;           // active pointer gesture
    let screenName = "start";
    let msgTimer = 0, rafId = 0;

    /* ---------------- level build (fixed data, no RNG layout) ---------------- */
    function buildLevel(n) {
        const L = levels[n - 1];
        G.level = n; G.cols = L.cols; G.rows = L.rows; G.grid = L.grid;
        G.explored = Array.from({ length: L.rows }, () => Array(L.cols).fill(false));
        G.player = { x: L.start.x, y: L.start.y, fx: L.start.x, fy: L.start.y, dir: "down", t0: 0, dur: 110, lastStep: 0 };
        G.timeLeft = L.time; G.lastSec = -1;
        G.keyTaken = false; G.gemsTaken = 0; G.gemsTotal = L.gems.length;
        G.key = { x: L.key.x, y: L.key.y };
        G.exit = { x: L.exit.x, y: L.exit.y };
        const e = bfs(G.grid, G.exit.x, G.exit.y);
        G.keyExitPath = tracePath(e.prev, G.key.x, G.key.y);
        G.gems = L.gems.map((c) => ({ x: c.x, y: c.y, taken: false, node: null }));
        G.ghosts = L.ghosts.map((c, i) => ({
            x: c.x, y: c.y, fx: c.x, fy: c.y, t0: 0, dur: L.ghostMs, dir: null,
            acc: Math.random() * L.ghostMs, stepMs: L.ghostMs,
            color: GHOST_COLORS[i % GHOST_COLORS.length], node: null,
        }));
        swipeDir = null; autoPath = [];
    }

    /* ---------------- SVG rendering ---------------- */
    function svgEl(tag, attrs, parent) {
        const node = document.createElementNS(SVG_NS, tag);
        if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(node);
        return node;
    }
    function place(node, x, y) { node.style.transform = "translate(" + x * CELL + "px," + y * CELL + "px)"; }

    function makeDoor(parent) {
        const g = svgEl("g", { class: "mz-door" }, null);
        place(g, G.exit.x, G.exit.y); parent.appendChild(g);
        const inner = svgEl("g", { class: "mz-door-inner" }, g);
        svgEl("path", { d: "M8 27 V15 a8 8 0 0 1 16 0 V27 Z", class: "mz-door-frame" }, inner);
        svgEl("path", { d: "M11.5 27 V15.5 a4.5 4.5 0 0 1 9 0 V27 Z", class: "mz-door-arch" }, inner);
        const lock = svgEl("g", { class: "mz-lock" }, inner);
        svgEl("rect", { x: 13, y: 17.5, width: 6, height: 5, rx: 1.2, class: "mz-lock-body" }, lock);
        svgEl("path", { d: "M14.5 17.5v-2.2a1.5 1.5 0 0 1 3 0v2.2", class: "mz-lock-shackle" }, lock);
        return g;
    }
    function makeKey(parent) {
        const g = svgEl("g", { class: "mz-key" }, null);
        place(g, G.key.x, G.key.y); parent.appendChild(g);
        const inner = svgEl("g", { class: "mz-key-inner" }, g);
        svgEl("circle", { cx: 10.5, cy: 16, r: 4.3, class: "mz-key-ring" }, inner);
        svgEl("path", { d: "M14.8 16H27", class: "mz-key-bar" }, inner);
        svgEl("path", { d: "M22 16v4.6M26 16v3.6", class: "mz-key-bar" }, inner);
        return g;
    }
    function makeGem(parent, x, y) {
        const g = svgEl("g", { class: "mz-gem" }, null);
        place(g, x, y); parent.appendChild(g);
        const inner = svgEl("g", { class: "mz-gem-inner" }, g);
        svgEl("polygon", { points: "16,5 26.5,16 16,27 5.5,16", class: "mz-gem-body" }, inner);
        svgEl("polygon", { points: "16,10 22,16 16,22 10,16", class: "mz-gem-facet" }, inner);
        return g;
    }
    function makeGhost(parent, gh) {
        const g = svgEl("g", { class: "mz-ghost" }, null);
        g.style.transition = "transform " + Math.max(120, gh.stepMs - 50) + "ms linear";
        place(g, gh.x, gh.y); parent.appendChild(g);
        const inner = svgEl("g", {}, g);
        svgEl("path", { d: "M6 27V14.5a10 10 0 0 1 20 0V27l-3.4-3-3.3 3-3.3-3-3.3 3-3.4-3z", fill: gh.color }, inner);
        svgEl("circle", { cx: 12.2, cy: 14, r: 2.8, class: "mz-ghost-eye" }, inner);
        svgEl("circle", { cx: 19.8, cy: 14, r: 2.8, class: "mz-ghost-eye" }, inner);
        svgEl("circle", { cx: 12.8, cy: 14.6, r: 1.25, fill: "#1c1917" }, inner);
        svgEl("circle", { cx: 20.4, cy: 14.6, r: 1.25, fill: "#1c1917" }, inner);
        return g;
    }
    function makePlayer() {
        const g = svgEl("g", { class: "mz-player" }, null);
        place(g, G.player.x, G.player.y); el.maze.appendChild(g);
        svgEl("circle", { cx: 16, cy: 15.5, r: 13, class: "mz-ring" }, g);
        svgEl("circle", { cx: 16, cy: 15.5, r: 9.5, class: "mz-player-body" }, g);
        eyeL = svgEl("circle", { cx: 12.8, cy: 13.8, r: 2.3, class: "mz-player-eye" }, g);
        eyeR = svgEl("circle", { cx: 19.2, cy: 13.8, r: 2.3, class: "mz-player-eye" }, g);
        return g;
    }

    function renderMaze() {
        const W = G.cols * CELL, H = G.rows * CELL;
        el.maze.setAttribute("viewBox", "0 0 " + W + " " + H);
        el.maze.replaceChildren();
        eyeL = eyeR = null;
        svgEl("rect", { x: 0, y: 0, width: W, height: H, class: "mz-floor" }, el.maze);
        let d = "";
        for (let y = 0; y < G.rows; y++)
            for (let x = 0; x < G.cols; x++)
                if (G.grid[y][x] === 1) d += "M" + x * CELL + " " + y * CELL + "h" + CELL + "v" + CELL + "h-" + CELL + "Z";
        svgEl("path", { d, class: "mz-wall" }, el.maze);
        const decor = svgEl("g", {}, el.maze);
        doorNode = makeDoor(decor);
        keyNode = makeKey(decor);
        G.gems.forEach((g) => { g.node = makeGem(decor, g.x, g.y); });
        const ghostLayer = svgEl("g", {}, el.maze);
        G.ghosts.forEach((gh) => { gh.node = makeGhost(ghostLayer, gh); });
        const fog = svgEl("g", {}, el.maze);
        fogRects = [];
        for (let y = 0; y < G.rows; y++) {
            fogRects.push([]);
            for (let x = 0; x < G.cols; x++)
                fogRects[y].push(svgEl("rect", { x: x * CELL, y: y * CELL, width: CELL, height: CELL, class: "mz-fog" }, fog));
        }
        xray2 = svgEl("polyline", { class: "mz-xray2", points: "" }, el.maze);
        xray1 = svgEl("polyline", { class: "mz-xray", points: "" }, el.maze);
        targetNode = svgEl("circle", { class: "mz-target", r: 5, cx: -99, cy: -99 }, el.maze);
        targetNode.style.display = "none";
        cursorNode = svgEl("rect", { class: "mz-cursor", x: 0, y: 0, width: CELL - 6, height: CELL - 6, rx: 6 }, el.maze);
        cursorNode.style.display = "none";
        playerNode = makePlayer();
        el.maze.classList.toggle("mz-hack", cheats.wallhack);
        if (cheats.freezeghosts) G.ghosts.forEach((gh) => gh.node.classList.add("mz-frozen"));
        if (cheats.shield) playerNode.classList.add("mz-shielded");
        refreshFog();
        refreshXray();
    }

    /* ---------------- fog of war + x-ray ---------------- */
    function refreshFog() {
        const p = G.player;
        for (let y = 0; y < G.rows; y++)
            for (let x = 0; x < G.cols; x++) {
                let op;
                if (cheats.map) op = 0;
                else {
                    const dx = x - p.x, dy = y - p.y;
                    if (dx * dx + dy * dy <= 6.25) { G.explored[y][x] = true; op = 0; }
                    else op = G.explored[y][x] ? 0.55 : 1;
                }
                const r = fogRects[y][x], s = String(op);
                if (r.getAttribute("data-o") !== s) { r.setAttribute("data-o", s); r.style.opacity = s; }
            }
    }
    function pts(path) { return path.map((c) => c[0] * CELL + CELL / 2 + "," + (c[1] * CELL + CELL / 2)).join(" "); }
    function refreshXray() {
        if (!xray1) return;
        xray1.style.display = "none"; xray2.style.display = "none";
        if (!(cheats.path && G.running)) return;
        const p = G.player, b = bfs(G.grid, p.x, p.y);
        if (!G.keyTaken) {
            xray1.setAttribute("points", pts(tracePath(b.prev, G.key.x, G.key.y).reverse()));
            xray1.style.display = "";
            xray2.setAttribute("points", pts(G.keyExitPath));
            xray2.style.display = "";
        } else {
            xray1.setAttribute("points", pts(tracePath(b.prev, G.exit.x, G.exit.y).reverse()));
            xray1.style.display = "";
        }
    }

    /* ---------------- movement + game logic ---------------- */
    const EYE_BASE = { L: [12.8, 13.8], R: [19.2, 13.8] };
    const EYE_OFF = { up: [0, -1.7], down: [0, 1.5], left: [-1.9, 0.4], right: [1.9, 0.4] };
    function setFacing(dir) {
        if (!G.player || G.player.dir === dir) return;
        G.player.dir = dir;
        if (!eyeL) return;
        const o = EYE_OFF[dir];
        eyeL.setAttribute("cx", EYE_BASE.L[0] + o[0]); eyeL.setAttribute("cy", EYE_BASE.L[1] + o[1]);
        eyeR.setAttribute("cx", EYE_BASE.R[0] + o[0]); eyeR.setAttribute("cy", EYE_BASE.R[1] + o[1]);
    }
    function playable() { return G.running && !G.paused && !G.consoleOpen; }
    function canStep(dir) {
        const p = G.player, dd = DIRS[dir];
        const nx = p.x + dd[0], ny = p.y + dd[1];
        if (nx < 0 || ny < 0 || nx >= G.cols || ny >= G.rows) return false;
        return G.grid[ny][nx] === 0 || cheats.wallhack || G.grid[p.y][p.x] !== 0;
    }
    function tryMove(dir, now) {
        if (!playable()) return false;
        const p = G.player, t = now || performance.now();
        setFacing(dir);
        if (t - p.lastStep < STEP_MS) return false;
        if (!canStep(dir)) return false;
        const dd = DIRS[dir], nx = p.x + dd[0], ny = p.y + dd[1];
        p.fx = p.x; p.fy = p.y; p.x = nx; p.y = ny;
        p.t0 = t; p.dur = 110; p.lastStep = t;
        place(playerNode, nx, ny);
        refreshFog();
        if (cheats.path) refreshXray();
        onCell(nx, ny);
        return true;
    }
    function stepGhost(gh) {
        const options = [];
        for (const d in DIRS) {
            const nx = gh.x + DIRS[d][0], ny = gh.y + DIRS[d][1];
            if (nx >= 0 && ny >= 0 && nx < G.cols && ny < G.rows && G.grid[ny][nx] === 0) options.push(d);
        }
        if (!options.length) return;
        let pool = options.filter((d) => d !== OPP[gh.dir]);
        if (!pool.length) pool = options;
        const d = gh.dir && pool.includes(gh.dir) && Math.random() < 0.55
            ? gh.dir : pool[Math.floor(Math.random() * pool.length)];
        gh.fx = gh.x; gh.fy = gh.y; gh.dir = d;
        gh.x += DIRS[d][0]; gh.y += DIRS[d][1];
        gh.t0 = performance.now(); gh.dur = gh.stepMs;
        place(gh.node, gh.x, gh.y);
    }
    function entPos(e, now) {
        if (!e.t0) return { x: e.x, y: e.y };
        const t = Math.min(1, (now - e.t0) / e.dur);
        if (t >= 1) return { x: e.x, y: e.y };
        return { x: e.fx + (e.x - e.fx) * t, y: e.fy + (e.y - e.fy) * t };
    }
    function checkCollisions(now) {
        if (cheats.shield || now < G.invulnUntil) return;
        const pp = entPos(G.player, now);
        for (const gh of G.ghosts) {
            const gp = entPos(gh, now);
            const dx = pp.x - gp.x, dy = pp.y - gp.y;
            if (dx * dx + dy * dy < 0.4) { hitPlayer(); return; }
        }
    }
    function hitPlayer() {
        G.lives--;
        updateLives();
        G.invulnUntil = performance.now() + 2200;
        if (playerNode) {
            playerNode.classList.add("mz-invuln");
            later(() => { if (playerNode) playerNode.classList.remove("mz-invuln"); }, 2300);
        }
        el.stage.classList.add("mz-shaking");
        later(() => el.stage.classList.remove("mz-shaking"), 420);
        SFX.hit();
        if (G.lives <= 0) gameOver("caught");
        else showMsg("Caught by a ghost — " + G.lives + (G.lives === 1 ? " life" : " lives") + " left", "danger");
    }

    /* ---------------- cell events ---------------- */
    function popRemove(node) {
        if (!node) return;
        const inner = node.querySelector(".mz-key-inner, .mz-gem-inner") || node;
        inner.classList.add("mz-pop");
        later(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 340);
    }
    function collectGem(g) {
        if (!g || g.taken || !G.running) return;
        g.taken = true; G.gemsTaken++; G.score += 50;
        popRemove(g.node); SFX.gem();
        el.gems.textContent = G.gemsTaken + "/" + G.gemsTotal;
        el.score.textContent = G.score;
        showMsg("+50 gem", "gem");
        syncProgress("playing");
    }
    function takeKey(silent) {
        if (G.keyTaken) return;
        G.keyTaken = true;
        popRemove(keyNode);
        if (doorNode) doorNode.classList.add("open");
        el.keychip.classList.add("mz-got");
        el.keytext.textContent = "Key got";
        if (!silent) { SFX.key(); showMsg("Key collected — the exit is unlocked", "gold"); refreshXray(); }
    }
    function onCell(x, y) {
        for (const g of G.gems) if (!g.taken && g.x === x && g.y === y) { collectGem(g); break; }
        if (!G.keyTaken && G.key && G.key.x === x && G.key.y === y) takeKey(false);
        if (G.exit.x === x && G.exit.y === y) {
            if (G.keyTaken) levelComplete();
            else {
                SFX.lock();
                showMsg("The exit is locked — find the golden key", "danger");
                if (doorNode) {
                    const inner = doorNode.querySelector(".mz-door-inner");
                    inner.classList.add("mz-shake");
                    later(() => inner.classList.remove("mz-shake"), 460);
                }
            }
        }
    }

    /* ---------------- game flow ---------------- */
    function setStatus(text) { el.status.textContent = text; }
    function showScreen(name) {
        for (const k in screens) screens[k].hidden = k !== name;
        screenName = name;
        if (name !== null) { swipeDir = null; autoPath = []; hideCursor(); hideTarget(); }
    }
    function syncButtons() {
        el.pausebtn.disabled = !G.running;
        el.cheatbtn.disabled = !G.running;
        el.pausebtn.innerHTML = G.paused ? ICON.play : ICON.pause;
        el.pausebtn.setAttribute("aria-label", G.paused ? "Resume" : "Pause");
    }
    function startRun() { G.score = 0; G.lives = 3; G.cheatUses = 0; resetCheats(); startLevel(1); }
    function startLevel(n) {
        G.scoreAtLevelStart = G.score;
        closeConsole();
        held.clear();
        buildLevel(n);
        renderMaze();
        G.running = true; G.paused = false; G.invulnUntil = 0;
        updateHUDAll();
        showScreen(null);
        syncButtons();
        setStatus("Playing");
        showMsg("Level " + n + " — " + levels[n - 1].name, "gold");
        syncProgress("playing");
    }
    function retryLevel() { G.score = G.scoreAtLevelStart; G.lives = 3; startLevel(G.level); }
    function nextLevel() { if (G.level < levels.length) startLevel(G.level + 1); else winRun(); }
    function quitRun() {
        G.running = false; G.paused = false;
        held.clear(); resetCheats();
        updateBestLabel(); previewReveal();
        showScreen("start"); syncButtons(); setStatus("Ready");
        syncProgress("ready");
    }
    function commitBest() {
        if (G.cheatUses === 0 && G.score > G.best) {
            G.best = G.score;
            try { localStorage.setItem(BEST_KEY, String(G.best)); } catch (err) { /* private mode */ }
            updateBestLabel();
            return true;
        }
        return false;
    }
    function levelComplete() {
        if (!G.running) return;
        G.running = false;
        held.clear(); closeConsole();
        SFX.win();
        const timeBonus = Math.round(G.timeLeft) * 2;
        const lifeBonus = G.lives * 25;
        G.score += 150 + timeBonus + lifeBonus;
        el.score.textContent = G.score;
        if (G.level >= levels.length) { winRun(); return; }
        el.lvTitle.textContent = "Level " + G.level + " cleared";
        el.lvGems.textContent = G.gemsTaken + "/" + G.gemsTotal;
        el.lvTime.textContent = "+" + timeBonus;
        el.lvBonus.textContent = "+" + lifeBonus;
        el.lvTotal.textContent = G.score;
        qa("[data-cheatnote]").forEach((n) => { n.hidden = G.cheatUses === 0; });
        syncButtons();
        showScreen("level"); setStatus("Cleared");
        syncProgress("cleared");
    }
    function winRun() {
        G.running = false;
        held.clear(); closeConsole();
        const newBest = commitBest();
        el.winScore.textContent = G.score;
        el.winBest.hidden = !newBest;
        qa("[data-cheatnote]").forEach((n) => { n.hidden = G.cheatUses === 0; });
        syncButtons();
        showScreen("win"); setStatus("Escaped!");
        syncProgress("won");
    }
    function gameOver(reason) {
        if (!G.running) return;
        G.running = false;
        held.clear(); closeConsole();
        SFX.over();
        el.overReason.textContent = reason === "time" ? "The clock ran out." : "The ghosts caught you.";
        el.overLevel.textContent = G.level;
        el.overScore.textContent = G.score;
        el.overBest.hidden = !commitBest();
        qa("[data-cheatnote]").forEach((n) => { n.hidden = G.cheatUses === 0; });
        syncButtons();
        showScreen("over"); setStatus("Game over");
        syncProgress("over");
    }
    function togglePause(force) {
        if (!G.running) return;
        G.paused = force !== undefined ? force : !G.paused;
        if (G.paused) held.clear();
        syncButtons();
        showScreen(G.paused ? "pause" : null);
        setStatus(G.paused ? "Paused" : "Playing");
    }

    /* ---------------- HUD ---------------- */
    function updateHUDAll() {
        el.level.textContent = G.level + "/" + levels.length;
        el.score.textContent = G.score;
        el.gems.textContent = G.gemsTaken + "/" + G.gemsTotal;
        el.keytext.textContent = G.keyTaken ? "Key got" : "No key";
        el.keychip.classList.toggle("mz-got", G.keyTaken);
        updateLives(); updateTimer();
    }
    function updateLives() {
        let html = "";
        for (let i = 0; i < 3; i++) html += i < G.lives ? ICON.heartOn : ICON.heartOff;
        el.lives.innerHTML = html;
    }
    function updateTimer() {
        const sec = Math.max(0, Math.ceil(G.timeLeft));
        if (sec !== G.lastSec) {
            G.lastSec = sec;
            el.timer.textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
            el.timerchip.classList.toggle("mz-hot", sec <= 10);
        }
    }
    function updateBestLabel() { qa("[data-best]").forEach((n) => { n.textContent = G.best; }); }
    function showMsg(text, tone) {
        el.msg.textContent = text;
        el.msg.className = "mz-msg mz-msg-show mz-msg-" + (tone || "info");
        clearTimeout(msgTimer); timers.delete(msgTimer);
        msgTimer = later(() => el.msg.classList.remove("mz-msg-show"), 1900);
    }
    function render() { updateHUDAll(); renderRoom(); }

    /* ---------------- cheat console ---------------- */
    function setCheat(key, on) {
        on = !!on;
        if (cheats[key] === on) return;
        cheats[key] = on;
        if (on) { G.cheatUses++; SFX.cheat(); }
        applyCheat(key, on);
        updateCheatUI();
    }
    function applyCheat(key, on) {
        switch (key) {
            case "path": refreshXray(); break;
            case "map": refreshFog(); break;
            case "wallhack":
                el.maze.classList.toggle("mz-hack", on);
                showMsg(on ? "Wall hack enabled — walk through walls" : "Wall hack disabled", "cheat");
                break;
            case "freezeghosts":
                G.ghosts.forEach((gh) => { if (gh.node) gh.node.classList.toggle("mz-frozen", on); });
                showMsg(on ? "Ghosts frozen" : "Ghosts are moving again", "cheat");
                break;
            case "freezetime":
                el.timerchip.classList.toggle("mz-frozen", on);
                showMsg(on ? "Timer frozen" : "Timer resumed", "cheat");
                break;
            case "shield":
                if (playerNode) playerNode.classList.toggle("mz-shielded", on);
                showMsg(on ? "Ghost shield active" : "Ghost shield off", "cheat");
                break;
        }
    }
    function updateCheatUI() {
        qa("input[data-cheat]").forEach((cb) => { cb.checked = !!cheats[cb.dataset.cheat]; });
        const active = Object.keys(cheats).filter((k) => cheats[k]);
        el.cheatCount.textContent = active.length + (active.length === 1 ? " cheat active" : " cheats active");
        if (active.length) { el.cheatbadge.textContent = active.length; el.cheatbadge.hidden = false; }
        else if (G.cheatUses > 0) { el.cheatbadge.textContent = "•"; el.cheatbadge.hidden = false; }
        else el.cheatbadge.hidden = true;
    }
    function resetCheats() {
        Object.keys(cheats).forEach((k) => { cheats[k] = false; });
        el.maze.classList.remove("mz-hack");
        el.timerchip.classList.remove("mz-frozen");
        if (playerNode) playerNode.classList.remove("mz-shielded");
        G.ghosts.forEach((gh) => { if (gh.node) gh.node.classList.remove("mz-frozen"); });
        updateCheatUI();
    }
    function deactivateAll() { Object.keys(cheats).forEach((k) => { if (cheats[k]) setCheat(k, false); }); }
    function cheatCollectGems() {
        if (!G.running) return;
        G.cheatUses++;
        const remaining = G.gems.filter((g) => !g.taken);
        if (!remaining.length) showMsg("All gems are already collected", "cheat");
        else remaining.forEach((g, i) => later(() => collectGem(g), i * 100));
        updateCheatUI();
    }
    function cheatWarp() {
        if (!G.running) return;
        G.cheatUses++;
        if (!G.keyTaken) takeKey(true);
        swipeDir = null; autoPath = []; hideTarget();
        const p = G.player;
        p.fx = p.x; p.fy = p.y; p.x = G.exit.x; p.y = G.exit.y;
        p.t0 = performance.now(); p.dur = 220; p.lastStep = p.t0;
        place(playerNode, p.x, p.y);
        refreshFog(); updateCheatUI();
        onCell(p.x, p.y);
    }
    function openConsole() {
        if (!G.running) return;
        G.consoleOpen = true;
        held.clear(); swipeDir = null; autoPath = []; hideTarget();
        el.cheatOverlay.hidden = false;
        setStatus("Cheats");
    }
    function closeConsole() {
        G.consoleOpen = false;
        el.cheatOverlay.hidden = true;
        if (G.running) setStatus(G.paused ? "Paused" : "Playing");
    }

    /* ---------------- input: keyboard ---------------- */
    const KEYMAP = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", a: "left", s: "down", d: "right", W: "up", A: "left", S: "down", D: "right",
    };
    function primaryAction() {
        if (screenName === "start" || screenName === "win") startRun();
        else if (screenName === "pause") togglePause(false);
        else if (screenName === "level") nextLevel();
        else if (screenName === "over") retryLevel();
    }
    function onKeyDown(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const dir = KEYMAP[e.key];
        if (dir) {
            if (G.running || G.consoleOpen) e.preventDefault();
            if (playable()) {
                swipeDir = null; autoPath = []; hideTarget();
                if (!held.has(dir)) held.add(dir);
                tryMove(dir);
            }
            return;
        }
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" && e.key !== "Escape") return;
        if (e.key === "Enter") {
            if (e.target && e.target.closest && e.target.closest("button")) return;
            primaryAction();
        } else if (e.key === "p" || e.key === "P") togglePause();
        else if (e.key === "m" || e.key === "M") toggleMute();
        else if (e.key === "c" || e.key === "C") { if (G.consoleOpen) closeConsole(); else openConsole(); }
        else if (e.key === "Escape") { if (G.consoleOpen) closeConsole(); else if (G.running) togglePause(); }
    }
    function onKeyUp(e) { const dir = KEYMAP[e.key]; if (dir) held.delete(dir); }
    function toggleMute() {
        muted = !muted;
        el.mutebtn.innerHTML = muted ? ICON.volOff : ICON.volOn;
        el.mutebtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    }

    /* ---------------- input: mouse + touch (no virtual buttons) ---------------- */
    function cellFromEvent(e) {
        const r = el.maze.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const x = Math.floor(((e.clientX - r.left) / r.width) * G.cols);
        const y = Math.floor(((e.clientY - r.top) / r.height) * G.rows);
        if (x < 0 || y < 0 || x >= G.cols || y >= G.rows) return null;
        return { x, y };
    }
    function hideCursor() { if (cursorNode) cursorNode.style.display = "none"; }
    function hideTarget() { if (targetNode) targetNode.style.display = "none"; }
    function showTarget(c) {
        if (!targetNode) return;
        targetNode.setAttribute("cx", c.x * CELL + CELL / 2);
        targetNode.setAttribute("cy", c.y * CELL + CELL / 2);
        targetNode.style.display = "";
    }
    function updateCursor(e) {
        if (!cursorNode) return;
        if (!playable()) { hideCursor(); return; }
        const c = cellFromEvent(e);
        if (c && G.grid[c.y][c.x] === 0 && (cheats.map || G.explored[c.y][c.x])) {
            cursorNode.setAttribute("x", c.x * CELL + 3);
            cursorNode.setAttribute("y", c.y * CELL + 3);
            cursorNode.style.display = "";
        } else hideCursor();
    }
    function walkTo(c) {
        const p = G.player;
        if (c.x === p.x && c.y === p.y) { swipeDir = null; autoPath = []; hideTarget(); return; }
        if (G.grid[c.y][c.x] !== 0) return;
        if (!cheats.map && !G.explored[c.y][c.x]) { showMsg("That area is still unexplored", "info"); return; }
        const b = bfs(G.grid, p.x, p.y);
        if (b.dist[c.y][c.x] < 0) { showMsg("No route there", "info"); return; }
        swipeDir = null;
        autoPath = tracePath(b.prev, c.x, c.y).reverse().slice(1);
        showTarget(c);
    }
    el.maze.addEventListener("pointerdown", (e) => {
        if (!playable()) return;
        ptr = { x: e.clientX, y: e.clientY, swiped: false };
        try { el.maze.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        e.preventDefault();
    }, sig);
    el.maze.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse") updateCursor(e);
        if (!ptr || ptr.swiped || !playable()) return;
        const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) {
            ptr.swiped = true;
            autoPath = []; hideTarget();
            swipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
            tryMove(swipeDir);
        }
    }, sig);
    el.maze.addEventListener("pointerup", (e) => {
        if (!ptr) return;
        const wasSwipe = ptr.swiped;
        ptr = null;
        if (wasSwipe || !playable()) return;
        const c = cellFromEvent(e);
        if (c) walkTo(c);
    }, sig);
    el.maze.addEventListener("pointercancel", () => { ptr = null; }, sig);
    el.maze.addEventListener("pointerleave", hideCursor, sig);
    el.maze.addEventListener("contextmenu", (e) => e.preventDefault(), sig);

    /* ---------------- delegated clicks + cheat switches ---------------- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const btn = event.target.closest("[data-action]");
        if (!btn) { if (event.target === el.cheatOverlay) closeConsole(); return; }
        const a = btn.dataset.action;
        if (a === "start" || a === "again" || a === "newrun") startRun();
        else if (a === "resume") togglePause(false);
        else if (a === "restart" || a === "retry") retryLevel();
        else if (a === "quit" || a === "menu") quitRun();
        else if (a === "next") nextLevel();
        else if (a === "pause") togglePause();
        else if (a === "mute") toggleMute();
        else if (a === "cheats") openConsole();
        else if (a === "cheat-close") closeConsole();
        else if (a === "cheat-off") deactivateAll();
        else if (a === "ck-gems") cheatCollectGems();
        else if (a === "ck-warp") cheatWarp();
    }
    root.addEventListener("click", handleClick, sig);
    root.addEventListener("change", (e) => {
        const cb = e.target.closest("input[data-cheat]");
        if (cb) setCheat(cb.dataset.cheat, cb.checked);
    }, sig);
    document.addEventListener("keydown", onKeyDown, sig);
    document.addEventListener("keyup", onKeyUp, sig);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && G.running && !G.paused) togglePause(true);
    }, sig);
    window.addEventListener("blur", () => { held.clear(); swipeDir = null; autoPath = []; hideTarget(); }, sig);

    /* ---------------- main loop ---------------- */
    function tick(now) {
        rafId = requestAnimationFrame(tick);
        const dt = Math.min(64, now - (G.lastTick || now));
        G.lastTick = now;
        if (!playable()) return;

        if (!cheats.freezetime) {
            G.timeLeft -= dt / 1000;
            if (G.timeLeft <= 0) { G.timeLeft = 0; updateTimer(); gameOver("time"); return; }
            updateTimer();
        }
        if (!cheats.freezeghosts) {
            for (const gh of G.ghosts) {
                gh.acc += dt;
                let guard = 0;
                while (gh.acc >= gh.stepMs && guard++ < 4) { gh.acc -= gh.stepMs; stepGhost(gh); }
            }
        }
        /* movement priority: held keys > swipe-run > click/tap auto-walk */
        if (held.size) {
            for (const d of held) tryMove(d, now);
        } else if (swipeDir) {
            if (canStep(swipeDir)) tryMove(swipeDir, now);
            else swipeDir = null;
        } else if (autoPath.length && now - G.player.lastStep >= STEP_MS) {
            const n = autoPath[0];
            const dx = n[0] - G.player.x, dy = n[1] - G.player.y;
            if (Math.abs(dx) + Math.abs(dy) !== 1) { autoPath = []; hideTarget(); }
            else {
                const dir = dx === 1 ? "right" : dx === -1 ? "left" : dy === 1 ? "down" : "up";
                if (canStep(dir) && tryMove(dir, now)) autoPath.shift();
                else { autoPath = []; hideTarget(); }
                if (!autoPath.length) hideTarget();
            }
        }
        checkCollisions(now);
    }

    /* ---------------- room sync (lightweight progress race) ----------------
     * Gameplay is real-time and local for each player. Canonical room state
     * only carries both players' progress; only the host writes it.
     */
    const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
    function sanitizeProgress(p) {
        p = p || {};
        return {
            n: String(p.n || "Rival").slice(0, 24),
            l: clampInt(p.l, 1, levels.length), s: clampInt(p.s, 0, 999999),
            g: clampInt(p.g, 0, 99), t: clampInt(p.t, 0, 99),
            st: ["ready", "playing", "cleared", "over", "won"].includes(p.st) ? p.st : "playing",
        };
    }
    function mkProgress(st) {
        return { n: String(playerName).slice(0, 24), l: G.level, s: G.score, g: G.gemsTaken, t: G.gemsTotal, st };
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!online || !room.isHost || !state) return;
        if (actor !== 1 || !action || action.type !== "progress") return;
        state.progress[1] = sanitizeProgress(action.p);
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function syncProgress(st) {
        if (!online) return;
        const p = mkProgress(st);
        if (room.isHost) {
            if (!state) state = { progress: [null, null] };
            state.progress[playerIndex] = p;
            publish();
        } else {
            submitAction({ type: "progress", p });
            renderRoom();
        }
    }
    function statusWord(st) {
        return { ready: "Ready", playing: "Playing", cleared: "Cleared", over: "Out", won: "Escaped" }[st] || "Playing";
    }
    function renderRoom() {
        if (!online) { el.room.hidden = true; return; }
        el.room.hidden = false;
        const rival = state && state.progress ? state.progress[1 - playerIndex] : null;
        el.roomYouName.textContent = playerName;
        el.roomYouMeta.textContent = "Lv " + G.level + " · " + G.score + " pts";
        el.roomRivalName.textContent = rival ? rival.n : "Rival";
        el.roomRivalMeta.textContent = rival
            ? "Lv " + rival.l + " · " + rival.s + " pts · " + statusWord(rival.st)
            : "Waiting…";
    }
    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; renderRoom(); }));
        if (room.isHost) {
            state = { progress: [mkProgress("ready"), null] };
            publish();
            sub(() => room.onAction((action) => applyAction(action, 1)));
        } else {
            sub(() => room.onState((nextState) => { state = nextState; renderRoom(); }));
        }
    }

    /* ---------------- boot ---------------- */
    function previewReveal() {
        for (let y = 0; y < G.rows; y++)
            for (let x = 0; x < G.cols; x++) {
                const r = fogRects[y][x];
                r.setAttribute("data-o", "0.5");
                r.style.opacity = "0.5";
            }
    }
    try { G.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch (err) { G.best = 0; }
    buildLevel(1);            // decorative preview behind the start screen
    renderMaze();
    previewReveal();
    updateHUDAll();
    updateBestLabel();
    updateCheatUI();
    showScreen("start");
    syncButtons();
    el.mutebtn.innerHTML = ICON.volOn;
    setStatus(online ? "Room · Ready" : "Ready");
    renderRoom();
    G.lastTick = performance.now();
    rafId = requestAnimationFrame(tick);

    /* ---------------- teardown ---------------- */
    return {
        destroy() {
            ac.abort();                       // removes every listener registered with sig
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            unsubs.forEach((u) => { try { u(); } catch (err) { /* already gone */ } });
            if (AC) { try { AC.close(); } catch (err) { /* already closed */ } AC = null; }
            held.clear();
            root.innerHTML = "";
        },
    };
}