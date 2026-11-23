/* ==== GAME: farkle.js ==== */
/*
 * Farkle — push-your-luck dice duel (real Farkle rules).
 * Template: export META + mount(root, context).
 * Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "farkle", // harus sama dengan nama file (tanpa .js)
    name: "Farkle",
    category: "casino",
    catLabel: "Casino",
    desc: "Push-your-luck dice duel. Bank combos, dodge farkles, race to 10,000.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="21" width="20" height="20" rx="5"/><circle cx="10" cy="28" r="1.7" fill="currentColor" stroke="none"/><circle cx="16" cy="34" r="1.7" fill="currentColor" stroke="none"/><rect x="27" y="3" width="18" height="18" rx="5"/><circle cx="33.5" cy="9.5" r="1.7" fill="currentColor" stroke="none"/><circle cx="36" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="38.5" cy="14.5" r="1.7" fill="currentColor" stroke="none"/><path d="M41 44V27M35 33l6-6 6 6"/></svg>',
    bg: ["#c7d2fe", "#6366f1"],
};

/* ================= pure rules ================= */

const TARGET = 10000;          // classic Farkle target
const FARKLE_LIMIT = 3;        // three consecutive farkles...
const FARKLE_PENALTY = 1000;   // ...cost 1000 points
const STRAIGHT_PTS = 1500;
const PAIRS_PTS = 1500;
const TWO_TRIPLETS_PTS = 2500;

/* chance a fresh roll of n dice has no scoring combo */
const FARKLE_RISK = { 1: 0.67, 2: 0.44, 3: 0.28, 4: 0.13, 5: 0.08, 6: 0.02 };

/* pip layout on a 60x60 die face */
const PIP = {
    0: [],
    1: [[30, 30]],
    2: [[20, 20], [40, 40]],
    3: [[20, 20], [30, 30], [40, 40]],
    4: [[20, 20], [40, 20], [20, 40], [40, 40]],
    5: [[20, 20], [40, 20], [30, 30], [20, 40], [40, 40]],
    6: [[20, 20], [40, 20], [20, 30], [40, 30], [20, 40], [40, 40]],
};

function rollDice(n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(1 + ((Math.random() * 6) | 0));
    return a;
}

function tally(dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < dice.length; i++) {
        const v = dice[i];
        if (v < 1 || v > 6) return null;
        c[v] += 1;
    }
    return c;
}

const tripleVal = (n) => (n === 1 ? 1000 : n * 100);
const oakMult = (k) => Math.pow(2, k - 3); // 4-kind x2, 5-kind x4, 6-kind x8

/* best score using EVERY die in counts c; -1 if they cannot all score */
const memo = new Map();
function bestScore(c) {
    const key = c.join("");
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let n = 1; n <= 6; n++) total += c[n];
    let best = -1;
    if (total === 0) {
        best = 0;
    } else {
        if (c[1] > 0) {
            c[1] -= 1;
            const s = bestScore(c);
            c[1] += 1;
            if (s >= 0 && 100 + s > best) best = 100 + s;
        }
        if (c[5] > 0) {
            c[5] -= 1;
            const s = bestScore(c);
            c[5] += 1;
            if (s >= 0 && 50 + s > best) best = 50 + s;
        }
        for (let n = 1; n <= 6; n++) {
            if (c[n] < 3) continue;
            for (let k = 3; k <= c[n]; k++) {
                c[n] -= k;
                const s = bestScore(c);
                c[n] += k;
                if (s >= 0) {
                    const p = tripleVal(n) * oakMult(k) + s;
                    if (p > best) best = p;
                }
            }
        }
        if (total === 6) {
            let straight = true, allPairs = true, trips = 0;
            for (let n = 1; n <= 6; n++) {
                if (c[n] !== 1) straight = false;
                if (c[n] % 2 !== 0) allPairs = false;
                if (c[n] === 3) trips += 1;
            }
            if (straight && best < STRAIGHT_PTS) best = STRAIGHT_PTS;
            if (allPairs && best < PAIRS_PTS) best = PAIRS_PTS; // incl. 4-of-a-kind + pair
            if (trips === 2 && best < TWO_TRIPLETS_PTS) best = TWO_TRIPLETS_PTS;
        }
    }
    memo.set(key, best);
    return best;
}

/* points for the selected subset; 0 when the selection is not valid */
function selectionScore(dice, sel) {
    if (!dice || !sel || sel.length === 0) return 0;
    if (!tally(dice)) return 0;
    const sc = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < sel.length; i++) {
        const idx = sel[i];
        if (idx < 0 || idx >= dice.length) return 0;
        sc[dice[idx]] += 1;
    }
    const s = bestScore(sc);
    return s > 0 ? s : 0;
}

/* any scoring die or combo present? (farkle detection) */
function hasAnyScore(dice) {
    const c = tally(dice);
    if (!c) return false;
    if (c[1] > 0 || c[5] > 0) return true;
    for (let n = 1; n <= 6; n++) if (c[n] >= 3) return true;
    if (dice.length === 6) {
        let straight = true, allPairs = true;
        for (let n = 1; n <= 6; n++) {
            if (c[n] !== 1) straight = false;
            if (c[n] % 2 !== 0) allPairs = false;
        }
        if (straight || allPairs) return true;
    }
    return false;
}

/* cheat: a roll that is guaranteed to contain something scoring */
function luckyRoll(n) {
    let d = rollDice(n);
    for (let i = 0; i < 80 && !hasAnyScore(d); i++) d = rollDice(n);
    return d;
}

/* dice the bot sets aside: one clean combo, else combos + all 1s and 5s */
function aiKeepDice(dice) {
    const all = dice.map((v, i) => i);
    if (selectionScore(dice, all) >= 300) return all;
    const c = tally(dice);
    const keep = [];
    for (let n = 1; n <= 6; n++) {
        if (c[n] >= 3)
            for (let i = 0; i < dice.length; i++)
                if (dice[i] === n) keep.push(i);
    }
    for (let i = 0; i < dice.length; i++) {
        if ((dice[i] === 1 || dice[i] === 5) && keep.indexOf(i) < 0) keep.push(i);
    }
    return keep.sort((a, b) => a - b);
}

/* bot decision: bank the turn pot or roll again */
function botPlan(st) {
    const me = st.turn, opp = 1 - me;
    const tp = st.turnPts, n = st.dice.length;
    if (st.totals[me] + tp >= TARGET) return "bank";
    if (st.targetBy === opp) {
        /* final turn: nothing to lose, must overtake the leader */
        return st.totals[me] + tp > st.totals[opp] ? "bank" : "roll";
    }
    if (n === 0) return "roll"; // hot dice
    const risk = FARKLE_RISK[n] !== undefined ? FARKLE_RISK[n] : 0.3;
    if (tp >= Math.max(250, Math.round(risk * 900))) return "bank";
    if (tp >= 200 && n <= 2) return "bank";
    return "roll";
}

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    const NAMES = online ? ["Player 1", "Player 2"] : ["You", "Rival"];
    const seatName = (s) => NAMES[s];
    const fmt = (n) => n.toLocaleString("en-US");
    const mySeat = () =>
        online ? (room.isHost ? (state ? state.hostSeat : 0) : state ? 1 - state.hostSeat : 1) : 0;

    /* ---------------- shell (minimalist) ---------------- */
    root.innerHTML = `
<style>
#farkle-root [hidden]{display:none!important}
#farkle-root .fk-panel{position:relative;overflow:hidden;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:18px;color:#0f172a;display:flex;flex-direction:column;gap:14px}
#farkle-root .fk-scoreboard{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch}
#farkle-root .fk-seat{background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;transition:border-color .2s,background .2s}
#farkle-root .fk-seat.active{border-color:#6366f1;background:#eef2ff}
#farkle-root .fk-seat-top{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
#farkle-root .fk-you{background:#4f46e5;color:#fff;border-radius:999px;padding:1px 7px;font-size:9.5px;letter-spacing:.04em}
#farkle-root .fk-lucky{font-size:12px}
#farkle-root .fk-seat-score{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
#farkle-root .fk-seat-score small{font-size:11px;font-weight:600;color:#94a3b8}
#farkle-root .fk-bar{display:block;height:4px;border-radius:99px;background:#e2e8f0;overflow:hidden}
#farkle-root .fk-bar i{display:block;height:100%;width:0;background:#6366f1;border-radius:99px;transition:width .35s ease}
#farkle-root .fk-streak{font-size:10.5px;font-weight:700;color:#ef4444;min-height:13px}
#farkle-root .fk-pot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 6px;text-align:center}
#farkle-root .fk-pot span{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
#farkle-root .fk-pot b{font-size:20px;font-weight:800;color:#4f46e5;font-variant-numeric:tabular-nums}
#farkle-root .fk-pot em{font-style:normal;font-size:11px;color:#94a3b8}
#farkle-root .fk-dice{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:flex-end;min-height:66px;user-select:none;touch-action:manipulation}
#farkle-root .fk-die{width:56px;height:56px;background:#fff;border:2px solid #cbd5e1;border-radius:12px;padding:0;cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,opacity .2s ease}
#farkle-root .fk-die svg{display:block;width:100%;height:100%}
#farkle-root .fk-die-bg{fill:transparent}
#farkle-root .fk-pip{fill:#0f172a}
#farkle-root .fk-die.sel{transform:translateY(-6px);border-color:#6366f1;box-shadow:0 8px 14px rgba(79,70,229,.22)}
#farkle-root .fk-die.ghost{border-style:dashed;border-color:#e2e8f0;background:transparent;cursor:default}
#farkle-root .fk-die.off{display:none}
#farkle-root .fk-die.locked{cursor:default}
#farkle-root .fk-die.dead{opacity:.4;filter:grayscale(1)}
#farkle-root .fk-die.spent{opacity:.55}
#farkle-root .fk-die.rolling{animation:fkRoll .24s linear infinite}
#farkle-root .fk-die.nope{animation:fkNope .32s ease}
#farkle-root .fk-note{min-height:20px;font-size:13px;font-weight:600;color:#64748b;text-align:center;line-height:1.4}
#farkle-root .fk-controls{display:flex;gap:10px;justify-content:center}
#farkle-root .fk-btn{height:44px;padding:0 20px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s,color .15s;touch-action:manipulation}
#farkle-root .fk-btn:hover:not(:disabled){border-color:#6366f1;color:#4f46e5}
#farkle-root .fk-btn.primary{background:#4f46e5;border-color:transparent;color:#fff}
#farkle-root .fk-btn.primary:hover:not(:disabled){background:#4338ca;color:#fff}
#farkle-root .fk-btn:disabled{opacity:.4;cursor:default}
#farkle-root .fk-result{display:flex;flex-direction:column;align-items:center;gap:8px;padding:4px 0}
#farkle-root .fk-result b{font-size:19px;font-weight:800}
#farkle-root .fk-result.win b{color:#16a34a}
#farkle-root .fk-result.lose b{color:#dc2626}
#farkle-root .fk-result.draw b{color:#64748b}
#farkle-root .fk-result span{font-size:12.5px;color:#94a3b8;font-variant-numeric:tabular-nums}
#farkle-root .fk-cheats{position:absolute;inset:0;background:rgba(15,23,42,.35);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:5}
#farkle-root .fk-cheat-card{width:min(320px,92%);background:#fff;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 18px 40px rgba(15,23,42,.25)}
#farkle-root .fk-cheat-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}
#farkle-root .fk-cheat-head b{font-size:14px;font-weight:800;letter-spacing:.02em}
#farkle-root .fk-x{width:28px;height:28px;border:none;border-radius:8px;background:#f1f5f9;color:#64748b;font-size:16px;line-height:1;cursor:pointer}
#farkle-root .fk-x:hover{background:#e2e8f0}
#farkle-root .fk-cheat-btn{width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;color:#0f172a;cursor:pointer;transition:background .15s,border-color .15s}
#farkle-root .fk-cheat-btn:hover:not(:disabled){background:#eef2ff;border-color:#6366f1}
#farkle-root .fk-cheat-btn:disabled{opacity:.4;cursor:default}
@keyframes fkRoll{0%{transform:rotate(0) translateY(0)}25%{transform:rotate(-11deg) translateY(-7px)}50%{transform:rotate(8deg) translateY(-3px)}75%{transform:rotate(-5deg) translateY(-8px)}100%{transform:rotate(0) translateY(0)}}
@keyframes fkNope{0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)}60%{transform:translateX(6px)}}
@media (max-width:560px){
  #farkle-root .fk-panel{padding:14px;gap:12px}
  #farkle-root .fk-die{width:46px;height:46px;border-radius:10px}
  #farkle-root .fk-dice{gap:8px;min-height:56px}
  #farkle-root .fk-seat-score{font-size:18px}
  #farkle-root .fk-pot b{font-size:16px}
  #farkle-root .fk-controls .fk-btn{flex:1;padding:0 10px}
}
</style>
<div class="game-app" id="farkle-root">
  <div class="game-intro">
    <div><h2>Farkle</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel fk-panel" data-board>
    <div class="fk-scoreboard">
      <div class="fk-seat" data-seat="0">
        <span class="fk-seat-top"><span data-name>Player 1</span><span class="fk-you" data-you hidden>You</span><span class="fk-lucky" data-lucky hidden>🍀</span></span>
        <b class="fk-seat-score"><span data-score>0</span> <small>/ ${fmt(TARGET)}</small></b>
        <i class="fk-bar"><i data-bar></i></i>
        <span class="fk-streak" data-streak></span>
      </div>
      <div class="fk-pot"><span>Turn pot</span><b data-pot>0</b><em data-left>6 dice</em></div>
      <div class="fk-seat" data-seat="1">
        <span class="fk-seat-top"><span data-name>Player 2</span><span class="fk-you" data-you hidden>You</span><span class="fk-lucky" data-lucky hidden>🍀</span></span>
        <b class="fk-seat-score"><span data-score>0</span> <small>/ ${fmt(TARGET)}</small></b>
        <i class="fk-bar"><i data-bar></i></i>
        <span class="fk-streak" data-streak></span>
      </div>
    </div>
    <div class="fk-dice" data-dice></div>
    <div class="fk-note" data-note></div>
    <div class="fk-controls" data-controls>
      <button class="fk-btn primary" type="button" data-act="roll" title="Space / Enter">Roll 6 dice</button>
      <button class="fk-btn" type="button" data-act="bank" title="B">Bank</button>
    </div>
    <div class="fk-result" data-result hidden>
      <b data-result-text></b>
      <span data-result-score></span>
      <button class="fk-btn primary" type="button" data-act="restart">Play again</button>
    </div>
    <div class="fk-cheats" data-cheats hidden>
      <div class="fk-cheat-card">
        <div class="fk-cheat-head"><b>Cheats</b><button class="fk-x" type="button" data-cheat-close aria-label="Close">×</button></div>
        <button class="fk-cheat-btn" type="button" data-cheat="turn500">+500 turn pot</button>
        <button class="fk-cheat-btn" type="button" data-cheat="score1000">+1,000 score</button>
        <button class="fk-cheat-btn" type="button" data-cheat="lucky">Lucky next roll (no farkle)</button>
        <button class="fk-cheat-btn" type="button" data-cheat="straight">Serve a straight (1–6)</button>
        <button class="fk-cheat-btn" type="button" data-cheat="win">Instant win</button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="restart" title="N">New game</button>
    <button class="game-action-button" type="button" data-cheat-open title="C">Cheats</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const statusEl = $("[data-status]");
    const diceBox = $("[data-dice]");
    const noteEl = $("[data-note]");
    const potEl = $("[data-pot]");
    const leftEl = $("[data-left]");
    const controlsEl = $("[data-controls]");
    const rollBtn = $('[data-act="roll"]');
    const bankBtn = $('[data-act="bank"]');
    const resultEl = $("[data-result]");
    const resultText = $("[data-result-text]");
    const resultScore = $("[data-result-score]");
    const cheatsEl = $("[data-cheats]");
    const seats = [0, 1].map((i) => {
        const el = root.querySelector('[data-seat="' + i + '"]');
        return {
            el,
            name: el.querySelector("[data-name]"),
            you: el.querySelector("[data-you]"),
            lucky: el.querySelector("[data-lucky]"),
            score: el.querySelector("[data-score]"),
            bar: el.querySelector("[data-bar]"),
            streak: el.querySelector("[data-streak]"),
        };
    });
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");

    /* ---------------- dice elements ---------------- */
    const dieEls = [];
    for (let i = 0; i < 6; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "fk-die ghost";
        b.dataset.die = String(i);
        b.setAttribute("aria-label", "Die " + (i + 1));
        b.innerHTML =
            '<svg viewBox="0 0 60 60" aria-hidden="true"><rect class="fk-die-bg" x="3" y="3" width="54" height="54" rx="12"></rect><g class="fk-pips"></g></svg>';
        diceBox.appendChild(b);
        dieEls.push(b);
    }
    function setFace(el, v) {
        el.querySelector(".fk-pips").innerHTML = (PIP[v] || [])
            .map((p) => '<circle class="fk-pip" cx="' + p[0] + '" cy="' + p[1] + '" r="5"></circle>')
            .join("");
    }
    function paintFaces() {
        const n = state ? state.dice.length : 0;
        for (let i = 0; i < 6; i++) setFace(dieEls[i], i < n ? state.dice[i] : 0);
    }

    /* ---------------- timers ---------------- */
    const timers = new Set();
    function later(fn, ms) {
        const t = setTimeout(() => {
            timers.delete(t);
            if (!destroyed) fn();
        }, ms);
        timers.add(t);
        return t;
    }
    function clearTimers() {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
    }
    let flowTimer = null;
    function clearFlow() {
        if (flowTimer) {
            clearTimeout(flowTimer);
            timers.delete(flowTimer);
            flowTimer = null;
        }
    }

    /* ---------------- roll animation (cosmetic, keyed by rollSeq) ---------------- */
    let seenRoll = -1, animTimer = null, animInterval = null;
    function stopAnim() {
        if (animInterval) { clearInterval(animInterval); animInterval = null; }
        if (animTimer) { clearTimeout(animTimer); timers.delete(animTimer); animTimer = null; }
        dieEls.forEach((el) => el.classList.remove("rolling"));
    }
    function syncDice() {
        const n = state ? state.dice.length : 0;
        if (!state || n === 0) {
            seenRoll = state ? state.rollSeq : -1;
            stopAnim();
            paintFaces();
            return;
        }
        if (state.rollSeq !== seenRoll) {
            seenRoll = state.rollSeq;
            stopAnim();
            const els = dieEls.slice(0, n);
            els.forEach((el) => el.classList.add("rolling"));
            animInterval = setInterval(() => {
                els.forEach((el) => setFace(el, 1 + ((Math.random() * 6) | 0)));
            }, 85);
            animTimer = later(() => { stopAnim(); paintFaces(); }, 460);
        } else {
            paintFaces();
        }
    }

    /* ---------------- state ---------------- */
    function freshState(hostSeat) {
        return {
            phase: "roll",              // roll | select | farkle | banked | over
            turn: Math.random() < 0.5 ? 0 : 1, // random first player
            totals: [0, 0],
            turnPts: 0,
            dice: [],
            sel: [],
            rollSeq: 0,
            streak: [0, 0],             // consecutive farkles per seat
            lucky: [false, false],      // cheat: next roll cannot farkle
            targetBy: null,             // seat that reached TARGET -> final round
            winner: null,
            hostSeat,                   // random seat mapping in multiplayer
            note: "",
        };
    }
    const selPts = () => (state ? selectionScore(state.dice, state.sel) : 0);
    let botKeptFor = -1;

    /* ---------------- authoritative game logic ---------------- */
    function doRoll(seat, n, hot) {
        let d;
        if (state.lucky[seat]) {
            d = luckyRoll(n);
            state.lucky[seat] = false;
        } else {
            d = rollDice(n);
        }
        state.dice = d;
        state.sel = [];
        state.rollSeq += 1;
        if (hasAnyScore(d)) {
            state.phase = "select";
            state.note = hot ? "Hot dice! All six roll again." : seatName(seat) + ": select scoring dice.";
        } else {
            const lost = state.turnPts;
            state.turnPts = 0;
            state.streak[seat] += 1;
            let extra = "";
            if (state.streak[seat] >= FARKLE_LIMIT) {
                state.totals[seat] -= FARKLE_PENALTY;
                state.streak[seat] = 0;
                extra = " Three farkles in a row: -" + fmt(FARKLE_PENALTY) + ".";
            }
            state.phase = "farkle";
            state.note = seatName(seat) + " FARKLED - lost " + fmt(lost) + "." + extra;
        }
        publish();
    }

    function finish(winner) {
        if (winner === null || winner === undefined) {
            winner = state.totals[0] === state.totals[1] ? -1
                : state.totals[0] > state.totals[1] ? 0 : 1;
        }
        state.winner = winner;
        state.phase = "over";
        state.sel = [];
        state.note = winner === -1 ? "Draw!" : seatName(winner) + " wins!";
    }

    function endTurn() {
        if (destroyed || !state || state.phase === "over") return;
        /* the final turn (opponent of the target-reacher) just ended */
        if (state.targetBy !== null && state.turn !== state.targetBy) {
            finish(null);
            publish();
            return;
        }
        state.turn = 1 - state.turn;
        state.turnPts = 0;
        state.dice = [];
        state.sel = [];
        state.phase = "roll";
        botKeptFor = -1;
        state.note = state.targetBy !== null
            ? "Final turn: " + seatName(state.turn) + " must beat " + fmt(state.totals[state.targetBy]) + "."
            : seatName(state.turn) + " to roll.";
        publish();
    }

    function newGame() {
        stopAnim();
        seenRoll = -1;
        botKeptFor = -1;
        /* random seat mapping for multiplayer, random first turn everywhere */
        state = freshState(online ? (Math.random() < 0.5 ? 0 : 1) : 0);
        state.note = seatName(state.turn) + (seatName(state.turn) === "You" ? " roll" : " rolls") + " first.";
        publish();
    }

    function applyAction(action, seat) {
        if (destroyed || !state || !action) return;
        const t = action.type;
        if (t === "restart") { newGame(); return; }
        if (state.phase === "over") return;

        if (t === "toggle") {
            if (seat !== state.turn || state.phase !== "select") return;
            const i = action.index | 0;
            if (i < 0 || i >= state.dice.length) return;
            const at = state.sel.indexOf(i);
            if (at >= 0) {
                state.sel.splice(at, 1);
            } else {
                const trial = state.sel.concat(i);
                if (selectionScore(state.dice, trial) <= 0) return;
                state.sel = trial;
            }
            publish();
            return;
        }

        if (t === "roll") {
            if (seat !== state.turn) return;
            if (state.phase === "roll") { doRoll(seat, 6, false); return; }
            if (state.phase === "select") {
                if (!state.sel.length) return;
                const pts = selectionScore(state.dice, state.sel);
                if (pts <= 0) return;
                state.turnPts += pts;
                const rem = state.dice.filter((v, i) => state.sel.indexOf(i) < 0).length;
                doRoll(seat, rem || 6, rem === 0);
            }
            return;
        }

        if (t === "bank") {
            if (seat !== state.turn || state.phase !== "select" || !state.sel.length) return;
            const pts = selectionScore(state.dice, state.sel);
            if (pts <= 0) return;
            const banked = state.turnPts + pts;
            state.totals[seat] += banked;
            state.turnPts = 0;
            state.sel = [];
            state.streak[seat] = 0;
            if (state.targetBy === null && state.totals[seat] >= TARGET) state.targetBy = seat;
            state.phase = "banked";
            state.note = seatName(seat) + " banked " + fmt(banked) + ".";
            publish();
            return;
        }

        if (t === "cheat") {
            const k = action.kind;
            const myTurn = seat === state.turn;
            const usable = state.phase === "roll" || state.phase === "select";
            if (k === "turn500" && myTurn && usable) {
                state.turnPts += 500;
                state.note = seatName(seat) + ": +500 turn pot.";
            } else if (k === "score1000") {
                state.totals[seat] += 1000;
                state.note = seatName(seat) + ": +1,000 score.";
            } else if (k === "lucky") {
                state.lucky[seat] = true;
                state.note = seatName(seat) + " armed lucky dice.";
            } else if (k === "straight" && myTurn && usable) {
                state.dice = [1, 2, 3, 4, 5, 6];
                state.sel = [];
                state.rollSeq += 1;
                state.phase = "select";
                state.note = seatName(seat) + " served a straight.";
            } else if (k === "win") {
                state.totals[seat] = Math.max(TARGET, state.totals[1 - seat] + 1);
                finish(seat);
            } else {
                return;
            }
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

    /* ---------------- host-side flow (transitions + bot) ---------------- */
    function botKeep() {
        if (!state || state.turn !== 1 || state.phase !== "select") return;
        const keep = aiKeepDice(state.dice);
        const pts = selectionScore(state.dice, keep);
        state.sel = keep;
        botKeptFor = state.rollSeq;
        state.note = "Rival keeps " + keep.length + " dice (+" + fmt(pts) + ").";
        publish();
    }
    function botMove() {
        if (!state || state.turn !== 1 || state.phase !== "select") return;
        applyAction({ type: botPlan(state) }, 1);
    }
    function scheduleFlow() {
        clearFlow();
        if (destroyed || !state || state.phase === "over") return;
        if (online && !room.isHost) return;
        if (state.phase === "farkle") { flowTimer = later(endTurn, 1400); return; }
        if (state.phase === "banked") { flowTimer = later(endTurn, 1000); return; }
        if (!online && state.turn === 1) {
            if (state.phase === "roll") flowTimer = later(() => applyAction({ type: "roll" }, 1), 800);
            else if (state.phase === "select") {
                flowTimer = botKeptFor !== state.rollSeq ? later(botKeep, 850) : later(botMove, 700);
            }
        }
    }

    function publish() {
        render();
        if (online) {
            if (room.isHost) room.publishState(state).catch(console.warn);
        }
        scheduleFlow();
    }

    /* ---------------- render ---------------- */
    let cheatOpen = false;
    function toggleCheat(force) {
        cheatOpen = force === undefined ? !cheatOpen : Boolean(force);
        if (cheatOpen) show(cheatsEl); else hide(cheatsEl);
    }

    function render() {
        const me = mySeat();
        const over = Boolean(state && state.phase === "over");
        const myTurn = Boolean(state && !over && state.turn === me);
        const phase = state ? state.phase : "";

        /* status */
        if (!state) statusEl.textContent = "Waiting for host…";
        else if (over) statusEl.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win!" : seatName(state.winner) + " wins";
        else statusEl.textContent = myTurn ? "Your turn" : seatName(state.turn) + "'s turn";

        /* scoreboard */
        for (let i = 0; i < 2; i++) {
            const s = seats[i];
            const total = state ? state.totals[i] : 0;
            s.name.textContent = NAMES[i];
            s.you.hidden = !(online && i === me);
            s.you.title = playerName;
            s.lucky.hidden = !(state && state.lucky[i]);
            s.score.textContent = fmt(total);
            s.bar.style.width = Math.max(0, Math.min(100, (total / TARGET) * 100)) + "%";
            s.streak.textContent = state && state.streak[i] > 0 ? "Farkle ×" + state.streak[i] : "";
            s.el.classList.toggle("active", Boolean(state && !over && state.turn === i));
        }

        /* pot + dice left */
        potEl.textContent = fmt(state ? state.turnPts + selPts() : 0);
        leftEl.textContent = (state && state.dice.length ? state.dice.length : 6) + " dice";
        noteEl.textContent = state ? state.note : "";

        /* dice layout */
        const n = state ? state.dice.length : 0;
        for (let i = 0; i < 6; i++) {
            const el = dieEls[i];
            const ghost = n === 0;
            el.classList.toggle("off", !ghost && i >= n);
            el.classList.toggle("ghost", ghost);
            el.classList.toggle("sel", Boolean(state && phase === "select" && state.sel.indexOf(i) >= 0));
            el.classList.toggle("dead", phase === "farkle");
            el.classList.toggle("spent", phase === "banked");
            el.classList.toggle("locked", !(myTurn && phase === "select") || ghost);
        }
        syncDice();

        /* actions */
        controlsEl.hidden = over;
        if (!state || !myTurn) {
            rollBtn.disabled = true;
            bankBtn.disabled = true;
        } else if (phase === "roll") {
            rollBtn.disabled = false;
            bankBtn.disabled = true;
        } else if (phase === "select") {
            rollBtn.disabled = state.sel.length === 0;
            bankBtn.disabled = state.sel.length === 0;
        } else {
            rollBtn.disabled = true;
            bankBtn.disabled = true;
        }
        if (state && phase === "select") {
            const rem = state.dice.length - state.sel.length;
            rollBtn.textContent = rem === 0 ? "Hot dice · Roll 6" : "Roll " + rem + (rem === 1 ? " die" : " dice");
            bankBtn.textContent = "Bank " + fmt(state.turnPts + selPts());
        } else {
            rollBtn.textContent = "Roll 6 dice";
            bankBtn.textContent = "Bank";
        }

        /* result */
        if (over) {
            show(resultEl);
            resultEl.className = "fk-result " + (state.winner === -1 ? "draw" : state.winner === me ? "win" : "lose");
            resultText.textContent = state.winner === -1 ? "Draw!" : state.winner === me ? "You win!" : seatName(state.winner) + " wins!";
            resultScore.textContent = NAMES[0] + " " + fmt(state.totals[0]) + " — " + NAMES[1] + " " + fmt(state.totals[1]);
        } else {
            hide(resultEl);
        }

        /* cheat availability */
        const usable = Boolean(state && !over && myTurn && (phase === "roll" || phase === "select"));
        const alive = Boolean(state && !over);
        root.querySelector('[data-cheat="turn500"]').disabled = !usable;
        root.querySelector('[data-cheat="straight"]').disabled = !usable;
        root.querySelector('[data-cheat="score1000"]').disabled = !alive;
        root.querySelector('[data-cheat="lucky"]').disabled = !alive;
        root.querySelector('[data-cheat="win"]').disabled = !alive;
    }

    /* ---------------- input (mouse / touch / keyboard) ---------------- */
    function flashNope(el) {
        el.classList.remove("nope");
        void el.offsetWidth;
        el.classList.add("nope");
        later(() => el.classList.remove("nope"), 380);
    }
    function toggleDie(i) {
        if (!state || state.phase !== "select" || state.turn !== mySeat()) return;
        if (i < 0 || i >= state.dice.length) return;
        if (state.sel.indexOf(i) >= 0) { submitAction({ type: "toggle", index: i }); return; }
        const trial = state.sel.concat(i);
        if (selectionScore(state.dice, trial) <= 0) { flashNope(dieEls[i]); return; }
        submitAction({ type: "toggle", index: i });
    }
    function tryRoll() {
        if (!state || state.turn !== mySeat()) return;
        if (state.phase === "roll" || (state.phase === "select" && state.sel.length))
            submitAction({ type: "roll" });
    }
    function tryBank() {
        if (!state || state.turn !== mySeat() || state.phase !== "select" || !state.sel.length) return;
        submitAction({ type: "bank" });
    }

    function handleClick(event) {
        if (cheatOpen && event.target === cheatsEl) { toggleCheat(false); return; }
        const b = event.target.closest("button");
        if (!b || !root.contains(b)) return;
        if (b.hasAttribute("data-exit")) { onExit(); return; }
        if (b.hasAttribute("data-cheat-open")) { toggleCheat(); return; }
        if (b.hasAttribute("data-cheat-close")) { toggleCheat(false); return; }
        if (b.dataset.cheat) { submitAction({ type: "cheat", kind: b.dataset.cheat }); return; }
        if (b.dataset.act === "roll") { tryRoll(); return; }
        if (b.dataset.act === "bank") { tryBank(); return; }
        if (b.dataset.act === "restart") { toggleCheat(false); submitAction({ type: "restart" }); return; }
        if (b.dataset.die !== undefined) toggleDie(+b.dataset.die);
    }

    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.code === "Escape") { toggleCheat(false); return; }
        if (e.code === "KeyC") { toggleCheat(); return; }
        if (cheatOpen) return;
        if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); tryRoll(); }
        else if (e.code === "KeyB") tryBank();
        else if (e.code === "KeyN") { toggleCheat(false); submitAction({ type: "restart" }); }
        else if (/^Digit[1-6]$/.test(e.code)) toggleDie(+e.code.slice(5) - 1);
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    /* ---------------- mode wiring ---------------- */
    const unsubs = [];
    const keepUnsub = (u) => { if (typeof u === "function") unsubs.push(u); };

    if (online) {
        keepUnsub(room.onRoom((nextRoom) => {
            if (destroyed) return;
            roomData = nextRoom;
            render();
        }));
        if (room.isHost) {
            newGame(); // host writes canonical state
            keepUnsub(room.onAction((action) => {
                if (!destroyed && state) applyAction(action, 1 - state.hostSeat);
            }));
        } else {
            keepUnsub(room.onState((nextState) => {
                if (destroyed || !nextState) return;
                state = nextState;
                render();
            }));
            render();
        }
    } else {
        newGame(); // local AI mode, no room needed
    }

    return {
        destroy() {
            destroyed = true;
            stopAnim();
            clearTimers();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            unsubs.forEach((u) => { try { u(); } catch (_) { /* noop */ } });
        },
    };
}