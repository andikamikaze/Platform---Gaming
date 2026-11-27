/* ==== GAME: lost-island.js ==== */
import { iconSVG } from "../JS/icons.js";

/*
  - Template-compliant game module (export META + export mount).
  - id MUST equal the filename without .js  ->  "lost-island"
  - After editing META run: node tools/build-games-manifest.mjs
  - Lost Island: turn-based escape race. Gather resources, craft tools,
    cross the river / barrier, and fire a signal flare at the helipad
    before your rival (bot or online player) does.
*/

export const META = {
    id: "lost-island",
    name: "Lost Island",
    category: "adventure",
    catLabel: "Adventure",
    desc: "Race a rival survivor: gather, craft, cross the island and fire the rescue flare.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 42V25"/><path d="M24 26q-9-8-17-3M24 26q9-8 17-3M24 26q-9 3-12 11M24 26q9 3 12 11"/><path d="M4 42q4-3 8 0t8 0 8 0 8 0 8 0"/></svg>',
    bg: ["#dbeafe", "#bbf7d0"],
};

/* ================================================================== */
/* Pure core (deterministic, serializable state, no DOM)              */
/* ================================================================== */
const IW = 15, IH = 11, TS = 38, VW = IW * TS, VH = IH * TS;
const MAX_HP = 5, AP_TURN = 3, GAME_SECONDS = 300;
const T = {
    WATER: 0, BEACH: 1, GRASS: 2, FOREST: 3, ROCK: 4, RIVER: 5, SWAMP: 6,
    PASS: 7, HELI: 8, BRIDGE: 9, OPEN: 10, GATE: 11, CLIMB: 12, SCREE: 13,
    CRATE: 14, VINE: 15,
};
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BARRIER_TOOL = { [T.PASS]: "rope", [T.GATE]: "key", [T.CLIMB]: "ladder" };
const RECIPES = {
    bridge: { wood: 3 },
    rope: { vine: 3 },
    ladder: { wood: 2, vine: 2 },
    flare: { cloth: 1, stone: 1, wood: 1 },
};
const RES = ["wood", "vine", "stone", "cloth", "herb"];
const TOOLS = ["bridge", "rope", "ladder", "key", "flare"];
const LABEL = {
    wood: "Wood", vine: "Vine", stone: "Stone", cloth: "Cloth", herb: "Herb",
    bridge: "Bridge kit", rope: "Rope", ladder: "Ladder", key: "Key", flare: "Flare",
};
const k = (x, y) => x + "," + y;
const inB = (x, y) => x >= 0 && y >= 0 && x < IW && y < IH;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function nextSeed(seed) { return (Math.imul(seed, 1664525) + 1013904223) >>> 0; }

function walkable(t, tools) {
    if (t === T.BRIDGE || t === T.OPEN) return true;
    if (t === T.RIVER) return !!(tools && tools.bridge > 0);
    if (t === T.PASS || t === T.GATE || t === T.CLIMB)
        return !!(tools && tools[BARRIER_TOOL[t]] > 0);
    return !(t === T.WATER || t === T.ROCK);
}
function reach(grid, sx, sy, tools) {
    const seen = Array.from({ length: IH }, () => Array(IW).fill(false));
    if (!inB(sx, sy) || !walkable(grid[sy][sx], tools)) return seen;
    seen[sy][sx] = true;
    const q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        for (const [dx, dy] of DIR4) {
            const nx = x + dx, ny = y + dy;
            if (inB(nx, ny) && !seen[ny][nx] && walkable(grid[ny][nx], tools)) {
                seen[ny][nx] = true; q.push([nx, ny]);
            }
        }
    }
    return seen;
}
function findPath(grid, sx, sy, tx, ty, tools, avoidSwamp) {
    if (!inB(tx, ty) || !walkable(grid[ty][tx], tools)) return null;
    const attempt = (blockSwamp) => {
        if (blockSwamp && grid[ty][tx] === T.SWAMP) blockSwamp = false;
        const prev = Array.from({ length: IH }, () => Array(IW).fill(null));
        const seen = Array.from({ length: IH }, () => Array(IW).fill(false));
        seen[sy][sx] = true;
        const q = [[sx, sy]];
        for (let i = 0; i < q.length; i++) {
            const [x, y] = q[i];
            for (const [dx, dy] of DIR4) {
                const nx = x + dx, ny = y + dy;
                if (!inB(nx, ny) || seen[ny][nx] || !walkable(grid[ny][nx], tools)) continue;
                if (blockSwamp && grid[ny][nx] === T.SWAMP) continue;
                seen[ny][nx] = true; prev[ny][nx] = [x, y];
                if (nx === tx && ny === ty) {
                    const path = [];
                    let cur = [tx, ty];
                    while (cur[0] !== sx || cur[1] !== sy) { path.push(cur); cur = prev[cur[1]][cur[0]]; }
                    return path.reverse();
                }
                q.push([nx, ny]);
            }
        }
        return null;
    };
    if (!avoidSwamp) return attempt(false);
    return attempt(true) || attempt(false);
}
function distField(grid, sx, sy, tools, blockSwamp) {
    const dist = Array.from({ length: IH }, () => Array(IW).fill(-1));
    if (!inB(sx, sy)) return dist;
    dist[sy][sx] = 0;
    const q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        for (const [dx, dy] of DIR4) {
            const nx = x + dx, ny = y + dy;
            if (!inB(nx, ny) || dist[ny][nx] >= 0 || !walkable(grid[ny][nx], tools)) continue;
            if (blockSwamp && grid[ny][nx] === T.SWAMP) continue;
            dist[ny][nx] = dist[y][x] + 1;
            q.push([nx, ny]);
        }
    }
    return dist;
}

/* ---------------- map generation (validated + fallback) ---------------- */
function genMap(rng) {
    for (let a = 0; a < 120; a++) {
        const m = tryMap(rng);
        if (m && validateMap(m)) return m;
    }
    return fallbackMap();
}
function tryMap(rng) {
    const R = (n) => Math.floor(rng() * n);
    const grid = Array.from({ length: IH }, () => Array(IW).fill(T.WATER));
    for (let y = 1; y < IH - 1; y++)
        for (let x = 1; x < IW - 1; x++)
            grid[y][x] = (y === 1 || y === IH - 2 || x === 1 || x === IW - 2) ? T.BEACH : T.GRASS;
    const rx0 = 5 + R(4);
    const mx = Math.min(IW - 4, rx0 + 3 + R(2));
    const bType = [T.PASS, T.GATE, T.CLIMB][R(3)];
    const bY = 2 + R(IH - 5);
    let rx = rx0, minRx = rx0, maxRx = rx0;
    for (let y = 1; y < IH - 1; y++) {
        if (y > 1 && rng() < 0.45) {
            const nx = rx + (rng() < 0.5 ? -1 : 1);
            if (nx >= 4 && nx <= mx - 3) rx = nx;
        }
        grid[y][rx] = T.RIVER;
        if (rx < minRx) minRx = rx;
        if (rx > maxRx) maxRx = rx;
    }
    let barrier = null;
    for (let y = 1; y < IH - 1; y++) {
        grid[y][mx] = y === bY ? bType : T.ROCK;
        if (y === bY) barrier = { x: mx, y: bY, type: bType };
    }
    const heli = { x: IW - 3, y: rng() < 0.5 ? 2 : IH - 3 };
    if ([T.RIVER, T.ROCK, T.PASS, T.GATE, T.CLIMB].includes(grid[heli.y][heli.x])) return null;
    grid[heli.y][heli.x] = T.HELI;
    const spawns = [{ x: 2, y: 2 + R(3) }, { x: 2, y: 6 + R(3) }];
    spawns.forEach((s) => { grid[s.y][s.x] = T.GRASS; });
    const wreck = { x: 1, y: 1 + R(IH - 2) };
    grid[wreck.y][wreck.x] = T.BEACH;
    const eastX0 = maxRx + 1;
    let cave = null;
    for (let t = 0; t < 120 && !cave; t++) {
        const x = eastX0 + R(Math.max(1, mx - eastX0)), y = 1 + R(IH - 2);
        if (x > 1 && x < IW - 2 && y > 0 && y < IH - 1 && x < mx &&
            (grid[y][x] === T.GRASS || grid[y][x] === T.BEACH)) cave = { x, y };
    }
    if (!cave) return null;
    const loot = {}, looted = {};
    const keySpots = new Set([
        k(spawns[0].x, spawns[0].y), k(spawns[1].x, spawns[1].y),
        k(wreck.x, wreck.y), k(cave.x, cave.y), k(heli.x, heli.y),
    ]);
    const nearSpawn = (x, y, d) => spawns.some((s) => Math.abs(x - s.x) + Math.abs(y - s.y) < d);
    const place = (tile, count, x0, x1, minD, lootFn) => {
        let n = 0, tries = 0;
        while (n < count && tries < 400) {
            tries++;
            const x = x0 + R(Math.max(1, x1 - x0 + 1)), y = 1 + R(IH - 2);
            if (x < 2 || x > IW - 3 || y < 1 || y > IH - 2) continue;
            if (grid[y][x] !== T.GRASS && grid[y][x] !== T.BEACH) continue;
            if (keySpots.has(k(x, y))) continue;
            if (nearSpawn(x, y, minD)) continue;
            grid[y][x] = tile;
            if (lootFn) loot[k(x, y)] = lootFn();
            keySpots.add(k(x, y));
            n++;
        }
        return n;
    };
    const westX1 = Math.max(2, minRx - 1);
    if (place(T.FOREST, 7, 2, westX1, 1, () => ({ wood: 2 })) < 7) return null;
    if (place(T.VINE, 4, 2, westX1, 1, () => ({ vine: 2 })) < 4) return null;
    if (place(T.SCREE, 2, 2, westX1, 1, () => ({ stone: 1 })) < 2) return null;
    if (place(T.FOREST, 3, eastX0, mx - 1, 1, () => ({ wood: 1, vine: 1 })) < 3) return null;
    if (place(T.SCREE, 2, eastX0, mx - 1, 1, () => ({ stone: 1 })) < 2) return null;
    if (place(T.SWAMP, 5, 2, IW - 3, 2, () => ({ herb: 1 })) < 5) return null;
    if (place(T.CRATE, 1, 2, westX1, 1, () => ({ cloth: 1 })) < 1) return null;
    if (place(T.CRATE, 1, eastX0, mx - 1, 1, () => (rng() < 0.5 ? { herb: 1, vine: 1 } : { wood: 2, stone: 1 })) < 1) return null;
    loot[k(wreck.x, wreck.y)] = { cloth: 3, vine: 1 };
    loot[k(cave.x, cave.y)] = bType === T.GATE ? { stone: 2, herb: 1, key: 1 } : { stone: 2, herb: 1 };
    return { grid, spawns, wreck, cave, heli, barrier, loot, looted };
}
function validateMap(m) {
    const { grid, spawns, wreck, cave, heli, barrier, loot } = m;
    if (!barrier || grid[barrier.y][barrier.x] !== barrier.type) return false;
    const sumLoot = (seen, res) => {
        let s = 0;
        for (const key in loot) {
            const [x, y] = key.split(",").map(Number);
            if (seen[y] && seen[y][x] && loot[key][res]) s += loot[key][res];
        }
        return s;
    };
    const noSwamp = grid.map((r) => r.map((t) => (t === T.SWAMP ? T.ROCK : t)));
    for (const s of spawns) {
        const r0 = reach(grid, s.x, s.y, null);
        if (!r0[wreck.y][wreck.x]) return false;
        if (!reach(noSwamp, s.x, s.y, null)[wreck.y][wreck.x]) return false;
        let woodT = 0;
        for (const key in loot) {
            const [x, y] = key.split(",").map(Number);
            if (loot[key].wood && r0[y][x]) woodT++;
        }
        if (woodT < 4) return false;
        if (sumLoot(r0, "vine") < 6) return false;
        if (sumLoot(r0, "cloth") < 2) return false;
        const cands = [];
        for (let y = 1; y < IH - 1; y++)
            for (let x = 1; x < IW - 1; x++)
                if (grid[y][x] === T.RIVER && (r0[y][x - 1] || r0[y][x + 1] || r0[y - 1][x] || r0[y + 1][x]))
                    cands.push({ x, y });
        if (!cands.length) return false;
        for (const c of cands) {
            grid[c.y][c.x] = T.BRIDGE;
            const r1 = reach(grid, s.x, s.y, { bridge: 0, rope: 1, ladder: 1, key: 1 });
            grid[c.y][c.x] = T.RIVER;
            if (!r1[cave.y][cave.x]) return false;
            if (!r1[barrier.y][barrier.x]) return false;
            if (!r1[heli.y][heli.x]) return false;
            if (sumLoot(r1, "stone") < 2) return false;
        }
    }
    return true;
}
function fallbackMap() {
    const grid = Array.from({ length: IH }, (_, y) =>
        Array.from({ length: IW }, (_, x) =>
            (x === 0 || y === 0 || x === IW - 1 || y === IH - 1) ? T.WATER
                : (x === 1 || y === 1 || x === IW - 2 || y === IH - 2) ? T.BEACH : T.GRASS));
    for (let y = 1; y < IH - 1; y++) grid[y][5] = T.RIVER;
    for (let y = 1; y < IH - 1; y++) grid[y][9] = y === 5 ? T.PASS : T.ROCK;
    const heli = { x: 12, y: 2 }; grid[2][12] = T.HELI;
    const spawns = [{ x: 2, y: 3 }, { x: 2, y: 7 }];
    const wreck = { x: 1, y: 5 }, cave = { x: 7, y: 5 };
    const barrier = { x: 9, y: 5, type: T.PASS };
    const loot = {}, looted = {};
    const put = (x, y, t, l) => { grid[y][x] = t; if (l) loot[k(x, y)] = l; };
    [[3, 2], [4, 3], [3, 4], [3, 6], [4, 7], [3, 8], [4, 5]].forEach(([x, y]) => put(x, y, T.FOREST, { wood: 2 }));
    [[2, 2], [2, 8], [3, 5], [4, 4]].forEach(([x, y]) => put(x, y, T.VINE, { vine: 2 }));
    [[2, 4], [2, 6]].forEach(([x, y]) => put(x, y, T.SCREE, { stone: 1 }));
    [[6, 2], [7, 7], [6, 8]].forEach(([x, y]) => put(x, y, T.FOREST, { wood: 1, vine: 1 }));
    [[7, 3], [6, 6]].forEach(([x, y]) => put(x, y, T.SCREE, { stone: 1 }));
    [[4, 6], [6, 4], [7, 8], [11, 6], [12, 7]].forEach(([x, y]) => put(x, y, T.SWAMP, { herb: 1 }));
    put(3, 3, T.CRATE, { cloth: 1 });
    put(11, 3, T.CRATE, { herb: 1, vine: 1 });
    loot[k(1, 5)] = { cloth: 3, vine: 1 };
    loot[k(7, 5)] = { stone: 2, herb: 1 };
    return { grid, spawns, wreck, cave, heli, barrier, loot, looted };
}

/* ---------------- game state ---------------- */
function newGame(seed, opts = {}) {
    const s = seed >>> 0;
    const rng = mulberry32(s);
    const map = genMap(rng);
    const seatSwap = rng() < 0.5;
    const first = rng() < 0.5 ? 0 : 1;
    const players = [0, 1].map((i) => ({
        x: map.spawns[i].x, y: map.spawns[i].y,
        hp: MAX_HP, ap: i === first ? AP_TURN : 0,
        inv: { wood: 0, vine: 0, stone: 0, cloth: 0, herb: 0 },
        tools: { bridge: 0, rope: 0, ladder: 0, key: 0, flare: 0 },
        alive: true, escaped: false, god: false,
    }));
    return {
        id: s, seed: s, bot: opts.bot == null ? null : opts.bot,
        map, players, turn: first, turnCount: 0, timeLeft: GAME_SECONDS,
        phase: "playing", winner: null, reason: "", seatSwap,
        cheats: { freezeTime: false, botFreeze: false }, cheated: false, note: null,
    };
}
function note(st, text, to) { st.note = { text, to: to == null ? null : to, id: st.note ? st.note.id + 1 : 1 }; }
function fail(st, actor, text) { note(st, text, actor); return true; }
function turnOk(st, actor) {
    return st.phase === "playing" && st.turn === actor &&
        st.players[actor] && st.players[actor].alive && !st.players[actor].escaped;
}
function passTurn(st) { st.turn = 1 - st.turn; st.turnCount++; st.players[st.turn].ap = AP_TURN; }
function spend(st, actor) {
    const p = st.players[actor];
    p.ap--;
    if (p.ap <= 0 && st.phase === "playing") passTurn(st);
}
function finish(st, winner, reason) { st.phase = "over"; st.winner = winner; st.reason = reason; }
function anyBridge(grid) {
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) if (grid[y][x] === T.BRIDGE) return true;
    return false;
}
function progress(st, i) {
    const p = st.players[i];
    if (p.escaped) return 1e6;
    if (!p.alive) return -1e6;
    const m = st.map;
    const stage = (anyBridge(m.grid) ? 1 : 0) +
        (m.grid[m.barrier.y][m.barrier.x] === T.OPEN ? 1 : 0) +
        (p.tools.flare > 0 ? 1 : 0);
    return stage * 100 - (Math.abs(p.x - m.heli.x) + Math.abs(p.y - m.heli.y)) + p.hp;
}
function canCraft(p, item) {
    const rec = RECIPES[item];
    if (!rec) return false;
    for (const r in rec) if (p.inv[r] < rec[r]) return false;
    return true;
}

/* ---------------- authoritative reducer (host / local) ---------------- */
function reduce(st, action, actor) {
    if (!st || !action) return false;
    const type = action.type;
    if (type === "tick") {
        if (actor !== "clock" || st.phase !== "playing" || st.cheats.freezeTime) return false;
        st.timeLeft = Math.max(0, st.timeLeft - 1);
        if (st.timeLeft <= 0) {
            const s0 = progress(st, 0), s1 = progress(st, 1);
            finish(st, s0 === s1 ? null : s0 > s1 ? 0 : 1, "Night falls — the rescue window closed.");
        }
        return true;
    }
    if (type === "rematch") {
        const fresh = newGame(nextSeed(st.seed), { bot: st.bot });
        for (const key of Object.keys(st)) delete st[key];
        Object.assign(st, fresh);
        return true;
    }
    if (actor !== 0 && actor !== 1) return false;
    const p = st.players[actor];
    if (!p) return false;

    if (type === "cheat") {
        if (st.phase !== "playing") return false;
        const c = action.cheat;
        st.cheated = true;
        if (c === "god") { p.god = !p.god; note(st, "God mode " + (p.god ? "on" : "off") + ".", actor); }
        else if (c === "time") { st.cheats.freezeTime = !st.cheats.freezeTime; note(st, "Time " + (st.cheats.freezeTime ? "frozen" : "flowing") + ".", actor); }
        else if (c === "botfreeze") { st.cheats.botFreeze = !st.cheats.botFreeze; note(st, "Bot " + (st.cheats.botFreeze ? "frozen" : "active") + ".", actor); }
        else if (c === "rich") { RES.forEach((r) => { p.inv[r] += 5; }); note(st, "+5 of every resource.", actor); }
        else if (c === "tools") { TOOLS.forEach((t) => { p.tools[t] += 1; }); note(st, "+1 of every tool.", actor); }
        else if (c === "heal") { p.hp = MAX_HP; note(st, "Fully healed.", actor); }
        else if (c === "teleport") { p.x = st.map.heli.x; p.y = st.map.heli.y; note(st, "Teleported to the helipad.", actor); }
        else if (c === "win") { p.escaped = true; finish(st, actor, "Cheat: instant rescue."); }
        else return false;
        return true;
    }

    if (!turnOk(st, actor)) return false;

    if (type === "move") {
        const dx = action.dx | 0, dy = action.dy | 0;
        if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
        const nx = p.x + dx, ny = p.y + dy;
        if (!inB(nx, ny)) return false;
        let t = st.map.grid[ny][nx];
        if (t === T.RIVER) {
            if (p.tools.bridge > 0) {
                p.tools.bridge--; st.map.grid[ny][nx] = T.BRIDGE; t = T.BRIDGE;
                note(st, "Bridge laid across the river.");
            } else return fail(st, actor, "Deep river — a bridge kit is needed.");
        } else if (BARRIER_TOOL[t]) {
            const tool = BARRIER_TOOL[t];
            if (p.tools[tool] > 0) {
                p.tools[tool]--; st.map.grid[ny][nx] = T.OPEN; t = T.OPEN;
                note(st, tool === "key" ? "The ancient gate swings open."
                    : tool === "rope" ? "Rope fixed — the pass is open."
                        : "Ladder set — the cliff is climbable.");
            } else return fail(st, actor, t === T.PASS ? "A rock chimney — rope is needed."
                : t === T.GATE ? "An ancient gate — its key lies in the cave."
                    : "A sheer cliff — a ladder would help.");
        } else if (!walkable(t, null)) {
            return fail(st, actor, t === T.WATER ? "The sea is too rough to swim." : "Sheer rock — no way through.");
        }
        p.x = nx; p.y = ny;
        if (t === T.SWAMP && !p.god) {
            p.hp--;
            if (p.hp <= 0) { p.hp = 0; p.alive = false; finish(st, 1 - actor, "The swamp claimed a survivor."); return true; }
            note(st, "The swamp saps you. -1 HP", actor);
        }
        spend(st, actor);
        return true;
    }

    if (type === "search") {
        const key = k(p.x, p.y);
        if (p.x === st.map.heli.x && p.y === st.map.heli.y) {
            if (p.tools.flare > 0) {
                p.tools.flare--; p.escaped = true;
                finish(st, actor, "Signal flare fired — the chopper is inbound.");
                return true;
            }
            return fail(st, actor, "The helipad is silent — a signal flare is needed.");
        }
        const loot = st.map.loot[key];
        if (loot) {
            const parts = [];
            for (const r in loot) {
                if (r === "key") p.tools.key += loot[r]; else p.inv[r] += loot[r];
                parts.push("+" + loot[r] + " " + LABEL[r]);
            }
            delete st.map.loot[key];
            st.map.looted[key] = 1;
            note(st, parts.join("  ·  "), actor);
            spend(st, actor);
            return true;
        }
        return fail(st, actor, "Nothing to find here.");
    }

    if (type === "craft") {
        const item = action.item, rec = RECIPES[item];
        if (!rec) return false;
        if (!canCraft(p, item)) return fail(st, actor, "Not enough materials for " + LABEL[item] + ".");
        for (const r in rec) p.inv[r] -= rec[r];
        p.tools[item]++;
        note(st, "Crafted: " + LABEL[item] + ".", actor);
        return true;
    }
    if (type === "use") {
        if (action.item !== "herb") return false;
        if (p.inv.herb <= 0) return fail(st, actor, "No herbs left.");
        if (p.hp >= MAX_HP) return fail(st, actor, "Already at full health.");
        p.inv.herb--; p.hp++;
        note(st, "Herb used. +1 HP", actor);
        return true;
    }
    if (type === "end") { passTurn(st); return true; }
    return false;
}

/* ---------------- bot brain (one action per call) ---------------- */
function nearestLoot(st, p, res) {
    const scan = (dist) => {
        let best = null, bestLen = 1e9;
        for (const key in st.map.loot) {
            const l = st.map.loot[key];
            if (!l[res]) continue;
            const [x, y] = key.split(",").map(Number);
            const d = dist[y][x];
            if (d >= 0 && d < bestLen) { bestLen = d; best = { x, y }; }
        }
        return best;
    };
    return scan(distField(st.map.grid, p.x, p.y, p.tools, true)) ||
        scan(distField(st.map.grid, p.x, p.y, p.tools, false));
}
function riverSpot(st, p) {
    const dist = distField(st.map.grid, p.x, p.y, null, true);
    let best = null, bl = 1e9;
    for (let y = 1; y < IH - 1; y++)
        for (let x = 1; x < IW - 1; x++)
            if (st.map.grid[y][x] === T.RIVER) {
                for (const [dx, dy] of DIR4) {
                    const ax = x + dx, ay = y + dy;
                    if (inB(ax, ay) && dist[ay][ax] >= 0 && dist[ay][ax] < bl) {
                        bl = dist[ay][ax]; best = { x, y };
                    }
                }
            }
    return best;
}
function lootUseful(l, goals, p) {
    if (l.herb && p.hp < MAX_HP) return true;
    for (const g of goals) {
        if (g.tool === "key") { if (l.key) return true; continue; }
        const rec = RECIPES[g.tool];
        for (const r in rec) if (p.inv[r] < rec[r] && l[r]) return true;
    }
    return false;
}
function botStep(st) {
    const b = st.bot;
    if (b == null || st.phase !== "playing" || st.turn !== b) return { type: "end" };
    const p = st.players[b], m = st.map, grid = m.grid;
    if (!p.alive || p.escaped) return { type: "end" };
    if (p.inv.herb > 0 && p.hp <= 2) return { type: "use", item: "herb" };
    const bridgeBuilt = anyBridge(grid);
    const barrierOpen = grid[m.barrier.y][m.barrier.x] === T.OPEN;
    const bTool = BARRIER_TOOL[m.barrier.type];
    const goals = [];
    if (!bridgeBuilt && p.tools.bridge <= 0) goals.push({ tool: "bridge" });
    if (!barrierOpen && p.tools[bTool] <= 0) goals.push({ tool: bTool });
    if (p.tools.flare <= 0) goals.push({ tool: "flare" });
    for (const g of goals)
        if (g.tool !== "key" && canCraft(p, g.tool)) return { type: "craft", item: g.tool };
    if (p.x === m.heli.x && p.y === m.heli.y && p.tools.flare > 0) return { type: "search" };
    const here = m.loot[k(p.x, p.y)];
    if (here && lootUseful(here, goals, p)) return { type: "search" };
    const plan = [];
    if (!bridgeBuilt) plan.push(p.tools.bridge > 0 ? { act: "river" } : { gather: "bridge" });
    if (!barrierOpen) plan.push(p.tools[bTool] > 0 ? { act: "barrier" } : { gather: bTool });
    plan.push(p.tools.flare > 0 ? { act: "heli" } : { gather: "flare" });
    let target = null;
    for (const step of plan) {
        if (step.act === "river") { target = riverSpot(st, p); if (target) break; continue; }
        if (step.act === "barrier") { target = { x: m.barrier.x, y: m.barrier.y }; break; }
        if (step.act === "heli") { target = { x: m.heli.x, y: m.heli.y }; break; }
        if (step.gather === "key") {
            const cl = m.loot[k(m.cave.x, m.cave.y)];
            if (cl && cl.key) { target = { x: m.cave.x, y: m.cave.y }; break; }
            return { type: "end" };
        }
        const rec = RECIPES[step.gather];
        for (const r in rec)
            if (p.inv[r] < rec[r]) { target = nearestLoot(st, p, r); if (target) break; }
        if (target) break;
    }
    if (!target) return { type: "end" };
    if (p.x === target.x && p.y === target.y) return { type: "search" };
    const path = findPath(grid, p.x, p.y, target.x, target.y, p.tools, true);
    if (!path || !path.length) return { type: "end" };
    return { type: "move", dx: path[0][0] - p.x, dy: path[0][1] - p.y };
}

/* ================================================================== */
/* Mount: rendering, input, timers, room sync                          */
/* ================================================================== */
const ICONS = {
    wood: '<rect x="3" y="12" width="14" height="8" rx="4"/><path d="M17 12a4 4 0 0 1 0 8"/><path d="M7 16h6"/>',
    vine: '<path d="M7 21c0-9 10-9 10-18"/><path d="M7 13c4 0 6 2 6 6"/>',
    stone: '<path d="M8 19l-4-6 4-7 8-1 4 7-3 7z"/>',
    cloth: '<path d="M6 4h12v16l-3-2.5-3 2.5-3-2.5L6 20z"/>',
    herb: '<path d="M12 21C7 16 7 8 12 3c5 5 5 13 0 18z"/><path d="M12 9v8"/>',
    bridge: '<path d="M3 9h18M3 15h18M7 9v6M12 9v6M17 9v6"/>',
    rope: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    ladder: '<path d="M8 3v18M16 3v18M8 8h8M8 13h8M8 18h8"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v4M21 12v3"/>',
    flare: '<path d="M12 3l3 7-3 11-3-11z"/><path d="M5 8l4 2M19 8l-4 2"/>',
};
function ico(name, s = 14) {
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
}
const COL = {
    [T.WATER]: "#dde8f1", [T.BEACH]: "#f2e8d5", [T.GRASS]: "#eef2e6", [T.FOREST]: "#e3ecda",
    [T.ROCK]: "#e2e5e9", [T.RIVER]: "#d3e4ee", [T.SWAMP]: "#e8e6cf", [T.PASS]: "#efe0d3",
    [T.HELI]: "#f1f5f9", [T.BRIDGE]: "#ead9bd", [T.OPEN]: "#ecefe4", [T.GATE]: "#e9e2f0",
    [T.CLIMB]: "#e0e9ef", [T.SCREE]: "#e9ebe4", [T.CRATE]: "#f0e7db", [T.VINE]: "#e0ecd9",
};
function glyph(t, px, py, x, y) {
    const cx = px + TS / 2, cy = py + TS / 2;
    switch (t) {
        case T.FOREST: return '<circle cx="' + cx + '" cy="' + (cy - 3) + '" r="6.5" fill="#bcd3a8"/><rect x="' + (cx - 1.5) + '" y="' + (cy + 2) + '" width="3" height="6" rx="1.5" fill="#a98f6f"/>';
        case T.VINE: return '<path d="M' + (cx - 6) + ' ' + (cy + 7) + ' q0 -9 6 -9 q6 0 6 -6" fill="none" stroke="#8fae72" stroke-width="2" stroke-linecap="round"/>';
        case T.SCREE: return '<circle cx="' + (cx - 5) + '" cy="' + (cy + 3) + '" r="2.4" fill="#b6bdb2"/><circle cx="' + (cx + 4) + '" cy="' + (cy + 5) + '" r="1.8" fill="#b6bdb2"/><circle cx="' + (cx + 1) + '" cy="' + (cy - 4) + '" r="2" fill="#c2c9be"/>';
        case T.SWAMP: return '<path d="M' + (cx - 8) + ' ' + (cy - 1) + ' q4 -3 8 0 q4 3 8 0 M' + (cx - 8) + ' ' + (cy + 5) + ' q4 -3 8 0 q4 3 8 0" fill="none" stroke="#b3ac74" stroke-width="1.8" stroke-linecap="round"/>';
        case T.ROCK: return '<path d="M' + (cx - 8) + ' ' + (cy + 7) + ' l5 -9 l4 4 l4 -7 l5 12 z" fill="#d3d8de" stroke="#b6bec8" stroke-width="1.2"/>';
        case T.RIVER: return '<path d="M' + (cx - 9) + ' ' + cy + ' q4.5 -4 9 0 q4.5 4 9 0" fill="none" stroke="#9fc3d8" stroke-width="1.8" stroke-linecap="round"/>';
        case T.WATER: return (x + y) % 3 === 0 ? '<path d="M' + (cx - 8) + ' ' + cy + ' q4 -3.5 8 0 q4 3.5 8 0" fill="none" stroke="#c9d8e6" stroke-width="1.5" stroke-linecap="round"/>' : "";
        case T.PASS: return '<path d="M' + (cx - 7) + ' ' + (cy + 8) + ' l6 -8 l-4 -4 l7 -9" fill="none" stroke="#c99b76" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
        case T.GATE: return '<path d="M' + (cx - 7) + ' ' + (cy + 8) + ' v-8 a7 7 0 0 1 14 0 v8" fill="none" stroke="#a58fc0" stroke-width="2.2" stroke-linecap="round"/>';
        case T.CLIMB: return '<path d="M' + (cx - 5) + ' ' + (cy - 8) + ' v16 M' + (cx + 5) + ' ' + (cy - 8) + ' v16 M' + (cx - 5) + ' ' + (cy - 3) + ' h10 M' + (cx - 5) + ' ' + (cy + 3) + ' h10" fill="none" stroke="#8fa9bd" stroke-width="2" stroke-linecap="round"/>';
        case T.HELI: return '<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="none" stroke="#94a3b8" stroke-width="1.6"/><text x="' + cx + '" y="' + (cy + 4.5) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#64748b" font-family="inherit">H</text>';
        case T.BRIDGE: return [0, 1, 2].map((i) => '<rect x="' + (px + 6) + '" y="' + (py + 8 + i * 8) + '" width="' + (TS - 12) + '" height="4.5" rx="2" fill="#d2b078"/>').join("");
        case T.OPEN: return '<path d="M' + (cx - 8) + ' ' + cy + ' h16" stroke="#b9c2ad" stroke-width="2.4" stroke-dasharray="3 3" stroke-linecap="round"/>';
        case T.CRATE: return '<rect x="' + (cx - 6.5) + '" y="' + (cy - 6.5) + '" width="13" height="13" rx="2" fill="none" stroke="#b09a76" stroke-width="1.8"/><path d="M' + (cx - 6.5) + ' ' + cy + ' h13 M' + cx + ' ' + (cy - 6.5) + ' v13" stroke="#b09a76" stroke-width="1.2"/>';
        default: return "";
    }
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;
    let clockTimer = 0, botTimer = 0, walkTimer = 0, toastTimer = 0;
    let walkTarget = null, walkStuck = 0, lastWalkFrom = "";
    let lastNoteId = 0, lastGameId = null;
    const ui = { craft: false, bag: false, cheat: false, pause: false, help: false };
    let pauseAt = 0, pauseShift = 0, lastTickAt = 0;

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("lostIslandHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        ui.help = true;
        try { localStorage.setItem("lostIslandHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    const SEAT = ["#3b82f6", "#f59e0b"];
    const oppName = () => (online ? "Rival" : "Bot");
    const mySeat = () => (online && state && state.seatSwap ? 1 - playerIndex : playerIndex);
    const myTurn = () => !!state && state.phase === "playing" && state.turn === mySeat() &&
        state.players[mySeat()].alive && !state.players[mySeat()].escaped;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    root.innerHTML = `
<style>
.li-wrap{--ink:#1e293b;--mut:#64748b;--line:#e2e8f0;--soft:#f8fafc;--ok:#10b981;--bad:#ef4444;max-width:720px;margin:0 auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px;color:var(--ink);font-family:inherit;width:100%;box-sizing:border-box;min-height:0}
.li-wrap [hidden]{display:none!important}
.li-wrap button{font-family:inherit}
.li-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.li-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--mut);white-space:nowrap}
.li-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.li-timer b{font-size:13px}
.li-status{display:inline-flex;align-items:center;gap:6px}
.li-dot{width:8px;height:8px;border-radius:50%;background:#cbd5e1;display:inline-block;flex:none}
.li-dot.on{background:var(--ok);animation:li-pulse 1.6s infinite}
.li-dot.busy{background:#f59e0b}
@keyframes li-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.li-spacer{flex:1 1 auto}
.li-players{flex:1 1 100%;display:flex;gap:8px;flex-wrap:wrap;min-width:0}
.li-pcard{flex:1 1 210px;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;padding:7px 10px;background:#fff;font-size:12px}
.li-pcard.on{border-color:#cbd5e1;background:var(--soft)}
.li-pcard.dead{opacity:.5}
.li-pdot{width:10px;height:10px;border-radius:50%;flex:none}
.li-pname{font-weight:700;white-space:nowrap}
.li-hearts{display:flex;gap:3px}
.li-heart{width:7px;height:7px;border-radius:50%;border:1.5px solid #fca5a5;display:inline-block}
.li-heart.on{background:var(--bad);border-color:var(--bad)}
.li-ap{display:flex;gap:3px;margin-left:2px}
.li-pip{width:6px;height:6px;border-radius:2px;background:var(--line);display:inline-block}
.li-pip.on{background:var(--ink)}
.li-tools{display:flex;gap:6px;margin-left:auto;color:#cbd5e1;flex-wrap:wrap}
.li-tool{display:inline-flex;align-items:center;gap:2px}
.li-tool.have{color:var(--ink)}
.li-tool b{font-size:10px}
.li-board{position:relative;width:100%;min-height:0;padding:0;border:1px solid var(--line);background:var(--soft);border-radius:12px;overflow:hidden}
.li-svg{display:block;width:100%;height:100%;touch-action:manipulation}
.li-svg [data-tile]{cursor:pointer}
.li-wait{padding:40px 16px;text-align:center;color:var(--mut);font-size:13px}
.li-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#1e293bee;color:#f8fafc;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;pointer-events:none;z-index:5;max-width:92%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.li-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;background:rgba(248,250,252,.86);border-radius:12px}
.li-card{display:flex;flex-direction:column;gap:8px;width:min(420px,100%);max-height:100%;padding:16px;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}
.li-cardhead,.li-foot{flex:none}
.li-body{flex:1 1 auto;min-height:0;overflow:auto}
.li-cardhead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.li-x{min-width:32px;min-height:32px;border:1px solid var(--line);background:#fff;font-size:14px;line-height:1;color:var(--mut);border-radius:8px;cursor:pointer}
.li-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--soft);font-size:12.5px}
.li-rowico{color:var(--mut);display:inline-flex;flex:none}
.li-rowname{font-weight:600}
.li-costs{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.li-cost{font-size:11px;color:var(--bad);font-weight:600}
.li-cost.ok{color:var(--ok)}
.li-count{margin-left:auto;color:var(--mut);font-weight:600}
.li-btn{min-height:40px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.li-btn:hover{background:var(--soft)}
.li-btn:disabled{opacity:.45;cursor:default}
.li-btn.sm{padding:6px 10px;font-size:11.5px;min-height:32px}
.li-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.li-btn.warn{color:#b45309;border-color:#fde68a}
.li-icon-btn{display:inline-flex;align-items:center;gap:6px}
.li-icon-btn svg{flex:none;display:block}
.li-hud .li-btn{min-height:30px;padding:5px 8px;font-size:10px;gap:4px}
.li-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.li-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.li-slot{position:relative;width:40px;height:40px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.li-slot b{position:absolute;right:3px;bottom:2px;font-size:10px;color:var(--ink)}
.li-slot.use{border-color:#a7f3d0;color:var(--ok)}
.li-barsp{flex:1 1 8px}
.li-actions{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.li-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.li-pad{display:none;justify-content:center;user-select:none}
.li-dpad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:4px}
.li-dbtn{border:1px solid var(--line);background:#fff;border-radius:9px;color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none}
.li-dbtn:active{background:var(--soft)}
.li-dbtn svg{width:18px;height:18px}
.li-overtitle{margin:0;font-size:18px;font-weight:800}
.li-overtitle.win{color:var(--ok)}
.li-overtitle.lose{color:var(--bad)}
.li-overtitle.draw{color:var(--mut)}
.li-oversub{margin:0;font-size:13px;line-height:1.5;color:var(--mut)}
.li-help b{display:block;margin:6px 0;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.li-help ul{margin:0 0 8px;padding-left:16px;font-size:12px;line-height:1.6;color:var(--mut)}
.li-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--soft);color:var(--ink);font:inherit}
.li-note{font-size:11px;color:var(--mut)}
.li-wrap :is(button,input):focus-visible{outline:2px solid var(--ink);outline-offset:2px}
@media (pointer:coarse){.li-pad{display:flex}}
@media (prefers-reduced-motion:reduce){.li-wrap *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (keep last) --- */
.li-wrap.game-fill>.li-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.li-wrap .li-icon-btn svg{flex:none;display:block}
@media (pointer:coarse){.li-wrap button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.li-wrap{padding:10px 8px;gap:8px}
.li-wrap.game-fill>.li-board:not(:has(.li-ov:not([hidden]))){aspect-ratio:570/418;flex:0 0 auto}
.li-wrap.game-fill>.li-board:has(.li-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.li-wrap .li-hud{gap:4px}
.li-wrap .li-hud .li-chip{padding:3px 4px;font-size:9px;gap:4px}
.li-wrap .li-hud .li-chip[data-hud="turn"],.li-wrap .li-hud .li-timer>span{display:none}
.li-wrap .li-hud .li-btn{min-width:22px;min-height:30px;padding:3px 5px;font-size:9px;gap:3px}
.li-wrap .li-hud .li-btn-label,.li-wrap .li-hud .li-spacer{display:none}
.li-wrap .li-players{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.li-wrap .li-pcard{padding:5px 7px;font-size:10px;gap:5px}
.li-wrap .li-tools{display:none}
.li-wrap .li-ov{padding:8px}
.li-wrap .li-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.li-wrap .li-body{scrollbar-width:none}
.li-wrap .li-body::-webkit-scrollbar{display:none}
.li-wrap .li-foot{margin:0;padding-top:8px;border-top:1px solid var(--line)}
.li-wrap .li-costs{margin-left:0}
.li-wrap .li-actions{margin-left:0}
}
</style>
<div class="game-app li-wrap game-fill" data-li>
  <div class="li-hud">
    <span class="li-chip li-timer"><span>TIME</span> <b data-timer>--:--</b></span>
    <span class="li-chip li-status"><i class="li-dot" data-dot></i><b data-status>Ready</b></span>
    <span class="li-chip" data-hud="turn">TURN <b data-turn>0</b></span>
    <span class="li-spacer"></span>
    <button class="li-btn li-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="li-btn-label">Help</span></button>
    <button class="li-btn li-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="li-btn-label">Cheats</span></button>
    <button class="li-btn li-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="li-btn-label" data-pause-label>Pause</span></button>
    <button class="li-btn li-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="li-btn-label">Restart</span></button>
    <button class="li-btn li-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="li-btn-label">Exit</span></button>
    <div class="li-players" data-players></div>
  </div>
  <section class="game-panel li-board" data-board>
    <svg class="li-svg" data-svg viewBox="0 0 570 418" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Island map"></svg>
    <div class="li-toast" data-toast hidden></div>
    <div class="li-ov" data-ov="craft" hidden>
      <div class="li-card">
        <div class="li-cardhead"><span>Craft</span><button type="button" class="li-x" data-act="close" aria-label="Close">✕</button></div>
        <div class="li-body" data-craftlist></div>
      </div>
    </div>
    <div class="li-ov" data-ov="bag" hidden>
      <div class="li-card">
        <div class="li-cardhead"><span>Backpack</span><button type="button" class="li-x" data-act="close" aria-label="Close">✕</button></div>
        <div class="li-body" data-baglist></div>
      </div>
    </div>
    <div class="li-ov" data-ov="cheat" hidden>
      <div class="li-card">
        <div class="li-cardhead"><span>Cheats</span><button type="button" class="li-x" data-act="close" aria-label="Close">✕</button></div>
        <div class="li-body" data-cheatlist></div>
      </div>
    </div>
    <div class="li-ov" data-ov="pause" hidden>
      <div class="li-card">
        <div class="li-cardhead"><span>Paused</span></div>
        <div class="li-body"><p class="li-oversub">The island is on hold. Your timer, actions and rival are frozen.</p></div>
        <div class="li-foot"><span class="li-note">Press P or Esc to resume</span><button class="li-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>
    <div class="li-ov" data-ov="help" hidden>
      <div class="li-card">
        <div class="li-cardhead"><span>How to play</span><button type="button" class="li-x" data-help-close aria-label="Close">✕</button></div>
        <div class="li-body li-help">
          <b>Goal</b>
          <ul><li>Gather resources, craft a bridge and the right barrier tool, cross to the helipad and fire a flare before your rival.</li><li>You have 300 seconds and 3 action points per turn. Swamps cost 1 HP each step.</li></ul>
          <b>Desktop</b>
          <ul><li><span class="li-kbd">W A S D</span> / arrows — move one tile (a click on a far tile auto-walks there)</li><li><span class="li-kbd">Space</span> or click your survivor — search / use / fire the flare</li><li><span class="li-kbd">E</span> end turn · <span class="li-kbd">Q</span> use herb · <span class="li-kbd">K</span> craft · <span class="li-kbd">B</span> bag</li><li><span class="li-kbd">H</span> help · <span class="li-kbd">C</span> cheats · <span class="li-kbd">P</span> pause · <span class="li-kbd">R</span> restart</li></ul>
          <b>Mobile</b>
          <ul><li>Tap a tile to walk, tap your survivor or press Search to interact.</li><li>Use the D-pad below the map, plus the Search / End turn buttons.</li></ul>
        </div>
        <div class="li-foot"><span class="li-note">Press H to reopen this guide</span><button class="li-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
    <div class="li-ov" data-ov="over" hidden>
      <div class="li-card">
        <div class="li-cardhead"><span>Expedition over</span></div>
        <div class="li-body"><h2 class="li-overtitle" data-overtitle></h2><p class="li-oversub" data-oversub></p></div>
        <div class="li-foot"><span class="li-note"></span><button type="button" class="li-btn primary" data-act="rematch">Play again</button><button type="button" class="li-btn" data-exit>Exit</button></div>
      </div>
    </div>
  </section>
  <div class="li-controls">
    <div class="li-bar" data-bar></div>
    <div class="li-actions">
      <button type="button" class="li-btn" data-act="search">${ico("flare", 13)} Search</button>
      <button type="button" class="li-btn" data-act="end">End turn</button>
    </div>
  </div>
  <div class="li-pad" data-pad>
    <div class="li-dpad">
      <button type="button" class="li-dbtn" data-dir="up" style="grid-area:1/2" aria-label="Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>
      <button type="button" class="li-dbtn" data-dir="left" style="grid-area:2/1" aria-label="Left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></button>
      <button type="button" class="li-dbtn" data-dir="down" style="grid-area:2/2" aria-label="Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>
      <button type="button" class="li-dbtn" data-dir="right" style="grid-area:2/3" aria-label="Right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg></button>
    </div>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $("[data-svg]"), playersEl = $("[data-players]"), barEl = $("[data-bar]"),
        timerEl = $("[data-timer]"), statusEl = $("[data-status]"), dotEl = $("[data-dot]"),
        turnEl = $("[data-turn]"), toastEl = $("[data-toast]"),
        craftList = $("[data-craftlist]"), bagList = $("[data-baglist]"),
        cheatList = $("[data-cheatlist]"), pauseBtn = $("[data-pause]"),
        ovCraft = $('[data-ov="craft"]'), ovBag = $('[data-ov="bag"]'),
        ovCheat = $('[data-ov="cheat"]'), ovPause = $('[data-ov="pause"]'),
        ovHelp = $('[data-ov="help"]'), ovOver = $('[data-ov="over"]'),
        overTitle = $("[data-overtitle]"), overSub = $("[data-oversub]");

    function toast(text) {
        toastEl.textContent = text;
        toastEl.removeAttribute("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.setAttribute("hidden", ""), 2400);
    }

    function wreckMark(w) {
        const px = w.x * TS, py = w.y * TS;
        return '<path d="M' + (px + 6) + ' ' + (py + 22) + ' h26 l-5 8 h-16 z" fill="#d9c8a8" stroke="#a08b66" stroke-width="1.4"/>' +
            '<path d="M' + (px + 19) + ' ' + (py + 22) + ' v-11 l8 11" fill="#f8fafc" stroke="#a08b66" stroke-width="1.2"/>';
    }
    function caveMark(c) {
        const px = c.x * TS, py = c.y * TS;
        return '<path d="M' + (px + 8) + ' ' + (py + 27) + ' a11 9 0 0 1 22 0 z" fill="#94a3b8" opacity="0.85"/>' +
            '<path d="M' + (px + 13) + ' ' + (py + 27) + ' a6 5.5 0 0 1 12 0 z" fill="#475569"/>';
    }
    function boardSVG() {
        const m = state.map, g = m.grid;
        let s = "";
        for (let y = 0; y < IH; y++)
            for (let x = 0; x < IW; x++) {
                const t = g[y][x], px = x * TS, py = y * TS;
                s += '<g data-tile="' + x + "," + y + '"><rect x="' + (px + 1) + '" y="' + (py + 1) +
                    '" width="' + (TS - 2) + '" height="' + (TS - 2) + '" rx="5" fill="' + COL[t] + '"/>' + glyph(t, px, py, x, y);
                if (m.loot[k(x, y)]) s += '<circle cx="' + (px + TS - 7) + '" cy="' + (py + TS - 7) + '" r="2.2" fill="#94a3b8"/>';
                s += "</g>";
            }
        s += '<g pointer-events="none">' + wreckMark(m.wreck) + caveMark(m.cave) + "</g>";
        s += '<g pointer-events="none">';
        const same = state.players[0].x === state.players[1].x && state.players[0].y === state.players[1].y;
        for (let i = 0; i < 2; i++) {
            const p = state.players[i];
            const cx = p.x * TS + TS / 2 + (same ? (i ? 6 : -6) : 0), cy = p.y * TS + TS / 2;
            const op = p.alive ? 1 : 0.3;
            if (state.phase === "playing" && state.turn === i)
                s += '<circle cx="' + cx + '" cy="' + cy + '" r="13" fill="none" stroke="' + SEAT[i] + '" stroke-opacity="0.35" stroke-width="2"/>';
            s += '<circle cx="' + cx + '" cy="' + cy + '" r="8.5" fill="' + SEAT[i] + '" stroke="#fff" stroke-width="2.5" opacity="' + op + '"/>';
        }
        s += "</g>";
        return s;
    }

    function cardHTML(seat, mine) {
        const p = state.players[seat];
        const active = state.phase === "playing" && state.turn === seat;
        const label = (mine ? "You" : oppName()) + (online ? " · P" + (seat + 1) : "");
        let hearts = "";
        for (let i = 0; i < MAX_HP; i++) hearts += '<i class="li-heart' + (i < p.hp ? " on" : "") + '"></i>';
        let ap = "";
        if (active) for (let i = 0; i < AP_TURN; i++) ap += '<i class="li-pip' + (i < p.ap ? " on" : "") + '"></i>';
        const tools = TOOLS.map((t) =>
            '<span class="li-tool' + (p.tools[t] > 0 ? " have" : "") + '" title="' + LABEL[t] + '">' +
            ico(t, 12) + (p.tools[t] > 0 ? "<b>" + p.tools[t] + "</b>" : "") + "</span>").join("");
        return '<div class="li-pcard' + (active ? " on" : "") + (p.alive ? "" : " dead") + '"' +
            (mine ? ' title="' + esc(playerName) + '"' : "") + '><span class="li-pdot" style="background:' + SEAT[seat] +
            '"></span><span class="li-pname">' + esc(label) + '</span><span class="li-hearts">' + hearts +
            '</span><span class="li-ap">' + ap + '</span><span class="li-tools">' + tools + "</span></div>";
    }
    function barHTML() {
        const p = state.players[mySeat()];
        const slots = RES.map((r) =>
            '<button type="button" class="li-slot' + (r === "herb" && p.inv.herb > 0 && myTurn() ? " use" : "") +
            '" data-res="' + r + '" title="' + LABEL[r] + (r === "herb" ? " — use to heal" : "") + '">' +
            ico(r, 15) + "<b>" + p.inv[r] + "</b></button>").join("");
        return slots + '<span class="li-barsp"></span>' +
            '<button type="button" class="li-btn sm" data-act="craft-open">' + ico("bridge", 13) + " Craft</button>" +
            '<button type="button" class="li-btn sm" data-act="bag-open">' + ico("cloth", 13) + " Bag</button>";
    }
    const blockingModal = () => ui.help || ui.pause || ui.cheat;
    const gameNow = () => Date.now() - pauseShift;

    function syncHudButtons() {
        const label = pauseBtn.querySelector(".li-btn-label");
        if (label) label.textContent = ui.pause ? "Resume" : "Pause";
        const icon = pauseBtn.querySelector("[data-pause-icon]");
        if (icon) icon.innerHTML = iconSVG(ui.pause ? "play" : "pause", { size: 14 });
        pauseBtn.setAttribute("aria-label", ui.pause ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", ui.pause ? "Resume (P)" : "Pause (P)");
    }

    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) { ui.cheat = false; ui.pause = false; stopTimers(); }
        else if (!ui.pause) startTimers();
        syncHudButtons();
        render();
    }

    function togglePause(on) {
        if (!state || state.phase !== "playing") return;
        const next = typeof on === "boolean" ? on : !ui.pause;
        if (next === ui.pause) return;
        ui.pause = next;
        ui.craft = ui.bag = ui.cheat = false;
        ui.help = false;
        if (ui.pause) { pauseAt = gameNow(); stopTimers(); }
        else { pauseShift += Math.max(0, gameNow() - pauseAt); startTimers(); }
        syncHudButtons();
        render();
    }

    function stopTimers() {
        clearInterval(clockTimer); clockTimer = 0;
        clearTimeout(botTimer); botTimer = 0;
        clearTimeout(walkTimer); walkTimer = 0;
    }

    function startTimers() {
        if (destroyed || !state || ui.pause || ui.help || state.phase !== "playing") return;
        if (!clockTimer) {
            lastTickAt = gameNow();
            clockTimer = setInterval(() => {
                if (destroyed || !state || state.phase !== "playing" || ui.pause || ui.help) return;
                if (online && !room.isHost) return;
                const now = gameNow();
                if (now - lastTickAt < 900) return;
                lastTickAt = now;
                reduce(state, { type: "tick" }, "clock");
                publish();
            }, 1000);
        }
        queueBot();
    }

    function renderOverlays() {
        const p = state.players[mySeat()];
        const playing = state.phase === "playing";
        craftList.innerHTML = Object.keys(RECIPES).map((item) => {
            const rec = RECIPES[item];
            const costs = Object.keys(rec).map((r) =>
                '<span class="li-cost' + (p.inv[r] >= rec[r] ? " ok" : "") + '">' + LABEL[r] + " " + p.inv[r] + "/" + rec[r] + "</span>").join("");
            const ok = myTurn() && canCraft(p, item);
            return '<div class="li-row"><span class="li-rowico">' + ico(item, 16) + '</span><span class="li-rowname">' +
                LABEL[item] + '</span><span class="li-costs">' + costs + '</span><button type="button" class="li-btn sm primary" data-craft="' +
                item + '"' + (ok ? "" : " disabled") + ">Craft</button></div>";
        }).join("");
        bagList.innerHTML = RES.concat(TOOLS).map((it) => {
            const cnt = RES.includes(it) ? p.inv[it] : p.tools[it];
            const use = it === "herb" && cnt > 0 && myTurn() && p.hp < MAX_HP;
            return '<div class="li-row"><span class="li-rowico">' + ico(it, 16) + '</span><span class="li-rowname">' +
                LABEL[it] + '</span><span class="li-count">&times;' + cnt + "</span>" +
                (it === "herb" ? '<button type="button" class="li-btn sm" data-act="use-herb"' + (use ? "" : " disabled") + ">Use</button>" : "") +
                "</div>";
        }).join("");
        const dis = playing ? "" : " disabled";
        const tog = (id, label, on) =>
            '<div class="li-row"><span class="li-rowname">' + label + '</span><span class="li-count"></span><button type="button" class="li-btn sm' +
            (on ? " primary" : "") + '" data-cheat="' + id + '"' + dis + ">" + (on ? "On" : "Off") + "</button></div>";
        const btn = (id, label) =>
            '<div class="li-row"><span class="li-rowname">' + label + '</span><span class="li-count"></span><button type="button" class="li-btn sm" data-cheat="' +
            id + '"' + dis + ">Apply</button></div>";
        cheatList.innerHTML =
            tog("god", "God mode (you)", p.god) +
            tog("time", "Freeze time", state.cheats.freezeTime) +
            (state.bot != null ? tog("botfreeze", "Freeze bot", state.cheats.botFreeze) : "") +
            btn("rich", "+5 all resources") + btn("tools", "+1 all tools") + btn("heal", "Full heal") +
            btn("teleport", "Teleport to helipad") + btn("win", "Instant win") + btn("newmap", "New island");
        const show = (el, on) => on ? el.removeAttribute("hidden") : el.setAttribute("hidden", "");
        show(ovCraft, ui.craft && !blockingModal());
        show(ovBag, ui.bag && !blockingModal());
        show(ovCheat, ui.cheat && !ui.help && !ui.pause);
        show(ovPause, ui.pause && !ui.help && !ui.cheat);
        show(ovHelp, ui.help);
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            svgEl.innerHTML = '<text x="285" y="209" text-anchor="middle" font-size="14" fill="#64748b">Waiting for host…</text>';
            statusEl.textContent = "Waiting";
            return;
        }
        if (state.id !== lastGameId) {
            lastGameId = state.id;
            lastNoteId = state.note ? state.note.id : 0;
            walkTarget = null;
            ui.craft = ui.bag = ui.cheat = ui.pause = false;
            syncHudButtons();
            const seatTxt = online ? "You are P" + (mySeat() + 1) + " · " : "";
            toast(seatTxt + (state.turn === mySeat() ? "You move first" : oppName() + " moves first"));
        }
        const tl = Math.max(0, Math.ceil(state.timeLeft));
        timerEl.textContent = String(Math.floor(tl / 60)).padStart(2, "0") + ":" + String(tl % 60).padStart(2, "0");
        turnEl.textContent = String(state.turnCount);
        if (state.phase === "over") { statusEl.textContent = "Game over"; dotEl.className = "li-dot"; }
        else if (ui.pause) { statusEl.textContent = "Paused"; dotEl.className = "li-dot busy"; }
        else if (myTurn()) { statusEl.textContent = "Your turn · " + state.players[mySeat()].ap + " AP"; dotEl.className = "li-dot on"; }
        else { statusEl.textContent = oppName() + (online ? "'s turn" : " is thinking"); dotEl.className = "li-dot busy"; }
        playersEl.innerHTML = [mySeat(), 1 - mySeat()].map((seat, i) => cardHTML(seat, i === 0)).join("");
        svgEl.innerHTML = boardSVG();
        barEl.innerHTML = barHTML();
        renderOverlays();
        if (state.phase === "over") {
            const w = state.winner;
            overTitle.textContent = w == null ? "Draw" : w === mySeat() ? "You win" : oppName() + " wins";
            overTitle.className = "li-overtitle " + (w == null ? "draw" : w === mySeat() ? "win" : "lose");
            overSub.textContent = state.reason + (state.cheated ? " · cheats used" : "");
            ovOver.hidden = blockingModal();
            walkTarget = null;
        } else ovOver.setAttribute("hidden", "");
        if (state.note && state.note.id !== lastNoteId) {
            lastNoteId = state.note.id;
            if (state.note.to == null || state.note.to === mySeat()) toast(state.note.text);
        }
        clearTimeout(walkTimer);
        if (walkTarget && !ui.pause && !ui.help && myTurn() && state.players[mySeat()].ap > 0)
            walkTimer = setTimeout(stepWalk, 200);
        else if (walkTarget && (!myTurn() || state.phase !== "playing")) walkTarget = null;
        startTimers();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!state || destroyed) return;
        const changed = reduce(state, action, actor);
        if (changed) publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    function stepWalk() {
        if (!walkTarget || !myTurn()) { walkTarget = null; return; }
        const p = state.players[mySeat()];
        if (p.ap <= 0) { walkTarget = null; return; }
        if (p.x === walkTarget.x && p.y === walkTarget.y) { walkTarget = null; return; }
        const path = findPath(state.map.grid, p.x, p.y, walkTarget.x, walkTarget.y, p.tools, true);
        if (!path || !path.length) { toast("No clear path."); walkTarget = null; return; }
        const from = k(p.x, p.y);
        if (from === lastWalkFrom) { walkStuck++; if (walkStuck >= 2) { walkTarget = null; toast("Path blocked."); return; } }
        else { walkStuck = 0; lastWalkFrom = from; }
        submitAction({ type: "move", dx: path[0][0] - p.x, dy: path[0][1] - p.y });
    }

    function queueBot() {
        clearTimeout(botTimer);
        if (destroyed || online || !state || state.bot == null || state.phase !== "playing" || state.turn !== state.bot) return;
        botTimer = setTimeout(() => {
            if (destroyed || !state || state.phase !== "playing" || state.turn !== state.bot) return;
            let act = state.cheats.botFreeze ? { type: "end" } : botStep(state);
            if (act.type === "move") {
                const p = state.players[state.bot];
                const nx = p.x + act.dx, ny = p.y + act.dy;
                if (!inB(nx, ny) || !walkable(state.map.grid[ny][nx], p.tools)) act = { type: "end" };
            }
            applyAction(act, state.bot);
        }, 520);
    }

    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const KEYS = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
    };
    function doSearch() {
        if (!myTurn()) { toast("Not your turn"); return; }
        walkTarget = null;
        submitAction({ type: "search" });
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) {
            if (ui.help || ui.pause) return;
            ui.cheat = !ui.cheat; ui.craft = ui.bag = false;
            render(); return;
        }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) {
            if (state && state.phase !== "playing" && !blockingModal()) submitAction({ type: "rematch" });
            else if (state && state.phase === "playing") { togglePause(false); toggleHelp(false); submitAction({ type: "rematch" }); }
            return;
        }
        const actB = t.closest("[data-act]");
        if (actB) {
            const a = actB.dataset.act;
            if (a === "rematch") { submitAction({ type: "rematch" }); return; }
            if (a === "resume") { togglePause(false); return; }
            if (a === "craft-open" || a === "bag-open" || a === "cheat-open") {
                if (blockingModal()) return;
                ui.craft = a === "craft-open" && !ui.craft;
                ui.bag = a === "bag-open" && !ui.bag;
                ui.cheat = a === "cheat-open" && !ui.cheat;
                render(); return;
            }
            if (a === "close") { ui.craft = ui.bag = ui.cheat = false; render(); return; }
            if (blockingModal()) return;
            if (a === "search") { doSearch(); return; }
            if (a === "end") { if (myTurn()) { walkTarget = null; submitAction({ type: "end" }); } else toast("Not your turn"); return; }
            if (a === "use-herb") { if (myTurn()) submitAction({ type: "use", item: "herb" }); return; }
            return;
        }
        if (blockingModal()) return;
        const craftB = t.closest("[data-craft]");
        if (craftB) { submitAction({ type: "craft", item: craftB.dataset.craft }); return; }
        const cheatB = t.closest("[data-cheat]");
        if (cheatB) {
            const c = cheatB.dataset.cheat;
            if (c === "newmap") submitAction({ type: "rematch" });
            else submitAction({ type: "cheat", cheat: c });
            return;
        }
        const resB = t.closest("[data-res]");
        if (resB) {
            const r = resB.dataset.res;
            if (r === "herb") { if (myTurn()) submitAction({ type: "use", item: "herb" }); else toast("Not your turn"); }
            else { ui.bag = true; ui.craft = ui.cheat = false; render(); }
            return;
        }
        const tile = t.closest("[data-tile]");
        if (tile) {
            if (!state || state.phase !== "playing") return;
            if (!myTurn()) { toast("Not your turn"); return; }
            const [x, y] = tile.dataset.tile.split(",").map(Number);
            const p = state.players[mySeat()];
            if (x === p.x && y === p.y) { doSearch(); return; }
            if (Math.abs(x - p.x) + Math.abs(y - p.y) === 1) {
                walkTarget = null;
                submitAction({ type: "move", dx: x - p.x, dy: y - p.y });
                return;
            }
            walkTarget = { x, y }; walkStuck = 0; lastWalkFrom = "";
            render();
            return;
        }
    }
    function onKey(e) {
        if (destroyed || !state) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const key = e.key;
        /* priority: help -> cheats -> pause / escape -> game actions */
        if (key === "h" || key === "H") { e.preventDefault(); toggleHelp(); return; }
        if (ui.help) {
            if (key === "Escape" || key === "Enter" || key === " " || key === "Spacebar") { e.preventDefault(); toggleHelp(false); }
            return;
        }
        if (key === "c" || key === "C") {
            e.preventDefault();
            if (!ui.pause) { ui.cheat = !ui.cheat; ui.craft = ui.bag = false; render(); }
            return;
        }
        if (ui.cheat) { if (key === "Escape") { e.preventDefault(); ui.cheat = false; render(); } return; }
        if (key === "p" || key === "P") { e.preventDefault(); togglePause(); return; }
        if (key === "Escape") {
            e.preventDefault();
            if (ui.craft || ui.bag) { ui.craft = ui.bag = false; render(); }
            else togglePause();
            return;
        }
        if (key === "r" || key === "R") {
            e.preventDefault();
            togglePause(false); toggleHelp(false);
            submitAction({ type: "rematch" });
            return;
        }
        if (ui.pause) return;
        if (state.phase === "over") {
            if (key === "Enter") { e.preventDefault(); submitAction({ type: "rematch" }); }
            return;
        }
        if (ui.craft || ui.bag) {
            if (key === "Escape") { ui.craft = ui.bag = false; render(); }
            return;
        }
        if (state.phase !== "playing") return;
        if (key === " " || key === "Spacebar" || key === "Enter") { e.preventDefault(); doSearch(); return; }
        if (key === "e" || key === "E") { e.preventDefault(); if (myTurn()) { walkTarget = null; submitAction({ type: "end" }); } return; }
        if (key === "q" || key === "Q") { e.preventDefault(); if (myTurn()) submitAction({ type: "use", item: "herb" }); return; }
        if (key === "k" || key === "K") { e.preventDefault(); if (!blockingModal()) { ui.craft = !ui.craft; ui.bag = false; render(); } return; }
        if (key === "b" || key === "B") { e.preventDefault(); if (!blockingModal()) { ui.bag = !ui.bag; ui.craft = false; render(); } return; }
        const dir = KEYS[key];
        if (!dir) return;
        e.preventDefault();
        if (!myTurn()) return;
        walkTarget = null;
        submitAction({ type: "move", dx: DIRS[dir][0], dy: DIRS[dir][1] });
    }
    function onCtx(e) {
        if (e.target.closest && e.target.closest("[data-board]")) {
            if (blockingModal()) return;
            e.preventDefault();
            if (state && state.phase === "playing") doSearch();
        }
    }
    function onPad(e) {
        const b = e.target.closest ? e.target.closest("[data-dir]") : null;
        if (!b || blockingModal()) return;
        e.preventDefault();
        if (!myTurn()) { toast("Not your turn"); return; }
        walkTarget = null;
        const d = DIRS[b.dataset.dir];
        submitAction({ type: "move", dx: d[0], dy: d[1] });
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", onCtx);
    root.addEventListener("pointerdown", onPad);
    document.addEventListener("keydown", onKey);

    syncHudButtons();

    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            state = newGame((Math.random() * 0x7fffffff) | 0, { bot: null });
            publish();
            room.onAction((action) => { if (!destroyed && state) applyAction(action, state.seatSwap ? 0 : 1); });
        } else {
            room.onState((nextState) => { if (destroyed || !nextState) return; state = nextState; render(); });
        }
    } else {
        state = newGame((Math.random() * 0x7fffffff) | 0, { bot: 1 });
        render();
    }

    return {
        destroy() {
            destroyed = true;
            stopTimers();
            clearTimeout(toastTimer);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", onCtx);
            root.removeEventListener("pointerdown", onPad);
            document.removeEventListener("keydown", onKey);
        },
    };
}

/* Exposed for automated tests / tooling (safe to remove in production). */
export const _TEST = {
    T, IW, IH, MAX_HP, AP_TURN, GAME_SECONDS, RECIPES, RES, TOOLS,
    mulberry32, walkable, reach, findPath, distField, genMap, validateMap, fallbackMap,
    newGame, reduce, botStep, progress, canCraft,
};