/* ==== GAME: whack-a-mole.js ==== */
import { iconSVG } from "../JS/icons.js";
/*
  Whack A Mole — turn-based duel (vs Bot / vs Player online).
  - Template baru: export META + export mount(root, context).
  - Setelah edit: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "whack-a-mole", // harus sama dengan nama file (tanpa .js)
    name: "Whack A Mole",
    category: "action",
    catLabel: "Action",
    desc: "Whack the moles, spare the dolls. Take turns and race your rival to 300 points.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="24" cy="38" rx="17" ry="6"/><path d="M12 38v-8a12 9 0 0 1 24 0v8"/><circle cx="19" cy="26" r="1.6" fill="currentColor" stroke="none"/><circle cx="29" cy="26" r="1.6" fill="currentColor" stroke="none"/><path d="M21 31h6"/></svg>',
    bg: ["#fde68a", "#fbbf24"],
    bestKey: "whackAMoleBest",
};

/* ================= pure rules & level generator ================= */

const GAME = {
    TARGET: 300,        // race target
    HIT: 10,            // mole points
    DECOY: -15,         // doll penalty
    MISS_LIMIT: 6,      // empty whacks per wave -> wave ends early
    MAX_LEVEL: 6,       // safety cap -> match always finishes
    RISE: 0.14,
    SINK: 0.18,
    HIT_K: 0.5,         // mole must be >=50% risen to count
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (v) => Math.round(v * 100) / 100;

/* deterministic RNG (identical on host & guest -> same level from one seed) */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const evStart = (e) => e.t;
const evEnd = (e) => e.t + GAME.RISE + e.up;

function maxConcurrent(evs) {
    const pts = [];
    for (const e of evs) { pts.push([evStart(e), 1], [evEnd(e), -1]); }
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let cur = 0, mx = 0;
    for (const p of pts) { cur += p[1]; if (cur > mx) mx = cur; }
    return mx;
}

function holeBusy(evs, hole, t, up) {
    const s = t, en = t + GAME.RISE + up;
    for (const e of evs) {
        if (e.hole !== hole) continue;
        if (s < evEnd(e) && evStart(e) < en) return true;
    }
    return false;
}

/* greedy "perfect human" simulator: reaction 0.26s, move cost 0.16s */
function simulatePerfect(evs) {
    const moles = evs.filter((e) => e.kind === "m").sort((a, b) => a.t - b.t);
    let busy = 0, hits = 0;
    for (const e of moles) {
        const at = Math.max(e.t + GAME.RISE + 0.26, busy);
        if (at <= evEnd(e) - 0.02) { hits++; busy = at + 0.16; }
    }
    return hits;
}

function shuffledHoles(rng) {
    const h = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 8; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        [h[i], h[j]] = [h[j], h[i]];
    }
    return h;
}

/* always-finishable fallback layout (single mole at a time, fixed rhythm) */
function fallbackLevel(L) {
    const total = 8 + 2 * L + Math.min(1 + L, 5);
    const cycle = [4, 0, 8, 2, 6, 1, 7, 3, 5];
    const evs = [];
    let t = 0.85;
    for (let i = 0; i < total; i++) {
        t += i % 5 === 4 ? 1.05 : 0.95;
        evs.push({ id: evs.length, t: r2(t), hole: cycle[i % 9], kind: i % 5 === 4 ? "d" : "m", up: 1.05 });
    }
    const moles = evs.filter((e) => e.kind === "m").length;
    const last = evs[evs.length - 1];
    return {
        events: evs,
        duration: r2(last.t + GAME.RISE + last.up + GAME.SINK + 0.45),
        moleCount: moles, decoyCount: evs.length - moles,
        par: Math.round(moles * 6), maxUp: 1.05,
    };
}

/* random level generator — validated solvable before it is accepted */
function generateLevel(level, seed) {
    const L = clamp(level, 1, GAME.MAX_LEVEL);
    const moleQ = 8 + 2 * L;
    const decoyQ = Math.min(1 + L, 5);
    for (let attempt = 0; attempt < 24; attempt++) {
        const rng = mulberry32((seed + attempt * 7919) >>> 0);
        const kinds = [];
        for (let i = 0; i < moleQ; i++) kinds.push("m");
        for (let i = 0; i < decoyQ; i++) kinds.push("d");
        for (let i = kinds.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
        }
        if (kinds[0] !== "m") { // first pop is always a mole (teach the player)
            const k = kinds.indexOf("m");
            [kinds[0], kinds[k]] = [kinds[k], kinds[0]];
        }
        const baseGap = clamp(0.94 - 0.075 * L, 0.42, 2);
        const baseUp = clamp(1.34 - 0.11 * L, 0.58, 2);
        let t = 0.85, prev = -1;
        const evs = [];
        for (const kind of kinds) {
            t += baseGap * (0.8 + rng() * 0.55);
            const up = r2(baseUp * (0.9 + rng() * 0.3));
            const order = shuffledHoles(rng);
            for (let tries = 0; tries < 26; tries++) {
                let hole = -1;
                for (const c of order) { if (c !== prev && !holeBusy(evs, c, t, up)) { hole = c; break; } }
                if (hole < 0) for (const c of order) { if (!holeBusy(evs, c, t, up)) { hole = c; break; } }
                if (hole < 0) { t += 0.25; continue; }
                const cand = { id: evs.length, t: r2(t), hole, kind, up };
                if (maxConcurrent(evs.concat([cand])) <= 2) { evs.push(cand); prev = hole; break; }
                t += 0.22; // never more than 2 moles up at once -> humanly clearable
            }
        }
        const moles = evs.filter((e) => e.kind === "m").length;
        if (!evs.length || moles < moleQ - 2) continue;
        const last = evs[evs.length - 1];
        const duration = r2(last.t + GAME.RISE + last.up + GAME.SINK + 0.45);
        const sim = simulatePerfect(evs);
        if (duration <= 20 && sim >= Math.ceil(moles * 0.7)) {
            return {
                events: evs, duration,
                moleCount: moles, decoyCount: evs.length - moles,
                par: Math.round(moles * 6),
                maxUp: Math.max(...evs.map((e) => e.up)),
            };
        }
    }
    return fallbackLevel(L);
}

let uidCounter = 0; // unique SVG clip ids per mount (fixes id-collision bug)

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // client index (0 host / 1 guest)
    let roomData = room?.room || null;
    let state = null;

    const uid = ++uidCounter;
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    /* ---------- local (non-synced) runtime ---------- */
    const SLOWMO = 0.55, LONGUP = 2.2;
    const cheats = { slowmo: false, longup: false, auto: false, shield: false, reveal: false };
    let cheatsOpen = false, paused = false, autoPaused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("wamHelpSeen") === "1"; } catch (_) { /* storage blocked */ }
    let helpOpen = !seenHelp;
    if (helpOpen) { try { localStorage.setItem("wamHelpSeen", "1"); } catch (_) { /* storage blocked */ } }
    let padOn = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
    let raf = 0, lastT = 0, phaseClock = 0, prevPhase = "";
    let waveElapsed = 0, waveStartPerf = 0, waveSeenId = -1, spritesHidden = false;
    let waveKey = "", waveData = null;
    let botPlan = [], autoPlan = [];
    let resolvedLocal = {};           // eid -> local wave time when first seen
    let seenHitSeq = 0, seenMissSeq = 0;
    let lastToastLevel = 0, newBest = false, toastTimer = 0;
    let waveSeq = 0;
    const timers = new Set();
    const subs = [];
    const fx = [];

    /* ---------- shell (minimalist light UI) ---------- */
    root.innerHTML = `
<style>
.wam-app{--bg:#fafaf9;--card:#fff;--ink:#292524;--mut:#78716c;--line:#e7e5e4;--amber:#d97706;--sky:#0284c7;--red:#dc2626;--green:#059669;--pink:#db2777;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;width:100%;max-width:100%;margin:0 auto;padding:0 12px calc(12px + env(safe-area-inset-bottom));box-sizing:border-box}
.wam-app *{box-sizing:border-box}
.wam-app [hidden]{display:none!important}
.wam.game-fill{display:flex;flex-direction:column;gap:10px;min-height:0}
/* HUD — semua info & kontrol ada di sini; board hanya arena bermain */
.wam-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
.wam-chip{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:5px 8px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--mut);white-space:nowrap}
.wam-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.wam-chip.is-active{border-color:currentColor;box-shadow:0 0 0 1px currentColor}
.wam-chip .dot{width:7px;height:7px;border-radius:50%;background:var(--green);flex:none}
.wam-seat{--seatc:var(--amber);color:var(--seatc)}
.wam-seat[data-seat="1"]{--seatc:var(--sky)}
.wam-pname{max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.wam-you{font-size:9px;border:1px solid currentColor;border-radius:99px;padding:0 5px;flex:0 0 auto;font-style:normal}
.wam-bar{width:46px;height:4px;border-radius:99px;background:var(--line);overflow:hidden}
.wam-bar i{display:block;height:100%;width:0;background:currentColor;transition:width .25s}
.wam-time{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.wam-time.is-low{color:var(--red)}
.wam-pips{display:flex;gap:3px}
.wam-pips i{width:6px;height:6px;border-radius:50%;background:var(--line)}
.wam-pips i.on{background:var(--red)}
.wam-spacer{flex:1 1 auto}
.wam-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-size:10px;font-weight:700;border-radius:9px;min-height:34px;padding:6px 9px;cursor:pointer;touch-action:manipulation}
.wam-btn:hover:not(:disabled){background:#f5f5f4;border-color:#d6d3d1}
.wam-btn:disabled{opacity:.4;cursor:default}
.wam-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.wam-btn.primary:hover:not(:disabled){background:#44403c;color:#fff}
.wam-btn.ghost{background:var(--card);color:var(--ink)}
.wam-btn.on{border-color:var(--amber);color:var(--amber);background:#fffbeb}
.wam-icon-btn svg{flex:none;display:block}
.wam-btn-label{white-space:nowrap}
.wam :focus-visible{outline:2px solid var(--amber);outline-offset:2px}
/* board mengisi sisa tinggi window; rasio SVG tetap dijaga */
.wam.game-fill > .game-panel[data-board]{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:auto;padding:0;border:1px solid var(--line);border-radius:14px;background:#f5f5f4;overflow:hidden}
.wam-board{display:block;width:100%;height:100%;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.wam-bg{fill:#f5f5f4;stroke:var(--line);stroke-width:1.5}
.wam-pit,.wam-lip{fill:#292524}
.wam-rim{fill:none;stroke:#d6d3d1;stroke-width:1.5}
.wam-hitzone{fill:transparent;cursor:pointer}
.wam-board.is-waiting .wam-hitzone{cursor:default}
.wam-key{fill:#a8a29e;font-size:10px;font-weight:600;text-anchor:middle;pointer-events:none;font-family:ui-monospace,monospace}
.wam-tag{font-size:9px;font-weight:800;letter-spacing:.1em;text-anchor:middle;pointer-events:none;opacity:0}
.wam-board.is-reveal .wam-tag{opacity:1}
.wam-tag.m{fill:var(--amber)}.wam-tag.d{fill:var(--pink)}
@media (pointer:coarse){.wam-key{display:none}}
.wam-mole-body{fill:#b45309;stroke:#92400e;stroke-width:1.5}
.wam-mole-belly{fill:#d97706}
.wam-mole-eye{fill:#1c1917}
.wam-mole-nose{fill:#fda4af}
.wam-dizzy{stroke:#fde68a;stroke-width:2.2;stroke-linecap:round;fill:none}
.wam-doll-body{fill:#f9a8d4;stroke:#ec4899;stroke-width:1.5}
.wam-doll-ear{fill:#f472b6;stroke:#ec4899;stroke-width:1.5}
.wam-doll-ear-in{fill:#fbcfe8}
.wam-doll-eye{fill:#fff;stroke:#be185d;stroke-width:1.4}
.wam-doll-stitch{stroke:#be185d;stroke-width:1.3;stroke-linecap:round;fill:none}
.wam-doll-heart{fill:#ec4899}
.wam-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:calc(100% - 16px);background:var(--ink);color:#fff;font-size:11.5px;font-weight:600;padding:6px 14px;border-radius:99px;z-index:6;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap;box-sizing:border-box}
.wam-toast.show{opacity:1}
/* overlay: head/foot tetap, body bisa scroll */
.wam-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(250,250,249,.92);backdrop-filter:blur(3px)}
.wam-card{display:flex;flex-direction:column;width:min(420px,100%);max-width:100%;max-height:100%;overflow:hidden;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 6px 18px rgba(28,25,23,.08);text-align:left}
.wam-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:10px}
.wam-head h3{margin:0;font-size:16px;letter-spacing:-.01em}
.wam-body{flex:1 1 auto;min-height:0;overflow:auto}
.wam-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:12px}
.wam-sub{margin:0 0 10px;font-size:12.5px;color:var(--mut);line-height:1.5}
.wam-how{list-style:none;margin:0 0 10px;padding:0;text-align:left;display:grid;gap:7px}
.wam-how li{display:flex;gap:9px;font-size:12.5px;line-height:1.45;align-items:flex-start}
.wam-how .ic{flex:0 0 auto;width:22px;text-align:center}
.wam-how b{color:var(--ink)}
.wam-keys{font-size:11px;color:var(--mut);margin:0;line-height:1.8}
.wam-app kbd{font-family:ui-monospace,monospace;font-size:10px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;background:#fafaf9}
.wam-badge{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:3px 10px}
.wam-badge.seat0{background:#fef3c7;color:#92400e}
.wam-badge.seat1{background:#e0f2fe;color:#075985}
.wam-badge.warn{background:#fee2e2;color:#991b1b}
.wam-big{font-size:30px;font-weight:800;margin:2px 0 6px;font-variant-numeric:tabular-nums}
.wam-coin{font-size:34px;display:inline-block;animation:wamflip 1.1s ease-in-out infinite}
@keyframes wamflip{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.15)}}
.wam-cheats{display:flex;flex-direction:column;gap:7px}
.wam-cheat{display:flex;justify-content:space-between;align-items:center;gap:8px;font:inherit;font-size:12.5px;font-weight:600;min-height:44px;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;text-align:left}
.wam-cheat small{display:block;font-weight:500;color:var(--mut);font-size:10.5px}
.wam-cheat .st{font-size:10px;font-weight:800;color:var(--mut);border:1px solid var(--line);border-radius:99px;padding:2px 8px;flex:0 0 auto}
.wam-cheat[aria-pressed="true"]{border-color:var(--amber);background:#fffbeb}
.wam-cheat[aria-pressed="true"] .st{color:#92400e;border-color:var(--amber);background:#fef3c7}
.wam-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.wam-note{font-size:10.5px;color:var(--mut)}
.wam-stats{font-size:12.5px;color:var(--mut);margin:0;line-height:1.7}
.wam-final{display:grid;gap:4px;font-size:13px}
.wam-final div{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border:1px solid var(--line);border-radius:9px}
.wam-final b{font-variant-numeric:tabular-nums}
.wam-final .win{border-color:var(--green);background:#ecfdf5}
/* touch pad adalah sibling board, bukan di dalamnya */
.wam-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 auto;max-width:340px;width:100%}
.wam-pad button{font:inherit;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;min-height:56px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.wam-pad button:active{background:#f5f5f4;transform:scale(.97)}
.wam-pad button:disabled{opacity:.35;cursor:default}
/* --- layout redesign overrides (keep last) --- */
.wam.game-fill > .game-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.wam.game-fill > .game-panel[data-board]:not(:has(.wam-ov:not([hidden]))){flex:0 0 auto;aspect-ratio:480/396;min-height:0}
.wam.game-fill > .game-panel[data-board]:has(.wam-ov:not([hidden])){flex:0 0 auto;aspect-ratio:auto;min-height:min(70dvh,620px)}
.wam .wam-hud{gap:5px}
.wam .wam-hud .wam-chip{padding:4px 6px;min-height:0;font-size:9px}
.wam .wam-hud .wam-chip[data-hud="level"],.wam .wam-hud .wam-chip[data-hud="best"]{display:none}
.wam .wam-hud .wam-bar{width:30px}
.wam .wam-hud .wam-time{font-size:14px}
.wam .wam-hud .wam-btn{min-height:32px;padding:5px 9px;font-size:9px}
.wam .wam-hud .wam-btn-label,.wam .wam-hud .wam-spacer{display:none}
.wam .wam-ov{padding:8px}
.wam .wam-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.wam .wam-body,.wam .wam-cheats{scrollbar-width:none}
.wam .wam-body::-webkit-scrollbar,.wam .wam-cheats::-webkit-scrollbar{display:none}
.wam .wam-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.wam .wam-note{display:none}
}
@media (pointer:coarse){
.wam .wam-hud .wam-btn{min-height:32px;padding:5px 9px;font-size:9px}
}
@media (prefers-reduced-motion:reduce){.wam-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
<div class="game-app wam-app game-fill" data-wam>
  <div class="wam-hud">
    <span class="wam-chip" data-hud="status"><i class="dot"></i><span data-status>Ready</span></span>
    <span class="wam-chip wam-seat" data-seat="0" data-card="0">
      <span class="wam-pname"><span data-name="0">Player 1</span><span class="wam-you" data-you="0" hidden>you</span></span>
      <b data-score="0">0</b><span class="wam-bar"><i data-bar="0"></i></span>
    </span>
    <span class="wam-chip"><span data-time>–</span>s</span>
    <span class="wam-chip" data-hud="level"><span data-level>Level 1/${GAME.MAX_LEVEL}</span></span>
    <span class="wam-chip" data-pips title="Misses this turn">${'<i></i>'.repeat(GAME.MISS_LIMIT)}</span>
    <span class="wam-chip wam-seat" data-seat="1" data-card="1">
      <span class="wam-pname"><span data-name="1">Player 2</span><span class="wam-you" data-you="1" hidden>you</span></span>
      <b data-score="1">0</b><span class="wam-bar"><i data-bar="1"></i></span>
    </span>
    <span class="wam-chip" data-hud="best">BEST <b data-besthud>0</b></span>
    <span class="wam-spacer"></span>
    <button class="wam-btn wam-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="wam-btn-label">Help</span></button>
    <button class="wam-btn wam-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C) — offline only">${iconSVG("wrench", { size: 14 })}<span class="wam-btn-label">Cheats</span></button>
    <button class="wam-btn wam-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P) — offline only">${iconSVG("pause", { size: 14 })}<span class="wam-btn-label" data-pauselabel>Pause</span></button>
    <button class="wam-btn wam-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="wam-btn-label" data-restartlabel>Restart</span></button>
    <button class="wam-btn wam-icon-btn" type="button" data-pad-toggle aria-label="Virtual pad" title="Toggle virtual pad" aria-pressed="false">${iconSVG("gamepad2", { size: 14 })}<span class="wam-btn-label">Pad</span></button>
    <button class="wam-btn wam-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="wam-btn-label">Exit</span></button>
  </div>

  <section class="game-panel wam-panel" data-board>
    <svg class="wam-board" data-svg viewBox="0 0 480 396" preserveAspectRatio="xMidYMid meet" aria-label="Whack A Mole board">
      <rect class="wam-bg" x="1" y="1" width="478" height="394" rx="14"></rect>
      <g data-field></g>
      <g data-fx></g>
    </svg>
    <div class="wam-toast" data-toast aria-live="polite"></div>

    <div class="wam-ov" data-ov="intro">
      <div class="wam-card">
        <div class="wam-head"><h3>Whack A Mole</h3><span class="wam-badge seat0" data-seatbadge>You are Player 1</span></div>
        <div class="wam-body">
          <p class="wam-sub">Whack moles, spare the dolls. First to ${GAME.TARGET} wins.</p>
          <p class="wam-keys">Holes <kbd>1</kbd>–<kbd>9</kbd> / numpad · click or tap a hole · <kbd>P</kbd> pause · <kbd>H</kbd> help</p>
          <p class="wam-sub" data-bestline hidden></p>
        </div>
        <div class="wam-foot"><span class="wam-note" data-waitstart hidden>Waiting for the host to start…</span><button class="wam-btn primary" type="button" data-act="start" data-startbtn>Start match</button></div>
      </div>
    </div>

    <div class="wam-ov" data-ov="toss" hidden>
      <div class="wam-card">
        <div class="wam-head"><h3 data-tosstitle>Coin toss…</h3></div>
        <div class="wam-body"><span class="wam-coin">🪙</span><p class="wam-sub" data-tosssub></p></div>
      </div>
    </div>

    <div class="wam-ov" data-ov="result" hidden>
      <div class="wam-card">
        <div class="wam-head"><h3 data-restitle>Turn complete</h3></div>
        <div class="wam-body">
          <div class="wam-big" data-resgain>+0</div>
          <p class="wam-stats" data-resstats></p>
          <p class="wam-sub" data-reswait hidden>Next turn starting…</p>
        </div>
        <div class="wam-foot"><span class="wam-note">Space to continue</span><button class="wam-btn primary" type="button" data-act="next" data-nextbtn>Continue ⏵</button></div>
      </div>
    </div>

    <div class="wam-ov" data-ov="over" hidden>
      <div class="wam-card">
        <div class="wam-head"><h3 data-overtitle>Game over</h3></div>
        <div class="wam-body">
          <p class="wam-sub" data-oversub></p>
          <div class="wam-final" data-overfinal></div>
          <p class="wam-stats" data-overstats></p>
          <span class="wam-badge warn" data-overcheat hidden>🧪 Cheats used — score not saved</span>
          <p class="wam-sub" data-overbest hidden></p>
          <p class="wam-sub" data-overwait hidden>Waiting for the host to rematch…</p>
        </div>
        <div class="wam-foot"><span class="wam-note">Press R to restart</span><button class="wam-btn primary" type="button" data-act="rematch" data-rematchbtn>Rematch</button></div>
      </div>
    </div>

    <div class="wam-ov" data-ov="pause" hidden>
      <div class="wam-card">
        <div class="wam-head"><h3>Paused</h3></div>
        <div class="wam-body"><p class="wam-sub">The wave, timer and bot are frozen. Resume to continue.</p></div>
        <div class="wam-foot"><span class="wam-note">Press P or Esc to resume</span><button class="wam-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="wam-ov" data-ov="help" hidden>
      <div class="wam-card">
        <div class="wam-head"><h3>How to play</h3><button class="wam-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="wam-body">
          <ul class="wam-how">
            <li><span class="ic">🐹</span><span>Mole (brown, round head) → <b>+${GAME.HIT}</b>. It must be at least halfway out.</span></li>
            <li><span class="ic">🧸</span><span>Decoy doll (pink, ears + button eyes) → <b>${GAME.DECOY}</b>. Let it sink!</span></li>
            <li><span class="ic">🕳️</span><span>Whacking an empty hole = miss. <b>${GAME.MISS_LIMIT} misses</b> ends your turn.</span></li>
            <li><span class="ic">🏁</span><span>Both players face the <b>same generated wave</b> per level. Levels get faster with more dolls. First to <b>${GAME.TARGET}</b> after a full round wins; at level ${GAME.MAX_LEVEL} the highest score wins.</span></li>
            <li><span class="ic">🎲</span><span>Random seat draw + coin toss decide positions and who starts. The starting seat alternates every level.</span></li>
          </ul>
          <p class="wam-keys">Holes map to <kbd>1</kbd>–<kbd>9</kbd> (reading order) or numpad <kbd>7 8 9 / 4 5 6 / 1 2 3</kbd>.<br><kbd>Space</kbd> start/continue · <kbd>P</kbd> pause · <kbd>R</kbd> restart · <kbd>C</kbd> cheats · <kbd>Esc</kbd> close</p>
          <p class="wam-sub" data-helpnote hidden>Online match: the timer keeps running while this panel is open.</p>
        </div>
        <div class="wam-foot"><span class="wam-note">Press H to reopen this guide</span><button class="wam-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>

    <div class="wam-ov" data-ov="cheats" hidden>
      <div class="wam-card">
        <div class="wam-head"><h3>🧪 Cheats</h3><button class="wam-btn" type="button" data-cheats-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="wam-body">
          <p class="wam-sub">Offline only. Any cheat disables best-score saving.</p>
          <div class="wam-cheats">
            <button class="wam-cheat" type="button" data-cheat="slowmo" aria-pressed="false"><span>🐢 Slow motion<small>Wave runs at 55% speed.</small></span><span class="st">OFF</span></button>
            <button class="wam-cheat" type="button" data-cheat="longup" aria-pressed="false"><span>⏱ Long uptime<small>Moles stay up 2.2× longer.</small></span><span class="st">OFF</span></button>
            <button class="wam-cheat" type="button" data-cheat="auto" aria-pressed="false"><span>🎯 Auto-whack<small>A perfect hitter plays your turn.</small></span><span class="st">OFF</span></button>
            <button class="wam-cheat" type="button" data-cheat="shield" aria-pressed="false"><span>🛡 Doll shield<small>Doll hits cost nothing.</small></span><span class="st">OFF</span></button>
            <button class="wam-cheat" type="button" data-cheat="reveal" aria-pressed="false"><span>🏷 X-ray tags<small>Label every MOLE / DOLL.</small></span><span class="st">OFF</span></button>
          </div>
          <div class="wam-row">
            <button class="wam-btn ghost" type="button" data-cheatcmd="score">+100 pts</button>
            <button class="wam-btn ghost" type="button" data-cheatcmd="win">Instant win</button>
            <button class="wam-btn ghost" type="button" data-cheatcmd="reset">Reset all</button>
          </div>
        </div>
        <div class="wam-foot"><span class="wam-note">Cheats apply immediately</span><button class="wam-btn primary" type="button" data-cheats-close>Done</button></div>
      </div>
    </div>
  </section>

  <div class="wam-pad" data-pad hidden>${Array.from({ length: 9 }, (_, i) =>
        `<button type="button" data-pad="${i}" aria-label="Whack hole ${i + 1}">${i + 1}</button>`).join("")}
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => root.querySelectorAll(s);
    const fieldG = $("[data-field]"), fxG = $("[data-fx]"), boardSvg = $("[data-svg]");
    const statusEl = $("[data-status]"), timeEl = $("[data-time]"), levelEl = $("[data-level]");
    const pipsEl = $("[data-pips]"), toastEl = $("[data-toast]"), padEl = $("[data-pad]");
    const helpBtn = $("[data-help]"), cheatsBtn = $("[data-cheats]"), pauseBtn = $("[data-pause]");
    const restartBtn = $("[data-restart]"), padBtn = $("[data-pad-toggle]");
    const ov = {
        intro: $('[data-ov="intro"]'), toss: $('[data-ov="toss"]'), result: $('[data-ov="result"]'),
        over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'), help: $('[data-ov="help"]'),
        cheats: $('[data-ov="cheats"]'),
    };
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");

    /* ---------- build holes (fixed layering: pit -> clipped sprite -> front lip) ---------- */
    const W = 480, COLS = [96, 240, 384], ROWS = [92, 204, 316], RX = 52, RY = 16;
    const holes = [];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const i = r * 3 + c, cx = COLS[c], cy = ROWS[r];
            const g = mk("g", {});
            const clipId = "wam-" + uid + "-clip-" + i;
            const clip = mk("clipPath", { id: clipId });
            clip.appendChild(mk("rect", { x: cx - 58, y: 0, width: 116, height: cy }));
            g.appendChild(clip);
            /* 1. pit (behind sprite) */
            g.appendChild(mk("ellipse", { class: "wam-pit", cx, cy, rx: RX, ry: RY }));
            /* 2. sprite, clipped at the hole centre line */
            const wrap = mk("g", { "clip-path": "url(#" + clipId + ")" });
            const moleT = mk("g", {});
            const moleG = mk("g", { style: "display:none" });
            moleG.appendChild(mk("path", { class: "wam-mole-body", d: "M-24 -34 A24 24 0 0 1 24 -34 L24 34 L-24 34 Z" }));
            moleG.appendChild(mk("ellipse", { class: "wam-mole-belly", cx: 0, cy: 6, rx: 13, ry: 16 }));
            const faceN = mk("g", {});
            faceN.appendChild(mk("circle", { class: "wam-mole-eye", cx: -9, cy: -30, r: 2.6 }));
            faceN.appendChild(mk("circle", { class: "wam-mole-eye", cx: 9, cy: -30, r: 2.6 }));
            faceN.appendChild(mk("circle", { class: "wam-mole-nose", cx: 0, cy: -22, r: 3 }));
            moleG.appendChild(faceN);
            const faceD = mk("g", { style: "display:none" });
            faceD.appendChild(mk("path", { class: "wam-dizzy", d: "M-12 -33 l6 6 M-6 -33 l-6 6" }));
            faceD.appendChild(mk("path", { class: "wam-dizzy", d: "M6 -33 l6 6 M12 -33 l-6 6" }));
            faceD.appendChild(mk("path", { class: "wam-dizzy", d: "M-6 -20 q3 -3 6 0 q3 3 6 0" }));
            moleG.appendChild(faceD);
            const dollG = mk("g", { style: "display:none" });
            dollG.appendChild(mk("circle", { class: "wam-doll-ear", cx: -16, cy: -52, r: 9 }));
            dollG.appendChild(mk("circle", { class: "wam-doll-ear", cx: 16, cy: -52, r: 9 }));
            dollG.appendChild(mk("circle", { class: "wam-doll-ear-in", cx: -16, cy: -52, r: 4 }));
            dollG.appendChild(mk("circle", { class: "wam-doll-ear-in", cx: 16, cy: -52, r: 4 }));
            dollG.appendChild(mk("path", { class: "wam-doll-body", d: "M-24 -34 A24 24 0 0 1 24 -34 L24 34 L-24 34 Z" }));
            dollG.appendChild(mk("circle", { class: "wam-doll-eye", cx: -9, cy: -30, r: 3.5 }));
            dollG.appendChild(mk("circle", { class: "wam-doll-eye", cx: 9, cy: -30, r: 3.5 }));
            dollG.appendChild(mk("path", { class: "wam-doll-stitch", d: "M-11 -32 l4 4 M-7 -32 l-4 4" }));
            dollG.appendChild(mk("path", { class: "wam-doll-stitch", d: "M7 -32 l4 4 M11 -32 l-4 4" }));
            dollG.appendChild(mk("path", { class: "wam-doll-stitch", "stroke-dasharray": "3 2", d: "M-8 -20 Q0 -14 8 -20" }));
            dollG.appendChild(mk("path", { class: "wam-doll-heart", d: "M0 10 C-6 2 -12 6 -8 12 L0 18 L8 12 C12 6 6 2 0 10 Z" }));
            moleT.appendChild(moleG);
            moleT.appendChild(dollG);
            wrap.appendChild(moleT);
            g.appendChild(wrap);
            /* 3. front lip covers the sprite below the centre line -> mole emerges FROM the hole */
            g.appendChild(mk("path", { class: "wam-lip", d: "M" + (cx - RX) + " " + cy + " A" + RX + " " + RY + " 0 0 0 " + (cx + RX) + " " + cy + " Z" }));
            g.appendChild(mk("ellipse", { class: "wam-rim", cx, cy, rx: RX, ry: RY }));
            const key = mk("text", { class: "wam-key", x: cx, y: cy + 30 });
            key.textContent = String(i + 1);
            g.appendChild(key);
            const tag = mk("text", { class: "wam-tag", x: cx, y: cy - 62 });
            g.appendChild(tag);
            const zone = mk("ellipse", { class: "wam-hitzone", cx, cy: cy - 12, rx: 62, ry: 46, "data-hole": i });
            g.appendChild(zone);
            fieldG.appendChild(g);
            holes.push({ cx, cy, moleT, moleG, dollG, faceN, faceD, tag });
        }
    }

    /* ---------- helpers ---------- */
    const isAuthority = () => !online || room.isHost;
    const mySeat = () => (state ? state.seatMap[playerIndex] : 0);
    const humanSeat = () => (state ? state.seatMap[0] : 0); // offline: client 0 is the human
    const evUp = (e) => e.up * (!online && cheats.longup ? LONGUP : 1);

    function waveInfo() {
        if (!state || !state.wave) return null;
        const key = state.wave.level + ":" + state.wave.seed;
        if (key !== waveKey) { waveKey = key; waveData = generateLevel(state.wave.level, state.wave.seed); }
        return waveData;
    }
    function waveDuration() {
        const info = waveInfo();
        if (!info) return 0;
        return info.duration + (!online && cheats.longup ? (LONGUP - 1) * info.maxUp : 0);
    }
    function schedule(fn, ms) {
        const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
        timers.add(id);
    }
    function clearTimers() { timers.forEach((id) => clearTimeout(id)); timers.clear(); }

    function clientNames() {
        if (!online) return [playerName || "You", "Bot"];
        let a = "Host", b = "Guest";
        const p = roomData && roomData.players;
        const read = (v) => (typeof v === "string" ? v : (v && (v.name || v.displayName)) || null);
        if (Array.isArray(p)) { a = read(p[0]) || a; b = read(p[1]) || b; }
        else if (p && typeof p === "object") {
            const h = read(p.host ?? p.p0 ?? p["0"]);
            const g = read(p.guest ?? p.p1 ?? p["1"]);
            if (h || g) { a = h || a; b = g || b; }
            else { const ks = Object.keys(p); if (ks.length >= 2) { a = read(p[ks[0]]) || a; b = read(p[ks[1]]) || b; } }
        }
        return [a, b];
    }
    function seatNames() {
        const cn = clientNames();
        const m = state ? state.seatMap : [0, 1];
        const out = ["Player 1", "Player 2"];
        out[m[0]] = cn[0]; out[m[1]] = cn[1];
        return out;
    }
    function readBest() {
        try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch { return 0; }
    }
    function saveBest(v) {
        try { localStorage.setItem(META.bestKey, String(v)); } catch { /* storage unavailable */ }
    }
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
    }

    /* ---------- fx ---------- */
    function popText(x, y, text, color) {
        const el = mk("text", { x, y, fill: color, "font-size": 20, "font-weight": 800, "font-family": "inherit", "text-anchor": "middle" });
        el.textContent = text;
        fxG.appendChild(el);
        fx.push({ t: 0, el, kind: "text", x, y });
    }
    function ring(x, y, color) {
        const el = mk("circle", { cx: x, cy: y, r: 6, fill: "none", stroke: color, "stroke-width": 3 });
        fxG.appendChild(el);
        fx.push({ t: 0, el, kind: "ring" });
    }
    function updateFx(dt) {
        for (let i = fx.length - 1; i >= 0; i--) {
            const p = fx[i];
            p.t += dt;
            const k = p.t / 0.55;
            if (k >= 1) { p.el.remove(); fx.splice(i, 1); continue; }
            if (p.kind === "text") {
                p.el.setAttribute("y", (p.y - 32 * k).toFixed(1));
                p.el.setAttribute("opacity", (1 - k).toFixed(2));
            } else {
                p.el.setAttribute("r", (6 + 22 * k).toFixed(1));
                p.el.setAttribute("opacity", (1 - k).toFixed(2));
            }
        }
    }
    function processNetFx() {
        if (!state) return;
        const lh = state.lastHit;
        if (lh && lh.seq !== seenHitSeq) {
            seenHitSeq = lh.seq;
            const h = holes[lh.hole];
            if (lh.kind === "m") { popText(h.cx, h.cy - 58, "+" + GAME.HIT, "#059669"); ring(h.cx, h.cy - 26, "#d97706"); }
            else if (lh.kind === "d") { popText(h.cx, h.cy - 58, String(GAME.DECOY), "#dc2626"); ring(h.cx, h.cy - 26, "#dc2626"); }
            else { popText(h.cx, h.cy - 58, "SAFE", "#0284c7"); ring(h.cx, h.cy - 26, "#0284c7"); }
        }
        const lm = state.lastMiss;
        if (lm && lm.seq !== seenMissSeq) {
            seenMissSeq = lm.seq;
            const h = holes[lm.hole];
            popText(h.cx, h.cy - 58, "MISS", "#a8a29e");
        }
    }

    /* ---------- state & flow ---------- */
    const shuffledSeats = () => (Math.random() < 0.5 ? [0, 1] : [1, 0]); // random seat draw
    function initialState() {
        return {
            v: 1, phase: "intro", level: 1, turnNo: 0, turnSeat: 0,
            seatMap: shuffledSeats(),
            starter: Math.random() < 0.5 ? 0 : 1, // random coin toss
            scores: [0, 0],
            totals: { hits: [0, 0], decoys: [0, 0], misses: [0, 0] },
            wave: null, resolved: {},
            waveHits: 0, waveDecoys: 0, waveMisses: 0, waveGain: 0,
            turnStats: null, lastHit: null, lastMiss: null,
            winner: null, winReason: "", cheated: false, seq: 0,
        };
    }
    function startMatch() {
        clearTimers();
        state.seatMap = shuffledSeats();
        state.starter = Math.random() < 0.5 ? 0 : 1;
        state.level = 1; state.turnNo = 0; state.turnSeat = state.starter;
        state.scores = [0, 0];
        state.totals = { hits: [0, 0], decoys: [0, 0], misses: [0, 0] };
        state.wave = null; state.resolved = {};
        state.waveHits = 0; state.waveDecoys = 0; state.waveMisses = 0; state.waveGain = 0;
        state.turnStats = null; state.lastHit = null; state.lastMiss = null;
        state.winner = null; state.winReason = ""; state.cheated = false;
        state.phase = "toss";
        waveSeenId = -1; lastToastLevel = 0; newBest = false;
        paused = false; autoPaused = false; helpOpen = false; cheatsOpen = false;
        fx.forEach((p) => p.el.remove()); fx.length = 0;
        publish();
        if (online) schedule(() => { if (state && state.phase === "toss") beginTurn(); }, 1700);
    }
    function beginTurn() {
        const fresh = state.turnNo === 0;
        const seed = fresh ? (Math.random() * 0xffffffff) >>> 0 : state.wave.seed; // same wave for both seats
        state.wave = { id: ++waveSeq, seed, level: state.level };
        state.turnSeat = (state.starter + state.level - 1 + state.turnNo) % 2; // starter alternates per level
        state.resolved = {};
        state.waveHits = 0; state.waveDecoys = 0; state.waveMisses = 0; state.waveGain = 0;
        state.turnStats = null; state.lastHit = null; state.lastMiss = null;
        state.phase = "turn";
        publish();
        if (online) {
            const id = state.wave.id;
            schedule(() => { if (state && state.phase === "turn" && state.wave.id === id) endWave("time"); },
                (waveInfo().duration + 0.9) * 1000);
        }
    }
    function endWave(reason) {
        if (!state || state.phase !== "turn") return;
        const s = state.turnSeat;
        state.totals.hits[s] += state.waveHits;
        state.totals.decoys[s] += state.waveDecoys;
        state.totals.misses[s] += state.waveMisses;
        state.turnStats = {
            seat: s, hits: state.waveHits, decoys: state.waveDecoys,
            misses: state.waveMisses, gain: state.waveGain, reason: reason || "time",
        };
        state.phase = "turnResult";
        publish();
        if (online) {
            const id = state.wave.id;
            schedule(() => { if (state && state.phase === "turnResult" && state.wave.id === id) advance(); }, 2400);
        }
    }
    function advance() {
        if (!state || state.phase !== "turnResult") return;
        if (state.turnNo === 0) { state.turnNo = 1; beginTurn(); }
        else finishLevel();
    }
    function finishLevel() {
        const [a, b] = state.scores;
        const cap = state.level >= GAME.MAX_LEVEL;
        if (a >= GAME.TARGET || b >= GAME.TARGET || cap) {
            if (a === b && !cap) { state.level++; state.turnNo = 0; beginTurn(); return; } // sudden death
            const w = a === b ? -1 : a > b ? 0 : 1;
            let reason;
            if (a === b) reason = "Dead even after level " + GAME.MAX_LEVEL + ".";
            else if (cap && a < GAME.TARGET && b < GAME.TARGET) reason = "Level " + GAME.MAX_LEVEL + " finished — highest score wins.";
            else if (a >= GAME.TARGET && b >= GAME.TARGET) reason = "Both passed " + GAME.TARGET + " — higher score takes it.";
            else reason = "First to " + GAME.TARGET + " after a full round.";
            gameOver(w, reason);
        } else { state.level++; state.turnNo = 0; beginTurn(); }
    }
    function gameOver(winner, reason) {
        state.winner = winner;
        state.winReason = reason;
        state.phase = "gameOver";
        if (!online && !state.cheated) {
            const sc = state.scores[humanSeat()];
            const prev = readBest();
            if (sc > prev) { saveBest(sc); newBest = true; }
        }
        publish();
    }

    /* ---------- actions (host-authoritative) ---------- */
    function handleWhack(seat, a) {
        if (state.phase !== "turn" || seat !== state.turnSeat) return;
        const hole = a.hole | 0;
        if (hole < 0 || hole > 8) return;
        const at = clamp(Number(a.at) || 0, 0, waveDuration() + 0.5);
        const info = waveInfo();
        let found = null;
        for (const e of info.events) {
            if (e.hole !== hole || state.resolved[e.id]) continue;
            const s = e.t + GAME.RISE * GAME.HIT_K;
            const en = e.t + GAME.RISE + evUp(e) + GAME.SINK * 0.5;
            if (at >= s && at <= en) { found = e; break; }
        }
        if (found) {
            if (found.kind === "m") {
                state.resolved[found.id] = "hit";
                state.scores[seat] += GAME.HIT;
                state.waveHits++; state.waveGain += GAME.HIT;
                state.lastHit = { hole, kind: "m", eid: found.id, seat, seq: ++state.seq };
            } else if (!online && cheats.shield && seat === humanSeat()) {
                state.resolved[found.id] = "shield";
                state.lastHit = { hole, kind: "s", eid: found.id, seat, seq: ++state.seq };
            } else {
                state.resolved[found.id] = "decoy";
                state.scores[seat] = Math.max(0, state.scores[seat] + GAME.DECOY);
                state.waveDecoys++; state.waveGain += GAME.DECOY;
                state.lastHit = { hole, kind: "d", eid: found.id, seat, seq: ++state.seq };
            }
        } else {
            state.waveMisses++;
            state.lastMiss = { hole, seat, seq: ++state.seq };
            if (state.waveMisses >= GAME.MISS_LIMIT) { endWave("misses"); return; }
        }
        publish();
    }
    function applyCheat(a) {
        if (!state) return;
        if (a.key === "score") {
            state.cheated = true;
            state.scores[humanSeat()] += 100;
            toast("+100 (cheat)");
            publish();
        } else if (a.key === "win") {
            state.cheated = true;
            gameOver(humanSeat(), "Cheat victory 🧪");
        }
    }
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        const seat = state.seatMap[actor] ?? actor;
        switch (action.type) {
            case "start":
            case "rematch":
                if (online && actor !== 0) return; // host only
                if (state.phase === "intro" || state.phase === "gameOver") startMatch();
                break;
            case "next":
                if (online && actor !== 0) return;
                if (state.phase === "turnResult") advance();
                break;
            case "whack":
                handleWhack(seat, action);
                break;
            case "cheat":
                if (!online) applyCheat(action);
                break;
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function tryWhack(hole) {
        if (!state || state.phase !== "turn" || paused || helpOpen || cheatsOpen) return;
        if (state.turnSeat !== mySeat()) return;
        ring(holes[hole].cx, holes[hole].cy - 26, "#d6d3d1"); // instant local feedback
        submitAction({ type: "whack", hole, at: r2(waveElapsed) });
    }

    /* ---------- bot & auto-whack plans (offline) ---------- */
    function buildBotPlan(info) {
        const rng = mulberry32((state.wave.seed ^ 0xb07bee) >>> 0);
        const acc = 0.78 + 0.015 * state.level;
        const plan = [];
        for (const e of info.events) {
            if (e.kind === "m") { if (rng() < acc) plan.push({ at: r2(e.t + GAME.RISE + 0.24 + rng() * 0.3), hole: e.hole }); }
            else if (rng() < 0.07 + 0.012 * state.level) plan.push({ at: r2(e.t + GAME.RISE + 0.3 + rng() * 0.3), hole: e.hole });
        }
        if (rng() < 0.35) { // occasional sloppy empty whack
            const t = 1 + rng() * (info.duration - 2);
            for (const c of shuffledHoles(rng)) { if (!holeBusy(info.events, c, t, 0.2)) { plan.push({ at: r2(t), hole: c }); break; } }
        }
        return plan.sort((a, b) => a.at - b.at);
    }
    function buildAutoPlan(info, fromT) {
        return info.events
            .filter((e) => e.kind === "m")
            .map((e) => ({ at: r2(e.t + GAME.RISE + 0.06), hole: e.hole }))
            .filter((p) => p.at > fromT)
            .sort((a, b) => a.at - b.at);
    }
    function runPlans() {
        if (online || !state || state.phase !== "turn" || paused) return;
        if (state.turnSeat === state.seatMap[1]) {
            while (botPlan.length && botPlan[0].at <= waveElapsed) {
                const p = botPlan.shift();
                applyAction({ type: "whack", hole: p.hole, at: p.at }, 1);
                if (state.phase !== "turn") break;
            }
        } else if (cheats.auto && state.turnSeat === state.seatMap[0]) {
            while (autoPlan.length && autoPlan[0].at <= waveElapsed) {
                const p = autoPlan.shift();
                applyAction({ type: "whack", hole: p.hole, at: p.at }, 0);
                if (state.phase !== "turn") break;
            }
        }
    }

    /* ---------- wave clock ---------- */
    function resetWaveClock() {
        waveSeenId = state.wave.id;
        waveElapsed = 0;
        waveStartPerf = performance.now();
        resolvedLocal = {};
        spritesHidden = false;
        const info = waveInfo();
        botPlan = !online && state.turnSeat === state.seatMap[1] ? buildBotPlan(info) : [];
        autoPlan = !online && cheats.auto && state.turnSeat === state.seatMap[0] ? buildAutoPlan(info, 0) : [];
        if (state.level !== lastToastLevel) {
            if (state.level > 1) toast("Level " + state.level + " — faster moles, more dolls!");
            lastToastLevel = state.level;
        }
        render();
    }

    /* ---------- board drawing ---------- */
    function eventK(e, t, up) {
        if (t < e.t) return 0;
        if (t < e.t + GAME.RISE) return (t - e.t) / GAME.RISE;
        if (t < e.t + GAME.RISE + up) return 1;
        if (t < e.t + GAME.RISE + up + GAME.SINK) return 1 - (t - e.t - GAME.RISE - up) / GAME.SINK;
        return 0;
    }
    const moleY = (h, k) => h.cy + 80 - 74 * k;
    function drawBoard() {
        const info = waveInfo();
        if (!info) return;
        for (let i = 0; i < 9; i++) {
            const h = holes[i];
            let kind = null, k = 0, dizzy = false, shakeX = 0;
            for (const e of info.events) {
                if (e.hole !== i) continue;
                const res = state.resolved[e.id];
                if (res) {
                    if (resolvedLocal[e.id] === undefined) resolvedLocal[e.id] = waveElapsed;
                    const age = waveElapsed - resolvedLocal[e.id];
                    if (age < 0.32) {
                        kind = e.kind; k = 1 - age / 0.32;
                        dizzy = res === "hit";
                        if (res === "decoy") shakeX = Math.sin(age * 45) * 3 * (1 - age / 0.32);
                    }
                    continue;
                }
                const kk = eventK(e, waveElapsed, evUp(e));
                if (kk > 0) { kind = e.kind; k = kk; }
            }
            if (!kind) {
                h.moleG.style.display = "none";
                h.dollG.style.display = "none";
                h.tag.textContent = "";
                continue;
            }
            h.moleT.setAttribute("transform", "translate(" + (h.cx + shakeX).toFixed(1) + " " + moleY(h, k).toFixed(1) + ")");
            h.moleG.style.display = kind === "m" ? "" : "none";
            h.dollG.style.display = kind === "d" ? "" : "none";
            h.faceN.style.display = dizzy ? "none" : "";
            h.faceD.style.display = dizzy ? "" : "none";
            h.tag.textContent = k > 0.25 ? (kind === "m" ? "MOLE" : "DOLL") : "";
            h.tag.setAttribute("class", "wam-tag " + (kind === "m" ? "m" : "d"));
        }
    }
    function hideSprites() {
        for (const h of holes) { h.moleG.style.display = "none"; h.dollG.style.display = "none"; h.tag.textContent = ""; }
        spritesHidden = true;
    }

    /* ---------- render (state -> DOM) ---------- */
    function render() {
        const names = seatNames();
        for (let s = 0; s < 2; s++) {
            $('[data-name="' + s + '"]').textContent = names[s];
            $('[data-you="' + s + '"]').toggleAttribute("hidden", !state || mySeat() !== s);
            $('[data-score="' + s + '"]').textContent = String(state ? state.scores[s] : 0);
            $('[data-bar="' + s + '"]').style.width = (state ? clamp((state.scores[s] / GAME.TARGET) * 100, 0, 100) : 0) + "%";
            $('[data-card="' + s + '"]').classList.toggle("is-active", !!state && state.phase === "turn" && state.turnSeat === s);
        }
        const info = state && state.wave ? waveInfo() : null;
        levelEl.textContent = "L" + (state ? state.level : 1) + "/" + GAME.MAX_LEVEL;
        levelEl.parentElement.title = info ? "Par " + info.par : "";
        if (!state || state.phase !== "turn") timeEl.textContent = "–";
        const pips = pipsEl.children;
        for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("on", !!state && i < state.waveMisses);

        const myTurn = !!state && state.phase === "turn" && state.turnSeat === mySeat();
        boardSvg.classList.toggle("is-waiting", !myTurn);
        boardSvg.classList.toggle("is-reveal", !online && cheats.reveal);
        padEl.toggleAttribute("hidden", !padOn);
        padBtn.classList.toggle("on", padOn);
        padBtn.setAttribute("aria-pressed", padOn ? "true" : "false");
        padEl.querySelectorAll("button").forEach((b) => { b.disabled = !myTurn || paused; });

        cheatsBtn.toggleAttribute("hidden", online);
        pauseBtn.toggleAttribute("hidden", online);
        pauseBtn.disabled = !state || state.phase !== "turn";
        const pauseLabel = pauseBtn.querySelector(".wam-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", (paused ? "Resume" : "Pause") + " (P) — offline only");
        restartBtn.toggleAttribute("hidden", online && !room.isHost);
        const restartLabel = restartBtn.querySelector(".wam-btn-label");
        if (restartLabel) restartLabel.textContent = online ? "Rematch" : "Restart";
        restartBtn.setAttribute("aria-label", online ? "Rematch" : "Restart");
        $('[data-helpnote]').toggleAttribute("hidden", !online);

        /* overlays by phase — help/cheats suppress everything else */
        const phase = state ? state.phase : "intro";
        ov.intro.toggleAttribute("hidden", phase !== "intro" || helpOpen || cheatsOpen);
        ov.toss.toggleAttribute("hidden", phase !== "toss" || helpOpen || cheatsOpen);
        ov.result.toggleAttribute("hidden", phase !== "turnResult" || helpOpen || cheatsOpen);
        ov.over.toggleAttribute("hidden", phase !== "gameOver" || helpOpen || cheatsOpen);
        ov.pause.toggleAttribute("hidden", !(paused && !autoPaused && phase === "turn" && !helpOpen && !cheatsOpen));
        ov.help.toggleAttribute("hidden", !helpOpen);
        ov.cheats.toggleAttribute("hidden", !cheatsOpen || helpOpen);

        /* status */
        let st = "Ready";
        if (!state) st = online ? "Connecting…" : "Ready";
        else if (paused) st = "Paused";
        else if (phase === "toss") st = "Coin toss";
        else if (phase === "turn") st = myTurn ? "Your turn" : names[state.turnSeat] + " is playing";
        else if (phase === "turnResult") st = "Turn result";
        else if (phase === "gameOver") st = state.winner === mySeat() ? "You win!" : "Match over";
        statusEl.textContent = st;
        $('[data-besthud]').textContent = String(readBest());

        /* intro */
        const badge = $("[data-seatbadge]");
        badge.textContent = "You are Player " + (mySeat() + 1) + " · " + names[mySeat()];
        badge.className = "wam-badge seat" + mySeat();
        $('[data-startbtn]').toggleAttribute("hidden", online && !room.isHost);
        $('[data-waitstart]').toggleAttribute("hidden", !(online && !room.isHost));
        const best = readBest();
        $('[data-bestline]').toggleAttribute("hidden", online || best <= 0);
        $('[data-bestline]').textContent = "Best score: " + best;

        /* toss */
        if (phase === "toss") {
            $("[data-tosstitle]").textContent = names[state.starter] + " starts first!";
            $("[data-tosssub]").textContent = "Random seat draw — " + names[0] + " is P1, " + names[1] + " is P2. You are Player " + (mySeat() + 1) + ".";
        }

        /* turn result */
        if (phase === "turnResult" && state.turnStats) {
            const t = state.turnStats;
            $("[data-restitle]").textContent = names[t.seat] + " finished";
            const gainEl = $("[data-resgain]");
            gainEl.textContent = (t.gain >= 0 ? "+" : "") + t.gain;
            gainEl.style.color = t.gain >= 0 ? "var(--green)" : "var(--red)";
            $("[data-resstats]").textContent = "🐹 " + t.hits + " moles · 🧸 " + t.decoys + " dolls hit · 🕳 " + t.misses + " misses" +
                (t.reason === "misses" ? " — turn ended early (miss limit)" : "");
            $("[data-nextbtn]").toggleAttribute("hidden", !isAuthority());
            $("[data-reswait]").toggleAttribute("hidden", isAuthority());
        }

        /* game over */
        if (phase === "gameOver") {
            const w = state.winner;
            $("[data-overtitle]").textContent = w === -1 ? "Draw!" : w === mySeat() ? "You win! 🏆" : names[w] + " wins";
            $("[data-oversub]").textContent = state.winReason;
            const fin = $("[data-overfinal]");
            fin.innerHTML = "";
            for (let s = 0; s < 2; s++) {
                const row = document.createElement("div");
                if (s === w) row.className = "win";
                const nm = document.createElement("span");
                nm.textContent = "P" + (s + 1) + " · " + names[s] + (s === mySeat() ? " (you)" : "");
                const sc = document.createElement("b");
                sc.textContent = String(state.scores[s]);
                row.appendChild(nm); row.appendChild(sc);
                fin.appendChild(row);
            }
            const tt = state.totals;
            $("[data-overstats]").textContent = names.map((n, s) =>
                n + ": " + tt.hits[s] + " hits · " + tt.decoys[s] + " dolls · " + tt.misses[s] + " misses").join("  |  ");
            $("[data-overcheat]").toggleAttribute("hidden", !state.cheated);
            const b = readBest();
            $("[data-overbest]").toggleAttribute("hidden", online);
            $("[data-overbest]").textContent = newBest ? "🎉 New best: " + b : "Best score: " + b;
            $("[data-rematchbtn]").toggleAttribute("hidden", !isAuthority());
            $("[data-overwait]").toggleAttribute("hidden", isAuthority());
        }

        /* cheat toggles */
        $$("[data-cheat]").forEach((b) => {
            const on = cheats[b.dataset.cheat];
            b.setAttribute("aria-pressed", on ? "true" : "false");
            b.querySelector(".st").textContent = on ? "ON" : "OFF";
        });
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- overlay / pause helpers ---------- */
    function setPaused(next) {
        if (next === paused) return;
        paused = next;
        if (!next) {
            /* Resume: geser anchor wall-clock agar waktu tidak loncat saat pause. */
            waveStartPerf = performance.now() - waveElapsed * 1000;
        }
    }
    function freezeForPanel() {
        if (!online && state && state.phase === "turn" && !paused) { paused = true; autoPaused = true; }
    }
    function releasePanelFreeze() {
        if (autoPaused) { setPaused(false); autoPaused = false; }
    }
    function toggleHelp(on) {
        const next = typeof on === "boolean" ? on : !helpOpen;
        if (next === helpOpen) return;
        helpOpen = next;
        if (helpOpen) { cheatsOpen = false; freezeForPanel(); }
        else releasePanelFreeze();
        render();
    }
    function toggleCheats(on) {
        if (online) { toast("Cheats are offline-only"); return; }
        const next = typeof on === "boolean" ? on : !cheatsOpen;
        if (next === cheatsOpen) return;
        cheatsOpen = next;
        if (cheatsOpen) { helpOpen = false; freezeForPanel(); }
        else releasePanelFreeze();
        render();
    }
    function togglePause(on) {
        if (online || !state || state.phase !== "turn" || helpOpen || cheatsOpen) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        setPaused(next);
        autoPaused = false;
        render();
    }
    function closePanels() {
        helpOpen = false; cheatsOpen = false;
        releasePanelFreeze();
        render();
    }
    function contextAction() {
        if (helpOpen || cheatsOpen) { closePanels(); return; }
        if (paused) { togglePause(false); return; }
        if (!state) return;
        if (state.phase === "intro" || state.phase === "gameOver") { if (isAuthority()) submitAction({ type: state.phase === "intro" ? "start" : "rematch" }); }
        else if (state.phase === "turnResult" && isAuthority()) submitAction({ type: "next" });
    }

    /* ---------- main loop ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        const dt = clamp((t - lastT) / 1000 || 0, 0, 0.1);
        lastT = t;
        if (state) {
            if (state.phase !== prevPhase) { prevPhase = state.phase; phaseClock = 0; }
            if (state.phase === "turn" && state.wave) {
                if (state.wave.id !== waveSeenId) resetWaveClock();
                if (!paused) {
                    if (online) waveElapsed = (performance.now() - waveStartPerf) / 1000;
                    else waveElapsed += dt * (cheats.slowmo ? SLOWMO : 1);
                    runPlans();
                    if (!online && waveElapsed >= waveDuration() + 0.35) endWave("time");
                }
                drawBoard();
                const rem = Math.max(0, waveDuration() - waveElapsed);
                timeEl.textContent = String(Math.ceil(rem));
                timeEl.classList.toggle("is-low", rem <= 3);
            } else {
                if (!spritesHidden) hideSprites();
                timeEl.classList.remove("is-low");
                if (!paused) phaseClock += dt;
                if (!online && !paused) { // offline transitions are clock-driven (pausable)
                    if (state.phase === "toss" && phaseClock >= 1.6) beginTurn();
                    else if (state.phase === "turnResult" && phaseClock >= 2.4) advance();
                }
            }
            processNetFx();
        }
        updateFx(dt);
    }

    /* ---------- input: mouse / touch ---------- */
    function handlePointer(event) {
        const zone = event.target.closest ? event.target.closest("[data-hole],[data-pad]") : null;
        if (!zone) return;
        event.preventDefault();
        tryWhack(+(zone.dataset.hole ?? zone.dataset.pad));
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { if (isAuthority() && state) startMatch(); return; }
        if (t.closest("[data-pad-toggle]")) { padOn = !padOn; render(); return; }
        const cheatBtn = t.closest("[data-cheat]");
        if (cheatBtn) {
            if (online) return;
            const key = cheatBtn.dataset.cheat;
            cheats[key] = !cheats[key];
            if (cheats[key] && state) state.cheated = true;
            if (key === "auto" && state && state.phase === "turn" && state.turnSeat === state.seatMap[0]) {
                autoPlan = cheats.auto ? buildAutoPlan(waveInfo(), waveElapsed + 0.05) : [];
            }
            toast(cheats[key] ? "Cheat on: " + key : "Cheat off: " + key);
            publish();
            return;
        }
        const cmdBtn = t.closest("[data-cheatcmd]");
        if (cmdBtn) {
            if (online) return;
            const cmd = cmdBtn.dataset.cheatcmd;
            if (cmd === "reset") {
                for (const k in cheats) cheats[k] = false;
                autoPlan = [];
                toast("Cheats reset");
                publish();
            } else submitAction({ type: "cheat", key: cmd });
            return;
        }
        const actBtn = t.closest("[data-act]");
        if (!actBtn) return;
        switch (actBtn.dataset.act) {
            case "start": case "rematch": if (isAuthority()) submitAction({ type: actBtn.dataset.act }); break;
            case "next": if (isAuthority()) submitAction({ type: "next" }); break;
        }
    }

    /* ---------- input: keyboard ---------- */
    const KEYMAP = {
        Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8,
        Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
    };
    function handleKey(event) {
        if (!root.isConnected) return;
        const code = event.code;
        const inButton = event.target && event.target.closest && event.target.closest("button");
        /* prioritas: help -> cheats -> pause/escape -> restart -> aksi game */
        if (code === "KeyH") { event.preventDefault(); toggleHelp(); return; }
        if (code === "KeyC") { event.preventDefault(); toggleCheats(); return; }
        if (code === "KeyP" || code === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else togglePause();
            event.preventDefault();
            return;
        }
        if (code === "KeyR") {
            if (isAuthority() && state) { event.preventDefault(); startMatch(); }
            return;
        }
        if (code === "Space" || code === "Enter") {
            if (inButton) return; // biarkan klik native tombol bekerja
            event.preventDefault();
            contextAction();
            return;
        }
        if (helpOpen || cheatsOpen) return;
        if (code in KEYMAP) {
            if (event.repeat) return;
            event.preventDefault();
            tryWhack(KEYMAP[code]);
        }
    }

    root.addEventListener("pointerdown", handlePointer);
    root.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);

    /* ---------- wiring per template ---------- */
    if (online) {
        const un1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof un1 === "function") subs.push(un1);
        if (room.isHost) {
            state = initialState();
            publish();
            const un2 = room.onAction((action) => applyAction(action, 1)); // guest actions
            if (typeof un2 === "function") subs.push(un2);
        } else {
            const un2 = room.onState((nextState) => { state = nextState; render(); });
            if (typeof un2 === "function") subs.push(un2);
            render(); // "Connecting…" until first state arrives
        }
    } else {
        state = initialState();
        render();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            cancelAnimationFrame(raf);
            clearTimers();
            if (toastTimer) clearTimeout(toastTimer);
            root.removeEventListener("pointerdown", handlePointer);
            root.removeEventListener("click", handleClick);
            window.removeEventListener("keydown", handleKey);
            subs.forEach((un) => { try { un(); } catch { /* ignore */ } });
            fx.forEach((p) => p.el.remove());
            fx.length = 0;
        },
    };
}