/* ==== GAME: number-hunt.js ==== */

/* =============================================================
NUMBER GUESS - find the secret number (1-100) in 7 tries.
Every guess earns a higher / lower hint and shrinks the
possible-range bar. Pure SVG, no emoji, no assets.
============================================================= */
(() => {
    "use strict";

    /* ---------- pure logic (exposed via _test) ---------- */
    const MIN = 1;
    const MAX = 100;
    const ATTEMPTS = 7;

    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* Random Number */
    function makeSecret(rnd) {
        return MIN + Math.floor(rnd() * (MAX - MIN + 1));
    }

    /* Higher / Lower Hint */
    function hintOf(secret, guess) {
        if (guess === secret) return "correct";
        return guess < secret ? "higher" : "lower";
    }

    /* knowledge range: [lo, hi] still possible */
    function narrow(range, guess, hint) {
        let lo = range[0],
            hi = range[1];
        if (hint === "higher") lo = Math.max(lo, guess + 1);
        if (hint === "lower") hi = Math.min(hi, guess - 1);
        return [lo, hi];
    }

    /* Attempt Counter state */
    function newGame(rnd) {
        return {
            secret: makeSecret(rnd),
            range: [MIN, MAX],
            tries: 0,
            history: [],
        };
    }

    /* apply a guess; returns { g, ev } ev.type = bad|higher|lower|correct|out */
    function guess(g, n) {
        if (
            typeof n !== "number" ||
            !isFinite(n) ||
            n < MIN ||
            n > MAX ||
            Math.floor(n) !== n
        ) {
            return { g, ev: { type: "bad" } };
        }
        if (g.tries >= ATTEMPTS) return { g, ev: { type: "out" } };
        const h = hintOf(g.secret, n);
        const g2 = {
            secret: g.secret,
            range: narrow(g.range, n, h),
            tries: g.tries + 1,
            history: g.history.concat([{ n, hint: h }]),
        };
        if (h === "correct") return { g: g2, ev: { type: "correct" } };
        if (g2.tries >= ATTEMPTS) return { g: g2, ev: { type: "out" } };
        return { g: g2, ev: { type: h } };
    }

    MGP_REGISTER({
        id: "number-hunt",
        name: "Number Guess",
        category: "casual",
        catLabel: "Casual",
        desc: "Find the secret number from 1 to 100 in 7 tries using hints.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="8" fill="#0ea5e9"/><text x="24" y="30" font-size="17" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">?</text><circle cx="38" cy="38" r="8" fill="#f59e0b" stroke="#92400e" stroke-width="2"/><path d="M34.5 38h7M38 34.5v7" stroke="#fff" stroke-width="2.4"/></svg>',
        bg: ["#bae6fd", "#7dd3fc"],
        _test: {
            MIN,
            MAX,
            ATTEMPTS,
            rng,
            makeSecret,
            hintOf,
            narrow,
            newGame,
            guess,
        },
        build(app) {
            /* ---------- shell ---------- */
            app.innerHTML = `
<style>
#number-hunt-app .ng-wrap{width:min(94%,430px);text-align:center}
#number-hunt-app .ng-disp{font-size:56px;font-weight:800;color:#fff;line-height:1;margin:4px 0 2px;min-height:60px}
#number-hunt-app .ng-hint{min-height:26px;display:flex;justify-content:center;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#e5e7eb}
#number-hunt-app .ng-hint.up{color:#34d399}
#number-hunt-app .ng-hint.down{color:#f87171}
#number-hunt-app .ng-hint.ok{color:#34d399}
#number-hunt-app .ng-range{position:relative;height:26px;border-radius:13px;background:#ffffff14;margin:12px 0 4px;overflow:hidden}
#number-hunt-app .ng-range i{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#0ea5e9,#22d3ee);transition:left .3s,width .3s}
#number-hunt-app .ng-range span{position:absolute;top:0;bottom:0;display:flex;align-items:center;padding:0 8px;font-size:11.5px;font-weight:700;color:#c7d2fe}
#number-hunt-app .ng-tries{display:flex;justify-content:center;gap:6px;margin:10px 0}
#number-hunt-app .ng-tries i{width:12px;height:12px;border-radius:50%;background:#ffffff1c;border:1px solid #ffffff2e}
#number-hunt-app .ng-tries i.used{background:#f59e0b;border-color:#b45309}
#number-hunt-app .ng-hist{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:30px}
#number-hunt-app .ng-hist b{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;background:#ffffff10;font-size:13px;color:#dbe1ea}
#number-hunt-app .ng-pad{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:14px}
#number-hunt-app .ng-key{border:0;border-radius:10px;padding:11px 0;background:#ffffff14;color:#fff;font-weight:800;font-size:16px}
#number-hunt-app .ng-key:active{background:#0ea5e9}
#number-hunt-app .ng-key.wide{grid-column:span 2}
#number-hunt-app .ng-key.go{background:#0ea5e9}
#number-hunt-app .ng-shake{animation:ng-shake .3s ease}
@keyframes ng-shake{0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)}70%{transform:translateX(6px)}}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Number Guess</span>
  <span class="mgp-chip">Tries <b data-hud="tries">0</b>/7</span>
  <span class="mgp-chip">Range <b data-hud="range">1-100</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="ng-wrap">
    <div class="ng-disp" data-disp>--</div>
    <div class="ng-hint" data-hintline>Guess the secret number</div>
    <div class="ng-range" data-bar><i data-fill style="left:0;width:100%"></i><span data-lo style="left:6px">1</span><span data-hi style="right:6px">100</span></div>
    <div class="ng-tries" data-tries></div>
    <div class="ng-hist" data-hist></div>
    <div class="ng-pad" data-pad>
      <button class="ng-key" data-k="1">1</button><button class="ng-key" data-k="2">2</button><button class="ng-key" data-k="3">3</button>
      <button class="ng-key" data-k="4">4</button><button class="ng-key" data-k="5">5</button><button class="ng-key" data-k="6">6</button>
      <button class="ng-key" data-k="7">7</button><button class="ng-key" data-k="8">8</button><button class="ng-key" data-k="9">9</button>
      <button class="ng-key" data-k="0">0</button><button class="ng-key" data-k="del">DEL</button><button class="ng-key go" data-k="ok">OK</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Number Guess</h2>
      <p class="mgp-ov-sub">I picked a secret number between 1 and 100. Each guess tells you to go higher or lower, and the bar shows every number still possible. Find it in 7 tries.</p>
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
<div class="mgp-foot"><span class="mgp-hint">Tip: start near 50 - every hint halves the possibilities.</span></div>`;

            const $ = (s, r) => (r || app).querySelector(s);
            const dispEl = $("[data-disp]");
            const hintEl = $("[data-hintline]");
            const fillEl = $("[data-fill]");
            const loEl = $("[data-lo]");
            const hiEl = $("[data-hi]");
            const triesEl = $("[data-tries]");
            const histEl = $("[data-hist]");
            const wrapEl = $(".ng-wrap");
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');
            const hud = {
                tries: $('[data-hud="tries"]'),
                range: $('[data-hud="range"]'),
            };

            const UP =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
            const DOWN =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
            const CHECK =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';

            let g = null;
            let running = false;
            let wasRunning = false;
            let entry = "";

            function updateHud() {
                hud.tries.textContent = g.tries;
                const [lo, hi] = g.range;
                hud.range.textContent = lo + "-" + hi;
                fillEl.style.left = ((lo - MIN) / (MAX - MIN)) * 100 + "%";
                fillEl.style.width =
                    (Math.max(0, hi - lo + 1) / (MAX - MIN)) * 100 + "%";
                loEl.textContent = lo;
                hiEl.textContent = hi;
                let dots = "";
                for (let i = 0; i < ATTEMPTS; i++)
                    dots += "<i class='" + (i < g.tries ? "used" : "") + "'></i>";
                triesEl.innerHTML = dots;
                histEl.innerHTML = g.history
                    .map(
                        (h) =>
                            "<b>" +
                            h.n +
                            (h.hint === "higher"
                                ? UP
                                : h.hint === "lower"
                                    ? DOWN
                                    : CHECK) +
                            "</b>",
                    )
                    .join("");
            }

            function setHint(text, cls) {
                hintEl.className = "ng-hint" + (cls ? " " + cls : "");
                hintEl.innerHTML = text;
            }

            function finish(win, reason) {
                running = false;
                if (win) {
                    ovTitle.textContent = "You got it!";
                    ovTitle.className = "mgp-ov-title mgp-win";
                } else {
                    ovTitle.textContent = "Out of tries";
                    ovTitle.className = "mgp-ov-title mgp-lose";
                }
                ovReason.textContent = reason;
                setTimeout(() => {
                    if (!running) ovOver.hidden = false;
                }, 600);
            }

            function submit() {
                if (!running || !entry) return;
                const n = parseInt(entry, 10);
                const res = guess(g, n);
                if (res.ev.type === "bad") {
                    wrapEl.classList.remove("ng-shake");
                    void wrapEl.offsetWidth;
                    wrapEl.classList.add("ng-shake");
                    setHint("Pick a whole number from 1 to 100", "");
                    return;
                }
                g = res.g;
                entry = "";
                dispEl.textContent = n;
                updateHud();
                if (res.ev.type === "correct") {
                    setHint(CHECK + " " + n + " is the secret number!", "ok");
                    finish(
                        true,
                        "Found " +
                        g.secret +
                        " in " +
                        g.tries +
                        " " +
                        (g.tries === 1 ? "try" : "tries") +
                        ". Great narrowing!",
                    );
                } else if (res.ev.type === "out") {
                    const h = g.history[g.history.length - 1].hint;
                    setHint(
                        (h === "higher" ? UP : DOWN) +
                        " The secret is " +
                        h +
                        " than " +
                        n,
                        h === "higher" ? "up" : "down",
                    );
                    finish(
                        false,
                        "The secret number was " +
                        g.secret +
                        ". Better first guesses narrow the range faster.",
                    );
                } else {
                    setHint(
                        (res.ev.type === "higher" ? UP : DOWN) +
                        " The secret is " +
                        res.ev.type +
                        " than " +
                        n,
                        res.ev.type === "higher" ? "up" : "down",
                    );
                }
            }

            function press(k) {
                if (!running) return;
                if (k === "ok") {
                    submit();
                    return;
                }
                if (k === "del") {
                    entry = entry.slice(0, -1);
                    dispEl.textContent = entry || "--";
                    return;
                }
                if (entry.length < 3) {
                    entry += k;
                    dispEl.textContent = entry;
                }
            }

            app.querySelector("[data-pad]").addEventListener("click", (e) => {
                const b = e.target.closest("[data-k]");
                if (b) press(b.dataset.k);
            });

            document.addEventListener("keydown", (e) => {
                if (!running) return;
                if (/^[0-9]$/.test(e.key)) press(e.key);
                else if (e.key === "Backspace") {
                    e.preventDefault();
                    press("del");
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    press("ok");
                }
            });

            function startGame() {
                g = newGame(Math.random);
                entry = "";
                running = true;
                dispEl.textContent = "--";
                setHint("Guess the secret number", "");
                ovStart.hidden = true;
                ovOver.hidden = true;
                updateHud();
            }

            app.addEventListener("click", (e) => {
                const b = e.target.closest("[data-act]");
                if (!b) return;
                if (b.dataset.act === "start" || b.dataset.act === "restart")
                    startGame();
            });

            /* ---------- init ---------- */
            g = newGame(rng(3));
            updateHud();

            /* ---------- open / close ---------- */
            return {
                open() {
                    if (wasRunning) running = true;
                },
                close() {
                    wasRunning = running;
                    running = false;
                },
            };
        },
    });
})();
