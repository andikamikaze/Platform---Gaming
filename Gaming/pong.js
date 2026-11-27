/* ==== GAME: pong.js ==== */
/*
  - Pong untuk template game-app (export META + mount).
  - Mode "ai"  : duel lokal vs bot (host = pemain kiri).
  - Mode "room": multiplayer Firebase, host otoritatif, guest kirim input.
  - Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "pong", // harus sama dengan nama file (tanpa .js)
    name: "Pong",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Minimalist Pong duel — angle your shots, grab ability pickups, clear randomly generated levels. First to 7.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="15" width="5" height="18" rx="2.5"></rect><rect x="37" y="10" width="5" height="18" rx="2.5"></rect><circle cx="24" cy="24" r="3"></circle><path d="M24 5v4M24 39v4"></path></svg>',
    bg: ["#eef2ff", "#e0e7ff"],
};

/* ================= konstanta & helper murni (tanpa DOM) ================= */
const W = 640, H = 420, PW = 12, PH = 74, PADX = 24, R = 7;
const BASE_SPEED = 360, PLAYER_SPEED = 430, DRAG_SPEED = 980;
const MAX_ANGLE = 1.05, WIN_SCORE = 7;
const SVGNS = "http://www.w3.org/2000/svg";
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const ABILITIES = {
    grow: { icon: "\u2922", label: "Big paddle", dur: 8, color: "#4f46e5" },
    fast: { icon: "\u26A1", label: "Speed boost", dur: 8, color: "#f59e0b" },
    slow: { icon: "\u2744", label: "Slow enemy", dur: 6, color: "#0ea5e9" },
    ball: { icon: "\uD83D\uDC0C", label: "Slow ball", dur: 6, color: "#10b981" },
    shield: { icon: "\uD83D\uDEE1", label: "Goal shield", dur: 8, color: "#8b5cf6" },
};
const TYPES = Object.keys(ABILITIES);
const freshFx = () => ({ grow: 0, fast: 0, slowed: 0, shield: 0 });

/* Level generator acak — DIJAMIN bisa diselesaikan secara konstruktif:
   - pola "gate"  : celah >= 128px yang selalu memuat garis tengah lapangan,
   - pola "blocks": balok hanya di pita atas/bawah, koridor tengah selalu bebas.
   Akibatnya jalur lurus horizontal y = H/2 tidak pernah terhalang. */
function genLevel(idx) {
    const r = Math.random;
    const speedMult = Math.min(1.35, 0.92 + idx * 0.035 + r() * 0.06);
    const aiSpeed = Math.min(330, 220 + idx * 9 + r() * 24);
    const aiErr = Math.max(14, 34 - idx * 2);
    const obstacles = [];
    let name = "Classic Court";
    if (idx > 1) {
        if (r() < 0.5) {
            const twin = idx >= 4 && r() < 0.5;
            const xs = twin ? [243 + (r() * 40 - 20), 397 + (r() * 40 - 20)] : [320 + (r() * 120 - 60)];
            for (const cx of xs) {
                const gap = 128 + r() * 44;                 // celah lebar, selalu memuat tengah
                const gc = H / 2 + (r() * 64 - 32);         // pusat celah dekat garis tengah
                const w = 16, x = Math.round(cx - w / 2);
                const topH = Math.round(gc - gap / 2 - 14);
                const botY = Math.round(gc + gap / 2);
                if (topH > 18) obstacles.push({ x, y: 14, w, h: topH });
                if (H - 14 - botY > 18) obstacles.push({ x, y: botY, w, h: H - 14 - botY });
            }
            name = twin ? "Twin Gates" : "Single Gate";
        } else {
            const n = 1 + Math.floor(r() * Math.min(3, 1 + idx / 2));
            const names = ["Skyline", "Low Tide", "Stalactites", "Drift Blocks"];
            name = names[Math.floor(r() * names.length)];
            for (let i = 0; i < n; i++) {
                for (let tries = 0; tries < 12; tries++) {
                    const w = Math.round(18 + r() * 14), h = Math.round(44 + r() * 70);
                    const x = Math.round(clamp(W * 0.3 + r() * W * 0.4 - w / 2, 150, 490 - w));
                    const y = Math.round(r() < 0.5 ? 16 + r() * 30 : H - 16 - h - r() * 30);
                    const hit = obstacles.some((o) =>
                        x < o.x + o.w + 12 && x + w > o.x - 12 && y < o.y + o.h + 12 && y + h > o.y - 12);
                    if (!hit) { obstacles.push({ x, y, w, h }); break; }
                }
            }
        }
    }
    return { idx, name, speedMult, aiSpeed, aiErr, obstacles };
}

function initialState(idx) {
    return {
        phase: "idle", paused: false,           // idle | serve | play | over
        level: genLevel(idx),
        sides: ["left", "right"],               // sides[playerIndex] -> sisi paddle
        server: 0, serveT: 0, serveDir: -1,
        ball: { x: W / 2, y: H / 2, dx: 0, dy: 0 },
        pads: { left: H / 2, right: H / 2 },
        score: [0, 0], lastTouch: 0,
        fx: [freshFx(), freshFx()], slowBall: 0,
        pickups: [], spawnT: 6, pickId: 1,
        aiErr: 0, winner: null, cheated: false,
    };
}

/* ================================ mount ================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const myPi = playerIndex;
    let roomData = room?.room || null;
    let state = null;
    let mounted = true;

    /* -------- UI lokal (tidak masuk state kanonik) -------- */
    const ui = { help: false, cheats: false, autoResume: false };
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("pongHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        ui.help = true;
        try { localStorage.setItem("pongHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }
    const cheats = { autopilot: false, slowmo: false, giant: false, tiny: false, freeze: false };
    const keys = { up: false, down: false };
    const input = { dir: 0, y: null };        // input milik client ini
    let guestInput = { dir: 0, y: null };     // input guest, disimpan di host
    let dragging = false;
    let raf = 0, lastT = 0, lastPub = 0, lastSent = 0, toastTimer = 0;
    let gotState = !online || room.isHost, lastStateT = 0, view = null;
    let obsSig = "";
    const subs = [];

    /* -------- tutorial (dipakai di overlay start & help) -------- */
    const TUT = `
<ul class="pg-tut">
  <li><b>Goal</b> — first to ${WIN_SCORE} points. Miss the ball and your opponent scores.</li>
  <li><b>Desktop</b> — <span class="k">W</span>/<span class="k">S</span> or <span class="k">\u2191</span>/<span class="k">\u2193</span>, or simply hover the mouse over the court. <span class="k">Space</span> pause \u00B7 <span class="k">R</span> restart \u00B7 <span class="k">H</span> help.</li>
  <li><b>Mobile</b> — drag on the court, or hold the \u25B2/\u25BC buttons below it.</li>
  <li><b>Angles</b> — hit with the paddle edge for sharp returns, the center for flat shots.</li>
  <li><b>Levels</b> — each match builds a random layout with obstacles. A open corridor is always guaranteed, so every level is winnable.</li>
  <li><b>Abilities</b> — steer the ball into a floating pickup. The last player who touched the ball gains the power for a few seconds.</li>
  <li><b>Serve</b> — a coin toss decides who serves first; after each point, the scorer serves.</li>
  <li><b>Multiplayer</b> — sides are shuffled randomly every match. Your paddle is the indigo one.</li>
</ul>
<div class="pg-legend">${TYPES.map((t) =>
        `<span>${ABILITIES[t].icon} <b>${ABILITIES[t].label}</b> \u00B7 ${ABILITIES[t].dur}s</span>`).join("")}</div>`;

    /* -------- shell (mengikuti template game-app, desain minimalis) -------- */
    root.innerHTML = `
<style>
.pong-app{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--soft:#f8fafc;--accent:#4f46e5;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);
  display:flex;flex-direction:column;gap:10px;min-height:0}
.pong-app *{box-sizing:border-box}
.pong-app [hidden]{display:none!important}
.pg-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.pg-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;
  border-radius:999px;padding:5px 11px;font-size:12px;color:var(--muted);white-space:nowrap;min-height:0}
.pg-chip b{color:var(--ink);font-size:14px;font-variant-numeric:tabular-nums}
.pg-chip.me b{color:var(--accent)}
.pg-fx{font-size:11px;color:var(--muted)}
.pong-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);
  border:1px solid var(--line);padding:5px 11px;border-radius:999px;background:#fff;white-space:nowrap}
.pong-app .game-status-dot{width:7px;height:7px;border-radius:50%;background:#94a3b8;display:inline-block;flex:none}
.pong-app .game-status-dot.ok{background:#10b981}
.pong-app .game-status-dot.warn{background:#f59e0b}
.pg-spacer{flex:1 1 auto}
.pg-btn{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:10px;
  padding:9px 14px;font-size:12px;font-weight:600;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.pg-btn:hover{opacity:.92}
.pg-btn.accent{background:var(--accent);border-color:var(--accent)}
.pg-btn.ghost{background:#fff;color:var(--ink);border-color:var(--line)}
.pg-btn.ghost:hover{border-color:#cbd5e1}
.pg-btn:disabled{opacity:.4;cursor:default}
.pg-hud .pg-btn{min-height:32px;padding:6px 10px;font-size:11px}
.pg-hud .pg-btn.on{border-color:var(--accent);color:var(--accent);background:#eef0ff}
.pg-icon-btn{display:inline-flex;align-items:center;gap:6px}
.pg-icon-btn svg{flex:none;display:block}
.pg-panel{position:relative;border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden;padding:0;
  box-shadow:0 1px 2px rgba(15,23,42,.04)}
.pg-board{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair}
.pg-court{fill:#fcfcfd;stroke:var(--line);stroke-width:2}
.pg-mid{stroke:#eef1f5;stroke-width:3;stroke-dasharray:8 12}
.pg-big{fill:#f1f5f9;font-weight:800}
.pg-pad.me{fill:var(--accent)}
.pg-pad.foe{fill:#0f172a}
.pg-ball{fill:#0f172a}
.pg-ball.serve{animation:pg-blink .45s ease-in-out infinite alternate}
@keyframes pg-blink{from{opacity:.2}to{opacity:1}}
.pg-obs{fill:#e9edf3;stroke:#d7dde6;stroke-width:1}
.pg-shield{stroke-width:4;stroke-linecap:round;stroke-dasharray:2 9}
.pg-shield.me{stroke:var(--accent)}
.pg-shield.foe{stroke:#0f172a}
.pg-pickup{animation:pg-pulse 1.6s ease-in-out infinite}
.pg-pickup circle{fill:#fff;stroke-width:2}
.pg-pickup text{font-size:13px;text-anchor:middle;dominant-baseline:central}
@keyframes pg-pulse{0%,100%{opacity:1}50%{opacity:.55}}
.pg-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.88);backdrop-filter:blur(6px);padding:16px;z-index:5}
.pg-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;max-width:440px;
  width:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.08)}
.pg-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px}
.pg-head h3{margin:0;font-size:18px;letter-spacing:-.01em}
.pg-scroll{flex:1 1 auto;min-height:0;overflow:auto}
.pg-foot{flex:none;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.pg-card .sub{color:var(--muted);font-size:13px;margin:0 0 12px;line-height:1.5}
.pg-card>.pg-note{flex:none;margin:10px 0 0}
.pg-tut{display:grid;gap:7px;font-size:12.5px;color:#334155;margin:0 0 12px;padding:0;list-style:none}
.pg-tut b{color:var(--ink)}
.pg-tut .k{display:inline-block;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;
  padding:0 5px;font-size:11px;background:var(--soft);font-family:ui-monospace,monospace}
.pg-legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px;color:#334155;margin:0}
.pg-touch{display:none;gap:12px;justify-content:center;flex:none}
@media (pointer:coarse){.pg-touch{display:flex}}
.pg-vbtn{width:72px;height:50px;border-radius:12px;border:1px solid var(--line);background:#fff;font-size:18px;
  color:var(--ink);touch-action:none;user-select:none;-webkit-user-select:none}
.pg-vbtn:active{background:var(--soft)}
.pg-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;
  font-size:12px;padding:6px 12px;border-radius:999px;z-index:6;pointer-events:none;opacity:0;
  transition:opacity .2s;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.pg-toast.show{opacity:1}
.pg-cheat{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;
  border-bottom:1px dashed var(--line);font-size:13px}
.pg-cheat input{accent-color:var(--accent);width:16px;height:16px}
.pg-note{font-size:11px;color:var(--muted);margin:10px 0 0}

/* --- Batch 02 design polish --- */
.pong-app :focus-visible,.pong-app button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pg-chip{padding:6px 12px}
.pg-btn{min-height:44px;padding:10px 16px}
.pg-card{box-shadow:none}
.pg-vbtn{min-height:44px}
@media (pointer:coarse){.pong-app button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.pong-app *{animation:none!important;transition:none!important}}

/* --- layout redesign overrides (keep last) --- */
.pong-app.game-fill > .pg-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.pong-app.game-fill > .pg-panel:not(:has(.pg-overlay:not([hidden]))){aspect-ratio:640/420;flex:0 0 auto}
.pong-app.game-fill > .pg-panel:has(.pg-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.pong-app .pg-hud{gap:5px;margin-bottom:0}
.pong-app .pg-hud .pg-chip{padding:4px 6px;font-size:9px}
.pong-app .pg-hud .pg-chip.game-status,
.pong-app .pg-hud .pg-fx,
.pong-app .pg-hud .pg-chip[data-hud="serve"],
.pong-app .pg-hud .pg-chip[data-hud="cheat"]{display:none}
.pong-app .pg-hud .pg-btn{min-height:32px;padding:5px 9px;font-size:9px}
.pong-app .pg-hud .pg-btn-label,.pong-app .pg-hud .pg-spacer{display:none}
.pong-app .pg-overlay{padding:8px}
.pong-app .pg-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.pong-app .pg-scroll{scrollbar-width:none}
.pong-app .pg-scroll::-webkit-scrollbar{display:none}
.pong-app .pg-foot{position:static;margin:10px 0 0;padding:0}
.pong-app .pg-note{display:none}
}
</style>

<div class="game-app pong-app game-fill" data-pong>
  <div class="pg-hud">
    <span class="pg-chip" data-hud="level">Lv 1</span>
    <span class="pg-chip me"><span data-hud="meName">You</span> <b data-hud="me">0</b><span class="pg-fx" data-hud="meFx"></span></span>
    <span class="pg-chip foe"><span data-hud="foeName">AI</span> <b data-hud="foe">0</b><span class="pg-fx" data-hud="foeFx"></span></span>
    <span class="pg-chip game-status"><i class="game-status-dot" data-el="dot"></i><span data-status>Ready</span></span>
    <span class="pg-chip" data-hud="serve" hidden></span>
    <span class="pg-chip" data-hud="cheat" hidden>cheats on</span>
    <span class="pg-spacer"></span>
    <button class="pg-btn" type="button" data-act="shuffle" data-role="ctrl" aria-label="Shuffle level" title="Shuffle level (new random layout)">New layout</button>
    <button class="pg-btn pg-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pg-btn-label">Help</span></button>
    <button class="pg-btn pg-icon-btn" type="button" data-cheats data-role="local" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="pg-btn-label">Cheats</span></button>
    <button class="pg-btn pg-icon-btn" type="button" data-pause data-role="ctrl" aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="pg-btn-label">Pause</span></button>
    <button class="pg-btn pg-icon-btn" type="button" data-restart data-role="ctrl" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="pg-btn-label">Restart</span></button>
    <button class="pg-btn pg-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pg-btn-label">Exit game</span></button>
  </div>

  <section class="game-panel pg-panel" data-board>
    <svg class="pg-board" viewBox="0 0 640 420" preserveAspectRatio="xMidYMid meet" aria-label="Pong board">
      <rect class="pg-court" x="1" y="1" width="638" height="418" rx="14"></rect>
      <line class="pg-mid" x1="320" y1="14" x2="320" y2="406"></line>
      <text class="pg-big" data-el="bigL" x="165" y="150" font-size="76" font-family="inherit" text-anchor="middle">0</text>
      <text class="pg-big" data-el="bigR" x="475" y="150" font-size="76" font-family="inherit" text-anchor="middle">0</text>
      <g data-el="obs"></g>
      <line class="pg-shield" data-el="shL" x1="8" y1="18" x2="8" y2="402" style="opacity:0"></line>
      <line class="pg-shield" data-el="shR" x1="632" y1="18" x2="632" y2="402" style="opacity:0"></line>
      <g data-el="picks"></g>
      <rect class="pg-pad me" data-el="padL" x="24" y="173" width="12" height="74" rx="6"></rect>
      <rect class="pg-pad foe" data-el="padR" x="604" y="173" width="12" height="74" rx="6"></rect>
      <circle class="pg-ball" data-el="ball" cx="320" cy="210" r="7"></circle>
    </svg>
    <div class="pg-toast" data-el="toast" aria-live="polite"></div>

    <div class="pg-overlay" data-ov="start">
      <div class="pg-card">
        <div class="pg-head"><h3>Pong \u2014 how to play</h3></div>
        <div class="pg-scroll">
          <p class="sub" data-el="startInfo"></p>
          ${TUT}
        </div>
        <div class="pg-foot">
          <button class="pg-btn accent" type="button" data-act="start">Start match</button>
          <button class="pg-btn ghost" type="button" data-act="shuffle" data-role="ctrl">Shuffle level</button>
        </div>
        <p class="pg-note" data-el="guestNote" hidden>You are the guest \u2014 the host starts the match.</p>
      </div>
    </div>

    <div class="pg-overlay" data-ov="help" hidden>
      <div class="pg-card">
        <div class="pg-head"><h3>How to play</h3><button class="pg-btn ghost" type="button" data-help-close>Close</button></div>
        <div class="pg-scroll">${TUT}</div>
        <div class="pg-foot"><span class="pg-note">Press H to reopen this guide</span><button class="pg-btn" type="button" data-help-close>Got it</button></div>
      </div>
    </div>

    <div class="pg-overlay" data-ov="pause" hidden>
      <div class="pg-card">
        <div class="pg-head"><h3>Paused</h3></div>
        <div class="pg-scroll"><p class="sub" data-el="pauseSub">Press P or Space to resume.</p></div>
        <div class="pg-foot"><button class="pg-btn" type="button" data-act="resume" data-role="ctrl">Resume</button></div>
      </div>
    </div>

    <div class="pg-overlay" data-ov="over" hidden>
      <div class="pg-card">
        <div class="pg-head"><h3 data-el="ovTitle">Game over</h3></div>
        <div class="pg-scroll"><p class="sub" data-el="ovSub"></p></div>
        <div class="pg-foot"><button class="pg-btn accent" type="button" data-act="again">Play again \u00B7 next level</button></div>
        <p class="pg-note">Next level = fresh random layout, slightly faster ball &amp; smarter AI.</p>
      </div>
    </div>

    <div class="pg-overlay" data-ov="cheats" hidden>
      <div class="pg-card">
        <div class="pg-head"><h3>Cheats</h3><button class="pg-btn ghost" type="button" data-close-cheats>Close</button></div>
        <div class="pg-scroll">
          <p class="sub">Offline practice only \u2014 using any cheat tags the match.</p>
          <label class="pg-cheat"><span>Auto-play (perfect paddle)</span><input type="checkbox" data-cheat="autopilot"></label>
          <label class="pg-cheat"><span>Slow motion ball</span><input type="checkbox" data-cheat="slowmo"></label>
          <label class="pg-cheat"><span>Giant paddle</span><input type="checkbox" data-cheat="giant"></label>
          <label class="pg-cheat"><span>Tiny enemy paddle</span><input type="checkbox" data-cheat="tiny"></label>
          <label class="pg-cheat"><span>Freeze enemy</span><input type="checkbox" data-cheat="freeze"></label>
        </div>
        <div class="pg-foot">
          <button class="pg-btn ghost" type="button" data-act="cheatPoint">+1 point</button>
          <button class="pg-btn ghost" type="button" data-act="cheatWin">Win now</button>
        </div>
      </div>
    </div>
  </section>

  <div class="pg-touch">
    <button class="pg-vbtn" type="button" data-hold="up" aria-label="Move paddle up">\u25B2</button>
    <button class="pg-vbtn" type="button" data-hold="down" aria-label="Move paddle down">\u25BC</button>
  </div>
</div>`;

    /* -------- refs -------- */
    const $ = (sel) => root.querySelector(sel);
    const svg = $(".pg-board");
    const padL = $('[data-el="padL"]'), padR = $('[data-el="padR"]');
    const ballEl = $('[data-el="ball"]');
    const bigL = $('[data-el="bigL"]'), bigR = $('[data-el="bigR"]');
    const obsG = $('[data-el="obs"]'), pickG = $('[data-el="picks"]');
    const shL = $('[data-el="shL"]'), shR = $('[data-el="shR"]');
    const toastEl = $('[data-el="toast"]'), dotEl = $('[data-el="dot"]'), statusEl = $("[data-status]");
    const hud = {
        level: $('[data-hud="level"]'), me: $('[data-hud="me"]'), foe: $('[data-hud="foe"]'),
        meName: $('[data-hud="meName"]'), foeName: $('[data-hud="foeName"]'),
        meFx: $('[data-hud="meFx"]'), foeFx: $('[data-hud="foeFx"]'),
        serve: $('[data-hud="serve"]'), cheat: $('[data-hud="cheat"]'),
    };
    const ovStart = $('[data-ov="start"]'), ovHelp = $('[data-ov="help"]'), ovPause = $('[data-ov="pause"]');
    const ovOver = $('[data-ov="over"]'), ovCheats = $('[data-ov="cheats"]');
    const startInfo = $('[data-el="startInfo"]'), guestNote = $('[data-el="guestNote"]');
    const pauseSub = $('[data-el="pauseSub"]'), ovTitle = $('[data-el="ovTitle"]'), ovSub = $('[data-el="ovSub"]');
    const startBtn = ovStart.querySelector('[data-act="start"]');
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");

    /* -------- helper role/state -------- */
    const isHost = () => !online || room.isHost;
    const sideOf = (pi) => state.sides[pi];
    const piOfSide = (s) => (state.sides[0] === s ? 0 : 1);
    const nameOf = (pi) => pi === myPi ? (playerName || "You") : (online ? (room.isHost ? "Guest" : "Host") : "AI");
    const canSim = () => state && isHost() && state.phase !== "idle" && state.phase !== "over" && !state.paused;
    const playable = () => state && (state.phase === "serve" || state.phase === "play") && !state.paused && !ui.help && !ui.cheats;

    function heightFor(pi) {
        let h = PH * (state.fx[pi].grow > 0 ? 1.55 : 1);
        if (!online) {
            if (cheats.giant && pi === myPi) h *= 1.8;
            if (cheats.tiny && pi !== myPi) h *= 0.55;
        }
        return h;
    }
    function speedFor(pi) {
        const f = state.fx[pi];
        let s = (pi === 1 && !online) ? state.level.aiSpeed : PLAYER_SPEED;
        if (f.fast > 0) s *= 1.6;
        if (f.slowed > 0) s *= 0.5;
        if (!online && cheats.freeze && pi !== myPi) s = 0;
        return s;
    }
    const ballSpeed = () =>
        BASE_SPEED * state.level.speedMult * (state.slowBall > 0 ? 0.7 : 1) * (!online && cheats.slowmo ? 0.5 : 1);
    const ballToward = (pi) => (sideOf(pi) === "left" ? state.ball.dx < 0 : state.ball.dx > 0);

    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
    }

    /* -------- publish / actions (mengikuti pola template) -------- */
    function publish(force) {
        if (!online || !room.isHost) return;
        const now = performance.now();
        if (force || now - lastPub > 90) {
            lastPub = now;
            room.publishState(state).catch(console.warn);
        }
    }
    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        if (action.type === "input") {
            if (!online || actor !== 1) return;
            guestInput.dir = clamp(Math.round(Number(action.dir) || 0), -1, 1);
            guestInput.y = action.y == null ? null : clamp(Number(action.y) || 0, 0, H);
            return;
        }
        if (action.type === "requestStart") {
            if (!isHost()) return;
            if (state.phase === "idle") startMatch(false);
            else if (state.phase === "over") startMatch(true);
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function sendInput(force) {
        if (!online || room.isHost) return;
        const now = performance.now();
        if (!force && now - lastSent < 80) return;
        lastSent = now;
        submitAction({ type: "input", dir: input.dir, y: input.y });
    }

    /* -------- alur pertandingan (host / offline) -------- */
    function beginServe(pi) {
        state.phase = "serve";
        state.serveT = 1.15;
        state.server = pi;
        state.serveDir = sideOf(1 - pi) === "left" ? -1 : 1; // arah bola = ke penerima
        state.ball = { x: W / 2, y: H / 2, dx: 0, dy: 0 };
        state.lastTouch = pi;
        state.aiErr = (Math.random() * 2 - 1) * state.level.aiErr;
    }
    function startMatch(nextLevel) {
        if (!isHost()) return;
        if (nextLevel) state.level = genLevel(state.level.idx + 1);
        state.score = [0, 0];
        state.winner = null;
        state.cheated = !online && Object.values(cheats).some(Boolean);
        state.paused = false;
        state.fx = [freshFx(), freshFx()];
        state.slowBall = 0;
        state.pickups = [];
        state.spawnT = 5 + Math.random() * 4;
        state.pads.left = state.pads.right = H / 2;
        // posisi pemain diacak khusus multiplayer; vs bot manusia selalu kiri
        state.sides = online && Math.random() < 0.5 ? ["right", "left"] : ["left", "right"];
        const server = Math.random() < 0.5 ? 0 : 1; // coin toss: siapa serve duluan
        beginServe(server);
        input.y = null; guestInput = { dir: 0, y: null }; view = null;
        showToast(`${nameOf(server)} serves first${online ? ` \u00B7 you play ${sideOf(myPi)}` : ""}`);
        publish(true);
    }
    function launch() {
        const t = Math.random() * 0.44 - 0.22;
        state.ball.dx = Math.cos(t) * state.serveDir;
        state.ball.dy = Math.sin(t);
        state.phase = "play";
    }
    function point(pi) {
        state.score[pi] += 1;
        if (state.score[pi] >= WIN_SCORE) {
            state.phase = "over";
            state.winner = pi;
        } else {
            beginServe(pi); // pencetak poin serve berikutnya
        }
        showToast(`${nameOf(pi)} scores!`);
        publish(true);
    }
    function applyAbility(type, pi) {
        const A = ABILITIES[type];
        if (type === "slow") state.fx[1 - pi].slowed = A.dur;
        else if (type === "ball") state.slowBall = A.dur;
        else state.fx[pi][type] = A.dur;
        showToast(`${A.icon} ${nameOf(pi)}: ${A.label} (${A.dur}s)`);
        publish(true);
    }
    function spawnPickup() {
        for (let tries = 0; tries < 24; tries++) {
            const x = 170 + Math.random() * 300, y = 46 + Math.random() * (H - 92);
            const nearObs = state.level.obstacles.some((o) => {
                const nx = clamp(x, o.x - 20, o.x + o.w + 20), ny = clamp(y, o.y - 20, o.y + o.h + 20);
                return (x - nx) * (x - nx) + (y - ny) * (y - ny) < 15 * 15;
            });
            const nearCenter = (x - W / 2) ** 2 + (y - H / 2) ** 2 < 60 * 60;
            const nearPick = state.pickups.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 46 * 46);
            if (!nearObs && !nearCenter && !nearPick) {
                state.pickups.push({ id: state.pickId++, x, y, type: TYPES[Math.floor(Math.random() * TYPES.length)], t: 12 });
                publish(true);
                return;
            }
        }
    }

    /* -------- paddle -------- */
    function moveToward(pi, target, spd, dt) {
        const side = sideOf(pi), h = heightFor(pi);
        const d = clamp(target, h / 2, H - h / 2) - state.pads[side];
        const mx = spd * dt;
        state.pads[side] = clamp(state.pads[side] + (Math.abs(d) <= mx ? d : Math.sign(d) * mx), h / 2, H - h / 2);
    }
    function controlPad(pi, dir, y, dt) {
        const side = sideOf(pi), h = heightFor(pi);
        if (dir) {
            state.pads[side] = clamp(state.pads[side] + dir * speedFor(pi) * dt, h / 2, H - h / 2);
        } else if (y != null) {
            moveToward(pi, y, DRAG_SPEED * (state.fx[pi].fast > 0 ? 1.3 : 1), dt);
        }
    }
    function updateSelf(dt) {
        if (!online && cheats.autopilot) {
            moveToward(myPi, ballToward(myPi) ? state.ball.y : H / 2, 900, dt);
            return;
        }
        controlPad(myPi, input.dir, input.y, dt);
    }
    function updateFoe(dt) {
        if (online) { controlPad(1, guestInput.dir, guestInput.y, dt); return; }
        const toward = ballToward(1);
        const target = toward ? state.ball.y + state.aiErr : H / 2;
        moveToward(1, target, speedFor(1) * (toward ? 1 : 0.55), dt);
    }

    /* -------- bola: substep anti-tunneling + obstacle + pickup + shield -------- */
    function hitPaddle(side, face, outX, dirSign) {
        const pi = piOfSide(side), h = heightFor(pi);
        const rel = clamp((state.ball.y - state.pads[side]) / (h / 2 + R), -1, 1);
        const a = rel * MAX_ANGLE;
        state.ball.x = outX;
        state.ball.dx = Math.cos(a) * dirSign;
        state.ball.dy = Math.sin(a);
        state.lastTouch = pi;
        if (!online && pi === 0) state.aiErr = (Math.random() * 2 - 1) * state.level.aiErr;
    }
    function stepBall(dt) {
        const b = state.ball;
        let rem = dt;
        const spd = ballSpeed();
        const maxH = 4 / Math.max(spd, 1);
        while (rem > 0) {
            const h = Math.min(rem, maxH);
            rem -= h;
            b.x += b.dx * spd * h;
            b.y += b.dy * spd * h;
            if (b.y < R) { b.y = 2 * R - b.y; b.dy = Math.abs(b.dy); }
            if (b.y > H - R) { b.y = 2 * (H - R) - b.y; b.dy = -Math.abs(b.dy); }
            // obstacle (circle vs AABB)
            for (const o of state.level.obstacles) {
                const nx = clamp(b.x, o.x, o.x + o.w), ny = clamp(b.y, o.y, o.y + o.h);
                const dx = b.x - nx, dy = b.y - ny;
                if (dx * dx + dy * dy < R * R) {
                    if (dx === 0 && dy === 0) { b.dy = -b.dy; continue; }
                    if (Math.abs(dx) > Math.abs(dy)) {
                        b.x = dx < 0 ? o.x - R - 0.1 : o.x + o.w + R + 0.1;
                        b.dx = dx < 0 ? -Math.abs(b.dx) : Math.abs(b.dx);
                    } else {
                        b.y = dy < 0 ? o.y - R - 0.1 : o.y + o.h + R + 0.1;
                        b.dy = dy < 0 ? -Math.abs(b.dy) : Math.abs(b.dy);
                    }
                }
            }
            // paddle kiri / kanan
            if (b.dx < 0) {
                const face = PADX + PW, hl = heightFor(piOfSide("left"));
                if (b.x - R <= face && b.x + R >= PADX &&
                    b.y >= state.pads.left - hl / 2 - R && b.y <= state.pads.left + hl / 2 + R) {
                    hitPaddle("left", face, face + R + 0.5, 1);
                }
            } else if (b.dx > 0) {
                const face = W - PADX - PW, hr = heightFor(piOfSide("right"));
                if (b.x + R >= face && b.x - R <= W - PADX &&
                    b.y >= state.pads.right - hr / 2 - R && b.y <= state.pads.right + hr / 2 + R) {
                    hitPaddle("right", face, face - R - 0.5, -1);
                }
            }
            // pickup ability
            for (let i = state.pickups.length - 1; i >= 0; i--) {
                const p = state.pickups[i];
                if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (R + 13) ** 2) {
                    state.pickups.splice(i, 1);
                    applyAbility(p.type, state.lastTouch);
                }
            }
            // gawang + shield
            if (b.x < -R * 3) {
                const pi = piOfSide("left");
                if (state.fx[pi].shield > 0) {
                    state.fx[pi].shield = 0;
                    b.x = PADX + PW + R + 2; b.dx = Math.abs(b.dx);
                    showToast(`${ABILITIES.shield.icon} ${nameOf(pi)} shield save!`);
                    publish(true);
                } else { point(piOfSide("right")); return; }
            }
            if (b.x > W + R * 3) {
                const pi = piOfSide("right");
                if (state.fx[pi].shield > 0) {
                    state.fx[pi].shield = 0;
                    b.x = W - PADX - PW - R - 2; b.dx = -Math.abs(b.dx);
                    showToast(`${ABILITIES.shield.icon} ${nameOf(pi)} shield save!`);
                    publish(true);
                } else { point(piOfSide("left")); return; }
            }
        }
    }

    function update(dt) {
        if (state.phase === "serve") {
            state.serveT -= dt;
            if (state.serveT <= 0) launch();
        } else if (state.phase === "play") {
            stepBall(dt);
            if (state.phase === "play") {
                state.spawnT -= dt;
                if (state.spawnT <= 0 && state.pickups.length < 2) {
                    spawnPickup();
                    state.spawnT = 5 + Math.random() * 4;
                }
                let removed = false;
                for (let i = state.pickups.length - 1; i >= 0; i--) {
                    state.pickups[i].t -= dt;
                    if (state.pickups[i].t <= 0) { state.pickups.splice(i, 1); removed = true; }
                }
                if (removed) publish(true);
            }
        }
        for (const f of state.fx) {
            for (const k of ["grow", "fast", "slowed", "shield"]) f[k] = Math.max(0, f[k] - dt);
        }
        state.slowBall = Math.max(0, state.slowBall - dt);
        updateSelf(dt);
        updateFoe(dt);
    }

    /* -------- render -------- */
    function smoothView(dt) {
        const age = gotState ? Math.min(0.12, (performance.now() - lastStateT) / 1000) : 0;
        const moving = state.phase === "play" && !state.paused;
        const sp = ballSpeed();
        const tx = state.ball.x + (moving ? state.ball.dx * sp * age : 0);
        const ty = state.ball.y + (moving ? state.ball.dy * sp * age : 0);
        if (!view) view = { bx: tx, by: ty, ly: state.pads.left, ry: state.pads.right };
        const k = 1 - Math.exp(-14 * Math.max(dt, 0.001));
        view.bx += (tx - view.bx) * k;
        view.by += (ty - view.by) * k;
        view.ly += (state.pads.left - view.ly) * k;
        view.ry += (state.pads.right - view.ry) * k;
        return view;
    }
    function fxStr(pi) {
        const f = state.fx[pi], parts = [];
        if (f.grow > 0) parts.push(`${ABILITIES.grow.icon}${Math.ceil(f.grow)}`);
        if (f.fast > 0) parts.push(`${ABILITIES.fast.icon}${Math.ceil(f.fast)}`);
        if (f.slowed > 0) parts.push(`${ABILITIES.slow.icon}${Math.ceil(f.slowed)}`);
        if (f.shield > 0) parts.push(`${ABILITIES.shield.icon}${Math.ceil(f.shield)}`);
        return parts.join(" ");
    }
    function syncPickups() {
        const want = new Set(state.pickups.map((p) => p.id));
        for (const ch of Array.from(pickG.children)) {
            if (!want.has(Number(ch.dataset.id))) ch.remove();
        }
        for (const p of state.pickups) {
            let el = pickG.querySelector(`[data-id="${p.id}"]`);
            if (!el) {
                el = document.createElementNS(SVGNS, "g");
                el.dataset.id = String(p.id);
                el.setAttribute("class", "pg-pickup");
                el.innerHTML = `<circle r="13" stroke="${ABILITIES[p.type].color}"></circle><text y="1">${ABILITIES[p.type].icon}</text>`;
                pickG.appendChild(el);
            }
            el.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
            el.firstChild.style.opacity = String(Math.max(0.25, Math.min(1, p.t / 2)));
        }
    }
    function setStatus(text, tone) {
        statusEl.textContent = text;
        dotEl.className = "game-status-dot" + (tone ? " " + tone : "");
    }
    function syncHudButtons() {
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".pg-btn-label");
            if (label) label.textContent = state.paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", state.paused ? "Resume" : "Pause");
            pbtn.setAttribute("title", state.paused ? "Resume (P)" : "Pause (P)");
            pbtn.disabled = online && !room.isHost;
        }
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", Object.values(cheats).some(Boolean));
    }
    function render(dt) {
        if (!state) return;
        const guest = online && !room.isHost;
        const v = guest ? smoothView(dt) : { bx: state.ball.x, by: state.ball.y, ly: state.pads.left, ry: state.pads.right };
        const piL = piOfSide("left"), piR = piOfSide("right");
        const lh = heightFor(piL), rh = heightFor(piR);
        padL.setAttribute("y", (v.ly - lh / 2).toFixed(1));
        padL.setAttribute("height", lh.toFixed(1));
        padL.setAttribute("class", "pg-pad " + (piL === myPi ? "me" : "foe"));
        padR.setAttribute("y", (v.ry - rh / 2).toFixed(1));
        padR.setAttribute("height", rh.toFixed(1));
        padR.setAttribute("class", "pg-pad " + (piR === myPi ? "me" : "foe"));
        ballEl.setAttribute("cx", v.bx.toFixed(1));
        ballEl.setAttribute("cy", v.by.toFixed(1));
        ballEl.classList.toggle("serve", state.phase === "serve");
        shL.setAttribute("class", "pg-shield " + (piL === myPi ? "me" : "foe"));
        shR.setAttribute("class", "pg-shield " + (piR === myPi ? "me" : "foe"));
        shL.style.opacity = state.fx[piL].shield > 0 ? String(0.35 + 0.65 * Math.min(1, state.fx[piL].shield / 3)) : "0";
        shR.style.opacity = state.fx[piR].shield > 0 ? String(0.35 + 0.65 * Math.min(1, state.fx[piR].shield / 3)) : "0";
        const sig = JSON.stringify(state.level.obstacles);
        if (sig !== obsSig) {
            obsSig = sig;
            obsG.innerHTML = state.level.obstacles.map((o) =>
                `<rect class="pg-obs" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="5"></rect>`).join("");
        }
        syncPickups();
        bigL.textContent = String(state.score[piL]);
        bigR.textContent = String(state.score[piR]);
        hud.me.textContent = String(state.score[myPi]);
        hud.foe.textContent = String(state.score[1 - myPi]);
        hud.meName.textContent = nameOf(myPi) + (online ? ` \u00B7 ${sideOf(myPi)}` : "");
        hud.foeName.textContent = nameOf(1 - myPi) + (online ? ` \u00B7 ${sideOf(1 - myPi)}` : "");
        hud.meFx.textContent = fxStr(myPi);
        hud.foeFx.textContent = fxStr(1 - myPi);
        hud.level.textContent = `Lv ${state.level.idx} \u00B7 ${state.level.name}` +
            (state.slowBall > 0 ? ` \u00B7 ${ABILITIES.ball.icon}${Math.ceil(state.slowBall)}s` : "");
        if (state.phase === "serve") { hud.serve.textContent = `${nameOf(state.server)} serves`; show(hud.serve); }
        else hide(hud.serve);
        if (!online && state.cheated) show(hud.cheat); else hide(hud.cheat);
        startInfo.textContent = `Level ${state.level.idx} \u00B7 ${state.level.name} \u2014 ` +
            (online ? "sides & first serve are randomized." : "a coin toss decides the first serve.");
        if (guest && !gotState) setStatus("Waiting for host", "warn");
        else if (state.phase === "idle") setStatus("Ready", "");
        else if (state.phase === "over") setStatus(state.winner === myPi ? "You win" : `${nameOf(state.winner)} wins`, state.winner === myPi ? "ok" : "warn");
        else if (state.paused) setStatus("Paused", "warn");
        else setStatus("Playing", "ok");
        if (state.phase === "over") {
            const win = state.winner === myPi;
            ovTitle.textContent = win ? "You win" : `${nameOf(state.winner)} wins`;
            ovTitle.style.color = win ? "var(--accent)" : "var(--ink)";
            ovSub.textContent = `Final ${state.score[myPi]} \u2013 ${state.score[1 - myPi]} \u00B7 Level ${state.level.idx} ${state.level.name}` +
                (state.cheated ? " \u00B7 cheats used" : "") +
                (win ? ". Great angles!" : ". Try clipping returns with the paddle edge.");
        }
        pauseSub.textContent = guest ? "The host paused the match." : "Press P or Space to resume.";
        if (state.phase === "idle" && !ui.help && !ui.cheats) show(ovStart); else hide(ovStart);
        if (ui.help) show(ovHelp); else hide(ovHelp);
        if (state.paused && (state.phase === "serve" || state.phase === "play") && !ui.help && !ui.cheats) show(ovPause); else hide(ovPause);
        if (state.phase === "over" && !ui.help && !ui.cheats) show(ovOver); else hide(ovOver);
        if (ui.cheats && !ui.help && !online) show(ovCheats); else hide(ovCheats);
        syncHudButtons();
    }

    /* -------- loop -------- */
    function tick(t) {
        if (!mounted) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;
        if (canSim()) { update(dt); publish(false); }
        if (online && !room.isHost && playable()) sendInput(false);
        render(dt);
    }

    /* -------- pause & panel -------- */
    function setPaused(v) {
        if (!isHost() || !state || state.phase === "idle" || state.phase === "over") return;
        state.paused = v;
        if (!v) {
            // Panel dibuka saat pertandingan berjalan: tick tetap dt-based,
            // tapi geser penanda waktu agar throttle publish/input tidak loncat.
            const now = performance.now();
            lastPub = now;
            lastSent = now;
            lastStateT = now;
        }
        publish(true);
    }
    function openPanel(name) {
        if (playable() && isHost()) { setPaused(true); ui.autoResume = true; }
        ui[name] = true;
        if (name === "help") ui.cheats = false;
        if (name === "cheats") ui.help = false;
    }
    function closePanel(name) {
        ui[name] = false;
        if (!ui.help && !ui.cheats && ui.autoResume) { ui.autoResume = false; setPaused(false); }
    }
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !ui.help;
        if (next) { if (ui.cheats) closePanel("cheats"); openPanel("help"); }
        else closePanel("help");
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !ui.cheats;
        if (next) { if (ui.help) closePanel("help"); openPanel("cheats"); }
        else closePanel("cheats");
        render();
    }

    /* -------- input: keyboard (desktop) -------- */
    function syncDir() {
        input.dir = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        if (input.dir) input.y = null;
        sendInput(true);
    }
    function maybeResume() {
        if (state && state.paused && isHost() && !ui.help && !ui.cheats) setPaused(false);
    }
    function onKeyDown(e) {
        if (!mounted || !state || e.metaKey || e.ctrlKey || e.altKey) return;
        const c = e.code;
        if ((c === "ArrowUp" || c === "ArrowDown" || c === "Space") && state.phase !== "idle") e.preventDefault();
        // Prioritas: help → cheats → pause/Escape → aksi game.
        if (c === "KeyH" || e.key === "?") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!online && !ui.help) toggleCheats(); e.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (ui.help) toggleHelp(false);
            else if (ui.cheats) toggleCheats(false);
            else if (isHost() && (state.phase === "serve" || state.phase === "play")) setPaused(!state.paused);
            e.preventDefault();
            return;
        }
        if (c === "ArrowUp" || c === "KeyW") { keys.up = true; syncDir(); maybeResume(); }
        else if (c === "ArrowDown" || c === "KeyS") { keys.down = true; syncDir(); maybeResume(); }
        else if (c === "Space") { if (isHost() && (state.phase === "serve" || state.phase === "play") && !ui.help && !ui.cheats) setPaused(!state.paused); }
        else if (c === "Enter") {
            if (ui.help) toggleHelp(false);
            else if (ui.cheats) toggleCheats(false);
            else if (state.phase === "idle" || state.phase === "over") submitAction({ type: "requestStart" });
        }
        else if (c === "KeyR") { if (isHost() && !ui.help && !ui.cheats) startMatch(false); }
    }
    function onKeyUp(e) {
        if (!mounted) return;
        const c = e.code;
        if (c === "ArrowUp" || c === "KeyW") { keys.up = false; syncDir(); }
        else if (c === "ArrowDown" || c === "KeyS") { keys.down = false; syncDir(); }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    function onVis() { if (document.hidden && canSim()) setPaused(true); }
    document.addEventListener("visibilitychange", onVis);

    /* -------- input: mouse hover + drag/touch di papan -------- */
    function pointerY(e) {
        if (typeof svg.getScreenCTM !== "function" || typeof svg.createSVGPoint !== "function") return null;
        const m = svg.getScreenCTM();
        if (!m) return null;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        return pt.matrixTransform(m.inverse()).y;
    }
    function onPointerMove(e) {
        if (!playable()) return;
        if (e.pointerType !== "mouse" && !dragging) return;
        const y = pointerY(e);
        if (y != null) { input.y = y; input.dir = 0; keys.up = keys.down = false; sendInput(false); }
    }
    function onPointerDown(e) {
        if (!playable()) return;
        const y = pointerY(e);
        if (y == null) return;
        dragging = true;
        input.y = y; input.dir = 0; keys.up = keys.down = false;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { }
        sendInput(true);
        e.preventDefault();
    }
    function onPointerEnd() { dragging = false; }
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerdown", onPointerDown);
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) => svg.addEventListener(n, onPointerEnd));

    /* -------- input: tombol virtual (mobile) -------- */
    root.querySelectorAll("[data-hold]").forEach((b) => {
        const k = b.dataset.hold;
        const down = (e) => {
            if (!mounted) return;
            e.preventDefault();
            maybeResume();
            keys[k] = true;
            syncDir();
        };
        const up = () => { keys[k] = false; syncDir(); };
        b.addEventListener("pointerdown", down);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointerleave", up);
        b.addEventListener("pointercancel", up);
    });

    /* -------- input: klik tombol & overlay (delegasi, sesuai template) -------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-close-cheats]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) {
            if (state && isHost() && (state.phase === "serve" || state.phase === "play")) setPaused(!state.paused);
            return;
        }
        if (t.closest("[data-restart]")) { if (state && isHost()) startMatch(false); return; }
        const btn = t.closest("[data-act]");
        if (!btn || !state) return;
        const act = btn.dataset.act;
        if (act === "start" || act === "again") submitAction({ type: "requestStart" });
        else if (act === "restart") { if (isHost()) startMatch(false); }
        else if (act === "shuffle") { if (isHost() && state.phase === "idle") { state.level = genLevel(state.level.idx); obsSig = ""; publish(true); } }
        else if (act === "pause") { if (isHost() && (state.phase === "serve" || state.phase === "play")) setPaused(!state.paused); }
        else if (act === "resume") setPaused(false);
        else if (act === "help") toggleHelp();
        else if (act === "closeHelp") toggleHelp(false);
        else if (act === "cheats") toggleCheats();
        else if (act === "closeCheats") toggleCheats(false);
        else if (act === "cheatPoint") {
            if (online) return;
            if (state.phase === "serve" || state.phase === "play") { state.cheated = true; point(myPi); }
            else showToast("Start a match first");
        }
        else if (act === "cheatWin") {
            if (online) return;
            if (state.phase === "serve" || state.phase === "play") {
                state.cheated = true;
                state.score[myPi] = WIN_SCORE;
                state.phase = "over";
                state.winner = myPi;
                publish(true);
            } else showToast("Start a match first");
        }
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat]");
        if (!c || online || !state) return;
        cheats[c.dataset.cheat] = c.checked;
        state.cheated = true;
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);

    /* -------- role UI & wiring room (mengikuti template) -------- */
    if (online) {
        root.querySelectorAll('[data-role="local"]').forEach((el) => hide(el));
        if (!room.isHost) {
            root.querySelectorAll('[data-role="ctrl"]').forEach((el) => hide(el));
            startBtn.textContent = "Ask host to start";
            show(guestNote);
        }
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(0); });
        if (typeof u1 === "function") subs.push(u1);
        if (room.isHost) {
            state = initialState(1);
            publish(true);
            const u2 = room.onAction((action) => applyAction(action, 1));
            if (typeof u2 === "function") subs.push(u2);
        } else {
            state = initialState(1); // placeholder sampai snapshot pertama tiba
            const u3 = room.onState((nextState) => {
                if (nextState && nextState.level) {
                    if (nextState.level.idx !== state.level.idx ||
                        (state.phase !== nextState.phase && nextState.phase === "serve")) view = null;
                    state = nextState;
                    gotState = true;
                    lastStateT = performance.now();
                }
            });
            if (typeof u3 === "function") subs.push(u3);
        }
    } else {
        state = initialState(1);
    }

    render(0);
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            mounted = false;
            if (raf) cancelAnimationFrame(raf);
            clearTimeout(toastTimer);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("visibilitychange", onVis);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            for (const un of subs) { try { un(); } catch (err) { } }
        },
    };
}