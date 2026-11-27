/* ==== GAME: block-fill.js ==== */
/*
 * Block Fill — one-stroke path race.
 * - Mengikuti template: export META + mount(root, context), return { destroy }.
 * - Level FIXED & pre-validated (tidak ada random level generator saat runtime).
 * - Mode "ai": race vs bot, koin acak menentukan siapa jalan duluan.
 * - Mode "room": host authoritative, slot pemain diacak (host tidak selalu P1).
 * - Jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "block-fill", // harus sama dengan nama file (tanpa .js)
    name: "Block Fill",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Race to fill every cell with one stroke, from start to finish.",
    art:
        '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="4" y="4" width="40" height="40" rx="6" stroke-opacity=".35" stroke-width="2"/>' +
        '<path d="M14 4v40M24 4v40M34 4v40M4 14h40M4 24h40M4 34h40" stroke-opacity=".18" stroke-width="1.6"/>' +
        '<polyline points="9,9 29,9 29,19 9,19 9,29 29,29 39,29 39,39" stroke-width="3.4"/>' +
        '<circle cx="9" cy="9" r="4.5" fill="currentColor" stroke="none"/>' +
        '<circle cx="39" cy="39" r="4.5" fill="none" stroke-width="2.6"/>' +
        "</svg>",
    bg: ["#eef2ff", "#c7d2fe"],
};

/* ---------- fixed, pre-validated levels (sol = solusi resmi, walls = sisanya) ---------- */
const LEVELS = [
    { w: 4, h: 4, walls: [], sol: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12] },
    { w: 4, h: 4, walls: [5, 9], sol: [0, 1, 2, 3, 7, 6, 10, 11, 15, 14, 13, 12, 8, 4] },
    { w: 5, h: 4, walls: [7, 12], sol: [4, 9, 8, 3, 2, 1, 0, 5, 6, 11, 10, 15, 16, 17, 18, 13, 14, 19] },
    { w: 5, h: 5, walls: [], sol: [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11, 12, 13, 14, 19, 18, 17, 16, 15, 20, 21, 22, 23, 24] },
    { w: 5, h: 5, walls: [10, 11, 13, 14], sol: [0, 5, 6, 1, 2, 3, 4, 9, 8, 7, 12, 17, 16, 15, 20, 21, 22, 23, 24, 19, 18] },
    { w: 6, h: 5, walls: [7, 10, 19, 22], sol: [23, 29, 28, 27, 21, 20, 26, 25, 24, 18, 12, 6, 0, 1, 2, 3, 4, 5, 11, 17, 16, 15, 9, 8, 14, 13] },
    { w: 6, h: 5, walls: [7, 10, 13, 16, 19, 22], sol: [5, 11, 17, 23, 29, 28, 27, 26, 25, 24, 18, 12, 6, 0, 1, 2, 8, 14, 20, 21, 15, 9, 3, 4] },
    { w: 6, h: 6, walls: [8, 9, 26, 27], sol: [3, 2, 1, 0, 6, 7, 13, 12, 18, 19, 25, 24, 30, 31, 32, 33, 34, 35, 29, 28, 22, 23, 17, 11, 5, 4, 10, 16, 15, 21, 20, 14] },
    { w: 6, h: 6, walls: [8, 9, 14, 15, 20, 21, 26, 27], sol: [35, 34, 33, 32, 31, 30, 24, 25, 19, 18, 12, 13, 7, 6, 0, 1, 2, 3, 4, 5, 11, 10, 16, 17, 23, 22, 28, 29] },
    { w: 6, h: 6, walls: [2, 3, 8, 9, 26, 27, 32, 33], sol: [34, 35, 29, 28, 22, 23, 17, 11, 5, 4, 10, 16, 15, 21, 20, 14, 13, 19, 25, 31, 30, 24, 18, 12, 6, 0, 1, 7] },
].map((L) => ({ ...L, start: L.sol[0], end: L.sol[L.sol.length - 1], free: L.sol.length }));

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CS = 60;

/* ---------- pure helpers ---------- */
const adjacent = (a, b, w) =>
    Math.abs((a % w) - (b % w)) + Math.abs(((a / w) | 0) - ((b / w) | 0)) === 1;

function canExtend(p, i, L, ws) {
    if (!p.length) return i === L.start;
    if (i < 0 || i >= L.w * L.h) return false;
    if (ws.has(i) || p.indexOf(i) >= 0) return false;
    if (!adjacent(p[p.length - 1], i, L.w)) return false;
    if (i === L.end && p.length + 1 !== L.free) return false; // E hanya terbuka terakhir
    return true;
}

const isComplete = (p, L) =>
    p.length === L.free && p[0] === L.start && p[p.length - 1] === L.end;

/* DFS completion dari prefix apa pun (dipakai cheat hint / auto-finish), dengan
   pruning dead-cell + konektivitas. Deterministik, bukan generator level. */
function completion(prefix, L, ws) {
    const w = L.w, h = L.h, size = w * h, free = L.free;
    if (!prefix.length) return L.sol.slice();
    if (prefix.length >= free)
        return prefix[prefix.length - 1] === L.end ? prefix.slice() : null;
    const nb = new Array(size);
    for (let i = 0; i < size; i++) {
        if (ws.has(i)) { nb[i] = []; continue; }
        const x = i % w, y = (i / w) | 0, a = [];
        for (const [dx, dy] of DIRS) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
                const j = ny * w + nx;
                if (!ws.has(j)) a.push(j);
            }
        }
        nb[i] = a;
    }
    const seen = new Uint8Array(size);
    for (const i of prefix) seen[i] = 1;
    const path = prefix.slice();
    let steps = 0;
    const dfs = (cur) => {
        if (path.length === free) return cur === L.end;
        if (++steps > 50000) return false;
        const rem = [];
        for (let i = 0; i < size; i++) if (!ws.has(i) && !seen[i]) rem.push(i);
        const cand = [];
        for (const j of nb[cur])
            if (!seen[j] && (j !== L.end || path.length + 1 === free)) cand.push(j);
        if (!cand.length) return false;
        const candSet = new Set(cand);
        const deg = new Map();
        let ones = 0;
        for (const i of rem) {
            let d = 0;
            for (const k of nb[i]) if (!seen[k]) d++;
            deg.set(i, d);
            if (d === 0) { if (!(rem.length === 1 && candSet.has(i))) return false; }
            else if (d === 1 && !candSet.has(i) && ++ones > 1) return false;
        }
        const avail = new Set(rem); avail.add(cur);
        const st = [rem[0]], vis = new Set([rem[0]]);
        while (st.length) {
            const u = st.pop();
            for (const v of nb[u]) if (avail.has(v) && !vis.has(v)) { vis.add(v); st.push(v); }
        }
        for (const i of rem) if (!vis.has(i)) return false;
        cand.sort((a, b) => deg.get(a) - deg.get(b));
        for (const j of cand) {
            seen[j] = 1; path.push(j);
            if (dfs(j)) return true;
            path.pop(); seen[j] = 0;
        }
        return false;
    };
    return dfs(prefix[prefix.length - 1]) ? path.slice() : null;
}

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;
    const subs = [];

    /* ---------- first-run internal help (internal modal) ---------- */
    let helpOpen = false;
    try {
        if (localStorage.getItem("block-fill-help-seen") !== "1") {
            helpOpen = true;
            localStorage.setItem("block-fill-help-seen", "1");
        }
    } catch (_) { /* storage blocked */ }

    /* ---------- scoped styles + shell ---------- */
    root.innerHTML = `
<style>
.bf-app{--ink:#0f172a;--sub:#64748b;--line:#e2e8f0;--accent:#6366f1;--accent-soft:#eef2ff;--foe:#f59e0b;--start:#10b981;--end:#f43f5e;color:var(--ink);font-family:inherit}
.bf-app [hidden]{display:none!important}
.bf-app *,.bf-app *::before,.bf-app *::after{box-sizing:border-box}
.bf-app :where(svg,canvas,img){max-width:100%;height:auto}
.bf-app :where(button,[role="button"],select,input){touch-action:manipulation}
.bf-app :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bf-app .bf-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--sub)}
.bf-app .bf-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;white-space:nowrap}
.bf-app .bf-chip b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.bf-app .bf-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.bf-app .bf-dot-you{background:var(--accent)}
.bf-app .bf-dot-foe{background:var(--foe)}
.bf-app .bf-spacer{flex:1 1 auto}
.bf-app .bf-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:8px 14px;font-size:13px;cursor:pointer;font-family:inherit}
.bf-app .bf-btn.bf-primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.bf-app .bf-btn:disabled{opacity:.45;cursor:default}
.bf-app .bf-icon-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.04em}
.bf-app .bf-icon-btn svg{flex:none;display:block}
.bf-app .bf-icon-btn.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.bf-app .bf-panel{position:relative;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.bf-app.game-fill > .bf-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.bf-app .bf-boards{display:flex;flex:1 1 auto;min-height:0;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap}
.bf-app .bf-main{flex:0 1 420px;width:100%;max-width:420px;min-width:200px}
.bf-app svg.bf-svg{width:100%;height:auto;display:block;touch-action:none;transition:opacity .2s}
.bf-app svg.bf-svg.bf-wait{opacity:.55}
.bf-app .bf-side{display:flex;flex-direction:column;align-items:center;gap:8px;width:132px}
.bf-app .bf-side-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}
.bf-app .bf-mini{width:120px;pointer-events:none}
.bf-app .bf-turnpill{font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--line);color:var(--sub);background:#f8fafc;text-align:center}
.bf-app .bf-turnpill.bf-mine{background:var(--accent-soft);color:var(--accent);border-color:transparent;font-weight:600}
.bf-app .bf-cell{fill:#f8fafc;stroke:#e2e8f0;stroke-width:1;transition:fill .12s}
.bf-app .bf-main .bf-cell:not(.bf-on):not(.bf-wall):hover{fill:#eef2ff}
.bf-app .bf-cell.bf-s{fill:#ecfdf5}
.bf-app .bf-cell.bf-e{fill:#fff1f2}
.bf-app .bf-cell.bf-wall{fill:#e2e8f0;stroke:#dbe3ec}
.bf-app .bf-cell.bf-on{fill:#eef2ff}
.bf-app .bf-x{stroke:#94a3b8;stroke-width:3;stroke-linecap:round;opacity:.55;fill:none}
.bf-app .bf-line{fill:none;stroke:var(--accent);stroke-width:10;stroke-linecap:round;stroke-linejoin:round;opacity:.95;pointer-events:none}
.bf-app .bf-mini .bf-line{stroke:var(--foe);stroke-width:12}
.bf-app .bf-ghost{fill:none;stroke:#c7d2fe;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:2 9;pointer-events:none}
.bf-app .bf-head{fill:#fff;stroke:var(--accent);stroke-width:3;pointer-events:none}
.bf-app .bf-mini .bf-head{stroke:var(--foe)}
.bf-app .bf-ico-s{fill:var(--start)}
.bf-app .bf-ico-e{fill:var(--end)}
.bf-app .bf-ico-glyph{fill:#fff;pointer-events:none}
.bf-app .bf-ico-pole{stroke:#fff;stroke-width:2.6;stroke-linecap:round;fill:none;pointer-events:none}
.bf-app .bf-pad{display:none;grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px);gap:6px;justify-content:center;margin-top:10px}
.bf-app .bf-pad button{border:1px solid var(--line);background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--ink);cursor:pointer}
.bf-app .bf-pad button:active{background:var(--accent-soft)}
.bf-app .bf-pad button:disabled{opacity:.4}
.bf-app .bf-pad [data-pad="up"]{grid-area:1/2}
.bf-app .bf-pad [data-pad="left"]{grid-area:2/1}
.bf-app .bf-pad [data-pad="undo"]{grid-area:2/2}
.bf-app .bf-pad [data-pad="right"]{grid-area:2/3}
.bf-app .bf-pad [data-pad="down"]{grid-area:3/2}
@media (pointer:coarse){.bf-app .bf-pad{display:grid}}
.bf-app .bf-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font-size:12px;padding:6px 14px;border-radius:999px;pointer-events:none;z-index:5;white-space:nowrap}
.bf-app .bf-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(248,250,252,.9);backdrop-filter:blur(3px)}
.bf-app .bf-card{width:min(420px,100%);max-height:100%;overflow:hidden;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center;box-shadow:0 4px 12px rgba(15,23,42,.08)}
.bf-app .bf-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:10px}
.bf-app .bf-head h3{margin:0;font-size:16px}
.bf-app .bf-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px}
.bf-app .bf-note{font-size:11px;color:var(--sub)}
.bf-app .bf-card p{margin:0 0 12px;font-size:13px;color:var(--sub)}
.bf-app .bf-cheats,.bf-app .bf-help,.bf-app .bf-stats{flex:1 1 auto;min-height:0;overflow:auto}
.bf-app .bf-cheats{display:grid;gap:6px}
.bf-app .bf-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
.bf-app .bf-help b{display:block;margin-bottom:6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}
.bf-app .bf-help ul{margin:0 0 12px;padding-left:16px;font-size:12px;line-height:1.7;color:var(--sub)}
.bf-app .bf-help kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:#f8fafc;color:var(--ink);font:inherit}
.bf-app .bf-card-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.bf-app .bf-cheatrow{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:0;text-align:left}
.bf-app .bf-cheatrow span{color:var(--sub);font-size:12px}
.bf-app .bf-cheatrow.bf-active{border-color:var(--accent);color:var(--accent)}
.bf-app .bf-cheatrow.bf-active span{color:var(--accent)}
@media (max-width:560px){.bf-app .bf-side{flex-direction:row;width:100%;justify-content:center}.bf-app .bf-mini{width:88px}}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.bf-app{min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.bf-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.bf-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.bf-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.bf-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (prefers-reduced-motion:reduce){.bf-app *,.bf-app *::before,.bf-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
@media (pointer:coarse){.bf-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}}

/* --- fill height + mobile refinements (LAST: beat pointer:coarse 44px) --- */
@media (max-width:640px){
.bf-app.game-fill > .bf-panel[data-board]:not(:has(.bf-overlay:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.bf-app.game-fill > .bf-panel[data-board]:has(.bf-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.bf-app .bf-hud{gap:5px}
.bf-app .bf-hud .bf-chip{padding:4px 6px;font-size:9px}
.bf-app .bf-hud .bf-chip[data-hud-status]{display:none}
.bf-app .bf-hud .bf-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.bf-app .bf-hud .bf-btn-label,.bf-app .bf-hud .bf-spacer{display:none}
.bf-app .bf-overlay{padding:8px}
.bf-app .bf-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.bf-app .bf-cheats,.bf-app .bf-help,.bf-app .bf-stats{scrollbar-width:none}
.bf-app .bf-cheats::-webkit-scrollbar,.bf-app .bf-help::-webkit-scrollbar,.bf-app .bf-stats::-webkit-scrollbar{display:none}
}
</style>
<div class="game-app bf-app game-fill" data-bf>
  <div class="bf-hud">
    <span class="bf-chip">LV <b data-hud-level>1</b></span>
    <span class="bf-chip" title="${playerName}"><i class="bf-dot bf-dot-you"></i>You <b data-hud-you>0/0</b></span>
    <span class="bf-chip"><i class="bf-dot bf-dot-foe"></i><span data-foe-name>Bot</span> <b data-hud-foe>0/0</b></span>
    <span class="bf-chip" data-hud-status>Ready</span>
    <span class="bf-chip">TIME <b data-hud-time>0:00</b></span>
    <span class="bf-spacer"></span>
    <button class="bf-btn bf-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bf-btn-label">Help</span></button>
    <button class="bf-btn bf-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bf-btn-label">Cheats</span></button>
    <button class="bf-btn bf-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bf-btn-label">Pause</span></button>
    <button class="bf-btn bf-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bf-btn-label">Restart</span></button>
    <button class="bf-btn bf-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bf-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel bf-panel" data-board>
    <div class="bf-boards" data-boards>
      <div class="bf-main"><svg class="bf-svg" data-svg-main role="img" aria-label="Block Fill board"></svg></div>
      <div class="bf-side">
        <span class="bf-side-label" data-side-label>Bot</span>
        <svg class="bf-svg bf-mini" data-svg-mini aria-hidden="true"></svg>
        <div class="bf-turnpill" data-turnpill>—</div>
      </div>
    </div>
    <div class="bf-toast" data-toast hidden></div>
    <div class="bf-overlay" data-win hidden>
      <div class="bf-card">
        <div class="bf-head"><h3 data-win-title>Level clear</h3></div>
        <p data-win-sub></p>
        <div class="bf-foot bf-card-actions">
          <button class="bf-btn bf-primary" type="button" data-next>Next level</button>
          <button class="bf-btn" type="button" data-replay>Replay</button>
        </div>
      </div>
    </div>
    <div class="bf-overlay" data-ov="cheat" hidden>
      <div class="bf-card">
        <div class="bf-head"><h3>Cheats</h3><button class="bf-btn" type="button" data-cheats-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
        <div class="bf-cheats">
          <button class="bf-btn bf-cheatrow" type="button" data-cheat="ghost">Show solution <span data-ch-ghost>Off</span></button>
          <button class="bf-btn bf-cheatrow" type="button" data-cheat="freeze">Freeze bot <span data-ch-freeze>Off</span></button>
          <button class="bf-btn bf-cheatrow" type="button" data-cheat="hint">Play best move</button>
          <button class="bf-btn bf-cheatrow" type="button" data-cheat="solve">Auto-finish level</button>
          <button class="bf-btn bf-cheatrow" type="button" data-cheat="clear">Clear my path</button>
          <button class="bf-btn bf-cheatrow" type="button" data-cheat="skip">Skip level</button>
        </div>
        <div class="bf-foot"><span class="bf-note">Available vs bot only</span><button class="bf-btn bf-primary" type="button" data-cheats-close>Done</button></div>
      </div>
    </div>
    <div class="bf-overlay" data-ov="pause" hidden>
      <div class="bf-card">
        <div class="bf-head"><h3>Paused</h3></div>
        <div class="bf-help"><p>The timer and the bot are frozen while paused.</p></div>
        <div class="bf-foot"><span class="bf-note" data-pause-time></span><button class="bf-btn bf-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="bf-overlay" data-ov="help" hidden>
      <div class="bf-card">
        <div class="bf-head"><h3>How to play</h3><button class="bf-btn" type="button" data-help-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
        <div class="bf-help">
          <div>
            <b>Controls</b>
            <ul>
              <li><kbd>Click / drag</kbd> cells from START to END</li>
              <li><kbd>Arrows</kbd> move · <kbd>Backspace</kbd> undo</li>
              <li><kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>R</kbd> restart</li>
              <li>On mobile, use the D-pad below the board</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Fill every unblocked cell in one continuous stroke.</li>
              <li>Start at the green S and finish at the red E.</li>
              <li>Step only onto adjacent cells; E opens last.</li>
              <li>A coin toss decides who moves first; you alternate one cell per turn.</li>
              <li>First to complete the path wins the level.</li>
            </ul>
            <div class="bf-foot"><span class="bf-note">Press H to reopen this guide</span><button class="bf-btn bf-primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="bf-pad" data-pad>
    <button type="button" data-pad="up" aria-label="Up"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg></button>
    <button type="button" data-pad="left" aria-label="Left"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
    <button type="button" data-pad="undo" aria-label="Undo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>
    <button type="button" data-pad="right" aria-label="Right"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
    <button type="button" data-pad="down" aria-label="Down"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg></button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };
    const svgMain = $("[data-svg-main]");
    const svgMini = $("[data-svg-mini]");
    const elStatus = $("[data-hud-status]");
    const elBoards = $("[data-boards]");
    const elPad = $("[data-pad]");
    const elTurn = $("[data-turnpill]");
    const elToast = $("[data-toast]");
    const elWin = $("[data-win]");
    const elCheats = $("[data-ov='cheat']");
    const elPause = $("[data-ov='pause']");
    const elHelp = $("[data-ov='help']");
    const elPauseTime = $("[data-pause-time]");
    const hud = {
        level: $("[data-hud-level]"), you: $("[data-hud-you]"),
        foe: $("[data-hud-foe]"), time: $("[data-hud-time]"),
        foeName: $("[data-foe-name]"), sideLabel: $("[data-side-label]"),
        winTitle: $("[data-win-title]"), winSub: $("[data-win-sub]"),
        chGhost: $("[data-ch-ghost]"), chFreeze: $("[data-ch-freeze]"),
    };
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    if (online) cheatsBtn.hidden = true; // cheat hanya untuk mode vs bot

    /* ---------- local (non-synced) flags ---------- */
    let showGhost = false, botFrozen = false;
    let cheatsOpen = false, paused = false, freezeAt = 0;
    let botTimer = null, toastTimer = null;
    let dragging = false, heldCell = -1;
    let boardKey = "", mainBoard = null, miniBoard = null;
    let wsCacheL = null, wsCache = null;
    let lastStamp = null;
    const wsFor = (L) => {
        if (L !== wsCacheL) { wsCacheL = L; wsCache = new Set(L.walls); }
        return wsCache;
    };
    const mySlot = () => (online && state ? (room.isHost ? state.hostSlot : 1 - state.hostSlot) : 0);
    const foeName = () => (online ? "P" + (2 - mySlot()) : "Bot");
    const myPath = () => state.paths[mySlot()];
    const isMyTurn = () => !!state && state.winner == null && state.turn === mySlot();
    const isFrozen = () => paused || helpOpen || cheatsOpen;

    const fmt = (ms) => {
        const s = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    };
    function showToast(msg) {
        elToast.textContent = msg;
        elToast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { elToast.hidden = true; }, 1800);
    }

    /* ---------- board rendering ---------- */
    function buildBoard(svgEl, L) {
        svgEl.setAttribute("viewBox", "0 0 " + L.w * CS + " " + L.h * CS);
        svgEl.innerHTML = "";
        const gC = mk("g", {}, svgEl), gG = mk("g", {}, svgEl),
            gD = mk("g", {}, svgEl), gM = mk("g", {}, svgEl);
        const ws = new Set(L.walls), cells = [];
        const cx = (i) => (i % L.w) * CS + CS / 2;
        const cy = (i) => ((i / L.w) | 0) * CS + CS / 2;
        for (let i = 0; i < L.w * L.h; i++) {
            const x = (i % L.w) * CS, y = ((i / L.w) | 0) * CS;
            let cls = "bf-cell";
            if (ws.has(i)) cls += " bf-wall";
            if (i === L.start) cls += " bf-s";
            if (i === L.end) cls += " bf-e";
            cells.push(mk("rect", { x: x + 3, y: y + 3, width: CS - 6, height: CS - 6, rx: 10, class: cls }, gC));
            if (ws.has(i))
                mk("path", {
                    d: `M${x + 22} ${y + 22}L${x + CS - 22} ${y + CS - 22}M${x + CS - 22} ${y + 22}L${x + 22} ${y + CS - 22}`,
                    class: "bf-x",
                }, gM);
        }
        /* ikon START: lingkaran hijau + glyph play */
        mk("circle", { cx: cx(L.start), cy: cy(L.start), r: 14.5, class: "bf-ico-s" }, gM);
        mk("path", { d: "M-4 -7L8 0L-4 7Z", class: "bf-ico-glyph", transform: `translate(${cx(L.start)} ${cy(L.start)})` }, gM);
        /* ikon END: lingkaran merah + glyph bendera */
        mk("circle", { cx: cx(L.end), cy: cy(L.end), r: 14.5, class: "bf-ico-e" }, gM);
        mk("path", { d: "M-4.5 -8V8", class: "bf-ico-pole", transform: `translate(${cx(L.end)} ${cy(L.end)})` }, gM);
        mk("path", { d: "M-4.5 -8L7.5 -4.8L-4.5 -1.6Z", class: "bf-ico-glyph", transform: `translate(${cx(L.end)} ${cy(L.end)})` }, gM);
        return { cells, gG, gD };
    }

    function paint(board, p, L) {
        const inPath = new Set(p);
        board.cells.forEach((el, i) => el.classList.toggle("bf-on", inPath.has(i)));
        board.gD.innerHTML = "";
        if (!p.length) return;
        const pts = p.map((i) => (i % L.w) * CS + CS / 2 + "," + (((i / L.w) | 0) * CS + CS / 2)).join(" ");
        mk("polyline", { points: pts, class: "bf-line" }, board.gD);
        const last = p[p.length - 1];
        mk("circle", { cx: (last % L.w) * CS + CS / 2, cy: ((last / L.w) | 0) * CS + CS / 2, r: 7.5, class: "bf-head" }, board.gD);
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            elStatus.textContent = "Waiting for host…";
            elBoards.hidden = true;
            elPad.hidden = true;
            elWin.hidden = true;
            elCheats.hidden = true;
            elPause.hidden = true;
            elHelp.hidden = !helpOpen;
            return;
        }
        elBoards.hidden = false;
        elPad.hidden = false;
        const L = state.level, me = mySlot(), foe = 1 - me;
        const key = state.levelNo + ":" + L.w + "x" + L.h + ":" + L.walls.join(",");
        if (key !== boardKey) {
            boardKey = key;
            mainBoard = buildBoard(svgMain, L);
            miniBoard = buildBoard(svgMini, L);
            dragging = false; heldCell = -1;
        }
        /* toast koin + posisi pemain saat level/baru mulai */
        if (state.startedAt !== lastStamp) {
            lastStamp = state.startedAt;
            const first = state.firstMover === me ? "you go first" : (online ? "P" + (state.firstMover + 1) + " goes first" : "bot goes first");
            showToast(online ? "You are P" + (me + 1) + " — " + first : "Coin toss: " + first);
        }
        hud.level.textContent = String(state.levelNo);
        hud.you.textContent = state.paths[me].length + "/" + L.free;
        hud.foe.textContent = state.paths[foe].length + "/" + L.free;
        hud.foeName.textContent = foeName();
        hud.sideLabel.textContent = foeName();
        hud.time.textContent = fmt((state.endedAt || Date.now()) - state.startedAt);
        paint(mainBoard, state.paths[me], L);
        paint(miniBoard, state.paths[foe], L);
        mainBoard.gG.innerHTML = "";
        if (showGhost && !online) {
            const pts = L.sol.map((i) => (i % L.w) * CS + CS / 2 + "," + (((i / L.w) | 0) * CS + CS / 2)).join(" ");
            mk("polyline", { points: pts, class: "bf-ghost" }, mainBoard.gG);
        }
        svgMain.classList.toggle("bf-wait", !isMyTurn());
        /* status + turn pill */
        let status, pill;
        if (state.winner != null) {
            status = pill = state.winner === me ? "You win" : (online ? "P" + (state.winner + 1) + " wins" : "Bot wins");
        } else if (isMyTurn()) { status = pill = "Your turn"; }
        else if (online) { status = pill = "Opponent's turn"; }
        else { status = pill = botFrozen ? "Bot frozen" : "Bot is moving…"; }
        elStatus.textContent = status;
        elTurn.textContent = pill;
        elTurn.classList.toggle("bf-mine", isMyTurn());
        /* overlays: help > pause/cheats > result, mutual suppression */
        const anyOverlay = helpOpen || cheatsOpen || paused;
        elWin.hidden = state.winner == null || anyOverlay;
        if (state.winner != null) {
            hud.winTitle.textContent = state.winner === me ? "You win" : (online ? "Player " + (state.winner + 1) + " wins" : "Bot wins");
            hud.winSub.textContent = "Level " + state.levelNo + " · " + L.free + " cells · " + fmt(state.endedAt - state.startedAt);
        }
        elCheats.hidden = online || !cheatsOpen || helpOpen || paused;
        elPause.hidden = online || !paused || helpOpen || cheatsOpen || state.winner != null;
        elHelp.hidden = !helpOpen;
        hud.chGhost.textContent = showGhost ? "On" : "Off";
        hud.chFreeze.textContent = botFrozen ? "On" : "Off";
        root.querySelector('[data-cheat="ghost"]').classList.toggle("bf-active", showGhost);
        root.querySelector('[data-cheat="freeze"]').classList.toggle("bf-active", botFrozen);
        /* HUD button state: update label span, never button textContent */
        if (cheatsBtn) cheatsBtn.classList.toggle("on", showGhost || botFrozen);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".bf-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
            pauseBtn.disabled = online;
        }
        if (elPauseTime) elPauseTime.textContent = "Elapsed " + hud.time.textContent;
        /* virtual pad */
        elPad.querySelectorAll("[data-pad]").forEach((b) => {
            b.disabled = isFrozen() || !isMyTurn() || (b.dataset.pad === "undo" && !myPath().length);
        });
        /* masih menahan jari saat giliran kembali -> lanjutkan drag */
        if (isMyTurn() && dragging && heldCell >= 0) tryDrag(heldCell);
    }

    /* ---------- state flow (host / local authoritative) ---------- */
    function startLevel(n) {
        const L = LEVELS[(n - 1) % LEVELS.length];
        const first = Math.random() < 0.5 ? 0 : 1; // koin: siapa jalan duluan
        clearTimeout(botTimer); botTimer = null;
        if (freezeAt) freezeAt = Date.now(); // level baru: anchor freeze di-reset
        state = {
            levelNo: n,
            level: { w: L.w, h: L.h, walls: L.walls.slice(), sol: L.sol.slice(), start: L.start, end: L.end, free: L.free },
            paths: [[], []],
            turn: first,
            firstMover: first,
            winner: null,
            hostSlot: state ? state.hostSlot : (online ? (Math.random() < 0.5 ? 0 : 1) : 0), // slot acak khusus multiplayer
            startedAt: Date.now(),
            endedAt: null,
        };
        publish();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    function applyAction(a, actor) {
        if (destroyed || !state || !a || (actor !== 0 && actor !== 1)) return;
        const s = state;
        if (a.t === "next") { if (s.winner != null) startLevel(s.levelNo + 1); return; }
        if (a.t === "restart") { startLevel(s.levelNo); return; }
        if (s.winner != null) return;
        if (a.t === "pass") { // hanya bot (mode ai)
            if (online || actor !== 1 || s.turn !== actor) return;
            s.turn = 1 - s.turn; publish(); return;
        }
        if (s.turn !== actor) return;
        const L = s.level, ws = wsFor(L), p = s.paths[actor];
        if (a.t === "cell") {
            const i = a.i | 0;
            if (!canExtend(p, i, L, ws)) return;
            p.push(i);
        } else if (a.t === "undo") {
            if (!p.length) return;
            p.pop();
        } else if (a.t === "rewind") { // klik blok lama = undo beberapa langkah sekaligus
            const k = a.k | 0;
            if (k < 0 || k >= p.length - 1) return;
            s.paths[actor] = p.slice(0, k + 1);
        } else if (a.t === "clear" && !online && actor === 0) {
            s.paths[0] = [];
        } else if (a.t === "solve" && !online && actor === 0) {
            const comp = completion(p, L, ws);
            if (!comp) { showToast("Dead end — undo a few steps"); return; }
            s.paths[0] = comp;
            s.winner = 0; s.endedAt = Date.now();
            publish(); return;
        } else return;
        if (isComplete(s.paths[actor], L)) { s.winner = actor; s.endedAt = Date.now(); }
        else s.turn = 1 - s.turn;
        publish();
    }

    function submitAction(action) {
        if (!state) return;
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, online ? state.hostSlot : 0);
    }

    /* ---------- bot (mode ai) ---------- */
    function scheduleBot() {
        if (isFrozen() || online || destroyed || botTimer || !state) return;
        if (state.winner != null || state.turn !== 1) return;
        botTimer = setTimeout(() => {
            botTimer = null;
            if (destroyed || isFrozen() || !state || state.winner != null || state.turn !== 1) return;
            // bot kadang "ragu" supaya koin tidak menentukan pemenang mutlak
            if (botFrozen || Math.random() < 0.15) applyAction({ t: "pass" }, 1);
            else applyAction({ t: "cell", i: state.level.sol[state.paths[1].length] }, 1);
        }, 480 + Math.random() * 420);
    }

    /* ---------- pause-aware freezing: timer & bot stop, Date.now anchors shift ---------- */
    function syncFreeze() {
        const next = isFrozen();
        if (next === Boolean(freezeAt)) return;
        if (next) {
            freezeAt = Date.now();
            clearTimeout(botTimer); botTimer = null;
            if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; elToast.hidden = true; }
        } else {
            const shift = Date.now() - freezeAt;
            freezeAt = 0;
            if (state && !online) {
                state.startedAt += shift;
                if (state.endedAt) state.endedAt += shift;
            }
            scheduleBot();
        }
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatsOpen = false; paused = false; }
        syncFreeze(); render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) { helpOpen = false; paused = false; }
        syncFreeze(); render();
    }
    function togglePause(on) {
        if (online) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { helpOpen = false; cheatsOpen = false; }
        syncFreeze(); render();
    }
    function restart() {
        if (paused) togglePause(false);
        else if (cheatsOpen) toggleCheats(false);
        else if (helpOpen) toggleHelp(false);
        submitAction({ t: "restart" });
    }

    /* ---------- pointer input (mouse + touch, garis selalu mengikuti urutan klik) ---------- */
    function pointToCell(e) {
        if (!state) return -1;
        const L = state.level, r = svgMain.getBoundingClientRect();
        const vw = L.w * CS, vh = L.h * CS;
        const s = Math.min(r.width / vw, r.height / vh);
        if (!(s > 0)) return -1;
        const x = (e.clientX - r.left - (r.width - vw * s) / 2) / s;
        const y = (e.clientY - r.top - (r.height - vh * s) / 2) / s;
        const col = Math.floor(x / CS), row = Math.floor(y / CS);
        if (col < 0 || row < 0 || col >= L.w || row >= L.h) return -1;
        return row * L.w + col;
    }

    function tryDrag(i) {
        if (isFrozen() || destroyed || !isMyTurn()) return;
        const p = myPath(), L = state.level, ws = wsFor(L);
        if (!p.length) { if (i === L.start) submitAction({ t: "cell", i }); return; }
        const head = p[p.length - 1];
        if (i === head) return;
        if (p.length > 1 && i === p[p.length - 2]) { submitAction({ t: "undo" }); return; }
        if (canExtend(p, i, L, ws)) { submitAction({ t: "cell", i }); return; }
        /* drag cepat melompati sel: jembatan sel per sel sebaris/sekolom,
           satu langkah per giliran; sisanya dilanjutkan saat giliran kembali */
        const hx = head % L.w, hy = (head / L.w) | 0, ix = i % L.w, iy = (i / L.w) | 0;
        if (hx === ix || hy === iy) {
            const j = (hy + Math.sign(iy - hy)) * L.w + (hx + Math.sign(ix - hx));
            if (canExtend(p, j, L, ws)) submitAction({ t: "cell", i: j });
        }
    }

    function onDown(e) {
        if (isFrozen() || !state || state.winner != null) return;
        const i = pointToCell(e);
        if (i < 0) return;
        e.preventDefault();
        try { svgMain.setPointerCapture(e.pointerId); } catch (_) { }
        dragging = true; heldCell = i;
        if (!isMyTurn()) return;
        const p = myPath();
        const k = p.indexOf(i);
        if (k >= 0) { if (k < p.length - 1) submitAction({ t: "rewind", k }); return; }
        tryDrag(i);
    }
    function onMove(e) {
        if (isFrozen() || !dragging) return;
        const i = pointToCell(e);
        if (i < 0 || i === heldCell) return;
        heldCell = i;
        tryDrag(i);
    }
    function onUp() { dragging = false; heldCell = -1; }
    const noCtx = (e) => e.preventDefault();
    svgMain.addEventListener("pointerdown", onDown);
    svgMain.addEventListener("pointermove", onMove);
    svgMain.addEventListener("pointerup", onUp);
    svgMain.addEventListener("pointercancel", onUp);
    svgMain.addEventListener("contextmenu", noCtx);

    /* ---------- keyboard + virtual pad: help > cheats > pause > Escape > game actions ---------- */
    const KEYD = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const PADDIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    function dirMove(d) {
        if (isFrozen() || !isMyTurn()) return;
        const p = myPath(), L = state.level;
        if (!p.length) { submitAction({ t: "cell", i: L.start }); return; }
        const head = p[p.length - 1];
        const nx = (head % L.w) + d[0], ny = ((head / L.w) | 0) + d[1];
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) return;
        const i = ny * L.w + nx;
        if (p.length > 1 && i === p[p.length - 2]) submitAction({ t: "undo" });
        else if (canExtend(p, i, L, wsFor(L))) submitAction({ t: "cell", i });
    }
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const code = e.code;
        const k = e.key.toLowerCase();
        /* 1. help */
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (helpOpen) {
            if (code === "Escape" || code === "Enter" || code === "KeyP") { toggleHelp(false); e.preventDefault(); }
            return;
        }
        /* 2. cheats */
        if (code === "KeyC") { if (!online) toggleCheats(); e.preventDefault(); return; }
        if (cheatsOpen) {
            if (code === "Escape" || code === "Enter" || code === "KeyP") { toggleCheats(false); e.preventDefault(); }
            return;
        }
        /* 3. pause */
        if (code === "KeyP") { if (!online) togglePause(); e.preventDefault(); return; }
        if (code === "Escape") { if (paused) togglePause(false); e.preventDefault(); return; }
        /* 4. game actions */
        if (code === "KeyR" && state) { e.preventDefault(); restart(); return; }
        if (!state || isFrozen()) return;
        if (state.winner != null) {
            if (e.key === "Enter" || k === "n") { e.preventDefault(); submitAction({ t: "next" }); }
            else if (k === "r") { e.preventDefault(); restart(); }
            return;
        }
        if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); submitAction({ t: "undo" }); return; }
        const d = KEYD[e.key];
        if (d) { e.preventDefault(); dirMove(d); }
    }
    document.addEventListener("keydown", onKey);

    /* ---------- cheats (hanya mode vs bot) ---------- */
    function doCheat(name) {
        if (online || !state) return;
        if (name === "ghost") { showGhost = !showGhost; render(); return; }
        if (name === "freeze") { botFrozen = !botFrozen; render(); return; }
        if (name === "skip") { startLevel(state.levelNo + 1); return; }
        if (!isMyTurn()) { showToast("Wait for your turn"); return; }
        if (name === "clear") { submitAction({ t: "clear" }); return; }
        if (name === "solve") { submitAction({ t: "solve" }); return; }
        if (name === "hint") {
            const comp = completion(myPath(), state.level, wsFor(state.level));
            if (!comp) { showToast("Dead end — undo a few steps"); return; }
            submitAction({ t: "cell", i: comp[myPath().length] });
        }
    }

    /* ---------- click delegation ---------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]") || t.closest("[data-replay]")) { restart(); return; }
        if (t.closest("[data-next]")) { submitAction({ t: "next" }); return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { doCheat(ch.getAttribute("data-cheat")); return; }
        const pad = t.closest("[data-pad]");
        if (pad) {
            const p = pad.getAttribute("data-pad");
            p === "undo" ? submitAction({ t: "undo" }) : dirMove(PADDIR[p]);
        }
    }
    root.addEventListener("click", handleClick);

    /* ---------- timer display (frozen while a modal is open) ---------- */
    const tick = setInterval(() => {
        if (!state || destroyed || isFrozen()) return;
        hud.time.textContent = fmt((state.endedAt || Date.now()) - state.startedAt);
    }, 500);

    /* ---------- init: online (host/guest) vs bot ---------- */
    if (online) {
        const s1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof s1 === "function") subs.push(s1);
        if (room.isHost) {
            startLevel(1); // hostSlot + firstMover diacak di dalam startLevel
            const s2 = room.onAction((action) => applyAction(action, 1 - state.hostSlot));
            if (typeof s2 === "function") subs.push(s2);
        } else {
            const s3 = room.onState((nextState) => { state = nextState; render(); });
            if (typeof s3 === "function") subs.push(s3);
        }
    } else {
        startLevel(1);
    }
    syncFreeze();
    render();

    return {
        destroy() {
            destroyed = true;
            clearInterval(tick);
            clearTimeout(botTimer);
            clearTimeout(toastTimer);
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            svgMain.removeEventListener("pointerdown", onDown);
            svgMain.removeEventListener("pointermove", onMove);
            svgMain.removeEventListener("pointerup", onUp);
            svgMain.removeEventListener("pointercancel", onUp);
            svgMain.removeEventListener("contextmenu", noCtx);
            subs.forEach((fn) => { try { fn(); } catch (_) { } });
        },
    };
}
