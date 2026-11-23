/* ==== GAME: connect-four.js ==== */
/* =============================================================
   CONNECT FOUR - minimalist red vs blue
   - AI mode  : minimax + alpha-beta (Hard depth 4 / Easy depth 1),
                random first mover, cheat overlay (offline only).
   - Room mode: host-authoritative state, random seat (red/blue)
                and random first mover on every round.
   - Input    : tap/click a column (no virtual mobile buttons),
                keys 1-7, arrows + Enter/Space, R, C, Esc.
   - No tutorial text, no level generator, no emoji, no assets.
   ============================================================= */

export const META = {
    id: "connect-four", // harus sama dengan nama file (tanpa .js)
    name: "Connect Four",
    category: "board",
    catLabel: "Board",
    desc: "Drop discs and connect four in a row before your opponent does.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><rect x="5" y="9" width="38" height="34" rx="5"/><circle cx="14.5" cy="18.5" r="3.6" fill="currentColor" stroke="none"/><circle cx="24" cy="18.5" r="3.6"/><circle cx="33.5" cy="18.5" r="3.6" fill="currentColor" stroke="none"/><circle cx="14.5" cy="28" r="3.6"/><circle cx="24" cy="28" r="3.6" fill="currentColor" stroke="none"/><circle cx="33.5" cy="28" r="3.6"/><circle cx="14.5" cy="37.5" r="3.6" fill="currentColor" stroke="none"/><circle cx="24" cy="37.5" r="3.6"/><circle cx="33.5" cy="37.5" r="3.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#f87171", "#3b82f6"],
};

/* ---------- pure rules + AI helpers (no DOM) ---------- */
const COLS = 7,
    ROWS = 6;
const COLORS = { 1: "#ef4444", 2: "#3b82f6" }; // red / blue
const NAMES = { 1: "Red", 2: "Blue" };
const ORDER = [3, 2, 4, 1, 5, 0, 6]; // center-first move preference

const emptyGrid = () =>
    Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

const lowRow = (g, c) => {
    for (let r = ROWS - 1; r >= 0; r--) if (!g[r][c]) return r;
    return -1;
};

function winCellsAt(g, r, c) {
    const p = g[r][c];
    if (!p) return null;
    const dirs = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
    ];
    for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        for (let s = 1; s < 4; s++) {
            const rr = r + dr * s,
                cc = c + dc * s;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || g[rr][cc] !== p) break;
            cells.push([rr, cc]);
        }
        for (let s = 1; s < 4; s++) {
            const rr = r - dr * s,
                cc = c - dc * s;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || g[rr][cc] !== p) break;
            cells.unshift([rr, cc]);
        }
        if (cells.length >= 4) return cells;
    }
    return null;
}

function score4(a, b, c, d) {
    let me = 0,
        yo = 0;
    if (a === 2) me++;
    else if (a === 1) yo++;
    if (b === 2) me++;
    else if (b === 1) yo++;
    if (c === 2) me++;
    else if (c === 1) yo++;
    if (d === 2) me++;
    else if (d === 1) yo++;
    if (me && yo) return 0;
    if (me === 4) return 100000;
    if (yo === 4) return -100000;
    if (me === 3) return 60;
    if (yo === 3) return -80;
    if (me === 2) return 9;
    if (yo === 2) return -10;
    return 0;
}

function evaluate(g) {
    let s = 0;
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 4; c++)
            s += score4(g[r][c], g[r][c + 1], g[r][c + 2], g[r][c + 3]);
    for (let c = 0; c < COLS; c++)
        for (let r = 0; r < 3; r++)
            s += score4(g[r][c], g[r + 1][c], g[r + 2][c], g[r + 3][c]);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) {
            s += score4(g[r][c], g[r + 1][c + 1], g[r + 2][c + 2], g[r + 3][c + 3]);
            s += score4(g[r + 3][c], g[r + 2][c + 1], g[r + 1][c + 2], g[r][c + 3]);
        }
    for (let r = 0; r < ROWS; r++) {
        if (g[r][3] === 2) s += 4;
        else if (g[r][3] === 1) s -= 4;
    }
    return s;
}

function winnerOf(g) {
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 4; c++) {
            const w = g[r][c];
            if (w && g[r][c + 1] === w && g[r][c + 2] === w && g[r][c + 3] === w) return w;
        }
    for (let c = 0; c < COLS; c++)
        for (let r = 0; r < 3; r++) {
            const w = g[r][c];
            if (w && g[r + 1][c] === w && g[r + 2][c] === w && g[r + 3][c] === w) return w;
        }
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) {
            const w = g[r][c];
            if (w && g[r + 1][c + 1] === w && g[r + 2][c + 2] === w && g[r + 3][c + 3] === w) return w;
            const v = g[r + 3][c];
            if (v && g[r + 2][c + 1] === v && g[r + 1][c + 2] === v && g[r][c + 3] === v) return v;
        }
    return 0;
}

function minimax(g, depth, alpha, beta, maxing) {
    const w = winnerOf(g);
    if (w === 2) return 100000 + depth * 10;
    if (w === 1) return -100000 - depth * 10;
    const cols = [];
    for (const c of ORDER) if (!g[0][c]) cols.push(c);
    if (!cols.length) return 0;
    if (depth === 0) return evaluate(g);
    if (maxing) {
        let best = -Infinity;
        for (const c of cols) {
            const r = lowRow(g, c);
            g[r][c] = 2;
            const s = minimax(g, depth - 1, alpha, beta, false);
            g[r][c] = 0;
            if (s > best) best = s;
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        return best;
    }
    let best = Infinity;
    for (const c of cols) {
        const r = lowRow(g, c);
        g[r][c] = 1;
        const s = minimax(g, depth - 1, alpha, beta, true);
        g[r][c] = 0;
        if (s < best) best = s;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
    }
    return best;
}

/* Best column for `seat` (1 = red, 2 = blue). Random tie-break. */
function bestColumn(g, seat, depth) {
    const cols = [];
    for (const c of ORDER) if (!g[0][c]) cols.push(c);
    if (!cols.length) return -1;
    let best = seat === 2 ? -Infinity : Infinity;
    let picks = [];
    for (const c of cols) {
        const r = lowRow(g, c);
        g[r][c] = seat;
        const s = minimax(g, depth - 1, -Infinity, Infinity, seat !== 2);
        g[r][c] = 0;
        const better = seat === 2 ? s > best : s < best;
        if (better) {
            best = s;
            picks = [c];
        } else if (s === best) picks.push(c);
    }
    return picks[(Math.random() * picks.length) | 0];
}
/* ---------- end pure helpers ---------- */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* ---------- local (non-synced) state ---------- */
    let diff = "hard";
    let busy = false;
    let aiQueued = false;
    let hoverC = null;
    let cursor = 3;
    let cursorVisible = false;
    let hintCol = null;
    let skipAI = false;
    const cheats = { weak: false, threats: false };
    let history = []; // offline snapshots for the Undo cheat
    const score = { w: 0, l: 0, d: 0 };
    let talliedRound = 0;
    let resultShown = false;
    let renderedRound = -1;
    let renderedMoves = -1;
    let discEls = [];
    let timers = [];

    const later = (fn, ms) => {
        const t = setTimeout(() => {
            timers = timers.filter((x) => x !== t);
            if (!destroyed) fn();
        }, ms);
        timers.push(t);
        return t;
    };
    const clearTimers = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };

    /* ---------- markup (minimalist, no tutorial text) ---------- */
    root.innerHTML = `
<style>
.cf .cf-meta{margin:2px 0 0;font-size:12.5px;opacity:.62;letter-spacing:.02em}
.cf .cf-panel{position:relative}
.cf .cf-wrap{display:flex;justify-content:center;padding:6px 0 2px}
.cf svg.cf-svg{width:100%;max-width:500px;height:auto;display:block;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.cf .cf-frame{fill:#141a2e;stroke:rgba(148,163,184,.16);stroke-width:1.5}
.cf .cf-hole{fill:#0a0f1e}
.cf .cf-hit{fill:transparent;cursor:pointer}
.cf .cf-hl{fill:#94a3b8;opacity:0;transition:opacity .12s}
.cf .cf-ghost{opacity:0;transition:opacity .15s}
.cf .cf-ghost.cf-on{opacity:.5}
.cf .cf-disc{transition:opacity .25s}
.cf .cf-dim .cf-disc{opacity:.22}
.cf .cf-dim .cf-disc.cf-winner{opacity:1}
.cf .cf-ring{fill:none;stroke:#fff;stroke-width:3;animation:cf-pop .3s ease-out}
@keyframes cf-pop{from{opacity:0;stroke-width:10}to{opacity:1;stroke-width:3}}
.cf .cf-threat{fill:none;stroke:#3b82f6;stroke-width:2.5;stroke-dasharray:5 5;opacity:.9}
.cf .cf-hintmark{animation:cf-bob 1s ease-in-out infinite}
@keyframes cf-bob{50%{transform:translateY(5px)}}
.cf .cf-thinking{animation:cf-blink 1.1s infinite}
@keyframes cf-blink{50%{opacity:.4}}
.cf .cf-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55);backdrop-filter:blur(3px);border-radius:14px;z-index:5}
.cf .cf-card{width:min(320px,88%);background:#0f1526;border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.cf .cf-card h3{margin:0;font-size:16px;font-weight:600}
.cf .cf-card-head{display:flex;align-items:center;justify-content:space-between}
.cf .cf-x{background:none;border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.6;padding:2px 6px}
.cf .cf-x:hover{opacity:1}
.cf .cf-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13.5px}
.cf .cf-row span{opacity:.85}
.cf .cf-btn{border:1px solid rgba(148,163,184,.28);background:rgba(148,163,184,.08);color:inherit;border-radius:8px;padding:5px 12px;font-size:12.5px;cursor:pointer;min-width:64px}
.cf .cf-btn:hover{background:rgba(148,163,184,.16)}
.cf .cf-btn.cf-active{border-color:#3b82f6;background:rgba(59,130,246,.18)}
.cf .cf-btn:disabled{opacity:.35;cursor:default}
.cf .cf-primary{background:#3b82f6;border-color:#3b82f6;color:#fff;padding:8px 12px}
.cf .cf-primary:hover{background:#2f6fe0}
.cf .cf-result-card{align-items:center;text-align:center}
.cf [hidden]{display:none!important}
</style>
<div class="game-app cf">
  <div class="game-intro">
    <div><h2>Connect Four</h2><p class="cf-meta" data-meta></p></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status aria-live="polite">Ready</span></span>
  </div>
  <section class="game-panel cf-panel" data-board>
    <div class="cf-wrap">
      <svg class="cf-svg" viewBox="0 0 472 472" role="img" aria-label="Connect Four board">
        <rect x="4" y="64" width="464" height="408" rx="18" class="cf-frame"/>
        <g data-holes></g>
        <g data-hls></g>
        <g data-threats></g>
        <g data-discs></g>
        <g data-marks></g>
        <circle class="cf-ghost" data-ghost r="22" cy="32" fill="#ef4444"/>
        <g data-hits></g>
      </svg>
    </div>
    <div class="cf-overlay" data-cheats hidden>
      <div class="cf-card">
        <div class="cf-card-head"><h3>Cheats</h3><button class="cf-x" type="button" data-cheats-close aria-label="Close">&times;</button></div>
        <div class="cf-row"><span>Best move hint</span><button class="cf-btn" type="button" data-cheat="hint">Show</button></div>
        <div class="cf-row"><span>Undo my last move</span><button class="cf-btn" type="button" data-cheat="undo">Undo</button></div>
        <div class="cf-row"><span>Skip AI turn (once)</span><button class="cf-btn" type="button" data-cheat="skip">Arm</button></div>
        <div class="cf-row"><span>Weak AI (random moves)</span><button class="cf-btn" type="button" data-cheat="weak">Off</button></div>
        <div class="cf-row"><span>Threat scanner</span><button class="cf-btn" type="button" data-cheat="threats">Off</button></div>
      </div>
    </div>
    <div class="cf-overlay" data-result hidden>
      <div class="cf-card cf-result-card">
        <h3 data-result-title>Result</h3>
        <p class="cf-meta" data-result-sub></p>
        <button class="cf-btn cf-primary" type="button" data-again>Play again</button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-restart>New round</button>
    <button class="game-action-button" type="button" data-diff hidden>AI: Hard</button>
    <button class="game-action-button" type="button" data-cheats-open hidden>Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- dom helpers ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    const svg = $(".cf-svg");
    const gHoles = $("[data-holes]");
    const gHls = $("[data-hls]");
    const gThreats = $("[data-threats]");
    const gDiscs = $("[data-discs]");
    const gMarks = $("[data-marks]");
    const gHits = $("[data-hits]");
    const ghost = $("[data-ghost]");
    const statusEl = $("[data-status]");
    const dotEl = $("[data-dot]");
    const metaEl = $("[data-meta]");
    const ovCheats = $("[data-cheats]");
    const ovResult = $("[data-result]");
    const resultTitle = $("[data-result-title]");
    const resultSub = $("[data-result-sub]");
    const diffBtn = $("[data-diff]");
    const cheatsOpenBtn = $("[data-cheats-open]");
    const hintBtn = $('[data-cheat="hint"]');
    const undoBtn = $('[data-cheat="undo"]');
    const skipBtn = $('[data-cheat="skip"]');
    const weakBtn = $('[data-cheat="weak"]');
    const threatBtn = $('[data-cheat="threats"]');

    const cxOf = (c) => 44 + c * 64;
    const cyOf = (r) => 108 + r * 64;

    /* ---------- static board + pointer input (mouse & touch) ---------- */
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            mk("circle", { cx: cxOf(c), cy: cyOf(r), r: 27, class: "cf-hole" }, gHoles);

    const hlEls = [];
    for (let c = 0; c < COLS; c++) {
        hlEls.push(
            mk("rect", { x: 12 + c * 64, y: 64, width: 64, height: 408, class: "cf-hl" }, gHls),
        );
        const hit = mk(
            "rect",
            { x: 12 + c * 64, y: 0, width: 64, height: 472, class: "cf-hit" },
            gHits,
        );
        hit.addEventListener("pointerdown", () => tryDrop(c));
        hit.addEventListener("pointerenter", () => {
            hoverC = c;
            cursor = c;
            refreshHover();
        });
        hit.addEventListener("pointerleave", () => {
            hoverC = null;
            refreshHover();
        });
    }
    svg.addEventListener("pointerleave", () => {
        hoverC = null;
        refreshHover();
    });

    /* ---------- seats / turns ---------- */
    // Random seat assignment in multiplayer: the host draws a seat (1 or 2)
    // every round, the guest gets the other one. Offline the human is red.
    function mySeat() {
        if (!online) return 1;
        if (!state) return room.isHost ? 1 : 2;
        return room.isHost ? state.hostSeat : 3 - state.hostSeat;
    }

    function freshState(prevRound) {
        return {
            grid: emptyGrid(),
            turn: Math.random() < 0.5 ? 1 : 2, // random first mover (both modes)
            moves: 0,
            over: false,
            winner: 0,
            winCells: null,
            lastMove: null,
            hostSeat: online ? (Math.random() < 0.5 ? 1 : 2) : 1, // random seat
            round: prevRound + 1,
        };
    }

    function canPlay() {
        return Boolean(state) && !state.over && !busy && state.turn === mySeat();
    }

    /* ---------- canonical state flow (template pattern) ---------- */
    function publish() {
        settle();
        render();
        // Only the host writes canonical state to Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, seat) {
        if (destroyed || !state || !action) return;
        if (action.type === "restart") {
            resetRound();
            publish();
            return;
        }
        if (action.type !== "drop") return;
        if (state.over || state.turn !== seat) return;
        const c = Number(action.col);
        if (!Number.isInteger(c) || c < 0 || c >= COLS) return;
        const r = lowRow(state.grid, c);
        if (r < 0) return;
        if (!online && seat === 1) history.push(JSON.parse(JSON.stringify(state)));
        if (seat === 2) hintCol = null;
        state.grid[r][c] = seat;
        state.moves++;
        state.lastMove = { r, c, p: seat };
        const cells = winCellsAt(state.grid, r, c);
        if (cells) {
            state.over = true;
            state.winner = seat;
            state.winCells = cells;
        } else if (state.moves >= ROWS * COLS) {
            state.over = true;
            state.winner = 0;
            state.winCells = null;
        } else {
            let next = 3 - seat;
            if (!online && seat === 1 && skipAI) {
                skipAI = false; // cheat: extra turn, AI is skipped once
                next = 1;
            }
            state.turn = next;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    function tryDrop(c) {
        if (!canPlay()) return;
        hintCol = null;
        submitAction({ type: "drop", col: c });
    }

    /* ---------- round management ---------- */
    function resetRound() {
        clearTimers();
        aiQueued = false;
        busy = false;
        history = [];
        hintCol = null;
        skipAI = false;
        talliedRound = 0;
        resultShown = false;
        renderedRound = -1;
        renderedMoves = -1;
        ovCheats.hidden = true;
        ovResult.hidden = true;
        state = freshState(state ? state.round : 0);
    }

    /* Score tally + offline AI scheduling after any state change. */
    function settle() {
        if (!state) return;
        if (state.over && talliedRound !== state.round) {
            talliedRound = state.round;
            const me = mySeat();
            if (state.winner === 0) score.d++;
            else if (state.winner === me) score.w++;
            else score.l++;
            if (!resultShown) {
                resultShown = true;
                later(showResult, 900);
            }
        }
        if (!online && !state.over && state.turn === 2 && !aiQueued) {
            aiQueued = true;
            later(() => {
                aiQueued = false;
                aiTurn();
            }, 720);
        }
    }

    /* ---------- AI ---------- */
    function aiTurn() {
        if (destroyed || online || !state || state.over || state.turn !== 2) return;
        const cols = [];
        for (const c of ORDER) if (!state.grid[0][c]) cols.push(c);
        if (!cols.length) return;
        let pick;
        if (cheats.weak) pick = cols[(Math.random() * cols.length) | 0];
        else {
            pick = bestColumn(state.grid, 2, diff === "easy" ? 1 : 4);
            if (pick < 0) pick = cols[0];
        }
        applyAction({ type: "drop", col: pick }, 2);
    }

    /* ---------- cheats (offline only) ---------- */
    function undoCheat() {
        if (online || !state || !history.length) return;
        clearTimers();
        aiQueued = false;
        busy = false;
        if (talliedRound === state.round) {
            const me = mySeat();
            if (state.winner === 0) score.d = Math.max(0, score.d - 1);
            else if (state.winner === me) score.w = Math.max(0, score.w - 1);
            else score.l = Math.max(0, score.l - 1);
            talliedRound = 0;
        }
        resultShown = false;
        ovResult.hidden = true;
        state = history.pop(); // back to before your last move (AI reply included)
        hintCol = null;
        render();
    }

    function handleCheat(kind) {
        if (online) return;
        if (kind === "hint") {
            if (canPlay()) hintCol = bestColumn(state.grid, 1, 4);
        } else if (kind === "undo") undoCheat();
        else if (kind === "skip") {
            if (state && !state.over) skipAI = !skipAI;
        } else if (kind === "weak") cheats.weak = !cheats.weak;
        else if (kind === "threats") cheats.threats = !cheats.threats;
        updateButtons();
        render();
    }

    /* ---------- rendering ---------- */
    function renderDiscs(animateLast) {
        gDiscs.innerHTML = "";
        discEls = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
        svg.classList.remove("cf-dim");
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++) {
                const p = state.grid[r][c];
                if (!p) continue;
                const el = mk(
                    "circle",
                    { cx: cxOf(c), cy: cyOf(r), r: 27, class: "cf-disc", fill: COLORS[p] },
                    gDiscs,
                );
                discEls[r][c] = el;
                if (animateLast && state.lastMove && state.lastMove.r === r && state.lastMove.c === c) {
                    el.style.transform = "translateY(" + -(cyOf(r) - 32) + "px)";
                    el.style.transition = "transform .5s cubic-bezier(.3,.6,.4,1.08)";
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => {
                            if (!destroyed) el.style.transform = "translateY(0)";
                        }),
                    );
                }
            }
        if (state.over && state.winCells) {
            svg.classList.add("cf-dim");
            state.winCells.forEach((cell) => {
                const el = discEls[cell[0]][cell[1]];
                if (el) el.classList.add("cf-winner");
                mk("circle", { cx: cxOf(cell[1]), cy: cyOf(cell[0]), r: 27, class: "cf-ring" }, gDiscs);
            });
        }
    }

    function renderMarks() {
        gThreats.innerHTML = "";
        gMarks.innerHTML = "";
        if (!state || state.over || online) return;
        if (cheats.threats) {
            for (let c = 0; c < COLS; c++) {
                const r = lowRow(state.grid, c);
                if (r < 0) continue;
                state.grid[r][c] = 2;
                const w = winCellsAt(state.grid, r, c);
                state.grid[r][c] = 0;
                if (w)
                    mk("circle", { cx: cxOf(c), cy: cyOf(r), r: 27, class: "cf-threat" }, gThreats);
            }
        }
        if (hintCol != null && !state.grid[0][hintCol]) {
            const x = cxOf(hintCol);
            mk(
                "polygon",
                {
                    points: x - 9 + ",12 " + (x + 9) + ",12 " + x + ",30",
                    fill: COLORS[1],
                    class: "cf-hintmark",
                },
                gMarks,
            );
        }
    }

    function refreshHover() {
        hlEls.forEach((h) => (h.style.opacity = 0));
        const c = hoverC != null ? hoverC : cursorVisible ? cursor : null;
        if (c != null && canPlay() && lowRow(state.grid, c) >= 0) {
            ghost.setAttribute("cx", cxOf(c));
            ghost.setAttribute("fill", COLORS[mySeat()]);
            ghost.classList.add("cf-on");
            hlEls[c].style.opacity = 0.12;
        } else {
            ghost.classList.remove("cf-on");
        }
    }

    function setStatus(text, color, thinking) {
        statusEl.textContent = text;
        dotEl.style.background = color;
        statusEl.classList.toggle("cf-thinking", Boolean(thinking));
    }

    function updateButtons() {
        diffBtn.textContent = "AI: " + (diff === "hard" ? "Hard" : "Easy");
        weakBtn.textContent = cheats.weak ? "On" : "Off";
        weakBtn.classList.toggle("cf-active", cheats.weak);
        threatBtn.textContent = cheats.threats ? "On" : "Off";
        threatBtn.classList.toggle("cf-active", cheats.threats);
        skipBtn.textContent = skipAI ? "Armed" : "Arm";
        skipBtn.classList.toggle("cf-active", skipAI);
        skipBtn.disabled = !state || state.over;
        undoBtn.disabled = online || !history.length;
        hintBtn.disabled = !canPlay();
    }

    function render() {
        if (destroyed) return;
        updateButtons();
        if (!state) {
            setStatus("Waiting for host", "#64748b", false);
            metaEl.textContent = "";
            gDiscs.innerHTML = "";
            gThreats.innerHTML = "";
            gMarks.innerHTML = "";
            refreshHover();
            return;
        }
        const me = mySeat();
        const newRound = state.round !== renderedRound;
        const advanced = !newRound && state.lastMove && state.moves === renderedMoves + 1;
        if (newRound || state.moves !== renderedMoves) {
            renderDiscs(advanced);
            renderedRound = state.round;
            renderedMoves = state.moves;
            if (advanced) {
                busy = true;
                later(() => {
                    busy = false;
                    render();
                }, 500);
            }
        }
        renderMarks();
        refreshHover();
        if (state.over) {
            if (state.winner === 0) setStatus("Draw", "#94a3b8", false);
            else
                setStatus(
                    state.winner === me ? "You win" : online ? "Rival wins" : "AI wins",
                    COLORS[state.winner],
                    false,
                );
        } else if (state.turn === me) {
            setStatus("Your turn", COLORS[me], false);
        } else {
            setStatus(online ? "Rival's turn" : "AI thinking", COLORS[state.turn], !online);
        }
        metaEl.textContent =
            playerName + " · " + NAMES[me] + " · " + score.w + "W " + score.l + "L " + score.d + "D";
    }

    function showResult() {
        if (destroyed || !state || !state.over) return;
        const me = mySeat();
        if (state.winner === 0) {
            resultTitle.textContent = "Draw";
            resultTitle.style.color = "";
        } else {
            resultTitle.textContent =
                state.winner === me ? "You win" : online ? "Rival wins" : "AI wins";
            resultTitle.style.color = COLORS[state.winner];
        }
        resultSub.textContent = "Session " + score.w + " - " + score.l + " - " + score.d;
        ovResult.hidden = false;
    }

    /* ---------- click delegation ---------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) {
            onExit();
            return;
        }
        if (t.closest("[data-restart]") || t.closest("[data-again]")) {
            submitAction({ type: "restart" });
            return;
        }
        if (t.closest("[data-diff]")) {
            diff = diff === "hard" ? "easy" : "hard";
            updateButtons();
            return;
        }
        if (t.closest("[data-cheats-open]")) {
            ovCheats.hidden = !ovCheats.hidden;
            return;
        }
        if (t.closest("[data-cheats-close]")) {
            ovCheats.hidden = true;
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) handleCheat(ch.getAttribute("data-cheat"));
    }

    /* ---------- keyboard (desktop) ---------- */
    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
        if (e.key === "Escape") {
            ovCheats.hidden = true;
            return;
        }
        if (e.key >= "1" && e.key <= "7") {
            cursor = Number(e.key) - 1;
            tryDrop(cursor);
            return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            cursor = Math.min(COLS - 1, Math.max(0, cursor + (e.key === "ArrowRight" ? 1 : -1)));
            cursorVisible = true;
            hoverC = null;
            refreshHover();
            return;
        }
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            if (cursorVisible) {
                e.preventDefault();
                tryDrop(cursor);
            }
            return;
        }
        if (e.key === "r" || e.key === "R") {
            submitAction({ type: "restart" });
            return;
        }
        if ((e.key === "c" || e.key === "C") && !online) ovCheats.hidden = !ovCheats.hidden;
    }

    /* ---------- boot ---------- */
    if (!online) {
        diffBtn.hidden = false;
        cheatsOpenBtn.hidden = false; // cheats stay hidden in multiplayer
    }
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        room.onRoom((nextRoom) => {
            if (destroyed) return;
            roomData = nextRoom;
            render();
        });
        if (room.isHost) {
            resetRound();
            publish();
            // Guest seat is the opposite of the randomly drawn host seat.
            room.onAction((action) => applyAction(action, 3 - state.hostSeat));
        } else {
            render();
            room.onState((nextState) => {
                if (destroyed) return;
                state = nextState;
                settle();
                render();
            });
        }
    } else {
        resetRound();
        publish();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
        },
    };
}