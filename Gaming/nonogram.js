/* ==== GAME: nonogram.js ==== */

/* =============================================================
NONOGRAM - MGP puzzle module
Picross: random mirror-symmetric pictures at ~55% density, run
length clues on top and left, clue dimming when a line matches,
X marks, 5-mistake limit and level progression. Pure inline SVG,
no canvas, no emoji, no assets.
============================================================= */
(() => {
    "use strict";

    MGP_REGISTER({
        id: "nonogram",
        name: "Nonogram",
        category: "puzzle",
        catLabel: "Puzzle",
        desc: "Fill cells from the number clues to reveal the hidden picture.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><text x="4" y="9" font-size="9" font-family="inherit" text-anchor="start" fill="currentColor" stroke="none">3 1</text><rect x="4" y="14" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="14" y="14" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="14" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="34" y="14" width="9" height="9" rx="1.5"/><rect x="4" y="24" width="9" height="9" rx="1.5"/><rect x="14" y="24" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="24" width="9" height="9" rx="1.5"/><rect x="34" y="24" width="9" height="9" rx="1.5"/><rect x="4" y="34" width="9" height="9" rx="1.5"/><rect x="14" y="34" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="34" width="9" height="9" rx="1.5" fill="currentColor" stroke="none"/><rect x="34" y="34" width="9" height="9" rx="1.5"/></svg>',
        bg: ["#ffedd5", "#fed7aa"],
        build(app) {
            /* ---------- scoped styles + shell ---------- */
            app.innerHTML = `
<style>
#nonogram-app .nono-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}
#nonogram-app svg.nono-svg{width:100%;height:100%;max-width:620px;max-height:100%;touch-action:manipulation}
#nonogram-app .nono-cell{cursor:pointer}
#nonogram-app .nono-empty{fill:#31406a;stroke:#41548a;stroke-width:1;transition:fill .12s}
#nonogram-app .nono-empty:hover{fill:#3d4f82}
#nonogram-app .nono-fill{fill:#0c1226;stroke:#0c1226;stroke-width:1;cursor:default}
#nonogram-app .nono-x{stroke:#8fa0c4;stroke-width:2;stroke-linecap:round;pointer-events:none}
#nonogram-app .nono-clue{fill:#d7deeb;font-weight:600;pointer-events:none;transition:opacity .15s}
#nonogram-app .nono-clue.nono-dim{opacity:.3}
#nonogram-app .nono-tint{fill:#f59e0b;stroke:#f59e0b;stroke-width:1;cursor:default}
#nonogram-app .nono-ghost{opacity:.32}
#nonogram-app .nono-err{fill:#ef4444;pointer-events:none;animation:nonoFlash .5s ease-out forwards}
#nonogram-app .mgp-btn.nono-on{background:#f59e0b;color:#201400}
@keyframes nonoFlash{0%{opacity:1}70%{opacity:.85}100%{opacity:0}}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Nonogram</span>
  <span class="mgp-chip">Level <b data-hud="level">1</b></span>
  <span class="mgp-chip">Mistakes <b data-hud="mis">0/5</b></span>
  <span class="mgp-chip">Time <b data-hud="time">0:00</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="xmode">X mode: off</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="nono-wrap">
    <svg class="nono-svg" viewBox="0 0 240 240" role="img" aria-label="Nonogram board">
      <g class="nono-clues"></g>
      <g class="nono-cells"></g>
      <g class="nono-fx"></g>
    </svg>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Nonogram</h2>
      <p class="mgp-ov-sub">Fill the cells that belong to the hidden picture. Each number is the length of an unbroken run of filled cells in that row or column, in order. Left click or tap fills a cell, right click or X mode marks a cell as empty. A clue greys out once its line matches exactly. Five wrong fills and you lose.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Picture complete</h2>
      <p class="mgp-ov-sub" data-ov="reason">...</p>
      <button class="mgp-btn ghost" data-act="start" data-ovbtn="again">Play again</button>
      <button class="mgp-btn" data-act="next" data-ovbtn="next">Next level</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Left click fills, right click or X mode marks empty. Clues grey out when the line matches. Boards grow to 7x7 and 9x7 in later levels.</span></div>`;

            /* ---------- helpers ---------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const NS = "http://www.w3.org/2000/svg";
            const mk = (tag, attrs, parent) => {
                const el = document.createElementNS(NS, tag);
                for (const k in attrs) el.setAttribute(k, attrs[k]);
                if (parent) parent.appendChild(el);
                return el;
            };

            const svg = $(".nono-svg");
            const gClues = $(".nono-clues");
            const gCells = $(".nono-cells");
            const gFx = $(".nono-fx");
            const hud = {
                level: $('[data-hud="level"]'),
                mis: $('[data-hud="mis"]'),
                time: $('[data-hud="time"]'),
            };
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]', ovOver);
            const ovReason = $('[data-ov="reason"]', ovOver);
            const againBtn = $('[data-ovbtn="again"]', ovOver);
            const nextBtn = $('[data-ovbtn="next"]', ovOver);
            const xBtn = $('[data-act="xmode"]');

            const CELL = 34; // svg units per grid cell
            const MAX_MISTAKES = 5;

            /* ---------- pure rules (exposed via _test) ---------- */
            /* run-length encoder: line is an array where 1 = filled, anything
         else counts as empty. Returns the clue, e.g. [1,2]; [] when empty. */
            function cluesFrom(line) {
                const out = [];
                let run = 0;
                for (let i = 0; i < line.length; i++) {
                    if (line[i] === 1) run++;
                    else if (run > 0) {
                        out.push(run);
                        run = 0;
                    }
                }
                if (run > 0) out.push(run);
                return out;
            }

            /* true when the filled pattern of line has exactly the given runs */
            function matchesClue(line, clues) {
                const a = cluesFrom(line);
                const b = clues || [];
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++)
                    if (a[i] !== b[i]) return false;
                return true;
            }

            /* random solution: ~55% density with horizontal mirror symmetry */
            function genSolution(w, h) {
                for (; ;) {
                    const half = Math.ceil(w / 2);
                    const sol = [];
                    let filled = 0;
                    for (let y = 0; y < h; y++) {
                        const row = new Array(w).fill(0);
                        for (let x = 0; x < half; x++) {
                            const v = Math.random() < 0.55 ? 1 : 0;
                            row[x] = v;
                            row[w - 1 - x] = v;
                        }
                        for (let x = 0; x < w; x++) filled += row[x];
                        sol.push(row);
                    }
                    if (filled >= w * h * 0.2 && filled <= w * h * 0.9) return sol;
                }
            }

            /* clue sets for a full solution: { rows: [[..]..], cols: [[..]..] } */
            function cluesOf(solution) {
                const h = solution.length,
                    w = solution[0].length;
                const rows = solution.map((r) => cluesFrom(r));
                const cols = [];
                for (let x = 0; x < w; x++) {
                    const col = [];
                    for (let y = 0; y < h; y++) col.push(solution[y][x]);
                    cols.push(cluesFrom(col));
                }
                return { rows, cols };
            }

            /* ---------- state ---------- */
            let level = 1,
                w = 5,
                h = 5;
            let sol = [],
                rowsClues = [],
                colsClues = [];
            let marks = []; // 0 empty, 1 filled, 2 X
            let mistakes = 0,
                xmode = false;
            let started = false,
                over = false,
                won = false,
                active = false;
            let timeSec = 0,
                timerOn = false,
                timerId = null;
            let timers = [];
            /* layout metrics */
            let clueFont = 14,
                stepX = 17,
                stepY = 18,
                gridX = 60,
                gridY = 60;

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

            /* ---------- timer ---------- */
            function beginTick() {
                if (timerId !== null) clearInterval(timerId);
                timerId = setInterval(() => {
                    timeSec++;
                    hud.time.textContent = fmt(timeSec);
                }, 1000);
            }
            function ensureTimer() {
                if (timerOn) return;
                timerOn = true;
                beginTick();
            }
            function stopTimer() {
                timerOn = false;
                if (timerId !== null) {
                    clearInterval(timerId);
                    timerId = null;
                }
            }

            /* ---------- level setup ---------- */
            function sizeFor(lv) {
                if (lv <= 2) return [5, 5];
                if (lv <= 4) return [7, 7];
                return [9, 7];
            }

            function layout() {
                clueFont = w <= 5 ? 14 : w <= 7 ? 13 : 12; // shrink font on big levels
                stepX = clueFont + 3;
                stepY = clueFont + 4;
                let maxRow = 1,
                    maxCol = 1;
                for (let i = 0; i < rowsClues.length; i++)
                    maxRow = Math.max(maxRow, rowsClues[i].length);
                for (let i = 0; i < colsClues.length; i++)
                    maxCol = Math.max(maxCol, colsClues[i].length);
                gridX = maxRow * stepX + 12;
                gridY = maxCol * stepY + 10;
                svg.setAttribute(
                    "viewBox",
                    "0 0 " + (gridX + w * CELL) + " " + (gridY + h * CELL),
                );
            }

            function newLevel(lv) {
                clearTimers();
                stopTimer();
                level = lv;
                over = false;
                won = false;
                const sz = sizeFor(lv);
                w = sz[0];
                h = sz[1];
                sol = genSolution(w, h);
                const cl = cluesOf(sol);
                rowsClues = cl.rows;
                colsClues = cl.cols;
                resetMarks();
                layout();
                render();
                updateHud();
            }

            /* restart the CURRENT puzzle from scratch */
            function restartPuzzle() {
                clearTimers();
                stopTimer();
                resetMarks();
                over = false;
                won = false;
                ovOver.hidden = true;
                render();
                updateHud();
            }

            function resetMarks() {
                mistakes = 0;
                timeSec = 0;
                marks = [];
                for (let y = 0; y < h; y++) marks.push(new Array(w).fill(0));
            }

            /* ---------- rendering ---------- */
            function render() {
                gClues.innerHTML = "";
                gCells.innerHTML = "";
                gFx.innerHTML = "";
                /* row clues (left, right-aligned toward the grid) */
                for (let y = 0; y < h; y++) {
                    const clues = rowsClues[y];
                    const list = clues.length ? clues : [0];
                    const dim = matchesClue(marks[y], clues);
                    const len = list.length;
                    for (let k = 0; k < len; k++) {
                        const tx = gridX - 10 - (len - k) * stepX + stepX / 2;
                        const ty = gridY + y * CELL + CELL / 2 + clueFont * 0.36;
                        const t = mk(
                            "text",
                            {
                                x: tx,
                                y: ty,
                                "text-anchor": "middle",
                                "font-family": "inherit",
                                "font-size": clueFont,
                                class: "nono-clue" + (dim ? " nono-dim" : ""),
                            },
                            gClues,
                        );
                        t.textContent = String(list[k]);
                    }
                }
                /* column clues (top, stacked toward the grid) */
                for (let x = 0; x < w; x++) {
                    const clues = colsClues[x];
                    const list = clues.length ? clues : [0];
                    const col = [];
                    for (let y = 0; y < h; y++) col.push(marks[y][x] === 1 ? 1 : 0);
                    const dim = matchesClue(col, clues);
                    const len = list.length;
                    for (let j = 0; j < len; j++) {
                        const ty = gridY - 8 - (len - j) * stepY + stepY / 2;
                        const tx = gridX + x * CELL + CELL / 2;
                        const t = mk(
                            "text",
                            {
                                x: tx,
                                y: ty + clueFont * 0.36,
                                "text-anchor": "middle",
                                "font-family": "inherit",
                                "font-size": clueFont,
                                class: "nono-clue" + (dim ? " nono-dim" : ""),
                            },
                            gClues,
                        );
                        t.textContent = String(list[j]);
                    }
                }
                /* cells */
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const px = gridX + x * CELL,
                            py = gridY + y * CELL;
                        const g = mk("g", {}, gCells);
                        const rect = mk(
                            "rect",
                            {
                                x: px + 1,
                                y: py + 1,
                                width: CELL - 2,
                                height: CELL - 2,
                                rx: "4",
                                "data-x": x,
                                "data-y": y,
                            },
                            g,
                        );
                        if (over) {
                            // end game: tint the picture (ghosted on a loss)
                            if (sol[y][x] === 1) {
                                rect.setAttribute(
                                    "class",
                                    "nono-cell nono-tint" + (won ? "" : " nono-ghost"),
                                );
                            } else {
                                rect.setAttribute("class", "nono-cell nono-empty");
                            }
                            continue;
                        }
                        const m = marks[y][x];
                        if (m === 1) {
                            rect.setAttribute("class", "nono-cell nono-fill");
                        } else {
                            rect.setAttribute("class", "nono-cell nono-empty");
                            if (m === 2) {
                                mk(
                                    "line",
                                    {
                                        x1: px + 10,
                                        y1: py + 10,
                                        x2: px + CELL - 10,
                                        y2: py + CELL - 10,
                                        class: "nono-x",
                                    },
                                    g,
                                );
                                mk(
                                    "line",
                                    {
                                        x1: px + CELL - 10,
                                        y1: py + 10,
                                        x2: px + 10,
                                        y2: py + CELL - 10,
                                        class: "nono-x",
                                    },
                                    g,
                                );
                            }
                        }
                    }
                }
            }

            function updateHud() {
                hud.level.textContent = String(level);
                hud.mis.textContent = mistakes + "/" + MAX_MISTAKES;
                hud.time.textContent = fmt(timeSec);
            }

            function checkWin() {
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        if (sol[y][x] === 1 && marks[y][x] !== 1) return false;
                        if (sol[y][x] === 0 && marks[y][x] === 1) return false;
                    }
                }
                return true;
            }

            /* ---------- game flow ---------- */
            function afterChange() {
                if (checkWin()) {
                    over = true;
                    won = true;
                    stopTimer();
                    render();
                    updateHud();
                    later(showOver, 650);
                    return;
                }
                render();
                updateHud();
            }

            function wrongFill(x, y) {
                mistakes++;
                marks[y][x] = 2; // rejected fill: flash red, then auto-marked empty
                if (mistakes >= MAX_MISTAKES) {
                    over = true;
                    won = false;
                    stopTimer();
                }
                render();
                addFlash(x, y);
                updateHud();
                if (over) later(showOver, 1000);
            }

            function addFlash(x, y) {
                const r = mk(
                    "rect",
                    {
                        x: gridX + x * CELL + 1,
                        y: gridY + y * CELL + 1,
                        width: CELL - 2,
                        height: CELL - 2,
                        rx: "4",
                        class: "nono-err",
                    },
                    gFx,
                );
                later(() => {
                    if (r.parentNode) r.parentNode.removeChild(r);
                }, 550);
            }

            function showOver() {
                if (!over) return;
                ovTitle.classList.remove("mgp-win", "mgp-lose");
                if (won) {
                    ovTitle.textContent = "Picture complete";
                    ovTitle.classList.add("mgp-win");
                    ovReason.textContent =
                        "Level " +
                        level +
                        " solved in " +
                        fmt(timeSec) +
                        " with " +
                        mistakes +
                        " mistake" +
                        (mistakes === 1 ? "" : "s") +
                        ".";
                } else {
                    ovTitle.textContent = "Too many mistakes";
                    ovTitle.classList.add("mgp-lose");
                    ovReason.textContent =
                        "Five cells were filled that do not belong to the picture. The hidden picture is shown faintly behind the board.";
                }
                againBtn.textContent = won ? "Play again" : "Try again";
                nextBtn.hidden = !won;
                ovOver.hidden = false;
            }

            /* ---------- input ---------- */
            function cellFill(x, y) {
                // left click / tap in fill mode
                if (!active || !started || over) return;
                ensureTimer();
                const m = marks[y][x];
                if (m === 1 || m === 2) {
                    // clear a fill or an X back to empty
                    marks[y][x] = 0;
                    afterChange();
                    return;
                }
                if (sol[y][x] === 1) {
                    marks[y][x] = 1;
                    afterChange();
                } else {
                    wrongFill(x, y);
                }
            }

            function cellX(x, y) {
                // X mode click or right click
                if (!active || !started || over) return;
                ensureTimer();
                const m = marks[y][x];
                marks[y][x] = m === 2 ? 0 : m === 1 ? 0 : 2;
                afterChange();
            }

            gCells.addEventListener("click", (e) => {
                const t = e.target;
                if (t.dataset && t.dataset.x !== undefined) {
                    const x = Number(t.dataset.x),
                        y = Number(t.dataset.y);
                    if (xmode) cellX(x, y);
                    else cellFill(x, y);
                }
            });
            gCells.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                const t = e.target;
                if (t.dataset && t.dataset.x !== undefined) {
                    cellX(Number(t.dataset.x), Number(t.dataset.y));
                }
            });

            const onKey = (e) => {
                if (!active) return;
                if (e.target && e.target.tagName === "BUTTON") return; // let focused buttons work
                const k = e.key;
                const isArrow =
                    k === "ArrowUp" ||
                    k === "ArrowDown" ||
                    k === "ArrowLeft" ||
                    k === "ArrowRight";
                if (!isArrow && k !== " ") return;
                if (started && !over) e.preventDefault(); // block page scroll while playing
            };
            document.addEventListener("keydown", onKey);

            /* ---------- buttons ---------- */
            const begin = () => {
                started = true;
                ovStart.hidden = true;
                ovOver.hidden = true;
            };
            $('[data-ov="start"] [data-act="start"]').addEventListener(
                "click",
                begin,
            );
            $('[data-act="restart"]').addEventListener("click", () => {
                restartPuzzle();
            });
            againBtn.addEventListener("click", () => {
                if (won)
                    newLevel(level); // fresh picture on the same level
                else restartPuzzle(); // retry the same unfinished picture
                begin();
            });
            nextBtn.addEventListener("click", () => {
                newLevel(level + 1);
                begin();
            });
            xBtn.addEventListener("click", () => {
                xmode = !xmode;
                xBtn.textContent = xmode ? "X mode: on" : "X mode: off";
                xBtn.classList.toggle("nono-on", xmode);
            });

            /* ---------- boot ---------- */
            newLevel(1);

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
                    cluesFrom, // (line) -> run lengths, e.g. [1,2], [] when empty
                    matchesClue, // (line, clues) -> bool (exact run-length match)
                    genSolution, // (w, h) -> 2D 0/1 solution, ~55% density, mirrored
                    cluesOf, // (solution) -> { rows: [...], cols: [...] }
                },
            };
        },
    });
})();
