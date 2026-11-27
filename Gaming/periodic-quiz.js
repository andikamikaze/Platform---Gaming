/* ==== GAME: periodic-quiz.js ==== */
/* =============================================================== */
/* Periodic Quiz - turn-based chemistry duel (new template).  */
/* - Full 118-element table (lanthanides / actinides included).     */
/* - Seeded random match generator: always solvable, 3 levels.      */
/* - vs Bot (mode "ai") or 2 players (mode "room", host = referee). */
/* - Coin toss for first turn + random seat shuffle in multiplayer. */
/* - Minimalist UI, how-to overlay, cheat overlay (offline only),   */
/*   D-pad virtual controls for touch, keyboard + mouse on desktop. */
/* After editing run: node tools/build-games-manifest.mjs           */
/* =============================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "periodic-quiz", // must match the file name (without .js)
    name: "Periodic Quiz",
    category: "educational",
    catLabel: "Educational",
    desc: "A turn-based duel on the full periodic table: find elements, match symbols, names and numbers. Beat the bot or a friend.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="14" height="14" rx="3"/><rect x="24" y="6" width="14" height="14" rx="3"/><rect x="6" y="24" width="14" height="14" rx="3"/><rect x="24" y="24" width="14" height="14" rx="3"/><path d="M11 13h4M13 11v4M29 13h4M11 31h4m8 0h1m-9 8h1"/></svg>',
    bg: ["#fbcfe8", "#ec4899"],
    bestKey: "periodicQuizBest",
};

/* ---------- element data: [symbol, name, number, col, row, family] ---------- */
/* rows 1-7 = main table, row 8 = spacer, rows 9-10 = f-block.                 */
const E = [
    ["H", "Hydrogen", 1, 1, 1, "nm"],
    ["He", "Helium", 2, 18, 1, "ng"],
    ["Li", "Lithium", 3, 1, 2, "al"],
    ["Be", "Beryllium", 4, 2, 2, "ae"],
    ["B", "Boron", 5, 13, 2, "ml"],
    ["C", "Carbon", 6, 14, 2, "nm"],
    ["N", "Nitrogen", 7, 15, 2, "nm"],
    ["O", "Oxygen", 8, 16, 2, "nm"],
    ["F", "Fluorine", 9, 17, 2, "hl"],
    ["Ne", "Neon", 10, 18, 2, "ng"],
    ["Na", "Sodium", 11, 1, 3, "al"],
    ["Mg", "Magnesium", 12, 2, 3, "ae"],
    ["Al", "Aluminium", 13, 13, 3, "pt"],
    ["Si", "Silicon", 14, 14, 3, "ml"],
    ["P", "Phosphorus", 15, 15, 3, "nm"],
    ["S", "Sulfur", 16, 16, 3, "nm"],
    ["Cl", "Chlorine", 17, 17, 3, "hl"],
    ["Ar", "Argon", 18, 18, 3, "ng"],
    ["K", "Potassium", 19, 1, 4, "al"],
    ["Ca", "Calcium", 20, 2, 4, "ae"],
    ["Sc", "Scandium", 21, 3, 4, "tm"],
    ["Ti", "Titanium", 22, 4, 4, "tm"],
    ["V", "Vanadium", 23, 5, 4, "tm"],
    ["Cr", "Chromium", 24, 6, 4, "tm"],
    ["Mn", "Manganese", 25, 7, 4, "tm"],
    ["Fe", "Iron", 26, 8, 4, "tm"],
    ["Co", "Cobalt", 27, 9, 4, "tm"],
    ["Ni", "Nickel", 28, 10, 4, "tm"],
    ["Cu", "Copper", 29, 11, 4, "tm"],
    ["Zn", "Zinc", 30, 12, 4, "tm"],
    ["Ga", "Gallium", 31, 13, 4, "pt"],
    ["Ge", "Germanium", 32, 14, 4, "ml"],
    ["As", "Arsenic", 33, 15, 4, "ml"],
    ["Se", "Selenium", 34, 16, 4, "nm"],
    ["Br", "Bromine", 35, 17, 4, "hl"],
    ["Kr", "Krypton", 36, 18, 4, "ng"],
    ["Rb", "Rubidium", 37, 1, 5, "al"],
    ["Sr", "Strontium", 38, 2, 5, "ae"],
    ["Y", "Yttrium", 39, 3, 5, "tm"],
    ["Zr", "Zirconium", 40, 4, 5, "tm"],
    ["Nb", "Niobium", 41, 5, 5, "tm"],
    ["Mo", "Molybdenum", 42, 6, 5, "tm"],
    ["Tc", "Technetium", 43, 7, 5, "tm"],
    ["Ru", "Ruthenium", 44, 8, 5, "tm"],
    ["Rh", "Rhodium", 45, 9, 5, "tm"],
    ["Pd", "Palladium", 46, 10, 5, "tm"],
    ["Ag", "Silver", 47, 11, 5, "tm"],
    ["Cd", "Cadmium", 48, 12, 5, "tm"],
    ["In", "Indium", 49, 13, 5, "pt"],
    ["Sn", "Tin", 50, 14, 5, "pt"],
    ["Sb", "Antimony", 51, 15, 5, "ml"],
    ["Te", "Tellurium", 52, 16, 5, "ml"],
    ["I", "Iodine", 53, 17, 5, "hl"],
    ["Xe", "Xenon", 54, 18, 5, "ng"],
    ["Cs", "Caesium", 55, 1, 6, "al"],
    ["Ba", "Barium", 56, 2, 6, "ae"],
    ["La", "Lanthanum", 57, 3, 9, "ln"],
    ["Ce", "Cerium", 58, 4, 9, "ln"],
    ["Pr", "Praseodymium", 59, 5, 9, "ln"],
    ["Nd", "Neodymium", 60, 6, 9, "ln"],
    ["Pm", "Promethium", 61, 7, 9, "ln"],
    ["Sm", "Samarium", 62, 8, 9, "ln"],
    ["Eu", "Europium", 63, 9, 9, "ln"],
    ["Gd", "Gadolinium", 64, 10, 9, "ln"],
    ["Tb", "Terbium", 65, 11, 9, "ln"],
    ["Dy", "Dysprosium", 66, 12, 9, "ln"],
    ["Ho", "Holmium", 67, 13, 9, "ln"],
    ["Er", "Erbium", 68, 14, 9, "ln"],
    ["Tm", "Thulium", 69, 15, 9, "ln"],
    ["Yb", "Ytterbium", 70, 16, 9, "ln"],
    ["Lu", "Lutetium", 71, 17, 9, "ln"],
    ["Hf", "Hafnium", 72, 4, 6, "tm"],
    ["Ta", "Tantalum", 73, 5, 6, "tm"],
    ["W", "Tungsten", 74, 6, 6, "tm"],
    ["Re", "Rhenium", 75, 7, 6, "tm"],
    ["Os", "Osmium", 76, 8, 6, "tm"],
    ["Ir", "Iridium", 77, 9, 6, "tm"],
    ["Pt", "Platinum", 78, 10, 6, "tm"],
    ["Au", "Gold", 79, 11, 6, "tm"],
    ["Hg", "Mercury", 80, 12, 6, "tm"],
    ["Tl", "Thallium", 81, 13, 6, "pt"],
    ["Pb", "Lead", 82, 14, 6, "pt"],
    ["Bi", "Bismuth", 83, 15, 6, "pt"],
    ["Po", "Polonium", 84, 16, 6, "pt"],
    ["At", "Astatine", 85, 17, 6, "hl"],
    ["Rn", "Radon", 86, 18, 6, "ng"],
    ["Fr", "Francium", 87, 1, 7, "al"],
    ["Ra", "Radium", 88, 2, 7, "ae"],
    ["Ac", "Actinium", 89, 3, 10, "ac"],
    ["Th", "Thorium", 90, 4, 10, "ac"],
    ["Pa", "Protactinium", 91, 5, 10, "ac"],
    ["U", "Uranium", 92, 6, 10, "ac"],
    ["Np", "Neptunium", 93, 7, 10, "ac"],
    ["Pu", "Plutonium", 94, 8, 10, "ac"],
    ["Am", "Americium", 95, 9, 10, "ac"],
    ["Cm", "Curium", 96, 10, 10, "ac"],
    ["Bk", "Berkelium", 97, 11, 10, "ac"],
    ["Cf", "Californium", 98, 12, 10, "ac"],
    ["Es", "Einsteinium", 99, 13, 10, "ac"],
    ["Fm", "Fermium", 100, 14, 10, "ac"],
    ["Md", "Mendelevium", 101, 15, 10, "ac"],
    ["No", "Nobelium", 102, 16, 10, "ac"],
    ["Lr", "Lawrencium", 103, 17, 10, "ac"],
    ["Rf", "Rutherfordium", 104, 4, 7, "tm"],
    ["Db", "Dubnium", 105, 5, 7, "tm"],
    ["Sg", "Seaborgium", 106, 6, 7, "tm"],
    ["Bh", "Bohrium", 107, 7, 7, "tm"],
    ["Hs", "Hassium", 108, 8, 7, "tm"],
    ["Mt", "Meitnerium", 109, 9, 7, "un"],
    ["Ds", "Darmstadtium", 110, 10, 7, "un"],
    ["Rg", "Roentgenium", 111, 11, 7, "un"],
    ["Cn", "Copernicium", 112, 12, 7, "tm"],
    ["Nh", "Nihonium", 113, 13, 7, "pt"],
    ["Fl", "Flerovium", 114, 14, 7, "pt"],
    ["Mc", "Moscovium", 115, 15, 7, "pt"],
    ["Lv", "Livermorium", 116, 16, 7, "pt"],
    ["Ts", "Tennessine", 117, 17, 7, "hl"],
    ["Og", "Oganesson", 118, 18, 7, "ng"],
];

const FAM = {
    al: ["#fca5a5", "Alkali metal"],
    ae: ["#fdba74", "Alkaline earth"],
    tm: ["#fde047", "Transition metal"],
    pt: ["#86efac", "Post-transition"],
    ml: ["#5eead4", "Metalloid"],
    nm: ["#93c5fd", "Nonmetal"],
    hl: ["#c4b5fd", "Halogen"],
    ng: ["#f0abfc", "Noble gas"],
    ln: ["#fbcfe8", "Lanthanide"],
    ac: ["#a5b4fc", "Actinide"],
    un: ["#e5e7eb", "Unknown"],
};

const SYMS = new Set(E.map((e) => e[0]));
const BY_SYM = {};
E.forEach((e) => (BY_SYM[e[0]] = e));
const ROWS = [...new Set(E.map((e) => e[4]))].sort((a, b) => a - b);

const LIVES = 3;          // lives per player
const MAX_LIVES = 5;      // cheat cap
const TURN_MS = 25000;    // per-question clock (generous => solvable)
const KINDS = ["find", "name", "symbol", "number"];
const KIND_LABEL = {
    find: "Find on table",
    name: "Name",
    symbol: "Symbol",
    number: "Atomic number",
};
const FAMOUS = new Set(["Ag", "Sn", "I", "Au", "Hg", "Pb", "Pt", "W", "U"]);
const LEVELS = [
    { id: 1, name: "Foundations", rounds: 10, bot: 0.55, desc: "45 familiar elements", filter: (el) => el[2] <= 36 || FAMOUS.has(el[0]) },
    { id: 2, name: "Main table", rounds: 12, bot: 0.72, desc: "71 elements, periods 1-6", filter: (el) => el[4] <= 6 && el[5] !== "ln" && el[5] !== "ac" },
    { id: 3, name: "Full table", rounds: 14, bot: 0.85, desc: "All 118 elements", filter: () => true },
];

/* =============================================================== */
/* Pure logic (no DOM) - shared by local play, bot and host referee */
/* =============================================================== */

/* Deterministic PRNG so a seed always yields the same match. */
function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function distractors(pool, el, rnd, get) {
    let src = pool.filter((x) => x[2] !== el[2]);
    if (src.length < 3) src = E.filter((x) => x[2] !== el[2]);
    return shuffle(src, rnd).slice(0, 3).map(get);
}

/* Random level generator. Guarantees a solvable match:
   - distinct elements, even round count => equal turns for both seats
   - every kind appears (cycled with a random offset)
   - MCQ: 4 unique options, exactly one correct
   - "find": target is always a rendered cell
   - "number": distractors are nearby valid atomic numbers */
function generateMatch(seed, level) {
    const L = LEVELS[level - 1];
    const rnd = mulberry32(seed);
    const pool = E.filter(L.filter);
    const picks = shuffle(pool, rnd).slice(0, L.rounds);
    const offset = Math.floor(rnd() * 4);
    return picks.map((el, i) => {
        const kind = KINDS[(i + offset) % 4];
        const base = { kind, sym: el[0], name: el[1], z: el[2], row: el[4], fam: el[5] };
        if (kind === "find") {
            return { ...base, prompt: "Tap " + el[1] + " (" + el[0] + ") on the table.", options: null, answer: el[0] };
        }
        let answer, opts;
        if (kind === "name") {
            answer = el[1];
            opts = distractors(pool, el, rnd, (x) => x[1]);
        } else if (kind === "symbol") {
            answer = el[0];
            opts = distractors(pool, el, rnd, (x) => x[0]);
        } else {
            answer = String(el[2]);
            const cand = [];
            for (let d = 1; d <= 12; d++) {
                if (el[2] - d >= 1) cand.push(String(el[2] - d));
                if (el[2] + d <= 118) cand.push(String(el[2] + d));
            }
            opts = shuffle(cand, rnd).slice(0, 3);
        }
        const options = shuffle([answer].concat(opts), rnd);
        const prompt =
            kind === "name"
                ? "Which element has atomic number " + el[2] + "?"
                : kind === "symbol"
                    ? "Which symbol belongs to " + el[1] + "?"
                    : "What is the atomic number of " + el[1] + " (" + el[0] + ")?";
        return { ...base, prompt, options, answer };
    });
}

function judge(q, pick) {
    if (q.kind === "find") return pick === q.answer;
    return q.options[pick] === q.answer;
}
function correctPick(q) {
    return q.kind === "find" ? q.answer : q.options.indexOf(q.answer);
}
function answerText(q) {
    if (q.kind === "find") return q.name + " (" + q.sym + ")";
    if (q.kind === "name") return q.answer;
    if (q.kind === "symbol") return q.answer + " - " + q.name;
    return "#" + q.answer;
}
/* Bot: level-based accuracy; "blunder" cheat forces a wrong pick. */
function botPick(q, accuracy, blunder) {
    const good = !blunder && Math.random() < accuracy;
    if (q.kind === "find") {
        if (good) return q.answer;
        const others = E.filter((e) => e[0] !== q.answer);
        return others[Math.floor(Math.random() * others.length)][0];
    }
    const ci = q.options.indexOf(q.answer);
    if (good) return ci;
    const wrong = [0, 1, 2, 3].filter((i) => i !== ci);
    return wrong[Math.floor(Math.random() * wrong.length)];
}

function initialState(hostName = "Player", guestName = "Bot") {
    return {
        phase: "menu", // menu | playing | reveal | over
        level: 1,
        seed: 0,
        rounds: [],
        total: 0,
        idx: 0,
        first: 0,
        turn: 0,
        hostSeat: 0,
        names: { host: hostName, guest: guestName },
        players: [
            { name: hostName, correct: 0, lives: LIVES, answered: 0 },
            { name: guestName, correct: 0, lives: LIVES, answered: 0 },
        ],
        last: null,
        winner: null, // 0 | 1 | "draw"
        reason: null, // "lives" | "rounds"
        cheated: false,
        botBlunder: false,
        deadline: 0,
    };
}
function cloneState(s) {
    return {
        ...s,
        names: { ...s.names },
        players: s.players.map((p) => ({ ...p })),
        last: s.last ? { ...s.last } : null,
    };
}
function applyAnswer(s, actor, pick, cheat, online) {
    const q = s.rounds[s.idx];
    const good = judge(q, pick);
    const p = s.players[actor];
    p.answered += 1;
    if (good) p.correct += 1;
    else p.lives = Math.max(0, p.lives - 1);
    if (cheat) s.cheated = true;
    if (!online && actor === 1) s.botBlunder = false;
    s.last = { seat: actor, pick, good, skipped: false, timeout: false };
    s.phase = "reveal";
    s.deadline = 0;
    return s;
}

/* Authoritative reducer. Returns the SAME reference when an action is
   invalid, so callers can skip publishing. actor -1 = system (host only). */
function reduce(state, action, actor, online) {
    if (!state || !action || typeof action.type !== "string") return state;
    const s = cloneState(state);
    const hostActor = online ? actor === state.hostSeat : actor === 0;
    switch (action.type) {
        case "start": {
            if (state.phase !== "menu" && state.phase !== "over") return state;
            if (!hostActor) return state;
            const level = Math.min(3, Math.max(1, Math.round(action.level || state.level || 1)));
            const seed = Math.floor(Math.random() * 0x7fffffff);
            /* randomness: seats shuffled online, coin toss for first turn */
            const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;
            const first = Math.random() < 0.5 ? 0 : 1;
            const rounds = generateMatch(seed, level);
            if (online && typeof action.guestName === "string" && action.guestName) {
                s.names.guest = action.guestName;
            }
            s.players = [0, 1].map((i) => ({
                name: i === hostSeat ? s.names.host : s.names.guest,
                correct: 0,
                lives: LIVES,
                answered: 0,
            }));
            Object.assign(s, {
                level, seed, rounds,
                total: rounds.length,
                idx: 0, first, turn: first, hostSeat,
                phase: "playing",
                last: null, winner: null, reason: null,
                cheated: false, botBlunder: false,
                deadline: Date.now() + TURN_MS,
            });
            return s;
        }
        case "answer": {
            if (state.phase !== "playing" || actor !== state.turn || action.idx !== state.idx) return state;
            const q = state.rounds[state.idx];
            const pick = action.pick;
            if (q.kind === "find") {
                if (typeof pick !== "string" || !SYMS.has(pick)) return state;
            } else if (!Number.isInteger(pick) || pick < 0 || pick >= q.options.length) {
                return state;
            }
            return applyAnswer(s, actor, pick, Boolean(action.cheat), online);
        }
        case "timeout": {
            if (actor !== -1 || state.phase !== "playing" || action.idx !== state.idx) return state;
            const p = s.players[s.turn];
            p.answered += 1;
            p.lives = Math.max(0, p.lives - 1);
            s.last = { seat: s.turn, pick: null, good: false, skipped: false, timeout: true };
            s.phase = "reveal";
            s.deadline = 0;
            return s;
        }
        case "advance": {
            if (actor !== -1 || state.phase !== "reveal" || action.idx !== state.idx) return state;
            if (s.players[s.turn].lives <= 0) {
                s.phase = "over";
                s.winner = 1 - s.turn;
                s.reason = "lives";
                return s;
            }
            if (s.idx + 1 >= s.total) {
                const a = s.players[0].correct;
                const b = s.players[1].correct;
                s.phase = "over";
                s.winner = a === b ? "draw" : a > b ? 0 : 1;
                s.reason = "rounds";
                return s;
            }
            s.idx += 1;
            s.turn = 1 - s.turn;
            s.phase = "playing";
            s.last = null;
            s.deadline = Date.now() + TURN_MS;
            return s;
        }
        case "menu": {
            if (!hostActor || state.phase !== "over") return state;
            s.phase = "menu";
            return s;
        }
        /* ---- cheats: offline (vs bot) only, human is always seat 0 ---- */
        case "cheat-life": {
            if (online || actor !== 0 || state.phase !== "playing" || state.players[0].lives >= MAX_LIVES) return state;
            s.players[0].lives += 1;
            s.cheated = true;
            return s;
        }
        case "cheat-skip": {
            if (online || actor !== 0 || state.phase !== "playing" || state.turn !== 0) return state;
            s.last = { seat: 0, pick: null, good: false, skipped: true, timeout: false };
            s.phase = "reveal";
            s.deadline = 0;
            s.cheated = true;
            return s;
        }
        case "cheat-blunder": {
            if (online || actor !== 0 || (state.phase !== "playing" && state.phase !== "reveal")) return state;
            s.botBlunder = true;
            s.cheated = true;
            return s;
        }
        case "cheat-solve": {
            if (online || actor !== 0 || state.phase !== "playing" || state.turn !== 0) return state;
            return applyAnswer(s, 0, correctPick(state.rounds[state.idx]), true, online);
        }
        case "cheat-mark": {
            if (online || actor !== 0 || state.phase === "menu" || state.phase === "over") return state;
            s.cheated = true;
            return s;
        }
        default:
            return state;
    }
}

/* ---- styles (injected into the shell) ---- */
const CSS_TEXT = `
/* ---- minimalist light theme, scoped to this game ---- */
.pq-app{position:relative;min-width:0;--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--card:#ffffff;--bg:#f6f7fb;--acc:#4f46e5;--acc2:#ec4899;--good:#10b981;--bad:#ef4444;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.pq-app [hidden]{display:none!important}
.pq-app button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.pq-app button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.pq-app .pq-panel{background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:420px;min-width:0;overflow:hidden}
.pq-app .pq-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.pq-app .pq-center{text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center}
/* players + match info */
.pq-app .pq-head{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:stretch}
.pq-app .pq-player{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px;min-width:0;transition:box-shadow .16s}
.pq-app .pq-player.s1{border-left-color:var(--acc2)}
.pq-app .pq-player.on{box-shadow:0 0 0 3px rgba(79,70,229,.14)}
.pq-app .pq-player.s1.on{box-shadow:0 0 0 3px rgba(236,72,153,.14)}
.pq-app .pq-pname{font-weight:800;font-size:13.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pq-app .pq-tag{font-size:10px;font-weight:700;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:2px 8px}
.pq-app .pq-pstats{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pq-app .pq-pstats b{font-size:18px;color:var(--ink)}
.pq-app .pq-hearts{color:var(--bad);letter-spacing:2px;font-size:13px}
.pq-app .pq-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:120px}
.pq-app .pq-chip{font-size:10.5px;font-weight:700;color:var(--mut);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap}
.pq-app .pq-toss{font-size:10.5px;color:var(--mut);text-align:center}
/* prompt + clock */
.pq-app .pq-prompt{display:flex;flex-direction:column;gap:8px;padding:12px 16px}
.pq-app .pq-kind{align-self:center;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);background:rgba(79,70,229,.08);border-radius:999px;padding:4px 12px}
.pq-app .pq-q{font-size:19px;font-weight:800;text-align:center;line-height:1.35}
.pq-app .pq-clock{display:flex;align-items:center;gap:8px}
.pq-app .pq-timer{flex:1;height:6px;background:var(--line);border-radius:999px;overflow:hidden}
.pq-app .pq-timer i{display:block;height:100%;background:var(--acc);border-radius:999px;transition:width .2s linear}
.pq-app .pq-timer i.low{background:var(--bad)}
.pq-app .pq-tleft{font-size:11px;font-weight:700;color:var(--mut);min-width:32px;text-align:right}
/* periodic table */
.pq-app .pq-tablewrap{overflow-x:auto;max-width:100%;padding:4px 2px;min-width:0}
.pq-app .pq-table{display:grid;grid-template-columns:repeat(18,minmax(26px,1fr));gap:3px;min-width:540px;max-width:880px;margin:0 auto}
.pq-app .pq-cell{position:relative;aspect-ratio:1;border:0;border-radius:6px;font-weight:800;font-size:clamp(9px,1.4vw,13px);color:#0b1020;display:grid;place-items:center;cursor:default;padding:0;transition:transform .08s}
.pq-app .pq-table.live .pq-cell{cursor:pointer}
.pq-app .pq-table.live .pq-cell:hover{transform:scale(1.1)}
.pq-app .pq-z{position:absolute;top:1px;left:3px;font-size:7px;font-weight:700;opacity:.6}
.pq-app .pq-cell.cur{box-shadow:0 0 0 2px var(--ink)}
.pq-app .pq-cell.good{box-shadow:0 0 0 3px var(--good)}
.pq-app .pq-cell.bad{box-shadow:0 0 0 3px var(--bad)}
.pq-app .pq-cell.hint{outline:2px dashed var(--acc);outline-offset:1px;animation:pq-pulse 1s infinite}
.pq-app .pq-cell.scan{box-shadow:0 0 0 1.5px rgba(17,24,39,.35)}
.pq-app .pq-ph{aspect-ratio:1;border:1px dashed var(--line);border-radius:6px;display:grid;place-items:center;font-size:8px;color:var(--mut);font-weight:700;background:var(--card)}
.pq-app .pq-spacer{height:8px}
.pq-app .pq-legend{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:center;font-size:10px;color:var(--mut)}
.pq-app .pq-legend i{width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:4px;vertical-align:-1px}
/* options */
.pq-app .pq-opts{display:grid;grid-template-columns:repeat(2,minmax(0,230px));gap:8px;justify-content:center;width:100%}
.pq-app .pq-opt{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--card);border-radius:10px;min-height:56px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;text-align:left;transition:border-color .16s,background .16s}
.pq-app .pq-opt kbd{flex:none;width:20px;height:20px;display:grid;place-items:center;border:1px solid var(--line);border-radius:6px;font-size:11px;font-weight:800;color:var(--mut);background:var(--bg)}
.pq-app .pq-opt:not(:disabled):hover{border-color:var(--acc)}
.pq-app .pq-opt.good{background:#ecfdf5;border-color:var(--good)}
.pq-app .pq-opt.bad{background:#fef2f2;border-color:var(--bad)}
.pq-app .pq-opt.hint{border-style:dashed;border-color:var(--acc)}
.pq-app .pq-opt.gone{visibility:hidden}
.pq-app .pq-opt:disabled{cursor:default;opacity:.85}
/* feedback + cursor strip + d-pad */
.pq-app .pq-fb{min-height:24px;text-align:center;font-weight:700;font-size:14px;color:var(--mut);line-height:1.4}
.pq-app .pq-fb.good{color:var(--good)}
.pq-app .pq-fb.bad{color:var(--bad)}
.pq-app .pq-strip{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
.pq-app .pq-focus{font-size:13px;color:var(--mut)}
.pq-app .pq-focus b{font-size:16px;color:var(--ink);margin-right:4px}
.pq-app .pq-pad{display:grid;grid-template-columns:repeat(3,58px);grid-auto-rows:44px;gap:8px;justify-content:center}
.pq-app .pq-pad button{border:1px solid var(--line);background:var(--card);border-radius:10px;font-size:16px;font-weight:800;cursor:pointer}
.pq-app .pq-pad button:not(:disabled):active{background:#eef2ff}
.pq-app .pq-pad button:disabled{opacity:.45;cursor:default}
.pq-app .pq-pick{color:var(--acc);font-size:13px}
/* buttons */
.pq-app .pq-mini{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;color:var(--mut);cursor:pointer}
.pq-app .pq-mini:hover{border-color:var(--acc);color:var(--acc)}
.pq-app .pq-cta{border:1px solid var(--acc);background:var(--acc);color:#fff;border-radius:8px;min-height:44px;padding:8px 20px;font-size:15px;font-weight:800;cursor:pointer}
.pq-app .pq-cta:hover{filter:brightness(1.07)}
.pq-app .pq-cta.alt{background:var(--card);color:var(--ink);border:1px solid var(--line)}
/* menu + results */
.pq-app .pq-menu h3,.pq-app .pq-over h3{margin:0 0 4px;font-size:20px}
.pq-app .pq-sub{margin:0 0 12px;font-size:13px;color:var(--mut);line-height:1.5}
.pq-app .pq-levels{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px}
.pq-app .pq-level{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px;text-align:left;cursor:pointer;font-size:11.5px;color:var(--mut)}
.pq-app .pq-level b{font-size:14px;color:var(--ink)}
.pq-app .pq-level.sel{border-color:var(--acc);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.pq-app .pq-level:disabled{cursor:default;opacity:.7}
.pq-app .pq-facts{margin:0 0 12px;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--mut)}
.pq-app .pq-best{font-size:12.5px;color:var(--mut);margin:0 0 12px}
.pq-app .pq-wait{font-size:13px;color:var(--mut);font-weight:700}
.pq-app .pq-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pq-app .pq-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
.pq-app .pq-stat{border:1px solid var(--line);border-radius:10px;padding:12px;font-size:12px;color:var(--mut);display:flex;flex-direction:column;gap:4px}
.pq-app .pq-stat b{color:var(--ink);font-size:13px}
.pq-app .pq-badge{display:inline-block;font-size:10.5px;font-weight:800;border-radius:999px;padding:4px 10px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;margin-bottom:12px}
/* overlays */
.pq-app .pq-overlay{position:absolute;inset:0;background:rgba(17,24,39,.45);display:grid;place-items:center;padding:12px;z-index:30;border-radius:14px;overflow:auto}
.pq-app .pq-modal{background:var(--card);border:1px solid var(--line);border-radius:12px;max-width:580px;width:100%;max-height:100%;overflow:auto;padding:20px;position:relative}
.pq-app .pq-modal h3{margin:0 0 8px;font-size:18px}
.pq-app .pq-x{position:absolute;top:8px;right:8px;border:1px solid var(--line);background:var(--card);border-radius:8px;width:36px;height:36px;cursor:pointer;font-weight:800;color:var(--mut)}
.pq-app .pq-help h4{margin:12px 0 4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut)}
.pq-app .pq-help p,.pq-app .pq-help li{font-size:13px;line-height:1.55;color:var(--mut);margin:0 0 8px}
.pq-app .pq-help ul{margin:0;padding-left:18px}
.pq-app .pq-help kbd{border:1px solid var(--line);border-radius:5px;padding:0 5px;font-size:11px;background:var(--bg)}
.pq-app .pq-cheat{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:8px}
.pq-app .pq-cheat div{font-size:12.5px;color:var(--mut)}
.pq-app .pq-cheat div b{display:block;font-size:13px;color:var(--ink)}
.pq-app .pq-cheat button{flex:none;border:1px solid var(--line);background:var(--bg);border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;color:var(--acc)}
.pq-app .pq-cheat button:disabled{opacity:.45;cursor:default;color:var(--mut)}
.pq-app .pq-note{font-size:11.5px;color:var(--mut);margin-top:12px}
@keyframes pq-pulse{50%{outline-color:transparent}}
@media (max-width:640px){
.pq-app .pq-head{grid-template-columns:1fr 1fr;gap:8px}
.pq-app .pq-mid{grid-column:1/-1;flex-direction:row;flex-wrap:wrap;min-width:0}
.pq-app .pq-q{font-size:16px}
.pq-app .pq-panel{padding:10px;gap:8px}
.pq-app .pq-opts{grid-template-columns:1fr 1fr;gap:8px}
.pq-app .pq-opt{font-size:13.5px;padding:10px}
.pq-app .pq-modal{padding:16px}
}
@media (pointer:coarse){
.pq-app .pq-mini{min-height:44px;padding:8px 12px}
.pq-app .pq-x{width:44px;height:44px}
.pq-app .pq-cheat button{min-height:44px}
}
@media (prefers-reduced-motion:reduce){.pq-app *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}

/* ---- layout system: HUD + fill-height board (keep LAST) ---- */
.pq-app.game-fill > .pq-panel[data-board]{position:relative;flex:1 1 auto;min-height:0;aspect-ratio:auto}
.pq-app .pq-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;min-width:0;font:700 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.pq-app .pq-hud .pq-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;font-size:10.5px;white-space:nowrap}
.pq-app .pq-hud .pq-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.pq-app .pq-hud .pq-chip.on{border-color:var(--acc);color:var(--acc)}
.pq-app .pq-hud .pq-bar{width:46px;height:5px;background:var(--line);border-radius:999px;overflow:hidden}
.pq-app .pq-hud .pq-bar i{display:block;height:100%;width:100%;background:var(--acc);border-radius:999px;transition:width .2s linear}
.pq-app .pq-hud .pq-bar i.low{background:var(--bad)}
.pq-app .pq-hud .pq-spacer{flex:1 1 auto}
.pq-app .pq-hud .pq-hbtn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 10px;border:1px solid var(--line);background:var(--card);border-radius:999px;font-size:10px;font-weight:800;color:var(--mut);cursor:pointer}
.pq-app .pq-hud .pq-hbtn:hover{border-color:var(--acc);color:var(--acc)}
.pq-app .pq-hud .pq-hbtn.on{border-color:var(--acc);color:var(--acc);background:#eef2ff}
.pq-app .pq-hud .pq-hbtn svg{flex:none;display:block}
.pq-app .pq-content{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:auto;padding-right:2px}
.pq-app .pq-padhost{flex:none}
.pq-app .pq-padhost:empty{display:none}
.pq-app .pq-modal{display:flex;flex-direction:column;overflow:hidden;max-height:100%}
.pq-app .pq-modal .pq-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;padding-bottom:10px;border-bottom:1px solid var(--line)}
.pq-app .pq-modal .pq-head h3{margin:0;font-size:16px}
.pq-app .pq-modal .pq-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding-top:10px}
.pq-app .pq-modal .pq-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
@media (max-width:640px){
.pq-app.game-fill > .pq-panel[data-board]:has(.pq-overlay:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px)}
.pq-app .pq-hud{gap:5px;margin-bottom:8px}
.pq-app .pq-hud .pq-chip{padding:4px 6px;font-size:9px}
.pq-app .pq-hud .pq-chip[data-hud="best"],
.pq-app .pq-hud .pq-chip[data-hud="toss"],
.pq-app .pq-hud .pq-chip[data-hud="lv"],
.pq-app .pq-hud .pq-chip[data-hud="status"]{display:none}
.pq-app .pq-hud .pq-bar{width:36px}
.pq-app .pq-hud .pq-hbtn{min-height:32px;padding:5px 9px;font-size:10px}
.pq-app .pq-hud .pq-hlbl,
.pq-app .pq-hud .pq-spacer{display:none}
.pq-app .pq-overlay{padding:8px}
.pq-app .pq-modal{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.pq-app .pq-scroll,
.pq-app .pq-cheat-scroll,
.pq-app .pq-content{scrollbar-width:none}
.pq-app .pq-scroll::-webkit-scrollbar,
.pq-app .pq-cheat-scroll::-webkit-scrollbar,
.pq-app .pq-content::-webkit-scrollbar{display:none}
.pq-app .pq-modal .pq-foot{position:static;margin-top:8px;padding-top:8px}
.pq-app .pq-note{display:none}
.pq-app .pq-padhost .pq-pad{grid-template-columns:repeat(3,46px);grid-auto-rows:40px}
}
`;

/* =============================================================== */
/* mount() - UI + input + networking wiring (template contract)     */
/* =============================================================== */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    /* With shuffled seats my index comes from state.hostSeat, not isHost. */
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

    /* Local-only UI state (never synced). */
    const ui = {
        cursor: "H",      // table cursor symbol
        reveal: false,    // cheat: highlight answer
        fifty: null,      // cheat: {hide:[i,j]} for MCQ or {row} for find
        qKey: "",         // resets per-question cheats
        help: false,
        cheats: false,
        pad: coarse,      // virtual D-pad (auto-on for touch devices)
        level: 1,
        savedSeed: -1,
    };
    let paused = false;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { /* private mode */ }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("periodicQuizHelpSeen") === "1"; } catch (e) { /* private mode */ }
    if (!seenHelp) {
        ui.help = true;
        try { localStorage.setItem("periodicQuizHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    /* Named timers can be frozen as one group; their Date.now() due anchors
       are replayed on resume so the clock never jumps past a paused overlay. */
    let frozen = false, frozenAt = 0;
    const timers = new Map(), deferred = new Map();
    const TK = { timeout: "timeout", bot: "bot", advance: "advance" };
    let tickI = 0;
    function clearTimer(name) {
        const r = timers.get(name);
        if (r) clearTimeout(r.id);
        timers.delete(name);
        deferred.delete(name);
    }
    function clearAllTimers() {
        for (const r of timers.values()) clearTimeout(r.id);
        timers.clear();
        deferred.clear();
        frozen = false;
    }
    function later(name, ms, fn) {
        clearTimer(name);
        if (frozen) { deferred.set(name, { wait: Math.max(0, ms), fn }); return; }
        const id = setTimeout(() => { timers.delete(name); fn(); }, Math.max(0, ms));
        timers.set(name, { id, due: Date.now() + Math.max(0, ms), fn });
    }
    function freezeTimers() {
        if (online || frozen) return;
        frozen = true;
        frozenAt = Date.now();
        for (const [name, r] of timers) {
            clearTimeout(r.id);
            deferred.set(name, { wait: Math.max(0, r.due - frozenAt), fn: r.fn });
        }
        timers.clear();
    }
    function thawTimers() {
        if (online || !frozen) return;
        const away = Date.now() - frozenAt;
        frozen = false;
        if (state && state.phase === "playing") state.deadline += away;
        const queue = [...deferred];
        deferred.clear();
        for (const [name, r] of queue) later(name, r.wait, r.fn);
    }
    function syncOverlayPause() {
        if (online) return;
        const want = paused || ui.help || ui.cheats;
        if (want && !frozen) freezeTimers();
        else if (!want && frozen) thawTimers();
    }

    const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

    root.innerHTML = `
<style>${CSS_TEXT}</style>
<div class="game-app pq-app game-fill" data-pq>
  <div class="pq-hud">
    <span class="pq-chip" data-hud="p0">YOU 0✓ 3♥</span>
    <span class="pq-chip" data-hud="p1">BOT 0✓ 3♥</span>
    <span class="pq-chip">LV <b data-hud="lv">1</b></span>
    <span class="pq-chip">Q <b data-hud="q">—</b></span>
    <span class="pq-chip">TURN <b data-hud="turn">—</b></span>
    <span class="pq-chip">BEST <b data-hud="best">0</b></span>
    <span class="pq-chip" data-hud="toss"></span>
    <span class="pq-chip pq-clock" data-clock hidden>TIME <b data-hud="time">0s</b><span class="pq-bar"><i data-hud="timerbar"></i></span></span>
    <span class="pq-chip" data-hud="status">Ready</span>
    <span class="pq-spacer"></span>
    <button class="pq-hbtn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pq-hlbl">Help</span></button>
    <button class="pq-hbtn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="pq-hlbl">Cheats</span></button>
    <button class="pq-hbtn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="pq-hlbl">Pause</span></button>
    <button class="pq-hbtn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="pq-hlbl">Restart</span></button>
    <button class="pq-hbtn" type="button" data-act="pad-toggle" data-pad-toggle aria-label="Toggle D-pad" title="Toggle D-pad">${iconSVG("gamepad2", { size: 14 })}<span class="pq-hlbl">D-pad</span></button>
    <button class="pq-hbtn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pq-hlbl">Exit game</span></button>
  </div>
  <section class="game-panel pq-panel" data-board>
    <div class="pq-content" data-content></div>
    <div class="pq-overlay" data-ov="help" hidden>
      <div class="pq-modal pq-help">
        <div class="pq-head"><h3>How to play</h3><button class="pq-mini" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="pq-scroll">
          <h4>Goal</h4>
          <p>You and a rival (bot or friend) take turns answering. Each side has ${LIVES} lives; a wrong answer or a ${TURN_MS / 1000}-second timeout costs one. The match ends when all questions are done or someone runs out of lives - most correct answers wins, equal scores is a draw.</p>
          <h4>Question types</h4>
          <ul>
            <li><b>Find on table</b> - tap the cell matching the given name + symbol.</li>
            <li><b>Name</b> - pick the element with the given atomic number.</li>
            <li><b>Symbol</b> - pick the symbol belonging to the element.</li>
            <li><b>Atomic number</b> - pick the number of the given element.</li>
          </ul>
          <h4>Turns &amp; luck</h4>
          <p>A coin toss decides who answers first and turns alternate. In multiplayer, seats (Player 1 / Player 2) are re-shuffled at every start - the host is not always Player 1. Only the host runs the clock and referees the match.</p>
          <h4>Desktop controls</h4>
          <ul>
            <li>Mouse: click cells, options and buttons. Hovering a cell shows its info.</li>
            <li><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move the table cursor, <kbd>Enter</kbd>/<kbd>Space</kbd> picks the cell.</li>
            <li><kbd>1</kbd>-<kbd>4</kbd> picks an option · <kbd>1</kbd>-<kbd>3</kbd> selects a level in the menu.</li>
            <li><kbd>Space</kbd> start / rematch · <kbd>R</kbd> restart · <kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>Esc</kbd> close overlays.</li>
          </ul>
          <h4>Mobile controls</h4>
          <p>Tap cells or options directly, or steer the cursor with the on-screen D-pad and confirm with ✓ Pick. Toggle the pad with the D-pad button in the HUD. The table scrolls sideways on narrow screens and follows the cursor.</p>
          <h4>Levels</h4>
          <p>Foundations: 10 questions, 45 familiar elements, bot 55%. Main table: 12 questions, periods 1-6, bot 72%. Full table: 14 questions, all 118 elements, bot 85%. Every match is randomly generated and always solvable: unique options with exactly one correct answer, real table targets and equal turns.</p>
          <h4>Cheats</h4>
          <p>Offline (vs bot) only: reveal, 50:50, +1 life, skip, bot blunder and auto-solve. Using any cheat disables personal-best saving for that match.</p>
        </div>
        <div class="pq-foot"><span class="pq-note">Press H to reopen this guide</span><button class="pq-cta" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
    <div class="pq-overlay" data-ov="cheats" hidden>
      <div class="pq-modal">
        <div class="pq-head"><h3>Cheat console</h3><button class="pq-mini" type="button" data-cheats-close aria-label="Close cheats">Close</button></div>
        <div class="pq-scroll pq-cheat-scroll">
          <p class="pq-sub">Offline only. Anything you use here marks the match as cheated.</p>
          <div data-cheat-body></div>
        </div>
        <div class="pq-foot"><span class="pq-note">Tip: press <b>C</b> to toggle this console, <b>Esc</b> to close.</span><button class="pq-cta alt" type="button" data-cheats-close>Done</button></div>
      </div>
    </div>
    <div class="pq-overlay" data-ov="pause" hidden>
      <div class="pq-modal pq-center">
        <div class="pq-head"><h3>Paused</h3><span class="pq-tag">Clock stopped</span></div>
        <div class="pq-scroll"><p class="pq-sub">The turn clock, bot and reveal timers are frozen. Resume to continue exactly where you left off.</p></div>
        <div class="pq-foot"><span class="pq-note">Press P or Esc to resume</span><button class="pq-cta" type="button" data-resume>Resume</button></div>
      </div>
    </div>
  </section>
  <div class="pq-padhost" data-padhost></div>
</div>`;

    const $ = (sel) => root.querySelector(sel);
    const board = $("[data-board]");
    const content = $("[data-content]");
    const padHost = $("[data-padhost]");
    const statusEl = $('[data-hud="status"]');
    const cheatsBtn = $("[data-cheats]");
    const clockChip = $("[data-clock]");
    const helpOv = $('[data-ov="help"]');
    const cheatOv = $('[data-ov="cheats"]');
    const pauseOv = $('[data-ov="pause"]');
    const cheatBody = $("[data-cheat-body]");

    /* ---------------- helpers ---------------- */
    const seatOfMe = () => (online ? (state ? (room.isHost ? state.hostSeat : 1 - state.hostSeat) : -1) : 0);
    const canStart = () => !online || room.isHost;
    const currentQ = () => (state && state.rounds.length ? state.rounds[state.idx] : null);
    const myTurn = () => Boolean(state && state.phase === "playing" && state.turn === seatOfMe());
    const setStatus = (t) => { statusEl.textContent = t; };
    function guessGuestName() {
        const p = roomData?.players;
        if (Array.isArray(p)) {
            const g = p.find((x) => x && (x.isHost === false || x.role === "guest"));
            if (g?.name) return String(g.name);
        }
        return roomData?.guestName || roomData?.names?.guest || "Guest";
    }
    function startAction(level) {
        const a = { type: "start", level };
        if (online && room.isHost) a.guestName = guessGuestName();
        return a;
    }
    function focusHTML() {
        const el = BY_SYM[ui.cursor] || E[0];
        return "<b>" + el[0] + "</b>" + esc(el[1]) + " · #" + el[2] + " · " + FAM[el[5]][1];
    }
    function updateCursor(scroll) {
        const prev = root.querySelector(".pq-cell.cur");
        if (prev) prev.classList.remove("cur");
        const cell = root.querySelector('.pq-cell[data-sym="' + ui.cursor + '"]');
        if (cell) {
            cell.classList.add("cur");
            if (scroll) cell.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        const strip = root.querySelector("[data-cursor]");
        if (strip) strip.innerHTML = focusHTML();
    }
    function moveCursor(dx, dy) {
        const cur = BY_SYM[ui.cursor] || E[0];
        let next = null;
        if (dx) {
            const row = E.filter((e) => e[4] === cur[4]).sort((a, b) => a[3] - b[3]);
            const i = row.findIndex((e) => e[0] === cur[0]);
            next = row[(i + dx + row.length) % row.length];
        } else {
            let ri = ROWS.indexOf(cur[4]);
            for (let step = 0; step < ROWS.length; step++) {
                ri = (ri + dy + ROWS.length) % ROWS.length;
                const cand = E.filter((e) => e[4] === ROWS[ri]);
                if (cand.length) {
                    next = cand.reduce((best, e) => (Math.abs(e[3] - cur[3]) < Math.abs(best[3] - cur[3]) ? e : best), cand[0]);
                    break;
                }
            }
        }
        if (next) { ui.cursor = next[0]; updateCursor(true); }
    }

    /* ---------------- render helpers ---------------- */
    function legendHTML() {
        return '<div class="pq-legend">' + Object.keys(FAM).map((k) => '<span><i style="background:' + FAM[k][0] + '"></i>' + FAM[k][1] + "</span>").join("") + "</div>";
    }
    function tableHTML(q) {
        const mine = myTurn();
        const reveal = state.phase === "reveal";
        const last = state.last;
        const find = q.kind === "find";
        let h = '<div class="pq-tablewrap"><div class="pq-table' + (find && mine ? " live" : "") + '">';
        for (const el of E) {
            const cls = ["pq-cell"];
            if (el[0] === ui.cursor) cls.push("cur");
            if (reveal && find) {
                if (el[0] === q.answer) cls.push("good");
                else if (last && !last.good && last.pick === el[0]) cls.push("bad");
            }
            if (find && mine && ui.reveal && el[0] === q.answer) cls.push("hint");
            if (find && mine && ui.fifty && ui.fifty.row === el[4]) cls.push("scan");
            h += '<button type="button" class="' + cls.join(" ") + '" data-sym="' + el[0] + '" style="grid-column:' + el[3] + ";grid-row:" + el[4] + ";background:" + FAM[el[5]][0] + '" aria-label="' + esc(el[1]) + ", " + el[2] + '"><span class="pq-z">' + el[2] + "</span>" + el[0] + "</button>";
        }
        h += '<div class="pq-ph" style="grid-column:3;grid-row:6">57-71</div>';
        h += '<div class="pq-ph" style="grid-column:3;grid-row:7">89-103</div>';
        h += '<div class="pq-spacer" style="grid-column:1/-1;grid-row:8"></div>';
        return h + "</div></div>";
    }
    function playerCardHTML(i) {
        const p = state.players[i];
        const on = state.phase === "playing" && state.turn === i;
        const me = seatOfMe();
        const tag = online ? (i === me ? "You" : i === state.hostSeat ? "Host" : "Guest") : i === 0 ? "You" : "Bot";
        const hearts = "♥".repeat(p.lives) + "♡".repeat(Math.max(0, LIVES - p.lives));
        return '<div class="pq-player s' + i + (on ? " on" : "") + '"><div class="pq-pname">' + esc(p.name) + '<span class="pq-tag">' + tag + '</span></div><div class="pq-pstats"><b>' + p.correct + '</b> correct <span class="pq-hearts">' + hearts + "</span></div></div>";
    }
    function optionsHTML(q) {
        const mine = myTurn();
        const reveal = state.phase === "reveal";
        const last = state.last;
        return '<div class="pq-opts">' + q.options.map((o, i) => {
            const cls = ["pq-opt"];
            if (mine && ui.fifty && ui.fifty.hide && ui.fifty.hide.includes(i)) cls.push("gone");
            if (mine && ui.reveal && o === q.answer) cls.push("hint");
            if (reveal) {
                if (o === q.answer) cls.push("good");
                else if (last && !last.good && last.pick === i) cls.push("bad");
            }
            return '<button type="button" class="' + cls.join(" ") + '" data-opt="' + i + '"' + (mine ? "" : " disabled") + "><kbd>" + (i + 1) + "</kbd>" + esc(o) + "</button>";
        }).join("") + "</div>";
    }
    function padHTML() {
        const dis = myTurn() ? "" : " disabled";
        return '<div class="pq-pad">' +
            '<span></span><button type="button" data-dir="0,-1" aria-label="Up"' + dis + ">▲</button><span></span>" +
            '<button type="button" data-dir="-1,0" aria-label="Left"' + dis + '>◀</button><button type="button" class="pq-pick" data-act="pick"' + dis + '>✓ Pick</button><button type="button" data-dir="1,0" aria-label="Right"' + dis + ">▶</button>" +
            '<span></span><button type="button" data-dir="0,1" aria-label="Down"' + dis + ">▼</button><span></span>" +
            "</div>";
    }
    function feedbackHTML(q) {
        const last = state.last;
        if (state.phase === "reveal" && last) {
            const who = esc(state.players[last.seat].name);
            if (last.skipped) return '<div class="pq-fb" aria-live="polite">⏭ ' + who + " skipped - no penalty, no point.</div>";
            if (last.timeout) return '<div class="pq-fb bad" aria-live="polite">⏱ Time is up for ' + who + " - it was " + esc(answerText(q)) + ".</div>";
            if (last.good) return '<div class="pq-fb good" aria-live="polite">✔ ' + who + " scores!</div>";
            return '<div class="pq-fb bad" aria-live="polite">✘ Wrong - it was ' + esc(answerText(q)) + ".</div>";
        }
        if (myTurn()) {
            const hint = q.kind === "find" ? "Your turn - tap a cell, or steer with arrows / D-pad and press Enter." : "Your turn - pick an option (keys 1-4).";
            return '<div class="pq-fb" aria-live="polite">' + hint + "</div>";
        }
        const who = esc(state.players[state.turn].name);
        return '<div class="pq-fb" aria-live="polite">' + who + (online ? " is answering…" : " is thinking…") + "</div>";
    }
    function gameHTML() {
        const q = currentQ();
        /* Match info now lives in the HUD; the board is just the arena. */
        let h = '<div class="pq-card pq-prompt"><span class="pq-kind">' + KIND_LABEL[q.kind] + '</span><div class="pq-q">' + esc(q.prompt) + "</div></div>";
        h += tableHTML(q);
        h += legendHTML();
        if (q.kind === "find") {
            h += '<div class="pq-strip"><span class="pq-focus" data-cursor>' + focusHTML() + "</span></div>";
        } else {
            h += optionsHTML(q);
        }
        h += feedbackHTML(q);
        return h;
    }
    function menuHTML() {
        const startable = canStart();
        let h = '<div class="pq-card pq-menu"><h3>Choose a level</h3><p class="pq-sub">Every match is freshly generated and always solvable: unique options, real table targets, equal turns. The coin toss and (in multiplayer) the seats are rolled when the match starts.</p><div class="pq-levels">';
        h += LEVELS.map((L) => '<button type="button" class="pq-level' + (ui.level === L.id ? " sel" : "") + '" data-level="' + L.id + '"' + (startable ? "" : " disabled") + "><b>" + L.id + ". " + L.name + "</b><span>" + L.rounds + " questions · " + L.desc + "</span><span>Bot accuracy " + Math.round(L.bot * 100) + "%</span></button>").join("");
        h += '</div><ul class="pq-facts"><li>🪙 A coin toss decides who answers first.</li><li>' +
            (online ? "🎲 Seats are shuffled at every start - the host is not always Player 1." : "🤖 You face the bot; it answers with level-based accuracy.") +
            "</li><li>♥ " + LIVES + " lives each · wrong or late answers cost one.</li></ul>";
        if (!online && best > 0) h += '<p class="pq-best">Personal best (no cheats): <b>' + best + "</b> correct in one match</p>";
        h += startable
            ? '<div class="pq-row"><button type="button" class="pq-cta" data-act="start">Start match</button><button type="button" class="pq-mini" data-help>How to play</button></div>'
            : '<p class="pq-wait">Waiting for the host to start…</p>';
        return h + "</div>";
    }
    function overHTML() {
        const me = seatOfMe();
        const w = state.winner;
        const winName = w === "draw" ? null : esc(state.players[w].name);
        const title = w === "draw" ? "It is a draw" : w === me ? (online ? "You win! 🎉" : "You beat the bot! 🎉") : online ? winName + " wins" : "The bot wins";
        const sub = state.reason === "lives"
            ? esc(state.players[1 - w].name) + " ran out of lives."
            : "All " + state.total + " questions answered.";
        let h = '<div class="pq-card pq-over pq-center"><h3>' + title + '</h3><p class="pq-sub">' + sub + "</p>";
        if (state.cheated) h += '<span class="pq-badge">cheats used - best score not saved</span>';
        h += '<div class="pq-stats">' + state.players.map((p, i) => {
            const acc = p.answered ? Math.round((p.correct / p.answered) * 100) : 0;
            return '<div class="pq-stat"><b>' + esc(p.name) + (i === me ? " (you)" : "") + "</b><span>" + p.correct + " correct / " + p.answered + " answered · " + acc + "%</span><span>" + p.lives + " lives left</span></div>";
        }).join("") + "</div>";
        if (!online && best > 0) h += '<p class="pq-best">Personal best (no cheats): <b>' + best + "</b> correct</p>";
        h += canStart()
            ? '<div class="pq-row"><button type="button" class="pq-cta" data-act="rematch">Rematch</button><button type="button" class="pq-cta alt" data-act="menu">Change level</button><button type="button" class="pq-mini" data-help>How to play</button></div>'
            : '<p class="pq-wait">Waiting for the host to rematch…</p>';
        return h + "</div>";
    }
    function updateCheats() {
        if (online || !ui.cheats || ui.help || paused) return;
        const playing = Boolean(state && state.phase === "playing");
        const revealOk = Boolean(state && state.phase === "reveal");
        const mine = myTurn();
        const rows = [
            { id: "reveal", t: "Reveal answer", d: "Highlight the correct cell / option for this question.", label: ui.reveal ? "On" : "Off", dis: !mine },
            { id: "fifty", t: "50:50", d: "MCQ: hide two wrong options. Find: highlight the right period.", label: ui.fifty ? "Used" : "Use", dis: !mine || Boolean(ui.fifty) },
            { id: "life", t: "+1 life", d: "Add a life, up to " + MAX_LIVES + ".", label: "Use", dis: !playing || state.players[0].lives >= MAX_LIVES },
            { id: "skip", t: "Skip question", d: "Move on with no penalty and no point.", label: "Use", dis: !mine },
            { id: "blunder", t: "Bot blunder", d: "Force the bot's next answer to be wrong.", label: state && state.botBlunder ? "Armed" : "Use", dis: !(playing || revealOk) || Boolean(state && state.botBlunder) },
            { id: "solve", t: "Auto-solve", d: "Instantly answer the current question correctly.", label: "Use", dis: !mine },
        ];
        cheatBody.innerHTML = rows.map((r) => '<div class="pq-cheat"><div><b>' + r.t + "</b>" + r.d + '</div><button type="button" data-cheat="' + r.id + '"' + (r.dis ? " disabled" : "") + ">" + r.label + "</button></div>").join("");
    }
    function render() {
        if (!state) {
            content.innerHTML = '<div class="pq-card pq-center"><h3>Connecting…</h3><p class="pq-sub">Waiting for the host’s first snapshot.</p></div>';
            syncUI();
            return;
        }
        const qKey = state.seed + ":" + state.idx;
        if (ui.qKey !== qKey) { ui.qKey = qKey; ui.reveal = false; ui.fifty = null; }
        if (state.phase === "menu") content.innerHTML = menuHTML();
        else if (state.phase === "over") content.innerHTML = overHTML();
        else content.innerHTML = gameHTML();
        const q = currentQ();
        padHost.innerHTML = (!ui.help && !ui.cheats && !paused && q && q.kind === "find" && ui.pad) ? padHTML() : "";
        updateCheats();
        syncUI();
        updateCursor(false);
    }
    function setText(sel, text) {
        const el = $(sel);
        if (el) el.textContent = text;
    }
    /* Single source of truth for HUD labels, overlays and clock freezing. */
    function syncUI() {
        const s = state;
        const hudP0 = $('[data-hud="p0"]'), hudP1 = $('[data-hud="p1"]');
        if (s && s.players) {
            const p0 = s.players[0], p1 = s.players[1];
            hudP0.textContent = (online ? (s.hostSeat === 0 ? "P1 " : "P2 ") : "YOU ") + p0.correct + "✓ " + p0.lives + "♥";
            hudP1.textContent = (online ? (s.hostSeat === 1 ? "P1 " : "P2 ") : "BOT ") + p1.correct + "✓ " + p1.lives + "♥";
            hudP0.classList.toggle("on", s.phase === "playing" && s.turn === 0);
            hudP1.classList.toggle("on", s.phase === "playing" && s.turn === 1);
        }
        setText('[data-hud="lv"]', s ? String(s.level) : "—");
        setText('[data-hud="q"]', s && s.phase !== "menu" && s.phase !== "over" ? Math.min(s.idx + 1, s.total) + "/" + s.total : "—");
        setText('[data-hud="turn"]', s && s.phase === "playing"
            ? (s.turn === seatOfMe() ? "YOU" : s.players[s.turn].name)
            : "—");
        const bestChip = $('[data-hud="best"]');
        if (bestChip) { bestChip.textContent = String(best); bestChip.hidden = online; }
        setText('[data-hud="toss"]', s && (s.phase === "playing" || s.phase === "reveal")
            ? "🪙 " + s.players[s.first].name + (online ? " · you are P" + (seatOfMe() + 1) : "")
            : "");
        clockChip.hidden = !s || s.phase !== "playing";
        if (!clockChip.hidden) {
            const remain = Math.max(0, s.deadline - Date.now());
            setText('[data-hud="time"]', Math.ceil(remain / 1000) + "s");
            paintClock(remain);
        }
        if (!s) setStatus("Connecting");
        else if (s.phase === "menu") setStatus(canStart() ? "Pick a level" : "Waiting for host");
        else if (s.phase === "over") setStatus("Match over");
        else if (paused) setStatus("Paused");
        else if (myTurn()) setStatus("Your turn");
        else setStatus(s.players[s.turn].name + (online ? " is answering…" : " is thinking…"));

        cheatsBtn.hidden = online;
        const pbtn = $("[data-pause]");
        pbtn.hidden = online;
        const plabel = pbtn.querySelector(".pq-hlbl");
        if (plabel) plabel.textContent = paused ? "Resume" : "Pause";
        pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pbtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        const padbtn = $("[data-pad-toggle]");
        padbtn.classList.toggle("on", ui.pad);
        const padlabel = padbtn.querySelector(".pq-hlbl");
        if (padlabel) padlabel.textContent = "D-pad " + (ui.pad ? "on" : "off");
        padbtn.setAttribute("aria-label", "D-pad " + (ui.pad ? "on" : "off"));

        helpOv.hidden = !ui.help;
        cheatOv.hidden = online || !ui.cheats || ui.help;
        pauseOv.hidden = online || !paused || ui.help || ui.cheats;
        syncOverlayPause();
    }
    function paintClock(remain) {
        const bar = $('[data-hud="timerbar"]');
        if (!bar) return;
        bar.style.width = Math.max(0, Math.min(100, (remain / TURN_MS) * 100)) + "%";
        bar.classList.toggle("low", remain < 8000);
    }
    function toggleHelp(on) {
        ui.help = typeof on === "boolean" ? on : !ui.help;
        if (ui.help) ui.cheats = false;
        render();
    }
    function toggleCheats(on) {
        if (online) return;
        ui.cheats = typeof on === "boolean" ? on : !ui.cheats;
        if (ui.cheats) ui.help = false;
        render();
    }
    function setPaused(on) {
        if (online || !state) return;
        paused = typeof on === "boolean" ? on : !paused;
        render();
    }
    function restart() {
        if (online) return;
        clearAllTimers();
        paused = false;
        ui.help = false;
        ui.cheats = false;
        ui.qKey = "";
        ui.reveal = false;
        ui.fifty = null;
        const level = state ? state.level : ui.level;
        state = initialState(playerName, "Bot");
        applyAction(startAction(level), 0);
    }

    /* ---------------- state flow (template contract) ---------------- */
    function publish() {
        render();
        // Only the host writes canonical state to Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        syncHostTimers();
    }
    /* Host (or local play) owns the clock, the reveal pause and the bot. */
    function syncHostTimers() {
        clearTimer(TK.timeout);
        clearTimer(TK.bot);
        clearTimer(TK.advance);
        if (online && !room.isHost) return;
        if (!state) return;
        const idx = state.idx;
        if (state.phase === "playing") {
            const remain = Math.max(0, state.deadline - Date.now()) + 400; // latency grace
            later(TK.timeout, remain, () => applyAction({ type: "timeout", idx }, -1));
            if (!online && state.turn === 1) later(TK.bot, 1000 + Math.random() * 1500, botMove);
        } else if (state.phase === "reveal") {
            const delay = state.last && state.last.good ? 1400 : 2000;
            later(TK.advance, delay, () => applyAction({ type: "advance", idx }, -1));
        }
    }
    function botMove() {
        if (online || !state || state.phase !== "playing" || state.turn !== 1) return;
        const q = state.rounds[state.idx];
        const pick = botPick(q, LEVELS[state.level - 1].bot, state.botBlunder);
        applyAction({ type: "answer", idx: state.idx, pick }, 1);
    }
    function applyAction(action, actor) {
        // reduce() validates actor + action; unchanged reference = rejected.
        const next = reduce(state, action, actor, online);
        if (next === state) return;
        state = next;
        publish();
        maybeSaveBest();
    }
    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, seatOfMe());
    }
    function maybeSaveBest() {
        if (online || !state || state.phase !== "over" || state.cheated) return;
        if (ui.savedSeed === state.seed) return;
        ui.savedSeed = state.seed;
        const score = state.players[0].correct;
        if (score > best) {
            best = score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ }
            render();
        }
    }

    /* ---------------- inputs ---------------- */
    function submitCell(sym) {
        const q = currentQ();
        if (!myTurn() || !q || q.kind !== "find") return;
        submitAction({ type: "answer", idx: state.idx, pick: sym, cheat: Boolean(ui.reveal || ui.fifty) });
    }
    function submitOption(i) {
        const q = currentQ();
        if (!myTurn() || !q || q.kind === "find") return;
        if (ui.fifty && ui.fifty.hide && ui.fifty.hide.includes(i)) return;
        submitAction({ type: "answer", idx: state.idx, pick: i, cheat: Boolean(ui.reveal || ui.fifty) });
    }
    function useCheat(id) {
        if (online || !state) return;
        const q = currentQ();
        if (id === "reveal") {
            if (!myTurn()) return;
            ui.reveal = !ui.reveal;
            if (ui.reveal) submitAction({ type: "cheat-mark" });
            else render();
            return;
        }
        if (id === "fifty") {
            if (!myTurn() || ui.fifty || !q) return;
            if (q.kind === "find") {
                ui.fifty = { row: q.row };
            } else {
                const wrong = q.options.map((o, i) => i).filter((i) => q.options[i] !== q.answer);
                ui.fifty = { hide: shuffle(wrong).slice(0, 2) };
            }
            submitAction({ type: "cheat-mark" });
            return;
        }
        if (id === "life") submitAction({ type: "cheat-life" });
        else if (id === "skip") submitAction({ type: "cheat-skip" });
        else if (id === "blunder") submitAction({ type: "cheat-blunder" });
        else if (id === "solve") submitAction({ type: "cheat-solve" });
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { setPaused(); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        if (t.closest("[data-restart]")) { restart(); return; }
        if (t.classList && t.classList.contains("pq-overlay")) {
            const which = t.dataset.ov;
            if (which === "help") toggleHelp(false);
            else if (which === "cheats") toggleCheats(false);
            else if (which === "pause") setPaused(false);
            return;
        }
        if (ui.help || ui.cheats || paused) return;
        const el = t.closest("[data-act],[data-sym],[data-opt],[data-dir],[data-cheat],[data-level]");
        if (!el || el.disabled) return;
        if (el.dataset.cheat) { useCheat(el.dataset.cheat); return; }
        if (el.dataset.level) { if (canStart()) { ui.level = Number(el.dataset.level); render(); } return; }
        if (el.dataset.opt !== undefined) { submitOption(Number(el.dataset.opt)); return; }
        if (el.dataset.sym) { submitCell(el.dataset.sym); return; }
        if (el.dataset.dir) { const d = el.dataset.dir.split(",").map(Number); moveCursor(d[0], d[1]); return; }
        const act = el.dataset.act;
        if (act === "start") { if (canStart()) submitAction(startAction(ui.level)); }
        else if (act === "rematch") { if (canStart() && state) submitAction(startAction(state.level)); }
        else if (act === "menu") { if (canStart()) submitAction({ type: "menu" }); }
        else if (act === "pad-toggle") { ui.pad = !ui.pad; render(); }
        else if (act === "pick") submitCell(ui.cursor);
    }
    function handleOver(event) {
        if (ui.help || ui.cheats || paused) return;
        const t = event.target;
        const c = t && t.closest ? t.closest(".pq-cell") : null;
        if (c && c.dataset.sym && c.dataset.sym !== ui.cursor) {
            ui.cursor = c.dataset.sym;
            updateCursor(false);
        }
    }
    function onKey(e) {
        if (!root.isConnected) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const k = e.key, code = e.code || "";
        const hit = (c, letter) => code === c || k === letter || k === letter.toUpperCase();
        /* HUD shortcut priority: help → cheats → pause → restart → Escape → game actions. */
        if (hit("KeyH", "h")) { e.preventDefault(); toggleHelp(); return; }
        if (hit("KeyC", "c")) { e.preventDefault(); if (!online && !ui.help) toggleCheats(); return; }
        if (hit("KeyP", "p")) { e.preventDefault(); if (!ui.help) setPaused(); return; }
        if (hit("KeyR", "r")) { e.preventDefault(); if (!ui.help && !ui.cheats) restart(); return; }
        if (ui.help || ui.cheats || paused) {
            if (k === "Escape") {
                e.preventDefault();
                if (ui.help) toggleHelp(false);
                else if (ui.cheats) toggleCheats(false);
                else setPaused(false);
            }
            return;
        }
        if (!state) return;
        if (state.phase === "menu" || state.phase === "over") {
            if (!canStart()) return;
            if (state.phase === "menu" && k >= "1" && k <= "3") { e.preventDefault(); ui.level = Number(k); render(); return; }
            if (k === " " || k === "Enter") {
                e.preventDefault();
                submitAction(startAction(state.phase === "over" ? state.level : ui.level));
            }
            return;
        }
        if (!myTurn()) return;
        const q = currentQ();
        if (q.kind === "find") {
            const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (dirs[k]) { e.preventDefault(); moveCursor(dirs[k][0], dirs[k][1]); return; }
            if (k === "Enter" || k === " ") { e.preventDefault(); submitCell(ui.cursor); }
        } else if (k >= "1" && k <= "4") {
            e.preventDefault();
            submitOption(Number(k) - 1);
        }
    }

    /* lightweight HUD clock repaint (no state mutation; frozen with overlays) */
    tickI = setInterval(() => {
        if (!state || state.phase !== "playing" || frozen || paused || ui.help || ui.cheats) return;
        const remain = Math.max(0, state.deadline - Date.now());
        paintClock(remain);
        setText('[data-hud="time"]', Math.ceil(remain / 1000) + "s");
    }, 250);

    root.addEventListener("click", handleClick);
    root.addEventListener("pointerover", handleOver);
    document.addEventListener("keydown", onKey);

    /* ---------------- boot (template contract) ---------------- */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            state = initialState(playerName, guessGuestName());
            publish();
            // guest seat is whatever the shuffled hostSeat is NOT
            room.onAction((action) => applyAction(action, state ? 1 - state.hostSeat : 1));
        } else {
            room.onState((nextState) => {
                state = nextState;
                if (state && state.level) ui.level = state.level;
                render();
            });
        }
    } else {
        state = initialState(playerName, "Bot");
        publish();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerover", handleOver);
            document.removeEventListener("keydown", onKey);
            clearAllTimers();
            clearInterval(tickI);
        },
    };
}

/* exposed for unit tests / manifest tooling (pure, DOM-free) */
export const __test = { E, FAM, LEVELS, mulberry32, shuffle, generateMatch, initialState, reduce, judge, correctPick, botPick, answerText, TURN_MS, LIVES };