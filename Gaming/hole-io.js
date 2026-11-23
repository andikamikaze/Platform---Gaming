/* ==== GAME: hole-io.js ==== */
/*
  Hole.io — versi template baru (export META + mount).
  - Dunia 1600x1000 dengan kamera mengikuti pemain (area ~3.8x lebih luas).
  - 103+ objek per wave, 3 bot rival, generator kota dijamin bisa diselesaikan.
  - Kota dibangkitkan deterministik dari seed => state online tetap kecil.
  - Simpan file ini sebagai js/games/hole-io.js lalu jalankan:
    node tools/build-games-manifest.mjs
*/

export const META = {
    id: "hole-io", // harus sama dengan nama file (tanpa .js)
    name: "Hole.io",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Telan seisi kota dengan lubang hitam yang membesar dan kalahkan para rival.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="22" cy="26" rx="13" ry="10" fill="currentColor" stroke="none"/><rect x="33" y="10" width="10" height="8" rx="1.5"/><path d="M33 10l5-5 5 5"/><circle cx="7.5" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="40" cy="30" r="2.6" fill="currentColor" stroke="none"/><path d="M9 36l3 6"/><path d="M13 34l3 7"/></svg>',
    bg: ["#c7d2fe", "#a5b4fc"],
    bestKey: "holeIoBest",
};

/* ============================================================
   LOGIKA MURNI (deterministik, dipakai host & client)
============================================================ */
const VIEW_W = 800, VIEW_H = 520;          // viewport kamera
const WORLD_W = 1600, WORLD_H = 1000;      // dunia sebenarnya (lebih luas)
const TIME_MS = 90000;
const WAVE_BONUS_MS = 15000;               // bonus waktu saat kota habis
const WAVE_BONUS_SCORE = 150;
const HEADSTART_MS = 2200;                 // head start acak: siapa jalan duluan
const PLAYER_SPEED = 172;
const BOT_SPEED = [128, 118, 124, 112];    // kecepatan per kursi bot
const SEAT_COLORS = ["#6366f1", "#ef4444", "#f59e0b", "#10b981"];
const SEAT_NAMES = ["Indigo", "Merah", "Kuning", "Hijau"];
const MM_W = 132, MM_H = WORLD_H * (132 / WORLD_W); // minimap

const TYPES = [
    { id: "hydrant", r: 8, score: 10, n: 26 },
    { id: "person", r: 7, score: 15, n: 22 },
    { id: "tree", r: 13, score: 20, n: 20 },
    { id: "car", r: 19, score: 40, n: 16 },
    { id: "bus", r: 29, score: 80, n: 9 },
    { id: "house", r: 42, score: 150, n: 10 },
];

const SHAPES = {
    hydrant: '<rect x="-5" y="-8" width="10" height="14" rx="2" fill="#ef4444"/><rect x="-7" y="-4" width="14" height="3" rx="1.5" fill="#dc2626"/><circle cx="0" cy="-9" r="2.5" fill="#dc2626"/>',
    person: '<circle cx="0" cy="-6" r="3" fill="#fbbf24"/><rect x="-2.5" y="-3" width="5" height="9" rx="2.5" fill="#38bdf8"/>',
    tree: '<rect x="-2" y="0" width="4" height="9" rx="1.5" fill="#92400e"/><circle cx="0" cy="-5" r="10" fill="#22c55e"/><circle cx="-5" cy="-1" r="7" fill="#16a34a"/><circle cx="5" cy="-1" r="7" fill="#16a34a"/>',
    car: '<rect x="-17" y="-7" width="34" height="12" rx="4" fill="#f472b6"/><rect x="-9" y="-12" width="18" height="8" rx="3" fill="#f9a8d4"/><circle cx="-9" cy="6" r="4" fill="#1f2937"/><circle cx="9" cy="6" r="4" fill="#1f2937"/>',
    bus: '<rect x="-26" y="-12" width="52" height="20" rx="4" fill="#facc15"/><rect x="-21" y="-8" width="10" height="8" rx="1.5" fill="#fef9c3"/><rect x="-8" y="-8" width="10" height="8" rx="1.5" fill="#fef9c3"/><rect x="5" y="-8" width="10" height="8" rx="1.5" fill="#fef9c3"/><circle cx="-15" cy="10" r="4.5" fill="#1f2937"/><circle cx="15" cy="10" r="4.5" fill="#1f2937"/>',
    house: '<rect x="-24" y="-6" width="48" height="26" rx="2" fill="#f8fafc" stroke="#cbd5e1"/><path d="M-28 -6L0 -26 28 -6z" fill="#ef4444"/><rect x="-14" y="0" width="9" height="14" rx="1.5" fill="#60a5fa"/><rect x="5" y="0" width="9" height="14" rx="1.5" fill="#60a5fa"/>',
};

const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function radiusFor(score) { return 16 + 2.2 * Math.sqrt(Math.max(0, score)); }
function canSwallow(holeR, objR) { return holeR >= objR * 1.5 + 2; }
function waveSeed(seed, wave) { return (seed + Math.imul(wave, 0x9e3779b9)) >>> 0; }

function waveCounts(wave) {
    const f = Math.min(2, 1 + 0.22 * (wave - 1)); // makin padat tiap wave, maksimum 2x
    return TYPES.map((t) => ({ id: t.id, r: t.r, score: t.score, n: Math.round(t.n * f) }));
}

/* Jaminan "level bisa diselesaikan": skor kumulatif tier kecil harus cukup
   untuk menumbuhkan lubang hingga bisa menelan tier berikutnya. */
function solvable(tiers) {
    const sorted = [...tiers].sort((a, b) => a.r - b.r);
    let cum = 0;
    for (const t of sorted) {
        const needScore = Math.pow(Math.max(0, (t.r * 1.5 + 2 - 16) / 2.2), 2);
        if (cum + 1e-9 < needScore) return false;
        cum += t.score * t.n;
    }
    return true;
}
function ensureSolvable(tiers) {
    const c = tiers.map((t) => ({ ...t }));
    let guard = 0;
    while (!solvable(c) && guard++ < 500) c[0].n += 2;
    return c;
}

/* Posisi spawn diacak tiap pertandingan (deterministik dari seed). */
function makeSpawns(rnd) {
    const a = [[0.22, 0.25], [0.78, 0.25], [0.22, 0.75], [0.78, 0.75]];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.map(([fx, fy]) => ({
        x: Math.round(fx * WORLD_W + (rnd() * 2 - 1) * 70),
        y: Math.round(fy * WORLD_H + (rnd() * 2 - 1) * 60),
    }));
}

/* Generator kota: semua objek DIJAMIN terpasang (gap menyusut bertahap),
   area spawn dibersihkan, hasil identik di host & client untuk seed sama. */
function makeCity(rnd, wave, spawns) {
    const tiers = ensureSolvable(waveCounts(wave));
    const objs = [];
    for (const t of tiers) {
        for (let i = 0; i < t.n; i++) {
            let placed = null;
            for (const gap of [10, 6, 2, 0]) {
                for (let tries = 0; tries < 200 && !placed; tries++) {
                    const x = t.r + 14 + rnd() * (WORLD_W - 2 * (t.r + 14));
                    const y = t.r + 14 + rnd() * (WORLD_H - 2 * (t.r + 14));
                    let ok = true;
                    for (const s of spawns) {
                        if (Math.hypot(s.x - x, s.y - y) < t.r + 95) { ok = false; break; }
                    }
                    if (ok) {
                        for (const o of objs) {
                            if (Math.hypot(o.x - x, o.y - y) < o.r + t.r + gap) { ok = false; break; }
                        }
                    }
                    if (ok) placed = { x: Math.round(x), y: Math.round(y), r: t.r, score: t.score, type: t.id };
                }
                if (placed) break;
            }
            if (!placed) {
                placed = {
                    x: Math.round(t.r + 14 + rnd() * (WORLD_W - 2 * (t.r + 14))),
                    y: Math.round(t.r + 14 + rnd() * (WORLD_H - 2 * (t.r + 14))),
                    r: t.r, score: t.score, type: t.id,
                };
            }
            objs.push(placed);
        }
    }
    return objs;
}

function newGameState(seed, isOnline) {
    const rnd = rng(seed);
    const spawns = makeSpawns(rnd);
    const pool = [0, 1, 2, 3];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    // Multiplayer: kursi (warna/posisi) host & guest diacak. Solo: pemain = kursi 0.
    const seats = isOnline ? [pool[0], pool[1]] : [0, 1];
    const first = Math.floor(rnd() * 4); // siapa yang jalan duluan (acak)
    const total = ensureSolvable(waveCounts(1)).reduce((a, t) => a + t.n, 0);
    return {
        v: 1, seed, wave: 1, phase: "play", timeLeft: TIME_MS,
        headStart: { first, ms: HEADSTART_MS },
        seats,
        holes: spawns.map((s) => ({ x: s.x, y: s.y, r: radiusFor(0), score: 0 })),
        taken: new Array(total).fill(0),
        result: null,
    };
}

function nearestEdible(objs, taken, hole) {
    let best = null, bd = Infinity;
    for (let i = 0; i < objs.length; i++) {
        if (taken[i]) continue;
        const o = objs[i];
        if (!canSwallow(hole.r, o.r)) continue;
        const d = Math.hypot(o.x - hole.x, o.y - hole.y);
        if (d < bd) { bd = d; best = o; }
    }
    return best;
}
function nearestAny(objs, taken, hole) {
    let best = null, bd = Infinity;
    for (let i = 0; i < objs.length; i++) {
        if (taken[i]) continue;
        const o = objs[i];
        const d = Math.hypot(o.x - hole.x, o.y - hole.y);
        if (d < bd) { bd = d; best = o; }
    }
    return best;
}

function eat(objs, taken, hole, ignoreSize) {
    let n = 0;
    for (let i = 0; i < objs.length; i++) {
        if (taken[i]) continue;
        const o = objs[i];
        if (!ignoreSize && !canSwallow(hole.r, o.r)) continue;
        if (Math.hypot(o.x - hole.x, o.y - hole.y) < hole.r * 0.9) {
            taken[i] = 1;
            hole.score += o.score;
            hole.r = radiusFor(hole.score);
            n++;
        }
    }
    return n;
}

function moveToward(hole, tx, ty, speed, dt) {
    const dx = tx - hole.x, dy = ty - hole.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    hole.x += (dx / d) * speed * dt;
    hole.y += (dy / d) * speed * dt;
}
function clampHole(h) {
    h.x = clamp(h.x, 24, WORLD_W - 24);
    h.y = clamp(h.y, 24, WORLD_H - 24);
}
function makeResult(st) {
    const ranking = [0, 1, 2, 3].sort((a, b) => st.holes[b].score - st.holes[a].score || a - b);
    return { ranking, winner: ranking[0] };
}

/* Firebase kadang mengembalikan array sebagai object — normalkan. */
function normState(s) {
    if (!s) return s;
    const arr = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
    s.holes = arr(s.holes);
    s.taken = arr(s.taken);
    s.seats = arr(s.seats);
    s.headStart = s.headStart || { first: 0, ms: 0 };
    return s;
}

function readBest() { try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { return 0; } }
function saveBest(v) { try { localStorage.setItem(META.bestKey, String(v)); } catch (_) { } }

/* ============================================================
   MOUNT
============================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- shell: minimalis, tanpa teks tutorial ---------- */
    root.innerHTML = `
<style>
#hole-io-app{--hi-line:#e6e8ee;--hi-ink:#111827;--hi-mut:#6b7280;--hi-acc:#6366f1;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--hi-ink)}
#hole-io-app [hidden]{display:none!important}
#hole-io-app .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
#hole-io-app .game-intro h2{margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em}
#hole-io-app .game-intro p{margin:2px 0 0;font-size:12px;color:var(--hi-mut)}
#hole-io-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--hi-mut);border:1px solid var(--hi-line);border-radius:999px;padding:5px 11px;background:#fff;white-space:nowrap}
#hole-io-app .game-status-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block}
#hole-io-app .game-panel{border:1px solid var(--hi-line);border-radius:16px;background:#fff;padding:10px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
#hole-io-app .hi-hud{display:flex;flex-wrap:wrap;gap:6px;margin:0 2px 9px}
#hole-io-app .hi-chip{display:inline-flex;align-items:baseline;gap:6px;border:1px solid var(--hi-line);background:#fafafa;border-radius:999px;padding:4px 10px;font-size:11.5px;font-weight:600;color:var(--hi-mut)}
#hole-io-app .hi-chip b{color:var(--hi-ink);font-variant-numeric:tabular-nums;font-size:12.5px}
#hole-io-app .hi-chip[data-accent]{border-color:#c7d2fe;background:#eef2ff;color:#4f46e5}
#hole-io-app .hi-chip[data-accent] b{color:#4338ca}
#hole-io-app .hi-wrap{position:relative;width:min(100%,calc((100vh - 260px)*1.5385));min-width:min(100%,300px);aspect-ratio:800/520;margin-inline:auto;-webkit-user-select:none;user-select:none}
#hole-io-app .hi-svg{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;border-radius:12px;background:#fbfbfd;cursor:crosshair}
#hole-io-app .hi-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:7;white-space:nowrap}
#hole-io-app .hi-toast[data-show="1"]{opacity:.92}
#hole-io-app .hi-pad{position:absolute;left:12px;bottom:12px;display:none;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,46px);gap:6px;z-index:5}
@media (pointer:coarse){#hole-io-app .hi-pad{display:grid}}
#hole-io-app .hi-pbtn{border:1px solid var(--hi-line);background:rgba(255,255,255,.92);border-radius:12px;display:grid;place-items:center;color:#374151;touch-action:none;padding:0;cursor:pointer}
#hole-io-app .hi-pbtn:active{background:#eef2ff;border-color:#c7d2fe;color:#4f46e5}
#hole-io-app .hi-pbtn svg{width:20px;height:20px}
#hole-io-app .hi-cheats,#hole-io-app .hi-over{position:absolute;inset:0;display:grid;place-items:center;border-radius:12px;z-index:8}
#hole-io-app .hi-cheats{background:rgba(17,24,39,.18);backdrop-filter:blur(2px)}
#hole-io-app .hi-over{background:rgba(251,251,253,.8);backdrop-filter:blur(3px);z-index:9}
#hole-io-app .hi-card{width:min(300px,92%);background:#fff;border:1px solid var(--hi-line);border-radius:14px;padding:14px 16px;box-shadow:0 12px 32px rgba(16,24,40,.14)}
#hole-io-app .hi-card h3{margin:0 0 8px;font-size:14px;font-weight:800}
#hole-io-app .hi-crow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #f1f2f6;font-size:13px}
#hole-io-app .hi-cfoot{margin-top:10px;text-align:right}
#hole-io-app .hi-switch{width:36px;height:21px;border-radius:999px;border:1px solid var(--hi-line);background:#f3f4f6;position:relative;cursor:pointer;padding:0;transition:background .15s;flex:none}
#hole-io-app .hi-switch::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;border:1px solid #d1d5db;transition:left .15s}
#hole-io-app .hi-switch[aria-pressed="true"]{background:var(--hi-acc);border-color:var(--hi-acc)}
#hole-io-app .hi-switch[aria-pressed="true"]::after{left:17px;border-color:#fff}
#hole-io-app .hi-over-card{text-align:center;padding:20px 26px}
#hole-io-app .hi-over-card h3{font-size:22px;letter-spacing:-.02em;margin-bottom:6px}
#hole-io-app .hi-over-card p{margin:0 0 14px;font-size:13px;color:var(--hi-mut)}
#hole-io-app .hi-win{color:#16a34a}
#hole-io-app .hi-lose{color:#dc2626}
#hole-io-app .game-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
#hole-io-app .game-action-button{border:1px solid var(--hi-line);background:#fff;color:var(--hi-ink);border-radius:999px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer}
#hole-io-app .game-action-button:hover{background:#f6f7f9}
#hole-io-app .hi-mini{padding:4px 12px;font-size:12px}
#hole-io-app .hi-primary{background:var(--hi-acc);border-color:var(--hi-acc);color:#fff}
#hole-io-app .hi-primary:hover{background:#4f46e5}
@media (max-width:560px){
  #hole-io-app .game-intro p{font-size:11px}
  #hole-io-app .hi-chip{padding:3px 8px;font-size:10.5px}
  #hole-io-app .hi-pad{grid-template-columns:repeat(3,42px);grid-template-rows:repeat(3,42px)}
}
</style>
<div class="game-app" id="hole-io-app">
  <div class="game-intro">
    <div><h2>Hole.io</h2><p data-sub>—</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="hi-hud">
      <span class="hi-chip" data-accent>Kamu <b data-hud="you">0</b></span>
      <span class="hi-chip">Peringkat <b data-hud="rank">#1</b></span>
      <span class="hi-chip">Ukuran <b data-hud="size">16</b></span>
      <span class="hi-chip">Wave <b data-hud="wave">1</b></span>
      <span class="hi-chip">Waktu <b data-hud="time">90</b>s</span>
      <span class="hi-chip">Terbaik <b data-hud="best">0</b></span>
    </div>
    <div class="hi-wrap">
      <svg class="hi-svg" data-svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arena Hole.io">
        <defs>
          <pattern id="hi-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0H0V80" fill="none" stroke="#eef0f4" stroke-width="1"/>
          </pattern>
        </defs>
        <g data-g="world">
          <rect x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" fill="#fbfbfd"/>
          <rect x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" fill="url(#hi-grid)"/>
          <rect x="1" y="1" width="${WORLD_W - 2}" height="${WORLD_H - 2}" rx="6" fill="none" stroke="#e6e8ee" stroke-width="2"/>
          <g data-g="city"></g>
          <g data-g="holes"></g>
        </g>
        <g data-g="ui" pointer-events="none"></g>
        <rect data-hit x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="transparent"/>
      </svg>
      <div class="hi-toast" data-toast></div>
      <div class="hi-pad" data-pad>
        <button class="hi-pbtn" type="button" style="grid-area:1/2" data-dir="up" aria-label="Atas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-7 6 7"/></svg></button>
        <button class="hi-pbtn" type="button" style="grid-area:2/1" data-dir="left" aria-label="Kiri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-7 6 7 6"/></svg></button>
        <button class="hi-pbtn" type="button" style="grid-area:2/3" data-dir="right" aria-label="Kanan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l7 6-7 6"/></svg></button>
        <button class="hi-pbtn" type="button" style="grid-area:3/2" data-dir="down" aria-label="Bawah"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 7 6-7"/></svg></button>
      </div>
      <div class="hi-cheats" data-cheats hidden>
        <div class="hi-card">
          <h3>Cheat</h3>
          <div class="hi-crow"><span>Kecepatan ×2</span><button class="hi-switch" type="button" data-act="cheat-toggle" data-key="speed" aria-pressed="false" aria-label="Kecepatan kali dua"></button></div>
          <div class="hi-crow"><span>Lubang raksasa</span><button class="hi-switch" type="button" data-act="cheat-toggle" data-key="size" aria-pressed="false" aria-label="Lubang raksasa"></button></div>
          <div class="hi-crow"><span>Telan apa saja</span><button class="hi-switch" type="button" data-act="cheat-toggle" data-key="any" aria-pressed="false" aria-label="Telan apa saja"></button></div>
          <div class="hi-crow"><span>Bekukan bot</span><button class="hi-switch" type="button" data-act="cheat-toggle" data-key="freeze" aria-pressed="false" aria-label="Bekukan bot"></button></div>
          <div class="hi-crow"><span>Waktu ×0.25</span><button class="hi-switch" type="button" data-act="cheat-toggle" data-key="slow" aria-pressed="false" aria-label="Perlambat waktu"></button></div>
          <div class="hi-crow"><span>Tambah poin</span><button class="game-action-button hi-mini" type="button" data-act="cheat-points">+500</button></div>
          <div class="hi-cfoot"><button class="game-action-button" type="button" data-act="cheat-close">Tutup</button></div>
        </div>
      </div>
      <div class="hi-over" data-over hidden>
        <div class="hi-card hi-over-card">
          <h3 data-over-title class="hi-win">—</h3>
          <p data-over-line>—</p>
          <button class="game-action-button hi-primary" type="button" data-act="restart">Main lagi</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="restart">Ulang</button>
    <button class="game-action-button" type="button" data-act="cheats" data-cheats-btn>Cheat</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const svg = $("[data-svg]");
    const worldG = $('[data-g="world"]');
    const cityG = $('[data-g="city"]');
    const holesG = $('[data-g="holes"]');
    const uiG = $('[data-g="ui"]');
    const hud = {
        you: $('[data-hud="you"]'), rank: $('[data-hud="rank"]'), size: $('[data-hud="size"]'),
        wave: $('[data-hud="wave"]'), time: $('[data-hud="time"]'), best: $('[data-hud="best"]'),
    };
    const subEl = $("[data-sub]"), statusEl = $("[data-status]"), toastEl = $("[data-toast]");
    const padEl = $("[data-pad]"), cheatsEl = $("[data-cheats]"), cheatsBtn = $("[data-cheats-btn]");
    const overEl = $("[data-over]"), overTitle = $("[data-over-title]"), overLine = $("[data-over-line]");

    /* ---------- state lokal (visual & input, tidak dipublish) ---------- */
    let objs = [], builtKey = "", cityNodes = [], fades = [], prevTaken = [];
    let display = [null, null, null, null];
    let cam = { x: 0, y: 0 }, camInit = false;
    let inputs = [null, null, null, null];   // host: input per kursi
    let botCool = [0, 0, 0, 0];              // jeda "mencerna" bot setelah makan
    let cheats = { speed: false, size: false, any: false, freeze: false, slow: false };
    let cheatUsed = false, cheatOpen = false;
    let held = { up: false, down: false, left: false, right: false };
    let pointerTarget = null, dragging = false, lastTargetSent = 0;
    let guestActive = false;                 // host: guest sudah pernah mengirim aksi?
    let raf = null, lastT = 0, pubAcc = 0, dirty = false;
    let prevSeed = null, prevWave = 1, lastOverSeed = null;
    let best = readBest();
    let destroyed = false;
    const offs = [];
    let timers = [];
    const later = (fn, ms) => {
        const tm = setTimeout(() => { timers = timers.filter((x) => x !== tm); fn(); }, ms);
        timers.push(tm);
        return tm;
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
    let toastTimer = null;
    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.dataset.show = "1";
        if (toastTimer) { clearTimeout(toastTimer); timers = timers.filter((x) => x !== toastTimer); }
        toastTimer = later(() => { toastEl.dataset.show = "0"; toastTimer = null; }, 1700);
    }

    const isHost = () => !online || room.isHost;
    const localSeat = () => (state ? state.seats[playerIndex] ?? null : null);

    /* ---------- kota (DOM dibangun sekali per wave, bukan per frame) ---------- */
    function ensureCity() {
        if (!state) return;
        const key = state.seed + ":" + state.wave;
        if (key === builtKey) return;
        builtKey = key;
        const spawns = makeSpawns(rng(state.seed));
        objs = makeCity(rng(waveSeed(state.seed, state.wave)), state.wave, spawns);
        cityG.innerHTML = objs
            .map((o, i) => `<g data-idx="${i}" transform="translate(${o.x},${o.y})">${SHAPES[o.type]}</g>`)
            .join("");
        cityNodes = Array.from(cityG.children);
        fades = objs.map(() => 0);
        prevTaken = objs.map((_, i) => (state.taken[i] ? 1 : 0));
        for (let i = 0; i < objs.length; i++) if (prevTaken[i]) cityNodes[i].style.display = "none";
    }

    /* animasi menyusut saat objek tertelan (murni visual, lokal) */
    function syncTaken(dtMs) {
        if (!state) return;
        const tk = state.taken;
        for (let i = 0; i < objs.length; i++) {
            const taken = tk[i] ? 1 : 0;
            if (taken && !prevTaken[i]) { prevTaken[i] = 1; fades[i] = 260; }
            else if (!taken && prevTaken[i]) {
                prevTaken[i] = 0; fades[i] = 0;
                cityNodes[i].style.display = "";
                cityNodes[i].setAttribute("transform", `translate(${objs[i].x},${objs[i].y})`);
            }
            if (fades[i] > 0) {
                fades[i] = Math.max(0, fades[i] - dtMs);
                const s = fades[i] / 260, n = cityNodes[i];
                if (s <= 0.02) { n.style.display = "none"; fades[i] = 0; }
                else n.setAttribute("transform", `translate(${objs[i].x},${objs[i].y}) scale(${s.toFixed(3)})`);
            }
        }
    }

    /* ---------- kamera & interpolasi ---------- */
    function tickVisual(dt) {
        if (!state) return;
        const guest = online && !room.isHost;
        for (let i = 0; i < state.holes.length; i++) {
            const h = state.holes[i];
            if (!display[i] || !camInit) { display[i] = { x: h.x, y: h.y }; continue; }
            const k = guest ? 1 - Math.exp(-dt * 14) : 1; // client menghaluskan posisi dari host
            display[i].x += (h.x - display[i].x) * k;
            display[i].y += (h.y - display[i].y) * k;
        }
        const ls = localSeat();
        const f = ls != null && display[ls] ? display[ls] : { x: WORLD_W / 2, y: WORLD_H / 2 };
        const tx = clamp(f.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
        const ty = clamp(f.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
        if (!camInit) { cam.x = tx; cam.y = ty; camInit = true; }
        else {
            const k = 1 - Math.exp(-dt * 7);
            cam.x += (tx - cam.x) * k;
            cam.y += (ty - cam.y) * k;
        }
        worldG.setAttribute("transform", `translate(${(-cam.x).toFixed(1)} ${(-cam.y).toFixed(1)})`);
    }

    /* ---------- render ---------- */
    function renderHoles() {
        if (!state) { holesG.innerHTML = ""; return; }
        const ls = localSeat();
        let s = "";
        for (let i = 0; i < state.holes.length; i++) {
            const h = state.holes[i], p = display[i] || h, col = SEAT_COLORS[i];
            const frozen = state.phase === "play" && state.headStart.ms > 0 && i !== state.headStart.first;
            const x = p.x.toFixed(1), y = p.y.toFixed(1);
            s += `<circle cx="${x}" cy="${y}" r="${(h.r * 1.16).toFixed(1)}" fill="#0f172a" opacity="0.10"/>`;
            s += `<circle cx="${x}" cy="${y}" r="${h.r.toFixed(1)}" fill="#0a0a12" stroke="${col}" stroke-width="${i === ls ? 4 : 2.5}"${frozen ? ' stroke-dasharray="6 5" opacity="0.55"' : ""}/>`;
            if (frozen) {
                s += `<g fill="#ffffff" opacity="0.85"><rect x="${(p.x - 5).toFixed(1)}" y="${(p.y - 7).toFixed(1)}" width="3.6" height="14" rx="1.2"/><rect x="${(p.x + 1.4).toFixed(1)}" y="${(p.y - 7).toFixed(1)}" width="3.6" height="14" rx="1.2"/></g>`;
            }
            if (i === ls && !frozen) {
                s += `<text x="${x}" y="${(p.y - h.r - 9).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${col}">KAMU</text>`;
            }
        }
        const inp = ls != null ? inputs[ls] : null;
        const tgt = isHost() ? (inp && inp.hasTarget ? { x: inp.tx, y: inp.ty } : null) : pointerTarget;
        if (tgt && state.phase === "play") {
            const col = SEAT_COLORS[ls ?? 0];
            s += `<g opacity="0.75"><circle cx="${tgt.x.toFixed(1)}" cy="${tgt.y.toFixed(1)}" r="7" fill="none" stroke="${col}" stroke-width="1.5"/><circle cx="${tgt.x.toFixed(1)}" cy="${tgt.y.toFixed(1)}" r="1.6" fill="${col}"/></g>`;
        }
        holesG.innerHTML = s;
    }

    function renderMinimap() {
        if (!state) { uiG.innerHTML = ""; return; }
        const sc = MM_W / WORLD_W, ls = localSeat();
        let s = `<g transform="translate(${VIEW_W - MM_W - 10} ${VIEW_H - MM_H - 10})">`;
        s += `<rect width="${MM_W}" height="${MM_H}" rx="7" fill="#ffffff" opacity="0.88" stroke="#e6e8ee"/>`;
        for (let i = 0; i < state.holes.length; i++) {
            const p = display[i] || state.holes[i];
            s += `<circle cx="${(p.x * sc).toFixed(1)}" cy="${(p.y * sc).toFixed(1)}" r="${i === ls ? 3 : 2.2}" fill="${SEAT_COLORS[i]}"/>`;
        }
        s += `<rect x="${(cam.x * sc).toFixed(1)}" y="${(cam.y * sc).toFixed(1)}" width="${(VIEW_W * sc).toFixed(1)}" height="${(VIEW_H * sc).toFixed(1)}" rx="2" fill="none" stroke="#94a3b8" stroke-width="1"/>`;
        s += "</g>";
        uiG.innerHTML = s;
    }

    function noteState() {
        if (!state) return;
        if (state.seed !== prevSeed) {
            prevSeed = state.seed;
            prevWave = state.wave;
            camInit = false;
            pointerTarget = null;
            const ls = localSeat(), f = state.headStart.first;
            showToast(ls === f ? "Kamu jalan duluan!" : SEAT_NAMES[f] + " jalan duluan");
        } else if (state.wave !== prevWave) {
            prevWave = state.wave;
            showToast("Kota habis! Wave " + state.wave + " · +15s");
        }
    }

    function renderOver() {
        if (!state || state.phase !== "over" || localSeat() == null) { overEl.hidden = true; return; }
        const ls = localSeat(), me = state.holes[ls];
        const res = state.result || makeResult(state);
        const top = state.holes[res.winner].score;
        const win = me.score >= top; // seri = menang
        const rank = res.ranking.indexOf(ls) + 1;
        overTitle.textContent = win ? "Kamu menang!" : "Kamu kalah";
        overTitle.className = win ? "hi-win" : "hi-lose";
        overLine.textContent =
            `Skor ${me.score} · Tertinggi ${top} · Wave ${state.wave} · Peringkat #${rank}/4` +
            (cheatUsed && !online ? " · cheat" : "");
        overEl.hidden = false;
        if (lastOverSeed !== state.seed) {
            lastOverSeed = state.seed;
            if (me.score > best) { best = me.score; saveBest(best); }
            hud.best.textContent = best;
        }
    }

    function renderHud() {
        const ls = localSeat();
        if (!state || ls == null) {
            hud.you.textContent = "–"; hud.rank.textContent = "–"; hud.size.textContent = "–";
            hud.wave.textContent = "–"; hud.time.textContent = "–"; hud.best.textContent = best;
            subEl.textContent = online ? "Mode room · menunggu host…" : playerName + " · vs 3 bot";
            statusEl.textContent = online ? "Menghubungkan…" : "Siap";
            return;
        }
        const me = state.holes[ls];
        hud.you.textContent = me.score;
        hud.rank.textContent = "#" + (1 + state.holes.filter((h) => h.score > me.score).length);
        hud.size.textContent = Math.round(me.r);
        hud.wave.textContent = state.wave;
        hud.time.textContent = Math.ceil(state.timeLeft / 1000);
        hud.best.textContent = best;
        subEl.textContent = (online ? "Mode room" : "Solo vs 3 bot") + " · " + playerName + " · lubang " + SEAT_NAMES[ls].toLowerCase();
        let st;
        if (state.phase === "over") st = "Selesai";
        else if (cheatOpen) st = "Jeda · cheat";
        else if (state.headStart.ms > 0) st = (state.headStart.first === ls ? "Kamu" : SEAT_NAMES[state.headStart.first]) + " jalan duluan";
        else st = "Bermain";
        statusEl.textContent = st;
    }

    function render() {
        ensureCity();
        noteState();
        renderHoles();
        renderMinimap();
        renderOver();
        renderHud();
    }

    function publish() {
        render();
        // Hanya host yang menulis state kanonik ke Firebase (dithrottle di loop).
        if (online && room.isHost && state) room.publishState(state).catch(console.warn);
    }

    /* ---------- alur permainan (host / solo) ---------- */
    function newGame() {
        const seed = (Math.random() * 4294967296) >>> 0;
        state = newGameState(seed, online); // seed baru => spawn, kursi & giliran pertama diacak ulang
        inputs = [null, null, null, null];
        botCool = [0, 0, 0, 0];
        for (const k in cheats) cheats[k] = false;
        cheatUsed = false; cheatOpen = false; cheatsEl.hidden = true;
        syncCheatUI();
        camInit = false; pointerTarget = null; lastOverSeed = null;
        publish();
    }

    function stepSim(dt) {
        const st = state;
        if (st.headStart.ms > 0) st.headStart.ms = Math.max(0, st.headStart.ms - dt * 1000);
        st.timeLeft -= dt * 1000 * (cheats.slow ? 0.25 : 1);
        if (st.timeLeft <= 0) {
            st.timeLeft = 0;
            st.phase = "over";
            st.result = makeResult(st);
            dirty = true;
            return;
        }
        const humans = online ? (guestActive ? [st.seats[0], st.seats[1]] : [st.seats[0]]) : [0];
        const ls = localSeat();

        for (let i = 0; i < 4; i++) {
            const h = st.holes[i];
            if (st.headStart.ms > 0 && i !== st.headStart.first) continue; // belum boleh jalan
            if (humans.includes(i)) {
                const inp = inputs[i];
                if (!inp) continue;
                const sp = PLAYER_SPEED * (cheats.speed && i === ls ? 2 : 1);
                if (inp.dx || inp.dy) {
                    const d = Math.hypot(inp.dx, inp.dy);
                    h.x += (inp.dx / d) * sp * dt;
                    h.y += (inp.dy / d) * sp * dt;
                } else if (inp.hasTarget) {
                    moveToward(h, inp.tx, inp.ty, sp, dt);
                }
            } else {
                if (cheats.freeze) continue;
                botCool[i] = Math.max(0, botCool[i] - dt);
                const tgt = nearestEdible(objs, st.taken, h) || nearestAny(objs, st.taken, h);
                if (tgt) {
                    const wx = tgt.x + Math.sin(st.timeLeft / 650 + i * 2.1) * 8;
                    const wy = tgt.y + Math.cos(st.timeLeft / 720 + i * 1.7) * 8;
                    moveToward(h, wx, wy, BOT_SPEED[i] * (botCool[i] > 0 ? 0.35 : 1), dt);
                }
            }
            clampHole(h);
        }

        // urutan makan diacak tiap frame agar tidak ada bias giliran
        const order = Math.floor(Math.random() * 4);
        let lastEater = -1;
        for (let k = 0; k < 4; k++) {
            const i = (order + k) % 4;
            if (st.headStart.ms > 0 && i !== st.headStart.first) continue;
            const n = eat(objs, st.taken, st.holes[i], cheats.any && i === ls);
            if (n > 0) {
                lastEater = i;
                if (!humans.includes(i)) botCool[i] = 0.45 + n * 0.12;
            }
        }
        if (cheats.size && ls != null) st.holes[ls].r = Math.max(st.holes[ls].r, 120);

        // kota habis => wave selesai, bonus, lalu kota baru yang lebih padat
        if (st.taken.every((v) => v)) {
            if (lastEater >= 0) {
                const h = st.holes[lastEater];
                h.score += WAVE_BONUS_SCORE;
                h.r = radiusFor(h.score);
            }
            st.timeLeft = Math.min(st.timeLeft + WAVE_BONUS_MS, 120000);
            st.wave++;
            st.taken = makeCity(rng(waveSeed(st.seed, st.wave)), st.wave, makeSpawns(rng(st.seed))).map(() => 0);
            ensureCity();
            dirty = true;
        }
    }

    /* ---------- aksi (template) ---------- */
    function applyAction(action, actor) {
        if (!action || typeof action !== "object" || !state) return;
        if (actor !== 0 && actor !== 1) return;
        if (state.phase !== "play" && action.t !== "restart" && action.t !== "cheat") return;
        const seat = state.seats[actor];
        if (seat == null) return;
        switch (action.t) {
            case "input": {
                const inp = inputs[seat] || (inputs[seat] = { dx: 0, dy: 0, tx: 0, ty: 0, hasTarget: false });
                inp.dx = clamp(Number(action.dx) || 0, -1, 1);
                inp.dy = clamp(Number(action.dy) || 0, -1, 1);
                if (inp.dx || inp.dy) inp.hasTarget = false;
                break;
            }
            case "target": {
                const inp = inputs[seat] || (inputs[seat] = { dx: 0, dy: 0, tx: 0, ty: 0, hasTarget: false });
                if (action.x == null) { inp.hasTarget = false; break; }
                const x = Number(action.x), y = Number(action.y);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    inp.tx = clamp(x, 0, WORLD_W);
                    inp.ty = clamp(y, 0, WORLD_H);
                    inp.hasTarget = true;
                    inp.dx = 0; inp.dy = 0;
                }
                break;
            }
            case "restart":
                newGame();
                break;
            case "cheat":
                if (!online) applyCheat(action);
                break;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    function applyCheat(a) {
        if (online || !state) return;
        const ls = localSeat();
        if (a.op === "toggle" && Object.prototype.hasOwnProperty.call(cheats, a.key)) {
            cheats[a.key] = !cheats[a.key];
            if (cheats[a.key]) cheatUsed = true;
            syncCheatUI();
        } else if (a.op === "points" && ls != null) {
            const h = state.holes[ls];
            h.score += 500;
            h.r = radiusFor(h.score);
            cheatUsed = true;
        }
    }
    function syncCheatUI() {
        cheatsEl.querySelectorAll("[data-key]").forEach((b) => {
            b.setAttribute("aria-pressed", cheats[b.dataset.key] ? "true" : "false");
        });
    }

    /* ---------- klik (template) ---------- */
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        if (event.target === cheatsEl) { cheatOpen = false; cheatsEl.hidden = true; return; }
        const b = event.target.closest("[data-act]");
        if (!b) return;
        const a = b.dataset.act;
        if (a === "restart") submitAction({ t: "restart" });
        else if (a === "cheats") {
            if (online) return; // cheat hanya untuk mode solo vs bot
            cheatOpen = !cheatOpen;
            cheatsEl.hidden = !cheatOpen;
        }
        else if (a === "cheat-toggle") submitAction({ t: "cheat", op: "toggle", key: b.dataset.key });
        else if (a === "cheat-points") submitAction({ t: "cheat", op: "points" });
        else if (a === "cheat-close") { cheatOpen = false; cheatsEl.hidden = true; }
    }

    /* ---------- keyboard (desktop) ---------- */
    function pushKeys() {
        const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        const dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
        if (dx || dy) pointerTarget = null;
        submitAction({ t: "input", dx, dy });
    }
    function onKeyDown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const dir = KEYMAP[e.code];
        if (!dir) return;
        e.preventDefault();
        if (!held[dir]) { held[dir] = true; pushKeys(); }
    }
    function onKeyUp(e) {
        const dir = KEYMAP[e.code];
        if (!dir) return;
        if (held[dir]) { held[dir] = false; pushKeys(); }
    }

    /* ---------- mouse / sentuh: klik-tahan untuk mengarahkan ---------- */
    function toWorld(e) {
        const r = svg.getBoundingClientRect();
        const s = Math.min(r.width / VIEW_W, r.height / VIEW_H);
        const ox = (r.width - VIEW_W * s) / 2, oy = (r.height - VIEW_H * s) / 2;
        const vx = (e.clientX - r.left - ox) / s, vy = (e.clientY - r.top - oy) / s;
        return { x: clamp(vx + cam.x, 0, WORLD_W), y: clamp(vy + cam.y, 0, WORLD_H) };
    }
    function sendTarget(w) {
        pointerTarget = w;
        const now = performance.now();
        if (now - lastTargetSent >= 70) { // throttle agar hemat bandwidth di mode room
            lastTargetSent = now;
            submitAction({ t: "target", x: w.x, y: w.y });
        }
    }
    svg.addEventListener("pointerdown", (e) => {
        if (!state || state.phase !== "play" || e.button > 0) return;
        e.preventDefault();
        dragging = true;
        lastTargetSent = 0;
        svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
        sendTarget(toWorld(e));
    });
    svg.addEventListener("pointermove", (e) => {
        if (dragging && state && state.phase === "play") sendTarget(toWorld(e));
    });
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        pointerTarget = null;
        submitAction({ t: "target", x: null });
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);

    /* ---------- d-pad virtual (muncul otomatis di perangkat sentuh) ---------- */
    padEl.querySelectorAll("[data-dir]").forEach((b) => {
        const dir = b.dataset.dir;
        b.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            b.setPointerCapture && b.setPointerCapture(e.pointerId);
            if (!held[dir]) { held[dir] = true; pushKeys(); }
        });
        const off = () => { if (held[dir]) { held[dir] = false; pushKeys(); } };
        b.addEventListener("pointerup", off);
        b.addEventListener("pointercancel", off);
    });

    /* ---------- loop utama ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (destroyed) return;
        if (!lastT) { lastT = t; return; }
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (state) {
            ensureCity();
            if (isHost() && state.phase === "play" && !cheatOpen) {
                stepSim(dt);
                if (online) {
                    pubAcc += dt;
                    if (dirty || pubAcc >= 0.12) { // publish ~8x/detik + langsung saat event penting
                        pubAcc = 0; dirty = false;
                        tickVisual(dt);
                        syncTaken(dt * 1000);
                        publish();
                        return;
                    }
                }
            }
            tickVisual(dt);
            syncTaken(dt * 1000);
        }
        render();
    }

    /* ---------- init & wiring (template) ---------- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    if (online) {
        cheatsBtn.hidden = true;
        const offRoom = room.onRoom && room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            newGame(); // state awal serializable + publish
            const offAct = room.onAction && room.onAction((action) => { guestActive = true; applyAction(action, 1); });
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = room.onState && room.onState((nextState) => { state = normState(nextState); render(); });
            if (typeof offState === "function") offs.push(offState);
        }
    } else {
        newGame(); // langsung main — tanpa overlay tutorial
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) { cancelAnimationFrame(raf); raf = null; }
            clearTimers();
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            root.removeEventListener("click", handleClick);
            offs.forEach((f) => { try { f(); } catch (_) { } });
            offs.length = 0;
        },
    };
}