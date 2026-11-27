/* ==== GAME: stickman-fighter.js ==== */
/* =============================================================
STICKMAN FIGHTER — duel 2D side-scrolling realtime.
- Template baru: export META + export mount(root, context).
- Mode AI (vs bot) & mode room (online, host-authoritative).
- Arena acak tiap ronde (dijamin bisa diselesaikan), kamera
  side-scroll, giliran pertama & posisi pemain diacak.
- Kontrol sederhana: gerak, lompat, 1 tombol serang (combo
  otomatis), tangkis, jurus. Keyboard + mouse + tombol virtual.
- Overlay tutorial & overlay cheat (khusus mode AI).
============================================================= */
import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "stickman-fighter", // harus sama dengan nama file (tanpa .js)
    name: "Stickman Fighter",
    category: "action",
    catLabel: "Action",
    desc: "Duel stickman 2D side-scroll: gerak, lompat, tahan SERANG untuk combo, tangkis, dan lepas jurus. Menang 2 ronde untuk juara.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="5"/><path d="M12 18v13M12 22l-6 5M12 22l3-8M12 31l-4 10M12 31l6 9"/><path d="M15 25l14-7" stroke="#f87171" stroke-width="3.4"/><path d="M33 10v6M30 13h6" stroke="#fde047" stroke-width="3"/></svg>',
    bg: ["#831843", "#312e81"],
    bestKey: "stickmanFighterWins",
};

/* ================= logika murni (tanpa DOM) ================= */
const VW = 960, VH = 420, GROUND = 352, GRAV = 1500, JUMPV = 560, BASE_SPD = 185;
const ROUND_TIME = 60, WINS_NEEDED = 2;

const HEROES = [
    { key: "blaze", name: "Blaze", color: "#fb923c", sp: "Fireball", spDesc: "Bola api jarak jauh (16 dmg)", spDmg: 16, spCd: 6 },
    { key: "frost", name: "Frost", color: "#38bdf8", sp: "Frost Burst", spDesc: "Es pembeku 1,1 detik (10 dmg)", spDmg: 10, spCd: 7 },
    { key: "volt", name: "Volt", color: "#facc15", sp: "Dash Strike", spDesc: "Terjang menembus lawan (15 dmg)", spDmg: 15, spCd: 5 },
];
const MOVES = {
    punch: { dmg: 8, reach: 60, wind: 0.06, act: 0.12, rec: 0.12, gap: 0.08, kb: 14, lunge: 80 },
    kick: { dmg: 13, reach: 76, wind: 0.10, act: 0.14, rec: 0.18, gap: 0.14, kb: 30, lunge: 120 },
};
const COMBO = ["punch", "punch", "kick"]; // tahan SERANG -> combo otomatis
const DIFFS = [
    { name: "Santai", react: 0.55, aggr: 0.55, block: 0.22, sp: 0.30, spd: 0.85, mul: 0.8 },
    { name: "Normal", react: 0.34, aggr: 0.75, block: 0.38, sp: 0.45, spd: 1.00, mul: 1.0 },
    { name: "Sengit", react: 0.20, aggr: 0.90, block: 0.55, sp: 0.60, spd: 1.12, mul: 1.2 },
];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/* RNG deterministik yang state-nya ikut tersimpan di S (serializable). */
function rnd(S) {
    S.rngS = (S.rngS + 0x6D2B79F5) | 0;
    let t = Math.imul(S.rngS ^ (S.rngS >>> 15), 1 | S.rngS);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---- random level generator (dijamin bisa diselesaikan) ----
   Tinggi lompat maks = JUMPV^2 / (2*GRAV) ~= 104px.
   Semua pijakan dibuat 52..87px (selalu terjangkau dari tanah),
   satu arah (bisa ditembus dari bawah), dan jalur tanah selalu
   terbuka -> duel selalu bisa diselesaikan apa pun seed-nya.   */
function genArena(seed) {
    const r = mulberry(seed);
    const worldW = 1500 + Math.floor(r() * 700); // arena lebih luas dari layar
    const plats = [];
    const want = 3 + Math.floor(r() * 3);
    let guard = 0;
    while (plats.length < want && guard++ < 90) {
        const w = 90 + Math.floor(r() * 70);
        const x = 140 + Math.floor(r() * (worldW - 280 - w));
        const h = 52 + Math.floor(r() * 36); // <= 87 < 104 (tinggi lompat)
        const y = GROUND - h;
        if (x < 340 || x + w > worldW - 340) continue; // zona spawn bersih
        if (plats.some(p => x < p.x + p.w + 34 && x + w > p.x - 34 && Math.abs(p.y - y) < 46)) continue;
        plats.push({ x, y, w });
    }
    return { worldW, plats };
}

function makeFighter(heroIdx, x, face, name, spd, mul) {
    const h = HEROES[heroIdx];
    return {
        hero: heroIdx, name, color: h.color, x, y: GROUND, vy: 0, face,
        hp: 100, maxHp: 100, spd: BASE_SPD * spd, mul,
        blk: false, atk: null, combo: -1, comboT: 0, cd: 0,
        sp: 0, spMax: h.spCd, spPose: 0, frz: 0, dash: 0, dashHit: false,
        lock: 0, flash: 0, walk: 0, onG: true, ko: false,
    };
}
function makeState(o) {
    const seed = (o.seed >>> 0) || 1;
    const a = genArena(seed);
    const S = {
        phase: "menu", t: 0, phaseT: 0, round: 1, wins: [0, 0], timer: ROUND_TIME,
        seed, rngS: seed, worldW: a.worldW, plats: a.plats,
        heroes: o.heroes.slice(), names: o.names.slice(),
        diff: clamp(o.diff | 0, 0, 2), hostSlot: o.hostSlot | 0, vsBot: !!o.vsBot,
        first: 0, matchWinner: -1, f: [], pr: [], ev: [], pIn: [{}, {}],
        banner: "", sub: "", bot: { t: 0, act: "approach", hold: 0 },
    };
    S.f = [
        makeFighter(S.heroes[0], 240, 1, S.names[0], 1, 1),
        makeFighter(S.heroes[1], S.worldW - 240, -1, S.names[1], 1, 1),
    ];
    return S;
}
function resetToMenu(S) {
    S.phase = "menu"; S.banner = ""; S.sub = "";
    S.wins = [0, 0]; S.round = 1; S.matchWinner = -1; S.timer = ROUND_TIME;
    S.pr = []; S.ev = []; S.pIn = [{}, {}];
    S.f[0] = makeFighter(S.heroes[0], 240, 1, S.names[0], 1, 1);
    S.f[1] = makeFighter(S.heroes[1], S.worldW - 240, -1, S.names[1], 1, 1);
}
function startMatch(S) { S.wins = [0, 0]; S.round = 1; S.matchWinner = -1; startRound(S); }
function startRound(S) {
    S.seed = (S.seed + 0x9E3779B9) >>> 0; // arena baru tiap ronde
    const a = genArena((S.seed ^ (S.round * 7919)) >>> 0);
    S.worldW = a.worldW; S.plats = a.plats;
    const d = DIFFS[clamp(S.diff, 0, 2)];
    S.f[0] = makeFighter(S.heroes[0], 240, 1, S.names[0], 1, 1);
    S.f[1] = makeFighter(S.heroes[1], S.worldW - 240, -1, S.names[1], S.vsBot ? d.spd : 1, S.vsBot ? d.mul : 1);
    S.pr = []; S.ev = []; S.pIn = [{}, {}]; S.timer = ROUND_TIME;
    S.first = rnd(S) < 0.5 ? 0 : 1; // koin: siapa menyerang duluan
    S.f[1 - S.first].lock = 0.8;
    S.bot = { t: 0, act: "approach", hold: 0 };
    S.phase = "intro"; S.phaseT = 1.6;
    S.banner = "RONDE " + S.round;
    S.sub = S.names[S.first] + " dapat serangan pertama!";
}
function floorAt(S, f) {
    let fy = GROUND;
    for (const p of S.plats)
        if (f.x >= p.x - 6 && f.x <= p.x + p.w + 6 && p.y >= f.y - 1 && p.y < fy) fy = p.y;
    return fy;
}
function physics(S, f, dt) {
    if (f.onG) {
        const fy = floorAt(S, f);
        if (f.y < fy - 0.5) { f.onG = false; f.vy = 0; } else f.y = fy;
    }
    if (!f.onG) {
        const px = f.y;
        f.vy += GRAV * dt; f.y += f.vy * dt;
        if (f.vy > 0) {
            for (const p of S.plats) {
                if (px <= p.y + 0.01 && f.y >= p.y && f.x >= p.x - 6 && f.x <= p.x + p.w + 6) {
                    f.y = p.y; f.vy = 0; f.onG = true; S.ev.push({ k: "land", x: f.x, y: f.y }); break;
                }
            }
            if (!f.onG && f.y >= GROUND) { f.y = GROUND; f.vy = 0; f.onG = true; S.ev.push({ k: "land", x: f.x, y: f.y }); }
        }
    }
}
function hit(S, attI, base, kb, mods) {
    const att = S.f[attI], def = S.f[1 - attI];
    const defGod = mods && mods.god && (1 - attI) === 0;
    const oh = mods && mods.onehit && attI === 0;
    let dmg = Math.max(1, Math.round(base * att.mul * (def.blk ? 0.2 : 1) * (oh ? 99 : 1)));
    if (defGod) dmg = 0;
    def.hp = Math.max(0, def.hp - dmg);
    def.flash = 0.18;
    def.x = clamp(def.x + att.face * kb * (def.blk ? 0.4 : 1), 24, S.worldW - 24);
    S.ev.push({ k: def.blk ? "block" : "hit", x: def.x, y: def.y - 52, d: dmg, c: att.color });
    if (def.hp <= 0) ko(S, attI);
}
function ko(S, winner) {
    if (S.phase !== "fight") return;
    const loser = S.f[1 - winner];
    S.wins[winner]++;
    S.matchWinner = S.wins[winner] >= WINS_NEEDED ? winner : -1;
    loser.ko = true; loser.blk = false; loser.atk = null; loser.frz = 0; loser.dash = 0;
    loser.vy = -300; loser.onG = false;
    S.pr = []; S.pIn = [{}, {}];
    S.phase = "ko"; S.phaseT = 1.25;
    S.banner = "K.O.!";
    S.sub = S.names[winner] + " memenangkan ronde " + S.round;
    S.ev.push({ k: "ko", x: loser.x, y: loser.y - 40 });
}
function fighterStep(S, i, input, dt, mods) {
    const f = S.f[i], op = S.f[1 - i];
    f.flash = Math.max(0, f.flash - dt);
    f.spPose = Math.max(0, f.spPose - dt);
    f.cd = Math.max(0, f.cd - dt);
    f.sp = Math.max(0, f.sp - dt);
    f.lock = Math.max(0, f.lock - dt);
    f.comboT = Math.max(0, f.comboT - dt);
    if (f.comboT <= 0) f.combo = -1;
    if (mods && mods.nocd && i === 0) f.sp = 0;
    if (f.frz > 0) { f.frz -= dt; f.blk = false; f.atk = null; physics(S, f, dt); S.pIn[i] = { ...input }; return; }
    if (f.dash > 0) {
        f.dash -= dt;
        f.x = clamp(f.x + f.face * 900 * dt, 24, S.worldW - 24);
        S.ev.push({ k: "trail", x: f.x, y: f.y - 30, c: f.color });
        if (!f.dashHit && Math.abs(f.x - op.x) < 40 && Math.abs(f.y - op.y) < 74) {
            f.dashHit = true; hit(S, i, HEROES[f.hero].spDmg, 26, mods);
        }
        physics(S, f, dt); S.pIn[i] = { ...input }; return;
    }
    const prev = S.pIn[i] || {};
    const jPress = input.j && !prev.j, sPress = input.s && !prev.s;
    S.pIn[i] = { l: !!input.l, r: !!input.r, j: !!input.j, a: !!input.a, b: !!input.b, s: !!input.s };
    physics(S, f, dt);
    f.blk = !!input.b && f.onG && !f.atk;
    let mv = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    if (f.blk) mv = 0;
    const spd = f.spd * (mods && mods.speed && i === 0 ? 1.55 : 1) * (f.onG ? 1 : 0.82);
    if (mv !== 0) { f.x = clamp(f.x + mv * spd * dt, 24, S.worldW - 24); f.walk += dt; if (!f.atk) f.face = mv; }
    else if (!f.atk) f.face = op.x >= f.x ? 1 : -1;
    if (jPress && f.onG && !f.atk) { f.vy = -JUMPV; f.onG = false; S.ev.push({ k: "dust", x: f.x, y: f.y }); }
    if (input.a && f.cd <= 0 && !f.atk && !f.blk && f.lock <= 0) {
        f.combo = (f.combo + 1) % COMBO.length;
        const kind = COMBO[f.combo], m = MOVES[kind];
        f.atk = { kind, t: 0, hit: false, step: f.combo };
        f.cd = m.wind + m.act + m.rec + m.gap;
        f.comboT = 1.0;
        f.face = op.x >= f.x ? 1 : -1;
    }
    if (sPress && f.sp <= 0 && !f.atk && f.lock <= 0) {
        const h = HEROES[f.hero];
        f.sp = f.spMax; f.spPose = 0.35; f.face = op.x >= f.x ? 1 : -1;
        if (h.key === "volt") { f.dash = 0.24; f.dashHit = false; }
        else S.pr.push({ o: i, x: f.x + f.face * 26, y: f.y - 46, vx: f.face * (h.key === "blaze" ? 360 : 260), kind: h.key, dmg: h.spDmg });
        S.ev.push({ k: "sp", x: f.x, y: f.y - 46, c: f.color });
    }
    if (f.atk) {
        const m = MOVES[f.atk.kind];
        f.atk.t += dt;
        if (f.atk.t < m.wind + m.act) f.x = clamp(f.x + f.face * m.lunge * dt, 24, S.worldW - 24);
        if (!f.atk.hit && f.atk.t >= m.wind && f.atk.t <= m.wind + m.act) {
            const dx = op.x - f.x;
            if (dx * f.face > -12 && Math.abs(dx) <= m.reach && Math.abs(op.y - f.y) < 74) {
                f.atk.hit = true; hit(S, i, m.dmg, m.kb, mods);
            }
        }
        if (f.atk.t >= m.wind + m.act + m.rec) f.atk = null;
    }
}
function stepSim(S, ins, dt, mods) {
    S.t += dt; S.ev = [];
    if (S.phase === "intro") {
        S.phaseT -= dt;
        if (S.phaseT <= 0) { S.phase = "fight"; S.banner = ""; S.sub = ""; }
        return;
    }
    if (S.phase === "ko") {
        S.phaseT -= dt;
        for (const f of S.f) physics(S, f, dt * 0.4); // slow-motion K.O.
        if (S.phaseT <= 0) {
            if (S.matchWinner >= 0) { S.phase = "matchend"; S.banner = ""; S.sub = ""; }
            else { S.phase = "roundend"; S.phaseT = 2.0; S.banner = S.sub; S.sub = "Ronde berikutnya..."; }
        }
        return;
    }
    if (S.phase === "roundend") {
        S.phaseT -= dt;
        if (S.phaseT <= 0) { S.round++; startRound(S); }
        return;
    }
    if (S.phase !== "fight") return;
    S.timer -= dt;
    fighterStep(S, 0, ins[0] || {}, dt, mods);
    if (S.phase === "fight") fighterStep(S, 1, ins[1] || {}, dt, mods);
    for (const p of S.pr) {
        p.x += p.vx * dt;
        const t = S.f[1 - p.o];
        if (!p.dead && t.hp > 0 && Math.abs(p.x - t.x) < 26 && Math.abs(p.y - (t.y - 46)) < 46) {
            p.dead = true;
            const god = mods && mods.god && (1 - p.o) === 0;
            hit(S, p.o, p.dmg, 18, mods);
            if (p.kind === "frost" && t.hp > 0 && S.phase === "fight" && !god) {
                t.frz = 1.1; S.ev.push({ k: "freeze", x: t.x, y: t.y - 40 });
            }
        }
        if (p.x < -40 || p.x > S.worldW + 40) p.dead = true;
    }
    S.pr = S.pr.filter(p => !p.dead);
    if (S.timer <= 0 && S.phase === "fight") {
        const r0 = S.f[0].hp / S.f[0].maxHp, r1 = S.f[1].hp / S.f[1].maxHp;
        ko(S, r0 === r1 ? (rnd(S) < 0.5 ? 0 : 1) : (r0 > r1 ? 0 : 1));
    }
}
/* Bot sederhana: mendekat, tahan serang, tangkis/jump reaktif, jurus. */
function botInput(S, dt) {
    const inp = { l: false, r: false, j: false, a: false, b: false, s: false };
    const f = S.f[1], op = S.f[0], d = DIFFS[clamp(S.diff, 0, 2)], B = S.bot;
    if (S.phase !== "fight" || f.hp <= 0 || f.frz > 0) return inp;
    B.t -= dt; B.hold -= dt;
    const dist = Math.abs(f.x - op.x), dir = op.x > f.x ? 1 : -1;
    const threat = S.pr.some(p => p.o === 0 && Math.sign(p.vx) === Math.sign(f.x - p.x) && Math.abs(p.x - f.x) < 170);
    if (B.t <= 0) {
        B.t = d.react * (0.7 + rnd(S) * 0.7);
        const r = rnd(S);
        if (threat && r < 0.6) { B.act = r < 0.35 ? "jump" : "block"; B.hold = 0.35; }
        else if (op.atk && dist < 95 && r < d.block) { B.act = "block"; B.hold = 0.3 + rnd(S) * 0.3; }
        else if (f.sp <= 0 && dist < 340 && r < d.sp) { B.act = "special"; }
        else if (dist > 72) { B.act = r < 0.08 ? "jump" : "approach"; }
        else { B.act = r < d.aggr ? "attack" : "approach"; B.hold = 0.3 + rnd(S) * 0.35; }
    }
    if (B.act === "approach") { if (dist > 62) { inp.l = dir < 0; inp.r = dir > 0; } }
    else if (B.act === "attack") {
        inp.a = B.hold > 0;
        if (dist > 54) { inp.l = dir < 0; inp.r = dir > 0; }
        if (B.hold <= 0) B.act = "approach";
    }
    else if (B.act === "block") { inp.b = B.hold > 0; if (B.hold <= 0) B.act = "approach"; }
    else if (B.act === "jump") { inp.j = true; inp.l = dir < 0; inp.r = dir > 0; B.act = "approach"; }
    else if (B.act === "special") { inp.s = true; B.act = "approach"; }
    return inp;
}
const EMPTY_IN = { l: false, r: false, j: false, a: false, b: false, s: false };
function sanitizeIn(k) {
    const o = {};
    for (const key of ["l", "r", "j", "a", "b", "s"]) o[key] = !!(k && k[key]);
    return o;
}

/* ============================ mount ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const vsBot = !online;
    let roomData = room?.room || null;
    const unsubs = [];

    root.innerHTML = `
<style>
.sf-app{--sf-card:#131a24;--sf-line:#ffffff14;--sf-mut:#8b95a7;color:#e7eaf0;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:1100px;margin:0 auto;width:100%;padding:0 12px calc(12px + env(safe-area-inset-bottom));box-sizing:border-box;display:flex;flex-direction:column;gap:10px;min-height:0}
.sf-app *{box-sizing:border-box}
.sf-hud{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.sf-side{flex:1 1 150px;min-width:108px}
.sf-name{display:flex;gap:8px;align-items:baseline;font-size:13px;font-weight:700}
.sf-right .sf-name{justify-content:flex-end}
.sf-tag{font-size:9.5px;font-weight:800;color:#0d1117;background:#34d399;border-radius:5px;padding:1px 5px;letter-spacing:.5px}
.sf-bar{position:relative;height:12px;border-radius:7px;background:#1b2330;overflow:hidden;margin-top:4px;border:1px solid var(--sf-line)}
.sf-bar i{position:absolute;top:0;bottom:0;left:0;border-radius:7px}
.sf-right .sf-bar i{left:auto;right:0}
.sf-ghost{background:#f8717155;transition:width .7s ease}
.sf-fill{background:linear-gradient(90deg,#34d399,#a7f3d0);transition:width .12s ease}
.sf-right .sf-fill{background:linear-gradient(270deg,#f87171,#fecaca)}
.sf-sp{height:5px;border-radius:4px;background:#1b2330;margin-top:4px;overflow:hidden;border:1px solid var(--sf-line)}
.sf-sp i{display:block;height:100%;background:#8b5cf6;transition:width .2s}
.sf-sp.sf-ready i{background:#c4b5fd;animation:sfPulse 1.2s infinite}
@keyframes sfPulse{50%{opacity:.55}}
.sf-mid{text-align:center;min-width:100px;flex:0 0 auto}
.sf-timer{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.sf-pips{display:flex;gap:5px;justify-content:center;align-items:center;margin-top:2px}
.sf-pips i{width:8px;height:8px;border-radius:50%;background:#2a3446}
.sf-pips i.sf-w0{background:#34d399}
.sf-pips i.sf-w1{background:#f87171}
.sf-pips span{font-size:9.5px;color:var(--sf-mut);letter-spacing:1px;margin:0 4px}
.sf-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border:1px solid var(--sf-line);border-radius:8px;background:var(--sf-card);color:#cdd5e1;font-size:10px;white-space:nowrap}
.sf-chip .game-status-dot{width:6px;height:6px;border-radius:50%;background:#34d399;flex:none}
.sf-spacer{flex:1 1 auto}
.sf-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sf-btn{border:1px solid var(--sf-line);background:#0f1520;color:#e7eaf0;min-height:44px;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}
.sf-btn:hover:not(:disabled){border-color:#ffffff3a}
.sf-btn:disabled{opacity:.4;cursor:not-allowed}
.sf-icon-btn{position:relative;display:inline-flex;align-items:center;gap:6px}
.sf-icon-btn svg{flex:none;display:block}
.sf-badge{position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#f87171}
.sf-board{position:relative;padding:0;border-radius:14px;overflow:hidden;border:1px solid var(--sf-line);background:#0a0d16;aspect-ratio:960/420}
.sf-svg{display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}
.sf-banner{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;pointer-events:none;text-align:center;z-index:3}
.sf-banner b{font-size:clamp(28px,6vw,52px);font-weight:900;letter-spacing:3px;color:#fff;text-shadow:0 4px 24px #000}
.sf-banner span{font-size:clamp(12px,2.4vw,16px);color:#cbd5e1;text-shadow:0 2px 10px #000;margin-top:6px}
.sf-pop{animation:sfPop .45s cubic-bezier(.2,1.6,.4,1)}
@keyframes sfPop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
.sf-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:2}
.sf-ov{position:absolute;inset:0;display:grid;place-items:center;background:#0a0d16cc;backdrop-filter:blur(4px);padding:12px;overflow:auto;z-index:5}
.sf-card{width:min(94%,560px);max-height:100%;background:var(--sf-card);border:1px solid var(--sf-line);border-radius:14px;padding:16px;text-align:center;display:flex;flex-direction:column;overflow:hidden}
.sf-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex:none;text-align:left}
.sf-head h3,.sf-head h4{margin:0;font-size:19px}
.sf-scroll{flex:1 1 auto;min-height:0;overflow:auto;text-align:center}
.sf-scroll.sf-cheats{text-align:left}
.sf-foot{flex:none;margin-top:10px}
.sf-foot-btn{display:block;width:100%;margin-top:6px;padding:7px}
.sf-note{color:var(--sf-mut);font-size:10.5px;display:block;margin-bottom:6px}
.sf-muted{color:var(--sf-mut);font-size:12.5px;margin:6px 0}
.sf-heroes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.sf-hero{border:1px solid var(--sf-line);background:#0f1520;border-radius:12px;padding:10px 6px;min-height:64px;color:#e7eaf0;cursor:pointer}
.sf-hero b{display:block;color:var(--hc);font-size:15px}
.sf-hero span{display:block;font-size:10.5px;color:var(--sf-mut);margin-top:3px;line-height:1.35}
.sf-hero.sf-sel{border-color:var(--hc);box-shadow:0 0 0 1px var(--hc)}
.sf-diff{display:flex;gap:6px;justify-content:center;margin:4px 0 10px;flex-wrap:wrap}
.sf-diff button{border:1px solid var(--sf-line);background:#0f1520;color:#cdd5e1;min-height:44px;border-radius:9px;padding:6px 12px;font-size:12px;cursor:pointer}
.sf-diff button.sf-sel{border-color:#8b5cf6;color:#fff;background:#231a3d}
.sf-primary{width:100%;border:0;border-radius:10px;padding:12px;min-height:44px;font-size:15px;font-weight:800;color:#0d1117;background:linear-gradient(90deg,#34d399,#38bdf8);cursor:pointer;margin-top:4px}
.sf-primary:hover{filter:brightness(1.1)}
.sf-cheats label{display:flex;gap:8px;align-items:center;font-size:12.5px;padding:5px 0;cursor:pointer;color:#c3cbd8}
.sf-cheats input{accent-color:#8b5cf6}
.sf-pad{display:none;flex-wrap:wrap;justify-content:center;gap:8px 10px;margin-top:10px;touch-action:none}
.sf-pad>div{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.sf-vb{min-width:56px;height:56px;padding:0 12px;border-radius:12px;border:1px solid var(--sf-line);background:var(--sf-card);color:#e7eaf0;font-size:11.5px;font-weight:800;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.sf-vb:active{transform:scale(.94)}
.sf-vb-a{background:#3b1d5e;border-color:#8b5cf655}
.sf-vb-b{background:#172a45;border-color:#38bdf855}
.sf-vb-s{background:#4c1d24;border-color:#f8717155}
.sf-tut-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left;font-size:12.5px;margin:10px 0}
.sf-tut-grid div{background:#0f1520;border:1px solid var(--sf-line);border-radius:10px;padding:8px 10px;line-height:1.55;color:#c3cbd8}
.sf-tut-grid b{color:#e7eaf0}
.sf-app :focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}
@media (pointer:coarse),(max-width:820px){.sf-pad{display:flex}}
.sf-app.sf-pad-on .sf-pad{display:flex}
@media(max-width:560px){.sf-app{padding-left:8px;padding-right:8px}.sf-tut-grid{grid-template-columns:1fr}.sf-timer{font-size:19px}.sf-pad{gap:8px}.sf-vb{min-width:44px;height:48px;padding:0 8px;font-size:10.5px}}
@media (prefers-reduced-motion:reduce){.sf-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- layout shell overrides (last: beat pointer:coarse min-height) --- */
.sf-app.game-fill > .sf-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.sf-app .sf-hud .sf-btn{min-height:36px;padding:7px 10px;font-size:11px}
@media (max-width:640px){
.sf-app.game-fill > .sf-board:not(:has(.sf-ov:not([hidden]))){aspect-ratio:960/420;flex:0 0 auto}
.sf-app.game-fill > .sf-board:has(.sf-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.sf-app .sf-hud{gap:5px}
.sf-app .sf-hud .sf-side{flex:1 1 100px;min-width:88px}
.sf-app .sf-hud .sf-mid{min-width:70px}
.sf-app .sf-hud .sf-name{font-size:10px}
.sf-app .sf-hud .sf-bar{height:9px}
.sf-app .sf-hud .sf-chip{padding:4px 6px;font-size:9px}
.sf-app .sf-hud .sf-status{display:none}
.sf-app .sf-hud .sf-controls{gap:4px}
.sf-app .sf-hud .sf-btn{min-height:32px;padding:5px 8px;font-size:9px}
.sf-app .sf-hud .sf-btn-label,.sf-app .sf-hud .sf-spacer{display:none}
.sf-app .sf-ov{padding:8px}
.sf-app .sf-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.sf-app .sf-scroll{scrollbar-width:none}
.sf-app .sf-scroll::-webkit-scrollbar{display:none}
.sf-app .sf-foot{position:static;margin:10px 0 0;padding:10px 0 0;border-top:1px solid var(--sf-line)}
.sf-app .sf-note{display:none}
.sf-tut-grid{grid-template-columns:1fr}
}
</style>
<div class="game-app sf-app game-fill" data-sf>
  <div class="sf-hud">
    <div class="sf-side">
      <div class="sf-name"><b data-n0>-</b><span class="sf-tag" data-tag0 hidden>KAMU</span></div>
      <div class="sf-bar"><i class="sf-ghost" data-g0 style="width:100%"></i><i class="sf-fill" data-h0 style="width:100%"></i></div>
      <div class="sf-sp" data-spwrap0><i data-s0 style="width:100%"></i></div>
    </div>
    <div class="sf-mid">
      <div class="sf-timer" data-timer>60</div>
      <div class="sf-pips"><i data-p0></i><i data-p1></i><span data-roundlab>RONDE 1</span><i data-q0></i><i data-q1></i></div>
    </div>
    <div class="sf-side sf-right">
      <div class="sf-name"><span class="sf-tag" data-tag1 hidden>KAMU</span><b data-n1>-</b></div>
      <div class="sf-bar"><i class="sf-ghost" data-g1 style="width:100%"></i><i class="sf-fill" data-h1 style="width:100%"></i></div>
      <div class="sf-sp" data-spwrap1><i data-s1 style="width:100%"></i></div>
    </div>
    <span class="sf-chip sf-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
    <span class="sf-spacer"></span>
    <div class="sf-controls">
      <button class="sf-btn sf-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="sf-btn-label">Help</span></button>
      <button class="sf-btn sf-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<i class="sf-badge" data-cheatbadge hidden></i><span class="sf-btn-label">Cheats</span></button>
      <button class="sf-btn sf-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="sf-btn-label">Pause</span></button>
      <button class="sf-btn sf-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="sf-btn-label">Restart</span></button>
      <button class="sf-btn sf-icon-btn" type="button" data-act="pad" aria-label="Virtual pad" title="Virtual pad">${iconSVG("gamepad2", { size: 14 })}<span class="sf-btn-label">Pad</span></button>
      <button class="sf-btn sf-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="sf-btn-label">Exit game</span></button>
    </div>
  </div>
  <section class="game-panel sf-board" data-board>
    <svg class="sf-svg" viewBox="0 0 960 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arena duel stickman">
      <defs>
        <linearGradient id="sfSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b1026"/><stop offset="1" stop-color="#171d3a"/>
        </linearGradient>
      </defs>
      <g data-g="sky"></g><g data-g="far"></g><g data-g="mid"></g><g data-g="world"></g><g data-g="fx"></g>
    </svg>
    <div class="sf-flash" data-flash></div>
    <div class="sf-banner" data-banner hidden><b data-btext></b><span data-bsub></span></div>

    <div class="sf-ov" data-ov="menu">
      <div class="sf-card">
        <div class="sf-head"><h3>Pilih jagoanmu</h3></div>
        <div class="sf-scroll">
          <p class="sf-muted">Cukup gerak + <b>tahan SERANG</b> (combo otomatis) + jurus. Arena baru tiap ronde, posisi &amp; giliran pertama diacak.</p>
          <div class="sf-heroes">${HEROES.map((h, i) => `<button type="button" class="sf-hero" data-hero="${i}" style="--hc:${h.color}"><b>${h.name}</b><span>${h.sp} &mdash; ${h.spDesc}</span></button>`).join("")}</div>
          <div class="sf-diff" data-diffwrap>${DIFFS.map((d, i) => `<button type="button" data-diff="${i}">${d.name}</button>`).join("")}</div>
        </div>
        <div class="sf-foot">
          <button class="sf-primary" type="button" data-act="start">Mulai duel</button>
          <p class="sf-muted" data-menunote></p>
          <p class="sf-muted">Tekan <b>H</b> untuk panduan &bull; Total menang: <b data-wins>0</b></p>
        </div>
      </div>
    </div>

    <div class="sf-ov" data-ov="end" hidden>
      <div class="sf-card">
        <div class="sf-head"><h3 data-mtitle>Selesai</h3></div>
        <div class="sf-scroll"><p class="sf-muted" data-mmsg></p></div>
        <div class="sf-foot">
          <button class="sf-primary" type="button" data-act="rematch">Main lagi (arena baru)</button>
          <button class="sf-btn sf-foot-btn" type="button" data-act="menu" data-hostonly>Ganti jagoan</button>
        </div>
      </div>
    </div>

    <div class="sf-ov" data-ov="wait" hidden>
      <div class="sf-card">
        <div class="sf-head"><h3>Menunggu host&hellip;</h3></div>
        <div class="sf-scroll"><p class="sf-muted">Menunggu sinkronisasi pertandingan dari host.</p></div>
      </div>
    </div>

    <div class="sf-ov" data-ov="help" hidden>
      <div class="sf-card">
        <div class="sf-head"><h3>Cara bermain</h3><button class="sf-btn sf-icon-btn" type="button" data-help-close aria-label="Tutup panduan" title="Tutup panduan">${iconSVG("x", { size: 14 })}</button></div>
        <div class="sf-scroll sf-help">
          <div class="sf-tut-grid">
            <div><b>Desktop</b><br>A/D atau &larr;/&rarr; gerak<br>W/&uarr;/Spasi lompat<br>J / klik kiri (tahan) serang<br>K / klik kanan (tahan) tangkis<br>L / E jurus</div>
            <div><b>Mobile</b><br>Tombol &#9664; &#9654; gerak<br>LOMPAT, SERANG (tahan),<br>TAHAN (tangkis), JURUS<br>Bisa multi-sentuh bersamaan</div>
            <div><b>Aturan</b><br>Menang 2 ronde = juara<br>Timer 60 detik; habis &rarr; HP terbanyak menang<br>Koin acak menentukan siapa menyerang duluan (lawan terkunci 0,8 detik)</div>
            <div><b>Tips</b><br>Tahan SERANG dari dekat = combo pukulan-pukulan-tendangan<br>Tangkis mengurangi damage 80%<br>Fireball bisa dilompati; Frost membekukan; Volt menerjang<br>Pijakan satu arah: tembus dari bawah, mendarat di atas</div>
          </div>
          <p class="sf-muted">Online: posisi pemain (kiri/kanan) diacak otomatis oleh host. Cheat hanya tersedia saat melawan bot.</p>
        </div>
        <div class="sf-foot"><span class="sf-note">Tekan H untuk membuka panduan</span><button class="sf-primary" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>

    <div class="sf-ov" data-ov="pause" hidden>
      <div class="sf-card">
        <div class="sf-head"><h3>Dijeda</h3></div>
        <div class="sf-scroll"><p class="sf-muted">Timer, simulasi, dan bot dihentikan sementara.</p></div>
        <div class="sf-foot"><button class="sf-primary" type="button" data-resume>Lanjutkan</button></div>
      </div>
    </div>

    <div class="sf-ov" data-ov="cheats" hidden>
      <div class="sf-card">
        <div class="sf-head"><h4>&#128736; Cheat <span class="sf-muted" style="font-size:10px">(mode AI)</span></h4><button class="sf-btn sf-icon-btn" type="button" data-cheats-close aria-label="Tutup cheat" title="Tutup cheat">${iconSVG("x", { size: 14 })}</button></div>
        <div class="sf-scroll sf-cheats">
          <label><input type="checkbox" data-cheat="god"> Darah kebal (God)</label>
          <label><input type="checkbox" data-cheat="onehit"> Sekali pukul K.O.</label>
          <label><input type="checkbox" data-cheat="nocd"> Jurus tanpa cooldown</label>
          <label><input type="checkbox" data-cheat="speed"> Lari super cepat</label>
          <label><input type="checkbox" data-cheat="botoff"> Bot diam di tempat</label>
          <button class="sf-btn sf-foot-btn" type="button" data-act="heal">Pulihkan HP penuh</button>
          <button class="sf-btn sf-foot-btn" type="button" data-act="winround">Langsung menang ronde</button>
        </div>
        <div class="sf-foot"><p class="sf-muted" data-cheatnote style="font-size:10.5px"></p><button class="sf-primary" type="button" data-cheats-close>Tutup</button></div>
      </div>
    </div>
  </section>
  <div class="sf-pad" data-pad>
    <div>
      <button class="sf-vb" type="button" data-k="l" aria-label="Kiri">&#9664;</button>
      <button class="sf-vb" type="button" data-k="r" aria-label="Kanan">&#9654;</button>
    </div>
    <div>
      <button class="sf-vb" type="button" data-k="j">LOMPAT</button>
      <button class="sf-vb sf-vb-a" type="button" data-k="a">SERANG</button>
      <button class="sf-vb sf-vb-b" type="button" data-k="b">TAHAN</button>
      <button class="sf-vb sf-vb-s" type="button" data-k="s">JURUS</button>
    </div>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const app = $(".sf-app");
    const board = $("[data-board]");
    const gSky = $('[data-g="sky"]'), gFar = $('[data-g="far"]'), gMid = $('[data-g="mid"]'),
        gWorld = $('[data-g="world"]'), gFx = $('[data-g="fx"]');
    const el = {
        status: $("[data-status]"), banner: $("[data-banner]"), btext: $("[data-btext]"), bsub: $("[data-bsub]"),
        flash: $("[data-flash]"), timer: $("[data-timer]"), roundlab: $("[data-roundlab]"),
        n: [$("[data-n0]"), $("[data-n1]")], tag: [$("[data-tag0]"), $("[data-tag1]")],
        h: [$("[data-h0]"), $("[data-h1]")], g: [$("[data-g0]"), $("[data-g1]")],
        s: [$("[data-s0]"), $("[data-s1]")], spw: [$("[data-spwrap0]"), $("[data-spwrap1]")],
        p: [$("[data-p0]"), $("[data-p1]")], q: [$("[data-q0]"), $("[data-q1]")],
        ovMenu: $('[data-ov="menu"]'), ovEnd: $('[data-ov="end"]'), ovWait: $('[data-ov="wait"]'),
        ovHelp: $('[data-ov="help"]'), ovPause: $('[data-ov="pause"]'), ovCheats: $('[data-ov="cheats"]'),
        mtitle: $("[data-mtitle]"), mmsg: $("[data-mmsg]"),
        start: $('[data-act="start"]'), diffwrap: $("[data-diffwrap]"), menunote: $("[data-menunote]"),
        wins: $("[data-wins]"), cheatbadge: $("[data-cheatbadge]"), cheatnote: $("[data-cheatnote]"),
        hostonly: $("[data-hostonly]"),
    };

    /* ---------- state klien ---------- */
    let S = null;          // state kanonik (host / mode AI)
    let snap = null;       // snapshot terakhir (tamu online)
    let disp = null;       // state tampilan tamu (di-interpolasi)
    let remoteIn = { ...EMPTY_IN };
    const src = { key: { ...EMPTY_IN }, pad: { ...EMPTY_IN }, mouse: { ...EMPTY_IN } };
    let cam = { x: 0, shake: 0 }, parts = [], flashT = 0;
    let scenery = null, sceneryKey = "";
    let raf = null, lastT = 0, pubT = 0, lastPhase = "";
    let lastBanner = "", lastGuestInKey = "", matchCounted = false;
    let helpOpen = false, cheatOpen = false, pausePaused = false, padOn = false;
    try {
        if (localStorage.getItem("stickmanFighterHelpSeen") !== "1") {
            helpOpen = true;
            localStorage.setItem("stickmanFighterHelpSeen", "1");
        }
    } catch (e) { /* localStorage bisa diblokir */ }
    const cheats = { god: false, onehit: false, nocd: false, speed: false, botoff: false };
    let selHero = 0, selDiff = 1;
    let totalWins = 0;
    try { totalWins = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }

    function mySlot() {
        if (vsBot) return 0;
        if (isHost) return S ? S.hostSlot : 0;
        return snap ? 1 - snap.hostSlot : 1;
    }
    function getLocal() {
        const o = { ...EMPTY_IN };
        for (const s of [src.key, src.pad, src.mouse]) for (const k in o) o[k] = o[k] || !!s[k];
        return o;
    }
    function getDisplay() { return isHost ? S : disp; }
    function paused() { return vsBot && (helpOpen || cheatOpen || pausePaused); }

    /* ---------- init state / jaringan ---------- */
    const randSeed = () => (Math.random() * 1e9) >>> 0;
    const otherHero = (h) => (h + 1 + Math.floor(Math.random() * 2)) % 3;
    if (online) {
        const u0 = room.onRoom && room.onRoom((r) => { roomData = r; });
        if (typeof u0 === "function") unsubs.push(u0);
        if (isHost) {
            // posisi host (kiri/kanan) diacak; nama & jagoan mengikuti slot
            const hs = Math.random() < 0.5 ? 0 : 1;
            const names = ["", ""]; const heroes = [0, 0];
            names[hs] = String(playerName || "Host").slice(0, 16);
            names[1 - hs] = "Tamu";
            heroes[hs] = selHero; heroes[1 - hs] = otherHero(selHero);
            S = makeState({ seed: randSeed(), heroes, names, diff: selDiff, hostSlot: hs, vsBot: false });
            const u1 = room.onAction && room.onAction((a) => applyAction(a, 1));
            if (typeof u1 === "function") unsubs.push(u1);
            publish();
        } else {
            const u2 = room.onState && room.onState((s) => {
                if (!s || !s.f) return;
                if (snap && s.t !== snap.t) consumeEv(s.ev || []);
                snap = s;
            });
            if (typeof u2 === "function") unsubs.push(u2);
            room.sendAction({ t: "name", n: String(playerName || "Tamu").slice(0, 16) }).catch(console.warn);
            room.sendAction({ t: "hero", h: selHero }).catch(console.warn);
        }
    } else {
        S = makeState({
            seed: randSeed(), heroes: [selHero, otherHero(selHero)],
            names: [String(playerName || "Kamu").slice(0, 16), "CPU"],
            diff: selDiff, hostSlot: 0, vsBot: true,
        });
    }

    /* ---------- alur data ala template ---------- */
    function render() { renderFrame(0); }
    function publish() {
        // Hanya host yang menulis state kanonik (throttle ~8 Hz saat bertarung).
        if (online && isHost && S) {
            lastPhase = S.phase;
            room.publishState(JSON.parse(JSON.stringify(S))).catch(console.warn);
        }
    }
    function applyAction(action, actor) {
        if (!S || !isHost || !action || typeof action !== "object") return;
        if (online && actor !== 1 && actor !== 0) return;
        const slot = actor === 1 ? 1 - S.hostSlot : S.hostSlot;
        switch (action.t) {
            case "input":
                if (online && actor === 1) remoteIn = sanitizeIn(action.k);
                break;
            case "hero":
                if (S.phase === "menu") {
                    S.heroes[slot] = clamp(action.h | 0, 0, 2);
                    S.f[slot] = makeFighter(S.heroes[slot], S.f[slot].x, S.f[slot].face, S.names[slot], 1, 1);
                    publish();
                }
                break;
            case "name":
                if (online && actor === 1) {
                    S.names[slot] = String(action.n || "Tamu").slice(0, 16);
                    if (S.f[slot]) S.f[slot].name = S.names[slot];
                    publish();
                }
                break;
            case "diff":
                if (actor === 0 && vsBot) { S.diff = clamp(action.d | 0, 0, 2); publish(); }
                break;
            case "start":
                if (actor === 0 && S.phase === "menu") { startMatch(S); publish(); }
                break;
            case "rematch":
                if (S.phase === "matchend") { startMatch(S); publish(); }
                break;
            case "menu":
                if (actor === 0) { resetToMenu(S); publish(); }
                break;
        }
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, 0);
    }

    /* ---------- event visual (partikel, getaran, kilat) ---------- */
    function consumeEv(evs) {
        for (const e of evs) {
            if (e.k === "hit") {
                spark(e.x, e.y, e.c || "#fde047");
                floatTxt(e.x, e.y - 8, "-" + e.d, "#fca5a5");
                cam.shake = Math.min(10, cam.shake + 4);
            } else if (e.k === "block") {
                spark(e.x, e.y, "#60a5fa");
                floatTxt(e.x, e.y - 8, "TANGKIS", "#93c5fd");
                cam.shake = Math.min(6, cam.shake + 2);
            } else if (e.k === "land" || e.k === "dust") dust(e.x, e.y);
            else if (e.k === "trail") parts.push({ k: "ring", x: e.x, y: e.y, t: 0, life: 0.3, c: e.c, vx: 0, vy: 0 });
            else if (e.k === "freeze") { shards(e.x, e.y); floatTxt(e.x, e.y - 16, "BEKU!", "#7dd3fc"); }
            else if (e.k === "sp") parts.push({ k: "ring", x: e.x, y: e.y, t: 0, life: 0.35, c: e.c, vx: 0, vy: 0 });
            else if (e.k === "ko") { cam.shake = 16; flashT = 0.4; spark(e.x, e.y, "#ffffff"); floatTxt(e.x, e.y - 20, "K.O.!", "#fde047"); }
        }
    }
    function spark(x, y, c) { parts.push({ k: "spark", x, y, t: 0, life: 0.32, c, vx: 0, vy: 0 }); }
    function dust(x, y) {
        for (let i = 0; i < 4; i++)
            parts.push({ k: "dust", x: x + (Math.random() * 16 - 8), y: y - 2, t: 0, life: 0.4, c: "#8b95a7", vx: Math.random() * 40 - 20, vy: -20 - Math.random() * 25 });
    }
    function shards(x, y) {
        for (let i = 0; i < 6; i++)
            parts.push({ k: "shard", x, y, t: 0, life: 0.5, c: "#7dd3fc", vx: Math.random() * 160 - 80, vy: -60 - Math.random() * 90 });
    }
    function floatTxt(x, y, txt, c) { parts.push({ k: "txt", x, y, t: 0, life: 0.75, c, txt, vx: 0, vy: -46 }); }

    /* ---------- interpolasi state tamu ---------- */
    function updateDisp(dt) {
        if (!snap) return;
        if (!disp || disp.phase !== snap.phase || disp.round !== snap.round || disp.worldW !== snap.worldW) {
            disp = JSON.parse(JSON.stringify(snap));
            cam.x = clamp((disp.f[0].x + disp.f[1].x) / 2 - VW / 2, 0, Math.max(0, disp.worldW - VW));
            return;
        }
        const a = 1 - Math.exp(-dt * 14);
        for (const k in snap) if (k !== "f" && k !== "pr") disp[k] = snap[k];
        for (let i = 0; i < 2; i++) {
            const s = snap.f[i], d = disp.f[i];
            const dx = s.x - d.x, dy = s.y - d.y;
            for (const k in s) if (k !== "x" && k !== "y") d[k] = s[k];
            if (Math.abs(dx) > 250 || Math.abs(dy) > 250) { d.x = s.x; d.y = s.y; }
            else { d.x += dx * a; d.y += dy * a; }
            if (d.atk) d.atk.t = Math.min(d.atk.t + dt, 0.5);
            if (disp.pIn[i] && (disp.pIn[i].l || disp.pIn[i].r)) d.walk += dt;
        }
        disp.pr = snap.pr.map((p, i) => {
            const o = disp.pr[i];
            return o ? { ...p, x: o.x + (p.x - o.x) * a } : { ...p };
        });
    }

    /* ---------- frame utama ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (isHost && S) {
            if (!paused()) {
                const meIn = getLocal();
                if (vsBot) {
                    const bi = cheats.botoff ? { ...EMPTY_IN } : botInput(S, dt);
                    stepSim(S, [meIn, bi], dt, cheats);
                } else {
                    const ins = [{ ...EMPTY_IN }, { ...EMPTY_IN }];
                    ins[S.hostSlot] = meIn;
                    ins[1 - S.hostSlot] = remoteIn;
                    stepSim(S, ins, dt, null);
                }
                consumeEv(S.ev);
                if (online) {
                    pubT += dt;
                    if (pubT >= 0.12 || S.phase !== lastPhase) { pubT = 0; publish(); }
                }
            }
        } else if (snap) {
            updateDisp(dt);
        }
        if (online && !isHost) {
            const li = getLocal(), k = JSON.stringify(li);
            if (k !== lastGuestInKey) { lastGuestInKey = k; room.sendAction({ t: "input", k: li }).catch(console.warn); }
        }
        renderFrame(paused() ? 0 : dt);
    }

    /* ---------- overlay / pause helpers ---------- */
    function releaseInputs() {
        for (const k in src.key) src.key[k] = false;
        for (const k in src.pad) src.pad[k] = false;
        for (const k in src.mouse) src.mouse[k] = false;
    }
    function shiftTimeAnchor() {
        // rAF memakai time origin yang sama dengan performance.now(): geser penanda
        // saat resume supaya dt tidak meloncat setelah jeda panjang.
        lastT = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
    }
    function toggleHelp(on) {
        const was = helpOpen;
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatOpen = false; releaseInputs(); }
        else if (was) shiftTimeAnchor();
        render();
    }
    function toggleCheats(on) {
        if (helpOpen) return;
        const was = cheatOpen;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) releaseInputs();
        else if (was) shiftTimeAnchor();
        render();
    }
    function togglePause(on) {
        if (!vsBot) return;
        const can = !!S && S.phase !== "menu" && S.phase !== "matchend";
        if (!pausePaused && on === true && !can) return;
        const was = pausePaused;
        pausePaused = typeof on === "boolean" ? on : !pausePaused;
        if (pausePaused) releaseInputs(); else if (was) shiftTimeAnchor();
        render();
    }
    function restartGame() {
        if (!vsBot || !S) return;
        helpOpen = false; cheatOpen = false; pausePaused = false;
        releaseInputs(); shiftTimeAnchor();
        startMatch(S);
        render();
    }

    /* ---------- input: keyboard ---------- */
    const KEYMAP = {
        ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r",
        ArrowUp: "j", KeyW: "j", Space: "j",
        KeyJ: "a", KeyZ: "a",
        KeyK: "b", KeyX: "b", ShiftLeft: "b", ShiftRight: "b",
        KeyL: "s", KeyE: "s",
    };
    function onKeyDown(e) {
        const c = e.code;
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else togglePause(!pausePaused);
            e.preventDefault(); return;
        }
        if (c === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (helpOpen || cheatOpen || pausePaused) return;
        const k = KEYMAP[c];
        if (!k) return;
        e.preventDefault();
        src.key[k] = true;
    }
    function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) src.key[k] = false; }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    /* ---------- input: mouse di arena ---------- */
    function onBoardDown(e) {
        if (helpOpen || cheatOpen || pausePaused) return;
        if (e.target.closest(".sf-ov,button")) return;
        if (e.button === 2) src.mouse.b = true; else src.mouse.a = true;
    }
    function onWinUp(e) { if (e.button === 2) src.mouse.b = false; else src.mouse.a = false; }
    function onCtx(e) { e.preventDefault(); }
    board.addEventListener("pointerdown", onBoardDown);
    board.addEventListener("contextmenu", onCtx);
    window.addEventListener("pointerup", onWinUp);

    /* ---------- input: tombol virtual (multi-sentuh) ---------- */
    for (const b of root.querySelectorAll("[data-k]")) {
        const k = b.dataset.k;
        b.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { }
            if (helpOpen || cheatOpen || pausePaused) { src.pad[k] = false; return; }
            src.pad[k] = true;
        });
        const off = (e) => { e.preventDefault(); src.pad[k] = false; };
        b.addEventListener("pointerup", off);
        b.addEventListener("pointercancel", off);
        b.addEventListener("contextmenu", onCtx);
    }

    /* ---------- klik UI ---------- */
    function handleClick(event) {
        const t = event.target.closest("[data-act],[data-hero],[data-diff],[data-exit],[data-help],[data-help-close],[data-cheats],[data-cheats-close],[data-pause],[data-resume],[data-restart]");
        if (!t) return;
        if (t.hasAttribute("data-exit")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        if (t.dataset.hero !== undefined) {
            selHero = clamp(Number(t.dataset.hero) | 0, 0, 2);
            submitAction({ t: "hero", h: selHero });
            return;
        }
        if (t.dataset.diff !== undefined) {
            selDiff = clamp(Number(t.dataset.diff) | 0, 0, 2);
            submitAction({ t: "diff", d: selDiff });
            return;
        }
        const a = t.dataset.act;
        if (a === "start") submitAction({ t: "start" });
        else if (a === "rematch") submitAction({ t: "rematch" });
        else if (a === "menu") submitAction({ t: "menu" });
        else if (a === "pad") { padOn = !padOn; app.classList.toggle("sf-pad-on", padOn); }
        else if (a === "heal") { if (vsBot && S && S.phase === "fight") S.f[0].hp = S.f[0].maxHp; }
        else if (a === "winround") { if (vsBot && S && S.phase === "fight") ko(S, 0); }
    }
    function handleChange(e) {
        const c = e.target.closest("[data-cheat]");
        if (!c || online) return;
        cheats[c.dataset.cheat] = !!c.checked;
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);

    /* ---------- rendering ---------- */
    gSky.innerHTML = '<rect x="0" y="0" width="960" height="420" fill="url(#sfSky)"/>' +
        '<circle cx="792" cy="72" r="40" fill="#e2e8f0" opacity="0.07"/>' +
        '<circle cx="792" cy="72" r="24" fill="#e2e8f0" opacity="0.85"/>';

    function buildScenery(D) {
        const key = D.seed + ":" + D.worldW;
        if (sceneryKey === key) return;
        sceneryKey = key;
        const r = mulberry((D.seed ^ 0x5f3759df) >>> 0);
        const wFar = Math.ceil(D.worldW * 0.2) + VW + 240;
        const wMid = Math.ceil(D.worldW * 0.5) + VW + 240;
        let far = "";
        for (let i = 0; i < 46; i++)
            far += '<circle cx="' + (r() * wFar).toFixed(0) + '" cy="' + (8 + r() * 180).toFixed(0) + '" r="' + (0.8 + r() * 1.4).toFixed(1) + '" fill="#cbd5e1" opacity="' + (0.2 + r() * 0.5).toFixed(2) + '"/>';
        let mp = "M0 " + GROUND;
        for (let x = 0; x <= wFar; x += 90) mp += " L" + x + " " + (GROUND - 50 - r() * 110).toFixed(0);
        mp += " L" + wFar + " " + GROUND + " Z";
        far += '<path d="' + mp + '" fill="#141b36"/>';
        let hp = "M0 " + GROUND;
        for (let x = 0; x <= wMid; x += 70) hp += " L" + x + " " + (GROUND - 16 - r() * 64).toFixed(0);
        hp += " L" + wMid + " " + GROUND + " Z";
        let mid = '<path d="' + hp + '" fill="#1a2240"/>';
        for (let x = 60; x < wMid; x += 150)
            if (r() < 0.6) {
                const th = (26 + r() * 30).toFixed(0);
                mid += '<path d="M' + x + " " + GROUND + "l10 -" + th + "l10 " + th + 'z" fill="#212b50"/>';
            }
        let gr = "";
        for (let x = 40; x < D.worldW; x += 90)
            gr += '<rect x="' + x + '" y="' + (GROUND + 16) + '" width="26" height="3" rx="1.5" fill="#1b2340"/>';
        scenery = { far, mid, ground: gr };
    }
    function updateCam(D, dt) {
        const target = clamp((D.f[0].x + D.f[1].x) / 2 - VW / 2, 0, Math.max(0, D.worldW - VW));
        if (Math.abs(cam.x - target) > 420) cam.x = target;
        else cam.x += (target - cam.x) * (1 - Math.exp(-dt * 6));
        cam.shake *= Math.exp(-dt * 7);
        if (cam.shake < 0.05) cam.shake = 0;
    }
    function updateParts(dt) {
        for (const p of parts) {
            p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.k === "shard") p.vy += 600 * dt;
        }
        parts = parts.filter(p => p.t < p.life);
        if (parts.length > 220) parts.splice(0, parts.length - 220);
    }
    function partsSvg() {
        let s = "";
        for (const p of parts) {
            const pr = p.t / p.life, al = Math.max(0, 1 - pr);
            if (p.k === "spark") {
                const r2 = 6 + 18 * pr;
                s += '<g stroke="' + p.c + '" stroke-width="2.5" opacity="' + al.toFixed(2) + '">';
                s += '<path d="M' + (p.x - r2).toFixed(1) + " " + p.y.toFixed(1) + "h" + (r2 * 2).toFixed(1) + "M" + p.x.toFixed(1) + " " + (p.y - r2).toFixed(1) + "v" + (r2 * 2).toFixed(1) + '"/>';
                s += '<path d="M' + (p.x - r2 * 0.7).toFixed(1) + " " + (p.y - r2 * 0.7).toFixed(1) + "l" + (r2 * 1.4).toFixed(1) + " " + (r2 * 1.4).toFixed(1) + "M" + (p.x + r2 * 0.7).toFixed(1) + " " + (p.y - r2 * 0.7).toFixed(1) + "l" + (-r2 * 1.4).toFixed(1) + " " + (r2 * 1.4).toFixed(1) + '"/>';
                s += "</g>";
            } else if (p.k === "ring") {
                s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (4 + 14 * pr).toFixed(1) + '" fill="none" stroke="' + p.c + '" stroke-width="2" opacity="' + (0.7 * al).toFixed(2) + '"/>';
            } else if (p.k === "dust") {
                s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.5" fill="' + p.c + '" opacity="' + (0.5 * al).toFixed(2) + '"/>';
            } else if (p.k === "shard") {
                s += '<line x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) + '" x2="' + (p.x + p.vx * 0.03).toFixed(1) + '" y2="' + (p.y + p.vy * 0.03).toFixed(1) + '" stroke="' + p.c + '" stroke-width="2" opacity="' + al.toFixed(2) + '"/>';
            } else if (p.k === "txt") {
                s += '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="800" fill="' + p.c + '" opacity="' + al.toFixed(2) + '">' + p.txt + "</text>";
            }
        }
        return s;
    }
    function fighterSvg(f, i, D) {
        const x = f.x, y = f.y, d = f.face;
        const col = f.flash > 0 ? "#ffffff" : f.frz > 0 ? "#7dd3fc" : f.color;
        const fy = floorAt(D, f), hgt = Math.max(0, fy - y);
        let s = '<ellipse cx="' + x.toFixed(1) + '" cy="' + (fy + 7).toFixed(1) + '" rx="' + Math.max(6, 14 - hgt * 0.05).toFixed(1) + '" ry="4" fill="#00000066"/>';
        if (f.ko) {
            s += '<g stroke="' + col + '" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9">';
            s += '<circle cx="' + (x - d * 24).toFixed(1) + '" cy="' + (y - 9).toFixed(1) + '" r="8" fill="#0a0d16"/>';
            s += '<path d="M' + (x - d * 16).toFixed(1) + " " + (y - 8).toFixed(1) + "H" + (x + d * 10).toFixed(1) +
                "M" + (x + d * 10).toFixed(1) + " " + (y - 8).toFixed(1) + "l" + d * 12 + " -5M" + (x + d * 10).toFixed(1) + " " + (y - 8).toFixed(1) + "l" + d * 10 + " 4M" +
                (x - d * 6).toFixed(1) + " " + (y - 8).toFixed(1) + "l" + -d * 8 + " -8M" + (x - d * 2).toFixed(1) + " " + (y - 8).toFixed(1) + "l" + -d * 4 + ' 6"/>';
            s += "</g>";
            const a = D.t * 4;
            s += '<circle cx="' + (x - d * 24 + Math.cos(a) * 12).toFixed(1) + '" cy="' + (y - 26 + Math.sin(a) * 4).toFixed(1) + '" r="2" fill="#fde047"/>';
            return s;
        }
        const pin = D.pIn[i] || {};
        const moving = (pin.l || pin.r) && !f.blk && f.onG;
        const bob = f.onG && !moving && !f.atk ? Math.sin(D.t * 3 + i * 2) * 1.3 : 0;
        const hy = y - 62 + bob, sy = y - 54 + bob, ay = y - 46 + bob, hip = y - 28 + bob;
        const X = x.toFixed(1);
        s += '<g stroke="' + col + '" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">';
        s += '<circle cx="' + X + '" cy="' + hy.toFixed(1) + '" r="8" fill="#0a0d16"/>';
        s += '<circle cx="' + (x + d * 3.5).toFixed(1) + '" cy="' + (hy - 1).toFixed(1) + '" r="1.6" fill="' + col + '" stroke="none"/>';
        s += '<path d="M' + X + " " + sy.toFixed(1) + "V" + hip.toFixed(1) + '"/>';
        let legs;
        if (!f.onG) {
            legs = "M" + X + " " + hip.toFixed(1) + "l-8 12l7 4M" + X + " " + hip.toFixed(1) + "l9 11l-6 5";
        } else if (f.atk && f.atk.kind === "kick") {
            const m = MOVES.kick, p = clamp((f.atk.t - m.wind) / m.act, 0, 1), ext = Math.sin(p * Math.PI);
            legs = "M" + X + " " + hip.toFixed(1) + "l" + -d * 5 + " 28M" + X + " " + hip.toFixed(1) + "l" + (d * (10 + 24 * ext)).toFixed(1) + " " + (-2 - 6 * ext).toFixed(1);
        } else {
            const sw = moving ? Math.sin(f.walk * 12) * 7 : 0;
            legs = "M" + X + " " + hip.toFixed(1) + "l" + (-7 + sw).toFixed(1) + " 28M" + X + " " + hip.toFixed(1) + "l" + (7 - sw).toFixed(1) + " 28";
        }
        s += '<path d="' + legs + '"/>';
        if (f.blk) {
            s += '<path d="M' + X + " " + ay.toFixed(1) + "l" + d * 10 + " -8M" + X + " " + ay.toFixed(1) + "l" + d * 14 + " 3l" + d * 2 + ' -12"/>';
            s += '<path d="M' + (x + d * 19).toFixed(1) + " " + (ay - 16).toFixed(1) + "q" + d * 9 + ' 14 0 28" stroke="#60a5fa" opacity="0.85"/>';
        } else if (f.atk && f.atk.kind === "punch") {
            const m = MOVES.punch, p = clamp((f.atk.t - m.wind) / m.act, 0, 1), ext = Math.sin(p * Math.PI);
            s += '<path d="M' + X + " " + ay.toFixed(1) + "l" + -d * 8 + " 10M" + X + " " + ay.toFixed(1) + "l" + (d * (8 + 22 * ext)).toFixed(1) + ' -2"/>';
        } else if (f.dash > 0) {
            s += '<path d="M' + X + " " + ay.toFixed(1) + "l" + -d * 14 + " 6M" + X + " " + ay.toFixed(1) + "l" + -d * 12 + ' 10"/>';
        } else if (f.spPose > 0) {
            s += '<path d="M' + X + " " + ay.toFixed(1) + "l" + d * 20 + " -6M" + X + " " + ay.toFixed(1) + "l" + d * 18 + ' 5"/>';
        } else {
            const swA = moving ? Math.sin(f.walk * 12) * 4 : 0;
            s += '<path d="M' + X + " " + ay.toFixed(1) + "l" + (-d * 9 + swA).toFixed(1) + " 12M" + X + " " + ay.toFixed(1) + "l" + (d * 9 - swA).toFixed(1) + ' 12"/>';
        }
        s += "</g>";
        if (f.frz > 0)
            s += '<rect x="' + (x - 14).toFixed(1) + '" y="' + (y - 74).toFixed(1) + '" width="28" height="76" rx="6" fill="#7dd3fc" opacity="0.22" stroke="#bae6fd" stroke-width="1"/>';
        if (f.lock > 0 && D.phase === "fight")
            s += '<text x="' + (x - 6).toFixed(1) + '" y="' + (hy - 14).toFixed(1) + '" font-size="12">&#128164;</text>';
        if (i === mySlot() && (D.phase === "fight" || D.phase === "intro")) {
            s += '<path d="M' + X + " " + (hy - 18).toFixed(1) + 'l-5 -8h10z" fill="#34d399"/>';
            s += '<text x="' + X + '" y="' + (hy - 30).toFixed(1) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#34d399">KAMU</text>';
        }
        return s;
    }
    function projectilesSvg(D) {
        let s = "";
        for (const p of D.pr) {
            const X = p.x.toFixed(1), Y = p.y.toFixed(1), sg = Math.sign(p.vx) || 1;
            if (p.kind === "blaze") {
                s += '<circle cx="' + (p.x - sg * 12).toFixed(1) + '" cy="' + Y + '" r="5" fill="#fb923c" opacity="0.5"/>';
                s += '<circle cx="' + X + '" cy="' + Y + '" r="8" fill="#fdba74"/><circle cx="' + X + '" cy="' + Y + '" r="4" fill="#fff7ed"/>';
            } else {
                s += '<circle cx="' + X + '" cy="' + Y + '" r="9" fill="#bae6fd" opacity="0.5"/><circle cx="' + X + '" cy="' + Y + '" r="5" fill="#7dd3fc"/>';
                s += '<path d="M' + (p.x - 8).toFixed(1) + " " + Y + "h16M" + X + " " + (p.y - 8).toFixed(1) + 'v16" stroke="#e0f2fe" stroke-width="1.5"/>';
            }
        }
        return s;
    }
    function offscreenSvg(D) {
        const op = D.f[1 - mySlot()];
        if (!op || op.ko) return "";
        const sx = op.x - cam.x, y = clamp(op.y - 70, 56, 300);
        const al = (0.55 + 0.35 * Math.sin(D.t * 6)).toFixed(2);
        if (sx < -8) return '<path d="M16 ' + y.toFixed(1) + 'l12 -8v16z" fill="' + op.color + '" opacity="' + al + '"/>';
        if (sx > VW + 8) return '<path d="M' + (VW - 16) + " " + y.toFixed(1) + 'l-12 -8v16z" fill="' + op.color + '" opacity="' + al + '"/>';
        return "";
    }
    function drawSvg(D) {
        const shx = (Math.random() * 2 - 1) * cam.shake, shy = (Math.random() * 2 - 1) * cam.shake * 0.6;
        gFar.innerHTML = '<g transform="translate(' + (-cam.x * 0.18).toFixed(1) + ',0)">' + scenery.far + "</g>";
        gMid.innerHTML = '<g transform="translate(' + (-cam.x * 0.45).toFixed(1) + ',0)">' + scenery.mid + "</g>";
        let w = '<g transform="translate(' + (-cam.x + shx).toFixed(1) + "," + shy.toFixed(1) + ')">';
        w += '<rect x="0" y="' + GROUND + '" width="' + D.worldW + '" height="' + (VH - GROUND) + '" fill="#10162b"/>';
        w += '<line x1="0" y1="' + GROUND + '" x2="' + D.worldW + '" y2="' + GROUND + '" stroke="#31406e" stroke-width="2"/>';
        w += scenery.ground;
        w += '<rect x="10" y="' + (GROUND - 90) + '" width="4" height="90" rx="2" fill="#31406e"/>';
        w += '<rect x="' + (D.worldW - 14) + '" y="' + (GROUND - 90) + '" width="4" height="90" rx="2" fill="#31406e"/>';
        for (const p of D.plats) {
            w += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="10" rx="5" fill="#232c44"/>';
            w += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="3" rx="1.5" fill="#3d4c78"/>';
        }
        const me = mySlot();
        w += fighterSvg(D.f[1 - me], 1 - me, D);
        w += fighterSvg(D.f[me], me, D);
        w += projectilesSvg(D);
        w += partsSvg();
        w += "</g>";
        gWorld.innerHTML = w;
        gFx.innerHTML = offscreenSvg(D);
    }

    /* ---------- HUD / overlay / banner ---------- */
    const heroBtns = Array.from(root.querySelectorAll("[data-hero]"));
    const diffBtns = Array.from(root.querySelectorAll("[data-diff]"));
    const cheatBoxes = Array.from(root.querySelectorAll("[data-cheat]"));
    const healBtn = root.querySelector('[data-act="heal"]');
    const winBtn = root.querySelector('[data-act="winround"]');

    function updateHud(D) {
        if (!D) { el.status.textContent = online && !isHost ? "Menunggu host…" : "Siap"; return; }
        const me = mySlot();
        for (let i = 0; i < 2; i++) {
            const f = D.f[i];
            el.n[i].textContent = f.name;
            el.n[i].style.color = f.color;
            el.tag[i].hidden = i !== me;
            const pct = Math.max(0, (100 * f.hp) / f.maxHp).toFixed(1) + "%";
            el.h[i].style.width = pct;
            el.g[i].style.width = pct;
            el.s[i].style.width = (f.spMax > 0 ? 100 * (1 - f.sp / f.spMax) : 100).toFixed(1) + "%";
            el.spw[i].classList.toggle("sf-ready", f.sp <= 0);
        }
        el.timer.textContent = Math.max(0, Math.ceil(D.timer));
        el.roundlab.textContent = "RONDE " + D.round;
        el.p[0].className = D.wins[0] > 0 ? "sf-w0" : "";
        el.p[1].className = D.wins[0] > 1 ? "sf-w0" : "";
        el.q[0].className = D.wins[1] > 0 ? "sf-w1" : "";
        el.q[1].className = D.wins[1] > 1 ? "sf-w1" : "";
        const st = {
            menu: "Pilih jagoan", intro: "Bersiap…",
            fight: vsBot ? "vs Bot • " + DIFFS[clamp(S ? S.diff : 1, 0, 2)].name : "Online • Live",
            ko: "K.O.!", roundend: "Jeda ronde", matchend: "Selesai",
        };
        el.status.textContent = st[D.phase] || "Siap";
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".sf-btn-label");
            if (label) label.textContent = pausePaused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", pausePaused ? "Resume" : "Pause");
            pbtn.title = pausePaused ? "Resume (P)" : "Pause (P)";
            pbtn.disabled = !vsBot;
        }
        const rbtn = root.querySelector("[data-restart]");
        if (rbtn) rbtn.disabled = !vsBot;
    }
    function updateOverlays(D) {
        const menu = !!D && D.phase === "menu";
        const blocked = cheatOpen || helpOpen;
        el.ovMenu.hidden = !menu || blocked || pausePaused;
        el.ovWait.hidden = !(online && !isHost && !snap) || blocked;
        el.ovEnd.hidden = !D || D.phase !== "matchend" || blocked || pausePaused;
        el.ovHelp.hidden = !helpOpen;
        el.ovPause.hidden = !pausePaused || !vsBot || blocked;
        el.ovCheats.hidden = !cheatOpen || helpOpen;
        if (menu) {
            el.start.hidden = online && !isHost;
            el.diffwrap.hidden = online;
            el.menunote.textContent = online
                ? (isHost ? "Posisi kiri/kanan diacak saat mulai. Tamu memilih jagoannya sendiri." : "Pilih jagoanmu — host yang memulai duel. Posimu diacak otomatis.")
                : "Tip: tahan SERANG untuk combo otomatis.";
            const cur = isHost && S ? S.heroes[mySlot()] : selHero;
            for (const b of heroBtns) b.classList.toggle("sf-sel", Number(b.dataset.hero) === cur);
            for (const b of diffBtns) b.classList.toggle("sf-sel", Number(b.dataset.diff) === (S ? S.diff : selDiff));
        }
        if (D && D.phase === "matchend") {
            const win = D.matchWinner === mySlot();
            el.mtitle.textContent = win ? "Juara! 🏆" : "Kalah…";
            el.mtitle.style.color = win ? "#34d399" : "#f87171";
            el.mmsg.textContent = D.names[D.matchWinner] + " menang " + D.wins[D.matchWinner] + "-" + D.wins[1 - D.matchWinner] + ". Arena & giliran pertama akan diacak ulang.";
            el.hostonly.hidden = online && !isHost;
        }
        el.cheatbadge.hidden = !(cheats.god || cheats.onehit || cheats.nocd || cheats.speed || cheats.botoff);
        el.cheatnote.textContent = online ? "Nonaktif saat online (fair play)." : "Cheat hanya memengaruhi kamu, bukan bot.";
        for (const c of cheatBoxes) c.disabled = online;
        healBtn.disabled = online;
        winBtn.disabled = online;
        el.wins.textContent = totalWins;
    }
    function updateBanner(D) {
        const b = D ? D.banner : "";
        el.banner.hidden = !b;
        if (b && b !== lastBanner) {
            el.btext.textContent = b;
            el.bsub.textContent = (D && D.sub) || "";
            el.banner.classList.remove("sf-pop");
            void el.banner.offsetWidth;
            el.banner.classList.add("sf-pop");
        } else if (b) {
            el.bsub.textContent = (D && D.sub) || "";
        }
        lastBanner = b;
    }
    function renderFrame(dt) {
        const D = getDisplay();
        if (pausePaused && (!D || D.phase === "menu" || D.phase === "matchend")) pausePaused = false;
        updateHud(D);
        updateOverlays(D);
        updateBanner(D);
        flashT = Math.max(0, flashT - dt);
        el.flash.style.opacity = flashT.toFixed(2);
        if (!D) return;
        buildScenery(D);
        updateCam(D, dt);
        updateParts(dt);
        drawSvg(D);
        if (D.phase === "matchend") {
            if (!matchCounted && D.matchWinner === mySlot()) {
                matchCounted = true;
                totalWins++;
                try { localStorage.setItem(META.bestKey, String(totalWins)); } catch (e) { }
            }
        } else matchCounted = false;
    }

    /* ---------- start & destroy ---------- */
    renderFrame(0);
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            if (raf) { cancelAnimationFrame(raf); raf = null; }
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("pointerup", onWinUp);
            board.removeEventListener("pointerdown", onBoardDown);
            board.removeEventListener("contextmenu", onCtx);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            for (const u of unsubs) { try { u(); } catch (e) { } }
        },
    };
}