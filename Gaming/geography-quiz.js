/* ==== GAME: geography-quiz.js ==== */

/* =============================================================== */
/* Geography Quiz - educational game (MGP module)                   */
/* Ten questions about countries: capitals, continents and flags    */
/* (simple SVG flags). Score 8 or more of 10 to pass the quiz.      */
/* Layout: single HUD bar + fill-height board + internal help.      */
/* =============================================================== */
import { iconSVG } from "../JS/icons.js";

/* ---------- fact bank (well-known facts) ---------- */
/* [country, capital, continent] */
const COUNTRIES = [
    ["Japan", "Tokyo", "Asia"],
    ["Egypt", "Cairo", "Africa"],
    ["Brazil", "Brasilia", "South America"],
    ["Canada", "Ottawa", "North America"],
    ["Australia", "Canberra", "Oceania"],
    ["France", "Paris", "Europe"],
    ["Kenya", "Nairobi", "Africa"],
    ["India", "New Delhi", "Asia"],
    ["Italy", "Rome", "Europe"],
    ["Mexico", "Mexico City", "North America"],
    ["Peru", "Lima", "South America"],
    ["Norway", "Oslo", "Europe"],
    ["China", "Beijing", "Asia"],
    ["Morocco", "Rabat", "Africa"],
];
/* simple SVG flags: [country, draw fn] - stripes/crosses/circle only */
function flagSVG(kind) {
    const W = 'width="150" height="100" viewBox="0 0 60 40" focusable="false"';
    switch (kind) {
        case "Japan":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="60" height="40" fill="#fff" stroke="#00000022"/><circle cx="30" cy="20" r="9" fill="#bc002d"/></svg>'
            );
        case "France":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="20" height="40" fill="#0055a4"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ef4135"/></svg>'
            );
        case "Italy":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="20" height="40" fill="#008c45"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#cd212a"/></svg>'
            );
        case "Germany":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="60" height="13.3" fill="#000"/><rect y="13.3" width="60" height="13.3" fill="#dd0000"/><rect y="26.6" width="60" height="13.4" fill="#ffce00"/></svg>'
            );
        case "Indonesia":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="60" height="20" fill="#ce1126"/><rect y="20" width="60" height="20" fill="#fff"/></svg>'
            );
        case "Nigeria":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="20" height="40" fill="#008751"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#008751"/></svg>'
            );
        case "Sweden":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="60" height="40" fill="#006aa7"/><rect x="16" width="8" height="40" fill="#fecc00"/><rect y="16" width="60" height="8" fill="#fecc00"/></svg>'
            );
        case "Poland":
            return (
                "<svg " +
                W +
                ' aria-hidden="true"><rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#dc143c"/><rect width="60" height="40" fill="none" stroke="#00000022"/></svg>'
            );
        default:
            return "";
    }
}

const TOTAL = 10,
    PASS = 8,
    TIME_LIMIT = 15;

function shuffleFn(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function pickDistractors(pool, correct) {
    return shuffleFn(pool.filter((x) => x !== correct)).slice(0, 3);
}
/* build a mixed quiz of capital / continent / flag questions */
function makeQuiz() {
    const qs = [];
    const pool = shuffleFn(COUNTRIES);
    const kinds = ["capital", "continent", "flag"];
    for (let i = 0; i < TOTAL; i++) {
        const c = pool[i % pool.length];
        const kind = kinds[i % kinds.length];
        if (kind === "capital") {
            const opts = shuffleFn(
                [c[1]].concat(
                    pickDistractors(
                        COUNTRIES.map((x) => x[1]),
                        c[1],
                    ),
                ),
            );
            qs.push({
                kind: kind,
                prompt: "What is the capital of " + c[0] + "?",
                art: "",
                options: opts,
                answer: c[1],
            });
        } else if (kind === "continent") {
            const conts = [
                "Asia",
                "Africa",
                "Europe",
                "North America",
                "South America",
                "Oceania",
            ];
            const opts = shuffleFn(
                [c[2]].concat(pickDistractors(conts, c[2])),
            );
            qs.push({
                kind: kind,
                prompt: "Which continent is " + c[0] + " in?",
                art: "",
                options: opts,
                answer: c[2],
            });
        } else {
            const flagPool = [
                "Japan",
                "France",
                "Italy",
                "Germany",
                "Indonesia",
                "Nigeria",
                "Sweden",
                "Poland",
            ];
            const fc = shuffleFn(flagPool)[0];
            const opts = shuffleFn(
                [fc].concat(pickDistractors(flagPool, fc)),
            );
            qs.push({
                kind: kind,
                prompt: "Which country does this flag belong to?",
                art: flagSVG(fc),
                options: opts,
                answer: fc,
            });
        }
    }
    return shuffleFn(qs);
}

export const TEST = { TOTAL, PASS, TIME_LIMIT, makeQuiz, flagSVG };

export const META = {
    id: "geography-quiz",
    name: "Geography Quiz",
    category: "educational",
    catLabel: "Educational",
    desc: "Capitals, continents and flags - score 8 of 10 to pass.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="17"/><path d="M10 18h28M10 30h28M24 7c-5 5-5 10-5 17s0 12 5 17c5-5 5-10 5-17s0-12-5-17z"/></svg>',
    bg: ["#bae6fd", "#0ea5e9"],
};

export function mount(root, context = {}) {
    const { onExit = () => {} } = context;

    root.innerHTML = `
<style>
.gq-app{--gq-line:#ffffff24;--gq-ink:#e5e7eb;--gq-mut:#cbd5e1;--gq-acc:#818cf8;--gq-panel:#182148;--gq-ok:#34d399;--gq-warn:#fbbf24;--gq-bad:#f87171;font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.gq-app [hidden]{display:none!important}
.gq-app button:focus-visible{outline:2px solid var(--gq-acc);outline-offset:2px}
.gq-app .gq-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px}
.gq-app .gq-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--gq-line);border-radius:999px;background:var(--gq-panel);color:var(--gq-mut);white-space:nowrap}
.gq-app .gq-chip b{color:#fff;font-weight:700;font-variant-numeric:tabular-nums}
.gq-app .gq-chip .gq-timebar{width:54px;height:4px;border-radius:2px;background:var(--gq-line);overflow:hidden}
.gq-app .gq-chip .gq-timebar i{display:block;height:100%;width:100%;background:var(--gq-ok);transition:width .2s linear,background .2s}
.gq-app .gq-chip .gq-timebar i.warn{background:var(--gq-warn)}
.gq-app .gq-chip .gq-timebar i.danger{background:var(--gq-bad)}
.gq-app .gq-status{gap:7px}
.gq-app .gq-spacer{flex:1 1 auto}
.gq-app .gq-btn{border:1px solid var(--gq-line);border-radius:9px;background:#fff;color:#e5e7eb;background:var(--gq-panel);padding:9px 14px;min-height:38px;font:700 11px/1 ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
.gq-app .gq-btn:hover{border-color:var(--gq-acc);color:#fff}
.gq-app .gq-btn.primary{background:#4f46e5;border-color:#6366f1;color:#fff}
.gq-app .gq-btn.primary:hover{opacity:.92}
.gq-app .gq-btn:disabled{opacity:.45;cursor:not-allowed}
.gq-app .gq-btn.on{border-color:var(--gq-acc);color:#fff}
.gq-app .gq-icon-btn{display:inline-flex;align-items:center;gap:6px}
.gq-app .gq-icon-btn svg{flex:none;display:block}
.gq-app .gq-board{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:14px;border:1px solid var(--gq-line);border-radius:12px;background:linear-gradient(160deg,#0f172a,#1e293b);overflow:hidden}
.gq-app .gq-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;max-width:560px;min-width:0;max-height:100%}
.gq-app .gq-prompt{font-size:21px;font-weight:800;color:#fff;text-align:center;min-height:56px;display:flex;align-items:center;justify-content:center;padding:0 8px;line-height:1.35}
.gq-app .gq-flag{border:1px solid var(--gq-line);border-radius:10px;overflow:hidden;line-height:0;max-width:100%}
.gq-app .gq-flag svg{display:block;width:100%;height:auto;max-width:180px}
.gq-app .gq-opts{display:grid;grid-template-columns:repeat(2,minmax(0,190px));gap:8px;justify-content:center;width:100%}
.gq-app .gq-opt{border:1px solid var(--gq-line);border-radius:10px;background:var(--gq-panel);color:var(--gq-ink);font-size:16.5px;font-weight:700;min-height:56px;padding:12px 10px;transition:border-color .16s,background .16s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;cursor:pointer}
.gq-app .gq-opt:not(:disabled):hover{border-color:var(--gq-acc)}
.gq-app .gq-opt:focus-visible{outline:2px solid var(--gq-acc);outline-offset:2px}
.gq-app .gq-opt.good{background:#14532d;border-color:var(--gq-ok)}
.gq-app .gq-opt.bad{background:#7f1d1d;border-color:var(--gq-bad)}
.gq-app .gq-opt:disabled{cursor:default;opacity:.9}
.gq-app .gq-feedback{min-height:24px;font-weight:800;font-size:14.5px;text-align:center;line-height:1.4;color:var(--gq-mut)}
.gq-app .gq-feedback.good{color:var(--gq-ok)}
.gq-app .gq-feedback.bad{color:var(--gq-bad)}
.gq-app .gq-ov{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:14px;background:rgba(15,23,42,.92)}
.gq-app .gq-card{display:flex;flex-direction:column;width:min(560px,100%);max-height:100%;overflow:hidden;padding:16px;border:1px solid var(--gq-line);border-radius:14px;background:var(--gq-panel);box-shadow:0 10px 30px rgba(0,0,0,.3)}
.gq-app .gq-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:12px}
.gq-app .gq-head h3{margin:0;font-size:14px;font-weight:800;color:#fff}
.gq-app .gq-head h3.mgp-win{color:var(--gq-ok)}
.gq-app .gq-head h3.mgp-lose{color:var(--gq-bad)}
.gq-app .gq-body{flex:1 1 auto;min-height:0;overflow:auto;font-size:12px;color:var(--gq-mut)}
.gq-app .gq-body p{margin:0 0 10px}
.gq-app .gq-scores{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}
.gq-app .gq-stat{border:1px solid var(--gq-line);border-radius:10px;padding:10px;text-align:center}
.gq-app .gq-stat u{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;color:var(--gq-mut)}
.gq-app .gq-stat b{display:block;margin-top:5px;font-size:18px;color:#fff;font-variant-numeric:tabular-nums}
.gq-app .gq-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:14px}
.gq-app .gq-note{font-size:10px;color:var(--gq-mut)}
.gq-app .gq-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.gq-app .gq-help b{display:block;margin-bottom:6px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gq-mut)}
.gq-app .gq-help ul{margin:0 0 12px;padding-left:16px;font-size:11px;line-height:1.7;color:var(--gq-mut)}
.gq-app .gq-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--gq-line);border-bottom-width:2px;border-radius:5px;background:#0f172a;color:#e5e7eb;font:inherit}
.gq-app .gq-cheats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.gq-app .gq-cheats .gq-btn{width:100%;font-size:10px}
@media (prefers-reduced-motion:reduce){.gq-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}

/* --- layout redesign overrides (keep last) --- */
.gq-app.game-fill > .gq-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (pointer:coarse){.gq-app button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.gq-app.game-fill > .gq-board:not(:has(.gq-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto}
.gq-app.game-fill > .gq-board:has(.gq-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.gq-app .gq-hud{gap:5px}
.gq-app .gq-hud .gq-chip{padding:4px 6px;font-size:9px}
.gq-app .gq-hud .gq-chip[data-hud="pass"],
.gq-app .gq-hud .gq-chip[data-hud="status"]{display:none}
.gq-app .gq-hud .gq-chip .gq-timebar{width:40px}
.gq-app .gq-hud .gq-btn{min-height:32px;padding:5px 9px;font-size:9px}
.gq-app .gq-hud .gq-btn-label,
.gq-app .gq-spacer{display:none}
.gq-app .gq-ov{padding:8px}
.gq-app .gq-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.gq-app .gq-body,.gq-app .gq-cheats,.gq-app .gq-help{scrollbar-width:none}
.gq-app .gq-body::-webkit-scrollbar,
.gq-app .gq-cheats::-webkit-scrollbar,
.gq-app .gq-help::-webkit-scrollbar{display:none}
.gq-app .gq-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--gq-line)}
.gq-app .gq-note{display:none}
.gq-app .gq-wrap{gap:8px}
.gq-app .gq-prompt{font-size:18px;min-height:48px}
.gq-app .gq-opts{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.gq-app .gq-opt{font-size:15px;min-height:56px;padding:12px 8px}
.gq-app .gq-feedback{font-size:13.5px}
}
</style>
<div class="game-app gq-app game-fill" data-gq>
  <div class="gq-hud">
    <span class="gq-chip gq-status"><i class="game-status-dot"></i><span data-hud="status">Ready</span></span>
    <span class="gq-chip">QUESTION <b data-hud="q">1</b>/${TOTAL}</span>
    <span class="gq-chip">SCORE <b data-hud="score">0</b></span>
    <span class="gq-chip">PASS <b data-hud="pass">${PASS}</b></span>
    <span class="gq-chip">TIME <span class="gq-timebar"><i data-hud="time"></i></span><b data-hud="secs">${TIME_LIMIT}</b></span>
    <span class="gq-spacer"></span>
    <button class="gq-btn gq-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="gq-btn-label">Help</span></button>
    <button class="gq-btn gq-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="gq-btn-label">Cheats</span></button>
    <button class="gq-btn gq-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="gq-btn-label">Pause</span></button>
    <button class="gq-btn gq-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="gq-btn-label">Restart</span></button>
    <button class="gq-btn gq-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="gq-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel gq-board" data-board>
    <div class="gq-wrap">
      <div class="gq-prompt" data-el="prompt">Ready?</div>
      <div class="gq-flag" data-el="flag" hidden></div>
      <div class="gq-opts" data-el="opts"></div>
      <div class="gq-feedback" data-el="fb"></div>
    </div>
    <div class="gq-ov" data-ov="ready">
      <div class="gq-card">
        <div class="gq-head"><h3>Geography Quiz</h3><span class="gq-note">${TOTAL} questions</span></div>
        <div class="gq-body">
          <p>Ten questions about world geography - capitals, continents and flags. You have ${TIME_LIMIT} seconds per question and no lives to lose, but you need ${PASS} correct answers to pass. Skipping counts as wrong!</p>
          <div class="gq-scores">
            <div class="gq-stat"><u>Questions</u><b>${TOTAL}</b></div>
            <div class="gq-stat"><u>Pass mark</u><b>${PASS}</b></div>
            <div class="gq-stat"><u>Per question</u><b>${TIME_LIMIT}s</b></div>
          </div>
        </div>
        <div class="gq-foot"><span class="gq-note">Enter / Space to start</span><button class="gq-btn primary" type="button" data-launch>Start quiz</button></div>
      </div>
    </div>
    <div class="gq-ov" data-ov="over" hidden>
      <div class="gq-card">
        <div class="gq-head"><h3 class="mgp-win" data-ov="title">Quiz over</h3></div>
        <div class="gq-body">
          <div class="gq-scores">
            <div class="gq-stat"><u>Score</u><b data-ov="score">0</b></div>
            <div class="gq-stat"><u>Pass mark</u><b>${PASS}</b></div>
            <div class="gq-stat"><u>Questions</u><b>${TOTAL}</b></div>
          </div>
          <p data-ov="reason"></p>
        </div>
        <div class="gq-foot"><span class="gq-note">R to restart</span><button class="gq-btn primary" type="button" data-retry>Play again</button></div>
      </div>
    </div>
    <div class="gq-ov" data-ov="pause" hidden>
      <div class="gq-card">
        <div class="gq-head"><h3>Paused</h3></div>
        <div class="gq-body"><p>The question timer is frozen. It resumes exactly where it stopped.</p></div>
        <div class="gq-foot"><span class="gq-note">P / Esc to resume</span><button class="gq-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="gq-ov" data-ov="cheats" hidden>
      <div class="gq-card">
        <div class="gq-head"><h3>Cheats</h3><button class="gq-btn" type="button" data-cheats-close aria-label="Close cheats">×</button></div>
        <div class="gq-cheats">
          <button class="gq-btn" type="button" data-cheat="reveal">Reveal answer</button>
          <button class="gq-btn" type="button" data-cheat="time">Reset timer</button>
          <button class="gq-btn" type="button" data-cheat="correct">+1 correct</button>
          <button class="gq-btn" type="button" data-cheat="skip">Skip question</button>
          <button class="gq-btn" type="button" data-cheat="pass">Instant pass</button>
        </div>
        <div class="gq-foot"><span class="gq-note">Press C to toggle this panel</span><button class="gq-btn" type="button" data-cheats-close>Done</button></div>
      </div>
    </div>
    <div class="gq-ov" data-ov="help" hidden>
      <div class="gq-card">
        <div class="gq-head"><h3>How to play</h3><button class="gq-btn" type="button" data-help-close aria-label="Close help">×</button></div>
        <div class="gq-body gq-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click an answer or press <span class="gq-kbd">1</span>–<span class="gq-kbd">4</span>.</li>
              <li><span class="gq-kbd">Enter</span> / <span class="gq-kbd">Space</span> start or restart.</li>
              <li><span class="gq-kbd">H</span> help · <span class="gq-kbd">C</span> cheats · <span class="gq-kbd">P</span>/<span class="gq-kbd">Esc</span> pause · <span class="gq-kbd">R</span> restart.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap an answer button; flags are simplified outlines.</li>
              <li>Use the HUD icons for help, cheats, pause, restart and exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>${TOTAL} mixed questions: capitals, continents and flags.</li>
              <li>${TIME_LIMIT} seconds per question; running out counts as wrong.</li>
              <li>Score ${PASS} or more out of ${TOTAL} to pass the quiz.</li>
              <li>The correct answer is shown after every response.</li>
            </ul>
            <div class="gq-foot"><span class="gq-note">Press H to reopen this guide</span><button class="gq-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const app = $("[data-gq]");
    const promptEl = $('[data-el="prompt"]'),
        flagEl = $('[data-el="flag"]'),
        optsEl = $('[data-el="opts"]'),
        fbEl = $('[data-el="fb"]');
    const hud = {
        q: $('[data-hud="q"]'),
        score: $('[data-hud="score"]'),
        pass: $('[data-hud="pass"]'),
        secs: $('[data-hud="secs"]'),
        time: $('[data-hud="time"]'),
        status: $('[data-hud="status"]'),
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
    const pauseLabel = pauseBtn.querySelector(".gq-btn-label");
    const cheatsBtn = $("[data-cheats]");

    /* ---------------- state ---------------- */
    let destroyed = false;
    let started = false,
        over = false,
        paused = false;
    let quiz = [],
        idx = 0,
        correct = 0,
        tLeft = TIME_LIMIT,
        lock = false;
    let helpOpen = false,
        cheatsOpen = false;

    /* first-run internal help (the global dialog must be disabled in game-info) */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("geography-quiz-help-seen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("geography-quiz-help-seen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------------- pause-aware timers ---------------- */
    /* Wall-clock anchors shift on resume: the countdown and the short
       feedback delay never jump forward after help / cheats / pause. */
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

    function setTimer() {
        hud.time.style.width = Math.max(0, (tLeft / TIME_LIMIT) * 100) + "%";
        hud.time.className =
            "gq-timebar-fill" +
            (tLeft <= 3 ? " danger" : tLeft <= 7 ? " warn" : "");
        hud.secs.textContent = String(Math.max(0, tLeft));
    }
    function updateHud() {
        hud.q.textContent = String(Math.min(idx + 1, TOTAL));
        hud.score.textContent = String(correct);
        hud.pass.textContent = String(PASS);
        setTimer();
    }
    function syncUI() {
        hud.status.textContent = over
            ? (correct >= PASS ? "Passed" : "Failed")
            : paused ? "Paused" : !started ? "Ready" : "Playing";
        ov.ready.hidden = started || over || cheatsOpen || helpOpen;
        ov.over.hidden = !over || cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const activeCheats = cheatsOpen ? 1 : 0;
        cheatsBtn.classList.toggle("on", activeCheats > 0);
        pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
    }

    function tick() {
        if (destroyed || !started || over || paused || helpOpen || cheatsOpen) return;
        tLeft--;
        setTimer();
        if (tLeft <= 0) answer(-1);
        else schedule(1000, tick);
    }
    function showQuestion() {
        if (over || destroyed) return;
        lock = false;
        const q = quiz[idx];
        promptEl.textContent = q.prompt;
        if (q.art) {
            flagEl.innerHTML = q.art;
            flagEl.removeAttribute("hidden");
        } else flagEl.setAttribute("hidden", "");
        fbEl.textContent = "";
        fbEl.className = "gq-feedback";
        let html = "";
        q.options.forEach((o, i) => {
            html +=
                '<button class="gq-opt" data-i="' +
                i +
                '">' +
                o +
                "</button>";
        });
        optsEl.innerHTML = html;
        tLeft = TIME_LIMIT;
        updateHud();
        clearTimers();
        if (!freezeAt) schedule(1000, tick);
        syncUI();
    }

    function answer(i) {
        if (lock || over || !started || paused || helpOpen || cheatsOpen || destroyed) return;
        lock = true;
        clearTimers();
        const q = quiz[idx];
        const btns = Array.from(optsEl.children);
        btns.forEach((b) => (b.disabled = true));
        const chosen = i >= 0 ? q.options[i] : null;
        const good = chosen === q.answer;
        if (i >= 0) btns[i].classList.add(good ? "good" : "bad");
        const ci = q.options.indexOf(q.answer);
        if (!good && ci >= 0) btns[ci].classList.add("good");
        if (good) {
            correct++;
            fbEl.textContent = "Correct!";
            fbEl.className = "gq-feedback good";
        } else {
            fbEl.textContent =
                (chosen ? "Wrong - " : "Out of time - ") +
                "answer: " +
                q.answer;
            fbEl.className = "gq-feedback bad";
        }
        updateHud();
        const last = idx >= TOTAL - 1;
        schedule(950, () => {
            if (over || destroyed || !started) return;
            if (last) finish();
            else {
                idx++;
                updateHud();
                showQuestion();
            }
        });
        refreshFreeze();
        syncUI();
    }

    function finish() {
        over = true;
        paused = false;
        clearTimers();
        freezeAt = 0;
        out.score.textContent = String(correct);
        if (correct >= PASS) {
            out.title.textContent = "Geo master!";
            out.title.className = "mgp-win";
            out.reason.textContent =
                "You scored " +
                correct +
                " of " +
                TOTAL +
                ". Your atlas is well worn - great job!";
        } else {
            out.title.textContent = "Not passed";
            out.title.className = "mgp-lose";
            out.reason.textContent =
                "You scored " +
                correct +
                " of " +
                TOTAL +
                " - the pass mark is " +
                PASS +
                ". A quick look at the map and you will get it.";
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
        quiz = makeQuiz();
        idx = 0;
        correct = 0;
        tLeft = TIME_LIMIT;
        over = false;
        started = true;
        lock = false;
        promptEl.textContent = "Loading question…";
        optsEl.innerHTML = "";
        flagEl.setAttribute("hidden", "");
        fbEl.textContent = "";
        updateHud();
        showQuestion();
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
        if (key === "correct") {
            correct = Math.min(TOTAL, correct + 1);
            updateHud();
            syncUI();
            return;
        }
        if (key === "time") {
            tLeft = TIME_LIMIT;
            setTimer();
            syncUI();
            return;
        }
        if (key === "pass") {
            if (!started || over) return;
            correct = Math.max(correct, PASS);
            cheatsOpen = false;
            refreshFreeze();
            finish();
            return;
        }
        if (!started || over) return;
        if (key === "reveal") {
            const q = quiz[idx];
            const ci = q.options.indexOf(q.answer);
            const btns = optsEl.children;
            if (btns[ci]) btns[ci].classList.add("good");
            fbEl.textContent = "Answer: " + q.answer;
            fbEl.className = "gq-feedback good";
            syncUI();
        } else if (key === "skip") {
            answer(-1);
        }
    }

    /* ---------------- events ---------------- */
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
        const opt = t.closest(".gq-opt");
        if (opt) answer(Number(opt.dataset.i));
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
        if (!helpOpen && !cheatsOpen && !paused && e.key >= "1" && e.key <= "4") {
            e.preventDefault();
            answer(Number(e.key) - 1);
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
