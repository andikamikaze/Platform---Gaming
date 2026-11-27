/*
  poly-tribes.js — strategi suku bergiliran terinspirasi The Battle of Polytopia.
  - Simpan file ini di games/poly-tribes.js (id META = nama file).
  - Regenerate manifest: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "poly-tribes",
    name: "Poly Tribes",
    category: "strategy",
    catLabel: "Strategi",
    desc: "Strategi suku bergiliran ala Polytopia: jelajahi peta acak, kumpulkan bintang, riset teknologi, latih pasukan, dan rebut ibu kota lawan.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 39L21 15l14 24"/><path d="M15 39v-9h12v9"/><path d="M5 39h32"/><path d="M40 41l4-28"/><path d="M44 13l-3 3m3-3l3 3"/></svg>',
    bg: ["#22c55e", "#14532d"],
};

/* ================= konstanta aturan main ================= */

const CELL = 40, PAD = 6;
const REVEAL = 2;            // radius kabut yang dibuka
const START_STARS = 5;
const FRUIT_STARS = 2;
const RUINS_STARS = 5;
const WORKSHOP_COST = 4;
const MAX_LEVEL = 3;
const ATK_MULT = 4.5;        // konstanta.damage ala Polytopia

const SIZES = {
    s: { w: 12, h: 9, label: "Kecil", villages: 4 },
    m: { w: 14, h: 11, label: "Sedang", villages: 5 },
    l: { w: 16, h: 12, label: "Besar", villages: 7 },
};

const UNITS = {
    warrior: { label: "Prajurit", hp: 10, atk: 2, def: 2, move: 1, range: 1, cost: 2, tech: null },
    rider: { label: "Berkuda", hp: 10, atk: 2, def: 1, move: 2, range: 1, cost: 3, tech: "riding" },
    archer: { label: "Pemanah", hp: 8, atk: 2, def: 1, move: 1, range: 2, cost: 3, tech: "archery" },
    swordsman: { label: "Pendekar", hp: 15, atk: 3, def: 3, move: 1, range: 1, cost: 5, tech: "smithery" },
};

const TECHS = {
    riding: { label: "Berkuda", cost: 4, desc: "Membuka unit Berkuda — gerak 2 petak." },
    archery: { label: "Panah", cost: 4, desc: "Membuka Pemanah — serang dari jarak 2." },
    smithery: { label: "Tempa", cost: 6, desc: "Membuka Pendekar — unit terkuat." },
    farming: { label: "Bertani", cost: 5, desc: "Membuka Workshop — naikkan level kota." },
};

const TRIBES = {
    imperius: { label: "Imperius", desc: "+3 bintang di awal permainan", start: 3, income: 0, discount: 0 },
    xinxi: { label: "Xin-Xi", desc: "+1 bintang setiap giliran", start: 0, income: 1, discount: 0 },
    bardur: { label: "Bardur", desc: "Semua unit lebih murah 1 bintang", start: 0, income: 0, discount: 1 },
};

const CITY_NAMES = ["Hearth", "Fallow", "Veng", "Brook", "Harrow", "Milfield", "Rukk", "Ost", "Brim", "Keld", "Wynn", "Tarn"];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = DIRS4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
const COL = { 0: "#4f8df0", 1: "#ef6a5e", "-1": "#aeb6c2" };
const ZOOMS = [1, 1.4, 1.9, 2.5];

const slotName = (i) => (i === 0 ? "Biru" : "Merah");
const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
const isPassable = (ch) => ch !== "m" && ch !== "w";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= RNG ber-seed (peta deterministik) ================= */

function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}
function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const makeRng = (seed) => mulberry32(hashSeed(String(seed))());
const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/* ================= generator peta acak yang pasti bisa diselesaikan ================= */

function generateMap(seed, sizeKey) {
    const sz = SIZES[sizeKey] || SIZES.m;
    const w = sz.w, h = sz.h;
    const rnd = makeRng(seed + ":" + sizeKey);
    const ri = (n) => Math.floor(rnd() * Math.max(1, n));
    const g = Array.from({ length: h }, () => Array(w).fill("."));
    const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

    // blob terrain: danau, hutan, gunung
    const blob = (ch, n, size, onlyField) => {
        for (let i = 0; i < n; i++) {
            let x = ri(w), y = ri(h);
            for (let j = 0; j < size; j++) {
                if (inB(x, y) && (!onlyField || g[y][x] === ".")) g[y][x] = ch;
                const d = DIRS4[ri(4)]; x += d[0]; y += d[1];
            }
        }
    };
    blob("w", Math.max(2, Math.round((w * h) / 60)), 7, false);
    blob("f", Math.round((w * h) / 14), 4, true);
    blob("m", Math.round((w * h) / 26), 3, true);

    // ibu kota di sudut berseberangan (diagonal diacak)
    const leftA = rnd() < 0.5;
    const ax = leftA ? 1 + ri(Math.floor(w / 3)) : w - 2 - ri(Math.floor(w / 3));
    const ay = 1 + ri(Math.floor(h / 3));
    const bx = leftA ? w - 2 - ri(Math.floor(w / 3)) : 1 + ri(Math.floor(w / 3));
    const by = h - 2 - ri(Math.floor(h / 3));
    const clear3 = (cx, cy) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            if (inB(cx + dx, cy + dy)) g[cy + dy][cx + dx] = ".";
    };
    clear3(ax, ay); clear3(bx, by);

    const cities = [
        { x: ax, y: ay, owner: 0, cap: true, level: 1 },
        { x: bx, y: by, owner: 1, cap: true, level: 1 },
    ];

    // desa netral (tanpa penjaga — langsung diinjak untuk direbut)
    let tries = 0;
    while (cities.length < 2 + sz.villages && tries++ < 400) {
        const x = ri(w), y = ri(h);
        if (!isPassable(g[y][x])) continue;
        let ok = true;
        for (const c of cities) {
            const d = dist(x, y, c.x, c.y);
            if (d < (c.cap ? 3 : 2)) { ok = false; break; }
        }
        if (!ok) continue;
        g[y][x] = ".";
        cities.push({ x, y, owner: -1, cap: false, level: 1 });
    }

    const cityHere = (x, y) => cities.some((c) => c.x === x && c.y === y);
    const scatter = (ch, n) => {
        let t = 0;
        while (n > 0 && t++ < 400) {
            const x = ri(w), y = ri(h);
            if (g[y][x] === "." && !cityHere(x, y)) { g[y][x] = ch; n--; }
        }
    };
    scatter("F", Math.round((w * h) / 26) + 2);
    scatter("R", Math.max(2, Math.round((w * h) / 50)));

    // jamin konektivitas: BFS dari ibu kota A, bor jalur L bila ada yang terputus
    const reachableFrom = (sx, sy) => {
        const seen = Array.from({ length: h }, () => Array(w).fill(false));
        seen[sy][sx] = true;
        const q = [[sx, sy]];
        while (q.length) {
            const [x, y] = q.shift();
            for (const d of DIRS4) {
                const nx = x + d[0], ny = y + d[1];
                if (!inB(nx, ny) || seen[ny][nx] || !isPassable(g[ny][nx])) continue;
                seen[ny][nx] = true; q.push([nx, ny]);
            }
        }
        return seen;
    };
    const carve = (cx, cy) => {
        let x = cx, y = cy;
        while (x !== ax) { if (!isPassable(g[y][x])) g[y][x] = "."; x += Math.sign(ax - x); }
        while (y !== ay) { if (!isPassable(g[y][x])) g[y][x] = "."; y += Math.sign(ay - y); }
    };
    for (let pass = 0; pass < 3; pass++) {
        const seen = reachableFrom(ax, ay);
        let fixed = true;
        for (const c of cities) if (!seen[c.y][c.x]) { carve(c.x, c.y); fixed = false; }
        if (fixed) break;
    }

    // nama kota (kocok ber-seed)
    const pool = CITY_NAMES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = ri(i + 1); const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    cities.forEach((c, i) => { c.id = i + 1; c.name = pool[i % pool.length]; });

    return { w, h, rows: g.map((r) => r.join("")), cities };
}

/* ================= mekanik inti (murni, bekerja pada objek state) ================= */

const zeros = (w, h) => Array.from({ length: h }, () => "0".repeat(w));
const pushLog = (st, msg) => { st.log.unshift(msg); st.log = st.log.slice(0, 8); };
const unitAt = (st, x, y) => st.units.find((u) => u.x === x && u.y === y) || null;
const unitById = (st, id) => st.units.find((u) => u.id === id) || null;
const cityAt = (st, x, y) => st.cities.find((c) => c.x === x && c.y === y) || null;
const isExplored = (st, slot, x, y) => st.explored[slot][y][x] === "1";
const incomeOf = (st, slot) =>
    st.cities.filter((c) => c.owner === slot).reduce((s, c) => s + c.level, 0) + TRIBES[st.tribes[slot]].income;
const unitCostFor = (st, slot, type) => Math.max(1, UNITS[type].cost - TRIBES[st.tribes[slot]].discount);

function setChar(rows, x, y, ch) {
    rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
function reveal(st, slot, x, y, r) {
    const rows = st.explored[slot].slice();
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
        rows[ny] = rows[ny].slice(0, nx) + "1" + rows[ny].slice(nx + 1);
    }
    st.explored[slot] = rows;
}
function mkUnit(st, owner, type, x, y) {
    return { id: st.nextId++, owner, t: type, x, y, hp: UNITS[type].hp, moved: false, attacked: false };
}
function spawnSpot(st, c) {
    if (!unitAt(st, c.x, c.y)) return { x: c.x, y: c.y };
    for (const d of DIRS8) {
        const nx = c.x + d[0], ny = c.y + d[1];
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
        if (isPassable(st.rows[ny][nx]) && !unitAt(st, nx, ny)) return { x: nx, y: ny };
    }
    return null;
}
function reachableTiles(st, u) {
    const mv = UNITS[u.t].move;
    const seen = Array.from({ length: st.h }, () => Array(st.w).fill(false));
    seen[u.y][u.x] = true;
    const q = [[u.x, u.y, 0]];
    const out = [];
    while (q.length) {
        const [x, y, d] = q.shift();
        if (d >= mv) continue;
        for (const dir of DIRS4) {
            const nx = x + dir[0], ny = y + dir[1];
            if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h || seen[ny][nx]) continue;
            if (!isPassable(st.rows[ny][nx])) continue;
            const occ = unitAt(st, nx, ny);
            if (occ && occ.owner !== u.owner) continue; // boleh lewat kawan, tak boleh lewat lawan
            seen[ny][nx] = true;
            if (!occ) out.push({ x: nx, y: ny });
            q.push([nx, ny, d + 1]);
        }
    }
    return out;
}
function previewDamage(st, a, d) {
    const A = UNITS[a.t], D = UNITS[d.t];
    const af = A.atk * (a.hp / A.hp);
    const df = D.def * (d.hp / D.hp) * (st.rows[d.y][d.x] === "f" ? 1.5 : 1);
    const tot = af + df || 1;
    return {
        hit: Math.max(1, Math.round((af / tot) * A.atk * ATK_MULT)),
        back: Math.round((df / tot) * D.def * ATK_MULT),
    };
}
function removeUnit(st, u) { st.units = st.units.filter((x) => x.id !== u.id); }

function capture(st, c, slot) {
    c.owner = slot;
    pushLog(st, `${slotName(slot)} merebut ${c.name}!`);
    if (c.cap) {
        st.phase = "over";
        st.winner = slot;
        st.reason = `Ibu kota ${slotName(1 - slot)} jatuh pada giliran ${st.turn}.`;
    }
}
function doMove(st, u, x, y) {
    u.x = x; u.y = y; u.moved = true;
    const ch = st.rows[y][x];
    if (ch === "F" || ch === "R") {
        setChar(st.rows, x, y, ".");
        const gain = ch === "F" ? FRUIT_STARS : RUINS_STARS;
        st.stars[u.owner] += gain;
        pushLog(st, `${slotName(u.owner)} mengambil ${ch === "F" ? "buah" : "reruntuhan"} +${gain}⭐.`);
    }
    const c = cityAt(st, x, y);
    if (c && c.owner !== u.owner && !unitAt(st, x, y)) capture(st, c, u.owner);
    reveal(st, u.owner, x, y, REVEAL);
}
function doAttack(st, a, d) {
    const A = UNITS[a.t], D = UNITS[d.t];
    const { hit, back } = previewDamage(st, a, d);
    a.attacked = true; a.moved = true;
    d.hp -= hit;
    pushLog(st, `${A.label} ${slotName(a.owner)} menyerang ${D.label} (-${hit}).`);
    if (d.hp <= 0) {
        removeUnit(st, d);
        pushLog(st, `${D.label} ${slotName(d.owner)} gugur.`);
    } else if (dist(a.x, a.y, d.x, d.y) <= D.range && back > 0) {
        a.hp -= back;
        pushLog(st, `Balasan! ${A.label} ${slotName(a.owner)} -${back}.`);
        if (a.hp <= 0) { removeUnit(st, a); pushLog(st, `${A.label} ${slotName(a.owner)} gugur.`); }
    }
}
function beginTurn(st, slot) {
    const inc = incomeOf(st, slot);
    st.stars[slot] += inc;
    for (const u of st.units) if (u.owner === slot) { u.moved = false; u.attacked = false; }
    pushLog(st, `Giliran ${slotName(slot)}: +${inc}⭐ dari kota.`);
}
function endTurnFor(st) {
    st.active = 1 - st.active;
    if (st.active === st.first) st.turn++;
    beginTurn(st, st.active);
}

function newState({ seed, size, mode, tribes, slotOf, first }) {
    const m = generateMap(seed, size);
    const st = {
        v: 1, mode, seed, size,
        w: m.w, h: m.h, rows: m.rows, cities: m.cities,
        units: [], nextId: 1,
        stars: [START_STARS + TRIBES[tribes[0]].start, START_STARS + TRIBES[tribes[1]].start],
        techs: [{}, {}],
        explored: [zeros(m.w, m.h), zeros(m.w, m.h)],
        tribes, slotOf, first, active: first,
        turn: 1, phase: "playing", winner: null, reason: "",
        log: [],
    };
    for (const c of st.cities) {
        if (!c.cap) continue;
        st.units.push(mkUnit(st, c.owner, "warrior", c.x, c.y));
        reveal(st, c.owner, c.x, c.y, REVEAL);
    }
    pushLog(st, `Undian koin: ${slotName(first)} jalan lebih dulu.`);
    beginTurn(st, first);
    return st;
}

/* Firebase kadang menghapus array/objek kosong — pulihkan bentuk state. */
function normState(s) {
    if (!s) return null;
    s.units = s.units || [];
    s.cities = s.cities || [];
    s.rows = s.rows || [];
    s.log = s.log || [];
    s.stars = s.stars || [0, 0];
    s.tribes = s.tribes || ["imperius", "bardur"];
    s.slotOf = s.slotOf || [0, 1];
    s.techs = [0, 1].map((i) => (s.techs && s.techs[i]) || {});
    s.explored = [0, 1].map((i) => {
        const arr = (s.explored && s.explored[i]) || null;
        if (!arr) return zeros(s.w, s.h);
        return Array.from({ length: s.h }, (_, y) => String(arr[y] || "0".repeat(s.w)));
    });
    return s;
}

/* ================= Bot sederhana (mode AI, slot 1) ================= */

function runBot(st) {
    const me = 1, foe = 0;
    // riset satu teknologi per giliran
    for (const k of ["riding", "archery", "smithery", "farming"]) {
        if (!st.techs[me][k] && st.stars[me] >= TECHS[k].cost + 2) {
            st.techs[me][k] = true; st.stars[me] -= TECHS[k].cost;
            pushLog(st, `${slotName(me)} meriset ${TECHS[k].label}.`);
            break;
        }
    }
    // latih unit di kota
    const myCities = st.cities.filter((c) => c.owner === me);
    const limit = myCities.length * 3 + 1;
    for (const c of myCities) {
        if (st.units.filter((u) => u.owner === me).length >= limit) break;
        const order = ["swordsman", "rider", "archer", "warrior"];
        const type = order.find((t) => (!UNITS[t].tech || st.techs[me][UNITS[t].tech]) && st.stars[me] >= UNITS[t].cost);
        if (!type) continue;
        const sp = spawnSpot(st, c);
        if (!sp) continue;
        st.stars[me] -= UNITS[type].cost;
        const u = mkUnit(st, me, type, sp.x, sp.y);
        u.moved = u.attacked = true; // siap giliran depan
        pushLog(st, `${slotName(me)} melatih ${UNITS[type].label} di ${c.name}.`);
    }
    // workshop ibu kota
    if (st.techs[me].farming) {
        const cap = myCities.find((c) => c.cap);
        if (cap && cap.level < MAX_LEVEL && st.stars[me] >= WORKSHOP_COST + 3) {
            st.stars[me] -= WORKSHOP_COST; cap.level++;
            pushLog(st, `${cap.name} tumbuh ke level ${cap.level}.`);
        }
    }
    // aksi unit
    const pickTarget = (u) => {
        const ts = st.units.filter((f) => f.owner === foe && dist(u.x, u.y, f.x, f.y) <= UNITS[u.t].range);
        ts.sort((a, b) => {
            const ka = previewDamage(st, u, a).hit >= a.hp ? 0 : 1;
            const kb = previewDamage(st, u, b).hit >= b.hp ? 0 : 1;
            return ka - kb || a.hp - b.hp;
        });
        return ts[0] || null;
    };
    for (const u of st.units.filter((x) => x.owner === me)) {
        if (st.phase !== "playing") return;
        if (u.hp <= 0 || u.attacked) continue;
        const t0 = pickTarget(u);
        if (t0) { doAttack(st, u, t0); continue; }
        const foes = st.units.filter((f) => f.owner === foe);
        const goals = st.cities.filter((c) => c.owner !== me).map((c) => ({ x: c.x, y: c.y }))
            .concat(foes.map((f) => ({ x: f.x, y: f.y })));
        if (!goals.length) continue;
        const gd = (x, y) => Math.min(...goals.map((g) => dist(x, y, g.x, g.y)));
        let best = null, bestScore = -gd(u.x, u.y) * 2;
        for (const p of reachableTiles(st, u)) {
            let sc = -gd(p.x, p.y) * 2;
            const c = cityAt(st, p.x, p.y);
            if (c && c.owner !== me && !unitAt(st, p.x, p.y)) sc += 100 + (c.cap ? 50 : 0);
            for (const f of foes) {
                if (dist(p.x, p.y, f.x, f.y) <= UNITS[u.t].range) {
                    sc += 30;
                    if (previewDamage(st, u, f).hit >= f.hp) sc += 40;
                }
            }
            if (sc > bestScore + 0.01) { bestScore = sc; best = p; }
        }
        if (best) {
            doMove(st, u, best.x, best.y);
            if (st.phase !== "playing") return;
            if (!u.attacked) { const t2 = pickTarget(u); if (t2) doAttack(st, u, t2); }
        }
    }
}

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // indeks koneksi: host=0, guest=1
    let roomData = room?.room || null;

    let state = null;
    let sel = null;                 // {kind:'unit',id} | {kind:'city',x,y}
    let cursor = { x: 1, y: 1 };    // kursor keyboard
    let showCursor = false;
    let zoomIdx = 0;
    let modalKind = null, modalData = null, modalLocked = false, lastModalView = null;
    let helpOpen = false, cheatsOpen = false, paused = false;
    let pauseAt = 0, timeShift = 0;   // penanda waktu di-geser saat resume dari jeda
    let overShown = false, lastActive = null, lastKey = "";
    let toastTimer = null, toastDue = 0, toastRemain = 0, pan = null, dragSuppress = false, mounted = true;
    const setupPick = { tribe: "imperius", size: "m", seed: "" };

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("polyTribesHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("polyTribesHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    const $ = (s) => root.querySelector(s);
    const now = () => Date.now() - timeShift;
    const overlayOpen = () => helpOpen || cheatsOpen || paused || !!modalKind;
    const mySlot = () => (online && state ? state.slotOf[playerIndex] : 0);
    const myTurn = () => !!state && state.phase === "playing" && state.active === mySlot();

    root.innerHTML = `
<div class="game-app pt game-fill" data-pt>
<style>
/* Poly Tribes — satu bar HUD, board mengisi ruang, semua panel jadi overlay. */
.pt{--bg:#0f1319;--panel:#161b23;--panel2:#1b2230;--line:#ffffff14;--text:#e8ebf1;--dim:#98a2b3;--accent:#5b8cff;--good:#3ecf8e;--warn:#f5b84f;--bad:#ff5d52;
  width:100%;height:100%;min-height:0;max-width:1100px;margin:0 auto;padding:8px;display:flex;flex-direction:column;gap:8px;color:var(--text);outline:none;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.5}
.pt *{box-sizing:border-box}
.pt [hidden]{display:none!important}
.pt :is(button,input):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pt-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:none}
.pt-hud-info{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1 1 auto;min-width:0}
.pt-hud-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:none}
.pt-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:600;white-space:nowrap}
.pt-chip b{font-weight:700;font-variant-numeric:tabular-nums}
.pt-chip i{font-style:normal;color:var(--dim);font-weight:500}
.pt-dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none;background:#556}
.pt-chip-sel{flex:1 1 140px;min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;color:var(--dim);font-weight:500}
.pt-chip-log{flex:0 1 190px;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dim);font-weight:500}
.pt-spacer{flex:1 1 auto}
.pt-btn{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;min-height:32px;transition:background .15s,border-color .15s}
.pt-btn:hover:not(:disabled){background:#232c3f;border-color:var(--accent)}
.pt-btn:disabled{opacity:.45;cursor:default}
.pt-btn.primary{background:var(--accent);border-color:transparent;color:#fff}
.pt-btn.primary:hover:not(:disabled){background:#6f9aff}
.pt-btn.ghost{background:transparent}
.pt-btn.small{min-height:32px;padding:5px 9px;font-size:11.5px}
.pt-icon-btn{display:inline-flex;align-items:center;gap:5px}
.pt-icon-btn svg{flex:none;display:block}
.pt-btn-label{white-space:nowrap}
.pt .pt-i-play,.pt.paused .pt-i-pause{display:none}
.pt.paused .pt-i-play{display:block}
.pt.game-fill>.pt-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;flex-direction:column;overflow:hidden;padding:0;margin:0;border:1px solid var(--line);border-radius:12px;background:#0c1117}
.pt-mapwrap{position:relative;flex:1 1 auto;min-height:0;overflow:auto;border-radius:12px;background:#0c1117}
.pt-mapwrap svg{display:block;width:100%;height:auto;touch-action:pan-x pan-y}
.pt-zoom{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:6px;z-index:2}
.pt-zoom .pt-btn{min-width:32px;justify-content:center;background:#161b23ee}
.pt-hit{fill:transparent;cursor:pointer}
.pt-hit:hover{fill:#ffffff22}
.pt-selr{animation:ptPulse 1.1s ease-in-out infinite}
@keyframes ptPulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.25}}
.pt-overlay{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:12px;background:rgba(6,9,14,.78)}
.pt-modal{width:min(600px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.pt-modal-scroll{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:thin}
.pt-modal h3{margin:0 0 8px;font-size:17px}
.pt-modal h4{margin:14px 0 6px;font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.6px}
.pt-modal p{margin:8px 0;font-size:13px;color:#c6cdd9}
.pt-modal ul{margin:8px 0;padding-left:18px;font-size:13px;color:#c6cdd9}
.pt-modal li{margin:4px 0}
.pt-row{display:flex;align-items:center;gap:12px;justify-content:space-between;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px}
.pt-row .pt-rl{min-width:0}
.pt-row .pt-rl b{font-size:13px}
.pt-row .pt-rl small{display:block;color:var(--dim);font-size:11.5px}
.pt-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.pt-card{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px;min-height:44px;text-align:left;color:var(--text);font:inherit;cursor:pointer}
.pt-card:disabled{opacity:.45;cursor:default}
.pt-card b{font-size:13px;display:block}
.pt-card small{color:var(--dim);font-size:11.5px;display:block;margin-top:4px}
.pt-tribe{display:block;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:8px;color:var(--text);font:inherit;cursor:pointer}
.pt-tribe small{display:block;color:var(--dim);font-size:12px}
.pt-tribe.on{border-color:var(--good);box-shadow:inset 0 0 0 1px var(--good)}
.pt-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.pt-pick{background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:8px 14px;min-height:40px;color:var(--text);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.pt-pick.on{border-color:var(--good)}
.pt-input{width:100%;background:#0f141c;border:1px solid var(--line);border-radius:8px;color:var(--text);padding:8px 12px;min-height:40px;font:inherit;font-size:13px;margin-top:8px}
.pt-modalbtns{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;position:sticky;bottom:0;padding:10px 0 0;background:var(--panel);border-top:1px solid var(--line);z-index:1}
.pt-modalbtns .pt-btn{flex:1;min-height:38px}
.pt-kbd{background:#0f141c;border:1px solid var(--line);border-radius:6px;padding:1px 7px;font-size:11.5px;font-family:ui-monospace,monospace}
.pt-toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);max-width:calc(100% - 32px);background:#1c2430;border:1px solid var(--line);border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;z-index:60;box-shadow:0 4px 12px #0006}
.pt-owned{color:var(--good);font-weight:700;font-size:12px;white-space:nowrap}
.pt-note{color:var(--dim);font-size:11.5px;margin-top:10px}
@media (max-width:640px){
  .pt{gap:6px;padding:6px}
  .pt-chip{padding:4px 7px;font-size:10.5px}
  .pt-modal{padding:12px}
  .pt-modal-scroll{scrollbar-width:none}
  .pt-modal-scroll::-webkit-scrollbar{display:none}
  .pt-cards{grid-template-columns:1fr}
  .pt-note{display:none}
}
@media (prefers-reduced-motion:reduce){.pt-selr{animation:none}.pt *{transition-duration:.01ms!important}}

/* --- layout overrides terakhir (mengalahkan pointer:coarse 44px) --- */
.pt .pt-hud .pt-btn{min-height:32px;padding:5px 9px;font-size:10px}
@media (max-width:640px){
  .pt.game-fill>.pt-board:not(:has(.pt-overlay:not([hidden]))){aspect-ratio:16/9;flex:0 0 auto}
  .pt.game-fill>.pt-board:has(.pt-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .pt .pt-hud{flex-direction:column;align-items:stretch;gap:4px;margin-bottom:2px}
  .pt .pt-hud-info{flex-wrap:nowrap;overflow:hidden}
  .pt .pt-hud-actions{flex-wrap:nowrap;gap:3px;overflow-x:auto;scrollbar-width:none}
  .pt .pt-hud-actions::-webkit-scrollbar{display:none}
  .pt .pt-hud .pt-chip{padding:4px 6px;font-size:9px}
  .pt .pt-hud .pt-chip-log,.pt .pt-hud [data-act="menu"]{display:none}
  .pt .pt-hud .pt-chip-sel{flex:1 1 auto;min-width:0;font-size:9px}
  .pt .pt-hud .pt-btn{min-height:32px;padding:5px 8px;font-size:9px;flex:none}
  .pt .pt-hud .pt-btn-label,.pt .pt-hud .pt-spacer{display:none}
  .pt .pt-overlay{padding:8px}
  .pt .pt-modal{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .pt .pt-modalbtns{position:static;margin:10px 0 0;padding:8px 0 0}
}
@media (pointer:coarse){
  .pt .pt-hud .pt-btn{min-height:32px;padding:5px 9px;font-size:9px}
}
</style>

<div class="pt-hud">
  <div class="pt-hud-info">
    <span class="pt-chip">⭐ <b data-hud="stars">–</b> <i data-hud="income"></i></span>
    <span class="pt-chip">Giliran <b data-hud="turn">–</b></span>
    <span class="pt-chip"><span class="pt-dot" data-hud="dot"></span><span data-hud="who">Siap</span></span>
    <span class="pt-chip pt-chip-sel" data-el="selbar">Pilih suku dan ukuran peta.</span>
    <span class="pt-chip pt-chip-log" data-el="ticker"></span>
    <span class="pt-spacer"></span>
  </div>
  <div class="pt-hud-actions">
    <button class="pt-btn pt-icon-btn" type="button" data-act="tech" aria-label="Teknologi" title="Teknologi (T)">${iconSVG("bookOpen", { size: 14 })}<span class="pt-btn-label">Tech</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-act="city" aria-label="Kota" title="Kota (K)">${iconSVG("home", { size: 14 })}<span class="pt-btn-label">City</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-act="nextunit" aria-label="Unit berikutnya" title="Unit berikutnya (N)">${iconSVG("refresh", { size: 14 })}<span class="pt-btn-label">Next</span></button>
    <button class="pt-btn pt-icon-btn primary" type="button" data-act="end" data-el="endbtn" aria-label="Akhiri giliran" title="Akhiri giliran (E)">${iconSVG("arrowRight", { size: 14 })}<span class="pt-btn-label">End</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-act="menu" aria-label="Menu" title="Menu (M)">${iconSVG("menu", { size: 14 })}<span class="pt-btn-label">Menu</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pt-btn-label">Help</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-cheats data-el="cheatbtn" aria-label="Cheats" title="Cheats (C)" ${online ? "hidden" : ""}>${iconSVG("wrench", { size: 14 })}<span class="pt-btn-label">Cheats</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14, className: "pt-i-pause" })}${iconSVG("play", { size: 14, className: "pt-i-play" })}<span class="pt-btn-label">Pause</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)" ${online && !room?.isHost ? "disabled" : ""}>${iconSVG("rotateCcw", { size: 14 })}<span class="pt-btn-label">Restart</span></button>
    <button class="pt-btn pt-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pt-btn-label">Exit</span></button>
  </div>
</div>
<section class="game-panel pt-board" data-board>
  <div class="pt-mapwrap" data-el="mapwrap">
    <svg data-el="svg" role="img" aria-label="Peta Poly Tribes"></svg>
  </div>
  <div class="pt-zoom">
    <button class="pt-btn pt-icon-btn" type="button" data-act="zoomin" aria-label="Perbesar" title="Perbesar (+)">${iconSVG("zoomIn", { size: 14 })}</button>
    <button class="pt-btn pt-icon-btn" type="button" data-act="zoomout" aria-label="Perkecil" title="Perkecil (−)">${iconSVG("zoomOut", { size: 14 })}</button>
    <button class="pt-btn pt-icon-btn" type="button" data-act="nextunit" aria-label="Unit berikutnya" title="Unit berikutnya (N)">${iconSVG("refresh", { size: 14 })}</button>
  </div>
  <div class="pt-overlay" data-el="overlay" hidden><div class="pt-modal" data-el="modal"></div></div>
</section>
<div class="pt-toast" data-el="toast" hidden></div>
</div>`;

    const app = $("[data-pt]");
    const svg = $('[data-el="svg"]');
    const wrap = $('[data-el="mapwrap"]');
    const ticker = $('[data-el="ticker"]');
    const selbar = $('[data-el="selbar"]');
    const overlay = $('[data-el="overlay"]');
    const modal = $('[data-el="modal"]');
    const toastEl = $('[data-el="toast"]');
    const endBtn = $('[data-el="endbtn"]');
    const cheatBtn = $('[data-el="cheatbtn"]');
    const pauseBtn = $("[data-pause]");
    const hud = {
        stars: $('[data-hud="stars"]'), income: $('[data-hud="income"]'),
        turn: $('[data-hud="turn"]'), who: $('[data-hud="who"]'), dot: $('[data-hud="dot"]'),
    };
    cheatBtn.hidden = online;

    /* ---------------- util UI ---------------- */

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastRemain = 2400; toastDue = now() + toastRemain;
        if (!paused) toastTimer = setTimeout(() => { toastEl.hidden = true; toastTimer = null; }, toastRemain);
    }
    function armToast(ms) {
        clearTimeout(toastTimer);
        toastRemain = ms; toastDue = now() + ms;
        toastTimer = setTimeout(() => { toastEl.hidden = true; toastTimer = null; }, ms);
    }
    function activeView() {
        if (helpOpen) return "help";
        if (cheatsOpen) return "cheat";
        if (paused) return "pause";
        return modalKind;
    }
    function renderModalHtml(force) {
        const view = activeView();
        if (!view) { overlay.hidden = true; lastModalView = null; return; }
        overlay.hidden = false;
        if (force || view !== lastModalView || ["tech", "city", "cheat", "menu"].includes(view)) {
            modal.innerHTML = '<div class="pt-modal-scroll">' + buildModal(view) + "</div>";
            lastModalView = view;
        }
    }
    function openModal(kind, data = {}) {
        modalKind = kind; modalData = data; modalLocked = !!data.locked;
        renderModalHtml(true);
    }
    function clearOverlays() {
        helpOpen = false; cheatsOpen = false;
        if (paused) {
            timeShift += Date.now() - pauseAt;
            pauseAt = 0; paused = false;
            if (toastRemain > 0) armToast(toastRemain);
            else toastRemain = 0;
        }
        modalKind = null; modalData = null; modalLocked = false;
    }
    function closeModal(force) {
        if (force) { clearOverlays(); render(); return; }
        if (modalLocked) return;
        if (helpOpen) { helpOpen = false; render(); return; }
        if (cheatsOpen) { cheatsOpen = false; render(); return; }
        if (paused) { togglePause(false); return; }
        modalKind = null; modalData = null; modalLocked = false;
        render();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function toggleCheats(on) {
        if (online || paused || !state) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
    }
    /* Jeda: hentikan bot/timer dan geser penanda Date.now() saat resume. */
    function togglePause(on) {
        if (online || !state) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        if (next) {
            pauseAt = Date.now();
            toastRemain = Math.max(0, toastDue - now());
            clearTimeout(toastTimer); toastTimer = null;
            cheatsOpen = false;
            paused = true;
        } else {
            timeShift += Date.now() - pauseAt;
            pauseAt = 0;
            paused = false;
            if (toastRemain > 0) armToast(toastRemain);
            else toastRemain = 0;
        }
        render();
    }
    function forceCloseAll() {
        clearOverlays();
        render();
    }
    function restartGame() {
        forceCloseAll();
        if (online) { if (room.isHost) submitAction({ type: "rematch" }); }
        else { openModal("setup", { locked: true }); }
        render();
    }
    function setZoom(i) {
        zoomIdx = clamp(i, 0, ZOOMS.length - 1);
        svg.style.width = ZOOMS[zoomIdx] * 100 + "%";
    }
    function centerOn(x, y) {
        if (!state) return;
        const vw = state.w * CELL + PAD * 2;
        const scale = svg.getBoundingClientRect().width / vw || 1;
        wrap.scrollTo({
            left: (PAD + x * CELL + CELL / 2) * scale - wrap.clientWidth / 2,
            top: (PAD + y * CELL + CELL / 2) * scale - wrap.clientHeight / 2,
            behavior: "smooth",
        });
    }

    /* ---------------- alur state ---------------- */

    function adoptState() {
        if (!state) return;
        const cap = state.cities.find((c) => c.cap && c.owner === mySlot());
        if (cap) cursor = { x: cap.x, y: cap.y };
        sel = null; overShown = false; lastActive = state.active;
    }
    function publish() {
        render();
        if (online && room.isHost && state) room.publishState(state).catch(console.warn);
    }
    function submitAction(action) {
        if (paused || helpOpen) return;
        if (cheatsOpen && action.type !== "cheat") return;
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function afterPlayerAction() {
        if (paused || helpOpen || cheatsOpen) return;
        // selesaikan giliran bot secara sinkron (mode AI)
        if (!online && state && state.phase === "playing" && state.active === 1) {
            runBot(state);
            if (state.phase === "playing") endTurnFor(state);
        }
        publish();
    }

    function applyAction(action, actorConn) {
        if (!state || !action) return;
        if (paused || helpOpen) return;
        if (cheatsOpen && action.type !== "cheat") return;
        if (action.type === "rematch") {
            if (online && actorConn !== 0) return; // hanya host
            startOnline(true);
            return;
        }
        if (state.phase !== "playing") return;
        if (action.type === "cheat") {
            if (online) return;
            doCheat(action.kind);
            publish();
            return;
        }
        const slot = online ? state.slotOf[actorConn] : 0;
        if (slot !== state.active) return; // bukan giliranmu

        switch (action.type) {
            case "move": {
                const u = unitById(state, action.unitId);
                if (!u || u.owner !== slot || u.moved || u.attacked) return;
                const ok = reachableTiles(state, u).some((p) => p.x === action.x && p.y === action.y);
                if (!ok) return;
                doMove(state, u, action.x, action.y);
                break;
            }
            case "attack": {
                const a = unitById(state, action.unitId);
                const d = unitById(state, action.targetId);
                if (!a || !d || a.owner !== slot || d.owner === slot || a.attacked) return;
                if (dist(a.x, a.y, d.x, d.y) > UNITS[a.t].range) return;
                if (!isExplored(state, slot, d.x, d.y)) return;
                doAttack(state, a, d);
                break;
            }
            case "train": {
                const c = cityAt(state, action.x, action.y);
                const type = action.unit;
                if (!c || c.owner !== slot || !UNITS[type]) return;
                const gate = UNITS[type].tech;
                if (gate && !state.techs[slot][gate]) return;
                const cost = unitCostFor(state, slot, type);
                if (state.stars[slot] < cost) return;
                const sp = spawnSpot(state, c);
                if (!sp) return;
                state.stars[slot] -= cost;
                const u = mkUnit(state, slot, type, sp.x, sp.y);
                u.moved = u.attacked = true;
                pushLog(state, `${slotName(slot)} melatih ${UNITS[type].label} di ${c.name} (siap giliran depan).`);
                reveal(state, slot, sp.x, sp.y, REVEAL);
                break;
            }
            case "tech": {
                const t = TECHS[action.tech];
                if (!t || state.techs[slot][action.tech] || state.stars[slot] < t.cost) return;
                state.stars[slot] -= t.cost;
                state.techs[slot][action.tech] = true;
                pushLog(state, `${slotName(slot)} meriset ${t.label}.`);
                break;
            }
            case "workshop": {
                const c = cityAt(state, action.x, action.y);
                if (!c || c.owner !== slot || !state.techs[slot].farming) return;
                if (c.level >= MAX_LEVEL || state.stars[slot] < WORKSHOP_COST) return;
                state.stars[slot] -= WORKSHOP_COST;
                c.level++;
                pushLog(state, `${c.name} tumbuh ke level ${c.level}.`);
                break;
            }
            case "end":
                endTurnFor(state);
                break;
            default:
                return;
        }
        afterPlayerAction();
    }

    function doCheat(kind) {
        const me = 0;
        if (kind === "stars") { state.stars[me] += 25; pushLog(state, "🪄 Cheat: +25 bintang."); }
        else if (kind === "reveal") { state.explored[me] = Array.from({ length: state.h }, () => "1".repeat(state.w)); pushLog(state, "🪄 Cheat: seluruh peta terbuka."); }
        else if (kind === "refresh") { for (const u of state.units) if (u.owner === me) { u.moved = false; u.attacked = false; } pushLog(state, "🪄 Cheat: semua unit siap lagi."); }
        else if (kind === "level") { for (const c of state.cities) if (c.owner === me) c.level = Math.min(MAX_LEVEL, c.level + 1); pushLog(state, "🪄 Cheat: semua kotamu naik level."); }
        else if (kind === "smite") {
            for (const u of state.units) if (u.owner === 1) u.hp -= 10;
            state.units = state.units.filter((u) => u.hp > 0);
            pushLog(state, "🪄 Cheat: petir menyambar semua unit lawan (-10 HP).");
        }
    }

    /* ---------------- mulai permainan ---------------- */

    function startAI() {
        const seed = (setupPick.seed || "").trim() || randomSeed();
        const others = Object.keys(TRIBES).filter((k) => k !== setupPick.tribe);
        const botTribe = others[Math.floor(Math.random() * others.length)];
        const first = Math.random() < 0.5 ? 0 : 1; // undian siapa duluan vs bot
        state = newState({
            seed, size: setupPick.size, mode: "ai",
            tribes: [setupPick.tribe, botTribe], slotOf: [0, 1], first,
        });
        adoptState();
        lastKey = state.seed + "|" + state.first;
        closeModal(true);
        if (state.active === 1) { runBot(state); if (state.phase === "playing") endTurnFor(state); }
        publish();
        toast(first === 0 ? "Undian koin: kamu jalan duluan!" : "Undian koin: Bot jalan duluan.");
    }
    function startOnline(isRematch) {
        const keys = Object.keys(TRIBES);
        const i = Math.floor(Math.random() * keys.length);
        let j = Math.floor(Math.random() * (keys.length - 1));
        if (j >= i) j++;
        const tribes = [keys[i], keys[j]];
        // acak slot: koneksi host/guest dipetakan ke posisi/warna secara acak
        const slotOf = Math.random() < 0.5 ? [0, 1] : [1, 0];
        const first = Math.random() < 0.5 ? 0 : 1;
        state = newState({ seed: randomSeed(), size: "m", mode: "online", tribes, slotOf, first });
        adoptState();
        lastKey = state.seed + "|" + state.first;
        closeModal(true);
        publish();
        toast(`${isRematch ? "Rematch! " : ""}Kamu: ${slotName(mySlot())}. Undian: ${slotName(first)} duluan.`);
    }

    /* ---------------- render peta (SVG minimalis pastel) ---------------- */

    function terrainSvg(ch) {
        const base = '<rect x="-19" y="-19" width="38" height="38" rx="4" fill="#e9efdb" stroke="#00000012"/>';
        if (ch === "f") return '<rect x="-19" y="-19" width="38" height="38" rx="4" fill="#d6e4c0" stroke="#00000012"/>'
            + '<polygon points="-12,10 -4,-8 4,10" fill="#7ba368"/><polygon points="-2,12 7,-2 14,12" fill="#6a9459"/>';
        if (ch === "m") return '<rect x="-19" y="-19" width="38" height="38" rx="4" fill="#e2e5eb" stroke="#00000012"/>'
            + '<polygon points="-14,11 0,-12 14,11" fill="#a7b0bf"/><polygon points="-4,-4 0,-12 4,-4 0,0" fill="#f4f6f9"/>';
        if (ch === "w") return '<rect x="-19" y="-19" width="38" height="38" rx="4" fill="#b9d9ee" stroke="#00000012"/>'
            + '<path d="M-12 -4 q5 -4 10 0 t10 0" fill="none" stroke="#ffffffaa" stroke-width="1.6"/>'
            + '<path d="M-12 8 q5 -4 10 0 t10 0" fill="none" stroke="#ffffffaa" stroke-width="1.6"/>';
        if (ch === "F") return base
            + '<circle cx="-6" cy="-2" r="4" fill="#e26d75"/><circle cx="5" cy="-6" r="4" fill="#e26d75"/><circle cx="3" cy="6" r="4" fill="#e26d75"/>';
        if (ch === "R") return base
            + '<rect x="-13" y="-9" width="6" height="19" rx="1" fill="#cfc19b" stroke="#a99c74"/>'
            + '<rect x="5" y="-4" width="6" height="14" rx="1" fill="#cfc19b" stroke="#a99c74"/>';
        return base;
    }
    function hutSvg(c) {
        const col = COL[c.owner];
        let s = '<polygon points="-11,2 0,-11 11,2" fill="' + col + '" stroke="#22303c" stroke-width="1.6"/>'
            + '<rect x="-8" y="2" width="16" height="10" rx="1.5" fill="#d9b98c" stroke="#22303c" stroke-width="1.6"/>'
            + '<rect x="-2.5" y="6" width="5" height="6" fill="#6b4f33"/>';
        if (c.cap) s += '<line x1="0" y1="-11" x2="0" y2="-18" stroke="#22303c" stroke-width="1.6"/>'
            + '<polygon points="0,-18 8,-15.5 0,-13" fill="' + col + '" stroke="#22303c" stroke-width="1"/>';
        for (let i = 0; i < c.level; i++)
            s += '<circle cx="' + (-8 + i * 5) + '" cy="15.5" r="1.8" fill="#fff" stroke="#22303c" stroke-width="0.7"/>';
        return s;
    }
    function unitSvg(u) {
        const col = COL[u.owner], g = "#fff";
        let s = '<circle r="11" fill="' + col + '" stroke="#101826" stroke-width="2"/>';
        if (u.t === "rider") s += '<path d="M-6 -5 L-1 0 L-6 5 M1 -5 L6 0 L1 5" fill="none" stroke="' + g + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
        else if (u.t === "archer") s += '<path d="M-4 -7 Q6 0 -4 7" fill="none" stroke="' + g + '" stroke-width="2.2"/>'
            + '<line x1="-4" y1="-7" x2="-4" y2="7" stroke="' + g + '" stroke-width="1.3"/>'
            + '<line x1="-4" y1="0" x2="7" y2="0" stroke="' + g + '" stroke-width="2"/>';
        else if (u.t === "swordsman") s += '<line x1="-5" y1="-5" x2="5" y2="5" stroke="' + g + '" stroke-width="2.2" stroke-linecap="round"/>'
            + '<line x1="5" y1="-5" x2="-5" y2="5" stroke="' + g + '" stroke-width="2.2" stroke-linecap="round"/>';
        else s += '<line x1="0" y1="-7" x2="0" y2="6" stroke="' + g + '" stroke-width="2.2" stroke-linecap="round"/>'
            + '<line x1="-3" y1="-2.5" x2="3" y2="-2.5" stroke="' + g + '" stroke-width="1.6"/>';
        const max = UNITS[u.t].hp;
        if (u.hp < max) {
            const f = Math.max(0, u.hp / max);
            s += '<rect x="-10" y="-17" width="20" height="3.6" rx="1.8" fill="#0b1020" fill-opacity=".7"/>'
                + '<rect x="-10" y="-17" width="' + (20 * f).toFixed(1) + '" height="3.6" rx="1.8" fill="'
                + (f > 0.5 ? "#3ecf8e" : f > 0.25 ? "#f5b84f" : "#ff5d52") + '"/>';
        }
        return s;
    }

    function renderMap() {
        const st = state, me = mySlot();
        const VW = st.w * CELL + PAD * 2, VH = st.h * CELL + PAD * 2;
        svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
        svg.style.width = ZOOMS[zoomIdx] * 100 + "%";

        let su = null;
        const moveSet = {}, atkSet = {};
        if (sel && sel.kind === "unit") {
            su = unitById(st, sel.id);
            if (su && su.owner === me && myTurn()) {
                if (!su.moved && !su.attacked) for (const p of reachableTiles(st, su)) moveSet[p.x + "," + p.y] = true;
                if (!su.attacked) for (const f of st.units)
                    if (f.owner !== me && isExplored(st, me, f.x, f.y) && dist(su.x, su.y, f.x, f.y) <= UNITS[su.t].range)
                        atkSet[f.x + "," + f.y] = true;
            }
        }
        let s = `<rect x="0" y="0" width="${VW}" height="${VH}" rx="10" fill="#0c1117"/>`;
        for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
            const cx = PAD + x * CELL + CELL / 2, cy = PAD + y * CELL + CELL / 2;
            let g = `<g transform="translate(${cx},${cy})">`;
            if (!isExplored(st, me, x, y)) {
                g += '<rect x="-19" y="-19" width="38" height="38" rx="4" fill="#141a24" stroke="#ffffff08"/>';
            } else {
                g += terrainSvg(st.rows[y][x]);
                const c = cityAt(st, x, y);
                if (c) g += hutSvg(c);
                const u = unitAt(st, x, y);
                if (u) {
                    const spent = u.owner === me && u.attacked;
                    g += "<g" + (spent ? ' opacity=".55"' : "") + ">" + unitSvg(u);
                    if (su && su.id === u.id) g += '<circle class="pt-selr" r="15" fill="none" stroke="#fff" stroke-width="2.4"/>';
                    g += "</g>";
                }
                if (moveSet[x + "," + y]) g += '<circle r="4.5" fill="#fff" fill-opacity=".95" stroke="#00000040" stroke-width="1.2"/>';
                if (atkSet[x + "," + y]) g += '<circle r="15.5" fill="#ff5d5222" stroke="#ff5d52" stroke-width="2.4"/>';
            }
            if (showCursor && cursor.x === x && cursor.y === y)
                g += '<rect x="-19" y="-19" width="38" height="38" rx="4" fill="none" stroke="#f5b84f" stroke-width="2" stroke-dasharray="4 3"/>';
            g += "</g>";
            s += g;
        }
        for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++)
            s += `<rect class="pt-hit" data-x="${x}" data-y="${y}" x="${PAD + x * CELL}" y="${PAD + y * CELL}" width="${CELL}" height="${CELL}"/>`;
        svg.innerHTML = s;
    }

    /* ---------------- render panel & HUD ---------------- */

    function renderSelbar() {
        if (!state) {
            selbar.textContent = online ? "Menunggu permainan dari host…" : "Pilih suku & ukuran peta.";
            return;
        }
        const me = mySlot();
        if (sel && sel.kind === "unit") {
            const u = unitById(state, sel.id);
            if (u) {
                const U = UNITS[u.t];
                const mine = u.owner === me;
                const status = !mine ? (online ? "Lawan" : "Bot")
                    : u.attacked ? "Sudah bertindak" : u.moved ? "Bisa menyerang" : myTurn() ? "Siap" : "Menunggu giliran";
                selbar.textContent = `${U.label} ${slotName(u.owner)} · HP ${u.hp}/${U.hp} · ATK ${U.atk} DEF ${U.def} · ${status}`;
                return;
            }
        } else if (sel && sel.kind === "city") {
            const c = cityAt(state, sel.x, sel.y);
            if (c) {
                const own = c.owner === me;
                selbar.textContent = `${c.name}${c.cap ? " ★" : ""} · L${c.level} · +${c.level}⭐ · ${own ? "Milikmu" : c.owner === -1 ? "Netral" : "Milik lawan"}`;
                return;
            }
        }
        const nc = state.cities.filter((c) => c.owner === me).length;
        const nu = state.units.filter((u) => u.owner === me).length;
        selbar.textContent = `Kamu: ${slotName(me)} (${TRIBES[state.tribes[me]].label}) · Kota ${nc} · Unit ${nu}`;
    }

    function renderHud() {
        app.classList.toggle("paused", paused);
        const plabel = pauseBtn.querySelector(".pt-btn-label");
        if (plabel) plabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.disabled = online || !state;
        if (!state) {
            hud.stars.textContent = "–"; hud.income.textContent = ""; hud.turn.textContent = "–";
            hud.who.textContent = online ? "Menunggu…" : "Siap"; hud.dot.style.background = "#556";
            endBtn.disabled = true;
            ticker.textContent = online ? "Menunggu state dari host…" : "Tekan H untuk cara bermain.";
            return;
        }
        const me = mySlot();
        hud.stars.textContent = String(state.stars[me]);
        hud.income.textContent = `+${incomeOf(state, me)}/gil`;
        hud.turn.textContent = String(state.turn);
        hud.dot.style.background = COL[state.active];
        hud.who.textContent = state.phase === "over" ? "Selesai"
            : myTurn() ? "Giliranmu" : online ? "Giliran lawan…" : "Giliran Bot…";
        const ready = state.units.filter((u) => u.owner === me && !u.attacked).length;
        const endLabel = endBtn.querySelector(".pt-btn-label");
        if (endLabel) endLabel.textContent = myTurn() ? `End (${ready})` : "End";
        endBtn.setAttribute("aria-label", myTurn() ? `Akhiri giliran (${ready} unit siap)` : "Akhiri giliran");
        endBtn.disabled = !myTurn() || overlayOpen();
        ticker.textContent = state.log[0] || "";
    }

    function render() {
        if (!mounted) return;
        if (state) {
            renderMap();
            // toast saat giliran berpindah ke kita (online)
            if (lastActive !== null && state.phase === "playing" && state.active !== lastActive && state.active === mySlot())
                toast("Giliranmu!");
            lastActive = state.active;
        } else {
            svg.removeAttribute("viewBox");
            svg.innerHTML = "";
        }
        renderHud();
        renderSelbar();
        renderModalHtml(false);
        // modal kemenangan/kekalahan otomatis
        if (state && state.phase === "over" && !overShown) { overShown = true; openModal("over"); }
        if (state && state.phase === "playing" && modalKind === "over") closeModal(true);
    }

    /* ---------------- isi modal ---------------- */

    function buildModal(view) {
        const kind = view || modalKind;
        const me = state ? mySlot() : 0;
        if (kind === "setup") {
            let h = "<h3>Poly Tribes</h3><p>Strategi bergiliran ala Polytopia. Rebut <b>ibu kota lawan</b> sebelum ibu kotamu jatuh. Peta acak dijamin terhubung dan bisa diselesaikan.</p><h4>Pilih suku</h4>";
            for (const k of Object.keys(TRIBES)) {
                const t = TRIBES[k];
                h += `<button class="pt-tribe${k === setupPick.tribe ? " on" : ""}" type="button" data-act="picktribe" data-tribe="${k}"><b>${t.label}</b><small>${t.desc}</small></button>`;
            }
            h += "<h4>Ukuran peta</h4><div class='pt-chips'>";
            for (const k of Object.keys(SIZES)) {
                const s = SIZES[k];
                h += `<button class="pt-pick${k === setupPick.size ? " on" : ""}" type="button" data-act="picksize" data-size="${k}">${s.label} ${s.w}×${s.h}</button>`;
            }
            h += `</div><h4>Seed peta (opsional)</h4><input class="pt-input" id="pt-seed" type="text" maxlength="12" placeholder="kosong = acak" value="${setupPick.seed || ""}">`
                + '<div class="pt-modalbtns"><button class="pt-btn primary" type="button" data-act="start">Mulai</button>'
                + '<button class="pt-btn ghost" type="button" data-act="help">Cara Bermain</button>'
                + '<button class="pt-btn ghost" type="button" data-act="exit">Keluar</button></div>'
                + '<p class="pt-note">Undian koin menentukan siapa jalan duluan.</p>';
            return h;
        }
        if (kind === "help") {
            return `<h3>Cara Bermain</h3>
<p><b>Tujuan:</b> rebut ibu kota lawan (bendera). Kamu kalah jika ibu kotamu direbut.</p>
<h4>Alur giliran</h4>
<ul>
<li>Awal giliran: bintang ⭐ otomatis masuk dari kota (level kota = bintang/giliran).</li>
<li>Pilih unit → ketuk <b>titik putih</b> untuk bergerak, <b>lingkaran merah</b> untuk menyerang.</li>
<li>Unit boleh <b>bergerak lalu menyerang</b>. Menyerang mengakhiri aksi unit.</li>
<li>Tekan <b>Akhiri Giliran</b> bila selesai.</li>
</ul>
<h4>Bintang & kota</h4>
<ul>
<li>Injak 🍒 buah (+${FRUIT_STARS}⭐) atau reruntuhan (+${RUINS_STARS}⭐) — otomatis diambil.</li>
<li>Injak desa/kota kosong untuk merebutnya. Desa netral <b>tanpa penjaga</b>.</li>
<li>Buka <b>Kota</b> untuk melatih unit (siap giliran depan) atau membangun Workshop (+1 level, maks ${MAX_LEVEL}).</li>
<li>Buka <b>Teknologi</b> untuk membuka unit baru & Workshop.</li>
</ul>
<h4>Bertempur</h4>
<ul>
<li>Unit luka menyerang lebih lemah. Hutan memberi bonus pertahanan ×1.5.</li>
<li>Penyintas membalas jika penyerang dalam jangkauannya — Pemanah (jarak 2) bisa menyerang tanpa dibalas.</li>
<li>Kabut perang terbuka di sekitar unit & kotamu.</li>
</ul>
<h4>Kontrol desktop</h4>
<ul>
<li><span class="pt-kbd">Klik</span> pilih/aksi • <span class="pt-kbd">Klik kanan</span>/<span class="pt-kbd">Esc</span> batal pilih</li>
<li><span class="pt-kbd">WASD</span>/<span class="pt-kbd">Panah</span> kursor • <span class="pt-kbd">Enter</span>/<span class="pt-kbd">Spasi</span> aksi</li>
<li><span class="pt-kbd">N</span> unit berikutnya • <span class="pt-kbd">E</span> akhiri giliran • <span class="pt-kbd">T</span> teknologi • <span class="pt-kbd">K</span> kota</li>
<li><span class="pt-kbd">H</span> bantuan • <span class="pt-kbd">C</span> cheat • <span class="pt-kbd">P</span> jeda • <span class="pt-kbd">R</span> ulang</li>
<li><span class="pt-kbd">+</span>/<span class="pt-kbd">−</span> zoom • <span class="pt-kbd">Ctrl+scroll</span> zoom • seret peta saat zoom</li>
</ul>
<h4>Kontrol mobile</h4>
<ul>
<li>Ketuk unit → ketuk titik/lingkaran. Tombol di bar atas untuk Teknologi, Kota, Unit, dan Giliran.</li>
<li>Tombol + / − untuk zoom, ⟳ untuk lompat ke unit berikutnya. Geser peta dengan jari saat zoom.</li>
<li>Ikon di bar atas: bantuan, cheat, jeda, ulang, dan keluar.</li>
</ul>
<p class="pt-note">Terinspirasi The Battle of Polytopia. Mode online: slot warna/posisi diacak otomatis. Tekan H untuk membuka panduan ini lagi.</p>
<div class="pt-modalbtns"><button class="pt-btn primary" type="button" data-help-close>Mengerti</button></div>`;
        }
        if (kind === "pause") {
            return "<h3>Dijeda</h3><p>Peta, bot, dan timer dibekukan. Tekan P atau Esc untuk melanjutkan.</p>"
                + '<div class="pt-modalbtns"><button class="pt-btn primary" type="button" data-act="resume">Lanjutkan</button></div>';
        }
        if (!state) return "<h3>Menunggu…</h3><p>Permainan belum dimulai.</p>";
        if (kind === "tech") {
            let h = `<h3>Teknologi</h3><p>Bintangmu: <b>${state.stars[me]}⭐</b>${myTurn() ? "" : " — riset hanya saat giliranmu"}</p>`;
            for (const k of Object.keys(TECHS)) {
                const t = TECHS[k];
                const owned = !!state.techs[me][k];
                const dis = owned || !myTurn() || state.stars[me] < t.cost;
                h += `<div class="pt-row"><div class="pt-rl"><b>${t.label}</b><small>${t.desc}</small></div>`
                    + (owned ? '<span class="pt-owned">Dimiliki ✓</span>'
                        : `<button class="pt-btn small" type="button" data-act="buytech" data-tech="${k}"${dis ? " disabled" : ""}>Riset ${t.cost}⭐</button>`)
                    + "</div>";
            }
            h += '<div class="pt-modalbtns"><button class="pt-btn" type="button" data-act="closemodal">Tutup</button></div>';
            return h;
        }
        if (kind === "city") {
            const mine = state.cities.filter((c) => c.owner === me);
            if (!mine.length) return '<h3>Kota</h3><p>Kamu belum punya kota.</p><div class="pt-modalbtns"><button class="pt-btn" type="button" data-act="closemodal">Tutup</button></div>';
            let cur = (modalData && cityAt(state, modalData.x, modalData.y)) || null;
            if (!cur || cur.owner !== me) cur = (sel && sel.kind === "city" && cityAt(state, sel.x, sel.y)) || mine[0];
            if (cur.owner !== me) cur = mine[0];
            let h = "<h3>Kota</h3><div class='pt-chips'>";
            for (const c of mine)
                h += `<button class="pt-pick${c.id === cur.id ? " on" : ""}" type="button" data-act="pickcity" data-x="${c.x}" data-y="${c.y}">${c.name}${c.cap ? " ★" : ""} L${c.level}</button>`;
            h += `</div><p><b>${cur.name}</b>${cur.cap ? " (Ibu Kota)" : ""} — level ${cur.level}, +${cur.level}⭐/giliran</p>`;
            const hasFarm = !!state.techs[me].farming;
            const wok = hasFarm && myTurn() && cur.level < MAX_LEVEL && state.stars[me] >= WORKSHOP_COST;
            h += `<div class="pt-row"><div class="pt-rl"><b>Workshop</b><small>+1 level kota (maks ${MAX_LEVEL}).${hasFarm ? "" : " Butuh teknologi Bertani."}${cur.level >= MAX_LEVEL ? " Level maksimal." : ""}</small></div>`
                + `<button class="pt-btn small" type="button" data-act="workshop" data-x="${cur.x}" data-y="${cur.y}"${wok ? "" : " disabled"}>Bangun ${WORKSHOP_COST}⭐</button></div>`;
            h += "<h4>Latih unit (siap giliran depan)</h4><div class='pt-cards'>";
            const spot = spawnSpot(state, cur);
            for (const k of Object.keys(UNITS)) {
                const U = UNITS[k];
                const cost = unitCostFor(state, me, k);
                const techOk = !U.tech || !!state.techs[me][U.tech];
                let why = "";
                if (!techOk) why = "Butuh " + TECHS[U.tech].label;
                else if (!myTurn()) why = "Bukan giliranmu";
                else if (state.stars[me] < cost) why = "Bintang kurang";
                else if (!spot) why = "Tidak ada petak kosong";
                h += `<button class="pt-card" type="button" data-act="train" data-x="${cur.x}" data-y="${cur.y}" data-unit="${k}"${why ? " disabled" : ""}>`
                    + `<b>${U.label} — ${cost}⭐</b><small>HP ${U.hp} • ATK ${U.atk} • DEF ${U.def} • gerak ${U.move} • jarak ${U.range}</small>`
                    + (why ? `<small style="color:#f5b84f">${why}</small>` : "") + "</button>";
            }
            h += '</div><div class="pt-modalbtns"><button class="pt-btn" type="button" data-act="closemodal">Tutup</button></div>';
            return h;
        }
        if (kind === "cheat") {
            const rows = [
                ["stars", "+25 Bintang", "Tambahkan 25⭐ ke kas suku."],
                ["reveal", "Buka Seluruh Peta", "Hilangkan kabut perang."],
                ["refresh", "Segarkan Unit", "Semua unitmu bisa bergerak & menyerang lagi."],
                ["level", "Kota Naik Level", "Semua kotamu +1 level (maks " + MAX_LEVEL + ")."],
                ["smite", "Petir ke Lawan", "Semua unit lawan -10 HP."],
            ];
            let h = "<h3>🪄 Cheat</h3><p>Hanya tersedia di mode vs Bot. Bintangmu: <b>" + state.stars[me] + "⭐</b></p>";
            for (const [kind, label, desc] of rows)
                h += `<div class="pt-row"><div class="pt-rl"><b>${label}</b><small>${desc}</small></div><button class="pt-btn small" type="button" data-act="cheat" data-kind="${kind}">Pakai</button></div>`;
            h += '<div class="pt-modalbtns"><button class="pt-btn" type="button" data-act="closemodal">Tutup</button></div>';
            return h;
        }
        if (kind === "menu") {
            let h = `<h3>Menu</h3><p>Pemain: <b>${playerName}</b> • Mode: <b>${online ? "Online" : "vs Bot"}</b>`
                + (state ? ` • Kamu: <b>${slotName(me)}</b> (${TRIBES[state.tribes[me]].label})<br>Seed: <span class="pt-kbd">${state.seed}</span> • Peta ${SIZES[state.size]?.label || state.size}` : "")
                + "</p><div class='pt-modalbtns'>"
                + '<button class="pt-btn primary" type="button" data-act="closemodal">Lanjutkan</button>'
                + '<button class="pt-btn" type="button" data-act="help">Bantuan</button></div>'
                + "<div class='pt-modalbtns'>"
                + (online
                    ? (room.isHost ? '<button class="pt-btn" type="button" data-act="rematch">Rematch (acak ulang)</button>' : '<button class="pt-btn" type="button" disabled>Rematch (hanya host)</button>')
                    : '<button class="pt-btn" type="button" data-act="newsetup">Mulai Ulang / Ganti Suku</button>')
                + '<button class="pt-btn ghost" type="button" data-act="exit">Keluar Game</button></div>';
            return h;
        }
        if (kind === "over") {
            const win = state.winner === me;
            const title = online ? `${slotName(state.winner)} Menang!${win ? " (Kamu)" : ""}` : win ? "🏆 Menang!" : "💀 Kalah…";
            let h = `<h3>${title}</h3><p>${state.reason}</p>`
                + `<p>Giliran ${state.turn} • Kotamu ${state.cities.filter((c) => c.owner === me).length} • Unitmu ${state.units.filter((u) => u.owner === me).length}</p>`
                + "<div class='pt-modalbtns'>";
            if (online) h += room.isHost
                ? '<button class="pt-btn primary" type="button" data-act="rematch">Main Lagi</button>'
                : '<button class="pt-btn" type="button" disabled>Menunggu host…</button>';
            else h += '<button class="pt-btn primary" type="button" data-act="newsetup">Main Lagi</button>';
            h += '<button class="pt-btn ghost" type="button" data-act="exit">Keluar</button></div>';
            return h;
        }
        return "";
    }

    /* ---------------- interaksi peta ---------------- */

    function tileClicked(x, y) {
        if (!state) return;
        const me = mySlot();
        if (!isExplored(state, me, x, y)) { sel = null; render(); return; }
        const u = unitAt(state, x, y);
        const c = cityAt(state, x, y);
        if (sel && sel.kind === "unit") {
            const su = unitById(state, sel.id);
            if (su && su.owner === me) {
                if (u && u.id === su.id) {
                    sel = c && c.owner === me ? { kind: "city", x, y } : null;
                    render(); return;
                }
                if (myTurn()) {
                    if (u && u.owner !== me && !su.attacked && dist(su.x, su.y, x, y) <= UNITS[su.t].range) {
                        submitAction({ type: "attack", unitId: su.id, targetId: u.id });
                        return;
                    }
                    if (!u && !su.moved && !su.attacked && reachableTiles(state, su).some((p) => p.x === x && p.y === y)) {
                        submitAction({ type: "move", unitId: su.id, x, y });
                        return;
                    }
                }
            }
        }
        if (u) { sel = { kind: "unit", id: u.id }; render(); return; }
        if (c) { sel = { kind: "city", x, y }; render(); return; }
        sel = null; render();
    }

    function cycleUnit() {
        if (!state) return;
        const me = mySlot();
        const mine = state.units.filter((u) => u.owner === me);
        if (!mine.length) { toast("Belum ada unit."); return; }
        const ready = mine.filter((u) => !u.attacked);
        const list = ready.length ? ready : mine;
        const idx = sel && sel.kind === "unit" ? list.findIndex((u) => u.id === sel.id) : -1;
        const next = list[(idx + 1) % list.length];
        sel = { kind: "unit", id: next.id };
        showCursor = false;
        centerOn(next.x, next.y);
        render();
    }

    /* ---------------- event: klik (delegasi) ---------------- */

    function handleClick(e) {
        if (!mounted) return;
        const t = e.target;
        if (t === overlay) { closeModal(); return; }
        if (t.closest && t.closest("[data-help-close]")) { toggleHelp(false); return; }
        const b = t.closest ? t.closest("[data-act]") : null;
        if (b && !b.disabled) {
            const a = b.dataset.act;
            if (a === "exit") { onExit(); return; }
            if (a === "help") { toggleHelp(); return; }
            if (a === "cheats") { toggleCheats(); return; }
            if (a === "cheatclose") { toggleCheats(false); return; }
            if (a === "pause") { togglePause(); return; }
            if (a === "resume") { togglePause(false); return; }
            if (a === "restart") { restartGame(); return; }
            if (a === "closemodal") { closeModal(); return; }
            if (a === "rematch") { restartGame(); return; }
            // Kontrol game hanya aktif bila tidak ada overlay; isi overlay tetap boleh.
            if (overlayOpen() && !overlay.contains(t)) return;
            if (a === "menu") { openModal("menu"); return; }
            if (a === "zoomin") { setZoom(zoomIdx + 1); return; }
            if (a === "zoomout") { setZoom(zoomIdx - 1); return; }
            if (a === "nextunit") { cycleUnit(); return; }
            if (a === "deselect") { sel = null; render(); return; }
            if (a === "picktribe") { setupPick.tribe = b.dataset.tribe; renderModalHtml(true); return; }
            if (a === "picksize") { setupPick.size = b.dataset.size; renderModalHtml(true); return; }
            if (a === "start") {
                const inp = $("#pt-seed");
                setupPick.seed = inp ? inp.value : "";
                startAI(); return;
            }
            if (a === "newsetup") { openModal("setup", { locked: true }); return; }
            if (!state) return;
            if (a === "tech") { openModal("tech"); return; }
            if (a === "city") {
                const c = sel && sel.kind === "city" ? { x: sel.x, y: sel.y } : null;
                openModal("city", c || {}); return;
            }
            if (a === "pickcity") { modalData = { x: Number(b.dataset.x), y: Number(b.dataset.y) }; renderModalHtml(true); return; }
            if (a === "end") { submitAction({ type: "end" }); return; }
            if (a === "buytech") { submitAction({ type: "tech", tech: b.dataset.tech }); return; }
            if (a === "train") { submitAction({ type: "train", x: Number(b.dataset.x), y: Number(b.dataset.y), unit: b.dataset.unit }); return; }
            if (a === "workshop") { submitAction({ type: "workshop", x: Number(b.dataset.x), y: Number(b.dataset.y) }); return; }
            if (a === "cheat") { submitAction({ type: "cheat", kind: b.dataset.kind }); return; }
        }
        const hit = t.closest ? t.closest(".pt-hit") : null;
        if (hit && !overlayOpen()) {
            if (dragSuppress) { dragSuppress = false; return; }
            tileClicked(Number(hit.dataset.x), Number(hit.dataset.y));
        }
    }

    /* ---------------- event: keyboard (desktop) ---------------- */

    function handleKey(e) {
        if (!mounted) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
            if (e.key === "Escape") closeModal();
            return;
        }
        const code = e.code || "";
        const hit = (letter) => code === "Key" + letter || (e.key && e.key.toLowerCase() === letter.toLowerCase());
        // prioritas: help → cheats → pause → Escape → restart → aksi game
        if (hit("H") || e.key === "?") { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
        if (hit("C")) { if (!e.repeat && !helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (hit("P")) { if (!e.repeat && !helpOpen && !cheatsOpen) togglePause(); e.preventDefault(); return; }
        if (e.key === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            else if (modalKind) closeModal();
            else { sel = null; showCursor = false; render(); }
            e.preventDefault(); return;
        }
        if (hit("R")) { if (!e.repeat && !helpOpen && !cheatsOpen) restartGame(); e.preventDefault(); return; }
        if (overlayOpen()) { e.preventDefault(); return; }
        const k = e.key.toLowerCase();
        const moveCursor = (dx, dy) => {
            if (!state) return;
            showCursor = true;
            cursor.x = clamp(cursor.x + dx, 0, state.w - 1);
            cursor.y = clamp(cursor.y + dy, 0, state.h - 1);
            render(); e.preventDefault();
        };
        if (k === "arrowup" || k === "w") return moveCursor(0, -1);
        if (k === "arrowdown" || k === "s") return moveCursor(0, 1);
        if (k === "arrowleft" || k === "a") return moveCursor(-1, 0);
        if (k === "arrowright" || k === "d") return moveCursor(1, 0);
        if (k === "enter" || k === " ") { if (state) { showCursor = true; tileClicked(cursor.x, cursor.y); } e.preventDefault(); return; }
        if (k === "n") { cycleUnit(); e.preventDefault(); return; }
        if (k === "e") { if (myTurn()) submitAction({ type: "end" }); e.preventDefault(); return; }
        if (k === "t") { if (state) openModal("tech"); return; }
        if (k === "k") { if (state) openModal("city", sel && sel.kind === "city" ? { x: sel.x, y: sel.y } : {}); return; }
        if (k === "m") { openModal("menu"); return; }
        if (k === "+" || k === "=") { setZoom(zoomIdx + 1); return; }
        if (k === "-") { setZoom(zoomIdx - 1); return; }
    }

    /* ---------------- event: mouse pan & zoom ---------------- */

    function onPointerDown(e) {
        if (e.pointerType !== "mouse" || e.button !== 0 || zoomIdx === 0) return;
        pan = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, moved: false };
    }
    function onPointerMove(e) {
        if (!pan) return;
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) pan.moved = true;
        if (pan.moved) { wrap.scrollLeft = pan.sl - dx; wrap.scrollTop = pan.st - dy; }
    }
    function onPointerUp() {
        if (!pan) return;
        dragSuppress = pan.moved;
        pan = null;
    }
    function onWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(zoomIdx + (e.deltaY < 0 ? 1 : -1));
    }
    function onContext(e) {
        e.preventDefault();
        sel = null; showCursor = false; render();
    }

    root.addEventListener("click", handleClick);
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("contextmenu", onContext);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", handleKey);

    /* ---------------- boot ---------------- */

    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            startOnline(false); // host membuat state kanonik (slot & giliran pertama diacak)
            room.onAction((action) => applyAction(action, 1));
        } else {
            render();
            room.onState((nextState) => {
                state = normState(nextState);
                if (state) {
                    const key = state.seed + "|" + state.first;
                    if (key !== lastKey) {
                        lastKey = key;
                        adoptState();
                        toast(`Kamu bermain sebagai ${slotName(mySlot())}. Undian: ${slotName(state.first)} duluan.`);
                    }
                }
                render();
            });
        }
    } else {
        render();
        openModal("setup", { locked: true });
    }

    return {
        destroy() {
            mounted = false;
            clearTimeout(toastTimer);
            root.removeEventListener("click", handleClick);
            svg.removeEventListener("pointerdown", onPointerDown);
            svg.removeEventListener("contextmenu", onContext);
            wrap.removeEventListener("wheel", onWheel);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("keydown", handleKey);
        },
    };
}