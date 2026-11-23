/* ==== GAME: blackjack.js ==== */
/* Blackjack — 4-deck shoe, dealer stands on all 17s, blackjack pays 3:2.
   Solo vs bot dealer, or 2-seat online room (host-authoritative).
   Each hand a coin flip decides whether dealer or players act first.
   In rooms, seats are assigned randomly at session start.
   Cheats are offline-only. No splits / insurance; 3:2 rounds down.
   Endless session: no levels / win target — play until out of chips. */

export const META = {
    id: "blackjack",
    name: "Blackjack",
    category: "casino",
    catLabel: "Casino",
    desc: "Hit, stand or double against the dealer. Blackjack pays 3:2.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="17" y="5" width="22" height="31" rx="4"/><text x="28" y="25" text-anchor="middle" font-family="inherit" font-size="13" font-weight="800" fill="currentColor" stroke="none">21</text><circle cx="14" cy="37" r="8" stroke-dasharray="4 3"/></svg>',
    bg: ["#fecaca", "#f87171"],
};

/* ---------- pure rules ---------- */
const START_BANK = 200;
const MIN_BET = 10;
const SHOE_DECKS = 4;
const RESHUFFLE_AT = 60;
const CHIPS = [10, 25, 50, 100];
const RTXT = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const rankTxt = (r) => RTXT[r] || String(r);

function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    return d;
}
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}
function newShoe() {
    const s = [];
    for (let i = 0; i < SHOE_DECKS; i++) makeDeck().forEach((c) => s.push(c));
    return shuffle(s);
}
function handValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
        if (c.r === 14) { total += 1; aces++; }
        else if (c.r >= 11) total += 10;
        else total += c.r;
    }
    if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
    return { total, soft: false };
}
function isBlackjack(cards) {
    return cards.length === 2 && handValue(cards).total === 21;
}

/* ---------- inline SVG art (no external images → no broken card assets) ---------- */
const SUIT_D = [
    "M12 2C8 7.5 4 10 4 13.7c0 2.5 2 4.3 4.3 4.3 1.2 0 2.3-.5 3-1.3-.2 1.9-1 3.3-2.3 4.3h6c-1.3-1-2.1-2.4-2.3-4.3.7.8 1.8 1.3 3 1.3 2.3 0 4.3-1.8 4.3-4.3C20 10 16 7.5 12 2z",
    "M12 21C5.5 15.5 2 11.6 2 7.8 2 4.9 4.2 3 6.8 3c1.9 0 3.7 1 5.2 3C13.5 4 15.3 3 17.2 3 19.8 3 22 4.9 22 7.8c0 3.8-3.5 7.7-10 13.2z",
    "M12 2l7.5 10L12 22 4.5 12z",
];
function suitMarkup(s, fill) {
    if (s === 3)
        return '<g fill="' + fill + '"><circle cx="12" cy="6.8" r="4.3"/><circle cx="7" cy="13.5" r="4.3"/><circle cx="17" cy="13.5" r="4.3"/><path d="M10.8 12h2.4c.2 4 .9 6.9 2.6 9H8.2c1.7-2.1 2.4-5 2.6-9z"/></g>';
    return '<path fill="' + fill + '" d="' + SUIT_D[s] + '"/>';
}
function cardSVG(card, faceUp, cls, delay) {
    const klass = "bj-card" + (cls ? " " + cls : "");
    const st = delay ? ' style="animation-delay:' + delay + 'ms"' : "";
    if (!faceUp) {
        return '<svg class="' + klass + '"' + st + ' viewBox="0 0 64 90" aria-hidden="true">' +
            '<rect x="1" y="1" width="62" height="88" rx="8" fill="#312e81" stroke="#1e1b4b" stroke-width="1.5"/>' +
            '<rect x="7" y="7" width="50" height="76" rx="5" fill="none" stroke="#818cf8" stroke-width="1.5" opacity=".65"/>' +
            '<path d="M32 36l9 9-9 9-9-9z" fill="#4f46e5"/></svg>';
    }
    const col = card.s === 1 || card.s === 2 ? "#dc2626" : "#1c1917";
    return '<svg class="' + klass + '"' + st + ' viewBox="0 0 64 90" aria-hidden="true">' +
        '<rect x="1" y="1" width="62" height="88" rx="8" fill="#ffffff" stroke="#d6d3d1" stroke-width="1.5"/>' +
        '<text x="12" y="21" text-anchor="middle" font-size="15" font-weight="700" fill="' + col + '">' + rankTxt(card.r) + '</text>' +
        '<g transform="translate(6 25) scale(0.5)">' + suitMarkup(card.s, col) + '</g>' +
        '<g transform="translate(20 40)">' + suitMarkup(card.s, col) + '</g></svg>';
}
function chipSVG(v) {
    const col = v >= 100 ? "#8b5cf6" : v >= 50 ? "#ef4444" : v >= 25 ? "#10b981" : "#3b82f6";
    return '<svg viewBox="0 0 44 44" aria-hidden="true">' +
        '<circle cx="22" cy="22" r="20" fill="' + col + '"/>' +
        '<circle cx="22" cy="22" r="14.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-dasharray="4.5 3.5" opacity=".85"/>' +
        '<text x="22" y="26.5" text-anchor="middle" font-size="12.5" font-weight="700" fill="#ffffff">' + v + '</text></svg>';
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* =============================================================== */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* local-only UI / cheat flags (never serialized, offline only) */
    let cheatsOpen = false;
    let xray = false;
    let peekNext = false;
    let rigPending = false;

    /* timers */
    const timers = new Set();
    function schedule(ms, fn) {
        const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
        timers.add(id);
    }
    function clearTimers() { for (const id of timers) clearTimeout(id); timers.clear(); }

    /* animation bookkeeping */
    let prevCounts = { d: 0, p: [0, 0] };
    let prevRevealed = false;

    /* ---------- shell (minimalist, no tutorial text) ---------- */
    root.innerHTML = `
<style>
.bj-game{display:flex;flex-direction:column;gap:10px;user-select:none;-webkit-user-select:none}
.bj-game [hidden]{display:none!important}
.bj-toolbar{display:flex;align-items:center;gap:8px}
.bj-round{font-size:12px;opacity:.65;letter-spacing:.4px}
.bj-flexsp{flex:1}
.bj-btn{appearance:none;border:1px solid transparent;background:#059669;color:#fff;border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;transition:transform .12s,opacity .12s}
.bj-btn.ghost{background:transparent;color:inherit;border-color:currentColor;opacity:.85}
.bj-btn:hover:not(:disabled){transform:translateY(-1px)}
.bj-btn:disabled{opacity:.35;cursor:default;transform:none}
.bj-btn.sm{padding:6px 11px;font-size:12px}
.bj-btn:focus-visible,.bj-chipbtn:focus-visible{outline:2px solid #059669;outline-offset:2px}
.bj-stage{position:relative}
.bj-felt{background:#0f3d2e;border:1px solid #ffffff14;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:300px;color:#e7f2ec}
.bj-dealer{display:flex;flex-direction:column;align-items:center;gap:6px}
.bj-label{font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#9fc7b6;display:flex;gap:8px;align-items:center;min-height:17px}
.bj-total{background:#ffffff14;border-radius:999px;padding:2px 8px;font-size:11px;letter-spacing:.3px;color:#e7f2ec}
.bj-cards{display:flex;gap:6px;justify-content:center;align-items:center;min-height:86px;flex-wrap:wrap}
.bj-slot{display:inline-flex}
.bj-card{width:60px;height:84px;display:block;filter:drop-shadow(0 1px 2px #0006)}
.bj-card text,.bj-chipbtn svg text{font-family:ui-sans-serif,system-ui,sans-serif}
.bj-empty{width:60px;height:84px;border:1.5px dashed #ffffff26;border-radius:8px}
.bj-xray{opacity:.8}
.bj-mid{display:flex;align-items:center;justify-content:center;gap:10px;min-height:26px;flex-wrap:wrap}
.bj-shoe{font-size:10.5px;letter-spacing:1.2px;color:#9fc7b699;text-transform:uppercase}
.bj-msg{font-size:12.5px;color:#cfe8dd}
.bj-peek{display:inline-flex;align-items:center;gap:4px}
.bj-peek .bj-card{width:28px;height:39px}
.bj-peek i{font-style:normal;font-size:9px;letter-spacing:1px;color:#9fc7b6;text-transform:uppercase}
.bj-players{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.bj-seat{flex:1;min-width:220px;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px;border-radius:12px;border:1px solid transparent}
.bj-seat.is-active{border-color:#34d39966;background:#ffffff08}
.bj-seatmeta{display:flex;gap:8px;align-items:center;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#9fc7b6;flex-wrap:wrap;justify-content:center}
.bj-seat.is-you .bj-seatname{color:#a7f3d0}
.bj-tag{font-size:9.5px;border:1px solid #ffffff2e;border-radius:999px;padding:1px 6px;letter-spacing:.6px}
.bj-tag.ok{color:#6ee7b7;border-color:#6ee7b766}
.bj-tag.bad{color:#fca5a5;border-color:#fca5a566}
.bj-stats{font-size:11.5px;color:#9fc7b6}
.bj-stats b{color:#e7f2ec;font-weight:700}
.bj-res{font-size:13px;font-weight:700;min-height:17px}
.bj-res.win{color:#34d399}.bj-res.lose{color:#f87171}.bj-res.push{color:#fcd34d}
.bj-controls{display:flex;flex-direction:column;gap:8px;align-items:center;padding:10px 0 2px}
.bj-betbar{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap}
.bj-chipbtn{background:none;border:none;padding:0;cursor:pointer;transition:transform .12s;touch-action:manipulation}
.bj-chipbtn:hover:not(:disabled){transform:translateY(-2px)}
.bj-chipbtn:disabled{opacity:.35;cursor:default}
.bj-chipbtn svg{width:46px;height:46px;display:block}
.bj-betrow{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}
.bj-betlabel{font-size:13px;font-weight:600}
.bj-playbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;width:100%}
.bj-big{min-height:48px;min-width:104px;font-size:14px;border-radius:12px}
.bj-key{font:inherit;font-size:10px;opacity:.6;border:1px solid currentColor;border-radius:4px;padding:0 4px;margin-left:6px}
.bj-waitline{font-size:13px;opacity:.7;min-height:24px;display:flex;align-items:center;justify-content:center}
.bj-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:#0b0f0dcc;border-radius:16px;padding:16px}
.bj-ovcard{background:#fafafa;color:#18181b;border-radius:14px;padding:18px;width:min(320px,100%);display:flex;flex-direction:column;gap:8px;box-shadow:0 12px 40px #0008}
.bj-ovhead{display:flex;align-items:center;justify-content:space-between;font-size:15px}
.bj-x{background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:inherit;padding:2px 6px}
.bj-note{font-size:11.5px;opacity:.6}
.bj-ovcard .bj-btn.ghost{border-color:#d4d4d8;color:#18181b;opacity:1}
.bj-ovcard .bj-btn.ghost:disabled{opacity:.4}
.bj-ovcard .bj-btn.ghost[data-on="1"]{border-color:#059669;color:#059669}
@keyframes bjIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
@keyframes bjFlip{from{opacity:.2;transform:rotateY(85deg)}to{opacity:1;transform:none}}
.bj-in{animation:bjIn .32s both}
.bj-flip{animation:bjFlip .45s both}
@media (hover:none){.bj-key{display:none}}
@media (max-width:560px){
.bj-card,.bj-empty{width:46px;height:65px}
.bj-cards{min-height:67px;gap:4px}
.bj-felt{padding:10px;min-height:250px}
.bj-seat{min-width:150px}
.bj-big{flex:1;min-width:0}
.bj-chipbtn svg{width:50px;height:50px}
.bj-betrow .bj-btn{flex:1}
.bj-betlabel{width:100%;text-align:center}
}
</style>
<div class="game-app bj-game">
  <div class="game-intro">
    <div><h2>Blackjack</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="bj-toolbar">
    <span class="bj-round" data-round></span>
    <span class="bj-flexsp"></span>
    <button type="button" class="bj-btn ghost sm" data-act="cheats" data-cheatsbtn hidden>Cheats</button>
    <button type="button" class="bj-btn ghost sm" data-act="restart">Restart</button>
  </div>
  <section class="game-panel bj-stage">
    <div data-board></div>
    <div class="bj-ov" data-ov="cheats" hidden>
      <div class="bj-ovcard">
        <div class="bj-ovhead"><b>Cheats</b><button type="button" class="bj-x" data-act="cheats-close" aria-label="Close">&times;</button></div>
        <button type="button" class="bj-btn ghost" data-act="cheat-money">+$500 bankroll</button>
        <button type="button" class="bj-btn ghost" data-act="cheat-xray" data-xraybtn>X-ray hole card: off</button>
        <button type="button" class="bj-btn ghost" data-act="cheat-peek" data-peekbtn>Peek next card: off</button>
        <button type="button" class="bj-btn ghost" data-act="cheat-rig" data-rigbtn>Next deal: Blackjack</button>
        <span class="bj-note">Offline mode only · key X toggles this panel</span>
      </div>
    </div>
    <div class="bj-ov" data-ov="over" hidden>
      <div class="bj-ovcard">
        <b>Out of chips</b>
        <span class="bj-note" data-overstats></span>
        <button type="button" class="bj-btn" data-act="restart">Play again</button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const boardEl = $("[data-board]");
    const statusEl = $("[data-status]");
    const roundEl = $("[data-round]");
    const cheatsBtn = $("[data-cheatsbtn]");
    const ovCheats = $('[data-ov="cheats"]');
    const ovOver = $('[data-ov="over"]');
    const overStats = $("[data-overstats]");
    const xrayBtn = $("[data-xraybtn]");
    const peekBtn = $("[data-peekbtn]");
    const rigBtn = $("[data-rigbtn]");

    const mySeat = () => (online ? state.seatOf[playerIndex] : 0);

    /* ---------- engine (host / offline only) ---------- */
    function freshPlayer(name) {
        return { name, bank: START_BANK, bet: 0, stake: 0, lastBet: 0, cards: [], done: false, doubled: false, ready: false, out: false, result: null, wins: 0, losses: 0 };
    }
    function newSession() {
        clearTimers();
        rigPending = false;
        const n = online ? 2 : 1;
        state = {
            phase: "bet", round: 0, order: "player", msg: "",
            shoe: newShoe(),
            dealer: { cards: [], revealed: false },
            seatOf: online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0],
            turn: -1,
            players: Array.from({ length: n }, (_, i) => freshPlayer("Player " + (i + 1))),
        };
        prevCounts = { d: 0, p: [0, 0] };
        prevRevealed = false;
        publish();
    }
    function draw() {
        if (state.shoe.length === 0) state.shoe = newShoe();
        return state.shoe.pop();
    }
    function rigBlackjack() {
        let s = state.shoe;
        let ia = s.findIndex((c) => c.r === 14);
        let it = s.findIndex((c) => c.r >= 10 && c.r <= 13);
        if (ia < 0 || it < 0) { s = state.shoe = newShoe(); ia = s.findIndex((c) => c.r === 14); it = s.findIndex((c) => c.r >= 10 && c.r <= 13); }
        if (ia < 0 || it < 0 || s.length < 6) return;
        const a = s[ia], t = s[it];
        const hi = Math.max(ia, it), lo = Math.min(ia, it);
        s.splice(hi, 1); s.splice(lo, 1);
        const f1 = s.pop(), f2 = s.pop();
        s.push(f2, t, f1, a); /* pop order: A → player, filler → dealer, 10 → player */
    }

    function startDeal() {
        if (state.shoe.length < RESHUFFLE_AT) state.shoe = newShoe();
        if (rigPending) { rigBlackjack(); rigPending = false; }
        state.round += 1;
        state.order = Math.random() < 0.5 ? "player" : "dealer";
        state.msg = state.order === "dealer" ? "Coin flip — dealer acts first." : (online ? "Coin flip — players act first." : "Coin flip — you act first.");
        state.dealer = { cards: [], revealed: false };
        const live = state.players.filter((q) => !q.out);
        for (const q of live) {
            q.stake = q.bet; q.lastBet = q.bet; q.bank -= q.stake;
            q.cards = []; q.done = false; q.doubled = false; q.result = null;
        }
        for (let i = 0; i < 2; i++) {
            for (const q of live) q.cards.push(draw());
            state.dealer.cards.push(draw());
        }
        if (isBlackjack(state.dealer.cards)) { state.dealer.revealed = true; settleAll(); return; }
        for (const q of live) if (isBlackjack(q.cards)) q.done = true;
        if (live.every((q) => q.done)) { state.dealer.revealed = true; settleAll(); return; }
        if (state.order === "dealer") beginDealer(); else nextTurn();
    }
    function nextTurn() {
        const s = state.players.findIndex((q) => !q.out && q.cards.length && !q.done);
        if (s >= 0) { state.phase = "player"; state.turn = s; publish(); return; }
        state.turn = -1;
        if (!state.dealer.revealed) beginDealer(); else settleAll();
    }
    function beginDealer() {
        state.phase = "dealer";
        state.dealer.revealed = true;
        publish();
        schedule(700, dealerStep);
    }
    function dealerStep() {
        const v = handValue(state.dealer.cards).total;
        const need = state.order === "dealer" || state.players.some((q) => !q.out && q.cards.length && handValue(q.cards).total <= 21 && !isBlackjack(q.cards));
        if (need && v < 17) {
            state.dealer.cards.push(draw());
            publish();
            schedule(620, dealerStep);
            return;
        }
        if (state.order === "dealer" && v <= 21 && state.players.some((q) => !q.out && !q.done)) { nextTurn(); return; }
        settleAll();
    }
    function doHit(p) {
        p.cards.push(draw());
        const v = handValue(p.cards).total;
        if (v >= 21) { p.done = true; publish(); schedule(600, nextTurn); }
        else publish();
    }
    function doDouble(p) {
        if (p.cards.length !== 2 || p.bank < p.stake) return;
        p.bank -= p.stake; p.stake *= 2; p.doubled = true;
        p.cards.push(draw()); p.done = true;
        publish();
        schedule(650, nextTurn);
    }
    function settleAll() {
        clearTimers();
        state.phase = "settle"; state.turn = -1; state.dealer.revealed = true;
        const dv = handValue(state.dealer.cards).total;
        const dBJ = isBlackjack(state.dealer.cards);
        for (const q of state.players) {
            if (q.out || !q.cards.length) continue;
            const pv = handValue(q.cards).total;
            const pBJ = isBlackjack(q.cards);
            let kind, text;
            if (pv > 21) { q.losses++; kind = "lose"; text = "Bust −$" + q.stake; }
            else if (pBJ && !dBJ) { const w = Math.floor(q.stake * 1.5); q.bank += q.stake + w; q.wins++; kind = "win"; text = "Blackjack +$" + w; }
            else if (dBJ && !pBJ) { q.losses++; kind = "lose"; text = "Dealer blackjack −$" + q.stake; }
            else if (dv > 21) { q.bank += q.stake * 2; q.wins++; kind = "win"; text = "Dealer bust +$" + q.stake; }
            else if (pv > dv) { q.bank += q.stake * 2; q.wins++; kind = "win"; text = "Win +$" + q.stake + (q.doubled ? " (2×)" : ""); }
            else if (pv < dv) { q.losses++; kind = "lose"; text = "Dealer " + dv + " −$" + q.stake; }
            else { q.bank += q.stake; kind = "push"; text = "Push"; }
            q.result = { kind, text };
        }
        publish();
        schedule(2600, backToBet);
    }
    function backToBet() {
        for (const q of state.players) {
            q.bet = 0; q.stake = 0; q.cards = []; q.done = false; q.doubled = false; q.ready = false; q.result = null;
            q.out = q.bank < MIN_BET;
        }
        state.dealer = { cards: [], revealed: false };
        state.turn = -1; state.msg = "";
        state.phase = state.players.every((q) => q.out) ? "over" : "bet";
        publish();
    }

    /* ---------- cheats (offline only) ---------- */
    function cheatMoney() {
        const me = state.players[mySeat()];
        me.bank += 500; me.out = false;
        if (state.phase === "over") {
            clearTimers();
            for (const q of state.players) {
                q.bet = 0; q.stake = 0; q.cards = []; q.done = false; q.doubled = false; q.ready = false; q.result = null;
                q.out = q.bank < MIN_BET;
            }
            state.dealer = { cards: [], revealed: false };
            state.turn = -1; state.msg = ""; state.phase = "bet";
        }
        publish();
    }
    function cheatRig() {
        if (state.phase !== "bet" || rigPending) return;
        rigPending = true;
        render();
    }

    /* ---------- actions ---------- */
    function applyAction(a, actor) {
        if (destroyed || !state || !a || typeof a.type !== "string") return;
        if (a.type === "restart") { newSession(); return; }
        const seat = online ? state.seatOf[actor] : 0;
        const p = state.players[seat];
        if (!p) return;
        if (state.phase === "bet") {
            if (p.out) return;
            if (a.type === "chip") {
                const v = Number(a.v);
                if (!CHIPS.includes(v) || p.ready || p.bet + v > p.bank) return;
                p.bet += v; publish();
            } else if (a.type === "clear") {
                if (!p.bet && !p.ready) return;
                p.bet = 0; p.ready = false; publish();
            } else if (a.type === "rebet") {
                if (p.ready || !(p.lastBet > 0) || p.lastBet > p.bank) return;
                p.bet = p.lastBet; publish();
            } else if (a.type === "ready") {
                if (p.ready || p.bet < MIN_BET) return;
                p.ready = true;
                if (state.players.every((q) => q.out || q.ready)) startDeal(); else publish();
            }
            return;
        }
        if (state.phase === "player" && state.turn === seat && !p.done) {
            if (a.type === "hit") doHit(p);
            else if (a.type === "stand") { p.done = true; nextTurn(); }
            else if (a.type === "double") doDouble(p);
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- rendering ---------- */
    function totalBadge(cards, hideSecond) {
        if (!cards.length) return "";
        if (hideSecond) return handValue([cards[0]]).total + " + ?";
        const v = handValue(cards);
        if (v.total > 21) return "Bust " + v.total;
        if (v.soft) return (v.total - 10) + "/" + v.total;
        return String(v.total);
    }
    function cardsHTML(cards, opts) {
        const o = opts || {};
        if (!cards.length) return '<span class="bj-empty"></span><span class="bj-empty"></span>';
        return cards.map((c, i) => {
            const isNew = i >= (o.prev || 0);
            let anim = i === o.flipIdx ? "bj-flip" : isNew ? "bj-in" : "";
            const delay = (o.prev || 0) === 0 && isNew ? i * 90 : 0;
            const down = i === o.hide && !o.revealXray;
            if (i === o.hide && o.revealXray) anim += " bj-xray";
            return '<span class="bj-slot">' + cardSVG(c, !down, anim, delay) + "</span>";
        }).join("");
    }

    function render() {
        if (destroyed) return;
        cheatsBtn.hidden = online;
        if (!state) {
            boardEl.innerHTML = '<div class="bj-felt"><div class="bj-waitline" style="margin:auto">Waiting for host…</div></div>';
            statusEl.textContent = "Waiting";
            roundEl.textContent = "";
            ovOver.hidden = true; ovCheats.hidden = true;
            return;
        }
        const seat = mySeat();
        const me = state.players[seat];
        const ph = state.phase;
        const d = state.dealer;
        const hideHole = !d.revealed;
        const flipIdx = d.revealed && !prevRevealed && d.cards.length > 1 ? 1 : -1;

        const dealerHTML =
            '<div class="bj-dealer"><div class="bj-label">Dealer <span class="bj-total">' + totalBadge(d.cards, hideHole && !xray) + "</span>" +
            (hideHole && xray ? '<span class="bj-tag ok">x-ray</span>' : "") + "</div>" +
            '<div class="bj-cards">' + cardsHTML(d.cards, { hide: 1, revealXray: xray, prev: prevCounts.d, flipIdx }) + "</div></div>";

        const nextCard = peekNext && state.shoe.length ? state.shoe[state.shoe.length - 1] : null;
        const midHTML =
            '<div class="bj-mid"><span class="bj-shoe">Shoe ' + state.shoe.length + (rigPending ? " · rigged" : "") + "</span>" +
            (nextCard ? '<span class="bj-peek">' + cardSVG(nextCard, true, "", 0) + "<i>next</i></span>" : "") +
            '<span class="bj-msg">' + esc(state.msg) + "</span></div>";

        const playersHTML = '<div class="bj-players">' + state.players.map((p, i) => {
            const active = ph === "player" && state.turn === i;
            const you = i === seat;
            const tags =
                (p.doubled ? '<span class="bj-tag">2×</span>' : "") +
                (ph === "bet" && p.ready ? '<span class="bj-tag ok">ready</span>' : "") +
                (p.out ? '<span class="bj-tag bad">out</span>' : "");
            const shownBet = ph === "bet" ? p.bet : p.stake;
            return '<div class="bj-seat' + (active ? " is-active" : "") + (you ? " is-you" : "") + '">' +
                '<div class="bj-cards">' + cardsHTML(p.cards, { prev: prevCounts.p[i] || 0 }) + "</div>" +
                '<div class="bj-seatmeta"><span class="bj-seatname">' + esc(p.name) + (you ? " · you" : "") + "</span>" +
                '<span class="bj-total">' + totalBadge(p.cards, false) + "</span>" + tags + "</div>" +
                '<div class="bj-stats">Bank <b>$' + p.bank + "</b> · Bet <b>$" + shownBet + "</b> · " + p.wins + "W " + p.losses + "L</div>" +
                (p.result ? '<div class="bj-res ' + p.result.kind + '">' + esc(p.result.text) + "</div>" : '<div class="bj-res"></div>') +
                "</div>";
        }).join("") + "</div>";

        let controlsHTML = "";
        if (ph === "bet") {
            if (me.out) controlsHTML = '<div class="bj-waitline">You are out of chips.</div>';
            else {
                const chipsHTML = CHIPS.map((v, i) => {
                    const dis = me.ready || me.bet + v > me.bank;
                    return '<button type="button" class="bj-chipbtn" data-chip="' + v + '"' + (dis ? " disabled" : "") + ' title="+$' + v + " · key " + (i + 1) + '">' + chipSVG(v) + "</button>";
                }).join("");
                const canRebet = !me.ready && me.lastBet > 0 && me.lastBet <= me.bank;
                const readyLabel = me.ready ? "Waiting…" : online ? "Ready" : "Deal";
                controlsHTML =
                    '<div class="bj-betbar">' + chipsHTML + "</div>" +
                    '<div class="bj-betrow"><span class="bj-betlabel">Bet <b>$' + me.bet + "</b></span>" +
                    '<button type="button" class="bj-btn ghost" data-act="clear"' + (me.bet || me.ready ? "" : " disabled") + '>Clear<kbd class="bj-key">C</kbd></button>' +
                    '<button type="button" class="bj-btn ghost" data-act="rebet"' + (canRebet ? "" : " disabled") + ">Rebet" + (me.lastBet ? " $" + me.lastBet : "") + '<kbd class="bj-key">R</kbd></button>' +
                    '<button type="button" class="bj-btn bj-big" data-act="ready"' + (me.bet >= MIN_BET && !me.ready ? "" : " disabled") + ">" + readyLabel + '<kbd class="bj-key">␣</kbd></button></div>';
            }
        } else if (ph === "player") {
            if (state.turn === seat && !me.done) {
                const canD = me.cards.length === 2 && me.bank >= me.stake;
                controlsHTML = '<div class="bj-playbar">' +
                    '<button type="button" class="bj-btn bj-big" data-act="hit">Hit<kbd class="bj-key">H</kbd></button>' +
                    '<button type="button" class="bj-btn ghost bj-big" data-act="stand">Stand<kbd class="bj-key">S</kbd></button>' +
                    '<button type="button" class="bj-btn ghost bj-big" data-act="double"' + (canD ? "" : " disabled") + '>Double<kbd class="bj-key">D</kbd></button></div>';
            } else {
                const t = state.players[state.turn];
                controlsHTML = '<div class="bj-waitline">' + esc(t ? t.name : "…") + " is playing…</div>";
            }
        } else if (ph === "dealer") controlsHTML = '<div class="bj-waitline">Dealer plays…</div>';
        else if (ph === "settle") controlsHTML = '<div class="bj-waitline">Next hand…</div>';

        boardEl.innerHTML =
            '<div class="bj-felt">' + dealerHTML + midHTML + playersHTML + "</div>" +
            '<div class="bj-controls">' + controlsHTML + "</div>";

        /* status / toolbar / overlays */
        const STATUS = { bet: online ? "Place bets" : "Place your bet", dealer: "Dealer plays", settle: "Results", over: "Game over" };
        statusEl.textContent = ph === "player"
            ? (state.turn === seat ? "Your turn" : (state.players[state.turn] ? state.players[state.turn].name : "…") + "'s turn")
            : (STATUS[ph] || "Ready");
        roundEl.textContent = "Hand " + state.round + (online ? " · you = " + me.name : "");

        ovOver.hidden = ph !== "over";
        if (ph === "over") overStats.textContent = me.name + ": " + me.wins + "W · " + me.losses + "L · bank $" + me.bank;

        if (online) cheatsOpen = false;
        ovCheats.hidden = !cheatsOpen || online;
        xrayBtn.textContent = "X-ray hole card: " + (xray ? "on" : "off");
        xrayBtn.dataset.on = xray ? "1" : "0";
        peekBtn.textContent = "Peek next card: " + (peekNext ? "on" : "off");
        peekBtn.dataset.on = peekNext ? "1" : "0";
        rigBtn.textContent = rigPending ? "Blackjack queued ✓" : "Next deal: Blackjack";
        rigBtn.disabled = ph !== "bet" || rigPending;

        prevCounts = { d: d.cards.length, p: state.players.map((q) => q.cards.length) };
        prevRevealed = d.revealed;
    }

    /* ---------- input: mouse / touch + keyboard ---------- */
    function handleClick(e) {
        if (destroyed) return;
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const b = e.target.closest("button");
        if (!b || b.disabled || !root.contains(b)) return;
        if (b.dataset.chip) { submitAction({ type: "chip", v: Number(b.dataset.chip) }); return; }
        const act = b.dataset.act;
        if (!act) return;
        if (act === "cheats") { if (!online) { cheatsOpen = !cheatsOpen; render(); } return; }
        if (act === "cheats-close") { cheatsOpen = false; render(); return; }
        if (act === "cheat-money") { if (!online && state) cheatMoney(); return; }
        if (act === "cheat-xray") { if (!online) { xray = !xray; render(); } return; }
        if (act === "cheat-peek") { if (!online) { peekNext = !peekNext; render(); } return; }
        if (act === "cheat-rig") { if (!online && state) cheatRig(); return; }
        submitAction({ type: act });
    }
    function onKey(e) {
        if (destroyed || !root.isConnected || !state) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const k = (e.key || "").toLowerCase();
        if (k === "escape") { if (cheatsOpen) { cheatsOpen = false; render(); e.preventDefault(); } return; }
        if (!online && k === "x") { cheatsOpen = !cheatsOpen; render(); e.preventDefault(); return; }
        if (cheatsOpen) return;
        if (state.phase === "player" && state.turn === mySeat()) {
            if (k === "h") { e.preventDefault(); submitAction({ type: "hit" }); }
            else if (k === "s") { e.preventDefault(); submitAction({ type: "stand" }); }
            else if (k === "d") { e.preventDefault(); submitAction({ type: "double" }); }
        } else if (state.phase === "bet") {
            if (e.code === "Space" || k === "enter") { e.preventDefault(); submitAction({ type: "ready" }); }
            else if (k === "r") { e.preventDefault(); submitAction({ type: "rebet" }); }
            else if (k === "c") { e.preventDefault(); submitAction({ type: "clear" }); }
            else if (["1", "2", "3", "4"].includes(k)) { e.preventDefault(); submitAction({ type: "chip", v: CHIPS[Number(k) - 1] }); }
        } else if (state.phase === "over" && k === "enter") {
            e.preventDefault(); submitAction({ type: "restart" });
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);

    if (online) {
        room.onRoom((nextRoom) => {
            if (destroyed) return;
            roomData = nextRoom;
            if (room.isHost) { if (state) publish(); } else render();
        });
        if (room.isHost) {
            newSession();
            room.onAction((action) => applyAction(action, 1));
        } else {
            render();
            room.onState((nextState) => { if (destroyed) return; state = nextState; render(); });
        }
    } else {
        newSession();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            root.innerHTML = "";
        },
    };
}