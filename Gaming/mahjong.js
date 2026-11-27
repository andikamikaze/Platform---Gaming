/* ==== games/mahjong.js — Mahjong Duel (template META + mount) ====
   Simpan sebagai games/mahjong.js (id META = nama file), lalu jalankan:
   node tools/build-games-manifest.mjs
==================================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "mahjong",
    name: "Mahjong",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Duel mahjong solitaire: kumpulkan poin dari pasangan tile bebas dan kalahkan lawan.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" aria-hidden="true"><rect x="8" y="18" width="24" height="26" rx="4" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/><rect x="16" y="6" width="24" height="26" rx="4" fill="#ffffff" stroke="#64748b" stroke-width="2"/><circle cx="22" cy="13" r="2.6" fill="#4f46e5"/><circle cx="28" cy="19" r="2.6" fill="#4f46e5"/><circle cx="34" cy="25" r="2.6" fill="#4f46e5"/></svg>',
    bg: ["#f1f5f9", "#cbd5e1"],
};

/* ================= logika murni =================
   Grid setengah-unit: satu tile menempati 2x2 satuan.
   Bebas = tidak tertutup tile layer atas (overlap nyata) DAN
   sisi kiri ATAU kanan terbuka (aturan mahjong solitaire asli).
   Skor duel: pasangan bernilai angka tile (1-9); salah pasang = giliran pindah. */
const TW = 46, TH = 56, HW = 23, HH = 28;
const PX = 22, PY = 18, LX = 5, LY = 6;
const NSYM = 18; /* 9 dot + 9 bamboo, masing-masing 4 kopi = 72 tile */

const LAYOUT = (() => {
    const P = [];
    for (let r = 0; r < 5; r++)
        for (let c = 0; c < 10; c++) P.push({ col: c * 2, row: r * 2, layer: 0 });
    P.push({ col: 20, row: 4, layer: 0 });
    for (let r = 1; r < 4; r++)
        for (let c = 2; c < 8; c++) P.push({ col: c * 2, row: r * 2, layer: 1 });
    P.push({ col: 8, row: 4, layer: 2 }, { col: 10, row: 4, layer: 2 });
    P.push({ col: 9, row: 4, layer: 3 }); /* puncak half-offset menutup 2 tile di bawahnya */
    return P;
})();

function isFree(tiles, i) {
    const t = tiles[i];
    if (!t) return false;
    let L = false, R = false;
    for (let k = 0; k < tiles.length; k++) {
        if (k === i) continue;
        const o = tiles[k], dr = Math.abs(o.row - t.row);
        if (o.layer > t.layer && dr < 2 && Math.abs(o.col - t.col) < 2) return false;
        if (o.layer === t.layer && dr < 2) {
            if (o.col === t.col - 2) L = true;
            else if (o.col === t.col + 2) R = true;
        }
    }
    return !(L && R);
}

function freeIdx(tiles) {
    const out = [];
    for (let i = 0; i < tiles.length; i++) if (isFree(tiles, i)) out.push(i);
    return out;
}

function allPairs(tiles) {
    const fr = freeIdx(tiles), out = [];
    for (let x = 0; x < fr.length; x++)
        for (let y = x + 1; y < fr.length; y++)
            if (tiles[fr[x]].sym === tiles[fr[y]].sym) out.push([fr[x], fr[y]]);
    return out;
}

function findPair(tiles) {
    const p = allPairs(tiles);
    return p.length ? p[0] : null;
}

function shuffleArr(a, rand) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = (rand() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
}

function freshPool(rand) {
    const pool = [];
    for (let s = 0; s < NSYM; s++) pool.push(s, s);
    shuffleArr(pool, rand);
    return pool;
}

function poolFrom(tiles, rand) {
    const cnt = {};
    tiles.forEach((t) => { cnt[t.sym] = (cnt[t.sym] || 0) + 1; });
    const pool = [];
    Object.keys(cnt).forEach((s) => {
        for (let k = 0; k < cnt[s] / 2; k++) pool.push(+s);
    });
    shuffleArr(pool, rand);
    return pool;
}

/* Deal mundur: pasangan diambil dari tile bebas, urutan deal = solusi. */
function dealSolvable(rand, positions, pool) {
    const n = positions.length;
    if (n % 2 || pool.length !== n / 2) return null;
    const sym = new Array(n).fill(-1);
    let rem = positions.map((_, i) => i);
    const solution = [];
    for (let s = 0; s < n / 2; s++) {
        const sub = rem.map((i) => positions[i]);
        const free = [];
        for (let k = 0; k < sub.length; k++) if (isFree(sub, k)) free.push(rem[k]);
        if (free.length < 2) return null;
        const a = free[(rand() * free.length) | 0];
        let b = a;
        while (b === a) b = free[(rand() * free.length) | 0];
        sym[a] = sym[b] = pool[s];
        solution.push([a, b]);
        rem = rem.filter((i) => i !== a && i !== b);
    }
    return {
        tiles: positions.map((p, i) => ({ col: p.col, row: p.row, layer: p.layer, sym: sym[i] })),
        solution,
    };
}

/* Verifikasi: replay solusi harus benar-benar membersihkan papan. */
function verifySolution(tiles, solution) {
    let cur = tiles.map((t) => ({ col: t.col, row: t.row, layer: t.layer }));
    let alive = tiles.map((_, i) => i);
    for (const [a, b] of solution) {
        if (tiles[a].sym !== tiles[b].sym) return false;
        const ia = alive.indexOf(a), ib = alive.indexOf(b);
        if (ia < 0 || ib < 0 || !isFree(cur, ia) || !isFree(cur, ib)) return false;
        const hi = Math.max(ia, ib), lo = Math.min(ia, ib);
        cur.splice(hi, 1); cur.splice(lo, 1);
        alive.splice(hi, 1); alive.splice(lo, 1);
    }
    return cur.length === 0;
}

/* Susun ulang sisa tile ke grid datar (fallback geometri mati). */
function repack(n) {
    const per = 12, R = Math.ceil(n / per), out = [];
    for (let i = 0; i < n; i++) {
        const ri = Math.floor(i / per), ci = i % per, m = Math.min(per, n - ri * per);
        out.push({ col: 10 - (m - 1) + 2 * ci, row: 4 - (R - 1) + 2 * ri, layer: 0 });
    }
    return out;
}

function dealTries(rand, positions, poolFn, tries) {
    for (let k = 0; k < tries; k++) {
        const d = dealSolvable(rand, positions, poolFn());
        if (d && verifySolution(d.tiles, d.solution)) return d;
    }
    return null;
}

function makeTiles(rand) {
    let d = dealTries(rand, LAYOUT, () => freshPool(rand), 80);
    if (!d) d = dealTries(rand, repack(LAYOUT.length), () => freshPool(rand), 40);
    return d.tiles.map((t, i) => ({ ...t, id: "t" + i }));
}

function reshuffleTiles(rand, tiles) {
    const pos = tiles.map((t) => ({ col: t.col, row: t.row, layer: t.layer }));
    let d = dealTries(rand, pos, () => poolFrom(tiles, rand), 60);
    if (!d) d = dealTries(rand, repack(tiles.length), () => poolFrom(tiles, rand), 40);
    if (!d) return null;
    return d.tiles.map((t, i) => ({ ...t, id: tiles[i].id }));
}

/* Bot: prioritaskan nilai tinggi, pasangan yang membuka banyak tile & tidak membuntukan papan. */
function botChoose(rand, tiles) {
    const ps = allPairs(tiles);
    if (!ps.length) return null;
    let best = null, bs = -Infinity;
    for (const [a, b] of ps) {
        const next = tiles.filter((_, k) => k !== a && k !== b);
        const val = (tiles[a].sym % 9) + 1;
        const s = val * 3 + freeIdx(next).length * 2 + (allPairs(next).length ? 8 : 0) + rand() * 5;
        if (s > bs) { bs = s; best = [a, b]; }
    }
    return best;
}

/* Simbol minimalis: dot (pip) & bamboo (batang); angka sudut = nilai poin pasangan. */
const SYMS = (() => {
    const P = {
        1: [[23, 28]], 2: [[23, 15], [23, 41]], 3: [[13, 15], [23, 28], [33, 41]],
        4: [[13, 15], [33, 15], [13, 41], [33, 41]],
        5: [[13, 15], [33, 15], [23, 28], [13, 41], [33, 41]],
        6: [[13, 15], [33, 15], [13, 28], [33, 28], [13, 41], [33, 41]],
        7: [[13, 15], [33, 15], [13, 28], [23, 28], [33, 28], [13, 41], [33, 41]],
        8: [[13, 11], [33, 11], [13, 22], [33, 22], [13, 34], [33, 34], [13, 45], [33, 45]],
        9: [[13, 15], [23, 15], [33, 15], [13, 28], [23, 28], [33, 28], [13, 41], [23, 41], [33, 41]],
    };
    const B = {
        1: [[23, 28]], 2: [[23, 15], [23, 41]], 3: [[23, 15], [13, 41], [33, 41]],
        4: [[13, 15], [33, 15], [13, 41], [33, 41]],
        5: [[13, 15], [33, 15], [23, 28], [13, 41], [33, 41]],
        6: [[13, 15], [23, 15], [33, 15], [13, 41], [23, 41], [33, 41]],
        7: [[23, 12], [13, 28], [23, 28], [33, 28], [13, 44], [23, 44], [33, 44]],
        8: [[13, 11], [33, 11], [13, 23], [33, 23], [13, 35], [33, 35], [13, 47], [33, 47]],
        9: [[13, 15], [23, 15], [33, 15], [13, 28], [23, 28], [33, 28], [13, 41], [23, 41], [33, 41]],
    };
    const out = [];
    for (let s = 0; s < NSYM; s++) {
        const dot = s < 9, n = (s % 9) + 1, col = dot ? "#4f46e5" : "#059669";
        let g = '<text x="4" y="10" font-size="7.5" font-weight="700" fill="' + col + '">' + n + "</text>";
        if (dot) {
            const r = n === 1 ? 8 : n >= 8 ? 3.6 : 4.2;
            g += P[n].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '"/>').join("");
        } else {
            const h = n === 1 ? 20 : n <= 4 ? 13 : n === 6 ? 13 : n >= 8 ? 9 : n === 5 ? 12 : 10;
            const w = n === 1 ? 6 : 5;
            g += B[n].map(([x, y]) => '<rect x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="2" fill="' + col + '"/>').join("");
        }
        out.push(g);
    }
    return out;
})();

function tileSVG(t, x, y, cls) {
    return '<g class="tile ' + cls + '" data-id="' + t.id + '" transform="translate(' + x + "," + y + ')"><g class="fx">' +
        '<rect x="3" y="4" width="' + TW + '" height="' + TH + '" rx="6" fill="#cbd5e1"/>' +
        '<rect class="face" width="' + TW + '" height="' + TH + '" rx="6"/>' +
        SYMS[t.sym] + "</g></g>";
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    let roomData = (room && room.room) || null;
    let state = null;

    const HUMAN = 0, BOT = 1;
    const rand = Math.random;
    let seenEv = 0, hintIds = [], pendingShake = [], cursorId = null;
    let alive = true, helpOpen = false, cheatsOpen = false, paused = false;
    const unsubs = [];

    /* UI lokal: help/cheat/pause saling menekan. Timer dijeda dengan anchor
       Date.now() agar sisa delay tidak loncat saat dilanjutkan. */
    const timers = new Map();
    let deferred = [], seq = 0;
    let pauseStart = 0, pauseOffset = 0;
    const perfNow = () => performance.now() - pauseOffset;

    function clearT(key) {
        const rec = timers.get(key);
        if (rec) { clearTimeout(rec.id); timers.delete(key); }
        deferred = deferred.filter((t) => t.key !== key);
    }
    function setT(key, fn, ms) {
        clearT(key);
        if (paused) { deferred.push({ key, fn, wait: Math.max(0, ms) }); return key; }
        const id = setTimeout(() => {
            timers.delete(key);
            if (alive && !paused) fn();
        }, ms);
        timers.set(key, { id, due: Date.now() + ms, fn });
        return key;
    }
    function later(fn, ms) { return setT("t" + (++seq), fn, ms); }
    function pauseTimers() {
        const now = Date.now();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferred.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function resumeTimers() {
        const queue = deferred;
        deferred = [];
        for (const t of queue) setT(t.key, t.fn, t.wait);
    }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("mahjongHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("mahjongHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    function mySlot() {
        if (!online) return HUMAN;
        if (!state) return isHost ? 0 : 1;
        return isHost ? state.hostSlot : 1 - state.hostSlot;
    }

    root.innerHTML = `
<style>
.mjx{--acc:#4f46e5;width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:10px;outline:none;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mjx *,.mjx *::before,.mjx *::after{box-sizing:border-box}
.mjx [hidden]{display:none!important}
.mjx :is(button,select,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
/* HUD: semua info di satu baris, board hanya arena. */
.mjx .mjx-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.mjx .mjx-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;min-height:30px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#475569;white-space:nowrap}
.mjx .mjx-chip b{font-variant-numeric:tabular-nums}
.mjx .mjx-chip.mjx-side{--c:#4f46e5}
.mjx .mjx-chip.mjx-side[data-side="1"]{--c:#d97706}
.mjx .mjx-chip.mjx-side.on{border-color:var(--c);box-shadow:inset 0 0 0 1px var(--c)}
.mjx .mjx-chip.mjx-side i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--c)}
.mjx .mjx-chip.mjx-side b{font-size:11px;font-weight:600;color:#334155}
.mjx .mjx-chip.mjx-side span{font-size:13px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums}
.mjx .mjx-spacer{flex:1 1 auto;min-width:6px}
.mjx .mjx-btn{font:inherit;font-size:11px;padding:6px 10px;min-height:32px;border-radius:9px;border:1px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;transition:border-color .15s,background .15s}
.mjx .mjx-btn:hover:not(:disabled){border-color:#94a3b8}
.mjx .mjx-btn:active:not(:disabled){background:#f1f5f9}
.mjx .mjx-btn:disabled{opacity:.4;cursor:default}
.mjx .mjx-btn b{font-weight:700;color:#0f172a}
.mjx .mjx-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}
.mjx .mjx-btn.primary:hover:not(:disabled){background:#1e293b}
.mjx .mjx-btn.on{border-color:var(--acc);color:var(--acc)}
.mjx .mjx-icon-btn{display:inline-flex;align-items:center;gap:5px}
.mjx .mjx-icon-btn svg{flex:none;display:block}
.mjx .mjx-btn-label{white-space:nowrap}
.mjx.game-fill>.mjx-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}
.mjx svg.mjx-board{display:block;width:100%;height:100%;max-width:100%;max-height:100%;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.mjx .tile .fx{transform-box:fill-box;transform-origin:center;transition:transform .12s ease}
.mjx .tile .face{fill:#fff;stroke:#cbd5e1;stroke-width:1.4;transition:stroke .12s}
.mjx .tile.locked{opacity:.42}
.mjx .tile.free{cursor:pointer}
.mjx .tile.free:hover .fx{transform:translateY(-2px)}
.mjx .tile.free:hover .face{stroke:#94a3b8}
.mjx .tile.rev .face{stroke:#a5b4fc;stroke-width:2}
.mjx .tile.cursor .face{stroke:#64748b;stroke-width:2;stroke-dasharray:5 3}
.mjx .tile.sel .fx{transform:translateY(-3px)}
.mjx .tile.sel .face{stroke:#0f172a;stroke-width:2.4}
.mjx .tile.hint .face{stroke:#059669;stroke-width:2.6;animation:mjx-pulse .5s ease-in-out 4 alternate}
.mjx .tile.shake .fx{animation:mjx-shake .3s ease}
.mjx .ghost{pointer-events:none}
.mjx .ghost .fx{animation:mjx-gone .3s ease forwards}
@keyframes mjx-pulse{from{stroke-opacity:.25}to{stroke-opacity:1}}
@keyframes mjx-shake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@keyframes mjx-gone{to{opacity:0;transform:translateY(-8px) scale(.6)}}
.mjx .mjx-pad{display:none;margin:8px auto 0;grid-template-columns:repeat(3,54px);grid-template-rows:repeat(3,46px);gap:6px;justify-content:center}
.mjx .mjx-pad .mjx-btn{min-width:0;padding:0;font-size:15px}
.mjx .mjx-pad [data-act="up"]{grid-area:1/2}
.mjx .mjx-pad [data-act="left"]{grid-area:2/1}
.mjx .mjx-pad [data-act="ok"]{grid-area:2/2}
.mjx .mjx-pad [data-act="right"]{grid-area:2/3}
.mjx .mjx-pad [data-act="down"]{grid-area:3/2}
@media (hover:none),(pointer:coarse),(max-width:640px){.mjx .mjx-pad{display:grid}}
/* Overlays: card = flex column with sticky head/foot and scrollable body. */
.mjx .mjx-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(248,250,252,.88);backdrop-filter:blur(3px);border-radius:14px}
.mjx .mjx-card{width:min(92%,380px);max-height:100%;padding:16px 18px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 4px 12px rgba(15,23,42,.10);display:flex;flex-direction:column;gap:10px;overflow:hidden}
.mjx .mjx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.mjx .mjx-head h3{margin:0;font-size:16px;font-weight:650}
.mjx .mjx-card p{margin:0;font-size:12.5px;color:#64748b;line-height:1.5}
.mjx .mjx-stats,.mjx .mjx-cheat-body,.mjx .mjx-help{flex:1 1 auto;min-height:0;overflow:auto}
.mjx .mjx-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mjx .mjx-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.07em;color:#64748b;text-transform:uppercase}
.mjx .mjx-help ul{margin:0 0 10px;padding-left:16px;font-size:11.5px;line-height:1.55}
.mjx .mjx-kbd{display:inline-block;padding:1px 5px;border:1px solid #cbd5e1;border-bottom-width:2px;border-radius:5px;font:600 10px/1.4 ui-monospace,monospace}
.mjx .mjx-cheat-body{display:flex;flex-direction:column}
.mjx .mjx-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px solid #f1f5f9;font-size:12.5px;font-weight:550;color:#334155;cursor:pointer}
.mjx .mjx-switch input{appearance:none;-webkit-appearance:none;flex:none;width:36px;height:20px;margin:0;border-radius:999px;background:#e2e8f0;position:relative;cursor:pointer;transition:background .15s}
.mjx .mjx-switch input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.25);transition:left .15s}
.mjx .mjx-switch input:checked{background:#059669}
.mjx .mjx-switch input:checked::after{left:18px}
.mjx .mjx-cheat-body .mjx-btn{width:100%;margin-top:6px;flex:none}
.mjx .mjx-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;flex-wrap:wrap;padding-top:8px;border-top:1px solid #f1f5f9}
.mjx .mjx-note{font-size:10.5px;color:#64748b}
@media (prefers-reduced-motion:reduce){.mjx *{animation:none!important;transition:none!important}}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.mjx{min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.mjx *,.mjx *::before,.mjx *::after{box-sizing:border-box}
.mjx :where(svg,canvas,img){max-width:100%}
.mjx :where(button,[role="button"],select,input){touch-action:manipulation}
.mjx :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.mjx :is([class*="card"],[class*="panel"],[class*="sheet"]){border-radius:12px;box-shadow:none}
.mjx :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.mjx :where([class*="chip"],[class*="note"]){font-size:12px;line-height:1.45}
@media (pointer:coarse){
  .mjx :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
/* Mobile overrides LAST: beat pointer:coarse 44px and trailing polish blocks. */
@media (max-width:640px){
  .mjx.game-fill>.mjx-panel:not(:has(.mjx-ov:not([hidden]))){aspect-ratio:540/312;flex:0 0 auto}
  .mjx.game-fill>.mjx-panel:has(.mjx-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .mjx{gap:6px}
  .mjx .mjx-hud{gap:4px}
  .mjx .mjx-hud .mjx-chip{padding:4px 6px;font-size:9px;min-height:0}
  .mjx .mjx-hud .mjx-chip[data-you]{display:none}
  .mjx .mjx-hud .mjx-btn-label,.mjx .mjx-hud .mjx-spacer{display:none}
  .mjx .mjx-hud .mjx-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .mjx-ov{padding:8px}
  .mjx .mjx-card{width:100%;height:100%;max-height:100%;padding:12px}
  .mjx .mjx-help{grid-template-columns:1fr;gap:8px}
  .mjx .mjx-stats,.mjx .mjx-cheat-body,.mjx .mjx-help{scrollbar-width:none}
  .mjx .mjx-stats::-webkit-scrollbar,.mjx .mjx-cheat-body::-webkit-scrollbar,.mjx .mjx-help::-webkit-scrollbar{display:none}
  .mjx .mjx-foot{padding-top:8px;border-top:1px solid #e2e8f0}
  .mjx .mjx-note{display:none}
}
@media (pointer:coarse){
  .mjx .mjx-hud .mjx-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
  .mjx .mjx-card .mjx-btn.primary{min-height:44px}
}
@media (prefers-reduced-motion:reduce){
  .mjx *,.mjx *::before,.mjx *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
</style>
<div class="game-app mjx game-fill" data-mjx>
  <div class="mjx-hud">
    <span class="mjx-chip mjx-side" data-side="0"><i></i><b data-name="0">P1</b><span data-sc="0">0</span></span>
    <span class="mjx-chip mjx-side" data-side="1"><i></i><b data-name="1">P2</b><span data-sc="1">0</span></span>
    <span class="mjx-chip">TILE <b data-left>72</b></span>
    <span class="mjx-chip" data-status aria-live="polite">…</span>
    <span class="mjx-chip" data-you hidden></span>
    <span class="mjx-spacer"></span>
    <button class="mjx-btn mjx-icon-btn" type="button" data-act="hint" aria-label="Hint" title="Hint (I)">${iconSVG("lightbulb", { size: 14 })}<span class="mjx-btn-label">Hint <b data-hintn>3</b></span></button>
    <button class="mjx-btn mjx-icon-btn" type="button" data-act="shuffle" aria-label="Shuffle" title="Shuffle (S)">${iconSVG("layers", { size: 14 })}<span class="mjx-btn-label">Kocok <b data-shufn>2</b></span></button>
    <button class="mjx-btn mjx-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="mjx-btn-label">Help</span></button>
    <button class="mjx-btn mjx-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="mjx-btn-label">Cheats</span></button>
    <button class="mjx-btn mjx-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="mjx-btn-label">Pause</span></button>
    <button class="mjx-btn mjx-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="mjx-btn-label">Restart</span></button>
    <button class="mjx-btn mjx-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="mjx-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel mjx-panel" data-board>
    <svg class="mjx-board" data-svg viewBox="0 0 540 312" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Papan mahjong">
      <g data-gtiles></g><g data-gghost></g>
    </svg>
    <div class="mjx-ov" data-ov="over" hidden>
      <div class="mjx-card">
        <div class="mjx-head"><h3 data-ovtitle></h3></div>
        <div class="mjx-stats"><p data-ovsub></p></div>
        <div class="mjx-foot">
          <span class="mjx-note">Tekan R untuk ulang</span>
          <button type="button" class="mjx-btn primary" data-act="restart">Main lagi</button>
          <button type="button" class="mjx-btn" data-exit>Keluar</button>
        </div>
      </div>
    </div>
    <div class="mjx-ov" data-ov="pause" hidden>
      <div class="mjx-card">
        <div class="mjx-head"><h3>Dijeda</h3></div>
        <div class="mjx-stats"><p>Papan, bot, dan timer dibekukan.</p></div>
        <div class="mjx-foot"><span class="mjx-note">Tekan P atau Esc untuk lanjut</span><button class="mjx-btn primary" type="button" data-resume>Lanjutkan</button></div>
      </div>
    </div>
    <div class="mjx-ov" data-ov="cheat" hidden>
      <div class="mjx-card mjx-cheats">
        <div class="mjx-head"><h3>Cheat</h3><button class="mjx-btn" type="button" data-cheat-close aria-label="Close">Close</button></div>
        <div class="mjx-cheat-body">
          <label class="mjx-switch">Giliran ganda<input type="checkbox" data-cheat="double"></label>
          <label class="mjx-switch">Hint &amp; kocok tanpa batas<input type="checkbox" data-cheat="infinite"></label>
          <label class="mjx-switch">Tandai semua pasangan<input type="checkbox" data-cheat="reveal"></label>
          <button type="button" class="mjx-btn" data-act="cheat-skip">Lompati giliran bot</button>
          <button type="button" class="mjx-btn" data-act="cheat-sweep">Sapu bersih papan</button>
        </div>
        <div class="mjx-foot"><span class="mjx-note">Hanya mode vs bot</span></div>
      </div>
    </div>
    <div class="mjx-ov" data-ov="help" hidden>
      <div class="mjx-card">
        <div class="mjx-head"><h3>Cara bermain</h3><button class="mjx-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="mjx-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Klik dua tile bebas dengan simbol sama untuk mengambil pasangannya.</li>
              <li><span class="mjx-kbd">← ↑ → ↓</span> pindah kursor, <span class="mjx-kbd">Enter</span> pilih tile.</li>
              <li><span class="mjx-kbd">H</span> bantuan · <span class="mjx-kbd">C</span> cheat · <span class="mjx-kbd">P</span> jeda · <span class="mjx-kbd">R</span> ulang</li>
              <li><span class="mjx-kbd">I</span> hint · <span class="mjx-kbd">S</span> kocok · <span class="mjx-kbd">Esc</span> tutup panel</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap tile bebas berganda, lalu gunakan pad di bawah papan untuk navigasi.</li>
              <li>Tombol Help, Cheats, Pause, Restart, dan Exit ada di bar atas.</li>
            </ul>
          </div>
          <div>
            <b>Aturan</b>
            <ul>
              <li>Tile bebas jika tidak tertutup tile di layer atas dan sisi kiri atau kanannya terbuka.</li>
              <li>Pasangan yang cocok memberi poin sesuai angka di tile; salah pasang memindahkan giliran.</li>
              <li>Bergiliran dengan bot; siapa pun yang mengumpulkan poin lebih banyak saat papan habis menang.</li>
              <li>Hint dan kocok terbatas. Jika tidak ada pasangan, papan otomatis diacak ulang.</li>
              <li>Cheat hanya tersedia saat melawan bot.</li>
            </ul>
            <div class="mjx-foot"><span class="mjx-note">Tekan H untuk membuka panduan ini</span><button class="mjx-btn primary" type="button" data-help-close>Mengerti</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="mjx-pad">
    <button type="button" class="mjx-btn" data-act="up" aria-label="Atas">&#9650;</button>
    <button type="button" class="mjx-btn" data-act="left" aria-label="Kiri">&#9664;</button>
    <button type="button" class="mjx-btn" data-act="ok" aria-label="Pilih">&#9679;</button>
    <button type="button" class="mjx-btn" data-act="right" aria-label="Kanan">&#9654;</button>
    <button type="button" class="mjx-btn" data-act="down" aria-label="Bawah">&#9660;</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svg = $("[data-svg]"), gTiles = $("[data-gtiles]"), gGhost = $("[data-gghost]");
    const el = {
        you: $("[data-you]"), status: $("[data-status]"), left: $("[data-left]"),
        sc: [$('[data-sc="0"]'), $('[data-sc="1"]')],
        name: [$('[data-name="0"]'), $('[data-name="1"]')],
        side: [$('.mjx-side[data-side="0"]'), $('.mjx-side[data-side="1"]')],
        hintn: $("[data-hintn]"), shufn: $("[data-shufn]"),
        hintBtn: $('[data-act="hint"]'), shufBtn: $('[data-act="shuffle"]'),
        ovTitle: $("[data-ovtitle]"), ovSub: $("[data-ovsub]"),
    };
    const ov = {
        over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'), help: $('[data-ov="help"]'),
    };
    const pauseBtn = $("[data-pause]"), cheatsBtn = $("[data-cheats]"), restartBtn = $("[data-restart]");

    /* ---------- state (serializable, host otoritatif) ---------- */
    function freshState() {
        return {
            tiles: makeTiles(rand),
            turn: (rand() * 2) | 0,          /* giliran pertama acak (vs bot & multiplayer) */
            hostSlot: (rand() * 2) | 0,      /* posisi P1/P2 diacak saat multiplayer */
            scores: [0, 0], hints: [3, 3], shuffles: [2, 2], moves: 0,
            sel: null, status: "play", winner: null,
            cheats: { double: false, infinite: false, reveal: false, skip: false },
            ev: { n: 0, type: "start", actor: -1, ids: [] },
        };
    }
    function pushEv(type, actor = -1, ids = []) {
        state.ev = { n: state.ev.n + 1, type, actor, ids };
    }
    function endGame() {
        state.status = "over";
        state.sel = null;
        const a = state.scores[0], b = state.scores[1];
        state.winner = a > b ? 0 : b > a ? 1 : -1;
        pushEv("over");
    }
    /* Papan buntu: kocok simbol; geometri mati: susun ulang. Selalu bisa lanjut. */
    function rescue() {
        if (!state.tiles.length) { endGame(); return; }
        if (findPair(state.tiles)) return;
        const nt = reshuffleTiles(rand, state.tiles);
        if (!nt) { endGame(); return; }
        state.tiles = nt;
        state.sel = null;
        pushEv("rescue");
    }
    function pickHint() {
        const ps = allPairs(state.tiles);
        if (!ps.length) return null;
        if (state.sel != null) {
            const si = state.tiles.findIndex((t) => t.id === state.sel);
            const hit = ps.find(([a, b]) => a === si || b === si);
            if (hit) return hit.map((k) => state.tiles[k].id);
        }
        let best = ps[0], bv = -1;
        for (const p of ps) {
            const v = (state.tiles[p[0]].sym % 9) + 1;
            if (v > bv) { bv = v; best = p; }
        }
        return best.map((k) => state.tiles[k].id);
    }

    /* ---------- aksi (divalidasi di host) ---------- */
    function applyAction(a, actor) {
        if (!state || !a || typeof a !== "object") return;
        if (a.type === "restart") {
            if (online ? actor !== state.hostSlot : actor !== HUMAN) return;
            state = freshState();
            hintIds = []; cursorId = null; seenEv = 0;
            publish();
            return;
        }
        if (state.status !== "play") return;
        const myTurn = actor === state.turn || (!online && actor === HUMAN && state.cheats.double);
        if (a.type === "pick") {
            if (!myTurn) return;
            const i = state.tiles.findIndex((t) => t.id === a.id);
            if (i < 0) return;
            if (!isFree(state.tiles, i)) { pushEv("blocked", actor, [a.id]); publish(); return; }
            if (state.sel === a.id) { state.sel = null; pushEv("deselect", actor, [a.id]); publish(); return; }
            if (state.sel == null) { state.sel = a.id; pushEv("select", actor, [a.id]); publish(); return; }
            const j = state.tiles.findIndex((t) => t.id === state.sel);
            if (j >= 0 && state.tiles[j].sym === state.tiles[i].sym && isFree(state.tiles, j)) {
                const val = (state.tiles[i].sym % 9) + 1;
                const ids = [state.sel, a.id];
                state.tiles = state.tiles.filter((t) => t.id !== state.sel && t.id !== a.id);
                state.scores[actor] += val;
                state.moves++;
                state.sel = null;
                state.turn = (!online && actor === HUMAN && state.cheats.double) ? HUMAN : 1 - state.turn;
                pushEv("match", actor, ids);
                rescue();
            } else {
                /* salah pasang: giliran pindah (cheat giliran ganda melindungi) */
                pushEv("miss", actor, [state.sel, a.id]);
                state.sel = null;
                state.turn = (!online && actor === HUMAN && state.cheats.double) ? HUMAN : 1 - state.turn;
            }
            publish();
            return;
        }
        if (a.type === "hint") {
            if (!myTurn) return;
            const inf = !online && actor === HUMAN && state.cheats.infinite;
            if (!inf && state.hints[actor] <= 0) return;
            const p = pickHint();
            if (!p) return;
            if (!inf) state.hints[actor]--;
            pushEv("hint", actor, p);
            publish();
            return;
        }
        if (a.type === "shuffle") {
            if (!myTurn || state.tiles.length < 2) return;
            const inf = !online && actor === HUMAN && state.cheats.infinite;
            if (!inf && state.shuffles[actor] <= 0) return;
            const nt = reshuffleTiles(rand, state.tiles);
            if (!nt) return;
            if (!inf) state.shuffles[actor]--;
            state.tiles = nt;
            state.sel = null;
            pushEv("shuffle", actor);
            publish();
            return;
        }
        if (a.type === "cheat") {
            if (online || actor !== HUMAN) return; /* cheat hanya mode vs bot */
            if (a.key === "double" || a.key === "infinite" || a.key === "reveal") {
                state.cheats[a.key] = Boolean(a.value);
                pushEv("cheat", actor);
                publish();
                return;
            }
            if (a.key === "skip") {
                state.cheats.skip = true;
                pushEv("cheat", actor);
                publish();
                return;
            }
            if (a.key === "sweep") {
                const pts = state.tiles.reduce((s, t) => s + (t.sym % 9) + 1, 0) / 2;
                state.scores[HUMAN] += pts;
                state.moves += state.tiles.length / 2;
                state.tiles = [];
                endGame();
                publish();
            }
        }
    }

    function canBot() {
        return !online && !paused && !helpOpen && !cheatsOpen &&
            Boolean(state) && state.status === "play" && state.turn === BOT;
    }
    function publish() {
        render();
        if (online && isHost) room.publishState(state).catch(console.warn);
        if (canBot()) scheduleBot();
    }
    function submitAction(a) {
        if (!state) return;
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, mySlot());
    }

    /* ---------- bot ---------- */
    function scheduleBot() {
        clearT("bot");
        if (!canBot()) return;
        const delay = state.sel != null ? 380 + rand() * 250 : 700 + rand() * 700;
        setT("bot", botStep, delay);
    }
    function botStep() {
        if (!canBot()) return;
        if (state.cheats.skip) {
            state.cheats.skip = false;
            state.turn = HUMAN;
            state.sel = null;
            pushEv("skip", BOT);
            publish();
            return;
        }
        if (state.sel != null) {
            const si = state.tiles.findIndex((t) => t.id === state.sel);
            const ps = allPairs(state.tiles).find(([a, b]) => a === si || b === si);
            if (ps) {
                const other = ps[0] === si ? ps[1] : ps[0];
                applyAction({ type: "pick", id: state.tiles[other].id }, BOT);
            } else {
                state.sel = null;
                publish();
            }
            return;
        }
        const p = botChoose(rand, state.tiles);
        if (p) applyAction({ type: "pick", id: state.tiles[p[0]].id }, BOT);
    }

    /* ---------- render ---------- */
    function onEvent(ev) {
        if (ev.type === "match") {
            hintIds = [];
            for (const id of ev.ids) {
                const node = gTiles.querySelector('[data-id="' + id + '"]');
                if (node) {
                    const g = node.cloneNode(true);
                    g.removeAttribute("data-id");
                    g.setAttribute("class", "tile ghost");
                    gGhost.appendChild(g);
                    later(() => g.remove(), 320);
                }
            }
        } else if (ev.type === "miss" || ev.type === "blocked") {
            pendingShake = ev.ids.slice();
        } else if (ev.type === "hint") {
            hintIds = ev.ids.slice();
            clearT("hint");
            setT("hint", () => { hintIds = []; render(); }, 2100);
        } else if (ev.type === "shuffle" || ev.type === "rescue") {
            hintIds = [];
        }
    }

    function drawBoard(play) {
        const ts = state.tiles;
        if (!ts.length) { gTiles.innerHTML = ""; return; }
        const free = new Set(freeIdx(ts));
        const revSet = new Set();
        if (!online && state.cheats.reveal)
            for (const [a, b] of allPairs(ts)) { revSet.add(a); revSet.add(b); }
        const selI = state.sel == null ? -1 : ts.findIndex((t) => t.id === state.sel);
        if (cursorId == null || !ts.some((t, i) => t.id === cursorId && free.has(i)))
            cursorId = free.size ? ts[[...free][0]].id : null;
        const order = ts.map((_, i) => i).sort((a, b) =>
            ts[a].layer - ts[b].layer || ts[a].row - ts[b].row || ts[a].col - ts[b].col);
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        const parts = [];
        for (const i of order) {
            const t = ts[i];
            const x = PX + t.col * HW - t.layer * LX, y = PY + t.row * HH - t.layer * LY;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + TW + 4); maxY = Math.max(maxY, y + TH + 5);
            const isF = free.has(i);
            const cls = [
                isF ? "free" : "locked",
                i === selI ? "sel" : "",
                hintIds.includes(t.id) ? "hint" : "",
                revSet.has(i) && i !== selI ? "rev" : "",
                play && isF && i !== selI && t.id === cursorId ? "cursor" : "",
            ].filter(Boolean).join(" ");
            parts.push(tileSVG(t, x, y, cls));
        }
        gTiles.innerHTML = parts.join("");
        svg.setAttribute("viewBox", (minX - 10) + " " + (minY - 10) + " " + (maxX - minX + 20) + " " + (maxY - minY + 20));
    }

    function render() {
        if (!state) {
            el.status.textContent = online ? "Menunggu host…" : "…";
            el.hintBtn.disabled = true;
            el.shufBtn.disabled = true;
            cheatsBtn.disabled = true;
            pauseBtn.disabled = true;
            restartBtn.disabled = true;
            syncUI();
            return;
        }
        const ev = state.ev;
        if (ev.n < seenEv) { seenEv = 0; hintIds = []; } /* host restart */
        if (ev.n > seenEv) { seenEv = ev.n; onEvent(ev); }

        const me = mySlot(), turn = state.turn, play = state.status === "play";
        const myTurn = play && !paused && (turn === me || (!online && me === HUMAN && state.cheats.double));
        const names = online ? ["P1", "P2"] : [playerName || "Kamu", "Bot"];
        if (online) names[me] = playerName || "Kamu";

        el.name[0].textContent = names[0];
        el.name[1].textContent = names[1];
        el.sc[0].textContent = state.scores[0];
        el.sc[1].textContent = state.scores[1];
        el.side[0].classList.toggle("on", play && turn === 0);
        el.side[1].classList.toggle("on", play && turn === 1);
        el.left.textContent = state.tiles.length;
        el.you.textContent = online ? "kamu " + (me === 0 ? "P1" : "P2") : "vs Bot";
        el.you.hidden = false;

        const result = !play
            ? (state.winner === -1 ? "Seri" : state.winner === me ? "Kamu menang" : names[state.winner] + " menang")
            : "";
        el.status.textContent = !play ? result
            : paused ? "Dijeda"
                : myTurn ? "Giliranmu" : online ? "Giliran lawan…" : "Bot berpikir…";

        const inf = !online && state.cheats.infinite;
        el.hintn.textContent = inf ? "∞" : state.hints[me];
        el.shufn.textContent = inf ? "∞" : state.shuffles[me];
        const blocked = helpOpen || cheatsOpen || paused;
        el.hintBtn.disabled = !myTurn || blocked || (!inf && state.hints[me] <= 0);
        el.shufBtn.disabled = !myTurn || blocked || (!inf && state.shuffles[me] <= 0) || state.tiles.length < 2;
        cheatsBtn.hidden = online;
        pauseBtn.hidden = online;
        cheatsBtn.disabled = !play;
        pauseBtn.disabled = !play;
        cheatsBtn.classList.toggle("on", cheatsOpen);
        restartBtn.disabled = false;
        const canRestart = !online || isHost;
        restartBtn.hidden = !canRestart;
        root.querySelectorAll('[data-act="restart"]').forEach((b) => { b.hidden = !canRestart; });
        root.querySelectorAll("[data-cheat]").forEach((c) => { c.checked = Boolean(state.cheats[c.dataset.cheat]); });

        drawBoard(play);

        if (!play) {
            el.ovTitle.textContent = result;
            el.ovSub.textContent = state.scores[0] + " – " + state.scores[1] + " · " + state.moves + " langkah" +
                (state.tiles.length ? " · sisa " + state.tiles.length + " tile" : "");
        }
        syncUI();

        if (pendingShake.length) {
            pendingShake.forEach((id) => {
                const node = gTiles.querySelector('[data-id="' + id + '"]');
                if (node) { node.classList.add("shake"); later(() => node.classList.remove("shake"), 320); }
            });
            pendingShake = [];
        }
    }

    /* Overlays suppress each other: help > cheats > pause > result.
       Label spans are updated so the inline icon is never destroyed. */
    function syncUI() {
        const resultOpen = Boolean(state && state.status !== "play");
        ov.over.hidden = !resultOpen || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const label = pauseBtn.querySelector(".mjx-btn-label");
        if (label) label.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
    }
    function armBot() { if (canBot()) scheduleBot(); }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
        if (!helpOpen) armBot();
    }
    function toggleCheats(on) {
        if (online || !state || state.status !== "play") return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
        if (!cheatsOpen) armBot();
    }
    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) { pauseStart = performance.now(); pauseTimers(); }
        else {
            if (pauseStart) pauseOffset += performance.now() - pauseStart;
            pauseStart = 0;
            resumeTimers();
        }
        render();
        armBot();
    }

    /* ---------- input: mouse / touch / keyboard / pad virtual ---------- */
    function moveCursor(dir) {
        if (!state || !state.tiles.length) return;
        const ts = state.tiles, fr = freeIdx(ts);
        if (!fr.length) return;
        const cx = (t) => PX + t.col * HW - t.layer * LX + TW / 2;
        const cy = (t) => PY + t.row * HH - t.layer * LY + TH / 2;
        const cur = ts.findIndex((t) => t.id === cursorId);
        if (cur < 0 || !fr.includes(cur)) { cursorId = ts[fr[0]].id; render(); return; }
        const a = ts[cur];
        let best = -1, bs = Infinity;
        for (const i of fr) {
            if (i === cur) continue;
            const dx = cx(ts[i]) - cx(a), dy = cy(ts[i]) - cy(a);
            let along, perp;
            if (dir === "left") { along = -dx; perp = Math.abs(dy); }
            else if (dir === "right") { along = dx; perp = Math.abs(dy); }
            else if (dir === "up") { along = -dy; perp = Math.abs(dx); }
            else { along = dy; perp = Math.abs(dx); }
            if (along <= 4) continue;
            const s = along + 2 * perp;
            if (s < bs) { bs = s; best = i; }
        }
        if (best >= 0) { cursorId = ts[best].id; render(); }
    }
    function pickCursor() {
        if (!state || state.status !== "play" || cursorId == null) return;
        submitAction({ type: "pick", id: cursorId });
    }

    function handleClick(e) {
        const t = e.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-pause]")) { togglePause(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-resume]")) { togglePause(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-restart]")) {
            if (paused) togglePause(false);
            submitAction({ type: "restart" });
            root.focus({ preventScroll: true });
            return;
        }
        const btn = t.closest("[data-act]");
        if (btn) {
            const a = btn.dataset.act;
            if (a === "hint" || a === "shuffle") { if (!btn.disabled) submitAction({ type: a }); }
            else if (a === "restart") {
                if (paused) togglePause(false);
                submitAction({ type: "restart" });
            } else if (a === "cheat-skip") { submitAction({ type: "cheat", key: "skip" }); toggleCheats(false); }
            else if (a === "cheat-sweep") { submitAction({ type: "cheat", key: "sweep" }); toggleCheats(false); }
            else if (!helpOpen && !cheatsOpen && !paused) {
                if (a === "up" || a === "down" || a === "left" || a === "right") moveCursor(a);
                else if (a === "ok") pickCursor();
            }
            return;
        }
        if (helpOpen || cheatsOpen || paused) return;
        const tile = t.closest(".tile");
        if (tile && tile.dataset.id && state && state.status === "play") {
            const id = tile.dataset.id;
            const i = state.tiles.findIndex((t) => t.id === id);
            if (i < 0) return;
            if (!isFree(state.tiles, i)) {
                tile.classList.add("shake");
                later(() => tile.classList.remove("shake"), 320);
                return;
            }
            cursorId = id;
            submitAction({ type: "pick", id });
        }
    }

    function handleChange(e) {
        if (helpOpen || paused) return;
        const c = e.target.closest("[data-cheat]");
        if (c) submitAction({ type: "cheat", key: c.dataset.cheat, value: c.checked });
    }

    function onKey(e) {
        if (!alive || !root.isConnected || !state) return;
        const k = e.key, code = e.code || "", kk = k.length === 1 ? k.toLowerCase() : k;
        const tag = (e.target && e.target.tagName) || "";
        if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
        /* Prioritas: help -> cheats -> pause -> Escape -> restart -> aksi game. */
        if (code === "KeyH" || k === "?" || kk === "h") {
            if (!e.repeat) toggleHelp();
            e.preventDefault(); return;
        }
        if (code === "KeyC" || kk === "c") {
            if (!e.repeat && !helpOpen) toggleCheats();
            e.preventDefault(); return;
        }
        if (code === "KeyP" || kk === "p") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            else if (state.sel != null) { state.sel = null; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyR" || kk === "r") {
            if (!e.repeat && !helpOpen && !cheatsOpen) {
                if (paused) togglePause(false);
                submitAction({ type: "restart" });
            }
            e.preventDefault(); return;
        }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (tag === "BUTTON") return;
        if (helpOpen || cheatsOpen || paused) { e.preventDefault(); return; }
        if (code === "KeyI" || kk === "i") {
            if (!e.repeat && !el.hintBtn.disabled) submitAction({ type: "hint" });
            e.preventDefault(); return;
        }
        if (code === "KeyS" || kk === "s") {
            if (!e.repeat && !el.shufBtn.disabled) submitAction({ type: "shuffle" });
            e.preventDefault(); return;
        }
        if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
            e.preventDefault();
            moveCursor(k.slice(5).toLowerCase());
            return;
        }
        if (k === "Enter" || k === " ") {
            e.preventDefault();
            pickCursor();
        }
    }

    /* ---------- init ---------- */
    root.tabIndex = 0;
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("keydown", onKey);

    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (isHost) {
            state = freshState();
            publish();
            const offAction = room.onAction((action) => applyAction(action, 1 - state.hostSlot));
            if (typeof offAction === "function") unsubs.push(offAction);
        } else {
            render();
            const offState = room.onState((nextState) => { state = nextState; render(); });
            if (typeof offState === "function") unsubs.push(offState);
        }
    } else {
        state = freshState();
        publish();
    }
    void roomData;
    root.focus({ preventScroll: true });
    if (helpOpen) render(); /* panel bantuan pertama tampil di atas papan */

    return {
        destroy() {
            alive = false;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("keydown", onKey);
            for (const rec of timers.values()) clearTimeout(rec.id);
            timers.clear();
            deferred = [];
            unsubs.forEach((fn) => { try { fn(); } catch (err) { /* noop */ } });
        },
    };
}