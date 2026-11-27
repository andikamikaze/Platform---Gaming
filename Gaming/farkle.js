/* ==== GAME: farkle.js ==== */
/*
 * Farkle — push-your-luck dice duel (real Farkle rules).
 * Template: export META + mount(root, context).
 * Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

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

    /* UI overlay state: help outranks cheats, cheats outranks pause */
    let helpOpen = false;
    let cheatsOpen = false;
    let paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("farkleHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("farkleHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    /* ---------------- shell: single HUD + fill-height board ---------------- */
    root.innerHTML = `
<style>
#farkle-root [hidden]{display:none!important}
#farkle-root{--fk-surface:var(--color-surface);--fk-soft:var(--color-surface-muted);--fk-ink:var(--color-text);--fk-mut:var(--color-text-muted);--fk-line:var(--color-border);display:flex;flex-direction:column;gap:10px;width:100%;height:100%;min-height:0;user-select:none;-webkit-user-select:none;color:var(--fk-ink)}
#farkle-root .fk-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#farkle-root .fk-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--fk-line);border-radius:999px;background:var(--fk-surface);color:var(--fk-mut);white-space:nowrap}
#farkle-root .fk-chip b{color:var(--fk-ink);font-weight:700;font-variant-numeric:tabular-nums}
#farkle-root .fk-chip small{font-size:9px;opacity:.7}
#farkle-root .fk-chip.active{border-color:#6366f1;background:#eef2ff}
#farkle-root .fk-status{gap:7px}
#farkle-root .fk-status .game-status-dot{width:7px;height:7px;border-radius:50%;background:#059669;flex:none}
#farkle-root .fk-bar{display:block;width:40px;height:4px;border-radius:99px;background:var(--fk-line);overflow:hidden}
#farkle-root .fk-bar i{display:block;height:100%;width:0;background:#6366f1;border-radius:99px;transition:width .2s ease}
#farkle-root .fk-lucky{font-size:12px}
#farkle-root .fk-spacer{flex:1 1 auto}
#farkle-root .fk-btn{height:48px;padding:0 24px;border-radius:10px;border:1px solid var(--fk-line);background:var(--fk-surface);color:var(--fk-ink);font-size:14px;font-weight:700;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease;touch-action:manipulation}
#farkle-root .fk-btn:hover:not(:disabled){border-color:#6366f1;color:#4f46e5}
#farkle-root .fk-btn.primary{background:#4f46e5;border-color:#4f46e5;color:#fff}
#farkle-root .fk-btn.primary:hover:not(:disabled){background:#4338ca;color:#fff}
#farkle-root .fk-btn:disabled{opacity:.4;cursor:default}
#farkle-root .fk-hud .fk-btn{height:34px;min-height:34px;padding:0 10px;border-radius:8px;font-size:11px}
#farkle-root .fk-hud .fk-btn.on{border-color:#6366f1;color:#4f46e5}
#farkle-root .fk-icon-btn{display:inline-flex;align-items:center;gap:6px}
#farkle-root .fk-icon-btn svg{flex:none;display:block}
#farkle-root .fk-board{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:16px;border:1px solid var(--fk-line);border-radius:12px;background:var(--fk-surface);overflow:hidden;min-width:0}
#farkle-root .fk-dice{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:flex-end;min-height:66px;user-select:none;touch-action:manipulation;max-width:100%}
#farkle-root .fk-die{width:56px;height:56px;background:var(--fk-surface);border:2px solid var(--fk-line);border-radius:12px;padding:0;cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,opacity .2s ease}
#farkle-root .fk-die svg{display:block;width:100%;height:100%}
#farkle-root .fk-die-bg{fill:transparent}
#farkle-root .fk-pip{fill:var(--fk-ink)}
#farkle-root .fk-die.sel{transform:translateY(-6px);border-color:#6366f1;box-shadow:0 6px 12px rgba(79,70,229,.2)}
#farkle-root .fk-die.ghost{border-style:dashed;border-color:var(--fk-line);background:transparent;cursor:default}
#farkle-root .fk-die.off{display:none}
#farkle-root .fk-die.locked{cursor:default}
#farkle-root .fk-die.dead{opacity:.4;filter:grayscale(1)}
#farkle-root .fk-die.spent{opacity:.55}
#farkle-root .fk-die.rolling{animation:fkRoll .24s linear infinite}
#farkle-root .fk-die.nope{animation:fkNope .32s ease}
#farkle-root .fk-note{min-height:20px;font-size:13px;font-weight:600;color:var(--fk-mut);text-align:center;line-height:1.4}
#farkle-root .fk-controls{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;width:100%}
#farkle-root .fk-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.35);backdrop-filter:blur(2px)}
#farkle-root .fk-ovcard{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;overflow:hidden;padding:16px;background:var(--fk-surface);border:1px solid var(--fk-line);border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.18)}
#farkle-root .fk-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px}
#farkle-root .fk-head b{font-size:14px;font-weight:800;letter-spacing:.02em}
#farkle-root .fk-help,#farkle-root .fk-cheats,#farkle-root .fk-body{flex:1 1 auto;min-height:0;overflow:auto}
#farkle-root .fk-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;align-content:start}
#farkle-root .fk-help b{display:block;margin-bottom:6px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;color:var(--fk-mut);text-transform:uppercase}
#farkle-root .fk-help ul{margin:0 0 12px;padding-left:16px;font:600 11px/1.7 ui-monospace,monospace;color:var(--fk-mut)}
#farkle-root .fk-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--fk-line);border-bottom-width:2px;border-radius:5px;background:var(--fk-soft);color:var(--fk-ink);font:inherit}
#farkle-root .fk-cheats{display:flex;flex-direction:column;gap:8px}
#farkle-root .fk-cheat-btn{width:100%;min-height:44px;text-align:left;padding:10px 12px;border-radius:9px;border:1px solid var(--fk-line);background:var(--fk-surface);font-size:13px;font-weight:600;color:var(--fk-ink);cursor:pointer;transition:background .15s ease,border-color .15s ease}
#farkle-root .fk-cheat-btn:hover:not(:disabled){background:#eef2ff;border-color:#6366f1}
#farkle-root .fk-cheat-btn:disabled{opacity:.4;cursor:default}
#farkle-root .fk-x{width:44px;height:44px;border:1px solid var(--fk-line);border-radius:9px;background:var(--fk-soft);color:var(--fk-mut);font-size:16px;line-height:1;cursor:pointer}
#farkle-root .fk-x:hover{background:var(--fk-line)}
#farkle-root .fk-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid var(--fk-line)}
#farkle-root .fk-note-sm{font:600 10px/1.4 ui-monospace,monospace;color:var(--fk-mut)}
#farkle-root .fk-result{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:4px 0;text-align:center}
#farkle-root .fk-result b{font-size:20px;font-weight:800}
#farkle-root .fk-result.win b{color:#16a34a}
#farkle-root .fk-result.lose b{color:#dc2626}
#farkle-root .fk-result.draw b{color:var(--fk-mut)}
#farkle-root .fk-result span{font-size:12.5px;color:var(--fk-mut);font-variant-numeric:tabular-nums}
#farkle-root button:focus-visible{outline:2px solid #6366f1;outline-offset:2px}
@keyframes fkRoll{0%{transform:rotate(0) translateY(0)}25%{transform:rotate(-11deg) translateY(-7px)}50%{transform:rotate(8deg) translateY(-3px)}75%{transform:rotate(-5deg) translateY(-8px)}100%{transform:rotate(0) translateY(0)}}
@keyframes fkNope{0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)}60%{transform:translateX(6px)}}
@media (max-width:560px){
#farkle-root{gap:8px}
#farkle-root .fk-board{padding:12px;gap:12px}
#farkle-root .fk-die{width:48px;height:48px;border-radius:10px}
#farkle-root .fk-dice{gap:8px;min-height:56px}
#farkle-root .fk-controls{gap:8px}
#farkle-root .fk-controls .fk-btn{flex:1;padding:0 12px}
}
@media (pointer:coarse){#farkle-root .fk-btn{min-height:48px}#farkle-root .fk-cheat-btn{min-height:44px}}
@media (prefers-reduced-motion:reduce){#farkle-root .fk-die.rolling,#farkle-root .fk-die.nope{animation:none}#farkle-root .fk-bar i,#farkle-root .fk-btn,#farkle-root .fk-cheat-btn{transition:none}#farkle-root .fk-die.sel{transform:none}}
/* --- layout redesign overrides (keep last) --- */
#farkle-root.game-fill > .fk-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
#farkle-root.game-fill > .fk-board:not(:has(.fk-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
#farkle-root.game-fill > .fk-board:has(.fk-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
#farkle-root .fk-hud{gap:5px}
#farkle-root .fk-hud .fk-chip{padding:4px 6px;font-size:9px}
#farkle-root .fk-hud .fk-chip small,
#farkle-root .fk-hud .fk-chip .fk-bar,
#farkle-root .fk-hud .fk-chip[data-hud="streak0"],
#farkle-root .fk-hud .fk-chip[data-hud="streak1"],
#farkle-root .fk-hud .fk-chip[data-hud="lucky0"],
#farkle-root .fk-hud .fk-chip[data-hud="lucky1"]{display:none}
#farkle-root .fk-hud .fk-btn{min-height:32px;padding:5px 9px;font-size:9px}
#farkle-root .fk-hud .fk-btn-label,
#farkle-root .fk-spacer{display:none}
#farkle-root .fk-ov{padding:8px}
#farkle-root .fk-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#farkle-root .fk-help,#farkle-root .fk-cheats,#farkle-root .fk-body{scrollbar-width:none}
#farkle-root .fk-help::-webkit-scrollbar,
#farkle-root .fk-cheats::-webkit-scrollbar,
#farkle-root .fk-body::-webkit-scrollbar{display:none}
#farkle-root .fk-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--fk-line)}
#farkle-root .fk-note-sm{display:none}
}
</style>
<div class="game-app fk-game game-fill" id="farkle-root" data-fk>
  <div class="fk-hud">
    <span class="fk-chip fk-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
    <span class="fk-chip" data-seat-chip="0"><span data-hud-name="0">You</span> <b data-hud="score0">0</b> <small>/ ${fmt(TARGET)}</small> <span class="fk-bar"><i data-hud="bar0"></i></span></span>
    <span class="fk-chip" data-seat-chip="1"><span data-hud-name="1">Rival</span> <b data-hud="score1">0</b> <small>/ ${fmt(TARGET)}</small> <span class="fk-bar"><i data-hud="bar1"></i></span></span>
    <span class="fk-chip" data-hud="streak0" hidden>F×0</span>
    <span class="fk-chip" data-hud="streak1" hidden>F×0</span>
    <span class="fk-chip fk-lucky" data-hud="lucky0" hidden>🍀 You</span>
    <span class="fk-chip fk-lucky" data-hud="lucky1" hidden>🍀 Rival</span>
    <span class="fk-chip">POT <b data-hud="pot">0</b></span>
    <span class="fk-chip">DICE <b data-hud="left">6</b></span>
    <span class="fk-spacer"></span>
    <button class="fk-btn fk-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="fk-btn-label">Help</span></button>
    <button class="fk-btn fk-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="fk-btn-label">Cheats</span></button>
    <button class="fk-btn fk-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="fk-btn-label">Pause</span></button>
    <button class="fk-btn fk-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="fk-btn-label">Restart</span></button>
    <button class="fk-btn fk-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="fk-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel fk-board" data-board>
    <div class="fk-dice" data-dice></div>
    <div class="fk-note" data-note></div>
    <div class="fk-controls" data-controls>
      <button class="fk-btn primary" type="button" data-act="roll" title="Space / Enter">Roll 6 dice</button>
      <button class="fk-btn" type="button" data-act="bank" title="B">Bank</button>
    </div>
    <div class="fk-ov" data-ov="over" hidden>
      <div class="fk-ovcard">
        <div class="fk-head"><b>Game over</b></div>
        <div class="fk-body fk-result" data-result>
          <b data-result-text></b>
          <span data-result-score></span>
        </div>
        <div class="fk-foot"><span class="fk-note-sm">R to restart</span><button class="fk-btn primary" type="button" data-act="restart" data-restart>Play again</button></div>
      </div>
    </div>
    <div class="fk-ov" data-ov="pause" hidden>
      <div class="fk-ovcard">
        <div class="fk-head"><b>Paused</b></div>
        <div class="fk-body"><span class="fk-note-sm">Your turn, bot steps and dice timers are frozen.</span></div>
        <div class="fk-foot"><span class="fk-note-sm">Press P or Esc to resume</span><button class="fk-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="fk-ov" data-ov="cheats" hidden>
      <div class="fk-ovcard">
        <div class="fk-head"><b>Cheats</b><button class="fk-x" type="button" data-cheat-close aria-label="Close cheats">×</button></div>
        <div class="fk-cheats">
          <button class="fk-cheat-btn" type="button" data-cheat="turn500">+500 turn pot</button>
          <button class="fk-cheat-btn" type="button" data-cheat="score1000">+1,000 score</button>
          <button class="fk-cheat-btn" type="button" data-cheat="lucky">Lucky next roll (no farkle)</button>
          <button class="fk-cheat-btn" type="button" data-cheat="straight">Serve a straight (1–6)</button>
          <button class="fk-cheat-btn" type="button" data-cheat="win">Instant win</button>
        </div>
        <div class="fk-foot"><span class="fk-note-sm">Press C to toggle this panel</span><button class="fk-btn" type="button" data-cheat-close>Done</button></div>
      </div>
    </div>
    <div class="fk-ov" data-ov="help" hidden>
      <div class="fk-ovcard">
        <div class="fk-head"><b>How to play</b><button class="fk-x" type="button" data-help-close aria-label="Close help">×</button></div>
        <div class="fk-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Click scoring dice, then <span class="fk-kbd">Space</span> / <span class="fk-kbd">Enter</span> to roll again, or <span class="fk-kbd">B</span> to bank.</li>
              <li><span class="fk-kbd">1</span>–<span class="fk-kbd">6</span> select the matching die.</li>
              <li><span class="fk-kbd">H</span> help · <span class="fk-kbd">C</span> cheats · <span class="fk-kbd">P</span>/<span class="fk-kbd">Esc</span> pause · <span class="fk-kbd">R</span> restart.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap dice to select them, then tap Roll again or Bank.</li>
              <li>Use the HUD icons for help, cheats, pause, restart and exit.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Score with 1s (100), 5s (50), triples and above, straights (1,500) or three pairs (1,500).</li>
              <li>All six scoring dice roll again for free — hot dice.</li>
              <li>A farkle loses the turn pot; three in a row cost 1,000 points.</li>
              <li>First to 10,000 triggers one final turn for the opponent.</li>
            </ul>
          </div>
        </div>
        <div class="fk-foot"><span class="fk-note-sm">Press H to reopen this guide</span><button class="fk-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const statusEl = $("[data-status]");
    const diceBox = $("[data-dice]");
    const noteEl = $("[data-note]");
    const potEl = $("[data-hud='pot']");
    const leftEl = $("[data-hud='left']");
    const controlsEl = $("[data-controls]");
    const rollBtn = $('[data-act="roll"]');
    const bankBtn = $('[data-act="bank"]');
    const resultEl = $("[data-result]");
    const resultText = $("[data-result-text]");
    const resultScore = $("[data-result-score]");
    const ov = {
        over: $('[data-ov="over"]'),
        pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheats"]'),
        help: $('[data-ov="help"]'),
    };
    const hud = {
        name: [0, 1].map((i) => $('[data-hud-name="' + i + '"]')),
        score: [0, 1].map((i) => $('[data-hud="score' + i + '"]')),
        bar: [0, 1].map((i) => $('[data-hud="bar' + i + '"]')),
        seat: [0, 1].map((i) => $('[data-seat-chip="' + i + '"]')),
        streak: [0, 1].map((i) => $('[data-hud="streak' + i + '"]')),
        lucky: [0, 1].map((i) => $('[data-hud="lucky' + i + '"]')),
    };
    const pauseBtn = $("[data-pause]");
    const pauseIcon = $("[data-pause-icon]");
    const cheatsBtn = $("[data-cheats]");
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

    /* ---------------- pause-aware timers ---------------- */
    /* Wall-clock anchors shift on resume: flow, bot steps, FX and the dice
       roll animation never jump forward after help / cheats / pause. */
    const timers = new Set();
    let freezeAt = 0;
    function schedule(ms, fn) {
        const rec = { fn, due: (freezeAt || Date.now()) + ms, id: 0 };
        rec.arm = () => {
            if (rec.id) clearTimeout(rec.id);
            rec.id = setTimeout(() => {
                rec.id = 0;
                if (freezeAt) return;
                timers.delete(rec);
                if (!destroyed) fn();
            }, Math.max(0, rec.due - Date.now()));
        };
        timers.add(rec);
        if (!freezeAt) rec.arm();
        return rec;
    }
    function later(fn, ms) { return schedule(ms, fn); }
    function clearTimers() {
        timers.forEach((rec) => { if (rec.id) clearTimeout(rec.id); });
        timers.clear();
    }
    let flowTimer = null;
    function clearFlow() {
        if (flowTimer) {
            if (flowTimer.id) clearTimeout(flowTimer.id);
            timers.delete(flowTimer);
            flowTimer = null;
        }
    }

    /* ---------------- roll animation (cosmetic, keyed by rollSeq) ---------------- */
    let seenRoll = -1, animTimer = null, animInterval = null, animFrozen = false;
    function startRolling() {
        if (animInterval || !state || !state.dice.length) return;
        const els = dieEls.slice(0, state.dice.length);
        animInterval = setInterval(() => {
            els.forEach((el) => setFace(el, 1 + ((Math.random() * 6) | 0)));
        }, 85);
    }
    function stopAnim() {
        if (animInterval) { clearInterval(animInterval); animInterval = null; }
        if (animTimer) {
            if (animTimer.id) clearTimeout(animTimer.id);
            timers.delete(animTimer);
            animTimer = null;
        }
        animFrozen = false;
        dieEls.forEach((el) => el.classList.remove("rolling"));
    }
    function freezeTimers() {
        if (freezeAt) return;
        freezeAt = Date.now();
        timers.forEach((rec) => { if (rec.id) { clearTimeout(rec.id); rec.id = 0; } });
        if (animInterval) { clearInterval(animInterval); animInterval = null; animFrozen = true; }
    }
    function thawTimers() {
        if (!freezeAt) return;
        const shift = Date.now() - freezeAt;
        freezeAt = 0;
        timers.forEach((rec) => { rec.due += shift; rec.arm(); });
        if (animFrozen) { animFrozen = false; startRolling(); }
    }
    function syncFreeze() {
        if (paused || helpOpen || cheatsOpen) freezeTimers();
        else thawTimers();
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
            if (freezeAt) animFrozen = true;
            else startRolling();
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
    function render() {
        const me = mySeat();
        const over = Boolean(state && state.phase === "over");
        const myTurn = Boolean(state && !over && state.turn === me);
        const phase = state ? state.phase : "";

        /* status (in the HUD) */
        if (!state) statusEl.textContent = "Waiting for host…";
        else if (over) statusEl.textContent = state.winner === -1 ? "Draw" : state.winner === me ? "You win!" : seatName(state.winner) + " wins";
        else statusEl.textContent = myTurn ? "Your turn" : seatName(state.turn) + "'s turn";

        /* HUD scoreboard */
        for (let i = 0; i < 2; i++) {
            const total = state ? state.totals[i] : 0;
            hud.name[i].textContent = i === me ? "You" : seatName(i);
            hud.score[i].textContent = fmt(total);
            hud.bar[i].style.width = Math.max(0, Math.min(100, (total / TARGET) * 100)) + "%";
            hud.seat[i].classList.toggle("active", Boolean(state && !over && state.turn === i));
            const f = state && state.streak[i] > 0 ? "F×" + state.streak[i] : "";
            hud.streak[i].textContent = f;
            if (f) show(hud.streak[i]); else hide(hud.streak[i]);
            if (state && state.lucky[i]) show(hud.lucky[i]); else hide(hud.lucky[i]);
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

        /* result overlay */
        if (over) {
            show(resultEl);
            resultEl.className = "fk-body fk-result " + (state.winner === -1 ? "draw" : state.winner === me ? "win" : "lose");
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

        /* overlay priority: help > cheats > pause > result */
        ov.help.hidden = !helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || helpOpen || cheatsOpen;
        ov.over.hidden = !over || helpOpen || cheatsOpen || paused;

        const pLabel = pauseBtn.querySelector(".fk-btn-label");
        if (pLabel) pLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseIcon.innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
        cheatsBtn.classList.toggle("on", Boolean(state && (state.lucky[0] || state.lucky[1])));
    }

    /* ---------------- overlay controls ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncFreeze();
        render();
    }
    function toggleCheats(on) {
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        syncFreeze();
        render();
    }
    function togglePause(on) {
        paused = typeof on === "boolean" ? on : !paused;
        syncFreeze();
        render();
    }
    function restartGame() {
        paused = false; helpOpen = false; cheatsOpen = false;
        syncFreeze();
        submitAction({ type: "restart" });
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
        if (destroyed) return;
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        const b = t.closest("button");
        if (!b || !root.contains(b) || b.disabled) return;
        if (b.dataset.cheat) {
            if (cheatsOpen && !helpOpen && !paused) submitAction({ type: "cheat", kind: b.dataset.cheat });
            return;
        }
        if (paused || helpOpen || cheatsOpen) return;
        if (b.dataset.act === "roll") { tryRoll(); return; }
        if (b.dataset.act === "bank") { tryBank(); return; }
        if (b.dataset.die !== undefined) toggleDie(+b.dataset.die);
    }

    function onKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
        const code = e.code;

        /* UI priority: help → cheats → pause/Escape → restart → game actions */
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (code === "KeyP" || code === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (helpOpen || cheatsOpen) return;
        if (paused) {
            if (code === "Space" || code === "Enter") { togglePause(false); e.preventDefault(); }
            return;
        }
        if (code === "Space" || code === "Enter") { e.preventDefault(); tryRoll(); }
        else if (code === "KeyB") tryBank();
        else if (code === "KeyN") restartGame();
        else if (/^Digit[1-6]$/.test(code)) toggleDie(+code.slice(5) - 1);
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    /* ---------------- mode wiring ---------------- */
    const unsubs = [];
    const keepUnsub = (u) => { if (typeof u === "function") unsubs.push(u); };

    syncFreeze(); // first-run help must freeze the flow before any timer is armed
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
