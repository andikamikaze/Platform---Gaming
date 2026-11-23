/* ==== GAME: target-24.js ==== */

/* =============================================================== */
/* Target 24 - trivia game (MGP module)                             */
/* Combine four numbers with + - x / to make exactly 24. Every      */
/* puzzle is verified solvable by an exhaustive solver. Merge       */
/* tiles step by step; undo anytime. 5 puzzles, 100 seconds each.   */
/* =============================================================== */
(() => {
    "use strict";

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
    const TEST = {
        ROUNDS,
        PASS,
        TIME_LIMIT,
        solvable,
        makePuzzle,
        applyOp,
        fmt,
    };

    MGP_REGISTER({
        id: "target-24",
        name: "Target 24",
        category: "trivia",
        catLabel: "Trivia",
        desc: "Four numbers, four operations - build an expression worth 24.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="14" width="12" height="20" rx="4"/><rect x="30" y="14" width="12" height="20" rx="4"/><path d="M9 20h6m-3-3v6"/><path d="M33 22h6m-6 6h6"/><path d="M24 10v28"/><path d="M18 24h12"/></svg>',
        bg: ["#99f6e4", "#14b8a6"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);

            app.innerHTML = `
<style>
#target-24-app [hidden]{display:none!important}
#target-24-app .t24-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:560px}
#target-24-app .t24-goal{display:flex;align-items:baseline;gap:10px}
#target-24-app .t24-big{font-size:44px;font-weight:800;color:#34d399;line-height:1}
#target-24-app .t24-sub{color:#8b93a7;font-size:13px;font-weight:700}
#target-24-app .t24-timer{width:100%;max-width:420px;height:9px;border-radius:999px;background:#ffffff14;overflow:hidden}
#target-24-app .t24-timer-fill{height:100%;width:100%;background:#34d399;border-radius:999px;transition:width .25s linear,background .3s}
#target-24-app .t24-timer-fill.warn{background:#fbbf24}
#target-24-app .t24-timer-fill.danger{background:#ef4444}
#target-24-app .t24-tiles{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;min-height:88px}
#target-24-app .t24-tile{min-width:78px;height:88px;border-radius:16px;border:2px solid #ffffff24;background:#182148;color:#fff;font-size:29px;font-weight:800;padding:8px 12px;transition:transform .12s,border-color .15s,background .15s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
#target-24-app .t24-tile small{font-size:9.5px;font-weight:700;color:#8b93a7;letter-spacing:.3px;max-width:86px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#target-24-app .t24-tile:hover{transform:translateY(-3px)}
#target-24-app .t24-tile.sel{border-color:#14b8a6;background:#134e4a;box-shadow:0 0 0 3px #14b8a644}
#target-24-app .t24-tile.merged{border-color:#14b8a666}
#target-24-app .t24-ops{display:flex;gap:10px}
#target-24-app .t24-op{width:54px;height:50px;border-radius:14px;border:1px solid #ffffff24;background:#182148;color:#e5e7eb;font-size:22px;font-weight:800;padding:0;transition:transform .1s,border-color .15s}
#target-24-app .t24-op:hover{border-color:#14b8a6;transform:translateY(-2px)}
#target-24-app .t24-op.sel{border-color:#14b8a6;background:#134e4a;box-shadow:0 0 0 3px #14b8a644}
#target-24-app .t24-actions{display:flex;gap:10px}
#target-24-app .t24-expr{min-height:20px;font-size:14px;color:#94a3b8;font-weight:700;text-align:center;max-width:520px;overflow-wrap:anywhere}
#target-24-app .t24-feedback{min-height:22px;font-weight:800;font-size:15px;text-align:center}
#target-24-app .t24-feedback.good{color:#34d399}
#target-24-app .t24-feedback.bad{color:#f87171}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Target 24</span>
  <span class="mgp-chip">Puzzle <b data-hud="round">1</b>/${ROUNDS}</span>
  <span class="mgp-chip">Solved <b data-hud="solved">0</b></span>
  <span class="mgp-chip">Time <b data-hud="time">${TIME_LIMIT}</b>s</span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="undo">Undo</button>
  <button class="mgp-btn ghost" data-act="skip">Skip</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="t24-wrap">
    <div class="t24-goal"><span class="t24-big">24</span><span class="t24-sub">combine all four numbers</span></div>
    <div class="t24-timer"><div class="t24-timer-fill" data-el="timer"></div></div>
    <div class="t24-tiles" data-el="tiles"></div>
    <div class="t24-ops" data-el="ops">
      <button class="t24-op" data-op="+">+</button>
      <button class="t24-op" data-op="-">-</button>
      <button class="t24-op" data-op="x">x</button>
      <button class="t24-op" data-op="/">/</button>
    </div>
    <div class="t24-actions">
      <button class="mgp-btn ghost" data-act="reset">Reset puzzle</button>
    </div>
    <div class="t24-expr" data-el="expr"></div>
    <div class="t24-feedback" data-el="fb"></div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Target 24</h2>
      <p class="mgp-ov-sub">Tap a number, tap an operation, tap a second number - they merge into the result. Keep merging until one value remains: exactly 24. Every puzzle is solvable, undo is free, and you get ${TIME_LIMIT} seconds each. Solve ${PASS} of ${ROUNDS} to win.</p>
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
<div class="mgp-foot"><span class="mgp-hint">Keys: 1-4 tiles, + - x / operators, U undo, R reset. Division by zero is blocked.</span></div>`;

            /* ---------------- refs ---------------- */
            const tilesEl = $('[data-el="tiles"]'),
                opsEl = $('[data-el="ops"]'),
                exprEl = $('[data-el="expr"]'),
                fbEl = $('[data-el="fb"]'),
                timerEl = $('[data-el="timer"]');
            const hudRound = $('[data-hud="round"]'),
                hudSolved = $('[data-hud="solved"]'),
                hudTime = $('[data-hud="time"]');
            const ovStart = $('[data-ov="start"]'),
                ovOver = $('[data-ov="over"]'),
                ovTitle = $('[data-ov="title"]'),
                ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let round = 1,
                solved = 0,
                tLeft = TIME_LIMIT,
                tickId = null,
                lock = false;
            let tiles = [],
                history = [],
                selTile = -1,
                selOp = null;

            function clearTick() {
                if (tickId) {
                    clearInterval(tickId);
                    tickId = null;
                }
            }
            function updateHud() {
                hudRound.textContent = String(round);
                hudSolved.textContent = String(solved);
                hudTime.textContent = String(Math.max(0, tLeft));
            }
            function setTimer() {
                timerEl.style.width =
                    Math.max(0, (tLeft / TIME_LIMIT) * 100) + "%";
                timerEl.className =
                    "t24-timer-fill" +
                    (tLeft <= 15 ? " danger" : tLeft <= 35 ? " warn" : "");
            }
            function clearSel() {
                selTile = -1;
                selOp = null;
                Array.from(tilesEl.children).forEach((t) =>
                    t.classList.remove("sel"),
                );
                Array.from(opsEl.children).forEach((o) =>
                    o.classList.remove("sel"),
                );
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

            /* ---------------- puzzle flow ---------------- */
            function startRound() {
                if (over) return;
                lock = false;
                const nums = makePuzzle();
                tiles = nums.map((n) => ({ v: n, expr: "" }));
                history = [];
                clearSel();
                renderTiles();
                fbEl.textContent = "";
                fbEl.className = "t24-feedback";
                tLeft = TIME_LIMIT;
                setTimer();
                updateHud();
                clearTick();
                tickId = setInterval(() => {
                    if (!active || over) {
                        clearTick();
                        return;
                    }
                    tLeft--;
                    setTimer();
                    updateHud();
                    if (tLeft <= 0) missPuzzle("Out of time");
                }, 1000);
            }

            /* selection state machine: both "tile op tile" and "op tile tile" work.
         selTile = left operand (or -1), selOp = chosen operator (or null).
         When both are set, the next different tile tapped becomes the right
         operand and triggers the merge. */
            function tapTile(i) {
                if (lock || over || !started) return;
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
                if (lock || over || !started) return;
                if (selTile === -1) {
                    /* operator chosen first - wait for left operand */
                    selOp = op;
                    Array.from(opsEl.children).forEach((o) =>
                        o.classList.toggle("sel", o.dataset.op === op),
                    );
                } else {
                    /* left operand chosen: store operator, wait for right tile */
                    selOp = op;
                    Array.from(opsEl.children).forEach((o) =>
                        o.classList.toggle("sel", o.dataset.op === op),
                    );
                }
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
                clearTick();
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
                    setTimer();
                    updateHud();
                    clearTick();
                    tickId = setInterval(() => {
                        if (!active || over) {
                            clearTick();
                            return;
                        }
                        tLeft--;
                        setTimer();
                        updateHud();
                        if (tLeft <= 0) missPuzzle("Out of time");
                    }, 1000);
                }
            }

            function missPuzzle(reason) {
                lock = true;
                clearTick();
                fbEl.textContent = reason + " - puzzle missed.";
                fbEl.className = "t24-feedback bad";
                nextPuzzle(1300);
            }
            function nextPuzzle(delay) {
                const last = round >= ROUNDS;
                setTimeout(() => {
                    if (over) return;
                    if (last) finish();
                    else {
                        round++;
                        startRound();
                    }
                }, delay);
            }

            function undo() {
                if (lock && fbEl.className.indexOf("bad") === -1) return;
                if (!history.length || over || !started) return;
                tiles = history.pop();
                lock = false;
                clearSel();
                renderTiles();
                fbEl.textContent = "";
                fbEl.className = "t24-feedback";
            }
            function resetPuzzle() {
                if (over || !started) return;
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
                if (over || !started) return;
                missPuzzle("Skipped");
            }

            function finish() {
                over = true;
                clearTick();
                if (solved >= PASS) {
                    ovTitle.textContent = "Number cruncher!";
                    ovTitle.className = "mgp-ov-title mgp-win";
                    ovReason.textContent =
                        "You built 24 in " +
                        solved +
                        " of " +
                        ROUNDS +
                        " puzzles. Arithmetic ace!";
                } else {
                    ovTitle.textContent = "Target missed";
                    ovTitle.className = "mgp-ov-title mgp-lose";
                    ovReason.textContent =
                        "You solved " +
                        solved +
                        " of " +
                        ROUNDS +
                        " puzzles - goal was " +
                        PASS +
                        ". Remember: fractions are allowed!";
                }
                ovOver.removeAttribute("hidden");
            }

            function startGame() {
                clearTick();
                round = 1;
                solved = 0;
                over = false;
                started = true;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                startRound();
            }

            /* ---------------- events ---------------- */
            tilesEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest
                    ? e.target.closest(".t24-tile")
                    : null;
                if (el) tapTile(Number(el.dataset.i));
            });
            opsEl.addEventListener("pointerdown", (e) => {
                const el = e.target.closest ? e.target.closest(".t24-op") : null;
                if (el) tapOp(el.dataset.op);
            });
            const onKey = (e) => {
                if (!active) return;
                const k = e.key;
                if (k >= "1" && k <= "4") {
                    const i = Number(k) - 1;
                    if (i < tiles.length) tapTile(i);
                } else if (
                    k === "+" ||
                    k === "-" ||
                    k === "x" ||
                    k === "*" ||
                    k === "/"
                ) {
                    tapOp(k === "*" ? "x" : k);
                } else if (k === "u" || k === "U") undo();
                else if (k === "r" || k === "R") resetPuzzle();
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
                const a = btn.dataset.act;
                if (a === "start" || a === "restart") startGame();
                else if (a === "undo") undo();
                else if (a === "reset") resetPuzzle();
                else if (a === "skip") skipPuzzle();
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