/* =============================================================== */
/* CLASH VILLAGE — minimalist CoC-inspired base builder & raider    */
/* Template: export META + mount(root, context).                    */
/* =============================================================== */

export const META = {
    id: "clash-village",
    name: "Clash Village",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Build a village, train troops and a hero, then raid. A coin toss decides who strikes first.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 42V26l7-6 7 6v16"/><path d="M20 42V18l10-9 10 9v24"/><path d="M4 42h40"/><path d="M40 6L22 24"/><path d="M17 19l9 9"/><path d="M21 25l-7 7"/></svg>',
    bg: ["#f59e0b", "#78350f"],
    bestKey: "clashVillageBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || room.isHost;
    let roomData = room?.room || null;

    /* ---------------- constants & catalogs ---------------- */
    const GRID = 8, CELL = 40, MARGIN = 20, TIME = 60, CAP = 3000, NS = "http://www.w3.org/2000/svg";
    const BLD = {
        th: { label: "Town Hall", cost: 400, cur: "gold", hp: 380, w: 3 },
        mine: { label: "Gold Mine", cost: 100, cur: "elixir", hp: 110, w: 1, prod: "gold", rate: 3 },
        pump: { label: "Elixir Pump", cost: 100, cur: "gold", hp: 110, w: 1, prod: "elixir", rate: 3 },
        cannon: { label: "Cannon", cost: 150, cur: "gold", hp: [170, 220, 270], dps: [13, 17, 21], range: 4, def: true, w: 2 },
        tower: { label: "Archer Tower", cost: 200, cur: "gold", hp: [140, 180, 220], dps: [10, 13, 16], range: 5.5, def: true, w: 2 },
        barracks: { label: "Barracks", cost: 150, cur: "elixir", hp: 160, w: 1 },
    };
    const SHOP = ["mine", "pump", "cannon", "tower", "barracks"];
    const TROOPS = {
        barb: { label: "Barbarian", hp: 70, dps: 14, spd: 1.5, cost: 25, range: 0.8, rate: 0.8 },
        arch: { label: "Archer", hp: 45, dps: 12, spd: 1.3, cost: 40, range: 3.2, rate: 0.9 },
        giant: { label: "Giant", hp: 330, dps: 18, spd: 0.9, cost: 120, range: 0.85, rate: 1.0, pref: "def" },
        hero: { label: "Hero", hp: 650, dps: 26, spd: 1.4, cost: 0, range: 0.9, rate: 0.8 },
    };
    const KINDS = ["barb", "arch", "giant"];
    const px = (x) => MARGIN + x * CELL + CELL / 2;
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const tr = (x, y) => `translate(${px(x).toFixed(1)}px,${px(y).toFixed(1)}px)`;
    const ring = (x, y) => x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const maxCount = (t, th) => t === "th" || t === "barracks" ? 1 : t === "cannon" ? th : t === "tower" ? Math.max(0, th - 1) : th + 1;
    const upCost = (t, l) => BLD[t].cost * l;
    const armyTotal = (a) => KINDS.reduce((s, k) => s + (a?.[k] || 0), 0);
    const bldHp = (t, l) => Array.isArray(BLD[t].hp) ? BLD[t].hp[l - 1] : BLD[t].hp;
    const bldDps = (t, l) => BLD[t].def ? BLD[t].dps[l - 1] : 0;

    function eachB(v, fn) { for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) { const b = v.grid[y][x]; if (b) fn(b, x, y); } }
    const countT = (v, t) => { let n = 0; eachB(v, b => { if (b.t === t) n++; }); return n; };
    const thLvl = (v) => { let l = 1; eachB(v, b => { if (b.t === "th") l = b.l; }); return l; };
    const barLvl = (v) => { let l = 0; eachB(v, b => { if (b.t === "barracks") l = b.l; }); return l; };
    const armyCap = (v) => 4 + 4 * barLvl(v);

    function freshVillage() {
        const grid = Array.from({ length: GRID }, () => Array(GRID).fill(null));
        grid[3][3] = { t: "th", l: 1 };
        return { grid, gold: 500, elixir: 500, army: { barb: 0, arch: 0, giant: 0 } };
    }
    function canPlace(v, t, x, y) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID || v.grid[y][x]) return false;
        if (countT(v, t) >= maxCount(t, thLvl(v))) return false;
        return (BLD[t].cur === "gold" ? v.gold : v.elixir) >= BLD[t].cost;
    }
    function produce(v) {
        let g = 0, e = 0;
        eachB(v, b => { if (b.t === "mine") g += b.l * BLD.mine.rate; else if (b.t === "pump") e += b.l * BLD.pump.rate; });
        v.gold = Math.min(CAP, v.gold + g); v.elixir = Math.min(CAP, v.elixir + e);
    }
    function armyStats(army) {
        let hp = TROOPS.hero.hp, dps = TROOPS.hero.dps;
        for (const k of KINDS) { hp += (army[k] || 0) * TROOPS[k].hp; dps += (army[k] || 0) * TROOPS[k].dps; }
        return { hp, dps };
    }

    /* -------- random enemy base, guaranteed beatable -------- */
    function genEnemy(tier, army) {
        const A = armyStats(army);
        const cells = [];
        for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) cells.push({ x, y });
        cells.sort(() => Math.random() - 0.5);
        const list = []; let nid = 1, totalHP = 0, defHP = 0, defDPS = 0;
        const put = (t, x, y, hp, dps, range) => { list.push({ id: nid++, t, l: 1, x, y, hp, maxHp: hp, dps: dps || 0, range: range || 0, w: BLD[t].w, dead: false, cd: Math.random() * 0.6 }); totalHP += hp; };
        const thp = { x: 3 + (Math.random() < .5 ? 0 : 1), y: 3 + (Math.random() < .5 ? 0 : 1) };
        put("th", thp.x, thp.y, 300 + 70 * tier);
        const spot = () => { while (cells.length) { const c = cells.pop(); if (!list.some(b => b.x === c.x && b.y === c.y)) return c; } return null; };
        const eco = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < eco; i++) { const s = spot(); if (s) put(Math.random() < .5 ? "mine" : "pump", s.x, s.y, 90 + 30 * tier); }
        const defs = [
            { t: "cannon", hp: 140 + 35 * tier, dps: 11 + 2.5 * tier, range: 4 },
            { t: "tower", hp: 110 + 30 * tier, dps: 8 + 2 * tier, range: 5.5 },
        ];
        let defCount = 0;
        for (let i = 0; i < 8 && defCount < 6; i++) {
            const d = defs[Math.random() < .6 ? 0 : 1];
            const taken = ((defHP + d.hp) / A.dps) * (defDPS + d.dps);
            if (taken <= 0.7 * A.hp && totalHP + d.hp <= A.dps * TIME * 0.6) {
                const s = spot(); if (!s) break;
                put(d.t, s.x, s.y, d.hp, d.dps, d.range); defHP += d.hp; defDPS += d.dps; defCount++;
            } else if (defCount === 0 && armyTotal(army) >= 3) {
                const s = spot(); if (s) { put("cannon", s.x, s.y, defs[0].hp * .7, defs[0].dps * .7, 4); defCount++; }
            }
        }
        const maxHP = A.dps * TIME * 0.6;
        if (totalHP > maxHP) { const f = Math.max(0.5, maxHP / totalHP); for (const b of list) { b.hp = Math.round(b.hp * f); b.maxHp = b.hp; } }
        return { buildings: list, pool: { gold: 150 + 110 * tier, elixir: 150 + 110 * tier } };
    }

    function genBotArmy(v, tier) {
        let defP = 150;
        eachB(v, b => { defP += BLD[b.t].def ? bldDps(b.t, b.l) * 10 + bldHp(b.t, b.l) * .35 : bldHp(b.t, b.l) * .12; });
        let budget = defP * (0.5 + 0.08 * Math.min(tier, 6) + Math.random() * 0.25);
        const army = { barb: 0, arch: 0, giant: 0 }; let hero = false;
        if (tier >= 3 && budget > 350 && Math.random() < .6) { hero = true; budget -= 320; }
        const price = { barb: 45, arch: 65, giant: 170 };
        let total = 0;
        while (budget > 45 && total < 16) {
            const k = KINDS[Math.floor(Math.random() * 3)];
            if (budget >= price[k]) { army[k]++; budget -= price[k]; total++; }
        }
        army.barb += 2;
        return { army, hero };
    }

    /* ---------------- battle engine ---------------- */
    function battleFromVillage(v) {
        const list = []; let nid = 1;
        eachB(v, (b, x, y) => list.push({ id: nid++, t: b.t, l: b.l, x, y, hp: bldHp(b.t, b.l), maxHp: bldHp(b.t, b.l), dps: bldDps(b.t, b.l), range: BLD[b.t].range || 0, w: BLD[b.t].w, dead: false, cd: Math.random() * .6 }));
        return list;
    }
    function makeBattle(attacker, buildings, army, bot) {
        return {
            attacker, buildings: buildings.map(b => ({ ...b })),
            troops: [], fx: [], nid: 1000, clock: 0, time: TIME,
            army: { barb: army.barb || 0, arch: army.arch || 0, giant: army.giant || 0, hero: army.hero ? 1 : 0 },
            totalW: buildings.reduce((s, b) => s + b.w, 0), deadW: 0, thDown: false,
            rage: 0, rageUsed: false, bot: bot ? { next: 1.0 } : null,
            done: false, pct: 0, stars: 0,
        };
    }
    const addFx = (b, f) => { b.fx.push({ id: b.nid++, born: b.clock, ...f }); if (b.fx.length > 60) b.fx.shift(); };
    function freeRing(b) {
        const out = [];
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++)
            if (ring(x, y) && !b.buildings.some(d => !d.dead && d.x === x && d.y === y)) out.push({ x, y });
        return out.sort(() => Math.random() - .5);
    }
    function deploy(b, k, x, y) {
        if (b.done || !ring(x, y) || (b.army[k] || 0) <= 0) return false;
        if (b.buildings.some(d => !d.dead && d.x === x && d.y === y)) return false;
        const s = TROOPS[k];
        b.troops.push({ id: b.nid++, k, x, y, hp: s.hp, maxHp: s.hp, dps: s.dps, spd: s.spd, range: s.range, rate: s.rate, cd: .3, tgt: 0 });
        b.army[k]--;
        addFx(b, { type: "dep", x, y, ttl: .5 });
        return true;
    }
    function deployAll(b) {
        const cells = freeRing(b); if (!cells.length) return;
        const order = ["hero", "giant", "arch", "barb"]; let i = 0;
        for (const k of order) while ((b.army[k] || 0) > 0 && i < 40) { const c = cells[i % cells.length]; deploy(b, k, c.x, c.y); i++; }
    }
    function killB(b, d) {
        d.hp = 0; d.dead = true; b.deadW += d.w; if (d.t === "th") b.thDown = true;
        addFx(b, { type: "boom", x: d.x, y: d.y, r: 18, ttl: .45 });
    }
    const starsFor = (pct, th) => (pct >= 50 ? 1 : 0) + (th ? 1 : 0) + (pct >= 100 ? 1 : 0);
    const heroOf = (b) => b.troops.find(t => t.k === "hero");
    const rageOn = (b, t) => b.rage > b.clock && (() => { const h = heroOf(b); return h && dist(h.x, h.y, t.x, t.y) <= 2.6; })();

    function tickBattle(b, dt, flags, mySeat) {
        b.clock += dt;
        if (!(flags.freeze && b.attacker === mySeat)) b.time -= dt;
        if (b.bot && b.clock >= b.bot.next) {
            b.bot.next = b.clock + 1.1;
            const cells = freeRing(b);
            if (cells.length) {
                const k = b.army.hero > 0 ? "hero" : KINDS.find(k => b.army[k] > 0);
                if (k) deploy(b, k, cells[0].x, cells[0].y);
            }
            const h = heroOf(b);
            if (h && !b.rageUsed && (h.hp < h.maxHp * .6 || b.clock > 12)) { b.rage = b.clock + 6; b.rageUsed = true; addFx(b, { type: "rage", x: h.x, y: h.y, ttl: .8 }); }
        }
        for (const t of b.troops) {
            let tg = b.buildings.find(d => d.id === t.tgt && !d.dead);
            if (!tg) {
                let pool = b.buildings.filter(d => !d.dead);
                if (t.k === "giant") { const defs = pool.filter(d => BLD[d.t].def); if (defs.length) pool = defs; }
                let bd = Infinity;
                for (const d of pool) { const dd = dist(t.x, t.y, d.x, d.y); if (dd < bd) { bd = dd; tg = d; } }
                t.tgt = tg ? tg.id : 0;
            }
            if (!tg) continue;
            const d = dist(t.x, t.y, tg.x, tg.y), reach = t.range;
            const boost = rageOn(b, t);
            if (d <= reach) {
                t.cd -= dt;
                if (t.cd <= 0) {
                    t.cd = t.rate;
                    const dmg = (flags.onehit && b.attacker === mySeat) ? 99999 : t.dps * t.rate * (boost ? 2 : 1);
                    tg.hp -= dmg;
                    if (t.k === "arch") addFx(b, { type: "shot", kind: "arrow", x0: t.x, y0: t.y, x1: tg.x, y1: tg.y, ttl: Math.max(.12, d * CELL / 380) });
                    else addFx(b, { type: "slash", x: tg.x, y: tg.y, ang: Math.atan2(tg.y - t.y, tg.x - t.x) * 180 / Math.PI, tid: t.id, ttl: .3 });
                    if (tg.hp <= 0) killB(b, tg);
                }
            } else {
                const mv = Math.min(t.spd * (boost ? 1.3 : 1) * dt, d - reach * .9);
                t.x += (tg.x - t.x) / d * mv; t.y += (tg.y - t.y) / d * mv;
            }
        }
        for (const d of b.buildings) {
            if (d.dead || !BLD[d.t].def) continue;
            d.cd -= dt;
            if (d.cd > 0) continue;
            let best = null, bd = d.range;
            for (const t of b.troops) { const dd = dist(d.x, d.y, t.x, t.y); if (dd <= bd) { bd = dd; best = t; } }
            if (best) {
                d.cd = 1.0;
                if (!(flags.god && b.attacker === mySeat)) best.hp -= d.dps;
                addFx(b, { type: "shot", kind: d.t === "cannon" ? "ball" : "bolt", x0: d.x, y0: d.y, x1: best.x, y1: best.y, ttl: Math.max(.15, bd * CELL / (d.t === "cannon" ? 240 : 380)) });
                addFx(b, { type: "ring", x: d.x, y: d.y, r: d.range, ttl: .5 });
                if (d.t === "cannon") addFx(b, { type: "splash", x: best.x, y: best.y, ttl: .4 });
                addFx(b, { type: "lunge", tid: "b" + d.id, ttl: .2 });
            }
        }
        for (let i = b.troops.length - 1; i >= 0; i--) {
            const t = b.troops[i];
            if (t.hp <= 0) { addFx(b, { type: "boom", x: t.x, y: t.y, r: 10, ttl: .4 }); b.troops.splice(i, 1); }
        }
        b.fx = b.fx.filter(f => f.born + f.ttl > b.clock);
        const left = armyTotal(b.army) + b.army.hero;
        if (b.buildings.every(d => d.dead) || b.time <= 0 || (b.troops.length === 0 && left === 0)) finishBattle(b);
    }
    function finishBattle(b) {
        if (b.done) return;
        b.done = true;
        b.pct = b.totalW ? Math.round(100 * b.deadW / b.totalW) : 0;
        b.stars = starsFor(b.pct, b.thDown);
    }

    /* ---------------- state ---------------- */
    let state = null;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }
    function initState() {
        return {
            phase: "build", tier: 1, match: 0, raidNo: 0,
            seatHost: Math.random() < .5 ? 0 : 1, first: 0, coinT: 0,
            villages: [freshVillage(), freshVillage()],
            ready: [false, false], results: [null, null], winner: null,
            battle: null, enemy: null, botArmy: null,
        };
    }
    const mySeat = () => !online ? 0 : (isHost ? (state ? state.seatHost : 0) : (state ? 1 - state.seatHost : 0));
    const flags = { god: false, onehit: false, freeze: false };
    let cheated = false;

    /* ---------------- local UI ---------------- */
    let buildType = null, sel = null, moveFrom = null, selTroop = "barb";
    let cursor = { x: 3, y: 3 }, padOn = false, cheatOpen = false;
    try { padOn = matchMedia("(pointer:coarse)").matches; } catch (_) { }

    /* ---------------- actions (host authoritative) ---------------- */
    function startMatch() {
        state.match++; state.results = [null, null]; state.winner = null; state.raidNo = 0;
        state.first = Math.random() < .5 ? 0 : 1;
        if (!online) {
            const e = genEnemy(state.tier, state.villages[0].army);
            state.enemy = e; state.botArmy = genBotArmy(state.villages[0], state.tier);
        }
        state.phase = "coin"; state.coinT = 2.2;
    }
    function startRaid(no) {
        state.raidNo = no;
        const attacker = no === 1 ? state.first : 1 - state.first;
        const defender = 1 - attacker;
        let buildings, army, bot = false;
        if (!online && defender === 1) buildings = state.enemy.buildings;
        else buildings = battleFromVillage(state.villages[defender]);
        if (!online && attacker === 1) { army = { ...state.botArmy.army, hero: state.botArmy.hero }; bot = true; }
        else army = { ...state.villages[attacker].army, hero: true };
        state.battle = makeBattle(attacker, buildings, army, bot);
        state.phase = "raid";
    }
    function settleRaid() {
        const b = state.battle, atk = b.attacker, def = 1 - atk;
        state.results[atk] = { pct: b.pct, stars: b.stars };
        if (!online) {
            const v = state.villages[0];
            if (atk === 0) {
                const f = b.pct / 100;
                v.gold = Math.min(CAP, v.gold + Math.round(state.enemy.pool.gold * f));
                v.elixir = Math.min(CAP, v.elixir + Math.round(state.enemy.pool.elixir * f));
                v.army = { barb: b.army.barb, arch: b.army.arch, giant: b.army.giant };
            } else {
                v.gold -= Math.floor(v.gold * .25 * b.pct / 100);
                v.elixir -= Math.floor(v.elixir * .25 * b.pct / 100);
            }
        } else {
            const a = state.villages[atk], d = state.villages[def];
            const g = Math.floor(d.gold * .25 * b.pct / 100), e = Math.floor(d.elixir * .25 * b.pct / 100);
            d.gold -= g; d.elixir -= e; a.gold = Math.min(CAP, a.gold + g); a.elixir = Math.min(CAP, a.elixir + e);
            a.army = { barb: b.army.barb, arch: b.army.arch, giant: b.army.giant };
        }
        if (state.raidNo === 1) state.phase = "between";
        else {
            const [r0, r1] = state.results;
            state.winner = r0.pct !== r1.pct ? (r0.pct > r1.pct ? 0 : 1) : r0.stars !== r1.stars ? (r0.stars > r1.stars ? 0 : 1) : 2;
            if (!online && state.winner === 0) {
                const v = state.villages[0], bonus = 100 + 50 * state.tier;
                v.gold = Math.min(CAP, v.gold + bonus); v.elixir = Math.min(CAP, v.elixir + bonus);
                state.tier++;
                if (!cheated && state.tier - 1 > best) { best = state.tier - 1; try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { } }
            }
            state.phase = "final";
        }
    }
    function toBuild() {
        state.battle = null; state.phase = "build"; state.ready = [false, false];
        if (online) for (const v of state.villages) { v.gold = Math.min(CAP, v.gold + 200); v.elixir = Math.min(CAP, v.elixir + 200); }
    }

    function applyAction(a, actor) {
        if (!state || !a || actor == null) return;
        const v = state.villages[actor], b = state.battle;
        const mine = () => b && b.attacker === actor && !b.done;
        switch (a.t) {
            case "build": if (state.phase === "build" && canPlace(v, a.b, a.x, a.y)) { v.grid[a.y][a.x] = { t: a.b, l: 1 }; const s = BLD[a.b]; if (s.cur === "gold") v.gold -= s.cost; else v.elixir -= s.cost; } break;
            case "upgrade": { if (state.phase !== "build") break; const bd = v.grid[a.y]?.[a.x]; if (!bd || bd.l >= 3) break; const c = upCost(bd.t, bd.l), cur = BLD[bd.t].cur; if ((cur === "gold" ? v.gold : v.elixir) >= c) { if (cur === "gold") v.gold -= c; else v.elixir -= c; bd.l++; } break; }
            case "move": if (state.phase === "build" && v.grid[a.y0]?.[a.x0] && !v.grid[a.y1]?.[a.x1] && a.x1 >= 0 && a.y1 >= 0 && a.x1 < GRID && a.y1 < GRID) { v.grid[a.y1][a.x1] = v.grid[a.y0][a.x0]; v.grid[a.y0][a.x0] = null; } break;
            case "train": { if (state.phase !== "build") break; const s = TROOPS[a.k]; if (!s || a.k === "hero") break; if (armyTotal(v.army) < armyCap(v) && v.elixir >= s.cost) { v.elixir -= s.cost; v.army[a.k]++; } break; }
            case "quick": { if (state.phase !== "build") break; let guard = 60; while (armyTotal(v.army) < armyCap(v) && v.elixir >= 25 && guard--) { const k = v.elixir >= 120 && v.army.giant < armyCap(v) / 4 ? "giant" : v.elixir >= 40 && v.army.arch <= v.army.barb ? "arch" : "barb"; v.elixir -= TROOPS[k].cost; v.army[k]++; } break; }
            case "ready": if (online && state.phase === "build") { state.ready[actor] = true; if (state.ready[0] && state.ready[1]) startMatch(); } break;
            case "attack": if (!online && state.phase === "build") startMatch(); break;
            case "deploy": if (mine() && state.phase === "raid") deploy(b, a.k, a.x, a.y); break;
            case "all": if (mine() && state.phase === "raid") deployAll(b); break;
            case "rage": if (mine() && state.phase === "raid" && !b.rageUsed) { const h = heroOf(b); if (h) { b.rage = b.clock + 6; b.rageUsed = true; addFx(b, { type: "rage", x: h.x, y: h.y, ttl: .8 }); } } break;
            case "end": if (mine() && state.phase === "raid") finishBattle(b); break;
            case "continue": if (state.phase === "between") startRaid(2); else if (state.phase === "final") toBuild(); break;
            default: return;
        }
        publish();
    }
    function submitAction(a) {
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, mySeat());
    }

    /* ---------------- cheats (AI only) ---------------- */
    function cheat(c) {
        if (online || !state) return;
        cheated = true;
        const v = state.villages[0], b = state.battle;
        if (c === "res") { v.gold = CAP; v.elixir = CAP; }
        else if (c === "maxv") { eachB(v, bd => { bd.l = 3; }); const th = thLvl(v); for (const t of ["cannon", "tower", "mine", "pump", "barracks"]) { let guard = 20; while (countT(v, t) < maxCount(t, th) && guard--) { const x = Math.floor(Math.random() * GRID), y = Math.floor(Math.random() * GRID); if (!v.grid[y][x]) v.grid[y][x] = { t, l: 3 }; } } }
        else if (c === "army") { const cap = armyCap(v); v.army = { giant: Math.floor(cap / 4), arch: Math.floor(cap / 3), barb: 0 }; v.army.barb = cap - v.army.giant - v.army.arch; }
        else if (c === "god") flags.god = !flags.god;
        else if (c === "onehit") flags.onehit = !flags.onehit;
        else if (c === "freeze") flags.freeze = !flags.freeze;
        else if (c === "win") { if (b && b.attacker === 0 && !b.done) { for (const d of b.buildings) if (!d.dead) killB(b, d); finishBattle(b); } }
        else if (c === "tier") state.tier++;
        publish(); renderCheats();
    }

    /* ---------------- DOM skeleton ---------------- */
    root.innerHTML = `
<div class="game-app cv${padOn ? " pad-on" : ""}">
<style>
.cv{--panel:#151b29;--line:#242d40;--tx:#e8ebf2;--mut:#8a93a8;--acc:#f2b23e;--acc2:#8b7cf6;--ok:#41d98d;--bad:#f26d6d;color:var(--tx);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.cv [hidden]{display:none!important}
.cv .game-intro{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.cv .game-intro h2{margin:0;font-size:17px;font-weight:700;letter-spacing:.3px}
.cv .cv-hud{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--mut)}
.cv .cv-hud b{color:var(--tx);font-weight:600}
.cv .cv-hud .g b{color:var(--acc)} .cv .cv-hud .e b{color:#c084fc}
.cv .game-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut)}
.cv .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block}
.cv .cv-main{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cv .cv-board{position:relative;flex:1 1 340px;max-width:440px;aspect-ratio:1/1}
.cv .cv-board svg{width:100%;height:100%;display:block;border-radius:12px;touch-action:manipulation}
.cv .cv-side{flex:1 1 260px;min-width:250px;max-width:330px;display:flex;flex-direction:column;gap:8px}
.cv .cv-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px}
.cv .cv-lab{font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin:0 0 8px}
.cv .cv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cv .cv-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.cv .cv-b{appearance:none;border:1px solid var(--line);background:#1a2233;color:var(--tx);border-radius:8px;padding:8px 10px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;text-align:left;min-height:38px}
.cv .cv-b small{display:block;color:var(--mut);font-weight:500;font-size:10.5px}
.cv .cv-b.on{border-color:var(--acc);background:#26293a}
.cv .cv-b:disabled{opacity:.38;cursor:default}
.cv .cv-b.pri{background:var(--acc);border-color:var(--acc);color:#1a1408;text-align:center}
.cv .cv-b.vio{background:#2a2547;border-color:var(--acc2);text-align:center}
.cv .cv-b.ghost{background:transparent;text-align:center}
.cv .cv-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cv .cv-row .cv-b{flex:1 1 auto}
.cv .cv-info{font-size:12.5px;color:var(--mut)} .cv .cv-info b{color:var(--tx)}
.cv .cv-bar{height:6px;background:#0d1220;border-radius:3px;overflow:hidden;margin-top:8px}
.cv .cv-bar i{display:block;height:100%;background:var(--ok);border-radius:3px;transition:width .2s}
.cv .cv-note{min-height:18px;font-size:12px;color:var(--mut)}
.cv .game-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.cv .game-action-button,.cv .cv-ico{appearance:none;border:1px solid var(--line);background:#1a2233;color:var(--tx);border-radius:8px;padding:8px 14px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.cv .cv-ico{padding:8px 11px}
.cv .cv-ico.on{border-color:var(--acc)}
.cv .cv-cell{cursor:pointer}
.cv .cv-cell.ok{fill:#41d98d22} .cv .cv-cell.no{fill:#f26d6d14}
.cv .cv-cell.dep{stroke:#8b7cf655;stroke-dasharray:4 3}
.cv .cv-cell.dep.on{stroke:#8b7cf6;fill:#8b7cf61e}
.cv [data-g]{pointer-events:none}
.cv .cv-troop{transition:transform ${online ? ".24" : ".13"}s linear}
.cv .cv-lunge{animation:cvPop .2s ease}
.cv .cv-aura{fill:#8b7cf61c;stroke:#8b7cf6;stroke-width:1.5;animation:cvPulse 1s ease-in-out infinite}
.cv .cv-boom{fill:none;stroke:#f2b23e;stroke-width:3;animation:cvBoom .45s ease-out forwards}
.cv .cv-splash{fill:none;stroke:#f26d6d;stroke-width:2;animation:cvBoom .4s ease-out forwards}
.cv .cv-ring{fill:none;stroke:#8b7cf6;stroke-width:1.5;animation:cvRing .5s ease-out forwards}
.cv .cv-dep{fill:none;stroke:#41d98d;stroke-width:2;stroke-dasharray:4 3;animation:cvRing .5s ease-out forwards}
.cv .cv-ragecast{fill:none;stroke:#8b7cf6;stroke-width:3;animation:cvBoom .8s ease-out forwards}
.cv .cv-slash{fill:none;stroke:#ffe9b0;stroke-width:3;stroke-linecap:round;animation:cvSlash .3s ease-out forwards}
.cv .cv-ball{animation:cvArc var(--d,.4s) ease-in-out}
.cv .cv-prev{fill:none;stroke:#f2b23e88;stroke-width:1.5;stroke-dasharray:5 4}
.cv .cv-ghost{fill:#f2b23e33;stroke:#f2b23e;stroke-width:1.5}
.cv .cv-cursor{fill:none;stroke:var(--acc);stroke-width:2;animation:cvPulse 1.4s ease-in-out infinite}
.cv .cv-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0d1220d9;border-radius:12px;z-index:5}
.cv .cv-ovcard{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 22px;max-width:320px;text-align:center}
.cv .cv-ovcard h3{margin:0 0 6px;font-size:16px}
.cv .cv-ovcard p{margin:0 0 12px;font-size:12.5px;color:var(--mut)}
.cv .cv-coin{width:44px;height:44px;margin:0 auto 10px;border-radius:50%;background:var(--acc);color:#1a1408;font-weight:800;display:flex;align-items:center;justify-content:center;animation:cvCoin .5s linear infinite}
.cv .cv-cheats{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0d1220e6;border-radius:12px;z-index:6}
.cv .cv-cheats .cv-card{width:250px}
.cv .cv-cheats .cv-b{margin-bottom:6px;width:100%}
.cv .cv-pad{display:none;gap:6px;align-items:center;margin-top:10px}
.cv.pad-on .cv-pad{display:flex}
.cv .cv-dpad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:4px}
.cv .cv-dpad button,.cv .cv-ab button{appearance:none;border:1px solid var(--line);background:#1a2233;color:var(--tx);border-radius:8px;font-size:16px;cursor:pointer;min-height:44px}
.cv .cv-ab{display:flex;gap:6px;margin-left:10px}
.cv .cv-ab button{width:52px;height:52px;border-radius:50%;font-weight:700}
.cv .cv-star{fill:#2a3247;stroke:var(--acc);stroke-width:1.2}.cv .cv-star.lit{fill:var(--acc)}
@keyframes cvBoom{from{transform:scale(.4);opacity:.9}to{transform:scale(1.7);opacity:0}}
@keyframes cvRing{from{opacity:.7;transform:scale(.92)}to{opacity:0;transform:scale(1.06)}}
@keyframes cvSlash{from{opacity:1;transform:scale(.6)}to{opacity:0;transform:scale(1.3)}}
@keyframes cvArc{0%{transform:translateY(0)}50%{transform:translateY(-14px)}100%{transform:translateY(0)}}
@keyframes cvPulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes cvPop{50%{transform:scale(1.18)}}
@keyframes cvCoin{from{transform:rotateY(0)}to{transform:rotateY(360deg)}}
@media (max-width:720px){.cv .cv-side{max-width:none}.cv .cv-b{min-height:44px}}
</style>
  <div class="game-intro">
    <h2>Clash Village</h2>
    <div class="cv-hud">
      <span class="g">Gold <b data-hud="gold">0</b></span>
      <span class="e">Elixir <b data-hud="elixir">0</b></span>
      <span>Army <b data-hud="army">0</b>/<b data-hud="cap">0</b></span>
      <span data-hud="meta">Tier <b data-hud="tier">1</b> · Best <b data-hud="best">0</b></span>
      <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    </div>
  </div>
  <section class="game-panel" data-board>
    <div class="cv-main">
      <div class="cv-board">
        <svg viewBox="0 0 360 360" data-el="board" role="img" aria-label="Board">
          <g data-g="cells"></g><g data-g="marks"></g><g data-g="builds"></g><g data-g="troops"></g><g data-g="prev"></g><g data-g="fx"></g>
        </svg>
        <div class="cv-ov" data-el="ov" hidden><div class="cv-ovcard" data-el="ovcard"></div></div>
        <div class="cv-cheats" data-el="cheats" hidden>
          <div class="cv-card">
            <p class="cv-lab">Cheats</p>
            <button class="cv-b" data-cheat="res">Max resources</button>
            <button class="cv-b" data-cheat="maxv">Max village</button>
            <button class="cv-b" data-cheat="army">Full army</button>
            <button class="cv-b" data-cheat="god">God mode</button>
            <button class="cv-b" data-cheat="onehit">One-hit buildings</button>
            <button class="cv-b" data-cheat="freeze">Freeze battle time</button>
            <button class="cv-b" data-cheat="win">Win current battle</button>
            <button class="cv-b" data-cheat="tier">+1 tier</button>
            <button class="cv-b ghost" data-cheat="close">Close</button>
          </div>
        </div>
      </div>
      <div class="cv-side">
        <div class="cv-card" data-el="panel"></div>
        <div class="cv-note" data-el="note"></div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="cv-b pri" type="button" data-act="primary" data-el="primary">Attack</button>
    <button class="cv-ico" type="button" data-act="cheat" data-el="cheatbtn" title="Cheats (C)">⚡</button>
    <button class="cv-ico" type="button" data-act="pad" data-el="padbtn" title="Virtual pad (V)">🎮</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
  <div class="cv-pad">
    <div class="cv-dpad">
      <span></span><button data-vk="up">▲</button><span></span>
      <button data-vk="left">◀</button><button data-vk="down">▼</button><button data-vk="right">▶</button>
    </div>
    <div class="cv-ab"><button data-vk="ok">A</button><button data-vk="cancel">B</button></div>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const wrap = $(".cv"), board = $('[data-el="board"]');
    const gCells = $('[data-g="cells"]'), gMarks = $('[data-g="marks"]'), gBuilds = $('[data-g="builds"]'), gTroops = $('[data-g="troops"]'), gPrev = $('[data-g="prev"]'), gFx = $('[data-g="fx"]');
    const panelEl = $('[data-el="panel"]'), noteEl = $('[data-el="note"]'), statusEl = $("[data-status]");
    const ovEl = $('[data-el="ov"]'), ovCard = $('[data-el="ovcard"]');
    const cheatsEl = $('[data-el="cheats"]'), primaryBtn = $('[data-el="primary"]');
    const hud = { gold: $('[data-hud="gold"]'), elixir: $('[data-hud="elixir"]'), army: $('[data-hud="army"]'), cap: $('[data-hud="cap"]'), tier: $('[data-hud="tier"]'), best: $('[data-hud="best"]'), meta: $('[data-hud="meta"]') };

    /* ---------------- art ---------------- */
    const ICONS = {
        th: '<path d="M-17 -3 L0 -15 L17 -3 Z" fill="#b45309" stroke="#fde68a" stroke-width="2"/><rect x="-13" y="-3" width="26" height="13" rx="2" fill="#7c4a21" stroke="#fde68a" stroke-width="2"/><rect x="-3" y="1" width="6" height="9" fill="#3b2214"/>',
        mine: '<path d="M-14 10 L-5 -7 L5 -7 L14 10 Z" fill="#78350f" stroke="#fbbf24" stroke-width="2"/><circle cx="0" cy="3" r="4.5" fill="#fbbf24"/>',
        pump: '<rect x="-11" y="-11" width="22" height="19" rx="5" fill="#7e22ce" stroke="#e9d5ff" stroke-width="2"/><circle cx="0" cy="-1.5" r="5" fill="#c084fc"/>',
        cannon: '<line x1="0" y1="3" x2="11" y2="-11" stroke="#111827" stroke-width="7" stroke-linecap="round"/><line x1="0" y1="3" x2="11" y2="-11" stroke="#9ca3af" stroke-width="3" stroke-linecap="round"/><circle cx="0" cy="4" r="8" fill="#374151" stroke="#9ca3af" stroke-width="2"/>',
        tower: '<rect x="-8" y="-5" width="16" height="15" fill="#57534e" stroke="#e7e5e4" stroke-width="2"/><path d="M-11 -5 L0 -15 L11 -5 Z" fill="#dc2626" stroke="#fecaca" stroke-width="2"/><circle cx="0" cy="-1" r="2.5" fill="#fde047"/>',
        barracks: '<path d="M-14 10 L0 -9 L14 10 Z" fill="#166534" stroke="#bbf7d0" stroke-width="2"/><path d="M0 -16 L10 -13.5 L0 -11 Z" fill="#4ade80"/>',
    };
    const TSVG = {
        barb: '<circle r="7" fill="#f97316" stroke="#ffedd5" stroke-width="1.5"/><line x1="5" y1="-5" x2="12" y2="-12" stroke="#e5e7eb" stroke-width="2.5" stroke-linecap="round"/>',
        arch: '<circle r="6" fill="#ec4899" stroke="#fce7f3" stroke-width="1.5"/><path d="M3 -6 A 8 8 0 0 1 3 6" fill="none" stroke="#fbcfe8" stroke-width="2"/>',
        giant: '<circle r="12" fill="#6366f1" stroke="#c7d2fe" stroke-width="2"/><circle cy="-5" r="4.5" fill="#c7d2fe"/>',
        hero: '<circle r="10" fill="#f2b23e" stroke="#fff7e0" stroke-width="2"/><path d="M-6 -8 L-3 -13 L0 -9 L3 -13 L6 -8 Z" fill="#fff7e0"/><line x1="7" y1="-4" x2="15" y2="-12" stroke="#fff7e0" stroke-width="3" stroke-linecap="round"/>',
    };
    const RUBBLE = '<rect x="-13" y="-9" width="26" height="17" rx="4" fill="#3f3f46" stroke="#52525b" stroke-width="1.5"/><path d="M-8 -3 l5 6 M3 -4 l5 7" stroke="#52525b" stroke-width="1.5" fill="none"/>';
    const svgG = (html) => { const g = document.createElementNS(NS, "g"); g.innerHTML = html; return g; };
    const badge = (l) => `<circle cx="13" cy="-13" r="6.5" fill="#0d1220" stroke="#f2b23e" stroke-width="1.2"/><text x="13" y="-10" font-size="9" text-anchor="middle" fill="#fde68a">${l}</text>`;

    /* ---------------- render ---------------- */
    const bNodes = new Map(), tNodes = new Map(), fNodes = new Map();
    const fxTimers = new Set();
    let boardMode = "", panelSig = "", cellsSig = "", battleKey = "", noteTimer = null;

    function note(msg) {
        noteEl.textContent = msg;
        if (noteTimer) clearTimeout(noteTimer);
        noteTimer = setTimeout(() => { noteEl.textContent = ""; }, 2500);
    }
    function clearBoard() {
        for (const m of [bNodes, tNodes, fNodes]) { for (const n of m.values()) n.remove(); m.clear(); }
        for (const t of fxTimers) clearTimeout(t); fxTimers.clear();
        gBuilds.innerHTML = ""; gTroops.innerHTML = ""; gFx.innerHTML = ""; gPrev.innerHTML = "";
    }
    function drawCells() {
        const b = state.battle, me = mySeat();
        const myRaid = b && b.attacker === me && !b.done;
        const sig = [state.phase, buildType, moveFrom ? 1 : 0, myRaid ? 1 : 0, selTroop, state.match].join("|");
        if (sig === cellsSig) return; cellsSig = sig;
        let s = `<rect width="360" height="360" rx="12" fill="${b ? "#241a1c" : "#16211c"}"/>`;
        const v = state.villages[me];
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
            let cls = "cv-cell", fill = b ? "#2c2123" : "#1e2b24";
            if (b) { if (ring(x, y)) cls += " dep" + (myRaid ? " on" : ""); }
            else if (moveFrom) { if (!v.grid[y][x]) cls += " ok"; }
            else if (buildType && !v.grid[y][x]) cls += canPlace(v, buildType, x, y) ? " ok" : " no";
            s += `<rect class="${cls}" data-x="${x}" data-y="${y}" x="${MARGIN + x * CELL + 2}" y="${MARGIN + y * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="6" fill="${fill}" stroke="#ffffff10"/>`;
        }
        gCells.innerHTML = s;
    }
    function syncBuildings(list, village) {
        const seen = new Set();
        for (const d of list) {
            const id = d.id; seen.add(id);
            let n = bNodes.get(id);
            if (!n) {
                n = svgG((ICONS[d.t] || "") + (village ? badge(d.l) : `<rect x="-16" y="-26" width="32" height="3" rx="1.5" fill="#0d1220"/><rect class="cv-hp" x="-16" y="-26" width="32" height="3" rx="1.5" fill="#41d98d"/>`));
                n.style.transform = tr(d.x, d.y);
                gBuilds.appendChild(n); bNodes.set(id, n);
                n._hp = n.querySelector(".cv-hp"); n._dead = false; n._lvl = d.l;
            }
            if (village && d.l !== n._lvl) { n.innerHTML = (ICONS[d.t] || "") + badge(d.l); n._lvl = d.l; }
            n.style.transform = tr(d.x, d.y);
            if (!village) {
                if (d.dead && !n._dead) { n.innerHTML = RUBBLE; n._dead = true; }
                else if (!d.dead && n._hp) { const f = clamp(d.hp / d.maxHp, 0, 1); n._hp.setAttribute("width", (32 * f).toFixed(1)); n._hp.setAttribute("fill", f > .4 ? "#41d98d" : "#f26d6d"); }
            }
        }
        for (const [id, n] of bNodes) if (!seen.has(id)) { n.remove(); bNodes.delete(id); }
    }
    function syncTroops(b) {
        const seen = new Set();
        for (const t of b.troops) {
            seen.add(t.id);
            let n = tNodes.get(t.id);
            if (!n) {
                const by = t.k === "giant" ? -22 : t.k === "hero" ? -19 : -16;
                n = svgG(TSVG[t.k] + `<rect class="cv-hp" x="-9" y="${by}" width="18" height="3" rx="1.5" fill="#41d98d"/>`);
                n.setAttribute("class", "cv-troop");
                n.style.transform = tr(t.x, t.y);
                gTroops.appendChild(n); tNodes.set(t.id, n);
                n._hp = n.querySelector(".cv-hp"); n._aura = null;
            }
            n.style.transform = tr(t.x, t.y);
            const f = clamp(t.hp / t.maxHp, 0, 1);
            n._hp.setAttribute("width", (18 * f).toFixed(1)); n._hp.setAttribute("fill", f > .4 ? "#41d98d" : "#f26d6d");
            const aura = b.rage > b.clock && t.k === "hero";
            if (aura && !n._aura) { n._aura = svgG(`<circle class="cv-aura" r="${2.6 * CELL}"/>`); n.insertBefore(n._aura, n.firstChild); }
            if (!aura && n._aura) { n._aura.remove(); n._aura = null; }
        }
        for (const [id, n] of tNodes) if (!seen.has(id)) { n.remove(); tNodes.delete(id); }
    }
    function makeFx(f) {
        if (f.type === "shot") {
            const ang = Math.atan2(f.y1 - f.y0, f.x1 - f.x0) * 180 / Math.PI;
            const inner = f.kind === "ball"
                ? `<circle class="cv-ball" style="--d:${f.ttl}s" r="3.5" fill="#111827" stroke="#d1d5db"/>`
                : `<line x1="-6" y1="0" x2="6" y2="0" stroke="${f.kind === "bolt" ? "#c084fc" : "#f9a8d4"}" stroke-width="2" transform="rotate(${ang.toFixed(0)})"/>`;
            return svgG(inner);
        }
        if (f.type === "slash") { const n = svgG(`<path class="cv-slash" d="M-9 0 A9 9 0 0 1 9 0" transform="rotate(${(f.ang || 0).toFixed(0)})"/>`); n.style.transform = tr(f.x, f.y); return n; }
        if (f.type === "boom") { const n = svgG(`<circle class="cv-boom" r="${f.r}"/>`); n.style.transform = tr(f.x, f.y); return n; }
        if (f.type === "splash") { const n = svgG(`<circle class="cv-splash" r="12"/>`); n.style.transform = tr(f.x, f.y); return n; }
        if (f.type === "ring") { const n = svgG(`<circle class="cv-ring" r="${f.r * CELL}"/>`); n.style.transform = tr(f.x, f.y); return n; }
        if (f.type === "dep") { const n = svgG(`<circle class="cv-dep" r="15"/>`); n.style.transform = tr(f.x, f.y); return n; }
        if (f.type === "rage") { const n = svgG(`<circle class="cv-ragecast" r="${2.6 * CELL}"/>`); n.style.transform = tr(f.x, f.y); return n; }
        if (f.type === "lunge") {
            const target = typeof f.tid === "string" ? bNodes.get(Number(f.tid.slice(1))) : tNodes.get(f.tid);
            if (target) { target.classList.remove("cv-lunge"); requestAnimationFrame(() => target.classList.add("cv-lunge")); }
            return null;
        }
        return null;
    }
    function syncFx(b) {
        for (const f of b.fx) {
            if (fNodes.has(f.id)) continue;
            const n = makeFx(f); if (!n) continue;
            fNodes.set(f.id, n); gFx.appendChild(n);
            if (f.type === "shot") {
                n.style.transform = tr(f.x0, f.y0);
                requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = `transform ${f.ttl}s linear`; n.style.transform = tr(f.x1, f.y1); }));
            }
            const to = setTimeout(() => { n.remove(); fNodes.delete(f.id); fxTimers.delete(to); }, (f.ttl + .2) * 1000);
            fxTimers.add(to);
        }
    }
    function drawMarks() {
        let s = "";
        if (sel && !state.battle) s += `<rect x="${MARGIN + sel.x * CELL + 1}" y="${MARGIN + sel.y * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="7" fill="none" stroke="#f2b23e" stroke-width="2"/>`;
        s += `<rect class="cv-cursor" x="${MARGIN + cursor.x * CELL + 1}" y="${MARGIN + cursor.y * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="7"/>`;
        gMarks.innerHTML = s;
    }
    function drawPrev() {
        const me = mySeat(), b = state.battle, v = state.villages[me];
        let s = "";
        const { x, y } = cursor;
        if (b) {
            if (b.attacker === me && !b.done && ring(x, y) && !b.buildings.some(d => !d.dead && d.x === x && d.y === y) && (b.army[selTroop] || 0) > 0) {
                const r = TROOPS[selTroop].range * CELL;
                s += `<circle class="cv-prev" cx="${px(x)}" cy="${px(y)}" r="${r}"/><circle class="cv-ghost" cx="${px(x)}" cy="${px(y)}" r="9"/>`;
            }
        } else {
            const bd = v.grid[y]?.[x];
            if (bd && BLD[bd.t].def) s += `<circle class="cv-prev" cx="${px(x)}" cy="${px(y)}" r="${BLD[bd.t].range * CELL}"/>`;
        }
        gPrev.innerHTML = s;
    }

    const btn = (act, label, dis, cls = "", extra = "") => `<button class="cv-b ${cls}" data-act="${act}" ${extra} ${dis ? "disabled" : ""}>${label}</button>`;
    function panelHTML() {
        const me = mySeat(), v = state.villages[me], b = state.battle;
        if (state.phase === "raid" && b) {
            const mine = b.attacker === me;
            const pct = b.totalW ? Math.round(100 * b.deadW / b.totalW) : 0;
            let h = `<p class="cv-lab">${mine ? "Your raid" : "Defending"} · ${Math.max(0, Math.ceil(b.time))}s</p>`;
            h += `<div class="cv-info">Destroyed <b>${pct}%</b></div><div class="cv-bar"><i style="width:${pct}%"></i></div>`;
            h += `<div class="cv-grid2" style="margin-top:8px">`;
            for (const k of [...KINDS, "hero"]) {
                const cnt = b.army[k] || 0;
                h += btn("pick", `${TROOPS[k].label} ×${cnt}`, !mine || cnt <= 0, selTroop === k ? "on" : "", `data-k="${k}"`);
            }
            h += `</div>`;
            if (mine) {
                const hOn = !!heroOf(b);
                h += `<div class="cv-row">${btn("rage", b.rageUsed ? "Rage used" : "⚡ Rage (R)", b.rageUsed || !hOn, "vio")}${btn("all", "Auto deploy (D)", false, "")}${btn("end", "End (X)", false, "ghost")}</div>`;
            }
            return h;
        }
        const th = thLvl(v), cap = armyCap(v), tot = armyTotal(v.army);
        let h = `<p class="cv-lab">Build · Town Hall ${th}</p><div class="cv-grid2">`;
        for (const t of SHOP) {
            const s = BLD[t], cnt = countT(v, t), max = maxCount(t, th), full = cnt >= max;
            const small = max === 0 ? "TH 2" : full ? `${cnt}/${max}` : `${s.cost} ${s.cur}`;
            h += btn("build", `${s.label}<small>${small}</small>`, full || state.phase !== "build", buildType === t ? "on" : "", `data-b="${t}"`);
        }
        h += `</div>`;
        if (sel && v.grid[sel.y]?.[sel.x]) {
            const bd = v.grid[sel.y][sel.x], s = BLD[bd.t], c = upCost(bd.t, bd.l);
            h += `<div class="cv-info" style="margin-top:8px"><b>${s.label}</b> · Lv ${bd.l}/3</div>`;
            h += `<div class="cv-row">${btn("upgrade", bd.l >= 3 ? "Max level" : `Upgrade ${c} ${s.cur} (U)`, bd.l >= 3 || state.phase !== "build", "")}${btn("move", moveFrom ? "Pick cell (M)" : "Move (M)", state.phase !== "build", "ghost")}${btn("deselect", "✕", false, "ghost")}</div>`;
        }
        h += `<p class="cv-lab" style="margin-top:10px">Army ${tot}/${cap} · Hero ready</p><div class="cv-grid3">`;
        for (const k of KINDS) h += btn("train", `${TROOPS[k].label} ×${v.army[k]}<small>${TROOPS[k].cost} elixir</small>`, state.phase !== "build" || tot >= cap || v.elixir < TROOPS[k].cost, "", `data-k="${k}"`);
        h += `</div><div class="cv-row">${btn("quick", "Quick army (F)", state.phase !== "build" || tot >= cap || v.elixir < 25, "vio")}</div>`;
        return h;
    }
    function starsSvg(n) {
        const d = "M0,-10 L2.47,-3.4 L9.51,-3.09 L3.99,1.3 L5.88,8.09 L0,4.2 L-5.88,8.09 L-3.99,1.3 L-9.51,-3.09 L-2.47,-3.4 Z";
        let s = '<svg viewBox="-14 -12 84 24" width="130" height="36" aria-hidden="true">';
        for (let i = 0; i < 3; i++) s += `<path class="cv-star${i < n ? " lit" : ""}" transform="translate(${i * 28},0)" d="${d}"/>`;
        return s + "</svg>";
    }
    function renderOverlay() {
        const me = mySeat(), p = state.phase;
        if (p === "coin") {
            ovEl.hidden = false;
            const youFirst = state.first === me;
            ovCard.innerHTML = `<div class="cv-coin">⚔</div><h3>${youFirst ? "You attack first" : (online ? "Opponent attacks first" : "Enemy attacks first")}</h3><p>Coin toss · raid ${state.raidNo + 1} of 2</p>`;
        } else if (p === "between") {
            ovEl.hidden = false;
            const r = state.results[state.battle.attacker];
            const who = state.battle.attacker === me ? "You" : (online ? "Opponent" : "Enemy");
            ovCard.innerHTML = `<h3>${who} scored ${r.pct}%</h3>${starsSvg(r.stars)}<p>${state.battle.attacker === me ? "Now defend your village." : "Your turn to raid."}</p>${btn("continue", "Continue (A)", false, "pri")}`;
        } else if (p === "final") {
            ovEl.hidden = false;
            const [r0, r1] = state.results;
            const win = state.winner === me, draw = state.winner === 2;
            const title = draw ? "Draw" : win ? "Victory" : "Defeat";
            const mineR = state.results[me], oppR = state.results[1 - me];
            ovCard.innerHTML = `<h3>${title}</h3>${starsSvg(mineR.stars)}<p>You ${mineR.pct}% · ${online ? "Opponent" : "Enemy"} ${oppR.pct}%${!online && win ? ` · Tier ${state.tier}` : ""}</p>${btn("continue", online ? "Rematch (A)" : "Back to village (A)", false, "pri")}`;
        } else ovEl.hidden = true;
    }
    function renderCheats() {
        cheatsEl.hidden = online || !cheatOpen;
        if (cheatOpen && !online) {
            cheatsEl.querySelector('[data-cheat="god"]').classList.toggle("on", flags.god);
            cheatsEl.querySelector('[data-cheat="onehit"]').classList.toggle("on", flags.onehit);
            cheatsEl.querySelector('[data-cheat="freeze"]').classList.toggle("on", flags.freeze);
        }
    }
    function render() {
        if (!state) { statusEl.textContent = "Waiting for host…"; return; }
        const me = mySeat(), v = state.villages[me], b = state.battle;
        hud.gold.textContent = Math.floor(v.gold); hud.elixir.textContent = Math.floor(v.elixir);
        hud.army.textContent = b && b.attacker === me ? armyTotal(b.army) + b.army.hero : armyTotal(v.army);
        hud.cap.textContent = armyCap(v);
        if (online) hud.meta.innerHTML = `You <b>P${me + 1}</b>${cheated ? "" : ""}`;
        else { hud.tier.textContent = state.tier; hud.best.textContent = best; }
        const phaseTxt = { build: online ? (state.ready[me] ? "Waiting opponent" : "Build · Ready up") : "Build", coin: "Coin toss", raid: b && b.attacker === me ? "Raiding" : "Defending", between: "Intermission", final: "Match over" };
        statusEl.textContent = phaseTxt[state.phase] || "…";
        primaryBtn.hidden = state.phase === "raid" || state.phase === "coin";
        primaryBtn.textContent = state.phase === "build" ? (online ? (state.ready[me] ? "Ready ✓" : "Ready (A)") : "Attack (A)") : state.phase === "between" ? "Continue (A)" : online ? "Rematch (A)" : "Back to village (A)";
        primaryBtn.disabled = online && state.phase === "build" && state.ready[me];
        const mode = b ? "battle" : "village";
        const bk = b ? `${state.match}:${state.raidNo}` : "";
        if (mode !== boardMode || bk !== battleKey) { boardMode = mode; battleKey = bk; clearBoard(); cellsSig = ""; }
        drawCells();
        if (b) {
            if (b.attacker === me && (b.army[selTroop] || 0) <= 0) selTroop = [...KINDS, "hero"].find(k => b.army[k] > 0) || selTroop;
            syncBuildings(b.buildings, false); syncTroops(b); syncFx(b);
        } else {
            const list = []; eachB(v, (bd, x, y) => list.push({ id: `v${y * GRID + x}`, t: bd.t, l: bd.l, x, y }));
            syncBuildings(list, true);
        }
        drawMarks(); drawPrev();
        const sig = [state.phase, b ? Math.ceil(b.time) + ":" + b.deadW + ":" + JSON.stringify(b.army) + ":" + b.rageUsed + ":" + (heroOf(b) ? 1 : 0) + ":" + b.attacker : "", Math.floor(v.gold), Math.floor(v.elixir), JSON.stringify(v.army), sel ? sel.x + "," + sel.y : "", buildType, moveFrom ? 1 : 0, selTroop, state.ready.join(""), thLvl(v)].join("|");
        if (sig !== panelSig) { panelSig = sig; panelEl.innerHTML = panelHTML(); }
        renderOverlay(); renderCheats();
    }
    function publish() {
        render();
        if (online && isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------------- input ---------------- */
    function cellAction(x, y) {
        const me = mySeat(), v = state.villages[me], b = state.battle;
        cursor = { x, y };
        if (state.phase === "raid" && b) {
            if (b.attacker === me && !b.done) {
                if (!ring(x, y)) { note("Deploy on the outer ring."); return; }
                submitAction({ t: "deploy", k: selTroop, x, y });
            }
            return;
        }
        if (state.phase !== "build") return;
        if (moveFrom) {
            if (!v.grid[y][x]) { submitAction({ t: "move", x0: moveFrom.x, y0: moveFrom.y, x1: x, y1: y }); moveFrom = null; sel = { x, y }; }
            else note("Occupied cell.");
            publish(); return;
        }
        if (v.grid[y][x]) { sel = { x, y }; buildType = null; publish(); return; }
        if (buildType) {
            if (canPlace(v, buildType, x, y)) submitAction({ t: "build", b: buildType, x, y });
            else note(countT(v, buildType) >= maxCount(buildType, thLvl(v)) ? "Limit reached — upgrade Town Hall." : "Not enough resources or blocked.");
            return;
        }
        sel = null; publish();
    }
    function primary() {
        const p = state.phase;
        if (p === "build") submitAction({ t: online ? "ready" : "attack" });
        else if (p === "between" || p === "final") submitAction({ t: "continue" });
    }
    function virtualKey(k) {
        if (k === "up") cursor.y = clamp(cursor.y - 1, 0, GRID - 1);
        else if (k === "down") cursor.y = clamp(cursor.y + 1, 0, GRID - 1);
        else if (k === "left") cursor.x = clamp(cursor.x - 1, 0, GRID - 1);
        else if (k === "right") cursor.x = clamp(cursor.x + 1, 0, GRID - 1);
        else if (k === "ok") { cellAction(cursor.x, cursor.y); return; }
        else if (k === "cancel") { buildType = null; sel = null; moveFrom = null; cheatOpen = false; }
        publish();
    }
    function handleClick(e) {
        const ex = e.target.closest("[data-exit]"); if (ex) { onExit(); return; }
        const vk = e.target.closest("[data-vk]"); if (vk) { virtualKey(vk.dataset.vk); return; }
        const ch = e.target.closest("[data-cheat]"); if (ch) { if (ch.dataset.cheat === "close") { cheatOpen = false; renderCheats(); } else cheat(ch.dataset.cheat); return; }
        const el = e.target.closest("[data-act]"); if (!el || !state) return;
        const act = el.dataset.act;
        if (act === "primary") primary();
        else if (act === "cheat") { if (!online) { cheatOpen = !cheatOpen; renderCheats(); } }
        else if (act === "pad") { padOn = !padOn; wrap.classList.toggle("pad-on", padOn); $('[data-el="padbtn"]').classList.toggle("on", padOn); }
        else if (act === "build") { buildType = el.dataset.b; sel = null; moveFrom = false; moveFrom = null; publish(); }
        else if (act === "train") submitAction({ t: "train", k: el.dataset.k });
        else if (act === "quick") submitAction({ t: "quick" });
        else if (act === "upgrade" && sel) submitAction({ t: "upgrade", x: sel.x, y: sel.y });
        else if (act === "move" && sel) { moveFrom = moveFrom ? null : { ...sel }; publish(); }
        else if (act === "deselect") { sel = null; moveFrom = null; publish(); }
        else if (act === "pick") { selTroop = el.dataset.k; publish(); }
        else if (act === "rage") submitAction({ t: "rage" });
        else if (act === "all") submitAction({ t: "all" });
        else if (act === "end") submitAction({ t: "end" });
        else if (act === "continue") submitAction({ t: "continue" });
    }
    function handlePointer(e) {
        const c = e.target.closest?.(".cv-cell"); if (!c || !state) return;
        e.preventDefault();
        cellAction(Number(c.dataset.x), Number(c.dataset.y));
    }
    function handleMove(e) {
        const c = e.target.closest?.(".cv-cell"); if (!c || !state) return;
        const x = Number(c.dataset.x), y = Number(c.dataset.y);
        if (x !== cursor.x || y !== cursor.y) { cursor = { x, y }; drawMarks(); drawPrev(); }
    }
    function handleKey(e) {
        if (!root.isConnected || !state) return;
        const k = e.key;
        const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok", Escape: "cancel" };
        if (map[k]) { e.preventDefault(); virtualKey(map[k]); return; }
        const b = state.battle, raid = state.phase === "raid" && b && b.attacker === mySeat();
        const low = k.toLowerCase();
        if (raid) {
            if (["1", "2", "3", "4"].includes(k)) { selTroop = [...KINDS, "hero"][Number(k) - 1]; publish(); }
            else if (low === "r") submitAction({ t: "rage" });
            else if (low === "d") submitAction({ t: "all" });
            else if (low === "x") submitAction({ t: "end" });
            return;
        }
        if (state.phase === "build") {
            if (["1", "2", "3", "4", "5"].includes(k)) { buildType = SHOP[Number(k) - 1]; sel = null; moveFrom = null; publish(); }
            else if (low === "q") submitAction({ t: "train", k: "barb" });
            else if (low === "w") submitAction({ t: "train", k: "arch" });
            else if (low === "e") submitAction({ t: "train", k: "giant" });
            else if (low === "f") submitAction({ t: "quick" });
            else if (low === "u" && sel) submitAction({ t: "upgrade", x: sel.x, y: sel.y });
            else if (low === "m" && sel) { moveFrom = moveFrom ? null : { ...sel }; publish(); }
        }
        if (low === "a") primary();
        else if (low === "c" && !online) { cheatOpen = !cheatOpen; renderCheats(); }
        else if (low === "v") { padOn = !padOn; wrap.classList.toggle("pad-on", padOn); }
    }
    root.addEventListener("click", handleClick);
    board.addEventListener("pointerdown", handlePointer);
    board.addEventListener("pointermove", handleMove);
    window.addEventListener("keydown", handleKey);

    /* ---------------- loops (host / AI only) ---------------- */
    let simId = null, acc = 0, tickN = 0;
    if (isHost) {
        simId = setInterval(() => {
            if (!state) return;
            const dt = 0.1; tickN++;
            acc += dt;
            if (acc >= 1) {
                acc -= 1;
                produce(state.villages[0]);
                if (online) produce(state.villages[1]);
                if (state.phase !== "raid") publish();
            }
            if (state.phase === "coin") {
                state.coinT -= dt;
                if (state.coinT <= 0) { startRaid(1); publish(); }
            } else if (state.phase === "raid" && state.battle && !state.battle.done) {
                const b = state.battle;
                tickBattle(b, dt, flags, mySeat());
                if (b.done) { settleRaid(); publish(); }
                else if (!online || tickN % 2 === 0) publish();
                else render();
            }
        }, 100);
    }

    /* ---------------- room wiring / boot ---------------- */
    const offs = [];
    const keep = (fn) => { if (typeof fn === "function") offs.push(fn); };
    if (online) {
        keep(room.onRoom((r) => { roomData = r; render(); }));
        if (isHost) {
            state = initState(); publish();
            keep(room.onAction((a) => applyAction(a, state ? 1 - state.seatHost : 1)));
        } else {
            keep(room.onState((s) => { if (s) { state = s; render(); } }));
        }
    } else {
        state = initState();
        render();
    }
    $('[data-el="padbtn"]').classList.toggle("on", padOn);
    $('[data-el="cheatbtn"]').hidden = online;

    return {
        destroy() {
            if (simId) clearInterval(simId);
            if (noteTimer) clearTimeout(noteTimer);
            for (const t of fxTimers) clearTimeout(t); fxTimers.clear();
            root.removeEventListener("click", handleClick);
            board.removeEventListener("pointerdown", handlePointer);
            board.removeEventListener("pointermove", handleMove);
            window.removeEventListener("keydown", handleKey);
            for (const off of offs) { try { off(); } catch (_) { } }
        },
    };
}