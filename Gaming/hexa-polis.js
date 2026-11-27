import { iconSVG } from "../JS/icons.js";

/*
  Hexa Polis — minimalist hex civilization strategy.
  Inspired by Hexapolis: Civilization Wars.
  1. META.id must match the filename (hexa-polis.js).
  2. Pure rules live at the top (no DOM); rendering/input live in mount().
  3. Regenerate the manifest: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "hexa-polis",
    name: "Hexa Polis",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Explore a fogged hex realm, grow your cities and capture the enemy capital.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 4l15 8.7v17.4L24 38.8 9 30.1V12.7z"/><path d="M16 33V20h3v-4h3v4h2v-6h4v6h2v-4h3v4h2v13"/><path d="M13 33h24"/><path d="M21 33v-6h4v6"/></svg>',
    bg: ["#93c5fd", "#3b82f6"],
};

/* ================= pure rules (no DOM above mount) ================= */

const MAP_R = 5;                 /* 91 hexes */
const START_GOLD = 20;
const CITY_INCOME = 2;
const CAP_INCOME = 3;
const HEAL = 8;                  /* hp restored on a friendly city */
const WALL_MUL = 1.5;            /* defense multiplier inside walls */
const FOG_UNIT = 2;
const FOG_CITY = 3;
const BOT_CAP = 8;               /* max units a bot keeps */
const NEUTRAL = "n";

const UNITS = {
    warrior: { label: "Warrior", glyph: "W", atk: 5, def: 3, hp: 20, move: 2, range: 1, cost: 15 },
    archer: { label: "Archer", glyph: "A", atk: 4, def: 1, hp: 12, move: 2, range: 2, cost: 25 },
    rider: { label: "Rider", glyph: "R", atk: 6, def: 2, hp: 16, move: 3, range: 1, cost: 30 },
};

const FACTIONS = {
    imperia: { name: "Imperia", color: "#3b82f6", bonus: "+1 gold from every city." },
    crimson: { name: "Crimson Clan", color: "#ef4444", bonus: "+1 attack for all units." },
    sylvari: { name: "Sylvari", color: "#10b981", bonus: "Forests cost only 1 move." },
    nomad: { name: "Nomad Riders", color: "#f59e0b", bonus: "+1 movement for all units." },
};

const BUILDINGS = {
    farm: { label: "Farm", max: 3, base: 20, effect: "+1 gold per turn" },
    wall: { label: "Wall", max: 1, base: 25, effect: "+50% defense here" },
};

const KEY = (q, r) => q + "," + r;

function hexNeighbors(q, r) {
    return [[q + 1, r], [q + 1, r - 1], [q, r - 1], [q - 1, r], [q - 1, r + 1], [q, r + 1]];
}
function hexDist(a, b) {
    const dq = a[0] - b[0], dr = a[1] - b[1];
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
function terrainMul(t) { return t === "f" ? 1.25 : t === "h" ? 1.4 : 1; }
function baseMoveCost(t) { return t === "f" ? 2 : (t === "w" || t === "m") ? Infinity : 1; }
function moveCostFor(state, owner, t) {
    if (t === "f" && owner !== NEUTRAL && state.players[owner] &&
        state.players[owner].faction === "sylvari") return 1;
    return baseMoveCost(t);
}
/* Polytopia-style punchy combat: fights end in 2-3 hits */
function dmg(atk, defEff) { return Math.max(1, Math.round((4.5 * atk * atk) / (atk + defEff))); }
function counterDmg(d) { return Math.max(1, Math.round(d / 2)); }
function atkOf(state, u) {
    return UNITS[u.kind].atk +
        (u.owner !== NEUTRAL && state.players[u.owner].faction === "crimson" ? 1 : 0);
}
function moveOf(state, u) {
    return UNITS[u.kind].move +
        (u.owner !== NEUTRAL && state.players[u.owner].faction === "nomad" ? 1 : 0);
}
function compass(q, r) {
    const x = Math.sqrt(3) * (q + r / 2), y = 1.5 * r;
    const a = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][Math.round(a / 45) % 8];
}

/* seeded rng so a map can be regenerated from state.seed */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function eachHex(R, fn) {
    for (let q = -R; q <= R; q++)
        for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) fn(q, r);
}

/* ---- random map generator, validated to always be solvable ---- */
function tryMap(rng, safe) {
    const hexes = {};
    const all = [];
    eachHex(MAP_R, (q, r) => {
        const x = rng();
        let t;
        if (safe) t = x < 0.2 ? "f" : x < 0.35 ? "h" : "g";
        else t = x < 0.42 ? "g" : x < 0.62 ? "f" : x < 0.78 ? "h" : x < 0.89 ? "w" : "m";
        hexes[KEY(q, r)] = { q, r, t, owner: null };
        all.push([q, r]);
    });
    const pass = (t) => t !== "w" && t !== "m";
    const ring = all.filter((h) => hexDist(h, [0, 0]) === MAP_R - 1);
    const a = ring[(rng() * ring.length) | 0];
    const far = ring.filter((h) => hexDist(h, a) >= 2 * (MAP_R - 1) - 2);
    if (!far.length) return null;
    const b = far[(rng() * far.length) | 0];
    const inner = all.filter((h) => { const d = hexDist(h, [0, 0]); return d >= 2 && d <= 3; });
    for (let i = inner.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const tmp = inner[i]; inner[i] = inner[j]; inner[j] = tmp;
    }
    const neutrals = [];
    for (const h of inner) {
        if (neutrals.length >= 3) break;
        if (hexDist(h, a) >= 2 && hexDist(h, b) >= 2 && neutrals.every((n) => hexDist(h, n) >= 2))
            neutrals.push(h);
    }
    if (neutrals.length < 3) return null;
    const cities = [a, b].concat(neutrals);
    cities.forEach((c) => {
        hexes[KEY(c[0], c[1])].t = "c";
        hexNeighbors(c[0], c[1]).forEach((n) => {
            const h = hexes[KEY(n[0], n[1])];
            if (h && !pass(h.t)) h.t = "g";
        });
    });
    /* BFS: every city must be reachable from capital a */
    const seen = {}; seen[KEY(a[0], a[1])] = true;
    const stack = [a];
    while (stack.length) {
        const cur = stack.pop();
        hexNeighbors(cur[0], cur[1]).forEach((n) => {
            const k = KEY(n[0], n[1]), h = hexes[k];
            if (h && !seen[k] && pass(h.t)) { seen[k] = true; stack.push(n); }
        });
    }
    if (!cities.every((c) => seen[KEY(c[0], c[1])])) return null;
    if (Object.keys(hexes).filter((k) => pass(hexes[k].t)).length < 50) return null;
    for (const cap of [a, b]) {
        const room = all.filter((h) => hexDist(h, cap) <= 2 && pass(hexes[KEY(h[0], h[1])].t)).length;
        if (room < 10) return null;
    }
    return { hexes, caps: [a, b], neutrals };
}
function generateMap(seed) {
    for (let att = 0; att < 80; att++) {
        const m = tryMap(mulberry32(seed + att * 7919), false);
        if (m) return m;
    }
    return tryMap(mulberry32(seed), true); /* blocker-free fallback: always connected */
}

/* ---- state helpers (mutate state, no DOM) ---- */
function unitAt(state, key) { return state.units.find((u) => u.hp > 0 && KEY(u.q, u.r) === key) || null; }
function cityAt(state, key) { return state.cities.find((c) => c.key === key) || null; }
function byId(state, id) { return state.units.find((u) => u.id === id) || null; }
function unitsOf(state, owner) { return state.units.filter((u) => u.hp > 0 && u.owner === owner); }
function citiesOf(state, owner) { return state.cities.filter((c) => c.owner === owner); }

function spawnUnit(state, owner, kind, q, r, acted) {
    const spec = UNITS[kind];
    const u = {
        id: state.nextId++, kind, owner, q, r,
        hp: spec.hp, maxHp: spec.hp,
        moved: !!acted, acted: !!acted, fresh: !!acted,
    };
    state.units.push(u);
    return u;
}

/* Dijkstra over move costs; enemy bodies block, friendly bodies pass-through */
function unitReach(state, from, movePts, owner) {
    const start = KEY(from[0], from[1]);
    const body = {};
    state.units.forEach((u) => { if (u.hp > 0) body[KEY(u.q, u.r)] = u; });
    const own = body[start] ? body[start].owner : owner;
    const dist = {}; dist[start] = 0;
    const frontier = [start];
    while (frontier.length) {
        let bi = 0;
        for (let i = 1; i < frontier.length; i++)
            if (dist[frontier[i]] < dist[frontier[bi]]) bi = i;
        const cur = frontier.splice(bi, 1)[0];
        const p = cur.split(",").map(Number);
        hexNeighbors(p[0], p[1]).forEach((n) => {
            const k = KEY(n[0], n[1]), h = state.hexes[k];
            if (!h) return;
            const nd = dist[cur] + moveCostFor(state, own, h.t);
            if (nd > movePts) return;
            const occ = body[k];
            if (occ && occ.owner !== own) return;
            if (dist[k] === undefined || nd < dist[k]) { dist[k] = nd; frontier.push(k); }
        });
    }
    return Object.keys(dist).filter((k) => k !== start && !body[k]).map((k) => k.split(",").map(Number));
}

function incomeOf(state, slot) {
    let gold = 0;
    state.cities.forEach((c) => {
        if (c.owner !== slot) return;
        gold += (c.cap === slot ? CAP_INCOME : CITY_INCOME) + c.farm +
            (state.players[slot].faction === "imperia" ? 1 : 0);
    });
    return gold;
}

/* unclaimed land beside your cities joins your realm (contested stays free) */
function territoryUpdate(state, slot) {
    const mine = citiesOf(state, slot);
    const others = state.cities.filter((c) => c.owner !== slot);
    mine.forEach((c) => {
        state.hexes[c.key].owner = slot;
        hexNeighbors(c.q, c.r).forEach((n) => {
            const h = state.hexes[KEY(n[0], n[1])];
            if (!h || h.owner !== null) return;
            if (others.some((o) => hexDist([o.q, o.r], n) <= 1)) return;
            h.owner = slot;
        });
    });
}

function visibleNow(state, slot) {
    const vis = {};
    if (state.reveal[slot]) {
        Object.keys(state.hexes).forEach((k) => { vis[k] = true; });
        return vis;
    }
    const keys = Object.keys(state.hexes);
    unitsOf(state, slot).forEach((u) => {
        keys.forEach((k) => {
            const h = state.hexes[k];
            if (hexDist([h.q, h.r], [u.q, u.r]) <= FOG_UNIT) vis[k] = true;
        });
    });
    citiesOf(state, slot).forEach((c) => {
        keys.forEach((k) => {
            const h = state.hexes[k];
            if (hexDist([h.q, h.r], [c.q, c.r]) <= FOG_CITY) vis[k] = true;
        });
    });
    return vis;
}
function updateExplored(state) {
    if (!state.hexes) return;
    [0, 1].forEach((s) => {
        if (!state.players[s] || state.players[s].bot) return;
        const vis = visibleNow(state, s);
        Object.keys(vis).forEach((k) => { state.explored[s][k] = true; });
    });
}

function captureCity(state, city, slot) {
    city.owner = slot;
    state.hexes[city.key].owner = slot;
    territoryUpdate(state, slot);
}

/* one strike, unit vs unit, with counterattack; god-mode cheats honored */
function resolveStrike(state, attacker, target) {
    const tKey = KEY(target.q, target.r);
    const th = state.hexes[tKey], tc = cityAt(state, tKey);
    const defEff = UNITS[target.kind].def * terrainMul(th.t) *
        (tc && tc.owner === target.owner && tc.wall > 0 ? WALL_MUL : 1);
    let dealt = dmg(atkOf(state, attacker), defEff);
    if (target.owner !== NEUTRAL && state.god[target.owner]) dealt = 0;
    target.hp -= dealt;
    attacker.acted = true;
    attacker.moved = true;
    let counter = 0;
    if (target.hp > 0 && hexDist([target.q, target.r], [attacker.q, attacker.r]) <= UNITS[target.kind].range) {
        const aKey = KEY(attacker.q, attacker.r);
        const ah = state.hexes[aKey], ac = cityAt(state, aKey);
        const aDef = UNITS[attacker.kind].def * terrainMul(ah.t) *
            (ac && ac.owner === attacker.owner && ac.wall > 0 ? WALL_MUL : 1);
        counter = counterDmg(dmg(atkOf(state, target), aDef));
        if (attacker.owner !== NEUTRAL && state.god[attacker.owner]) counter = 0;
        attacker.hp -= counter;
    }
    const slain = target.hp <= 0;
    const attackerSlain = attacker.hp <= 0;
    state.units = state.units.filter((u) => u.hp > 0);
    return { dealt, counter, slain, attackerSlain };
}

function beginTurn(state, slot) {
    state.players[slot].gold += incomeOf(state, slot);
    unitsOf(state, slot).forEach((u) => {
        u.moved = false; u.acted = false; u.fresh = false;
        const c = cityAt(state, KEY(u.q, u.r));
        if (c && c.owner === slot && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + HEAL);
    });
    territoryUpdate(state, slot);
}
function passTurn(state) {
    state.current = 1 - state.current;
    if (state.current === state.firstSlot) state.turn += 1;
    beginTurn(state, state.current);
}

function freeSpotNear(state, city) {
    if (!unitAt(state, city.key)) return [city.q, city.r];
    const opts = unitReach(state, [city.q, city.r], 2, city.owner)
        .sort((a, b) => hexDist(a, [city.q, city.r]) - hexDist(b, [city.q, city.r]));
    return opts.length ? opts[0] : null;
}

function checkEnd(state) {
    if (state.phase !== "play") return;
    for (const s of [0, 1]) {
        const cap = state.cities.find((c) => c.cap === s);
        if (cap && cap.owner !== s) {
            state.phase = "over";
            state.winner = 1 - s;
            state.reason = "The " + FACTIONS[state.players[s].faction].name + " capital has fallen.";
            state.msg = state.reason;
            return;
        }
    }
}

/* ---- bot ---- */
function aiPick(targets) {
    let best = null, bs = Infinity;
    targets.forEach((t) => {
        if (!t || t.hp <= 0) return;
        const score = t.hp + 2 * UNITS[t.kind].def;
        if (score < bs) { bs = score; best = t; }
    });
    return best;
}
function botUnitAct(state, u) {
    const rng = UNITS[u.kind].range;
    const foes = state.units.filter((t) => t.hp > 0 && t.owner !== u.owner);
    const reach = unitReach(state, [u.q, u.r], moveOf(state, u), u.owner);
    const spots = [[u.q, u.r]].concat(reach);
    const openCities = state.cities.filter((c) => c.owner !== u.owner && !unitAt(state, c.key));
    const stepTo = (c) => {
        u.q = c.q; u.r = c.r; u.moved = true; u.acted = true;
        captureCity(state, c, u.owner);
    };
    /* 1. instant win: reachable enemy capital */
    const capWin = openCities.find((c) => c.cap !== null && c.cap !== u.owner &&
        spots.some((s) => s[0] === c.q && s[1] === c.r));
    if (capWin) { stepTo(capWin); return; }
    /* 2. attack the weakest reachable foe from the best defensive spot */
    const attackable = foes.filter((f) => spots.some((s) => hexDist(s, [f.q, f.r]) <= rng));
    const target = aiPick(attackable);
    if (target) {
        let pos = [u.q, u.r], mul = -1;
        spots.forEach((s) => {
            if (hexDist(s, [target.q, target.r]) > rng) return;
            const h = state.hexes[KEY(s[0], s[1])];
            const c = cityAt(state, KEY(s[0], s[1]));
            const m = terrainMul(h.t) * (c && c.owner === u.owner && c.wall > 0 ? WALL_MUL : 1);
            if (m > mul) { mul = m; pos = s; }
        });
        if (pos[0] !== u.q || pos[1] !== u.r) { u.q = pos[0]; u.r = pos[1]; u.moved = true; }
        resolveStrike(state, u, target);
        return;
    }
    /* 3. grab any reachable open city */
    const grab = openCities.find((c) => spots.some((s) => s[0] === c.q && s[1] === c.r));
    if (grab) { stepTo(grab); return; }
    /* 4. advance toward the nearest enemy city (capital weighted) or unit */
    let goal = null, gd = Infinity;
    state.cities.forEach((c) => {
        if (c.owner === u.owner) return;
        const d = hexDist([u.q, u.r], [c.q, c.r]) - (c.cap !== null ? 1 : 0);
        if (d < gd) { gd = d; goal = [c.q, c.r]; }
    });
    foes.forEach((f) => {
        const d = hexDist([u.q, u.r], [f.q, f.r]);
        if (d < gd) { gd = d; goal = [f.q, f.r]; }
    });
    if (!goal) return;
    let best = [u.q, u.r], bd = hexDist([u.q, u.r], goal),
        bm = terrainMul(state.hexes[KEY(u.q, u.r)].t);
    spots.forEach((s) => {
        const h = state.hexes[KEY(s[0], s[1])];
        const d = hexDist(s, goal), m = terrainMul(h.t);
        if (d < bd || (d === bd && m > bm)) { bd = d; best = s; bm = m; }
    });
    if (best[0] !== u.q || best[1] !== u.r) {
        u.q = best[0]; u.r = best[1]; u.moved = true;
        const c = cityAt(state, KEY(u.q, u.r));
        if (c && c.owner !== u.owner) { captureCity(state, c, u.owner); u.acted = true; }
    }
}
function botTurn(state, slot) {
    let trained = 0;
    citiesOf(state, slot).forEach((city) => {
        if (unitsOf(state, slot).length >= BOT_CAP) return;
        const gold = state.players[slot].gold;
        const roll = Math.random();
        let kind = null;
        if (gold >= UNITS.rider.cost && roll < 0.35) kind = "rider";
        else if (gold >= UNITS.archer.cost && roll < 0.65) kind = "archer";
        else if (gold >= UNITS.warrior.cost) kind = "warrior";
        if (!kind) return;
        const spot = freeSpotNear(state, city);
        if (!spot) return;
        state.players[slot].gold -= UNITS[kind].cost;
        spawnUnit(state, slot, kind, spot[0], spot[1], true);
        trained++;
    });
    unitsOf(state, slot).slice().forEach((u) => {
        if (u.acted || u.hp <= 0) return;
        botUnitAct(state, u);
    });
    state.units = state.units.filter((u) => u.hp > 0);
    const name = FACTIONS[state.players[slot].faction].name;
    return name + (trained ? " trained " + trained + " unit" + (trained > 1 ? "s" : "") + "." : " advances.");
}

/* ---- cheats (offline only) ---- */
function applyCheat(state, slot, kind) {
    if (kind === "gold") { state.players[slot].gold += 250; state.msg = "Cheat: +250 gold."; }
    else if (kind === "heal") { unitsOf(state, slot).forEach((u) => { u.hp = u.maxHp; }); state.msg = "Cheat: all units healed."; }
    else if (kind === "reveal") {
        state.reveal[slot] = true;
        Object.keys(state.hexes).forEach((k) => { state.explored[slot][k] = true; });
        state.msg = "Cheat: map revealed.";
    } else if (kind === "weaken") {
        state.units.forEach((u) => { if (u.owner !== slot && u.hp > 0) u.hp = Math.max(1, Math.ceil(u.hp / 2)); });
        state.msg = "Cheat: enemy HP halved.";
    } else if (kind === "god") {
        state.god[slot] = !state.god[slot];
        state.msg = "Cheat: god mode " + (state.god[slot] ? "ON" : "OFF") + ".";
    }
}

/* ---- game construction ---- */
function makeLobby() { return { phase: "lobby" }; }

function newGame(factionId, online) {
    const seed = (Math.random() * 0x7fffffff) >>> 0;
    const gen = generateMap(seed);
    /* random spawn-side assignment for both connections (host & guest) */
    const connToSlot = Math.random() < 0.5 ? [0, 1] : [1, 0];
    const hostSlot = connToSlot[0], guestSlot = connToSlot[1];
    const ids = Object.keys(FACTIONS);
    const fHost = FACTIONS[factionId] ? factionId : ids[(Math.random() * ids.length) | 0];
    const rest = ids.filter((f) => f !== fHost);
    const fGuest = rest[(Math.random() * rest.length) | 0];
    const players = [null, null];
    players[hostSlot] = { faction: fHost, gold: START_GOLD, bot: false };
    players[guestSlot] = { faction: fGuest, gold: START_GOLD, bot: !online };

    const hexes = gen.hexes;
    const cities = [];
    gen.caps.forEach((p, i) => {
        const k = KEY(p[0], p[1]);
        cities.push({ q: p[0], r: p[1], key: k, owner: i, cap: i, farm: 0, wall: 0 });
        hexes[k].owner = i;
    });
    gen.neutrals.forEach((p) => {
        const k = KEY(p[0], p[1]);
        cities.push({ q: p[0], r: p[1], key: k, owner: NEUTRAL, cap: null, farm: 0, wall: 0 });
        hexes[k].owner = NEUTRAL;
    });

    /* random first move */
    const firstSlot = Math.random() < 0.5 ? 0 : 1;
    const state = {
        phase: "play", seed, turn: 1,
        current: firstSlot, firstSlot, connToSlot, players,
        hexes, cities, units: [], nextId: 1,
        explored: [{}, {}], reveal: [false, false], god: [false, false],
        winner: null, reason: "", msg: "",
    };
    [0, 1].forEach((s) => {
        const cap = cities.find((c) => c.cap === s);
        spawnUnit(state, s, "warrior", cap.q, cap.r, false);
    });
    cities.filter((c) => c.owner === NEUTRAL).forEach((c) => {
        const g = spawnUnit(state, NEUTRAL, "warrior", c.q, c.r, true);
        g.guard = true;
    });
    territoryUpdate(state, 0);
    territoryUpdate(state, 1);
    beginTurn(state, firstSlot);
    updateExplored(state);
    return state;
}

/* ================= mount: rendering, input, networking ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;
    let sel = null;
    let cursorKey = null;
    let helpOpen = false, cheatsOpen = false, paused = false;
    let botTimer = null, botDue = 0, botRemaining = null;
    let pauseStart = 0, pauseOffset = 0;
    const clockNow = () => Date.now() - pauseOffset;
    const perfNow = () => performance.now() - pauseOffset;

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("hexaPolisHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("hexaPolisHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    const factionCards = Object.keys(FACTIONS).map((id) => {
        const f = FACTIONS[id];
        return '<button class="hx-faction" type="button" data-act="pick" data-f="' + id + '">' +
            '<span class="nm"><i class="hx-dot" style="background:' + f.color + '"></i>' + f.name + "</span>" +
            "<small>" + f.bonus + "</small></button>";
    }).join("");

    root.innerHTML = `
<style>
/* Hexa Polis — single HUD bar, fill-height board, overlay sheets. */
.hx-app{--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--card:#fff;--bg:#f6f7f9;--accent:#3b82f6;
  width:100%;height:100%;min-height:0;max-width:100%;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:8px;
  box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);outline:none}
.hx-app *{box-sizing:border-box}
.hx-app [hidden]{display:none!important}
.hx-app:focus-visible,.hx-app button:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:10px}
.hx-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.hx-chip{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:11px;color:var(--mut);white-space:nowrap}
.hx-chip b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.hx-chip small{font-size:10px;color:var(--mut)}
.hx-chip.hx-sub{max-width:300px;overflow:hidden;text-overflow:ellipsis}
.hx-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.hx-spacer{flex:1 1 auto;min-width:4px}
.hx-btn{appearance:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 10px;min-height:32px;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}
.hx-btn:hover:not(:disabled){border-color:#d1d5db;background:#fafafa}
.hx-btn:disabled{opacity:.45;cursor:default}
.hx-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.hx-btn.primary:hover:not(:disabled){filter:brightness(1.06);background:var(--accent)}
.hx-btn.on{border-color:var(--accent);color:var(--accent)}
.hx-icon-btn{display:inline-flex;align-items:center;gap:5px}
.hx-icon-btn svg{flex:none;display:block}
.hx-btn-label{white-space:nowrap}
.hx-app.game-fill>.hx-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;flex-direction:column;gap:8px;padding:8px;background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.hx-main{display:flex;gap:10px;align-items:stretch;flex:1 1 auto;min-height:0;min-width:0}
.hx-mapwrap{position:relative;flex:1 1 auto;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px;overflow:hidden}
.hx-mapwrap svg{display:block;width:100%;height:100%;min-height:0;touch-action:manipulation}
.hx-side{flex:0 0 250px;max-width:250px;min-width:0;min-height:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;font-size:12.5px;line-height:1.5;overflow:auto}
.hx-toast{position:absolute;left:50%;transform:translateX(-50%);bottom:8px;max-width:92%;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:11.5px;color:var(--mut);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:2}
.hx-pad{display:none;flex:none;gap:4px;flex-wrap:wrap;justify-content:center;padding:2px}
@media(pointer:coarse),(max-width:640px){.hx-app .hx-pad{display:flex}}
.hx-pad button{min-width:38px;min-height:34px;border:1px solid var(--line);background:var(--card);border-radius:8px;font-size:13px;color:var(--ink);cursor:pointer;padding:0 8px}
.hx-pad button:active{background:#f3f4f6}
.hx-pad .ok{background:var(--accent);color:#fff;border-color:var(--accent);font-size:11px;font-weight:700}
.hx-ov{position:absolute;inset:0;background:#f6f7f9d9;display:flex;align-items:center;justify-content:center;padding:12px;z-index:5;border-radius:12px}
.hx-card{display:flex;flex-direction:column;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px;width:min(460px,100%);max-height:100%;overflow:hidden}
.hx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.hx-head h3{margin:0;font-size:17px}
.hx-body{flex:1 1 auto;min-height:0;overflow:auto}
.hx-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.hx-card p{margin:0 0 10px;color:var(--mut);font-size:12.5px;line-height:1.55}
.hx-factions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hx-faction{display:flex;flex-direction:column;gap:4px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px;min-height:44px;background:var(--card);cursor:pointer;text-align:left;font:inherit}
.hx-faction:hover{border-color:#d1d5db;background:#fafafa}
.hx-faction .nm{display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:var(--ink)}
.hx-faction small{color:var(--mut);font-size:11px;line-height:1.4}
.hx-help{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.hx-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.hx-list{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
.hx-list b{color:var(--ink)}
.hx-keys{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:11.5px;color:var(--mut);align-items:center}
.hx-keys b{color:var(--ink);font-weight:600;background:#f3f4f6;border:1px solid var(--line);border-radius:6px;padding:1px 7px;font-size:10.5px;justify-self:start;white-space:nowrap}
.hx-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hx-row{display:flex;gap:8px;justify-content:flex-end;align-items:center}
.hx-note{color:var(--mut);font-size:11.5px}
.hx-ptitle{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);margin:2px 0 8px}
.hx-bar{height:6px;background:#eef0f3;border-radius:3px;overflow:hidden;margin:6px 0}
.hx-bar i{display:block;height:100%;border-radius:3px}
.hx-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0}
.hx-stat{display:flex;justify-content:space-between;background:#f6f7f9;border-radius:8px;padding:3px 8px;font-size:12px}
.hx-stat span{color:var(--mut)}
.hx-train{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:6px 0}
.hx-train .hx-btn{padding:6px 4px;font-size:11px;display:block}
.hx-train small{display:block;color:var(--mut);font-weight:500;font-size:10px}
.hx-brow{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#f6f7f9;border-radius:10px;padding:6px 8px;margin-bottom:6px}
.hx-brow small{display:block;color:var(--mut);font-size:10.5px}
.hx-legend{display:flex;flex-direction:column;gap:4px;margin:6px 0}
.hx-leg{display:flex;gap:7px;align-items:center;font-size:11.5px;color:var(--mut)}
.hx-leg i{width:11px;height:11px;border-radius:3px;border:1px solid #00000014;flex:none}
.hx-done{opacity:.45}
.hx-app [data-g="marks"],.hx-app [data-g="cursor"]{pointer-events:none}
.hx-app [data-key]{cursor:pointer}
@media(max-width:420px){.hx-app .hx-factions,.hx-app .hx-cheats{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.hx-app *{transition-duration:.01ms!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media(max-width:900px){.hx-app .hx-chip.hx-sub{display:none}}
@media(max-width:640px){
  .hx-app.game-fill>.hx-panel:not(:has(.hx-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
  .hx-app.game-fill>.hx-panel:has(.hx-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .hx-app{gap:6px}
  .hx-app .hx-hud{gap:4px}
  .hx-app .hx-hud .hx-chip{padding:4px 6px;font-size:9px;min-height:0}
  .hx-app .hx-hud .hx-chip.hx-units,.hx-app .hx-hud .hx-chip.hx-cities{display:none}
  .hx-app .hx-hud .hx-btn-label,.hx-app .hx-hud .hx-spacer{display:none}
  .hx-app .hx-hud .hx-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .hx-app .hx-main{flex-direction:column;gap:6px}
  .hx-app .hx-side{flex:none;width:100%;max-width:none;max-height:200px}
  .hx-ov{padding:8px}
  .hx-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .hx-help{grid-template-columns:1fr;gap:8px}
  .hx-body{scrollbar-width:none}
  .hx-body::-webkit-scrollbar{display:none}
  .hx-foot{padding-top:8px;border-top:1px solid var(--line)}
  .hx-note{display:none}
}
@media(pointer:coarse){
  .hx-app .hx-hud .hx-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .hx-app .hx-card .hx-btn{min-height:44px}
}
</style>
<div class="game-app hx-app game-fill" tabindex="0">
  <div class="hx-hud">
    <span class="hx-chip">Turn <b data-el="turn">–</b></span>
    <span class="hx-chip">Gold <b data-el="gold">–</b><small data-el="inc"></small></span>
    <span class="hx-chip hx-units">Units <b data-el="units">–</b></span>
    <span class="hx-chip hx-cities">Cities <b data-el="cities">–</b></span>
    <span class="hx-chip"><i class="hx-dot" data-el="facdot"></i><b data-el="facname">–</b></span>
    <span class="hx-chip"><i class="hx-dot" data-el="statusdot"></i><b data-el="status">Lobby</b></span>
    <span class="hx-chip hx-sub" data-el="sub">Capture the enemy capital.</span>
    <span class="hx-spacer"></span>
    <button class="hx-btn primary" type="button" data-act="end" data-el="end" title="End turn (E)">End Turn</button>
    <button class="hx-btn hx-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="hx-btn-label">Help</span></button>
    ${online ? "" : '<button class="hx-btn hx-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">' + iconSVG("wrench", { size: 14 }) + '<span class="hx-btn-label">Cheats</span></button>'}
    ${online ? "" : '<button class="hx-btn hx-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">' + iconSVG("pause", { size: 14 }) + '<span class="hx-btn-label">Pause</span></button>'}
    ${online && !room.isHost ? "" : '<button class="hx-btn hx-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">' + iconSVG("refresh", { size: 14 }) + '<span class="hx-btn-label">Restart</span></button>'}
    <button class="hx-btn hx-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="hx-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel hx-panel" data-board>
    <div class="hx-main">
      <div class="hx-mapwrap">
        <svg data-el="map" role="img" aria-label="Hex realm map">
          <g data-g="hexes"></g><g data-g="cities"></g><g data-g="units"></g><g data-g="marks"></g><g data-g="cursor"></g>
        </svg>
        <div class="hx-toast" data-el="toast"></div>
      </div>
      <aside class="hx-side" data-el="side"></aside>
    </div>

    <div class="hx-ov" data-ov="faction" hidden>
      <div class="hx-card">
        <div class="hx-head"><h3>Choose your faction</h3></div>
        <div class="hx-body">
          <p>Capture the enemy capital to win. Spawn sides and the first move are random.</p>
          <div class="hx-factions">${factionCards}</div>
        </div>
        <div class="hx-foot"><button class="hx-btn" type="button" data-act="pick" data-f="random">Surprise me</button></div>
      </div>
    </div>
    <div class="hx-ov" data-ov="wait" hidden>
      <div class="hx-card">
        <div class="hx-head"><h3>Waiting for host</h3></div>
        <div class="hx-body"><p>The host is choosing a faction. Your spawn side will be assigned randomly.</p></div>
      </div>
    </div>
    <div class="hx-ov" data-ov="help" hidden>
      <div class="hx-card">
        <div class="hx-head"><h3>How to play</h3><button class="hx-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="hx-body hx-help">
          <div>
            <b>Desktop</b>
            <ul class="hx-list">
              <li>Click a unit or city to inspect it.</li>
              <li>Click a dot to move, a red ring to attack. Attacking ends that unit's turn.</li>
              <li><b>WASD / Arrows</b> move the cursor, <b>Enter</b> acts on the cursor hex.</li>
              <li><b>H</b> help · <b>C</b> cheats · <b>P</b> pause · <b>R</b> restart · <b>E</b> end turn · <b>N</b> next unit</li>
            </ul>
            <b>Mobile</b>
            <ul class="hx-list">
              <li>Tap a unit, then a highlighted hex or ring.</li>
              <li>Use the pad below the map to move the cursor and act.</li>
              <li>HUD buttons: Help, Cheats, Pause, Restart, End Turn, Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul class="hx-list">
              <li><b>Goal:</b> capture the enemy capital. If yours falls, you lose.</li>
              <li>Each turn your cities earn gold. Spend it on units, farms and walls.</li>
              <li>Move onto an undefended enemy or free city to capture it. Free cities have a guard.</li>
              <li>Units heal +${HEAL} hp on your city at the start of your turn.</li>
              <li>Forest: +25% defense, 2 move. Hills: +40% defense. Water &amp; mountains block.</li>
              <li>Walls give +50% defense to the unit standing in that city.</li>
            </ul>
          </div>
        </div>
        <div class="hx-foot"><span class="hx-note">Press H to reopen this guide</span><button class="hx-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
    <div class="hx-ov" data-ov="pause" hidden>
      <div class="hx-card">
        <div class="hx-head"><h3>Paused</h3></div>
        <div class="hx-body"><p>The map, bot and timers are frozen. Press P or Esc to resume.</p></div>
        <div class="hx-foot"><button class="hx-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    ${online ? "" : `
    <div class="hx-ov" data-ov="cheat" hidden>
      <div class="hx-card">
        <div class="hx-head"><h3>Cheats</h3><button class="hx-btn" type="button" data-cheat-close aria-label="Close">Close</button></div>
        <div class="hx-body">
          <p>Offline only. Use anything to make the campaign easier.</p>
          <div class="hx-cheats">
            <button class="hx-btn" type="button" data-act="cheat" data-kind="gold">+250 Gold</button>
            <button class="hx-btn" type="button" data-act="cheat" data-kind="heal">Heal all units</button>
            <button class="hx-btn" type="button" data-act="cheat" data-kind="reveal">Reveal map</button>
            <button class="hx-btn" type="button" data-act="cheat" data-kind="weaken">Halve enemy HP</button>
            <button class="hx-btn" type="button" data-act="cheat" data-kind="god" data-el="godlabel">God mode: OFF</button>
          </div>
        </div>
        <div class="hx-foot"><span class="hx-note">Press C to toggle · Esc to close</span></div>
      </div>
    </div>`}
    <div class="hx-ov" data-ov="over" hidden>
      <div class="hx-card">
        <div class="hx-head"><h3 data-el="overtitle">Victory</h3></div>
        <div class="hx-body"><p data-el="overreason"></p><p data-el="overstats"></p></div>
        <div class="hx-foot">
          <span class="hx-note" data-el="guestnote" hidden>Waiting for the host to restart…</span>
          <button class="hx-btn primary" type="button" data-restart data-el="again">Play again</button>
        </div>
      </div>
    </div>
  </section>
  <div class="hx-pad" aria-label="Touch controls">
    <button type="button" data-act="cycle" title="Next unit">↻</button>
    <button type="button" data-act="pad" data-dir="up" aria-label="Up">▲</button>
    <button type="button" data-act="pad" data-dir="left" aria-label="Left">◀</button>
    <button type="button" class="ok" data-act="ok" aria-label="Select">OK</button>
    <button type="button" data-act="pad" data-dir="right" aria-label="Right">▶</button>
    <button type="button" data-act="pad" data-dir="down" aria-label="Down">▼</button>
    <button type="button" data-act="end" title="End turn">⏭</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const wrap = $(".hx-app");
    const svg = $('[data-el="map"]');
    const gHex = $('[data-g="hexes"]'), gCity = $('[data-g="cities"]'),
        gUnit = $('[data-g="units"]'), gMark = $('[data-g="marks"]'), gCur = $('[data-g="cursor"]');
    const sideEl = $('[data-el="side"]'), toastEl = $('[data-el="toast"]');
    const statusEl = $('[data-el="status"]'), statusDot = $('[data-el="statusdot"]'), subEl = $('[data-el="sub"]');
    const hudTurn = $('[data-el="turn"]'), hudGold = $('[data-el="gold"]'), hudInc = $('[data-el="inc"]'),
        hudUnits = $('[data-el="units"]'), hudCities = $('[data-el="cities"]'),
        facDot = $('[data-el="facdot"]'), facName = $('[data-el="facname"]');
    const endBtn = $('[data-el="end"]');
    const pauseBtn = $("[data-pause]"), cheatsBtn = $("[data-cheats]");
    const ovFaction = $('[data-ov="faction"]'), ovWait = $('[data-ov="wait"]'),
        ovHelp = $('[data-ov="help"]'), ovCheat = $('[data-ov="cheat"]'),
        ovPause = $('[data-ov="pause"]'), ovOver = $('[data-ov="over"]');
    const ovTitle = $('[data-el="overtitle"]'), ovReason = $('[data-el="overreason"]'),
        ovStats = $('[data-el="overstats"]'), againBtn = $('[data-el="again"]'), guestNote = $('[data-el="guestnote"]');
    const godLabel = $('[data-el="godlabel"]');

    /* ---------- geometry (pointy-top axial) ---------- */
    const SIZE = 30, SQ3 = Math.sqrt(3);
    const center = (q, r) => ({ x: SQ3 * SIZE * (q + r / 2), y: SIZE * 1.5 * r });
    function hexPts(cx, cy) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 180) * (60 * i - 30);
            pts.push((cx + SIZE * 0.96 * Math.cos(a)).toFixed(1) + "," + (cy + SIZE * 0.96 * Math.sin(a)).toFixed(1));
        }
        return pts.join(" ");
    }
    const TERRA = { g: "#e7efdd", f: "#d5e5cc", h: "#efe6d3", w: "#d9e8f4", m: "#e4e6ec", c: "#e7efdd" };
    const FOG = "#eef0f3";
    const TICON = {
        f: '<path d="M-7 6 L-2 -5 L3 6 Z" fill="#a7c49b"/><path d="M1 6 L6 -3 L11 6 Z" fill="#a7c49b" opacity=".7"/>',
        h: '<path d="M-9 5 Q-4 -4 1 5" fill="none" stroke="#cdbd97" stroke-width="2"/><path d="M0 5 Q5 -4 10 5" fill="none" stroke="#cdbd97" stroke-width="2"/>',
        w: '<path d="M-8 -2 Q-5 -6 -2 -2 T4 -2 T10 -2" fill="none" stroke="#a9c9e2" stroke-width="2"/><path d="M-8 5 Q-5 1 -2 5 T4 5 T10 5" fill="none" stroke="#a9c9e2" stroke-width="2"/>',
        m: '<path d="M-9 7 L-1 -8 L7 7 Z" fill="#c3c8d4"/><path d="M-4 -2 L-1 -8 L2 -2 Z" fill="#ffffff"/>',
    };

    /* ---------- small helpers ---------- */
    function mySlot() { return state && state.connToSlot ? state.connToSlot[playerIndex] : 0; }
    function hasMap() { return Boolean(state && state.hexes); }
    function myTurn() {
        return hasMap() && state.phase === "play" && state.current === mySlot() &&
            !state.players[state.current].bot && !paused;
    }
    function ownerColor(owner) {
        if (owner === NEUTRAL) return "#94a3b8";
        return FACTIONS[state.players[owner].faction].color;
    }
    function ownerName(owner) {
        if (owner === NEUTRAL) return "Free City";
        return FACTIONS[state.players[owner].faction].name;
    }
    function selUnit() {
        return sel && sel.type === "unit" && hasMap() ? byId(state, sel.id) : null;
    }
    function myCapital() {
        return hasMap() ? state.cities.find((c) => c.cap === mySlot()) : null;
    }

    function fitView() {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        Object.keys(state.hexes).forEach((k) => {
            const h = state.hexes[k], c = center(h.q, h.r);
            x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x);
            y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
        });
        const pw = (SQ3 * SIZE) / 2 + 6, ph = SIZE + 22;
        const vx = x0 - pw, vy = y0 - ph, vw = x1 - x0 + 2 * pw, vh = y1 - y0 + 2 * ph;
        svg.setAttribute("viewBox", vx.toFixed(1) + " " + vy.toFixed(1) + " " + vw.toFixed(1) + " " + vh.toFixed(1));
        svg.style.aspectRatio = Math.round(vw) + " / " + Math.round(vh);
    }

    /* ---------- svg builders ---------- */
    function citySVG(c) {
        const col = ownerColor(c.owner);
        let s = "";
        if (c.wall > 0) s += '<rect x="-11" y="10" width="22" height="3" rx="1.5" fill="#94a3b8"/>';
        s += '<rect x="-9" y="-9" width="18" height="18" rx="4" fill="' + col + '"/>';
        s += '<rect x="-2" y="1" width="4" height="8" rx="1" fill="#ffffff"/>';
        if (c.cap !== null) {
            s += '<path d="M0 -9 V-16" stroke="' + col + '" stroke-width="1.5"/>';
            s += '<path d="M0 -16 L7 -13.5 L0 -11 Z" fill="' + col + '"/>';
        }
        return s;
    }
    function unitSVG(u) {
        const col = ownerColor(u.owner);
        let s = '<circle r="11" fill="#ffffff" stroke="' + col + '" stroke-width="2.5"/>';
        if (u.fresh && u.owner !== NEUTRAL)
            s += '<circle r="14" fill="none" stroke="' + col + '" stroke-width="1.2" stroke-dasharray="3 3" opacity=".6"/>';
        s += '<text y="3.5" text-anchor="middle" font-size="10" font-weight="700" fill="' + col + '">' + UNITS[u.kind].glyph + "</text>";
        const w = Math.max(0, (u.hp / u.maxHp) * 20);
        const hpCol = u.owner === mySlot() ? "#10b981" : u.owner === NEUTRAL ? "#94a3b8" : "#ef4444";
        s += '<rect x="-10" y="13" width="20" height="2.5" rx="1.25" fill="#e5e7eb"/>';
        s += '<rect x="-10" y="13" width="' + w.toFixed(1) + '" height="2.5" rx="1.25" fill="' + hpCol + '"/>';
        return s;
    }
    function hexOutline(q, r, col, w, dash, op) {
        const c = center(q, r);
        return '<polygon points="' + hexPts(c.x, c.y) + '" fill="none" stroke="' + col +
            '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") +
            (op != null ? ' opacity="' + op + '"' : "") + "/>";
    }
    function ringAt(q, r, col, dash) {
        const c = center(q, r);
        return '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) +
            '" r="15" fill="none" stroke="' + col + '" stroke-width="2.5"' +
            (dash ? ' stroke-dasharray="' + dash + '"' : "") + "/>";
    }

    /* ---------- marks & cursor ---------- */
    function marksHTML(vis) {
        if (!hasMap()) return "";
        let s = "";
        const u = selUnit();
        const me = mySlot();
        if (u && u.owner === me && state.phase === "play") {
            s += hexOutline(u.q, u.r, "#111827", 2.5);
            if (myTurn() && !u.acted) {
                const reach = !u.moved ? unitReach(state, [u.q, u.r], moveOf(state, u), me) : [];
                reach.forEach((p) => {
                    const c = center(p[0], p[1]);
                    s += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="3.5" fill="#111827" opacity=".3"/>';
                });
                const rng = UNITS[u.kind].range;
                state.units.forEach((t) => {
                    if (t.owner === me || !vis[KEY(t.q, t.r)]) return;
                    if (hexDist([u.q, u.r], [t.q, t.r]) > rng) return;
                    s += ringAt(t.q, t.r, "#ef4444");
                });
                if (!u.moved) {
                    reach.forEach((p) => {
                        const c = cityAt(state, KEY(p[0], p[1]));
                        if (c && c.owner !== me) s += ringAt(c.q, c.r, "#10b981", "3 3");
                    });
                }
            }
        }
        if (sel && sel.type === "city" && state.hexes[sel.key]) {
            const h = state.hexes[sel.key];
            s += hexOutline(h.q, h.r, "#111827", 2.5);
        }
        return s;
    }
    function renderCursor() {
        if (!hasMap() || !cursorKey || !state.hexes[cursorKey]) { gCur.innerHTML = ""; return; }
        const h = state.hexes[cursorKey];
        gCur.innerHTML = hexOutline(h.q, h.r, "#111827", 2, "4 4", 0.35);
    }

    /* ---------- side panel ---------- */
    function barHTML(cur, max, color) {
        const pct = Math.max(0, Math.min(100, (cur / max) * 100));
        return '<div class="hx-bar"><i style="width:' + pct.toFixed(0) + "%;background:" + color + '"></i></div>';
    }
    function statRow(label, val) {
        return '<div class="hx-stat"><span>' + label + "</span><b>" + val + "</b></div>";
    }
    function legendHTML() {
        const rows = [
            [TERRA.g, "Grass — open ground"],
            [TERRA.f, "Forest — +25% def, 2 move"],
            [TERRA.h, "Hills — +40% def"],
            [TERRA.w, "Water — impassable"],
            [TERRA.m, "Mountain — impassable"],
        ];
        let s = '<div class="hx-legend">';
        rows.forEach((rw) => { s += '<div class="hx-leg"><i style="background:' + rw[0] + '"></i><span>' + rw[1] + "</span></div>"; });
        return s + "</div>";
    }
    function overviewHTML() {
        if (!hasMap()) return '<div class="hx-ptitle">Hexa Polis</div><div class="hx-note">Choose a faction to begin.</div>';
        const me = mySlot();
        const f = FACTIONS[state.players[me].faction];
        let s = '<div class="hx-ptitle">Your realm</div>';
        s += '<div class="hx-note"><b style="color:' + f.color + '">' + f.name + "</b> — " + f.bonus + "</div>";
        s += '<div class="hx-grid">' + statRow("Income", "+" + incomeOf(state, me) + "g") +
            statRow("Units", unitsOf(state, me).length) + "</div>";
        s += legendHTML();
        s += '<div class="hx-note">Select a unit or city. Press <b>H</b> for help.</div>';
        return s;
    }
    function unitHTML(u) {
        const me = mySlot();
        const spec = UNITS[u.kind];
        const th = state.hexes[KEY(u.q, u.r)];
        const city = cityAt(state, KEY(u.q, u.r));
        const mul = terrainMul(th.t) * (city && city.owner === u.owner && city.wall > 0 ? WALL_MUL : 1);
        let s = '<div class="hx-ptitle">' + spec.label + " — " + ownerName(u.owner) + "</div>";
        s += barHTML(u.hp, u.maxHp, u.owner === me ? "#10b981" : "#ef4444");
        s += '<div class="hx-grid">' +
            statRow("HP", u.hp + "/" + u.maxHp) +
            statRow("ATK", atkOf(state, u)) +
            statRow("DEF", spec.def + (mul > 1 ? " ×" + mul.toFixed(2).replace(/0$/, "") : "")) +
            statRow("MOVE", moveOf(state, u)) +
            statRow("RANGE", spec.range) +
            statRow("COST", spec.cost + "g") + "</div>";
        if (u.owner === me) {
            const status = u.fresh ? "Ready next turn"
                : u.acted ? "Done for this turn"
                    : u.moved ? "Moved — can still attack"
                        : "Ready — move and attack";
            s += '<div class="hx-note">' + status + ".</div>";
            if (city && city.owner === me)
                s += '<div class="hx-note">On your city: heals +' + HEAL + " hp each turn.</div>";
        } else if (u.guard) {
            s += '<div class="hx-note">A free-city guard. Defeat it, then move in to capture.</div>';
        }
        return s;
    }
    function cityHTML(c) {
        const me = mySlot();
        if (c.owner === me) {
            const f = state.players[me].faction;
            const inc = (c.cap === me ? CAP_INCOME : CITY_INCOME) + c.farm + (f === "imperia" ? 1 : 0);
            let s = '<div class="hx-ptitle">' + (c.cap !== null ? "Your capital" : "Your city") + "</div>";
            s += '<div class="hx-note">+' + inc + " gold per turn. Train and build here.</div>";
            const spotFree = Boolean(freeSpotNear(state, c));
            const can = myTurn();
            s += '<div class="hx-ptitle">Train (ready next turn)</div><div class="hx-train">';
            Object.keys(UNITS).forEach((k) => {
                const spec = UNITS[k];
                const ok = can && spotFree && state.players[me].gold >= spec.cost;
                s += '<button class="hx-btn" type="button" data-act="train" data-k="' + k + '"' + (ok ? "" : " disabled") + ">" +
                    spec.label + "<small>" + spec.cost + "g</small></button>";
            });
            s += "</div>";
            if (!spotFree) s += '<div class="hx-note">No free tile near this city.</div>';
            s += '<div class="hx-ptitle">Build</div>';
            Object.keys(BUILDINGS).forEach((bk) => {
                const b = BUILDINGS[bk], lvl = c[bk];
                const cost = b.base * (lvl + 1);
                const maxed = lvl >= b.max;
                const ok = can && !maxed && state.players[me].gold >= cost;
                s += '<div class="hx-brow"><div><b>' + b.label + "</b> Lv " + lvl + "<small>" + b.effect + "</small></div>" +
                    '<button class="hx-btn" type="button" data-act="build" data-b="' + bk + '"' + (ok ? "" : " disabled") + ">" +
                    (maxed ? "Max" : cost + "g") + "</button></div>";
            });
            return s;
        }
        const guard = unitAt(state, c.key);
        let s = '<div class="hx-ptitle">' + (c.cap !== null ? "Enemy capital" : c.owner === NEUTRAL ? "Free city" : "Rival city") +
            " — " + ownerName(c.owner) + "</div>";
        s += '<div class="hx-note">' + (guard ? "Defended by a " + UNITS[guard.kind].label.toLowerCase() + ". Defeat it first." : "Undefended — move a unit in to capture it.") + "</div>";
        if (c.wall > 0) s += '<div class="hx-note">Walls: +50% defense for its garrison.</div>';
        if (c.cap !== null) s += '<div class="hx-note">Capture this capital to win the war.</div>';
        return s;
    }
    function panelHTML() {
        if (!hasMap()) return overviewHTML();
        if (sel && sel.type === "unit") {
            const u = byId(state, sel.id);
            if (u) return unitHTML(u);
        }
        if (sel && sel.type === "city") {
            const c = cityAt(state, sel.key);
            if (c) return cityHTML(c);
        }
        return overviewHTML();
    }

    /* ---------- render ---------- */
    function render() {
        if (destroyed) return;
        const has = hasMap();
        const me = mySlot();
        const fac = has ? FACTIONS[state.players[me].faction] : null;
        wrap.style.setProperty("--accent", fac ? fac.color : "#3b82f6");

        let st = "Lobby", dot = "#9ca3af";
        if (has && state.phase === "play") {
            if (state.current === me) { st = "Your move"; dot = fac.color; }
            else {
                const p = state.players[state.current];
                st = FACTIONS[p.faction].name + (p.bot ? " is moving…" : " — opponent's move");
                dot = FACTIONS[p.faction].color;
            }
        } else if (has && state.phase === "over") {
            st = state.winner === me ? "Victory" : "Defeat";
            dot = state.winner === me ? "#10b981" : "#ef4444";
        }
        statusEl.textContent = st;
        statusDot.style.background = dot;
        if (has) {
            const cap = state.cities.find((c) => c.cap === me);
            subEl.textContent = "You are " + fac.name + " — " + compass(cap.q, cap.r) + " spawn. " + fac.bonus;
        } else {
            subEl.textContent = "Capture the enemy capital.";
        }

        if (has) {
            fitView();
            const vis = visibleNow(state, me);
            const explored = state.explored[me];
            gHex.innerHTML = Object.keys(state.hexes).map((k) => {
                const h = state.hexes[k], ex = Boolean(explored[k]), c = center(h.q, h.r);
                let s = '<g data-key="' + k + '">';
                s += '<polygon points="' + hexPts(c.x, c.y) + '" fill="' + (ex ? TERRA[h.t] : FOG) +
                    '" stroke="' + (ex ? "#f6f7f9" : "#e8eaef") + '" stroke-width="2"/>';
                if (ex) {
                    if (TICON[h.t])
                        s += '<g transform="translate(' + c.x.toFixed(1) + "," + c.y.toFixed(1) + ')">' + TICON[h.t] + "</g>";
                    if (h.owner !== null) {
                        const col = ownerColor(h.owner);
                        s += '<polygon points="' + hexPts(c.x, c.y) + '" fill="' + col + '" fill-opacity=".12" stroke="' + col + '" stroke-opacity=".45" stroke-width="1.6"/>';
                    }
                }
                return s + "</g>";
            }).join("");
            gCity.innerHTML = state.cities.filter((c) => explored[c.key]).map((c) => {
                const cc = center(c.q, c.r);
                return '<g data-key="' + c.key + '" transform="translate(' + cc.x.toFixed(1) + "," + cc.y.toFixed(1) + ')">' + citySVG(c) + "</g>";
            }).join("");
            gUnit.innerHTML = state.units.filter((u) => u.owner === me || vis[KEY(u.q, u.r)]).map((u) => {
                const c = center(u.q, u.r);
                const cls = u.acted && u.moved && !u.guard ? "hx-done" : "";
                return '<g class="' + cls + '" data-key="' + KEY(u.q, u.r) + '" transform="translate(' + c.x.toFixed(1) + "," + (c.y - 2).toFixed(1) + ')">' + unitSVG(u) + "</g>";
            }).join("");
            gMark.innerHTML = marksHTML(vis);
            renderCursor();
            hudTurn.textContent = String(state.turn);
            hudGold.textContent = String(state.players[me].gold);
            hudInc.textContent = "+" + incomeOf(state, me) + "/turn";
            hudUnits.textContent = String(unitsOf(state, me).length);
            hudCities.textContent = String(citiesOf(state, me).length);
            facDot.style.background = fac.color;
            facName.textContent = fac.name;
            toastEl.textContent = state.msg || "Select a unit or city.";
        } else {
            gHex.innerHTML = ""; gCity.innerHTML = ""; gUnit.innerHTML = ""; gMark.innerHTML = ""; gCur.innerHTML = "";
            hudTurn.textContent = "–"; hudGold.textContent = "–"; hudInc.textContent = "";
            hudUnits.textContent = "–"; hudCities.textContent = "–";
            facDot.style.background = "#9ca3af"; facName.textContent = "–";
            toastEl.textContent = "";
        }

        endBtn.disabled = !myTurn();
        sideEl.innerHTML = panelHTML();

        /* Overlays suppress each other: help > cheats > pause > result. */
        const canPick = Boolean(state && state.phase === "lobby" && (!online || room.isHost));
        ovFaction.hidden = !canPick || cheatsOpen || helpOpen || paused;
        ovWait.hidden = !(online && !room.isHost && (!state || state.phase === "lobby")) ||
            cheatsOpen || helpOpen || paused;
        ovHelp.hidden = !helpOpen;
        if (ovCheat) ovCheat.hidden = !cheatsOpen || helpOpen;
        ovPause.hidden = !paused || cheatsOpen || helpOpen;
        const over = Boolean(state && state.phase === "over");
        ovOver.hidden = !over || cheatsOpen || helpOpen || paused;
        if (over) {
            const win = state.winner === me;
            ovTitle.textContent = win ? "Victory" : "Defeat";
            ovTitle.style.color = win ? "#10b981" : "#ef4444";
            ovReason.textContent = state.reason;
            ovStats.textContent = "Turns: " + state.turn + " · Cities held: " + citiesOf(state, me).length +
                " · Units alive: " + unitsOf(state, me).length + " · Gold: " + state.players[me].gold;
            againBtn.hidden = online && !room.isHost;
            guestNote.hidden = !(online && !room.isHost);
        }
        if (godLabel && has) godLabel.textContent = "God mode: " + (state.god[me] ? "ON" : "OFF");
        if (cheatsBtn) cheatsBtn.classList.toggle("on", cheatsOpen);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".hx-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
        }
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
            pauseStart = perfNow();
            clearBotTimer();
        } else {
            pauseOffset += perfNow() - pauseStart;
            pauseStart = 0;
            const wait = botRemaining;
            botRemaining = null;
            if (wait !== null) scheduleBot(wait);
        }
        render();
    }

    /* ---------- networking / action flow ---------- */
    function publish() {
        render();
        if (online && room.isHost && state) room.publishState(state).catch(console.warn);
    }
    /* Pause-aware bot timer: store the Date.now() due anchor, freeze the
       remaining delay on pause and replay only that remainder on resume. */
    function clearBotTimer() {
        if (!botTimer) return;
        clearTimeout(botTimer);
        botTimer = null;
        botRemaining = Math.max(0, botDue - clockNow());
        botDue = 0;
    }
    function scheduleBot(wait) {
        if (destroyed || online || paused || botTimer) return;
        if (!state || state.phase !== "play" || !state.players[state.current].bot) return;
        const ms = typeof wait === "number" ? wait : 750;
        botTimer = setTimeout(() => {
            botTimer = null; botDue = 0;
            if (destroyed || paused || !state || state.phase !== "play") return;
            const s = state.current;
            if (!state.players[s].bot) return;
            state.msg = botTurn(state, s);
            checkEnd(state);
            if (state.phase !== "over") {
                passTurn(state);
                updateExplored(state);
                checkEnd(state);
            }
            publish();
            scheduleBot();
        }, ms);
        botDue = clockNow() + ms;
    }
    function finish() {
        updateExplored(state);
        checkEnd(state);
        publish();
        scheduleBot();
    }

    function applyAction(action, actor) {
        if (destroyed || !state || !action) return;
        if (paused && action.type !== "restart") return;
        const slot = state.connToSlot ? state.connToSlot[actor] : 0;

        if (action.type === "start") {
            if (actor !== 0 || state.phase !== "lobby") return;
            state = newGame(action.faction, online);
            state.msg = FACTIONS[state.players[state.firstSlot].faction].name + " moves first.";
            sel = null; cursorKey = null; helpOpen = false; cheatsOpen = false;
            finish();
            return;
        }
        if (action.type === "restart") {
            if (actor !== 0) return;
            clearBotTimer(); botRemaining = null;
            paused = false; pauseStart = 0; pauseOffset = 0;
            state = makeLobby();
            sel = null; cursorKey = null; helpOpen = false; cheatsOpen = false;
            publish();
            return;
        }
        if (state.phase !== "play") return;
        if (action.type === "cheat") {
            if (online) return;
            applyCheat(state, slot, action.kind);
            finish();
            return;
        }
        if (state.current !== slot || state.players[slot].bot) return;

        if (action.type === "move") {
            const u = byId(state, action.id);
            if (!u || u.owner !== slot || u.moved || u.acted) return;
            const reach = unitReach(state, [u.q, u.r], moveOf(state, u), slot);
            if (!reach.some((p) => p[0] === action.q && p[1] === action.r)) return;
            u.q = action.q; u.r = action.r; u.moved = true;
            const c = cityAt(state, KEY(u.q, u.r));
            if (c && c.owner !== slot) {
                captureCity(state, c, slot);
                u.acted = true;
                state.msg = c.cap !== null ? "Enemy capital captured!" : "City captured! Its buildings are yours.";
            } else state.msg = "Moved.";
        } else if (action.type === "attack") {
            const u = byId(state, action.id), t = byId(state, action.targetId);
            if (!u || !t || u.owner !== slot || u.acted || t.owner === slot || t.hp <= 0) return;
            if (hexDist([u.q, u.r], [t.q, t.r]) > UNITS[u.kind].range) return;
            if (!visibleNow(state, slot)[KEY(t.q, t.r)]) return;
            const res = resolveStrike(state, u, t);
            state.msg = res.slain ? "Enemy destroyed for " + res.dealt + " damage."
                : "Hit " + res.dealt + (res.counter ? ", took " + res.counter + " back" : "") + ".";
            if (res.attackerSlain) state.msg += " Your unit fell.";
        } else if (action.type === "train") {
            const c = cityAt(state, action.key);
            const spec = UNITS[action.kind];
            if (!c || !spec || c.owner !== slot) return;
            if (state.players[slot].gold < spec.cost) { state.msg = "Not enough gold."; publish(); return; }
            const spot = freeSpotNear(state, c);
            if (!spot) { state.msg = "No free tile near this city."; publish(); return; }
            state.players[slot].gold -= spec.cost;
            spawnUnit(state, slot, action.kind, spot[0], spot[1], true);
            state.msg = spec.label + " ready next turn.";
        } else if (action.type === "build") {
            const c = cityAt(state, action.key);
            const b = BUILDINGS[action.b];
            if (!c || !b || c.owner !== slot || c[action.b] >= b.max) return;
            const cost = b.base * (c[action.b] + 1);
            if (state.players[slot].gold < cost) { state.msg = "Not enough gold."; publish(); return; }
            state.players[slot].gold -= cost;
            c[action.b] += 1;
            state.msg = b.label + " built (Lv " + c[action.b] + ").";
        } else if (action.type === "end") {
            passTurn(state);
            state.msg = FACTIONS[state.players[state.current].faction].name + " to move.";
            sel = null;
        } else return;

        finish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- input: pointer ---------- */
    function handleHexClick(key) {
        if (destroyed || helpOpen || cheatsOpen || paused) return;
        if (!hasMap() || !state.hexes[key]) { sel = null; render(); return; }
        cursorKey = key;
        const hex = state.hexes[key];
        const u = selUnit();
        const target = unitAt(state, key);
        const city = cityAt(state, key);
        const me = mySlot();
        const vis = visibleNow(state, me);
        if (myTurn() && u && u.owner === me && !u.acted) {
            const d = hexDist([u.q, u.r], [hex.q, hex.r]);
            if (target && target.owner !== me && d <= UNITS[u.kind].range && vis[key]) {
                submitAction({ type: "attack", id: u.id, targetId: target.id });
                return;
            }
            if (!target && !u.moved) {
                const reach = unitReach(state, [u.q, u.r], moveOf(state, u), me);
                if (reach.some((p) => KEY(p[0], p[1]) === key)) {
                    submitAction({ type: "move", id: u.id, q: hex.q, r: hex.r });
                    return;
                }
            }
        }
        if (target && (target.owner === me || vis[key])) { sel = { type: "unit", id: target.id }; render(); return; }
        if (city && (city.owner === me || state.explored[me][key])) { sel = { type: "city", key }; render(); return; }
        sel = null;
        render();
    }

    function moveCursorDir(dir) {
        if (!hasMap()) return;
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        if (!d) return;
        let base = cursorKey && state.hexes[cursorKey] ? cursorKey : null;
        if (!base) { const c = myCapital(); base = c ? c.key : Object.keys(state.hexes)[0]; }
        const p = base.split(",").map(Number);
        const tq = p[0] + d[0], tr = p[1] + d[1];
        if (state.hexes[KEY(tq, tr)]) cursorKey = KEY(tq, tr);
        else {
            let best = null, bd = Infinity;
            Object.keys(state.hexes).forEach((k) => {
                const h = state.hexes[k];
                const dd = hexDist([h.q, h.r], [tq, tr]);
                if (dd < bd) { bd = dd; best = k; }
            });
            if (best) cursorKey = best;
        }
        renderCursor();
    }

    function cycleUnit() {
        if (!hasMap()) return;
        const list = unitsOf(state, mySlot());
        if (!list.length) return;
        let i = -1;
        if (sel && sel.type === "unit") i = list.findIndex((u) => u.id === sel.id);
        const u = list[(i + 1) % list.length];
        sel = { type: "unit", id: u.id };
        cursorKey = KEY(u.q, u.r);
        render();
    }

    function handleClick(event) {
        if (destroyed) return;
        const t = event.target;
        const closest = (s) => (t.closest ? t.closest(s) : null);
        if (closest("[data-exit]")) { onExit(); return; }
        if (closest("[data-help]")) { toggleHelp(); focusWrap(); return; }
        if (closest("[data-help-close]")) { toggleHelp(false); focusWrap(); return; }
        if (closest("[data-cheats]")) {
            if (!online) { cheatsOpen = !cheatsOpen; if (cheatsOpen) helpOpen = false; render(); }
            focusWrap(); return;
        }
        if (closest("[data-cheat-close]")) { cheatsOpen = false; render(); focusWrap(); return; }
        if (closest("[data-pause]")) { togglePause(); focusWrap(); return; }
        if (closest("[data-resume]")) { togglePause(false); focusWrap(); return; }
        if (closest("[data-restart]")) { submitAction({ type: "restart" }); focusWrap(); return; }
        const actEl = closest("[data-act]");
        if (actEl) {
            const act = actEl.dataset.act;
            if (helpOpen || paused) return;
            if (cheatsOpen && act !== "cheat") return;
            if (act === "pick") submitAction({ type: "start", faction: actEl.dataset.f });
            else if (act === "end") { if (myTurn()) submitAction({ type: "end" }); }
            else if (act === "cheat") submitAction({ type: "cheat", kind: actEl.dataset.kind });
            else if (act === "train") { if (sel && sel.type === "city") submitAction({ type: "train", key: sel.key, kind: actEl.dataset.k }); }
            else if (act === "build") { if (sel && sel.type === "city") submitAction({ type: "build", key: sel.key, b: actEl.dataset.b }); }
            else if (act === "pad") moveCursorDir(actEl.dataset.dir);
            else if (act === "ok") { if (cursorKey) handleHexClick(cursorKey); }
            else if (act === "cycle") cycleUnit();
            return;
        }
        if (helpOpen || cheatsOpen || paused) return;
        const keyEl = closest("[data-key]");
        if (keyEl) handleHexClick(keyEl.getAttribute("data-key"));
    }

    /* ---------- input: keyboard ---------- */
    function onKey(e) {
        if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key, code = e.code || "";
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        /* priority: help -> cheats -> pause -> escape -> restart -> game actions */
        if (code === "KeyH" || k === "h" || k === "H" || k === "?") {
            if (!e.repeat) toggleHelp();
            e.preventDefault(); return;
        }
        if (code === "KeyC" || k === "c" || k === "C") {
            if (!e.repeat && !online && !helpOpen) { cheatsOpen = !cheatsOpen; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyP" || k === "p" || k === "P") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (paused) togglePause(false);
            else { sel = null; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyR" || k === "r" || k === "R") {
            if (!e.repeat && !helpOpen && !cheatsOpen && (!online || room.isHost))
                submitAction({ type: "restart" });
            e.preventDefault(); return;
        }
        if (tag === "BUTTON") return; /* native Enter/Space on HUD buttons */
        if (helpOpen || cheatsOpen || paused) { e.preventDefault(); return; }
        if (!hasMap() || state.phase !== "play") return;
        const dirs = {
            ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
            w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
        };
        if (dirs[k]) { moveCursorDir(dirs[k]); e.preventDefault(); return; }
        if (k === "Enter" || k === " ") { if (cursorKey) handleHexClick(cursorKey); e.preventDefault(); return; }
        if (k === "e" || k === "E") { if (myTurn()) submitAction({ type: "end" }); e.preventDefault(); return; }
        if (k === "n" || k === "N") { cycleUnit(); e.preventDefault(); return; }
    }

    function onHover(e) {
        if (destroyed || !hasMap()) return;
        const g = e.target.closest ? e.target.closest("[data-key]") : null;
        if (g) {
            const k = g.getAttribute("data-key");
            if (k !== cursorKey) { cursorKey = k; renderCursor(); }
        }
    }
    function focusWrap() { try { wrap.focus({ preventScroll: true }); } catch (_) { wrap.focus(); } }

    /* ---------- boot & wiring ---------- */
    root.addEventListener("click", handleClick);
    wrap.addEventListener("keydown", onKey);
    wrap.addEventListener("pointerdown", focusWrap);
    svg.addEventListener("pointermove", onHover);

    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            state = makeLobby();
            publish();
            room.onAction((action) => { if (!destroyed) applyAction(action, 1); });
        } else {
            room.onState((nextState) => { if (destroyed) return; state = nextState; render(); });
        }
    } else {
        state = makeLobby();
        render();
    }
    focusWrap();

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            wrap.removeEventListener("keydown", onKey);
            wrap.removeEventListener("pointerdown", focusWrap);
            svg.removeEventListener("pointermove", onHover);
            clearBotTimer();
            botRemaining = null;
        },
    };
}