/*
  Mini City Builder — template-compatible version.
  1. META.id must match the filename (mini-city-builder.js).
  2. All game logic lives in mount().
  3. Regenerate manifest: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "mini-city-builder",
    name: "Mini City Builder",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Race a rival mayor to 150 citizens. Build beside roads, follow the demand bars, keep the treasury alive.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 42V22l8-6 8 6v20"/><path d="M22 42V14h12l8 8v20"/><path d="M8 42h34"/><path d="M28 22h4M36 22h-4M28 30h4M36 30h-4M12 30h4M12 36h4"/></svg>',
    bg: ["#fcd34d", "#d97706"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = online && Boolean(room.isHost);

    /* ================= constants & catalog ================= */
    const GRID = 9;
    const TARGET = 150;
    const ROUNDS = 48;          // final census after this many rounds
    const STRIKES = 3;          // bankruptcies before you lose
    const START_MONEY = 140;
    const START_POP = 6;
    const MIN_FRONTAGE = 34;    // generator guarantee: enough road-side plots

    const B = {
        road: { label: "Road", cost: 5, upkeep: 0, income: 0, cap: 0, jobs: 0, happy: 0 },
        house: { label: "House", cost: 20, upkeep: 0, income: 0, cap: 12, jobs: 0, happy: 0 },
        apartment: { label: "Apartment", cost: 40, upkeep: 1, income: 0, cap: 32, jobs: 0, happy: 0 },
        shop: { label: "Shop", cost: 25, upkeep: 1, income: 7, cap: 0, jobs: 6, happy: 0 },
        office: { label: "Office", cost: 55, upkeep: 1, income: 10, cap: 0, jobs: 8, happy: 1 },
        factory: { label: "Factory", cost: 60, upkeep: 2, income: 14, cap: 0, jobs: 10, happy: -8 },
        park: { label: "Park", cost: 15, upkeep: 0, income: 0, cap: 0, jobs: 0, happy: 6 },
        landmark: { label: "Landmark", cost: 90, upkeep: 2, income: 2, cap: 0, jobs: 0, happy: 14 },
    };
    const TYPES = Object.keys(B);
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const ZONES = [["R", "Residential", "var(--mcb-r)"], ["C", "Commercial", "var(--mcb-c)"],
    ["I", "Industrial", "var(--mcb-i)"], ["O", "Office", "var(--mcb-o)"]];

    /* ================= helpers ================= */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const inGrid = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID;

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ================= pure rules ================= */
    function roadAdj(g, x, y) {
        return DIRS.some(([dx, dy]) => inGrid(x + dx, y + dy) && g[y + dy][x + dx] === "road");
    }
    function frontageCells(g) {
        const out = [];
        for (let y = 0; y < GRID; y++)
            for (let x = 0; x < GRID; x++)
                if (g[y][x] === null && roadAdj(g, x, y)) out.push([x, y]);
        return out;
    }
    function counts(g) {
        const c = {}; TYPES.forEach((t) => (c[t] = 0));
        for (const row of g) for (const t of row) if (t in c) c[t]++;
        return c;
    }
    function capacityOf(c) { return c.house * B.house.cap + c.apartment * B.apartment.cap; }

    function demands(c, pop) {
        const jobs = c.shop * B.shop.jobs + c.office * B.office.jobs + c.factory * B.factory.jobs;
        return {
            R: clamp(Math.round(55 + (jobs * 1.8 - pop) * 1.1), 0, 100),
            C: clamp(Math.round(30 + (pop - c.shop * 14) * 2.4), 0, 100),
            I: clamp(Math.round(45 + (pop * 0.5 - c.factory * 16) * 1.8), 0, 100),
            O: clamp(Math.round(8 + (pop - 55) * 2.0 - c.office * 12), 0, 100),
            jobs,
        };
    }

    function econ(city) {
        const c = counts(city.grid);
        const happy = city.cheatHappy ? 100
            : clamp(50 + c.park * 6 + c.landmark * 14 + c.office * 1 - c.factory * 8, 0, 100);
        const d = demands(c, city.pop);
        const wf = d.jobs > 0 ? clamp((city.pop * 0.6) / d.jobs, 0.5, 1) : 1;
        let income = 0;
        income += c.shop * B.shop.income * (0.5 + d.C / 200) * wf;
        income += c.office * B.office.income * (0.5 + d.O / 200) * wf;
        income += c.factory * B.factory.income * (0.5 + d.I / 200) * wf;
        income += c.landmark * B.landmark.income;
        let upkeep = 0;
        for (const t of TYPES) upkeep += c[t] * B[t].upkeep;
        if (city.cheatUpkeep) upkeep = 0;
        return { c, d, happy, income: Math.round(income), upkeep };
    }

    function tickCity(city) {
        const e = econ(city);
        city.happy = e.happy;
        city.money += e.income - e.upkeep;
        if (city.money < 0) { city.strikes++; city.money = 0; }
        const cap = capacityOf(e.c);
        const target = cap * (0.45 + (0.55 * e.happy) / 100);
        const gap = target - city.pop;
        if (gap > 0) city.pop = Math.min(cap, city.pop + Math.min(8, gap * 0.3) * (0.5 + (0.5 * e.d.R) / 100));
        else if (gap < 0) city.pop = Math.max(0, city.pop - Math.min(5, -gap * 0.25));
        if (e.happy < 20 && city.pop > 0) city.pop = Math.max(0, city.pop - 2);
    }

    function canPlace(city, type, x, y) {
        if (!inGrid(x, y) || !B[type]) return { ok: false, reason: "bad" };
        const cell = city.grid[y][x];
        if (cell === "water") return { ok: false, reason: "water" };
        if (cell !== null) return { ok: false, reason: "occupied" };
        if (!city.cheatFree && city.money < B[type].cost) return { ok: false, reason: "money" };
        if (!roadAdj(city.grid, x, y)) return { ok: false, reason: "road" };
        return { ok: true, reason: "" };
    }
    function place(city, type, x, y) {
        const chk = canPlace(city, type, x, y);
        if (!chk.ok) return false;
        city.grid[y][x] = type;
        if (!city.cheatFree) city.money -= B[type].cost;
        return true;
    }
    function demolish(city, x, y) {
        if (!inGrid(x, y)) return false;
        const t = city.grid[y][x];
        if (!t || t === "water") return false;
        city.grid[y][x] = null;
        city.money += Math.floor(B[t].cost / 2);
        return true;
    }

    /* ================= solvable random map generator ================= */
    function makeMap(seed) {
        const rnd = mulberry32(seed);
        const base = Array.from({ length: GRID }, () => Array(GRID).fill(null));
        const r1 = 1 + Math.floor(rnd() * 3);
        const r2 = 5 + Math.floor(rnd() * 3);
        for (let x = 0; x < GRID; x++) { base[r1][x] = "road"; base[r2][x] = "road"; }
        for (const c of [1 + Math.floor(rnd() * 3), 5 + Math.floor(rnd() * 3)])
            for (let y = r1 + 1; y < r2; y++) base[y][c] = "road";
        const bx = Math.floor(rnd() * GRID), up = rnd() < 0.5, len = 1 + Math.floor(rnd() * 2);
        const anchor = up ? r1 : r2;
        for (let k = 1; k <= len; k++) {
            const y = up ? anchor - k : anchor + k;
            if (inGrid(bx, y) && base[y][bx] === null) base[y][bx] = "road";
        }
        const blobs = 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < blobs; i++) {
            let sx = -1, sy = -1;
            for (let a = 0; a < 20; a++) {
                const xx = Math.floor(rnd() * GRID), yy = Math.floor(rnd() * GRID);
                if (base[yy][xx] === null) { sx = xx; sy = yy; break; }
            }
            if (sx < 0) continue;
            const size = 2 + Math.floor(rnd() * 3);
            const cells = [[sx, sy]];
            base[sy][sx] = "water";
            while (cells.length < size) {
                const [cx, cy] = cells[Math.floor(rnd() * cells.length)];
                const [dx, dy] = DIRS[Math.floor(rnd() * 4)];
                const nx = cx + dx, ny = cy + dy;
                if (inGrid(nx, ny) && base[ny][nx] === null) { base[ny][nx] = "water"; cells.push([nx, ny]); }
                else break;
            }
        }
        return base;
    }

    function makeCity(base) {
        const grid = base.map((row) => row.slice());
        const fr = frontageCells(grid);
        if (fr.length < MIN_FRONTAGE) return null;
        grid[fr[0][1]][fr[0][0]] = "house";   // free starter blocks, identical for both mayors
        grid[fr[1][1]][fr[1][0]] = "shop";
        return {
            grid, money: START_MONEY, pop: START_POP, happy: 50, strikes: 0,
            cheatHappy: false, cheatFree: false, cheatUpkeep: false
        };
    }

    /* Greedy mayor: doubles as the solvability proof and the bot's brain. */
    function bestRoad(city) {
        const g = city.grid;
        const fr = frontageCells(g);
        const set = new Set(fr.map(([x, y]) => x + "," + y));
        const sorted = fr.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let best = null, bs = -Infinity;
        for (const [x, y] of sorted) {
            let score = 0;
            for (const [dx, dy] of DIRS) {
                const nx = x + dx, ny = y + dy;
                if (inGrid(nx, ny) && g[ny][nx] === null && !set.has(nx + "," + ny)) score++;
            }
            score -= Math.abs(x - 4) * 0.01 + Math.abs(y - 4) * 0.01;
            if (score > bs) { bs = score; best = [x, y]; }
        }
        return best;
    }

    function greedyAction(city) {
        const g = city.grid, c = counts(g), money = city.money, pop = city.pop;
        const d = demands(c, pop), happy = city.happy;
        const fr = frontageCells(g);
        const e = econ(city), net = e.income - e.upkeep;
        const cap = capacityOf(c);
        const proj = cap * (0.45 + (0.55 * happy) / 100);
        const afford = (t) => money >= B[t].cost + (net < 0 ? 8 : 0) && fr.length > 0;

        if (fr.length < 4 && money >= B.road.cost) {
            const r = bestRoad(city);
            if (r) return { t: "build", b: "road", x: r[0], y: r[1] };
        }
        if (!fr.length) { // sealed city: reopen frontage by demolishing the cheapest plot
            const opts = [];
            for (let y = 0; y < GRID; y++)
                for (let x = 0; x < GRID; x++) {
                    const t = g[y][x];
                    if (t && t !== "water" && t !== "road" && roadAdj(g, x, y)) opts.push([B[t].cost, x, y]);
                }
            opts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
            if (opts.length) return { t: "demolish", x: opts[0][1], y: opts[0][2] };
            return { t: "pass" };
        }
        const need = Math.max(0, 168 - proj);
        const utils = [];
        const rt = money >= B.apartment.cost + 30 ? "apartment" : "house";
        utils.push([d.R * 1.2 + Math.min(need, 50) * 0.5, rt]);
        if (happy < 70 && cap >= 140) utils.push([(70 - happy) * 2, money >= 130 ? "landmark" : "park"]);
        if (d.C >= 20) utils.push([d.C, "shop"]);
        if (d.O >= 20) utils.push([d.O, "office"]);
        if (d.I >= 20 && happy >= 58) utils.push([d.I, "factory"]);
        utils.sort((a, b) => b[0] - a[0]);
        const top = utils[0][0];
        for (const [u, t] of utils)
            if (afford(t) && u >= Math.max(20, top * 0.45))
                return { t: "build", b: t, x: fr[0][0], y: fr[0][1] };
        return { t: "pass" }; // save up for what the city actually wants
    }

    function simulateWin(base) {
        const city = makeCity(base);
        if (!city) return false;
        for (let r = 0; r < ROUNDS; r++) {
            const a = greedyAction(city);
            if (a.t === "build") place(city, a.b, a.x, a.y);
            else if (a.t === "demolish") demolish(city, a.x, a.y);
            tickCity(city);
            if (city.pop >= TARGET) return true;
            if (city.strikes >= STRIKES) return false;
        }
        return false;
    }

    function generateBase(seed) {
        for (let k = 0; k < 60; k++) {
            const s = (seed + k) >>> 0;
            const base = makeMap(s);
            if (makeCity(base) && simulateWin(base)) return { base, seed: s };
        }
        // Guaranteed-open fallback layout (verified solvable).
        const base = Array.from({ length: GRID }, () => Array(GRID).fill(null));
        for (let x = 0; x < GRID; x++) { base[2][x] = "road"; base[6][x] = "road"; }
        for (let y = 3; y < 6; y++) { base[y][2] = "road"; base[y][6] = "road"; }
        return { base, seed };
    }

    /* ================= match state ================= */
    let state = null;
    let roomData = null;
    let destroyed = false;
    let botTimer = null;
    const unsubs = [];

    function newMatch() {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        const gen = generateBase(seed);
        const rnd = mulberry32((gen.seed ^ 0x9e3779b9) >>> 0);
        const first = rnd() < 0.5 ? 0 : 1;              // random coin toss: who goes first
        const hostSeat = online ? (rnd() < 0.5 ? 0 : 1) : 0; // random seat assignment in multiplayer
        const names = ["Mayor 1", "Mayor 2"];
        if (online) { names[hostSeat] = playerName || "Host"; names[1 - hostSeat] = "Guest"; }
        else { names[0] = playerName || "You"; names[1] = "Bot"; }
        state = {
            v: 1, seed: gen.seed, base: gen.base,
            cities: [makeCity(gen.base), makeCity(gen.base)],
            names, hostSeat, first, turn: first,
            moves: 0, round: 0, phase: "playing", result: null, cheated: false, last: null,
        };
        cursor = { x: 4, y: 4 };
        selType = "house";
        demolishMode = false;
        noteKey = "";
        paused = false;
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    }

    const mySeat = () => (online ? (isHost ? state.hostSeat : 1 - state.hostSeat) : 0);

    function checkEnd() {
        const [a, b] = state.cities;
        const winA = a.pop >= TARGET, winB = b.pop >= TARGET;
        const deadA = a.strikes >= STRIKES, deadB = b.strikes >= STRIKES;
        const byPop = a.pop > b.pop ? 0 : b.pop > a.pop ? 1 : -1;
        let result = null;
        if (deadA && deadB) result = { winner: -1, reason: "bankrupt" };
        else if (deadA) result = { winner: 1, reason: "bankrupt" };
        else if (deadB) result = { winner: 0, reason: "bankrupt" };
        else if (winA && winB) result = { winner: byPop, reason: "target" };
        else if (winA) result = { winner: 0, reason: "target" };
        else if (winB) result = { winner: 1, reason: "target" };
        else if (state.round >= ROUNDS) result = { winner: byPop, reason: "census" };
        if (result) { state.result = result; state.phase = "over"; }
    }

    function afterAction() {
        state.turn = 1 - state.turn;
        if (state.moves % 2 === 0) {
            state.round++;
            tickCity(state.cities[0]);
            tickCity(state.cities[1]);
            checkEnd();
        }
    }

    function applyCheat(k) {
        const city = state.cities[mySeat()];
        if (k === "money") city.money += 500;
        else if (k === "fill") city.pop = Math.max(city.pop, capacityOf(counts(city.grid)));
        else if (k === "happy") { city.cheatHappy = !city.cheatHappy; if (city.cheatHappy) city.happy = 100; }
        else if (k === "free") city.cheatFree = !city.cheatFree;
        else if (k === "upkeep") city.cheatUpkeep = !city.cheatUpkeep;
        else if (k === "win") { city.pop = Math.max(city.pop, TARGET); checkEnd(); }
        state.cheated = true;
    }

    /* Host-authoritative action handler (also used offline). */
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action.t !== "string") return;
        if (action.t === "rematch") {
            if (online && actor !== state.hostSeat) return;
            newMatch(); publish(); return;
        }
        if (action.t === "cheat") {
            if (online || state.phase !== "playing" || actor !== mySeat()) return;
            applyCheat(action.k); publish(); return;
        }
        if (state.phase !== "playing" || actor !== state.turn) return;
        const city = state.cities[actor];
        if (action.t === "build") {
            const x = action.x | 0, y = action.y | 0;
            if (!B[action.b] || !place(city, action.b, x, y)) return;
            state.last = { seat: actor, act: "build", b: action.b };
        } else if (action.t === "demolish") {
            const x = action.x | 0, y = action.y | 0;
            if (!demolish(city, x, y)) return;
            state.last = { seat: actor, act: "demolish" };
        } else if (action.t === "pass") {
            state.last = { seat: actor, act: "pass" };
        } else return;
        state.moves++;
        afterAction();
        publish();
    }

    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* Bot: greedy core + a little seeded noise so matches vary. */
    function botAction() {
        const city = state.cities[1];
        const base = greedyAction(city);
        const rnd = mulberry32((state.seed * 7919 + state.moves * 104729) >>> 0);
        if (base.t === "build" && rnd() < 0.18) {
            const c = counts(city.grid), d = demands(c, city.pop);
            const fr = frontageCells(city.grid), money = city.money;
            const opts = [];
            for (const [t, key] of [["house", "R"], ["apartment", "R"], ["shop", "C"], ["office", "O"], ["factory", "I"], ["park", null]]) {
                if (money >= B[t].cost && fr.length) {
                    let u = (key ? d[key] : Math.max(0, 70 - city.happy) * 2) + rnd() * 25;
                    if (t === "factory" && city.happy < 58) u -= 40;
                    opts.push([u, t]);
                }
            }
            opts.sort((a, b) => b[0] - a[0]);
            if (opts.length) return { t: "build", b: opts[0][1], x: fr[0][0], y: fr[0][1] };
        }
        return base;
    }

    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (destroyed || paused || online || !state || state.phase !== "playing" || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (!destroyed && state && state.phase === "playing" && state.turn === 1)
                applyAction(botAction(), 1);
        }, 700);
    }

    function publish() {
        render();
        if (online && isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ================= UI ================= */
    let selType = "house";
    let demolishMode = false;
    let cursor = { x: 4, y: 4 };
    let helpOpen = false, cheatOpen = false, paused = false;
    let padOn = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    let noteKey = "";

    /* First-run internal help (global how-to is suppressed for this game id) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("mini-city-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("mini-city-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }

    const ICONS = {
        house: '<path d="M-12 2 L0 -10 L12 2 Z" fill="#2563eb"/><rect x="-9" y="2" width="18" height="10" rx="1" fill="#93c5fd"/><rect x="-2.5" y="5" width="5" height="7" fill="#1e3a8a"/>',
        apartment: '<rect x="-8" y="-13" width="16" height="25" rx="1.5" fill="#6366f1"/><g fill="#c7d2fe"><rect x="-5" y="-10" width="4" height="3"/><rect x="1" y="-10" width="4" height="3"/><rect x="-5" y="-4" width="4" height="3"/><rect x="1" y="-4" width="4" height="3"/><rect x="-5" y="2" width="4" height="3"/><rect x="1" y="2" width="4" height="3"/></g><rect x="-2" y="7" width="4" height="5" fill="#312e81"/>',
        shop: '<rect x="-10" y="-2" width="20" height="12" rx="1" fill="#34d399"/><path d="M-11 -2 h22 v-6 h-22 Z" fill="#f59e0b"/><rect x="-3" y="2" width="6" height="8" fill="#065f46"/>',
        office: '<rect x="-7" y="-14" width="14" height="26" rx="1.5" fill="#8b5cf6"/><path d="M-7 -8 h14 M-7 -2 h14 M-7 4 h14" stroke="#ddd6fe" stroke-width="1.5"/><rect x="-2" y="8" width="4" height="4" fill="#4c1d95"/>',
        factory: '<rect x="-11" y="-2" width="22" height="12" rx="1" fill="#94a3b8"/><path d="M-11 -2 l7 -6 v6 l7 -6 v6 Z" fill="#64748b"/><rect x="6" y="-14" width="4" height="9" fill="#475569"/><rect x="-7" y="2" width="5" height="5" fill="#334155"/>',
        park: '<circle cy="-4" r="8" fill="#22c55e"/><circle cx="7" cy="2" r="4" fill="#4ade80"/><rect x="-1.5" y="3" width="3" height="8" fill="#92400e"/>',
        landmark: '<path d="M0 -13 L4 -4 L4 10 H-4 L-4 -4 Z" fill="#f59e0b"/><circle cy="-13" r="2.5" fill="#fbbf24"/><rect x="-8" y="10" width="16" height="3" rx="1" fill="#d97706"/>',
    };
    const PAL_ICONS = {
        road: '<rect x="3" y="3" width="18" height="18" rx="3" fill="#475569"/><path d="M6 12 h12" stroke="#e5e7eb" stroke-width="2" stroke-dasharray="3 3"/>',
        house: '<path d="M4 11 L12 4 L20 11 Z" fill="#2563eb"/><rect x="6" y="11" width="12" height="8" fill="#93c5fd"/>',
        apartment: '<rect x="7" y="3" width="10" height="17" rx="1" fill="#6366f1"/><g fill="#c7d2fe"><rect x="9" y="5" width="2.5" height="2.5"/><rect x="12.5" y="5" width="2.5" height="2.5"/><rect x="9" y="9" width="2.5" height="2.5"/><rect x="12.5" y="9" width="2.5" height="2.5"/></g>',
        shop: '<rect x="5" y="10" width="14" height="9" fill="#34d399"/><path d="M4 10 h16 v-4 h-16 Z" fill="#f59e0b"/>',
        office: '<rect x="8" y="3" width="8" height="17" rx="1" fill="#8b5cf6"/><path d="M8 8 h8 M8 13 h8" stroke="#ddd6fe" stroke-width="1.5"/>',
        factory: '<rect x="4" y="11" width="16" height="8" fill="#94a3b8"/><path d="M4 11 l5 -4 v4 l5 -4 v4 Z" fill="#64748b"/><rect x="15" y="4" width="3" height="7" fill="#475569"/>',
        park: '<circle cx="12" cy="9" r="6" fill="#22c55e"/><rect x="11" y="14" width="2" height="6" fill="#92400e"/>',
        landmark: '<path d="M12 3 L15 9 L15 19 H9 L9 9 Z" fill="#f59e0b"/><circle cx="12" cy="3" r="2" fill="#fbbf24"/>',
    };

    root.innerHTML = `
<style>
.mcb{--bg:#f6f7f8;--card:#ffffff;--ink:#1f2430;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;
  --ok:#16a34a;--warn:#d97706;--bad:#dc2626;--mcb-r:#16a34a;--mcb-c:#2563eb;--mcb-i:#d97706;--mcb-o:#7c3aed;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);
  background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:12px;gap:10px}
.mcb [hidden]{display:none!important}
.mcb *{box-sizing:border-box}
/* HUD bar: all status info + icon controls above the board */
.mcb .mcb-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 11px/1 system-ui,sans-serif}
.mcb-chip{display:inline-flex;align-items:center;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 8px;
  font-size:11px;font-weight:600;color:var(--muted);white-space:nowrap}
.mcb-chip b{color:var(--ink);font-size:12px;font-variant-numeric:tabular-nums}
.mcb-chip i{font-style:normal;font-size:10px;font-weight:700}
.mcb-chip i.pos{color:var(--ok)} .mcb-chip i.neg{color:var(--bad)}
.mcb-chip.mcb-strikes{background:#fef2f2;color:var(--bad)} .mcb-chip.mcb-strikes b{color:var(--bad)}
.mcb-chip.mcb-rival i{color:var(--muted);font-weight:600}
.mcb-chip .game-status-dot{width:8px;height:8px;border-radius:50%;background:#9ca3af;flex:none}
.game-status-dot.on{background:var(--ok)}
.game-status-dot.wait{background:var(--warn);animation:mcbPulse 1.1s ease-in-out infinite}
@keyframes mcbPulse{50%{opacity:.35}}
.mcb-spacer{flex:1 1 auto}
.mcb .mcb-btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;
  padding:8px 12px;min-height:44px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.mcb .mcb-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.mcb .mcb-btn:disabled{opacity:.45;cursor:default}
.mcb .mcb-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.mcb .mcb-btn.primary:hover:not(:disabled){color:#fff;opacity:.9}
.mcb .mcb-btn.toggled{border-color:var(--bad);color:var(--bad);background:#fef2f2}
.mcb-icon-btn{display:inline-flex;align-items:center;gap:5px}
.mcb-icon-btn svg{flex:none;display:block}
/* Board: arena + content, overlays are direct children */
.mcb-board{position:relative;display:flex;flex-direction:column;padding:0;border:0;background:transparent;border-radius:12px;overflow:hidden}
.mcb-main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start;flex:1 1 auto;min-height:0}
.mcb-card{display:flex;flex-direction:column;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;min-width:0}
.mcb-playcol{min-height:0;align-items:center}
.mcb-cardhead{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13px;font-weight:700}
.mcb-sub{font-weight:500;color:var(--muted);font-size:11px;margin-left:auto}
.mcb-svg{width:100%;max-width:min(560px,72vh);height:auto;aspect-ratio:1;display:block;border-radius:8px;touch-action:manipulation}
.mcb-opp-svg{width:100%;max-width:180px;height:auto;aspect-ratio:1;display:block;border-radius:8px;margin:0 auto}
.mcb-cell{transition:fill .12s ease}
.mcb-cell.ok{fill:#f0fdf4;stroke:#bbf7d0}
.mcb-cell.ok:hover{fill:#bbf7d0;cursor:pointer}
.mcb-cell.no:hover{fill:#fee2e2;cursor:not-allowed}
.mcb-cell.demo:hover{fill:#fecaca;cursor:pointer}
.mcb-note{width:100%;min-height:18px;font-size:12px;color:var(--muted);line-height:1.4}
.mcb-side{display:flex;flex-direction:column;gap:12px;min-height:0}
.mcb-demands{display:grid;gap:8px}
.mcb-drow{display:grid;grid-template-columns:20px 1fr 30px;gap:8px;align-items:center;font-size:12px}
.mcb-dletter{width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:800;color:#fff}
.mcb-dtrack{height:6px;border-radius:99px;background:var(--line);overflow:hidden}
.mcb-dfill{height:100%;border-radius:99px;transition:width .2s ease}
.mcb-dval{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;font-size:11.5px}
.mcb-pal{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mcb-palbtn{display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:8px;text-align:left;
  border:1px solid var(--line);background:var(--card);border-radius:8px;padding:8px 10px;font:inherit;
  min-height:44px;font-size:12px;font-weight:600;color:var(--ink);cursor:pointer}
.mcb-palbtn svg{width:22px;height:22px;display:block}
.mcb-palbtn .cost{color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.mcb-palbtn.on{border-color:var(--accent);background:#eff6ff}
.mcb-palbtn:disabled{opacity:.45;cursor:default}
.mcb-palbtn kbd{font:600 9.5px/1 system-ui;border:1px solid var(--line);border-radius:4px;padding:2px 4px;
  color:var(--muted);background:var(--bg);margin-left:4px}
.mcb-controls{display:flex;flex-wrap:wrap;gap:8px}
.mcb-controls .mcb-btn{flex:1}
/* Touch pad is a SIBLING after the board, never inside it */
.mcb-pad{display:none;align-items:center;justify-content:center;gap:12px;margin-top:2px}
.mcb.pad-on .mcb-pad{display:flex}
.mcb-dpad{display:grid;grid-template-areas:". u ." "l o r" ". d .";gap:8px}
.mcb-dpad button,.mcb-vc{width:46px;height:46px;border:1px solid var(--line);background:var(--card);border-radius:10px;
  font-size:16px;color:var(--ink);cursor:pointer;touch-action:manipulation}
.mcb-dpad button:active,.mcb-vc:active{background:#eff6ff;border-color:var(--accent)}
.mcb-vc.ok{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:800}
/* Overlays: flex column cards with scrollable body + sticky footer */
.mcb-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;
  background:rgba(246,247,248,.88);backdrop-filter:blur(3px);border-radius:12px;padding:12px}
.mcb-ovcard{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;
  max-width:480px;width:100%;max-height:100%;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.mcb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:8px}
.mcb-head h3{margin:0;font-size:16px;letter-spacing:-.01em}
.mcb-head h3.win{color:var(--ok)} .mcb-head h3.lose{color:var(--bad)}
.mcb-scroll{flex:1 1 auto;min-height:0;overflow:auto}
.mcb-scroll p,.mcb-scroll li{font-size:12.5px;line-height:1.55;color:var(--muted);margin:8px 0}
.mcb-scroll ul{margin:8px 0;padding-left:18px}
.mcb-scroll b{color:var(--ink)}
.mcb-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:none;margin-top:12px}
.mcb-cheatlist{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mcb-cheatlist .mcb-btn{flex:none}
.mcb button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:860px){.mcb-main{grid-template-columns:1fr}.mcb-pal{grid-template-columns:repeat(4,1fr)}
  .mcb-palbtn{grid-template-columns:1fr;justify-items:center;text-align:center;gap:4px;padding:8px 4px}.mcb-palbtn kbd{display:none}}
@media (max-width:480px){.mcb-pal{grid-template-columns:1fr 1fr}}
@media (prefers-reduced-motion:reduce){.mcb *{transition:none!important;animation:none!important}}
@media (pointer:coarse){.mcb button:not(:disabled){min-height:44px}}

/* --- fill height + mobile refinements (LAST: beats pointer:coarse 44px) --- */
.mcb .mcb-hud .mcb-btn{min-height:32px;padding:5px 9px;font-size:9px}
@media (max-width:640px){
 .mcb.game-fill > .mcb-board{flex:0 0 auto;aspect-ratio:auto;min-height:0}
 .mcb.game-fill > .mcb-board:has(.mcb-ov:not([hidden])){min-height:min(70dvh,620px)}
 .mcb-main{grid-template-columns:1fr}
 .mcb-side{flex-direction:row;flex-wrap:wrap}
 .mcb-side .mcb-card{flex:1 1 240px}
 .mcb .mcb-hud{gap:5px}
 .mcb .mcb-hud .mcb-chip{padding:4px 6px;font-size:9px}
 .mcb .mcb-hud .mcb-chip.mcb-rival i{display:none}
 .mcb .mcb-hud .mcb-btn-label,.mcb .mcb-hud .mcb-spacer{display:none}
 .mcb .mcb-ov{padding:8px}
 .mcb .mcb-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
 .mcb .mcb-scroll{scrollbar-width:none}
 .mcb .mcb-scroll::-webkit-scrollbar{display:none}
 .mcb .mcb-foot{justify-content:center}
}
</style>
<div class="game-app mcb game-fill${padOn ? " pad-on" : ""}" data-mcb>
  <div class="mcb-hud">
    <span class="mcb-chip"><i class="game-status-dot" data-dot></i><b data-status>Ready</b></span>
    <span class="mcb-chip">CASH <b data-hud="money">0</b><i data-hud="net"></i></span>
    <span class="mcb-chip">POP <b data-hud="pop">0</b>/${TARGET}</span>
    <span class="mcb-chip">HAPPY <b data-hud="happy">0</b>%</span>
    <span class="mcb-chip">ROUND <b data-hud="round">1</b>/${ROUNDS}</span>
    <span class="mcb-chip mcb-strikes" data-hud="strikes" hidden>S <b data-hud="strikesv">0</b>/${STRIKES}</span>
    <span class="mcb-chip mcb-rival">RIVAL <b data-opp="pop">0</b><i data-opp="money">0</i><i data-opp="happy">0</i>% <i>S<b data-opp="strikes">0</b></i></span>
    <span class="mcb-spacer"></span>
    <button class="mcb-btn mcb-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="mcb-btn-label">Help</span></button>
    <button class="mcb-btn mcb-icon-btn" type="button" data-cheats data-cheatsbtn aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="mcb-btn-label">Cheats</span></button>
    <button class="mcb-btn mcb-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="mcb-btn-label">Pause</span></button>
    <button class="mcb-btn mcb-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="mcb-btn-label">Restart</span></button>
    <button class="mcb-btn mcb-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="mcb-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel mcb-board" data-board>
    <div class="mcb-main">
      <div class="mcb-card mcb-playcol">
        <div class="mcb-cardhead"><span data-me-title>Your city</span><span class="mcb-sub">build beside roads</span></div>
        <svg class="mcb-svg" viewBox="0 0 396 396" data-grid role="img" aria-label="Your city grid"></svg>
        <div class="mcb-note" data-note aria-live="polite"></div>
      </div>
      <div class="mcb-side">
        <div class="mcb-card">
          <div class="mcb-cardhead"><span data-opp-title>Opponent</span></div>
          <svg class="mcb-opp-svg" viewBox="0 0 396 396" data-oppboard role="img" aria-label="Opponent city grid"></svg>
        </div>
        <div class="mcb-card">
          <div class="mcb-cardhead"><span>Demand</span><span class="mcb-sub">build what's high</span></div>
          <div class="mcb-demands" data-demands></div>
        </div>
        <div class="mcb-card">
          <div class="mcb-pal" data-pal></div>
          <div class="mcb-controls">
            <button type="button" class="mcb-btn primary" data-act="pass">Pass</button>
            <button type="button" class="mcb-btn" data-act="demolish" aria-pressed="false">Demolish</button>
            <button type="button" class="mcb-btn" data-act="pad" aria-pressed="${padOn}">Pad</button>
          </div>
        </div>
      </div>
    </div>

    <div class="mcb-ov" data-ov="help" hidden>
      <div class="mcb-ovcard">
        <div class="mcb-head"><h3>How to play</h3><button class="mcb-btn" type="button" data-help-close>Close</button></div>
        <div class="mcb-scroll">
          <ul>
            <li><b>Goal:</b> first mayor to <b>${TARGET} citizens</b> wins. After ${ROUNDS} rounds the bigger city wins; ${STRIKES} bankruptcies and you're out.</li>
            <li><b>One action per turn</b> — build, demolish (half refund) or pass. After both mayors act, taxes collect and both cities grow.</li>
            <li><b>Everything must touch a road.</b> Roads extend from existing roads; water is blocked.</li>
            <li><b>Follow the demand bars:</b> R housing, C shops, I factories, O offices. High demand = faster growth and better income.</li>
            <li><b>Happiness fills housing.</b> Parks and landmarks raise it, factories drag it down. Jobs attract residents.</li>
            <li><b>Desktop:</b> click = build · right-click = demolish · wheel = cycle · 1–8 pick building · arrows or W/A/S move · Enter build · X demolish · D demolish mode · Space pass · Q/E cycle · H help · C cheats · P pause · R restart.</li>
            <li><b>Mobile:</b> tap the grid or use the on-screen pad (⟳ cycle, ▲◀▶▼ move, ✓ build, ⌫ demolish). Enable the pad with the Pad button.</li>
          </ul>
        </div>
        <div class="mcb-foot"><span class="mcb-sub">Press H to reopen this guide</span><button class="mcb-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>

    <div class="mcb-ov" data-ov="cheats" hidden>
      <div class="mcb-ovcard">
        <div class="mcb-head"><h3>Cheats</h3><button class="mcb-btn" type="button" data-close-cheats>Close</button></div>
        <div class="mcb-scroll">
          <p>Offline only — using any cheat marks this match. Cheats don't spend your turn.</p>
          <div class="mcb-cheatlist">
            <button type="button" class="mcb-btn" data-cheat="money">+500 cash</button>
            <button type="button" class="mcb-btn" data-cheat="fill">Fill all housing</button>
            <button type="button" class="mcb-btn" data-cheat="happy" data-cheatlabel="happy">Max happiness: off</button>
            <button type="button" class="mcb-btn" data-cheat="free" data-cheatlabel="free">Free builds: off</button>
            <button type="button" class="mcb-btn" data-cheat="upkeep" data-cheatlabel="upkeep">No upkeep: off</button>
            <button type="button" class="mcb-btn" data-cheat="win">Win now</button>
          </div>
        </div>
      </div>
    </div>

    <div class="mcb-ov" data-ov="pause" hidden>
      <div class="mcb-ovcard">
        <div class="mcb-head"><h3>Paused</h3></div>
        <div class="mcb-scroll"><p>The bot and the turn clock are frozen. Resume when you're ready.</p></div>
        <div class="mcb-foot"><button class="mcb-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="mcb-ov" data-ov="over" hidden>
      <div class="mcb-ovcard">
        <div class="mcb-head"><h3 data-over-title>City report</h3></div>
        <div class="mcb-scroll">
          <p data-over-reason></p>
          <p data-over-stats></p>
        </div>
        <div class="mcb-foot">
          <button type="button" class="mcb-btn primary" data-restart data-rematchbtn>New match</button>
          <button type="button" class="mcb-btn" data-exit>Exit game</button>
        </div>
      </div>
    </div>

    <div class="mcb-ov" data-ov="waiting" hidden>
      <div class="mcb-ovcard">
        <div class="mcb-head"><h3>Waiting for host…</h3></div>
        <div class="mcb-scroll"><p>The match will appear here once the host starts it.</p></div>
      </div>
    </div>
  </section>
  <div class="mcb-pad" aria-label="Touch controls">
    <button type="button" class="mcb-vc" data-vc="cycle" aria-label="Cycle building">⟳</button>
    <div class="mcb-dpad">
      <button type="button" data-vc="up" style="grid-area:u" aria-label="Move up">▲</button>
      <button type="button" data-vc="left" style="grid-area:l" aria-label="Move left">◀</button>
      <button type="button" class="mcb-vc ok" data-vc="ok" style="grid-area:o" aria-label="Build here">✓</button>
      <button type="button" data-vc="right" style="grid-area:r" aria-label="Move right">▶</button>
      <button type="button" data-vc="down" style="grid-area:d" aria-label="Move down">▼</button>
    </div>
    <button type="button" class="mcb-vc" data-vc="del" aria-label="Demolish here">⌫</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const appEl = $("[data-mcb]");
    const boardEl = $("[data-grid]"), oppBoardEl = $("[data-oppboard]");
    const palEl = $("[data-pal]"), demEl = $("[data-demands]"), noteEl = $("[data-note]");
    const statusEl = $("[data-status]"), dotEl = $("[data-dot]");
    const ovHelp = $('[data-ov="help"]'), ovCheats = $('[data-ov="cheats"]'),
        ovPause = $('[data-ov="pause"]'), ovOver = $('[data-ov="over"]'), ovWaiting = $('[data-ov="waiting"]');

    /* palette + demand rows built once */
    palEl.innerHTML = TYPES.map((t, i) =>
        `<button type="button" class="mcb-palbtn" data-pick="${t}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${PAL_ICONS[t]}</svg>
      <span>${B[t].label}<kbd>${i + 1}</kbd></span><span class="cost">${B[t].cost}</span>
    </button>`).join("");
    demEl.innerHTML = ZONES.map(([k, label, color]) =>
        `<div class="mcb-drow" title="${label} demand">
      <span class="mcb-dletter" style="background:${color}">${k}</span>
      <span class="mcb-dtrack"><span class="mcb-dfill" data-dfill="${k}" style="background:${color};width:0%"></span></span>
      <span class="mcb-dval" data-dval="${k}">0</span>
    </div>`).join("");

    /* ---------------- board rendering ---------------- */
    const CELL = 42, MARGIN = 9;
    const px = (x) => MARGIN + x * CELL, py = (y) => MARGIN + y * CELL;

    function roadMarks(g, x, y) {
        const cx = px(x) + CELL / 2, cy = py(y) + CELL / 2;
        const h = (inGrid(x - 1, y) && g[y][x - 1] === "road") || (inGrid(x + 1, y) && g[y][x + 1] === "road");
        const v = (inGrid(x, y - 1) && g[y - 1][x] === "road") || (inGrid(x, y + 1) && g[y + 1][x] === "road");
        let s = "";
        if (h || !v) s += `<path d="M${px(x) + 5} ${cy} H${px(x) + CELL - 5}" stroke="#e5e7eb" stroke-width="2" stroke-dasharray="6 5" opacity=".65"/>`;
        if (v) s += `<path d="M${cx} ${py(y) + 5} V${py(y) + CELL - 5}" stroke="#e5e7eb" stroke-width="2" stroke-dasharray="6 5" opacity=".65"/>`;
        return s;
    }

    function boardSVG(city, interactive, myTurn) {
        let cells = "", builds = "";
        for (let y = 0; y < GRID; y++)
            for (let x = 0; x < GRID; x++) {
                const t = city.grid[y][x];
                const X = px(x) + 1.5, Y = py(y) + 1.5, S = CELL - 3;
                if (t === "road") {
                    cells += `<rect ${interactive ? `data-cell="${x},${y}"` : ""} x="${X}" y="${Y}" width="${S}" height="${S}" rx="6" fill="#475569"/>` + roadMarks(city.grid, x, y);
                    continue;
                }
                if (t === "water") {
                    cells += `<rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="6" fill="#dbeafe"/>
            <path d="M${px(x) + 10} ${py(y) + 22} q4 -3 8 0 q4 3 8 0 q4 -3 8 0" stroke="#93c5fd" stroke-width="1.5" fill="none"/>`;
                    continue;
                }
                let cls = "mcb-cell", fill = "#fafafa", stroke = "#e5e7eb";
                if (interactive && state && state.phase === "playing" && myTurn) {
                    if (t === null) cls += canPlace(city, selType, x, y).ok && !demolishMode ? " ok" : " no";
                    else if (demolishMode) cls += " demo";
                }
                cells += `<rect class="${cls}" ${interactive ? `data-cell="${x},${y}"` : ""} x="${X}" y="${Y}" width="${S}" height="${S}" rx="6" fill="${fill}" stroke="${stroke}"/>`;
                if (t) builds += `<g transform="translate(${px(x) + CELL / 2},${py(y) + CELL / 2}) scale(.92)">${ICONS[t]}</g>`;
            }
        let cursorMark = "";
        if (interactive && state && state.phase === "playing") {
            cursorMark = `<rect x="${px(cursor.x) + 1}" y="${py(cursor.y) + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="8"
        fill="none" stroke="${myTurn ? "#2563eb" : "#9ca3af"}" stroke-width="2" stroke-dasharray="5 4"/>`;
        }
        return `<rect x="0" y="0" width="396" height="396" rx="10" fill="#ffffff"/>${cells}<g pointer-events="none">${builds}</g><g pointer-events="none">${cursorMark}</g>`;
    }

    /* ---------------- render ---------------- */
    function note(msg) { noteEl.textContent = msg; }

    function contextualNote() {
        const key = state.seed + ":" + state.moves + ":" + state.phase;
        if (key === noteKey) return;
        noteKey = key;
        const me = mySeat();
        if (state.phase === "over") { note(""); return; }
        if (state.moves === 0) {
            note(`Coin toss: ${state.names[state.first]} goes first · you are ${state.names[me]} (Mayor ${me + 1}).`);
            return;
        }
        if (state.last && state.last.seat !== me) {
            const n = state.names[state.last.seat];
            note(state.last.act === "build" ? `${n} built a ${B[state.last.b].label}.`
                : state.last.act === "demolish" ? `${n} demolished a building.` : `${n} passed.`);
            return;
        }
        if (state.turn === me) {
            const city = state.cities[me];
            note(city.money < B.park.cost ? "Low on cash — pass to collect taxes." : "Your turn — build beside a road.");
        }
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            ovWaiting.hidden = !online || helpOpen || cheatOpen || paused;
            statusEl.textContent = "Connecting…";
            dotEl.className = "game-status-dot wait";
            return;
        }
        ovWaiting.hidden = true;
        const me = mySeat(), opp = 1 - me;
        const my = state.cities[me], other = state.cities[opp];
        const myTurn = state.phase === "playing" && state.turn === me;
        const e = econ(my);

        /* status */
        if (paused) { statusEl.textContent = "Paused"; dotEl.className = "game-status-dot wait"; }
        else if (state.phase === "over") {
            const w = state.result.winner;
            statusEl.textContent = w === -1 ? "Draw" : w === me ? "You win" : "You lose";
            dotEl.className = "game-status-dot";
        } else if (myTurn) { statusEl.textContent = "Your turn"; dotEl.className = "game-status-dot on"; }
        else {
            statusEl.textContent = online ? `Waiting for ${state.names[opp]}…` : "Bot is thinking…";
            dotEl.className = "game-status-dot wait";
        }

        /* HUD */
        $('[data-me-title]').textContent = `Your city · ${state.names[me]}`;
        $('[data-opp-title]').textContent = `${state.names[opp]} · Mayor ${opp + 1}`;
        $('[data-hud="money"]').textContent = Math.floor(my.money);
        const netEl = $('[data-hud="net"]'), net = e.income - e.upkeep;
        netEl.textContent = (net >= 0 ? "+" : "−") + Math.abs(net);
        netEl.className = net >= 0 ? "pos" : "neg";
        $('[data-hud="pop"]').textContent = Math.round(my.pop);
        $('[data-hud="happy"]').textContent = Math.round(my.happy);
        $('[data-hud="round"]').textContent = Math.min(state.round + 1, ROUNDS);
        $('[data-hud="strikes"]').hidden = my.strikes === 0;
        $('[data-hud="strikesv"]').textContent = my.strikes;
        $('[data-opp="pop"]').textContent = Math.round(other.pop);
        $('[data-opp="money"]').textContent = Math.floor(other.money);
        $('[data-opp="happy"]').textContent = Math.round(other.happy);
        $('[data-opp="strikes"]').textContent = other.strikes;

        /* demand bars */
        for (const [k] of ZONES) {
            $(`[data-dfill="${k}"]`).style.width = e.d[k] + "%";
            $(`[data-dval="${k}"]`).textContent = e.d[k];
        }

        /* palette + controls */
        palEl.querySelectorAll("[data-pick]").forEach((btn) => {
            const t = btn.dataset.pick;
            btn.classList.toggle("on", t === selType && !demolishMode);
            btn.disabled = state.phase !== "playing" || (!my.cheatFree && my.money < B[t].cost);
        });
        const passBtn = $('[data-act="pass"]');
        passBtn.disabled = !myTurn;
        const demoBtn = $('[data-act="demolish"]');
        demoBtn.classList.toggle("toggled", demolishMode);
        demoBtn.setAttribute("aria-pressed", String(demolishMode));
        demoBtn.textContent = demolishMode ? "Demolish: on" : "Demolish";
        $('[data-cheatsbtn]').hidden = online;
        $('[data-rematchbtn]').hidden = online && !isHost;
        $('[data-act="pad"]').setAttribute("aria-pressed", String(padOn));
        /* icon HUD buttons — update label spans, never button.textContent */
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", state.cheated);
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const plabel = pbtn.querySelector(".mcb-btn-label");
            if (plabel) plabel.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pbtn.disabled = online;
        }
        const rbtn = root.querySelector("[data-restart]");
        if (rbtn) rbtn.disabled = online && !isHost;

        /* cheat toggle labels */
        const flags = { happy: my.cheatHappy, free: my.cheatFree, upkeep: my.cheatUpkeep };
        const labels = { happy: "Max happiness", free: "Free builds", upkeep: "No upkeep" };
        root.querySelectorAll("[data-cheatlabel]").forEach((btn) => {
            const k = btn.dataset.cheatlabel;
            btn.textContent = `${labels[k]}: ${flags[k] ? "on" : "off"}`;
            btn.classList.toggle("toggled", flags[k]);
        });

        /* boards */
        boardEl.innerHTML = boardSVG(my, true, myTurn);
        oppBoardEl.innerHTML = boardSVG(other, false, false);

        /* overlays — help > cheats > pause > result, mutually suppressing */
        ovHelp.hidden = !helpOpen;
        ovCheats.hidden = !cheatOpen || online || helpOpen;
        ovPause.hidden = !paused || helpOpen || cheatOpen;
        if (state.phase === "over" && !helpOpen && !cheatOpen && !paused) {
            const r = state.result, w = r.winner;
            const title = $('[data-over-title]');
            title.textContent = w === -1 ? "Photo finish — it's a draw" : w === me ? "Your city thrives!" : `${state.names[w]} wins`;
            title.className = w === me ? "win" : w === -1 ? "" : "lose";
            const why = r.reason === "target" ? `reached ${TARGET} citizens first`
                : r.reason === "bankrupt" ? "won after the rival treasury collapsed three times"
                    : `had more citizens at the final census (round ${ROUNDS})`;
            $('[data-over-reason]').textContent = w === -1
                ? `Both cities ended perfectly even after ${state.round} rounds.`
                : `${state.names[w]} ${why}.${state.cheated ? " (cheats were used)" : ""}`;
            $('[data-over-stats]').textContent =
                `${state.names[0]}: ${Math.round(state.cities[0].pop)} citizens · ${Math.floor(state.cities[0].money)} cash — ` +
                `${state.names[1]}: ${Math.round(state.cities[1].pop)} citizens · ${Math.floor(state.cities[1].money)} cash.`;
            ovOver.hidden = false;
        } else ovOver.hidden = true;

        contextualNote();
    }

    /* ---------------- player intents ---------------- */
    function tryBuild(x, y) {
        if (paused || !state || state.phase !== "playing") return;
        if (state.turn !== mySeat()) { note(online ? "Wait for your turn." : "Bot is thinking…"); return; }
        const chk = canPlace(state.cities[mySeat()], selType, x, y);
        if (!chk.ok) {
            note(chk.reason === "money" ? `Not enough cash for a ${B[selType].label}.`
                : chk.reason === "road" ? "Every building must touch a road."
                    : chk.reason === "water" ? "You can't build on water."
                        : "That plot is occupied.");
            return;
        }
        cursor = { x, y };
        submitAction({ t: "build", b: selType, x, y });
    }
    function tryDemolish(x, y) {
        if (paused || !state || state.phase !== "playing") return;
        if (state.turn !== mySeat()) { note(online ? "Wait for your turn." : "Bot is thinking…"); return; }
        const t = state.cities[mySeat()].grid[y]?.[x];
        if (!t || t === "water") { note("Nothing to demolish there."); return; }
        cursor = { x, y };
        submitAction({ t: "demolish", x, y });
    }
    function cycleType(dir) {
        const i = TYPES.indexOf(selType);
        selType = TYPES[(i + dir + TYPES.length) % TYPES.length];
        demolishMode = false;
        render();
        note(`${B[selType].label} — cost ${B[selType].cost}.`);
    }
    function moveCursor(dx, dy) {
        cursor = { x: clamp(cursor.x + dx, 0, GRID - 1), y: clamp(cursor.y + dy, 0, GRID - 1) };
        render();
    }

    /* ---------------- overlay / HUD controls ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function togglePause() {
        if (online) return;
        paused = !paused;
        /* Freeze the bot timer while paused; rescheduling on resume shifts its anchor. */
        if (paused) { if (botTimer) { clearTimeout(botTimer); botTimer = null; } }
        else scheduleBot();
        render();
    }
    function restartMatch() {
        if (online && !isHost) return;
        submitAction({ t: "rematch" });
    }

    /* ---------------- events ---------------- */
    function handleClick(event) {
        const el = event.target;
        if (!(el instanceof Element)) return;
        if (el.closest("[data-exit]")) { onExit(); return; }
        if (el.closest("[data-help]")) { toggleHelp(); return; }
        if (el.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (el.closest("[data-cheats]")) { if (!online) { cheatOpen = !cheatOpen; helpOpen = false; render(); } return; }
        if (el.closest("[data-close-cheats]")) { cheatOpen = false; render(); return; }
        if (el.closest("[data-pause]")) { togglePause(); return; }
        if (el.closest("[data-resume]")) { if (paused) togglePause(); return; }
        if (el.closest("[data-restart]")) { restartMatch(); return; }

        const act = el.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "pass") { if (state && state.phase === "playing" && state.turn === mySeat()) submitAction({ t: "pass" }); }
            else if (a === "demolish") { demolishMode = !demolishMode; render(); note(demolishMode ? "Tap a building to demolish it (half refund)." : "Demolish mode off."); }
            else if (a === "pad") { padOn = !padOn; appEl.classList.toggle("pad-on", padOn); render(); }
            return;
        }
        const pick = el.closest("[data-pick]");
        if (pick) {
            selType = pick.dataset.pick;
            demolishMode = false;
            render();
            note(`${B[selType].label} — cost ${B[selType].cost}${B[selType].cap ? `, houses ${B[selType].cap}` : ""}${B[selType].income ? `, earns up to ${B[selType].income}/round` : ""}.`);
            return;
        }
        const cheat = el.closest("[data-cheat]");
        if (cheat) { submitAction({ t: "cheat", k: cheat.dataset.cheat }); return; }

        const vc = el.closest("[data-vc]");
        if (vc) {
            const v = vc.dataset.vc;
            if (v === "up") moveCursor(0, -1);
            else if (v === "down") moveCursor(0, 1);
            else if (v === "left") moveCursor(-1, 0);
            else if (v === "right") moveCursor(1, 0);
            else if (v === "ok") tryBuild(cursor.x, cursor.y);
            else if (v === "del") tryDemolish(cursor.x, cursor.y);
            else if (v === "cycle") cycleType(1);
            return;
        }
        const cell = el.closest("[data-cell]");
        if (cell && boardEl.contains(cell)) {
            const [x, y] = cell.dataset.cell.split(",").map(Number);
            if (demolishMode) tryDemolish(x, y);
            else tryBuild(x, y);
        }
    }

    function handleContext(event) {
        const cell = event.target instanceof Element ? event.target.closest("[data-cell]") : null;
        if (!cell || !boardEl.contains(cell)) return;
        event.preventDefault();
        const [x, y] = cell.dataset.cell.split(",").map(Number);
        tryDemolish(x, y);
    }

    function handleWheel(event) {
        if (!state || state.phase !== "playing" || helpOpen || cheatOpen || paused) return;
        event.preventDefault();
        cycleType(event.deltaY > 0 ? 1 : -1);
    }

    function handleKey(event) {
        if (destroyed || event.metaKey || event.ctrlKey || event.altKey) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = event.key, code = event.code;

        /* Keyboard priority: help → cheats → pause/Escape → game actions */
        if (code === "KeyH") { toggleHelp(); event.preventDefault(); return; }
        if (code === "KeyC") {
            if (!helpOpen && !online) { cheatOpen = !cheatOpen; render(); }
            event.preventDefault(); return;
        }
        if (code === "KeyP" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) { cheatOpen = false; render(); }
            else togglePause();
            event.preventDefault(); return;
        }
        if (helpOpen || cheatOpen || paused) return;
        if (!state) return;

        if (code === "KeyR") { restartMatch(); event.preventDefault(); return; }
        if (k === "Enter") {
            event.preventDefault();
            if (state.phase === "over") restartMatch();
            else tryBuild(cursor.x, cursor.y);
            return;
        }
        if (k === " ") {
            event.preventDefault();
            if (state.phase === "playing" && state.turn === mySeat()) submitAction({ t: "pass" });
            return;
        }
        const moves = {
            ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            w: [0, -1], W: [0, -1], s: [0, 1], S: [0, 1], a: [-1, 0], A: [-1, 0]
        };
        if (k in moves) { event.preventDefault(); moveCursor(...moves[k]); return; }
        if (k >= "1" && k <= "8") { selType = TYPES[Number(k) - 1]; demolishMode = false; render(); note(`${B[selType].label} — cost ${B[selType].cost}.`); return; }
        if (k === "x" || k === "X" || k === "Delete" || k === "Backspace") { event.preventDefault(); tryDemolish(cursor.x, cursor.y); return; }
        if (k === "d" || k === "D") { demolishMode = !demolishMode; render(); return; }
        if (k === "v" || k === "V") { padOn = !padOn; appEl.classList.toggle("pad-on", padOn); render(); return; }
        if (k === "q" || k === "Q") { cycleType(-1); return; }
        if (k === "e" || k === "E") { cycleType(1); return; }
    }

    root.addEventListener("click", handleClick);
    boardEl.addEventListener("contextmenu", handleContext);
    boardEl.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKey);

    /* ---------------- boot / networking ---------------- */
    const sub = (fn) => { const u = fn(); if (typeof u === "function") unsubs.push(u); };

    if (online) {
        if (isHost) {
            newMatch();
            publish();
            sub(() => room.onAction((action) => applyAction(action, 1 - state.hostSeat)));
        } else {
            render(); // waiting overlay until the first state arrives
            sub(() => room.onState((next) => {
                if (destroyed || !next) return;
                const fresh = !state || state.seed !== next.seed;
                state = next;
                if (fresh) { cursor = { x: 4, y: 4 }; selType = "house"; demolishMode = false; noteKey = ""; helpOpen = cheatOpen = paused = false; if (botTimer) { clearTimeout(botTimer); botTimer = null; } }
                render();
            }));
        }
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
    } else {
        newMatch();
        publish();
    }

    return {
        destroy() {
            destroyed = true;
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
            root.removeEventListener("click", handleClick);
            boardEl.removeEventListener("contextmenu", handleContext);
            boardEl.removeEventListener("wheel", handleWheel);
            window.removeEventListener("keydown", handleKey);
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
            root.innerHTML = "";
        },
    };
}