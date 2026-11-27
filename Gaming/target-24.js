/* ==== GAME: target-24.js ==== */

/* =============================================================== */
/* Target 24 - trivia game                                          */
/* Combine four numbers with + - x / to make exactly 24. Every      */
/* puzzle is verified solvable by an exhaustive solver. Merge       */
/* tiles step by step; undo anytime. 5 puzzles, 100 seconds each.   */
/* Layout: single HUD bar + fill-height board + overlays/help.      */
/* =============================================================== */
import { iconSVG } from "../JS/icons.js";

const ROUNDS = 5,
    PASS = 3,
    TIME_LIMIT = 100;
const EPS = 1e-6;

/* ---------- solver: can nums (array of numbers) reach target? ---------- */
function solvable(nums, target) {
    if (nums.length === 1) return Math.abs(nums[0] - target) < EPS;
    for (let i = 0; i < nums.length; i++) {
        for (let j = 0; j < nums.length; j++) {
            if (i === j) continue;
            const rest = [];
            for (let k = 0; k < nums.length; k++)
                if (k !== i && k !== j) rest.push(nums[k]);
            const a = nums[i],
                b = nums[j];
            const cands = [a + b, a - b, a * b];
            if (Math.abs(b) > EPS) cands.push(a / b);
            for (const c of cands) {
                if (solvable(rest.concat([c]), target)) return true;
            }
        }
    }
    return false;
}
/* solver that also returns a readable expression (used by the reveal cheat) */
function solveExpr(nums, target) {
    function go(items) {
        if (items.length === 1)
            return Math.abs(items[0].v - target) < EPS ? items[0].s : "";
        for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < items.length; j++) {
                if (i === j) continue;
                const a = items[i],
                    b = items[j];
                const rest = items.filter((_, k) => k !== i && k !== j);
                const cands = [
                    [a.v + b.v, "+"],
                    [a.v - b.v, "-"],
                    [a.v * b.v, "x"],
                ];
                if (Math.abs(b.v) > EPS) cands.push([a.v / b.v, "/"]);
                for (const [v, op] of cands) {
                    const expr = go(
                        rest.concat([
                            { v: v, s: "(" + a.s + " " + op + " " + b.s + ")" },
                        ]),
                    );
                    if (expr) return expr;
                }
            }
        }
        return "";
    }
    return go(nums.map((n) => ({ v: n, s: fmt(n) })));
}
/* generate 4 numbers 1..13 (with repeats) that can reach 24 */
function makePuzzle() {
    for (let tries = 0; tries < 200; tries++) {
        const nums = [];
        for (let i = 0; i < 4; i++)
            nums.push(1 + Math.floor(Math.random() * 13));
        if (solvable(nums, 24)) return nums;
    }
    return [3, 3, 8, 8]; /* known-solvable fallback (8/(3-8/3)) */
}
function applyOp(a, b, op) {
    switch (op) {
        case "+":
            return a + b;
        case "-":
            return a - b;
        case "x":
            return a * b;
        default:
            return Math.abs(b) > EPS ? a / b : NaN;
    }
}
function fmt(v) {
    if (Math.abs(v - Math.round(v)) < EPS) return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
}
export const TEST = {
    ROUNDS,
    PASS,
    TIME_LIMIT,
    solvable,
    solveExpr,
    makePuzzle,
    applyOp,
    fmt,
};

export const META = {
    id: "target-24",
    name: "Target 24",
    category: "trivia",
    catLabel: "Trivia",
    desc: "Four numbers, four operations - build an expression worth 24.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="14" width="12" height="20" rx="4"/><rect x="30" y="14" width="12" height="20" rx="4"/><path d="M9 20h6m-3-3v6"/><path d="M33 22h6m-6 6h6"/><path d="M24 10v28"/><path d="M18 24h12"/></svg>',
    bg: ["#99f6e4", "#14b8a6"],
};

export function mount(root, context = {}) {
    const { onExit = () => {} } = context;

    root.innerHTML = `
<style>
.t24-app{--t24-line:#ffffff24;--t24-ink:#e5e7eb;--t24-mut:#cbd5e1;--t24-acc:#14b8a6;--t24-panel:#182148;--t24-ok:#34d399;--t24-warn:#fbbf24;--t24-bad:#f87171;font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.t24-app [hidden]{display:none!important}
.t24-app button:focus-visible{outline:2px solid #2dd4bf;outline-offset:2px}
.t24-app .t24-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.t24-app .t24-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--t24-line);border-radius:999px;background:var(--t24-panel);color:var(--t24-mut);white-space:nowrap}
.t24-app .t24-chip b{color:#fff;font-weight:700;font-variant-numeric:tabular-nums}
.t24-app .t24-timebar{display:inline-block;width:54px;height:4px;border-radius:2px;background:var(--t24-line);overflow:hidden}
.t24-app .t24-timebar i{display:block;height:100%;width:100%;background:var(--t24-ok);transition:width .2s linear,background .2s}
.t24-app .t24-timebar i.warn{background:var(--t24-warn)}
.t24-app .t24-timebar i.danger{background:var(--t24-bad)}
.t24-app .t24-spacer{flex:1 1 auto}
.t24-app .t24-btn{border:1px solid var(--t24-line);border-radius:9px;background:var(--t24-panel);color:var(--t24-ink);padding:9px 14px;min-height:38px;font:700 11px/1 ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
.t24-app .t24-btn:hover{border-color:var(--t24-acc);color:#fff}
.t24-app .t24-btn.primary{background:#0f766e;border-color:#14b8a6;color:#fff}
.t24-app .t24-btn.primary:hover{opacity:.92}
.t24-app .t24-btn.on{border-color:var(--t24-acc);color:#fff}
.t24-app .t24-btn:disabled{opacity:.45;cursor:not-allowed}
.t24-app .t24-icon-btn{display:inline-flex;align-items:center;gap:6px}
.t24-app .t24-icon-btn svg{flex:none;display:block}
.t24-app .t24-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:14px;border:1px solid var(--t24-line);border-radius:12px;background:linear-gradient(160deg,#0f172a,#1e293b);overflow:hidden}
.t24-app .t24-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;max-width:560px;min-width:0;max-height:100%}
.t24-app .t24-goal{display:flex;align-items:baseline;justify-content:center;gap:8px;flex-wrap:wrap;text-align:center}
.t24-app .t24-big{font-size:clamp(36px,10vw,44px);font-weight:800;color:#34d399;line-height:1}
.t24-app .t24-sub{color:#8b93a7;font-size:13px;font-weight:700;line-height:1.4}
.t24-app .t24-tiles{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;min-height:80px;width:100%}
.t24-app .t24-tile{flex:0 1 88px;min-width:72px;height:88px;border-radius:12px;border:1px solid #ffffff24;background:#182148;color:#fff;font-size:clamp(24px,7vw,29px);font-weight:800;padding:8px 12px;transition:transform .12s,border-color .15s,background .15s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.t24-app .t24-tile small{font-size:9.5px;font-weight:700;color:#8b93a7;letter-spacing:.3px;max-width:86px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t24-app .t24-tile:hover{transform:translateY(-2px)}
.t24-app .t24-tile.sel{border-color:#14b8a6;background:#134e4a}
.t24-app .t24-tile.merged{border-color:#14b8a666}
.t24-app .t24-ops{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.t24-app .t24-op{width:56px;height:48px;border-radius:10px;border:1px solid #ffffff24;background:#182148;color:#e5e7eb;font-size:22px;font-weight:800;padding:0;transition:transform .1s,border-color .15s;cursor:pointer}
.t24-app .t24-op:hover{border-color:#14b8a6;transform:translateY(-2px)}
.t24-app .t24-op.sel{border-color:#14b8a6;background:#134e4a}
.t24-app .t24-expr{min-height:20px;font-size:14px;line-height:1.4;color:#94a3b8;font-weight:700;text-align:center;max-width:520px;overflow-wrap:anywhere}
.t24-app .t24-feedback{min-height:22px;font-weight:800;font-size:15px;line-height:1.4;text-align:center}
.t24-app .t24-feedback.good{color:#34d399}
.t24-app .t24-feedback.bad{color:#f87171}
.t24-app .t24-ov{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:14px;background:rgba(15,23,42,.92)}
.t24-app .t24-card{display:flex;flex-direction:column;width:min(560px,100%);max-height:100%;overflow:hidden;padding:16px;border:1px solid var(--t24-line);border-radius:14px;background:var(--t24-panel);box-shadow:0 10px 30px rgba(0,0,0,.3)}
.t24-app .t24-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:12px}
.t24-app .t24-head h3{margin:0;font-size:14px;font-weight:800;color:#fff}
.t24-app .t24-head h3.mgp-win{color:var(--t24-ok)}
.t24-app .t24-head h3.mgp-lose{color:var(--t24-bad)}
.t24-app .t24-body,.t24-app .t24-cheats,.t24-app .t24-help{flex:1 1 auto;min-height:0;overflow:auto;font-size:12px;color:var(--t24-mut)}
.t24-app .t24-body p{margin:0 0 10px}
.t24-app .t24-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}
.t24-app .t24-stat{border:1px solid var(--t24-line);border-radius:10px;padding:10px;text-align:center}
.t24-app .t24-stat u{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;color:var(--t24-mut)}
.t24-app .t24-stat b{display:block;margin-top:5px;font-size:18px;color:#fff;font-variant-numeric:tabular-nums}
.t24-app .t24-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:14px}
.t24-app .t24-note{font-size:10px;color:var(--t24-mut)}
.t24-app .t24-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.t24-app .t24-help b{display:block;margin-bottom:6px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--t24-mut)}
.t24-app .t24-help ul{margin:0 0 12px;padding-left:16px;font-size:11px;line-height:1.7;color:var(--t24-mut)}
.t24-app .t24-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--t24-line);border-bottom-width:2px;border-radius:5px;background:#0f172a;color:#e5e7eb;font:inherit}
.t24-app .t24-cheats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;align-content:start}
.t24-app .t24-cheats .t24-btn{width:100%;font-size:10px}
@media (prefers-reduced-motion:reduce){.t24-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}

/* --- layout redesign overrides (keep last) --- */
.t24-app.game-fill > .t24-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (pointer:coarse){.t24-app button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.t24-app.game-fill > .t24-board:not(:has(.t24-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto}
.t24-app.game-fill > .t24-board:has(.t24-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.t24-app .t24-hud{gap:5px}
.t24-app .t24-hud .t24-chip{padding:4px 6px;font-size:9px}
.t24-app .t24-hud .t24-chip[data-hud="status"]{display:none}
.t24-app .t24-hud .t24-timebar{width:40px}
.t24-app .t24-hud .t24-btn{min-height:32px;padding:5px 9px;font-size:9px}
.t24-app .t24-hud .t24-btn-label,
.t24-app .t24-spacer{display:none}
.t24-app .t24-ov{padding:8px}
.t24-app .t24-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.t24-app .t24-body,.t24-app .t24-cheats,.t24-app .t24-help{scrollbar-width:none}
.t24-app .t24-body::-webkit-scrollbar,
.t24-app .t24-cheats::-webkit-scrollbar,
.t24-app .t24-help::-webkit-scrollbar{display:none}
.t24-app .t24-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--t24-line)}
.t24-app .t24-note{display:none}
.t24-app .t24-wrap{gap:8px}
.t24-app .t24-goal{gap:6px}
.t24-app .t24-big{font-size:34px}
.t24-app .t24-sub{font-size:11px}
.t24-app .t24-tiles{gap:6px;min-height:76px}
.t24-app .t24-tile{min-width:68px;height:76px}
.t24-app .t24-ops{gap:6px}
.t24-app .t24-expr{font-size:12px}
.t24-app .t24-feedback{font-size:13.5px}
}
</style>
<div class="game-app t24-app game-fill" data-t24>
  <div class="t24-hud">
    <span class="t24-chip t24-status"><i class="game-status-dot"></i><span data-hud="status">Ready</span></span>
    <span class="t24-chip">PUZZLE <b data-hud="round">1</b>/${ROUNDS}</span>
    <span class="t24-chip">SOLVED <b data-hud="score">0</b></span>
    <span class="t24-chip">TIME <span class="t24-timebar"><i data-hud="time"></i></span><b data-hud="secs">${TIME_LIMIT}</b>s</span>
    <span class="t24-spacer"></span>
    <button class="t24-btn" type="button" data-act="undo" title="Undo (U)">Undo</button>
    <button class="t24-btn" type="button" data-act="skip" title="Skip puzzle">Skip</button>
    <button class="t24-btn" type="button" data-act="reset" title="Reset puzzle">Reset</button>
    <button class="t24-btn t24-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="t24-btn-label">Help</span></button>
    <button class="t24-btn t24-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="t24-btn-label">Cheats</span></button>
    <button class="t24-btn t24-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="t24-btn-label">Pause</span></button>
    <button class="t24-btn t24-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="t24-btn-label">Restart</span></button>
    <button class="t24-btn t24-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="t24-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel t24-board" data-board>
    <div class="t24-wrap">
      <div class="t24-goal"><span class="t24-big">24</span><span class="t24-sub">combine all four numbers</span></div>
      <div class="t24-tiles" data-el="tiles"></div>
      <div class="t24-ops" data-el="ops">
        <button class="t24-op" data-op="+">+</button>
        <button class="t24-op" data-op="-">-</button>
        <button class="t24-op" data-op="x">x</button>
        <button class="t24-op" data-op="/">/</button>
      </div>
      <div class="t24-expr" data-el="expr"></div>
      <div class="t24-feedback" data-el="fb"></div>
    </div>
    <div class="t24-ov" data-ov="ready">
      <div class="t24-card">
        <div class="t24-head"><h3>Target 24</h3><span class="t24-note">Number puzzle</span></div>
        <div class="t24-body">
          <p>Tap a number, tap an operation, tap a second number - they merge into the result. Keep merging until one value remains: exactly 24. Every puzzle is solvable, undo is free, and you get ${TIME_LIMIT} seconds each. Solve ${PASS} of ${ROUNDS} to win.</p>
          <div class="t24-stats">
            <div class="t24-stat"><u>Puzzles</u><b>${ROUNDS}</b></div>
            <div class="t24-stat"><u>Pass mark</u><b>${PASS}</b></div>
            <div class="t24-stat"><u>Per puzzle</u><b>${TIME_LIMIT}s</b></div>
          </div>
        </div>
        <div class="t24-foot"><span class="t24-note">Enter / Space to start</span><button class="t24-btn primary" type="button" data-launch>Start game</button></div>
      </div>
    </div>
    <div class="t24-ov" data-ov="over" hidden>
      <div class="t24-card">
        <div class="t24-head"><h3 class="mgp-win" data-ov="title">Game over</h3></div>
        <div class="t24-body">
          <div class="t24-stats">
            <div class="t24-stat"><u>Solved</u><b data-ov="score">0</b></div>
            <div class="t24-stat"><u>Pass mark</u><b>${PASS}</b></div>
            <div class="t24-stat"><u>Puzzles</u><b>${ROUNDS}</b></div>
          </div>
          <p data-ov="reason"></p>
        </div>
        <div class="t24-foot"><span class="t24-note">R to restart</span><button class="t24-btn primary" type="button" data-retry>Play again</button></div>
      </div>
    </div>
    <div class="t24-ov" data-ov="pause" hidden>
      <div class="t24-card">
        <div class="t24-head"><h3>Paused</h3></div>
        <div class="t24-body"><p>The puzzle timer is frozen. It resumes exactly where it stopped.</p></div>
        <div class="t24-foot"><span class="t24-note">P / Esc to resume</span><button class="t24-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="t24-ov" data-ov="cheats" hidden>
      <div class="t24-card">
        <div class="t24-head"><h3>Cheats</h3><button class="t24-btn" type="button" data-cheats-close aria-label="Close cheats">×</button></div>
        <div class="t24-cheats">
          <button class="t24-btn" type="button" data-cheat="solve">Solve puzzle</button>
          <button class="t24-btn" type="button" data-cheat="timer">Reset timer</button>
          <button class="t24-btn" type="button" data-cheat="solved">+1 solved</button>
          <button class="t24-btn" type="button" data-cheat="reveal">Reveal solution</button>
          <button class="t24-btn" type="button" data-cheat="pass">Instant pass</button>
        </div>
        <div class="t24-foot"><span class="t24-note">Press C to toggle this panel</span><button class="t24-btn" type="button" data-cheats-close>Done</button></div>
      </div>
    </div>
    <div class="t24-ov" data-ov="help" hidden>
      <div class="t24-card">
        <div class="t24-head"><h3>How to play</h3><button class="t24-btn" type="button" data-help-close aria-label="Close help">×</button></div>
        <div class="t24-body t24-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a tile, an operator, then a second tile to merge them.</li>
              <li>Keys <span class="t24-kbd">1</span>-<span class="t24-kbd">4</span> pick tiles; <span class="t24-kbd">+</span> <span class="t24-kbd">-</span> <span class="t24-kbd">x</span> <span class="t24-kbd">/</span> pick operators; <span class="t24-kbd">U</span> undoes.</li>
              <li><span class="t24-kbd">H</span> help · <span class="t24-kbd">C</span> cheats · <span class="t24-kbd">P</span>/<span class="t24-kbd">Esc</span> pause · <span class="t24-kbd">R</span> restart. <span class="t24-kbd">Enter</span> starts.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap tiles and operators; the HUD holds Undo, Skip, Reset and all system controls.</li>
              <li>Pause freezes the timer; it resumes from the same second.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>${ROUNDS} puzzles, ${TIME_LIMIT} seconds each. Solve ${PASS} to win.</li>
              <li>Combine all four numbers into one value of exactly 24.</li>
              <li>Fractions are allowed; division by zero is blocked.</li>
              <li>Every puzzle has a solution - Undo is always free.</li>
            </ul>
            <div class="t24-foot"><span class="t24-note">Press H to reopen this guide</span><button class="t24-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const app = $("[data-t24]");
    const tilesEl = $('[data-el="tiles"]'),
        opsEl = $('[data-el="ops"]'),
        exprEl = $('[data-el="expr"]'),
        fbEl = $('[data-el="fb"]');
    const hud = {
        status: $('[data-hud="status"]'),
        round: $('[data-hud="round"]'),
        solved: $('[data-hud="score"]'),
        secs: $('[data-hud="secs"]'),
        time: $('[data-hud="time"]'),
    };
    const ov = {
        ready: $('[data-ov="ready"]'),
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheats"]'),
        help: $('[data-ov="help"]'),
    };
    const out = {
        title: $('[data-ov="title"]'),
        reason: $('[data-ov="reason"]'),
        score: $('[data-ov="score"]'),
    };
    const pauseBtn = $("[data-pause]");
    const pauseIcon = $("[data-pause-icon]");
    const pauseLabel = pauseBtn.querySelector(".t24-btn-label");
    const cheatsBtn = $("[data-cheats]");

    /* ---------------- state ---------------- */
    let destroyed = false;
    let started = false,
        over = false,
        paused = false;
    let round = 1,
        solved = 0,
        tLeft = TIME_LIMIT,
        lock = false;
    let tiles = [],
        history = [],
        selTile = -1,
        selOp = null;
    let helpOpen = false,
        cheatsOpen = false;

    /* first-run internal help (global dialog stays closed via game-info) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("target-24-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("target-24-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------------- pause-aware timers ---------------- */
    const timers = new Set();
    let freezeAt = 0;
    function schedule(ms, fn) {
        const rec = { fn, due: (freezeAt || Date.now()) + ms, id: 0 };
        rec.arm = () => {
            if (rec.id) clearTimeout(rec.id);
            rec.id = setTimeout(() => {
                rec.id = 0;
                if (freezeAt) return;
                timers.delete(rec);
                if (!destroyed) fn();
            }, Math.max(0, rec.due - Date.now()));
        };
        timers.add(rec);
        if (!freezeAt) rec.arm();
        return rec;
    }
    function clearTimers() {
        for (const rec of timers) {
            if (rec.id) clearTimeout(rec.id);
            rec.id = 0;
        }
        timers.clear();
    }
    function setFrozen(on) {
        if (on) {
            if (freezeAt) return;
            freezeAt = Date.now();
            for (const rec of timers) {
                if (rec.id) clearTimeout(rec.id);
                rec.id = 0;
            }
        } else {
            if (!freezeAt) return;
            const delta = Date.now() - freezeAt;
            for (const rec of timers) rec.due += delta;
            freezeAt = 0;
            for (const rec of timers) rec.arm();
        }
    }
    function refreshFreeze() {
        setFrozen(paused || helpOpen || cheatsOpen);
    }

    function updateHud() {
        hud.round.textContent = String(round);
        hud.solved.textContent = String(solved);
        hud.secs.textContent = String(Math.max(0, tLeft));
        hud.time.style.width = Math.max(0, (tLeft / TIME_LIMIT) * 100) + "%";
        hud.time.className =
            tLeft <= 15 ? "danger" : tLeft <= 35 ? "warn" : "";
    }
    function clearSel() {
        selTile = -1;
        selOp = null;
        Array.from(tilesEl.children).forEach((t) => t.classList.remove("sel"));
        Array.from(opsEl.children).forEach((o) => o.classList.remove("sel"));
    }

    /* ---------------- render ---------------- */
    function renderTiles(freshIdx) {
        let html = "";
        tiles.forEach((t, i) => {
            html +=
                '<button class="t24-tile' +
                (i === freshIdx ? " merged" : "") +
                '" data-i="' +
                i +
                '">' +
                fmt(t.v) +
                (t.expr ? "<small>" + t.expr + "</small>" : "") +
                "</button>";
        });
        tilesEl.innerHTML = html;
        exprEl.textContent =
            tiles.length === 1
                ? "Result: " + fmt(tiles[0].v)
                : "Values left: " + tiles.map((t) => fmt(t.v)).join("   ");
    }

    function syncUI() {
        hud.status.textContent = over
            ? (solved >= PASS ? "Passed" : "Failed")
            : paused ? "Paused" : !started ? "Ready" : "Playing";
        ov.ready.hidden = started || over || cheatsOpen || helpOpen;
        ov.over.hidden = !over || cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        cheatsBtn.classList.toggle("on", cheatsOpen);
        pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
    }

    /* ---------------- puzzle flow ---------------- */
    function tick() {
        if (destroyed || !started || over || paused || helpOpen || cheatsOpen) return;
        tLeft--;
        updateHud();
        if (tLeft <= 0) missPuzzle("Out of time");
        else schedule(1000, tick);
    }
    function startRound() {
        if (over || destroyed) return;
        lock = false;
        const nums = makePuzzle();
        tiles = nums.map((n) => ({ v: n, expr: "" }));
        history = [];
        clearSel();
        renderTiles();
        fbEl.textContent = "";
        fbEl.className = "t24-feedback";
        tLeft = TIME_LIMIT;
        updateHud();
        clearTimers();
        if (!freezeAt) schedule(1000, tick);
        syncUI();
    }

    /* selection state machine: both "tile op tile" and "op tile tile" work.
       selTile = left operand (or -1), selOp = chosen operator (or null).
       When both are set, the next different tile tapped becomes the right
       operand and triggers the merge. */
    function tapTile(i) {
        if (lock || over || !started || paused || helpOpen || cheatsOpen) return;
        if (selOp === null) {
            /* no operator yet: pick / toggle the first operand */
            if (selTile === i) {
                clearSel();
                return;
            }
            clearSel();
            selTile = i;
            tilesEl.children[i].classList.add("sel");
        } else if (selTile === -1) {
            /* operator first: this tile becomes the left operand */
            selTile = i;
            tilesEl.children[i].classList.add("sel");
        } else if (selTile === i) {
            clearSel(); /* toggle off, keep nothing */
        } else {
            merge(selTile, i, selOp); /* right operand -> merge */
        }
    }
    function tapOp(op) {
        if (lock || over || !started || paused || helpOpen || cheatsOpen) return;
        if (selTile === -1) {
            /* operator chosen first - wait for left operand */
            selOp = op;
        } else {
            /* left operand chosen: store operator, wait for right tile */
            selOp = op;
        }
        Array.from(opsEl.children).forEach((o) =>
            o.classList.toggle("sel", o.dataset.op === op),
        );
    }

    function merge(i, j, op) {
        const a = tiles[i],
            b = tiles[j];
        if (op === "/" && Math.abs(b.v) < EPS) {
            fbEl.textContent = "Cannot divide by zero.";
            fbEl.className = "t24-feedback bad";
            clearSel();
            return;
        }
        history.push(tiles.map((t) => ({ v: t.v, expr: t.expr })));
        const v = applyOp(a.v, b.v, op);
        const expr =
            (a.expr || fmt(a.v)) + " " + op + " " + (b.expr || fmt(b.v));
        const rest = tiles.filter((_, k) => k !== i && k !== j);
        tiles = rest.concat([{ v: v, expr: "(" + expr + ")" }]);
        clearSel();
        renderTiles(tiles.length - 1);
        if (tiles.length === 1) resolvePuzzle();
    }

    function resolvePuzzle() {
        lock = true;
        clearTimers();
        const val = tiles[0].v;
        if (Math.abs(val - 24) < EPS) {
            solved++;
            fbEl.textContent = "24! " + tiles[0].expr + " = 24";
            fbEl.className = "t24-feedback good";
            updateHud();
            nextPuzzle(1400);
        } else {
            fbEl.textContent =
                "That makes " + fmt(val) + ", not 24. Undo and retry!";
            fbEl.className = "t24-feedback bad";
            /* allow undo to keep trying while timer would have stopped - restart it */
            lock = false;
            tLeft = Math.max(tLeft, 20); /* small mercy window */
            updateHud();
            schedule(1000, tick);
        }
        syncUI();
    }

    function missPuzzle(reason) {
        lock = true;
        clearTimers();
        fbEl.textContent = reason + " - puzzle missed.";
        fbEl.className = "t24-feedback bad";
        nextPuzzle(1300);
        syncUI();
    }
    function nextPuzzle(delay) {
        const last = round >= ROUNDS;
        schedule(delay, () => {
            if (destroyed || over) return;
            if (last) finish();
            else {
                round++;
                startRound();
            }
        });
    }

    function undo() {
        if (lock && fbEl.className.indexOf("bad") === -1) return;
        if (!history.length || over || !started || paused || helpOpen || cheatsOpen) return;
        tiles = history.pop();
        lock = false;
        clearSel();
        renderTiles();
        fbEl.textContent = "";
        fbEl.className = "t24-feedback";
    }
    function resetPuzzle() {
        if (over || !started || paused || helpOpen || cheatsOpen) return;
        if (!history.length) return;
        tiles = history[0].map((t) => ({ v: t.v, expr: t.expr }));
        history = [];
        lock = false;
        clearSel();
        renderTiles();
        fbEl.textContent = "";
        fbEl.className = "t24-feedback";
    }
    function skipPuzzle() {
        if (over || !started || paused || helpOpen || cheatsOpen) return;
        missPuzzle("Skipped");
    }

    function finish() {
        over = true;
        paused = false;
        clearTimers();
        freezeAt = 0;
        out.score.textContent = String(solved);
        if (solved >= PASS) {
            out.title.textContent = "Number cruncher!";
            out.title.className = "mgp-win";
            out.reason.textContent =
                "You built 24 in " +
                solved +
                " of " +
                ROUNDS +
                " puzzles. Arithmetic ace!";
        } else {
            out.title.textContent = "Target missed";
            out.title.className = "mgp-lose";
            out.reason.textContent =
                "You solved " +
                solved +
                " of " +
                ROUNDS +
                " puzzles - goal was " +
                PASS +
                ". Remember: fractions are allowed!";
        }
        syncUI();
    }

    function startGame() {
        if (destroyed) return;
        helpOpen = false;
        cheatsOpen = false;
        paused = false;
        freezeAt = 0;
        clearTimers();
        round = 1;
        solved = 0;
        tLeft = TIME_LIMIT;
        over = false;
        started = true;
        lock = false;
        tilesEl.innerHTML = "";
        exprEl.textContent = "";
        fbEl.textContent = "";
        fbEl.className = "t24-feedback";
        updateHud();
        startRound();
    }

    /* ---------------- overlays ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        refreshFreeze();
        syncUI();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        refreshFreeze();
        syncUI();
    }
    function togglePause(on) {
        if (!started || over) return;
        paused = typeof on === "boolean" ? on : !paused;
        refreshFreeze();
        syncUI();
    }
    function runCheat(key) {
        if (key === "solved") {
            solved = Math.min(ROUNDS, solved + 1);
            updateHud();
            syncUI();
            return;
        }
        if (key === "timer") {
            tLeft = TIME_LIMIT;
            updateHud();
            syncUI();
            return;
        }
        if (key === "reveal") {
            if (!started || over) return;
            const expr = solveExpr(tiles.map((t) => t.v), 24);
            fbEl.textContent = expr ? "One solution: " + expr : "No solution found.";
            fbEl.className = "t24-feedback good";
            return;
        }
        if (key === "pass") {
            if (!started || over) return;
            solved = Math.max(solved, PASS);
            cheatsOpen = false;
            refreshFreeze();
            finish();
            return;
        }
        if (key === "solve") {
            if (!started || over || lock) return;
            tiles = [{ v: 24, expr: "24 (cheat)" }];
            history = [];
            renderTiles(0);
            cheatsOpen = false;
            refreshFreeze();
            resolvePuzzle();
        }
    }

    /* ---------------- events ---------------- */
    tilesEl.addEventListener("pointerdown", (e) => {
        const el = e.target.closest ? e.target.closest(".t24-tile") : null;
        if (el) tapTile(Number(el.dataset.i));
    });
    opsEl.addEventListener("pointerdown", (e) => {
        const el = e.target.closest ? e.target.closest(".t24-op") : null;
        if (el) tapOp(el.dataset.op);
    });
    app.addEventListener("click", (e) => {
        if (destroyed) return;
        const t = e.target.closest ? e.target : null;
        if (!t) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { startGame(); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-launch]") || t.closest("[data-retry]")) { startGame(); return; }
        const cheat = t.closest("[data-cheat]");
        if (cheat) { runCheat(cheat.dataset.cheat); return; }
        const act = t.closest("[data-act]");
        if (act) {
            if (act.dataset.act === "undo") undo();
            else if (act.dataset.act === "skip") skipPuzzle();
            else if (act.dataset.act === "reset") resetPuzzle();
        }
    });
    const onKey = (e) => {
        if (destroyed) return;
        const k = e.code || "";
        const key = String(e.key || "").toLowerCase();
        /* priority: help -> cheats -> pause / escape -> game actions */
        if (k === "KeyH" || key === "h") {
            e.preventDefault();
            toggleHelp();
            return;
        }
        if (k === "KeyC" || key === "c") {
            e.preventDefault();
            if (!helpOpen) toggleCheats();
            return;
        }
        if (k === "KeyP" || key === "p") {
            e.preventDefault();
            if (!helpOpen && !cheatsOpen) togglePause();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else togglePause();
            return;
        }
        if (k === "KeyR" || key === "r") {
            if (!helpOpen && !cheatsOpen) {
                e.preventDefault();
                startGame();
            }
            return;
        }
        const isButton = e.target && e.target.tagName === "BUTTON";
        if (e.key === "Enter" || e.key === " ") {
            if (isButton) return;
            e.preventDefault();
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            else if (!started || over) startGame();
            return;
        }
        if (helpOpen || cheatsOpen || paused || !started || over) return;
        if (e.key >= "1" && e.key <= "4") {
            e.preventDefault();
            const i = Number(e.key) - 1;
            if (i < tiles.length) tapTile(i);
        } else if (
            e.key === "+" ||
            e.key === "-" ||
            e.key === "x" ||
            e.key === "*" ||
            e.key === "/"
        ) {
            e.preventDefault();
            tapOp(e.key === "*" ? "x" : e.key);
        } else if (k === "KeyU" || key === "u") {
            e.preventDefault();
            undo();
        }
    };
    document.addEventListener("keydown", onKey);

    /* ---------------- initial paint ---------------- */
    updateHud();
    syncUI();

    function destroy() {
        destroyed = true;
        clearTimers();
        freezeAt = 0;
        document.removeEventListener("keydown", onKey);
    }
    return { destroy };
}
