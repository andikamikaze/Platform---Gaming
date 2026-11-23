/*
 * bunker-prepper.js — Bunker Prepper (race edition)
 * Format template: export META + export mount(root, context).
 * Setelah mengubah file ini jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "bunker-prepper", // harus sama dengan nama file (tanpa .js)
    name: "Bunker Prepper",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Race a rival to dig, build and stock a secret bunker before the inspectors arrive.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21L24 7l17 14"/><path d="M11 21v9h26v-9"/><path d="M21 24h6v6h-6z"/><path d="M4 33h40"/><path d="M18 33v5h12v-5"/><path d="M22 38h4"/></svg>',
    bg: ["#f59e0b", "#1f2937"],
    bestKey: "bunkerPrepperBest",
};

/* ================================================================
 * CORE — pure logic, serializable state, deterministic RNG.
 * Tidak menyentuh DOM supaya bisa dipakai host/bot dan diuji.
 * ================================================================ */
const W = 26, H = 12, CELL = 32, SURF = 3;
const HOUSES = [[2, 5], [20, 23]];
const STRIDE = 5;                    // langkah maksimum per giliran
const ACTION_MIN = 60, REST_MIN = 360;
const DIG_TARGET = 6;
const TARGETS = { food: 12, wood: 10, metal: 8, stone: 8 };
const COSTS = {
    storage: { wood: 5, stone: 5 },
    bed: { wood: 6 },
    generator: { metal: 4, stone: 4 },
    farm: { wood: 4, metal: 2 },
    radio: { metal: 3, stone: 2 },
};
const FIDS = Object.keys(COSTS);
const RES = ["wood", "metal", "stone", "food"];
const NODE_RES = { tree: "wood", scrap: "metal", rocks: "stone", bush: "food" };
const NODE_LABEL = { tree: "Tree", scrap: "Scrap", rocks: "Rocks", bush: "Bush" };
const CAP_BASE = 24, CAP_ST = 16;
const DEADLINE = 7 * 1440 + 360;     // hari 8, 06:00
const WALK = { house: 1, yard: 1, room: 1 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEED_MIN = { wood: 30, metal: 22, stone: 24 }; // jaminan level bisa diselesaikan

const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const dayOf = (m) => Math.floor(m / 1440) + 1;
const hourOf = (m) => Math.floor((m % 1440) / 60);
const key = (x, y) => x + "," + y;
const halfOf = (x) => (x < 13 ? 0 : 1);
const fmtTime = (m) => {
    const h = hourOf(m), mm = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
};

/* mulberry32 dengan state tersimpan di st.rng (deterministik & sinkron online) */
function rnd(st) {
    st.rng = (st.rng + 0x6d2b79f5) | 0;
    let t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function walkable(g, x, y) {
    return y >= 0 && y < H && x >= 0 && x < W && !!WALK[g[y][x]];
}
function path(g, fx, fy, tx, ty) {
    if (!walkable(g, fx, fy) || !walkable(g, tx, ty)) return null;
    if (fx === tx && fy === ty) return [];
    const prev = new Int32Array(W * H).fill(-1);
    const seen = new Uint8Array(W * H);
    const start = fy * W + fx, goal = ty * W + tx;
    const q = [start]; seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
        const c = q[h], cx = c % W, cy = (c - cx) / W;
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (!walkable(g, nx, ny)) continue;
            const ni = ny * W + nx;
            if (seen[ni]) continue;
            seen[ni] = 1; prev[ni] = c; q.push(ni);
            if (ni === goal) {
                const out = []; let k = ni;
                while (k !== start) { out.push({ x: k % W, y: Math.floor(k / W) }); k = prev[k]; }
                return out.reverse();
            }
        }
    }
    return null;
}
function distmap(g, fx, fy) {
    const d = new Map([[fy * W + fx, 0]]);
    const q = [fy * W + fx];
    for (let h = 0; h < q.length; h++) {
        const c = q[h], cx = c % W, cy = (c - cx) / W;
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (!walkable(g, nx, ny)) continue;
            const ni = ny * W + nx;
            if (d.has(ni)) continue;
            d.set(ni, d.get(c) + 1); q.push(ni);
        }
    }
    return d;
}

/* ---------- level generator: acak, simetris adil, dijamin solvable ---------- */
function makeState(seed) {
    const grid = [];
    for (let y = 0; y < H; y++) {
        const row = [];
        for (let x = 0; x < W; x++) {
            if (y > SURF) row.push("soil");
            else if (y >= SURF - 1 && HOUSES.some(([a, b]) => x >= a && x <= b)) row.push("house");
            else if (y === SURF) row.push("yard");
            else row.push("sky");
        }
        grid.push(row);
    }
    const st = {
        v: 1, rng: seed | 0, min: 360, deadline: DEADLINE,
        over: false, winner: null, reason: "", log: "Day 1. The race begins.", event: "",
        cheated: false, grid, nodes: [], caches: {}, facilMap: {}, owners: {},
        seats: [0, 1], turn: 0, first: 0,
        players: [
            { px: 3, py: SURF }, { px: 22, py: SURF },
        ],
    };
    for (const p of st.players) {
        p.hunger = 20; p.energy = 100; p.health = 100;
        p.inv = { wood: 0, metal: 0, stone: 0, food: 4 };
        p.dug = 0; p.facil = { storage: 0, bed: 0, generator: 0, farm: 0, radio: 0 };
        p.lastScout = 0; p.alive = true;
    }
    // node permukaan: posisi acak, stok acak, dicerminkan ke paruh lawan
    const cand = [0, 1, 6, 7, 8, 9, 10, 11, 12];
    for (let i = cand.length - 1; i > 0; i--) {
        const j = Math.floor(rnd(st) * (i + 1));
        [cand[i], cand[j]] = [cand[j], cand[i]];
    }
    const types = ["tree", "tree", "scrap", "scrap", "rocks", "rocks", "bush", "bush"];
    types.forEach((t, i) => {
        const x = cand[i];
        let s;
        if (t === "tree") s = 15 + Math.floor(rnd(st) * 4);
        else if (t === "scrap") s = 12 + Math.floor(rnd(st) * 3);
        else if (t === "rocks") s = 13 + Math.floor(rnd(st) * 3);
        else s = 8;
        st.nodes.push({ type: t, x, y: SURF, stock: s });
        st.nodes.push({ type: t, x: 25 - x, y: SURF, stock: s });
    });
    ensureSolvable(st);
    // cache tersembunyi di bawah tanah (dicerminkan)
    const used = new Set();
    for (let i = 0; i < 4; i++) {
        let x, y;
        do {
            x = Math.floor(rnd(st) * 13);
            y = SURF + 1 + Math.floor(rnd(st) * (H - SURF - 1));
        } while (used.has(key(x, y)));
        used.add(key(x, y));
        const r = RES[Math.floor(rnd(st) * 4)], amt = 2 + Math.floor(rnd(st) * 3);
        st.caches[key(x, y)] = { res: r, amt };
        st.caches[key(25 - x, y)] = { res: r, amt };
    }
    st.turn = Math.floor(rnd(st) * 2); // giliran pertama acak
    st.first = st.turn;
    return st;
}
function ensureSolvable(st) {
    for (const half of [0, 1]) {
        for (const r of Object.keys(NEED_MIN)) {
            const ns = st.nodes.filter((n) => halfOf(n.x) === half && NODE_RES[n.type] === r);
            const tot = ns.reduce((a, n) => a + n.stock, 0);
            if (tot < NEED_MIN[r] && ns.length) ns[0].stock += NEED_MIN[r] - tot;
        }
    }
}

/* ---------- ekonomi & objektif ---------- */
const capOf = (p) => CAP_BASE + (p.facil.storage ? CAP_ST : 0);
function addRes(p, r, n) {
    const c = capOf(p), b = p.inv[r];
    p.inv[r] = Math.min(c, b + n);
    return p.inv[r] - b;
}
const afford = (inv, c) => Object.keys(c).every((r) => (inv[r] || 0) >= c[r]);
function pay(p, c) { for (const r of Object.keys(c)) p.inv[r] -= c[r]; }
function ready(p) {
    let n = 0;
    if (p.dug >= DIG_TARGET) n++;
    for (const f of FIDS) if (p.facil[f] >= 1) n++;
    for (const r of RES) if (p.inv[r] >= TARGETS[r]) n++;
    return Math.round((n / 10) * 100);
}
const F = (m) => ({ ok: false, msg: m });
const OK = (m) => ({ ok: true, msg: m });

/* ---------- waktu, ancaman harian, akhir permainan ---------- */
function advance(st, mins) {
    const t = st.min + mins;
    while (st.min < t) {
        const ds = Math.floor(st.min / 1440) * 1440;
        let six = ds + 360;
        if (six <= st.min) six += 1440;
        const stop = Math.min(six, t);
        st.min = stop;
        if (st.min === six) dayTick(st);
    }
}
function dayTick(st) {
    for (const n of st.nodes) if (n.type === "bush") n.stock = Math.min(8, n.stock + 2);
    for (const p of st.players) if (p.alive && p.facil.farm) addRes(p, "food", 3);
    const r = rnd(st);
    if (r < 0.22) { // raiders
        const lost = [];
        st.players.forEach((p, i) => {
            if (!p.alive) return;
            const opts = RES.filter((x) => p.inv[x] > 0);
            if (!opts.length) return;
            const rr = opts[Math.floor(rnd(st) * opts.length)];
            const n = Math.min(p.inv[rr], p.facil.storage ? 1 : 3);
            p.inv[rr] -= n; lost.push("P" + (i + 1) + " -" + n + " " + rr);
        });
        st.event = "Raiders hit the yard! " + (lost.length ? lost.join(", ") + "." : "Nothing taken.");
    } else if (r < 0.42) { // cave-in
        const hit = [];
        st.players.forEach((p, i) => {
            const rooms = Object.keys(st.owners).filter((k) => {
                if (st.owners[k] !== i || st.facilMap[k]) return false;
                const [x, y] = k.split(",").map(Number);
                return st.grid[y][x] === "room";
            });
            if (!rooms.length) return;
            const k = rooms[Math.floor(rnd(st) * rooms.length)];
            const [x, y] = k.split(",").map(Number);
            st.grid[y][x] = "soil"; delete st.owners[k];
            p.dug = Math.max(0, p.dug - 1); hit.push("P" + (i + 1));
        });
        st.event = "Cave-in! " + (hit.length ? hit.join(", ") + " lost a tunnel." : "No tunnels lost.");
    } else if (r < 0.58) { // storm
        const hurt = [];
        st.players.forEach((p, i) => {
            if (p.alive && p.py <= SURF) { p.health = cl(p.health - 6, 0, 100); hurt.push("P" + (i + 1)); }
        });
        st.event = "Storm rolls in. " + (hurt.length ? hurt.join(", ") + " caught outside (-6 health)." : "Everyone sheltered.");
    } else if (r < 0.72) { // windfall
        for (const p of st.players) if (p.alive) addRes(p, "food", 2);
        st.event = "Windfall: +2 food for everyone.";
    } else {
        st.event = "A quiet dawn.";
    }
}
function end(st, w, reason) { st.over = true; st.winner = w; st.reason = reason; }
function checkEnd(st, actor) {
    const ps = st.players;
    for (const p of ps) if (p.health <= 0) p.alive = false;
    const r = [ready(ps[0]), ready(ps[1])];
    if (!ps[0].alive && !ps[1].alive) return end(st, -1, "Both preppers collapsed.");
    if (!ps[actor].alive) return end(st, 1 - actor, "Health gave out.");
    if (!ps[1 - actor].alive) return end(st, actor, "The rival collapsed.");
    if (r[actor] >= 100) return end(st, actor, "Bunker complete.");
    if (r[1 - actor] >= 100) return end(st, 1 - actor, "The rival finished first.");
    if (st.min >= st.deadline) {
        const w = r[0] === r[1] ? -1 : r[0] > r[1] ? 0 : 1;
        end(st, w, "The inspectors arrived.");
    }
}

/* ---------- satu giliran = satu aksi (60 menit, istirahat 6 jam) ---------- */
function runTurn(st, actor, mins, work, opts = {}) {
    const p = st.players[actor];
    if (!opts.free && p.energy < 8) return F("Too exhausted - rest.");
    const night = hourOf(st.min) < 6;
    const msg = work() || "";
    if (opts.rest) {
        p.energy = p.facil.bed ? 100 : 70;
        p.hunger = cl(p.hunger + 6, 0, 100);
    } else {
        p.energy = cl(p.energy - 5, 0, 100);
        p.hunger = cl(p.hunger + 4, 0, 100);
        if (night && !p.facil.generator) { // ancaman malam tanpa generator
            p.energy = cl(p.energy - 3, 0, 100);
            p.health = cl(p.health - 2, 0, 100);
        }
    }
    if (p.hunger >= 90) p.health = cl(p.health - 4, 0, 100);
    else if (p.energy <= 10) p.health = cl(p.health - 2, 0, 100);
    else if (p.hunger < 50 && p.energy > 50) p.health = cl(p.health + 1, 0, 100);
    advance(st, mins);
    st.log = msg;
    checkEnd(st, actor);
    if (!st.over) st.turn = 1 - actor;
    return OK(msg);
}
function bestSpot(st, p, x, y, allowOn) {
    const g = st.grid; let best = null, bl = Infinity;
    const cands = [];
    if (allowOn && walkable(g, x, y)) cands.push([x, y]);
    for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (walkable(g, nx, ny)) cands.push([nx, ny]);
    }
    for (const [cx, cy] of cands) {
        const pp = path(g, p.px, p.py, cx, cy);
        if (pp && pp.length < bl) { bl = pp.length; best = { x: cx, y: cy, path: pp }; }
    }
    return best;
}

/* klik sel = jalan otomatis (maks STRIDE) + langsung beraksi bila sampai */
function smartCell(st, actor, x, y, build) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return F("Out of bounds.");
    const p = st.players[actor], g = st.grid, cell = g[y][x];
    const node = st.nodes.find((n) => n.x === x && n.y === y && n.stock > 0) || null;
    const k = key(x, y);
    let kind = null, allowOn = false;
    if (node) { kind = "gather"; allowOn = true; }
    else if (build) {
        if (cell !== "room" || st.facilMap[k]) return F("Need an empty dug room.");
        if (p.facil[build] >= 1) return F("Already built.");
        if (!afford(p.inv, COSTS[build])) return F("Not enough materials.");
        kind = "build";
    }
    else if (cell === "soil") kind = "dig";
    else if (cell === "facility") kind = st.facilMap[k] === "bed" ? "restAt" : "visit";
    else if (WALK[cell]) kind = "walk";
    else return F("Nothing there.");
    let spot;
    if (kind === "walk") {
        const pp = path(g, p.px, p.py, x, y);
        if (!pp) return F("No open route - dig a tunnel.");
        if (!pp.length) return F("Already here.");
        spot = { x, y, path: pp };
    } else {
        spot = bestSpot(st, p, x, y, allowOn);
        if (!spot) return F("No open route - dig a tunnel.");
    }
    const pp = spot.path, arrived = pp.length <= STRIDE;
    const work = () => {
        const steps = pp.slice(0, STRIDE);
        if (steps.length) { p.px = steps[steps.length - 1].x; p.py = steps[steps.length - 1].y; }
        if (!arrived) return "Moving closer...";
        if (kind === "gather") {
            const amt = Math.min(node.stock, 2 + (rnd(st) < 0.35 ? 1 : 0));
            node.stock -= amt;
            const got = addRes(p, NODE_RES[node.type], amt);
            return "Gathered " + got + " " + NODE_RES[node.type] + "." + (got < amt ? " Storage full!" : "");
        }
        if (kind === "dig") {
            g[y][x] = "room"; st.owners[k] = actor; p.dug++;
            let m = "Dug a bunker cell.";
            if (st.caches[k]) {
                const c = st.caches[k]; delete st.caches[k];
                const got = addRes(p, c.res, c.amt);
                m += " Found a cache: +" + got + " " + c.res + "!";
            }
            return m;
        }
        if (kind === "build") {
            pay(p, COSTS[build]); g[y][x] = "facility"; st.facilMap[k] = build; p.facil[build]++;
            return build.charAt(0).toUpperCase() + build.slice(1) + " built.";
        }
        if (kind === "restAt") return "Rested in bed.";
        if (kind === "visit") return "At the " + st.facilMap[k] + ".";
        return "Moved.";
    };
    const rest = kind === "restAt" && arrived;
    return runTurn(st, actor, rest ? REST_MIN : ACTION_MIN, work, { rest });
}

/* ---------- cheat (hanya offline) ---------- */
function applyCheat(st, actor, cid) {
    const p = st.players[actor];
    st.cheated = true;
    if (cid === "res") { for (const r of RES) p.inv[r] = Math.min(99, p.inv[r] + 12); }
    else if (cid === "stats") { p.hunger = 0; p.energy = 100; p.health = 100; }
    else if (cid === "time") { st.deadline += 2880; }
    else if (cid === "stock") { for (const r of RES) p.inv[r] = Math.max(p.inv[r], TARGETS[r]); }
    else if (cid === "dig" || cid === "build") {
        const [hx1, hx2] = HOUSES[actor];
        const rooms = [];
        for (let y = SURF + 1; y < H; y++)
            for (let x = hx1; x <= hx2; x++)
                if (st.grid[y][x] === "room" && !st.facilMap[key(x, y)]) rooms.push([x, y]);
        const digMore = (n) => {
            for (let y = SURF + 1; y < H && n > 0; y++)
                for (let x = hx1; x <= hx2 && n > 0; x++)
                    if (st.grid[y][x] === "soil") {
                        st.grid[y][x] = "room"; st.owners[key(x, y)] = actor; p.dug++;
                        rooms.push([x, y]); n--;
                    }
        };
        if (cid === "dig") { if (p.dug < DIG_TARGET) digMore(DIG_TARGET - p.dug); }
        else {
            const missing = FIDS.filter((f) => !p.facil[f]);
            if (rooms.length < missing.length) digMore(missing.length - rooms.length);
            for (const f of missing) {
                const [x, y] = rooms.shift(); const k = key(x, y);
                st.grid[y][x] = "facility"; st.facilMap[k] = f; p.facil[f]++;
            }
            p.dug = Math.max(p.dug, DIG_TARGET);
        }
    }
    checkEnd(st, actor);
    return OK("Cheat applied.");
}

/* ---------- dispatcher aksi (dipakai pemain, bot, dan host online) ---------- */
function stepGame(st, a, actor, online) {
    if (!st || st.over) return F("Game over.");
    const p = st.players[actor];
    if (!p || !p.alive) return F("Eliminated.");
    const t = a.type;
    if (t === "cheat") {
        if (online) return F("Cheats are offline only.");
        return applyCheat(st, actor, a.id);
    }
    if (actor !== st.turn) return F("Not your turn.");
    if (t === "eat") {
        if (p.inv.food < 1) return F("No food.");
        return runTurn(st, actor, ACTION_MIN, () => {
            p.inv.food--; p.hunger = cl(p.hunger - 40, 0, 100); return "Ate a meal.";
        }, { free: true });
    }
    if (t === "rest") return runTurn(st, actor, REST_MIN, () => "Rested.", { rest: true, free: true });
    if (t === "scout") {
        const d = dayOf(st.min);
        if (p.lastScout === d) return F("Already scouted today.");
        return runTurn(st, actor, ACTION_MIN, () => {
            p.lastScout = d;
            const r = rnd(st);
            const rr = r < 0.35 ? "food" : r < 0.6 ? "metal" : r < 0.8 ? "wood" : "stone";
            const amt = 2 + (rnd(st) < 0.5 ? 1 : 0);
            const got = addRes(p, rr, amt);
            return "Scouted town: +" + got + " " + rr + ".";
        });
    }
    if (t === "move") {
        const dx = cl(a.dx | 0, -1, 1), dy = cl(a.dy | 0, -1, 1);
        if (!dx && !dy) return F("Blocked.");
        const g = st.grid, steps = [];
        let cx = p.px, cy = p.py;
        for (let i = 0; i < STRIDE; i++) {
            const nx = cx + dx, ny = cy + dy;
            if (!walkable(g, nx, ny)) break;
            steps.push([nx, ny]); cx = nx; cy = ny;
        }
        if (!steps.length) return F("Blocked.");
        return runTurn(st, actor, ACTION_MIN, () => {
            p.px = steps[steps.length - 1][0]; p.py = steps[steps.length - 1][1];
            return "Moved.";
        });
    }
    if (t === "cell") return smartCell(st, actor, a.x | 0, a.y | 0, a.build);
    return F("Unknown action.");
}

/* ---------- BOT (mode AI) ---------- */
function nearestSoil(st, seat) {
    const p = st.players[seat], d = distmap(st.grid, p.px, p.py);
    let best = null, bs = Infinity;
    for (const [c, dd] of d) {
        const cx = c % W, cy = (c - cx) / W;
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H || st.grid[ny][nx] !== "soil") continue;
            const s = dd + (halfOf(nx) !== seat ? 8 : 0);
            if (s < bs) { bs = s; best = [nx, ny]; }
        }
    }
    return best;
}
function nearestRoom(st, seat) {
    const p = st.players[seat], d = distmap(st.grid, p.px, p.py);
    let best = null, bs = Infinity;
    for (const [c, dd] of d) {
        const cx = c % W, cy = (c - cx) / W;
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const k = key(nx, ny);
            if (st.grid[ny][nx] !== "room" || st.facilMap[k]) continue;
            const s = dd + (st.owners[k] !== seat ? 4 : 0);
            if (s < bs) { bs = s; best = [nx, ny]; }
        }
    }
    return best;
}
function nearestNode(st, seat, res) {
    const p = st.players[seat]; let best = null, bs = Infinity;
    for (const n of st.nodes) {
        if (n.stock <= 0 || NODE_RES[n.type] !== res) continue;
        const sp = bestSpot(st, p, n.x, n.y, true);
        if (!sp) continue;
        const s = sp.path.length + (halfOf(n.x) !== seat ? 6 : 0);
        if (s < bs) { bs = s; best = [n.x, n.y]; }
    }
    return best;
}
function botChoose(st, seat) {
    const p = st.players[seat];
    if (p.hunger >= 70 && p.inv.food > 0) return { type: "eat" };
    if (p.energy <= 15) return { type: "rest" };
    if (hourOf(st.min) < 6 && !p.facil.generator && p.energy < 50) return { type: "rest" };
    for (const f of FIDS) {
        if (!p.facil[f] && afford(p.inv, COSTS[f])) {
            const r = nearestRoom(st, seat);
            if (r) return { type: "cell", x: r[0], y: r[1], build: f };
            const s = nearestSoil(st, seat);
            return s ? { type: "cell", x: s[0], y: s[1] } : { type: "rest" };
        }
    }
    if (p.dug < DIG_TARGET) {
        const s = nearestSoil(st, seat);
        if (s) return { type: "cell", x: s[0], y: s[1] };
    }
    const need = {};
    for (const r of RES) {
        let n = TARGETS[r] - p.inv[r];
        for (const f of FIDS) if (!p.facil[f]) n += COSTS[f][r] || 0;
        need[r] = n;
    }
    let rr = RES[0];
    for (const r of RES) if (need[r] > need[rr]) rr = r;
    if (need[rr] > 0) {
        const n = nearestNode(st, seat, rr);
        if (n) return { type: "cell", x: n[0], y: n[1] };
        if (p.lastScout !== dayOf(st.min)) return { type: "scout" };
        return { type: "rest" };
    }
    return { type: "rest" };
}

/* ================================================================
 * MOUNT — UI minimalis, input mouse/keyboard/sentuh, online & bot.
 * ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let buildMode = null;      // fasilitas yang dipilih untuk dibangun
    let flashMsg = null;       // pesan lokal sementara (mis. "not your turn")
    let botTimer = null;
    const unsubs = [];

    const mySeat = () => (online ? (state ? state.seats[room.isHost ? 0 : 1] : 0) : 0);
    const rivalName = online ? "Rival" : "Bot";
    const myName = playerName || "You";

    root.innerHTML = `
<style>
.bp{--p:#131a2c;--l:#ffffff16;--t:#e7eaf0;--m:#8b93a7;--a:#f59e0b;--b:#38bdf8;
  color:var(--t);font-size:13px;display:flex;flex-direction:column;gap:10px;width:100%}
.bp *{box-sizing:border-box}
.bp [hidden]{display:none!important}
.bp .bp-intro{display:flex;align-items:center;gap:10px}
.bp .bp-intro h2{margin:0;font-size:16px;font-weight:700;letter-spacing:.2px}
.bp .bp-intro .game-status{margin-left:auto}
.bp .bp-icon{border:1px solid var(--l);background:transparent;color:var(--m);border-radius:8px;
  width:28px;height:28px;cursor:pointer;font-size:14px;line-height:1}
.bp .bp-icon:hover{color:var(--t);border-color:#ffffff33}
.bp .bp-main{display:grid;grid-template-columns:minmax(0,1fr) 264px;gap:12px;align-items:start}
.bp .bp-boardwrap{position:relative;padding:8px;background:var(--p);border:1px solid var(--l);border-radius:14px}
.bp svg{width:100%;height:auto;display:block;border-radius:10px;user-select:none;touch-action:manipulation}
.bp .bp-note{min-height:18px;margin-top:6px;color:var(--m);font-size:11.5px;line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bp .bp-side{display:flex;flex-direction:column;gap:8px;min-width:0}
.bp .bp-sec{background:var(--p);border:1px solid var(--l);border-radius:12px;padding:8px 10px}
.bp .bp-h{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--m);margin:0 0 6px}
.bp .bp-card{background:var(--p);border:1px solid var(--l);border-radius:12px;padding:8px 10px;margin-bottom:6px}
.bp .bp-card.on{border-color:var(--a)}
.bp .bp-card.on.s1{border-color:var(--b)}
.bp .bp-card .nm{display:flex;justify-content:space-between;font-weight:700;font-size:12px;margin-bottom:5px}
.bp .bp-card .nm em{font-style:normal;color:var(--m);font-weight:600}
.bp .bp-bar{height:5px;border-radius:99px;background:#0b1020;overflow:hidden;margin-bottom:6px}
.bp .bp-bar i{display:block;height:100%;background:var(--a);border-radius:99px}
.bp .bp-card.s1 .bp-bar i{background:var(--b)}
.bp .bp-stats{display:flex;gap:8px;font-size:10.5px;color:var(--m);flex-wrap:wrap}
.bp .bp-stats b{color:var(--t);font-weight:600}
.bp .bp-stats b.warn{color:#f87171}
.bp .bp-row{display:flex;gap:6px;flex-wrap:wrap}
.bp .bp-btn{flex:1;min-width:64px;border:1px solid var(--l);background:#182136;color:var(--t);
  border-radius:9px;padding:7px 8px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.bp .bp-btn:hover:not(:disabled){border-color:#ffffff3d}
.bp .bp-btn:disabled{opacity:.38;cursor:default}
.bp .bp-pal{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.bp .bp-pal button{display:flex;flex-direction:column;gap:1px;align-items:flex-start;text-align:left;
  border:1px solid var(--l);background:#182136;color:var(--t);border-radius:9px;padding:6px 8px;
  font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}
.bp .bp-pal button small{font-size:9.5px;font-weight:500;color:var(--m)}
.bp .bp-pal button.on{border-color:var(--a);background:#2a2410}
.bp .bp-pal button:disabled{opacity:.38;cursor:default}
.bp .bp-dpad{display:none;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,40px);
  gap:5px;justify-content:center;padding:4px 0}
.bp .bp-dpad button{border:1px solid var(--l);background:#182136;color:var(--t);border-radius:9px;
  font-size:15px;cursor:pointer}
.bp .bp-dpad button:active{background:#243050}
.bp .bp-cheatbtn{border:1px dashed #ffffff2a;background:transparent;color:var(--m);border-radius:9px;
  padding:6px;font:inherit;font-size:11px;cursor:pointer}
.bp .bp-cheatbtn:hover{color:var(--t)}
.bp .bp-ov{position:absolute;inset:8px;border-radius:10px;background:#0b1020e6;display:flex;
  align-items:center;justify-content:center;z-index:5}
.bp .bp-ovcard{background:var(--p);border:1px solid var(--l);border-radius:14px;padding:18px 20px;
  max-width:340px;width:calc(100% - 32px);text-align:center}
.bp .bp-ovcard h3{margin:0 0 6px;font-size:16px}
.bp .bp-ovcard p{margin:0 0 12px;color:var(--m);font-size:12px;line-height:1.5}
.bp .bp-cheats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
.bp .bp-cheats button{border:1px solid var(--l);background:#182136;color:var(--t);border-radius:8px;
  padding:7px 6px;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.bp .bp-cheats button:hover{border-color:var(--a)}
.bp .bp-cell{fill:transparent;cursor:pointer}
.bp .bp-cell:hover{fill:#ffffff12}
.bp .bp-cell.act:hover{fill:#f59e0b22;stroke:#f59e0b88;stroke-width:1.5}
.bp .bp-cell.build:hover{fill:#38bdf822;stroke:#38bdf888;stroke-width:1.5}
.bp .bp-cell.no{cursor:default}
.bp .bp-cell.no:hover{fill:transparent}
@media (pointer:coarse){.bp .bp-dpad{display:grid}}
@media (max-width:860px){
  .bp .bp-main{grid-template-columns:1fr}
  .bp .bp-dpad{display:grid}
  .bp .bp-note{white-space:normal}
}
</style>
<div class="game-app bp">
  <div class="game-intro bp-intro">
    <div><h2>Bunker Prepper</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <button class="bp-icon" type="button" data-act="reroll" title="New map" aria-label="New map">&#8635;</button>
  </div>
  <div class="bp-main">
    <section class="game-panel bp-boardwrap" data-board>
      <svg data-el="svg" viewBox="0 0 832 384" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Bunker cross-section"></svg>
      <div class="bp-note" data-el="note"></div>
      <div class="bp-ov" data-ov="cheat" hidden>
        <div class="bp-ovcard">
          <h3>Cheats</h3>
          <div class="bp-cheats">
            <button type="button" data-cheat="res">+12 all resources</button>
            <button type="button" data-cheat="stats">Full stats</button>
            <button type="button" data-cheat="dig">Auto-dig bunker</button>
            <button type="button" data-cheat="build">Build everything</button>
            <button type="button" data-cheat="stock">Fill stockpile</button>
            <button type="button" data-cheat="time">+2 days deadline</button>
          </div>
          <button class="bp-btn" type="button" data-act="closecheat">Close</button>
        </div>
      </div>
      <div class="bp-ov" data-ov="over" hidden>
        <div class="bp-ovcard">
          <h3 data-ov="title">Game over</h3>
          <p data-ov="reason"></p>
          <button class="bp-btn" type="button" data-act="restart">Play again</button>
        </div>
      </div>
      <div class="bp-ov" data-ov="wait" hidden>
        <div class="bp-ovcard"><h3>Waiting for host&hellip;</h3></div>
      </div>
    </section>
    <aside class="bp-side">
      <div data-el="cards"></div>
      <div class="bp-sec"><div class="bp-row" data-el="acts"></div></div>
      <div class="bp-sec"><div class="bp-h">Build</div><div class="bp-pal" data-el="pal"></div></div>
      <div class="bp-dpad" data-el="dpad">
        <span></span><button type="button" data-move="0,-1" aria-label="Up">&#8593;</button><span></span>
        <button type="button" data-move="-1,0" aria-label="Left">&#8592;</button>
        <button type="button" data-move="0,1" aria-label="Down">&#8595;</button>
        <button type="button" data-move="1,0" aria-label="Right">&#8594;</button>
      </div>
      <button class="bp-cheatbtn" type="button" data-act="cheats" data-el="cheatbtn">Cheats</button>
    </aside>
  </div>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svg = $('[data-el="svg"]'), noteEl = $('[data-el="note"]');
    const cardsEl = $('[data-el="cards"]'), actsEl = $('[data-el="acts"]'), palEl = $('[data-el="pal"]');
    const statusEl = $('[data-status]'), cheatBtn = $('[data-el="cheatbtn"]');
    const ovCheat = $('[data-ov="cheat"]'), ovOver = $('[data-ov="over"]'), ovWait = $('[data-ov="wait"]');
    const ovTitle = $('[data-ov="title"]'), ovReason = $('[data-ov="reason"]');

    /* ---------------- render ---------------- */
    const cx = (x) => x * CELL + CELL / 2;
    const cy = (y) => y * CELL + CELL / 2;
    const SEAT_COL = ["#f59e0b", "#38bdf8"];

    const FACIL_ICON = {
        storage: '<rect x="-10" y="-8" width="20" height="16" rx="2" fill="#8a6a3f"/><path d="M-10 0h20M0 -8v16" stroke="#5c4326" stroke-width="1.6"/>',
        bed: '<rect x="-11" y="-2" width="22" height="7" rx="2" fill="#60a5fa"/><rect x="-9" y="-5" width="7" height="4" rx="1.5" fill="#e5e7eb"/><path d="M-11 5v3M11 5v3" stroke="#4b5563" stroke-width="2"/>',
        generator: '<rect x="-9" y="-7" width="18" height="14" rx="2" fill="#334155"/><polygon points="-1,-4 3,-4 1,0 4,0 -3,5 -1,1 -4,1" fill="#fde047"/>',
        farm: '<rect x="-11" y="3" width="22" height="5" rx="1.5" fill="#155e75"/><path d="M0 3v-7" stroke="#4ade80" stroke-width="2"/><circle cx="-3" cy="-4" r="2.4" fill="#22c55e"/><circle cx="3" cy="-6" r="2.4" fill="#22c55e"/>',
        radio: '<rect x="-9" y="-3" width="18" height="10" rx="2" fill="#1f2937"/><circle cx="-4" cy="2" r="2.2" fill="#f87171"/><path d="M2 0h5M2 4h5" stroke="#9ca3af" stroke-width="1.4"/><path d="M6 -3l5 -8" stroke="#9ca3af" stroke-width="1.6"/>',
    };

    function nodeIcon(n) {
        const c = n.stock > 0;
        let s = "";
        if (n.type === "tree")
            s = '<rect x="-2" y="2" width="4" height="9" fill="#6b4f2e"/><polygon points="0,-13 9,3 -9,3" fill="' + (c ? "#3f9d63" : "#4b5563") + '"/>';
        else if (n.type === "scrap")
            s = '<rect x="-8" y="-6" width="16" height="14" rx="2" fill="' + (c ? "#9aa4b2" : "#4b5563") + '" transform="rotate(-8)"/><path d="M-5 -1h10M-5 3h7" stroke="#556070" stroke-width="1.6"/>';
        else if (n.type === "rocks")
            s = '<circle cx="-5" cy="4" r="6" fill="' + (c ? "#8d8579" : "#4b5563") + '"/><circle cx="5" cy="5" r="5" fill="' + (c ? "#a09a8c" : "#57534e") + '"/><circle cx="0" cy="-3" r="5.5" fill="' + (c ? "#b3ada0" : "#57534e") + '"/>';
        else
            s = '<circle cx="-4" cy="2" r="6" fill="' + (c ? "#3f9d63" : "#4b5563") + '"/><circle cx="4" cy="2" r="6" fill="' + (c ? "#357f52" : "#4b5563") + '"/>' +
                (c ? '<circle cx="-3" cy="0" r="1.6" fill="#f87171"/><circle cx="3" cy="3" r="1.6" fill="#f87171"/><circle cx="0" cy="-3" r="1.6" fill="#f87171"/>' : "");
        s += '<text y="16" fill="#8b93a7" font-size="8.5" text-anchor="middle" font-family="inherit">' + n.stock + "</text>";
        return s;
    }

    function renderBoard() {
        const st = state, me = mySeat(), myTurn = !st.over && st.turn === me;
        const h = hourOf(st.min);
        const sky = h >= 6 && h < 18 ? "#182338" : "#0b101f";
        const parts = [];
        parts.push('<rect x="0" y="0" width="832" height="128" fill="' + sky + '"/>');
        const isDay = h >= 6 && h < 18;
        const pr = isDay ? (h - 6) / 12 : ((h - 18 + 24) % 24) / 12;
        parts.push('<circle cx="' + (40 + pr * 752) + '" cy="' + (30 - Math.sin(Math.PI * pr) * 12) + '" r="7" fill="' + (isDay ? "#fbbf24" : "#cbd5e1") + '" opacity=".9"/>');
        parts.push('<rect x="0" y="126" width="832" height="3" fill="#3f6212" opacity=".7"/>');
        parts.push('<rect x="0" y="128" width="832" height="256" fill="#241c14"/>');
        // houses
        HOUSES.forEach(([a, b], i) => {
            const x = a * CELL, w = (b - a + 1) * CELL;
            parts.push('<polygon points="' + (x - 8) + ',66 ' + (x + w / 2) + ',40 ' + (x + w + 8) + ',66" fill="#24304a"/>');
            parts.push('<rect x="' + x + '" y="66" width="' + w + '" height="62" fill="#1b2436" stroke="#ffffff14"/>');
            parts.push('<rect x="' + (x + w / 2 - 7) + '" y="96" width="14" height="32" fill="#0d1322"/>');
            parts.push('<text x="' + (x + w / 2) + '" y="60" fill="' + SEAT_COL[i] + '" font-size="9" font-weight="700" text-anchor="middle" font-family="inherit">P' + (i + 1) + "</text>");
        });
        // underground cells
        for (let y = SURF + 1; y < H; y++)
            for (let x = 0; x < W; x++) {
                const c = st.grid[y][x], px = x * CELL, py = y * CELL;
                if (c === "soil") {
                    parts.push('<rect x="' + px + '" y="' + py + '" width="32" height="32" fill="#241c14" stroke="#ffffff05"/>');
                    if ((x * 7 + y * 13) % 4 === 0)
                        parts.push('<circle cx="' + (px + 10 + ((x * 5 + y * 3) % 12)) + '" cy="' + (py + 12 + ((x * 3 + y * 7) % 10)) + '" r="1.6" fill="#3a2d1e"/>');
                } else {
                    parts.push('<rect x="' + (px + 1) + '" y="' + (py + 1) + '" width="30" height="30" rx="3" fill="#0d1322" stroke="#2c3a55"/>');
                    if (c === "facility") {
                        const fid = st.facilMap[key(x, y)];
                        parts.push('<g transform="translate(' + cx(x) + "," + cy(y) + ')">' + (FACIL_ICON[fid] || "") + "</g>");
                    }
                }
            }
        // nodes
        for (const n of st.nodes) {
            if (n.stock <= 0 && n.type !== "bush") continue;
            parts.push('<g transform="translate(' + cx(n.x) + "," + (cy(n.y) - 2) + ')">' + nodeIcon(n) + "</g>");
        }
        // characters
        st.players.forEach((p, i) => {
            const active = !st.over && st.turn === i;
            parts.push('<g transform="translate(' + cx(p.px) + "," + cy(p.py) + ')">' +
                (active ? '<circle r="12" fill="none" stroke="' + SEAT_COL[i] + '" stroke-width="1.5" stroke-dasharray="3 3" opacity=".9"/>' : "") +
                '<circle r="9" fill="' + (p.alive ? SEAT_COL[i] : "#4b5563") + '"/>' +
                '<text y="3.5" fill="#0b1020" font-size="10" font-weight="800" text-anchor="middle" font-family="inherit">' + (i + 1) + "</text></g>");
        });
        // click layer
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const c = st.grid[y][x];
                const node = st.nodes.find((n) => n.x === x && n.y === y && n.stock > 0);
                let cls = "bp-cell";
                if (!myTurn) cls += " no";
                else if (buildMode && c === "room" && !st.facilMap[key(x, y)]) cls += " build";
                else if (node || c === "soil") cls += " act";
                parts.push('<rect class="' + cls + '" data-cell="' + x + "," + y + '" x="' + x * CELL + '" y="' + y * CELL + '" width="32" height="32"/>');
            }
        svg.innerHTML = parts.join("");
    }

    function statHtml(p) {
        const w = (v, bad) => '<b class="' + (bad ? "warn" : "") + '">' + Math.round(v) + "</b>";
        return '<span>HUN ' + w(p.hunger, p.hunger >= 90) + "</span>" +
            "<span>EN " + w(p.energy, p.energy <= 10) + "</span>" +
            "<span>HP " + w(p.health, p.health <= 30) + "</span>";
    }
    function renderCards() {
        const me = mySeat();
        cardsEl.innerHTML = state.players.map((p, i) => {
            const nm = i === me ? myName + " (you)" : rivalName;
            const r = ready(p);
            const inv = RES.map((x) => x.charAt(0).toUpperCase() + " " + p.inv[x]).join(" · ");
            return '<div class="bp-card s' + i + (!state.over && state.turn === i ? " on" : "") + '">' +
                '<div class="nm"><span style="color:' + SEAT_COL[i] + '">' + nm + "</span><em>" + r + "%</em></div>" +
                '<div class="bp-bar"><i style="width:' + r + '%"></i></div>' +
                '<div class="bp-stats">' + statHtml(p) + "</div>" +
                '<div class="bp-stats" style="margin-top:3px"><span>' + inv + "</span></div>" +
                '<div class="bp-stats" style="margin-top:3px"><span>Dig ' + p.dug + "/" + DIG_TARGET + " · Cap " + capOf(p) +
                (p.alive ? "" : ' · <b class="warn">out</b>') + "</span></div></div>";
        }).join("");
    }
    function renderControls() {
        const me = mySeat(), p = state.players[me];
        const myTurn = !state.over && state.turn === me;
        const d = dayOf(state.min);
        actsEl.innerHTML =
            '<button class="bp-btn" type="button" data-act="eat"' + (!myTurn || p.inv.food < 1 ? " disabled" : "") + ">Eat (" + p.inv.food + ")</button>" +
            '<button class="bp-btn" type="button" data-act="rest"' + (!myTurn ? " disabled" : "") + ">Rest</button>" +
            '<button class="bp-btn" type="button" data-act="scout"' + (!myTurn || p.lastScout === d ? " disabled" : "") + ">Scout</button>";
        palEl.innerHTML = FIDS.map((f) => {
            const c = COSTS[f];
            const cost = Object.keys(c).map((r) => c[r] + " " + r).join(", ");
            const dis = !myTurn || p.facil[f] >= 1 || !afford(p.inv, c);
            return '<button type="button" data-build="' + f + '"' + (dis ? " disabled" : "") +
                ' class="' + (buildMode === f ? "on" : "") + '">' +
                f.charAt(0).toUpperCase() + f.slice(1) + (p.facil[f] ? " ✓" : "") +
                "<small>" + cost + "</small></button>";
        }).join("");
        cheatBtn.hidden = online;
        root.querySelector('[data-act="reroll"]').hidden = online;
    }
    function renderStatus() {
        const me = mySeat();
        const left = Math.max(0, state.deadline - state.min);
        const tl = Math.floor(left / 1440) + "d " + Math.floor((left % 1440) / 60) + "h";
        let turnTxt;
        if (state.over) turnTxt = "Finished";
        else if (state.turn === me) turnTxt = "Your turn";
        else turnTxt = online ? "Rival's turn" : "Bot's turn";
        statusEl.textContent = turnTxt + " · Day " + dayOf(state.min) + " " + fmtTime(state.min) + " · " + tl + " left";
    }
    function renderOver() {
        if (!state.over) { ovOver.hidden = true; return; }
        const me = mySeat(), w = state.winner;
        ovTitle.textContent = w === -1 ? "Draw" : w === me ? "You win" : online ? "Rival wins" : "Bot wins";
        ovReason.textContent = state.reason + " You " + ready(state.players[me]) + "% · " +
            rivalName + " " + ready(state.players[1 - me]) + "%." +
            (state.cheated ? " (cheated)" : "");
        ovOver.hidden = false;
    }
    function render() {
        if (!state) {
            ovWait.hidden = false;
            statusEl.textContent = "Waiting for host…";
            return;
        }
        ovWait.hidden = true;
        renderBoard();
        renderCards();
        renderControls();
        renderStatus();
        renderOver();
        noteEl.textContent = flashMsg || (state.log + (state.event ? "  ·  " + state.event : ""));
    }

    /* ---------------- alur aksi ---------------- */
    function newGame() {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        state = makeState(seed);
        // posisi pemain di multiplayer diacak oleh host
        state.seats = online && Math.random() < 0.5 ? [1, 0] : [0, 1];
        buildMode = null; flashMsg = null;
    }
    function saveBest() {
        if (!state.over || online || state.cheated || state.winner !== 0) return;
        try {
            const spare = Math.max(0, Math.round((state.deadline - state.min) / 60));
            const prev = Number(localStorage.getItem(META.bestKey) || 0);
            if (spare > prev) localStorage.setItem(META.bestKey, String(spare));
        } catch (e) { /* storage tidak tersedia */ }
    }
    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (online || !state || state.over || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!state || state.over || state.turn !== 1) return;
            applyAction(botChoose(state, 1), 1);
        }, 650);
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (action.type === "restart") {
            if (state && !state.over) return;
            newGame(); publish(); scheduleBot();
            return;
        }
        if (action.type === "reroll") {
            if (online) return;
            newGame(); publish(); scheduleBot();
            return;
        }
        const r = stepGame(state, action, actor, online);
        if (!r.ok) {
            if (actor === mySeat()) { flashMsg = r.msg; render(); }
            return;
        }
        flashMsg = null;
        if (action.build) buildMode = null;
        saveBest();
        publish();
        scheduleBot();
    }
    function submitAction(action) {
        if (!state) return;
        if (action.type !== "cheat" && action.type !== "restart" && action.type !== "reroll") {
            if (state.over) return;
            if (state.turn !== mySeat()) { flashMsg = "Not your turn."; render(); return; }
        }
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------------- input: mouse / sentuh ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "reroll") { submitAction({ type: "reroll" }); return; }
            if (a === "restart") { submitAction({ type: "restart" }); return; }
            if (a === "cheats") { ovCheat.hidden = !ovCheat.hidden; return; }
            if (a === "closecheat") { ovCheat.hidden = true; return; }
            if (a === "eat" || a === "rest" || a === "scout") submitAction({ type: a });
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) { submitAction({ type: "cheat", id: ch.dataset.cheat }); return; }
        const b = t.closest("[data-build]");
        if (b) {
            buildMode = buildMode === b.dataset.build ? null : b.dataset.build;
            render();
            return;
        }
        const mv = t.closest("[data-move]");
        if (mv) {
            const [dx, dy] = mv.dataset.move.split(",").map(Number);
            submitAction({ type: "move", dx, dy });
            return;
        }
        const cell = t.closest("[data-cell]");
        if (cell) {
            const [x, y] = cell.dataset.cell.split(",").map(Number);
            const a = { type: "cell", x, y };
            if (buildMode) a.build = buildMode;
            submitAction(a);
        }
    }
    function handleContext(event) {
        if (buildMode) { event.preventDefault(); buildMode = null; render(); }
    }
    /* ---------------- input: keyboard desktop ---------------- */
    function handleKey(event) {
        if (event.repeat || !root.isConnected) return;
        const k = event.key;
        const MOVES = {
            ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
            W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
        };
        if (MOVES[k]) {
            event.preventDefault();
            submitAction({ type: "move", dx: MOVES[k][0], dy: MOVES[k][1] });
            return;
        }
        if (k === "e" || k === "E") { event.preventDefault(); submitAction({ type: "eat" }); }
        else if (k === "r" || k === "R") { event.preventDefault(); submitAction({ type: "rest" }); }
        else if (k === "t" || k === "T") { event.preventDefault(); submitAction({ type: "scout" }); }
        else if ((k === "c" || k === "C") && !online) { event.preventDefault(); ovCheat.hidden = !ovCheat.hidden; }
        else if (k === "Escape") { buildMode = null; ovCheat.hidden = true; render(); }
        else if (k >= "1" && k <= "5") {
            const f = FIDS[Number(k) - 1];
            const p = state && state.players[mySeat()];
            if (p && !state.over && state.turn === mySeat() && !p.facil[f] && afford(p.inv, COSTS[f])) {
                buildMode = buildMode === f ? null : f;
                render();
            }
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleContext);
    document.addEventListener("keydown", handleKey);

    /* ---------------- boot: online (host/guest) atau lokal vs bot ---------------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            newGame();
            publish();
            const offAction = room.onAction((action) => applyAction(action, state ? state.seats[1] : 1));
            if (typeof offAction === "function") unsubs.push(offAction);
        } else {
            render();
            const offState = room.onState((nextState) => { state = nextState; flashMsg = null; render(); });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        newGame();
        render();
        scheduleBot();
    }

    return {
        destroy() {
            if (botTimer) clearTimeout(botTimer);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleContext);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
        },
    };
}