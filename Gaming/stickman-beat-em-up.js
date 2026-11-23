/* ==== stickman-beat-em-up.js ==== */
/* =============================================================
   STICKMAN BEAT 'EM UP - real-time 2D side-scrolling brawler.
   Template: export META + export mount(root, context).
   - mode "ai"   : solo vs bot gang, fully local simulation.
   - mode "room" : 2-player co-op. Host is authoritative (60 fps
     sim, ~10 Hz state publish). Guest sends input actions and
     renders interpolated snapshots. No per-frame DB writes.
   ============================================================= */

export const META = {
    id: "stickman-beat-em-up", // must match the file name (without .js)
    name: "Stickman Beat 'em Up",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Brawl through randomly generated city blocks, chain combos, grab weapons and dethrone the Kingpin.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="13" r="5"/><path d="M13 18v13M13 22l-7 4M13 22l8-3M13 31l-5 10M13 31l6 9"/><path d="M21 19l9-2" stroke="#93c5fd" stroke-width="4"/><path d="M35 9l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fde047" stroke="none"/></svg>',
    bg: ["#1e3a8a", "#0f172a"],
    bestKey: "stickmanBeatEmUpBest",
};

/* ---------------- tuning ---------------- */
const VIEW_W = 960, VIEW_H = 430, GROUND_Y = 376;
const GRAVITY = 1700, JUMP_V = 560, WALK_SPEED = 205;
const PLAYER_HP = 120, APPLE_HEAL = 30, COMBO_NEED = 5;
const CHAIN = [
    { id: "jab", dmg: 8, range: 50, dur: 0.20, cd: 0.22, knock: 10 },
    { id: "cross", dmg: 9, range: 52, dur: 0.22, cd: 0.24, knock: 12 },
    { id: "kick", dmg: 12, range: 60, dur: 0.26, cd: 0.34, knock: 26 },
];
const AIR_ATK = { id: "air", dmg: 13, range: 56, dur: 0.30, cd: 0.30, knock: 18 };
const SPECIAL = { id: "special", dmg: 32, range: 95, dur: 0.45, cd: 0.80, knock: 46 };
const WEAPONS = {
    bat: { label: "Bat", dmg: 6, range: 8, dur: 10, cdMul: 1.0 },
    pipe: { label: "Pipe", dmg: 8, range: 10, dur: 10, cdMul: 1.0 },
    knife: { label: "Knife", dmg: 4, range: 4, dur: 14, cdMul: 0.8 },
    sword: { label: "Sword", dmg: 12, range: 16, dur: 8, cdMul: 1.0 },
};
const FOE_TYPES = {
    punk: { hp: 26, spd: 95, dmg: 6, range: 40, atkEvery: 1.15, windup: 0.38, score: 50, poise: 0, color: "#f87171", scale: 1.0 },
    slinger: { hp: 20, spd: 82, dmg: 5, range: 250, atkEvery: 2.10, windup: 0.50, score: 75, poise: 0, color: "#fb923c", scale: 1.0, ranged: true },
    brute: { hp: 64, spd: 58, dmg: 11, range: 48, atkEvery: 1.60, windup: 0.55, score: 120, poise: 2, color: "#a78bfa", scale: 1.22 },
    boss: { hp: 300, spd: 78, dmg: 13, range: 62, atkEvery: 1.50, windup: 0.50, score: 500, poise: 9, color: "#f43f5e", scale: 1.5 },
};
const AREA_NAMES = ["The Alley", "Neon Market", "Old Docks", "Underpass", "Rooftop Row", "The Yard", "Backstreet", "Furnace Row"];
const P_COLORS = ["#22d3ee", "#a3e635"];
const EMPTY_INPUT = { l: false, r: false, j: false, a: false, s: false };

/* ---------------- utils ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function irnd(rnd, a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function shuffled(rnd, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}
function hash01(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/* ---------------- random level generator ----------------
   Solvable by construction:
   - max 2 melee attackers at once (3 in co-op), the rest flank;
   - every attack is telegraphed ("!") and dodgeable by jumping;
   - at least one weapon crate per block;
   - healing budget (apples + co-op revives) is padded until it
     covers >= 60% of the estimated chip damage of the run.     */
function generateLevel(seed, coop) {
    const rnd = mulberry32(seed);
    const count = irnd(rnd, 4, 5);
    const names = shuffled(rnd, AREA_NAMES).slice(0, count - 1);
    names.push("Kingpin's Den");
    const areas = [];
    let x = 0;
    for (let i = 0; i < count; i++) {
        const last = i === count - 1;
        const w = i === 0 ? 780 : last ? 720 : irnd(rnd, 760, 980);
        const a = { x0: x, x1: x + w, name: names[i], foes: [] };
        if (last) {
            a.foes.push({ type: "punk", x: x + 330 }, { type: "punk", x: x + 430 });
            if (coop) a.foes.push({ type: "slinger", x: x + 520 });
            a.foes.push({ type: "boss", x: x + w - 170 });
        } else {
            let budget = i === 0 ? 3 : 3 + i * 2 + irnd(rnd, 0, 2);
            const maxFoes = i === 0 ? 3 : coop ? 7 : 5;
            const pool = i === 0 ? ["punk", "punk", "slinger"]
                : i === 1 ? ["punk", "slinger", "brute"]
                    : ["punk", "slinger", "brute", "brute"];
            while (budget > 0 && a.foes.length < maxFoes) {
                const t = pick(rnd, pool);
                const cost = t === "brute" ? 3 : t === "slinger" ? 2 : 1;
                if (cost > budget && a.foes.length > 0) break;
                a.foes.push({ type: t, x: 0 });
                budget -= cost;
            }
            const span = (a.x1 - 140) - (a.x0 + 340);
            a.foes.forEach((f, k) => {
                f.x = a.x0 + 340 + (span / Math.max(1, a.foes.length - 1)) * k + irnd(rnd, -24, 24);
            });
        }
        areas.push(a);
        x += w;
    }
    const crates = [], apples = [];
    const tiers = [["bat", "pipe"], ["pipe", "knife"], ["knife", "sword"], ["sword", "sword"]];
    areas.forEach((a, i) => {
        const nC = 1 + (rnd() < 0.45 ? 1 : 0);
        for (let k = 0; k < nC; k++) crates.push({ x: a.x0 + irnd(rnd, 180, a.x1 - a.x0 - 220), w: pick(rnd, tiers[Math.min(i, 3)]) });
        const nA = irnd(rnd, 1, 2);
        for (let k = 0; k < nA; k++) apples.push({ x: a.x0 + irnd(rnd, 220, a.x1 - a.x0 - 160) });
    });
    const lastA = areas[count - 1];
    apples.push({ x: lastA.x0 + 90 }, { x: lastA.x0 + 150 }); // pre-boss heal cache
    let expected = 0;
    areas.forEach((a) => a.foes.forEach((f) => { expected += FOE_TYPES[f.type].dmg * (f.type === "boss" ? 6 : 2.4); }));
    let heal = apples.length * APPLE_HEAL + (coop ? 45 * (count - 1) : 0);
    let guard = 0;
    while (heal < expected * 0.6 && guard++ < 24) {
        const a = areas[irnd(rnd, 0, count - 2)];
        apples.push({ x: a.x0 + irnd(rnd, 200, a.x1 - a.x0 - 160) });
        heal += APPLE_HEAL;
    }
    crates.sort((p, q) => p.x - q.x);
    apples.sort((p, q) => p.x - q.x);
    return { seed: seed, world: x, areas: areas, crates: crates, apples: apples, bossHpMul: coop ? 1.6 : 1 };
}

/* ---------------- state ---------------- */
function mkWeapon(key) {
    const w = WEAPONS[key];
    return { key: key, label: w.label, dmg: w.dmg, range: w.range, dur: w.dur, cdMul: w.cdMul };
}
function createInitialState(seed, coop, names) {
    const L = generateLevel(seed, coop);
    const rnd = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    const sides = shuffled(rnd, [0, 1]);               // random spawn slot per player
    const firstStrike = rnd() < 0.5 ? "players" : "foes"; // random initiative vs bots
    const players = [];
    const n = coop ? 2 : 1;
    for (let i = 0; i < n; i++) {
        players.push({
            i: i, name: (names && names[i]) || "P" + (i + 1), side: sides[i],
            x: 80 + sides[i] * 70, y: GROUND_Y, vy: 0, dir: 1,
            hp: PLAYER_HP, maxHp: PLAYER_HP, down: false,
            combo: 0, comboT: 0, chain: 0, chainT: 0,
            weapon: null, atk: null, atkCd: 0, invuln: 0, hurtT: 0,
            walk: 0, moving: false, prevJ: false, prevS: false,
        });
    }
    return {
        v: 2, seed: seed, coop: !!coop, phase: "ready", t: 0, world: L.world,
        players: players, foes: [], rocks: [],
        crates: L.crates.map((c) => ({ x: c.x, w: c.w, taken: false })),
        apples: L.apples.map((a) => ({ x: a.x, taken: false })),
        cleared: L.areas.map(() => false), spawned: L.areas.map(() => false),
        areaIdx: 0, score: 0, nextId: 1,
        firstStrike: firstStrike, buffT: 0, ambushT: 0,
        cheats: { god: false, onehit: false, infSp: false, fast: false, slow: false },
        cheated: false,
    };
}
function spawnArea(S, L, i, ev) {
    S.spawned[i] = true;
    const a = L.areas[i];
    a.foes.forEach((f) => {
        const t = FOE_TYPES[f.type];
        const hp = Math.round(t.hp * (f.type === "boss" ? L.bossHpMul : 1) * (S.coop && f.type !== "boss" ? 1.25 : 1));
        S.foes.push({
            id: S.nextId++, type: f.type, area: i, x: f.x, hp: hp, maxHp: hp,
            dir: -1, walk: Math.random() * 9, stun: 0, state: "idle",
            stateT: 1 + Math.random() * 1.5, atkT: t.atkEvery * (0.6 + Math.random() * 0.8), chargeDir: 0,
        });
    });
    ev.push({ type: "area", idx: i, name: a.name });
}
function beginRun(S, L, ev) {
    S.phase = "play";
    S.buffT = S.firstStrike === "players" ? 3 : 0;
    S.ambushT = S.firstStrike === "foes" ? 2.5 : 0;
    spawnArea(S, L, 0, ev);
    ev.push({ type: "first", who: S.firstStrike, sides: S.players.map((p) => p.side) });
}

/* ---------------- simulation (pure, host-side) ---------------- */
function nearestFoe(S, x, maxDist) {
    let best = null, bd = maxDist;
    for (const f of S.foes) {
        if (f.hp <= 0) continue;
        const d = Math.abs(f.x - x);
        if (d < bd) { bd = d; best = f; }
    }
    return best;
}
function nearestPlayer(alive, x) {
    let best = null, bd = Infinity;
    for (const p of alive) {
        const d = Math.abs(p.x - x);
        if (d < bd) { bd = d; best = p; }
    }
    return best;
}
function attackTokens(S, alive) {
    const set = new Set();
    if (!alive.length) return set;
    const melee = S.foes.filter((f) => f.hp > 0 && f.type !== "boss" && !FOE_TYPES[f.type].ranged);
    const md = (f) => { const p = nearestPlayer(alive, f.x); return p ? Math.abs(p.x - f.x) : 1e9; };
    melee.sort((a, b) => md(a) - md(b));
    const K = S.coop ? 3 : 2;
    for (let i = 0; i < Math.min(K, melee.length); i++) set.add(melee[i].id);
    return set;
}
function damagePlayer(S, p, dmg, dir, ev) {
    if (p.down || p.invuln > 0 || S.cheats.god || S.phase !== "play") return;
    p.hp = Math.max(0, p.hp - dmg);
    p.invuln = 0.6; p.hurtT = 0.3;
    p.x = clamp(p.x + dir * 18, 16, S.world - 16);
    p.combo = 0;
    ev.push({ type: "hurt", x: p.x, dmg: dmg, i: p.i });
    if (p.hp <= 0) {
        p.down = true;
        ev.push({ type: "down", x: p.x, i: p.i });
        if (S.players.every((q) => q.down)) { S.phase = "lose"; ev.push({ type: "lose", score: S.score }); }
    }
}
function killFoe(S, f, ev) {
    f.hp = 0;
    S.score += FOE_TYPES[f.type].score;
    ev.push({ type: "ko", x: f.x, ft: f.type, score: FOE_TYPES[f.type].score });
    const drop = f.type === "brute" ? 0.5 : f.type === "boss" ? 0 : 0.3;
    if (Math.random() < drop) S.apples.push({ x: clamp(f.x, 30, S.world - 30), taken: false });
    if (f.type === "boss") { S.phase = "win"; ev.push({ type: "win", score: S.score }); }
}
function resolvePlayerHit(S, p, ev) {
    const a = p.atk;
    let hitAny = false;
    for (const f of S.foes) {
        if (f.hp <= 0) continue;
        if (p.y < GROUND_Y - 95) continue; // too high above the street
        const d = a.aoe ? Math.abs(f.x - p.x) : (p.dir > 0 ? f.x - p.x : p.x - f.x);
        const ok = a.aoe ? d <= a.range : d >= -24 && d <= a.range;
        if (!ok) continue;
        let dmg = a.dmg;
        if (S.buffT > 0) dmg = Math.round(dmg * 1.25);
        if (f.type === "boss" && f.state === "stun") dmg = Math.round(dmg * 1.5);
        if (S.cheats.onehit) dmg = 9999;
        f.hp = Math.max(0, f.hp - dmg);
        hitAny = true;
        const T = FOE_TYPES[f.type];
        if (T.poise < 2) {
            f.stun = Math.max(f.stun, a.aoe ? 0.5 : 0.3);
            f.x = clamp(f.x + p.dir * a.knock, 20, S.world - 20);
            if (f.state === "wind") f.state = "idle"; // interrupt telegraphed swings
        } else if (a.aoe && f.type !== "boss") {
            f.stun = Math.max(f.stun, 0.35);
            f.x = clamp(f.x + p.dir * a.knock * 0.5, 20, S.world - 20);
        }
        ev.push({ type: "hit", x: (p.x + f.x) / 2, y: GROUND_Y - 46, dmg: dmg, kill: f.hp <= 0, boss: f.type === "boss" });
        if (f.hp <= 0) killFoe(S, f, ev);
        if (S.phase !== "play") return;
    }
    if (hitAny) {
        if (!a.aoe) {
            p.combo++; p.comboT = 1.8;
            if (p.combo === COMBO_NEED) ev.push({ type: "ready", x: p.x });
        }
        if (a.weapon && p.weapon) {
            p.weapon.dur--;
            if (p.weapon.dur <= 0) { p.weapon = null; ev.push({ type: "break", x: p.x }); }
        }
    }
}
function bossBrain(S, f, p, dist, dt, spd, ev) {
    const T = FOE_TYPES.boss;
    f.stateT -= dt;
    if (f.state === "idle") {
        if (dist > f.range - 8) { f.x += f.dir * spd * dt; f.walk += dt; }
        else if (f.atkT <= 0 && p.y > GROUND_Y - 46) { f.state = "wind"; f.stateT = T.windup; ev.push({ type: "tele", x: f.x }); }
        if (f.stateT <= 0 && f.state === "idle") {
            if (dist > 170) { f.state = "tele"; f.stateT = 0.5; f.chargeDir = f.dir; ev.push({ type: "tele", x: f.x }); }
            else { f.state = "sweepWind"; f.stateT = 0.45; ev.push({ type: "tele", x: f.x }); }
        }
    } else if (f.state === "wind") {
        if (f.stateT <= 0) {
            f.state = "idle"; f.stateT = 2 + Math.random(); f.atkT = T.atkEvery;
            if (dist < f.range + 12 && p.y > GROUND_Y - 50) damagePlayer(S, p, T.dmg, f.dir, ev);
        }
    } else if (f.state === "tele") {
        if (f.stateT <= 0) { f.state = "charge"; f.stateT = 0.55; ev.push({ type: "charge", x: f.x }); }
    } else if (f.state === "charge") {
        f.x += f.chargeDir * 340 * dt; f.walk += dt * 2;
        for (const q of S.players) {
            if (!q.down && Math.abs(q.x - f.x) < 36 && q.y > GROUND_Y - 70) {
                damagePlayer(S, q, 18, f.chargeDir, ev);
                f.state = "stun"; f.stateT = 1.2; ev.push({ type: "bossStun", x: f.x });
                break;
            }
        }
        if (f.state === "charge" && f.stateT <= 0) { f.state = "stun"; f.stateT = 1.0; ev.push({ type: "bossStun", x: f.x }); }
    } else if (f.state === "sweepWind") {
        if (f.stateT <= 0) {
            f.state = "idle"; f.stateT = 2.2;
            for (const q of S.players) {
                if (!q.down && Math.abs(q.x - f.x) < 100 && q.y > GROUND_Y - 46) damagePlayer(S, q, 14, Math.sign(q.x - f.x) || 1, ev);
            }
            ev.push({ type: "sweep", x: f.x, y: GROUND_Y - 40 });
        }
    } else if (f.state === "stun") {
        if (f.stateT <= 0) { f.state = "idle"; f.stateT = 2; }
    } else { f.state = "idle"; }
}
function stepSim(S, L, inputs, dt, ev) {
    if (S.phase !== "play") return;
    S.t += dt;
    S.buffT = Math.max(0, S.buffT - dt);
    S.ambushT = Math.max(0, S.ambushT - dt);
    const alive = S.players.filter((p) => !p.down && p.hp > 0);
    /* ---- players ---- */
    for (const p of S.players) {
        if (p.down) continue;
        const inp = inputs[p.i] || EMPTY_INPUT;
        p.atkCd = Math.max(0, p.atkCd - dt);
        p.invuln = Math.max(0, p.invuln - dt);
        p.hurtT = Math.max(0, p.hurtT - dt);
        p.comboT -= dt; if (p.comboT <= 0) { p.combo = 0; p.chain = 0; }
        p.chainT -= dt; if (p.chainT <= 0) p.chain = 0;
        if (p.atk) {
            p.atk.t += dt;
            if (p.atk.t < 0.09 && !p.atk.aoe) p.x += p.dir * 150 * dt; // lunge
            if (!p.atk.hitDone && p.atk.t >= 0.06) { p.atk.hitDone = true; resolvePlayerHit(S, p, ev); }
            if (p.atk.t >= p.atk.dur) p.atk = null;
        }
        if (S.phase !== "play") return;
        const grounded = p.y >= GROUND_Y - 0.5;
        if (inp.j && !p.prevJ && grounded) { p.vy = -JUMP_V; ev.push({ type: "jump", x: p.x }); }
        const spReady = p.combo >= COMBO_NEED || S.cheats.infSp;
        if (inp.s && !p.prevS && !p.atk && p.atkCd <= 0 && spReady) {
            p.atk = { id: "special", t: 0, dur: SPECIAL.dur, dmg: SPECIAL.dmg, range: SPECIAL.range, knock: SPECIAL.knock, aoe: true, hitDone: false, weapon: null };
            p.atkCd = SPECIAL.cd; p.combo = 0; p.invuln = Math.max(p.invuln, 0.5);
            ev.push({ type: "special", x: p.x, y: p.y - 40 });
        } else if (inp.a && !p.atk && p.atkCd <= 0) {
            const mv0 = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
            if (mv0 === 0) { const nf = nearestFoe(S, p.x, 150); if (nf) p.dir = nf.x >= p.x ? 1 : -1; } // auto-face
            const base = grounded ? CHAIN[p.chain % CHAIN.length] : AIR_ATK;
            const w = p.weapon;
            p.atk = {
                id: base.id, t: 0, dur: base.dur,
                dmg: base.dmg + (w ? w.dmg : 0), range: base.range + (w ? w.range : 0),
                knock: base.knock, aoe: false, hitDone: false, weapon: w ? w.key : null,
            };
            p.atkCd = base.cd * (w ? w.cdMul : 1);
            p.chain++; p.chainT = 0.9;
            ev.push({ type: "swing", x: p.x });
        }
        const mv = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        p.moving = mv !== 0;
        if (mv !== 0) {
            const spd = WALK_SPEED * (S.cheats.fast ? 1.55 : 1);
            p.x += mv * spd * dt; p.dir = mv; p.walk += dt * (spd / WALK_SPEED);
        }
        const wasAir = p.y < GROUND_Y - 0.5;
        p.vy += GRAVITY * dt; p.y += p.vy * dt;
        if (p.y >= GROUND_Y) {
            p.y = GROUND_Y;
            if (wasAir && p.vy > 250) ev.push({ type: "land", x: p.x });
            p.vy = 0;
        }
        const a = L.areas[S.areaIdx];
        const locked = !S.cleared[S.areaIdx];
        p.x = clamp(p.x, locked ? a.x0 + 16 : 16, locked ? a.x1 - 70 : S.world - 16);
        for (const c of S.crates) {
            if (!c.taken && Math.abs(p.x - c.x) < 30 && p.y > GROUND_Y - 40) {
                c.taken = true; p.weapon = mkWeapon(c.w);
                ev.push({ type: "crate", x: c.x, w: c.w });
            }
        }
        for (const ap of S.apples) {
            if (!ap.taken && Math.abs(p.x - ap.x) < 26 && p.y > GROUND_Y - 34) {
                ap.taken = true; p.hp = Math.min(p.maxHp, p.hp + APPLE_HEAL);
                ev.push({ type: "apple", x: ap.x });
            }
        }
        p.prevJ = !!inp.j; p.prevS = !!inp.s;
    }
    /* ---- area progression ---- */
    const nxt = S.areaIdx + 1;
    if (nxt < L.areas.length && !S.spawned[nxt]) {
        for (const p of alive) {
            if (p.x >= L.areas[nxt].x0 + 50) { S.areaIdx = nxt; spawnArea(S, L, nxt, ev); break; }
        }
    }
    /* ---- foe AI ---- */
    const tokens = attackTokens(S, alive);
    for (const f of S.foes) {
        if (f.hp <= 0) continue;
        const T = FOE_TYPES[f.type];
        f.atkT -= dt;
        if (f.stun > 0) { f.stun -= dt; continue; }
        const target = nearestPlayer(alive, f.x);
        if (!target) continue;
        const dx = target.x - f.x, dist = Math.abs(dx);
        f.dir = dx >= 0 ? 1 : -1;
        const slow = S.cheats.slow ? 0.55 : 1;
        const rush = S.ambushT > 0 ? 1.3 : 1;
        const spd = T.spd * slow * rush;
        if (f.type === "boss") {
            bossBrain(S, f, target, dist, dt, spd, ev);
        } else if (f.state === "wind") {
            f.stateT -= dt;
            if (f.stateT <= 0) {
                f.state = "idle";
                f.atkT = T.atkEvery * (S.ambushT > 0 ? 0.6 : 1) * (S.cheats.slow ? 1.6 : 1);
                if (T.ranged) {
                    const ft = Math.max(0.35, dist / 260);
                    S.rocks.push({ id: S.nextId++, x: f.x + f.dir * 12, y: GROUND_Y - 52, vx: Math.sign(dx) * 260, vy: (12 - 450 * ft * ft) / ft, dmg: T.dmg });
                    ev.push({ type: "throw", x: f.x });
                } else if (dist <= T.range + 14 && target.y > GROUND_Y - 50) {
                    damagePlayer(S, target, T.dmg, f.dir, ev);
                }
            }
        } else if (T.ranged) {
            if (dist > 280) { f.x += f.dir * spd * dt; f.walk += dt; }
            else if (dist < 180) { f.x -= f.dir * spd * dt; f.walk += dt; }
            if (f.atkT <= 0 && dist < 340) { f.state = "wind"; f.stateT = T.windup; ev.push({ type: "tele", x: f.x }); }
        } else if (tokens.has(f.id)) {
            if (dist > T.range - 6) { f.x += f.dir * spd * dt; f.walk += dt; }
            else if (f.atkT <= 0 && target.y > GROUND_Y - 46) { f.state = "wind"; f.stateT = T.windup; ev.push({ type: "tele", x: f.x }); }
        } else {
            const side = f.id % 2 === 0 ? 1 : -1;
            const want = target.x + side * (150 + (f.id % 3) * 34);
            if (Math.abs(want - f.x) > 14) { f.x += Math.sign(want - f.x) * spd * 0.7 * dt; f.walk += dt; }
        }
        const area = L.areas[f.area];
        f.x = clamp(f.x, area.x0 + 20, area.x1 - 24);
        if (S.phase !== "play") return;
    }
    /* ---- rocks ---- */
    for (const r of S.rocks) {
        r.vy += 900 * dt; r.x += r.vx * dt; r.y += r.vy * dt;
        for (const p of alive) {
            if (!p.down && Math.abs(r.x - p.x) < 16 && Math.abs(r.y - (p.y - 40)) < 32) {
                r.dead = true; damagePlayer(S, p, r.dmg, Math.sign(r.vx) || 1, ev); break;
            }
        }
        if (r.y > GROUND_Y + 8) { r.dead = true; ev.push({ type: "rockland", x: r.x }); }
    }
    S.rocks = S.rocks.filter((r) => !r.dead);
    S.foes = S.foes.filter((f) => f.hp > 0);
    /* ---- area clear + co-op revive ---- */
    const ai = S.areaIdx;
    if (S.spawned[ai] && !S.cleared[ai] && !S.foes.some((f) => f.area === ai && f.hp > 0)) {
        S.cleared[ai] = true;
        S.score += 150;
        ev.push({ type: "gate", idx: ai });
        for (const p of S.players) {
            if (p.down && S.coop) {
                const lead = S.players.find((q) => !q.down);
                p.down = false; p.hp = 45; p.invuln = 1;
                p.x = clamp((lead ? lead.x : p.x) - 40, 16, S.world - 16);
                ev.push({ type: "revive", x: p.x, i: p.i });
            }
        }
    }
}

/* exported for unit tests / tooling; not used by the manifest builder */
export const _test = { mulberry32, generateLevel, createInitialState, beginRun, stepSim, spawnArea, mkWeapon, FOE_TYPES, WEAPONS, CHAIN, SPECIAL, COMBO_NEED, PLAYER_HP, APPLE_HEAL, GROUND_Y, EMPTY_INPUT };

/* =============================================================
   MOUNT - UI, rendering, input, networking
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;
    let level = null;

    root.innerHTML = `
<style>
.sb-root{--bg:#0b1122;--panel:#0e162e;--line:#1f2b47;--txt:#dbe4f3;--dim:#8fa3c8;--acc:#22d3ee;--bad:#fb7185;--warn:#fbbf24;--good:#34d399;color:var(--txt);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sb-root *{box-sizing:border-box}
.sb-hud{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:12px 12px 0 0}
.sb-label{font-size:9px;letter-spacing:.14em;color:var(--dim);font-weight:700}
.sb-hp{display:flex;align-items:center;gap:8px}
.sb-bar{width:120px;height:8px;border-radius:99px;background:#16223f;overflow:hidden}
.sb-bar i{display:block;height:100%;width:100%;background:var(--acc);border-radius:99px;transition:width .15s,background .3s}
.sb-hp b{font-size:13px;font-variant-numeric:tabular-nums;min-width:26px}
.sb-ally{font-size:10px;color:var(--dim)}
.sb-ally b{color:#a3e635}
.sb-combo{display:flex;align-items:center;gap:7px}
.sb-pips{display:flex;gap:4px}
.sb-pips i{width:9px;height:9px;border-radius:99px;background:#16223f;border:1px solid var(--line);transition:background .12s}
.sb-pips i.on{background:var(--acc);border-color:var(--acc)}
.sb-pips.ready i{box-shadow:0 0 8px #22d3ee99;animation:sbPulse 1s infinite}
.sb-chip{font-size:10px;color:var(--dim);border:1px solid var(--line);border-radius:99px;padding:3px 9px}
.sb-chip b{color:var(--txt)}
.sb-areas{display:flex;gap:5px;align-items:center}
.sb-areas i{width:8px;height:8px;border-radius:2px;background:#16223f;border:1px solid var(--line);transform:rotate(45deg)}
.sb-areas i.done{background:var(--good);border-color:var(--good)}
.sb-areas i.cur{border-color:var(--acc);box-shadow:0 0 6px #22d3ee66}
.sb-score{display:flex;align-items:baseline;gap:6px;margin-left:auto}
.sb-score b{font-size:15px;font-variant-numeric:tabular-nums}
.sb-best{font-size:9px;color:var(--dim);letter-spacing:.1em}
.sb-best b{font-size:11px;color:var(--warn)}
.sb-tools{display:flex;gap:6px}
.sb-tools button{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--dim);font-size:13px;font-weight:800;cursor:pointer;line-height:1}
.sb-tools button:hover{color:var(--txt);border-color:var(--acc)}
.sb-tools button.off{opacity:.4;text-decoration:line-through}
.sb-stage{position:relative;aspect-ratio:960/430;background:#070c1c;border:1px solid var(--line);border-top:0;overflow:hidden;touch-action:none}
.sb-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.sb-banner{position:absolute;top:13%;left:0;right:0;text-align:center;pointer-events:none;opacity:0}
.sb-banner.show{animation:sbBanner 2s ease forwards}
.sb-banner b{display:block;font-size:26px;font-weight:900;letter-spacing:.18em;text-shadow:0 2px 14px #000}
.sb-banner span{font-size:12px;color:var(--dim);letter-spacing:.08em}
@keyframes sbBanner{0%{opacity:0;transform:translateY(10px)}12%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
@keyframes sbPulse{0%,100%{opacity:1}50%{opacity:.5}}
.sb-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,10,22,.74);backdrop-filter:blur(4px);z-index:5;padding:14px;overflow:auto}
.sb-card{width:min(540px,96%);background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;text-align:left}
.sb-card h3{margin:0 0 4px;font-size:19px;letter-spacing:.14em;font-weight:900}
.sb-card .sb-sub{margin:0 0 12px;font-size:12px;color:var(--dim)}
.sb-how{margin:0 0 12px;padding:0;list-style:none;display:grid;gap:7px;font-size:12px;color:var(--txt)}
.sb-how li{padding-left:16px;position:relative;line-height:1.45}
.sb-how li::before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:2px;background:var(--acc);transform:rotate(45deg)}
.sb-how b{color:var(--acc);font-weight:700}
.sb-ctrl{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:11px;color:var(--dim);border-top:1px solid var(--line);padding-top:10px;margin-bottom:10px}
.sb-ctrl kbd{display:inline-block;min-width:18px;text-align:center;padding:2px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#101b36;color:var(--txt);font-size:10px;font-family:inherit;margin-right:2px}
.sb-note{font-size:11px;color:var(--warn);margin:0 0 12px}
.sb-btn{display:inline-block;border:1px solid var(--line);background:transparent;color:var(--txt);border-radius:10px;padding:10px 18px;font-size:12px;font-weight:800;letter-spacing:.12em;cursor:pointer}
.sb-btn:hover{border-color:var(--acc)}
.sb-btn.primary{background:var(--acc);border-color:var(--acc);color:#04222b}
.sb-btn.primary:hover{filter:brightness(1.1)}
.sb-btn:disabled{opacity:.45;cursor:default}
.sb-btnrow{display:flex;gap:8px;flex-wrap:wrap}
.sb-cheats,.sb-cheatacts{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}
.sb-cheats button,.sb-cheatacts button{border:1px solid var(--line);background:#101b36;color:var(--txt);border-radius:9px;padding:9px 10px;font-size:11px;font-weight:700;cursor:pointer;text-align:left}
.sb-cheats button.on{background:#0c3b46;border-color:var(--acc);color:var(--acc)}
.sb-cheats button.on::after{content:" \\2713";float:right}
.sb-cheatacts button:hover,.sb-cheats button:hover{border-color:var(--acc)}
.sb-cheats button:disabled,.sb-cheatacts button:disabled{opacity:.4;cursor:default}
.sb-endtitle{font-size:24px;font-weight:900;letter-spacing:.14em;margin:0 0 4px}
.sb-endtitle.win{color:var(--good)}
.sb-endtitle.lose{color:var(--bad)}
.sb-endscore{font-size:13px;margin:0 0 14px;color:var(--dim)}
.sb-endscore b{color:var(--txt);font-size:17px}
.sb-touch{display:none;justify-content:space-between;align-items:center;padding:10px 6px 2px;gap:10px;user-select:none;-webkit-user-select:none}
.sb-tleft,.sb-tright{display:flex;gap:10px}
.sb-tbtn{width:60px;height:60px;border-radius:99px;border:1px solid var(--line);background:#121e3a;color:var(--txt);font-size:15px;font-weight:900;touch-action:none;-webkit-tap-highlight-color:transparent;cursor:pointer}
.sb-tbtn:active,.sb-tbtn.held{background:#1c2c52;border-color:var(--acc)}
.sb-ta{background:#3f1d2b;border-color:#6b2440;color:#fecdd3}
.sb-ta:active,.sb-ta.held{background:#7f1d3a}
.sb-ts{background:#12303a;border-color:#155e6e;color:#a5f3fc;font-size:12px}
.sb-ts.ready{box-shadow:0 0 14px #22d3ee88;border-color:var(--acc);animation:sbPulse 1s infinite}
.sb-tj{font-size:11px}
.sb-keys{padding:8px 4px 0;font-size:10.5px;color:var(--dim);text-align:center;letter-spacing:.03em}
@media (pointer:coarse),(max-width:760px){.sb-touch{display:flex}.sb-keys{display:none}.sb-bar{width:80px}.sb-hud{gap:9px}}
</style>
<div class="game-app sb-root">
  <div class="game-intro">
    <div><h2>Stickman Beat 'em Up</h2><p>Real-time street brawl. Clear the blocks, chain combos, drop the Kingpin.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="sb-hud">
      <div class="sb-hp"><span class="sb-label">HP</span><div class="sb-bar"><i data-hpfill></i></div><b data-hp>120</b><span class="sb-ally" data-allychip hidden>ALLY <b data-allyhp>120</b></span></div>
      <div class="sb-combo"><span class="sb-label">COMBO</span><div class="sb-pips" data-pips><i></i><i></i><i></i><i></i><i></i></div></div>
      <span class="sb-chip" data-wpnchip hidden><b data-wpn>Bat</b></span>
      <div class="sb-areas" data-areas title="Blocks"></div>
      <div class="sb-score"><span class="sb-label">SCORE</span><b data-score>0</b><span class="sb-best">BEST <b data-best>0</b></span></div>
      <div class="sb-tools">
        <button type="button" data-act="help" title="How to play (H)">?</button>
        <button type="button" data-act="cheat" title="Cheats (C)">&#9889;</button>
        <button type="button" data-act="mute" title="Sound (M)">&#9834;</button>
        <button type="button" data-act="pause" title="Pause (P)">&#10074;&#10074;</button>
      </div>
    </div>
    <div class="sb-stage">
      <canvas class="sb-canvas" width="960" height="430"></canvas>
      <div class="sb-banner" data-banner><b data-btitle></b><span data-bsub></span></div>
      <div class="sb-ov" data-ov="guide">
        <div class="sb-card">
          <h3>STICKMAN BEAT 'EM UP</h3>
          <p class="sb-sub">Clean every block. Dethrone the Kingpin. Simple controls, real-time action.</p>
          <ul class="sb-how">
            <li><b>Move &amp; jump</b> to the gate. Knock out every foe in the block to open it.</li>
            <li><b>Hold ATTACK</b> to auto-chain a 3-hit combo. Attack in the air = flying kick. You auto-face nearby foes.</li>
            <li><b>Land 5 hits</b> to charge the <b>SPECIAL</b> - a spin blast that hits both sides.</li>
            <li><b>Walk over crates &amp; apples.</b> Weapons auto-equip (they wear out), apples heal +30.</li>
            <li><b>Watch the "!"</b> - every attack is telegraphed. Jump or step away, then punish. The Kingpin charges: sidestep it and hit him while he is stunned.</li>
          </ul>
          <div class="sb-ctrl">
            <span><kbd>A</kbd><kbd>D</kbd> / <kbd>&#8592;</kbd><kbd>&#8594;</kbd> move</span>
            <span><kbd>W</kbd> / <kbd>Space</kbd> jump</span>
            <span><kbd>J</kbd> / left-click attack</span>
            <span><kbd>K</kbd> / right-click special</span>
            <span><kbd>P</kbd> pause &nbsp;<kbd>H</kbd> help &nbsp;<kbd>C</kbd> cheats</span>
          </div>
          <p class="sb-note" data-firstnote>A coin toss decides who strikes first each run. In co-op, spawn sides are random too.</p>
          <div class="sb-btnrow"><button type="button" class="sb-btn primary" data-act="start" data-guidebtn>START</button></div>
        </div>
      </div>
      <div class="sb-ov" data-ov="cheat" hidden>
        <div class="sb-card">
          <h3>CHEATS</h3>
          <p class="sb-note">Using cheats disables best-score saving. <span data-cheatnote></span></p>
          <div class="sb-cheats">
            <button type="button" data-cheat="god">God mode</button>
            <button type="button" data-cheat="onehit">One-hit KO</button>
            <button type="button" data-cheat="infSp">Infinite special</button>
            <button type="button" data-cheat="fast">Speed x1.5</button>
            <button type="button" data-cheat="slow">Slow foes</button>
          </div>
          <div class="sb-cheatacts">
            <button type="button" data-cheatact="heal">Full heal / revive</button>
            <button type="button" data-cheatact="weapon">Give sword</button>
            <button type="button" data-cheatact="score">+1000 score</button>
            <button type="button" data-cheatact="clear">Clear this block</button>
            <button type="button" data-cheatact="boss">Warp to boss</button>
            <button type="button" data-cheatact="reseed">New random level</button>
          </div>
          <div class="sb-btnrow"><button type="button" class="sb-btn" data-act="cheatClose">CLOSE</button></div>
        </div>
      </div>
      <div class="sb-ov" data-ov="pause" hidden>
        <div class="sb-card">
          <h3>PAUSED</h3>
          <p class="sb-sub">Take a breath. The gang will wait.</p>
          <div class="sb-btnrow">
            <button type="button" class="sb-btn primary" data-act="resume">RESUME</button>
            <button type="button" class="sb-btn" data-act="retry" data-retrybtn>NEW RUN</button>
            <button type="button" class="sb-btn" data-exit>EXIT</button>
          </div>
        </div>
      </div>
      <div class="sb-ov" data-ov="end" hidden>
        <div class="sb-card">
          <p class="sb-endtitle" data-endtitle>KINGPIN DETHRONED</p>
          <p class="sb-endscore" data-endmsg></p>
          <p class="sb-endscore">SCORE <b data-endscore>0</b> &nbsp;&middot;&nbsp; BEST <b data-endbest>0</b> <span data-endnote></span></p>
          <div class="sb-btnrow">
            <button type="button" class="sb-btn primary" data-act="retry" data-retrybtn>PLAY AGAIN</button>
            <button type="button" class="sb-btn" data-exit>EXIT</button>
          </div>
        </div>
      </div>
    </div>
    <div class="sb-touch">
      <div class="sb-tleft">
        <button type="button" class="sb-tbtn" data-k="l" aria-label="Move left">&#9664;</button>
        <button type="button" class="sb-tbtn" data-k="r" aria-label="Move right">&#9654;</button>
      </div>
      <div class="sb-tright">
        <button type="button" class="sb-tbtn sb-tj" data-k="j" aria-label="Jump">JUMP</button>
        <button type="button" class="sb-tbtn sb-ta" data-k="a" aria-label="Attack">HIT</button>
        <button type="button" class="sb-tbtn sb-ts" data-k="s" aria-label="Special">SP</button>
      </div>
    </div>
    <div class="sb-keys">A/D move &middot; W/Space jump &middot; J or click = attack (hold to combo) &middot; K or right-click = special &middot; P pause &middot; H help &middot; C cheats &middot; M sound</div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- dom refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const canvas = $(".sb-canvas"), stage = $(".sb-stage");
    const ctx = canvas.getContext("2d");
    const el = {
        status: $("[data-status]"), hp: $("[data-hp]"), hpfill: $("[data-hpfill]"),
        allychip: $("[data-allychip]"), allyhp: $("[data-allyhp]"),
        pips: $("[data-pips]"), wpnchip: $("[data-wpnchip]"), wpn: $("[data-wpn]"),
        areas: $("[data-areas]"), score: $("[data-score]"), best: $("[data-best]"),
        banner: $("[data-banner]"), btitle: $("[data-btitle]"), bsub: $("[data-bsub]"),
        ovGuide: $('[data-ov="guide"]'), ovCheat: $('[data-ov="cheat"]'),
        ovPause: $('[data-ov="pause"]'), ovEnd: $('[data-ov="end"]'),
        guidebtn: $("[data-guidebtn]"), firstnote: $("[data-firstnote]"),
        endtitle: $("[data-endtitle]"), endmsg: $("[data-endmsg]"),
        endscore: $("[data-endscore]"), endbest: $("[data-endbest]"), endnote: $("[data-endnote]"),
        cheatnote: $("[data-cheatnote]"),
        spBtn: $('.sb-tbtn[data-k="s"]'), muteBtn: $('[data-act="mute"]'), pauseBtn: $('[data-act="pause"]'),
    };
    const retryBtns = Array.from(root.querySelectorAll("[data-retrybtn]"));
    const cheatBtns = Array.from(root.querySelectorAll("[data-cheat]"));
    const cheatActBtns = Array.from(root.querySelectorAll("[data-cheatact]"));
    const tbtns = Array.from(root.querySelectorAll("[data-k]"));

    /* ---------- local (non-synced) visual state ---------- */
    let parts = [], gateAnim = {}, bannerQ = [];
    let camX = 0, camSnap = true, shake = 0, hitstop = 0, hurtFlash = 0;
    let guideOpen = false, cheatOpen = false;
    let prevPhase = "ready", saved = false;
    const strikeT = new Map(), prevFoeState = new Map();
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (err) { }

    /* ---------- input ---------- */
    const inputs = [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }];
    const latch = { j: [false, false], s: [false, false] };
    const keys = {};
    const touchSets = { l: new Set(), r: new Set(), j: new Set(), a: new Set(), s: new Set() };
    let mouseA = false, pulseS = false;
    let lastSent = { ...EMPTY_INPUT }, lastSentAt = 0, lastGuestInput = performance.now();
    const KEYMAP = { KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", KeyW: "j", ArrowUp: "j", Space: "j", KeyJ: "a", KeyX: "a", KeyK: "s", KeyV: "s" };

    function pushInput(now) {
        const li = {
            l: !!keys.l || touchSets.l.size > 0,
            r: !!keys.r || touchSets.r.size > 0,
            j: !!keys.j || touchSets.j.size > 0,
            a: !!keys.a || touchSets.a.size > 0 || mouseA,
            s: !!keys.s || touchSets.s.size > 0 || pulseS,
        };
        pulseS = false;
        if (online && !isHost) {
            const changed = ["l", "r", "j", "a", "s"].some((k) => li[k] !== lastSent[k]);
            if (changed || now - lastSentAt > 0.4) { lastSent = li; lastSentAt = now; submitAction({ type: "input", input: li }); }
        } else {
            inputs[playerIndex] = li;
        }
    }
    function togglePause() {
        if (!state || !isHost) return;
        if (state.phase === "play" || state.phase === "pause") submitAction({ type: "pause" });
    }
    function onKeyDown(e) {
        if (e.code === "KeyM" && !e.repeat) { muted = !muted; return; }
        if (e.code === "KeyH" && !e.repeat) { guideOpen = !guideOpen; cheatOpen = false; e.preventDefault(); return; }
        if (e.code === "KeyC" && !e.repeat) { cheatOpen = !cheatOpen; guideOpen = false; e.preventDefault(); return; }
        if (e.code === "KeyP" && !e.repeat) { togglePause(); e.preventDefault(); return; }
        if (e.code === "Escape" && !e.repeat) {
            if (cheatOpen) cheatOpen = false;
            else if (guideOpen && state && state.phase !== "ready") guideOpen = false;
            else togglePause();
            e.preventDefault(); return;
        }
        if (e.code === "Enter" && !e.repeat && state) {
            if (state.phase === "ready" && isHost) { sfx("start"); submitAction({ type: "start" }); }
            else if ((state.phase === "win" || state.phase === "lose") && isHost) submitAction({ type: "retry" });
            return;
        }
        const k = KEYMAP[e.code];
        if (k) { e.preventDefault(); keys[k] = true; }
    }
    function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) keys[k] = false; }
    function onCanvasDown(e) {
        if (!state || state.phase !== "play") return;
        if (e.button === 2) pulseS = true; else mouseA = true;
        e.preventDefault();
    }
    function onCanvasUp(e) { if (e.button !== 2) mouseA = false; }
    function preventCtx(e) { e.preventDefault(); }
    function onTDown(e) {
        const b = e.currentTarget, k = b.dataset.k;
        touchSets[k].add(e.pointerId); b.classList.add("held");
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault();
    }
    function onTUp(e) {
        const b = e.currentTarget, k = b.dataset.k;
        touchSets[k].delete(e.pointerId);
        if (!touchSets[k].size) b.classList.remove("held");
    }
    function onVis() { if (document.hidden && state && !online && state.phase === "play") submitAction({ type: "pause" }); }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVis);
    canvas.addEventListener("pointerdown", onCanvasDown);
    window.addEventListener("pointerup", onCanvasUp);
    stage.addEventListener("contextmenu", preventCtx);
    tbtns.forEach((b) => {
        b.addEventListener("pointerdown", onTDown);
        b.addEventListener("pointerup", onTUp);
        b.addEventListener("pointercancel", onTUp);
        b.addEventListener("lostpointercapture", onTUp);
    });

    /* ---------- tiny synth sfx ---------- */
    let actx = null, muted = false;
    function tone(f0, f1, dur, type, vol, when) {
        const t0 = actx.currentTime + (when || 0);
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || "square";
        o.frequency.setValueAtTime(f0, t0);
        if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
        g.gain.setValueAtTime(vol || 0.08, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(actx.destination);
        o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function sfx(kind) {
        if (muted) return;
        try {
            if (!actx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                actx = new AC();
            }
            if (actx.state === "suspended") actx.resume();
            if (kind === "hit") tone(200, 90, 0.07, "square", 0.06);
            else if (kind === "ko") tone(300, 60, 0.18, "sawtooth", 0.07);
            else if (kind === "hurt") tone(140, 60, 0.2, "sawtooth", 0.08);
            else if (kind === "down") tone(220, 40, 0.5, "sawtooth", 0.09);
            else if (kind === "jump") tone(240, 420, 0.12, "triangle", 0.05);
            else if (kind === "pickup") { tone(520, 760, 0.1, "triangle", 0.06); tone(760, 1040, 0.1, "triangle", 0.05, 0.08); }
            else if (kind === "apple") tone(620, 880, 0.12, "triangle", 0.06);
            else if (kind === "break") tone(180, 70, 0.15, "square", 0.06);
            else if (kind === "special") { tone(160, 640, 0.25, "sawtooth", 0.08); tone(80, 40, 0.3, "square", 0.07); }
            else if (kind === "ready") tone(660, 990, 0.14, "triangle", 0.06);
            else if (kind === "gate") { tone(440, 660, 0.12, "triangle", 0.06); tone(660, 880, 0.14, "triangle", 0.06, 0.1); }
            else if (kind === "charge") tone(90, 180, 0.3, "sawtooth", 0.07);
            else if (kind === "throw") tone(360, 200, 0.08, "triangle", 0.04);
            else if (kind === "start") { tone(330, 495, 0.12, "triangle", 0.06); tone(495, 660, 0.14, "triangle", 0.06, 0.1); }
            else if (kind === "win") [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, "triangle", 0.07, i * 0.12));
            else if (kind === "lose") [330, 262, 196, 131].forEach((f, i) => tone(f, f * 0.9, 0.22, "sawtooth", 0.06, i * 0.15));
        } catch (err) { }
    }

    /* ---------- particles / banners ---------- */
    function sparks(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
            parts.push({ kind: "spark", x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.3, color: color });
        }
    }
    function dust(x, y) {
        for (let i = 0; i < 4; i++) parts.push({ kind: "dust", x: x + (Math.random() * 16 - 8), y: y - 2, vx: Math.random() * 60 - 30, vy: -20 - Math.random() * 40, r: 3 + Math.random() * 3, t: 0, life: 0.4 });
    }
    function shards(x, y, color) {
        for (let i = 0; i < 8; i++) parts.push({ kind: "shard", x: x, y: y, vx: Math.random() * 240 - 120, vy: -80 - Math.random() * 160, rot: Math.random() * 7, vr: Math.random() * 12 - 6, t: 0, life: 0.6, color: color });
    }
    function ring(x, y, color, r1) { parts.push({ kind: "ring", x: x, y: y, r1: r1, t: 0, life: 0.35, color: color }); }
    function addTxt(x, y, txt, color, size) { parts.push({ kind: "txt", x: x, y: y, txt: txt, color: color, size: size || 12, t: 0, life: 0.8 }); }
    function confetti() {
        for (let i = 0; i < 50; i++) parts.push({ kind: "confetti", x: camX + Math.random() * VIEW_W, y: -10 - Math.random() * 60, vx: Math.random() * 80 - 40, vy: 60 + Math.random() * 120, rot: Math.random() * 7, vr: Math.random() * 8 - 4, color: ["#22d3ee", "#a3e635", "#fbbf24", "#fb7185", "#a78bfa"][i % 5], t: 0, life: 2.2 });
    }
    function updateParts(dt) {
        for (const p of parts) {
            p.t += dt;
            if (p.kind === "spark") { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
            else if (p.kind === "dust") { p.x += p.vx * dt; p.y += p.vy * dt; }
            else if (p.kind === "shard" || p.kind === "confetti") { p.vy += (p.kind === "shard" ? 700 : 260) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
        }
        parts = parts.filter((p) => p.t < p.life);
        for (const [id, t] of strikeT) { const nt = t - dt; if (nt <= 0) strikeT.delete(id); else strikeT.set(id, nt); }
    }
    function showBanner(title, sub) {
        el.btitle.textContent = title;
        el.bsub.textContent = sub || "";
        el.banner.classList.remove("show");
        void el.banner.offsetWidth;
        el.banner.classList.add("show");
    }
    function queueFirstBanners(e) {
        const now = performance.now() / 1000;
        bannerQ.push({
            at: now + 1.0,
            title: e.who === "players" ? "YOU STRIKE FIRST" : "GANG AMBUSH!",
            sub: e.who === "players" ? "+25% damage for 3 seconds" : "They move first - defend!",
        });
        if (e.sides && e.sides.length > 1) {
            bannerQ.push({
                at: now + 3.1, title: "SPAWN SIDES",
                sub: "P1 " + (e.sides[0] === 0 ? "LEFT" : "RIGHT") + " \u00b7 P2 " + (e.sides[1] === 0 ? "LEFT" : "RIGHT"),
            });
        }
    }
    function handleEvents(ev) {
        for (const e of ev) {
            if (e.type === "hit") {
                sparks(e.x, e.y, e.kill ? "#fde047" : "#fca5a5", e.kill ? 10 : 6);
                addTxt(e.x, e.y - 14, String(e.dmg), e.boss ? "#fbbf24" : "#e2e8f0", 12);
                shake = Math.min(10, shake + (e.kill ? 4 : 1.6));
                if (e.kill) hitstop = Math.max(hitstop, 0.05);
                sfx(e.kill ? "ko" : "hit");
            } else if (e.type === "ko") {
                parts.push({ kind: "corpse", x: e.x, ft: e.ft, dir: Math.random() < 0.5 ? -1 : 1, t: 0, life: 0.9 });
                addTxt(e.x, GROUND_Y - 84, "+" + e.score, "#fbbf24", 12);
            } else if (e.type === "special") {
                ring(e.x, e.y, "#22d3ee", 95); sparks(e.x, e.y, "#22d3ee", 14);
                shake = Math.min(12, shake + 7); hitstop = Math.max(hitstop, 0.07); sfx("special");
            } else if (e.type === "hurt") {
                hurtFlash = 0.22; shake = Math.min(10, shake + 3.5);
                addTxt(e.x, GROUND_Y - 90, "-" + e.dmg, "#fb7185", 13); sfx("hurt");
            } else if (e.type === "down") { addTxt(e.x, GROUND_Y - 96, "DOWN!", "#fb7185", 15); sfx("down"); }
            else if (e.type === "revive") { addTxt(e.x, GROUND_Y - 96, "REVIVED", "#34d399", 13); sfx("pickup"); }
            else if (e.type === "crate") { shards(e.x, GROUND_Y - 16, "#b9854f"); addTxt(e.x, GROUND_Y - 58, WEAPONS[e.w].label.toUpperCase(), "#22d3ee", 12); sfx("pickup"); }
            else if (e.type === "apple") { sparks(e.x, GROUND_Y - 30, "#4ade80", 6); addTxt(e.x, GROUND_Y - 58, "+30", "#4ade80", 12); sfx("apple"); }
            else if (e.type === "break") { shards(e.x, GROUND_Y - 46, "#94a3b8"); addTxt(e.x, GROUND_Y - 70, "BROKE", "#94a3b8", 11); sfx("break"); }
            else if (e.type === "gate") { gateAnim[e.idx] = 0; showBanner("BLOCK CLEAR", "GO - the gate is open"); sfx("gate"); }
            else if (e.type === "area") { showBanner("BLOCK " + (e.idx + 1), String(e.name).toUpperCase()); }
            else if (e.type === "ready") { addTxt(e.x, GROUND_Y - 100, "SPECIAL READY", "#22d3ee", 13); sfx("ready"); }
            else if (e.type === "jump") { dust(e.x, GROUND_Y); sfx("jump"); }
            else if (e.type === "land") dust(e.x, GROUND_Y);
            else if (e.type === "charge") { shake = Math.min(10, shake + 3); sfx("charge"); }
            else if (e.type === "bossStun") addTxt(e.x, GROUND_Y - 110, "PUNISH!", "#fbbf24", 14);
            else if (e.type === "sweep") { ring(e.x, e.y, "#f43f5e", 100); shake = Math.min(10, shake + 4); }
            else if (e.type === "throw") sfx("throw");
            else if (e.type === "rockland") dust(e.x, GROUND_Y);
            else if (e.type === "first") queueFirstBanners(e);
            else if (e.type === "win") { confetti(); sfx("win"); }
            else if (e.type === "lose") sfx("lose");
        }
    }

    /* ---------- run lifecycle ---------- */
    function newRun(keepCheats) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const prevCheats = keepCheats && state ? { ...state.cheats } : null;
        state = createInitialState(seed, online, [playerName, online ? "Partner" : "You"]);
        if (prevCheats) { state.cheats = prevCheats; state.cheated = true; }
        level = generateLevel(state.seed, state.coop);
        inputs[0] = { ...EMPTY_INPUT }; inputs[1] = { ...EMPTY_INPUT };
        latch.j[0] = latch.j[1] = latch.s[0] = latch.s[1] = false;
        parts = []; gateAnim = {}; bannerQ = [];
        strikeT.clear(); prevFoeState.clear();
        camX = 0; camSnap = true; shake = 0; hitstop = 0; hurtFlash = 0;
        saved = false; prevPhase = "ready";
        el.banner.classList.remove("show");
        el.areas.innerHTML = "<i></i>".repeat(level.areas.length);
    }
    function saveBest(V) {
        if (saved || V.cheated) return;
        saved = true;
        if (V.score > best) {
            best = V.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (err) { }
        }
    }
    function applyCheat(a) {
        state.cheated = true;
        if (a.op === "toggle" && Object.prototype.hasOwnProperty.call(state.cheats, a.key)) {
            state.cheats[a.key] = !!a.val;
            return;
        }
        const ev = [];
        if (a.op === "heal") {
            for (const p of state.players) { p.hp = p.maxHp; p.down = false; p.invuln = Math.max(p.invuln, 0.5); }
            ev.push({ type: "revive", x: state.players[0].x, i: 0 });
        } else if (a.op === "weapon") {
            state.players[0].weapon = mkWeapon("sword");
            ev.push({ type: "crate", x: state.players[0].x, w: "sword" });
        } else if (a.op === "score") state.score += 1000;
        else if (a.op === "clear") {
            for (const f of state.foes) if (f.area === state.areaIdx && f.hp > 0) killFoe(state, f, ev);
            state.foes = state.foes.filter((f) => f.hp > 0);
        } else if (a.op === "boss") {
            const li = level.areas.length - 1;
            for (let i = 0; i < li; i++) { state.cleared[i] = true; state.spawned[i] = true; }
            state.foes = state.foes.filter((f) => f.area === li);
            state.areaIdx = li;
            if (!state.spawned[li]) spawnArea(state, level, li, ev);
            for (const p of state.players) {
                if (!p.down) { p.x = level.areas[li].x0 + 70 + p.i * 40; p.y = GROUND_Y; p.vy = 0; }
            }
            camSnap = true;
        } else if (a.op === "reseed") newRun(true);
        handleEvents(ev);
    }

    /* ---------- template action plumbing ---------- */
    function applyAction(action, actor) {
        if (!action || typeof action !== "object" || !state) return;
        if (action.type === "input") {
            const idx = online ? actor : playerIndex;
            if (idx !== 0 && idx !== 1) return;
            const s = action.input || {};
            inputs[idx] = { l: !!s.l, r: !!s.r, j: !!s.j, a: !!s.a, s: !!s.s };
            if (s.j) latch.j[idx] = true;
            if (s.s) latch.s[idx] = true;
            if (online && actor === 1) lastGuestInput = performance.now();
            return;
        }
        if (action.type === "name") {
            if (online && actor === 1 && state.players[1]) state.players[1].name = String(action.name || "Partner").slice(0, 16);
            return;
        }
        if (actor !== 0) return; // host-only actions below
        if (action.type === "start" && state.phase === "ready") {
            const ev = [];
            beginRun(state, level, ev);
            handleEvents(ev);
            publish(true);
        } else if (action.type === "retry") {
            newRun(false);
            publish(true);
        } else if (action.type === "pause") {
            if (state.phase === "play") state.phase = "pause";
            else if (state.phase === "pause") state.phase = "play";
            publish(true);
        } else if (action.type === "cheat") {
            applyCheat(action);
            publish(true);
        }
    }
    function submitAction(action) {
        if (online && !isHost) {
            try { room.sendAction(action).catch(console.warn); } catch (err) { console.warn(err); }
            return;
        }
        applyAction(action, playerIndex);
    }
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const cb = event.target.closest("[data-cheat]");
        if (cb && !cb.disabled) {
            const key = cb.dataset.cheat;
            submitAction({ type: "cheat", op: "toggle", key: key, val: !(state && state.cheats[key]) });
            return;
        }
        const ca = event.target.closest("[data-cheatact]");
        if (ca && !ca.disabled) { submitAction({ type: "cheat", op: ca.dataset.cheatact }); return; }
        const b = event.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "start") {
            if (state && state.phase === "ready") { if (isHost) { sfx("start"); submitAction({ type: "start" }); } }
            else guideOpen = false;
        } else if (act === "retry") {
            if (isHost) { guideOpen = false; cheatOpen = false; submitAction({ type: "retry" }); }
        } else if (act === "resume") togglePause();
        else if (act === "pause") togglePause();
        else if (act === "help") { guideOpen = !guideOpen; cheatOpen = false; }
        else if (act === "cheat") { cheatOpen = !cheatOpen; guideOpen = false; }
        else if (act === "cheatClose") cheatOpen = false;
        else if (act === "mute") muted = !muted;
    }
    root.addEventListener("click", handleClick);

    /* ---------- networking ---------- */
    const unsubs = [];
    function sub(fn) { try { const u = fn(); if (typeof u === "function") unsubs.push(u); } catch (err) { console.warn(err); } }
    let snapA = null, snapB = null, tA = 0, tB = 0, lastPub = 0;
    function packState(S) {
        return {
            v: 2, seed: S.seed, coop: S.coop, phase: S.phase, t: S.t, world: S.world,
            players: S.players.map((p) => ({ i: p.i, name: p.name, side: p.side, x: p.x, y: p.y, vy: p.vy, dir: p.dir, hp: p.hp, maxHp: p.maxHp, down: p.down, combo: p.combo, weapon: p.weapon, atk: p.atk, walk: p.walk, moving: p.moving, hurtT: p.hurtT, invuln: p.invuln })),
            foes: S.foes.map((f) => ({ id: f.id, type: f.type, area: f.area, x: f.x, hp: f.hp, maxHp: f.maxHp, dir: f.dir, walk: f.walk, stun: f.stun, state: f.state, chargeDir: f.chargeDir })),
            rocks: S.rocks.map((r) => ({ id: r.id, x: r.x, y: r.y, vx: r.vx, vy: r.vy })),
            crates: S.crates.map((c) => ({ ...c })), apples: S.apples.map((a) => ({ ...a })),
            cleared: S.cleared.slice(), spawned: S.spawned.slice(),
            areaIdx: S.areaIdx, score: S.score, firstStrike: S.firstStrike,
            buffT: S.buffT, ambushT: S.ambushT, cheats: { ...S.cheats }, cheated: S.cheated,
        };
    }
    function publish(force) {
        // Only the host writes canonical state, throttled to ~10 Hz.
        if (!(online && isHost && state)) return;
        const now = performance.now();
        if (force || now - lastPub >= 100) {
            lastPub = now;
            try { room.publishState(packState(state)).catch(console.warn); } catch (err) { console.warn(err); }
        }
    }
    function diffEvents(A, B) {
        const ev = [];
        const cf = new Map(B.foes.map((f) => [f.id, f]));
        for (const f of A.foes) {
            const g = cf.get(f.id);
            if (!g) ev.push({ type: "ko", x: f.x, ft: f.type, score: FOE_TYPES[f.type].score });
            else if (g.hp < f.hp) ev.push({ type: "hit", x: (f.x + g.x) / 2, y: GROUND_Y - 46, dmg: f.hp - g.hp, kill: false, boss: f.type === "boss" });
        }
        for (let i = 0; i < Math.min(A.players.length, B.players.length); i++) {
            const a = A.players[i], b = B.players[i];
            if (b.hp < a.hp) ev.push({ type: "hurt", x: b.x, dmg: a.hp - b.hp, i: i });
            if (!a.down && b.down) ev.push({ type: "down", x: b.x, i: i });
            if (a.down && !b.down) ev.push({ type: "revive", x: b.x, i: i });
            if (a.combo < COMBO_NEED && b.combo >= COMBO_NEED) ev.push({ type: "ready", x: b.x });
            if ((!a.atk || a.atk.id !== "special") && b.atk && b.atk.id === "special") ev.push({ type: "special", x: b.x, y: b.y - 40 });
            if (a.weapon && !b.weapon) ev.push({ type: "break", x: b.x });
        }
        for (let i = 0; i < Math.min(A.crates.length, B.crates.length); i++) if (!A.crates[i].taken && B.crates[i].taken) ev.push({ type: "crate", x: B.crates[i].x, w: B.crates[i].w });
        for (let i = 0; i < Math.min(A.apples.length, B.apples.length); i++) if (!A.apples[i].taken && B.apples[i].taken) ev.push({ type: "apple", x: B.apples[i].x });
        for (let i = 0; i < Math.min(A.cleared.length, B.cleared.length); i++) if (!A.cleared[i] && B.cleared[i]) ev.push({ type: "gate", idx: i });
        for (let i = 0; i < Math.min(A.spawned.length, B.spawned.length); i++) if (!A.spawned[i] && B.spawned[i]) ev.push({ type: "area", idx: i, name: level.areas[i].name });
        if (A.phase === "ready" && B.phase === "play") ev.push({ type: "first", who: B.firstStrike, sides: B.players.map((p) => p.side) });
        if (A.phase !== "win" && B.phase === "win") ev.push({ type: "win", score: B.score });
        if (A.phase !== "lose" && B.phase === "lose") ev.push({ type: "lose", score: B.score });
        return ev;
    }
    function interpView(now) {
        if (!snapB) return null;
        if (!snapA) return snapB;
        const span = Math.max(0.02, tB - tA);
        const a = clamp((now - 0.12 - tA) / span, 0, 1.2);
        const A = snapA, B = snapB;
        const v = { ...B };
        v.players = B.players.map((p) => {
            const q = A.players.find((o) => o.i === p.i);
            if (!q) return p;
            const o = { ...p };
            o.x = lerp(q.x, p.x, a); o.y = lerp(q.y, p.y, a);
            o.walk = lerp(q.walk, p.walk, a); o.hp = lerp(q.hp, p.hp, a);
            if (q.atk && p.atk && q.atk.id === p.atk.id) o.atk = { ...p.atk, t: lerp(q.atk.t, p.atk.t, a) };
            return o;
        });
        v.foes = B.foes.map((f) => {
            const q = A.foes.find((o) => o.id === f.id);
            if (!q) return f;
            return { ...f, x: lerp(q.x, f.x, a), hp: lerp(q.hp, f.hp, a), walk: lerp(q.walk, f.walk, a) };
        });
        v.rocks = B.rocks.map((r) => {
            const q = A.rocks.find((o) => o.id === r.id);
            return q ? { ...r, x: lerp(q.x, r.x, a), y: lerp(q.y, r.y, a) } : r;
        });
        return v;
    }

    /* ---------- canvas rendering ---------- */
    const FONT = "ui-sans-serif,system-ui,sans-serif";
    let scale = 1;
    function resize() {
        const r = stage.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(320, r.width || 640);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(w * dpr * VIEW_H / VIEW_W);
        scale = canvas.width / VIEW_W;
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(stage); else window.addEventListener("resize", resize);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    skyGrad.addColorStop(0, "#0a0f24"); skyGrad.addColorStop(0.7, "#101c3d"); skyGrad.addColorStop(1, "#15223f");
    const vig = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.5, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
    vig.addColorStop(0, "rgba(4,8,18,0)"); vig.addColorStop(1, "rgba(4,8,18,0.5)");

    function seg(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    function limb(g, x, y, e, h) { g.beginPath(); g.moveTo(x, y); g.lineTo(e[0], e[1]); g.lineTo(h[0], h[1]); g.stroke(); }
    function drawFighter(g, o) {
        const s = o.scale || 1, d = o.dir || 1, x = o.x, y = o.y;
        const hip = y - 26 * s, neck = y - 52 * s, headC = y - 59 * s, hr = 7 * s;
        const atk = o.atk;
        const q = atk ? clamp(atk.t / atk.dur, 0, 1) : 0;
        const ext = atk ? Math.sin(q * Math.PI) : 0;
        const lean = atk ? d * 4 * s * ext : o.hurt ? -d * 5 * s : 0;
        const sx = x + lean;
        g.save();
        g.globalAlpha = o.alpha == null ? 1 : o.alpha;
        if (o.down) { g.translate(x, y); g.rotate(d * (o.downRot == null ? 1.45 : o.downRot)); g.translate(-x, -y); }
        if (!o.down) {
            g.fillStyle = "rgba(0,0,0,.35)";
            g.beginPath(); g.ellipse(x, GROUND_Y + 7, 12 * s, 3.5, 0, 0, 7); g.fill();
        }
        g.strokeStyle = o.color; g.lineWidth = 3 * s; g.lineCap = "round"; g.lineJoin = "round";
        g.beginPath(); g.arc(sx, headC, hr, 0, 7); g.stroke();
        seg(g, sx, neck, x, hip);
        const air = !!o.air;
        const sw = o.moving && !air ? Math.sin((o.walk || 0) * 11) * 7 * s : 0;
        const kick = atk && (atk.id === "kick" || atk.id === "air");
        let k1, f1, k2, f2;
        if (kick) {
            k1 = [x + d * (6 + 10 * ext) * s, hip + 8 * s];
            f1 = [x + d * (10 + 26 * ext) * s, hip + (air ? 10 : 4) * s - 4 * ext * s];
            k2 = [x - d * 5 * s, hip + 12 * s];
            f2 = [x - d * 7 * s, air ? hip + 20 * s : y];
        } else if (air) {
            k1 = [x + d * 7 * s, hip + 9 * s]; f1 = [x + d * 3 * s, hip + 18 * s];
            k2 = [x - d * 4 * s, hip + 10 * s]; f2 = [x - d * 8 * s, hip + 17 * s];
        } else {
            k1 = [x - 3 * s + sw * 0.5, hip + 13 * s]; f1 = [x - 6 * s + sw, y];
            k2 = [x + 3 * s - sw * 0.5, hip + 13 * s]; f2 = [x + 6 * s - sw, y];
        }
        limb(g, x, hip, k1, f1); limb(g, x, hip, k2, f2);
        const shx = sx, shy = neck + 4 * s;
        const punch = atk && (atk.id === "jab" || atk.id === "cross");
        let e1, h1, e2, h2;
        if (atk && atk.id === "special") {
            const ang = q * Math.PI * 4;
            h1 = [shx + Math.cos(ang) * 22 * s, shy + Math.sin(ang) * 10 * s];
            h2 = [shx - Math.cos(ang) * 22 * s, shy - Math.sin(ang) * 10 * s];
            e1 = [(shx + h1[0]) / 2, (shy + h1[1]) / 2];
            e2 = [(shx + h2[0]) / 2, (shy + h2[1]) / 2];
        } else if (punch) {
            h1 = [x + d * (8 + 22 * ext) * s, shy + 2 * s]; e1 = [x + d * (4 + 10 * ext) * s, shy + 5 * s];
            h2 = [x - d * 7 * s, shy + 10 * s]; e2 = [x - d * 9 * s, shy + 5 * s];
        } else if (o.wind) {
            const wob = Math.sin((o.t || 0) * 40) * 1.5 * s;
            h1 = [x + d * 7 * s + wob, neck - 13 * s]; e1 = [x + d * 9 * s, neck - 2 * s];
            h2 = [x - d * 8 * s, shy + 9 * s]; e2 = [x - d * 9 * s, shy + 4 * s];
        } else if (o.hurt) {
            h1 = [x - d * 12 * s, shy - 4 * s]; e1 = [x - d * 6 * s, shy + 2 * s];
            h2 = [x - d * 4 * s, shy + 10 * s]; e2 = [x - d * 8 * s, shy + 6 * s];
        } else {
            const asw = o.moving ? Math.sin((o.walk || 0) * 11 + Math.PI) * 5 * s : 0;
            h1 = [x + d * 8 * s + asw, shy + 11 * s]; e1 = [x + d * 5 * s + asw * 0.5, shy + 6 * s];
            h2 = [x - d * 6 * s - asw, shy + 11 * s]; e2 = [x - d * 4 * s - asw * 0.5, shy + 6 * s];
        }
        limb(g, shx, shy, e1, h1); limb(g, shx, shy, e2, h2);
        if (o.weapon) {
            const wl = o.weapon === "sword" ? 26 : o.weapon === "knife" ? 12 : 18;
            g.strokeStyle = o.weapon === "sword" || o.weapon === "knife" ? "#dbe4f0" : "#b9854f";
            g.lineWidth = 4 * s;
            const wa = punch ? -0.15 : -0.5;
            seg(g, h1[0], h1[1], h1[0] + d * wl * Math.cos(wa), h1[1] + wl * Math.sin(wa));
        }
        if (o.crown) {
            g.fillStyle = "#fde047";
            g.beginPath();
            g.moveTo(sx - 8 * s, headC - hr - 1);
            g.lineTo(sx - 6 * s, headC - hr - 8 * s);
            g.lineTo(sx - 2 * s, headC - hr - 3 * s);
            g.lineTo(sx, headC - hr - 9 * s);
            g.lineTo(sx + 2 * s, headC - hr - 3 * s);
            g.lineTo(sx + 6 * s, headC - hr - 8 * s);
            g.lineTo(sx + 8 * s, headC - hr - 1);
            g.closePath(); g.fill();
        }
        g.restore();
    }
    function bgLayer(par, step, color, hMin, hVar, win) {
        const off = camX * par;
        const k0 = Math.floor(off / step) - 1, k1 = Math.ceil((off + VIEW_W) / step) + 1;
        for (let k = k0; k <= k1; k++) {
            const bx = k * step - off;
            const bh = hMin + hash01(k * 3.7) * hVar;
            ctx.fillStyle = color;
            ctx.fillRect(bx, GROUND_Y - bh, step - 26, bh);
            if (win) {
                for (let wy = 0; wy < 4; wy++) {
                    for (let wx = 0; wx < 3; wx++) {
                        const h = hash01(k * 13.1 + wy * 3 + wx);
                        if (h < 0.45) continue;
                        const wyY = GROUND_Y - bh + 16 + wy * 30;
                        if (wyY + 14 > GROUND_Y - 6) continue;
                        ctx.fillStyle = h > 0.8 ? "rgba(251,191,36,.28)" : "rgba(46,66,110,.55)";
                        ctx.fillRect(bx + 16 + wx * 34, wyY, 12, 14);
                    }
                }
            }
        }
    }
    function drawScene(V, now, dt) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake * 0.6);
        ctx.fillStyle = skyGrad; ctx.fillRect(-14, -14, VIEW_W + 28, VIEW_H + 28);
        for (let i = 0; i < 64; i++) {
            const sx = ((hash01(i) * 2400 - camX * 0.05) % VIEW_W + VIEW_W) % VIEW_W;
            ctx.globalAlpha = 0.2 + 0.4 * Math.abs(Math.sin(now * 1.3 + i));
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(sx, hash01(i + 77) * 170, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
        const mx = VIEW_W - 150 - camX * 0.02;
        ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(mx, 72, 20, 0, 7); ctx.fill();
        ctx.fillStyle = "#0a0f24"; ctx.beginPath(); ctx.arc(mx - 8, 66, 17, 0, 7); ctx.fill();
        bgLayer(0.22, 150, "#0d1730", 90, 120, false);
        bgLayer(0.55, 190, "#121e3c", 120, 150, true);
        for (let k = Math.floor(camX / 320); k <= Math.ceil((camX + VIEW_W) / 320); k++) {
            const lx = k * 320 + 160 - camX;
            ctx.strokeStyle = "#22335c"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(lx, GROUND_Y); ctx.lineTo(lx, GROUND_Y - 118); ctx.lineTo(lx + 14, GROUND_Y - 118); ctx.stroke();
            ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(lx + 16, GROUND_Y - 116, 3.4, 0, 7); ctx.fill();
            const lg = ctx.createRadialGradient(lx + 16, GROUND_Y - 4, 4, lx + 16, GROUND_Y - 4, 80);
            lg.addColorStop(0, "rgba(251,191,36,.10)"); lg.addColorStop(1, "rgba(251,191,36,0)");
            ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx + 16, GROUND_Y - 4, 80, 0, 7); ctx.fill();
        }
        ctx.fillStyle = "#141f3a"; ctx.fillRect(-14, GROUND_Y, VIEW_W + 28, VIEW_H - GROUND_Y + 14);
        ctx.strokeStyle = "#2e4370"; ctx.lineWidth = 2; seg(ctx, -14, GROUND_Y, VIEW_W + 14, GROUND_Y);
        ctx.fillStyle = "#1d2c50";
        for (let k = Math.floor(camX / 90); k <= Math.ceil((camX + VIEW_W) / 90); k++) ctx.fillRect(k * 90 - camX, GROUND_Y + 26, 34, 3);
        /* gates */
        for (let i = 0; i < level.areas.length - 1; i++) {
            const gx = level.areas[i].x1 - 56 - camX;
            if (gx < -90 || gx > VIEW_W + 90) continue;
            const open = !!V.cleared[i];
            const anim = gateAnim[i] != null ? clamp(gateAnim[i] / 0.6, 0, 1) : open ? 1 : 0;
            const col = open ? "#34d399" : "#fb7185";
            ctx.fillStyle = "#1b2a4d"; ctx.strokeStyle = col; ctx.lineWidth = 2;
            ctx.fillRect(gx, GROUND_Y - 88, 8, 88); ctx.strokeRect(gx, GROUND_Y - 88, 8, 88);
            ctx.fillRect(gx + 46, GROUND_Y - 88, 8, 88); ctx.strokeRect(gx + 46, GROUND_Y - 88, 8, 88);
            for (let b = 0; b < 3; b++) {
                const alpha = open ? 1 - anim : 0.55 + 0.35 * Math.sin(now * 4 + b);
                if (alpha <= 0.01) continue;
                ctx.globalAlpha = alpha; ctx.fillStyle = col;
                ctx.fillRect(gx + 8, GROUND_Y - 70 + b * 24, 38, 4);
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = col; ctx.font = "800 9px " + FONT; ctx.textAlign = "center";
            ctx.fillText(open ? "OPEN" : "LOCKED", gx + 27, GROUND_Y - 96);
            if (open && i === V.areaIdx) {
                const px = gx + 66 + Math.sin(now * 5) * 4;
                ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(now * 5));
                ctx.fillStyle = "#34d399";
                for (let c = 0; c < 2; c++) {
                    ctx.beginPath();
                    ctx.moveTo(px + c * 14, GROUND_Y - 54);
                    ctx.lineTo(px + c * 14 + 10, GROUND_Y - 46);
                    ctx.lineTo(px + c * 14, GROUND_Y - 38);
                    ctx.closePath(); ctx.fill();
                }
                ctx.globalAlpha = 1;
            }
        }
        /* crates + apples */
        for (const c of V.crates) {
            if (c.taken) continue;
            const sx = c.x - camX;
            if (sx < -40 || sx > VIEW_W + 40) continue;
            ctx.fillStyle = "#3b2a18"; ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2;
            ctx.fillRect(sx - 15, GROUND_Y - 25, 30, 25); ctx.strokeRect(sx - 15, GROUND_Y - 25, 30, 25);
            seg(ctx, sx - 15, GROUND_Y - 25, sx + 15, GROUND_Y);
            ctx.fillStyle = "#d9b38c"; ctx.font = "800 10px " + FONT; ctx.textAlign = "center";
            ctx.fillText(WEAPONS[c.w].label[0], sx, GROUND_Y - 31);
        }
        for (const a of V.apples) {
            if (a.taken) continue;
            const sx = a.x - camX;
            if (sx < -30 || sx > VIEW_W + 30) continue;
            const bob = Math.sin(V.t * 3 + a.x * 0.05) * 2.5;
            ctx.fillStyle = "#ef4444"; ctx.strokeStyle = "#fca5a5"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sx, GROUND_Y - 13 + bob, 6.5, 0, 7); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2.5; seg(ctx, sx, GROUND_Y - 19 + bob, sx + 3, GROUND_Y - 24 + bob);
        }
        /* corpses */
        for (const p of parts) {
            if (p.kind !== "corpse") continue;
            const pr = p.t / p.life;
            const T = FOE_TYPES[p.ft];
            drawFighter(ctx, { x: p.x - camX, y: GROUND_Y, dir: p.dir, scale: T.scale, color: T.color, down: true, downRot: Math.min(1, pr * 3) * 1.45, alpha: Math.max(0, 1 - pr), walk: 0, moving: false, crown: p.ft === "boss" });
        }
        /* foes */
        for (const f of V.foes) {
            const ps = prevFoeState.get(f.id);
            if (ps === "wind" && f.state !== "wind") strikeT.set(f.id, 0.22);
            prevFoeState.set(f.id, f.state);
        }
        for (const f of V.foes) {
            const sx = f.x - camX;
            if (sx < -80 || sx > VIEW_W + 80) continue;
            const T = FOE_TYPES[f.type];
            const wind = f.state === "wind" || f.state === "tele" || f.state === "sweepWind";
            const st = strikeT.get(f.id);
            const fatk = st != null ? { id: "jab", t: 0.22 - st, dur: 0.22 } : null;
            drawFighter(ctx, {
                x: sx + (wind ? Math.sin(now * 40) * 1.4 : 0), y: GROUND_Y, dir: f.dir, walk: f.walk,
                moving: f.state === "charge" || (!wind && f.state !== "stun" && st == null),
                air: false, atk: fatk, scale: T.scale,
                color: f.stun > 0 ? "#fbbf24" : T.color, wind: wind, t: now, crown: f.type === "boss",
            });
            const bw = 26 * T.scale;
            ctx.fillStyle = "#334155"; ctx.fillRect(sx - bw / 2, GROUND_Y - 78 * T.scale, bw, 3);
            ctx.fillStyle = T.color; ctx.fillRect(sx - bw / 2, GROUND_Y - 78 * T.scale, bw * clamp(f.hp / f.maxHp, 0, 1), 3);
            if (wind) {
                ctx.fillStyle = f.type === "boss" ? "#f43f5e" : "#fbbf24";
                ctx.font = "900 15px " + FONT; ctx.textAlign = "center";
                ctx.fillText(f.type === "boss" ? "!!" : "!", sx, GROUND_Y - 92 * T.scale + Math.sin(now * 20) * 2);
                if (f.state === "tele") {
                    ctx.beginPath();
                    ctx.moveTo(sx + f.chargeDir * 26, GROUND_Y - 60);
                    ctx.lineTo(sx + f.chargeDir * 40, GROUND_Y - 52);
                    ctx.lineTo(sx + f.chargeDir * 26, GROUND_Y - 44);
                    ctx.closePath(); ctx.fill();
                }
            }
            if (f.type === "boss" && f.state === "stun") {
                ctx.fillStyle = "#fbbf24";
                for (let k = 0; k < 2; k++) {
                    const a = now * 6 + k * Math.PI;
                    ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 13, GROUND_Y - 96 * T.scale + Math.sin(a) * 4, 2.4, 0, 7); ctx.fill();
                }
            }
        }
        /* players */
        for (const p of V.players) {
            const sx = p.x - camX;
            if (sx < -80 || sx > VIEW_W + 80) continue;
            if (p.down) {
                drawFighter(ctx, { x: sx, y: GROUND_Y, dir: p.dir, scale: 1, color: "#64748b", down: true, alpha: 0.85, walk: 0, moving: false });
                ctx.fillStyle = "#94a3b8"; ctx.font = "700 9px " + FONT; ctx.textAlign = "center";
                ctx.fillText(V.coop ? "DOWN - clear block to revive" : "DOWN", sx, GROUND_Y - 34);
                continue;
            }
            const spReady = p.combo >= COMBO_NEED || V.cheats.infSp;
            if (spReady) {
                ctx.strokeStyle = P_COLORS[p.i];
                ctx.globalAlpha = 0.45 + 0.25 * Math.sin(now * 6);
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.ellipse(sx, GROUND_Y + 6, 16 + 2 * Math.sin(now * 6), 5, 0, 0, 7); ctx.stroke();
                ctx.globalAlpha = 1;
            }
            const blink = p.invuln > 0 && p.hurtT <= 0 ? 0.55 + 0.35 * Math.sin(now * 30) : 1;
            drawFighter(ctx, {
                x: sx, y: p.y, dir: p.dir, walk: p.walk, moving: p.moving,
                air: p.y < GROUND_Y - 1, atk: p.atk, hurt: p.hurtT > 0, scale: 1,
                color: p.hurtT > 0 ? "#f8fafc" : P_COLORS[p.i],
                weapon: p.weapon ? p.weapon.key : null, alpha: blink, t: now,
            });
            if (V.coop) {
                ctx.fillStyle = P_COLORS[p.i]; ctx.font = "700 9px " + FONT; ctx.textAlign = "center";
                ctx.fillText(p.name, sx, p.y - 78);
            }
        }
        /* rocks */
        for (const r of V.rocks) {
            const sx = r.x - camX;
            if (sx < -30 || sx > VIEW_W + 30) continue;
            ctx.globalAlpha = 0.3; ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 2;
            seg(ctx, sx - r.vx * 0.03, r.y - r.vy * 0.03, sx, r.y);
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#a8a29e"; ctx.strokeStyle = "#78716c"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sx, r.y, 5, 0, 7); ctx.fill(); ctx.stroke();
        }
        /* particles */
        for (const p of parts) {
            const pr = clamp(p.t / p.life, 0, 1);
            const sx = p.x - camX;
            if (p.kind === "spark") {
                ctx.globalAlpha = 1 - pr; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
                const n = Math.hypot(p.vx, p.vy) || 1;
                seg(ctx, sx, p.y, sx + (p.vx / n) * 7, p.y + (p.vy / n) * 7);
            } else if (p.kind === "dust") {
                ctx.globalAlpha = 0.3 * (1 - pr); ctx.fillStyle = "#94a3b8";
                ctx.beginPath(); ctx.arc(sx, p.y, p.r * (1 + pr), 0, 7); ctx.fill();
            } else if (p.kind === "shard" || p.kind === "confetti") {
                ctx.globalAlpha = 1 - pr; ctx.fillStyle = p.color;
                ctx.save(); ctx.translate(sx, p.y); ctx.rotate(p.rot);
                ctx.fillRect(-3, -2, 6, 4); ctx.restore();
            } else if (p.kind === "ring") {
                const e = 1 - (1 - pr) * (1 - pr);
                ctx.globalAlpha = 1 - pr; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(sx, p.y, lerp(10, p.r1, e), 0, 7); ctx.stroke();
            } else if (p.kind === "txt") {
                ctx.globalAlpha = 1 - pr; ctx.fillStyle = p.color;
                ctx.font = "800 " + p.size + "px " + FONT; ctx.textAlign = "center";
                ctx.fillText(p.txt, sx, p.y - pr * 30);
            }
            ctx.globalAlpha = 1;
        }
        /* boss bar */
        const boss = V.foes.find((f) => f.type === "boss");
        if (boss && Math.abs(boss.x - camX - VIEW_W / 2) < VIEW_W) {
            const bx = (VIEW_W - 320) / 2;
            ctx.fillStyle = "#fda4af"; ctx.font = "800 10px " + FONT; ctx.textAlign = "center";
            ctx.fillText("K I N G P I N", VIEW_W / 2, 16);
            ctx.fillStyle = "#3f1d2b"; ctx.fillRect(bx, 22, 320, 7);
            ctx.fillStyle = "#f43f5e"; ctx.fillRect(bx, 22, 320 * clamp(boss.hp / boss.maxHp, 0, 1), 7);
            ctx.strokeStyle = "#6b2440"; ctx.lineWidth = 1; ctx.strokeRect(bx, 22, 320, 7);
        }
        if (hurtFlash > 0) {
            ctx.fillStyle = "rgba(244,63,94," + (hurtFlash * 0.9).toFixed(3) + ")";
            ctx.fillRect(-14, -14, VIEW_W + 28, VIEW_H + 28);
        }
        ctx.fillStyle = vig; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    function drawWaiting(now) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = "#0a0f24"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.fillStyle = "#8fa3c8"; ctx.font = "700 14px " + FONT; ctx.textAlign = "center";
        ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now * 2));
        ctx.fillText("Connecting to room...", VIEW_W / 2, VIEW_H / 2);
        ctx.globalAlpha = 1;
    }
    function updateCamera(V, dt) {
        const ps = V.players.filter((p) => !p.down);
        const focus = ps.length ? ps.reduce((s, p) => s + p.x, 0) / ps.length : V.players[0].x;
        const lead = ps.length ? ps[0].dir : 1;
        const target = clamp(focus - VIEW_W * 0.45 + lead * 40, 0, V.world - VIEW_W);
        if (camSnap || Math.abs(target - camX) > 900) { camX = target; camSnap = false; }
        else camX += (target - camX) * Math.min(1, dt * 6);
    }

    /* ---------- HUD / overlay sync ---------- */
    function txt(node, v) { v = String(v); if (node.textContent !== v) node.textContent = v; }
    function syncUi(V, now) {
        const me = V.players[playerIndex] || V.players[0];
        const pct = Math.max(0, Math.round((me.hp / me.maxHp) * 100));
        const w = pct + "%";
        if (el.hpfill.style.width !== w) {
            el.hpfill.style.width = w;
            el.hpfill.style.background = pct > 60 ? "var(--acc)" : pct > 30 ? "var(--warn)" : "var(--bad)";
        }
        txt(el.hp, Math.max(0, Math.ceil(me.hp)));
        el.allychip.hidden = !V.coop;
        if (V.coop) { const ally = V.players.find((p) => p.i !== me.i); if (ally) txt(el.allyhp, Math.max(0, Math.ceil(ally.hp))); }
        const combo = Math.min(COMBO_NEED, me.combo);
        const pips = el.pips.children;
        for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("on", i < combo);
        const spReady = me.combo >= COMBO_NEED || V.cheats.infSp;
        el.pips.classList.toggle("ready", spReady);
        el.spBtn.classList.toggle("ready", spReady);
        el.wpnchip.hidden = !me.weapon;
        if (me.weapon) txt(el.wpn, me.weapon.label + " x" + me.weapon.dur);
        if (el.areas.childElementCount !== V.cleared.length) el.areas.innerHTML = "<i></i>".repeat(V.cleared.length);
        const dots = el.areas.children;
        for (let i = 0; i < dots.length; i++) {
            dots[i].classList.toggle("done", !!V.cleared[i]);
            dots[i].classList.toggle("cur", i === V.areaIdx);
        }
        txt(el.score, V.score); txt(el.best, best);
        const modeLbl = online ? (isHost ? "CO-OP HOST" : "CO-OP") : "VS BOTS";
        const phLbl = V.phase === "play" ? "FIGHT" : V.phase === "ready" ? "READY" : V.phase === "pause" ? "PAUSED" : V.phase === "win" ? "CLEAR!" : "K.O.";
        txt(el.status, modeLbl + " \u00b7 " + phLbl);
        el.ovGuide.hidden = !(V.phase === "ready" || guideOpen);
        el.ovCheat.hidden = !cheatOpen;
        el.ovPause.hidden = V.phase !== "pause";
        el.ovEnd.hidden = !(V.phase === "win" || V.phase === "lose");
        if (V.phase === "ready") {
            txt(el.guidebtn, isHost ? "START" : "WAITING FOR HOST");
            el.guidebtn.disabled = !isHost;
            txt(el.firstnote, "Coin toss: " + (V.firstStrike === "players" ? "you strike first (+25% dmg, 3s)." : "the gang ambushes you - defend!") +
                (V.coop ? " Spawn sides: P1 " + (V.players[0].side === 0 ? "left" : "right") + ", P2 " + (V.players[1].side === 0 ? "left" : "right") + "." : ""));
        } else { txt(el.guidebtn, "CLOSE"); el.guidebtn.disabled = false; }
        retryBtns.forEach((b) => { b.hidden = !isHost; });
        cheatBtns.forEach((b) => { b.disabled = !isHost; b.classList.toggle("on", !!V.cheats[b.dataset.cheat]); });
        cheatActBtns.forEach((b) => { b.disabled = !isHost; });
        txt(el.cheatnote, !isHost ? "Host only in co-op." : V.cheated ? "Cheats active." : "");
        el.muteBtn.classList.toggle("off", muted);
        el.pauseBtn.disabled = !isHost;
        if (V.phase !== prevPhase) {
            if (V.phase === "win" || V.phase === "lose") {
                saveBest(V);
                el.endtitle.textContent = V.phase === "win" ? "KINGPIN DETHRONED" : "KNOCKED OUT";
                el.endtitle.className = "sb-endtitle " + (V.phase === "win" ? "win" : "lose");
                txt(el.endmsg, V.phase === "win" ? "The Kingpin is down. The street is yours." : "The gang dropped you in block " + (V.areaIdx + 1) + ". Apples and specials help a lot.");
                txt(el.endscore, V.score); txt(el.endbest, best);
                txt(el.endnote, V.cheated ? "(cheats used - not saved)" : "");
            }
            prevPhase = V.phase;
        }
    }

    /* ---------- main loop ---------- */
    let raf = 0, last = 0;
    function frame(ts) {
        raf = requestAnimationFrame(frame);
        const now = ts / 1000;
        if (!last) last = now;
        const dt = Math.min(0.05, Math.max(0, now - last));
        last = now;
        while (bannerQ.length && bannerQ[0].at <= now) { const b = bannerQ.shift(); showBanner(b.title, b.sub); }
        shake = Math.max(0, shake - dt * 22);
        hurtFlash = Math.max(0, hurtFlash - dt);
        for (const k in gateAnim) gateAnim[k] += dt;
        updateParts(dt);
        pushInput(now);
        const overlayPause = !online && (guideOpen || cheatOpen) && state && state.phase === "play";
        if (state && isHost && state.phase === "play" && !overlayPause) {
            if (hitstop > 0) hitstop -= dt;
            else {
                const eff = [{ ...inputs[0] }, { ...inputs[1] }];
                for (let i = 0; i < 2; i++) { eff[i].j = eff[i].j || latch.j[i]; eff[i].s = eff[i].s || latch.s[i]; }
                latch.j[0] = latch.j[1] = latch.s[0] = latch.s[1] = false;
                const ev = [];
                stepSim(state, level, eff, dt, ev);
                handleEvents(ev);
                if (online && performance.now() - lastGuestInput > 5000) inputs[1] = { ...EMPTY_INPUT };
            }
        }
        const V = online && !isHost ? interpView(now) : state;
        if (V && level) { updateCamera(V, dt); drawScene(V, now, dt); syncUi(V, now); }
        else drawWaiting(now);
        publish(false);
    }

    /* ---------- init (template online / offline branches) ---------- */
    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; }));
        if (isHost) {
            newRun(false);            // initial serializable state
            publish(true);
            sub(() => room.onAction((action) => applyAction(action, 1)));
        } else {
            sub(() => room.onState((nextState) => {
                if (!nextState || !nextState.players) return;
                const now = performance.now() / 1000;
                if (!level || level.seed !== nextState.seed) {
                    level = generateLevel(nextState.seed, nextState.coop);
                    camX = 0; camSnap = true; parts = []; gateAnim = {}; bannerQ = [];
                    strikeT.clear(); prevFoeState.clear();
                    saved = false; prevPhase = "ready";
                    snapA = null; snapB = null;
                }
                if (snapB) handleEvents(diffEvents(snapB, nextState));
                snapA = snapB; tA = tB; snapB = nextState; tB = now;
                state = nextState;
            }));
            submitAction({ type: "name", name: playerName });
        }
    } else {
        newRun(false);              // local state + bot gang, no room needed
    }
    resize();
    raf = requestAnimationFrame(frame);

    /* ---------- teardown ---------- */
    function destroy() {
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pointerup", onCanvasUp);
        window.removeEventListener("resize", resize);
        root.removeEventListener("click", handleClick);
        canvas.removeEventListener("pointerdown", onCanvasDown);
        stage.removeEventListener("contextmenu", preventCtx);
        tbtns.forEach((b) => {
            b.removeEventListener("pointerdown", onTDown);
            b.removeEventListener("pointerup", onTUp);
            b.removeEventListener("pointercancel", onTUp);
            b.removeEventListener("lostpointercapture", onTUp);
        });
        if (ro) ro.disconnect();
        unsubs.forEach((u) => { try { u(); } catch (err) { } });
        if (actx) { try { actx.close(); } catch (err) { } }
    }
    return { destroy };
}