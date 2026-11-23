/* ==== GAME: reversi.js ==== */

/* =============================================================
REVERSI (OTHELLO) - MGP board game module
8x8 green-felt board, black (you) vs white (AI). Standard
8-direction flips, legal-move rings, auto pass, game ends
when neither side can move. AI = greedy weight matrix (corners
best, X-squares worst) + flips, 600ms think delay; Easy =
random legal move. Inline SVG, CSS flip animation. No canvas,
no emoji, no external assets.
============================================================= */
(() => {
    "use strict";

    MGP_REGISTER({
        id: "reversi",
        name: "Reversi",
        category: "board",
        catLabel: "Board",
        desc: "Flip AI discs by trapping them between yours. Most discs wins.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="6" fill="#2f7d4f"/><circle cx="17" cy="17" r="6.5" fill="#f4f6fb"/><circle cx="31" cy="17" r="6.5" fill="#0d1526"/><circle cx="17" cy="31" r="6.5" fill="#0d1526"/><circle cx="31" cy="31" r="6.5" fill="#f4f6fb"/></svg>',
        bg: ["#bbf7d0", "#4ade80"],
        build(app) {
            /* ---------- scoped styles ---------- */
            app.innerHTML = `
<style>
#reversi-app .rv-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative}
#reversi-app svg.rv-svg{width:100%;height:100%;max-width:520px;max-height:520px}
#reversi-app .rv-cell{cursor:default}
#reversi-app .rv-cell.rv-play{cursor:pointer}
#reversi-app .rv-cell.rv-play:hover{fill:#49a873}
#reversi-app .rv-ring{fill:none;stroke:rgba(255,255,255,.55);stroke-width:2.5}
#reversi-app .rv-b{fill:#0d1526;stroke:#33415e;stroke-width:2}
#reversi-app .rv-w{fill:#f4f6fb;stroke:#b9c2d4;stroke-width:2}
#reversi-app .rv-disc{transform-box:fill-box;transform-origin:center}
#reversi-app .rv-pop{animation:rv-grow .22s ease-out}
@keyframes rv-grow{from{transform:scale(.2)}to{transform:scale(1)}}
#reversi-app .rv-flip{animation:rv-flip .3s ease-in-out}
@keyframes rv-flip{0%{transform:scaleX(1)}50%{transform:scaleX(.06)}100%{transform:scaleX(1)}}
#reversi-app .rv-marker{fill:#34d399;stroke:#0b1020;stroke-width:1.5}
#reversi-app .rv-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(17,24,49,.94);border:1px solid rgba(255,255,255,.16);color:#e5e7eb;padding:6px 16px;border-radius:999px;font-size:12.5px;font-weight:600;opacity:0;transition:opacity .25s;z-index:4;pointer-events:none;white-space:nowrap}
#reversi-app .rv-toast.rv-on{opacity:1}
#reversi-app .rv-think{animation:rv-blink 1.1s infinite}
@keyframes rv-blink{50%{opacity:.4}}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Reversi</span>
  <span class="mgp-chip">You <b data-hud="you">2</b></span>
  <span class="mgp-chip">AI <b data-hud="ai">2</b></span>
  <span class="mgp-chip">Turn <b data-hud="turn">Your turn</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="diff">AI: Greedy</button>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="rv-wrap">
    <svg class="rv-svg" viewBox="0 0 464 464" role="img" aria-label="Reversi board">
      <rect x="4" y="4" width="456" height="456" rx="10" fill="none" stroke="#17472f" stroke-width="5"/>
      <g class="rv-cells"></g>
      <g class="rv-rings"></g>
      <g class="rv-discs"></g>
      <circle class="rv-marker" r="5" style="display:none"/>
    </svg>
    <div class="rv-toast"></div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Reversi</h2>
      <p class="mgp-ov-sub">You play the black discs and move first. Click any ringed cell to place a disc; every AI disc trapped in a straight line between your new disc and another of yours flips to your color. If a side has no legal move the turn passes automatically. The game ends when neither side can move, and the most discs wins.</p>
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
<div class="mgp-foot"><span class="mgp-hint">Ringed cells are your legal moves. Corners are the strongest squares.</span></div>`;

            /* ---------- helpers ---------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const NS = "http://www.w3.org/2000/svg";
            const mk = (tag, attrs, parent) => {
                const el = document.createElementNS(NS, tag);
                for (const k in attrs) el.setAttribute(k, attrs[k]);
                if (parent) parent.appendChild(el);
                return el;
            };

            const gCells = $(".rv-cells");
            const gRings = $(".rv-rings");
            const gDiscs = $(".rv-discs");
            const marker = $(".rv-marker");
            const toastEl = $(".rv-toast");
            const hud = {
                you: $('[data-hud="you"]'),
                ai: $('[data-hud="ai"]'),
                turn: $('[data-hud="turn"]'),
            };
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]', ovOver);
            const ovReason = $('[data-ov="reason"]', ovOver);
            const diffBtn = $('[data-act="diff"]');

            const N = 8,
                CELL = 56,
                PAD = 8;
            const cxOf = (c) => PAD + CELL * c + CELL / 2;
            const cyOf = (r) => PAD + CELL * r + CELL / 2;
            const DIRS = [
                [-1, -1],
                [-1, 0],
                [-1, 1],
                [0, -1],
                [0, 1],
                [1, -1],
                [1, 0],
                [1, 1],
            ];
            const WT = [
                [120, -20, 20, 5, 5, 20, -20, 120],
                [-20, -40, -5, -5, -5, -5, -40, -20],
                [20, -5, 15, 3, 3, 15, -5, 20],
                [5, -5, 3, 3, 3, 3, -5, 5],
                [5, -5, 3, 3, 3, 3, -5, 5],
                [20, -5, 15, 3, 3, 15, -5, 20],
                [-20, -40, -5, -5, -5, -5, -40, -20],
                [120, -20, 20, 5, 5, 20, -20, 120],
            ];

            /* ---------- state ---------- */
            let grid,
                discEls,
                cellEls,
                turn,
                over,
                started = false,
                active = false;
            let diff = "greedy";
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

            /* ---------- cells ---------- */
            cellEls = [];
            for (let r = 0; r < N; r++) {
                cellEls.push([]);
                for (let c = 0; c < N; c++) {
                    const rc = mk(
                        "rect",
                        {
                            x: PAD + CELL * c,
                            y: PAD + CELL * r,
                            width: CELL,
                            height: CELL,
                            fill: (r + c) % 2 ? "#357f56" : "#3a8a5f",
                            class: "rv-cell",
                        },
                        gCells,
                    );
                    rc.addEventListener("pointerdown", () => humanPlay(r, c));
                    cellEls[r].push(rc);
                }
            }

            /* ---------- rules ---------- */
            function flipsFor(r, c, p) {
                if (grid[r][c]) return null;
                let all = null;
                for (const d of DIRS) {
                    let rr = r + d[0],
                        cc = c + d[1];
                    const line = [];
                    while (
                        rr >= 0 &&
                        rr < N &&
                        cc >= 0 &&
                        cc < N &&
                        grid[rr][cc] === 3 - p
                    ) {
                        line.push([rr, cc]);
                        rr += d[0];
                        cc += d[1];
                    }
                    if (
                        line.length &&
                        rr >= 0 &&
                        rr < N &&
                        cc >= 0 &&
                        cc < N &&
                        grid[rr][cc] === p
                    ) {
                        if (!all) all = [];
                        all = all.concat(line);
                    }
                }
                return all;
            }

            function legalMoves(p) {
                const out = [];
                for (let r = 0; r < N; r++)
                    for (let c = 0; c < N; c++) {
                        const f = flipsFor(r, c, p);
                        if (f) out.push({ r, c, flips: f });
                    }
                return out;
            }

            function counts() {
                let b = 0,
                    w = 0;
                for (let r = 0; r < N; r++)
                    for (let c = 0; c < N; c++) {
                        if (grid[r][c] === 1) b++;
                        else if (grid[r][c] === 2) w++;
                    }
                return { b, w };
            }

            /* ---------- rendering ---------- */
            function syncDiscs(flips, pr, pc) {
                const fmap = new Map();
                if (flips)
                    flips.forEach((f, i) => fmap.set(f[0] + "_" + f[1], i));
                for (let r = 0; r < N; r++)
                    for (let c = 0; c < N; c++) {
                        const v = grid[r][c];
                        let el = discEls[r][c];
                        if (!v) {
                            if (el) {
                                el.remove();
                                discEls[r][c] = null;
                            }
                            continue;
                        }
                        if (!el) {
                            el = mk(
                                "circle",
                                {
                                    cx: cxOf(c),
                                    cy: cyOf(r),
                                    r: 23,
                                    class: "rv-disc " + (v === 1 ? "rv-b" : "rv-w"),
                                },
                                gDiscs,
                            );
                            discEls[r][c] = el;
                            if (pr === r && pc === c) el.classList.add("rv-pop");
                            continue;
                        }
                        const idx = fmap.get(r + "_" + c);
                        if (idx !== undefined) {
                            const to = v;
                            later(() => el.classList.add("rv-flip"), idx * 45);
                            later(
                                () => {
                                    el.style.fill = to === 1 ? "#0d1526" : "#f4f6fb";
                                    el.style.stroke = to === 1 ? "#33415e" : "#b9c2d4";
                                },
                                idx * 45 + 150,
                            );
                            later(
                                () => {
                                    el.classList.remove("rv-flip");
                                    el.setAttribute(
                                        "class",
                                        "rv-disc " + (to === 1 ? "rv-b" : "rv-w"),
                                    );
                                    el.style.fill = "";
                                    el.style.stroke = "";
                                },
                                idx * 45 + 330,
                            );
                        } else {
                            el.setAttribute(
                                "class",
                                "rv-disc " + (v === 1 ? "rv-b" : "rv-w"),
                            );
                        }
                    }
            }

            function renderRings() {
                gRings.innerHTML = "";
                const play = active && started && !over && turn === 1;
                for (let r = 0; r < N; r++)
                    for (let c = 0; c < N; c++) {
                        const legal = play && !!flipsFor(r, c, 1);
                        cellEls[r][c].classList.toggle("rv-play", legal);
                        if (legal)
                            mk(
                                "circle",
                                { cx: cxOf(c), cy: cyOf(r), r: 9, class: "rv-ring" },
                                gRings,
                            );
                    }
            }

            function setMarker(r, c) {
                marker.setAttribute("cx", cxOf(c));
                marker.setAttribute("cy", cyOf(r));
                marker.style.display = "";
            }

            function updateHud() {
                const n = counts();
                hud.you.textContent = n.b;
                hud.ai.textContent = n.w;
                hud.turn.classList.remove("rv-think");
                if (over) hud.turn.textContent = "Game over";
                else if (turn === 1) hud.turn.textContent = "Your turn";
                else {
                    hud.turn.textContent = "AI thinking";
                    hud.turn.classList.add("rv-think");
                }
            }

            function toast(msg) {
                toastEl.textContent = msg;
                toastEl.classList.add("rv-on");
                later(() => toastEl.classList.remove("rv-on"), 1600);
            }

            /* ---------- turn flow ---------- */
            function humanPlay(r, c) {
                if (!active || !started || over || turn !== 1) return;
                const f = flipsFor(r, c, 1);
                if (!f) return;
                place(r, c, 1, f);
            }

            function place(r, c, p, flips) {
                grid[r][c] = p;
                for (const f of flips) grid[f[0]][f[1]] = p;
                syncDiscs(flips, r, c);
                setMarker(r, c);
                updateHud();
                advance(p);
            }

            function advance(p) {
                const o = 3 - p;
                const mo = legalMoves(o);
                if (mo.length) {
                    turn = o;
                    renderRings();
                    updateHud();
                    if (o === 2) later(aiMove, 600);
                    return;
                }
                const mp = legalMoves(p);
                if (mp.length) {
                    toast(
                        o === 1
                            ? "You have no legal moves. Your turn passes."
                            : "The AI has no legal moves. It passes.",
                    );
                    turn = p;
                    renderRings();
                    updateHud();
                    if (p === 2) later(aiMove, 1100);
                    return;
                }
                endGame();
            }

            /* ---------- AI ---------- */
            function aiMove() {
                if (!active || over || turn !== 2) return;
                const ms = legalMoves(2);
                if (!ms.length) return;
                let pick;
                if (diff === "easy") {
                    pick = ms[Math.floor(Math.random() * ms.length)];
                } else {
                    let best = -Infinity;
                    for (const m of ms) {
                        const s = WT[m.r][m.c] * 3 + m.flips.length;
                        if (s > best) {
                            best = s;
                            pick = m;
                        }
                    }
                }
                place(pick.r, pick.c, 2, pick.flips);
            }

            /* ---------- end ---------- */
            function endGame() {
                over = true;
                renderRings();
                updateHud();
                later(showOver, 750);
            }

            function showOver() {
                if (!over) return;
                const n = counts();
                const final = "Final score: you " + n.b + " - " + n.w + " AI.";
                ovTitle.classList.remove("mgp-win", "mgp-lose");
                if (n.b > n.w) {
                    ovTitle.textContent = "You win";
                    ovTitle.classList.add("mgp-win");
                    ovReason.textContent =
                        "You hold the majority of discs. " + final;
                } else if (n.w > n.b) {
                    ovTitle.textContent = "AI wins";
                    ovTitle.classList.add("mgp-lose");
                    ovReason.textContent =
                        "The AI holds the majority of discs. " + final;
                } else {
                    ovTitle.textContent = "Draw";
                    ovReason.textContent = "Discs are split evenly, 32 - 32.";
                }
                ovOver.hidden = false;
            }

            /* ---------- round management ---------- */
            function resetBoard() {
                grid = Array.from({ length: N }, () => new Array(N).fill(0));
                grid[3][3] = 2;
                grid[4][4] = 2; // white
                grid[3][4] = 1;
                grid[4][3] = 1; // black
                gDiscs.innerHTML = "";
                discEls = Array.from({ length: N }, () =>
                    new Array(N).fill(null),
                );
                marker.style.display = "none";
                turn = 1;
                over = false;
                syncDiscs(null, -1, -1);
                renderRings();
                updateHud();
            }

            function newGame() {
                clearTimers();
                started = true;
                ovStart.hidden = true;
                ovOver.hidden = true;
                resetBoard();
            }

            app
                .querySelectorAll('[data-act="start"]')
                .forEach((b) => b.addEventListener("click", newGame));
            $('[data-act="restart"]').addEventListener("click", newGame);
            diffBtn.addEventListener("click", () => {
                diff = diff === "greedy" ? "easy" : "greedy";
                diffBtn.textContent =
                    diff === "greedy" ? "AI: Greedy" : "AI: Easy";
            });

            resetBoard();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                    syncDiscs(null, -1, -1);
                    renderRings();
                    updateHud();
                    if (started && !over && turn === 2) later(aiMove, 700);
                    if (over && ovOver.hidden) showOver();
                },
                close() {
                    active = false;
                    clearTimers();
                    toastEl.classList.remove("rv-on");
                },
            };
        },
    });
})();
