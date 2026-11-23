/* ==== GAME: rock-paper-scissors.js ==== */

/* =============================================================== */
/* Rock Paper Scissors - trivia game (MGP module)                   */
/* Classic duel vs the machine: simultaneous reveal after a         */
/* countdown, first to five round wins takes the match.             */
/* Rock, paper and scissors are drawn as pure SVG icons.            */
/* =============================================================== */
(() => {
    "use strict";

    const TARGET = 5;
    const MOVES = ["rock", "paper", "scissors"];
    const LABEL = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

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

    MGP_REGISTER({
        id: "rock-paper-scissors",
        name: "Rock Paper Scissors",
        category: "trivia",
        catLabel: "Trivia",
        desc: "Read the machine: best-of duel, first to five round wins.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="34" r="6"/><path d="M17 31L34 10"/><path d="M31 8l7 5-4 6-7-5z"/><path d="M8 12h12m-6-6v12"/></svg>',
        bg: ["#e9d5ff", "#a855f7"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);

            app.innerHTML = `
<style>
#rock-paper-scissors-app [hidden]{display:none!important}
#rock-paper-scissors-app .rps-arena{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;max-width:620px}
#rock-paper-scissors-app .rps-hands{display:flex;align-items:center;gap:34px}
#rock-paper-scissors-app .rps-hand{width:120px;height:120px;border-radius:24px;background:#182148;border:1px solid #ffffff24;display:grid;place-items:center;color:#c7d2fe;transition:transform .15s,border-color .2s,box-shadow .2s;position:relative}
#rock-paper-scissors-app .rps-hand.foe{color:#fca5a5}
#rock-paper-scissors-app .rps-hand.win{border-color:#34d399;box-shadow:0 0 0 3px #34d39944;transform:scale(1.08)}
#rock-paper-scissors-app .rps-hand.lose{border-color:#f87171;opacity:.75;transform:scale(.94)}
#rock-paper-scissors-app .rps-hand.bump{animation:rps-bump .35s}
@keyframes rps-bump{0%,100%{transform:translateY(0)}30%{transform:translateY(-12px)}60%{transform:translateY(3px)}}
#rock-paper-scissors-app .rps-name{font-size:12.5px;font-weight:800;letter-spacing:1.2px;color:#8b93a7;text-transform:uppercase;text-align:center;margin-top:6px}
#rock-paper-scissors-app .rps-call{font-size:19px;font-weight:800;color:#fde047;min-height:26px;text-align:center}
#rock-paper-scissors-app .rps-result{font-size:21px;font-weight:800;min-height:28px;text-align:center}
#rock-paper-scissors-app .rps-result.win{color:#34d399}
#rock-paper-scissors-app .rps-result.lose{color:#f87171}
#rock-paper-scissors-app .rps-result.tie{color:#fbbf24}
#rock-paper-scissors-app .rps-picks{display:flex;gap:14px}
#rock-paper-scissors-app .rps-pick{width:84px;height:84px;border-radius:18px;border:1px solid #ffffff24;background:#182148;color:#e5e7eb;display:grid;place-items:center;padding:0;transition:transform .1s,border-color .15s,background .15s}
#rock-paper-scissors-app .rps-pick:hover{border-color:#a855f7;transform:translateY(-3px)}
#rock-paper-scissors-app .rps-pick:disabled{opacity:.4;cursor:default;transform:none}
#rock-paper-scissors-app .rps-pick svg{color:#c7d2fe}
#rock-paper-scissors-app .rps-vs{font-size:15px;font-weight:800;color:#64748b;align-self:center}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Rock Paper Scissors</span>
  <span class="mgp-chip">You <b data-hud="you">0</b></span>
  <span class="mgp-chip">Machine <b data-hud="foe">0</b></span>
  <span class="mgp-chip">Round <b data-hud="round">1</b></span>
  <span class="mgp-chip">First to <b>${TARGET}</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="rps-arena">
    <div class="rps-call" data-el="call">Pick your throw</div>
    <div class="rps-hands">
      <div>
        <div class="rps-hand" data-el="you">${Q_SVG}</div>
        <div class="rps-name">You</div>
      </div>
      <div class="rps-vs">VS</div>
      <div>
        <div class="rps-hand foe" data-el="foe">${Q_SVG}</div>
        <div class="rps-name">Machine</div>
      </div>
    </div>
    <div class="rps-result" data-el="result"></div>
    <div class="rps-picks" data-el="picks">
      <button class="rps-pick" data-move="rock" aria-label="Rock">${moveSvg("rock", 52)}</button>
      <button class="rps-pick" data-move="paper" aria-label="Paper">${moveSvg("paper", 52)}</button>
      <button class="rps-pick" data-move="scissors" aria-label="Scissors">${moveSvg("scissors", 52)}</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Rock Paper Scissors</h2>
      <p class="mgp-ov-sub">Choose your throw - the machine answers in kind after a three-count. Rock smashes scissors, scissors cut paper, paper covers rock. First to ${TARGET} round wins takes the match.</p>
      <button class="mgp-btn" data-act="start">Start match</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Match over</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Click a throw or press 1 / 2 / 3 (or R / P / S).</span></div>`;

            /* ---------------- refs ---------------- */
            const youEl = $('[data-el="you"]'),
                foeEl = $('[data-el="foe"]'),
                callEl = $('[data-el="call"]'),
                resultEl = $('[data-el="result"]'),
                picksEl = $('[data-el="picks"]');
            const hudYou = $('[data-hud="you"]'),
                hudFoe = $('[data-hud="foe"]'),
                hudRound = $('[data-hud="round"]');
            const ovStart = $('[data-ov="start"]'),
                ovOver = $('[data-ov="over"]'),
                ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let you = 0,
                foe = 0,
                roundNo = 1,
                busy = false;
            const timers = new Set();
            function after(ms, fn) {
                const id = setTimeout(() => {
                    timers.delete(id);
                    fn();
                }, ms);
                timers.add(id);
            }
            function clearTimers() {
                for (const id of timers) clearTimeout(id);
                timers.clear();
            }

            function updateHud() {
                hudYou.textContent = String(you);
                hudFoe.textContent = String(foe);
                hudRound.textContent = String(roundNo);
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

            function throwMove(move) {
                if (busy || over || !started) return;
                busy = true;
                setPicksEnabled(false);
                clearMarks();
                resultEl.textContent = "";
                resultEl.className = "rps-result";
                youEl.innerHTML = Q_SVG;
                foeEl.innerHTML = Q_SVG;
                const calls = ["Rock...", "Paper...", "Scissors...", "Shoot!"];
                calls.forEach((c, i) => {
                    after(i * 420, () => {
                        if (over) return;
                        callEl.textContent = c;
                        if (i < calls.length - 1) bumpHands();
                    });
                });
                after(calls.length * 420, () => {
                    if (over) return;
                    /* simultaneous reveal */
                    const ai = aiMove();
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
                        after(1000, () => finish(you >= TARGET));
                        return;
                    }
                    roundNo++;
                    after(900, () => {
                        if (over) return;
                        busy = false;
                        setPicksEnabled(true);
                        callEl.textContent = "Pick your throw";
                    });
                });
            }

            function finish(won) {
                over = true;
                setPicksEnabled(false);
                if (won) {
                    ovTitle.textContent = "You win the match!";
                    ovTitle.className = "mgp-ov-title mgp-win";
                    ovReason.textContent =
                        "Final score " +
                        you +
                        " - " +
                        foe +
                        " after " +
                        roundNo +
                        " rounds. The machine demands a rematch.";
                } else {
                    ovTitle.textContent = "Machine wins";
                    ovTitle.className = "mgp-ov-title mgp-lose";
                    ovReason.textContent =
                        "Final score " +
                        you +
                        " - " +
                        foe +
                        ". It may be random - but today the dice loved the machine.";
                }
                ovOver.removeAttribute("hidden");
            }

            function startGame() {
                clearTimers();
                you = 0;
                foe = 0;
                roundNo = 1;
                over = false;
                started = true;
                busy = false;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                clearMarks();
                youEl.innerHTML = Q_SVG;
                foeEl.innerHTML = Q_SVG;
                callEl.textContent = "Pick your throw";
                resultEl.textContent = "";
                updateHud();
                setPicksEnabled(true);
            }

            /* ---------------- events ---------------- */
            picksEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest
                    ? e.target.closest("[data-move]")
                    : null;
                if (el) throwMove(el.dataset.move);
            });
            const onKey = (e) => {
                if (!active) return;
                const k = e.key.toLowerCase();
                if (k === "1" || k === "r") throwMove("rock");
                else if (k === "2" || k === "p") throwMove("paper");
                else if (k === "3" || k === "s") throwMove("scissors");
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
                clearTimers();
            }

            updateHud();
            return { open, close };
        },
    });
})();