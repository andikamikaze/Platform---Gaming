/* ==== GAME: knife-throw.js ==== */
/*
  Knife Throw - action game.
  Template: export META + mount(root, context).
  Regenerate manifest: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "knife-throw", // harus sama dengan nama file (tanpa .js)
    name: "Knife Throw",
    category: "action",
    catLabel: "Action",
    desc: "Alternate throws on a spinning log. Land every knife, never clip a blade.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="24" cy="19" r="14"/><circle cx="24" cy="19" r="5"/><path d="M24 44V31"/><path d="M20 35h8"/></svg>',
    bg: ["#f3e7d3", "#d9a05b"],
    bestKey: "knifeThrowBest",
};

/* ---------- pure helpers ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const norm = (a) => ((a % 360) + 360) % 360;
function angleDist(a, b) {
    let d = Math.abs(norm(a - b));
    if (d > 180) d = 360 - d;
    return d;
}
function canStick(a, angles, minGap) {
    for (const s of angles) if (angleDist(a, s) < minGap) return false;
    return true;
}
function largestGap(angles) {
    if (!angles.length) return null;
    const arr = angles.map(norm).sort((x, y) => x - y);
    let best = { center: 0, size: 0 };
    for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        const b = i + 1 < arr.length ? arr[i + 1] : arr[0] + 360;
        const size = arr.length === 1 ? 360 : b - a;
        if (size > best.size) best = { center: norm(a + size / 2), size };
    }
    return best;
}

/* Level deterministik (tanpa random generator) - semua level pasti muat:
   (pre + need) * MIN_GAP < 360, pisau awal selalu berjarak sama rata. */
const LEVELS = [
    { need: 5, pre: 0, speed: 70, dir: 1 },
    { need: 6, pre: 2, speed: 95, dir: -1 },
    { need: 7, pre: 2, speed: 120, dir: 1 },
    { need: 8, pre: 3, speed: 145, dir: -1 },
    { need: 9, pre: 3, speed: 170, dir: 1 },
    { need: 10, pre: 4, speed: 195, dir: -1 },
];
const MIN_GAP = 17;
const LIVES = 3;
const BOT_MISS = [0.10, 0.13, 0.16, 0.20, 0.24, 0.28];
function preplacedAngles(level) {
    const n = LEVELS[level - 1].pre;
    const offset = (level * 53) % 360;
    const out = [];
    for (let i = 0; i < n; i++) out.push(norm(offset + (i * 360) / n));
    return out;
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = online && Boolean(room.isHost);
    const myName = String(playerName || "Player").slice(0, 18);
    let roomData = room?.room || null;

    /* ---------------- constants ---------------- */
    const W = 420, H = 500;
    const CX = 210, CY = 180, R = 88;
    const TIP_D = 30;            /* ujung pisau masuk ke lingkaran dalam (core r=34) */
    const KNIFE_LEN = 72;
    const FLY_S = 0.14;
    const THROW_Y = 420;
    const LAND_Y = CY + TIP_D;
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    /* ---------------- shell: HUD + fill board + overlays ---------------- */
    root.innerHTML = `
<style>
.kt-app{--paper:#f6f3ee;--card:#fbf9f4;--ink:#221d16;--mut:#8f867a;--line:#e5ded2;--acc:#c2410c;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:10px;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;padding:0 12px calc(12px + env(safe-area-inset-bottom));box-sizing:border-box}
.kt-app *{box-sizing:border-box}
.kt-app [hidden]{display:none!important}
.kt-app .kt-hud{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;padding:4px 2px 0;font-size:11px}
.kt-app .kt-chip{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:10px;letter-spacing:.06em;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 9px;background:var(--card)}
.kt-app .kt-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.kt-app .kt-dots{display:inline-flex;gap:3px}
.kt-app .kt-dots i{width:6px;height:6px;border-radius:50%;background:var(--line)}
.kt-app .kt-dots i.on{background:var(--ink)}
.kt-app .kt-bar{width:38px;height:4px;border-radius:2px;background:var(--line);overflow:hidden}
.kt-app .kt-bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .12s linear}
.kt-app .kt-spacer{flex:1 1 auto}
.kt-app .kt-status{gap:5px}
.kt-app .kt-status .game-status-dot{width:6px;height:6px;border-radius:50%;background:var(--mut);display:inline-block;flex:none}
.kt-app .kt-status.is-you .game-status-dot{background:var(--ink);animation:ktPulse 1.2s infinite}
.kt-app .kt-status.is-opp .game-status-dot{background:var(--acc)}
@keyframes ktPulse{50%{opacity:.35}}
.kt-app .kt-btn{font:inherit;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;min-height:38px;padding:8px 12px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;white-space:nowrap}
.kt-app .kt-btn:hover:not(:disabled){border-color:var(--ink)}
.kt-app .kt-btn:disabled{opacity:.45;cursor:not-allowed}
.kt-app .kt-btn.primary{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.kt-app .kt-btn.primary:hover:not(:disabled){opacity:.85}
.kt-app .kt-btn.ghost{background:transparent}
.kt-app .kt-btn.on{border-color:var(--acc);color:var(--acc);background:#fbe9df}
.kt-app .kt-icon-btn{display:inline-flex;align-items:center;gap:6px}
.kt-app .kt-icon-btn svg{flex:none;display:block}
.kt-app .kt-board{position:relative;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;padding:0;min-height:0}
.kt-app .kt-svg{display:block;width:100%;height:100%;touch-action:manipulation;cursor:pointer}
.kt-app .kt-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:12px;background:rgba(246,243,238,.92);backdrop-filter:blur(3px)}
.kt-app .kt-ov[data-ov="cheats"]{z-index:6}
.kt-app .kt-ov[data-ov="help"]{z-index:7}
.kt-app .kt-card{display:flex;flex-direction:column;width:min(340px,100%);max-height:100%;overflow:hidden;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:0 12px 30px rgba(34,29,22,.12)}
.kt-app .kt-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.kt-app .kt-head h3{margin:0;font-size:16px;font-weight:700;letter-spacing:.02em}
.kt-app .kt-stats,.kt-app .kt-cheat-list,.kt-app .kt-help{flex:1 1 auto;min-height:0;overflow:auto}
.kt-app .kt-stats p{margin:6px 0;font-size:12px;color:var(--mut);line-height:1.5}
.kt-app .kt-sub{font-size:12px;color:var(--mut);line-height:1.5}
.kt-app .kt-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
.kt-app .kt-note{font-size:10px;color:var(--mut)}
.kt-app .kt-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.kt-app .kt-crow{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:38px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px}
.kt-app .kt-switch{width:40px;height:24px;border-radius:999px;border:1px solid var(--line);background:var(--paper);position:relative;cursor:pointer;flex:none;padding:0}
.kt-app .kt-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--mut);transition:transform .15s,background .15s}
.kt-app .kt-switch[aria-pressed="true"]{border-color:var(--ink);background:var(--ink)}
.kt-app .kt-switch[aria-pressed="true"]::after{transform:translateX(16px);background:var(--paper)}
.kt-app .kt-cactions{display:flex;gap:8px;margin-top:10px}
.kt-app .kt-cactions .kt-btn{flex:1}
.kt-app .kt-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.kt-app .kt-help b{display:block;margin-bottom:5px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.kt-app .kt-help ul{margin:0 0 10px;padding-left:16px;font-size:11px;line-height:1.7;color:var(--mut)}
.kt-app .kt-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--paper);color:var(--ink);font:inherit;font-size:10px}
.kt-app .kt-log{fill:#efe7d8;stroke:#d9cdb8;stroke-width:2}
.kt-app .kt-ring{fill:none;stroke:#e2d7c3;stroke-width:1.5}
.kt-app .kt-core{fill:#e6dbc5;stroke:#d9cdb8;stroke-width:1.5}
.kt-app .kt-dotc{fill:#d9cdb8}
.kt-app .kt-blade{fill:#c9c1b2}
.kt-app .kt-guard{fill:#f6f3ee}
.kt-app .kt-grip.g0{fill:#221d16}
.kt-app .kt-grip.g1{fill:#c2410c}
.kt-app .kt-grip.gp{fill:#b6ac9c}
.kt-app .kt-launch{fill:#d9cdb8}
.kt-app .kt-banner{fill:#221d16;font-weight:700;letter-spacing:.3em;font-size:20px}

/* --- Batch 02 design polish --- */
.kt-app :focus-visible,.kt-app button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.kt-app .kt-hud{gap:8px}
.kt-app .kt-btn{min-height:44px;padding:10px 16px}
@media (pointer:coarse){.kt-app button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.kt-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- fill height + mobile refinements (letak PALING AKHIR) --- */
.kt-app.game-fill > .kt-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.kt-app.game-fill > .kt-board:not(:has(.kt-ov:not([hidden]))){aspect-ratio:420/500;flex:0 0 auto}
.kt-app.game-fill > .kt-board:has(.kt-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.kt-app .kt-hud{gap:5px;margin-bottom:0}
.kt-app .kt-hud .kt-chip{padding:4px 6px;font-size:9px}
.kt-app .kt-hud .kt-chip[data-hud="bestChip"],.kt-app .kt-hud .kt-chip[data-hud="firstChip"]{display:none}
.kt-app .kt-hud .kt-btn{min-height:32px;padding:5px 9px;font-size:9px}
.kt-app .kt-hud .kt-btn-label,.kt-app .kt-hud .kt-spacer{display:none}
.kt-app .kt-ov{padding:8px}
.kt-app .kt-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.kt-app .kt-stats,.kt-app .kt-cheat-list,.kt-app .kt-help{scrollbar-width:none}
.kt-app .kt-stats::-webkit-scrollbar,.kt-app .kt-cheat-list::-webkit-scrollbar,.kt-app .kt-help::-webkit-scrollbar{display:none}
.kt-app .kt-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.kt-app .kt-note{display:none}
}
</style>
<div class="game-app kt-app game-fill" data-kt>
  <div class="kt-hud">
    <span class="kt-chip">LV <b data-hud="level">1</b>/6</span>
    <span class="kt-chip">YOU <span class="kt-dots" data-hud="myDots"></span><span data-hud="myInf" hidden>&infin;</span><b data-hud="myScore">0</b></span>
    <span class="kt-chip" data-hud="oppChip" hidden><span data-hud="oppName">Bot</span> <span class="kt-dots" data-hud="oppDots"></span><b data-hud="oppScore">0</b></span>
    <span class="kt-chip">KNIVES <span class="kt-bar"><i data-hud="knivesBar"></i></span><b data-hud="knives">0/5</b></span>
    <span class="kt-chip" data-hud="bestChip">BEST <b data-hud="best">0</b></span>
    <span class="kt-chip" data-hud="firstChip">FIRST <b data-hud="first">YOU</b></span>
    <span class="kt-chip game-status kt-status" data-hud="status"><i class="game-status-dot"></i><span data-hud="statusText">Ready</span></span>
    <span class="kt-spacer"></span>
    <button class="kt-btn kt-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="kt-btn-label">Help</span></button>
    <button class="kt-btn kt-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="kt-btn-label">Cheats</span></button>
    <button class="kt-btn kt-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-icon-slot>${iconSVG("pause", { size: 14 })}</span><span class="kt-btn-label">Pause</span></button>
    <button class="kt-btn kt-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="kt-btn-label">Restart</span></button>
    <button class="kt-btn kt-icon-btn" type="button" data-throw aria-label="Throw knife" title="Throw (Space)">${iconSVG("target", { size: 14 })}<span class="kt-btn-label">Throw</span></button>
    <button class="kt-btn kt-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="kt-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel kt-board" data-board>
    <svg class="kt-svg" data-el="board" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Knife Throw board">
      <g data-el="disc">
        <circle class="kt-log" cx="${CX}" cy="${CY}" r="${R}"></circle>
        <circle class="kt-ring" cx="${CX}" cy="${CY}" r="${R - 24}"></circle>
        <circle class="kt-core" cx="${CX}" cy="${CY}" r="34"></circle>
        <circle class="kt-dotc" cx="${CX}" cy="${CY}" r="3"></circle>
        <g data-el="stuck"></g>
      </g>
      <circle class="kt-launch" cx="${CX}" cy="${THROW_Y}" r="3"></circle>
      <g data-el="fly"></g>
      <g data-el="fx"></g>
      <text class="kt-banner" data-el="banner" x="${CX}" y="336" text-anchor="middle"></text>
    </svg>
    <div class="kt-ov" data-ov="lobby">
      <div class="kt-card">
        <div class="kt-head"><h3>Knife Throw</h3></div>
        <div class="kt-stats">
          <p>Land every knife on the spinning log. Never clip a blade.</p>
          <div class="kt-row" data-el="localBtns">
            <button class="kt-btn primary" type="button" data-act="solo">Solo</button>
            <button class="kt-btn" type="button" data-act="bot">vs Bot</button>
          </div>
          <div class="kt-row" data-el="hostBtns" hidden>
            <button class="kt-btn primary" type="button" data-act="match">Start match</button>
          </div>
          <p class="kt-sub" data-el="waitMsg" hidden>Waiting for host&hellip;</p>
        </div>
        <div class="kt-foot"><span class="kt-note">Press H for the guide</span></div>
      </div>
    </div>
    <div class="kt-ov" data-ov="pause" hidden>
      <div class="kt-card">
        <div class="kt-head"><h3>Paused</h3></div>
        <div class="kt-stats"><p>Timers, knives and bot are frozen.</p><p class="kt-sub" data-el="pauseMsg" hidden>Host paused the game</p></div>
        <div class="kt-foot"><span class="kt-note">P or Esc to resume</span><button class="kt-btn primary" type="button" data-act="resume" data-el="resumeBtn">Resume</button></div>
      </div>
    </div>
    <div class="kt-ov" data-ov="over" hidden>
      <div class="kt-card">
        <div class="kt-head"><h3 data-el="ovTitle">Game over</h3></div>
        <div class="kt-stats"><p data-el="ovSub"></p></div>
        <div class="kt-foot"><span class="kt-note" data-el="againWait" hidden>Waiting for host&hellip;</span><button class="kt-btn primary" type="button" data-act="again" data-el="againBtn">Play again</button></div>
      </div>
    </div>
    <div class="kt-ov" data-ov="cheats" hidden>
      <div class="kt-card">
        <div class="kt-head"><h3>Cheats</h3><button class="kt-btn" type="button" data-act="cheats-close" aria-label="Close cheats">Close</button></div>
        <div class="kt-cheat-list">
          <div class="kt-crow"><span>Infinite lives</span><button class="kt-switch" type="button" data-cheat="lives" aria-pressed="false" aria-label="Infinite lives"></button></div>
          <div class="kt-crow"><span>Slow motion</span><button class="kt-switch" type="button" data-cheat="slow" aria-pressed="false" aria-label="Slow motion"></button></div>
          <div class="kt-crow"><span>Auto-aim</span><button class="kt-switch" type="button" data-cheat="aim" aria-pressed="false" aria-label="Auto aim"></button></div>
          <div class="kt-crow"><span>Ghost blade</span><button class="kt-switch" type="button" data-cheat="ghost" aria-pressed="false" aria-label="Ghost blade"></button></div>
          <div class="kt-cactions">
            <button class="kt-btn" type="button" data-cheat-act="clear">Clear board</button>
            <button class="kt-btn" type="button" data-cheat-act="skip">Skip level</button>
          </div>
        </div>
        <div class="kt-foot"><span class="kt-note">Host only</span><button class="kt-btn primary" type="button" data-act="cheats-close">Done</button></div>
      </div>
    </div>
    <div class="kt-ov" data-ov="help" hidden>
      <div class="kt-card">
        <div class="kt-head"><h3>How to play</h3><button class="kt-btn" type="button" data-help-close aria-label="Close guide">Close</button></div>
        <div class="kt-help">
          <div>
            <b>Controls</b>
            <ul>
              <li><span class="kt-kbd">Click</span> the board or <span class="kt-kbd">Space</span> / <span class="kt-kbd">Enter</span> to throw a knife.</li>
              <li>On mobile tap the board or use the <span class="kt-kbd">Throw</span> button in the HUD.</li>
              <li><span class="kt-kbd">H</span> help &middot; <span class="kt-kbd">C</span> cheats &middot; <span class="kt-kbd">P</span> pause &middot; <span class="kt-kbd">R</span> restart &middot; <span class="kt-kbd">Esc</span> close / pause</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>The log keeps spinning while you aim, so time your throw.</li>
              <li>Pause freezes the disc, the flight and the bot timer.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>A knife sticks only when it lands far enough from every other blade.</li>
              <li>A collision costs a life and passes the turn; three lives per player.</li>
              <li>Fill the required knife count to clear a level. Six levels, faster each time.</li>
              <li>In Solo you win by clearing all levels; vs Bot the higher score wins.</li>
              <li>Best score is saved locally and shown on the Game over screen.</li>
            </ul>
            <div class="kt-foot"><span class="kt-note">Press H to reopen this guide</span><button class="kt-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const boardEl = $('[data-el="board"]');
    const discG = $('[data-el="disc"]');
    const stuckG = $('[data-el="stuck"]');
    const flyG = $('[data-el="fly"]');
    const fxG = $('[data-el="fx"]');
    const banner = $('[data-el="banner"]');
    const hud = {
        level: $('[data-hud="level"]'),
        myDots: $('[data-hud="myDots"]'),
        myInf: $('[data-hud="myInf"]'),
        myScore: $('[data-hud="myScore"]'),
        oppChip: $('[data-hud="oppChip"]'),
        oppName: $('[data-hud="oppName"]'),
        oppDots: $('[data-hud="oppDots"]'),
        oppScore: $('[data-hud="oppScore"]'),
        knives: $('[data-hud="knives"]'),
        knivesBar: $('[data-hud="knivesBar"]'),
        bestChip: $('[data-hud="bestChip"]'),
        best: $('[data-hud="best"]'),
        firstChip: $('[data-hud="firstChip"]'),
        first: $('[data-hud="first"]'),
        status: $('[data-hud="status"]'),
        statusText: $('[data-hud="statusText"]'),
    };
    const helpBtn = $("[data-help]");
    const cheatBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const restartBtn = $("[data-restart]");
    const throwBtn = $("[data-throw]");
    const ovLobby = $('[data-ov="lobby"]');
    const ovPause = $('[data-ov="pause"]');
    const ovOver = $('[data-ov="over"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovHelp = $('[data-ov="help"]');
    const localBtns = $('[data-el="localBtns"]');
    const hostBtns = $('[data-el="hostBtns"]');
    const waitMsg = $('[data-el="waitMsg"]');
    const resumeBtn = $('[data-el="resumeBtn"]');
    const pauseMsg = $('[data-el="pauseMsg"]');
    const againBtn = $('[data-el="againBtn"]');
    const againWait = $('[data-el="againWait"]');
    const ovTitle = $('[data-el="ovTitle"]');
    const ovSub = $('[data-el="ovSub"]');

    /* ---------------- state ---------------- */
    let state = null;            /* canonical, serializable */
    let active = true;
    let raf = 0, lastT = 0;
    let simTime = 0, holdT = 0, nextLevel = -1;
    let flyT = 0, flyEl = null, flyStart = 0, flyCounter = 0;
    let botAt = -1, pendingAuto = false;
    let paused = false, cheatOpen = false, helpOpen = false;
    let pauseStarted = 0;
    const cheats = { lives: false, slow: false, aim: false, ghost: false };
    let cheatUsed = false;
    let ambRot = 0, baseRot = 0, baseT = 0;
    let stuckSig = "";
    let lastPub = 0, pubSeq = 0;
    const cosmetics = [];
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { /* ignore */ }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("knifeThrowHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("knifeThrowHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    function blankState(m) {
        return {
            phase: "lobby", mode: m, level: 1, rot: 0,
            dir: LEVELS[0].dir, speed: LEVELS[0].speed,
            stuck: [], need: LEVELS[0].need, stuckCount: 0,
            turn: 0, first: 0, slots: { host: 0, guest: 1 },
            names: [myName, m === "bot" ? "Bot" : "Guest"],
            lives: [LIVES, LIVES], score: [0, 0],
            fly: null, hold: false, banner: "",
            stickSeq: 0, clashSeq: 0, clashOwner: -1,
            winner: -1, reason: "", paused: false, seq: 0, ts: Date.now(),
        };
    }
    function playerCount() {
        const p = roomData && roomData.players;
        if (!p) return 0;
        return Array.isArray(p) ? p.length : Object.keys(p).length;
    }
    function mySlot() {
        if (!online) return 0;
        const s = state && state.slots ? state.slots : { host: 0, guest: 1 };
        return isHost ? s.host : s.guest;
    }
    const inPlay = () => Boolean(state && state.phase === "play");
    const stuckAngles = () => (state ? state.stuck.map((s) => s.a) : []);
    const effSpeed = () => (state ? state.speed * (cheats.slow && !online ? 0.45 : 1) : 0);
    const predictLand = (rot, sp, dir, ahead) => norm(90 - (rot + dir * sp * ahead));
    const safeNow = () => cheats.ghost || canStick(predictLand(state.rot, effSpeed(), state.dir, FLY_S), stuckAngles(), MIN_GAP + 4);
    const isPaused = () => Boolean(paused || (state && state.paused));

    /* ---------------- time anchors (pause freeze) ---------------- */
    function beginPauseMark() {
        if (!pauseStarted) pauseStarted = performance.now();
    }
    function shiftAnchors() {
        if (!pauseStarted) return;
        const d = performance.now() - pauseStarted;
        pauseStarted = 0;
        baseT += d;
        if (flyEl) flyStart += d;
        lastT = 0;
    }
    function setPaused(on) {
        if (!inPlay()) return;
        if (on) {
            if (paused) return;
            paused = true;
            beginPauseMark();
        } else {
            if (!paused) return;
            paused = false;
            shiftAnchors();
        }
        render();
    }
    function togglePause() {
        if (helpOpen || cheatOpen || !inPlay()) return;
        if (online) {
            if (!isHost) return;
            const on = !Boolean(state.paused);
            state.paused = on;
            if (on) beginPauseMark(); else shiftAnchors();
            publish(true);
        } else setPaused(!paused);
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
    }
    function resumeGame() {
        if (helpOpen) { toggleHelp(false); return; }
        if (cheatOpen) { toggleCheats(false); return; }
        if (online && isHost && state && state.paused) { togglePause(); return; }
        if (paused) setPaused(false);
    }
    function restartGame() {
        if (online && !isHost) return;
        helpOpen = false;
        cheatOpen = false;
        paused = false;
        pauseStarted = 0;
        newMatch(state ? state.mode : online ? "versus" : "solo");
    }

    /* ---------------- knife graphic ---------------- */
    function knifeG(owner) {
        const cls = owner === 0 ? "g0" : owner === 1 ? "g1" : "gp";
        const g = mk("g");
        g.appendChild(mk("path", { class: "kt-blade", d: "M0 0 L4.2 12 L4.2 26 L-4.2 26 L-4.2 12 Z" }));
        g.appendChild(mk("rect", { class: "kt-grip " + cls, x: -4.2, y: 26, width: 8.4, height: KNIFE_LEN - 26, rx: 3 }));
        g.appendChild(mk("rect", { class: "kt-guard", x: -6, y: 26, width: 12, height: 3.5, rx: 1.75 }));
        return g;
    }
    function stuckKnifeEl(s) {
        const g = knifeG(s.owner);
        const rad = (s.a * Math.PI) / 180;
        const x = CX + Math.cos(rad) * TIP_D;
        const y = CY + Math.sin(rad) * TIP_D;
        g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + (s.a - 90).toFixed(1) + ")");
        return g;
    }
    function createFlyEl(owner) {
        flyG.innerHTML = "";
        flyEl = knifeG(owner);
        flyEl.setAttribute("transform", "translate(" + CX + " " + THROW_Y + ")");
        flyG.appendChild(flyEl);
        flyStart = performance.now();
    }
    function clearFly() { flyG.innerHTML = ""; flyEl = null; }

    /* ---------------- cosmetics ---------------- */
    function spark(x, y, color) {
        const el = mk("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 4, fill: "none", stroke: color, "stroke-width": 3 });
        fxG.appendChild(el);
        cosmetics.push({ kind: "ring", el, t: 0 });
    }
    function spawnClash(owner) {
        const g = knifeG(owner);
        g.setAttribute("transform", "translate(" + CX + " " + LAND_Y + ")");
        fxG.appendChild(g);
        cosmetics.push({ kind: "clash", el: g, y: LAND_Y, vy: 60, rot: 0, t: 0 });
        spark(CX, LAND_Y, "#e07a5f");
    }
    function clearCosmetics() { for (const c of cosmetics) c.el.remove(); cosmetics.length = 0; }
    function updateCosmetics(dt) {
        for (let i = cosmetics.length - 1; i >= 0; i--) {
            const c = cosmetics[i];
            c.t += dt;
            if (c.kind === "ring") {
                const k = c.t / 0.4;
                if (k >= 1) { c.el.remove(); cosmetics.splice(i, 1); continue; }
                c.el.setAttribute("r", (4 + 18 * k).toFixed(1));
                c.el.setAttribute("opacity", (1 - k).toFixed(2));
            } else {
                c.vy += 900 * dt;
                c.y += c.vy * dt;
                c.rot += 260 * dt;
                c.el.setAttribute("transform", "translate(" + CX + " " + c.y.toFixed(1) + ") rotate(" + c.rot.toFixed(1) + ")");
                c.el.setAttribute("opacity", clamp(1 - c.t / 0.9, 0, 1).toFixed(2));
                if (c.t >= 0.9 || c.y > H + 80) { c.el.remove(); cosmetics.splice(i, 1); }
            }
        }
    }

    /* ---------------- render ---------------- */
    function drawDisc(rot) {
        discG.setAttribute("transform", "rotate(" + rot.toFixed(2) + " " + CX + " " + CY + ")");
    }
    function syncStuck() {
        const s = state;
        const sig = s ? s.level + ":" + s.stuck.map((k) => k.a.toFixed(1) + "/" + k.owner).join(",") : "";
        if (sig === stuckSig) return;
        stuckSig = sig;
        stuckG.innerHTML = "";
        if (s) for (const k of s.stuck) stuckG.appendChild(stuckKnifeEl(k));
    }
    function dotsHtml(lives) {
        let h = "";
        for (let i = 0; i < LIVES; i++) h += '<i class="' + (i < lives ? "on" : "") + '"></i>';
        return h;
    }
    function render() {
        const s = state || blankState(online ? "versus" : "solo");
        const lobby = !state || state.phase === "lobby";
        const over = Boolean(state && state.phase === "over");
        const play = inPlay();
        const me = mySlot();
        const versus = s.mode !== "solo";
        const frozen = isPaused();

        /* HUD: semua info di satu bar, board hanya arena */
        hud.level.textContent = String(s.level);
        hud.myScore.textContent = String(s.score[0]);
        hud.oppChip.hidden = !versus;
        if (versus) {
            hud.oppName.textContent = s.names[1] || "Guest";
            hud.oppScore.textContent = String(s.score[1]);
            hud.oppDots.innerHTML = dotsHtml(s.lives[1]);
        }
        const infOn = cheats.lives && !online;
        hud.myDots.hidden = infOn;
        hud.myInf.hidden = !infOn;
        if (!infOn) hud.myDots.innerHTML = dotsHtml(s.lives[0]);
        hud.knives.textContent = s.stuckCount + "/" + s.need;
        hud.knivesBar.style.width = Math.round(clamp(s.stuckCount / s.need, 0, 1) * 100) + "%";
        hud.best.textContent = String(best);
        hud.first.textContent = s.first === me ? "YOU" : (s.mode === "bot" ? "BOT" : "OPP");

        let txt = "Ready", cls = "";
        if (lobby) txt = online ? (isHost ? (playerCount() >= 2 ? "Opponent joined" : "Waiting for opponent") : "Waiting for host") : "Ready";
        else if (over) txt = s.winner === 2 ? "Draw" : s.winner === me ? "You win" : s.mode === "solo" ? "Game over" : "You lose";
        else if (frozen) txt = "Paused";
        else if (pendingAuto) txt = "Aiming\u2026";
        else if (s.hold) txt = "Level " + s.level;
        else if (s.fly) txt = "\u2026";
        else if (s.turn === me) { txt = "Your turn"; cls = "is-you"; }
        else { txt = s.mode === "bot" ? "Bot is aiming" : (s.names[s.turn] || "Opponent") + "'s turn"; cls = "is-opp"; }
        hud.statusText.textContent = txt;
        hud.status.classList.toggle("is-you", cls === "is-you");
        hud.status.classList.toggle("is-opp", cls === "is-opp");

        cheatBtn.hidden = online;
        cheatBtn.classList.toggle("on", Object.values(cheats).some(Boolean));
        pauseBtn.disabled = online && !isHost;
        const pauseLabel = pauseBtn.querySelector(".kt-btn-label");
        if (pauseLabel) pauseLabel.textContent = frozen ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", frozen ? "Resume" : "Pause");
        const iconSlot = pauseBtn.querySelector("[data-icon-slot]");
        if (iconSlot) iconSlot.innerHTML = iconSVG(frozen ? "play" : "pause", { size: 14 });
        restartBtn.hidden = lobby || (online && !isHost);
        throwBtn.hidden = !play || frozen || helpOpen || cheatOpen || s.hold || Boolean(s.fly) || s.turn !== me;

        /* overlays saling menekan: help > cheats > pause/result/lobby */
        ovLobby.hidden = !lobby || cheatOpen || helpOpen;
        localBtns.hidden = online;
        hostBtns.hidden = !(online && isHost);
        waitMsg.hidden = !(online && !isHost);
        ovOver.hidden = !over || cheatOpen || helpOpen;
        againBtn.hidden = online && !isHost;
        againWait.hidden = !(online && !isHost);
        ovPause.hidden = !(play && frozen) || cheatOpen || helpOpen;
        resumeBtn.hidden = online;
        pauseMsg.hidden = !online;
        ovCheats.hidden = !cheatOpen || helpOpen;
        ovHelp.hidden = !helpOpen;
        root.querySelectorAll("[data-cheat]").forEach((b) => b.setAttribute("aria-pressed", String(Boolean(cheats[b.dataset.cheat]))));

        if (over) {
            if (s.mode === "solo") {
                ovTitle.textContent = s.winner === 0 ? "You win" : "Game over";
                ovSub.textContent = "Level " + s.level + " \u00b7 " + s.score[0] + " knives \u00b7 Best " + best;
            } else {
                ovTitle.textContent = s.winner === 2 ? "Draw" : (s.names[s.winner] || "Player") + " wins";
                ovSub.textContent = s.names[0] + " " + s.score[0] + " \u2014 " + s.score[1] + " " + s.names[1] + (s.reason ? " \u00b7 " + s.reason : "");
            }
        }

        banner.textContent = s.banner || "";
        banner.style.display = s.banner ? "" : "none";
        syncStuck();
    }

    function publish(force) {
        if (force) render();
        if (online && isHost && state) {
            const now = performance.now();
            if (force || now - lastPub > 400) {
                lastPub = now;
                state.seq = ++pubSeq;
                state.ts = Date.now();
                room.publishState(state).catch(console.warn);
            }
        }
    }

    /* ---------------- flow ---------------- */
    function applyLevel(n) {
        const cfg = LEVELS[n - 1];
        state.level = n;
        state.need = cfg.need;
        state.stuckCount = 0;
        state.dir = cfg.dir;
        state.speed = cfg.speed;
        state.rot = 0;
        state.stuck = preplacedAngles(n).map((a) => ({ a, owner: -1 }));
        state.banner = "LEVEL " + n;
        state.hold = true;
        holdT = 1.0;
        nextLevel = -1;
        state.fly = null;
        clearFly();
        clearCosmetics();
        baseRot = 0;
        baseT = performance.now();
    }
    function newMatch(m) {
        /* random: siapa jalan duluan (bot/versus) + posisi slot pemain (multiplayer) */
        const slots = m === "versus"
            ? (Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 })
            : { host: 0, guest: 1 };
        const first = m === "solo" ? 0 : (Math.random() < 0.5 ? 0 : 1);
        const names = m === "solo" ? [myName, "Bot"] : m === "bot" ? [myName, "Bot"] : ["Host", "Guest"];
        if (m === "versus") {
            names[slots.host] = myName;
            names[slots.guest] = state && state.names && state.names[state.slots.guest] !== "Guest"
                ? state.names[state.slots.guest] : "Guest";
        }
        state = blankState(m);
        state.mode = m;
        state.slots = slots;
        state.names = names;
        state.first = first;
        state.turn = first;
        state.phase = "play";
        applyLevel(1);
        simTime = 0;
        botAt = -1;
        pendingAuto = false;
        flyT = 0;
        paused = false;
        pauseStarted = 0;
        cheatOpen = false;
        helpOpen = false;
        cheatUsed = Object.values(cheats).some(Boolean);
        publish(true);
    }
    function planBot() {
        const sp = effSpeed();
        const think = 0.45 + Math.random() * 0.8;
        const angles = stuckAngles();
        if (!angles.length || sp <= 0) { botAt = simTime + think; return; }
        const gap = largestGap(angles);
        let target;
        if (Math.random() < BOT_MISS[state.level - 1]) {
            const s = angles[Math.floor(Math.random() * angles.length)];
            target = norm(s + (Math.random() < 0.5 ? -1 : 1) * MIN_GAP * 0.45);
        } else {
            const room0 = Math.max(0, gap.size / 2 - MIN_GAP);
            target = norm(gap.center + (Math.random() * 2 - 1) * Math.min(2.5, room0 * 0.35));
        }
        const desired = norm(90 - target);
        const delta = norm(state.dir * (desired - state.rot));
        let wait = delta / sp - FLY_S;
        if (wait < 0) wait += 360 / sp;
        botAt = simTime + Math.max(think, wait);
    }
    function passTurn() {
        pendingAuto = false;
        if (state.mode === "solo") { state.turn = 0; return; }
        const other = 1 - state.turn;
        if (state.lives[other] > 0) state.turn = other;
        if (state.mode === "bot" && state.turn === 1 && !state.hold) planBot();
    }
    function finish(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.reason = reason;
        state.banner = "";
        state.hold = false;
        state.fly = null;
        clearFly();
        botAt = -1;
        pendingAuto = false;
        if (state.mode === "solo" && !cheatUsed && state.score[0] > best) {
            best = state.score[0];
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ }
        }
        publish(true);
    }
    function finishByScore() {
        if (state.mode === "solo") { finish(0, "All levels cleared"); return; }
        const [a, b] = state.score;
        let w = a > b ? 0 : b > a ? 1 : -1;
        if (w < 0) w = state.lives[0] > state.lives[1] ? 0 : state.lives[1] > state.lives[0] ? 1 : 2;
        finish(w, "All levels cleared");
    }
    function levelClear() {
        if (state.level >= LEVELS.length) { finishByScore(); return; }
        state.banner = "LEVEL " + state.level + " CLEAR";
        state.hold = true;
        holdT = 1.15;
        nextLevel = state.level + 1;
        passTurn();
    }
    function doThrow(owner) {
        if (!inPlay() || state.fly || state.hold || state.paused) return;
        state.fly = { owner, seq: ++flyCounter };
        flyT = 0;
        createFlyEl(owner);
        publish(true);
    }
    function land() {
        const owner = state.fly ? state.fly.owner : state.turn;
        const a = norm(90 - state.rot);
        state.fly = null;
        clearFly();
        const ghost = cheats.ghost && !online && owner === 0;
        if (ghost || canStick(a, stuckAngles(), MIN_GAP)) {
            state.stuck.push({ a, owner });
            state.stuckCount++;
            state.score[owner]++;
            state.stickSeq++;
            spark(CX, LAND_Y + 18, "#d9a05b");
            if (state.stuckCount >= state.need) levelClear();
            else passTurn();
        } else {
            state.clashSeq++;
            state.clashOwner = owner;
            spawnClash(owner);
            if (!(cheats.lives && !online && owner === 0)) state.lives[owner]--;
            if (state.lives[owner] <= 0) {
                if (state.mode === "solo") finish(-1, "Out of lives");
                else finish(1 - owner, "Out of lives");
                return;
            }
            passTurn();
        }
        publish(true);
    }

    /* ---------------- actions ---------------- */
    function applyAction(action, role) {
        if (!state || !action) return;
        if (action.type === "join") {
            if (online && isHost && role === "guest" && state.slots) {
                state.names[state.slots.guest] = String(action.name || "Guest").slice(0, 18);
                publish(true);
            }
            return;
        }
        if (action.type !== "throw") return;
        const slot = role === "local" ? 0 : (state.slots ? state.slots[role] : 0);
        if (state.phase !== "play" || state.hold || state.fly || state.paused) return;
        if (state.turn !== slot || state.lives[slot] <= 0) return;
        doThrow(slot);
    }
    function submitThrow() {
        if (!inPlay() || state.hold || state.fly || state.paused || paused || cheatOpen || helpOpen) return;
        if (state.turn !== mySlot()) return;
        if (online && !isHost) {
            room.sendAction({ type: "throw", name: myName }).catch(console.warn);
            return;
        }
        if (cheats.aim && !safeNow()) { pendingAuto = true; render(); return; }
        applyAction({ type: "throw" }, online ? "host" : "local");
    }

    /* ---------------- simulation ---------------- */
    function hostTick(dt) {
        if (!inPlay() || state.paused || paused || cheatOpen || helpOpen) return;
        simTime += dt;
        state.rot = norm(state.rot + state.dir * effSpeed() * dt);

        if (state.hold) {
            holdT -= dt;
            if (holdT <= 0) {
                if (nextLevel > 0) applyLevel(nextLevel);
                else {
                    state.hold = false;
                    state.banner = "";
                    if (state.mode === "bot" && state.turn === 1) planBot();
                }
                publish(true);
            }
        }
        if (state.fly && flyEl) {
            flyT += dt;
            const k = clamp(flyT / FLY_S, 0, 1);
            const y = THROW_Y + (LAND_Y - THROW_Y) * k;
            flyEl.setAttribute("transform", "translate(" + CX + " " + y.toFixed(1) + ")");
            if (k >= 1) land();
        }
        if (pendingAuto && state.turn === 0 && !state.fly && !state.hold && safeNow()) {
            pendingAuto = false;
            applyAction({ type: "throw" }, online ? "host" : "local");
        }
        if (state.mode === "bot" && state.turn === 1 && !state.fly && !state.hold) {
            if (botAt < 0) planBot();
            else if (simTime >= botAt) { botAt = -1; doThrow(1); }
        }
        if (online && isHost) publish(false);
    }
    function guestTick() {
        if (!state || state.phase !== "play") return;
        if (!state.paused && !cheatOpen && !helpOpen) {
            const el = (performance.now() - baseT) / 1000;
            drawDisc(norm(baseRot + state.dir * state.speed * el));
        } else drawDisc(baseRot);
        if (state.fly && flyEl) {
            const k = clamp((performance.now() - flyStart) / (FLY_S * 1000), 0, 1);
            const y = THROW_Y + (LAND_Y - THROW_Y) * k;
            flyEl.setAttribute("transform", "translate(" + CX + " " + y.toFixed(1) + ")");
        }
    }
    function tick(t) {
        if (!active) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;

        if (online && !isHost) guestTick();
        else if (inPlay()) { hostTick(dt); drawDisc(state.rot); }
        else { ambRot = norm(ambRot + 26 * dt); drawDisc(ambRot); }
        updateCosmetics(dt);
    }

    /* ---------------- room sync ---------------- */
    function onStateNext(next) {
        if (!next) return;
        if (state && typeof next.seq === "number" && next.seq < state.seq) return;
        const prev = state;
        const wasPaused = Boolean(prev && prev.paused);
        const nowPaused = Boolean(next.paused);
        if (nowPaused && !wasPaused) beginPauseMark();
        else if (!nowPaused && wasPaused) {
            if (flyEl && pauseStarted) flyStart += performance.now() - pauseStarted;
            pauseStarted = 0;
            lastT = 0;
        }
        state = next;
        baseRot = next.rot || 0;
        baseT = performance.now();
        if (next.fly && (!prev || !prev.fly || prev.fly.seq !== next.fly.seq)) createFlyEl(next.fly.owner);
        if (!next.fly && prev && prev.fly) clearFly();
        if (next.clashSeq > (prev ? prev.clashSeq : 0)) spawnClash(next.clashOwner);
        if (next.stickSeq > (prev ? prev.stickSeq : 0)) spark(CX, LAND_Y + 18, "#d9a05b");
        render();
    }
    const unsubs = [];
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (isHost) {
            state = blankState("versus");
            publish(true);
            const u2 = room.onAction((action) => applyAction(action, "guest"));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState(onStateNext);
            if (typeof u3 === "function") unsubs.push(u3);
            room.sendAction({ type: "join", name: myName }).catch(console.warn);
        }
    } else {
        state = blankState("solo");
    }

    /* ---------------- input ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest('[data-act="cheats-close"]')) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        if (t.closest("[data-throw]")) {
            if (helpOpen || cheatOpen) return;
            if (isPaused()) resumeGame(); else submitThrow();
            return;
        }
        const sw = t.closest("[data-cheat]");
        if (sw) {
            const key = sw.dataset.cheat;
            cheats[key] = !cheats[key];
            if (cheats[key]) cheatUsed = true;
            render();
            return;
        }
        const ca = t.closest("[data-cheat-act]");
        if (ca && inPlay()) {
            cheatUsed = true;
            if (ca.dataset.cheatAct === "clear") { state.stuck = []; publish(true); }
            else if (ca.dataset.cheatAct === "skip") {
                if (state.level < LEVELS.length) { applyLevel(state.level + 1); publish(true); }
                else finishByScore();
            }
            return;
        }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "solo") newMatch("solo");
        else if (act === "bot") newMatch("bot");
        else if (act === "match") newMatch("versus");
        else if (act === "restart" || act === "again") restartGame();
        else if (act === "resume") resumeGame();
    }
    function handlePointer(event) {
        if (event.button > 0) return;
        event.preventDefault();
        if (helpOpen || cheatOpen) return;
        if (!inPlay()) return;
        if (isPaused()) { resumeGame(); return; }
        submitThrow();
    }
    function handleKey(event) {
        if (!active || !root.isConnected) return;
        const c = event.code;
        /* prioritas: help -> cheats -> pause/escape -> aksi game */
        if (c === "KeyH") { toggleHelp(); event.preventDefault(); return; }
        if (c === "KeyC") { if (!online) toggleCheats(); event.preventDefault(); return; }
        if (c === "KeyP" || c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (c === "KeyP" || (!online && inPlay())) togglePause();
            event.preventDefault();
            return;
        }
        if (c === "KeyR") { restartGame(); event.preventDefault(); return; }
        if (c === "Space" || c === "ArrowUp" || c === "Enter") {
            if (event.repeat) return;
            if (event.target && event.target.closest && event.target.closest("button")) return;
            event.preventDefault();
            if (helpOpen) { toggleHelp(false); return; }
            if (cheatOpen) { toggleCheats(false); return; }
            if (isPaused()) { resumeGame(); return; }
            submitThrow();
        }
    }
    function handleVis() {
        if (document.hidden) {
            if (online && isHost && inPlay() && !state.paused) { state.paused = true; beginPauseMark(); publish(true); }
            else if (!online && inPlay() && !paused) setPaused(true);
        } else {
            lastT = 0;
            if (online && isHost && state && state.paused) { state.paused = false; shiftAnchors(); publish(true); }
        }
    }

    root.addEventListener("click", handleClick);
    boardEl.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("visibilitychange", handleVis);

    render();
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            active = false;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            root.removeEventListener("click", handleClick);
            boardEl.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener("visibilitychange", handleVis);
            for (const u of unsubs) { try { u(); } catch (e) { /* ignore */ } }
            clearCosmetics();
        },
    };
}
