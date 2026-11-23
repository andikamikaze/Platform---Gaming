/* ==== games/haunted-house.js ==== */
/*
  Haunted House - realtime 2D side-scroll escape (template module).
  1. META.id must equal the file name without .js  ->  haunted-house.js
  2. All game logic lives in mount(root, context).
  3. After editing run: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "haunted-house",
    name: "Haunted House",
    category: "adventure",
    catLabel: "Adventure",
    desc: "Explore a dark side-view house, find 4 code clues, keep your light alive and escape the ghost.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="39" cy="9" r="3.5"/><path d="M6 24L24 8l18 16"/><path d="M9 23v19h30V23"/><path d="M20 42V31a4 4 0 0 1 8 0v11"/><path d="M14 16v6M34 16v6"/></svg>',
    bg: ["#e9d5ff", "#a855f7"],
    bestKey: "hauntedHouseBestTime",
};

/* ================= pure helpers (also used by tests) ================= */

const VIEW_W = 960, VIEW_H = 540, WORLD_H = 600;
const FLOOR_Y = [110, 250, 390, 530];        // attic, upper, ground, basement
const ROOM_H = 118;
const GAME_SECONDS = 240;
const NERVES = 3;
const PLAYER_SPEED = 175;
const STAIR_SPEED = 0.9;                     // stair progress per second
const GHOST_HUNT = 102, GHOST_ROAM = 62, GHOST_FLEE = 155;
const CHASE_P = 0.7;
const DORM_S = 5;                            // head start when the coin toss favors players
const INV_S = 2.5;
const MATCH_S = 8;
const BATTERY_DRAIN = 2.4;                   // % per second while the torch is on
const CATCH_R = 26;
const STAIR_HALF = 35;                       // half horizontal run of a staircase
const CLUE_KINDS = ["books", "clock", "roses", "calendar"];

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function codeOf(d) { return "" + d.books + d.clock + d.roses + d.calendar; }

/* Random house: 4 floors, rooms separated by doors, stairs between floors.
   The basement hatch is locked; the brass key never spawns in the basement,
   so every generated house is provably finishable (validated below). */
function genLevel(seed) {
    const rnd = mulberry32(seed);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const shuffle = (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    };
    const defs = [
        { name: "Attic", types: ["Attic", "Storage", "Crawl Space"], n: 3 },
        { name: "Upper Floor", types: ["Bedroom", "Study", "Library", "Bathroom"], n: 4 },
        { name: "Ground Floor", types: ["Kitchen", "Dining", "Living Room", "Hall"], n: 4 },
        { name: "Basement", types: ["Cellar", "Boiler Room", "Wine Cellar"], n: 3 },
    ];
    const foyerRight = rnd() < 0.5;
    const rooms = [], doors = [], stairs = [], items = [], floors = [];
    let worldW = 0;

    defs.forEach((d, f) => {
        let types = [];
        for (let i = 0; i < d.n; i++) types.push(pick(d.types));
        if (f === 2) types = foyerRight ? types.concat("Foyer") : ["Foyer"].concat(types);
        let x = 40;
        const fr = [], ids = [];
        types.forEach((t, i) => {
            const w = ri(200, 270);
            const room = { id: f + ":" + i, f, i, x0: x, x1: x + w, type: t, sw: null, lampOn: false };
            if (t === "Foyer" || rnd() < 0.55) room.sw = { x: x + ri(45, w - 45) };
            room.lampOn = t === "Foyer" ? true : rnd() < 0.15;
            rooms.push(room); fr.push(room); ids.push(room.id);
            x += w;
        });
        floors.push({ f, name: d.name, y: FLOOR_Y[f], x0: 40, x1: x, rooms: ids });
        worldW = Math.max(worldW, x + 40);
        for (let i = 1; i < fr.length; i++)
            doors.push({ id: "d" + doors.length, f, x: fr[i].x0, open: rnd() < 0.22 });
    });

    const byId = {};
    rooms.forEach((r) => { byId[r.id] = r; });
    const roomAt = (f, x) => {
        const fr = floors[f].rooms;
        for (const id of fr) { const r = byId[id]; if (x >= r.x0 && x <= r.x1) return r; }
        return byId[x < floors[f].x0 ? fr[0] : fr[fr.length - 1]];
    };

    for (let f = 0; f < 3; f++) {
        const span0 = Math.max(floors[f].x0, floors[f + 1].x0) + 70;
        const span1 = Math.min(floors[f].x1, floors[f + 1].x1) - 70;
        const n = rnd() < 0.35 ? 2 : 1;
        const placed = [];
        for (let k = 0; k < n; k++) {
            let sx = null;
            for (let a = 0; a < 60; a++) {
                const cand = ri(span0, span1);
                const okD = doors.every((d) =>
                    (d.f !== f && d.f !== f + 1) ||
                    (Math.abs(d.x - (cand - STAIR_HALF)) > 30 && Math.abs(d.x - (cand + STAIR_HALF)) > 30));
                const okS = placed.every((p) => Math.abs(p - cand) > 150);
                if (okD && okS) { sx = cand; break; }
            }
            if (sx == null) sx = Math.round(span0 + ((span1 - span0) * (k + 1)) / (n + 1));
            placed.push(sx);
            const ra = roomAt(f, sx + STAIR_HALF).id;
            const rb = roomAt(f + 1, sx - STAIR_HALF).id;
            stairs.push({ id: "s" + stairs.length, x: sx, fTop: f, fBot: f + 1, ra, rb, locked: f + 1 === 3 });
        }
    }

    const foyer = rooms.find((r) => r.type === "Foyer");
    const exit = { f: 2, x: foyerRight ? floors[2].x1 - 10 : 50 };
    /* score-based placement: first fully-clear spot, else the least-bad one (no stacking) */
    const placeIn = (room, kind) => {
        const obs = [];
        doors.forEach((d) => { if (d.f === room.f) obs.push({ x: d.x, r: 26 }); });
        stairs.forEach((s) => {
            if (s.fTop === room.f || s.fBot === room.f) {
                obs.push({ x: s.x - STAIR_HALF, r: 30 }); obs.push({ x: s.x + STAIR_HALF, r: 30 });
            }
        });
        if (room.sw) obs.push({ x: room.sw.x, r: 22 });
        items.forEach((it) => { if (it.f === room.f) obs.push({ x: it.x, r: 34 }); });
        const lo = room.x0 + 42, hi = room.x1 - 42;
        let bestX = Math.round((lo + hi) / 2), bestScore = -Infinity;
        for (let a = 0; a < 90; a++) {
            const cand = a === 0 ? Math.round((lo + hi) / 2) : ri(lo, hi);
            let score = Infinity;
            for (const o of obs) { const d = Math.abs(cand - o.x) - o.r; if (d < score) score = d; }
            if (score >= 0) { bestX = cand; break; }
            if (score > bestScore) { bestScore = score; bestX = cand; }
        }
        items.push({ id: "i" + items.length, kind, f: room.f, x: bestX, room: room.id, taken: false });
    };
    const free = shuffle(rooms.filter((r) => r.type !== "Foyer"));
    CLUE_KINDS.forEach((k, idx) => placeIn(free[idx], "clue-" + k));
    placeIn(free[4], "note");
    placeIn(pick(rooms.filter((r) => r.f !== 3)), "key");
    for (let k = 0; k < 3; k++) placeIn(pick(rooms), "battery");
    for (let k = 0; k < 2; k++) placeIn(pick(rooms), "matches");
    placeIn(pick(rooms.filter((r) => r.f === 3)), "salts");

    const digits = {};
    CLUE_KINDS.forEach((k) => { digits[k] = ri(0, 9); });
    const fc = (foyer.x0 + foyer.x1) / 2;
    const farRooms = rooms.filter((r) =>
        (r.f === 1 || r.f === 2) && r.type !== "Foyer" && Math.abs((r.x0 + r.x1) / 2 - fc) > 300);
    const far = farRooms.length ? pick(farRooms) : byId[floors[1].rooms[0]];
    const attic = floors[0].rooms.map((id) => byId[id])
        .sort((a, b) => Math.abs((b.x0 + b.x1) / 2 - fc) - Math.abs((a.x0 + a.x1) / 2 - fc))[0];
    return {
        seed, worldW, foyerRight, floors, rooms, doors, stairs, items, exit, digits,
        spawnSlots: [{ f: 2, x: Math.round(fc) }, { f: far.f, x: Math.round((far.x0 + far.x1) / 2) }],
        ghostSpawn: { f: 0, x: Math.round((attic.x0 + attic.x1) / 2) },
    };
}

/* room graph: doors connect neighbors, stairs connect two rooms across floors */
function buildAdj(level, ignoreLocks) {
    const adj = {};
    level.rooms.forEach((r) => { adj[r.id] = []; });
    level.floors.forEach((fl) => {
        for (let i = 1; i < fl.rooms.length; i++) {
            adj[fl.rooms[i - 1]].push({ to: fl.rooms[i], stair: null });
            adj[fl.rooms[i]].push({ to: fl.rooms[i - 1], stair: null });
        }
    });
    level.stairs.forEach((s) => {
        if (s.locked && !ignoreLocks) return;
        adj[s.ra].push({ to: s.rb, stair: s.id });
        adj[s.rb].push({ to: s.ra, stair: s.id });
    });
    return adj;
}
/* to === null -> Set of reachable rooms, otherwise shortest path (array) or null */
function bfs(adj, from, to) {
    const prev = {}; prev[from] = null;
    const q = [from];
    while (q.length) {
        const cur = q.shift();
        if (to !== null && cur === to) break;
        for (const e of adj[cur]) if (!(e.to in prev)) { prev[e.to] = cur; q.push(e.to); }
    }
    if (to === null) return new Set(Object.keys(prev));
    if (!(to in prev)) return null;
    const path = [];
    let cur = to;
    while (cur !== null) { path.push(cur); cur = prev[cur]; }
    return path.reverse();
}
function isSolvable(level) {
    const foyer = level.rooms.find((r) => r.type === "Foyer").id;
    const key = level.items.find((i) => i.kind === "key");
    const reachLocked = bfs(buildAdj(level, false), foyer, null);
    if (!reachLocked.has(key.room)) return false;      // key must be reachable without the basement
    const reachAll = bfs(buildAdj(level, true), foyer, null);
    return level.rooms.every((r) => reachAll.has(r.id));
}
function makeLevel(seed) {
    let s = seed >>> 0, lvl = genLevel(s);
    for (let i = 0; i < 30 && !isSolvable(lvl); i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        lvl = genLevel(s);
    }
    return lvl;
}
/* turn a room path into ghost waypoints (walk / stair) */
function ghostWaypoints(level, path) {
    const byId = {}; level.rooms.forEach((r) => { byId[r.id] = r; });
    const sById = {}; level.stairs.forEach((s) => { sById[s.id] = s; });
    const adj = buildAdj(level, true);
    const wps = [];
    for (let k = 1; k < path.length; k++) {
        const a = byId[path[k - 1]], b = byId[path[k]];
        const edge = adj[a.id].find((e) => e.to === b.id);
        if (!edge) continue;
        if (!edge.stair) {
            wps.push({ t: "walk", f: a.f, x: Math.round((b.x0 + b.x1) / 2) });
        } else {
            const s = sById[edge.stair];
            const up = a.f === s.fBot;
            wps.push({ t: "walk", f: a.f, x: s.x + (up ? -STAIR_HALF : STAIR_HALF) });
            wps.push({ t: "stair", id: s.id, to: up ? 1 : 0 });
        }
    }
    return wps;
}

export const _test = { mulberry32, genLevel, makeLevel, buildAdj, bfs, isSolvable, ghostWaypoints, codeOf, CLUE_KINDS };

/* ============================ mount ============================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;

    let state = null;
    const inputs = [{ l: 0, r: 0, u: 0, d: 0 }, { l: 0, r: 0, u: 0, d: 0 }];
    let raf = 0, lastT = 0, pubAcc = 0, clock = 0, destroyed = false;
    const unsubs = [];
    const ui = { help: false, journal: false, cheats: false, keypad: false, pad: "", padMsg: "Enter the 4-digit code." };
    const seen = { toast: -1, scare: -1, wrong: -1, phase: "" };
    const cam = { x: 0, y: 0 };
    const rp = {};                       // smoothed render positions (guest interpolation)
    let toastT = 0, flashT = 0, hover = null;
    let best = null;
    try { best = Number(localStorage.getItem(META.bestKey)) || null; } catch (e) { best = null; }

    /* ------------------------------ DOM ------------------------------ */
    root.innerHTML = `
<style>
.hh{--hh-line:#26304a;--hh-dim:#8b93a7;--hh-fg:#e7eaf2;--hh-cyan:#22d3ee;--hh-amber:#fbbf24;--hh-red:#f87171;--hh-card:#0d1220;color:var(--hh-fg);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.hh [hidden]{display:none!important}
.hh .hh-panel{display:flex;flex-direction:column;gap:10px}
.hh .hh-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hh .hh-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--hh-line);border-radius:999px;font-size:12px;color:var(--hh-dim);background:#ffffff06;white-space:nowrap}
.hh .hh-chip b{color:var(--hh-fg);font-weight:600}
.hh .hh-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.hh .hh-batt{width:46px;height:8px;border-radius:99px;background:#1b2236;overflow:hidden;display:inline-block}
.hh .hh-batt i{display:block;height:100%;background:var(--hh-cyan);border-radius:99px;transition:width .2s}
.hh .hh-spacer{flex:1}
.hh .hh-btn{border:1px solid var(--hh-line);background:transparent;color:var(--hh-fg);border-radius:8px;padding:5px 11px;font-size:12px;cursor:pointer;transition:background .15s,border-color .15s}
.hh .hh-btn:hover{background:#ffffff10;border-color:#3b476b}
.hh .hh-btn.hh-acc{border-color:#22d3ee55;color:var(--hh-cyan)}
.hh .hh-btn.hh-warn{border-color:#fbbf2455;color:var(--hh-amber)}
.hh .hh-stage{position:relative;width:100%;border:1px solid var(--hh-line);border-radius:14px;overflow:hidden;background:#0a0e17}
.hh canvas{display:block;width:100%;height:auto;touch-action:none}
.hh .hh-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:92%;padding:6px 14px;border-radius:999px;background:#0d1220ee;border:1px solid var(--hh-line);font-size:12.5px;color:var(--hh-fg);opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:5}
.hh .hh-flash{position:absolute;inset:0;background:radial-gradient(ellipse at center,#ef444400 35%,#7f1d1dbb 100%);opacity:0;pointer-events:none;z-index:4}
.hh .hh-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#05070dd9;backdrop-filter:blur(3px);z-index:6;padding:14px}
.hh .hh-card{width:min(430px,100%);max-height:100%;overflow:auto;background:var(--hh-card);border:1px solid var(--hh-line);border-radius:14px;padding:20px 22px;text-align:center}
.hh .hh-card h3{margin:0 0 6px;font-size:17px;font-weight:650;letter-spacing:.2px}
.hh .hh-card p{margin:0 0 12px;font-size:13px;line-height:1.55;color:var(--hh-dim)}
.hh .hh-card .hh-btn{margin:3px}
.hh .hh-keys{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;text-align:left;font-size:12.5px;color:var(--hh-dim);margin:0 0 14px}
.hh .hh-keys b{color:var(--hh-fg);font-weight:600;white-space:nowrap}
.hh .hh-list{list-style:none;margin:0 0 14px;padding:0;text-align:left;font-size:13px;line-height:2;color:var(--hh-dim)}
.hh .hh-list b{color:var(--hh-amber)}
.hh .hh-digits{display:flex;gap:8px;justify-content:center;margin-bottom:12px}
.hh .hh-digits span{width:38px;height:46px;border:1px solid var(--hh-line);border-radius:10px;display:grid;place-items:center;font-size:20px;font-weight:700;background:#0a0e17}
.hh .hh-pad{display:grid;grid-template-columns:repeat(3,64px);gap:8px;justify-content:center;margin-bottom:12px}
.hh .hh-pad button{height:42px;border:1px solid var(--hh-line);border-radius:10px;background:#ffffff08;color:var(--hh-fg);font-size:15px;font-weight:650;cursor:pointer}
.hh .hh-pad button:hover{background:#ffffff18}
.hh .hh-cheat{display:flex;align-items:center;gap:10px;text-align:left;font-size:13px;color:var(--hh-fg);padding:7px 2px;border-bottom:1px solid #1b2236;cursor:pointer}
.hh .hh-cheat input{accent-color:var(--hh-amber);width:15px;height:15px}
.hh .hh-cheat small{color:var(--hh-dim);margin-left:auto;font-size:11px}
.hh .hh-hint{font-size:11.5px;color:#5b6478;text-align:center}
.hh .hh-touch{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;padding:12px;z-index:5;pointer-events:none}
.hh .hh-touch button{pointer-events:auto;width:52px;height:52px;border-radius:14px;border:1px solid #3b476b88;background:#0d1220bb;color:var(--hh-fg);font-size:17px;touch-action:none;user-select:none;-webkit-user-select:none}
.hh .hh-touch button:active{background:#22d3ee33}
.hh .hh-dpad{display:flex;flex-direction:column;align-items:center;gap:6px}
.hh .hh-dpad .hh-row{display:flex;gap:6px}
.hh .hh-acts{display:flex;gap:8px}
.hh .hh-acts button{border-radius:50%}
.hh .hh-acts .hh-e{width:62px;height:62px;border-color:#22d3ee66;color:var(--hh-cyan)}
.hh .hh-shake{animation:hh-shake .3s}
@keyframes hh-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@media (max-width:640px){.hh .hh-hint{display:none}.hh .hh-chip{padding:3px 8px;font-size:11px}}
</style>
<div class="game-app hh">
  <div class="game-intro">
    <div><h2>Haunted House</h2><p>A dark house, four hidden digits, one way out.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel hh-panel" data-board>
    <div class="hh-hud">
      <span class="hh-chip" title="Nerves">Nerve <span data-hud="nerves"></span></span>
      <span class="hh-chip">Time <b data-hud="time">4:00</b></span>
      <span class="hh-chip" title="Flashlight battery">Torch <span class="hh-batt"><i data-hud="batt"></i></span></span>
      <span class="hh-chip">Matches <b data-hud="matches">2</b></span>
      <span class="hh-chip">Clues <b data-hud="clues">0/4</b></span>
      <span class="hh-chip">Ghost <b data-hud="ghost">-</b></span>
      <span class="hh-spacer"></span>
      <button class="hh-btn" data-act="journal" title="Clue journal (J)">Journal</button>
      <button class="hh-btn" data-act="help" title="How to play (H)">?</button>
      <button class="hh-btn hh-warn" data-act="cheats" title="Cheats (C)">Cheats</button>
      <button class="hh-btn" data-act="restart">Restart</button>
    </div>
    <div class="hh-stage">
      <canvas width="960" height="540"></canvas>
      <div class="hh-toast" data-el="toast"></div>
      <div class="hh-flash" data-el="flash"></div>

      <div class="hh-ov" data-ov="help" hidden>
        <div class="hh-card">
          <h3>How to play</h3>
          <p>Find the <b>4 digits</b> hidden in the house and the note that tells their order, then unlock the <b>front door in the Foyer</b>. The ghost drifts through walls - light keeps it away. You have <b>3 nerves</b> and <b>4 minutes</b>.</p>
          <div class="hh-keys">
            <b>A / D or arrows</b><span>move left / right</span>
            <b>W / S</b><span>climb stairs up / down</span>
            <b>E / click</b><span>inspect, open doors, flip switches</span>
            <b>F</b><span>flashlight (drains battery, repels the ghost)</span>
            <b>M</b><span>strike a match (short glow, repels the ghost)</span>
            <b>J / C / H</b><span>journal / cheats / help</span>
          </div>
          <p>Lit rooms are safe - the ghost refuses to enter. The basement hatch is locked; the brass key is somewhere upstairs. Salts in the basement restore a nerve.</p>
          <button class="hh-btn hh-acc" data-act="start" data-el="startBtn">Start</button>
          <button class="hh-btn" data-act="closehelp">Close</button>
        </div>
      </div>

      <div class="hh-ov" data-ov="journal" hidden>
        <div class="hh-card">
          <h3>Clue journal</h3>
          <ul class="hh-list" data-el="journalList"></ul>
          <button class="hh-btn" data-act="closejournal">Close</button>
        </div>
      </div>

      <div class="hh-ov" data-ov="keypad" hidden>
        <div class="hh-card" data-el="padCard">
          <h3>Front door keypad</h3>
          <p data-el="padMsg">Enter the 4-digit code.</p>
          <div class="hh-digits"><span data-d="0"></span><span data-d="1"></span><span data-d="2"></span><span data-d="3"></span></div>
          <div class="hh-pad" data-el="pad">
            <button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button>
            <button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button>
            <button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button>
            <button data-k="clr">CLR</button><button data-k="0">0</button><button data-k="ok">OK</button>
          </div>
          <button class="hh-btn" data-act="closepad">Back</button>
        </div>
      </div>

      <div class="hh-ov" data-ov="cheats" hidden>
        <div class="hh-card">
          <h3>Cheats</h3>
          <p>Using cheats disables your best-time record.</p>
          <label class="hh-cheat"><input type="checkbox" data-cheat="god"> Invincible <small>ghost can't hurt you</small></label>
          <label class="hh-cheat"><input type="checkbox" data-cheat="freeze"> Freeze ghost <small>it stops moving</small></label>
          <label class="hh-cheat"><input type="checkbox" data-cheat="light"> Lights on <small>see the whole house</small></label>
          <label class="hh-cheat"><input type="checkbox" data-cheat="power"> Infinite power <small>battery & matches</small></label>
          <label class="hh-cheat"><input type="checkbox" data-cheat="reveal"> Reveal code <small>digits shown in journal</small></label>
          <div style="margin-top:12px">
            <button class="hh-btn hh-warn" data-act="cheatTime">+60 seconds</button>
            <button class="hh-btn" data-act="closecheats">Close</button>
          </div>
        </div>
      </div>

      <div class="hh-ov" data-ov="end" hidden>
        <div class="hh-card">
          <h3 data-el="endTitle">Game over</h3>
          <p data-el="endSub"></p>
          <button class="hh-btn hh-acc" data-act="restart">Play again</button>
          <button class="hh-btn" data-exit>Exit game</button>
        </div>
      </div>

      <div class="hh-touch" data-el="touch" hidden>
        <div class="hh-dpad">
          <button data-vk="u">&#9650;</button>
          <div class="hh-row">
            <button data-vk="l">&#9664;</button>
            <button data-vk="d">&#9660;</button>
            <button data-vk="r">&#9654;</button>
          </div>
        </div>
        <div class="hh-acts">
          <button data-va="match">M</button>
          <button data-va="flash">F</button>
          <button data-va="interact" class="hh-e">E</button>
        </div>
      </div>
    </div>
    <div class="hh-hint">Move: A/D or arrows &middot; Stairs: W/S &middot; Interact: E or click &middot; Torch: F &middot; Match: M &middot; Journal: J &middot; Cheats: C</div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const cv = $("canvas");
    const ctx = cv.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = VIEW_W * dpr; cv.height = VIEW_H * dpr;
    cv.style.aspectRatio = VIEW_W + "/" + VIEW_H;
    const light = document.createElement("canvas");
    light.width = VIEW_W * dpr; light.height = VIEW_H * dpr;
    const lctx = light.getContext("2d");
    const toastEl = $('[data-el="toast"]'), flashEl = $('[data-el="flash"]');
    const statusEl = $("[data-status]");
    const hud = {
        nerves: $('[data-hud="nerves"]'), time: $('[data-hud="time"]'), batt: $('[data-hud="batt"]'),
        matches: $('[data-hud="matches"]'), clues: $('[data-hud="clues"]'), ghost: $('[data-hud="ghost"]'),
    };
    const ov = { help: $('[data-ov="help"]'), journal: $('[data-ov="journal"]'), keypad: $('[data-ov="keypad"]'), cheats: $('[data-ov="cheats"]'), end: $('[data-ov="end"]') };
    const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (isTouch) $('[data-el="touch"]').removeAttribute("hidden");

    /* --------------------------- state helpers --------------------------- */

    function freshState(seed) {
        const level = makeLevel(seed);
        const players = [0, 1].map((i) => ({
            active: i === 0 || online, slot: i,
            f: level.spawnSlots[i].f, x: level.spawnSlots[i].x, stair: null,
            face: 1, battery: 100, flash: false, matches: 2, matchT: 0, inv: 0,
        }));
        return {
            phase: "intro", seed: level.seed, level, playerCount: online ? 2 : 1, players,
            ghost: { f: level.ghostSpawn.f, x: level.ghostSpawn.x, stair: null, wps: [], wi: 0, repathT: 0, dormT: 0, fleeT: 0, mood: "roam", prey: 0 },
            nerves: NERVES, timeLeft: GAME_SECONDS,
            found: { books: null, clock: null, roses: null, calendar: null },
            orderKnown: false, hasKey: false, firstMove: "",
            cheats: { god: false, freeze: false, light: false, power: false, reveal: false },
            cheatsUsed: false, toast: { id: 0, text: "" }, fx: { scare: 0, wrong: 0 },
            result: "", timeUsed: 0,
        };
    }
    /* Firebase RTDB strips nulls - restore expected shape on snapshots */
    function normalize(s) {
        s.found = s.found || {};
        CLUE_KINDS.forEach((k) => { if (s.found[k] === undefined) s.found[k] = null; });
        s.cheats = Object.assign({ god: false, freeze: false, light: false, power: false, reveal: false }, s.cheats);
        s.fx = Object.assign({ scare: 0, wrong: 0 }, s.fx);
        s.toast = Object.assign({ id: 0, text: "" }, s.toast);
        (s.players || []).forEach((p) => { if (!p.stair) p.stair = null; });
        if (s.ghost && !s.ghost.stair) s.ghost.stair = null;
        if (s.ghost && !s.ghost.wps) s.ghost.wps = [];
        (s.level?.rooms || []).forEach((r) => { if (!r.sw) r.sw = null; });
        return s;
    }
    function toast(text) { state.toast = { id: state.toast.id + 1, text }; }
    function publishNow() { if (online && isHost && state) room.publishState(state).catch(console.warn); }
    function submitAction(a) {
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, playerIndex);
    }
    const stairById = (id) => state.level.stairs.find((s) => s.id === id);
    const roomAt = (f, x) => {
        const fl = state.level.floors[f];
        for (const id of fl.rooms) {
            const r = state.level.rooms.find((rr) => rr.id === id);
            if (x >= r.x0 && x <= r.x1) return r;
        }
        const ids = fl.rooms;
        return state.level.rooms.find((rr) => rr.id === (x < fl.x0 ? ids[0] : ids[ids.length - 1]));
    };
    const playerY = (p) => {
        if (!p.stair) return FLOOR_Y[p.f];
        const s = stairById(p.stair.id);
        return s ? FLOOR_Y[s.fBot] + (FLOOR_Y[s.fTop] - FLOOR_Y[s.fBot]) * p.stair.t : FLOOR_Y[p.f];
    };
    const ghostY = (g) => {
        if (!g.stair) return FLOOR_Y[g.f];
        const s = stairById(g.stair.id);
        return s ? FLOOR_Y[s.fBot] + (FLOOR_Y[s.fTop] - FLOOR_Y[s.fBot]) * g.stair.t : FLOOR_Y[g.f];
    };

    function startRun(regen) {
        const prevFx = state ? state.fx : null;
        const prevToast = state ? state.toast : null;
        if (regen || !state) state = freshState((Math.random() * 0x7fffffff) | 0);
        if (prevFx) { state.fx = prevFx; state.toast = prevToast; }
        const slots = Math.random() < 0.5 ? [0, 1] : [1, 0];   // random spawn side per player
        state.players.forEach((p, i) => {
            p.active = i < state.playerCount; p.slot = slots[i];
            const sp = state.level.spawnSlots[p.slot];
            p.f = sp.f; p.x = sp.x; p.stair = null; p.face = 1;
            p.battery = 100; p.flash = false; p.matches = 2; p.matchT = 0; p.inv = 0;
        });
        const lv = state.level;
        state.ghost = { f: lv.ghostSpawn.f, x: lv.ghostSpawn.x, stair: null, wps: [], wi: 0, repathT: 0, dormT: 0, fleeT: 0, mood: "roam", prey: (Math.random() * state.playerCount) | 0 };
        state.nerves = NERVES; state.timeLeft = GAME_SECONDS;
        state.found = { books: null, clock: null, roses: null, calendar: null };
        state.orderKnown = false; state.hasKey = false;
        state.cheats = { god: false, freeze: false, light: false, power: false, reveal: false };
        state.cheatsUsed = false; state.result = ""; state.timeUsed = 0;
        state.firstMove = Math.random() < 0.5 ? "player" : "ghost";   // coin toss: who moves first
        state.ghost.dormT = state.firstMove === "player" ? DORM_S : 0;
        state.phase = "playing";
        ui.keypad = false; ui.pad = "";
        inputs[0] = { l: 0, r: 0, u: 0, d: 0 }; inputs[1] = { l: 0, r: 0, u: 0, d: 0 };
        toast(state.firstMove === "player"
            ? "Coin toss: you move first - the ghost is dormant for " + DORM_S + "s."
            : "Coin toss: the ghost moves first - it is already awake!");
        publishNow();
        refreshInput();
    }
    function endRun(win, reason) {
        state.phase = win ? "won" : "lost";
        state.result = reason;
        state.timeUsed = Math.max(0, Math.round(GAME_SECONDS - state.timeLeft));
        publishNow();
    }

    /* --------------------------- simulation (host only) --------------------------- */

    function stepPlayer(p, inp, dt) {
        if (p.inv > 0) p.inv -= dt;
        if (p.matchT > 0) p.matchT -= dt;
        if (p.flash && !state.cheats.power) {
            p.battery -= BATTERY_DRAIN * dt;
            if (p.battery <= 0) { p.battery = 0; p.flash = false; }
        }
        if (p.stair) {
            const s = stairById(p.stair.id);
            const dir = (inp.u ? 1 : 0) - (inp.d ? 1 : 0);
            p.stair.t += dir * STAIR_SPEED * dt;
            if (p.stair.t >= 1) { p.f = s.fTop; p.x = s.x + STAIR_HALF; p.stair = null; }
            else if (p.stair.t <= 0) { p.f = s.fBot; p.x = s.x - STAIR_HALF; p.stair = null; }
            else p.x = s.x - STAIR_HALF + 2 * STAIR_HALF * p.stair.t;
            return;
        }
        const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        if (dir) {
            p.face = dir;
            const fl = state.level.floors[p.f];
            let nx = Math.max(fl.x0 + 12, Math.min(fl.x1 - 12, p.x + dir * PLAYER_SPEED * dt));
            for (const d of state.level.doors) {
                if (d.f !== p.f || d.open) continue;
                if (dir > 0 && p.x <= d.x - 10 && nx > d.x - 10) nx = d.x - 10;
                if (dir < 0 && p.x >= d.x + 10 && nx < d.x + 10) nx = d.x + 10;
            }
            p.x = nx;
        }
        if (inp.u || inp.d) {
            for (const s of state.level.stairs) {
                if (inp.u && p.f === s.fBot && Math.abs(p.x - (s.x - STAIR_HALF)) < 24) {
                    if (!s.locked) p.stair = { id: s.id, t: 0 };
                    break;
                }
                if (inp.d && p.f === s.fTop && Math.abs(p.x - (s.x + STAIR_HALF)) < 24) {
                    if (!s.locked) p.stair = { id: s.id, t: 1 };
                    break;
                }
            }
        }
    }

    function ghostRoomKey(g) {
        if (g.stair) { const s = stairById(g.stair.id); return g.stair.t < 0.5 ? s.rb : s.ra; }
        return roomAt(g.f, g.x).id;
    }
    function repathGhost() {
        const g = state.ghost, lv = state.level;
        const act = state.players.filter((p) => p.active);
        const prey = act.reduce((a, b) =>
            (Math.abs(a.x - g.x) + Math.abs(a.f - g.f) * 300) <= (Math.abs(b.x - g.x) + Math.abs(b.f - g.f) * 300) ? a : b);
        const unlit = lv.rooms.filter((r) => !r.lampOn);
        let targetKey;
        if (g.fleeT > 0) {
            let bd = -1; targetKey = ghostRoomKey(g);
            for (const r of unlit) {
                const d = Math.abs((r.x0 + r.x1) / 2 - prey.x) + Math.abs(r.f - prey.f) * 300;
                if (d > bd) { bd = d; targetKey = r.id; }
            }
            g.mood = "flee";
        } else if (Math.random() < CHASE_P) {
            const rk = roomAt(prey.f, prey.x).id;
            const lit = lv.rooms.find((r) => r.id === rk).lampOn;
            targetKey = lit ? (unlit.length ? unlit[(Math.random() * unlit.length) | 0].id : rk) : rk;
            g.mood = lit ? "roam" : "hunt";
            g.prey = state.players.indexOf(prey);
        } else {
            targetKey = unlit.length ? unlit[(Math.random() * unlit.length) | 0].id : ghostRoomKey(g);
            g.mood = "roam";
        }
        const path = bfs(buildAdj(lv, true), ghostRoomKey(g), targetKey);
        g.wps = path && path.length > 1 ? ghostWaypoints(lv, path) : [];
        g.wi = 0;
        g.repathT = g.mood === "hunt" ? 0.5 + Math.random() * 0.3 : 0.9 + Math.random() * 0.6;
    }
    function stepGhost(dt) {
        const g = state.ghost;
        if (state.cheats.freeze || g.dormT > 0) { if (g.dormT > 0) g.dormT -= dt; return; }
        if (g.fleeT > 0) g.fleeT -= dt;
        const gy = ghostY(g);
        const gr = state.level.rooms.find((r) => r.id === ghostRoomKey(g));
        if (gr && gr.lampOn && g.fleeT <= 0) { g.fleeT = 2.5; g.repathT = 0; }
        for (const p of state.players) {
            if (!p.active) continue;
            const dx = g.x - p.x, dy = gy - playerY(p);
            const beam = p.flash && (p.battery > 0 || state.cheats.power) && dx * p.face > 0 && Math.abs(dx) < 210 && Math.abs(dy) < 70;
            const match = p.matchT > 0 && Math.abs(dx) < 120 && Math.abs(dy) < 70;
            if ((beam || match) && g.fleeT <= 0.4) { g.fleeT = 2.2; g.repathT = 0; }
        }
        if (!g.stair) {
            g.repathT -= dt;
            if (g.repathT <= 0) repathGhost();
        }
        const speed = g.fleeT > 0 ? GHOST_FLEE : g.mood === "hunt" ? GHOST_HUNT : GHOST_ROAM;
        const wp = g.wps[g.wi];
        if (wp) {
            if (wp.t === "walk") {
                const dx = wp.x - g.x;
                g.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
                if (Math.abs(wp.x - g.x) < 2) { g.x = wp.x; g.wi++; }
            } else {
                const s = stairById(wp.id);
                if (!g.stair) g.stair = { id: s.id, t: g.f === s.fBot ? 0 : 1 };
                const dir = wp.to === 1 ? 1 : -1;
                g.stair.t += dir * 0.8 * dt;
                g.x = s.x - STAIR_HALF + 2 * STAIR_HALF * Math.max(0, Math.min(1, g.stair.t));
                if ((dir > 0 && g.stair.t >= 1) || (dir < 0 && g.stair.t <= 0)) {
                    g.f = wp.to === 1 ? s.fTop : s.fBot;
                    g.x = s.x + (wp.to === 1 ? STAIR_HALF : -STAIR_HALF);
                    g.stair = null; g.wi++;
                }
            }
        }
        if (state.cheats.god) return;
        for (const p of state.players) {
            if (!p.active || p.inv > 0) continue;
            if (Math.abs(g.x - p.x) < CATCH_R && Math.abs(ghostY(g) - playerY(p)) < 40) {
                state.nerves -= 1; state.fx.scare += 1; p.inv = INV_S;
                let bd = -1, far = state.level.rooms[0];
                for (const r of state.level.rooms) {
                    const d = Math.abs((r.x0 + r.x1) / 2 - p.x) + Math.abs(r.f - p.f) * 300;
                    if (d > bd) { bd = d; far = r; }
                }
                g.f = far.f; g.x = (far.x0 + far.x1) / 2; g.stair = null; g.wps = []; g.wi = 0; g.fleeT = 3; g.repathT = 3;
                if (state.nerves <= 0) endRun(false, "The ghost drained your last nerve.");
                else toast("The ghost touched you - 1 nerve lost. It flees across the house.");
                publishNow();
                break;
            }
        }
    }
    function simulate(dt) {
        if (!state || state.phase !== "playing") return;
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) { state.timeLeft = 0; endRun(false, "Midnight struck before you escaped."); return; }
        for (let i = 0; i < state.playerCount; i++) stepPlayer(state.players[i], inputs[i], dt);
        stepGhost(dt);
    }

    /* --------------------------- interactions --------------------------- */

    function targetsFor(p) {
        if (p.stair) return [];
        const lv = state.level, out = [];
        const add = (kind, id, x, f, r) => {
            if (f === p.f && Math.abs(x - p.x) <= r) out.push({ kind, id, x, f, r, d: Math.abs(x - p.x) });
        };
        lv.items.forEach((it) => { if (!it.taken) add("item", it.id, it.x, it.f, 42); });
        lv.rooms.forEach((rm) => { if (rm.sw) add("switch", rm.id, rm.sw.x, rm.f, 42); });
        lv.doors.forEach((d) => add("door", d.id, d.x, d.f, 46));
        lv.stairs.forEach((s) => {
            if (s.locked) { add("hatch", s.id, s.x - STAIR_HALF, s.fBot, 42); add("hatch", s.id, s.x + STAIR_HALF, s.fTop, 42); }
        });
        add("exit", "exit", lv.exit.x, lv.exit.f, 62);
        out.sort((a, b) => a.d - b.d);
        return out;
    }
    const nearestTarget = (p) => targetsFor(p)[0] || null;

    function doInteract(p, t) {
        const lv = state.level;
        if (t.kind === "item") {
            const it = lv.items.find((i) => i.id === t.id);
            if (!it || it.taken) return;
            it.taken = true;
            if (it.kind.indexOf("clue-") === 0) {
                const k = it.kind.slice(5);
                state.found[k] = lv.digits[k];
                toast("Clue found - " + k + ": " + lv.digits[k] + ".");
            } else if (it.kind === "note") { state.orderKnown = true; toast("Torn note: the order is books, clock, roses, calendar."); }
            else if (it.kind === "key") { state.hasKey = true; toast("A brass key! It should open the basement hatch."); }
            else if (it.kind === "battery") { p.battery = Math.min(100, p.battery + 60); toast("Battery pack: torch +60%."); }
            else if (it.kind === "matches") { p.matches = Math.min(6, p.matches + 2); toast("Matchbox: +2 matches."); }
            else if (it.kind === "salts") { state.nerves = Math.min(NERVES, state.nerves + 1); toast("Calming salts - 1 nerve restored."); }
        } else if (t.kind === "switch") {
            const rm = lv.rooms.find((r) => r.id === t.id);
            rm.lampOn = !rm.lampOn;
            toast(rm.lampOn ? "Lights on - the ghost refuses to enter lit rooms." : "Lights off.");
        } else if (t.kind === "door") {
            const d = lv.doors.find((x) => x.id === t.id);
            d.open = !d.open;
            if (!d.open) state.players.forEach((pl) => {
                if (pl.active && pl.f === d.f && !pl.stair && Math.abs(pl.x - d.x) < 12) pl.x = d.x + (pl.x >= d.x ? 12 : -12);
            });
        } else if (t.kind === "hatch") {
            const s = stairById(t.id);
            if (state.hasKey) { s.locked = false; toast("The basement hatch unlocks with a click."); }
            else toast("Locked. A brass key must be hidden somewhere upstairs.");
        }
        publishNow();
    }

    function applyAction(a, actor) {
        if (!state || !a || typeof a !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        if (actor >= state.playerCount) return;
        const p = state.players[actor];
        switch (a.type) {
            case "input": {
                const i = a.input || {};
                inputs[actor] = { l: i.l ? 1 : 0, r: i.r ? 1 : 0, u: i.u ? 1 : 0, d: i.d ? 1 : 0 };
                break;
            }
            case "start": if (state.phase === "intro") startRun(false); break;
            case "restart": startRun(true); break;
            case "flash":
                if (state.phase !== "playing") break;
                if (!p.flash && p.battery <= 0 && !state.cheats.power) { toast("The battery is dead. Find a battery pack."); publishNow(); }
                else { p.flash = !p.flash; publishNow(); }
                break;
            case "match":
                if (state.phase !== "playing" || p.matchT > 0) break;
                if (p.matches > 0 || state.cheats.power) {
                    if (!state.cheats.power) p.matches -= 1;
                    p.matchT = MATCH_S; publishNow();
                } else { toast("No matches left."); publishNow(); }
                break;
            case "interact": {
                if (state.phase !== "playing") break;
                const list = targetsFor(p);
                const t = (a.id && list.find((x) => x.id === a.id)) || list[0] || null;
                if (!t) { toast("Nothing within reach."); publishNow(); }
                else if (t.kind !== "exit") doInteract(p, t);
                break;
            }
            case "stair": {
                if (state.phase !== "playing" || p.stair) break;
                const s = stairById(a.id);
                if (!s) break;
                if (s.locked) { toast(state.hasKey ? "Press E at the hatch to unlock it first." : "The basement hatch is locked."); publishNow(); break; }
                if (a.dir === "up" && p.f === s.fBot && Math.abs(p.x - (s.x - STAIR_HALF)) < 30) { p.stair = { id: s.id, t: 0 }; publishNow(); }
                else if (a.dir === "down" && p.f === s.fTop && Math.abs(p.x - (s.x + STAIR_HALF)) < 30) { p.stair = { id: s.id, t: 1 }; publishNow(); }
                break;
            }
            case "code": {
                if (state.phase !== "playing") break;
                const near = p.f === state.level.exit.f && !p.stair && Math.abs(p.x - state.level.exit.x) < 70;
                if (!near) { toast("Stand at the front door in the Foyer first."); publishNow(); break; }
                if (typeof a.value === "string" && a.value === codeOf(state.level.digits))
                    endRun(true, "The keypad beeps - the front door swings open.");
                else { state.fx.wrong += 1; toast("Wrong code."); publishNow(); }
                break;
            }
            case "cheat": {
                state.cheatsUsed = true;
                if (a.key === "time") { state.timeLeft = Math.min(999, state.timeLeft + 60); toast("+60 seconds."); }
                else if (a.key in state.cheats) { state.cheats[a.key] = !state.cheats[a.key]; toast("Cheat " + a.key + ": " + (state.cheats[a.key] ? "ON" : "OFF")); }
                publishNow();
                break;
            }
        }
    }

    /* --------------------------- rendering --------------------------- */

    function rr(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }
    function furniture(c, rm) {
        const y = FLOOR_Y[rm.f], cx = (rm.x0 + rm.x1) / 2;
        const c1 = "#1d2537", c2 = "#2c3852";
        const R = (x, yy, w, h, col) => { c.fillStyle = col; c.fillRect(x, yy, w, h); };
        switch (rm.type) {
            case "Bedroom": R(cx - 60, y - 26, 120, 26, c1); R(cx - 66, y - 42, 12, 42, c2); R(cx - 48, y - 34, 28, 10, c2); break;
            case "Study": R(cx - 50, y - 30, 100, 8, c2); R(cx - 44, y - 22, 8, 22, c1); R(cx + 36, y - 22, 8, 22, c1); R(cx - 18, y - 46, 36, 16, c1); break;
            case "Library": R(cx - 55, y - 72, 110, 72, c1); for (let i = 0; i < 5; i++) { R(cx - 47 + i * 20, y - 64, 12, 26, c2); R(cx - 47 + i * 20, y - 32, 12, 24, c2); } break;
            case "Bathroom": R(cx - 45, y - 24, 90, 24, c2); R(cx - 38, y - 30, 76, 8, c1); break;
            case "Kitchen": R(cx - 55, y - 30, 110, 30, c1); R(cx - 55, y - 36, 110, 6, c2); c.strokeStyle = c2; c.lineWidth = 3; c.beginPath(); c.arc(cx - 18, y - 46, 9, 0, 7); c.stroke(); break;
            case "Dining": R(cx - 60, y - 28, 120, 8, c2); R(cx - 50, y - 20, 8, 20, c1); R(cx + 42, y - 20, 8, 20, c1); R(cx - 8, y - 44, 16, 16, c1); break;
            case "Living Room": R(cx - 60, y - 24, 120, 24, c1); R(cx - 66, y - 40, 12, 40, c2); R(cx + 54, y - 40, 12, 40, c2); break;
            case "Hall": R(cx - 40, y - 62, 80, 4, c2); R(cx - 30, y - 58, 4, 22, c2); R(cx + 26, y - 58, 4, 22, c2); break;
            case "Foyer": R(cx - 34, y - 4, 68, 4, c2); break;
            case "Attic": R(cx - 52, y - 30, 44, 30, c1); R(cx + 8, y - 22, 40, 22, c1); break;
            case "Storage": case "Cellar": R(cx - 56, y - 28, 40, 28, c1); R(cx - 10, y - 38, 42, 38, c1); R(cx + 38, y - 20, 26, 20, c1); break;
            case "Crawl Space": R(cx - 40, y - 14, 80, 14, c1); break;
            case "Boiler Room": c.fillStyle = c1; c.beginPath(); c.arc(cx, y - 26, 24, 0, 7); c.fill(); R(cx - 4, y - 66, 8, 22, c2); break;
            case "Wine Cellar": R(cx - 50, y - 52, 100, 52, c1); for (let i = 0; i < 4; i++) { c.fillStyle = c2; c.beginPath(); c.arc(cx - 36 + i * 24, y - 26, 7, 0, 7); c.fill(); } break;
            default: R(cx - 40, y - 24, 80, 24, c1);
        }
    }
    function drawItem(c, it) {
        const y = FLOOR_Y[it.f] - 16;
        c.save(); c.translate(it.x, y);
        const k = it.kind;
        if (k.indexOf("clue-") === 0) {
            c.fillStyle = "#fbbf24"; rr(c, -9, -9, 18, 18, 4); c.fill();
            c.fillStyle = "#0a0e17";
            const sub = k.slice(5);
            if (sub === "books") { c.fillRect(-5, -5, 3, 10); c.fillRect(-1, -5, 3, 10); c.fillRect(3, -5, 3, 10); }
            else if (sub === "clock") { c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); c.strokeStyle = "#fbbf24"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -3); c.stroke(); }
            else if (sub === "roses") { c.beginPath(); c.arc(-3, -2, 2.4, 0, 7); c.arc(3, -2, 2.4, 0, 7); c.arc(0, 3, 2.4, 0, 7); c.fill(); }
            else { c.fillRect(-5, -5, 10, 10); c.fillStyle = "#fbbf24"; c.fillRect(-5, -5, 10, 3); }
        } else if (k === "note") { c.fillStyle = "#e7eaf2"; c.fillRect(-7, -9, 14, 18); c.strokeStyle = "#8b93a7"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-4, -4); c.lineTo(4, -4); c.moveTo(-4, 0); c.lineTo(4, 0); c.moveTo(-4, 4); c.lineTo(2, 4); c.stroke(); }
        else if (k === "key") { c.strokeStyle = "#fde68a"; c.lineWidth = 2.5; c.beginPath(); c.arc(-3, -3, 4, 0, 7); c.moveTo(0, 0); c.lineTo(7, 7); c.moveTo(4, 4); c.lineTo(7, 1); c.stroke(); }
        else if (k === "battery") { c.fillStyle = "#34d399"; rr(c, -6, -8, 12, 16, 3); c.fill(); c.fillRect(-2, -11, 4, 3); }
        else if (k === "matches") { c.strokeStyle = "#d6b98c"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-4, 8); c.lineTo(4, -6); c.stroke(); c.fillStyle = "#f87171"; c.beginPath(); c.arc(4, -6, 3, 0, 7); c.fill(); }
        else if (k === "salts") { c.fillStyle = "#38bdf8"; rr(c, -7, -7, 14, 14, 3); c.fill(); c.fillStyle = "#0a0e17"; c.fillRect(-4, -2, 8, 4); }
        c.restore();
    }
    function drawPlayer(c, p, i) {
        const pos = rp["p" + i]; if (!pos) return;
        const col = i === 0 ? "#22d3ee" : "#fbbf24";
        const blink = p.inv > 0 && Math.floor(clock * 12) % 2 === 0;
        c.globalAlpha = blink ? 0.35 : 1;
        c.fillStyle = col; rr(c, pos.x - 8, pos.y - 30, 16, 28, 7); c.fill();
        c.fillStyle = "#e7eaf2"; c.beginPath(); c.arc(pos.x, pos.y - 37, 7, 0, 7); c.fill();
        c.fillStyle = "#0a0e17"; c.fillRect(pos.x + p.face * 2 - 1, pos.y - 39, 3, 3);
        if (p.flash && (p.battery > 0 || state.cheats.power)) { c.fillStyle = "#fde68a"; c.fillRect(pos.x + p.face * 9 - 3, pos.y - 24, 7, 5); }
        if (p.matchT > 0) {
            const fx = pos.x - p.face * 11;
            c.fillStyle = "#fb923c"; c.beginPath(); c.arc(fx, pos.y - 26, 3.5 + Math.sin(clock * 20) * 1, 0, 7); c.fill();
        }
        c.font = "600 10px system-ui, sans-serif"; c.textAlign = "center";
        c.fillStyle = i === playerIndex ? col : "#8b93a7";
        c.fillText(i === playerIndex ? (online ? playerName : "You") : "Partner", pos.x, pos.y - 50);
        c.globalAlpha = 1;
    }
    function drawGhost(c) {
        const pos = rp.ghost; if (!pos) return;
        const g = state.ghost;
        const bob = Math.sin(clock * 2.2) * 5;
        const x = pos.x, y = pos.y - 26 + bob;
        c.globalAlpha = g.dormT > 0 ? 0.35 : 0.8;
        c.fillStyle = "#c7d2fe";
        c.beginPath();
        c.moveTo(x - 20, y + 18);
        c.lineTo(x - 20, y - 4);
        c.arc(x, y - 4, 20, Math.PI, 0);
        c.lineTo(x + 20, y + 18);
        for (let i = 0; i < 4; i++) c.quadraticCurveTo(x + 20 - 10 * i - 5, y + 12 + (i % 2 ? 6 : 0), x + 20 - 10 * (i + 1), y + 18);
        c.closePath(); c.fill();
        c.fillStyle = "#1e1b4b";
        c.beginPath(); c.arc(x - 7, y - 6, 3, 0, 7); c.arc(x + 7, y - 6, 3, 0, 7); c.fill();
        if (g.dormT > 0) { c.font = "700 12px system-ui"; c.fillStyle = "#8b93a7"; c.fillText("z z", x + 22, y - 18); }
        c.globalAlpha = 1;
    }

    function draw(dt) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0a0e17"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        if (!state) {
            ctx.fillStyle = "#8b93a7"; ctx.font = "500 15px system-ui, sans-serif"; ctx.textAlign = "center";
            ctx.fillText("Waiting for the host to open the house...", VIEW_W / 2, VIEW_H / 2);
            return;
        }
        const lv = state.level, me = state.players[playerIndex];
        /* smooth positions (guests interpolate between snapshots) */
        const k = isHost ? 1 : 1 - Math.exp(-dt * 12);
        const targets = { p0: { x: state.players[0].x, y: playerY(state.players[0]) }, ghost: { x: state.ghost.x, y: ghostY(state.ghost) } };
        if (state.playerCount > 1) targets.p1 = { x: state.players[1].x, y: playerY(state.players[1]) };
        for (const id in targets) {
            if (!rp[id]) rp[id] = { x: targets[id].x, y: targets[id].y };
            rp[id].x += (targets[id].x - rp[id].x) * k;
            rp[id].y += (targets[id].y - rp[id].y) * k;
        }
        const mePos = rp["p" + playerIndex];
        const tx = Math.max(0, Math.min(lv.worldW - VIEW_W, mePos.x - VIEW_W / 2));
        const ty = Math.max(0, Math.min(WORLD_H - VIEW_H, mePos.y - VIEW_H / 2 - 30));
        const ck = 1 - Math.exp(-dt * 6);
        cam.x += (tx - cam.x) * ck; cam.y += (ty - cam.y) * ck;

        ctx.save();
        ctx.translate(-cam.x, -cam.y);
        /* house shell */
        lv.floors.forEach((fl) => {
            const y = fl.y;
            ctx.fillStyle = "#141a2b"; ctx.fillRect(fl.x0 - 10, y, fl.x1 - fl.x0 + 20, 10);
            ctx.strokeStyle = "#26304a"; ctx.lineWidth = 2;
            ctx.strokeRect(fl.x0 - 10, y - ROOM_H, fl.x1 - fl.x0 + 20, ROOM_H + 10);
        });
        const attic = lv.floors[0];
        ctx.strokeStyle = "#26304a"; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(attic.x0 - 24, attic.y - ROOM_H);
        ctx.lineTo((attic.x0 + attic.x1) / 2, attic.y - ROOM_H - 42);
        ctx.lineTo(attic.x1 + 24, attic.y - ROOM_H); ctx.stroke();
        /* rooms */
        lv.rooms.forEach((rm) => {
            const y = FLOOR_Y[rm.f];
            if (rm.lampOn) { ctx.fillStyle = "#221d10"; ctx.fillRect(rm.x0, y - ROOM_H, rm.x1 - rm.x0, ROOM_H); }
            if (rm.i > 0) { ctx.strokeStyle = "#26304a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rm.x0, y - ROOM_H); ctx.lineTo(rm.x0, y); ctx.stroke(); }
            ctx.font = "600 10px system-ui, sans-serif"; ctx.textAlign = "left";
            ctx.fillStyle = rm.lampOn ? "#a89968" : "#4d5670";
            ctx.fillText(rm.type.toUpperCase(), rm.x0 + 10, y - ROOM_H + 16);
            furniture(ctx, rm);
            if (rm.sw) {
                ctx.fillStyle = "#2c3852"; ctx.fillRect(rm.sw.x - 5, y - 66, 10, 16);
                ctx.fillStyle = rm.lampOn ? "#fbbf24" : "#4d5670";
                ctx.fillRect(rm.sw.x - 3, rm.lampOn ? y - 64 : y - 56, 6, 6);
            }
            if (rm.lampOn) {
                const cx = (rm.x0 + rm.x1) / 2;
                ctx.strokeStyle = "#4d5670"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y - ROOM_H); ctx.lineTo(cx, y - ROOM_H + 14); ctx.stroke();
                ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(cx, y - ROOM_H + 20, 6, 0, 7); ctx.fill();
            }
        });
        /* stairs */
        lv.stairs.forEach((s) => {
            const yT = FLOOR_Y[s.fTop], yB = FLOOR_Y[s.fBot];
            ctx.strokeStyle = s.locked ? "#3d3050" : "#33405f"; ctx.lineWidth = 3;
            ctx.beginPath();
            const steps = 6;
            for (let i = 0; i <= steps; i++) {
                const sx = s.x - STAIR_HALF + (2 * STAIR_HALF * i) / steps;
                const sy = yB + ((yT - yB) * i) / steps;
                if (i === 0) ctx.moveTo(sx, sy); else { ctx.lineTo(sx, sy + (yT - yB) / steps); ctx.lineTo(sx, sy); }
            }
            ctx.stroke();
            if (s.locked) {
                const lx = s.x - STAIR_HALF, ly = yB - 14;
                ctx.strokeStyle = "#f87171"; ctx.lineWidth = 2.5;
                ctx.strokeRect(lx - 7, ly - 4, 14, 11);
                ctx.beginPath(); ctx.arc(lx, ly - 4, 5, Math.PI, 0); ctx.stroke();
            }
        });
        /* doors */
        lv.doors.forEach((d) => {
            const y = FLOOR_Y[d.f];
            if (d.open) {
                ctx.strokeStyle = "#3b476b"; ctx.lineWidth = 2;
                ctx.strokeRect(d.x - 5, y - 72, 10, 72);
                ctx.globalAlpha = 0.5; ctx.fillStyle = "#3b476b";
                ctx.fillRect(d.x - 5, y - 72, 3, 72); ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = "#46536f"; rr(ctx, d.x - 6, y - 74, 12, 74, 3); ctx.fill();
                ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(d.x + 2, y - 36, 2, 0, 7); ctx.fill();
            }
        });
        /* exit */
        {
            const y = FLOOR_Y[lv.exit.f], x = lv.exit.x;
            ctx.fillStyle = state.phase === "won" ? "#14532d" : "#3f2d12";
            rr(ctx, x - 22, y - 96, 44, 96, 5); ctx.fill();
            ctx.strokeStyle = state.phase === "won" ? "#4ade80" : "#a16207"; ctx.lineWidth = 2;
            rr(ctx, x - 22, y - 96, 44, 96, 5); ctx.stroke();
            ctx.fillStyle = "#0a0e17"; ctx.fillRect(x - 9, y - 72, 18, 24);
            ctx.fillStyle = "#fde68a";
            for (let i = 0; i < 6; i++) ctx.fillRect(x - 6 + (i % 3) * 5, y - 68 + Math.floor(i / 3) * 8, 3, 3);
            ctx.font = "700 10px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#fde68a";
            ctx.fillText("EXIT", x, y - 102);
        }
        /* items */
        lv.items.forEach((it) => { if (!it.taken) drawItem(ctx, it); });
        /* actors */
        for (let i = 0; i < state.playerCount; i++) drawPlayer(ctx, state.players[i], i);
        drawGhost(ctx);
        /* hover / in-range highlight */
        if (hover && hover.ok && state.phase === "playing") {
            ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(hover.x, FLOOR_Y[hover.f] - 24, 24, 0, 7); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();

        /* lighting pass */
        if (!state.cheats.light) {
            lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            lctx.clearRect(0, 0, VIEW_W, VIEW_H);
            lctx.fillStyle = "rgba(4,6,13,0.93)"; lctx.fillRect(0, 0, VIEW_W, VIEW_H);
            lctx.globalCompositeOperation = "destination-out";
            lctx.save(); lctx.translate(-cam.x, -cam.y);
            const hole = (x, y, r, a) => {
                const g = lctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, "rgba(0,0,0," + a + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
                lctx.fillStyle = g; lctx.beginPath(); lctx.arc(x, y, r, 0, 7); lctx.fill();
            };
            lv.rooms.forEach((rm) => {
                if (!rm.lampOn) return;
                lctx.fillStyle = "rgba(0,0,0,0.96)";
                lctx.fillRect(rm.x0, FLOOR_Y[rm.f] - ROOM_H, rm.x1 - rm.x0, ROOM_H);
            });
            for (let i = 0; i < state.playerCount; i++) {
                const p = state.players[i], pos = rp["p" + i];
                hole(pos.x, pos.y - 22, 68, 0.85);
                if (p.flash && (p.battery > 0 || state.cheats.power)) {
                    lctx.save();
                    lctx.beginPath();
                    lctx.moveTo(pos.x, pos.y - 24);
                    lctx.lineTo(pos.x + p.face * 235, pos.y - 78);
                    lctx.lineTo(pos.x + p.face * 235, pos.y + 26);
                    lctx.closePath(); lctx.clip();
                    hole(pos.x + p.face * 90, pos.y - 24, 210, 0.95);
                    lctx.restore();
                }
                if (p.matchT > 0) hole(pos.x, pos.y - 24, 120 + Math.sin(clock * 18) * 6, 0.95);
            }
            hole(rp.ghost.x, rp.ghost.y - 26, 44, 0.5);
            hole(lv.exit.x, FLOOR_Y[lv.exit.f] - 50, 42, 0.45);
            lv.items.forEach((it) => { if (!it.taken) hole(it.x, FLOOR_Y[it.f] - 16, 17, 0.4); });
            lctx.restore();
            lctx.globalCompositeOperation = "source-over";
            ctx.drawImage(light, 0, 0, VIEW_W, VIEW_H);
        }

        /* minimap */
        {
            const mw = 150, mx = VIEW_W - mw - 16, my = 14, sc = mw / lv.worldW;
            ctx.fillStyle = "#0d1220cc"; rr(ctx, mx - 10, my - 8, mw + 20, 4 * 16 + 10, 8); ctx.fill();
            ctx.font = "600 9px system-ui"; ctx.textAlign = "left";
            const letters = ["A", "U", "G", "B"];
            lv.floors.forEach((fl, f) => {
                ctx.fillStyle = "#4d5670"; ctx.fillText(letters[f], mx - 8, my + f * 16 + 8);
                lv.rooms.forEach((rm) => {
                    if (rm.f !== f) return;
                    ctx.fillStyle = rm.lampOn ? "#3a331a" : "#1b2236";
                    ctx.fillRect(mx + rm.x0 * sc, my + f * 16, (rm.x1 - rm.x0) * sc - 1, 10);
                });
            });
            ctx.fillStyle = "#fde68a"; ctx.fillRect(mx + lv.exit.x * sc - 1, my + lv.exit.f * 16, 3, 10);
            for (let i = 0; i < state.playerCount; i++) {
                const p = state.players[i];
                ctx.fillStyle = i === 0 ? "#22d3ee" : "#fbbf24";
                ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.f * 16 + 5, 3, 0, 7); ctx.fill();
            }
            ctx.fillStyle = "#f87171";
            ctx.beginPath(); ctx.arc(mx + state.ghost.x * sc, my + state.ghost.f * 16 + 5, 3 + Math.sin(clock * 4), 0, 7); ctx.fill();
        }
    }

    /* --------------------------- HUD & overlays --------------------------- */

    const hudCache = {};
    const setTxt = (el, key, val) => { if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; } };
    const fmt = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

    function syncHud() {
        if (!state) { setTxt(statusEl, "status", "Waiting for host..."); return; }
        const me = state.players[playerIndex];
        let dots = "";
        for (let i = 0; i < NERVES; i++)
            dots += '<span class="hh-dot" style="background:' + (i < state.nerves ? "#f87171" : "#2a3350") + '"></span>';
        if (hudCache.nerves !== dots) { hudCache.nerves = dots; hud.nerves.innerHTML = dots; }
        setTxt(hud.time, "time", fmt(Math.max(0, state.timeLeft)));
        const bw = Math.round(me.battery) + "%";
        if (hudCache.batt !== bw) { hudCache.batt = bw; hud.batt.style.width = bw; hud.batt.style.background = me.battery > 30 ? "#22d3ee" : "#f87171"; }
        setTxt(hud.matches, "matches", state.cheats.power ? "\u221e" : String(me.matches));
        const found = CLUE_KINDS.filter((k) => state.found[k] !== null && state.found[k] !== undefined).length;
        setTxt(hud.clues, "clues", found + "/4");
        const g = state.ghost;
        let gt;
        if (state.cheats.freeze) gt = "frozen";
        else if (g.dormT > 0) gt = "dormant " + Math.ceil(g.dormT) + "s";
        else {
            const near = Math.abs(g.x - me.x) < 160 && Math.abs(ghostY(g) - playerY(me)) < 80;
            gt = near ? "CLOSE!" : g.mood === "hunt" ? "hunting" : g.mood === "flee" ? "fleeing" : "roaming";
        }
        setTxt(hud.ghost, "ghost", gt);
        hud.ghost.style.color = gt === "CLOSE!" ? "#f87171" : "";
        setTxt(statusEl, "status",
            state.phase === "intro" ? "Ready" : state.phase === "playing" ? (online ? "Live" : "Playing") : state.phase === "won" ? "Escaped" : "Caught");
    }

    function renderJournal() {
        const labels = { books: "Books clue", clock: "Clock clue", roses: "Roses clue", calendar: "Calendar clue" };
        const rows = CLUE_KINDS.map((k) => {
            const v = state.found[k];
            const shown = v !== null && v !== undefined ? v : state.cheats.reveal ? state.level.digits[k] + " (cheat)" : null;
            return "<li>" + labels[k] + " - " + (shown !== null ? "digit <b>" + shown + "</b>" : "not found") + "</li>";
        });
        rows.push("<li>Order: " + (state.orderKnown || state.cheats.reveal ? "<b>books, clock, roses, calendar</b>" : "unknown - find the torn note") + "</li>");
        rows.push("<li>Basement key: " + (state.hasKey ? "<b>found</b>" : "missing") + "</li>");
        if (state.cheats.reveal) rows.push("<li>Code: <b>" + codeOf(state.level.digits) + "</b></li>");
        $('[data-el="journalList"]').innerHTML = rows.join("");
    }
    function updatePad() {
        root.querySelectorAll(".hh-digits span").forEach((el, i) => { el.textContent = ui.pad[i] || ""; });
        $('[data-el="padMsg"]').textContent = ui.padMsg;
    }
    function syncOverlays() {
        const ph = state ? state.phase : "waiting";
        ov.help.hidden = !(ui.help || ph === "intro");
        $('[data-el="startBtn"]').hidden = ph !== "intro";
        $('[data-act="closehelp"]').hidden = ph === "intro";
        ov.journal.hidden = !ui.journal || ph === "intro";
        ov.keypad.hidden = !ui.keypad || ph !== "playing";
        ov.cheats.hidden = !ui.cheats;
        ov.end.hidden = !(ph === "won" || ph === "lost");
        if (ui.journal && state) {
            const sig = JSON.stringify([state.found, state.orderKnown, state.hasKey, state.cheats.reveal]);
            if (hudCache.journal !== sig) { hudCache.journal = sig; renderJournal(); }
        }
        if (ui.cheats && state) root.querySelectorAll("[data-cheat]").forEach((c) => { c.checked = Boolean(state.cheats[c.dataset.cheat]); });
    }
    function localToast(text) { toastEl.textContent = text; toastT = 2.4; }
    function openKeypad() { ui.pad = ""; ui.padMsg = "Enter the 4-digit code."; ui.keypad = true; updatePad(); }
    function padPress(k) {
        if (k === "clr") { ui.pad = ""; ui.padMsg = "Enter the 4-digit code."; }
        else if (k === "ok") {
            if (ui.pad.length !== 4) ui.padMsg = "You need all 4 digits.";
            else { submitAction({ type: "code", value: ui.pad }); ui.pad = ""; ui.padMsg = "Checking..."; }
        } else if (ui.pad.length < 4) ui.pad += k;
        updatePad();
    }
    function watchState() {
        if (!state) return;
        if (state.toast.id !== seen.toast) {
            seen.toast = state.toast.id;
            if (state.toast.text) { toastEl.textContent = state.toast.text; toastT = 3.4; }
        }
        if (state.fx.scare !== seen.scare) {
            if (seen.scare >= 0) flashT = 0.8;
            seen.scare = state.fx.scare;
        }
        if (state.fx.wrong !== seen.wrong) {
            if (seen.wrong >= 0) {
                ui.padMsg = "Wrong code - try again."; ui.pad = ""; updatePad();
                const card = $('[data-el="padCard"]');
                card.classList.remove("hh-shake"); void card.offsetWidth; card.classList.add("hh-shake");
            }
            seen.wrong = state.fx.wrong;
        }
        if (state.phase !== seen.phase) {
            seen.phase = state.phase;
            if (state.phase === "won" || state.phase === "lost") {
                const win = state.phase === "won";
                $('[data-el="endTitle"]').textContent = win ? "You escaped!" : "The house kept you";
                $('[data-el="endTitle"]').style.color = win ? "#4ade80" : "#f87171";
                if (win && !state.cheatsUsed && (best === null || state.timeUsed < best)) {
                    best = state.timeUsed;
                    try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
                }
                const found = CLUE_KINDS.filter((k) => state.found[k] !== null && state.found[k] !== undefined).length;
                $('[data-el="endSub"]').textContent = state.result + " Clues " + found + "/4 · Time " + fmt(state.timeUsed) +
                    (best !== null ? " · Best " + fmt(best) : "") + (state.cheatsUsed ? " · cheats used" : "");
                ui.keypad = false; ui.cheats = false; ui.journal = false;
            }
            if (state.phase === "playing") { ui.pad = ""; ui.padMsg = "Enter the 4-digit code."; updatePad(); }
        }
    }

    /* --------------------------- input --------------------------- */

    const held = { key: { l: 0, r: 0, u: 0, d: 0 }, touch: { l: 0, r: 0, u: 0, d: 0 } };
    let lastSig = "";
    function refreshInput() {
        const i = {
            l: held.key.l || held.touch.l ? 1 : 0, r: held.key.r || held.touch.r ? 1 : 0,
            u: held.key.u || held.touch.u ? 1 : 0, d: held.key.d || held.touch.d ? 1 : 0,
        };
        const sig = "" + i.l + i.r + i.u + i.d;
        if (sig === lastSig) return;
        lastSig = sig;
        submitAction({ type: "input", input: i });
    }
    function interactLocal() {
        if (!state || state.phase !== "playing") return;
        const me = state.players[playerIndex];
        const t = nearestTarget(me);
        if (t && t.kind === "exit") { openKeypad(); return; }
        submitAction({ type: "interact", id: t ? t.id : null });
    }
    const KEYMAP = {
        ArrowLeft: "l", a: "l", A: "l", ArrowRight: "r", d: "r", D: "r",
        ArrowUp: "u", w: "u", W: "u", ArrowDown: "d", s: "d", S: "d",
    };
    function onKeyDown(e) {
        if (destroyed || !root.isConnected || !state) return;
        if (ui.keypad && state.phase === "playing") {
            if (/^[0-9]$/.test(e.key)) { e.preventDefault(); padPress(e.key); return; }
            if (e.key === "Enter") { e.preventDefault(); padPress("ok"); return; }
            if (e.key === "Backspace") { e.preventDefault(); padPress("clr"); return; }
            if (e.key === "Escape") { e.preventDefault(); ui.keypad = false; return; }
            return;
        }
        if (e.key === "Escape") { ui.help = false; ui.journal = false; ui.cheats = false; return; }
        const k = e.key.toLowerCase();
        if (k === "e" || e.key === "Enter") { e.preventDefault(); if (!e.repeat) interactLocal(); return; }
        if (k === "f") { if (!e.repeat) submitAction({ type: "flash" }); return; }
        if (k === "m") { if (!e.repeat) submitAction({ type: "match" }); return; }
        if (k === "j") { ui.journal = !ui.journal; return; }
        if (k === "h" || e.key === "?") { ui.help = !ui.help; return; }
        if (k === "c") { ui.cheats = !ui.cheats; return; }
        const dir = KEYMAP[e.key];
        if (dir) { e.preventDefault(); held.key[dir] = 1; refreshInput(); }
    }
    function onKeyUp(e) {
        const dir = KEYMAP[e.key];
        if (dir) { held.key[dir] = 0; refreshInput(); }
    }
    function onBlur() {
        held.key = { l: 0, r: 0, u: 0, d: 0 }; held.touch = { l: 0, r: 0, u: 0, d: 0 };
        refreshInput();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    /* mouse: hover + click interactables on the canvas */
    function canvasWorld(e) {
        const rect = cv.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) * VIEW_W) / rect.width + cam.x,
            y: ((e.clientY - rect.top) * VIEW_H) / rect.height + cam.y,
        };
    }
    function hitTest(w) {
        if (!state) return null;
        const lv = state.level;
        for (const it of lv.items) {
            if (it.taken) continue;
            const y = FLOOR_Y[it.f];
            if (Math.abs(w.x - it.x) < 20 && w.y > y - 42 && w.y < y + 6) return { kind: "item", id: it.id, x: it.x, f: it.f, r: 42 };
        }
        for (const rm of lv.rooms) {
            if (!rm.sw) continue;
            const y = FLOOR_Y[rm.f];
            if (Math.abs(w.x - rm.sw.x) < 16 && w.y > y - 82 && w.y < y - 40) return { kind: "switch", id: rm.id, x: rm.sw.x, f: rm.f, r: 42 };
        }
        for (const d of lv.doors) {
            const y = FLOOR_Y[d.f];
            if (Math.abs(w.x - d.x) < 16 && w.y > y - 80 && w.y < y + 6) return { kind: "door", id: d.id, x: d.x, f: d.f, r: 46 };
        }
        {
            const y = FLOOR_Y[lv.exit.f];
            if (Math.abs(w.x - lv.exit.x) < 28 && w.y > y - 104 && w.y < y + 6) return { kind: "exit", id: "exit", x: lv.exit.x, f: lv.exit.f, r: 62 };
        }
        for (const s of lv.stairs) {
            const yB = FLOOR_Y[s.fBot], yT = FLOOR_Y[s.fTop];
            if (Math.abs(w.x - (s.x - STAIR_HALF)) < 26 && w.y > yB - 60 && w.y < yB + 8) return { kind: "stair", id: s.id, dir: "up", x: s.x - STAIR_HALF, f: s.fBot, r: 30 };
            if (Math.abs(w.x - (s.x + STAIR_HALF)) < 26 && w.y > yT - 60 && w.y < yT + 8) return { kind: "stair", id: s.id, dir: "down", x: s.x + STAIR_HALF, f: s.fTop, r: 30 };
        }
        return null;
    }
    function onPointerMove(e) {
        if (!state || state.phase !== "playing") { hover = null; cv.style.cursor = "default"; return; }
        const h = hitTest(canvasWorld(e));
        if (h) {
            const me = state.players[playerIndex];
            h.ok = !me.stair && h.f === me.f && Math.abs(h.x - me.x) <= h.r;
        }
        hover = h;
        cv.style.cursor = h && h.ok ? "pointer" : "default";
    }
    function onPointerDown(e) {
        if (!state || state.phase !== "playing") return;
        const h = hitTest(canvasWorld(e));
        if (!h) return;
        const me = state.players[playerIndex];
        if (me.stair) { localToast("Finish the stairs first."); return; }
        if (h.f !== me.f || Math.abs(h.x - me.x) > h.r) { localToast("Move closer to interact."); return; }
        if (h.kind === "exit") { openKeypad(); return; }
        if (h.kind === "stair") { submitAction({ type: "stair", id: h.id, dir: h.dir }); return; }
        submitAction({ type: "interact", id: h.id });
    }
    cv.addEventListener("pointermove", onPointerMove);
    cv.addEventListener("pointerdown", onPointerDown);

    /* touch: virtual d-pad + action buttons */
    root.querySelectorAll("[data-vk]").forEach((b) => {
        const k = b.dataset.vk;
        const down = (e) => { e.preventDefault(); held.touch[k] = 1; refreshInput(); };
        const up = (e) => { e.preventDefault(); held.touch[k] = 0; refreshInput(); };
        b.addEventListener("pointerdown", down);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("pointerleave", up);
    });

    /* buttons */
    function onClick(e) {
        const el = e.target.closest("[data-act],[data-k],[data-exit],[data-va]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.dataset.k) { padPress(el.dataset.k); return; }
        if (el.dataset.va === "interact") { interactLocal(); return; }
        if (el.dataset.va === "flash") { submitAction({ type: "flash" }); return; }
        if (el.dataset.va === "match") { submitAction({ type: "match" }); return; }
        switch (el.dataset.act) {
            case "start": ui.help = false; submitAction({ type: "start" }); break;
            case "restart": ui.keypad = false; ui.journal = false; ui.cheats = false; submitAction({ type: "restart" }); break;
            case "journal": ui.journal = !ui.journal; break;
            case "help": ui.help = !ui.help; break;
            case "cheats": ui.cheats = !ui.cheats; break;
            case "closehelp": ui.help = false; break;
            case "closejournal": ui.journal = false; break;
            case "closecheats": ui.cheats = false; break;
            case "closepad": ui.keypad = false; break;
            case "cheatTime": submitAction({ type: "cheat", key: "time" }); break;
        }
    }
    function onChange(e) {
        const c = e.target.closest("[data-cheat]");
        if (c) submitAction({ type: "cheat", key: c.dataset.cheat });
    }
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);

    /* --------------------------- main loop --------------------------- */

    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000; lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;
        clock += dt;
        if (isHost) {
            simulate(dt);
            if (online && state && state.phase === "playing") {
                pubAcc += dt;
                if (pubAcc >= 0.18) { pubAcc = 0; publishNow(); }
            }
        }
        watchState();
        syncHud();
        syncOverlays();
        draw(dt);
        if (toastT > 0) { toastT -= dt; toastEl.style.opacity = toastT <= 0 ? "0" : String(Math.min(1, toastT / 0.4)); }
        if (flashT > 0) { flashT -= dt; flashEl.style.opacity = String(Math.max(0, flashT / 0.8) * 0.9); }
        else flashEl.style.opacity = "0";
    }

    /* --------------------------- wiring --------------------------- */

    if (online) {
        unsubs.push(room.onRoom((next) => { roomData = next; }));
        if (isHost) {
            state = freshState((Math.random() * 0x7fffffff) | 0);
            publishNow();
            unsubs.push(room.onAction((a) => applyAction(a, 1)));
        } else {
            unsubs.push(room.onState((s) => { if (s) { state = normalize(s); } }));
        }
    } else {
        state = freshState((Math.random() * 0x7fffffff) | 0);
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            root.removeEventListener("click", onClick);
            root.removeEventListener("change", onChange);
            cv.removeEventListener("pointermove", onPointerMove);
            cv.removeEventListener("pointerdown", onPointerDown);
            unsubs.forEach((u) => { if (typeof u === "function") u(); });
        },
    };
}