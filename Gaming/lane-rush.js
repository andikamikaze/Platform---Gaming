/* ==== GAME: lane-rush.js ==== */
import { iconSVG } from "../JS/icons.js";
/* Lane Rush — sprint 4 jalur 2000 m.
   Mode: Solo, Duel vs Bot, Duel vs Pemain (room), traffic searah / 2 arah.
   Generator dijamin solvable (jalur aman random-walk maks 1 lajur/baris).
   Tabrakan = fisika knockback + durabilitas berkurang (bukan instant crash). */

export const META = {
    id: "lane-rush", // harus sama dengan nama file (tanpa .js)
    name: "Lane Rush",
    category: "racing",
    catLabel: "Racing",
    desc: "Sprint 4 jalur sejauh 2000 m: salip traffic, jaga durabilitas, menangkan duel.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="18" y="5" width="12" height="30" rx="5"/><path d="M21 12h6M21 28h6"/><path d="M14 13v8M34 13v8M14 27v8M34 27v8"/><path d="M20 40v4M28 40v4"/></svg>',
    bg: ["#312e81", "#4338ca"],
    bestKey: "laneRushBest",
};

/* ================= konstanta & data murni (tanpa DOM) ================= */
const LANES = 4, WIN_DIST = 2000, PX_PER_M = 10;
const SPEED0 = 220, SPEED_MAX = 520;
const ROAD_X = 60, LANE_W = 90, TRACK_W = 480, BOARD_H = 640;
const SPAWN_AHEAD = 80, DROP_BEHIND = 18, BASE_CY = 556;
const SVGNS = "http://www.w3.org/2000/svg";
const PUB_MS = 100; /* laju publish state host ke Firebase */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const laneX = (i) => ROAD_X + LANE_W / 2 + i * LANE_W;
const speedAt = (d) => SPEED0 + (SPEED_MAX - SPEED0) * Math.min(1, d / WIN_DIST);
const rowSpacing = (d) => 55 - 25 * Math.min(1, d / WIN_DIST);
const overlap = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* kendaraan player (dipilih lewat pop-up sebelum mulai) */
const RIDES = [
    { id: "hatch", name: "Hatchback", hp: 100, top: 1.00, handle: 150, w: 42, h: 70, col: "#6366f1" },
    { id: "sport", name: "GT Sport", hp: 75, top: 1.14, handle: 110, w: 42, h: 66, col: "#ef4444" },
    { id: "muscle", name: "Muscle", hp: 110, top: 1.08, handle: 160, w: 44, h: 74, col: "#f59e0b" },
    { id: "suv", name: "SUV", hp: 150, top: 0.93, handle: 180, w: 46, h: 80, col: "#10b981" },
    { id: "van", name: "Van", hp: 130, top: 0.90, handle: 190, w: 46, h: 84, col: "#94a3b8" },
];
const rideOf = (p) => RIDES.find((r) => r.id === p.vehicle) || RIDES[0];

/* variasi mobil musuh: ukuran, kecepatan, massa berbeda */
const TRAFFIC = [
    { id: "sedan", w: 42, h: 70, f: [0.55, 0.78], mass: 1.0, wt: 26 },
    { id: "taxi", w: 42, h: 70, f: [0.55, 0.75], mass: 1.0, wt: 12, col: "#fbbf24" },
    { id: "sport", w: 42, h: 64, f: [0.72, 0.92], mass: 0.9, wt: 10 },
    { id: "pickup", w: 44, h: 80, f: [0.50, 0.68], mass: 1.25, wt: 12 },
    { id: "van", w: 46, h: 86, f: [0.48, 0.65], mass: 1.4, wt: 12 },
    { id: "truck", w: 48, h: 112, f: [0.42, 0.58], mass: 1.9, wt: 10 },
    { id: "bus", w: 48, h: 132, f: [0.40, 0.55], mass: 2.3, wt: 8 },
    { id: "police", w: 44, h: 74, f: [0.68, 0.88], mass: 1.1, wt: 6, col: "#e5e7eb" },
];
const TYPE_TOTAL = TRAFFIC.reduce((s, t) => s + t.wt, 0);
function pickType(r) {
    let x = r() * TYPE_TOTAL;
    for (const t of TRAFFIC) { x -= t.wt; if (x < 0) return t; }
    return TRAFFIC[0];
}
const PALETTE = ["#f87171", "#fb923c", "#fbbf24", "#a3e635", "#34d399", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#94a3b8"];

/* ================= pembangun SVG ================= */
function playerSvg(ride) {
    const { w, h, col } = ride, x = -w / 2, y = -h / 2;
    return `<rect x="${x - 3}" y="${y + h - 10}" width="${w + 6}" height="6" rx="3" fill="#111827" opacity=".85"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${col}"/>
<rect x="-7" y="${y + 6}" width="5" height="${h - 12}" rx="2.5" fill="#fff" opacity=".8"/>
<rect x="2" y="${y + 6}" width="5" height="${h - 12}" rx="2.5" fill="#fff" opacity=".8"/>
<rect x="${x + 5}" y="${y + 9}" width="${w - 10}" height="12" rx="3" fill="#0b1020" opacity=".65"/>
<rect x="${x + 5}" y="${y + h - 18}" width="${w - 10}" height="9" rx="3" fill="#0b1020" opacity=".5"/>
<rect x="${x + 3}" y="${y + 2}" width="8" height="4" rx="2" fill="#fef3c7"/><rect x="${x + w - 11}" y="${y + 2}" width="8" height="4" rx="2" fill="#fef3c7"/>
<rect x="${x + 3}" y="${y + h - 6}" width="8" height="4" rx="2" fill="#ef4444"/><rect x="${x + w - 11}" y="${y + h - 6}" width="8" height="4" rx="2" fill="#ef4444"/>`;
}

function trafficSvg(t, col) {
    const { w, h } = t, x = -w / 2, y = -h / 2, glass = "#0b1020";
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${col}"/>`;
    if (t.id === "truck") {
        s += `<rect x="${x + 2}" y="${y + 24}" width="${w - 4}" height="${h - 28}" rx="6" fill="#cbd5e1"/>`;
        s += `<rect x="${x + 5}" y="${y + 8}" width="${w - 10}" height="10" rx="3" fill="${glass}" opacity=".6"/>`;
        s += `<rect x="${x + 2}" y="${y + 22}" width="${w - 4}" height="3" fill="#0b1020" opacity=".35"/>`;
    } else if (t.id === "bus") {
        for (let i = 0; i < 5; i++) s += `<rect x="${x + 5}" y="${y + 12 + i * 22}" width="${w - 10}" height="12" rx="3" fill="${glass}" opacity=".5"/>`;
    } else if (t.id === "pickup") {
        s += `<rect x="${x + 5}" y="${y + 10}" width="${w - 10}" height="11" rx="3" fill="${glass}" opacity=".6"/>`;
        s += `<rect x="${x + 4}" y="${y + 30}" width="${w - 8}" height="${h - 38}" rx="4" fill="#0b1020" opacity=".28"/>`;
    } else if (t.id === "van") {
        s += `<rect x="${x + 5}" y="${y + 9}" width="${w - 10}" height="12" rx="3" fill="${glass}" opacity=".6"/>`;
        s += `<rect x="${x + 6}" y="${y + 28}" width="${w - 12}" height="${h - 40}" rx="4" fill="#fff" opacity=".14"/>`;
    } else {
        s += `<rect x="${x + 5}" y="${y + 10}" width="${w - 10}" height="12" rx="3" fill="${glass}" opacity=".6"/>`;
        s += `<rect x="${x + 5}" y="${y + h - 19}" width="${w - 10}" height="9" rx="3" fill="${glass}" opacity=".45"/>`;
        s += `<rect x="-2.5" y="${y + 26}" width="5" height="${Math.max(6, h - 52)}" rx="2.5" fill="#fff" opacity=".18"/>`;
    }
    if (t.id === "taxi") s += `<rect x="-7" y="-4" width="14" height="9" rx="2" fill="#111827"/><rect x="-5" y="-2" width="10" height="5" rx="1" fill="#fde68a"/>`;
    if (t.id === "police") s += `<rect x="${x}" y="${y + h * 0.55}" width="${w}" height="9" fill="#111827" opacity=".8"/><rect x="-10" y="${y + 24}" width="20" height="7" rx="2" fill="#111827"/><rect x="-8" y="${y + 25.5}" width="7" height="4" rx="1" fill="#ef4444"/><rect x="1" y="${y + 25.5}" width="7" height="4" rx="1" fill="#3b82f6"/>`;
    s += `<rect x="${x + 3}" y="${y + 2}" width="8" height="4" rx="2" fill="#fef9c3"/><rect x="${x + w - 11}" y="${y + 2}" width="8" height="4" rx="2" fill="#fef9c3"/>`;
    s += `<rect x="${x + 3}" y="${y + h - 6}" width="8" height="4" rx="2" fill="#ef4444"/><rect x="${x + w - 11}" y="${y + h - 6}" width="8" height="4" rx="2" fill="#ef4444"/>`;
    return s;
}

function scenerySvg(twoWay) {
    let s = `<rect x="0" y="0" width="480" height="640" fill="#0d1322"/>`;
    s += `<rect x="60" y="0" width="360" height="640" fill="#1f2937"/>`;
    s += `<rect x="64" y="0" width="3" height="640" fill="#cbd5e1" opacity=".5"/>`;
    s += `<rect x="413" y="0" width="3" height="640" fill="#cbd5e1" opacity=".5"/>`;
    if (twoWay) {
        s += `<rect x="236" y="0" width="3" height="640" fill="#f59e0b" opacity=".55"/>`;
        s += `<rect x="242" y="0" width="3" height="640" fill="#f59e0b" opacity=".55"/>`;
    }
    return s;
}
function dashesSvg(twoWay) {
    let s = "";
    (twoWay ? [150, 330] : [150, 240, 330]).forEach((x) => {
        for (let y = -80; y < 640; y += 80)
            s += `<rect x="${x - 2}" y="${y}" width="4" height="34" rx="2" fill="#94a3b8" opacity=".3"/>`;
    });
    return s;
}
function postsSvg() {
    let s = "";
    for (let y = -160; y < 640; y += 160)
        [30, 444].forEach((x) => {
            s += `<rect x="${x}" y="${y}" width="6" height="16" rx="2" fill="#334155"/>`;
            s += `<rect x="${x}" y="${y}" width="6" height="5" rx="1.5" fill="#f59e0b" opacity=".8"/>`;
        });
    return s;
}
function finishSvg() {
    let s = "";
    for (let row = 0; row < 2; row++)
        for (let i = 0; i < 18; i++)
            s += `<rect x="${60 + i * 20}" y="${row * 10 - 10}" width="20" height="10" fill="${(i + row) % 2 ? "#111827" : "#e5e7eb"}"/>`;
    return s;
}

/* ============================ mount ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const canCheat = !online; /* cheat hanya offline (solo / vs bot) */
    let roomData = room?.room || null;
    let state = null;

    const unsubs = [];
    let gens = [null, null];        /* generator baris per track (host/lokal saja) */
    let botCd = [0, 0];
    let raf = 0, last = 0, lastPub = 0, goT = 0;
    let paused = false, cheatOpen = false, helpOpen = false;
    let pausedAt = 0, clockShift = 0; /* penanda waktu digeser saat resume dari jeda */
    const cheats = { god: false, ghost: false, slow: false, auto: false };
    const fx = [
        { shake: 0, flash: 0, prevHp: null },
        { shake: 0, flash: 0, prevHp: null },
    ];
    const held = { up: false, down: false };
    let lastThr = 0;
    const padTimers = {};
    let refs = [], carEls = [], builtKey = "";
    let best = null;
    try { best = Number(localStorage.getItem(META.bestKey)) || null; } catch (e) { }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("laneRushHelpSeen") === "1"; } catch (e) { }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("laneRushHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const clockNow = () => performance.now() - clockShift;

    /* ---------------- UI (minimalis, tanpa teks tutorial) ---------------- */
    root.innerHTML = `
<div class="game-app lr-app game-fill" data-lr>
<style>
.lr-app{--ink:#e5e7eb;--mut:#a9b6c8;--line:#243044;--panel:#0f1522;--acc:#6366f1;display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.lr-app *{box-sizing:border-box}.lr-app button{font:inherit}
.lr-app [hidden]{display:none!important}
.lr-app .game-panel{padding:0}
.lr-app.game-fill>.lr-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.lr-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lr-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--panel);white-space:nowrap}
.lr-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.lr-bar{display:inline-block;width:52px;height:5px;border-radius:3px;background:#1e293b;overflow:hidden;vertical-align:middle}
.lr-bar i{display:block;height:100%;background:#34d399}
.lr-spacer{flex:1 1 auto}
.lr-board{position:relative;width:100%;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#0b0f1a}
.lr-board .lr-svg{width:100%;height:100%;display:block;touch-action:none}
.lr-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,8,15,.72);backdrop-filter:blur(3px);padding:16px;z-index:5}
.lr-card{background:#0f1522;border:1px solid var(--line);border-radius:12px;padding:20px;max-width:min(520px,100%);max-height:100%;width:100%;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.lr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.lr-card h3{margin:0;font-size:18px}
.lr-card h3.win{color:#34d399}.lr-card h3.lose{color:#f87171}
.lr-body{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px}
.lr-foot{flex:none;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.lr-sub{font-size:13px;color:var(--mut);margin:0;line-height:1.55}
.lr-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.lr-seg{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.lr-seg button{flex:1;min-height:44px;padding:0 12px;font-size:13px;background:transparent;color:var(--mut);border:0;cursor:pointer}
.lr-seg button.on{background:var(--acc);color:#fff}
.lr-seg button:disabled{opacity:.45;cursor:default}
.lr-rides{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px}
.lr-ride{border:1px solid var(--line);border-radius:10px;padding:12px 8px;min-height:96px;background:#0b101c;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--ink)}
.lr-ride.on{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.lr-ride svg{width:36px;height:56px}
.lr-ride-name{font-size:12px}
.lr-stat{width:100%;height:4px;background:#1e293b;border-radius:2px;overflow:hidden}
.lr-stat i{display:block;height:100%}
.lr-btn{background:var(--acc);border:1px solid var(--acc);color:#fff;min-height:38px;padding:0 14px;border-radius:9px;font-weight:600;cursor:pointer;font-size:12px}
.lr-btn.ghost{background:transparent;border-color:var(--line);color:var(--ink);font-weight:500}
.lr-btn.on{background:var(--acc);color:#fff}
.lr-btn:disabled{opacity:.45;cursor:default}
.lr-icon-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;font-size:10px}
.lr-icon-btn svg{flex:none;display:block}
.lr-row{display:flex;gap:8px;flex-wrap:wrap}
.lr-count{font-size:72px;font-weight:800;color:#e5e7eb;text-align:center;line-height:1}
.lr-first{margin-top:10px;text-align:center}
.lr-go{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:800;color:#34d399;pointer-events:none;z-index:4}
.lr-help{font-size:12px;color:var(--mut);line-height:1.6}
.lr-help b{display:block;color:var(--ink);font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
.lr-help ul{margin:0 0 10px;padding-left:18px}
.lr-help kbd{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:0 4px}
.lr-cheat-list{display:flex;flex-direction:column;gap:4px}
.lr-cheat-list label{display:flex;justify-content:space-between;align-items:center;min-height:36px;font-size:13px;gap:8px}
.lr-cheat-list input{accent-color:var(--acc);width:18px;height:18px}
.lr-pad{display:none;gap:8px;justify-content:space-between;flex:none}
.lr-pad .grp{display:flex;gap:8px}
.lr-key{width:56px;min-width:56px;min-height:48px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:16px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lr-key:active,.lr-key.held{background:var(--acc);border-color:var(--acc)}
@media (pointer:coarse),(max-width:720px){.lr-pad{display:flex}}
@media (max-width:640px){
.lr-app{gap:8px}
.lr-chip{padding:4px 6px;font-size:9px}
.lr-card{padding:14px;gap:10px;width:100%;height:100%;max-height:100%}
.lr-rides{grid-template-columns:repeat(2,minmax(0,1fr))}
.lr-key{width:48px;min-width:48px}
.lr-ov{padding:8px}
}
@media (prefers-reduced-motion:reduce){
.lr-btn,.lr-seg button,.lr-key,.lr-ride{transition:none}
.lr-go{animation:none}
}

/* --- fill height + HUD refinements (must stay last) --- */
.lr-icon-btn{display:inline-flex;align-items:center;gap:6px}
.lr-icon-btn svg{flex:none;display:block}
@media (pointer:coarse){.lr-app button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.lr-app.game-fill>.lr-board:not(:has(.lr-ov:not([hidden]))){aspect-ratio:3/4;flex:0 0 auto}
.lr-app.game-fill>.lr-board:has(.lr-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.lr-app .lr-hud{gap:5px}
.lr-app .lr-hud .lr-chip{padding:4px 6px;font-size:9px}
.lr-app .lr-hud .lr-chip[data-hud="first"]{display:none}
.lr-app .lr-hud .lr-btn{min-height:32px;padding:5px 9px;font-size:9px}
.lr-app .lr-hud .lr-btn-label,.lr-app .lr-hud .lr-spacer{display:none}
.lr-app .lr-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.lr-app .lr-body{scrollbar-width:none}
.lr-app .lr-body::-webkit-scrollbar{display:none}
.lr-app .lr-foot{position:static;margin:0;padding-top:8px;border-top:1px solid var(--line)}
}
</style>
<div class="lr-hud">
  <span class="lr-chip">STATUS <b data-status>Siap</b></span>
  <span class="lr-chip">WAKTU <b data-time>0.0</b>s</span>
  <span class="lr-chip" data-bestchip hidden>TB <b data-best>–</b>s</span>
  <span class="lr-chip" data-mode>Solo</span>
  <span class="lr-chip">JARAK <b data-hud-dist>0</b>m</span>
  <span class="lr-chip">HP <span class="lr-bar"><i data-hud-hp></i></span></span>
  <span class="lr-chip" data-hud="first">FIRST —</span>
  <span class="lr-spacer"></span>
  <button class="lr-btn lr-icon-btn" type="button" data-steer="-1" aria-label="Lajur kiri" title="Lajur kiri (A / ←)">${iconSVG("arrowLeft", { size: 14 })}</button>
  <button class="lr-btn lr-icon-btn" type="button" data-steer="1" aria-label="Lajur kanan" title="Lajur kanan (D / →)">${iconSVG("arrowRight", { size: 14 })}</button>
  <button class="lr-btn lr-icon-btn" type="button" data-help aria-label="Cara bermain" title="Cara bermain (H)">${iconSVG("helpCircle", { size: 14 })}<span class="lr-btn-label">Bantuan</span></button>
  <button class="lr-btn lr-icon-btn" type="button" data-cheats data-cheatbtn aria-label="Cheat" title="Cheat (C)" hidden>${iconSVG("wrench", { size: 14 })}<span class="lr-btn-label">Cheat</span></button>
  <button class="lr-btn lr-icon-btn" type="button" data-pause data-pausebtn aria-label="Jeda" title="Jeda (P)" hidden>${iconSVG("pause", { size: 14 })}<span class="lr-btn-label">Jeda</span></button>
  <button class="lr-btn lr-icon-btn" type="button" data-restart data-restartbtn aria-label="Ulangi" title="Ulangi (R)">${iconSVG("refresh", { size: 14 })}<span class="lr-btn-label">Ulang</span></button>
  <button class="lr-btn lr-icon-btn" type="button" data-exit aria-label="Keluar game" title="Keluar game">${iconSVG("logOut", { size: 14 })}<span class="lr-btn-label">Keluar</span></button>
</div>
<section class="game-panel lr-board" data-board>
  <svg class="lr-svg" data-svg viewBox="0 0 480 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
  <div class="lr-ov" data-ov="setup">
    <div class="lr-card">
      <div class="lr-head"><h3>Pilih kendaraan</h3></div>
      <div class="lr-body">
        <div data-moderow>
          <div class="lr-label">Mode</div>
          <div class="lr-seg" style="margin-top:6px">
            <button type="button" data-seg data-set="mode" data-val="solo">Solo</button>
            <button type="button" data-seg data-set="mode" data-val="bot">vs Bot</button>
          </div>
        </div>
        <div>
          <div class="lr-label">Lalu lintas</div>
          <div class="lr-seg" style="margin-top:6px">
            <button type="button" data-seg data-set="traffic" data-val="1">Searah</button>
            <button type="button" data-seg data-set="traffic" data-val="2">2 Arah</button>
          </div>
        </div>
        <div>
          <div class="lr-label">Kendaraan</div>
          <div class="lr-rides" style="margin-top:6px">
            ${RIDES.map((r) => {
        const spd = Math.round(((r.top - 0.85) / 0.3) * 100);
        const arm = Math.round((r.hp / 150) * 100);
        const agl = Math.round(((200 - r.handle) / 100) * 100);
        return `<button type="button" class="lr-ride" data-ride="${r.id}">
              <svg viewBox="-26 -46 52 92" aria-hidden="true">${playerSvg(r)}</svg>
              <span class="lr-ride-name">${r.name}</span>
              <span class="lr-stat"><i style="width:${spd}%;background:#6366f1"></i></span>
              <span class="lr-stat"><i style="width:${arm}%;background:#34d399"></i></span>
              <span class="lr-stat"><i style="width:${agl}%;background:#f59e0b"></i></span>
            </button>`;
    }).join("")}
          </div>
        </div>
        <div class="lr-sub" data-opp hidden></div>
      </div>
      <div class="lr-foot"><button class="lr-btn" type="button" data-act="start" data-startbtn>Mulai</button></div>
    </div>
  </div>
  <div class="lr-ov" data-ov="count" hidden>
    <div><div class="lr-count" data-count>3</div><div class="lr-label lr-first" data-first></div></div>
  </div>
  <div class="lr-go" data-go hidden>GO!</div>
  <div class="lr-ov" data-ov="done" hidden>
    <div class="lr-card">
      <div class="lr-head"><h3 data-title>Selesai</h3></div>
      <div class="lr-body">
        <p class="lr-sub" data-reason></p>
        <p class="lr-sub" data-waitnote hidden>Menunggu host untuk rematch…</p>
      </div>
      <div class="lr-foot">
        <button class="lr-btn" type="button" data-act="again" data-againbtn>Main lagi</button>
        <button class="lr-btn ghost" type="button" data-act="tosetup" data-setupbtn>Kendaraan</button>
      </div>
    </div>
  </div>
  <div class="lr-ov" data-ov="pause" hidden>
    <div class="lr-card">
      <div class="lr-head"><h3>Jeda</h3></div>
      <div class="lr-foot"><button class="lr-btn" type="button" data-act="resume">Lanjut</button></div>
    </div>
  </div>
  <div class="lr-ov" data-ov="cheat" hidden>
    <div class="lr-card">
      <div class="lr-head"><h3>Cheat</h3><button class="lr-btn ghost" type="button" data-cheat-close>Tutup</button></div>
      <div class="lr-body lr-cheat-list">
        <label>Kebal <input type="checkbox" data-cheat="god"></label>
        <label>Tembus mobil <input type="checkbox" data-cheat="ghost"></label>
        <label>Traffic lambat <input type="checkbox" data-cheat="slow"></label>
        <label>Auto-pilot <input type="checkbox" data-cheat="auto"></label>
      </div>
      <div class="lr-foot">
        <button class="lr-btn ghost" type="button" data-cheat-act="repair">Repair</button>
        <button class="lr-btn ghost" type="button" data-cheat-act="jump">+250 m</button>
        <button class="lr-btn ghost" type="button" data-cheat-act="win">Finis</button>
      </div>
    </div>
  </div>
  <div class="lr-ov" data-ov="help" hidden>
    <div class="lr-card">
      <div class="lr-head"><h3>Cara bermain</h3><button class="lr-btn ghost" type="button" data-help-close>Tutup</button></div>
      <div class="lr-body lr-help">
        <div>
          <b>Desktop</b>
          <ul>
            <li><kbd>A</kbd>/<kbd>←</kbd> dan <kbd>D</kbd>/<kbd>→</kbd> — pindah lajur</li>
            <li><kbd>W</kbd>/<kbd>↑</kbd> gas, <kbd>S</kbd>/<kbd>↓</kbd> rem; klik papan juga mengarahkan setir</li>
            <li><kbd>Spasi</kbd> mulai / main lagi · <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · <kbd>P</kbd> jeda · <kbd>R</kbd> ulang</li>
          </ul>
          <b>Mobile</b>
          <ul>
            <li>Tombol ◀ ▶ di bawah papan untuk pindah lajur, ▲ ▼ untuk gas/rem</li>
            <li>Ketuk papan untuk mengarahkan mobil ke lajur yang disentuh</li>
          </ul>
        </div>
        <div>
          <b>Aturan</b>
          <ul>
            <li>Sprint 4 lajur sejauh 2000 m; salip traffic tanpa kehabisan durabilitas.</li>
            <li>Setiap baris dijamin punya minimal satu lajur aman, tetapi lajur aman bisa bergeser.</li>
            <li>Tabrakan memantulkan mobil dan mengurangi HP — bukan langsung kalah.</li>
            <li>Mode vs Bot atau vs Pemain: yang lebih dulu finis menang; leak coin toss menentukan start.</li>
            <li>Terbaik (TB) hanya dicatat di mode Solo dan tampil di layar hasil.</li>
          </ul>
        </div>
      </div>
      <div class="lr-foot"><button class="lr-btn" type="button" data-help-close>Mengerti</button></div>
    </div>
  </div>
</section>
<div class="lr-pad">
  <div class="grp">
    <button class="lr-key" type="button" data-pad="left" aria-label="Kiri">◀</button>
    <button class="lr-key" type="button" data-pad="right" aria-label="Kanan">▶</button>
  </div>
  <div class="grp">
    <button class="lr-key" type="button" data-pad="down" aria-label="Rem / mundur">▼</button>
    <button class="lr-key" type="button" data-pad="up" aria-label="Gas / maju">▲</button>
  </div>
</div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $("[data-svg]");
    const statusEl = $("[data-status]");
    const timeEl = $("[data-time]");
    const bestChip = $("[data-bestchip]");
    const bestEl = $("[data-best]");
    const modeEl = $("[data-mode]");
    const hudDistEl = $("[data-hud-dist]");
    const hudHpEl = $("[data-hud-hp]");
    const hudFirstEl = $('[data-hud="first"]');
    const cheatBtn = $("[data-cheatbtn]");
    const pauseBtn = $("[data-pausebtn]");
    const restartBtn = $("[data-restartbtn]");
    const ovSetup = $('[data-ov="setup"]');
    const ovCount = $('[data-ov="count"]');
    const ovDone = $('[data-ov="done"]');
    const ovPause = $('[data-ov="pause"]');
    const ovCheat = $('[data-ov="cheat"]');
    const ovHelp = $('[data-ov="help"]');
    const countEl = $("[data-count]");
    const firstEl = $("[data-first]");
    const goEl = $("[data-go]");
    const titleEl = $("[data-title]");
    const reasonEl = $("[data-reason]");
    const againBtn = $("[data-againbtn]");
    const setupBtn = $("[data-setupbtn]");
    const waitNote = $("[data-waitnote]");
    const startBtn = $("[data-startbtn]");
    const modeRow = $("[data-moderow]");
    const oppEl = $("[data-opp]");
    const padEls = {
        left: $('[data-pad="left"]'), right: $('[data-pad="right"]'),
        up: $('[data-pad="up"]'), down: $('[data-pad="down"]'),
    };

    /* ---------------- state (serializable utk Firebase) ---------------- */
    function freshState(prev) {
        const duel = online ? true : Boolean(prev?.duel);
        const twoWay = Boolean(prev?.twoWay);
        const players = [];
        for (let i = 0; i < (duel ? 2 : 1); i++) {
            const veh = prev?.players?.[i]?.vehicle ?? (!online && i === 0 ? RIDES[0].id : null);
            players.push({
                vehicle: veh, input: { lane: 1, thr: 0 },
                d: 0, v: 0, thr: 1, lane: 1, xf: laneX(1), lt: 9999,
                x: laneX(1), py: BASE_CY, ang: 0, kx: 0, kvx: 0, sv: 0,
                hp: 100, maxHp: 100, inv: 0, slow: 0,
                wreck: false, wreckT: 0, finished: false, finishT: 0, unlockAt: 0,
            });
        }
        return {
            phase: "setup", seed: (Math.random() * 1e9) >>> 0,
            duel, twoWay, bot: duel && !online,
            sides: duel ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0], /* posisi track diacak */
            first: Math.random() < 0.5 ? 0 : 1,                          /* siapa start duluan diacak */
            stag: 400 + Math.floor(Math.random() * 500),
            cd: 0, t: 0, winner: null, players, cars: [[], []],
        };
    }

    function makeGen(seed, startLane) {
        return { rng: mulberry32(seed), nextD: 70, path: startLane, id: 1 };
    }

    function startRace() {
        const s = state;
        if (!s.players[0].vehicle) s.players[0].vehicle = RIDES[0].id;
        if (s.duel && !s.players[1].vehicle)
            s.players[1].vehicle = s.bot ? RIDES[Math.floor(Math.random() * RIDES.length)].id : RIDES[0].id;
        s.seed = (Math.random() * 1e9) >>> 0;
        s.sides = s.duel ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0];
        s.first = Math.random() < 0.5 ? 0 : 1;
        s.stag = 400 + Math.floor(Math.random() * 500);
        s.phase = "countdown"; s.cd = 3.0; s.t = 0; s.winner = null; s.cars = [[], []];
        const sl = s.twoWay ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2);
        s.players.forEach((p, i) => {
            const r = rideOf(p);
            Object.assign(p, {
                d: s.duel && i === s.first ? 6 : 0, v: 0, thr: 1,
                lane: sl, xf: laneX(sl), lt: 9999, x: laneX(sl), py: BASE_CY, ang: 0,
                kx: 0, kvx: 0, sv: 0, hp: r.hp, maxHp: r.hp, inv: 0, slow: 0,
                wreck: false, wreckT: 0, finished: false, finishT: 0,
                unlockAt: s.duel ? (i === s.first ? 0 : s.stag) : 0,
            });
            p.input = { lane: sl, thr: 0 };
        });
        /* seed sama untuk kedua track -> pola traffic identik, duel adil */
        gens = [makeGen(s.seed, sl), s.duel ? makeGen(s.seed, sl) : null];
        botCd = [0, 0]; goT = 0; paused = false;
        held.up = held.down = false; lastThr = 0;
        fx.forEach((f) => { f.shake = 0; f.flash = 0; f.prevHp = null; });
        buildBoard();
    }

    /* ---------------- generator baris: DIJAMIN ada jalur lolos ---------------- */
    function spawnRows(g, p, i) {
        const s = state;
        while (g.nextD - p.d < SPAWN_AHEAD && g.nextD < WIN_DIST - 20) {
            const prog = g.nextD / WIN_DIST, r = g.rng;
            const roll = r();
            const step = roll < 0.3 ? -1 : roll < 0.6 ? 0 : 1;
            g.path = clamp(g.path + step, s.twoWay ? 2 : 0, LANES - 1); /* jalur aman geser maks 1 */
            const maxCars = s.twoWay ? 2 : prog < 0.3 ? 1 : prog < 0.7 ? 2 : 3; /* tak pernah 4 */
            const n = Math.min(1 + Math.floor(r() * maxCars), maxCars);
            const others = [0, 1, 2, 3].filter((l) => l !== g.path);
            for (let k = others.length - 1; k > 0; k--) {
                const j = Math.floor(r() * (k + 1));
                [others[k], others[j]] = [others[j], others[k]];
            }
            let lanes = others.slice(0, n);
            if (s.twoWay) {
                const on = lanes.filter((l) => l < 2);
                if (on.length > 1) lanes = lanes.filter((l) => l >= 2).concat(on.slice(0, 1));
            }
            for (const l of lanes) {
                const t = pickType(r);
                s.cars[i].push({
                    id: g.id++, lane: l, d: g.nextD + (r() * 6 - 3),
                    f: t.f[0] + r() * (t.f[1] - t.f[0]),
                    t: TRAFFIC.indexOf(t), dir: s.twoWay && l < 2 ? -1 : 1,
                    col: t.col || PALETTE[Math.floor(r() * PALETTE.length)],
                    v: 0, hx: 0, hit: null,
                });
            }
            g.nextD += rowSpacing(g.nextD) * (s.twoWay ? 1.2 : 1);
        }
    }

    /* ---------------- simulasi ---------------- */
    function setLane(i, l) {
        const p = state.players[i];
        l = clamp(l, 0, LANES - 1);
        p.input.lane = l;
        if (l === p.lane) return;
        p.xf = p.x - p.kx; p.lane = l; p.lt = 0;
    }

    function stepTraffic(i, dt, spd) {
        const arr = state.cars[i];
        const buckets = Array.from({ length: 8 }, () => []);
        for (const c of arr) if (!c.hit) buckets[c.lane * 2 + (c.dir > 0 ? 1 : 0)].push(c);
        for (let b = 0; b < 8; b++) {
            const q = buckets[b], dir = b % 2 ? 1 : -1;
            q.sort((a, c) => (dir > 0 ? c.d - a.d : a.d - c.d));
            for (let j = 0; j < q.length; j++) {
                const c = q[j];
                let v = c.f * spd * dir;
                if (j > 0) {
                    const a = q[j - 1];
                    const minGap = (TRAFFIC[a.t].h + TRAFFIC[c.t].h) / (2 * PX_PER_M) + 3;
                    if (Math.abs(a.d - c.d) < minGap) v = dir > 0 ? Math.min(v, a.v) : Math.max(v, a.v);
                }
                c.v = v; c.d += (v / PX_PER_M) * dt;
            }
        }
        for (const c of arr) {
            if (!c.hit) continue;
            c.hit.t += dt;
            c.hit.vx *= Math.pow(0.05, dt);
            c.hx = clamp((c.hx || 0) + c.hit.vx * dt, -70, 70);
            c.v *= Math.pow(0.2, dt);
            c.d += (c.v / PX_PER_M) * dt;
        }
    }

    function trafficRect(c, p) {
        const t = TRAFFIC[c.t];
        const cy = BASE_CY - (c.d - p.d) * PX_PER_M;
        const cx = laneX(c.lane) + (c.hx || 0);
        return { x: cx - t.w / 2 + 3, y: cy - t.h / 2 + 3, w: t.w - 6, h: t.h - 6 };
    }

    /* fisika tabrakan: impulse + spin + damage durabilitas (bukan instant crash) */
    function hitCar(i, p, c) {
        const t = TRAFFIC[c.t];
        const rel = Math.abs(p.v - c.v / PX_PER_M);
        const god = canCheat && cheats.god && i === playerIndex;
        const dmg = god ? 0 : clamp(Math.round(rel * t.mass * 1.2), 6, 45);
        p.hp = Math.max(0, p.hp - dmg);
        const sign = p.x >= laneX(c.lane) ? 1 : -1;
        p.kvx += sign * clamp(80 + rel * 6, 80, 280);
        p.sv += sign * clamp(120 + rel * 8, 120, 520);
        p.slow = 650; p.inv = 850;
        c.hit = { t: 0, vx: -sign * clamp(60 + rel * 4, 60, 240), vr: sign * (160 + rel * 6) };
        c.v *= 0.35;
        fx[i].shake = Math.min(16, 5 + rel * 0.35);
        fx[i].flash = 1;
        if (p.hp <= 0) { p.wreck = true; p.wreckT = 0.95; p.sv = sign * 560; fx[i].shake = 18; }
    }

    /* AI bot / auto-pilot: cari lajur dengan time-to-collision terbesar */
    function botThink(i, dt, perfect) {
        botCd[i] -= dt;
        if (botCd[i] > 0) return;
        botCd[i] = perfect ? 0.09 : 0.16 + Math.random() * 0.14;
        const s = state, p = s.players[i];
        const threat = (lane) => {
            let m = 1e9;
            for (const c of s.cars[i]) {
                if (c.hit || c.lane !== lane) continue;
                const gap = c.d - p.d;
                if (gap < -4) continue;
                const closing = c.dir < 0 ? p.v + Math.abs(c.v) / PX_PER_M : Math.max(0.1, p.v - c.v / PX_PER_M);
                const ttc = gap / closing;
                m = Math.min(m, c.dir < 0 ? ttc * 0.5 : ttc);
            }
            return m;
        };
        const cur = threat(p.lane);
        if (cur < 2.2 && (perfect || Math.random() > 0.07)) {
            let bl = p.lane, bs = cur;
            for (const l of [p.lane - 1, p.lane + 1]) {
                if (l < 0 || l > 3) continue;
                if (s.twoWay && l < 2 && !perfect) continue;
                const sc = threat(l);
                if (sc > bs + 0.4) { bs = sc; bl = l; }
            }
            if (bl !== p.lane) setLane(i, bl);
        }
        p.input.thr = cur > 3.5 ? 1 : cur < 1.1 ? -1 : 0;
    }

    function idleStep(p, dt) {
        const ride = rideOf(p);
        p.lt += dt * 1000;
        const k = Math.min(1, p.lt / ride.handle), e = 1 - Math.pow(1 - k, 3);
        p.x = clamp(p.xf + (laneX(p.lane) - p.xf) * e, ROAD_X + ride.w / 2 + 2, ROAD_X + 360 - ride.w / 2 - 2);
        p.py = BASE_CY; p.ang = 0; p.v = 0;
    }

    function stepTrack(i, dt) {
        const s = state, p = s.players[i], ride = rideOf(p);
        p.inv = Math.max(0, p.inv - dt * 1000);
        p.slow = Math.max(0, p.slow - dt * 1000);
        if (p.finished) { p.v *= Math.pow(0.1, dt); p.d += p.v * dt; return; }
        if (p.wreck) {
            p.wreckT = Math.max(0, p.wreckT - dt);
            p.v *= Math.pow(0.05, dt); p.d += p.v * dt;
            p.ang += p.sv * dt; p.sv *= Math.pow(0.3, dt);
            return;
        }
        if (s.bot && i === 1) botThink(i, dt, false);
        else if (canCheat && cheats.auto && i === playerIndex) botThink(i, dt, true);
        const locked = s.t < p.unlockAt; /* stagger: yang kalah coin-toss start belakangan */
        const tgt = 1 + 0.32 * p.input.thr; /* gas / rem -> maju / mundur */
        p.thr += (tgt - p.thr) * Math.min(1, dt * 3.5);
        let spd = speedAt(p.d) * ride.top * p.thr * (p.slow > 0 ? 0.55 : 1);
        if (locked) spd = 0;
        p.v = spd / PX_PER_M;
        p.d += p.v * dt;
        p.lt += dt * 1000;
        const k = Math.min(1, p.lt / ride.handle), e = 1 - Math.pow(1 - k, 3);
        p.kvx += (-p.kx * 26 - p.kvx * 7) * dt; /* spring knockback */
        p.kx += p.kvx * dt;
        const baseX = p.xf + (laneX(p.lane) - p.xf) * e;
        p.x = clamp(baseX + p.kx, ROAD_X + ride.w / 2 + 2, ROAD_X + 360 - ride.w / 2 - 2);
        p.py = clamp(BASE_CY - (p.thr - 1) * 130, 470, 594);
        const tilt = clamp((laneX(p.lane) - baseX) * 0.12, -14, 14);
        p.sv += (-(p.ang - tilt) * 30 - p.sv * 6) * dt;
        p.ang += p.sv * dt;
        spawnRows(gens[i], p, i);
        const trafficSpd = speedAt(p.d) * (canCheat && cheats.slow && i === playerIndex ? 0.45 : 1);
        stepTraffic(i, dt, trafficSpd);
        if (p.inv <= 0 && !(canCheat && cheats.ghost && i === playerIndex)) {
            const pr = { x: p.x - ride.w / 2 + 3, y: p.py - ride.h / 2 + 3, w: ride.w - 6, h: ride.h - 6 };
            for (const c of s.cars[i]) {
                if (c.hit) continue;
                if (overlap(pr, trafficRect(c, p))) { hitCar(i, p, c); break; }
            }
        }
        const dEff = p.d + (BASE_CY - p.py) / PX_PER_M;
        if (dEff >= WIN_DIST) { p.finished = true; p.finishT = s.t; p.d = WIN_DIST; }
        s.cars[i] = s.cars[i].filter((c) => {
            if (c.hit) return c.hit.t < 1.1;
            return c.dir > 0 ? p.d - c.d < DROP_BEHIND : c.d > p.d - 30;
        });
    }

    function done(w) {
        const s = state;
        s.phase = "done"; s.winner = w;
        if (!s.duel && w === 0) {
            const t = s.players[0].finishT / 1000;
            if (best == null || t < best) {
                best = t;
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
            }
        }
        if (online && room.isHost) pushState();
        render();
    }

    function checkEnd() {
        const s = state;
        if (s.phase !== "race") return;
        if (!s.duel) {
            const p = s.players[0];
            if (p.finished) done(0);
            else if (p.wreck && p.wreckT <= 0) done(-1);
            return;
        }
        const [a, b] = s.players;
        if (a.finished || b.finished) {
            if (a.finished && b.finished) done(a.finishT <= b.finishT ? 0 : 1);
            else done(a.finished ? 0 : 1);
        } else if ((a.wreck && a.wreckT <= 0) || (b.wreck && b.wreckT <= 0)) {
            done(a.wreck && b.wreck ? -1 : a.wreck ? 1 : 0);
        }
    }

    /* ---------------- papan SVG ---------------- */
    function boardKey(s) {
        return `${s.duel}|${s.twoWay}|${s.seed}|${s.players.map((p) => p.vehicle).join(",")}`;
    }
    function ensureBoard() {
        if (state && boardKey(state) !== builtKey) buildBoard();
    }
    function trackHtml(i) {
        const ride = rideOf(state.players[i]);
        return `<g data-track="${i}">
<g data-world>
${scenerySvg(state.twoWay)}
<g data-posts>${postsSvg()}</g>
<g data-lines>${dashesSvg(state.twoWay)}</g>
<g data-finish visibility="hidden">${finishSvg()}</g>
<g data-cars></g>
<g data-player>${playerSvg(ride)}</g>
</g>
<rect data-flash x="0" y="0" width="480" height="640" fill="#ef4444" opacity="0" pointer-events="none"/>
<rect x="0" y="0" width="480" height="46" fill="#0b0f1a" opacity=".85"/>
<text data-name x="12" y="19" font-size="12" font-weight="700" fill="#e5e7eb"></text>
<text data-ride x="12" y="35" font-size="10" fill="#64748b"></text>
<rect x="170" y="14" width="120" height="8" rx="4" fill="#1e293b"/>
<rect data-hp x="170" y="14" width="120" height="8" rx="4" fill="#34d399"/>
<text data-dist x="468" y="20" text-anchor="end" font-size="13" font-weight="700" fill="#e5e7eb"></text>
<text data-spd x="468" y="36" text-anchor="end" font-size="10" fill="#94a3b8"></text>
</g>`;
    }
    function buildBoard() {
        const s = state, n = s.duel ? 2 : 1;
        svgEl.setAttribute("viewBox", `0 0 ${n * TRACK_W} ${BOARD_H}`);
        let html = "";
        for (let i = 0; i < n; i++) html += trackHtml(i);
        if (n === 2) html += `<rect x="478" y="0" width="4" height="640" fill="#1e293b"/>`;
        svgEl.innerHTML = html;
        refs = []; carEls = [];
        for (let i = 0; i < n; i++) {
            const g = svgEl.querySelector(`[data-track="${i}"]`);
            refs.push({
                g, world: g.querySelector("[data-world]"),
                posts: g.querySelector("[data-posts]"), lines: g.querySelector("[data-lines]"),
                finish: g.querySelector("[data-finish]"), cars: g.querySelector("[data-cars]"),
                player: g.querySelector("[data-player]"), flash: g.querySelector("[data-flash]"),
                name: g.querySelector("[data-name]"), ride: g.querySelector("[data-ride]"),
                hp: g.querySelector("[data-hp]"), dist: g.querySelector("[data-dist]"),
                spd: g.querySelector("[data-spd]"),
            });
            carEls.push(new Map());
        }
        builtKey = boardKey(s);
    }

    function syncCars(i) {
        const p = state.players[i], list = state.cars[i], map = carEls[i];
        const seen = new Set();
        for (const c of list) {
            seen.add(c.id);
            let g = map.get(c.id);
            if (!g) {
                g = document.createElementNS(SVGNS, "g");
                g.innerHTML = trafficSvg(TRAFFIC[c.t], c.col);
                refs[i].cars.appendChild(g);
                map.set(c.id, g);
            }
            const cy = BASE_CY - (c.d - p.d) * PX_PER_M;
            const cx = laneX(c.lane) + (c.hx || 0);
            let rot = c.dir < 0 ? 180 : 0, op = 1;
            if (c.hit) {
                rot += clamp(c.hit.vr * c.hit.t * 0.4, -200, 200);
                op = Math.max(0, 1 - Math.max(0, c.hit.t - 0.5) / 0.6);
            }
            g.setAttribute("transform", `translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${rot.toFixed(1)})`);
            g.setAttribute("opacity", op.toFixed(2));
        }
        for (const [id, g] of map) if (!seen.has(id)) { g.remove(); map.delete(id); }
    }

    function nameOf(i) {
        if (!online) return i === playerIndex ? (playerName || "Kamu") : "Bot";
        const rp = roomData?.players;
        let n = null;
        if (Array.isArray(rp)) n = rp[i]?.name;
        else if (rp && typeof rp === "object") n = Object.values(rp)[i]?.name;
        return n || (i === playerIndex ? (playerName || "Kamu") : i === 0 ? "Host" : "Guest");
    }

    /* ---------------- kontrol UI: jeda & bantuan ---------------- */
    function setPaused(on) {
        if (!state || online || state.phase === "setup" || state.phase === "done") return;
        const next = Boolean(on);
        if (next === paused) return;
        if (next) pausedAt = performance.now();
        else if (pausedAt) {
            /* geser penanda berbasis performance.now() agar tidak loncat saat lanjut */
            clockShift += performance.now() - pausedAt;
            pausedAt = 0;
        }
        paused = next;
        render();
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }

    /* ---------------- render ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = "Menghubungkan…";
            ovSetup.hidden = true;
            ovCount.hidden = true;
            ovDone.hidden = true;
            ovPause.hidden = true;
            ovCheat.hidden = true;
            ovHelp.hidden = !helpOpen;
            return;
        }
        const s = state;
        ensureBoard();
        statusEl.textContent = paused ? "Jeda"
            : s.phase === "setup" ? "Siap"
                : s.phase === "countdown" ? "Bersedia"
                    : s.phase === "race" ? "Balapan" : "Selesai";
        timeEl.textContent = (s.t / 1000).toFixed(1);
        modeEl.textContent = (online ? "vs Pemain" : s.duel ? "vs Bot" : "Solo") + (s.twoWay ? " • 2 arah" : "");
        bestChip.hidden = !(best != null && !s.duel);
        if (best != null) bestEl.textContent = best.toFixed(1);
        const me = s.players[playerIndex] || s.players[0];
        hudDistEl.textContent = Math.floor(Math.min(WIN_DIST, me.d));
        const frac = clamp(me.hp / me.maxHp, 0, 1);
        hudHpEl.style.width = Math.round(frac * 100) + "%";
        hudHpEl.style.background = frac > 0.5 ? "#34d399" : frac > 0.25 ? "#fbbf24" : "#ef4444";
        hudFirstEl.textContent = s.duel
            ? "FIRST " + (s.first === playerIndex ? "Kamu" : nameOf(1 - playerIndex).slice(0, 10))
            : "FIRST —";
        const activeCheats = Object.values(cheats).filter(Boolean).length;
        cheatBtn.hidden = !canCheat;
        cheatBtn.classList.toggle("on", activeCheats > 0);
        const cheatLabel = cheatBtn.querySelector(".lr-btn-label");
        if (cheatLabel) cheatLabel.textContent = activeCheats ? `Cheat ${activeCheats}` : "Cheat";
        pauseBtn.hidden = online;
        pauseBtn.disabled = s.phase === "setup" || s.phase === "done";
        restartBtn.hidden = online && !room.isHost;
        restartBtn.disabled = s.phase === "setup";
        const pauseLabel = pauseBtn.querySelector(".lr-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Lanjut" : "Jeda";
        pauseBtn.setAttribute("aria-label", paused ? "Lanjut" : "Jeda");
        pauseBtn.title = (paused ? "Lanjut" : "Jeda") + " (P)";
        const uiLock = helpOpen || cheatOpen;
        ovSetup.hidden = uiLock || s.phase !== "setup";
        ovCount.hidden = uiLock || s.phase !== "countdown";
        ovDone.hidden = uiLock || s.phase !== "done";
        ovPause.hidden = uiLock || !paused;
        ovCheat.hidden = helpOpen || !(cheatOpen && canCheat);
        ovHelp.hidden = !helpOpen;
        goEl.hidden = goT <= 0 || uiLock;
        if (goT > 0) goEl.style.opacity = String(Math.min(1, goT / 0.4));
        if (s.phase === "countdown") {
            countEl.textContent = String(Math.max(1, Math.ceil(s.cd)));
            firstEl.textContent = s.duel
                ? (s.first === playerIndex ? "Kamu start duluan" : nameOf(1 - playerIndex) + " start duluan")
                : "";
        }
        if (s.phase === "setup") renderSetup();
        if (s.phase === "done") renderDone();
        for (let i = 0; i < s.players.length; i++) renderTrack(i);
        padEls.up.classList.toggle("held", held.up);
        padEls.down.classList.toggle("held", held.down);
    }

    function renderSetup() {
        const s = state, me = s.players[playerIndex];
        modeRow.hidden = online;
        root.querySelectorAll('[data-set="mode"]').forEach((b) =>
            b.classList.toggle("on", (b.dataset.val === "bot") === s.duel));
        root.querySelectorAll('[data-set="traffic"]').forEach((b) => {
            b.classList.toggle("on", (b.dataset.val === "2") === s.twoWay);
            b.disabled = online && !room.isHost;
        });
        root.querySelectorAll("[data-ride]").forEach((b) =>
            b.classList.toggle("on", b.dataset.ride === me.vehicle));
        const guest = online && !room.isHost;
        startBtn.disabled = guest;
        startBtn.textContent = guest
            ? (me.vehicle ? "Siap — menunggu host…" : "Pilih kendaraan")
            : online ? "Mulai balapan" : "Mulai";
        if (online) {
            const other = s.players[1 - playerIndex];
            oppEl.hidden = false;
            oppEl.textContent = "Lawan: " + (other.vehicle ? rideOf(other).name : "belum pilih");
        } else oppEl.hidden = true;
    }

    function renderDone() {
        const s = state;
        let title, cls;
        if (s.winner === -1) { title = s.duel ? "Seri!" : "Hancur!"; cls = "lose"; }
        else if (!s.duel) { title = s.winner === 0 ? "Finis!" : "Hancur!"; cls = s.winner === 0 ? "win" : "lose"; }
        else {
            title = online ? nameOf(s.winner) + " menang!" : s.winner === playerIndex ? "Menang!" : "Kalah!";
            cls = s.winner === playerIndex ? "win" : "lose";
        }
        titleEl.textContent = title;
        titleEl.className = cls;
        if (!s.duel) {
            const p = s.players[0];
            reasonEl.textContent = s.winner === 0
                ? `2000 m • ${(p.finishT / 1000).toFixed(1)} s • durabilitas ${Math.round((p.hp / p.maxHp) * 100)}%`
                : `${Math.floor(Math.min(WIN_DIST, p.d))} m • ${(s.t / 1000).toFixed(1)} s`;
        } else {
            reasonEl.textContent =
                s.players.map((p, i) => `${nameOf(i)} ${Math.floor(Math.min(WIN_DIST, p.d))} m`).join(" • ") +
                ` • ${(s.t / 1000).toFixed(1)} s`;
        }
        const guest = online && !room.isHost;
        againBtn.hidden = guest;
        setupBtn.hidden = guest;
        waitNote.hidden = !guest;
        againBtn.textContent = online ? "Rematch" : "Main lagi";
    }

    function renderTrack(i) {
        const s = state, p = s.players[i], R = refs[i], f = fx[i];
        if (!R) return;
        R.g.setAttribute("transform", `translate(${(s.sides[i] || 0) * TRACK_W},0)`);
        R.world.setAttribute("transform",
            `translate(${((Math.random() * 2 - 1) * f.shake).toFixed(1)},${((Math.random() * 2 - 1) * f.shake).toFixed(1)})`);
        const scroll = p.d * PX_PER_M;
        R.lines.setAttribute("transform", `translate(0,${(scroll % 80).toFixed(1)})`);
        R.posts.setAttribute("transform", `translate(0,${(scroll % 160).toFixed(1)})`);
        const fy = BASE_CY - (WIN_DIST - p.d) * PX_PER_M;
        if (fy > -30 && fy < 680) {
            R.finish.setAttribute("transform", `translate(0,${fy.toFixed(1)})`);
            R.finish.removeAttribute("visibility");
        } else R.finish.setAttribute("visibility", "hidden");
        syncCars(i);
        let op = 1;
        if (p.wreck) op = 0.92;
        else if (p.inv > 0) op = Math.floor(clockNow() / 90) % 2 ? 0.45 : 0.9;
        if (canCheat && cheats.ghost && i === playerIndex) op = Math.min(op, 0.55);
        R.player.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.py.toFixed(1)}) rotate(${p.ang.toFixed(1)})`);
        R.player.setAttribute("opacity", String(op));
        if (f.prevHp != null && p.hp < f.prevHp) { f.shake = Math.max(f.shake, 9); f.flash = 1; }
        f.prevHp = p.hp;
        R.flash.setAttribute("opacity", (f.flash * 0.28).toFixed(2));
        R.name.textContent = (i === playerIndex ? "▸ " : "") + nameOf(i).slice(0, 16);
        R.ride.textContent = rideOf(p).name;
        const frac = p.hp / p.maxHp;
        R.hp.setAttribute("width", String(Math.max(0, 120 * frac)));
        R.hp.setAttribute("fill", frac > 0.5 ? "#34d399" : frac > 0.25 ? "#fbbf24" : "#ef4444");
        R.dist.textContent = Math.floor(Math.min(WIN_DIST, p.d)) + " m";
        R.spd.textContent = Math.round(p.v * 3.6) + " km/h";
    }

    /* ---------------- aksi & sinkronisasi room ---------------- */
    function pushState() {
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function publish() {
        render();
        pushState(); /* hanya host yang menulis state kanonik */
    }
    function applyAction(action, actor) {
        const s = state;
        if (!s || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        if (!s.players[actor]) return;
        switch (action.type) {
            case "pick":
                if (s.phase !== "setup" || !RIDES.some((r) => r.id === action.vehicle)) return;
                s.players[actor].vehicle = action.vehicle;
                break;
            case "settings":
                if (actor !== 0 || s.phase !== "setup") return;
                if (typeof action.twoWay === "boolean") s.twoWay = action.twoWay;
                if (!online && typeof action.duel === "boolean") s.duel = action.duel;
                state = freshState(s);
                break;
            case "start":
                if (actor !== 0 || s.phase !== "setup") return;
                startRace();
                break;
            case "restart":
                if (actor !== 0 || s.phase === "setup") return;
                startRace();
                break;
            case "rematch":
                if (actor !== 0 || s.phase !== "done") return;
                state = freshState(s);
                break;
            case "input": {
                if (s.phase !== "race" && s.phase !== "countdown") return;
                if (Number.isInteger(action.lane)) setLane(actor, action.lane);
                if (action.thr === -1 || action.thr === 0 || action.thr === 1)
                    s.players[actor].input.thr = action.thr;
                break;
            }
            default: return;
        }
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------------- loop ---------------- */
    function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!state) return;
        if (online && !room.isHost) {
            /* guest: ekstrapolasi ringan di antara snapshot host */
            if (state.phase === "countdown") state.cd = Math.max(0, state.cd - dt);
            if (state.phase === "race") {
                state.t += dt * 1000;
                state.players.forEach((p) => { p.d += p.v * dt * (p.finished || p.wreck ? 0.2 : 1); });
                state.cars.forEach((list) => list.forEach((c) => {
                    c.d += ((c.v || 0) / PX_PER_M) * dt;
                    if (c.hit) c.hit.t += dt;
                }));
            }
        } else if (!paused) {
            if (state.phase === "countdown") {
                state.cd -= dt;
                state.players.forEach((p) => idleStep(p, dt));
                if (state.cd <= 0) { state.phase = "race"; state.t = 0; goT = 0.8; pushState(); }
            } else if (state.phase === "race") {
                state.t += dt * 1000;
                state.players.forEach((p, i) => stepTrack(i, dt));
                checkEnd();
            }
        }
        fx.forEach((f) => { f.shake *= Math.pow(0.001, dt); f.flash = Math.max(0, f.flash - dt * 3); });
        goT = Math.max(0, goT - dt);
        render();
        if (online && room.isHost && (state.phase === "countdown" || state.phase === "race") && now - lastPub > PUB_MS) {
            lastPub = now;
            pushState();
        }
    }

    /* ---------------- input: keyboard, mouse, touch ---------------- */
    function pushThr() {
        const thr = (held.up ? 1 : 0) - (held.down ? 1 : 0);
        if (thr !== lastThr) { lastThr = thr; submitAction({ type: "input", thr }); }
    }
    function steer(dir) {
        if (!state) return;
        const cur = state.players[playerIndex].input.lane;
        submitAction({ type: "input", lane: clamp(cur + dir, 0, LANES - 1) });
    }
    function onKeyDown(e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const k = e.key, lk = k.toLowerCase();
        if (k === " " || k.startsWith("Arrow")) e.preventDefault();
        /* prioritas: bantuan → cheat → jeda → Escape → aksi game */
        if (lk === "h") { e.preventDefault(); if (!e.repeat) toggleHelp(); return; }
        if (lk === "c") {
            e.preventDefault();
            if (!e.repeat && !helpOpen && canCheat) { cheatOpen = !cheatOpen; render(); }
            return;
        }
        if (lk === "p") {
            e.preventDefault();
            if (!e.repeat) {
                if (helpOpen) toggleHelp(false);
                else if (cheatOpen) { cheatOpen = false; render(); }
                else setPaused(!paused);
            }
            return;
        }
        if (k === "Escape") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) { cheatOpen = false; render(); }
            else setPaused(false);
            return;
        }
        if (lk === "r") {
            e.preventDefault();
            if (!e.repeat && !helpOpen && !cheatOpen && state && state.phase !== "setup")
                submitAction({ type: "restart" });
            return;
        }
        if (helpOpen || cheatOpen || paused) return;
        if (lk === "w" || k === "ArrowUp") { held.up = true; pushThr(); return; }
        if (lk === "s" || k === "ArrowDown") { held.down = true; pushThr(); return; }
        if (lk === "a" || k === "ArrowLeft") steer(-1);
        else if (lk === "d" || k === "ArrowRight") steer(1);
        else if (k === " ") {
            if (!state) return;
            if (state.phase === "setup") submitAction({ type: "start" });
            else if (state.phase === "done") submitAction({ type: online ? "rematch" : "restart" });
        }
    }
    function onKeyUp(e) {
        const k = e.key, lk = k.toLowerCase();
        if (lk === "w" || k === "ArrowUp") { held.up = false; pushThr(); }
        if (lk === "s" || k === "ArrowDown") { held.down = false; pushThr(); }
    }
    function onBlur() {
        held.up = held.down = false; pushThr();
        Object.keys(padTimers).forEach((k) => { if (padTimers[k]) { clearInterval(padTimers[k]); padTimers[k] = 0; } });
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    /* klik / tap lajur pada papan = setir ke lajur itu (mouse & touch) */
    svgEl.addEventListener("pointerdown", (e) => {
        if (!state || (state.phase !== "race" && state.phase !== "countdown")) return;
        const rect = svgEl.getBoundingClientRect();
        const vbW = state.duel ? TRACK_W * 2 : TRACK_W;
        const scale = Math.min(rect.width / vbW, rect.height / BOARD_H);
        const ox = (rect.width - vbW * scale) / 2;
        const x = (e.clientX - rect.left - ox) / scale;
        const track = Math.floor(x / TRACK_W);
        if (state.duel && track !== state.sides[playerIndex]) return;
        const lx = x - track * TRACK_W;
        submitAction({ type: "input", lane: clamp(Math.floor((lx - ROAD_X) / LANE_W), 0, LANES - 1) });
    });

    /* virtual pad mobile: tahan ◀▶ = pindah lajur berulang, tahan ▲▼ = gas/rem */
    Object.entries(padEls).forEach(([d, el]) => {
        el.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
            if (d === "up" || d === "down") { held[d] = true; pushThr(); }
            else {
                const dir = d === "left" ? -1 : 1;
                steer(dir);
                padTimers[d] = setInterval(() => steer(dir), 240);
            }
        });
        const end = () => {
            if (d === "up" || d === "down") { held[d] = false; pushThr(); }
            if (padTimers[d]) { clearInterval(padTimers[d]); padTimers[d] = 0; }
        };
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
    });

    ovCheat.addEventListener("change", (e) => {
        const k = e.target?.dataset?.cheat;
        if (k && k in cheats) cheats[k] = Boolean(e.target.checked);
    });
    function applyCheat(kind) {
        if (!canCheat || !state || state.phase !== "race") return;
        const p = state.players[playerIndex];
        if (kind === "repair" && !p.wreck) p.hp = p.maxHp;
        else if (kind === "jump") {
            p.d = Math.min(WIN_DIST - 40, p.d + 250);
            state.cars[playerIndex] = state.cars[playerIndex].filter((c) => Math.abs(c.d - p.d) > 25);
            p.inv = 1200;
        } else if (kind === "win") p.d = WIN_DIST;
        render();
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheat-close]")) { cheatOpen = false; render(); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) {
            if (!helpOpen && canCheat) { cheatOpen = !cheatOpen; render(); }
            return;
        }
        if (t.closest("[data-pause]")) { setPaused(!paused); return; }
        if (t.closest("[data-restart]")) {
            if (!helpOpen && !cheatOpen && state && state.phase !== "setup") submitAction({ type: "restart" });
            return;
        }
        const st = t.closest("[data-steer]");
        if (st) { if (!helpOpen && !cheatOpen && !paused) steer(Number(st.dataset.steer)); return; }
        const ride = t.closest("[data-ride]");
        if (ride) { submitAction({ type: "pick", vehicle: ride.dataset.ride }); return; }
        const seg = t.closest("[data-seg]");
        if (seg) {
            if (seg.disabled) return;
            if (seg.dataset.set === "mode") submitAction({ type: "settings", duel: seg.dataset.val === "bot" });
            else submitAction({ type: "settings", twoWay: seg.dataset.val === "2" });
            return;
        }
        const ca = t.closest("[data-cheat-act]");
        if (ca) { applyCheat(ca.dataset.cheatAct); return; }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "start") submitAction({ type: "start" });
        else if (act === "again") submitAction({ type: online ? "rematch" : "restart" });
        else if (act === "tosetup") submitAction({ type: "rematch" });
        else if (act === "restart") { if (state && state.phase !== "setup") submitAction({ type: "restart" }); }
        else if (act === "resume") setPaused(false);
        else if (act === "pause") setPaused(!paused);
        else if (act === "cheat") { if (!helpOpen && canCheat) { cheatOpen = !cheatOpen; render(); } }
    }
    root.addEventListener("click", handleClick);

    /* ---------------- boot ---------------- */
    if (online) {
        const u1 = room.onRoom?.((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            state = freshState(null);
            publish();
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                if (!nextState) return;
                const prevPhase = state?.phase;
                state = nextState;
                if (prevPhase === "countdown" && state.phase === "race") goT = 0.8;
                render();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        state = freshState(null);
        render();
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            root.removeEventListener("click", handleClick);
            Object.values(padTimers).forEach((tm) => tm && clearInterval(tm));
            unsubs.forEach((u) => { try { u(); } catch (e) { } });
        },
    };
}