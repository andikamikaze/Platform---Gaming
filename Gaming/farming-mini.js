/* ==== GAME: farming-mini.js ==== */
/* ================================================================== */
/* Farming Mini - open-world farming 2D top-down (terinspirasi Stardew    */
/* Valley). Pemain berkeliling farm: olah tanah, tanam, siram, panen,  */
/* jual di bin. Lawan: bot (mode AI) atau pemain lain (mode room).     */
/* Mengikuti template: export META + export mount(root, context).      */
/* Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs */
/* ================================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "farming-mini", // harus sama dengan nama file (tanpa .js)
    name: "Farming Mini",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Jelajahi pertanian open-world 2D: olah tanah, tanam, siram, panen, lalu jual di bin sebelum musim berakhir.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 40h32"/><path d="M24 40V26"/><path d="M24 26c-7 0-11-4-11-10 7 0 11 4 11 10z"/><path d="M24 22c7 0 11-4 11-10-7 0-11 4-11 10z"/></svg>',
    bg: ["#dcfce7", "#16a34a"],
    bestKey: "openFarmBest",
};

/* ---------------- konstanta & aturan murni (tanpa DOM) ---------------- */
const W = 40, H = 30;                 // ukuran dunia (tile)
const SEASON_MS = 240000;             // panjang musim
const TARGET = 250;                   // koin untuk menang
const START_MONEY = 20;
const CAN_MAX = 6;                    // kapasitas teko air
const WITHER_MS = 4000;               // tenggang kering sebelum layu
const FREEZE_MS = 2500;               // jeda pemain yang kalah undian jalan duluan
const SIM_MS = 100;                   // langkah simulasi tetap
const BOT_THINK_MS = 420;
const PUBLISH_MS = 300;               // throttle publish state (host)
const USE_REACH = 1.85;               // jangkauan pakai alat (tile)
const SELL_REACH = 1.9;
const SPEED_PLAYER = 4.3;             // tile / detik
const SPEED_BOT = 3.7;
const SLOT_COLOR = ["#3b82f6", "#ef4444"];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SOLID = "TRWHB";                // T pohon, R batu, W air, H rumah, B bin
const CROPS = {
    carrot: { name: "Wortel", cost: 5, growMs: 10000, sell: 12, waterMs: 12000, color: "#f97316" },
    tomato: { name: "Tomat", cost: 10, growMs: 20000, sell: 28, waterMs: 8000, color: "#ef4444" },
    pumpkin: { name: "Labu", cost: 18, growMs: 32000, sell: 55, waterMs: 7000, color: "#f59e0b" },
};
const CROP_IDS = ["carrot", "tomato", "pumpkin"];
const TOOL_IDS = ["hoe", "seed", "can", "hand"];
const CHEAT_IDS = ["coins", "grow", "time", "win", "water", "speed", "freeze"];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function inB(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

function mulberry32(a) {
    let s = a >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------------- generator dunia acak + bukti bisa diselesaikan ---------------- */
function buildWorld(seed) {
    const rnd = mulberry32(seed);
    const ir = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const g = new Array(W * H).fill("G");
    const at = (x, y) => g[y * W + x];
    const set = (x, y, c) => { g[y * W + x] = c; };
    for (let x = 0; x < W; x++) { set(x, 0, "T"); set(x, H - 1, "T"); }
    for (let y = 0; y < H; y++) { set(0, y, "T"); set(W - 1, y, "T"); }
    for (let i = 0; i < 26; i++) { const x = ir(2, W - 3), y = ir(2, H - 3); set(x, y, rnd() < 0.6 ? "T" : "R"); }
    for (let i = 0; i < 30; i++) { const x = ir(2, W - 3), y = ir(2, H - 3); if (at(x, y) === "G") set(x, y, "F"); }
    const left = rnd() < 0.5;
    const cx = left ? 7 + ir(-2, 2) : W - 8 + ir(-2, 2);
    const cy = H - 9 + ir(-3, 3);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 2 && x < W - 2 && y >= 2 && y < H - 2 && dx * dx + dy * dy <= 6.76 * (0.75 + rnd() * 0.5)) set(x, y, "W");
    }
    const hx = 17 + ir(-2, 2), hy = 4 + ir(0, 2);
    const fx0 = Math.max(2, hx - 8), fx1 = Math.min(W - 3, hx + 9);
    const fy0 = Math.max(2, hy + 3), fy1 = Math.min(H - 3, hy + 13);
    for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
        const c = at(x, y); if (c === "T" || c === "R" || c === "W") set(x, y, "G");
    }
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(hx + dx, hy + dy, "H");
    const bx = Math.min(Math.max(hx + ir(-3, 4), fx0 + 1), fx1 - 1);
    const by = hy + 7 + ir(0, 2);
    set(bx, by, "B");
    for (let y = hy + 2; y <= by; y++) for (let k = 0; k < 2; k++) {
        const x = hx + k, c = at(x, y); if (c === "G" || c === "F") set(x, y, "D");
    }
    for (let x = Math.min(hx, bx); x <= Math.max(hx + 1, bx); x++) {
        const c = at(x, by + 1); if (c === "G" || c === "F") set(x, by + 1, "D");
    }
    const sa = [hx - 3, hy + 4], sb = [hx + 5, hy + 4];
    for (let s = 0; s < 2; s++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = (s ? sb : sa)[0] + dx, y = (s ? sb : sa)[1] + dy;
        if (x >= 1 && x < W - 1 && y >= 1 && y < H - 1 && at(x, y) !== "H" && at(x, y) !== "B") set(x, y, "G");
    }
    return { g: g, sa: sa, sb: sb, bin: [bx, by], house: [hx, hy] };
}

function validateWorld(b) {
    const g = b.g;
    const seen = new Uint8Array(W * H);
    const q = [b.sa[1] * W + b.sa[0]];
    seen[q[0]] = 1;
    let qi = 0, till = 0, pond = 0, waterAdj = false, binAdj = false;
    while (qi < q.length) {
        const cur = q[qi++]; const x = cur % W, y = (cur / W) | 0;
        const c = g[cur];
        if (c === "G" || c === "F") till++;
        for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (!inB(nx, ny)) continue;
            const ni = ny * W + nx, nc = g[ni];
            if (nc === "W") waterAdj = true;
            if (nc === "B") binAdj = true;
            if (!seen[ni] && SOLID.indexOf(nc) < 0) { seen[ni] = 1; q.push(ni); }
        }
    }
    for (let i = 0; i < W * H; i++) if (g[i] === "W") pond++;
    if (!seen[b.sb[1] * W + b.sb[0]]) return false;
    return pond >= 6 && waterAdj && binAdj && till >= 60;
}

function fallbackWorld() {
    const g = new Array(W * H).fill("G");
    for (let x = 0; x < W; x++) { g[x] = "T"; g[(H - 1) * W + x] = "T"; }
    for (let y = 0; y < H; y++) { g[y * W] = "T"; g[y * W + W - 1] = "T"; }
    for (let y = H - 9; y <= H - 6; y++) for (let x = 5; x <= 8; x++) g[y * W + x] = "W";
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[(5 + dy) * W + 18 + dx] = "H";
    g[12 * W + 20] = "B";
    for (let y = 7; y <= 13; y++) { g[y * W + 18] = "D"; g[y * W + 19] = "D"; }
    return { g: g, sa: [15, 9], sb: [23, 9], bin: [20, 12], house: [18, 5] };
}

/* Dunia acak selalu diverifikasi: spawn terhubung, kolam & bin terjangkau,
   cukup lahan garap. Jika 50 percobaan gagal, pakai layout fallback pasti valid. */
function generateWorld(seed) {
    for (let attempt = 1; attempt <= 50; attempt++) {
        const used = (seed * 7919 + attempt * 104729) >>> 0;
        const b = buildWorld(used);
        if (validateWorld(b)) {
            return { tiles: b.g.join(""), sa: b.sa, sb: b.sb, bin: b.bin, house: b.house, ok: true, attempts: attempt, used: used };
        }
    }
    const b = fallbackWorld();
    return { tiles: b.g.join(""), sa: b.sa, sb: b.sb, bin: b.bin, house: b.house, ok: true, attempts: 51, used: seed >>> 0 };
}

/* Bukti ekonomi: strategi wortel sempurna (9 petak, overhead jalan 8 dtk/siklus)
   mencapai target jauh sebelum musim habis -> dunia selalu bisa dimenangkan. */
function economySolvable() {
    const c = CROPS.carrot;
    let money = START_MONEY, t = 0;
    while (t <= SEASON_MS && money < TARGET) {
        const n = Math.min(9, Math.floor(money / c.cost));
        if (n <= 0) break;
        money += n * (c.sell - c.cost);
        t += c.growMs + 8000;
    }
    return { ok: money >= TARGET && t <= SEASON_MS * 0.8, money: money, ms: t };
}

/* Tanaman hanya tumbuh saat basah; kering WITHER_MS -> layu. Murni. */
function advanceCrop(pl, dt) {
    if (!pl || pl.st !== "planted") return pl;
    const c = CROPS[pl.crop];
    const water = pl.water - dt;
    if (water <= 0) {
        const dry = (pl.dry || 0) + dt;
        if (dry >= WITHER_MS) return { crop: pl.crop, owner: pl.owner, st: "withered", water: 0, growth: pl.growth, dry: dry };
        return { crop: pl.crop, owner: pl.owner, st: "planted", water: 0, growth: pl.growth, dry: dry };
    }
    const growth = pl.growth + dt;
    if (growth >= c.growMs) return { crop: pl.crop, owner: pl.owner, st: "ripe", water: water, growth: c.growMs, dry: 0 };
    return { crop: pl.crop, owner: pl.owner, st: "planted", water: water, growth: growth, dry: 0 };
}

function cropStage(pl) {
    if (!pl) return 0;
    if (pl.st === "ripe") return 3;
    if (pl.st === "withered") return -1;
    const g = CROPS[pl.crop].growMs;
    if (pl.growth >= g * 0.55) return 2;
    if (pl.growth >= g * 0.25) return 1;
    return 0;
}

function bfsPath(tiles, sx, sy, gx, gy) {
    if (!inB(sx, sy) || !inB(gx, gy)) return null;
    if (sx === gx && sy === gy) return [];
    const start = sy * W + sx, goal = gy * W + gx;
    if (SOLID.indexOf(tiles[goal]) >= 0) return null;
    const prev = new Int32Array(W * H).fill(-1);
    prev[start] = start;
    const q = [start];
    let qi = 0;
    while (qi < q.length) {
        const cur = q[qi++];
        if (cur === goal) break;
        const x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (!inB(nx, ny)) continue;
            const ni = ny * W + nx;
            if (prev[ni] !== -1 || SOLID.indexOf(tiles[ni]) >= 0) continue;
            prev[ni] = cur; q.push(ni);
        }
    }
    if (prev[goal] === -1) return null;
    const path = [];
    let cur = goal;
    while (cur !== start) { path.push([cur % W, (cur / W) | 0]); cur = prev[cur]; }
    path.reverse();
    return path;
}

/* ==================================================================== */
/* mount                                                                 */
/* ==================================================================== */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const authority = !online || Boolean(room.isHost); // host / offline = pemegang state kanonik
    let roomData = room ? room.room || null : null;
    let state = null;

    /* Slot pemain tidak lagi selalu host=0: diacak host tiap match (state.slotOfHost). */
    function localSlot() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.slotOfHost : 1 - state.slotOfHost;
    }
    function cheatOwner() { return online ? (state ? state.slotOfHost : 0) : 0; }
    function canCheat() { return authority; }
    function canStart() { return authority; }

    const ECON = economySolvable();
    const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = (typeof window !== "undefined") && ("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0);

    function sanitizeName(v) { const s = String(v || "").trim().slice(0, 14); return s || "Player"; }
    function esc(v) { return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function randSeed() { return (Math.random() * 4294967296) >>> 0; }
    function readBest() { try { const v = Number(localStorage.getItem(META.bestKey)); return isFinite(v) && v > 0 ? v : 0; } catch (e) { return 0; } }
    function writeBest(v) { try { localStorage.setItem(META.bestKey, String(v)); } catch (e) { } }
    let best = readBest();

    /* ---------------- state ---------------- */
    function mkPlayer(sp, name) {
        return { x: sp[0] + 0.5, y: sp[1] + 0.5, dir: [0, 1], money: START_MONEY, inv: { carrot: 0, tomato: 0, pumpkin: 0 }, can: CAN_MAX, frozen: 0, name: name };
    }
    function newMatch(seed, names, slotOfHost) {
        const w = generateWorld(seed);
        return {
            v: 1, seed: seed, tiles: w.tiles, spawnA: w.sa, spawnB: w.sb, bin: w.bin, house: w.house,
            worldAttempts: w.attempts, phase: "ready", remain: SEASON_MS, elapsed: 0,
            slotOfHost: slotOfHost, firstMover: 0,
            players: [mkPlayer(w.sa, names[0]), mkPlayer(w.sb, names[1])],
            plots: {}, cheats: { water: false, speed: false, freeze: false }, cheated: false,
            announce: { id: 0, text: "" }, result: null,
        };
    }
    function startMatch() {
        const names = state ? [state.players[0].name, state.players[1].name] : [sanitizeName(playerName), online ? "Pemain 2" : "Farmbot"];
        const slotOfHost = online ? (Math.random() < 0.5 ? 0 : 1) : 0; // undian posisi player
        state = newMatch(randSeed(), names, slotOfHost);
        state.phase = "play";
        state.firstMover = Math.random() < 0.5 ? 0 : 1;               // undian jalan duluan
        state.players[1 - state.firstMover].frozen = FREEZE_MS;
        state.announce = { id: 1, text: "Undian: " + names[state.firstMover] + " jalan duluan!" };
        inputs = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
        botGoal = null; botPath = []; botClock = 0;
        botRng = mulberry32((state.seed ^ 0x9E3779B9) >>> 0);
        particles = []; pred = null; frozenLocal = 0;
        disp[0].init = false; disp[1].init = false;
        publish(true);
    }

    /* ---------------- DOM ---------------- */
    const ICONS = {
        hoe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L15 9"/><path d="M14 4l6 6-2.5 2.5-6-6z"/></svg>',
        seed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l2 5v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9z"/><path d="M9 4c0 2.5 6 2.5 6 0"/><circle cx="12" cy="14" r="1.3"/></svg>',
        can: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10h9v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M15 13l4.5-5"/><path d="M8 10V8a3 3 0 0 1 6 0v2"/></svg>',
        hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h14l-1.5 8a2 2 0 0 1-2 1.7H8.5a2 2 0 0 1-2-1.7z"/><path d="M8 11l3-6M16 11l-3-6"/></svg>',
    };
    const sec = (ms) => Math.round(ms / 1000);

    /* Bantuan internal ditampilkan sekali per browser (lihat GAMES_WITH_INTERNAL_HELP). */
    let helpOpen = false, cheatsOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("openFarmHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("openFarmHelpSeen", "1"); } catch (_) { /* storage diblokir */ }
    }

    root.innerHTML = `
<style>
.ofa{--ink:#243041;--mut:#7b8794;--line:#e7e3da;--card:#fff;--accent:#16a34a;display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.ofa *{box-sizing:border-box}
.ofa [hidden]{display:none!important}
.ofa-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.ofa-chip{display:inline-flex;align-items:center;gap:6px;background:#ffffffe6;border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.ofa-chip b{font-weight:800;font-variant-numeric:tabular-nums}
.ofa-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}
.ofa-spacer{flex:1 1 auto}
.ofa-tools{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ofa-btn,.ofa-tool,.ofa-seedchip{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:7px 10px;min-height:34px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer}
.ofa-btn:hover,.ofa-tool:hover,.ofa-seedchip:hover{border-color:#c9c4b8}
.ofa-btn:focus-visible,.ofa-tool:focus-visible,.ofa-seedchip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ofa-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.ofa-btn.primary:hover{background:#15803d}
.ofa-btn:disabled{opacity:.5;cursor:default}
.ofa-icon-btn svg{flex:none;display:block}
.ofa-tool{position:relative}
.ofa-tool.sel{border-color:var(--accent);color:var(--accent);background:#f0fdf4}
.ofa-tool svg{width:18px;height:18px}
.ofa-tool em{position:absolute;top:1px;right:3px;font-style:normal;font-size:8px;color:var(--mut);font-weight:700}
.ofa-seedchip i{width:10px;height:10px;border-radius:50%;flex:none}
.ofa-board{position:relative;width:100%;aspect-ratio:4/3;flex:1 1 auto;min-height:0;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#abd094;user-select:none;-webkit-user-select:none}
.ofa canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
.ofa-toast{position:absolute;top:48px;left:50%;transform:translateX(-50%);background:#243041f0;color:#fff;border-radius:999px;padding:8px 14px;font-size:12.5px;font-weight:600;pointer-events:none;transition:opacity .2s;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;z-index:4}
.ofa-hint{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:#ffffffe6;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--mut);pointer-events:none;z-index:2;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
.ofa-touch{display:none;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;user-select:none;-webkit-user-select:none}
.ofa-stick{position:relative;width:104px;height:104px;border-radius:50%;background:#ffffffb0;border:1px solid var(--line);touch-action:none}
.ofa-stick i{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:#fff;border:1px solid var(--line);box-shadow:0 2px 6px #00000014;pointer-events:none}
.ofa-use{width:68px;height:68px;border-radius:50%;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:800;font-size:12px;letter-spacing:.5px;box-shadow:0 3px 10px #16a34a55;touch-action:none;cursor:pointer}
.ofa-use:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.ofa-use:active{transform:scale(.94)}
.ofa.ofa-mobile .ofa-touch{display:flex}
.ofa-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#f7f5f0d9;backdrop-filter:blur(3px);z-index:5;padding:14px;overflow:auto}
.ofa-card{display:flex;flex-direction:column;overflow:hidden;max-height:100%;width:min(520px,100%);margin:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;box-shadow:0 4px 16px #24304114}
.ofa-card.wide{width:min(640px,100%)}
.ofa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.ofa-head h3{margin:0;font-size:19px}
.ofa-tag{font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 9px}
.ofa-body,.ofa-cheats,.ofa-help{flex:1 1 auto;min-height:0;overflow:auto}
.ofa-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;flex:none;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
.ofa-card p{margin:8px 0;font-size:13px;color:#4b5563;line-height:1.5}
.ofa-card .small{font-size:11.5px;color:var(--mut)}
.ofa-card h4{margin:12px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut)}
.ofa-card ul{margin:4px 0;padding-left:18px;font-size:12.5px;color:#4b5563;line-height:1.65}
.ofa-note{font-size:11px;color:var(--mut);margin-right:auto}
.ofa-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
.ofa-table th,.ofa-table td{padding:4px 6px;border-bottom:1px solid var(--line);text-align:left}
.ofa-cheats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.ofa-cheat{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:10px 12px;font-size:12.5px;font-weight:700;cursor:pointer;text-align:left;color:var(--ink);min-height:44px}
.ofa-cheat:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ofa-cheat span{display:block;font-size:10.5px;color:var(--mut);font-weight:600;margin-top:2px}
.ofa-cheat.on{border-color:var(--accent);background:#f0fdf4}
.ofa-win{color:var(--accent)}
.ofa-lose{color:#ef4444}
@media (prefers-reduced-motion:reduce){.ofa *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (LAST: mengalahkan pointer:coarse) --- */
.ofa.game-fill > .ofa-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.ofa.game-fill > .ofa-board:not(:has(.ofa-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto}
.ofa.game-fill > .ofa-board:has(.ofa-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.ofa .ofa-hud{gap:5px;margin-bottom:8px}
.ofa .ofa-hud .ofa-chip{padding:4px 6px;font-size:9px}
.ofa .ofa-hud .hud-target,.ofa .ofa-hud .hud-status,.ofa .ofa-hud .hud-score,.ofa .ofa-hud .hud-inv{display:none}
.ofa .ofa-hud .ofa-btn,.ofa .ofa-hud .ofa-tool{min-height:32px;min-width:0;padding:5px 8px;font-size:9px}
.ofa .ofa-hud .ofa-btn-label,.ofa .ofa-hud .ofa-tool-label,.ofa .ofa-hud .ofa-spacer{display:none}
.ofa .ofa-hud .ofa-tool em{display:none}
.ofa .ofa-hud .ofa-seedchip{min-height:32px;height:32px;padding:0 6px;font-size:9px}
.ofa .ofa-ov{padding:8px}
.ofa .ofa-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.ofa .ofa-body,.ofa .ofa-cheats,.ofa .ofa-help{scrollbar-width:none}
.ofa .ofa-body::-webkit-scrollbar,.ofa .ofa-cheats::-webkit-scrollbar,.ofa .ofa-help::-webkit-scrollbar{display:none}
.ofa .ofa-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.ofa .ofa-note{display:none}
.ofa .ofa-table{font-size:10px}
}
</style>
<div class="game-app ofa game-fill" data-app>
  <div class="ofa-hud">
    <span class="ofa-chip"><i class="ofa-dot" style="background:#f59e0b"></i>KOIN <b data-hud="money">${START_MONEY}</b></span>
    <span class="ofa-chip hud-target">TARGET <b>${TARGET}</b></span>
    <span class="ofa-chip">WAKTU <b data-hud="time">${sec(SEASON_MS)}</b>&nbsp;dtk</span>
    <span class="ofa-chip"><i class="ofa-dot" style="background:#38bdf8"></i>AIR <b data-hud="can">${CAN_MAX}</b>/${CAN_MAX}</span>
    <span class="ofa-chip hud-inv" data-hud="inv" hidden></span>
    <span class="ofa-chip hud-score" data-hud="score"></span>
    <span class="ofa-chip hud-status"><i class="ofa-dot" data-statusdot></i><span data-status>Siap</span></span>
    <span class="ofa-spacer"></span>
    <span class="ofa-tools">
      <button class="ofa-tool" type="button" data-tool="hoe" title="Cangkul (1)" aria-label="Cangkul">${ICONS.hoe}<span class="ofa-tool-label">Cangkul</span><em>1</em></button>
      <button class="ofa-tool" type="button" data-tool="seed" title="Benih (2)" aria-label="Benih">${ICONS.seed}<span class="ofa-tool-label">Benih</span><em>2</em></button>
      <button class="ofa-tool" type="button" data-tool="can" title="Air (3)" aria-label="Air">${ICONS.can}<span class="ofa-tool-label">Air</span><em>3</em></button>
      <button class="ofa-tool" type="button" data-tool="hand" title="Panen (4)" aria-label="Panen">${ICONS.hand}<span class="ofa-tool-label">Panen</span><em>4</em></button>
      <button class="ofa-seedchip" type="button" data-act="seedcycle" title="Ganti benih (Tab/Q)" aria-label="Ganti benih"><i data-seeddot></i><span data-seedlabel></span></button>
    </span>
    <button class="ofa-btn ofa-icon-btn" type="button" data-help aria-label="Cara bermain" title="Cara bermain (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ofa-btn-label">Bantuan</span></button>
    <button class="ofa-btn ofa-icon-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="ofa-btn-label">Cheat</span></button>
    <button class="ofa-btn ofa-icon-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P)"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="ofa-btn-label">Jeda</span></button>
    <button class="ofa-btn ofa-icon-btn" type="button" data-restart aria-label="Dunia baru" title="Dunia baru (R)">${iconSVG("refresh", { size: 14 })}<span class="ofa-btn-label">Baru</span></button>
    <button class="ofa-btn ofa-icon-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">${iconSVG("logOut", { size: 14 })}<span class="ofa-btn-label">Keluar</span></button>
  </div>
  <section class="game-panel ofa-board" data-board>
    <canvas data-canvas aria-label="Dunia Farming Mini"></canvas>
    <div class="ofa-toast" data-toast hidden></div>
    <div class="ofa-hint" data-hint hidden></div>
    <div class="ofa-ov" data-ov="ready">
      <div class="ofa-card">
        <div class="ofa-head"><h3>Farming Mini</h3><span class="ofa-tag">SIMULASI</span></div>
        <div class="ofa-body">
          <p>Kelilingi farm, olah tanah, tanam, siram, panen &mdash; lalu jual di bin kayu. Raih <b>${TARGET} koin</b> sebelum musim <b>${sec(SEASON_MS)} detik</b> habis. Lawanmu berlomba ke target yang sama.</p>
          <p class="small" data-world>Dunia acak &middot; terverifikasi bisa dimenangkan</p>
          <p class="small" data-best></p>
        </div>
        <div class="ofa-foot"><span class="ofa-note">H: bantuan &middot; C: cheat &middot; P: jeda</span><button class="ofa-btn primary" type="button" data-act="start" data-startbtn data-label="Mulai">Mulai</button></div>
      </div>
    </div>
    <div class="ofa-ov" data-ov="over" hidden>
      <div class="ofa-card">
        <div class="ofa-head"><h3 data-over-title>Selesai</h3></div>
        <div class="ofa-body">
          <p data-over-reason></p>
          <p class="small" data-over-score></p>
          <p class="small" data-best2></p>
        </div>
        <div class="ofa-foot"><span class="ofa-note"></span><button class="ofa-btn primary" type="button" data-act="start" data-startbtn data-label="Main lagi &middot; dunia baru">Main lagi &middot; dunia baru</button><button class="ofa-btn" type="button" data-exit>Keluar</button></div>
      </div>
    </div>
    <div class="ofa-ov" data-ov="pause" hidden>
      <div class="ofa-card">
        <div class="ofa-head"><h3>Dijeda</h3></div>
        <div class="ofa-body"><p>Waktu musim, pergerakan, dan Farmbot dihentikan sementara.</p></div>
        <div class="ofa-foot"><span class="ofa-note">P / Esc untuk lanjut</span><button class="ofa-btn primary" type="button" data-resume>Lanjut</button></div>
      </div>
    </div>
    <div class="ofa-ov" data-ov="help" hidden>
      <div class="ofa-card wide" role="dialog" aria-label="Cara bermain">
        <div class="ofa-head"><h3>Cara bermain</h3><button class="ofa-btn" type="button" data-help-close aria-label="Tutup">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ofa-help">
          <div>
            <h4>Tujuan</h4>
            <ul>
              <li>Raih ${TARGET} koin sebelum musim ${sec(SEASON_MS)} detik berakhir. Panen masuk tas &mdash; jual semuanya di <b>bin kayu</b> dekat rumah.</li>
              <li>Tanaman hanya tumbuh saat tanah basah. Kering ${sec(WITHER_MS)} detik = layu. Isi ulang teko di <b>kolam</b>.</li>
              <li>Undian koin menentukan siapa jalan duluan; posisi Player 1/2 juga diacak tiap main.</li>
            </ul>
            <h4>Desktop (keyboard &amp; mouse)</h4>
            <ul>
              <li>WASD / panah: jalan &middot; klik petak: pakai alat &middot; E / Spasi: pakai alat di depan.</li>
              <li>1&ndash;4: pilih alat &middot; Tab / Q: ganti benih &middot; Enter: mulai.</li>
              <li>H: bantuan &middot; C: cheat &middot; P: jeda &middot; R: dunia baru &middot; Esc: tutup panel.</li>
            </ul>
            <h4>Mobile (sentuh)</h4>
            <ul>
              <li>Stik kiri: jalan &middot; tombol AKSI: pakai alat di depan &middot; ketuk petak: pakai alat di situ.</li>
              <li>Ikon alat &amp; pemilih benih ada di bar atas.</li>
            </ul>
          </div>
          <div>
            <h4>Alat</h4>
            <ul>
              <li><b>Cangkul</b>: rumput jadi petak olah (dan membersihkan tanaman layu).</li>
              <li><b>Benih</b>: tanam di petak kosong (koin dipotong otomatis).</li>
              <li><b>Air</b>: sirami tanaman; pakai di kolam untuk isi ulang (${CAN_MAX} siraman).</li>
              <li><b>Panen</b>: petik tanaman matang; dekat bin otomatis menjual isi tas.</li>
            </ul>
            <h4>Tanaman</h4>
            <table class="ofa-table">
              <tr><th>Tanaman</th><th>Beli</th><th>Tumbuh</th><th>Jual</th><th>Air tahan</th></tr>
              <tr><td>Wortel</td><td>5</td><td>10 dtk</td><td>12</td><td>12 dtk</td></tr>
              <tr><td>Tomat</td><td>10</td><td>20 dtk</td><td>28</td><td>8 dtk</td></tr>
              <tr><td>Labu</td><td>18</td><td>32 dtk</td><td>55</td><td>7 dtk</td></tr>
            </table>
            <p class="small">Dunia dibuat acak tiap main dan selalu diverifikasi bisa dimenangkan (jalur ke kolam &amp; bin terjamin, lahan cukup, simulasi ekonomi lolos).</p>
          </div>
        </div>
        <div class="ofa-foot"><span class="ofa-note">Tekan H untuk membuka lagi</span><button class="ofa-btn primary" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>
    <div class="ofa-ov" data-ov="cheats" hidden>
      <div class="ofa-card wide" role="dialog" aria-label="Cheat">
        <div class="ofa-head"><h3>Cheat</h3><button class="ofa-btn" type="button" data-cheats-close aria-label="Tutup">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ofa-cheats">
          <button class="ofa-cheat" type="button" data-cheat="coins">+100 koin<span>Tambah saldo</span></button>
          <button class="ofa-cheat" type="button" data-cheat="grow">Matang instan<span>Semua tanamanmu langsung matang</span></button>
          <button class="ofa-cheat" type="button" data-cheat="time">+30 detik<span>Perpanjang musim</span></button>
          <button class="ofa-cheat" type="button" data-cheat="win">Menang instan<span>Saldo langsung mencapai target</span></button>
          <button class="ofa-cheat" type="button" data-cheat="water">Air tak terbatas<span data-cstate="water">Mati</span></button>
          <button class="ofa-cheat" type="button" data-cheat="speed">Lari cepat<span data-cstate="speed">Mati</span></button>
          <button class="ofa-cheat" type="button" data-cheat="freeze">Bekukan waktu<span data-cstate="freeze">Mati</span></button>
        </div>
        <div class="ofa-foot"><span class="ofa-note" data-cheatnote>Mempermudah permainan. Permainan ditandai cheat &mdash; rekor tidak dicatat.</span><button class="ofa-btn primary" type="button" data-cheats-close>Selesai</button></div>
      </div>
    </div>
  </section>
  <div class="ofa-touch">
    <div class="ofa-stick" data-stick aria-label="Stik gerak"><i data-knob></i></div>
    <button class="ofa-use" type="button" data-usebtn aria-label="Aksi">AKSI</button>
  </div>
</div>`;

    const q = (s) => root.querySelector(s);
    const qa = (s) => root.querySelectorAll(s);
    const appEl = q("[data-app]");
    const panelEl = q("[data-board]");
    const canvas = q("[data-canvas]");
    const ctx = canvas.getContext("2d");
    const hudMoney = q('[data-hud="money"]'), hudTime = q('[data-hud="time"]'), hudCan = q('[data-hud="can"]'), hudInv = q('[data-hud="inv"]'), hudScore = q('[data-hud="score"]');
    const statusEl = q("[data-status]"), statusDot = q("[data-statusdot]");
    const toastEl = q("[data-toast]"), hintEl = q("[data-hint]");
    const ovReady = q('[data-ov="ready"]'), ovOver = q('[data-ov="over"]'), ovPause = q('[data-ov="pause"]'), ovHelp = q('[data-ov="help"]'), ovCheats = q('[data-ov="cheats"]');
    const pauseBtn = q("[data-pause]"), pauseLabel = pauseBtn.querySelector(".ofa-btn-label"), pauseIcon = q("[data-pause-icon]");
    const cheatsBtn = q("[data-cheats]"), restartBtn = q("[data-restart]");
    const overTitle = q("[data-over-title]"), overReason = q("[data-over-reason]"), overScore = q("[data-over-score]");
    const worldEl = q("[data-world]"), bestEl = q("[data-best]"), bestEl2 = q("[data-best2]");
    const seedDot = q("[data-seeddot]"), seedLabel = q("[data-seedlabel]");
    const stickEl = q("[data-stick]"), knobEl = q("[data-knob]"), useBtn = q("[data-usebtn]");
    const cheatNote = q("[data-cheatnote]");
    if (isTouch) appEl.classList.add("ofa-mobile");

    /* ---------------- variabel runtime ---------------- */
    let destroyed = false;
    let raf = 0, lastT = 0, acc = 0, lastHud = 0, lastPub = 0;
    let inputs = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    let keys = Object.create(null);
    let stick = { x: 0, y: 0, id: null };
    let lastSentInput = { x: 0, y: 0 };
    let tool = "hoe", seedSel = "carrot";
    let hoverTile = null;
    let particles = [];
    let disp = [{ x: 0, y: 0, init: false }, { x: 0, y: 0, init: false }];
    let pred = null, frozenLocal = 0;
    let lastAnnounceKey = "", toastTimer = 0, toastDue = 0, freezeAt = 0;
    let botGoal = null, botPath = [], botClock = 0, botRng = Math.random;
    let cw = 300, ch = 300, dpr = 1;
    const cam = { x: 0, y: 0, ts: 36 };
    const unsubs = [];

    /* ---------------- util state ---------------- */
    function tileCh(x, y) { return inB(x, y) ? state.tiles[y * W + x] : "T"; }
    function setTile(i, c) { state.tiles = state.tiles.slice(0, i) + c + state.tiles.slice(i + 1); }
    function invTotal(p) { return p.inv.carrot + p.inv.tomato + p.inv.pumpkin; }
    function speedFor(slot) {
        const base = (!online && slot === 1) ? SPEED_BOT : SPEED_PLAYER;
        return base * (state.cheats.speed && slot === cheatOwner() ? 1.55 : 1);
    }
    function collides(x, y) {
        const r = 0.3;
        const xs = [x - r, x + r], ys = [y - r, y + r];
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
            const tx = Math.floor(xs[a]), ty = Math.floor(ys[b]);
            if (!inB(tx, ty) || SOLID.indexOf(tileCh(tx, ty)) >= 0) return true;
        }
        return false;
    }
    function moveEntity(ent, inp, dt, speed) {
        let dx = inp.x, dy = inp.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.05) return;
        if (len > 1) { dx /= len; dy /= len; }
        if (ent.dir) {
            if (Math.abs(dx) >= Math.abs(dy)) ent.dir = [dx > 0 ? 1 : -1, 0];
            else ent.dir = [0, dy > 0 ? 1 : -1];
        }
        const sp = speed * dt / 1000;
        const nx = ent.x + dx * sp;
        if (!collides(nx, ent.y)) ent.x = nx;
        const ny = ent.y + dy * sp;
        if (!collides(ent.x, ny)) ent.y = ny;
        ent.x = clamp(ent.x, 1.35, W - 1.35);
        ent.y = clamp(ent.y, 1.35, H - 1.35);
    }

    /* ---------------- aksi permainan (divalidasi, host-authoritative) ---------------- */
    function doSell(slot) {
        const p = state.players[slot];
        let sum = 0;
        for (let i = 0; i < CROP_IDS.length; i++) { const id = CROP_IDS[i]; sum += p.inv[id] * CROPS[id].sell; p.inv[id] = 0; }
        p.money += sum;
        checkTarget(slot);
        return { ok: true, msg: "+" + sum + " koin", sold: sum };
    }
    function checkTarget(slot) {
        if (state.phase === "play" && state.players[slot].money >= TARGET) endMatch(slot, "target");
    }
    function doUse(slot, toolId, seedId, tx, ty) {
        if (!state || state.phase !== "play") return { ok: false, msg: "" };
        const p = state.players[slot];
        if (p.frozen > 0) return { ok: false, msg: "Menunggu undian jalan duluan..." };
        const bd = Math.hypot(p.x - (state.bin[0] + 0.5), p.y - (state.bin[1] + 0.5));
        if (bd <= SELL_REACH && invTotal(p) > 0) return doSell(slot);
        if (tx == null || !inB(tx, ty)) return { ok: false, msg: "" };
        const d = Math.hypot(p.x - (tx + 0.5), p.y - (ty + 0.5));
        if (d > USE_REACH) return { ok: false, msg: "Terlalu jauh" };
        if (Math.abs(tx + 0.5 - p.x) >= Math.abs(ty + 0.5 - p.y)) p.dir = [tx + 0.5 > p.x ? 1 : -1, 0];
        else p.dir = [0, ty + 0.5 > p.y ? 1 : -1];
        const i = ty * W + tx, ch = state.tiles[i], pl = state.plots[i];
        if (toolId === "hoe") {
            if (ch === "G" || ch === "F") { setTile(i, "S"); return { ok: true, msg: "Tanah diolah", fx: "till" }; }
            if (ch === "S" && pl && pl.st === "withered" && pl.owner === slot) { delete state.plots[i]; return { ok: true, msg: "Tanaman layu dibersihkan", fx: "clear" }; }
            if (ch === "S" && !pl) { setTile(i, "G"); return { ok: true, msg: "" }; }
            return { ok: false, msg: "Tidak bisa diolah di sini" };
        }
        if (toolId === "seed") {
            if (ch !== "S") return { ok: false, msg: "Olah tanah dulu dengan cangkul" };
            if (pl) return { ok: false, msg: "Petak sudah terisi" };
            const c = CROPS[seedId];
            if (!c) return { ok: false, msg: "" };
            if (p.money < c.cost) return { ok: false, msg: "Koin tidak cukup" };
            p.money -= c.cost;
            state.plots[i] = { crop: seedId, owner: slot, st: "planted", water: Math.round(c.waterMs / 2), growth: 0, dry: 0 };
            return { ok: true, msg: "Ditanam: " + c.name, fx: "plant" };
        }
        if (toolId === "can") {
            if (ch === "W") { p.can = CAN_MAX; return { ok: true, msg: "Teko diisi ulang", fx: "refill" }; }
            if (ch === "S" && pl && pl.st === "planted") {
                if (pl.owner !== slot) return { ok: false, msg: "Tanaman milik pemain lain" };
                const god = state.cheats.water && slot === cheatOwner();
                if (p.can <= 0 && !god) return { ok: false, msg: "Air habis - isi di kolam" };
                pl.water = CROPS[pl.crop].waterMs; pl.dry = 0;
                if (!god) p.can--;
                return { ok: true, msg: "Disiram", fx: "water" };
            }
            return { ok: false, msg: "Siram petak yang sudah ditanami" };
        }
        if (toolId === "hand") {
            if (!pl) return { ok: false, msg: "Belum ada yang bisa dipanen" };
            if (pl.owner !== slot) return { ok: false, msg: "Tanaman milik pemain lain" };
            if (pl.st === "ripe") { p.inv[pl.crop]++; delete state.plots[i]; return { ok: true, msg: "+1 " + CROPS[pl.crop].name, fx: "harvest", crop: pl.crop }; }
            if (pl.st === "withered") { delete state.plots[i]; return { ok: true, msg: "Dibersihkan", fx: "clear" }; }
            return { ok: false, msg: "Belum matang" };
        }
        return { ok: false, msg: "" };
    }
    function applyCheat(slot, id) {
        if (!state || CHEAT_IDS.indexOf(id) < 0) return;
        state.cheated = true;
        const p = state.players[slot];
        if (id === "coins") { p.money += 100; checkTarget(slot); }
        else if (id === "grow") {
            for (const k in state.plots) {
                const pl = state.plots[k];
                if (pl.owner === slot && pl.st === "planted") { pl.st = "ripe"; pl.growth = CROPS[pl.crop].growMs; pl.water = CROPS[pl.crop].waterMs; pl.dry = 0; }
            }
        }
        else if (id === "time") state.remain = Math.min(SEASON_MS, state.remain + 30000);
        else if (id === "win") { p.money = Math.max(p.money, TARGET); if (state.phase === "play") endMatch(slot, "cheat"); }
        else if (id === "water") { state.cheats.water = !state.cheats.water; if (state.cheats.water) p.can = CAN_MAX; }
        else if (id === "speed") state.cheats.speed = !state.cheats.speed;
        else if (id === "freeze") state.cheats.freeze = !state.cheats.freeze;
    }
    function endMatch(winner, reason) {
        if (!state || state.phase === "over") return;
        state.phase = "over";
        state.result = { winner: winner, reason: reason };
        if (!online && winner === 0 && reason !== "cheat" && !state.cheated) {
            const s = Math.max(1, Math.ceil(state.elapsed / 1000));
            if (!best || s < best) { best = s; writeBest(best); }
        }
        publish(true);
    }
    function seasonEnd() {
        const m0 = state.players[0].money, m1 = state.players[1].money;
        endMatch(m0 === m1 ? -1 : (m0 > m1 ? 0 : 1), "season");
    }

    /* ---------------- simulasi (host / offline) ---------------- */
    function simStep(dt) {
        if (!state || state.phase !== "play") return;
        for (let i = 0; i < 2; i++) state.players[i].frozen = Math.max(0, state.players[i].frozen - dt);
        inputs[localSlot()] = readLocalInput();
        if (!online) {
            botClock += dt;
            if (botClock >= BOT_THINK_MS) { botClock = 0; botThink(); }
            inputs[1] = botMove();
        }
        for (let i = 0; i < 2; i++) {
            const p = state.players[i];
            if (p.frozen <= 0) moveEntity(p, inputs[i], dt, speedFor(i));
        }
        for (const k in state.plots) state.plots[k] = advanceCrop(state.plots[k], dt);
        if (!state.cheats.freeze) { state.remain -= dt; state.elapsed += dt; }
        if (state.remain <= 0) { state.remain = 0; seasonEnd(); return; }
        publish(false);
    }

    /* ---------------- bot petani (mode AI) ---------------- */
    function nearestIdx(list, me) {
        let bi = list[0], bd = Infinity;
        for (let n = 0; n < list.length; n++) {
            const i = list[n], x = i % W + 0.5, y = ((i / W) | 0) + 0.5;
            const d = (x - me.x) * (x - me.x) + (y - me.y) * (y - me.y);
            if (d < bd) { bd = d; bi = i; }
        }
        return bi;
    }
    function approach(me, tx, ty) {
        const opts = [];
        for (let d = 0; d < 4; d++) {
            const nx = tx + DIRS[d][0], ny = ty + DIRS[d][1];
            if (inB(nx, ny) && SOLID.indexOf(tileCh(nx, ny)) < 0) opts.push([nx, ny]);
        }
        opts.sort((a, b) => (Math.hypot(a[0] + 0.5 - me.x, a[1] + 0.5 - me.y) - Math.hypot(b[0] + 0.5 - me.x, b[1] + 0.5 - me.y)));
        for (let n = 0; n < opts.length; n++) {
            const p = bfsPath(state.tiles, Math.floor(me.x), Math.floor(me.y), opts[n][0], opts[n][1]);
            if (p) return { stand: opts[n], path: p };
        }
        return null;
    }
    function botThink() {
        const me = state.players[1];
        if (me.frozen > 0 || botGoal) return;
        const mine = [];
        for (const k in state.plots) if (state.plots[k].owner === 1) mine.push(+k);
        const ripe = mine.filter((i) => state.plots[i].st === "ripe");
        const dry = mine.filter((i) => state.plots[i].st === "planted" && state.plots[i].water <= 1500);
        const thirsty = mine.filter((i) => state.plots[i].st === "planted" && state.plots[i].water < CROPS[state.plots[i].crop].waterMs * 0.35);
        const inv = invTotal(me);
        let goal = null;
        if (me.can <= 0 && mine.length) goal = { kind: "refill" };
        else if (ripe.length) goal = { kind: "harvest", i: nearestIdx(ripe, me) };
        else if (dry.length && me.can > 0) goal = { kind: "water", i: nearestIdx(dry, me) };
        else if (inv >= 3 || (inv > 0 && me.money < 5)) goal = { kind: "sell" };
        else if (me.money >= 5) {
            const seedId = me.money >= 18 && botRng() < 0.25 ? "pumpkin" : (me.money >= 10 && botRng() < 0.5 ? "tomato" : "carrot");
            const empty = [];
            for (let i = 0; i < W * H; i++) if (state.tiles[i] === "S" && !state.plots[i] && i % W >= state.house[0] + 2) empty.push(i);
            if (empty.length) goal = { kind: "plant", i: nearestIdx(empty, me), seed: seedId };
            else {
                const spots = [];
                for (let i = 0; i < W * H; i++) {
                    const c = state.tiles[i];
                    if ((c === "G" || c === "F") && i % W >= state.house[0] + 2 && Math.abs(i % W - me.x) + Math.abs(((i / W) | 0) - me.y) < 14) spots.push(i);
                }
                if (spots.length) goal = { kind: "till", i: nearestIdx(spots, me) };
            }
        }
        if (!goal && thirsty.length && me.can > 0) goal = { kind: "water", i: nearestIdx(thirsty, me) };
        if (!goal) return;
        if (goal.kind === "refill") {
            let bestA = null;
            for (let i = 0; i < W * H; i++) {
                if (state.tiles[i] !== "W") continue;
                const a = approach(me, i % W, (i / W) | 0);
                if (a && (!bestA || a.path.length < bestA.path.length)) bestA = { stand: a.stand, path: a.path, act: [i % W, (i / W) | 0] };
            }
            if (!bestA) return;
            botGoal = { kind: "refill", stand: bestA.stand, act: bestA.act };
            botPath = bestA.path;
            return;
        }
        if (goal.kind === "sell") {
            const a = approach(me, state.bin[0], state.bin[1]);
            if (!a) return;
            botGoal = { kind: "sell", stand: a.stand };
            botPath = a.path;
            return;
        }
        const tx = goal.i % W, ty = (goal.i / W) | 0;
        const p = bfsPath(state.tiles, Math.floor(me.x), Math.floor(me.y), tx, ty);
        if (!p) return;
        goal.stand = [tx, ty];
        botGoal = goal;
        botPath = p;
    }
    function botMove() {
        const me = state.players[1];
        if (!botGoal || me.frozen > 0) return { x: 0, y: 0 };
        const g = botGoal;
        let valid = true;
        if (g.kind === "harvest") valid = state.plots[g.i] && state.plots[g.i].owner === 1 && state.plots[g.i].st === "ripe";
        else if (g.kind === "water") valid = state.plots[g.i] && state.plots[g.i].owner === 1 && state.plots[g.i].st === "planted" && me.can > 0;
        else if (g.kind === "plant") valid = state.tiles[g.i] === "S" && !state.plots[g.i] && me.money >= CROPS[g.seed].cost;
        else if (g.kind === "till") valid = state.tiles[g.i] === "G" || state.tiles[g.i] === "F";
        else if (g.kind === "sell") valid = invTotal(me) > 0;
        else if (g.kind === "refill") valid = me.can < CAN_MAX;
        if (!valid) { botGoal = null; botPath = []; return { x: 0, y: 0 }; }
        if (botPath.length) {
            const cx = botPath[0][0] + 0.5, cy = botPath[0][1] + 0.5;
            const dx = cx - me.x, dy = cy - me.y;
            const d = Math.hypot(dx, dy);
            if (d < 0.12) { botPath.shift(); return { x: 0, y: 0 }; }
            return { x: dx / d, y: dy / d };
        }
        if (Math.hypot(me.x - (g.stand[0] + 0.5), me.y - (g.stand[1] + 0.5)) > 0.4) { botGoal = null; return { x: 0, y: 0 }; }
        botGoal = null;
        if (g.kind === "refill") doUse(1, "can", null, g.act[0], g.act[1]);
        else if (g.kind === "sell") doUse(1, "hand", null, state.bin[0], state.bin[1]);
        else if (g.kind === "harvest") doUse(1, "hand", null, g.i % W, (g.i / W) | 0);
        else if (g.kind === "water") doUse(1, "can", null, g.i % W, (g.i / W) | 0);
        else if (g.kind === "plant") doUse(1, "seed", g.seed, g.i % W, (g.i / W) | 0);
        else if (g.kind === "till") doUse(1, "hoe", null, g.i % W, (g.i / W) | 0);
        return { x: 0, y: 0 };
    }

    /* ---------------- input lokal ---------------- */
    function readLocalInput() {
        let x = stick.x, y = stick.y;
        if (keys.left) x -= 1;
        if (keys.right) x += 1;
        if (keys.up) y -= 1;
        if (keys.down) y += 1;
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        return { x: x, y: y };
    }
    function frontTile() {
        const p = state.players[localSlot()];
        const tx = clamp(Math.floor(p.x + p.dir[0] * 0.9), 0, W - 1);
        const ty = clamp(Math.floor(p.y + p.dir[1] * 0.9), 0, H - 1);
        return [tx, ty];
    }
    function localPos() {
        if (pred && online && !authority) return pred;
        return state.players[localSlot()];
    }
    function submitUseAt(tx, ty) {
        if (!state || state.phase !== "play") return;
        const me = localPos();
        const p = state.players[localSlot()];
        const bd = Math.hypot(me.x - (state.bin[0] + 0.5), me.y - (state.bin[1] + 0.5));
        if (bd <= SELL_REACH && invTotal(p) > 0) {
            const res = submitAction({ type: "use", tool: tool, seed: seedSel, tx: state.bin[0], ty: state.bin[1] });
            if (!res || res.ok) { spawnText(state.bin[0] + 0.5, state.bin[1] + 0.2, res && res.sold ? "+" + res.sold : "Jual!", "#b45309"); }
            else if (res.msg) toast(res.msg);
            return;
        }
        if (Math.hypot(me.x - (tx + 0.5), me.y - (ty + 0.5)) > USE_REACH) { toast("Terlalu jauh - mendekat dulu"); return; }
        const res = submitAction({ type: "use", tool: tool, seed: seedSel, tx: tx, ty: ty });
        if (res && !res.ok) { if (res.msg) toast(res.msg); return; }
        const fxColor = { hoe: "#a9825f", seed: "#65a30d", can: "#38bdf8", hand: "#f59e0b" }[tool];
        spawnPuff(tx + 0.5, ty + 0.5, fxColor);
        if (res && res.ok && res.fx === "harvest") spawnText(tx + 0.5, ty + 0.2, "+1", "#16a34a");
    }
    function frontUse() {
        if (!state || state.phase !== "play") return;
        const t = frontTile();
        submitUseAt(t[0], t[1]);
    }
    function cycleSeed() {
        seedSel = CROP_IDS[(CROP_IDS.indexOf(seedSel) + 1) % CROP_IDS.length];
        renderHud();
    }
    function setTool(id) {
        if (TOOL_IDS.indexOf(id) >= 0) { tool = id; renderHud(); }
    }

    /* ---------------- jaringan / applyAction ---------------- */
    function applyAction(action, actorConn) {
        if (!state || !action || typeof action.type !== "string") return null;
        const slot = online ? (actorConn === 0 ? state.slotOfHost : 1 - state.slotOfHost) : 0;
        if (action.type === "hello") {
            if (online && actorConn === 1) { state.players[1 - state.slotOfHost].name = sanitizeName(action.name); publish(true); }
            return null;
        }
        if (action.type === "input") {
            const x = Number(action.x), y = Number(action.y);
            if (isFinite(x) && isFinite(y)) inputs[slot] = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
            return null;
        }
        if (action.type === "use") {
            const tl = String(action.tool), sd = String(action.seed);
            const tx = action.tx, ty = action.ty;
            if (TOOL_IDS.indexOf(tl) < 0) return null;
            if (tx != null && (!Number.isInteger(tx) || !Number.isInteger(ty) || !inB(tx, ty))) return null;
            const res = doUse(slot, tl, CROP_IDS.indexOf(sd) >= 0 ? sd : "carrot", tx == null ? null : tx, ty == null ? null : ty);
            publish(true);
            return res;
        }
        if (action.type === "start") {
            if (actorConn === 0 || !online) startMatch();
            return null;
        }
        if (action.type === "cheat") {
            if (actorConn === 0 || !online) { applyCheat(slot, String(action.id)); publish(true); }
            return null;
        }
        return null;
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return null;
        }
        return applyAction(action, 0);
    }
    function publish(force) {
        renderHud();
        if (online && room.isHost) {
            const now = performance.now();
            if (force || now - lastPub >= PUBLISH_MS) {
                lastPub = now;
                room.publishState(state).catch(console.warn);
            }
        }
    }
    function onSnapshot() {
        if (!state) return;
        const me = state.players[localSlot()];
        frozenLocal = me.frozen;
        if (pred && Math.hypot(pred.x - me.x, pred.y - me.y) > 2.5) { pred.x = me.x; pred.y = me.y; }
        renderHud();
    }
    function guestPredict(dt) {
        if (!state || state.phase !== "play") { pred = null; return; }
        const me = state.players[localSlot()];
        if (!pred) pred = { x: me.x, y: me.y, dir: me.dir.slice() };
        frozenLocal = Math.max(0, frozenLocal - dt);
        if (frozenLocal <= 0) moveEntity(pred, readLocalInput(), dt, speedFor(localSlot()));
        const d = Math.hypot(pred.x - me.x, pred.y - me.y);
        if (d > 2.5) { pred.x = me.x; pred.y = me.y; }
        else { pred.x += (me.x - pred.x) * 0.18; pred.y += (me.y - pred.y) * 0.18; }
        const inp = readLocalInput();
        const qx = Math.round(inp.x * 4) / 4, qy = Math.round(inp.y * 4) / 4;
        if (qx !== lastSentInput.x || qy !== lastSentInput.y) {
            lastSentInput = { x: qx, y: qy };
            submitAction({ type: "input", x: qx, y: qy });
        }
    }

    /* ---------------- partikel (visual lokal) ---------------- */
    function spawnPuff(x, y, color) {
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 1.2;
            particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, life: 450, max: 450, color: color, r: 0.05 + Math.random() * 0.05 });
        }
    }
    function spawnText(x, y, text, color) {
        particles.push({ x: x, y: y, vx: 0, vy: -1.1, life: 900, max: 900, color: color, text: text });
    }
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    /* ---------------- render canvas ---------------- */
    function resize() {
        const r = panelEl.getBoundingClientRect();
        cw = Math.max(80, r.width); ch = Math.max(80, r.height);
        dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cam.ts = clamp(Math.floor(Math.min(cw / 12, ch / 8.5)), 24, 46);
    }
    function rr(x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y, x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x, y + h, rad);
        ctx.arcTo(x, y + h, x, y, rad);
        ctx.arcTo(x, y, x + w, y, rad);
        ctx.closePath();
    }
    function hash2(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }
    function updateDisp(dt) {
        if (!state) return;
        for (let i = 0; i < 2; i++) {
            const t = (pred && online && !authority && i === localSlot()) ? pred : state.players[i];
            const d = disp[i];
            if (!d.init) { d.x = t.x; d.y = t.y; d.init = true; continue; }
            const dist = Math.hypot(t.x - d.x, t.y - d.y);
            if (dist > 3) { d.x = t.x; d.y = t.y; continue; }
            const k = 1 - Math.exp(-(i === localSlot() ? 18 : 10) * dt / 1000);
            d.x += (t.x - d.x) * k;
            d.y += (t.y - d.y) * k;
        }
    }
    function drawTile(x, y, now) {
        const ts = cam.ts, px = x * ts - cam.x, py = y * ts - cam.y;
        const i = y * W + x, ch = state.tiles[i];
        const h = hash2(x, y);
        ctx.fillStyle = (h & 1) ? "#b3d49b" : "#abd094";
        ctx.fillRect(px, py, ts + 1, ts + 1);
        if (ch === "F") {
            ctx.fillStyle = "#fdf2f8";
            ctx.beginPath(); ctx.arc(px + ts * 0.3, py + ts * 0.35, ts * 0.05, 0, 7); ctx.fill();
            ctx.fillStyle = "#fde68a";
            ctx.beginPath(); ctx.arc(px + ts * 0.68, py + ts * 0.62, ts * 0.05, 0, 7); ctx.fill();
        } else if (ch === "D") {
            ctx.fillStyle = "#e7dcc3";
            ctx.fillRect(px, py, ts + 1, ts + 1);
            ctx.fillStyle = "#d9cbaa";
            ctx.beginPath(); ctx.arc(px + ts * (0.25 + (h % 3) * 0.2), py + ts * 0.5, ts * 0.035, 0, 7); ctx.fill();
        } else if (ch === "S") {
            const pl = state.plots[i];
            const wet = pl && pl.water > 0 && pl.st !== "withered";
            ctx.fillStyle = wet ? "#9a744a" : "#c8a06b";
            rr(px + 2, py + 2, ts - 4, ts - 4, 5); ctx.fill();
            ctx.strokeStyle = "#00000018"; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + 6, py + ts * 0.4); ctx.lineTo(px + ts - 6, py + ts * 0.4);
            ctx.moveTo(px + 6, py + ts * 0.65); ctx.lineTo(px + ts - 6, py + ts * 0.65);
            ctx.stroke();
            if (pl) drawCrop(pl, px, py, now);
        } else if (ch === "W") {
            ctx.fillStyle = "#8fd0ee";
            ctx.fillRect(px, py, ts + 1, ts + 1);
            if (!reducedMotion) {
                const ph = Math.sin(now / 700 + (h % 10)) * ts * 0.06;
                ctx.strokeStyle = "#b8e4f7"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(px + ts * 0.25 + ph, py + ts * 0.35); ctx.lineTo(px + ts * 0.45 + ph, py + ts * 0.35);
                ctx.moveTo(px + ts * 0.55 - ph, py + ts * 0.7); ctx.lineTo(px + ts * 0.75 - ph, py + ts * 0.7);
                ctx.stroke();
            }
        }
    }
    function drawCrop(pl, px, py, now) {
        const ts = cam.ts, cx = px + ts / 2, cy = py + ts / 2, u = ts / 36;
        const st = cropStage(pl), c = CROPS[pl.crop];
        ctx.lineCap = "round";
        if (st === -1) {
            ctx.strokeStyle = "#8d8d86"; ctx.lineWidth = 2 * u;
            ctx.beginPath();
            ctx.moveTo(cx, cy + 7 * u); ctx.lineTo(cx, cy - 4 * u);
            ctx.moveTo(cx, cy + 1 * u); ctx.lineTo(cx - 5 * u, cy - 4 * u);
            ctx.moveTo(cx, cy + 1 * u); ctx.lineTo(cx + 5 * u, cy - 4 * u);
            ctx.stroke();
        } else if (st === 0) {
            ctx.fillStyle = "#e7e5e4";
            ctx.beginPath(); ctx.arc(cx - 3 * u, cy + 2 * u, 1.6 * u, 0, 7); ctx.arc(cx + 3 * u, cy + 3 * u, 1.6 * u, 0, 7); ctx.fill();
        } else if (st === 1) {
            ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2 * u;
            ctx.beginPath(); ctx.moveTo(cx, cy + 6 * u); ctx.lineTo(cx, cy - 2 * u); ctx.stroke();
            ctx.fillStyle = "#4ade80";
            ctx.beginPath(); ctx.ellipse(cx - 3.4 * u, cy - 2 * u, 3.2 * u, 1.9 * u, -0.5, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + 3.4 * u, cy - 3 * u, 3.2 * u, 1.9 * u, 0.5, 0, 7); ctx.fill();
        } else {
            if (pl.crop === "carrot") {
                ctx.fillStyle = "#4ade80";
                ctx.beginPath(); ctx.ellipse(cx - 4 * u, cy - 4 * u, 4 * u, 2.4 * u, -0.6, 0, 7); ctx.fill();
                ctx.beginPath(); ctx.ellipse(cx + 4 * u, cy - 4 * u, 4 * u, 2.4 * u, 0.6, 0, 7); ctx.fill();
                ctx.fillStyle = c.color;
                ctx.beginPath(); ctx.arc(cx, cy + 2 * u, (st === 3 ? 5.5 : 3.2) * u, 0, 7); ctx.fill();
            } else if (pl.crop === "tomato") {
                ctx.fillStyle = "#3f9d55";
                ctx.beginPath(); ctx.arc(cx, cy, (st === 3 ? 8 : 6) * u, 0, 7); ctx.fill();
                if (st === 3) {
                    ctx.fillStyle = c.color;
                    ctx.beginPath(); ctx.arc(cx - 3.5 * u, cy - 1 * u, 2.4 * u, 0, 7); ctx.fill();
                    ctx.beginPath(); ctx.arc(cx + 3 * u, cy + 2.5 * u, 2.4 * u, 0, 7); ctx.fill();
                    ctx.beginPath(); ctx.arc(cx + 1.5 * u, cy - 4 * u, 2.2 * u, 0, 7); ctx.fill();
                } else {
                    ctx.fillStyle = "#a3c962";
                    ctx.beginPath(); ctx.arc(cx - 2.5 * u, cy, 1.8 * u, 0, 7); ctx.arc(cx + 2.5 * u, cy - 2 * u, 1.8 * u, 0, 7); ctx.fill();
                }
            } else {
                if (st === 3) {
                    ctx.fillStyle = c.color;
                    ctx.beginPath(); ctx.ellipse(cx, cy + 1 * u, 8.5 * u, 6.5 * u, 0, 0, 7); ctx.fill();
                    ctx.strokeStyle = "#c2410c"; ctx.lineWidth = 1.4 * u;
                    ctx.beginPath();
                    ctx.moveTo(cx - 3.5 * u, cy - 4.5 * u); ctx.quadraticCurveTo(cx - 5 * u, cy + 1 * u, cx - 3.5 * u, cy + 6 * u);
                    ctx.moveTo(cx + 3.5 * u, cy - 4.5 * u); ctx.quadraticCurveTo(cx + 5 * u, cy + 1 * u, cx + 3.5 * u, cy + 6 * u);
                    ctx.stroke();
                    ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 2 * u;
                    ctx.beginPath(); ctx.moveTo(cx, cy - 5.5 * u); ctx.lineTo(cx + 2 * u, cy - 8.5 * u); ctx.stroke();
                } else {
                    ctx.fillStyle = "#65a30d";
                    ctx.beginPath(); ctx.arc(cx, cy, 4.5 * u, 0, 7); ctx.fill();
                    ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 1.8 * u;
                    ctx.beginPath(); ctx.moveTo(cx - 6 * u, cy + 5 * u); ctx.quadraticCurveTo(cx, cy + 8 * u, cx + 6 * u, cy + 5 * u); ctx.stroke();
                }
            }
            if (st === 3 && !reducedMotion) {
                ctx.strokeStyle = "rgba(245,158,11," + (0.35 + 0.25 * Math.sin(now / 300)).toFixed(2) + ")";
                ctx.lineWidth = 2;
                rr(px + 2.5, py + 2.5, ts - 5, ts - 5, 5); ctx.stroke();
            }
        }
        if (st >= 0 && st < 3) {
            const gPct = clamp(pl.growth / c.growMs, 0, 1);
            const wPct = clamp(pl.water / c.waterMs, 0, 1);
            ctx.fillStyle = "#ffffff88";
            rr(px + 5, py + 3, ts - 10, 2.6, 1.3); ctx.fill();
            ctx.fillStyle = "#22c55e";
            if (gPct > 0.02) { rr(px + 5, py + 3, (ts - 10) * gPct, 2.6, 1.3); ctx.fill(); }
            ctx.fillStyle = "#ffffff88";
            rr(px + 5, py + ts - 5.6, ts - 10, 2.6, 1.3); ctx.fill();
            ctx.fillStyle = pl.water <= 0 ? "#ef4444" : "#38bdf8";
            if (wPct > 0.02) { rr(px + 5, py + ts - 5.6, (ts - 10) * wPct, 2.6, 1.3); ctx.fill(); }
            if (pl.water <= 0 && !reducedMotion) {
                ctx.strokeStyle = "rgba(239,68,68," + (0.4 + 0.3 * Math.sin(now / 200)).toFixed(2) + ")";
                ctx.lineWidth = 2;
                rr(px + 2, py + 2, ts - 4, ts - 4, 5); ctx.stroke();
            }
        }
        ctx.fillStyle = SLOT_COLOR[pl.owner];
        ctx.beginPath(); ctx.arc(px + ts - 6, py + 6, 2.2, 0, 7); ctx.fill();
    }
    function drawPlayer(i, now) {
        const ts = cam.ts, d = disp[i];
        const p = state.players[i];
        const px = d.x * ts - cam.x, py = d.y * ts - cam.y, u = ts / 36;
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath(); ctx.ellipse(px, py + 10 * u, 8 * u, 3.4 * u, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#fbfbf7";
        ctx.strokeStyle = "#00000016"; ctx.lineWidth = 1;
        rr(px - 6.5 * u, py - 4 * u, 13 * u, 15 * u, 5 * u); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#f2c9a0";
        ctx.beginPath(); ctx.arc(px, py - 8 * u, 6 * u, 0, 7); ctx.fill();
        ctx.fillStyle = SLOT_COLOR[i];
        ctx.beginPath(); ctx.arc(px, py - 9.5 * u, 6.2 * u, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px + p.dir[0] * 4 * u, py - 9 * u + p.dir[1] * 2.5 * u, 5 * u, 2.2 * u, 0, 0, 7); ctx.fill();
        if (p.frozen > 0) {
            ctx.strokeStyle = SLOT_COLOR[i];
            ctx.setLineDash([4, 3]); ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.arc(px, py, 14 * u, 0, 7); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.font = "600 " + Math.max(9, 10 * u) + "px ui-sans-serif,system-ui,sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.85)";
        const label = (i === localSlot() ? "Kamu" : p.name);
        ctx.strokeText(label, px, py - 20 * u);
        ctx.fillStyle = "#3b4252";
        ctx.fillText(label, px, py - 20 * u);
    }
    function draw(now) {
        ctx.clearRect(0, 0, cw, ch);
        if (!state) {
            ctx.fillStyle = "#f7f5f0"; ctx.fillRect(0, 0, cw, ch);
            ctx.fillStyle = "#7b8794";
            ctx.font = "600 13px ui-sans-serif,system-ui,sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Menghubungkan ke ruangan...", cw / 2, ch / 2);
            return;
        }
        const ts = cam.ts;
        const me = disp[localSlot()];
        const wx = W * ts, wy = H * ts;
        cam.x = wx <= cw ? (wx - cw) / 2 : clamp(me.x * ts - cw / 2, 0, wx - cw);
        cam.y = wy <= ch ? (wy - ch) / 2 : clamp(me.y * ts - ch / 2, 0, wy - ch);
        const x0 = Math.max(0, Math.floor(cam.x / ts)), x1 = Math.min(W - 1, Math.ceil((cam.x + cw) / ts));
        const y0 = Math.max(0, Math.floor(cam.y / ts)), y1 = Math.min(H - 1, Math.ceil((cam.y + ch) / ts));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTile(x, y, now);
        if (state.phase === "play") {
            const t = hoverTile || frontTile();
            const lp = localPos();
            if (t && Math.hypot(lp.x - (t[0] + 0.5), lp.y - (t[1] + 0.5)) <= USE_REACH) {
                ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2;
                rr(t[0] * ts - cam.x + 1.5, t[1] * ts - cam.y + 1.5, ts - 3, ts - 3, 6); ctx.stroke();
            }
        }
        const sprites = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const ch = state.tiles[y * W + x];
            if (ch === "T") sprites.push({ y: y + 0.9, kind: "tree", x: x, ty: y });
            else if (ch === "R") sprites.push({ y: y + 0.8, kind: "rock", x: x, ty: y });
            else if (ch === "B") sprites.push({ y: y + 0.9, kind: "bin", x: x, ty: y });
            else if (ch === "H" && x === state.house[0] && y === state.house[1]) sprites.push({ y: y + 2, kind: "house", x: x, ty: y });
        }
        sprites.push({ y: disp[0].y + 0.3, kind: "player", i: 0 });
        sprites.push({ y: disp[1].y + 0.3, kind: "player", i: 1 });
        sprites.sort((a, b) => a.y - b.y);
        for (let n = 0; n < sprites.length; n++) {
            const s = sprites[n];
            if (s.kind === "player") { drawPlayer(s.i, now); continue; }
            const px = s.x * ts - cam.x, py = s.ty * ts - cam.y, u = ts / 36;
            if (s.kind === "tree") {
                ctx.fillStyle = "rgba(0,0,0,0.10)";
                ctx.beginPath(); ctx.ellipse(px + ts / 2, py + ts * 0.82, ts * 0.3, ts * 0.1, 0, 0, 7); ctx.fill();
                ctx.fillStyle = "#8a6b4f";
                ctx.fillRect(px + ts * 0.44, py + ts * 0.6, ts * 0.12, ts * 0.24);
                ctx.fillStyle = "#79b07f";
                ctx.beginPath(); ctx.arc(px + ts / 2, py + ts * 0.42, ts * 0.38, 0, 7); ctx.fill();
                ctx.fillStyle = "#8cc08e";
                ctx.beginPath(); ctx.arc(px + ts * 0.42, py + ts * 0.34, ts * 0.2, 0, 7); ctx.fill();
            } else if (s.kind === "rock") {
                ctx.fillStyle = "rgba(0,0,0,0.10)";
                ctx.beginPath(); ctx.ellipse(px + ts / 2, py + ts * 0.78, ts * 0.26, ts * 0.09, 0, 0, 7); ctx.fill();
                ctx.fillStyle = "#c6cbd2";
                rr(px + ts * 0.2, py + ts * 0.3, ts * 0.6, ts * 0.48, ts * 0.16); ctx.fill();
                ctx.fillStyle = "#b3b9c2";
                rr(px + ts * 0.3, py + ts * 0.42, ts * 0.28, ts * 0.2, ts * 0.08); ctx.fill();
            } else if (s.kind === "bin") {
                ctx.fillStyle = "rgba(0,0,0,0.12)";
                ctx.beginPath(); ctx.ellipse(px + ts / 2, py + ts * 0.86, ts * 0.34, ts * 0.1, 0, 0, 7); ctx.fill();
                ctx.fillStyle = "#c08a52";
                rr(px + ts * 0.12, py + ts * 0.24, ts * 0.76, ts * 0.6, 4 * u); ctx.fill();
                ctx.fillStyle = "#a9743f";
                rr(px + ts * 0.08, py + ts * 0.16, ts * 0.84, ts * 0.2, 4 * u); ctx.fill();
                ctx.fillStyle = "#5f452c";
                rr(px + ts * 0.26, py + ts * 0.22, ts * 0.48, ts * 0.07, 2 * u); ctx.fill();
                ctx.fillStyle = "#f59e0b";
                ctx.beginPath(); ctx.arc(px + ts * 0.5, py + ts * 0.58, ts * 0.09, 0, 7); ctx.fill();
            } else if (s.kind === "house") {
                const hw = ts * 2, hh = ts * 2;
                ctx.fillStyle = "rgba(0,0,0,0.12)";
                ctx.beginPath(); ctx.ellipse(px + hw / 2, py + hh * 0.96, hw * 0.42, hh * 0.07, 0, 0, 7); ctx.fill();
                ctx.fillStyle = "#f3ead8";
                rr(px + hw * 0.08, py + hh * 0.4, hw * 0.84, hh * 0.55, 5 * u); ctx.fill();
                ctx.fillStyle = "#e2795b";
                rr(px + hw * 0.02, py + hh * 0.06, hw * 0.96, hh * 0.48, 8 * u); ctx.fill();
                ctx.strokeStyle = "#c9603f"; ctx.lineWidth = 2 * u;
                ctx.beginPath(); ctx.moveTo(px + hw * 0.08, py + hh * 0.3); ctx.lineTo(px + hw * 0.92, py + hh * 0.3); ctx.stroke();
                ctx.fillStyle = "#a9825f";
                rr(px + hw * 0.42, py + hh * 0.62, hw * 0.16, hh * 0.33, 3 * u); ctx.fill();
                ctx.fillStyle = "#bfe3f2";
                rr(px + hw * 0.16, py + hh * 0.6, hw * 0.14, hh * 0.14, 2 * u); ctx.fill();
                rr(px + hw * 0.7, py + hh * 0.6, hw * 0.14, hh * 0.14, 2 * u); ctx.fill();
            }
        }
        for (let n = 0; n < particles.length; n++) {
            const p = particles[n];
            const a = clamp(p.life / p.max, 0, 1);
            const px = p.x * ts - cam.x, py = p.y * ts - cam.y;
            if (p.text) {
                ctx.font = "800 " + Math.max(11, 12 * (ts / 36)) + "px ui-sans-serif,system-ui,sans-serif";
                ctx.textAlign = "center";
                ctx.globalAlpha = a;
                ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)";
                ctx.strokeText(p.text, px, py);
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, px, py);
                ctx.globalAlpha = 1;
            } else {
                ctx.globalAlpha = a;
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, p.r * ts), 0, 7); ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ---------------- HUD / overlay ---------------- */
    function isFrozen() { return helpOpen || cheatsOpen || paused; }
    function armToast() {
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastTimer = 0;
            toastEl.style.opacity = "0";
            toastEl.hidden = true;
        }, Math.max(0, toastDue - Date.now()));
    }
    function toast(text, ms) {
        toastEl.textContent = text;
        toastEl.hidden = false;
        toastEl.style.opacity = "1";
        toastDue = Date.now() + (ms || 1900);
        armToast();
    }
    /* Overlay/pause: sim, bot dan timer dijeda; anchor wall-clock digeser saat lanjut. */
    function freezeTimers() {
        if (freezeAt) return;
        freezeAt = Date.now();
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
        acc = 0;
        keys = Object.create(null);
        stick.x = 0; stick.y = 0; stick.id = null;
        if (knobEl) knobEl.style.transform = "translate(0,0)";
    }
    function thawTimers() {
        if (!freezeAt) return;
        const shift = Date.now() - freezeAt;
        freezeAt = 0;
        toastDue += shift;
        if (!toastEl.hidden) armToast();
        lastPub += shift; lastHud += shift; lastT = 0; acc = 0;
    }
    function syncFreeze() { if (isFrozen()) freezeTimers(); else thawTimers(); }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatsOpen = false; paused = false; }
        syncFreeze(); renderHud();
    }
    function toggleCheats(on) {
        if (!canCheat()) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) { helpOpen = false; paused = false; }
        syncFreeze(); renderHud();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { helpOpen = false; cheatsOpen = false; }
        syncFreeze(); renderHud();
    }
    function restartMatch() {
        helpOpen = false; cheatsOpen = false; paused = false;
        syncFreeze();
        if (canStart()) submitAction({ type: "start" });
        renderHud();
    }
    function contextHint() {
        if (!state || state.phase !== "play") return "";
        const slot = localSlot(), p = state.players[slot], me = localPos();
        const key = isTouch ? "AKSI" : "E";
        if (p.frozen > 0) return "Menunggu lawan jalan duluan... (" + Math.ceil(p.frozen / 1000) + ")";
        const bd = Math.hypot(me.x - (state.bin[0] + 0.5), me.y - (state.bin[1] + 0.5));
        if (bd <= SELL_REACH && invTotal(p) > 0) {
            let sum = 0;
            for (let i = 0; i < CROP_IDS.length; i++) sum += p.inv[CROP_IDS[i]] * CROPS[CROP_IDS[i]].sell;
            return key + ": Jual panen (+ " + sum + " koin)";
        }
        const t = frontTile();
        const ch = tileCh(t[0], t[1]);
        const pl = state.plots[t[1] * W + t[0]];
        if (ch === "W" && tool === "can") return key + ": Isi ulang teko";
        if (pl && pl.owner === slot && pl.st === "ripe") return key + ": Panen " + CROPS[pl.crop].name;
        if (pl && pl.owner === slot && pl.st === "planted" && pl.water <= 0) return "Kering! Segera siram";
        if (pl && pl.st === "withered" && pl.owner === slot) return key + ": Bersihkan tanaman layu";
        if (tool === "seed" && (ch === "G" || ch === "F")) return "Olah tanah dulu dengan cangkul (1)";
        if (tool === "hoe" && (ch === "G" || ch === "F")) return key + ": Olah tanah";
        if (tool === "seed" && ch === "S" && !pl) return key + ": Tanam " + CROPS[seedSel].name + " (" + CROPS[seedSel].cost + ")";
        return "";
    }
    function updateOverlays() {
        const phase = state ? state.phase : "ready";
        ovReady.hidden = helpOpen || cheatsOpen || paused || phase !== "ready";
        ovOver.hidden = helpOpen || cheatsOpen || paused || phase !== "over";
        ovPause.hidden = helpOpen || cheatsOpen || !paused;
        ovHelp.hidden = !helpOpen;
        ovCheats.hidden = !cheatsOpen || helpOpen;
        if (pauseLabel) pauseLabel.textContent = paused ? "Lanjut" : "Jeda";
        pauseBtn.setAttribute("aria-label", paused ? "Lanjut" : "Jeda");
        pauseBtn.setAttribute("title", paused ? "Lanjut (P)" : "Jeda (P)");
        if (pauseIcon.dataset.state !== String(paused)) {
            pauseIcon.dataset.state = String(paused);
            pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
        }
        if (cheatsBtn) cheatsBtn.hidden = !canCheat();
        if (restartBtn) restartBtn.disabled = !canStart();
    }
    function renderHud() {
        updateOverlays();
        const startBtns = qa("[data-startbtn]");
        for (let i = 0; i < startBtns.length; i++) {
            startBtns[i].disabled = !canStart();
            if (!canStart()) startBtns[i].textContent = "Menunggu host...";
            else if (startBtns[i].dataset.label) startBtns[i].textContent = startBtns[i].dataset.label;
        }
        const tools = qa("[data-tool]");
        for (let i = 0; i < tools.length; i++) tools[i].classList.toggle("sel", tools[i].dataset.tool === tool);
        seedDot.style.background = CROPS[seedSel].color;
        seedLabel.textContent = CROPS[seedSel].name + " \u00b7 " + CROPS[seedSel].cost;
        if (!state) {
            statusEl.textContent = "Menghubungkan...";
            return;
        }
        const slot = localSlot(), p = state.players[slot];
        hudMoney.textContent = String(p.money);
        hudTime.textContent = String(Math.max(0, Math.ceil(state.remain / 1000)));
        hudCan.textContent = String(state.cheats.water && slot === cheatOwner() ? "\u221e" : p.can);
        const invBits = [];
        for (let i = 0; i < CROP_IDS.length; i++) {
            const id = CROP_IDS[i];
            if (p.inv[id] > 0) invBits.push('<i class="ofa-dot" style="background:' + CROPS[id].color + '"></i>' + p.inv[id]);
        }
        hudInv.hidden = invBits.length === 0;
        hudInv.innerHTML = invBits.join("&nbsp;&nbsp;");
        hudScore.innerHTML =
            '<i class="ofa-dot" style="background:' + SLOT_COLOR[0] + '"></i> ' + esc(state.players[0].name) + " " + state.players[0].money +
            ' &nbsp;&middot;&nbsp; <i class="ofa-dot" style="background:' + SLOT_COLOR[1] + '"></i> ' + esc(state.players[1].name) + " " + state.players[1].money;
        statusEl.textContent = state.phase === "play" ? "Bermain" : (state.phase === "over" ? "Selesai" : "Siap");
        if (statusDot) statusDot.style.background = state.phase === "play" ? "#22c55e" : (state.phase === "over" ? "#ef4444" : "#9ca3af");
        worldEl.textContent = "Dunia #" + state.seed + " \u00b7 lolos uji bisa dimenangkan (uji ke-" + state.worldAttempts + ", simulasi target tercapai " + sec(ECON.ms) + " dtk)";
        const bestText = best ? "Rekor menang tercepat: " + best + " dtk" : "Belum ada rekor kemenangan";
        bestEl.textContent = bestText;
        bestEl2.textContent = bestText;
        const hint = contextHint();
        hintEl.hidden = !hint;
        hintEl.textContent = hint;
        const aKey = state.seed + ":" + state.announce.id;
        if (state.announce.text && aKey !== lastAnnounceKey) {
            lastAnnounceKey = aKey;
            if (state.phase === "play") toast("Kamu Player " + (slot + 1) + " (" + (slot ? "merah" : "biru") + "). " + state.announce.text, 2600);
        }
        if (state.phase === "over" && state.result) {
            const r = state.result;
            let title, cls;
            if (r.winner === -1) { title = "Seri!"; cls = ""; }
            else if (r.winner === slot) { title = online ? "Kamu menang!" : "Panen raya! Kamu menang"; cls = "ofa-win"; }
            else { title = online ? "Lawan menang" : "Farmbot menang"; cls = "ofa-lose"; }
            overTitle.textContent = title;
            overTitle.className = cls;
            overReason.textContent =
                r.reason === "target" ? "Target " + TARGET + " koin tercapai dalam " + sec(state.elapsed) + " detik." :
                    r.reason === "cheat" ? "Dimenangkan lewat cheat." :
                        "Musim berakhir - koin terbanyak menang.";
            overScore.textContent = state.players[0].name + ": " + state.players[0].money + " koin \u00b7 " + state.players[1].name + ": " + state.players[1].money + " koin" + (state.cheated ? " \u00b7 (cheat aktif, rekor tidak dicatat)" : "");
        }
        if (cheatNote) cheatNote.textContent = "Mempermudah permainan. Permainan ditandai cheat - rekor tidak dicatat." + (online ? " Hanya host yang bisa memakai cheat." : "");
        const cstates = qa("[data-cstate]");
        for (let i = 0; i < cstates.length; i++) {
            const id = cstates[i].dataset.cstate;
            const on = !!state.cheats[id];
            cstates[i].textContent = on ? "Aktif" : "Mati";
            cstates[i].parentElement.classList.toggle("on", on);
        }
    }

    /* ---------------- loop utama ---------------- */
    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(100, lastT ? t - lastT : 16);
        lastT = t;
        if (!isFrozen()) {
            if (authority) {
                if (state && state.phase === "play") {
                    acc += dt;
                    while (acc >= SIM_MS) { simStep(SIM_MS); acc -= SIM_MS; }
                } else acc = 0;
            } else {
                guestPredict(dt);
            }
            updateParticles(dt);
            updateDisp(dt);
        }
        draw(t);
        if (t - lastHud > 150) { lastHud = t; renderHud(); }
    }

    /* ---------------- event: klik / sentuh ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartMatch(); return; }
        const cheatBtn = t.closest("[data-cheat]");
        if (cheatBtn) {
            if (canCheat()) submitAction({ type: "cheat", id: cheatBtn.dataset.cheat });
            cheatBtn.blur();
            return;
        }
        if (isFrozen()) return;
        const toolBtn = t.closest("[data-tool]");
        if (toolBtn) { setTool(toolBtn.dataset.tool); toolBtn.blur(); return; }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "start") { if (canStart()) submitAction({ type: "start" }); }
        else if (act === "seedcycle") cycleSeed();
        btn.blur();
    }
    function canvasTile(e) {
        const r = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left + cam.x) / cam.ts);
        const y = Math.floor((e.clientY - r.top + cam.y) / cam.ts);
        return inB(x, y) ? [x, y] : null;
    }
    function onCanvasDown(e) {
        if (e.button != null && e.button !== 0) return;
        if (!state || state.phase !== "play" || isFrozen()) return;
        const t = canvasTile(e);
        if (t) submitUseAt(t[0], t[1]);
    }
    function onCanvasMove(e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        hoverTile = canvasTile(e);
    }
    function onCanvasLeave() { hoverTile = null; }
    function onPanelContext(e) { e.preventDefault(); }
    function stickSet(e) {
        const r = stickEl.getBoundingClientRect();
        let dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.38);
        let dy = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.38);
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        stick.x = dx; stick.y = dy;
        knobEl.style.transform = "translate(" + (dx * 30) + "px," + (dy * 30) + "px)";
    }
    function onStickDown(e) {
        e.preventDefault();
        if (isFrozen()) return;
        stick.id = e.pointerId;
        if (stickEl.setPointerCapture) { try { stickEl.setPointerCapture(e.pointerId); } catch (err) { } }
        stickSet(e);
    }
    function onStickMove(e) { if (stick.id === e.pointerId) stickSet(e); }
    function onStickUp(e) {
        if (stick.id !== e.pointerId) return;
        stick.id = null; stick.x = 0; stick.y = 0;
        knobEl.style.transform = "translate(0,0)";
    }
    function onUseDown(e) { e.preventDefault(); if (!isFrozen()) frontUse(); }

    /* ---------------- event: keyboard ---------------- */
    const MOVE_KEYS = {
        ArrowLeft: "left", KeyA: "left",
        ArrowRight: "right", KeyD: "right",
        ArrowUp: "up", KeyW: "up",
        ArrowDown: "down", KeyS: "down",
    };
    function onKey(e) {
        if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
        if (e.repeat && !MOVE_KEYS[e.code]) return;
        /* Prioritas: help → cheats → pause → Escape → aksi game. */
        if (e.code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (helpOpen) {
            if (e.code === "Escape" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "KeyP") { toggleHelp(false); e.preventDefault(); }
            return;
        }
        if (e.code === "KeyC") { toggleCheats(); e.preventDefault(); return; }
        if (cheatsOpen) {
            if (e.code === "Escape" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "KeyP") { toggleCheats(false); e.preventDefault(); }
            return;
        }
        if (e.code === "KeyP") { togglePause(); e.preventDefault(); return; }
        if (e.code === "Escape") { if (paused) togglePause(false); e.preventDefault(); return; }
        if (e.code === "KeyR") { restartMatch(); e.preventDefault(); return; }
        if (isFrozen()) return;
        const mv = MOVE_KEYS[e.code];
        if (mv) { keys[mv] = true; e.preventDefault(); return; }
        if (e.code === "Space" || e.code === "KeyE") { e.preventDefault(); frontUse(); return; }
        if (e.code === "Tab" || e.code === "KeyQ") { e.preventDefault(); cycleSeed(); return; }
        if (e.code >= "Digit1" && e.code <= "Digit4") { setTool(TOOL_IDS[Number(e.code.slice(5)) - 1]); return; }
        if (e.code === "Enter" || e.code === "NumpadEnter") {
            if (state && state.phase !== "play" && canStart()) submitAction({ type: "start" });
            e.preventDefault();
        }
    }
    function onKeyUp(e) {
        const mv = MOVE_KEYS[e.code];
        if (mv) keys[mv] = false;
    }
    function onBlur() { keys = Object.create(null); stick.x = 0; stick.y = 0; stick.id = null; if (knobEl) knobEl.style.transform = "translate(0,0)"; }

    root.addEventListener("click", handleClick);
    canvas.addEventListener("pointerdown", onCanvasDown);
    canvas.addEventListener("pointermove", onCanvasMove);
    canvas.addEventListener("pointerleave", onCanvasLeave);
    panelEl.addEventListener("contextmenu", onPanelContext);
    stickEl.addEventListener("pointerdown", onStickDown);
    stickEl.addEventListener("pointermove", onStickMove);
    stickEl.addEventListener("pointerup", onStickUp);
    stickEl.addEventListener("pointercancel", onStickUp);
    useBtn.addEventListener("pointerdown", onUseDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    let resizeObs = null;
    if (typeof ResizeObserver === "function") {
        resizeObs = new ResizeObserver(resize);
        resizeObs.observe(panelEl);
    } else {
        window.addEventListener("resize", resize);
    }
    resize();

    /* ---------------- jaringan sesuai template ---------------- */
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; renderHud(); }));
        if (room.isHost) {
            state = newMatch(randSeed(), [sanitizeName(playerName), "Pemain 2"], Math.random() < 0.5 ? 0 : 1);
            publish(true);
            unsubs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            unsubs.push(room.onState((nextState) => {
                if (!nextState || nextState.v !== 1) return;
                state = nextState;
                onSnapshot();
            }));
            submitAction({ type: "hello", name: sanitizeName(playerName) });
        }
    } else {
        state = newMatch(randSeed(), [sanitizeName(playerName), "Farmbot"], 0);
        publish(true);
    }
    syncFreeze();
    renderHud();
    raf = requestAnimationFrame(frame);

    /* ---------------- destroy ---------------- */
    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            clearTimeout(toastTimer);
            root.removeEventListener("click", handleClick);
            canvas.removeEventListener("pointerdown", onCanvasDown);
            canvas.removeEventListener("pointermove", onCanvasMove);
            canvas.removeEventListener("pointerleave", onCanvasLeave);
            panelEl.removeEventListener("contextmenu", onPanelContext);
            stickEl.removeEventListener("pointerdown", onStickDown);
            stickEl.removeEventListener("pointermove", onStickMove);
            stickEl.removeEventListener("pointerup", onStickUp);
            stickEl.removeEventListener("pointercancel", onStickUp);
            useBtn.removeEventListener("pointerdown", onUseDown);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("resize", resize);
            if (resizeObs) resizeObs.disconnect();
            for (let i = 0; i < unsubs.length; i++) { if (typeof unsubs[i] === "function") unsubs[i](); }
        },
    };
}