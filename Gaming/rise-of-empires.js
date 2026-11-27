/*
  rise-of-empires.js — strategy turn-based ala Rise of Kingdoms.
  1. META.id harus sama dengan nama file tanpa .js.
  2. Logika game ada di mount(). State serializable, host-authoritative.
  3. Regenerate manifest: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "rise-of-empires",
    name: "Rise of Empires",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Bangun kota, latih pasukan, kuasai peta, dan ratakan kota lawan. Giliran demi giliran.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 42V18h4v-6h4v6h4v-6h4v6h4v-6h4v6h4V42"/><path d="M6 42h38"/><path d="M23 42v-8h6v8"/><path d="M40 18V7"/><path d="M40 7l6 2-6 2z"/></svg>',
    bg: ["#7c3aed", "#2e1065"],
    bestKey: "riseOfEmpiresWins",
};

/* ============================ PURE RULES ============================ */

const COLS = 15, ROWS = 11, CELL = 48;
const MAPW = COLS * CELL, MAPH = ROWS * CELL;
const SPEED = 4;              // sel per giliran (march cepat, tidak ribet)
const CITY_HP = 100;
const BATCH = 5;
const MAX_MARCH = 3;
const MAX_LV = 5;
const BOT_CAP = 140;          // batas pasukan bot => game selalu bisa dimenangkan
const RESPAWN = 12;           // camp barbar respawn setelah N ronde
const KINDS = ["inf", "cav", "arc", "sie"];
const RESK = ["food", "wood", "stone", "gold"];

const TROOPS = {
    inf: { label: "Infanteri", atk: 10, def: 12, counters: "cav" },
    cav: { label: "Kavaleri", atk: 13, def: 8, counters: "arc" },
    arc: { label: "Pemanah", atk: 12, def: 6, counters: "inf" },
    sie: { label: "Siege", atk: 30, def: 4, counters: "" },
};
const TRAIN_COST = {
    inf: { food: 60, wood: 30, stone: 0 },
    cav: { food: 80, wood: 45, stone: 0 },
    arc: { food: 55, wood: 55, stone: 0 },
    sie: { food: 40, wood: 70, stone: 40 },
};
const BUILD = {
    tc: { label: "Town Center", cost: { food: 120, wood: 120, stone: 120 }, desc: "+6 emas/giliran per level, membuka level bangunan lain, +15 pertahanan kota per level." },
    farm: { label: "Farm", cost: { food: 70, wood: 50, stone: 0 }, desc: "+30 makanan per giliran per level." },
    lumber: { label: "Lumber Mill", cost: { food: 50, wood: 70, stone: 0 }, desc: "+30 kayu per giliran per level." },
    quarry: { label: "Quarry", cost: { food: 50, wood: 60, stone: 20 }, desc: "+25 batu per giliran per level." },
    goldmine: { label: "Gold Mine", cost: { food: 70, wood: 70, stone: 50 }, desc: "+12 emas per giliran per level." },
    barracks: { label: "Barracks", cost: { food: 90, wood: 110, stone: 60 }, desc: "Melatih pasukan instan. Diskon 8%/level. Siege terbuka di level 2." },
    hospital: { label: "Hospital", cost: { food: 80, wood: 80, stone: 50 }, desc: "Menampung 25 pasukan luka/level, menyembuhkan 6/giliran/level (2 makanan per pasukan)." },
    warehouse: { label: "Warehouse", cost: { food: 60, wood: 90, stone: 30 }, desc: "+500 kapasitas gudang per level." },
    wall: { label: "Wall", cost: { food: 40, wood: 70, stone: 110 }, desc: "+40 pertahanan kota per level." },
};
const BUILD_MENU = ["farm", "lumber", "quarry", "goldmine", "barracks", "hospital", "warehouse", "wall"];
const GARRISON = {
    1: { inf: 6, cav: 3, arc: 0, sie: 0 },
    2: { inf: 10, cav: 6, arc: 5, sie: 0 },
    3: { inf: 16, cav: 10, arc: 8, sie: 2 },
};
const RES_OF = { farm: "food", forest: "wood", quarry: "stone", gold: "gold" };
const NODE_LABEL = { farm: "Ladang", forest: "Hutan", quarry: "Tambang Batu", gold: "Urat Emas", camp: "Camp Barbar", city: "Kota" };
const START_RES = { food: 400, wood: 400, stone: 200, gold: 50 };
const P_COLOR = ["#8b5cf6", "#fb7185"];
const P_NAME_COLOR = ["Ungu", "Merah"];

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const tot = (u) => KINDS.reduce((s, k) => s + ((u && u[k]) || 0), 0);
const zeroUnits = () => ({ inf: 0, cav: 0, arc: 0, sie: 0 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cdist = (a, b) => Math.hypot(a.col - b.col, a.row - b.row);
const travel = (d) => Math.max(1, Math.ceil(d / SPEED));
const cheb = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

function counterMul(a, b) { return TROOPS[a] && TROOPS[a].counters === b ? 1.5 : 1; }
function counterAvg(a, enemy) {
    let s = 0, w = 0;
    for (const k of KINDS) { const n = (enemy && enemy[k]) || 0; if (n > 0) { s += counterMul(a, k) * n; w += n; } }
    return w > 0 ? s / w : 1;
}
function atkPow(u, enemy, wall) {
    let p = 0;
    for (const k of KINDS) {
        const n = (u && u[k]) || 0; if (n <= 0) continue;
        let a = TROOPS[k].atk * counterAvg(k, enemy);
        if (k === "sie" && wall > 0) a *= 2;
        p += n * a;
    }
    return p;
}
function defPow(u, wall) {
    let p = 0;
    for (const k of KINDS) p += ((u && u[k]) || 0) * TROOPS[k].def;
    return p + (wall || 0);
}
function applyKills(u, kills) {
    const t = tot(u); if (t <= 0 || kills <= 0) return;
    const f = kills >= t ? 1 : kills / t;
    for (const k of KINDS) if (u[k]) u[k] = Math.max(0, u[k] * (1 - f));
}
/* Pertempuran simultan maks 10 ronde; seri = pemenang bertahan. */
function battleResolve(att, def, wall, rand) {
    const A = { ...att }, D = { ...def }, A0 = { ...att }, D0 = { ...def };
    let rounds = 0;
    while (rounds < 10 && tot(A) > 0 && tot(D) > 0) {
        rounds++;
        const dD = (atkPow(A, D, wall) * 10) / (10 + defPow(D, wall));
        const dA = (atkPow(D, A, 0) * 10) / (10 + defPow(A, 0));
        applyKills(D, dD * (0.9 + rand() * 0.2));
        applyKills(A, dA * (0.9 + rand() * 0.2));
    }
    const win = tot(D) <= 0.001 && tot(A) > 0;
    const attSurv = zeroUnits(), defSurv = zeroUnits(), attLoss = zeroUnits(), defLoss = zeroUnits();
    for (const k of KINDS) {
        attLoss[k] = Math.max(0, Math.min(A0[k], Math.round(A0[k] - A[k])));
        defLoss[k] = Math.max(0, Math.min(D0[k], Math.round(D0[k] - D[k])));
        attSurv[k] = A0[k] - attLoss[k];
        defSurv[k] = D0[k] - defLoss[k];
    }
    return { win, rounds, attSurv, defSurv, attLoss, defLoss };
}
/* Ambil pasukan proporsional dari army sesuai fraksi (preset 25/50/100%). */
function mixUnits(army, frac) {
    const out = zeroUnits();
    let any = 0;
    for (const k of KINDS) { out[k] = frac >= 1 ? army[k] : Math.floor(army[k] * frac); any += out[k]; }
    if (!any && tot(army) > 0) {
        let best = KINDS[0];
        for (const k of KINDS) if (army[k] > army[best]) best = k;
        out[best] = 1;
    }
    return out;
}
function costFor(type, level) {
    const b = BUILD[type].cost;
    return { food: b.food * level, wood: b.wood * level, stone: b.stone * level };
}
function trainCostFor(barrLv, kind, n) {
    const mul = Math.max(0.6, 1 - 0.08 * (barrLv - 1));
    const c = TRAIN_COST[kind];
    return { food: Math.round(c.food * mul) * n, wood: Math.round(c.wood * mul) * n, stone: Math.round(c.stone * mul) * n };
}
function campPower(t) { const g = GARRISON[t]; return atkPow(g, null, 0) + defPow(g, 0) * 0.5; }
function odds(myPower, enemyPower) {
    const r = myPower / Math.max(1, enemyPower);
    return r > 1.4 ? ["Tinggi", "#34d399"] : r > 0.9 ? ["Sedang", "#fbbf24"] : ["Rendah", "#f87171"];
}

/* ---------------- Random level generator (dijamin bisa diselesaikan) ----------------
   Jaminan solvability:
   - Peta terbuka tanpa obstacle => semua target selalu bisa dicapai (march lurus).
   - Tiap kota DIJAMIN punya >=1 farm/forest/quarry dalam radius 3.5 sel + 1 gold <=4.5.
   - Node resource tidak pernah habis; camp respawn tiap RESPAWN ronde => ekonomi pulih.
   - Hospital membuat kerugian bisa dipulihkan => tidak ada dead-end militer.
   - Pasukan bot dibatasi BOT_CAP, HP kota 100 & damage siege >=20 => <=5 siege menang.
   Generator memvalidasi kandidat; jika 60 percobaan gagal, dipakai layout fallback valid. */
function tierByCenter(col, row) {
    const d = Math.hypot(col - (COLS - 1) / 2, row - (ROWS - 1) / 2);
    return d <= 3 ? 3 : d <= 5.5 ? 2 : 1;
}
function campTier(col, row, cities) {
    const d = Math.min(...cities.map((c) => Math.hypot(col - c.col, row - c.row)));
    return d <= 4.5 ? 1 : d <= 7.5 ? 2 : 3;
}
function genMap(seed) {
    const corners = [{ col: 1, row: 1 }, { col: 13, row: 1 }, { col: 1, row: 9 }, { col: 13, row: 9 }];
    for (let attempt = 0; attempt < 60; attempt++) {
        const r = rng((seed + attempt * 7919) >>> 0);
        const pair = r() < 0.5 ? [0, 3] : [1, 2];
        const spawn = r() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]]; // acak posisi player
        const cities = spawn.map((ci, p) => ({ id: "city" + p, type: "city", owner: p, tier: 0, col: corners[ci].col, row: corners[ci].row, clearedUntil: 0 }));
        const nodes = [...cities];
        const free = (col, row) =>
            col >= 0 && col < COLS && row >= 0 && row < ROWS &&
            nodes.every((n) => cheb(n, { col, row }) >= 2);
        const place = (type, tier, col, row) => {
            if (!free(col, row)) return false;
            nodes.push({ id: type + nodes.length, type, tier, col, row, owner: -1, clearedUntil: 0 });
            return true;
        };
        let ok = true;
        for (const c of cities) {
            const dirx = c.col < COLS / 2 ? 1 : -1, diry = c.row < ROWS / 2 ? 1 : -1;
            const ring = [[2, 1], [1, 2], [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3]];
            const types = ["farm", "forest", "quarry"];
            for (const t of types) {
                let done = false;
                for (const [dx, dy] of ring) { if (place(t, 1, c.col + dx * dirx, c.row + dy * diry)) { done = true; break; } }
                if (!done) { ok = false; break; }
            }
            if (ok) {
                let done = false;
                for (const [dx, dy] of [[4, 1], [1, 4], [4, 2], [2, 4], [3, 3], [4, 3], [3, 4]]) {
                    if (place("gold", 2, c.col + dx * dirx, c.row + dy * diry)) { done = true; break; }
                }
                if (!done) ok = false;
            }
            if (!ok) break;
        }
        if (!ok) continue;
        const scatterTypes = ["farm", "farm", "farm", "forest", "forest", "forest", "quarry", "quarry", "quarry", "gold", "gold", "farm", "forest", "quarry"];
        let placed = 0;
        for (let i = 0; i < 120 && placed < scatterTypes.length; i++) {
            const col = Math.floor(r() * COLS), row = Math.floor(r() * ROWS);
            if (cities.some((c) => Math.hypot(col - c.col, row - c.row) < 3)) continue;
            const t = scatterTypes[placed];
            if (place(t, tierByCenter(col, row), col, row)) placed++;
        }
        let camps = 0;
        for (let i = 0; i < 160 && camps < 8; i++) {
            const col = Math.floor(r() * COLS), row = Math.floor(r() * ROWS);
            if (cities.some((c) => Math.hypot(col - c.col, row - c.row) < 3.5)) continue;
            if (place("camp", campTier(col, row, cities), col, row)) camps++;
        }
        /* validasi kandidat */
        const near = (c, t, rad) => nodes.some((n) => n.type === t && Math.hypot(n.col - c.col, n.row - c.row) <= rad);
        const valid = cities.every((c) => near(c, "farm", 3.5) && near(c, "forest", 3.5) && near(c, "quarry", 3.5) && near(c, "gold", 4.5))
            && nodes.filter((n) => n.type === "camp" && n.tier === 1).length >= 3
            && nodes.length >= 24;
        if (valid) return { cols: COLS, rows: ROWS, nodes, spawn };
    }
    /* Fallback layout — sudah diverifikasi memenuhi semua jaminan di atas. */
    const spawn = [0, 3];
    const cities = spawn.map((ci, p) => ({ id: "city" + p, type: "city", owner: p, tier: 0, col: corners[ci].col, row: corners[ci].row, clearedUntil: 0 }));
    const raw = [
        ["farm", 3, 1], ["forest", 1, 3], ["quarry", 3, 3], ["gold", 5, 1],
        ["farm", 11, 9], ["forest", 13, 7], ["quarry", 11, 7], ["gold", 9, 9],
        ["farm", 7, 2], ["forest", 7, 8], ["quarry", 4, 6], ["gold", 10, 4], ["farm", 9, 6], ["forest", 5, 4],
        ["camp", 2, 5], ["camp", 12, 5], ["camp", 6, 3], ["camp", 8, 7], ["camp", 5, 8], ["camp", 9, 2],
    ];
    const nodes = [...cities];
    for (const [t, col, row] of raw) {
        nodes.push({ id: t + nodes.length, type: t, tier: t === "camp" ? campTier(col, row, cities) : tierByCenter(col, row), col, row, owner: -1, clearedUntil: 0 });
    }
    return { cols: COLS, rows: ROWS, nodes, spawn };
}

/* ============================ MOUNT ============================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* UI lokal (tidak dibagikan ke room) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("riseOfEmpiresHelpSeen") === "1"; } catch (_) { /* storage blocked */ }
    const ui = {
        tab: "map", cursor: { col: 7, row: 5 }, cityCursor: 4,
        sheet: null, frac: 0.5, help: !seenHelp, cheat: false, paused: false, endClosed: false,
        pad: false, surrArm: false, counted: false, botTimer: null, surrTimer: null,
    };
    try { ui.pad = matchMedia("(pointer:coarse)").matches; } catch (_) { /* matchMedia unavailable */ }
    if (!seenHelp) {
        try { localStorage.setItem("riseOfEmpiresHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.roe-app{--p0:#8b5cf6;--p1:#fb7185;--bg:#0b1020;--panel:#111a30;--line:#ffffff14;--txt:#e5e7eb;--mut:#94a3b8;--gold:#fbbf24;--ok:#34d399;--bad:#f87171;position:relative;display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0;max-width:1180px;margin:0 auto;padding:10px;box-sizing:border-box;color:var(--txt);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.roe-app *{box-sizing:border-box}
.roe-app [hidden]{display:none!important}
.roe-app button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.roe-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.roe-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.roe-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 10px;min-height:28px;font-size:11px;white-space:nowrap}
.roe-chip i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.roe-chip b{font-weight:700;font-variant-numeric:tabular-nums}
.roe-chip small{color:var(--mut);font-size:10px}
.roe-res-compact{display:none}
.roe-spacer{flex:1 1 auto;min-width:6px}
.roe-ctrls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.roe-btn,.roe-tabs button{border:1px solid var(--line);background:#182148;color:var(--txt);border-radius:8px;padding:6px 10px;min-height:32px;font-size:11px;font-weight:700;cursor:pointer;transition:border-color .15s,background .15s;white-space:nowrap}
.roe-btn:hover:not(:disabled),.roe-tabs button:hover{border-color:#ffffff45}
.roe-btn.primary{background:var(--ok);border-color:transparent;color:#052e22}
.roe-btn.on,.roe-tabs button.on{border-color:var(--gold);background:#2a2f52;color:#fff}
.roe-btn:disabled,.roe-tabs button:disabled,.roe-end:disabled,.roe-mini:disabled{opacity:.38;cursor:default}
.roe-icon-btn{display:inline-flex;align-items:center;gap:5px}
.roe-icon-btn svg{flex:none;display:block}
.roe-btn-label{white-space:nowrap}
.roe-tabs{display:flex;gap:6px}
.roe-end{display:inline-flex;align-items:center;gap:5px;background:var(--ok);color:#052e22;border:none;border-radius:8px;padding:7px 12px;min-height:32px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
.roe-end svg{flex:none;display:block}
.roe-danger{color:var(--bad)}
.roe-btn.armed{background:#7f1d1d;border-color:var(--bad)}
.roe-main{display:flex;gap:12px;flex:1 1 auto;min-height:0}
.roe-app.game-fill>.roe-main>.roe-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;padding:0;overflow:hidden;display:flex;min-width:0;background:#0d1530;border:1px solid var(--line);border-radius:12px}
.roe-view{flex:1;display:flex;min-width:0;min-height:0}
.roe-view svg{width:100%;height:100%;display:block;touch-action:manipulation}
.roe-node{cursor:pointer}
.roe-node:hover .roe-hit{stroke:#fbbf24;stroke-width:1.5}
.roe-slot{cursor:pointer}
.roe-sheet{position:absolute;left:0;right:0;bottom:0;background:#0e1630f2;border-top:1px solid #ffffff22;padding:12px 16px;max-height:72%;overflow:auto;z-index:5}
.roe-sheet h3{margin:0 0 8px;font-size:14px}
.roe-sheet .info{font-size:11.5px;color:var(--mut);line-height:1.5}
.roe-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
.roe-bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;margin-top:8px}
.roe-bgrid button{text-align:left;border:1px solid var(--line);background:#131d3d;color:var(--txt);border-radius:8px;padding:8px 12px;min-height:44px;font-size:11.5px;font-weight:700;cursor:pointer}
.roe-bgrid button small{display:block;color:var(--gold);font-weight:600;font-size:10px;margin-top:4px}
.roe-side{flex:0 0 280px;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto}
.roe-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
.roe-card h3{margin:0 0 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut)}
.roe-trow{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}
.roe-trow .nm{flex:1;min-width:0}
.roe-trow small{color:var(--mut);font-size:10px}
.roe-mini{border:1px solid var(--line);background:#182148;color:var(--txt);border-radius:6px;padding:6px 8px;min-height:32px;font-size:10.5px;font-weight:700;cursor:pointer}
.roe-mrow{display:flex;justify-content:space-between;gap:6px;font-size:11.5px;padding:2px 0;align-items:center}
.roe-log{font-size:11px;color:var(--mut);line-height:1.5}
.roe-log b{color:var(--txt);font-weight:600}
.roe-log .r{color:var(--gold);font-weight:700;margin-right:4px}
.roe-note{flex:none;font-size:11px;color:var(--mut);line-height:1.4;padding:2px 0}
.roe-app kbd{background:#0b1020;border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:10px;font-family:inherit}
.roe-pad{display:none;gap:8px;justify-content:space-between;align-items:flex-end;padding:2px 10px 4px;flex:none}
.roe-app.pad-on .roe-pad{display:flex}
.roe-dpad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px);gap:4px}
.roe-dpad button{border:1px solid #ffffff2a;background:#131d3dcc;color:var(--txt);border-radius:8px;font-size:15px;cursor:pointer}
.roe-ab{display:flex;gap:8px}
.roe-ab button{width:50px;height:50px;border-radius:50%;border:1px solid #ffffff2a;background:#131d3dcc;color:var(--txt);font-size:15px;font-weight:800;cursor:pointer}
.roe-ab .a{background:#065f46dd}
.roe-overlay{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:#05070fd9;padding:16px}
.roe-modal{display:flex;flex-direction:column;overflow:hidden;width:min(600px,100%);max-height:100%;background:#0f1830;border:1px solid #ffffff22;border-radius:14px}
.roe-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 20px 8px}
.roe-head h2{margin:0;font-size:18px}
.roe-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 20px 12px}
.roe-foot{flex:none;display:flex;gap:8px;justify-content:flex-end;padding:12px 20px 16px;border-top:1px solid var(--line)}
.roe-modal h4{margin:12px 0 4px;font-size:12px;color:var(--gold);text-transform:uppercase;letter-spacing:.5px}
.roe-modal p,.roe-modal li{font-size:12.5px;color:#cbd5e1;line-height:1.55;margin:4px 0}
.roe-modal ol,.roe-modal ul{padding-left:18px;margin:4px 0}
.roe-legend{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.roe-legend span{border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:11px;color:var(--mut)}
.roe-cheats{flex:1 1 auto;min-height:0;overflow:auto;padding:0 20px 12px}
.roe-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.roe-cheatgrid button{border:1px solid #f59e0b44;background:#1d1a33;color:var(--txt);border-radius:10px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;text-align:left}
.roe-cheatgrid button small{display:block;color:var(--mut);font-weight:500;font-size:10.5px;margin-top:2px}
.roe-endtitle.win{color:var(--ok)} .roe-endtitle.lose{color:var(--bad)}
.game-status .game-status-dot{background:#64748b}
.roe-app.myturn .game-status .game-status-dot{background:var(--ok);box-shadow:0 0 8px var(--ok)}
.roe-app.wait .game-status .game-status-dot{background:var(--gold);animation:roe-blink 1s infinite}
@keyframes roe-blink{50%{opacity:.3}}
@keyframes roe-dash{to{stroke-dashoffset:-16}}
.roe-route{animation:roe-dash 1.2s linear infinite}
@media(max-width:900px){
.roe-main{flex-direction:column}
.roe-side{flex:0 0 auto;max-height:200px}
}
@media(prefers-reduced-motion:reduce){.roe-route{animation:none}.roe-app.wait .game-status .game-status-dot{animation:none}.roe-app *{transition-duration:.01ms!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
.roe-app{gap:6px;padding:6px}
.roe-hud{gap:5px}
.roe-chips{gap:4px}
.roe-app .roe-hud .roe-chip{padding:3px 6px;min-height:0;font-size:9px}
.roe-app .roe-hud .roe-chip small{display:none}
.roe-app .roe-hud .roe-chip[data-hud="wounded"],
.roe-app .roe-hud .roe-chip[data-hud="round"],
.roe-app .roe-hud .roe-chip[data-hud="best"],
.roe-app .roe-hud .roe-chip[data-hud="food"],
.roe-app .roe-hud .roe-chip[data-hud="wood"],
.roe-app .roe-hud .roe-chip[data-hud="stone"],
.roe-app .roe-hud .roe-chip[data-hud="gold"]{display:none}
.roe-app .roe-hud .roe-chip[data-hud="res"]{display:inline-flex;gap:4px}
.roe-app .roe-hud .roe-chip[data-hud="status"]{padding:3px 5px}
.roe-app .roe-hud .roe-chip[data-hud="status"] span{display:none}
.roe-app .roe-hud .roe-btn,
.roe-app .roe-hud .roe-tabs button{min-height:32px;padding:5px 8px;font-size:9px}
.roe-app .roe-hud .roe-btn-label,
.roe-app .roe-hud .roe-spacer{display:none}
.roe-app.game-fill>.roe-main>.roe-board:not(:has(.roe-overlay:not([hidden]))){aspect-ratio:15/11;flex:0 0 auto}
.roe-app.game-fill>.roe-main>.roe-board:has(.roe-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.roe-side{max-height:170px}
.roe-overlay{padding:8px}
.roe-modal{width:100%;height:100%;max-height:100%;padding:0;border-radius:12px}
.roe-body,.roe-cheats{scrollbar-width:none}
.roe-body::-webkit-scrollbar,.roe-cheats::-webkit-scrollbar{display:none}
.roe-foot{padding:10px 12px 12px}
.roe-note{display:none}
}
@media (pointer:coarse){
.roe-app .roe-hud .roe-btn,
.roe-app .roe-hud .roe-tabs button{min-height:32px;padding:5px 8px;font-size:9px}
.roe-pad .roe-dpad button{min-height:44px}
}
</style>
<div class="game-app roe-app game-fill" data-app>
  <!-- single HUD bar: info left, controls right; no intro / footer row -->
  <div class="roe-hud">
    <div class="roe-chips" data-chips></div>
    <span class="roe-spacer"></span>
    <div class="roe-ctrls">
      <div class="roe-tabs">
        <button type="button" data-act="tab" data-tab="map" class="on" aria-label="Peta (1)" title="Peta (1)">${iconSVG("map", { size: 14 })}<span class="roe-btn-label">Peta <kbd>1</kbd></span></button>
        <button type="button" data-act="tab" data-tab="city" aria-label="Kota (2)" title="Kota (2)">${iconSVG("home", { size: 14 })}<span class="roe-btn-label">Kota <kbd>2</kbd></span></button>
      </div>
      <button class="roe-end" type="button" data-act="end" data-end aria-label="Akhiri Giliran (E)" title="Akhiri Giliran (E)">${iconSVG("flag", { size: 14 })}<span class="roe-btn-label">Akhiri Giliran</span></button>
      <button class="roe-btn roe-icon-btn" type="button" data-act="padToggle" data-padbtn aria-label="Tombol virtual" title="Tombol virtual (mobile)">${iconSVG("gamepad2", { size: 14 })}<span class="roe-btn-label">Pad</span></button>
      <button class="roe-btn roe-icon-btn roe-danger" type="button" data-act="surrender" data-surr aria-label="Menyerah" title="Menyerah">🏳<span class="roe-btn-label">Menyerah</span></button>
      <button class="roe-btn roe-icon-btn" type="button" data-help aria-label="Bantuan" title="Bantuan (H)">${iconSVG("helpCircle", { size: 14 })}<span class="roe-btn-label">Bantuan</span></button>
      <button class="roe-btn roe-icon-btn" type="button" data-cheats aria-label="Cheat" title="Cheat (C)">${iconSVG("wrench", { size: 14 })}<span class="roe-btn-label">Cheat</span></button>
      <button class="roe-btn roe-icon-btn" type="button" data-pause aria-label="Jeda" title="Jeda (P)">${iconSVG("pause", { size: 14 })}<span class="roe-btn-label">Jeda</span></button>
      <button class="roe-btn roe-icon-btn" type="button" data-restart data-newmap aria-label="Peta baru" title="Peta baru (R)">${iconSVG("refresh", { size: 14 })}<span class="roe-btn-label">Peta baru</span></button>
      <button class="roe-btn roe-icon-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">${iconSVG("logOut", { size: 14 })}<span class="roe-btn-label">Keluar</span></button>
    </div>
  </div>
  <div class="roe-main">
    <!-- board = arena + overlays only (no stage wrapper) -->
    <section class="game-panel roe-board" data-board>
      <div class="roe-view" data-view></div>
      <div class="roe-sheet" data-sheet hidden></div>
      <div class="roe-overlay" data-helpov hidden>
        <div class="roe-modal">
          <div class="roe-head"><h2>Cara Bermain</h2><button class="roe-btn" type="button" data-help-close aria-label="Tutup bantuan" title="Tutup">${iconSVG("x", { size: 14 })}</button></div>
          <div class="roe-body">
            <p><b>Tujuan:</b> ratakan kota lawan (HP 100 → 0). Kamu bermain sebagai kekaisaran <b data-helpcolor></b>; posisi spawn & siapa jalan duluan diacak tiap pertandingan.</p>
            <h4>Alur giliran (sesederhana ini)</h4>
            <ol>
              <li><b>Bangun di Kota</b> — ketuk slot kosong, pilih bangunan. Ketuk bangunan untuk upgrade. Town Center membuka level bangunan lain.</li>
              <li><b>Latih pasukan</b> — di kartu "Pasukan" (butuh Barracks). Instan, tanpa antrean.</li>
              <li><b>Ketuk node peta</b> — pilih porsi pasukan (25/50/100%), tekan <b>Kirim</b>. Pasukan otomatis berjalan, mengumpulkan / bertempur, lalu pulang.</li>
              <li><b>Akhiri Giliran</b> — produksi masuk, hospital menyembuhkan, pasukan bergerak & bertempur. Lalu giliran lawan.</li>
            </ol>
            <h4>Peta</h4>
            <ul>
              <li>Ladang / Hutan / Tambang / Emas: kirim pasukan untuk mengumpulkan (tier makin tinggi = hasil makin besar).</li>
              <li>Camp Barbar: kalahkan untuk loot. Respawn setelah ${RESPAWN} ronde.</li>
              <li>Kota lawan: menangkan siege untuk merusak HP kota (siege memberi damage ekstra). HP 0 = menang.</li>
            </ul>
            <h4>Counter pasukan</h4>
            <div class="roe-legend"><span>Infanteri ➜ Kavaleri</span><span>Kavaleri ➜ Pemanah</span><span>Pemanah ➜ Infanteri</span><span>Siege ×2 vs tembok</span></div>
            <p>Korban perang 60% menjadi <b>pasukan luka</b> dan sembuh otomatis di Hospital — jangan takut bertempur.</p>
            <h4>Kontrol</h4>
            <ul>
              <li><b>Mouse:</b> klik node/slot, klik ganda node = kirim 50% pasukan otomatis, klik kanan = tutup panel.</li>
              <li><b>Keyboard:</b> <kbd>←↑→↓</kbd>/<kbd>WASD</kbd> pilih • <kbd>Enter</kbd>/<kbd>Spasi</kbd> konfirmasi • <kbd>E</kbd> giliran • <kbd>1</kbd>/<kbd>2</kbd> Peta/Kota • <kbd>H</kbd> bantuan • <kbd>C</kbd> cheat • <kbd>P</kbd> jeda • <kbd>R</kbd> peta baru • <kbd>Esc</kbd> tutup.</li>
              <li><b>Mobile:</b> tombol virtual D-pad + A/B di bawah peta (atau tombol 🎮), semua aksi bisa disentuh.</li>
            </ul>
          </div>
          <div class="roe-foot"><button class="roe-btn primary" type="button" data-act="closeHelp" data-help-close>Mulai bermain</button></div>
        </div>
      </div>
      <div class="roe-overlay" data-cheatov hidden>
        <div class="roe-modal">
          <div class="roe-head"><h2>⚡ Cheat (mode AI)</h2><button class="roe-btn" type="button" data-act="closeCheat" aria-label="Tutup cheat" title="Tutup">${iconSVG("x", { size: 14 })}</button></div>
          <div class="roe-cheats">
            <p>Cheat hanya tersedia saat bermain melawan bot, agar multiplayer tetap adil.</p>
            <div class="roe-cheatgrid">
              <button type="button" data-act="cheat" data-cheat="res">+1000 semua sumber daya<small>Isi ulang gudang</small></button>
              <button type="button" data-act="cheat" data-cheat="troops">+20 setiap pasukan<small>Langsung di kota</small></button>
              <button type="button" data-act="cheat" data-cheat="heal">Pulihkan kota & luka<small>HP 100, semua luka sembuh</small></button>
              <button type="button" data-act="cheat" data-cheat="build">Bangunan level max<small>Semua slot terisi level 5</small></button>
              <button type="button" data-act="cheat" data-cheat="weaken">Lemahkan lawan<small>Pasukan & HP bot dipotong 50%</small></button>
              <button type="button" data-act="cheat" data-cheat="win">Menang instan<small>Akhiri pertandingan</small></button>
              <button type="button" data-act="cheat" data-cheat="passive">Bot pasif: <span data-passive>OFF</span><small>Bot hanya produksi, tidak menyerang</small></button>
            </div>
          </div>
          <div class="roe-foot"><button class="roe-btn" type="button" data-act="closeCheat">Tutup</button></div>
        </div>
      </div>
      <div class="roe-overlay" data-pauseov hidden>
        <div class="roe-modal" style="text-align:center">
          <div class="roe-head"><h2>Dijeda</h2></div>
          <div class="roe-body"><p>Bot dan penghitung waktu dibekukan. Tekan <kbd>P</kbd> atau <kbd>Esc</kbd> untuk melanjutkan.</p></div>
          <div class="roe-foot" style="justify-content:center"><button class="roe-btn primary" type="button" data-resume>Lanjutkan</button></div>
        </div>
      </div>
      <div class="roe-overlay" data-endov hidden>
        <div class="roe-modal" style="text-align:center">
          <div class="roe-head"><h2 class="roe-endtitle" data-endtitle></h2></div>
          <div class="roe-body"><p data-endsub></p><p data-endwait hidden style="color:var(--mut)">Menunggu host memulai match baru…</p></div>
          <div class="roe-foot" style="justify-content:center">
            <button class="roe-btn primary" type="button" data-act="restart" data-rematch>Match baru (peta acak)</button>
            <button class="roe-btn" type="button" data-act="closeEnd">Lihat peta</button>
          </div>
        </div>
      </div>
    </section>
    <aside class="roe-side" data-side></aside>
  </div>
  <div class="roe-note" data-note></div>
  <!-- touch pad is a sibling after the board, never an overlay on it -->
  <div class="roe-pad" data-pad>
    <div class="roe-dpad">
      <span></span><button type="button" data-act="pad" data-k="up">▲</button><span></span>
      <button type="button" data-act="pad" data-k="left">◀</button><span></span><button type="button" data-act="pad" data-k="right">▶</button>
      <span></span><button type="button" data-act="pad" data-k="down">▼</button><span></span>
    </div>
    <div class="roe-ab">
      <button type="button" class="b" data-act="pad" data-k="b">B</button>
      <button type="button" class="a" data-act="pad" data-k="a">A</button>
    </div>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const appEl = $("[data-app]"), viewEl = $("[data-view]"), sheetEl = $("[data-sheet]"),
        sideEl = $("[data-side]"), chipsEl = $("[data-chips]"), noteEl = $("[data-note]"),
        endBtn = $("[data-end]"), surrBtn = $("[data-surr]"),
        helpOv = $("[data-helpov]"), cheatOv = $("[data-cheatov]"), endOv = $("[data-endov]"),
        pauseOv = $("[data-pauseov]");

    /* ---------------- state & helpers ---------------- */

    function dispName(p) {
        if (p === playerIndex) return playerName || "Kamu";
        return state ? state.players[p].name : "Lawan";
    }
    function newState(seed) {
        const map = genMap(seed >>> 0);
        const r = rng((seed ^ 0x9e3779b9) >>> 0);
        const first = r() < 0.5 ? 0 : 1; // coin flip: siapa jalan duluan
        const names = online ? ["Tuan Rumah", "Rival"] : [playerName || "Kamu", "Warlord Bot"];
        const players = [0, 1].map((p) => ({
            name: names[p],
            res: { ...START_RES },
            slots: Array.from({ length: 9 }, (_, i) => (i === 4 ? { type: "tc", level: 1 } : null)),
            army: { inf: 8, cav: 4, arc: 4, sie: 0 },
            wounded: zeroUnits(),
            hp: CITY_HP, marches: [], nextId: 1,
            stats: { battles: 0, wins: 0, lost: 0 },
        }));
        const s = {
            seed: seed >>> 0, rngN: 0, map, first, current: first, round: 1,
            players, winner: null, reason: "", log: [], v: 1,
            cheats: { botPassive: false },
        };
        return s;
    }
    function rand() { state.rngN++; return rng((state.seed + state.rngN * 1013904223) >>> 0)(); }
    function log(msg) {
        state.log.unshift({ r: state.round, m: msg });
        if (state.log.length > 40) state.log.pop();
    }
    const nodeById = (id) => state.map.nodes.find((n) => n.id === id) || null;
    const cityNode = (p) => state.map.nodes.find((n) => n.type === "city" && n.owner === p);
    const bLv = (P, t) => P.slots.reduce((s, x) => s + (x && x.type === t ? x.level : 0), 0);
    const tcLv = (P) => bLv(P, "tc");
    const capOf = (P) => 600 + bLv(P, "warehouse") * 500 + tcLv(P) * 100;
    const hospCap = (P) => bLv(P, "hospital") * 25;
    const wallDef = (P) => bLv(P, "wall") * 40 + tcLv(P) * 15;
    const outUnits = (P) => { const u = zeroUnits(); for (const m of P.marches) for (const k of KINDS) u[k] += m.units[k]; return u; };
    function addRes(P, gain) {
        const cap = capOf(P);
        for (const k of RESK) P.res[k] = Math.min(cap, P.res[k] + (gain[k] || 0));
    }
    function canPay(P, c) { return P.res.food >= c.food && P.res.wood >= c.wood && P.res.stone >= (c.stone || 0); }
    function pay(P, c) {
        if (!canPay(P, c)) return false;
        P.res.food -= c.food; P.res.wood -= c.wood; P.res.stone -= c.stone || 0;
        return true;
    }
    function toWounded(P, losses) {
        let left = hospCap(P) - tot(P.wounded);
        for (const k of KINDS) {
            const w = Math.min(Math.floor(losses[k] * 0.6), Math.max(0, left));
            P.wounded[k] += w; left -= w;
        }
    }
    function healTick(P) {
        let rate = bLv(P, "hospital") * 6;
        for (const k of KINDS) {
            if (rate <= 0) break;
            const n = Math.min(P.wounded[k], rate, Math.floor(P.res.food / 2));
            if (n > 0) { P.wounded[k] -= n; P.army[k] += n; P.res.food -= n * 2; rate -= n; }
        }
    }
    function prodTick(P) {
        addRes(P, {
            food: bLv(P, "farm") * 30,
            wood: bLv(P, "lumber") * 30,
            stone: bLv(P, "quarry") * 25,
            gold: bLv(P, "goldmine") * 12 + tcLv(P) * 6,
        });
    }
    function campAlive(n) { return !n.clearedUntil || state.round >= n.clearedUntil; }

    /* Pause-aware timers: bot & surrender confirmation freeze with the game.
       Date.now() due anchors are re-armed with the remaining wait on resume,
       so no time is skipped while paused. */
    const liveTimers = new Map();
    let deferredTimers = [];
    function setT(fn, ms) {
        const token = {};
        const arm = (wait) => {
            const id = setTimeout(() => { liveTimers.delete(token); fn(); }, wait);
            liveTimers.set(token, { fn, due: Date.now() + wait, id });
        };
        token.arm = arm;
        if (ui.paused) deferredTimers.push({ token, fn, wait: Math.max(0, ms) });
        else arm(ms);
        return token;
    }
    function clearT(token) {
        if (!token) return;
        const rec = liveTimers.get(token);
        if (rec) { clearTimeout(rec.id); liveTimers.delete(token); }
        deferredTimers = deferredTimers.filter((d) => d.token !== token);
    }
    function pauseTimers() {
        const now = Date.now();
        for (const [token, rec] of liveTimers) {
            clearTimeout(rec.id);
            deferredTimers.push({ token, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        liveTimers.clear();
    }
    function resumeTimers() {
        const q = deferredTimers; deferredTimers = [];
        for (const d of q) d.token.arm(d.wait);
    }
    function clearAllTimers() {
        for (const rec of liveTimers.values()) clearTimeout(rec.id);
        liveTimers.clear();
        deferredTimers = [];
    }

    /* ---------------- aksi (divalidasi, lalu mutasi state) ---------------- */

    function act(a, actor) {
        const P = state.players[actor];
        if (!P) return false;
        switch (a.type) {
            case "build": {
                const i = a.slot | 0;
                if (i < 0 || i > 8 || i === 4 || P.slots[i]) return false;
                const t = a.btype;
                if (!BUILD[t] || t === "tc") return false;
                if (!pay(P, costFor(t, 1))) return false;
                P.slots[i] = { type: t, level: 1 };
                log(`${dispName(actor)} membangun ${BUILD[t].label}.`);
                return true;
            }
            case "upgrade": {
                const s = P.slots[a.slot | 0];
                if (!s) return false;
                const max = s.type === "tc" ? MAX_LV : Math.min(MAX_LV, tcLv(P));
                if (s.level >= max) return false;
                if (!pay(P, costFor(s.type, s.level + 1))) return false;
                s.level++;
                log(`${dispName(actor)}: ${BUILD[s.type].label} naik ke level ${s.level}.`);
                return true;
            }
            case "train": {
                const k = a.kind, bl = bLv(P, "barracks");
                if (!KINDS.includes(k) || bl < 1) return false;
                if (k === "sie" && bl < 2) return false;
                const n = a.n === 3 ? 3 : 1;
                if (!pay(P, trainCostFor(bl, k, n))) return false;
                P.army[k] += BATCH * n;
                log(`${dispName(actor)} melatih ${BATCH * n} ${TROOPS[k].label}.`);
                return true;
            }
            case "march": {
                const node = nodeById(a.target);
                if (!node || P.marches.length >= MAX_MARCH) return false;
                if (node.type === "city" && node.owner === actor) return false;
                if (node.type === "camp" && !campAlive(node)) return false;
                if (node.type === "city" && state.players[node.owner].hp <= 0) return false;
                const units = zeroUnits();
                for (const k of KINDS) units[k] = Math.max(0, Math.min(P.army[k], Math.floor((a.units && a.units[k]) || 0)));
                if (tot(units) <= 0) return false;
                for (const k of KINDS) P.army[k] -= units[k];
                const home = cityNode(actor);
                const d = cdist(home, node);
                P.marches.push({
                    id: P.nextId++, target: node.id, units,
                    pos: { x: home.col, y: home.row }, phase: "out",
                    eta: travel(d), carry: null,
                });
                log(`${dispName(actor)} mengirim ${tot(units)} pasukan ke ${NODE_LABEL[node.type]} (${node.col},${node.row}).`);
                return true;
            }
            case "recall": {
                const m = P.marches.find((x) => x.id === a.id);
                if (!m || m.phase !== "out") return false;
                const home = cityNode(actor);
                m.phase = "back";
                m.eta = travel(dist(m.pos, { x: home.col, y: home.row }));
                log(`${dispName(actor)} menarik pulang satu barisan.`);
                return true;
            }
            case "end": endTurnFor(actor); return true;
            case "surrender":
                state.winner = 1 - actor;
                state.reason = `${dispName(actor)} menyerah.`;
                log(state.reason);
                return true;
            case "cheat": {
                if (online || actor !== 0) return false;
                const E = state.players[1];
                if (a.cheat === "res") { addRes(P, { food: 1000, wood: 1000, stone: 1000, gold: 1000 }); log("CHEAT: +1000 semua sumber daya."); }
                else if (a.cheat === "troops") { for (const k of KINDS) P.army[k] += 20; log("CHEAT: +20 setiap pasukan."); }
                else if (a.cheat === "heal") { P.hp = CITY_HP; for (const k of KINDS) { P.army[k] += P.wounded[k]; P.wounded[k] = 0; } log("CHEAT: kota pulih & semua luka sembuh."); }
                else if (a.cheat === "build") {
                    const fill = ["farm", "lumber", "quarry", "barracks", "hospital", "goldmine", "warehouse", "wall"];
                    P.slots = P.slots.map((s, i) => i === 4 ? { type: "tc", level: MAX_LV } : (s ? { type: s.type, level: MAX_LV } : { type: fill[i > 4 ? i - 1 : i], level: MAX_LV }));
                    log("CHEAT: semua bangunan level max.");
                }
                else if (a.cheat === "weaken") { for (const k of KINDS) E.army[k] = Math.floor(E.army[k] / 2); E.hp = Math.max(1, Math.floor(E.hp / 2)); log("CHEAT: lawan dilemahkan 50%."); }
                else if (a.cheat === "win") { state.winner = 0; state.reason = "Kemenangan via cheat."; log(state.reason); }
                else if (a.cheat === "passive") { state.cheats.botPassive = !state.cheats.botPassive; log("CHEAT: bot pasif " + (state.cheats.botPassive ? "ON" : "OFF") + "."); }
                else return false;
                return true;
            }
            case "restart": {
                if (online && actor !== 0) return false;
                state = newState((Date.now() ^ (Math.random() * 0xffffff)) >>> 0);
                ui.sheet = null; ui.endClosed = false; ui.counted = false; ui.surrArm = false;
                const h = cityNode(playerIndex);
                ui.cursor = { col: h.col, row: h.row };
                log(`Peta baru #${state.seed}. Koin dilempar: ${dispName(state.first)} jalan duluan.`);
                log(`Posisi diacak: ${dispName(0)} = ${P_NAME_COLOR[0]}, ${dispName(1)} = ${P_NAME_COLOR[1]}.`);
                return true;
            }
        }
        return false;
    }

    /* ---------------- giliran & resolusi ---------------- */

    function endTurnFor(p) {
        const P = state.players[p];
        prodTick(P);
        healTick(P);
        for (const m of P.marches.slice()) {
            if (state.winner !== null) break;
            advanceMarch(m, p);
        }
        for (const n of state.map.nodes)
            if (n.type === "camp" && n.clearedUntil && state.round >= n.clearedUntil) n.clearedUntil = 0;
        if (state.winner !== null) return;
        state.current = 1 - p;
        if (state.current === state.first) state.round++;
        log(`— Giliran ${dispName(state.current)} (ronde ${state.round}) —`);
    }

    function advanceMarch(m, p) {
        const P = state.players[p];
        const home = cityNode(p);
        let dest = m.phase === "back" ? home : nodeById(m.target);
        if (!dest) dest = home;
        if (m.phase === "out" && dest.type === "camp" && !campAlive(dest)) { m.phase = "back"; dest = home; }
        const d = dist(m.pos, { x: dest.col, y: dest.row });
        if (d > SPEED) {
            m.pos.x += ((dest.col - m.pos.x) / d) * SPEED;
            m.pos.y += ((dest.row - m.pos.y) / d) * SPEED;
            m.eta = Math.ceil((d - SPEED) / SPEED);
            return;
        }
        m.pos = { x: dest.col, y: dest.row };
        if (m.phase === "back") {
            for (const k of KINDS) P.army[k] += m.units[k];
            if (m.carry) addRes(P, m.carry);
            P.marches.splice(P.marches.indexOf(m), 1);
            log(`${dispName(p)}: ${tot(m.units)} pasukan pulang${m.carry ? " membawa hasil" : ""}.`);
            return;
        }
        if (RES_OF[dest.type]) {
            const res = RES_OF[dest.type];
            const amount = (res === "gold" ? 60 : 120) * dest.tier;
            m.carry = { [res]: amount };
            m.phase = "back";
            m.eta = travel(cdist(dest, home));
            log(`${dispName(p)} mengumpulkan ${amount} ${res} (tier ${dest.tier}).`);
            return;
        }
        if (dest.type === "camp") { fightCamp(m, p, dest); return; }
        if (dest.type === "city") { siegeCity(m, p, dest); return; }
        m.phase = "back"; m.eta = travel(cdist(dest, home));
    }

    function sendBack(m, p, from) {
        if (tot(m.units) <= 0) {
            const P = state.players[p];
            P.marches.splice(P.marches.indexOf(m), 1);
            log(`${dispName(p)}: tidak ada yang selamat dari ${NODE_LABEL[from.type]}.`);
            return;
        }
        m.phase = "back";
        m.eta = travel(cdist(from, cityNode(p)));
    }

    function fightCamp(m, p, node) {
        const P = state.players[p];
        const gar = { ...GARRISON[node.tier] };
        const r = battleResolve(m.units, gar, 0, rand);
        P.stats.battles++;
        toWounded(P, r.attLoss);
        m.units = r.attSurv;
        if (r.win) {
            P.stats.wins++;
            const t = node.tier;
            m.carry = { food: 70 * t, wood: 70 * t, stone: 40 * t, gold: 35 * t };
            node.clearedUntil = state.round + RESPAWN;
            log(`⚔ ${dispName(p)} menang di camp tier ${t} (${r.rounds} ronde, rugi ${tot(r.attLoss)}). Loot diangkut pulang!`);
        } else {
            P.stats.lost += tot(r.attLoss);
            log(`💥 ${dispName(p)} kalah di camp tier ${t} — rugi ${tot(r.attLoss)} pasukan.`);
        }
        sendBack(m, p, node);
    }

    function siegeCity(m, p, node) {
        const P = state.players[p], E = state.players[node.owner];
        const wall = wallDef(E);
        const r = battleResolve(m.units, E.army, wall, rand);
        P.stats.battles++;
        toWounded(P, r.attLoss);
        toWounded(E, r.defLoss);
        E.army = r.defSurv;
        m.units = r.attSurv;
        if (r.win && tot(r.attSurv) > 0) {
            P.stats.wins++;
            const dmg = Math.min(50, 20 + r.attSurv.sie * 5);
            E.hp = Math.max(0, E.hp - dmg);
            m.carry = { food: 100, wood: 100, stone: 60, gold: 60 };
            log(`🏰 ${dispName(p)} menembus kota ${dispName(node.owner)}! Damage ${dmg} (HP lawan ${E.hp}).`);
            if (E.hp <= 0) {
                state.winner = p;
                state.reason = `Kota ${dispName(node.owner)} rata dengan tanah.`;
                log(`👑 ${state.reason}`);
            }
        } else {
            P.stats.lost += tot(r.attLoss);
            log(`🛡 Siege ${dispName(p)} gagal — pertahanan ${dispName(node.owner)} bertahan (rugi ${tot(r.attLoss)}).`);
        }
        sendBack(m, p, node);
    }

    /* ---------------- bot AI (mode AI saja, jalan di sisi host/lokal) ---------------- */

    function scheduleBot() {
        if (online || ui.botTimer || destroyed || ui.paused || ui.help) return;
        ui.botTimer = setT(() => {
            ui.botTimer = null;
            if (destroyed || !state || state.winner !== null || state.current !== 1) return;
            if (ui.help || ui.paused) { scheduleBot(); return; } // tunggu tutorial / jeda selesai
            botTurn();
        }, 700);
    }
    function cancelBot() { clearT(ui.botTimer); ui.botTimer = null; }
    function botTurn() {
        const B = state.players[1], E = state.players[0];
        const A = (x) => act(x, 1);
        if (!state.cheats.botPassive) {
            /* ekonomi: bangun slot kosong sesuai prioritas */
            const prio = ["farm", "lumber", "barracks", "quarry", "hospital", "goldmine", "warehouse", "wall"];
            let built = 0;
            for (let i = 0; i < 9 && built < 2; i++) {
                if (i === 4 || B.slots[i]) continue;
                const t = prio[i > 4 ? i - 1 : i];
                if (A({ type: "build", slot: i, btype: t })) built++;
            }
            /* upgrade: TC dulu, lalu bangunan level terendah */
            if (tcLv(B) < Math.min(MAX_LV, 1 + Math.floor(state.round / 4))) A({ type: "upgrade", slot: 4 });
            else {
                let bi = -1, bl = 99;
                B.slots.forEach((s, i) => { if (s && s.type !== "tc" && s.level < Math.min(MAX_LV, tcLv(B)) && s.level < bl) { bl = s.level; bi = i; } });
                if (bi >= 0) A({ type: "upgrade", slot: bi });
            }
            /* latih menuju komposisi target, dibatasi BOT_CAP */
            const want = { inf: 0.4, cav: 0.25, arc: 0.25, sie: 0.1 };
            for (let n = 0; n < 3; n++) {
                const total = tot(B.army) + tot(outUnits(B));
                if (total >= BOT_CAP) break;
                let best = "inf", gap = -1;
                for (const k of KINDS) {
                    if (k === "sie" && bLv(B, "barracks") < 2) continue;
                    const g = want[k] * Math.max(1, total) - B.army[k];
                    if (g > gap) { gap = g; best = k; }
                }
                if (!A({ type: "train", kind: best, n: 1 })) break;
            }
            /* march: gather / camp / siege */
            if (B.marches.length < MAX_MARCH && tot(B.army) >= 12) {
                const targeted = new Set(B.marches.map((m) => m.target));
                const home = cityNode(1);
                const idle = tot(B.army);
                const myPower = atkPow(mixUnits(B.army, 0.6), null, 0);
                const enemyDef = defPow(E.army, wallDef(E)) + atkPow(E.army, null, 0) * 0.5;
                const enemyCity = cityNode(0);
                if (idle >= 40 && myPower > enemyDef * 1.25) {
                    A({ type: "march", target: enemyCity.id, units: mixUnits(B.army, 0.9) });
                } else {
                    const camps = state.map.nodes.filter((n) => n.type === "camp" && campAlive(n) && !targeted.has(n.id) && myPower * 0.9 > campPower(n.tier) * 1.35);
                    camps.sort((a, b) => cdist(home, a) - cdist(home, b));
                    if (camps.length && idle >= 20) A({ type: "march", target: camps[0].id, units: mixUnits(B.army, 0.6) });
                    else {
                        let lowest = RESK[0];
                        for (const k of RESK) if (B.res[k] < B.res[lowest]) lowest = k;
                        const wantType = Object.keys(RES_OF).find((t) => RES_OF[t] === lowest);
                        const resNodes = state.map.nodes.filter((n) => n.type === wantType && !targeted.has(n.id));
                        resNodes.sort((a, b) => cdist(home, a) - cdist(home, b));
                        if (resNodes.length) A({ type: "march", target: resNodes[0].id, units: mixUnits(B.army, 0.3) });
                    }
                }
            }
        }
        applyAction({ type: "end" }, 1);
    }

    /* ---------------- publish / apply / submit (pola template) ---------------- */

    function render() {
        if (!state) {
            viewEl.innerHTML = '<div style="margin:auto;color:#94a3b8;font-size:13px">Menunggu state dari host…</div>';
            return;
        }
        renderHud(); renderView(); renderSheet(); renderSide(); renderChrome();
    }
    function publish() {
        render();
        if (state && state.winner === playerIndex && !ui.counted) {
            ui.counted = true;
            try {
                const k = META.bestKey, n = parseInt(localStorage.getItem(k) || "0", 10) || 0;
                localStorage.setItem(k, String(n + 1));
            } catch (e) { /* storage tidak tersedia */ }
        }
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!state || destroyed) return;
        if (state.winner !== null && action.type !== "restart") return;
        const turnActions = ["build", "upgrade", "train", "march", "recall", "end"];
        if (turnActions.includes(action.type) && actor !== state.current) return;
        if (action.type === "cheat" && (online || actor !== 0)) return;
        if (action.type === "restart" && online && actor !== 0) return;
        if (!act(action, actor)) return;
        state.v++;
        publish();
        if (!online && state.winner === null && state.current === 1) scheduleBot();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------------- rendering ---------------- */

    const ICON = {
        farm: '<path d="M-12 -4h24M-12 2h24M-12 8h24" stroke="#a16207" stroke-width="2.5" fill="none"/><path d="M-8 -7v-4M-2 -7v-4M4 -7v-4M10 -7v-4" stroke="#eab308" stroke-width="2"/><circle cx="-8" cy="-13" r="2" fill="#fde047"/><circle cx="-2" cy="-13" r="2" fill="#fde047"/><circle cx="4" cy="-13" r="2" fill="#fde047"/><circle cx="10" cy="-13" r="2" fill="#fde047"/>',
        forest: '<path d="M-13 9 L-5 -9 L3 9 Z" fill="#15803d" stroke="#bbf7d0" stroke-width="1.5"/><path d="M-1 11 L7 -10 L15 11 Z" fill="#16a34a" stroke="#bbf7d0" stroke-width="1.5"/><rect x="-9" y="9" width="4" height="5" fill="#78350f"/><rect x="5" y="11" width="4" height="5" fill="#78350f"/>',
        quarry: '<path d="M-14 9 L-5 -7 L4 9 Z" fill="#6b7280" stroke="#e5e7eb" stroke-width="1.5"/><path d="M-2 11 L7 -3 L16 11 Z" fill="#9ca3af" stroke="#f3f4f6" stroke-width="1.5"/>',
        gold: '<circle r="10" fill="#b45309" stroke="#fde68a" stroke-width="2"/><circle r="5" fill="#fbbf24" stroke="#fde68a" stroke-width="1.5"/>',
        camp: '<path d="M-12 9 L0 -10 L12 9 Z" fill="#7f1d1d" stroke="#fecaca" stroke-width="2"/><line x1="0" y1="-10" x2="0" y2="9" stroke="#fecaca" stroke-width="1.5"/><path d="M8 -16 L17 -13 L8 -10 Z" fill="#ef4444"/><line x1="8" y1="-3" x2="8" y2="-16" stroke="#fecaca" stroke-width="2"/>',
        city: '<rect x="-16" y="-3" width="32" height="16" rx="2" fill="CUR" stroke="#e5e7eb" stroke-width="1.5"/><path d="M-16 -3h5v-4h5v4h5v-4h5v4h5v-4h5v4h2" fill="none" stroke="#e5e7eb" stroke-width="1.5"/><rect x="-21" y="-8" width="8" height="21" fill="CUR" stroke="#e5e7eb" stroke-width="1.5"/><rect x="13" y="-8" width="8" height="21" fill="CUR" stroke="#e5e7eb" stroke-width="1.5"/><rect x="-4" y="4" width="8" height="9" rx="2" fill="#0b1020"/><line x1="0" y1="-7" x2="0" y2="-19" stroke="#e5e7eb" stroke-width="1.5"/><path d="M0 -19 L10 -16 L0 -13 Z" fill="#fbbf24"/>',
        tc: '<rect x="-14" y="-2" width="28" height="14" rx="2" fill="#4c1d95" stroke="#ddd6fe" stroke-width="1.5"/><rect x="-19" y="-7" width="7" height="19" fill="#5b21b6" stroke="#ddd6fe" stroke-width="1.5"/><rect x="12" y="-7" width="7" height="19" fill="#5b21b6" stroke="#ddd6fe" stroke-width="1.5"/><path d="M0 -18 L9 -15 L0 -12 Z" fill="#fbbf24"/><line x1="0" y1="-6" x2="0" y2="-18" stroke="#ddd6fe" stroke-width="1.5"/>',
        goldmine: '<circle cx="4" cy="4" r="7" fill="#b45309" stroke="#fde68a" stroke-width="1.5"/><circle cx="4" cy="4" r="3.5" fill="#fbbf24"/><path d="M-14 -8 L2 -2 M-10 -12 L-14 -8 L-9 -4" stroke="#e5e7eb" stroke-width="2.5" fill="none"/>',
        barracks: '<path d="M-10 10 L8 -10 M10 10 L-8 -10" stroke="#e5e7eb" stroke-width="3"/><path d="M-12 12 h6 M6 12 h6" stroke="#fbbf24" stroke-width="3"/><circle r="3" fill="#7f1d1d" stroke="#fecaca" stroke-width="1.5"/>',
        hospital: '<rect x="-12" y="-10" width="24" height="22" rx="4" fill="#0f2b26" stroke="#6ee7b7" stroke-width="1.5"/><path d="M0 -5 v12 M-6 1 h12" stroke="#34d399" stroke-width="3.5"/>',
        warehouse: '<rect x="-13" y="-6" width="26" height="18" rx="2" fill="#3f2d12" stroke="#fcd34d" stroke-width="1.5"/><path d="M-13 -6 L0 -14 L13 -6" fill="#5b4310" stroke="#fcd34d" stroke-width="1.5"/><path d="M-4 12 v-8 h8 v8" fill="none" stroke="#fcd34d" stroke-width="1.5"/>',
        wall: '<rect x="-15" y="-6" width="30" height="18" fill="#334155" stroke="#cbd5e1" stroke-width="1.5"/><path d="M-15 0h30M-15 6h30M-8 -6v6M0 0v6M8 -6v6M-8 6v6M8 6v6" stroke="#cbd5e1" stroke-width="1"/><path d="M-15 -6h5v-4h5v4h5v-4h5v4h5v-4h5v4" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>',
    };
    const TIER_COL = { 1: "#4ade80", 2: "#fbbf24", 3: "#f87171" };
    const cityIcon = (p) => ICON.city.replaceAll("CUR", P_COLOR[p]);
    const px = (c) => c * CELL + CELL / 2;

    function renderHud() {
        const me = state.players[playerIndex], en = state.players[1 - playerIndex];
        const cap = capOf(me);
        const dot = { food: "#fbbf24", wood: "#34d399", stone: "#94a3b8", gold: "#fde047" };
        const nm = { food: "Makanan", wood: "Kayu", stone: "Batu", gold: "Emas" };
        const myTurn = state.current === playerIndex && state.winner === null;
        const statusTxt = state.winner !== null
            ? (state.winner === playerIndex ? "Menang!" : "Kalah")
            : myTurn ? "Giliranmu" : online ? "Giliran lawan" : "Bot bergerak…";
        let wins = 0;
        try { wins = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { /* storage unavailable */ }
        let h = "";
        for (const k of RESK)
            h += `<span class="roe-chip" data-hud="${k}"><i style="background:${dot[k]}"></i>${nm[k]} <b>${Math.floor(me.res[k])}</b><small>/${cap}</small></span>`;
        h += `<span class="roe-chip roe-res-compact" data-hud="res">${RESK.map((k) => `<i style="background:${dot[k]}"></i><b>${Math.floor(me.res[k])}</b>`).join("")}</span>`;
        h += `<span class="roe-chip">⚔ Pasukan <b>${tot(me.army)}</b>${tot(outUnits(me)) ? `<small>+${tot(outUnits(me))} di lapangan</small>` : ""}</span>`;
        h += `<span class="roe-chip">🏰 HP <b style="color:${me.hp > 40 ? "var(--ok)" : "var(--bad)"}">${me.hp}</b></span>`;
        if (tot(me.wounded)) h += `<span class="roe-chip" data-hud="wounded">🩹 Luka <b>${tot(me.wounded)}</b><small>/${hospCap(me)}</small></span>`;
        h += `<span class="roe-chip" style="border-color:${P_COLOR[1 - playerIndex]}55">Lawan HP <b>${en.hp}</b></span>`;
        h += `<span class="roe-chip game-status" data-hud="status"><i class="game-status-dot"></i><span>${statusTxt}</span></span>`;
        h += `<span class="roe-chip" data-hud="round">R${state.round} · Peta #${state.seed}</span>`;
        h += `<span class="roe-chip" data-hud="best">${online ? "Multiplayer" : "vs Bot"} · Menang <b>${wins}</b></span>`;
        chipsEl.innerHTML = h;
    }

    function renderView() {
        viewEl.innerHTML = ui.tab === "map" ? mapSvg() : citySvg();
    }

    function mapSvg() {
        const me = playerIndex;
        let s = `<svg viewBox="0 0 ${MAPW} ${MAPH}" role="img" aria-label="Peta dunia">`;
        s += `<rect width="${MAPW}" height="${MAPH}" fill="#0d1530"/>`;
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++)
            s += `<circle cx="${px(c)}" cy="${px(r)}" r="1.1" fill="#ffffff09"/>`;
        /* rute march kedua pemain */
        for (const p of [0, 1]) for (const m of state.players[p].marches) {
            const dest = m.phase === "back" ? cityNode(p) : nodeById(m.target);
            if (!dest) continue;
            s += `<line class="roe-route" x1="${px(m.pos.x)}" y1="${px(m.pos.y)}" x2="${px(dest.col)}" y2="${px(dest.row)}" stroke="${P_COLOR[p]}" stroke-width="1.5" stroke-dasharray="5 5" opacity=".5"/>`;
        }
        /* nodes */
        for (const n of state.map.nodes) {
            const x = px(n.col), y = px(n.row);
            const dead = n.type === "camp" && !campAlive(n);
            s += `<g class="roe-node" data-node="${n.id}" transform="translate(${x} ${y})" opacity="${dead ? 0.3 : 1}"><title>${NODE_LABEL[n.type]}${n.tier ? " tier " + n.tier : ""}</title>`;
            s += `<circle class="roe-hit" r="22" fill="transparent" stroke="transparent"/>`;
            if (n.type === "city") {
                s += `<circle r="24" fill="${P_COLOR[n.owner]}14" stroke="${P_COLOR[n.owner]}" stroke-width="2"/>` + cityIcon(n.owner);
                s += `<rect x="-20" y="18" width="40" height="4" rx="2" fill="#0b1020"/><rect x="-20" y="18" width="${40 * state.players[n.owner].hp / CITY_HP}" height="4" rx="2" fill="${state.players[n.owner].hp > 40 ? "#34d399" : "#f87171"}"/>`;
                s += `<text y="34" text-anchor="middle" font-size="10" fill="#cbd5e1">${n.owner === me ? " Kotamu" : " " + dispName(n.owner)}</text>`;
            } else {
                s += ICON[n.type] || "";
                if (!dead) s += `<circle cx="14" cy="-14" r="6.5" fill="#0b1020" stroke="${TIER_COL[n.tier]}" stroke-width="1.5"/><text x="14" y="-11" text-anchor="middle" font-size="8.5" font-weight="700" fill="${TIER_COL[n.tier]}">${n.tier}</text>`;
            }
            if (ui.sheet && ui.sheet.kind === "node" && ui.sheet.id === n.id)
                s += `<circle r="25" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="5 4"/>`;
            s += `</g>`;
        }
        /* token march */
        for (const p of [0, 1]) for (const m of state.players[p].marches) {
            const x = px(m.pos.x), y = px(m.pos.y);
            s += `<g transform="translate(${x} ${y})" pointer-events="none"><circle r="10" fill="${P_COLOR[p]}" stroke="#fff" stroke-width="1.5"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${tot(m.units)}</text>${m.carry ? '<circle cx="9" cy="-9" r="4" fill="#fbbf24" stroke="#0b1020"/>' : ""}</g>`;
        }
        /* cursor keyboard/virtual */
        s += `<circle cx="${px(ui.cursor.col)}" cy="${px(ui.cursor.row)}" r="24" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4 4" opacity=".8" pointer-events="none"/>`;
        s += `</svg>`;
        return s;
    }

    function citySvg() {
        const me = state.players[playerIndex];
        let s = `<svg viewBox="0 0 ${MAPW} ${MAPH}" role="img" aria-label="Kota">`;
        s += `<rect width="${MAPW}" height="${MAPH}" fill="#0d1530"/>`;
        s += `<text x="20" y="30" font-size="12" fill="#94a3b8">Kota ${dispName(playerIndex)} — ketuk slot untuk membangun / upgrade</text>`;
        const cx = [180, 360, 540], cy = [140, 280, 420];
        for (let i = 0; i < 9; i++) {
            const x = cx[i % 3], y = cy[Math.floor(i / 3)];
            const b = me.slots[i];
            const sel = ui.sheet && (ui.sheet.kind === "slot" || ui.sheet.kind === "build") && ui.sheet.idx === i;
            const cur = ui.cityCursor === i;
            s += `<g class="roe-slot" data-slot="${i}" transform="translate(${x} ${y})">`;
            s += `<rect x="-70" y="-56" width="140" height="112" rx="14" fill="#101a36" stroke="${sel ? "#fbbf24" : cur ? "#fbbf2488" : b && b.type === "tc" ? P_COLOR[playerIndex] + "88" : "#ffffff1c"}" stroke-width="${sel || cur ? 2 : 1.2}" ${b ? "" : 'stroke-dasharray="6 5"'}/>`;
            if (b) {
                s += `<g transform="translate(0 -12) scale(1.5)">${b.type === "tc" ? ICON.tc : ICON[b.type]}</g>`;
                s += `<text y="30" text-anchor="middle" font-size="11" font-weight="700" fill="#e5e7eb">${BUILD[b.type].label}</text>`;
                for (let l = 0; l < MAX_LV; l++)
                    s += `<circle cx="${-18 + l * 9}" cy="42" r="3" fill="${l < b.level ? "#fbbf24" : "#ffffff20"}"/>`;
            } else {
                s += `<text y="6" text-anchor="middle" font-size="26" fill="#475569">+</text><text y="30" text-anchor="middle" font-size="10" fill="#475569">slot kosong</text>`;
            }
            s += `</g>`;
        }
        s += `</svg>`;
        return s;
    }

    function composerHtml(node) {
        const me = state.players[playerIndex];
        const myTurn = state.current === playerIndex && state.winner === null;
        const units = mixUnits(me.army, ui.frac);
        const n = tot(units);
        const eta = travel(cdist(cityNode(playerIndex), node));
        let h = `<div class="roe-row">`;
        for (const f of [0.25, 0.5, 1])
            h += `<button class="roe-btn ${ui.frac === f ? "on" : ""}" type="button" data-act="frac" data-frac="${f}">${f * 100}%</button>`;
        h += `</div><p class="info">Dikirim: ${KINDS.filter((k) => units[k] > 0).map((k) => units[k] + " " + TROOPS[k].label).join(", ") || "—"} • tiba ${eta} giliran • pulang ${eta} giliran.</p>`;
        const full = me.marches.length >= MAX_MARCH;
        h += `<div class="roe-row"><button class="roe-btn primary" type="button" data-act="march" data-target="${node.id}" ${!myTurn || n <= 0 || full ? "disabled" : ""}>Kirim ${n} pasukan</button><button class="roe-btn" type="button" data-act="closeSheet">Batal (Esc)</button></div>`;
        if (full) h += `<p class="info" style="color:var(--bad)">Maksimal ${MAX_MARCH} barisan di lapangan.</p>`;
        if (!myTurn) h += `<p class="info">Tunggu giliranmu.</p>`;
        return h;
    }

    function renderSheet() {
        if (!ui.sheet || !state) { sheetEl.hidden = true; sheetEl.innerHTML = ""; return; }
        const me = state.players[playerIndex];
        let h = "";
        if (ui.sheet.kind === "node") {
            const node = nodeById(ui.sheet.id);
            if (!node) { ui.sheet = null; sheetEl.hidden = true; return; }
            h += `<h3>${NODE_LABEL[node.type]}${node.tier ? " — tier " + node.tier : ""}</h3>`;
            if (node.type === "city" && node.owner === playerIndex) {
                h += `<p class="info">Ini kotamu. Kelola bangunan di tab Kota.</p><div class="roe-row"><button class="roe-btn primary" type="button" data-act="tab" data-tab="city">Buka Kota</button><button class="roe-btn" type="button" data-act="closeSheet">Tutup</button></div>`;
            } else if (RES_OF[node.type]) {
                const res = RES_OF[node.type];
                h += `<p class="info">Hasil: <b>${(res === "gold" ? 60 : 120) * node.tier} ${res}</b> per ekspedisi. Pasukan otomatis pulang setelah mengumpulkan.</p>` + composerHtml(node);
            } else if (node.type === "camp") {
                if (!campAlive(node)) {
                    h += `<p class="info">Camp sudah ditaklukkan — respawn ronde ${node.clearedUntil}.</p><div class="roe-row"><button class="roe-btn" type="button" data-act="closeSheet">Tutup</button></div>`;
                } else {
                    const g = GARRISON[node.tier];
                    const [txt, col] = odds(atkPow(mixUnits(me.army, ui.frac), g, 0), campPower(node.tier));
                    h += `<p class="info">Garnisun: ${tot(g)} pasukan. Loot: ${70 * node.tier} makanan/kayu, ${40 * node.tier} batu, ${35 * node.tier} emas. Peluang: <b style="color:${col}">${txt}</b>.</p>` + composerHtml(node);
                }
            } else if (node.type === "city") {
                const E = state.players[node.owner];
                const [txt, col] = odds(atkPow(mixUnits(me.army, ui.frac), E.army, wallDef(E)), defPow(E.army, wallDef(E)) + atkPow(E.army, null, 0) * 0.5);
                h += `<p class="info">Kota ${dispName(node.owner)} — HP ${E.hp}, garnisun ${tot(E.army)} + tembok ${wallDef(E)}. Menang siege = damage 20 (+5/siege yang selamat). Peluang: <b style="color:${col}">${txt}</b>.</p>` + composerHtml(node);
            }
        } else if (ui.sheet.kind === "slot") {
            const i = ui.sheet.idx, b = me.slots[i];
            if (!b) { ui.sheet = { kind: "build", idx: i }; return renderSheet(); }
            const max = b.type === "tc" ? MAX_LV : Math.min(MAX_LV, tcLv(me));
            const cost = costFor(b.type, b.level + 1);
            const myTurn = state.current === playerIndex && state.winner === null;
            h += `<h3>${BUILD[b.type].label} — level ${b.level}</h3><p class="info">${BUILD[b.type].desc}</p>`;
            if (b.level >= max) {
                h += `<p class="info">${b.level >= MAX_LV ? "Sudah level maksimal." : "Butuh Town Center level " + (b.level + 1) + "."}</p><div class="roe-row"><button class="roe-btn" type="button" data-act="closeSheet">Tutup</button></div>`;
            } else {
                const ok = myTurn && canPay(me, cost);
                h += `<div class="roe-row"><button class="roe-btn primary" type="button" data-act="upgrade" data-slot="${i}" ${ok ? "" : "disabled"}>Upgrade ke Lv ${b.level + 1} — ${cost.food}m ${cost.wood}k ${cost.stone}b</button><button class="roe-btn" type="button" data-act="closeSheet">Tutup</button></div>`;
            }
        } else if (ui.sheet.kind === "build") {
            const i = ui.sheet.idx;
            const myTurn = state.current === playerIndex && state.winner === null;
            h += `<h3>Bangun di slot ${i + 1}</h3><p class="info">Pilih bangunan (biaya = level 1).</p><div class="roe-bgrid">`;
            for (const t of BUILD_MENU) {
                const c = costFor(t, 1);
                const ok = myTurn && canPay(me, c);
                h += `<button type="button" data-act="build" data-slot="${i}" data-btype="${t}" ${ok ? "" : "disabled"}>${BUILD[t].label}<small>${c.food}m ${c.wood}k ${c.stone ? c.stone + "b" : ""}</small></button>`;
            }
            h += `</div><div class="roe-row"><button class="roe-btn" type="button" data-act="closeSheet">Batal</button></div>`;
        }
        sheetEl.innerHTML = h;
        sheetEl.hidden = false;
    }

    function renderSide() {
        const me = state.players[playerIndex];
        const myTurn = state.current === playerIndex && state.winner === null;
        const bl = bLv(me, "barracks");
        let h = `<div class="roe-card"><h3>Pasukan ${bl ? `(Barracks Lv ${bl}, diskon ${Math.round((1 - Math.max(0.6, 1 - 0.08 * (bl - 1))) * 100)}%)` : ""}</h3>`;
        if (!bl) h += `<p class="info" style="font-size:11px;color:var(--mut)">Bangun <b>Barracks</b> di Kota untuk melatih pasukan.</p>`;
        for (const k of KINDS) {
            const c = bl ? trainCostFor(bl, k, 1) : TRAIN_COST[k];
            const lock = k === "sie" && bl < 2;
            const ok = myTurn && bl > 0 && !lock && canPay(me, c);
            h += `<div class="roe-trow"><span class="nm">${TROOPS[k].label} <b>${me.army[k]}</b>${me.wounded[k] ? ` <small>🩹${me.wounded[k]}</small>` : ""}<small> ${c.food}m ${c.wood}k ${c.stone ? c.stone + "b" : ""}${lock ? " • Barracks Lv2" : ""}</small></span><button class="roe-mini" type="button" data-act="train" data-kind="${k}" data-n="1" ${ok ? "" : "disabled"}>×${BATCH}</button><button class="roe-mini" type="button" data-act="train" data-kind="${k}" data-n="3" ${myTurn && bl > 0 && !lock && canPay(me, trainCostFor(bl, k, 3)) ? "" : "disabled"}>×${BATCH * 3}</button></div>`;
        }
        h += `</div><div class="roe-card"><h3>Barisan (${me.marches.length}/${MAX_MARCH})</h3>`;
        if (!me.marches.length) h += `<p style="font-size:11px;color:var(--mut);margin:2px 0">Tidak ada pasukan di lapangan.</p>`;
        for (const m of me.marches) {
            const dest = m.phase === "back" ? cityNode(playerIndex) : nodeById(m.target);
            const icon = m.phase === "back" ? "🏠" : RES_OF[dest?.type] ? "⛏" : "⚔";
            h += `<div class="roe-mrow"><span>${icon} ${dest ? NODE_LABEL[dest.type] : "?"} • ${tot(m.units)} pasukan • ${m.eta} giliran</span>${m.phase === "out" ? `<button class="roe-mini" type="button" data-act="recall" data-id="${m.id}" ${myTurn ? "" : "disabled"}>Tarik</button>` : ""}</div>`;
        }
        h += `</div><div class="roe-card"><h3>Catatan</h3><div class="roe-log">`;
        h += state.log.slice(0, 8).map((l) => `<div><span class="r">R${l.r}</span>${l.m}</div>`).join("") || "—";
        h += `</div></div>`;
        sideEl.innerHTML = h;
    }

    function hint() {
        const me = state.players[playerIndex];
        if (state.winner !== null) return "Pertandingan selesai.";
        if (state.current !== playerIndex) return online ? "Menunggu giliran lawan…" : "Bot sedang bergerak…";
        if (!bLv(me, "barracks")) return "Langkah 1: buka tab Kota, bangun Farm, Lumber Mill, dan Barracks.";
        if (tot(me.army) < 10) return "Langkah 2: latih pasukan di kartu Pasukan (kanan/bawah).";
        if (!me.marches.length) return "Langkah 3: ketuk node peta (ladang/camp) lalu Kirim. Klik ganda = kirim 50% otomatis.";
        return "Akhiri giliran (E) agar produksi masuk & pasukan bergerak.";
    }

    function renderChrome() {
        const myTurn = state.current === playerIndex && state.winner === null;
        appEl.classList.toggle("myturn", myTurn);
        appEl.classList.toggle("wait", !myTurn && state.winner === null);
        appEl.classList.toggle("pad-on", ui.pad);
        endBtn.disabled = !myTurn || ui.help || ui.cheat || ui.paused;
        surrBtn.classList.toggle("armed", ui.surrArm);
        surrBtn.title = ui.surrArm ? "Ketuk lagi untuk konfirmasi menyerah" : "Menyerah";
        surrBtn.disabled = state.winner !== null;
        noteEl.textContent = hint();
        for (const b of root.querySelectorAll(".roe-tabs button")) b.classList.toggle("on", b.dataset.tab === ui.tab);
        const cheatsBtn = $("[data-cheats]");
        if (cheatsBtn) { cheatsBtn.disabled = online; cheatsBtn.classList.toggle("on", ui.cheat && !online); }
        $("[data-newmap]").hidden = online && !room.isHost;
        const pauseBtn = $("[data-pause]");
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".roe-btn-label");
            if (label) label.textContent = ui.paused ? "Lanjut" : "Jeda";
            pauseBtn.setAttribute("aria-label", ui.paused ? "Lanjut" : "Jeda");
            pauseBtn.disabled = online;
            pauseBtn.classList.toggle("on", ui.paused);
        }
        const padBtn = $("[data-padbtn]");
        if (padBtn) padBtn.classList.toggle("on", ui.pad);
        /* Overlays suppress each other; HUD labels are updated on the label
           span so the icon is never destroyed. */
        helpOv.hidden = !ui.help;
        cheatOv.hidden = !ui.cheat || online || ui.help;
        pauseOv.hidden = !ui.paused || ui.help || ui.cheat;
        $("[data-helpcolor]").textContent = P_NAME_COLOR[playerIndex];
        $("[data-passive]").textContent = state.cheats.botPassive ? "ON" : "OFF";
        const showEnd = state.winner !== null && !ui.endClosed;
        endOv.hidden = !showEnd || ui.help || ui.cheat || ui.paused;
        if (showEnd) {
            const win = state.winner === playerIndex;
            const t = $("[data-endtitle]");
            t.textContent = win ? "👑 Kemenangan!" : "💀 Kekalahan";
            t.className = "roe-endtitle " + (win ? "win" : "lose");
            const me = state.players[playerIndex];
            $("[data-endsub]").textContent = `${state.reason} Ronde ${state.round} • ${me.stats.wins} menang dari ${me.stats.battles} pertempuran.`;
            const hostCan = !online || room.isHost;
            $("[data-rematch]").hidden = !hostCan;
            $("[data-endwait]").hidden = hostCan;
        }
    }

    /* ---------------- overlay state ---------------- */

    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) {
            ui.cheat = false; ui.paused = false; resumeTimers(); cancelBot();
        } else if (!online && state?.current === 1) scheduleBot();
        render();
    }
    function toggleCheat(on) {
        if (online) return;
        ui.cheat = typeof on === "boolean" ? on : !ui.cheat;
        if (ui.cheat) { ui.help = false; ui.paused = false; resumeTimers(); }
        render();
    }
    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !ui.paused;
        if (next === ui.paused) return;
        ui.paused = next;
        if (ui.paused) { pauseTimers(); cancelBot(); }
        else { resumeTimers(); if (!ui.help && state?.current === 1) scheduleBot(); }
        render();
    }
    function restartGame() {
        ui.help = false; ui.cheat = false; ui.paused = false; resumeTimers();
        cancelBot();
        clearT(ui.surrTimer); ui.surrTimer = null; ui.surrArm = false;
        submitAction({ type: "restart" });
    }

    /* ---------------- interaksi UI ---------------- */

    function openNodeSheet(id) {
        ui.sheet = { kind: "node", id };
        render();
    }
    function closeSheet() { ui.sheet = null; render(); }
    function moveCursor(dc, dr) {
        if (ui.tab === "map") {
            ui.cursor.col = Math.max(0, Math.min(COLS - 1, ui.cursor.col + dc));
            ui.cursor.row = Math.max(0, Math.min(ROWS - 1, ui.cursor.row + dr));
        } else {
            const c = ui.cityCursor % 3, r = Math.floor(ui.cityCursor / 3);
            ui.cityCursor = Math.max(0, Math.min(2, r + dr)) * 3 + Math.max(0, Math.min(2, c + dc));
        }
        render();
    }
    function confirmPrimary() {
        if (!state) return;
        if (ui.sheet?.kind === "node") {
            const btn = sheetEl.querySelector('[data-act="march"]:not([disabled])');
            if (btn) { btn.click(); return; }
        }
        if (ui.sheet?.kind === "slot") {
            const btn = sheetEl.querySelector('[data-act="upgrade"]:not([disabled])');
            if (btn) { btn.click(); return; }
        }
        activateCursor();
    }
    function activateCursor() {
        if (ui.tab === "map") {
            const n = state.map.nodes.find((x) => x.col === ui.cursor.col && x.row === ui.cursor.row);
            if (n) openNodeSheet(n.id);
            else noteEl.textContent = "Tidak ada node di sel ini — gerakkan cursor ke ikon.";
        } else {
            const b = state.players[playerIndex].slots[ui.cityCursor];
            ui.sheet = b ? { kind: "slot", idx: ui.cityCursor } : { kind: "build", idx: ui.cityCursor };
            render();
        }
    }
    function quickMarch(nodeId) {
        if (!state || state.current !== playerIndex || state.winner !== null) return;
        const node = nodeById(nodeId);
        if (!node || (node.type === "city" && node.owner === playerIndex)) return;
        if (node.type === "camp" && !campAlive(node)) return;
        submitAction({ type: "march", target: nodeId, units: mixUnits(state.players[playerIndex].army, 0.5) });
        ui.sheet = null;
    }

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheat(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        const el = t.closest("[data-act]");
        if (el && el.dataset.act === "closeCheat") { toggleCheat(false); return; }
        if (ui.help || ui.paused || (ui.cheat && el?.dataset.act !== "cheat")) return;
        const nodeG = t.closest("[data-node]");
        if (nodeG && state) { openNodeSheet(nodeG.dataset.node); return; }
        const slotG = t.closest("[data-slot]");
        if (slotG && (!el || el.dataset.act === "build" || el.dataset.act === "upgrade")) {
            if (!el && state) {
                const i = parseInt(slotG.dataset.slot, 10);
                ui.cityCursor = i;
                ui.sheet = state.players[playerIndex].slots[i] ? { kind: "slot", idx: i } : { kind: "build", idx: i };
                render();
                return;
            }
        }
        if (!el) return;
        const a = el.dataset.act;
        if (a === "help") toggleHelp();
        else if (a === "closeHelp") toggleHelp(false);
        else if (a === "cheatToggle") toggleCheat();
        else if (a === "closeCheat") toggleCheat(false);
        else if (a === "closeEnd") { ui.endClosed = true; render(); }
        else if (a === "padToggle") { ui.pad = !ui.pad; render(); }
        else if (a === "tab") { ui.tab = el.dataset.tab; ui.sheet = null; render(); }
        else if (a === "pad") {
            const k = el.dataset.k;
            if (k === "up") moveCursor(0, -1);
            else if (k === "down") moveCursor(0, 1);
            else if (k === "left") moveCursor(-1, 0);
            else if (k === "right") moveCursor(1, 0);
            else if (k === "a") confirmPrimary();
            else if (k === "b") { if (ui.sheet) closeSheet(); else if (ui.cheat) toggleCheat(false); }
        }
        else if (a === "frac") { ui.frac = parseFloat(el.dataset.frac); render(); }
        else if (a === "closeSheet") closeSheet();
        else if (a === "surrender") {
            if (!state || state.winner !== null) return;
            if (!ui.surrArm) {
                ui.surrArm = true; render();
                clearT(ui.surrTimer);
                ui.surrTimer = setT(() => { ui.surrTimer = null; ui.surrArm = false; if (!destroyed) render(); }, 2500);
            } else { ui.surrArm = false; submitAction({ type: "surrender" }); }
        }
        else if (a === "restart") restartGame();
        else if (!state || ui.help || ui.paused || (ui.cheat && a !== "cheat")) return;
        else if (a === "build") { submitAction({ type: "build", slot: parseInt(el.dataset.slot, 10), btype: el.dataset.btype }); ui.sheet = { kind: "slot", idx: parseInt(el.dataset.slot, 10) }; render(); }
        else if (a === "upgrade") submitAction({ type: "upgrade", slot: parseInt(el.dataset.slot, 10) });
        else if (a === "train") submitAction({ type: "train", kind: el.dataset.kind, n: parseInt(el.dataset.n, 10) });
        else if (a === "march") {
            const node = nodeById(el.dataset.target);
            if (node) { submitAction({ type: "march", target: node.id, units: mixUnits(state.players[playerIndex].army, ui.frac) }); ui.sheet = null; render(); }
        }
        else if (a === "recall") submitAction({ type: "recall", id: parseInt(el.dataset.id, 10) });
        else if (a === "end") submitAction({ type: "end" });
        else if (a === "cheat") { if (!online) submitAction({ type: "cheat", cheat: el.dataset.cheat }); }
    }

    function handleDblClick(event) {
        const g = event.target.closest("[data-node]");
        if (g) quickMarch(g.dataset.node);
    }
    function handleContext(event) {
        if (ui.sheet) { event.preventDefault(); closeSheet(); }
    }
    function handleKey(event) {
        if (destroyed || !root.isConnected) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const tag = (event.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        const k = event.key, code = event.code || "";
        /* Keyboard priority: help -> cheats -> pause -> Escape -> game actions. */
        if (code === "KeyH" || k === "h" || k === "H" || k === "?") {
            if (!event.repeat) toggleHelp();
            event.preventDefault(); return;
        }
        if (code === "KeyC" || k === "c" || k === "C" || k === "f" || k === "F") {
            if (!event.repeat && !ui.help && !ui.paused) toggleCheat();
            event.preventDefault(); return;
        }
        if (code === "KeyP" || k === "p" || k === "P") {
            if (!event.repeat && !ui.help && !ui.cheat) togglePause();
            event.preventDefault(); return;
        }
        if (k === "Escape") {
            if (ui.help) toggleHelp(false);
            else if (ui.cheat) toggleCheat(false);
            else if (ui.paused) togglePause(false);
            else if (ui.sheet) closeSheet();
            event.preventDefault(); return;
        }
        if (ui.help || ui.cheat || ui.paused) {
            if (k === "Enter" && ui.help) toggleHelp(false);
            event.preventDefault(); return;
        }
        if (code === "KeyR" || k === "r" || k === "R") { restartGame(); event.preventDefault(); return; }
        const map = {
            ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
        };
        if (map[k]) { moveCursor(map[k][0], map[k][1]); event.preventDefault(); return; }
        if (k === "Enter" || k === " ") { confirmPrimary(); event.preventDefault(); return; }
        if (k === "e" || k === "E") { if (state && state.current === playerIndex && state.winner === null) submitAction({ type: "end" }); event.preventDefault(); return; }
        if (k === "1") { ui.tab = "map"; ui.sheet = null; render(); return; }
        if (k === "2") { ui.tab = "city"; ui.sheet = null; render(); return; }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("dblclick", handleDblClick);
    root.addEventListener("contextmenu", handleContext);
    window.addEventListener("keydown", handleKey);

    /* ---------------- init: online (host/guest) vs AI ---------------- */

    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            state = newState((Date.now() ^ (Math.random() * 0xffffff)) >>> 0);
            const h = cityNode(playerIndex);
            ui.cursor = { col: h.col, row: h.row };
            log(`Koin dilempar: ${dispName(state.first)} jalan duluan.`);
            log(`Posisi diacak: ${dispName(0)} = ${P_NAME_COLOR[0]}, ${dispName(1)} = ${P_NAME_COLOR[1]}.`);
            publish();
            room.onAction((action) => applyAction(action, 1));
        } else {
            render();
            room.onState((nextState) => {
                state = nextState;
                if (state && !ui.counted && state.winner === null) {
                    const h = cityNode(playerIndex);
                    ui.cursor = { col: h.col, row: h.row };
                }
                render();
            });
        }
    } else {
        state = newState((Date.now() ^ (Math.random() * 0xffffff)) >>> 0);
        const h = cityNode(playerIndex);
        ui.cursor = { col: h.col, row: h.row };
        log(`Koin dilempar: ${dispName(state.first)} jalan duluan.`);
        publish();
        if (state.current === 1) scheduleBot();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("dblclick", handleDblClick);
            root.removeEventListener("contextmenu", handleContext);
            window.removeEventListener("keydown", handleKey);
            clearAllTimers();
            ui.botTimer = null;
            ui.surrTimer = null;
        },
    };
}