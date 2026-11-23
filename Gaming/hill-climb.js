/* ==== GAME: hill-climb.js ==== */
/* Hill Climb — balapan bukit 2D side-scrolling realtime (SVG murni).
   Format template: export META + export mount(root, context).
   Mode "ai"  : pemain vs bot (garage, upgrade, cheat tersedia).
   Mode "room": host otoritatif (fisika + snapshot), guest kirim input & interpolasi. */

export const META = {
    id: "hill-climb", // harus sama dengan nama file tanpa .js
    name: "Hill Climb",
    category: "racing",
    catLabel: "Racing",
    desc: "Realtime side-scrolling hill race against a bot or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 38c8-2 12-10 22-10s16 8 22 8" stroke="#34d399" stroke-width="4" fill="none"/><rect x="14" y="18" width="20" height="10" rx="3" fill="#ef4444"/><circle cx="17" cy="29" r="4.5" fill="#0b1020" stroke="#9ca3af" stroke-width="2.5"/><circle cx="31" cy="29" r="4.5" fill="#0b1020" stroke="#9ca3af" stroke-width="2.5"/><circle cx="21" cy="15" r="4" fill="#fbbf24"/><path d="M17 13h8" stroke="#0b1020" stroke-width="2"/><path d="M40 10l4-4M44 14h5M40 20l4 4" stroke="#fbbf24" stroke-width="2.5"/></svg>',
    bg: ["#bbf7d0", "#86efac"],
    bestKey: "hillClimbBest",
};

/* ---------- konstanta dunia & fisika ---------- */
const VH = 420;            // tinggi viewBox (lebar adaptif 560..1160)
const BASE = 310;          // garis dasar tanah
const G = 620;             // gravitasi px/s^2
const SLOPE_G = 130;       // percepatan沿 kemiringan
const DRAG = 0.26;         // gesekan udara /s
const BRAKE_F = 240;       // gaya rem px/s^2
const V_MIN = -80;         // kecepatan mundur maksimum
const AIR_ROT = 140;       // deg/s kendali tilt di udara
const COUNTDOWN = 3;
const HEAD_START = 0.9;    // jeda rilis pebalap kedua (undian jalan duluan)
const STUN_TIME = 1.5;     // penalti crash (detik), bukan game over
const FUEL_GAS = 6, FUEL_IDLE = 0.7, CAN_FUEL = 26;
const PICK_R = 26, MAGNET_R = 150;
const NET_EVERY = 0.12;    // interval snapshot host -> Firebase (±8Hz)

const UPGRADES = {
    engine: { label: "Engine", max: [230, 265, 300, 340], accel: [130, 148, 166, 186], cost: [0, 18, 42, 75] },
    tank: { label: "Fuel tank", cap: [100, 130, 165, 200], cost: [0, 14, 34, 60] },
    armor: { label: "Suspension", tol: [50, 58, 66, 75], cost: [0, 16, 38, 68] },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const deg = (r) => (r * 180) / Math.PI;
const angDiff = (d) => (((d % 360) + 540) % 360) - 180;

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------- generator trek: seeded & DIJAMIN bisa diselesaikan ----------
   Tinggi antar titik kontrol diinterpolasi kosinus; |Δh| dibatasi sehingga
   kemiringan maksimum < kemampuan tanjak mesin level 0. Start & finish datar.
   Seed + round identik di kedua sisi multiplayer => trek identik. */
function makeTrack(seed, round) {
    const r = rng(seed);
    const len = Math.min(7000, 4200 + round * 450);
    const seg = 88 + Math.floor(r() * 5) * 10;
    const maxSlope = 0.4 + Math.min(round, 8) * 0.03;
    const maxDh = maxSlope * ((2 * seg) / Math.PI) * 0.92;
    const n = Math.ceil((len + 420) / seg) + 1;
    const h = new Array(n).fill(BASE);
    const flatUntil = Math.ceil(len / seg) + 1;
    for (let i = 2; i < n; i++) {
        if (i >= flatUntil) { h[i] = h[i - 1]; continue; }
        const r1 = r(), r2 = r(), r3 = r();
        let dh = 0;
        if (r1 >= 0.18) {
            const mag = maxDh * (0.3 + 0.7 * r2);
            const prevDir = Math.sign(h[i - 1] - h[i - 2] || 1);
            dh = (r3 < 0.62 ? -prevDir : prevDir) * mag;
        }
        h[i] = clamp(h[i - 1] + dh, BASE - 150, BASE + 70);
    }
    const groundY = (x) => {
        x = clamp(x, 0, (n - 1) * seg - 0.001);
        const i = Math.floor(x / seg), t = (x - i * seg) / seg;
        return h[i] + (h[i + 1] - h[i]) * (1 - Math.cos(Math.PI * t)) / 2;
    };
    const slopeAt = (x) => Math.atan2(groundY(x + 5) - groundY(x - 5), 10);
    const items = [];
    for (let d = 130; d < len - 160; d += 70 + r() * 50)
        items.push({ t: "coin", x: d, y: groundY(d) - (26 + r() * 46) });
    for (let d = 380; d < len - 220; d += 560 + r() * 120)
        items.push({ t: "can", x: d, y: groundY(d) - 24 });
    return { seed, round, len, seg, groundY, slopeAt, items };
}

/* langkah kecepatan di tanah: gas / rem / gravitasi lereng / drag */
function stepGround(s, gas, brake, dt, stats, slope, turbo) {
    const max = stats.max * (turbo ? 1.35 : 1);
    let v = s;
    if (gas) v += stats.accel * (turbo ? 1.6 : 1) * dt;
    if (brake) v -= BRAKE_F * dt;
    v += Math.sin(slope) * SLOPE_G * dt; // tanjakan memperlambat, turunan mempercepat
    v *= 1 - DRAG * dt;
    return clamp(v, V_MIN, max);
}
const projectSpeed = (vx, vy, slope) => vx * Math.cos(slope) + vy * Math.sin(slope);

/* =================================================================== */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // indeks koneksi (bukan seat)
    let roomData = room?.room || null;
    let state = null;

    /* ---------- state sesi (solo) & lokal ---------- */
    const session = { bank: 0, round: 0 };
    const lv = { engine: 0, tank: 0, armor: 0 };
    let best = null;
    try { const v = parseFloat(localStorage.getItem(META.bestKey)); if (isFinite(v) && v > 0) best = v; } catch (e) { }
    const cheats = { infFuel: false, noCrash: false, turbo: false, magnet: false, lowGrav: false };
    const anyCheat = () => Object.values(cheats).some(Boolean);
    let cheated = false;

    let track = null, gotSet = new Set(), itemEls = [], viewCars = [];
    let inputs = [{ gas: false, brake: false }, { gas: false, brake: false }];
    let gas = false, brake = false;
    let botSkill = 0.85;
    let cam = 0, viewW = 960, markBucket = -1;
    let raf = null, lastT = 0, netAcc = 0, lastCdInt = null, overlayKey = "";
    let destroyed = false, ro = null, toastTimer = null;
    const timers = new Set(), bound = [], subs = [];
    const uid = Math.random().toString(36).slice(2, 8);

    /* ---------- shell UI (minimalis) ---------- */
    root.innerHTML = `
<style>
.hc{--line:rgba(255,255,255,.14);--ink:#eef2f7;--mut:#93a1b5;--acc:#34d399}
.hc .hc-shell{width:100%;background:#0b1220;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.hc .hc-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;color:var(--ink);font-size:12.5px}
.hc .hc-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.04);font-variant-numeric:tabular-nums;white-space:nowrap}
.hc .hc-chip b{font-weight:700}
.hc .hc-coin{width:10px;height:10px;border-radius:50%;background:#f59e0b;display:inline-block}
.hc .hc-gap.up{color:#34d399}.hc .hc-gap.down{color:#f87171}
.hc .hc-spacer{flex:1}
.hc .hc-fuel{width:110px;height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.hc .hc-fuel i{display:block;height:100%;width:100%;background:var(--acc);transition:width .15s linear}
.hc .hc-fuel.low i{background:#ef4444}
.hc .hc-progress{position:relative;height:6px;margin:0 14px 10px;background:rgba(255,255,255,.08);border-radius:3px}
.hc .hc-progress b{position:absolute;top:50%;left:0;width:11px;height:11px;border-radius:50%;transform:translate(-50%,-50%);transition:left .12s linear}
.hc .hc-progress b[data-dot="0"]{background:#ef4444}
.hc .hc-progress b[data-dot="1"]{background:#3b82f6}
.hc .hc-progress b.me{box-shadow:0 0 0 2px #fff}
.hc .hc-fin{position:absolute;right:-4px;top:-9px;font-size:13px;line-height:1}
.hc .hc-stage{position:relative;background:#e3eef9}
.hc .hc-stage svg{display:block;width:100%;height:auto;max-height:min(62vh,560px);touch-action:none;user-select:none;-webkit-user-select:none}
.hc .hc-toast{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:clamp(34px,7vw,60px);font-weight:800;letter-spacing:.04em;color:#0f172a;text-shadow:0 2px 0 #fff;opacity:0;transition:opacity .15s}
.hc .hc-toast.show{opacity:1}
.hc .hc-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(8,13,26,.55);backdrop-filter:blur(3px);padding:16px}
.hc .hc-card{width:min(94%,420px);background:#0f172a;border:1px solid var(--line);border-radius:16px;padding:20px;color:var(--ink);text-align:left}
.hc .hc-card h3{margin:0 0 4px;font-size:20px}
.hc .hc-card h3.hc-win{color:#34d399}.hc .hc-card h3.hc-lose{color:#f87171}
.hc .hc-card .sub{color:var(--mut);font-size:13px;margin:0 0 14px}
.hc .hc-row{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px}
.hc .hc-lbl{width:92px;color:var(--mut)}
.hc .hc-pips{display:flex;gap:4px}
.hc .hc-pips i{width:11px;height:11px;border-radius:3px;background:rgba(255,255,255,.12)}
.hc .hc-pips i.on{background:var(--acc)}
.hc .hc-max{margin-left:auto;color:#34d399;font-weight:700;font-size:12px}
.hc .hc-bank{margin-left:auto;color:#fbbf24}
.hc button{font-family:inherit}
.hc .hc-btn{border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--ink);border-radius:10px;padding:8px 14px;font-weight:600;font-size:13px;cursor:pointer}
.hc .hc-btn:hover{background:rgba(255,255,255,.12)}
.hc .hc-btn:disabled{opacity:.4;cursor:default}
.hc .hc-btn.buy{margin-left:auto;padding:5px 10px;font-size:12px}
.hc .hc-btn.primary{display:block;width:100%;margin-top:12px;padding:11px;font-size:14px;background:var(--acc);border-color:transparent;color:#052e16}
.hc .hc-btn.primary:hover{background:#4ade80}
.hc .hc-cheats{position:absolute;top:10px;right:10px;z-index:5;width:212px;background:rgba(15,23,42,.95);border:1px solid var(--line);border-radius:12px;padding:12px;color:var(--ink);font-size:12.5px}
.hc .hc-cheats h4{margin:0 0 8px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.hc .hc-cheats label{display:flex;gap:8px;align-items:center;margin:6px 0;cursor:pointer}
.hc .hc-cheats input{accent-color:var(--acc)}
.hc .hc-cheats .once{display:flex;gap:6px;margin-top:10px}
.hc .hc-cheats .once button{flex:1;padding:6px 4px;font-size:11.5px}
.hc .hc-pedals{display:flex;gap:10px;justify-content:center;padding:12px;background:#0b1220}
.hc .hc-pedal{flex:1;max-width:260px;height:60px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.05);color:var(--ink);font-weight:800;font-size:15px;letter-spacing:.06em;display:flex;align-items:center;justify-content:center;gap:8px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.hc .hc-pedal kbd{font-size:10px;font-weight:600;color:var(--mut);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
.hc .hc-pedal.on{background:var(--acc);color:#052e16;border-color:transparent}
.hc .hc-pedal.on kbd{color:#052e16;border-color:rgba(5,46,22,.4)}
@media (hover:none){.hc .hc-pedal kbd{display:none}}
@keyframes hc-boom{from{transform:scale(.4);opacity:.95}to{transform:scale(2.2);opacity:0}}
.hc .hc-boom{animation:hc-boom .5s ease-out forwards;transform-box:fill-box;transform-origin:center}
@keyframes hc-pop{from{transform:scale(.6);opacity:1}to{transform:scale(1.8);opacity:0}}
.hc .hc-pop{animation:hc-pop .35s ease-out forwards;transform-box:fill-box;transform-origin:center}
</style>
<div class="game-app hc">
  <div class="game-intro">
    <div><h2>Hill Climb</h2><p>Realtime side-scrolling hill race.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="hc-shell">
      <div class="hc-hud">
        <span class="hc-chip">Round <b data-hud="round">1</b></span>
        <span class="hc-chip"><b data-hud="dist">0</b>&nbsp;m</span>
        <span class="hc-chip hc-gap" data-hud="gap">+0 m</span>
        <span class="hc-chip"><i class="hc-coin"></i><b data-hud="coins">0</b></span>
        <span class="hc-spacer"></span>
        <div class="hc-fuel" data-fuel><i data-fuelbar></i></div>
      </div>
      <div class="hc-progress"><b data-dot="0"></b><b data-dot="1"></b><span class="hc-fin">🏁</span></div>
      <div class="hc-stage" data-stage>
        <svg data-svg viewBox="0 0 960 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Hill Climb race">
          <defs>
            <linearGradient id="hc-sky-${uid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#f7fbff"/><stop offset="1" stop-color="#e3eef9"/>
            </linearGradient>
          </defs>
          <g data-sky></g>
          <g data-par="0"></g>
          <g data-par="1"></g>
          <g data-cam>
            <path data-ground fill="#3f6212" stroke="#65a30d" stroke-width="3"/>
            <g data-marks></g>
            <g data-flag></g>
            <g data-items></g>
            <g data-car="1"></g>
            <g data-car="0"></g>
            <g data-tag><rect x="-17" y="-12" width="34" height="14" rx="7" fill="#0f172a" opacity=".85"/><text x="0" y="-2" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="inherit">YOU</text></g>
            <g data-fx></g>
          </g>
        </svg>
        <div class="hc-toast" data-toast></div>
        <div class="hc-cheats" data-cheats hidden></div>
        <div class="hc-overlay" data-overlay hidden><div class="hc-card" data-card></div></div>
      </div>
      <div class="hc-pedals">
        <button class="hc-pedal" type="button" data-pedal="brake">◀ BRAKE <kbd>A</kbd></button>
        <button class="hc-pedal" type="button" data-pedal="gas">GAS ▶ <kbd>D</kbd></button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="garage" data-solo>Garage</button>
    <button class="game-action-button" type="button" data-cheat-toggle data-solo>Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- referensi DOM & util ---------- */
    const $ = (s) => root.querySelector(s);
    const svg = $("[data-svg]"), stageEl = $("[data-stage]");
    const skyG = $("[data-sky]"), camG = $("[data-cam]");
    const parG = [$('[data-par="0"]'), $('[data-par="1"]')];
    const groundEl = $("[data-ground]"), marksG = $("[data-marks]"), flagG = $("[data-flag]");
    const itemsG = $("[data-items]"), fxG = $("[data-fx]"), tagG = $("[data-tag]");
    const carG = [$('[data-car="0"]'), $('[data-car="1"]')];
    const spokes = [[], []];
    const dots = [$('[data-dot="0"]'), $('[data-dot="1"]')];
    const fuelBox = $("[data-fuel]"), fuelBar = $("[data-fuelbar]");
    const toastEl = $("[data-toast]"), cheatsEl = $("[data-cheats]");
    const overlay = $("[data-overlay]"), card = $("[data-card]"), statusEl = $("[data-status]");
    const hud = { round: $('[data-hud="round"]'), dist: $('[data-hud="dist"]'), gap: $('[data-hud="gap"]'), coins: $('[data-hud="coins"]') };
    const pedalEls = { gas: $('[data-pedal="gas"]'), brake: $('[data-pedal="brake"]') };

    function on(el, type, fn, opts) { el.addEventListener(type, fn, opts); bound.push([el, type, fn, opts]); }
    function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); return id; }
    function sub(fn) { try { const u = fn(); if (typeof u === "function") subs.push(u); } catch (e) { console.warn(e); } }

    function toast(text, ms) {
        toastEl.textContent = text;
        toastEl.classList.add("show");
        if (toastTimer) { clearTimeout(toastTimer); timers.delete(toastTimer); }
        toastTimer = later(() => { toastEl.classList.remove("show"); toastTimer = null; }, ms);
    }
    function fx(attrs, ms) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        fxG.appendChild(el);
        later(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
    }
    const boom = (x, y) => fx({ cx: x, cy: y, r: 18, fill: "#fb923c", class: "hc-boom" }, 520);
    const pop = (x, y, t) => fx({ cx: x, cy: y, r: 10, fill: t === "coin" ? "#fbbf24" : "#f87171", class: "hc-pop" }, 380);

    /* ---------- helper state ---------- */
    const mySeat = () => !state || !online ? 0 : (room.isHost ? state.seats.host : state.seats.guest);
    const fuelCapFor = () => online ? UPGRADES.tank.cap[0] : UPGRADES.tank.cap[lv.tank];
    const engineStats = (seat) => online || seat !== 0
        ? { max: UPGRADES.engine.max[0], accel: UPGRADES.engine.accel[0] }
        : { max: UPGRADES.engine.max[lv.engine], accel: UPGRADES.engine.accel[lv.engine] };
    const tolFor = () => online ? UPGRADES.armor.tol[0] : UPGRADES.armor.tol[lv.armor];
    const botStats = () => ({
        max: UPGRADES.engine.max[lv.engine] * botSkill,
        accel: UPGRADES.engine.accel[lv.engine] * (0.85 + botSkill * 0.15),
    });
    const randomSeats = () => { const h = Math.random() < 0.5 ? 0 : 1; return { host: h, guest: 1 - h }; };
    function playersReady() {
        if (!online) return true;
        const p = roomData && roomData.players;
        if (!p) return true;
        return (Array.isArray(p) ? p.length : Object.keys(p).length) >= 2;
    }
    function newCar(seat) {
        const bot = !online && seat === 1;
        return {
            x: 30, y: track.groundY(30) - 17, s: 0, vx: 0, vy: 0,
            a: deg(track.slopeAt(30)), air: false,
            fuel: bot ? 9999 : fuelCapFor(), stun: 0, stall: 0,
            rel: false, fin: false, dnf: false,
        };
    }
    function idleState(phase) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        track = makeTrack(seed, session.round);
        state = {
            phase, seed, round: session.round,
            seats: online ? randomSeats() : { host: 0, guest: 1 },
            first: 0, cd: 0, t: 0, winner: null, reason: null, winTime: null,
            coins: [0, 0], got: [], cars: [newCar(0), newCar(1)],
        };
        rebuildWorld();
    }
    function startRace() {
        const seed = (Math.random() * 0x7fffffff) | 0;
        track = makeTrack(seed, session.round);
        state = {
            phase: "countdown", seed, round: session.round,
            seats: online ? randomSeats() : { host: 0, guest: 1 }, // undian posisi pemain
            first: Math.random() < 0.5 ? 0 : 1,                    // undian jalan duluan
            cd: COUNTDOWN, t: 0, winner: null, reason: null, winTime: null,
            coins: [0, 0], got: [], cars: [newCar(0), newCar(1)],
        };
        inputs = [{ gas: false, brake: false }, { gas: false, brake: false }];
        botSkill = Math.min(0.94, 0.78 + session.round * 0.02 + Math.random() * 0.04);
        cheated = anyCheat();
        lastCdInt = null; netAcc = 0;
        rebuildWorld();
        releaseAll();
        publish();
    }
    function toGarage() { idleState("garage"); releaseAll(); publish(); }
    function endRace(w, reason) {
        state.winner = w; state.reason = reason;
        state.winTime = +state.t.toFixed(2); state.phase = "result";
        releaseAll();
        if (!online && w === 0) {
            session.round++; session.bank += 15;
            if (reason === "flag" && !cheated && (!best || state.winTime < best)) {
                best = state.winTime;
                try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
            }
        }
        toast(w === mySeat() ? "YOU WIN!" : "RIVAL WINS", 1400);
        publish();
    }

    /* ---------- jaringan (template: host otoritatif) ---------- */
    function snapshot() {
        return {
            phase: state.phase, seed: state.seed, round: state.round,
            seats: { host: state.seats.host, guest: state.seats.guest },
            first: state.first, cd: +state.cd.toFixed(2), t: +state.t.toFixed(2),
            winner: state.winner, reason: state.reason, winTime: state.winTime,
            coins: [state.coins[0], state.coins[1]], got: state.got.slice(),
            cars: state.cars.map((c) => ({
                x: +c.x.toFixed(1), y: +c.y.toFixed(1), s: +c.s.toFixed(1),
                vx: +c.vx.toFixed(1), vy: +c.vy.toFixed(1), a: +c.a.toFixed(1),
                air: !!c.air, fuel: Math.round(c.fuel), stun: +c.stun.toFixed(2),
                rel: !!c.rel, fin: !!c.fin, dnf: !!c.dnf,
            })),
        };
    }
    function publishNet() {
        if (destroyed || !state) return;
        try { room.publishState(snapshot()).catch(console.warn); } catch (e) { console.warn(e); }
    }
    function render() { syncOverlay(); syncStatus(); syncHud(); }
    function publish() {
        render();
        if (online && room.isHost) publishNet(); // hanya host menulis state kanonik
    }
    function applyAction(action, actor) {
        if (!action || typeof action !== "object" || !state) return;
        const seat = online ? (actor === 0 ? state.seats.host : state.seats.guest) : 0;
        if (action.type === "input") {
            inputs[seat] = { gas: !!action.gas, brake: !!action.brake };
        } else if (action.type === "start") {
            if (state.phase === "garage" || state.phase === "lobby" || state.phase === "result") startRace();
        } else if (action.type === "garage") {
            if (!online) toGarage();
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function onGuestState(next) {
        if (destroyed || !next || !Array.isArray(next.cars)) return;
        const prevPhase = state ? state.phase : null;
        const prevKey = track ? track.seed + ":" + track.round : null;
        state = next;
        const key = state.seed + ":" + state.round;
        if (key !== prevKey) {
            track = makeTrack(state.seed, state.round); // trek identik dari seed host
            rebuildWorld();
            gotSet = new Set(state.got);
            state.got.forEach(hideItem);
            cam = 0;
        } else if (state.got) {
            for (const i of state.got) if (!gotSet.has(i)) { gotSet.add(i); hideItem(i); }
        }
        if (state.phase !== prevPhase) {
            if (state.phase === "race" && prevPhase === "countdown") toast("GO!", 800);
            if (state.phase === "result") toast(state.winner === mySeat() ? "YOU WIN!" : "RIVAL WINS", 1400);
            if (state.phase === "countdown") lastCdInt = null;
            render();
        }
        if (state.phase === "countdown") {
            const n = Math.ceil(state.cd);
            if (n > 0 && n !== lastCdInt) { lastCdInt = n; toast(String(n), 1100); }
        }
    }

    /* ---------- fisika (host / solo) ---------- */
    function stepCar(seat, dt) {
        const c = state.cars[seat];
        if (!c.rel || c.fin || c.dnf) return;
        const player = !online ? seat === 0 : seat === mySeat();
        const bot = !online && seat === 1;
        const inp = inputs[seat];
        if (c.stun > 0) {
            c.stun = Math.max(0, c.stun - dt);
            c.s *= Math.max(0, 1 - 4 * dt);
            c.air = false; c.y = track.groundY(c.x) - 17;
            c.a += angDiff(deg(track.slopeAt(c.x)) - c.a) * Math.min(1, 10 * dt);
            return;
        }
        const stats = bot ? botStats() : engineStats(seat);
        const turbo = !online && player && cheats.turbo;
        const grav = !online && player && cheats.lowGrav ? G * 0.55 : G;
        if (!bot && !(!online && player && cheats.infFuel))
            c.fuel = Math.max(0, c.fuel - (inp.gas && c.fuel > 0 ? FUEL_GAS : FUEL_IDLE) * dt);
        const canGas = inp.gas && (bot || c.fuel > 0);
        const slope = track.slopeAt(c.x);

        if (!c.air) {
            c.s = stepGround(c.s, canGas, inp.brake, dt, stats, slope, turbo);
            c.a += angDiff(deg(slope) - c.a) * Math.min(1, 12 * dt);
            const nx = c.x + Math.cos(slope) * c.s * dt;
            /* lepas landas bila kurvatur puncak butuh gaya > gravitasi */
            const yp = (track.groundY(c.x + 3) - track.groundY(c.x - 3)) / 6;
            const ypp = (track.groundY(c.x + 3) - 2 * track.groundY(c.x) + track.groundY(c.x - 3)) / 9;
            const kappa = ypp / Math.pow(1 + yp * yp, 1.5);
            if (c.s * c.s * kappa > 0.92 * G && c.s > 60) {
                c.air = true; c.vx = Math.cos(slope) * c.s; c.vy = Math.sin(slope) * c.s; c.x = nx;
            } else { c.x = nx; c.y = track.groundY(nx) - 17; }
            if (c.x < 8) { c.x = 8; if (c.s < 0) c.s = 0; }
        } else {
            const rot = (canGas ? -AIR_ROT : 0) + (inp.brake ? AIR_ROT : 0);
            c.x += c.vx * dt; c.y += c.vy * dt; c.vy += grav * dt; c.a += rot * dt;
            const gy = track.groundY(c.x);
            if (c.y >= gy - 17) {
                const sl = track.slopeAt(c.x), sd = deg(sl);
                const tol = bot ? UPGRADES.armor.tol[0] : tolFor();
                const noCrash = !online && player && cheats.noCrash;
                if (Math.abs(angDiff(c.a - sd)) > tol && !noCrash) {
                    c.stun = STUN_TIME; c.s = 0; c.air = false; c.y = gy - 17; c.a = sd;
                    boom(c.x, c.y);
                    if (player) toast("CRASH!", 700);
                } else {
                    c.air = false;
                    c.s = clamp(projectSpeed(c.vx, c.vy, sl), V_MIN, stats.max * (turbo ? 1.35 : 1));
                    c.y = gy - 17;
                    if (noCrash) c.a = sd;
                }
            }
        }

        if (!bot && !c.air && c.fuel <= 0 && Math.abs(c.s) < 5) {
            c.stall += dt; if (c.stall > 2.5) c.dnf = true;
        } else c.stall = 0;

        const r = !online && player && cheats.magnet ? MAGNET_R : PICK_R;
        const cy = c.air ? c.y : track.groundY(c.x) - 17;
        for (let i = 0; i < track.items.length; i++) {
            if (gotSet.has(i)) continue;
            const it = track.items[i], dx = it.x - c.x, dy = it.y - cy;
            if (dx * dx + dy * dy < r * r) {
                gotSet.add(i); state.got.push(i); hideItem(i); pop(it.x, it.y, it.t);
                if (it.t === "coin") {
                    state.coins[seat]++;
                    if (!online && seat === 0) session.bank++;
                } else if (!bot) c.fuel = Math.min(fuelCapFor(), c.fuel + CAN_FUEL);
            }
        }
        if (c.x >= track.len) { c.fin = true; c.x = Math.min(c.x, track.len + 30); }
    }

    function resolveRace() {
        if (state.phase !== "race" || state.winner !== null) return;
        const [a, b] = state.cars;
        if (a.fin || b.fin) {
            const w = a.fin && b.fin ? (a.x >= b.x ? 0 : 1) : a.fin ? 0 : 1;
            endRace(w, "flag");
        } else if (a.dnf || b.dnf) {
            const w = a.dnf && b.dnf ? (a.x >= b.x ? 0 : 1) : a.dnf ? 1 : 0;
            endRace(w, "stall");
        }
    }

    /* ---------- bot (mode AI) ---------- */
    function predictSlope(c) {
        for (let t = 0.05; t < 1.8; t += 0.05) {
            const px = c.x + c.vx * t, py = c.y + c.vy * t + 0.5 * G * t * t;
            if (py >= track.groundY(px) - 17) return deg(track.slopeAt(px));
        }
        return deg(track.slopeAt(c.x + 120));
    }
    function botThink(c) {
        if (!c.rel || c.fin || c.dnf || c.stun > 0) return { gas: false, brake: false };
        const stats = botStats();
        if (c.air) {
            const err = angDiff(predictSlope(c) - c.a);
            const th = 5 + (1 - botSkill) * 20;
            return { gas: err < -th, brake: err > th };
        }
        const ahead = track.slopeAt(c.x + 90) - track.slopeAt(c.x + 8);
        if (ahead > 0.45 && c.s > stats.max * 0.72) return { gas: false, brake: c.s > stats.max * 0.92 };
        return { gas: true, brake: false };
    }

    /* ---------- pembangunan dunia SVG ---------- */
    const COL = [{ body: "#ef4444", dark: "#7f1d1d" }, { body: "#3b82f6", dark: "#1e3a8a" }];
    function carSVG(seat) {
        const c = COL[seat];
        return `<rect x="-20" y="-13" width="40" height="14" rx="4" fill="${c.body}" stroke="${c.dark}" stroke-width="2"/>
<rect x="-9" y="-21" width="18" height="10" rx="3" fill="${c.body}" opacity="0.8" stroke="${c.dark}" stroke-width="2"/>
<circle cx="5" cy="-25" r="4.5" fill="#fbbf24" stroke="#92400e" stroke-width="1.5"/>
<g transform="translate(-12 3)"><circle r="7.5" fill="#0f172a" stroke="#94a3b8" stroke-width="2.5"/><line class="hc-spoke" x1="-5" y1="0" x2="5" y2="0" stroke="#94a3b8" stroke-width="2"/></g>
<g transform="translate(12 3)"><circle r="7.5" fill="#0f172a" stroke="#94a3b8" stroke-width="2.5"/><line class="hc-spoke" x1="-5" y1="0" x2="5" y2="0" stroke="#94a3b8" stroke-width="2"/></g>`;
    }
    function buildSky() {
        let s = `<rect x="0" y="0" width="${viewW}" height="${VH}" fill="url(#hc-sky-${uid})"/><circle cx="${viewW - 84}" cy="64" r="24" fill="#fde68a"/>`;
        for (const [fxr, cy, r] of [[0.16, 70, 24], [0.42, 104, 18], [0.68, 52, 14]]) {
            const cx = fxr * viewW;
            s += `<g opacity="0.85"><ellipse cx="${cx}" cy="${cy}" rx="${r * 1.8}" ry="${r * 0.7}" fill="#fff"/><ellipse cx="${cx + r}" cy="${cy + 4}" rx="${r * 1.3}" ry="${r * 0.6}" fill="#fff"/></g>`;
        }
        skyG.innerHTML = s;
    }
    function buildPar() {
        if (!track) return;
        const defs = [[0.3, 252, 26, 0.004, "#d7e5f2"], [0.55, 274, 34, 0.0032, "#c2d6e8"]];
        for (let i = 0; i < 2; i++) {
            const [f, by, amp, fr, col] = defs[i];
            const w = (track.len + 600) * f + viewW + 240;
            let d = `M0 ${VH + 90}L`;
            for (let x = 0; x <= w; x += 26) {
                const y = by - amp * Math.sin(x * fr + i * 2.1 + (track.seed % 7)) - amp * 0.4 * Math.sin(x * fr * 2.7 + i);
                d += `${x} ${y.toFixed(1)} `;
            }
            parG[i].innerHTML = `<path d="${d}L${w.toFixed(0)} ${VH + 90}Z" fill="${col}"/>`;
        }
    }
    function rebuildWorld() {
        gotSet = new Set();
        buildPar();
        itemsG.innerHTML = track.items.map((it, i) => it.t === "coin"
            ? `<circle data-it="${i}" cx="${it.x.toFixed(1)}" cy="${it.y.toFixed(1)}" r="7" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/>`
            : `<g data-it="${i}" transform="translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})"><rect x="-7" y="-9" width="14" height="18" rx="3" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.5"/><rect x="-4" y="-12" width="8" height="4" rx="1" fill="#7f1d1d"/></g>`
        ).join("");
        itemEls = Array.from(itemsG.querySelectorAll("[data-it]"));
        const gy = track.groundY(track.len);
        let fl = `<path d="M${track.len} ${(gy - 54).toFixed(1)}v54" stroke="#334155" stroke-width="3"/>`;
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
            fl += `<rect x="${track.len + c * 7}" y="${(gy - 54 + r * 7).toFixed(1)}" width="7" height="7" fill="${(r + c) % 2 ? "#fff" : "#0f172a"}"/>`;
        flagG.innerHTML = fl;
        for (let seat = 0; seat < 2; seat++) {
            carG[seat].innerHTML = carSVG(seat);
            spokes[seat] = Array.from(carG[seat].querySelectorAll(".hc-spoke"));
        }
        const me = mySeat();
        carG[1 - me].setAttribute("opacity", "0.92");
        carG[me].removeAttribute("opacity");
        camG.insertBefore(carG[me], tagG); // mobil sendiri selalu di atas
        markBucket = -1; cam = 0;
        viewCars = state.cars.map((c) => ({ ...c, wheel: 0 }));
    }
    function hideItem(i) { if (itemEls[i]) itemEls[i].style.display = "none"; }
    function buildMarks() {
        let s = "";
        const start = Math.max(250, Math.floor(cam / 250) * 250 - 250);
        for (let d = start; d < cam + viewW + 300; d += 250) {
            if (d >= track.len) break;
            const gy = track.groundY(d);
            s += `<path d="M${d} ${(gy - 22).toFixed(1)}v22" stroke="#ffffff88" stroke-width="2"/><text x="${d + 4}" y="${(gy - 26).toFixed(1)}" font-size="11" font-weight="600" fill="#ffffffcc" font-family="inherit">${d}</text>`;
        }
        marksG.innerHTML = s;
    }

    /* ---------- render ---------- */
    function syncView(dt) {
        for (let i = 0; i < 2; i++) {
            const c = state.cars[i], v = viewCars[i];
            const spd = c.air ? c.vx : c.s;
            Object.assign(v, c);
            v.wheel = (v.wheel + spd * dt * 7.6) % 360;
        }
    }
    function guestFrame(dt) {
        if (!state || !track || !viewCars.length) return;
        const k = 1 - Math.exp(-10 * dt);
        for (let i = 0; i < 2; i++) {
            const s = state.cars[i], v = viewCars[i];
            if (state.phase === "race" && s.rel && !s.fin && !s.dnf && s.stun <= 0) {
                if (s.air) { v.x += s.vx * dt; v.y += s.vy * dt; }
                else {
                    const sl = track.slopeAt(v.x);
                    v.x += Math.cos(sl) * s.s * dt;
                    v.y = track.groundY(v.x) - 17;
                    v.a += angDiff(deg(sl) - v.a) * Math.min(1, 12 * dt);
                }
                v.wheel = (v.wheel + (s.air ? s.vx : s.s) * dt * 7.6) % 360;
            }
            if (Math.abs(s.x - v.x) > 140) { v.x = s.x; v.y = s.y; v.a = s.a; }
            v.x += (s.x - v.x) * k; v.y += (s.y - v.y) * k; v.a += angDiff(s.a - v.a) * k;
            v.s = s.s; v.vx = s.vx; v.vy = s.vy; v.air = s.air; v.fuel = s.fuel;
            v.stun = s.stun; v.rel = s.rel; v.fin = s.fin; v.dnf = s.dnf;
        }
    }
    function renderBoard(dt) {
        if (!track || !viewCars.length) return;
        const me = viewCars[mySeat()] || viewCars[0];
        const target = clamp(me.x - viewW * 0.34, 0, Math.max(0, track.len + 260 - viewW));
        cam += (target - cam) * Math.min(1, 8 * dt);
        /* SATU grup kamera, semua koordinat dunia -> tidak ada tekstur robek */
        camG.setAttribute("transform", `translate(${(-cam).toFixed(1)} 0)`);
        parG[0].setAttribute("transform", `translate(${(-cam * 0.3).toFixed(1)} 0)`);
        parG[1].setAttribute("transform", `translate(${(-cam * 0.55).toFixed(1)} 0)`);
        const x0 = cam - 60, x1 = cam + viewW + 60;
        let d = `M${x0.toFixed(1)} ${VH + 90}L`;
        for (let x = x0; x <= x1; x += 10) d += `${x.toFixed(1)} ${track.groundY(x).toFixed(1)} `;
        groundEl.setAttribute("d", d + `L${x1.toFixed(1)} ${VH + 90}Z`);
        const bucket = Math.floor(cam / 250);
        if (bucket !== markBucket) { markBucket = bucket; buildMarks(); }
        for (let seat = 0; seat < 2; seat++) {
            const v = viewCars[seat];
            carG[seat].setAttribute("transform", `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) rotate(${v.a.toFixed(1)})`);
            carG[seat].style.opacity = v.stun > 0 ? 0.45 + 0.4 * Math.abs(Math.sin(v.stun * 14)) : "";
            for (const sp of spokes[seat]) sp.setAttribute("transform", `rotate(${(v.wheel % 360).toFixed(0)})`);
        }
        tagG.setAttribute("transform", `translate(${me.x.toFixed(1)} ${(me.y - 46).toFixed(1)})`);
    }
    function syncHud() {
        hud.round.textContent = (state ? state.round : session.round) + 1;
        if (!track || !viewCars.length) return;
        const me = viewCars[mySeat()] || viewCars[0];
        const rival = viewCars[1 - mySeat()] || viewCars[0];
        hud.dist.textContent = Math.floor(clamp(me.x, 0, track.len));
        const gap = Math.round(me.x - rival.x);
        hud.gap.textContent = (gap >= 0 ? "+" : "") + gap + " m";
        hud.gap.classList.toggle("up", gap >= 0);
        hud.gap.classList.toggle("down", gap < 0);
        hud.coins.textContent = online ? (state ? state.coins[mySeat()] : 0) : session.bank;
        const pct = clamp((me.fuel / fuelCapFor()) * 100, 0, 100);
        fuelBar.style.width = pct + "%";
        fuelBox.classList.toggle("low", pct < 22);
        for (let seat = 0; seat < 2; seat++) {
            dots[seat].style.left = clamp((viewCars[seat].x / track.len) * 100, 0, 100) + "%";
            dots[seat].classList.toggle("me", seat === mySeat());
        }
    }
    function syncStatus() {
        let txt = "Ready";
        if (online && !room.isHost && !state) txt = "Waiting for host…";
        else if (state) {
            const firstTxt = state.first === mySeat() ? "you first" : "rival first";
            if (state.phase === "garage") txt = "Garage";
            else if (state.phase === "lobby") txt = `Lobby · ${mySeat() === 0 ? "red" : "blue"} car`;
            else if (state.phase === "countdown") txt = `Get ready · ${firstTxt}`;
            else if (state.phase === "race") txt = "Racing";
            else if (state.phase === "result") txt = state.winner === mySeat() ? "You win" : "Rival wins";
        }
        if (!online && anyCheat()) txt += " · cheats";
        statusEl.textContent = txt;
    }
    function garageHTML() {
        const hex = (state.seed >>> 0).toString(16).slice(0, 6);
        let rows = "";
        for (const k of Object.keys(UPGRADES)) {
            const u = UPGRADES[k], cur = lv[k];
            let pips = "";
            for (let i = 0; i < 4; i++) pips += `<i class="${i <= cur ? "on" : ""}"></i>`;
            const next = cur < 3 ? u.cost[cur + 1] : null;
            rows += `<div class="hc-row"><span class="hc-lbl">${u.label}</span><span class="hc-pips">${pips}</span>` +
                (next != null
                    ? `<button class="hc-btn buy" type="button" data-buy="${k}" ${session.bank < next ? "disabled" : ""}>${next}c</button>`
                    : `<span class="hc-max">MAX</span>`) + `</div>`;
        }
        return `<h3>Garage</h3><p class="sub">Round ${state.round + 1} · Track #${hex} · Best ${best ? best.toFixed(1) + "s" : "—"}</p>
${rows}
<div class="hc-row"><span class="hc-lbl">Bank</span><b class="hc-bank">${session.bank} coins</b></div>
<button class="hc-btn primary" type="button" data-act="start">Start race</button>`;
    }
    function lobbyHTML(ready) {
        return `<h3>Race lobby</h3><p class="sub">You drive the ${mySeat() === 0 ? "red" : "blue"} car${ready ? "" : " · waiting for player…"}</p>
<button class="hc-btn primary" type="button" data-act="start" ${room.isHost && !ready ? "disabled" : ""}>${room.isHost ? "Start race" : "Request start"}</button>`;
    }
    function resultHTML() {
        const win = state.winner === mySeat();
        const me = state.cars[mySeat()], rival = state.cars[1 - mySeat()];
        const gap = Math.abs(Math.round(me.x - rival.x));
        const who = online ? "Rival" : "Bot";
        const stallNote = state.reason === "stall" ? (win ? "Rival ran dry. " : "You ran dry. ") : "";
        const bestLine = !online && win && best ? ` · Best ${best.toFixed(1)}s` : "";
        return `<h3 class="${win ? "hc-win" : "hc-lose"}">${win ? "You win!" : who + " wins"}</h3>
<p class="sub">${stallNote}Time ${state.winTime != null ? state.winTime.toFixed(1) : "—"}s · Coins ${state.coins[mySeat()]} · Gap ${gap} m${bestLine}</p>
<button class="hc-btn primary" type="button" data-act="start">${online && !room.isHost ? "Request rematch" : "Rematch"}</button>
${!online ? `<button class="hc-btn" type="button" data-act="garage" style="display:block;width:100%;margin-top:8px">Garage</button>` : ""}`;
    }
    function syncOverlay() {
        const ready = playersReady();
        const key = state
            ? [state.phase, state.seed, state.round, state.winner, session.bank, best, mySeat(), ready, lv.engine, lv.tank, lv.armor].join("|")
            : "wait|" + ready;
        if (key === overlayKey) return;
        overlayKey = key;
        if (!state) { overlay.hidden = false; card.innerHTML = `<h3>Waiting for host…</h3>`; return; }
        if (state.phase === "countdown" || state.phase === "race") { overlay.hidden = true; return; }
        overlay.hidden = false;
        card.innerHTML = state.phase === "garage" ? garageHTML() : state.phase === "lobby" ? lobbyHTML(ready) : resultHTML();
    }

    /* ---------- loop utama ---------- */
    function frame(ts) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const dt = lastT ? Math.min(0.035, (ts - lastT) / 1000) : 0.016;
        lastT = ts;
        if (online && !room.isHost) { guestFrame(dt); renderBoard(dt); syncHud(); return; }
        if (state) {
            if (state.phase === "countdown") {
                state.cd -= dt;
                if (state.cd <= 0) {
                    state.phase = "race"; state.t = 0;
                    state.cars[state.first].rel = true; // pemenang undian jalan duluan
                    toast("GO!", 800);
                    publish();
                } else {
                    const n = Math.ceil(state.cd);
                    if (n !== lastCdInt) { lastCdInt = n; toast(String(n), 1100); }
                }
            } else if (state.phase === "race") {
                state.t += dt;
                const second = 1 - state.first;
                if (!state.cars[second].rel && state.t >= HEAD_START) state.cars[second].rel = true;
                if (!online) inputs[1] = botThink(state.cars[1]);
                stepCar(0, dt);
                stepCar(1, dt);
                resolveRace();
            }
            if (online && room.isHost && (state.phase === "countdown" || state.phase === "race")) {
                netAcc += dt;
                if (netAcc >= NET_EVERY) { netAcc = 0; publishNet(); }
            }
            syncView(dt);
        }
        renderBoard(dt);
        syncHud();
    }

    /* ---------- input: keyboard + mouse + pedal virtual ---------- */
    const sources = { gas: new Set(), brake: new Set() };
    const pedalPtrs = { gas: new Set(), brake: new Set() };
    const boardPtrs = new Map();
    function recompute() {
        const g = sources.gas.size > 0, b = sources.brake.size > 0;
        const changed = g !== gas || b !== brake;
        gas = g; brake = b;
        pedalEls.gas.classList.toggle("on", gas);
        pedalEls.brake.classList.toggle("on", brake);
        if (changed && !destroyed) submitAction({ type: "input", gas, brake });
    }
    const press = (k, src) => { sources[k].add(src); recompute(); };
    const release = (k, src) => { sources[k].delete(src); recompute(); };
    function releaseAll() {
        sources.gas.clear(); sources.brake.clear();
        pedalPtrs.gas.clear(); pedalPtrs.brake.clear();
        boardPtrs.clear();
        recompute();
    }
    const GAS_KEYS = ["ArrowRight", "KeyD", "ArrowUp", "KeyW"];
    const BRAKE_KEYS = ["ArrowLeft", "KeyA", "ArrowDown", "KeyS"];
    function onKeyDown(e) {
        if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
        const c = e.code;
        if (GAS_KEYS.includes(c)) { e.preventDefault(); press("gas", "key:" + c); }
        else if (BRAKE_KEYS.includes(c)) { e.preventDefault(); press("brake", "key:" + c); }
        else if (!e.repeat && c === "KeyC" && !online) { e.preventDefault(); toggleCheats(); }
        else if (!e.repeat && c === "KeyR" && state && ["garage", "lobby", "result"].includes(state.phase)) { e.preventDefault(); submitAction({ type: "start" }); }
        else if (!e.repeat && c === "Escape") cheatsEl.hidden = true;
    }
    function onKeyUp(e) {
        const c = e.code;
        if (GAS_KEYS.includes(c)) release("gas", "key:" + c);
        else if (BRAKE_KEYS.includes(c)) release("brake", "key:" + c);
    }
    for (const k of ["gas", "brake"]) {
        const b = pedalEls[k];
        on(b, "pointerdown", (e) => {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { }
            pedalPtrs[k].add(e.pointerId);
            press(k, "pedal");
        });
        const up = (e) => { pedalPtrs[k].delete(e.pointerId); if (!pedalPtrs[k].size) release(k, "pedal"); };
        on(b, "pointerup", up); on(b, "pointercancel", up); on(b, "lostpointercapture", up);
        on(b, "contextmenu", (e) => e.preventDefault());
    }
    function boardSide(e) {
        const r = svg.getBoundingClientRect();
        return e.clientX - r.left > r.width / 2 ? "gas" : "brake";
    }
    on(svg, "pointerdown", (e) => {
        if (destroyed || (e.pointerType === "mouse" && e.button !== 0)) return;
        if (state && ["garage", "lobby", "result"].includes(state.phase)) return;
        e.preventDefault();
        try { svg.setPointerCapture(e.pointerId); } catch (err) { }
        const k = boardSide(e);
        boardPtrs.set(e.pointerId, k);
        press(k, "board:" + e.pointerId);
    });
    on(svg, "pointermove", (e) => {
        const old = boardPtrs.get(e.pointerId);
        if (!old) return;
        const k = boardSide(e);
        if (k !== old) {
            release(old, "board:" + e.pointerId);
            boardPtrs.set(e.pointerId, k);
            press(k, "board:" + e.pointerId);
        }
    });
    const boardUp = (e) => {
        const k = boardPtrs.get(e.pointerId);
        if (k) { release(k, "board:" + e.pointerId); boardPtrs.delete(e.pointerId); }
    };
    on(svg, "pointerup", boardUp); on(svg, "pointercancel", boardUp); on(svg, "lostpointercapture", boardUp);
    on(svg, "contextmenu", (e) => e.preventDefault());

    /* ---------- cheat (solo saja) ---------- */
    function buildCheats() {
        cheatsEl.innerHTML = `<h4>Cheats</h4>` + [
            ["infFuel", "Unlimited fuel"], ["noCrash", "No crash"], ["turbo", "Turbo engine"],
            ["magnet", "Pickup magnet"], ["lowGrav", "Low gravity"],
        ].map(([k, label]) => `<label><input type="checkbox" data-cheat="${k}" ${cheats[k] ? "checked" : ""}>${label}</label>`).join("") +
            `<div class="once"><button class="hc-btn" type="button" data-cheat-once="refill">Refill</button><button class="hc-btn" type="button" data-cheat-once="skip">+250 m</button><button class="hc-btn" type="button" data-cheat-once="win">Win</button></div>`;
    }
    const toggleCheats = () => { cheatsEl.hidden = !cheatsEl.hidden; };
    function cheatOnce(k) {
        if (!state || state.phase !== "race") return;
        const c = state.cars[0];
        cheated = true;
        if (k === "refill") c.fuel = fuelCapFor();
        else if (k === "skip") {
            c.x = Math.min(track.len - 1, c.x + 250);
            c.air = false; c.y = track.groundY(c.x) - 17; c.a = deg(track.slopeAt(c.x));
        } else if (k === "win") c.x = track.len;
        syncStatus();
    }
    function handleChange(e) {
        const cb = e.target.closest("[data-cheat]");
        if (!cb || online) return;
        cheats[cb.dataset.cheat] = cb.checked;
        if (cb.checked) cheated = true;
        syncStatus();
    }

    /* ---------- klik (delegasi, sesuai template) ---------- */
    function handleClick(event) {
        if (destroyed) return;
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const buy = event.target.closest("[data-buy]");
        if (buy && !online && state && state.phase === "garage") {
            const k = buy.dataset.buy, next = lv[k] + 1;
            if (next <= 3 && session.bank >= UPGRADES[k].cost[next]) {
                session.bank -= UPGRADES[k].cost[next];
                lv[k] = next;
                overlayKey = ""; render();
            }
            return;
        }
        if (event.target.closest("[data-cheat-toggle]") && !online) { toggleCheats(); return; }
        const once = event.target.closest("[data-cheat-once]");
        if (once && !online) { cheatOnce(once.dataset.cheatOnce); return; }
        const act = event.target.closest("[data-act]");
        if (!act) return;
        if (act.dataset.act === "start") submitAction({ type: "start" });
        else if (act.dataset.act === "garage") submitAction({ type: "garage" });
    }

    /* ---------- ukuran responsif (area gameplay luas) ---------- */
    function fit() {
        const w = stageEl.clientWidth || 960;
        viewW = clamp(Math.round(w), 560, 1160);
        svg.setAttribute("viewBox", `0 0 ${viewW} ${VH}`);
        svg.style.aspectRatio = viewW + " / " + VH;
        buildSky(); buildPar(); markBucket = -1;
    }

    /* ---------- init ---------- */
    buildCheats();
    if (online) root.querySelectorAll("[data-solo]").forEach((el) => { el.hidden = true; });
    fit();
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    on(document, "keydown", onKeyDown);
    on(document, "keyup", onKeyUp);
    on(window, "blur", releaseAll);
    on(document, "visibilitychange", () => { if (document.hidden) releaseAll(); });
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(fit); ro.observe(stageEl); }
    else on(window, "resize", fit);

    if (online) {
        sub(() => room.onRoom((nextRoom) => { roomData = nextRoom; overlayKey = ""; render(); }));
        if (room.isHost) {
            idleState("lobby");
            publish();
            sub(() => room.onAction((action) => applyAction(action, 1)));
        } else {
            render(); // kartu "Waiting for host…"
            sub(() => room.onState((nextState) => onGuestState(nextState)));
        }
    } else {
        idleState("garage");
        render();
    }
    raf = requestAnimationFrame(frame);

    /* ---------- cleanup ---------- */
    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            raf = null;
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            for (const [el, type, fn, opts] of bound) el.removeEventListener(type, fn, opts);
            bound.length = 0;
            if (ro) { ro.disconnect(); ro = null; }
            for (const u of subs) { try { u(); } catch (e) { } }
            subs.length = 0;
        },
    };
}