/* ==== GAME: dont-blink.js ==== */
/*
 * Dont Blink - ported to the game template (export META + mount).
 * Setelah edit: node tools/build-games-manifest.mjs
 *
 * - 8 ronde tetap (bukan generator level acak tanpa akhir), pembuatan grid
 *   seeded per-match dan SELALU ada tepat 1 perubahan -> selalu bisa diselesaikan.
 * - Turn-based: vs Bot (mode "ai") atau 1v1 (mode "room", host authoritative).
 * - Giliran pertama diacak tiap match; kursi P1/P2 diacak tiap match (online).
 * - Layout: HUD bar (info + tombol ikon), board penuh tinggi, overlay
 *   start/result/pause/cheat/help di dalam board. Bantuan internal sekali jalan.
 * - Desktop: mouse + keyboard (1-9, panah + Enter, Space, H, C, P, R, Esc).
 * - Cheat overlay: reveal target, slow watch, infinite lives, auto spot.
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "dont-blink", // harus sama dengan nama file (tanpa .js)
    name: "Dont Blink",
    category: "educational",
    catLabel: "Educational",
    desc: "Memorize the grid, then spot the one shape that changed after the blink.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 24s8-11 22-11 22 11 22 11-8 11-22 11S2 24 2 24z"/><circle cx="24" cy="24" r="5"/></svg>',
    bg: ["#fda4af", "#f43f5e"],
    bestKey: "dontBlinkBest",
};

/* ---------------- constants ---------------- */
const ROUNDS = 8;
const LIVES = 3;
const FIND_MS = 15000; /* batas waktu mencari (anti-stall di multiplayer) */
const BLINK_MS = 460;
const CHANGE_MS = 150; /* perubahan diterapkan di tengah kedipan */
const REVEAL_MS = 1250;
const SIZES = [3, 3, 4, 4, 4, 5, 5, 5];
const KINDS = ["color", "shape", "color", "size", "shape", "size", "color", "shape"];

const SHAPES = {
    circle: '<circle cx="20" cy="20" r="13"/>',
    square: '<rect x="8" y="8" width="24" height="24" rx="4"/>',
    triangle: '<path d="M20 7l13 24H7z"/>',
    diamond: '<path d="M20 6l14 14-14 14L6 20z"/>',
    star: '<path d="M20 6l4.2 9.2 10 .9-7.6 6.6 2.3 9.8L20 26.8l-8.9 5.7 2.3-9.8L5.8 16.1l10-.9z"/>',
    hexagon: '<path d="M20 6l12 7v14l-12 7-12-7V13z"/>',
};
const COLORS = ["#ef4444", "#f59e0b", "#34d399", "#38bdf8", "#a78bfa", "#f472b6"];
const SHAPE_KEYS = Object.keys(SHAPES);

const CHEAT_DEFS = [
    { key: "reveal", label: "Reveal target" },
    { key: "slow", label: "Slow watch x2.5" },
    { key: "lives", label: "Infinite lives" },
    { key: "auto", label: "Auto spot" },
];

/* PRNG deterministik: grid identik untuk host & guest, match selalu valid */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRound(seed, idx, slow) {
    const rnd = mulberry32((seed + idx * 7919) >>> 0);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const n = SIZES[idx];
    const kind = KINDS[idx];
    const cells = [];
    for (let k = 0; k < n * n; k++) {
        cells.push({ shape: pick(SHAPE_KEYS), color: pick(COLORS), big: false });
    }
    const ci = Math.floor(rnd() * cells.length);
    const before = Object.assign({}, cells[ci]);
    const t = cells[ci];
    /* tepat satu perubahan yang dijamin terlihat -> ronde selalu bisa diselesaikan */
    if (kind === "color") {
        let c;
        do { c = pick(COLORS); } while (c === t.color);
        t.color = c;
    } else if (kind === "shape") {
        let s;
        do { s = pick(SHAPE_KEYS); } while (s === t.shape);
        t.shape = s;
    } else {
        t.big = true;
    }
    const obs = Math.max(1800, 3600 - idx * 220);
    return { n, cells, ci, before, obs: Math.round(obs * (slow ? 2.5 : 1)) };
}

function cellSvg(c) {
    const scale = c.big ? ' transform="translate(20 20) scale(1.28) translate(-20 -20)"' : "";
    return (
        '<svg viewBox="0 0 40 40"' + scale +
        ' fill="' + c.color + '" stroke="rgba(0,0,0,.18)" stroke-width="1" aria-hidden="true">' +
        SHAPES[c.shape] + "</svg>"
    );
}

/* ---------------- mount ---------------- */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost; /* hanya host/offline yang menjalankan clock */
    let roomData = (room && room.room) || null;
    let state = null;

    let destroyed = false;
    let cheatsOpen = false;
    let helpOpen = false;
    let paused = false;
    let frozen = false;
    let freezeAt = 0;
    let freezePerfAt = 0;
    let kbMode = false;
    let cursor = 0;
    let botPlan = null;      /* lokal (offline), tidak diserialisasi */
    let autoTag = "";
    let matchCounter = 0;
    let lastGridKey = "";
    let lastPhase = "";
    let changeApplied = true;
    const offs = [];

    /* bantuan internal: tampil sekali per perangkat, dibuka lagi lewat H / tombol Help */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("dontBlinkHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("dontBlinkHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.db-app{--db-bg:#0f1216;--db-panel:#171b22;--db-line:#242b36;--db-text:#e8edf4;--db-mut:#8a93a2;--db-acc:#8b9cf9;--db-good:#34d399;--db-bad:#f87171;color:var(--db-text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0}
.db-app *{box-sizing:border-box}
.db-app [hidden]{display:none!important}
.db-app button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.db-app :focus-visible{outline:2px solid var(--db-acc);outline-offset:2px}
.db-hud{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.db-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--db-line);border-radius:999px;background:var(--db-panel);color:var(--db-mut);white-space:nowrap}
.db-chip b{color:var(--db-text);font-weight:700;font-variant-numeric:tabular-nums}
.db-seat-name{display:inline-flex;align-items:center;gap:6px;max-width:130px}
.db-seat-name>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-seat-name b,.db-tag{font-size:10px;font-weight:700;letter-spacing:.06em;padding:2px 6px;border:1px solid var(--db-line);border-radius:6px;color:var(--db-mut);flex:none}
.db-seat.on .db-seat-name{color:var(--db-acc)}
.db-seat.on .db-seat-name b{border-color:var(--db-acc);color:var(--db-acc)}
.db-cflag{font-style:normal;font-size:9px;font-weight:800;color:#f59e0b;border:1px solid rgba(245,158,11,.4);border-radius:4px;padding:0 3px}
.db-lives{display:inline-flex;gap:4px;flex:none}
.db-lives i{width:7px;height:7px;border-radius:50%;background:var(--db-bad)}
.db-lives i.off{background:var(--db-line)}
.db-status-dot{width:7px;height:7px;border-radius:50%;background:var(--db-good);flex:none}
.db-count{color:var(--db-acc);font-variant-numeric:tabular-nums}
.db-spacer{flex:1 1 auto}
.db-btn{appearance:none;border:1px solid var(--db-line);background:var(--db-panel);color:var(--db-text);border-radius:8px;min-height:44px;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;touch-action:manipulation}
.db-btn:hover{border-color:var(--db-acc);color:var(--db-acc)}
.db-btn:focus-visible{outline:2px solid var(--db-acc);outline-offset:2px}
.db-btn:disabled{opacity:.45;cursor:default}
.db-btn.primary{background:var(--db-acc);border-color:var(--db-acc);color:#0f1216}
.db-btn.primary:hover{color:#0f1216;opacity:.92}
.db-btn.on{border-color:var(--db-acc);color:var(--db-acc)}
.db-icon-btn{display:inline-flex;align-items:center;gap:6px}
.db-icon-btn svg{flex:none;display:block}
.db-hud .db-btn{min-height:34px;padding:6px 9px;font-size:10px}
.db-board{position:relative;width:100%;flex:1 1 auto;min-height:0;display:grid;place-items:center;padding:12px;background:var(--db-bg);border:1px solid var(--db-line);border-radius:12px;overflow:hidden}
.db-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:8px;width:min(100%,calc(var(--n)*72px + (var(--n) - 1)*8px));margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.db-cell{aspect-ratio:1;display:grid;place-items:center;padding:0;background:var(--db-panel);border:1px solid var(--db-line);border-radius:10px;cursor:pointer;transition:border-color .12s,background .12s,transform .12s;-webkit-tap-highlight-color:transparent}
@media (hover:hover){.db-app .db-grid:not(.locked) .db-cell:hover{border-color:var(--db-acc);transform:translateY(-1px)}}
.db-grid.locked .db-cell{cursor:default}
.db-cell svg{width:62%;height:62%;display:block}
.db-cell.good{border-color:var(--db-good);background:rgba(52,211,153,.1)}
.db-cell.bad{border-color:var(--db-bad);background:rgba(248,113,113,.1)}
.db-cell.hint{border-color:var(--db-acc);border-style:dashed}
.db-cell.cursor{box-shadow:0 0 0 2px var(--db-acc) inset}
.db-flash{position:absolute;inset:0;background:#fff;border-radius:10px;opacity:0;pointer-events:none;z-index:3}
.db-flash.go{animation:db-blink .46s ease-out}
@keyframes db-blink{0%{opacity:0}30%{opacity:.95}100%{opacity:0}}
.db-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:12px;background:rgba(15,18,22,.94);border-radius:inherit}
.db-card{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--db-line);border-radius:14px;background:var(--db-panel);text-align:left;overflow:hidden}
.db-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.db-head h3{margin:0;font-size:14px;font-weight:800}
.db-stats,.db-cheats,.db-help{flex:1 1 auto;min-height:0;overflow:auto}
.db-cover-title{font-size:22px;font-weight:800;text-align:center}
.db-cover-sub{font-size:13px;color:var(--db-mut);line-height:1.5;text-align:center}
.db-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:auto;padding-top:10px;border-top:1px solid var(--db-line)}
.db-note{font-size:11px;color:var(--db-mut);line-height:1.5}
.db-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;font-size:13px;cursor:pointer}
.db-cheat-row input{appearance:none;-webkit-appearance:none;width:40px;height:24px;border:1px solid var(--db-line);border-radius:999px;background:var(--db-line);position:relative;cursor:pointer;transition:background .16s;flex:none;margin:0}
.db-cheat-row input::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .16s}
.db-cheat-row input:checked{background:var(--db-acc)}
.db-cheat-row input:checked::after{left:19px}
.db-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.db-help b{display:block;margin-bottom:6px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;color:var(--db-mut);text-transform:uppercase}
.db-help ul{margin:0 0 12px;padding-left:16px;font:600 11px/1.7 ui-monospace,monospace;color:var(--db-mut)}
.db-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--db-line);border-bottom-width:2px;border-radius:5px;background:var(--db-bg);color:var(--db-text);font:inherit}
@media (max-width:480px){
.db-board{padding:8px}
.db-grid{gap:6px}
.db-cover-title{font-size:20px}
.db-app .db-hud{gap:6px}
}
@media (pointer:coarse){
.db-app .db-cheat-row input{width:52px;height:44px}
.db-app .db-cheat-row input::after{top:14px}
}
@media (prefers-reduced-motion:reduce){.db-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
/* --- layout overrides (keep last) --- */
.db-app.game-fill > .db-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.db-app.game-fill > .db-board:not(:has(.db-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto}
.db-app.game-fill > .db-board:has(.db-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.db-app .db-hud{gap:5px;margin-bottom:0}
.db-app .db-hud .db-chip{padding:4px 6px;font-size:9px}
.db-app .db-hud .db-chip[data-hud="status"],
.db-app .db-hud .db-seat-name>span{display:none}
.db-app .db-hud .db-btn{min-height:32px;padding:5px 9px;font-size:9px}
.db-app .db-hud .db-btn-label,
.db-app .db-hud .db-spacer{display:none}
.db-app .db-ov{padding:8px}
.db-app .db-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.db-app .db-stats,.db-app .db-cheats,.db-app .db-help{scrollbar-width:none}
.db-app .db-stats::-webkit-scrollbar,
.db-app .db-cheats::-webkit-scrollbar,
.db-app .db-help::-webkit-scrollbar{display:none}
.db-app .db-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--db-line)}
.db-app .db-note{display:none}
}
</style>
<div class="game-app db-app game-fill" data-db>
  <div class="db-hud">
    <span class="db-chip db-seat" data-seat="0">
      <span class="db-seat-name"><b data-tag>P1</b><span data-name>You</span><i class="db-cflag" data-cflag hidden>C</i></span>
      <b data-score>0</b>
      <span class="db-lives"><i data-life></i><i data-life></i><i data-life></i></span>
    </span>
    <span class="db-chip">ROUND <b data-round>1/${ROUNDS}</b></span>
    <span class="db-chip db-seat" data-seat="1">
      <span class="db-seat-name"><b data-tag>P2</b><span data-name>${online ? "Player 2" : "Bot"}</span><i class="db-cflag" data-cflag hidden>C</i></span>
      <b data-score>0</b>
      <span class="db-lives"><i data-life></i><i data-life></i><i data-life></i></span>
    </span>
    <span class="db-chip" data-hud="status"><i class="db-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
    <span class="db-chip"><span data-phase aria-live="polite"></span><b class="db-count" data-count></b></span>
    <span class="db-spacer"></span>
    <button class="db-btn db-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="db-btn-label">Help</span></button>
    <button class="db-btn db-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="db-btn-label">Cheats</span></button>
    <button class="db-btn db-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="db-btn-label">Pause</span></button>
    <button class="db-btn db-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="db-btn-label">Restart</span></button>
    <button class="db-btn db-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="db-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel db-board" data-board>
    <div class="db-grid" data-grid style="--n:3"></div>
    <div class="db-flash" data-flash aria-hidden="true"></div>
    <div class="db-ov" data-ov="cover">
      <div class="db-card">
        <div class="db-head"><h3 data-cover-title>Dont Blink</h3><span class="db-tag">${online ? "Online" : "vs Bot"}</span></div>
        <div class="db-stats"><p class="db-cover-sub" data-cover-sub hidden></p></div>
        <div class="db-foot"><span class="db-note">8 rounds &middot; first to run the rival out of lives wins</span><button type="button" class="db-btn primary" data-act="start" data-cover-btn>Start</button></div>
      </div>
    </div>
    <div class="db-ov" data-ov="pause" hidden>
      <div class="db-card">
        <div class="db-head"><h3>Paused</h3></div>
        <div class="db-foot"><span class="db-note">Press P or Esc to resume</span><button type="button" class="db-btn primary" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="db-ov" data-ov="cheat" hidden>
      <div class="db-card">
        <div class="db-head"><h3>Cheats</h3><button class="db-btn" type="button" data-act="cheats-close" aria-label="Close cheats">Close</button></div>
        <div class="db-cheats">
          ${CHEAT_DEFS.map((d) => '<label class="db-cheat-row"><span>' + d.label + '</span><input type="checkbox" data-cheat="' + d.key + '"></label>').join("")}
        </div>
        <div class="db-foot"><span class="db-note">Cheats apply to your seat only</span><button type="button" class="db-btn" data-act="cheats-close">Close</button></div>
      </div>
    </div>
    <div class="db-ov" data-ov="help" hidden>
      <div class="db-card">
        <div class="db-head"><h3>How to play</h3><button class="db-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="db-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Memorize the grid during <span class="db-kbd">watch</span>, then spot the one shape that changed after the blink.</li>
              <li>Click the changed cell, or press <span class="db-kbd">1</span>&ndash;<span class="db-kbd">9</span> to pick by index.</li>
              <li><span class="db-kbd">&#8592;</span><span class="db-kbd">&#8594;</span><span class="db-kbd">&#8593;</span><span class="db-kbd">&#8595;</span> move the cursor, <span class="db-kbd">Enter</span> / <span class="db-kbd">Space</span> confirms.</li>
              <li><span class="db-kbd">H</span> help &middot; <span class="db-kbd">C</span> cheats &middot; <span class="db-kbd">P</span>/<span class="db-kbd">Esc</span> pause &middot; <span class="db-kbd">R</span> restart.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap the changed cell directly; no virtual buttons needed.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>There are ${ROUNDS} rounds; exactly one cell changes (color, shape or size) every round.</li>
              <li>You have ${LIVES} lives. A wrong pick or a timeout costs one life unless cheat is on.</li>
              <li>Players alternate who goes first; seats are shuffled online.</li>
              <li>Run the rival out of lives, or lead in score after ${ROUNDS} rounds, to win.</li>
            </ul>
          </div>
        </div>
        <div class="db-foot"><span class="db-note">Press H to reopen this guide</span><button type="button" class="db-btn primary" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const board = $("[data-board]");
    const statusEl = $("[data-status]"),
        phaseEl = $("[data-phase]"),
        countEl = $("[data-count]"),
        roundEl = $("[data-round]"),
        gridEl = $("[data-grid]"),
        flashEl = $("[data-flash]"),
        coverEl = $('[data-ov="cover"]'),
        coverTitleEl = $("[data-cover-title]"),
        coverSubEl = $("[data-cover-sub]"),
        coverBtnEl = $("[data-cover-btn]"),
        pauseBtnEl = $("[data-pause]"),
        cheatsBtnEl = $("[data-cheats]");
    const ov = {
        cover: coverEl,
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const seatEls = Array.from(root.querySelectorAll(".db-seat"));
    const cheatInputs = Array.from(root.querySelectorAll("input[data-cheat]"));

    /* ---------------- helpers ---------------- */
    const now = () => Date.now();
    const mySeat = () => (state ? state.seatMap[playerIndex] : 0);
    const activeSeat = () => (state.first + state.round - 1) % 2;
    const myCheats = () => (state && state.cheats && state.cheats[mySeat()]) || {};
    const seatName = (s) => {
        if (!state) return s === 0 ? "P1" : "P2";
        if (s === mySeat()) return "You";
        if (!online) return "Bot";
        const p = state.seatMap.indexOf(s);
        const rec = roomData && roomData.players && roomData.players[p];
        return (rec && rec.name) || "Player " + (p + 1);
    };

    /* ---------------- freeze / overlays ---------------- */
    function shiftClock(ms) {
        if (!authority || !state || !ms || ms < 0) return;
        if (state.endsAt) state.endsAt += ms;
        if (state.changeAt) state.changeAt += ms;
        if (state.findAt) state.findAt += ms;
        if (botPlan) botPlan.at += ms;
    }
    function syncFreeze() {
        const next = paused || helpOpen || cheatsOpen;
        if (next === frozen) return;
        frozen = next;
        if (frozen) {
            freezeAt = Date.now();
            freezePerfAt = performance.now();
        } else {
            const shift = freezeAt ? Date.now() - freezeAt : 0;
            const perfShift = freezePerfAt ? performance.now() - freezePerfAt : 0;
            freezeAt = 0;
            freezePerfAt = 0;
            void perfShift; /* penanda performa: tidak dipakai engine turn-based */
            shiftClock(shift);
            if (online && authority && state) publish();
        }
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) { helpOpen = false; paused = false; }
        syncFreeze();
        render();
    }
    function togglePause(on) {
        if (!authority) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { cheatsOpen = false; helpOpen = false; }
        syncFreeze();
        render();
    }
    function syncOverlays() {
        const showCover = !state || state.phase === "idle" || showOver();
        ov.cover.hidden = !showCover || cheatsOpen || helpOpen || paused;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen || paused;
        ov.help.hidden = !helpOpen;
        if (cheatsBtnEl) {
            const c = myCheats();
            const active = Object.keys(c).filter((k) => c[k]).length;
            cheatsBtnEl.classList.toggle("on", active > 0);
            const label = cheatsBtnEl.querySelector(".db-btn-label");
            if (label) label.textContent = active > 0 ? "Cheats " + active : "Cheats";
        }
        if (pauseBtnEl) {
            const label = pauseBtnEl.querySelector(".db-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtnEl.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtnEl.title = paused ? "Resume (P)" : "Pause (P)";
            pauseBtnEl.disabled = !authority;
        }
    }
    function showOver() { return Boolean(state && state.phase === "over"); }

    /* ---------------- state (serializable, host-authoritative) ---------------- */
    function blankState() {
        return {
            phase: "idle", round: 1, first: 0, seatMap: [0, 1],
            seed: 0, matchId: 0, n: 0, cells: [], ci: -1, before: null,
            pick: null, good: false, scores: [0, 0], lives: [LIVES, LIVES],
            cheats: [{}, {}], endsAt: 0, changeAt: 0, findAt: 0,
            winner: null, reason: "",
        };
    }

    function newMatch() {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        const r = mulberry32(seed);
        const keepCheats = state && state.cheats ? state.cheats : [{}, {}];
        /* kursi P1/P2 diacak tiap match (online); offline pemain selalu kursi 0 */
        const hostSeat = online ? (r() < 0.5 ? 0 : 1) : 0;
        matchCounter += 1;
        state = blankState();
        state.seed = seed;
        state.matchId = matchCounter;
        state.seatMap = online ? [hostSeat, 1 - hostSeat] : [0, 1];
        state.first = r() < 0.5 ? 0 : 1; /* siapa jalan duluan: acak (bot & multiplayer) */
        state.cheats = keepCheats;
        beginRound(1);
    }

    function beginRound(k) {
        const seat = (state.first + k - 1) % 2;
        const slow = !!(state.cheats[seat] && state.cheats[seat].slow);
        const gen = makeRound(state.seed, k - 1, slow);
        state.round = k;
        state.n = gen.n;
        state.cells = gen.cells;
        state.ci = gen.ci;
        state.before = gen.before;
        state.pick = null;
        state.good = false;
        state.phase = "watch";
        state.endsAt = now() + gen.obs;
        state.changeAt = 0;
        state.findAt = 0;
        botPlan = null;
        publish();
    }

    function resolvePick(i) {
        const seat = activeSeat();
        const good = i === state.ci;
        state.pick = i;
        state.good = good;
        if (good) state.scores[seat] += 1;
        else if (!(state.cheats[seat] && state.cheats[seat].lives)) {
            state.lives[seat] = Math.max(0, state.lives[seat] - 1);
        }
        state.phase = "reveal";
        state.endsAt = now() + REVEAL_MS;
        publish();
    }

    function finish(winner, reason) {
        state.phase = "over";
        state.winner = winner;
        state.reason = reason;
        state.endsAt = 0;
        if (!online) {
            try {
                const prev = Number(localStorage.getItem(META.bestKey)) || 0;
                const sc = state.scores[mySeat()];
                if (sc > prev) localStorage.setItem(META.bestKey, String(sc));
            } catch (err) { /* storage tidak tersedia */ }
        }
        publish();
    }

    /* transisi waktu, hanya dijalankan authority (offline / host) */
    function advance() {
        const t = now();
        if (state.phase === "watch") {
            state.phase = "blink";
            state.changeAt = t + CHANGE_MS;
            state.endsAt = t + BLINK_MS;
            publish();
        } else if (state.phase === "blink") {
            state.phase = "find";
            state.findAt = t;
            state.endsAt = t + FIND_MS;
            if (!online && activeSeat() === 1) {
                /* bot: akurasi menurun sesuai ronde, delay manusiawi */
                const acc = Math.max(0.5, 0.93 - (state.round - 1) * 0.05);
                let i = state.ci;
                if (Math.random() >= acc) {
                    do { i = Math.floor(Math.random() * state.cells.length); } while (i === state.ci);
                }
                botPlan = { at: t + 700 + Math.floor(Math.random() * 1600), i };
            }
            publish();
        } else if (state.phase === "find") {
            resolvePick(-1); /* timeout dihitung miss */
        } else if (state.phase === "reveal") {
            const seat = activeSeat();
            if (state.lives[seat] <= 0) finish(1 - seat, "lives");
            else if (state.round >= ROUNDS) {
                const a = state.scores[0], b = state.scores[1];
                finish(a === b ? -1 : a > b ? 0 : 1, "rounds");
            } else beginRound(state.round + 1);
        }
    }

    /* ---------------- template plumbing ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (destroyed || !authority || !state || !action) return;
        if (actor !== 0 && actor !== 1) return;
        const seat = state.seatMap[actor];
        if (action.type === "start") { newMatch(); return; }
        if (action.type === "cheat") {
            if (!CHEAT_DEFS.some((d) => d.key === action.key)) return;
            if (!state.cheats) state.cheats = [{}, {}];
            if (!state.cheats[seat]) state.cheats[seat] = {};
            state.cheats[seat][action.key] = !!action.on;
            publish();
            return;
        }
        if (action.type === "tap") {
            if (state.phase !== "find" || seat !== activeSeat()) return;
            const i = action.i;
            if (!Number.isInteger(i) || i < 0 || i >= state.cells.length) return;
            resolvePick(i);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------------- render ---------------- */
    function buildGrid() {
        const s = state;
        if (!s || !s.cells.length) {
            gridEl.innerHTML = "";
            changeApplied = true;
            return;
        }
        const useBefore = s.phase === "watch" || (s.phase === "blink" && now() < s.changeAt);
        gridEl.style.setProperty("--n", String(s.n));
        let html = "";
        for (let i = 0; i < s.cells.length; i++) {
            const c = i === s.ci && useBefore ? s.before : s.cells[i];
            html += '<button type="button" class="db-cell" data-i="' + i + '" aria-label="Cell ' + (i + 1) + '">' + cellSvg(c) + "</button>";
        }
        gridEl.innerHTML = html;
        changeApplied = !useBefore;
    }

    function decorate() {
        const s = state;
        if (!s) return;
        const mine = s.phase === "find" && activeSeat() === mySeat();
        gridEl.classList.toggle("locked", !mine);
        const reveal = mine && !!myCheats().reveal;
        const cells = gridEl.children;
        for (let i = 0; i < cells.length; i++) {
            const el = cells[i];
            el.classList.toggle("good", s.phase === "reveal" && i === s.ci);
            el.classList.toggle("bad", s.phase === "reveal" && Number.isInteger(s.pick) && s.pick >= 0 && s.pick === i && i !== s.ci);
            el.classList.toggle("hint", reveal && i === s.ci);
            el.classList.toggle("cursor", kbMode && mine && i === cursor);
        }
    }

    function tickText() {
        const s = state;
        if (!s) { countEl.textContent = ""; return; }
        if (frozen) return; /* zaman dibekukan: jangan hitung mundur saat pause/help/cheat */
        if (s.phase === "watch" || s.phase === "find") {
            countEl.textContent = String(Math.max(0, Math.ceil((s.endsAt - now()) / 1000)));
        } else countEl.textContent = "";
    }

    function render() {
        if (destroyed) return;
        const s = state;
        if (!s) { /* guest menunggu state pertama dari host */
            statusEl.textContent = "Connecting...";
            phaseEl.textContent = "";
            countEl.textContent = "";
            coverTitleEl.textContent = META.name;
            coverSubEl.hidden = false;
            coverSubEl.textContent = "Waiting for host...";
            coverBtnEl.hidden = true;
            syncOverlays();
            return;
        }

        const mine = activeSeat() === mySeat();
        const who = mine ? "You" : seatName(activeSeat());
        let phaseTxt = "", statusTxt = "Ready";
        if (s.phase === "watch") {
            phaseTxt = mine ? "Memorize" : who + " memorizing...";
            statusTxt = s.round === 1 ? who + (mine ? " go first" : " goes first") : mine ? "Your turn" : who + "'s turn";
        } else if (s.phase === "blink") {
            phaseTxt = "";
            statusTxt = mine ? "Your turn" : who + "'s turn";
        } else if (s.phase === "find") {
            phaseTxt = mine ? "Spot the change" : who + " looking...";
            statusTxt = mine ? "Your turn" : "Waiting";
        } else if (s.phase === "reveal") {
            phaseTxt = s.good ? "Spotted" : s.pick === -1 ? "Too slow" : "Missed";
            statusTxt = phaseTxt;
        } else if (s.phase === "over") {
            statusTxt = "Finished";
        }
        statusEl.textContent = statusTxt;
        phaseEl.textContent = phaseTxt;
        roundEl.textContent = Math.min(s.round, ROUNDS) + "/" + ROUNDS;

        seatEls.forEach((el, seat) => {
            el.classList.toggle("on", (s.phase === "watch" || s.phase === "blink" || s.phase === "find") && activeSeat() === seat);
            el.querySelector("[data-name]").textContent = seatName(seat);
            el.querySelector("[data-score]").textContent = String(s.scores[seat]);
            const lv = s.lives[seat];
            el.querySelectorAll("[data-life]").forEach((d, j) => d.classList.toggle("off", j >= lv));
            const ch = !!(s.cheats && s.cheats[seat] && CHEAT_DEFS.some((d) => s.cheats[seat][d.key]));
            el.querySelector("[data-cflag]").hidden = !ch;
        });

        const gridKey = s.matchId + ":" + s.round + ":" +
            (s.phase === "watch" || s.phase === "blink" ? "b" : "a") + ":" +
            (s.phase === "reveal" ? s.pick : "");
        if (gridKey !== lastGridKey) {
            lastGridKey = gridKey;
            cursor = 0;
            buildGrid();
        }
        decorate();

        if (s.phase === "blink" && lastPhase !== "blink") {
            flashEl.classList.remove("go");
            void flashEl.offsetWidth; /* restart animasi */
            flashEl.classList.add("go");
        }
        lastPhase = s.phase;

        if (s.phase === "idle" || showOver()) {
            let title = META.name, sub = "", btn = "Start";
            if (showOver()) {
                title = s.winner === -1 ? "Draw" : s.winner === mySeat() ? "You win" : seatName(s.winner) + " wins";
                sub = s.scores[0] + " - " + s.scores[1] + (s.reason === "lives" ? " | out of lives" : "");
                btn = "Play again";
            }
            coverTitleEl.textContent = title;
            coverSubEl.textContent = sub;
            coverSubEl.hidden = !sub;
            coverBtnEl.hidden = false;
            coverBtnEl.textContent = btn;
        }

        cheatInputs.forEach((input) => { input.checked = !!myCheats()[input.dataset.cheat]; });
        tickText();
        syncOverlays();
    }

    /* ---------------- input ---------------- */
    function tap(i) {
        const s = state;
        if (frozen || !s || s.phase !== "find" || activeSeat() !== mySeat()) return;
        kbMode = false;
        submitAction({ type: "tap", i });
    }
    function restartGame() {
        paused = false;
        helpOpen = false;
        cheatsOpen = false;
        syncFreeze();
        submitAction({ type: "start" });
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "start") submitAction({ type: "start" });
            else if (a === "cheats") toggleCheats();
            else if (a === "cheats-close") toggleCheats(false);
            return;
        }
        const cell = t.closest(".db-cell");
        if (cell) tap(Number(cell.dataset.i));
    }

    /* mouse + sentuhan: tap langsung sel grid (tanpa tombol virtual) */
    function handlePointer(event) {
        if (typeof event.button === "number" && event.button > 0) return;
        const cell = event.target.closest(".db-cell");
        if (!cell) return;
        event.preventDefault();
        tap(Number(cell.dataset.i));
    }

    function handleChange(event) {
        const input = event.target.closest("input[data-cheat]");
        if (!input) return;
        submitAction({ type: "cheat", key: input.dataset.cheat, on: input.checked });
    }

    function handleKey(event) {
        if (destroyed || !root.isConnected) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const k = event.key;
        const code = event.code || "";
        const tag = event.target && event.target.tagName;
        const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
        const is = (letter) => code === "Key" + letter || k === letter.toLowerCase() || k === letter.toUpperCase();

        /* prioritas: help -> cheats -> pause/Escape -> aksi game */
        if (is("H")) { event.preventDefault(); toggleHelp(); return; }
        if (is("C")) { event.preventDefault(); if (!helpOpen && !paused) toggleCheats(); return; }
        if (is("P") || k === "Escape") {
            event.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (authority) togglePause();
            return;
        }
        if (is("R") && !typing) { event.preventDefault(); restartGame(); return; }
        if (k === "Enter" || k === " ") {
            if (helpOpen) { event.preventDefault(); toggleHelp(false); return; }
            if (cheatsOpen) { event.preventDefault(); toggleCheats(false); return; }
            if (paused) { event.preventDefault(); togglePause(false); return; }
            if (frozen || typing || (event.target && event.target.closest && event.target.closest("button"))) return;
        }
        if (frozen || typing) { event.preventDefault(); return; }

        const s = state;
        if (!s) return;
        if (s.phase === "idle" || showOver()) {
            if (k === " " || k === "Enter") {
                if (event.target.closest && event.target.closest("button")) return; /* aktivasi native */
                event.preventDefault();
                submitAction({ type: "start" });
            }
            return;
        }
        if (s.phase !== "find") return;
        if (k >= "1" && k <= "9") {
            const i = Number(k) - 1;
            if (i < s.cells.length) tap(i);
            return;
        }
        const n = s.n;
        if (cursor >= n * n) cursor = 0;
        let r = Math.floor(cursor / n), c = cursor % n, moved = true;
        if (k === "ArrowLeft") c = (c + n - 1) % n;
        else if (k === "ArrowRight") c = (c + 1) % n;
        else if (k === "ArrowUp") r = (r + n - 1) % n;
        else if (k === "ArrowDown") r = (r + 1) % n;
        else moved = false;
        if (moved) { event.preventDefault(); kbMode = true; cursor = r * n + c; decorate(); return; }
        if (k === "Enter" || k === " ") {
            event.preventDefault();
            kbMode = true;
            tap(cursor);
        }
    }

    /* ---------------- clock: 1 tick ringan, tanpa write Firebase per detik ---------------- */
    const tickId = setInterval(() => {
        if (destroyed || !state || frozen) return;
        const s = state, t = now();
        tickText();
        if (s.phase === "blink" && !changeApplied && t >= s.changeAt) {
            const el = gridEl.children[s.ci];
            if (el) el.innerHTML = cellSvg(s.cells[s.ci]);
            changeApplied = true;
        }
        if (authority && s.endsAt && t >= s.endsAt &&
            (s.phase === "watch" || s.phase === "blink" || s.phase === "find" || s.phase === "reveal")) {
            advance();
        }
        if (!online && s.phase === "find" && botPlan && activeSeat() === 1 && t >= botPlan.at) {
            const p = botPlan;
            botPlan = null;
            applyAction({ type: "tap", i: p.i }, 1);
        }
        if (s.phase === "find" && activeSeat() === mySeat() && myCheats().auto) {
            const tag = s.matchId + ":" + s.round;
            if (autoTag !== tag && t >= s.findAt + 350) {
                autoTag = tag;
                submitAction({ type: "tap", i: s.ci });
            }
        }
    }, 100);

    /* ---------------- wiring ---------------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    gridEl.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    syncFreeze();
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = blankState();
            publish();
            offs.push(room.onAction((action) => applyAction(action, 1)));
        } else {
            offs.push(room.onState((nextState) => { state = nextState; render(); }));
            render();
        }
    } else {
        state = blankState();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            clearInterval(tickId);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            gridEl.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            for (const off of offs) {
                if (typeof off === "function") { try { off(); } catch (err) { /* noop */ } }
            }
        },
    };
}
