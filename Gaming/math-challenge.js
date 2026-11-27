/* ==== GAME: math-challenge.js ==== */

/* =============================================================== */
/* Math Challenge - educational game                                 */
/* Timed arithmetic quiz: questions scale with level, 4 answer       */
/* options, 3 lives. Answer 10 questions correctly to win.           */
/* Layout: HUD bar + fill-height board + internal help/cheat/pause.  */
/* =============================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "math-challenge",
    name: "Math Challenge",
    category: "educational",
    catLabel: "Educational",
    desc: "Beat the clock: solve 10 arithmetic questions with 3 lives.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="36" height="30" rx="5"/><path d="M8 18h32"/><path d="M17 27h6M17 31h10"/><path d="M31 26v8M27 30h8"/></svg>',
    bg: ["#fde68a", "#f59e0b"],
};

/* ---------- pure rules (exposed via _test) ---------- */
const TARGET = 10,
    LIVES = 3,
    TIME_LIMIT = 10;

function rnd(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

/* question generator - difficulty grows with index (0-based) */
function makeQuestion(i) {
    const lvl = Math.min(4, Math.floor(i / 3)); /* 0..4 */
    let a, b, op, ans, text;
    if (lvl === 0) {
        op = "+";
        a = rnd(2, 9);
        b = rnd(2, 9);
        ans = a + b;
    } else if (lvl === 1) {
        op = "-";
        a = rnd(6, 15);
        b = rnd(2, 5);
        ans = a - b;
    } else if (lvl === 2) {
        op = "x";
        a = rnd(2, 9);
        b = rnd(2, 6);
        ans = a * b;
    } else if (lvl === 3) {
        op = "+";
        a = rnd(12, 40);
        b = rnd(12, 40);
        ans = a + b;
    } else {
        b = rnd(2, 9);
        ans = rnd(2, 9);
        a = b * ans;
        op = "/";
    }
    text = a + " " + op + " " + b + " = ?";
    /* options: correct + 3 near misses */
    const opts = new Set([ans]);
    while (opts.size < 4) {
        let d;
        const r = Math.random();
        if (r < 0.5)
            d =
                ans +
                (Math.random() < 0.5 ? -1 : 1) *
                rnd(1, Math.max(2, Math.floor(ans * 0.2)));
        else if (r < 0.8) d = Math.max(0, ans + rnd(-3, 3));
        else d = rnd(Math.max(0, ans - 10), ans + 10);
        if (d !== ans && d >= 0) opts.add(d);
    }
    return {
        text: text,
        answer: ans,
        options: Array.from(opts).sort((x, y) => x - y),
    };
}

export const _test = { TARGET, LIVES, TIME_LIMIT, makeQuestion };

export function mount(root, context = {}) {
    const { onExit = () => {} } = context;
    const $ = (s) => root.querySelector(s);

    /* ---------- first-run internal help ---------- */
    let helpOpen = false;
    try {
        if (localStorage.getItem("math-challenge-help-seen") !== "1") {
            helpOpen = true;
            localStorage.setItem("math-challenge-help-seen", "1");
        }
    } catch (_) { /* storage blocked */ }

    root.innerHTML = `
<style>
.mc-app{--mc-accent:#6366f1;--mc-line:var(--line,#e9ecf0);min-width:0;max-width:100%;overflow-x:clip;color:var(--ink,#202632);-webkit-tap-highlight-color:transparent}
.mc-app [hidden]{display:none!important}
.mc-app *,.mc-app *::before,.mc-app *::after{box-sizing:border-box}
.mc-app :where(button,select,input){touch-action:manipulation}
.mc-app :where(button):focus-visible{outline:2px solid var(--mc-accent);outline-offset:2px}

/* HUD bar: info + controls on one row above the board */
.mc-app .mc-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.mc-app .mc-chip{font-size:11px;padding:5px 9px;border:1px solid var(--mc-line);border-radius:999px;display:inline-flex;gap:6px;align-items:center;white-space:nowrap;opacity:.9}
.mc-app .mc-chip b{font-weight:700;font-variant-numeric:tabular-nums}
.mc-app .mc-spacer{flex:1 1 auto}
.mc-app .mc-btn{font:inherit;font-size:11px;padding:7px 10px;border-radius:9px;border:1px solid var(--mc-line);background:transparent;color:inherit;cursor:pointer}
.mc-app .mc-btn.primary{background:var(--mc-accent);border-color:transparent;color:#fff}
.mc-app .mc-btn:disabled{opacity:.45;cursor:not-allowed}
.mc-app .mc-icon-btn{display:inline-flex;align-items:center;gap:6px}
.mc-app .mc-icon-btn svg{flex:none;display:block}

/* board: fills remaining height, game content stays centered & proportional */
.mc-app .mc-panel{position:relative;display:flex;align-items:center;justify-content:center;padding:14px;border:0;border-radius:14px;min-height:0;overflow:hidden;background:radial-gradient(circle at 50% 0%,#1b2752 0%,#0c1229 70%)}
.mc-app .mc-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;max-width:520px;min-width:0}
.mc-app .mc-timer{width:100%;height:10px;border-radius:999px;background:#ffffff14;overflow:hidden}
.mc-app .mc-timer-fill{height:100%;width:100%;background:#34d399;border-radius:999px;transition:width .12s linear,background .2s}
.mc-app .mc-timer-fill.warn{background:#fbbf24}
.mc-app .mc-timer-fill.danger{background:#ef4444}
.mc-app .mc-question{font-size:clamp(28px,6vw,44px);font-weight:800;color:#fff;letter-spacing:1px;text-align:center;padding:4px 0;line-height:1.2}
.mc-app .mc-opts{display:grid;grid-template-columns:repeat(2,minmax(0,150px));gap:8px;justify-content:center;width:100%}
.mc-app .mc-opt{border:1px solid #ffffff24;border-radius:10px;background:#182148;color:#e5e7eb;font-size:24px;font-weight:800;min-height:64px;padding:12px 8px;transition:border-color .16s,background .16s;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.mc-app .mc-opt:not(:disabled):hover{border-color:#818cf8}
.mc-app .mc-opt.good{background:#14532d;border-color:#34d399}
.mc-app .mc-opt.bad{background:#7f1d1d;border-color:#f87171}
.mc-app .mc-opt:disabled{cursor:default;opacity:.85}
.mc-app .mc-feedback{min-height:24px;font-weight:800;font-size:15px;color:#e5e7eb;text-align:center;line-height:1.4}
.mc-app .mc-feedback.good{color:#6ee7b7}
.mc-app .mc-feedback.bad{color:#fca5a5}

/* overlays: fixed head/foot, scrollable body */
.mc-app .mc-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(2,6,23,.45);border-radius:inherit}
.mc-app .mc-card{background:var(--surface,#fff);color:var(--ink,#202632);border:1px solid var(--mc-line);border-radius:16px;padding:18px 20px;max-width:420px;width:calc(100% - 24px);max-height:100%;display:flex;flex-direction:column;gap:10px;text-align:center}
.mc-app .mc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
.mc-app .mc-head h3{margin:0;font-size:17px}
.mc-app .mc-body{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto;text-align:left}
.mc-app .mc-foot{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;flex:none}
.mc-app .mc-card p{margin:0;font-size:12px;line-height:1.5;opacity:.75}
.mc-app .mc-ov-title{margin:0;font-size:19px;line-height:1.25}
.mc-app .mc-win{color:var(--green,#2d9b72)}
.mc-app .mc-lose{color:var(--red,#d95f69)}
.mc-app .mc-cheatlist{display:flex;flex-direction:column;gap:6px}
.mc-app .mc-cheatlist .mc-btn{width:100%;text-align:left}
.mc-app .mc-help b{display:block;margin-bottom:6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.mc-app .mc-help ul{margin:0 0 12px;padding-left:18px;font-size:12px;line-height:1.65}
.mc-app .mc-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--mc-line);border-bottom-width:2px;border-radius:5px;font:inherit}
.mc-app .mc-note{font-size:10px;opacity:.6}
@media (max-width:480px){
.mc-app .mc-wrap{gap:8px}
.mc-app .mc-question{font-size:30px}
.mc-app .mc-opts{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mc-app .mc-opt{font-size:22px;min-height:60px;padding:12px 8px}
.mc-app .mc-feedback{font-size:14px}
}
@media (prefers-reduced-motion:reduce){.mc-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}

/* ==== layout shell: override terakhir (spesifisitas > pointer:coarse) ==== */
.mc-app.game-fill>.mc-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.mc-app .mc-hud .mc-btn{min-height:32px;min-width:0;padding:6px 9px;font-size:10px}
.mc-app .mc-card{display:flex;flex-direction:column;overflow:hidden}
.mc-app .mc-head,.mc-app .mc-foot{flex:none}
.mc-app .mc-body,.mc-app .mc-cheatlist,.mc-app .mc-help{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
.mc-app.game-fill>.mc-panel[data-board]:not(:has(.mc-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.mc-app.game-fill>.mc-panel[data-board]:has(.mc-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.mc-app .mc-hud{gap:5px;margin-bottom:8px}
.mc-app .mc-hud .mc-chip{padding:4px 6px;font-size:9px}
.mc-app .mc-hud .mc-chip[data-hud="level"],.mc-app .mc-hud .mc-chip[data-hud="status"]{display:none}
.mc-app .mc-hud .mc-btn{min-height:30px;min-width:28px;padding:5px 8px;font-size:9px}
.mc-app .mc-hud .mc-btn-label,.mc-app .mc-hud .mc-spacer{display:none}
.mc-app .mc-ov{padding:8px}
.mc-app .mc-card{width:100%;height:100%;max-height:100%;padding:12px}
.mc-app .mc-body,.mc-app .mc-cheatlist,.mc-app .mc-help{scrollbar-width:none}
.mc-app .mc-body::-webkit-scrollbar,.mc-app .mc-cheatlist::-webkit-scrollbar,.mc-app .mc-help::-webkit-scrollbar{display:none}
}
</style>
<div class="game-app mc-app game-fill" data-mc>
  <div class="mc-hud">
    <span class="mc-chip">STATUS <b data-hud="status">Ready</b></span>
    <span class="mc-chip">LV <b data-hud="level">1</b>/5</span>
    <span class="mc-chip">SOLVED <b data-hud="solved">0</b>/${TARGET}</span>
    <span class="mc-chip">SCORE <b data-hud="score">0</b></span>
    <span class="mc-chip">LIVES <b data-hud="lives">${LIVES}</b></span>
    <span class="mc-chip">TIME <b data-hud="time">${TIME_LIMIT}</b>s</span>
    <span class="mc-spacer"></span>
    <button class="mc-btn mc-icon-btn" type="button" data-help title="How to play (H)" aria-label="How to play">${iconSVG("helpCircle", { size: 14 })}<span class="mc-btn-label">Help</span></button>
    <button class="mc-btn mc-icon-btn" type="button" data-cheats title="Cheats (C)" aria-label="Cheats">${iconSVG("wrench", { size: 14 })}<span class="mc-btn-label">Cheats</span></button>
    <button class="mc-btn mc-icon-btn" type="button" data-pause title="Pause (P)" aria-label="Pause"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="mc-btn-label">Pause</span></button>
    <button class="mc-btn mc-icon-btn" type="button" data-restart title="Restart (R)" aria-label="Restart">${iconSVG("refresh", { size: 14 })}<span class="mc-btn-label">Restart</span></button>
    <button class="mc-btn mc-icon-btn" type="button" data-exit title="Exit game" aria-label="Exit game">${iconSVG("logOut", { size: 14 })}<span class="mc-btn-label">Exit game</span></button>
  </div>

  <section class="game-panel mc-panel" data-board>
    <div class="mc-wrap">
      <div class="mc-timer"><div class="mc-timer-fill" data-el="timer"></div></div>
      <div class="mc-question" data-el="q">Ready?</div>
      <div class="mc-feedback" data-el="fb"></div>
      <div class="mc-opts" data-el="opts"></div>
    </div>

    <div class="mc-ov" data-ov="start">
      <div class="mc-card">
        <div class="mc-head"><h3>Math Challenge</h3></div>
        <div class="mc-body">
          <p>Ten arithmetic questions, ten seconds each. Questions get harder as you go. Three wrong answers (or three timeouts) and the challenge is over - solve all ${TARGET} to win.</p>
        </div>
        <div class="mc-foot"><button class="mc-btn primary" type="button" data-act="start">Start game</button></div>
      </div>
    </div>

    <div class="mc-ov" data-ov="over" hidden>
      <div class="mc-card">
        <div class="mc-head"><h3 class="mc-ov-title" data-ov="title">Game over</h3></div>
        <div class="mc-body"><p data-ov="reason"></p></div>
        <div class="mc-foot"><button class="mc-btn primary" type="button" data-act="start">Play again</button></div>
      </div>
    </div>

    <div class="mc-ov" data-ov="pause" hidden>
      <div class="mc-card">
        <div class="mc-head"><h3>Paused</h3></div>
        <div class="mc-body"><p>The timer is frozen. Resume when you are ready - no time is lost.</p></div>
        <div class="mc-foot"><button class="mc-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="mc-ov" data-ov="cheat" hidden>
      <div class="mc-card">
        <div class="mc-head"><h3>Cheats</h3><button class="mc-btn" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
        <div class="mc-body">
          <p>Practice helpers. Using them marks the run as assisted.</p>
          <div class="mc-cheatlist">
            <button class="mc-btn" type="button" data-cheat-act="reveal">Reveal answer</button>
            <button class="mc-btn" type="button" data-cheat-act="time">+10 seconds on this question</button>
            <button class="mc-btn" type="button" data-cheat-act="solve">Auto-answer this question</button>
          </div>
        </div>
        <div class="mc-foot"><button class="mc-btn primary" type="button" data-cheat-close>Done</button></div>
      </div>
    </div>

    <div class="mc-ov" data-ov="help" hidden>
      <div class="mc-card">
        <div class="mc-head"><h3>How to play</h3><button class="mc-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="mc-body mc-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click an answer or press <span class="mc-kbd">1</span>-<span class="mc-kbd">4</span> to answer.</li>
              <li><span class="mc-kbd">H</span> help · <span class="mc-kbd">C</span> cheats · <span class="mc-kbd">P</span> pause · <span class="mc-kbd">R</span> restart.</li>
              <li><span class="mc-kbd">Space</span> / <span class="mc-kbd">Enter</span> starts a new game; <span class="mc-kbd">Esc</span> closes a panel.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap one of the four answer tiles before the timer runs out.</li>
              <li>Use the icon buttons in the HUD for help, cheats, pause, restart and exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Solve ${TARGET} questions in a row to win; each question gives you ${TIME_LIMIT} seconds.</li>
              <li>A wrong answer (or timeout) costs one life. You start with ${LIVES} lives.</li>
              <li>Questions get harder every three solved: addition, subtraction, multiplication, bigger sums and division.</li>
              <li>Faster correct answers earn a bigger speed bonus.</li>
            </ul>
          </div>
        </div>
        <div class="mc-foot"><span class="mc-note">Press H to reopen this guide</span><button class="mc-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const qEl = $('[data-el="q"]'),
        fbEl = $('[data-el="fb"]'),
        optsEl = $('[data-el="opts"]'),
        timerEl = $('[data-el="timer"]');
    const hud = {
        status: $('[data-hud="status"]'),
        level: $('[data-hud="level"]'),
        solved: $('[data-hud="solved"]'),
        score: $('[data-hud="score"]'),
        lives: $('[data-hud="lives"]'),
        time: $('[data-hud="time"]'),
    };
    const ov = {
        start: $('[data-ov="start"]'),
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'),
        help: $('[data-ov="help"]'),
    };
    const ovTitle = $('[data-ov="title"]'),
        ovReason = $('[data-ov="reason"]');
    const pauseBtn = $('[data-pause]'),
        pauseLabel = pauseBtn.querySelector(".mc-btn-label"),
        pauseIcon = $('[data-pause-icon]');
    const cheatBtns = Array.from(root.querySelectorAll("[data-cheat-act]"));

    /* ---------------- state ---------------- */
    let destroyed = false,
        started = false,
        over = false;
    let idx = 0,
        solved = 0,
        lives = LIVES,
        score = 0;
    let q = null,
        lock = false,
        tLeft = TIME_LIMIT;
    let paused = false,
        cheatsOpen = false;
    let deadline = 0,          /* performance.now() timestamp for the question timer */
        nextAt = 0,            /* performance.now() timestamp for the pending step   */
        pendingAction = null,
        tickId = null;
    let frozen = false,
        frozenAt = 0;

    const blocked = () => paused || helpOpen || cheatsOpen;

    function stopTick() {
        if (tickId) {
            clearInterval(tickId);
            tickId = null;
        }
    }
    function startTick() {
        stopTick();
        if (!destroyed && started && !over && !blocked())
            tickId = setInterval(tick, 100);
    }
    function schedule(fn, ms) {
        pendingAction = fn;
        nextAt = performance.now() + ms;
        startTick();
    }
    function applyFreeze() {
        if (blocked() && !frozen) {
            frozen = true;
            frozenAt = performance.now();
            stopTick();
        } else if (!blocked() && frozen) {
            const shift = performance.now() - frozenAt;
            if (deadline) deadline += shift;
            if (nextAt) nextAt += shift;
            frozen = false;
            startTick();
        }
    }

    function updateHud() {
        hud.solved.textContent = String(solved);
        hud.lives.textContent = String(lives);
        hud.score.textContent = String(score);
        hud.level.textContent = String(Math.min(5, Math.floor(idx / 3) + 1));
    }
    function setTimer() {
        const pct = Math.max(0, (tLeft / TIME_LIMIT) * 100);
        timerEl.style.width = pct + "%";
        timerEl.className =
            "mc-timer-fill" +
            (tLeft <= 3 ? " danger" : tLeft <= 6 ? " warn" : "");
        hud.time.textContent = String(tLeft);
    }
    function syncUI() {
        applyFreeze();
        ov.start.hidden = started || blocked();
        ov.over.hidden = !over || blocked();
        ov.pause.hidden = !paused || helpOpen || cheatsOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        hud.status.textContent = helpOpen ? "Help"
            : cheatsOpen ? "Cheats"
                : paused ? "Paused"
                    : over ? (solved >= TARGET ? "Won" : "Lost")
                        : started ? "Playing" : "Ready";
        const label = paused ? "Resume" : "Pause";
        pauseLabel.textContent = label;
        pauseBtn.setAttribute("aria-label", label);
        pauseBtn.setAttribute("title", label + " (P)");
        pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
        cheatBtns.forEach((b) => { b.disabled = !started || over; });
    }

    /* ---------------- flow ---------------- */
    function tick() {
        if (destroyed || !started || over || blocked()) return;
        const now = performance.now();
        if (pendingAction) {
            if (now >= nextAt) {
                const fn = pendingAction;
                pendingAction = null;
                fn();
            }
            return;
        }
        if (lock) return;
        tLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
        setTimer();
        if (now >= deadline) answer(-1);
    }

    function nextQuestion() {
        if (over || destroyed) return;
        lock = false;
        pendingAction = null;
        q = makeQuestion(idx);
        qEl.textContent = q.text;
        fbEl.textContent = "";
        fbEl.className = "mc-feedback";
        optsEl.innerHTML = "";
        q.options.forEach((o, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "mc-opt";
            b.dataset.i = String(i);
            b.dataset.v = String(o);
            b.textContent = String(o);
            optsEl.appendChild(b);
        });
        tLeft = TIME_LIMIT;
        setTimer();
        updateHud();
        deadline = performance.now() + TIME_LIMIT * 1000;
        startTick();
        syncUI();
    }

    function answer(i) {
        if (lock || over || !started || blocked() || destroyed) return;
        lock = true;
        stopTick();
        pendingAction = null;
        const btns = Array.from(optsEl.children);
        const correctIdx = q.options.indexOf(q.answer);
        btns.forEach((b) => (b.disabled = true));
        if (i >= 0)
            btns[i].classList.add(
                q.options[i] === q.answer ? "good" : "bad",
            );
        if (correctIdx >= 0 && q.options[i] !== q.answer)
            btns[correctIdx].classList.add("good");

        if (i >= 0 && q.options[i] === q.answer) {
            solved++;
            score += 10 + Math.max(0, tLeft); /* speed bonus */
            fbEl.textContent = "Correct! +" + (10 + Math.max(0, tLeft));
            fbEl.className = "mc-feedback good";
            updateHud();
            if (solved >= TARGET) {
                win();
                return;
            }
            idx++;
            schedule(() => {
                if (started && !over) nextQuestion();
            }, 700);
        } else {
            lives--;
            updateHud();
            fbEl.textContent =
                (i < 0 ? "Time's up! " : "Wrong! ") + "Answer: " + q.answer;
            fbEl.className = "mc-feedback bad";
            if (lives <= 0) {
                schedule(lose, 900);
                return;
            }
            schedule(() => {
                if (started && !over) nextQuestion();
            }, 1100);
        }
        syncUI();
    }

    function finish(title, reason, winFlag) {
        over = true;
        lock = true;
        stopTick();
        pendingAction = null;
        ovTitle.textContent = title;
        /* kelas mgp-win/mgp-lose dipakai shell untuk mencatat hasil */
        ovTitle.className = "mc-ov-title " + (winFlag ? "mgp-win mc-win" : "mgp-lose mc-lose");
        ovReason.textContent = reason;
        syncUI();
    }
    function win() {
        finish(
            "Challenge complete!",
            "You solved all " + TARGET + " questions with " + lives +
            (lives === 1 ? " life" : " lives") + " to spare. Final score: " + score + ".",
            true,
        );
    }
    function lose() {
        finish(
            "Out of lives",
            "You solved " + solved + " of " + TARGET + " questions. Score: " + score +
            ". Sharpen those pencils and try again!",
            false,
        );
    }

    function startGame() {
        if (destroyed) return;
        stopTick();
        pendingAction = null;
        lock = false;
        idx = 0;
        solved = 0;
        lives = LIVES;
        score = 0;
        over = false;
        started = true;
        helpOpen = false;
        cheatsOpen = false;
        paused = false;
        frozen = false;
        deadline = 0;
        nextAt = 0;
        updateHud();
        nextQuestion();
    }

    function toggleHelp(on) {
        if (destroyed) return;
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncUI();
    }
    function toggleCheats(on) {
        if (destroyed) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncUI();
    }
    function togglePause(on) {
        if (destroyed) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) cheatsOpen = false;
        syncUI();
    }
    function doCheat(kind) {
        /* panel cheat sengaja terbuka saat tombol ini ditekan */
        if (!started || over || !q || paused || helpOpen || destroyed) return;
        if (kind === "reveal") {
            const i = q.options.indexOf(q.answer);
            const b = optsEl.children[i];
            if (b) b.classList.add("good");
            fbEl.textContent = "Answer: " + q.answer;
            fbEl.className = "mc-feedback good";
        } else if (kind === "time") {
            tLeft = TIME_LIMIT;
            deadline = performance.now() + TIME_LIMIT * 1000;
            setTimer();
        } else if (kind === "solve") {
            cheatsOpen = false;
            syncUI();
            answer(q.options.indexOf(q.answer));
            return;
        }
        cheatsOpen = false;
        syncUI();
    }

    /* ---------------- events ---------------- */
    function handleClick(e) {
        if (destroyed) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-cheats]")) {
            if (paused) togglePause(false);
            toggleCheats();
            return;
        }
        if (t.closest("[data-pause]")) {
            if (helpOpen) toggleHelp(false);
            togglePause();
            return;
        }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { startGame(); return; }
        if (t.closest("[data-exit]")) {
            try { onExit(); } catch (_) { /* shell handles cleanup */ }
            return;
        }
        const cheatBtn = t.closest("[data-cheat-act]");
        if (cheatBtn) { doCheat(cheatBtn.dataset.cheatAct); return; }
        if (t.closest("[data-act='start']")) { startGame(); return; }
        const opt = t.closest(".mc-opt");
        if (opt && !blocked()) answer(Number(opt.dataset.i));
    }

    /* Prioritas keyboard: help -> cheats -> pause/Escape -> aksi game. */
    function handleKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const code = e.code, k = e.key;
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") {
            if (!helpOpen) {
                if (paused) togglePause(false);
                toggleCheats();
            }
            e.preventDefault(); return;
        }
        if (code === "KeyP" || code === "Escape" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR") { startGame(); e.preventDefault(); return; }
        if (blocked()) { e.preventDefault(); return; }
        if (k >= "1" && k <= "4") { answer(Number(k) - 1); e.preventDefault(); return; }
        if (k === " " || code === "Space" || k === "Enter") {
            if (!started || over) { startGame(); e.preventDefault(); }
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    updateHud();
    setTimer();
    syncUI();

    return {
        destroy() {
            destroyed = true;
            stopTick();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
        },
    };
}
