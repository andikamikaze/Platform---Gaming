/* ==== GAME: stack-tower.js ==== */
/*
  Stack Tower — versi template baru (META + mount).
  - Mode AI  : vs Bot, siapa jalan duluan diacak (coin toss).
  - Mode Room: multiplayer turn-based, seat (P1/P2) & giliran pertama diacak host.
  - Level dibangkitkan dari seed + disimulasikan dulu agar pasti bisa diselesaikan.
  - Cheat overlay hanya aktif di mode AI (fair play online).
  Jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "stack-tower", // harus sama dengan nama file (tanpa .js)
    name: "Stack Tower",
    category: "casual",
    catLabel: "Casual",
    desc: "Jatuhkan blok yang bergerak tepat di atas tumpukan. Bagian menggantung terpotong — meleset total, menara runtuh.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="34" width="28" height="8" rx="2"/><rect x="13" y="26" width="22" height="8" rx="2"/><rect x="17" y="18" width="15" height="8" rx="2"/><rect x="20" y="10" width="9" height="8" rx="2"/><path d="M40 14v-6h-6"/></svg>',
    bg: ["#c7d2fe", "#6366f1"],
    bestKey: "stackTowerBest",
};

/* ================= konstanta & aturan murni ================= */
const W = 340, H = 480, BH = 24, PAD = 6, VIEW_N = 12, CX = W / 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function gauss(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function speedAt(lv, drops) {
    return Math.min(lv.speedMax, lv.speed0 + drops * lv.speedInc);
}
/* Hasil drop: perfect / terpotong / null (meleset total) */
function resolveDrop(lv, prev, x, w) {
    if (Math.abs(prev.x - x) <= lv.tol &&
        Math.abs(prev.x + prev.w - (x + w)) <= Math.max(lv.tol * 2, 10)) {
        return { x: prev.x, w: prev.w, perfect: true };
    }
    const l = Math.max(x, prev.x), r = Math.min(x + w, prev.x + prev.w);
    if (r - l < lv.minW) return null;
    return { x: l, w: r - l, perfect: false };
}

/* ---- Random level generator + verifikasi "bisa diselesaikan" ----
   Konfigurasi diacak dari seed, lalu disimulasikan Monte-Carlo dengan
   model pemain manusia (error ~ reaksi). Hanya lolos bila win-rate >= 25%. */
function simulateWinRate(lv) {
    const rng = mulberry32((lv.seed ^ 0x9e3779b9) >>> 0);
    const N = 90;
    let wins = 0;
    for (let s = 0; s < N; s++) {
        let prev = { x: CX - lv.baseW / 2, w: lv.baseW };
        let streak = 0, done = 0;
        for (let d = 0; d < lv.target; d++) {
            const sp = speedAt(lv, d);
            const x = prev.x + gauss(rng) * (sp * 0.05 + 1.5);
            const landed = resolveDrop(lv, prev, x, prev.w);
            if (!landed) break;
            if (landed.perfect) {
                streak++;
                if (lv.regen && streak % 3 === 0 && landed.w < lv.baseW) {
                    const grow = Math.min(lv.regen, lv.baseW - landed.w);
                    landed.x = clamp(landed.x - grow / 2, PAD, W - PAD - landed.w - grow);
                    landed.w += grow;
                }
            } else streak = 0;
            prev = landed; done++;
        }
        if (done >= lv.target) wins++;
    }
    return wins / N;
}
function generateLevel(seed) {
    const rng = mulberry32(seed);
    let lv = null;
    for (let i = 0; i < 24; i++) {
        lv = {
            seed,
            target: 8 + Math.floor(rng() * 7),          // 8..14 level
            baseW: 150 + Math.floor(rng() * 46),        // 150..195 px
            speed0: Math.round(105 + rng() * 45),
            speedInc: +(8 + rng() * 7).toFixed(1),
            speedMax: Math.round(230 + rng() * 110),
            tol: +(4 + rng() * 2.5).toFixed(1),
            minW: 8,
            regen: rng() < 0.5 ? 10 : 0,                // bonus lebar tiap 3 perfect beruntun
            botSkill: +(0.55 + rng() * 0.35).toFixed(2),
        };
        if (i > 7) { lv.speedMax = Math.round(lv.speedMax * 0.92); lv.baseW = Math.min(210, lv.baseW + 6); }
        lv.rate = simulateWinRate(lv);
        if (lv.rate >= 0.25) break;                   // tersertifikasi bisa diselesaikan
    }
    return lv;
}

/* ---- gerak blok deterministik (triangle wave, berbasis waktu) ----
   Semua klien menghitung posisi dari data state yang sama → tidak perlu
   menulis posisi ke Firebase tiap frame. */
function movingX(st, now, factor = 1) {
    const w = st.spawn.w;
    const minX = PAD, maxX = W - PAD - w;
    const range = Math.max(1, maxX - minX);
    const t = Math.max(0, (now - st.turnStartedAt) / 1000) * st.spawn.speed * factor;
    const m = t % (2 * range);
    const off = m <= range ? m : 2 * range - m;
    return st.spawn.side === "L" ? minX + off : maxX - off;
}
function spawnFor(st, now) {
    const prev = st.blocks[st.blocks.length - 1];
    st.spawn = {
        side: st.blocks.length % 2 === 1 ? "L" : "R",
        w: prev.w,
        speed: speedAt(st.level, st.drops),
    };
    st.turnStartedAt = now;
}
const rollSeats = () => (Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 });
const rollFirst = () => (Math.random() < 0.5 ? 0 : 1);
const newSeed = () => ((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0xffff);

function freshState(seed, seats, first) {
    const level = generateLevel(seed);
    return {
        v: 1, seed, level, seats, first,
        turn: first,
        phase: "ready",                               // ready | playing | ended
        blocks: [{ x: CX - level.baseW / 2, w: level.baseW, by: -1, perfect: false }],
        spawn: null, turnStartedAt: 0,
        scores: [0, 0], perfects: [0, 0], streak: [0, 0],
        drops: 0, lastEvent: null, result: null,
    };
}

/* ============================ MOUNT ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---- lokal (tidak dipublish) ---- */
    const unsubs = [];
    let raf = 0, destroyed = false;
    let paused = false, pauseAt = 0;
    let uiOverlay = null;            // null | "help" | "cheat"
    let firstRunHelp = false;        // modal help sekali saat game pertama dibuka
    let freezeAt = 0;                // penanda waktu saat overlay mengunci board
    let dismissedEnd = false;
    let botPlan = null;
    let pendingDrop = false;         // guest: tunggu state balik dari host
    let clockOffset = 0;             // guest: kompensasi jam host di depan
    let fxKey = 0;
    const fxTimers = new Set();
    const cheats = { slow: false, freeze: false, auto: false, wide: false, guide: false };
    let frozenAt = 0, cheated = false;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("stackTowerHelpSeen") === "1"; } catch (_) { }
    if (!seenHelp) {
        uiOverlay = "help";
        firstRunHelp = true;
        try { localStorage.setItem("stackTowerHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    const mySeat = () => (online ? (room.isHost ? state.seats.host : state.seats.guest) : 0);
    const botSeat = 1;
    const canManage = () => !online || room.isHost;
    const seatName = (s) => (online ? (s === mySeat() ? "Kamu" : "Lawan") : s === 0 ? "Kamu" : "Bot");
    const slowF = () => (!online && cheats.slow ? 0.5 : 1);
    const effNow = () => (paused ? pauseAt
        : (uiOverlay && freezeAt ? freezeAt
            : (!online && cheats.freeze && frozenAt ? frozenAt : Date.now() + clockOffset)));

    /* ---------------- UI: HUD bar + board penuh + overlay ---------------- */
    root.innerHTML = `
<div class="game-app st-app game-fill" data-st>
  <style>
    .st-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--bg:#f8fafc;--acc:#4f46e5;color:var(--ink);gap:10px;display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
    .st-app [hidden]{display:none!important}
    .st-app .st-hud{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
    .st-app .st-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}
    .st-app .st-chip b{color:var(--ink);font-weight:700}
    .st-app .st-chip.warn{border-color:#fecaca;background:#fef2f2;color:#b91c1c;font-weight:700}
    .st-app .st-status{gap:6px}
    .st-app .st-status .game-status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e}
    .st-app .st-spacer{flex:1 1 auto}
    .st-app .st-tools{display:flex;align-items:center;gap:6px;flex:0 0 auto;margin-left:auto}
    .st-app .st-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;white-space:nowrap}
    .st-app .st-btn:hover{border-color:var(--acc);color:var(--acc)}
    .st-app .st-btn svg{flex:none;display:block}
    .st-app .st-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
    .st-app .st-btn.primary:hover{opacity:.92;color:#fff}
    .st-app .st-btn.ghost{background:#fff;color:var(--ink)}
    .st-app .st-btn.danger{background:#dc2626;border-color:#dc2626;color:#fff}
    .st-app .st-btn:disabled{opacity:.45;cursor:not-allowed}
    .st-app .st-board{position:relative;width:100%;max-width:560px;margin:0 auto;min-width:0;min-height:0;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--bg);overflow:hidden;display:flex;align-items:center;justify-content:center}
    .st-app .st-board.mine{border-color:var(--acc);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
    .st-app .st-svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%;touch-action:manipulation;user-select:none;-webkit-user-select:none;cursor:pointer}
    .st-app .st-cut{fill:#fca5a5;animation:stFall .7s ease-in forwards}
    .st-app .st-flash{fill:none;stroke:#eab308;stroke-width:3;animation:stFlash .5s ease-out 2}
    .st-app .st-guide{fill:rgba(34,197,94,.14);stroke:rgba(34,197,94,.55);stroke-dasharray:3 3}
    .st-app .st-target{fill:none;stroke:rgba(148,163,184,.5);stroke-dasharray:4 4}
    .st-app .st-ov{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;background:rgba(248,250,252,.9)}
    .st-app .st-card{display:flex;flex-direction:column;width:min(360px,100%);max-height:100%;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.08);overflow:hidden}
    .st-app .st-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
    .st-app .st-head h3{margin:0;font-size:15px;font-weight:700}
    .st-app .st-tag{font:600 10px/1 ui-monospace,monospace;letter-spacing:.06em;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 9px}
    .st-app .st-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 16px;font-size:12.5px;line-height:1.55;color:var(--mut)}
    .st-app .st-body p,.st-app .st-body li{margin:5px 0}
    .st-app .st-body ul{margin:6px 0;padding-left:18px}
    .st-app .st-body b{color:var(--ink)}
    .st-app .st-foot{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line);background:#fff}
    .st-app .st-note{margin-right:auto;font:600 10px/1.4 ui-monospace,monospace;color:var(--mut)}
    .st-app .st-cheatrow{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}
    .st-app .st-cheatrow input{margin-top:2px;accent-color:var(--acc);width:18px;height:18px}
    .st-app .st-controls{flex:none;width:100%;max-width:560px;margin:0 auto}
    .st-app .st-drop{width:100%;min-height:44px;padding:10px 16px;font-size:14px;font-weight:700;border:0;border-radius:10px;background:var(--acc);color:#fff;cursor:pointer;touch-action:manipulation}
    .st-app .st-drop:disabled{background:#e2e8f0;color:#94a3b8;cursor:default}
    .st-app .st-hint{margin:6px auto 0;text-align:center;font-size:11px;line-height:1.5;color:var(--mut)}
    .st-app kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:10px;background:#fff}
    .st-app :is(button,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
    @keyframes stFall{to{transform:translateY(160px) rotate(14deg);opacity:0}}
    @keyframes stFlash{0%,100%{opacity:0}50%{opacity:1}}
    @media (prefers-reduced-motion:reduce){.st-app *{animation:none!important;transition:none!important}}

    /* --- final overrides: fill height + mobile refinements (PALING AKHIR) --- */
    .st-app.game-fill > .st-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;max-height:none}
    .st-app .st-icon-btn{display:inline-flex;align-items:center;gap:6px}
    .st-app .st-icon-btn svg{flex:none;display:block}
    @media (max-width:640px){
      .st-app{gap:6px}
      .st-app.game-fill > .st-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;max-height:none}
      .st-app.game-fill > .st-board:has(.st-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto;max-height:none}
      .st-app .st-hud{gap:5px}
      .st-app .st-hud .st-tools{gap:5px}
      .st-app .st-hud .st-chip{padding:4px 6px;font-size:9px}
      .st-app .st-hud .st-chip[data-el="bestchip"],.st-app .st-hud .st-chip[data-el="lvlchip"]{display:none}
      .st-app .st-hud .st-btn{min-height:32px;padding:5px 9px;font-size:9px}
      .st-app .st-hud .st-btn-label,.st-app .st-hud .st-spacer{display:none}
      .st-app .st-ov{padding:8px}
      .st-app .st-card{width:100%;height:100%;max-height:100%}
      .st-app .st-head,.st-app .st-foot{padding:10px 12px}
      .st-app .st-body{scrollbar-width:none}
      .st-app .st-body::-webkit-scrollbar{display:none}
      .st-app .st-note{display:none}
      .st-app .st-drop{min-height:44px;font-size:14px}
    }
    @media (pointer:coarse){.st-app .st-hud .st-btn:not(:disabled){min-height:32px;padding:5px 9px}}
  </style>
  <div class="st-hud">
    <span class="st-chip">TINGGI <b data-hud="height">0</b>/<b data-hud="target">0</b></span>
    <span class="st-chip">KAMU <b data-hud="me">0</b></span>
    <span class="st-chip"><span data-el="opplabel">BOT</span> <b data-hud="opp">0</b></span>
    <span class="st-chip">PERFECT <b data-hud="perfect">0</b></span>
    <span class="st-chip" data-el="bestchip">BEST <b data-hud="best">0</b></span>
    <span class="st-chip" data-el="lvlchip">LV <b data-hud="lvl">–</b></span>
    <span class="st-chip st-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Menghubungkan…</span></span>
    <span class="st-chip warn" data-el="cheatbadge" hidden>CHEAT</span>
    <span class="st-spacer"></span>
    <div class="st-tools">
      <button class="st-btn st-icon-btn primary" type="button" data-act="drop" data-el="drop" aria-label="Drop block" title="Drop block (Space)">${iconSVG("arrowDown", { size: 14 })}<span class="st-btn-label" data-el="droplabel">Drop</span></button>
      <button class="st-btn st-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="st-btn-label">Help</span></button>
      <button class="st-btn st-icon-btn" type="button" data-cheats data-el="cheatbtn" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="st-btn-label">Cheats</span></button>
      <button class="st-btn st-icon-btn" type="button" data-pause data-el="pausebtn" aria-label="Pause" title="Pause (P)"><span data-el="pauseicon">${iconSVG("pause", { size: 14 })}</span><span class="st-btn-label" data-el="pauselabel">Pause</span></button>
      <button class="st-btn st-icon-btn" type="button" data-restart data-el="restartbtn" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="st-btn-label">Restart</span></button>
      <button class="st-btn st-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="st-btn-label">Exit game</span></button>
    </div>
  </div>
  <section class="game-panel st-board" data-board data-el="board">
    <svg class="st-svg" viewBox="0 0 ${W} ${H}" data-el="svg" role="img" aria-label="Papan Stack Tower">
      <g data-el="blocks"></g>
      <g data-el="fx"></g>
    </svg>
    <div class="st-ov" data-el="ov" data-ovback hidden></div>
  </section>
  <div class="st-controls">
    <button class="st-drop" type="button" data-act="drop" data-el="dropbig" aria-label="Drop block" title="Drop block (Space)"><span data-el="droplabelbig">⬇ JATUHKAN BLOK</span></button>
    <p class="st-hint">Klik papan / tombol, atau <kbd>Space</kbd> · <kbd>P</kbd> jeda · <kbd>R</kbd> level baru · <kbd>H</kbd> panduan · <kbd>C</kbd> cheat</p>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-el="svg"]'), blocksG = $('[data-el="blocks"]'), fxG = $('[data-el="fx"]');
    const ovEl = $('[data-el="ov"]'), boardEl = $('[data-el="board"]');
    const dropBtn = $('[data-el="drop"]'), dropBigBtn = $('[data-el="dropbig"]');
    const dropLabel = $('[data-el="droplabel"]'), dropLabelBig = $('[data-el="droplabelbig"]');
    const pauseBtn = $('[data-el="pausebtn"]'), pauseIcon = $('[data-el="pauseicon"]');
    const pauseLabel = $('[data-el="pauselabel"]');
    const statusEl = $('[data-status]');
    const hud = {
        height: $('[data-hud="height"]'), target: $('[data-hud="target"]'),
        me: $('[data-hud="me"]'), opp: $('[data-hud="opp"]'),
        perfect: $('[data-hud="perfect"]'), best: $('[data-hud="best"]'), lvl: $('[data-hud="lvl"]'),
    };

    /* ---------------- render papan (per frame) ---------------- */
    const PAL = [
        ["#6366f1", "#818cf8", "#4f46e5", "#a5b4fc"], // P1 indigo
        ["#f59e0b", "#fbbf24", "#d97706", "#fcd34d"], // P2 amber
    ];
    const scrollN = () => Math.max(0, state.blocks.length + 1 - VIEW_N);
    const blockY = (i) => H - 26 - (i - scrollN() + 1) * BH;

    function renderBoard() {
        if (!state) { blocksG.innerHTML = ""; return; }
        const sc = scrollN();
        let html = `<rect x="0" y="${H - 22}" width="${W}" height="3" rx="1.5" fill="#e2e8f0"/>`;
        const goalY = H - 26 - (1 + state.level.target - sc) * BH;
        if (goalY > 8) {
            html += `<line x1="10" y1="${goalY}" x2="${W - 10}" y2="${goalY}" stroke="#cbd5e1" stroke-dasharray="5 5"/>` +
                `<text x="${W - 12}" y="${goalY - 5}" text-anchor="end" font-size="9" fill="#94a3b8">TARGET</text>`;
        }
        for (let i = sc; i < state.blocks.length; i++) {
            const b = state.blocks[i];
            const fill = b.by < 0 ? "#94a3b8" : PAL[b.by][i % 4];
            const stroke = b.perfect ? "#eab308" : "rgba(15,23,42,.10)";
            html += `<rect x="${b.x}" y="${blockY(i)}" width="${b.w}" height="${BH - 2}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${b.perfect ? 1.6 : 1}"/>`;
        }
        if (state.spawn && state.phase === "playing") {
            const y = blockY(state.blocks.length);
            const prev = state.blocks[state.blocks.length - 1];
            const x = movingX(state, effNow(), slowF());
            html += `<rect class="st-target" x="${prev.x}" y="${y}" width="${prev.w}" height="${BH - 2}" rx="4"/>`;
            if (!online && cheats.guide && state.turn === mySeat()) {
                html += `<rect class="st-guide" x="${prev.x - state.level.tol}" y="${y}" width="${state.level.tol * 2}" height="${BH - 2}" rx="3"/>`;
            }
            html += `<rect x="${x}" y="${y}" width="${state.spawn.w}" height="${BH - 2}" rx="4" fill="${PAL[state.turn][state.blocks.length % 4]}" stroke="#334155" stroke-width="1.2"/>`;
        }
        blocksG.innerHTML = html;
        renderFx();
    }

    function renderFx() {
        const ev = state.lastEvent;
        if (!ev || ev.at === fxKey) return;
        fxKey = ev.at;
        const y = blockY(ev.row);
        let html = "";
        if (ev.type === "miss") {
            html = `<rect class="st-cut" x="${ev.x}" y="${y}" width="${ev.w}" height="${BH - 2}" rx="3"/>`;
        } else if (ev.type === "cut") {
            if (ev.x < ev.kept.x) html += `<rect class="st-cut" x="${ev.x}" y="${y}" width="${ev.kept.x - ev.x}" height="${BH - 2}" rx="3"/>`;
            const kr = ev.kept.x + ev.kept.w;
            if (ev.x + ev.w > kr) html += `<rect class="st-cut" x="${kr}" y="${y}" width="${ev.x + ev.w - kr}" height="${BH - 2}" rx="3"/>`;
        } else if (ev.type === "perfect") {
            html = `<rect class="st-flash" x="${ev.kept.x}" y="${y}" width="${ev.kept.w}" height="${BH - 2}" rx="4"/>`;
        }
        fxG.innerHTML = html;
        const t = setTimeout(() => { fxG.innerHTML = ""; fxTimers.delete(t); }, 750);
        fxTimers.add(t);
    }

    /* ---------------- overlay helpers ---------------- */
    function activeOverlay() {
        if (uiOverlay) return uiOverlay;
        if (!state) return "connect";
        if (paused && !online) return "pause";
        if (state.phase === "ready") return "ready";
        if (state.phase === "ended" && !dismissedEnd) return "end";
        return null;
    }
    const card = (title, tag, body, foot) => `<div class="st-card">
      <div class="st-head"><h3>${title}</h3>${tag ? `<span class="st-tag">${tag}</span>` : ""}</div>
      <div class="st-body">${body}</div>
      ${foot ? `<div class="st-foot">${foot}</div>` : ""}
    </div>`;

    /* ---------------- render UI (saat state berubah) ---------------- */
    function renderUi() {
        if (!state) {
            statusEl.textContent = "Menghubungkan…";
            dropBtn.disabled = true; dropBigBtn.disabled = true;
            renderOverlay();
            return;
        }
        const me = mySeat(), opp = 1 - me, lv = state.level;
        hud.height.textContent = state.drops;
        hud.target.textContent = lv.target;
        hud.me.textContent = state.scores[me];
        hud.opp.textContent = state.scores[opp];
        hud.perfect.textContent = state.perfects[me];
        hud.best.textContent = best;
        hud.lvl.textContent = (lv.seed % 900) + 100;
        $('[data-el="opplabel"]').textContent = online ? "LAWAN" : "BOT";
        $('[data-el="bestchip"]').hidden = online;
        $('[data-el="cheatbtn"]').hidden = online;
        $('[data-el="pausebtn"]').hidden = online;
        $('[data-el="restartbtn"]').hidden = !canManage();
        $('[data-el="cheatbadge"]').hidden = !cheated;
        pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
        pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });

        const mine = state.phase === "playing" && state.turn === me;
        const canDrop = mine && !paused && !activeOverlay() && !pendingDrop;
        boardEl.classList.toggle("mine", mine && !paused && !uiOverlay);
        dropBtn.disabled = !canDrop; dropBigBtn.disabled = !canDrop;
        const dropText = mine ? "⬇ JATUHKAN BLOK" : state.phase === "playing" ? `Menunggu ${seatName(state.turn)}…` : "⬇ JATUHKAN BLOK";
        dropLabel.textContent = "Drop";
        dropLabelBig.textContent = dropText;

        if (state.phase === "ready") statusEl.textContent = online && !room.isHost ? "Menunggu host…" : "Siap — tekan Mulai";
        else if (state.phase === "ended") statusEl.textContent = state.result.winner === me ? "🏆 Kamu menang!" : `${seatName(state.result.winner)} menang`;
        else if (paused) statusEl.textContent = "Dijeda";
        else if (uiOverlay) statusEl.textContent = uiOverlay === "help" ? "Panduan" : "Cheat";
        else statusEl.textContent = mine ? "Giliranmu — jatuhkan!" : `Giliran ${seatName(state.turn)}…`;

        renderOverlay();
    }

    function tossText() {
        const f = state.first;
        return online
            ? `Undian: kamu pemain <b>P${mySeat() + 1}</b>, ${f === mySeat() ? "kamu" : "lawan"} jalan duluan.`
            : `Undian koin: <b>${f === 0 ? "kamu" : "Bot"}</b> jalan duluan.`;
    }
    function howToHtml() {
        const tol = state?.level?.tol ?? "±4–6";
        const target = state?.level?.target ?? "8–14";
        const regen = state?.level?.regen ? `, dan tiap 3 perfect beruntun lebar +${state.level.regen}px` : "";
        return `<ul>
      <li>Blok bergerak kiri–kanan. <b>Klik papan</b>, tombol Drop, atau <kbd>Space</kbd> untuk menjatuhkan.</li>
      <li>Bagian yang menggantung <b>terpotong</b> — blok berikutnya makin sempit.</li>
      <li>Mendarat dalam <b>±${tol}px</b> = <b>PERFECT</b> (+50, lebar utuh)${regen}.</li>
      <li>Tidak ada overlap = <b>runtuh</b> dan kalah. Capai tinggi <b>${target}</b> untuk menang.</li>
      <li>Giliran bergantian — blok berwarna <b>ungu = P1</b>, <b>kuning = P2</b>.</li>
    </ul>`;
    }
    function renderOverlay() {
        let html = "";
        if (uiOverlay === "help") {
            const rate = state?.level ? `<p>Level #${(state.level.seed % 900) + 100} dibangkitkan acak dan <b>terverifikasi bisa diselesaikan</b> (simulasi menang ${Math.round(state.level.rate * 100)}%).</p>` : "";
            html = card("Cara Bermain", "HELP",
                howToHtml() +
                `<p><b>Kontrol:</b> <kbd>Space</kbd>/<kbd>Enter</kbd>/<kbd>↓</kbd> jatuh · <kbd>P</kbd> jeda · <kbd>R</kbd> level baru · <kbd>C</kbd> cheat (offline) · <kbd>Esc</kbd> tutup.</p>${rate}`,
                `<span class="st-note">Tekan H untuk membuka lagi</span><button class="st-btn primary" type="button" data-act="help-close">Got it</button>`);
        } else if (uiOverlay === "cheat") {
            const row = (k, label, sub) => `<label class="st-cheatrow"><input type="checkbox" data-cheat="${k}" ${cheats[k] ? "checked" : ""}><span><b>${label}</b><br>${sub}</span></label>`;
            html = card("Cheat (mode offline)", "CHEAT",
                row("slow", "Slow motion ×0.5", "Blok bergerak setengah kecepatan.") +
                row("freeze", "Bekukan blok", "Blok berhenti bergerak sampai dimatikan.") +
                row("auto", "Auto perfect", "Drop milikmu selalu mendarat sempurna.") +
                row("wide", "Lebar minimum 60px", "Blok tidak bisa menipis di bawah 60px.") +
                row("guide", "Garis panduan", "Tampilkan zona perfect hijau.") +
                `<p>Skor best <b>tidak disimpan</b> saat cheat aktif. Cheat dinonaktifkan saat online.</p>`,
                `<button class="st-btn danger" type="button" data-act="cheatwin">Menang instan</button><button class="st-btn ghost" type="button" data-act="cheat-close">Tutup</button>`);
        } else if (!state) {
            html = card("Stack Tower", "ROOM", `<p>Menghubungkan ke sesi…</p>`, "");
        } else if (state.phase === "ready") {
            html = card("Stack Tower", online ? "ROOM" : "AI", howToHtml() + `<p>${tossText()}</p>`,
                canManage() ? `<button class="st-btn primary" type="button" data-act="start">Mulai game</button>` : `<span class="st-note">Menunggu host memulai…</span>`);
        } else if (paused && !online) {
            html = card("Dijeda", "PAUSE", `<p>Tekan <kbd>P</kbd> atau tombol di bawah untuk lanjut.</p>`,
                `<button class="st-btn primary" type="button" data-act="resume">Lanjutkan</button>`);
        } else if (state.phase === "ended" && !dismissedEnd) {
            const r = state.result, win = r.winner === me;
            const reason = r.reason === "miss" ? `Blok ${seatName(1 - r.winner)} meleset — menara runtuh di tinggi ${state.drops}.`
                : r.reason === "cheat" ? "Menang lewat cheat 😉"
                    : `Target ${state.level.target} tingkat tercapai!`;
            html = card(win ? "🏆 Kamu menang!" : `💥 ${seatName(r.winner)} menang`, "RESULT",
                `<p>${reason}</p>
                 <p>Skor — Kamu: <b>${state.scores[me]}</b> (${state.perfects[me]} perfect) · ${seatName(1 - me)}: <b>${state.scores[1 - me]}</b> (${state.perfects[1 - me]} perfect).</p>
                 ${!online ? `<p>Best: <b>${best}</b>${cheated ? " (cheat aktif — skor tidak dicatat)" : ""}</p>` : ""}`,
                `${canManage() ? `<button class="st-btn primary" type="button" data-act="restart">Main lagi · level baru</button>` : `<span class="st-note">Menunggu host…</span>`}<button class="st-btn ghost" type="button" data-act="closeov">Lihat papan</button>`);
        }
        ovEl.hidden = !html;
        ovEl.innerHTML = html;
    }
    function render() { renderUi(); renderBoard(); }

    /* ---------------- state & aksi (host otoritatif) ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function saveBest() {
        if (online || cheated) return;
        if (state.scores[0] > best) {
            best = state.scores[0];
            try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
        }
    }
    function resetLocalRound() {
        paused = false; pauseAt = 0; freezeAt = 0; botPlan = null;
        uiOverlay = firstRunHelp ? "help" : null;
        firstRunHelp = false;
        dismissedEnd = false; pendingDrop = false; fxKey = 0;
        Object.keys(cheats).forEach((k) => (cheats[k] = false));
        frozenAt = 0; cheated = false;
        fxTimers.forEach(clearTimeout); fxTimers.clear(); fxG.innerHTML = "";
    }
    function newRound(autoStart) {
        // Random: seed level, seat P1/P2 (online), dan siapa jalan duluan.
        state = freshState(newSeed(), online ? rollSeats() : { host: 0, guest: 1 }, rollFirst());
        resetLocalRound();
        if (autoStart) { state.phase = "playing"; spawnFor(state, Date.now()); }
        publish();
    }

    function applyAction(action, actorSeat) {
        if (!state || !action || typeof action !== "object") return;
        if (action.seed !== undefined && action.seed !== state.seed) return; // aksi basi lintas ronde
        const now = Date.now();

        if (action.type === "start") {
            if (!canManage() || state.phase !== "ready") return;
            state.phase = "playing";
            spawnFor(state, now);
        } else if (action.type === "restart") {
            if (!canManage()) return;
            newRound(true);
            return; // newRound sudah publish
        } else if (action.type === "drop") {
            if (state.phase !== "playing" || !state.spawn || actorSeat !== state.turn) return;
            if (typeof action.x !== "number" || !isFinite(action.x)) return;
            const minX = PAD, maxX = W - PAD - state.spawn.w;
            const x = clamp(action.x, minX, maxX);
            const w = state.spawn.w;
            const prev = state.blocks[state.blocks.length - 1];
            const lv = !online && cheats.wide ? { ...state.level, minW: 2 } : state.level;
            let landed = resolveDrop(lv, prev, x, w);

            if (!landed) {
                state.lastEvent = { type: "miss", x, w, row: state.blocks.length, by: actorSeat, at: now };
                state.phase = "ended";
                state.result = { winner: 1 - actorSeat, reason: "miss" };
                state.spawn = null;
                saveBest();
            } else {
                if (landed.perfect) {
                    state.perfects[actorSeat]++; state.streak[actorSeat]++; state.scores[actorSeat] += 50;
                    if (state.level.regen && state.streak[actorSeat] % 3 === 0 && landed.w < state.level.baseW) {
                        const grow = Math.min(state.level.regen, state.level.baseW - landed.w);
                        landed.x = clamp(landed.x - grow / 2, PAD, W - PAD - landed.w - grow);
                        landed.w += grow;
                    }
                } else state.streak[actorSeat] = 0;
                if (!online && cheats.wide && landed.w < 60) {
                    const c = landed.x + landed.w / 2;
                    landed.w = 60; landed.x = clamp(c - 30, PAD, W - PAD - 60);
                }
                state.scores[actorSeat] += 10 + Math.round(landed.w / 10);
                state.blocks.push({ x: landed.x, w: landed.w, perfect: landed.perfect, by: actorSeat });
                state.drops++;
                state.lastEvent = {
                    type: landed.perfect ? "perfect" : "cut",
                    x, w, kept: { x: landed.x, w: landed.w },
                    row: state.blocks.length - 1, by: actorSeat, at: now,
                };
                if (state.drops >= state.level.target) {
                    state.phase = "ended";
                    state.result = { winner: actorSeat, reason: "target" };
                    state.spawn = null;
                    saveBest();
                } else {
                    state.turn = 1 - state.turn;
                    spawnFor(state, now);
                }
            }
        } else return;
        publish();
    }

    function submitAction(action) {
        action.seed = state.seed;
        if (online && !room.isHost) {
            pendingDrop = action.type === "drop";
            renderUi();
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, online ? state.seats.host : 0);
    }

    function attemptDrop() {
        if (!state || state.phase !== "playing" || paused || activeOverlay() || pendingDrop) return;
        if (state.turn !== mySeat()) return;
        let x = movingX(state, effNow(), slowF());
        if (!online && cheats.auto) x = state.blocks[state.blocks.length - 1].x;
        submitAction({ type: "drop", x });
    }

    /* ---------------- Bot (mode AI) ---------------- */
    function planBot() {
        const prev = state.blocks[state.blocks.length - 1];
        const skill = state.level.botSkill;
        const sigma = (1 - skill) * prev.w * 0.5 + state.spawn.speed * 0.03;
        const target = clamp(prev.x + gauss(Math.random) * sigma, PAD, W - PAD - state.spawn.w);
        botPlan = { target, readyAt: effNow() + 350 + Math.random() * 550, prevX: null };
    }
    function botMaybeDrop(x, now) {
        if (!botPlan) planBot();
        if (now >= botPlan.readyAt && botPlan.prevX !== null &&
            (botPlan.prevX - botPlan.target) * (x - botPlan.target) <= 0) {
            const bx = x; botPlan = null;
            applyAction({ type: "drop", x: bx, seed: state.seed }, botSeat);
            return;
        }
        botPlan.prevX = x;
    }

    /* ---------------- cheat & jeda (offline) ---------------- */
    function shiftTime(d) {
        if (state?.spawn) state.turnStartedAt += d;
        if (botPlan) botPlan.readyAt += d;
        if (frozenAt) frozenAt += d;
    }
    function toggleCheat(key, on) {
        if (online || !(key in cheats)) return;
        const now = Date.now();
        if (key === "slow") {
            const oldF = slowF(), newF = on ? 0.5 : 1;
            if (state?.spawn) state.turnStartedAt = Math.round(now - (now - state.turnStartedAt) * oldF / newF);
            cheats.slow = on;
        } else if (key === "freeze") {
            if (on) { cheats.freeze = true; frozenAt = now; }
            else { cheats.freeze = false; shiftTime(now - frozenAt); frozenAt = 0; }
        } else cheats[key] = on;
        if (on) cheated = true;
        renderUi();
    }
    function cheatWin() {
        if (online || !state || state.phase !== "playing") return;
        cheated = true;
        while (state.drops < state.level.target) {
            const p = state.blocks[state.blocks.length - 1];
            state.blocks.push({ x: p.x, w: p.w, perfect: true, by: 0 });
            state.drops++;
        }
        state.phase = "ended";
        state.result = { winner: 0, reason: "cheat" };
        state.spawn = null;
        setOverlay(null);
        publish();
    }

    /* Overlays saling menekan + kunci waktu while open */
    function setOverlay(next) {
        const prev = uiOverlay;
        uiOverlay = next;
        const now = Date.now();
        if (!prev && next && state && state.phase === "playing" && !paused) freezeAt = now;
        else if (prev && !next && freezeAt) { shiftTime(now - freezeAt); freezeAt = 0; }
        renderUi();
    }
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? (on ? "help" : null) : (uiOverlay === "help" ? null : "help");
        setOverlay(next);
    }
    function toggleCheats(on) {
        if (online) return;
        const next = typeof on === "boolean" ? (on ? "cheat" : null) : (uiOverlay === "cheat" ? null : "cheat");
        setOverlay(next);
    }
    function togglePause(on) {
        if (online || !state || state.phase !== "playing") return;
        if (typeof on === "boolean" && on === paused) return;
        if (!paused) { paused = true; pauseAt = Date.now(); }
        else { shiftTime(Date.now() - pauseAt); paused = false; pauseAt = 0; }
        renderUi();
    }
    function dismissEnd() {
        if (state?.phase === "ended") { dismissedEnd = true; renderUi(); }
    }
    function restart() {
        if (!canManage()) return;
        if (paused) { shiftTime(Date.now() - pauseAt); paused = false; pauseAt = 0; }
        submitAction({ type: "restart" });
    }

    /* ---------------- events: mouse / touch / keyboard ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) { restart(); return; }
        const btn = t.closest("[data-act]");
        if (btn) {
            const a = btn.dataset.act;
            if (a === "drop") attemptDrop();
            else if (a === "start") submitAction({ type: "start" });
            else if (a === "resume") togglePause(false);
            else if (a === "help-close") toggleHelp(false);
            else if (a === "cheat-close") toggleCheats(false);
            else if (a === "cheatwin") cheatWin();
            else if (a === "closeov") { if (uiOverlay) setOverlay(null); else dismissEnd(); }
            return;
        }
        if (t.hasAttribute && t.hasAttribute("data-ovback") && uiOverlay) { setOverlay(null); return; }
        if (activeOverlay() === "end") dismissEnd();
    }
    function handleChange(event) {
        const cb = event.target.closest("[data-cheat]");
        if (cb) toggleCheat(cb.dataset.cheat, cb.checked);
    }
    function handlePointer(event) {
        event.preventDefault();
        attemptDrop();
    }
    function handleKey(e) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest && e.target.closest("button,input,textarea") && (e.key === " " || e.key === "Enter")) return;
        switch (e.code) {
            case "KeyH": e.preventDefault(); toggleHelp(); return;
            case "KeyC": e.preventDefault(); if (!online && uiOverlay !== "help") toggleCheats(); return;
            case "KeyP":
                e.preventDefault();
                if (uiOverlay === "help") { toggleHelp(false); return; }
                if (uiOverlay === "cheat") { toggleCheats(false); return; }
                if (paused) { togglePause(false); return; }
                togglePause(true); return;
            case "Escape":
                e.preventDefault();
                if (uiOverlay === "help") { toggleHelp(false); return; }
                if (uiOverlay === "cheat") { toggleCheats(false); return; }
                if (paused) { togglePause(false); return; }
                dismissEnd(); return;
            case "KeyR": e.preventDefault(); restart(); return;
            case "Space": case "Enter": case "ArrowDown":
                e.preventDefault();
                if (uiOverlay === "help") { toggleHelp(false); return; }
                if (uiOverlay === "cheat") { toggleCheats(false); return; }
                if (paused) { togglePause(false); return; }
                if (!state) return;
                if (state.phase === "ready") { if (canManage()) submitAction({ type: "start" }); return; }
                if (state.phase === "ended") { dismissEnd(); return; }
                attemptDrop(); return;
        }
    }
    function handleVis() {
        if (document.hidden && !online && state?.phase === "playing" && !paused) togglePause(true);
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    svgEl.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("visibilitychange", handleVis);

    /* ---------------- loop animasi ---------------- */
    function frame() {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!state) return;
        if (state.phase === "playing" && state.spawn) {
            if (!online && state.turn === botSeat && !paused && !activeOverlay()) {
                botMaybeDrop(movingX(state, effNow(), slowF()), effNow());
            } else if (state.turn !== botSeat) botPlan = null;
        }
        renderBoard();
    }

    /* ---------------- inisialisasi mode ---------------- */
    const sub = (u) => { if (typeof u === "function") unsubs.push(u); };
    if (online) {
        sub(room.onRoom((next) => { roomData = next; renderUi(); }));
        if (room.isHost) {
            newRound(false); // host: buat ronde (seat & giliran pertama acak) lalu publish
            sub(room.onAction((action) => applyAction(action, state ? state.seats.guest : 1)));
        } else {
            sub(room.onState((next) => {
                if (!next) return;
                state = next;
                pendingDrop = false; botPlan = null;
                const d = state.turnStartedAt - Date.now();
                clockOffset = d > 0 ? d : Math.max(0, clockOffset - 50);
                render();
            }));
        }
    } else {
        newRound(false); // offline: coin toss kamu vs Bot
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svgEl.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener("visibilitychange", handleVis);
            fxTimers.forEach(clearTimeout); fxTimers.clear();
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}
