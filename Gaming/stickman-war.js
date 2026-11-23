/* ==== GAME: stickman-war.js ==== */
/* =============================================================
STICKMAN WAR — realtime 2D side-scrolling, base-vs-base.
Format template: export const META + export function mount().
Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
============================================================= */

export const META = {
    id: "stickman-war", // harus sama dengan nama file (tanpa .js)
    name: "Stickman War",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Rekrut pasukan stickman, kelola emas, dan ratakan markas lawan dalam pertempuran realtime 2D side-scrolling.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="13" r="5"/><path d="M15 18v13M15 22l-6 6M15 22l7 3M15 31l-4 10M15 31l5 10"/><path d="M8 27l-3 9" stroke="#93c5fd"/><circle cx="34" cy="13" r="5" stroke="#f87171"/><path d="M34 18v13M34 22l6 6M34 31l-4 10M34 31l5 10" stroke="#f87171"/><path d="M41 27l3 9" stroke="#f87171"/></svg>',
    bg: ["#166534", "#052e16"],
    bestKey: "stickmanWarBest",
};

/* ---------- konstanta dunia (lebih luas dari layar = side-scroll) ---------- */
const WORLD = 1800, GROUND = 340, VIEW_H = 400, CAP = 14;
const BASE_X = [88, WORLD - 88];
const SPAWN_X = [150, WORLD - 150];
const P_GOLD = 60, P_INC = 8, P_IV = 1.2; // income pemain: 8 emas / 1.2 dtk
const ARMY_COL = ["#38bdf8", "#f87171"]; // sisi kiri biru, sisi kanan merah

const UNITS = {
    sword: { key: "sword", name: "Swordman", cost: 20, hp: 60, dmg: 8, spd: 92, range: 30, atkT: 0.7, heal: 0, accent: "#e2e8f0", role: "petarung depan" },
    archer: { key: "archer", name: "Archer", cost: 30, hp: 34, dmg: 7, spd: 78, range: 190, atkT: 1.1, heal: 0, accent: "#fcd34d", role: "penembak jauh" },
    shield: { key: "shield", name: "Shieldman", cost: 35, hp: 150, dmg: 4, spd: 60, range: 30, atkT: 0.9, heal: 0, accent: "#6ee7b7", role: "tembok hidup" },
    medic: { key: "medic", name: "Medic", cost: 40, hp: 40, dmg: 2, spd: 86, range: 90, atkT: 1.0, heal: 6, accent: "#f9a8d4", role: "penyembuh" },
};
const UNIT_KEYS = ["sword", "archer", "shield", "medic"];
const CHEAT_NAMES = { gold: "Emas ∞", god: "Kebal", onehit: "One-hit", freeze: "Beku", gold250: "+250 emas", heal: "Pulih", squad: "Squad gratis", nuke: "Nuke" };

/* ---------- helper murni ---------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function canAfford(gold, cost) {
    return typeof gold === "number" && isFinite(gold) && typeof cost === "number" && cost > 0 && gold >= cost;
}
function spend(gold, cost) { return canAfford(gold, cost) ? gold - cost : null; }
function reward(cost) { return Math.ceil(Math.max(0, cost) / 2); }
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function laneY(u) { return GROUND - u.lane * 9; }
function countArmy(units, army) { let n = 0; for (const u of units) if (u.army === army && u.hp > 0) n++; return n; }

/* ---------- generator level acak (DIJAMIN bisa diselesaikan) ----------
Anggaran kekuatan musuh dibatasi <= 92% pemasukan pemain:
  pemain : P_INC/P_IV emas/dtk + bounty kill (ekonomi makin kuat saat menang).
  musuh  : inc/iv emas/dtk, statistik unit x mul.
  inc dibulatkan ke BAWAH sehingga (inc/iv)*mul <= 0.92 * (P_INC/P_IV).
Kesulitan naik sampai level 10 lalu plateau — selalu ada jalan menang. */
const LV_ADJ = ["Padang", "Abu", "Es", "Bara", "Besi", "Kabut", "Emas", "Sunyi", "Merah", "Rimba"];
const LV_NOUN = ["Bentrokan", "Serbuan", "Pengepungan", "Duel", "Garis Depan", "Penyerangan", "Pertempuran", "Pawai"];
function genLevel(n, seed) {
    const r = rng(seed >>> 0);
    const t = clamp((n - 1) / 10, 0, 1);
    const pps = P_INC / P_IV;
    const mul = 1 + 0.30 * t;
    const power = pps * (0.55 + 0.33 * t + r() * 0.04);
    const iv = 2.4 - 0.8 * t + r() * 0.6;
    const inc = Math.max(4, Math.floor((power / mul) * iv));
    const ebase = Math.round(230 + 130 * t + r() * 50);
    const weights = {
        sword: 2 + r() * 3,
        archer: 1 + r() * 3,
        shield: 1 + r() * 2.5,
        medic: n >= 2 ? 0.5 + r() * 1.5 : 0.3,
    };
    const name = LV_ADJ[Math.floor(r() * LV_ADJ.length)] + " " + LV_NOUN[Math.floor(r() * LV_NOUN.length)];
    return { n, name, ebase, inc, iv, mul, weights };
}
function aiPick(gold, weights, r) {
    if (typeof r !== "function") return null;
    const opts = UNIT_KEYS.filter((k) => UNITS[k].cost <= gold);
    if (!opts.length) return null;
    let total = 0;
    for (const k of opts) total += weights[k] || 1;
    let v = r() * total;
    for (const k of opts) { v -= weights[k] || 1; if (v <= 0) return k; }
    return opts[opts.length - 1];
}

/* ---------- inti simulasi (murni data, dipakai host / mode AI) ---------- */
function createSim({ level, seed, sides, initiative, vsBot }) {
    const L = genLevel(level, seed);
    const bot = vsBot ? 1 - sides[0] : -1;
    const s = {
        rnd: rng((seed ^ 0x9e3779b9) >>> 0),
        level, seed, L, bot, sides: sides.slice(), initiative,
        phase: "ready", winner: -1, speed: 1,
        bases: [0, 1].map((a) => { const hp = a === bot ? L.ebase : 300; return { hp, max: hp }; }),
        gold: [0, 1].map((a) => (a === bot ? 40 : P_GOLD)),
        incT: [0, 0], units: [], arrows: [], fx: [],
        time: 0, nextId: 1, kills: [0, 0], earned: [0, 0],
        cheats: { gold: false, god: false, onehit: false, freeze: false },
        cheated: false,
    };
    s.incT[initiative] = (initiative === bot ? L.iv : P_IV) * 0.55; // head-start undian
    return s;
}
function startPlay(s) {
    if (s.phase !== "ready") return;
    s.phase = "play";
    spawnUnit(s, s.initiative, "sword", true); // hadiah giliran pertama
}
function spawnUnit(s, army, key, free = false) {
    const st = UNITS[key];
    if (!st || countArmy(s.units, army) >= CAP) return false;
    if (!free) {
        const g = spend(s.gold[army], st.cost);
        if (g === null) return false;
        s.gold[army] = g;
    }
    const mul = army === s.bot ? s.L.mul : 1;
    const hp = Math.round(st.hp * mul);
    const u = {
        id: s.nextId++, key, army, dir: army === 0 ? 1 : -1,
        x: SPAWN_X[army] + (s.rnd() * 16 - 8), lane: Math.floor(s.rnd() * 3),
        hp, maxHp: hp, dmg: Math.max(1, Math.round(st.dmg * mul)),
        spd: st.spd, range: st.range, heal: st.heal,
        atkCd: st.atkT, atkT: 0.25 + s.rnd() * 0.4,
        walk: s.rnd() * 9, swing: 0, moving: true,
    };
    s.units.push(u);
    s.fx.push({ kind: "ring", x: u.x, y: laneY(u) - 20, t: 0, life: 0.45, color: ARMY_COL[army] });
    return true;
}
function dealUnit(s, u, dmg, src) {
    if (u.hp <= 0) return;
    if (s.cheats.god && u.army === s.sides[0]) return;
    u.hp = Math.max(0, u.hp - dmg);
    if (u.hp <= 0) {
        s.kills[src]++;
        s.fx.push({ kind: "corpse", x: u.x, y: laneY(u), t: 0, life: 0.6, army: u.army, dir: u.dir, key: u.key, lane: u.lane });
        if (src !== s.bot) {
            const b = reward(UNITS[u.key].cost);
            s.gold[src] += b; s.earned[src] += b;
            s.fx.push({ kind: "coin", x: u.x, y: laneY(u) - 46, t: 0, life: 0.9, txt: "+" + b });
        }
    }
}
function dealBase(s, army, dmg, src) {
    const b = s.bases[army];
    if (b.hp <= 0) return;
    if (s.cheats.god && army === s.sides[0]) return;
    b.hp = Math.max(0, b.hp - dmg);
    s.fx.push({ kind: "basehit", x: BASE_X[army], y: GROUND - 60, t: 0, life: 0.4, color: ARMY_COL[army], big: b.hp <= 0 });
    if (b.hp <= 0) { s.phase = "ended"; s.winner = src; }
}
function stepUnit(s, u, dt, foes, allies, overtime) {
    u.atkT -= dt;
    u.swing = Math.max(0, u.swing - dt * 3);
    const boost = s.cheats.onehit && u.army === s.sides[0] ? 999 : 1;
    let tgt = null, best = 1e9;
    for (const f of foes) {
        if (f.hp <= 0) continue;
        const d = Math.abs(f.x - u.x);
        if (d <= u.range && d < best) { best = d; tgt = f; }
    }
    if (u.heal > 0) {
        let healT = null, miss = 0;
        for (const al of allies) {
            if (al === u || al.hp <= 0 || al.hp >= al.maxHp) continue;
            if (Math.abs(al.x - u.x) > u.range) continue;
            const m = al.maxHp - al.hp;
            if (m > miss) { miss = m; healT = al; }
        }
        if (healT) {
            u.moving = false;
            if (u.atkT <= 0) {
                u.atkT = u.atkCd; u.swing = 1;
                healT.hp = Math.min(healT.maxHp, healT.hp + u.heal);
                s.fx.push({ kind: "heal", x: healT.x, y: laneY(healT) - 34, t: 0, life: 0.5 });
            }
            return;
        }
    }
    if (tgt) {
        u.moving = false;
        if (u.atkT <= 0) {
            u.atkT = u.atkCd; u.swing = 1;
            const dmg = u.dmg * boost * overtime;
            if (u.key === "archer") {
                s.arrows.push({ x0: u.x + u.dir * 10, y0: laneY(u) - 30, x1: tgt.x, y1: laneY(tgt) - 24, t: 0, dur: clamp(best / 460, 0.12, 0.5), dmg, src: u.army, tid: tgt.id, base: -1 });
            } else {
                dealUnit(s, tgt, dmg, u.army);
                s.fx.push({ kind: "clash", x: (u.x + tgt.x) / 2, y: laneY(u) - 22, t: 0, life: 0.3 });
            }
        }
        return;
    }
    const enemy = 1 - u.army;
    const stop = u.key === "archer" ? 150 : 46;
    const stopX = BASE_X[enemy] - u.dir * stop;
    const atBase = u.dir > 0 ? u.x >= stopX - 0.5 : u.x <= stopX + 0.5;
    if (atBase) {
        u.moving = false;
        if (u.atkT <= 0) {
            u.atkT = u.atkCd; u.swing = 1;
            const dmg = u.dmg * boost * overtime;
            if (u.key === "archer") {
                s.arrows.push({ x0: u.x + u.dir * 10, y0: laneY(u) - 30, x1: BASE_X[enemy], y1: GROUND - 60, t: 0, dur: 0.35, dmg, src: u.army, tid: -1, base: enemy });
            } else {
                dealBase(s, enemy, dmg, u.army);
            }
        }
        return;
    }
    let nx = u.x + u.dir * u.spd * dt;
    let limit = null;
    for (const al of allies) {
        if (al === u || al.hp <= 0 || al.lane !== u.lane) continue;
        const ahead = u.dir > 0 ? al.x > u.x : al.x < u.x;
        if (!ahead) continue;
        const gap = u.dir > 0 ? al.x - 16 : al.x + 16;
        if (limit === null || (u.dir > 0 ? gap < limit : gap > limit)) limit = gap;
    }
    if (limit !== null) nx = u.dir > 0 ? Math.min(nx, limit) : Math.max(nx, limit);
    nx = u.dir > 0 ? Math.min(nx, stopX) : Math.max(nx, stopX);
    nx = u.dir > 0 ? Math.max(nx, u.x) : Math.min(nx, u.x);
    u.moving = Math.abs(nx - u.x) > 0.01;
    u.x = nx;
    u.walk += dt * (u.moving ? u.spd / 13 : 1.5);
}
function stepSim(s, dt) {
    if (s.phase !== "play") return;
    s.time += dt;
    for (const army of [0, 1]) {
        if (s.cheats.freeze && army === s.bot) continue;
        const iv = army === s.bot ? s.L.iv : P_IV;
        s.incT[army] += dt;
        if (s.incT[army] >= iv) {
            s.incT[army] -= iv;
            s.gold[army] += army === s.bot ? s.L.inc : P_INC;
            if (army === s.bot) {
                for (let i = 0; i < 2; i++) {
                    const k = aiPick(s.gold[army], s.L.weights, s.rnd);
                    if (!k || !spawnUnit(s, army, k)) break;
                }
            }
        }
    }
    if (s.cheats.gold) s.gold[s.sides[0]] = 9999;
    const by = [[], []];
    for (const u of s.units) if (u.hp > 0) by[u.army].push(u);
    const overtime = 1 + Math.max(0, s.time - 120) / 60; // damage naik setelah 2 mnt agar laga pasti selesai
    for (const u of s.units) {
        if (u.hp <= 0) continue;
        if (s.cheats.freeze && u.army === s.bot) { u.moving = false; continue; }
        stepUnit(s, u, dt, by[1 - u.army], by[u.army], overtime);
        if (s.phase !== "play") break;
    }
    for (const a of s.arrows) {
        a.t += dt;
        if (a.t >= a.dur && !a.done) {
            a.done = true;
            if (a.base >= 0) dealBase(s, a.base, a.dmg, a.src);
            else {
                const t = s.units.find((v) => v.id === a.tid && v.hp > 0);
                if (t) { dealUnit(s, t, a.dmg, a.src); s.fx.push({ kind: "spark", x: t.x, y: laneY(t) - 24, t: 0, life: 0.25 }); }
                else s.fx.push({ kind: "spark", x: a.x1, y: a.y1, t: 0, life: 0.25 });
            }
        }
    }
    s.arrows = s.arrows.filter((a) => a.t < a.dur + 0.02);
    s.units = s.units.filter((u) => u.hp > 0);
    idleStep(s, dt);
}
function idleStep(s, dt) {
    for (const f of s.fx) {
        f.t += dt;
        if (f.kind === "confetti") { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; f.rot += f.vr * dt; }
    }
    s.fx = s.fx.filter((f) => f.t < f.life);
    if (s.fx.length > 220) s.fx.splice(0, s.fx.length - 220);
}
/* snapshot ringkas untuk Firebase (host -> tamu, ~4x/dtk) */
function snapshot(s) {
    return {
        v: 1, phase: s.phase, winner: s.winner, level: s.level, seed: s.seed,
        name: s.L.name, sides: s.sides, initiative: s.initiative,
        speed: s.speed, cheated: s.cheated,
        bases: s.bases.map((b) => Math.ceil(b.hp)), baseMax: s.bases.map((b) => b.max),
        gold: s.gold.map((g) => Math.floor(g)),
        counts: [countArmy(s.units, 0), countArmy(s.units, 1)],
        kills: s.kills.slice(), earned: s.earned.map((v) => Math.floor(v)),
        time: Math.round(s.time * 10) / 10,
        units: s.units.filter((u) => u.hp > 0).map((u) => ({ i: u.id, k: u.key, a: u.army, x: Math.round(u.x * 10) / 10, h: Math.ceil(u.hp), m: u.maxHp, l: u.lane })),
    };
}

/* ---------- ikon ---------- */
const ICONS = {
    pause: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.6" height="12" rx="1"/><rect x="9.4" y="2" width="3.6" height="12" rx="1"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
    cam: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="3.2"/><path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3"/></svg>',
    help: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="7.4"/><path d="M6.8 6.8a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2.9-1.2 1.7"/><circle cx="9" cy="13.4" r=".5" fill="currentColor"/></svg>',
    bug: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><ellipse cx="9" cy="10" rx="4" ry="5"/><path d="M9 5V3M6 4l1.4 1.6M12 4l-1.4 1.6M5 9H2.5M15.5 9H13M5.5 12l-2 1.6M12.5 12l2 1.6M9 7.5v6"/></svg>',
    redo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.7 1.8v3h-3"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3l-5 5 5 5"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    coin: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4.2" fill="#fbbf24"/><circle cx="5" cy="5" r="2.4" fill="none" stroke="#00000033"/></svg>',
};
function unitIcon(key) {
    const acc = UNITS[key].accent;
    let w = "";
    if (key === "sword") w = '<path d="M11 12l7-4" stroke="' + acc + '"/><path d="M11 12l-4 3"/>';
    else if (key === "archer") w = '<path d="M15 8a6 6 0 0 1 0 10" stroke="' + acc + '"/><path d="M11 12l6-1"/>';
    else if (key === "shield") w = '<rect x="13" y="8" width="5" height="10" rx="2" fill="#065f46" stroke="' + acc + '"/><path d="M11 12l3-2"/>';
    else w = '<circle cx="15" cy="14" r="3.4" fill="' + acc + '" stroke="none"/><path d="M15 12.4v3.2M13.4 14h3.2" stroke="#0a1a10" stroke-width="1.1"/><path d="M11 12l3 2"/>';
    return '<svg width="24" height="24" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="5" r="2.6"/><path d="M9 8v6M9 14l-3.4 6M9 14l3.4 6"/>' + w + "</svg>";
}

/* =============================================================
mount() — UI, rendering canvas, input, sinkronisasi room.
============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost); // mode AI = otoritas lokal
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;

    /* ---------- state ---------- */
    let sim = null;                                  // otoritas (AI / host)
    let snapPrev = null, snapCur = null, snapAt = 0; // tamu (interpolasi)
    let destroyed = false, hover = false;
    let helpOpen = true, cheatOpen = false, helpPause = false;
    let follow = true, camX = 0, camT = 0, padDir = 0, keyDir = 0;
    let shake = { t: 0, life: 1, mag: 0 }, mm = null;
    let lastPhase = "", lastGuestPhase = "", lastLevelKey = "";
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }
    const subs = [];
    const gCache = new Map();
    let gFx = [], gArrows = [];
    const motionOK = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const stars = (() => { const r = rng(7); const a = []; for (let i = 0; i < 70; i++) a.push({ x: r() * 2200, y: r() * 170, s: r() * 1.2 + 0.5, a: r() * 0.45 + 0.15 }); return a; })();

    /* ---------- markup + gaya (minimalis) ---------- */
    root.innerHTML = `
<style>
.sw-shell{--sw-line:#ffffff14;--sw-tx:#e7ecf3;--sw-mut:#8fa3b8;--sw-gold:#fbbf24;--sw-ok:#34d399;--sw-bad:#f87171;width:100%;display:flex;flex-direction:column;gap:10px;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--sw-tx)}
.sw-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sw-chip{display:inline-flex;align-items:center;gap:6px;background:#ffffff08;border:1px solid var(--sw-line);border-radius:999px;padding:4px 10px;font-size:12px;color:var(--sw-mut);white-space:nowrap}
.sw-chip b{color:var(--sw-tx);font-variant-numeric:tabular-nums}
.sw-goldv{color:var(--sw-gold)!important}
.sw-lname{color:var(--sw-mut);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis}
.sw-bar{width:44px;height:4px;border-radius:2px;background:#ffffff14;overflow:hidden}
.sw-bar i{display:block;height:100%;width:100%;border-radius:2px;background:var(--sw-ok)}
.sw-inc{width:34px;height:3px}
.sw-inc i{background:var(--sw-gold)}
.sw-badge{color:#fbbf24;border-color:#fbbf2455;background:#fbbf2412;font-weight:800;letter-spacing:.5px}
.sw-stage{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--sw-line);background:#0a1410;user-select:none;-webkit-user-select:none}
.sw-stage canvas{display:block;width:100%;touch-action:none;cursor:grab}
.sw-stage canvas:active{cursor:grabbing}
.sw-toast{position:absolute;top:30px;left:50%;transform:translateX(-50%);background:#0d1a14ee;border:1px solid #ffffff22;color:var(--sw-tx);border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:600;pointer-events:none;opacity:0;transition:opacity .25s,top .25s;z-index:5;max-width:88%;text-align:center}
.sw-toast.show{opacity:1;top:38px}
.sw-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#040a08b8;backdrop-filter:blur(3px);z-index:10;padding:12px}
.sw-ov[hidden]{display:none}
.sw-card{background:#0d1a14f2;border:1px solid #ffffff1c;border-radius:16px;padding:18px;width:min(94%,560px);max-height:92%;overflow:auto;animation:sw-pop .22s ease}
@keyframes sw-pop{from{opacity:0;transform:scale(.96) translateY(6px)}to{opacity:1;transform:none}}
.sw-card h3{margin:0 0 4px;font-size:19px}
.sw-sub{margin:0 0 10px;color:var(--sw-mut);font-size:13px;line-height:1.5}
.sw-steps{margin:0 0 12px;padding-left:18px;display:grid;gap:6px;font-size:13px;line-height:1.45}
.sw-steps b{color:var(--sw-ok)}
.sw-legend{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.sw-leg{background:#ffffff06;border:1px solid var(--sw-line);border-radius:10px;padding:8px 6px;text-align:center;font-size:11px;color:var(--sw-mut)}
.sw-leg b{display:block;color:var(--sw-tx);font-size:11.5px;margin:4px 0 2px}
.sw-leg .sw-uic{display:flex;justify-content:center}
.sw-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.sw-cols>div{background:#ffffff06;border:1px solid var(--sw-line);border-radius:10px;padding:8px 10px;font-size:11.5px;color:var(--sw-mut);line-height:1.55}
.sw-cols h4{margin:0 0 4px;font-size:12px;color:var(--sw-tx)}
.sw-tip{font-size:12px;color:#fcd34d;background:#fcd34d12;border:1px solid #fcd34d2e;border-radius:10px;padding:8px 10px;margin:0 0 12px;line-height:1.5}
.sw-ovbtns{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sw-cta{background:var(--sw-ok);color:#04120b;border:0;border-radius:10px;padding:10px 18px;font-weight:800;font-size:14px;cursor:pointer}
.sw-cta:hover{filter:brightness(1.1)}
.sw-ghost{background:transparent;color:var(--sw-tx);border:1px solid #ffffff2a;border-radius:10px;padding:10px 14px;font-weight:700;font-size:13px;cursor:pointer}
.sw-ghost:hover{border-color:#ffffff55}
.sw-x{margin-left:auto;background:none;border:0;color:var(--sw-mut);font-size:16px;cursor:pointer;padding:4px}
.sw-ovhead{display:flex;align-items:center;gap:8px}
.sw-center{text-align:center}
.sw-stats{display:flex;justify-content:center;gap:18px;margin:10px 0}
.sw-stats b{display:block;font-size:20px;color:var(--sw-tx)}
.sw-stats span{font-size:11px;color:var(--sw-mut)}
.sw-win{color:var(--sw-ok)}
.sw-lose{color:var(--sw-bad)}
.sw-cheats{display:grid;gap:6px;margin-bottom:10px}
.sw-cheat{display:flex;align-items:center;gap:10px;background:#ffffff06;border:1px solid var(--sw-line);border-radius:10px;padding:9px 12px;color:var(--sw-tx);font-size:13px;font-weight:600;cursor:pointer;text-align:left;width:100%}
.sw-cheat:hover{border-color:#ffffff3a}
.sw-cheat .sw-dot{width:10px;height:10px;border-radius:50%;background:#ffffff22;flex:none}
.sw-cheat[aria-pressed="true"]{border-color:#fbbf2466;background:#fbbf2410}
.sw-cheat[aria-pressed="true"] .sw-dot{background:var(--sw-gold)}
.sw-cheat small{margin-left:auto;color:var(--sw-mut);font-weight:500}
.sw-controls{display:flex;gap:8px;align-items:stretch}
.sw-units{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:1}
.sw-unit{position:relative;display:flex;align-items:center;gap:8px;background:#ffffff07;border:1px solid var(--sw-line);border-radius:12px;padding:8px 10px;min-height:54px;color:var(--sw-tx);cursor:pointer;transition:transform .08s,border-color .15s,background .15s;font-family:inherit}
.sw-unit:hover{border-color:var(--uc);background:#ffffff0d}
.sw-unit:active{transform:scale(.96)}
.sw-unit .sw-uic{color:var(--uc);flex:none;display:flex}
.sw-utx{display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;min-width:0}
.sw-utx b{font-size:12.5px}
.sw-utx i{font-style:normal;font-size:11.5px;color:var(--sw-gold);font-weight:700;display:flex;align-items:center;gap:3px}
.sw-unit kbd{position:absolute;top:4px;right:6px;font-size:9.5px;color:var(--sw-mut);border:1px solid var(--sw-line);border-radius:4px;padding:0 4px;font-family:inherit}
.sw-unit.is-off{opacity:.45}
.sw-unit.is-off .sw-utx i{color:var(--sw-bad)}
.sw-unit.pulse{animation:sw-pulse .3s}
@keyframes sw-pulse{0%{box-shadow:0 0 0 0 var(--uc)}100%{box-shadow:0 0 0 8px transparent}}
.sw-tools{display:flex;gap:6px;align-items:stretch;flex-wrap:wrap}
.sw-tool{width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;background:#ffffff07;border:1px solid var(--sw-line);border-radius:12px;color:var(--sw-mut);cursor:pointer;font-size:12px;font-weight:800;font-family:inherit}
.sw-tool:hover{color:var(--sw-tx);border-color:#ffffff3a}
.sw-tool[aria-pressed="true"]{color:var(--sw-ok);border-color:#34d39955;background:#34d39910}
.sw-padbtn{display:none}
.sw-hint{font-size:11px;color:var(--sw-mut);text-align:center;line-height:1.5}
.sw-flash{animation:sw-flash .35s}
@keyframes sw-flash{0%,100%{background:#ffffff08}50%{background:#f8717133;border-color:#f87171}}
@media (max-width:640px){
.sw-units{grid-template-columns:repeat(2,1fr)}
.sw-controls{flex-direction:column}
.sw-tools{justify-content:center}
.sw-legend{grid-template-columns:repeat(2,1fr)}
.sw-cols{grid-template-columns:1fr}
.sw-chip{font-size:11px;padding:3px 8px}
.sw-lname{max-width:80px}
}
@media (pointer:coarse){.sw-padbtn{display:flex}.sw-unit kbd{display:none}}
@media (prefers-reduced-motion:reduce){.sw-card,.sw-unit.pulse,.sw-flash{animation:none}}
</style>
<div class="game-app">
  <div class="game-intro">
    <div><h2>Stickman War</h2><p>Rekrut pasukan, kelola emas, ratakan markas lawan. Realtime 2D side-scrolling.</p></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Siap</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="sw-shell">
      <div class="sw-top">
        <span class="sw-chip">Lv <b data-hud="level">1</b><span class="sw-lname" data-hud="lname"></span></span>
        <span class="sw-chip" data-goldchip>Emas <b class="sw-goldv" data-hud="gold">60</b><span class="sw-bar sw-inc"><i data-hud="inc"></i></span></span>
        <span class="sw-chip">Markasmu <b data-hud="pbase">300</b><span class="sw-bar"><i data-hud="pbar"></i></span></span>
        <span class="sw-chip">Lawan <b data-hud="ebase">300</b><span class="sw-bar"><i data-hud="ebar"></i></span></span>
        <span class="sw-chip">Pasukan <b data-hud="army">0</b>/14</span>
        <span class="sw-chip">Duluan <b data-hud="first">-</b></span>
        <span class="sw-chip sw-badge" data-hud="cheat" hidden>CHEAT</span>
        <span class="sw-chip" data-hud="bestwrap" hidden>Rekor <b data-hud="best">0</b></span>
      </div>
      <div class="sw-stage" data-stage>
        <canvas data-canvas role="img" aria-label="Medan perang stickman 2D side-scrolling"></canvas>
        <div class="sw-toast" data-toast hidden></div>
        <div class="sw-ov" data-ov="help">
          <div class="sw-card">
            <div class="sw-ovhead"><h3 data-h="helpTitle">Stickman War</h3><button type="button" class="sw-x" data-close="help" aria-label="Tutup">✕</button></div>
            <p class="sw-sub" data-h="helpSub"></p>
            <ol class="sw-steps">
              <li><b>Emas mengalir otomatis.</b> Pantau bar kecil di chip Emas — itu income berikutnya.</li>
              <li><b>Rekrut pasukan.</b> Klik tombol unit (atau tekan 1–4). Unit berjalan &amp; bertarung sendiri.</li>
              <li><b>Ratakan markas lawan</b> sebelum markasmu hancur. Membunuh musuh = bonus emas.</li>
            </ol>
            <div class="sw-legend" data-legend></div>
            <div class="sw-cols">
              <div><h4>⌨ Desktop</h4>1–4 rekrut · Space jeda · F kamera auto · A/D atau seret = geser · scroll = geser · H bantuan · C cheat · R ulang · Enter mulai</div>
              <div><h4>📱 Mobile</h4>Ketuk tombol unit · seret medan untuk geser · tombol ◀ ▶ geser kamera · ketuk minimap untuk lompat</div>
            </div>
            <p class="sw-tip">💡 Mulai dengan 1 Shieldman di depan, 2 Archer di belakang, lalu Medic. Shield menahan, Archer menembak dari jauh, Medic menyembuhkan. Side &amp; giliran pertama diacak tiap laga!</p>
            <div class="sw-ovbtns">
              <button type="button" class="sw-cta" data-act="start" data-h="startBtn">Mulai bertempur ▸</button>
              <button type="button" class="sw-ghost" data-act="closehelp" data-h="closeHelpBtn" hidden>Lanjut main</button>
              <span class="sw-sub" data-h="wait" hidden style="margin:0">Menunggu host memulai…</span>
            </div>
          </div>
        </div>
        <div class="sw-ov" data-ov="end" hidden>
          <div class="sw-card sw-center">
            <h3 data-h="endTitle">Menang!</h3>
            <p class="sw-sub" data-h="endSub"></p>
            <div class="sw-stats">
              <div><b data-h="stK">0</b><span>Kill</span></div>
              <div><b data-h="stG">0</b><span>Emas didapat</span></div>
              <div><b data-h="stT">0s</b><span>Waktu</span></div>
            </div>
            <p class="sw-sub" data-h="endBest"></p>
            <div class="sw-ovbtns" style="justify-content:center">
              <button type="button" class="sw-cta" data-act="next" data-h="nextBtn">Lanjut ▸</button>
              <button type="button" class="sw-ghost" data-act="restart" data-h="retryBtn">Ulang level</button>
              <span class="sw-sub" data-h="endWait" hidden style="margin:0">Menunggu host…</span>
            </div>
          </div>
        </div>
        <div class="sw-ov" data-ov="pause" hidden>
          <div class="sw-card sw-center">
            <h3>Jeda</h3>
            <p class="sw-sub">Tekan Space atau tombol lanjut.</p>
            <div class="sw-ovbtns" style="justify-content:center">
              <button type="button" class="sw-cta" data-act="resume" data-h="resumeBtn">Lanjut ▸</button>
              <span class="sw-sub" data-h="pauseWait" hidden style="margin:0">Host menjeda permainan.</span>
            </div>
          </div>
        </div>
        <div class="sw-ov" data-ov="cheat" hidden>
          <div class="sw-card">
            <div class="sw-ovhead"><h3>🐞 Cheat</h3><button type="button" class="sw-x" data-close="cheat" aria-label="Tutup">✕</button></div>
            <p class="sw-sub">Biar santai. Rekor tidak dicatat selama cheat dipakai.</p>
            <div class="sw-cheats">
              <button type="button" class="sw-cheat" data-cheat="gold" aria-pressed="false"><span class="sw-dot"></span>Emas tak terbatas<small>toggle</small></button>
              <button type="button" class="sw-cheat" data-cheat="god" aria-pressed="false"><span class="sw-dot"></span>Mode kebal (markas &amp; pasukan)<small>toggle</small></button>
              <button type="button" class="sw-cheat" data-cheat="onehit" aria-pressed="false"><span class="sw-dot"></span>Sekali pukul mati<small>toggle</small></button>
              <button type="button" class="sw-cheat" data-cheat="freeze" aria-pressed="false"><span class="sw-dot"></span>Bekukan musuh<small>toggle</small></button>
              <button type="button" class="sw-cheat" data-cheat="gold250"><span class="sw-dot"></span>+250 emas<small>klik</small></button>
              <button type="button" class="sw-cheat" data-cheat="heal"><span class="sw-dot"></span>Pulihkan markas &amp; pasukan<small>klik</small></button>
              <button type="button" class="sw-cheat" data-cheat="squad"><span class="sw-dot"></span>Pasukan gratis (shield + archer + medic)<small>klik</small></button>
              <button type="button" class="sw-cheat" data-cheat="nuke"><span class="sw-dot"></span>Ratakan markas musuh<small>menang instan</small></button>
            </div>
            <div class="sw-ovbtns"><button type="button" class="sw-ghost" data-act="closecheat">Tutup</button></div>
          </div>
        </div>
      </div>
      <div class="sw-controls">
        <div class="sw-units" data-units></div>
        <div class="sw-tools" data-tools></div>
      </div>
      <div class="sw-hint" data-hint></div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar game</button></div>
</div>`;

    /* ---------- referensi DOM ---------- */
    const $ = (s) => root.querySelector(s);
    const stage = $("[data-stage]");
    const canvas = $("[data-canvas]");
    const ctx = canvas.getContext("2d");
    const toastEl = $("[data-toast]");
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const ovHelp = $('[data-ov="help"]'), ovEnd = $('[data-ov="end"]'), ovPause = $('[data-ov="pause"]'), ovCheat = $('[data-ov="cheat"]');
    const hud = {};
    root.querySelectorAll("[data-hud]").forEach((el) => { hud[el.dataset.hud] = el; });
    const H = {};
    root.querySelectorAll("[data-h]").forEach((el) => { H[el.dataset.h] = el; });
    const goldChip = $("[data-goldchip]");

    $("[data-legend]").innerHTML = UNIT_KEYS.map((k) =>
        '<div class="sw-leg"><span class="sw-uic" style="color:' + UNITS[k].accent + '">' + unitIcon(k) + "</span><b>" + UNITS[k].name + "</b>" + UNITS[k].role + " · " + UNITS[k].cost + " emas</div>"
    ).join("");
    $("[data-units]").innerHTML = UNIT_KEYS.map((k, i) =>
        '<button type="button" class="sw-unit" data-buy="' + k + '" style="--uc:' + UNITS[k].accent + '" aria-label="Rekrut ' + UNITS[k].name + " (" + UNITS[k].cost + ' emas)"><span class="sw-uic">' + unitIcon(k) + '</span><span class="sw-utx"><b>' + UNITS[k].name + "</b><i>" + ICONS.coin + UNITS[k].cost + "</i></span><kbd>" + (i + 1) + "</kbd></button>"
    ).join("");
    $("[data-tools]").innerHTML =
        '<button type="button" class="sw-tool sw-padbtn" data-pad="l" aria-label="Geser kamera kiri">' + ICONS.left + "</button>" +
        '<button type="button" class="sw-tool" data-tool="pause" aria-label="Jeda">' + ICONS.pause + "</button>" +
        '<button type="button" class="sw-tool" data-tool="speed" aria-label="Kecepatan game">1×</button>' +
        '<button type="button" class="sw-tool" data-tool="follow" aria-label="Kamera ikuti pertempuran" aria-pressed="true">' + ICONS.cam + "</button>" +
        '<button type="button" class="sw-tool" data-tool="help" aria-label="Bantuan">' + ICONS.help + "</button>" +
        '<button type="button" class="sw-tool" data-tool="cheat" aria-label="Cheat">' + ICONS.bug + "</button>" +
        '<button type="button" class="sw-tool" data-tool="restart" aria-label="Ulang level">' + ICONS.redo + "</button>" +
        '<button type="button" class="sw-tool sw-padbtn" data-pad="r" aria-label="Geser kamera kanan">' + ICONS.right + "</button>";
    const unitBtns = {};
    root.querySelectorAll("[data-buy]").forEach((b) => { unitBtns[b.dataset.buy] = b; });
    const toolPause = $('[data-tool="pause"]'), toolSpeed = $('[data-tool="speed"]'), toolFollow = $('[data-tool="follow"]'),
        toolCheat = $('[data-tool="cheat"]'), toolRestart = $('[data-tool="restart"]');
    const cheatToggles = {};
    root.querySelectorAll(".sw-cheat[data-cheat]").forEach((b) => { if (["gold", "god", "onehit", "freeze"].includes(b.dataset.cheat)) cheatToggles[b.dataset.cheat] = b; });
    $("[data-hint]").textContent = coarse
        ? "Ketuk tombol untuk rekrut · seret medan / tombol ◀ ▶ untuk geser · ketuk minimap untuk lompat."
        : "1–4 rekrut · Space jeda · F kamera auto · A/D atau seret untuk geser · H bantuan · C cheat · R ulang.";

    /* ---------- canvas & kamera ---------- */
    let viewW = 920, scale = 1;
    function resize() {
        const w = Math.max(300, stage.clientWidth || root.clientWidth || 640);
        viewW = w < 680 ? 640 : 920;
        const h = Math.round((w * VIEW_H) / viewW);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.height = h + "px";
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        scale = canvas.width / viewW;
        camT = clamp(camT, 0, WORLD - viewW);
        camX = clamp(camX, 0, WORLD - viewW);
    }
    function myArmy() {
        if (sim) return sim.sides[playerIndex];
        if (snapCur && snapCur.sides) return snapCur.sides[playerIndex] ?? 0;
        return 0;
    }
    function resetCam() {
        const my = myArmy(), dir = my === 0 ? 1 : -1;
        camT = clamp(BASE_X[my] + dir * 180 - viewW / 2, 0, WORLD - viewW);
        camX = camT; follow = true; syncFollow();
    }
    function frontline(v) {
        let max0 = -1e9, min1 = 1e9, a0 = false, a1 = false;
        for (const u of v.units) {
            if (u.army === 0) { a0 = true; if (u.x > max0) max0 = u.x; }
            else { a1 = true; if (u.x < min1) min1 = u.x; }
        }
        if (a0 && a1) return (max0 + min1) / 2;
        if (a0) return max0;
        if (a1) return min1;
        const my = myArmy();
        return BASE_X[my] + (my === 0 ? 160 : -160);
    }
    function updateCam(v, dt) {
        if (padDir || keyDir) { follow = false; camT += (padDir + keyDir) * 560 * dt; syncFollow(); }
        else if (follow && v) camT = frontline(v) - viewW / 2;
        camT = clamp(camT, 0, WORLD - viewW);
        camX += (camT - camX) * Math.min(1, dt * 5);
    }
    function syncFollow() { toolFollow.setAttribute("aria-pressed", follow ? "true" : "false"); }
    function addShake(m) {
        if (!motionOK) return;
        const d = m > 5 ? 0.5 : 0.22;
        if (m > shake.mag * (shake.t / shake.life || 0)) shake = { t: d, life: d, mag: m };
    }

    /* ---------- view: otoritas vs tamu (interpolasi snapshot) ---------- */
    function guestView(now, dt) {
        if (!snapCur) return null;
        const sameMatch = snapPrev && snapPrev.level === snapCur.level && snapPrev.seed === snapCur.seed;
        const pm = new Map((sameMatch ? snapPrev.units : []).map((u) => [u.i, u]));
        const alpha = clamp((now - snapAt) / 300, 0, 1);
        const units = snapCur.units.map((su) => {
            const p = pm.get(su.i);
            const x = p ? p.x + (su.x - p.x) * alpha : su.x;
            let cch = gCache.get(su.i);
            if (!cch) { cch = { walk: Math.random() * 9, swing: 0, px: x, shot: 0 }; gCache.set(su.i, cch); }
            const dx = x - cch.px; cch.px = x;
            const moving = Math.abs(dx) > 0.05;
            if (moving) cch.walk += dt * 7;
            const dir = su.a === 0 ? 1 : -1;
            let near = 1e9;
            for (const o of snapCur.units) if (o.a !== su.a) { const d = Math.abs(o.x - su.x); if (d < near) near = d; }
            const rr_ = su.k === "archer" ? 190 : 34;
            if (!moving && near <= rr_) {
                cch.swing = Math.max(cch.swing, (Math.sin(now / 170 + su.i) + 1) / 2);
                if (su.k === "archer" && now - cch.shot > 1200 + (su.i % 5) * 130) {
                    cch.shot = now;
                    let t = null, bd = 1e9;
                    for (const o of snapCur.units) if (o.a !== su.a) { const d = Math.abs(o.x - su.x); if (d < bd) { bd = d; t = o; } }
                    if (t) gArrows.push({ x0: su.x + dir * 10, y0: GROUND - su.l * 9 - 30, x1: t.x, y1: GROUND - t.l * 9 - 24, t: 0, dur: clamp(bd / 460, 0.12, 0.5) });
                }
            } else cch.swing = Math.max(0, cch.swing - dt * 3);
            return { id: su.i, key: su.k, army: su.a, dir, x, lane: su.l, hp: su.h, maxHp: su.m, walk: cch.walk, swing: cch.swing };
        });
        if (gCache.size > 80) { const ids = new Set(snapCur.units.map((u) => u.i)); for (const k of gCache.keys()) if (!ids.has(k)) gCache.delete(k); }
        for (const a of gArrows) a.t += dt;
        gArrows = gArrows.filter((a) => a.t < a.dur);
        for (const f of gFx) { f.t += dt; if (f.kind === "confetti") { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; f.rot += f.vr * dt; } }
        gFx = gFx.filter((f) => f.t < f.life);
        return { units, arrows: gArrows, fx: gFx, bases: [{ hp: snapCur.bases[0], max: snapCur.baseMax[0] }, { hp: snapCur.bases[1], max: snapCur.baseMax[1] }], phase: snapCur.phase };
    }
    function confetti(army) {
        const target = sim ? sim.fx : gFx;
        const cols = ["#fbbf24", "#34d399", "#38bdf8", "#f9a8d4", "#e2e8f0"];
        for (let i = 0; i < 90; i++) {
            target.push({ kind: "confetti", x: BASE_X[army] + (Math.random() * 160 - 80), y: GROUND - 140 - Math.random() * 60, vx: Math.random() * 160 - 80, vy: -60 - Math.random() * 120, rot: Math.random() * 6, vr: Math.random() * 8 - 4, t: 0, life: 2.2, color: cols[i % 5] });
        }
    }

    /* ---------- rendering canvas ---------- */
    function rr(x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function drawHills(par, baseY, amp, color, ph) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, VIEW_H);
        for (let sx = 0; sx <= viewW; sx += 24) {
            const wx = sx + camX * par;
            ctx.lineTo(sx, baseY - (Math.sin(wx * 0.004 + ph) * amp + Math.sin(wx * 0.011 + ph * 2) * amp * 0.4));
        }
        ctx.lineTo(viewW, VIEW_H);
        ctx.closePath(); ctx.fill();
    }
    function drawTrees() {
        const par = 0.6, step = 120;
        const start = Math.floor((camX * par) / step) * step;
        ctx.fillStyle = "#0f2418";
        for (let wx = start; wx < camX * par + viewW + step; wx += step) {
            const h = hash(wx), sx = wx - camX * par, th = 34 + h * 44;
            if (h > 0.35) {
                ctx.beginPath(); ctx.moveTo(sx, GROUND - th); ctx.lineTo(sx - 12 - h * 8, GROUND); ctx.lineTo(sx + 12 + h * 8, GROUND); ctx.closePath(); ctx.fill();
            } else {
                ctx.fillRect(sx - 5, GROUND - th * 0.6, 10, th * 0.6);
                ctx.fillRect(sx - 8, GROUND - th * 0.6 - 5, 16, 5);
            }
        }
    }
    function drawBase(a, v, now) {
        const bx = BASE_X[a] - camX;
        if (bx < -120 || bx > viewW + 120) return;
        const b = v.bases[a], col = ARMY_COL[a];
        const w = 76, h = 96, x0 = bx - w / 2, y0 = GROUND - h;
        const dead = b.hp <= 0;
        ctx.save();
        if (dead) { ctx.translate(bx, GROUND); ctx.rotate(a === 0 ? -0.06 : 0.06); ctx.translate(-bx, -GROUND); }
        ctx.fillStyle = a === 0 ? "#10312a" : "#331416";
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        rr(x0, y0, w, h, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#00000055";
        ctx.beginPath(); ctx.moveTo(bx - 11, GROUND); ctx.lineTo(bx - 11, GROUND - 22); ctx.arc(bx, GROUND - 22, 11, Math.PI, 0); ctx.lineTo(bx + 11, GROUND); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col;
        for (let i = 0; i < 3; i++) ctx.fillRect(x0 + 6 + i * 26, y0 - 10, 14, 10);
        const fx0 = bx + (a === 0 ? -18 : 18);
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(fx0, y0 - 10); ctx.lineTo(fx0, y0 - 34); ctx.stroke();
        const wv = Math.sin(now * 0.004 + a * 2) * 3;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(fx0, y0 - 34); ctx.lineTo(fx0 + (a === 0 ? 20 : -20), y0 - 30 + wv); ctx.lineTo(fx0, y0 - 24); ctx.closePath(); ctx.fill();
        if (!dead && b.hp / b.max < 0.4) {
            ctx.strokeStyle = "#00000088"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(bx - 20, y0 + 14); ctx.lineTo(bx - 8, y0 + 30); ctx.lineTo(bx - 16, y0 + 46); ctx.moveTo(bx + 14, y0 + 20); ctx.lineTo(bx + 6, y0 + 40); ctx.stroke();
        }
        ctx.restore();
        ctx.font = "800 10px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = col;
        ctx.fillText(a === myArmy() ? "KAMU" : (online ? "LAWAN" : "BOT"), bx, y0 - 52);
        ctx.fillStyle = "#00000088"; rr(bx - 38, y0 - 48, 76, 6, 3); ctx.fill();
        const wpx = Math.max(0, (76 * b.hp) / b.max);
        if (wpx > 0) { ctx.fillStyle = col; rr(bx - 38, y0 - 48, wpx, 6, 3); ctx.fill(); }
    }
    function drawUnit(u, now) {
        const x = u.x - camX;
        if (x < -40 || x > viewW + 40) return;
        const y = GROUND - u.lane * 9, sc = 1 - u.lane * 0.05;
        const col = ARMY_COL[u.army], acc = UNITS[u.key].accent, d = u.dir;
        const s = clamp(u.swing, 0, 1), slash = Math.sin(s * Math.PI);
        const bob = Math.abs(Math.sin(u.walk * 2)) * 1.3, leg = Math.sin(u.walk) * 5;
        ctx.save();
        ctx.translate(x, y); ctx.scale(sc, sc);
        ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = col;
        ctx.beginPath(); ctx.arc(0, -31 - bob, 4.5, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -26 - bob); ctx.lineTo(0, -13); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-4 + leg, 0); ctx.moveTo(0, -13); ctx.lineTo(4 - leg, 0); ctx.stroke();
        if (u.key === "sword") {
            ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-d * 6, -16); ctx.stroke();
            const tx = d * (13 - 4 * slash), ty = -27 + 14 * slash;
            ctx.strokeStyle = acc;
            ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(d * 5, -20); ctx.lineTo(tx, ty); ctx.stroke();
            if (slash > 0.35) { ctx.globalAlpha = (slash - 0.35) * 0.8; ctx.beginPath(); ctx.moveTo(d * 5, -20); ctx.lineTo(tx, ty - 7); ctx.stroke(); ctx.globalAlpha = 1; }
        } else if (u.key === "archer") {
            const bx = d * 9;
            ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(bx, -24); ctx.stroke();
            ctx.strokeStyle = acc;
            ctx.beginPath();
            if (d > 0) ctx.arc(bx, -24, 7, -1.15, 1.15); else ctx.arc(bx, -24, 7, Math.PI - 1.15, Math.PI + 1.15);
            ctx.stroke();
            const ex = bx + Math.cos(1.15) * 7 * d;
            const ey1 = -24 - Math.sin(1.15) * 7, ey2 = -24 + Math.sin(1.15) * 7;
            const pull = d * (9 - 5 * slash);
            ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(ex, ey1); ctx.lineTo(pull, -24); ctx.lineTo(ex, ey2); ctx.stroke();
            if (slash > 0.3) { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(pull, -24); ctx.lineTo(d * 16, -24); ctx.stroke(); }
        } else if (u.key === "shield") {
            const bash = d * 4 * slash;
            ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(d * 7 + bash, -22); ctx.moveTo(0, -22); ctx.lineTo(-d * 5, -17); ctx.stroke();
            const sx = d > 0 ? 7 + bash : -14 + bash;
            ctx.fillStyle = "#065f46"; ctx.strokeStyle = acc; ctx.lineWidth = 1.8;
            rr(sx, -30, 7, 16, 3); ctx.fill(); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-d * 6, -17); ctx.moveTo(0, -22); ctx.lineTo(d * 7, -18); ctx.stroke();
            ctx.fillStyle = acc;
            ctx.beginPath(); ctx.arc(d * 8, -16, 4, 0, 6.2832); ctx.fill();
            ctx.strokeStyle = "#0a1a10"; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(d * 8, -18); ctx.lineTo(d * 8, -14); ctx.moveTo(d * 8 - 2, -16); ctx.lineTo(d * 8 + 2, -16); ctx.stroke();
            if (slash > 0.3) { ctx.strokeStyle = acc; ctx.globalAlpha = slash * 0.7; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d * 8, -16, 5 + 5 * slash, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
        }
        if (u.hp < u.maxHp) {
            ctx.fillStyle = "#ffffff22"; ctx.fillRect(-8, -42, 16, 2.5);
            ctx.fillStyle = col; ctx.fillRect(-8, -42, 16 * clamp(u.hp / u.maxHp, 0, 1), 2.5);
        }
        ctx.restore();
    }
    function drawCorpse(f, p) {
        const x = f.x - camX;
        if (x < -40 || x > viewW + 40) return;
        ctx.save();
        ctx.translate(x, GROUND - f.lane * 9); ctx.rotate(f.dir * p * 1.5); ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = ARMY_COL[f.army]; ctx.lineWidth = 2.2; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, -31, 4.5, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, -13); ctx.moveTo(0, -13); ctx.lineTo(-5, 0); ctx.moveTo(0, -13); ctx.lineTo(5, 0); ctx.moveTo(0, -22); ctx.lineTo(-6, -16); ctx.moveTo(0, -22); ctx.lineTo(6, -16); ctx.stroke();
        ctx.restore();
    }
    function drawFx(f) {
        const p = clamp(f.t / f.life, 0, 1), x = f.x - camX;
        if (f.kind !== "confetti" && (x < -60 || x > viewW + 60)) return;
        if (f.kind === "corpse") { drawCorpse(f, p); return; }
        if (f.kind === "confetti") {
            ctx.save(); ctx.translate(x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = 1 - p;
            ctx.fillStyle = f.color; ctx.fillRect(-2, -3, 4, 6); ctx.restore(); return;
        }
        if (f.kind === "coin") {
            ctx.globalAlpha = 1 - p; ctx.fillStyle = "#fbbf24"; ctx.font = "800 12px ui-sans-serif, system-ui"; ctx.textAlign = "center";
            ctx.fillText(f.txt, x, f.y - p * 26); ctx.globalAlpha = 1; return;
        }
        if (f.kind === "heal") {
            ctx.globalAlpha = 1 - p; ctx.strokeStyle = "#f9a8d4"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, f.y - 12 * p, 6, 0, 6.2832); ctx.stroke();
            ctx.fillStyle = "#f9a8d4";
            ctx.fillRect(x - 1.3, f.y - 16 - 12 * p, 2.6, 8);
            ctx.fillRect(x - 4, f.y - 13.5 - 12 * p, 8, 2.6);
            ctx.globalAlpha = 1; return;
        }
        if (f.kind === "clash") {
            ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color || "#e2e8f0"; ctx.lineWidth = 2;
            const r1 = 3 + 9 * p, r2 = r1 + 5;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2 + Math.PI / 8;
                ctx.moveTo(x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
                ctx.lineTo(x + Math.cos(a) * r2, f.y + Math.sin(a) * r2);
            }
            ctx.stroke(); ctx.globalAlpha = 1; return;
        }
        if (f.kind === "basehit") {
            if (!f._s) { f._s = 1; addShake(f.big ? 9 : 2.5); }
            ctx.globalAlpha = (1 - p) * 0.9; ctx.strokeStyle = f.color || "#f87171"; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(x, f.y, 5 + 18 * p, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; return;
        }
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color || "#e2e8f0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, f.y, f.kind === "spark" ? 2 + 6 * p : 4 + 16 * p, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 1;
    }
    function drawMinimap(v) {
        const w = Math.min(240, viewW - 120), h = 12, x = (viewW - w) / 2, y = 8;
        mm = { x, y, w, h };
        ctx.fillStyle = "#02080699"; rr(x, y, w, h, 6); ctx.fill();
        ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1; rr(x, y, w, h, 6); ctx.stroke();
        for (const a of [0, 1]) { ctx.fillStyle = ARMY_COL[a]; ctx.fillRect(x + (BASE_X[a] / WORLD) * w - 2, y + 3, 4, 6); }
        for (const u of v.units) { ctx.fillStyle = ARMY_COL[u.army]; ctx.fillRect(x + (u.x / WORLD) * w - 1, y + 4 + (u.lane - 1), 2, 2); }
        ctx.strokeStyle = "#ffffff55";
        ctx.strokeRect(x + (camX / WORLD) * w, y + 1, (viewW / WORLD) * w, h - 2);
    }
    function render(v, now, dt) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
        g.addColorStop(0, "#0b1220"); g.addColorStop(0.7, "#0e2018"); g.addColorStop(1, "#123020");
        ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, VIEW_H);
        ctx.fillStyle = "#cfe9ff";
        for (const st of stars) {
            const sx = (((st.x - camX * 0.05) % (viewW + 40)) + (viewW + 40)) % (viewW + 40) - 20;
            ctx.globalAlpha = st.a; ctx.fillRect(sx, st.y, st.s, st.s);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#e8f4ff14"; ctx.beginPath(); ctx.arc(viewW - 84, 62, 26, 0, 6.2832); ctx.fill();
        ctx.fillStyle = "#e8f4ff22"; ctx.beginPath(); ctx.arc(viewW - 84, 62, 18, 0, 6.2832); ctx.fill();
        drawHills(0.18, 252, 46, "#0e1d16", 1.7);
        drawHills(0.38, 288, 34, "#122619", 4.1);
        drawTrees();
        let ox = 0, oy = 0;
        if (shake.t > 0) {
            shake.t -= dt;
            const k = Math.max(0, shake.t / shake.life) * shake.mag;
            ox = Math.sin(now * 0.13) * k; oy = Math.cos(now * 0.17) * k * 0.6;
        }
        ctx.save();
        ctx.translate(-ox, oy);
        ctx.fillStyle = "#15301e"; ctx.fillRect(-20, GROUND, viewW + 40, VIEW_H - GROUND + 20);
        ctx.strokeStyle = "#2c5a3a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-20, GROUND); ctx.lineTo(viewW + 20, GROUND); ctx.stroke();
        ctx.strokeStyle = "#2f5c3c"; ctx.lineWidth = 1.5;
        const gs = 34, g0 = Math.floor(camX / gs) * gs;
        for (let wx = g0; wx < camX + viewW + gs; wx += gs) {
            const sx = wx - camX, hh = hash(wx);
            ctx.beginPath(); ctx.moveTo(sx, GROUND + 8 + hh * 26); ctx.lineTo(sx + 3, GROUND + 3 + hh * 26); ctx.stroke();
        }
        drawBase(0, v, now); drawBase(1, v, now);
        const us = v.units.slice().sort((a, b) => b.lane - a.lane || a.x - b.x);
        for (const u of us) drawUnit(u, now);
        ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2; ctx.lineCap = "round";
        for (const a of v.arrows) {
            const p = clamp(a.t / a.dur, 0, 1);
            const ax = a.x0 + (a.x1 - a.x0) * p - camX;
            const ay = a.y0 + (a.y1 - a.y0) * p - Math.sin(p * Math.PI) * 18;
            if (ax < -20 || ax > viewW + 20) continue;
            const sg = a.x1 >= a.x0 ? 1 : -1;
            ctx.beginPath(); ctx.moveTo(ax - 8 * sg, ay + 3); ctx.lineTo(ax, ay); ctx.stroke();
        }
        for (const f of v.fx) drawFx(f);
        ctx.restore();
        drawMinimap(v);
    }

    /* ---------- HUD & overlay ---------- */
    function txt(el, s) { if (el && el.__v !== s) { el.__v = s; el.textContent = s; } }
    function bar(el, r) { if (!el) return; const w = Math.round(clamp(r, 0, 1) * 100); if (el.__w !== w) { el.__w = w; el.style.width = w + "%"; } }
    function uiState() {
        if (sim) {
            const my = myArmy(), foe = 1 - my;
            return { has: true, phase: sim.phase, level: sim.level, name: sim.L.name, gold: sim.gold[my], myBase: sim.bases[my], foeBase: sim.bases[foe], count: countArmy(sim.units, my), first: sim.initiative === my, cheated: sim.cheated, speed: sim.speed, winner: sim.winner, my, foe, kills: sim.kills[my], earned: sim.earned[my], time: sim.time, incRatio: sim.incT[my] / P_IV };
        }
        if (snapCur) {
            const my = myArmy(), foe = 1 - my;
            return { has: true, phase: snapCur.phase, level: snapCur.level, name: snapCur.name, gold: snapCur.gold[my], myBase: { hp: snapCur.bases[my], max: snapCur.baseMax[my] }, foeBase: { hp: snapCur.bases[foe], max: snapCur.baseMax[foe] }, count: snapCur.counts[my], first: snapCur.initiative === my, cheated: snapCur.cheated, speed: snapCur.speed, winner: snapCur.winner, my, foe, kills: snapCur.kills[my], earned: snapCur.earned[my], time: snapCur.time, incRatio: (((performance.now() - snapAt) / 1000) % P_IV) / P_IV };
        }
        return { has: false, phase: "wait", my: 0, foe: 1 };
    }
    function hudLight(u) {
        if (!u.has) return;
        txt(hud.level, String(u.level));
        txt(hud.lname, u.name || "");
        txt(hud.gold, String(Math.floor(u.gold)));
        txt(hud.pbase, String(Math.max(0, Math.ceil(u.myBase.hp))));
        txt(hud.ebase, String(Math.max(0, Math.ceil(u.foeBase.hp))));
        txt(hud.army, String(u.count));
        bar(hud.pbar, u.myBase.hp / u.myBase.max);
        bar(hud.ebar, u.foeBase.hp / u.foeBase.max);
        bar(hud.inc, u.incRatio);
    }
    function refreshBuy(u) {
        if (!u.has) return;
        for (const k of UNIT_KEYS) {
            const b = unitBtns[k];
            const off = u.phase !== "play" || u.gold < UNITS[k].cost || u.count >= CAP;
            if (b.__off !== off) { b.__off = off; b.classList.toggle("is-off", off); b.setAttribute("aria-disabled", off ? "true" : "false"); }
        }
    }
    function syncOverlays(u) {
        const ready = u.phase === "ready";
        const showHelp = helpOpen || (ready && isHost);
        ovHelp.hidden = !showHelp;
        ovEnd.hidden = !(u.phase === "ended" && !showHelp && !cheatOpen);
        ovPause.hidden = !(u.phase === "paused" && !showHelp && !cheatOpen);
        ovCheat.hidden = !cheatOpen;
        txt(H.helpTitle, ready ? "Stickman War — Level " + u.level : "Cara main");
        txt(H.helpSub, ready ? (u.name || "") + (online ? " · multiplayer" : " · vs BOT") : "Ringkasan cepat biar langsung jago.");
        H.startBtn.hidden = !(ready && isHost);
        H.closeHelpBtn.hidden = ready && isHost;
        H.wait.hidden = !(!isHost && (ready || !u.has));
        if (u.phase === "ended") {
            const win = u.winner === u.my;
            txt(H.endTitle, win ? "Menang! 🎉" : "Kalah…");
            H.endTitle.className = win ? "sw-win" : "sw-lose";
            txt(H.endSub, win ? "Markas lawan rata di " + u.name + "." : "Markasmu rata di " + u.name + ". Coba komposisi lain!");
            txt(H.stK, String(u.kills)); txt(H.stG, String(Math.floor(u.earned))); txt(H.stT, Math.round(u.time) + "s");
            txt(H.endBest, online ? "Sisi & giliran diacak lagi di pertandingan berikutnya." : (u.cheated ? "Rekor tidak dicatat (cheat aktif)." : "Rekor: Level " + best));
            H.nextBtn.hidden = !isHost || (!online && !win);
            txt(H.nextBtn, online ? "Pertandingan baru ▸" : "Level berikutnya ▸");
            H.retryBtn.hidden = !isHost || (!online && win);
            txt(H.retryBtn, online ? "Ulang level" : "Coba lagi");
            H.endWait.hidden = isHost;
        }
        H.resumeBtn.hidden = !isHost;
        H.pauseWait.hidden = isHost;
        for (const k of ["gold", "god", "onehit", "freeze"]) cheatToggles[k].setAttribute("aria-pressed", sim && sim.cheats[k] ? "true" : "false");
    }
    function syncUI() {
        const u = uiState();
        const st = !u.has ? ["Menghubungkan…", "#8fa3b8"]
            : u.phase === "play" ? ["Bertempur", "#34d399"]
                : u.phase === "paused" ? ["Jeda", "#fbbf24"]
                    : u.phase === "ready" ? ["Siap", "#38bdf8"]
                        : u.winner === u.my ? ["Menang", "#34d399"] : ["Kalah", "#f87171"];
        txt(statusEl, st[0]);
        if (dotEl) dotEl.style.background = st[1];
        if (u.has) {
            txt(hud.first, u.first ? "Kamu" : (online ? "Lawan" : "BOT"));
            hud.cheat.hidden = !u.cheated;
            hud.bestwrap.hidden = best <= 0;
            txt(hud.best, String(best));
            hud.pbar.style.background = ARMY_COL[u.my];
            hud.ebar.style.background = ARMY_COL[u.foe];
        }
        toolPause.innerHTML = u.phase === "paused" ? ICONS.play : ICONS.pause;
        toolPause.setAttribute("aria-label", u.phase === "paused" ? "Lanjut" : "Jeda");
        txt(toolSpeed, (u.speed || 1) + "×");
        syncFollow();
        for (const el of [toolPause, toolSpeed, toolCheat, toolRestart]) el.style.display = isHost ? "" : "none";
        syncOverlays(u);
        hudLight(u);
        refreshBuy(u);
    }
    let toastTimer = 0;
    function toast(msg, ms = 2400) {
        toastEl.textContent = msg;
        toastEl.hidden = false;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { if (!destroyed) toastEl.classList.remove("show"); }, ms);
    }

    /* ---------- aksi & alur permainan ---------- */
    function newGame(n) {
        const seed = (Math.random() * 1e9) | 0;
        const sides = Math.random() < 0.5 ? [0, 1] : [1, 0];       // acak sisi pemain
        const initiative = Math.random() < 0.5 ? 0 : 1;            // acak giliran pertama
        sim = createSim({ level: n, seed, sides, initiative, vsBot: !online });
        helpOpen = true; cheatOpen = false; helpPause = false;
        gCache.clear(); gFx = []; gArrows = [];
        lastPhase = sim.phase;
        resetCam();
        toast("Undian sisi: kamu di " + (sides[0] === 0 ? "KIRI (biru)" : "KANAN (merah)") + ".");
        syncUI(); publish();
    }
    function applyCheat(key) {
        if (!sim) return;
        const my = sim.sides[0], foe = 1 - my;
        if (["gold", "god", "onehit", "freeze"].includes(key)) {
            sim.cheats[key] = !sim.cheats[key];
            toast("Cheat " + CHEAT_NAMES[key] + (sim.cheats[key] ? " AKTIF" : " mati"));
        } else if (key === "gold250") { sim.gold[my] += 250; toast("+250 emas!"); }
        else if (key === "heal") { sim.bases[my].hp = sim.bases[my].max; for (const u of sim.units) if (u.army === my) u.hp = u.maxHp; toast("Semua pulih!"); }
        else if (key === "squad") { let ok = 0; for (const k of ["shield", "archer", "medic"]) if (spawnUnit(sim, my, k, true)) ok++; toast(ok ? "Pasukan gratis datang!" : "Pasukan penuh!"); }
        else if (key === "nuke") { dealBase(sim, foe, 1e9, my); toast("Markas lawan diratakan!"); }
        else return;
        sim.cheated = true;
    }
    function applyAction(action, actor) {
        if (!sim || destroyed) return;
        const a = action || {};
        const army = sim.sides[actor];
        if (army === undefined) return;
        if (a.type === "buy") {
            if (sim.phase === "play" && UNIT_KEYS.includes(a.key)) spawnUnit(sim, army, a.key);
        } else if (actor === 0) {
            if (a.type === "start" && sim.phase === "ready") {
                startPlay(sim); helpOpen = false;
                toast(sim.initiative === sim.sides[0] ? "Undian: KAMU jalan duluan! +1 Swordman gratis." : "Undian: lawan jalan duluan. Siapkan pertahanan!");
            } else if (a.type === "pause") {
                if (sim.phase === "play") sim.phase = "paused";
                else if (sim.phase === "paused") sim.phase = "play";
            } else if (a.type === "speed") {
                sim.speed = sim.speed === 1 ? 2 : 1;
            } else if (a.type === "restart") {
                newGame(sim.level); return;
            } else if (a.type === "next") {
                if (sim.phase === "ended") { newGame(online ? sim.level + 1 : (sim.winner === sim.sides[0] ? sim.level + 1 : sim.level)); return; }
            } else if (a.type === "cheat") {
                applyCheat(a.key);
            }
        }
        syncUI(); publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            if (typeof room.sendAction === "function") room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }
    function publish() {
        // Hanya host yang menulis state kanonik ke Firebase.
        if (online && room.isHost && sim && typeof room.publishState === "function") {
            room.publishState(snapshot(sim)).catch(console.warn);
        }
    }
    function receiveSnap(st) {
        const prev = snapCur;
        snapPrev = prev; snapCur = st; snapAt = performance.now();
        const my = st.sides[playerIndex] ?? 0;
        const key = st.level + ":" + st.seed;
        if (key !== lastLevelKey) {
            lastLevelKey = key;
            gCache.clear(); gFx = []; gArrows = [];
            helpOpen = st.phase === "ready"; cheatOpen = false;
            resetCam();
            if (st.phase === "ready") toast("Undian sisi: kamu di " + (my === 0 ? "KIRI (biru)" : "KANAN (merah)") + ".");
        }
        if (prev && prev.level === st.level && prev.seed === st.seed) {
            const pm = new Map(prev.units.map((u) => [u.i, u]));
            const cm = new Set(st.units.map((u) => u.i));
            for (const u of st.units) {
                const p = pm.get(u.i);
                if (!p) gFx.push({ kind: "ring", x: u.x, y: GROUND - u.l * 9 - 20, t: 0, life: 0.45, color: ARMY_COL[u.a] });
                else if (u.h < p.h) gFx.push({ kind: "clash", x: u.x, y: GROUND - u.l * 9 - 22, t: 0, life: 0.3 });
                else if (u.h > p.h) gFx.push({ kind: "heal", x: u.x, y: GROUND - u.l * 9 - 34, t: 0, life: 0.5 });
            }
            let foeDead = null;
            for (const p of prev.units) if (!cm.has(p.i)) {
                gFx.push({ kind: "corpse", x: p.x, y: GROUND - p.l * 9, t: 0, life: 0.6, army: p.a, dir: p.a === 0 ? 1 : -1, key: p.k, lane: p.l });
                if (p.a !== my) foeDead = p;
            }
            const gd = st.gold[my] - prev.gold[my];
            if (foeDead && gd > 0) gFx.push({ kind: "coin", x: foeDead.x, y: GROUND - foeDead.l * 9 - 46, t: 0, life: 0.9, txt: "+" + Math.min(gd, 20) });
            for (const a of [0, 1]) if (st.bases[a] < prev.bases[a]) gFx.push({ kind: "basehit", x: BASE_X[a], y: GROUND - 60, t: 0, life: 0.4, color: ARMY_COL[a], big: st.bases[a] <= 0 });
        }
        if (st.phase !== lastGuestPhase) {
            if (st.phase === "play" && lastGuestPhase === "ready") { helpOpen = false; toast(st.initiative === my ? "Undian: KAMU jalan duluan! +1 Swordman gratis." : "Undian: lawan jalan duluan!"); }
            if (st.phase === "ended") { helpOpen = false; cheatOpen = false; if (st.winner === my) confetti(1 - my); }
            if (st.phase === "ready") helpOpen = true;
            lastGuestPhase = st.phase;
        }
        syncUI();
    }
    function tryBuy(key) {
        const u = uiState();
        if (u.phase !== "play") return;
        if (u.count >= CAP) { toast("Pasukan penuh (" + CAP + ")."); return; }
        if (u.gold < UNITS[key].cost) { flashGold(); toast("Emas kurang untuk " + UNITS[key].name + "."); return; }
        submitAction({ type: "buy", key });
        pulseBtn(key);
    }
    function pulseBtn(key) {
        const b = unitBtns[key];
        b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse");
    }
    function flashGold() {
        goldChip.classList.remove("sw-flash"); void goldChip.offsetWidth; goldChip.classList.add("sw-flash");
    }
    function autoPause(want) {
        if (online || !sim) return;
        if (want && sim.phase === "play") { helpPause = true; sim.phase = "paused"; }
        else if (!want && helpPause && !helpOpen && !cheatOpen && sim.phase === "paused") { helpPause = false; sim.phase = "play"; }
    }
    function toggleHelp(force) {
        const want = force !== undefined ? force : !helpOpen;
        if (want === helpOpen) return;
        helpOpen = want; autoPause(want); syncUI();
    }
    function toggleCheat(force) {
        if (!isHost) return;
        const want = force !== undefined ? force : !cheatOpen;
        if (want === cheatOpen) return;
        cheatOpen = want; autoPause(want); syncUI();
    }
    function closeTop() {
        if (cheatOpen) toggleCheat(false);
        else if (helpOpen && uiState().phase !== "ready") toggleHelp(false);
        else if (isHost) submitAction({ type: "pause" });
    }

    /* ---------- input: klik / keyboard / mouse / sentuh ---------- */
    function handleClick(e) {
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const buy = e.target.closest("[data-buy]");
        if (buy) { tryBuy(buy.dataset.buy); return; }
        const tool = e.target.closest("[data-tool]");
        if (tool) {
            const t = tool.dataset.tool;
            if (t === "pause" && isHost) submitAction({ type: "pause" });
            else if (t === "speed" && isHost) submitAction({ type: "speed" });
            else if (t === "follow") { follow = !follow; syncFollow(); }
            else if (t === "help") toggleHelp();
            else if (t === "cheat" && isHost) toggleCheat();
            else if (t === "restart" && isHost) submitAction({ type: "restart" });
            return;
        }
        const ch = e.target.closest("[data-cheat]");
        if (ch && isHost) { submitAction({ type: "cheat", key: ch.dataset.cheat }); return; }
        const act = e.target.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "closehelp") toggleHelp(false);
            else if (a === "closecheat") toggleCheat(false);
            else if (a === "resume" && isHost) submitAction({ type: "pause" });
            else if (isHost) submitAction({ type: a });
            return;
        }
        const cl = e.target.closest("[data-close]");
        if (cl) { if (cl.dataset.close === "cheat") toggleCheat(false); else toggleHelp(false); }
    }
    const BUY_MAP = { Digit1: "sword", Digit2: "archer", Digit3: "shield", Digit4: "medic", Numpad1: "sword", Numpad2: "archer", Numpad3: "shield", Numpad4: "medic" };
    function onKeyDown(e) {
        if (destroyed || (!hover && !root.contains(document.activeElement))) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const code = e.code;
        if (code === "Escape") { e.preventDefault(); closeTop(); return; }
        if (BUY_MAP[code]) { e.preventDefault(); if (!helpOpen && !cheatOpen) tryBuy(BUY_MAP[code]); return; }
        if (code === "ArrowLeft" || code === "KeyA") { keyDir = -1; e.preventDefault(); return; }
        if (code === "ArrowRight" || code === "KeyD") { keyDir = 1; e.preventDefault(); return; }
        if (code === "Space") { e.preventDefault(); if (isHost && !helpOpen && !cheatOpen) submitAction({ type: "pause" }); return; }
        if (code === "KeyF") { follow = !follow; syncFollow(); return; }
        if (code === "KeyH") { toggleHelp(); return; }
        if (code === "KeyC") { if (isHost) toggleCheat(); return; }
        if (code === "KeyR") { if (isHost && !cheatOpen) submitAction({ type: "restart" }); return; }
        if (code === "Enter") {
            const u = uiState();
            if (isHost && u.phase === "ready") submitAction({ type: "start" });
            else if (isHost && u.phase === "ended" && !helpOpen && !cheatOpen) submitAction({ type: "next" });
        }
    }
    function onKeyUp(e) {
        if ((e.code === "ArrowLeft" || e.code === "KeyA") && keyDir === -1) keyDir = 0;
        if ((e.code === "ArrowRight" || e.code === "KeyD") && keyDir === 1) keyDir = 0;
    }
    let drag = null;
    function toLogical(e) {
        const r = canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * viewW, y: ((e.clientY - r.top) / r.height) * VIEW_H };
    }
    function onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        drag = { x: e.clientX, cam: camT, moved: false };
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { } }
    }
    function onPointerMove(e) {
        if (!drag) return;
        const dx = (e.clientX - drag.x) * (viewW / (canvas.clientWidth || 1));
        if (Math.abs(dx) > 4) drag.moved = true;
        if (drag.moved) { follow = false; camT = camX = clamp(drag.cam - dx, 0, WORLD - viewW); syncFollow(); }
    }
    function onPointerUp(e) {
        if (drag && !drag.moved && mm) {
            const p = toLogical(e);
            if (p.x >= mm.x && p.x <= mm.x + mm.w && p.y >= mm.y - 4 && p.y <= mm.y + mm.h + 6) {
                follow = false;
                camT = clamp(((p.x - mm.x) / mm.w) * WORLD - viewW / 2, 0, WORLD - viewW);
                syncFollow();
            }
        }
        drag = null;
    }
    function onWheel(e) {
        e.preventDefault();
        follow = false;
        camT = clamp(camT + (e.deltaY + e.deltaX) * 0.9, 0, WORLD - viewW);
        syncFollow();
    }
    function bindPad(el, dir) {
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); padDir = dir; if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { } } }, sig);
        const stop = () => { if (padDir === dir) padDir = 0; };
        el.addEventListener("pointerup", stop, sig);
        el.addEventListener("pointercancel", stop, sig);
        el.addEventListener("pointerleave", stop, sig);
    }

    root.addEventListener("click", handleClick, sig);
    root.addEventListener("pointerenter", () => { hover = true; }, sig);
    root.addEventListener("pointerleave", () => { hover = false; }, sig);
    document.addEventListener("keydown", onKeyDown, sig);
    document.addEventListener("keyup", onKeyUp, sig);
    canvas.addEventListener("pointerdown", onPointerDown, sig);
    canvas.addEventListener("pointermove", onPointerMove, sig);
    canvas.addEventListener("pointerup", onPointerUp, sig);
    canvas.addEventListener("pointercancel", () => { drag = null; }, sig);
    canvas.addEventListener("wheel", onWheel, { passive: false, signal: ac.signal });
    bindPad($('[data-pad="l"]'), -1);
    bindPad($('[data-pad="r"]'), 1);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(resize); ro.observe(stage); }
    else window.addEventListener("resize", resize, sig);

    /* ---------- koneksi room (multiplayer) ---------- */
    if (online) {
        if (typeof room.onRoom === "function") subs.push(room.onRoom((r) => { roomData = r; if (!destroyed) syncUI(); }));
        if (room.isHost) {
            if (typeof room.onAction === "function") subs.push(room.onAction((a) => applyAction(a, 1)));
            newGame(1);
        } else {
            if (typeof room.onState === "function") subs.push(room.onState((st) => { if (!destroyed && st && st.v === 1) receiveSnap(st); }));
            syncUI();
        }
    } else {
        newGame(1);
    }

    /* ---------- loop realtime ---------- */
    let raf = 0, last = 0, pubT = 0;
    function loop(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(loop);
        if (!last) last = t;
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        if (sim) {
            if (sim.phase === "play") {
                const n = sim.speed === 2 ? 2 : 1;
                for (let i = 0; i < n && sim.phase === "play"; i++) stepSim(sim, dt);
            } else {
                idleStep(sim, dt);
                for (const u of sim.units) u.swing = Math.max(0, u.swing - dt * 3);
            }
            if (sim.phase !== lastPhase) {
                if (sim.phase === "ended") {
                    if (sim.winner === sim.sides[0]) confetti(1 - sim.sides[0]);
                    if (!online && sim.winner === sim.sides[0] && !sim.cheated && sim.level > best) {
                        best = sim.level;
                        try { localStorage.setItem(META.bestKey, String(best)); } catch (err) { }
                    }
                    helpOpen = false; cheatOpen = false;
                }
                lastPhase = sim.phase;
                syncUI(); publish();
            }
        }
        const v = sim ? sim : guestView(t, dt);
        const u = uiState();
        if (v) { updateCam(v, dt); render(v, t, dt); }
        hudLight(u); refreshBuy(u);
        if (online && room.isHost && sim) {
            pubT += dt;
            if (pubT >= 0.25) { pubT = 0; publish(); }
        }
    }

    /* ---------- mulai ---------- */
    resize();
    resetCam();
    syncUI();
    raf = requestAnimationFrame(loop);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            clearTimeout(toastTimer);
            ac.abort();
            if (ro) ro.disconnect();
            for (const off of subs) { try { if (typeof off === "function") off(); } catch (err) { } }
        },
    };
}