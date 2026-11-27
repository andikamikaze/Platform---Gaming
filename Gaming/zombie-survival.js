/* ================================================================ */
/* games/zombie-survival.js — Zombie Survival (roguelite, template v2) */
/*                                                                    */
/* - META + mount(root, context) sesuai template baru.                */
/* - Level generator acak per wave, dijamin terhubung (BFS + koridor).*/
/* - Draft skill roguelite: semua skill bisa di-stack tanpa batas.    */
/* - Drop senjata & item, boss zombie dengan serangan telegraph.      */
/* - Zombie punya animasi wind-up -> strike (bukan damage instan),    */
/*   plus knockback saat terpukul bat/senjata.                        */
/* - Coin toss acak "siapa jalan dulu" (player vs horde bot), dan     */
/*   posisi/slot pemain diacak saat multiplayer.                      */
/* - Cheat overlay, virtual controls (mobile), mouse aim (desktop).   */
/*                                                                    */
/* Setelah menyalin file ini: node tools/build-games-manifest.mjs     */
/* ================================================================ */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "zombie-survival", // harus sama dengan nama file (tanpa .js)
    name: "Zombie Survival",
    category: "action",
    catLabel: "Action",
    desc: "Roguelite arena: dodge telegraphed attacks, draft endless skill combos, grab weapon drops and survive 5 waves.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="16" r="9"/><path d="M24 25v11"/><path d="M14 30l10-4 10 4"/><path d="M17 12l-3-3M31 12l3-3"/><path d="M20 15h.01M28 15h.01"/><path d="M20 19h8"/></svg>',
    bg: ["#d9f99d", "#a3e635"],
    bestKey: "zombieSurvivalBest",
};

/* ---------------- pure helpers (diexport lewat _test) ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* satu langkah chase lurus (dipakai saat line-of-sight bersih) */
function chaseStep(zx, zy, px, py, spd, dt) {
    const dx = px - zx, dy = py - zy;
    const d = hyp(dx, dy);
    if (d < 0.0001) return { x: zx, y: zy };
    return { x: zx + (dx / d) * spd * dt, y: zy + (dy / d) * spd * dt };
}

/* apakah (tx,ty) di dalam busur ayunan menghadap f? */
function inSwingArc(px, py, f, tx, ty, radius, halfDeg) {
    const dx = tx - px, dy = ty - py;
    if (dx * dx + dy * dy > radius * radius) return false;
    let a = Math.atan2(dy, dx) - f;
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return Math.abs(a) <= (halfDeg * Math.PI) / 180;
}

/* ---------------- arena & level generator ---------------- */
const W = 600, H = 480, CELL = 40, COLS = W / CELL, ROWS = H / CELL;
const PADS = [[1, 1], [COLS - 2, 1], [1, ROWS - 2], [COLS - 2, ROWS - 2]];
const PAD_NAMES = ["NW", "NE", "SW", "SE"];

/* Generator level acak yang PASTI bisa diselesaikan:
   - ring pinggir & pad spawn selalu terbuka,
   - flood-fill dari tengah; pad/ring yang terputus disambung koridor L,
   - kantong ruang tertutup ditutup jadi obstacle.
   Hasil: semua sel terbuka saling terhubung => zombie (flow-field BFS)
   selalu bisa mencapai pemain, wave tidak mungkin soft-lock. */
function generateLevel(seed) {
    const rnd = mulberry32(seed);
    const open = new Uint8Array(COLS * ROWS).fill(1);
    const idx = (c, r) => r * COLS + c;
    const cc = COLS >> 1, cr = ROWS >> 1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const border = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
        const nearCenter = Math.abs(c - cc) <= 1 && Math.abs(r - cr) <= 1;
        const pad = PADS.some(([pc, pr]) => pc === c && pr === r);
        if (!border && !nearCenter && !pad && rnd() < 0.17) open[idx(c, r)] = 0;
    }
    const bfs = () => {
        const d = new Int16Array(COLS * ROWS).fill(-1);
        const q = [idx(cc, cr)]; d[q[0]] = 0;
        for (let h = 0; h < q.length; h++) {
            const i = q[h], c = i % COLS, r = (i / COLS) | 0;
            const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dc, dr] of nb) {
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
                const ni = idx(nc, nr);
                if (open[ni] && d[ni] < 0) { d[ni] = d[i] + 1; q.push(ni); }
            }
        }
        return d;
    };
    const carve = (c, r) => {
        let x = cc, y = cr;
        while (x !== c) { open[idx(x, y)] = 1; x += Math.sign(c - x); }
        while (y !== r) { open[idx(x, y)] = 1; y += Math.sign(r - y); }
        open[idx(c, r)] = 1;
    };
    let d = bfs();
    for (const [pc, pr] of PADS) if (d[idx(pc, pr)] < 0) carve(pc, pr);
    d = bfs();
    for (let c = 0; c < COLS; c++) for (const r of [0, ROWS - 1]) if (open[idx(c, r)] && d[idx(c, r)] < 0) carve(c, r);
    for (let r = 0; r < ROWS; r++) for (const c of [0, COLS - 1]) if (open[idx(c, r)] && d[idx(c, r)] < 0) carve(c, r);
    d = bfs();
    for (let i = 0; i < open.length; i++) if (open[i] && d[i] < 0) open[i] = 0;
    const cells = [];
    for (let i = 0; i < open.length; i++) if (!open[i]) cells.push(i);
    return { cells, open: Array.from(open) };
}

/* ---------------- data game ---------------- */
const PLAYER_BASE = { hp: 100, spd: 190, r: 12, dashCd: 2, dashDur: 0.16 };
const TOTAL_WAVES = 5;
const WAVE_HEAL = 12;

const WEAPONS = {
    bat: { name: "Bat", kind: "melee", dmg: 16, cd: 0.45, range: 46, half: 55, kb: 180, color: "#fbbf24", glyph: "B" },
    katana: { name: "Katana", kind: "melee", dmg: 22, cd: 0.30, range: 58, half: 62, kb: 150, color: "#e2e8f0", glyph: "K" },
    hammer: { name: "War Hammer", kind: "melee", dmg: 40, cd: 0.85, range: 52, half: 75, kb: 340, color: "#94a3b8", glyph: "H" },
    spear: { name: "Spear", kind: "melee", dmg: 26, cd: 0.50, range: 86, half: 22, kb: 230, color: "#fb923c", glyph: "S" },
    pistol: { name: "Pistol", kind: "gun", dmg: 14, cd: 0.26, speed: 430, ammo: 48, spread: 0.05, kb: 120, color: "#60a5fa", glyph: "P" },
    shotgun: { name: "Shotgun", kind: "gun", dmg: 9, cd: 0.85, speed: 400, ammo: 20, spread: 0.30, pellets: 5, kb: 260, color: "#f472b6", glyph: "G" },
    smg: { name: "SMG", kind: "gun", dmg: 7, cd: 0.11, speed: 460, ammo: 110, spread: 0.14, kb: 80, color: "#34d399", glyph: "M" },
    rifle: { name: "Rail Rifle", kind: "gun", dmg: 34, cd: 0.70, speed: 560, ammo: 14, spread: 0.01, pierce: 3, kb: 200, color: "#a78bfa", glyph: "R" },
};
const WEAPON_KEYS = Object.keys(WEAPONS);

const RARITY = {
    common: { w: 6, c: "#a8a29e", label: "Common" },
    rare: { w: 3, c: "#38bdf8", label: "Rare" },
    epic: { w: 1.2, c: "#a78bfa", label: "Epic" },
};

/* Semua skill repeatable: stack tanpa batas, kombinasi tak terbatas. */
const SKILLS = [
    { id: "power", name: "Brutal Swings", icon: "\u2694\uFE0F", rarity: "common", desc: "+18% damage (stacks)." },
    { id: "swift", name: "Swift Feet", icon: "\u{1F45F}", rarity: "common", desc: "+8% move speed (stacks)." },
    { id: "wide", name: "Wide Arc", icon: "\u{1F319}", rarity: "common", desc: "+10\u00B0 swing arc & +5 reach." },
    { id: "vital", name: "Vitality", icon: "\u2764\uFE0F", rarity: "common", desc: "+20 max HP and heal 20." },
    { id: "frenzy", name: "Frenzy", icon: "\u{1F525}", rarity: "common", desc: "Attack cooldown \u00D70.90." },
    { id: "force", name: "Heavy Hands", icon: "\u{1F4A2}", rarity: "common", desc: "+35% knockback force." },
    { id: "magnet", name: "Magnet", icon: "\u{1F9F2}", rarity: "common", desc: "+50% pickup radius." },
    { id: "lucky", name: "Scavenger", icon: "\u{1F340}", rarity: "common", desc: "+10% loot drop chance." },
    { id: "dash", name: "Quickstep", icon: "\u{1F4A8}", rarity: "common", desc: "Dash cooldown \u00D70.85." },
    { id: "gold", name: "Bounty", icon: "\u{1FA99}", rarity: "common", desc: "+25% score gain." },
    { id: "vamp", name: "Vampirism", icon: "\u{1FA78}", rarity: "rare", desc: "+2 HP per kill." },
    { id: "crit", name: "Deadeye", icon: "\u{1F3AF}", rarity: "rare", desc: "+8% crit chance (\u00D72 damage)." },
    { id: "thorns", name: "Thorns", icon: "\u{1F335}", rarity: "rare", desc: "Attackers take 5 damage." },
    { id: "burn", name: "Ember Edge", icon: "\u{1F525}", rarity: "rare", desc: "Hits burn: +3 dps for 2s." },
    { id: "frost", name: "Frost Bite", icon: "\u2744\uFE0F", rarity: "rare", desc: "Hits slow +15% (max 60%)." },
    { id: "regen", name: "Adrenaline", icon: "\u{1F489}", rarity: "rare", desc: "+0.6 HP/s regen." },
    { id: "boom", name: "Corpse Bomb", icon: "\u{1F4A3}", rarity: "epic", desc: "Kills explode: 12 AoE damage." },
    { id: "wind", name: "Second Wind", icon: "\u{1F607}", rarity: "epic", desc: "+1 revive per run." },
    { id: "orbit", name: "Orbit Blade", icon: "\u{1F5E1}\uFE0F", rarity: "epic", desc: "+1 orbiting blade." },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

function computeStats(sk) {
    const n = (k) => sk[k] || 0;
    return {
        dmgMul: Math.pow(1.18, n("power")),
        spdMul: Math.min(2.2, Math.pow(1.08, n("swift"))),
        arcAdd: 10 * n("wide"),
        rangeAdd: 5 * n("wide"),
        maxHp: PLAYER_BASE.hp + 20 * n("vital"),
        cdMul: Math.max(0.25, Math.pow(0.9, n("frenzy"))),
        vamp: 2 * n("vamp"),
        crit: Math.min(1, 0.08 * n("crit")),
        thorns: 5 * n("thorns"),
        kbMul: 1 + 0.35 * n("force"),
        pickup: 30 * (1 + 0.5 * n("magnet")),
        boom: 12 * n("boom"),
        boomR: 40 + 4 * n("boom"),
        burnDps: 3 * n("burn"),
        slow: Math.min(0.6, 0.15 * n("frost")),
        revives: n("wind"),
        orbits: n("orbit"),
        dropBonus: 0.1 * n("lucky"),
        dashCd: Math.max(0.5, PLAYER_BASE.dashCd * Math.pow(0.85, n("dash"))),
        regen: 0.6 * n("regen"),
        scoreMul: 1 + 0.25 * n("gold"),
    };
}

/* draft 3 skill unik, bobot rarity */
function pickDraft(rnd) {
    const pool = SKILLS.slice();
    const out = [];
    while (out.length < 3 && pool.length) {
        let tot = 0;
        for (const s of pool) tot += RARITY[s.rarity].w;
        let roll = rnd() * tot;
        let i = 0;
        for (; i < pool.length; i++) { roll -= RARITY[pool[i].rarity].w; if (roll <= 0) break; }
        i = Math.min(i, pool.length - 1);
        out.push(pool[i].id);
        pool.splice(i, 1);
    }
    return out;
}

const WAVES = [
    { count: 5, hp: 30, spd: 56, mix: { walker: 1 }, boss: false },
    { count: 7, hp: 34, spd: 60, mix: { walker: 0.7, runner: 0.3 }, boss: false },
    { count: 9, hp: 38, spd: 64, mix: { walker: 0.55, runner: 0.3, brute: 0.15 }, boss: false },
    { count: 11, hp: 44, spd: 68, mix: { walker: 0.45, runner: 0.35, brute: 0.2 }, boss: false },
    { count: 8, hp: 46, spd: 70, mix: { walker: 0.5, runner: 0.3, brute: 0.2 }, boss: true },
];

const ZTYPES = {
    walker: { r: 12, hpMul: 1, spdMul: 1, dmg: 9, fill: "#8fae4e", stroke: "#3f5222", score: 10, windup: 0.5, kbRes: 1 },
    runner: { r: 10, hpMul: 0.6, spdMul: 1.55, dmg: 7, fill: "#c9cf4a", stroke: "#5c5f1d", score: 12, windup: 0.34, kbRes: 1.15 },
    brute: { r: 17, hpMul: 2.4, spdMul: 0.68, dmg: 14, fill: "#5f7a3d", stroke: "#2c3a1c", score: 18, windup: 0.65, kbRes: 0.5 },
    boss: { r: 24, hpMul: 1, spdMul: 1, dmg: 22, fill: "#8b5cf6", stroke: "#ddd6fe", score: 250, windup: 0.7, kbRes: 0.85 },
};
const BOSS_HP = 380;

const ITEM_TYPES = [
    { id: "gem", w: 32 },
    { id: "medkit", w: 22 },
    { id: "ammo", w: 16 },
    { id: "coffee", w: 12 },
    { id: "shield", w: 10 },
    { id: "nuke", w: 5 },
];

export const _test = {
    clamp, chaseStep, inSwingArc, mulberry32, generateLevel, computeStats, pickDraft,
    WAVES, WEAPONS, SKILLS, ZTYPES, TOTAL_WAVES, W, H, CELL, COLS, ROWS, PADS,
};

/* ================================================================ */
/* mount — sesuai template baru                                      */
/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const hostSide = !online || room.isHost;
    let roomData = room?.room || null;

    const NS = "http://www.w3.org/2000/svg";
    const PALETTES = [
        { body: "#3b82f6", edge: "#bfdbfe", hood: "#1d4ed8", name: "Blue" },
        { body: "#f97316", edge: "#fed7aa", hood: "#c2410c", name: "Orange" },
    ];

    /* ---------------- shell (minimal UI) ---------------- */
    root.innerHTML = `
<div class="game-app zs game-fill" data-zs>
<style>
.zs{--ink:#1c1917;--mut:#78716c;--line:#e7e5e4;--acc:#65a30d;color:var(--ink);width:100%;max-width:900px;margin:0 auto;padding:0 12px calc(12px + env(safe-area-inset-bottom));box-sizing:border-box}
.zs.game-fill{display:flex;flex-direction:column}
.zs *{box-sizing:border-box}
.zs [hidden]{display:none!important}
.zs button{font-family:inherit}
.zs-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}
.zs-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--mut);border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 9px;font-weight:600;line-height:1.4;white-space:nowrap}
.zs-chip b{color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums}
.zs-chip.cheat{border-color:#f59e0b66;background:#fffbeb;color:#92400e;font-weight:800}
.zs .game-status-dot{width:8px;height:8px;border-radius:50%;background:#a8a29e;display:inline-block;flex:none}
.zs .game-status-dot.live{background:#65a30d;box-shadow:0 0 0 3px #65a30d22}
.zs .game-status-dot.warn{background:#f59e0b}
.zs .game-status-dot.bad{background:#ef4444}
.zs-hp{width:60px;height:6px;border-radius:3px;background:#e7e5e4;overflow:hidden;display:inline-block}
.zs-hp i{display:block;height:100%;border-radius:3px;background:#10b981;transition:width .15s}
.zs-spacer{flex:1 1 auto}
.zs-btn{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;font-weight:700;font-size:12px;border-radius:10px;padding:8px 14px;min-height:36px;cursor:pointer}
.zs-btn:hover{opacity:.88}
.zs-btn.ghost{background:#fff;color:var(--ink);border-color:var(--line)}
.zs-btn.ghost:hover{background:#f5f5f4;opacity:1}
.zs-btn.acc{background:var(--acc);border-color:var(--acc)}
.zs-icon-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;font-size:10px;min-height:32px}
.zs-icon-btn svg{flex:none;display:block}
.zs-btn-label{white-space:nowrap}
.zs-btnrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:0 auto}
.zs-arena{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:5/4;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#161a15;line-height:0;user-select:none;-webkit-user-select:none}
.zs-board{display:block;width:100%;height:100%;cursor:crosshair;touch-action:none}
.zs-boss{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:min(70%,340px);z-index:3;line-height:1.2}
.zs-boss .nm{font-size:9.5px;font-weight:800;letter-spacing:.16em;color:#e9d5ff;text-align:center;text-shadow:0 1px 2px #000;margin-bottom:3px}
.zs-boss .bar{height:7px;border-radius:4px;background:#ffffff22;border:1px solid #ffffff33;overflow:hidden}
.zs-boss .bar i{display:block;height:100%;background:#a78bfa;transition:width .15s}
.zs-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(250,250,249,.9);backdrop-filter:blur(5px);line-height:1.45;padding:12px;overflow:auto;z-index:5}
.zs-card{display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;max-height:100%;max-width:min(430px,100%);width:100%;box-shadow:0 6px 18px rgba(28,25,23,.08);text-align:center;margin:auto}
.zs-card.wide{max-width:min(520px,100%)}
.zs-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.zs-card h3{margin:0;font-size:18px;font-weight:800;letter-spacing:-.01em}
.zs-head .zs-btn{min-height:30px;padding:4px 10px;font-size:10px}
.zs-card .sub{margin:0 0 12px;font-size:12.5px;color:var(--mut)}
.zs-scroll,.zs-help,.zs-cheats,.zs-draft,.zs-stats{flex:1 1 auto;min-height:0;overflow:auto}
.zs-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap}
.zs-note{font-size:10.5px;color:var(--mut);text-align:left}
.zs-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}
.zs-stat{border:1px solid var(--line);border-radius:12px;padding:8px 4px}
.zs-stat b{display:block;font-size:15px;font-weight:800}
.zs-stat span{font-size:9.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.zs-draft{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px}
@media (max-width:420px){.zs-draft{grid-template-columns:1fr}}
.zs-skill{border:1.5px solid var(--line);border-radius:12px;background:#fff;padding:12px 8px;min-height:44px;cursor:pointer;text-align:center;color:var(--ink)}
.zs-skill:hover{border-color:var(--acc);background:#f7fee7}
.zs-skill .ic{font-size:22px;line-height:1.2}
.zs-skill h4{margin:5px 0 2px;font-size:12.5px;font-weight:800}
.zs-skill p{margin:0;font-size:10.5px;color:var(--mut);line-height:1.35}
.zs-skill .rar{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
.zs-skill .lv{display:inline-block;margin-top:6px;font-size:9.5px;font-weight:700;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:1px 7px}
.zs-skill.picked{border-color:var(--acc);background:#f7fee7}
.zs-skill.dim{opacity:.45;pointer-events:none}
.zs-help{text-align:left}
.zs-help h5{margin:12px 0 4px;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--acc)}
.zs-help p,.zs-help li{font-size:12px;color:#44403c;margin:2px 0}
.zs-help ul{margin:2px 0;padding-left:16px}
.zs-help kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:10.5px;background:#fafaf9;font-family:inherit}
.zs-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;text-align:left}
@media (max-width:420px){.zs-cheats{grid-template-columns:1fr}}
.zs-cheat-item{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:11.5px;font-weight:600}
.zs-tgl{border:1px solid var(--line);border-radius:999px;font-size:10px;font-weight:800;min-height:44px;padding:4px 12px;cursor:pointer;background:#f5f5f4;color:var(--mut)}
.zs-tgl.on{background:var(--acc);border-color:var(--acc);color:#fff}
.zs-mini{border:1px solid var(--line);background:#fff;border-radius:10px;font-size:11.5px;font-weight:700;min-height:44px;padding:7px 10px;cursor:pointer;text-align:left;color:var(--ink)}
.zs-mini:hover{border-color:var(--acc);background:#f7fee7}
.zs-toasts{position:absolute;left:10px;bottom:10px;display:flex;flex-direction:column;gap:5px;z-index:4;pointer-events:none;line-height:1.3;max-width:calc(100% - 20px)}
.zs-toast{background:#ffffffee;border:1px solid var(--line);border-radius:9px;font-size:11px;font-weight:600;padding:5px 10px;box-shadow:0 3px 10px rgba(0,0,0,.08);max-width:270px;color:var(--ink)}
.zs-controls{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.zs-pad{display:none;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,46px);gap:5px}
.zs-acts{display:none;align-items:center;gap:8px}
.zs.touch .zs-pad{display:grid}
.zs.touch .zs-acts{display:flex}
@media (pointer:coarse){.zs .zs-pad{display:grid}.zs .zs-acts{display:flex}}
.zs-dbtn{width:46px;height:46px;border-radius:10px;border:1px solid var(--line);background:#fff;font-size:16px;color:var(--ink);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;padding:0;line-height:1}
.zs-dbtn:active{background:#f7fee7;border-color:var(--acc)}
.zs-hit{width:66px;height:66px;border-radius:50%;background:var(--acc);border:none;color:#fff;font-weight:800;font-size:13px;letter-spacing:.04em;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.zs-hit:active{transform:scale(.94)}
.zs-dashb{width:54px;height:54px;border-radius:50%;border:1.5px solid var(--ink);background:#fff;color:var(--ink);font-weight:800;font-size:10px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.zs-dashb.cool{opacity:.4}
.zs :focus-visible,.zs button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.zs *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- fill height + mobile refinements (last, highest specificity) --- */
@media (pointer:coarse){.zs button:not(:disabled){min-height:44px}}
.zs .zs-hud{gap:6px;margin-bottom:8px}
.zs .zs-hud .zs-chip{padding:4px 7px;font-size:9px}
.zs .zs-hud .zs-icon-btn{min-height:32px;padding:5px 9px;font-size:9px}
.zs .zs-hud .zs-btn-label,.zs .zs-hud .zs-spacer{display:none}
.zs.game-fill > .zs-arena{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.zs{padding-left:8px;padding-right:8px}
.zs.game-fill > .zs-arena:not(:has(.zs-ov:not([hidden]))){aspect-ratio:5/4;flex:0 0 auto}
.zs.game-fill > .zs-arena:has(.zs-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.zs .zs-hud{gap:5px}
.zs .zs-hud .zs-chip{padding:4px 6px;font-size:9px}
.zs .zs-hud .zs-icon-btn{min-height:32px;padding:5px 9px;font-size:9px}
.zs .zs-ov{padding:8px}
.zs .zs-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.zs .zs-scroll,.zs .zs-help,.zs .zs-cheats,.zs .zs-draft,.zs .zs-stats{scrollbar-width:none}
.zs .zs-scroll::-webkit-scrollbar,.zs .zs-help::-webkit-scrollbar,.zs .zs-cheats::-webkit-scrollbar,.zs .zs-draft::-webkit-scrollbar,.zs .zs-stats::-webkit-scrollbar{display:none}
.zs .zs-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.zs .zs-note{display:none}
}
</style>
<div class="zs-hud">
  <span class="zs-chip">STATUS <b data-el="status">Ready</b><i class="game-status-dot" data-el="statusDot"></i></span>
  <span class="zs-chip">WAVE <b data-el="wave">1</b>/${TOTAL_WAVES}</span>
  <span class="zs-chip">KILLS <b data-el="kills">0</b></span>
  <span class="zs-chip">SCORE <b data-el="score">0</b></span>
  <span class="zs-chip">BEST <b data-el="best">0</b></span>
  <span data-el="hps" style="display:inline-flex;gap:6px"></span>
  <span class="zs-chip">WPN <b data-el="wpn">Bat</b></span>
  <span class="zs-chip">SEED <b data-el="seed">—</b></span>
  <span class="zs-chip cheat" data-el="cheatBadge" hidden>CHEATS</span>
  <span class="zs-spacer"></span>
  <button class="zs-btn zs-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="zs-btn-label">Help</span></button>
  <button class="zs-btn zs-icon-btn" type="button" data-cheats data-el="cheatBtn" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="zs-btn-label">Cheats</span></button>
  <button class="zs-btn zs-icon-btn" type="button" data-pause data-el="pauseBtn" aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="zs-btn-label">Pause</span></button>
  <button class="zs-btn zs-icon-btn" type="button" data-restart data-el="restartBtn" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="zs-btn-label">Restart</span></button>
  <button class="zs-btn zs-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="zs-btn-label">Exit game</span></button>
  <button class="zs-btn zs-icon-btn" type="button" data-act="touch" aria-label="Toggle touch controls" title="Toggle touch controls">${iconSVG("gamepad2", { size: 14 })}<span class="zs-btn-label">Touch</span></button>
  <button class="zs-btn zs-icon-btn" type="button" data-act="mute" data-el="sndBtn" aria-label="Toggle sound" title="Sound">${iconSVG("volume", { size: 14 })}<span class="zs-btn-label">Sound</span></button>
</div>
<section class="game-panel zs-arena" data-board>
  <svg class="zs-board" data-el="board" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Zombie Survival arena">
    <g data-el="world">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#171b16"/>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="none" stroke="#ffffff12" stroke-width="2"/>
      <g data-el="dots"></g>
      <g data-el="obst"></g>
      <g data-el="items"></g>
      <g data-el="rings"></g>
      <g data-el="shots"></g>
      <g data-el="zombies"></g>
      <g data-el="swings"></g>
      <g data-el="players"></g>
      <g data-el="pops"></g>
      <circle data-el="aim" r="6" fill="none" stroke="#a3e635" stroke-width="1.5" opacity="0"/>
    </g>
    <text data-el="banner" x="${W / 2}" y="218" font-size="30" font-weight="800" letter-spacing="4" fill="#fff" text-anchor="middle" opacity="0" font-family="inherit"></text>
    <text data-el="bannerSub" x="${W / 2}" y="246" font-size="12.5" fill="#d6d3d1" text-anchor="middle" opacity="0" font-family="inherit"></text>
  </svg>
  <div class="zs-boss" data-el="boss" hidden>
    <div class="nm">THE ABOMINATION</div>
    <div class="bar"><i data-el="bossFill" style="width:100%"></i></div>
  </div>
  <div class="zs-toasts" data-el="toasts"></div>

  <div class="zs-ov" data-ov="wait" hidden><div class="zs-card"><div class="zs-head"><h3>Connecting\u2026</h3></div><div class="zs-scroll"><p class="sub" style="margin:0">Waiting for the host's state.</p></div></div></div>

  <div class="zs-ov" data-ov="start">
    <div class="zs-card">
      <div class="zs-head"><h3>Zombie Survival</h3></div>
      <div class="zs-scroll">
        <p class="sub">Survive ${TOTAL_WAVES} waves in a freshly generated arena. Zombies telegraph their attacks — dodge or dash through them. Clear a wave, draft a skill (they stack forever), and face the boss at the end.</p>
        <p class="sub" style="margin:12px 0 0" data-el="startNote">Coin toss decides who moves first \u00B7 spawn corners are randomized.</p>
      </div>
      <div class="zs-foot"><div class="zs-btnrow">
        <button class="zs-btn acc" type="button" data-act="start" data-el="startBtn">Start run</button>
        <button class="zs-btn ghost" type="button" data-act="help">How to play</button>
      </div></div>
    </div>
  </div>

  <div class="zs-ov" data-ov="pause" hidden>
    <div class="zs-card">
      <div class="zs-head"><h3>Paused</h3></div>
      <div class="zs-scroll"><p class="sub" data-el="pauseSub">Game paused.</p></div>
      <div class="zs-foot"><div class="zs-btnrow"><button class="zs-btn" type="button" data-act="resume" data-el="resumeBtn">Resume</button><button class="zs-btn ghost" type="button" data-act="help">How to play</button></div></div>
    </div>
  </div>

  <div class="zs-ov" data-ov="draft" hidden>
    <div class="zs-card wide">
      <div class="zs-head"><h3>Choose a skill</h3></div>
      <div class="zs-scroll">
        <p class="sub" data-el="draftSub">Wave cleared!</p>
        <div class="zs-draft" data-el="draftCards"></div>
      </div>
      <div class="zs-foot"><p class="sub" style="margin:0" data-el="draftWait"></p></div>
    </div>
  </div>

  <div class="zs-ov" data-ov="help" hidden>
    <div class="zs-card wide zs-help">
      <div class="zs-head"><h3>How to play</h3><button class="zs-btn ghost" type="button" data-help-close aria-label="Close help">Close</button></div>
      <div class="zs-scroll">
        <h5>Goal</h5>
        <p>Survive ${TOTAL_WAVES} waves. Every wave generates a new arena layout (always fully connected — no unreachable spots). Wave ${TOTAL_WAVES} spawns <b>The Abomination</b>.</p>
        <h5>Desktop controls</h5>
        <ul>
          <li><kbd>WASD</kbd> / <kbd>\u2190\u2191\u2192\u2193</kbd> move \u00B7 mouse to aim</li>
          <li><kbd>Click</kbd> / <kbd>Space</kbd> attack (hold to auto-attack)</li>
          <li><kbd>Shift</kbd> / right-click dash (brief invulnerability)</li>
          <li><kbd>1\u20133</kbd> pick skill \u00B7 <kbd>P</kbd> pause \u00B7 <kbd>H</kbd> help \u00B7 <kbd>C</kbd> cheats \u00B7 <kbd>R</kbd> restart</li>
        </ul>
        <h5>Mobile controls</h5>
        <ul>
          <li>D-pad to move \u00B7 <b>HIT</b> to attack (auto-aims at the nearest zombie) \u00B7 <b>DASH</b> to dodge.</li>
        </ul>
        <h5>Combat</h5>
        <ul>
          <li>Zombies raise their arms and show a red <b>!</b> before striking — step away or dash during the wind-up.</li>
          <li>Your hits knock zombies back and interrupt their wind-ups.</li>
          <li>The boss telegraphs a <b>stomp ring</b> and a <b>charge lane</b>, and summons minions. Keep moving.</li>
        </ul>
        <h5>Roguelite draft</h5>
        <ul>
          <li>After each wave pick 1 of 3 skills. Every skill stacks without limit — combine burn + frost + corpse bombs + orbit blades\u2026</li>
          <li>In co-op both players draft; a random coin toss decides who moves first, and spawn corners/roles are randomized.</li>
        </ul>
        <h5>Loot</h5>
        <ul>
          <li>Weapons: Katana, War Hammer, Spear, Pistol, Shotgun, SMG, Rail Rifle (guns use ammo; empty guns revert to the bat).</li>
          <li>Items: medkit, ammo box, gem (score), coffee (speed), shield (blocks 2 hits), nuke (clears the screen).</li>
        </ul>
      </div>
      <div class="zs-foot"><span class="zs-note">Press H to reopen this guide</span><button class="zs-btn" type="button" data-help-close>Got it</button></div>
    </div>
  </div>

  <div class="zs-ov" data-ov="cheats" hidden>
    <div class="zs-card wide">
      <div class="zs-head"><h3>\u26A1 Cheats</h3><button class="zs-btn ghost" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
      <div class="zs-scroll"><p class="sub">Using cheats marks the run — best score won't be saved.</p><div class="zs-cheats" data-el="cheatGrid"></div></div>
      <div class="zs-foot"><span class="zs-note">Press C to toggle cheats</span><button class="zs-btn" type="button" data-cheat-close>Close</button></div>
    </div>
  </div>

  <div class="zs-ov" data-ov="over" hidden>
    <div class="zs-card">
      <div class="zs-head"><h3 data-el="ovTitle">Game over</h3></div>
      <div class="zs-scroll">
        <p class="sub" data-el="ovSub"></p>
        <div class="zs-stats" data-el="ovStats"></div>
        <p class="sub" data-el="ovCheat" style="margin:0 0 10px"></p>
      </div>
      <div class="zs-foot">
        <div class="zs-btnrow">
          <button class="zs-btn acc" type="button" data-act="start" data-el="againBtn">Play again</button>
          <button class="zs-btn ghost" type="button" data-exit>Exit game</button>
        </div>
        <p class="sub" style="margin:0" data-el="ovWait"></p>
      </div>
    </div>
  </div>
</section>
<div class="zs-controls">
  <div class="zs-pad" data-el="pad">
    <button class="zs-dbtn" type="button" data-dir="up" style="grid-column:2;grid-row:1" aria-label="Up">\u25B2</button>
    <button class="zs-dbtn" type="button" data-dir="left" style="grid-column:1;grid-row:2" aria-label="Left">\u25C0</button>
    <button class="zs-dbtn" type="button" data-dir="down" style="grid-column:2;grid-row:2" aria-label="Down">\u25BC</button>
    <button class="zs-dbtn" type="button" data-dir="right" style="grid-column:3;grid-row:2" aria-label="Right">\u25B6</button>
  </div>
  <div class="zs-acts">
    <button class="zs-dashb" type="button" data-act="dash" data-el="dashBtn" aria-label="Dash">DASH</button>
    <button class="zs-hit" type="button" data-act="hit" data-el="hitBtn" aria-label="Attack">HIT</button>
  </div>
</div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const R = {};
    for (const el of root.querySelectorAll("[data-el]")) R[el.dataset.el] = el;
    const OV = {};
    for (const el of root.querySelectorAll("[data-ov]")) OV[el.dataset.ov] = el;
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");
    const vis = (el, on) => (on ? el.removeAttribute("hidden") : el.setAttribute("hidden", ""));
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    /* ---------------- state ---------------- */
    let sim = null;            // state kanonik (host / solo) — serializable
    let view = null;           // yang dirender (host: sim, guest: snapshot terhalus)
    let curV = null;
    let rng = Math.random;     // RNG run (host)
    let navOpen = new Uint8Array(COLS * ROWS).fill(1);
    let field = new Int16Array(COLS * ROWS).fill(-1);
    let fieldT = 0;
    const cheats = { god: false, onehit: false, ammo: false, slowmo: false, freeze: false };
    let helpOpen = false, cheatsOpen = false, overlayAutoPaused = false, pauseStamp = 0;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("zombieSurvivalHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("zombieSurvivalHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }
    let mounted = true, raf = 0, lastT = 0, pubAcc = 0, lastSend = 0, lastInputSig = "";
    let attackHeldMouse = false, attackHeldKey = false, attackHeldTouch = false;
    const keys = { up: false, down: false, left: false, right: false };
    const padPointers = new Map();
    let aimPos = null, aimMode = "auto";
    let assignedToast = false, tossToasted = false;
    const zEls = new Map(), pEls = new Map(), iEls = new Map(), sEls = new Map();
    const popEls = new Map(), ringEls = new Map(), swingEls = new Map();
    let obstSig = "", draftSig = "", hpsSig = "", toastSig = "";
    let toastList = [];
    let audio = null, muted = false;
    const sfxLast = {};
    const subs = [];

    /* ---------------- audio (synth kecil, tanpa aset) ---------------- */
    function sfx(kind) {
        if (muted) return;
        const now = performance.now();
        if (sfxLast[kind] && now - sfxLast[kind] < 60) return;
        sfxLast[kind] = now;
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === "suspended") audio.resume();
            const P = {
                hit: [220, 0.06, "square", 0.05], kill: [160, 0.12, "sawtooth", 0.05],
                hurt: [110, 0.18, "sawtooth", 0.07], pick: [520, 0.09, "sine", 0.06],
                dash: [340, 0.08, "sine", 0.05], wave: [440, 0.25, "triangle", 0.06],
                boss: [80, 0.4, "sawtooth", 0.08], click: [600, 0.04, "sine", 0.04],
                win: [660, 0.5, "triangle", 0.07], lose: [90, 0.6, "sawtooth", 0.07],
                shot: [300, 0.05, "square", 0.035],
            };
            const [f, d, w, v] = P[kind] || P.click;
            const t = audio.currentTime;
            const o = audio.createOscillator(), g = audio.createGain();
            o.connect(g); g.connect(audio.destination);
            o.type = w;
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.5), t + d);
            g.gain.setValueAtTime(v, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.start(t); o.stop(t + d);
        } catch (e) { }
    }

    /* ---------------- element builders ---------------- */
    function buildWeapon(g, key) {
        g.innerHTML = "";
        const w = WEAPONS[key];
        const ln = (x1, y1, x2, y2, c, sw) => mk("line", { x1, y1, x2, y2, stroke: c, "stroke-width": sw, "stroke-linecap": "round" }, g);
        const rc = (x, y, ww, hh, c, rx) => mk("rect", { x, y, width: ww, height: hh, rx: rx || 1.5, fill: c }, g);
        if (key === "bat") { ln(6, 0, 12, 0, "#92400e", 5); ln(10, 0, w.range - 6, 0, "#fbbf24", 5); }
        else if (key === "katana") { ln(6, 0, 12, 0, "#334155", 4); ln(12, -4, 12, 4, "#94a3b8", 3); ln(12, 0, w.range - 4, 0, "#e2e8f0", 3); }
        else if (key === "hammer") { ln(6, 0, w.range - 14, 0, "#78716c", 4); rc(w.range - 18, -8, 11, 16, "#94a3b8", 2); }
        else if (key === "spear") { ln(4, 0, w.range - 10, 0, "#a16207", 3); mk("path", { d: "M" + (w.range - 10) + " -4 L" + w.range + " 0 L" + (w.range - 10) + " 4 Z", fill: "#fb923c" }, g); }
        else if (key === "pistol") { rc(8, -2.5, 14, 5, "#334155"); rc(9, 1, 4, 6, "#1e293b", 1); mk("circle", { cx: 23, cy: 0, r: 1.6, fill: w.color }, g); }
        else if (key === "shotgun") { rc(7, -2.5, 24, 5, "#475569"); rc(15, -3.5, 7, 7, "#92400e", 1); mk("circle", { cx: 32, cy: 0, r: 1.6, fill: w.color }, g); }
        else if (key === "smg") { rc(7, -2.5, 18, 5, "#334155"); rc(12, 2, 4, 7, "#1e293b", 1); mk("circle", { cx: 26, cy: 0, r: 1.6, fill: w.color }, g); }
        else if (key === "rifle") { rc(6, -2, 30, 4, "#4c1d95"); mk("circle", { cx: 14, cy: -4, r: 2, fill: "#a78bfa" }, g); mk("circle", { cx: 37, cy: 0, r: 1.6, fill: w.color }, g); }
    }

    function makePlayerEl(p) {
        const pal = PALETTES[p.color];
        const g = mk("g", {});
        mk("ellipse", { cx: 0, cy: 11, rx: 11, ry: 3.5, fill: "#000", opacity: 0.3 }, g);
        g._shield = mk("circle", { r: 17, fill: "none", stroke: "#38bdf8", "stroke-width": 2, "stroke-dasharray": "4 3", hidden: "" }, g);
        g._body = mk("circle", { r: PLAYER_BASE.r, fill: pal.body, stroke: pal.edge, "stroke-width": 2 }, g);
        g._hood = mk("path", { d: "M -10 -5 A 11 11 0 0 1 10 -5", fill: "none", stroke: pal.hood, "stroke-width": 5, "stroke-linecap": "round" }, g);
        g._eyes = mk("g", {}, g);
        mk("circle", { cx: -3.5, cy: -1, r: 1.9, fill: "#0b1020" }, g._eyes);
        mk("circle", { cx: 3.5, cy: -1, r: 1.9, fill: "#0b1020" }, g._eyes);
        g._down = mk("g", { hidden: "", stroke: "#0b1020", "stroke-width": 1.8, "stroke-linecap": "round" }, g);
        mk("path", { d: "M-5.5 -3 L-1.5 1 M-1.5 -3 L-5.5 1 M1.5 -3 L5.5 1 M5.5 -3 L1.5 1", fill: "none" }, g._down);
        g._wpn = mk("g", {}, g);
        g._wkey = null;
        g._label = mk("text", { y: -20, "font-size": 8.5, "font-weight": 700, fill: "#ffffffcc", "text-anchor": "middle", "font-family": "inherit" }, g);
        return g;
    }

    function makeZombieEl(z) {
        const t = ZTYPES[z.type], r = z.r;
        const g = mk("g", {});
        mk("ellipse", { cx: 0, cy: r * 0.8, rx: r * 0.9, ry: r * 0.3, fill: "#000", opacity: 0.28 }, g);
        if (z.type === "boss") {
            g._ring = mk("circle", { r: 1, fill: "#ef444418", stroke: "#ef4444", "stroke-width": 2, "stroke-dasharray": "5 4", hidden: "" }, g);
            g._line = mk("rect", { x: 0, y: -13, width: 240, height: 26, rx: 6, fill: "#ef444422", stroke: "#ef444455", "stroke-width": 1, hidden: "" }, g);
        }
        const rot = mk("g", {}, g);
        g._rot = rot;
        g._arms = mk("g", {}, rot);
        mk("line", { x1: r * 0.35, y1: -r * 0.7, x2: r + 8, y2: -r * 0.45, stroke: t.fill, "stroke-width": 4.5, "stroke-linecap": "round" }, g._arms);
        mk("line", { x1: r * 0.35, y1: r * 0.7, x2: r + 8, y2: r * 0.45, stroke: t.fill, "stroke-width": 4.5, "stroke-linecap": "round" }, g._arms);
        mk("rect", { x: -r, y: -r, width: r * 2, height: r * 2, rx: r * 0.55, fill: t.fill, stroke: z.elite ? "#fbbf24" : t.stroke, "stroke-width": 2 }, rot);
        mk("path", { d: "M" + (-r * 0.5) + " " + (-r * 0.6) + " l4 3 l-3 4", fill: "none", stroke: t.stroke, "stroke-width": 1.3, opacity: 0.7 }, rot);
        if (z.type === "boss") {
            mk("path", { d: "M" + (-r * 0.5) + " " + (-r) + " l-4 -8 l9 4 Z M" + (-r * 0.5) + " " + r + " l-4 8 l9 -4 Z", fill: "#ddd6fe" }, rot);
            mk("circle", { cx: r * 0.45, cy: -r * 0.32, r: 4.5, fill: "#f0abfc", opacity: 0.35 }, rot);
            mk("circle", { cx: r * 0.45, cy: r * 0.32, r: 4.5, fill: "#f0abfc", opacity: 0.35 }, rot);
            mk("circle", { cx: r * 0.45, cy: -r * 0.32, r: 2.6, fill: "#f0abfc" }, rot);
            mk("circle", { cx: r * 0.45, cy: r * 0.32, r: 2.6, fill: "#f0abfc" }, rot);
        } else {
            mk("circle", { cx: r * 0.45, cy: -r * 0.32, r: 2, fill: "#101410" }, rot);
            mk("path", { d: "M" + (r * 0.45 - 2.4) + " " + (r * 0.32 - 2.4) + " l4.8 4.8 M" + (r * 0.45 + 2.4) + " " + (r * 0.32 - 2.4) + " l-4.8 4.8", stroke: "#101410", "stroke-width": 1.5, "stroke-linecap": "round" }, rot);
        }
        mk("path", { d: "M" + r * 0.72 + " " + (-r * 0.18) + " L" + r * 0.88 + " 0 L" + r * 0.72 + " " + r * 0.18, fill: "none", stroke: "#101410", "stroke-width": 1.4 }, rot);
        g._flash = mk("rect", { x: -r, y: -r, width: r * 2, height: r * 2, rx: r * 0.55, fill: "#fff", opacity: 0 }, rot);
        if (z.type !== "boss") {
            g._bar = mk("g", { hidden: "" }, g);
            mk("rect", { x: -12, y: -r - 12, width: 24, height: 4, rx: 2, fill: "#ffffff22" }, g._bar);
            g._barF = mk("rect", { x: -11, y: -r - 11, width: 22, height: 2, rx: 1, fill: "#f87171" }, g._bar);
        }
        g._bang = mk("text", { x: 0, y: -r - 15, "font-size": 15, "font-weight": 800, fill: "#f87171", "text-anchor": "middle", hidden: "", "font-family": "inherit" }, g);
        g._bang.textContent = "!";
        g._burn = mk("circle", { cx: -r - 5, cy: -r - 5, r: 2.5, fill: "#fb923c", hidden: "" }, g);
        g._slow = mk("circle", { cx: r + 5, cy: -r - 5, r: 2.5, fill: "#60a5fa", hidden: "" }, g);
        return g;
    }

    function makeItemEl(it) {
        const g = mk("g", {});
        mk("ellipse", { cx: 0, cy: 9, rx: 8, ry: 2.5, fill: "#000", opacity: 0.25 }, g);
        const b = mk("g", {}, g);
        if (it.type === "weapon") {
            const w = WEAPONS[it.wkey] || WEAPONS.bat;
            mk("circle", { r: 13, fill: "none", stroke: w.color, "stroke-width": 1.5, opacity: 0.4 }, b);
            mk("rect", { x: -9, y: -8, width: 18, height: 16, rx: 3, fill: "#1e293b", stroke: w.color, "stroke-width": 1.5 }, b);
            const tx = mk("text", { y: 3.5, "font-size": 9, "font-weight": 800, fill: "#fff", "text-anchor": "middle", "font-family": "inherit" }, b);
            tx.textContent = w.glyph;
        } else if (it.type === "medkit") {
            mk("rect", { x: -8, y: -6, width: 16, height: 13, rx: 3, fill: "#fafaf9", stroke: "#d6d3d1" }, b);
            mk("rect", { x: -1.5, y: -3.5, width: 3, height: 8, fill: "#ef4444" }, b);
            mk("rect", { x: -4, y: -1, width: 8, height: 3, fill: "#ef4444" }, b);
        } else if (it.type === "ammo") {
            mk("rect", { x: -7, y: -5, width: 14, height: 11, rx: 2, fill: "#fbbf24", stroke: "#92400e" }, b);
            mk("path", { d: "M-3.5 -2 v5 M0 -2 v5 M3.5 -2 v5", stroke: "#92400e", "stroke-width": 1.6 }, b);
        } else if (it.type === "gem") {
            mk("path", { d: "M0 -8 L7 0 L0 8 L-7 0 Z", fill: "#22d3ee", stroke: "#a5f3fc", "stroke-width": 1.5 }, b);
        } else if (it.type === "nuke") {
            mk("circle", { r: 8, fill: "#ef4444", stroke: "#fecaca", "stroke-width": 1.5 }, b);
            mk("circle", { r: 2.5, fill: "#fecaca" }, b);
            mk("path", { d: "M0 -8 V-3 M6.9 4 L2.6 1.5 M-6.9 4 L-2.6 1.5", stroke: "#fecaca", "stroke-width": 2 }, b);
        } else if (it.type === "shield") {
            mk("path", { d: "M0 -8 L7 -5 V1 Q7 6 0 9 Q-7 6 -7 1 V-5 Z", fill: "#60a5fa", stroke: "#dbeafe", "stroke-width": 1.5 }, b);
        } else if (it.type === "coffee") {
            mk("rect", { x: -6, y: -4, width: 11, height: 10, rx: 2, fill: "#a16207", stroke: "#713f12" }, b);
            mk("path", { d: "M5 -2 Q9 0 5 4", fill: "none", stroke: "#713f12", "stroke-width": 1.6 }, b);
            mk("path", { d: "M-3 -7 q1.5 -2 0 -4 M1 -7 q1.5 -2 0 -4", fill: "none", stroke: "#d6d3d1", "stroke-width": 1.2 }, b);
        }
        return g;
    }

    function makeShotEl(s) {
        return mk("line", { x1: -6, y1: 0, x2: 6, y2: 0, stroke: s.c, "stroke-width": s.pierce ? 3 : 2.5, "stroke-linecap": "round" });
    }
    function makePopEl(p) {
        const t = mk("text", { "font-size": p.size, "font-weight": 800, fill: p.c, "text-anchor": "middle", "font-family": "inherit", style: "paint-order:stroke;stroke:#00000088;stroke-width:2.5px" });
        t.textContent = p.txt;
        return t;
    }
    function makeRingEl(r) {
        return mk("circle", { fill: r.fill ? r.c : "none", "fill-opacity": 0.12, stroke: r.c, "stroke-width": r.w });
    }

    /* ---------------- fisika dunia ---------------- */
    function collideWorld(e) {
        const c0 = clamp(((e.x - e.r) / CELL) | 0, 0, COLS - 1);
        const c1 = clamp(((e.x + e.r) / CELL) | 0, 0, COLS - 1);
        const r0 = clamp(((e.y - e.r) / CELL) | 0, 0, ROWS - 1);
        const r1 = clamp(((e.y + e.r) / CELL) | 0, 0, ROWS - 1);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            if (navOpen[r * COLS + c]) continue;
            const rx = c * CELL + 3, ry = r * CELL + 3, rw = CELL - 6;
            const nx = clamp(e.x, rx, rx + rw), ny = clamp(e.y, ry, ry + rw);
            const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
            if (d2 >= e.r * e.r) continue;
            if (d2 > 1e-6) { const d = Math.sqrt(d2); e.x = nx + (dx / d) * e.r; e.y = ny + (dy / d) * e.r; }
            else {
                const l = e.x - rx, rr = rx + rw - e.x, t = e.y - ry, b = ry + rw - e.y;
                const m = Math.min(l, rr, t, b);
                if (m === l) e.x = rx - e.r; else if (m === rr) e.x = rx + rw + e.r;
                else if (m === t) e.y = ry - e.r; else e.y = ry + rw + e.r;
            }
        }
        e.x = clamp(e.x, e.r + 2, W - e.r - 2);
        e.y = clamp(e.y, e.r + 2, H - e.r - 2);
    }
    function los(ax, ay, bx, by) {
        const d = hyp(bx - ax, by - ay), steps = Math.ceil(d / 10);
        for (let i = 1; i < steps; i++) {
            const x = ax + ((bx - ax) * i) / steps, y = ay + ((by - ay) * i) / steps;
            const c = clamp((x / CELL) | 0, 0, COLS - 1), r = clamp((y / CELL) | 0, 0, ROWS - 1);
            if (!navOpen[r * COLS + c]) return false;
        }
        return true;
    }
    function buildField() {
        field.fill(-1);
        const q = [];
        for (const p of sim.players) {
            if (!p.alive) continue;
            const c = clamp((p.x / CELL) | 0, 0, COLS - 1), r = clamp((p.y / CELL) | 0, 0, ROWS - 1);
            const i = r * COLS + c;
            if (field[i] < 0) { field[i] = 0; q.push(i); }
        }
        for (let h = 0; h < q.length; h++) {
            const i = q[h], c = i % COLS, r = (i / COLS) | 0;
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
                const ni = nr * COLS + nc;
                if (navOpen[ni] && field[ni] < 0) { field[ni] = field[i] + 1; q.push(ni); }
            }
        }
    }
    function steer(z, tgt) {
        const dx = tgt.x - z.x, dy = tgt.y - z.y, d = hyp(dx, dy) || 1;
        if (los(z.x, z.y, tgt.x, tgt.y)) return { x: dx / d, y: dy / d };
        const c = clamp((z.x / CELL) | 0, 0, COLS - 1), r = clamp((z.y / CELL) | 0, 0, ROWS - 1);
        let bestD = field[r * COLS + c], bc = c, br = r;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
            const ni = nr * COLS + nc;
            if (navOpen[ni] && field[ni] >= 0 && (bestD < 0 || field[ni] < bestD)) { bestD = field[ni]; bc = nc; br = nr; }
        }
        const tx = bc * CELL + CELL / 2, ty = br * CELL + CELL / 2;
        const td = hyp(tx - z.x, ty - z.y) || 1;
        return { x: (tx - z.x) / td, y: (ty - z.y) / td };
    }
    function setNav(level) { navOpen = Uint8Array.from(level.open); fieldT = 0; }

    /* ---------------- fx / toast ---------------- */
    function ring(x, y, c, r0, r1, dur, w, fill) {
        sim.rings.push({ id: sim.nextId++, x, y, c, r0, r1, dur, w, fill: !!fill, t: 0 });
    }
    function pop(x, y, txt, c, size) {
        sim.pops.push({ id: sim.nextId++, x, y, txt, c, size: size || 11, t: 0 });
    }
    function toast(txt) {
        toastList.push({ txt, t: 2.6 });
        if (toastList.length > 4) toastList.shift();
    }
    function ageFx(v, dt) {
        for (const p of v.pops) p.t += dt;
        v.pops = v.pops.filter((p) => p.t < 0.6);
        for (const r of v.rings) r.t += dt;
        v.rings = v.rings.filter((r) => r.t < r.dur);
    }

    /* ---------------- lifecycle ---------------- */
    function makePlayer(id, owner, corner, color) {
        const [pc, pr] = PADS[corner];
        return {
            id, owner, corner, color, name: owner === 0 ? "P1" : "P2",
            x: pc * CELL + CELL / 2, y: pr * CELL + CELL / 2, face: -Math.PI / 2,
            hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.hp, alive: true,
            weapon: "bat", ammo: 0, cd: 0, swingT: 0, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
            inv: 0, shield: 0, coffee: 0, skills: {}, stats: computeStats({}),
            input: { mx: 0, my: 0, aim: -Math.PI / 2, atk: false, aimMode: "auto" },
        };
    }
    function resetSim() {
        sim = {
            phase: "menu", paused: false, seed: (Math.random() * 1e9) | 0,
            wave: 0, kills: 0, score: 0, time: 0, cheated: false,
            banner: null, toss: null, freezeP: 0, freezeZ: 0, waveT: 0,
            players: [makePlayer(0, 0, 0, 0)], zombies: [], items: [], shots: [],
            pops: [], rings: [], draft: null, spawnQueue: [],
            level: generateLevel((Math.random() * 1e9) | 0),
            assign: [], over: null, bossId: null, shake: 0, nextId: 1,
        };
        setNav(sim.level);
        view = sim;
    }
    function startRun() {
        const seed = (Math.random() * 1e9) | 0;
        rng = mulberry32(seed);
        for (const k in cheats) cheats[k] = false;
        helpOpen = false; cheatsOpen = false; overlayAutoPaused = false;
        pauseStamp = 0; lastSend = performance.now(); pubAcc = 0;
        const n = online ? 2 : 1;
        /* ACAK: siapa jadi survivor mana (owner) + sudut spawn (posisi) */
        const owners = n === 2 ? (rng() < 0.5 ? [0, 1] : [1, 0]) : [0];
        const corners = [0, 1, 2, 3];
        for (let i = corners.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = corners[i]; corners[i] = corners[j]; corners[j] = t; }
        sim.seed = seed; sim.phase = "toss"; sim.paused = false;
        sim.wave = 0; sim.kills = 0; sim.score = 0; sim.time = 0; sim.cheated = false;
        sim.zombies = []; sim.items = []; sim.shots = []; sim.pops = []; sim.rings = [];
        sim.draft = null; sim.spawnQueue = []; sim.over = null; sim.bossId = null; sim.shake = 0;
        sim.players = owners.map((o, s) => makePlayer(s, o, corners[s], s));
        sim.assign = sim.players.map((p) => ({ owner: p.owner, corner: p.corner, color: p.color }));
        /* ACAK: coin toss siapa jalan duluan — player vs horde (bot) */
        const first = rng() < 0.5 ? "survivors" : "horde";
        sim.toss = { first, t: 1.7 };
        sim.banner = { txt: "COIN TOSS", sub: "Who moves first?", t: 1.7, dur: 1.7 };
        assignedToast = true; tossToasted = true;
        const me = myPlayerSim();
        if (me) toast("You are " + PALETTES[me.color].name + " \u00B7 spawn " + PAD_NAMES[me.corner]);
        sfx("click");
        publish();
    }
    function pickType(mix, rnd) {
        let roll = rnd(), acc = 0;
        for (const k in mix) { acc += mix[k]; if (roll <= acc) return k; }
        return "walker";
    }
    function beginWave(n) {
        sim.wave = n;
        const cfg = WAVES[n - 1];
        sim.level = generateLevel((sim.seed ^ (n * 0x9e3779b9)) >>> 0);
        setNav(sim.level);
        sim.zombies = []; sim.items = []; sim.shots = []; sim.spawnQueue = [];
        for (const p of sim.players) {
            const [pc, pr] = PADS[p.corner];
            p.x = pc * CELL + CELL / 2; p.y = pr * CELL + CELL / 2;
            p.inv = 1; p.cd = 0; p.dashT = 0;
            if (!p.alive) { p.alive = true; p.hp = Math.round(p.maxHp * 0.45); toast(p.name + " is back up"); }
            else if (n > 1) p.hp = Math.min(p.maxHp, p.hp + WAVE_HEAL);
        }
        let delay = n === 1 && sim.toss && sim.toss.first === "horde" ? 0.15 : 1.4;
        for (let i = 0; i < cfg.count; i++) {
            sim.spawnQueue.push({ at: delay, type: pickType(cfg.mix, rng), elite: n >= 3 && rng() < 0.12 });
            delay += 0.5 + rng() * 0.55;
        }
        if (cfg.boss) sim.spawnQueue.push({ at: delay + 0.8, type: "boss", elite: false });
        sim.waveT = 0; sim.phase = "fight";
        if (n === 1 && sim.toss) {
            if (sim.toss.first === "survivors") { sim.freezeZ = 2.2; sim.freezeP = 0; }
            else { sim.freezeP = 1.1; sim.freezeZ = 0; }
        }
        sim.banner = {
            txt: "WAVE " + n + (cfg.boss ? " \u00B7 BOSS" : ""),
            sub: n === 1 && sim.toss ? (sim.toss.first === "survivors" ? "You move first \u2014 the horde is frozen" : "Horde moves first \u2014 brace yourself!") : "",
            t: 2.2, dur: 2.2,
        };
        if (n === 1 && sim.toss) toast(sim.toss.first === "survivors" ? "Coin toss: you move first!" : "Coin toss: the horde moves first!");
        sfx("wave");
        publish();
    }
    function spawnZombie(type, elite, atX, atY) {
        const t = ZTYPES[type], cfg = WAVES[Math.max(0, sim.wave - 1)] || WAVES[0];
        let x, y;
        if (atX != null) { x = atX; y = atY; }
        else {
            let tries = 0;
            do {
                const side = (rng() * 4) | 0;
                if (side === 0) { x = 20 + rng() * (W - 40); y = 20; }
                else if (side === 1) { x = W - 20; y = 20 + rng() * (H - 40); }
                else if (side === 2) { x = 20 + rng() * (W - 40); y = H - 20; }
                else { x = 20; y = 20 + rng() * (H - 40); }
                tries++;
            } while (tries < 30 && sim.players.some((p) => p.alive && hyp(p.x - x, p.y - y) < 130));
        }
        const hp = type === "boss" ? BOSS_HP + 70 * (sim.players.length - 1) : Math.round(cfg.hp * t.hpMul * (elite ? 1.7 : 1));
        const z = {
            id: sim.nextId++, type, elite: !!elite, x, y, r: t.r + (elite ? 2 : 0),
            hp, maxHp: hp, spd: (type === "boss" ? 46 : cfg.spd * t.spdMul) * (elite ? 1.08 : 1) * (0.9 + rng() * 0.2),
            dmg: t.dmg + (elite ? 2 : 0), st: "rise", t: 0, dir: 0,
            kx: 0, ky: 0, stun: 0, hitT: 0, atkCd: 0, orbitCd: 0,
            burnT: 0, burnDps: 0, slowT: 0, slowPct: 0,
            didHit: false, chargeHit: false, lastHit: 0,
            stompCd: 5, chargeCd: 8, summonCd: 6, dead: false,
        };
        if (type === "boss" && sim.bossId == null) sim.bossId = z.id;
        sim.zombies.push(z);
        collideWorld(z);
        ring(z.x, z.y, "#a3e635", 4, z.r + 10, 0.4, 2);
    }
    function spawnItem(type, x, y, wkey) {
        const it = { id: sim.nextId++, type, x: x + (rng() - 0.5) * 12, y: y + (rng() - 0.5) * 12, t: 0, r: 8, wkey: wkey || null };
        collideWorld(it);
        sim.items.push(it);
    }
    function dropLoot(z) {
        const p = playerById(z.lastHit) || sim.players[0];
        if (z.type === "boss") {
            spawnItem("nuke", z.x - 20, z.y); spawnItem("medkit", z.x + 20, z.y);
            spawnItem("gem", z.x, z.y - 20); spawnItem("gem", z.x, z.y + 20);
            return;
        }
        const chance = Math.min(0.85, 0.22 + (p ? p.stats.dropBonus : 0)) + (z.elite ? 1 : 0);
        if (rng() >= chance) return;
        if (rng() < 0.3) {
            const key = WEAPON_KEYS[1 + ((rng() * (WEAPON_KEYS.length - 1)) | 0)];
            spawnItem("weapon", z.x, z.y, key);
        } else {
            let tot = 0; for (const it of ITEM_TYPES) tot += it.w;
            let roll = rng() * tot, pick = ITEM_TYPES[0].id;
            for (const it of ITEM_TYPES) { roll -= it.w; if (roll <= 0) { pick = it.id; break; } }
            spawnItem(pick, z.x, z.y);
        }
    }

    /* ---------------- query kecil ---------------- */
    function playerById(id) { return sim.players.find((p) => p.id === id) || null; }
    function myPlayerSim() { return sim ? sim.players.find((p) => p.owner === playerIndex) || null : null; }
    function nearestZombie(x, y, maxD) {
        let bz = null, bd = maxD;
        for (const z of sim.zombies) { if (z.dead) continue; const d = hyp(z.x - x, z.y - y); if (d < bd) { bd = d; bz = z; } }
        return bz;
    }
    function nearestAlivePlayer(x, y) {
        let bp = null, bd = 1e9;
        for (const p of sim.players) { if (!p.alive) continue; const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; bp = p; } }
        return bp;
    }

    /* ---------------- combat ---------------- */
    function hitZombie(z, base, dirx, diry, kb, attacker, opts) {
        if (z.dead) return;
        opts = opts || {};
        let dmg = base * (attacker ? attacker.stats.dmgMul : 1);
        let crit = false;
        if (opts.canCrit && attacker && rng() < attacker.stats.crit) { dmg *= 2; crit = true; }
        if (cheats.onehit) dmg = 99999;
        dmg = Math.max(1, Math.round(dmg));
        z.hp -= dmg; z.hitT = 0.12;
        if (attacker) z.lastHit = attacker.id;
        const km = (attacker ? attacker.stats.kbMul : 1) * ZTYPES[z.type].kbRes;
        z.kx += dirx * kb * km; z.ky += diry * kb * km;
        if (z.type !== "boss") {
            z.stun = Math.max(z.stun, 0.12);
            if (z.st === "windup") { z.st = "chase"; z.atkCd = Math.max(z.atkCd, 0.3); }
        }
        if (opts.proc !== false && attacker) {
            if (attacker.stats.burnDps > 0) { z.burnT = 2; z.burnDps = Math.max(z.burnDps, attacker.stats.burnDps); }
            if (attacker.stats.slow > 0) { z.slowT = 1.2; z.slowPct = Math.max(z.slowPct, attacker.stats.slow); }
        }
        pop(z.x, z.y - z.r - 6, String(dmg) + (crit ? "!" : ""), crit ? "#fb923c" : "#ffffff", crit ? 14 : 11);
        if (z.hp <= 0) killZombie(z, attacker);
    }
    function killZombie(z, attacker) {
        if (z.dead) return;
        z.dead = true;
        const p = attacker || playerById(z.lastHit);
        const mul = p ? p.stats.scoreMul : 1;
        sim.score += Math.round(ZTYPES[z.type].score * (z.elite ? 1.5 : 1) * mul);
        sim.kills++;
        if (p && p.alive && p.stats.vamp > 0) p.hp = Math.min(p.maxHp, p.hp + p.stats.vamp);
        ring(z.x, z.y, "#a3e635", 4, z.r + 14, 0.35, 3);
        if (z.type === "boss") {
            ring(z.x, z.y, "#a78bfa", 10, 90, 0.6, 5);
            sim.shake = Math.max(sim.shake, 0.35);
            if (sim.bossId === z.id) sim.bossId = null;
            sfx("boss"); toast("Boss down!");
        } else sfx("kill");
        dropLoot(z);
        if (p && p.stats.boom > 0) explode(z.x, z.y, p.stats.boom, p.stats.boomR, p);
    }
    function explode(x, y, dmg, r, attacker) {
        ring(x, y, "#fb923c", 8, Math.min(r, 160), 0.4, 4, true);
        for (const z of sim.zombies) {
            if (z.dead) continue;
            const d = hyp(z.x - x, z.y - y);
            if (d < r + z.r) {
                const dd = d || 1;
                hitZombie(z, dmg, (z.x - x) / dd, (z.y - y) / dd, 120, attacker, { canCrit: false, proc: false });
            }
        }
    }
    function damagePlayer(p, dmg, sx, sy, kb) {
        if (!p.alive || p.inv > 0) return;
        if (cheats.god) { if (rng() < 0.3) pop(p.x, p.y - 18, "IMMUNE", "#a3e635", 9); return; }
        if (p.shield > 0) { p.shield--; p.inv = 0.3; pop(p.x, p.y - 18, "BLOCK", "#38bdf8", 10); sfx("click"); return; }
        p.hp -= dmg; p.inv = 0.4;
        sim.shake = Math.max(sim.shake, 0.25);
        pop(p.x, p.y - 18, "-" + dmg, "#f87171", 12);
        ring(p.x, p.y, "#f87171", 4, 20, 0.3, 2.5);
        sfx("hurt");
        const d = hyp(p.x - sx, p.y - sy) || 1;
        p.x += ((p.x - sx) / d) * kb; p.y += ((p.y - sy) / d) * kb;
        collideWorld(p);
        if (p.hp <= 0) {
            if (p.stats.revives > 0) {
                p.skills.wind = (p.skills.wind || 1) - 1;
                p.stats = computeStats(p.skills);
                p.hp = Math.round(p.maxHp * 0.5); p.inv = 2;
                pop(p.x, p.y - 24, "SECOND WIND", "#a3e635", 12);
                ring(p.x, p.y, "#a3e635", 8, 50, 0.5, 3);
                toast(p.name + " got a second wind!");
            } else {
                p.hp = 0; p.alive = false;
                toast(p.name + " is down!");
                if (!sim.players.some((q) => q.alive)) gameOver(false, "The zombies got you.");
            }
        }
    }
    function tryDash(p) {
        if (!sim || !p || !p.alive || p.dashCd > 0 || sim.phase !== "fight" || sim.freezeP > 0) return;
        p.dashCd = p.stats.dashCd; p.dashT = PLAYER_BASE.dashDur;
        p.inv = Math.max(p.inv, 0.22);
        let dx = p.input.mx, dy = p.input.my;
        const d = hyp(dx, dy);
        if (d < 0.01) { dx = Math.cos(p.face); dy = Math.sin(p.face); } else { dx /= d; dy /= d; }
        p.dashDx = dx; p.dashDy = dy;
        sfx("dash");
    }
    function doAttack(p) {
        const w = WEAPONS[p.weapon];
        p.cd = Math.max(0.08, w.cd * p.stats.cdMul);
        p.swingT = w.kind === "melee" ? 0.16 : 0.1;
        if (p.input.aimMode !== "mouse") {
            const tz = nearestZombie(p.x, p.y, w.kind === "melee" ? w.range + p.stats.rangeAdd + 28 : 340);
            if (tz) p.face = Math.atan2(tz.y - p.y, tz.x - p.x);
        }
        if (w.kind === "melee") {
            const range = w.range + p.stats.rangeAdd, half = w.half + p.stats.arcAdd;
            let hit = false;
            for (const z of sim.zombies) {
                if (z.dead) continue;
                if (inSwingArc(p.x, p.y, p.face, z.x, z.y, range + z.r, half)) {
                    const d = hyp(z.x - p.x, z.y - p.y) || 1;
                    hitZombie(z, w.dmg, (z.x - p.x) / d, (z.y - p.y) / d, w.kb, p, { canCrit: true });
                    hit = true;
                }
            }
            if (hit) sfx("hit");
        } else {
            const n = w.pellets || 1;
            for (let i = 0; i < n; i++) {
                const a = p.face + (n > 1 ? (i / (n - 1) - 0.5) * w.spread * 2 : (rng() - 0.5) * w.spread * 2);
                sim.shots.push({
                    id: sim.nextId++, x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
                    vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
                    dmg: w.dmg, pierce: w.pierce || 0, owner: p.id, life: 1.1, hits: [], c: w.color, kb: w.kb, dead: false,
                });
            }
            ring(p.x + Math.cos(p.face) * 20, p.y + Math.sin(p.face) * 20, "#fde68a", 1, 7, 0.12, 2);
            sfx("shot");
            if (!cheats.ammo) {
                p.ammo--;
                if (p.ammo <= 0) { p.weapon = "bat"; p.ammo = 0; toast(p.name + " ran out of ammo \u2014 back to the bat"); }
            }
        }
    }
    function pickupItem(p, it) {
        if (it.type === "weapon") {
            p.weapon = it.wkey; p.ammo = WEAPONS[it.wkey].ammo || 0;
            toast(p.name + " picked up " + WEAPONS[it.wkey].name);
            ring(p.x, p.y, WEAPONS[it.wkey].color, 6, 26, 0.4, 2.5);
        } else if (it.type === "medkit") {
            p.hp = Math.min(p.maxHp, p.hp + 30);
            pop(p.x, p.y - 18, "+30", "#4ade80", 12);
        } else if (it.type === "ammo") {
            const w = WEAPONS[p.weapon];
            if (w.kind === "gun") { p.ammo = Math.min(Math.round((w.ammo || 0) * 1.5), p.ammo + Math.ceil((w.ammo || 0) * 0.5)); pop(p.x, p.y - 18, "+AMMO", "#fbbf24", 10); }
            else { const v = Math.round(15 * p.stats.scoreMul); sim.score += v; pop(p.x, p.y - 18, "+" + v, "#fbbf24", 10); }
        } else if (it.type === "gem") {
            const v = Math.round(40 * p.stats.scoreMul); sim.score += v;
            pop(p.x, p.y - 18, "+" + v, "#22d3ee", 11);
        } else if (it.type === "nuke") {
            explode(it.x, it.y, 140, 9999, p);
            ring(it.x, it.y, "#ef4444", 20, 240, 0.6, 6, true);
            sim.shake = 0.5; toast("NUKE!"); sfx("boss");
        } else if (it.type === "shield") {
            p.shield = Math.min(4, p.shield + 2);
            pop(p.x, p.y - 18, "SHIELD", "#38bdf8", 10);
        } else if (it.type === "coffee") {
            p.coffee = 6;
            pop(p.x, p.y - 18, "SPEED!", "#a16207", 10);
        }
        sfx("pick");
    }

    /* ---------------- draft & flow ---------------- */
    function openDraft() {
        sim.phase = "draft";
        sim.draft = { options: pickDraft(rng), picks: {}, timer: 25 };
        sfx("wave");
        publish();
    }
    function completeDraft() {
        for (const p of sim.players) {
            const id = sim.draft.picks[p.owner];
            if (!id) continue;
            p.skills[id] = (p.skills[id] || 0) + 1;
            p.stats = computeStats(p.skills);
            p.maxHp = p.stats.maxHp;
            if (id === "vital") p.hp = Math.min(p.maxHp, p.hp + 20);
            toast(p.name + ": " + SKILL_BY_ID[id].name + " Lv" + p.skills[id]);
        }
        beginWave(sim.wave + 1);
    }
    function gameOver(win, reason) {
        sim.phase = "over";
        const skills = sim.players.reduce((a, p) => a + Object.values(p.skills).reduce((x, y) => x + y, 0), 0);
        sim.over = { win, reason, score: sim.score, kills: sim.kills, wave: win ? TOTAL_WAVES : sim.wave - 1, skills, cheated: sim.cheated };
        if (!sim.cheated && sim.score > best) {
            best = sim.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
        sim.banner = null;
        sfx(win ? "win" : "lose");
        publish();
    }

    /* ---------------- update (host / solo) ---------------- */
    function updatePlayers(dt) {
        for (const p of sim.players) {
            if (!p.alive) continue;
            p.cd = Math.max(0, p.cd - dt);
            p.dashCd = Math.max(0, p.dashCd - dt);
            p.inv = Math.max(0, p.inv - dt);
            p.swingT = Math.max(0, p.swingT - dt);
            p.coffee = Math.max(0, p.coffee - dt);
            if (p.stats.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
            if (sim.freezeP > 0) continue;
            const inp = p.input;
            let mx = clamp(inp.mx, -1, 1), my = clamp(inp.my, -1, 1);
            const ml = hyp(mx, my);
            if (ml > 1) { mx /= ml; my /= ml; }
            if (p.dashT > 0) {
                p.dashT -= dt;
                const ds = PLAYER_BASE.spd * p.stats.spdMul * 3.2 * dt;
                p.x += p.dashDx * ds; p.y += p.dashDy * ds;
                ring(p.x, p.y, PALETTES[p.color].body, 2, 10, 0.22, 1.5);
            } else if (ml > 0.01) {
                const sp = PLAYER_BASE.spd * p.stats.spdMul * (p.coffee > 0 ? 1.35 : 1);
                p.x += mx * sp * dt; p.y += my * sp * dt;
            }
            collideWorld(p);
            if (inp.aimMode === "mouse" && Number.isFinite(inp.aim)) p.face = inp.aim;
            else if (ml > 0.01) p.face = Math.atan2(my, mx);
            if (inp.atk && p.cd <= 0) doAttack(p);
        }
    }
    function updateZombies(dt) {
        const frozen = sim.freezeZ > 0 || cheats.freeze;
        for (const z of sim.zombies) {
            if (z.dead || frozen) continue;
            z.hitT = Math.max(0, z.hitT - dt);
            z.orbitCd -= dt; z.atkCd -= dt; z.stun -= dt;
            if (z.burnT > 0) {
                z.burnT -= dt; z.hp -= z.burnDps * dt;
                if (z.hp <= 0) { killZombie(z, playerById(z.lastHit)); continue; }
            }
            if (z.slowT > 0) z.slowT -= dt;
            if (Math.abs(z.kx) > 1 || Math.abs(z.ky) > 1) {
                z.x += z.kx * dt; z.y += z.ky * dt;
                const f = Math.exp(-dt * 9); z.kx *= f; z.ky *= f;
                collideWorld(z);
            }
            if (z.stun > 0) continue;
            const tgt = nearestAlivePlayer(z.x, z.y);
            if (!tgt) continue;
            const d = hyp(tgt.x - z.x, tgt.y - z.y);
            const slowMul = z.slowT > 0 ? 1 - z.slowPct : 1;
            if (z.st === "rise") {
                z.t += dt; if (z.t >= 0.5) { z.st = "chase"; z.t = 0; }
            } else if (z.st === "chase") {
                if (z.type === "boss") {
                    z.stompCd -= dt; z.chargeCd -= dt; z.summonCd -= dt;
                    if (z.stompCd <= 0 && d < 170) { z.st = "stompTele"; z.t = 0; z.stompCd = 8 + rng() * 3; continue; }
                    if (z.chargeCd <= 0 && d > 120) { z.st = "chargeTele"; z.t = 0; z.dir = Math.atan2(tgt.y - z.y, tgt.x - z.x); z.chargeCd = 11 + rng() * 4; continue; }
                    if (z.summonCd <= 0 && sim.zombies.length < 16) {
                        z.summonCd = 9;
                        spawnZombie("walker", false, z.x - 30, z.y);
                        spawnZombie("walker", false, z.x + 30, z.y);
                        ring(z.x, z.y, "#a78bfa", 10, 60, 0.5, 3);
                        sfx("boss");
                    }
                }
                if (d < z.r + tgt.r + 13 && z.atkCd <= 0) {
                    z.st = "windup"; z.t = 0; z.dir = Math.atan2(tgt.y - z.y, tgt.x - z.x);
                    continue;
                }
                const dir = steer(z, tgt);
                z.x += dir.x * z.spd * slowMul * dt;
                z.y += dir.y * z.spd * slowMul * dt;
                z.dir = Math.atan2(dir.y, dir.x);
                collideWorld(z);
                for (const p of sim.players) {
                    if (!p.alive) continue;
                    const pd = hyp(z.x - p.x, z.y - p.y), min = z.r + p.r;
                    if (pd < min && pd > 0.01) {
                        z.x = p.x + ((z.x - p.x) / pd) * min;
                        z.y = p.y + ((z.y - p.y) / pd) * min;
                        collideWorld(z);
                    }
                }
            } else if (z.st === "windup") {
                z.t += dt;
                if (z.t >= ZTYPES[z.type].windup) { z.st = "strike"; z.t = 0; z.didHit = false; }
            } else if (z.st === "strike") {
                z.t += dt;
                const ls = (z.type === "boss" ? 340 : 280) * dt;
                z.x += Math.cos(z.dir) * ls; z.y += Math.sin(z.dir) * ls;
                collideWorld(z);
                if (!z.didHit && z.t >= 0.05) {
                    for (const p of sim.players) {
                        if (!p.alive) continue;
                        if (hyp(p.x - z.x, p.y - z.y) < z.r + p.r + 7) {
                            damagePlayer(p, z.dmg, z.x, z.y, 26);
                            if (p.stats.thorns > 0 && !z.dead) {
                                const td = hyp(z.x - p.x, z.y - p.y) || 1;
                                hitZombie(z, p.stats.thorns, (z.x - p.x) / td, (z.y - p.y) / td, 80, p, { canCrit: false, proc: false });
                            }
                        }
                    }
                    z.didHit = true;
                }
                if (z.t >= 0.14) { z.st = "recover"; z.t = 0; z.atkCd = 0.9; }
            } else if (z.st === "recover") {
                z.t += dt; if (z.t >= 0.55) { z.st = "chase"; z.t = 0; }
            } else if (z.st === "stompTele") {
                z.t += dt;
                if (z.t >= 0.8) {
                    for (const p of sim.players) {
                        if (p.alive && hyp(p.x - z.x, p.y - z.y) < 95 + p.r) damagePlayer(p, 25, z.x, z.y, 70);
                    }
                    ring(z.x, z.y, "#ef4444", 20, 95, 0.35, 5, true);
                    sim.shake = 0.4; sfx("boss");
                    z.st = "recover"; z.t = 0;
                }
            } else if (z.st === "chargeTele") {
                z.t += dt;
                if (z.t >= 0.6) { z.st = "charge"; z.t = 0; z.chargeHit = false; }
            } else if (z.st === "charge") {
                z.t += dt;
                const ox = z.x, oy = z.y;
                z.x += Math.cos(z.dir) * 330 * dt; z.y += Math.sin(z.dir) * 330 * dt;
                collideWorld(z);
                if (!z.chargeHit) {
                    for (const p of sim.players) {
                        if (p.alive && hyp(p.x - z.x, p.y - z.y) < z.r + p.r + 4) { damagePlayer(p, 20, z.x, z.y, 50); z.chargeHit = true; }
                    }
                }
                if (z.t >= 0.55 || hyp(z.x - ox, z.y - oy) < 330 * dt * 0.3) { z.st = "recover"; z.t = 0; sim.shake = Math.max(sim.shake, 0.15); }
            }
        }
        /* separasi antar zombie supaya tidak menumpuk */
        for (let i = 0; i < sim.zombies.length; i++) {
            const a = sim.zombies[i];
            if (a.dead) continue;
            for (let j = i + 1; j < sim.zombies.length; j++) {
                const b = sim.zombies[j];
                if (b.dead) continue;
                const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
                if (d2 > 0.01 && d2 < min * min) {
                    const d = Math.sqrt(d2), push = (min - d) / 2, ux = dx / d, uy = dy / d;
                    a.x -= ux * push; a.y -= uy * push;
                    b.x += ux * push; b.y += uy * push;
                    collideWorld(a); collideWorld(b);
                }
            }
        }
    }
    function updateOrbits() {
        for (const p of sim.players) {
            if (!p.alive || p.stats.orbits <= 0) continue;
            const n = p.stats.orbits;
            for (let i = 0; i < n; i++) {
                const a = sim.time * 3.2 + (i * TAU) / n;
                const bx = p.x + Math.cos(a) * 34, by = p.y + Math.sin(a) * 34;
                for (const z of sim.zombies) {
                    if (z.dead || z.orbitCd > 0) continue;
                    if (hyp(z.x - bx, z.y - by) < z.r + 8) {
                        z.orbitCd = 0.4;
                        const d = hyp(z.x - p.x, z.y - p.y) || 1;
                        hitZombie(z, 10, (z.x - p.x) / d, (z.y - p.y) / d, 90, p, { canCrit: false, proc: false });
                    }
                }
            }
        }
    }
    function updateShots(dt) {
        for (const s of sim.shots) {
            if (s.dead) continue;
            s.life -= dt;
            if (s.life <= 0) { s.dead = true; continue; }
            for (let step = 0; step < 2 && !s.dead; step++) {
                s.x += (s.vx * dt) / 2; s.y += (s.vy * dt) / 2;
                if (s.x < 4 || s.x > W - 4 || s.y < 4 || s.y > H - 4) { s.dead = true; break; }
                const c = clamp((s.x / CELL) | 0, 0, COLS - 1), r = clamp((s.y / CELL) | 0, 0, ROWS - 1);
                if (!navOpen[r * COLS + c]) { s.dead = true; ring(s.x, s.y, "#d6d3d1", 1, 6, 0.15, 1.5); break; }
                for (const z of sim.zombies) {
                    if (z.dead || s.hits.indexOf(z.id) >= 0) continue;
                    if (hyp(z.x - s.x, z.y - s.y) < z.r + 4) {
                        s.hits.push(z.id);
                        const vd = hyp(s.vx, s.vy) || 1;
                        hitZombie(z, s.dmg, s.vx / vd, s.vy / vd, s.kb, playerById(s.owner), { canCrit: true });
                        if (s.pierce > 0) s.pierce--; else s.dead = true;
                        break;
                    }
                }
            }
        }
        sim.shots = sim.shots.filter((s) => !s.dead);
    }
    function updateItems(dt) {
        for (const it of sim.items) {
            it.t += dt;
            if (it.t > 22) { it.dead = true; continue; }
            for (const p of sim.players) {
                if (!p.alive) continue;
                const d = hyp(p.x - it.x, p.y - it.y);
                if (d < p.stats.pickup && d > p.r + 11) {
                    const pull = 260 * dt * (1.3 - d / p.stats.pickup);
                    it.x += ((p.x - it.x) / d) * pull; it.y += ((p.y - it.y) / d) * pull;
                }
                if (d < p.r + 11) { pickupItem(p, it); it.dead = true; break; }
            }
        }
        sim.items = sim.items.filter((it) => !it.dead);
    }
    function update(dt) {
        sim.time += dt;
        if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt);
        if (sim.banner) { sim.banner.t -= dt; if (sim.banner.t <= 0) sim.banner = null; }
        ageFx(sim, dt);
        if (sim.phase === "toss") {
            sim.toss.t -= dt;
            if (sim.toss.t <= 0) beginWave(1);
            return;
        }
        if (sim.phase === "draft") {
            sim.draft.timer -= dt;
            if (sim.draft.timer <= 0) {
                for (const p of sim.players) {
                    if (sim.draft.picks[p.owner] == null) sim.draft.picks[p.owner] = sim.draft.options[(rng() * sim.draft.options.length) | 0];
                }
                completeDraft();
            }
            return;
        }
        if (sim.phase !== "fight") return;
        sim.waveT += dt;
        sim.freezeP = Math.max(0, sim.freezeP - dt);
        sim.freezeZ = Math.max(0, sim.freezeZ - dt);
        while (sim.spawnQueue.length && sim.spawnQueue[0].at <= sim.waveT) {
            const s = sim.spawnQueue.shift();
            spawnZombie(s.type, s.elite);
        }
        fieldT -= dt;
        if (fieldT <= 0) { buildField(); fieldT = 0.3; }
        updatePlayers(dt);
        updateZombies(dt);
        if (sim.phase !== "fight") return;
        updateOrbits();
        updateShots(dt);
        updateItems(dt);
        sim.zombies = sim.zombies.filter((z) => !z.dead);
        if (!sim.zombies.length && !sim.spawnQueue.length) {
            sim.score += 100;
            if (sim.wave >= TOTAL_WAVES) gameOver(true, "All five waves cleared. The horde is gone.");
            else openDraft();
        }
    }

    /* ---------------- jaringan (room) ---------------- */
    function snapshot() {
        const s = sim;
        return JSON.parse(JSON.stringify({
            v: 1, phase: s.phase, paused: s.paused, seed: s.seed, wave: s.wave,
            kills: s.kills, score: s.score, time: s.time, cheated: s.cheated,
            banner: s.banner, toss: s.toss, freezeP: s.freezeP, freezeZ: s.freezeZ,
            players: s.players.map((p) => Object.assign({}, p, { input: undefined })),
            zombies: s.zombies, items: s.items, shots: s.shots,
            pops: s.pops, rings: s.rings, draft: s.draft,
            level: { cells: s.level.cells }, assign: s.assign,
            over: s.over, bossId: s.bossId, shake: s.shake,
        }));
    }
    function publish() {
        if (online && room.isHost && sim) {
            try {
                const r = room.publishState(snapshot());
                if (r && r.catch) r.catch(console.warn);
            } catch (e) { console.warn(e); }
        }
    }
    function sendAct(a) {
        try {
            const r = room.sendAction(a);
            if (r && r.catch) r.catch(console.warn);
        } catch (e) { console.warn(e); }
    }
    function submitAction(action) {
        if (online && !room.isHost) { sendAct(action); return; }
        applyAction(action, playerIndex);
    }
    function applyAction(action, actor) {
        if (!sim || !action || typeof action !== "object") return;
        const p = sim.players.find((q) => q.owner === actor) || null;
        if (action.type === "input") {
            if (!p) return;
            const i = action.input || {};
            p.input = {
                mx: clamp(Number(i.mx) || 0, -1, 1),
                my: clamp(Number(i.my) || 0, -1, 1),
                aim: Number.isFinite(+i.aim) ? +i.aim : p.input.aim,
                atk: Boolean(i.atk),
                aimMode: i.aimMode === "mouse" ? "mouse" : "auto",
            };
        } else if (action.type === "dash") {
            if (p) tryDash(p);
        } else if (action.type === "pick") {
            if (sim.phase !== "draft" || !sim.draft) return;
            const id = action.id;
            if (sim.draft.options.indexOf(id) < 0 || sim.draft.picks[actor] != null) return;
            if (!sim.players.some((q) => q.owner === actor)) return;
            sim.draft.picks[actor] = id;
            const owners = sim.players.map((q) => q.owner);
            if (owners.every((o) => sim.draft.picks[o] != null)) completeDraft();
            else publish();
        }
    }
    function applySnapshot(s) {
        if (!s || typeof s !== "object") return;
        const prev = view;
        const merge = (old, next) => {
            const m = new Map((old || []).map((e) => [e.id, e]));
            return (next || []).map((nn) => {
                const o = m.get(nn.id);
                return o ? Object.assign({}, nn, { x: o.x, y: o.y, tx: nn.x, ty: nn.y })
                    : Object.assign({}, nn, { tx: nn.x, ty: nn.y });
            });
        };
        view = Object.assign({}, s, {
            players: merge(prev && prev.players, s.players),
            zombies: merge(prev && prev.zombies, s.zombies),
            items: merge(prev && prev.items, s.items),
            shots: merge(prev && prev.shots, s.shots),
            pops: (s.pops || []).map((p) => Object.assign({}, p)),
            rings: (s.rings || []).map((r) => Object.assign({}, r)),
        });
        if (view.phase === "toss" && (!prev || prev.phase !== "toss")) { assignedToast = false; tossToasted = false; }
        if (view.phase === "menu") { assignedToast = false; tossToasted = false; }
        if (!assignedToast && view.phase !== "menu") {
            assignedToast = true;
            const me = view.players.find((p) => p.owner === playerIndex);
            if (me) toast("You are " + PALETTES[me.color].name + " \u00B7 spawn " + PAD_NAMES[me.corner]);
        }
        if (!tossToasted && view.toss) {
            tossToasted = true;
            toast(view.toss.first === "survivors" ? "Coin toss: survivors move first!" : "Coin toss: the horde moves first!");
        }
    }
    function requestDash() {
        if (hostSide) { if (sim) tryDash(myPlayerSim()); }
        else sendAct({ type: "dash" });
    }
    function syncLocalInput(t) {
        let mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        let my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        const atk = attackHeldMouse || attackHeldKey || attackHeldTouch;
        const src = hostSide ? sim : view;
        const me = src ? src.players.find((p) => p.owner === playerIndex) : null;
        let aim = me ? me.face : -Math.PI / 2, am = aimMode;
        if (am === "mouse" && aimPos && me) aim = Math.atan2(aimPos.y - me.y, aimPos.x - me.x);
        else am = "auto";
        if (hostSide) {
            if (me) me.input = { mx, my, aim, atk, aimMode: am };
        } else if (online) {
            const sig = [mx, my, atk ? 1 : 0, am, Math.round(aim * 20)].join("|");
            if ((sig !== lastInputSig || t - lastSend > 250) && t - lastSend > 80) {
                lastInputSig = sig; lastSend = t;
                sendAct({ type: "input", input: { mx, my, aim, atk, aimMode: am } });
            }
        }
    }

    /* ---------------- render ---------------- */
    const orbEls = new Map();
    function reconcile(list, map, layer, make, upd) {
        const seen = new Set();
        for (const e of list) {
            seen.add(e.id);
            let el = map.get(e.id);
            if (!el) { el = make(e); map.set(e.id, el); layer.appendChild(el); }
            upd(el, e);
        }
        for (const [id, el] of map) {
            if (!seen.has(id)) { el.remove(); map.delete(id); }
        }
    }
    function updZombie(el, z) {
        let sc = 1, op = 1;
        if (z.st === "rise") { const k = clamp(z.t / 0.5, 0, 1); sc = 0.3 + 0.7 * k; op = k; }
        el.setAttribute("transform", "translate(" + z.x.toFixed(1) + " " + z.y.toFixed(1) + ") scale(" + sc.toFixed(2) + ")");
        el.setAttribute("opacity", op.toFixed(2));
        const wob = z.st === "chase" ? Math.sin(curV.time * 7 + z.id) * 4 : 0;
        const lean = z.st === "strike" ? " scale(1.15 0.9)" : "";
        el._rot.setAttribute("transform", "rotate(" + ((z.dir * 180) / Math.PI + wob).toFixed(1) + ")" + lean);
        const tele = z.st === "windup" || z.st === "stompTele" || z.st === "chargeTele";
        el._arms.setAttribute("transform", tele ? "rotate(-16) scale(1.22)" : "");
        el._flash.setAttribute("opacity", z.hitT > 0 ? 0.75 : 0);
        vis(el._bang, tele);
        if (el._bar) {
            const dmgd = z.hp < z.maxHp;
            vis(el._bar, dmgd);
            if (dmgd) el._barF.setAttribute("width", (clamp(z.hp / z.maxHp, 0, 1) * 22).toFixed(1));
        }
        vis(el._burn, z.burnT > 0);
        vis(el._slow, z.slowT > 0);
        if (el._ring) {
            if (z.st === "stompTele") { vis(el._ring, true); el._ring.setAttribute("r", (95 * clamp(z.t / 0.8, 0, 1)).toFixed(1)); }
            else vis(el._ring, false);
            if (z.st === "chargeTele") { vis(el._line, true); el._line.setAttribute("transform", "rotate(" + ((z.dir * 180) / Math.PI).toFixed(1) + ")"); }
            else vis(el._line, false);
        }
    }
    function updPlayer(el, p) {
        const pal = PALETTES[p.color];
        el.setAttribute("transform", "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")");
        el.setAttribute("opacity", p.alive ? (p.inv > 0 ? (0.55 + 0.35 * Math.sin(curV.time * 24)).toFixed(2) : 1) : 0.5);
        el._body.setAttribute("fill", p.alive ? pal.body : "#57534e");
        el._hood.setAttribute("stroke", p.alive ? pal.hood : "#44403c");
        el._eyes.setAttribute("transform", "translate(" + (Math.cos(p.face) * 2).toFixed(1) + " " + (Math.sin(p.face) * 2).toFixed(1) + ")");
        vis(el._down, !p.alive);
        vis(el._eyes, p.alive);
        vis(el._shield, p.shield > 0);
        if (el._wkey !== p.weapon) { el._wkey = p.weapon; buildWeapon(el._wpn, p.weapon); }
        const w = WEAPONS[p.weapon];
        let ang = p.face;
        if (p.swingT > 0 && w.kind === "melee") {
            const half = ((w.half + p.stats.arcAdd) * Math.PI) / 180;
            const k = 1 - p.swingT / 0.16;
            ang = p.face - half + 2 * half * k;
        }
        vis(el._wpn, p.alive);
        el._wpn.setAttribute("transform", "rotate(" + ((ang * 180) / Math.PI).toFixed(1) + ")");
        el._label.textContent = p.owner === playerIndex ? "YOU" : p.name;
    }
    function updItem(el, it) {
        el.setAttribute("transform", "translate(" + it.x.toFixed(1) + " " + (it.y + Math.sin(it.t * 3) * 2.5).toFixed(1) + ")");
        el.setAttribute("opacity", it.t > 19 ? (Math.sin(it.t * 12) > 0 ? 1 : 0.25) : 1);
    }
    function updShot(el, s) {
        el.setAttribute("transform", "translate(" + s.x.toFixed(1) + " " + s.y.toFixed(1) + ") rotate(" + ((Math.atan2(s.vy, s.vx) * 180) / Math.PI).toFixed(1) + ")");
    }
    function updPop(el, p) {
        const k = p.t / 0.6;
        el.setAttribute("x", p.x.toFixed(1));
        el.setAttribute("y", (p.y - 24 * k).toFixed(1));
        el.setAttribute("opacity", (1 - k).toFixed(2));
    }
    function updRing(el, r) {
        const k = r.t / r.dur;
        el.setAttribute("cx", r.x.toFixed(1));
        el.setAttribute("cy", r.y.toFixed(1));
        el.setAttribute("r", (r.r0 + (r.r1 - r.r0) * k).toFixed(1));
        el.setAttribute("opacity", (0.9 * (1 - k)).toFixed(2));
        el.setAttribute("stroke-width", (r.w * (1 - k) + 0.5).toFixed(1));
        if (r.fill) el.setAttribute("fill-opacity", (0.15 * (1 - k)).toFixed(2));
    }
    function updSwing(el, p) {
        const w = WEAPONS[p.weapon];
        const range = w.range + p.stats.rangeAdd;
        const half = ((w.half + p.stats.arcAdd) * Math.PI) / 180;
        const a0 = p.face - half, a1 = p.face + half;
        const x0 = p.x + Math.cos(a0) * range, y0 = p.y + Math.sin(a0) * range;
        const x1 = p.x + Math.cos(a1) * range, y1 = p.y + Math.sin(a1) * range;
        const large = half * 2 > Math.PI ? 1 : 0;
        el.setAttribute("d", "M" + p.x.toFixed(1) + " " + p.y.toFixed(1) + " L" + x0.toFixed(1) + " " + y0.toFixed(1) + " A" + range + " " + range + " 0 " + large + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + " Z");
        el.setAttribute("opacity", ((p.swingT / 0.16) * 0.9).toFixed(2));
    }
    function makeBlade() {
        return mk("path", { d: "M0 -7 L3 0 L0 7 L-3 0 Z", fill: "#e2e8f0", stroke: "#94a3b8", "stroke-width": 1 });
    }
    function updBlade(el, b) {
        el.setAttribute("transform", "translate(" + b.x.toFixed(1) + " " + b.y.toFixed(1) + ") rotate(" + (((b.a * 180) / Math.PI) + 45).toFixed(1) + ")");
    }
    function render(v) {
        curV = v;
        if (!v) { syncOverlays(null); return; }
        const sig = v.level.cells.join(",");
        if (sig !== obstSig) {
            obstSig = sig;
            let h = "";
            for (const i of v.level.cells) {
                const c = i % COLS, r = (i / COLS) | 0;
                h += '<rect x="' + (c * CELL + 3) + '" y="' + (r * CELL + 3) + '" width="' + (CELL - 6) + '" height="' + (CELL - 6) + '" rx="7" fill="#262b24" stroke="#3a4136" stroke-width="1.5"/>';
                h += '<rect x="' + (c * CELL + 7) + '" y="' + (r * CELL + 7) + '" width="' + (CELL - 14) + '" height="4" rx="2" fill="#ffffff08"/>';
            }
            R.obst.innerHTML = h;
        }
        const sh = v.shake > 0 ? v.shake * 14 : 0;
        R.world.setAttribute("transform", sh ? "translate(" + ((Math.random() - 0.5) * sh).toFixed(1) + " " + ((Math.random() - 0.5) * sh).toFixed(1) + ")" : "");
        reconcile(v.zombies, zEls, R.zombies, makeZombieEl, updZombie);
        reconcile(v.players, pEls, R.players, makePlayerEl, updPlayer);
        reconcile(v.items, iEls, R.items, makeItemEl, updItem);
        reconcile(v.shots, sEls, R.shots, makeShotEl, updShot);
        reconcile(v.pops, popEls, R.pops, makePopEl, updPop);
        reconcile(v.rings, ringEls, R.rings, makeRingEl, updRing);
        const swingers = v.players.filter((p) => p.alive && p.swingT > 0 && WEAPONS[p.weapon].kind === "melee");
        reconcile(swingers, swingEls, R.swings, function () {
            return mk("path", { fill: "#fef3c7", "fill-opacity": 0.22, stroke: "#fde68a", "stroke-width": 2.5, "stroke-linecap": "round" });
        }, updSwing);
        const blades = [];
        for (const p of v.players) {
            if (!p.alive || p.stats.orbits <= 0) continue;
            for (let i = 0; i < p.stats.orbits; i++) {
                const a = v.time * 3.2 + (i * TAU) / p.stats.orbits;
                blades.push({ id: p.id + "_" + i, x: p.x + Math.cos(a) * 34, y: p.y + Math.sin(a) * 34, a });
            }
        }
        reconcile(blades, orbEls, R.players, makeBlade, updBlade);
        if (v.banner) {
            const k = clamp(v.banner.t / 0.4, 0, 1);
            R.banner.textContent = v.banner.txt;
            R.banner.setAttribute("opacity", k.toFixed(2));
            R.bannerSub.textContent = v.banner.sub || "";
            R.bannerSub.setAttribute("opacity", k.toFixed(2));
        } else {
            R.banner.setAttribute("opacity", 0);
            R.bannerSub.setAttribute("opacity", 0);
        }
        const me = v.players.find((p) => p.owner === playerIndex);
        if (aimPos && aimMode === "mouse" && me && me.alive && v.phase === "fight") {
            R.aim.setAttribute("cx", aimPos.x.toFixed(1));
            R.aim.setAttribute("cy", aimPos.y.toFixed(1));
            R.aim.setAttribute("opacity", 0.8);
        } else R.aim.setAttribute("opacity", 0);
        const boss = v.bossId != null ? v.zombies.find((z) => z.id === v.bossId) : null;
        if (boss) { vis(R.boss, true); R.bossFill.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1) + "%"; }
        else vis(R.boss, false);
        updateHud(v);
        syncOverlays(v);
    }

    /* ---------------- HUD & overlays ---------------- */
    function updateHud(v) {
        R.wave.textContent = String(v.wave || 1);
        R.kills.textContent = String(v.kills);
        R.score.textContent = String(v.score);
        R.best.textContent = String(best);
        R.seed.textContent = "#" + (v.seed >>> 0).toString(36);
        vis(R.cheatBadge, v.cheated);
        const me = v.players.find((p) => p.owner === playerIndex);
        R.wpn.textContent = me ? WEAPONS[me.weapon].name + (WEAPONS[me.weapon].kind === "gun" ? " \u00B7 " + (cheats.ammo ? "\u221E" : me.ammo) : "") : "\u2014";
        const sig = v.players.map((p) => p.id + ":" + p.color).join(",");
        if (sig !== hpsSig) {
            hpsSig = sig;
            R.hps.innerHTML = v.players.map((p) =>
                '<span class="zs-chip" style="gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:' + PALETTES[p.color].body + ';display:inline-block"></i><span class="zs-hp"><i data-hp="' + p.id + '"></i></span><b data-hpt="' + p.id + '">100</b></span>'
            ).join("");
        }
        for (const p of v.players) {
            const f = R.hps.querySelector('[data-hp="' + p.id + '"]');
            const ratio = clamp(p.hp / p.maxHp, 0, 1);
            if (f) { f.style.width = (ratio * 100).toFixed(0) + "%"; f.style.background = ratio > 0.5 ? "#10b981" : ratio > 0.25 ? "#f59e0b" : "#ef4444"; }
            const tx = R.hps.querySelector('[data-hpt="' + p.id + '"]');
            if (tx) tx.textContent = String(Math.max(0, Math.round(p.hp)));
        }
        if (me) {
            const cool = me.dashCd > 0;
            R.dashBtn.classList.toggle("cool", cool);
            R.dashBtn.textContent = cool ? me.dashCd.toFixed(1) : "DASH";
        }
        let st = "Ready", cls = "";
        if (v.phase === "toss") { st = "Coin toss"; cls = "warn"; }
        else if (v.phase === "fight") { st = v.paused ? "Paused" : "Wave " + v.wave; cls = v.paused ? "warn" : "live"; }
        else if (v.phase === "draft") { st = "Pick a skill"; cls = "live"; }
        else if (v.phase === "over") { st = v.over && v.over.win ? "Victory" : "Defeat"; cls = v.over && v.over.win ? "live" : "bad"; }
        else if (online && !hostSide) { st = "Waiting for host"; }
        R.status.textContent = st;
        R.statusDot.className = "game-status-dot " + cls;
    }
    /* ikon + label diperbarui lewat span, bukan textContent (iconSVG tidak boleh hilang) */
    function setIconBtn(btn, icon, label, title) {
        if (!btn) return;
        if (btn.dataset.icon !== icon) {
            btn.dataset.icon = icon;
            btn.innerHTML = iconSVG(icon, { size: 14 }) + '<span class="zs-btn-label">' + label + '</span>';
        } else {
            const span = btn.querySelector(".zs-btn-label");
            if (span && span.textContent !== label) span.textContent = label;
        }
        btn.setAttribute("aria-label", label);
        if (title) btn.setAttribute("title", title);
    }
    function anyOverlay() { return helpOpen || cheatsOpen; }
    function syncOverlays(v) {
        const phase = v ? v.phase : "wait";
        const blocked = anyOverlay();
        vis(OV.wait, !v && !blocked);
        vis(OV.start, !!v && phase === "menu" && !blocked);
        vis(OV.pause, !!v && v.paused && !blocked && (phase === "fight" || phase === "toss" || phase === "draft"));
        vis(OV.draft, !!v && phase === "draft" && !blocked);
        vis(OV.over, !!v && phase === "over" && !blocked);
        vis(OV.help, helpOpen);
        vis(OV.cheats, cheatsOpen && hostSide);
        vis(R.startBtn, hostSide);
        vis(R.cheatBtn, hostSide);
        vis(R.pauseBtn, hostSide);
        vis(R.restartBtn, hostSide);
        vis(R.resumeBtn, hostSide);
        vis(R.againBtn, hostSide);
        if (!v) {
            R.status.textContent = "Connecting";
            R.statusDot.className = "game-status-dot warn";
            return;
        }
        const hostName = roomData && roomData.players && roomData.players[0] && roomData.players[0].name;
        R.startNote.textContent = hostSide
            ? "Coin toss decides who moves first \u00B7 spawn corners are randomized."
            : "Waiting for " + (hostName || "the host") + " to start the run\u2026";
        R.pauseSub.textContent = hostSide ? "Game paused. Press P or tap Resume." : "The host paused the game.";
        setIconBtn(R.pauseBtn, v.paused ? "play" : "pause", v.paused ? "Resume" : "Pause", v.paused ? "Resume (P)" : "Pause (P)");
        if (phase === "draft" && v.draft) {
            const sig = v.draft.options.join(",") + "|" + JSON.stringify(v.draft.picks) + "|" + v.wave;
            if (sig !== draftSig) {
                draftSig = sig;
                const me = v.players.find((p) => p.owner === playerIndex);
                const myPick = v.draft.picks[playerIndex];
                R.draftCards.innerHTML = v.draft.options.map((id, i) => {
                    const s = SKILL_BY_ID[id];
                    const lv = me ? (me.skills[id] || 0) : 0;
                    const picked = myPick === id;
                    const dim = myPick != null && !picked;
                    return '<button type="button" class="zs-skill' + (picked ? " picked" : "") + (dim ? " dim" : "") + '" data-pick="' + id + '">' +
                        '<div class="ic">' + s.icon + '</div>' +
                        '<div class="rar" style="color:' + RARITY[s.rarity].c + '">' + RARITY[s.rarity].label + '</div>' +
                        '<h4>' + s.name + '</h4><p>' + s.desc + '</p>' +
                        '<span class="lv">' + (lv ? "Lv " + lv + " \u2192 " + (lv + 1) : "New") + ' \u00B7 key ' + (i + 1) + '</span></button>';
                }).join("");
            }
            const owners = v.players.map((p) => p.owner);
            const done = owners.filter((o) => v.draft.picks[o] != null).length;
            R.draftWait.textContent = v.players.length > 1 && done < owners.length ? "Picked " + done + "/" + owners.length + " \u2014 waiting for partner\u2026" : "";
            R.draftSub.textContent = "Wave " + v.wave + " cleared! Every skill stacks \u2014 no limits. Auto-pick in " + Math.max(0, Math.ceil(v.draft.timer)) + "s.";
        }
        if (phase === "over" && v.over) {
            R.ovTitle.textContent = v.over.win ? "You win!" : "Game over";
            R.ovTitle.style.color = v.over.win ? "#65a30d" : "#dc2626";
            R.ovSub.textContent = v.over.reason;
            R.ovStats.innerHTML = [
                ["Score", v.over.score], ["Best", best], ["Kills", v.over.kills],
                ["Waves", v.over.wave + "/" + TOTAL_WAVES], ["Skills", v.over.skills], ["Mode", online ? "Co-op" : "Solo"],
            ].map((kv) => '<div class="zs-stat"><b>' + kv[1] + '</b><span>' + kv[0] + '</span></div>').join("");
            R.ovCheat.textContent = v.over.cheated ? "Cheats were used \u2014 score not saved to best." : "";
            R.ovWait.textContent = hostSide ? "" : "Waiting for host to restart\u2026";
        }
    }

    /* ---------------- panel, cheat, pause ---------------- */
    const CHEAT_TOGGLES = [["god", "God mode"], ["onehit", "One-hit kills"], ["ammo", "Infinite ammo"], ["slowmo", "Slow motion \u00D70.5"], ["freeze", "Freeze zombies"]];
    const CHEAT_ACTIONS = [["heal", "Full heal (team)"], ["score", "+500 score"], ["skip", "Clear current wave"], ["boss", "Spawn boss"], ["weapon", "Cycle weapon"], ["skill", "+1 random skill"], ["level", "Reroll layout"]];
    function buildCheatGrid() {
        R.cheatGrid.innerHTML =
            CHEAT_TOGGLES.map((ct) => '<div class="zs-cheat-item"><span>' + ct[1] + '</span><button type="button" class="zs-tgl" data-cheat-t="' + ct[0] + '">OFF</button></div>').join("") +
            CHEAT_ACTIONS.map((ca) => '<button type="button" class="zs-mini" data-cheat-a="' + ca[0] + '">' + ca[1] + '</button>').join("");
    }
    function syncCheatGrid() {
        for (const b of R.cheatGrid.querySelectorAll("[data-cheat-t]")) {
            const on = cheats[b.dataset.cheatT];
            b.classList.toggle("on", on);
            b.textContent = on ? "ON" : "OFF";
        }
    }
    function markCheated() {
        if (sim && !sim.cheated) { sim.cheated = true; toast("Cheats enabled \u2014 best score disabled"); }
    }
    function cheatAction(id) {
        if (!sim || sim.phase === "menu" || sim.phase === "over") { toast("Start a run first"); return; }
        markCheated();
        const me = myPlayerSim();
        if (id === "heal") { for (const p of sim.players) if (p.alive) p.hp = p.maxHp; toast("Team healed"); }
        else if (id === "score") { sim.score += 500; toast("+500 score"); }
        else if (id === "skip") {
            if (sim.phase !== "fight") { toast("Only during a wave"); return; }
            sim.spawnQueue.length = 0;
            for (const z of sim.zombies.slice()) killZombie(z, me);
            toast("Wave cleared");
        }
        else if (id === "boss") {
            if (sim.phase !== "fight") { toast("Only during a wave"); return; }
            if (sim.bossId != null) toast("Boss already active");
            else { spawnZombie("boss", false); toast("Boss spawned"); }
        }
        else if (id === "weapon") {
            if (me) {
                const i = (WEAPON_KEYS.indexOf(me.weapon) + 1) % WEAPON_KEYS.length;
                me.weapon = WEAPON_KEYS[i]; me.ammo = WEAPONS[me.weapon].ammo || 0;
                toast("Weapon: " + WEAPONS[me.weapon].name);
            }
        }
        else if (id === "skill") {
            if (me) {
                const s = SKILLS[(Math.random() * SKILLS.length) | 0];
                me.skills[s.id] = (me.skills[s.id] || 0) + 1;
                me.stats = computeStats(me.skills);
                me.maxHp = me.stats.maxHp;
                if (s.id === "vital") me.hp = Math.min(me.maxHp, me.hp + 20);
                toast(s.name + " Lv" + me.skills[s.id]);
            }
        }
        else if (id === "level") {
            sim.level = generateLevel((Math.random() * 1e9) | 0);
            setNav(sim.level);
            for (const p of sim.players) collideWorld(p);
            for (const z of sim.zombies) collideWorld(z);
            toast("Layout rerolled");
        }
        sfx("click");
        publish();
    }
    /* Pause: tik/timer/bot berhenti; penanda waktu di-geser saat resume. */
    function setPaused(on) {
        if (!hostSide || !sim || sim.paused === on) return;
        if (on) {
            pauseStamp = performance.now();
            sim.paused = true;
        } else {
            if (pauseStamp) {
                const d = performance.now() - pauseStamp;
                lastSend += d; pubAcc = 0; pauseStamp = 0;
            }
            sim.paused = false;
            overlayAutoPaused = false;
        }
        publish();
    }
    function syncOverlayPause() {
        if (!hostSide || !sim) return;
        const live = sim.phase === "fight" || sim.phase === "toss" || sim.phase === "draft";
        if (anyOverlay() && !sim.paused && live) { setPaused(true); overlayAutoPaused = true; }
        else if (!anyOverlay() && overlayAutoPaused) setPaused(false);
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncOverlayPause();
        sfx("click");
        render(view);
    }
    function toggleCheats(on) {
        if (!hostSide) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        if (cheatsOpen) syncCheatGrid();
        syncOverlayPause();
        sfx("click");
        render(view);
    }
    function closeOverlays() {
        if (helpOpen) toggleHelp(false);
        else if (cheatsOpen) toggleCheats(false);
    }
    function togglePause() {
        if (anyOverlay()) { closeOverlays(); return; }
        if (!hostSide || !sim) return;
        if (sim.phase !== "fight" && sim.phase !== "toss" && sim.phase !== "draft") return;
        setPaused(!sim.paused);
    }

    /* ---------------- input ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) { if (hostSide) { closeOverlays(); startRun(); } return; }
        const pick = t.closest("[data-pick]");
        if (pick) { submitAction({ type: "pick", id: pick.dataset.pick }); return; }
        const ct = t.closest("[data-cheat-t]");
        if (ct && hostSide) {
            const id = ct.dataset.cheatT;
            cheats[id] = !cheats[id];
            if (cheats[id]) markCheated();
            syncCheatGrid(); sfx("click");
            return;
        }
        const ca = t.closest("[data-cheat-a]");
        if (ca && hostSide) { cheatAction(ca.dataset.cheatA); return; }
        const act = t.closest("[data-act]");
        if (!act) return;
        const a = act.dataset.act;
        if (a === "start") { if (hostSide) startRun(); }
        else if (a === "resume") { if (hostSide && sim) setPaused(false); }
        else if (a === "help") toggleHelp(true);
        else if (a === "cheats") toggleCheats();
        else if (a === "closepanel") closeOverlays();
        else if (a === "mute") {
            muted = !muted;
            setIconBtn(R.sndBtn, muted ? "volumeX" : "volume", muted ? "Muted" : "Sound", "Sound");
        }
        else if (a === "touch") { root.querySelector(".zs").classList.toggle("touch"); }
    }
    function boardPos(e) {
        const svg = R.board;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = svg.getScreenCTM();
        if (!m) return null;
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    }
    function onKeyDown(e) {
        if (!mounted) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const c = e.code;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(c) >= 0) e.preventDefault();
        /* prioritas: help -> cheats -> pause / Escape -> aksi game */
        if (c === "KeyH") { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!e.repeat && hostSide && !helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") { if (!e.repeat) togglePause(); e.preventDefault(); return; }
        if (anyOverlay()) return;
        if (c === "KeyR") { if (!e.repeat && hostSide) startRun(); e.preventDefault(); return; }
        if (c === "ArrowUp" || c === "KeyW") keys.up = true;
        else if (c === "ArrowDown" || c === "KeyS") keys.down = true;
        else if (c === "ArrowLeft" || c === "KeyA") keys.left = true;
        else if (c === "ArrowRight" || c === "KeyD") keys.right = true;
        else if (c === "Space") attackHeldKey = true;
        else if (c === "ShiftLeft" || c === "ShiftRight") { if (!e.repeat) requestDash(); }
        else if (c === "Enter") { if (!e.repeat && hostSide && sim && (sim.phase === "menu" || sim.phase === "over")) startRun(); }
        else if (c === "Digit1" || c === "Digit2" || c === "Digit3") {
            if (view && view.phase === "draft" && view.draft) {
                const id = view.draft.options[Number(c.slice(5)) - 1];
                if (id) submitAction({ type: "pick", id });
            }
        }
    }
    function onKeyUp(e) {
        const c = e.code;
        if (c === "ArrowUp" || c === "KeyW") keys.up = false;
        else if (c === "ArrowDown" || c === "KeyS") keys.down = false;
        else if (c === "ArrowLeft" || c === "KeyA") keys.left = false;
        else if (c === "ArrowRight" || c === "KeyD") keys.right = false;
        else if (c === "Space") attackHeldKey = false;
    }
    function onBlur() {
        keys.up = keys.down = keys.left = keys.right = false;
        attackHeldMouse = attackHeldKey = attackHeldTouch = false;
    }
    function onVis() {
        if (document.hidden && hostSide && sim && !sim.paused && (sim.phase === "fight" || sim.phase === "toss")) {
            setPaused(true);
        }
    }
    function onBoardMove(e) {
        if (e.pointerType === "mouse") { aimPos = boardPos(e); aimMode = "mouse"; }
    }
    function onBoardDown(e) {
        if (e.pointerType !== "mouse") return;
        e.preventDefault();
        if (e.button === 2) requestDash();
        else attackHeldMouse = true;
    }
    function onBoardLeave() { aimPos = null; }
    function onWinPointerUp() { attackHeldMouse = false; }
    function onCtx(e) { e.preventDefault(); }
    function onPadDown(e) {
        const b = e.target.closest("button[data-dir]");
        if (!b) return;
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
        padPointers.set(e.pointerId, b.dataset.dir);
        keys[b.dataset.dir] = true;
    }
    function onPadUp(e) {
        const dir = padPointers.get(e.pointerId);
        if (dir) { keys[dir] = false; padPointers.delete(e.pointerId); }
    }
    function onHitDown(e) {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
        attackHeldTouch = true;
    }
    function onHitUp() { attackHeldTouch = false; }
    function onDashDown(e) { e.preventDefault(); requestDash(); }
    function ageToasts(dt) {
        if (!toastList.length) {
            if (toastSig !== "") { toastSig = ""; R.toasts.innerHTML = ""; }
            return;
        }
        for (const t of toastList) t.t -= dt;
        toastList = toastList.filter((t) => t.t > 0);
        const sig = toastList.map((t) => t.txt).join("|");
        if (sig !== toastSig) {
            toastSig = sig;
            R.toasts.innerHTML = toastList.map((t) => '<div class="zs-toast">' + t.txt + "</div>").join("");
        }
    }

    /* ---------------- loop ---------------- */
    function tick(t) {
        if (!mounted) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;
        const frozen = anyOverlay() || (hostSide && !!sim && sim.paused);
        if (!frozen) syncLocalInput(t);
        if (hostSide && sim) {
            if (!frozen && (sim.phase === "toss" || sim.phase === "fight" || sim.phase === "draft")) {
                update(dt * (cheats.slowmo ? 0.5 : 1));
            }
            if (online) {
                pubAcc += dt;
                if (pubAcc >= 0.25 && sim.phase !== "menu") { pubAcc = 0; publish(); }
            }
            render(sim);
        } else {
            if (view && !frozen) {
                const k = 1 - Math.exp(-dt * 12);
                for (const list of [view.players, view.zombies, view.items, view.shots]) {
                    for (const e of list) {
                        if (e.tx != null) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
                    }
                }
                view.time += dt;
                ageFx(view, dt);
                if (view.banner) { view.banner.t -= dt; if (view.banner.t <= 0) view.banner = null; }
                if (view.shake > 0) view.shake = Math.max(0, view.shake - dt);
            }
            render(view);
        }
        if (!frozen) ageToasts(dt);
    }

    /* ---------------- init ---------------- */
    function buildDots() {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            mk("circle", { cx: c * CELL + CELL / 2, cy: r * CELL + CELL / 2, r: 1.3, fill: "#ffffff06" }, R.dots);
        }
    }
    buildDots();
    buildCheatGrid();
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerup", onWinPointerUp);
    R.board.addEventListener("pointermove", onBoardMove);
    R.board.addEventListener("pointerdown", onBoardDown);
    R.board.addEventListener("pointerleave", onBoardLeave);
    R.board.parentNode.addEventListener("contextmenu", onCtx);
    R.pad.addEventListener("pointerdown", onPadDown);
    R.pad.addEventListener("pointerup", onPadUp);
    R.pad.addEventListener("pointercancel", onPadUp);
    R.pad.addEventListener("lostpointercapture", onPadUp);
    R.hitBtn.addEventListener("pointerdown", onHitDown);
    R.hitBtn.addEventListener("pointerup", onHitUp);
    R.hitBtn.addEventListener("pointercancel", onHitUp);
    R.hitBtn.addEventListener("lostpointercapture", onHitUp);
    R.dashBtn.addEventListener("pointerdown", onDashDown);
    if (online) {
        if (room.isHost) {
            resetSim();
            if (room.onRoom) subs.push(room.onRoom((nr) => { roomData = nr; }));
            if (room.onAction) subs.push(room.onAction((a) => applyAction(a, 1)));
            publish();
        } else {
            if (room.onRoom) subs.push(room.onRoom((nr) => { roomData = nr; }));
            if (room.onState) subs.push(room.onState((s) => applySnapshot(s)));
        }
    } else {
        resetSim();
    }
    render(view);
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            mounted = false;
            if (raf) cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("pointerup", onWinPointerUp);
            for (const u of subs) { if (typeof u === "function") { try { u(); } catch (e) { } } }
            try { if (audio) audio.close(); } catch (e) { }
            root.innerHTML = "";
        },
    };
}