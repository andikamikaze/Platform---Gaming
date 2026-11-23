/* ==== GAME: math-challenge.js ==== */

/* =============================================================== */
/* Math Challenge - educational game (MGP module)                   */
/* Timed arithmetic quiz: questions scale with level, 4 answer      */
/* options, 3 lives. Answer 10 questions correctly to win.          */
/* =============================================================== */
(() => {
    "use strict";

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

    const TEST = { TARGET, LIVES, TIME_LIMIT, makeQuestion };

    MGP_REGISTER({
        id: "math-challenge",
        name: "Math Challenge",
        category: "educational",
        catLabel: "Educational",
        desc: "Beat the clock: solve 10 arithmetic questions with 3 lives.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="36" height="30" rx="5"/><path d="M8 18h32"/><path d="M17 27h6M17 31h10"/><path d="M31 26v8M27 30h8"/></svg>',
        bg: ["#fde68a", "#f59e0b"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);

            app.innerHTML = `
<style>
#math-challenge-app [hidden]{display:none!important}
#math-challenge-app .mc-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:520px}
#math-challenge-app .mc-timer{width:100%;height:10px;border-radius:999px;background:#ffffff14;overflow:hidden}
#math-challenge-app .mc-timer-fill{height:100%;width:100%;background:#34d399;border-radius:999px;transition:width .25s linear,background .3s}
#math-challenge-app .mc-timer-fill.warn{background:#fbbf24}
#math-challenge-app .mc-timer-fill.danger{background:#ef4444}
#math-challenge-app .mc-question{font-size:40px;font-weight:800;color:#fff;letter-spacing:1px;text-align:center;padding:10px 0}
#math-challenge-app .mc-opts{display:grid;grid-template-columns:repeat(2,minmax(110px,150px));gap:12px;justify-content:center;width:100%}
#math-challenge-app .mc-opt{border:1px solid #ffffff24;border-radius:14px;background:#182148;color:#e5e7eb;font-size:24px;font-weight:800;padding:16px 8px;transition:transform .1s,border-color .15s,background .15s}
#math-challenge-app .mc-opt:hover{border-color:#6366f1;transform:translateY(-2px)}
#math-challenge-app .mc-opt.good{background:#14532d;border-color:#34d399}
#math-challenge-app .mc-opt.bad{background:#7f1d1d;border-color:#f87171}
#math-challenge-app .mc-opt:disabled{cursor:default;opacity:.85}
#math-challenge-app .mc-feedback{min-height:24px;font-weight:800;font-size:15px;text-align:center}
#math-challenge-app .mc-feedback.good{color:#34d399}
#math-challenge-app .mc-feedback.bad{color:#f87171}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Math Challenge</span>
  <span class="mgp-chip">Solved <b data-hud="solved">0</b>/${TARGET}</span>
  <span class="mgp-chip">Lives <b data-hud="lives">${LIVES}</b></span>
  <span class="mgp-chip">Score <b data-hud="score">0</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="mc-wrap">
    <div class="mc-timer"><div class="mc-timer-fill" data-el="timer"></div></div>
    <div class="mc-question" data-el="q">Ready?</div>
    <div class="mc-feedback" data-el="fb"></div>
    <div class="mc-opts" data-el="opts"></div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Math Challenge</h2>
      <p class="mgp-ov-sub">Ten arithmetic questions, ten seconds each. Questions get harder as you go. Three wrong answers (or three timeouts) and the challenge is over - solve all ${TARGET} to win.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Game over</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Click an answer or press 1-4 on your keyboard.</span></div>`;

            /* ---------------- refs ---------------- */
            const qEl = $('[data-el="q"]'),
                fbEl = $('[data-el="fb"]'),
                optsEl = $('[data-el="opts"]'),
                timerEl = $('[data-el="timer"]');
            const hudSolved = $('[data-hud="solved"]'),
                hudLives = $('[data-hud="lives"]'),
                hudScore = $('[data-hud="score"]');
            const ovStart = $('[data-ov="start"]'),
                ovOver = $('[data-ov="over"]'),
                ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let idx = 0,
                solved = 0,
                lives = LIVES,
                score = 0;
            let q = null,
                lock = false,
                tLeft = TIME_LIMIT,
                tickId = null;

            function clearTick() {
                if (tickId) {
                    clearInterval(tickId);
                    tickId = null;
                }
            }
            function updateHud() {
                hudSolved.textContent = String(solved);
                hudLives.textContent = String(lives);
                hudScore.textContent = String(score);
            }
            function setTimer() {
                const pct = Math.max(0, (tLeft / TIME_LIMIT) * 100);
                timerEl.style.width = pct + "%";
                timerEl.className =
                    "mc-timer-fill" +
                    (tLeft <= 3 ? " danger" : tLeft <= 6 ? " warn" : "");
            }

            /* ---------------- flow ---------------- */
            function nextQuestion() {
                if (over) return;
                lock = false;
                q = makeQuestion(idx);
                qEl.textContent = q.text;
                fbEl.textContent = "";
                fbEl.className = "mc-feedback";
                let html = "";
                q.options.forEach((o, i) => {
                    html +=
                        '<button class="mc-opt" data-i="' +
                        i +
                        '" data-v="' +
                        o +
                        '">' +
                        o +
                        "</button>";
                });
                optsEl.innerHTML = html;
                tLeft = TIME_LIMIT;
                setTimer();
                clearTick();
                tickId = setInterval(() => {
                    if (!active || over) {
                        clearTick();
                        return;
                    }
                    tLeft--;
                    setTimer();
                    if (tLeft <= 0) answer(-1);
                }, 1000);
            }

            function answer(i) {
                if (lock || over || !started) return;
                lock = true;
                clearTick();
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
                    setTimeout(() => {
                        if (started && !over) nextQuestion();
                    }, 700);
                } else {
                    lives--;
                    updateHud();
                    fbEl.textContent =
                        (i < 0 ? "Time's up! " : "Wrong! ") + "Answer: " + q.answer;
                    fbEl.className = "mc-feedback bad";
                    if (lives <= 0) {
                        setTimeout(lose, 900);
                        return;
                    }
                    setTimeout(() => {
                        if (started && !over) nextQuestion();
                    }, 1100);
                }
            }

            function win() {
                over = true;
                clearTick();
                ovTitle.textContent = "Challenge complete!";
                ovTitle.className = "mgp-ov-title mgp-win";
                ovReason.textContent =
                    "You solved all " +
                    TARGET +
                    " questions with " +
                    lives +
                    (lives === 1 ? " life" : " lives") +
                    " to spare. Final score: " +
                    score +
                    ".";
                ovOver.removeAttribute("hidden");
            }
            function lose() {
                over = true;
                clearTick();
                ovTitle.textContent = "Out of lives";
                ovTitle.className = "mgp-ov-title mgp-lose";
                ovReason.textContent =
                    "You solved " +
                    solved +
                    " of " +
                    TARGET +
                    " questions. Score: " +
                    score +
                    ". Sharpen those pencils and try again!";
                ovOver.removeAttribute("hidden");
            }

            function startGame() {
                clearTick();
                idx = 0;
                solved = 0;
                lives = LIVES;
                score = 0;
                over = false;
                started = true;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                updateHud();
                nextQuestion();
            }

            /* ---------------- events ---------------- */
            optsEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest ? e.target.closest(".mc-opt") : null;
                if (el) answer(Number(el.dataset.i));
            });
            const onKey = (e) => {
                if (!active) return;
                if (e.key >= "1" && e.key <= "4") answer(Number(e.key) - 1);
                else if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    if (!started || over) startGame();
                }
            };
            document.addEventListener("keydown", onKey);
            app.addEventListener("click", (e) => {
                if (!active) return;
                const btn = e.target.closest
                    ? e.target.closest("[data-act]")
                    : null;
                if (!btn) return;
                if (btn.dataset.act === "start" || btn.dataset.act === "restart")
                    startGame();
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
            }
            function close() {
                active = false;
                clearTick();
            }

            updateHud();
            return { open, close };
        },
    });
})();
