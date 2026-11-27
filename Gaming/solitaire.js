/* =============================================================== */
/* games/solitaire.js — Solitaire (Klondike Race)                    */
/* Template: export const META + export function mount(root, ctx)    */
/* Setelah mengubah file ini jalankan:                               */
/*   node tools/build-games-manifest.mjs                             */
/* =============================================================== */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "solitaire", // harus sama dengan nama file tanpa .js
    name: "Solitaire",
    category: "cards",
    catLabel: "Cards",
    desc: "Klondike race: build four foundations Ace→King on a winnable deal. Take turns vs a bot or a friend; first to finish wins.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="9" width="17" height="23" rx="3" transform="rotate(-14 13.5 20.5)"/><rect x="26" y="9" width="17" height="23" rx="3" transform="rotate(14 34.5 20.5)"/><rect x="15" y="8" width="18" height="24" rx="3"/><path d="M24 13.5c-1.7-2.1-4.9-1.4-4.9 1.1 0 1.9 2.3 3.8 4.9 6.1 2.6-2.3 4.9-4.2 4.9-6.1 0-2.5-3.2-3.2-4.9-1.1z" fill="currentColor" stroke="none"/></svg>',
    bg: ["#bbf7d0", "#34d399"],
    bestKey: "solitaireBest",
};

/* ---------- card constants ---------- */
const SUITS = ["spade", "heart", "diamond", "club"];
const SUIT_MARK = {
    spade: '<path d="M12 2C8 7.5 4 10 4 13.7c0 2.5 2 4.3 4.3 4.3 1.2 0 2.3-.5 3-1.3-.2 1.9-1 3.3-2.3 4.3h6c-1.3-1-2.1-2.4-2.3-4.3.7.8 1.8 1.3 3 1.3 2.3 0 4.3-1.8 4.3-4.3C20 10 16 7.5 12 2z"/>',
    heart: '<path d="M12 21C5.5 15.5 2 11.6 2 7.8 2 4.9 4.2 3 6.8 3c1.9 0 3.7 1 5.2 3C13.5 4 15.3 3 17.2 3 19.8 3 22 4.9 22 7.8c0 3.8-3.5 7.7-10 13.2z"/>',
    diamond: '<path d="M12 2l7.5 10L12 22 4.5 12z"/>',
    club: '<circle cx="12" cy="6.8" r="4.3"/><circle cx="7" cy="13.5" r="4.3"/><circle cx="17" cy="13.5" r="4.3"/><path d="M10.8 12h2.4c.2 4 .9 6.9 2.6 9H8.2c1.7-2.1 2.4-5 2.6-9z"/>',
};
const RED = "#dc2626", BLK = "#26262e";
const MAX_PASSES = 3;

/* ---------- pure rules ---------- */
function isRed(s) { return s === 1 || s === 2; }
function canTableau(m, onto) {
    if (!onto) return m.r === 13;
    return m.r === onto.r - 1 && isRed(m.s) !== isRed(onto.s);
}
function canFoundation(c, top) {
    if (!top) return c.r === 1;
    return c.s === top.s && c.r === top.r + 1;
}
function rankLabel(r) {
    return r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);
}
function runStart(col) {
    if (!col.length || !col[col.length - 1].up) return col.length;
    let m = col.length - 1;
    while (m > 0) {
        const below = col[m - 1], cur = col[m];
        if (!below.up || cur.r !== below.r - 1 || isRed(cur.s) === isRed(below.s)) break;
        m--;
    }
    return m;
}
function flipTop(col) { if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true; }
function foundTotal(b) { return b.found[0].length + b.found[1].length + b.found[2].length + b.found[3].length; }
function canRecycle(b) { return !b.stock.length && b.waste.length > 0 && b.passes < MAX_PASSES - 1; }
function findFoundation(b, c) {
    for (let fi = 0; fi < 4; fi++) {
        const top = b.found[fi].length ? b.found[fi][b.found[fi].length - 1] : null;
        if (canFoundation(c, top)) return fi;
    }
    return -1;
}
function hasAnyMove(b) {
    if (b.wild) return true;
    if (b.stock.length || canRecycle(b)) return true;
    if (b.waste.length) {
        const wt = b.waste[b.waste.length - 1];
        if (findFoundation(b, wt) >= 0) return true;
        for (let c = 0; c < 7; c++) {
            const onto = b.cols[c].length ? b.cols[c][b.cols[c].length - 1] : null;
            if (canTableau(wt, onto)) return true;
        }
    }
    for (let c = 0; c < 7; c++) {
        const col = b.cols[c];
        if (col.length && col[col.length - 1].up && findFoundation(b, col[col.length - 1]) >= 0) return true;
    }
    for (let c = 0; c < 7; c++) {
        const col = b.cols[c];
        if (!col.length) continue;
        const rs = runStart(col);
        for (let i = rs; i < col.length; i++) {
            const head = col[i];
            for (let d = 0; d < 7; d++) {
                if (d === c) continue;
                const onto = b.cols[d].length ? b.cols[d][b.cols[d].length - 1] : null;
                if (canTableau(head, onto)) return true;
            }
        }
    }
    return false;
}
/* best single foundation move (lowest rank), shared by bot + auto button + cheat */
function foundationPick(b) {
    let best = null;
    const consider = (card, from) => {
        const fi = findFoundation(b, card);
        if (fi >= 0 && (!best || card.r < best.r)) best = { r: card.r, action: { type: "move", from, to: { z: "found", f: fi } } };
    };
    if (b.waste.length) consider(b.waste[b.waste.length - 1], { z: "waste" });
    for (let c = 0; c < 7; c++) {
        const col = b.cols[c];
        if (col.length && col[col.length - 1].up) consider(col[col.length - 1], { z: "col", c, i: col.length - 1 });
    }
    return best ? best.action : null;
}

/* ---------- bot heuristic ---------- */
function botChoose(b) {
    const f = foundationPick(b);
    if (f) return f;
    const kingWaiting =
        (b.waste.length && b.waste[b.waste.length - 1].r === 13) ||
        b.cols.some((col) => col.length > 1 && col[0].up && col[0].r === 13);
    for (let c = 0; c < 7; c++) {
        const col = b.cols[c];
        if (!col.length) continue;
        const rs = runStart(col);
        for (let i = rs; i < col.length; i++) {
            const head = col[i];
            const flips = i > 0 && !col[i - 1].up;
            const empties = i === 0;
            if (!flips && !(empties && kingWaiting)) continue;
            if (empties && head.r === 13) continue;
            for (let d = 0; d < 7; d++) {
                if (d === c) continue;
                const dest = b.cols[d];
                const onto = dest.length ? dest[dest.length - 1] : null;
                if (empties && !onto) continue;
                if (canTableau(head, onto)) return { type: "move", from: { z: "col", c, i }, to: { z: "col", c: d } };
            }
        }
    }
    if (b.waste.length) {
        const wt = b.waste[b.waste.length - 1];
        for (let d = 0; d < 7; d++) {
            const dest = b.cols[d];
            if (dest.length && canTableau(wt, dest[dest.length - 1])) return { type: "move", from: { z: "waste" }, to: { z: "col", c: d } };
        }
        for (let d = 0; d < 7; d++) if (!b.cols[d].length && canTableau(wt, null)) return { type: "move", from: { z: "waste" }, to: { z: "col", c: d } };
    }
    if (b.stock.length) return { type: "draw" };
    if (canRecycle(b)) return { type: "recycle" };
    if (b.waste.length) {
        const wt = b.waste[b.waste.length - 1];
        for (let c = 0; c < 7; c++) {
            const col = b.cols[c];
            if (col.length < 2 || !col[col.length - 1].up) continue;
            const t = col[col.length - 1], under = col[col.length - 2];
            if (!under.up || !canTableau(wt, under)) continue;
            for (let d = 0; d < 7; d++) {
                if (d === c) continue;
                const onto = b.cols[d].length ? b.cols[d][b.cols[d].length - 1] : null;
                if (onto && canTableau(t, onto)) return { type: "move", from: { z: "col", c, i: col.length - 1 }, to: { z: "col", c: d } };
            }
        }
    }
    return null;
}

/* ---------- seeded RNG ---------- */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------- solvable deal generator (reverse construction) ---------- */
/* Builds the deal backwards from a solved game, so a winning line is
   guaranteed to exist (draw-1, a single pass through the stock). */
function solveBurials(ups0, t) {
    const seen = new Set();
    let nodes = 0;
    function dfs(ups, ds) {
        nodes++;
        if (nodes > 20000) return null;
        let done = true;
        for (let j = 0; j < 7; j++) if (ds[j] !== t[j]) { done = false; break; }
        if (done) {
            for (let j = 0; j < 7; j++) if (ups[j] !== 1) return null;
            return [];
        }
        const key = ups.join(",") + "|" + ds.join(",");
        if (seen.has(key)) return null;
        seen.add(key);
        const moves = [];
        for (let y = 0; y < 7; y++) {
            if (ups[y] < 2) continue;
            for (let x = 0; x < 7; x++) {
                if (x === y || ups[x] !== 1 || ds[x] >= t[x]) continue;
                for (let L = ups[y] - 1; L >= 1; L--) moves.push([(t[x] - ds[x]) * 10 + L, y, L, x]);
            }
        }
        moves.sort((a, b) => b[0] - a[0]);
        for (const m of moves) {
            const y = m[1], L = m[2], x = m[3];
            const nu = ups.slice(), nd = ds.slice();
            nu[y] -= L; nu[x] = L; nd[x]++;
            const r = dfs(nu, nd);
            if (r) { r.unshift([y, L, x]); return r; }
        }
        return null;
    }
    return dfs(ups0.slice(), [0, 0, 0, 0, 0, 0, 0]);
}

function makeSolvableDeal(seed) {
    const rng = mulberry32(seed);
    const pick = (arr) => arr[(rng() * arr.length) | 0];
    const RESERVED = 6;
    for (let attempt = 0; attempt < 200; attempt++) {
        const cols = [[], [], [], [], [], [], []];
        const found = [13, 13, 13, 13];
        const stock = [];
        const log = [];
        let steps = 0, lat = 0, last = null, ok = false;
        while (steps < 600) {
            steps++;
            const F = found[0] + found[1] + found[2] + found[3];
            let T = 0; for (const c of cols) T += c.length;
            const S = stock.length;
            if (F === 0 && S === 24) { ok = true; break; }
            let chosen = null;
            const empties = []; for (let x = 0; x < 7; x++) if (!cols[x].length) empties.push(x);
            if (empties.length && F > 0) {
                const suits = []; for (let s = 0; s < 4; s++) if (found[s] > 0) suits.push(s);
                chosen = ["A", pick(suits), empties[0]];
            } else {
                const aopts = [], sopts = [];
                if (T < 28) {
                    for (let s = 0; s < 4; s++) {
                        if (!found[s]) continue;
                        const c = { s, r: found[s], up: true };
                        for (let x = 0; x < 7; x++) {
                            if (x === RESERVED || !cols[x].length || cols[x].length >= 10) continue;
                            if (!canTableau(c, cols[x][cols[x].length - 1])) continue;
                            aopts.push(["A", s, x]);
                        }
                    }
                }
                if (S < 24) for (let s = 0; s < 4; s++) if (found[s] > 0) sopts.push(["S", s]);
                if (aopts.length && sopts.length && rng() < 0.12) chosen = pick(sopts);
                else if (aopts.length) chosen = pick(aopts);
                else if (sopts.length) chosen = pick(sopts);
                else {
                    if (lat >= 14) break;
                    const bopts = [];
                    for (let y = 0; y < 7; y++) {
                        if (y === RESERVED) continue;
                        const col = cols[y], rs = runStart(col);
                        if (rs >= col.length) continue;
                        for (let L = 1; L < col.length - rs; L++) {
                            const head = col[col.length - L];
                            for (let x = 0; x < 7; x++) {
                                if (x === y || x === RESERVED) continue;
                                const dx = cols[x];
                                if (!dx.length || dx.length + L > 12 || !canTableau(head, dx[dx.length - 1])) continue;
                                bopts.push(["B", y, L, x]);
                            }
                        }
                    }
                    if (!bopts.length) break;
                    let filtered = bopts;
                    if (last && last[0] === "B") {
                        filtered = bopts.filter((op) => !(op[1] === last[3] && op[3] === last[1] && op[2] === last[2]));
                        if (!filtered.length) filtered = bopts;
                    }
                    chosen = pick(filtered); lat++;
                }
            }
            if (chosen[0] !== "B") lat = 0;
            last = chosen;
            if (chosen[0] === "S") { const s = chosen[1]; stock.push({ s, r: found[s], up: false }); found[s]--; }
            else if (chosen[0] === "A") { const s = chosen[1], x = chosen[2]; cols[x].push({ s, r: found[s], up: true }); found[s]--; }
            else { const y = chosen[1], L = chosen[2], x = chosen[3]; const R = cols[y].splice(cols[y].length - L); for (const c of R) cols[x].push(c); }
            log.push(chosen);
        }
        if (!ok || cols.some((c) => !c.length)) continue;
        const ups0 = cols.map((c) => c.length);
        if (ups0[RESERVED] !== 1) continue;
        const t = [0, 1, 2, 3, 4, 5, 6];
        for (let i = 6; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const tmp = t[i]; t[i] = t[j]; t[j] = tmp; }
        if (t[RESERVED] === 0) {
            let k = 0; while (k === RESERVED || t[k] === 0) k++;
            const tmp = t[RESERVED]; t[RESERVED] = t[k]; t[k] = tmp;
        }
        const sol = solveBurials(ups0, t);
        if (!sol) continue;
        for (const mv of sol) {
            const y = mv[0], L = mv[1], x = mv[2];
            const R = cols[y].splice(cols[y].length - L);
            cols[x][cols[x].length - 1].up = false;
            for (const c of R) cols[x].push(c);
            log.push(["C", y, L, x]);
        }
        const finalCols = new Array(7);
        for (let j = 0; j < 7; j++) finalCols[t[j]] = cols[j];
        const remap = log.map((op) => {
            if (op[0] === "A") return ["A", op[1], t[op[2]]];
            if (op[0] === "B" || op[0] === "C") return [op[0], t[op[1]], op[2], t[op[3]]];
            return op;
        });
        return { cols: finalCols, stock, solution: remap, attempts: attempt + 1 };
    }
    /* extremely unlikely fallback: plain shuffled deal */
    const deck = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ s, r, up: false });
    for (let i = deck.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp; }
    const cols = [[], [], [], [], [], [], []];
    let k = 0;
    for (let row = 0; row < 7; row++) for (let c = row; c < 7; c++) cols[c].push(deck[k++]);
    for (const col of cols) col[col.length - 1].up = true;
    return { cols, stock: deck.slice(k), solution: null, attempts: 200 };
}

/* verify a generated deal by replaying its solution with strict forward rules */
function replaySolution(deal, solution) {
    if (!solution) return false;
    const cols = deal.cols.map((col) => col.map((c) => ({ s: c.s, r: c.r, up: c.up })));
    const stock = deal.stock.map((c) => ({ s: c.s, r: c.r, up: c.up }));
    const waste = [], found = [[], [], [], []];
    const ok = (cond) => { if (!cond) throw new Error("replay"); };
    try {
        for (let i = solution.length - 1; i >= 0; i--) {
            const op = solution[i];
            if (op[0] === "S") {
                ok(stock.length); const c = stock.pop(); c.up = true; waste.push(c);
                const s = op[1], top = found[s].length ? found[s][found[s].length - 1] : null;
                ok(waste[waste.length - 1].s === s && canFoundation(waste[waste.length - 1], top));
                found[s].push(waste.pop());
            } else if (op[0] === "A") {
                const s = op[1], x = op[2];
                ok(cols[x].length && cols[x][cols[x].length - 1].up);
                const c = cols[x][cols[x].length - 1], top = found[s].length ? found[s][found[s].length - 1] : null;
                ok(c.s === s && canFoundation(c, top));
                cols[x].pop(); found[s].push(c); flipTop(cols[x]);
            } else {
                const y = op[1], L = op[2], x = op[3], col = cols[x], idx = col.length - L;
                ok(idx >= 0 && idx >= runStart(col));
                const onto = cols[y].length ? cols[y][cols[y].length - 1] : null;
                ok(canTableau(col[idx], onto));
                const R = col.splice(idx); for (const c of R) cols[y].push(c);
                if (op[0] === "C") { ok(col.length && !col[col.length - 1].up); flipTop(col); }
                else ok(!col.length || col[col.length - 1].up);
            }
        }
        ok(foundTotal({ found }) === 52 && !stock.length && !waste.length && cols.every((c) => !c.length));
        return true;
    } catch (e) { return false; }
}

export const _test = { mulberry32, makeSolvableDeal, replaySolution, canTableau, canFoundation, hasAnyMove, botChoose, runStart };

/* =============================================================== */
/* mount                                                            */
/* =============================================================== */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* layout constants (logical px; board is scaled to fit) */
    const CW = 64, CH = 90, PITCH = 72, PAD = 12, BOARD_W = 520;
    const TOP_Y = PAD, WASTE_X = PAD + PITCH, FOUND_X = PAD + 3 * PITCH;
    const COL_Y = PAD + CH + 20, UP_OFF = 26, DOWN_OFF = 12, STACK_BUDGET = 330;
    const RECYCLE_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';

    /* local (non-synced) ui state */
    let sel = null, cursor = -1, levelNum = 0, cheated = false, history = [];
    let timers = [], botTimer = 0, flashT = 0, oppOpen = typeof window !== "undefined" && window.innerWidth > 760;
    let paused = false, pausedAt = 0, botDue = 0, botLeft = 0, flashDue = 0, flashLeft = 0;
    let helpOpen = false, cheatsOpen = false, overOpen = false;
    const offs = [];
    const later = (fn, ms) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms); timers.push(t); return t; };
    const clearTimers = () => {
        timers.forEach(clearTimeout); timers = [];
        if (botTimer) { clearTimeout(botTimer); botTimer = 0; }
        botDue = 0; botLeft = 0;
        if (flashT) { clearTimeout(flashT); flashT = 0; }
        flashDue = 0; flashLeft = 0;
    };

    /* internal "How to play" — first run only, no global dialog */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("solitaireHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("solitaireHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.sol-app{--bg:#f7f7f8;--panel:#fff;--line:#e6e6ea;--ink:#1c1c22;--mut:#8a8a96;--acc:#0d9488;--acc2:#7c3aed;--red:#dc2626;--blk:#26262e;--board:#eef3f0;--slot:#cfd8d3;
  font-family:inherit;color:var(--ink);position:relative;min-width:0}
.sol-app *{box-sizing:border-box}
.sol-app [hidden]{display:none!important}
.sol-app.game-fill{flex:1 1 auto}
.sol-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;font:600 10px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace}
.sol-chip{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:4px 9px;color:var(--mut);background:var(--panel);border:1px solid var(--line);border-radius:999px;white-space:nowrap}
.sol-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.sol-bar{display:inline-block;width:42px;height:5px;border-radius:999px;background:var(--line);overflow:hidden;vertical-align:middle}
.sol-bar i{display:block;height:100%;background:var(--acc);border-radius:999px;transition:width .2s}
.sol-chip.opp .sol-bar i{background:var(--acc2)}
.sol-turnchip{font-weight:700}
.sol-turnchip.mine{color:var(--acc);border-color:var(--acc)}
.sol-turnchip.theirs{color:var(--acc2);border-color:var(--acc2)}
.sol-msgchip{max-width:min(280px,24vw);overflow:hidden;text-overflow:ellipsis}
.sol-spacer{flex:1 1 auto}
.sol-btn{min-height:32px;display:inline-flex;align-items:center;justify-content:center;gap:5px;font:inherit;font-size:10px;font-weight:700;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:5px 9px;cursor:pointer;touch-action:manipulation;transition:border-color .16s,background .16s}
.sol-btn:hover{border-color:var(--acc)}
.sol-btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.sol-btn.on{border-color:var(--acc);color:var(--acc);background:#eef7f5}
.sol-btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
.sol-btn.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}
.sol-btn:disabled{opacity:.45;cursor:not-allowed}
.sol-icon-btn svg{flex:none;display:block}
.sol-panel{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;min-height:0;overflow:hidden}
.sol-scale{margin:0 auto;position:relative;max-width:100%;flex:0 0 auto}
.sol-board{position:relative;width:${BOARD_W}px;transform-origin:top left;background:var(--board);border-radius:12px;user-select:none;-webkit-user-select:none;box-shadow:inset 0 0 0 1px #00000008}
.sol-board.mini{pointer-events:none}
.sol-slot{position:absolute;border-radius:8px;border:1px dashed var(--slot);cursor:pointer;touch-action:manipulation}
.sol-slot .lab{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;color:#00000022}
.sol-slot.colslot{border-color:transparent}
.sol-slot.colslot.empty{border-color:var(--slot)}
.sol-slot.ok{border-color:var(--acc);border-style:solid}
.sol-slot.cur{box-shadow:0 0 0 2px var(--acc2)}
.sol-card{position:absolute;border-radius:8px;background:#fff;border:1px solid #e2e2e8;box-shadow:0 1px 2px #00000014,0 2px 6px #0000000f;cursor:pointer;touch-action:manipulation;overflow:hidden}
.sol-card .rk{position:absolute;left:6px;top:4px;font-weight:800;font-size:15px;line-height:1}
.sol-card .st-sm{position:absolute;left:5px;top:22px;width:15px;height:15px}
.sol-card .st-big{position:absolute;left:50%;top:54%;width:34px;height:34px;transform:translate(-50%,-50%);opacity:.9}
.sol-card .court{position:absolute;left:50%;top:50%;transform:translate(-50%,-52%);font-weight:800;font-size:30px;opacity:.85}
.sol-card.back{border:2px solid var(--acc);background-color:#0f766e;background-image:repeating-linear-gradient(45deg,#0d9488 0 5px,#0f766e 5px 10px);box-shadow:inset 0 0 0 2px #134e4a,0 1px 3px #00000022}
.sol-card.stack{box-shadow:2px 2px 0 #134e4a,4px 4px 0 #115e59,0 1px 3px #00000022}
.sol-card.sel{box-shadow:0 0 0 3px var(--acc),0 3px 10px #00000026;transform:translateY(-2px)}
.sol-card.ok{box-shadow:0 0 0 2px var(--acc)}
.sol-count{position:absolute;right:3px;bottom:2px;font-size:10px;font-weight:700;color:#ffffffcc;background:#00000033;border-radius:6px;padding:0 4px}
.sol-slot .sol-count{color:var(--mut);background:transparent}
.sol-opp{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 auto}
.sol-opp-head{font-size:11px;font-weight:700;color:var(--mut);text-align:center}
.sol-ov{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:12px;background:#1c1c2266;backdrop-filter:blur(2px);border-radius:12px}
.sol-modal{display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:460px;width:100%;max-height:100%;padding:20px;box-shadow:0 12px 32px #00000026}
.sol-modal h3{margin:0;font-size:18px;font-weight:800}
.sol-modal h4{margin:14px 0 4px;font-size:13px;font-weight:800;color:var(--acc)}
.sol-modal p,.sol-modal li{font-size:13px;color:#3f3f46;line-height:1.55;margin:4px 0}
.sol-modal ul{margin:4px 0;padding-left:18px}
.sol-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.sol-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:14px;flex-wrap:wrap}
.sol-help,.sol-cheats{flex:1 1 auto;min-height:0;overflow:auto}
.sol-cheatgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.sol-note{font-size:11px;color:var(--mut);margin-top:12px}
.sol-big{font-size:26px;font-weight:800;margin:4px 0}
.sol-big.win{color:var(--acc)} .sol-big.lose{color:var(--red)} .sol-big.draw{color:var(--acc2)}
@media (prefers-reduced-motion:reduce){.sol-app *{animation:none!important;transition:none!important}}

/* --- final overrides: fill height + mobile (keep last) --- */
.sol-app .sol-hud .sol-btn{min-height:32px;padding:5px 9px;font-size:10px}
.sol-app .sol-hud .sol-icon-btn{display:inline-flex;align-items:center;gap:5px}
.sol-app .sol-hud .sol-icon-btn svg{flex:none;display:block}
@media (max-width:640px){
.sol-app.game-fill > .sol-panel[data-board]:not(:has(.sol-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.sol-app.game-fill > .sol-panel[data-board]:has(.sol-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.sol-app .sol-hud{gap:4px;margin-bottom:6px}
.sol-app .sol-hud .sol-chip{padding:3px 6px;font-size:9px;min-height:24px}
.sol-app .sol-hud .sol-chip.sol-msgchip,
.sol-app .sol-hud .sol-chip[data-hud="bestchip"]{display:none}
.sol-app .sol-hud .sol-btn{min-height:32px;padding:5px 7px;font-size:9px}
.sol-app .sol-hud [data-act="cancel"]{display:none}
.sol-app .sol-hud .sol-btn-label{display:none}
.sol-app .sol-hud .sol-spacer{display:none}
.sol-app .sol-bar{width:28px}
.sol-ov{padding:8px}
.sol-app .sol-modal{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.sol-app .sol-help,.sol-app .sol-cheats{scrollbar-width:none}
.sol-app .sol-help::-webkit-scrollbar,.sol-app .sol-cheats::-webkit-scrollbar{display:none}
.sol-app .sol-foot{position:static;margin:10px 0 0;padding:8px 0 0;border-top:1px solid var(--line)}
.sol-app .sol-note{display:none}
.sol-cheatgrid{grid-template-columns:1fr}
}
</style>
<div class="game-app sol-app game-fill" data-sol>
  <div class="sol-hud">
    <span class="sol-chip">LV <b data-hud="level">1</b></span>
    <span class="sol-chip" data-hud="youchip" title="You">YOU <b data-hud="mefound">0</b>/52 <span class="sol-bar"><i data-hud="mebar" style="width:0%"></i></span> <b data-hud="memoves">0</b>mv P<b data-hud="mepass">1</b>/${MAX_PASSES}</span>
    <span class="sol-chip opp" data-hud="oppchip" title="Bot">BOT <b data-hud="oppfound">0</b>/52 <span class="sol-bar"><i data-hud="oppbar" style="width:0%"></i></span> <b data-hud="oppmoves">0</b>mv <span data-hud="opplast"></span></span>
    <span class="sol-chip" data-hud="bestchip">BEST <b data-hud="best">0</b></span>
    <span class="sol-chip sol-turnchip" data-hud="turnchip">Your turn</span>
    <span class="sol-chip sol-msgchip" data-hud="msg" title="Click a card or run to pick it up, then click a destination. Double-click / right-click sends a card to its foundation.">Click a card or run to pick it up, then click a destination. Double-click / right-click sends a card to its foundation.</span>
    <span class="sol-spacer"></span>
    <button class="sol-btn sol-icon-btn" type="button" data-act="draw" aria-label="Draw card" title="Draw / recycle (D)">${iconSVG("layers", { size: 14 })}<span class="sol-btn-label" data-hud="drawlabel">Draw</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-act="auto" aria-label="Send best card to foundation" title="To foundation (A)">${iconSVG("arrowUp", { size: 14 })}<span class="sol-btn-label">Foundation</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-act="cancel" aria-label="Cancel selection" title="Cancel (Esc)">${iconSVG("x", { size: 14 })}<span class="sol-btn-label">Cancel</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-act="opp" aria-label="Show opponent board" title="Toggle opponent board (V)">${iconSVG("eye", { size: 14 })}<span class="sol-btn-label">Show bot</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="sol-btn-label">Help</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="sol-btn-label">Cheats</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="sol-btn-label">Pause</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-restart aria-label="Restart" title="New level (R)">${iconSVG("refresh", { size: 14 })}<span class="sol-btn-label">Restart</span></button>
    <button class="sol-btn sol-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="sol-btn-label">Exit game</span></button>
  </div>

  <section class="game-panel sol-panel" data-board>
    <div class="sol-scale" data-scale><div class="sol-board" data-myboard aria-label="Your solitaire board"></div></div>
    <div class="sol-opp" data-oppwrap hidden>
      <div class="sol-opp-head" data-hud="opphead">Opponent board</div>
      <div class="sol-scale" data-oppscale><div class="sol-board mini" data-oppboard></div></div>
    </div>

    <div class="sol-ov" data-ov="over" hidden>
      <div class="sol-modal">
        <div class="sol-head"><h3 data-overtitle>Game over</h3></div>
        <div class="sol-help">
          <div class="sol-big" data-overbig></div>
          <p data-overreason></p>
          <p data-overscores></p>
        </div>
        <div class="sol-foot">
          <button class="sol-btn" type="button" data-overclose>View board</button>
          <button class="sol-btn primary" type="button" data-restart>Play again</button>
        </div>
      </div>
    </div>

    <div class="sol-ov" data-ov="pause" hidden>
      <div class="sol-modal">
        <div class="sol-head"><h3>Paused</h3></div>
        <div class="sol-help"><p>The bot and all timers are frozen. Resume to continue from the same point.</p></div>
        <div class="sol-foot"><span class="sol-note">Press P / Esc to resume</span><button class="sol-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="sol-ov" data-ov="cheat" hidden>
      <div class="sol-modal">
        <div class="sol-head"><h3>Cheats</h3><button class="sol-btn" type="button" data-close>Close</button></div>
        <div class="sol-cheats">
          <p>Single-player vs bot only. Using any cheat disables best-score saving for this level.</p>
          <div class="sol-cheatgrid">
            <button class="sol-btn" type="button" data-cheat="reveal">Reveal all cards</button>
            <button class="sol-btn" type="button" data-cheat="passes">Reset stock passes</button>
            <button class="sol-btn" type="button" data-cheat="wild">Wild next move</button>
            <button class="sol-btn" type="button" data-cheat="collect">Auto-collect foundations</button>
            <button class="sol-btn" type="button" data-cheat="undo">Undo last move</button>
          </div>
        </div>
        <div class="sol-foot"><span class="sol-note" data-cheatnote></span><button class="sol-btn" type="button" data-close>Close</button></div>
      </div>
    </div>

    <div class="sol-ov" data-ov="help" hidden>
      <div class="sol-modal">
        <div class="sol-head"><h3>How to play</h3><button class="sol-btn" type="button" data-help-close>Close</button></div>
        <div class="sol-help">
          <div>
            <h4>Goal</h4>
            <p>Move all 52 cards to the four foundations, building each suit up from Ace to King. You race an opponent on an identical deal, taking turns. First to finish wins; if both get stuck, the higher foundation count wins.</p>
            <h4>Rules</h4>
            <ul>
              <li>Tableau columns build <b>down in alternating colors</b> (e.g. red 7 on black 8). Only a King may start an empty column.</li>
              <li>You may pick up a single card or a valid descending run, then drop it on a column or foundation.</li>
              <li>Foundations build <b>up by suit</b> from the Ace.</li>
              <li>Click the stock to draw one card. When it empties you may recycle the waste — up to ${MAX_PASSES} passes total.</li>
              <li>Every level is generated to be <b>winnable</b> (draw-1, within the pass limit).</li>
            </ul>
          </div>
          <div>
            <h4>Mouse / touch</h4>
            <ul>
              <li>Click / tap a card or run to select, click / tap a destination to drop.</li>
              <li>Double-click / double-tap (or right-click) a top card to send it to its foundation.</li>
              <li>Use the on-screen buttons for draw, auto-foundation, cancel, etc.</li>
            </ul>
            <h4>Keyboard</h4>
            <ul>
              <li><b>D / Space</b> draw or recycle · <b>A</b> best card to foundation · <b>F / ↑</b> send selected card to foundation</li>
              <li><b>1–7</b> select a column's top card, or drop there · <b>← / →</b> move cursor · <b>Enter / ↓</b> select/drop at cursor</li>
              <li><b>H</b> help · <b>C</b> cheats · <b>P</b> pause · <b>R / N</b> new level · <b>V</b> opponent board</li>
              <li><b>Esc</b> cancel / close · <b>U</b> undo (cheat)</li>
            </ul>
          </div>
        </div>
        <div class="sol-foot"><span class="sol-note">Press H to reopen this guide</span><button class="sol-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const app = $("[data-sol]");
    const boardEl = $("[data-myboard]"), oppBoardEl = $("[data-oppboard]");
    const scaleEl = $("[data-scale]"), oppScaleEl = $("[data-oppscale]");
    const oppWrap = $("[data-oppwrap]");
    const ovHelp = $('[data-ov="help"]'), ovCheat = $('[data-ov="cheat"]'), ovOver = $('[data-ov="over"]'), ovPause = $('[data-ov="pause"]');
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");
    const cheatBtn = $('[data-cheats]');
    const hudKeys = ["level", "mefound", "memoves", "mepass", "mebar", "oppfound", "oppmoves", "oppbar", "opplast", "opphead", "best", "bestchip", "turnchip", "msg", "drawlabel", "youchip", "oppchip"];
    const hud = {};
    for (const k of hudKeys) hud[k] = root.querySelector('[data-hud="' + k + '"]');
    const DEFAULT_MSG = hud.msg.textContent;

    /* ---------- helpers ---------- */
    function getMySeat() { if (!state) return 0; return online ? (room.isHost ? state.seats.host : 1 - state.seats.host) : 0; }
    function opponentName() {
        if (!online) return "Bot";
        const ps = roomData?.players;
        const other = room.isHost ? 1 : 0;
        if (Array.isArray(ps) && ps[other]?.name) return ps[other].name;
        if (ps && typeof ps === "object") { const vals = Object.values(ps); if (vals[other]?.name) return vals[other].name; }
        return room.isHost ? "Guest" : "Host";
    }
    function nameOf(seat) { return seat === getMySeat() ? "You" : opponentName(); }
    function myBoard() { return state ? state.boards[getMySeat()] : null; }
    function flash(text, ms) {
        if (paused) return; /* frozen while paused */
        hud.msg.textContent = text;
        hud.msg.title = text;
        if (flashT) { const old = flashT; clearTimeout(old); flashT = 0; timers = timers.filter((t) => t !== old); }
        const dur = ms || 2400;
        flashDue = Date.now() + dur;
        flashT = setTimeout(() => { flashT = 0; flashDue = 0; hud.msg.textContent = DEFAULT_MSG; hud.msg.title = DEFAULT_MSG; }, dur);
    }
    function readBest() { try { return +(localStorage.getItem(META.bestKey) || 0); } catch (e) { return 0; } }
    function writeBest(v) { try { localStorage.setItem(META.bestKey, String(v)); } catch (e) { } }

    /* ---------- pause: freeze bot + timer anchors, resume without a jump ---------- */
    function setPaused(on) {
        on = Boolean(on);
        if (paused === on) return;
        const t = Date.now();
        if (on) {
            paused = true; pausedAt = t;
            if (botTimer) { clearTimeout(botTimer); timers = timers.filter((x) => x !== botTimer); botTimer = 0; }
            if (botDue) botLeft = Math.max(0, botDue - t);
            if (flashT) { clearTimeout(flashT); flashT = 0; flashLeft = Math.max(0, flashDue - t); }
            sel = null;
        } else {
            const shift = t - pausedAt; /* geser anchor waktu agar tidak loncat */
            paused = false; pausedAt = 0;
            if (botLeft > 0) {
                botDue += shift;
                const ms = Math.max(0, botDue - t); botLeft = 0;
                botTimer = later(() => { botTimer = 0; botDue = 0; botTurn(); }, ms);
            } else if (state && state.phase === "playing" && state.turn === 1) scheduleBot();
            if (flashLeft > 0) {
                flashDue += shift;
                const ms = Math.max(0, flashDue - t); flashLeft = 0;
                flashT = setTimeout(() => { flashT = 0; flashDue = 0; hud.msg.textContent = DEFAULT_MSG; hud.msg.title = DEFAULT_MSG; }, ms);
            }
        }
        render();
    }
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
    function syncUI() {
        const phase = state ? state.phase : "idle";
        ovOver.hidden = phase !== "over" || !overOpen || cheatsOpen || helpOpen;
        ovPause.hidden = !paused || cheatsOpen || helpOpen;
        ovCheat.hidden = !cheatsOpen || helpOpen || online;
        ovHelp.hidden = !helpOpen;
        if (cheatBtn) {
            cheatBtn.classList.toggle("on", cheatsOpen || cheated);
            cheatBtn.setAttribute("aria-label", cheatsOpen ? "Close cheats (C)" : "Cheats (C)");
        }
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".sol-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume (P)" : "Pause (P)");
        }
        const hbtn = root.querySelector("[data-help]");
        if (hbtn) {
            const label = hbtn.querySelector(".sol-btn-label");
            if (label) label.textContent = helpOpen ? "Close" : "Help";
            hbtn.setAttribute("aria-label", helpOpen ? "Close help (H)" : "How to play (H)");
        }
        const obtn = root.querySelector('[data-act="opp"]');
        if (obtn) {
            obtn.classList.toggle("on", oppOpen);
            const label = obtn.querySelector(".sol-btn-label");
            if (label) label.textContent = oppOpen ? "Hide bot" : "Show bot";
            obtn.setAttribute("aria-label", oppOpen ? "Hide opponent board (V)" : "Show opponent board (V)");
        }
    }

    /* ---------- card html (explicit sizes fix the invisible-card bug) ---------- */
    function cardHTML(card, x, y, attrs, cls) {
        const color = isRed(card.s) ? RED : BLK;
        const suit = SUIT_MARK[SUITS[card.s]];
        const center = card.r >= 11
            ? '<span class="court">' + rankLabel(card.r) + '</span><svg class="st-big" style="width:20px;height:20px;top:70%" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' + suit + "</g></svg>"
            : '<svg class="st-big" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' + suit + "</g></svg>";
        return '<div class="sol-card ' + (cls || "") + '" style="left:' + x + "px;top:" + y + "px;width:" + CW + "px;height:" + CH + "px;color:" + color + '" ' + (attrs || "") + ">" +
            '<span class="rk">' + rankLabel(card.r) + "</span>" +
            '<svg class="st-sm" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' + suit + "</g></svg>" +
            center + "</div>";
    }
    function backHTML(x, y, attrs, cls, count) {
        return '<div class="sol-card back ' + (cls || "") + '" style="left:' + x + "px;top:" + y + "px;width:" + CW + "px;height:" + CH + 'px" ' + (attrs || "") + ">" +
            (count ? '<span class="sol-count">' + count + "</span>" : "") + "</div>";
    }
    function slotHTML(x, y, w, h, attrs, lab, cls, count) {
        return '<div class="sol-slot ' + (cls || "") + '" style="left:' + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + 'px" ' + (attrs || "") + ">" +
            (lab ? '<span class="lab">' + lab + "</span>" : "") +
            (count ? '<span class="sol-count">' + count + "</span>" : "") + "</div>";
    }
    function colOffsets(col) {
        let need = 0;
        for (let i = 0; i < col.length - 1; i++) need += col[i].up ? UP_OFF : DOWN_OFF;
        if (need <= STACK_BUDGET) return { up: UP_OFF, down: DOWN_OFF };
        const k = STACK_BUDGET / need;
        return { up: Math.max(11, UP_OFF * k), down: Math.max(3, DOWN_OFF * k) };
    }
    function stackY(col, idx, off) { let y = 0; for (let i = 0; i < idx; i++) y += col[i].up ? off.up : off.down; return Math.round(y); }

    function renderBoard(b, interactive) {
        let h = "";
        const myTurn = interactive && state.phase === "playing" && state.turn === getMySeat();
        const okCol = (ci) => {
            if (!sel || !myTurn) return false;
            if (sel.src === "col" && sel.col === ci) return false;
            const dest = b.cols[ci], onto = dest.length ? dest[dest.length - 1] : null;
            return b.wild || canTableau(sel.cards[0], onto);
        };
        const okFound = (fi) => {
            if (!sel || !myTurn || sel.cards.length !== 1) return false;
            const pile = b.found[fi], top = pile.length ? pile[pile.length - 1] : null;
            return b.wild || canFoundation(sel.cards[0], top);
        };
        /* stock */
        if (b.stock.length) h += backHTML(PAD, TOP_Y, interactive ? ' data-zone="stock"' : "", "stack", b.stock.length);
        else if (canRecycle(b)) h += slotHTML(PAD, TOP_Y, CW, CH, interactive ? ' data-zone="stock"' : "", RECYCLE_ICON, "");
        else h += slotHTML(PAD, TOP_Y, CW, CH, "", "×", "");
        /* waste */
        if (b.waste.length) {
            const cls = interactive && sel && sel.src === "waste" ? "sel" : "";
            h += cardHTML(b.waste[b.waste.length - 1], WASTE_X, TOP_Y, interactive ? ' data-zone="waste"' : "", cls);
        } else h += slotHTML(WASTE_X, TOP_Y, CW, CH, "", "", "");
        /* foundations */
        for (let fi = 0; fi < 4; fi++) {
            const x = FOUND_X + fi * PITCH, pile = b.found[fi];
            const attrs = interactive ? ' data-zone="found" data-fi="' + fi + '"' : "";
            if (pile.length) h += cardHTML(pile[pile.length - 1], x, TOP_Y, attrs, okFound(fi) ? "ok" : "");
            else h += slotHTML(x, TOP_Y, CW, CH, attrs, "A", okFound(fi) ? "ok" : "");
        }
        /* columns */
        let maxBottom = CH;
        for (let c = 0; c < 7; c++) {
            const col = b.cols[c], x = PAD + c * PITCH, off = colOffsets(col);
            const stackH = col.length ? stackY(col, col.length - 1, off) + CH : CH;
            if (stackH > maxBottom) maxBottom = stackH;
            let baseCls = "colslot" + (col.length ? "" : " empty");
            if (okCol(c)) baseCls += " ok";
            if (interactive && myTurn && cursor === c) baseCls += " cur";
            h += slotHTML(x, COL_Y, CW, stackH, interactive ? ' data-zone="colbase" data-col="' + c + '"' : "", "", baseCls);
            for (let i = 0; i < col.length; i++) {
                const card = col[i];
                const attrs = interactive ? ' data-zone="col" data-col="' + c + '" data-idx="' + i + '"' : "";
                const inSel = interactive && sel && sel.src === "col" && sel.col === c && i >= sel.idx;
                if (card.up) h += cardHTML(card, x, COL_Y + stackY(col, i, off), attrs, inSel ? "sel" : "");
                else h += backHTML(x, COL_Y + stackY(col, i, off), attrs, "");
            }
        }
        return { html: h, height: COL_Y + maxBottom + PAD };
    }

    function fitScale() {
        const panel = $("[data-board]");
        const availW = Math.max(240, panel.clientWidth - 20);
        const myH = boardEl.offsetHeight || 460;
        const oppH = oppWrap.hidden ? 0 : (oppScaleEl.offsetHeight || 120) + 16;
        const availH = Math.max(150, panel.clientHeight - 20 - oppH);
        const s = Math.max(0.3, Math.min(1, availW / BOARD_W, availH / myH));
        boardEl.style.transform = "scale(" + s + ")";
        scaleEl.style.width = BOARD_W * s + "px";
        scaleEl.style.height = boardEl.offsetHeight * s + "px";
        const ms = Math.min(0.5, availW / BOARD_W);
        oppBoardEl.style.transform = "scale(" + ms + ")";
        oppScaleEl.style.width = BOARD_W * ms + "px";
        oppScaleEl.style.height = oppBoardEl.offsetHeight * ms + "px";
    }

    /* ---------- render ---------- */
    function render() {
        if (!state) { hud.turnchip.textContent = "Waiting for host…"; syncUI(); return; }
        const me = getMySeat(), opp = 1 - me;
        const mb = state.boards[me], ob = state.boards[opp];
        if (state.turn !== me || state.phase !== "playing") sel = null;

        const my = renderBoard(mb, true);
        boardEl.innerHTML = my.html; boardEl.style.height = my.height + "px";
        const op = renderBoard(ob, false);
        oppBoardEl.innerHTML = op.html; oppBoardEl.style.height = op.height + "px";

        /* hud (all game info lives here; the board is just the arena) */
        hud.youchip.title = playerName || "You";
        hud.oppchip.title = opponentName();
        hud.mefound.textContent = foundTotal(mb);
        hud.memoves.textContent = mb.moves;
        hud.mepass.textContent = Math.min(mb.passes + 1, MAX_PASSES);
        hud.mebar.style.width = (foundTotal(mb) / 52 * 100) + "%";
        hud.oppfound.textContent = foundTotal(ob);
        hud.oppmoves.textContent = ob.moves;
        hud.oppbar.style.width = (foundTotal(ob) / 52 * 100) + "%";
        hud.opplast.textContent = ob.stuck ? "stuck" : "";
        hud.opphead.textContent = opponentName() + "'s board";
        hud.level.textContent = state.level;
        hud.best.textContent = readBest();
        hud.best.hidden = online;
        hud.bestchip.hidden = online;

        /* turn chip */
        const chip = hud.turnchip;
        if (state.phase === "over") {
            chip.textContent = state.winner === "draw" ? "Draw" : (state.winner === me ? "You win" : "You lose");
            chip.className = "sol-chip sol-turnchip " + (state.winner === me ? "mine" : "theirs");
        } else if (state.turn === me) {
            chip.textContent = mb.stuck ? "You are stuck" : "Your turn";
            chip.className = "sol-chip sol-turnchip mine";
        } else {
            chip.textContent = online ? "Waiting for opponent" : "Bot's turn";
            chip.className = "sol-chip sol-turnchip theirs";
        }

        /* buttons */
        cheatBtn.hidden = online;
        hud.drawlabel.textContent = mb.stock.length ? "Draw" : (canRecycle(mb) ? "Recycle" : "Stock empty");
        root.querySelector('[data-act="draw"]').setAttribute("aria-label", hud.drawlabel.textContent + " card (D)");
        oppWrap.hidden = !oppOpen;
        fitScale();
        syncUI();
    }

    /* ---------- history / cheats (ai only) ---------- */
    function pushHistory() {
        history.push(JSON.stringify({ boards: state.boards, turn: state.turn, last: state.last }));
        if (history.length > 80) history.shift();
    }
    function restoreSnapshot(json) {
        const s = JSON.parse(json);
        state.boards = s.boards; state.turn = s.turn; state.last = s.last;
        state.phase = "playing"; state.winner = null; state.reason = "";
        sel = null; clearTimers();
    }
    function execMove(b, a) {
        const f = a.from, t = a.to;
        let cards;
        if (f.z === "waste") cards = [b.waste.pop()];
        else { cards = b.cols[f.c].splice(f.i); flipTop(b.cols[f.c]); }
        if (t.z === "found") b.found[t.f].push(cards[0]);
        else for (const c of cards) b.cols[t.c].push(c);
        b.moves++;
    }
    function doCheat(kind) {
        const b = state.boards[0];
        if (kind === "undo") {
            if (history.length) { restoreSnapshot(history.pop()); cheated = true; state.last[0] = "Cheat: undid last move."; flash("Undid your last move (and the bot's reply)."); }
            else flash("Nothing to undo.");
            return;
        }
        cheated = true;
        if (kind === "reveal") { for (const col of b.cols) for (const c of col) c.up = true; state.last[0] = "Cheat: revealed all cards."; flash("All cards revealed."); }
        else if (kind === "passes") { b.passes = 0; state.last[0] = "Cheat: passes reset."; flash("Stock passes reset."); }
        else if (kind === "wild") { b.wild = true; state.last[0] = "Cheat: wild move armed."; flash("Your next move ignores placement rules."); }
        else if (kind === "collect") {
            if (state.turn !== 0) { flash("Auto-collect only works on your turn."); return; }
            pushHistory();
            let n = 0, a;
            while ((a = foundationPick(b))) { execMove(b, a); n++; if (foundTotal(b) === 52) break; }
            state.last[0] = "Cheat: auto-collected " + n + " card(s).";
            flash("Auto-collected " + n + " card(s) to foundations.");
            resolveTurn(0);
        }
    }

    /* ---------- turn resolution / end ---------- */
    function endGame(winner, reason) {
        state.phase = "over"; state.winner = winner; state.reason = reason;
        sel = null; clearTimers();
        if (!online && !cheated) {
            const score = foundTotal(state.boards[0]) * 10 + (winner === 0 ? 100 : 0);
            if (score > readBest()) writeBest(score);
        }
        const me = getMySeat();
        const big = $("[data-overbig]");
        if (winner === "draw") { big.textContent = "Draw"; big.className = "sol-big draw"; }
        else if (winner === me) { big.textContent = "You win!"; big.className = "sol-big win"; }
        else { big.textContent = "You lose"; big.className = "sol-big lose"; }
        $("[data-overtitle]").textContent = winner === "draw" ? "It's a draw" : (winner === me ? "Victory" : "Defeat");
        $("[data-overreason]").textContent = reason + (cheated ? " (cheats were used — score not saved)" : "");
        $("[data-overscores]").textContent = "Foundations — " + (playerName || "You") + ": " + foundTotal(state.boards[me]) + "/52 · " + opponentName() + ": " + foundTotal(state.boards[1 - me]) + "/52.";
        overOpen = true;
        render();
    }
    function endCompare() {
        const f0 = foundTotal(state.boards[0]), f1 = foundTotal(state.boards[1]);
        const winner = f0 > f1 ? 0 : f1 > f0 ? 1 : "draw";
        endGame(winner, "Both players ran out of moves.");
    }
    function resolveTurn(seat) {
        const b = state.boards[seat], o = state.boards[1 - seat];
        if (foundTotal(b) === 52) { endGame(seat, nameOf(seat) + " completed all four foundations."); return; }
        if (!hasAnyMove(b) || b.moves > 900) b.stuck = true;
        if (!hasAnyMove(o) || o.moves > 900) o.stuck = true;
        if (b.stuck && o.stuck) { endCompare(); return; }
        state.turn = o.stuck ? seat : 1 - seat;
    }

    /* ---------- actions (host authoritative) ---------- */
    function describeMove(seat, cards, t) {
        const c = cards[0];
        const label = rankLabel(c.r) + (isRed(c.s) ? "♥♦"[c.s - 1] : "♠♣"[c.s === 0 ? 0 : 1]);
        const dest = t.z === "found" ? "the foundation" : "column " + (t.c + 1);
        return nameOf(seat) + " moved " + label + (cards.length > 1 ? " +" + (cards.length - 1) : "") + " to " + dest + ".";
    }
    function applyAction(action, actorTransport) {
        if (!state) return;
        const seat = online ? (actorTransport === 0 ? state.seats.host : 1 - state.seats.host) : actorTransport;
        if (action.type === "restart") { newRound(); publish(); return; }
        if (action.type === "cheat") { if (!online && seat === 0 && state.phase === "playing") doCheat(action.kind); publish(); return; }
        if (state.phase !== "playing" || seat !== state.turn) return;
        const b = state.boards[seat];
        if (b.stuck) return;

        if (action.type === "draw") {
            if (!b.stock.length) return;
            if (!online && seat === 0) pushHistory();
            const c = b.stock.pop(); c.up = true; b.waste.push(c);
            b.moves++; state.last[seat] = nameOf(seat) + " drew a card.";
            resolveTurn(seat); publish(); return;
        }
        if (action.type === "recycle") {
            if (!canRecycle(b)) return;
            if (!online && seat === 0) pushHistory();
            b.stock = b.waste.reverse(); b.waste = [];
            for (const c of b.stock) c.up = false;
            b.passes++; b.moves++; state.last[seat] = nameOf(seat) + " recycled the waste.";
            resolveTurn(seat); publish(); return;
        }
        if (action.type === "move") {
            const f = action.from, t = action.to;
            let cards, srcCol = -1, srcIdx = -1;
            if (f.z === "waste") {
                if (!b.waste.length) return;
                cards = [b.waste[b.waste.length - 1]];
            } else if (f.z === "col") {
                const col = b.cols[f.c];
                if (f.i == null || f.i < 0 || f.i >= col.length || !col[f.i].up) return;
                for (let j = f.i; j < col.length - 1; j++) {
                    const a = col[j], bb = col[j + 1];
                    if (!a.up || !bb.up || bb.r !== a.r - 1 || isRed(bb.s) === isRed(a.s)) return;
                }
                cards = col.slice(f.i); srcCol = f.c; srcIdx = f.i;
            } else return;
            const head = cards[0];
            if (t.z === "col") {
                if (srcCol === t.c) return;
                const dest = b.cols[t.c], onto = dest.length ? dest[dest.length - 1] : null;
                if (!b.wild && !canTableau(head, onto)) return;
            } else if (t.z === "found") {
                if (cards.length !== 1) return;
                const pile = b.found[t.f], top = pile.length ? pile[pile.length - 1] : null;
                if (!b.wild && !canFoundation(head, top)) return;
            } else return;
            if (!online && seat === 0) pushHistory();
            if (f.z === "waste") b.waste.pop();
            else { b.cols[srcCol].splice(srcIdx); flipTop(b.cols[srcCol]); }
            if (t.z === "col") for (const c of cards) b.cols[t.c].push(c);
            else b.found[t.f].push(cards[0]);
            b.wild = false;
            b.moves++; state.last[seat] = describeMove(seat, cards, t);
            resolveTurn(seat); publish(); return;
        }
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online && state && state.phase === "playing" && state.turn === 1) scheduleBot();
    }
    function scheduleBot() {
        if (botTimer) { clearTimeout(botTimer); timers = timers.filter((x) => x !== botTimer); botTimer = 0; }
        if (paused || !state || state.phase !== "playing" || state.turn !== 1) return;
        const delay = 650 + Math.random() * 550;
        botDue = Date.now() + delay;
        botTimer = later(() => { botTimer = 0; botDue = 0; botTurn(); }, delay);
    }
    function botTurn() {
        if (!state || state.phase !== "playing" || state.turn !== 1) return;
        if (paused) { scheduleBot(); return; }
        const b = state.boards[1];
        const a = botChoose(b);
        if (!a) { b.stuck = true; state.last[1] = "Bot is stuck."; resolveTurn(1); publish(); return; }
        applyAction(a, 1);
    }

    /* ---------- flow ---------- */
    function newRound() {
        clearTimers();
        paused = false; pausedAt = 0; overOpen = false;
        levelNum++;
        const seed = (Math.random() * 0xffffffff) >>> 0;
        const deal = makeSolvableDeal(seed);
        const mk = () => ({
            cols: deal.cols.map((col) => col.map((c) => ({ s: c.s, r: c.r, up: c.up }))),
            stock: deal.stock.map((c) => ({ s: c.s, r: c.r, up: false })),
            waste: [], found: [[], [], [], []], passes: 0, moves: 0, stuck: false, wild: false,
        });
        const hostSeat = online ? (Math.random() < 0.5 ? 0 : 1) : 0;
        const first = Math.random() < 0.5 ? 0 : 1;
        state = { v: 1, seed, level: levelNum, seats: { host: hostSeat }, turn: first, first, phase: "playing", winner: null, reason: "", boards: [mk(), mk()], last: ["", ""] };
        sel = null; cursor = -1; history = []; cheated = false;
        hide(ovOver);
        const me = getMySeat();
        flash("Level " + levelNum + ": you are Player " + (me + 1) + ". " + (first === me ? "You start!" : opponentName() + " starts!"), 3600);
    }

    /* ---------- local interaction helpers ---------- */
    function canInteract() {
        if (!state || state.phase !== "playing") return false;
        if (paused || helpOpen || cheatsOpen) return false;
        if (state.turn !== getMySeat()) { flash("Wait for your turn."); return false; }
        return true;
    }
    function selectCol(ci, idx) {
        const b = myBoard(), col = b.cols[ci];
        if (idx < 0 || idx >= col.length) return;
        if (!col[idx].up) { flash("That card is face down."); return; }
        for (let j = idx; j < col.length - 1; j++) {
            const a = col[j], bb = col[j + 1];
            if (!a.up || !bb.up || bb.r !== a.r - 1 || isRed(bb.s) === isRed(a.s)) { flash("A run must descend in alternating colors."); return; }
        }
        sel = { src: "col", col: ci, idx, cards: col.slice(idx) };
        render();
    }
    function selectWaste() {
        const b = myBoard();
        if (!b.waste.length) return;
        if (sel && sel.src === "waste") sel = null;
        else sel = { src: "waste", col: -1, idx: -1, cards: [b.waste[b.waste.length - 1]] };
        render();
    }
    function tryDropToCol(ci) {
        if (!sel) return false;
        const b = myBoard();
        if (sel.src === "col" && sel.col === ci) { sel = null; render(); return true; }
        const dest = b.cols[ci], onto = dest.length ? dest[dest.length - 1] : null;
        if (!b.wild && !canTableau(sel.cards[0], onto)) { flash("That column cannot take these cards."); return false; }
        const from = sel.src === "waste" ? { z: "waste" } : { z: "col", c: sel.col, i: sel.idx };
        sel = null;
        submitAction({ type: "move", from, to: { z: "col", c: ci } });
        return true;
    }
    function tryDropToFound(fi) {
        if (!sel) return false;
        const b = myBoard();
        if (sel.cards.length !== 1) { flash("Only a single card can go to a foundation."); return false; }
        const pile = b.found[fi], top = pile.length ? pile[pile.length - 1] : null;
        if (!b.wild && !canFoundation(sel.cards[0], top)) { flash("Foundations build up by suit from the Ace."); return false; }
        const from = sel.src === "waste" ? { z: "waste" } : { z: "col", c: sel.col, i: sel.idx };
        sel = null;
        submitAction({ type: "move", from, to: { z: "found", f: fi } });
        return true;
    }
    function sendTopToFoundation(from) {
        const b = myBoard();
        let card;
        if (from.z === "waste") { if (!b.waste.length) return; card = b.waste[b.waste.length - 1]; }
        else { const col = b.cols[from.c]; if (!col.length || !col[col.length - 1].up) return; card = col[col.length - 1]; from.i = col.length - 1; }
        const fi = b.wild ? 0 : findFoundation(b, card);
        if (fi < 0) { flash("That card cannot reach a foundation yet."); return; }
        submitAction({ type: "move", from, to: { z: "found", f: fi } });
    }
    function autoFoundation() {
        const a = foundationPick(myBoard());
        if (a) submitAction(a); else flash("No card can move to a foundation right now.");
    }
    function columnKey(ci) {
        if (sel) { tryDropToCol(ci); return; }
        const col = myBoard().cols[ci];
        if (col.length && col[col.length - 1].up) selectCol(ci, col.length - 1);
        else flash("That column is empty.");
    }
    function closeTopOverlay() {
        if (helpOpen) { toggleHelp(false); return; }
        if (cheatsOpen) { toggleCheats(false); return; }
        if (paused) { setPaused(false); return; }
        if (!ovOver.hidden) { overOpen = false; render(); return; }
        if (sel) { sel = null; render(); }
    }

    /* ---------- input: click / dblclick / right-click ---------- */
    function handleClick(event) {
        const act = event.target.closest("[data-act]");
        if (act) {
            const a = act.getAttribute("data-act");
            if (a === "draw") { if (!canInteract()) return; sel = null; submitAction({ type: myBoard().stock.length ? "draw" : "recycle" }); return; }
            if (a === "auto") { if (!canInteract()) return; autoFoundation(); return; }
            if (a === "cancel") { sel = null; render(); return; }
            if (a === "opp") { oppOpen = !oppOpen; render(); return; }
            if (a === "new") { setPaused(false); submitAction({ type: "restart" }); return; }
            return;
        }
        const t = event.target;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { setPaused(!paused); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        if (t.closest("[data-restart]")) { setPaused(false); submitAction({ type: "restart" }); return; }
        if (t.closest("[data-overclose]")) { overOpen = false; render(); return; }
        const ch = t.closest("[data-cheat]");
        if (ch) { if (!online && state && state.phase === "playing") { submitAction({ type: "cheat", kind: ch.getAttribute("data-cheat") }); } return; }

        const zoneEl = t.closest("[data-zone]");
        if (!zoneEl) { if (sel) { sel = null; render(); } return; }
        if (!canInteract()) return;
        const z = zoneEl.getAttribute("data-zone");
        if (z === "stock") { sel = null; submitAction({ type: myBoard().stock.length ? "draw" : "recycle" }); return; }
        if (z === "waste") { selectWaste(); return; }
        if (z === "found") { tryDropToFound(+zoneEl.getAttribute("data-fi")); return; }
        if (z === "colbase") { const ci = +zoneEl.getAttribute("data-col"); if (sel) tryDropToCol(ci); return; }
        if (z === "col") {
            const ci = +zoneEl.getAttribute("data-col"), idx = +zoneEl.getAttribute("data-idx");
            if (sel) {
                const same = sel.src === "col" && sel.col === ci;
                if (same && sel.idx === idx) { sel = null; render(); return; }
                if (!same && tryDropToCol(ci)) return;
            }
            selectCol(ci, idx);
            return;
        }
    }
    function handleDbl(event) {
        const zoneEl = event.target.closest("[data-zone]");
        if (!zoneEl || !canInteract()) return;
        const z = zoneEl.getAttribute("data-zone");
        if (z === "waste") sendTopToFoundation({ z: "waste" });
        else if (z === "col") sendTopToFoundation({ z: "col", c: +zoneEl.getAttribute("data-col") });
    }
    function handleContext(event) {
        const zoneEl = event.target.closest("[data-zone]");
        if (!zoneEl) return;
        const z = zoneEl.getAttribute("data-zone");
        if (z === "waste" || z === "col") {
            event.preventDefault();
            if (!canInteract()) return;
            if (z === "waste") sendTopToFoundation({ z: "waste" });
            else sendTopToFoundation({ z: "col", c: +zoneEl.getAttribute("data-col") });
        }
    }
    function onKey(e) {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const k = e.key, lower = k.toLowerCase(), c = e.code || "";
        /* priority: help -> cheats -> pause -> Escape -> game actions */
        if (helpOpen) {
            if (lower === "h" || k === "?" || k === "Escape" || k === "Enter") { e.preventDefault(); toggleHelp(false); }
            return;
        }
        if (cheatsOpen) {
            if (lower === "c" || k === "Escape" || k === "Enter") { e.preventDefault(); toggleCheats(false); }
            return;
        }
        if (lower === "p" || c === "KeyP") { e.preventDefault(); setPaused(!paused); return; }
        if (paused) {
            if (k === "Escape" || k === "Enter") { e.preventDefault(); setPaused(false); }
            return;
        }
        if (k === "Escape") { closeTopOverlay(); return; }
        if (tag === "BUTTON" && (k === " " || k === "Enter")) return;
        if (!state) return;
        if (lower === "h" || k === "?") { e.preventDefault(); toggleHelp(); return; }
        if (lower === "c" && !online) { e.preventDefault(); toggleCheats(); return; }
        if (lower === "r" || lower === "n") { e.preventDefault(); setPaused(false); submitAction({ type: "restart" }); return; }
        if (lower === "v") { e.preventDefault(); oppOpen = !oppOpen; render(); return; }
        if (state.phase !== "playing") return;
        if (lower === "u" && !online) { e.preventDefault(); submitAction({ type: "cheat", kind: "undo" }); return; }
        if (state.turn !== getMySeat()) return;
        if (lower === "d" || k === " ") { e.preventDefault(); sel = null; submitAction({ type: myBoard().stock.length ? "draw" : "recycle" }); return; }
        if (lower === "a") { e.preventDefault(); autoFoundation(); return; }
        if (lower === "f" || k === "ArrowUp") {
            e.preventDefault();
            if (sel && sel.cards.length === 1) { const fi = myBoard().wild ? 0 : findFoundation(myBoard(), sel.cards[0]); if (fi >= 0) tryDropToFound(fi); else flash("That card cannot reach a foundation yet."); }
            else flash("Select a single card first.");
            return;
        }
        if (k >= "1" && k <= "7") { e.preventDefault(); columnKey(+k - 1); return; }
        if (k === "ArrowLeft") { e.preventDefault(); cursor = cursor <= 0 ? 6 : cursor - 1; render(); return; }
        if (k === "ArrowRight") { e.preventDefault(); cursor = cursor >= 6 ? 0 : cursor + 1; render(); return; }
        if (k === "Enter" || k === "ArrowDown") { e.preventDefault(); if (cursor >= 0) columnKey(cursor); return; }
    }
    function onResize() { if (state) fitScale(); }

    root.addEventListener("click", handleClick);
    root.addEventListener("dblclick", handleDbl);
    root.addEventListener("contextmenu", handleContext);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);

    /* ---------- boot / networking ---------- */
    if (online) {
        const offRoom = room.onRoom((next) => { roomData = next; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            newRound(); publish();
            const offAct = room.onAction((a) => applyAction(a, 1));
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = room.onState((next) => { state = next; sel = null; render(); });
            if (typeof offState === "function") offs.push(offState);
            render();
        }
    } else {
        newRound(); publish();
    }

    return {
        destroy() {
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("dblclick", handleDbl);
            root.removeEventListener("contextmenu", handleContext);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
            offs.forEach((fn) => { try { fn(); } catch (e) { } });
        },
    };
}
