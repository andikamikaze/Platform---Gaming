/* ==== GAME: geography-quiz.js ==== */

/* =============================================================== */
/* Geography Quiz - educational game (MGP module)                   */
/* Ten questions about countries: capitals, continents and flags    */
/* (simple SVG flags). Score 8 or more of 10 to pass the quiz.      */
/* =============================================================== */
(() => {
    "use strict";

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
    const TEST = { TOTAL, PASS, TIME_LIMIT, makeQuiz, flagSVG };

    MGP_REGISTER({
        id: "geography-quiz",
        name: "Geography Quiz",
        category: "educational",
        catLabel: "Educational",
        desc: "Capitals, continents and flags - score 8 of 10 to pass.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="17"/><path d="M10 18h28M10 30h28M24 7c-5 5-5 10-5 17s0 12 5 17c5-5 5-10 5-17s0-12-5-17z"/></svg>',
        bg: ["#bae6fd", "#0ea5e9"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);

            app.innerHTML = `
<style>
#geography-quiz-app [hidden]{display:none!important}
#geography-quiz-app .gq-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:560px}
#geography-quiz-app .gq-timer{width:100%;height:10px;border-radius:999px;background:#ffffff14;overflow:hidden}
#geography-quiz-app .gq-timer-fill{height:100%;width:100%;background:#34d399;border-radius:999px;transition:width .25s linear,background .3s}
#geography-quiz-app .gq-timer-fill.warn{background:#fbbf24}
#geography-quiz-app .gq-timer-fill.danger{background:#ef4444}
#geography-quiz-app .gq-prompt{font-size:21px;font-weight:800;color:#fff;text-align:center;min-height:56px;display:flex;align-items:center;justify-content:center;padding:0 8px}
#geography-quiz-app .gq-flag{border-radius:10px;overflow:hidden;box-shadow:0 8px 22px #00000055;line-height:0}
#geography-quiz-app .gq-opts{display:grid;grid-template-columns:repeat(2,minmax(130px,190px));gap:12px;justify-content:center;width:100%}
#geography-quiz-app .gq-opt{border:1px solid #ffffff24;border-radius:14px;background:#182148;color:#e5e7eb;font-size:16.5px;font-weight:700;padding:13px 10px;transition:transform .1s,border-color .15s,background .15s}
#geography-quiz-app .gq-opt:hover{border-color:#6366f1;transform:translateY(-2px)}
#geography-quiz-app .gq-opt.good{background:#14532d;border-color:#34d399}
#geography-quiz-app .gq-opt.bad{background:#7f1d1d;border-color:#f87171}
#geography-quiz-app .gq-opt:disabled{cursor:default;opacity:.9}
#geography-quiz-app .gq-feedback{min-height:22px;font-weight:800;font-size:14.5px;text-align:center}
#geography-quiz-app .gq-feedback.good{color:#34d399}
#geography-quiz-app .gq-feedback.bad{color:#f87171}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Geography Quiz</span>
  <span class="mgp-chip">Question <b data-hud="q">1</b>/${TOTAL}</span>
  <span class="mgp-chip">Correct <b data-hud="c">0</b></span>
  <span class="mgp-chip">Pass mark <b>${PASS}</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="gq-wrap">
    <div class="gq-timer"><div class="gq-timer-fill" data-el="timer"></div></div>
    <div class="gq-prompt" data-el="prompt">Ready?</div>
    <div class="gq-flag" data-el="flag" hidden></div>
    <div class="gq-opts" data-el="opts"></div>
    <div class="gq-feedback" data-el="fb"></div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Geography Quiz</h2>
      <p class="mgp-ov-sub">Ten questions about world geography - capitals, continents and flags. You have ${TIME_LIMIT} seconds per question and no lives to lose, but you need ${PASS} correct answers to pass. Skipping counts as wrong!</p>
      <button class="mgp-btn" data-act="start">Start quiz</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Quiz over</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Click an answer or press 1-4. Flags are simplified outlines.</span></div>`;

            /* ---------------- refs ---------------- */
            const promptEl = $('[data-el="prompt"]'),
                flagEl = $('[data-el="flag"]'),
                optsEl = $('[data-el="opts"]'),
                fbEl = $('[data-el="fb"]'),
                timerEl = $('[data-el="timer"]');
            const hudQ = $('[data-hud="q"]'),
                hudC = $('[data-hud="c"]');
            const ovStart = $('[data-ov="start"]'),
                ovOver = $('[data-ov="over"]'),
                ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let quiz = [],
                idx = 0,
                correct = 0,
                tLeft = TIME_LIMIT,
                tickId = null,
                lock = false;

            function clearTick() {
                if (tickId) {
                    clearInterval(tickId);
                    tickId = null;
                }
            }
            function setTimer() {
                timerEl.style.width =
                    Math.max(0, (tLeft / TIME_LIMIT) * 100) + "%";
                timerEl.className =
                    "gq-timer-fill" +
                    (tLeft <= 3 ? " danger" : tLeft <= 7 ? " warn" : "");
            }
            function updateHud() {
                hudQ.textContent = String(Math.min(idx + 1, TOTAL));
                hudC.textContent = String(correct);
            }

            function showQuestion() {
                if (over) return;
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
                setTimeout(() => {
                    if (over) return;
                    if (last) finish();
                    else {
                        idx++;
                        updateHud();
                        showQuestion();
                    }
                }, 950);
            }

            function finish() {
                over = true;
                clearTick();
                if (correct >= PASS) {
                    ovTitle.textContent = "Geo master!";
                    ovTitle.className = "mgp-ov-title mgp-win";
                    ovReason.textContent =
                        "You scored " +
                        correct +
                        " of " +
                        TOTAL +
                        ". Your atlas is well worn - great job!";
                } else {
                    ovTitle.textContent = "Not passed";
                    ovTitle.className = "mgp-ov-title mgp-lose";
                    ovReason.textContent =
                        "You scored " +
                        correct +
                        " of " +
                        TOTAL +
                        " - the pass mark is " +
                        PASS +
                        ". A quick look at the map and you will get it.";
                }
                ovOver.removeAttribute("hidden");
            }

            function startGame() {
                clearTick();
                quiz = makeQuiz();
                idx = 0;
                correct = 0;
                over = false;
                started = true;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                updateHud();
                showQuestion();
            }

            /* ---------------- events ---------------- */
            optsEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest ? e.target.closest(".gq-opt") : null;
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

            return { open, close };
        },
    });
})();
