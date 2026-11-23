/* ==== parking-jam.js ==== */
/* Parking Jam - minimalist sliding-block puzzle / turn-based race.
   Format template: export META + mount(root, context).
   Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs */

export const META = {
    id: "parking-jam", // harus sama dengan nama file: parking-jam.js
    name: "Parking Jam",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Slide blocking cars aside and drive the gold car out. Solo for par, or take turns vs a bot / friend - whoever lands the escape slide wins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="16" width="26" height="14" rx="4"/><path d="M10 16l3-6h8l3 6"/><circle cx="11" cy="32" r="3"/><circle cx="23" cy="32" r="3"/><path d="M34 23h8m0 0l-4-4m4 4l-4 4"/></svg>',
    bg: ["#fde68a", "#f59e0b"],
    bestKey: "parkingJamBest",
};

/* ================= pure rules (no DOM) ================= */
const N = 6;
const EXIT_ROW = 2;
const MOVE_CAP = 120; // versus: slide limit -> draw
const DIFFS = {
    easy: { label: "Easy", cars: 6, par: 3 },
    classic: { label: "Classic", cars: 8, par: 5 },
    hard: { label: "Hard", cars: 9, par: 8 },
};
const rnd = (n) => Math.floor(Math.random() * n);
const inB = (v, len) => v >= 0 && v + len <= N;

function cellsOf(c) {
    const out = [];
    for (let k = 0; k < c.len; k++) out.push(c.horiz ? [c.x + k, c.y] : [c.x, c.y + k]);
    return out;
}
function occupied(cars, skipId) {
    const set = new Set();
    for (const c of cars) {
        if (c.id === skipId) continue;
        for (const [x, y] of cellsOf(c)) set.add(x + "," + y);
    }
    return set;
}
/* every single-slide destination (multi-cell slide counts as one move) */
function legalMoves(cars) {
    const out = [];
    for (const c of cars) {
        const occ = occupied(cars, c.id);
        for (const dir of [-1, 1]) {
            for (let step = 1; step < N; step++) {
                const nx = c.x + (c.horiz ? dir * step : 0);
                const ny = c.y + (c.horiz ? 0 : dir * step);
                if (!inB(nx, c.horiz ? c.len : 1) || !inB(ny, c.horiz ? 1 : c.len)) break;
                const mx = c.horiz ? (dir > 0 ? c.x + c.len - 1 + step : c.x - step) : c.x;
                const my = c.horiz ? c.y : dir > 0 ? c.y + c.len - 1 + step : c.y - step;
                if (occ.has(mx + "," + my)) break;
                out.push({ id: c.id, x: nx, y: ny });
            }
        }
    }
    return out;
}
function applyMove(cars, id, x, y) {
    return cars.map((c) => (c.id === id ? { ...c, x, y } : c));
}
function isSolved(cars) {
    const main = cars.find((c) => c.main);
    return !!main && main.x + main.len >= N;
}
const keyOf = (cars) => cars.map((c) => c.x + "," + c.y).join(";");

/* BFS: { par, move } - par = min slides, move = first slide of an optimal line.
   Bounded nodes/depth so it never blocks the UI for long. */
function solveInfo(cars, maxNodes = 12000, maxDepth = 24) {
    const start = cars.map((c) => ({ ...c }));
    if (isSolved(start)) return { par: 0, move: null };
    const seen = new Set([keyOf(start)]);
    let frontier = [{ cars: start, first: null }];
    for (let depth = 1; depth <= maxDepth; depth++) {
        const next = [];
        for (const node of frontier) {
            for (const mv of legalMoves(node.cars)) {
                const ns = applyMove(node.cars, mv.id, mv.x, mv.y);
                const first = node.first || mv;
                if (isSolved(ns)) return { par: depth, move: first };
                const k = keyOf(ns);
                if (seen.has(k)) continue;
                seen.add(k);
                if (seen.size >= maxNodes) return { par: -1, move: null };
                next.push({ cars: ns, first });
            }
        }
        frontier = next;
        if (!frontier.length) break;
    }
    return { par: -1, move: null };
}
function blockersAhead(cars) {
    const m = cars.find((c) => c.main);
    if (!m) return 0;
    return cars.filter(
        (c) => !c.main && !c.horiz && c.x > m.x && c.y <= EXIT_ROW && c.y + c.len > EXIT_ROW
    ).length;
}
/* Random deal, guaranteed solvable: every candidate is verified by the BFS.
   Time-budgeted so mount() always paints fast (fixes the "game not showing"). */
function generate(diff = "classic") {
    const cfg = DIFFS[diff] || DIFFS.classic;
    const t0 = Date.now();
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
        if (attempt > 0 && Date.now() - t0 > 900) break;
        const needPar = attempt < 36 ? cfg.par : Math.max(2, cfg.par - 3);
        const cars = [{ id: 0, x: rnd(3), y: EXIT_ROW, len: 2, horiz: true, main: true }];
        const target = cfg.cars + rnd(2);
        let guard = 0;
        while (cars.length < target && guard++ < 260) {
            const horiz = Math.random() < 0.5;
            const len = Math.random() < 0.62 ? 2 : 3;
            const x = rnd(horiz ? N - len + 1 : N);
            const y = rnd(horiz ? N : N - len + 1);
            /* a horizontal car in the exit lane can never clear it -> skip early */
            if (horiz && y === EXIT_ROW) continue;
            const cand = { id: cars.length, x, y, len, horiz, main: false };
            const occ = occupied(cars, -1);
            if (cellsOf(cand).every(([cx, cy]) => !occ.has(cx + "," + cy))) cars.push(cand);
        }
        if (blockersAhead(cars) === 0) continue; // trivial deal, skip the BFS
        const info = solveInfo(cars, diff === "hard" ? 16000 : 12000, diff === "hard" ? 26 : 22);
        if (info.par >= needPar) return { cars, par: info.par };
        if (info.par >= 1 && (!best || info.par > best.par)) best = { cars, par: info.par };
    }
    if (best) return best;
    /* fallback (fixed: blocker no longer overlaps the gold car) */
    const fb = [
        { id: 0, x: 0, y: EXIT_ROW, len: 2, horiz: true, main: true },
        { id: 1, x: 2, y: 0, len: 3, horiz: false, main: false },
    ];
    return { cars: fb, par: Math.max(1, solveInfo(fb).par) };
}
function immediateWin(cars) {
    for (const m of legalMoves(cars)) {
        if (isSolved(applyMove(cars, m.id, m.x, m.y))) return m;
    }
    return null;
}
/* Bot: win now > force a zugzwang > safe squeeze (never hand over the exit). */
function botChoose(cars, reps = {}) {
    const moves = legalMoves(cars);
    if (!moves.length) return null;
    const win = immediateWin(cars);
    if (win) return win;
    const scored = moves.map((m) => ({ m, ns: applyMove(cars, m.id, m.x, m.y) }));
    const safe = scored.filter((s) => !immediateWin(s.ns));
    const pool = safe.length ? safe : scored;
    const mainBefore = cars.find((c) => c.main);
    let best = null;
    let bestScore = -Infinity;
    for (const { m, ns } of pool) {
        const replies = legalMoves(ns);
        let oppSafe = 0;
        for (const r of replies) {
            if (!immediateWin(applyMove(ns, r.id, r.x, r.y))) oppSafe++;
        }
        if (safe.length && replies.length && oppSafe === 0) return m; // every reply loses
        const main = ns.find((c) => c.main);
        let score = main.x * 1.4 - blockersAhead(ns) * 2.2 - oppSafe * 1.1 + Math.random() * 2.0;
        if (m.id === mainBefore.id && m.x < mainBefore.x) score -= 2.5;
        if ((reps[keyOf(ns)] || 0) >= 1) score -= 4;
        if (score > bestScore) {
            bestScore = score;
            best = m;
        }
    }
    return best || moves[0];
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    /* connection index: 0 = host, 1 = guest. The SEAT (P1/P2) is shuffled per deal
       via state.seats, so it is resolved dynamically with mySeat(). */
    const connIndex = online && !room.isHost ? 1 : 0;
    let roomData = (room && room.room) || null;
    let state = null;
    let destroyed = false;
    const offs = [];
    const sub = (fn) => {
        const u = fn();
        if (typeof u === "function") offs.push(u);
    };

    /* ---- local UI state (never synced) ---- */
    let selected = -1;
    let hint = null;
    let drag = null;
    let introOpen = true;
    let cheatsOpen = false;
    let dismissedDeal = 0;
    let padOn =
        (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ||
        (typeof innerWidth === "number" && innerWidth < 620);
    let botTimer = 0;
    let toastTimer = 0;
    let tossMsg = "";
    let guestName = "Player 2";
    let best = 0;
    try {
        best = Number(localStorage.getItem(META.bestKey)) || 0;
    } catch (e) { }

    root.innerHTML = `
<style>
.pj-root{--pj-ink:#292524;--pj-mut:#78716c;--pj-line:#e7e5e4;--pj-paper:#fafaf9;--pj-card:#fff;--pj-amber:#f59e0b;--pj-soft:#f5f5f4;color:var(--pj-ink)}
.pj-root [hidden]{display:none!important}
.pj-root .pj-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0}
.pj-root .pj-flex{flex:1}
.pj-root .pj-seg{display:inline-flex;border:1px solid var(--pj-line);border-radius:999px;background:var(--pj-card);overflow:hidden}
.pj-root .pj-seg button{appearance:none;border:0;background:transparent;padding:5px 11px;font:inherit;font-size:12px;color:var(--pj-mut);cursor:pointer}
.pj-root .pj-seg button.on{background:var(--pj-ink);color:#fff}
.pj-root .pj-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--pj-mut);border:1px solid var(--pj-line);background:var(--pj-card);border-radius:999px;padding:5px 10px;white-space:nowrap}
.pj-root .pj-chip b{color:var(--pj-ink);font-weight:650}
.pj-root .pj-btn{appearance:none;border:1px solid var(--pj-line);background:var(--pj-card);color:var(--pj-ink);border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;cursor:pointer}
.pj-root .pj-btn:hover{background:var(--pj-soft)}
.pj-root .pj-btn:disabled{opacity:.4;cursor:default}
.pj-root .pj-icon{appearance:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--pj-line);background:var(--pj-card);border-radius:999px;font-size:13px;cursor:pointer;padding:0}
.pj-root .pj-icon:hover{background:var(--pj-soft)}
.pj-root .pj-panel{padding:14px}
.pj-root .pj-stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;outline:none;user-select:none;-webkit-user-select:none}
.pj-root .pj-svg{width:min(100%,440px);height:auto;display:block;background:var(--pj-paper);border:1px solid var(--pj-line);border-radius:18px;touch-action:none}
.pj-root .pj-grid line{stroke:#eae7e2;stroke-width:1}
.pj-root .pj-wall{fill:none;stroke:#d6d3d1;stroke-width:3;stroke-linecap:round}
.pj-root .pj-car{cursor:grab}
.pj-root .pj-car.sel .pj-body{stroke:var(--pj-amber);stroke-width:3}
.pj-root .pj-move{fill:var(--pj-amber);fill-opacity:.13;stroke:var(--pj-amber);stroke-opacity:.55;stroke-dasharray:5 4;cursor:pointer}
.pj-root .pj-move:hover{fill-opacity:.3}
.pj-root .pj-hint{animation:pjPulse 1s ease-in-out infinite}
.pj-root .pj-exit{animation:pjPulse 1.6s ease-in-out infinite}
.pj-root .pj-escape{animation:pjOut .8s ease-in forwards}
@keyframes pjPulse{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes pjOut{to{transform:translateX(70px);opacity:0}}
.pj-root .pj-turn i{width:7px;height:7px;border-radius:50%;background:#a8a29e;display:inline-block}
.pj-root .pj-turn.me i{background:#10b981}
.pj-root .pj-turn.them i{background:var(--pj-amber)}
.pj-root .pj-pad{display:grid;grid-template-columns:repeat(3,58px);grid-auto-rows:46px;gap:6px;justify-content:center}
.pj-root .pj-pad button{appearance:none;border:1px solid var(--pj-line);background:var(--pj-card);border-radius:12px;font-size:16px;color:var(--pj-ink);cursor:pointer;touch-action:manipulation}
.pj-root .pj-pad button:active{transform:scale(.95);background:var(--pj-soft)}
.pj-root .pj-pad button:disabled{opacity:.35}
.pj-root .pj-pad .wide{grid-column:1/-1;font-size:12.5px;font-weight:600}
.pj-root .pj-overlay{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(250,250,249,.92);backdrop-filter:blur(3px);border-radius:18px;padding:12px;overflow:auto}
.pj-root .pj-card{background:var(--pj-card);border:1px solid var(--pj-line);border-radius:16px;box-shadow:0 14px 36px rgba(28,25,23,.10);padding:18px;max-width:370px;width:100%}
.pj-root .pj-card h3{margin:0 0 6px;font-size:17px;letter-spacing:-.01em}
.pj-root .pj-card p{margin:0 0 10px;font-size:12.5px;line-height:1.55;color:var(--pj-mut)}
.pj-root .pj-how{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:7px;font-size:12px;line-height:1.5;color:var(--pj-ink)}
.pj-root kbd{border:1px solid var(--pj-line);border-bottom-width:2px;border-radius:5px;padding:0 4px;font-size:10.5px;background:var(--pj-soft);font-family:inherit}
.pj-root .pj-primary{appearance:none;width:100%;border:0;border-radius:10px;background:var(--pj-ink);color:#fff;padding:9px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.pj-root .pj-primary:hover{background:#44403c}
.pj-root .pj-ghostbtn{appearance:none;width:100%;border:1px solid var(--pj-line);border-radius:10px;background:var(--pj-card);color:var(--pj-ink);padding:9px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.pj-root .pj-row{display:flex;gap:8px;margin-top:4px}
.pj-root .pj-link{appearance:none;border:0;background:none;color:var(--pj-mut);font:inherit;font-size:11.5px;cursor:pointer;margin-top:8px;padding:0;text-decoration:underline}
.pj-root .pj-stats{font-size:12px;color:var(--pj-ink)}
.pj-root .pj-res-title.win{color:#b45309}
.pj-root .pj-res-title.lose{color:#b91c1c}
.pj-root .pj-cheats{position:absolute;top:10px;right:10px;z-index:6;width:232px;background:var(--pj-card);border:1px solid var(--pj-line);border-radius:14px;box-shadow:0 14px 36px rgba(28,25,23,.12);padding:10px;display:grid;gap:6px}
.pj-root .pj-cheats-head{display:flex;align-items:center;justify-content:space-between;font-size:13px}
.pj-root .pj-cheats button[data-cheat]{appearance:none;display:grid;gap:1px;text-align:left;border:1px solid var(--pj-line);background:var(--pj-card);border-radius:10px;padding:7px 9px;font:inherit;font-size:12px;font-weight:600;color:var(--pj-ink);cursor:pointer}
.pj-root .pj-cheats button[data-cheat]:hover{background:var(--pj-soft)}
.pj-root .pj-cheats small{font-weight:400;color:var(--pj-mut);font-size:10.5px}
.pj-root .pj-note{margin:2px 0 0;font-size:10.5px;color:var(--pj-mut)}
.pj-root .pj-toast{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:7;background:var(--pj-ink);color:#fff;font-size:11.5px;padding:6px 12px;border-radius:999px;pointer-events:none;max-width:94%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
<div class="game-app pj-root">
  <div class="game-intro">
    <div><h2>Parking Jam</h2><p>Slide the cars, free the gold one. Solo for par - or take turns and land the escape slide before your rival does.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="pj-bar">
    <div class="pj-seg" data-el="modeSeg" ${online ? "hidden" : ""}>
      <button type="button" data-act="solo" data-val="0">vs Bot</button>
      <button type="button" data-act="solo" data-val="1">Solo</button>
    </div>
    <div class="pj-seg">
      <button type="button" data-act="diff" data-val="easy">Easy</button>
      <button type="button" data-act="diff" data-val="classic">Classic</button>
      <button type="button" data-act="diff" data-val="hard">Hard</button>
    </div>
    <span class="pj-chip"><span data-hud="moveslabel">Moves</span>&nbsp;<b data-hud="moves">0</b></span>
    <span class="pj-chip">Par&nbsp;<b data-hud="par">-</b></span>
    <span class="pj-chip pj-turn" data-hud="turnchip"><i></i><b data-hud="turn">...</b></span>
    <span class="pj-flex"></span>
    <button type="button" class="pj-btn" data-act="undo" title="Undo (U)">Undo</button>
    <button type="button" class="pj-btn" data-act="retry" title="Retry this deal (R)">Retry</button>
    <button type="button" class="pj-btn" data-act="new" title="New random deal (N)">New</button>
    <button type="button" class="pj-icon" data-act="pad" title="Toggle touch pad (P)" aria-label="Toggle touch pad">&#127918;</button>
    <button type="button" class="pj-icon" data-act="help" title="How to play (T)" aria-label="How to play">?</button>
    <button type="button" class="pj-icon" data-act="cheats" title="Cheats (C)" aria-label="Cheats">&#129514;</button>
  </div>
  <section class="game-panel pj-panel" data-board>
    <div class="pj-stage" tabindex="0" data-el="stage">
      <svg class="pj-svg" viewBox="0 0 354 320" data-el="svg" role="img" aria-label="Parking Jam board"></svg>
      <div class="pj-pad" data-el="pad" hidden>
        <span></span><button type="button" data-pad="up" aria-label="Slide up">&#9650;</button><span></span>
        <button type="button" data-pad="left" aria-label="Slide left">&#9664;</button>
        <button type="button" data-pad="cycle" aria-label="Next car">&#10227;</button>
        <button type="button" data-pad="right" aria-label="Slide right">&#9654;</button>
        <span></span><button type="button" data-pad="down" aria-label="Slide down">&#9660;</button><span></span>
        <button type="button" class="wide" data-pad="exit">Drive for the exit &#9166;</button>
      </div>
      <div class="pj-toast" data-el="toast" hidden></div>
      <div class="pj-overlay" data-ov="intro">
        <div class="pj-card">
          <h3>How to play</h3>
          <p data-el="introGoal"></p>
          <ul class="pj-how">
            <li><b>Mouse</b> - click a car, then a glowing slot. Or simply drag it along its lane.</li>
            <li><b>Keyboard</b> - <kbd>Tab</kbd> pick car &middot; <kbd>&#8592;&#8593;&#8595;&#8594;</kbd>/<kbd>WASD</kbd> slide &middot; <kbd>Enter</kbd> dash for the exit &middot; <kbd>1-9</kbd> pick car &middot; <kbd>H</kbd> hint &middot; <kbd>U</kbd> undo &middot; <kbd>C</kbd> cheats.</li>
            <li><b>Touch</b> - tap or drag cars, plus the on-screen pad under the board.</li>
            <li><b>Versus</b> - one slide per turn. Whoever slides the gold car out wins. A coin toss picks the starter, and seats (P1/P2) are shuffled online.</li>
            <li><b>Cheats</b> - hint, auto-slide, tow truck, skip turn, instant escape. Assisted wins are marked.</li>
          </ul>
          <button type="button" class="pj-primary" data-act="start">Let's play</button>
        </div>
      </div>
      <div class="pj-overlay" data-ov="result" hidden>
        <div class="pj-card">
          <h3 class="pj-res-title" data-el="resTitle">Escaped!</h3>
          <p data-el="resReason"></p>
          <p class="pj-stats" data-el="resStats"></p>
          <div class="pj-row">
            <button type="button" class="pj-primary" data-act="new">New deal</button>
            <button type="button" class="pj-ghostbtn" data-act="retry">Rematch</button>
          </div>
          <button type="button" class="pj-link" data-act="dismiss">View board</button>
        </div>
      </div>
      <div class="pj-cheats" data-el="cheats" hidden>
        <div class="pj-cheats-head"><b>Cheats</b><button type="button" class="pj-icon" data-act="cheats" aria-label="Close cheats">&#10005;</button></div>
        <button type="button" data-cheat="hint">Hint<small>show the best next slide</small></button>
        <button type="button" data-cheat="auto">Auto-slide<small>play the best slide for me</small></button>
        <button type="button" data-cheat="tow">Tow truck<small>remove the selected car</small></button>
        <button type="button" data-cheat="skip">Skip turn<small>pass the move to the rival</small></button>
        <button type="button" data-cheat="escape">Instant escape<small>win right now</small></button>
        <button type="button" data-cheat="undo">Undo<small>take back the last slide</small></button>
        <p class="pj-note">Assisted wins are marked and do not count toward your best score.</p>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---- refs ---- */
    const $ = (s) => root.querySelector(s);
    const svg = $('[data-el="svg"]');
    const stage = $('[data-el="stage"]');
    const padWrap = $('[data-el="pad"]');
    const toastEl = $('[data-el="toast"]');
    const statusEl = $("[data-status]");
    const hudMoves = $('[data-hud="moves"]');
    const hudMovesLabel = $('[data-hud="moveslabel"]');
    const hudPar = $('[data-hud="par"]');
    const hudTurn = $('[data-hud="turn"]');
    const turnChip = $('[data-hud="turnchip"]');
    const ovIntro = $('[data-ov="intro"]');
    const ovResult = $('[data-ov="result"]');
    const cheatsEl = $('[data-el="cheats"]');
    const introGoal = $('[data-el="introGoal"]');
    const resTitle = $('[data-el="resTitle"]');
    const resReason = $('[data-el="resReason"]');
    const resStats = $('[data-el="resStats"]');
    const undoBtn = $('[data-act="undo"]');

    /* ---- layout ---- */
    const CELL = 50, PAD = 10, EXIT_W = 34;
    const W = PAD * 2 + N * CELL + EXIT_W, H = PAD * 2 + N * CELL;
    const HUES = ["#93c5fd", "#f9a8d4", "#86efac", "#c4b5fd", "#fdba74", "#5eead4", "#f0abfc", "#fde047", "#7dd3fc"];
    const gx = (x) => PAD + x * CELL;
    const gy = (y) => PAD + y * CELL;
    const carRect = (c) => ({
        x: gx(c.x) + 3,
        y: gy(c.y) + 3,
        w: (c.horiz ? c.len : 1) * CELL - 6,
        h: (c.horiz ? 1 : c.len) * CELL - 6,
    });

    /* ---- helpers ---- */
    const mySeat = () => (online && state ? state.seats[connIndex] : connIndex);
    const nameOf = (i) => (state && state.names[i]) || "Player " + (i + 1);
    const canMove = () => !!state && state.winner === null && state.turn === mySeat();

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.removeAttribute("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.setAttribute("hidden", ""), 2300);
    }
    function saveBest() {
        if (!state || state.assisted) return;
        if (!best || state.total < best) {
            best = state.total;
            try {
                localStorage.setItem(META.bestKey, String(best));
            } catch (e) { }
        }
    }
    function pushHistory() {
        state.history.push({ cars: state.cars, turn: state.turn, moves: state.moves.slice(), total: state.total, par: state.par });
        if (state.history.length > 80) state.history.shift();
    }

    /* ---- state factory (serializable: plain JSON, no undefined) ---- */
    function makeState(diff, solo, prev = null, reuse = false) {
        const deal = reuse && prev ? { cars: prev.initialCars.map((c) => ({ ...c })), par: prev.par } : generate(diff);
        const seats = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1]; // random seat shuffle online
        const first = solo ? 0 : rnd(2); // random starter
        const names = online ? ["Player 1", "Player 2"] : [playerName || "You", "Bot"];
        if (online) {
            names[seats[0]] = playerName || "Player 1";
            names[seats[1]] = guestName;
        }
        return {
            v: 1,
            dealNo: prev ? prev.dealNo + 1 : 1,
            difficulty: diff,
            solo: online ? false : !!solo,
            cars: deal.cars,
            initialCars: deal.cars.map((c) => ({ ...c })),
            par: deal.par,
            seats,
            first,
            turn: first,
            names,
            moves: [0, 0],
            total: 0,
            winner: null, // null | seat 0 | seat 1 | "draw" | "stuck" (solo)
            reason: null, // "exit" | "gridlock" | "repetition" | "movecap"
            assisted: false,
            reps: {},
            history: [],
            last: null,
        };
    }
    function afterDeal() {
        selected = -1;
        hint = null;
        drag = null;
        dismissedDeal = 0;
        const s = state;
        tossMsg = s.solo
            ? "New deal - par " + s.par
            : online
                ? "Seats shuffled: you are " + nameOf(mySeat()) + " (P" + (mySeat() + 1) + "). " + nameOf(s.first) + " starts."
                : s.first === 0
                    ? "Coin toss - you start!"
                    : "Coin toss - Bot starts.";
        if (!introOpen) toast(tossMsg);
    }

    /* ---- rendering ---- */
    function renderBoard() {
        const s = state;
        const cars = s ? s.cars : [];
        let html = '<rect x="' + gx(N) + '" y="' + gy(EXIT_ROW) + '" width="' + EXIT_W + '" height="' + CELL + '" fill="#f59e0b" opacity=".08"/>';
        html += '<g class="pj-grid">';
        for (let i = 1; i < N; i++) {
            html += '<line x1="' + gx(i) + '" y1="' + PAD + '" x2="' + gx(i) + '" y2="' + (H - PAD) + '"/>';
            html += '<line x1="' + PAD + '" y1="' + gy(i) + '" x2="' + gx(N) + '" y2="' + gy(i) + '"/>';
        }
        html += "</g>";
        const ex1 = gy(EXIT_ROW), ex2 = gy(EXIT_ROW + 1), mid = (ex1 + ex2) / 2;
        html += '<path class="pj-wall" d="M' + PAD + " " + PAD + " H" + gx(N) + " V" + ex1 + " H" + (W - PAD) + " M" + (W - PAD) + " " + ex2 + " V" + (H - PAD) + " H" + PAD + " V" + PAD + '"/>';
        html += '<path class="pj-exit" d="M' + (gx(N) + 8) + " " + mid + ' h16 m0 0 l-7 -7 m7 7 l-7 7" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
        if (s && selected >= 0 && canMove()) {
            const list = legalMoves(cars).filter((m) => m.id === selected);
            list.forEach((mv, i) => {
                const c = cars.find((cc) => cc.id === mv.id);
                if (!c) return;
                const r = carRect({ ...c, x: mv.x, y: mv.y });
                html += '<rect class="pj-move" data-mv="' + i + '" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="9"/>';
            });
        }
        if (s && hint && canMove()) {
            const c = cars.find((cc) => cc.id === hint.id);
            if (c) {
                const r = carRect({ ...c, x: hint.x, y: hint.y });
                html += '<rect class="pj-move pj-hint" data-hint="1" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="9"/>';
            }
        }
        for (const c of cars) {
            const r = carRect(c);
            const fill = c.main ? "#fbbf24" : HUES[c.id % HUES.length];
            const stroke = c.main ? "#b45309" : "rgba(28,25,23,.28)";
            const escaped = !!s && s.winner !== null && s.reason === "exit" && c.main;
            const dim = !!s && s.winner !== null && !c.main;
            const wx = c.horiz ? r.x + r.w * 0.6 : r.x + 5;
            const wy = c.horiz ? r.y + 5 : r.y + r.h * 0.6;
            const ww = c.horiz ? r.w * 0.26 : r.w - 10;
            const wh = c.horiz ? r.h - 10 : r.h * 0.26;
            html +=
                '<g class="pj-car' + (c.id === selected ? " sel" : "") + (escaped ? " pj-escape" : "") + '" data-car="' + c.id + '"' + (dim ? ' opacity=".55"' : "") + ">" +
                '<rect class="pj-body" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="9" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>' +
                '<rect x="' + wx + '" y="' + wy + '" width="' + ww + '" height="' + wh + '" rx="3" fill="rgba(15,23,42,.20)" pointer-events="none"/>' +
                '<text x="' + (r.x + 7) + '" y="' + (r.y + 14) + '" font-size="10" font-weight="600" fill="rgba(28,25,23,.40)" pointer-events="none">' + (c.id + 1) + "</text></g>";
        }
        svg.innerHTML = html;
    }
    function updateHud() {
        const s = state;
        hudMovesLabel.textContent = s && !s.solo ? "You : " + (online ? "Rival" : "Bot") : "Moves";
        hudMoves.textContent = s ? (s.solo ? String(s.total) : s.moves[mySeat()] + " : " + s.moves[1 - mySeat()]) : "0";
        hudPar.textContent = s && s.par > 0 ? String(s.par) : "-";
        let turnTxt = "Ready", cls = "";
        if (!s) turnTxt = online ? "Waiting for host..." : "Ready";
        else if (s.winner !== null)
            turnTxt = s.winner === "draw" ? "Draw" : s.winner === "stuck" ? "Gridlocked" : s.solo ? "Solved" : s.winner === mySeat() ? "You won" : nameOf(s.winner) + " won";
        else if (s.solo) { turnTxt = "Your move"; cls = "me"; }
        else if (s.turn === mySeat()) { turnTxt = "Your turn (P" + (mySeat() + 1) + ")"; cls = "me"; }
        else { turnTxt = online ? nameOf(s.turn) + " to move" : "Bot thinking..."; cls = "them"; }
        hudTurn.textContent = turnTxt;
        turnChip.className = "pj-chip pj-turn" + (cls ? " " + cls : "");
        statusEl.textContent = s ? "Deal " + s.dealNo + " - " + (DIFFS[s.difficulty] || DIFFS.classic).label + (s.assisted ? " - assisted" : "") : "Loading...";
        root.querySelectorAll('[data-act="solo"]').forEach((b) => b.classList.toggle("on", !!s && String(s.solo ? 1 : 0) === b.dataset.val));
        root.querySelectorAll('[data-act="diff"]').forEach((b) => b.classList.toggle("on", !!s && s.difficulty === b.dataset.val));
        undoBtn.disabled = !s || !s.history.length || s.winner !== null;
    }
    function updateOverlays() {
        const s = state;
        ovIntro.hidden = !introOpen;
        introGoal.textContent = !s
            ? "Loading deal..."
            : s.solo
                ? "Solo: free the gold car in as few slides as possible - match or beat par."
                : "Versus: players alternate one slide each. Whoever slides the gold car out through the gap wins.";
        cheatsEl.hidden = !cheatsOpen;
        const skipBtn = cheatsEl.querySelector('[data-cheat="skip"]');
        if (skipBtn) skipBtn.hidden = !s || s.solo;
        if (s && s.winner !== null && dismissedDeal !== s.dealNo) {
            const w = s.winner;
            let title = "Escaped!", reason = "", cls = "win";
            if (s.solo) {
                if (w === "stuck") { title = "Gridlocked"; reason = "No car can slide. Retry this deal or shuffle a new lot."; cls = "lose"; }
                else reason = s.total <= s.par ? "At or under par - sharp shuffling." : "Par was " + s.par + ". Try to shave it down.";
            } else if (w === "draw") {
                title = "Draw"; cls = "";
                reason = s.reason === "gridlock" ? "The lot gridlocked - nobody can move." : s.reason === "repetition" ? "The same position appeared three times." : "The " + MOVE_CAP + "-slide limit was reached.";
            } else {
                const youWin = w === mySeat();
                title = youWin ? "You win!" : online ? nameOf(w) + " wins" : "Bot wins";
                cls = youWin ? "win" : "lose";
                reason = nameOf(w) + " landed the escape slide" + (s.assisted ? " (assisted)" : "") + ".";
            }
            resTitle.textContent = title;
            resTitle.className = "pj-res-title" + (cls ? " " + cls : "");
            resReason.textContent = reason;
            resStats.textContent = s.solo
                ? "Moves " + s.total + " - Par " + (s.par > 0 ? s.par : "-") + " - Best " + (best || "-") + (s.assisted ? " - assisted" : "")
                : nameOf(0) + " " + s.moves[0] + " : " + s.moves[1] + " " + nameOf(1) + (s.assisted ? " - assisted" : "");
            ovResult.hidden = false;
        } else {
            ovResult.hidden = true;
        }
    }
    function updatePad() {
        padWrap.hidden = !padOn;
        padWrap.querySelectorAll("button").forEach((b) => {
            b.disabled = b.dataset.pad === "cycle" ? !state : !canMove();
        });
    }
    function render() {
        renderBoard();
        updateHud();
        updateOverlays();
        updatePad();
    }

    /* ---- canonical mutations (host / local only) ---- */
    function applyAction(action, actor) {
        if (destroyed || !state || !action || typeof action !== "object") return;
        const s = state;
        const t = action.type;
        if (t === "hello") {
            if (online && typeof action.name === "string" && action.name.trim()) {
                guestName = action.name.trim().slice(0, 18);
                s.names[actor] = guestName;
                publish();
            }
            return;
        }
        if (t === "new" || t === "retry" || t === "difficulty" || t === "solo") {
            if (t === "difficulty") {
                if (!DIFFS[action.value]) return;
                state = makeState(action.value, s.solo, s, false);
            } else if (t === "solo") {
                if (online) return;
                state = makeState(s.difficulty, !!action.value, s, false);
            } else if (t === "retry") {
                state = makeState(s.difficulty, s.solo, s, true);
            } else {
                state = makeState(s.difficulty, s.solo, s, false);
            }
            afterDeal();
            publish();
            return;
        }
        if (s.winner !== null) return;
        if (t === "undo") {
            if (!s.history.length) return;
            const k = keyOf(s.cars);
            if (s.reps[k]) s.reps[k]--;
            const snap = s.history.pop();
            s.cars = snap.cars;
            s.turn = snap.turn;
            s.moves = snap.moves;
            s.total = snap.total;
            s.par = snap.par;
            s.last = null;
            selected = -1;
            hint = null;
            publish();
            return;
        }
        if (actor !== s.turn) return; // everything below needs the move
        if (t === "cheat") {
            if (action.kind === "tow") {
                const c = s.cars.find((cc) => cc.id === action.id);
                if (!c || c.main) return;
                pushHistory();
                s.cars = s.cars.filter((cc) => cc.id !== action.id);
                s.assisted = true;
                const info = solveInfo(s.cars, 9000, 22);
                s.par = info.par > 0 ? info.par : 0;
                selected = -1;
                hint = null;
                publish();
            } else if (action.kind === "skip") {
                if (s.solo) return;
                s.turn = 1 - s.turn;
                s.assisted = true;
                hint = null;
                publish();
            } else if (action.kind === "escape") {
                const m = s.cars.find((c) => c.main);
                if (!m) return;
                s.cars = applyMove(s.cars, m.id, N - m.len, m.y);
                s.moves[actor]++;
                s.total++;
                s.winner = actor;
                s.reason = "exit";
                s.assisted = true;
                if (s.solo) saveBest();
                publish();
            }
            return;
        }
        if (t === "slide") {
            if (!legalMoves(s.cars).some((m) => m.id === action.id && m.x === action.x && m.y === action.y)) return;
            pushHistory();
            s.cars = applyMove(s.cars, action.id, action.x, action.y);
            s.moves[actor]++;
            s.total++;
            s.last = { id: action.id, x: action.x, y: action.y, by: actor };
            if (action.assisted) s.assisted = true;
            const k = keyOf(s.cars);
            s.reps[k] = (s.reps[k] || 0) + 1;
            if (isSolved(s.cars)) {
                s.winner = actor;
                s.reason = "exit";
                if (s.solo) saveBest();
            } else if (!legalMoves(s.cars).length) {
                s.winner = s.solo ? "stuck" : "draw";
                s.reason = "gridlock";
            } else if (!s.solo && s.reps[k] >= 3) {
                s.winner = "draw";
                s.reason = "repetition";
            } else if (!s.solo && s.total >= MOVE_CAP) {
                s.winner = "draw";
                s.reason = "movecap";
            } else if (!s.solo) {
                s.turn = 1 - s.turn;
            }
            selected = -1;
            hint = null;
            publish();
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---- local bot (AI mode) ---- */
    function scheduleBot() {
        clearTimeout(botTimer);
        if (!online && state && !state.solo && state.winner === null && state.turn === 1) {
            botTimer = setTimeout(botPlay, 700 + Math.random() * 600);
        }
    }
    function botPlay() {
        if (destroyed || !state || state.solo || state.winner !== null || state.turn !== 1) return;
        const mv = botChoose(state.cars, state.reps);
        if (mv) applyAction({ type: "slide", id: mv.id, x: mv.x, y: mv.y }, 1);
    }

    /* ---- player intents ---- */
    function submitSlide(id, x, y, assisted = false) {
        if (!state || state.winner !== null) return;
        if (!canMove()) {
            toast("Wait - " + nameOf(state.turn) + " is moving");
            render();
            return;
        }
        const ok = legalMoves(state.cars).some((m) => m.id === id && m.x === x && m.y === y);
        if (!ok) {
            toast("That slide is blocked");
            render();
            return;
        }
        selected = -1;
        hint = null;
        const act = { type: "slide", id, x, y };
        if (assisted) act.assisted = true;
        submitAction(act);
        render();
    }
    function slideDir(dx, dy) {
        if (!state || state.winner !== null) return;
        if (selected < 0) {
            const m = state.cars.find((c) => c.main);
            selected = m ? m.id : state.cars.length ? state.cars[0].id : -1;
        }
        const c = state.cars.find((cc) => cc.id === selected);
        if (!c) return;
        if (c.horiz ? dy !== 0 : dx !== 0) {
            toast("Cars only slide along their own length");
            render();
            return;
        }
        submitSlide(c.id, c.x + dx, c.y + dy);
    }
    function escapeAttempt() {
        if (!state || state.winner !== null) return;
        const m = state.cars.find((c) => c.main);
        if (!m) return;
        selected = m.id;
        const xs = legalMoves(state.cars).filter((mv) => mv.id === m.id && mv.x > m.x).map((mv) => mv.x);
        if (!xs.length) {
            toast("The exit lane is blocked");
            render();
            return;
        }
        submitSlide(m.id, Math.max.apply(null, xs), m.y);
    }
    function cycleSel(dir) {
        if (!state || !state.cars.length) return;
        const ids = state.cars.map((c) => c.id).sort((a, b) => a - b);
        const i = ids.indexOf(selected);
        selected = i < 0 ? (dir > 0 ? ids[0] : ids[ids.length - 1]) : ids[(i + dir + ids.length) % ids.length];
        hint = null;
        render();
    }
    function doCheat(kind) {
        if (!state) return;
        if (kind === "hint") {
            const info = solveInfo(state.cars, 12000, 24);
            if (info.move) {
                hint = info.move;
                selected = hint.id;
                render();
                toast("Hint: slide to the pulsing slot");
            } else toast("No hint found within the search limit");
            return;
        }
        if (kind === "undo") { submitAction({ type: "undo" }); return; }
        if (!canMove()) { toast("Wait - " + nameOf(state.turn) + " is moving"); return; }
        if (kind === "auto") {
            const info = solveInfo(state.cars, 12000, 24);
            if (info.move) submitSlide(info.move.id, info.move.x, info.move.y, true);
            else toast("No auto move found");
        } else if (kind === "tow") {
            const c = state.cars.find((cc) => cc.id === selected);
            if (!c || c.main) { toast("Select a blocking car first"); return; }
            submitAction({ type: "cheat", kind: "tow", id: c.id });
        } else if (kind === "skip") {
            submitAction({ type: "cheat", kind: "skip" });
        } else if (kind === "escape") {
            submitAction({ type: "cheat", kind: "escape" });
        }
    }
    function padAction(k) {
        if (k === "cycle") cycleSel(1);
        else if (k === "exit") escapeAttempt();
        else if (k === "left") slideDir(-1, 0);
        else if (k === "right") slideDir(1, 0);
        else if (k === "up") slideDir(0, -1);
        else if (k === "down") slideDir(0, 1);
    }
    function startGame() {
        introOpen = false;
        render();
        if (stage.focus) stage.focus({ preventScroll: true });
        if (tossMsg) toast(tossMsg);
    }

    /* ---- events: click (buttons / pad / cheats) ---- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const padBtn = t.closest("[data-pad]");
        if (padBtn) { padAction(padBtn.dataset.pad); return; }
        const cheatBtn = t.closest("[data-cheat]");
        if (cheatBtn) { doCheat(cheatBtn.dataset.cheat); return; }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const a = btn.dataset.act;
        if (a === "start") startGame();
        else if (a === "help") { introOpen = !introOpen; render(); }
        else if (a === "cheats") { cheatsOpen = !cheatsOpen; render(); }
        else if (a === "pad") { padOn = !padOn; render(); }
        else if (a === "dismiss") { dismissedDeal = state ? state.dealNo : 0; render(); }
        else if (a === "undo") submitAction({ type: "undo" });
        else if (a === "retry") submitAction({ type: "retry" });
        else if (a === "new") submitAction({ type: "new" });
        else if (a === "solo") submitAction({ type: "solo", value: btn.dataset.val === "1" });
        else if (a === "diff") submitAction({ type: "difficulty", value: btn.dataset.val });
    }

    /* ---- events: keyboard (desktop) ---- */
    function onKey(e) {
        if (destroyed) return;
        const k = e.key;
        if (k === "Escape") {
            if (cheatsOpen) cheatsOpen = false;
            else if (introOpen) introOpen = false;
            else if (state && state.winner !== null) dismissedDeal = state.dealNo;
            else { selected = -1; hint = null; }
            render();
            e.preventDefault();
            return;
        }
        if (introOpen) {
            if (k === "Enter" || k === " ") { startGame(); e.preventDefault(); }
            return;
        }
        if (e.target && e.target.tagName === "BUTTON" && (k === "Enter" || k === " ")) return;
        if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) { submitAction({ type: "undo" }); e.preventDefault(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        switch (k) {
            case "ArrowLeft": case "a": case "A": slideDir(-1, 0); break;
            case "ArrowRight": case "d": case "D": slideDir(1, 0); break;
            case "ArrowUp": case "w": case "W": slideDir(0, -1); break;
            case "ArrowDown": case "s": case "S": slideDir(0, 1); break;
            case "Tab": cycleSel(e.shiftKey ? -1 : 1); break;
            case "Enter": case " ": escapeAttempt(); break;
            case "h": case "H": doCheat("hint"); break;
            case "u": case "U": submitAction({ type: "undo" }); break;
            case "c": case "C": cheatsOpen = !cheatsOpen; render(); break;
            case "r": case "R": submitAction({ type: "retry" }); break;
            case "n": case "N": submitAction({ type: "new" }); break;
            case "p": case "P": padOn = !padOn; render(); break;
            case "t": case "T": case "?": introOpen = !introOpen; render(); break;
            default:
                if (k.length === 1 && k >= "1" && k <= "9") {
                    const id = Number(k) - 1;
                    if (state && state.cars.some((c) => c.id === id)) { selected = id; hint = null; render(); }
                } else return;
        }
        e.preventDefault();
    }

    /* ---- events: pointer (mouse click + drag, touch tap + drag) ---- */
    function onDown(e) {
        if (!state || destroyed) return;
        if (stage.focus) stage.focus({ preventScroll: true });
        const t = e.target;
        const mvEl = t.closest ? t.closest("[data-mv]") : null;
        if (mvEl) {
            const i = Number(mvEl.dataset.mv);
            const list = selected >= 0 ? legalMoves(state.cars).filter((m) => m.id === selected) : [];
            const mv = list[i];
            if (mv) submitSlide(mv.id, mv.x, mv.y);
            e.preventDefault();
            return;
        }
        if (t.closest && t.closest("[data-hint]")) {
            if (hint) submitSlide(hint.id, hint.x, hint.y);
            e.preventDefault();
            return;
        }
        const carEl = t.closest ? t.closest("[data-car]") : null;
        if (!carEl) {
            if (selected >= 0) { selected = -1; hint = null; render(); }
            return;
        }
        const id = Number(carEl.dataset.car);
        const wasSel = selected === id;
        selected = id;
        hint = null;
        render();
        const c = state.cars.find((cc) => cc.id === id);
        if (!c) return;
        const offs = legalMoves(state.cars).filter((m) => m.id === id).map((m) => (c.horiz ? m.x - c.x : m.y - c.y));
        drag = {
            id, wasSel,
            x0: e.clientX, y0: e.clientY,
            moved: false,
            locked: !canMove(),
            horiz: c.horiz,
            min: Math.min.apply(null, [0].concat(offs)),
            max: Math.max.apply(null, [0].concat(offs)),
            cells: 0,
        };
        try { svg.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault();
    }
    function onPtrMove(e) {
        if (!drag || drag.locked) return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const scale = W / rect.width;
        const dClient = drag.horiz ? e.clientX - drag.x0 : e.clientY - drag.y0;
        if (Math.abs(dClient) > 5) drag.moved = true;
        let d = dClient * scale;
        d = Math.max(drag.min * CELL, Math.min(drag.max * CELL, d));
        drag.cells = Math.round(d / CELL);
        const g = svg.querySelector('g[data-car="' + drag.id + '"]');
        if (g) g.setAttribute("transform", drag.horiz ? "translate(" + d + ",0)" : "translate(0," + d + ")");
    }
    function onPtrUp(e) {
        if (!drag) return;
        const d = drag;
        drag = null;
        try { svg.releasePointerCapture(e.pointerId); } catch (err) { }
        const c = state ? state.cars.find((cc) => cc.id === d.id) : null;
        if (d.moved && c && d.cells !== 0) {
            submitSlide(d.id, c.x + (d.horiz ? d.cells : 0), c.y + (d.horiz ? 0 : d.cells));
        } else if (!d.moved && d.wasSel) {
            selected = -1;
            render();
        } else render();
    }
    function onPtrCancel() {
        drag = null;
        render();
    }

    /* ---- wiring ---- */
    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", onKey);
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onPtrMove);
    svg.addEventListener("pointerup", onPtrUp);
    svg.addEventListener("pointercancel", onPtrCancel);

    if (online) {
        sub(() => room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = makeState("classic", false);
            afterDeal();
            publish();
            sub(() => room.onAction((action) => { if (!destroyed && state) applyAction(action, state.seats[1]); }));
        } else {
            sub(() => room.onState((nextState) => { if (destroyed) return; state = nextState; selected = -1; hint = null; render(); }));
            room.sendAction({ type: "hello", name: playerName }).catch(console.warn);
            render();
        }
    } else {
        state = makeState("classic", false);
        afterDeal();
        publish();
    }
    if (stage.focus) stage.focus({ preventScroll: true });

    return {
        destroy() {
            destroyed = true;
            clearTimeout(botTimer);
            clearTimeout(toastTimer);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("keydown", onKey);
            svg.removeEventListener("pointerdown", onDown);
            svg.removeEventListener("pointermove", onPtrMove);
            svg.removeEventListener("pointerup", onPtrUp);
            svg.removeEventListener("pointercancel", onPtrCancel);
            offs.forEach((u) => { try { u(); } catch (e) { } });
        },
    };
}

/* exposed for unit tests (ignored by the manifest builder) */
export const _test = { N, EXIT_ROW, MOVE_CAP, DIFFS, cellsOf, occupied, legalMoves, applyMove, isSolved, keyOf, solveInfo, generate, botChoose, immediateWin };