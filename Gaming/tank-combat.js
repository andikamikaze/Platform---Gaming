/* ==== GAME: tank-combat.js ==== */
import { iconSVG } from "../JS/icons.js";
/*
  Template game baru:
  - META di bawah dibaca oleh tools/build-games-manifest.mjs (id = nama file tanpa .js).
  - Logika game ada di mount(root, context). Mendukung mode "ai" (vs bot) dan "room" (multiplayer).
  - Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "tank-combat",
    name: "Tank Combat",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Duel artileri tank arcade: pilih tank, lengkungkan peluru, dan taklukkan wave acak tanpa akhir.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 27h30l4 7H5z"/><path d="M14 27v-6h12v6"/><path d="M23 21l9-7"/><circle cx="13" cy="39" r="3"/><circle cx="23" cy="39" r="3"/><circle cx="33" cy="39" r="3"/><path d="M9 35h30" opacity=".55"/></svg>',
    bg: ["#f59e0b", "#0f172a"],
    bestKey: "tankCombatBest",
};

/* =============================================================
   PURE LOGIC (tanpa DOM) — bisa diuji terpisah lewat export PURE.
   ============================================================= */
const VIEW_W = 640, VIEW_H = 400, WORLD_W = 1400;
const GROUND = 330, GRAV = 240;
const AIM_MIN = 0.12, AIM_MAX = 1.45;
const ZONE = [[70, 560], [840, 1330]];
const START_X = [200, 1200];
const TURN_MS = 45000;
const P_HP = 2.6, P_DMG = 2.4, E_HP = 0.4, E_DMG = 0.8;

const TANKS = {
    light: { label: "Tank Ringan", hp: 70, armor: 2, fuel: 150, dmg: 14, rng: 560, vs: 430, g: 1, salvo: 1, score: 100, col: "#fbbf24", trait: "Lincah, bahan bakar besar" },
    medium: { label: "Tank Medium", hp: 100, armor: 4, fuel: 110, dmg: 20, rng: 600, vs: 415, g: 1, salvo: 1, score: 150, col: "#a3e635", trait: "Serba seimbang" },
    mortar: { label: "Mortir", hp: 65, armor: 2, fuel: 85, dmg: 38, rng: 380, vs: 380, g: 1.5, salvo: 1, score: 200, col: "#f97316", trait: "Damage besar, busur tinggi, jarak dekat" },
    mbt: { label: "Tank Tempur (MBT)", hp: 140, armor: 8, fuel: 80, dmg: 28, rng: 640, vs: 440, g: 1, salvo: 1, score: 250, col: "#f87171", trait: "Baja tebal, damage stabil" },
    rocket: { label: "Peluncur Roket", hp: 75, armor: 3, fuel: 100, dmg: 15, rng: 720, vs: 400, g: 0.5, salvo: 2, score: 250, col: "#c084fc", trait: "Salvo 2 roket, lintasan datar" },
    artillery: { label: "Artileri", hp: 80, armor: 3, fuel: 60, dmg: 48, rng: 760, vs: 480, g: 0.55, salvo: 1, score: 300, col: "#38bdf8", trait: "Jarak jauh, damage brutal, lambat" },
    bunker: { label: "Bunker Komando", hp: 300, armor: 6, fuel: 0, dmg: 26, rng: 1300, vs: 560, g: 1, salvo: 1, score: 600, col: "#94a3b8", trait: "Bos wave", boss: true },
};
const PICKABLE = ["light", "medium", "mortar", "mbt", "rocket", "artillery"];
const POOLS = {
    1: ["light"],
    2: ["light", "medium"],
    3: ["light", "medium", "mortar"],
    4: ["medium", "mortar", "mbt"],
    5: ["medium", "mbt", "rocket"],
};
const ALL_FOES = ["light", "medium", "mortar", "mbt", "rocket", "artillery"];

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
function aimClamp(a) { return clamp(num(a, 0.6), AIM_MIN, AIM_MAX); }
function effDamage(dmg, armor) {
    const d = num(dmg, 0);
    if (d <= 0) return 0;
    return Math.max(1, Math.round((d * 10) / (10 + Math.max(0, num(armor, 0)))));
}
function barrelLen(veh) { return veh === "artillery" ? 34 : veh === "mortar" ? 16 : 26; }
function minRange(veh) {
    const s = TANKS[veh];
    return (s.vs * s.vs * Math.sin(2 * AIM_MIN)) / (GRAV * s.g);
}
function bandOf(veh) {
    return [Math.max(220, minRange(veh) * 1.12), TANKS[veh].rng * 0.9];
}
function makeProjs(x, aim, face, veh) {
    const s = TANKS[veh], L = barrelLen(veh);
    const bx = x + face * Math.cos(aim) * L;
    const by = GROUND - 34 - Math.sin(aim) * L;
    const angles = s.salvo >= 2 ? [aim - 0.045, aim + 0.045] : [aim];
    return angles.map((a) => ({
        x: bx + face * Math.cos(a) * 8,
        y: by - Math.sin(a) * 8,
        vx: face * Math.cos(a) * s.vs,
        vy: -Math.sin(a) * s.vs,
        g: s.g,
    }));
}
function solveAngle(dx, h, v, gE) {
    if (dx < 24) return null;
    const disc = v ** 4 - gE * (gE * dx * dx + 2 * h * v * v);
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    return [Math.atan((v * v - sq) / (gE * dx)), Math.atan((v * v + sq) / (gE * dx))];
}
function solveIter(x, face, veh, tx, ty) {
    const s = TANKS[veh], v = s.vs, gE = GRAV * s.g, L = barrelLen(veh);
    let dx = (tx - x) * face, h = GROUND - 34 - ty, out = null;
    for (let i = 0; i < 4; i++) {
        const r = solveAngle(dx, h, v, gE);
        if (!r) return null;
        out = r;
        const bx = x + face * Math.cos(r[0]) * L;
        const by = GROUND - 34 - Math.sin(r[0]) * L;
        dx = (tx - bx) * face; h = by - ty;
    }
    return out;
}
function simulateShot(p, targets) {
    const dt = 1 / 120, gE = GRAV * (p.g || 1);
    let x = p.x, y = p.y, vy = p.vy, t = 0;
    while (t < 8) {
        x += p.vx * dt; vy += gE * dt; y += vy * dt; t += dt;
        for (const tg of targets) {
            const dx = x - tg.x, dy = y - tg.y, rr = tg.r + 4;
            if (dx * dx + dy * dy < rr * rr) return { kind: "hit", idx: tg.idx || 0, x, y, dur: t };
        }
        if (y > GROUND - 2) return { kind: "dirt", idx: -1, x, y: GROUND - 4, dur: t };
        if (x < -40 || x > WORLD_W + 40) return { kind: "out", idx: -1, x, y, dur: t };
    }
    return { kind: "out", idx: -1, x, y, dur: t };
}
function findSolution(face, veh, tx, ty, tr, zone) {
    const s = TANKS[veh], z0 = zone[0], z1 = zone[1];
    const near = face > 0 ? z1 : z0, far = face > 0 ? z0 : z1;
    const cands = [clamp(tx - face * s.rng * 0.72, z0, z1), near, (z0 + z1) / 2, far];
    const seen = new Set();
    for (const cx of cands) {
        const x = Math.round(cx * 10) / 10;
        if (seen.has(x)) continue;
        seen.add(x);
        const r = solveIter(x, face, veh, tx, ty);
        if (!r) continue;
        for (const a of r) {
            if (a < AIM_MIN || a > AIM_MAX) continue;
            for (const da of [0, 0.012, -0.012, 0.025, -0.025]) {
                const aa = aimClamp(a + da);
                const pr = makeProjs(x, aa, face, veh)[0];
                if (simulateShot(pr, [{ x: tx, y: ty, r: tr, idx: 0 }]).kind === "hit") return { x, aim: aa };
            }
        }
    }
    return null;
}
/* Generator wave acak yang DIJAMIN bisa diselesaikan:
   1) setiap musuh punya solusi tembakan nyata dari zona pemain (diverifikasi lewat simulasi balistik),
   2) rasio "tembakan dibutuhkan vs putaran bertahan" >= 1.25 (musuh dikurangi/dilemahkan bila perlu),
   3) komposisi musuh selalu bervariasi (tipe berbeda) bila jumlah > 1. */
function genWave(n, veh, seed) {
    const r = rng(seed >>> 0);
    const ps = TANKS[veh];
    const pHp = Math.round(ps.hp * P_HP * Math.min(1.9, 1 + (n - 1) * 0.05));
    const pDmg = ps.dmg * P_DMG * Math.min(2.2, 1 + (n - 1) * 0.06);
    const boss = n >= 5 && n % 5 === 0;
    const pool = (POOLS[n] || ALL_FOES).slice();
    let count = boss ? 2 : Math.min(3, 1 + Math.floor((n - 1) / 2));
    count = Math.min(count, pool.length);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let types = pool.slice(0, count);
    if (boss) types = ["bunker", pool[0] === "bunker" ? "mbt" : pool[0]];
    const hpMul = Math.min(2.6, 1 + (n - 1) * 0.07);
    const dmgMul = Math.min(1.8, 1 + (n - 1) * 0.035);
    const enemies = [];
    for (let i = 0; i < types.length; i++) {
        const t = types[i];
        const s = TANKS[t];
        const elite = t !== "bunker" && r() < Math.min(0.35, 0.03 * n);
        const baseHp = s.hp * (t === "bunker" ? 1 : E_HP);
        const hp = Math.max(8, Math.round(baseHp * hpMul * (elite ? 1.6 : 1)));
        const dmg = Math.max(3, Math.round(s.dmg * E_DMG * dmgMul * (elite ? 1.25 : 1)));
        const x = t === "bunker" ? 1290 : clamp(860 + i * 150 + r() * 60, 845, 1305);
        enemies.push({ type: t, x, hp, maxHp: hp, dmg, elite, aim: 0.7 });
    }
    for (const e of enemies) {
        const ty = e.type === "bunker" ? GROUND - 30 : GROUND - 24;
        const tr = e.type === "bunker" ? 48 : 24;
        let k = 0;
        while (!findSolution(1, veh, e.x, ty, tr, ZONE[0]) && e.x > 845 && k < 20) { e.x -= 35; k++; }
    }
    const margin = () => {
        let need = 0, worst = 1;
        for (const e of enemies) {
            need += Math.ceil(e.hp / effDamage(pDmg, TANKS[e.type].armor));
            worst = Math.max(worst, effDamage(e.dmg, ps.armor));
        }
        return { m: pHp / worst / Math.max(1, need), need };
    };
    let mm = margin(), fixes = 0;
    while (mm.m < 1.25 && fixes < 14) {
        const nonBoss = enemies.filter((e) => e.type !== "bunker");
        if (enemies.length > 1 && nonBoss.length) {
            let w = nonBoss[0];
            for (const e of nonBoss) if (effDamage(e.dmg, ps.armor) > effDamage(w.dmg, ps.armor)) w = e;
            enemies.splice(enemies.indexOf(w), 1);
        } else {
            for (const e of enemies) {
                e.hp = e.maxHp = Math.max(8, Math.round(e.hp * 0.85));
                e.dmg = Math.max(2, Math.round(e.dmg * 0.9));
            }
        }
        mm = margin(); fixes++;
    }
    return { enemies, info: { need: mm.need, margin: Math.round(mm.m * 100) / 100, boss } };
}

export const PURE = {
    VIEW_W, VIEW_H, WORLD_W, GROUND, GRAV, ZONE, START_X, TANKS, PICKABLE,
    rng, clamp, effDamage, aimClamp, minRange, bandOf, makeProjs,
    solveAngle, solveIter, simulateShot, findSolution, genWave,
};

/* =============================================================
   MOUNT — UI, state, jaringan (host-authoritative), dan render.
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const myActor = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;

    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }
    let helpSeen = true;
    try { helpSeen = localStorage.getItem("tankCombatHelpSeen") === "1"; } catch (e) { helpSeen = true; }
    const firstHelp = !helpSeen;
    if (firstHelp) { try { localStorage.setItem("tankCombatHelpSeen", "1"); } catch (e) { /* storage blocked */ } }
    const cheats = { god: false, oneHit: false, fullAim: false, slow: false };

    root.innerHTML = `
<style>
.tcx{--bg:#0b0f14;--panel:#10161d;--line:#1f2a37;--txt:#e5e7eb;--dim:#8b98a9;--acc:#f59e0b;--good:#4ade80;--bad:#f87171;color:var(--txt);font-family:ui-sans-serif,system-ui,sans-serif}
.tcx [hidden]{display:none!important}
.tcx-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.tcx-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:5px 9px;font-size:11px;letter-spacing:.06em;color:var(--dim);text-transform:uppercase;white-space:nowrap}
.tcx-chip b{color:var(--txt);font-size:12px;font-variant-numeric:tabular-nums}
.tcx-chip.flag{color:#fca5a5;border-color:#7f1d1d}
.tcx-chip.status i{width:6px;height:6px;border-radius:50%;background:var(--good);display:inline-block}
.tcx-bar{display:inline-block;width:86px;height:6px;background:#1c2733;border-radius:4px;overflow:hidden}
.tcx-bar.sm{width:52px}
.tcx-bar i{display:block;height:100%;width:100%;background:var(--good);border-radius:4px;transition:width .18s}
.tcx-bar i.fuel{background:var(--acc)}
.tcx-spacer{flex:1 1 auto}
.tcx-btn{background:var(--panel);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.03em}
.tcx-btn:hover{border-color:#33465c}
.tcx-btn.acc{background:var(--acc);border-color:var(--acc);color:#111827}
.tcx-btn:disabled{opacity:.4;cursor:default}
.tcx-icon-btn{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 10px;font-size:10px;text-transform:uppercase}
.tcx-icon-btn svg{flex:none;display:block}
.tcx-icon-btn.on{border-color:var(--acc);color:var(--acc)}
.tcx-board-panel{position:relative;padding:0;overflow:hidden;border-radius:12px;border:1px solid var(--line);background:var(--bg)}
.tcx .tcx-board{display:block;width:100%;height:100%;aspect-ratio:auto;touch-action:none;cursor:crosshair;background:var(--bg)}
.tcx-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#0f172acc;border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:12px;pointer-events:none;max-width:92%;text-align:center;backdrop-filter:blur(3px);z-index:4}
.tcx-toast.good{border-color:#14532d;color:#bbf7d0}
.tcx-toast.warn{border-color:#78350f;color:#fde68a}
.tcx-toast.bad{border-color:#7f1d1d;color:#fecaca}
.tcx-ov{position:absolute;inset:0;display:grid;place-items:center;padding:12px;background:#0b0f14d9;backdrop-filter:blur(3px);z-index:5}
.tcx-card{width:min(94%,560px);max-height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}
.tcx-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.tcx-head h3{margin:0;font-size:17px;letter-spacing:.03em}
.tcx-tag{font:600 10px/1.4 ui-monospace,monospace;color:var(--dim);text-align:right}
.tcx-body,.tcx-grid,.tcx-cheats,.tcx-help{flex:1 1 auto;min-height:0;overflow:auto}
.tcx-foot{flex:none;display:flex;align-items:center;gap:8px;margin-top:12px}
.tcx-card .sub{margin:0 0 12px;color:var(--dim);font-size:12.5px;line-height:1.55}
.tcx-pickgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 0}
.tcx-tank{background:#0d1319;border:1px solid var(--line);border-radius:10px;padding:9px;cursor:pointer;text-align:left;color:var(--txt)}
.tcx-tank:hover{border-color:#33465c}
.tcx-tank.on{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.tcx-tank .nm{font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px}
.tcx-tank .nm i{width:8px;height:8px;border-radius:2px;display:inline-block}
.tcx-tank .tr{font-size:10.5px;color:var(--dim);margin:3px 0 6px;line-height:1.35;min-height:28px}
.tcx-tank .st{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:10px;color:var(--dim)}
.tcx-tank .st b{color:var(--txt);font-weight:600}
.tcx-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tcx-help h4{margin:12px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--acc)}
.tcx-help p,.tcx-help li{font-size:12.5px;color:#c3ccd8;line-height:1.6;margin:2px 0}
.tcx-help ul{margin:2px 0;padding-left:18px}
.tcx-help kbd{background:#0d1319;border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:11px;font-family:ui-monospace,monospace}
.tcx-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line);font-size:12.5px}
.tcx-cheatrow small{display:block;color:var(--dim);font-size:11px}
.tcx-pill{min-width:52px;text-align:center;border-radius:999px;border:1px solid var(--line);background:#0d1319;color:var(--dim);padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer}
.tcx-pill.on{background:#14532d;border-color:#166534;color:#bbf7d0}
.tcx-controls{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 0 2px;flex-wrap:wrap;user-select:none;-webkit-user-select:none}
.tcx-cluster{display:flex;gap:6px}
.tcx-pad{width:50px;height:44px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--txt);font-size:15px;cursor:pointer;touch-action:none}
.tcx-pad:active{background:#1a2430;border-color:var(--acc)}
.tcx-fire{min-width:118px;height:44px;background:#7f1d1d;border:1px solid #991b1b;color:#fecaca;border-radius:10px;font-size:13px;font-weight:800;letter-spacing:.12em;cursor:pointer;touch-action:none}
.tcx-fire:active{background:#ef4444;color:#fff}
.tcx-controls.off .tcx-pad,.tcx-controls.off .tcx-fire,.tcx-controls.off .tcx-btn{opacity:.35;pointer-events:none}
@media (pointer:coarse){.tcx-pad{width:58px;height:50px}.tcx-fire{height:50px}}

/* --- Batch 02 design polish --- */
.tcx :focus-visible,.tcx button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.tcx-hud{gap:8px;margin:12px 0}
.tcx-chip{padding:6px 10px}
.tcx-btn,.tcx-pill,.tcx-pad,.tcx-fire,.tcx-tank{min-height:44px}
@media (pointer:coarse){.tcx button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.tcx *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (harus paling akhir) --- */
.tcx.game-fill > .tcx-board-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.tcx.game-fill > .tcx-board-panel:not(:has(.tcx-ov:not([hidden]))){aspect-ratio:640/400;flex:0 0 auto}
.tcx.game-fill > .tcx-board-panel:has(.tcx-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.tcx .tcx-hud{gap:5px;margin-bottom:8px}
.tcx .tcx-hud .tcx-chip{padding:4px 6px;font-size:9px}
.tcx .tcx-hud .tcx-chip[data-hud="best"],.tcx .tcx-hud .tcx-chip[data-hud="time"],.tcx .tcx-hud .tcx-chip.status{display:none}
.tcx .tcx-hud .tcx-btn{min-height:32px;padding:5px 9px;font-size:9px}
.tcx .tcx-hud .tcx-btn-label,.tcx .tcx-hud .tcx-spacer{display:none}
.tcx .tcx-ov{padding:8px}
.tcx .tcx-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.tcx .tcx-body,.tcx .tcx-grid,.tcx .tcx-cheats,.tcx .tcx-help{scrollbar-width:none}
.tcx .tcx-body::-webkit-scrollbar,.tcx .tcx-grid::-webkit-scrollbar,.tcx .tcx-cheats::-webkit-scrollbar,.tcx .tcx-help::-webkit-scrollbar{display:none}
.tcx .tcx-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.tcx .tcx-pickgrid{grid-template-columns:repeat(2,1fr)}
.tcx .tcx-bar{width:60px}
.tcx .tcx-controls{padding:8px 0 0}
.tcx .tcx-pad{width:48px;height:44px}
.tcx .tcx-fire{min-width:104px;height:44px}
}
</style>
<div class="game-app tcx game-fill" data-tcx>
  <div class="tcx-hud">
    <span class="tcx-chip status"><i data-dot></i><span data-status>Siap</span></span>
    <span class="tcx-chip"><span data-hud="wlabel">Wave</span> <b data-hud="wave">1</b></span>
    <span class="tcx-chip">Skor <b data-hud="score">0</b></span>
    <span class="tcx-chip" data-chip="best">Rekor <b data-hud="best">0</b></span>
    <span class="tcx-chip"><span data-hud="veh">—</span> <i class="tcx-bar"><i data-bar="hp"></i></i></span>
    <span class="tcx-chip">BB <i class="tcx-bar sm"><i class="fuel" data-bar="fuel"></i></i></span>
    <span class="tcx-chip" data-hud="timechip">⏱ <b data-hud="time">∞</b></span>
    <span class="tcx-chip flag" data-hud="cheatflag" hidden>Cheat</span>
    <span class="tcx-spacer"></span>
    <button class="tcx-btn tcx-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="tcx-btn-label">Help</span></button>
    <button class="tcx-btn tcx-icon-btn" type="button" data-cheats data-cheatbtn aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="tcx-btn-label">Cheats</span></button>
    <button class="tcx-btn tcx-icon-btn" type="button" data-pause data-pausebtn aria-label="Pause" title="Pause (P)"><span data-ico="pause">${iconSVG("pause", { size: 14 })}</span><span data-ico="play" hidden>${iconSVG("play", { size: 14 })}</span><span class="tcx-btn-label">Pause</span></button>
    <button class="tcx-btn tcx-icon-btn" type="button" data-skip data-skipbtn aria-label="Lewati giliran" title="Lewati giliran (E)">${iconSVG("skipForward", { size: 14 })}<span class="tcx-btn-label">Lewati</span></button>
    <button class="tcx-btn tcx-icon-btn" type="button" data-restart data-restartbtn aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="tcx-btn-label">Restart</span></button>
    <button class="tcx-btn tcx-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="tcx-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel tcx-board-panel" data-board>
    <svg class="tcx-board" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Medan duel tank 2D side-scrolling">
      <g data-g="far"></g><g data-g="mid"></g>
      <g data-g="world"><g data-g="static"></g><g data-g="dyn"></g></g>
      <g data-g="ui"></g>
    </svg>
    <div class="tcx-toast" data-toast hidden></div>
    <div class="tcx-ov" data-ov="pick">
      <div class="tcx-card">
        <div class="tcx-head"><h3>Pilih Tankmu</h3><span class="tcx-tag" data-pickwait></span></div>
        <div class="tcx-body">
          <p class="sub">Setiap kelas punya gaya main berbeda. Angka damage &amp; HP sudah termasuk bonus arcade pemain.</p>
          <div class="tcx-pickgrid" data-pickgrid></div>
        </div>
        <div class="tcx-foot">
          <button class="tcx-btn" type="button" data-act="pickrand">🎲 Acak</button>
          <span class="tcx-spacer"></span>
          <button class="tcx-btn acc" type="button" data-act="begin" data-beginbtn>Mulai ▶</button>
        </div>
      </div>
    </div>
    <div class="tcx-ov" data-ov="help" hidden>
      <div class="tcx-card">
        <div class="tcx-head"><h3>How to play</h3><button class="tcx-btn" type="button" data-act="closehelp">Close</button></div>
        <div class="tcx-help">
          <p class="sub">Duel artileri bergiliran 2D side-scrolling. Keluar dari pangkalan, lempar peluru melengkung, hancurkan semua lawan sebelum tankmu rontok.</p>
          <h4>Aturan Giliran</h4>
          <ul>
            <li>Koin dilempar tiap wave/partai: siapa jalan duluan itu <b>acak</b>.</li>
            <li>Tiap giliran kamu boleh bergerak (dibatasi bahan bakar / BB), membidik bebas, lalu <b>satu tembakan mengakhiri giliran</b>.</li>
            <li>Tombol <b>Lewati</b> mengakhiri giliran tanpa menembak (untuk pindah posisi).</li>
            <li>Multiplayer: giliran dibatasi 45 detik, posisi kiri/kanan diacak saat partai dimulai.</li>
          </ul>
          <h4>Kontrol Desktop</h4>
          <p><kbd>A</kbd>/<kbd>D</kbd> atau <kbd>←</kbd>/<kbd>→</kbd> gerak · <kbd>W</kbd>/<kbd>S</kbd> atau <kbd>↑</kbd>/<kbd>↓</kbd> sudut meriam · gerakkan <b>mouse</b> untuk membidik · <kbd>Spasi</kbd> / <b>klik</b> tembak · <kbd>E</kbd> lewati · <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · <kbd>P</kbd> jeda · <kbd>R</kbd> restart.</p>
          <h4>Kontrol Mobile</h4>
          <p>Tahan tombol ◀ ▶ untuk bergerak, ▲ ▼ untuk sudut, <b>drag di arena</b> untuk membidik cepat, lalu tekan <b>TEMBAK</b>.</p>
          <h4>Tips</h4>
          <ul>
            <li>Perhatikan garis putus-putus: itu awal lintasan pelurumu. Gravitasi menariknya turun.</li>
            <li>Tiap tank punya jarak efektif minimum &amp; maksimum — mortir harus mendekat, artileri menjaga jarak.</li>
            <li>Musuh bervariasi: ringan, medium, mortir, MBT, roket, artileri, plus <b>bos bunker</b> tiap wave ke-5. Yang bertanda ★ adalah elite (lebih keras, skor ×2).</li>
            <li>Wave dibuat generator acak yang memverifikasi solusi tembakan &amp; peluang menangmu — selalu bisa diselesaikan.</li>
            <li>Cheat hanya tersedia melawan bot, dan skor ber-cheat tidak disimpan ke rekor.</li>
          </ul>
        </div>
        <div class="tcx-foot"><span class="tcx-spacer"></span><button class="tcx-btn acc" type="button" data-act="closehelp">Mengerti</button></div>
      </div>
    </div>
    <div class="tcx-ov" data-ov="cheat" hidden>
      <div class="tcx-card">
        <div class="tcx-head"><h3>Cheat <span style="color:#fca5a5;font-size:11px">(khusus vs bot)</span></h3><button class="tcx-btn" type="button" data-act="closecheat">Close</button></div>
        <div class="tcx-cheats" data-cheatrows></div>
        <div class="tcx-foot"><span class="tcx-spacer"></span><button class="tcx-btn acc" type="button" data-act="closecheat">Tutup</button></div>
      </div>
    </div>
    <div class="tcx-ov" data-ov="clear" hidden>
      <div class="tcx-card">
        <div class="tcx-head"><h3 style="color:var(--good)">Wave selesai! ✦</h3></div>
        <div class="tcx-body"><p class="sub" data-clearmsg></p></div>
        <div class="tcx-foot"><span class="tcx-spacer"></span><button class="tcx-btn acc" type="button" data-act="next">Wave berikutnya ▶</button></div>
      </div>
    </div>
    <div class="tcx-ov" data-ov="over" hidden>
      <div class="tcx-card">
        <div class="tcx-head"><h3 data-overtitle>—</h3></div>
        <div class="tcx-body"><p class="sub" data-overmsg></p></div>
        <div class="tcx-foot" data-overbtns></div>
      </div>
    </div>
    <div class="tcx-ov" data-ov="pause" hidden>
      <div class="tcx-card">
        <div class="tcx-head"><h3>Dijeda</h3></div>
        <div class="tcx-body"><p class="sub">Permainan dibekukan — timer, bot, dan animasi berhenti. Tekan <kbd>P</kbd> atau <kbd>Esc</kbd> untuk melanjutkan.</p></div>
        <div class="tcx-foot">
          <button class="tcx-btn" type="button" data-act="restart">Restart</button>
          <span class="tcx-spacer"></span>
          <button class="tcx-btn acc" type="button" data-act="resume">Lanjutkan ▶</button>
        </div>
      </div>
    </div>
  </section>
  <div class="tcx-controls off" data-controls>
    <div class="tcx-cluster">
      <button class="tcx-pad" type="button" data-hold="l" aria-label="Gerak kiri">◀</button>
      <button class="tcx-pad" type="button" data-hold="r" aria-label="Gerak kanan">▶</button>
    </div>
    <div class="tcx-cluster">
      <button class="tcx-pad" type="button" data-hold="u" aria-label="Naikkan sudut">▲</button>
      <button class="tcx-pad" type="button" data-hold="d" aria-label="Turunkan sudut">▼</button>
    </div>
    <button class="tcx-fire" type="button" data-act="fire">TEMBAK</button>
    <button class="tcx-btn" type="button" data-act="end">Lewati (E)</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $(".tcx-board");
    const farG = $('[data-g="far"]'), midG = $('[data-g="mid"]');
    const worldG = $('[data-g="world"]'), staticG = $('[data-g="static"]'), dynG = $('[data-g="dyn"]'), uiG = $('[data-g="ui"]');
    const ovPick = $('[data-ov="pick"]'), ovHelp = $('[data-ov="help"]'), ovCheat = $('[data-ov="cheat"]');
    const ovClear = $('[data-ov="clear"]'), ovOver = $('[data-ov="over"]'), ovPause = $('[data-ov="pause"]');
    const toastEl = $("[data-toast]"), statusEl = $("[data-status]"), dotEl = $("[data-dot]");
    const controlsEl = $("[data-controls]");
    const pickGrid = $("[data-pickgrid]"), pickWait = $("[data-pickwait]"), beginBtn = $("[data-beginbtn]");
    const cheatRows = $("[data-cheatrows]"), cheatBtn = $("[data-cheatbtn]");
    const pauseBtn = $("[data-pausebtn]"), skipBtn = $("[data-skipbtn]"), restartBtn = $("[data-restartbtn]");
    const hud = {
        wlabel: $('[data-hud="wlabel"]'), wave: $('[data-hud="wave"]'), score: $('[data-hud="score"]'),
        best: $('[data-hud="best"]'), veh: $('[data-hud="veh"]'), time: $('[data-hud="time"]'),
        cheatflag: $('[data-hud="cheatflag"]'),
    };
    const hpBar = $('[data-bar="hp"]'), fuelBar = $('[data-bar="fuel"]');
    const bestChip = $('[data-chip="best"]');

    /* ---------- lifecycle helpers (timer bisa dibekukan saat pause) ---------- */
    let mounted = true, epoch = 0;
    const timers = new Set(), unsubs = [], listeners = [];
    let paused = false, pauseAt = 0, pausePerfAt = 0;
    function arm(entry, delay) {
        const token = (entry.token || 0) + 1;
        entry.token = token;
        entry.id = setTimeout(() => {
            if (paused || entry.token !== token) return;
            timers.delete(entry);
            if (mounted && (entry.raw || entry.epoch === epoch)) entry.fn();
        }, Math.max(0, delay));
        timers.add(entry);
        return entry;
    }
    function after(ms, fn) { return arm({ fn, epoch, at: Date.now() + ms }, ms); }
    function afterRaw(ms, fn) { return arm({ fn, epoch, raw: true, at: Date.now() + ms }, ms); }
    function clearEntry(entry) { if (!entry) return; clearTimeout(entry.id); timers.delete(entry); }
    function clearTimers() { for (const entry of timers) clearTimeout(entry.id); timers.clear(); }
    function pauseTimers() {
        pauseAt = Date.now();
        pausePerfAt = performance.now();
        for (const entry of timers) clearTimeout(entry.id);
    }
    function resumeTimers() {
        if (!paused) return;
        const delta = Date.now() - pauseAt;
        const perfDelta = performance.now() - pausePerfAt;
        if (state && state.turnEndsAt) state.turnEndsAt += delta;
        flightT0 += perfDelta; rolloutT0 += perfDelta; lastPoseSent += perfDelta;
        for (const entry of Array.from(timers)) arm(entry, Math.max(0, entry.at + delta - Date.now()));
        paused = false;
    }
    function on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); listeners.push([t, ev, fn, opt]); }

    /* ---------- local view state ---------- */
    let cam = 0, dispSides = [START_X[0], START_X[1]], dispAim = [0.6, 0.6];
    let dispEn = [], dispEnAim = [];
    let localPose = null, poseAnchor = 0, lastPoseSent = 0;
    const keys = { l: 0, r: 0, u: 0, d: 0 };
    let dragging = false, dustAcc = 0;
    let effects = [], flashT = 0;
    let flightT0 = 0, rolloutT0 = 0;
    let lastFxId = 0, lastMsgId = 0, lastShotId = 0, prevPhase = "", prevTurnKey = "", pickSig = "", staticSeed = -1;
    let helpOpen = firstHelp, cheatOpen = false, toastTimer = null;
    let raf = null, lastT = 0;

    /* ---------- small helpers ---------- */
    function names() {
        try {
            const p = roomData && roomData.players;
            if (Array.isArray(p)) return [(p[0] && p[0].name) || "Host", (p[1] && p[1].name) || "Tamu"];
            if (p && typeof p === "object") return [(p.host && p.host.name) || "Host", (p.guest && p.guest.name) || "Tamu"];
        } catch (e) { }
        return ["Host", "Tamu"];
    }
    function mySide() {
        if (!online) return 0;
        if (!state || !state.sides) return null;
        return state.sides[myActor === 0 ? "host" : "guest"];
    }
    function sideActor(side) {
        if (!online) return side === 0 ? 0 : 1;
        if (!state || !state.sides) return null;
        return state.sides.host === side ? 0 : 1;
    }
    function tankOf(side) { return (state && state.tanks && state.tanks[side]) || null; }
    function myTank() { const s = mySide(); return s == null ? null : tankOf(s); }
    function myTurn() { return !!state && state.phase === "battle" && state.turn === mySide(); }
    function faceOf(side) { return side === 0 ? 1 : -1; }
    function moveZone(side) {
        if (!online) {
            if (side === 0) {
                let hi = ZONE[0][1];
                for (const e of state.enemies) if (e.hp > 0) hi = Math.min(hi, e.x - 150);
                return [ZONE[0][0], Math.max(ZONE[0][0] + 40, hi)];
            }
            return [Math.max(200, (tankOf(0) ? tankOf(0).x : 200) + 150), ZONE[1][1]];
        }
        const o = tankOf(1 - side);
        if (side === 0) return [ZONE[0][0], Math.max(ZONE[0][0] + 40, Math.min(ZONE[0][1], (o ? o.x : 1200) - 150))];
        return [Math.min(ZONE[1][1] - 40, Math.max(ZONE[1][0], (o ? o.x : 200) + 150)), ZONE[1][1]];
    }
    function setMsg(text, tone) {
        state.msgSeq = (state.msgSeq || 0) + 1;
        state.msg = { id: state.msgSeq, text, tone: tone || "info" };
    }
    function setStatus(text, color) { statusEl.textContent = text; dotEl.style.background = color; }
    function toast(text, tone) {
        toastEl.textContent = text; toastEl.className = "tcx-toast " + (tone || "");
        toastEl.hidden = false;
        clearEntry(toastTimer);
        toastTimer = afterRaw(3000, () => { toastEl.hidden = true; });
    }
    function saveBest() {
        if (!online && state && !state.cheatsUsed && state.score > best) {
            best = state.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }

    /* ---------- overlay toggles ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function toggleCheats(on) {
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
    }
    function togglePause(on) {
        if (online && !isHost) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        if (next) { helpOpen = false; cheatOpen = false; pauseTimers(); paused = true; }
        else resumeTimers();
        render();
    }
    function restartGame() {
        if (online) { if (state && state.phase === "over") submitAction({ t: "rematch" }); return; }
        resetRun();
    }

    /* ---------- state & networking (template) ---------- */
    function initialState() {
        return {
            v: 1, phase: "pick", wave: 1, score: 0, waveStartScore: 0, cheatsUsed: false,
            picks: [null, null], sides: online ? null : { host: 0, guest: 1 },
            tanks: [null, null], enemies: [], activeEnemy: 0,
            turn: 0, firstSide: 0, turnStartX: 0, turnEndsAt: 0, turnNo: 0,
            shot: null, shotSeq: 0, fx: null, fxSeq: 0, msg: null, msgSeq: 0,
            wins: [0, 0], winner: null, scenery: 1, waveInfo: null,
        };
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, myActor);
    }
    function applyAction(a, actor) {
        if (!state || !a) return;
        const side = online
            ? (state.sides ? state.sides[actor === 0 ? "host" : "guest"] : (actor === 0 ? 0 : 1))
            : 0;
        switch (a.t) {
            case "pick": {
                if (state.phase !== "pick") return;
                const v = TANKS[a.veh] && a.veh !== "bunker" ? a.veh : null;
                if (!v) return;
                state.picks[actor] = v;
                if (online && state.picks[0] && state.picks[1]) beginMatch();
                publish(); break;
            }
            case "begin":
                if (!online && actor === 0 && state.phase === "pick" && state.picks[0]) startRun();
                break;
            case "pose":
                if (state.phase !== "battle" || side !== state.turn) return;
                applyPose(side, a); publish(); break;
            case "fire":
                if (state.phase !== "battle" || side !== state.turn) return;
                applyPose(side, a); doFire(side); break;
            case "end":
                if (state.phase !== "battle" || side !== state.turn) return;
                applyPose(side, a); advanceTurn(); publish(); break;
            case "next":
                if (!online && state.phase === "clear") startWave(state.wave + 1);
                break;
            case "retry":
                if (!online && state.phase === "over") { state.score = state.waveStartScore; startWave(state.wave); }
                break;
            case "newrun":
                if (!online && state.phase === "over") resetRun();
                break;
            case "rematch":
                if (online && state.phase === "over") {
                    state.picks = [null, null]; state.winner = null; state.phase = "pick";
                    setMsg("Tanding ulang! Pilih tank lagi — posisi & giliran pertama diacak ulang.", "info");
                    publish();
                }
                break;
        }
    }
    function applyPose(side, a) {
        const t = tankOf(side);
        if (!t) return;
        const spec = TANKS[t.veh], z = moveZone(side);
        const lo = Math.max(z[0], state.turnStartX - spec.fuel);
        const hi = Math.min(z[1], state.turnStartX + spec.fuel);
        t.x = clamp(num(a.x, t.x), lo, hi);
        t.aim = aimClamp(num(a.aim, t.aim));
    }

    /* ---------- match flow ---------- */
    function mkTank(veh, side, wave) {
        const s = TANKS[veh];
        const hp = Math.round(s.hp * P_HP * (online ? 1 : Math.min(1.9, 1 + (wave - 1) * 0.05)));
        const dmg = s.dmg * P_DMG * (online ? 1 : Math.min(2.2, 1 + (wave - 1) * 0.06));
        return { veh, x: START_X[side], aim: 0.6, hp, maxHp: hp, dmg };
    }
    function resetRun() {
        epoch++; clearTimers(); paused = false;
        state = initialState();
        cheats.god = cheats.oneHit = cheats.fullAim = cheats.slow = false;
        localPose = null; effects = []; cam = 0;
        dispSides = [START_X[0], START_X[1]]; dispEn = []; dispEnAim = [];
        lastFxId = lastMsgId = lastShotId = 0;
        prevPhase = ""; prevTurnKey = ""; pickSig = ""; staticSeed = -1;
        helpOpen = cheatOpen = false;
        publish();
    }
    function startRun() {
        state.tanks[0] = mkTank(state.picks[0], 0, 1);
        state.score = 0; state.wins = [0, 0];
        startWave(1);
    }
    function startWave(n) {
        epoch++; clearTimers();
        state.wave = n; state.waveStartScore = state.score;
        const t = state.tanks[0], s = TANKS[t.veh];
        t.hp = t.maxHp = Math.round(s.hp * P_HP * Math.min(1.9, 1 + (n - 1) * 0.05));
        t.dmg = s.dmg * P_DMG * Math.min(2.2, 1 + (n - 1) * 0.06);
        t.x = START_X[0]; t.aim = 0.6;
        const seed = (Math.random() * 1e9) | 0;
        const g = genWave(n, t.veh, seed);
        state.enemies = g.enemies; state.waveInfo = g.info; state.scenery = seed;
        state.activeEnemy = 0; state.shot = null; state.fx = null; state.winner = null;
        state.firstSide = Math.random() < 0.5 ? 0 : 1;
        state.turn = state.firstSide; state.turnNo++;
        state.phase = "rollout";
        setMsg("Wave " + n + " — roll out dari pangkalan!", "info");
        publish();
        after(2450, () => {
            if (state.phase !== "rollout") return;
            state.phase = "battle";
            state.turnStartX = state.turn === 0 ? state.tanks[0].x : (state.enemies[0] ? state.enemies[0].x : 1200);
            state.turnEndsAt = 0;
            setMsg(state.firstSide === 0 ? "🪙 Koin dilempar: KAMU jalan duluan!" : "🪙 Koin dilempar: MUSUH jalan duluan!", state.firstSide === 0 ? "good" : "warn");
            publish();
            if (state.turn === 1) scheduleBot();
        });
    }
    function beginMatch() {
        epoch++; clearTimers();
        const hostSide = Math.random() < 0.5 ? 0 : 1;
        state.sides = { host: hostSide, guest: 1 - hostSide };
        state.tanks = [null, null];
        state.tanks[hostSide] = mkTank(state.picks[0], hostSide, 1);
        state.tanks[1 - hostSide] = mkTank(state.picks[1], 1 - hostSide, 1);
        state.firstSide = Math.random() < 0.5 ? 0 : 1;
        state.turn = state.firstSide; state.turnNo++;
        state.phase = "rollout"; state.shot = null; state.fx = null; state.winner = null;
        state.scenery = (Math.random() * 1e9) | 0; state.enemies = [];
        const nm = names();
        setMsg("🎲 Posisi diacak: " + nm[0] + " di " + (hostSide === 0 ? "KIRI" : "KANAN") + ", " + nm[1] + " di " + (hostSide === 0 ? "KANAN" : "KIRI") + ".", "info");
        publish();
        after(2450, () => {
            if (state.phase !== "rollout") return;
            state.phase = "battle";
            state.turnStartX = tankOf(state.turn).x;
            state.turnEndsAt = Date.now() + TURN_MS;
            setMsg("🪙 Giliran pertama: " + nm[state.firstSide === 0 ? 0 : 1] + "!", "info");
            publish();
            scheduleAutoEnd();
        });
    }
    function scheduleAutoEnd() {
        if (!online || !isHost) return;
        const no = state.turnNo;
        after(TURN_MS + 400, () => {
            if (state.phase === "battle" && state.turnNo === no) {
                setMsg("⏱ Waktu habis — giliran dilewati.", "warn");
                advanceTurn(); publish();
            }
        });
    }
    function advanceTurn() {
        state.turn = 1 - state.turn; state.turnNo++;
        state.phase = "battle";
        state.turnEndsAt = online ? Date.now() + TURN_MS : 0;
        if (!online && state.turn === 1) {
            const alive = state.enemies.some((e) => e.hp > 0);
            if (alive) {
                let k = state.activeEnemy;
                do { k = (k + 1) % state.enemies.length; } while (state.enemies[k].hp <= 0);
                state.activeEnemy = k;
            }
            state.turnStartX = state.enemies[state.activeEnemy] ? state.enemies[state.activeEnemy].x : 1200;
            scheduleBot();
        } else {
            const t = tankOf(state.turn);
            state.turnStartX = t ? t.x : 0;
            scheduleAutoEnd();
        }
    }

    /* ---------- bot ---------- */
    function scheduleBot() {
        const no = state.turnNo;
        after(700, () => {
            if (state.phase !== "battle" || state.turn !== 1 || state.turnNo !== no) return;
            botMove(); publish();
        });
        after(1500, () => {
            if (state.phase !== "battle" || state.turn !== 1 || state.turnNo !== no) return;
            botFire();
        });
    }
    function botMove() {
        const e = state.enemies[state.activeEnemy];
        if (!e || e.hp <= 0) return;
        const s = TANKS[e.type];
        if (!s.fuel) return;
        const px = tankOf(0).x;
        const b = bandOf(e.type), dist = Math.abs(e.x - px);
        const zlo = Math.max(200, px + 150), fuel = s.fuel * 1.5;
        if (dist > b[1]) e.x = Math.max(zlo, e.x - Math.min(fuel, dist - b[1] * 0.92));
        else if (dist < b[0]) e.x = Math.min(ZONE[1][1], e.x + Math.min(fuel, b[0] - dist));
        for (const o of state.enemies) {
            if (o !== e && o.hp > 0 && Math.abs(o.x - e.x) < 70) {
                e.x = clamp(o.x > e.x ? o.x - 70 : o.x + 70, zlo, ZONE[1][1]);
            }
        }
    }
    function botFire() {
        const e = state.enemies[state.activeEnemy];
        if (!e || e.hp <= 0) { advanceTurn(); publish(); return; }
        const px = tankOf(0).x, zlo = Math.max(200, px + 150);
        const tryAt = (x) => {
            const r = solveIter(x, -1, e.type, px, GROUND - 24);
            if (!r) return null;
            for (const a of r) {
                if (a < AIM_MIN || a > AIM_MAX) continue;
                for (const da of [0, 0.012, -0.012, 0.025, -0.025]) {
                    const aa = aimClamp(a + da);
                    const pr = makeProjs(x, aa, -1, e.type)[0];
                    if (simulateShot(pr, [{ x: px, y: GROUND - 24, r: 24, idx: 0 }]).kind === "hit") return aa;
                }
            }
            return null;
        };
        let aim = tryAt(e.x);
        if (aim == null) {
            const sol = findSolution(-1, e.type, px, GROUND - 24, 24, [zlo, ZONE[1][1]]);
            if (sol) { e.x = sol.x; aim = tryAt(e.x); }
        }
        if (aim == null) {
            setMsg(TANKS[e.type].label + " musuh maneuver mencari posisi tembak…", "warn");
            advanceTurn(); publish(); return;
        }
        const jm = Math.max(0.014, 0.09 - 0.005 * state.wave);
        e.aim = aimClamp(aim + (Math.random() - 0.5) * 2 * jm);
        doFire(1);
    }

    /* ---------- firing & resolution ---------- */
    function shooterInfo(side) {
        if (!online && side === 1) {
            const e = state.enemies[state.activeEnemy];
            return { x: e.x, aim: e.aim, veh: e.type, dmg: e.dmg, face: -1 };
        }
        const t = tankOf(side);
        return { x: t.x, aim: t.aim, veh: t.veh, dmg: t.dmg, face: faceOf(side) };
    }
    function targetsFor(side) {
        if (!online) {
            if (side === 0) {
                const out = [];
                state.enemies.forEach((e, i) => {
                    if (e.hp > 0) out.push({ x: e.x, y: e.type === "bunker" ? GROUND - 30 : GROUND - 24, r: e.type === "bunker" ? 48 : 24, idx: i });
                });
                return out;
            }
            return [{ x: tankOf(0).x, y: GROUND - 24, r: 24, idx: 0 }];
        }
        const o = tankOf(1 - side);
        return [{ x: o.x, y: GROUND - 24, r: 24, idx: 0 }];
    }
    function doFire(side) {
        const sh = shooterInfo(side);
        const projs = makeProjs(sh.x, sh.aim, sh.face, sh.veh);
        const targets = targetsFor(side);
        const impacts = projs.map((p) => simulateShot(p, targets));
        const dur = Math.max.apply(null, impacts.map((i) => i.dur));
        state.shotSeq++;
        state.shot = {
            id: state.shotSeq, side, dur,
            projs: projs.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, g: p.g })),
            impacts, dmg: sh.dmg,
            oneHit: !online && side === 0 && cheats.oneHit,
            slow: !online && side === 0 && cheats.slow,
        };
        state.phase = "flight";
        publish();
        after(dur * 1000 * (state.shot.slow ? 2.2 : 1) + 150, resolveShot);
    }
    function resolveShot() {
        const sh = state.shot;
        if (!sh || state.phase !== "flight") return;
        const fx = [];
        for (const imp of sh.impacts) {
            if (imp.kind !== "hit") {
                fx.push({ x: imp.x, y: Math.min(imp.y, GROUND - 4), kind: "dirt", col: "#8a9a5b" });
                continue;
            }
            let kill = false, col = "#f97316";
            if (sh.side === 0) {
                if (!online) {
                    const e = state.enemies[imp.idx];
                    if (e && e.hp > 0) {
                        const d = sh.oneHit ? 9999 : effDamage(sh.dmg, TANKS[e.type].armor);
                        e.hp = Math.max(0, e.hp - d); col = TANKS[e.type].col;
                        if (e.hp <= 0) { kill = true; state.score += Math.round(TANKS[e.type].score * (e.elite ? 2 : 1) + state.wave * 10); }
                    }
                } else {
                    const o = tankOf(1);
                    if (o && o.hp > 0) {
                        o.hp = Math.max(0, o.hp - effDamage(sh.dmg, TANKS[o.veh].armor));
                        col = TANKS[o.veh].col; if (o.hp <= 0) kill = true;
                    }
                }
            } else {
                const t = tankOf(0);
                if (t && t.hp > 0) {
                    const d = !online && cheats.god ? 0 : effDamage(sh.dmg, TANKS[t.veh].armor);
                    t.hp = Math.max(0, t.hp - d); col = "#ef4444";
                    if (t.hp <= 0) kill = true;
                }
            }
            fx.push({ x: imp.x, y: imp.y, kind: kill ? "kill" : "boom", col });
        }
        state.fxSeq++;
        state.fx = { id: state.fxSeq, impacts: fx, hitSide: sh.side === 1 ? 0 : (online ? 1 : -1) };
        state.shot = null;
        if (!online) {
            if (tankOf(0).hp <= 0) {
                state.phase = "over"; state.winner = 1; saveBest();
                setMsg("💥 Tankmu hancur!", "bad"); publish(); return;
            }
            if (state.enemies.every((e) => e.hp <= 0)) {
                state.phase = "clear";
                const bonus = 100 + state.wave * 25;
                state.score += bonus; state.waveInfo.bonus = bonus; saveBest();
                setMsg("✦ Wave " + state.wave + " selesai! Bonus " + bonus + ".", "good");
                publish(); return;
            }
        } else {
            for (const s of [0, 1]) {
                const t = tankOf(s);
                if (t && t.hp <= 0) {
                    state.phase = "over"; state.winner = 1 - s; state.wins[1 - s]++;
                    setMsg("🏆 " + names()[sideActor(1 - s)] + " menang!", "good");
                    publish(); return;
                }
            }
        }
        advanceTurn(); publish();
    }

    /* ---------- cheats (khusus vs bot) ---------- */
    function applyCheat(id) {
        if (online || !state) return;
        state.cheatsUsed = true;
        switch (id) {
            case "god": cheats.god = !cheats.god; break;
            case "onehit": cheats.oneHit = !cheats.oneHit; break;
            case "aim": cheats.fullAim = !cheats.fullAim; break;
            case "slow": cheats.slow = !cheats.slow; break;
            case "heal": { const t = myTank(); if (t) t.hp = t.maxHp; break; }
            case "skip":
                if (state.phase === "battle" || state.phase === "clear") { startWave(state.wave + 1); return; }
                break;
            case "score": state.score += 500; break;
        }
        publish();
    }

    /* ---------- rendering: static scenery ---------- */
    function renderStatic() {
        const r = rng((state ? state.scenery : 1) >>> 0);
        let far = "";
        for (let i = 0; i < 26; i++) {
            far += '<circle cx="' + (r() * 950).toFixed(0) + '" cy="' + (10 + r() * 150).toFixed(0) + '" r="' + (0.7 + r() * 1.1).toFixed(1) + '" fill="#223041"/>';
        }
        far += '<circle cx="780" cy="64" r="22" fill="#1a2430" stroke="#223041" stroke-width="2"/>';
        let hp = "M0 310 ";
        for (let x = 0; x <= 960; x += 80) hp += "L" + x + " " + (175 + r() * 70).toFixed(0) + " ";
        hp += 'L960 310 Z"';
        far += '<path d="' + hp + '" fill="#10161f"/>';
        farG.innerHTML = far;
        let mid = "";
        let mp = "M0 320 ";
        for (let x = 0; x <= 1140; x += 90) mp += "L" + x + " " + (252 + r() * 46).toFixed(0) + " ";
        mp += 'L1140 320 Z"';
        mid += '<path d="' + mp + '" fill="#131b26"/>';
        for (let i = 0; i < 14; i++) {
            const x = 30 + r() * 1100, h = 22 + r() * 42;
            if (r() < 0.5) mid += '<rect x="' + x.toFixed(0) + '" y="' + (300 - h).toFixed(0) + '" width="7" height="' + h.toFixed(0) + '" fill="#182230"/>';
            else mid += '<path d="M' + x.toFixed(0) + ' 300 l7 -' + h.toFixed(0) + ' l7 ' + h.toFixed(0) + ' z" fill="#182230"/>';
        }
        midG.innerHTML = mid;
        let s = "";
        s += '<rect x="0" y="' + GROUND + '" width="' + WORLD_W + '" height="' + (VIEW_H - GROUND) + '" fill="#10161d"/>';
        s += '<line x1="0" y1="' + GROUND + '" x2="' + WORLD_W + '" y2="' + GROUND + '" stroke="#2a3648" stroke-width="2"/>';
        for (let x = 100; x < WORLD_W; x += 100) {
            s += '<line x1="' + x + '" y1="' + (GROUND + 2) + '" x2="' + x + '" y2="' + (GROUND + 7) + '" stroke="#223041" stroke-width="1.5"/>';
            s += '<text x="' + x + '" y="' + (GROUND + 18) + '" fill="#334155" font-size="8" text-anchor="middle" opacity=".8">' + x + '</text>';
        }
        for (let i = 0; i < 6; i++) {
            const x = 620 + r() * 190, w = 10 + r() * 12;
            s += '<rect x="' + x.toFixed(0) + '" y="' + (GROUND - w).toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + w.toFixed(0) + '" fill="#151c26" stroke="#223041" stroke-width="1.5"/>';
        }
        const base = (bx, doorX, signX) => {
            let b = "";
            b += '<rect x="' + bx + '" y="' + (GROUND - 70) + '" width="104" height="70" fill="#131b26" stroke="#2a3648" stroke-width="2"/>';
            b += '<path d="M' + (bx - 4) + ' ' + (GROUND - 70) + ' L' + (bx + 52) + ' ' + (GROUND - 88) + ' L' + (bx + 108) + ' ' + (GROUND - 70) + '" fill="none" stroke="#2a3648" stroke-width="2"/>';
            b += '<rect x="' + doorX + '" y="' + (GROUND - 58) + '" width="36" height="58" fill="#0b0f14"/>';
            b += '<text x="' + signX + '" y="' + (GROUND - 74) + '" fill="#3a4a5e" font-size="9" text-anchor="middle" letter-spacing="2">BASE</text>';
            return b;
        };
        s += base(30, 96, 66);
        s += base(1266, 1268, 1334);
        staticG.innerHTML = s;
    }

    /* ---------- rendering: actors ---------- */
    function drawTank(x, aim, face, veh, hpFrac, o) {
        o = o || {};
        const s = TANKS[veh], col = o.flash ? "#ffffff" : s.col;
        const w = veh === "light" ? 46 : veh === "mbt" ? 62 : veh === "mortar" ? 50 : veh === "rocket" ? 56 : 54;
        let g = "<g>";
        g += '<rect x="' + (x - 30) + '" y="' + (GROUND - 12) + '" width="60" height="12" rx="5" fill="#0d1319"/>';
        for (let i = -2; i <= 2; i++) g += '<circle cx="' + (x + i * 11) + '" cy="' + (GROUND - 6) + '" r="4" fill="#1f2a37"/>';
        g += '<line x1="' + (x - 28) + '" y1="' + (GROUND - 11) + '" x2="' + (x + 28) + '" y2="' + (GROUND - 11) + '" stroke="#2a3648" stroke-width="2" stroke-dasharray="4 5" stroke-dashoffset="' + (-x * 0.6).toFixed(1) + '"/>';
        g += '<path d="M' + (x - w / 2) + ' ' + (GROUND - 12) + ' l6 -12 h' + (w - 12) + ' l6 12 z" fill="#151c26" stroke="' + col + '" stroke-width="2"/>';
        const px = x, py = GROUND - 34;
        const dx = face * Math.cos(aim), dy = -Math.sin(aim);
        if (veh === "rocket") {
            g += '<rect x="' + (x - 12) + '" y="' + (GROUND - 44) + '" width="24" height="12" rx="3" fill="#151c26" stroke="' + col + '" stroke-width="2"/>';
            const sx = Math.sin(aim), cx2 = face * Math.cos(aim);
            for (const k of [-4, 0, 4]) {
                const ox = sx * k, oy = cx2 * k;
                g += '<line x1="' + (px + ox - dx * 4).toFixed(1) + '" y1="' + (py + oy - dy * 4).toFixed(1) + '" x2="' + (px + ox + dx * 26).toFixed(1) + '" y2="' + (py + oy + dy * 26).toFixed(1) + '" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/>';
            }
        } else if (veh === "mortar") {
            g += '<rect x="' + (x - 10) + '" y="' + (GROUND - 30) + '" width="20" height="8" rx="2" fill="#151c26" stroke="' + col + '" stroke-width="2"/>';
            g += '<circle cx="' + px + '" cy="' + (GROUND - 30) + '" r="5" fill="#151c26" stroke="' + col + '" stroke-width="2"/>';
            g += '<line x1="' + px + '" y1="' + (GROUND - 30) + '" x2="' + (px + dx * 16).toFixed(1) + '" y2="' + (GROUND - 30 + dy * 16).toFixed(1) + '" stroke="' + col + '" stroke-width="8" stroke-linecap="round"/>';
        } else {
            const tw = veh === "mbt" ? 32 : 26, th = veh === "mbt" ? 16 : 14;
            g += '<rect x="' + (x - tw / 2 + face * 2) + '" y="' + (GROUND - 34 - th + 2) + '" width="' + tw + '" height="' + th + '" rx="3" fill="#151c26" stroke="' + col + '" stroke-width="2"/>';
            const L = barrelLen(veh), bw = veh === "mbt" ? 6 : 5;
            g += '<line x1="' + px + '" y1="' + py + '" x2="' + (px + dx * L).toFixed(1) + '" y2="' + (py + dy * L).toFixed(1) + '" stroke="' + col + '" stroke-width="' + bw + '" stroke-linecap="round"/>';
            if (veh === "artillery") {
                g += '<line x1="' + (px + dx * (L - 5)).toFixed(1) + '" y1="' + (py + dy * (L - 5)).toFixed(1) + '" x2="' + (px + dx * L).toFixed(1) + '" y2="' + (py + dy * L).toFixed(1) + '" stroke="' + col + '" stroke-width="8" stroke-linecap="round"/>';
                g += '<line x1="' + (x - face * 26) + '" y1="' + (GROUND - 12) + '" x2="' + (x - face * 33) + '" y2="' + (GROUND - 2) + '" stroke="' + col + '" stroke-width="3"/>';
            }
        }
        g += "</g>";
        g += '<rect x="' + (x - 26) + '" y="' + (GROUND - 56) + '" width="52" height="4" rx="2" fill="#1f2a37"/>';
        g += '<rect x="' + (x - 26) + '" y="' + (GROUND - 56) + '" width="' + Math.max(0, 52 * hpFrac).toFixed(1) + '" height="4" rx="2" fill="' + (o.mine ? "#4ade80" : col) + '"/>';
        if (o.elite) g += '<text x="' + (x + 30) + '" y="' + (GROUND - 50) + '" fill="#fde047" font-size="11">★</text>';
        if (o.tag) g += '<text x="' + x + '" y="' + (GROUND - 63) + '" fill="#8b98a9" font-size="9" text-anchor="middle" letter-spacing="1">' + o.tag + '</text>';
        if (o.active) {
            const by = GROUND - 78 + Math.sin((o.now || 0) / 220) * 3;
            g += '<path d="M' + (x - 6) + ' ' + by + ' l6 8 l6 -8 z" fill="#f59e0b"/>';
        }
        return g;
    }
    function drawBunker(x, aim, hpFrac, o) {
        o = o || {};
        let g = "<g>";
        g += '<rect x="' + (x - 52) + '" y="' + (GROUND - 58) + '" width="104" height="58" fill="#1a212b" stroke="#3a4656" stroke-width="2.5"/>';
        g += '<rect x="' + (x - 34) + '" y="' + (GROUND - 40) + '" width="68" height="26" fill="#10161d" stroke="#2a3648" stroke-width="2"/>';
        g += '<rect x="' + (x - 10) + '" y="' + (GROUND - 30) + '" width="20" height="16" fill="#0b0f14"/>';
        const dx = -Math.cos(aim), dy = -Math.sin(aim);
        g += '<line x1="' + (x - 40) + '" y1="' + (GROUND - 40) + '" x2="' + (x - 40 + dx * 30).toFixed(1) + '" y2="' + (GROUND - 40 + dy * 30).toFixed(1) + '" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>';
        g += '<line x1="' + x + '" y1="' + (GROUND - 58) + '" x2="' + x + '" y2="' + (GROUND - 78) + '" stroke="#3a4656" stroke-width="2.5"/>';
        g += '<path d="M' + x + ' ' + (GROUND - 78) + ' l22 6 l-22 6 z" fill="#ef4444"/>';
        g += "</g>";
        g += '<rect x="' + (x - 52) + '" y="' + (GROUND - 68) + '" width="104" height="5" rx="2" fill="#1f2a37"/>';
        g += '<rect x="' + (x - 52) + '" y="' + (GROUND - 68) + '" width="' + Math.max(0, 104 * hpFrac).toFixed(1) + '" height="5" rx="2" fill="#94a3b8"/>';
        g += '<text x="' + x + '" y="' + (GROUND - 74) + '" fill="#8b98a9" font-size="9" text-anchor="middle" letter-spacing="2">BOS</text>';
        if (o.active) {
            const by = GROUND - 92 + Math.sin((o.now || 0) / 220) * 3;
            g += '<path d="M' + (x - 6) + ' ' + by + ' l6 8 l6 -8 z" fill="#f59e0b"/>';
        }
        return g;
    }
    function spawnFx(x, y, kind, col) { effects.push({ x, y, t: 0, kind, col }); }
    function shotPos(p, t) {
        return { x: p.x + p.vx * t, y: p.y + p.vy * t + 0.5 * GRAV * p.g * t * (t + 1 / 120) };
    }
    function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

    /* ---------- rendering: dynamic frame ---------- */
    function drawDyn(now) {
        const st = state;
        let s = "";
        const prog = st && st.phase === "rollout" ? clamp((now - rolloutT0) / 2200, 0, 1) : 1;
        const lift = easeOut(clamp(prog * 2, 0, 1));
        for (const gx of [98, 1270]) {
            s += '<rect x="' + gx + '" y="' + (GROUND - 58 - lift * 56).toFixed(1) + '" width="32" height="56" fill="#1a2430" stroke="#2a3648" stroke-width="1.5" opacity="' + (1 - lift).toFixed(2) + '"/>';
        }
        if (st && myTurn() && localPose && myTank() && !helpOpen && !cheatOpen) {
            const face = faceOf(mySide());
            const p = makeProjs(localPose.x, localPose.aim, face, myTank().veh)[0];
            const targets = targetsFor(mySide());
            const full = cheats.fullAim && !online;
            const dt = 1 / 60, gE = GRAV * p.g;
            let x = p.x, y = p.y, vy = p.vy, hit = null;
            const maxSteps = full ? 300 : 34;
            for (let i = 0; i < maxSteps; i++) {
                x += p.vx * dt; vy += gE * dt; y += vy * dt;
                if (i % 2 === 0) s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.4" fill="#fde047" opacity="' + (full ? 0.5 : 0.35) + '"/>';
                if (y > GROUND - 2) { hit = { x, y: GROUND - 4 }; break; }
                if (full) {
                    let done = false;
                    for (const tg of targets) {
                        const ddx = x - tg.x, ddy = y - tg.y, rr = tg.r + 4;
                        if (ddx * ddx + ddy * ddy < rr * rr) { hit = { x, y }; done = true; break; }
                    }
                    if (done) break;
                }
                if (x < -40 || x > WORLD_W + 40) break;
            }
            if (full && hit) {
                s += '<path d="M' + (hit.x - 5).toFixed(1) + ' ' + (hit.y - 5).toFixed(1) + ' l10 10 M' + (hit.x + 5).toFixed(1) + ' ' + (hit.y - 5).toFixed(1) + ' l-10 10" stroke="#fde047" stroke-width="2" opacity=".8"/>';
            }
        }
        if (st) {
            const botActive = !online && st.turn === 1 && (st.phase === "battle" || st.phase === "flight");
            st.enemies.forEach((e, i) => {
                if (e.hp <= 0) return;
                const ex = dispEn[i] != null ? dispEn[i] : e.x;
                const ea = dispEnAim[i] != null ? dispEnAim[i] : e.aim;
                const act = botActive && i === st.activeEnemy;
                if (e.type === "bunker") s += drawBunker(ex, ea, e.hp / e.maxHp, { active: act, now });
                else s += drawTank(ex, ea, -1, e.type, e.hp / e.maxHp, { elite: e.elite, active: act, now, tag: e.elite ? "ELITE" : "" });
            });
            const nm = online ? names() : null;
            for (const side of [0, 1]) {
                const t = tankOf(side);
                if (!t) continue;
                const mine = side === mySide();
                const tag = online ? (nm[sideActor(side)] || (side === 0 ? "P1" : "P2")).slice(0, 12) : (mine ? "KAMU" : "");
                s += drawTank(dispSides[side], dispAim[side], faceOf(side), t.veh, t.hp / t.maxHp, {
                    mine, tag, now,
                    active: st.phase === "battle" && st.turn === side,
                    flash: mine && flashT > 0.2,
                });
                if (mine && myTurn()) {
                    s += '<text x="' + dispSides[side] + '" y="' + (GROUND - 90) + '" fill="#4ade80" font-size="9" text-anchor="middle" letter-spacing="2">GILIRANMU</text>';
                }
            }
            if (st.phase === "flight" && st.shot) {
                const sh = st.shot;
                const el = (now - flightT0) / 1000 / (sh.slow ? 2.2 : 1);
                const t = Math.min(el, sh.dur);
                if (el <= sh.dur + 0.05) {
                    for (const p of sh.projs) {
                        const pos = shotPos(p, t), prev = shotPos(p, Math.max(0, t - 0.05));
                        const col = sh.side === mySide() || (!online && sh.side === 0) ? "#fde047" : "#fb923c";
                        s += '<line x1="' + prev.x.toFixed(1) + '" y1="' + prev.y.toFixed(1) + '" x2="' + pos.x.toFixed(1) + '" y2="' + pos.y.toFixed(1) + '" stroke="' + col + '" stroke-width="2" opacity=".4"/>';
                        s += '<circle cx="' + pos.x.toFixed(1) + '" cy="' + pos.y.toFixed(1) + '" r="' + (p.g < 0.5 ? 4.5 : 3.5) + '" fill="' + col + '"/>';
                    }
                }
            }
        }
        for (const f of effects) {
            const life = f.kind === "kill" ? 0.8 : 0.5;
            const p = f.t / life;
            const r = f.kind === "muzzle" ? 3 + 7 * p : f.kind === "dirt" ? 5 + 10 * p : f.kind === "kill" ? 10 + 40 * p : f.kind === "dust" ? 2 + 5 * p : 8 + 26 * p;
            s += '<circle cx="' + f.x.toFixed(1) + '" cy="' + f.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + f.col + '" stroke-width="' + (f.kind === "boom" || f.kind === "kill" ? 3 : 2) + '" opacity="' + Math.max(0, 1 - p).toFixed(2) + '"/>';
            if (f.kind === "kill") s += '<circle cx="' + f.x.toFixed(1) + '" cy="' + f.y.toFixed(1) + '" r="' + (r * 0.55).toFixed(1) + '" fill="none" stroke="#fde047" stroke-width="2" opacity="' + Math.max(0, 1 - p).toFixed(2) + '"/>';
        }
        dynG.innerHTML = s;
        let u = "";
        if (st && st.phase === "rollout") {
            const op = Math.sin(prog * Math.PI);
            u += '<text x="320" y="150" fill="#e5e7eb" font-size="34" font-weight="800" text-anchor="middle" letter-spacing="6" opacity="' + op.toFixed(2) + '">' + (online ? "DUEL" : "WAVE " + st.wave) + '</text>';
            u += '<text x="320" y="176" fill="#8b98a9" font-size="11" text-anchor="middle" letter-spacing="3" opacity="' + op.toFixed(2) + '">ROLL OUT…</text>';
        }
        if (flashT > 0) {
            u += '<rect x="3" y="3" width="634" height="394" fill="none" stroke="#ef4444" stroke-width="6" opacity="' + Math.max(0, flashT / 0.35).toFixed(2) + '"/>';
        }
        uiG.innerHTML = u;
        farG.setAttribute("transform", "translate(" + (-cam * 0.35).toFixed(1) + ",0)");
        midG.setAttribute("transform", "translate(" + (-cam * 0.65).toFixed(1) + ",0)");
        worldG.setAttribute("transform", "translate(" + (-cam).toFixed(1) + ",0)");
    }

    /* ---------- rendering: DOM / HUD / overlays ---------- */
    function render() {
        if (!state) {
            setStatus("Menunggu host…", "#94a3b8");
            ovPick.hidden = ovHelp.hidden = ovCheat.hidden = ovClear.hidden = ovOver.hidden = ovPause.hidden = true;
            return;
        }
        if (state.scenery !== staticSeed) { staticSeed = state.scenery; renderStatic(); }
        if (state.msg && state.msg.id !== lastMsgId) { lastMsgId = state.msg.id; toast(state.msg.text, state.msg.tone); }
        if (state.fx && state.fx.id !== lastFxId) {
            lastFxId = state.fx.id;
            for (const im of state.fx.impacts) spawnFx(im.x, im.y, im.kind, im.col);
            if (state.fx.hitSide === mySide() || (!online && state.fx.hitSide === 0)) flashT = 0.35;
        }
        if (state.shot && state.shot.id !== lastShotId) {
            lastShotId = state.shot.id; flightT0 = performance.now();
            const p0 = state.shot.projs[0];
            spawnFx(p0.x, p0.y, "muzzle", state.shot.side === mySide() || (!online && state.shot.side === 0) ? "#fde047" : "#fb923c");
        }
        if (state.phase === "rollout" && prevPhase !== "rollout") {
            rolloutT0 = performance.now(); cam = 0;
            dispSides = [82, 1318];
            dispEn = state.enemies.map(() => 1318);
            dispEnAim = state.enemies.map((e) => e.aim);
            effects = [];
        }
        prevPhase = state.phase;
        const tk = state.phase + ":" + state.turnNo;
        if (tk !== prevTurnKey) {
            prevTurnKey = tk;
            if (myTurn() && myTank()) { localPose = { x: myTank().x, aim: myTank().aim }; poseAnchor = state.turnStartX; }
            else localPose = null;
        }
        if (state.phase === "clear" || state.phase === "over") {
            helpOpen = false; cheatOpen = false;
            if (paused) resumeTimers();
        }
        if (dispEn.length !== state.enemies.length) {
            dispEn = state.enemies.map((e, i) => (dispEn[i] != null ? dispEn[i] : e.x));
            dispEnAim = state.enemies.map((e, i) => (dispEnAim[i] != null ? dispEnAim[i] : e.aim));
        }
        const mt = myTank();
        hud.wlabel.textContent = online ? "Menang" : "Wave";
        hud.wave.textContent = online ? state.wins[mySide() == null ? 0 : mySide()] + "–" + state.wins[mySide() === 0 ? 1 : 0] : state.wave;
        hud.score.textContent = state.score;
        hud.best.textContent = best;
        bestChip.hidden = online;
        hud.veh.textContent = mt ? TANKS[mt.veh].label : "—";
        const hpf = mt ? mt.hp / mt.maxHp : 1;
        hpBar.style.width = (Math.max(0, hpf) * 100).toFixed(0) + "%";
        hpBar.style.background = hpf > 0.5 ? "#4ade80" : hpf > 0.25 ? "#f59e0b" : "#f87171";
        let fuelF = 1;
        if (mt && myTurn() && localPose) fuelF = 1 - Math.abs(localPose.x - poseAnchor) / TANKS[mt.veh].fuel;
        fuelBar.style.width = (clamp(fuelF, 0, 1) * 100).toFixed(0) + "%";
        hud.cheatflag.hidden = online || !state.cheatsUsed;
        cheatBtn.hidden = online;
        if (state.phase === "pick") setStatus(online ? "Pilih tank (menunggu kedua pemain)" : "Pilih tankmu", "#94a3b8");
        else if (state.phase === "rollout") setStatus("Roll out dari pangkalan…", "#f59e0b");
        else if (state.phase === "flight") setStatus("Peluru melayang…", "#94a3b8");
        else if (state.phase === "battle") {
            if (myTurn()) setStatus("Giliranmu — bidik & tembak!", "#4ade80");
            else setStatus(online ? "Giliran lawan…" : "Bot membidik…", "#f59e0b");
        } else if (state.phase === "clear") setStatus("Wave selesai!", "#4ade80");
        else setStatus(online ? "Partai selesai" : "Tankmu hancur", online ? "#4ade80" : "#f87171");
        ovPick.hidden = state.phase !== "pick" || helpOpen || cheatOpen || paused;
        ovClear.hidden = state.phase !== "clear" || helpOpen || cheatOpen || paused;
        ovOver.hidden = state.phase !== "over" || helpOpen || cheatOpen || paused;
        ovHelp.hidden = !helpOpen;
        ovCheat.hidden = !cheatOpen || online;
        ovPause.hidden = !paused || helpOpen || cheatOpen;
        controlsEl.classList.toggle("off", !myTurn() || helpOpen || cheatOpen || paused);
        const cheatLabel = cheatBtn.querySelector(".tcx-btn-label");
        const cheatCount = Object.keys(cheats).filter((k) => cheats[k]).length;
        cheatBtn.classList.toggle("on", cheatCount > 0);
        if (cheatLabel) cheatLabel.textContent = cheatCount ? "Cheats " + cheatCount : "Cheats";
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".tcx-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
            const ip = pauseBtn.querySelector('[data-ico="pause"]'), ip2 = pauseBtn.querySelector('[data-ico="play"]');
            if (ip) ip.hidden = paused;
            if (ip2) ip2.hidden = !paused;
            pauseBtn.disabled = online && !isHost;
        }
        if (skipBtn) skipBtn.disabled = !myTurn() || helpOpen || cheatOpen || paused || state.phase !== "battle";
        if (restartBtn) restartBtn.disabled = online && !(isHost && state.phase === "over");
        if (state.phase === "pick") {
            const sig = state.picks.join("|") + ":" + myActor;
            if (sig !== pickSig) {
                pickSig = sig;
                let g = "";
                for (const k of PICKABLE) {
                    const s = TANKS[k];
                    const on = state.picks[myActor] === k;
                    g += '<button type="button" class="tcx-tank' + (on ? " on" : "") + '" data-veh="' + k + '">'
                        + '<span class="nm"><i style="background:' + s.col + '"></i>' + s.label + '</span>'
                        + '<span class="tr">' + s.trait + '</span>'
                        + '<span class="st"><span>HP <b>' + Math.round(s.hp * P_HP) + '</b></span><span>DMG <b>' + Math.round(s.dmg * P_DMG) + (s.salvo > 1 ? "×2" : "") + '</b></span>'
                        + '<span>Armor <b>' + s.armor + '</b></span><span>BB <b>' + s.fuel + '</b></span>'
                        + '<span style="grid-column:1/3">Jarak <b>' + Math.round(minRange(k)) + '–' + s.rng + '</b></span></span></button>';
                }
                pickGrid.innerHTML = g;
            }
            beginBtn.hidden = online;
            beginBtn.disabled = !state.picks[myActor];
            pickWait.textContent = online
                ? ("Kamu " + (state.picks[myActor] ? "✓" : "…") + " · Lawan " + (state.picks[1 - myActor] ? "✓" : "…") + " — mulai otomatis saat keduanya siap")
                : "";
        }
        if (cheatOpen && !online) {
            const rows = [
                ["god", "Mode Dewa", "HP tidak berkurang saat terkena tembakan", cheats.god],
                ["onehit", "Satu Tembakan Mati", "Semua tembakanmu menghancurkan target", cheats.oneHit],
                ["aim", "Garis Bidik Penuh", "Pratinjau lintasan lengkap + titik jatuh", cheats.fullAim],
                ["slow", "Peluru Lambat", "Animasi peluru 2× lebih lambat (mudah dibaca)", cheats.slow],
            ];
            let h = "";
            for (const [id, nm, ds, on] of rows) {
                h += '<div class="tcx-cheatrow"><span>' + nm + '<small>' + ds + '</small></span>'
                    + '<button type="button" class="tcx-pill' + (on ? " on" : "") + '" data-cheat="' + id + '">' + (on ? "ON" : "OFF") + '</button></div>';
            }
            h += '<div class="tcx-cheatrow"><span>Isi Darah Penuh<small>Perbaiki tankmu sekarang</small></span><button type="button" class="tcx-pill" data-cheat="heal">PAKAI</button></div>';
            h += '<div class="tcx-cheatrow"><span>Lewati Wave<small>Lanjut ke wave berikutnya</small></span><button type="button" class="tcx-pill" data-cheat="skip">PAKAI</button></div>';
            h += '<div class="tcx-cheatrow"><span>+500 Skor<small>Tambah skor instan</small></span><button type="button" class="tcx-pill" data-cheat="score">PAKAI</button></div>';
            cheatRows.innerHTML = h;
        }
        if (state.phase === "clear") {
            const inf = state.waveInfo || {};
            $('[data-clearmsg]').textContent = "Bonus +" + (inf.bonus || 0) + ". Tank diperbaiki penuh. Estimasi tembakan yang dibutuhkan tadi: " + (inf.need || "?") + " (margin aman ×" + (inf.margin || "?") + "). Wave berikutnya: komposisi musuh baru yang lebih keras.";
        }
        if (state.phase === "over") {
            const title = $("[data-overtitle]"), msg = $("[data-overmsg]"), btns = $("[data-overbtns]");
            if (online) {
                const w = state.winner, nm = names()[sideActor(w)];
                title.textContent = "🏆 " + nm + " menang!";
                title.style.color = w === mySide() ? "#4ade80" : "#f87171";
                msg.textContent = "Skor partai " + state.wins[0] + "–" + state.wins[1] + ". Tanding ulang akan mengacak posisi kiri/kanan dan giliran pertama lagi.";
                btns.innerHTML = '<span class="tcx-spacer"></span><button class="tcx-btn acc" type="button" data-act="rematch">Tanding ulang ↺</button>';
            } else {
                title.textContent = "💥 Tankmu hancur";
                title.style.color = "#f87171";
                msg.textContent = "Wave " + state.wave + " · Skor " + state.score + " · Rekor " + best + (state.cheatsUsed ? " (cheat aktif — skor tidak masuk rekor)" : "") + ". Coba lagi, atau mulai run baru dari wave 1.";
                btns.innerHTML = '<button class="tcx-btn" type="button" data-act="newrun">Run baru</button><span class="tcx-spacer"></span><button class="tcx-btn acc" type="button" data-act="retry">Ulangi wave ↺</button>';
            }
        }
    }

    /* ---------- frame loop ---------- */
    function step(dt, now) {
        if (paused) return;
        const st = state;
        if (st && myTurn() && localPose && myTank() && !helpOpen && !cheatOpen) {
            const spec = TANKS[myTank().veh];
            const mv = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
            const z = moveZone(mySide());
            const lo = Math.max(z[0], poseAnchor - spec.fuel), hi = Math.min(z[1], poseAnchor + spec.fuel);
            if (mv !== 0) {
                localPose.x = clamp(localPose.x + mv * spec.fuel * 1.35 * dt, lo, hi);
                dustAcc += dt;
                if (dustAcc > 0.09) { dustAcc = 0; spawnFx(localPose.x - mv * 26, GROUND - 4, "dust", "#3a4656"); }
            }
            if (keys.u) localPose.aim = aimClamp(localPose.aim + 1.25 * dt);
            if (keys.d) localPose.aim = aimClamp(localPose.aim - 1.25 * dt);
            if ((mv !== 0 || keys.u || keys.d) && now - lastPoseSent > 150) {
                lastPoseSent = now;
                submitAction({ t: "pose", x: localPose.x, aim: localPose.aim });
            }
        }
        let target = cam;
        if (st) {
            if (st.phase === "rollout") {
                const prog = clamp((now - rolloutT0) / 2200, 0, 1);
                const t0 = tankOf(0), t1 = tankOf(1);
                if (t0) dispSides[0] = 82 + (t0.x - 82) * easeOut(clamp(prog / 0.85, 0, 1));
                if (t1) dispSides[1] = 1318 + (t1.x - 1318) * easeOut(clamp((prog - 0.1) / 0.85, 0, 1));
                st.enemies.forEach((e, i) => {
                    const pi = easeOut(clamp((prog - 0.15 - i * 0.12) / 0.7, 0, 1));
                    dispEn[i] = 1318 + (e.x - 1318) * pi;
                });
                if (prog < 0.9) {
                    dustAcc += dt;
                    if (dustAcc > 0.07) { dustAcc = 0; spawnFx(dispSides[0] - 28, GROUND - 4, "dust", "#3a4656"); }
                }
                target = dispSides[mySide() == null ? 0 : mySide()] - 240;
            } else {
                for (const side of [0, 1]) {
                    const t = tankOf(side);
                    if (!t) continue;
                    const mine = side === mySide();
                    if (mine && myTurn() && localPose) { dispSides[side] = localPose.x; dispAim[side] = localPose.aim; }
                    else {
                        const k = 1 - Math.exp(-dt * 7);
                        dispSides[side] += (t.x - dispSides[side]) * k;
                        dispAim[side] += (t.aim - dispAim[side]) * (1 - Math.exp(-dt * 8));
                    }
                }
                st.enemies.forEach((e, i) => {
                    if (dispEn[i] == null) { dispEn[i] = e.x; dispEnAim[i] = e.aim; }
                    const k = 1 - Math.exp(-dt * 6);
                    dispEn[i] += (e.x - dispEn[i]) * k;
                    dispEnAim[i] += (e.aim - dispEnAim[i]) * k;
                });
                if (st.phase === "flight" && st.shot) {
                    const sh = st.shot;
                    const el = (now - flightT0) / 1000 / (sh.slow ? 2.2 : 1);
                    target = shotPos(sh.projs[0], Math.min(el, sh.dur)).x - 320;
                } else if (st.phase === "battle") {
                    if (myTurn() && localPose) target = localPose.x - 260;
                    else if (!online && st.turn === 1) target = (st.enemies[st.activeEnemy] ? st.enemies[st.activeEnemy].x : 1200) - 380;
                    else target = (tankOf(st.turn) ? tankOf(st.turn).x : 1200) - 380;
                }
            }
        }
        cam += (clamp(target, 0, WORLD_W - VIEW_W) - cam) * (1 - Math.exp(-dt * 3.2));
        for (const f of effects) f.t += dt;
        effects = effects.filter((f) => f.t < (f.kind === "kill" ? 0.8 : 0.5));
        flashT = Math.max(0, flashT - dt);
        if (st && online && st.phase === "battle" && st.turnEndsAt) {
            hud.time.textContent = Math.max(0, Math.ceil((st.turnEndsAt - Date.now()) / 1000)) + "s";
        } else hud.time.textContent = "∞";
    }
    function frame(t) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
        lastT = t;
        if (!mounted || paused) return;
        step(dt, t);
        drawDyn(t);
    }

    /* ---------- input ---------- */
    function toWorld(e) {
        const r = svgEl.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (VIEW_W / r.width) + cam, y: (e.clientY - r.top) * (VIEW_H / r.height) };
    }
    function schedulePose() {
        const now = performance.now();
        if (localPose && now - lastPoseSent > 150) {
            lastPoseSent = now;
            submitAction({ t: "pose", x: localPose.x, aim: localPose.aim });
        }
    }
    function aimFromPointer(e) {
        if (paused || !myTurn() || !localPose || !myTank() || helpOpen || cheatOpen) return;
        const p = toWorld(e), face = faceOf(mySide());
        const a = Math.atan2(GROUND - 34 - p.y, (p.x - localPose.x) * face);
        if (a > 0.03) { localPose.aim = aimClamp(a); schedulePose(); }
    }
    function tryFire() { if (!paused && myTurn() && localPose && !helpOpen && !cheatOpen) submitAction({ t: "fire", x: localPose.x, aim: localPose.aim }); }
    function tryEnd() { if (!paused && myTurn() && localPose && !helpOpen && !cheatOpen) submitAction({ t: "end", x: localPose.x, aim: localPose.aim }); }
    function handleClick(e) {
        if (!e.target || !e.target.closest) return;
        if (e.target.closest("[data-help]")) { toggleHelp(); return; }
        if (e.target.closest("[data-cheats]")) { if (!online) toggleCheats(); return; }
        if (e.target.closest("[data-pause]")) { togglePause(); return; }
        if (e.target.closest("[data-restart]")) { restartGame(); return; }
        if (e.target.closest("[data-skip]")) { tryEnd(); return; }
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const pv = e.target.closest("[data-veh]");
        if (pv && state && state.phase === "pick") { submitAction({ t: "pick", veh: pv.dataset.veh }); return; }
        const ch = e.target.closest("[data-cheat]");
        if (ch) { applyCheat(ch.dataset.cheat); return; }
        const b = e.target.closest("[data-act]");
        if (!b) return;
        switch (b.dataset.act) {
            case "closehelp": toggleHelp(false); break;
            case "closecheat": toggleCheats(false); break;
            case "resume": togglePause(false); break;
            case "restart": restartGame(); break;
            case "begin": submitAction({ t: "begin" }); break;
            case "pickrand": submitAction({ t: "pick", veh: PICKABLE[(Math.random() * PICKABLE.length) | 0] }); break;
            case "fire": tryFire(); break;
            case "end": tryEnd(); break;
            case "next": submitAction({ t: "next" }); break;
            case "retry": submitAction({ t: "retry" }); break;
            case "newrun": submitAction({ t: "newrun" }); break;
            case "rematch": submitAction({ t: "rematch" }); break;
        }
    }
    on(root, "click", handleClick);
    on(root, "pointerdown", (e) => {
        const b = e.target.closest("[data-hold]");
        if (!b) return;
        e.preventDefault();
        if (!myTurn() || paused) return;
        keys[b.dataset.hold] = 1;
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
    });
    const clearHolds = () => { keys.l = keys.r = keys.u = keys.d = 0; };
    on(root, "pointerup", clearHolds);
    on(root, "pointercancel", clearHolds);
    on(root, "pointerleave", () => { clearHolds(); dragging = false; });
    on(svgEl, "pointermove", (e) => { if (e.pointerType === "mouse" || dragging) aimFromPointer(e); });
    on(svgEl, "pointerdown", (e) => {
        if (!myTurn() || paused) return;
        e.preventDefault();
        if (e.pointerType === "mouse") { aimFromPointer(e); tryFire(); }
        else { dragging = true; aimFromPointer(e); }
    });
    on(window, "pointerup", () => { dragging = false; });
    on(document, "keydown", (e) => {
        if (!mounted) return;
        const k = e.code;
        if (k === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (k === "KeyC") { if (!online && !helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (k === "KeyP" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault();
            return;
        }
        if (k === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (paused || helpOpen || cheatOpen || !myTurn()) return;
        if (k === "ArrowLeft" || k === "KeyA") { keys.l = 1; e.preventDefault(); }
        if (k === "ArrowRight" || k === "KeyD") { keys.r = 1; e.preventDefault(); }
        if (k === "ArrowUp" || k === "KeyW") { keys.u = 1; e.preventDefault(); }
        if (k === "ArrowDown" || k === "KeyS") { keys.d = 1; e.preventDefault(); }
        if (k === "Space") { if (!e.repeat) tryFire(); e.preventDefault(); }
        if (k === "KeyE") { tryEnd(); e.preventDefault(); }
    });
    on(document, "keyup", (e) => {
        const k = e.code;
        if (k === "ArrowLeft" || k === "KeyA") keys.l = 0;
        if (k === "ArrowRight" || k === "KeyD") keys.r = 0;
        if (k === "ArrowUp" || k === "KeyW") keys.u = 0;
        if (k === "ArrowDown" || k === "KeyS") keys.d = 0;
    });

    /* ---------- boot (template) ---------- */
    renderStatic();
    render();
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = initialState();
            publish();
            unsubs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            unsubs.push(room.onState((nextState) => { if (nextState) { state = nextState; render(); } }));
        }
    } else {
        state = initialState();
        render();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            mounted = false; epoch++;
            clearTimers();
            if (raf) cancelAnimationFrame(raf);
            for (const [t, ev, fn, opt] of listeners) t.removeEventListener(ev, fn, opt);
            for (const u of unsubs) if (typeof u === "function") { try { u(); } catch (e) { } }
            root.innerHTML = "";
        },
    };
}