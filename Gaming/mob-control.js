/*
  mob-control.js — Mob Control (terinspirasi game Mob Control)
  - File mengikuti template: export META + export mount(root, context).
  - id harus sama dengan nama file tanpa .js  ->  "mob-control"
  - Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "mob-control",
    name: "Mob Control",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Slide your cannon, stream mobs through moving multiplier gates and smash the enemy base first.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="36" height="10" rx="3" fill="#7f1d1d" stroke="#fca5a5"/><path d="M14 9h20" stroke="#fca5a5"/><g><rect x="14" y="24" width="20" height="9" rx="3" fill="#065f46" stroke="#6ee7b7"/><text x="24" y="31" font-size="8" font-weight="800" text-anchor="middle" fill="#d1fae5" stroke="none">x2</text></g><circle cx="14" cy="42" r="3" fill="#38bdf8" stroke="none"/><circle cx="24" cy="42" r="3" fill="#38bdf8" stroke="none"/><circle cx="34" cy="42" r="3" fill="#38bdf8" stroke="none"/><path d="M24 40v-6" stroke="#38bdf8" stroke-width="4"/></svg>',
    bg: ["#164e63", "#0e7490"],
    bestKey: "mobControlBest",
};

/* =====================================================================
   LOGIKA MURNI (tanpa DOM) — deterministik, dipakai juga oleh generator
   level & mode online (host menjalankan simulasi otoritatif).
===================================================================== */
const W = 400, H = 560, GATE_Y = 300;
const RAIL = [482, 78];          // posisi Y meriam: side0 bawah, side1 atas
const DIR = [-1, 1];             // arah maju mob tiap side
const BASE_LINE = [506, 54];     // garis damage base milik side tsb
const TURRET_Y = [500, 58];
const TURRET_X = [140, 260];
const MAX_UNITS = 200;           // batas performa & ukuran snapshot online
const OPENING = 3;               // detik head-start utk pemenang coin toss
const SUDDEN_T = 150, SUDDEN_DPS = 3;
const SPEED_MOB = 92, SPEED_CHAMP = 78, SPEED_BULLET = 150, SPEED_CANNON = 150;
const FIRE_INT = 0.30, CHAMP_CD = 12, CHAMP_LEFT = 3;
const GATE_HW = 34;
const LEVEL_COUNT = 3;
const PUB_MS = 250, INPUT_MS = 100;
const GATE_LABEL = { x2: "\u00d72", x3: "\u00d73", add5: "+5", add10: "+10", sub3: "\u22123" };
const GATE_WEIGHT = { x3: 3.2, x2: 2.2, add10: 2.6, add5: 1.6, sub3: -5 };
const SIDE_NAME = ["BLUE", "RED"];
const SIDE_COL = ["#38bdf8", "#fb7185"];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
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
function shuffle(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (r() * (i + 1)) | 0;
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}

/* ---------- generator level acak yang DIJAMIN bisa diselesaikan ----------
   Strategi: roll konfigurasi (selalu >= 2 gate positif), lalu buktikan
   solvable dengan simulasi headless: pemain referensi (skill .92) melawan
   bot level tsb, dengan kondisi terburuk = bot jalan duluan (first = 1).
   Jika referensi menang <= 240 detik, level diterima. Maks 8 percobaan,
   lalu fallback ke konfigurasi mudah yang sudah terbukti. */
function rollCfg(li, seed) {
    const r = rng(seed);
    const strong = r() < 0.45 ? "x3" : "x2";
    const add = r() < 0.5 ? "add5" : "add10";
    const pool = li === 0 ? ["x2", "add5", "x2"]
        : li === 1 ? ["x2", "add10", "sub3", "x3"]
            : ["sub3", "x3", "add10", "x2"];
    const third = pool[(r() * pool.length) | 0];
    const ops = shuffle([strong, add, third], r);
    const gates = ops.map((op, i) => ({
        op, baseX: 80 + i * 120,
        range: 16 + r() * 8,                       // amplitudo geser (lane tak pernah overlap)
        omega: (0.22 + r() * 0.30) * (r() < 0.5 ? -1 : 1),
        phase: r() * 6.2832,
    }));
    return {
        hp: 200 + li * 80 + ((r() * 70) | 0),
        turretEvery: Math.max(1.35, 2.3 - li * 0.3 - r() * 0.25),
        skill: Math.min(0.85, 0.32 + li * 0.17 + r() * 0.08),
        botFire: 0.50 - li * 0.05,
        gates, seed,
    };
}
function fallbackCfg(li) {
    const ops = ["x2", "add5", "x2"];
    return {
        hp: 180 + li * 40, turretEvery: 2.4, skill: 0.30 + 0.10 * li, botFire: 0.60,
        gates: ops.map((op, i) => ({ op, baseX: 80 + i * 120, range: 14, omega: 0.25 * (i % 2 ? -1 : 1), phase: i * 2.1 })),
        seed: 0,
    };
}
function genLevel(li, seed) {
    for (let k = 0; k < 8; k++) {
        const s = (seed + k * 7919) >>> 0;
        const cfg = rollCfg(li, s);
        if (isSolvable(cfg, (s ^ 0x9e3779b9) >>> 0)) return cfg;
    }
    return fallbackCfg(li);
}
function isSolvable(cfg, seed) {
    const sim = createSim(0, cfg, seed, { first: 1 }); // worst case: musuh duluan
    sim.phase = "opening";
    let t = 0;
    while (sim.phase !== "end" && t < 240) {
        const a = botThink(sim, 0, 0.1, 0.92);
        const b = botThink(sim, 1, 0.1, cfg.skill);
        if (a.champ) tryChamp(sim, 0);
        if (b.champ) tryChamp(sim, 1);
        sim.inputs[0] = a; sim.inputs[1] = b;
        stepSim(sim, 0.1, 0.05);
        t += 0.1;
    }
    return sim.winner === 0;
}

/* ---------- dunia / simulasi ---------- */
function mkCannon() { return { x: 200, aim: 0, left: CHAMP_LEFT, cd: 0, fireT: 0 }; }
function mkBot() { return { decideT: 0, gate: 0, jit: 0, cycleT: 0, on: true }; }
function mkInput() { return { move: 0, aim: 0, firing: false }; }

function createSim(li, cfg, seed, opts = {}) {
    const score = opts.score || [0, 0];
    return {
        li, cfg, rnd: rng(seed),
        sides: opts.sides || [0, 1],   // sides[actor] -> side di papan (acak saat online)
        first: opts.first || 0,        // pemenang coin toss "jalan duluan"
        pvp: !!opts.pvp, cheats: opts.cheats || null, mySide: opts.mySide || 0,
        phase: "ready", t: 0, openT: OPENING, winner: null,
        hp: [cfg.hp, cfg.hp], score: [...score], baseScore: [...score],
        gates: cfg.gates.map((g) => ({ ...g, x: g.baseX, budget: 3 })),
        units: [], bullets: [], uid: 1, bid: 1,
        cannons: [mkCannon(), mkCannon()],
        inputs: [mkInput(), mkInput()],
        bots: [mkBot(), mkBot()],
        turretT: [1.0, 1.4],
    };
}

function spawnMob(sim, side, champ, x, y, dx, dy, gated) {
    if (sim.units.length >= MAX_UNITS) return;
    sim.units.push({
        id: sim.uid++, x, y, dx, dy, side, dir: DIR[side],
        champ, hp: champ ? 3 : 1, r: champ ? 12 : 6.5, gated, cc: 0, dead: false,
    });
}
function fireCannon(sim, side, champ) {
    const c = sim.cannons[side];
    spawnMob(sim, side, champ, c.x, RAIL[side] + DIR[side] * 22,
        Math.sin(c.aim), DIR[side] * Math.cos(c.aim), false);
}
function tryChamp(sim, side) {
    if (sim.phase !== "opening" && sim.phase !== "battle") return false;
    if (sim.phase === "opening" && sim.first !== side) return false;
    const c = sim.cannons[side];
    const ch = sim.cheats || {};
    const inf = ch.inchamp && side === sim.mySide;
    if (!inf && (c.left <= 0 || c.cd > 0)) return false;
    fireCannon(sim, side, true);
    if (!inf) { c.left--; c.cd = CHAMP_CD; }
    return true;
}
function homeDir(sim, u) {
    const tx = 130 + sim.rnd() * 140, ty = BASE_LINE[1 - u.side];
    const hx = tx - u.x, hy = ty - u.y;
    const n = Math.hypot(hx, hy) || 1;
    return [hx / n, hy / n];
}

/* Gate = PABRIK PASUKAN: mob yang menyentuh gate memicu matematika gate.
   x2/x3 mengkloning mob, +5/+10 melahirkan pasukan baru, -3 memakan
   3 mob per detik (budget regenerasi; gate memudar saat "kenyang"). */
function hitGate(sim, u, g) {
    u.gated = true;
    const r = sim.rnd;
    if (g.op === "sub3" && g.budget >= 1) { g.budget -= 1; u.dead = true; return; }
    const [hx, hy] = homeDir(sim, u);
    if (g.op !== "sub3") {
        const n = g.op === "x2" ? 1 : g.op === "x3" ? 2 : g.op === "add5" ? 5 : g.op === "add10" ? 10 : 0;
        const baseAng = Math.atan2(hx, hy * u.dir);
        for (let i = 0; i < n; i++) {
            if (sim.units.length >= MAX_UNITS) break;
            const ang = baseAng + (i - (n - 1) / 2) * 0.06 + (r() - 0.5) * 0.05;
            const px = g.x + (i - (n - 1) / 2) * 7 + (r() - 0.5) * 6;
            spawnMob(sim, u.side, false, px, GATE_Y + u.dir * 8, Math.sin(ang), u.dir * Math.cos(ang), true);
        }
    }
    u.dx = hx; u.dy = hy;
}

/* Bot: membidik gate positif terbaik, bergerak mengikutinya, menembak
   dalam burst. Skill mengatur akurasi & tempo. Dipakai juga sebagai
   "pemain referensi" saat membuktikan level solvable. */
function botThink(sim, side, dt, skill) {
    const b = sim.bots[side], c = sim.cannons[side], r = sim.rnd;
    b.decideT -= dt;
    if (b.decideT <= 0) {
        b.decideT = 0.7 + r() * 0.6;
        let best = 0, bw = -1e9;
        sim.gates.forEach((g, i) => {
            const wgt = (GATE_WEIGHT[g.op] || 0) + r() * 0.6;
            if (wgt > bw) { bw = wgt; best = i; }
        });
        b.gate = best;
        b.jit = (r() - 0.5) * (0.22 - 0.16 * skill);
    }
    b.cycleT -= dt;
    if (b.cycleT <= 0) {
        b.on = !b.on;
        b.cycleT = b.on ? 0.9 + 0.9 * skill : 1.5 - 1.05 * skill;
    }
    const g = sim.gates[b.gate];
    const diff = g.x - c.x;
    const move = Math.abs(diff) <= 7 ? 0 : Math.sign(diff);
    const fwd = (GATE_Y - RAIL[side]) * DIR[side];
    const aim = clamp(Math.atan2(g.x + (r() - 0.5) * 10 - c.x, fwd) + b.jit, -1.02, 1.02);
    const champ = b.on && c.left > 0 && c.cd <= 0 && r() < dt * 0.25;
    return { move, aim, firing: b.on, champ };
}

function stepSim(sim, dt, maxSub = 0.02) {
    if (sim.phase === "ready" || sim.phase === "end") return;
    let rem = dt;
    while (rem > 1e-9 && sim.phase !== "end") {
        const sub = Math.min(rem, maxSub); rem -= sub;
        sim.t += sub;
        if (sim.phase === "opening") {
            sim.openT -= sub;
            if (sim.openT <= 0) { sim.openT = 0; sim.phase = "battle"; }
        }
        const ch = sim.cheats || {};
        /* gate bergeser kanan-kiri (sinusoidal dalam lane masing-masing) */
        for (const g of sim.gates) {
            g.x = g.baseX + Math.sin(sim.t * g.omega + g.phase) * g.range;
            g.budget = Math.min(3, g.budget + 3 * sub);
        }
        /* meriam: geser rel, bidik, tembak (opening: hanya pemenang coin toss) */
        for (let s = 0; s < 2; s++) {
            const c = sim.cannons[s], inp = sim.inputs[s];
            c.x = clamp(c.x + inp.move * SPEED_CANNON * sub, 46, 354);
            c.aim = clamp(inp.aim, -1.05, 1.05);
            c.cd = Math.max(0, c.cd - sub); c.fireT -= sub;
            const my = s === sim.mySide;
            const allowed = (sim.phase === "battle" || sim.first === s) && inp.firing
                && !(ch.freeze && s !== sim.mySide);
            if (allowed && c.fireT <= 0) {
                fireCannon(sim, s, false);
                c.fireT = my && ch.rapid ? 0.1
                    : (s === 1 && !sim.pvp ? sim.cfg.botFire : FIRE_INT);
            }
        }
        /* turret kedua base */
        for (let s = 0; s < 2; s++) {
            sim.turretT[s] -= sub;
            if (sim.turretT[s] <= 0) {
                sim.turretT[s] = sim.cfg.turretEvery;
                if (sim.phase === "battle" && !(ch.freeze && s !== sim.mySide)) {
                    for (const tx of TURRET_X)
                        sim.bullets.push({ id: sim.bid++, x: tx, y: TURRET_Y[s], dir: DIR[s], owner: s, dead: false });
                }
            }
        }
        /* mob: terbang, picu gate saat melintas, lalu homing ke base lawan */
        for (const u of sim.units) {
            if (u.dead) continue;
            const sp = u.champ ? SPEED_CHAMP : SPEED_MOB;
            const py = u.y;
            u.x += u.dx * sp * sub; u.y += u.dy * sp * sub;
            u.cc = Math.max(0, u.cc - sub);
            if (!u.gated) {
                const crossed = u.dir < 0 ? (py > GATE_Y && u.y <= GATE_Y) : (py < GATE_Y && u.y >= GATE_Y);
                if (crossed) {
                    for (const g of sim.gates) {
                        if (Math.abs(u.x - g.x) <= GATE_HW) { hitGate(sim, u, g); break; }
                    }
                }
            }
        }
        for (const b of sim.bullets) b.y += b.dir * SPEED_BULLET * sub;
        /* peluru vs mob lawan */
        for (const b of sim.bullets) {
            if (b.dead) continue;
            for (const u of sim.units) {
                if (u.dead || u.side === b.owner) continue;
                const dx = b.x - u.x, dy = b.y - u.y, rr = u.r + 3.5;
                if (dx * dx + dy * dy < rr * rr) {
                    b.dead = true; u.hp--;
                    if (u.hp <= 0) u.dead = true;
                    break;
                }
            }
        }
        /* mob vs mob lawan: saling mengurangi 1 HP (champion 3 HP) */
        for (let i = 0; i < sim.units.length; i++) {
            const a = sim.units[i];
            if (a.dead || a.cc > 0) continue;
            for (let j = i + 1; j < sim.units.length; j++) {
                const b = sim.units[j];
                if (b.dead || b.cc > 0 || b.side === a.side) continue;
                const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r;
                const d2 = dx * dx + dy * dy;
                if (d2 < rr * rr) {
                    a.hp--; b.hp--; a.cc = 0.3; b.cc = 0.3;
                    if (a.hp <= 0) a.dead = true;
                    if (b.hp <= 0) b.dead = true;
                    const d = Math.sqrt(d2) || 1, push = (rr - d) / 2 + 1;
                    a.x += dx / d * push; a.y += dy / d * push;
                    b.x -= dx / d * push; b.y -= dy / d * push;
                    if (a.dead || a.cc > 0) break;
                }
            }
        }
        /* dampak ke base & bersih-bersih */
        for (const u of sim.units) {
            if (u.dead) continue;
            const line = BASE_LINE[1 - u.side];
            const hit = u.dir < 0 ? u.y <= line : u.y >= line;
            if (hit) {
                u.dead = true;
                let dmg = u.champ ? 6 : 1;
                if (ch.power && u.side === sim.mySide) dmg *= 5;
                if (ch.god && (1 - u.side) === sim.mySide) dmg = 0;
                sim.hp[1 - u.side] -= dmg;
                sim.score[u.side] += dmg;
            } else if (u.x < -24 || u.x > W + 24 || u.y < -24 || u.y > H + 24) {
                u.dead = true;
            }
        }
        sim.units = sim.units.filter((u) => !u.dead);
        sim.bullets = sim.bullets.filter((b) => !b.dead && b.y > -10 && b.y < H + 10);
        /* sudden death: mencegah stalemate (PvP dua pemain pasif) */
        if (sim.t > SUDDEN_T) {
            for (let s = 0; s < 2; s++)
                if (!(ch.god && s === sim.mySide)) sim.hp[s] -= SUDDEN_DPS * sub;
        }
        if (sim.hp[0] <= 0 || sim.hp[1] <= 0) {
            sim.phase = "end";
            sim.winner = sim.hp[1] <= 0 ? 0 : 1;
            sim.score[sim.winner] += 200 + Math.round(Math.max(0, sim.hp[sim.winner]) / sim.cfg.hp * 100);
        }
    }
}

/* Snapshot serializable utk Firebase (dipangkas & dibulatkan). */
function makeSnapshot(sim) {
    return {
        v: 1, li: sim.li, ph: sim.phase, t: Math.round(sim.t), op: +sim.openT.toFixed(1),
        first: sim.first, sides: sim.sides.slice(), max: sim.cfg.hp, sd: sim.t > SUDDEN_T,
        hp: [Math.round(sim.hp[0]), Math.round(sim.hp[1])], sc: [sim.score[0], sim.score[1]],
        gt: sim.gates.map((g) => [Math.round(g.x), g.op, +g.budget.toFixed(1)]),
        un: sim.units.map((u) => [u.id, Math.round(u.x), Math.round(u.y), u.side, u.champ ? 1 : 0, u.hp]),
        bu: sim.bullets.map((b) => [b.id, Math.round(b.x), Math.round(b.y), b.dir]),
        cn: sim.cannons.map((c) => [+c.x.toFixed(1), +c.aim.toFixed(3), c.left, +c.cd.toFixed(1)]),
        win: sim.winner,
    };
}

/* Diekspos untuk pengujian otomatis (opsional, tidak dipakai manifest). */
export const __test = {
    W, H, GATE_Y, rng, rollCfg, fallbackCfg, genLevel, isSolvable,
    createSim, stepSim, botThink, tryChamp, spawnMob, makeSnapshot,
};

/* =====================================================================
   MOUNT — UI, input, rendering, dan sinkronisasi room.
   Mode "ai": pemain bawah vs bot. Mode "room": host = otoritas simulasi,
   guest mengirim input & merender snapshot yang diinterpolasi.
===================================================================== */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || room.isHost;
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;                 // snapshot serializable (kontrak template)
    let sim = null;                   // dunia otoritatif (host / offline)
    let snapPrev = null, snapCurr = null, recvT = 0; // interpolasi guest
    const decodeCache = new WeakMap();
    const unsubs = [];

    let destroyed = false, raf = null, lastT = 0, pubT = 0, sendT = 0;
    let lastPubPhase = "", endSaved = false, staticKey = "";
    let sides = [0, 1], mySide = 0;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* abaikan */ }

    const cheats = { god: false, freeze: false, rapid: false, infchamp: false, slowmo: false, power: false };
    let manualPause = false, helpOpen = false, cheatsOpen = false;

    /* input lokal (desktop + mobile digabung) */
    let localAim = 0;
    let keyL = false, keyR = false, keyAL = false, keyAR = false;
    let keyFire = false, padFire = false, boardFire = false, padL = false, padR = false;
    let lastSentFire = false;

    const HOWTO = `
<ul class="mc-howto">
  <li><b>Aim</b> — move the mouse / drag the board. <span class="mc-key">Q</span><span class="mc-key">E</span> fine-tune the angle.</li>
  <li><b>Slide cannon</b> — <span class="mc-key">A</span><span class="mc-key">D</span> or <span class="mc-key">\u2190</span><span class="mc-key">\u2192</span>, or hold the \u25c0 \u25b6 pad buttons.</li>
  <li><b>Fire</b> — hold click / <span class="mc-key">Space</span> / the FIRE pad. Each mob deals 1 damage.</li>
  <li><b>Gates slide &amp; spawn troops!</b> \u00d72 / \u00d73 clone every mob that touches them, +5 / +10 birth extra troops, \u22123 eats 3 mobs per second (it fades while recharging).</li>
  <li><b>Champion</b> — <span class="mc-key">C</span> or the CHAMP pad: a 3-HP tank worth 6 damage. 3 per level, 12s cooldown.</li>
  <li><b>Win</b> — flatten the enemy base first. A coin toss decides who fires first (3s head start). Sudden death drains both bases after 2:30.</li>
</ul>`;

    root.innerHTML = `
<style>
.mc-root{--mc-bg:#0b1526;--mc-line:#233047;--mc-txt:#e2e8f0;--mc-mut:#8aa0bf;--mc-blue:#38bdf8;--mc-rose:#fb7185;--mc-green:#34d399;--mc-amber:#fbbf24;color:var(--mc-txt);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mc-root .mc-hud{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:0 0 10px}
.mc-root .mc-chip{font-size:11.5px;color:var(--mc-mut);background:var(--mc-bg);border:1px solid var(--mc-line);border-radius:999px;padding:4px 10px}
.mc-root .mc-chip b{color:var(--mc-txt);font-weight:600}
.mc-root .mc-side{font-weight:700;letter-spacing:.06em}
.mc-root .mc-stage{position:relative;width:min(100%,420px);margin:0 auto}
.mc-root .mc-board{display:block;width:100%;border-radius:16px;background:var(--mc-bg);touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.mc-root .mc-baselab{font-size:11px;font-weight:700;letter-spacing:.18em;text-anchor:middle}
.mc-root .mc-gatetx{font-size:12.5px;font-weight:800;text-anchor:middle}
.mc-root .mc-youtx{font-size:9px;font-weight:800;letter-spacing:.15em;text-anchor:middle}
.mc-root .mc-champtx{font-size:10px;font-weight:800;text-anchor:middle;fill:#78350f}
.mc-root .mc-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:4;pointer-events:none;background:rgba(11,21,38,.92);border:1px solid var(--mc-line);border-radius:999px;padding:5px 14px;font-size:12px;white-space:nowrap}
.mc-root .mc-toast[hidden]{display:none}
.mc-root .mc-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(6,11,22,.78);backdrop-filter:blur(5px);border-radius:16px;padding:16px;overflow:auto}
.mc-root .mc-overlay[hidden]{display:none}
.mc-root .mc-card{width:min(100%,330px);text-align:center;margin:auto}
.mc-root .mc-card h3{margin:0 0 6px;font-size:20px;font-weight:700}
.mc-root .mc-sub{margin:0 0 10px;font-size:12.5px;color:var(--mc-mut);line-height:1.5}
.mc-root .mc-win{color:var(--mc-green)}
.mc-root .mc-lose{color:var(--mc-rose)}
.mc-root .mc-howto{list-style:none;margin:12px 0;padding:0;display:grid;gap:7px;text-align:left;font-size:12px;color:var(--mc-mut);line-height:1.45}
.mc-root .mc-howto b{color:var(--mc-txt);font-weight:600}
.mc-root .mc-key{display:inline-block;min-width:16px;text-align:center;border:1px solid #33415e;border-bottom-width:2px;border-radius:5px;padding:0 4px;font-size:10.5px;color:#cbd5e1;background:var(--mc-bg);margin:0 1px}
.mc-root .mc-cta{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:var(--mc-blue);color:#082f49;font-weight:700;font-size:14px;padding:10px 22px;cursor:pointer}
.mc-root .mc-cta.ghost{background:transparent;color:var(--mc-mut);border:1px solid var(--mc-line);font-weight:600}
.mc-root .mc-cta:disabled{opacity:.45;cursor:default}
.mc-root .mc-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:4px}
.mc-root .mc-pad{display:flex;gap:8px;width:min(100%,420px);margin:10px auto 0}
.mc-root .mc-pad button{flex:1;border:1px solid var(--mc-line);background:var(--mc-bg);color:var(--mc-txt);border-radius:12px;padding:12px 0;font-size:14px;font-weight:700;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.mc-root .mc-pad button:active{background:#16233c}
.mc-root .mc-pad .mc-fire{flex:1.6;background:var(--mc-blue);border-color:transparent;color:#082f49}
.mc-root .mc-pad .mc-fire:active{background:#7dd3fc}
.mc-root .mc-pad .mc-champbtn{flex:1.6;background:transparent;border-color:#8a6d1f;color:var(--mc-amber)}
.mc-root .mc-pad button:disabled{opacity:.45}
.mc-root .mc-hint{width:min(100%,420px);margin:8px auto 0;font-size:11px;color:var(--mc-mut);text-align:center;line-height:1.5}
.mc-root .mc-cheats{display:grid;gap:6px;text-align:left;margin:10px 0}
.mc-root .mc-cheats label{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;background:var(--mc-bg);border:1px solid var(--mc-line);border-radius:10px;padding:8px 12px;cursor:pointer}
.mc-root .mc-cheats small{display:block;color:var(--mc-mut);font-size:10.5px}
.mc-root .mc-cheats input{accent-color:var(--mc-green);width:16px;height:16px;flex:none}
</style>
<div class="game-app mc-root">
  <div class="game-intro">
    <div><h2>Mob Control</h2><p>Stream mobs through the sliding gates — the first base to fall loses.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="mc-hud">
      <span class="mc-chip">Level <b data-hud="level">1</b>/3</span>
      <span class="mc-chip">Score <b data-hud="score">0</b></span>
      <span class="mc-chip" data-chip="best">Best <b data-hud="best">0</b></span>
      <span class="mc-chip">Army <b data-hud="army">0</b></span>
      <span class="mc-chip mc-side" data-hud="side">YOU · BLUE</span>
    </div>
    <div class="mc-stage">
      <svg class="mc-board" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mob Control battlefield">
        <g data-g="static"></g>
        <g data-g="dyn"></g>
      </svg>
      <div class="mc-toast" data-toast hidden></div>
      <div class="mc-overlay" data-ov="start">
        <div class="mc-card">
          <h3>Mob Control</h3>
          <p class="mc-sub" data-ov="sideinfo">Preparing battlefield…</p>
          ${HOWTO}
          <button class="mc-cta" type="button" data-act="start">Start battle</button>
        </div>
      </div>
      <div class="mc-overlay" data-ov="help" hidden>
        <div class="mc-card">
          <h3>How to play</h3>
          ${HOWTO}
          <p class="mc-sub">Offline: the game pauses while this panel is open. Online: it keeps running, and cheats are disabled.</p>
          <button class="mc-cta" type="button" data-act="closehelp">Resume</button>
        </div>
      </div>
      <div class="mc-overlay" data-ov="clear" hidden>
        <div class="mc-card">
          <h3 class="mc-win">Base destroyed!</h3>
          <p class="mc-sub" data-ov="clearmsg"></p>
          <button class="mc-cta" type="button" data-act="next">Next level</button>
        </div>
      </div>
      <div class="mc-overlay" data-ov="end" hidden>
        <div class="mc-card">
          <h3 data-ov="endtitle">Game over</h3>
          <p class="mc-sub" data-ov="endreason"></p>
          <div class="mc-row">
            <button class="mc-cta ghost" type="button" data-act="retry" data-btn="retry">Try again</button>
            <button class="mc-cta" type="button" data-act="again" data-btn="again">Play again</button>
          </div>
        </div>
      </div>
      <div class="mc-overlay" data-ov="cheats" hidden>
        <div class="mc-card">
          <h3>Cheats</h3>
          <p class="mc-sub">Offline sandbox only — disabled in online rooms.</p>
          <div class="mc-cheats">
            <label><span>God mode<small>Your base ignores all damage</small></span><input type="checkbox" data-cheat="god"></label>
            <label><span>Freeze enemy<small>Bot &amp; enemy turrets stop firing</small></span><input type="checkbox" data-cheat="freeze"></label>
            <label><span>Rapid fire<small>Your cannon fires 3× faster</small></span><input type="checkbox" data-cheat="rapid"></label>
            <label><span>Infinite champions<small>No cooldown, unlimited stock</small></span><input type="checkbox" data-cheat="infchamp"></label>
            <label><span>Slow motion<small>World runs at 55% speed</small></span><input type="checkbox" data-cheat="slowmo"></label>
            <label><span>Power mobs<small>Your mobs deal 5× base damage</small></span><input type="checkbox" data-cheat="power"></label>
          </div>
          <div class="mc-row">
            <button class="mc-cta ghost" type="button" data-act="heal">Heal my base</button>
            <button class="mc-cta ghost" type="button" data-act="winmap">Destroy enemy</button>
            <button class="mc-cta ghost" type="button" data-act="reroll">Reroll map</button>
          </div>
          <div class="mc-row"><button class="mc-cta" type="button" data-act="closecheats">Close</button></div>
        </div>
      </div>
    </div>
    <div class="mc-pad">
      <button type="button" data-pad="left" aria-label="Move cannon left">\u25c0</button>
      <button type="button" data-pad="right" aria-label="Move cannon right">\u25b6</button>
      <button type="button" data-pad="fire" class="mc-fire" aria-label="Hold to fire">FIRE</button>
      <button type="button" data-pad="champ" class="mc-champbtn" data-hud="champ" aria-label="Deploy champion">CHAMP \u00d73</button>
    </div>
    <p class="mc-hint" data-hint></p>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="help">How to play</button>
    <button class="game-action-button" type="button" data-act="cheats" data-ui="cheats">Cheats</button>
    <button class="game-action-button" type="button" data-act="restart" data-ui="restart">Restart</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $(".mc-board");
    const staticG = $('[data-g="static"]');
    const dynG = $('[data-g="dyn"]');
    const statusEl = $("[data-status]");
    const toastEl = $("[data-toast]");
    const ovStart = $('[data-ov="start"]');
    const ovHelp = $('[data-ov="help"]');
    const ovClear = $('[data-ov="clear"]');
    const ovEnd = $('[data-ov="end"]');
    const ovCheats = $('[data-ov="cheats"]');
    const sideInfo = $('[data-ov="sideinfo"]');
    const clearMsg = $('[data-ov="clearmsg"]');
    const endTitle = $('[data-ov="endtitle"]');
    const endReason = $('[data-ov="endreason"]');
    const retryBtn = $('[data-btn="retry"]');
    const againBtn = $('[data-btn="again"]');
    const hud = {
        level: $('[data-hud="level"]'), score: $('[data-hud="score"]'),
        best: $('[data-hud="best"]'), army: $('[data-hud="army"]'),
        side: $('[data-hud="side"]'), champ: $('[data-hud="champ"]'),
        bestChip: $('[data-chip="best"]'),
    };
    const cheatsBtn = $('[data-ui="cheats"]');
    const restartBtn = $('[data-ui="restart"]');
    hud.bestChip.hidden = online;
    cheatsBtn.hidden = online;
    restartBtn.hidden = online && !isHost;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    $("[data-hint]").textContent = coarse
        ? "Drag the board to aim · hold FIRE to stream · hold \u25c0 \u25b6 to slide · CHAMP deploys a tank."
        : "Mouse aims · A/D or \u2190/\u2192 slide · Q/E fine aim · hold click or Space to fire · C champion · H help · P pause.";

    /* ---------- alur pertandingan ---------- */
    function newMatch() {
        const seed = (Math.random() * 1e9) >>> 0;
        // posisi pemain diacak saat multiplayer (host bisa atas atau bawah)
        sides = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1];
        mySide = sides[playerIndex];
        startLevel(0, [0, 0], seed);
    }
    function startLevel(li, score, seed) {
        const s = seed === undefined ? (Math.random() * 1e9) >>> 0 : seed >>> 0;
        const cfg = genLevel(li, s); // dijamin solvable (lihat komentar generator)
        const first = Math.random() < 0.5 ? 0 : 1; // coin toss: siapa jalan duluan
        sim = createSim(li, cfg, (s ^ 0x51ab) >>> 0, {
            sides, first, pvp: online, cheats: online ? null : cheats, mySide, score,
        });
        localAim = 0; lastPubPhase = ""; endSaved = false;
    }

    /* ---------- kontrak template: render / publish / applyAction ---------- */
    function render() {
        const view = currentView();
        if (!view) {
            statusEl.textContent = "Waiting for host…";
            ovStart.hidden = false;
            sideInfo.textContent = "Waiting for the host to prepare the battlefield…";
            return;
        }
        const key = view.li + "|" + view.sides.join(",") + "|" + (online ? 1 : 0);
        if (key !== staticKey) { staticKey = key; renderStatic(view); }
        renderDyn(view);
        updateHud(view);
        updateOverlays(view);
    }
    function publish() {
        // Game real-time: render jalan tiap rAF; publish = kirim snapshot (throttled).
        if (!(online && isHost) || !sim) return;
        state = makeSnapshot(sim);
        room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!sim || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        const side = sim.sides[actor];
        switch (action.type) {
            case "input": {
                const a = Number(action.aim), m = Number(action.move);
                if (!Number.isFinite(a) || !Number.isFinite(m)) return;
                sim.inputs[side] = { aim: clamp(a, -1.05, 1.05), move: clamp(Math.round(m), -1, 1), firing: !!action.firing };
                return; // input streaming: tidak perlu publish balik
            }
            case "champ": if (tryChamp(sim, side)) publish(); return;
            case "start": if (sim.phase === "ready") { sim.phase = "opening"; publish(); } return;
            case "next": if (sim.phase === "end" && sim.li + 1 < LEVEL_COUNT) { startLevel(sim.li + 1, sim.score); sim.phase = "opening"; publish(); } return;
            case "retry": if (sim.phase === "end") { startLevel(sim.li, sim.baseScore); sim.phase = "opening"; publish(); } return;
            case "again": if (sim.phase === "end") { newMatch(); sim.phase = "opening"; publish(); } return;
            case "restart": if (!online || actor === 0) { newMatch(); publish(); } return;
            default: return;
        }
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------- view: dari sim (host/offline) atau interpolasi snapshot ---------- */
    function viewFromSim(s) {
        return {
            li: s.li, phase: s.phase, openT: s.openT, first: s.first, sides: s.sides,
            max: s.cfg.hp, hp: s.hp, score: s.score, sudden: s.t > SUDDEN_T, winner: s.winner,
            gates: s.gates.map((g) => ({ x: g.x, op: g.op, budget: g.budget })),
            units: s.units, bullets: s.bullets,
            cannons: s.cannons.map((c) => ({ x: c.x, aim: c.aim, left: c.left, cd: c.cd })),
        };
    }
    function decode(sn) {
        if (decodeCache.has(sn)) return decodeCache.get(sn);
        const d = {
            li: sn.li, phase: sn.ph, openT: sn.op, first: sn.first, sides: sn.sides,
            max: sn.max, hp: sn.hp, score: sn.sc, sudden: sn.sd, winner: sn.win,
            gates: sn.gt.map((g) => ({ x: g[0], op: g[1], budget: g[2] })),
            units: sn.un.map((u) => ({ id: u[0], x: u[1], y: u[2], side: u[3], champ: !!u[4], hp: u[5], r: u[4] ? 12 : 6.5 })),
            bullets: sn.bu.map((b) => ({ id: b[0], x: b[1], y: b[2], dir: b[3], owner: b[3] > 0 ? 1 : 0 })),
            cannons: sn.cn.map((c) => ({ x: c[0], aim: c[1], left: c[2], cd: c[3] })),
        };
        decodeCache.set(sn, d);
        return d;
    }
    function currentView() {
        if (!online || isHost) return sim ? viewFromSim(sim) : null;
        if (!snapCurr) return null;
        const a = clamp((performance.now() - recvT) / PUB_MS, 0, 1);
        const A = decode(snapPrev || snapCurr), B = decode(snapCurr);
        const pu = new Map(); for (const u of A.units) pu.set(u.id, u);
        const pb = new Map(); for (const b of A.bullets) pb.set(b.id, b);
        return {
            ...B,
            gates: B.gates.map((g, i) => ({ ...g, x: lerp(A.gates[i] ? A.gates[i].x : g.x, g.x, a) })),
            units: B.units.map((u) => { const p = pu.get(u.id); return p ? { ...u, x: lerp(p.x, u.x, a), y: lerp(p.y, u.y, a) } : u; }),
            bullets: B.bullets.map((b) => { const p = pb.get(b.id); return p ? { ...b, x: lerp(p.x, b.x, a), y: lerp(p.y, b.y, a) } : b; }),
            cannons: B.cannons.map((c, i) => {
                const p = A.cannons[i];
                const o = p ? { ...c, x: lerp(p.x, c.x, a), aim: lerp(p.aim, c.aim, a) } : { ...c };
                if (i === mySide) o.aim = localAim; // prediksi lokal agar bidikan responsif
                return o;
            }),
        };
    }

    /* ---------- rendering SVG minimalis ---------- */
    function renderStatic(view) {
        const lab = (s) => online ? (s === mySide ? "YOU" : "RIVAL") : (s === 0 ? "YOU" : "BOT");
        let s = '<rect x="0" y="0" width="400" height="560" fill="#0b1526"/>';
        s += '<rect x="100" y="12" width="200" height="34" rx="9" fill="#152238" stroke="' + SIDE_COL[1] + '" stroke-opacity=".55" stroke-width="1.5"/>';
        s += '<text x="200" y="34" class="mc-baselab" fill="' + SIDE_COL[1] + '">' + lab(1) + ' BASE</text>';
        s += '<rect x="100" y="50" width="200" height="4" rx="2" fill="#1e293b"/>';
        s += '<rect data-g="bar1" x="100" y="50" width="200" height="4" rx="2" fill="' + SIDE_COL[1] + '"/>';
        for (const tx of TURRET_X) s += '<rect x="' + (tx - 6) + '" y="56" width="12" height="7" rx="2" fill="#334155"/>';
        s += '<rect x="100" y="514" width="200" height="34" rx="9" fill="#152238" stroke="' + SIDE_COL[0] + '" stroke-opacity=".55" stroke-width="1.5"/>';
        s += '<text x="200" y="536" class="mc-baselab" fill="' + SIDE_COL[0] + '">' + lab(0) + ' BASE</text>';
        s += '<rect x="100" y="506" width="200" height="4" rx="2" fill="#1e293b"/>';
        s += '<rect data-g="bar0" x="100" y="506" width="200" height="4" rx="2" fill="' + SIDE_COL[0] + '"/>';
        for (const tx of TURRET_X) s += '<rect x="' + (tx - 6) + '" y="497" width="12" height="7" rx="2" fill="#334155"/>';
        staticG.innerHTML = s;
    }
    function renderDyn(view) {
        let s = "";
        for (const g of view.gates) {
            const bad = g.op === "sub3";
            const op = bad ? (0.35 + 0.57 * clamp(g.budget / 3, 0, 1)).toFixed(2) : "0.92";
            s += '<rect x="' + (g.x - GATE_HW).toFixed(1) + '" y="289" width="68" height="22" rx="7" fill="' + (bad ? "#fb7185" : "#34d399") + '" fill-opacity="' + op + '"/>';
            s += '<text x="' + g.x.toFixed(1) + '" y="304" class="mc-gatetx" fill="' + (bad ? "#450a0a" : "#052e16") + '">' + GATE_LABEL[g.op] + "</text>";
        }
        for (const b of view.bullets)
            s += '<circle cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="3" fill="' + (b.owner ? "#fda4af" : "#7dd3fc") + '" fill-opacity=".85"/>';
        for (const u of view.units) {
            if (u.champ) {
                s += '<circle cx="' + u.x.toFixed(1) + '" cy="' + u.y.toFixed(1) + '" r="12" fill="#fbbf24"/>';
                s += '<text x="' + u.x.toFixed(1) + '" y="' + (u.y + 3.5).toFixed(1) + '" class="mc-champtx">6</text>';
            } else {
                s += '<circle cx="' + u.x.toFixed(1) + '" cy="' + u.y.toFixed(1) + '" r="6.5" fill="' + SIDE_COL[u.side] + '"/>';
            }
        }
        for (let i = 0; i < 2; i++) {
            const c = view.cannons[i], col = SIDE_COL[i];
            const tx = c.x + Math.sin(c.aim) * 26, ty = RAIL[i] + DIR[i] * Math.cos(c.aim) * 26;
            s += '<line x1="' + c.x.toFixed(1) + '" y1="' + RAIL[i] + '" x2="' + tx.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="' + col + '" stroke-width="7" stroke-linecap="round"/>';
            s += '<circle cx="' + c.x.toFixed(1) + '" cy="' + RAIL[i] + '" r="13" fill="#0b1526" stroke="' + col + '" stroke-width="2.5"/>';
            s += '<circle cx="' + c.x.toFixed(1) + '" cy="' + RAIL[i] + '" r="4.5" fill="' + col + '"/>';
            if (i === mySide)
                s += '<text x="' + c.x.toFixed(1) + '" y="' + (RAIL[i] + (i === 0 ? 30 : -22)) + '" class="mc-youtx" fill="' + col + '">YOU</text>';
        }
        dynG.innerHTML = s;
    }
    function updateHud(view) {
        hud.level.textContent = view.li + 1;
        hud.score.textContent = view.score[mySide];
        hud.best.textContent = best;
        let army = 0; for (const u of view.units) if (u.side === mySide) army++;
        hud.army.textContent = army;
        hud.side.textContent = "YOU · " + SIDE_NAME[mySide];
        hud.side.style.color = SIDE_COL[mySide];
        const c = view.cannons[mySide];
        const inf = !online && cheats.inchamp;
        hud.champ.textContent = inf ? "CHAMP \u221e" : c.cd > 0 ? "CHAMP " + Math.ceil(c.cd) + "s" : "CHAMP \u00d7" + c.left;
        hud.champ.disabled = inf ? false : c.cd > 0 || c.left <= 0;
        const bar0 = $('[data-g="bar0"]'), bar1 = $('[data-g="bar1"]');
        if (bar0) bar0.setAttribute("width", Math.max(0, 200 * view.hp[0] / view.max).toFixed(1));
        if (bar1) bar1.setAttribute("width", Math.max(0, 200 * view.hp[1] / view.max).toFixed(1));
        const paused = !online && (manualPause || helpOpen || cheatsOpen);
        let st;
        if (paused) st = "Paused";
        else if (view.phase === "ready") st = "Ready";
        else if (view.phase === "opening")
            st = (view.first === mySide ? "You" : online ? "Rival" : "Bot") + " fire first · " + Math.ceil(view.openT) + "s";
        else if (view.phase === "battle") st = view.sudden ? "Sudden death!" : online ? "Online battle" : "vs Bot";
        else st = view.winner === mySide ? "Victory!" : "Defeat";
        statusEl.textContent = st;
        let toast = "";
        if (paused) toast = "Paused — press P to resume";
        else if (view.phase === "opening")
            toast = (view.first === mySide ? "You fire" : online ? "Rival fires" : "Bot fires") + " first — " + Math.ceil(view.openT);
        else if (view.sudden && view.phase === "battle") toast = "Sudden death — bases draining!";
        toastEl.hidden = !toast;
        if (toast) toastEl.textContent = toast;
    }
    function updateOverlays(view) {
        ovStart.hidden = view.phase !== "ready";
        if (view.phase === "ready") {
            sideInfo.textContent = playerName + " · you are " + SIDE_NAME[mySide] + " (" + (mySide === 0 ? "bottom" : "top") + " cannon). "
                + (online ? "Sides are drawn at random. " : "")
                + "Coin toss: " + (view.first === mySide ? "you" : online ? "the rival" : "the bot") + " fire first.";
        }
        const ended = view.phase === "end";
        const iWon = ended && view.winner === mySide;
        const hasNext = ended && view.li + 1 < LEVEL_COUNT;
        ovClear.hidden = !(iWon && hasNext);
        ovEnd.hidden = !(ended && !(iWon && hasNext));
        if (iWon && hasNext)
            clearMsg.textContent = "Level bonus +" + (200 + Math.round(Math.max(0, view.hp[mySide]) / view.max * 100)) + " · Score " + view.score[mySide] + ". Tougher gates ahead.";
        if (ended && !(iWon && hasNext)) {
            if (iWon) {
                endTitle.textContent = "All bases crushed!";
                endTitle.className = "mc-win";
                endReason.textContent = "Final score " + view.score[mySide] + (online ? "" : " · Best " + best) + ".";
                retryBtn.hidden = true;
                againBtn.textContent = "Play again";
            } else {
                endTitle.textContent = "Your base fell";
                endTitle.className = "mc-lose";
                endReason.textContent = (online ? "Rival" : "Bot") + " base still had " + Math.max(0, Math.ceil(view.hp[1 - mySide])) + " HP.";
                retryBtn.hidden = false;
                againBtn.textContent = "New run";
            }
        }
        if (ended && !online && !endSaved) {
            endSaved = true;
            if (view.score[0] > best) {
                best = view.score[0];
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* abaikan */ }
            }
        }
        ovHelp.hidden = !helpOpen;
        ovCheats.hidden = !cheatsOpen || online;
    }

    /* ---------- loop utama ---------- */
    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (keyAL) localAim -= 1.5 * dt;
        if (keyAR) localAim += 1.5 * dt;
        localAim = clamp(localAim, -1.05, 1.05);
        const move = clamp((keyR ? 1 : 0) - (keyL ? 1 : 0) + (padR ? 1 : 0) - (padL ? 1 : 0), -1, 1);
        const firing = keyFire || padFire || boardFire;
        const inp = { type: "input", move, aim: +localAim.toFixed(3), firing };
        if (!online || isHost) {
            if (sim) {
                applyAction(inp, playerIndex);
                const paused = !online && (manualPause || helpOpen || cheatsOpen);
                if (!online && (sim.phase === "opening" || sim.phase === "battle") && !paused) {
                    const b = botThink(sim, 1, dt, sim.cfg.skill);
                    if (b.champ) tryChamp(sim, 1);
                    sim.inputs[1] = { move: b.move, aim: b.aim, firing: b.firing };
                }
                if (!paused && (sim.phase === "opening" || sim.phase === "battle"))
                    stepSim(sim, dt * (!online && cheats.slowmo ? 0.55 : 1));
                if (online) {
                    pubT += dt;
                    if (sim.phase !== lastPubPhase || (pubT >= PUB_MS / 1000 && sim.phase !== "ready")) {
                        pubT = 0; lastPubPhase = sim.phase; publish();
                    }
                }
            }
        } else {
            sendT += dt;
            if (sendT >= INPUT_MS / 1000 || firing !== lastSentFire) {
                sendT = 0; lastSentFire = firing; submitAction(inp);
            }
        }
        render();
    }

    /* ---------- input: mouse / touch di papan ---------- */
    function boardPoint(e) {
        const r = svgEl.getBoundingClientRect();
        return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }
    function aimAt(p) {
        let cx = 200;
        if (!online || isHost) { if (sim) cx = sim.cannons[mySide].x; }
        else if (snapCurr) cx = snapCurr.cn[mySide][0];
        const fwd = (p.y - RAIL[mySide]) * DIR[mySide];
        localAim = clamp(Math.atan2(p.x - cx, fwd), -1.05, 1.05);
    }
    function onBoardDown(e) {
        e.preventDefault();
        try { svgEl.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
        aimAt(boardPoint(e));
        boardFire = true;
    }
    function onBoardMove(e) { aimAt(boardPoint(e)); }
    function onBoardUp() { boardFire = false; }
    svgEl.addEventListener("pointerdown", onBoardDown);
    svgEl.addEventListener("pointermove", onBoardMove);
    svgEl.addEventListener("pointerup", onBoardUp);
    svgEl.addEventListener("pointercancel", onBoardUp);

    /* ---------- input: tombol virtual (mobile & desktop) ---------- */
    function bindHold(el, down, up) {
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); down(); });
        el.addEventListener("pointerup", (e) => { e.preventDefault(); up(); });
        el.addEventListener("pointerleave", up);
        el.addEventListener("pointercancel", up);
    }
    bindHold($('[data-pad="left"]'), () => { padL = true; }, () => { padL = false; });
    bindHold($('[data-pad="right"]'), () => { padR = true; }, () => { padR = false; });
    bindHold($('[data-pad="fire"]'), () => { padFire = true; }, () => { padFire = false; });
    function onWinUp() { boardFire = false; padFire = false; padL = false; padR = false; }
    window.addEventListener("pointerup", onWinUp);
    function onCtx(e) { if (e.target.closest(".mc-pad,.mc-board")) e.preventDefault(); }
    root.addEventListener("contextmenu", onCtx);

    /* ---------- input: keyboard desktop ---------- */
    function onKeyDown(e) {
        if (destroyed) return;
        const ph = sim ? sim.phase : snapCurr ? snapCurr.ph : "ready";
        switch (e.code) {
            case "ArrowLeft": case "KeyA": e.preventDefault(); keyL = true; break;
            case "ArrowRight": case "KeyD": e.preventDefault(); keyR = true; break;
            case "KeyQ": e.preventDefault(); keyAL = true; break;
            case "KeyE": e.preventDefault(); keyAR = true; break;
            case "Space":
                e.preventDefault();
                if (ph === "ready") submitAction({ type: "start" });
                keyFire = true; break;
            case "Enter": if (ph === "ready") { e.preventDefault(); submitAction({ type: "start" }); } break;
            case "KeyC": if (!e.repeat) { e.preventDefault(); submitAction({ type: "champ" }); } break;
            case "KeyH": if (!e.repeat) { e.preventDefault(); helpOpen = !helpOpen; cheatsOpen = false; } break;
            case "KeyP": if (!e.repeat && !online) { e.preventDefault(); manualPause = !manualPause; } break;
            case "Escape": helpOpen = false; cheatsOpen = false; break;
            default: break;
        }
    }
    function onKeyUp(e) {
        switch (e.code) {
            case "ArrowLeft": case "KeyA": keyL = false; break;
            case "ArrowRight": case "KeyD": keyR = false; break;
            case "KeyQ": keyAL = false; break;
            case "KeyE": keyAR = false; break;
            case "Space": keyFire = false; break;
            default: break;
        }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    /* ---------- klik tombol (kontrak template handleClick) ---------- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const pad = event.target.closest('[data-pad="champ"]');
        if (pad) { submitAction({ type: "champ" }); return; }
        const b = event.target.closest("[data-act]");
        if (!b) return;
        const a = b.dataset.act;
        if (a === "help") { helpOpen = !helpOpen; cheatsOpen = false; }
        else if (a === "closehelp") helpOpen = false;
        else if (a === "cheats") { if (!online) { cheatsOpen = !cheatsOpen; helpOpen = false; } }
        else if (a === "closecheats") cheatsOpen = false;
        else if (a === "heal") { if (!online && sim) sim.hp[mySide] = sim.cfg.hp; }
        else if (a === "winmap") { if (!online && sim && sim.phase !== "ready" && sim.phase !== "end") sim.hp[1 - mySide] = 0; }
        else if (a === "reroll") { if (!online && sim) { startLevel(sim.li, sim.baseScore); sim.phase = "opening"; } }
        else if (a === "start" || a === "next" || a === "retry" || a === "again" || a === "restart") submitAction({ type: a });
    }
    function handleChange(e) {
        const t = e.target;
        if (t && t.matches && t.matches("[data-cheat]") && !online) cheats[t.dataset.cheat] = !!t.checked;
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);

    /* ---------- inisialisasi sesuai template ---------- */
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; }));
        if (isHost) {
            newMatch();
            publish();
            unsubs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            unsubs.push(room.onState((nextState) => {
                if (!nextState) return;
                snapPrev = snapCurr; snapCurr = nextState; recvT = performance.now();
                state = nextState;
                sides = nextState.sides || sides;
                mySide = sides[playerIndex];
            }));
        }
    } else {
        newMatch();
    }
    void roomData;
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("contextmenu", onCtx);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("pointerup", onWinUp);
            for (const u of unsubs) if (typeof u === "function") { try { u(); } catch (e) { /* abaikan */ } }
        },
    };
}