/* ==== GAME: block-paint.js ==== */

import { iconSVG } from "../JS/icons.js";

/*
 * BLOCK PAINT - puzzle kompetitif (vs bot / multiplayer room).
 * Dua puck bergiliran meluncur sampai menabrak dinding / tepi arena /
 * puck lawan, mengecat setiap sel yang dilewati. Pemenang = sel terbanyak
 * saat lantai penuh atau kedua pemain tidak bisa mengecat lagi.
 *
 * - Level random selalu diverifikasi solvable lewat BFS (pos, paint-mask),
 *   dengan fallback koridor boustrophedon yang dijamin solvable.
 * - Deteksi "stuck" memakai BFS reachability posisi (multi-langkah),
 *   bukan sekadar cek satu luncuran -> memperbaiki bug stuck palsu.
 * - Giliran pertama diacak; seat host/guest diacak saat multiplayer.
 * - Tanpa tutorial, tanpa canvas, tanpa emoji, tanpa asset.
 */

export const META = {
    id: "block-paint",
    name: "Block Paint",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Slide your puck, paint the floor, and outscore your rival on a tiny grid.",
    art:
        '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="4" y="4" width="40" height="40" rx="4" stroke-opacity=".4" stroke-width="2"/>' +
        '<path d="M14 4v40M24 4v40M34 4v40M4 14h40M4 24h40M4 34h40" stroke-opacity=".22" stroke-width="1.6"/>' +
        '<rect x="6.5" y="26.5" width="7" height="7" rx="1.5" fill="currentColor" fill-opacity=".45" stroke="none"/>' +
        '<rect x="16.5" y="26.5" width="7" height="7" rx="1.5" fill="currentColor" fill-opacity=".45" stroke="none"/>' +
        '<rect x="26.5" y="26.5" width="7" height="7" rx="1.5" fill="currentColor" fill-opacity=".45" stroke="none"/>' +
        '<circle cx="10" cy="30" r="4.2" fill="#0b1020" stroke="currentColor" stroke-width="2.4"/>' +
        '<path d="M36 26l6 4-6 4" stroke-width="2.6"/>' +
        "</svg>",
    bg: ["#e0e7ff", "#c7d2fe"],
};

/* ================= pure helpers (di luar mount agar reusable) ================= */

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_LIST = ["up", "down", "left", "right"];

/* Luncuran: berhenti di dinding / tepi / block (puck lawan). */
function slide(cells, pos, dir, block) {
    const h = cells.length, w = cells[0].length;
    const d = DIRS[dir];
    if (!d || !pos) return { stop: { x: pos.x, y: pos.y }, path: [{ x: pos.x, y: pos.y }], moved: false };
    let x = pos.x, y = pos.y;
    const path = [{ x, y }];
    for (; ;) {
        const nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || cells[ny][nx]) break;
        if (block && block.x === nx && block.y === ny) break;
        x = nx; y = ny;
        path.push({ x, y });
    }
    return { stop: { x, y }, path, moved: path.length > 1 };
}

/* BFS (posisi, bitmask cat) untuk membuktikan level solvable satu puck. */
function solveBFS(level, budget) {
    const { w, h, cells } = level;
    const bit = new Int32Array(w * h).fill(-1);
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!cells[y][x]) bit[y * w + x] = n++;
    const s = level.start;
    if (!n || !s || cells[s.y][s.x]) return { ok: false };
    if (n === 1) return { ok: true };
    const full = (1 << n) - 1, span = full + 1;
    const startMask = 1 << bit[s.y * w + s.x];
    if (startMask === full) return { ok: true };
    let cap = budget ? Math.min(budget.left, 200000) : 200000;
    const seen = new Set([s.y * w * span + s.x * span + startMask]);
    const q = [{ p: s.y * w + s.x, m: startMask, d: 0 }];
    let head = 0;
    while (head < q.length) {
        if (cap <= 0) { if (budget) budget.left = 0; return { ok: false, abort: true }; }
        cap--; if (budget) budget.left--;
        const cur = q[head++];
        const px = cur.p % w, py = (cur.p / w) | 0;
        for (const dir of DIR_LIST) {
            const r = slide(cells, { x: px, y: py }, dir);
            if (!r.moved) continue;
            let nm = cur.m;
            for (const c of r.path) nm |= 1 << bit[c.y * w + c.x];
            if (nm === full) return { ok: true };
            const np = r.stop.y * w + r.stop.x;
            const key = np * span + nm;
            if (seen.has(key)) continue;
            seen.add(key);
            q.push({ p: np, m: nm, d: cur.d + 1 });
        }
    }
    return { ok: false };
}

function connected(level) {
    const { w, h, cells } = level;
    const seen = new Uint8Array(w * h);
    const stack = [level.start.y * w + level.start.x];
    seen[stack[0]] = 1;
    let cnt = 0;
    while (stack.length) {
        const p = stack.pop(); cnt++;
        const x = p % w, y = (p / w) | 0;
        for (const dir of DIR_LIST) {
            const d = DIRS[dir], nx = x + d[0], ny = y + d[1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || cells[ny][nx] || seen[ny * w + nx]) continue;
            seen[ny * w + nx] = 1;
            stack.push(ny * w + nx);
        }
    }
    return cnt === level.free;
}

/* Fallback yang dijamin solvable: koridor boustrophedon. */
function corridorLevel(w, h) {
    const cells = [];
    for (let y = 0; y < h; y++) cells.push(new Array(w).fill(1));
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x++) cells[y][x] = 0;
    for (let y = 1; y < h; y += 2) cells[y][((y - 1) / 2) % 2 === 0 ? w - 1 : 0] = 0;
    const walls = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y][x]) walls.push(y * w + x);
    return { w, h, walls, cells, start: { x: 0, y: 0 }, free: w * h - walls.length };
}

/* Random walls + random start, di-retry sampai BFS membuktikan solvable. */
function genLevel(w, h, wallCount) {
    const size = w * h;
    let wc = Math.max(0, Math.min((wallCount || 0) | 0, size - 8));
    if (size - wc > 20) wc = size - 20; // jaga state space bitmask tetap kecil
    const budget = { left: 700000 };
    for (let attempt = 0; attempt < 400; attempt++) {
        if (budget.left <= 0) break;
        const cells = [];
        for (let y = 0; y < h; y++) cells.push(new Array(w).fill(0));
        const walls = [];
        let guard = 0;
        while (walls.length < wc && guard++ < 300) {
            const f = (Math.random() * size) | 0;
            const fy = (f / w) | 0, fx = f % w;
            if (!cells[fy][fx]) { cells[fy][fx] = 1; walls.push(f); }
        }
        const open = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!cells[y][x]) open.push({ x, y });
        if (open.length < 2 || open.length > 20) continue;
        const level = { w, h, walls, cells, start: open[(Math.random() * open.length) | 0], free: open.length };
        if (!connected(level)) continue;
        if (solveBFS(level, budget).ok) return level; // terbukti solvable
    }
    return corridorLevel(w, h); // dijamin solvable secara konstruktif
}

function levelCfg(n) {
    if (n <= 1) return { w: 4, h: 4, walls: 1 };
    if (n === 2) return { w: 4, h: 4, walls: 2 };
    if (n === 3) return { w: 4, h: 5, walls: 2 };
    if (n === 4) return { w: 4, h: 5, walls: 3 };
    return { w: 5, h: 5, walls: 5 };
}

function farthestOpen(level, from) {
    let best = [], bestD = -1;
    for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) {
        if (level.cells[y][x] || (x === from.x && y === from.y)) continue;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (d > bestD) { bestD = d; best = [{ x, y }]; }
        else if (d === bestD) best.push({ x, y });
    }
    return best[(Math.random() * best.length) | 0] || { x: from.x, y: from.y };
}

/* FIX BUG STUCK: cek semua posisi yang bisa dicapai (multi-luncuran),
   bukan hanya satu luncuran dari posisi sekarang. */
function canPaint(st, idx) {
    const { cells, w } = st.level;
    const pos = st.pucks[idx], block = st.pucks[1 - idx];
    const seen = new Set([pos.y * w + pos.x]);
    const stack = [pos];
    while (stack.length) {
        const p = stack.pop();
        for (const dir of DIR_LIST) {
            const r = slide(cells, p, dir, block);
            for (const c of r.path) if (st.painted[c.y * w + c.x] === 0) return true;
            if (r.moved) {
                const k = r.stop.y * w + r.stop.x;
                if (!seen.has(k)) { seen.add(k); stack.push(r.stop); }
            }
        }
    }
    return false;
}

/* Langkah terbaik: greedy cat terbanyak; jika nol, cari jalur terpendek
   menuju luncuran yang mengecat (dipakai bot, hint, dan cheat). */
function bestMove(st, idx) {
    const { cells, w } = st.level;
    const pos = st.pucks[idx], block = st.pucks[1 - idx];
    let best = null, bestGain = 0;
    for (const dir of DIR_LIST) {
        const r = slide(cells, pos, dir, block);
        if (!r.moved) continue;
        let g = 0;
        for (const c of r.path) if (st.painted[c.y * w + c.x] === 0) g++;
        if (g > 0 && (g > bestGain || (g === bestGain && Math.random() < 0.5))) { bestGain = g; best = dir; }
    }
    if (best) return { dir: best, gain: bestGain };
    const startK = pos.y * w + pos.x;
    const prev = new Map([[startK, null]]);
    const q = [pos];
    let head = 0;
    while (head < q.length) {
        const p = q[head++];
        for (const dir of DIR_LIST) {
            const r = slide(cells, p, dir, block);
            if (!r.moved) continue;
            let g = 0;
            for (const c of r.path) if (st.painted[c.y * w + c.x] === 0) g++;
            if (g > 0) {
                let curK = p.y * w + p.x, first = dir;
                while (prev.get(curK)) { const e = prev.get(curK); first = e.dir; curK = e.k; }
                return { dir: first, gain: 0 };
            }
            const k = r.stop.y * w + r.stop.x;
            if (!prev.has(k)) { prev.set(k, { k: p.y * w + p.x, dir }); q.push(r.stop); }
        }
    }
    return null;
}

function paintCounts(st) {
    let a = 0, b = 0;
    for (const v of st.painted) { if (v === 1) a++; else if (v === 2) b++; }
    return [a, b];
}

const randFirst = () => (Math.random() < 0.5 ? 0 : 1);

function makeState(levelNo, seats, first) {
    const cfg = levelCfg(levelNo);
    const level = genLevel(cfg.w, cfg.h, cfg.walls);
    const a = level.start;
    const b = farthestOpen(level, a);
    const painted = new Array(level.w * level.h).fill(0);
    painted[a.y * level.w + a.x] = 1;
    painted[b.y * level.w + b.x] = 2;
    return {
        v: 1, levelNo,
        level: { w: level.w, h: level.h, cells: level.cells, walls: level.walls, free: level.free },
        starts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
        pucks: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
        painted, moves: [0, 0],
        turn: first, first, seats,
        status: "playing", winner: null, passed: null, lastPath: [],
    };
}

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let helpOpen = false, cheatsOpen = false, paused = false;

    /* Bantuan internal: tampil sekali saat game pertama dibuka. */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("blockPaintHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("blockPaintHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- shell: HUD + board + overlays ---------- */
    root.innerHTML = `
<style>
.bp-app{--p0:#4f46e5;--p0s:#c7d2fe;--p1:#d97706;--p1s:#fde68a;--ink:#27272a;--line:#e4e4e7;
  user-select:none;-webkit-tap-highlight-color:transparent;color:var(--ink);
  display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0}
.bp-app [hidden]{display:none!important}
.bp-app .bp-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.bp-app .bp-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#52525b;
  border:1px solid var(--line);border-radius:999px;padding:5px 10px;background:#fff;white-space:nowrap}
.bp-app .bp-chip b{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.bp-app .bp-statuschip{color:#71717a}
.bp-app .bp-sw{width:9px;height:9px;border-radius:3px;display:inline-block}
.bp-app .bp-sw0{background:var(--p0)} .bp-app .bp-sw1{background:var(--p1)}
.bp-app .bp-colon{color:#a1a1aa}
.bp-app .bp-turn{width:8px;height:8px;border-radius:50%;background:#a1a1aa;display:inline-block}
.bp-app .bp-spacer{flex:1 1 auto}
.bp-app .bp-btn{font:inherit;font-size:12px;padding:7px 11px;border-radius:9px;cursor:pointer;
  border:1px solid var(--line);background:#fff;color:var(--ink);min-height:32px;
  display:inline-flex;align-items:center;gap:6px;transition:background .15s,transform .05s}
.bp-app .bp-btn:hover{background:#f4f4f5}
.bp-app .bp-btn:active{transform:translateY(1px)}
.bp-app .bp-btn.primary{background:#18181b;border-color:#18181b;color:#fff}
.bp-app .bp-btn.primary:hover{background:#3f3f46}
.bp-app .bp-btn.on{border-color:var(--p0);color:var(--p0);background:#eef0ff}
.bp-app .bp-icon-btn svg{flex:none;display:block}
.bp-app .bp-panel{position:relative;display:grid;place-items:center;padding:18px;
  background:#fafafa;border:1px solid #ececf0;border-radius:16px;min-height:0;flex:1}
.bp-app .bp-grid{--gap:4px;position:relative;display:grid;gap:var(--gap);touch-action:none}
.bp-app .bp-cell{width:var(--cs);height:var(--cs);border-radius:8px;background:#eef0f4;
  border:1px solid #e3e6ec;transition:background-color .22s ease,border-color .22s ease}
.bp-app .bp-cell.bp-wall{background:#232838;border-color:#232838}
.bp-app .bp-cell.bp-p0{background:var(--p0s);border-color:#a5b4fc}
.bp-app .bp-cell.bp-p1{background:var(--p1s);border-color:#fcd34d}
.bp-app .bp-puck{position:absolute;left:0;top:0;width:var(--cs);height:var(--cs);display:grid;place-items:center;
  transform:translate(calc(var(--px)*(var(--cs) + var(--gap))),calc(var(--py)*(var(--cs) + var(--gap))));
  transition:transform .16s ease-out;pointer-events:none;z-index:2}
.bp-app .bp-puck.bp-noanim{transition:none}
.bp-app .bp-dot{width:62%;height:62%;border-radius:50%;box-shadow:0 0 0 2.5px #fff,0 2px 6px rgba(0,0,0,.18)}
.bp-app .bp-puck0 .bp-dot{background:var(--p0)} .bp-app .bp-puck1 .bp-dot{background:var(--p1)}
.bp-app .bp-hint{position:absolute;left:0;top:0;width:var(--cs);height:var(--cs);display:grid;place-items:center;
  transform:translate(calc(var(--px)*(var(--cs) + var(--gap))),calc(var(--py)*(var(--cs) + var(--gap)))) rotate(var(--rot,0deg));
  pointer-events:none;z-index:3;opacity:0;transition:opacity .15s}
.bp-app .bp-hint.bp-show{opacity:1}
.bp-app .bp-hint svg{width:55%;height:55%;stroke:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
.bp-app .bp-ov{position:absolute;inset:0;display:grid;place-items:center;padding:14px;
  background:rgba(250,250,250,.82);backdrop-filter:blur(3px);border-radius:16px;z-index:5}
.bp-app .bp-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;
  width:min(420px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;
  box-shadow:0 4px 12px rgba(0,0,0,.06);overflow:hidden}
.bp-app .bp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.bp-app .bp-head h3{margin:0;font-size:14px;font-weight:600}
.bp-app .bp-sub{margin:0;font-size:12.5px;color:#71717a}
.bp-app .bp-cheats,.bp-app .bp-help,.bp-app .bp-stats{flex:1 1 auto;min-height:0;overflow:auto}
.bp-app .bp-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bp-app .bp-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center;flex:none}
.bp-app .bp-note{font-size:11px;color:#71717a;margin-right:auto}
.bp-app .bp-help b{display:block;margin:8px 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.06em}
.bp-app .bp-help ul{margin:0 0 10px;padding-left:18px;font-size:12px;line-height:1.6;color:#52525b}
.bp-app .bp-kbd{display:inline-block;padding:0 4px;border:1px solid var(--line);border-bottom-width:2px;
  border-radius:4px;background:#fafafa;color:var(--ink);font-size:11px}
.bp-app .bp-dpad{display:none;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,46px);
  gap:6px;justify-content:center}
.bp-app .bp-dbtn{display:grid;place-items:center;border:1px solid var(--line);border-radius:12px;
  background:#fff;color:var(--ink);cursor:pointer}
.bp-app .bp-dbtn:active{background:#f4f4f5}
.bp-app .bp-dbtn svg{width:20px;height:20px}
.bp-app .bp-dbtn.bp-flash{border-color:var(--p0);box-shadow:0 0 0 2px var(--p0s)}
@media (hover:none),(pointer:coarse),(max-width:640px){
  .bp-app .bp-dpad{display:grid}
  .bp-app .bp-panel{padding:12px}
}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.bp-app{min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.bp-app *,.bp-app *::before,.bp-app *::after{box-sizing:border-box}
.bp-app :where(svg,canvas,img){max-width:100%;height:auto}
.bp-app :where(button,[role="button"],select,input){touch-action:manipulation}
.bp-app :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--p0);outline-offset:2px}
/* 4px spacing grid: HUD/control rows wrap instead of overflowing on narrow screens. */
.bp-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){flex-wrap:wrap;min-width:0;gap:8px}
/* Thin borders and calm surfaces instead of heavy elevation. */
.bp-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
/* Clear type hierarchy: 12px metadata, compact headings. */
.bp-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.bp-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .bp-app :where([class*="stage"],[class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
  .bp-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"],[class*="intro"]){gap:8px}
}
@media (max-width:480px){
  .bp-app :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .bp-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .bp-app *,.bp-app *::before,.bp-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* ==== LAYOUT REDESIGN · fill height, icon HUD, overlay modal ==== */
.bp-app.game-fill > .bp-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.bp-app .bp-card{display:flex;flex-direction:column;overflow:hidden}
.bp-app .bp-head,.bp-app .bp-foot{flex:none}
.bp-app .bp-cheats,.bp-app .bp-help,.bp-app .bp-stats{min-height:0;overflow:auto}
@media (max-width:640px){
  .bp-app.game-fill > .bp-panel[data-board]:has(.bp-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .bp-app .bp-hud{gap:5px}
  .bp-app .bp-hud .bp-chip{padding:4px 6px;font-size:9px}
  .bp-app .bp-hud .bp-statuschip{display:none}
  .bp-app .bp-hud .bp-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .bp-app .bp-hud .bp-btn-label,.bp-app .bp-hud .bp-spacer{display:none}
  .bp-app .bp-ov{padding:8px}
  .bp-app .bp-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .bp-app .bp-cheats,.bp-app .bp-help,.bp-app .bp-stats{scrollbar-width:none}
  .bp-app .bp-cheats::-webkit-scrollbar,.bp-app .bp-help::-webkit-scrollbar,.bp-app .bp-stats::-webkit-scrollbar{display:none}
  .bp-app .bp-note{display:none}
}
</style>
<div class="game-app bp-app game-fill" data-bp>
  <div class="bp-hud">
    <span class="bp-chip">LV <b data-hud="level">1</b></span>
    <span class="bp-chip"><i class="bp-sw bp-sw0"></i><b data-hud="s0">0</b><span class="bp-colon">:</span><b data-hud="s1">0</b><i class="bp-sw bp-sw1"></i></span>
    <span class="bp-chip"><i class="bp-turn" data-turn></i><span data-hud="turn">-</span></span>
    <span class="bp-chip bp-statuschip"><i class="bp-turn" data-dot></i><span data-status>Waiting for host</span></span>
    <span class="bp-spacer"></span>
    <button class="bp-btn bp-icon-btn" type="button" data-shuffle aria-label="New level" title="New level (N)">${iconSVG("sparkles", { size: 14 })}<span class="bp-btn-label">New</span></button>
    <button class="bp-btn bp-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bp-btn-label">Help</span></button>
    <button class="bp-btn bp-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bp-btn-label">Cheats</span></button>
    <button class="bp-btn bp-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bp-btn-label">Pause</span></button>
    <button class="bp-btn bp-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bp-btn-label">Restart</span></button>
    <button class="bp-btn bp-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bp-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel bp-panel" data-board>
    <div class="bp-grid" data-grid></div>
    <div class="bp-ov" data-result hidden>
      <div class="bp-card">
        <div class="bp-head"><h3 data-result-title>Done</h3></div>
        <div class="bp-stats"><p class="bp-sub" data-result-sub></p></div>
        <div class="bp-foot">
          <button class="bp-btn primary" type="button" data-act="new">Next level</button>
          <button class="bp-btn" type="button" data-act="restart">Rematch</button>
        </div>
      </div>
    </div>
    <div class="bp-ov" data-ov="pause" hidden>
      <div class="bp-card">
        <div class="bp-head"><h3>Paused</h3></div>
        <div class="bp-stats"><p class="bp-sub">Bot and timers are frozen. Take your time.</p></div>
        <div class="bp-foot"><button class="bp-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="bp-ov" data-cheats hidden>
      <div class="bp-card">
        <div class="bp-head"><h3>Cheats</h3><button class="bp-btn" type="button" data-act="close-cheats">Close</button></div>
        <div class="bp-cheats">
          <div class="bp-cheatgrid">
            <button class="bp-btn" type="button" data-cheat="hint">Hint</button>
            <button class="bp-btn" type="button" data-cheat="auto">Best move</button>
            <button class="bp-btn" type="button" data-cheat="paint">Paint +5</button>
            <button class="bp-btn" type="button" data-cheat="turn">Extra turn</button>
            <button class="bp-btn" type="button" data-cheat="clear">Paint all</button>
            <button class="bp-btn" type="button" data-cheat="level">Skip level</button>
          </div>
        </div>
        <div class="bp-foot"><span class="bp-note">H help · C cheats · P pause · R restart</span></div>
      </div>
    </div>
    <div class="bp-ov" data-ov="help" hidden>
      <div class="bp-card">
        <div class="bp-head"><h3>How to play</h3><button class="bp-btn" type="button" data-help-close>Close</button></div>
        <div class="bp-help">
          <div>
            <b>Goal</b>
            <ul>
              <li>Slide your puck until it hits a wall or the rival puck; every cell you cross is painted.</li>
              <li>Most painted cells when the floor is full wins. First turn is random.</li>
            </ul>
            <b>Desktop</b>
            <ul>
              <li><span class="bp-kbd">Arrows</span> / <span class="bp-kbd">W A S D</span> — slide in a direction.</li>
              <li>Click any cell to slide toward it.</li>
              <li><span class="bp-kbd">H</span> help · <span class="bp-kbd">C</span> cheats · <span class="bp-kbd">P</span> pause · <span class="bp-kbd">R</span> restart · <span class="bp-kbd">N</span> new level.</li>
            </ul>
          </div>
          <div>
            <b>Mobile</b>
            <ul>
              <li>Use the direction pad below the board, or swipe across the board.</li>
              <li>Tap a cell to slide toward it.</li>
            </ul>
            <b>Rules</b>
            <ul>
              <li>A rival with no painting option passes automatically.</li>
              <li>Levels are verified solvable; a corridor layout is the fallback.</li>
            </ul>
            <div class="bp-foot"><span class="bp-note">Press H to reopen this guide</span><button class="bp-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="bp-dpad" aria-label="Direction pad">
    <button class="bp-dbtn" type="button" data-dir="up" style="grid-column:2;grid-row:1" aria-label="Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>
    <button class="bp-dbtn" type="button" data-dir="left" style="grid-column:1;grid-row:2" aria-label="Left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></button>
    <button class="bp-dbtn" type="button" data-dir="down" style="grid-column:2;grid-row:2" aria-label="Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>
    <button class="bp-dbtn" type="button" data-dir="right" style="grid-column:3;grid-row:2" aria-label="Right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg></button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const grid = $("[data-grid]");
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const turnDot = $("[data-turn]");
    const hud = { level: $('[data-hud="level"]'), s0: $('[data-hud="s0"]'), s1: $('[data-hud="s1"]'), turn: $('[data-hud="turn"]') };
    const ov = {
        result: $("[data-result]"),
        pause: $('[data-ov="pause"]'),
        cheat: $(".bp-ov[data-cheats]"),
        help: $('[data-ov="help"]'),
    };
    const resultTitle = $("[data-result-title]");
    const resultSub = $("[data-result-sub]");
    const pauseBtn = $("[data-pause]");
    const cheatsBtn = $("button[data-cheats]");

    /* ---------- timers (dijeda saat pause) ---------- */
    let timers = [];
    const queued = [];
    const later = (fn, ms) => {
        if (paused) { queued.push({ fn, ms }); return null; }
        const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms);
        timers.push(t);
        return t;
    };
    const flushQueued = () => { while (queued.length) { const q = queued.shift(); later(q.fn, q.ms); } };
    let botTimer = null, hintTimer = null;
    const clearTimers = () => {
        timers.forEach(clearTimeout); timers = [];
        queued.length = 0;
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    };

    /* ---------- seats & identitas ---------- */
    // Multiplayer: seat host diacak oleh host saat init, disimpan di state.
    const myIndex = () => (online ? (room.isHost ? state.seats.host : 1 - state.seats.host) : 0);
    const nameFor = (i) => (online ? (i === myIndex() ? "You" : "Opponent") : i === 0 ? "You" : "Bot");

    /* ---------- aturan main (host-authoritative) ---------- */
    function finish() {
        const [a, b] = paintCounts(state);
        state.status = "over";
        state.winner = a === b ? -1 : a > b ? 0 : 1;
    }

    function settleTurn(mover) {
        const [a, b] = paintCounts(state);
        if (a + b >= state.level.free) { finish(); return; }
        const next = 1 - mover;
        const nCan = canPaint(state, next);
        const cCan = canPaint(state, mover);
        if (!nCan && !cCan) { finish(); return; }
        if (nCan) { state.turn = next; state.passed = null; }
        else { state.turn = mover; state.passed = next; } // lawan buntu -> otomatis pass
    }

    function performMove(idx, dir) {
        const st = state;
        const r = slide(st.level.cells, st.pucks[idx], dir, st.pucks[1 - idx]);
        if (!r.moved) return false;
        st.moves[idx]++;
        st.pucks[idx] = { x: r.stop.x, y: r.stop.y };
        st.lastPath = r.path.map((c) => c.y * st.level.w + c.x);
        for (const k of st.lastPath) if (st.painted[k] === 0) st.painted[k] = idx + 1;
        settleTurn(idx);
        return true;
    }

    function restartLevel() {
        const st = state, { w, h } = st.level;
        st.pucks = st.starts.map((s) => ({ x: s.x, y: s.y }));
        st.painted = new Array(w * h).fill(0);
        st.painted[st.starts[0].y * w + st.starts[0].x] = 1;
        st.painted[st.starts[1].y * w + st.starts[1].x] = 2;
        st.moves = [0, 0];
        st.turn = st.first;
        st.status = "playing"; st.winner = null; st.passed = null; st.lastPath = [];
    }

    function applyCheat(actor, kind) {
        const st = state;
        if (!st) return;
        const { cells, w } = st.level;
        const isFree = (k) => !cells[(k / w) | 0][k % w];
        switch (kind) {
            case "auto": {
                if (st.status !== "playing") return;
                st.turn = actor;
                const mv = bestMove(st, actor);
                if (mv) performMove(actor, mv.dir);
                else settleTurn(1 - actor);
                break;
            }
            case "paint": {
                if (st.status !== "playing") return;
                const empty = [];
                st.painted.forEach((v, k) => { if (v === 0 && isFree(k)) empty.push(k); });
                for (let i = empty.length - 1; i > 0; i--) {
                    const j = (Math.random() * (i + 1)) | 0;
                    [empty[i], empty[j]] = [empty[j], empty[i]];
                }
                const take = empty.slice(0, 5);
                for (const k of take) st.painted[k] = actor + 1;
                st.lastPath = take;
                settleTurn(actor);
                break;
            }
            case "turn":
                if (st.status === "playing") { st.turn = actor; st.passed = null; }
                break;
            case "clear":
                if (st.status !== "playing") return;
                st.painted = st.painted.map((v, k) => (v === 0 && isFree(k) ? actor + 1 : v));
                finish();
                break;
            case "level":
                state = makeState(st.levelNo + 1, st.seats, randFirst());
                break;
        }
    }

    function applyAction(action, actor) {
        if (!state || !action) return;
        switch (action.type) {
            case "move":
                if (state.status !== "playing" || actor !== state.turn || !DIRS[action.dir]) return;
                if (performMove(actor, action.dir)) publish();
                return;
            case "cheat": applyCheat(actor, action.kind); publish(); return;
            case "restart": restartLevel(); publish(); return;
            case "new": state = makeState(state.levelNo + 1, state.seats, randFirst()); publish(); return;
            case "reshuffle": state = makeState(state.levelNo, state.seats, randFirst()); publish(); return;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, myIndex());
    }

    /* ---------- bot (mode ai) ---------- */
    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (online || paused || helpOpen || cheatsOpen || !state || state.status !== "playing" || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (paused || !state || state.status !== "playing" || state.turn !== 1) return;
            const mv = bestMove(state, 1);
            if (mv) applyAction({ type: "move", dir: mv.dir }, 1);
            else if (canPaint(state, 0)) { state.turn = 0; state.passed = 1; publish(); }
            else { finish(); publish(); }
        }, 550 + Math.random() * 450);
    }

    /* ---------- rendering ---------- */
    let builtKey = "", cellEls = [], puckEls = [], hintEl = null, prevPainted = null;

    function ensureBoard() {
        const { w, h, walls } = state.level;
        const key = state.levelNo + ":" + w + "x" + h + ":" + walls.join(",");
        if (key === builtKey) return false;
        builtKey = key;
        grid.innerHTML = "";
        grid.style.setProperty("--cs", w >= 5 || h >= 5 ? "clamp(38px,12vmin,56px)" : "clamp(42px,13vmin,64px)");
        grid.style.gridTemplateColumns = "repeat(" + w + ", var(--cs))";
        cellEls = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const div = document.createElement("div");
            div.className = "bp-cell" + (state.level.cells[y][x] ? " bp-wall" : "");
            div.dataset.k = y * w + x;
            grid.appendChild(div);
            cellEls.push(div);
        }
        puckEls = [0, 1].map((i) => {
            const p = document.createElement("div");
            p.className = "bp-puck bp-puck" + i + " bp-noanim";
            const d = document.createElement("div");
            d.className = "bp-dot";
            p.appendChild(d);
            grid.appendChild(p);
            return p;
        });
        hintEl = document.createElement("div");
        hintEl.className = "bp-hint";
        hintEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>';
        grid.appendChild(hintEl);
        prevPainted = null;
        return true;
    }

    function placePucks(anim) {
        puckEls.forEach((el, i) => {
            if (!anim) el.classList.add("bp-noanim");
            el.style.setProperty("--px", state.pucks[i].x);
            el.style.setProperty("--py", state.pucks[i].y);
            if (!anim) { void el.offsetWidth; el.classList.remove("bp-noanim"); }
        });
    }

    /* Overlay prioritas: help > cheats > pause > result. */
    function syncOverlays() {
        ov.help.hidden = !helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.result.hidden = !state || state.status !== "over" || paused || cheatsOpen || helpOpen;
        if (cheatsBtn) {
            cheatsBtn.classList.toggle("on", cheatsOpen);
            const label = cheatsBtn.querySelector(".bp-btn-label");
            if (label) label.textContent = cheatsOpen ? "Close" : "Cheats";
            cheatsBtn.setAttribute("aria-label", cheatsOpen ? "Close cheats" : "Cheats");
        }
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".bp-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        }
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
        if (!helpOpen && !paused) scheduleBot();
    }

    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
        if (!cheatsOpen && !helpOpen && !paused) scheduleBot();
    }

    function setPaused(on) {
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) { render(); return; }
        paused = next;
        if (paused) {
            helpOpen = false; cheatsOpen = false;
            if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
            if (hintEl) hintEl.classList.remove("bp-show");
            root.querySelectorAll(".bp-dbtn.bp-flash").forEach((b) => b.classList.remove("bp-flash"));
            if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        } else {
            flushQueued();
            scheduleBot();
        }
        render();
    }

    function render() {
        if (!state) { statusEl.textContent = "Waiting for host"; syncOverlays(); return; }
        const rebuilt = ensureBoard();
        const { w } = state.level;

        // sel + stagger cat untuk sel yang baru diwarnai
        const newly = [];
        for (let k = 0; k < cellEls.length; k++) {
            const v = state.painted[k];
            cellEls[k].classList.toggle("bp-p0", v === 1);
            cellEls[k].classList.toggle("bp-p1", v === 2);
            if (!rebuilt && prevPainted && v > 0 && prevPainted[k] === 0) newly.push(k);
        }
        if (newly.length) {
            const order = state.lastPath || [];
            newly.sort((a, b) => order.indexOf(a) - order.indexOf(b));
            newly.forEach((k, i) => {
                const el = cellEls[k];
                el.style.transitionDelay = i * 35 + "ms";
                later(() => { el.style.transitionDelay = ""; }, 450 + i * 35);
            });
        }
        prevPainted = state.painted.slice();
        placePucks(!rebuilt);

        // HUD
        const [a, b] = paintCounts(state);
        hud.level.textContent = String(state.levelNo);
        hud.s0.textContent = String(a);
        hud.s1.textContent = String(b);

        const me = myIndex();
        const p0Color = "#4f46e5", p1Color = "#d97706";
        if (state.status === "over") {
            hud.turn.textContent = "Finished";
            statusEl.textContent = "Game over";
            dotEl.style.background = "#a1a1aa";
            turnDot.style.background = "#a1a1aa";
            resultTitle.textContent =
                state.winner === -1 ? "Draw" : state.winner === me ? "You win" : nameFor(state.winner) + " wins";
            resultSub.textContent = a + " : " + b + " cells - Level " + state.levelNo;
        } else {
            const yours = state.turn === me;
            const label = yours ? "Your turn" : nameFor(state.turn) + "'s turn";
            const passNote = state.passed != null ? " - " + nameFor(state.passed) + " passes" : "";
            hud.turn.textContent = label;
            statusEl.textContent = label + passNote;
            const c = state.turn === 0 ? p0Color : p1Color;
            dotEl.style.background = c;
            turnDot.style.background = c;
        }
        syncOverlays();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---------- hint (lokal, tidak mengubah state) ---------- */
    function showHint() {
        if (!state || state.status !== "playing" || paused || helpOpen || cheatsOpen) return;
        const mv = bestMove(state, myIndex());
        if (!mv || !hintEl) return;
        const rot = { up: "0deg", right: "90deg", down: "180deg", left: "270deg" }[mv.dir];
        hintEl.style.setProperty("--px", state.pucks[myIndex()].x);
        hintEl.style.setProperty("--py", state.pucks[myIndex()].y);
        hintEl.style.setProperty("--rot", rot);
        hintEl.classList.add("bp-show");
        const btn = root.querySelector('.bp-dbtn[data-dir="' + mv.dir + '"]');
        if (btn) btn.classList.add("bp-flash");
        if (hintTimer) clearTimeout(hintTimer);
        hintTimer = setTimeout(() => {
            hintTimer = null;
            hintEl.classList.remove("bp-show");
            if (btn) btn.classList.remove("bp-flash");
        }, 1500);
    }

    /* ---------- input: klik / swipe / keyboard / dpad ---------- */
    function tryMove(dir) {
        if (!state || state.status !== "playing" || state.turn !== myIndex()) return;
        if (paused || helpOpen || cheatsOpen) return;
        submitAction({ type: "move", dir });
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-pause]")) { setPaused(); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        if (t.closest("[data-shuffle]")) { if (!helpOpen && !paused) submitAction({ type: "reshuffle" }); return; }
        if (t.closest("[data-restart]")) { if (!helpOpen && !paused) submitAction({ type: "restart" }); return; }
        if (t.closest("button[data-cheats]")) { toggleCheats(); return; }
        const dirBtn = t.closest("[data-dir]");
        if (dirBtn) { tryMove(dirBtn.dataset.dir); return; }
        const cheatBtn = t.closest("[data-cheat]");
        if (cheatBtn) {
            const kind = cheatBtn.dataset.cheat;
            if (kind === "hint") showHint();
            else if (!helpOpen && !paused) submitAction({ type: "cheat", kind });
            return;
        }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "cheats") { toggleCheats(); return; }
            if (a === "close-cheats") { toggleCheats(false); return; }
            if ((a === "restart" || a === "new" || a === "reshuffle") && !helpOpen && !paused) submitAction({ type: a });
            return;
        }
        // klik sel board (desktop): arah = sumbu dominan dari puck ke sel
        const cell = t.closest(".bp-cell");
        if (cell && grid.contains(cell) && state && state.status === "playing" && !paused && !helpOpen && !cheatsOpen) {
            const k = +cell.dataset.k, w = state.level.w;
            const dx = (k % w) - state.pucks[myIndex()].x;
            const dy = ((k / w) | 0) - state.pucks[myIndex()].y;
            if (!dx && !dy) return;
            tryMove(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        }
    }

    let pStart = null, swiped = false;
    const onPointerDown = (e) => { pStart = { x: e.clientX, y: e.clientY }; swiped = false; };
    const onPointerUp = (e) => {
        if (!pStart) return;
        const dx = e.clientX - pStart.x, dy = e.clientY - pStart.y;
        pStart = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
        swiped = true;
        tryMove(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    const onPointerCancel = () => { pStart = null; };
    const onBoardClickCapture = (e) => { if (swiped) { swiped = false; e.stopPropagation(); } };

    const KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
    const onKey = (e) => {
        if (!state) return;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        // Prioritas: help > cheats > pause/Escape > aksi game.
        if (key === "h") { toggleHelp(); e.preventDefault(); return; }
        if (key === "c") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (key === "p") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else setPaused();
            e.preventDefault(); return;
        }
        if (key === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            e.preventDefault(); return;
        }
        if (key === "r" || key === "n") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (!paused) submitAction({ type: key === "r" ? "restart" : "reshuffle" });
            e.preventDefault(); return;
        }
        const dir = KEYMAP[key];
        if (dir && !helpOpen && !cheatsOpen && !paused) { e.preventDefault(); tryMove(dir); }
    };

    root.addEventListener("click", handleClick);
    grid.addEventListener("pointerdown", onPointerDown);
    grid.addEventListener("pointerup", onPointerUp);
    grid.addEventListener("pointercancel", onPointerCancel);
    grid.addEventListener("click", onBoardClickCapture, true);
    document.addEventListener("keydown", onKey);

    /* ---------- init: online (host/guest) vs ai ---------- */
    const offs = [];
    const keep = (fn) => { if (typeof fn === "function") offs.push(fn); };

    if (online) {
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            // seat host diacak -> host bisa jadi P1 atau P2; giliran pertama diacak
            state = makeState(1, { host: Math.random() < 0.5 ? 0 : 1 }, randFirst());
            publish();
            keep(room.onAction((action) => applyAction(action, 1 - state.seats.host)));
        } else {
            keep(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        state = makeState(1, { host: 0 }, randFirst()); // vs bot: siapa duluan diacak
        publish();
    }

    return {
        destroy() {
            clearTimers();
            root.removeEventListener("click", handleClick);
            grid.removeEventListener("pointerdown", onPointerDown);
            grid.removeEventListener("pointerup", onPointerUp);
            grid.removeEventListener("pointercancel", onPointerCancel);
            grid.removeEventListener("click", onBoardClickCapture, true);
            document.removeEventListener("keydown", onKey);
            offs.forEach((fn) => { try { fn(); } catch (_) { } });
        },
    };
}