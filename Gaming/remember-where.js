/* ==== GAME: remember-where.js ==== */
/*
  Remember Where — puzzle memori posisi + mekanik drop objek.
  - Fase "hafalkan": K bentuk unik muncul di sel acak selama (2000 + 400*K) ms.
  - Fase "letakkan": bentuk pindah ke baki (urutan acak). Seret / pilih lalu
    letakkan tiap bentuk ke sel asalnya. Benar +10, salah -1 nyawa (3 nyawa
    untuk seluruh game). 6 ronde: 1-3 grid 4x4, 4-6 grid 5x5, K = min(2+ronde, 6).
  - Mode: solo, vs bot (giliran bergantian, pembuka ronde diacak),
    2 pemain online (posisi P1/P2 diacak, host-authoritative).
  - Level selalu solvable: bentuk unik + sel unik + validator + fallback.
  - Cheat overlay (lokal), pad virtual (mobile), keyboard + drag&drop (desktop).
  - Setelah menyimpan file ini, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "remember-where", // harus sama dengan nama file tanpa .js
    name: "Remember Where",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Hafalkan posisi bentuk, lalu seret & letakkan tiap bentuk kembali ke sel asalnya. Solo, vs bot, atau 2 pemain.",
    art:
        '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="4" y="4" width="40" height="40" rx="4" stroke-opacity=".4" stroke-width="2"/>' +
        '<path d="M17.33 4v40M30.66 4v40M4 24h40" stroke-opacity=".22" stroke-width="1.6"/>' +
        '<circle cx="10.66" cy="14" r="4.4" fill="#ef4444" stroke="none"/>' +
        '<rect x="19.6" y="9.6" width="8.8" height="8.8" rx="1.6" fill="#f59e0b" stroke="none"/>' +
        '<polygon points="37.33,9.6 42.2,18.4 32.5,18.4" fill="#10b981" stroke="none"/>' +
        '<path d="M24 28v8m0 0l-3.2-3.2M24 36l3.2-3.2" stroke="currentColor" stroke-width="2.4"/>' +
        '<text x="10.66" y="37.4" font-size="9" font-family="inherit" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">?</text>' +
        '<text x="37.33" y="37.4" font-size="9" font-family="inherit" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">?</text>' +
        "</svg>",
    bg: ["#ffe4e6", "#fecdd3"],
    bestKey: "rememberWhereBest",
};

/* ================= pure helpers (module scope) ================= */

const SHAPES = ["circle", "square", "triangle", "diamond", "hexagon", "ring"];
const COLORS = ["#f87171", "#fbbf24", "#34d399", "#38bdf8", "#a78bfa", "#f472b6"];
const TOTAL_ROUNDS = 6;

const memorizeMs = (k) => 2000 + 400 * (k || 0);

/* RNG ber-seed agar ronde bisa direproduksi & dibagikan lewat state */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

/* Validator: tiap bentuk unik, tiap sel unik & dalam grid, tray = permutasi id.
   Bentuk unik => pemetaan bentuk->sel tunggal => solusi selalu ada & tak ambigu. */
function isSolvable(r) {
    const n = r.grid * r.grid;
    if (!(r.k >= 1 && r.k <= Math.min(n, SHAPES.length))) return false;
    const cells = new Set();
    const ids = new Set();
    for (const o of r.objects) {
        if (!Number.isInteger(o.cell) || o.cell < 0 || o.cell >= n) return false;
        if (cells.has(o.cell) || ids.has(o.id)) return false;
        cells.add(o.cell);
        ids.add(o.id);
    }
    return (
        r.objects.length === r.k &&
        r.tray.length === r.k &&
        r.tray.every((id) => ids.has(id))
    );
}

/* Generator level acak yang dijamin bisa diselesaikan:
   coba beberapa seed turunan, validasi, fallback deterministik bila perlu. */
function genRound(seed, round) {
    const size = round <= 3 ? 4 : 5;
    const k = Math.min(2 + round, 6, SHAPES.length, size * size);
    for (let a = 0; a < 8; a++) {
        const rnd = mulberry32((seed + a * 0x9e3779b9) >>> 0);
        const cells = [];
        for (let i = 0; i < size * size; i++) cells.push(i);
        for (let i = 0; i < k; i++) {
            const j = i + Math.floor(rnd() * (cells.length - i));
            const t = cells[i];
            cells[i] = cells[j];
            cells[j] = t;
        }
        const shapes = shuffle(SHAPES.slice(), rnd);
        const objects = shapes.slice(0, k).map((s, j) => ({
            id: s,
            shape: s,
            color: COLORS[SHAPES.indexOf(s)],
            cell: cells[j],
        }));
        const tray = shuffle(objects.map((o) => o.id), rnd);
        const r = { grid: size, k, objects, tray };
        if (isSolvable(r)) return r;
    }
    /* fallback deterministik — dijamin valid */
    const objects = SHAPES.slice(0, k).map((s, j) => ({
        id: s, shape: s, color: COLORS[j], cell: j,
    }));
    return { grid: size, k, objects, tray: objects.map((o) => o.id).reverse() };
}

/* ---------- SVG murni (tanpa emoji / aset) ---------- */
function shapeSvg(shape, color) {
    switch (shape) {
        case "circle": return '<circle cx="17" cy="17" r="11" fill="' + color + '"/>';
        case "square": return '<rect x="7" y="7" width="20" height="20" rx="4" fill="' + color + '"/>';
        case "triangle": return '<polygon points="17,6 28,28 6,28" fill="' + color + '"/>';
        case "diamond": return '<polygon points="17,5 28,17 17,29 6,17" fill="' + color + '"/>';
        case "hexagon": return '<polygon points="17,5 27.5,11 27.5,23 17,29 6.5,23 6.5,11" fill="' + color + '"/>';
        case "ring": return '<circle cx="17" cy="17" r="9.5" fill="none" stroke="' + color + '" stroke-width="7"/>';
    }
    return '<rect x="7" y="7" width="20" height="20" rx="4" fill="' + color + '"/>';
}
const objSvg = (shape, color) =>
    '<svg viewBox="0 0 34 34" aria-hidden="true">' + shapeSvg(shape, color) + "</svg>";

const heartSvg = (on) =>
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="' + (on ? "#ef4444" : "none") +
    '" stroke="' + (on ? "#ef4444" : "#d6d3d1") +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

function heartsHtml(lives) {
    const n = Math.max(3, lives);
    let h = "";
    for (let i = 0; i < n; i++) h += heartSvg(i < lives);
    return h;
}

/* ============================ mount ============================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- UI: gaya minimalis ter-scope .rw-app ---------- */
    root.innerHTML = `
<style>
.rw-app{--rw-bg:#fafaf9;--rw-card:#fff;--rw-line:#e7e5e4;--rw-ink:#1c1917;--rw-mut:#78716c;--rw-acc:#e11d48;--rw-ok:#059669;--rw-bad:#dc2626;--rw-p1:#4f46e5;--rw-p2:#e11d48;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--rw-ink);max-width:600px;margin:0 auto;-webkit-tap-highlight-color:transparent;user-select:none}
.rw-app *{box-sizing:border-box}
.rw-app [hidden]{display:none!important}
.rw-app .game-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.rw-app .game-intro h2{margin:0 0 2px;font-size:18px;letter-spacing:-.01em}
.rw-app .game-intro p{margin:0;font-size:13px;color:var(--rw-mut)}
.rw-panel{position:relative;background:var(--rw-bg);border:1px solid var(--rw-line);border-radius:16px;padding:14px 14px 16px}
.rw-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.rw-stat{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--rw-mut);background:var(--rw-card);border:1px solid var(--rw-line);border-radius:999px;padding:4px 10px}
.rw-stat b{color:var(--rw-ink);font-size:12.5px}
.rw-stat.rw-active{border-color:var(--rw-ink);color:var(--rw-ink)}
.rw-lives{display:inline-flex;gap:2px;align-items:center}
.rw-badge{font-size:10px;font-weight:800;letter-spacing:.08em;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:3px 8px}
.rw-stage{display:flex;flex-direction:column;align-items:center;gap:12px;padding:6px 0 2px;min-height:360px}
.rw-phase{font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--rw-mut);text-align:center}
.rw-timer{width:min(100%,380px);height:4px;border-radius:999px;background:var(--rw-line);overflow:hidden;transition:opacity .25s}
.rw-timer.rw-off{opacity:0}
.rw-timer-fill{height:100%;width:100%;background:var(--rw-acc);border-radius:999px}
.rw-grid{display:grid;grid-template-columns:repeat(var(--rw-cols,4),1fr);gap:8px;width:min(100%,calc(var(--rw-cols,4)*76px))}
.rw-cell{position:relative;aspect-ratio:1/1;padding:0;border-radius:12px;background:var(--rw-card);border:1px solid var(--rw-line);display:grid;place-items:center;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;touch-action:manipulation}
.rw-cell:hover{border-color:#d6d3d1;box-shadow:0 1px 4px #0000000d}
.rw-cell svg{width:62%;height:62%;pointer-events:none}
.rw-cell.rw-cursor{outline:2px dashed var(--rw-acc);outline-offset:2px}
.rw-cell.rw-found{background:#ecfdf5;border-color:#a7f3d0}
.rw-cell.rw-found::after{content:"";position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:var(--rw-ok)}
.rw-cell[data-seat="0"]::after{background:var(--rw-p1)}
.rw-cell[data-seat="1"]::after{background:var(--rw-p2)}
.rw-cell.rw-ghost{border-style:dashed;border-color:#fda4af}
.rw-cell.rw-ghost svg{opacity:.3}
.rw-cell.rw-reveal{border-style:dashed}
.rw-cell.rw-reveal svg{opacity:.45}
.rw-cell.rw-over{border-color:var(--rw-acc);box-shadow:0 0 0 3px #e11d4822}
.rw-cell.rw-miss{animation:rw-shake .45s;background:#fef2f2;border-color:#fecaca}
.rw-cell.rw-pop svg{animation:rw-pop .4s}
.rw-grid.rw-flash{animation:rw-flash .7s}
.rw-tray-wrap{width:100%;display:flex;justify-content:center;min-height:60px}
.rw-tray{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-content:center}
.rw-tray.rw-dim{opacity:.45;pointer-events:none}
.rw-tray.rw-pulse{animation:rw-pulse .5s}
.rw-tray-hint{font-size:12px;color:var(--rw-mut);align-self:center;text-align:center;padding:8px}
.rw-obj{position:relative;width:54px;height:54px;border-radius:12px;background:var(--rw-card);border:1px solid var(--rw-line);display:grid;place-items:center;cursor:grab;padding:0;transition:border-color .15s,box-shadow .15s;touch-action:manipulation}
.rw-obj svg{width:60%;height:60%;pointer-events:none}
.rw-obj:hover{border-color:#d6d3d1}
.rw-obj.rw-sel{border-color:var(--rw-acc);box-shadow:0 0 0 3px #e11d4822}
.rw-obj.rw-dragging{opacity:.5}
.rw-key{position:absolute;top:3px;left:5px;font-size:9.5px;font-weight:700;color:var(--rw-mut)}
.rw-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:var(--rw-ink);color:#fafaf9;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:999px;opacity:0;pointer-events:none;z-index:7;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.rw-toast.rw-show{animation:rw-toast 2.2s ease forwards}
.rw-overlay{position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:#fafaf9eb;backdrop-filter:blur(3px);border-radius:16px;padding:16px;overflow:auto}
.rw-card{background:var(--rw-card);border:1px solid var(--rw-line);border-radius:16px;padding:22px;max-width:440px;width:100%;box-shadow:0 8px 30px #0000000f}
.rw-ov-title{margin:0 0 8px;font-size:20px;letter-spacing:-.01em}
.rw-ov-title.rw-win{color:var(--rw-ok)}
.rw-ov-title.rw-lose{color:var(--rw-bad)}
.rw-ov-sub{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:var(--rw-mut)}
.rw-howto{margin:0 0 14px;padding:0;list-style:none;display:grid;gap:8px;font-size:13px;line-height:1.5}
.rw-howto li{display:flex;gap:8px}
.rw-howto li>b{flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:var(--rw-ink);color:#fff;font-size:11px;display:grid;place-items:center;margin-top:1px}
.rw-btnrow{display:flex;flex-wrap:wrap;gap:8px}
.rw-btn{appearance:none;border:1px solid var(--rw-line);background:var(--rw-card);color:var(--rw-ink);font:inherit;font-size:13.5px;font-weight:600;border-radius:10px;padding:9px 16px;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;touch-action:manipulation}
.rw-btn:hover{border-color:#d6d3d1;background:#fafaf9}
.rw-btn:active{transform:scale(.98)}
.rw-btn:disabled{opacity:.45;cursor:default}
.rw-btn.rw-primary{background:var(--rw-ink);border-color:var(--rw-ink);color:#fafaf9}
.rw-btn.rw-primary:hover{background:#292524}
.rw-btn:focus-visible,.rw-cell:focus-visible,.rw-obj:focus-visible,.rw-pad:focus-visible,.rw-switch:focus-visible{outline:2px solid var(--rw-acc);outline-offset:2px}
.rw-help{max-height:100%;overflow:auto}
.rw-help h3{margin:14px 0 6px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--rw-mut)}
.rw-keys-table{width:100%;border-collapse:collapse;font-size:12.5px}
.rw-keys-table td{padding:4px 6px;border-bottom:1px solid var(--rw-line);vertical-align:top;color:var(--rw-mut)}
.rw-keys-table td:first-child{white-space:nowrap;font-weight:700;color:var(--rw-ink)}
.rw-app kbd{font-family:inherit;font-size:11px;background:#f5f5f4;border:1px solid var(--rw-line);border-bottom-width:2px;border-radius:5px;padding:1px 5px}
.rw-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--rw-line)}
.rw-cheat-row b{display:block;font-size:13.5px}
.rw-cheat-row small{color:var(--rw-mut);font-size:12px}
.rw-switch{flex:0 0 auto;width:40px;height:22px;border-radius:999px;background:var(--rw-line);border:none;position:relative;cursor:pointer;transition:background .15s;padding:0}
.rw-switch i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px #0003}
.rw-switch[aria-checked="true"]{background:var(--rw-ok)}
.rw-switch[aria-checked="true"] i{left:21px}
.rw-note{font-size:11.5px;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:7px 10px;margin:12px 0 0}
.rw-vpad{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:12px;padding:10px 12px;background:var(--rw-card);border:1px solid var(--rw-line);border-radius:14px}
.rw-dpad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px);gap:4px}
.rw-pad{appearance:none;border:1px solid var(--rw-line);background:var(--rw-bg);border-radius:10px;display:grid;place-items:center;cursor:pointer;color:var(--rw-ink);padding:0;touch-action:manipulation}
.rw-pad:active{background:#f5f5f4;transform:scale(.96)}
.rw-pad:disabled{opacity:.4;cursor:default}
.rw-pad svg{width:20px;height:20px}
.rw-pad-up{grid-area:1/2}.rw-pad-left{grid-area:2/1}.rw-pad-right{grid-area:2/3}.rw-pad-down{grid-area:3/2}
.rw-vactions{display:flex;flex-direction:column;gap:6px;flex:1;max-width:200px}
.rw-vactions .rw-btn{width:100%}
.rw-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.rw-hintline{margin-top:10px;font-size:11.5px;color:var(--rw-mut);text-align:center;line-height:1.6}
.rw-hint-touch{display:none}
@media (pointer:coarse){.rw-hint-desktop{display:none}.rw-hint-touch{display:block}}
@media (max-width:480px){.rw-panel{padding:10px}.rw-obj{width:48px;height:48px}.rw-card{padding:16px}.rw-stage{min-height:320px}}
@keyframes rw-pop{0%{transform:scale(.5)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes rw-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@keyframes rw-flash{30%{box-shadow:0 0 0 6px #05966922;border-radius:14px}}
@keyframes rw-toast{0%{opacity:0;transform:translate(-50%,-6px)}12%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-4px)}}
@keyframes rw-pulse{30%{transform:scale(1.04)}}
@media (prefers-reduced-motion:reduce){.rw-app *{animation:none!important;transition:none!important}}
</style>
<div class="game-app rw-app">
  <div class="game-intro">
    <div><h2>Remember Where</h2><p>Hafalkan posisi bentuk, lalu letakkan kembali tiap bentuk ke sel asalnya.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>

  <section class="game-panel rw-panel" data-board>
    <div class="rw-hud">
      <span class="rw-stat">Ronde <b data-hud="round">1/6</b></span>
      <span class="rw-stat">Bentuk <b data-hud="found">0/0</b></span>
      <span class="rw-stat">Nyawa <span class="rw-lives" data-hud="lives"></span></span>
      <span data-hud="scores"></span>
      <span class="rw-stat" data-hud="bestwrap">Terbaik <b data-hud="best">0</b></span>
      <span class="rw-badge" data-hud="cheatbadge" hidden>CHEAT</span>
    </div>

    <div class="rw-stage">
      <div class="rw-phase" data-elt="phase" aria-live="polite">Bersiap</div>
      <div class="rw-timer rw-off" data-elt="timer"><div class="rw-timer-fill" data-elt="fill"></div></div>
      <div class="rw-grid" data-elt="grid" aria-label="Grid memori"></div>
      <div class="rw-tray-wrap">
        <div class="rw-tray" data-elt="tray" hidden></div>
        <div class="rw-tray-hint" data-elt="trayhint">Baki bentuk muncul saat fase meletakkan</div>
      </div>
    </div>

    <div class="rw-toast" data-elt="toast" aria-live="polite"></div>

    <div class="rw-overlay" data-ov="start">
      <div class="rw-card">
        <h2 class="rw-ov-title">Remember Where</h2>
        <p class="rw-ov-sub">Bentuk muncul sebentar di grid, lalu tersembunyi dan pindah ke baki. Tugasmu: mengembalikan setiap bentuk ke sel tempat ia muncul tadi.</p>
        <ol class="rw-howto">
          <li><b>1</b><span>Hafalkan posisi &amp; jenis tiap bentuk sebelum bar waktu habis.</span></li>
          <li><b>2</b><span>Seret bentuk dari baki ke selnya — atau klik bentuk lalu klik sel.</span></li>
          <li><b>3</b><span>Benar +10 poin. Salah −1 nyawa (3 nyawa untuk seluruh game). Tuntaskan 6 ronde!</span></li>
        </ol>
        <div data-start-local>
          <div class="rw-btnrow">
            <button class="rw-btn rw-primary" type="button" data-start="solo">Main solo</button>
            <button class="rw-btn" type="button" data-start="bot">Lawan bot</button>
            <button class="rw-btn" type="button" data-help>Cara main</button>
          </div>
          <p class="rw-hintline" style="text-align:left">Lawan bot: giliran bergantian, yang jalan duluan tiap ronde diacak.</p>
        </div>
        <div data-start-host hidden>
          <div class="rw-btnrow">
            <button class="rw-btn rw-primary" type="button" data-start="versus">Mulai 2 pemain</button>
            <button class="rw-btn" type="button" data-help>Cara main</button>
          </div>
          <p class="rw-hintline" style="text-align:left">Posisi pemain (P1/P2) diacak saat mulai. Giliran pertama tiap ronde juga acak.</p>
        </div>
        <div data-start-guest hidden>
          <p class="rw-ov-sub" style="margin:0">Menunggu host memulai permainan…</p>
        </div>
      </div>
    </div>

    <div class="rw-overlay" data-ov="help" hidden>
      <div class="rw-card rw-help">
        <h2 class="rw-ov-title">Cara main</h2>
        <ol class="rw-howto">
          <li><b>1</b><span><strong>Hafalkan.</strong> Sejumlah bentuk unik muncul di sel acak selama 2000 + 400×jumlah bentuk milidetik (bar waktu menyusut).</span></li>
          <li><b>2</b><span><strong>Bentuk tersembunyi.</strong> Semua bentuk pindah ke baki di bawah grid dalam urutan acak.</span></li>
          <li><b>3</b><span><strong>Letakkan.</strong> Seret (drag &amp; drop) bentuk ke sel asalnya, atau klik/tap bentuk lalu klik/tap sel. Bisa juga lewat keyboard atau pad virtual.</span></li>
          <li><b>4</b><span><strong>Skor.</strong> Benar: sel hijau, +10 poin. Salah: sel bergetar merah, −1 nyawa; bentuk kembali ke baki dan boleh dicoba di sel lain. 3 nyawa untuk seluruh game.</span></li>
          <li><b>5</b><span><strong>Giliran.</strong> Mode bot / 2 pemain: giliran bergantian tiap percobaan. Pembuka tiap ronde diacak. Bonus cepat diberikan kepada yang menuntaskan ronde.</span></li>
          <li><b>6</b><span><strong>Progresi.</strong> Ronde 1–3 grid 4×4, ronde 4–6 grid 5×5; jumlah bentuk = min(2 + ronde, 6).</span></li>
        </ol>
        <h3>Kontrol desktop</h3>
        <table class="rw-keys-table">
          <tr><td><kbd>←↑→↓</kbd> / <kbd>WASD</kbd></td><td>Gerakkan kursor sel</td></tr>
          <tr><td><kbd>1</kbd>–<kbd>6</kbd></td><td>Pilih bentuk di baki</td></tr>
          <tr><td><kbd>Enter</kbd> / <kbd>Spasi</kbd></td><td>Letakkan bentuk terpilih di kursor</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Batal pilih / tutup overlay</td></tr>
          <tr><td><kbd>R</kbd> · <kbd>H</kbd> · <kbd>C</kbd> · <kbd>V</kbd></td><td>Ulang · bantuan · cheat · pad virtual</td></tr>
          <tr><td>Mouse</td><td>Drag &amp; drop, atau klik bentuk lalu klik sel</td></tr>
        </table>
        <h3>Kontrol mobile</h3>
        <p class="rw-ov-sub">Tap bentuk di baki, lalu tap sel tujuan. Untuk presisi, gunakan pad virtual: tombol arah menggerakkan kursor, "Ganti bentuk" mengganti pilihan, "Letakkan" men-drop di kursor.</p>
        <h3>Catatan</h3>
        <p class="rw-ov-sub">Level dibangkitkan acak dengan seed dan selalu bisa diselesaikan: tiap bentuk unik dan menempati sel berbeda. Membuka bantuan/cheat menjeda game lokal (tidak di mode online). Cheat menandai game sehingga skor terbaik tidak disimpan. Di mode room, hanya host yang bisa memulai/mengulang.</p>
        <div class="rw-btnrow"><button class="rw-btn rw-primary" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>

    <div class="rw-overlay" data-ov="cheat" hidden>
      <div class="rw-card">
        <h2 class="rw-ov-title">Cheat</h2>
        <p class="rw-ov-sub">Hanya untuk mode lokal (solo / bot). Skor terbaik tidak disimpan saat cheat dipakai.</p>
        <div class="rw-cheat-row"><span><b>X-Ray</b><small>Lihat bayangan bentuk di sel target saat menebak.</small></span><button class="rw-switch" type="button" role="switch" aria-checked="false" data-cheat-toggle="xray" aria-label="X-Ray"><i></i></button></div>
        <div class="rw-cheat-row"><span><b>Slow motion</b><small>Waktu menghafal ×3 (berlaku langsung &amp; ronde berikutnya).</small></span><button class="rw-switch" type="button" role="switch" aria-checked="false" data-cheat-toggle="slow" aria-label="Slow motion"><i></i></button></div>
        <div class="rw-cheat-row"><span><b>Nyawa abadi</b><small>Jawaban salah tidak mengurangi nyawa.</small></span><button class="rw-switch" type="button" role="switch" aria-checked="false" data-cheat-toggle="god" aria-label="Nyawa abadi"><i></i></button></div>
        <div class="rw-btnrow" style="margin-top:12px">
          <button class="rw-btn" type="button" data-cheat-act="cheat-life">+1 nyawa</button>
          <button class="rw-btn" type="button" data-cheat-act="cheat-auto">Selesaikan ronde</button>
          <button class="rw-btn" type="button" data-cheat-act="cheat-skip">Lewati ronde</button>
        </div>
        <p class="rw-note">Game ditandai "cheated" begitu cheat dipakai — skor terbaik tidak akan disimpan.</p>
        <div class="rw-btnrow" style="margin-top:12px"><button class="rw-btn rw-primary" type="button" data-cheat-close>Tutup</button></div>
      </div>
    </div>

    <div class="rw-overlay" data-ov="over" hidden>
      <div class="rw-card">
        <h2 class="rw-ov-title" data-ov-title>Selesai</h2>
        <p class="rw-ov-sub" data-ov-sub></p>
        <span class="rw-badge" data-ov-badge hidden>CHEAT DIPAKAI</span>
        <div class="rw-btnrow" data-over-btns style="margin-top:12px">
          <button class="rw-btn rw-primary" type="button" data-again>Main lagi</button>
          <button class="rw-btn" type="button" data-menu>Menu</button>
        </div>
        <p class="rw-ov-sub" data-over-wait hidden style="margin:0">Menunggu host memulai ulang…</p>
      </div>
    </div>
  </section>

  <div class="rw-vpad" data-elt="vpad" hidden>
    <div class="rw-dpad">
      <button class="rw-pad rw-pad-up" type="button" data-pad="up" aria-label="Atas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg></button>
      <button class="rw-pad rw-pad-left" type="button" data-pad="left" aria-label="Kiri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(-90deg)"><path d="M6 14l6-6 6 6"/></svg></button>
      <button class="rw-pad rw-pad-right" type="button" data-pad="right" aria-label="Kanan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(90deg)"><path d="M6 14l6-6 6 6"/></svg></button>
      <button class="rw-pad rw-pad-down" type="button" data-pad="down" aria-label="Bawah"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(180deg)"><path d="M6 14l6-6 6 6"/></svg></button>
    </div>
    <div class="rw-vactions">
      <button class="rw-btn" type="button" data-pad="cycle">Ganti bentuk</button>
      <button class="rw-btn rw-primary" type="button" data-pad="drop">Letakkan</button>
      <button class="rw-btn" type="button" data-pad="cancel">Batal pilih</button>
    </div>
  </div>

  <div class="game-actions rw-actions">
    <button class="game-action-button rw-btn" type="button" data-help>Cara main</button>
    <button class="game-action-button rw-btn" type="button" data-cheat>Cheat</button>
    <button class="game-action-button rw-btn" type="button" data-restart>Ulang</button>
    <button class="game-action-button rw-btn" type="button" data-vpad-toggle>Pad virtual</button>
    <button class="game-action-button rw-btn" type="button" data-exit>Exit game</button>
  </div>
  <div class="rw-hintline rw-hint-desktop"><kbd>←↑→↓</kbd>/<kbd>WASD</kbd> gerak · <kbd>1–6</kbd> pilih bentuk · <kbd>Enter</kbd> letakkan · <kbd>Esc</kbd> batal · <kbd>R</kbd> ulang · <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · drag &amp; drop dengan mouse</div>
  <div class="rw-hintline rw-hint-touch">Tap bentuk di baki lalu tap sel tujuan — atau gunakan pad virtual di atas.</div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const statusEl = $("[data-status]");
    const gridEl = $('[data-elt="grid"]');
    const trayEl = $('[data-elt="tray"]');
    const trayHint = $('[data-elt="trayhint"]');
    const timerEl = $('[data-elt="timer"]');
    const fillEl = $('[data-elt="fill"]');
    const phaseEl = $('[data-elt="phase"]');
    const toastEl = $('[data-elt="toast"]');
    const vpadEl = $('[data-elt="vpad"]');
    const hud = {
        round: $('[data-hud="round"]'),
        found: $('[data-hud="found"]'),
        lives: $('[data-hud="lives"]'),
        scores: $('[data-hud="scores"]'),
        best: $('[data-hud="best"]'),
        bestwrap: $('[data-hud="bestwrap"]'),
        cheatbadge: $('[data-hud="cheatbadge"]'),
    };
    const ovStart = $('[data-ov="start"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovOver = $('[data-ov="over"]');
    const startLocal = $("[data-start-local]");
    const startHost = $("[data-start-host]");
    const startGuest = $("[data-start-guest]");
    const ovTitle = $("[data-ov-title]");
    const ovSub = $("[data-ov-sub]");
    const ovBadge = $("[data-ov-badge]");
    const overBtns = $("[data-over-btns]");
    const overWait = $("[data-over-wait]");
    const swXray = $('[data-cheat-toggle="xray"]');
    const swSlow = $('[data-cheat-toggle="slow"]');
    const swGod = $('[data-cheat-toggle="god"]');
    const btnCheat = $("[data-cheat]");
    const btnRestart = $("[data-restart]");

    /* ---------- variabel UI lokal (tidak dipublish) ---------- */
    let selId = null;          // bentuk terpilih di baki
    let cursor = 0;            // sel kursor (keyboard / pad virtual)
    let dragId = null;         // bentuk yang sedang di-drag
    let helpOpen = false;
    let cheatOpen = false;
    let vpadOn = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const cheats = { xray: false, slow: false, god: false };
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* abaikan */ }

    let destroyed = false;
    let timers = [];
    let memTimer = 0;
    let raf = 0;
    let paused = false, pausedAt = 0, docHidden = false;
    let botMem = {};
    let lastNoteSeq = 0, lastEvSeq = 0, lastGameId = "", builtKey = "";
    let cellEls = [];
    const offs = [];
    const track = (x) => { if (typeof x === "function") offs.push(x); };

    /* ---------- timer & jeda (lokal saja) ---------- */
    function schedule(fn, ms) {
        const t = setTimeout(() => {
            timers = timers.filter((x) => x !== t);
            fn();
        }, Math.max(0, ms));
        timers.push(t);
        return t;
    }
    function clearTimers() {
        timers.forEach(clearTimeout);
        timers = [];
        memTimer = 0;
    }
    function shouldPause() {
        return !online && !destroyed && !!state &&
            (helpOpen || cheatOpen || docHidden) &&
            (state.phase === "memorize" || state.phase === "pick" || state.phase === "clear");
    }
    function syncPause() {
        const want = shouldPause();
        if (want && !paused) {
            paused = true;
            pausedAt = Date.now();
            clearTimers();
        } else if (!want && paused) {
            paused = false;
            const dt = Date.now() - pausedAt;
            if (state.phase === "memorize") {
                state.memEndsAt += dt;
                applySlowNow();
                memTimer = schedule(enterPick, state.memEndsAt - Date.now());
            } else if (state.phase === "pick") {
                state.pickStartedAt += dt;
                maybeScheduleBot();
            } else if (state.phase === "clear") {
                schedule(nextRound, 600);
            }
            render();
        }
    }
    function applySlowNow() {
        if (online || !cheats.slow || !state || state.phase !== "memorize" || state.slowApplied) return;
        const left = Math.max(0, state.memEndsAt - Date.now());
        state.memEndsAt = Date.now() + left * 3;
        state.memMs = Math.max(state.memMs, left * 3);
        state.slowApplied = true;
        if (!paused) {
            clearTimeout(memTimer);
            timers = timers.filter((x) => x !== memTimer);
            memTimer = schedule(enterPick, state.memEndsAt - Date.now());
        }
    }

    /* ---------- kursi pemain (diacak saat main online) ---------- */
    const seatOf = (pi) => (state && state.seatSwap ? 1 - pi : pi);
    const mySeat = () => (online ? seatOf(playerIndex) : 0);
    const isMyTurn = () =>
        !!state && state.phase === "pick" &&
        (state.gameMode === "solo" || state.turn === mySeat());
    const canAct = () => isMyTurn() && !paused && !helpOpen && !cheatOpen;
    const objById = (id) => (state ? state.objects.find((o) => o.id === id) : null);
    const seatLabel = (i) => {
        if (!state) return "P" + (i + 1);
        if (state.gameMode === "bot") return i === 0 ? "Kamu" : "Bot";
        return "P" + (i + 1) + (i === mySeat() ? " (kamu)" : "");
    };

    /* ---------- state & alur permainan (otoritas: host / lokal) ---------- */
    function freshState(gameMode) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        return {
            gameId: Date.now() + ":" + seed,
            seed,
            gameMode,                    // solo | bot | versus
            phase: "lobby",              // lobby | memorize | pick | clear | over
            round: 1,
            grid: 4, k: 0,
            objects: [],                 // {id, shape, color, cell} — solusi kanonik
            tray: [],                    // id bentuk yang belum diletakkan (urutan tampil)
            placed: {},                  // cell -> {id, seat}
            lives: 3,
            scores: [0, 0],
            mistakes: [0, 0],
            seatSwap: false,             // acak posisi P1/P2 saat online
            first: 0, turn: 0,           // pembuka ronde diacak
            memMs: 0, memEndsAt: 0, slowApplied: false,
            pickStartedAt: 0,
            cheated: !online && (cheats.xray || cheats.slow || cheats.god),
            evSeq: 0, event: null,       // animasi (ok/bad/clear) utk semua klien
            noteSeq: 0, note: null,      // toast bersama
            result: null,
        };
    }

    function publish() {
        render();
        if (online && room.isHost && !destroyed) room.publishState(state).catch(console.warn);
    }

    function startGame(gameMode) {
        if (online && !room.isHost) { showToast("Hanya host yang bisa memulai"); return; }
        clearTimers();
        paused = false; helpOpen = false; cheatOpen = false;
        state = freshState(online ? "versus" : gameMode);
        state.seatSwap = online ? Math.random() < 0.5 : false; // acak posisi pemain
        beginRound();
    }

    function beginRound() {
        const s = state;
        clearTimers();
        const r = genRound((s.seed + s.round * 7919) >>> 0, s.round);
        s.grid = r.grid; s.k = r.k; s.objects = r.objects; s.tray = r.tray;
        s.placed = {};
        s.phase = "memorize";
        s.first = s.gameMode === "solo" ? 0 : (Math.random() < 0.5 ? 0 : 1); // acak pembuka
        s.turn = s.first;
        s.slowApplied = !online && cheats.slow;
        s.memMs = memorizeMs(s.k) * (s.slowApplied ? 3 : 1);
        s.memEndsAt = Date.now() + s.memMs;
        s.pickStartedAt = 0;
        s.noteSeq++;
        s.note = {
            text: s.gameMode === "solo"
                ? "Ronde " + s.round + ": hafalkan " + s.k + " bentuk!"
                : "Ronde " + s.round + ": " + (s.gameMode === "bot"
                    ? (s.first === 0 ? "kamu" : "bot")
                    : "P" + (s.first + 1)) + " jalan duluan",
        };
        if (s.gameMode === "bot") botMem = buildBotMem(r.objects, botAcc(s.round));
        selId = null;
        cursor = Math.floor(r.grid * r.grid / 2);
        publish();
        memTimer = schedule(enterPick, s.memMs);
    }

    function enterPick() {
        const s = state;
        if (!s || s.phase !== "memorize") return;
        s.phase = "pick";
        s.pickStartedAt = Date.now();
        publish();
        maybeScheduleBot();
    }

    function roundClear(seat, skipped) {
        const s = state;
        s.phase = "clear";
        const secs = Math.max(0, (Date.now() - s.pickStartedAt) / 1000);
        const bonus = skipped ? 0 : Math.max(0, Math.ceil(10 * s.k - 2 * secs));
        s.scores[seat] += bonus;
        s.evSeq++; s.event = { kind: "clear", cell: -1, seat };
        s.noteSeq++;
        s.note = {
            text: skipped
                ? "Ronde " + s.round + " dilewati (cheat)"
                : "Ronde " + s.round + " selesai · bonus cepat +" + bonus
        };
        publish();
        clearTimers();
        if (!paused) schedule(nextRound, 1200); // saat jeda, dilanjutkan oleh syncPause
    }

    function nextRound() {
        const s = state;
        if (!s || s.phase !== "clear") return;
        if (s.round >= TOTAL_ROUNDS) { gameOver(true); return; }
        s.round++;
        beginRound();
    }

    function gameOver(cleared) {
        const s = state;
        clearTimers();
        s.phase = "over";
        let winner = null;
        if (s.gameMode !== "solo") {
            winner = s.scores[0] === s.scores[1] ? null : (s.scores[0] > s.scores[1] ? 0 : 1);
        }
        s.result = { cleared, winner };
        if (!online && !s.cheated && s.scores[0] > best) {
            best = s.scores[0];
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* abaikan */ }
        }
        publish();
    }

    /* ---------- aksi tervalidasi (dipakai lokal, host, & bot) ---------- */
    function applyAction(action, seat) {
        if (!state || !action || typeof action !== "object") return;
        if (seat !== 0 && seat !== 1) return;
        const s = state;
        switch (action.type) {
            case "place": {
                if (s.phase !== "pick") return;
                if (s.gameMode !== "solo" && seat !== s.turn) return;
                const obj = s.objects.find((o) => o.id === action.objectId);
                if (!obj || !s.tray.includes(obj.id)) return;
                const cell = Number(action.cell);
                if (!Number.isInteger(cell) || cell < 0 || cell >= s.grid * s.grid) return;
                if (s.placed[cell]) return; // sel sudah terisi benar
                if (obj.cell === cell) {
                    s.placed[cell] = { id: obj.id, seat };
                    s.tray = s.tray.filter((id) => id !== obj.id);
                    s.scores[seat] += 10;
                    s.evSeq++; s.event = { kind: "ok", cell, seat };
                    if (s.tray.length === 0) { roundClear(seat, false); return; }
                } else {
                    // Salah: sel TIDAK diblokir permanen -> ronde tetap bisa diselesaikan.
                    s.mistakes[seat]++;
                    if (!(cheats.god && !online)) s.lives--;
                    s.evSeq++; s.event = { kind: "bad", cell, seat };
                    if (s.lives <= 0) { gameOver(false); return; }
                }
                if (s.gameMode !== "solo") s.turn = 1 - s.turn;
                publish();
                maybeScheduleBot();
                return;
            }
            case "cheat-life":
                if (online) return;
                s.cheated = true;
                s.lives = Math.min(5, s.lives + 1);
                publish();
                return;
            case "cheat-auto": {
                if (online || s.phase !== "pick") return;
                s.cheated = true;
                for (const id of s.tray.slice()) {
                    const o = s.objects.find((x) => x.id === id);
                    s.placed[o.cell] = { id, seat };
                    s.scores[seat] += 10;
                }
                s.tray = [];
                roundClear(seat, false);
                return;
            }
            case "cheat-skip":
                if (online || s.phase !== "pick") return;
                s.cheated = true;
                roundClear(seat, true);
                return;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------- bot (mode lokal "bot", kursi 1) ---------- */
    const botAcc = (round) => Math.max(0.55, 0.85 - 0.04 * (round - 1));
    function buildBotMem(objects, acc) {
        const m = {};
        const n = state.grid * state.grid;
        for (const o of objects) {
            if (Math.random() < acc) { m[o.id] = o.cell; }
            else {
                let c;
                do { c = (Math.random() * n) | 0; } while (c === o.cell);
                m[o.id] = c;
            }
        }
        return m;
    }
    function maybeScheduleBot() {
        const s = state;
        if (online || !s || s.gameMode !== "bot" || s.phase !== "pick" || s.turn !== 1 || paused) return;
        schedule(botMove, 800 + Math.random() * 800);
    }
    function botMove() {
        const s = state;
        if (!s || s.gameMode !== "bot" || s.phase !== "pick" || s.turn !== 1 || paused) return;
        if (!s.tray.length) return;
        const id = s.tray[(Math.random() * s.tray.length) | 0];
        let cell = botMem[id];
        if (cell == null || s.placed[cell]) {
            const free = [];
            for (let i = 0; i < s.grid * s.grid; i++) if (!s.placed[i]) free.push(i);
            cell = free[(Math.random() * free.length) | 0];
        }
        applyAction({ type: "place", objectId: id, cell }, 1);
    }

    /* ---------- rendering (idempoten dari state) ---------- */
    function buildGrid(w) {
        gridEl.innerHTML = "";
        gridEl.style.setProperty("--rw-cols", w);
        gridEl.classList.remove("rw-flash");
        cellEls = [];
        for (let i = 0; i < w * w; i++) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "rw-cell";
            b.dataset.cell = String(i);
            gridEl.appendChild(b);
            cellEls.push(b);
        }
    }

    const statHtml = (label, val, active) =>
        '<span class="rw-stat' + (active ? " rw-active" : "") + '">' + label + " <b>" + val + "</b></span>";

    function showToast(text) {
        toastEl.textContent = text;
        toastEl.classList.remove("rw-show");
        void toastEl.offsetWidth;
        toastEl.classList.add("rw-show");
    }

    function render() {
        const s = state;
        const phase = s ? s.phase : "lobby";
        const my = isMyTurn();
        const act = canAct();
        const w = s ? s.grid : 4;

        statusEl.textContent =
            phase === "memorize" ? "Hafalkan" :
                phase === "pick" ? (s.gameMode === "solo" ? "Letakkan bentuk" : (my ? "Giliranmu" : "Giliran lawan")) :
                    phase === "clear" ? "Ronde selesai" :
                        phase === "over" ? "Selesai" : "Siap";

        hud.round.textContent = (s ? s.round : 1) + "/" + TOTAL_ROUNDS;
        hud.found.textContent = (s ? Object.keys(s.placed).length : 0) + "/" + (s ? s.k : 0);
        hud.lives.innerHTML = heartsHtml(s ? s.lives : 3);
        if (!s || s.gameMode === "solo") {
            hud.scores.innerHTML = statHtml("Skor", s ? s.scores[0] : 0, false);
        } else {
            hud.scores.innerHTML =
                statHtml(seatLabel(0), s.scores[0], phase === "pick" && s.turn === 0) +
                statHtml(seatLabel(1), s.scores[1], phase === "pick" && s.turn === 1);
        }
        hud.bestwrap.hidden = online;
        hud.best.textContent = String(best);
        hud.cheatbadge.hidden = online || !(s && s.cheated);

        phaseEl.textContent =
            phase === "memorize" ? "Hafalkan posisi & bentuk" :
                phase === "pick" ? (my ? "Letakkan tiap bentuk ke sel asalnya" : "Menunggu lawan meletakkan…") :
                    phase === "clear" ? "Ronde selesai" :
                        phase === "over" ? "Permainan selesai" : "Bersiap";
        timerEl.classList.toggle("rw-off", phase !== "memorize");

        /* grid */
        const key = s ? s.gameId + "|" + s.round + "|" + s.grid : "lobby|4";
        if (key !== builtKey) { buildGrid(w); builtKey = key; }
        for (let i = 0; i < cellEls.length; i++) {
            const el = cellEls[i];
            el.className = "rw-cell";
            el.removeAttribute("data-seat");
            const target = s ? s.objects.find((o) => o.cell === i) : null;
            const pl = s ? s.placed[i] : null;
            let html = "";
            if (phase === "memorize" && target) {
                html = objSvg(target.shape, target.color);
            } else if (pl) {
                const o = objById(pl.id);
                html = o ? objSvg(o.shape, o.color) : "";
                el.classList.add("rw-found");
                if (s.gameMode !== "solo") el.dataset.seat = String(pl.seat);
            } else if (phase === "over" && target) {
                html = objSvg(target.shape, target.color);
                el.classList.add("rw-reveal");
            } else if (phase === "pick" && cheats.xray && !online && target) {
                html = objSvg(target.shape, target.color);
                el.classList.add("rw-ghost");
            }
            if (phase === "pick" && i === cursor) el.classList.add("rw-cursor");
            if (el.innerHTML !== html) el.innerHTML = html;
            el.setAttribute("aria-label", "Sel baris " + (Math.floor(i / w) + 1) + " kolom " + (i % w + 1));
        }

        /* baki bentuk */
        if (phase === "pick" || phase === "clear") {
            trayHint.hidden = true;
            trayEl.hidden = false;
            if (selId && s && !s.tray.includes(selId)) selId = null;
            trayEl.innerHTML = (s ? s.tray : []).map((id, idx) => {
                const o = objById(id);
                return '<button type="button" class="rw-obj' + (selId === id ? " rw-sel" : "") +
                    '" data-obj="' + id + '" draggable="' + (act ? "true" : "false") +
                    '" aria-pressed="' + (selId === id) + '" aria-label="Bentuk ' + id + '">' +
                    '<span class="rw-key">' + (idx + 1) + "</span>" + (o ? objSvg(o.shape, o.color) : "") + "</button>";
            }).join("");
            trayEl.classList.toggle("rw-dim", !act);
        } else {
            trayEl.hidden = true;
            trayHint.hidden = false;
            trayHint.textContent = phase === "memorize"
                ? "Bentuk akan pindah ke baki ini setelah tersembunyi"
                : "Baki bentuk muncul saat fase meletakkan";
        }

        /* animasi dari event bersama */
        if (s && s.evSeq !== lastEvSeq) {
            lastEvSeq = s.evSeq;
            const ev = s.event;
            if (ev) {
                if (ev.kind === "ok" && cellEls[ev.cell]) {
                    const el = cellEls[ev.cell];
                    el.classList.add("rw-pop");
                    schedule(() => el.classList.remove("rw-pop"), 450);
                } else if (ev.kind === "bad" && cellEls[ev.cell]) {
                    const el = cellEls[ev.cell];
                    el.classList.add("rw-miss");
                    schedule(() => el.classList.remove("rw-miss"), 500);
                } else if (ev.kind === "clear") {
                    gridEl.classList.remove("rw-flash");
                    void gridEl.offsetWidth;
                    gridEl.classList.add("rw-flash");
                }
            }
        }

        /* toast: pengumuman kursi acak + note ronde */
        if (s && s.gameId !== lastGameId) {
            lastGameId = s.gameId;
            if (s.gameMode === "versus") {
                lastNoteSeq = s.noteSeq;
                showToast("Kamu (" + playerName + ") = P" + (mySeat() + 1) + (s.note ? " · " + s.note.text : ""));
            }
        }
        if (s && s.noteSeq !== lastNoteSeq) {
            lastNoteSeq = s.noteSeq;
            if (s.note) showToast(s.note.text);
        }

        /* overlay */
        ovStart.hidden = phase !== "lobby";
        ovOver.hidden = phase !== "over";
        ovHelp.hidden = !helpOpen;
        ovCheat.hidden = !cheatOpen || online;
        startLocal.hidden = online;
        startHost.hidden = !online || !room.isHost;
        startGuest.hidden = !online || room.isHost;

        if (phase === "over" && s) {
            const r = s.result || { cleared: false, winner: null };
            let title, cls = "";
            if (!r.cleared) { title = "Nyawa habis"; cls = "rw-lose"; }
            else if (s.gameMode === "solo") { title = "Semua ronde selesai!"; cls = "rw-win"; }
            else if (r.winner === null) { title = "Seri!"; }
            else if (r.winner === mySeat()) { title = "Kamu menang!"; cls = "rw-win"; }
            else { title = s.gameMode === "bot" ? "Bot menang" : "Lawan menang"; cls = "rw-lose"; }
            ovTitle.textContent = title;
            ovTitle.className = "rw-ov-title" + (cls ? " " + cls : "");
            const lines = ["Ronde tercapai: " + s.round + "/" + TOTAL_ROUNDS];
            if (s.gameMode === "solo") {
                lines.push("Skor akhir: " + s.scores[0] + " · Kesalahan: " + s.mistakes[0]);
            } else {
                lines.push(seatLabel(0) + ": " + s.scores[0] + " · " + seatLabel(1) + ": " + s.scores[1]);
            }
            if (!online) lines.push("Skor terbaik: " + best);
            ovSub.textContent = lines.join(" — ");
            ovBadge.hidden = !s.cheated;
            const guest = online && !room.isHost;
            overBtns.hidden = guest;
            overWait.hidden = !guest;
        }

        /* cheat switch & footer */
        swXray.setAttribute("aria-checked", String(cheats.xray));
        swSlow.setAttribute("aria-checked", String(cheats.slow));
        swGod.setAttribute("aria-checked", String(cheats.god));
        btnCheat.hidden = online;
        btnRestart.disabled = online && !room.isHost;
        btnRestart.title = btnRestart.disabled ? "Hanya host yang bisa mengulang" : "";

        /* pad virtual */
        vpadEl.hidden = !vpadOn;
        vpadEl.querySelectorAll("button").forEach((b) => { b.disabled = !act; });
    }

    /* ---------- bar waktu (rAF; tamu online ikut memEndsAt dari state) ---------- */
    function tick() {
        if (destroyed) return;
        if (state && state.phase === "memorize") {
            const now = paused ? pausedAt : Date.now();
            const left = Math.max(0, state.memEndsAt - now);
            const pct = state.memMs ? Math.min(100, (100 * left) / state.memMs) : 0;
            fillEl.style.width = pct + "%";
        }
        raf = requestAnimationFrame(tick);
    }

    /* ---------- interaksi ---------- */
    function tryPlace(cell) {
        if (!state || state.phase !== "pick") return;
        if (!canAct()) {
            if (!isMyTurn()) showToast("Bukan giliranmu");
            return;
        }
        if (state.placed[cell]) { showToast("Sel itu sudah terisi"); return; }
        if (!selId) {
            showToast("Pilih bentuk di baki dulu");
            trayEl.classList.remove("rw-pulse");
            void trayEl.offsetWidth;
            trayEl.classList.add("rw-pulse");
            return;
        }
        submitAction({ type: "place", objectId: selId, cell });
    }

    function moveCursor(c) {
        if (c === cursor) return;
        if (cellEls[cursor]) cellEls[cursor].classList.remove("rw-cursor");
        cursor = c;
        if (cellEls[cursor] && state && state.phase === "pick") cellEls[cursor].classList.add("rw-cursor");
    }

    function padAction(p) {
        if (p === "cycle") {
            if (!canAct() || !state.tray.length) return;
            const idx = state.tray.indexOf(selId);
            selId = state.tray[(idx + 1) % state.tray.length];
            render();
            return;
        }
        if (p === "cancel") { selId = null; render(); return; }
        if (p === "drop") { tryPlace(cursor); return; }
        const w = state ? state.grid : 4;
        const n = w * w;
        let c = cursor;
        if (p === "up") c = Math.max(0, c - w);
        else if (p === "down") c = Math.min(n - 1, c + w);
        else if (p === "left") c = Math.max(0, c - 1);
        else if (p === "right") c = Math.min(n - 1, c + 1);
        moveCursor(c);
    }

    function handleClick(event) {
        const t = event.target;
        const hit = (sel) => t.closest(sel);
        if (hit("[data-exit]")) { onExit(); return; }
        if (hit("[data-help]")) { helpOpen = !helpOpen; cheatOpen = false; syncPause(); render(); return; }
        if (hit("[data-help-close]")) { helpOpen = false; syncPause(); render(); return; }
        if (hit("[data-cheat]")) {
            if (online) return;
            cheatOpen = !cheatOpen; helpOpen = false; syncPause(); render(); return;
        }
        if (hit("[data-cheat-close]")) { cheatOpen = false; syncPause(); render(); return; }
        const sw = hit("[data-cheat-toggle]");
        if (sw) {
            if (online) return;
            const k = sw.dataset.cheatToggle;
            cheats[k] = !cheats[k];
            if (state) state.cheated = true;
            if (k === "slow") applySlowNow();
            publish();
            return;
        }
        const ca = hit("[data-cheat-act]");
        if (ca) {
            const type = ca.dataset.cheatAct;
            if ((type === "cheat-auto" || type === "cheat-skip") && (!state || state.phase !== "pick")) {
                showToast("Tersedia saat fase meletakkan");
                return;
            }
            submitAction({ type });
            return;
        }
        const st = hit("[data-start]");
        if (st) { startGame(st.dataset.start); return; }
        if (hit("[data-again]")) { startGame(state ? state.gameMode : "solo"); return; }
        if (hit("[data-menu]")) {
            if (online && !room.isHost) return;
            clearTimers();
            paused = false;
            state = freshState(online ? "versus" : "solo");
            publish();
            return;
        }
        if (hit("[data-restart]")) {
            if (online && !room.isHost) { showToast("Hanya host yang bisa mengulang"); return; }
            startGame(state ? state.gameMode : "solo");
            return;
        }
        if (hit("[data-vpad-toggle]")) { vpadOn = !vpadOn; render(); return; }
        const pad = hit("[data-pad]");
        if (pad) { padAction(pad.dataset.pad); return; }
        const chip = hit("[data-obj]");
        if (chip) {
            if (!canAct()) return;
            selId = selId === chip.dataset.obj ? null : chip.dataset.obj;
            render();
            return;
        }
        const cell = hit("[data-cell]");
        if (cell) {
            const i = Number(cell.dataset.cell);
            cursor = i;
            if (state && state.phase === "pick") tryPlace(i);
            return;
        }
    }

    /* drag & drop (mouse / desktop) */
    function onDragStart(e) {
        const chip = e.target.closest("[data-obj]");
        if (!chip || !canAct()) { e.preventDefault(); return; }
        dragId = chip.dataset.obj;
        selId = dragId;
        try {
            e.dataTransfer.setData("text/plain", dragId);
            e.dataTransfer.effectAllowed = "move";
        } catch (err) { /* abaikan */ }
        chip.classList.add("rw-dragging", "rw-sel");
    }
    function onDragOver(e) {
        if (!canAct() || !dragId) return;
        const cellEl = e.target.closest("[data-cell]");
        if (!cellEl) return;
        const i = Number(cellEl.dataset.cell);
        if (state.placed[i]) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        cellEl.classList.add("rw-over");
    }
    function onDragLeave(e) {
        const cellEl = e.target.closest("[data-cell]");
        if (cellEl) cellEl.classList.remove("rw-over");
    }
    function onDrop(e) {
        const cellEl = e.target.closest("[data-cell]");
        cellEls.forEach((el) => el.classList.remove("rw-over"));
        if (!cellEl || !canAct()) return;
        e.preventDefault();
        let id = dragId;
        try { id = e.dataTransfer.getData("text/plain") || dragId; } catch (err) { /* abaikan */ }
        if (!id) return;
        const i = Number(cellEl.dataset.cell);
        cursor = i;
        selId = id;
        tryPlace(i);
        dragId = null;
    }
    function onDragEnd() {
        dragId = null;
        root.querySelectorAll(".rw-dragging").forEach((el) => el.classList.remove("rw-dragging"));
        cellEls.forEach((el) => el.classList.remove("rw-over"));
        render();
    }

    /* keyboard (desktop) */
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (k === "Escape") {
            if (helpOpen || cheatOpen) { helpOpen = false; cheatOpen = false; syncPause(); render(); e.preventDefault(); }
            else if (selId) { selId = null; render(); e.preventDefault(); }
            return;
        }
        if (k === "h" || k === "H") { helpOpen = !helpOpen; cheatOpen = false; syncPause(); render(); e.preventDefault(); return; }
        if (k === "c" || k === "C") {
            if (!online) { cheatOpen = !cheatOpen; helpOpen = false; syncPause(); render(); e.preventDefault(); }
            return;
        }
        if (k === "v" || k === "V") { vpadOn = !vpadOn; render(); e.preventDefault(); return; }
        if (helpOpen || cheatOpen) return;
        const phase = state ? state.phase : "lobby";
        if (phase === "lobby") {
            if (k === "Enter" || k === " ") { e.preventDefault(); startGame(online ? "versus" : "solo"); }
            return;
        }
        if (phase === "over") {
            if (k === "Enter" || k === " ") {
                e.preventDefault();
                if (!online || room.isHost) startGame(state.gameMode);
            }
            return;
        }
        if (k === "r" || k === "R") {
            e.preventDefault();
            if (!online || room.isHost) startGame(state.gameMode);
            else showToast("Hanya host yang bisa mengulang");
            return;
        }
        if (phase !== "pick") return;
        const w = state.grid;
        const n = w * w;
        if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); moveCursor(Math.max(0, cursor - w)); return; }
        if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); moveCursor(Math.min(n - 1, cursor + w)); return; }
        if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); moveCursor(Math.max(0, cursor - 1)); return; }
        if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); moveCursor(Math.min(n - 1, cursor + 1)); return; }
        if (k >= "1" && k <= "9") {
            e.preventDefault();
            const idx = Number(k) - 1;
            if (canAct() && state.tray[idx]) { selId = state.tray[idx]; render(); }
            return;
        }
        if (k === "Enter" || k === " ") { e.preventDefault(); tryPlace(cursor); return; }
    }

    function onVis() { docHidden = document.hidden; syncPause(); }

    /* ---------- init & wiring ---------- */
    buildGrid(4);
    root.addEventListener("click", handleClick);
    root.addEventListener("dragstart", onDragStart);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("drop", onDrop);
    root.addEventListener("dragend", onDragEnd);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);

    if (online) {
        track(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = freshState("versus");
            publish();
            // Aksi tamu: playerIndex 1 dipetakan ke kursi sesuai seatSwap.
            track(room.onAction((action) => applyAction(action, seatOf(1))));
        } else {
            track(room.onState((nextState) => {
                if (destroyed) return;
                state = nextState;
                render();
            }));
        }
    } else {
        state = freshState("solo");
        render();
    }
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("visibilitychange", onVis);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("dragstart", onDragStart);
            root.removeEventListener("dragover", onDragOver);
            root.removeEventListener("dragleave", onDragLeave);
            root.removeEventListener("drop", onDrop);
            root.removeEventListener("dragend", onDragEnd);
            offs.forEach((f) => { try { f(); } catch (e) { /* abaikan */ } });
        },
        _test: { genRound, isSolvable, memorizeMs, mulberry32, SHAPES, COLORS },
    };
}