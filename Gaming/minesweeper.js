/* ==== GAME: minesweeper.js ==== */

/* =============================================================
MINESWEEPER - MGP puzzle module
Classic minesweeper: safe first click (3x3 mine-free zone),
flood reveal (BFS), flags, wrong-flag highlighting, timer and
three difficulty boards. Pure inline SVG, no canvas, no emoji.
============================================================= */
(() => {
    "use strict";

    MGP_REGISTER({
        id: "minesweeper",
        name: "Minesweeper",
        category: "puzzle",
        catLabel: "Puzzle",
        desc: "Reveal every safe cell, flag the mines, never click the wrong one.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 19v-7M18 39v7M8 29H1M28 29h6M25 22l5-5M11 22l-5-5M25 36l5 5M11 36l-5 5" stroke-width="2.5"/><circle cx="18" cy="29" r="8" fill="currentColor" stroke="none"/><circle cx="15.2" cy="26.2" r="1.7" fill="#ffffff" stroke="none" opacity=".8"/><path d="M40 13v24"/><path d="M40 13l8 3.5-8 3.5z" fill="currentColor" stroke="none"/><path d="M36 37h8"/></svg>',
        bg: ["#fee2e2", "#fecaca"],
        build(app) {
            /* ---------- scoped styles + shell ---------- */
            app.innerHTML = `
<style>
#minesweeper-app .msw-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}
#minesweeper-app svg.msw-svg{width:100%;height:100%;max-width:660px;max-height:100%;touch-action:manipulation}
#minesweeper-app .msw-cell{cursor:pointer}
#minesweeper-app .msw-hid{fill:#2c3a5e;stroke:#3d4f7d;stroke-width:1;transition:fill .12s}
#minesweeper-app .msw-hid:hover{fill:#3d5083}
#minesweeper-app .msw-open{fill:#151d33;stroke:#253156;stroke-width:1;cursor:default}
#minesweeper-app .msw-dead{fill:#b91c1c;stroke:#b91c1c}
#minesweeper-app .msw-num{pointer-events:none}
#minesweeper-app .msw-cur{fill:none;stroke:#f1f5f9;stroke-width:1.6;stroke-dasharray:5 4;opacity:.9;pointer-events:none}
#minesweeper-app .mgp-btn.msw-on{background:#f59e0b;color:#201400}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Minesweeper</span>
  <span class="mgp-chip">Mines <b data-hud="mines">10</b></span>
  <span class="mgp-chip">Time <b data-hud="time">0:00</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="flag">Flag: off</button>
  <button class="mgp-btn ghost" data-act="diff">Easy 9x9</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="msw-wrap">
    <svg class="msw-svg" viewBox="0 0 270 270" role="img" aria-label="Minesweeper board">
      <g class="msw-cells"></g>
      <rect class="msw-cur" x="1" y="1" width="28" height="28" rx="4" visibility="hidden"></rect>
    </svg>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Minesweeper</h2>
      <p class="mgp-ov-sub">Reveal every cell that is not a mine. A number shows how many mines touch that cell; an empty cell opens its neighbors. Flag the mines you find: right click on desktop or the Flag button on touch. Your first click is always safe. Clear every safe cell to win.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Game over</h2>
      <p class="mgp-ov-sub" data-ov="reason">...</p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Left click or tap reveals. Right click or the Flag button flags a cell. Arrow keys move the cursor, Space reveals, F flags.</span></div>`;

            /* ---------- helpers ---------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const NS = "http://www.w3.org/2000/svg";
            const mk = (tag, attrs, parent) => {
                const el = document.createElementNS(NS, tag);
                for (const k in attrs) el.setAttribute(k, attrs[k]);
                if (parent) parent.appendChild(el);
                return el;
            };

            const svg = $(".msw-svg");
            const gCells = $(".msw-cells");
            const curEl = $(".msw-cur");
            const hud = {
                mines: $('[data-hud="mines"]'),
                time: $('[data-hud="time"]'),
            };
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]', ovOver);
            const ovReason = $('[data-ov="reason"]', ovOver);
            const flagBtn = $('[data-act="flag"]');
            const diffBtn = $('[data-act="diff"]');

            const CS = 30; // svg units per cell
            const DIFFS = [
                { label: "Easy", cols: 9, rows: 9, mines: 10 },
                { label: "Medium", cols: 12, rows: 12, mines: 24 },
                { label: "Hard", cols: 16, rows: 14, mines: 45 },
            ];
            const NUM_COLORS = [
                "",
                "#93c5fd",
                "#86efac",
                "#fca5a5",
                "#c4b5fd",
                "#fbbf24",
                "#67e8f9",
                "#f9a8d4",
                "#cbd5e1",
            ];
            const RAYS = [
                [0, -1],
                [0, 1],
                [-1, 0],
                [1, 0],
                [0.71, -0.71],
                [0.71, 0.71],
                [-0.71, -0.71],
                [-0.71, 0.71],
            ];

            /* ---------- pure rules (exposed via _test) ---------- */
            /* grid: 2D array rows[y][x], 1 = mine, 0 = safe */
            function neighborCount(grid, x, y) {
                let n = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue;
                        const nx = x + dx,
                            ny = y + dy;
                        if (
                            ny < 0 ||
                            ny >= grid.length ||
                            nx < 0 ||
                            nx >= grid[0].length
                        )
                            continue;
                        if (grid[ny][nx]) n++;
                    }
                }
                return n;
            }

            /* mine grid guaranteeing a mine-free 3x3 zone around (safeX, safeY);
         if the board is too small for that, at least the safe cell itself
         is kept mine-free. */
            function placeMines(cols, rows, count, safeX, safeY) {
                const grid = [];
                for (let y = 0; y < rows; y++) grid.push(new Array(cols).fill(0));
                const inSafe = (x, y) =>
                    Math.abs(x - safeX) <= 1 && Math.abs(y - safeY) <= 1;
                let pool = [];
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++)
                        if (!inSafe(x, y)) pool.push([x, y]);
                }
                if (pool.length < count) {
                    // tiny board fallback: protect only the clicked cell
                    pool = [];
                    for (let y = 0; y < rows; y++) {
                        for (let x = 0; x < cols; x++)
                            if (!(x === safeX && y === safeY)) pool.push([x, y]);
                    }
                }
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const t = pool[i];
                    pool[i] = pool[j];
                    pool[j] = t;
                }
                const n = Math.max(0, Math.min(count, pool.length));
                for (let i = 0; i < n; i++) grid[pool[i][1]][pool[i][0]] = 1;
                return grid;
            }

            /* blank state builder: {cols, rows, mines, revealed, flags} */
            function makeState(cols, rows, mines) {
                const z = () => {
                    const g = [];
                    for (let y = 0; y < rows; y++) g.push(new Array(cols).fill(0));
                    return g;
                };
                return {
                    cols,
                    rows,
                    mines: mines || z(),
                    revealed: z(),
                    flags: z(),
                };
            }

            /* pure state transition: reveal (x, y) and BFS-flood every zero
         neighbor chain. Input state is never mutated; returns a NEW state
         (or the same object when nothing can be revealed: flagged, already
         open, or a mine). */
            function floodReveal(state, x, y) {
                if (x < 0 || y < 0 || x >= state.cols || y >= state.rows)
                    return state;
                if (
                    state.revealed[y][x] ||
                    state.flags[y][x] ||
                    state.mines[y][x]
                )
                    return state;
                const revealed = state.revealed.map((r) => r.slice());
                const q = [[x, y]];
                let head = 0;
                revealed[y][x] = 1;
                while (head < q.length) {
                    const c = q[head++];
                    const cx = c[0],
                        cy = c[1];
                    if (neighborCount(state.mines, cx, cy) !== 0) continue;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (!dx && !dy) continue;
                            const nx = cx + dx,
                                ny = cy + dy;
                            if (
                                nx < 0 ||
                                ny < 0 ||
                                nx >= state.cols ||
                                ny >= state.rows
                            )
                                continue;
                            if (
                                revealed[ny][nx] ||
                                state.flags[ny][nx] ||
                                state.mines[ny][nx]
                            )
                                continue;
                            revealed[ny][nx] = 1;
                            q.push([nx, ny]);
                        }
                    }
                }
                return {
                    cols: state.cols,
                    rows: state.rows,
                    mines: state.mines,
                    flags: state.flags,
                    revealed,
                };
            }

            /* ---------- state ---------- */
            let diffIdx = 0;
            let cfg = DIFFS[0];
            let mines = [],
                revealed = [],
                flags = [];
            let placed = false,
                started = false,
                over = false,
                active = false;
            let outcome = null; // "win" | "lose"
            let deadX = -1,
                deadY = -1;
            let flagMode = false;
            let timeSec = 0,
                timerOn = false,
                timerId = null;
            let curX = 0,
                curY = 0;
            let timers = [];

            const later = (fn, ms) => {
                const t = setTimeout(() => {
                    timers = timers.filter((x) => x !== t);
                    fn();
                }, ms);
                timers.push(t);
                return t;
            };
            const clearTimers = () => {
                timers.forEach(clearTimeout);
                timers = [];
            };
            const fmt = (t) =>
                Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");

            /* ---------- drawing ---------- */
            function drawMine(parent, px, py) {
                const mx = px + CS / 2,
                    my = py + CS / 2;
                for (let i = 0; i < RAYS.length; i++) {
                    const dx = RAYS[i][0],
                        dy = RAYS[i][1];
                    mk(
                        "line",
                        {
                            x1: mx + dx * 8.5,
                            y1: my + dy * 8.5,
                            x2: mx + dx * 12.5,
                            y2: my + dy * 12.5,
                            stroke: "#cbd5e1",
                            "stroke-width": "2",
                            "stroke-linecap": "round",
                            "pointer-events": "none",
                        },
                        parent,
                    );
                }
                mk(
                    "circle",
                    {
                        cx: mx,
                        cy: my,
                        r: "7",
                        fill: "#cbd5e1",
                        stroke: "none",
                        "pointer-events": "none",
                    },
                    parent,
                );
                mk(
                    "circle",
                    {
                        cx: mx - 2.4,
                        cy: my - 2.4,
                        r: "1.6",
                        fill: "#0b1020",
                        opacity: ".55",
                        stroke: "none",
                        "pointer-events": "none",
                    },
                    parent,
                );
            }

            function drawFlag(parent, px, py, wrong) {
                const main = wrong ? "#ef4444" : "#fbbf24";
                const lineC = wrong ? "#fca5a5" : "#e2e8f0";
                mk(
                    "line",
                    {
                        x1: px + 11,
                        y1: py + 6,
                        x2: px + 11,
                        y2: py + 24,
                        stroke: lineC,
                        "stroke-width": "2",
                        "stroke-linecap": "round",
                        "pointer-events": "none",
                    },
                    parent,
                );
                mk(
                    "path",
                    {
                        d: "M" + (px + 12) + " " + (py + 7) + "l10 4-10 4z",
                        fill: main,
                        stroke: "none",
                        "pointer-events": "none",
                    },
                    parent,
                );
                mk(
                    "line",
                    {
                        x1: px + 7,
                        y1: py + 24,
                        x2: px + 17,
                        y2: py + 24,
                        stroke: lineC,
                        "stroke-width": "2",
                        "stroke-linecap": "round",
                        "pointer-events": "none",
                    },
                    parent,
                );
                if (wrong) {
                    mk(
                        "line",
                        {
                            x1: px + 7,
                            y1: py + 7,
                            x2: px + 23,
                            y2: py + 23,
                            stroke: "#ef4444",
                            "stroke-width": "2.4",
                            "stroke-linecap": "round",
                            "pointer-events": "none",
                        },
                        parent,
                    );
                    mk(
                        "line",
                        {
                            x1: px + 23,
                            y1: py + 7,
                            x2: px + 7,
                            y2: py + 23,
                            stroke: "#ef4444",
                            "stroke-width": "2.4",
                            "stroke-linecap": "round",
                            "pointer-events": "none",
                        },
                        parent,
                    );
                }
            }

            function render() {
                gCells.innerHTML = "";
                for (let y = 0; y < cfg.rows; y++) {
                    for (let x = 0; x < cfg.cols; x++) {
                        const px = x * CS,
                            py = y * CS;
                        const g = mk("g", {}, gCells);
                        const rect = mk(
                            "rect",
                            {
                                x: px + 1,
                                y: py + 1,
                                width: CS - 2,
                                height: CS - 2,
                                rx: "4",
                                "data-x": x,
                                "data-y": y,
                            },
                            g,
                        );
                        if (revealed[y][x]) {
                            const isDead = x === deadX && y === deadY;
                            rect.setAttribute(
                                "class",
                                "msw-cell msw-open" + (isDead ? " msw-dead" : ""),
                            );
                            if (mines[y][x]) {
                                drawMine(g, px, py);
                            } else {
                                const c = neighborCount(mines, x, y);
                                if (c > 0) {
                                    const t = mk(
                                        "text",
                                        {
                                            x: px + CS / 2,
                                            y: py + CS / 2 + 5.4,
                                            "text-anchor": "middle",
                                            "font-family": "inherit",
                                            "font-size": "15",
                                            "font-weight": "700",
                                            fill: NUM_COLORS[c],
                                            class: "msw-num",
                                        },
                                        g,
                                    );
                                    t.textContent = String(c);
                                }
                            }
                        } else {
                            rect.setAttribute("class", "msw-cell msw-hid");
                            if (flags[y][x]) {
                                drawFlag(g, px, py, over && !mines[y][x]); // wrong flags turn red on loss
                            } else if (over && mines[y][x]) {
                                drawMine(g, px, py); // lose: reveal unflagged mines
                            }
                        }
                    }
                }
                positionCursor();
            }

            function positionCursor() {
                curEl.setAttribute("x", curX * CS + 1);
                curEl.setAttribute("y", curY * CS + 1);
                curEl.setAttribute("width", CS - 2);
                curEl.setAttribute("height", CS - 2);
                curEl.setAttribute(
                    "visibility",
                    started && !over ? "visible" : "hidden",
                );
            }

            function flagCount() {
                let n = 0;
                for (let y = 0; y < cfg.rows; y++)
                    for (let x = 0; x < cfg.cols; x++) if (flags[y][x]) n++;
                return n;
            }
            function revealedCount() {
                let n = 0;
                for (let y = 0; y < cfg.rows; y++)
                    for (let x = 0; x < cfg.cols; x++) if (revealed[y][x]) n++;
                return n;
            }
            function updateHud() {
                hud.mines.textContent = String(cfg.mines - flagCount());
                hud.time.textContent = fmt(timeSec);
            }

            /* ---------- timer ---------- */
            function beginTick() {
                if (timerId !== null) clearInterval(timerId);
                timerId = setInterval(() => {
                    timeSec++;
                    hud.time.textContent = fmt(timeSec);
                }, 1000);
            }
            function startTimer() {
                timerOn = true;
                timeSec = 0;
                beginTick();
            }
            function stopTimer() {
                timerOn = false;
                if (timerId !== null) {
                    clearInterval(timerId);
                    timerId = null;
                }
            }

            /* ---------- game flow ---------- */
            function blankGrid() {
                const g = [];
                for (let y = 0; y < cfg.rows; y++)
                    g.push(new Array(cfg.cols).fill(0));
                return g;
            }

            function newGame() {
                clearTimers();
                stopTimer();
                cfg = DIFFS[diffIdx];
                mines = blankGrid();
                revealed = blankGrid();
                flags = blankGrid();
                placed = false;
                over = false;
                outcome = null;
                deadX = -1;
                deadY = -1;
                timeSec = 0;
                curX = 0;
                curY = 0;
                svg.setAttribute(
                    "viewBox",
                    "0 0 " + cfg.cols * CS + " " + cfg.rows * CS,
                );
                ovOver.hidden = true;
                render();
                updateHud();
            }

            function toggleFlag(x, y) {
                if (!active || !started || over) return;
                if (revealed[y][x]) return;
                flags[y][x] = flags[y][x] ? 0 : 1;
                render();
                updateHud();
            }

            function revealCell(x, y) {
                if (!active || !started || over) return;
                if (revealed[y][x] || flags[y][x]) return;
                if (!placed) {
                    // mines go in AFTER the first reveal, first click + neighbors safe
                    mines = placeMines(cfg.cols, cfg.rows, cfg.mines, x, y);
                    placed = true;
                    startTimer();
                }
                if (mines[y][x]) {
                    lose(x, y);
                    return;
                }
                const st = floodReveal(
                    { cols: cfg.cols, rows: cfg.rows, mines, revealed, flags },
                    x,
                    y,
                );
                revealed = st.revealed;
                render();
                updateHud();
                if (revealedCount() === cfg.cols * cfg.rows - cfg.mines) win();
            }

            function win() {
                over = true;
                outcome = "win";
                stopTimer();
                for (let y = 0; y < cfg.rows; y++) {
                    for (let x = 0; x < cfg.cols; x++)
                        if (mines[y][x]) flags[y][x] = 1;
                }
                render();
                updateHud();
                later(showOver, 650);
            }

            function lose(x, y) {
                over = true;
                outcome = "lose";
                deadX = x;
                deadY = y;
                revealed[y][x] = 1; // open the exploded cell so it renders with the red background
                stopTimer();
                render();
                updateHud();
                later(showOver, 800);
            }

            function showOver() {
                if (!over || !outcome) return;
                ovTitle.classList.remove("mgp-win", "mgp-lose");
                if (outcome === "win") {
                    ovTitle.textContent = "You win";
                    ovTitle.classList.add("mgp-win");
                    ovReason.textContent =
                        "All " +
                        (cfg.cols * cfg.rows - cfg.mines) +
                        " safe cells cleared in " +
                        fmt(timeSec) +
                        " on " +
                        cfg.label +
                        " (" +
                        cfg.cols +
                        "x" +
                        cfg.rows +
                        ", " +
                        cfg.mines +
                        " mines).";
                } else {
                    ovTitle.textContent = "Boom";
                    ovTitle.classList.add("mgp-lose");
                    ovReason.textContent =
                        "You hit a mine after " +
                        fmt(timeSec) +
                        ". Every mine is now shown; wrong flags are crossed out in red.";
                }
                ovOver.hidden = false;
            }

            /* ---------- input ---------- */
            svg.addEventListener("click", (e) => {
                const t = e.target;
                if (t.dataset && t.dataset.x !== undefined) {
                    const x = Number(t.dataset.x),
                        y = Number(t.dataset.y);
                    if (flagMode) toggleFlag(x, y);
                    else revealCell(x, y);
                }
            });
            svg.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                const t = e.target;
                if (t.dataset && t.dataset.x !== undefined) {
                    toggleFlag(Number(t.dataset.x), Number(t.dataset.y));
                }
            });

            const onKey = (e) => {
                if (!active) return;
                if (e.target && e.target.tagName === "BUTTON") return; // let focused buttons work
                const k = e.key;
                if (
                    k === "ArrowUp" ||
                    k === "ArrowDown" ||
                    k === "ArrowLeft" ||
                    k === "ArrowRight"
                ) {
                    e.preventDefault();
                    if (!started || over) return;
                    if (k === "ArrowUp") curY = Math.max(0, curY - 1);
                    else if (k === "ArrowDown")
                        curY = Math.min(cfg.rows - 1, curY + 1);
                    else if (k === "ArrowLeft") curX = Math.max(0, curX - 1);
                    else curX = Math.min(cfg.cols - 1, curX + 1);
                    positionCursor();
                } else if (k === " " || k === "Enter") {
                    if (!started || over) return; // do not swallow Space/Enter for buttons/links
                    e.preventDefault();
                    if (flagMode) toggleFlag(curX, curY);
                    else revealCell(curX, curY);
                } else if (k === "f" || k === "F") {
                    if (started && !over) toggleFlag(curX, curY);
                }
            };
            document.addEventListener("keydown", onKey);

            /* ---------- buttons ---------- */
            const startNew = () => {
                newGame();
                started = true;
                ovStart.hidden = true;
                ovOver.hidden = true;
            };
            app
                .querySelectorAll('[data-act="start"]')
                .forEach((b) => b.addEventListener("click", startNew));
            $('[data-act="restart"]').addEventListener("click", startNew);
            flagBtn.addEventListener("click", () => {
                flagMode = !flagMode;
                flagBtn.textContent = flagMode ? "Flag: on" : "Flag: off";
                flagBtn.classList.toggle("msw-on", flagMode);
            });
            diffBtn.addEventListener("click", () => {
                diffIdx = (diffIdx + 1) % DIFFS.length;
                diffBtn.textContent =
                    DIFFS[diffIdx].label +
                    " " +
                    DIFFS[diffIdx].cols +
                    "x" +
                    DIFFS[diffIdx].rows;
                newGame();
            });

            /* ---------- boot ---------- */
            newGame();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                    render();
                    updateHud();
                    if (timerOn && timerId === null) beginTick();
                    if (over && ovOver.hidden) showOver();
                },
                close() {
                    active = false;
                    clearTimers();
                    if (timerId !== null) {
                        clearInterval(timerId);
                        timerId = null;
                    }
                },
                _test: {
                    neighborCount, // (grid, x, y) -> count of mines in the 8 neighbors
                    placeMines, // (cols, rows, count, safeX, safeY) -> 2D mine grid, safe 3x3 zone
                    floodReveal, // (state, x, y) -> new state with BFS flood reveal (pure)
                    makeState, // (cols, rows, mines?) -> blank state for floodReveal
                },
            };
        },
    });
})();
