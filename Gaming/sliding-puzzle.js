/* ==== GAME: sliding-puzzle.js ==== */

/* =============================================================
SLIDING PUZZLE - MGP puzzle module
Classic 15-puzzle in 3x3, 4x4 and 5x5. Shuffle is always
solvable: 150+ random legal moves from the solved state, never
undoing the previous move. Tiles are SVG groups animated with a
CSS transform transition. No canvas, no emoji, no assets.
============================================================= */
(() => {
    "use strict";

    MGP_REGISTER({
        id: "sliding-puzzle",
        name: "Sliding Puzzle",
        category: "puzzle",
        catLabel: "Puzzle",
        desc: "Slide tiles into the gap and order the board, classic 15-puzzle.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="14" height="14" rx="3"/><rect x="17" y="2" width="14" height="14" rx="3"/><rect x="32" y="2" width="14" height="14" rx="3"/><rect x="2" y="17" width="14" height="14" rx="3"/><rect x="17" y="17" width="14" height="14" rx="3"/><rect x="32" y="17" width="14" height="14" rx="3"/><rect x="2" y="32" width="14" height="14" rx="3"/><rect x="17" y="32" width="14" height="14" rx="3"/><g font-size="9" text-anchor="middle" font-family="inherit" fill="currentColor" stroke="none"><text x="9" y="12.5">1</text><text x="24" y="12.5">2</text><text x="39" y="12.5">3</text><text x="9" y="27.5">4</text><text x="24" y="27.5">5</text><text x="39" y="27.5">6</text><text x="9" y="42.5">7</text><text x="24" y="42.5">8</text></g></svg>',
        bg: ["#ede9fe", "#c4b5fd"],
        build(app) {
            /* ---------- scoped styles + shell ---------- */
            app.innerHTML = `
<style>
#sliding-puzzle-app .slp-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}
#sliding-puzzle-app svg.slp-svg{width:100%;height:100%;max-width:430px;max-height:100%;touch-action:manipulation}
#sliding-puzzle-app .slp-bg{fill:#111831;stroke:#ffffff14;stroke-width:1}
#sliding-puzzle-app .slp-tile{cursor:pointer;transition:transform .13s ease}
#sliding-puzzle-app .slp-r{fill:#6d28d9;stroke:#8b5cf6;stroke-width:1;transition:fill .15s}
#sliding-puzzle-app .slp-tile:hover .slp-r{fill:#7c3aed}
#sliding-puzzle-app .slp-ok .slp-r{fill:#047857;stroke:#10b981}
#sliding-puzzle-app .slp-t{fill:#ffffff;pointer-events:none}
#sliding-puzzle-app .mgp-dbtn[data-dir="up"]{grid-column:2}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Sliding Puzzle</span>
  <span class="mgp-chip">Moves <b data-hud="moves">0</b></span>
  <span class="mgp-chip">Time <b data-hud="time">0:00</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="size">Size: 3x3</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="slp-wrap">
    <svg class="slp-svg" viewBox="0 0 108 108" role="img" aria-label="Sliding puzzle board">
      <rect class="slp-bg" x="0.5" y="0.5" width="107" height="107" rx="10"></rect>
      <g class="slp-tiles"></g>
    </svg>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Sliding Puzzle</h2>
      <p class="mgp-ov-sub">Slide the tiles into the gap and line them up in order, 1 in the top left through to the last tile in the bottom right. Click or tap a tile next to the gap, use the arrow keys or the on-screen pad. The timer starts on your first move. Every shuffle is guaranteed solvable.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">You win</h2>
      <p class="mgp-ov-sub" data-ov="reason">...</p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot">
  <div class="mgp-dpad" aria-label="Direction pad">
    <button class="mgp-dbtn" data-dir="up" aria-label="Slide tile up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>
    <button class="mgp-dbtn" data-dir="left" aria-label="Slide tile left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></button>
    <button class="mgp-dbtn" data-dir="down" aria-label="Slide tile down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>
    <button class="mgp-dbtn" data-dir="right" aria-label="Slide tile right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg></button>
  </div>
  <span class="mgp-hint">Arrow Up slides the tile below the gap up. Green tiles sit in their final spot. Change the board size in the HUD.</span>
</div>`;

            /* ---------- helpers ---------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const NS = "http://www.w3.org/2000/svg";
            const mk = (tag, attrs, parent) => {
                const el = document.createElementNS(NS, tag);
                for (const k in attrs) el.setAttribute(k, attrs[k]);
                if (parent) parent.appendChild(el);
                return el;
            };

            const svg = $(".slp-svg");
            const bg = $(".slp-bg");
            const gTiles = $(".slp-tiles");
            const hud = {
                moves: $('[data-hud="moves"]'),
                time: $('[data-hud="time"]'),
            };
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]', ovOver);
            const ovReason = $('[data-ov="reason"]', ovOver);
            const sizeBtn = $('[data-act="size"]');

            const SIZES = [3, 4, 5];
            const U = 36; // svg units per tile

            /* ---------- pure rules (exposed via _test) ---------- */
            /* tiles: array of length cols*rows, values 1..N-1, 0 = the gap */
            function solvedTiles(cols, rows) {
                const t = [];
                for (let i = 1; i < cols * rows; i++) t.push(i);
                t.push(0);
                return t;
            }

            function isSolved(tiles, cols) {
                const n = tiles.length;
                for (let i = 0; i < n - 1; i++)
                    if (tiles[i] !== i + 1) return false;
                return tiles[n - 1] === 0;
            }

            /* pure: slide the tile at index idx into the gap when it is
         orthogonally adjacent; returns a NEW array, or null when the
         move is illegal. */
            function applyMove(tiles, idx, cols) {
                const n = tiles.length;
                if (idx < 0 || idx >= n || tiles[idx] === 0) return null;
                const gap = tiles.indexOf(0);
                const dr = Math.floor(idx / cols) - Math.floor(gap / cols);
                const dc = (idx % cols) - (gap % cols);
                if (Math.abs(dr) + Math.abs(dc) !== 1) return null;
                const out = tiles.slice();
                out[gap] = tiles[idx];
                out[idx] = 0;
                return out;
            }

            /* always-solvable shuffle: 150+ random legal moves from the
         solved state, never immediately undoing the previous move.
         Returns { tiles, moves } where moves lists the tile values in
         the order they were slid. */
            function genShuffle(cols, rows) {
                let tiles = solvedTiles(cols, rows);
                const n = cols * rows;
                const steps = Math.max(150, n * 18);
                const moves = [];
                let prevTile = -1;
                for (let s = 0; s < steps; s++) {
                    const gap = tiles.indexOf(0);
                    const r = Math.floor(gap / cols),
                        c = gap % cols;
                    const cand = [];
                    if (r > 0) cand.push(gap - cols);
                    if (r < rows - 1) cand.push(gap + cols);
                    if (c > 0) cand.push(gap - 1);
                    if (c < cols - 1) cand.push(gap + 1);
                    let pool = cand.filter((i) => tiles[i] !== prevTile);
                    if (!pool.length) pool = cand;
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    const val = tiles[pick];
                    moves.push(val);
                    tiles = tiles.slice();
                    tiles[gap] = val;
                    tiles[pick] = 0;
                    prevTile = val;
                }
                if (isSolved(tiles, cols)) return genShuffle(cols, rows); // astronomically rare
                return { tiles, moves };
            }

            /* proof of solvability: replay every shuffle move backwards.
         Returns the solved board, or null when any inverse move is
         illegal (which would mean the shuffle was broken). */
            function replayInverse(tiles, moves, cols) {
                let t = tiles.slice();
                for (let k = moves.length - 1; k >= 0; k--) {
                    const idx = t.indexOf(moves[k]);
                    const next = applyMove(t, idx, cols);
                    if (!next) return null;
                    t = next;
                }
                return t;
            }

            /* ---------- state ---------- */
            let sizeIdx = 0;
            let cols = 3,
                rows = 3;
            let tiles = solvedTiles(3, 3);
            let moves = 0,
                timeSec = 0,
                timerOn = false,
                timerId = null;
            let started = false,
                over = false,
                active = false;
            let timers = [];
            const tileEls = {}; // value -> <g>

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

            /* ---------- board ---------- */
            function buildBoard() {
                gTiles.innerHTML = "";
                for (const k in tileEls) delete tileEls[k];
                const W = cols * U,
                    H = rows * U;
                svg.setAttribute("viewBox", "0 0 " + W + " " + H);
                bg.setAttribute("width", W - 1);
                bg.setAttribute("height", H - 1);
                for (let v = 1; v < cols * rows; v++) {
                    const idx = tiles.indexOf(v);
                    const g = mk("g", { class: "slp-tile", "data-v": v }, gTiles);
                    mk(
                        "rect",
                        {
                            x: 2,
                            y: 2,
                            width: U - 4,
                            height: U - 4,
                            rx: 8,
                            class: "slp-r",
                        },
                        g,
                    );
                    const t = mk(
                        "text",
                        {
                            x: U / 2,
                            y: U / 2 + 6,
                            "text-anchor": "middle",
                            "font-family": "inherit",
                            "font-size": "17",
                            "font-weight": "700",
                            class: "slp-t",
                        },
                        g,
                    );
                    t.textContent = String(v);
                    /* set the transform before the node enters the layout tree so
                 the slide transition does not fire on creation */
                    g.style.transform =
                        "translate(" +
                        (idx % cols) * U +
                        "px," +
                        Math.floor(idx / cols) * U +
                        "px)";
                    tileEls[v] = g;
                }
                markCorrect();
            }

            function markCorrect() {
                for (let v = 1; v < cols * rows; v++) {
                    const idx = tiles.indexOf(v);
                    tileEls[v].classList.toggle("slp-ok", idx === v - 1);
                }
            }

            function renderTiles() {
                for (let v = 1; v < cols * rows; v++) {
                    const idx = tiles.indexOf(v);
                    tileEls[v].style.transform =
                        "translate(" +
                        (idx % cols) * U +
                        "px," +
                        Math.floor(idx / cols) * U +
                        "px)";
                }
                markCorrect();
            }

            function updateHud() {
                hud.moves.textContent = String(moves);
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

            /* ---------- game flow ---------- */
            function newGame() {
                clearTimers();
                stopTimer();
                cols = rows = SIZES[sizeIdx];
                const sh = genShuffle(cols, rows);
                tiles = sh.tiles;
                moves = 0;
                timeSec = 0;
                over = false;
                ovOver.hidden = true;
                buildBoard();
                updateHud();
            }

            function tryMove(idx) {
                if (!active || !started || over) return;
                const next = applyMove(tiles, idx, cols);
                if (!next) return;
                tiles = next;
                ensureTimer();
                moves++;
                renderTiles();
                updateHud();
                if (isSolved(tiles, cols)) winGame();
            }

            /* dir "up" = the tile BELOW the gap moves up, etc. */
            function moveDir(dir) {
                const gap = tiles.indexOf(0);
                const r = Math.floor(gap / cols),
                    c = gap % cols;
                let idx = -1;
                if (dir === "up" && r < rows - 1) idx = gap + cols;
                else if (dir === "down" && r > 0) idx = gap - cols;
                else if (dir === "left" && c < cols - 1) idx = gap + 1;
                else if (dir === "right" && c > 0) idx = gap - 1;
                if (idx >= 0) tryMove(idx);
            }

            function winGame() {
                over = true;
                stopTimer();
                updateHud();
                later(showOver, 450);
            }

            function showOver() {
                if (!over) return;
                ovTitle.classList.remove("mgp-win", "mgp-lose");
                ovTitle.textContent = "You win";
                ovTitle.classList.add("mgp-win");
                ovReason.textContent =
                    "Solved the " +
                    cols +
                    "x" +
                    rows +
                    " board in " +
                    moves +
                    " moves and " +
                    fmt(timeSec) +
                    ".";
                ovOver.hidden = false;
            }

            /* ---------- input ---------- */
            gTiles.addEventListener("click", (e) => {
                const g = e.target.closest ? e.target.closest(".slp-tile") : null;
                if (!g) return;
                tryMove(tiles.indexOf(Number(g.dataset.v)));
            });

            app.querySelectorAll(".mgp-dbtn").forEach((b) => {
                b.addEventListener("click", () => moveDir(b.dataset.dir));
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
                if (!started || over) {
                    if (isArrow) e.preventDefault(); // still block page scroll while playing
                    return;
                }
                e.preventDefault();
                if (k === "ArrowUp") moveDir("up");
                else if (k === "ArrowDown") moveDir("down");
                else if (k === "ArrowLeft") moveDir("left");
                else if (k === "ArrowRight") moveDir("right");
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
            sizeBtn.addEventListener("click", () => {
                sizeIdx = (sizeIdx + 1) % SIZES.length;
                sizeBtn.textContent =
                    "Size: " + SIZES[sizeIdx] + "x" + SIZES[sizeIdx];
                newGame();
            });

            /* ---------- boot ---------- */
            newGame();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                    renderTiles();
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
                    isSolved, // (tiles, cols) -> bool
                    applyMove, // (tiles, idx, cols) -> new tiles | null (pure)
                    genShuffle, // (cols, rows) -> { tiles, moves } (always solvable)
                    replayInverse, // (tiles, moves, cols) -> solved tiles | null (solvability proof)
                    solvedTiles, // (cols, rows) -> [1..N-1, 0]
                },
            };
        },
    });
})();