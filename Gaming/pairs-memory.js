/* ==== GAME: pairs-memory.js ==== */

/* =============================================================
MEMORY MATCH - flip cards two at a time and find every pair
before the clock (90s) or the move budget (30) runs out.
8 pairs of SVG shapes on a 4x4 grid. Pure SVG, no emoji.
============================================================= */
(() => {
    "use strict";

    /* ---------- pure logic (exposed via _test) ---------- */
    const GRID = 4;
    const PAIRS = 8;
    const TIME_LIMIT = 90;
    const MOVE_LIMIT = 30;

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

    /* 8 distinct shapes, each with an svg body (48x48 viewBox) */
    const SHAPES = [
        {
            id: "sun",
            color: "#fbbf24",
            body: '<circle cx="24" cy="24" r="13" fill="#fbbf24"/>',
        },
        {
            id: "moon",
            color: "#a5b4fc",
            body: '<path d="M30 8a16 16 0 1 0 10 28A18 18 0 0 1 30 8z" fill="#a5b4fc"/>',
        },
        {
            id: "tri",
            color: "#34d399",
            body: '<polygon points="24,9 39,38 9,38" fill="#34d399"/>',
        },
        {
            id: "dia",
            color: "#f472b6",
            body: '<polygon points="24,8 40,24 24,40 8,24" fill="#f472b6"/>',
        },
        {
            id: "star",
            color: "#facc15",
            body: '<polygon points="24,7 29,19 42,20 32,29 35,42 24,35 13,42 16,29 6,20 19,19" fill="#facc15"/>',
        },
        {
            id: "heart",
            color: "#f87171",
            body: '<path d="M24 40C10 30 6 22 6 16a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 6-4 14-18 24z" fill="#f87171"/>',
        },
        {
            id: "cross",
            color: "#60a5fa",
            body: '<path d="M19 8h10v11h11v10H29v11H19V29H8V19h11z" fill="#60a5fa"/>',
        },
        {
            id: "ring",
            color: "#2dd4bf",
            body: '<circle cx="24" cy="24" r="14" fill="none" stroke="#2dd4bf" stroke-width="8"/>',
        },
    ];

    /* Card Pair Generator: deck of 16 with each pid exactly twice */
    function makeDeck(rnd) {
        const deck = [];
        for (let p = 0; p < PAIRS; p++) {
            deck.push(p);
            deck.push(p);
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = deck[i];
            deck[i] = deck[j];
            deck[j] = t;
        }
        return deck;
    }

    function newGame(rnd) {
        return {
            deck: makeDeck(rnd),
            open: [],
            matched: [],
            moves: 0,
            time: 0,
        };
    }

    /* Card Flip + Pair Detection + Card Lock reducer.
 Returns { g, ev } where ev.type is:
 flip | match | miss | locked | already | win                    */
    function pick(g, idx) {
        if (idx < 0 || idx >= g.deck.length)
            return { g, ev: { type: "locked" } };
        if (g.matched.indexOf(idx) >= 0 || g.open.indexOf(idx) >= 0) {
            return { g, ev: { type: "already" } };
        }
        if (g.open.length >= 2) return { g, ev: { type: "locked" } };
        const g2 = {
            deck: g.deck,
            open: g.open.slice(),
            matched: g.matched.slice(),
            moves: g.moves,
            time: g.time,
        };
        g2.open.push(idx);
        if (g2.open.length < 2) return { g: g2, ev: { type: "flip" } };
        /* second card */
        g2.moves = g.moves + 1;
        const a = g2.open[0],
            b = g2.open[1];
        if (g2.deck[a] === g2.deck[b]) {
            g2.matched = g2.matched.concat(a, b);
            g2.open = [];
            const won = g2.matched.length === g2.deck.length;
            return { g: g2, ev: { type: won ? "win" : "match" } };
        }
        return { g: g2, ev: { type: "miss" } };
    }

    /* after a miss the UI closes both cards */
    function closeMiss(g) {
        return {
            deck: g.deck,
            open: [],
            matched: g.matched,
            moves: g.moves,
            time: g.time,
        };
    }

    function isWin(g) {
        return g.matched.length === g.deck.length;
    }
    function isLose(g) {
        return !isWin(g) && (g.moves >= MOVE_LIMIT || g.time >= TIME_LIMIT);
    }

    MGP_REGISTER({
        id: "pairs-memory",
        name: "Memory Match",
        category: "puzzle",
        catLabel: "Puzzle",
        desc: "Flip two cards at a time and find all 8 pairs before time runs out.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="17" height="24" rx="3" fill="#4f46e5"/><rect x="26" y="5" width="17" height="24" rx="3" fill="#f59e0b"/><rect x="5" y="31" width="17" height="12" rx="3" fill="#f59e0b"/><rect x="26" y="31" width="17" height="12" rx="3" fill="#4f46e5" stroke="none" transform="rotate(8 34 37)"/><text x="13.5" y="22" font-size="11" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">A</text><text x="34.5" y="22" font-size="11" font-family="inherit" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">a</text></svg>',
        bg: ["#c7d2fe", "#a5b4fc"],
        _test: {
            GRID,
            PAIRS,
            TIME_LIMIT,
            MOVE_LIMIT,
            SHAPES,
            rng,
            makeDeck,
            newGame,
            pick,
            closeMiss,
            isWin,
            isLose,
        },
        build(app) {
            /* ---------- shell ---------- */
            app.innerHTML = `
<style>
#pairs-memory-app .mm-wrap{width:min(94%,420px)}
#pairs-memory-app .mm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px auto}
#pairs-memory-app .mm-card{position:relative;aspect-ratio:1;border:0;border-radius:12px;background:#1b2547;padding:0;cursor:pointer;transition:transform .18s}
#pairs-memory-app .mm-card:hover{transform:translateY(-2px)}
#pairs-memory-app .mm-face{position:absolute;inset:0;border-radius:12px;display:grid;place-items:center;backface-visibility:hidden;transition:opacity .2s}
#pairs-memory-app .mm-back{background:linear-gradient(135deg,#312e81,#4f46e5)}
#pairs-memory-app .mm-front{background:#0f1a33;border:2px solid #ffffff22}
#pairs-memory-app .mm-card.done .mm-front{border-color:#34d39966;background:#0f2a1e}
#pairs-memory-app .mm-card.done{cursor:default}
#pairs-memory-app .mm-card.hidden .mm-back{opacity:1}
#pairs-memory-app .mm-card:not(.hidden) .mm-back{opacity:0}
#pairs-memory-app .mm-card.hidden .mm-front{opacity:0}
#pairs-memory-app .mm-shake{animation:mm-shake .35s ease}
@keyframes mm-shake{0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)}70%{transform:translateX(6px)}}
#pairs-memory-app .mm-bar{height:8px;border-radius:4px;background:#ffffff14;overflow:hidden;margin:8px 0}
#pairs-memory-app .mm-bar i{display:block;height:100%;background:#34d399;transition:width .3s}
#pairs-memory-app .mm-bar.warn i{background:#f87171}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Memory Match</span>
  <span class="mgp-chip">Pairs <b data-hud="pairs">0</b>/8</span>
  <span class="mgp-chip">Moves <b data-hud="moves">0</b>/30</span>
  <span class="mgp-chip">Time <b data-hud="time">0</b>/90s</span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="mm-wrap">
    <div class="mm-bar" data-bar><i style="width:100%"></i></div>
    <div class="mm-grid" data-grid></div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Memory Match</h2>
      <p class="mgp-ov-sub">16 cards hide 8 pairs of shapes. Flip two cards per move - a matching pair stays open, a mismatch flips back. Find every pair within 90 seconds and 30 moves.</p>
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
<div class="mgp-foot"><span class="mgp-hint">Tap a card to flip it. Remember where each shape lives.</span></div>`;

            /* ---------- refs ---------- */
            const $ = (s, r) => (r || app).querySelector(s);
            const gridEl = $("[data-grid]");
            const barEl = $("[data-bar]");
            const barFill = barEl.querySelector("i");
            const hud = {
                pairs: $('[data-hud="pairs"]'),
                moves: $('[data-hud="moves"]'),
                time: $('[data-hud="time"]'),
            };
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');

            /* ---------- state ---------- */
            let g = null;
            let active = false,
                running = false,
                busy = false;
            let timer = null;
            let cards = [];

            function cardEl(idx) {
                const shape = SHAPES[g.deck[idx]];
                const b = document.createElement("button");
                b.className = "mm-card hidden";
                b.setAttribute("aria-label", "Card " + (idx + 1));
                b.innerHTML =
                    '<span class="mm-face mm-back"><svg viewBox="0 0 48 48" width="55%" height="55%" fill="none" stroke="#c7d2fe" stroke-width="4" stroke-linecap="round" aria-hidden="true"><circle cx="24" cy="24" r="8"/><path d="M24 10v-4M24 42v-4M10 24H6M42 24h-4M14 14l-3-3M37 37l3 3M34 14l3-3M11 37l-3 3"/></svg></span>' +
                    '<span class="mm-face mm-front"><svg viewBox="0 0 48 48" width="72%" height="72%" aria-hidden="true">' +
                    shape.body +
                    "</svg></span>";
                b.addEventListener("click", () => onCard(idx, b));
                return b;
            }

            function renderGrid() {
                gridEl.innerHTML = "";
                cards = [];
                for (let i = 0; i < g.deck.length; i++) {
                    const el = cardEl(i);
                    cards.push(el);
                    gridEl.appendChild(el);
                }
            }

            function syncCard(idx) {
                const el = cards[idx];
                if (!el) return;
                const open =
                    g.open.indexOf(idx) >= 0 || g.matched.indexOf(idx) >= 0;
                el.classList.toggle("hidden", !open);
                el.classList.toggle("done", g.matched.indexOf(idx) >= 0);
            }

            function updateHud() {
                hud.pairs.textContent = g.matched.length / 2;
                hud.moves.textContent = g.moves;
                hud.time.textContent = Math.min(TIME_LIMIT, Math.floor(g.time));
                const left = Math.max(0, TIME_LIMIT - g.time);
                barFill.style.width = (left / TIME_LIMIT) * 100 + "%";
                barEl.classList.toggle("warn", left < 20);
            }

            /* ---------- flow ---------- */
            function onCard(idx, el) {
                if (!running || busy) return;
                const res = pick(g, idx);
                if (res.ev.type === "already" || res.ev.type === "locked") {
                    el.classList.remove("mm-shake");
                    void el.offsetWidth;
                    el.classList.add("mm-shake");
                    return;
                }
                g = res.g;
                syncCard(idx);
                if (res.ev.type === "match" || res.ev.type === "win") {
                    g.open.forEach(syncCard);
                    if (res.ev.type === "win")
                        finish(
                            true,
                            "All 8 pairs found in " +
                            g.moves +
                            " moves and " +
                            Math.floor(g.time) +
                            "s.",
                        );
                } else if (res.ev.type === "miss") {
                    busy = true;
                    const missed = g.open.slice();
                    setTimeout(() => {
                        g = closeMiss(g);
                        missed.forEach(syncCard);
                        busy = false;
                        if (g.moves >= MOVE_LIMIT)
                            finish(
                                false,
                                "Move budget used up with " +
                                (8 - g.matched.length / 2) +
                                " pairs still hidden.",
                            );
                    }, 750);
                }
                updateHud();
            }

            function finish(win, reason) {
                running = false;
                stopTimer();
                if (win) {
                    ovTitle.textContent = "All pairs found!";
                    ovTitle.className = "mgp-ov-title mgp-win";
                } else {
                    ovTitle.textContent = "Game over";
                    ovTitle.className = "mgp-ov-title mgp-lose";
                }
                ovReason.textContent = reason;
                setTimeout(() => {
                    if (!running) ovOver.hidden = false;
                }, 500);
            }

            function stopTimer() {
                if (timer) {
                    clearInterval(timer);
                    timer = null;
                }
            }

            function startGame() {
                stopTimer();
                g = newGame(Math.random);
                busy = false;
                running = true;
                ovStart.hidden = true;
                ovOver.hidden = true;
                renderGrid();
                updateHud();
                timer = setInterval(() => {
                    if (!running) return;
                    g.time += 1;
                    updateHud();
                    if (g.time >= TIME_LIMIT) {
                        finish(
                            false,
                            "Time ran out with " +
                            (8 - g.matched.length / 2) +
                            " pairs still hidden.",
                        );
                    }
                }, 1000);
            }

            app.addEventListener("click", (e) => {
                const b = e.target.closest("[data-act]");
                if (!b) return;
                if (b.dataset.act === "start" || b.dataset.act === "restart")
                    startGame();
            });

            /* ---------- init ---------- */
            g = newGame(rng(7));
            renderGrid();
            updateHud();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                },
                close() {
                    active = false;
                    running = false;
                    stopTimer();
                },
            };
        },
    });
})();
