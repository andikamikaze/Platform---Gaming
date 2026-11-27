/* ==== GAME: rock-paper-scissors.js ==== */

/* =============================================================
ROCK PAPER SCISSORS — ESM / mount() template
Classic duel vs the machine: simultaneous reveal after a
three-count, first to five round wins takes the match.
Rock, paper and scissors are drawn as pure SVG icons.

Layout: single HUD bar + fill-height board + internal help,
cheat, pause, start and result overlays. Engine rules unchanged.
============================================================= */

import { iconSVG } from "../JS/icons.js";

const TARGET = 5;
const MOVES = ["rock", "paper", "scissors"];
const LABEL = { rock: "Rock", paper: "Paper", scissors: "Scissors" };
/* The move that loses to a given move — only used by the "rig" cheat. */
const LOSER = { rock: "scissors", paper: "rock", scissors: "paper" };

/* returns 1 if a beats b, -1 if b beats a, 0 tie */
function judge(a, b) {
    if (a === b) return 0;
    if (
        (a === "rock" && b === "scissors") ||
        (a === "paper" && b === "rock") ||
        (a === "scissors" && b === "paper")
    )
        return 1;
    return -1;
}
function aiMove() {
    return MOVES[Math.floor(Math.random() * 3)];
}
const TEST = { TARGET, MOVES, judge, aiMove };

/* ---------- SVG move icons ---------- */
function moveSvg(kind, size) {
    const s = size || 96;
    const head =
        'viewBox="0 0 48 48" width="' +
        s +
        '" height="' +
        s +
        '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === "rock")
        return (
            "<svg " +
            head +
            '><path d="M12 34c-3-2-4-6-2-10l4-9c1-2 3-3 5-2l3 2 1-5c.5-2 3-3 5-2l10 5c2 1 3 3 2 5l-2 12c-.5 4-4 7-8 7H18c-2.5 0-4.5-1-6-3z"/><path d="M18 22l3 4m0-9l3 4m2-8l2 5"/></svg>'
        );
    if (kind === "paper")
        return (
            "<svg " +
            head +
            '><path d="M12 6h16l8 8v28H12z"/><path d="M28 6v8h8"/><path d="M18 22h12M18 28h12M18 34h8"/></svg>'
        );
    return (
        "<svg " +
        head +
        '><circle cx="13" cy="34" r="5"/><circle cx="23" cy="38" r="5"/><path d="M16 30L36 8m-9 26L38 17"/><path d="M33 5l7 5-4 6-7-5z"/></svg>'
    );
}
const Q_SVG =
    '<svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 19a7 7 0 1 1 10 6c-2 1-3 2-3 5"/><circle cx="24" cy="37" r="1.6" fill="currentColor" stroke="none"/></svg>';

export const META = {
    id: "rock-paper-scissors",
    name: "Rock Paper Scissors",
    category: "trivia",
    catLabel: "Trivia",
    desc: "Read the machine: best-of duel, first to five round wins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="34" r="6"/><path d="M17 31L34 10"/><path d="M31 8l7 5-4 6-7-5z"/><path d="M8 12h12m-6-6v12"/></svg>',
    bg: ["#e9d5ff", "#a855f7"],
    _test: TEST,
};

export function mount(root, context = {}) {
    const { onExit = () => { } } = context;
    const $ = (s, r) => (r || root).querySelector(s);
    const icon = (name) => iconSVG(name, { size: 14 });

    /* ---------- first-run internal help ---------- */
    const HELP_KEY = "rockPaperScissorsHelpSeen";
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch (_) { seenHelp = true; }
    let helpOpen = !seenHelp;
    if (!seenHelp) {
        try { localStorage.setItem(HELP_KEY, "1"); } catch (_) { /* storage blocked */ }
    }

    /* ---------- markup ---------- */
    root.innerHTML = `
<style>
.rps{--rps-acc:#a855f7;width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:10px;outline:none;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e5e7eb}
.rps *{box-sizing:border-box}
.rps [hidden]{display:none!important}
.rps :is(button,input):focus-visible{outline:2px solid var(--rps-acc);outline-offset:2px}
.rps-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.rps-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;min-height:30px;border:1px solid rgba(255,255,255,.16);border-radius:999px;white-space:nowrap;background:rgba(255,255,255,.04)}
.rps-chip b{font-variant-numeric:tabular-nums;color:#f4f6fb}
.rps .rps-hud .rps-chip[data-hud="tell"]{border-color:rgba(251,191,36,.5);color:#fbbf24}
.rps-spacer{flex:1 1 auto;min-width:6px}
.rps-btn,.rps-pick{font:inherit;font-size:11px;padding:6px 10px;min-height:32px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.rps-btn:hover:not(:disabled),.rps-pick:hover:not(:disabled){border-color:var(--rps-acc);background:rgba(168,85,247,.12)}
.rps-btn:disabled,.rps-pick:disabled{opacity:.4;cursor:default}
.rps-icon-btn{display:inline-flex;align-items:center;gap:5px}
.rps-icon-btn svg{flex:none;display:block}
.rps-btn-label{white-space:nowrap}
.rps.game-fill>.rps-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;align-items:stretch;justify-content:center;min-width:0;padding:0;border:0;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 50% 35%,rgba(168,85,247,.12),rgba(8,16,30,.36))}
.rps-arena{width:100%;height:100%;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;gap:8px;padding:10px}
.rps-call{font-size:clamp(16px,4vw,20px);font-weight:800;color:#fde047;min-height:26px;line-height:1.3;text-align:center}
.rps-hands{display:flex;align-items:center;justify-content:center;gap:clamp(14px,6vw,34px);width:100%}
.rps-hand-col{display:flex;flex-direction:column;align-items:center;gap:8px}
.rps-hand{width:clamp(84px,22vw,130px);max-height:26vh;aspect-ratio:1;border-radius:14px;background:#182148;border:1px solid rgba(255,255,255,.14);display:grid;place-items:center;color:#c7d2fe;transition:transform .15s,border-color .2s,box-shadow .2s;position:relative}
.rps-hand svg{width:56%;height:56%}
.rps-hand.foe{color:#fca5a5}
.rps-hand.win{border-color:#34d399;box-shadow:0 0 0 3px #34d39944;transform:scale(1.06)}
.rps-hand.lose{border-color:#f87171;opacity:.75;transform:scale(.94)}
.rps-hand.bump{animation:rps-bump .35s}
@keyframes rps-bump{0%,100%{transform:translateY(0)}30%{transform:translateY(-12px)}60%{transform:translateY(3px)}}
.rps-name{font-size:11px;font-weight:800;letter-spacing:.08em;color:#8b93a7;text-transform:uppercase;text-align:center}
.rps-vs{font-size:14px;font-weight:800;color:#64748b;align-self:center}
.rps-result{font-size:clamp(18px,5vw,21px);font-weight:800;min-height:28px;line-height:1.3;text-align:center}
.rps-result.win{color:#34d399}
.rps-result.lose{color:#f87171}
.rps-result.tie{color:#fbbf24}
.rps-picks{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.rps-pick{width:clamp(68px,18vw,88px);height:clamp(68px,18vw,88px);aspect-ratio:1;padding:0;display:grid;place-items:center;border-radius:14px;background:#182148;color:#e5e7eb}
.rps-pick svg{width:64%;height:64%;color:#c7d2fe}
.rps-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(12,20,34,.5);backdrop-filter:blur(3px);border-radius:12px;z-index:5;padding:12px}
.rps-card{background:#111a2c;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px 20px;min-width:0;width:min(460px,100%);max-height:100%;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
.rps-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.rps-head h3{margin:0;font-size:18px;font-weight:600;color:#f4f6fb}
.rps-card p{margin:0;font-size:13px;color:#b6c2d4}
.rps-win{color:#34d399}
.rps-lose{color:#f87171}
.rps-stats,.rps-cheats,.rps-help{flex:1 1 auto;min-height:0;overflow:auto}
.rps-cheats{display:flex;flex-direction:column;gap:2px}
.rps-help{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.rps-help b{display:block;margin:0 0 5px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase}
.rps-help ul{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.6;color:#cbd5e1}
.rps-kbd{display:inline-block;padding:1px 5px;border:1px solid rgba(255,255,255,.2);border-bottom-width:2px;border-radius:5px;font:600 10px/1.4 ui-monospace,monospace}
.rps-row{display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:13px;min-height:40px;padding:3px 0;color:#cbd5e1}
.rps-row input{accent-color:var(--rps-acc);width:18px;height:18px;cursor:pointer}
.rps-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap}
.rps-note{font-size:11px;color:#94a3b8}
.rps-primary{background:#7c3aed;color:#fff;border:1px solid #7c3aed;border-radius:9px;padding:9px 14px;min-height:40px;font:inherit;font-size:13px;cursor:pointer}
.rps-primary:hover{background:#6d28d9}
@media (prefers-reduced-motion:reduce){.rps *{animation:none!important;transition:none!important}}
/* --- layout overrides last (beat pointer:coarse 44px defaults) --- */
@media (max-width:640px){
  .rps.game-fill>.rps-board:not(:has(.rps-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
  .rps.game-fill>.rps-board:has(.rps-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .rps{gap:6px}
  .rps .rps-hud{gap:4px}
  .rps .rps-hud .rps-chip{padding:4px 6px;font-size:9px;min-height:0}
  .rps .rps-hud .rps-chip[data-hud="first"]{display:none}
  .rps .rps-hud .rps-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .rps .rps-hud .rps-btn-label,.rps .rps-hud .rps-spacer{display:none}
  .rps-hands{gap:14px}
  .rps-picks{gap:8px}
  .rps-arena{padding:8px;gap:6px}
  .rps-ov{padding:8px}
  .rps-card{width:100%;height:100%;max-height:100%;padding:12px}
  .rps-help{grid-template-columns:1fr;gap:8px}
  .rps-stats,.rps-cheats,.rps-help{scrollbar-width:none}
  .rps-stats::-webkit-scrollbar,.rps-cheats::-webkit-scrollbar,.rps-help::-webkit-scrollbar{display:none}
  .rps-foot{padding-top:8px;border-top:1px solid rgba(255,255,255,.14)}
  .rps-note{display:none}
}
@media (pointer:coarse){
  .rps .rps-hud .rps-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .rps .rps-card .rps-primary{min-height:44px}
}
</style>
<div class="game-app rps game-fill" data-rps>
  <div class="rps-hud">
    <span class="rps-chip">YOU <b data-hud="you">0</b></span>
    <span class="rps-chip">MACHINE <b data-hud="foe">0</b></span>
    <span class="rps-chip">ROUND <b data-hud="round">1</b></span>
    <span class="rps-chip" data-hud="first">FIRST <b>${TARGET}</b></span>
    <span class="rps-chip" data-hud="tell" hidden>TELL —</span>
    <span class="rps-spacer"></span>
    <button class="rps-btn rps-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${icon("helpCircle")}<span class="rps-btn-label">Help</span></button>
    <button class="rps-btn rps-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${icon("wrench")}<span class="rps-btn-label">Cheats</span></button>
    <button class="rps-btn rps-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-icon-slot>${icon("pause")}</span><span class="rps-btn-label">Pause</span></button>
    <button class="rps-btn rps-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${icon("refresh")}<span class="rps-btn-label">Restart</span></button>
    <button class="rps-btn rps-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${icon("logOut")}<span class="rps-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel rps-board" data-board>
    <div class="rps-arena">
      <div class="rps-call" data-el="call">Pick your throw</div>
      <div class="rps-hands">
        <div class="rps-hand-col">
          <div class="rps-hand" data-el="you">${Q_SVG}</div>
          <div class="rps-name">You</div>
        </div>
        <div class="rps-vs">VS</div>
        <div class="rps-hand-col">
          <div class="rps-hand foe" data-el="foe">${Q_SVG}</div>
          <div class="rps-name">Machine</div>
        </div>
      </div>
      <div class="rps-result" data-el="result"></div>
      <div class="rps-picks" data-el="picks">
        <button class="rps-pick" type="button" data-move="rock" aria-label="Rock">${moveSvg("rock", 52)}</button>
        <button class="rps-pick" type="button" data-move="paper" aria-label="Paper">${moveSvg("paper", 52)}</button>
        <button class="rps-pick" type="button" data-move="scissors" aria-label="Scissors">${moveSvg("scissors", 52)}</button>
      </div>
    </div>
    <div class="rps-ov" data-ov="start">
      <div class="rps-card">
        <div class="rps-head"><h3>Ready to duel?</h3></div>
        <div class="rps-stats"><p>Pick a throw after the count. Rock beats scissors, scissors beat paper, paper beats rock. First to ${TARGET} round wins takes the match.</p></div>
        <div class="rps-foot"><span class="rps-note">Press Space to start</span><button class="rps-btn rps-primary" type="button" data-act="start">Start match</button></div>
      </div>
    </div>
    <div class="rps-ov" data-ov="over" hidden>
      <div class="rps-card">
        <div class="rps-head"><h3 data-ov="title">Match over</h3></div>
        <div class="rps-stats"><p data-ov="reason"></p></div>
        <div class="rps-foot"><span class="rps-note">Press R to play again</span><button class="rps-btn rps-primary" type="button" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="rps-ov" data-ov="pause" hidden>
      <div class="rps-card">
        <div class="rps-head"><h3>Paused</h3></div>
        <div class="rps-stats"><p>The countdown, the reveal and every timer are frozen. Resume picks up exactly where you left off.</p></div>
        <div class="rps-foot"><span class="rps-note">Press P or Esc to resume</span><button class="rps-btn rps-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="rps-ov" data-ov="cheat" hidden>
      <div class="rps-card">
        <div class="rps-head"><h3>Cheats</h3><button class="rps-btn" type="button" data-cheat-close aria-label="Close">Close</button></div>
        <div class="rps-cheats">
          <label class="rps-row"><span>Rig the machine to lose</span><input type="checkbox" data-cheat="rig"></label>
          <label class="rps-row"><span>Reveal the machine's throw</span><input type="checkbox" data-cheat="reveal"></label>
          <label class="rps-row"><span>Skip the countdown</span><input type="checkbox" data-cheat="fast"></label>
          <div class="rps-row"><span>Win the match instantly</span><button class="rps-btn" type="button" data-act="cheat-win">Apply</button></div>
        </div>
        <div class="rps-foot"><span class="rps-note">Press C or Esc to close</span></div>
      </div>
    </div>
    <div class="rps-ov" data-ov="help" hidden>
      <div class="rps-card">
        <div class="rps-head"><h3>How to play</h3><button class="rps-btn" type="button" data-help-close aria-label="Close">Close</button></div>
        <div class="rps-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click a throw, or press <span class="rps-kbd">1</span> Rock, <span class="rps-kbd">2</span> Paper, <span class="rps-kbd">3</span> Scissors.</li>
              <li><span class="rps-kbd">Space</span> starts a match from the ready screen.</li>
              <li><span class="rps-kbd">H</span> help · <span class="rps-kbd">C</span> cheats · <span class="rps-kbd">P</span> pause · <span class="rps-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap a throw in the arena; both hands stay hidden until the three-count ends.</li>
              <li>Use the HUD buttons for Help, Cheats, Pause, Restart and Exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Rock smashes scissors, scissors cut paper, paper covers rock. Same throw is a tie and the round is replayed.</li>
              <li>Both throws are chosen before the count and revealed together at "Shoot!".</li>
              <li>First to ${TARGET} round wins takes the match.</li>
              <li>Cheats: rig the machine to lose, reveal its throw, skip the countdown or win instantly.</li>
            </ul>
            <div class="rps-foot"><span class="rps-note">Press H to reopen this guide</span><button class="rps-btn rps-primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- element refs ---------- */
    const youEl = $('[data-el="you"]'),
        foeEl = $('[data-el="foe"]'),
        callEl = $('[data-el="call"]'),
        resultEl = $('[data-el="result"]'),
        picksEl = $('[data-el="picks"]');
    const hud = {
        you: $('[data-hud="you"]'),
        foe: $('[data-hud="foe"]'),
        round: $('[data-hud="round"]'),
        tell: $('[data-hud="tell"]'),
    };
    const ov = {
        start: $('[data-ov="start"]'),
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTitle = $('[data-ov="title"]', ov.over);
    const ovReason = $('[data-ov="reason"]', ov.over);
    const pauseBtn = $("[data-pause]");

    /* ---------- state ---------- */
    let alive = true;
    let started = false, over = false, busy = false;
    let you = 0, foe = 0, roundNo = 1;
    let plannedAi = "rock";
    let cheatsOpen = false, paused = false;
    const cheats = { rig: false, reveal: false, fast: false };

    /* Pause-aware timers: keep Date.now() due anchors and replay only the
       remaining delay on resume so the countdown never jumps ahead. */
    let timerSeq = 0;
    const timers = new Map();
    let deferred = [];
    let frozen = false;
    let pauseStart = 0, pauseOffset = 0;
    const wallNow = () => Date.now() - pauseOffset;

    function clearAfter(key) {
        const rec = timers.get(key);
        if (rec) { clearTimeout(rec.id); timers.delete(key); }
        deferred = deferred.filter((t) => t.key !== key);
    }
    function after(ms, fn, key) {
        if (key !== undefined) clearAfter(key);
        const idKey = key === undefined ? ++timerSeq : key;
        if (frozen) { deferred.push({ key: idKey, fn, wait: Math.max(0, ms) }); return idKey; }
        const id = setTimeout(() => {
            timers.delete(idKey);
            if (alive && !frozen) fn();
        }, ms);
        timers.set(idKey, { id, due: wallNow() + ms, fn });
        return idKey;
    }
    function clearTimers() {
        for (const rec of timers.values()) clearTimeout(rec.id);
        timers.clear();
        deferred = [];
    }
    function freezeTimers() {
        if (frozen) return;
        frozen = true;
        pauseStart = performance.now();
        const now = wallNow();
        for (const [key, rec] of timers) {
            clearTimeout(rec.id);
            deferred.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        timers.clear();
    }
    function thawTimers() {
        if (!frozen) return;
        if (pauseStart) pauseOffset += performance.now() - pauseStart;
        pauseStart = 0;
        frozen = false;
        const queue = deferred;
        deferred = [];
        for (const t of queue) after(t.wait, t.fn, t.key);
    }

    const blocked = () => helpOpen || cheatsOpen || paused;

    /* Consume the pre-planned throw so a revealed tell matches the reveal. */
    function machineMove(move) {
        const m = cheats.rig && move ? LOSER[move] : plannedAi || aiMove();
        plannedAi = null;
        return m;
    }

    function updateHud() {
        hud.you.textContent = String(you);
        hud.foe.textContent = String(foe);
        hud.round.textContent = String(roundNo);
        hud.tell.hidden = !(cheats.reveal && plannedAi && started && !over);
        hud.tell.textContent = cheats.rig
            ? "TELL: RIGGED"
            : "TELL: " + LABEL[plannedAi || "rock"].toUpperCase();
    }
    function setPicksEnabled(on) {
        Array.from(picksEl.children).forEach((b) => (b.disabled = !on));
    }
    function bumpHands() {
        [youEl, foeEl].forEach((el) => {
            el.classList.remove("bump");
            void el.offsetWidth;
            el.classList.add("bump");
        });
    }
    function clearMarks() {
        youEl.classList.remove("win", "lose");
        foeEl.classList.remove("win", "lose");
    }

    /* ---------- engine flow (unchanged rules) ---------- */
    function throwMove(move) {
        if (busy || over || !started || blocked()) return;
        busy = true;
        syncUI();
        clearMarks();
        resultEl.textContent = "";
        resultEl.className = "rps-result";
        youEl.innerHTML = Q_SVG;
        foeEl.innerHTML = Q_SVG;
        const calls = ["Rock...", "Paper...", "Scissors...", "Shoot!"];
        const step = cheats.fast ? 120 : 420;
        calls.forEach((c, i) => {
            after(i * step, () => {
                if (over) return;
                callEl.textContent = c;
                if (i < calls.length - 1) bumpHands();
            });
        });
        after(calls.length * step, () => {
            if (over) return;
            /* simultaneous reveal */
            const ai = machineMove(move);
            youEl.innerHTML = moveSvg(move);
            foeEl.innerHTML = moveSvg(ai);
            callEl.textContent = LABEL[move] + " vs " + LABEL[ai];
            const res = judge(move, ai);
            if (res === 1) {
                you++;
                youEl.classList.add("win");
                foeEl.classList.add("lose");
                resultEl.textContent = "You take the round!";
                resultEl.className = "rps-result win";
            } else if (res === -1) {
                foe++;
                foeEl.classList.add("win");
                youEl.classList.add("lose");
                resultEl.textContent = "Machine takes the round!";
                resultEl.className = "rps-result lose";
            } else {
                resultEl.textContent = "Tie - throw again!";
                resultEl.className = "rps-result tie";
            }
            updateHud();
            if (you >= TARGET || foe >= TARGET) {
                const won = you >= TARGET;
                after(cheats.fast ? 300 : 1000, () => finish(won));
                return;
            }
            roundNo++;
            after(cheats.fast ? 250 : 900, () => {
                if (over) return;
                busy = false;
                plannedAi = aiMove();
                updateHud();
                syncUI();
                callEl.textContent = "Pick your throw";
            });
        });
    }

    function finish(won) {
        over = true;
        plannedAi = null;
        ovTitle.className = won ? "mgp-win rps-win" : "mgp-lose rps-lose";
        if (won) {
            ovTitle.textContent = "You win the match!";
            ovReason.textContent =
                "Final score " + you + " - " + foe + " after " + roundNo +
                " rounds. The machine demands a rematch.";
        } else {
            ovTitle.textContent = "Machine wins";
            ovReason.textContent =
                "Final score " + you + " - " + foe +
                ". It may be random - but today the dice loved the machine.";
        }
        updateHud();
        syncUI();
    }

    function startGame() {
        clearTimers();
        you = 0;
        foe = 0;
        roundNo = 1;
        over = false;
        busy = false;
        started = true;
        helpOpen = false;
        cheatsOpen = false;
        paused = false;
        plannedAi = aiMove();
        ovTitle.className = "";
        clearMarks();
        youEl.innerHTML = Q_SVG;
        foeEl.innerHTML = Q_SVG;
        callEl.textContent = "Pick your throw";
        resultEl.textContent = "";
        resultEl.className = "rps-result";
        updateHud();
        syncUI();
    }

    /* ---------- overlay / control wiring ---------- */
    function cheatsUiSync() {
        root.querySelectorAll("[data-cheat]").forEach((input) => {
            input.checked = Boolean(cheats[input.dataset.cheat]);
        });
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncUI();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncUI();
        if (cheatsOpen) cheatsUiSync();
    }
    function togglePause(on) {
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        syncUI();
    }
    function cheatWin() {
        if (!started || over) return;
        cheatsOpen = false;
        you = TARGET;
        finish(true);
    }

    function syncUI() {
        const freeze = helpOpen || cheatsOpen || paused;
        if (freeze && !frozen) freezeTimers();
        else if (!freeze && frozen) thawTimers();
        ov.start.hidden = started || freeze;
        ov.over.hidden = !over || freeze;
        ov.pause.hidden = !paused || helpOpen || cheatsOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        setPicksEnabled(started && !over && !busy && !freeze);
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".rps-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
            const slot = pauseBtn.querySelector("[data-icon-slot]");
            const iconName = paused ? "play" : "pause";
            if (slot && slot.dataset.icon !== iconName) {
                slot.dataset.icon = iconName;
                slot.innerHTML = icon(iconName);
            }
        }
        if (cheatsOpen) cheatsUiSync();
        updateHud();
    }

    /* ---------- events ---------- */
    const onPick = (e) => {
        const el = e.target.closest ? e.target.closest("[data-move]") : null;
        if (el) throwMove(el.dataset.move);
    };
    function handleClick(e) {
        if (!alive) return;
        const t = e.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-pause]")) { togglePause(); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-resume]")) { togglePause(false); root.focus({ preventScroll: true }); return; }
        if (t.closest("[data-restart]")) { startGame(); root.focus({ preventScroll: true }); return; }
        const act = t.closest("[data-act]");
        if (act) {
            const a = act.dataset.act;
            if (a === "start") startGame();
            else if (a === "cheat-win") cheatWin();
            root.focus({ preventScroll: true });
        }
    }
    function handleChange(e) {
        const t = e.target;
        if (t && t.dataset && t.dataset.cheat) {
            cheats[t.dataset.cheat] = Boolean(t.checked);
            updateHud();
        }
    }
    function handleKey(e) {
        if (!alive) return;
        const k = e.key;
        const code = e.code || "";
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        /* priority: help → cheats → pause → Escape → restart → game actions */
        if (code === "KeyH" || k === "?") {
            if (!e.repeat) toggleHelp();
            e.preventDefault(); return;
        }
        if (code === "KeyC") {
            if (!e.repeat && !helpOpen) toggleCheats();
            e.preventDefault(); return;
        }
        if (code === "KeyP") {
            if (!e.repeat && !helpOpen && !cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            e.preventDefault(); return;
        }
        if (code === "KeyR") {
            if (!e.repeat && !helpOpen && !cheatsOpen) startGame();
            e.preventDefault(); return;
        }
        if (tag === "BUTTON") return;
        if (frozen) { e.preventDefault(); return; }
        if (k === "1") throwMove("rock");
        else if (k === "2") throwMove("paper");
        else if (k === "3") throwMove("scissors");
        else if (k === " " || code === "Space") {
            e.preventDefault();
            if (!started || over) startGame();
        }
    }

    root.tabIndex = 0;
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    picksEl.addEventListener("pointerdown", onPick);
    root.addEventListener("keydown", handleKey);

    /* ---------- boot ---------- */
    updateHud();
    syncUI();
    cheatsUiSync();
    root.focus({ preventScroll: true });

    return {
        destroy() {
            alive = false;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            picksEl.removeEventListener("pointerdown", onPick);
            root.removeEventListener("keydown", handleKey);
        },
    };
}
