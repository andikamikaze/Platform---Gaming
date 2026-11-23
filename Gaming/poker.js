/* ==== GAME: poker.js ==== */
/*
 * Texas Hold'em — template-compatible module (export META + mount).
 * Converted from the old MGP_REGISTER format.
 *
 * Features:
 *  - Minimalist UI: rivals on top, shared table in the middle, YOUR hand + big
 *    action buttons at the bottom (mouse, touch and keyboard all work).
 *  - Simplified betting: Fold / Check-Call / Raise (slider + presets) / All-in,
 *    plus a live "coach" hint that grades your hand and suggests an action.
 *  - How-to-play overlay (button or key H) with rules, rankings and controls.
 *  - Random level generator that is ALWAYS winnable: your stack is >= 50 big
 *    blinds and never smaller than any rival stack; blinds/rivals/styles random.
 *  - Cheat overlay (offline only): x-ray, rig a royal flush, timid bots, turbo,
 *    +1000 chips, force bots to fold. Using cheats disables best-level record.
 *  - Random first button vs bots (coin toss each session, rotates every hand).
 *  - Online room mode: heads-up, host-authoritative state; seats are drawn at
 *    random each match and the button is random too.
 *
 * Run `node tools/build-games-manifest.mjs` after editing META.
 */

export const META = {
    id: "poker", // must match the file name (without .js)
    name: "Poker",
    category: "cards",
    catLabel: "Cards",
    desc: "Texas Hold'em made simple. Bust the bots, clear random levels.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="8" width="17" height="24" rx="3" transform="rotate(-8 15 20)"/><rect x="21" y="6" width="17" height="24" rx="3" transform="rotate(8 29 18)"/><circle cx="16" cy="37" r="8" stroke-dasharray="4 3"/><circle cx="33" cy="38" r="8" stroke-dasharray="4 3"/></svg>',
    bg: ["#fde68a", "#f59e0b"],
    bestKey: "pokerBestLevel",
};

/* ================================================================ */
/* Pure card helpers                                                 */
/* ================================================================ */
const RNAME = {
    2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
    8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const RTXT = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const SLET = ["s", "h", "d", "c"];
const plural = (r) => (r === 6 ? "Sixes" : RNAME[r] + "s");
const rankTxt = (r) => RTXT[r] || String(r);
const cardStr = (c) => rankTxt(c.r) + SLET[c.s];
const STAGE_LABEL = {
    preflop: "PRE-FLOP", flop: "FLOP", turn: "TURN", river: "RIVER", showdown: "SHOWDOWN",
};

function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    return d;
}
function shuffle(a, rng) {
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* ================================================================ */
/* Hand evaluation (pure)                                            */
/* ================================================================ */
/* evaluate exactly 5 cards -> {rank 0-8, tb[], name} */
function eval5(cs) {
    const rs = cs.map((c) => c.r).sort((a, b) => b - a);
    const flush = cs.every((c) => c.s === cs[0].s);
    const counts = {};
    for (const r of rs) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.keys(counts).map(Number)
        .sort((a, b) => counts[b] - counts[a] || b - a);
    const uniq = rs.filter((r, i) => i === 0 || rs[i - 1] !== r);
    let sh = 0;
    if (uniq.length === 5) {
        if (uniq[0] - uniq[4] === 4) sh = uniq[0];
        else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) sh = 5; /* wheel A-5 */
    }
    if (flush && sh)
        return { rank: 8, tb: [sh], name: sh === 14 ? "Royal Flush" : "Straight Flush" };
    if (groups.length === 2) {
        if (counts[groups[0]] === 4)
            return { rank: 7, tb: groups.slice(), name: "Four of a Kind: " + plural(groups[0]) };
        return { rank: 6, tb: groups.slice(), name: "Full House: " + plural(groups[0]) + " over " + plural(groups[1]) };
    }
    if (flush) return { rank: 5, tb: rs.slice(), name: "Flush, " + RNAME[rs[0]] + " high" };
    if (sh) return { rank: 4, tb: [sh], name: "Straight to the " + RNAME[sh] };
    if (groups.length === 3) {
        if (counts[groups[0]] === 3)
            return { rank: 3, tb: groups.slice(), name: "Three of a Kind: " + plural(groups[0]) };
        return { rank: 2, tb: groups.slice(), name: "Two Pair: " + plural(groups[0]) + " and " + plural(groups[1]) };
    }
    if (groups.length === 4)
        return { rank: 1, tb: groups.slice(), name: "Pair of " + plural(groups[0]) };
    return { rank: 0, tb: rs.slice(), name: RNAME[rs[0]] + " High" };
}
/* best 5-card hand from 5-7 cards (fewer -> high-card fallback) */
function evalBest(cards) {
    if (cards.length === 5) return eval5(cards);
    if (cards.length < 5) {
        const rs = cards.map((c) => c.r).sort((a, b) => b - a);
        return { rank: 0, tb: rs, name: rs.length ? RNAME[rs[0]] + " High" : "No hand" };
    }
    const n = cards.length;
    let best = null;
    for (let a = 0; a < n - 4; a++)
        for (let b = a + 1; b < n - 3; b++)
            for (let c = b + 1; c < n - 2; c++)
                for (let d = c + 1; d < n - 1; d++)
                    for (let e = d + 1; e < n; e++) {
                        const v = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
                        if (!best || compareHands(v, best) > 0) best = v;
                    }
    return best;
}
/* compare two eval outputs -> -1 / 0 / 1 */
function compareHands(a, b) {
    if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
    const n = Math.max(a.tb.length, b.tb.length);
    for (let i = 0; i < n; i++) {
        const x = i < a.tb.length ? a.tb[i] : 0;
        const y = i < b.tb.length ? b.tb[i] : 0;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

/* ================================================================ */
/* AI strength + decision (pure)                                     */
/* ================================================================ */
/* preflop: 2 hole cards -> 0..1 on the same scale as strengthOf */
function holeStrength(hole) {
    const r1 = Math.max(hole[0].r, hole[1].r);
    const r2 = Math.min(hole[0].r, hole[1].r);
    if (r1 === r2) return 0.1 + (r1 / 14) * 0.15;
    let v = ((r1 + r2) / 28) * 0.16;
    if (hole[0].s === hole[1].s) v += 0.025;
    const gap = r1 - r2;
    if (gap === 1) v += 0.02;
    else if (gap === 2) v += 0.01;
    if (r1 === 14) v += 0.02;
    if (r2 >= 12) v += 0.01;
    return Math.min(0.28, v);
}
/* 2 hole cards (preflop) or 5-7 cards (make-hand only, no draws) -> 0..1 */
function strengthOf(cards) {
    if (cards.length < 5) return holeStrength(cards);
    const e = evalBest(cards);
    return Math.min(1, (e.rank * 14 + (e.tb[0] || 0)) / 126);
}
const AI_STYLES = [
    { id: "rock", label: "Tight", bias: -0.05, aggr: 0.7 },
    { id: "station", label: "Loose", bias: 0.06, aggr: 0.6 },
    { id: "shark", label: "Balanced", bias: 0, aggr: 1 },
    { id: "maniac", label: "Aggro", bias: 0.03, aggr: 1.6 },
];
const AI_POOL = [
    { name: "Amber", color: "#db2777" },
    { name: "Cole", color: "#059669" },
    { name: "Daisy", color: "#d97706" },
    { name: "Rex", color: "#0891b2" },
    { name: "Nova", color: "#7c3aed" },
];
/* AI betting decision: strong raise/call, medium call, weak fold.
 * style tweaks thresholds (bias) and raise frequency (aggr).
 * timid (cheat): never raise, fold to any bet. */
function aiDecide(strength, toCall, pot, chips, rand, style, timid) {
    if (timid) return toCall > 0 ? "fold" : "call";
    const bias = style ? style.bias : 0;
    const aggr = style ? style.aggr : 1;
    const s = Math.max(0, Math.min(1, strength + bias));
    const rp = (p) => rand < Math.min(0.95, p * aggr);
    if (toCall <= 0) {
        if (s >= 0.62) return rp(0.85) ? "raise" : "call";
        if (s >= 0.42) return rp(0.55) ? "raise" : "call";
        if (s >= 0.28) return rp(0.25) ? "raise" : "call";
        if (s >= 0.17) return rp(0.12) ? "raise" : "call";
        return rp(0.08) ? "raise" : "call";
    }
    const odds = toCall / (pot + toCall);
    const allIn = toCall >= chips;
    if (allIn && s < 0.14 && rand < 0.7) return "fold";
    if (s >= 0.62) return rp(0.82) ? "raise" : "call";
    if (s >= 0.42) return rp(0.45) ? "raise" : "call";
    if (s >= 0.28) return rp(0.22) ? "raise" : "call";
    if (s >= 0.17) return rp(0.10) ? "raise" : "call";
    if (s >= 0.12) return odds <= 0.22 || rand < 0.25 ? "call" : "fold";
    if (rand < Math.min(0.2, 0.05 * aggr)) return "raise";
    if (rand < 0.14 && odds <= 0.15) return "call";
    return "fold";
}

/* ================================================================ */
/* Random level generator — guaranteed winnable                      */
/* ================================================================ */
/* Every level: player stack >= 50 BB and >= every rival stack, so the
 * level can always be cleared. Blinds double per level (capped), rival
 * count / names / styles / stacks are random. Stack carries over. */
function genLevel(num, carry, rng) {
    rng = rng || Math.random;
    const bb = 20 * Math.pow(2, Math.min(num - 1, 3)); /* 20, 40, 80, 160 cap */
    const sb = bb / 2;
    const floor = bb * 50;
    const playerChips = Math.max(floor, Math.ceil((carry || 0) / 10) * 10);
    const maxR = Math.min(3, num);
    const count = 1 + Math.floor(rng() * maxR);
    const pool = AI_POOL.slice();
    const rivals = [];
    for (let i = 0; i < count; i++) {
        const meta = pool.splice((rng() * pool.length) | 0, 1)[0];
        const style = AI_STYLES[(rng() * AI_STYLES.length) | 0];
        let chips = bb * (30 + ((rng() * 31) | 0)); /* 30..60 BB */
        chips = Math.min(chips, playerChips); /* winnable guarantee */
        rivals.push({ name: meta.name, color: meta.color, style, chips });
    }
    return { num, sb, bb, playerChips, rivals };
}

/* ================================================================ */
/* Layered pots from total contributions (pure)                      */
/* ================================================================ */
/* An all-in player only competes for layers up to their contribution.
 * Dead money from folded players is included. A layer nobody live can
 * contest is refunded to its contributors (uncalled chips). Odd chips
 * go to the first winners left of the button. Returns serializable data. */
function computePots(players, evs, dealerIdx) {
    const n = players.length;
    const live = [];
    players.forEach((p, i) => { if (!p.out && !p.folded) live.push(i); });
    const contrib = players.map((p) => p.contributed);
    const levels = Array.from(new Set(contrib.filter((c) => c > 0))).sort((a, b) => a - b);
    const win = players.map(() => 0);
    const parts = [];
    const refunds = [];
    let prev = 0;
    levels.forEach((L) => {
        const layer = contrib.map((c) => Math.max(0, Math.min(c, L) - prev));
        prev = L;
        const amt = layer.reduce((s, c) => s + c, 0);
        if (amt <= 0) return;
        const elig = live.filter((i) => contrib[i] >= L);
        if (!elig.length) {
            layer.forEach((c, i) => { if (c > 0) { win[i] += c; refunds.push({ seat: i, amt: c }); } });
            return;
        }
        let winners = [];
        elig.forEach((i) => {
            if (!winners.length) { winners = [i]; return; }
            const cmp = compareHands(evs[i], evs[winners[0]]);
            if (cmp > 0) winners = [i];
            else if (cmp === 0) winners.push(i);
        });
        winners.sort((a, b) => ((a - dealerIdx - 1 + n) % n) - ((b - dealerIdx - 1 + n) % n));
        const share = Math.floor(amt / winners.length);
        const odd = amt - share * winners.length;
        winners.forEach((i, k) => { win[i] += share + (k < odd ? 1 : 0); });
        parts.push({
            label: parts.length === 0 ? (levels.length > 1 ? "Main pot" : "Pot") : "Side pot " + parts.length,
            amt, winners, evName: evs[winners[0]].name,
        });
    });
    return { win, parts, refunds };
}

/* legal raise window for a seat (pure; used by UI + host validation) */
function legalMoves(S, seat) {
    const p = S.players[seat];
    const toCall = Math.max(0, S.curBet - p.betRound);
    const maxTo = p.betRound + p.chips;
    const minTo = S.curBet + S.minRaise;
    const pot = S.players.reduce((s, q) => s + q.contributed, 0);
    return { toCall, maxTo, minTo, pot, canRaise: p.chips > toCall && maxTo >= minTo };
}

/* ================================================================ */
/* Game engine — no DOM, fully serializable state.                   */
/* The host (or offline mode) is authoritative: it runs AI + timers  */
/* and publishes state; guests only send actions and render state.   */
/* deps: { online, hostName, rng, publish, later, clearTimers,        */
/*         onLevelClear }                                            */
/* ================================================================ */
function createGame(deps) {
    const online = !!deps.online;
    const rng = deps.rng || Math.random;
    const publish = deps.publish || function () { };
    const later = deps.later;
    const clearTimers = deps.clearTimers || function () { };
    const onLevelClear = deps.onLevelClear || function () { };
    let S = null;

    const N = () => S.players.length;
    const potTotal = () => S.players.reduce((s, p) => s + p.contributed, 0);
    const inHand = (p) => !p.out && !p.folded;
    const canAct = (p) => inHand(p) && !p.allIn;
    const needsAction = (p) => canAct(p) && (!p.acted || p.betRound < S.curBet);
    const liveSeats = () => {
        const a = [];
        S.players.forEach((p, i) => { if (inHand(p)) a.push(i); });
        return a;
    };
    const verb = (p, base) => (p.name === "You" ? base : base + "s");
    function log(m, c) {
        S.log.unshift({ m, c: c || "" });
        if (S.log.length > 40) S.log.pop();
    }
    const delay = (ms) => (!online && S.cheats.turbo ? Math.min(60, ms) : ms);

    function freshPlayer(name, ai, color, style, chips) {
        return {
            name, ai, color, style: style || null, chips,
            hole: [], folded: false, allIn: false, out: false,
            betRound: 0, contributed: 0, acted: false, showed: false, dealPos: 0,
        };
    }
    function buildAiPlayers(level) {
        const arr = [freshPlayer("You", false, "#4f46e5", null, level.playerChips)];
        level.rivals.forEach((r) => arr.push(freshPlayer(r.name, true, r.color, r.style, r.chips)));
        return arr;
    }
    function buildOnlinePlayers() {
        const arr = [null, null];
        arr[S.seatMap[0]] = freshPlayer(deps.hostName || "Host", false, "#4f46e5", null, 1000);
        arr[S.seatMap[1]] = freshPlayer(S.guestName || "Guest", false, "#db2777", null, 1000);
        return arr;
    }

    /* ---------- session / level flow ---------- */
    function init() {
        S = {
            v: 1, phase: "idle", stage: "preflop",
            level: null, players: [], deck: [], community: [], rigBoard: [],
            dealerIdx: 0, handNum: 0, curBet: 0, minRaise: 20, turnIdx: -1, bbSeat: 0,
            runoutRevealed: false, seatMap: online ? [0, 1] : [0], guestName: "",
            log: [], banner: null, over: null,
            cheats: { peek: false, rig: false, timid: false, turbo: false },
            cheatsUsed: false,
        };
        if (online) {
            S.level = { num: 1, sb: 10, bb: 20, playerChips: 1000, rivals: [] };
            S.players = buildOnlinePlayers();
        } else {
            S.level = genLevel(1, 0, rng);
            S.players = buildAiPlayers(S.level);
        }
        publish();
    }

    function newSession() {
        clearTimers();
        S.banner = null; S.over = null; S.handNum = 0; S.log = [];
        S.cheats.rig = false;
        S.cheatsUsed = !!(S.cheats.peek || S.cheats.timid);
        if (online) {
            /* random seat draw each match */
            S.seatMap = rng() < 0.5 ? [0, 1] : [1, 0];
            S.level = { num: 1, sb: 10, bb: 20, playerChips: 1000, rivals: [] };
            S.players = buildOnlinePlayers();
            log("Seat draw: " + S.players[S.seatMap[0]].name + " takes seat A, " +
                S.players[S.seatMap[1]].name + " takes seat B", "ev");
        } else {
            S.level = genLevel(1, 0, rng);
            S.players = buildAiPlayers(S.level);
            log("Level 1: " + S.level.rivals.length + " rival(s), blinds " +
                S.level.sb + "/" + S.level.bb, "ev");
        }
        /* random first button */
        S.dealerIdx = (rng() * N()) | 0;
        log("Coin toss: the button starts on " + S.players[S.dealerIdx].name, "ev");
        startHand();
    }

    function nextLevel() {
        const carry = S.players[0].chips;
        S.level = genLevel(S.level.num + 1, carry, rng);
        S.players = buildAiPlayers(S.level);
        S.handNum = 0; S.banner = null; S.over = null;
        S.dealerIdx = (rng() * N()) | 0;
        log("Level " + S.level.num + ": " + S.level.rivals.length + " rival(s), blinds " +
            S.level.sb + "/" + S.level.bb + ", you " + S.level.playerChips, "ev");
        startHand();
    }

    function nextChips(from) {
        let i = from;
        for (; ;) {
            i = (i + 1) % N();
            if (!S.players[i].out && S.players[i].chips > 0) return i;
        }
    }
    function postBlind(p, amt) {
        const a = Math.min(amt, p.chips);
        p.chips -= a; p.betRound += a; p.contributed += a;
        if (p.chips === 0) p.allIn = true;
    }

    function startHand() {
        clearTimers();
        S.banner = null;
        S.handNum++;
        S.deck = shuffle(makeDeck(), rng);
        S.community = []; S.rigBoard = [];
        S.players.forEach((p) => {
            p.hole = []; p.folded = false; p.allIn = false;
            p.betRound = 0; p.contributed = 0; p.acted = false; p.showed = false;
            p.out = p.chips <= 0;
        });
        S.runoutRevealed = false;
        if (liveSeats().length < 2) { finishHand(); return; } /* defensive */
        do { S.dealerIdx = (S.dealerIdx + 1) % N(); } while (S.players[S.dealerIdx].out);
        S.stage = "preflop";
        S.curBet = S.level.bb;
        S.minRaise = S.level.bb;
        S.turnIdx = -1;
        /* deal 2 cards each, starting left of the button */
        const order = [];
        for (let k = 1; k <= N(); k++) {
            const s = (S.dealerIdx + k) % N();
            if (!S.players[s].out) order.push(s);
        }
        order.forEach((s, i) => { S.players[s].dealPos = i; });
        order.forEach((s) => S.players[s].hole.push(S.deck.pop()));
        order.forEach((s) => S.players[s].hole.push(S.deck.pop()));
        /* cheat: rig a royal flush for the local player (offline only).
         * Remove the 5 rig cards from the deck FIRST, then swap any copies
         * sitting in opponents' holes with deck cards (avoids duplicates). */
        if (!online && S.cheats.rig && !S.players[0].out) {
            const want = [{ r: 14, s: 0 }, { r: 13, s: 0 }];
            const board = [{ r: 12, s: 0 }, { r: 11, s: 0 }, { r: 10, s: 0 }];
            const keys = {};
            want.concat(board).forEach((c) => { keys[c.r + "." + c.s] = true; });
            S.deck = S.deck.filter((c) => !keys[c.r + "." + c.s]);
            S.players.forEach((p, i) => {
                if (i === 0) return;
                p.hole = p.hole.map((c) => (keys[c.r + "." + c.s] ? S.deck.pop() : c));
            });
            S.players[0].hole = want;
            S.rigBoard = board;
            S.cheats.rig = false; S.cheatsUsed = true;
            log("Cheat: royal flush deal armed for you", "ev");
        }
        /* blinds (heads-up: the button posts the small blind) */
        let sbI, bbI;
        if (order.length === 2) { sbI = S.dealerIdx; bbI = nextChips(sbI); }
        else { sbI = nextChips(S.dealerIdx); bbI = nextChips(sbI); }
        postBlind(S.players[sbI], S.level.sb);
        postBlind(S.players[bbI], S.level.bb);
        S.bbSeat = bbI;
        log("Hand " + S.handNum + ": blinds " + S.level.sb + "/" + S.level.bb +
            ", button on " + S.players[S.dealerIdx].name, "ev");
        S.phase = "dealing";
        publish();
        later(delay(700), () => {
            if (S.phase !== "dealing") return;
            S.phase = "betting";
            proceed(S.bbSeat);
        });
    }

    /* ---------- betting round flow ---------- */
    function proceed(startAfter) {
        if (S.phase !== "betting") return;
        if (liveSeats().length <= 1) { endHandByFold(); return; }
        const actors = S.players.filter(canAct);
        if (actors.length === 0) { endRound(); return; }
        if (actors.length === 1 && actors[0].betRound >= S.curBet) { endRound(); return; }
        let idx = -1;
        for (let k = 1; k <= N(); k++) {
            const i = (((startAfter + k) % N()) + N()) % N();
            if (needsAction(S.players[i])) { idx = i; break; }
        }
        if (idx < 0) { endRound(); return; }
        S.turnIdx = idx;
        publish();
        if (S.players[idx].ai) later(delay(500 + rng() * 600), () => aiMove(idx));
    }

    function endRound() {
        S.players.forEach((p) => { p.betRound = 0; p.acted = false; });
        S.curBet = 0; S.minRaise = S.level.bb; S.turnIdx = -1;
        const actors = S.players.filter(canAct);
        if (!S.runoutRevealed && actors.length <= 1) {
            S.runoutRevealed = true;
            S.players.forEach((p) => { if (inHand(p)) p.showed = true; });
            log("All-in - cards face up for the runout", "ev");
        }
        if (S.stage === "preflop") revealStage("flop");
        else if (S.stage === "flop") revealStage("turn");
        else if (S.stage === "turn") revealStage("river");
        else showdown();
    }

    function revealStage(next) {
        S.stage = next; S.phase = "reveal";
        publish();
        revealCards(next === "flop" ? 3 : 1, () => {
            S.phase = "betting";
            let f = S.dealerIdx;
            do { f = (f + 1) % N(); } while (!inHand(S.players[f]));
            proceed((f + N() - 1) % N());
        });
    }
    function revealCards(k, done) {
        if (k <= 0) { later(delay(250), done); return; }
        later(delay(400), () => {
            const c = S.rigBoard.length ? S.rigBoard.shift() : S.deck.pop();
            S.community.push(c);
            const lab = S.community.length === 3 ? "Flop" : S.community.length === 4 ? "Turn" : "River";
            log(lab + ": " + S.community.map(cardStr).join(" "), "ev");
            publish();
            revealCards(k - 1, done);
        });
    }

    function showdown() {
        S.phase = "showdown";
        while (S.community.length < 5)
            S.community.push(S.rigBoard.length ? S.rigBoard.shift() : S.deck.pop());
        S.players.forEach((p) => { if (inHand(p)) p.showed = true; });
        log("Showdown", "ev");
        publish();
        later(delay(900), settle);
    }

    function settle() {
        const evs = S.players.map((p) => (inHand(p) ? evalBest(p.hole.concat(S.community)) : null));
        const res = computePots(S.players, evs, S.dealerIdx);
        res.win.forEach((amt, i) => { if (amt > 0) S.players[i].chips += amt; });
        res.refunds.forEach((r) => log("Uncalled " + r.amt + " returned to " + S.players[r.seat].name));
        res.parts.forEach((pt) => {
            const names = pt.winners.map((i) => S.players[i].name).join(" and ");
            if (pt.winners.length === 1) {
                const w = S.players[pt.winners[0]];
                log(names + " " + verb(w, "win") + " " + pt.label.toLowerCase() + " of " + pt.amt +
                    " with " + pt.evName, w.ai ? "bad" : "win");
            } else {
                log(names + " split " + pt.label.toLowerCase() + " of " + pt.amt + " (" + pt.evName + ")");
            }
        });
        let title = "Showdown";
        if (res.parts.length === 1 && res.parts[0].winners.length === 1) {
            const w = S.players[res.parts[0].winners[0]];
            title = w.name + " " + verb(w, "win") + " " + res.parts[0].amt;
        }
        const lines = res.parts.map((pt) =>
            pt.label + " " + pt.amt + " -> " + pt.winners.map((i) => S.players[i].name).join(", ") +
            " (" + pt.evName + ")");
        res.refunds.forEach((r) => lines.push("Uncalled " + r.amt + " back to " + S.players[r.seat].name));
        S.banner = { title, lines };
        finishHand();
    }

    function endHandByFold() {
        S.phase = "handEnd";
        const w = S.players[liveSeats()[0]];
        const amt = potTotal();
        w.chips += amt;
        log(w.name + " " + verb(w, "take") + " the pot of " + amt + " - everyone folded", w.ai ? "bad" : "win");
        S.banner = { title: w.name + " " + verb(w, "win") + " " + amt, lines: ["Everyone else folded."] };
        finishHand();
    }

    function finishHand() {
        S.phase = "handEnd";
        S.players.forEach((p) => {
            p.contributed = 0; p.betRound = 0;
            if (p.chips <= 0 && !p.out) { p.out = true; log(p.name + " is busted out", "bad"); }
        });
        S.turnIdx = -1;
        if (online) {
            const alive = [];
            S.players.forEach((p, i) => { if (!p.out) alive.push(i); });
            if (alive.length <= 1) {
                S.phase = "over";
                S.over = { winSeat: alive.length ? alive[0] : -1 };
                S.banner = null;
            }
        } else {
            if (S.players[0].out) {
                S.phase = "over";
                S.over = { win: false, reason: "You lost your stack." };
                S.banner = null;
            } else if (S.players.slice(1).every((p) => p.out)) {
                S.phase = "levelEnd";
                S.banner = null;
                onLevelClear(S.level.num, S.cheatsUsed);
            }
        }
        publish();
    }

    /* ---------- betting actions ---------- */
    function doCall(i) {
        const p = S.players[i];
        const toCall = Math.max(0, S.curBet - p.betRound);
        const add = Math.min(toCall, p.chips);
        p.chips -= add; p.betRound += add; p.contributed += add;
        if (p.chips === 0) p.allIn = true;
        p.acted = true;
        if (toCall <= 0) log(p.name + " checks");
        else if (add < toCall) log(p.name + " calls all-in for " + p.betRound);
        else log(p.name + " calls " + add);
        proceed(i);
    }
    function doFold(i) {
        const p = S.players[i];
        p.folded = true; p.acted = true;
        log(p.name + " folds");
        if (liveSeats().length <= 1) { endHandByFold(); return; }
        proceed(i);
    }
    function doRaise(i, to) {
        const p = S.players[i];
        const maxTo = p.betRound + p.chips;
        to = Math.min(Math.max(Math.floor(to) || 0, 0), maxTo);
        const minTo = S.curBet + S.minRaise;
        if (to > S.curBet && to < minTo && maxTo >= minTo) to = minTo; /* enforce min raise */
        if (to <= S.curBet) { doCall(i); return; }
        const add = to - p.betRound;
        p.chips -= add; p.betRound = to; p.contributed += add;
        if (p.chips === 0) p.allIn = true;
        const inc = to - S.curBet;
        if (inc >= S.minRaise) S.minRaise = inc;
        S.curBet = to;
        S.players.forEach((q, j) => { if (j !== i) q.acted = false; });
        p.acted = true;
        log(p.name + (p.allIn ? " raises ALL-IN to " : " raises to ") + to, p.ai ? "bad" : "win");
        proceed(i);
    }

    function aiMove(i) {
        if (S.phase !== "betting" || S.turnIdx !== i) return;
        const p = S.players[i];
        if (!p.ai || !canAct(p)) return;
        const toCall = Math.max(0, S.curBet - p.betRound);
        const strength = strengthOf(p.hole.concat(S.community));
        const act = aiDecide(strength, toCall, potTotal(), p.chips, rng(), p.style, !online && S.cheats.timid);
        if (act === "raise") {
            let to = S.curBet + Math.max(S.minRaise, Math.round(potTotal() * (0.5 + rng() * 0.6)));
            if (strength >= 0.55 && rng() < 0.25) to = p.betRound + p.chips;
            doRaise(i, to);
        } else if (act === "call") doCall(i);
        else doFold(i);
    }

    /* ---------- host-side action validation ---------- */
    /* actor = playerIndex (0 host / local, 1 guest). Seats are mapped
     * through the random seat draw in online mode. */
    function applyAction(a, actor) {
        if (!S || !a || typeof a.t !== "string") return;
        const seat = online ? (S.seatMap[actor] === undefined ? actor : S.seatMap[actor]) : 0;
        if (a.t === "hello") {
            if (online && S.players[seat]) {
                const nm = String(a.name || "Guest").slice(0, 14) || "Guest";
                S.players[seat].name = nm;
                if (actor === 1) S.guestName = nm;
                publish();
            }
            return;
        }
        if (a.t === "start") { if (S.phase === "idle" || S.phase === "over") newSession(); return; }
        if (a.t === "restart") { if (!online || actor === 0) newSession(); return; }
        if (a.t === "next") { if (S.phase === "handEnd") startHand(); return; }
        if (a.t === "level") { if (!online && S.phase === "levelEnd") nextLevel(); return; }
        if (a.t === "act") {
            if (S.phase !== "betting" || S.turnIdx !== seat) return;
            const p = S.players[seat];
            if (!p || p.ai || !canAct(p)) return;
            if (a.kind === "fold") doFold(seat);
            else if (a.kind === "call") doCall(seat);
            else if (a.kind === "allin") doRaise(seat, p.betRound + p.chips);
            else if (a.kind === "raise") doRaise(seat, Number(a.to) || 0);
        }
    }

    /* ---------- cheats (offline only) ---------- */
    function setCheat(key, on) {
        if (online || !S || !(key in S.cheats)) return;
        S.cheats[key] = !!on;
        if (on && key !== "turbo") S.cheatsUsed = true;
        log("Cheat: " + key + (on ? " on" : " off"), "ev");
        publish();
    }
    function addChips() {
        if (online || !S || S.phase === "over") return;
        S.players[0].chips += 1000;
        S.cheatsUsed = true;
        log("Cheat: +1000 chips", "ev");
        publish();
    }
    function forceFold() {
        if (online || !S || S.phase !== "betting") return;
        if (!inHand(S.players[0])) return;
        S.players.forEach((p, i) => { if (i !== 0 && inHand(p)) { p.folded = true; p.acted = true; } });
        S.cheatsUsed = true;
        log("Cheat: all rivals fold", "ev");
        endHandByFold();
    }

    return {
        get state() { return S; },
        init,
        setState(s) { S = s; }, /* guest: adopt host state */
        applyAction,
        setCheat,
        addChips,
        forceFold,
    };
}

/* ================================================================ */
/* mount — DOM, rendering, input (template contract)                 */
/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room && room.room ? room.room : null;

    /* ---------- svg builders (minimalist cards + chips) ---------- */
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
    function cardSVG(card, faceUp, anim, delayMs, big) {
        const cls = "pk-card" + (big ? " pk-big" : "") + (anim ? " " + anim : "");
        const st = delayMs ? ' style="animation-delay:' + delayMs + 'ms"' : "";
        if (!faceUp)
            return '<svg class="' + cls + '" viewBox="0 0 64 90"' + st + '><rect x="1.5" y="1.5" width="61" height="87" rx="7" fill="#eef2ff" stroke="#c7d2fe" stroke-width="1.5"/><rect x="7" y="7" width="50" height="76" rx="4" fill="none" stroke="#c7d2fe" stroke-width="1.2" stroke-dasharray="4 4"/><path d="M32 34l9 11-9 11-9-11z" fill="#c7d2fe"/></svg>';
        const col = card.s === 1 || card.s === 2 ? "#dc2626" : "#0f172a";
        const corner = '<text x="10" y="20" text-anchor="middle" font-size="16" font-weight="800" font-family="inherit" fill="' + col + '">' + rankTxt(card.r) + '</text><g transform="translate(4 22) scale(0.55)">' + suitMarkup(card.s, col) + "</g>";
        return '<svg class="' + cls + '" viewBox="0 0 64 90"' + st + '><rect x="1" y="1" width="62" height="88" rx="7" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>' +
            corner +
            '<g transform="translate(20 33)">' + suitMarkup(card.s, col) + "</g>" +
            '<g transform="translate(60 88) rotate(180)">' + corner + "</g></svg>";
    }
    function chipColor(v) {
        if (v >= 500) return "#e11d48";
        if (v >= 200) return "#7c3aed";
        if (v >= 100) return "#2563eb";
        if (v >= 50) return "#0891b2";
        if (v >= 20) return "#16a34a";
        return "#b45309";
    }
    function chipSVG(v, big) {
        return '<svg class="pk-chip' + (big ? " pk-big" : "") + '" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="' + chipColor(v) + '" stroke="#ffffff" stroke-width="2"/><circle cx="22" cy="22" r="14.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-dasharray="5 4"/><text x="22" y="26" text-anchor="middle" font-size="' + (v >= 1000 ? 9.5 : 12) + '" font-weight="800" font-family="inherit" fill="#fff">' + v + "</text></svg>";
    }

    /* ---------- shell ---------- */
    root.innerHTML = `
<style>
.pk-app{--pk-ink:#0f172a;--pk-mut:#64748b;--pk-line:#e2e8f0;--pk-acc:#4f46e5;--pk-good:#059669;--pk-bad:#dc2626;--pk-warn:#d97706;color:var(--pk-ink);font-family:inherit}
.pk-app [hidden]{display:none!important}
.pk-app .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pk-app .game-intro h2{margin:0;font-size:20px}
.pk-app .game-intro p{margin:2px 0 0;font-size:12.5px;color:var(--pk-mut)}
.pk-app .game-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.pk-app .game-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--pk-mut)}
.pk-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block}
.pk-hud{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.pk-pill{font-size:12px;color:var(--pk-mut);background:#fff;border:1px solid var(--pk-line);border-radius:999px;padding:4px 10px}
.pk-pill b{color:var(--pk-ink);font-weight:700}
.pk-pill.pk-cheat{color:#92400e;background:#fef3c7;border-color:#fde68a;font-weight:700}
.pk-stage{position:relative;display:flex;flex-direction:column;gap:10px;user-select:none;-webkit-user-select:none}
.pk-opps{display:flex;gap:8px;justify-content:center}
.pk-seat{flex:1;min-width:0;max-width:220px;background:#fff;border:1px solid var(--pk-line);border-radius:12px;padding:8px;text-align:center;transition:opacity .25s,border-color .2s,box-shadow .2s}
.pk-seat.folded{opacity:.5}
.pk-seat.out{opacity:.35;filter:grayscale(.7)}
.pk-seat.acting{border-color:var(--pk-acc);box-shadow:0 0 0 3px #4f46e51f}
.pk-sname{display:flex;align-items:center;justify-content:center;gap:5px;font-size:12.5px;font-weight:700;min-height:16px}
.pk-dot{width:8px;height:8px;border-radius:50%;flex:none}
.pk-dbtn{font-size:9px;font-weight:800;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:0 5px}
.pk-cards{display:flex;gap:4px;justify-content:center;align-items:center;min-height:58px;margin:5px 0 3px}
.pk-card{width:40px;height:56px;display:block;flex:none}
.pk-card.pk-big{width:62px;height:87px}
.pk-card.pk-in{animation:pkDeal .28s both}
.pk-card.pk-flip{animation:pkFlip .32s both}
.pk-schips{font-size:12px;color:var(--pk-mut)}
.pk-schips b{color:var(--pk-ink);font-size:13px}
.pk-bet{display:flex;justify-content:center;align-items:center;gap:4px;min-height:26px}
.pk-chip{width:24px;height:24px;display:block}
.pk-chip.pk-big{width:34px;height:34px}
.pk-status{font-size:10px;font-weight:700;letter-spacing:.4px;color:var(--pk-warn);min-height:13px;text-transform:uppercase}
.pk-table{position:relative;background:#f4faf6;border:1px solid #d8e9de;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-height:190px}
.pk-tbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:26px}
.pk-stage-lab{font-size:10.5px;font-weight:800;letter-spacing:2px;color:#3f6f52}
.pk-pot{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#14532d}
.pk-comm{display:flex;gap:7px;justify-content:center;min-height:72px}
.pk-slot{width:52px;height:72px;border:1.5px dashed #b9d4c2;border-radius:8px;display:flex;align-items:center;justify-content:center}
.pk-slot .pk-card{width:50px;height:70px}
.pk-log{max-height:52px;overflow:auto;font-size:11px;color:var(--pk-mut);display:flex;flex-direction:column;gap:2px}
.pk-log div{border-bottom:1px dashed #e8eef2;padding:1.5px 0}
.pk-l-win{color:var(--pk-good)}
.pk-l-bad{color:var(--pk-bad)}
.pk-l-ev{color:var(--pk-warn)}
.pk-banner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3;background:#ffffffd9;backdrop-filter:blur(2px);border-radius:14px}
.pk-bcard{text-align:center;padding:14px 20px;max-width:92%;animation:pkPop .22s both}
.pk-btitle{font-size:18px;font-weight:800;margin:0 0 6px}
.pk-blines{font-size:12px;color:var(--pk-mut);line-height:1.6;margin-bottom:12px}
.pk-me{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;background:#fff;border:1px solid var(--pk-line);border-radius:14px;padding:12px 14px;transition:box-shadow .2s,border-color .2s}
.pk-me.acting{border-color:var(--pk-acc);box-shadow:0 0 0 3px #4f46e51f}
.pk-me.folded{opacity:.6}
.pk-me.out{opacity:.45;filter:grayscale(.6)}
.pk-mecards{display:flex;gap:6px}
.pk-meinfo{display:flex;flex-direction:column;gap:3px;min-width:120px;text-align:center;align-items:center}
.pk-mchips{font-size:12.5px;color:var(--pk-mut)}
.pk-mchips b{color:var(--pk-ink);font-size:15px}
.pk-handname{font-size:11px;font-weight:800;color:var(--pk-acc);min-height:14px;text-transform:uppercase;letter-spacing:.3px}
.pk-hint{font-size:11.5px;font-weight:600;min-height:15px;color:var(--pk-mut)}
.pk-hint.pk-good{color:var(--pk-good)}
.pk-hint.pk-mid{color:var(--pk-warn)}
.pk-hint.pk-bad{color:var(--pk-bad)}
.pk-controls{flex:1;min-width:260px;display:flex;flex-direction:column;gap:8px}
.pk-msg{font-size:12.5px;color:#334155;text-align:center;min-height:17px;font-weight:600}
.pk-raiseline{display:flex;flex-direction:column;gap:5px}
.pk-slider{width:100%;accent-color:var(--pk-acc);height:26px;cursor:pointer;touch-action:manipulation}
.pk-presets{display:flex;gap:6px;justify-content:center}
.pk-preset{font-size:11.5px;font-weight:700;color:var(--pk-mut);background:#f8fafc;border:1px solid var(--pk-line);border-radius:999px;padding:4px 12px;cursor:pointer;min-height:28px;font-family:inherit}
.pk-preset:hover:not(:disabled){color:var(--pk-acc);border-color:var(--pk-acc)}
.pk-preset:disabled{opacity:.4;cursor:default}
.pk-btnrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pk-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 12px;font-size:13.5px;font-weight:700;font-family:inherit;color:var(--pk-ink);background:#fff;border:1px solid var(--pk-line);border-radius:10px;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.pk-btn:hover:not(:disabled){background:#f8fafc}
.pk-btn:active:not(:disabled){transform:translateY(1px)}
.pk-btn:disabled{opacity:.4;cursor:default}
.pk-btn.pk-primary{background:var(--pk-ink);border-color:var(--pk-ink);color:#fff}
.pk-btn.pk-primary:hover:not(:disabled){background:#1e293b}
.pk-btn.pk-accent{background:var(--pk-acc);border-color:var(--pk-acc);color:#fff}
.pk-btn.pk-accent:hover:not(:disabled){background:#4338ca}
.pk-btn.pk-danger{color:var(--pk-bad);border-color:#fecaca}
.pk-btn.pk-danger:hover:not(:disabled){background:#fef2f2}
.pk-btn.pk-ghost{background:transparent}
.pk-ov{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:#f8fafcef;backdrop-filter:blur(3px);padding:14px;border-radius:14px}
.pk-ovcard{background:#fff;border:1px solid var(--pk-line);border-radius:16px;box-shadow:0 12px 32px #0f172a14;padding:20px;max-width:560px;width:100%;text-align:center;animation:pkPop .22s both;max-height:100%;overflow:auto}
.pk-ovtitle{font-size:20px;font-weight:800;margin:0 0 6px}
.pk-ovtitle.pk-good{color:var(--pk-good)}
.pk-ovtitle.pk-bad{color:var(--pk-bad)}
.pk-ovsub{font-size:13px;color:var(--pk-mut);line-height:1.6;margin:0 0 14px}
.pk-ovbtns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.pk-help{text-align:left;font-size:12.5px;color:#334155;line-height:1.65}
.pk-help h3{font-size:13px;margin:14px 0 4px;color:var(--pk-ink)}
.pk-help h3:first-child{margin-top:0}
.pk-help ul{margin:4px 0;padding-left:18px}
.pk-help kbd{background:#f1f5f9;border:1px solid var(--pk-line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;font-family:inherit;font-weight:700}
.pk-ranks{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;font-size:12px}
.pk-ranks div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #eef2f6;padding:2px 0}
.pk-ranks span{color:var(--pk-mut)}
.pk-cheatrow{display:flex;align-items:flex-start;gap:10px;text-align:left;padding:9px 4px;border-bottom:1px dashed #eef2f6;font-size:12.5px;cursor:pointer}
.pk-cheatrow input{width:18px;height:18px;margin-top:1px;accent-color:var(--pk-acc);flex:none}
.pk-cheatrow b{display:block;font-size:13px}
.pk-cheatrow small{color:var(--pk-mut);line-height:1.45;display:block}
.pk-cheatnote{font-size:11.5px;color:var(--pk-warn);margin:10px 0}
@keyframes pkDeal{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes pkFlip{from{opacity:.2;transform:rotateY(80deg)}to{opacity:1;transform:none}}
@keyframes pkPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@media (max-width:640px){
.pk-app .game-intro h2{font-size:17px}
.pk-opps{gap:5px}
.pk-seat{padding:6px 4px;border-radius:10px}
.pk-card{width:32px;height:45px}
.pk-cards{min-height:47px}
.pk-card.pk-big{width:52px;height:73px}
.pk-slot{width:44px;height:62px}
.pk-slot .pk-card{width:42px;height:59px}
.pk-comm{gap:5px;min-height:64px}
.pk-table{padding:8px;min-height:170px}
.pk-me{gap:10px;padding:10px}
.pk-controls{min-width:100%}
.pk-btnrow{grid-template-columns:1fr 1fr}
.pk-btn{min-height:48px;font-size:14px}
.pk-ranks{grid-template-columns:1fr}
.pk-hud{gap:4px}
.pk-pill{font-size:11px;padding:3px 8px}
}
</style>
<div class="game-app pk-app">
  <div class="game-intro">
    <div><h2>Poker</h2><p>Texas Hold'em, simplified — bust every rival to clear the level.</p></div>
    <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="pk-hud">
      <span class="pk-pill" data-pill-best>Best <b data-hud="best">0</b></span>
      <span class="pk-pill"><b data-hud="level">Lv 1</b></span>
      <span class="pk-pill">Blinds <b data-hud="blinds">10/20</b></span>
      <span class="pk-pill">Hand <b data-hud="hand">0</b></span>
      <span class="pk-pill">You <b data-hud="chips">1000</b></span>
      <span class="pk-pill">Pot <b data-hud="pot">0</b></span>
      <span class="pk-pill pk-cheat" data-cheatbadge hidden>CHEATS</span>
    </div>
    <div class="pk-stage">
      <div class="pk-opps" data-opps></div>
      <div class="pk-table">
        <div class="pk-tbar"><span class="pk-stage-lab" data-stagelab>TABLE</span><span class="pk-pot" data-pot><span>Pot 0</span></span></div>
        <div class="pk-comm" data-comm></div>
        <div class="pk-log" data-log></div>
        <div class="pk-banner" data-banner hidden>
          <div class="pk-bcard">
            <div class="pk-btitle" data-btitle></div>
            <div class="pk-blines" data-blines></div>
            <button class="pk-btn pk-primary" type="button" data-act="next">Next hand ▸</button>
          </div>
        </div>
      </div>
      <div class="pk-me" data-meroot>
        <div class="pk-mecards" data-mecards></div>
        <div class="pk-meinfo">
          <div class="pk-sname"><span class="pk-dot" style="background:#4f46e5"></span><span data-mename>You</span><span class="pk-dbtn" data-medbtn hidden>D</span></div>
          <div class="pk-mchips"><b data-mechips>1000</b> chips</div>
          <div class="pk-handname" data-handname></div>
          <div class="pk-hint" data-hint></div>
          <div class="pk-bet" data-mebet></div>
        </div>
        <div class="pk-controls">
          <div class="pk-msg" data-msg>Press Start to play.</div>
          <div class="pk-raiseline" data-raiseline hidden>
            <input class="pk-slider" type="range" data-slider min="0" max="1000" value="40" step="5" aria-label="Raise amount">
            <div class="pk-presets">
              <button class="pk-preset" type="button" data-act="preset" data-set="min" disabled>Min</button>
              <button class="pk-preset" type="button" data-act="preset" data-set="half" disabled>½ pot</button>
              <button class="pk-preset" type="button" data-act="preset" data-set="pot" disabled>Pot</button>
              <button class="pk-preset" type="button" data-act="preset" data-set="max" disabled>Max</button>
            </div>
          </div>
          <div class="pk-btnrow">
            <button class="pk-btn pk-danger" type="button" data-act="fold" disabled>Fold</button>
            <button class="pk-btn pk-primary" type="button" data-act="call" disabled>Check</button>
            <button class="pk-btn pk-accent" type="button" data-act="raise" disabled>Raise</button>
            <button class="pk-btn pk-ghost" type="button" data-act="allin" disabled>All-in</button>
          </div>
        </div>
      </div>
      <div class="pk-ov" data-ov="wait" hidden><div class="pk-ovcard">
        <div class="pk-ovtitle">Connecting…</div>
        <p class="pk-ovsub" data-waitsub>Connecting to room…</p>
      </div></div>
      <div class="pk-ov" data-ov="start" hidden><div class="pk-ovcard">
        <div class="pk-ovtitle">Poker</div>
        <p class="pk-ovsub" data-levelinfo></p>
        <p class="pk-ovsub">2 cards in your hand + 5 shared cards on the table. Make the best 5-card hand, or bet until everyone folds. The hint line under your cards tells you how strong you are.</p>
        <div class="pk-ovbtns">
          <button class="pk-btn pk-accent" type="button" data-act="start" data-startbtn>Deal level 1</button>
          <button class="pk-btn" type="button" data-act="help">How to play</button>
        </div>
      </div></div>
      <div class="pk-ov" data-ov="level" hidden><div class="pk-ovcard">
        <div class="pk-ovtitle pk-good" data-leveltitle>Level cleared!</div>
        <p class="pk-ovsub" data-levelsub></p>
        <div class="pk-ovbtns"><button class="pk-btn pk-accent" type="button" data-act="level">Next level ▸</button></div>
      </div></div>
      <div class="pk-ov" data-ov="over" hidden><div class="pk-ovcard">
        <div class="pk-ovtitle" data-overtitle>Game over</div>
        <p class="pk-ovsub" data-oversub></p>
        <div class="pk-ovbtns"><button class="pk-btn pk-accent" type="button" data-act="start">Play again</button></div>
      </div></div>
      <div class="pk-ov" data-ov="help" hidden><div class="pk-ovcard">
        <div class="pk-ovtitle">How to play</div>
        <div class="pk-help">
          <h3>Goal</h3>
          <ul>
            <li>Win pots with the best hand at showdown, or by making everyone else fold.</li>
            <li>Offline: bust all rivals to clear the level. Levels are random but always winnable — your stack is at least 50 big blinds and never smaller than any rival's.</li>
            <li>Online: heads-up match, bust your opponent. Seats and the first button are drawn at random.</li>
          </ul>
          <h3>A hand in 4 steps</h3>
          <ul>
            <li><b>1 · Deal</b> — you get 2 private cards; two players post blinds (forced bets).</li>
            <li><b>2 · Bet</b> — Fold (give up), Check/Call (match the bet), Raise (slider sets the amount) or All-in.</li>
            <li><b>3 · Shared cards</b> — Flop (3 cards), Turn (1), River (1), with betting after each.</li>
            <li><b>4 · Showdown</b> — best 5-card hand from your 2 + the 5 shared cards wins. All-in players only contest chips they could match (side pots).</li>
          </ul>
          <h3>Hand rankings (strong → weak)</h3>
          <div class="pk-ranks">
            <div><b>Royal Flush</b><span>A K Q J 10, same suit</span></div>
            <div><b>Straight Flush</b><span>5 in a row, same suit</span></div>
            <div><b>Four of a Kind</b><span>4 same rank</span></div>
            <div><b>Full House</b><span>3 + 2 of a kind</span></div>
            <div><b>Flush</b><span>5 same suit</span></div>
            <div><b>Straight</b><span>5 in a row</span></div>
            <div><b>Three of a Kind</b><span>3 same rank</span></div>
            <div><b>Two Pair</b><span>2 + 2 same rank</span></div>
            <div><b>Pair</b><span>2 same rank</span></div>
            <div><b>High Card</b><span>nothing above</span></div>
          </div>
          <h3>Controls</h3>
          <ul>
            <li>Mouse / touch: big buttons under your cards; drag the slider or tap Min / ½ pot / Pot / Max.</li>
            <li>Keyboard: <kbd>F</kbd> fold · <kbd>C</kbd> check/call · <kbd>R</kbd> raise · <kbd>A</kbd> all-in · <kbd>←</kbd><kbd>→</kbd> adjust raise (<kbd>Shift</kbd> ×10) · <kbd>N</kbd>/<kbd>Space</kbd> next hand · <kbd>H</kbd> help · <kbd>X</kbd> cheats · <kbd>Esc</kbd> close.</li>
            <li>Mouse wheel over the slider also adjusts the raise.</li>
          </ul>
          <h3>Tips</h3>
          <ul>
            <li>Follow the hint under your cards — it grades your hand and suggests an action.</li>
            <li>Play weak hands cheaply and strong hands aggressively; that alone beats most bots.</li>
            <li>Cheats (offline only) reveal bot cards, rig a royal flush and more — see the Cheats button.</li>
          </ul>
        </div>
        <div class="pk-ovbtns" style="margin-top:14px"><button class="pk-btn pk-primary" type="button" data-act="closeov">Got it</button></div>
      </div></div>
      <div class="pk-ov" data-ov="cheats" hidden><div class="pk-ovcard">
        <div class="pk-ovtitle">Cheats</div>
        <label class="pk-cheatrow"><input type="checkbox" data-cheat="peek"><span><b>X-ray vision</b><small>See every bot's cards and a power score.</small></span></label>
        <label class="pk-cheatrow"><input type="checkbox" data-cheat="rig"><span><b>Rig next deal</b><small>Your next hand is dealt a royal flush (one-shot).</small></span></label>
        <label class="pk-cheatrow"><input type="checkbox" data-cheat="timid"><span><b>Timid bots</b><small>Bots never raise and fold to any bet.</small></span></label>
        <label class="pk-cheatrow"><input type="checkbox" data-cheat="turbo"><span><b>Turbo</b><small>Almost no dealing / thinking delays.</small></span></label>
        <div class="pk-ovbtns" style="margin-top:12px">
          <button class="pk-btn" type="button" data-act="addchips" data-addchips>+1,000 chips</button>
          <button class="pk-btn pk-danger" type="button" data-act="forcefold" data-forcefold>Force bots to fold</button>
        </div>
        <p class="pk-cheatnote">Using any cheat stops best-level recording for this run. Offline only.</p>
        <div class="pk-ovbtns"><button class="pk-btn pk-primary" type="button" data-act="closeov">Close</button></div>
      </div></div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button pk-btn pk-ghost" type="button" data-act="restart" data-restart>Restart</button>
    <button class="game-action-button pk-btn pk-ghost" type="button" data-act="help">How to play</button>
    <button class="game-action-button pk-btn pk-ghost" type="button" data-act="cheats" data-cheatsbtn>Cheats</button>
    <button class="game-action-button pk-btn" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]"), dotEl = $("[data-dot]");
    const hudLevel = $('[data-hud="level"]'), hudBlinds = $('[data-hud="blinds"]');
    const hudHand = $('[data-hud="hand"]'), hudChips = $('[data-hud="chips"]');
    const hudPot = $('[data-hud="pot"]'), hudBest = $('[data-hud="best"]');
    const bestPill = $("[data-pill-best]"), cheatBadge = $("[data-cheatbadge]");
    const oppsEl = $("[data-opps]"), stageLabEl = $("[data-stagelab]"), potEl = $("[data-pot]");
    const commEl = $("[data-comm]"), logEl = $("[data-log]");
    const bannerEl = $("[data-banner]"), bTitleEl = $("[data-btitle]"), bLinesEl = $("[data-blines]");
    const meRoot = $("[data-meroot]"), meCards = $("[data-mecards]"), meNameEl = $("[data-mename]");
    const meDbtn = $("[data-medbtn]"), meChips = $("[data-mechips]"), meBet = $("[data-mebet]");
    const handNameEl = $("[data-handname]"), hintEl = $("[data-hint]");
    const msgEl = $("[data-msg]"), raiseLine = $("[data-raiseline]"), slider = $("[data-slider]");
    const presetBtns = Array.from(root.querySelectorAll(".pk-preset"));
    const btnFold = $('[data-act="fold"]'), btnCall = $('[data-act="call"]');
    const btnRaise = $('[data-act="raise"]'), btnJam = $('[data-act="allin"]');
    const ovEls = {
        wait: $('[data-ov="wait"]'), start: $('[data-ov="start"]'), level: $('[data-ov="level"]'),
        over: $('[data-ov="over"]'), help: $('[data-ov="help"]'), cheats: $('[data-ov="cheats"]'),
    };
    const waitSubEl = $("[data-waitsub]"), levelInfoEl = $("[data-levelinfo]"), startBtn = $("[data-startbtn]");
    const levelTitleEl = $("[data-leveltitle]"), levelSubEl = $("[data-levelsub]");
    const overTitleEl = $("[data-overtitle]"), overSubEl = $("[data-oversub]");
    const restartBtn = $("[data-restart]"), cheatsBtn = $("[data-cheatsbtn]");
    const cheatInputs = Array.from(root.querySelectorAll("input[data-cheat]"));
    const addChipsBtn = $("[data-addchips]"), forceFoldBtn = $("[data-forcefold]");

    const commSlots = [];
    for (let k = 0; k < 5; k++) {
        const d = document.createElement("div");
        d.className = "pk-slot";
        commEl.appendChild(d);
        commSlots.push(d);
    }

    /* ---------- timers (host / offline only) ---------- */
    const timers = new Set();
    function later(ms, fn) {
        const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
        timers.add(id);
    }
    function clearTimers() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
    }

    /* ---------- best level (localStorage, guarded) ---------- */
    function readBest() {
        try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { return 0; }
    }
    function writeBest(v) {
        try { localStorage.setItem(META.bestKey, String(v)); } catch (e) { }
    }
    let best = readBest();

    /* ---------- engine ---------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(game.state).catch(console.warn);
    }
    const game = createGame({
        online,
        hostName: playerName,
        rng: Math.random,
        publish,
        later,
        clearTimers,
        onLevelClear(num, cheated) {
            if (!cheated && num > best) { best = num; writeBest(best); }
        },
    });

    /* ---------- UI-local state ---------- */
    let helpOpen = false, cheatsOpen = false;
    let raiseVal = 0, turnKey = "";
    let seatRefs = [], structureSig = "";
    let meCardSig = "e", meBetSig = -1, logSig = "";
    const mySeatOf = (S) => (online ? (S.seatMap[playerIndex] || 0) : 0);
    const inHandP = (p) => !p.out && !p.folded;
    function setOv(name) {
        Object.keys(ovEls).forEach((k) => { ovEls[k].hidden = k !== name; });
    }

    /* ---------- rendering ---------- */
    function buildSeats(S, mySeat) {
        oppsEl.innerHTML = "";
        seatRefs = [];
        S.players.forEach((p, i) => {
            if (i === mySeat) return;
            const el = document.createElement("div");
            el.className = "pk-seat";
            const nameRow = document.createElement("div"); nameRow.className = "pk-sname";
            const dot = document.createElement("span"); dot.className = "pk-dot"; dot.style.background = p.color;
            const nm = document.createElement("span"); nm.textContent = p.name;
            const db = document.createElement("span"); db.className = "pk-dbtn"; db.textContent = "D"; db.hidden = true;
            nameRow.appendChild(dot); nameRow.appendChild(nm); nameRow.appendChild(db);
            const cards = document.createElement("div"); cards.className = "pk-cards";
            const chips = document.createElement("div"); chips.className = "pk-schips";
            const chipsB = document.createElement("b");
            chips.appendChild(chipsB); chips.appendChild(document.createTextNode(" chips"));
            const bet = document.createElement("div"); bet.className = "pk-bet";
            const status = document.createElement("div"); status.className = "pk-status";
            el.appendChild(nameRow); el.appendChild(cards); el.appendChild(chips);
            el.appendChild(bet); el.appendChild(status);
            oppsEl.appendChild(el);
            seatRefs[i] = { root: el, cards, chips: chipsB, bet, status, dbtn: db, cardSig: "e", betSig: -1 };
        });
    }

    function renderOpp(i, S) {
        const p = S.players[i], r = seatRefs[i];
        if (!r) return;
        r.root.classList.toggle("folded", p.folded && !p.out);
        r.root.classList.toggle("out", p.out);
        r.root.classList.toggle("acting", S.phase === "betting" && S.turnIdx === i);
        r.chips.textContent = String(p.chips);
        r.dbtn.hidden = i !== S.dealerIdx || S.phase === "idle";
        if (r.betSig !== p.betRound) {
            r.betSig = p.betRound;
            r.bet.innerHTML = p.betRound > 0 ? chipSVG(p.betRound, false) : "";
        }
        const peek = !online && S.cheats.peek && p.ai;
        let st = "";
        if (p.out) st = "Busted";
        else if (p.folded) st = "Folded";
        else if (p.showed && p.hole.length + S.community.length >= 5) st = evalBest(p.hole.concat(S.community)).name;
        else if (p.allIn) st = "All-in";
        else if (peek && p.hole.length) st = "Power " + Math.round(strengthOf(p.hole.concat(S.community)) * 100) + "%";
        else if (p.ai && p.style) st = p.style.label;
        r.status.textContent = st;
        const face = p.showed || peek;
        const key = p.hole.length
            ? p.hole.map((c) => c.r + "." + c.s).join(",") + ":" + (face ? "F" : "B")
            : "e";
        if (key !== r.cardSig) {
            r.cardSig = key;
            if (key === "e") r.cards.innerHTML = "";
            else r.cards.innerHTML = p.hole.map((c, k) => face
                ? cardSVG(c, true, p.showed ? "pk-flip" : "", k * 100, false)
                : cardSVG(null, false, "pk-in", 120 + p.dealPos * 70 + k * 260, false)).join("");
        }
    }

    function advice(p, S) {
        const all = p.hole.concat(S.community);
        if (all.length < 5) {
            const s = holeStrength(p.hole);
            if (s >= 0.20) return { txt: "Premium - raise it", cls: "pk-good" };
            if (s >= 0.15) return { txt: "Good - call or raise", cls: "pk-good" };
            if (s >= 0.115) return { txt: "Playable - see a cheap flop", cls: "pk-mid" };
            return { txt: "Weak - fold to pressure", cls: "pk-bad" };
        }
        const s = strengthOf(all);
        if (s >= 0.60) return { txt: "Monster - raise big", cls: "pk-good" };
        if (s >= 0.42) return { txt: "Strong - raise", cls: "pk-good" };
        if (s >= 0.28) return { txt: "Good - call, raise if cheap", cls: "pk-good" };
        if (s >= 0.17) return { txt: "Okay - call small bets", cls: "pk-mid" };
        if (s >= 0.12) return { txt: "Weak - check or fold", cls: "pk-bad" };
        return { txt: "Very weak - fold to any bet", cls: "pk-bad" };
    }

    function renderMe(mySeat, S) {
        const p = S.players[mySeat];
        meRoot.classList.toggle("folded", p.folded && !p.out);
        meRoot.classList.toggle("out", p.out);
        meRoot.classList.toggle("acting", S.phase === "betting" && S.turnIdx === mySeat);
        meNameEl.textContent = p.name;
        meChips.textContent = String(p.chips);
        meDbtn.hidden = mySeat !== S.dealerIdx || S.phase === "idle";
        if (meBetSig !== p.betRound) {
            meBetSig = p.betRound;
            meBet.innerHTML = p.betRound > 0 ? chipSVG(p.betRound, true) : "";
        }
        const key = p.hole.length ? p.hole.map((c) => c.r + "." + c.s).join(",") : "e";
        if (key !== meCardSig) {
            meCardSig = key;
            meCards.innerHTML = key === "e" ? "" :
                p.hole.map((c, k) => cardSVG(c, true, "pk-in", 120 + p.dealPos * 70 + k * 260, true)).join("");
        }
        let hn = "", hint = "", hcls = "";
        if (p.hole.length && !p.out) {
            const all = p.hole.concat(S.community);
            if (all.length >= 5) hn = evalBest(all).name;
            else {
                const a = p.hole[0], b = p.hole[1];
                const hi = Math.max(a.r, b.r), lo = Math.min(a.r, b.r);
                hn = a.r === b.r ? "Pocket " + plural(a.r)
                    : RNAME[hi] + "-" + RNAME[lo] + (a.s === b.s ? " suited" : "");
            }
            if (!p.folded && S.phase !== "over") {
                const adv = advice(p, S);
                hint = adv.txt; hcls = adv.cls;
            }
        }
        handNameEl.textContent = hn;
        hintEl.textContent = hint;
        hintEl.className = "pk-hint " + hcls;
    }

    function renderComm(S, pot) {
        for (let k = 0; k < 5; k++) {
            const slot = commSlots[k];
            if (k < S.community.length) {
                const c = S.community[k];
                const key = c.r + "." + c.s;
                if (slot.dataset.k !== key) {
                    slot.dataset.k = key;
                    slot.innerHTML = cardSVG(c, true, "pk-flip", 0, false);
                }
            } else if (slot.dataset.k) {
                slot.dataset.k = "";
                slot.innerHTML = "";
            }
        }
        potEl.innerHTML = (pot > 0 ? chipSVG(pot, true) : "") + "<span>Pot " + pot + "</span>";
        stageLabEl.textContent = S.phase === "showdown" ? "SHOWDOWN" : (STAGE_LABEL[S.stage] || "TABLE");
    }

    function renderLog(S) {
        const sig = S.log.length + ":" + (S.log[0] ? S.log[0].m : "");
        if (sig === logSig) return;
        logSig = sig;
        logEl.innerHTML = "";
        S.log.forEach((en) => {
            const d = document.createElement("div");
            if (en.c) d.className = "pk-l-" + en.c;
            d.textContent = en.m;
            logEl.appendChild(d);
        });
    }

    function renderBanner(S) {
        const showB = S.phase === "handEnd" && S.banner;
        bannerEl.hidden = !showB;
        if (showB) {
            bTitleEl.textContent = S.banner.title;
            bLinesEl.innerHTML = "";
            S.banner.lines.forEach((ln) => {
                const d = document.createElement("div");
                d.textContent = ln;
                bLinesEl.appendChild(d);
            });
        }
    }

    function currentMsg(S, mySeat) {
        if (S.phase === "idle") return online ? "Press Start when both players are ready." : "Press Start to deal level 1.";
        if (S.phase === "dealing") return "Dealing hole cards...";
        if (S.phase === "reveal") return "Dealing the " + S.stage + "...";
        if (S.phase === "betting") {
            const p = S.players[S.turnIdx];
            if (!p) return "";
            if (S.turnIdx === mySeat) {
                const tc = Math.max(0, S.curBet - p.betRound);
                return tc <= 0 ? "Your turn - check or bet" : "Your turn - call " + tc + ", raise or fold";
            }
            return p.name + " is thinking...";
        }
        if (S.phase === "showdown") return "Showdown!";
        if (S.phase === "handEnd") return "Hand over - press Next hand (N)";
        if (S.phase === "levelEnd") return "Level cleared!";
        return "";
    }

    function renderControls(S, mySeat, pot) {
        const p = S.players[mySeat];
        const L = legalMoves(S, mySeat);
        const myTurn = S.phase === "betting" && S.turnIdx === mySeat && !p.folded && !p.allIn && !p.out;
        const tk = S.handNum + "/" + S.stage + "/" + S.curBet + "/" + S.turnIdx + "/" + p.chips;
        if (tk !== turnKey) {
            turnKey = tk;
            raiseVal = Math.min(L.maxTo, Math.max(L.minTo, S.curBet + Math.max(S.minRaise, Math.round(pot * 0.66))));
        }
        raiseVal = Math.min(L.maxTo, Math.max(L.minTo, raiseVal));
        slider.min = String(L.minTo);
        slider.max = String(Math.max(L.minTo, L.maxTo));
        slider.step = String(Math.max(1, Math.round(S.level.sb / 2)));
        slider.value = String(raiseVal);
        const canRaise = myTurn && L.canRaise;
        raiseLine.hidden = !canRaise;
        btnFold.disabled = !myTurn;
        btnCall.disabled = !myTurn;
        btnCall.textContent = L.toCall <= 0 ? "Check"
            : (L.toCall >= p.chips ? "Call " + p.chips + " (all-in)" : "Call " + L.toCall);
        btnRaise.disabled = !canRaise;
        btnRaise.textContent = canRaise ? (S.curBet > 0 ? "Raise to " + raiseVal : "Bet " + raiseVal) : "Raise";
        btnJam.disabled = !myTurn || p.chips <= L.toCall;
        btnJam.textContent = myTurn ? "All-in " + L.maxTo : "All-in";
        presetBtns.forEach((b) => { b.disabled = !canRaise; });
        msgEl.textContent = currentMsg(S, mySeat);
    }

    function renderOverlays(S, mySeat) {
        if (online) {
            const opp = S.players[1 - mySeat];
            levelInfoEl.textContent = "Heads-up vs " + opp.name + " · blinds 10/20 · 1000 chips each. Seats are drawn at random every match.";
            startBtn.textContent = "Start match";
        } else {
            const lv = S.level;
            levelInfoEl.textContent = "Level " + lv.num + " · " + lv.rivals.length + " rival(s) · blinds " +
                lv.sb + "/" + lv.bb + " · you start with " + lv.playerChips + " chips.";
            startBtn.textContent = "Deal level 1";
        }
        levelTitleEl.textContent = "Level " + S.level.num + " cleared!";
        levelSubEl.textContent = "Next level: higher blinds, fresh random rivals. Your stack carries over (with a guaranteed top-up, so every level stays winnable).";
        if (S.over) {
            if (online) {
                const iWon = S.over.winSeat === mySeat;
                overTitleEl.textContent = iWon ? "You win the match!"
                    : (S.players[S.over.winSeat] ? S.players[S.over.winSeat].name + " wins the match" : "Match over");
                overSubEl.textContent = "Hands played: " + S.handNum + ". A rematch redraws seats and the button.";
                overTitleEl.className = "pk-ovtitle " + (iWon ? "pk-good" : "pk-bad");
            } else {
                overTitleEl.textContent = "You busted";
                overSubEl.textContent = (S.over.reason || "") + " Reached level " + S.level.num + " · " +
                    S.handNum + " hands · best level " + best + ".";
                overTitleEl.className = "pk-ovtitle pk-bad";
            }
        }
        let ov = null;
        if (helpOpen) ov = "help";
        else if (cheatsOpen && !online) ov = "cheats";
        else if (S.phase === "idle") ov = "start";
        else if (S.phase === "levelEnd") ov = "level";
        else if (S.phase === "over") ov = "over";
        setOv(ov);
        restartBtn.hidden = online && !room.isHost;
        cheatsBtn.hidden = online;
    }

    function renderCheats(S) {
        if (online) return;
        cheatInputs.forEach((inp) => { inp.checked = !!S.cheats[inp.dataset.cheat]; });
        forceFoldBtn.disabled = !(S.phase === "betting" && inHandP(S.players[0]));
        addChipsBtn.disabled = S.phase === "over";
    }

    function renderStatus(S, mySeat) {
        let txt = "Ready", col = "#94a3b8";
        if (S.phase === "betting") {
            if (S.turnIdx === mySeat) { txt = "Your turn"; col = "#059669"; }
            else { txt = (S.players[S.turnIdx] ? S.players[S.turnIdx].name : "Opponent") + " thinking"; col = "#d97706"; }
        } else if (S.phase === "dealing" || S.phase === "reveal") { txt = "Dealing"; col = "#d97706"; }
        else if (S.phase === "showdown") { txt = "Showdown"; col = "#4f46e5"; }
        else if (S.phase === "handEnd") { txt = "Hand over"; col = "#64748b"; }
        else if (S.phase === "levelEnd") { txt = "Level cleared"; col = "#059669"; }
        else if (S.phase === "over") {
            const win = online ? (S.over && S.over.winSeat === mySeat) : (S.over && S.over.win);
            txt = win ? "You win" : "Game over";
            col = win ? "#059669" : "#dc2626";
        }
        statusEl.textContent = (online ? (room.isHost ? "Host · " : "Guest · ") : "") + txt;
        dotEl.style.background = col;
    }

    function render() {
        const S = game.state;
        if (!S) {
            setOv("wait");
            waitSubEl.textContent = roomData ? "Connected - waiting for the host to deal." : "Connecting to room...";
            statusEl.textContent = "Waiting for host...";
            dotEl.style.background = "#94a3b8";
            return;
        }
        const mySeat = mySeatOf(S);
        const meP = S.players[mySeat];
        const pot = S.players.reduce((s, p) => s + p.contributed, 0);
        hudLevel.textContent = online ? "Match" : "Lv " + S.level.num;
        hudBlinds.textContent = S.level.sb + "/" + S.level.bb;
        hudHand.textContent = String(S.handNum);
        hudChips.textContent = String(meP.chips);
        hudPot.textContent = String(pot);
        hudBest.textContent = String(best);
        bestPill.hidden = online;
        cheatBadge.hidden = online ||
            !(S.cheatsUsed || S.cheats.peek || S.cheats.rig || S.cheats.timid || S.cheats.turbo);
        const sig = S.players.map((p) => p.name + (p.ai ? "a" : "h")).join("|") + ":" + mySeat;
        if (sig !== structureSig) { structureSig = sig; buildSeats(S, mySeat); }
        for (let i = 0; i < S.players.length; i++) if (i !== mySeat) renderOpp(i, S);
        renderMe(mySeat, S);
        renderComm(S, pot);
        renderLog(S);
        renderBanner(S);
        renderControls(S, mySeat, pot);
        renderOverlays(S, mySeat);
        renderCheats(S);
        renderStatus(S, mySeat);
    }

    /* ---------- actions & events ---------- */
    function submitAction(a) {
        if (online && !room.isHost) { room.sendAction(a).catch(console.warn); return; }
        game.applyAction(a, playerIndex);
    }
    function updateRaiseLabel(S) {
        btnRaise.textContent = S.curBet > 0 ? "Raise to " + raiseVal : "Bet " + raiseVal;
    }
    function setRaise(kind) {
        const S = game.state;
        if (!S) return;
        const L = legalMoves(S, mySeatOf(S));
        let v;
        if (kind === "min") v = L.minTo;
        else if (kind === "half") v = S.curBet + Math.max(S.minRaise, Math.round(L.pot * 0.5));
        else if (kind === "pot") v = S.curBet + Math.max(S.minRaise, L.pot);
        else v = L.maxTo;
        raiseVal = Math.min(L.maxTo, Math.max(L.minTo, v));
        slider.value = String(raiseVal);
        updateRaiseLabel(S);
    }

    function handleClick(e) {
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const inp = e.target.closest("input[data-cheat]");
        if (inp) { game.setCheat(inp.dataset.cheat, inp.checked); return; }
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        const act = b.dataset.act;
        if (!act) return;
        if (act === "start") submitAction({ t: "start" });
        else if (act === "restart") submitAction({ t: "restart" });
        else if (act === "next") submitAction({ t: "next" });
        else if (act === "level") submitAction({ t: "level" });
        else if (act === "fold" || act === "call" || act === "allin") submitAction({ t: "act", kind: act });
        else if (act === "raise") submitAction({ t: "act", kind: "raise", to: raiseVal });
        else if (act === "preset") setRaise(b.dataset.set);
        else if (act === "help") { helpOpen = !helpOpen; cheatsOpen = false; render(); }
        else if (act === "cheats") { cheatsOpen = !cheatsOpen; helpOpen = false; render(); }
        else if (act === "closeov") { helpOpen = false; cheatsOpen = false; render(); }
        else if (act === "addchips") game.addChips();
        else if (act === "forcefold") game.forceFold();
    }
    function handleInput(e) {
        if (e.target === slider) {
            raiseVal = Number(slider.value) || 0;
            const S = game.state;
            if (S) updateRaiseLabel(S);
        }
    }
    function handleWheel(e) {
        if (e.target !== slider || raiseLine.hidden) return;
        e.preventDefault();
        const S = game.state;
        if (!S) return;
        const L = legalMoves(S, mySeatOf(S));
        const step = Math.max(1, Math.round(S.level.sb / 2)) * (e.shiftKey ? 10 : 1);
        raiseVal = Math.min(L.maxTo, Math.max(L.minTo, raiseVal + (e.deltaY < 0 ? step : -step)));
        slider.value = String(raiseVal);
        updateRaiseLabel(S);
    }
    function handleKey(e) {
        if (!e.key) return;
        const t = e.target;
        const tag = t && t.tagName ? t.tagName.toUpperCase() : "";
        if (tag === "TEXTAREA" || (tag === "INPUT" && t !== slider) || (t && t.isContentEditable)) return;
        const k = e.key.toLowerCase();
        if (k === "escape") {
            if (helpOpen || cheatsOpen) { helpOpen = false; cheatsOpen = false; render(); e.preventDefault(); }
            return;
        }
        if (k === "h" || e.key === "?") { helpOpen = !helpOpen; cheatsOpen = false; render(); e.preventDefault(); return; }
        if (k === "x" && !online) { cheatsOpen = !cheatsOpen; helpOpen = false; render(); e.preventDefault(); return; }
        if (helpOpen || cheatsOpen) return;
        const S = game.state;
        if (!S) return;
        const mySeat = mySeatOf(S);
        if (S.phase === "betting" && S.turnIdx === mySeat) {
            const L = legalMoves(S, mySeat);
            if (k === "f") { e.preventDefault(); submitAction({ t: "act", kind: "fold" }); }
            else if (k === "c") { e.preventDefault(); submitAction({ t: "act", kind: "call" }); }
            else if (k === "r") { if (L.canRaise) { e.preventDefault(); submitAction({ t: "act", kind: "raise", to: raiseVal }); } }
            else if (k === "a") { e.preventDefault(); submitAction({ t: "act", kind: "allin" }); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                if (t === slider) return; /* native range handling */
                if (L.canRaise) {
                    e.preventDefault();
                    const step = Math.max(1, Math.round(S.level.sb / 2)) * (e.shiftKey ? 10 : 1);
                    raiseVal = Math.min(L.maxTo, Math.max(L.minTo, raiseVal + (e.key === "ArrowRight" ? step : -step)));
                    slider.value = String(raiseVal);
                    updateRaiseLabel(S);
                }
            }
        } else if (S.phase === "handEnd" && (k === "n" || e.code === "Space" || k === "enter")) {
            e.preventDefault(); submitAction({ t: "next" });
        } else if (S.phase === "idle" && (k === "enter" || e.code === "Space")) {
            e.preventDefault(); submitAction({ t: "start" });
        } else if (S.phase === "levelEnd" && (k === "n" || k === "enter" || e.code === "Space")) {
            e.preventDefault(); submitAction({ t: "level" });
        } else if (S.phase === "over" && (k === "enter" || e.code === "Space")) {
            e.preventDefault(); submitAction({ t: "start" });
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleKey);

    /* ---------- room wiring (template contract) ---------- */
    const offs = [];
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            game.init(); /* publish() sends the initial canonical state */
            offs.push(room.onAction((action) => game.applyAction(action, 1)));
        } else {
            offs.push(room.onState((nextState) => { game.setState(nextState); render(); }));
            room.sendAction({ t: "hello", name: playerName }).catch(console.warn);
            render();
        }
    } else {
        game.init(); /* local AI mode — no room/database needed */
    }

    return {
        destroy() {
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("input", handleInput);
            root.removeEventListener("wheel", handleWheel);
            document.removeEventListener("keydown", handleKey);
            offs.forEach((fn) => { if (typeof fn === "function") fn(); });
            root.innerHTML = "";
        },
    };
}

/* exposed for unit tests / tooling (not used by the app) */
export const _test = {
    makeDeck, shuffle, eval5, evalBest, compareHands,
    holeStrength, strengthOf, aiDecide, AI_STYLES, AI_POOL,
    genLevel, computePots, legalMoves, createGame,
};