/* ==== games/monopoly.js ==== */
import { iconSVG } from "../JS/icons.js";
/* Monopoly — random city edition.
   Template-compliant: export META + export mount(root, context).
   Host-authoritative state machine: every mutation goes through coreApply(),
   so the exact same rules run in local (vs AI) and online room mode. */

export const META = {
    id: "monopoly", // must match filename (monopoly.js)
    name: "Monopoly",
    category: "board",
    catLabel: "Board",
    desc: "Buy streets, build houses & hotels, draw cards and bankrupt your rivals on a random city board.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 42V22L24 10l14 12v20"/><path d="M18 42V29h12v13"/><path d="M6 42h36"/></svg>',
    bg: ["#fde68a", "#f59e0b"],
};

/* ================= pure core (no DOM) ================= */
const DENOMS = [500, 100, 50, 20, 10, 5, 1];
const GROUPS = [
    { n: "Brown", c: "#a1887f" }, { n: "Sky", c: "#4dd0e1" },
    { n: "Rose", c: "#f06292" }, { n: "Amber", c: "#ffb74d" },
    { n: "Red", c: "#e57373" }, { n: "Gold", c: "#ffd54f" },
    { n: "Green", c: "#81c784" }, { n: "Indigo", c: "#7986cb" },
];
const HC = [50, 50, 100, 100, 150, 150, 200, 200]; // house cost per group
const MULT = [ // rent multipliers: [h1,h2,h3,h4,hotel] x base rent
    [5, 15, 45, 80, 125], [5, 15, 45, 67, 92], [5, 15, 45, 62, 75],
    [5, 14, 39, 54, 68], [5, 14, 39, 49, 58], [5, 15, 36, 44, 52],
    [5, 15, 35, 42, 49], [5, 14, 31, 37, 43],
];
const DIFFS = {
    easy: { label: "Easy", cash: 1800, reserve: 260, buildMin: 520, cap: 1 },
    normal: { label: "Normal", cash: 1500, reserve: 160, buildMin: 360, cap: 2 },
    hard: { label: "Hard", cash: 1200, reserve: 90, buildMin: 230, cap: 3 },
};
const SEATC = ["#818cf8", "#f472b6", "#fbbf24"];
/* classic 40-tile skeleton; names/prices/taxes/decks are randomized per seed */
const SKEL = [
    { t: "go" },
    { t: "prop", g: 0, price: 60, rent: 2 }, { t: "chest" },
    { t: "prop", g: 0, price: 60, rent: 4, m: [5, 15, 45, 80, 112] },
    { t: "tax", base: 100 }, { t: "rail" },
    { t: "prop", g: 1, price: 100, rent: 6 }, { t: "chance" },
    { t: "prop", g: 1, price: 100, rent: 6 }, { t: "prop", g: 1, price: 120, rent: 8 },
    { t: "jail" },
    { t: "prop", g: 2, price: 140, rent: 10 }, { t: "util", name: "Electric Co." },
    { t: "prop", g: 2, price: 140, rent: 10 }, { t: "prop", g: 2, price: 160, rent: 12 },
    { t: "rail" },
    { t: "prop", g: 3, price: 180, rent: 14 }, { t: "chest" },
    { t: "prop", g: 3, price: 180, rent: 14 }, { t: "prop", g: 3, price: 200, rent: 16 },
    { t: "park" },
    { t: "prop", g: 4, price: 220, rent: 18 }, { t: "chance" },
    { t: "prop", g: 4, price: 220, rent: 18 }, { t: "prop", g: 4, price: 240, rent: 20 },
    { t: "rail" },
    { t: "prop", g: 5, price: 260, rent: 22 }, { t: "prop", g: 5, price: 260, rent: 22 },
    { t: "util", name: "Water Works" }, { t: "prop", g: 5, price: 280, rent: 24 },
    { t: "gotojail" },
    { t: "prop", g: 6, price: 300, rent: 26 }, { t: "prop", g: 6, price: 300, rent: 26 },
    { t: "chest" }, { t: "prop", g: 6, price: 320, rent: 28 }, { t: "rail" },
    { t: "chance" }, { t: "prop", g: 7, price: 350, rent: 35 },
    { t: "tax", base: 75 }, { t: "prop", g: 7, price: 400, rent: 50, m: [4, 12, 28, 34, 40] },
];
const PREFIX = ["Oak", "Elm", "Ash", "Birch", "Cedar", "Maple", "Willow", "Aspen", "Alder", "Briar", "Coral", "Dune", "Echo", "Flint", "Grove", "Harbor", "Ivory", "Juniper", "Kestrel", "Lark", "Mesa", "North", "Onyx", "Pine", "Quartz", "River", "Sage", "Terra", "Umber", "Vale", "Walnut", "Zephyr", "Amber", "Basalt", "Cinder", "Dale"];
const SUFFIX = ["St", "Ave", "Rd", "Ln", "Way", "Blvd", "Ct", "Pl"];
const RAILS = ["North Line", "East Line", "South Line", "West Line"];
const CHANCE = [
    { txt: "Advance to GO. Collect $200.", go: 1 },
    { txt: "Bank pays you a dividend of $50.", money: 50 },
    { txt: "Speeding fine. Pay $15.", money: -15 },
    { txt: "Go directly to Jail. Do not pass GO.", jail: 1 },
    { txt: "Ride to the nearest railroad. Pay double rent.", rail: 1 },
    { txt: "Advance to the nearest utility. Pay 10x your dice.", util: 1 },
    { txt: "Your building loan matures. Collect $150.", money: 150 },
    { txt: "General repairs: pay $25 per house, $100 per hotel.", repair: [25, 100] },
    { txt: "Go back 3 spaces.", back: 3 },
    { txt: "Elected chairman. Pay each player $50.", each: -50 },
    { txt: "Crossword champion. Collect $100.", money: 100 },
    { txt: "Get out of Jail free. Keep this card.", free: 1 },
];
const CHEST = [
    { txt: "Advance to GO. Collect $200.", go: 1 },
    { txt: "Bank error in your favor. Collect $200.", money: 200 },
    { txt: "Doctor's fee. Pay $50.", money: -50 },
    { txt: "From sale of stock you get $50.", money: 50 },
    { txt: "Get out of Jail free. Keep this card.", free: 1 },
    { txt: "Go directly to Jail. Do not pass GO.", jail: 1 },
    { txt: "Holiday fund matures. Collect $100.", money: 100 },
    { txt: "Income tax refund. Collect $20.", money: 20 },
    { txt: "It's your birthday. Collect $10 from each player.", each: 10 },
    { txt: "Life insurance matures. Collect $100.", money: 100 },
    { txt: "Hospital fees. Pay $100.", money: -100 },
    { txt: "Street repairs: pay $40 per house, $115 per hotel.", repair: [40, 115] },
];

/* seeded RNG (mulberry32 step) — stored in state so replays/sync stay deterministic */
function rand(s) {
    let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (s, n) => (rand(s) * n) | 0;
const die = (s) => 1 + ri(s, 6);
function shuffle(s, a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = ri(s, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}
const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);

/* ---- random level generator (balanced + always finishable) ---- */
function makeTiles(s, exact) {
    const names = shuffle(s, PREFIX.slice());
    const rails = shuffle(s, RAILS.slice());
    let pi = 0, rj = 0;
    return SKEL.map((d) => {
        const t = Object.assign({}, d, { owner: null, level: 0 });
        delete t.base; delete t.m;
        if (d.t === "prop") {
            t.name = names[pi++] + " " + SUFFIX[ri(s, SUFFIX.length)];
            t.price = exact ? d.price : round5(d.price * (0.9 + rand(s) * 0.2));
            t.hc = HC[d.g];
            const m = d.m || MULT[d.g];
            t.rt = [d.rent, d.rent * 2].concat(m.map((x) => round5(d.rent * x)));
        } else if (d.t === "rail") {
            t.name = rails[rj++];
            t.price = exact ? 200 : round5(200 * (0.9 + rand(s) * 0.2));
        } else if (d.t === "util") {
            t.price = exact ? 150 : round5(150 * (0.9 + rand(s) * 0.2));
        } else if (d.t === "tax") {
            t.name = d.base >= 100 ? "Income Tax" : "City Tax";
            t.amt = exact ? d.base : round5(d.base * (0.8 + rand(s) * 0.4));
        } else {
            t.name = { go: "GO", jail: "Jail", park: "Free Parking", gotojail: "Go To Jail", chance: "Chance", chest: "Community Chest" }[d.t];
        }
        return t;
    });
}
/* solvability constraints: full sets exist, prices affordable, rents sane,
   taxes below GO salary. Liquidation + asset transfer + turn cap (below)
   guarantee every generated game can actually be finished. */
function validateTiles(ts, cash) {
    if (ts.length !== 40) return false;
    const cnt = {};
    ts.forEach((t) => (cnt[t.t] = (cnt[t.t] || 0) + 1));
    if (cnt.prop !== 22 || cnt.rail !== 4 || cnt.util !== 2 || cnt.chance !== 3 || cnt.chest !== 3 || cnt.tax !== 2) return false;
    const gs = {};
    ts.forEach((t) => { if (t.t === "prop") gs[t.g] = (gs[t.g] || 0) + 1; });
    if (Object.keys(gs).length !== 8 || Object.values(gs).some((n) => n < 2)) return false;
    for (const t of ts) {
        if (t.t === "prop") {
            if (t.price < 40 || t.price > cash / 2) return false;
            for (let k = 1; k < t.rt.length; k++) if (t.rt[k] <= t.rt[k - 1]) return false;
            if (t.rt[6] > 2200) return false;
        }
        if (t.t === "tax" && t.amt >= 200) return false;
    }
    return true;
}

function lobbyState(online) {
    return {
        v: 1, online: !!online, phase: "lobby", seq: 0, rng: 0, seed: 0,
        difficulty: "normal", tiles: null, players: null, seatActor: null, names: null,
        turn: 0, dice: [1, 1], rollId: 0, dbl: 0, curDbl: false, pot: 0, turns: 0,
        deckC: null, deckK: null, iC: 0, iK: 0, card: null, pending: null, mod: null,
        log: [], fxq: [], toast: null, auto: null, wait: 0, winner: null, reason: "",
        cheat: { free: false, rig: null },
    };
}
function log(s, t, k) { s.log.unshift({ t, k: k || "" }); if (s.log.length > 26) s.log.pop(); }
function toast(s, text, kind) { s.toast = { id: ++s.seq, text, kind: kind || "" }; }
function fx(s, seat, delta) {
    s.fxq.push({ id: ++s.seq, seat, delta });
    if (s.fxq.length > 8) s.fxq.shift();
}
const isAI = (s, seat) => s.seatActor[seat] === 2;
const aliveSeats = (s) => s.players.map((p, i) => i).filter((i) => !s.players[i].bankrupt);
const groupIdx = (s, g) => s.tiles.map((t, i) => i).filter((i) => s.tiles[i].t === "prop" && s.tiles[i].g === g);
const ownsGroup = (s, seat, g) => groupIdx(s, g).every((i) => s.tiles[i].owner === seat);
const minLevel = (s, g) => Math.min(...groupIdx(s, g).map((i) => s.tiles[i].level));
const maxLevel = (s, g) => Math.max(...groupIdx(s, g).map((i) => s.tiles[i].level));
function netWorth(s, seat) {
    return s.players[seat].cash + s.tiles.reduce((a, t) => a + (t.owner === seat ? (t.price || 0) / 2 + t.level * (t.hc || 0) / 2 : 0), 0);
}
function denoms(cash) {
    let r = Math.max(0, Math.floor(cash));
    return DENOMS.map((v) => { const n = Math.floor(r / v); r -= n * v; return n; });
}
function rentOf(s, i, sum, mod) {
    const t = s.tiles[i];
    if (t.t === "rail") {
        const n = s.tiles.filter((x) => x.t === "rail" && x.owner === t.owner).length;
        return 25 * Math.pow(2, n - 1) * (mod && mod.railX2 ? 2 : 1);
    }
    if (t.t === "util") {
        const n = s.tiles.filter((x) => x.t === "util" && x.owner === t.owner).length;
        const d = (mod && mod.utilDice) || sum || s.dice[0] + s.dice[1];
        return d * (mod && mod.utilX10 ? 10 : n === 2 ? 10 : 4);
    }
    return t.rt[t.level === 0 ? (ownsGroup(s, t.owner, t.g) ? 1 : 0) : t.level + 1];
}
function canBuild(s, seat, i) {
    const t = s.tiles[i], p = s.players[seat];
    if (!t || t.t !== "prop" || t.owner !== seat || t.level >= 5) return false;
    if (s.phase !== "roll" && s.phase !== "buy") return false;
    if (s.turn !== seat || p.bankrupt) return false;
    if (!ownsGroup(s, seat, t.g) || t.level !== minLevel(s, t.g)) return false;
    return p.cash >= t.hc || (s.cheat.free && !isAI(s, seat));
}
function canSellHouse(s, seat, i) {
    const t = s.tiles[i];
    return !!t && t.t === "prop" && t.owner === seat && t.level > 0 && t.level === maxLevel(s, t.g) &&
        (s.phase === "roll" || s.phase === "buy") && s.turn === seat;
}
function canSellProp(s, seat, i) {
    const t = s.tiles[i];
    if (!t || t.owner !== seat || (t.t !== "prop" && t.t !== "rail" && t.t !== "util")) return false;
    if ((s.phase !== "roll" && s.phase !== "buy") || s.turn !== seat) return false;
    return t.t !== "prop" || maxLevel(s, t.g) === 0;
}
function gain(s, seat, amt) { s.players[seat].cash += amt; fx(s, seat, amt); }
/* sell buildings (even rule) then properties at half price before bankruptcy */
function raiseFunds(s, seat, need) {
    const p = s.players[seat];
    let guard = 0;
    while (p.cash < need && guard++ < 200) {
        const hs = s.tiles.map((t, i) => [t, i])
            .filter(([t]) => t.owner === seat && t.level > 0 && t.level === maxLevel(s, t.g))
            .sort((a, b) => b[0].level - a[0].level || b[0].hc - a[0].hc);
        if (hs.length) {
            const t = hs[0][0];
            t.level--; p.cash += t.hc / 2; fx(s, seat, t.hc / 2);
            log(s, s.names[seat] + " sells a building on " + t.name + " (+$" + t.hc / 2 + ")", "ev");
            continue;
        }
        const ps = s.tiles.map((t, i) => [t, i])
            .filter(([t]) => t.owner === seat && (t.t === "rail" || t.t === "util" || (t.t === "prop" && maxLevel(s, t.g) === 0)))
            .sort((a, b) => (a[0].t === "prop" && ownsGroup(s, seat, a[0].g) ? 1 : 0) - (b[0].t === "prop" && ownsGroup(s, seat, b[0].g) ? 1 : 0) || a[0].price - b[0].price);
        if (!ps.length) break;
        const t = ps[0][0];
        p.cash += Math.floor(t.price / 2); fx(s, seat, Math.floor(t.price / 2));
        log(s, s.names[seat] + " sells " + t.name + " to the bank (+$" + Math.floor(t.price / 2) + ")", "ev");
        t.owner = null; t.level = 0;
    }
}
function checkOver(s) {
    if (s.phase === "over") return true;
    const alive = aliveSeats(s);
    let winner = null, reason = "";
    if (!s.online && s.players[0].bankrupt) {
        winner = alive.sort((a, b) => netWorth(s, b) - netWorth(s, a))[0];
        reason = "You went bankrupt.";
    } else if (alive.length <= 1) {
        winner = alive[0] != null ? alive[0] : null;
        reason = "Every rival is bankrupt.";
    }
    if (winner == null && reason === "") return false;
    s.phase = "over"; s.auto = null; s.card = null; s.pending = null; s.winner = winner; s.reason = reason;
    log(s, (winner != null ? s.names[winner] + " wins! " : "") + reason, "ev");
    toast(s, winner != null ? s.names[winner] + " wins!" : "Game over", "good");
    return true;
}
function bankrupt(s, seat, creditor) {
    const p = s.players[seat];
    p.cash = 0; p.bankrupt = true; p.jail = 0;
    s.tiles.forEach((t) => {
        if (t.owner === seat) {
            if (creditor != null && !s.players[creditor].bankrupt) t.owner = creditor;
            else { t.owner = null; t.level = 0; }
        }
    });
    log(s, s.names[seat] + " is BANKRUPT" + (creditor != null ? " — assets go to " + s.names[creditor] : ""), "bad");
    toast(s, s.names[seat] + " is bankrupt!", "bad");
    checkOver(s);
}
function payTo(s, from, to, amt) {
    if (amt <= 0) return;
    const p = s.players[from];
    if (p.cash < amt) raiseFunds(s, from, amt);
    if (p.cash >= amt) {
        p.cash -= amt; fx(s, from, -amt);
        if (to != null) gain(s, to, amt); else s.pot += amt;
    } else {
        const rest = p.cash; p.cash = 0;
        if (rest > 0) { fx(s, from, -rest); if (to != null) gain(s, to, rest); else s.pot += rest; }
        bankrupt(s, from, to);
    }
}
function warpTo(s, seat, pos) { const p = s.players[seat]; p.pos = pos; p.warp++; }
function sendJail(s, seat) {
    warpTo(s, seat, 10); s.players[seat].jail = 3; s.curDbl = false;
    log(s, s.names[seat] + " is sent to Jail", "bad");
    toast(s, s.names[seat] + " goes to Jail", "bad");
}
function startMove(s, seat, steps, mod) {
    const p = s.players[seat];
    if (p.pos + steps >= 40) { gain(s, seat, 200); log(s, s.names[seat] + " passes GO (+$200)", "ev"); }
    p.pos = (p.pos + steps) % 40;
    p.moveId++; p.lastSteps = steps; p.hopMs = steps > 12 ? 90 : 160;
    s.mod = mod || null; s.phase = "moving";
    s.auto = { type: "arrive" }; s.wait = steps * p.hopMs + 340;
}
function settleNow(s) { s.phase = "settle"; s.auto = { type: "settle" }; s.wait = 620; }
function nextTurn(s) {
    s.dbl = 0; s.curDbl = false;
    let n = s.turn;
    do { n = (n + 1) % 3; } while (s.players[n].bankrupt);
    s.turn = n; s.phase = "roll";
    s.auto = isAI(s, n) ? { type: "aiPlay", seat: n } : null;
    s.wait = 1000;
}
function settle(s) {
    if (s.phase === "over") return;
    s.turns++;
    if (s.turns > 480) { // hard finish cap: richest player wins, no infinite stalemates
        const alive = aliveSeats(s).sort((a, b) => netWorth(s, b) - netWorth(s, a));
        s.winner = alive[0]; s.phase = "over"; s.auto = null;
        s.reason = "Turn limit reached — highest net worth wins.";
        log(s, s.names[s.winner] + " wins on net worth (turn limit)", "ev");
        return;
    }
    const p = s.players[s.turn];
    if (p.bankrupt) { nextTurn(s); return; }
    if (s.curDbl && p.jail === 0) {
        s.phase = "roll";
        s.auto = isAI(s, s.turn) ? { type: "aiPlay", seat: s.turn } : null;
        s.wait = 950;
        log(s, s.names[s.turn] + " rolled doubles — goes again", "ev");
    } else nextTurn(s);
}
function doRoll(s, seat) {
    const rig = s.cheat.rig;
    if (rig && !isAI(s, seat) && !s.online) {
        s.dice = [rig[0], rig[1]]; s.cheat.rig = null;
        log(s, "Cheat: rigged roll " + rig[0] + " + " + rig[1], "ch");
    } else s.dice = [die(s), die(s)];
    s.rollId++; s.phase = "rolling";
    s.auto = { type: "diceDone" }; s.wait = 820;
}
function diceDone(s) {
    const seat = s.turn, p = s.players[seat];
    const a = s.dice[0], b = s.dice[1], sum = a + b, db = a === b;
    log(s, s.names[seat] + " rolls " + a + " + " + b + (db ? " (doubles)" : ""));
    if (p.jail > 0) {
        if (db) {
            p.jail = 0; s.curDbl = false;
            log(s, s.names[seat] + " rolls doubles and walks free", "ev");
            startMove(s, seat, sum);
        } else if (p.jail === 1) {
            p.jail = 0; s.curDbl = false;
            log(s, s.names[seat] + " pays the $50 jail fine", "ev");
            payTo(s, seat, null, 50);
            if (s.phase === "over") return;
            if (p.bankrupt) settleNow(s); else startMove(s, seat, sum);
        } else {
            p.jail--; s.curDbl = false;
            log(s, s.names[seat] + " stays in Jail (" + p.jail + " tries left)");
            settleNow(s);
        }
        return;
    }
    s.curDbl = db;
    if (db) {
        s.dbl++;
        if (s.dbl >= 3) {
            log(s, s.names[seat] + " rolled three doubles in a row", "bad");
            sendJail(s, seat); settleNow(s); return;
        }
    } else s.dbl = 0;
    startMove(s, seat, sum);
}
function drawCard(s, seat, deck) {
    const arr = deck === "C" ? s.deckC : s.deckK;
    const idx = deck === "C" ? s.iC++ : s.iK++;
    const di = arr[idx % arr.length];
    const def = (deck === "C" ? CHANCE : CHEST)[di];
    s.card = { deck, i: di };
    log(s, s.names[seat] + " draws " + (deck === "C" ? "Chance" : "Community Chest") + ": " + def.txt, deck === "C" ? "ch" : "cc");
    s.phase = "card";
    s.auto = { type: "cardOk", seat }; s.wait = isAI(s, seat) ? 1600 : 3400;
}
function applyCard(s, seat) {
    const c = s.card; if (!c) return;
    s.card = null;
    const def = (c.deck === "C" ? CHANCE : CHEST)[c.i];
    const p = s.players[seat];
    if (def.money > 0) gain(s, seat, def.money);
    else if (def.money < 0) payTo(s, seat, null, -def.money);
    else if (def.each > 0) {
        for (const o of aliveSeats(s)) if (o !== seat) { payTo(s, o, seat, def.each); if (s.phase === "over") return; }
    } else if (def.each < 0) {
        for (const o of aliveSeats(s)) if (o !== seat) { payTo(s, seat, o, -def.each); if (s.phase === "over" || p.bankrupt) return; }
    } else if (def.repair) {
        let h = 0, H = 0;
        s.tiles.forEach((t) => { if (t.owner === seat) { if (t.level === 5) H++; else h += t.level; } });
        const amt = h * def.repair[0] + H * def.repair[1];
        if (amt > 0) { log(s, s.names[seat] + " pays repairs: " + h + " houses, " + H + " hotels ($" + amt + ")", "bad"); payTo(s, seat, null, amt); }
        else log(s, s.names[seat] + " owns no buildings — repairs cost $0");
    } else if (def.free) { p.free++; log(s, s.names[seat] + " keeps a Get-out-of-Jail card", "ev"); }
    else if (def.jail) sendJail(s, seat);
    else if (def.go) { startMove(s, seat, (40 - p.pos) % 40 || 40); return; }
    else if (def.back) { warpTo(s, seat, (p.pos + 40 - def.back) % 40); arrive(s); return; }
    else if (def.rail) {
        let k = 1; while (s.tiles[(p.pos + k) % 40].t !== "rail") k++;
        startMove(s, seat, k, { railX2: true }); return;
    } else if (def.util) {
        let k = 1; while (s.tiles[(p.pos + k) % 40].t !== "util") k++;
        const d1 = die(s), d2 = die(s);
        log(s, s.names[seat] + " rolls " + d1 + " + " + d2 + " for the utility");
        startMove(s, seat, k, { utilX10: true, utilDice: d1 + d2 }); return;
    }
    if (s.phase === "over") return;
    settleNow(s);
}
function arrive(s) {
    const seat = s.turn, p = s.players[seat];
    const t = s.tiles[p.pos], mod = s.mod; s.mod = null;
    if (t.t === "prop" || t.t === "rail" || t.t === "util") {
        if (t.owner == null) {
            s.pending = p.pos; s.phase = "buy";
            s.auto = isAI(s, seat) ? { type: "aiBuy", seat } : null; s.wait = 950;
        } else if (t.owner === seat) settleNow(s);
        else {
            const r = rentOf(s, p.pos, s.dice[0] + s.dice[1], mod);
            log(s, s.names[seat] + " pays $" + r + " rent to " + s.names[t.owner] + " for " + t.name, "bad");
            toast(s, s.names[seat] + " pays " + s.names[t.owner] + " $" + r, seat === 0 ? "bad" : "");
            payTo(s, seat, t.owner, r);
            if (s.phase === "over") return;
            settleNow(s);
        }
    } else if (t.t === "tax") {
        log(s, s.names[seat] + " pays " + t.name + " ($" + t.amt + ")", "bad");
        payTo(s, seat, null, t.amt);
        if (s.phase === "over") return;
        settleNow(s);
    } else if (t.t === "chance") drawCard(s, seat, "C");
    else if (t.t === "chest") drawCard(s, seat, "K");
    else if (t.t === "park") {
        if (s.pot > 0) {
            log(s, s.names[seat] + " scoops the $" + s.pot + " Free Parking pot", "ev");
            toast(s, s.names[seat] + " wins the $" + s.pot + " pot!", "good");
            gain(s, seat, s.pot); s.pot = 0;
        }
        settleNow(s);
    } else if (t.t === "gotojail") { sendJail(s, seat); settleNow(s); }
    else settleNow(s);
}
function decideBuy(s, seat, buy) {
    const i = s.pending, t = s.tiles[i], p = s.players[seat];
    if (buy) {
        if (p.cash < t.price) return;
        p.cash -= t.price; fx(s, seat, -t.price); t.owner = seat;
        log(s, s.names[seat] + " buys " + t.name + " for $" + t.price);
        toast(s, s.names[seat] + " buys " + t.name, seat === 0 ? "good" : "");
    } else log(s, s.names[seat] + " passes on " + t.name);
    s.pending = null;
    settleNow(s);
}
function aiDevelop(s, seat) {
    const d = DIFFS[s.difficulty], p = s.players[seat];
    let built = 0;
    while (built < d.cap) {
        const opts = s.tiles.map((t, i) => [t, i])
            .filter(([t]) => t.t === "prop" && t.owner === seat && t.level < 5 && ownsGroup(s, seat, t.g) && t.level === minLevel(s, t.g) && p.cash - t.hc >= d.buildMin)
            .sort((a, b) => (b[0].rt[b[0].level + 2] - b[0].rt[b[0].level + 1]) / b[0].hc - (a[0].rt[a[0].level + 2] - a[0].rt[a[0].level + 1]) / a[0].hc);
        if (!opts.length) break;
        const t = opts[0][0];
        t.level++; p.cash -= t.hc; fx(s, seat, -t.hc); built++;
        log(s, s.names[seat] + (t.level === 5 ? " builds a HOTEL on " : " builds a house on ") + t.name + " (lv " + t.level + ")", "ev");
    }
}
function aiPlay(s, seat) {
    const d = DIFFS[s.difficulty], p = s.players[seat];
    aiDevelop(s, seat);
    if (p.jail > 0) {
        if (p.free > 0) { p.free--; p.jail = 0; log(s, s.names[seat] + " uses a Jail-free card", "ev"); }
        else if (p.cash >= d.reserve + 150) {
            payTo(s, seat, null, 50);
            if (s.phase === "over") return;
            if (p.bankrupt) { settleNow(s); return; }
            p.jail = 0; log(s, s.names[seat] + " pays $50 to leave Jail", "ev");
        }
    }
    doRoll(s, seat);
}
function aiBuyDecision(s, seat) {
    const d = DIFFS[s.difficulty], p = s.players[seat];
    const t = s.tiles[s.pending];
    let buy = p.cash - t.price >= d.reserve;
    if (!buy && t.t === "prop") {
        const gi = groupIdx(s, t.g);
        const mine = gi.filter((i) => s.tiles[i].owner === seat).length;
        if (mine === gi.length - 1 && p.cash - t.price >= 40) buy = true; // complete the set
    }
    decideBuy(s, seat, buy);
}
function makeGame(o) {
    const s = lobbyState(o.online);
    s.seed = o.seed >>> 0 || 1; s.rng = s.seed; s.difficulty = o.difficulty;
    const d = DIFFS[o.difficulty];
    s.seatActor = o.seatActor.slice(); s.names = o.names.slice();
    let tiles = null;
    for (let k = 0; k < 60; k++) {
        const cand = makeTiles(s);
        if (validateTiles(cand, d.cash)) { tiles = cand; break; }
    }
    s.tiles = tiles || makeTiles(s, true);
    s.players = [0, 1, 2].map(() => ({ cash: d.cash, pos: 0, jail: 0, free: 0, bankrupt: false, moveId: 0, warp: 0, lastSteps: 0, hopMs: 160 }));
    s.deckC = shuffle(s, CHANCE.map((_, i) => i));
    s.deckK = shuffle(s, CHEST.map((_, i) => i));
    /* random opening roll — highest sum goes first */
    let rolled = [0, 1, 2].map(() => die(s) + die(s));
    let best = Math.max(...rolled);
    let tied = [0, 1, 2].filter((i) => rolled[i] === best);
    let guard = 0;
    while (tied.length > 1 && guard++ < 30) {
        tied.forEach((i) => (rolled[i] = die(s) + die(s)));
        best = Math.max(...tied.map((i) => rolled[i]));
        tied = tied.filter((i) => rolled[i] === best);
    }
    s.turn = tied[0];
    log(s, "Opening rolls — " + s.names.map((n, i) => n + " " + rolled[i]).join(" · "), "ev");
    log(s, s.names[s.turn] + " goes first", "ev");
    toast(s, s.names[s.turn] + " starts (opening roll)", "");
    s.phase = "roll";
    if (isAI(s, s.turn)) { s.auto = { type: "aiPlay", seat: s.turn }; s.wait = 1200; }
    return s;
}
function doCheat(s, seat, a) {
    if (s.phase === "over" || s.phase === "lobby") return;
    const p = s.players[seat], op = a.op;
    const clamp = (x) => Math.min(6, Math.max(1, x | 0));
    if (op === "cash500") { gain(s, seat, 500); log(s, "CHEAT: +$500", "ch"); }
    else if (op === "cash2000") { gain(s, seat, 2000); log(s, "CHEAT: +$2000", "ch"); }
    else if (op === "ownall") {
        s.tiles.forEach((t) => { if (t.t === "prop" || t.t === "rail" || t.t === "util") t.owner = seat; });
        log(s, "CHEAT: you now own every property", "ch");
    } else if (op === "free") { s.cheat.free = !s.cheat.free; log(s, "CHEAT: free building " + (s.cheat.free ? "ON" : "OFF"), "ch"); }
    else if (op === "jail") { p.jail = 0; log(s, "CHEAT: out of Jail", "ch"); }
    else if (op === "pot") { s.pot += 500; log(s, "CHEAT: pot +$500", "ch"); }
    else if (op === "rig") { s.cheat.rig = [clamp(a.a), clamp(a.b)]; log(s, "CHEAT: next roll rigged to " + s.cheat.rig.join(" + "), "ch"); }
    else if (op === "win") { aliveSeats(s).forEach((o) => { if (o !== seat && s.phase !== "over") bankrupt(s, o, seat); }); }
    else if (op === "clear") { s.cheat = { free: false, rig: null }; log(s, "CHEAT: toggles cleared", "ch"); }
    toast(s, "Cheat applied: " + op, "ch");
}
/* single entry point for every mutation — host runs this, guests only send actions */
function coreApply(s, a, actor) {
    if (!s || !a || !a.type) return;
    const t = a.type;
    if (t === "start") {
        if ((s.phase !== "lobby" && s.phase !== "over") || actor === "sys") return;
        if (s.online && actor !== 0) return;
        const difficulty = DIFFS[a.difficulty] ? a.difficulty : "normal";
        const seatActor = Array.isArray(a.seatActor) && a.seatActor.length === 3 ? a.seatActor : [0, 2, 2];
        const names = Array.isArray(a.names) && a.names.length === 3 ? a.names : ["You", "Rex AI", "Nova AI"];
        Object.assign(s, makeGame({ online: s.online, difficulty, seed: a.seed, seatActor, names }));
        return;
    }
    if (t === "reset") {
        if (actor === "sys" || (s.online && actor !== 0)) return;
        Object.assign(s, lobbyState(s.online));
        return;
    }
    if (!s.tiles || s.phase === "lobby") return;
    const seat = actor === "sys" ? (a.seat != null ? a.seat : s.turn) : s.seatActor.indexOf(actor);
    if (actor !== "sys" && seat < 0) return;
    const p = s.players[seat];
    switch (t) {
        case "roll": if (s.phase !== "roll" || seat !== s.turn || p.bankrupt) return; doRoll(s, seat); break;
        case "jailPay":
            if (s.phase !== "roll" || seat !== s.turn || p.jail <= 0) return;
            if (p.free > 0) { p.free--; p.jail = 0; log(s, s.names[seat] + " uses a Jail-free card", "ev"); }
            else {
                payTo(s, seat, null, 50);
                if (s.phase === "over") return;
                if (p.bankrupt) { settleNow(s); return; }
                p.jail = 0; log(s, s.names[seat] + " pays $50 to leave Jail", "ev");
            }
            break;
        case "diceDone": if (actor !== "sys" || s.phase !== "rolling") return; diceDone(s); break;
        case "arrive": if (actor !== "sys" || s.phase !== "moving") return; arrive(s); break;
        case "settle": if (actor !== "sys" || s.phase !== "settle") return; settle(s); break;
        case "aiPlay": if (actor !== "sys" || s.phase !== "roll" || seat !== s.turn || !isAI(s, seat)) return; aiPlay(s, seat); break;
        case "aiBuy": if (actor !== "sys" || s.phase !== "buy" || seat !== s.turn || !isAI(s, seat)) return; aiBuyDecision(s, seat); break;
        case "buy": case "pass":
            if (s.phase !== "buy" || seat !== s.turn || s.pending == null) return;
            decideBuy(s, seat, t === "buy"); break;
        case "cardOk": if (s.phase !== "card" || seat !== s.turn) return; applyCard(s, seat); break;
        case "build": {
            const i = a.i | 0;
            if (!canBuild(s, seat, i)) return;
            const tl = s.tiles[i];
            const cost = s.cheat.free && !isAI(s, seat) ? 0 : tl.hc;
            if (cost > 0) { p.cash -= cost; fx(s, seat, -cost); }
            tl.level++;
            log(s, s.names[seat] + (tl.level === 5 ? " builds a HOTEL on " : " builds a house on ") + tl.name + " (lv " + tl.level + ")", "ev");
            toast(s, (tl.level === 5 ? "Hotel" : "House") + " built on " + tl.name, "good");
            break;
        }
        case "sell": {
            const i = a.i | 0;
            if (!canSellHouse(s, seat, i)) return;
            const tl = s.tiles[i];
            tl.level--; p.cash += tl.hc / 2; fx(s, seat, tl.hc / 2);
            log(s, s.names[seat] + " sells a building on " + tl.name + " (+$" + tl.hc / 2 + ")", "ev");
            break;
        }
        case "sellProp": {
            const i = a.i | 0;
            if (!canSellProp(s, seat, i)) return;
            const tl = s.tiles[i], v = Math.floor(tl.price / 2);
            tl.owner = null; tl.level = 0; p.cash += v; fx(s, seat, v);
            log(s, s.names[seat] + " sells " + tl.name + " to the bank (+$" + v + ")", "ev");
            break;
        }
        case "cheat": if (s.online || actor === "sys") return; doCheat(s, seat, a); break;
    }
}

/* ================= mount: DOM, rendering, input, sync ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = lobbyState(online);

    /* UI shell state — kept outside the authoritative, serializable game state. */
    let selected = null, portOpen = false;
    let helpOpen = false, cheatOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("monopolyHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("monopolyHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    const uiBlocked = () => helpOpen || cheatOpen || paused;

    root.innerHTML = `
<style>
/* Monopoly — neon-on-navy identity; one HUD bar, fill-height board, side panel. */
.mo-root{--bg:#0b0f17;--panel:#111726;--line:#232c40;--tx:#e7eaf2;--mut:#8b93a7;--acc:#818cf8;--good:#34d399;--bad:#f87171;--warn:#fbbf24;width:100%;max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 322px;grid-template-rows:auto minmax(0,1fr);gap:12px;color:var(--tx);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none}
.mo-root *{box-sizing:border-box}
.mo-root [hidden]{display:none!important}
.mo-root :is(button,select,input):focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.mo-hud{grid-column:1/-1;grid-row:1;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.mo-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:11px;color:var(--mut);white-space:nowrap;max-width:100%}
.mo-chip b{color:var(--tx);font-variant-numeric:tabular-nums}
.mo-statusdot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none}
.mo-spacer{flex:1 1 8px}
.mo-btn{appearance:none;border:1px solid var(--line);background:#182034;color:var(--tx);border-radius:9px;padding:8px 13px;min-height:36px;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,transform .05s;touch-action:manipulation;font-family:inherit}
.mo-btn:hover:not(:disabled){background:#202a44;border-color:#31406b}
.mo-btn:active:not(:disabled){transform:translateY(1px)}
.mo-btn:disabled{opacity:.38;cursor:default}
.mo-btn.primary{background:var(--acc);border-color:var(--acc);color:#0b0f17}
.mo-btn.primary:hover:not(:disabled){background:#99a3ff;border-color:#99a3ff}
.mo-btn.ghost{background:transparent}
.mo-btn.on{border-color:var(--acc);background:#818cf822}
.mo-icon-btn{display:inline-flex;align-items:center;gap:6px}
.mo-icon-btn svg{flex:none;display:block}
.mo-hudacts{display:inline-flex;gap:6px;flex-wrap:wrap}
.mo-hudacts .mo-btn{padding:6px 10px;min-height:32px;font-size:10px}
.mo-board{grid-column:1;grid-row:2;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:0;border:1px solid var(--line);border-radius:14px;background:var(--bg);overflow:hidden;container-type:size}
.mo-boardwrap{position:relative;width:min(100%,600px,100cqh);aspect-ratio:1;max-height:100%;margin:auto}
.mo-boardwrap>svg{display:block;width:100%;height:100%}
.mo-hit{cursor:pointer;stroke:transparent;stroke-width:2}
.mo-hit:hover{stroke:#aab4ff;stroke-opacity:.55}
.mo-tok{transition:transform .15s ease}
.mo-tok.moving circle{animation:moBob .3s ease-in-out infinite}
@keyframes moBob{50%{transform:translateY(-3px)}}
.mo-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:14px}
.mo-float{position:absolute;transform:translate(-50%,-50%);font-weight:800;font-size:13px;animation:moFloat 1.3s ease-out forwards;text-shadow:0 1px 5px #000;white-space:nowrap}
.mo-float.up{color:var(--good)}
.mo-float.down{color:var(--bad)}
@keyframes moFloat{0%{opacity:0;margin-top:8px}15%{opacity:1}100%{opacity:0;margin-top:-36px}}
.mo-cardov{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(300px,calc(100% - 24px));background:#141c30;border:1px solid var(--line);border-radius:14px;padding:16px;text-align:center;animation:moPop .2s ease;box-shadow:0 12px 32px #0008;z-index:6}
.mo-cardov[hidden]{display:none}
.mo-cardov.chance{border-color:#b4530988}
.mo-cardov.chest{border-color:#2563eb88}
.mo-ctitle{font-size:11px;font-weight:800;letter-spacing:3px;margin-bottom:8px}
.mo-cardov.chance .mo-ctitle{color:var(--warn)}
.mo-cardov.chest .mo-ctitle{color:#60a5fa}
.mo-ctext{font-size:13.5px;font-weight:600;margin-bottom:10px}
@keyframes moPop{from{opacity:0;transform:translate(-50%,-46%) scale(.92)}}
.mo-side{grid-column:2;grid-row:2;display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;overflow:auto}
.mo-side.locked{pointer-events:none;opacity:.7}
.mo-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}
.mo-boxtitle{font-size:10px;font-weight:800;letter-spacing:2px;color:var(--mut);margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;gap:6px}
.mo-prow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;font-size:12.5px;min-width:0}
.mo-prow.cur{background:#818cf81f;outline:1px solid #818cf855}
.mo-prow.out{opacity:.4}
.mo-dot{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block}
.mo-pcash{margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums}
.mo-tag{font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:99px;background:#ffffff14;color:var(--mut);white-space:nowrap}
.mo-tag.jail{background:#f59e0b22;color:#fcd34d}
.mo-tag.dead{background:#ef444422;color:#fca5a5}
.mo-tag.free{background:#34d39922;color:#a7f3d0}
.pulse-up{animation:moPulseG .7s}
.pulse-down{animation:moPulseR .7s}
@keyframes moPulseG{30%{color:var(--good)}}
@keyframes moPulseR{30%{color:var(--bad)}}
.mo-status{font-size:12.5px;color:#c3cde2;text-align:center;margin-bottom:8px;min-height:18px}
.mo-actbtns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.mo-key{font-size:9.5px;color:var(--mut);border:1px solid var(--line);border-radius:4px;padding:0 4px;margin-left:5px}
.mo-deedbar{height:8px;border-radius:6px;margin-bottom:8px;background:#26304a}
.mo-deedname{font-weight:800;font-size:14px}
.mo-deedsub{font-size:11px;color:var(--mut);margin:2px 0 8px}
.mo-rows{display:grid;grid-template-columns:1fr auto;gap:3px 12px;font-size:12px;color:#c3cde2}
.mo-rows b{text-align:right;font-variant-numeric:tabular-nums;color:var(--tx)}
.mo-rows .hl{color:var(--warn)}
.mo-deedbtns{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.mo-pips{display:inline-flex;gap:3px;align-items:center}
.mo-pip{width:10px;height:10px;border-radius:2px;background:#26304a;display:inline-block}
.mo-pip.h{background:var(--good)}
.mo-pip.hotel{background:var(--bad);width:14px}
.mo-bills{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.mo-bill{border-radius:6px;padding:5px 2px;text-align:center;font-size:9.5px;font-weight:800;color:#0b0f17}
.mo-bill small{display:block;font-size:10px;font-weight:800}
.mo-bill.zero{opacity:.2}
.mo-bill.flash{animation:moFlash .8s}
@keyframes moFlash{30%{transform:scale(1.14)}}
.mo-port{max-height:min(190px,24vh);overflow:auto}
.mo-prow2{display:flex;align-items:center;gap:7px;font-size:12px;padding:4px;cursor:pointer;border-radius:6px}
.mo-prow2:hover{background:#ffffff08}
.mo-prow2 .mo-btn{padding:3px 8px;font-size:10.5px;margin-left:auto}
.mo-log{max-height:min(150px,20vh);overflow:auto;font-size:11.5px;color:var(--mut)}
.mo-log div{padding:3px 0;border-bottom:1px dashed #ffffff0d}
.mo-log .ev{color:#a7f3d0}
.mo-log .bad{color:#fca5a5}
.mo-log .ch{color:#fde68a}
.mo-log .cc{color:#bfdbfe}
.mo-vbar{display:none;grid-column:1/-1;grid-row:3;gap:8px;margin-top:2px;position:sticky;bottom:max(8px,env(safe-area-inset-bottom));z-index:10}
.mo-vbar .mo-btn{flex:1;min-height:50px;font-size:14px;border-radius:12px;box-shadow:0 4px 14px #0006}
.mo-toasts{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;z-index:15;pointer-events:none;width:max-content;max-width:calc(100% - 16px)}
.mo-toast{background:#141c30ee;border:1px solid var(--line);padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;animation:moToast 2.3s forwards;text-align:center}
.mo-toast.good{border-color:#34d39966;color:#a7f3d0}
.mo-toast.bad{border-color:#f8717166;color:#fecaca}
.mo-toast.ch{border-color:#fbbf2466;color:#fde68a}
@keyframes moToast{0%{opacity:0;transform:translateY(-6px)}12%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
.mo-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0f17d9;backdrop-filter:blur(3px);z-index:20;border-radius:14px;padding:12px}
.mo-ovcard{display:flex;flex-direction:column;overflow:hidden;max-width:540px;width:100%;max-height:100%;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}
.mo-ovhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.mo-ovhead h2{margin:0;font-size:20px}
.mo-ovbody{flex:1 1 auto;min-height:0;overflow:auto}
.mo-ovfoot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}
.mo-ovcard .sub{font-size:12.5px;color:var(--mut);margin:0 0 10px}
.mo-diffrow{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}
.mo-diffrow .mo-btn{flex:1 1 120px}
.mo-help h3{font-size:11px;letter-spacing:2px;color:var(--acc);margin:12px 0 4px;text-transform:uppercase}
.mo-help p,.mo-help li{font-size:12.5px;color:#c3cde2;margin:4px 0}
.mo-help ul{padding-left:18px;margin:4px 0}
.mo-help kbd{background:#182034;border:1px solid var(--line);border-radius:4px;padding:0 5px;font-size:11px;font-family:inherit}
.mo-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.mo-rigrow{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:var(--mut);flex-wrap:wrap}
.mo-rigrow select{background:#182034;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:8px;min-height:36px;font-family:inherit}
.mo-note{font-size:11px;color:var(--mut);margin-top:12px}
.mo-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
.mo-stat{background:#182034;border:1px solid var(--line);border-radius:10px;padding:8px;text-align:center}
.mo-stat b{display:block;font-size:16px}
.mo-stat span{font-size:10px;color:var(--mut);letter-spacing:1px}
.mo-root.frozen .mo-tok,.mo-root.frozen .mo-float,.mo-root.frozen .mo-toast{animation-play-state:paused}
.mo-root.frozen .mo-tok{transition:none}
@media(pointer:coarse){.mo-vbar{display:flex}.mo-key{display:none}}
@media(max-width:1024px){
.mo-root{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto}
.mo-side{grid-column:1;grid-row:3;max-width:600px;margin:0 auto;width:100%;overflow:visible}
.mo-vbar{grid-row:4}
}
@media(max-width:560px){
  .mo-stats{grid-template-columns:repeat(2,1fr)}
  .mo-cheatgrid{grid-template-columns:1fr}
  .mo-bills{gap:4px}
}
@media(pointer:coarse){
  .mo-btn,.mo-rigrow select{min-height:44px}
  .mo-chip{min-height:44px;padding:8px 12px}
}
@media(prefers-reduced-motion:reduce){.mo-root *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
/* --- fill height + mobile refinements (keep LAST) --- */
.mo-root.game-fill > .mo-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media(max-width:640px){
.mo-root.game-fill > .mo-board:not(:has(.mo-ov:not([hidden]))){aspect-ratio:1;flex:0 0 auto}
.mo-root.game-fill > .mo-board:has(.mo-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.mo-root .mo-hud{gap:5px;margin-bottom:0}
.mo-root .mo-hud .mo-chip{padding:4px 6px;font-size:9px;min-height:0}
.mo-root .mo-hud .mo-chip[data-hud-seed],.mo-root .mo-hud .mo-chip[data-hud-dice]{display:none}
.mo-root .mo-hud .mo-btn{min-height:32px;padding:5px 9px;font-size:9px}
.mo-root .mo-hud .mo-btn-label,.mo-root .mo-hud .mo-spacer{display:none}
.mo-root .mo-ov{padding:8px}
.mo-root .mo-ovcard{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.mo-root .mo-ovbody,.mo-root .mo-help,.mo-root .mo-log{scrollbar-width:none}
.mo-root .mo-ovbody::-webkit-scrollbar,.mo-root .mo-help::-webkit-scrollbar,.mo-root .mo-log::-webkit-scrollbar{display:none}
.mo-root .mo-ovfoot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.mo-root .mo-note{display:none}
}
</style>
<div class="game-app mo-root game-fill" data-mo>
  <div class="mo-hud">
    <span class="mo-chip"><i class="mo-statusdot"></i><span data-status aria-live="polite">Ready</span></span>
    <span class="mo-chip">Cash <b data-hud-cash>$0</b></span>
    <span class="mo-chip">Pot <b data-hud-pot>$0</b></span>
    <span class="mo-chip">Turn <b data-hud-turn>—</b></span>
    <span class="mo-chip" data-hud-dice>dice —</span>
    <span class="mo-chip" data-hud-seed>city —</span>
    <span class="mo-hudacts" data-hudacts></span>
    <span class="mo-spacer"></span>
    <button class="mo-btn mo-icon-btn" type="button" data-act="manage" aria-label="Portfolio" title="Portfolio (M)">${iconSVG("grid", { size: 14 })}<span class="mo-btn-label">Portfolio</span></button>
    <button class="mo-btn mo-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="mo-btn-label">Help</span></button>
    <button class="mo-btn mo-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="mo-btn-label">Cheats</span></button>
    <button class="mo-btn mo-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="mo-btn-label">Pause</span></button>
    <button class="mo-btn mo-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="mo-btn-label">Restart</span></button>
    <button class="mo-btn mo-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="mo-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel mo-board" data-board>
    <div class="mo-boardwrap">
      <svg viewBox="0 0 760 760" role="img" aria-label="Monopoly board" data-svg></svg>
      <div class="mo-fx" data-fxlayer></div>
      <div class="mo-cardov" data-cardov hidden></div>
      <div class="mo-toasts" data-toasts></div>
    </div>
    <div class="mo-ov" data-ov-start>
      <div class="mo-ovcard">
        <div class="mo-ovhead"><h2>Monopoly — random city</h2></div>
        <div class="mo-ovbody">
          <p class="sub">A fresh, seeded city board is generated every game: 40 tiles, 8 color sets, railroads, utilities, Chance &amp; Community Chest. Balanced so every game can be finished.</p>
          <div class="mo-diffrow" data-diffrow></div>
          <ul style="font-size:12.5px;color:#c3cde2;padding-left:18px;margin:8px 0">
            <li>Roll, move, buy streets — complete a color set to double rent and unlock building.</li>
            <li>Build up to 4 houses, then a hotel. Taxes &amp; fines fill the Free Parking pot.</li>
            <li>Who goes first is decided by a random opening roll. Online, seats are shuffled too.</li>
          </ul>
        </div>
        <div class="mo-ovfoot">
          <span class="mo-note" data-startnote></span>
          <span class="mo-actbtns" style="justify-content:flex-end">
            <button class="mo-btn primary" type="button" data-act="start" data-startbtn>Start game</button>
            <button class="mo-btn ghost" type="button" data-help>How to play</button>
          </span>
        </div>
      </div>
    </div>
    <div class="mo-ov" data-ov-over hidden>
      <div class="mo-ovcard">
        <div class="mo-ovhead"><h2 data-over-title>Game over</h2></div>
        <div class="mo-ovbody">
          <p class="sub" data-over-reason></p>
          <div class="mo-stats" data-over-stats></div>
        </div>
        <div class="mo-ovfoot"><span class="mo-note" data-over-note></span><button class="mo-btn primary" type="button" data-act="start" data-startbtn>Play again</button></div>
      </div>
    </div>
    <div class="mo-ov" data-ov-pause hidden>
      <div class="mo-ovcard">
        <div class="mo-ovhead"><h2>Paused</h2></div>
        <div class="mo-ovbody"><p class="sub">Turn timers and rivals are frozen. Press P or Esc to resume.</p></div>
        <div class="mo-ovfoot"><span class="mo-note">Offline games only</span><button class="mo-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="mo-ov" data-ov-help hidden>
      <div class="mo-ovcard">
        <div class="mo-ovhead"><h2>How to play</h2><button class="mo-btn" type="button" data-help-close>Close</button></div>
        <div class="mo-ovbody mo-help">
          <h3>Goal</h3><p>Be the last solvent player. Bankrupt every rival by collecting rent — or be richest when the turn limit hits.</p>
          <h3>Your turn</h3><ul><li>Roll two dice and move tile by tile. Passing GO pays $200.</li><li>Doubles = roll again. Three doubles in a row = straight to Jail.</li><li>Land on an unowned street / railroad / utility: <b>Buy</b> it or <b>Pass</b>.</li><li>Land on a rival's property: pay rent automatically.</li></ul>
          <h3>Rent &amp; building</h3><ul><li>Own every street of a color set → base rent doubles and you can build.</li><li>Build evenly across the set: up to 4 houses, then a <b>hotel</b> (level 5). Click a tile to open its title-deed card and build / sell there.</li><li>Sell buildings or streets back to the bank at half price any time on your turn.</li><li>Railroads: $25 / $50 / $100 / $200 by how many you own. Utilities: 4× dice (one) or 10× dice (both).</li></ul>
          <h3>Cards, taxes &amp; jail</h3><ul><li><b style="color:#fbbf24">Chance</b> (orange ?) moves you around; <b style="color:#60a5fa">Community Chest</b> (blue) is mostly money in / out.</li><li>Taxes and fines go to the Free Parking pot — land on Free Parking to scoop it.</li><li>Jail: roll doubles, pay $50, or use a Jail-free card. After 3 failed tries you must pay and move.</li></ul>
          <h3>Bankruptcy</h3><p>Can't pay? Your buildings and streets are auto-sold at half price. Still short → bankrupt, and your assets go to the creditor.</p>
          <h3>Controls</h3><ul><li><kbd>Space</kbd> roll · <kbd>B</kbd> buy · <kbd>N</kbd> pass · <kbd>J</kbd> pay jail / use card · <kbd>K</kbd> continue card</li><li><kbd>M</kbd> portfolio · <kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>R</kbd> restart · <kbd>Esc</kbd> close / deselect</li><li>Mouse: click any tile to inspect its deed card, double-click your street to build. Touch: use the buttons in the HUD / beside the board.</li></ul>
          <h3>Random city &amp; difficulty</h3><p>Every game generates a seeded board (names, prices, taxes, card order). The generator validates that sets are completable, prices affordable and rents sane — and a turn cap guarantees a winner. Difficulty changes starting cash and how aggressively the AI buys and builds. Cheats are available offline only.</p>
        </div>
        <div class="mo-ovfoot"><span class="mo-note">Press H to reopen this guide</span><button class="mo-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
    <div class="mo-ov" data-ov-cheat hidden>
      <div class="mo-ovcard">
        <div class="mo-ovhead"><h2>Cheat console</h2><button class="mo-btn" type="button" data-cheats-close>Close</button></div>
        <div class="mo-ovbody">
          <p class="sub">Offline sandbox only — disabled in online rooms.</p>
          <div class="mo-cheatgrid">
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="cash500">+ $500</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="cash2000">+ $2000</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="ownall">Own all properties</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="free" data-freebtn>Free building: OFF</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="jail">Leave jail</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="pot">Pot + $500</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="win">Bankrupt rivals (win)</button>
            <button class="mo-btn" type="button" data-act="cheatOp" data-op="clear">Clear toggles</button>
          </div>
          <div class="mo-rigrow">Rig next roll:
            <select data-rig-a><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
            <select data-rig-b><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
            <button class="mo-btn" type="button" data-act="rig">Set</button>
            <span data-rigstate></span>
          </div>
        </div>
      </div>
    </div>
  </section>
  <aside class="mo-side" data-side>
    <div class="mo-box" data-players></div>
    <div class="mo-box"><div class="mo-status" data-actstatus aria-live="polite"></div><div class="mo-actbtns" data-actbtns></div></div>
    <div class="mo-box" data-deed></div>
    <div class="mo-box" data-wallet></div>
    <div class="mo-box mo-port" data-port hidden></div>
    <div class="mo-box mo-log" data-log></div>
  </aside>
  <div class="mo-vbar" data-vbar></div>
</div>`;

    /* ---------- tiny helpers ---------- */
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => root.querySelectorAll(s);
    const NS = "http://www.w3.org/2000/svg";
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fmt$ = (n) => "$" + Math.round(n).toLocaleString("en-US");
    const mk = (t, at, parent) => {
        const n = document.createElementNS(NS, t);
        for (const k in at) n.setAttribute(k, at[k]);
        if (parent) parent.appendChild(n);
        return n;
    };
    const txt = (x, y, str, at, parent) => {
        const n = mk("text", Object.assign({ x, y, "text-anchor": "middle", "font-family": "inherit", fill: "#dbe1ea" }, at || {}), parent);
        n.textContent = str;
        return n;
    };
    const timers = new Set();
    let destroyed = false;
    function after(ms, fn) {
        const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
        timers.add(id);
        return id;
    }
    /* board geometry: 40 tiles, 760x760, corners 110, edges 60 */
    function geo(i) {
        if (i === 0) return { x: 650, y: 650, w: 110, h: 110, s: 0, corner: 1 };
        if (i === 10) return { x: 0, y: 650, w: 110, h: 110, s: 1, corner: 1 };
        if (i === 20) return { x: 0, y: 0, w: 110, h: 110, s: 2, corner: 1 };
        if (i === 30) return { x: 650, y: 0, w: 110, h: 110, s: 3, corner: 1 };
        if (i < 10) return { x: 650 - i * 60, y: 650, w: 60, h: 110, s: 0 };
        if (i < 20) return { x: 0, y: 650 - (i - 10) * 60, w: 110, h: 60, s: 1 };
        if (i < 30) return { x: 110 + (i - 21) * 60, y: 0, w: 60, h: 110, s: 2 };
        return { x: 650, y: 110 + (i - 31) * 60, w: 110, h: 60, s: 3 };
    }
    const OFF = [[-12, -13], [12, -13], [0, 15]];
    const PIP = {
        1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    };

    /* ---------- svg board ---------- */
    const svg = $("[data-svg]");
    let L = null, die1 = null, die2 = null, potTxt = null, turnTxt = null, sumTxt = null, seedTxt = null;
    const tokEls = [], hitEls = [];
    let boardKey = "";
    const previewTiles = makeTiles({ rng: 987654321 });
    function railIcon(x, y, p) {
        const g = mk("g", { transform: "translate(" + x + "," + y + ")", stroke: "#9fb4d9", fill: "none", "stroke-width": 2, "stroke-linecap": "round" }, p);
        mk("rect", { x: -11, y: -8, width: 22, height: 12, rx: 2.5 }, g);
        mk("path", { d: "M-5 -8v-5h6v5" }, g);
        mk("circle", { cx: -5.5, cy: 6.5, r: 2.6, fill: "#9fb4d9" }, g);
        mk("circle", { cx: 5.5, cy: 6.5, r: 2.6, fill: "#9fb4d9" }, g);
    }
    function chestIcon(x, y, p) {
        const g = mk("g", { transform: "translate(" + x + "," + y + ")", stroke: "#60a5fa", fill: "none", "stroke-width": 2, "stroke-linecap": "round" }, p);
        mk("rect", { x: -11, y: -6, width: 22, height: 13, rx: 2.5 }, g);
        mk("path", { d: "M-11 -1h22M0 -1v4" }, g);
        mk("path", { d: "M-11 -6q11 -7 22 0" }, g);
    }
    function utilIcon(x, y, water, p) {
        const g = mk("g", { transform: "translate(" + x + "," + y + ")", fill: "none", stroke: water ? "#7dd3fc" : "#fde047", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, p);
        if (water) mk("path", { d: "M0 -9C5 -2 7 1 7 4a7 7 0 1 1 -14 0c0 -3 2 -6 7 -13Z" }, g);
        else mk("path", { d: "M2 -9L-6 2h5L-2 9L7 -2h-5Z" }, g);
    }
    function mkDie(x, y, parent) {
        const g = mk("g", { transform: "translate(" + x + "," + y + ")" }, parent);
        mk("rect", { x: -28, y: -28, width: 56, height: 56, rx: 10, fill: "#f1f5f9", stroke: "#64748b", "stroke-width": 2 }, g);
        return mk("g", {}, g);
    }
    function setDie(g, v) {
        g.innerHTML = "";
        (PIP[v] || PIP[1]).forEach((p) => mk("circle", { cx: p[0] * 11.5, cy: p[1] * 11.5, r: 5.4, fill: "#1e293b" }, g));
    }
    function buildBoard(tiles) {
        svg.innerHTML = "";
        hitEls.length = 0; tokEls.length = 0;
        L = { tiles: mk("g", {}, svg), decor: mk("g", {}, svg), toks: mk("g", {}, svg), ui: mk("g", {}, svg), hit: mk("g", {}, svg) };
        tiles.forEach((t, i) => {
            const g = geo(i), T = L.tiles;
            mk("rect", { x: g.x + 1, y: g.y + 1, width: g.w - 2, height: g.h - 2, rx: 4, fill: g.corner ? "#141d33" : "#111827", stroke: "#232c40", "stroke-width": 1.2 }, T);
            const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
            const vert = !g.corner && (g.s === 0 || g.s === 2);
            const ccx = g.corner ? cx : g.s === 1 ? g.x + 47 : g.s === 3 ? g.x + 63 : cx;
            const nameY = g.s === 0 ? [g.y + 50, g.y + 62] : g.s === 2 ? [g.y + 34, g.y + 46] : [cy - 3, cy - 3];
            const priceY = g.s === 0 ? g.y + 92 : g.s === 2 ? g.y + 74 : cy + 13;
            const iconY = g.s === 0 ? g.y + 44 : g.s === 2 ? g.y + 30 : g.corner ? cy : g.y + 20;
            const labY = g.s === 0 ? g.y + 72 : g.s === 2 ? g.y + 58 : g.y + 42;
            const subY = g.s === 0 ? g.y + 86 : g.s === 2 ? g.y + 72 : g.y + 54;
            if (t.t === "prop") {
                const c = GROUPS[t.g].c;
                const b = g.s === 0 ? [g.x + 1, g.y + 1, g.w - 2, 14] : g.s === 2 ? [g.x + 1, g.y + g.h - 15, g.w - 2, 14] : g.s === 1 ? [g.x + g.w - 15, g.y + 1, 14, g.h - 2] : [g.x + 1, g.y + 1, 14, g.h - 2];
                mk("rect", { x: b[0], y: b[1], width: b[2], height: b[3], fill: c, opacity: 0.9 }, T);
                const words = t.name.split(" ");
                if (vert && words.length > 1) {
                    txt(cx, nameY[0], words[0], { "font-size": 9.5, "font-weight": 700 }, T);
                    txt(cx, nameY[1], words.slice(1).join(" "), { "font-size": 9.5, "font-weight": 700 }, T);
                } else txt(ccx, vert ? (nameY[0] + nameY[1]) / 2 : nameY[0], t.name, { "font-size": vert ? 9.5 : 10, "font-weight": 700 }, T);
                txt(ccx, priceY, "$" + t.price, { "font-size": 9, fill: "#8b93a7" }, T);
            } else if (t.t === "rail") {
                railIcon(ccx, iconY, T);
                txt(ccx, labY, t.name, { "font-size": 8.5, "font-weight": 700 }, T);
                txt(ccx, subY, "$" + t.price, { "font-size": 8.5, fill: "#8b93a7" }, T);
            } else if (t.t === "util") {
                utilIcon(ccx, iconY, /Water/.test(t.name), T);
                txt(ccx, labY, t.name, { "font-size": 8.5, "font-weight": 700 }, T);
                txt(ccx, subY, "$" + t.price, { "font-size": 8.5, fill: "#8b93a7" }, T);
            } else if (t.t === "chance") {
                txt(ccx, iconY + 8, "?", { "font-size": 26, "font-weight": 800, fill: "#fbbf24" }, T);
                txt(ccx, labY, "CHANCE", { "font-size": 8, "letter-spacing": 1, fill: "#8b93a7" }, T);
            } else if (t.t === "chest") {
                chestIcon(ccx, iconY, T);
                txt(ccx, labY, "CHEST", { "font-size": 8, "letter-spacing": 1, fill: "#8b93a7" }, T);
            } else if (t.t === "tax") {
                txt(ccx, iconY + 7, "$", { "font-size": 20, "font-weight": 800, fill: "#fca5a5" }, T);
                txt(ccx, labY, t.name, { "font-size": 8, fill: "#c3cde2" }, T);
                txt(ccx, subY, "pay $" + t.amt, { "font-size": 8, fill: "#8b93a7" }, T);
            } else if (i === 0) {
                txt(cx, cy - 2, "GO", { "font-size": 28, "font-weight": 800, fill: "#34d399" }, T);
                txt(cx, cy + 18, "collect $200", { "font-size": 8.5, fill: "#8b93a7" }, T);
                mk("path", { d: "M" + (cx + 26) + " " + (cy - 30) + "h-16m0 0 6 -6m-6 6 6 6", stroke: "#34d399", "stroke-width": 2.5, fill: "none", "stroke-linecap": "round" }, T);
            } else if (i === 10) {
                txt(cx, cy - 14, "JAIL", { "font-size": 16, "font-weight": 800, fill: "#fca5a5" }, T);
                const jg = mk("g", { stroke: "#8b93a7", "stroke-width": 2, "stroke-linecap": "round" }, T);
                mk("rect", { x: cx - 16, y: cy - 4, width: 32, height: 22, rx: 3, fill: "none" }, jg);
                [-8, 0, 8].forEach((dx) => mk("path", { d: "M" + (cx + dx) + " " + (cy - 4) + "v22" }, jg));
                txt(cx, cy + 34, "just visiting", { "font-size": 8.5, fill: "#8b93a7" }, T);
            } else if (i === 20) {
                txt(cx, cy - 16, "FREE", { "font-size": 15, "font-weight": 800, fill: "#93c5fd" }, T);
                txt(cx, cy + 2, "PARKING", { "font-size": 15, "font-weight": 800, fill: "#93c5fd" }, T);
                txt(cx, cy + 22, "wins the pot", { "font-size": 8.5, fill: "#8b93a7" }, T);
            } else {
                txt(cx, cy - 16, "GO TO", { "font-size": 12, "font-weight": 800, fill: "#fca5a5" }, T);
                txt(cx, cy + 4, "JAIL", { "font-size": 17, "font-weight": 800, fill: "#fca5a5" }, T);
                mk("path", { d: "M" + (cx - 24) + " " + (cy + 24) + "h16m0 0 -6 -6m6 6 -6 6", stroke: "#fca5a5", "stroke-width": 2.5, fill: "none", "stroke-linecap": "round" }, T);
            }
            const hit = mk("rect", { x: g.x + 1, y: g.y + 1, width: g.w - 2, height: g.h - 2, rx: 4, fill: "transparent", class: "mo-hit", "data-tile": i }, L.hit);
            mk("title", {}, hit);
            hitEls.push(hit);
        });
        /* center panel */
        mk("rect", { x: 116, y: 116, width: 528, height: 528, rx: 18, fill: "#0d1322", stroke: "#232c40", "stroke-width": 1.2 }, L.ui);
        txt(380, 206, "MONOPOLY", { "font-size": 34, "font-weight": 800, fill: "#fff", "letter-spacing": 8 }, L.ui);
        txt(380, 230, "RANDOM CITY EDITION", { "font-size": 10.5, fill: "#8b93a7", "letter-spacing": 4 }, L.ui);
        potTxt = txt(380, 268, "", { "font-size": 15, "font-weight": 700, fill: "#fcd34d" }, L.ui);
        die1 = mkDie(330, 352, L.ui);
        die2 = mkDie(430, 352, L.ui);
        sumTxt = txt(380, 416, "", { "font-size": 12.5, fill: "#8b93a7" }, L.ui);
        turnTxt = txt(380, 452, "", { "font-size": 16, "font-weight": 700, fill: "#c3cde2" }, L.ui);
        seedTxt = txt(380, 478, "", { "font-size": 10.5, fill: "#5b6478", "letter-spacing": 1 }, L.ui);
        setDie(die1, 6); setDie(die2, 6);
        /* tokens */
        const names = state.names || ["You", "Rex AI", "Nova AI"];
        for (let i = 0; i < 3; i++) {
            const g = mk("g", { class: "mo-tok" }, L.toks);
            mk("circle", { r: 10, fill: SEATC[i], stroke: "#0b0f17", "stroke-width": 2.5 }, g);
            txt(0, 3.5, (names[i] || "?").trim().charAt(0).toUpperCase() || "?", { "font-size": 10, "font-weight": 800, fill: "#101828" }, g);
            tokEls.push(g);
        }
    }

    /* ---------- local UI state ---------- */
    let chosenDiff = "normal";
    let lastToast = 0, lastFx = 0, lastRoll = 0, spinning = false;
    let prevBills = null, autoTimer = null, cashRaf = null;
    const hop = [0, 1, 2].map(() => ({ shown: 0, warp: 0, timer: null }));
    const shownCash = [0, 0, 0];
    const mySeat = () => (state.seatActor ? state.seatActor.indexOf(playerIndex) : 0);
    const started = () => !!(state && state.tiles);
    const myTurn = () => started() && state.turn === mySeat() && !state.players[mySeat()].bankrupt;

    function statusText() {
        if (!started()) return online && !room.isHost ? "Waiting for host…" : "Ready";
        const n = state.names[state.turn];
        switch (state.phase) {
            case "over": return "Game over";
            case "rolling": return n + " is rolling…";
            case "moving": return n + " is moving…";
            case "settle": return n + " finishes the turn…";
            case "card": return n + " drew a card";
            case "buy": return state.turn === mySeat() ? "Buy " + state.tiles[state.pending].name + "?" : n + " is deciding…";
            case "roll":
                if (state.turn === mySeat()) {
                    const p = state.players[mySeat()];
                    if (p.bankrupt) return "You are bankrupt — spectating";
                    return p.jail > 0 ? "In jail — roll doubles, pay $50 (J) or use a card" : state.curDbl ? "Doubles! Roll again (Space)" : "Your turn — roll the dice (Space)";
                }
                return n + " is thinking…";
            default: return "…";
        }
    }
    function actionButtons() {
        const out = [];
        if (!started() || state.phase === "over") return out;
        const me = mySeat(), p = state.players[me], mine = state.turn === me && !p.bankrupt;
        if (state.phase === "roll" && mine) {
            out.push({ act: "roll", label: "Roll dice", short: "Roll", key: "Space", primary: true });
            if (p.jail > 0) out.push({ act: "jailPay", label: p.free > 0 ? "Use jail card" : "Pay $50", short: p.free > 0 ? "Card" : "$50", key: "J" });
        }
        if (state.phase === "buy" && mine && state.pending != null) {
            const t = state.tiles[state.pending];
            out.push({ act: "buy", label: "Buy " + fmt$(t.price), short: "Buy", key: "B", primary: true, disabled: p.cash < t.price });
            out.push({ act: "pass", label: "Pass", short: "Pass", key: "N" });
        }
        if (state.phase === "card" && mine) out.push({ act: "cardOk", label: "Continue", short: "OK", key: "K", primary: true });
        return out;
    }
    function renderActions() {
        $("[data-actstatus]").textContent = statusText();
        const btns = actionButtons();
        const html = (big) => btns.length
            ? btns.map((b) => `<button class="mo-btn${b.primary ? " primary" : ""}" type="button" data-act="${b.act}"${b.disabled ? " disabled" : ""}>${b.label}${!big && b.key ? `<span class="mo-key">${b.key}</span>` : ""}</button>`).join("")
            : big ? `<button class="mo-btn" type="button" disabled>${started() && state.phase !== "over" ? "Waiting…" : "—"}</button>` : "";
        $("[data-actbtns]").innerHTML = html(false);
        $("[data-vbar]").innerHTML = html(true);
        $("[data-hudacts]").innerHTML = btns.map((b) => `<button class="mo-btn${b.primary ? " primary" : ""}" type="button" data-act="${b.act}"${b.disabled ? " disabled" : ""}>${b.short || b.label}</button>`).join("");
    }
    function renderPlayers() {
        const box = $("[data-players]");
        box.innerHTML = "";
        if (!started()) {
            box.innerHTML = '<div class="mo-boxtitle">PLAYERS</div><div style="font-size:12px;color:var(--mut)">Start a game to seat the players.</div>';
            return;
        }
        const me = mySeat();
        state.players.forEach((p, i) => {
            const row = document.createElement("div");
            row.className = "mo-prow" + (i === state.turn && !p.bankrupt && state.phase !== "over" ? " cur" : "") + (p.bankrupt ? " out" : "");
            const dot = document.createElement("span"); dot.className = "mo-dot"; dot.style.background = SEATC[i];
            const nm = document.createElement("b"); nm.textContent = state.names[i] + (i === me ? " (you)" : "");
            const props = state.tiles.filter((t) => t.owner === i).length;
            const pc = document.createElement("span"); pc.className = "mo-tag"; pc.textContent = props + "p";
            const cash = document.createElement("span"); cash.className = "mo-pcash"; cash.dataset.cash = String(i); cash.textContent = fmt$(shownCash[i]);
            row.appendChild(dot); row.appendChild(nm); row.appendChild(pc); row.appendChild(cash);
            if (p.bankrupt) { const t = document.createElement("span"); t.className = "mo-tag dead"; t.textContent = "OUT"; row.appendChild(t); }
            else if (p.jail > 0) { const t = document.createElement("span"); t.className = "mo-tag jail"; t.textContent = "JAIL " + p.jail; row.appendChild(t); }
            if (p.free > 0 && !p.bankrupt) { const t = document.createElement("span"); t.className = "mo-tag free"; t.textContent = "KEY"; row.appendChild(t); }
            box.appendChild(row);
        });
    }
    function renderHud() {
        $("[data-hud-pot]").textContent = fmt$(state.pot);
        $("[data-hud-turn]").textContent = started() ? (state.phase === "over" ? "Over" : state.names[state.turn]) : "—";
        $("[data-hud-seed]").textContent = started() ? "city #" + state.seed.toString(36) + " · " + DIFFS[state.difficulty].label : "city —";
        $$("[data-startbtn]").forEach((b) => { b.disabled = online && !room.isHost; });
        $("[data-startnote]").textContent = online ? (room.isHost ? "You are the host — you control the game flow." : "Only the host can start. Seats are shuffled randomly.") : "Offline vs two AI rivals. Cheats available (C).";
    }
    function renderCenter() {
        potTxt.textContent = state.pot > 0 ? "FREE PARKING POT " + fmt$(state.pot) : "FREE PARKING POT EMPTY";
        turnTxt.textContent = !started() ? "Press Start" : state.phase === "over" ? (state.winner != null ? state.names[state.winner] + " wins" : "Game over") : state.names[state.turn] + " to play";
        sumTxt.textContent = started() && state.rollId > 0 ? "last roll " + state.dice[0] + " + " + state.dice[1] + " = " + (state.dice[0] + state.dice[1]) : "";
        seedTxt.textContent = started() ? "seed #" + state.seed.toString(36) + " · " + DIFFS[state.difficulty].label.toLowerCase() + (state.cheat.free ? " · free-build" : "") : "a new city every game";
        const diceEl = $("[data-hud-dice]");
        if (diceEl) diceEl.textContent = started() && state.rollId > 0 ? "dice " + state.dice[0] + "+" + state.dice[1] + "=" + (state.dice[0] + state.dice[1]) : "dice —";
    }
    function renderDecor() {
        L.decor.innerHTML = "";
        if (!started()) return;
        state.tiles.forEach((t, i) => {
            const g = geo(i);
            if (t.owner != null && (t.t === "prop" || t.t === "rail" || t.t === "util")) {
                const a = g.s === 0 ? { x: g.x + 2, y: g.y + g.h - 5, width: g.w - 4, height: 3 }
                    : g.s === 2 ? { x: g.x + 2, y: g.y + 2, width: g.w - 4, height: 3 }
                        : g.s === 1 ? { x: g.x + 2, y: g.y + 2, width: 3, height: g.h - 4 }
                            : { x: g.x + g.w - 5, y: g.y + 2, width: 3, height: g.h - 4 };
                a.fill = SEATC[t.owner]; a.rx = 1.5;
                mk("rect", a, L.decor);
            }
            if (t.t === "prop" && t.level > 0) {
                const hotel = t.level === 5, n = hotel ? 1 : t.level;
                for (let k = 0; k < n; k++) {
                    let hx, hy;
                    if (g.s === 0) { hx = g.x + ((k + 0.5) / n) * g.w; hy = g.y + 8; }
                    else if (g.s === 2) { hx = g.x + ((k + 0.5) / n) * g.w; hy = g.y + g.h - 8; }
                    else if (g.s === 1) { hx = g.x + g.w - 8; hy = g.y + ((k + 0.5) / n) * g.h; }
                    else { hx = g.x + 8; hy = g.y + ((k + 0.5) / n) * g.h; }
                    mk("path", hotel
                        ? { d: "M-8 2 L0 -5 L8 2 V6 H-8 Z", transform: "translate(" + hx + "," + hy + ")", fill: "#f87171", stroke: "#7f1d1d", "stroke-width": 1.2 }
                        : { d: "M-5 1 L0 -4 L5 1 V5 H-5 Z", transform: "translate(" + hx + "," + hy + ")", fill: "#4ade80", stroke: "#14532d", "stroke-width": 1.1 }, L.decor);
                }
            }
            const title = hitEls[i] && hitEls[i].querySelector("title");
            if (title) {
                let s = t.name;
                if (t.t === "prop" || t.t === "rail" || t.t === "util") s += " — " + (t.owner == null ? "unowned $" + t.price : state.names[t.owner] + " · rent " + fmt$(rentOf(state, i)));
                title.textContent = s;
            }
        });
        if (selected != null) {
            const g = geo(selected);
            mk("rect", { x: g.x + 2, y: g.y + 2, width: g.w - 4, height: g.h - 4, rx: 5, fill: "none", stroke: "#818cf8", "stroke-width": 2.5 }, L.decor);
        }
    }
    function placeToken(seat, pos) {
        const g = geo(pos), el = tokEls[seat];
        if (el) el.style.transform = "translate(" + (g.x + g.w / 2 + OFF[seat][0]) + "px," + (g.y + g.h / 2 + OFF[seat][1]) + "px)";
    }
    function syncTokens() {
        if (!started()) { tokEls.forEach((el) => (el.style.display = "none")); return; }
        state.players.forEach((p, seat) => {
            const a = hop[seat], el = tokEls[seat];
            if (!el) return;
            el.style.display = p.bankrupt ? "none" : "";
            if (p.warp !== a.warp) { a.warp = p.warp; a.shown = p.pos; placeToken(seat, p.pos); el.classList.remove("moving"); return; }
            if (a.shown === p.pos) { placeToken(seat, p.pos); el.classList.remove("moving"); return; }
            if (a.timer) return;
            el.classList.add("moving");
            const step = () => {
                a.timer = null;
                const q = state.players && state.players[seat];
                if (!q) { el.classList.remove("moving"); return; }
                if (q.warp !== a.warp) { a.warp = q.warp; a.shown = q.pos; placeToken(seat, q.pos); el.classList.remove("moving"); return; }
                if (a.shown === q.pos) { el.classList.remove("moving"); return; }
                a.shown = (a.shown + 1) % 40;
                placeToken(seat, a.shown);
                if (a.shown !== q.pos) a.timer = after(q.hopMs || 160, step);
                else el.classList.remove("moving");
            };
            step();
        });
    }
    function syncCash() {
        if (!started()) { $("[data-hud-cash]").textContent = fmt$(0); return; }
        if (cashRaf != null) return;
        const tick = () => {
            cashRaf = null;
            if (destroyed || !state.players) return;
            let done = true;
            state.players.forEach((p, i) => {
                const d = p.cash - shownCash[i];
                if (Math.abs(d) > 0.6) { shownCash[i] += d * 0.16; done = false; }
                else shownCash[i] = p.cash;
                $$('[data-cash="' + i + '"]').forEach((el) => (el.textContent = fmt$(shownCash[i])));
            });
            $("[data-hud-cash]").textContent = fmt$(shownCash[mySeat()]);
            if (!done) cashRaf = requestAnimationFrame(tick);
        };
        cashRaf = requestAnimationFrame(tick);
    }
    function syncDice() {
        if (state.rollId !== lastRoll) {
            lastRoll = state.rollId;
            if (state.rollId > 0) {
                spinning = true;
                const iv = setInterval(() => { setDie(die1, 1 + ((Math.random() * 6) | 0)); setDie(die2, 1 + ((Math.random() * 6) | 0)); }, 70);
                timers.add(iv);
                after(620, () => { clearInterval(iv); timers.delete(iv); spinning = false; if (state.dice) { setDie(die1, state.dice[0]); setDie(die2, state.dice[1]); } });
            }
        } else if (!spinning && state.dice) { setDie(die1, state.dice[0]); setDie(die2, state.dice[1]); }
    }
    function syncFx() {
        (state.fxq || []).forEach((f) => {
            if (f.id <= lastFx) return;
            lastFx = f.id;
            if (!state.players) return;
            const p = state.players[f.seat], g = geo(p.pos);
            const sp = document.createElement("span");
            sp.className = "mo-float " + (f.delta >= 0 ? "up" : "down");
            sp.textContent = (f.delta >= 0 ? "+" : "-") + fmt$(Math.abs(f.delta));
            sp.style.left = ((g.x + g.w / 2) / 760) * 100 + "%";
            sp.style.top = ((g.y + g.h / 2) / 760) * 100 + "%";
            $("[data-fxlayer]").appendChild(sp);
            after(1400, () => sp.remove());
            const el = root.querySelector('[data-cash="' + f.seat + '"]');
            if (el) { el.classList.remove("pulse-up", "pulse-down"); void el.offsetWidth; el.classList.add(f.delta >= 0 ? "pulse-up" : "pulse-down"); }
        });
        if (state.toast && state.toast.id > lastToast) {
            lastToast = state.toast.id;
            const box = $("[data-toasts]");
            const t = document.createElement("div");
            t.className = "mo-toast " + state.toast.kind;
            t.textContent = state.toast.text;
            box.appendChild(t);
            while (box.children.length > 3) box.firstChild.remove();
            after(2300, () => t.remove());
        }
    }
    function renderCard() {
        const ov = $("[data-cardov]");
        if (!state.card) { ov.hidden = true; return; }
        const def = (state.card.deck === "C" ? CHANCE : CHEST)[state.card.i];
        const chance = state.card.deck === "C";
        ov.className = "mo-cardov " + (chance ? "chance" : "chest");
        ov.innerHTML = '<div class="mo-ctitle">' + (chance ? "? CHANCE" : "COMMUNITY CHEST") + '</div><div class="mo-ctext">' + esc(def.txt) + "</div>" + (myTurn() ? '<button class="mo-btn primary" type="button" data-act="cardOk">Continue<span class="mo-key">K</span></button>' : "");
        ov.hidden = false;
    }
    function pips(level) {
        let h = "";
        for (let k = 0; k < 4; k++) h += '<span class="mo-pip' + (level < 5 && k < level ? " h" : "") + '"></span>';
        h += '<span class="mo-pip' + (level === 5 ? " hotel" : "") + '"></span>';
        return '<span class="mo-pips">' + h + "</span>";
    }
    function renderDeed() {
        const box = $("[data-deed]");
        const buyI = state.phase === "buy" && state.pending != null && state.turn === mySeat() ? state.pending : null;
        const i = buyI != null ? buyI : selected;
        if (!started() || i == null) {
            box.innerHTML = '<div class="mo-boxtitle">TITLE DEED</div><div style="font-size:12px;color:var(--mut)">Click any board tile to inspect it. Build houses &amp; hotels from your own deed cards.</div>';
            return;
        }
        const t = state.tiles[i], me = mySeat();
        let bar = "#26304a", sub = "", rows = [], btns = [], desc = "";
        const sellBtn = '<button class="mo-btn ghost" type="button" data-act="sellProp" data-i="' + i + '"' + (canSellProp(state, me, i) ? "" : " disabled") + ">Sell deed +" + fmt$(t.price / 2) + "</button>";
        if (t.t === "prop") {
            bar = GROUPS[t.g].c;
            sub = GROUPS[t.g].n + " set · " + (t.owner == null ? "unowned" : esc(state.names[t.owner]) + (ownsGroup(state, t.owner, t.g) ? " · full set x2" : ""));
            rows = [["Price", fmt$(t.price)], ["Rent", fmt$(t.rt[0])], ["Rent · full set", fmt$(t.rt[1])], ["With 1 house", fmt$(t.rt[2])], ["With 2 houses", fmt$(t.rt[3])], ["With 3 houses", fmt$(t.rt[4])], ["With 4 houses", fmt$(t.rt[5])], ["With hotel", fmt$(t.rt[6])], ["House / hotel cost", fmt$(t.hc)]];
            if (t.owner != null) rows.push(["Rent right now", fmt$(rentOf(state, i)), true]);
            if (t.owner === me) {
                btns.push('<button class="mo-btn" type="button" data-act="build" data-i="' + i + '"' + (canBuild(state, me, i) ? "" : " disabled") + ">" + (t.level === 4 ? "Build hotel " : "Build house ") + (state.cheat.free ? "FREE" : fmt$(t.hc)) + "</button>");
                btns.push('<button class="mo-btn ghost" type="button" data-act="sell" data-i="' + i + '"' + (canSellHouse(state, me, i) ? "" : " disabled") + ">Sell building +" + fmt$(t.hc / 2) + "</button>");
                btns.push(sellBtn);
            }
        } else if (t.t === "rail") {
            sub = "Railroad · " + (t.owner == null ? "unowned" : esc(state.names[t.owner]));
            rows = [["Price", fmt$(t.price)], ["1 railroad", "$25"], ["2 railroads", "$50"], ["3 railroads", "$100"], ["4 railroads", "$200"]];
            if (t.owner != null) rows.push(["Rent right now", fmt$(rentOf(state, i)), true]);
            if (t.owner === me) btns.push(sellBtn);
        } else if (t.t === "util") {
            sub = "Utility · " + (t.owner == null ? "unowned" : esc(state.names[t.owner]));
            rows = [["Price", fmt$(t.price)], ["Own 1", "4 x dice"], ["Own both", "10 x dice"]];
            if (t.owner != null) rows.push(["Rent right now", fmt$(rentOf(state, i)), true]);
            if (t.owner === me) btns.push(sellBtn);
        } else {
            sub = { go: "Corner", jail: "Corner", park: "Corner", gotojail: "Corner", chance: "Card tile", chest: "Card tile", tax: "Tax tile" }[t.t];
            desc = { go: "Collect $200 whenever you pass or land here.", jail: "Just visiting — unless you were sent here. Escape with doubles, $50 or a jail-free card.", park: "Landing here scoops the whole tax pot (now " + fmt$(state.pot) + ").", gotojail: "Sends you straight to Jail. No GO salary.", chance: "Draw a Chance card: moves, money and mayhem.", chest: "Draw a Community Chest card: mostly money in and out.", tax: "Pay " + fmt$(t.amt) + " into the Free Parking pot." }[t.t];
        }
        if (buyI === i) {
            btns.unshift('<button class="mo-btn primary" type="button" data-act="buy"' + (state.players[me].cash < t.price ? " disabled" : "") + ">Buy " + fmt$(t.price) + "</button>");
            btns.push('<button class="mo-btn ghost" type="button" data-act="pass">Pass</button>');
        }
        const rowsHtml = rows.map((r) => r[2] ? '<span class="hl">' + r[0] + '</span><b class="hl">' + r[1] + "</b>" : "<span>" + r[0] + "</span><b>" + r[1] + "</b>").join("");
        box.innerHTML = '<div class="mo-boxtitle"><span>TITLE DEED · #' + i + "</span>" + (t.t === "prop" ? pips(t.level) : "") + '</div><div class="mo-deedbar" style="background:' + bar + '"></div><div class="mo-deedname">' + esc(t.name) + '</div><div class="mo-deedsub">' + sub + "</div>" + (desc ? '<p style="font-size:12px;color:#c3cde2;margin:6px 0 0">' + desc + "</p>" : '<div class="mo-rows">' + rowsHtml + "</div>") + (btns.length ? '<div class="mo-deedbtns">' + btns.join("") + "</div>" : "");
    }
    function renderWallet() {
        const box = $("[data-wallet]");
        if (!started()) {
            box.innerHTML = '<div class="mo-boxtitle">WALLET</div><div style="font-size:12px;color:var(--mut)">Your cash, broken into Monopoly bills.</div>';
            return;
        }
        const me = mySeat(), cash = state.players[me].cash;
        const counts = denoms(cash);
        const colors = ["#e8a86b", "#e9c46a", "#6fb1e8", "#79c99e", "#e8d26f", "#e78fb3", "#d7dde8"];
        let h = '<div class="mo-boxtitle"><span>WALLET · ' + fmt$(cash) + "</span><span>" + (state.players[me].free > 0 ? "jail-free x" + state.players[me].free : "") + '</span></div><div class="mo-bills">';
        counts.forEach((n, k) => {
            const flash = prevBills && prevBills[k] !== n ? " flash" : "";
            h += '<div class="mo-bill' + (n === 0 ? " zero" : "") + flash + '" style="background:' + colors[k] + '">$' + DENOMS[k] + "<small>x" + n + "</small></div>";
        });
        box.innerHTML = h + "</div>";
        prevBills = counts;
    }
    function renderPortfolio() {
        const box = $("[data-port]");
        box.hidden = !portOpen;
        if (!portOpen) return;
        if (!started()) { box.innerHTML = '<div class="mo-boxtitle">PORTFOLIO</div>'; return; }
        const me = mySeat();
        const mine = state.tiles.map((t, i) => [t, i]).filter(([t]) => t.owner === me)
            .sort((a, b) => (a[0].g == null ? 9 : a[0].g) - (b[0].g == null ? 9 : b[0].g) || a[0].price - b[0].price);
        let h = '<div class="mo-boxtitle"><span>PORTFOLIO · ' + mine.length + '</span><button class="mo-btn ghost" type="button" data-act="manage" style="padding:2px 8px;font-size:10.5px">Close</button></div>';
        if (!mine.length) h += '<div style="font-size:12px;color:var(--mut)">No properties yet — land on a street and buy it.</div>';
        mine.forEach(([t, i]) => {
            const c = t.t === "prop" ? GROUPS[t.g].c : "#8b93a7";
            const cb = t.t === "prop" && canBuild(state, me, i);
            h += '<div class="mo-prow2" data-tile="' + i + '"><span class="mo-dot" style="background:' + c + '"></span><span>' + esc(t.name) + "</span>" + (t.t === "prop" ? pips(t.level) : "") + '<span style="color:var(--mut);font-size:11px">' + fmt$(rentOf(state, i)) + "</span>" + (t.t === "prop" ? '<button class="mo-btn ghost" type="button" data-act="build" data-i="' + i + '"' + (cb ? "" : " disabled") + ">+house</button>" : "") + "</div>";
        });
        box.innerHTML = h;
    }
    function renderLog() {
        const box = $("[data-log]");
        box.innerHTML = "";
        if (!state.log.length) { box.innerHTML = "<div>Game log appears here.</div>"; return; }
        state.log.forEach((l) => {
            const d = document.createElement("div");
            if (l.k) d.className = l.k;
            d.textContent = l.t;
            box.appendChild(d);
        });
    }
    function syncControls() {
        const cb = $("[data-cheats]");
        if (cb) { cb.disabled = online; cb.classList.toggle("on", cheatOpen); }
        const pb = $("[data-pause]");
        if (pb) {
            const label = pb.querySelector(".mo-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pb.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pb.title = (paused ? "Resume" : "Pause") + " (P)";
            pb.disabled = online;
        }
        const rb = $("[data-restart]"); if (rb) rb.disabled = online && !room.isHost;
        const mb = root.querySelector('[data-act="manage"]'); if (mb) mb.classList.toggle("on", portOpen);
        const side = $("[data-side]"); if (side) side.classList.toggle("locked", uiBlocked());
        const app = $("[data-mo]"); if (app) app.classList.toggle("frozen", paused);
    }
    function renderOverlays() {
        const block = uiBlocked();
        $("[data-ov-start]").hidden = state.phase !== "lobby" || block;
        $("[data-ov-over]").hidden = state.phase !== "over" || block;
        $("[data-ov-pause]").hidden = !paused || cheatOpen || helpOpen;
        $("[data-ov-cheat]").hidden = !cheatOpen || online || helpOpen;
        $("[data-ov-help]").hidden = !helpOpen;
        $("[data-diffrow]").innerHTML = Object.keys(DIFFS).map((k) => '<button class="mo-btn' + (chosenDiff === k ? " on" : "") + '" type="button" data-act="diff" data-diff="' + k + '">' + DIFFS[k].label + '<br><small style="color:var(--mut)">' + fmt$(DIFFS[k].cash) + "</small></button>").join("");
        if (state.phase === "over") {
            const me = mySeat();
            const win = state.winner === me;
            $("[data-over-title]").textContent = win ? "Victory!" : state.winner != null ? state.names[state.winner] + " wins" : "Game over";
            $("[data-over-reason]").textContent = state.reason;
            const p = state.players[me];
            const props = state.tiles.filter((t) => t.owner === me).length;
            const houses = state.tiles.reduce((a, t) => a + (t.owner === me && t.level < 5 ? t.level : 0), 0);
            const hotels = state.tiles.filter((t) => t.owner === me && t.level === 5).length;
            $("[data-over-stats]").innerHTML = [["Cash", fmt$(p.cash)], ["Deeds", props], ["Houses", houses], ["Hotels", hotels]].map(([k, v]) => '<div class="mo-stat"><b>' + v + "</b><span>" + k.toUpperCase() + "</span></div>").join("");
            $("[data-over-note]").textContent = online && !room.isHost ? "Waiting for the host to start the next game…" : "A brand-new random city will be generated.";
        }
        const fb = $("[data-freebtn]");
        if (fb) { fb.textContent = "Free building: " + (state.cheat.free ? "ON" : "OFF"); fb.classList.toggle("on", state.cheat.free); }
        $("[data-rigstate]").textContent = state.cheat.rig ? "next: " + state.cheat.rig.join(" + ") : "";
    }
    function render() {
        if (destroyed || !state) return;
        const tiles = started() ? state.tiles : previewTiles;
        const key = started() ? state.seed + ":" + state.difficulty + ":" + (state.names || []).join(",") : "preview";
        if (key !== boardKey) {
            boardKey = key;
            buildBoard(tiles);
            hop.forEach((a) => { if (a.timer) { clearTimeout(a.timer); timers.delete(a.timer); } a.timer = null; a.shown = 0; a.warp = 0; });
            shownCash[0] = shownCash[1] = shownCash[2] = 0;
            lastFx = 0; lastToast = 0; lastRoll = 0; prevBills = null;
            $("[data-fxlayer]").innerHTML = ""; $("[data-toasts]").innerHTML = "";
            selected = null;
        }
        renderOverlays(); syncControls(); renderHud(); renderPlayers(); renderDecor(); syncTokens(); syncDice(); renderCenter(); renderCard(); renderActions(); renderDeed(); renderWallet(); renderPortfolio(); renderLog(); syncFx(); syncCash();
        $("[data-status]").textContent = statusText();
    }

    /* ---------- host loop / sync ---------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function pump() {
        if (autoTimer != null) { clearTimeout(autoTimer); timers.delete(autoTimer); autoTimer = null; }
        /* Help, cheats and pause all freeze the host loop. This module uses
           relative state.wait deadlines (no Date.now/performance.now anchor),
           so rescheduling the full wait on resume shifts the deadline past the
           pause interval instead of firing a backlog of skipped turns. */
        if (destroyed || uiBlocked()) return;
        if (state.auto && (!online || room.isHost)) {
            const a = state.auto;
            autoTimer = after(state.wait || 300, () => { autoTimer = null; dispatch(a, "sys"); });
        }
    }
    function dispatch(action, actor) {
        if (destroyed || (online && !room.isHost)) return;
        coreApply(state, action, actor);
        publish();
        pump();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        dispatch(action, playerIndex);
    }
    function startGame() {
        if (online && !room.isHost) return;
        let seatActor = [0, 2, 2], names = ["You", "Rex AI", "Nova AI"];
        if (online) {
            seatActor = [0, 1, 2];
            for (let i = 2; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = seatActor[i]; seatActor[i] = seatActor[j]; seatActor[j] = t; }
            const myName = (playerName || "You").trim() || "You";
            names = seatActor.map((a) => (a === 2 ? "Rex AI" : a === playerIndex ? myName : "Rival"));
        }
        submitAction({ type: "start", difficulty: chosenDiff, seed: (Math.random() * 0x7fffffff) | 0, seatActor, names });
    }

    /* ---------- input: mouse, touch, keyboard ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
        pump();
    }
    function setCheatOpen(on) {
        cheatOpen = Boolean(on) && !online && !helpOpen;
        render();
        pump();
    }
    function setPaused(on) {
        paused = Boolean(on) && !online && !helpOpen && !cheatOpen;
        render();
        pump();
    }
    function restartGame() {
        paused = false; cheatOpen = false; helpOpen = false; portOpen = false;
        if (online && !room.isHost) return;
        submitAction({ type: "reset" });
        startGame();
    }
    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        if (event.target.closest("[data-help]")) { toggleHelp(); return; }
        if (event.target.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (event.target.closest("[data-cheats]")) { setCheatOpen(!cheatOpen); return; }
        if (event.target.closest("[data-cheats-close]")) { setCheatOpen(false); return; }
        if (event.target.closest("[data-pause]")) { setPaused(!paused); return; }
        if (event.target.closest("[data-resume]")) { setPaused(false); return; }
        if (event.target.closest("[data-restart]")) { restartGame(); return; }
        const btn = event.target.closest("[data-act]");
        if (btn) {
            if (btn.disabled) return;
            const act = btn.dataset.act;
            if (act === "help") { toggleHelp(); return; }
            if (act === "cheat") { setCheatOpen(!cheatOpen); return; }
            if (act === "reset") { restartGame(); return; }
            if (act === "manage") { portOpen = !portOpen; render(); return; }
            /* Cheat controls stay live while the cheat modal is open. */
            if (act === "cheatOp") { submitAction({ type: "cheat", op: btn.dataset.op }); return; }
            if (act === "rig") { submitAction({ type: "cheat", op: "rig", a: +$("[data-rig-a]").value, b: +$("[data-rig-b]").value }); return; }
            if (uiBlocked()) return;
            if (act === "start") startGame();
            else if (act === "diff") { chosenDiff = btn.dataset.diff; render(); }
            else if (act === "build" || act === "sell" || act === "sellProp") submitAction({ type: act, i: +btn.dataset.i });
            else submitAction({ type: act });
            return;
        }
        const tile = event.target.closest("[data-tile]");
        if (tile && started() && !uiBlocked()) { selected = +tile.dataset.tile; render(); }
    }
    function handleDbl(event) {
        const tile = event.target.closest("[data-tile]");
        if (tile && started() && !uiBlocked()) {
            const i = +tile.dataset.tile;
            if (canBuild(state, mySeat(), i)) submitAction({ type: "build", i });
        }
    }
    function tryKey(type) {
        if (uiBlocked()) return;
        const b = actionButtons().find((x) => x.act === type && !x.disabled);
        if (b) submitAction({ type });
    }
    function handleKey(e) {
        if (destroyed) return;
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "select" || tag === "textarea") return;
        const k = e.key.toLowerCase();
        /* Priority: help → cheats → pause/Escape → game actions. */
        if (k === "h" || e.key === "?") { toggleHelp(); e.preventDefault(); return; }
        if (k === "c") { if (!helpOpen) setCheatOpen(!cheatOpen); e.preventDefault(); return; }
        if (k === "p" || e.key === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) setCheatOpen(false);
            else if (k === "p") setPaused(!paused);
            else if (paused) setPaused(false);
            else { selected = null; render(); }
            e.preventDefault();
            return;
        }
        if (helpOpen || cheatOpen || paused) return;
        if (k === "r") { restartGame(); e.preventDefault(); return; }
        if (e.code === "Space") { e.preventDefault(); if (state.phase === "lobby") startGame(); else tryKey("roll"); }
        else if (k === "b") tryKey("buy");
        else if (k === "n") tryKey("pass");
        else if (k === "j") tryKey("jailPay");
        else if (k === "k" || e.key === "Enter") tryKey("cardOk");
        else if (k === "m") { portOpen = !portOpen; render(); }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("dblclick", handleDbl);
    document.addEventListener("keydown", handleKey);
    const subs = [];
    const keep = (u) => { if (typeof u === "function") subs.push(u); };
    render();
    if (online) {
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            publish();
            pump();
            keep(room.onAction((action) => dispatch(action, 1)));
        } else {
            keep(room.onState((nextState) => { if (nextState) { state = nextState; render(); } }));
        }
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("dblclick", handleDbl);
            document.removeEventListener("keydown", handleKey);
            for (const id of timers) clearTimeout(id);
            timers.clear();
            if (cashRaf != null) cancelAnimationFrame(cashRaf);
            subs.forEach((u) => { try { u(); } catch (e) { /* noop */ } });
        },
    };
}