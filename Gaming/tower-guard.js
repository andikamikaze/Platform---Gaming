/* ==== js/games/tower-guard.js ==== */
/*
  Tower Guard — strategy tower defense (template modul baru).
  - META.id harus sama dengan nama file tanpa .js.
  - Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "tower-guard",
    name: "Tower Guard",
    category: "strategy",
    catLabel: "Strategy",
    desc: "Duel tower defense: bangun Arrow, Frost & Cannon di map acak dan bertahan 8 wave.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 42V18h20v24"/><path d="M14 18l-4-6h28l-4 6"/><path d="M10 12V8h4v4M18 12V8h4v4M26 12V8h4v4M34 12V8h4v4"/><path d="M22 42v-10h4v10"/><path d="M40 34c3 0 4-2 4-5"/></svg>',
    bg: ["#134e4a", "#0f766e"],
    bestKey: "towerGuardBest",
};

/* ================= konstanta & aturan murni ================= */
const COLS = 16, ROWS = 10, CELL = 44;          // arena lebih luas (16x10)
const VBW = COLS * CELL, VBH = ROWS * CELL;
const WAVES = 8, LIVES = 12, START_GOLD = 70;
const SEAT_COLORS = ["#818cf8", "#34d399"];     // P1 / P2
const NS = "http://www.w3.org/2000/svg";

const TOWERS = {
    arrow: { key: "arrow", name: "Arrow", cost: 30, range: 96, dmg: 6, rate: 550, color: "#a5b4fc" },
    frost: { key: "frost", name: "Frost", cost: 40, range: 84, dmg: 2, rate: 750, slow: 0.55, slowMs: 1300, color: "#67e8f9" },
    cannon: { key: "cannon", name: "Cannon", cost: 55, range: 118, dmg: 15, rate: 1250, splash: 46, color: "#fdba74" },
};
const TOWER_KEYS = ["arrow", "frost", "cannon"];
const MIN_COST = 30;

/* pacing lebih lambat dari versi lama */
function waveDef(w) {
    return {
        count: 5 + w + (w >= 5 ? 2 : 0),
        hp: 16 + w * 12,
        speed: 20 + w * 1.8,          // px/detik (dulu 26 + 2.5w)
        gold: 5 + w,
        spacingMs: 1150,              // dulu 850
        runners: w >= 4,
        tanks: w >= 5,
    };
}
function enemySpec(w, i) {
    const d = waveDef(w);
    const e = { hp: d.hp, speed: d.speed, gold: d.gold, kind: "grunt" };
    if (d.runners && i % 4 === 3) { e.hp = Math.round(d.hp * 0.5); e.speed = d.speed * 1.7; e.kind = "runner"; }
    if (d.tanks && i % 5 === 4) { e.hp = Math.round(d.hp * 2.4); e.speed = d.speed * 0.6; e.gold = d.gold + 2; e.kind = "tank"; }
    return e;
}
const WAVE_BONUS = (w) => 10 + w * 4;
const rid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- geometri jalur (cache per referensi waypoints) ---------- */
const GEOM = new WeakMap();
function geomFor(st) {
    let g = GEOM.get(st.waypoints);
    if (g) return g;
    const wp = st.waypoints.map((w) => [w[0] * CELL + CELL / 2, w[1] * CELL + CELL / 2]);
    const seg = [];
    for (let i = 0; i < wp.length - 1; i++) seg.push(Math.hypot(wp[i + 1][0] - wp[i][0], wp[i + 1][1] - wp[i][1]));
    const total = seg.reduce((a, b) => a + b, 0);
    const cells = pathCellsOf(st.waypoints);
    const centers = cells.map((k) => { const [c, r] = k.split(",").map(Number); return [c * CELL + CELL / 2, r * CELL + CELL / 2]; });
    g = { wp, seg, total, cells, set: new Set(cells), centers };
    GEOM.set(st.waypoints, g);
    return g;
}
function posAt(g, d) {
    let dd = clamp(d, 0, g.total);
    for (let i = 0; i < g.wp.length - 1; i++) {
        if (dd <= g.seg[i]) {
            const k = g.seg[i] ? dd / g.seg[i] : 0;
            return { x: g.wp[i][0] + (g.wp[i + 1][0] - g.wp[i][0]) * k, y: g.wp[i][1] + (g.wp[i + 1][1] - g.wp[i][1]) * k };
        }
        dd -= g.seg[i];
    }
    const last = g.wp[g.wp.length - 1];
    return { x: last[0], y: last[1] };
}
function pathCellsOf(wps) {
    const cells = [];
    for (let i = 0; i < wps.length - 1; i++) {
        const [c0, r0] = wps[i], [c1, r1] = wps[i + 1];
        const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
        let c = c0, r = r0;
        cells.push(c + "," + r);
        while (c !== c1 || r !== r1) { c += dc; r += dr; cells.push(c + "," + r); }
    }
    return cells.filter((k, i) => i === 0 || k !== cells[i - 1]);
}
function simplifyWps(wps) {
    const out = [];
    for (const w of wps) {
        if (out.length && out[out.length - 1][0] === w[0] && out[out.length - 1][1] === w[1]) continue;
        if (out.length >= 2) {
            const a = out[out.length - 2], b = out[out.length - 1];
            if ((a[0] === b[0] && b[0] === w[0]) || (a[1] === b[1] && b[1] === w[1])) { out[out.length - 1] = w; continue; }
        }
        out.push(w);
    }
    return out;
}

/* ---------- random level generator (dengan bukti solvable) ---------- */
const MAP_NAMES = ["Switchback", "Riverbend", "Highland", "Terrace", "Long Mile", "Zigzag", "Causeway", "Hairpin"];
const PRESETS = [
    { name: "Switchback", waypoints: [[0, 2], [13, 2], [13, 5], [2, 5], [2, 8], [15, 8]] },
    { name: "Serpent", waypoints: [[0, 1], [14, 1], [14, 4], [1, 4], [1, 7], [15, 7]] },
    { name: "Riverbend", waypoints: [[0, 5], [4, 5], [4, 1], [9, 1], [9, 8], [13, 8], [13, 3], [15, 3]] },
    { name: "Terrace", waypoints: [[0, 8], [3, 8], [3, 2], [7, 2], [7, 6], [11, 6], [11, 1], [15, 1]] },
];
function coverageTop2(cells, set, range) {
    const centers = cells.map((k) => { const [c, r] = k.split(",").map(Number); return [c * CELL + CELL / 2, r * CELL + CELL / 2]; });
    const scores = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
        if (set.has(c + "," + r)) continue;
        const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
        let cov = 0;
        for (const [px, py] of centers) if (Math.hypot(px - cx, py - cy) <= range) cov++;
        scores.push(cov);
    }
    scores.sort((a, b) => b - a);
    return (scores[0] || 0) + (scores[1] || 0);
}
function generateMap(rand) {
    for (let attempt = 0; attempt < 80; attempt++) {
        let r = 1 + Math.floor(rand() * (ROWS - 2));
        const wps = [[0, r]];
        let jog = 0;
        for (let c = 1; c < COLS; c++) {
            if (rand() < 0.6) {
                const dir = rand() < 0.5 ? -1 : 1;
                const nr = clamp(r + dir * (2 + Math.floor(rand() * 4)), 0, ROWS - 1);
                if (Math.abs(nr - r) >= 2) { wps.push([c - 1, nr]); jog += Math.abs(nr - r); r = nr; }
            }
            wps.push([c, r]);
        }
        const waypoints = simplifyWps(wps);
        const cells = pathCellsOf(waypoints);
        const set = new Set(cells);
        if (cells.length < 26 || cells.length > 48 || jog < 8) continue;
        let adj = 0;
        const seen = new Set();
        for (const k of cells) {
            const [c, r] = k.split(",").map(Number);
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nk = (c + dc) + "," + (r + dr);
                if (c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS && !set.has(nk) && !seen.has(nk)) { seen.add(nk); adj++; }
            }
        }
        if (adj < 18) continue;
        /* bukti solvable: 2 Arrow terbaik dari gold awal harus bisa menutup wave 1 */
        if (coverageTop2(cells, set, TOWERS.arrow.range) < 14) continue;
        return { name: MAP_NAMES[Math.floor(rand() * MAP_NAMES.length)], waypoints, cells };
    }
    const p = PRESETS[Math.floor(rand() * PRESETS.length)];
    return { name: p.name, waypoints: p.waypoints, cells: pathCellsOf(p.waypoints) };
}

/* ---------- state & simulasi deterministik ---------- */
function newMatch() {
    const m = generateMap(Math.random);
    const firstSeat = Math.random() < 0.5 ? 0 : 1;   // coin flip: siapa jalan duluan
    return {
        matchId: rid(), mapId: rid(), mapName: m.name, waypoints: m.waypoints, pathCells: m.cells,
        phase: "build", wave: 0, waveCount: 0, spacingMs: 1150, spawned: 0, spawnT: 0,
        gold: [START_GOLD, START_GOLD], earned: [0, 0], lives: LIVES,
        hostSeat: Math.random() < 0.5 ? 0 : 1,          // random kursi P1/P2 (multiplayer)
        firstSeat, turn: firstSeat, ready: [false, false],
        towers: [], enemies: [], shots: [], nextTowerId: 1,
        cheats: { free: false, rapid: false, power: false, slow: false }, cheatsUsed: false,
        over: false, won: false, winner: -1,
    };
}
const costOf = (st, k) => (st.cheats.free ? 0 : TOWERS[k].cost);
function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
function canBuild(st, c, r) {
    if (!inBounds(c, r) || geomFor(st).set.has(c + "," + r)) return false;
    return !st.towers.some((t) => t.c === c && t.r === r);
}

function stepSim(st, dtMs) {
    const g = geomFor(st);
    const n = {
        ...st,
        gold: st.gold.slice(), earned: st.earned.slice(), ready: st.ready.slice(),
        cheats: { ...st.cheats },
        enemies: st.enemies.map((e) => ({ ...e })),
        towers: st.towers.map((t) => ({ ...t })),
        shots: [],
    };
    const dt = dtMs / 1000;
    if (n.spawned < n.waveCount) {
        n.spawnT -= dtMs;
        while (n.spawnT <= 0 && n.spawned < n.waveCount) {
            const s = enemySpec(n.wave, n.spawned);
            n.enemies.push({ id: n.wave * 1000 + n.spawned, d: 0, hp: s.hp, maxHp: s.hp, speed: s.speed, gold: s.gold, kind: s.kind, slowT: 0, hitBy: 0 });
            n.spawned++; n.spawnT += n.spacingMs;
        }
    }
    const slowChe = n.cheats.slow ? 0.6 : 1;
    n.enemies.forEach((e) => {
        e.slowT = Math.max(0, e.slowT - dtMs);
        e.d += e.speed * (e.slowT > 0 ? TOWERS.frost.slow : 1) * slowChe * dt;
    });
    const leaked = n.enemies.filter((e) => e.d >= g.total);
    if (leaked.length) { n.lives -= leaked.length; n.enemies = n.enemies.filter((e) => e.d < g.total); }
    const dmgMul = n.cheats.power ? 2 : 1;
    n.towers.forEach((t) => {
        t.cd = (t.cd || 0) - dtMs;
        if (t.cd > 0) return;
        const spec = TOWERS[t.type];
        const cx = t.c * CELL + CELL / 2, cy = t.r * CELL + CELL / 2;
        let target = null;
        n.enemies.forEach((e) => {
            const p = posAt(g, e.d);
            if (Math.hypot(p.x - cx, p.y - cy) <= spec.range && (!target || e.d > target.d)) target = e;
        });
        if (!target) return;
        t.cd = spec.rate * (n.cheats.rapid ? 0.45 : 1);
        const tp = posAt(g, target.d);
        n.shots.push({ x1: cx, y1: cy, x2: tp.x, y2: tp.y, color: spec.color });
        const dmg = Math.round(spec.dmg * dmgMul);
        if (spec.splash) {
            n.enemies.forEach((e) => {
                const p = posAt(g, e.d);
                if (Math.hypot(p.x - tp.x, p.y - tp.y) <= spec.splash) { e.hp -= e === target ? dmg : Math.round(dmg * 0.6); e.hitBy = t.owner; }
            });
        } else {
            target.hp -= dmg; target.hitBy = t.owner;
            if (spec.slowMs) target.slowT = spec.slowMs;
        }
    });
    const dead = n.enemies.filter((e) => e.hp <= 0);
    if (dead.length) {
        dead.forEach((e) => { const o = e.hitBy === 1 ? 1 : 0; n.gold[o] += e.gold; n.earned[o] += e.gold; });
        n.enemies = n.enemies.filter((e) => e.hp > 0);
    }
    if (n.lives <= 0) { n.lives = 0; n.over = true; n.won = false; }
    return n;
}

/* ============================ mount ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* view-local (tidak diserialisasi ke room) */
    let tool = "arrow", cursor = { c: 2, r: 0 }, cursorOn = false;
    let speed = 1, paused = false, rafId = 0, lastT = 0, pubAcc = 0;
    let botTimer = 0, lastMapId = "", overPublished = false, bestWritten = false;
    let cheatsOpen = false, helpOpen = false;
    const towerEls = new Map(), enemyEls = new Map();
    const timers = new Set(), deferred = [], unsubs = [];

    /* first-run internal help (global modal is disabled for this game id) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("towerGuardHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("towerGuardHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* Pause-aware timers: nothing fires while paused, deadlines are kept
       so resuming shifts the anchors instead of jumping the simulation. */
    const nowMs = () => performance.now();
    function later(ms, fn) {
        const wait = Math.max(0, ms), due = nowMs() + wait;
        const id = setTimeout(() => {
            timers.delete(id);
            if (paused) { deferred.push({ due, fn }); return; }
            fn();
        }, wait);
        timers.add(id);
        return id;
    }
    function flushDeferred() {
        const t = nowMs();
        deferred.splice(0).forEach(({ due, fn }) => later(due - t, fn));
    }
    function cancelTimers() {
        timers.forEach((id) => clearTimeout(id)); timers.clear();
        deferred.length = 0; botTimer = 0;
    }

    const mySeat = () => (online && state ? (room.isHost ? state.hostSeat : 1 - state.hostSeat) : 0);
    const seatName = (s) => {
        if (!online) return s === 0 ? (playerName || "You") : "Bot";
        return s === mySeat() ? (playerName || "You") : "Rival";
    };

    /* ---------------- UI shell: HUD + fill board + overlays ---------------- */
    root.innerHTML = `
<div class="game-app tg-app game-fill${("ontouchstart" in window) ? " tg-touch" : ""}">
  <style>
  .tg-app{--line:#ffffff14;--mut:#8fa0b8;--txt:#e7edf6;--panel:#0f172a;--bg:#0b1220;--acc:#6366f1;display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0;gap:8px;width:100%;max-width:100%;padding:10px;box-sizing:border-box;color:var(--txt);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;touch-action:manipulation}
  .tg-app *{box-sizing:border-box}
  .tg-app [hidden]{display:none!important}
  .tg-app button{font:inherit;color:var(--txt);background:#111a2e;border:1px solid var(--line);border-radius:8px;padding:6px 9px;min-height:34px;font-size:10px;font-weight:650;cursor:pointer}
  .tg-app button:hover:not(:disabled){border-color:#ffffff3a}
  .tg-app button:disabled{opacity:.38;cursor:default}
  .tg-app button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}

  /* HUD bar: all match info + controls live here */
  .tg-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 7px;border:1px solid var(--line);border-radius:11px;background:#0f172a}
  .tg-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--line);border-radius:999px;color:var(--mut);font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;font-variant-numeric:tabular-nums}
  .tg-chip b{color:var(--txt);font-weight:700}
  .tg-chip i.tg-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--acc)}
  .tg-spacer{flex:1 1 auto;min-width:4px}
  .tg-hud-sep{width:1px;align-self:stretch;background:var(--line);margin:0 2px}
  .tg-btn.on{border-color:var(--acc);color:var(--acc)}
  .tg-app .tg-btn[data-on="1"],.tg-app .tg-btn.tg-primary{background:var(--acc);border-color:var(--acc);color:#fff}
  .tg-icon-btn{display:inline-flex;align-items:center;gap:5px}
  .tg-icon-btn svg{flex:none;display:block}
  .tg-picon{display:inline-flex}
  .tg-btn-label{white-space:nowrap}
  .tg-btn-short{display:none}

  /* Board = arena only; SVG + overlays are direct children */
  .tg-app.game-fill > .game-panel.tg-board[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
  .tg-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden}
  .tg-board svg{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair}
  .tg-free{cursor:pointer}
  .tg-free:hover{fill:#1c2b4d}
  .tg-tower{cursor:pointer}
  .tg-shot{animation:tg-fade .2s linear forwards}
  @keyframes tg-fade{from{opacity:1}to{opacity:0}}
  .tg-toast{position:absolute;left:12px;right:12px;bottom:10px;z-index:3;margin:0 auto;max-width:520px;text-align:center;font-size:12px;color:var(--txt);background:#0b1220e6;border:1px solid var(--line);border-radius:999px;padding:5px 12px;pointer-events:none}

  /* Overlays as flex columns */
  .tg-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:14px;background:#0b1220d9;border-radius:12px}
  .tg-card{display:flex;flex-direction:column;overflow:hidden;width:min(600px,100%);max-height:100%;padding:16px 18px;background:var(--panel);border:1px solid var(--line);border-radius:14px;text-align:left}
  .tg-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
  .tg-head h3{margin:0;font-size:16px}
  .tg-head h3.tg-sub{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
  .tg-help,.tg-cheats,.tg-stats{flex:1 1 auto;min-height:0;overflow:auto}
  .tg-cheats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;align-content:start}
  .tg-cheatrow{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}
  .tg-card p,.tg-card li{font-size:12.5px;color:#c3cede}
  .tg-card p{margin:4px 0}
  .tg-card ul{margin:4px 0 8px;padding-left:18px}
  .tg-help > div > b{display:block;margin:10px 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
  .tg-card table{width:100%;border-collapse:collapse;font-size:12px}
  .tg-card td,.tg-card th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left}
  .tg-card kbd{background:#1e293b;border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:11px}
  .tg-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;margin-top:8px;border-top:1px solid var(--line)}
  .tg-note{font-size:10.5px;color:var(--mut)}
  .tg-win{color:#34d399}.tg-lose{color:#f87171}

  /* Touch pad is a sibling AFTER the board, never inside it */
  .tg-pad{display:none;grid-template-columns:repeat(3,48px);grid-auto-rows:48px;gap:6px;justify-content:center;flex:none}
  .tg-pad button{padding:0;min-height:44px;font-size:17px;font-weight:700}
  .tg-pad button[data-pad="build"]{background:var(--acc);border-color:var(--acc);color:#fff;font-size:10px}
  .tg-app.tg-touch .tg-pad{display:grid}
  @media (pointer:coarse){.tg-app .tg-pad{display:grid}.tg-app button:not(:disabled){min-height:44px}}
  @media (prefers-reduced-motion:reduce){.tg-app .tg-shot{animation:none}.tg-app *{transition-duration:.01ms!important}}

  /* --- fill height + mobile refinements (last, beat pointer:coarse 44px) --- */
  @media (max-width:640px){
  .tg-app{gap:6px;padding:6px}
  .tg-app.game-fill > .game-panel.tg-board[data-board]:not(:has(.tg-ov:not([hidden]))){flex:0 0 auto;aspect-ratio:16/10}
  .tg-app.game-fill > .game-panel.tg-board[data-board]:has(.tg-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .tg-app .tg-hud{gap:4px;padding:5px 6px}
  .tg-app .tg-hud .tg-chip{padding:3px 5px;font-size:8px;gap:3px}
  .tg-app .tg-hud .tg-chip b{display:inline-block;max-width:58px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
  .tg-app .tg-hud .tg-chip-low,.tg-app .tg-hud .tg-chip-status{display:none}
  .tg-app .tg-hud .tg-btn{min-height:30px;padding:3px 5px;font-size:9px}
  .tg-app .tg-icon-btn{gap:3px}
  .tg-app .tg-hud .tg-btn-short{display:inline}
  .tg-app .tg-hud .tg-btn-label,.tg-app .tg-hud .tg-spacer,.tg-app .tg-hud .tg-hud-sep{display:none}
  .tg-app .tg-pad{grid-template-columns:repeat(3,44px);grid-auto-rows:44px}
  .tg-app .tg-ov{padding:8px}
  .tg-app .tg-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .tg-app .tg-help,.tg-app .tg-cheats,.tg-app .tg-stats{scrollbar-width:none}
  .tg-app .tg-help::-webkit-scrollbar,.tg-app .tg-cheats::-webkit-scrollbar,.tg-app .tg-stats::-webkit-scrollbar{display:none}
  .tg-app .tg-foot{position:static;margin:8px 0 0;padding:8px 0 0}
  .tg-app .tg-note{display:none}
  }
  @media (pointer:coarse){
  .tg-app .tg-hud .tg-btn{min-height:30px;padding:3px 5px;font-size:9px}
  .tg-app .tg-card .tg-btn{min-height:44px}
  }
  </style>

  <div class="tg-hud">
    <span class="tg-chip">GOLD <b data-hud="gold">70</b></span>
    <span class="tg-chip">LIVES <b data-hud="lives">12</b></span>
    <span class="tg-chip">WAVE <b data-hud="wave">0/8</b></span>
    <span class="tg-chip tg-chip-low">MAP <b data-hud="map">—</b></span>
    <span class="tg-chip">TURN <b data-hud="turn">—</b></span>
    <span class="tg-chip">SCORE <b data-hud="score">0 · 0</b></span>
    <span class="tg-chip tg-chip-status"><i class="tg-dot"></i><b data-hud="status">Ready</b></span>
    <span class="tg-spacer"></span>
    ${TOWER_KEYS.map((k, i) => `<button class="tg-btn" type="button" data-act="pick" data-t="${k}" aria-label="Build ${TOWERS[k].name}" title="${TOWERS[k].name} — ${TOWERS[k].cost}g (${i + 1})"><span class="tg-btn-label">${i + 1}·${TOWERS[k].name}</span><span class="tg-btn-short">${i + 1}</span></button>`).join("")}
    <button class="tg-btn" type="button" data-act="sell" aria-label="Sell tool" title="Sell tool (X)"><span class="tg-btn-label">X·Sell</span><span class="tg-btn-short">X</span></button>
    <button class="tg-btn tg-primary" type="button" data-act="ready" aria-label="Ready" title="Ready (E / Enter)"><span class="tg-btn-label">Ready</span><span class="tg-btn-short">GO</span></button>
    <button class="tg-btn tg-chip-low" type="button" data-act="shuffle" aria-label="Shuffle map" title="Shuffle map"><span class="tg-btn-label">Shuffle</span><span class="tg-btn-short">↻</span></button>
    <button class="tg-btn" type="button" data-act="speed" aria-label="Speed" title="Speed (F)"><span class="tg-btn-label">1x</span><span class="tg-btn-short">1x</span></button>
    <span class="tg-hud-sep"></span>
    <button class="tg-btn tg-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="tg-btn-label">Help</span></button>
    <button class="tg-btn tg-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="tg-btn-label">Cheats</span></button>
    <button class="tg-btn tg-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span class="tg-picon">${iconSVG("pause", { size: 14 })}</span><span class="tg-btn-label">Pause</span></button>
    <button class="tg-btn tg-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="tg-btn-label">Restart</span></button>
    <button class="tg-btn tg-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="tg-btn-label">Exit game</span></button>
  </div>

  <section class="game-panel tg-board" data-board>
    <svg viewBox="0 0 ${VBW} ${VBH}" data-el="svg" aria-hidden="true">
      <g data-el="grid"></g><g data-el="towers"></g><g data-el="enemies"></g><g data-el="shots"></g><g data-el="ghost"></g>
    </svg>
    <div class="tg-toast" data-el="toast">Place towers, then press Ready</div>

    <div class="tg-ov" data-ov="help" hidden>
      <div class="tg-card">
        <div class="tg-head"><h3>How to play</h3><button class="tg-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="tg-help">
          <div>
            <b>Rules</b>
            <p>Musuh berjalan dari <b>START</b> ke <b>EXIT</b>. Setiap musuh yang lolos mengurangi <b>Lives</b> (shared). Habis 12 lives = kalah. Bertahan 8 wave = menang.</p>
            <b>Towers</b>
            <table><tr><th>Tower</th><th>Cost</th><th>Trait</th></tr>
              <tr><td>Arrow</td><td>30g</td><td>Murah, tembak cepat, single target.</td></tr>
              <tr><td>Frost</td><td>40g</td><td>Memperlambat musuh ke 55% selama 1.3 detik.</td></tr>
              <tr><td>Cannon</td><td>55g</td><td>Splash damage — kuat untuk gerombolan.</td></tr></table>
            <b>Duel & giliran</b>
            <ul>
              <li>Fase build: bergiliran membangun <b>1 tower per giliran</b>, atau tekan <b>Ready</b>. Wave mulai saat keduanya Ready.</li>
              <li>Siapa yang mulai duluan diacak (coin flip); mulai wave berikutnya bergantian.</li>
              <li>Gold dari kill masuk ke pemilik tower, wave bonus untuk keduanya. Saat wave berjalan, keduanya boleh membangun bebas.</li>
              <li>Pemenang duel = gold kill (<b>Score</b>) tertinggi. Jual tower sendiri: refund 60% (tool Sell / klik kanan).</li>
            </ul>
          </div>
          <div>
            <b>Desktop</b>
            <ul>
              <li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pilih tower · <kbd>X</kbd> sell · <kbd>WASD</kbd>/<kbd>←↑↓→</kbd> geser kursor</li>
              <li><kbd>Space</kbd> bangun · <kbd>Enter</kbd>/<kbd>E</kbd> Ready · <kbd>F</kbd> speed 1x/2x</li>
              <li><kbd>H</kbd> bantuan · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>R</kbd> match baru · <kbd>Esc</kbd> tutup panel</li>
              <li>Mouse: hover = preview range, klik = bangun, klik kanan tower sendiri = jual.</li>
            </ul>
            <b>Mobile</b>
            <p>Tap sel untuk bangun. Gunakan D-pad di bawah papan untuk menggeser kursor dan tombol BUILD.</p>
          </div>
        </div>
        <div class="tg-foot"><span class="tg-note">Press H to reopen this guide</span><button class="tg-btn tg-primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>

    <div class="tg-ov" data-ov="cheats" hidden>
      <div class="tg-card">
        <div class="tg-head"><h3>Cheats</h3><button class="tg-btn" type="button" data-cheats-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="tg-cheats">
          <div class="tg-cheatrow">
            <button class="tg-btn" type="button" data-cheat="gold">+150 gold (kamu)</button>
            <button class="tg-btn" type="button" data-cheat="lives">Refill lives</button>
            <button class="tg-btn" type="button" data-cheat="clear">Skip / clear wave</button>
          </div>
          <div class="tg-cheatrow">
            <button class="tg-btn" type="button" data-cheat="free">Free build: OFF</button>
            <button class="tg-btn" type="button" data-cheat="rapid">Rapid fire: OFF</button>
            <button class="tg-btn" type="button" data-cheat="power">Double damage: OFF</button>
            <button class="tg-btn" type="button" data-cheat="slow">Slow enemies: OFF</button>
          </div>
        </div>
        <div class="tg-foot"><span class="tg-note">Cheats mark the result screen</span><button class="tg-btn tg-primary" type="button" data-cheats-close>Close</button></div>
      </div>
    </div>

    <div class="tg-ov" data-ov="pause" hidden>
      <div class="tg-card">
        <div class="tg-head"><h3>Paused</h3></div>
        <div class="tg-stats"><p>Simulasi, bot, dan timer dihentikan. Penanda waktu digeser saat resume agar tidak loncat.</p></div>
        <div class="tg-foot"><span class="tg-note">Press P or Esc</span><button class="tg-btn tg-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="tg-ov" data-ov="over" hidden>
      <div class="tg-card">
        <div class="tg-head"><h3 data-ov="title">—</h3></div>
        <div class="tg-stats">
          <p data-ov="reason"></p>
          <p data-ov="duel"></p>
          <p data-ov="best"></p>
        </div>
        <div class="tg-foot"><span class="tg-note">New map & coin flip</span><button class="tg-btn tg-primary" type="button" data-restart>Play again</button></div>
      </div>
    </div>
  </section>

  <div class="tg-pad" aria-label="Virtual controls">
    <span></span><button type="button" data-pad="up">▲</button><span></span>
    <button type="button" data-pad="left">◀</button><button type="button" data-pad="build">BUILD</button><button type="button" data-pad="right">▶</button>
    <span></span><button type="button" data-pad="down">▼</button><span></span>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const svg = $('[data-el="svg"]'), gridLayer = $('[data-el="grid"]'), towersLayer = $('[data-el="towers"]');
    const enemiesLayer = $('[data-el="enemies"]'), shotsLayer = $('[data-el="shots"]'), ghostLayer = $('[data-el="ghost"]');
    const toastEl = $('[data-el="toast"]');
    const hud = {
        gold: $('[data-hud="gold"]'), lives: $('[data-hud="lives"]'), wave: $('[data-hud="wave"]'),
        map: $('[data-hud="map"]'), turn: $('[data-hud="turn"]'), score: $('[data-hud="score"]'), status: $('[data-hud="status"]'),
    };
    const ov = {
        help: $('[data-ov="help"]'), cheats: $('[data-ov="cheats"]'),
        pause: $('[data-ov="pause"]'), over: $('[data-ov="over"]'),
    };
    const out = { title: $('[data-ov="title"]'), reason: $('[data-ov="reason"]'), duel: $('[data-ov="duel"]'), best: $('[data-ov="best"]') };
    const readyBtn = $('[data-act="ready"]'), pauseBtn = $('[data-pause]'), speedBtn = $('[data-act="speed"]'), shuffleBtn = $('[data-act="shuffle"]');
    const pickBtns = {}; TOWER_KEYS.forEach((k) => (pickBtns[k] = $(`[data-t="${k}"]`)));
    const sellBtn = $('[data-act="sell"]');
    const cheatBtns = {}; root.querySelectorAll("[data-cheat]").forEach((b) => (cheatBtns[b.dataset.cheat] = b));

    function toast(t) { toastEl.textContent = t; }
    function setLabel(btn, text, short) {
        if (!btn) return;
        const label = btn.querySelector(".tg-btn-label");
        if (label) label.textContent = text; else btn.textContent = text;
        const sh = btn.querySelector(".tg-btn-short");
        if (sh && short != null) sh.textContent = short;
    }
    function syncOverlays() {
        const hasState = Boolean(state);
        ov.help.hidden = !helpOpen;
        ov.cheats.hidden = !cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen || !hasState || state.over;
        ov.over.hidden = !hasState || !state.over || cheatsOpen || helpOpen;
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
    }
    function setPaused(on) {
        if (online || (state && state.over)) return;
        const next = Boolean(on);
        if (paused === next) return;
        paused = next;
        if (!paused) { lastT = nowMs(); flushDeferred(); scheduleBot(); }
        render();
    }

    /* ---------------- rendering ---------------- */
    function towerSvg(type, owner) {
        const c = TOWERS[type].color, ring = SEAT_COLORS[owner];
        let icon;
        if (type === "arrow") icon = `<path d="M-5 2 L0 -7 L5 2 M0 -7 V7" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        else if (type === "frost") icon = `<path d="M0 -7 V7 M-6 -3.5 L6 3.5 M-6 3.5 L6 -3.5" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`;
        else icon = `<rect x="-5" y="-5" width="10" height="10" rx="2.5" fill="${c}"/>`;
        return `<circle r="15" fill="#0f172a" stroke="${ring}" stroke-width="2"/>${icon}`;
    }
    function enemySvg(kind) {
        const c = kind === "runner" ? "#f59e0b" : kind === "tank" ? "#8b5cf6" : "#ef4444";
        const r = kind === "runner" ? 7 : kind === "tank" ? 12 : 9;
        return `<circle class="tg-body" r="${r}" fill="${c}" stroke="#0b1220" stroke-width="2"/><circle r="${r - 4}" fill="#0b1220" opacity=".3"/><rect class="tg-hpbar" x="-9" y="${-r - 8}" width="18" height="3.5" rx="1.75" fill="#34d399"/>`;
    }
    function renderGrid() {
        const g = geomFor(state);
        let s = `<rect width="${VBW}" height="${VBH}" fill="#0b1220"/>`;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const onPath = g.set.has(c + "," + r);
            s += `<rect x="${c * CELL + 1.5}" y="${r * CELL + 1.5}" width="${CELL - 3}" height="${CELL - 3}" rx="5" fill="${onPath ? "#22304a" : "#101a30"}" stroke="#ffffff08"${onPath ? "" : ` class="tg-free" data-c="${c}" data-r="${r}"`}/>`;
        }
        s += `<polyline points="${g.wp.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#3b4a63" stroke-width="3" stroke-dasharray="5 7" opacity=".7"/>`;
        const a = g.wp[0], b = g.wp[g.wp.length - 1];
        s += `<path d="M${a[0] - 14} ${a[1] - 7} L${a[0] - 2} ${a[1]} L${a[0] - 14} ${a[1] + 7}Z" fill="#34d399"/><text x="${a[0] + 2}" y="${a[1] - 14}" font-size="10" font-weight="700" fill="#34d399">START</text>`;
        s += `<path d="M${b[0] + 16} ${b[1] - 7} L${b[0] + 4} ${b[1]} L${b[0] + 16} ${b[1] + 7}Z" fill="#f87171"/><text x="${b[0] - 2}" y="${b[1] - 14}" font-size="10" font-weight="700" fill="#f87171" text-anchor="end">EXIT</text>`;
        gridLayer.innerHTML = s;
    }
    function resetLayers() {
        towerEls.forEach((el) => el.remove()); towerEls.clear();
        enemyEls.forEach((el) => el.remove()); enemyEls.clear();
        shotsLayer.innerHTML = "";
    }
    function syncTowers() {
        state.towers.forEach((t) => {
            if (towerEls.has(t.id)) return;
            const el = document.createElementNS(NS, "g");
            el.innerHTML = towerSvg(t.type, t.owner);
            el.setAttribute("class", "tg-tower");
            el.setAttribute("data-tid", String(t.id));
            el.setAttribute("transform", `translate(${t.c * CELL + CELL / 2},${t.r * CELL + CELL / 2})`);
            towersLayer.appendChild(el); towerEls.set(t.id, el);
        });
        Array.from(towerEls.keys()).forEach((id) => {
            if (!state.towers.some((t) => t.id === id)) { towerEls.get(id).remove(); towerEls.delete(id); }
        });
    }
    function syncEnemies() {
        const g = geomFor(state);
        state.enemies.forEach((e) => {
            let el = enemyEls.get(e.id);
            if (!el) { el = document.createElementNS(NS, "g"); el.innerHTML = enemySvg(e.kind); enemiesLayer.appendChild(el); enemyEls.set(e.id, el); }
            const p = posAt(g, e.d);
            el.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
            const bar = el.querySelector(".tg-hpbar"), pct = Math.max(0, e.hp / e.maxHp);
            bar.setAttribute("width", String(18 * pct));
            bar.setAttribute("fill", pct > 0.5 ? "#34d399" : pct > 0.25 ? "#f59e0b" : "#ef4444");
            el.querySelector(".tg-body").setAttribute("stroke", e.slowT > 0 ? "#67e8f9" : "#0b1220");
        });
        Array.from(enemyEls.keys()).forEach((id) => {
            if (!state.enemies.some((e) => e.id === id)) { enemyEls.get(id).remove(); enemyEls.delete(id); }
        });
    }
    function syncShots() {
        state.shots.forEach((s) => {
            const ln = document.createElementNS(NS, "line");
            ln.setAttribute("x1", s.x1); ln.setAttribute("y1", s.y1); ln.setAttribute("x2", s.x2); ln.setAttribute("y2", s.y2);
            ln.setAttribute("stroke", s.color); ln.setAttribute("stroke-width", "3"); ln.setAttribute("stroke-linecap", "round");
            ln.setAttribute("class", "tg-shot");
            shotsLayer.appendChild(ln); later(280, () => ln.remove());
        });
    }
    function renderGhost() {
        if (!state || !cursorOn || state.over) { ghostLayer.innerHTML = ""; return; }
        const { c, r } = cursor;
        if (!inBounds(c, r)) { ghostLayer.innerHTML = ""; return; }
        const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
        const tw = state.towers.find((t) => t.c === c && t.r === r);
        if (tool === "sell") {
            ghostLayer.innerHTML = tw && tw.owner === mySeat()
                ? `<circle cx="${cx}" cy="${cy}" r="18" fill="none" stroke="#f87171" stroke-width="2.5" stroke-dasharray="4 4"/>`
                : "";
            return;
        }
        const spec = TOWERS[tool];
        const ok = canBuild(state, c, r) && state.gold[mySeat()] >= costOf(state, tool);
        let s = `<circle cx="${cx}" cy="${cy}" r="${spec.range}" fill="${spec.color}" opacity=".07"/><circle cx="${cx}" cy="${cy}" r="${spec.range}" fill="none" stroke="${spec.color}" opacity=".25"/>`;
        s += `<g transform="translate(${cx},${cy})" opacity=".75">${towerSvg(tool, mySeat())}</g>`;
        if (!ok) s += `<rect x="${c * CELL + 3}" y="${r * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="5" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 4"/>`;
        ghostLayer.innerHTML = s;
    }
    let lastPauseIcon = "";
    function render() {
        if (!state) {
            hud.status.textContent = "Waiting for host…";
            syncOverlays();
            return;
        }
        if (state.mapId !== lastMapId) {
            lastMapId = state.mapId; resetLayers(); renderGrid();
            const g = geomFor(state);
            const [c0, r0] = state.waypoints[0];
            cursor = { c: clamp(c0 + 1, 0, COLS - 1), r: clamp(r0 + 1, 0, ROWS - 1) };
            if (g.set.has(cursor.c + "," + cursor.r)) cursor.r = clamp(cursor.r + 1, 0, ROWS - 1);
            overPublished = false; bestWritten = false;
        }
        const me = mySeat();
        hud.gold.textContent = String(state.gold[me]);
        hud.lives.textContent = String(state.lives);
        hud.wave.textContent = state.wave + "/" + WAVES;
        hud.map.textContent = state.mapName;
        hud.score.textContent = `${seatName(0)} ${state.earned[0]} · ${seatName(1)} ${state.earned[1]}`;
        hud.turn.textContent = state.over ? "—" : state.phase === "wave" ? "Wave running" : (state.ready[me] ? "Waiting…" : seatName(state.turn) + (state.turn === me ? " (you)" : ""));
        hud.status.textContent = state.over ? (state.won ? "Victory" : "Defeat")
            : paused ? "Paused"
                : state.phase === "wave" ? "Wave " + state.wave + " incoming"
                    : state.turn === me ? "Your turn to build" : seatName(state.turn) + " is building…";

        TOWER_KEYS.forEach((k) => {
            pickBtns[k].dataset.on = tool === k ? "1" : "";
            pickBtns[k].disabled = state.gold[me] < costOf(state, k) || state.over;
        });
        sellBtn.dataset.on = tool === "sell" ? "1" : "";
        readyBtn.disabled = state.phase !== "build" || state.ready[me] || state.over;
        setLabel(readyBtn, state.phase === "wave" ? "Wave " + state.wave + "…" : state.ready[me] ? "Ready ✓" : "Ready", "GO");
        shuffleBtn.hidden = !(state.phase === "build" && state.wave === 0 && !state.over);
        pauseBtn.disabled = online || state.over;
        setLabel(pauseBtn, paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        pauseBtn.dataset.on = paused ? "1" : "";
        const iconKey = paused ? "play" : "pause";
        if (lastPauseIcon !== iconKey) {
            lastPauseIcon = iconKey;
            const pic = pauseBtn.querySelector(".tg-picon");
            if (pic) pic.innerHTML = iconSVG(iconKey, { size: 14 });
        }
        speedBtn.disabled = online || state.over;
        setLabel(speedBtn, speed + "x", speed + "x");
        [["free", "Free build"], ["rapid", "Rapid fire"], ["power", "Double damage"], ["slow", "Slow enemies"]].forEach(([k, label]) => {
            cheatBtns[k].textContent = label + ": " + (state.cheats[k] ? "ON" : "OFF");
            cheatBtns[k].dataset.on = state.cheats[k] ? "1" : "";
        });
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) {
            const active = Object.keys(state.cheats).filter((k) => state.cheats[k]).length;
            cbtn.classList.toggle("on", active > 0);
            const label = cbtn.querySelector(".tg-btn-label");
            if (label) label.textContent = active ? "Cheats " + active : "Cheats";
        }

        if (state.over) {
            out.title.textContent = state.won ? "The gate holds!" : "Gate breached";
            out.title.className = state.won ? "tg-win" : "tg-lose";
            out.reason.textContent = state.won
                ? `Semua ${WAVES} wave dipatahkan dengan ${state.lives} lives tersisa.`
                : `Gerbang jebol di wave ${state.wave}. Coba Frost di tikungan dan Cannon di titik gerombolan.`;
            const w = state.winner;
            out.duel.textContent = (w === -1 ? "Duel seri." : `Pemenang duel: ${seatName(w)}.`) +
                ` Skor ${seatName(0)} ${state.earned[0]}g · ${seatName(1)} ${state.earned[1]}g.` +
                (state.cheatsUsed ? " (cheats aktif)" : "");
            const score = state.wave * 100 + state.lives * 10 + state.earned[me];
            if (!bestWritten) {
                bestWritten = true;
                try {
                    const prev = Number(localStorage.getItem(META.bestKey) || 0);
                    if (score > prev) localStorage.setItem(META.bestKey, String(score));
                } catch (_) { }
            }
            let best = score;
            try { best = Math.max(best, Number(localStorage.getItem(META.bestKey) || 0) || 0); } catch (_) { }
            out.best.textContent = "Best " + best;
        }
        syncOverlays();
        syncTowers(); syncEnemies(); syncShots(); renderGhost();
    }

    /* ---------------- jaringan / otoritas ---------------- */
    function publishNow() {
        if (online && room.isHost && state) room.publishState({ ...state, shots: [] }).catch(console.warn);
    }
    function publish() { render(); publishNow(); scheduleBot(); }

    function startWave() {
        state.wave += 1;
        const d = waveDef(state.wave);
        state.waveCount = d.count; state.spacingMs = d.spacingMs; state.spawned = 0; state.spawnT = 0;
        state.phase = "wave";
        toast(`Wave ${state.wave} — ${d.count} attackers incoming`);
    }
    function waveCleared() {
        const bonus = WAVE_BONUS(state.wave);
        state.gold[0] += bonus; state.gold[1] += bonus;
        if (state.wave >= WAVES) {
            state.over = true; state.won = true;
            state.winner = state.earned[0] === state.earned[1] ? -1 : state.earned[0] > state.earned[1] ? 0 : 1;
        } else {
            state.phase = "build"; state.ready = [false, false];
            state.firstSeat = 1 - state.firstSeat; state.turn = state.firstSeat;
            toast(`Wave ${state.wave} cleared! +${bonus}g each — ${seatName(state.turn)} builds first`);
        }
        publish();
    }

    function applyAction(action, actor) {
        if (!state || (actor !== 0 && actor !== 1)) return;
        const st = state, me = actor;
        switch (action.type) {
            case "build": {
                if (st.over || (st.phase !== "build" && st.phase !== "wave")) return;
                if (st.phase === "build" && st.turn !== me && !st.ready[1 - me]) { toast("Not your turn yet"); return; }
                const k = action.t;
                if (!TOWERS[k] || !inBounds(action.c, action.r)) return;
                if (!canBuild(st, action.c, action.r)) { toast("Cannot build there"); return; }
                const cost = costOf(st, k);
                if (st.gold[me] < cost) { toast("Not enough gold for " + TOWERS[k].name); return; }
                st.gold[me] -= cost;
                st.towers.push({ id: st.nextTowerId++, c: action.c, r: action.r, type: k, owner: me, cd: 0 });
                if (st.phase === "build" && !st.ready[1 - me]) st.turn = 1 - me;
                toast(`${seatName(me)} built ${TOWERS[k].name}${cost ? " (-" + cost + "g)" : " (free)"}`);
                break;
            }
            case "sell": {
                if (st.over || st.phase !== "build") return;
                const t = st.towers.find((x) => x.id === action.id);
                if (!t || t.owner !== me) return;
                const refund = Math.floor(TOWERS[t.type].cost * 0.6);
                st.gold[me] += refund;
                st.towers = st.towers.filter((x) => x.id !== t.id);
                toast(`Sold ${TOWERS[t.type].name} (+${refund}g)`);
                break;
            }
            case "ready": {
                if (st.over || st.phase !== "build" || st.ready[me]) return;
                st.ready[me] = true;
                if (st.ready[0] && st.ready[1]) startWave();
                else { st.turn = 1 - me; toast(seatName(me) + " is ready"); }
                break;
            }
            case "cheat": {
                const k = action.kind;
                st.cheatsUsed = true;
                if (k === "gold") { st.gold[me] += 150; toast("+150 gold"); }
                else if (k === "lives") { st.lives = LIVES; toast("Lives refilled"); }
                else if (k === "clear") { if (st.phase === "wave") { st.enemies = []; st.spawned = st.waveCount; toast("Wave skipped"); } }
                else if (k in st.cheats) { st.cheats[k] = !st.cheats[k]; toast("Cheat " + k + ": " + (st.cheats[k] ? "ON" : "OFF")); }
                break;
            }
            case "shuffle": {
                if (st.over || st.phase !== "build" || st.wave !== 0) return;
                st.towers.forEach((t) => (st.gold[t.owner] += TOWERS[t.type].cost));
                st.towers = [];
                const m = generateMap(Math.random);
                st.mapId = rid(); st.mapName = m.name; st.waypoints = m.waypoints; st.pathCells = m.cells;
                toast("New map: " + m.name + " (towers refunded)");
                break;
            }
            case "restart": {
                cancelTimers();
                state = newMatch();
                paused = false;
                lastT = nowMs();
                toast(`New match — coin flip: ${seatName(state.firstSeat)} builds first` + (online ? ` · you are ${seatName(mySeat()) === (playerName || "You") ? "P" + (mySeat() + 1) : "P" + (mySeat() + 1)}` : ""));
                break;
            }
            default: return;
        }
        publish();
    }

    function submitAction(action) {
        if (!state && action.type !== "restart") return;
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------------- bot (mode ai) ---------------- */
    function scheduleBot() {
        if (online || botTimer || !state) return;
        if (state.phase !== "build" || state.over || state.turn !== 1 || state.ready[1]) return;
        botTimer = later(650 + Math.random() * 500, () => { botTimer = 0; botAct(); });
    }
    function botAct() {
        const st = state;
        if (!st || st.phase !== "build" || st.over || st.turn !== 1 || st.ready[1]) return;
        const myT = st.towers.filter((t) => t.owner === 1).length;
        const yourT = st.towers.length - myT;
        const afford = TOWER_KEYS.filter((k) => costOf(st, k) <= st.gold[1]);
        if (!afford.length || (myT >= yourT + 2 && myT >= 3) || (st.wave >= 2 && myT > yourT && st.gold[1] < 70)) {
            applyAction({ type: "ready" }, 1); return;
        }
        const g = geomFor(st);
        let best = null;
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
            if (!canBuild(st, c, r)) continue;
            const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
            for (const k of afford) {
                const spec = TOWERS[k];
                let cov = 0;
                for (const [px, py] of g.centers) if (Math.hypot(px - cx, py - cy) <= spec.range) cov++;
                const val = cov * (spec.dmg * 1000 / spec.rate) * (k === "cannon" ? 1.25 : k === "frost" ? 0.8 : 1) - costOf(st, k) * 0.3;
                if (!best || val > best.val) best = { val, c, r, k };
            }
        }
        if (!best || best.val < 5) applyAction({ type: "ready" }, 1);
        else applyAction({ type: "build", c: best.c, r: best.r, t: best.k }, 1);
    }

    /* ---------------- loop ---------------- */
    function frame(now) {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(100, now - lastT); lastT = now;
        if (!state || state.over || state.phase !== "wave") return;
        const authority = !online || room.isHost;
        if (authority && paused) return;
        let left = dt * (authority ? speed : 1);   // guest: prediksi deterministik antar-sync
        while (left > 0 && !state.over) { const s = Math.min(40, left); state = stepSim(state, s); left -= s; }
        render();
        if (authority) {
            if (state.over) { if (!overPublished) { overPublished = true; publish(); } }
            else if (state.spawned >= state.waveCount && state.enemies.length === 0) waveCleared();
            else if (online) { pubAcc += dt; if (pubAcc >= 300) { pubAcc = 0; publishNow(); } }
        }
    }

    /* ---------------- input: mouse / klik ---------------- */
    function cellFromEvent(e) {
        /* viewBox-aware mapping: works even when the board letterboxes the SVG */
        const m = svg.getScreenCTM();
        if (!m) return null;
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
        const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
        return inBounds(c, r) ? { c, r } : null;
    }
    function handleMove(e) {
        const cell = cellFromEvent(e);
        if (cell) { cursor = cell; cursorOn = true; } else cursorOn = false;
        renderGhost();
    }
    function handleLeave() { cursorOn = false; renderGhost(); }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { setPaused(!paused); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        if (t.closest("[data-restart]")) { submitAction({ type: "restart" }); return; }

        const cheat = t.closest("[data-cheat]");
        if (cheat) { submitAction({ type: "cheat", kind: cheat.dataset.cheat }); return; }
        const pad = t.closest("[data-pad]");
        if (pad) {
            const d = pad.dataset.pad;
            cursorOn = true;
            if (d === "build") submitAction({ type: "build", c: cursor.c, r: cursor.r, t: tool === "sell" ? "arrow" : tool });
            else {
                cursor.c = clamp(cursor.c + (d === "left" ? -1 : d === "right" ? 1 : 0), 0, COLS - 1);
                cursor.r = clamp(cursor.r + (d === "up" ? -1 : d === "down" ? 1 : 0), 0, ROWS - 1);
                renderGhost();
            }
            return;
        }
        const tw = t.closest("[data-tid]");
        if (tw && state) {
            if (tool === "sell") submitAction({ type: "sell", id: Number(tw.dataset.tid) });
            else toast("Pilih tool Sell (X) atau klik kanan untuk menjual tower ini");
            return;
        }
        const cellEl = t.closest(".tg-free");
        if (cellEl && state) {
            const c = Number(cellEl.dataset.c), r = Number(cellEl.dataset.r);
            cursor = { c, r }; cursorOn = true;
            if (tool === "sell") toast("Tidak ada tower di sel ini");
            else submitAction({ type: "build", c, r, t: tool });
            return;
        }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "pick") { tool = btn.dataset.t; render(); }
        else if (act === "sell") { tool = "sell"; render(); }
        else if (act === "ready") submitAction({ type: "ready" });
        else if (act === "shuffle") submitAction({ type: "shuffle" });
        else if (act === "speed") { if (!online) { speed = speed === 1 ? 2 : 1; render(); } }
    }
    function handleContext(e) {
        const tw = e.target.closest && e.target.closest("[data-tid]");
        if (!tw || !state) return;
        e.preventDefault();
        submitAction({ type: "sell", id: Number(tw.dataset.tid) });
    }

    /* ---------------- input: keyboard (help > cheats > pause > Esc > actions) ---------------- */
    function handleKey(e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const c = e.code || "";
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused(!paused);
            e.preventDefault(); return;
        }
        if (helpOpen || cheatsOpen) {
            if (c === "Enter") {
                if (helpOpen) toggleHelp(false); else toggleCheats(false);
                e.preventDefault();
            }
            return;
        }
        const handled = ["Digit1", "Digit2", "Digit3", "KeyX", "KeyW", "KeyA", "KeyS", "KeyD",
            "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyE", "KeyF", "KeyR"];
        if (!handled.includes(c)) return;
        e.preventDefault();
        if (!state) return;
        if (c === "Digit1" || c === "Digit2" || c === "Digit3") { tool = TOWER_KEYS[Number(c.slice(-1)) - 1]; render(); return; }
        if (c === "KeyX") { tool = "sell"; render(); return; }
        if (c === "KeyR") { submitAction({ type: "restart" }); return; }
        if (c === "KeyE" || c === "Enter") { submitAction({ type: "ready" }); return; }
        if (c === "KeyF") { if (!online) { speed = speed === 1 ? 2 : 1; render(); } return; }
        if (c === "Space") { cursorOn = true; if (tool !== "sell") submitAction({ type: "build", c: cursor.c, r: cursor.r, t: tool }); return; }
        const mv = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] }[c];
        if (mv) {
            cursorOn = true;
            cursor.c = clamp(cursor.c + mv[0], 0, COLS - 1);
            cursor.r = clamp(cursor.r + mv[1], 0, ROWS - 1);
            renderGhost();
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleContext);
    svg.addEventListener("mousemove", handleMove);
    svg.addEventListener("mouseleave", handleLeave);
    document.addEventListener("keydown", handleKey);

    /* ---------------- boot ---------------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            state = newMatch();
            toast(`Coin flip: ${seatName(state.firstSeat)} builds first · you are P${mySeat() + 1}`);
            publish();
            const offAct = room.onAction((action) => applyAction(action, 1 - state.hostSeat));
            if (typeof offAct === "function") unsubs.push(offAct);
        } else {
            render();
            const offState = room.onState((nextState) => {
                if (!nextState) return;
                state = nextState; state.shots = [];
                render();
            });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        state = newMatch();
        toast(`Coin flip: ${seatName(state.firstSeat)} builds first — place towers, then Ready`);
        render();
        scheduleBot();
    }
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);

    return {
        destroy() {
            cancelAnimationFrame(rafId);
            cancelTimers();
            document.removeEventListener("keydown", handleKey);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleContext);
            svg.removeEventListener("mousemove", handleMove);
            svg.removeEventListener("mouseleave", handleLeave);
            unsubs.forEach((fn) => { try { fn(); } catch (_) { } });
        },
    };
}