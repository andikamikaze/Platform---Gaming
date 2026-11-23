/* ==== games/snakes-io.js ==== */
/*
  Snakes.io — arena survival (template META + mount).
  - Mode AI  : 1 pemain + 3 bot.
  - Mode room: 2 pemain (host authoritative) + 2 bot.
  - Level generator acak tervalidasi (flood-fill connectivity + spawn aman).
  - Ular SELALU bergerak maju; input hanya membelokkan (turn-rate terbatas).
*/

export const META = {
    id: "snakes-io", // harus sama dengan nama file (tanpa .js)
    name: "Snakes.io",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Kendalikan ular, makan orb, potong jalur lawan, dan bertahan sampai akhir.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 34c6 0 6-10 12-10s6 10 12 10 6-10 8-10"></path><circle cx="40" cy="22" r="2.5" fill="currentColor" stroke="none"></circle><circle cx="10" cy="14" r="2.5" fill="currentColor" stroke="none"></circle></svg>',
    bg: ["#a7f3d0", "#34d399"],
    bestKey: "snakesIoBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = online && Boolean(room.isHost);
    const playerIndex = online && !isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- konstanta ---------------- */
    const W = 600, H = 600, B = 6;      // arena & inset dinding
    const G = 30, C = 20;               // grid level generator (30x30 sel 20px)
    const SEG = 4, R = 7;               // jarak sampel path, radius kepala
    const TARGET = 60, MIN_SEG = 10;    // target menang, minimum boost
    const FOOD_N = 22;
    const PUB_MS = 0.16;                // throttle publish state host (~6Hz)
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const segs = (s) => Math.floor(s.len / SEG);
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => { const el = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
    const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const shuffle = (arr, rnd = Math.random) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const uid = Math.random().toString(36).slice(2, 8);
    const finePointer = typeof matchMedia === "function" && matchMedia("(pointer:fine)").matches;

    /* ---------------- shell (UI minimalis) ---------------- */
    root.innerHTML = `
<style>
.snk{--ink:#18181b;--mut:#71717a;--line:#e4e4e7;--acc:#10b981;--card:#fff;
  color:var(--ink);display:flex;flex-direction:column;gap:12px;max-width:620px;margin:0 auto;padding:4px 0}
.snk [hidden]{display:none!important}
.snk-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.snk-brand h2{margin:0;font-size:18px;font-weight:800;letter-spacing:-.2px}
.snk-brand small{display:block;font-size:10.5px;color:var(--mut);letter-spacing:.4px;text-transform:uppercase}
.snk-chips{display:flex;gap:6px;flex-wrap:wrap}
.snk-chip{border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:11px;color:var(--mut);background:var(--card)}
.snk-chip b{color:var(--ink);font-weight:700;margin-left:4px}
.snk-chip.cheat{border-color:#f59e0b;color:#b45309}
.snk-status{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mut)}
.snk-status i{width:8px;height:8px;border-radius:50%;background:#a1a1aa;display:inline-block}
.snk-status.run i{background:var(--acc)} .snk-status.end i{background:#e11d48}
.snk-stage{position:relative;border:1px solid var(--line);border-radius:16px;background:var(--card);padding:10px}
.snk-stage svg.arena{display:block;width:100%;height:auto;border-radius:10px;touch-action:none;cursor:crosshair}
.snk-ov{position:absolute;inset:10px;border-radius:10px;display:grid;place-items:center;background:rgba(250,250,250,.87);backdrop-filter:blur(3px);z-index:5}
.snk-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;width:min(92%,370px);text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.06)}
.snk-ov-title{margin:0;font-size:18px;font-weight:800}
.snk-ov-title.win{color:var(--acc)} .snk-ov-title.lose{color:#e11d48}
.snk-ov-sub{font-size:12.5px;color:var(--mut);line-height:1.6;margin:8px 0 14px}
.snk-list{text-align:left;font-size:12.5px;line-height:1.7;margin:0 0 14px;padding-left:18px;color:#3f3f46}
.snk-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:999px;padding:9px 18px;background:var(--ink);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;margin:2px}
.snk-btn:hover{opacity:.88}
.snk-btn.acc{background:var(--acc)}
.snk-btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.snk kbd{border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:11px;background:#f4f4f5;font-family:inherit}
.snk-cheats{position:absolute;top:14px;right:14px;z-index:6;width:212px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.08)}
.snk-cheats h3{margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.4px;text-transform:uppercase}
.snk-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;padding:4px 0;color:#3f3f46}
.snk-cheat-row input{accent-color:var(--acc)}
.snk-cheat-acts{display:flex;gap:6px;margin-top:8px}
.snk-cheat-acts button{flex:1;font-size:10.5px;padding:6px 4px;border-radius:8px;border:1px solid var(--line);background:#fafafa;cursor:pointer;font-weight:700}
.snk-cheat-note{font-size:10px;color:var(--mut);margin-top:8px;line-height:1.5}
.snk-toast{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:11.5px;font-weight:600;padding:6px 12px;border-radius:999px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:7;white-space:nowrap;max-width:94%;overflow:hidden;text-overflow:ellipsis}
.snk-toast.show{opacity:1}
.snk-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--mut);padding:0 2px}
.snk-leg{display:inline-flex;align-items:center;gap:5px}
.snk-leg i{width:9px;height:9px;border-radius:50%;display:inline-block}
.snk-leg.dead{opacity:.4;text-decoration:line-through}
.snk-controls{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.snk-pad{display:none;gap:8px}
.snk-pad button{width:56px;height:46px;border-radius:12px;border:1px solid var(--line);background:var(--card);cursor:pointer;display:grid;place-items:center;touch-action:none;color:var(--ink)}
.snk-pad button:active{background:#f4f4f5}
.snk-pad button svg{width:20px;height:20px}
.snk-pad .boost{width:78px;font-size:11px;font-weight:800;letter-spacing:.5px;color:var(--acc);border-color:var(--acc)}
.snk-tools{display:flex;gap:6px;flex-wrap:wrap}
.snk-tools button{font-size:11.5px;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--ink)}
.snk-tools button:hover{border-color:var(--ink)}
.snk-hint{font-size:11px;color:var(--mut)}
.snk [data-exit]{font-size:12px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--mut)}
@media (pointer:coarse),(max-width:640px){.snk-pad{display:flex}.snk-hint{display:none}}
@keyframes snk-pulse${uid}{0%,100%{opacity:.14}50%{opacity:.4}}
.snk .pulse{animation:snk-pulse${uid} 1.7s ease-in-out infinite}
</style>
<div class="snk game-app">
  <header class="snk-top">
    <div class="snk-brand"><h2>Snakes.io</h2><small>arena survival</small></div>
    <div class="snk-chips">
      <span class="snk-chip">Skor<b data-hud="score">0</b></span>
      <span class="snk-chip">Panjang<b><span data-hud="len">17</span>/${TARGET}</b></span>
      <span class="snk-chip">Level<b data-hud="level">1</b></span>
      <span class="snk-chip">Lawan<b data-hud="rivals">3</b></span>
      <span class="snk-chip">Terbaik<b data-hud="best">0</b></span>
      <span class="snk-chip cheat" data-hud="cheatchip" hidden>CHEAT AKTIF</span>
    </div>
    <span class="snk-status game-status" data-statuswrap><i></i><span data-status>Siap</span></span>
  </header>

  <section class="snk-stage game-panel" data-board>
    <svg class="arena" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Arena Snakes.io">
      <defs>
        <pattern id="snkGrid${uid}" width="${C}" height="${C}" patternUnits="userSpaceOnUse">
          <rect width="${C}" height="${C}" fill="#fbfcfe"></rect>
          <circle cx="${C / 2}" cy="${C / 2}" r="1" fill="#e2e8f0"></circle>
        </pattern>
      </defs>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="url(#snkGrid${uid})" stroke="#e4e4e7" stroke-width="2"></rect>
      <rect x="${B}" y="${B}" width="${W - 2 * B}" height="${H - 2 * B}" rx="8" fill="none" stroke="#f87171" stroke-opacity=".38" stroke-width="3"></rect>
      <g data-el="walls"></g>
      <g data-el="foods"></g>
      <g data-el="snakes"></g>
    </svg>

    <div class="snk-toast" data-el="toast"></div>

    <div class="snk-cheats" data-el="cheats" hidden>
      <h3>Cheat</h3>
      <label class="snk-cheat-row">Kebal (tembok &amp; tubuh) <input type="checkbox" data-cheat="god"></label>
      <label class="snk-cheat-row">Magnet makanan <input type="checkbox" data-cheat="magnet"></label>
      <label class="snk-cheat-row">Perlambat bot <input type="checkbox" data-cheat="slow"></label>
      <label class="snk-cheat-row">Boost gratis <input type="checkbox" data-cheat="freeBoost"></label>
      <div class="snk-cheat-acts">
        <button type="button" data-act="grow">+10 panjang</button>
        <button type="button" data-act="wipe">Habisi bot</button>
      </div>
      <div class="snk-cheat-note">Saat cheat dipakai, skor terbaik tidak disimpan. Nonaktif di multiplayer.</div>
    </div>

    <div class="snk-ov" data-ov="start">
      <div class="snk-card">
        <h2 class="snk-ov-title">Snakes.io</h2>
        <p class="snk-ov-sub" data-el="startSub">Makan orb untuk tumbuh, hindari dinding &amp; tubuh lawan. Menang: capai panjang ${TARGET} atau jadi ular terakhir.</p>
        <button class="snk-btn acc" type="button" data-act="start">Mulai</button>
        <button class="snk-btn ghost" type="button" data-act="help">Cara main</button>
      </div>
    </div>

    <div class="snk-ov" data-ov="over" hidden>
      <div class="snk-card">
        <h2 class="snk-ov-title" data-el="ovTitle">Selesai</h2>
        <p class="snk-ov-sub" data-el="ovSub"></p>
        <button class="snk-btn acc" type="button" data-act="restart" data-el="btnAgain">Main lagi</button>
        <button class="snk-btn" type="button" data-act="next" data-el="btnNext" hidden>Level berikutnya</button>
        <p class="snk-ov-sub" data-el="guestNote" hidden style="margin:6px 0 0">Menunggu host memulai ulang…</p>
      </div>
    </div>

    <div class="snk-ov" data-ov="pause" hidden>
      <div class="snk-card">
        <h2 class="snk-ov-title">Jeda</h2>
        <p class="snk-ov-sub">Klik lanjut atau tekan tombol kontrol.</p>
        <button class="snk-btn acc" type="button" data-act="resume">Lanjut</button>
      </div>
    </div>

    <div class="snk-ov" data-ov="help" hidden>
      <div class="snk-card">
        <h2 class="snk-ov-title">Cara main</h2>
        <ul class="snk-list">
          <li>Ular <b>selalu melaju</b> — kamu hanya membelokkan, tidak bisa berhenti.</li>
          <li>Desktop: <kbd>←</kbd>/<kbd>→</kbd> atau <kbd>A</kbd>/<kbd>D</kbd> belok; <kbd>W</kbd>/<kbd>↑</kbd>/<kbd>Shift</kbd>/<kbd>Spasi</kbd> boost. Mouse mengarahkan (toggle <kbd>M</kbd>), klik-tahan arena = boost.</li>
          <li>Mobile: tahan tombol ◀ / ▶ / BOOST di bawah arena.</li>
          <li>Makan orb kuning (+2) dan oranye (+3, jatuh dari ular yang mati).</li>
          <li>Boost membakar panjang (min. ${MIN_SEG}). Tubuh sendiri aman disentuh.</li>
          <li><b>Kalah</b>: kepala menabrak dinding, balok, atau tubuh ular lain. <b>Menang</b>: panjang ${TARGET} atau ular terakhir.</li>
          <li>Lawan yang mati menjatuhkan makanan — potong jalurnya!</li>
          <li><kbd>P</kbd> jeda · <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · <kbd>R</kbd> ulang.</li>
        </ul>
        <button class="snk-btn" type="button" data-act="help-close">Tutup</button>
      </div>
    </div>
  </section>

  <div class="snk-legend" data-el="legend"></div>

  <div class="snk-controls">
    <div class="snk-pad">
      <button type="button" data-hold="left" aria-label="Belok kiri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg></button>
      <button type="button" class="boost" data-hold="boost" aria-label="Boost">BOOST</button>
      <button type="button" data-hold="right" aria-label="Belok kanan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg></button>
    </div>
    <span class="snk-hint">Belok: ←/→ atau A/D · Boost: W/↑/Shift · Mouse mengarahkan</span>
    <div class="snk-tools">
      <button type="button" data-act="help">Cara main</button>
      <button type="button" data-act="cheat" data-el="btnCheat">Cheat</button>
      <button type="button" data-act="mouse" data-el="btnMouse">Mouse: aktif</button>
      <button type="button" data-act="restart" data-el="btnRestart">Ulang</button>
    </div>
  </div>

  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Keluar game</button></div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const svg = $("svg.arena");
    const wallsG = $('[data-el="walls"]'), foodsG = $('[data-el="foods"]'), snakesG = $('[data-el="snakes"]');
    const legendEl = $('[data-el="legend"]'), toastEl = $('[data-el="toast"]');
    const ovStart = $('[data-ov="start"]'), ovOver = $('[data-ov="over"]'), ovPause = $('[data-ov="pause"]'), ovHelp = $('[data-ov="help"]');
    const cheatPanel = $('[data-el="cheats"]');
    const hudEls = { score: $('[data-hud="score"]'), len: $('[data-hud="len"]'), level: $('[data-hud="level"]'), rivals: $('[data-hud="rivals"]'), best: $('[data-hud="best"]') };
    const statusEl = $("[data-status]"), statusWrap = $("[data-statuswrap]");
    const setHidden = (el, h) => { if (h) { if (!el.hasAttribute("hidden")) el.setAttribute("hidden", ""); } else if (el.hasAttribute("hidden")) el.removeAttribute("hidden"); };

    /* ---------------- state lokal (non-network) ---------------- */
    let raf = 0, lastT = 0, pubAcc = 0, destroyed = false;
    let paused = false, helpOpen = false, cheatOpen = false, cheatsUsed = false;
    const keys = { left: false, right: false, boost: false };
    const mouse = { on: finePointer, has: false, x: 0, y: 0, down: false };
    const cheats = { god: false, magnet: false, slow: false, freeBoost: false };
    let remote = { steer: 0, boost: false, aim: null, ts: 0 };
    let lastSend = 0, lastSig = "";
    let sceneKey = "", snakeEls = [], foodEls = [], legEls = [];
    let hudCache = {}, overKey = "", toastT = 0;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { /* abaikan */ }
    const subs = [];
    const sub = (ret) => { if (typeof ret === "function") subs.push(ret); };

    const myIdx = () => (online ? (state && state.seats ? state.seats[playerIndex] : playerIndex) : 0);
    const mySnake = () => (state && state.snakes ? state.snakes[myIdx()] || null : null);
    const isMine = (s) => s === mySnake();
    const displayName = (s) => (isMine(s) ? "Kamu" : s.name);

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastT);
        toastT = setTimeout(() => toastEl.classList.remove("show"), 2600);
    }

    /* ---------------- level generator (acak & pasti bisa diselesaikan) ----------------
       - Balok 2..5 sel, jarak antar balok & tepi >= 3 sel (60px) -> koridor > diameter belok ular.
       - Flood-fill: seluruh area bebas wajib satu komponen (semua makanan terjangkau).
       - 4 spawn: clearance 2 sel + badan awal muat di salah satu dari 8 arah.
       - Fallback: arena terbuka (selalu valid). */
    function generateLevel(seed, level) {
        const rnd = mulberry32(seed);
        const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
        for (let attempt = 0; attempt < 40; attempt++) {
            const n = Math.min(1 + level, 8);
            const rects = [];
            let ok = true;
            for (let i = 0; i < n; i++) {
                let placed = false;
                for (let t = 0; t < 60; t++) {
                    const w = ri(2, 5), h = ri(2, 5);
                    const gx = ri(3, G - 3 - w), gy = ri(3, G - 3 - h);
                    let bad = false;
                    for (const r of rects) {
                        if (gx < r.gx + r.w + 3 && r.gx < gx + w + 3 && gy < r.gy + r.h + 3 && r.gy < gy + h + 3) { bad = true; break; }
                    }
                    if (!bad) { rects.push({ gx, gy, w, h }); placed = true; break; }
                }
                if (!placed) { ok = false; break; }
            }
            if (!ok) continue;

            const blocked = new Uint8Array(G * G);
            for (const r of rects)
                for (let y = r.gy; y < r.gy + r.h; y++)
                    for (let x = r.gx; x < r.gx + r.w; x++) blocked[y * G + x] = 1;

            const free = [];
            for (let i = 0; i < G * G; i++) if (!blocked[i]) free.push(i);
            const seen = new Uint8Array(G * G);
            const stack = [free[0]];
            seen[free[0]] = 1;
            let count = 1;
            while (stack.length) {
                const c = stack.pop(), cx = c % G, cy = (c / G) | 0;
                const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                for (const [nx, ny] of nb) {
                    if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
                    const ni = ny * G + nx;
                    if (!blocked[ni] && !seen[ni]) { seen[ni] = 1; count++; stack.push(ni); }
                }
            }
            if (count !== free.length || free.length < G * G * 0.55) continue;

            const clear = (x, y, k) => {
                if (x < k || y < k || x > G - 1 - k || y > G - 1 - k) return false;
                for (let dy = -k; dy <= k; dy++)
                    for (let dx = -k; dx <= k; dx++) if (blocked[(y + dy) * G + (x + dx)]) return false;
                return true;
            };

            const mutual = 9 - Math.floor(attempt / 10);
            const cands = [];
            for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (clear(x, y, 2)) cands.push([x, y]);
            shuffle(cands, rnd);
            const spawns = [];
            for (const [x, y] of cands) {
                if (spawns.some((s) => Math.hypot(x - s.gx, y - s.gy) < mutual)) continue;
                const px = x * C + C / 2, py = y * C + C / 2;
                const base = Math.atan2(H / 2 - py, W / 2 - px);
                let ang = null;
                for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
                    const a = base + off;
                    let good = true;
                    for (let t = 0; t <= 72; t += 4) {
                        const bx = px - Math.cos(a) * t, by = py - Math.sin(a) * t;
                        if (bx < 14 || bx > W - 14 || by < 14 || by > H - 14) { good = false; break; }
                        if (rects.some((r) => bx > r.gx * C - 8 && bx < (r.gx + r.w) * C + 8 && by > r.gy * C - 8 && by < (r.gy + r.h) * C + 8)) { good = false; break; }
                    }
                    if (good) { ang = a; break; }
                }
                if (ang == null) continue;
                spawns.push({ gx: x, gy: y, x: px, y: py, ang });
                if (spawns.length === 4) break;
            }
            if (spawns.length < 4) continue;

            const fc = [];
            for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (clear(x, y, 1)) fc.push([x, y]);
            shuffle(fc, rnd);
            const foods = [];
            for (const [x, y] of fc) {
                if (spawns.some((s) => Math.hypot(x - s.gx, y - s.gy) < 3.5)) continue;
                foods.push({ x: x * C + C / 2, y: y * C + C / 2, v: 1, r: 4.5 });
                if (foods.length === FOOD_N) break;
            }
            if (foods.length < FOOD_N) continue;

            return { walls: rects.map((r) => [r.gx * C, r.gy * C, r.w * C, r.h * C]), spawns, foods };
        }
        /* fallback: arena terbuka, dijamin bisa diselesaikan */
        const spawns = [
            { x: 150, y: 450, ang: -Math.PI / 4 }, { x: 450, y: 150, ang: (3 * Math.PI) / 4 },
            { x: 150, y: 150, ang: Math.PI / 4 }, { x: 450, y: 450, ang: (-3 * Math.PI) / 4 },
        ];
        const foods = [];
        for (let i = 0; i < FOOD_N; i++) foods.push({ x: 40 + rnd() * (W - 80), y: 40 + rnd() * (H - 80), v: 1, r: 4.5 });
        return { walls: [], spawns, foods };
    }

    /* ---------------- entities ---------------- */
    function makeSnake(id, def, sp, level) {
        const s = {
            id, name: def.name, color: def.color, ai: def.ai,
            x: sp.x, y: sp.y, ang: sp.ang,
            speed: def.ai ? 96 + Math.min(level, 8) * 2.5 : 106,
            turnRate: def.ai ? 3.0 + Math.min(level, 8) * 0.06 : 3.9,
            len: 17 * SEG, path: [], alive: true, wait: 0,
            boost: false, boostT: 0, aiBoost: false,
            mode: "food", modeT: 1 + Math.random() * 2, prey: null, score: 0,
        };
        const need = Math.floor(s.len / SEG) + 1;
        for (let i = 0; i < need; i++) s.path.push({ x: sp.x - Math.cos(sp.ang) * SEG * i, y: sp.y - Math.sin(sp.ang) * SEG * i });
        return s;
    }

    function inWall(x, y, pad) {
        for (const r of state.walls)
            if (x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad) return true;
        return false;
    }

    function spawnFood() {
        let x = 0, y = 0;
        for (let t = 0; t < 40; t++) {
            x = B + 26 + Math.random() * (W - 2 * B - 52);
            y = B + 26 + Math.random() * (H - 2 * B - 52);
            if (inWall(x, y, 12)) continue;
            if (state.snakes.some((s) => s.alive && Math.hypot(s.x - x, s.y - y) < 46)) continue;
            break;
        }
        state.foods.push({ x, y, v: 1, r: 4.5 });
    }

    /* ---------------- serialisasi (host -> guest) ---------------- */
    function serialize(st) {
        if (!st) return null;
        return {
            v: 1, seed: st.seed, level: st.level, target: st.target, status: st.status,
            winner: st.winner, reason: st.reason, seats: st.seats, order: st.order,
            walls: st.walls,
            foods: st.foods.map((f) => [Math.round(f.x), Math.round(f.y), f.v]),
            snakes: st.snakes.map((s) => ({
                id: s.id, name: s.name, color: s.color, ai: s.ai, alive: s.alive,
                x: +s.x.toFixed(1), y: +s.y.toFixed(1), ang: +s.ang.toFixed(3),
                len: s.len, wait: +s.wait.toFixed(2), boost: s.boost, score: s.score, speed: s.speed,
                path: s.path.reduce((a, p) => { a.push(Math.round(p.x), Math.round(p.y)); return a; }, []),
            })),
        };
    }
    function deserialize(raw) {
        if (!raw) return null;
        return {
            v: 1, seed: raw.seed, level: raw.level, target: raw.target || TARGET, status: raw.status,
            winner: raw.winner == null ? null : raw.winner, reason: raw.reason || "",
            seats: raw.seats || [0, 1], order: raw.order || [0, 1, 2, 3],
            walls: raw.walls || [],
            foods: (raw.foods || []).map((f) => ({ x: f[0], y: f[1], v: f[2], r: f[2] === 2 ? 4 : 4.5 })),
            snakes: (raw.snakes || []).map((s) => {
                const path = [];
                for (let i = 0; i < s.path.length; i += 2) path.push({ x: s.path[i], y: s.path[i + 1] });
                return Object.assign({}, s, { path, boostT: 0, mode: "food", modeT: 0, prey: null, aiBoost: false, turnRate: 3.9 });
            }),
        };
    }

    /* ---------------- input ---------------- */
    function localInput() {
        const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const boost = keys.boost || mouse.down;
        let aim = null;
        const me = mySnake();
        if (mouse.on && mouse.has && !steer && me && me.alive) aim = Math.atan2(mouse.y - me.y, mouse.x - me.x);
        return { steer, boost, aim };
    }
    function inputFor(s) {
        if (isMine(s)) return localInput();
        if (online && isHost) {
            if (performance.now() - remote.ts > 1500) return { steer: 0, boost: false, aim: null };
            return remote;
        }
        return { steer: 0, boost: false, aim: null };
    }
    function turnToward(s, want, dt) {
        const d = wrap(want - s.ang);
        s.ang += clamp(d, -s.turnRate * dt, s.turnRate * dt);
    }

    /* ---------------- AI ---------------- */
    function dangerAt(s, x, y) {
        const m = B + 18;
        if (x < m || x > W - m || y < m || y > H - m) return true;
        if (inWall(x, y, 14)) return true;
        for (const o of state.snakes) {
            if (o === s || !o.alive) continue;
            const p = o.path;
            for (let i = 0; i < p.length; i += 2) {
                const dx = x - p[i].x, dy = y - p[i].y;
                if (dx * dx + dy * dy < 26 * 26) return true;
            }
        }
        return false;
    }
    function aiSteer(s, dt) {
        s.modeT -= dt;
        if (s.modeT <= 0) {
            let prey = null, bestD = 240 * 240;
            for (const o of state.snakes) {
                if (o === s || !o.alive) continue;
                const dx = o.x - s.x, dy = o.y - s.y, d2 = dx * dx + dy * dy;
                if (d2 < bestD) { bestD = d2; prey = o; }
            }
            const huntChance = Math.min(0.4 + state.level * 0.03, 0.65);
            if (prey && segs(s) > 20 && Math.random() < huntChance) { s.mode = "hunt"; s.modeT = 2.4; s.prey = prey; }
            else { s.mode = "food"; s.modeT = 2 + Math.random() * 2; s.prey = null; }
        }
        let tx = W / 2, ty = H / 2;
        if (s.mode === "hunt" && s.prey && s.prey.alive) {
            tx = clamp(s.prey.x + Math.cos(s.prey.ang) * 85, 40, W - 40);
            ty = clamp(s.prey.y + Math.sin(s.prey.ang) * 85, 40, H - 40);
        } else {
            let bf = null, bd = Infinity;
            for (const f of state.foods) {
                const dx = f.x - s.x, dy = f.y - s.y;
                const d2 = dx * dx + dy * dy - f.v * 500;
                if (d2 < bd) { bd = d2; bf = f; }
            }
            if (bf) { tx = bf.x; ty = bf.y; }
        }
        const want = Math.atan2(ty - s.y, tx - s.x);
        /* probe beberapa arah; pilih yang aman & paling dekat dengan tujuan */
        let chosen = null, bestScore = Infinity;
        for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
            const a = s.ang + off;
            if (dangerAt(s, s.x + Math.cos(a) * 46, s.y + Math.sin(a) * 46)) continue;
            if (dangerAt(s, s.x + Math.cos(a) * 24, s.y + Math.sin(a) * 24)) continue;
            const sc = Math.abs(wrap(a - want));
            if (sc < bestScore) { bestScore = sc; chosen = a; }
        }
        if (chosen == null) chosen = s.ang + Math.PI;
        turnToward(s, chosen, dt);
        s.aiBoost = s.mode === "hunt" && s.prey && s.prey.alive && segs(s) > 26 &&
            Math.hypot(s.prey.x - s.x, s.prey.y - s.y) < 170;
    }

    /* ---------------- makanan, tabrakan, akhir ronde ---------------- */
    function eatFood(s) {
        for (let i = state.foods.length - 1; i >= 0; i--) {
            const f = state.foods[i];
            const dx = s.x - f.x, dy = s.y - f.y, rr = R + f.r + 2;
            if (dx * dx + dy * dy < rr * rr) {
                s.len += (f.v === 2 ? 3 : 2) * SEG;
                s.score += f.v === 2 ? 15 : 10;
                state.foods.splice(i, 1);
                if (f.v === 1) spawnFood();
            }
        }
    }
    function killSnake(s) {
        if (!s.alive) return;
        s.alive = false;
        let dropped = 0;
        for (let i = 8; i < s.path.length && dropped < 14; i += 3) {
            const p = s.path[i];
            if (inWall(p.x, p.y, 8)) continue;
            state.foods.push({ x: clamp(p.x, B + 14, W - B - 14), y: clamp(p.y, B + 14, H - B - 14), v: 2, r: 4 });
            dropped++;
        }
        if (isMine(s)) toast(online ? "Kamu gugur — menonton…" : "Kamu gugur!");
    }
    function checkCollisions() {
        const min = B + R, mx = W - B - R, my = H - B - R;
        for (const s of state.snakes) {
            if (!s.alive || s.wait > 0) continue;
            if (isMine(s) && cheats.god && !online) continue;
            let dead = s.x < min || s.x > mx || s.y < min || s.y > my;
            if (!dead && inWall(s.x, s.y, R - 1)) dead = true;
            if (!dead) {
                outer: for (const o of state.snakes) {
                    if (o === s || !o.alive) continue;
                    const p = o.path;
                    for (let i = 0; i < p.length; i++) {
                        const dx = s.x - p[i].x, dy = s.y - p[i].y;
                        if (dx * dx + dy * dy < 12.2 * 12.2) { dead = true; break outer; }
                    }
                }
            }
            if (dead) killSnake(s);
        }
    }
    function finish(winner, reason) {
        if (!state || state.status !== "running") return;
        state.status = "over";
        state.winner = winner ? winner.id : null;
        state.reason = reason;
        const me = mySnake();
        if (!online && !cheatsUsed && me && me.score > best) {
            best = me.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* abaikan */ }
        }
        publish();
    }
    function checkEnd() {
        const st = state;
        if (!st || st.status !== "running") return;
        const champ = st.snakes.find((s) => s.alive && segs(s) >= st.target);
        if (champ) return finish(champ, displayName(champ) + " mencapai panjang " + st.target + ".");
        const alive = st.snakes.filter((s) => s.alive);
        const humans = st.snakes.filter((s) => !s.ai);
        if (humans.every((h) => !h.alive)) return finish(alive[0] || null, alive.length ? "Semua pemain gugur." : "Semua ular gugur.");
        if (alive.length <= 1) return finish(alive[0] || null, "Ular terakhir yang bertahan.");
    }

    /* ---------------- mulai / ulang / level ---------------- */
    function startGame(level, keepScore) {
        if (online && !isHost) return;
        const prevScore = keepScore && state && state.snakes && state.snakes[myIdx()] ? state.snakes[myIdx()].score : 0;
        const seed = (Math.random() * 0x7fffffff) | 0;
        const lv = generateLevel(seed, level);
        const defs = online
            ? [
                { name: "P1", color: "#10b981", ai: false },
                { name: "P2", color: "#0ea5e9", ai: false },
                { name: "Violet", color: "#8b5cf6", ai: true },
                { name: "Rose", color: "#f43f5e", ai: true },
            ]
            : [
                { name: String(playerName || "Kamu"), color: "#10b981", ai: false },
                { name: "Violet", color: "#8b5cf6", ai: true },
                { name: "Azure", color: "#0ea5e9", ai: true },
                { name: "Rose", color: "#f43f5e", ai: true },
            ];
        /* acak: titik spawn tiap ular, urutan jalan duluan, dan kursi pemain (multiplayer) */
        const spotOrder = shuffle([0, 1, 2, 3]);
        const snakes = defs.map((d, i) => makeSnake(i, d, lv.spawns[spotOrder[i]], level));
        const order = shuffle([0, 1, 2, 3]);
        snakes.forEach((s, i) => { s.wait = order.indexOf(i) * 0.45; });
        const seats = online ? shuffle([0, 1]) : [0];
        snakes[seats[0]].score = prevScore;
        state = {
            v: 1, seed, level, target: TARGET, status: "running",
            winner: null, reason: "", seats, order,
            walls: lv.walls, foods: lv.foods, snakes,
        };
        remote = { steer: 0, boost: false, aim: null, ts: 0 };
        paused = false; helpOpen = false;
        sceneKey = "";
        toast("Urutan jalan: " + order.map((i) => displayName(snakes[i])).join(" → "));
        publish();
    }

    /* ---------------- simulasi (host / offline) ---------------- */
    function update(dt) {
        const st = state;
        if (!st || st.status !== "running") return;
        for (const s of st.snakes) {
            if (!s.alive) continue;
            if (s.wait > 0) { s.wait = Math.max(0, s.wait - dt); continue; }
            let boost = false;
            if (s.ai) {
                aiSteer(s, dt);
                boost = s.aiBoost;
            } else {
                const inp = inputFor(s);
                if (inp.steer) s.ang += inp.steer * s.turnRate * dt;
                else if (inp.aim != null) turnToward(s, inp.aim, dt);
                boost = inp.boost;
            }
            s.boost = boost && segs(s) > MIN_SEG;
            const slow = s.ai && cheats.slow && !online ? 0.55 : 1;
            const spd = s.speed * slow * (s.boost ? 1.6 : 1);
            /* GERAK SELALU MAJU — input hanya mengubah sudut, bukan posisi target */
            s.x += Math.cos(s.ang) * spd * dt;
            s.y += Math.sin(s.ang) * spd * dt;
            if (isMine(s) && cheats.god && !online) { s.x = clamp(s.x, B + R, W - B - R); s.y = clamp(s.y, B + R, H - B - R); }
            const h = s.path[0];
            const dx = s.x - h.x, dy = s.y - h.y;
            if (dx * dx + dy * dy >= SEG * SEG) s.path.unshift({ x: s.x, y: s.y });
            if (s.boost && !(isMine(s) && cheats.freeBoost && !online)) {
                s.boostT += dt;
                if (s.boostT >= 0.5) { s.boostT = 0; if (segs(s) > MIN_SEG) s.len -= SEG; }
            } else s.boostT = 0;
            const need = Math.floor(s.len / SEG) + 1;
            while (s.path.length > need) s.path.pop();
            eatFood(s);
        }
        const me = mySnake();
        if (!online && cheats.magnet && me && me.alive) {
            for (const f of st.foods) {
                const dx = me.x - f.x, dy = me.y - f.y, d = Math.hypot(dx, dy);
                if (d > 1 && d < 120) {
                    const nx = f.x + (dx / d) * 170 * dt, ny = f.y + (dy / d) * 170 * dt;
                    if (!inWall(nx, ny, 6)) { f.x = nx; f.y = ny; }
                }
            }
        }
        checkCollisions();
        checkEnd();
    }

    /* prediksi gerak ringan di sisi guest agar mulus di antara snapshot */
    function extrapolate(dt) {
        const st = state;
        if (!st || st.status !== "running") return;
        for (const s of st.snakes) {
            if (!s.alive) continue;
            if (s.wait > 0) { s.wait = Math.max(0, s.wait - dt); continue; }
            const spd = s.speed * (s.boost ? 1.6 : 1);
            s.x += Math.cos(s.ang) * spd * dt;
            s.y += Math.sin(s.ang) * spd * dt;
            const h = s.path[0];
            if (h && (s.x - h.x) ** 2 + (s.y - h.y) ** 2 >= SEG * SEG) s.path.unshift({ x: s.x, y: s.y });
            const need = Math.floor(s.len / SEG) + 1;
            while (s.path.length > need) s.path.pop();
        }
    }

    /* ---------------- render ---------------- */
    function ensureScene() {
        const key = state ? state.seed + "|" + state.level + "|" + state.snakes.length : "empty";
        if (key === sceneKey) return;
        sceneKey = key;
        wallsG.innerHTML = ""; foodsG.innerHTML = ""; snakesG.innerHTML = ""; legendEl.innerHTML = "";
        snakeEls = []; foodEls = []; legEls = [];
        if (!state) return;
        for (const r of state.walls)
            wallsG.appendChild(mk("rect", { x: r[0], y: r[1], width: r[2], height: r[3], rx: 6, fill: "#e4e4e7" }));
        for (const s of state.snakes) {
            const g = mk("g", {});
            const line = mk("polyline", { fill: "none", stroke: s.color, "stroke-width": R * 2 - 1, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: "0.92" });
            const glow = mk("circle", { r: R + 6, fill: s.color, opacity: "0" });
            const ring = mk("circle", { r: R + 5, fill: "none", stroke: s.color, "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: "0" });
            const head = mk("circle", { r: R + 1, fill: s.color });
            const e1 = mk("circle", { r: 1.7, fill: "#0f172a" });
            const e2 = mk("circle", { r: 1.7, fill: "#0f172a" });
            g.appendChild(line); g.appendChild(glow); g.appendChild(ring); g.appendChild(head); g.appendChild(e1); g.appendChild(e2);
            snakesG.appendChild(g);
            snakeEls.push({ g, line, glow, ring, e1, e2 });
            const leg = document.createElement("span");
            leg.className = "snk-leg";
            leg.innerHTML = '<i style="background:' + s.color + '"></i><span></span>';
            legendEl.appendChild(leg);
            legEls.push(leg);
        }
    }
    function drawFoods() {
        const foods = state ? state.foods : [];
        while (foodEls.length < foods.length) {
            const g = mk("g", {});
            const halo = mk("circle", { opacity: "0.16", class: "pulse" });
            halo.style.animationDelay = (Math.random() * 1.6).toFixed(2) + "s";
            const dot = mk("circle", {});
            g.appendChild(halo); g.appendChild(dot);
            foodsG.appendChild(g);
            foodEls.push({ g, halo, dot });
        }
        while (foodEls.length > foods.length) foodEls.pop().g.remove();
        for (let i = 0; i < foods.length; i++) {
            const f = foods[i], el = foodEls[i];
            const color = f.v === 2 ? "#fb923c" : "#facc15";
            el.g.setAttribute("transform", "translate(" + f.x.toFixed(1) + " " + f.y.toFixed(1) + ")");
            el.dot.setAttribute("r", f.r); el.dot.setAttribute("fill", color);
            el.halo.setAttribute("r", (f.r * 2.4).toFixed(1)); el.halo.setAttribute("fill", color);
        }
    }
    function drawSnakes() {
        if (!state) return;
        for (let i = 0; i < state.snakes.length; i++) {
            const s = state.snakes[i], el = snakeEls[i];
            if (!el) continue;
            if (!s.alive) { el.g.style.display = "none"; continue; }
            if (el.g.style.display === "none") el.g.style.display = "";
            let pts = "";
            for (let j = 0; j < s.path.length; j++) pts += s.path[j].x.toFixed(1) + "," + s.path[j].y.toFixed(1) + " ";
            el.line.setAttribute("points", pts);
            el.g.setAttribute("transform", "translate(" + s.x.toFixed(1) + " " + s.y.toFixed(1) + ")");
            el.g.setAttribute("opacity", s.wait > 0 ? "0.45" : "1");
            const a = s.ang;
            el.e1.setAttribute("cx", (Math.cos(a - 0.6) * 4.4).toFixed(2));
            el.e1.setAttribute("cy", (Math.sin(a - 0.6) * 4.4).toFixed(2));
            el.e2.setAttribute("cx", (Math.cos(a + 0.6) * 4.4).toFixed(2));
            el.e2.setAttribute("cy", (Math.sin(a + 0.6) * 4.4).toFixed(2));
            el.glow.setAttribute("opacity", s.boost ? "0.3" : "0");
            el.ring.setAttribute("opacity", isMine(s) ? "0.55" : "0");
        }
    }
    function setHud(key, val) {
        if (hudCache[key] !== val) { hudCache[key] = val; hudEls[key].textContent = String(val); }
    }
    function updateHud() {
        const me = mySnake();
        setHud("score", me ? me.score : 0);
        setHud("len", me ? segs(me) : 17);
        setHud("level", state ? state.level : 1);
        setHud("rivals", state ? state.snakes.filter((s) => s.ai && s.alive).length : 3);
        setHud("best", best);
        setHidden($('[data-hud="cheatchip"]'), !(cheatsUsed && !online));
        if (state) {
            for (let i = 0; i < state.snakes.length; i++) {
                const s = state.snakes[i], leg = legEls[i];
                if (!leg) continue;
                const label = displayName(s) + (isMine(s) && online ? " (" + s.name + ")" : "");
                const span = leg.querySelector("span");
                if (span.textContent !== label) span.textContent = label;
                leg.classList.toggle("dead", !s.alive);
            }
        }
    }
    function syncUI() {
        const st = state;
        const status = st ? st.status : "lobby";
        const running = status === "running";
        const lobby = !st || status === "lobby";
        const over = status === "over";
        const me = mySnake();
        const iWon = over && me && st.winner === me.id;

        setHidden(ovStart, !lobby);
        if (lobby) {
            const guestWaiting = online && !isHost;
            $('[data-el="startSub"]').textContent = guestWaiting
                ? "Menunggu host memulai pertandingan… Kamu akan mendapat ular & posisi acak."
                : "Makan orb untuk tumbuh, hindari dinding & tubuh lawan. Menang: capai panjang " + TARGET + " atau jadi ular terakhir. Urutan jalan & posisi spawn diacak!";
            setHidden($('[data-act="start"]'), guestWaiting);
        }
        setHidden(ovOver, !over);
        if (over) {
            const key = st.seed + "|" + st.winner + "|" + st.reason + "|" + (me ? me.score : 0);
            if (key !== overKey) {
                overKey = key;
                const winner = st.snakes.find((s) => s.id === st.winner) || null;
                const title = $('[data-el="ovTitle"]');
                title.textContent = iWon ? "Kamu menang!" : winner ? (online ? displayName(winner) + " menang" : "Kamu kalah") : "Seri";
                title.className = "snk-ov-title " + (iWon ? "win" : "lose");
                $('[data-el="ovSub"]').textContent = st.reason + " Skor: " + (me ? me.score : 0) + ".";
            }
            setHidden($('[data-el="btnAgain"]'), online && !isHost);
            setHidden($('[data-el="btnNext"]'), !((!online && iWon) || (isHost && st.winner != null)));
            setHidden($('[data-el="guestNote"]'), !(online && !isHost));
        }
        setHidden(ovPause, !(paused && running && !online));
        setHidden(ovHelp, !helpOpen);
        setHidden(cheatPanel, !(cheatOpen && !online));
        setHidden($('[data-el="btnCheat"]'), online);
        setHidden($('[data-el="btnRestart"]'), online && !isHost);
        const mouseLabel = "Mouse: " + (mouse.on ? "aktif" : "nonaktif");
        if ($('[data-el="btnMouse"]').textContent !== mouseLabel) $('[data-el="btnMouse"]').textContent = mouseLabel;

        let label = "Siap", cls = "snk-status game-status";
        if (running) { label = me && !me.alive ? "Menonton" : "Bermain"; cls += " run"; }
        else if (paused) label = "Jeda";
        else if (over) { label = iWon ? "Menang" : "Selesai"; cls += " end"; }
        else if (online && !isHost) label = "Menunggu";
        if (statusEl.textContent !== label) statusEl.textContent = label;
        if (statusWrap.className !== cls) statusWrap.className = cls;
    }
    function render() { ensureScene(); drawFoods(); drawSnakes(); updateHud(); syncUI(); }

    /* ---------------- jaringan (template) ---------------- */
    function publish() {
        render();
        if (online && isHost && room.publishState) room.publishState(serialize(state)).catch(console.warn);
    }
    function publishNow() {
        if (online && isHost && room.publishState) room.publishState(serialize(state)).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!online || !isHost || actor !== 1 || !action) return;
        if (action.type === "input") {
            remote = {
                steer: clamp(Math.round(action.steer || 0), -1, 1),
                boost: Boolean(action.boost),
                aim: Number.isFinite(action.aim) ? action.aim : null,
                ts: performance.now(),
            };
        }
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function maybeSendInput(t) {
        if (!state || state.status !== "running") return;
        const inp = localInput();
        const sig = inp.steer + "|" + inp.boost;
        const aimMoved = inp.aim != null && t - lastSend > 120;
        if (sig !== lastSig || aimMoved || t - lastSend > 400) {
            lastSig = sig; lastSend = t;
            submitAction({ type: "input", steer: inp.steer, boost: inp.boost, aim: inp.aim == null ? null : +inp.aim.toFixed(3) });
        }
    }

    /* ---------------- loop ---------------- */
    function tick(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;
        const running = state && state.status === "running";
        const frozen = paused || (!online && helpOpen);
        if (running && !frozen) {
            if (!online || isHost) update(dt);
            else extrapolate(dt);
        }
        if (online && !isHost) maybeSendInput(t);
        if (online && isHost && running && !frozen) {
            pubAcc += dt;
            if (pubAcc >= PUB_MS) { pubAcc = 0; publishNow(); }
        }
        render();
    }

    /* ---------------- input: keyboard ---------------- */
    const isCtl = (c) =>
        c === "ArrowLeft" || c === "ArrowRight" || c === "KeyA" || c === "KeyD" ||
        c === "ArrowUp" || c === "KeyW" || c === "Space" || c === "ShiftLeft" ||
        c === "ShiftRight" || c === "KeyB";
    function onKeyDown(e) {
        const c = e.code;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(c) >= 0) e.preventDefault();
        if (c === "ArrowLeft" || c === "KeyA") keys.left = true;
        else if (c === "ArrowRight" || c === "KeyD") keys.right = true;
        else if (isCtl(c)) keys.boost = true;
        if (!e.repeat) {
            if (c === "KeyP" && !online && state && state.status === "running") { paused = !paused; }
            else if (c === "KeyH") helpOpen = !helpOpen;
            else if (c === "KeyC" && !online) cheatOpen = !cheatOpen;
            else if (c === "KeyM") { mouse.on = !mouse.on; toast("Mouse steer " + (mouse.on ? "aktif" : "nonaktif")); }
            else if (c === "KeyR" && (!online || isHost)) startGame(state ? state.level : 1, false);
            else if (c === "Enter") {
                if (!ovStart.hasAttribute("hidden") && (!online || isHost)) startGame(1, false);
                else if (!ovOver.hasAttribute("hidden") && (!online || isHost)) startGame(state.level, false);
            } else if (c === "Escape") { helpOpen = false; cheatOpen = false; }
        }
        if (paused && state && state.status === "running" && isCtl(c)) paused = false;
    }
    function onKeyUp(e) {
        const c = e.code;
        if (c === "ArrowLeft" || c === "KeyA") keys.left = false;
        else if (c === "ArrowRight" || c === "KeyD") keys.right = false;
        else if (isCtl(c)) keys.boost = false;
    }
    function onVis() {
        if (document.hidden && !online && state && state.status === "running") paused = true;
    }
    function onWinPointerUp() { mouse.down = false; }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerup", onWinPointerUp);

    /* ---------------- input: mouse di arena (mengarahkan, BUKAN mengejar) ---------------- */
    function svgPoint(e) {
        const m = svg.getScreenCTM();
        if (!m) return null;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        return pt.matrixTransform(m.inverse());
    }
    svg.addEventListener("pointermove", (e) => {
        const p = svgPoint(e);
        if (p) { mouse.x = p.x; mouse.y = p.y; mouse.has = true; }
    });
    svg.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const p = svgPoint(e);
        if (p) { mouse.x = p.x; mouse.y = p.y; mouse.has = true; }
        mouse.down = true;
        if (paused) paused = false;
    });
    svg.addEventListener("pointerup", () => { mouse.down = false; });
    svg.addEventListener("pointercancel", () => { mouse.down = false; });

    /* ---------------- input: tombol virtual (mobile) ---------------- */
    root.querySelectorAll("[data-hold]").forEach((b) => {
        const k = b.dataset.hold;
        b.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
            if (paused) paused = false;
            keys[k] = true;
        });
        const up = () => { keys[k] = false; };
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("lostpointercapture", up);
    });

    /* ---------------- input: klik & cheat ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const act = t.closest("[data-act]");
        if (!act) return;
        const a = act.dataset.act;
        if (a === "start") startGame(1, false);
        else if (a === "restart") startGame(state ? state.level : 1, false);
        else if (a === "next") startGame((state ? state.level : 1) + 1, true);
        else if (a === "resume") paused = false;
        else if (a === "help") helpOpen = !helpOpen;
        else if (a === "help-close") helpOpen = false;
        else if (a === "cheat" && !online) cheatOpen = !cheatOpen;
        else if (a === "mouse") { mouse.on = !mouse.on; toast("Mouse steer " + (mouse.on ? "aktif" : "nonaktif")); }
        else if (a === "grow" && !online) {
            const me = mySnake();
            if (me && me.alive && state.status === "running") { me.len += 10 * SEG; cheatsUsed = true; toast("+10 panjang"); }
        } else if (a === "wipe" && !online) {
            if (state && state.status === "running") {
                state.snakes.filter((s) => s.ai && s.alive).forEach(killSnake);
                cheatsUsed = true;
                checkEnd();
            }
        }
    }
    function handleChange(event) {
        const cb = event.target.closest("[data-cheat]");
        if (!cb || online) return;
        cheats[cb.dataset.cheat] = cb.checked;
        if (cb.checked) cheatsUsed = true;
        toast("Cheat " + cb.dataset.cheat + (cb.checked ? " aktif" : " nonaktif"));
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    ovPause.addEventListener("click", () => { paused = false; });

    /* ---------------- init sesuai template ---------------- */
    if (online) {
        sub(room.onRoom && room.onRoom((nextRoom) => { roomData = nextRoom; syncUI(); }));
        if (isHost) {
            state = { v: 1, seed: 0, level: 1, target: TARGET, status: "lobby", winner: null, reason: "", seats: [0, 1], order: [0, 1, 2, 3], walls: [], foods: [], snakes: [] };
            publish();
            sub(room.onAction && room.onAction((action) => applyAction(action, 1)));
        } else {
            sub(room.onState && room.onState((nextState) => {
                state = deserialize(nextState);
                sceneKey = ""; /* snapshot baru bisa beda level/seed */
                overKey = "";
                render();
            }));
        }
    } else {
        state = null; /* mode AI: mulai lewat overlay start, tanpa room/database */
        render();
    }
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            clearTimeout(toastT);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("pointerup", onWinPointerUp);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            subs.forEach((u) => { try { u(); } catch (e) { /* abaikan */ } });
            root.innerHTML = "";
        },
    };
}