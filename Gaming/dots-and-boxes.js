/* ==== GAME: dots-and-boxes.js ==== */
/* Dots and Boxes — 4x4 boxes. You vs bot (mode "ai") or online (mode "room").
   Minimalist UI, no tutorial text in the board area, no level generator
   (always a fresh, completable empty board). A point counts ONLY when the 4th
   side of a box is drawn; the closer keeps the turn. Random starter every
   round; random seat/color mapping in multiplayer (stored in state.swap so
   both clients agree). Cheats are AI-mode only. Controls: hover/tap edges,
   arrows/WASD + Enter/Space, H help, C cheats, P pause, R restart, U undo,
   Esc close; virtual D-pad appears automatically on touch devices. Layout:
   single HUD bar + fill-height board + internal How-to-play modal. */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "dots-and-boxes", // harus sama dengan nama file (tanpa .js)
    name: "Dots and Boxes",
    category: "board",
    catLabel: "Board",
    desc: "Draw lines and close boxes to outscore your rival on a 4x4 grid.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M10 10h28M10 10v28M38 10v28M10 38h28"/><rect x="13" y="13" width="18" height="18" rx="3" fill="currentColor" fill-opacity=".25" stroke="none"/><circle cx="10" cy="10" r="3" fill="currentColor" stroke="none"/><circle cx="38" cy="10" r="3" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="3" fill="currentColor" stroke="none"/><circle cx="10" cy="38" r="3" fill="currentColor" stroke="none"/><circle cx="38" cy="38" r="3" fill="currentColor" stroke="none"/></svg>',
    bg: ["#e0e7ff", "#818cf8"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;

    /* ---------- board constants & pure helpers ---------- */
    const NB = 4, GAP = 72, PAD = 36;
    const COL = { 1: "#6366f1", 2: "#f43f5e" }; // seat 1 = indigo, seat 2 = rose
    const NAME = { 1: "indigo", 2: "rose" };
    const dx = (c) => PAD + GAP * c;
    const dy = (r) => PAD + GAP * r;
    const eKey = (t, r, c) => `${t}-${r}-${c}`;
    const KEYS = [];
    for (let r = 0; r <= NB; r++) for (let c = 0; c < NB; c++) KEYS.push(eKey("h", r, c));
    for (let r = 0; r < NB; r++) for (let c = 0; c <= NB; c++) KEYS.push(eKey("v", r, c));
    const parse = (k) => { const [t, r, c] = k.split("-"); return { t, r: +r, c: +c }; };
    const ends = (k) => { const { t, r, c } = parse(k); return { x1: dx(c), y1: dy(r), x2: dx(c) + (t === "h" ? GAP : 0), y2: dy(r) + (t === "v" ? GAP : 0) }; };
    const mid = (k) => { const { t, r, c } = parse(k); return { x: dx(c) + (t === "h" ? GAP / 2 : 0), y: dy(r) + (t === "v" ? GAP / 2 : 0) }; };
    const boxEdges = (r, c) => [eKey("h", r, c), eKey("h", r + 1, c), eKey("v", r, c), eKey("v", r, c + 1)];
    const adjBoxes = (k) => {
        const { t, r, c } = parse(k); const out = [];
        if (t === "h") { if (r > 0) out.push([r - 1, c]); if (r < NB) out.push([r, c]); }
        else { if (c > 0) out.push([r, c - 1]); if (c < NB) out.push([r, c]); }
        return out;
    };

    /* ---------- local state ---------- */
    let state = null;          // canonical, serializable (host-owned when online)
    let history = [];          // undo snapshots (AI mode only)
    let destroyed = false;
    let cursor = KEYS[0], hoverKey = null, hintKey = null;
    let cheatOpen = false, dumbBot = false, showCounts = false, flashMsg = "";
    let helpOpen = false, paused = false;
    let pauseStart = 0, pauseOffset = 0;
    const nowMs = () => Date.now() - pauseOffset;

    /* First-run internal guide, shown once per install. */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("dotsAndBoxesHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("dotsAndBoxesHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* Pause-aware timers: due anchors use the shifted clock, and only the
       remaining delay is replayed on resume so flashes / bot moves never
       jump ahead after a pause. */
    const timers = new Map();
    let deferredTimers = [];
    function later(key, fn, ms) {
        clearTimer(key);
        if (paused || destroyed) {
            if (paused && !destroyed) deferredTimers.push({ key, fn, wait: Math.max(0, ms) });
            return;
        }
        const id = setTimeout(() => {
            timers.delete(key);
            if (!destroyed && !paused) fn();
        }, ms);
        timers.set(key, { id, due: nowMs() + ms, fn });
    }
    function clearTimer(key) {
        const rec = timers.get(key);
        if (rec) { clearTimeout(rec.id); timers.delete(key); }
        deferredTimers = deferredTimers.filter((t) => t.key !== key);
    }
    function clearTimers() {
        for (const rec of timers.values()) clearTimeout(rec.id);
        timers.clear();
        deferredTimers = [];
    }
    function pauseTimers() {
        const now = nowMs();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferredTimers.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function resumeTimers() {
        const queue = deferredTimers;
        deferredTimers = [];
        for (const t of queue) later(t.key, t.fn, t.wait);
    }

    const sideCount = (r, c) => boxEdges(r, c).reduce((n, k) => n + (state.edges[k] ? 1 : 0), 0);
    const gainOf = (k) => adjBoxes(k).reduce((n, [r, c]) => n + (!state.boxes[r * NB + c] && sideCount(r, c) === 3 ? 1 : 0), 0);
    const givesThird = (k) => adjBoxes(k).some(([r, c]) => !state.boxes[r * NB + c] && sideCount(r, c) === 2);
    const freeKeys = () => KEYS.filter((k) => !state.edges[k]);

    function freshState() {
        const edges = {}; KEYS.forEach((k) => (edges[k] = 0));
        return {
            edges, boxes: Array(NB * NB).fill(0), scores: [0, 0], claimed: 0,
            turn: Math.random() < 0.5 ? 1 : 2,            // random starter (bot & online)
            swap: online ? Math.random() < 0.5 : false,   // random seat mapping (online)
            over: false, last: null,
        };
    }
    function normalize(s) { // defensive against DB serialization quirks
        const edges = {}; KEYS.forEach((k) => (edges[k] = Number(s?.edges?.[k]) || 0));
        return {
            edges,
            boxes: Array.from({ length: NB * NB }, (_, i) => Number(s?.boxes?.[i]) || 0),
            scores: [Number(s?.scores?.[0]) || 0, Number(s?.scores?.[1]) || 0],
            claimed: Number(s?.claimed) || 0,
            turn: Number(s?.turn) === 2 ? 2 : 1,
            swap: Boolean(s?.swap), over: Boolean(s?.over),
            last: typeof s?.last === "string" ? s.last : null,
        };
    }
    const hostSeat = () => (state && state.swap ? 2 : 1);
    const mySeat = () => (online ? (state ? (room.isHost ? hostSeat() : 3 - hostSeat()) : 1) : 1);
    const oppSeat = () => 3 - mySeat();
    const myTurn = () => Boolean(state) && !state.over && state.turn === mySeat();
    const canPlay = () => myTurn() && !paused && !helpOpen && !cheatOpen;

    /* ---------- markup (built once, updated by render) ---------- */
    const parts = { boxes: "", counts: "", guides: "", lines: "", dots: "", hits: "" };
    for (let r = 0; r < NB; r++) for (let c = 0; c < NB; c++) {
        const i = r * NB + c;
        parts.boxes += `<rect data-box="${i}" x="${dx(c) + 7}" y="${dy(r) + 7}" width="${GAP - 14}" height="${GAP - 14}" rx="10" fill="#fff" fill-opacity="0"/>`;
        parts.counts += `<text data-count="${i}" x="${dx(c) + GAP / 2}" y="${dy(r) + GAP / 2 + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="#94a3b8" opacity="0"></text>`;
    }
    KEYS.forEach((k) => {
        const { x1, y1, x2, y2 } = ends(k);
        const geo = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
        parts.guides += `<line ${geo} stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>`;
        parts.lines += `<line data-line="${k}" ${geo} stroke="transparent" stroke-width="5" stroke-linecap="round" opacity="0"/>`;
        parts.hits += `<line data-hit="${k}" class="dab-hit" ${geo} stroke="#000" stroke-opacity="0" stroke-width="26" stroke-linecap="round" style="pointer-events:stroke"/>`;
    });
    for (let r = 0; r <= NB; r++) for (let c = 0; c <= NB; c++)
        parts.dots += `<circle cx="${dx(c)}" cy="${dy(r)}" r="5.5" fill="#64748b"/>`;

    root.innerHTML = `
<style>
/* Dots & Boxes — light paper UI, single HUD bar, fill-height square board. */
.dab{--ink:#0f172a;--mut:#64748b;--hair:#e2e8f0;--acc:#4338ca;color:var(--ink);width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:10px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.dab *{box-sizing:border-box}
.dab [hidden]{display:none!important}
.dab :is(button,select,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.dab-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.01em}
.dab-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;min-height:28px;border:1px solid var(--hair);border-radius:999px;background:#fff;white-space:nowrap;color:var(--mut)}
.dab-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.dab-cdot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;flex:none}
.dab-spacer{flex:1 1 auto;min-width:6px}
.dab-btn{appearance:none;border:1px solid var(--hair);background:#fff;color:var(--ink);border-radius:9px;padding:7px 10px;min-height:32px;font:inherit;font-size:11px;font-weight:550;cursor:pointer;transition:background .12s,border-color .12s}
.dab-btn:hover:not(:disabled){background:#f8fafc;border-color:#cbd5e1}
.dab-btn:disabled{opacity:.45;cursor:default}
.dab-btn.on{border-color:var(--acc);color:var(--acc)}
.dab-btn.primary,.dab-primary{background:var(--ink);border-color:var(--ink);color:#fff}
.dab-btn.primary:hover:not(:disabled),.dab-primary:hover:not(:disabled){background:#1e293b}
.dab-btn[aria-pressed="true"]{background:#eef2ff;border-color:#c7d2fe;color:var(--acc)}
.dab-icon-btn{display:inline-flex;align-items:center;gap:6px}
.dab-icon-btn svg{flex:none;display:block}
.dab-btn-label{white-space:nowrap}
.dab.game-fill>.dab-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:0;border:1px solid var(--hair);border-radius:12px;overflow:hidden;background:#fff}
.dab-svg{display:block;width:100%;height:100%;max-width:none;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.dab-hit{cursor:pointer}
.dab-pulse{animation:dab-pulse 1s ease-in-out infinite}
@keyframes dab-pulse{50%{opacity:.25}}
.dab-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.86);backdrop-filter:blur(3px);border-radius:12px;z-index:5;padding:12px}
.dab-ov[hidden]{display:none!important}
.dab-card{width:min(380px,100%);max-height:100%;overflow:hidden;background:#fff;border:1px solid var(--hair);border-radius:14px;padding:16px 18px;color:var(--ink);display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
.dab-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}
.dab-head h3{margin:0;font-size:16px;font-weight:650}
.dab-x{min-width:36px;min-height:36px;background:none;border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.6;padding:2px 6px}
.dab-x:hover{opacity:1}
.dab-stats,.dab-cheats,.dab-help{flex:1 1 auto;min-height:0;overflow:auto}
.dab-stats p{margin:0;font-size:13px;color:var(--mut)}
.dab-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.dab-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--mut);text-transform:uppercase}
.dab-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6}
.dab-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--hair);border-bottom-width:2px;border-radius:5px;font:600 10px/1.4 ui-monospace,monospace}
.dab-cheats{display:flex;flex-direction:column;gap:2px}
.dab-cheats .dab-btn{text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px}
.dab-cheats .dab-btn span{color:var(--mut);font-size:.72rem}
.dab-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.dab-note{font-size:11px;color:var(--mut)}
.dab-primary{padding:9px 14px;min-height:40px;font:inherit;font-size:13px;cursor:pointer}
.dab-result-card{align-items:center;text-align:center}
.dab-pad{flex:none;display:none;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,44px);gap:6px;justify-content:center;padding-bottom:2px}
.dab-pad .dab-btn{padding:0;font-size:1rem;border-radius:12px;min-height:44px}
@media (hover:none) and (pointer:coarse){.dab-pad{display:grid}}
@media (pointer:coarse){
  .dab-btn{min-height:44px}
  .dab-chip{min-height:44px;padding:8px 12px}
}
@media (prefers-reduced-motion:reduce){.dab *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
  .dab.game-fill>.dab-panel:not(:has(.dab-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
  .dab.game-fill>.dab-panel:has(.dab-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .dab{gap:6px}
  .dab .dab-hud{gap:5px}
  .dab .dab-hud .dab-chip{padding:4px 6px;font-size:9px;min-height:0}
  .dab .dab-hud .dab-chip[data-mode]{display:none}
  .dab .dab-hud [data-status]{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
  .dab .dab-hud .dab-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .dab .dab-hud .dab-btn-label,.dab .dab-hud .dab-spacer{display:none}
  .dab-ov{padding:8px}
  .dab-card{width:100%;height:100%;max-height:100%;padding:12px}
  .dab-help{grid-template-columns:1fr;gap:8px}
  .dab-stats,.dab-cheats,.dab-help{scrollbar-width:none}
  .dab-stats::-webkit-scrollbar,.dab-cheats::-webkit-scrollbar,.dab-help::-webkit-scrollbar{display:none}
  .dab-foot{padding-top:8px;border-top:1px solid var(--hair)}
  .dab-note{display:none}
}
@media (pointer:coarse){
  .dab .dab-hud .dab-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .dab .dab-card .dab-primary,.dab .dab-card .dab-x{min-height:44px}
}
</style>
<div class="game-app dab game-fill" data-dab>
  <div class="dab-hud">
    <span class="dab-chip"><i class="dab-cdot" data-turn-dot></i><b data-turn>—</b></span>
    <span class="dab-chip"><span data-status>Ready</span></span>
    <span class="dab-chip"><i class="dab-cdot" data-you-dot></i>You <b data-you>0</b></span>
    <span class="dab-chip"><i class="dab-cdot" data-opp-dot></i><span data-opp-name>Bot</span> <b data-opp>0</b></span>
    <span class="dab-chip">Left <b data-left>16</b></span>
    <span class="dab-chip" data-mode>Solo</span>
    <span class="dab-spacer"></span>
    <button class="dab-btn dab-icon-btn" type="button" data-hint aria-label="Best move hint" title="Best move hint" ${online ? "hidden" : ""}>${iconSVG("lightbulb", { size: 14 })}<span class="dab-btn-label">Hint</span></button>
    <button class="dab-btn dab-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="dab-btn-label">Help</span></button>
    <button class="dab-btn dab-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)" ${online ? "hidden" : ""}>${iconSVG("wrench", { size: 14 })}<span class="dab-btn-label">Cheats</span></button>
    <button class="dab-btn dab-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)" ${online ? "disabled" : ""}>${iconSVG("pause", { size: 14 })}<span class="dab-btn-label">Pause</span></button>
    <button class="dab-btn dab-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="dab-btn-label">Restart</span></button>
    <button class="dab-btn dab-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="dab-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel dab-panel" data-board>
    <svg class="dab-svg" viewBox="0 0 360 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Dots and Boxes board">
      <g>${parts.boxes}</g><g>${parts.counts}</g><g>${parts.guides}</g><g>${parts.lines}</g>
      <line data-cursor stroke="#6366f1" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 11" opacity="0"/>
      <g>${parts.dots}</g><g>${parts.hits}</g>
    </svg>
    <div class="dab-ov" data-ov="result" hidden>
      <div class="dab-card dab-result-card">
        <div class="dab-head"><h3 data-result-title>Draw</h3></div>
        <div class="dab-stats"><p data-result-score>0 – 0</p></div>
        <div class="dab-foot"><span class="dab-note">Press R for a new round</span><button class="dab-btn dab-primary" type="button" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="dab-ov" data-ov="cheat" hidden>
      <div class="dab-card">
        <div class="dab-head"><h3>Cheats</h3><button class="dab-x" type="button" data-cheats-close aria-label="Close">&times;</button></div>
        <div class="dab-cheats">
          <button class="dab-btn" type="button" data-cheat="hint">Best move <span>HUD Hint</span></button>
          <button class="dab-btn" type="button" data-cheat="claim">Auto-claim boxes</button>
          <button class="dab-btn" type="button" data-cheat="undo">Undo move <span>U</span></button>
          <button class="dab-btn" type="button" data-cheat="skip">Skip bot turn</button>
          <button class="dab-btn" type="button" data-cheat="dumb" aria-pressed="false">Random bot</button>
          <button class="dab-btn" type="button" data-cheat="counts" aria-pressed="false">Show side counts</button>
        </div>
        <div class="dab-foot"><span class="dab-note">AI mode only</span></div>
      </div>
    </div>
    <div class="dab-ov" data-ov="pause" hidden>
      <div class="dab-card">
        <div class="dab-head"><h3>Paused</h3></div>
        <div class="dab-stats"><p>The board, bot and timers are frozen.</p></div>
        <div class="dab-foot"><span class="dab-note">Press P or Esc to resume</span><button class="dab-btn dab-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="dab-ov" data-ov="help" hidden>
      <div class="dab-card">
        <div class="dab-head"><h3>How to play</h3><button class="dab-x" type="button" data-help-close aria-label="Close">&times;</button></div>
        <div class="dab-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click an edge between two dots to draw a line.</li>
              <li><span class="dab-kbd">← ↑ → ↓</span> / <span class="dab-kbd">WASD</span> aim, <span class="dab-kbd">Enter</span> / <span class="dab-kbd">Space</span> draw.</li>
              <li><span class="dab-kbd">H</span> help · <span class="dab-kbd">C</span> cheats · <span class="dab-kbd">P</span> pause · <span class="dab-kbd">R</span> restart · <span class="dab-kbd">U</span> undo · <span class="dab-kbd">Esc</span> close</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap an edge to draw; the D-pad below the board aims and OK draws.</li>
              <li>Use the HUD buttons for Hint, Help, Cheats, Pause, Restart and Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>The 4×4 grid has 16 boxes. Draw a box's 4th side to claim it.</li>
              <li>Claiming a box scores a point and grants another turn; otherwise the turn passes.</li>
              <li>Most boxes wins. Who starts is random; in Room mode your colour is random too.</li>
              <li>Turn, status, scores, boxes left and mode live in the HUD bar.</li>
              <li>Cheats (hint, auto-claim, undo, skip, random bot, side counts) are AI-mode only.</li>
            </ul>
            <div class="dab-foot"><span class="dab-note">Press H to reopen this guide</span><button class="dab-btn dab-primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="dab-pad" aria-label="Touch controls">
    <button class="dab-btn" type="button" data-pad="up" style="grid-column:2;grid-row:1" aria-label="Up">↑</button>
    <button class="dab-btn" type="button" data-pad="left" style="grid-column:1;grid-row:2" aria-label="Left">←</button>
    <button class="dab-btn" type="button" data-pad="ok" style="grid-column:2;grid-row:2" aria-label="Draw line">OK</button>
    <button class="dab-btn" type="button" data-pad="right" style="grid-column:3;grid-row:2" aria-label="Right">→</button>
    <button class="dab-btn" type="button" data-pad="down" style="grid-column:2;grid-row:3" aria-label="Down">↓</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const lineEls = {}, hitEls = {};
    root.querySelectorAll("[data-line]").forEach((el) => (lineEls[el.getAttribute("data-line")] = el));
    root.querySelectorAll("[data-hit]").forEach((el) => (hitEls[el.getAttribute("data-hit")] = el));
    const boxEls = [...root.querySelectorAll("[data-box]")];
    const countEls = [...root.querySelectorAll("[data-count]")];
    const cursorEl = $("[data-cursor]");
    const statusEl = $("[data-status]");
    const turnEl = $("[data-turn]"), turnDot = $("[data-turn-dot]");
    const hudYou = $("[data-you]"), hudOpp = $("[data-opp]"), hudLeft = $("[data-left]");
    const youDot = $("[data-you-dot]"), oppDot = $("[data-opp-dot]"), oppName = $("[data-opp-name]");
    const modeEl = $("[data-mode]");
    const resultTitle = $("[data-result-title]"), resultScore = $("[data-result-score]");
    const ov = {
        result: $('[data-ov="result"]'), cheat: $('[data-ov="cheat"]'),
        pause: $('[data-ov="pause"]'), help: $('[data-ov="help"]'),
    };
    const padOk = $('[data-pad="ok"]');
    const cheatsBtn = $("[data-cheats]"), pauseBtn = $("[data-pause]");
    const cheatBtns = {};
    ["hint", "claim", "undo", "skip", "dumb", "counts"].forEach((id) => (cheatBtns[id] = $(`[data-cheat="${id}"]`)));

    /* ---------- core rules ---------- */
    function playEdge(k, seat) {
        if (!state || state.over || state.turn !== seat || state.edges[k]) return false;
        state.edges[k] = seat;
        let gained = 0;
        for (const [r, c] of adjBoxes(k)) {
            const i = r * NB + c;
            // Point counts ONLY when all 4 sides of the box are drawn.
            if (!state.boxes[i] && boxEdges(r, c).every((bk) => state.edges[bk])) {
                state.boxes[i] = seat;
                state.scores[seat - 1]++;
                gained++;
            }
        }
        state.claimed += gained;
        state.last = k;
        if (state.claimed === NB * NB) state.over = true;
        else if (!gained) state.turn = 3 - seat; // closing a box keeps the turn
        return true;
    }

    function pickMove(dumb) {
        const free = freeKeys();
        if (!free.length) return null;
        if (dumb) return free[(Math.random() * free.length) | 0];
        let best = null, bg = 0;
        for (const k of free) { const g = gainOf(k); if (g > bg) { bg = g; best = k; } }
        if (best) return best; // take available boxes (double-box first)
        const safe = free.filter((k) => !givesThird(k));
        const pool = safe.length ? safe : free;
        return pool[(Math.random() * pool.length) | 0];
    }

    /* ---------- render ---------- */
    function ensureCursor() {
        if (!state || !state.edges[cursor]) return;
        const free = freeKeys();
        if (!free.length) return;
        const m = mid(cursor);
        let best = free[0], bd = Infinity;
        for (const k of free) { const p = mid(k); const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2; if (d < bd) { bd = d; best = k; } }
        cursor = best;
    }

    function render() {
        if (destroyed) return;
        const st = state, me = mySeat(), opp = oppSeat(), canAct = canPlay();
        KEYS.forEach((k) => {
            const el = lineEls[k], o = st ? st.edges[k] : 0;
            if (o) { el.setAttribute("stroke", COL[o]); el.setAttribute("opacity", "1"); }
            else if (canAct && k === hoverKey) { el.setAttribute("stroke", COL[me]); el.setAttribute("opacity", ".4"); }
            else el.setAttribute("opacity", "0");
            hitEls[k].style.pointerEvents = o ? "none" : "stroke";
            hitEls[k].style.cursor = canAct && !o ? "pointer" : "default";
        });
        for (let i = 0; i < NB * NB; i++) {
            const o = st ? st.boxes[i] : 0;
            boxEls[i].setAttribute("fill", o ? COL[o] : "#fff");
            boxEls[i].setAttribute("fill-opacity", o ? ".16" : "0");
            const r = (i / NB) | 0, c = i % NB;
            const n = st && !o ? sideCount(r, c) : 0;
            countEls[i].textContent = String(n);
            countEls[i].setAttribute("opacity", showCounts && st && !o && !st.over ? "1" : "0");
        }
        if (canAct && !st.edges[cursor]) {
            const { x1, y1, x2, y2 } = ends(cursor);
            cursorEl.setAttribute("x1", x1); cursorEl.setAttribute("y1", y1);
            cursorEl.setAttribute("x2", x2); cursorEl.setAttribute("y2", y2);
            cursorEl.setAttribute("stroke", COL[me]);
            cursorEl.setAttribute("opacity", ".55");
            cursorEl.classList.toggle("dab-pulse", hintKey === cursor);
        } else cursorEl.setAttribute("opacity", "0");

        const you = st ? st.scores[me - 1] : 0, them = st ? st.scores[opp - 1] : 0;
        const outcome = you > them ? "You win" : you < them ? (online ? "Rival wins" : "Bot wins") : "Draw";
        hudYou.textContent = you; hudOpp.textContent = them;
        hudLeft.textContent = st ? NB * NB - st.claimed : NB * NB;
        youDot.style.background = COL[me]; oppDot.style.background = COL[opp];
        oppName.textContent = online ? "Rival" : "Bot";
        modeEl.textContent = online ? "Room" : "Solo";
        turnEl.textContent = st ? (st.turn === me ? "You" : online ? "Rival" : "Bot") : "—";

        let msg, pulse = false;
        if (!st) msg = online ? "Waiting for host…" : "Ready";
        else if (paused) msg = "Paused";
        else if (helpOpen) msg = "How to play";
        else if (cheatOpen) msg = "Cheats";
        else if (st.over) msg = outcome;
        else if (canAct) msg = "Your turn";
        else { msg = online ? "Rival's turn" : "Bot thinking…"; pulse = true; }
        if (flashMsg && !paused && !helpOpen && !cheatOpen) msg = flashMsg;
        statusEl.textContent = msg;
        turnDot.style.background = st && !st.over ? COL[st.turn] : "#94a3b8";
        turnDot.classList.toggle("dab-pulse", pulse);

        if (st && st.over) { resultTitle.textContent = outcome; resultScore.textContent = `${you} – ${them}`; }
        syncUI();
        cheatBtns.hint.disabled = !myTurn();
        cheatBtns.claim.disabled = !myTurn();
        cheatBtns.undo.disabled = !history.length;
        cheatBtns.skip.disabled = !(st && !st.over && st.turn === 2);
        cheatBtns.dumb.setAttribute("aria-pressed", String(dumbBot));
        cheatBtns.counts.setAttribute("aria-pressed", String(showCounts));
        padOk.disabled = !canAct;

        scheduleAI();
    }

    function flash(msg) { flashMsg = msg; later("flash", () => { flashMsg = ""; render(); }, 1600); }

    /* ---------- overlays + pause ---------- */
    /* Help > cheats > pause > result; HUD label spans keep the icons intact. */
    function syncUI() {
        ov.result.hidden = !(state && state.over) || cheatOpen || helpOpen || paused;
        ov.cheat.hidden = !cheatOpen || helpOpen;
        ov.pause.hidden = !paused || helpOpen;
        ov.help.hidden = !helpOpen;
        if (cheatsBtn) cheatsBtn.classList.toggle("on", cheatOpen);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".dab-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        }
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
        root.focus?.({ preventScroll: true });
    }

    function toggleCheats(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
        root.focus?.({ preventScroll: true });
    }

    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) {
            cheatsBtn.classList.remove("on");
            cheatOpen = false;
            pauseStart = Date.now();
            pauseTimers();
        } else {
            if (pauseStart) pauseOffset += Date.now() - pauseStart;
            pauseStart = 0;
            resumeTimers();
        }
        render();
        root.focus?.({ preventScroll: true });
    }

    function restartRound() {
        helpOpen = false;
        cheatOpen = false;
        if (paused) togglePause(false);
        submitAction({ type: "restart" });
    }

    /* ---------- sync (host-authoritative when online) ---------- */
    function publish() {
        ensureCursor();
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function newRound() {
        clearTimers();
        history = []; hintKey = null; hoverKey = null;
        state = freshState();
        cursor = KEYS[0];
        const me = mySeat();
        flash(`You play ${NAME[me]} · ${state.turn === me ? "you start" : (online ? "rival" : "bot") + " starts"}`);
        publish();
    }

    function applyAction(action, seat) {
        if (destroyed || !action || !state) return;
        if (action.type === "restart") { newRound(); return; }
        if (action.type !== "edge") return;
        const k = action.key;
        if (typeof k !== "string" || !(k in state.edges)) return;
        if (state.over || state.turn !== seat) return;
        if (playEdge(k, seat)) publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    /* ---------- bot (AI mode only) ---------- */
    function scheduleAI() {
        if (online || destroyed || paused || helpOpen || cheatOpen || !state || state.over || state.turn !== 2) return;
        if (timers.has("ai") || deferredTimers.some((t) => t.key === "ai")) return;
        later("ai", () => { aiMove(); }, dumbBot ? 320 : 560);
    }
    function aiMove() {
        if (destroyed || paused || helpOpen || cheatOpen || !state || state.over || state.turn !== 2) return;
        const k = pickMove(dumbBot);
        if (!k) { state.over = true; publish(); return; }
        playEdge(k, 2);
        publish(); // render() chains extra turns via scheduleAI()
    }

    /* ---------- cheats (AI mode only) ---------- */
    const pushHistory = () => { history.push(JSON.stringify(state)); if (history.length > 80) history.shift(); };
    function cheat(id) {
        if (online || !state || paused || helpOpen) return;
        if (id === "hint") {
            if (!myTurn()) return;
            const k = pickMove(false);
            if (k) { hintKey = k; cursor = k; flash("Best move highlighted"); }
            render(); return;
        }
        if (id === "claim") {
            if (!myTurn()) return;
            if (!freeKeys().some((f) => gainOf(f) > 0)) { flash("No open boxes"); render(); return; }
            pushHistory();
            const before = state.claimed;
            while (!state.over) {
                const k = freeKeys().find((f) => gainOf(f) > 0);
                if (!k) break;
                playEdge(k, 1);
            }
            flash(`Auto-claimed ${state.claimed - before} box(es)`);
            publish(); return;
        }
        if (id === "undo") {
            if (!history.length) return;
            clearTimers();
            state = JSON.parse(history.pop());
            hintKey = null;
            flash("Move undone");
            publish(); return;
        }
        if (id === "skip") {
            if (state.over || state.turn !== 2) return;
            pushHistory();
            clearTimers();
            state.turn = 1;
            flash("Bot turn skipped");
            publish(); return;
        }
        if (id === "dumb") { dumbBot = !dumbBot; flash(dumbBot ? "Bot: random moves" : "Bot: smart moves"); render(); return; }
        if (id === "counts") { showCounts = !showCounts; render(); return; }
    }

    /* ---------- input: mouse / keyboard / virtual pad ---------- */
    function moveCursor(dir) {
        if (!state || paused || helpOpen || cheatOpen) return;
        const vec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        const m = mid(cursor);
        const scan = (pool) => {
            let best = null, bs = Infinity;
            for (const k of pool) {
                if (k === cursor) continue;
                const p = mid(k);
                const ddx = p.x - m.x, ddy = p.y - m.y;
                const along = ddx * vec[0] + ddy * vec[1];
                if (along <= 0) continue;
                const perp = Math.abs(ddx * vec[1] - ddy * vec[0]);
                const score = along + perp * 2.5;
                if (score < bs) { bs = score; best = k; }
            }
            return best;
        };
        const best = scan(freeKeys()) || scan(KEYS); // prefer free edges
        if (best) { cursor = best; hintKey = null; render(); }
    }

    function humanPlay(k) {
        if (!canPlay() || state.edges[k]) return;
        if (!online) pushHistory();
        hintKey = null; hoverKey = null;
        submitAction({ type: "edge", key: k });
    }
    const placeCursor = () => humanPlay(cursor);

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
        if (t.closest("[data-restart]")) { restartRound(); return; }
        if (t.closest("[data-hint]")) { cheat("hint"); return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { cheat(ch.getAttribute("data-cheat")); return; }
        const pad = t.closest("[data-pad]");
        if (pad) { const d = pad.getAttribute("data-pad"); if (d === "ok") placeCursor(); else moveCursor(d); return; }
        const hit = t.closest("[data-hit]");
        if (hit) humanPlay(hit.getAttribute("data-hit"));
    }
    function handleOver(e) {
        const h = e.target.closest?.("[data-hit]");
        if (h) { hoverKey = h.getAttribute("data-hit"); render(); }
    }
    function handleOut(e) {
        const h = e.target.closest?.("[data-hit]");
        if (h && hoverKey === h.getAttribute("data-hit")) { hoverKey = null; render(); }
    }
    function handleKey(e) {
        if (destroyed || !root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
        const code = e.code || "";
        const k = e.key, low = k.toLowerCase();
        /* priority: help -> cheats -> pause -> escape -> restart -> game actions */
        if (code === "KeyH" || k === "?") { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!e.repeat && !online && !helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (code === "KeyP") { if (!e.repeat && !online && !helpOpen && !cheatOpen) togglePause(); e.preventDefault(); return; }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            e.preventDefault(); return;
        }
        if (code === "KeyR") { if (!e.repeat) restartRound(); e.preventDefault(); return; }
        if (tag === "BUTTON") return; /* keep native Enter/Space on HUD buttons */
        if (helpOpen || cheatOpen || paused) { e.preventDefault(); return; }
        const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" }[k] ||
            { w: "up", s: "down", a: "left", d: "right" }[low];
        if (dir) { moveCursor(dir); e.preventDefault(); return; }
        if (k === "Enter" || k === " ") { placeCursor(); e.preventDefault(); return; }
        if (code === "KeyU") { cheat("undo"); e.preventDefault(); }
    }

    /* ---------- boot ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerover", handleOver);
    root.addEventListener("pointerout", handleOut);
    document.addEventListener("keydown", handleKey);

    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            newRound(); // host owns canonical state; random swap + starter
            room.onAction((action) => { if (!destroyed) applyAction(action, 3 - hostSeat()); });
        } else {
            room.onState((nextState) => { if (destroyed || !nextState) return; state = normalize(nextState); ensureCursor(); render(); });
            render(); // waiting for host…
        }
    } else {
        newRound(); // random starter vs bot
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerover", handleOver);
            root.removeEventListener("pointerout", handleOut);
            document.removeEventListener("keydown", handleKey);
        },
    };
}
