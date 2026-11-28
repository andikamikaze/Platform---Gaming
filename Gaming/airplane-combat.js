/* ============================================================
   games/airplane-combat.js  —  SKY ARCADE
   2D side-scrolling air combat (arcade, endless generated waves).
   Template module:  export function mount(root, context)
   Register metadata + path in GAMES inside app.js.
   ============================================================ */

import { iconSVG } from "../JS/icons.js";
import { createGameShell } from "../JS/game-ui.js";

const W = 960, H = 540, GROUND = 470;
const BOUND = { x0: 30, x1: W - 46, y0: 42, y1: GROUND - 26 };
const SLOTS = [{ x: 252, y: 300 }, { x: 152, y: 186 }];

export const META = {
    id: "airplane-combat",
    name: "Airplane Combat",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Side-scrolling air combat with generated arcade waves.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 24h29l7-4v8l-7-4"/><path d="M26 24L14 12m12 12L14 36"/><path d="M34 24l6-8"/><path d="M8 24l-3-5h6l3 5-3 5H5z"/><circle cx="24" cy="21" r="2.5" fill="#fde047" stroke="none"/></svg>',
    bg: ["#bae6fd", "#6366f1"],
    bestKey: "sky-arcade-best",
};

const THEMES = [
    { sky: "#f8fafc", far: "#e2e8f0", near: "#cbd5e1", ground: "#f1f5f9", edge: "#cbd5e1", accent: "#4f46e5", star: 0 },
    { sky: "#faf8ff", far: "#e9e2f5", near: "#d5c9ea", ground: "#f1edf8", edge: "#d5c9ea", accent: "#7c3aed", star: 0 },
    { sky: "#f6faf8", far: "#dceee7", near: "#c3e2d7", ground: "#ebf5f1", edge: "#c3e2d7", accent: "#0f766e", star: 0 },
    { sky: "#faf8f6", far: "#f0e4dd", near: "#e2cfc5", ground: "#f5eeea", edge: "#e2cfc5", accent: "#b45309", star: 0 },
];

const AIRCRAFT = {
    interceptor: { label: "Interceptor", hp: 70, armor: 1, spd: 340, gun: 5, rate: 0.075, special: "missile", ammo: 8, sDmg: 32, sCd: 0.55, glyph: "jet" },
    fighter: { label: "Fighter", hp: 95, armor: 3, spd: 285, gun: 6, rate: 0.100, special: "missile", ammo: 6, sDmg: 42, sCd: 0.80, glyph: "jet" },
    striker: { label: "Striker", hp: 120, armor: 5, spd: 240, gun: 7, rate: 0.120, special: "bomb", ammo: 8, sDmg: 48, sCd: 0.70, glyph: "attack" },
    heli: { label: "Helicopter", hp: 110, armor: 4, spd: 205, gun: 6, rate: 0.090, special: "rocket", ammo: 14, sDmg: 20, sCd: 0.24, glyph: "heli" },
    bomber: { label: "Bomber", hp: 165, armor: 7, spd: 180, gun: 5, rate: 0.180, special: "bigbomb", ammo: 10, sDmg: 62, sCd: 1.00, glyph: "bomber", twin: true },
    uav: { label: "UAV", hp: 60, armor: 1, spd: 360, gun: 4, rate: 0.060, special: "seeker", ammo: 10, sDmg: 24, sCd: 0.50, glyph: "uav" },
    gunship: { label: "Gunship", hp: 200, armor: 9, spd: 155, gun: 9, rate: 0.160, special: "carpet", ammo: 8, sDmg: 44, sCd: 1.10, glyph: "bomber", twin: true },
};
const CRAFTS = Object.keys(AIRCRAFT);

const ENEMY = {
    dart: { air: 1, hp: 20, spd: 270, dmg: 4, score: 60, r: 14, col: "#db2777" },
    wing: { air: 1, hp: 44, spd: 195, dmg: 5, score: 90, r: 16, col: "#dc2626" },
    gunship: { air: 1, hp: 125, spd: 100, dmg: 6, score: 190, r: 22, col: "#b45309" },
    drone: { air: 1, hp: 12, spd: 255, dmg: 9, score: 45, r: 12, col: "#7c3aed", ram: 1 },
    seeker: { air: 1, hp: 30, spd: 220, dmg: 13, score: 120, r: 15, col: "#e11d48", ram: 1 },
    ace: { air: 1, hp: 520, spd: 150, dmg: 8, score: 1500, r: 34, col: "#a21caf", boss: 1 },
    flak: { air: 0, hp: 46, spd: 0, dmg: 8, score: 90, r: 18, col: "#a16207" },
    tank: { air: 0, hp: 76, spd: 0, dmg: 12, score: 130, r: 20, col: "#4d7c0f" },
    sam: { air: 0, hp: 58, spd: 0, dmg: 14, score: 160, r: 18, col: "#0284c7" },
    core: { air: 0, hp: 430, spd: 0, dmg: 0, score: 700, r: 42, col: "#475569" },
};

const CHEAT_TOGGLES = [
    { key: "god", label: "Invincible" },
    { key: "ammo", label: "Infinite ammo" },
    { key: "rapid", label: "Rapid fire" },
    { key: "oneshot", label: "One-shot kill" },
    { key: "slow", label: "Slow enemies" },
    { key: "magnet", label: "Pickup magnet" },
];
const CHEAT_ACTIONS = [
    { key: "heal", label: "Repair hull" },
    { key: "refill", label: "Refill ordnance" },
    { key: "score", label: "+2500 score" },
    { key: "clear", label: "Clear wave" },
];

/* ---------------- pure helpers ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
function effDamage(dmg, armor) {
    const d = num(dmg, 0);
    if (d <= 0) return 0;
    return Math.max(1, Math.round((d * 10) / (10 + Math.max(0, num(armor, 0)))));
}
function rndOf(s) {
    s.rs = (s.rs + 0x6d2b79f5) | 0;
    let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rr(s, a, b) { return a + rndOf(s) * (b - a); }
function shuffle(arr, s) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rndOf(s) * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}
function foeCY(f) { return ENEMY[f.kind].air ? f.y : GROUND - (f.kind === "core" ? 26 : 14); }

/* ---------------- generated, always-completable wave ---------------- */
function levelPlan(level, seed) {
    const L = Math.max(1, Math.round(num(level, 1)));
    const r = rng((seed ^ (L * 0x9e3779b1)) >>> 0);
    const pool = ["dart", "wing"];
    if (L >= 2) pool.push("drone");
    if (L >= 3) pool.push("gunship");
    if (L >= 4) pool.push("seeker");
    if (L >= 6) pool.push("dart", "seeker");
    const airCount = Math.min(24, 4 + Math.round(L * 1.6));
    const air = [];
    let t = 0.8;
    for (let i = 0; i < airCount; i++) {
        const kind = pool[Math.floor(r() * pool.length)];
        air.push({ t: Math.round(t * 100) / 100, kind });
        t += (kind === "gunship" ? 2.4 : 1.0) + r() * 1.5;
    }
    const boss = L % 5 === 0;
    if (boss) air.push({ t: Math.round(t * 0.5 * 100) / 100, kind: "ace" });
    air.sort((a, b) => a.t - b.t);
    const ground = [];
    if (L >= 2) {
        const gp = ["flak", "tank"];
        if (L >= 3) gp.push("sam");
        const gc = Math.min(7, 1 + Math.floor(L * 0.6));
        for (let i = 0; i < gc; i++) {
            ground.push({ kind: gp[Math.floor(r() * gp.length)], x: Math.round(560 + i * 165 + r() * 90) });
        }
    }
    if (L % 4 === 0) ground.push({ kind: "core", x: 1240 });
    return {
        air, ground, boss,
        theme: Math.floor(r() * THEMES.length),
        total: air.length + ground.length,
        speed: 88 + Math.min(L, 12) * 4,
        hpScale: 1 + Math.min(L, 14) * 0.05,
        dmgScale: 1 + Math.min(L, 12) * 0.035,
    };
}

/* ---------------- state ---------------- */
function makePlayer(i, o) {
    const key = AIRCRAFT[o && o.veh] ? o.veh : "fighter";
    const a = AIRCRAFT[key];
    return {
        i, name: (o && o.name) || "P" + (i + 1), veh: key, ready: false, alive: true,
        x: 70 + i * 58, y: GROUND - 12, vx: 0, vy: 0, tilt: 0, spin: 0,
        hp: a.hp, maxHp: a.hp, ammo: a.ammo, maxAmmo: a.ammo,
        gunCd: 0, spCd: 0, flash: 0, score: 0, kills: 0, respawn: 0, delay: 0,
    };
}
function makeState(opts) {
    const seed = ((opts && opts.seed) >>> 0) || 1;
    const list = (opts && opts.players) || [{ name: "Player", veh: "fighter" }];
    const s = {
        v: 1, phase: "select", paused: false, t: 0, level: 1, seed, rs: seed | 0,
        scroll: 0, speed: 90, takeoff: 0, takeoffMode: "runway", grace: 0, spawnT: 0,
        first: 0, slots: [], order: [],
        players: list.map((p, i) => makePlayer(i, p)),
        plan: [], foes: [], shots: [], eshots: [], specials: [], pickups: [], fx: [],
        left: 0, total: 0, kills: 0, combo: 1, comboT: 0, score: 0, bonus: 0,
        best: num(opts && opts.best, 0), theme: 0, nextId: 1,
        hpScale: 1, dmgScale: 1, boss: false,
        cheats: { god: false, ammo: false, rapid: false, oneshot: false, slow: false, magnet: false },
    };
    /* randomness: who launches first (vs bot) + random player slots / takeoff order */
    s.first = rndOf(s) < 0.5 ? 0 : 1;
    const idx = s.players.map((p) => p.i);
    s.slots = shuffle(idx.slice(), s);
    s.order = shuffle(idx.slice(), s);
    return s;
}
function setVehicle(s, i, key) {
    const p = s.players[i];
    if (!p || !AIRCRAFT[key]) return;
    const a = AIRCRAFT[key];
    p.veh = key; p.maxHp = a.hp; p.hp = a.hp; p.maxAmmo = a.ammo; p.ammo = a.ammo;
}
function startLevel(s, level, runway) {
    const L = Math.max(1, Math.round(num(level, 1)));
    const plan = levelPlan(L, s.seed);
    s.level = L;
    s.plan = plan.air.map((a) => ({ t: a.t, kind: a.kind }));
    s.foes = []; s.shots = []; s.eshots = []; s.specials = []; s.pickups = []; s.fx = [];
    s.spawnT = 0; s.theme = plan.theme; s.total = plan.total; s.kills = 0;
    s.combo = 1; s.comboT = 0; s.bonus = 0; s.boss = plan.boss;
    s.speed = plan.speed; s.hpScale = plan.hpScale; s.dmgScale = plan.dmgScale;
    s.takeoff = 0; s.takeoffMode = runway ? "runway" : "ingress";
    s.phase = "takeoff"; s.paused = false;
    s.grace = s.first === 0 ? 2.4 : 0;
    for (const g of plan.ground) spawnGround(s, g.kind, g.x);
    for (const p of s.players) {
        const a = AIRCRAFT[p.veh];
        p.maxHp = a.hp; p.maxAmmo = a.ammo; p.ammo = a.ammo;
        p.hp = L === 1 ? a.hp : clamp(p.hp + a.hp * 0.35, a.hp * 0.4, a.hp);
        p.alive = true; p.respawn = 0; p.gunCd = 0; p.spCd = 0; p.flash = 0;
        p.delay = Math.max(0, s.order.indexOf(p.i)) * 0.7;
        p.x = 70; p.y = GROUND - 12; p.vx = 0; p.vy = 0; p.tilt = 0;
    }
    /* bot won the coin flip -> its squadron is already airborne during takeoff */
    if (s.first === 1) {
        for (let i = 0; i < 2 && s.plan.length; i++) spawnAir(s, s.plan.shift().kind);
    }
    s.left = s.plan.length + s.foes.length;
    return s;
}

/* ---------------- spawning ---------------- */
function spawnAir(s, kind) {
    const d = ENEMY[kind];
    if (!d || !d.air) return null;
    const hp = Math.round(d.hp * s.hpScale);
    const f = {
        id: s.nextId++, kind, x: W + 50 + rr(s, 0, 90), y: rr(s, 80, GROUND - 130),
        base: 0, vx: -d.spd, vy: 0, hp, maxHp: hp, t: rr(s, 0, 6), cd: rr(s, 0.8, 2.2),
        hit: 0, burst: 0, bt: 0, ph: 0, spawnLeft: kind === "ace" ? 6 : 0, dead: false,
    };
    f.base = f.y;
    if (kind === "ace") { f.x = W + 90; f.y = 210; f.base = 210; f.cd = 2.2; }
    s.foes.push(f);
    return f;
}
function spawnGround(s, kind, x) {
    const d = ENEMY[kind];
    if (!d || d.air) return null;
    const hp = Math.round(d.hp * s.hpScale);
    const f = {
        id: s.nextId++, kind, x: num(x, W + 80), y: GROUND, base: GROUND,
        vx: -s.speed, vy: 0, hp, maxHp: hp, t: rr(s, 0, 6), cd: rr(s, 1.2, 3),
        hit: 0, burst: 0, bt: 0, ph: 0, spawnLeft: kind === "core" ? 4 : 0, dead: false,
    };
    s.foes.push(f);
    return f;
}
function targetPlayer(s, x, y) {
    let best = null, bd = Infinity;
    for (const p of s.players) {
        if (!p.alive) continue;
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bd) { bd = d; best = p; }
    }
    return best;
}
function nearestAir(s, x, y) {
    let best = null, bd = Infinity;
    for (const f of s.foes) {
        if (f.dead || !ENEMY[f.kind].air) continue;
        const d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y);
        if (d < bd) { bd = d; best = f; }
    }
    return best;
}
function foeById(s, id) {
    if (!id) return null;
    for (const f of s.foes) if (f.id === id && !f.dead) return f;
    return null;
}

/* ---------------- fx / score ---------------- */
function addFx(s, x, y, kind, col, life, r0, txt) {
    if (s.fx.length > 26) s.fx.shift();
    s.fx.push({ x, y, kind, c: col, t: 0, life: num(life, 0.45), r0: num(r0, 8), txt: txt || "" });
}
function stepFx(s, dt) {
    for (const f of s.fx) f.t += dt;
    s.fx = s.fx.filter((f) => f.t < f.life);
}
function dropPickup(s, x, y) {
    const r = rndOf(s);
    const kind = r < 0.4 ? "hp" : r < 0.8 ? "ammo" : "gem";
    s.pickups.push({ kind, x, y, vx: -s.speed * 0.55, vy: 0, t: 0, life: 13 });
}
function killFoe(s, f, own) {
    if (f.dead) return;
    f.dead = true;
    const d = ENEMY[f.kind];
    s.kills++;
    s.combo = Math.min(8, s.combo + 1);
    s.comboT = 2.6;
    const gain = Math.round(d.score * (1 + (s.combo - 1) * 0.2));
    s.score += gain;
    const p = s.players[own];
    if (p) { p.score += gain; p.kills++; }
    addFx(s, f.x, foeCY(f), "ring", d.col, d.boss ? 0.9 : 0.45, d.r);
    addFx(s, f.x, foeCY(f) - 20, "text", "#334155", 0.8, 0, "+" + gain);
    if (rndOf(s) < 0.15) dropPickup(s, f.x, foeCY(f));
}
function hurtFoe(s, f, dmg, armor, own) {
    if (f.dead) return;
    f.hp -= effDamage(dmg, armor);
    f.hit = 0.12;
    if (f.hp <= 0) killFoe(s, f, own);
}
function hurtPlayer(s, p, dmg) {
    if (!p.alive || s.cheats.god) return;
    p.hp -= effDamage(dmg, AIRCRAFT[p.veh].armor);
    p.flash = 0.28;
    addFx(s, p.x, p.y, "ring", "#ef4444", 0.35, 10);
    if (p.hp <= 0) {
        p.hp = 0; p.alive = false; p.respawn = 5;
        addFx(s, p.x, p.y, "ring", "#f97316", 0.8, 26);
    }
}

/* ---------------- weapons ---------------- */
function fireGun(s, p) {
    const a = AIRCRAFT[p.veh], c = s.cheats;
    const dmg = a.gun * (c.oneshot ? 60 : 1);
    const offs = a.twin ? [-6, 6] : [0];
    for (const oy of offs) {
        s.shots.push({ x: p.x + 20, y: p.y + oy, vx: 680, vy: 0, dmg, own: p.i, dead: false });
    }
    p.gunCd = a.rate / (c.rapid ? 3 : 1);
    addFx(s, p.x + 24, p.y, "muzzle", "#f59e0b", 0.1, 3);
}
function fireSpecial(s, p) {
    const a = AIRCRAFT[p.veh], c = s.cheats;
    if (!c.ammo && p.ammo <= 0) return;
    const dmg = a.sDmg * (c.oneshot ? 60 : 1);
    const k = a.special;
    if (k === "missile" || k === "seeker") {
        const n = k === "seeker" ? 2 : 1;
        for (let i = 0; i < n; i++) {
            const tgt = nearestAir(s, p.x, p.y);
            s.specials.push({
                kind: "missile", x: p.x + 10, y: p.y + (n > 1 ? (i ? 9 : -9) : 0),
                vx: 300, vy: n > 1 ? (i ? 70 : -70) : 0, spd: 400, turn: 4.4,
                target: tgt ? tgt.id : 0, dmg, own: p.i, life: 6, dead: false,
            });
        }
    } else if (k === "rocket") {
        s.specials.push({ kind: "rocket", x: p.x + 18, y: p.y, vx: 540, vy: 0, dmg, own: p.i, life: 3, dead: false });
    } else {
        const n = k === "carpet" ? 3 : 1;
        const big = k === "bigbomb";
        for (let i = 0; i < n; i++) {
            s.specials.push({
                kind: "bomb", x: p.x - i * 14, y: p.y + 9, vx: 90 + p.vx * 0.35 - i * 20, vy: 30,
                grav: 300, dmg, radius: big ? 92 : k === "carpet" ? 58 : 64, own: p.i, life: 8, dead: false,
            });
        }
    }
    if (!c.ammo) p.ammo--;
    p.spCd = a.sCd / (c.rapid ? 1.8 : 1);
}
function eShoot(s, x, y, tx, ty, dmg, spd, kind) {
    const dx = tx - x, dy = ty - y, n = Math.hypot(dx, dy) || 1;
    s.eshots.push({ x, y, vx: (dx / n) * spd, vy: (dy / n) * spd, dmg, kind: kind || "bullet", grav: 0, turn: 0, target: -1, life: 6, dead: false });
}
function shellShot(s, f, p, dmg) {
    const x = f.x - 18, y = GROUND - 20;
    const dx = p.x - x, dy = p.y - y, g = 260;
    const tt = Math.max(0.5, Math.abs(dx) / 260);
    s.eshots.push({ x, y, vx: dx / tt, vy: dy / tt - 0.5 * g * tt, dmg, kind: "shell", grav: g, turn: 0, target: -1, life: 6, dead: false });
}
function samShot(s, f, p, dmg) {
    s.eshots.push({ x: f.x, y: GROUND - 26, vx: -40, vy: -210, dmg, kind: "sam", grav: 0, turn: 2.1, target: p.i, spd: 235, life: 6.5, dead: false });
    addFx(s, f.x, GROUND - 26, "muzzle", "#0284c7", 0.2, 5);
}
function groundBoom(s, x, dmg, radius, own) {
    addFx(s, x, GROUND - 10, "ring", "#f97316", 0.55, radius * 0.5);
    for (const f of s.foes) {
        if (f.dead) continue;
        const d = ENEMY[f.kind];
        const cy = foeCY(f);
        const rr2 = radius + (d.air ? 0 : d.r);
        if (Math.abs(f.x - x) < rr2 && Math.abs(cy - (GROUND - 10)) < radius + 34) {
            hurtFoe(s, f, dmg, d.air ? 2 : 4, own);
        }
    }
}

/* ---------------- per-entity steps ---------------- */
function stepTakeoff(s, dt) {
    s.takeoff += dt;
    const runway = s.takeoffMode === "runway";
    const T = runway ? 3.6 : 1.4;
    let done = true;
    for (const p of s.players) {
        const u = clamp((s.takeoff - p.delay) / T, 0, 1);
        if (u < 1) done = false;
        const slot = SLOTS[s.slots[p.i] || 0] || SLOTS[0];
        if (runway) {
            if (u < 0.62) {
                const k = u / 0.62;
                p.x = lerp(70, 430, k * k);
                p.y = GROUND - 12;
                p.tilt = -0.2 * clamp((k - 0.72) / 0.28, 0, 1);
                p.vx = 200 + 520 * k; p.vy = 0;
            } else {
                const k = (u - 0.62) / 0.38, e = 1 - Math.pow(1 - k, 2);
                p.x = lerp(430, slot.x, e);
                p.y = lerp(GROUND - 12, slot.y, e);
                p.tilt = -0.2 * (1 - k);
                p.vx = lerp(520, 120, k); p.vy = 0;
            }
        } else {
            const e = 1 - Math.pow(1 - u, 2);
            p.x = lerp(-70, slot.x, e);
            p.y = lerp(slot.y + 40, slot.y, e);
            p.tilt = 0; p.vx = 420 * (1 - u); p.vy = 0;
        }
    }
    if (runway) s.speed = 60 + 340 * clamp(s.takeoff / T, 0, 1);
    s.scroll += s.speed * dt;
    if (done) {
        s.phase = "play";
        s.speed = 88 + Math.min(s.level, 12) * 4;
        for (const p of s.players) { p.vx = 0; p.vy = 0; p.tilt = 0; }
    }
}
function stepPlayer(s, p, dt, inp) {
    p.flash = Math.max(0, p.flash - dt);
    p.spin += dt;
    if (s.phase !== "play") return;
    if (!p.alive) {
        p.respawn -= dt;
        if (p.respawn <= 0 && s.players.some((q) => q.alive)) {
            const a = AIRCRAFT[p.veh];
            p.alive = true; p.hp = Math.round(a.hp * 0.6); p.ammo = a.ammo;
            p.x = 90; p.y = 200; p.flash = 0.6;
            addFx(s, p.x, p.y, "ring", "#4f46e5", 0.6, 20);
        }
        return;
    }
    const a = AIRCRAFT[p.veh], spd = a.spd;
    let vx = 0, vy = 0;
    if (inp && inp.aim) {
        const dx = inp.aim.x - p.x, dy = inp.aim.y - p.y, d = Math.hypot(dx, dy);
        if (d > 2) { const k = Math.min(1, (spd * dt) / d); vx = (dx * k) / dt; vy = (dy * k) / dt; }
    } else if (inp) {
        vx = clamp(num(inp.kx, 0), -1, 1) * spd;
        vy = clamp(num(inp.ky, 0), -1, 1) * spd;
        const n = Math.hypot(vx, vy);
        if (n > spd) { vx *= spd / n; vy *= spd / n; }
    }
    p.vx = vx; p.vy = vy;
    p.x = clamp(p.x + vx * dt, BOUND.x0, BOUND.x1);
    p.y = clamp(p.y + vy * dt, BOUND.y0, BOUND.y1);
    p.tilt += (clamp(vy / spd, -1, 1) * 0.32 - p.tilt) * Math.min(1, dt * 10);
    p.gunCd -= dt; p.spCd -= dt;
    if (inp && inp.fire && p.gunCd <= 0) fireGun(s, p);
    if (inp && inp.special && p.spCd <= 0) fireSpecial(s, p);
}
function moveFoe(s, f, nx, ny, dt) {
    f.vx = (nx - f.x) / dt; f.vy = (ny - f.y) / dt;
    f.x = nx; f.y = ny;
}
function stepFoe(s, f, dt, combat) {
    const d = ENEMY[f.kind];
    f.t += dt;
    f.hit = Math.max(0, f.hit - dt);
    if (!d.air) {
        f.vx = -s.speed; f.vy = 0;
        f.x += f.vx * dt;
        if (f.x < -90) f.x = W + 90 + rr(s, 0, 260);
        if (!combat || f.x < 30 || f.x > W - 6) return;
        f.cd -= dt;
        if (f.cd > 0) return;
        const p = targetPlayer(s, f.x, GROUND - 20);
        if (!p) { f.cd = 1; return; }
        const dmg = d.dmg * s.dmgScale;
        if (f.kind === "flak") { f.cd = rr(s, 1.7, 2.6); eShoot(s, f.x, GROUND - 28, p.x, p.y, dmg, 250, "flak"); }
        else if (f.kind === "tank") { f.cd = rr(s, 2.6, 3.8); shellShot(s, f, p, dmg); }
        else if (f.kind === "sam") { f.cd = rr(s, 3.0, 4.4); samShot(s, f, p, dmg); }
        else if (f.kind === "core") {
            f.cd = rr(s, 2.2, 3.2);
            for (let i = -1; i <= 1; i++) eShoot(s, f.x, GROUND - 46, p.x + i * 90, p.y, 6 * s.dmgScale, 230, "flak");
            if (f.spawnLeft > 0) { f.spawnLeft--; const a = spawnAir(s, "dart"); if (a) { a.x = f.x; a.y = GROUND - 70; a.base = a.y; } }
        }
        return;
    }
    const p = targetPlayer(s, f.x, f.y);
    let nx = f.x, ny = f.y;
    if (f.kind === "dart") {
        nx = f.x - d.spd * dt;
        ny = clamp(f.base + Math.sin(f.t * 3.2) * 48, 56, GROUND - 70);
    } else if (f.kind === "wing") {
        const tx = p ? Math.min(p.x + 190, W - 70) : f.x - 200;
        const ty = p ? p.y + Math.sin(f.t * 2.1) * 30 : f.base;
        const dx = tx - f.x, dy = ty - f.y, n = Math.hypot(dx, dy) || 1;
        nx = f.x + (dx / n) * d.spd * dt;
        ny = clamp(f.y + (dy / n) * d.spd * dt, 56, GROUND - 70);
    } else if (f.kind === "gunship") {
        nx = f.x - (f.x > 660 ? d.spd : 14) * dt;
        ny = clamp(f.base + Math.sin(f.t * 1.1) * 54, 70, GROUND - 110);
    } else if (f.kind === "drone" || f.kind === "seeker") {
        const tx = p ? p.x : -80, ty = p ? p.y : f.base;
        const dx = tx - f.x, dy = ty - f.y, n = Math.hypot(dx, dy) || 1;
        const wob = f.kind === "seeker" ? Math.sin(f.t * 6) * 40 : 0;
        nx = f.x + (dx / n) * d.spd * dt;
        ny = clamp(f.y + (dy / n) * d.spd * dt + wob * dt, 46, GROUND - 40);
    } else if (f.kind === "ace") {
        const anchor = 720 + Math.sin(f.t * 0.6) * 70;
        nx = f.x + clamp(anchor - f.x, -d.spd * dt, d.spd * dt);
        ny = clamp(210 + Math.sin(f.t * 0.85) * 130, 80, GROUND - 120);
    }
    if (nx < -80) { nx = W + 60 + rr(s, 0, 170); f.base = rr(s, 80, GROUND - 140); ny = f.base; }
    if (nx > W + 240) { nx = W + 60; ny = clamp(ny, 56, GROUND - 70); }
    moveFoe(s, f, nx, ny, dt);
    if (!combat || !p || f.x < 20 || f.x > W - 4) return;
    const dmg = d.dmg * s.dmgScale;
    if (d.ram) return;
    f.cd -= dt;
    if (f.kind === "gunship") {
        if (f.burst > 0) {
            f.bt -= dt;
            if (f.bt <= 0) { f.burst--; f.bt = 0.16; eShoot(s, f.x - 16, f.y, p.x, p.y, dmg, 320, "bullet"); }
        } else if (f.cd <= 0) { f.cd = rr(s, 2.2, 3.0); f.burst = 3; f.bt = 0; }
        return;
    }
    if (f.kind === "ace") {
        if (f.cd <= 0) {
            f.ph = (f.ph + 1) % 3;
            f.cd = f.ph === 2 ? 3.2 : 2.2;
            if (f.ph === 0) {
                for (let i = -2; i <= 2; i++) eShoot(s, f.x - 26, f.y, p.x + i * 70, p.y + i * 46, dmg, 300, "bullet");
            } else if (f.ph === 1) {
                for (let i = 0; i < 2; i++) {
                    s.eshots.push({ x: f.x - 20, y: f.y + (i ? 14 : -14), vx: -160, vy: i ? 90 : -90, dmg: dmg * 1.4, kind: "sam", grav: 0, turn: 2.4, target: p.i, spd: 250, life: 6, dead: false });
                }
            } else if (f.spawnLeft > 0) {
                for (let i = 0; i < 2 && f.spawnLeft > 0; i++) {
                    f.spawnLeft--;
                    const a = spawnAir(s, "drone");
                    if (a) { a.x = f.x - 20; a.y = f.y + (i ? 22 : -22); a.base = a.y; }
                }
            }
        }
        return;
    }
    if (f.cd <= 0) {
        f.cd = f.kind === "dart" ? rr(s, 1.1, 2.0) : rr(s, 1.0, 1.8);
        eShoot(s, f.x - 16, f.y, p.x, p.y, dmg, f.kind === "dart" ? 350 : 320, "bullet");
    }
}
function stepShots(s, dt) {
    for (const b of s.shots) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x > W + 30 || b.x < -30 || b.y < -30 || b.y > H + 30) b.dead = true;
    }
}
function stepEShots(s, dt) {
    for (const b of s.eshots) {
        b.life -= dt;
        if (b.kind === "sam") {
            const p = s.players[b.target];
            let ang = Math.atan2(b.vy, b.vx);
            if (p && p.alive) {
                const des = Math.atan2(p.y - b.y, p.x - b.x);
                let diff = des - ang;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                ang += clamp(diff, -b.turn * dt, b.turn * dt);
            }
            const spd = num(b.spd, 235);
            b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
        }
        b.vy += num(b.grav, 0) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.life <= 0 || b.x < -40 || b.x > W + 60 || b.y < -60 || b.y > H + 40) {
            if (b.kind === "sam" && b.life <= 0) addFx(s, b.x, b.y, "ring", "#0284c7", 0.35, 8);
            b.dead = true;
        }
    }
}
function stepSpecials(s, dt) {
    for (const sp of s.specials) {
        sp.life -= dt;
        if (sp.kind === "missile") {
            let tgt = foeById(s, sp.target);
            if (!tgt) { tgt = nearestAir(s, sp.x, sp.y); sp.target = tgt ? tgt.id : 0; }
            let ang = Math.atan2(sp.vy, sp.vx);
            if (tgt) {
                const des = Math.atan2(foeCY(tgt) - sp.y, tgt.x - sp.x);
                let diff = des - ang;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                ang += clamp(diff, -sp.turn * dt, sp.turn * dt);
            }
            sp.vx = Math.cos(ang) * sp.spd; sp.vy = Math.sin(ang) * sp.spd;
            sp.x += sp.vx * dt; sp.y += sp.vy * dt;
            for (const f of s.foes) {
                if (f.dead) continue;
                const d = ENEMY[f.kind];
                if (Math.hypot(f.x - sp.x, foeCY(f) - sp.y) < d.r + 6) {
                    sp.dead = true;
                    addFx(s, sp.x, sp.y, "ring", "#a21caf", 0.4, 12);
                    hurtFoe(s, f, sp.dmg, d.air ? 2 : 4, sp.own);
                    break;
                }
            }
        } else if (sp.kind === "rocket") {
            sp.x += sp.vx * dt; sp.y += sp.vy * dt;
            for (const f of s.foes) {
                if (f.dead) continue;
                const d = ENEMY[f.kind];
                if (Math.hypot(f.x - sp.x, foeCY(f) - sp.y) < d.r + 8) {
                    sp.dead = true;
                    addFx(s, sp.x, sp.y, "ring", "#a21caf", 0.4, 14);
                    hurtFoe(s, f, sp.dmg, 3, sp.own);
                    break;
                }
            }
            if (!sp.dead && sp.y > GROUND - 12) { sp.dead = true; groundBoom(s, sp.x, sp.dmg, 46, sp.own); }
        } else {
            sp.vy += sp.grav * dt;
            sp.x += sp.vx * dt; sp.y += sp.vy * dt;
            if (sp.y > GROUND - 8) { sp.dead = true; groundBoom(s, sp.x, sp.dmg, sp.radius, sp.own); }
        }
        if (sp.life <= 0 || sp.x > W + 60 || sp.x < -60 || sp.y < -80) sp.dead = true;
    }
}
function stepPickups(s, dt) {
    for (const u of s.pickups) {
        u.t += dt; u.life -= dt;
        if (s.cheats.magnet) {
            const p = targetPlayer(s, u.x, u.y);
            if (p) {
                const dx = p.x - u.x, dy = p.y - u.y, n = Math.hypot(dx, dy) || 1;
                u.vx = (dx / n) * 320; u.vy = (dy / n) * 320;
            }
        } else {
            u.vy = Math.sin(u.t * 2.4) * 26;
        }
        u.x += u.vx * dt; u.y += u.vy * dt;
        if (u.life <= 0 || u.x < -40) u.dead = true;
    }
}
function collide(s) {
    for (const b of s.shots) {
        if (b.dead) continue;
        for (const f of s.foes) {
            if (f.dead) continue;
            const d = ENEMY[f.kind];
            if (Math.hypot(f.x - b.x, foeCY(f) - b.y) < d.r) {
                b.dead = true;
                addFx(s, b.x, b.y, "muzzle", "#f59e0b", 0.12, 3);
                hurtFoe(s, f, b.dmg, d.boss ? 6 : d.air ? 2 : 4, b.own);
                break;
            }
        }
    }
    for (const b of s.eshots) {
        if (b.dead) continue;
        for (const p of s.players) {
            if (!p.alive) continue;
            if (Math.hypot(p.x - b.x, p.y - b.y) < 15) {
                b.dead = true;
                hurtPlayer(s, p, b.dmg);
                break;
            }
        }
    }
    for (const f of s.foes) {
        if (f.dead || !ENEMY[f.kind].ram) continue;
        for (const p of s.players) {
            if (!p.alive) continue;
            if (Math.hypot(p.x - f.x, p.y - f.y) < ENEMY[f.kind].r + 13) {
                f.dead = true;
                addFx(s, f.x, f.y, "ring", ENEMY[f.kind].col, 0.5, 18);
                hurtPlayer(s, p, ENEMY[f.kind].dmg * s.dmgScale);
                break;
            }
        }
    }
    for (const u of s.pickups) {
        if (u.dead) continue;
        for (const p of s.players) {
            if (!p.alive) continue;
            if (Math.hypot(p.x - u.x, p.y - u.y) < 26) {
                u.dead = true;
                if (u.kind === "hp") { p.hp = Math.min(p.maxHp, p.hp + 25); addFx(s, p.x, p.y, "text", "#047857", 0.8, 0, "+HULL"); }
                else if (u.kind === "ammo") { p.ammo = Math.min(p.maxAmmo, p.ammo + Math.ceil(p.maxAmmo * 0.4)); addFx(s, p.x, p.y, "text", "#0284c7", 0.8, 0, "+AMMO"); }
                else { s.score += 200; p.score += 200; addFx(s, p.x, p.y, "text", "#b45309", 0.8, 0, "+200"); }
                break;
            }
        }
    }
}
function clearLevel(s) {
    s.phase = "clear";
    let hpFrac = 0;
    for (const p of s.players) hpFrac += p.hp / p.maxHp;
    hpFrac /= Math.max(1, s.players.length);
    s.bonus = 250 + s.level * 60 + Math.round(hpFrac * 150) + (s.boss ? 500 : 0);
    s.score += s.bonus;
    s.best = Math.max(s.best, s.score);
    for (const p of s.players) {
        const a = AIRCRAFT[p.veh];
        p.hp = Math.min(p.maxHp, p.hp + Math.round(a.hp * 0.35));
        p.ammo = p.maxAmmo;
    }
}
function checkPhase(s) {
    if (s.phase !== "play") return;
    if (!s.players.some((p) => p.alive)) {
        s.phase = "over";
        s.best = Math.max(s.best, s.score);
        return;
    }
    if (!s.plan.length && !s.foes.length) clearLevel(s);
}
function stepWorld(s, dt, inputs) {
    if (!s) return s;
    dt = clamp(num(dt, 0), 0, 0.05);
    if (dt <= 0 || s.paused) return s;
    stepFx(s, dt);
    if (s.phase === "select" || s.phase === "clear" || s.phase === "over") return s;
    const edt = dt * (s.cheats.slow ? 0.55 : 1);
    s.t += dt;
    if (s.phase === "takeoff") stepTakeoff(s, dt);
    else s.scroll += s.speed * dt;
    for (const p of s.players) stepPlayer(s, p, dt, (inputs && inputs[p.i]) || null);
    if (s.phase === "play") {
        if (s.grace > 0) s.grace -= dt;
        else {
            s.spawnT += dt;
            while (s.plan.length && s.spawnT >= s.plan[0].t) spawnAir(s, s.plan.shift().kind);
        }
    }
    for (const f of s.foes) if (!f.dead) stepFoe(s, f, edt, s.phase === "play");
    stepShots(s, dt);
    stepEShots(s, edt);
    stepSpecials(s, dt);
    stepPickups(s, dt);
    collide(s);
    s.foes = s.foes.filter((f) => !f.dead);
    s.shots = s.shots.filter((b) => !b.dead);
    s.eshots = s.eshots.filter((b) => !b.dead);
    s.specials = s.specials.filter((b) => !b.dead);
    s.pickups = s.pickups.filter((u) => !u.dead);
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 1; }
    s.left = s.plan.length + s.foes.length;
    checkPhase(s);
    return s;
}
function pack(s) {
    return JSON.parse(JSON.stringify(s, (k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v)));
}

/* ============================================================
   MODULE
   ============================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const myIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;
    let netAt = 0;
    let cheatsOpen = false;
    let helpOpen = false;
    let raf = null;
    let lastT = 0;
    let lastPub = 0;
    let lastInputSend = 0;
    let lastInputSig = "";
    let gridSig = "";
    const unsubs = [];
    const specialQ = [0, 0];
    const netInput = [null, null];
    const netInputAt = [0, 0];
    const keys = { l: false, r: false, u: false, d: false, fire: false };
    const pad = { l: false, r: false, u: false, d: false, fire: false };
    const aim = { active: false, x: 0, y: 0 };
    const padPointers = new Map();
    let steerPointer = null;
    let mouseFire = false;
    let best = 0;
    try { best = Number(localStorage.getItem("sky-arcade-best") || 0) || 0; } catch (err) { best = 0; }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("sky-arcade-help-seen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("sky-arcade-help-seen", "1"); } catch (err) { /* storage blocked */ }
    }

    const ui = createGameShell(root, {
      prefix: "sa",
      category: META.category,
      info: [
        { key: "ammo", label: "ORD" },
        { key: "left", label: "LEFT" },
        { key: "init" },
        { key: "combo", hidden: true },
      ],
      board: { type: "canvas", className: "sa-canvas", width: 960, height: 540 },
      overlays: {
        select: {
          title: "Select aircraft",
          headExtra: '<span class="gui-tag" data-tag="mode">Solo</span>',
          body: '<div class="gui-grid" data-grid></div>',
          noteAttrs: ' data-note="ready"',
          primary: "Launch", primaryAction: "launch",
        },
        clear: {
          title: "Wave clear",
          headExtra: '<span class="gui-tag" data-tag="clearlv">LV 1</span>',
          stats: [
            { label: "Bonus", key: "bonus" },
            { label: "Score", key: "cscore" },
            { label: "Kills", key: "ckills" },
          ],
          noteAttrs: ' data-note="next"',
          primary: "Next wave", primaryAction: "next",
        },
        over: {
          title: "Game over",
          headExtra: '<span class="gui-tag" data-tag="overlv">LV 1</span>',
          stats: [
            { label: "Score", key: "oscore" },
            { label: "Best", key: "obest" },
            { label: "Kills", key: "okills" },
          ],
          noteAttrs: ' data-note="over"',
          primary: "Retry", primaryAction: "retry",
        },
        pause: {
          title: "Paused",
          primary: "Resume", primaryAction: "resume",
        },
        cheat: {
          title: "Cheats",
          closeLabel: "Close", closeAction: "close",
          toggles: CHEAT_TOGGLES.map((c) => ({ key: "cheat", value: c.key, label: c.label })),
          cardActions: CHEAT_ACTIONS.map((c) => ({ key: "cheatact", value: c.key, label: c.label })),
        },
        help: {
          title: "How to play",
          closeLabel: "Close", closeAction: "help-close",
          sections: [
            { title: "Desktop", items: [
              '<span class="gui-kbd">W A S D</span> / arrows — fly',
              '<span class="gui-kbd">Space</span> — fire (hold)',
              '<span class="gui-kbd">X</span> / <span class="gui-kbd">Shift</span> — special weapon',
              "Mouse — aim · click — fire · right-click — special",
              '<span class="gui-kbd">P</span> pause · <span class="gui-kbd">H</span> help · <span class="gui-kbd">C</span> cheats',
            ] },
            { title: "Mobile", items: [
              "On-screen D-pad to fly, FIRE and ORD buttons to attack",
              "Drag on the canvas to aim and fire",
            ] },
            { title: "Rules", items: [
              "Destroy every generated aircraft and ground target to clear the wave.",
              "A coin flip decides who launches first; a boss appears every 5th wave.",
              "Combos, remaining hull and boss kills grant extra bonus points.",
              "Pickups repair the hull, refill ordnance or add score.",
              "Cheats are available to the host only.",
            ] },
          ],
          note: "Press H to reopen this guide",
          primary: "Got it", primaryAction: "help-close",
        },
      },
      pad: {
        dpad: true,
        actions: [
          { pad: "s", label: "ORD", variant: "spec" },
          { pad: "f", label: "FIRE", variant: "fire" },
        ],
      },
    });



    const $ = (sel) => root.querySelector(sel);
    const app = $("[data-sa]");
    const board = $("[data-board]");
    const canvas = $("[data-canvas]");
    const ctx = canvas.getContext("2d");
    const grid = $("[data-grid]");
    const launchBtn = $("[data-launch]");
    const ov = {
        select: $('[data-ov="select"]'),
        clear: $('[data-ov="clear"]'),
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const hud = {
        level: $('[data-hud="level"]'),
        score: $('[data-hud="score"]'),
        hp: $('[data-hud="hp"]'),
        ammo: $('[data-hud="ammo"]'),
        left: $('[data-hud="left"]'),
        init: $('[data-hud="init"]'),
        combo: $('[data-hud="combo"]'),
        best: $('[data-hud="best"]'),
        wave: $('[data-hud="wave"]'),
    };
    const out = {
        bonus: $('[data-out="bonus"]'),
        cscore: $('[data-out="cscore"]'),
        ckills: $('[data-out="ckills"]'),
        oscore: $('[data-out="oscore"]'),
        obest: $('[data-out="obest"]'),
        okills: $('[data-out="okills"]'),
    };
    const tags = { mode: $('[data-tag="mode"]'), clearlv: $('[data-tag="clearlv"]'), overlv: $('[data-tag="overlv"]') };
    const notes = { ready: $('[data-note="ready"]'), next: $('[data-note="next"]'), over: $('[data-note="over"]') };

    const GLYPH = {
        jet: '<svg viewBox="0 0 52 24" width="52" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h34l8-3v6l-8-3"/><path d="M22 12L12 4m10 8L12 20"/><path d="M8 12l-4-5h5l4 5-4 5H4z"/></svg>',
        attack: '<svg viewBox="0 0 52 24" width="52" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h34l8-3v6l-8-3"/><path d="M24 12L10 2m14 10L10 22"/><path d="M20 12l-8-6m8 6l-8 6"/><path d="M8 12l-4-5h5l4 5-4 5H4z"/></svg>',
        heli: '<svg viewBox="0 0 52 24" width="52" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13h22l8-3v5l-8-2"/><path d="M12 13l-7-3m7 3l-7 3"/><path d="M22 10V7"/><path d="M8 7h28"/><circle cx="28" cy="12" r="2"/></svg>',
        bomber: '<svg viewBox="0 0 52 24" width="52" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h38l8-3v6l-8-3"/><path d="M24 12L10 3m14 9L10 21"/><path d="M6 12l-3-6m3 6l-3 6"/><circle cx="18" cy="9" r="1.6"/><circle cx="18" cy="15" r="1.6"/></svg>',
        uav: '<svg viewBox="0 0 52 24" width="52" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h32l8-2v4l-8-2"/><path d="M26 12L14 5m12 7L14 19"/><path d="M10 12l-5-4h4l5 4-5 4H5z"/><circle cx="34" cy="12" r="2.2"/></svg>',
    };

    /* ---------------- canvas rendering ---------------- */
    function fitCanvas() {
        const rect = board.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = Math.max(320, rect.width || 640);
        const ch = cw * (H / W);
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    }
    function ex() {
        if (isHost || !netAt) return 0;
        return clamp((performance.now() - netAt) / 1000, 0, 0.25);
    }
    function wrapX(v, span) { let x = v % span; if (x < 0) x += span; return x; }
    function seg(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function poly(pts, fill) {
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.closePath();
        if (fill) ctx.fill(); else ctx.stroke();
    }
    function bar(x, y, w, frac, col) {
        ctx.fillStyle = "#cbd5e1"; ctx.fillRect(x - w / 2, y, w, 3);
        ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 3);
    }
    function craft(g, col, spin) {
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (g === "heli") {
            seg(-14, 0, 10, 0);
            poly([10, -4, 17, 0, 10, 4], true);
            seg(-14, 0, -25, -3); seg(-25, -6, -25, 1);
            seg(-8, 6, 7, 6); seg(-6, 2, -6, 6); seg(4, 2, 4, 6);
            seg(0, -3, 0, -7);
            const r = 5 + Math.abs(Math.sin(spin * 20)) * 15;
            ctx.lineWidth = 1.8; seg(-r, -7, r, -7);
            const tr = 3 + Math.abs(Math.cos(spin * 26)) * 3;
            seg(-25, -3 - tr, -25, -3 + tr);
            ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(5, -1, 2.2, 0, 6.284); ctx.fill();
            return;
        }
        if (g === "bomber") {
            ctx.lineWidth = 3.2; seg(-22, 0, 14, 0); ctx.lineWidth = 2.2;
            poly([14, -4, 21, 0, 14, 4], true);
            seg(0, 0, -14, -12); seg(0, 0, -14, 12);
            seg(-22, 0, -28, -7); seg(-22, 0, -28, 7);
            ctx.fillStyle = "#334155";
            ctx.beginPath(); ctx.arc(-8, -5, 2, 0, 6.284); ctx.fill();
            ctx.beginPath(); ctx.arc(-8, 5, 2, 0, 6.284); ctx.fill();
            return;
        }
        if (g === "uav") {
            seg(-14, 0, 12, 0);
            poly([12, -3, 19, 0, 12, 3], true);
            seg(2, 0, -10, -8); seg(2, 0, -10, 8);
            seg(-14, 0, -19, -5); seg(-14, 0, -19, 5);
            ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(9, 0, 2.6, 0, 6.284); ctx.fill();
            return;
        }
        seg(-16, 0, 13, 0);
        poly([13, -4, 21, 0, 13, 4], true);
        seg(0, 0, -11, -10); seg(0, 0, -11, 10);
        seg(-16, 0, -22, -6); seg(-16, 0, -22, 6);
        if (g === "attack") { ctx.lineWidth = 2.6; seg(2, 0, -6, -13); seg(2, 0, -6, 13); ctx.lineWidth = 2.2; }
        ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(4, -2, 2, 0, 6.284); ctx.fill();
    }
    function drawAirport(scroll) {
        const bx = (v) => v - scroll;
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#94a3b8"; ctx.fillStyle = "#e2e8f0";
        const t1 = bx(70);
        if (t1 > -240 && t1 < W + 40) {
            ctx.fillRect(t1, GROUND - 44, 190, 44); ctx.strokeRect(t1, GROUND - 44, 190, 44);
            ctx.fillStyle = "#cbd5e1";
            for (let i = 0; i < 7; i++) ctx.fillRect(t1 + 12 + i * 25, GROUND - 32, 14, 12);
            ctx.fillStyle = "#e2e8f0";
        }
        const t2 = bx(320);
        if (t2 > -80 && t2 < W + 40) {
            ctx.fillRect(t2, GROUND - 92, 24, 92); ctx.strokeRect(t2, GROUND - 92, 24, 92);
            ctx.fillRect(t2 - 9, GROUND - 112, 42, 22); ctx.strokeRect(t2 - 9, GROUND - 112, 42, 22);
            ctx.strokeStyle = "#4f46e5"; seg(t2 + 12, GROUND - 112, t2 + 12, GROUND - 128);
            ctx.strokeStyle = "#94a3b8";
        }
        const t3 = bx(430);
        if (t3 > -180 && t3 < W + 40) {
            ctx.beginPath();
            ctx.moveTo(t3, GROUND); ctx.lineTo(t3, GROUND - 26);
            ctx.quadraticCurveTo(t3 + 65, GROUND - 62, t3 + 130, GROUND - 26);
            ctx.lineTo(t3 + 130, GROUND); ctx.closePath(); ctx.fill(); ctx.stroke();
            seg(t3 + 20, GROUND, t3 + 20, GROUND - 30);
            seg(t3 + 110, GROUND, t3 + 110, GROUND - 30);
        }
        const t4 = bx(640);
        if (t4 > -40 && t4 < W + 40) {
            ctx.strokeStyle = "#64748b"; seg(t4, GROUND, t4, GROUND - 40);
            ctx.fillStyle = "#d97706"; poly([t4, GROUND - 40, t4 + 26, GROUND - 34, t4, GROUND - 28], true);
            ctx.fillStyle = "#e2e8f0"; ctx.strokeStyle = "#94a3b8";
        }
        for (let i = 0; i < 3; i++) {
            const px2 = bx(760 + i * 90);
            if (px2 < -60 || px2 > W + 60) continue;
            ctx.save(); ctx.translate(px2, GROUND - 10); ctx.scale(0.7, 0.7);
            ctx.globalAlpha = 0.5; craft("jet", "#94a3b8", 0); ctx.globalAlpha = 1;
            ctx.restore();
        }
    }
    function drawGroundFoe(f, e) {
        const d = ENEMY[f.kind];
        const x = f.x + f.vx * e, y = GROUND;
        const col = f.hit > 0 ? "#0f172a" : d.col;
        ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
        ctx.fillStyle = "#ffffff";
        if (f.kind === "flak") {
            poly([x - 15, y, x - 11, y - 12, x + 11, y - 12, x + 15, y], true);
            poly([x - 15, y, x - 11, y - 12, x + 11, y - 12, x + 15, y], false);
            ctx.lineWidth = 3; seg(x, y - 12, x - 9, y - 30);
            ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.arc(x, y - 12, 4, 0, 6.284); ctx.fill(); ctx.stroke();
            bar(x, y - 38, 30, f.hp / f.maxHp, col);
        } else if (f.kind === "tank") {
            ctx.fillRect(x - 17, y - 12, 34, 9); ctx.strokeRect(x - 17, y - 12, 34, 9);
            ctx.fillRect(x - 9, y - 21, 18, 9); ctx.strokeRect(x - 9, y - 21, 18, 9);
            ctx.lineWidth = 3; seg(x - 9, y - 17, x - 26, y - 17); ctx.lineWidth = 1.8;
            for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 12 + i * 8, y - 4, 2.4, 0, 6.284); ctx.stroke(); }
            bar(x, y - 29, 32, f.hp / f.maxHp, col);
        } else if (f.kind === "sam") {
            ctx.fillRect(x - 16, y - 13, 32, 10); ctx.strokeRect(x - 16, y - 13, 32, 10);
            ctx.lineWidth = 2.6;
            seg(x - 6, y - 13, x - 14, y - 30); seg(x + 4, y - 13, x - 4, y - 30);
            ctx.lineWidth = 1.8;
            ctx.fillStyle = col;
            poly([x - 14, y - 30, x - 11, y - 26, x - 17, y - 26], true);
            poly([x - 4, y - 30, x - 1, y - 26, x - 7, y - 26], true);
            ctx.fillStyle = "#ffffff";
            bar(x, y - 38, 30, f.hp / f.maxHp, col);
        } else {
            ctx.fillRect(x - 46, y - 46, 92, 46); ctx.strokeRect(x - 46, y - 46, 92, 46);
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(x - 32, y - 34, 26, 18); ctx.fillRect(x + 6, y - 34, 26, 18);
            ctx.fillStyle = "#ffffff";
            seg(x, y - 46, x, y - 68);
            ctx.fillStyle = "#dc2626"; poly([x, y - 68, x + 22, y - 62, x, y - 56], true);
            ctx.fillStyle = "#ffffff";
            bar(x, y - 76, 92, f.hp / f.maxHp, col);
        }
    }
    function drawAirFoe(f, e) {
        const d = ENEMY[f.kind];
        const x = f.x + f.vx * e, y = f.y + f.vy * e;
        const col = f.hit > 0 ? "#0f172a" : d.col;
        ctx.save();
        ctx.translate(x, y);
        if (f.kind === "drone") {
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.rotate(f.t * 3);
            poly([-9, 0, 0, -9, 9, 0, 0, 9], false);
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, 6.284); ctx.stroke();
        } else if (f.kind === "seeker") {
            ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
            ctx.rotate(Math.atan2(f.vy, f.vx) + Math.PI);
            poly([-12, -5, 6, 0, -12, 5], false);
            seg(-12, 0, -18, 0);
            ctx.beginPath(); ctx.arc(2, 0, 2.4, 0, 6.284); ctx.fill();
        } else {
            ctx.scale(-1, 1);
            const g = f.kind === "gunship" || f.kind === "ace" ? "bomber" : "jet";
            if (f.kind === "ace") ctx.scale(1.5, 1.5);
            if (f.kind === "dart") ctx.scale(0.85, 0.85);
            craft(g, col, f.t);
        }
        ctx.restore();
        if (f.hp < f.maxHp && !d.boss) bar(x, y - d.r - 10, d.r * 2, f.hp / f.maxHp, col);
    }
    function drawPlayer(p, e, th) {
        if (!p.alive) return;
        const x = p.x + p.vx * e, y = p.y + p.vy * e;
        const mine = p.i === myIndex;
        const col = p.flash > 0 ? "#0f172a" : mine ? th.accent : "#0f766e";
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.tilt);
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        seg(-26, 0, -40 - Math.abs(p.vx) * 0.02, 0);
        ctx.globalAlpha = 1;
        craft(AIRCRAFT[p.veh].glyph, col, p.spin);
        ctx.restore();
        if (online) {
            ctx.fillStyle = mine ? th.accent : "#0f766e";
            ctx.font = "600 9px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText((p.name || "P" + (p.i + 1)).slice(0, 10).toUpperCase(), x, y - 26);
            ctx.textAlign = "left";
            bar(x, y - 22, 34, p.hp / p.maxHp, col);
        }
    }
    function drawWorld(s) {
        const e = ex();
        const scroll = s.scroll + (s.phase === "play" ? s.speed * e : 0);
        const th = THEMES[s.theme % THEMES.length];
        ctx.fillStyle = th.sky; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
        for (let y = 88; y < GROUND - 30; y += 86) seg(0, y + 0.5, W, y + 0.5);
        ctx.globalAlpha = 1;
        const layer = (par, step, maxH, col, baseY) => {
            const off = scroll * par;
            const first = Math.floor(off / step) - 1;
            ctx.fillStyle = col; ctx.strokeStyle = "#94a3b8";
            for (let i = first; i < first + Math.ceil(W / step) + 3; i++) {
                const x = i * step - off;
                const h = 24 + hash(i * 1.7 + par * 31) * maxH;
                const w = step * (0.5 + hash(i * 3.1 + par * 7) * 0.36);
                ctx.fillRect(x, baseY - h, w, h);
                if (hash(i * 5.3 + par) > 0.82) seg(x + w * 0.45, baseY - h, x + w * 0.45, baseY - h - 12);
            }
        };
        layer(0.18, 96, 118, th.far, GROUND - 4);
        layer(0.42, 66, 66, th.near, GROUND);
        ctx.fillStyle = th.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
        ctx.strokeStyle = th.edge; ctx.lineWidth = 1;
        seg(0, GROUND + 0.5, W, GROUND + 0.5);
        ctx.fillStyle = th.edge;
        for (let i = 0; i < 18; i++) {
            const x = wrapX(i * 80 - scroll, 1440) - 160;
            ctx.fillRect(x, GROUND + 40, 26, 2);
        }
        const runway = s.phase === "select" || (s.phase === "takeoff" && s.takeoffMode === "runway");
        if (runway) {
            ctx.fillStyle = "#e2e8f0"; ctx.fillRect(0, GROUND, W, 30);
            ctx.strokeStyle = "#94a3b8"; seg(0, GROUND + 0.5, W, GROUND + 0.5);
            ctx.fillStyle = "#cbd5e1";
            for (let i = 0; i < 22; i++) {
                const x = wrapX(i * 70 - scroll, 1540) - 200;
                ctx.fillRect(x, GROUND + 14, 34, 2);
            }
            drawAirport(scroll);
        }
        for (const f of s.foes) if (!ENEMY[f.kind].air) drawGroundFoe(f, e);
        for (const u of s.pickups) {
            const x = u.x + u.vx * e, y = u.y + u.vy * e;
            const col = u.kind === "hp" ? "#047857" : u.kind === "ammo" ? "#0284c7" : "#b45309";
            ctx.save(); ctx.translate(x, y); ctx.rotate(u.t * 2);
            ctx.strokeStyle = col; ctx.lineWidth = 1.8;
            poly([-7, 0, 0, -7, 7, 0, 0, 7], false);
            ctx.globalAlpha = 0.35 + 0.35 * Math.sin(u.t * 6);
            poly([-4, 0, 0, -4, 4, 0, 0, 4], true);
            ctx.restore();
            ctx.globalAlpha = 1;
        }
        for (const f of s.foes) if (ENEMY[f.kind].air) drawAirFoe(f, e);
        for (const p of s.players) drawPlayer(p, e, th);
        ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
        for (const b of s.shots) {
            const x = b.x + b.vx * e, y = b.y + b.vy * e;
            seg(x - b.vx * 0.014, y - b.vy * 0.014, x, y);
        }
        for (const b of s.eshots) {
            const x = b.x + b.vx * e, y = b.y + b.vy * e;
            if (b.kind === "sam") {
                ctx.strokeStyle = "#0284c7"; ctx.lineWidth = 3;
                seg(x - b.vx * 0.03, y - b.vy * 0.03, x, y);
            } else {
                ctx.fillStyle = b.kind === "shell" ? "#ea580c" : b.kind === "flak" ? "#a16207" : "#dc2626";
                ctx.beginPath(); ctx.arc(x, y, b.kind === "bullet" ? 3 : 4, 0, 6.284); ctx.fill();
            }
        }
        for (const sp of s.specials) {
            const x = sp.x + sp.vx * e, y = sp.y + sp.vy * e;
            if (sp.kind === "bomb") {
                ctx.fillStyle = "#475569";
                ctx.beginPath(); ctx.ellipse(x, y, 4.5, 7.5, 0, 0, 6.284); ctx.fill();
            } else {
                ctx.strokeStyle = sp.kind === "rocket" ? "#dc2626" : "#a21caf";
                ctx.lineWidth = 3.6;
                seg(x - sp.vx * 0.03, y - sp.vy * 0.03, x, y);
            }
        }
        for (const f of s.fx) {
            const k = clamp(f.t / f.life, 0, 1);
            ctx.globalAlpha = 1 - k;
            if (f.kind === "text") {
                ctx.fillStyle = f.c;
                ctx.font = "600 11px ui-monospace, monospace";
                ctx.textAlign = "center";
                ctx.fillText(f.txt, f.x, f.y - 18 * k);
                ctx.textAlign = "left";
            } else if (f.kind === "muzzle") {
                ctx.fillStyle = f.c;
                ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 * (1 + k), 0, 6.284); ctx.fill();
            } else {
                ctx.strokeStyle = f.c; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 * (0.5 + k * 1.6), 0, 6.284); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        const boss = s.foes.find((f) => f.kind === "ace");
        if (boss) {
            ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect(W / 2 - 150, 44, 300, 16);
            ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - 150, 44, 300, 16);
            ctx.fillStyle = "#a21caf"; ctx.fillRect(W / 2 - 147, 47, 294 * clamp(boss.hp / boss.maxHp, 0, 1), 10);
            ctx.fillStyle = "#475569"; ctx.font = "600 9px ui-monospace, monospace"; ctx.textAlign = "center";
            ctx.fillText("ACE", W / 2, 72); ctx.textAlign = "left";
        }
        if (s.phase === "takeoff" && s.takeoffMode === "runway") {
            ctx.fillStyle = "#64748b"; ctx.font = "600 10px ui-monospace, monospace";
            ctx.fillText("TAKEOFF", 16, H - 18);
        }
    }

    /* ---------------- HUD + overlays ---------------- */
    function statRow(label, frac) {
        return '<div class="sa-stat"><span>' + label + '</span><i style="--v:' + Math.round(clamp(frac, 0.08, 1) * 100) + '%"></i></div>';
    }
    function renderGrid(s) {
        const me = s.players[myIndex] || s.players[0];
        const sig = s.players.map((p) => p.veh + ":" + p.ready).join("|") + "|" + myIndex;
        if (sig === gridSig) return;
        gridSig = sig;
        let h = "";
        for (const k of CRAFTS) {
            const a = AIRCRAFT[k];
            h += '<button class="sa-craft' + (me.veh === k ? " on" : "") + '" type="button" data-veh="' + k + '">' +
                GLYPH[a.glyph] +
                '<div class="n">' + a.label + '</div>' +
                '<div class="s">' + a.special + " x" + a.ammo + "</div>" +
                statRow("SPD", a.spd / 360) + statRow("ARM", a.armor / 9) + statRow("PWR", a.gun / 9) +
                "</button>";
        }
        grid.innerHTML = h;
    }
    function renderCheats(s) {
        for (const c of CHEAT_TOGGLES) {
            const button = root.querySelector(`[data-cheat="${c.key}"]`);
            if (!button) continue;
            const on = !!s.cheats[c.key];
            button.classList.toggle("on", on);
            const em = button.querySelector("em");
            if (em) em.textContent = on ? "ON" : "OFF";
        }
    }
    function syncUI(s) {
        const me = s.players[myIndex] || s.players[0];
        const frac = clamp(me.hp / me.maxHp, 0, 1);
        hud.level.textContent = s.level;
        hud.score.textContent = s.score;
        hud.hp.style.width = Math.round(frac * 100) + "%";
        hud.hp.style.background = frac < 0.3 ? "#dc2626" : "";
        hud.ammo.textContent = s.cheats.ammo ? "INF" : me.ammo;
        hud.left.textContent = s.left;
        hud.init.textContent = "FIRST " + (s.first === 0 ? (online ? "SQUAD" : "YOU") : "BOT");
        hud.combo.closest("[data-chip]")?.toggleAttribute("hidden", s.combo <= 1);
        hud.combo.textContent = "x" + s.combo;
        hud.best.textContent = Math.max(best, s.score);
        hud.wave.textContent = s.level;
        tags.mode.textContent = online ? (isHost ? "Host - P1" : "Guest - P2") : "Solo";
        tags.clearlv.textContent = "LV " + s.level;
        tags.overlv.textContent = "LV " + s.level;
        out.bonus.textContent = s.bonus;
        out.cscore.textContent = s.score;
        out.ckills.textContent = s.kills;
        out.oscore.textContent = s.score;
        out.obest.textContent = Math.max(best, s.score);
        out.okills.textContent = s.players.reduce((n, p) => n + p.kills, 0);
        if (online) {
            const other = s.players[1 - myIndex];
            notes.ready.textContent = "You " + (me.ready ? "ready" : "standby") + " - Rival " + (other && other.ready ? "ready" : "standby");
            notes.next.textContent = isHost ? "Host controls launch" : "Waiting for host";
        } else {
            notes.ready.textContent = "Hangar ready";
            notes.next.textContent = "Next sector generated";
        }
        notes.over.textContent = "Best " + Math.max(best, s.score);
        launchBtn.textContent = online && me.ready ? "Ready" : "Launch";
        ov.select.hidden = s.phase !== "select" || cheatsOpen || helpOpen;
        ov.clear.hidden = s.phase !== "clear" || cheatsOpen || helpOpen;
        ov.over.hidden = s.phase !== "over" || cheatsOpen || helpOpen;
        ov.pause.hidden = !s.paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const cbtn = root.querySelector("[data-cheats]");
        const active = Object.keys(s.cheats).filter((k) => s.cheats[k]).length;
        if (cbtn) {
            cbtn.classList.toggle("on", active > 0);
            const label = cbtn.querySelector(".gui-btn-label");
            if (label) label.textContent = active > 0 ? "Cheats " + active : "Cheats";
        }
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".gui-btn-label");
            if (label) label.textContent = s.paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", s.paused ? "Resume" : "Pause");
            pbtn.disabled = online && !isHost;
        }
        if (s.score > best) {
            best = s.score;
            try { localStorage.setItem("sky-arcade-best", String(best)); } catch (err) { /* storage blocked */ }
        }
        renderGrid(s);
        renderCheats(s);
    }
    function render() {
        if (!state) {
            ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, W, H);
            return;
        }
        drawWorld(state);
        syncUI(state);
    }
    function publish() {
        render();
        if (online && isHost && state && room.publishState) {
            lastPub = performance.now();
            room.publishState(pack(state)).catch(console.warn);
        }
    }

    /* ---------------- actions ---------------- */
    function rivalName() {
        const p = roomData && roomData.players;
        if (Array.isArray(p)) {
            const o = p.find((x) => x && x.name && x.name !== playerName);
            if (o) return String(o.name);
        } else if (p && typeof p === "object") {
            for (const k in p) {
                const v = p[k];
                if (v && v.name && v.name !== playerName) return String(v.name);
            }
        }
        return "Player 2";
    }
    function newMatch() {
        const players = online
            ? [{ name: playerName || "Player 1", veh: "fighter" }, { name: rivalName(), veh: "fighter" }]
            : [{ name: playerName || "Player", veh: "fighter" }];
        state = makeState({ seed: (Math.random() * 1e9) | 0, players, best });
        gridSig = "";
        specialQ[0] = 0; specialQ[1] = 0;
    }
    function sanitizeInput(o) {
        const src = o && typeof o === "object" ? o : {};
        const a = src.aim && typeof src.aim === "object" ? src.aim : null;
        return {
            kx: clamp(num(src.kx, 0), -1, 1),
            ky: clamp(num(src.ky, 0), -1, 1),
            fire: Boolean(src.fire),
            aim: a ? { x: clamp(num(a.x, 0), 0, W), y: clamp(num(a.y, 0), 0, H) } : null,
        };
    }
    function cheatAction(key) {
        if (!state) return;
        if (key === "heal") {
            for (const p of state.players) { p.hp = p.maxHp; p.alive = true; p.respawn = 0; p.flash = 0.4; }
        } else if (key === "refill") {
            for (const p of state.players) p.ammo = p.maxAmmo;
        } else if (key === "score") {
            state.score += 2500;
        } else if (key === "clear") {
            state.plan.length = 0;
            for (const f of state.foes) killFoe(state, f, myIndex);
            state.foes = [];
            if (state.phase === "play") clearLevel(state);
        }
    }
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        const i = actor === 1 ? 1 : 0;
        const p = state.players[i];
        const t = String(action.type || "");
        if (t === "input") {
            if (!p) return;
            netInput[i] = sanitizeInput(action.input);
            netInputAt[i] = performance.now();
            return;
        }
        if (t === "special") { if (p) specialQ[i] = 1; return; }
        if (t === "pick") {
            if (state.phase === "select" && p && AIRCRAFT[action.veh]) setVehicle(state, i, action.veh);
        } else if (t === "ready") {
            if (state.phase === "select" && p) {
                p.ready = action.on !== false;
                if (state.players.every((q) => q.ready)) startLevel(state, 1, true);
            }
        } else if (t === "next") {
            if (state.phase === "clear") startLevel(state, state.level + 1, false);
        } else if (t === "restart") {
            const keep = state.players.map((q) => q.veh);
            newMatch();
            state.players.forEach((q, k) => setVehicle(state, k, keep[k] || "fighter"));
        } else if (t === "pause") {
            if (isHost) state.paused = !state.paused;
        } else if (t === "cheat") {
            if (isHost && CHEAT_TOGGLES.some((c) => c.key === action.key)) state.cheats[action.key] = !state.cheats[action.key];
        } else if (t === "cheatact") {
            if (isHost) cheatAction(String(action.key || ""));
        }
        publish();
    }
    function submitAction(action) {
        if (online && !isHost) {
            if (room.sendAction) room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, myIndex);
    }
    function queueSpecial() {
        if (online && !isHost) {
            if (room.sendAction) room.sendAction({ type: "special" }).catch(console.warn);
            return;
        }
        specialQ[myIndex] = 1;
    }

    /* ---------------- input ---------------- */
    function localInput() {
        const kx = (keys.r || pad.r ? 1 : 0) - (keys.l || pad.l ? 1 : 0);
        const ky = (keys.d || pad.d ? 1 : 0) - (keys.u || pad.u ? 1 : 0);
        const useAim = aim.active && kx === 0 && ky === 0;
        return { kx, ky, fire: keys.fire || pad.fire || mouseFire, aim: useAim ? { x: aim.x, y: aim.y } : null };
    }
    function gatherInputs() {
        const arr = [null, null];
        const mine = localInput();
        mine.special = specialQ[myIndex] > 0;
        specialQ[myIndex] = 0;
        arr[myIndex] = mine;
        if (online && isHost) {
            const o = 1 - myIndex;
            const fresh = performance.now() - netInputAt[o] < 500;
            const inp = fresh && netInput[o] ? Object.assign({}, netInput[o]) : { kx: 0, ky: 0, fire: false, aim: null };
            inp.special = specialQ[o] > 0;
            specialQ[o] = 0;
            arr[o] = inp;
        }
        return arr;
    }
    function sendInput() {
        if (!online || isHost || !room.sendAction) return;
        const now = performance.now();
        if (now - lastInputSend < 60) return;
        const inp = localInput();
        const sig = JSON.stringify(inp);
        if (sig === lastInputSig && now - lastInputSend < 250) return;
        lastInputSend = now;
        lastInputSig = sig;
        room.sendAction({ type: "input", input: inp }).catch(console.warn);
    }
    function toLogical(e) {
        const r = canvas.getBoundingClientRect();
        const w = r.width || 1, h = r.height || 1;
        return { x: clamp(((e.clientX - r.left) / w) * W, 0, W), y: clamp(((e.clientY - r.top) / h) * H, 0, H) };
    }
    function prevent(e) { e.preventDefault(); }
    function onCanvasDown(e) {
        const p = toLogical(e);
        if (e.pointerType === "touch") {
            app.classList.add("touch");
            steerPointer = e.pointerId;
            aim.active = true; aim.x = p.x; aim.y = clamp(p.y - 34, 0, H);
        } else {
            aim.active = true; aim.x = p.x; aim.y = p.y;
            if (e.button === 2) queueSpecial(); else mouseFire = true;
        }
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
        e.preventDefault();
    }
    function onCanvasMove(e) {
        const p = toLogical(e);
        if (e.pointerType === "touch") {
            if (steerPointer !== e.pointerId) return;
            aim.active = true; aim.x = p.x; aim.y = clamp(p.y - 34, 0, H);
        } else {
            aim.active = true; aim.x = p.x; aim.y = p.y;
        }
    }
    function onCanvasUp(e) {
        if (e.pointerType === "touch") {
            if (steerPointer === e.pointerId) { steerPointer = null; aim.active = false; }
        } else mouseFire = false;
    }
    function onCanvasLeave() { mouseFire = false; }
    function syncPad() {
        const v = new Set(padPointers.values());
        pad.l = v.has("l"); pad.r = v.has("r"); pad.u = v.has("u"); pad.d = v.has("d"); pad.fire = v.has("f");
        if (v.size) aim.active = false;
    }
    function padDown(e) {
        const b = e.target.closest("[data-pad]");
        if (!b) return;
        e.preventDefault();
        app.classList.add("touch");
        if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
        padPointers.set(e.pointerId, b.dataset.pad);
        b.classList.add("on");
        if (b.dataset.pad === "s") queueSpecial();
        syncPad();
    }
    function padUp(e) {
        const k = padPointers.get(e.pointerId);
        if (!k) return;
        padPointers.delete(e.pointerId);
        if (Array.from(padPointers.values()).indexOf(k) < 0) {
            const b = root.querySelector('[data-pad="' + k + '"]');
            if (b) b.classList.remove("on");
        }
        syncPad();
    }
    function releaseAll() {
        keys.l = keys.r = keys.u = keys.d = keys.fire = false;
        padPointers.clear();
        syncPad();
        mouseFire = false;
        steerPointer = null;
        const bs = root.querySelectorAll("[data-pad]");
        for (const b of bs) b.classList.remove("on");
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function onKeyDown(e) {
        const c = e.code;
        if (c === "ArrowLeft" || c === "KeyA") { keys.l = true; aim.active = false; e.preventDefault(); }
        else if (c === "ArrowRight" || c === "KeyD") { keys.r = true; aim.active = false; e.preventDefault(); }
        else if (c === "ArrowUp" || c === "KeyW") { keys.u = true; aim.active = false; e.preventDefault(); }
        else if (c === "ArrowDown" || c === "KeyS") { keys.d = true; aim.active = false; e.preventDefault(); }
        else if (c === "Space") { keys.fire = true; e.preventDefault(); }
        else if (c === "KeyX" || c === "KeyK" || c === "ShiftLeft") { queueSpecial(); e.preventDefault(); }
        else if (c === "KeyC") { if (!helpOpen) { cheatsOpen = !cheatsOpen; render(); } e.preventDefault(); }
        else if (c === "KeyH") { toggleHelp(); e.preventDefault(); }
        else if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else submitAction({ type: "pause" });
            e.preventDefault();
        } else if (c === "Enter") {
            if (!state) return;
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) { cheatsOpen = false; render(); }
            else if (state.phase === "select") { const me = state.players[myIndex]; submitAction({ type: "ready", on: !(me && me.ready) }); }
            else if (state.phase === "clear") submitAction({ type: "next" });
            else if (state.phase === "over") submitAction({ type: "restart" });
            e.preventDefault();
        }
    }
    function onKeyUp(e) {
        const c = e.code;
        if (c === "ArrowLeft" || c === "KeyA") keys.l = false;
        else if (c === "ArrowRight" || c === "KeyD") keys.r = false;
        else if (c === "ArrowUp" || c === "KeyW") keys.u = false;
        else if (c === "ArrowDown" || c === "KeyS") keys.d = false;
        else if (c === "Space") keys.fire = false;
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { cheatsOpen = !cheatsOpen; render(); return; }
        if (t.closest("[data-close]")) { cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) { submitAction({ type: "pause" }); return; }
        if (t.closest("[data-resume]")) { if (state && state.paused) submitAction({ type: "pause" }); return; }
        if (t.closest("[data-restart]") || t.closest("[data-retry]")) { submitAction({ type: "restart" }); return; }
        if (t.closest("[data-next]")) { submitAction({ type: "next" }); return; }
        if (t.closest("[data-launch]")) {
            const me = state && state.players[myIndex];
            submitAction({ type: "ready", on: !(me && me.ready) });
            return;
        }
        const cv = t.closest("[data-veh]");
        if (cv) { submitAction({ type: "pick", veh: cv.dataset.veh }); return; }
        const ct = t.closest("[data-cheat]");
        if (ct) { submitAction({ type: "cheat", key: ct.dataset.cheat }); return; }
        const ca = t.closest("[data-cheatact]");
        if (ca) { submitAction({ type: "cheatact", key: ca.dataset.cheatact }); return; }
    }

    /* ---------------- loop ---------------- */
    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = ts;
        const dt = Math.min(0.05, (ts - lastT) / 1000);
        lastT = ts;
        if (!state) { render(); return; }
        if (isHost) {
            stepWorld(state, dt, gatherInputs());
            render();
            if (online && room.publishState && ts - lastPub > 90) {
                lastPub = ts;
                room.publishState(pack(state)).catch(console.warn);
            }
        } else {
            sendInput();
            render();
        }
    }
    function onResize() { fitCanvas(); render(); }

    /* ---------------- wiring ---------------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", padDown);
    root.addEventListener("pointerup", padUp);
    root.addEventListener("pointercancel", padUp);
    canvas.addEventListener("pointerdown", onCanvasDown);
    canvas.addEventListener("pointermove", onCanvasMove);
    canvas.addEventListener("pointerup", onCanvasUp);
    canvas.addEventListener("pointercancel", onCanvasUp);
    canvas.addEventListener("pointerleave", onCanvasLeave);
    canvas.addEventListener("contextmenu", prevent);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(onResize);
        ro.observe(board);
    } else {
        window.addEventListener("resize", onResize);
    }

    fitCanvas();
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) app.classList.add("touch");
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (isHost) {
            newMatch();
            publish();
            unsubs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            unsubs.push(room.onState((nextState) => {
                if (!nextState) return;
                state = nextState;
                netAt = performance.now();
                render();
            }));
        }
    } else {
        newMatch();
        render();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            if (raf) cancelAnimationFrame(raf);
            raf = null;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", padDown);
            root.removeEventListener("pointerup", padUp);
            root.removeEventListener("pointercancel", padUp);
            canvas.removeEventListener("pointerdown", onCanvasDown);
            canvas.removeEventListener("pointermove", onCanvasMove);
            canvas.removeEventListener("pointerup", onCanvasUp);
            canvas.removeEventListener("pointercancel", onCanvasUp);
            canvas.removeEventListener("pointerleave", onCanvasLeave);
            canvas.removeEventListener("contextmenu", prevent);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", releaseAll);
            window.removeEventListener("resize", onResize);
            if (ro) ro.disconnect();
            for (const u of unsubs) { if (typeof u === "function") { try { u(); } catch (err) { /* ignore */ } } }
            unsubs.length = 0;
            state = null;
            root.replaceChildren();
        },
    };
}

export const __test = {
    W, H, GROUND, AIRCRAFT, ENEMY, THEMES, CHEAT_TOGGLES, CHEAT_ACTIONS,
    clamp, effDamage, rng, levelPlan, makeState, setVehicle, startLevel, stepWorld, pack,
};