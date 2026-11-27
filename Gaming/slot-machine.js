/*
 * ==== GAME: slot-machine.js ====
 * Slot Machine — duel slot 3 gulungan (vs Bot / multiplayer room).
 * - Level acak yang DIVERIFIKASI bisa diselesaikan (simulasi Monte Carlo).
 * - Koin acak menentukan giliran pertama; kursi pemain diacak tiap ronde.
 * - Tutorial internal (sekali jalan), cheat overlay (solo), pause, HUD bar.
 * - 4 tema minimalis x 2 pack simbol = variasi tampilan slot.
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "slot-machine", // harus sama dengan nama file (tanpa .js)
    name: "Slot Machine",
    category: "casino",
    catLabel: "Casino",
    desc: "Duel slot 3 gulungan: lempar koin, atur taruhan, dan capai target kredit sebelum lawan. Level acak yang terjamin bisa diselesaikan.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="13" width="30" height="23" rx="4"/><path d="M15.3 16v17"/><path d="M24.7 16v17"/><path d="M35 24h5"/><path d="M40 24v-6"/><circle cx="40" cy="12" r="3.2"/></svg>',
    bg: ["#e9d5ff", "#a78bfa"],
    bestKey: "slotMachineBestLevel",
};

/* ================= aturan murni (tanpa DOM) ================= */

const SYMBOLS = [
    { id: "cherry", weights: [3, 2, 2] },
    { id: "lemon", weights: [6, 2, 2] },
    { id: "bell", weights: [2, 6, 2] },
    { id: "star", weights: [2, 2, 6] },
    { id: "diamond", weights: [2, 2, 2] },
    { id: "seven", weights: [1, 1, 1] },
];
const PAYTABLE = {
    seven3: 100, diamond3: 50, bell3: 25, star3: 15, lemon3: 10,
    cherry3: 8, seven2: 4, cherry2: 2, cherry1: 1,
};
const BET_VALUES = [5, 10, 25];
const MIN_BET = 5;
const REEL_DUR = [1.15, 1.85, 2.55];   /* berhenti bertahap (detik) */
const TURBO_DUR = [0.3, 0.5, 0.7];
const LUCKY_BOOST = { cherry: 2, lemon: 1, bell: 2, star: 2, diamond: 4, seven: 6 };

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const randSeed = () => (Math.random() * 0x7fffffff) >>> 0;

function reelTotal(reel, lucky) {
    let t = 0;
    for (const s of SYMBOLS) t += s.weights[reel] * (lucky ? LUCKY_BOOST[s.id] : 1);
    return t;
}
function weightedSym(reel, rng, lucky) {
    const r0 = rng || Math.random;
    let x = r0() * reelTotal(reel, lucky);
    for (const s of SYMBOLS) {
        x -= s.weights[reel] * (lucky ? LUCKY_BOOST[s.id] : 1);
        if (x < 0) return s.id;
    }
    return SYMBOLS[0].id;
}
function spinReels(rng, lucky) {
    return [weightedSym(0, rng, lucky), weightedSym(1, rng, lucky), weightedSym(2, rng, lucky)];
}
function comboMult(syms) {
    if (syms[0] === syms[1] && syms[1] === syms[2]) return PAYTABLE[syms[0] + "3"] || 0;
    const count = (x) => syms.filter((s) => s === x).length;
    if (count("seven") === 2) return PAYTABLE.seven2;
    if (count("cherry") === 2) return PAYTABLE.cherry2;
    if (count("cherry") === 1) return PAYTABLE.cherry1;
    return 0;
}
function evaluate(syms, bet) { return comboMult(syms) * bet; }

/* RTP eksak dihitung sekali (≈ 98.9%) */
const RTP = (() => {
    const tot = [0, 1, 2].map((r) => reelTotal(r, false));
    let r = 0;
    for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
        r += (a.weights[0] / tot[0]) * (b.weights[1] / tot[1]) * (c.weights[2] / tot[2]) *
            comboMult([a.id, b.id, c.id]);
    }
    return r;
})();

/* ============ generator level acak yang bisa diselesaikan ============ */
/* Simulasikan ratusan run dengan strategi taruhan wajar; terima level
   hanya jika peluang lolos 18–80%. Jika tidak, target/spin disesuaikan
   sampai lolos verifikasi → level terjamin "solvable". */
function simClearRate(start, target, spins, runs, rng) {
    let wins = 0;
    for (let r = 0; r < runs; r++) {
        let c = start;
        for (let s = 0; s < spins; s++) {
            if (c < MIN_BET) break;
            const want = spins - s <= 4 && c < target ? 25 : 10;
            let bet = 0;
            for (const v of BET_VALUES) if (v <= c && v <= want) bet = v;
            if (!bet) break;
            c -= bet;
            c += evaluate(spinReels(rng, false), bet);
            if (c >= target) { wins++; break; }
        }
    }
    return wins / runs;
}
function makeLevel(num, seed) {
    seed = seed >>> 0;
    const rng = mulberry32(seed);
    const start = 90 + 10 * Math.floor(rng() * 4);          // 90..120
    let spins = 10 + Math.floor(rng() * 7);                 // 10..16 per pemain
    let target = start + 50 + 10 * Math.floor(rng() * 6) + Math.min(40, (num - 1) * 5);
    let rate = 0;
    for (let i = 0; i < 24; i++) {
        rate = simClearRate(start, target, spins, 220, mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0));
        if (rate >= 0.18 && rate <= 0.8) break;
        if (rate < 0.18) {
            target -= 10;
            if (target <= start + 20) { spins += 2; target = start + 30; }
        } else target += 10;
    }
    return {
        num, seed, start, target, spins,
        rate: Math.round(rate * 100),
        themeIndex: Math.floor(rng() * THEMES.length),
        marquee: MARQUEES[Math.floor(rng() * MARQUEES.length)],
    };
}

/* ================= variasi tampilan ================= */

const THEMES = [
    { name: "Porcelain", pack: "classic", vars: { "--sm-bg": "#f7f7f8", "--sm-panel": "#ffffff", "--sm-ink": "#1f2937", "--sm-muted": "#6b7280", "--sm-line": "#e5e7eb", "--sm-accent": "#4f46e5", "--sm-soft": "#eef2ff", "--sm-reel": "#f3f4f6", "--sm-gold": "#b45309" } },
    { name: "Graphite", pack: "geo", vars: { "--sm-bg": "#13151a", "--sm-panel": "#1c1f26", "--sm-ink": "#e5e7eb", "--sm-muted": "#9aa1ad", "--sm-line": "#2b303b", "--sm-accent": "#8b5cf6", "--sm-soft": "#27233c", "--sm-reel": "#0e1015", "--sm-gold": "#fbbf24" } },
    { name: "Pasir", pack: "classic", vars: { "--sm-bg": "#faf6f0", "--sm-panel": "#fffdf8", "--sm-ink": "#292524", "--sm-muted": "#78716c", "--sm-line": "#e7e2da", "--sm-accent": "#ea580c", "--sm-soft": "#ffedd5", "--sm-reel": "#f5f1ea", "--sm-gold": "#b45309" } },
    { name: "Mint", pack: "geo", vars: { "--sm-bg": "#f2faf6", "--sm-panel": "#ffffff", "--sm-ink": "#1f2937", "--sm-muted": "#6b7280", "--sm-line": "#dbe5df", "--sm-accent": "#059669", "--sm-soft": "#d1fae5", "--sm-reel": "#eefaf3", "--sm-gold": "#ca8a04" } },
];
const MARQUEES = ["Lucky Sevens", "Neon Fortune", "Bintang Emas", "Ceri Merah", "Triple Bell", "Permata Biru", "Aurora Spins", "Mesin Hoki"];

const ICON_PACKS = {
    classic: {
        cherry: '<path d="M17 25q2-13 14-16" fill="none" stroke="#4ade80" stroke-width="2.6" stroke-linecap="round"/><path d="M30 28q-1-12 1-19" fill="none" stroke="#4ade80" stroke-width="2.6" stroke-linecap="round"/><circle cx="15" cy="32" r="7.5" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.6"/><circle cx="31" cy="35" r="6.5" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.6"/><path d="M11.5 29.5q3.5-2.5 7-0.5" fill="none" stroke="#fca5a5" stroke-width="1.8" stroke-linecap="round"/>',
        lemon: '<ellipse cx="24" cy="28" rx="12.5" ry="9.5" fill="#fde047" stroke="#a16207" stroke-width="1.6"/><path d="M11.5 28l-5.5-3.2v6.4z" fill="#fde047" stroke="#a16207" stroke-width="1.6" stroke-linejoin="round"/><path d="M36.5 28l5.5-3.2v6.4z" fill="#fde047" stroke="#a16207" stroke-width="1.6" stroke-linejoin="round"/><path d="M26 17q5-4 9-2" fill="none" stroke="#4ade80" stroke-width="2.4" stroke-linecap="round"/>',
        bell: '<path d="M24 8c-7.5 0-11.5 5.5-11.5 13.5 0 6-2.5 9-5.5 11h34c-3-2-5.5-5-5.5-11C35.5 13.5 31.5 8 24 8z" fill="#f59e0b" stroke="#92400e" stroke-width="1.6" stroke-linejoin="round"/><circle cx="24" cy="5.5" r="2.4" fill="#92400e"/><circle cx="24" cy="37.5" r="3.2" fill="#92400e"/>',
        star: '<polygon points="24,6 28.4,18 41.1,18.4 31,26.3 34.6,38.6 24,31.4 13.4,38.6 17,26.3 6.9,18.4 19.6,18" fill="#fbbf24" stroke="#92400e" stroke-width="1.6" stroke-linejoin="round"/>',
        diamond: '<polygon points="24,5 41,24 24,43 7,24" fill="#38bdf8" stroke="#0369a1" stroke-width="1.6" stroke-linejoin="round"/><polygon points="24,12 33.5,24 24,36 14.5,24" fill="#7dd3fc" opacity=".7"/>',
        seven: '<text x="24" y="37" font-size="34" font-weight="900" text-anchor="middle" font-family="inherit" fill="#ef4444">7</text>',
    },
    geo: {
        cherry: '<circle cx="17" cy="31" r="7" fill="none" stroke="var(--sm-accent)" stroke-width="3"/><circle cx="31" cy="33" r="6" fill="var(--sm-soft)" stroke="var(--sm-accent)" stroke-width="3"/><path d="M17 24q3-11 14-14M31 27q0-10 0-17" fill="none" stroke="var(--sm-accent)" stroke-width="2.6" stroke-linecap="round"/>',
        lemon: '<polygon points="24,8 38,16 38,32 24,40 10,32 10,16" fill="var(--sm-soft)" stroke="var(--sm-accent)" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="4" fill="var(--sm-accent)"/>',
        bell: '<path d="M24 9 40 37H8Z" fill="none" stroke="var(--sm-accent)" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="30" r="3.4" fill="var(--sm-accent)"/>',
        star: '<path d="M24 5q2.5 12 19 19-16.5 7-19 19-2.5-12-19-19 16.5-7 19-19z" fill="var(--sm-accent)"/>',
        diamond: '<polygon points="24,6 40,24 24,42 8,24" fill="none" stroke="var(--sm-accent)" stroke-width="3" stroke-linejoin="round"/><polygon points="24,15 32,24 24,33 16,24" fill="var(--sm-soft)" stroke="var(--sm-accent)" stroke-width="2"/>',
        seven: '<text x="24" y="37" font-size="34" font-weight="900" text-anchor="middle" font-family="inherit" fill="var(--sm-gold)">7</text>',
    },
};

/* ================= state duel (serializable, untuk room) ================= */

function mkSeat(level) {
    return { credits: level.start, spinsLeft: level.spins, bet: 10, done: false, bust: false, best: 0, lastWin: 0 };
}
function newRound(prev, num, seed) {
    const level = makeLevel(num, seed);
    const first = Math.random() < 0.5 ? 0 : 1;   // koin: siapa jalan duluan
    return {
        v: 1,
        roundId: (prev ? prev.roundId : 0) + 1,
        level,
        swap: Math.random() < 0.5,                 // acak posisi kursi pemain
        firstSeat: first,
        turn: first,
        phase: "playing",                          // playing | over
        winner: null,                              // 0 | 1 | -1 (seri)
        reason: "",
        seats: [mkSeat(level), mkSeat(level)],
        spinSeq: prev ? prev.spinSeq : 0,
        last: null,                                // {seat, syms, bet, win, seq}
        cheats: { free: false, lucky: false, force: null },
        cheated: prev ? prev.cheated : false,
    };
}
const seatOf = (st, conn) => (st.swap ? 1 - conn : conn);
function canAct(st, s) {
    const p = st.seats[s];
    return st.phase === "playing" && !p.done && !p.bust && p.credits >= MIN_BET;
}
function finish(st, winner, reason) { st.phase = "over"; st.winner = winner; st.reason = reason; }
function afterSpin(st, seat) {
    const p = st.seats[seat], L = st.level, other = 1 - seat;
    if (p.credits >= L.target) return finish(st, seat, "target");
    if (p.credits < MIN_BET) { p.bust = true; return finish(st, other, "bust"); }
    if (p.spinsLeft <= 0) p.done = true;
    if (p.bet > p.credits) {
        const aff = BET_VALUES.filter((v) => v <= p.credits);
        p.bet = aff.length ? aff[aff.length - 1] : MIN_BET;
    }
    if (!canAct(st, other) && !canAct(st, seat)) {
        const a = st.seats[0].credits, b = st.seats[1].credits;
        return finish(st, a === b ? -1 : a > b ? 0 : 1, "compare");
    }
    st.turn = canAct(st, other) ? other : seat;
}

/* Semua mutasi state lewat sini (host/local). actor = indeks koneksi (0 host, 1 guest/bot). */
function applyToState(st, action, actor, online) {
    if (!st || !action) return st;
    const seat = seatOf(st, actor);
    const my = st.seats[seat];
    switch (action.type) {
        case "bet": {
            if (st.phase !== "playing") return st;
            const v = action.bet | 0;
            if (!BET_VALUES.includes(v) || v > my.credits) return st;
            my.bet = v;
            return st;
        }
        case "spin": {
            if (st.phase !== "playing" || st.turn !== seat || !canAct(st, seat)) return st;
            const human = !online && actor === 0;
            const aff = BET_VALUES.filter((v) => v <= my.credits);
            let bet = BET_VALUES.includes(action.bet) ? action.bet : my.bet;
            bet = Math.min(bet, aff[aff.length - 1]);
            my.bet = bet;
            let syms;
            if (human && st.cheats.force) {
                syms = [st.cheats.force, st.cheats.force, st.cheats.force];
                st.cheats.force = null;
                st.cheated = true;
            } else {
                syms = spinReels(Math.random, human && st.cheats.lucky);
                if (human && st.cheats.lucky) st.cheated = true;
            }
            if (human && st.cheats.free) st.cheated = true;
            else my.credits -= bet;
            my.spinsLeft--;
            const win = evaluate(syms, bet);
            my.credits += win;
            my.lastWin = win;
            if (win > my.best) my.best = win;
            st.spinSeq++;
            st.last = { seat, syms, bet, win, seq: st.spinSeq };
            afterSpin(st, seat);
            return st;
        }
        case "cheat": {
            if (online || actor !== 0 || st.phase !== "playing") return st;
            st.cheated = true;
            const op = action.op;
            if (op === "credits") my.credits += 100;
            else if (op === "free") st.cheats.free = !st.cheats.free;
            else if (op === "lucky") st.cheats.lucky = !st.cheats.lucky;
            else if (op === "force" && SYMBOLS.some((s) => s.id === action.sym)) st.cheats.force = action.sym;
            else if (op === "win") my.credits = Math.max(my.credits, st.level.target);
            else if (op === "reroll") return newRound(st, st.level.num, randSeed());
            if (my.credits >= st.level.target) finish(st, seat, "cheat");
            return st;
        }
        case "next": {
            if (st.phase !== "over") return st;
            const humanWon = st.winner === seatOf(st, 0);
            if (st.winner === -1) return newRound(st, st.level.num, st.level.seed); // seri: level sama
            if (!online && !humanWon) return newRound(st, st.level.num, randSeed()); // kalah: level baru, nomor sama
            return newRound(st, st.level.num + 1, randSeed());
        }
        case "restart": {
            const ns = newRound(st, 1, randSeed());
            ns.cheated = false;
            return ns;
        }
    }
    return st;
}

/* Strategi bot sederhana: berani saat tertinggal / spin menipis, aman saat unggul. */
function botBet(st, s) {
    const p = st.seats[s], foe = st.seats[1 - s], L = st.level;
    const aff = BET_VALUES.filter((v) => v <= p.credits);
    const gap = L.target - p.credits;
    let want = 10;
    if (p.spinsLeft <= 4 && gap > 0) want = 25;
    else if (foe.done || foe.bust) want = p.credits <= foe.credits ? 25 : 5;
    else if (gap <= 20) want = 5;
    else if (p.credits - foe.credits >= 40) want = 5;
    if (Math.random() < 0.2) want = BET_VALUES[Math.floor(Math.random() * BET_VALUES.length)];
    want = Math.min(want, aff[aff.length - 1]);
    return aff.includes(want) ? want : aff[aff.length - 1];
}

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const BEST_KEY = META.bestKey;
    let bestLevel = 0;
    try { bestLevel = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { }

    root.innerHTML = `
<div class="game-app sm-wrap game-fill" data-sm>
  <style>
.sm-wrap{--sm-bg:#f7f7f8;--sm-panel:#fff;--sm-ink:#1f2937;--sm-muted:#6b7280;--sm-line:#e5e7eb;--sm-accent:#4f46e5;--sm-soft:#eef2ff;--sm-reel:#f3f4f6;--sm-gold:#b45309;--sm-cell:clamp(64px,20vw,92px);color:var(--sm-ink);min-width:0}
.sm-wrap [hidden]{display:none!important}
.sm-wrap button{font-family:inherit;touch-action:manipulation}
.sm-wrap button:focus-visible{outline:2px solid var(--sm-accent);outline-offset:2px}
.sm-wrap button:disabled{opacity:.4;cursor:default}
.sm-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0;margin-bottom:2px;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.sm-chip{font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:5px 9px;border-radius:999px;background:var(--sm-soft);color:var(--sm-accent);border:1px solid var(--sm-line);white-space:nowrap}
.sm-chip.sm-dim{background:var(--sm-panel);color:var(--sm-muted);font-weight:600}
.sm-chip b{color:var(--sm-ink);font-variant-numeric:tabular-nums}
.sm-spacer{flex:1 1 auto}
.sm-btn{border:1px solid var(--sm-line);background:var(--sm-panel);color:var(--sm-ink);border-radius:9px;padding:0 16px;font-weight:700;font-size:13px;cursor:pointer;min-height:44px}
.sm-btn.on{background:var(--sm-soft);border-color:var(--sm-accent);color:var(--sm-accent)}
.sm-icon-btn{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:5px 8px;font-size:10px}
.sm-icon-btn svg{flex:none;display:block}
.sm-panel{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;background:var(--sm-bg);border:1px solid var(--sm-line);border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:center;gap:12px;overflow:hidden;min-width:0}
.sm-seats{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-width:0}
.sm-seat{background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0;transition:border-color .16s ease,box-shadow .16s ease}
.sm-seat.active{border-color:var(--sm-accent);box-shadow:0 0 0 2px var(--sm-soft)}
.sm-seat-top{display:flex;align-items:center;gap:8px;font-size:12.5px;min-width:0;flex-wrap:wrap}
.sm-tag{font-size:9.5px;font-weight:800;letter-spacing:.06em;color:var(--sm-accent);background:var(--sm-soft);padding:2px 8px;border-radius:999px}
.sm-tag:empty{display:none}
.sm-credits{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.sm-bar{height:4px;border-radius:999px;background:var(--sm-reel);overflow:hidden}
.sm-bar i{display:block;height:100%;width:0;background:var(--sm-accent);border-radius:999px;transition:width .2s ease}
.sm-seat-sub{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--sm-muted)}
.sm-machine{display:flex;flex-direction:column;gap:12px;align-items:center;background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:12px;padding:16px;min-width:0;max-width:100%}
.sm-marquee{font-size:11px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--sm-gold);text-align:center}
.sm-reels{display:flex;gap:10px;cursor:pointer;user-select:none;touch-action:manipulation;max-width:100%}
.sm-window{position:relative;width:calc(var(--sm-cell) + 10px);height:var(--sm-cell);overflow:hidden;border-radius:8px;background:var(--sm-reel);border:1px solid var(--sm-line)}
.sm-strip{display:flex;flex-direction:column;will-change:transform}
.sm-cell{width:100%;height:var(--sm-cell);display:grid;place-items:center}
.sm-window.blur .sm-strip{filter:blur(2.4px)}
.sm-reels.win .sm-window{border-color:var(--sm-gold);animation:sm-flash .45s ease-in-out 4}
.sm-win{min-height:24px;font-size:16px;font-weight:800;color:var(--sm-accent);font-variant-numeric:tabular-nums;text-align:center}
.sm-win.pop{animation:sm-pop .5s ease-out}
.sm-controls{display:flex;align-items:stretch;justify-content:center;gap:8px;flex-wrap:wrap;width:100%}
.sm-betbox{display:flex;align-items:center;gap:8px;background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:10px;padding:4px 8px}
.sm-step{width:44px;height:44px;border-radius:9px;border:1px solid var(--sm-line);background:var(--sm-bg);font-size:18px;font-weight:800;color:var(--sm-ink);cursor:pointer}
.sm-betval{display:flex;flex-direction:column;align-items:center;min-width:52px}
.sm-betval span{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--sm-muted)}
.sm-betval b{font-size:17px;font-variant-numeric:tabular-nums}
.sm-chips{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sm-chipbtn{border:1px solid var(--sm-line);background:var(--sm-panel);border-radius:999px;padding:8px 16px;min-height:44px;font-weight:700;font-size:12.5px;color:var(--sm-ink);cursor:pointer}
.sm-chipbtn.sel{background:var(--sm-accent);border-color:var(--sm-accent);color:#fff}
.sm-btn{border:1px solid var(--sm-line);background:var(--sm-panel);color:var(--sm-ink);border-radius:9px;padding:0 16px;font-weight:700;font-size:13px;cursor:pointer;min-height:44px}
.sm-btn.on{background:var(--sm-soft);border-color:var(--sm-accent);color:var(--sm-accent)}
.sm-spin{background:var(--sm-accent);border-color:var(--sm-accent);color:#fff;font-size:15px;font-weight:800;letter-spacing:.08em;padding:0 28px}
.sm-pay{background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:10px;padding:12px 16px;font-size:12px;min-width:0}
.sm-pay summary{cursor:pointer;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sm-muted)}
.sm-row{display:flex;align-items:center;gap:4px;min-height:24px;color:var(--sm-ink);flex-wrap:wrap}
.sm-row b{margin-left:auto;color:var(--sm-gold)}
.sm-any{font-size:9.5px;color:var(--sm-muted);margin:0 2px}
.sm-note{font-size:10.5px;color:var(--sm-muted);margin:8px 0 0;line-height:1.5}
.sm-hint{font-size:11px;color:var(--sm-muted);text-align:center;margin:0;line-height:1.5}
.sm-toss{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:12px;padding:10px 18px;box-shadow:0 8px 20px rgba(0,0,0,.12);text-align:center;max-width:calc(100% - 32px)}
.sm-coin{animation:sm-coin 1s linear infinite}
.sm-toss b{font-size:13px}
.sm-toss span{font-size:10.5px;color:var(--sm-muted)}
.sm-toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:6;background:var(--sm-ink);color:var(--sm-bg);font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.18);white-space:normal;max-width:calc(100% - 32px);text-align:center}
.sm-ov{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:rgba(15,18,25,.45);backdrop-filter:blur(3px);padding:16px;box-sizing:border-box}
.sm-card{background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:12px;padding:16px;max-width:430px;width:100%;max-height:100%;overflow:hidden;display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,.16);box-sizing:border-box}
.sm-head,.sm-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sm-foot{padding-top:10px;border-top:1px solid var(--sm-line)}
.sm-help,.sm-cheats,.sm-stats{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px}
.sm-ov-title{margin:0;font-size:19px}
.sm-ov-title.good{color:var(--sm-accent)}
.sm-ov-title.bad{color:#dc2626}
.sm-card h3{margin:4px 0 0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sm-muted)}
.sm-card p,.sm-card li{font-size:12.5px;line-height:1.55;margin:0;color:var(--sm-ink)}
.sm-card ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.sm-keys{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:11.5px;color:var(--sm-muted);align-items:center}
.sm-keys b{color:var(--sm-ink);font-family:ui-monospace,monospace;font-size:11px;background:var(--sm-reel);border:1px solid var(--sm-line);border-radius:5px;padding:1px 6px;justify-self:start}
.sm-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;flex-wrap:wrap}
.sm-toggle{min-width:64px;min-height:44px;padding:6px 14px;border-radius:999px;border:1px solid var(--sm-line);background:var(--sm-bg);font-weight:800;font-size:11px;cursor:pointer;color:var(--sm-muted)}
.sm-toggle.on{background:var(--sm-soft);border-color:var(--sm-accent);color:var(--sm-accent)}
.sm-force{display:flex;gap:8px;flex-wrap:wrap}
.sm-forcebtn{width:44px;height:44px;display:grid;place-items:center;border-radius:9px;border:1px solid var(--sm-line);background:var(--sm-bg);cursor:pointer}
.sm-forcebtn.sel{border-color:var(--sm-accent);box-shadow:0 0 0 2px var(--sm-soft)}
.sm-cheat-actions{display:flex;gap:8px;flex-wrap:wrap}
.sm-cheat-actions .sm-btn{min-height:44px;font-size:12px;padding:0 12px}
.sm-stats{font-size:12px;color:var(--sm-muted)}
@keyframes sm-flash{from{box-shadow:0 0 3px var(--sm-soft)}to{box-shadow:0 0 14px var(--sm-gold)}}
@keyframes sm-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
@keyframes sm-coin{from{transform:rotateY(0)}to{transform:rotateY(360deg)}}
@media (max-width:620px){.sm-wrap{--sm-cell:clamp(60px,18vw,80px)}.sm-credits{font-size:24px}.sm-spin{flex:1 1 100%;order:9}.sm-controls{gap:8px}.sm-panel{padding:12px;gap:10px}.sm-seats{gap:8px}}
@media (pointer:coarse){.sm-step{width:44px;height:44px}.sm-btn{min-height:48px}.sm-chipbtn{min-height:48px}.sm-icon-btn{width:44px;height:44px;justify-content:center;padding:0}.sm-forcebtn{width:44px;height:44px}.sm-toggle{min-height:44px}}
@media (prefers-reduced-motion:reduce){.sm-coin,.sm-win.pop,.sm-reels.win .sm-window{animation:none}.sm-bar i,.sm-seat{transition:none}}

/* --- fill height + mobile refinements (last, higher specificity) --- */
.sm-wrap.game-fill > .sm-panel{min-height:0;aspect-ratio:auto}
.sm-card{overflow:hidden}
@media (max-width:640px){
.sm-wrap.game-fill > .sm-panel:not(:has(.sm-ov:not([hidden]))){flex:0 0 auto;min-height:0;aspect-ratio:auto}
.sm-wrap.game-fill > .sm-panel:has(.sm-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.sm-wrap .sm-hud{gap:5px;margin-bottom:6px}
.sm-wrap .sm-hud .sm-chip{padding:4px 6px;font-size:9px}
.sm-wrap .sm-hud .sm-chip.sm-low{display:none}
.sm-wrap .sm-hud .sm-btn{min-height:32px;padding:5px 9px;font-size:9px}
.sm-wrap .sm-hud .sm-btn-label,.sm-wrap .sm-spacer{display:none}
.sm-wrap .sm-ov{padding:8px}
.sm-wrap .sm-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.sm-wrap .sm-help,.sm-wrap .sm-cheats,.sm-wrap .sm-stats{scrollbar-width:none}
.sm-wrap .sm-help::-webkit-scrollbar,.sm-wrap .sm-cheats::-webkit-scrollbar,.sm-wrap .sm-stats::-webkit-scrollbar{display:none}
.sm-wrap .sm-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--sm-line)}
.sm-wrap .sm-note{display:none}
}
</style>
  <div class="sm-hud">
    <span class="sm-chip">LV <b data-hud="level">1</b></span>
    <span class="sm-chip">TGT <b data-hud="target">–</b></span>
    <span class="sm-chip">SPIN <b data-hud="spins">–</b></span>
    <span class="sm-chip sm-dim sm-low">PASS <b data-hud="rate">–</b></span>
    <span class="sm-chip sm-dim sm-low">BEST <b data-hud="best">–</b></span>
    <span class="sm-chip sm-dim sm-low" data-hud="status">Siap</span>
    <span class="sm-spacer"></span>
    <button class="sm-btn sm-icon-btn" type="button" data-act="theme" data-el="themeBtn" aria-label="Ganti tema" title="Ganti tema (V)">${iconSVG("settings", { size: 14 })}<span class="sm-btn-label">Theme</span></button>
    <button class="sm-btn sm-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="sm-btn-label">Help</span></button>
    <button class="sm-btn sm-icon-btn" type="button" data-cheats data-el="cheatBtn" aria-label="Cheats" title="Cheats (C) — vs Bot only">${iconSVG("wrench", { size: 14 })}<span class="sm-btn-label">Cheats</span></button>
    <button class="sm-btn sm-icon-btn" type="button" data-pause data-el="pauseBtn" aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="sm-btn-label">Pause</span></button>
    <button class="sm-btn sm-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="sm-btn-label">Restart</span></button>
    <button class="sm-btn sm-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="sm-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel sm-panel" data-board>
    <div class="sm-seats">
      <div class="sm-seat" data-seat="0">
        <div class="sm-seat-top"><b data-el="name"></b><span class="sm-tag" data-el="tag"></span></div>
        <div class="sm-credits" data-el="cred">–</div>
        <div class="sm-bar"><i data-el="bar"></i></div>
        <div class="sm-seat-sub"><span data-el="spins"></span><span data-el="bet"></span></div>
      </div>
      <div class="sm-seat" data-seat="1">
        <div class="sm-seat-top"><b data-el="name"></b><span class="sm-tag" data-el="tag"></span></div>
        <div class="sm-credits" data-el="cred">–</div>
        <div class="sm-bar"><i data-el="bar"></i></div>
        <div class="sm-seat-sub"><span data-el="spins"></span><span data-el="bet"></span></div>
      </div>
    </div>
    <div class="sm-machine">
      <div class="sm-marquee" data-el="marquee">Lucky Sevens</div>
      <div class="sm-reels" data-el="reels" title="Klik untuk putar (Spasi)">
        <div class="sm-window" data-reel="0"><div class="sm-strip" data-el="strip0"></div></div>
        <div class="sm-window" data-reel="1"><div class="sm-strip" data-el="strip1"></div></div>
        <div class="sm-window" data-reel="2"><div class="sm-strip" data-el="strip2"></div></div>
      </div>
      <div class="sm-win" data-el="win"></div>
    </div>
    <div class="sm-controls">
      <div class="sm-betbox">
        <button class="sm-step" type="button" data-act="bet-minus" aria-label="Kurangi taruhan">−</button>
        <div class="sm-betval"><span>Taruhan</span><b data-el="betval">10</b></div>
        <button class="sm-step" type="button" data-act="bet-plus" aria-label="Tambah taruhan">+</button>
      </div>
      <div class="sm-chips" data-el="chips"></div>
      <button class="sm-btn" type="button" data-act="bet-max" title="Taruhan maksimum (M)">MAX</button>
      <button class="sm-btn" type="button" data-act="turbo" data-el="turbo" aria-pressed="false" title="Putaran cepat (T)">Turbo</button>
      <button class="sm-btn sm-spin" type="button" data-act="spin" data-el="spin" disabled>PUTAR</button>
    </div>
    <details class="sm-pay">
      <summary>Tabel pembayaran (× taruhan)</summary>
      <div data-el="payrows"></div>
      <p class="sm-note" data-el="rtp"></p>
    </details>
    <p class="sm-hint" data-el="hint"></p>

    <div class="sm-toss" data-el="toss" hidden>
      <svg class="sm-coin" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="var(--sm-gold)"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"/></svg>
      <b data-el="tossText"></b><span data-el="tossSub"></span>
    </div>
    <div class="sm-toast" data-el="toast" hidden></div>

    <div class="sm-ov" data-ov="help" hidden>
      <div class="sm-card">
        <div class="sm-head"><h2 class="sm-ov-title">Cara bermain</h2><button class="sm-btn" type="button" data-help-close aria-label="Close help" title="Close">${iconSVG("x", { size: 14 })}</button></div>
        <div class="sm-help">
          <h3>Tujuan</h3>
          <p>Kamu berduel melawan ${online ? "pemain lain" : "Bot"}. Capai <b>target kredit</b> level lebih dulu untuk menang. Setiap putaran memotong taruhan dari kreditmu; simbol yang cocok membayar sesuai tabel (× taruhan).</p>
          <h3>Aturan duel</h3>
          <ul>
            <li><b>Koin dilempar tiap ronde</b> — giliran pertama diacak, lalu bergantian.</li>
            <li><b>Kursi (Seat 1/2) juga diacak</b> setiap ronde.</li>
            <li>Kredit ≥ target → menang instan. Kredit &lt; ${MIN_BET} → bangkrut, lawan menang.</li>
            <li>Spin habis di kedua sisi → kredit akhir dibandingkan (bisa seri).</li>
          </ul>
          <h3>Level acak yang adil</h3>
          <p>Target, modal, dan jumlah spin dibuat acak lalu <b>diverifikasi lewat ratusan simulasi</b> — hanya level dengan peluang lolos 18–80% yang dipakai. Persentasenya tampil di HUD.</p>
          <h3>Kontrol desktop</h3>
          <div class="sm-keys">
            <b>Spasi / Enter</b><span>Putar</span>
            <b>↑ / ↓</b><span>Naik / turun taruhan</span>
            <b>1 · 2 · 3</b><span>Preset taruhan 5 / 10 / 25</span>
            <b>M</b><span>Taruhan maksimum</span>
            <b>T</b><span>Turbo on/off</span>
            <b>V</b><span>Ganti tema slot</span>
            <b>H / C / P / R</b><span>Bantuan / Cheat / Pause / Restart</span>
            <b>Esc</b><span>Tutup overlay</span>
            <b>Klik / scroll</b><span>Klik gulungan = putar, scroll di gulungan = ubah taruhan</span>
          </div>
          <h3>Mobile</h3>
          <p>Semua kontrol tersedia sebagai tombol besar: stepper − / +, chip taruhan, MAX, Turbo, dan PUTAR. Ketuk gulungan juga bisa untuk memutar.</p>
          ${online ? "" : '<h3>Cheat</h3><p>Tombol kunci pas (C) membuka overlay cheat: kredit ekstra, putaran gratis, gulungan beruntung, paksa jackpot, selesaikan level, dan acak ulang level. Run akan ditandai "cheat".</p>'}
        </div>
        <div class="sm-foot"><span class="sm-note">Tekan H untuk membuka lagi</span><button class="sm-btn sm-spin" type="button" data-help-close>Mengerti, mulai!</button></div>
      </div>
    </div>

    <div class="sm-ov" data-ov="cheats" hidden>
      <div class="sm-card">
        <div class="sm-head"><h2 class="sm-ov-title">Cheat</h2><button class="sm-btn" type="button" data-cheats-close aria-label="Close cheats" title="Close">${iconSVG("x", { size: 14 })}</button></div>
        <div class="sm-cheats">
          <div class="sm-cheat-row"><span>Putaran gratis (tanpa potong taruhan)</span><button class="sm-toggle" type="button" data-op="free" data-el="tgFree">OFF</button></div>
          <div class="sm-cheat-row"><span>Gulungan beruntung (bobot simbol bagus ↑)</span><button class="sm-toggle" type="button" data-op="lucky" data-el="tgLucky">OFF</button></div>
          <div class="sm-cheat-row"><span>Paksa 3 simbol di putaran berikutnya</span><span class="sm-note" data-el="forceLabel"></span></div>
          <div class="sm-force" data-el="forceRow"></div>
          <div class="sm-cheat-actions">
            <button class="sm-btn" type="button" data-op="credits">+100 kredit</button>
            <button class="sm-btn" type="button" data-op="win">Selesaikan level</button>
            <button class="sm-btn" type="button" data-op="reroll">Acak ulang level</button>
          </div>
        </div>
        <div class="sm-foot"><span class="sm-note">Hanya vs Bot • run ditandai "cheat"</span><button class="sm-btn" type="button" data-cheats-close>Tutup</button></div>
      </div>
    </div>

    <div class="sm-ov" data-ov="over" hidden>
      <div class="sm-card">
        <div class="sm-head"><h2 class="sm-ov-title" data-el="ovTitle"></h2></div>
        <div class="sm-stats"><p data-el="ovSub"></p><p data-el="ovStats"></p></div>
        <div class="sm-foot"><button class="sm-btn sm-spin" type="button" data-act="next" data-el="nextBtn">Level berikutnya</button><button class="sm-btn" type="button" data-act="restart">Mulai ulang dari LV 1</button></div>
      </div>
    </div>

    <div class="sm-ov" data-ov="pause" hidden>
      <div class="sm-card">
        <div class="sm-head"><h2 class="sm-ov-title">Dijeda</h2></div>
        <div class="sm-foot"><span class="sm-note">Tekan P atau Esc untuk melanjutkan</span><button class="sm-btn sm-spin" type="button" data-resume>Resume</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const wrap = $(".sm-wrap");
    const hud = {
        level: $('[data-hud="level"]'),
        target: $('[data-hud="target"]'),
        spins: $('[data-hud="spins"]'),
        rate: $('[data-hud="rate"]'),
        best: $('[data-hud="best"]'),
        status: $('[data-hud="status"]'),
    };
    const marqueeEl = $('[data-el="marquee"]');
    const reelsBox = $('[data-el="reels"]');
    const strips = [$('[data-el="strip0"]'), $('[data-el="strip1"]'), $('[data-el="strip2"]')];
    const windows = [$('[data-reel="0"]'), $('[data-reel="1"]'), $('[data-reel="2"]')];
    const winMsg = $('[data-el="win"]');
    const betValEl = $('[data-el="betval"]');
    const spinBtn = $('[data-el="spin"]');
    const turboBtn = $('[data-el="turbo"]');
    const themeBtn = $('[data-el="themeBtn"]');
    const cheatBtn = $('[data-el="cheatBtn"]');
    const minusBtn = $('[data-act="bet-minus"]');
    const plusBtn = $('[data-act="bet-plus"]');
    const maxBtn = $('[data-act="bet-max"]');
    const hintEl = $('[data-el="hint"]');
    const tossEl = $('[data-el="toss"]');
    const tossText = $('[data-el="tossText"]');
    const tossSub = $('[data-el="tossSub"]');
    const toastEl = $('[data-el="toast"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheats = $('[data-ov="cheats"]');
    const ovOver = $('[data-ov="over"]');
    const ovPause = $('[data-ov="pause"]');
    const pauseBtn = $('[data-el="pauseBtn"]');
    const ovTitle = $('[data-el="ovTitle"]');
    const ovSub = $('[data-el="ovSub"]');
    const ovStats = $('[data-el="ovStats"]');
    const nextBtn = $('[data-el="nextBtn"]');
    const tgFree = $('[data-el="tgFree"]');
    const tgLucky = $('[data-el="tgLucky"]');
    const forceLabel = $('[data-el="forceLabel"]');
    const seatCards = [0, 1].map((i) => {
        const c = root.querySelector('[data-seat="' + i + '"]');
        return {
            card: c,
            name: c.querySelector('[data-el="name"]'),
            tag: c.querySelector('[data-el="tag"]'),
            cred: c.querySelector('[data-el="cred"]'),
            bar: c.querySelector('[data-el="bar"]'),
            spins: c.querySelector('[data-el="spins"]'),
            bet: c.querySelector('[data-el="bet"]'),
        };
    });
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");

    /* ---------------- state klien (animasi & preferensi, tidak dipublish) ---------------- */
    let destroyed = false;
    let turbo = false;
    let themeOverride = null;
    let appliedTheme = -1;
    let pack = "classic";
    let cur = ["lemon", "bell", "diamond"];
    let seenRound = 0;
    let seenSeq = 0;
    let tossing = false;
    let helpOpen = false;
    let cheatsOpen = false;
    let paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("slotMachineHelpSeen") === "1"; } catch (e) { /* storage blocked */ }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("slotMachineHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const anim = { spinning: false };
    const animStartAt = [0, 0, 0];
    let animFreeze = [];
    let timers = [];
    let animTimers = [];
    let botTimer = null;
    let toastTimer = null;
    const offs = [];

    /* Timer yang bisa dijeda: potong setTimeout saat pause, geser anchor
       Date.now() saat resume supaya durasi tidak loncat. */
    const timersLive = new Set();
    function later(fn, ms) {
        const e = { fn, ms, left: ms, at: 0, id: 0 };
        timersLive.add(e);
        e.arm = () => {
            e.at = Date.now();
            e.id = setTimeout(() => {
                e.id = 0;
                timersLive.delete(e);
                if (!destroyed) e.fn();
            }, e.left);
        };
        if (!paused) e.arm();
        return e;
    }
    function cancelTimer(e) {
        if (!e) return;
        if (e.id) clearTimeout(e.id);
        e.id = 0;
        timersLive.delete(e);
    }
    function freezeTimers() {
        timersLive.forEach((e) => {
            if (e.id) {
                clearTimeout(e.id);
                e.id = 0;
                e.left = Math.max(0, e.left - (Date.now() - e.at));
            }
        });
    }
    function thawTimers() { timersLive.forEach((e) => { if (!e.id) e.arm(); }); }

    const mySeat = () => (state ? seatOf(state, playerIndex) : playerIndex);
    const seatName = (s) =>
        online ? "Pemain " + (s + 1) + (s === mySeat() ? " (kamu)" : "")
            : s === mySeat() ? (playerName || "Kamu") : "Bot";
    const shortName = (s) => (online ? "P" + (s + 1) : s === mySeat() ? "Kamu" : "Bot");

    /* ---------------- simbol & panel ---------------- */
    function sym(id, size) {
        return '<svg viewBox="0 0 48 48" width="' + size + '" height="' + size + '" aria-hidden="true">' + (ICON_PACKS[pack][id] || "") + "</svg>";
    }
    const cellHtml = (id) => '<div class="sm-cell">' + sym(id, 54) + "</div>";

    function buildPaytable() {
        const rows = [
            { icons: ["seven", "seven", "seven"], label: "Triple 7", mult: PAYTABLE.seven3 },
            { icons: ["diamond", "diamond", "diamond"], label: "3 berlian", mult: PAYTABLE.diamond3 },
            { icons: ["bell", "bell", "bell"], label: "3 lonceng", mult: PAYTABLE.bell3 },
            { icons: ["star", "star", "star"], label: "3 bintang", mult: PAYTABLE.star3 },
            { icons: ["lemon", "lemon", "lemon"], label: "3 lemon", mult: PAYTABLE.lemon3 },
            { icons: ["cherry", "cherry", "cherry"], label: "3 ceri", mult: PAYTABLE.cherry3 },
            { icons: ["seven", "seven", null], label: "Dua 7", mult: PAYTABLE.seven2 },
            { icons: ["cherry", "cherry", null], label: "Dua ceri", mult: PAYTABLE.cherry2 },
            { icons: ["cherry", null, null], label: "Satu ceri", mult: PAYTABLE.cherry1 },
        ];
        $('[data-el="payrows"]').innerHTML = rows.map((r) =>
            '<div class="sm-row">' +
            r.icons.map((ic) => (ic ? sym(ic, 17) : '<span class="sm-any">bebas</span>')).join("") +
            "<span>" + r.label + "</span><b>x" + r.mult + "</b></div>"
        ).join("");
        $('[data-el="rtp"]').textContent =
            "RTP ≈ " + (RTP * 100).toFixed(1) + "% • bobot tiap gulungan berbeda agar triple langka.";
    }
    function buildForceRow() {
        $('[data-el="forceRow"]').innerHTML = SYMBOLS.map((s) =>
            '<button class="sm-forcebtn" type="button" data-force="' + s.id + '" title="Paksa 3× ' + s.id + '">' + sym(s.id, 26) + "</button>"
        ).join("");
    }
    {
        $('[data-el="chips"]').innerHTML = BET_VALUES.map((v) =>
            '<button class="sm-chipbtn" type="button" data-bet="' + v + '">' + v + "</button>"
        ).join("");
    }
    const chipBtns = Array.prototype.slice.call(root.querySelectorAll("[data-bet]"));

    function setStripStatic(i, id) {
        const st = strips[i];
        st.style.transition = "none";
        st.style.transform = "translateY(0)";
        st.innerHTML = cellHtml(id);
        st.getBoundingClientRect();
        st.style.transition = "";
    }
    function applyTheme() {
        if (!state) return;
        const idx = themeOverride == null ? state.level.themeIndex : themeOverride;
        if (idx === appliedTheme) return;
        appliedTheme = idx;
        const t = THEMES[idx];
        for (const k in t.vars) wrap.style.setProperty(k, t.vars[k]);
        pack = t.pack;
        buildPaytable();
        buildForceRow();
        if (!anim.spinning) for (let i = 0; i < 3; i++) setStripStatic(i, cur[i]);
        themeBtn.title = "Tema: " + t.name + " (V untuk ganti)";
    }

    /* ---------------- animasi gulungan ---------------- */
    function cancelAnim() {
        animTimers.forEach(cancelTimer);
        animTimers = [];
        animFreeze = [];
        anim.spinning = false;
        windows.forEach((w) => w.classList.remove("blur"));
    }
    function stripY(el) {
        const t = getComputedStyle(el).transform;
        if (!t || t === "none") return 0;
        try { return new DOMMatrixReadOnly(t).m42; } catch (e) {
            const m = /matrix\([^)]*,\s*([-\d.]+)\s*\)$/.exec(t);
            return m ? parseFloat(m[1]) : 0;
        }
    }
    function freezeAnim() {
        if (!anim.spinning) return;
        const fast = turbo || REDUCED;
        const durs = fast ? TURBO_DUR : REEL_DUR;
        const FILL = fast ? 4 : 9;
        animFreeze = [];
        for (let i = 0; i < 3; i++) {
            const st = strips[i];
            const y = stripY(st);
            const h = st.firstElementChild.getBoundingClientRect().height || 92;
            animFreeze.push({
                i, y,
                left: Math.max(0, durs[i] * 1000 - (Date.now() - animStartAt[i])),
                target: -(FILL + 1) * h,
            });
            st.style.transition = "none";
            st.style.transform = "translateY(" + y + "px)";
        }
    }
    function thawAnim() {
        animFreeze.forEach((f) => {
            const st = strips[f.i];
            void st.offsetWidth;
            st.style.transition = "transform " + f.left + "ms cubic-bezier(.24,.9,.34,1.1)";
            st.style.transform = "translateY(" + f.target + "px)";
        });
        animFreeze = [];
    }
    function startSpinAnim(spin) {
        anim.spinning = true;
        winMsg.textContent = "Memutar…";
        winMsg.classList.remove("pop");
        reelsBox.classList.remove("win");
        const fast = turbo || REDUCED;
        const durs = fast ? TURBO_DUR : REEL_DUR;
        const FILL = fast ? 4 : 9;
        for (let i = 0; i < 3; i++) {
            const st = strips[i];
            const cells = [cur[i]];
            for (let k = 0; k < FILL; k++) cells.push(weightedSym(i, Math.random, false));
            cells.push(spin.syms[i], weightedSym(i, Math.random, false));
            st.style.transition = "none";
            st.style.transform = "translateY(0)";
            st.innerHTML = cells.map(cellHtml).join("");
            const h = st.firstElementChild.getBoundingClientRect().height || 92;
            if (!REDUCED) windows[i].classList.add("blur");
            st.style.transition = "transform " + durs[i] + "s cubic-bezier(.24,.9,.34,1.1)";
            st.style.transform = "translateY(" + -(FILL + 1) * h + "px)";
            animStartAt[i] = Date.now();
            animTimers.push(later(() => windows[i].classList.remove("blur"), durs[i] * 1000 + 120));
        }
        animTimers.push(later(() => resolveAnim(spin), durs[2] * 1000 + 240));
    }
    function resolveAnim(spin) {
        if (destroyed) return;
        anim.spinning = false;
        seenSeq = spin.seq;
        for (let i = 0; i < 3; i++) {
            windows[i].classList.remove("blur");
            setStripStatic(i, spin.syms[i]);
            cur[i] = spin.syms[i];
        }
        if (spin.win > 0) {
            winMsg.textContent = "+" + spin.win + " • " + seatName(spin.seat);
            winMsg.classList.remove("pop");
            void winMsg.offsetWidth;
            winMsg.classList.add("pop");
            reelsBox.classList.add("win");
        } else {
            winMsg.textContent = "Tidak ada kemenangan";
        }
        render();
        maybeScheduleBot();
    }

    /* ---------------- lempar koin (giliran & kursi acak) ---------------- */
    function runToss() {
        tossing = true;
        tossText.textContent = "Lempar koin…";
        tossSub.textContent = "Menentukan giliran & kursi";
        show(tossEl);
        timers.push(later(() => {
            if (destroyed || !state) return;
            tossText.textContent = seatName(state.firstSeat) + " jalan lebih dulu";
            tossSub.textContent = "Kursimu: Seat " + (mySeat() + 1) + " (diacak)";
        }, 900));
        timers.push(later(() => {
            if (destroyed) return;
            hide(tossEl);
            tossing = false;
            render();
            maybeScheduleBot();
        }, 1900));
    }

    /* ---------------- render ---------------- */
    const overlayOpen = () => helpOpen || cheatsOpen || paused;

    function fillOver() {
        const w = state.winner, me = mySeat(), L = state.level;
        const iWon = w === me, draw = w === -1;
        const c0 = state.seats[0].credits, c1 = state.seats[1].credits;
        ovTitle.textContent = draw ? "Seri" : iWon ? "Kamu menang!" : "Kamu kalah";
        ovTitle.className = "sm-ov-title " + (draw ? "" : iWon ? "good" : "bad");
        ovSub.textContent =
            draw ? "Kredit kedua pemain sama persis."
                : state.reason === "target" ? seatName(w) + " mencapai target " + L.target + " kredit."
                    : state.reason === "bust" ? seatName(1 - w) + " bangkrut (kredit < " + MIN_BET + ")."
                        : state.reason === "cheat" ? "Level diselesaikan lewat cheat."
                            : "Spin habis — kredit akhir dibandingkan.";
        ovStats.textContent =
            "Level " + L.num + " • Kredit " + shortName(0) + " " + c0 + " / " + shortName(1) + " " + c1 +
            " • Menang terbesarmu " + state.seats[me].best + (state.cheated ? " • run cheat" : "");
        nextBtn.textContent = draw ? "Ulangi level" : !online && !iWon ? "Coba level baru" : "Level berikutnya";
        if (iWon && L.num > bestLevel) {
            bestLevel = L.num;
            try { localStorage.setItem(BEST_KEY, String(bestLevel)); } catch (e) { }
        }
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            hud.status.textContent = "Menunggu host…";
            spinBtn.disabled = true;
            return;
        }
        const L = state.level, me = mySeat();
        applyTheme();

        /* ronde baru → reset tampilan + lempar koin */
        if (state.roundId !== seenRound) {
            seenRound = state.roundId;
            cancelAnim();
            cur = ["lemon", "bell", "diamond"];
            for (let i = 0; i < 3; i++) setStripStatic(i, cur[i]);
            reelsBox.classList.remove("win");
            winMsg.textContent = "Semoga beruntung";
            winMsg.classList.remove("pop");
            hide(ovOver);
            runToss();
        }
        /* spin baru dari state (local, bot, atau host) → animasikan */
        if (state.last && state.last.seq !== seenSeq && !anim.spinning) startSpinAnim(state.last);

        hud.level.textContent = L.num;
        hud.target.textContent = L.target;
        hud.spins.textContent = L.spins;
        hud.rate.textContent = L.rate + "%";
        hud.best.textContent = bestLevel || "–";
        marqueeEl.textContent = L.marquee;

        for (let s = 0; s < 2; s++) {
            const p = state.seats[s], ui = seatCards[s];
            ui.name.textContent = seatName(s);
            const tags = [];
            if (s === me) tags.push("KAMU");
            if (s === state.firstSeat) tags.push("DULU");
            ui.tag.textContent = tags.join(" • ");
            ui.cred.textContent = String(p.credits);
            ui.bar.style.width = Math.min(100, (p.credits / L.target) * 100) + "%";
            ui.spins.textContent = p.bust ? "Bangkrut" : p.done ? "Spin habis" : "Spin " + p.spinsLeft + "/" + L.spins;
            ui.bet.textContent = "Taruhan " + p.bet;
            ui.card.classList.toggle("active", state.phase === "playing" && state.turn === s);
        }

        const playing = state.phase === "playing";
        const lock = anim.spinning || tossing;
        const myTurn = playing && state.turn === me;
        const credits = state.seats[me].credits;
        hud.status.textContent = paused ? "Dijeda"
            : !playing ? "Selesai"
                : tossing ? "Koin…"
                    : anim.spinning ? "Putar…"
                        : myTurn ? "Giliranmu"
                            : online ? "Lawan" : "Bot";

        betValEl.textContent = String(state.seats[me].bet);
        chipBtns.forEach((b) => {
            const v = +b.dataset.bet;
            b.classList.toggle("sel", v === state.seats[me].bet);
            b.disabled = !playing || lock || v > credits;
        });
        minusBtn.disabled = plusBtn.disabled = maxBtn.disabled = !playing || lock;
        spinBtn.disabled = !myTurn || lock || credits < MIN_BET;
        spinBtn.textContent = anim.spinning ? "MEMUTAR…" : "PUTAR";
        turboBtn.classList.toggle("on", turbo);
        turboBtn.setAttribute("aria-pressed", String(turbo));

        cheatBtn.hidden = online;
        cheatBtn.classList.toggle("on", state.cheats.free || state.cheats.lucky || Boolean(state.cheats.force));
        if (!online) {
            tgFree.textContent = state.cheats.free ? "ON" : "OFF";
            tgFree.classList.toggle("on", state.cheats.free);
            tgLucky.textContent = state.cheats.lucky ? "ON" : "OFF";
            tgLucky.classList.toggle("on", state.cheats.lucky);
            forceLabel.textContent = state.cheats.force ? "Aktif: 3× " + state.cheats.force : "Tidak aktif";
            ovCheats.querySelectorAll("[data-force]").forEach((b) =>
                b.classList.toggle("sel", b.dataset.force === state.cheats.force));
            ovCheats.querySelectorAll("[data-op],[data-force]").forEach((b) => { b.disabled = !playing; });
        }
        pauseBtn.disabled = online;
        pauseBtn.classList.toggle("on", paused);
        const pauseLabel = pauseBtn.querySelector(".sm-btn-label");
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";

        ovHelp.hidden = !helpOpen;
        ovCheats.hidden = !cheatsOpen || helpOpen;
        ovPause.hidden = !paused || cheatsOpen || helpOpen;
        const overVisible = !playing && !anim.spinning && !tossing;
        if (overVisible) fillOver();
        ovOver.hidden = !overVisible || helpOpen || cheatsOpen || paused;
        spinBtn.disabled = spinBtn.disabled || overlayOpen();
        chipBtns.forEach((b) => { b.disabled = b.disabled || overlayOpen(); });
        minusBtn.disabled = minusBtn.disabled || overlayOpen();
        plusBtn.disabled = plusBtn.disabled || overlayOpen();
        maxBtn.disabled = maxBtn.disabled || overlayOpen();

        hintEl.textContent = COARSE
            ? "Ketuk gulungan atau tombol PUTAR • stepper −/+ untuk taruhan"
            : "Spasi: putar • ↑/↓: taruhan • 1–3: preset • M: max • T: turbo • V: tema • H/C/P/R: bantuan/cheat/pause/restart";
    }

    /* ---------------- alur state (template) ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!state) return;
        state = applyToState(state, action, actor, online);
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------------- bot (mode ai) ---------------- */
    function maybeScheduleBot() {
        if (online || destroyed || !state || botTimer) return;
        if (state.phase !== "playing" || seatOf(state, 1) !== state.turn) return;
        if (anim.spinning || tossing || overlayOpen()) return;
        botTimer = later(() => {
            botTimer = null;
            if (destroyed || !state || state.phase !== "playing") return;
            if (seatOf(state, 1) !== state.turn || anim.spinning || tossing || overlayOpen()) return;
            applyAction({ type: "spin", bet: botBet(state, seatOf(state, 1)) }, 1);
        }, 1000 + Math.random() * 700);
    }

    /* ---------------- helper input ---------------- */
    function toast(msg) {
        toastEl.textContent = msg;
        show(toastEl);
        cancelTimer(toastTimer);
        toastTimer = later(() => hide(toastEl), 1600);
    }
    const myBet = () => (state ? state.seats[mySeat()].bet : BET_VALUES[0]);
    function setBet(v) { if (state && state.phase === "playing") submitAction({ type: "bet", bet: v }); }
    function betStep(d) {
        if (!state || state.phase !== "playing") return;
        const aff = BET_VALUES.filter((v) => v <= state.seats[mySeat()].credits);
        if (!aff.length) return;
        let i = aff.indexOf(myBet());
        if (i < 0) i = aff.length - 1;
        setBet(aff[Math.max(0, Math.min(aff.length - 1, i + d))]);
    }
    function betMax() {
        if (!state || state.phase !== "playing") return;
        const aff = BET_VALUES.filter((v) => v <= state.seats[mySeat()].credits);
        if (aff.length) setBet(aff[aff.length - 1]);
    }
    function doSpin() {
        if (!state || state.phase !== "playing" || anim.spinning || tossing) return;
        if (state.turn !== mySeat() || state.seats[mySeat()].credits < MIN_BET) return;
        submitAction({ type: "spin", bet: myBet() });
    }
    function cycleTheme() {
        const curIdx = themeOverride == null ? (state ? state.level.themeIndex : 0) : themeOverride;
        themeOverride = (curIdx + 1) % THEMES.length;
        render();
        toast("Tema: " + THEMES[themeOverride].name);
    }
    function cheatFeedback(op) {
        if (!state) return;
        if (op === "credits") toast("+100 kredit");
        else if (op === "free") toast("Putaran gratis: " + (state.cheats.free ? "ON" : "OFF"));
        else if (op === "lucky") toast("Gulungan beruntung: " + (state.cheats.lucky ? "ON" : "OFF"));
        else if (op === "win") toast("Level diselesaikan via cheat");
        else if (op === "reroll") toast("Level diacak ulang");
    }

    /* ---------------- overlay & pause ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        render();
    }
    function togglePause(on) {
        if (online) return;
        const next = typeof on === "boolean" ? on : !paused;
        if (next === paused) return;
        paused = next;
        if (paused) { freezeTimers(); freezeAnim(); }
        else { thawAnim(); thawTimers(); maybeScheduleBot(); }
        render();
    }

    /* ---------------- klik (mouse + tombol virtual mobile) ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); maybeScheduleBot(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); maybeScheduleBot(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(false); return; }
        if (t === ovHelp) { toggleHelp(false); maybeScheduleBot(); return; }
        if (t === ovCheats) { toggleCheats(false); maybeScheduleBot(); return; }
        if (t === ovPause) { togglePause(false); return; }
        if (overlayOpen()) return;
        const betB = t.closest("[data-bet]");
        if (betB && !betB.disabled) { setBet(+betB.dataset.bet); return; }
        const opB = t.closest("[data-op]");
        if (opB && !opB.disabled) { submitAction({ type: "cheat", op: opB.dataset.op }); cheatFeedback(opB.dataset.op); return; }
        const fB = t.closest("[data-force]");
        if (fB && !fB.disabled) { submitAction({ type: "cheat", op: "force", sym: fB.dataset.force }); toast("Putaran berikutnya: 3× " + fB.dataset.force); return; }
        const b = t.closest("[data-act]");
        if (b && !b.disabled) {
            const act = b.dataset.act;
            if (act === "spin") doSpin();
            else if (act === "bet-minus") betStep(-1);
            else if (act === "bet-plus") betStep(1);
            else if (act === "bet-max") betMax();
            else if (act === "turbo") { turbo = !turbo; toast(turbo ? "Turbo aktif" : "Turbo nonaktif"); render(); }
            else if (act === "theme") cycleTheme();
            else if (act === "restart") { submitAction({ type: "restart" }); toast("Run baru dimulai"); }
            else if (act === "next") submitAction({ type: "next" });
            return;
        }
        if (t.closest('[data-el="reels"]')) doSpin();
    }

    /* ---------------- keyboard (desktop) ---------------- */
    function onKey(e) {
        if (destroyed || !root.isConnected || !state) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key, code = e.code || "";
        /* prioritas: help → cheats → pause → Escape → aksi game */
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (code === "KeyP") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else togglePause();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) toggleCheats(false);
            else if (paused) togglePause(false);
            return;
        }
        if (overlayOpen()) return;
        if (k === " " || code === "Space") { e.preventDefault(); if (!e.repeat) doSpin(); return; }
        if (k === "Enter") {
            e.preventDefault();
            if (!e.repeat) {
                if (state.phase === "over" && !ovOver.hidden) submitAction({ type: "next" });
                else doSpin();
            }
            return;
        }
        if (k === "ArrowUp" || k === "+" || k === "=") { e.preventDefault(); betStep(1); return; }
        if (k === "ArrowDown" || k === "-" || k === "_") { e.preventDefault(); betStep(-1); return; }
        if (k === "1" || k === "2" || k === "3") { setBet(BET_VALUES[+k - 1]); return; }
        if (k === "m" || k === "M") { betMax(); return; }
        if (k === "t" || k === "T") { turbo = !turbo; toast(turbo ? "Turbo aktif" : "Turbo nonaktif"); render(); return; }
        if (k === "v" || k === "V") { cycleTheme(); return; }
        if (code === "KeyR") { submitAction({ type: "restart" }); toast("Run baru dimulai"); return; }
    }

    /* scroll mouse di area gulungan = ubah taruhan */
    function onWheel(e) {
        if (!state || state.phase !== "playing") return;
        e.preventDefault();
        betStep(e.deltaY < 0 ? 1 : -1);
    }

    /* ---------------- wiring ---------------- */
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    reelsBox.addEventListener("wheel", onWheel, { passive: false });

    if (online) {
        const o1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof o1 === "function") offs.push(o1);
        if (room.isHost) {
            state = newRound(null, 1, randSeed());
            publish();
            const o2 = room.onAction((action) => applyAction(action, 1));
            if (typeof o2 === "function") offs.push(o2);
        } else {
            const o3 = room.onState((nextState) => { state = nextState; render(); });
            if (typeof o3 === "function") offs.push(o3);
        }
    } else {
        state = newRound(null, 1, randSeed());
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            reelsBox.removeEventListener("wheel", onWheel);
            cancelTimer(botTimer);
            cancelTimer(toastTimer);
            timers.forEach(cancelTimer);
            animTimers.forEach(cancelTimer);
            timers = [];
            animTimers = [];
            offs.forEach((fn) => { try { fn(); } catch (e) { } });
        },
    };
}