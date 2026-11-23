/* ==== GAME: number-merge.js ==== */
/*
  NUMBER MERGE - drop-merge tower, 5 kolom x 8 baris.
  Mengikuti template game baru: export META + export mount(root, context).
  1. Simpan file ini sebagai number-merge.js di folder games (id = nama file).
  2. Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "number-merge",
    name: "Number Merge",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Drop blocks, merge equal numbers from every side, and build the 2048 tile.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="15" y="37" width="18" height="8" rx="2"/><rect x="15" y="26" width="18" height="8" rx="2"/><path d="M24 22v-5"/><path d="M20.6 19.6 24 16.2l3.4 3.4"/><rect x="15" y="5" width="18" height="9" rx="2"/><text x="24" y="41" dy=".35em" font-size="6.5" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">2</text><text x="24" y="30" dy=".35em" font-size="6.5" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">2</text><text x="24" y="9.5" dy=".35em" font-size="7" font-weight="700" font-family="inherit" text-anchor="middle" fill="currentColor" stroke="none">4</text></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
    bestKey: "numberMergeBest",
};

/* ================= logika murni (tanpa DOM, bisa di-unit-test) ================= */
const COLS = 5, ROWS = 8;
const CELL = 56, GAP = 6, PX = 14, TOP = 78;
const VW = 332, VH = 582;
const LEVEL_TARGETS = [128, 256, 512, 1024, 2048];

const colX = (c) => PX + c * (CELL + GAP);
const rowY = (r) => TOP + (ROWS - 1 - r) * (CELL + GAP);

const COLORS = {
    2: "#eef2ff", 4: "#e0e7ff", 8: "#c7d2fe", 16: "#a5b4fc", 32: "#818cf8",
    64: "#6366f1", 128: "#4f46e5", 256: "#4338ca", 512: "#3730a3",
    1024: "#312e81", 2048: "#f59e0b",
};
const colorOf = (v) => COLORS[v] || "#0f172a";
const inkOf = (v) => (v <= 16 ? "#312e81" : "#ffffff");
const fsOf = (v) => (v < 100 ? 21 : v < 1000 ? 17 : v < 10000 ? 14 : 12);

/* PRNG mulberry32 dengan state eksternal (serializable utk Firebase). */
function stepRng(seed) {
    const a = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { r: ((t ^ (t >>> 14)) >>> 0) / 4294967296, s: a };
}
function spawnFrom(r) { return r < 0.55 ? 2 : r < 0.85 ? 4 : r < 0.97 ? 8 : 16; }

/* Board: array 5 kolom x 8 baris, baris 0 = paling bawah, 0 = kosong.
   (0 dipakai, bukan null, agar aman saat disimpan ke Firebase.) */
function emptyBoard() {
    const b = [];
    for (let c = 0; c < COLS; c++) b.push(new Array(ROWS).fill(0));
    return b;
}
function height(b, c) { let h = 0; while (h < ROWS && b[c][h] !== 0) h++; return h; }
function maxTile(b) { let m = 0; for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (b[c][r] > m) m = b[c][r]; return m; }
function allFull(b) { for (let c = 0; c < COLS; c++) if (height(b, c) < ROWS) return false; return true; }

/* Flood-fill 4 arah: semua balok bernilai sama yang tersambung. */
function groupAt(b, c, r) {
    const v = b[c][r];
    if (!v) return [];
    const seen = new Set([c + "," + r]);
    const stack = [[c, r]];
    const out = [[c, r]];
    while (stack.length) {
        const cur = stack.pop();
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const d of dirs) {
            const nx = cur[0] + d[0], ny = cur[1] + d[1], k = nx + "," + ny;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(k)) continue;
            if (b[nx][ny] === v) { seen.add(k); out.push([nx, ny]); stack.push([nx, ny]); }
        }
    }
    return out;
}
function compactBoard(b) {
    for (let c = 0; c < COLS; c++) {
        const vals = [];
        for (let r = 0; r < ROWS; r++) if (b[c][r] !== 0) vals.push(b[c][r]);
        for (let r = 0; r < ROWS; r++) b[c][r] = r < vals.length ? vals[r] : 0;
    }
}

/* Jatuhkan v ke kolom c. Balok baru bergabung dengan SEMUA balok sama
   yang tersambung (atas/bawah/kiri/kanan): tiap balok sama menggandakan
   nilai (n balok -> v * 2^(n-1)). Hasil merge jatuh ke sel terendah,
   gravity diterapkan, lalu cascade dicek lagi di posisi balok hasil. */
function resolveDrop(board, c, v) {
    const b = board.map((col) => col.slice());
    const L = height(b, c);
    if (L >= ROWS) return { board: b, overflow: true, gained: 0, chain: 0, landing: L, merges: [], final: null };
    b[c][L] = v;
    let pc = c, pr = L, gained = 0, chain = 0;
    const merges = [];
    for (let guard = 0; guard < 40; guard++) {
        const g = groupAt(b, pc, pr);
        if (g.length < 2) break;
        const nv = b[pc][pr] * Math.pow(2, g.length - 1);
        let tc = g[0][0], tr = g[0][1];
        for (const cell of g) {
            if (cell[1] < tr || (cell[1] === tr && Math.abs(cell[0] - pc) < Math.abs(tc - pc))) { tc = cell[0]; tr = cell[1]; }
        }
        for (const cell of g) b[cell[0]][cell[1]] = 0;
        b[tc][tr] = nv;
        gained += nv; chain++;
        merges.push({ c: tc, r: tr, v: nv, n: g.length });
        let below = 0;
        for (let y = 0; y < tr; y++) if (b[tc][y] !== 0) below++;
        compactBoard(b);
        pc = tc; pr = below;
    }
    return { board: b, overflow: false, gained, chain, landing: L, merges, final: { c: pc, r: pr } };
}

/* Heuristik utk bot, hint, dan generator level. */
function evalMove(b, c, v, target) {
    if (height(b, c) >= ROWS) return null;
    const res = resolveDrop(b, c, v);
    const hs = [];
    for (let i = 0; i < COLS; i++) hs.push(height(res.board, i));
    let mx = 0, sum = 0, smooth = 0;
    for (let i = 0; i < COLS; i++) {
        mx = Math.max(mx, hs[i]); sum += hs[i];
        if (i) smooth += Math.abs(hs[i] - hs[i - 1]);
    }
    let score = res.gained * 6 - mx * 8 - sum * 1.2 - smooth * 1.5 - Math.abs(c - 2) * 0.3;
    if (allFull(res.board)) score -= 2000;
    if (maxTile(res.board) >= target) score += 100000;
    return { c, score, res };
}
function bestMove(b, v, target) {
    let best = null;
    for (let c = 0; c < COLS; c++) {
        const e = evalMove(b, c, v, target);
        if (e && (!best || e.score > best.score)) best = e;
    }
    return best;
}
function botPick(b, v, target) {
    const opts = [];
    for (let c = 0; c < COLS; c++) { const e = evalMove(b, c, v, target); if (e) opts.push(e); }
    if (!opts.length) return 0;
    if (Math.random() < 0.12) return opts[(Math.random() * opts.length) | 0].c;
    let best = opts[0];
    for (const o of opts) if (o.score > best.score) best = o;
    return best.c;
}
function hashBoard(b) {
    let h = 5381;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) h = (Math.imul(h, 33) ^ b[c][r]) >>> 0;
    return h;
}

/* ---- Generator level acak yang DIJAMIN bisa diselesaikan ----
   Simulasikan permainan greedy dari papan kosong dengan seed tertentu
   sampai target tercapai; rekam semua drop sebagai "witness solution".
   Level = papan setelah sebagian witness dijalankan; sisa witness +
   antrean spawn deterministik membuktikan level pasti bisa diselesaikan. */
function simLevel(seed, target) {
    let rs = seed | 0;
    let b = emptyBoard();
    const steps = [];
    for (let m = 0; m < 650; m++) {
        const s1 = stepRng(rs); rs = s1.s;
        const v = spawnFrom(s1.r);
        const opts = [];
        for (let c = 0; c < COLS; c++) { const e = evalMove(b, c, v, target); if (e) opts.push(e); }
        if (!opts.length) return null;
        const s2 = stepRng(rs); rs = s2.s;
        let pick;
        if (s2.r < 0.9) { pick = opts[0]; for (const o of opts) if (o.score > pick.score) pick = o; }
        else { const s3 = stepRng(rs); rs = s3.s; pick = opts[Math.floor(s3.r * opts.length) % opts.length]; }
        steps.push({ c: pick.c, v, h: hashBoard(b) });
        b = pick.res.board;
        if (maxTile(b) >= target) return steps;
    }
    return null;
}
function buildLevel(steps, cut, target) {
    let b = emptyBoard();
    for (let i = 0; i < cut; i++) b = resolveDrop(b, steps[i].c, steps[i].v).board;
    const witness = steps.slice(cut);
    const queue = [witness[0].v, witness.length > 1 ? witness[1].v : 2];
    return { board: b, witness, queue, spawnPtr: 2, target };
}
/* Fallback deterministik (selalu solvable): 8 -> 16 -> 32 -> 64 -> 128. */
function ladderSteps() {
    const raw = [[2, 8], [2, 16], [2, 32], [2, 64]];
    let b = emptyBoard();
    const out = [];
    for (const s of raw) { out.push({ c: s[0], v: s[1], h: hashBoard(b) }); b = resolveDrop(b, s[0], s[1]).board; }
    return out;
}
function genLevel(seed, level) {
    const want = Math.min(level - 1, LEVEL_TARGETS.length - 1);
    for (let ti = want; ti >= 0; ti--) {
        const tries = ti === want ? 24 : 10;
        for (let k = 0; k < tries; k++) {
            const steps = simLevel((seed + k * 7919 + ti * 104729) >>> 0, LEVEL_TARGETS[ti]);
            if (steps) {
                const frac = Math.min(0.5, Math.max(0.12, 0.5 - level * 0.04));
                const cut = Math.min(steps.length - 1, Math.floor(steps.length * frac));
                return buildLevel(steps, cut, LEVEL_TARGETS[ti]);
            }
        }
    }
    return buildLevel(ladderSteps(), 0, 128);
}

/* ================= mount (template game baru) ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = (room && room.room) || null;
    let state = null;
    let overlay = online ? "wait" : "start";
    let aim = 2, eraseMode = false, hoverCell = null, hintCol = -1;
    let seenMove = -1, prevStatus = "", mounted = true;
    let storedBest = 0;
    try { storedBest = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }
    const timers = [], offs = [];
    let botTimer = 0, toastTimer = 0, holdTimer = 0, holdIval = 0;

    const cancel = (t) => { clearTimeout(t); const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
    const later = (fn, ms) => {
        const t = setTimeout(() => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); if (mounted) fn(); }, ms);
        timers.push(t); return t;
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; botTimer = 0; toastTimer = 0; };
    const clearBot = () => { if (botTimer) { cancel(botTimer); botTimer = 0; } };

    /* ---------- shell + gaya minimal (scoped .nm-game) ---------- */
    root.innerHTML = `
<div class="game-app nm-game">
<style>
.nm-game{--nm-bg:#f8fafc;--nm-card:#fff;--nm-line:#e2e8f0;--nm-ink:#0f172a;--nm-mut:#64748b;--nm-acc:#4f46e5;--nm-accsoft:#eef2ff;--nm-p2:#d97706;--nm-bad:#dc2626;--nm-ok:#059669;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--nm-ink)}
.nm-game *{box-sizing:border-box}
.nm-game .nm-shell{max-width:clamp(300px,calc((100vh - 240px) * 0.5704),420px);margin:0 auto;display:flex;flex-direction:column;gap:10px}
.nm-game .nm-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nm-game .nm-chips{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0}
.nm-game .nm-chip{display:inline-flex;align-items:center;gap:6px;background:var(--nm-card);border:1px solid var(--nm-line);border-radius:999px;padding:5px 10px;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--nm-mut);white-space:nowrap}
.nm-game .nm-chip b{font-size:13px;color:var(--nm-ink);font-variant-numeric:tabular-nums;letter-spacing:0}
.nm-game .nm-chip .nm-dot{width:8px;height:8px;border-radius:50%;background:var(--nm-acc);flex:none}
.nm-game .nm-chip.p2 .nm-dot{background:var(--nm-p2)}
.nm-game .nm-chip.on{border-color:var(--nm-acc);box-shadow:0 0 0 2px var(--nm-accsoft);color:var(--nm-ink)}
.nm-game .nm-chip.p2.on{border-color:var(--nm-p2);box-shadow:0 0 0 2px #fef3c7}
.nm-game .nm-nextval{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 4px;border-radius:6px;font-size:12px;font-weight:700}
.nm-game .nm-tools{display:flex;gap:6px}
.nm-game .nm-ico{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;background:var(--nm-card);border:1px solid var(--nm-line);border-radius:10px;color:var(--nm-mut);cursor:pointer;padding:0}
.nm-game .nm-ico:hover{color:var(--nm-ink);border-color:#cbd5e1}
.nm-game .nm-ico:disabled{opacity:.4;cursor:default}
.nm-game .nm-boardbox{position:relative;background:var(--nm-card);border:1px solid var(--nm-line);border-radius:18px;padding:6px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
.nm-game .nm-svg{display:block;width:100%;height:auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.nm-game.nm-erase .nm-svg{cursor:crosshair}
.nm-game .nm-colbg{fill:#f8fafc;stroke:#eef2f7;stroke-width:1}
.nm-game .nm-colbg.aim{fill:var(--nm-accsoft);stroke:#c7d2fe}
.nm-game .nm-colbg.warn{fill:#fffbeb;stroke:#fde68a}
.nm-game .nm-colbg.full{fill:#fef2f2;stroke:#fecaca}
.nm-game .nm-colbg.hint{stroke:var(--nm-acc);stroke-width:2}
.nm-game .nm-guide{stroke:#c7d2fe;stroke-width:2;stroke-dasharray:4 7;stroke-linecap:round}
.nm-game .nm-tile text{font-family:inherit;font-weight:700;text-anchor:middle;pointer-events:none}
.nm-game .nm-spawn.dim{opacity:.45}
.nm-game .nm-danger{animation:nmBlink .5s ease-in-out infinite}
.nm-game .nm-ghost rect{fill-opacity:.3;stroke:var(--nm-acc);stroke-width:1.5;stroke-dasharray:5 4}
.nm-game .nm-ghost text{fill:var(--nm-acc);font-family:inherit;font-weight:700;text-anchor:middle}
.nm-game .nm-ghost.bad rect{stroke:var(--nm-bad);fill:#fecaca}
.nm-game .nm-ghost.bad text{fill:var(--nm-bad)}
.nm-game .nm-erasehl{fill:none;stroke:var(--nm-bad);stroke-width:2;stroke-dasharray:4 3}
.nm-game .nm-fall{transform:translateY(var(--dy));animation:nmFall .22s cubic-bezier(.5,0,.9,.6) forwards}
@keyframes nmFall{from{transform:translateY(var(--dy))}to{transform:translateY(0)}}
.nm-game .nm-pop{transform-box:fill-box;transform-origin:center;animation:nmPop .3s ease-out}
@keyframes nmPop{0%{transform:scale(.5)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes nmBlink{50%{opacity:.35}}
.nm-game .nm-pad{display:flex;gap:8px}
.nm-game .nm-btn{appearance:none;border:1px solid var(--nm-line);background:var(--nm-card);color:var(--nm-ink);border-radius:12px;font:inherit;font-size:13px;font-weight:600;padding:10px 14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.nm-game .nm-btn:hover{border-color:#cbd5e1;background:#f8fafc}
.nm-game .nm-btn:disabled{opacity:.45;cursor:default}
.nm-game .nm-btn.primary{background:var(--nm-acc);border-color:var(--nm-acc);color:#fff}
.nm-game .nm-btn.primary:hover{background:#4338ca}
.nm-game .nm-btn.block{width:100%}
.nm-game .nm-pad .nm-btn{flex:1;min-height:46px}
.nm-game .nm-pad .drop{flex:1.6}
.nm-game .nm-cols{display:flex;gap:6px}
.nm-game .nm-cols .nm-btn{flex:1;min-height:40px;padding:8px 0;font-variant-numeric:tabular-nums}
.nm-game .nm-keys{margin:0;font-size:11px;color:var(--nm-mut);text-align:center;line-height:1.7}
@media (pointer:coarse){.nm-game .nm-keys{display:none}}
.nm-game .nm-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(248,250,252,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:18px}
.nm-game .nm-ov[hidden]{display:none}
.nm-game .nm-card{background:var(--nm-card);border:1px solid var(--nm-line);border-radius:16px;box-shadow:0 16px 40px rgba(15,23,42,.12);padding:18px;width:100%;max-width:330px;max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:10px}
.nm-game .nm-card h3{margin:0;font-size:17px}
.nm-game .nm-card .sub{margin:0;font-size:12.5px;color:var(--nm-mut);line-height:1.55}
.nm-game .nm-card .rows{display:flex;flex-direction:column;gap:8px}
.nm-game .nm-mode{flex-direction:column;align-items:flex-start;gap:2px;padding:11px 14px}
.nm-game .nm-mode small{display:block;font-weight:400;color:var(--nm-mut);font-size:11px;margin-top:2px;text-align:left}
.nm-game .nm-win{color:var(--nm-ok)}
.nm-game .nm-lose{color:var(--nm-bad)}
.nm-game .nm-howto h4{margin:2px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--nm-mut)}
.nm-game .nm-howto ul{margin:0;padding-left:16px;font-size:12.5px;color:#334155;line-height:1.6;display:flex;flex-direction:column;gap:4px}
.nm-game .nm-howto b{color:var(--nm-ink)}
.nm-game .nm-kbd{display:inline-block;border:1px solid var(--nm-line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;background:#f8fafc;font-family:inherit}
.nm-game .nm-cheatgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.nm-game .nm-cheatgrid .nm-btn{padding:8px 0;font-size:12px}
.nm-game .nm-note{font-size:11px;color:var(--nm-mut);margin:0;line-height:1.5}
.nm-game .nm-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--nm-p2);background:#fffbeb;border:1px solid #fde68a;border-radius:999px;padding:2px 8px;text-transform:uppercase;letter-spacing:.05em}
.nm-game .nm-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:7;background:var(--nm-ink);color:#fff;font-size:12px;font-weight:600;border-radius:999px;padding:7px 14px;box-shadow:0 8px 20px rgba(15,23,42,.25);white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.nm-game .nm-toast[hidden]{display:none}
.nm-game .nm-scoreline{font-size:13px;font-weight:600;margin:0}
</style>
<div class="game-intro">
  <div><h2>Number Merge</h2><p>Drop blocks into the tower. Equal numbers connect from all four sides and merge, doubling once per matching block. Build the 2048 tile.</p></div>
  <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
</div>
<section class="game-panel" data-board>
  <div class="nm-shell">
    <div class="nm-hud">
      <div class="nm-chips" data-chips></div>
      <div class="nm-tools">
        <button class="nm-ico" type="button" data-act="menu" aria-label="Game modes" title="Game modes"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg></button>
        <button class="nm-ico" type="button" data-act="help" aria-label="How to play" title="How to play"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 0 1 5.3.7c0 1.8-2.7 2.3-2.7 3.6"/><path d="M12 17h.01"/></svg></button>
        <button class="nm-ico" type="button" data-act="cheats" aria-label="Cheats" title="Cheats"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 17 7"/><path d="M15 5l1.2-2.4L17.4 5l2.4 1.2-2.4 1.2-1.2 2.4-1.2-2.4L12.6 6.2z"/><path d="M19 13l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7z"/></svg></button>
        <button class="nm-ico" type="button" data-act="restart" aria-label="Restart" title="Restart"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button>
      </div>
    </div>
    <div class="nm-boardbox">
      <svg class="nm-svg" data-svg viewBox="0 0 332 582" role="img" aria-label="Number Merge tower">
        <g data-g="cols"></g><g data-g="tiles"></g><g data-g="fx"></g>
      </svg>
      <div class="nm-ov" data-ov hidden><div class="nm-card" data-card role="dialog" aria-modal="true"></div></div>
      <div class="nm-toast" data-toast hidden aria-live="polite"></div>
    </div>
    <div class="nm-pad">
      <button class="nm-btn" type="button" data-act="pad-left" aria-label="Aim left"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
      <button class="nm-btn primary drop" type="button" data-act="drop"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>Drop</button>
      <button class="nm-btn" type="button" data-act="pad-right" aria-label="Aim right"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
    </div>
    <div class="nm-cols">
      <button class="nm-btn" type="button" data-act="col" data-c="0">1</button>
      <button class="nm-btn" type="button" data-act="col" data-c="1">2</button>
      <button class="nm-btn" type="button" data-act="col" data-c="2">3</button>
      <button class="nm-btn" type="button" data-act="col" data-c="3">4</button>
      <button class="nm-btn" type="button" data-act="col" data-c="4">5</button>
    </div>
    <p class="nm-keys">Hover to aim, click to drop, scroll to switch column<br>
      <span class="nm-kbd">&#8592;</span> <span class="nm-kbd">&#8594;</span> aim &middot; <span class="nm-kbd">Space</span> drop &middot; <span class="nm-kbd">1&ndash;5</span> column &middot; <span class="nm-kbd">H</span> hint &middot; <span class="nm-kbd">U</span> undo &middot; <span class="nm-kbd">R</span> restart</p>
  </div>
</section>
<div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- referensi DOM ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const gameEl = $(".nm-game") || root;
    const svg = $("[data-svg]");
    const gCols = $('[data-g="cols"]'), gTiles = $('[data-g="tiles"]'), gFx = $('[data-g="fx"]');
    const chipsEl = $("[data-chips]"), statusEl = $("[data-status]");
    const ovEl = $("[data-ov]"), cardEl = $("[data-card]"), toastEl = $("[data-toast]");
    const toolMenu = $('[data-act="menu"]'), toolCheats = $('[data-act="cheats"]'), toolRestart = $('[data-act="restart"]');
    const padBtns = root.querySelectorAll('[data-act="pad-left"],[data-act="pad-right"],[data-act="drop"],[data-act="col"]');

    /* ---------- util kecil ---------- */
    const versus = () => Boolean(state) && (state.mode === "bot" || state.mode === "online");
    const mySeat = () => (online && state ? (room.isHost ? state.hostSeat : 1 - state.hostSeat) : 0);
    const canMove = () => Boolean(state) && state.status === "playing" && !overlay && (!versus() || state.turn === mySeat());
    function names() {
        if (!state) return ["Player 1", "Player 2"];
        if (state.mode === "bot") return ["You", "Bot"];
        if (state.mode === "online") return ["Player 1", "Player 2"];
        return ["You", ""];
    }
    function toast(msg) {
        if (toastTimer) { cancel(toastTimer); toastTimer = 0; }
        toastEl.textContent = msg;
        toastEl.hidden = false;
        toastTimer = later(() => { toastEl.hidden = true; toastTimer = 0; }, 1900);
    }

    /* ---------- state (serializable, host = otoritas) ---------- */
    function drawSpawn(st) {
        if (st.mode === "level" && st.spawnPtr < st.witness.length) {
            const v = st.witness[st.spawnPtr].v; st.spawnPtr++; return v;
        }
        const s = stepRng(st.rng); st.rng = s.s; return spawnFrom(s.r);
    }
    function resetMatch(st) {
        st.scores = [0, 0]; st.moves = 0; st.outcome = ""; st.winner = null;
        st.cheated = false; st.history = []; st.lastMove = null; st.status = "playing";
        const isVs = st.mode === "bot" || st.mode === "online";
        st.first = isVs ? (Math.random() < 0.5 ? 0 : 1) : 0;  /* coin flip: siapa jalan duluan */
        st.turn = st.first;
        st.rng = (Math.random() * 0x7fffffff) | 0;
        if (st.mode === "level") {
            st.board = emptyBoard(); st.witness = []; st.spawnPtr = 0; st.queue = [2, 2];
            st.status = "generating"; return;
        }
        st.board = emptyBoard(); st.witness = []; st.spawnPtr = 0; st.target = 2048;
        st.queue = [drawSpawn(st), drawSpawn(st)];
        st.best = Math.max(st.queue[0], st.queue[1]);
    }
    function freshSession(m) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const st = {
            v: 1, mode: m, level: 1, seed, target: 2048, board: emptyBoard(),
            queue: [2, 2], rng: seed, spawnPtr: 0, witness: [],
            turn: 0, first: 0, hostSeat: 0, scores: [0, 0], status: "playing",
            outcome: "", winner: null, best: 2, moves: 0, cheated: false,
            history: [], lastMove: null,
        };
        /* posisi kursi pemain diacak saat sesi multiplayer dibuat */
        if (m === "online") st.hostSeat = Math.random() < 0.5 ? 0 : 1;
        resetMatch(st);
        return st;
    }
    function applyLevelGen(st) {
        const g = genLevel((st.seed + st.level * 7919) >>> 0, st.level);
        st.board = g.board; st.witness = g.witness; st.queue = g.queue.slice();
        st.spawnPtr = g.spawnPtr; st.target = g.target;
        st.rng = (st.seed ^ Math.imul(st.level, 2654435761)) >>> 0;
        st.status = "playing";
        st.best = Math.max(maxTile(st.board), st.queue[0], st.queue[1]);
    }
    function ensureLevelLoaded() {
        if (state && state.status === "generating") {
            const st = state;
            overlay = "wait"; renderOverlay();
            later(() => {
                if (state !== st || st.status !== "generating") return;
                applyLevelGen(st); overlay = null; publish();
            }, 30);
        }
    }
    function pushHistory() {
        if (online || !state) return;
        state.history.push({
            board: state.board.map((col) => col.slice()), queue: state.queue.slice(),
            rng: state.rng, spawnPtr: state.spawnPtr, scores: state.scores.slice(),
            turn: state.turn, best: state.best, moves: state.moves,
        });
        if (state.history.length > 12) state.history.shift();
    }
    function persistBest() {
        if (!online && state && state.mode === "solo" && !state.cheated && state.scores[0] > storedBest) {
            storedBest = state.scores[0];
            try { localStorage.setItem(META.bestKey, String(storedBest)); } catch (e) { }
        }
    }
    function announceStart() {
        if (!state) return;
        if (state.mode === "bot") toast(state.first === 0 ? "Coin flip: you go first!" : "Coin flip: Bot goes first");
        else if (state.mode === "online") toast("You are " + names()[mySeat()] + (state.first === mySeat() ? " - you start" : " - " + names()[1 - mySeat()] + " starts"));
    }
    function publish() {
        renderAll();
        if (online && room.isHost && state) room.publishState(state).catch(console.warn);
    }
    function scheduleBot() {
        clearBot();
        if (state && state.mode === "bot" && state.status === "playing" && state.turn === 1) {
            botTimer = later(() => {
                botTimer = 0;
                if (!state || state.mode !== "bot" || state.status !== "playing" || state.turn !== 1) return;
                const c = botPick(state.board, state.queue[0], state.target);
                applyAction({ type: "drop", c }, 1);
            }, 700 + Math.random() * 600);
        }
    }
    function hintSuggest() {
        if (state.mode === "level") {
            const h = hashBoard(state.board);
            for (const s of state.witness) if (s.h === h && s.v === state.queue[0]) return s.c;
        }
        const m = bestMove(state.board, state.queue[0], state.target);
        return m ? m.c : aim;
    }

    /* ---------- rendering ---------- */
    const chip = (label, val) => '<span class="nm-chip">' + label + " <b>" + val + "</b></span>";
    function renderHud() {
        let html = "";
        if (!state) {
            html = chip("Score", 0) + chip("Best", storedBest);
        } else if (versus()) {
            const nm = names();
            for (let s = 0; s < 2; s++) {
                const on = state.status === "playing" && state.turn === s;
                let label = nm[s];
                if (online && s === mySeat()) label = (playerName && playerName !== "Player" ? playerName : nm[s]) + " (you)";
                html += '<span class="nm-chip' + (s ? " p2" : "") + (on ? " on" : "") + '"><i class="nm-dot"></i>' + label + " <b>" + state.scores[s] + "</b></span>";
            }
        } else {
            html += chip("Score", state.scores[0]);
            html += state.mode === "level" ? chip("Goal", state.target) : chip("Best", Math.max(storedBest, state.scores[0]));
        }
        if (state) html += '<span class="nm-chip">Next <b class="nm-nextval" style="background:' + colorOf(state.queue[1]) + ";color:" + inkOf(state.queue[1]) + '">' + state.queue[1] + "</b></span>";
        if (state && state.cheated) html += '<span class="nm-badge">cheats</span>';
        chipsEl.innerHTML = html;
        toolMenu.hidden = online;
        toolCheats.hidden = online;
        toolRestart.disabled = !state;
    }
    function overTitle() {
        if (!state) return "Game over";
        if (versus()) return state.winner === mySeat() ? "You win!" : "You lose";
        if (state.outcome === "target") return state.mode === "level" ? "Level clear!" : "You win!";
        return "Game over";
    }
    function overReason() {
        const nm = names();
        if (state.outcome === "target") return (versus() ? nm[state.winner] + " built" : "You built") + " the " + state.target + " tile.";
        if (state.outcome === "overflow") return "A block overflowed above the top row." + (versus() ? " " + nm[1 - state.winner] + " loses." : "");
        return "The tower is completely full." + (versus() ? " " + nm[1 - state.winner] + " loses." : "");
    }
    function renderStatus() {
        let t = "Ready";
        if (!state) t = online ? "Waiting for host" : "Pick a mode";
        else if (state.status === "generating") t = "Generating level";
        else if (state.status === "over") t = overTitle();
        else if (versus()) t = state.turn === mySeat() ? "Your turn" : (state.mode === "bot" ? "Bot is thinking" : "Waiting for " + names()[1 - mySeat()]);
        else if (state.mode === "level") t = "Level " + state.level + " - build " + state.target;
        else t = "Build the " + state.target + " tile";
        if (eraseMode) t = "Erase: tap a block (Esc to cancel)";
        statusEl.textContent = t;
    }
    function renderBoard(animate) {
        gCols.innerHTML = ""; gTiles.innerHTML = ""; gFx.innerHTML = "";
        const b = state ? state.board : emptyBoard();
        const playing = Boolean(state) && state.status === "playing";
        const mine = canMove();
        const lm = animate && state ? state.lastMove : null;
        for (let c = 0; c < COLS; c++) {
            const h = height(b, c);
            let cls = "nm-colbg";
            if (h >= ROWS) cls += " full";
            else if (h >= ROWS - 1) cls += " warn";
            else if (playing && mine && c === aim && !eraseMode) cls += " aim";
            if (c === hintCol) cls += " hint";
            mk("rect", { x: colX(c) - 3, y: TOP - 3, width: CELL + 6, height: ROWS * CELL + (ROWS - 1) * GAP + 6, rx: 10, class: cls }, gCols);
        }
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const v = b[c][r];
                if (!v) continue;
                let cls = "nm-tile", style = null;
                if (lm && !lm.overflow) {
                    if (lm.merges && lm.merges.length) {
                        const m = lm.merges[lm.merges.length - 1];
                        if (m.c === c && m.r === r) cls += " nm-pop";
                    } else if (lm.c === c && lm.r === r) {
                        cls += " nm-fall"; style = "--dy:" + (12 - rowY(r)) + "px";
                    }
                }
                const g = mk("g", { class: cls }, gTiles);
                if (style) g.setAttribute("style", style);
                mk("rect", { x: colX(c), y: rowY(r), width: CELL, height: CELL, rx: 10, fill: colorOf(v) }, g);
                const t = mk("text", { x: colX(c) + CELL / 2, y: rowY(r) + CELL / 2, dy: ".35em", "font-size": fsOf(v), fill: inkOf(v) }, g);
                t.textContent = v;
            }
        }
        if (playing) {
            const full = height(b, aim) >= ROWS;
            if (mine && !eraseMode) {
                mk("line", { x1: colX(aim) + CELL / 2, y1: 64, x2: colX(aim) + CELL / 2, y2: TOP + ROWS * CELL + (ROWS - 1) * GAP - 2, class: "nm-guide" }, gFx);
            }
            const sg = mk("g", { class: "nm-tile nm-spawn" + (versus() && !mine ? " dim" : "") + (full && mine ? " nm-danger" : "") }, gFx);
            mk("rect", { x: colX(aim) + 5, y: 12, width: CELL - 10, height: CELL - 10, rx: 9, fill: colorOf(state.queue[0]) }, sg);
            const st = mk("text", { x: colX(aim) + CELL / 2, y: 12 + (CELL - 10) / 2, dy: ".35em", "font-size": fsOf(state.queue[0]), fill: inkOf(state.queue[0]) }, sg);
            st.textContent = state.queue[0];
            if (mine && !eraseMode && !full) {
                const res = resolveDrop(b, aim, state.queue[0]);
                const pv = res.merges.length ? res.merges[0].v : state.queue[0];
                const gg = mk("g", { class: "nm-ghost" }, gFx);
                mk("rect", { x: colX(aim) + 3, y: rowY(res.landing) + 3, width: CELL - 6, height: CELL - 6, rx: 8, fill: colorOf(pv) }, gg);
                const gt = mk("text", { x: colX(aim) + CELL / 2, y: rowY(res.landing) + CELL / 2, dy: ".35em", "font-size": fsOf(pv) }, gg);
                gt.textContent = pv;
            }
        }
        if (state && state.status === "over" && state.outcome === "overflow" && state.lastMove) {
            const c = state.lastMove.c, v = state.lastMove.v;
            const gg = mk("g", { class: "nm-ghost bad nm-danger" }, gFx);
            mk("rect", { x: colX(c) + 5, y: 12, width: CELL - 10, height: CELL - 10, rx: 9, fill: colorOf(v) }, gg);
            const gt = mk("text", { x: colX(c) + CELL / 2, y: 12 + (CELL - 10) / 2, dy: ".35em", "font-size": fsOf(v) }, gg);
            gt.textContent = v;
        }
        if (eraseMode && hoverCell && b[hoverCell.c][hoverCell.r]) {
            mk("rect", { x: colX(hoverCell.c) - 2, y: rowY(hoverCell.r) - 2, width: CELL + 4, height: CELL + 4, rx: 11, class: "nm-erasehl" }, gFx);
        }
        if (lm && lm.gained > 0) toast("+" + lm.gained + (lm.chain > 1 ? " - chain x" + lm.chain : ""));
    }
    function updateControls() {
        const ok = canMove() && !eraseMode;
        padBtns.forEach((b) => { b.disabled = !ok; });
    }
    const ob = (act, label, primary) => '<button class="nm-btn block' + (primary ? " primary" : "") + '" type="button" data-act="' + act + '">' + label + "</button>";
    function cardHtml(type) {
        if (type === "start") {
            return '<h3>Number Merge</h3><p class="sub">Merge equal numbers from every side. Pick a mode to play.</p><div class="rows">'
                + '<button class="nm-btn block nm-mode" type="button" data-act="start-level">Solo &middot; Levels<small>Random generated puzzles, always solvable. Reach each goal.</small></button>'
                + '<button class="nm-btn block nm-mode" type="button" data-act="start-solo">Solo &middot; Endless<small>Classic random drops. Chase 2048 and a high score.</small></button>'
                + '<button class="nm-btn block nm-mode" type="button" data-act="start-bot">VS Bot<small>Shared tower, alternating turns. A coin flip decides who starts.</small></button>'
                + ob("help", "How to play") + "</div>";
        }
        if (type === "wait") {
            const hostName = roomData && roomData.players && roomData.players[0] && roomData.players[0].name;
            const title = online ? "Waiting for host" : "Generating level";
            const sub = online
                ? (hostName ? hostName + " is setting up the match." : "The host is setting up the match. Seats and the first turn are randomized.")
                : "Building a random puzzle from a real solution, so it is guaranteed to be solvable.";
            return "<h3>" + title + '</h3><p class="sub">' + sub + "</p>";
        }
        if (type === "howto") {
            return '<h3>How to play</h3>'
                + '<svg viewBox="0 0 216 78" width="100%" aria-hidden="true"><rect x="4" y="42" width="32" height="32" rx="7" fill="#eef2ff"/><text x="20" y="58" dy=".35em" font-size="15" font-weight="700" fill="#312e81" text-anchor="middle">2</text><rect x="40" y="42" width="32" height="32" rx="7" fill="#eef2ff"/><text x="56" y="58" dy=".35em" font-size="15" font-weight="700" fill="#312e81" text-anchor="middle">2</text><rect x="40" y="4" width="32" height="32" rx="7" fill="none" stroke="#4f46e5" stroke-width="1.5" stroke-dasharray="4 3"/><text x="56" y="20" dy=".35em" font-size="15" font-weight="700" fill="#4f46e5" text-anchor="middle">2</text><path d="M84 58h26m0 0-6-6m6 6-6 6" stroke="#94a3b8" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="124" y="38" width="40" height="40" rx="9" fill="#c7d2fe"/><text x="144" y="58" dy=".35em" font-size="18" font-weight="700" fill="#312e81" text-anchor="middle">8</text><text x="192" y="58" dy=".35em" font-size="10" fill="#64748b" text-anchor="middle">2&#215;2&#215;2</text></svg>'
                + '<h4>Goal</h4><ul><li>Build the <b>2048</b> tile (level mode has its own goal).</li></ul>'
                + '<h4>Drop &amp; merge</h4><ul><li>Drop the current block into any column; it lands on top of the stack.</li><li>The new block joins <b>all connected equal blocks</b> - up, down, left and right. Every matching block doubles the value: two 2s make 4, three 2s make 8, four 2s make 16.</li><li>The merged block falls, and if it touches a new twin it merges again: <b>chain bonus</b>.</li><li>Blocks that already touch only merge when a new block joins their group.</li></ul>'
                + '<h4>Losing</h4><ul><li>Dropping into a <b>full column</b> overflows and ends the game. Filling the whole tower also ends it. In versus, whoever causes it loses.</li></ul>'
                + '<h4>Versus</h4><ul><li>One shared tower and queue, alternating turns. Merge points go to the player who dropped. A <b>coin flip</b> picks who starts; online seats are randomized too.</li></ul>'
                + '<h4>Controls</h4><ul><li>Desktop: hover to aim, click to drop, scroll to switch column. <span class="nm-kbd">&#8592;</span> <span class="nm-kbd">&#8594;</span> aim, <span class="nm-kbd">Space</span> drop, <span class="nm-kbd">1&ndash;5</span> pick column, <span class="nm-kbd">H</span> hint, <span class="nm-kbd">U</span> undo, <span class="nm-kbd">E</span> erase, <span class="nm-kbd">C</span> cheats, <span class="nm-kbd">R</span> restart.</li><li>Mobile: tap a column, or use the arrow / Drop pad and the 1&ndash;5 buttons.</li></ul>'
                + '<div class="rows">' + ob("close-ov", "Got it", true) + "</div>";
        }
        if (type === "cheats") {
            const vals = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
            const noHist = state && state.history.length ? "" : " disabled";
            return '<h3>Cheats</h3><p class="sub">Casual helpers for offline play. Using one marks the run and disables best-score saving.</p><div class="rows">'
                + '<button class="nm-btn block" type="button" data-act="cheat-undo"' + noHist + ">Undo last move (U)</button>"
                + ob("cheat-hint", "Hint: best column (H)")
                + ob("cheat-erase", "Erase a block (E), then tap it")
                + '</div><h4 class="nm-note">Set the next block</h4><div class="nm-cheatgrid">'
                + vals.map((v) => '<button class="nm-btn" type="button" data-act="cheat-next" data-v="' + v + '">' + v + "</button>").join("")
                + '</div><div class="rows">' + ob("close-ov", "Close", true) + "</div>";
        }
        if (type === "over") {
            const win = versus() ? state.winner === mySeat() : state.outcome === "target";
            const nm = names();
            const scoreline = versus()
                ? nm[0] + " " + state.scores[0] + " &middot; " + nm[1] + " " + state.scores[1]
                : "Score " + state.scores[0] + " &middot; Best tile " + state.best;
            let rows = "";
            if (state.mode === "level") {
                if (state.outcome === "target") rows += ob("next-level", "Next level", true);
                rows += ob("retry", state.outcome === "target" ? "Replay level" : "Retry level", state.outcome !== "target");
                if (state.outcome !== "target") rows += ob("new-level", "New random level");
                rows += ob("to-menu", "Game modes");
            } else if (online) {
                rows += ob("rematch", "Rematch", true);
            } else {
                rows += ob("rematch", "Play again", true) + ob("to-menu", "Game modes");
            }
            return '<h3 class="' + (win ? "nm-win" : "nm-lose") + '">' + overTitle() + "</h3>"
                + '<p class="sub">' + overReason() + (online ? " Either player can start a rematch." : "") + "</p>"
                + '<p class="nm-scoreline">' + scoreline + "</p>"
                + (state.cheated ? '<p class="nm-note">Cheats were used this run.</p>' : "")
                + '<div class="rows">' + rows + "</div>";
        }
        return "";
    }
    function renderOverlay() {
        if (!overlay) { ovEl.hidden = true; return; }
        ovEl.hidden = false;
        cardEl.className = "nm-card" + (overlay === "howto" ? " nm-howto" : "");
        cardEl.innerHTML = cardHtml(overlay);
    }
    function renderAll() {
        if (state) {
            if (state.status === "over" && prevStatus !== "over") {
                overlay = "over"; eraseMode = false; gameEl.classList.remove("nm-erase");
                persistBest();
            }
            if (state.status === "playing" && prevStatus === "over" && overlay === "over") overlay = null;
            if (state.status === "playing" && overlay === "wait") overlay = null;
            if (versus() && state.moves === 0 && seenMove > 0) announceStart();
            prevStatus = state.status;
        } else prevStatus = "";
        const animate = Boolean(state && state.lastMove && state.lastMove.moves !== seenMove);
        renderHud(); renderStatus(); renderBoard(animate);
        if (state) seenMove = state.moves;
        renderOverlay(); updateControls();
    }

    /* ---------- aksi & alur game ---------- */
    function applyAction(action, actor) {
        if (!state || !action) return;
        const t = action.type;
        if (t === "drop") {
            if (state.status !== "playing") return;
            if (versus()) { if (actor !== state.turn) return; }
            else if (actor !== 0) return;
            const c = Number(action.c) | 0;
            if (c < 0 || c >= COLS) return;
            if (!online && actor === mySeat()) pushHistory();
            const v = state.queue[0];
            const res = resolveDrop(state.board, c, v);
            state.moves++;
            if (res.overflow) {
                state.status = "over"; state.outcome = "overflow";
                state.winner = versus() ? 1 - actor : null;
                state.lastMove = { c, v, overflow: true, merges: [], chain: 0, gained: 0, actor, moves: state.moves };
            } else {
                state.board = res.board;
                state.scores[actor] += res.gained;
                state.best = Math.max(state.best, maxTile(state.board));
                state.lastMove = { c, r: res.landing, v, merges: res.merges, chain: res.chain, gained: res.gained, actor, moves: state.moves };
                state.queue = [state.queue[1], drawSpawn(state)];
                state.best = Math.max(state.best, state.queue[0], state.queue[1]);
                if (maxTile(state.board) >= state.target) { state.status = "over"; state.outcome = "target"; state.winner = versus() ? actor : 0; }
                else if (allFull(state.board)) { state.status = "over"; state.outcome = "full"; state.winner = versus() ? 1 - actor : null; }
                else if (versus()) state.turn = 1 - state.turn;
            }
            eraseMode = false; hintCol = -1; gameEl.classList.remove("nm-erase");
            publish(); scheduleBot();
            return;
        }
        if (t === "restart") {
            if (state.status === "generating") return;
            resetMatch(state);
            overlay = null; eraseMode = false; hintCol = -1; seenMove = -1;
            gameEl.classList.remove("nm-erase");
            clearBot(); publish(); ensureLevelLoaded(); scheduleBot(); announceStart();
            return;
        }
        if (online) return; /* cheat hanya untuk mode offline */
        if (t === "cheat-undo") { doUndo(); return; }
        if (t === "cheat-erase") {
            if (state.status !== "playing") return;
            if (versus() && actor !== mySeat()) return;
            const c = Number(action.c) | 0, r = Number(action.r) | 0;
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS || !state.board[c][r]) return;
            pushHistory();
            state.board[c][r] = 0;
            compactBoard(state.board);
            state.cheated = true; state.lastMove = null;
            publish();
            return;
        }
        if (t === "cheat-next") {
            if (state.status !== "playing") return;
            const v = Number(action.v) | 0;
            if (v < 2 || (v & (v - 1)) !== 0 || v > 1024) return;
            state.queue[1] = v; state.cheated = true;
            publish(); toast("Next block = " + v);
            return;
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }
    function dropAt(c) {
        if (!state || state.status !== "playing" || overlay || eraseMode) return;
        if (versus() && state.turn !== mySeat()) { toast("Not your turn"); return; }
        aim = Math.max(0, Math.min(COLS - 1, c));
        submitAction({ type: "drop", c: aim });
    }
    function setAim(c) {
        if (!canMove() || eraseMode) return;
        const n = Math.max(0, Math.min(COLS - 1, c));
        if (n !== aim) { aim = n; renderBoard(false); }
    }
    function doUndo() {
        if (!state || state.status === "generating") return;
        if (!state.history.length) { toast("Nothing to undo"); return; }
        const h = state.history.pop();
        state.board = h.board; state.queue = h.queue; state.rng = h.rng;
        state.spawnPtr = h.spawnPtr; state.scores = h.scores; state.turn = h.turn;
        state.best = h.best; state.moves = h.moves;
        state.status = "playing"; state.outcome = ""; state.winner = null;
        state.lastMove = null; state.cheated = true;
        overlay = null; eraseMode = false; hintCol = -1; seenMove = state.moves;
        gameEl.classList.remove("nm-erase");
        clearBot(); publish(); toast("Move undone");
    }
    function doHint() {
        if (!canMove()) { toast("Hint unavailable right now"); return; }
        const c = hintSuggest();
        hintCol = c; aim = c;
        renderBoard(false);
        toast("Try column " + (c + 1));
        later(() => { hintCol = -1; renderBoard(false); }, 1800);
    }
    function startLocal(m) {
        clearBot();
        state = freshSession(m);
        overlay = null; eraseMode = false; hintCol = -1; aim = 2; seenMove = -1; prevStatus = "";
        gameEl.classList.remove("nm-erase");
        publish(); ensureLevelLoaded(); scheduleBot(); announceStart();
    }

    /* ---------- input: mouse / touch / keyboard ---------- */
    function handleClick(event) {
        const t = event.target instanceof Element ? event.target : null;
        if (!t) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const el = t.closest("[data-act]");
        if (!el || el.disabled) return;
        const act = el.getAttribute("data-act");
        if (act === "drop") { el.blur(); dropAt(aim); }
        else if (act === "col") { el.blur(); dropAt(Number(el.getAttribute("data-c"))); }
        else if (act === "pad-left" || act === "pad-right") { /* ditangani pointerdown (hold-repeat) */ }
        else if (act === "help") { overlay = "howto"; renderOverlay(); updateControls(); }
        else if (act === "cheats") { if (!online && state && state.status !== "generating") { overlay = "cheats"; renderOverlay(); updateControls(); } }
        else if (act === "menu" || act === "to-menu") { if (!online) { clearBot(); state = null; overlay = "start"; eraseMode = false; hintCol = -1; gameEl.classList.remove("nm-erase"); renderAll(); } }
        else if (act === "restart") { if (state) submitAction({ type: "restart" }); }
        else if (act === "start-solo") startLocal("solo");
        else if (act === "start-level") startLocal("level");
        else if (act === "start-bot") startLocal("bot");
        else if (act === "close-ov") { overlay = state ? (state.status === "over" ? "over" : (state.status === "generating" ? "wait" : null)) : (online ? "wait" : "start"); renderOverlay(); updateControls(); }
        else if (act === "cheat-undo") { overlay = null; renderOverlay(); applyAction({ type: "cheat-undo" }, 0); }
        else if (act === "cheat-hint") { overlay = null; renderOverlay(); doHint(); updateControls(); }
        else if (act === "cheat-erase") {
            overlay = null; renderOverlay();
            if (canMove()) { eraseMode = true; hoverCell = null; gameEl.classList.add("nm-erase"); renderAll(); toast("Tap a block to erase it"); }
            else toast("Not available right now");
        }
        else if (act === "cheat-next") { applyAction({ type: "cheat-next", v: Number(el.getAttribute("data-v")) }, 0); renderOverlay(); }
        else if (act === "retry" || act === "rematch") submitAction({ type: "restart" });
        else if (act === "next-level") { if (state) { state.level++; submitAction({ type: "restart" }); } }
        else if (act === "new-level") { if (state) { state.seed = (Math.random() * 0x7fffffff) | 0; submitAction({ type: "restart" }); } }
    }
    function onKey(e) {
        if (!mounted) return;
        const tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        if (e.key === "Escape") {
            if (eraseMode) { eraseMode = false; hoverCell = null; gameEl.classList.remove("nm-erase"); renderAll(); e.preventDefault(); return; }
            if (overlay === "howto" || overlay === "cheats") {
                overlay = state ? (state.status === "over" ? "over" : null) : (online ? "wait" : "start");
                renderOverlay(); updateControls(); e.preventDefault();
            }
            return;
        }
        if (overlay || !state || state.status !== "playing") return;
        const k = e.key;
        if (k === "ArrowLeft") { e.preventDefault(); setAim(aim - 1); }
        else if (k === "ArrowRight") { e.preventDefault(); setAim(aim + 1); }
        else if (k === " " || k === "Spacebar" || k === "ArrowDown") { e.preventDefault(); if (!e.repeat) dropAt(aim); }
        else if (k >= "1" && k <= "5") { if (!e.repeat) dropAt(Number(k) - 1); }
        else if ((k === "r" || k === "R") && !e.repeat) submitAction({ type: "restart" });
        else if ((k === "h" || k === "H") && !e.repeat) doHint();
        else if ((k === "u" || k === "U") && !e.repeat) { if (!online) applyAction({ type: "cheat-undo" }, 0); }
        else if ((k === "c" || k === "C") && !e.repeat) { if (!online && state.status !== "generating") { overlay = "cheats"; renderOverlay(); updateControls(); } }
        else if ((k === "e" || k === "E") && !e.repeat) {
            if (!online && canMove()) { eraseMode = true; hoverCell = null; gameEl.classList.add("nm-erase"); renderAll(); toast("Tap a block to erase it"); }
        }
        else if (k === "?") { overlay = "howto"; renderOverlay(); updateControls(); }
        else if ((k === "m" || k === "M") && !e.repeat) { if (!online) { clearBot(); state = null; overlay = "start"; renderAll(); } }
    }
    function cellFromEvent(e) {
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = (e.clientX - rect.left) / rect.width * VW;
        const y = (e.clientY - rect.top) / rect.height * VH;
        const c = Math.floor((x - PX + GAP / 2) / (CELL + GAP));
        if (c < 0 || c >= COLS) return null;
        const r = ROWS - 1 - Math.floor((y - TOP + GAP / 2) / (CELL + GAP));
        return { c, r };
    }
    function onMove(e) {
        if (!state || state.status !== "playing" || overlay) return;
        const p = cellFromEvent(e);
        if (!p) return;
        if (eraseMode) {
            const hc = p.r >= 0 && p.r < ROWS ? { c: p.c, r: p.r } : null;
            const changed = JSON.stringify(hc) !== JSON.stringify(hoverCell);
            hoverCell = hc;
            if (changed) renderBoard(false);
            return;
        }
        if (canMove() && p.c !== aim) { aim = p.c; renderBoard(false); }
    }
    function onLeave() {
        if (eraseMode && hoverCell) { hoverCell = null; renderBoard(false); }
    }
    function onDown(e) {
        if (!state || overlay) return;
        const p = cellFromEvent(e);
        if (!p) return;
        if (eraseMode) {
            if (p.r >= 0 && p.r < ROWS && state.board[p.c][p.r]) {
                eraseMode = false; hoverCell = null; gameEl.classList.remove("nm-erase");
                applyAction({ type: "cheat-erase", c: p.c, r: p.r }, mySeat());
            }
            return;
        }
        if (state.status !== "playing") return;
        e.preventDefault();
        dropAt(p.c);
    }
    function onWheel(e) {
        if (!canMove() || eraseMode) return;
        e.preventDefault();
        setAim(aim + (e.deltaY > 0 ? 1 : -1));
    }
    function stopHold() {
        if (holdTimer) { cancel(holdTimer); holdTimer = 0; }
        if (holdIval) { clearInterval(holdIval); holdIval = 0; }
    }
    function onPointerDown(e) {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        const el = t.closest('[data-act="pad-left"],[data-act="pad-right"]');
        if (!el || el.disabled) return;
        e.preventDefault();
        const d = el.getAttribute("data-act") === "pad-left" ? -1 : 1;
        setAim(aim + d);
        stopHold();
        holdTimer = later(() => { holdIval = setInterval(() => { if (mounted) setAim(aim + d); }, 130); }, 330);
    }

    /* ---------- wiring + boot ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", stopHold);
    window.addEventListener("pointercancel", stopHold);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("wheel", onWheel, { passive: false });

    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; renderHud(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = freshSession("online");
            publish(); announceStart();
            const offAct = room.onAction((action) => applyAction(action, 1 - state.hostSeat));
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            overlay = "wait";
            let gotState = false;
            const offState = room.onState((nextState) => {
                if (!nextState || !nextState.board) return;
                state = nextState; renderAll();
                if (!gotState) { gotState = true; announceStart(); }
            });
            if (typeof offState === "function") offs.push(offState);
            renderAll();
        }
    } else {
        renderAll(); /* overlay start: pilih mode */
    }

    return {
        destroy() {
            mounted = false;
            clearTimers(); stopHold(); clearBot();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerup", stopHold);
            window.removeEventListener("pointercancel", stopHold);
            svg.removeEventListener("pointermove", onMove);
            svg.removeEventListener("pointerleave", onLeave);
            svg.removeEventListener("pointerdown", onDown);
            svg.removeEventListener("wheel", onWheel);
            offs.forEach((f) => { try { f(); } catch (e) { } });
        },
    };
}

/* diekspos utk unit test, mengikuti gaya _test modul lama */
export const _test = { resolveDrop, groupAt, genLevel, bestMove, botPick, hashBoard, spawnFrom, emptyBoard, maxTile, allFull, stepRng };