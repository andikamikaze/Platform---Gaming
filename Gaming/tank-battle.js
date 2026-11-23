/* ==== GAME: tank-battle.js ==== */
/*
  TANK BATTLE - duel tank berbasis giliran (turn-based), murni SVG.
  - Simpan sebagai games/tank-battle.js (id META harus = nama file tanpa .js).
  - Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs
  - Mode "ai"  : lawan bot. Coin toss acak menentukan siapa jalan duluan.
  - Mode "room": multiplayer host-authoritative. Posisi base pemain diacak.
  - Peta dibuat procedural (5 tema) dan DIJAMIN bisa diselesaikan.
*/

export const META = {
    id: "tank-battle", // harus sama dengan nama file (tanpa .js)
    name: "Tank Battle",
    category: "action",
    catLabel: "Action",
    desc: "Turn-based tank duel on random, always-solvable maps. Spend AP to move and fire, breach brick walls, and destroy the enemy tank. A coin toss decides who starts.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="16" width="32" height="24" rx="4" fill="#4f46e5"/><rect x="5" y="18" width="4" height="20" rx="2" fill="#312e81" stroke="none"/><rect x="39" y="18" width="4" height="20" rx="2" fill="#312e81" stroke="none"/><rect x="17" y="8" width="14" height="12" rx="3" fill="#818cf8"/><path d="M24 8V1" stroke="#fbbf24" stroke-width="4"/><circle cx="42" cy="10" r="5" fill="#ef4444"/><path d="M39.5 10h5" stroke="#0b1020" stroke-width="1.6"/><path d="M42 7.5v5" stroke="#0b1020" stroke-width="1.6"/></svg>',
    bg: ["#fecaca", "#fca5a5"],
    bestKey: "tankBattleBest",
};

/* ================= LOGIKA MURNI (tanpa DOM, mudah diuji) ================= */
const COLS = 17, ROWS = 13, CELL = 40;          // arena 680x520 (lebih luas dari versi lama)
const BW = COLS * CELL, BH = ROWS * CELL;
const EMPTY = 0, BRICK2 = 1, BRICK1 = 2, STEEL = 3, WATER = 4;
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0=atas 1=kanan 2=bawah 3=kiri
const MAX_HP = 4;
const AP_TURN = 4, COST_MOVE = 1, COST_SHOT = 3; // giliran santai: 4 AP, gerak 1 AP, tembak 3 AP
const SPAWNS = [[1, 6], [15, 6]];                // base barat & timur
const THEMES = ["Brickyard", "Steel Cross", "Riverbed", "Ruins", "Bunker Line"];
const COLORS = ["Indigo", "Red"];
const MAX_TURNS = 240;                           // pengaman stalemate

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const idx = (c, r) => r * COLS + c;
const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/* Generator level acak: simetris cermin (adil untuk kedua pemain).
   Bata bisa dihancurkan, baja/air memblok tank.
   Setelah generate, BFS memverifikasi kedua base terhubung
   (bata dianggap bisa dilewati karena bisa dihancurkan).
   Jika gagal, koridor tengah dibuka -> level SELALU bisa diselesaikan. */
function genLevel(seed) {
    const rand = rng(seed);
    const t = Math.floor(rand() * THEMES.length);
    const cells = new Array(COLS * ROWS).fill(EMPTY);
    const put = (c, r, v) => { cells[idx(c, r)] = v; cells[idx(COLS - 1 - c, r)] = v; };
    const half = Math.ceil(COLS / 2);
    const scatter = (p, v) => {
        for (let r = 1; r < ROWS - 1; r++)
            for (let c = 1; c < half; c++)
                if (cells[idx(c, r)] === EMPTY && rand() < p) put(c, r, v);
    };
    if (t === 0) { // Brickyard
        scatter(0.24, BRICK2);
        for (let k = 0; k < 2; k++) {
            const br = 2 + Math.floor(rand() * (ROWS - 4));
            const bc = 2 + Math.floor(rand() * 4);
            const len = 2 + Math.floor(rand() * 3);
            for (let i = 0; i < len && bc + i < half; i++) put(bc + i, br, BRICK2);
        }
    } else if (t === 1) { // Steel Cross
        for (let r = 3; r <= 9; r++) if (r !== 6 && rand() < 0.85) put(8, r, STEEL);
        for (let c = 4; c <= 8; c++) if (rand() < 0.8) put(c, 6, STEEL);
        scatter(0.16, BRICK2);
    } else if (t === 2) { // Riverbed
        const gaps = new Set([2 + Math.floor(rand() * 4), 7 + Math.floor(rand() * 4)]);
        for (let r = 1; r < ROWS - 1; r++) if (!gaps.has(r)) put(8, r, WATER);
        for (let r = 1; r < ROWS - 1; r++) if (!gaps.has(r) && rand() < 0.45) put(6, r, WATER);
        scatter(0.14, BRICK2);
    } else if (t === 3) { // Ruins
        for (let r = 1; r < ROWS - 1; r++)
            for (let c = 1; c < half; c++) {
                const x = rand();
                if (x < 0.18) put(c, r, BRICK2);
                else if (x < 0.25) put(c, r, STEEL);
                else if (x < 0.30) put(c, r, WATER);
            }
    } else { // Bunker Line
        const g1 = 2 + Math.floor(rand() * 3), g2 = 8 + Math.floor(rand() * 3);
        for (let r = 2; r <= 10; r++) if (r !== g1 && r !== g2) put(4, r, STEEL);
        const g3 = 3 + Math.floor(rand() * 7);
        for (let r = 2; r <= 10; r++) if (r !== g3) put(6, r, BRICK2);
        scatter(0.10, BRICK2);
    }
    // area spawn 3x3 selalu bersih
    for (const [sc, sr] of SPAWNS)
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++)
                if (inGrid(sc + dc, sr + dr)) cells[idx(sc + dc, sr + dr)] = EMPTY;
    // jamin level bisa diselesaikan
    if (!connected(cells, SPAWNS[0], SPAWNS[1]))
        for (let c = SPAWNS[0][0]; c <= SPAWNS[1][0]; c++) cells[idx(c, 6)] = EMPTY;
    return { seed: seed >>> 0, theme: THEMES[t], cells };
}

/* BFS keterhubungan: bata dianggap bisa dilewati (bisa dihancurkan). */
function connected(cells, a, b) {
    const seen = new Array(COLS * ROWS).fill(false);
    const q = [a]; seen[idx(a[0], a[1])] = true;
    while (q.length) {
        const [c, r] = q.pop();
        if (c === b[0] && r === b[1]) return true;
        for (const [dc, dr] of DIRV) {
            const nc = c + dc, nr = r + dr;
            if (!inGrid(nc, nr) || seen[idx(nc, nr)]) continue;
            const v = cells[idx(nc, nr)];
            if (v === STEEL || v === WATER) continue;
            seen[idx(nc, nr)] = true; q.push([nc, nr]);
        }
    }
    return false;
}

/* BFS jarak untuk gerak (hanya petak kosong; tank lain memblok). */
function bfsDist(cells, sc, sr, blocked) {
    const dist = new Array(COLS * ROWS).fill(-1);
    const block = new Set(blocked || []);
    dist[idx(sc, sr)] = 0;
    const q = [[sc, sr]];
    for (let h = 0; h < q.length; h++) {
        const [c, r] = q[h];
        for (const [dc, dr] of DIRV) {
            const nc = c + dc, nr = r + dr;
            if (!inGrid(nc, nr)) continue;
            const i = idx(nc, nr);
            if (dist[i] !== -1 || block.has(i) || cells[i] !== EMPTY) continue;
            dist[i] = dist[idx(c, r)] + 1; q.push([nc, nr]);
        }
    }
    return dist;
}

/* Daftar arah langkah terpendek dari (sc,sr) ke (tc,rc), atau null. */
function pathDirs(cells, sc, sr, tc, rc, blocked) {
    if (!inGrid(tc, rc) || cells[idx(tc, rc)] !== EMPTY) return null;
    if (sc === tc && sr === rc) return [];
    const block = new Set(blocked || []);
    if (block.has(idx(tc, rc))) return null;
    const prev = new Array(COLS * ROWS).fill(-1);
    const pdir = new Array(COLS * ROWS).fill(-1);
    prev[idx(sc, sr)] = idx(sc, sr);
    const q = [[sc, sr]];
    for (let h = 0; h < q.length; h++) {
        const [c, r] = q[h];
        for (let d = 0; d < 4; d++) {
            const nc = c + DIRV[d][0], nr = r + DIRV[d][1];
            if (!inGrid(nc, nr)) continue;
            const i = idx(nc, nr);
            if (prev[i] !== -1 || block.has(i) || cells[i] !== EMPTY) continue;
            prev[i] = idx(c, r); pdir[i] = d;
            if (nc === tc && nr === rc) {
                const dirs = [];
                let cur = i;
                while (cur !== idx(sc, sr)) { dirs.push(pdir[cur]); cur = prev[cur]; }
                return dirs.reverse();
            }
            q.push([nc, nr]);
        }
    }
    return null;
}

/* Raycast peluru: lurus satu arah. Air DILEWATI peluru; bata/baja/tank menghentikan. */
function raycast(cells, tanks, c, r, dir) {
    const [dc, dr] = DIRV[dir];
    let cc = c + dc, rr = r + dr, steps = 0, lastC = c, lastR = r;
    while (inGrid(cc, rr)) {
        const v = cells[idx(cc, rr)];
        if (v === STEEL) return { hit: "steel", tank: -1, impact: [cc, rr], steps };
        if (v === BRICK2 || v === BRICK1) return { hit: "brick", tank: -1, impact: [cc, rr], steps };
        const ti = tanks.findIndex((t) => t.alive && t.c === cc && t.r === rr);
        if (ti >= 0) return { hit: "tank", tank: ti, impact: [cc, rr], steps };
        lastC = cc; lastR = rr; steps++;
        cc += dc; rr += dr;
    }
    return { hit: "none", tank: -1, impact: [lastC, lastR], steps };
}

function pushLog(state, msg) {
    state.log.push(msg);
    if (state.log.length > 6) state.log.shift();
}

function newGame(seed, rand = Math.random, phase = "intro") {
    const lvl = genLevel(seed);
    const assign = rand() < 0.5 ? [0, 1] : [1, 0]; // acak: aktor -> base barat/timur
    const first = rand() < 0.5 ? 0 : 1;            // coin toss: siapa jalan duluan
    const tanks = assign.map((slot) => ({
        c: SPAWNS[slot][0], r: SPAWNS[slot][1],
        dir: slot === 0 ? 1 : 3,
        hp: MAX_HP, alive: true,
    }));
    return {
        v: 1, seed: lvl.seed, theme: lvl.theme, cells: lvl.cells,
        tanks, assign, first,
        turn: first, ap: AP_TURN, turnCount: 1,
        phase, winner: null, score: [0, 0],
        lastShot: null,
        log: [
            "Map: " + lvl.theme,
            "Coin toss: " + COLORS[first] + " moves first",
            "Bases shuffled: Indigo " + (assign[0] === 0 ? "west" : "east") +
            " / Red " + (assign[1] === 0 ? "west" : "east"),
        ],
    };
}

function advance(state) {
    state.turn = 1 - state.turn;
    state.ap = AP_TURN;
    state.turnCount++;
    if (state.turnCount > MAX_TURNS) {
        state.phase = "over"; state.winner = null;
        pushLog(state, "Stalemate - the battle is a draw.");
    }
}

/* Reducer murni: satu-satunya tempat state berubah (host-authoritative).
   env = { solo, cheats, rand }. Semua aksi divalidasi actor + giliran. */
function reduce(state, action, actor, env = {}) {
    const solo = env.solo !== false;
    const cheats = env.cheats || {};
    if (!state || !action || typeof action.type !== "string") return state;
    if (actor !== 0 && actor !== 1) return state;

    if (action.type === "start") {
        if (state.phase === "intro") { state.phase = "playing"; pushLog(state, "Battle started - good luck!"); }
        return state;
    }
    if (action.type === "rematch") {
        if (state.phase === "over" || solo) {
            const seed = (Number.isFinite(action.seed) ? action.seed : Math.floor(Math.random() * 2 ** 31)) >>> 0;
            return newGame(seed, env.rand || Math.random, "playing");
        }
        return state;
    }
    if (action.type === "cheat") { // hanya solo, hanya pemain lokal (aktor 0)
        if (!solo || actor !== 0 || state.phase !== "playing") return state;
        if (action.op === "heal") { state.tanks[0].hp = MAX_HP; pushLog(state, "Cheat: hull repaired."); }
        else if (action.op === "clear") {
            for (let i = 0; i < state.cells.length; i++)
                if (state.cells[i] === BRICK2 || state.cells[i] === BRICK1) state.cells[i] = EMPTY;
            pushLog(state, "Cheat: all brick walls cleared.");
        } else if (action.op === "skip" && state.turn === 1) {
            pushLog(state, "Cheat: enemy turn skipped."); advance(state);
        }
        return state;
    }

    if (state.phase !== "playing" || state.turn !== actor) return state;
    const me = state.tanks[actor], foe = state.tanks[1 - actor];
    const cost = (base) => (solo && actor === 0 && cheats.ap) ? 0 : base;

    if (action.type === "aim") {
        const d = action.dir | 0;
        if (d >= 0 && d < 4) me.dir = d;
        return state;
    }
    if (action.type === "move") {
        const dirs = Array.isArray(action.dirs) ? action.dirs.slice(0, 8) : [];
        for (const raw of dirs) {
            const d = raw | 0;
            if (d < 0 || d > 3) break;
            if (state.ap < cost(COST_MOVE)) break;
            const nc = me.c + DIRV[d][0], nr = me.r + DIRV[d][1];
            me.dir = d;
            if (!inGrid(nc, nr) || state.cells[idx(nc, nr)] !== EMPTY ||
                (foe.alive && foe.c === nc && foe.r === nr)) break;
            me.c = nc; me.r = nr;
            state.ap -= cost(COST_MOVE);
        }
        if (state.ap <= 0) advance(state);
        return state;
    }
    if (action.type === "fire") {
        const d = action.dir | 0;
        if (d < 0 || d > 3) return state;
        const c = cost(COST_SHOT);
        if (state.ap < c) return state;
        me.dir = d;
        const rc = raycast(state.cells, state.tanks, me.c, me.r, d);
        let kill = false;
        if (rc.hit === "brick") {
            const i = idx(rc.impact[0], rc.impact[1]);
            if (state.cells[i] === BRICK2) state.cells[i] = BRICK1;
            else {
                state.cells[i] = EMPTY; state.score[actor] += 15;
                pushLog(state, COLORS[actor] + " breached a brick wall.");
            }
        } else if (rc.hit === "tank") {
            const target = rc.tank, ft = state.tanks[target];
            let dmg = (solo && actor === 0 && cheats.onehit) ? MAX_HP : 1;
            if (solo && target === 0 && cheats.god) dmg = 0;
            ft.hp = Math.max(0, ft.hp - dmg);
            if (dmg > 0) {
                state.score[actor] += 120;
                pushLog(state, COLORS[actor] + " hit " + COLORS[target] + " - " + ft.hp + " HP left.");
            } else pushLog(state, "God mode absorbed the shell.");
            if (ft.hp <= 0) {
                ft.alive = false; kill = true;
                state.phase = "over"; state.winner = actor;
                state.score[actor] += 300 + 50 * me.hp;
                pushLog(state, COLORS[actor] + " destroyed " + COLORS[target] + "!");
            }
        }
        state.ap -= c;
        state.lastShot = {
            seq: (state.lastShot ? state.lastShot.seq : 0) + 1,
            from: actor, dir: d,
            x1: (me.c + 0.5) * CELL, y1: (me.r + 0.5) * CELL,
            x2: (rc.impact[0] + 0.5) * CELL, y2: (rc.impact[1] + 0.5) * CELL,
            hit: rc.hit, kill,
        };
        if (state.phase === "playing" && state.ap <= 0) advance(state);
        return state;
    }
    if (action.type === "end") { advance(state); return state; }
    return state;
}

/* Bot: tembak kalau ada garis pandang -> mendekat via BFS ->
   jebol bata penghalang -> langkah fallback. Ada sedikit randomness. */
function decideBot(state, actor, rand, frozen) {
    if (state.phase !== "playing" || state.turn !== actor) return null;
    if (frozen) return { type: "end" };
    const me = state.tanks[actor], foe = state.tanks[1 - actor];
    const ap = state.ap;
    const dirs = [0, 1, 2, 3];
    if (ap >= COST_SHOT) {
        for (const d of dirs) {
            const rc = raycast(state.cells, state.tanks, me.c, me.r, d);
            if (rc.hit === "tank" && rc.tank === 1 - actor) {
                if (rand() < 0.92) return { type: "fire", dir: d };
                break;
            }
        }
    }
    const dist = bfsDist(state.cells, foe.c, foe.r, []);
    const here = dist[idx(me.c, me.r)];
    let bestD = -1, bestV = Infinity;
    for (const d of dirs) {
        const nc = me.c + DIRV[d][0], nr = me.r + DIRV[d][1];
        if (!inGrid(nc, nr) || state.cells[idx(nc, nr)] !== EMPTY ||
            (foe.c === nc && foe.r === nr)) continue;
        const v = dist[idx(nc, nr)];
        if (v < 0 || (here >= 0 && v >= here)) continue;
        if (v < bestV || (v === bestV && rand() < 0.5)) { bestV = v; bestD = d; }
    }
    if (bestD >= 0 && ap >= COST_MOVE) return { type: "move", dirs: [bestD] };
    if (ap >= COST_SHOT) {
        const dx = foe.c - me.c, dy = foe.r - me.r;
        const pref = Math.abs(dx) >= Math.abs(dy)
            ? [dx >= 0 ? 1 : 3, dy >= 0 ? 2 : 0]
            : [dy >= 0 ? 2 : 0, dx >= 0 ? 1 : 3];
        let pick = -1, pickLen = Infinity;
        for (const d of [...pref, ...dirs]) {
            const rc = raycast(state.cells, state.tanks, me.c, me.r, d);
            if (rc.hit === "brick" && rc.steps < pickLen) { pick = d; pickLen = rc.steps; }
        }
        if (pick >= 0) return { type: "fire", dir: pick };
    }
    if (ap >= COST_MOVE) {
        const opts = dirs.filter((d) => {
            const nc = me.c + DIRV[d][0], nr = me.r + DIRV[d][1];
            return inGrid(nc, nr) && state.cells[idx(nc, nr)] === EMPTY &&
                !(foe.c === nc && foe.r === nr);
        });
        if (opts.length) {
            const manh = (d) => Math.abs(me.c + DIRV[d][0] - foe.c) + Math.abs(me.r + DIRV[d][1] - foe.r);
            opts.sort((a, b) => manh(a) - manh(b));
            const d = rand() < 0.75 ? opts[0] : opts[Math.floor(rand() * opts.length)];
            return { type: "move", dirs: [d] };
        }
    }
    return { type: "end" };
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const solo = !online;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- state lokal (tidak ikut disinkronkan) ---------- */
    let destroyed = false;
    let guideOpen = false, cheatsOpen = false;
    let previewDir = null, lastTurnKey = "";
    let seenState = false, lastFxSeq = 0;
    let botTimer = null;
    let lastMoveT = 0, lastRotT = 0;
    const cheats = { god: false, ap: false, onehit: false, freeze: false };
    const fxTimers = new Set();
    const holdBinds = [];
    const unsubs = [];
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (_) { }

    /* ---------- shell (design minimalis, mengikuti template) ---------- */
    root.innerHTML = `
<style>
.tb-app{--tb-line:#ffffff14;--tb-text:#e2e8f0;--tb-mut:#8fa3bf;--tb-amber:#f59e0b;color:var(--tb-text);display:flex;flex-direction:column;gap:10px}
.tb-app [hidden]{display:none!important}
.tb-app .tb-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tb-app .tb-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--tb-line);border-radius:999px;background:#ffffff06;font-size:12px;color:var(--tb-mut)}
.tb-app .tb-chip b{color:var(--tb-text);font-weight:600}
.tb-app .tb-dot{width:9px;height:9px;border-radius:50%;background:var(--c,#fff);display:inline-block;flex:none}
.tb-app .tb-pips{display:inline-flex;gap:3px}
.tb-app .tb-pip{width:7px;height:10px;border-radius:2px;background:#ffffff1c}
.tb-app .tb-pip.on{background:var(--c,#4ade80)}
.tb-app .tb-ap .tb-pip{width:9px;height:9px;border-radius:50%}
.tb-app .tb-ap .tb-pip.on{background:var(--tb-amber)}
.tb-app .tb-spacer{flex:1}
.tb-app .tb-icon{border:1px solid var(--tb-line);background:#ffffff08;color:var(--tb-mut);border-radius:999px;min-width:30px;height:30px;padding:0 11px;font-size:11px;font-weight:700;letter-spacing:.06em;cursor:pointer}
.tb-app .tb-icon:hover{color:var(--tb-text);border-color:#ffffff30}
.tb-app .tb-panel{padding:12px;display:flex;flex-direction:column;gap:8px}
.tb-app .tb-wrap{position:relative;width:min(100%,720px);margin:0 auto;aspect-ratio:680/520}
.tb-app .tb-svg{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;border-radius:12px}
.tb-app .tb-log{min-height:18px;text-align:center;font-size:12px;color:var(--tb-mut)}
.tb-app .tb-controls{display:flex;gap:18px;align-items:center;justify-content:center;flex-wrap:wrap;padding:2px 0}
.tb-app .tb-pad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,46px);gap:6px}
.tb-app .tb-btn{border:1px solid var(--tb-line);background:#ffffff0a;color:var(--tb-text);border-radius:10px;width:46px;height:46px;display:grid;place-items:center;cursor:pointer;touch-action:none;padding:0}
.tb-app .tb-btn:active{background:#ffffff1f}
.tb-app .tb-btn svg{width:22px;height:22px}
.tb-app .tb-mid{display:flex;flex-direction:column;gap:6px;align-items:center}
.tb-app .tb-rotrow{display:flex;gap:6px}
.tb-app .tb-end{border:1px solid var(--tb-line);background:transparent;color:var(--tb-mut);border-radius:10px;height:34px;padding:0 14px;font-size:11px;font-weight:700;letter-spacing:.08em;cursor:pointer}
.tb-app .tb-end:hover{color:var(--tb-text)}
.tb-app .tb-fire{border:0;border-radius:14px;width:86px;height:86px;background:var(--tb-amber);color:#111827;font-weight:800;font-size:15px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;box-shadow:0 6px 18px #f59e0b33}
.tb-app .tb-fire small{font-size:10px;font-weight:700;opacity:.7}
.tb-app .tb-btn:disabled,.tb-app .tb-fire:disabled,.tb-app .tb-end:disabled{opacity:.35;cursor:default}
.tb-app .tb-keys{text-align:center;font-size:11px;color:var(--tb-mut)}
.tb-app kbd{border:1px solid var(--tb-line);border-bottom-width:2px;border-radius:4px;padding:1px 5px;font-size:10px;background:#ffffff08;font-family:inherit}
.tb-app .tb-ov{position:absolute;inset:0;display:grid;place-items:center;background:#0b1226d9;backdrop-filter:blur(3px);border-radius:12px;z-index:5;padding:14px;overflow:auto}
.tb-app .tb-card{width:min(100%,440px);background:#101b33;border:1px solid var(--tb-line);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:8px}
.tb-app .tb-card h3{margin:0;font-size:18px}
.tb-app .tb-card h4{margin:6px 0 2px;font-size:11px;letter-spacing:.12em;color:var(--tb-mut);text-transform:uppercase}
.tb-app .tb-card p,.tb-app .tb-card li{font-size:13px;line-height:1.5;color:#c3cfdf;margin:2px 0}
.tb-app .tb-card ul{margin:0;padding-left:16px}
.tb-app .tb-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.tb-app .tb-primary{border:0;border-radius:10px;background:var(--tb-amber);color:#111827;font-weight:800;padding:10px 14px;font-size:14px;cursor:pointer}
.tb-app .tb-ghost{border:1px solid var(--tb-line);background:transparent;color:var(--tb-text);border-radius:10px;padding:9px 14px;font-size:13px;cursor:pointer}
.tb-app .tb-legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}
.tb-app .tb-legend span{display:flex;align-items:center;gap:7px;font-size:12px;color:#c3cfdf}
.tb-app .tb-sw{width:16px;height:16px;border-radius:3px;flex:none;border:1px solid #ffffff22}
.tb-app .tb-cheat{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--tb-line);border-radius:10px;font-size:13px;cursor:pointer}
.tb-app .tb-cheat input{accent-color:var(--tb-amber);width:16px;height:16px;flex:none}
.tb-app .tb-cheat small{display:block;color:var(--tb-mut);font-size:11px}
.tb-app .tb-active{animation:tb-pulse 1.6s ease-in-out infinite}
@keyframes tb-pulse{50%{opacity:.3}}
.tb-app .tb-boom{animation:tb-boom .5s ease-out forwards;transform-box:fill-box;transform-origin:center}
@keyframes tb-boom{from{transform:scale(.3);opacity:.95}to{transform:scale(2);opacity:0}}
.tb-app .tb-trace{animation:tb-trace .38s linear forwards}
@keyframes tb-trace{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
@media (hover:hover) and (pointer:fine) and (min-width:900px){.tb-app .tb-pad,.tb-app .tb-rotrow{display:none}}
@media (max-width:560px){.tb-app .tb-fire{width:72px;height:72px}.tb-app .tb-keys{display:none}.tb-app .tb-chip{font-size:11px;padding:3px 8px}}
</style>
<div class="game-app tb-app">
  <div class="game-intro">
    <div><h2>Tank Battle</h2><p>Turn-based tank duel on a random, always-solvable map. Breach the walls, outmaneuver the enemy, destroy their tank.</p></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
  </div>
  <div class="tb-hud">
    <span class="tb-chip"><i class="tb-dot" style="--c:#818cf8"></i><b data-name-you>You</b><span class="tb-pips" data-hp-you style="--c:#818cf8"></span></span>
    <span class="tb-chip"><i class="tb-dot" style="--c:#f87171"></i><b data-name-foe>Bot</b><span class="tb-pips" data-hp-foe style="--c:#f87171"></span></span>
    <span class="tb-chip">AP <span class="tb-pips tb-ap" data-ap></span></span>
    <span class="tb-chip">Turn <b data-turn>1</b></span>
    <span class="tb-chip">Map <b data-theme>-</b></span>
    <span class="tb-chip">Score <b data-score>0</b></span>
    <span class="tb-chip">Best <b data-best>0</b></span>
    <span class="tb-spacer"></span>
    <button class="tb-icon" type="button" data-guide title="How to play (H)">?</button>
    <button class="tb-icon" type="button" data-cheats title="Cheats - solo only (C)">CHEATS</button>
  </div>
  <section class="game-panel tb-panel" data-board>
    <div class="tb-wrap">
      <svg class="tb-svg" data-svg viewBox="0 0 680 520" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tank Battle arena">
        <g data-terrain></g><g data-reach></g><g data-ents></g><g data-aim></g><g data-fx></g>
      </svg>
      <div class="tb-ov" data-ov="help">
        <div class="tb-card">
          <h3>How to play</h3>
          <p>Destroy the enemy tank. Each tank has <b>4 hull points</b> - every shell that lands takes one.</p>
          <h4>Your turn</h4>
          <ul>
            <li><b>4 AP</b> per turn. Move costs <b>1 AP</b> per cell, firing costs <b>3 AP</b>, aiming is free.</li>
            <li>Shoot then reposition, or spend it all on movement. The turn ends automatically at 0 AP, or press <b>End turn</b>.</li>
          </ul>
          <h4>Terrain</h4>
          <div class="tb-legend">
            <span><i class="tb-sw" style="background:#b45309"></i>Brick - breaches after 2 hits</span>
            <span><i class="tb-sw" style="background:#475569"></i>Steel - indestructible cover</span>
            <span><i class="tb-sw" style="background:#14304d"></i>Water - blocks tanks, shells fly over</span>
            <span><i class="tb-sw" style="background:#0b1226"></i>Floor - open ground</span>
          </div>
          <h4>Desktop</h4>
          <p><kbd>WASD</kbd> / <kbd>arrows</kbd> move &middot; mouse aims &middot; <kbd>click</kbd> / <kbd>Space</kbd> fire &middot; <kbd>right-click</kbd> a floor cell to auto-move &middot; <kbd>Q</kbd><kbd>E</kbd> rotate &middot; <kbd>Enter</kbd> end turn.</p>
          <h4>Mobile</h4>
          <p>D-pad moves (hold to keep moving) &middot; rotate buttons aim &middot; <b>FIRE</b> shoots &middot; <b>END</b> passes the turn.</p>
          <h4>Fair play</h4>
          <p>Every battle uses a fresh random map (5 themes, guaranteed solvable). A coin toss decides who moves first, and in multiplayer your base is randomly assigned.</p>
          <div class="tb-row">
            <button class="tb-primary" type="button" data-start>Start battle</button>
            <button class="tb-ghost" type="button" data-close-guide hidden>Back to battle</button>
          </div>
        </div>
      </div>
      <div class="tb-ov" data-ov="over" hidden>
        <div class="tb-card">
          <h3 data-over-title>Victory</h3>
          <p data-over-reason></p>
          <p style="color:#8fa3bf;font-size:12px">Rematch generates a new random map and a fresh coin toss.</p>
          <div class="tb-row"><button class="tb-primary" type="button" data-rematch>Rematch</button></div>
        </div>
      </div>
      <div class="tb-ov" data-ov="cheats" hidden>
        <div class="tb-card">
          <h3>Cheats</h3>
          <p style="color:#8fa3bf;font-size:12px">Solo mode only - automatically disabled in multiplayer.</p>
          <label class="tb-cheat"><input type="checkbox" data-cheat="god"><span>God mode<small>Enemy shells cannot hurt you.</small></span></label>
          <label class="tb-cheat"><input type="checkbox" data-cheat="ap"><span>Infinite AP<small>Moving and firing cost nothing.</small></span></label>
          <label class="tb-cheat"><input type="checkbox" data-cheat="onehit"><span>One-hit kill<small>Your shells destroy the enemy instantly.</small></span></label>
          <label class="tb-cheat"><input type="checkbox" data-cheat="freeze"><span>Freeze bot<small>The bot skips every turn.</small></span></label>
          <div class="tb-row">
            <button class="tb-ghost" type="button" data-cheat-act="heal">Repair hull</button>
            <button class="tb-ghost" type="button" data-cheat-act="clear">Clear bricks</button>
            <button class="tb-ghost" type="button" data-cheat-act="skip">Skip enemy turn</button>
          </div>
          <div class="tb-row"><button class="tb-primary" type="button" data-close-cheats>Back to battle</button></div>
        </div>
      </div>
      <div class="tb-ov" data-ov="wait" hidden>
        <div class="tb-card"><h3>Waiting for host</h3><p>The host is setting up the battle. The arena will appear here automatically.</p></div>
      </div>
    </div>
    <div class="tb-log" data-log aria-live="polite"></div>
  </section>
  <div class="tb-controls">
    <div class="tb-pad" aria-label="Movement pad">
      <span></span>
      <button class="tb-btn" type="button" data-move="0" aria-label="Move up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
      <span></span>
      <button class="tb-btn" type="button" data-move="3" aria-label="Move left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button class="tb-btn" type="button" data-move="2" aria-label="Move down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <button class="tb-btn" type="button" data-move="1" aria-label="Move right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <div class="tb-mid">
      <div class="tb-rotrow">
        <button class="tb-btn" type="button" data-rot="-1" aria-label="Aim left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button>
        <button class="tb-btn" type="button" data-rot="1" aria-label="Aim right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg></button>
      </div>
      <button class="tb-end" type="button" data-end>END TURN</button>
    </div>
    <button class="tb-fire" type="button" data-fire>FIRE<small>3 AP</small></button>
  </div>
  <div class="tb-keys">Move <kbd>WASD</kbd> / <kbd>&#8592;&#8593;&#8595;&#8594;</kbd> &middot; Aim mouse / <kbd>Q</kbd><kbd>E</kbd> &middot; Fire <kbd>Space</kbd> / click &middot; Auto-move <kbd>right-click</kbd> &middot; End <kbd>Enter</kbd> &middot; Guide <kbd>H</kbd></div>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-exit>Exit game</button>
    <button class="game-action-button" type="button" data-rematch>New battle</button>
  </div>
</div>`;

    /* ---------- referensi DOM ---------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const svg = $("[data-svg]");
    const terrainG = $("[data-terrain]"), reachG = $("[data-reach]"),
        entsG = $("[data-ents]"), aimG = $("[data-aim]"), fxG = $("[data-fx]");
    const statusEl = $("[data-status]"), dotEl = $("[data-dot]");
    const hud = {
        nameYou: $("[data-name-you]"), nameFoe: $("[data-name-foe]"),
        hpYou: $("[data-hp-you]"), hpFoe: $("[data-hp-foe]"),
        ap: $("[data-ap]"), turn: $("[data-turn]"), theme: $("[data-theme]"),
        score: $("[data-score]"), best: $("[data-best]"),
    };
    const logEl = $("[data-log]");
    const ovHelp = $('[data-ov="help"]'), ovOver = $('[data-ov="over"]'),
        ovCheats = $('[data-ov="cheats"]'), ovWait = $('[data-ov="wait"]');
    const startBtn = $("[data-start]"), closeGuideBtn = $("[data-close-guide]");
    const overTitle = $("[data-over-title]"), overReason = $("[data-over-reason]");
    const cheatBtn = $("[data-cheats]");
    const fireBtn = $("[data-fire]"), endBtn = $("[data-end]");
    const moveBtns = $$("[data-move]"), rotBtns = $$("[data-rot]");
    const rematchBtns = $$("[data-rematch]");

    /* ---------- helper render ---------- */
    const pips = (n, max) => {
        let s = "";
        for (let i = 0; i < max; i++) s += '<span class="tb-pip' + (i < n ? " on" : "") + '"></span>';
        return s;
    };
    const pname = (i) => {
        const p = roomData && roomData.players;
        const v = p && (Array.isArray(p) ? p[i] : Object.values(p)[i]);
        return (v && (v.name || v.displayName)) || null;
    };
    const foeName = () => online ? (pname(1 - playerIndex) || "Opponent") : "Bot";
    const meName = () => playerName || "You";

    function boardBg() {
        let s = '<rect x="0" y="0" width="' + BW + '" height="' + BH + '" fill="#0b1226"/>';
        for (let c = 1; c < COLS; c++)
            s += '<path d="M' + c * CELL + ' 0V' + BH + '" stroke="#ffffff05" stroke-width="1"/>';
        for (let r = 1; r < ROWS; r++)
            s += '<path d="M0 ' + r * CELL + 'H' + BW + '" stroke="#ffffff05" stroke-width="1"/>';
        return s;
    }

    function renderCells(st) {
        let s = "";
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const v = st.cells[idx(c, r)];
            if (v === EMPTY) continue;
            const x = c * CELL, y = r * CELL;
            if (v === BRICK2 || v === BRICK1) {
                s += '<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="32" height="32" rx="3" fill="' + (v === BRICK2 ? "#b45309" : "#7c2d12") + '"/>';
                s += '<path d="M' + (x + 4) + " " + (y + 15) + "H" + (x + 36) + "M" + (x + 4) + " " + (y + 26) + "H" + (x + 36) + '" stroke="#00000040" stroke-width="2"/>';
                if (v === BRICK1)
                    s += '<path d="M' + (x + 12) + " " + (y + 7) + "l7 8-5 6 8 10" + '" stroke="#00000066" stroke-width="2" fill="none"/>';
            } else if (v === STEEL) {
                s += '<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="32" height="32" rx="3" fill="#475569"/>';
                s += '<rect x="' + (x + 10) + '" y="' + (y + 10) + '" width="20" height="20" rx="2" fill="none" stroke="#94a3b8" stroke-width="1.5" opacity=".55"/>';
            } else if (v === WATER) {
                s += '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="36" height="36" rx="4" fill="#14304d"/>';
                s += '<path d="M' + (x + 8) + " " + (y + 16) + "q5-4 10 0t10 0M" + (x + 8) + " " + (y + 26) + "q5-4 10 0t10 0" + '" stroke="#60a5fa" opacity=".35" fill="none" stroke-width="2"/>';
            }
        }
        return s;
    }

    function renderTanks(st) {
        let s = "";
        st.tanks.forEach((t, i) => {
            if (!t.alive) return;
            const body = i === 0 ? "#4f46e5" : "#dc2626";
            const accent = i === 0 ? "#a5b4fc" : "#fca5a5";
            const cx = (t.c + 0.5) * CELL, cy = (t.r + 0.5) * CELL;
            s += "<g>";
            if (st.phase === "playing" && st.turn === i)
                s += '<rect x="' + (cx - 19) + '" y="' + (cy - 19) + '" width="38" height="38" rx="9" fill="none" stroke="' + accent + '" stroke-width="2" stroke-dasharray="5 4" class="tb-active"/>';
            s += '<g transform="rotate(' + t.dir * 90 + " " + cx + " " + cy + ')">';
            s += '<rect x="' + (cx - 15) + '" y="' + (cy - 15) + '" width="30" height="7" rx="3" fill="#0b1020" opacity=".9"/>';
            s += '<rect x="' + (cx - 15) + '" y="' + (cy + 8) + '" width="30" height="7" rx="3" fill="#0b1020" opacity=".9"/>';
            s += '<rect x="' + (cx - 12) + '" y="' + (cy - 12) + '" width="24" height="24" rx="5" fill="' + body + '" stroke="#0b1020" stroke-width="1.5"/>';
            s += '<path d="M' + cx + " " + cy + "V" + (cy - 19) + '" stroke="' + accent + '" stroke-width="5" stroke-linecap="round"/>';
            s += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="' + accent + '" stroke="#0b1020" stroke-width="1.5"/>';
            s += "</g>";
            for (let k = 0; k < MAX_HP; k++)
                s += '<rect x="' + (cx - 14 + k * 8) + '" y="' + (cy - 27) + '" width="6" height="4" rx="1" fill="' + (k < t.hp ? accent : "#ffffff22") + '"/>';
            s += "</g>";
        });
        return s;
    }

    function renderReach(st) {
        const me = st.tanks[playerIndex], foe = st.tanks[1 - playerIndex];
        const limit = solo && cheats.ap ? 6 : st.ap;
        if (limit < 1) return "";
        const dist = bfsDist(st.cells, me.c, me.r, [idx(foe.c, foe.r)]);
        let s = "";
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const d = dist[idx(c, r)];
            if (d >= 1 && d <= limit)
                s += '<circle cx="' + (c + 0.5) * CELL + '" cy="' + (r + 0.5) * CELL + '" r="2.5" fill="#ffffff22"/>';
        }
        return s;
    }

    function updateAim() {
        if (!state || state.phase !== "playing" || state.turn !== playerIndex || guideOpen || cheatsOpen) {
            aimG.innerHTML = ""; return;
        }
        const me = state.tanks[playerIndex];
        const d = previewDir == null ? me.dir : previewDir;
        const rc = raycast(state.cells, state.tanks, me.c, me.r, d);
        const x1 = (me.c + 0.5) * CELL, y1 = (me.r + 0.5) * CELL;
        const x2 = (rc.impact[0] + 0.5) * CELL, y2 = (rc.impact[1] + 0.5) * CELL;
        let s = '<path d="M' + x1 + " " + y1 + "L" + x2 + " " + y2 + '" stroke="#fbbf24" stroke-width="2.5" stroke-dasharray="6 5" opacity=".65" fill="none"/>';
        if (rc.hit === "tank")
            s += '<circle cx="' + x2 + '" cy="' + y2 + '" r="16" fill="none" stroke="#f87171" stroke-width="2.5"/>';
        else if (rc.hit === "brick")
            s += '<rect x="' + (rc.impact[0] * CELL + 6) + '" y="' + (rc.impact[1] * CELL + 6) + '" width="28" height="28" rx="4" fill="none" stroke="#f59e0b" stroke-width="2.5"/>';
        else if (rc.hit === "steel")
            s += '<rect x="' + (rc.impact[0] * CELL + 6) + '" y="' + (rc.impact[1] * CELL + 6) + '" width="28" height="28" rx="4" fill="none" stroke="#94a3b8" stroke-width="2.5"/>';
        else
            s += '<circle cx="' + x2 + '" cy="' + y2 + '" r="3.5" fill="#ffffff33"/>';
        aimG.innerHTML = s;
    }

    function playShot(sh) {
        const ns = "http://www.w3.org/2000/svg";
        const g = document.createElementNS(ns, "g");
        const len = Math.max(1, Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1));
        const trace = document.createElementNS(ns, "path");
        trace.setAttribute("d", "M" + sh.x1 + " " + sh.y1 + "L" + sh.x2 + " " + sh.y2);
        trace.setAttribute("stroke", sh.from === 0 ? "#a5b4fc" : "#fca5a5");
        trace.setAttribute("stroke-width", "4");
        trace.setAttribute("stroke-linecap", "round");
        trace.setAttribute("class", "tb-trace");
        trace.style.strokeDasharray = String(len);
        trace.style.setProperty("--len", String(len));
        g.appendChild(trace);
        const boom = document.createElementNS(ns, "circle");
        boom.setAttribute("cx", sh.x2); boom.setAttribute("cy", sh.y2);
        boom.setAttribute("r", sh.kill ? 22 : 13);
        boom.setAttribute("fill", sh.hit === "tank" ? "#f87171" : sh.hit === "brick" ? "#f59e0b" : sh.hit === "steel" ? "#94a3b8" : "#64748b");
        boom.setAttribute("class", "tb-boom");
        g.appendChild(boom);
        fxG.appendChild(g);
        const t = setTimeout(() => { fxTimers.delete(t); if (g.parentNode) g.parentNode.removeChild(g); }, 650);
        fxTimers.add(t);
    }

    /* ---------- render utama ---------- */
    function render() {
        if (destroyed) return;
        const st = state;
        let status = "Ready", dot = "#94a3b8";
        if (!st) status = online ? "Waiting for host..." : "Ready";
        else if (st.phase === "intro") status = "Ready - read the guide";
        else if (st.phase === "over") {
            status = st.winner == null ? "Draw" : (st.winner === playerIndex ? "Victory" : "Defeat");
            dot = st.winner == null ? "#94a3b8" : (st.winner === playerIndex ? "#4ade80" : "#f87171");
        } else if (st.turn === playerIndex) { status = "Your turn - " + st.ap + " AP"; dot = "#4ade80"; }
        else { status = online ? "Opponent is thinking..." : "Bot is thinking..."; dot = "#f59e0b"; }
        statusEl.textContent = status;
        dotEl.style.background = dot;

        const my = st ? st.tanks[playerIndex] : null;
        const fo = st ? st.tanks[1 - playerIndex] : null;
        hud.nameYou.textContent = meName();
        hud.nameFoe.textContent = foeName();
        hud.hpYou.innerHTML = pips(my ? my.hp : 0, MAX_HP);
        hud.hpFoe.innerHTML = pips(fo ? fo.hp : 0, MAX_HP);
        hud.ap.innerHTML = pips(st && st.turn === playerIndex && st.phase === "playing" ? st.ap : 0, AP_TURN);
        hud.turn.textContent = st ? st.turnCount : "-";
        hud.theme.textContent = st ? st.theme : "-";
        hud.score.textContent = st ? st.score[playerIndex] : 0;
        hud.best.textContent = best;
        cheatBtn.hidden = online;

        if (!st) {
            terrainG.innerHTML = boardBg();
            reachG.innerHTML = ""; entsG.innerHTML = ""; aimG.innerHTML = "";
        } else {
            const key = st.turnCount + ":" + st.turn;
            if (key !== lastTurnKey) { lastTurnKey = key; previewDir = null; }
            terrainG.innerHTML = boardBg() + renderCells(st);
            entsG.innerHTML = renderTanks(st);
            reachG.innerHTML = st.phase === "playing" && st.turn === playerIndex ? renderReach(st) : "";
            updateAim();
            if (st.lastShot && st.lastShot.seq !== lastFxSeq) {
                if (!seenState) lastFxSeq = st.lastShot.seq;
                else { lastFxSeq = st.lastShot.seq; playShot(st.lastShot); }
            }
            seenState = true;
            if (st.phase === "over" && st.winner === playerIndex && st.score[playerIndex] > best) {
                best = st.score[playerIndex];
                try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
                hud.best.textContent = best;
            }
        }

        logEl.textContent = st && st.log.length ? st.log[st.log.length - 1] : "";
        ovWait.hidden = !(online && !st);
        ovHelp.hidden = !st || (st.phase !== "intro" && !guideOpen);
        startBtn.hidden = !st || st.phase !== "intro";
        closeGuideBtn.hidden = !st || st.phase === "intro";
        ovOver.hidden = !st || st.phase !== "over" || guideOpen || cheatsOpen;
        ovCheats.hidden = !cheatsOpen || online;
        if (st && st.phase === "over") {
            if (st.winner == null) {
                overTitle.textContent = "Stalemate"; overTitle.style.color = "#94a3b8";
                overReason.textContent = "Neither tank could finish the job within " + MAX_TURNS + " turns. Your score: " + st.score[playerIndex] + ".";
            } else if (st.winner === playerIndex) {
                overTitle.textContent = "Victory"; overTitle.style.color = "#4ade80";
                overReason.textContent = "You destroyed the " + COLORS[st.winner === 0 ? 1 : 0] + " tank in " + st.turnCount + " turns with " + st.tanks[playerIndex].hp + " HP left. Score: " + st.score[playerIndex] + " - Best: " + best + ".";
            } else {
                overTitle.textContent = "Defeat"; overTitle.style.color = "#f87171";
                overReason.textContent = "Your tank was destroyed on turn " + st.turnCount + ". Score: " + st.score[playerIndex] + " - Best: " + best + ".";
            }
        }

        const canAct = !!st && st.phase === "playing" && st.turn === playerIndex;
        const freeAp = solo && cheats.ap;
        moveBtns.forEach((b) => { b.disabled = !canAct || (!freeAp && st.ap < COST_MOVE); });
        rotBtns.forEach((b) => { b.disabled = !canAct; });
        fireBtn.disabled = !canAct || (!freeAp && st.ap < COST_SHOT);
        endBtn.disabled = !canAct;
        rematchBtns.forEach((b) => { b.disabled = online && (!st || st.phase !== "over"); });
    }

    /* ---------- alur state (host-authoritative) ---------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (destroyed || !state) return;
        if (action && action.type === "rematch" && !Number.isFinite(action.seed))
            action = { ...action, seed: Math.floor(Math.random() * 2 ** 31) };
        const next = reduce(state, action, actor, { solo, cheats: online ? {} : cheats, rand: Math.random });
        if (next !== state) { state = next; lastFxSeq = 0; seenState = true; previewDir = null; lastTurnKey = ""; }
        publish();
        maybeBot();
    }

    function submitAction(action) {
        if (destroyed) return;
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------- bot (mode ai, ritme santai: jeda 0.6-1.1 dtk per aksi) ---------- */
    function maybeBot() {
        if (online || destroyed || botTimer != null) return;
        if (state && state.phase === "playing" && state.turn === 1)
            botTimer = setTimeout(botStep, 620 + Math.random() * 520);
    }
    function botStep() {
        botTimer = null;
        if (destroyed || !state || state.phase !== "playing" || state.turn !== 1) return;
        if (guideOpen || cheatsOpen) { maybeBot(); return; }
        const a = decideBot(state, 1, Math.random, cheats.freeze);
        if (a) applyAction(a, 1); else maybeBot();
    }

    /* ---------- input: keyboard + mouse (desktop) ---------- */
    const myTurnNow = () => !!state && state.phase === "playing" && state.turn === playerIndex;
    function doFire() {
        if (!state || state.phase !== "playing" || state.turn !== playerIndex) return;
        const d = previewDir == null ? state.tanks[playerIndex].dir : previewDir;
        submitAction({ type: "fire", dir: d });
    }
    function eventCell(e) {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * BW;
        const y = (e.clientY - rect.top) / rect.height * BH;
        return [Math.floor(x / CELL), Math.floor(y / CELL), x, y];
    }
    function onAim(e) {
        if (!state || state.phase !== "playing" || state.turn !== playerIndex) return;
        const me = state.tanks[playerIndex];
        const [, , x, y] = eventCell(e);
        const dx = x - (me.c + 0.5) * CELL, dy = y - (me.r + 0.5) * CELL;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        if (d !== previewDir) { previewDir = d; updateAim(); }
    }
    function onBoardClick() {
        if (guideOpen || cheatsOpen) return;
        doFire();
    }
    function onCtx(e) {
        e.preventDefault();
        if (!state || state.phase !== "playing" || state.turn !== playerIndex || guideOpen || cheatsOpen) return;
        const [c, r] = eventCell(e);
        if (!inGrid(c, r)) return;
        const me = state.tanks[playerIndex], foe = state.tanks[1 - playerIndex];
        const path = pathDirs(state.cells, me.c, me.r, c, r, [idx(foe.c, foe.r)]);
        const limit = solo && cheats.ap ? 8 : state.ap;
        if (path && path.length && path.length <= limit) submitAction({ type: "move", dirs: path });
    }
    function onKey(e) {
        if (destroyed || !state) return;
        const tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        if (e.code === "Escape") {
            if (guideOpen || cheatsOpen) { guideOpen = false; cheatsOpen = false; render(); e.preventDefault(); }
            return;
        }
        if (e.code === "KeyH") { guideOpen = !guideOpen; cheatsOpen = false; render(); e.preventDefault(); return; }
        if (e.code === "KeyC" && !online) { cheatsOpen = !cheatsOpen; guideOpen = false; render(); e.preventDefault(); return; }
        if (guideOpen || cheatsOpen) return;
        if (state.phase === "intro" && (e.code === "Enter" || e.code === "Space")) {
            e.preventDefault(); submitAction({ type: "start" }); return;
        }
        if (state.phase === "over" && e.code === "KeyR") { e.preventDefault(); submitAction({ type: "rematch" }); return; }
        const mv = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
        if (e.code in mv) {
            e.preventDefault();
            const now = performance.now();
            if (e.repeat && now - lastMoveT < 140) return;
            lastMoveT = now;
            if (myTurnNow()) submitAction({ type: "move", dirs: [mv[e.code]] });
            return;
        }
        if (e.code === "KeyQ" || e.code === "KeyE") {
            e.preventDefault();
            const now = performance.now();
            if (e.repeat && now - lastRotT < 140) return;
            lastRotT = now;
            if (!myTurnNow()) return;
            const me = state.tanks[playerIndex];
            submitAction({ type: "aim", dir: (me.dir + (e.code === "KeyQ" ? 3 : 1)) % 4 });
            return;
        }
        if (e.code === "Space" || e.code === "KeyF") { e.preventDefault(); if (!e.repeat) doFire(); return; }
        if (e.code === "Enter") { e.preventDefault(); if (!e.repeat && myTurnNow()) submitAction({ type: "end" }); }
    }

    /* ---------- input: klik tombol ---------- */
    function handleClick(event) {
        const b = event.target.closest("button");
        if (!b) return;
        if (b.dataset.exit !== undefined) { onExit(); return; }
        if (b.dataset.guide !== undefined) { guideOpen = true; cheatsOpen = false; render(); b.blur(); return; }
        if (b.dataset.closeGuide !== undefined) { guideOpen = false; render(); return; }
        if (b.dataset.start !== undefined) { guideOpen = false; submitAction({ type: "start" }); return; }
        if (b.dataset.rematch !== undefined) { submitAction({ type: "rematch" }); b.blur(); return; }
        if (b.dataset.cheats !== undefined) { cheatsOpen = true; guideOpen = false; render(); return; }
        if (b.dataset.closeCheats !== undefined) { cheatsOpen = false; render(); return; }
        if (b.dataset.cheatAct) { submitAction({ type: "cheat", op: b.dataset.cheatAct }); return; }
        if (b.dataset.fire !== undefined) { doFire(); b.blur(); return; }
        if (b.dataset.end !== undefined) { submitAction({ type: "end" }); b.blur(); return; }
        if (b.dataset.move !== undefined && event.detail === 0) {
            submitAction({ type: "move", dirs: [parseInt(b.dataset.move, 10)] }); return;
        }
        if (b.dataset.rot !== undefined && event.detail === 0 && state) {
            const me = state.tanks[playerIndex];
            submitAction({ type: "aim", dir: (me.dir + parseInt(b.dataset.rot, 10) + 4) % 4 });
        }
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat]");
        if (!c || online) return;
        cheats[c.dataset.cheat] = c.checked;
        render();
    }

    /* ---------- virtual buttons: tahan untuk gerak/putar berulang (mobile) ---------- */
    function bindHold(btn, fn) {
        let t = null, iv = null;
        const stop = () => {
            if (t) { clearTimeout(t); t = null; }
            if (iv) { clearInterval(iv); iv = null; }
        };
        const down = (e) => {
            e.preventDefault();
            if (btn.disabled) return;
            fn(); stop();
            t = setTimeout(() => { iv = setInterval(fn, 170); }, 330);
        };
        btn.addEventListener("pointerdown", down);
        btn.addEventListener("pointerup", stop);
        btn.addEventListener("pointerleave", stop);
        btn.addEventListener("pointercancel", stop);
        holdBinds.push({ btn, down, stop });
    }
    moveBtns.forEach((b) => {
        const d = parseInt(b.dataset.move, 10);
        bindHold(b, () => { if (myTurnNow()) submitAction({ type: "move", dirs: [d] }); });
    });
    rotBtns.forEach((b) => {
        const r = parseInt(b.dataset.rot, 10);
        bindHold(b, () => {
            if (!myTurnNow()) return;
            const me = state.tanks[playerIndex];
            submitAction({ type: "aim", dir: (me.dir + r + 4) % 4 });
        });
    });

    /* ---------- pasang listener ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", onKey);
    svg.addEventListener("pointermove", onAim);
    svg.addEventListener("click", onBoardClick);
    svg.addEventListener("contextmenu", onCtx);

    /* ---------- inisialisasi sesuai mode ---------- */
    const sub = (fn) => { const u = fn(); if (typeof u === "function") unsubs.push(u); };
    if (online) {
        sub(() => room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = newGame(Math.floor(Math.random() * 2 ** 31));
            seenState = true;
            publish();
            sub(() => room.onAction((action) => { if (!destroyed) applyAction(action, 1); }));
        } else {
            sub(() => room.onState((nextState) => {
                if (destroyed) return;
                const prevSeed = state ? state.seed : null;
                state = nextState;
                if (!seenState) { seenState = true; lastFxSeq = state && state.lastShot ? state.lastShot.seq : 0; }
                else if (state && state.seed !== prevSeed) { lastFxSeq = 0; lastTurnKey = ""; previewDir = null; }
                render();
            }));
        }
    } else {
        state = newGame(Math.floor(Math.random() * 2 ** 31));
        seenState = true;
        render();
    }

    return {
        destroy() {
            destroyed = true;
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svg.removeEventListener("pointermove", onAim);
            svg.removeEventListener("click", onBoardClick);
            svg.removeEventListener("contextmenu", onCtx);
            holdBinds.forEach(({ btn, down, stop }) => {
                stop();
                btn.removeEventListener("pointerdown", down);
                btn.removeEventListener("pointerup", stop);
                btn.removeEventListener("pointerleave", stop);
                btn.removeEventListener("pointercancel", stop);
            });
            fxTimers.forEach((t) => clearTimeout(t));
            fxTimers.clear();
            if (botTimer != null) { clearTimeout(botTimer); botTimer = null; }
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}