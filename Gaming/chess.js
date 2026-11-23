/* ==== GAME: chess.js ==== */
/*
- Template: export META + mount(root, context).
- Setelah mengubah file ini jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "chess",
    name: "Chess",
    category: "board",
    catLabel: "Board",
    desc: "Classic chess with shaped pieces, Elo-rated bot, move analysis and online rooms.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 38.5c0-7 2-11 7-15-1-1-2-2-2-4l-4 2c-1-2 0-4 2-6l6-6 1-4 3 3c7 1 11 7 11 14v16z"/><path d="M11 42.5h26"/></svg>',
    bg: ["#eef2f7", "#c9d4e0"],
};

/* ================= pure engine (shared, no DOM) ================= */
const W = "w", B = "b", FILES = "abcdefgh";
const VAL = { p: 100, n: 305, b: 330, r: 500, q: 920, k: 20000 };
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const MATE = 100000, INF = 1e9;
const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
const opp = (c) => (c === W ? B : W);

function initState() {
    const b = new Array(64).fill(null);
    const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
    for (let c = 0; c < 8; c++) {
        b[c] = "b" + back[c];
        b[8 + c] = "bp";
        b[48 + c] = "wp";
        b[56 + c] = "w" + back[c];
    }
    return {
        b, turn: W,
        cast: { K: true, Q: true, k: true, q: true },
        ep: -1, capW: [], capB: [], last: null,
        moves: [], over: null, eval: 0, half: 0, keys: [], seats: [W, B],
    };
}

function kingSq(b, color) {
    const k = color + "k";
    for (let i = 0; i < 64; i++) if (b[i] === k) return i;
    return -1;
}

function isAttacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7;
    const pr = by === W ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
        const P = by + "p";
        if (c > 0 && b[pr * 8 + c - 1] === P) return true;
        if (c < 7 && b[pr * 8 + c + 1] === P) return true;
    }
    for (let k = 0; k < 8; k++) {
        const rr = r + KN[k][0], cc = c + KN[k][1];
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by + "n") return true;
    }
    for (let k = 0; k < 8; k++) {
        const rr = r + KD[k][0], cc = c + KD[k][1];
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by + "k") return true;
    }
    const slide = (dirs, t1, t2) => {
        for (const d of dirs) {
            let rr = r + d[0], cc = c + d[1];
            while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
                const p = b[rr * 8 + cc];
                if (p) {
                    if (p[0] === by && (p[1] === t1 || p[1] === t2)) return true;
                    break;
                }
                rr += d[0]; cc += d[1];
            }
        }
        return false;
    };
    return slide(DIAG, "b", "q") || slide(ORTH, "r", "q");
}

function pseudoMoves(b, cast, ep, color) {
    const ms = [];
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || p[0] !== color) continue;
        const r = i >> 3, c = i & 7, t = p[1];
        if (t === "p") {
            const d = color === W ? -1 : 1, r1 = r + d;
            if (r1 >= 0 && r1 < 8) {
                const promo = r1 === 0 || r1 === 7 ? "pp" : "";
                if (!b[r1 * 8 + c]) {
                    ms.push({ f: i, t: r1 * 8 + c, flag: promo });
                    const r2 = r + 2 * d;
                    if (r === (color === W ? 6 : 1) && !b[r2 * 8 + c])
                        ms.push({ f: i, t: r2 * 8 + c, flag: "dp" });
                }
                for (const dc of [-1, 1]) {
                    const cc = c + dc;
                    if (cc < 0 || cc > 7) continue;
                    const j = r1 * 8 + cc, q = b[j];
                    if (q && q[0] !== color) ms.push({ f: i, t: j, flag: promo });
                    else if (!q && j === ep) ms.push({ f: i, t: j, flag: "ep" });
                }
            }
        } else if (t === "n" || t === "k") {
            const dirs = t === "n" ? KN : KD;
            for (const d of dirs) {
                const rr = r + d[0], cc = c + d[1];
                if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
                const q = b[rr * 8 + cc];
                if (!q || q[0] !== color) ms.push({ f: i, t: rr * 8 + cc, flag: "" });
            }
            if (t === "k" && i === (color === W ? 60 : 4)) {
                const e = opp(color), R = color + "r";
                const ks = color === W ? cast.K : cast.k;
                const qs = color === W ? cast.Q : cast.q;
                const hR = color === W ? 63 : 7, aR = color === W ? 56 : 0;
                if (ks && b[hR] === R && !b[i + 1] && !b[i + 2] &&
                    !isAttacked(b, i, e) && !isAttacked(b, i + 1, e) && !isAttacked(b, i + 2, e))
                    ms.push({ f: i, t: i + 2, flag: "ck" });
                if (qs && b[aR] === R && !b[i - 1] && !b[i - 2] && !b[i - 3] &&
                    !isAttacked(b, i, e) && !isAttacked(b, i - 1, e) && !isAttacked(b, i - 2, e))
                    ms.push({ f: i, t: i - 2, flag: "cq" });
            }
        } else {
            const dirs = t === "b" ? DIAG : t === "r" ? ORTH : DIAG.concat(ORTH);
            for (const d of dirs) {
                let rr = r + d[0], cc = c + d[1];
                while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
                    const q = b[rr * 8 + cc];
                    if (!q) ms.push({ f: i, t: rr * 8 + cc, flag: "" });
                    else {
                        if (q[0] !== color) ms.push({ f: i, t: rr * 8 + cc, flag: "" });
                        break;
                    }
                    rr += d[0]; cc += d[1];
                }
            }
        }
    }
    return ms;
}

function applyM(st, m) {
    const b = st.b, p = b[m.f], color = p[0];
    let cap = b[m.t];
    b[m.t] = p;
    b[m.f] = null;
    if (m.flag === "pp") b[m.t] = color + "q";
    else if (m.flag === "ep") {
        const cs = m.t + (color === W ? 8 : -8);
        cap = b[cs]; b[cs] = null;
    } else if (m.flag === "ck") { b[m.t - 1] = b[m.t + 1]; b[m.t + 1] = null; }
    else if (m.flag === "cq") { b[m.t + 1] = b[m.t - 2]; b[m.t - 2] = null; }
    const C = st.cast;
    if (p[1] === "k") {
        if (color === W) { C.K = false; C.Q = false; }
        else { C.k = false; C.q = false; }
    }
    if (m.f === 63 || m.t === 63) C.K = false;
    if (m.f === 56 || m.t === 56) C.Q = false;
    if (m.f === 7 || m.t === 7) C.k = false;
    if (m.f === 0 || m.t === 0) C.q = false;
    st.ep = m.flag === "dp" ? (m.f + m.t) / 2 : -1;
    return cap;
}

function legalMoves(b, cast, ep, color) {
    const out = [];
    for (const m of pseudoMoves(b, cast, ep, color)) {
        const s2 = { b: b.slice(), cast: { K: cast.K, Q: cast.Q, k: cast.k, q: cast.q }, ep };
        applyM(s2, m);
        if (!isAttacked(s2.b, kingSq(s2.b, color), opp(color))) out.push(m);
    }
    return out;
}

const inChk = (b, color) => isAttacked(b, kingSq(b, color), opp(color));
const cloneLite = (st) => ({ b: st.b.slice(), cast: { K: st.cast.K, Q: st.cast.Q, k: st.cast.k, q: st.cast.q }, ep: st.ep });
const cloneState = (s) => JSON.parse(JSON.stringify(s));

/* ---------- evaluation ---------- */
function evalW(b) {
    let s = 0, mat = 0, wb = 0, bb = 0;
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (p && p[1] !== "k") mat += VAL[p[1]];
    }
    const end = mat < 2600;
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p) continue;
        const r = i >> 3, c = i & 7, t = p[1], w = p[0] === W;
        const ctr = (3.5 - Math.abs(c - 3.5)) + (3.5 - Math.abs(r - 3.5));
        let v = VAL[t];
        if (t === "p") {
            v += (w ? 6 - r : r - 1) * 6 + (c > 1 && c < 6 ? 4 : 0);
            if (w ? r < 3 : r > 4) v += 12;
        } else if (t === "n") v += ctr * 4 - ((c === 0 || c === 7 || r === 0 || r === 7) ? 8 : 0);
        else if (t === "b") { v += ctr * 2; if (w) wb++; else bb++; }
        else if (t === "r") v += (c === 3 || c === 4 ? 4 : 0) + ((w ? r === 1 : r === 6) ? 14 : 0);
        else if (t === "q") v += ctr;
        else if (t === "k") {
            if (end) v += ctr * 4;
            else v += ((w ? r === 7 : r === 0) ? 10 : 0) - ctr * 3 +
                ((w ? r === 7 : r === 0) && (c === 2 || c === 6) ? 12 : 0);
        }
        s += w ? v : -v;
    }
    if (wb >= 2) s += 28;
    if (bb >= 2) s -= 28;
    return s;
}

/* ---------- search ---------- */
function moveScore(b, m) {
    let s = 0;
    const v = b[m.t];
    if (v) s += 10 * VAL[v[1]] - VAL[b[m.f][1]];
    if (m.flag === "ep") s += 900;
    if (m.flag === "pp") s += 800;
    return s;
}
const orderMoves = (b, ms) => ms.sort((x, y) => moveScore(b, y) - moveScore(b, x));

function qsearch(st, a, beta, ply, color, qd) {
    const chk = inChk(st.b, color);
    const stand = (color === W ? 1 : -1) * evalW(st.b);
    if (!chk) {
        if (stand >= beta) return beta;
        if (stand > a) a = stand;
    }
    if (qd >= 4) return chk ? stand : a;
    let ms = legalMoves(st.b, st.cast, st.ep, color);
    if (!ms.length) return chk ? -MATE + ply : 0;
    if (!chk) {
        ms = ms.filter((m) => st.b[m.t] || m.flag === "ep" || m.flag === "pp");
        if (!ms.length) return a;
    }
    orderMoves(st.b, ms);
    for (const m of ms) {
        const ch = cloneLite(st);
        applyM(ch, m);
        const v = -qsearch(ch, -beta, -a, ply + 1, opp(color), qd + 1);
        if (v >= beta) return beta;
        if (v > a) a = v;
    }
    return a;
}

function negamax(st, depth, a, beta, ply, color, useQ) {
    if (depth <= 0)
        return useQ ? qsearch(st, a, beta, ply, color, 0) : (color === W ? 1 : -1) * evalW(st.b);
    const ms = legalMoves(st.b, st.cast, st.ep, color);
    if (!ms.length) return inChk(st.b, color) ? -MATE + ply : 0;
    orderMoves(st.b, ms);
    for (const m of ms) {
        const ch = cloneLite(st);
        applyM(ch, m);
        const v = -negamax(ch, depth - 1, -beta, -a, ply + 1, opp(color), useQ);
        if (v >= beta) return beta;
        if (v > a) a = v;
    }
    return a;
}

/* Exact-ish score for every root move (full window), sorted best first. */
function analyzeScores(st, depth, ms, useQ) {
    const out = [];
    for (const m of ms) {
        const ch = cloneLite(st);
        applyM(ch, m);
        const v = -negamax(ch, depth - 1, -INF, INF, 1, opp(st.turn), useQ);
        out.push({ m, v });
    }
    out.sort((x, y) => y.v - x.v);
    return out;
}

const ELOS = [
    { elo: 400, depth: 1, q: false, noise: 150, rand: 0.35 },
    { elo: 800, depth: 1, q: false, noise: 70, rand: 0.12 },
    { elo: 1200, depth: 2, q: true, noise: 30, rand: 0.03 },
    { elo: 1600, depth: 2, q: true, noise: 10, rand: 0 },
    { elo: 2000, depth: 3, q: true, noise: 4, rand: 0 },
    { elo: 2400, depth: 3, q: true, noise: 0, rand: 0 },
];

function aiPick(st, cfg) {
    const ms = legalMoves(st.b, st.cast, st.ep, st.turn);
    if (!ms.length) return null;
    if (cfg.rand && Math.random() < cfg.rand) return ms[(Math.random() * ms.length) | 0];
    orderMoves(st.b, ms);
    let best = -INF, pick = ms[0];
    for (const m of ms) {
        const ch = cloneLite(st);
        applyM(ch, m);
        let v = -negamax(ch, cfg.depth - 1, -INF, INF, 1, opp(st.turn), cfg.q);
        if (cfg.noise) v += (Math.random() * 2 - 1) * cfg.noise;
        if (v > best) { best = v; pick = m; }
    }
    return pick;
}

/* ---------- opening book ---------- */
const sqIdx = (n) => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
const mvKey = (s) => sqIdx(s.slice(0, 2)) * 64 + sqIdx(s.slice(2, 4));
const BOOK_N = [
    "e2e4 e7e5 g1f3 b8c6 f1b5",
    "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5",
    "e2e4 e7e5 g1f3 b8c6 d2d4",
    "e2e4 e7e5 g1f3 g8f6",
    "e2e4 e7e5 f2f4",
    "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4",
    "e2e4 c7c5 b1c3",
    "e2e4 e7e6 d2d4 d7d5",
    "e2e4 c7c6 d2d4 d7d5",
    "e2e4 d7d5 e4d5",
    "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6",
    "d2d4 d7d5 c2c4 c7c6",
    "d2d4 d7d5 c2c4 d5c4",
    "d2d4 g8f6 c2c4 e7e6 g1f3 d7d5",
    "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6",
    "d2d4 f7f5",
    "g1f3 d7d5 g2g3",
    "g1f3 g8f6 c2c4",
    "c2c4 e7e5 b1c3",
    "c2c4 g8f6 b1c3",
].map((l) => l.split(" ").map(mvKey));

function isBook(moves, m) {
    const seq = moves.map((x) => x.f * 64 + x.t).concat(m.f * 64 + m.t);
    if (seq.length > 12) return false;
    return BOOK_N.some((l) => l.length >= seq.length && seq.every((v, i) => l[i] === v));
}

/* ---------- move classification ---------- */
function cheapAttacker(b, sq, by) {
    const r = sq >> 3, c = sq & 7;
    let min = Infinity;
    const pr = by === W ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
        const P = by + "p";
        if ((c > 0 && b[pr * 8 + c - 1] === P) || (c < 7 && b[pr * 8 + c + 1] === P)) min = 100;
    }
    for (const d of KN) {
        const rr = r + d[0], cc = c + d[1];
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by + "n") min = Math.min(min, VAL.n);
    }
    for (const d of KD) {
        const rr = r + d[0], cc = c + d[1];
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by + "k") min = Math.min(min, VAL.k);
    }
    const slide = (dirs, t1, t2) => {
        for (const d of dirs) {
            let rr = r + d[0], cc = c + d[1];
            while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
                const p = b[rr * 8 + cc];
                if (p) {
                    if (p[0] === by && (p[1] === t1 || p[1] === t2)) min = Math.min(min, VAL[p[1]]);
                    break;
                }
                rr += d[0]; cc += d[1];
            }
        }
    };
    slide(DIAG, "b", "q");
    slide(ORTH, "r", "q");
    return min;
}

function isSac(st, m) {
    const p = st.b[m.f];
    if (!p || VAL[p[1]] < 300 || m.flag === "ck" || m.flag === "cq") return false;
    const ch = cloneLite(st);
    const cap = applyM(ch, m);
    if (cap && VAL[cap[1]] >= VAL[p[1]]) return false;
    if (!isAttacked(ch.b, m.t, opp(p[0]))) return false;
    const defended = isAttacked(ch.b, m.t, p[0]);
    return !defended || cheapAttacker(ch.b, m.t, opp(p[0])) < VAL[p[1]];
}

function classifyMove(st, m, legal, scores) {
    const mover = st.turn;
    const hit = scores.find((s) => s.m.f === m.f && s.m.t === m.t);
    const played = hit ? hit.v : scores[0].v;
    const best = scores[0].v;
    const second = scores.length > 1 ? scores[1].v : -INF;
    const cpl = Math.max(0, best - played);
    const ev = mover === W ? played : -played;
    let cls;
    if (isBook(st.moves, m)) cls = "book";
    else if (cpl <= 25 && played >= -40 && isSac(st, m)) cls = "brilliant";
    else if (cpl <= 15 && (legal.length === 1 ||
        (second <= best - 160 && scores.filter((s) => s.v >= best - 30).length === 1))) cls = "great";
    else if (cpl <= 8) cls = "best";
    else if ((best >= 280 && cpl >= 200 && played >= -60) ||
        (best > MATE - 200 && played < MATE - 200 && played > -(MATE - 200))) cls = "miss";
    else if (cpl >= 300) cls = "blunder";
    else if (cpl >= 130) cls = "mistake";
    else if (cpl >= 55) cls = "inaccuracy";
    else if (cpl <= 25) cls = "excellent";
    else cls = "good";
    return { cls, ev };
}

/* ---------- SAN ---------- */
function sanDis(m, p, legal, b) {
    if (p[1] === "p" || p[1] === "k") return "";
    const riv = legal.filter((x) => x.t === m.t && x.f !== m.f && b[x.f] === p);
    if (!riv.length) return "";
    if (!riv.some((x) => (x.f & 7) === (m.f & 7))) return FILES[m.f & 7];
    if (!riv.some((x) => (x.f >> 3) === (m.f >> 3))) return String(8 - (m.f >> 3));
    return sqName(m.f);
}

function notate(m, p, cap, chk, mate, dis) {
    let n;
    if (m.flag === "ck") n = "O-O";
    else if (m.flag === "cq") n = "O-O-O";
    else if (p[1] === "p") {
        n = cap ? FILES[m.f & 7] + "x" + sqName(m.t) : sqName(m.t);
        if (m.flag === "pp") n += "=Q";
    } else n = p[1].toUpperCase() + dis + (cap ? "x" : "") + sqName(m.t);
    return n + (mate ? "#" : chk ? "+" : "");
}

/* ---------- draw helpers ---------- */
function insufficient(b) {
    const minor = [];
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || p[1] === "k") continue;
        if (p[1] === "b" || p[1] === "n") minor.push({ t: p[1], sq: ((i >> 3) + (i & 7)) & 1 });
        else return false;
    }
    if (minor.length <= 1) return true;
    return minor.every((x) => x.t === "b") && minor.every((x) => x.sq === minor[0].sq);
}

const posKey = (st) =>
    st.b.map((x) => x || ".").join("") + "|" + st.turn + "|" +
    (st.cast.K ? "K" : "") + (st.cast.Q ? "Q" : "") + (st.cast.k ? "k" : "") + (st.cast.q ? "q" : "") +
    "|" + st.ep;

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    const ANALYZE_DEPTH = 2;
    const CLS = {
        brilliant: { sym: "!!", c: "#0e9f9f", label: "Brilliant" },
        great: { sym: "!", c: "#3b82f6", label: "Great" },
        best: { sym: "\u2605", c: "#22c55e", label: "Best" },
        excellent: { sym: "\u2713", c: "#65a30d", label: "Excellent" },
        good: { sym: "\u2713", c: "#9aa3af", label: "Good" },
        book: { sym: "\u25a3", c: "#a78bfa", label: "Book" },
        inaccuracy: { sym: "?!", c: "#d4a017", label: "Inaccuracy" },
        mistake: { sym: "?", c: "#f97316", label: "Mistake" },
        miss: { sym: "\u2715", c: "#fb7185", label: "Miss" },
        blunder: { sym: "??", c: "#ef4444", label: "Blunder" },
    };

    let oppMode = "ai", eloIdx = 2;
    let U = [], LM = [], sel = -1, cursor = 52, kbd = false, flip = false;
    let hint = null, armed = null, cheatsOpen = false, aiFrozen = false;
    let aiTimer = 0, aiThinking = false, destroyed = false, seatKey = "";
    const unsubs = [];

    /* ---------- markup ---------- */
    root.innerHTML = `
<style>
.cx-app{display:flex;flex-direction:column;gap:12px;color:#20242c;outline:none}
.cx-app *{box-sizing:border-box}
.cx-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cx-chip{display:inline-flex;align-items:center;gap:6px;background:#f4f5f7;border:1px solid #e5e7ec;border-radius:999px;padding:4px 11px;font-size:12px;color:#4b5261;white-space:nowrap}
.cx-chip b{color:#20242c;font-weight:600}
.cx-sp{flex:1}
.cx-btn,.cx-select{appearance:none;background:#fff;border:1px solid #d9dde4;border-radius:8px;padding:6px 11px;font-size:12.5px;font-family:inherit;color:#20242c;cursor:pointer;transition:background .12s,border-color .12s}
.cx-btn:hover,.cx-select:hover{background:#f4f5f7}
.cx-btn:disabled{opacity:.45;cursor:default}
.cx-btn.cx-primary{background:#20242c;border-color:#20242c;color:#fff}
.cx-btn.cx-primary:hover{background:#3a4150}
.cx-cheatbtn{color:#6d5bd0;border-style:dashed}
.cx-panel{background:#fff;border:1px solid #e5e7ec;border-radius:14px;padding:14px}
.cx-main{display:flex;gap:14px;justify-content:center;align-items:stretch}
.cx-eval{position:relative;width:8px;border-radius:99px;background:#3a414d;overflow:hidden;flex:none}
.cx-eval i{position:absolute;left:0;right:0;bottom:0;height:50%;background:#f6f7f9;transition:height .35s}
.cx-bwrap{position:relative;width:min(520px,100%,calc(100vw - 90px));flex:none}
.cx-bwrap svg{display:block;width:100%;height:auto;border-radius:10px;border:1px solid #e5e7ec;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.cx-sq-l{fill:#eef0f3}
.cx-sq-d{fill:#aeb9c4}
.cx-co{fill:#8b93a3;font-size:12px;font-family:inherit;text-anchor:middle}
.cx-app [data-i]{cursor:pointer}
.cx-app g[data-i]:hover{opacity:.88}
.cx-last{fill:#5b5bd6;opacity:.16}
.cx-chk{fill:#e5484d;opacity:.32}
.cx-sel{fill:#5b5bd6;opacity:.28}
.cx-dot{fill:#5b5bd6;opacity:.4}
.cx-ring{fill:none;stroke:#5b5bd6;stroke-width:4;opacity:.75}
.cx-cursor{fill:none;stroke:#20242c;stroke-width:2;stroke-dasharray:5 4}
.cx-hint{fill:none;stroke:#0e9f9f;stroke-width:3.5}
.cx-side{width:196px;display:flex;flex-direction:column;gap:8px;min-width:0}
.cx-tray{display:flex;flex-wrap:wrap;align-items:center;gap:2px;min-height:20px;font-size:11px;color:#8b93a3}
.cx-tray .cx-adv{margin-left:4px;font-weight:600;color:#4b5261}
.cx-dotc{width:9px;height:9px;border-radius:50%;flex:none;margin-right:4px;border:1px solid #39404d}
.cx-moves{flex:1;min-height:140px;max-height:352px;overflow-y:auto;background:#fafbfc;border:1px solid #e5e7ec;border-radius:10px;padding:6px 9px}
.cx-mr{display:grid;grid-template-columns:24px 1fr 1fr;gap:4px;font-size:12.5px;color:#2c313b;padding:2px 0}
.cx-mr>span:first-child{color:#9aa1af}
.cx-mv{white-space:nowrap}
.cx-badge{font-style:normal;font-weight:700;font-size:10.5px;margin-left:3px}
.cx-empty{color:#9aa1af;font-size:12px;padding:2px 0}
.cx-lastcls{font-size:12px;color:#4b5261;display:flex;align-items:center;gap:6px;min-height:18px}
.cx-lastcls i{width:8px;height:8px;border-radius:50%;flex:none;font-style:normal}
.cx-over{position:absolute;inset:0;display:grid;place-items:center;background:rgba(250,251,252,.78);backdrop-filter:blur(3px);border-radius:10px;z-index:3}
.cx-card{background:#fff;border:1px solid #e5e7ec;border-radius:12px;padding:20px 24px;text-align:center;box-shadow:0 10px 30px rgba(20,24,32,.12)}
.cx-card h3{margin:0 0 4px;font-size:19px}
.cx-card p{margin:0 0 14px;font-size:13px;color:#6b7280}
.cx-row{display:flex;gap:8px;justify-content:center}
.cx-cheats{position:absolute;top:10px;right:10px;width:200px;background:#fff;border:1px solid #e5e7ec;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 30px rgba(20,24,32,.14);z-index:4}
.cx-cheats-h{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6d5bd0;margin-bottom:2px}
.cx-x{background:none;border:none;font-size:16px;cursor:pointer;color:#9aa1af;line-height:1;padding:0 2px}
.cx-cheats .cx-btn{width:100%;text-align:left}
.cx-cheats .cx-btn.on{border-color:#6d5bd0;color:#6d5bd0}
@media (max-width:820px){
.cx-main{flex-wrap:wrap}
.cx-side{width:100%;flex-direction:column}
.cx-moves{max-height:170px;min-height:90px}
.cx-bwrap{width:min(520px,calc(100vw - 76px))}
}
</style>
<div class="game-app cx-app">
  <div class="game-intro">
    <div><h2>Chess</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="cx-bar">
    <span class="cx-chip" data-you></span>
    <span class="cx-chip">Eval <b data-evalnum>0.0</b></span>
    <span class="cx-sp"></span>
    <select class="cx-select" data-elo title="Bot strength"></select>
    <button class="cx-btn" type="button" data-act="mode" title="Opponent type"></button>
    <button class="cx-btn" type="button" data-act="flip" title="Flip board (F)">Flip</button>
    <button class="cx-btn" type="button" data-act="undo" title="Undo (U)">Undo</button>
    <button class="cx-btn cx-cheatbtn" type="button" data-act="cheat" title="Cheats (C)">Cheats</button>
    <button class="cx-btn" type="button" data-act="new" title="New game (N)">New</button>
  </div>
  <section class="game-panel cx-panel" data-board>
    <div class="cx-main">
      <div class="cx-eval" title="Engine evaluation"><i data-eval></i></div>
      <div class="cx-bwrap">
        <svg data-svg viewBox="0 0 528 528" role="img" aria-label="Chess board">
          <g data-g="sq"></g>
          <g data-g="mk" pointer-events="none"></g>
          <g data-g="pc"></g>
          <g data-g="co" pointer-events="none"></g>
        </svg>
        <div class="cx-cheats" data-cheats hidden>
          <div class="cx-cheats-h"><span>Cheats</span><button class="cx-x" type="button" data-cheat="close" title="Close">\u00d7</button></div>
          <button class="cx-btn" type="button" data-cheat="hint" title="H">Best move hint</button>
          <button class="cx-btn" type="button" data-cheat="undo">Undo move</button>
          <button class="cx-btn" type="button" data-cheat="skip">Skip opponent turn</button>
          <button class="cx-btn" type="button" data-cheat="remove">Remove enemy piece</button>
          <button class="cx-btn" type="button" data-cheat="promote">Promote a pawn</button>
          <button class="cx-btn" type="button" data-cheat="freeze">Freeze bot: off</button>
        </div>
        <div class="cx-over" data-over hidden>
          <div class="cx-card">
            <h3 data-ovttl></h3>
            <p data-ovwhy></p>
            <div class="cx-row">
              <button class="cx-btn cx-primary" type="button" data-act="new">Play again</button>
              <button class="cx-btn" type="button" data-exit>Exit</button>
            </div>
          </div>
        </div>
      </div>
      <aside class="cx-side">
        <div class="cx-tray" data-trayw></div>
        <div class="cx-moves" data-moves></div>
        <div class="cx-tray" data-trayb></div>
        <div class="cx-lastcls" data-last></div>
      </aside>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const gSq = $('[data-g="sq"]'), gMk = $('[data-g="mk"]'), gPc = $('[data-g="pc"]'), gCo = $('[data-g="co"]');
    const elStatus = $("[data-status]"), elYou = $("[data-you]"), elEvalNum = $("[data-evalnum]"), elEval = $("[data-eval]");
    const elMoves = $("[data-moves]"), elTrayW = $("[data-trayw]"), elTrayB = $("[data-trayb]"), elLast = $("[data-last]");
    const elOver = $("[data-over]"), elOvTtl = $("[data-ovttl]"), elOvWhy = $("[data-ovwhy]");
    const elCheats = $("[data-cheats]"), elFreeze = $('[data-cheat="freeze"]');
    const btnMode = $('[data-act="mode"]'), btnUndo = $('[data-act="undo"]'), btnCheat = $('[data-act="cheat"]');
    const selElo = $("[data-elo]"), svg = $("[data-svg]");

    selElo.innerHTML = ELOS.map((e, i) => '<option value="' + i + '">Bot ' + e.elo + "</option>").join("");
    selElo.value = String(eloIdx);
    root.tabIndex = 0;

    /* ---------- geometry / pieces ---------- */
    const M = 24, SQ = 60;
    const dxy = (i) => { const d = flip ? 63 - i : i; return [M + (d & 7) * SQ, M + (d >> 3) * SQ]; };
    const ctr = (i) => { const [x, y] = dxy(i); return [x + SQ / 2, y + SQ / 2]; };

    function buildStatic() {
        let sqs = "", cos = "";
        for (let dr = 0; dr < 8; dr++) {
            for (let dc = 0; dc < 8; dc++) {
                const i = flip ? 63 - (dr * 8 + dc) : dr * 8 + dc;
                const dark = (((i >> 3) + (i & 7)) & 1) === 1;
                sqs += '<rect x="' + (M + dc * SQ) + '" y="' + (M + dr * SQ) + '" width="' + SQ + '" height="' + SQ +
                    '" class="' + (dark ? "cx-sq-d" : "cx-sq-l") + '" data-i="' + i + '"/>';
            }
            const ri = flip ? 63 - dr * 8 : dr * 8;
            cos += '<text x="' + (M - 11) + '" y="' + (M + dr * SQ + SQ / 2 + 4) + '" class="cx-co">' + (8 - (ri >> 3)) + "</text>";
        }
        for (let dc = 0; dc < 8; dc++) {
            const fi = flip ? 63 - dc : dc;
            cos += '<text x="' + (M + dc * SQ + SQ / 2) + '" y="' + (M + 8 * SQ + 17) + '" class="cx-co">' + FILES[fi & 7] + "</text>";
        }
        gSq.innerHTML = sqs;
        gCo.innerHTML = cos;
    }

    function shapeParts(t, fill, strk, det) {
        const base = '<rect x="11" y="38.6" width="26" height="4.2" rx="1.6"/>';
        let s = '<g fill="' + fill + '" stroke="' + strk + '" stroke-width="1.6" stroke-linejoin="round">';
        if (t === "p")
            s += '<circle cx="24" cy="13.5" r="6"/><path d="M20 20.5h8l3.2 12H16.8z"/><path d="M14.5 32.5h19l2 6h-23z"/>';
        else if (t === "r")
            s += '<path d="M13 10h5v4h4v-4h4v4h4v-4h5v8l-3 3v12l3 3v2.5H13v-2.5l3-3V21l-3-3z"/>';
        else if (t === "n")
            s += '<path d="M13 38.5c0-7 2-11 7-15-1-1-2-2-2-4l-4 2c-1-2 0-4 2-6l6-6 1-4 3 3c7 1 11 7 11 14v16z"/>' +
                '<circle cx="19.6" cy="14.6" r="1.4" fill="' + det + '" stroke="none"/>';
        else if (t === "b")
            s += '<circle cx="24" cy="7.5" r="2.4"/><path d="M24 11.5c5.2 4 8.2 8.2 8.2 13 0 4.6-3.4 7.6-8.2 7.6s-8.2-3-8.2-7.6c0-4.8 3-9 8.2-13z"/>' +
                '<path d="M24 15.5l4.2 6" fill="none" stroke="' + det + '" stroke-width="2" stroke-linecap="round"/>' +
                '<path d="M16.5 32.5h15l1.8 6H14.7z"/>';
        else if (t === "q")
            s += '<path d="M10 17l5 13h18l5-13-7.5 6.5L24 12l-6.5 11.5z"/>' +
                '<circle cx="10" cy="14.4" r="2.3"/><circle cx="24" cy="9.4" r="2.3"/><circle cx="38" cy="14.4" r="2.3"/>' +
                '<path d="M15 30h18l2.2 8.5H12.8z"/>';
        else if (t === "k")
            s += '<path d="M22.4 4.5h3.2v4h4v3.2h-4v4h-3.2v-4h-4V8.5h4z"/>' +
                '<path d="M24 15.5c8 0 13 4.8 13 10.6 0 5.6-5 8.9-13 8.9s-13-3.3-13-8.9c0-5.8 5-10.6 13-10.6z"/>' +
                '<path d="M15 33.5h18l2.4 5H12.6z"/>';
        return s + base + "</g>";
    }

    function pieceSVG(p, i) {
        const white = p[0] === W;
        const fill = white ? "#fbfbf9" : "#39404d";
        const strk = white ? "#39404d" : "#e7e9ee";
        const [x, y] = dxy(i);
        return '<g data-i="' + i + '" transform="translate(' + (x + 4) + "," + (y + 2) + ') scale(1.0833)">' +
            shapeParts(p[1], fill, strk, strk) + "</g>";
    }

    function mini(p) {
        const white = p[0] === W;
        return '<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">' +
            shapeParts(p[1], white ? "#fbfbf9" : "#39404d", white ? "#39404d" : "#e7e9ee", white ? "#39404d" : "#e7e9ee") + "</svg>";
    }

    /* ---------- small helpers ---------- */
    const colorName = (c) => (c === W ? "White" : "Black");
    const myColor = () => {
        if (!state) return W;
        if (online) return state.seats[playerIndex] || W;
        return oppMode === "ai" ? state.seats[0] : state.turn;
    };
    const playersCount = () => {
        const p = roomData?.players;
        if (Array.isArray(p)) return p.length;
        if (p && typeof p === "object") return Object.keys(p).length;
        return 2;
    };
    const refreshLM = () => { LM = state ? legalMoves(state.b, state.cast, state.ep, state.turn) : []; };
    const snapshot = () => { U.push(cloneState(state)); };
    const canPlayNow = () =>
        Boolean(state) && !state.over && !aiThinking &&
        (!online || playersCount() >= 2) &&
        (online ? state.turn === myColor() : oppMode !== "ai" || state.turn === state.seats[0]);

    function overTexts() {
        const o = state.over;
        if (!o) return ["", ""];
        if (o.kind !== "mate") {
            const why = { stale: "Stalemate", material: "Insufficient material", fifty: "50-move rule", repeat: "Threefold repetition" }[o.kind] || "Draw";
            return ["Draw", why];
        }
        let ttl;
        if (online) ttl = o.win === myColor() ? "You win" : "You lose";
        else if (oppMode === "ai") ttl = o.win === state.seats[0] ? "You win" : "Bot wins";
        else ttl = colorName(o.win) + " wins";
        return [ttl, "Checkmate"];
    }

    function statusText() {
        if (!state) return "Waiting for host...";
        if (state.over) { const [t, w] = overTexts(); return t + " - " + w; }
        if (online && playersCount() < 2) return "Waiting for opponent...";
        if (armed) return armed === "remove" ? "Cheat: pick an enemy piece" : "Cheat: pick your pawn";
        if (aiThinking) return "Bot thinking...";
        const t = colorName(state.turn);
        return inChk(state.b, state.turn) ? t + " in check" : t + " to move";
    }

    function syncOrientation() {
        if (!state) return;
        const sk = state.seats.join("");
        if (sk !== seatKey) {
            seatKey = sk;
            flip = (online ? state.seats[playerIndex] : oppMode === "ai" ? state.seats[0] : W) === B;
            buildStatic();
        }
    }

    /* ---------- render ---------- */
    const rectMk = (i, cls) => {
        const [x, y] = dxy(i);
        return '<rect x="' + x + '" y="' + y + '" width="' + SQ + '" height="' + SQ + '" class="' + cls + '"/>';
    };
    const dotMk = (i) => { const [x, y] = ctr(i); return '<circle cx="' + x + '" cy="' + y + '" r="9" class="cx-dot"/>'; };
    const ringMk = (i) => { const [x, y] = ctr(i); return '<circle cx="' + x + '" cy="' + y + '" r="26" class="cx-ring"/>'; };

    function trayHTML(list, dotFill, adv) {
        let h = '<span class="cx-dotc" style="background:' + dotFill + '"></span>';
        h += list.length
            ? list.slice().sort((a, b) => VAL[b[1]] - VAL[a[1]]).map(mini).join("")
            : '<span>captured: none</span>';
        if (adv > 0) h += '<span class="cx-adv">+' + adv + "</span>";
        return h;
    }

    function mvCell(x) {
        if (!x) return "<span></span>";
        const c = CLS[x.cls];
        return '<span class="cx-mv">' + x.san +
            (c ? '<i class="cx-badge" style="color:' + c.c + '" title="' + c.label + '">' + c.sym + "</i>" : "") + "</span>";
    }

    function render() {
        if (destroyed) return;
        elStatus.textContent = statusText();
        btnMode.textContent = oppMode === "ai" ? "vs Bot" : "2 Players";
        btnMode.hidden = online;
        selElo.hidden = online || oppMode !== "ai";
        btnCheat.hidden = online;
        btnUndo.hidden = online;
        btnUndo.disabled = !U.length;
        elCheats.hidden = online || !cheatsOpen;
        elFreeze.textContent = "Freeze bot: " + (aiFrozen ? "on" : "off");
        elFreeze.classList.toggle("on", aiFrozen);
        elFreeze.hidden = oppMode !== "ai";

        if (!state) {
            gMk.innerHTML = ""; gPc.innerHTML = "";
            elMoves.innerHTML = '<div class="cx-empty">No moves yet</div>';
            elOver.hidden = true;
            return;
        }

        elYou.hidden = !online && oppMode !== "ai";
        elYou.innerHTML = "You: <b>" + colorName(myColor()) + "</b>";

        let mk = "";
        if (state.last) mk += rectMk(state.last.f, "cx-last") + rectMk(state.last.t, "cx-last");
        if (inChk(state.b, state.turn)) mk += rectMk(kingSq(state.b, state.turn), "cx-chk");
        if (sel >= 0) mk += rectMk(sel, "cx-sel");
        for (const m of LM)
            if (m.f === sel) mk += state.b[m.t] || m.flag === "ep" ? ringMk(m.t) : dotMk(m.t);
        if (hint) mk += rectMk(hint.f, "cx-hint") + rectMk(hint.t, "cx-hint");
        if (kbd) mk += rectMk(cursor, "cx-cursor");
        gMk.innerHTML = mk;

        let pc = "";
        for (let i = 0; i < 64; i++) if (state.b[i]) pc += pieceSVG(state.b[i], i);
        gPc.innerHTML = pc;

        const ev = state.eval || 0;
        const clamped = Math.max(-1500, Math.min(1500, ev));
        let pct = 50 + 50 * (2 / (1 + Math.exp(-clamped / 350)) - 1);
        if (state.over && state.over.kind === "mate") pct = state.over.win === W ? 100 : 0;
        pct = Math.max(2, Math.min(98, pct));
        elEval.style.height = pct + "%";
        elEval.style.bottom = flip ? "auto" : "0";
        elEval.style.top = flip ? "0" : "auto";
        elEvalNum.textContent = Math.abs(ev) > MATE - 500
            ? (ev > 0 ? "+M" : "-M")
            : (ev >= 0 ? "+" : "") + (ev / 100).toFixed(1);

        const sumV = (l) => l.reduce((a, p) => a + VAL[p[1]], 0);
        const diff = Math.round((sumV(state.capW) - sumV(state.capB)) / 100);
        elTrayW.innerHTML = trayHTML(state.capW, "#fbfbf9", Math.max(0, diff));
        elTrayB.innerHTML = trayHTML(state.capB, "#39404d", Math.max(0, -diff));

        let h = "";
        for (let i = 0; i < state.moves.length; i += 2)
            h += '<div class="cx-mr"><span>' + (i / 2 + 1) + ".</span>" +
                mvCell(state.moves[i]) + mvCell(state.moves[i + 1]) + "</div>";
        elMoves.innerHTML = h || '<div class="cx-empty">No moves yet</div>';
        elMoves.scrollTop = elMoves.scrollHeight;

        const lastMv = state.moves[state.moves.length - 1];
        if (lastMv && CLS[lastMv.cls]) {
            const c = CLS[lastMv.cls];
            elLast.innerHTML = '<i style="background:' + c.c + '"></i><span>' +
                Math.ceil(state.moves.length / 2) + (state.moves.length % 2 ? ". " : "... ") +
                lastMv.san + ' &middot; <b style="color:' + c.c + '">' + c.label + "</b></span>";
        } else elLast.innerHTML = "";

        if (state.over) {
            const [t, w] = overTexts();
            elOvTtl.textContent = t;
            elOvWhy.textContent = w;
            elOver.hidden = false;
        } else elOver.hidden = true;
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------- game flow ---------- */
    function recomputeOver() {
        state.over = null;
        if (!LM.length)
            state.over = inChk(state.b, state.turn)
                ? { kind: "mate", win: opp(state.turn) }
                : { kind: "stale", win: null };
        else if (insufficient(state.b)) state.over = { kind: "material", win: null };
        else if (state.half >= 100) state.over = { kind: "fifty", win: null };
        else {
            const k = state.keys[state.keys.length - 1];
            let n = 0;
            for (const q of state.keys) if (q === k) n++;
            if (n >= 3) state.over = { kind: "repeat", win: null };
        }
    }

    function doMove(m) {
        if (!state || state.over) return;
        const mover = state.turn, p = state.b[m.f];
        const legal = LM;
        const scores = analyzeScores(state, ANALYZE_DEPTH, legal, true);
        const { cls, ev } = classifyMove(state, m, legal, scores);
        const dis = sanDis(m, p, legal, state.b);
        if (!online) snapshot();
        const cap = applyM(state, m);
        if (cap) (mover === W ? state.capW : state.capB).push(cap);
        state.last = { f: m.f, t: m.t };
        state.half = cap || p[1] === "p" ? 0 : state.half + 1;
        state.turn = opp(mover);
        refreshLM();
        const chk = inChk(state.b, state.turn);
        const mate = !LM.length && chk;
        state.moves.push({ f: m.f, t: m.t, san: notate(m, p, cap, chk, mate, dis), cls });
        state.eval = ev;
        state.keys.push(posKey(state));
        recomputeOver();
        sel = -1; hint = null; armed = null;
        publish();
        maybeAI();
    }

    function maybeAI() {
        if (destroyed || online || oppMode !== "ai" || !state || state.over || aiFrozen) return;
        if (state.turn === state.seats[1]) scheduleAI();
    }

    function scheduleAI() {
        clearTimeout(aiTimer);
        aiThinking = true;
        render();
        aiTimer = setTimeout(() => {
            aiTimer = 0;
            if (destroyed || !state || state.over || online || oppMode !== "ai" ||
                aiFrozen || state.turn !== state.seats[1]) {
                aiThinking = false;
                render();
                return;
            }
            const m = aiPick(state, ELOS[eloIdx]);
            aiThinking = false;
            if (m) doMove(m);
            else render();
        }, 420);
    }

    function newGame() {
        clearTimeout(aiTimer);
        aiTimer = 0;
        aiThinking = false;
        state = initState();
        const shuffled = Math.random() < 0.5 ? [W, B] : [B, W];
        state.seats = online || oppMode === "ai" ? shuffled : [W, B];
        state.keys = [posKey(state)];
        U = []; sel = -1; hint = null; armed = null; kbd = false;
        seatKey = "";
        syncOrientation();
        refreshLM();
        publish();
        maybeAI();
    }

    function undo() {
        if (online || !U.length || !state) return;
        clearTimeout(aiTimer);
        aiTimer = 0;
        aiThinking = false;
        let s = U.pop();
        if (oppMode === "ai") while (s.turn !== state.seats[0] && U.length) s = U.pop();
        state = s;
        sel = -1; hint = null; armed = null;
        refreshLM();
        publish();
        maybeAI();
    }

    function applyAction(action, actor) {
        if (!action || typeof action !== "object") return;
        if (action.type === "new") {
            if (online && !room.isHost) return;
            newGame();
            return;
        }
        if (action.type !== "move") return;
        if (!state || state.over) return;
        if (online) {
            if (!room.isHost || playersCount() < 2) return;
            if (state.seats[actor] !== state.turn) return;
        } else if (oppMode === "ai" && state.turn !== state.seats[0]) return;
        const f = action.f | 0, t = action.t | 0;
        const m = LM.find((x) => x.f === f && x.t === t);
        if (m) doMove(m);
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- cheats (local only) ---------- */
    function cheatHint() {
        if (!state || state.over || !LM.length) return;
        const sc = analyzeScores(state, 3, LM, true);
        hint = { f: sc[0].m.f, t: sc[0].m.t };
        render();
    }

    function cheatSkip() {
        if (!state || state.over) return;
        snapshot();
        clearTimeout(aiTimer);
        aiTimer = 0;
        aiThinking = false;
        state.turn = opp(state.turn);
        state.ep = -1;
        state.keys.push(posKey(state));
        refreshLM();
        recomputeOver();
        publish();
        maybeAI();
    }

    function targetCheat(i) {
        const p = state.b[i];
        if (armed === "remove" && p && p[0] !== state.turn && p[1] !== "k") {
            snapshot();
            state.b[i] = null;
        } else if (armed === "promote" && p && p[0] === state.turn && p[1] === "p") {
            snapshot();
            state.b[i] = p[0] + "q";
        } else return false;
        state.keys.push(posKey(state));
        armed = null;
        refreshLM();
        recomputeOver();
        publish();
        return true;
    }

    function handleCheat(kind) {
        if (online || !state) return;
        if (kind === "close") { cheatsOpen = false; render(); return; }
        if (kind === "hint") { cheatsOpen = false; cheatHint(); return; }
        if (kind === "undo") { cheatsOpen = false; undo(); return; }
        if (kind === "skip") { cheatsOpen = false; cheatSkip(); return; }
        if (kind === "remove" || kind === "promote") {
            if (state.over) return;
            armed = kind;
            cheatsOpen = false;
            render();
            return;
        }
        if (kind === "freeze") {
            aiFrozen = !aiFrozen;
            if (aiFrozen) {
                clearTimeout(aiTimer);
                aiTimer = 0;
                aiThinking = false;
            } else maybeAI();
            render();
        }
    }

    /* ---------- input ---------- */
    function onSq(i) {
        if (!state || state.over) return;
        if (armed) {
            if (!targetCheat(i)) { armed = null; render(); }
            return;
        }
        if (!canPlayNow()) return;
        if (sel >= 0) {
            const m = LM.find((x) => x.f === sel && x.t === i);
            if (m) { submitAction({ type: "move", f: m.f, t: m.t }); return; }
        }
        const p = state.b[i];
        sel = p && p[0] === state.turn ? (sel === i ? -1 : i) : -1;
        render();
    }

    function handleClick(event) {
        const ex = event.target.closest("[data-exit]");
        if (ex) { onExit(); return; }
        const ch = event.target.closest("[data-cheat]");
        if (ch) { handleCheat(ch.dataset.cheat); return; }
        const btn = event.target.closest("[data-act]");
        if (btn) {
            const a = btn.dataset.act;
            if (a === "new") submitAction({ type: "new" });
            else if (a === "undo") undo();
            else if (a === "flip") { flip = !flip; buildStatic(); render(); }
            else if (a === "cheat" && !online) { cheatsOpen = !cheatsOpen; render(); }
            else if (a === "mode" && !online) {
                oppMode = oppMode === "ai" ? "2p" : "ai";
                aiFrozen = false;
                newGame();
            }
            return;
        }
        const sq = event.target.closest("[data-i]");
        if (sq) {
            kbd = false;
            onSq(parseInt(sq.dataset.i, 10));
            root.focus({ preventScroll: true });
        }
    }

    function handleChange(event) {
        if (event.target === selElo) {
            eloIdx = Math.max(0, Math.min(ELOS.length - 1, parseInt(selElo.value, 10) || 0));
            render();
        }
    }

    function handleKey(event) {
        const tag = event.target.tagName;
        if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
        const k = event.key;
        if ((k === "Enter" || k === " ") && tag === "BUTTON") return;
        let used = true;
        if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
            let d = flip ? 63 - cursor : cursor;
            let r = d >> 3, c = d & 7;
            if (k === "ArrowUp") r = Math.max(0, r - 1);
            else if (k === "ArrowDown") r = Math.min(7, r + 1);
            else if (k === "ArrowLeft") c = Math.max(0, c - 1);
            else c = Math.min(7, c + 1);
            d = r * 8 + c;
            cursor = flip ? 63 - d : d;
            kbd = true;
            render();
        } else if (k === "Enter" || k === " ") {
            kbd = true;
            onSq(cursor);
        } else if (k === "Escape") {
            if (cheatsOpen) cheatsOpen = false;
            else if (armed) armed = null;
            else sel = -1;
            render();
        } else if (k === "n" || k === "N") submitAction({ type: "new" });
        else if (k === "u" || k === "U") undo();
        else if (k === "f" || k === "F") { flip = !flip; buildStatic(); render(); }
        else if ((k === "c" || k === "C") && !online) { cheatsOpen = !cheatsOpen; render(); }
        else if ((k === "h" || k === "H") && !online) { cheatsOpen = false; cheatHint(); }
        else used = false;
        if (used) event.preventDefault();
    }

    function handleCtx(event) {
        event.preventDefault();
        sel = -1;
        armed = null;
        render();
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    root.addEventListener("keydown", handleKey);
    svg.addEventListener("contextmenu", handleCtx);

    /* ---------- boot ---------- */
    buildStatic();
    if (online) {
        unsubs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            unsubs.push(room.onAction((action) => applyAction(action, 1)));
            newGame();
        } else {
            unsubs.push(room.onState((nextState) => {
                state = nextState;
                sel = -1; hint = null; armed = null;
                syncOrientation();
                refreshLM();
                render();
            }));
            render();
        }
    } else {
        newGame();
    }
    root.focus({ preventScroll: true });

    return {
        destroy() {
            destroyed = true;
            clearTimeout(aiTimer);
            aiTimer = 0;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            root.removeEventListener("keydown", handleKey);
            svg.removeEventListener("contextmenu", handleCtx);
            for (const u of unsubs) if (typeof u === "function") u();
        },
    };
}