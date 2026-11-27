/* ==== GAME: screw-out.js ==== */
/*
  Screw Out - template v2 (export const META + export function mount).
  1. Simpan file ini sebagai games/screw-out.js (id META = nama file).
  2. Jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "screw-out",
    name: "Screw Out",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Unscrew stacked panels into a 3-color tray before time runs out. Solo, vs bot, or online duel.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="10" width="36" height="26" rx="4" fill="#6366f1"/><circle cx="17" cy="20" r="5.5" fill="#ef4444"/><path d="M14.5 20h5M17 17.5v5" stroke="#7f1d1d" stroke-width="1.8"/><circle cx="31" cy="20" r="5.5" fill="#f59e0b"/><path d="M28.5 20h5M31 17.5v5" stroke="#92400e" stroke-width="1.8"/><circle cx="17" cy="30" r="5.5" fill="#3b82f6"/><path d="M14.5 30h5M17 27.5v5" stroke="#1e3a8a" stroke-width="1.8"/><circle cx="31" cy="30" r="5.5" fill="#10b981"/><path d="M28.5 30h5M31 27.5v5" stroke="#065f46" stroke-width="1.8"/><path d="M40 40l6 6" stroke="#fbbf24" stroke-width="4"/></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
};

/* =============================================================
   PURE LOGIC (no DOM) - deterministic, serializable, testable.
   ============================================================= */
const SCREW_HEX = { r: "#ef4444", a: "#f59e0b", b: "#3b82f6", g: "#10b981", v: "#a78bfa" };
const SCREW_NAME = { r: "red", a: "amber", b: "blue", g: "green", v: "violet" };
const PANEL_HEX = ["#818cf8", "#f472b6", "#34d399", "#fbbf24", "#22d3ee", "#a78bfa", "#fb7185", "#4ade80"];
const SEAT_HEX = ["#6366f1", "#ec4899"];
const TRAY = 3;        /* tray capacity: 3 distinct colors */
const CLEAR_N = 3;     /* 3 same-color screws clear a slot */
const LEVEL_COUNT = 3;
const W = 400, H = 300;

const clone = (o) => JSON.parse(JSON.stringify(o));
const randSeed = () => (Math.random() * 0xffffffff) >>> 0;
const randInt = (n) => Math.floor(Math.random() * n);

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const ri = (rnd, a, b) => { a = Math.round(a); b = Math.round(b); if (b < a) b = a; return a + Math.floor(rnd() * (b - a + 1)); };
const pick = (rnd, arr) => arr[ri(rnd, 0, arr.length - 1)];
function shuffle(rnd, arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = ri(rnd, 0, i); const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
}

/* ---------- shapes ---------- */
function shapePoints(p) {
    const { x, y, w, h } = p, cx = x + w / 2, cy = y + h / 2;
    if (p.shape === "hex") return [[x + .25 * w, y], [x + .75 * w, y], [x + w, cy], [x + .75 * w, y + h], [x + .25 * w, y + h], [x, cy]];
    if (p.shape === "diamond") return [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
    if (p.shape === "octa") {
        const t = Math.min(w, h) * .24;
        return [[x + t, y], [x + w - t, y], [x + w, y + t], [x + w, y + h - t], [x + w - t, y + h], [x + t, y + h], [x, y + h - t], [x, y + t]];
    }
    return null;
}
function inside(p, x, y) {
    if (p.shape === "ellipse") {
        const rx = p.w / 2, ry = p.h / 2, dx = (x - (p.x + rx)) / rx, dy = (y - (p.y + ry)) / ry;
        return dx * dx + dy * dy <= 1;
    }
    const pts = shapePoints(p);
    if (!pts) return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
    let ok = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
    }
    return ok;
}

/* ---------- board rules ---------- */
function isAccessible(st, pi, si) {
    const p = st.panels[pi];
    if (!p || !p.alive || !p.screws[si] || p.screws[si].out) return false;
    const s = p.screws[si];
    for (const q of st.panels) if (q.alive && q.z > p.z && inside(q, s.x, s.y)) return false;
    return true;
}
function accessibleScrews(st) {
    const out = [];
    st.panels.forEach((p, pi) => p.screws.forEach((s, si) => { if (isAccessible(st, pi, si)) out.push({ pi, si, screw: s }); }));
    return out;
}
const isLevelClear = (st) => st.panels.every((p) => !p.alive);
function isStuck(st) {
    if (isLevelClear(st)) return false;
    if (st.slots.length < TRAY) return false;
    const acc = accessibleScrews(st);
    if (!acc.length) return true;
    return acc.every((a) => !st.slots.some((sl) => sl.c === a.screw.c));
}

/* Screw removal + slot management. Tight screws need two picks:
   first pick loosens, second pick extracts into the tray. */
function applyPick(prev, pi, si) {
    const s = clone(prev);
    const fail = (reason) => ({ ok: false, reason, state: prev, loosened: false, cleared: false, removedPanel: false, levelClear: isLevelClear(prev), stuck: isStuck(prev) });
    const p = s.panels[pi];
    if (!p || !p.alive || !p.screws[si] || p.screws[si].out) return fail("gone");
    if (!isAccessible(s, pi, si)) return fail("buried");
    const sc = p.screws[si];
    let slot = s.slots.find((sl) => sl.c === sc.c);
    if (!slot && s.slots.length >= TRAY) return fail("full");
    if (sc.tight && !sc.loose) {
        sc.loose = true;
        return { ok: true, state: s, loosened: true, cleared: false, removedPanel: false, levelClear: false, stuck: isStuck(s) };
    }
    sc.out = true;
    let cleared = false;
    if (slot) {
        slot.n++;
        if (slot.n >= CLEAR_N) { s.slots = s.slots.filter((sl) => sl !== slot); cleared = true; }
    } else s.slots.push({ c: sc.c, n: 1 });
    const removedPanel = p.screws.every((x) => x.out);
    if (removedPanel) p.alive = false;
    return { ok: true, state: s, loosened: false, cleared, removedPanel, levelClear: isLevelClear(s), stuck: isStuck(s) };
}

/* ---------- solvable random level generator ----------
   Panels are placed in REMOVAL order with descending z, so a panel's
   screws can only ever be covered by panels removed EARLIER. Colors
   are assigned in triples along that canonical solution (with safe
   swaps inside disjoint triple-pairs), so the tray never holds more
   than 2 colors while following the solution => always solvable.
   Every candidate is still verified by a full simulated solve. */
function placeScrew(rnd, p, all) {
    for (let k = 0; k < 80; k++) {
        const sx = ri(rnd, p.x + 13, p.x + p.w - 13), sy = ri(rnd, p.y + 13, p.y + p.h - 13);
        if (!inside(p, sx, sy) || !inside(p, sx - 11, sy) || !inside(p, sx + 11, sy) || !inside(p, sx, sy - 11) || !inside(p, sx, sy + 11)) continue;
        if (all.some((q) => (sx - q.x) * (sx - q.x) + (sy - q.y) * (sy - q.y) < 27 * 27)) continue;
        const s = { x: sx, y: sy, c: "r", out: false, tight: false, loose: false };
        p.screws.push(s); all.push(s);
        return true;
    }
    return false;
}
function buildCandidate(rnd, level, versus) {
    const n = Math.min(6, 3 + level + (versus ? 1 : 0));
    const colorsN = level === 0 ? 3 : level === 1 ? 4 : 5;
    const palette = shuffle(rnd, ["r", "a", "b", "g", "v"]).slice(0, colorsN);
    const pattern = pick(rnd, ["scatter", "cascade", "center", "columns"]);
    const shapes = level === 0 ? ["rect", "rect", "ellipse", "octa"] : ["rect", "ellipse", "hex", "diamond", "octa"];
    const panels = [], all = [];
    for (let k = 0; k < n; k++) {
        const big = n <= 4;
        const w = ri(rnd, big ? 110 : 90, big ? 200 : 170);
        const h = ri(rnd, big ? 70 : 60, big ? 140 : 120);
        let x, y;
        if (pattern === "cascade") {
            const f = k / (n - 1);
            x = 14 + f * (W - 28 - w) + ri(rnd, -18, 18); y = 14 + f * (H - 28 - h) + ri(rnd, -14, 14);
        } else if (pattern === "center") {
            x = (W - w) / 2 + ri(rnd, -55, 55); y = (H - h) / 2 + ri(rnd, -40, 40);
        } else if (pattern === "columns") {
            x = 14 + (k % 2) * (W / 2 - 20) + ri(rnd, 0, Math.max(0, W / 2 - w + 10)); y = ri(rnd, 14, H - 14 - h);
        } else { x = ri(rnd, 14, W - 14 - w); y = ri(rnd, 14, H - 14 - h); }
        x = Math.round(Math.max(10, Math.min(W - 10 - w, x)));
        y = Math.round(Math.max(10, Math.min(H - 10 - h, y)));
        let color = pick(rnd, PANEL_HEX);
        if (panels.length && color === panels[panels.length - 1].color) color = PANEL_HEX[(PANEL_HEX.indexOf(color) + 1) % PANEL_HEX.length];
        const p = { shape: pick(rnd, shapes), x, y, w, h, z: n - k, color, alive: true, screws: [] };
        const target = ri(rnd, 2, level < 2 ? 4 : 5);
        for (let t = 0; t < target; t++) placeScrew(rnd, p, all);
        if (p.screws.length < 2) return null;
        panels.push(p);
    }
    let total = all.length, guard = 0;
    while (total % 3 && guard < 60) {
        const p = pick(rnd, panels);
        if (p.screws.length < 6 && placeScrew(rnd, p, all)) total++;
        guard++;
    }
    if (total % 3) return null;
    if (level >= 1) for (const s of all) s.tight = rnd() < (level === 1 ? 0.14 : 0.2);
    const seq = [];
    panels.forEach((p, pi) => p.screws.forEach((_, si) => seq.push([pi, si])));
    const triples = total / 3, cols = [];
    for (let t = 0; t < triples; t++) { const c = pick(rnd, palette); cols.push(c, c, c); }
    for (let pair = 0; pair < triples - 1; pair += 2) {
        for (let k = 0; k < 2; k++) {
            if (rnd() < (k === 0 ? 0.6 : 0.3)) {
                const i = ri(rnd, pair * 3, pair * 3 + 2), j = ri(rnd, pair * 3 + 3, pair * 3 + 5);
                const t = cols[i]; cols[i] = cols[j]; cols[j] = t;
            }
        }
    }
    seq.forEach(([pi, si], i) => { panels[pi].screws[si].c = cols[i]; });
    const probe = { panels };
    let buried = 0;
    panels.forEach((p, pi) => p.screws.forEach((_, si) => { if (!isAccessible(probe, pi, si)) buried++; }));
    const time = Math.round((60 + 30 * level) * (versus ? 1.5 : 1));
    return { panels, solution: seq, time, buried };
}
function validateSolution(lv) {
    let st = { panels: clone(lv.panels), slots: [] };
    for (const [pi, si] of lv.solution) {
        for (let k = 0; k < 2; k++) {
            const res = applyPick(st, pi, si);
            if (!res.ok) return false;
            st = res.state;
            if (st.panels[pi].screws[si].out) break;
        }
        if (isStuck(st)) return false;
    }
    return isLevelClear(st) && st.slots.length === 0;
}
function fallbackLevel(level, versus) {
    const defs = [["#818cf8", 30, 25, 200, 110, 3, "r"], ["#34d399", 170, 35, 200, 115, 2, "a"], ["#fbbf24", 80, 160, 250, 115, 1, "b"]];
    const panels = [], seq = [];
    defs.forEach(([color, x, y, w, h, z, c], pi) => {
        const p = { shape: "rect", x, y, w, h, z, color, alive: true, screws: [] };
        for (let k = 0; k < 3; k++) {
            p.screws.push({ x: x + 30 + k * 60, y: y + 30 + k * 25, c, out: false, tight: false, loose: false });
            seq.push([pi, k]);
        }
        panels.push(p);
    });
    return { panels, solution: seq, time: Math.round((60 + 30 * level) * (versus ? 1.5 : 1)), buried: 0 };
}
function genLevel(seed, level, versus) {
    for (let attempt = 0; attempt < 24; attempt++) {
        const rnd = mulberry32((seed + attempt * 7919) >>> 0);
        const lv = buildCandidate(rnd, level, versus);
        if (lv && validateSolution(lv) && (level === 0 || lv.buried > 0 || attempt >= 12)) return lv;
    }
    return fallbackLevel(level, versus);
}

/* ---------- match state + reducer ---------- */
function loadLevel(s, li) {
    const lv = genLevel((s.seed + li * 7919) >>> 0, li, s.versus);
    s.level = li; s.panels = lv.panels; s.slots = []; s.solution = lv.solution;
    s.timeLeft = lv.time; s.hintsLeft = 3; s.hint = null;
}
function initialGame(opts) {
    const online = !!opts.online;
    return {
        v: 1, rev: 0, seed: opts.seed >>> 0, online,
        phase: "ready", versus: online, level: 0,
        seatOfHost: online ? (opts.seat || 0) & 1 : 0,
        turn: 0, scores: [0, 0],
        names: online ? ["Player 1", "Player 2"] : ["You", "Bot"],
        panels: [], slots: [], solution: [],
        timeLeft: 60, frozen: false, cheated: false, autoPlay: false,
        hintsLeft: 3, hint: null, reject: null,
        winner: null, endReason: "", msg: "Pick a mode to begin.", msgSeq: 0,
    };
}
function bestMove(s) {
    const acc = accessibleScrews(s);
    const legal = acc.filter((a) => s.slots.some((sl) => sl.c === a.screw.c) || s.slots.length < TRAY);
    if (!legal.length) return null;
    let best = null, bs = -1e9;
    for (const a of legal) {
        const slot = s.slots.find((sl) => sl.c === a.screw.c);
        let sc = Math.random() * 6;
        if (slot) sc += slot.n === 2 ? 100 : 40;
        else {
            sc += 8 + acc.filter((x) => x.screw.c === a.screw.c).length * 3 - s.slots.length * 6;
        }
        const p = s.panels[a.pi];
        const left = p.screws.filter((x) => !x.out).length;
        if (left === 1 && !(a.screw.tight && !a.screw.loose)) sc += 26;
        if (a.screw.tight && !a.screw.loose) sc -= 7;
        for (const q of s.panels) {
            if (!q.alive || q.z >= p.z) continue;
            for (const qs of q.screws) if (!qs.out && inside(p, qs.x, qs.y)) sc += 4;
        }
        if (sc > bs) { bs = sc; best = a; }
    }
    return best ? { pi: best.pi, si: best.si } : null;
}
const cleanName = (x) => String(x || "").split("<").join("").split(">").join("").trim().slice(0, 16);

function reduce(prev, action, actor) {
    if (!prev || !action) return prev;
    let s = clone(prev);
    const bump = () => { s.rev = (prev.rev || 0) + 1; return s; };
    const say = (t) => { s.msg = t; s.msgSeq = (s.msgSeq || 0) + 1; };
    const privileged = actor === -1 || actor === s.seatOfHost;
    const nameOf = (seat) => s.names[seat] || "Player " + (seat + 1);
    const endMatch = (reasonKey) => {
        s.phase = "over"; s.endReason = reasonKey;
        if (s.versus) s.winner = s.scores[0] > s.scores[1] ? 0 : s.scores[1] > s.scores[0] ? 1 : -1;
        else s.winner = reasonKey === "clear" ? 0 : null;
    };
    const afterBoardChange = (seat) => {
        if (isLevelClear(s)) {
            if (seat >= 0) s.scores[seat] += 20;
            if (s.level + 1 >= LEVEL_COUNT) endMatch("clear");
            else { s.phase = "between"; say("Level " + (s.level + 1) + " clear - next stack incoming..."); }
            return true;
        }
        if (isStuck(s)) { endMatch("stuck"); return true; }
        return false;
    };

    switch (action.type) {
        case "start": {
            if (!privileged || (s.phase !== "ready" && s.phase !== "over")) return prev;
            s.versus = s.online ? true : !!action.versus;
            s.seed = (action.seed !== undefined ? action.seed : prev.seed) >>> 0;
            s.turn = s.versus ? (action.first || 0) & 1 : 0;
            s.scores = [0, 0]; s.cheated = false; s.autoPlay = false; s.frozen = false;
            s.winner = null; s.endReason = ""; s.reject = null;
            if (s.online && action.name) s.names[s.seatOfHost] = cleanName(action.name) || "Player " + (s.seatOfHost + 1);
            loadLevel(s, 0);
            s.phase = "playing";
            say(s.versus ? nameOf(s.turn) + " won the coin toss and starts." : "Level 1 - unscrew every panel.");
            return bump();
        }
        case "pick": {
            if (s.phase !== "playing" || actor < 0) return prev;
            if (s.online && typeof action.name === "string" && actor !== s.seatOfHost) {
                const nm = cleanName(action.name); if (nm) s.names[actor] = nm;
            }
            if (s.versus && actor !== s.turn) { say("Wait - it is " + nameOf(s.turn) + "'s turn."); return bump(); }
            const pi = action.pi | 0, si = action.si | 0;
            const res = applyPick(s, pi, si);
            if (!res.ok) {
                s.reject = { pi, si, reason: res.reason, seq: ((prev.reject && prev.reject.seq) || 0) + 1 };
                if (res.reason === "buried") say("That screw is hidden under a panel above it.");
                else if (res.reason === "full") say("Tray is full - only " + s.slots.map((sl) => SCREW_NAME[sl.c] || sl.c).join(", ") + " screws fit now.");
                return bump();
            }
            s = res.state;
            const seat = s.versus ? actor : 0;
            s.scores[seat] += res.loosened ? 2 : 10;
            if (res.cleared) s.scores[seat] += 15;
            if (res.removedPanel) s.scores[seat] += 25;
            if (afterBoardChange(seat)) return bump();
            if (s.versus) s.turn = 1 - s.turn;
            const parts = [];
            if (res.loosened) parts.push("Tight screw loosened - one more turn.");
            if (res.cleared) parts.push("Three of a kind - slot cleared!");
            if (res.removedPanel) parts.push("Panel popped loose!");
            if (!parts.length) parts.push(s.versus ? nameOf(s.turn) + "'s turn." : "Keep unscrewing.");
            say(parts.join(" "));
            return bump();
        }
        case "tick": {
            if (!privileged || s.phase !== "playing" || s.frozen) return prev;
            s.timeLeft--;
            if (s.timeLeft <= 0) { s.timeLeft = 0; endMatch("time"); }
            return bump();
        }
        case "next": {
            if (!privileged || s.phase !== "between") return prev;
            loadLevel(s, s.level + 1);
            s.turn = s.versus ? (action.first || 0) & 1 : 0;
            s.phase = "playing";
            say(s.versus ? "Level " + (s.level + 1) + " - " + nameOf(s.turn) + " starts this stack." : "Level " + (s.level + 1) + " - unscrew every panel.");
            return bump();
        }
        case "pause": {
            if (!privileged || s.online || s.phase !== "playing") return prev;
            s.phase = "paused"; return bump();
        }
        case "resume": {
            if (!privileged || s.online || s.phase !== "paused") return prev;
            s.phase = "playing"; return bump();
        }
        case "restart": {
            if (!privileged) return prev;
            const next = initialGame({ seed: action.seed !== undefined ? action.seed : prev.seed, online: s.online, seat: action.seat !== undefined ? action.seat : prev.seatOfHost });
            next.rev = (prev.rev || 0) + 1;
            return next;
        }
        case "hint": {
            if (s.online || s.phase !== "playing") return prev;
            if (s.versus && actor !== s.turn) return prev;
            if (s.hintsLeft <= 0) { say("No hints left this level."); return bump(); }
            const mv = bestMove(s);
            if (!mv) { say("No legal move to hint."); return bump(); }
            s.hintsLeft--;
            s.hint = { pi: mv.pi, si: mv.si, seq: ((prev.hint && prev.hint.seq) || 0) + 1 };
            say("Hint: the glowing screw is a good turn.");
            return bump();
        }
    }

    /* ---- cheats (offline only) ---- */
    if (s.online || !privileged) return prev;
    if (action.type.indexOf("cheat") !== 0) return prev;
    if (s.phase !== "playing" && s.phase !== "paused") return prev;
    s.cheated = true;
    switch (action.type) {
        case "cheatTime": s.timeLeft = Math.min(999, s.timeLeft + 30); say("Cheat: +30 seconds."); break;
        case "cheatFreeze": s.frozen = !s.frozen; say(s.frozen ? "Cheat: timer frozen." : "Cheat: timer resumed."); break;
        case "cheatTray": s.slots = []; say("Cheat: tray emptied."); break;
        case "cheatPop": {
            let top = null;
            for (const p of s.panels) if (p.alive && (!top || p.z > top.z)) top = p;
            if (!top) return prev;
            top.screws.forEach((sc) => { sc.out = true; sc.loose = true; });
            top.alive = false;
            say("Cheat: top panel popped.");
            afterBoardChange(-1);
            break;
        }
        case "cheatSolve": {
            let target = null;
            for (const [pi, si] of s.solution) if (!s.panels[pi].screws[si].out) { target = s.panels[pi].screws[si]; break; }
            if (!target) return prev;
            target.loose = true; target.out = true;
            const slot = s.slots.find((sl) => sl.c === target.c);
            if (slot) { slot.n++; if (slot.n >= CLEAR_N) s.slots = s.slots.filter((sl) => sl !== slot); }
            else if (s.slots.length < TRAY) s.slots.push({ c: target.c, n: 1 });
            const p = s.panels.find((pp) => pp.screws.indexOf(target) >= 0);
            if (p && p.screws.every((x) => x.out)) p.alive = false;
            say("Cheat: one screw auto-solved.");
            afterBoardChange(-1);
            break;
        }
        case "cheatSkip": {
            s.panels.forEach((p) => { p.alive = false; p.screws.forEach((sc) => { sc.out = true; sc.loose = true; }); });
            say("Cheat: level skipped.");
            afterBoardChange(-1);
            break;
        }
        case "cheatAuto": s.autoPlay = !s.autoPlay; say(s.autoPlay ? "Cheat: auto-play ON." : "Cheat: auto-play OFF."); break;
        case "cheatXray": say("Cheat: x-ray toggled."); break;
        default: return prev;
    }
    return bump();
}

/* =============================================================
   MOUNT - UI, physics FX, input, networking.
   ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const authority = !online || room.isHost;
    let roomData = (room && room.room) || null;
    let state = null;
    let destroyed = false;
    let tickTimer = null;
    let showHelp = false, showCheat = false, lastVersus = false;

    /* ---------- first-run internal help ---------- */
    const HELP_KEY = "screwOutHelpSeen";
    let seenHelp = true;
    try { seenHelp = localStorage.getItem(HELP_KEY) === "1"; } catch (_) { seenHelp = true; }
    showHelp = !seenHelp;
    if (!seenHelp) {
        try { localStorage.setItem(HELP_KEY, "1"); } catch (_) { /* storage blocked */ }
    }

    const mySeat = () => (online ? (room.isHost ? (state ? state.seatOfHost : 0) : 1 - (state ? state.seatOfHost : 0)) : 0);
    const isTouch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const icon = (name) => iconSVG(name, { size: 14 });

    /* ---------- shell: single HUD bar, fill board, sibling pad ---------- */
    root.innerHTML = `
<style>
.so-app{width:100%;height:100%;min-height:0;margin:0 auto;padding:2px;display:flex;flex-direction:column;gap:8px;color:#0f172a;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.so-app *,.so-app *::before,.so-app *::after{box-sizing:border-box}
.so-app [hidden]{display:none!important}
.so-app :focus-visible{outline:2px solid #6366f1;outline-offset:2px}
.so-hud{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.so-chip{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:4px 9px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#475569;white-space:nowrap}
.so-chip b{color:#0f172a;font-variant-numeric:tabular-nums}
.so-chip svg{width:12px;height:12px}
.so-chip .so-dot{width:7px;height:7px;border-radius:50%;flex:none}
.so-chip[data-hud-chip="status"] .so-dot{background:#6366f1}
.so-chip.turn{border-color:currentColor;background:#fff}
.so-bar{width:52px;height:4px;border-radius:2px;background:#eef2f7;overflow:hidden;flex:none}
.so-bar i{display:block;height:100%;background:#6366f1;transition:width .4s linear}
.so-bar.warn i{background:#ef4444}
.so-cheat-tag{font-size:10px;color:#b45309;background:#fef3c7;border-radius:999px;padding:3px 8px;border:1px solid #fde68a}
.so-spacer{flex:1 1 auto;min-width:4px}
.so-btn{font:inherit;font-size:11px;padding:6px 10px;min-height:32px;border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:9px;cursor:pointer}
.so-btn:hover:not(:disabled){background:#f1f5f9;color:#0f172a}
.so-btn:disabled{opacity:.4;cursor:default}
.so-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}
.so-btn.ghost{background:#fff;color:#334155;border-color:#e2e8f0}
.so-icon-btn{display:inline-flex;align-items:center;gap:5px}
.so-icon-btn svg{flex:none;display:block}
.so-btn-label{white-space:nowrap}
.so-notice{flex:none;min-height:17px;text-align:center;font-size:12px;color:#64748b}
.so-app.game-fill>.so-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;position:relative;display:flex;flex-direction:column;min-width:0;padding:0;border:1px solid #eef2f7;border-radius:12px;background:#f8fafc;background-image:radial-gradient(#e2e8f0 1px,transparent 1px);background-size:16px 16px;overflow:hidden}
.so-play{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;position:relative}
.so-svg{display:block;width:100%;flex:1 1 auto;min-height:0;touch-action:manipulation;cursor:pointer}
.so-panel{filter:drop-shadow(0 2px 2px rgba(15,23,42,.16));transition:opacity .4s}
.so-panel.gone{opacity:0;pointer-events:none}
.so-screw{cursor:pointer}
.so-screw:hover .so-head{filter:brightness(1.12)}
.so-screw.out{opacity:0;transform:rotate(540deg) scale(.15);transform-box:fill-box;transform-origin:center;transition:transform .45s ease-in,opacity .4s ease-in;pointer-events:none}
.so-screw.loose .so-cross{transform:rotate(45deg);transform-box:fill-box;transform-origin:center}
.so-screw.hinted .so-head{animation:so-hint 1.2s ease 2}
@keyframes so-hint{0%,100%{filter:none}50%{filter:brightness(1.5) drop-shadow(0 0 5px #f59e0b)}}
.so-ghost{cursor:pointer;opacity:.7}
.so-xray .so-ghost{opacity:1}
.so-xray .so-ghost .so-gdot{transform:scale(1.7);transform-box:fill-box;transform-origin:center}
.so-selring{animation:so-spin 7s linear infinite;transform-box:fill-box;transform-origin:center;pointer-events:none}
@keyframes so-spin{to{transform:rotate(360deg)}}
.so-tray{flex:none;display:flex;gap:10px;justify-content:center;padding:8px 0 2px;position:relative}
.so-slot{width:76px;min-height:40px;border:1.5px dashed #cbd5e1;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:5px;padding:4px;background:#fff}
.so-slot.full{border-style:solid;border-color:#94a3b8}
.so-slot i{width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(15,23,42,.35)}
.so-slot.pop{animation:so-pop .4s ease}
@keyframes so-pop{50%{transform:scale(1.12)}}
.so-part{position:absolute;width:7px;height:7px;border-radius:50%;pointer-events:none;z-index:3}
.so-shake{animation:so-shake .3s ease}
@keyframes so-shake{30%{transform:translateX(-5px)}70%{transform:translateX(5px)}}
.so-pad{display:none;gap:8px;justify-content:center;flex:none}
.so-app.so-touch .so-pad{display:flex}
.so-pad button{height:44px;min-width:44px;border:1px solid #e2e8f0;background:#fff;border-radius:12px;color:#334155;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0 10px}
.so-pad button:active{background:#f1f5f9}
.so-pad .so-pad-pick{flex:1;max-width:170px;background:#0f172a;color:#fff;border-color:#0f172a;gap:7px;font-size:13px;font-weight:600}
.so-pad .so-pad-pick:disabled{background:#94a3b8;border-color:#94a3b8}
.so-pad svg{width:18px;height:18px}
.so-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(248,250,252,.9);backdrop-filter:blur(3px);border-radius:12px}
.so-card{display:flex;flex-direction:column;gap:10px;width:min(440px,100%);max-height:100%;overflow:hidden;padding:16px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.08)}
.so-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.so-head h3{margin:0;font-size:17px;color:#0f172a}
.so-head h3.win{color:#10b981}
.so-head h3.lose{color:#ef4444}
.so-card p{margin:0;font-size:13px;color:#64748b;line-height:1.5}
.so-stats,.so-cheats,.so-help{flex:1 1 auto;min-height:0;overflow:auto}
.so-score-line{font-size:14px;color:#0f172a;font-weight:600}
.so-row{display:flex;gap:8px;flex-wrap:wrap}
.so-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;flex-wrap:wrap;margin-top:2px}
.so-note{font-size:11px;color:#b45309}
.so-help b{display:block;margin:10px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
.so-help b:first-child{margin-top:0}
.so-help ol{margin:0;padding-left:18px;font-size:12.5px;color:#475569;line-height:1.55}
.so-keys{font-size:12px;color:#475569;line-height:1.8}
.so-kbd{display:inline-block;padding:1px 5px;border:1px solid #e2e8f0;border-bottom-width:2px;border-radius:5px;background:#f1f5f9;font:inherit}
.so-cheats .so-cl{display:flex;flex-direction:column;gap:6px}
.so-cheats .so-btn{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fff;color:#334155;border-color:#e2e8f0;font-weight:500;text-align:left}
.so-cheats .so-btn.on{border-color:#6366f1;color:#6366f1;background:#eef2ff}
@media (prefers-reduced-motion:reduce){.so-app *{animation:none!important;transition:none!important}}

/* --- layout overrides last (beat design polish + pointer:coarse 44px) --- */
@media (max-width:640px){
.so-app.game-fill>.so-board:not(:has(.so-ov:not([hidden]))){aspect-ratio:4/3;flex:0 0 auto}
.so-app.game-fill>.so-board:has(.so-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.so-app{gap:6px}
.so-app .so-hud{gap:5px}
.so-app .so-hud .so-chip{padding:4px 6px;font-size:9px;min-height:0}
.so-app .so-hud .so-chip[data-hud-chip="status"],.so-app .so-hud .so-chip[data-hud-chip="hints"]{display:none}
.so-app .so-hud .so-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.so-app .so-hud .so-btn-label,.so-app .so-hud .so-spacer{display:none}
.so-app .so-board .so-ov{padding:8px}
.so-app .so-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.so-app .so-stats,.so-app .so-cheats,.so-app .so-help{scrollbar-width:none}
.so-app .so-stats::-webkit-scrollbar,.so-app .so-cheats::-webkit-scrollbar,.so-app .so-help::-webkit-scrollbar{display:none}
.so-app .so-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid #e2e8f0}
.so-app .so-note{display:none}
}
@media (pointer:coarse){
.so-app .so-hud .so-btn{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.so-app .so-card .so-btn{min-height:44px}
}
</style>
<div class="game-app so-app game-fill" data-so${isTouch ? " so-touch" : ""}>
  <div class="so-hud">
    <span class="so-chip">LV <b data-hud="level">1</b>/${LEVEL_COUNT}</span>
    <span class="so-chip">TIME <b data-hud="time">60</b>s <span class="so-bar" data-bar><i data-fill style="width:100%"></i></span></span>
    <span class="so-chip" data-score0 hidden><i class="so-dot"></i><span data-name0>You</span>&nbsp;<b data-pts0>0</b></span>
    <span class="so-chip" data-score1 hidden><i class="so-dot"></i><span data-name1>Bot</span>&nbsp;<b data-pts1>0</b></span>
    <span class="so-chip" data-hud-chip="status"><i class="so-dot"></i><span data-status>Ready</span></span>
    <span class="so-chip" data-hud-chip="hints">HINT <b data-hud="hints">3</b></span>
    <span class="so-cheat-tag" data-cheattag hidden>cheated</span>
    <span class="so-spacer"></span>
    <button class="so-btn so-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${icon("helpCircle")}<span class="so-btn-label">Help</span></button>
    <button class="so-btn so-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${icon("wrench")}<span class="so-btn-label">Cheats</span></button>
    <button class="so-btn so-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${icon("pause")}<span class="so-btn-label">Pause</span></button>
    <button class="so-btn so-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${icon("refresh")}<span class="so-btn-label">Restart</span></button>
    <button class="so-btn so-icon-btn" type="button" data-hint aria-label="Hint" title="Hint (N)">${icon("lightbulb")}<span class="so-btn-label">Hint</span></button>
    <button class="so-btn so-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${icon("logOut")}<span class="so-btn-label">Exit game</span></button>
  </div>
  <div class="so-notice" data-msg aria-live="polite">Pick a mode to begin.</div>
  <section class="game-panel so-board" data-board>
    <div class="so-play">
      <svg class="so-svg" data-boardsvg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Screw Out board"></svg>
      <div class="so-tray" data-tray></div>
    </div>

    <div class="so-ov" data-ov="ready">
      <div class="so-card">
        <div class="so-head"><h3>Screw Out</h3></div>
        <div class="so-stats">
          <p>Turn screws that are not covered by a higher panel. The tray holds three colors - the third screw of a color clears its slot. Free every panel before time runs out. If the tray fills with colors you cannot feed, you are stuck.</p>
          <p data-seatinfo hidden></p>
        </div>
        <div class="so-foot"><span class="so-note">Press H for the guide</span><div class="so-row" data-readybtns></div></div>
      </div>
    </div>

    <div class="so-ov" data-ov="over" hidden>
      <div class="so-card">
        <div class="so-head"><h3 data-over-title>Game over</h3></div>
        <div class="so-stats">
          <div class="so-score-line" data-over-score hidden></div>
          <p data-over-reason></p>
        </div>
        <div class="so-foot"><span class="so-note">Press R to play again</span><div class="so-row" data-overbtns></div></div>
      </div>
    </div>

    <div class="so-ov" data-ov="pause" hidden>
      <div class="so-card">
        <div class="so-head"><h3>Paused</h3></div>
        <div class="so-stats"><p>The clock, bot and level timers are frozen.</p></div>
        <div class="so-foot"><span class="so-note">Press P or Esc to resume</span><button class="so-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="so-ov" data-ov="cheat" hidden>
      <div class="so-card">
        <div class="so-head"><h3>Cheat workshop</h3><button class="so-btn" type="button" data-cheat-close aria-label="Close cheats">Close</button></div>
        <div class="so-cheats">
          <div class="so-cl">
            <button class="so-btn" type="button" data-act="cheatTime"><span>+30 seconds</span><span>time</span></button>
            <button class="so-btn" type="button" data-act="cheatFreeze" data-cfreeze><span>Freeze timer</span><span data-cfreeze-state>off</span></button>
            <button class="so-btn" type="button" data-act="cheatTray"><span>Empty the tray</span><span>tray</span></button>
            <button class="so-btn" type="button" data-act="cheatSolve"><span>Auto-solve one screw</span><span>+1</span></button>
            <button class="so-btn" type="button" data-act="cheatPop"><span>Pop the top panel</span><span>boom</span></button>
            <button class="so-btn" type="button" data-act="cheatSkip"><span>Skip this level</span><span>next</span></button>
            <button class="so-btn" type="button" data-act="cheatAuto" data-cauto><span>Auto-play (bot drives you)</span><span data-cauto-state>off</span></button>
            <button class="so-btn" type="button" data-act="xray" data-cxray><span>X-ray buried screws</span><span data-cxray-state>off</span></button>
          </div>
          <p class="so-note">Offline only. Using any cheat tags this run as cheated; cheats are disabled in online duels.</p>
        </div>
        <div class="so-foot"><span class="so-note">Press C or Esc to close</span><button class="so-btn ghost" type="button" data-cheat-close>Close</button></div>
      </div>
    </div>

    <div class="so-ov" data-ov="help" hidden>
      <div class="so-card">
        <div class="so-head"><h3>How to play</h3><button class="so-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="so-help">
          <div>
            <b>Desktop</b>
            <ol>
              <li>Click a screw to unscrew it. Only screws <b>not covered</b> by a higher panel can turn - faint dots mark the buried ones.</li>
              <li>Wheel or <span class="so-kbd">&larr;</span><span class="so-kbd">&rarr;</span> select, <span class="so-kbd">Enter</span>/<span class="so-kbd">Space</span> unscrew, <span class="so-kbd">1</span>-<span class="so-kbd">9</span> quick pick.</li>
            </ol>
            <b>Mobile</b>
            <ol>
              <li>Tap screws directly, or use the pad below the board: arrows to select, <b>Unscrew</b> to turn, bulb for a hint.</li>
              <li>Use the HUD buttons for Help, Cheats, Pause, Restart, Hint and Exit.</li>
            </ol>
          </div>
          <div>
            <b>Rules</b>
            <ol>
              <li>Every screw lands in the tray. The tray holds <b>3 colors</b>; the <b>3rd screw</b> of a color clears its slot.</li>
              <li>Remove all screws of a panel and it pops loose. Screws with a <b>dashed ring</b> are tight: one turn loosens, a second extracts.</li>
              <li>Tray full and only fresh colors reachable? You are <b>stuck</b>. Clear all ${LEVEL_COUNT} levels before the timer empties.</li>
              <li>Vs bot / online: a coin toss decides who starts; players alternate turns and share the tray. Points: screw +10, loosen +2, trio +15, panel +25, level +20.</li>
            </ol>
            <b>Shortcuts</b>
            <div class="so-keys"><span class="so-kbd">H</span> help &nbsp; <span class="so-kbd">C</span> cheats &nbsp; <span class="so-kbd">P</span> pause &nbsp; <span class="so-kbd">R</span> restart &nbsp; <span class="so-kbd">N</span> hint &nbsp; <span class="so-kbd">Esc</span> close</div>
          </div>
        </div>
        <div class="so-foot"><span class="so-note">Press H to reopen this guide</span><button class="so-btn primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
  <div class="so-pad">
    <button type="button" data-act="pad-prev" aria-label="Previous screw" title="Previous screw">${icon("arrowLeft")}</button>
    <button type="button" class="so-pad-pick" data-act="pad-pick" data-padpick aria-label="Unscrew selected screw">${icon("wrench")}<span>Unscrew</span></button>
    <button type="button" data-act="pad-next" aria-label="Next screw" title="Next screw">${icon("arrowRight")}</button>
    <button type="button" data-act="hint" data-padhint aria-label="Hint" title="Hint (N)">${icon("lightbulb")}</button>
  </div>
</div>`;

    const $ = (sel) => root.querySelector(sel);
    const appEl = $("[data-so]");
    const svgEl = $("[data-boardsvg]");
    const trayEl = $("[data-tray]");
    const noticeEl = $("[data-msg]");
    const barEl = $("[data-bar]");
    const fillEl = $("[data-fill]");
    const statusEl = $("[data-status]");
    const ov = {
        ready: $('[data-ov="ready"]'), over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'), help: $('[data-ov="help"]'),
    };
    const readyBtns = $("[data-readybtns]");
    const overBtns = $("[data-overbtns]");
    const seatInfo = $("[data-seatinfo]");
    const hud = { level: $('[data-hud="level"]'), time: $('[data-hud="time"]'), hints: $('[data-hud="hints"]') };
    const scoreEls = [
        { chip: $("[data-score0]"), dot: $("[data-score0] .so-dot"), name: $("[data-name0]"), pts: $("[data-pts0]") },
        { chip: $("[data-score1]"), dot: $("[data-score1] .so-dot"), name: $("[data-name1]"), pts: $("[data-pts1]") },
    ];
    const clipId = "so-clip-" + Math.random().toString(36).slice(2, 8);

    const view = { key: "", prev: null, panelEls: new Map(), screwEls: new Map(), sel: null, hintSeq: 0, rejectSeq: 0, xray: false };

    /* ---------- pause-aware timer anchors ---------- */
    let scheduleSeq = 0;
    const scheduled = new Map();
    let deferred = [];
    let timeFrozen = false;
    let pauseStart = 0, pauseOffset = 0;
    const perfNow = () => (pauseStart ? pauseStart : performance.now()) - pauseOffset;
    const hasLater = (key) => scheduled.has(key) || deferred.some((t) => t.key === key);

    function cancelLater(key) {
        const rec = scheduled.get(key);
        if (rec) { clearTimeout(rec.id); scheduled.delete(key); }
        deferred = deferred.filter((t) => t.key !== key);
    }
    function later(fn, ms, key) {
        if (key !== undefined) cancelLater(key);
        const idKey = key === undefined ? ++scheduleSeq : key;
        if (timeFrozen) { deferred.push({ key: idKey, fn, wait: Math.max(0, ms) }); return idKey; }
        const id = setTimeout(() => {
            scheduled.delete(idKey);
            if (!destroyed && !timeFrozen) fn();
        }, ms);
        scheduled.set(idKey, { id, due: Date.now() + ms, fn });
        return idKey;
    }
    function freezeTimers() {
        if (timeFrozen) return;
        timeFrozen = true;
        pauseStart = performance.now();
        const now = Date.now();
        for (const [key, rec] of scheduled) {
            clearTimeout(rec.id);
            deferred.push({ key, fn: rec.fn, wait: Math.max(0, rec.due - now) });
        }
        scheduled.clear();
    }
    function thawTimers() {
        if (!timeFrozen) return;
        if (pauseStart) pauseOffset += performance.now() - pauseStart;
        pauseStart = 0;
        timeFrozen = false;
        const queue = deferred;
        deferred = [];
        for (const t of queue) later(t.fn, t.wait, t.key);
    }
    function syncFreeze() {
        const freeze = showHelp || showCheat || (!!state && state.phase === "paused");
        if (freeze) freezeTimers(); else thawTimers();
    }

    /* ---------- board building ---------- */
    function shapeMarkup(p, cx, cy) {
        const attrs = ' fill="' + p.color + '" fill-opacity=".92" stroke="#ffffff66" stroke-width="1.5"';
        if (p.shape === "ellipse") return '<ellipse cx="' + (p.x + p.w / 2 - cx) + '" cy="' + (p.y + p.h / 2 - cy) + '" rx="' + p.w / 2 + '" ry="' + p.h / 2 + '"' + attrs + "/>";
        const pts = shapePoints(p);
        if (pts) return '<polygon points="' + pts.map((q) => (q[0] - cx).toFixed(1) + "," + (q[1] - cy).toFixed(1)).join(" ") + '"' + attrs + "/>";
        return '<rect x="' + (p.x - cx) + '" y="' + (p.y - cy) + '" width="' + p.w + '" height="' + p.h + '" rx="10"' + attrs + "/>";
    }
    function screwMarkup(sc, pi, si) {
        const hex = SCREW_HEX[sc.c] || "#e5e7eb";
        return (
            '<g class="so-screw" data-screw data-pi="' + pi + '" data-si="' + si + '">' +
            '<circle cx="' + sc.x + '" cy="' + sc.y + '" r="15" fill="transparent"/>' +
            (sc.tight ? '<circle cx="' + sc.x + '" cy="' + sc.y + '" r="12" fill="none" stroke="#0f172a88" stroke-width="1.2" stroke-dasharray="2.5 2.5"/>' : "") +
            '<circle class="so-head" cx="' + sc.x + '" cy="' + sc.y + '" r="9" fill="' + hex + '" stroke="#0f172a55" stroke-width="1.5"/>' +
            '<path class="so-cross" d="M' + (sc.x - 5) + " " + sc.y + "h10M" + sc.x + " " + (sc.y - 5) + 'v10" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round"/>' +
            "</g>"
        );
    }
    function buildBoard() {
        fx.bodies.forEach((b) => b.el.remove()); fx.bodies.length = 0;
        fx.flies.forEach((f) => f.el.remove()); fx.flies.length = 0;
        view.panelEls.clear(); view.screwEls.clear(); view.sel = null;
        let inner = '<defs><clipPath id="' + clipId + '"><rect x="0" y="0" width="' + W + '" height="' + H + '" rx="12"/></clipPath></defs>';
        inner += '<g data-panels></g><g data-ghosts></g><g data-sel></g><g data-fxin clip-path="url(#' + clipId + ')"></g><g data-fxout></g>';
        svgEl.innerHTML = inner;
        const gP = svgEl.querySelector("[data-panels]");
        const order = state.panels.map((_, i) => i).sort((a, b) => state.panels[a].z - state.panels[b].z);
        let html = "";
        for (const pi of order) {
            const p = state.panels[pi];
            html += '<g class="so-panel" data-panel="' + pi + '">' + shapeMarkup(p, 0, 0);
            p.screws.forEach((sc, si) => { html += screwMarkup(sc, pi, si); });
            html += "</g>";
        }
        gP.innerHTML = html;
        svgEl.querySelectorAll("[data-panel]").forEach((el) => view.panelEls.set(parseInt(el.dataset.panel, 10), el));
        svgEl.querySelectorAll(".so-screw").forEach((el) => view.screwEls.set(el.dataset.pi + ":" + el.dataset.si, el));
        svgEl.querySelector("[data-sel]").innerHTML = '<circle class="so-selring" data-selring r="14" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="4 4" opacity="0"/>';
    }

    /* ---------- physics FX (view-only) ---------- */
    const fx = { bodies: [], flies: [], raf: 0, last: 0 };
    function fxKick() { if (!fx.raf) { fx.last = perfNow(); fx.raf = requestAnimationFrame(fxStep); } }
    function fxStep(ts) {
        if (destroyed) { fx.raf = 0; return; }
        const now = perfNow();
        const dt = Math.min(0.033, (now - fx.last) / 1000 || 0.016);
        fx.last = now;
        const gIn = svgEl.querySelector("[data-fxin]");
        for (let i = fx.bodies.length - 1; i >= 0; i--) {
            const b = fx.bodies[i];
            b.life += dt; b.vy += 1150 * dt;
            b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
            const hh = b.hh * Math.abs(Math.cos(b.a)) + b.hw * Math.abs(Math.sin(b.a));
            if (b.y + hh > H - 10) { b.y = H - 10 - hh; b.vy *= -0.36; b.vx *= 0.78; b.va *= 0.7; }
            const hw = b.hw * Math.abs(Math.cos(b.a)) + b.hh * Math.abs(Math.sin(b.a));
            if (b.x - hw < 6) { b.x = 6 + hw; b.vx = Math.abs(b.vx) * 0.6; }
            if (b.x + hw > W - 6) { b.x = W - 6 - hw; b.vx = -Math.abs(b.vx) * 0.6; }
            const op = b.life < 1.25 ? 0.92 : Math.max(0, 0.92 * (1 - (b.life - 1.25) / 0.5));
            b.el.setAttribute("transform", "translate(" + b.x.toFixed(1) + " " + b.y.toFixed(1) + ") rotate(" + ((b.a * 180) / Math.PI).toFixed(1) + ")");
            b.el.setAttribute("opacity", op.toFixed(2));
            if (b.life > 1.75) { b.el.remove(); fx.bodies.splice(i, 1); }
        }
        for (let i = fx.flies.length - 1; i >= 0; i--) {
            const f = fx.flies[i];
            f.t += dt / 0.5;
            const t = Math.min(1, f.t), e = t * t * (3 - 2 * t);
            const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * f.x1 + e * e * f.x2;
            const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * f.y1 + e * e * f.y2;
            f.el.setAttribute("cx", x.toFixed(1)); f.el.setAttribute("cy", y.toFixed(1));
            if (t >= 1) {
                f.el.remove(); fx.flies.splice(i, 1);
                const slot = trayEl.querySelector('[data-slot="' + f.slotIdx + '"]');
                if (slot) { slot.classList.remove("pop"); void slot.offsetWidth; slot.classList.add("pop"); }
            }
        }
        if ((fx.bodies.length || fx.flies.length) && gIn) fx.raf = requestAnimationFrame(fxStep);
        else fx.raf = 0;
    }
    function spawnDebris(p) {
        if (reduceMotion) return;
        const gIn = svgEl.querySelector("[data-fxin]");
        if (!gIn) return;
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.innerHTML = shapeMarkup(p, cx, cy);
        g.setAttribute("transform", "translate(" + cx + " " + cy + ")");
        gIn.appendChild(g);
        fx.bodies.push({ el: g, x: cx, y: cy, hw: p.w / 2, hh: p.h / 2, vx: (Math.random() - 0.5) * 260, vy: -(140 + Math.random() * 180), a: 0, va: (Math.random() - 0.5) * 6, life: 0 });
        fxKick();
    }
    function clientToSvg(cx, cy) {
        const m = svgEl.getScreenCTM();
        if (!m) return { x: W / 2, y: H + 26 };
        const pt = svgEl.createSVGPoint(); pt.x = cx; pt.y = cy;
        const q = pt.matrixTransform(m.inverse());
        return { x: q.x, y: q.y };
    }
    function spawnFly(sc, prevSlots, curSlots) {
        const gOut = svgEl.querySelector("[data-fxout]");
        if (!gOut) return;
        let idx = curSlots.findIndex((sl) => sl.c === sc.c);
        if (idx < 0) idx = prevSlots.findIndex((sl) => sl.c === sc.c);
        if (idx < 0) idx = 0;
        let target = { x: W / 2, y: H + 26 };
        const slotEl = trayEl.querySelector('[data-slot="' + idx + '"]');
        if (slotEl) { const r = slotEl.getBoundingClientRect(); target = clientToSvg(r.left + r.width / 2, r.top + r.height / 2); }
        if (reduceMotion) return;
        const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        el.setAttribute("r", "7"); el.setAttribute("fill", SCREW_HEX[sc.c] || "#fff"); el.setAttribute("stroke", "#0f172a55"); el.setAttribute("stroke-width", "1.5");
        el.setAttribute("cx", sc.x); el.setAttribute("cy", sc.y);
        gOut.appendChild(el);
        fx.flies.push({ el, t: 0, x0: sc.x, y0: sc.y, x1: (sc.x + target.x) / 2, y1: Math.min(sc.y, target.y) - 60, x2: target.x, y2: target.y, slotIdx: idx });
        fxKick();
    }
    function burstSlot(idx, color) {
        if (reduceMotion || !trayEl.children[idx] || !trayEl.children[idx].animate) return;
        const slot = trayEl.children[idx];
        const cx = slot.offsetLeft + slot.offsetWidth / 2, cy = slot.offsetTop + slot.offsetHeight / 2;
        for (let k = 0; k < 8; k++) {
            const sp = document.createElement("span");
            sp.className = "so-part";
            sp.style.background = SCREW_HEX[color] || "#94a3b8";
            sp.style.left = cx + "px"; sp.style.top = cy + "px";
            trayEl.appendChild(sp);
            const dx = (Math.random() - 0.5) * 90, up = 20 + Math.random() * 26;
            const anim = sp.animate(
                [{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(" + dx * 0.6 + "px,-" + up + "px)", opacity: 1, offset: 0.45 }, { transform: "translate(" + dx + "px,46px)", opacity: 0 }],
                { duration: 550 + Math.random() * 250, easing: "cubic-bezier(.2,.7,.3,1)" }
            );
            anim.onfinish = () => sp.remove();
        }
    }
    function shake(el) {
        if (!el) return;
        el.classList.remove("so-shake"); void el.getBoundingClientRect(); el.classList.add("so-shake");
        el.addEventListener("animationend", () => el.classList.remove("so-shake"), { once: true });
    }

    /* ---------- rendering ---------- */
    function orderedAccessible() {
        if (!state) return [];
        return accessibleScrews(state).sort((a, b) => {
            const pa = state.panels[a.pi], pb = state.panels[b.pi];
            return pb.z - pa.z || a.screw.y - b.screw.y || a.screw.x - b.screw.x;
        });
    }
    function updateSelection() {
        const ring = svgEl.querySelector("[data-selring]");
        if (!ring) return;
        const acc = orderedAccessible();
        if (view.sel && !acc.some((a) => a.pi === view.sel.pi && a.si === view.sel.si)) view.sel = null;
        if (!view.sel && acc.length) view.sel = { pi: acc[0].pi, si: acc[0].si };
        if (view.sel && state && state.phase === "playing") {
            const sc = state.panels[view.sel.pi].screws[view.sel.si];
            ring.setAttribute("cx", sc.x); ring.setAttribute("cy", sc.y); ring.setAttribute("opacity", "0.55");
        } else ring.setAttribute("opacity", "0");
    }
    function cycleSelection(d) {
        const acc = orderedAccessible();
        if (!acc.length) return;
        let i = acc.findIndex((a) => view.sel && a.pi === view.sel.pi && a.si === view.sel.si);
        i = (i + d + acc.length) % acc.length;
        view.sel = { pi: acc[i].pi, si: acc[i].si };
        updateSelection();
    }
    function rebuildGhosts() {
        const g = svgEl.querySelector("[data-ghosts]");
        if (!g || !state) return;
        let html = "";
        state.panels.forEach((p, pi) => {
            if (!p.alive) return;
            p.screws.forEach((sc, si) => {
                if (sc.out || isAccessible(state, pi, si)) return;
                const hex = SCREW_HEX[sc.c] || "#e5e7eb";
                html += '<g class="so-ghost" data-screw data-pi="' + pi + '" data-si="' + si + '"><circle class="so-gdot" cx="' + sc.x + '" cy="' + sc.y + '" r="4.5" fill="' + hex + '" fill-opacity=".6"/><circle cx="' + sc.x + '" cy="' + sc.y + '" r="8" fill="none" stroke="' + hex + '" stroke-opacity=".35"/></g>';
            });
        });
        g.innerHTML = html;
    }
    function syncBoard(prev) {
        state.panels.forEach((p, pi) => {
            const pe = view.panelEls.get(pi);
            const was = prev && prev.panels[pi];
            if (!p.alive && pe && !pe.classList.contains("gone")) {
                pe.classList.add("gone");
                if (was && was.alive) spawnDebris(p);
            }
            p.screws.forEach((sc, si) => {
                const el = view.screwEls.get(pi + ":" + si);
                if (!el) return;
                const wsc = was && was.screws[si];
                el.classList.toggle("loose", !!sc.loose && !sc.out);
                if (sc.out && !el.classList.contains("out")) {
                    el.classList.add("out");
                    if (wsc && !wsc.out) spawnFly(sc, prev.slots, state.slots);
                }
            });
        });
        rebuildGhosts();
        updateSelection();
        if (state.hint && state.hint.seq !== view.hintSeq) {
            view.hintSeq = state.hint.seq;
            const el = view.screwEls.get(state.hint.pi + ":" + state.hint.si);
            if (el) {
                el.classList.remove("hinted"); void el.getBoundingClientRect(); el.classList.add("hinted");
                el.addEventListener("animationend", () => el.classList.remove("hinted"), { once: true });
            }
        }
        if (state.reject && state.reject.seq !== view.rejectSeq) {
            view.rejectSeq = state.reject.seq;
            const el = view.screwEls.get(state.reject.pi + ":" + state.reject.si);
            shake(el);
            if (state.reject.reason === "full") shake(trayEl);
        }
    }
    function renderTray(prev) {
        let html = "";
        for (let i = 0; i < TRAY; i++) {
            const sl = state.slots[i];
            html += '<div class="so-slot' + (sl && sl.n >= 2 ? " full" : "") + '" data-slot="' + i + '" title="' + (sl ? SCREW_NAME[sl.c] || "" : "empty") + '">';
            if (sl) for (let k = 0; k < sl.n; k++) html += '<i style="background:' + (SCREW_HEX[sl.c] || "#fff") + '"></i>';
            html += "</div>";
        }
        trayEl.innerHTML = html;
        if (prev && prev.slots) {
            prev.slots.forEach((sl, i) => {
                if (!state.slots.some((x) => x.c === sl.c)) burstSlot(i, sl.c);
                else {
                    const now = state.slots.find((x) => x.c === sl.c);
                    if (now && now.n > sl.n) {
                        const idx = state.slots.indexOf(now);
                        const el = trayEl.querySelector('[data-slot="' + idx + '"]');
                        if (el) el.classList.add("pop");
                    }
                }
            });
        }
    }
    function displayName(seat) {
        if (!state) return "Player " + (seat + 1);
        if (seat === mySeat() && !state.online) return state.names[seat];
        if (seat === mySeat() && online) return state.names[seat] || cleanName(playerName) || "You";
        return state.names[seat] || "Player " + (seat + 1);
    }
    function syncHud() {
        hud.level.textContent = state.level + 1;
        hud.time.textContent = Math.max(0, Math.ceil(state.timeLeft));
        hud.hints.textContent = state.hintsLeft;
        const total = Math.round((60 + 30 * state.level) * (state.versus ? 1.5 : 1));
        fillEl.style.width = Math.max(0, Math.min(100, (state.timeLeft / total) * 100)) + "%";
        barEl.classList.toggle("warn", state.timeLeft < total * 0.25);
        $("[data-cheattag]").hidden = !state.cheated;
        if (state.versus) {
            for (let seat = 0; seat < 2; seat++) {
                const e = scoreEls[seat];
                e.chip.hidden = false;
                e.dot.style.background = SEAT_HEX[seat];
                e.name.textContent = displayName(seat);
                e.pts.textContent = state.scores[seat];
                const active = state.phase === "playing" && state.turn === seat;
                e.chip.classList.toggle("turn", active);
                e.chip.style.color = active ? SEAT_HEX[seat] : "";
            }
        } else {
            scoreEls[0].chip.hidden = false;
            scoreEls[0].dot.style.background = SEAT_HEX[0];
            scoreEls[0].name.textContent = "Score";
            scoreEls[0].pts.textContent = state.scores[0];
            scoreEls[0].chip.classList.remove("turn");
            scoreEls[0].chip.style.color = "";
            scoreEls[1].chip.hidden = true;
        }
        let status = "Ready";
        if (state.phase === "playing") status = state.versus ? (state.turn === mySeat() ? "Your turn" : displayName(state.turn) + " is thinking...") : "Unscrew!";
        else if (state.phase === "paused") status = "Paused";
        else if (state.phase === "between") status = "Level clear!";
        else if (state.phase === "over") status = "Match over";
        else if (state.phase === "ready") status = online ? (room.isHost ? "Lobby - press Start" : "Waiting for host") : "Pick a mode";
        statusEl.textContent = status;
        noticeEl.textContent = state.msg || "";
        /* HUD controls */
        const pbtn = $("[data-pause]");
        pbtn.hidden = online;
        pbtn.disabled = state.phase !== "playing" && state.phase !== "paused";
        const pausedNow = state.phase === "paused";
        const plabel = pbtn.querySelector(".so-btn-label");
        if (plabel) plabel.textContent = pausedNow ? "Resume" : "Pause";
        pbtn.setAttribute("aria-label", pausedNow ? "Resume" : "Pause");
        pbtn.setAttribute("title", pausedNow ? "Resume (P)" : "Pause (P)");
        const picon = pbtn.querySelector("svg");
        if (picon) picon.outerHTML = icon(pausedNow ? "play" : "pause");
        $("[data-cheats]").hidden = online;
        $("[data-restart]").hidden = online && !room.isHost;
        const hintBtn = $("[data-hint]");
        hintBtn.hidden = online;
        hintBtn.disabled = state.phase !== "playing" || (state.versus && state.turn !== mySeat()) || state.hintsLeft <= 0;
        $("[data-padhint]").hidden = online;
        /* cheat overlay states */
        const cf = $("[data-cfreeze]"); cf.classList.toggle("on", state.frozen);
        $("[data-cfreeze-state]").textContent = state.frozen ? "on" : "off";
        const ca = $("[data-cauto]"); ca.classList.toggle("on", state.autoPlay);
        $("[data-cauto-state]").textContent = state.autoPlay ? "on" : "off";
        const cx = $("[data-cxray]"); cx.classList.toggle("on", view.xray);
        $("[data-cxray-state]").textContent = view.xray ? "on" : "off";
        ov.cheat.querySelectorAll(".so-cl .so-btn").forEach((b) => {
            const t = b.dataset.act;
            const toggle = t === "cheatFreeze" || t === "cheatAuto" || t === "xray";
            b.disabled = !toggle && state.phase !== "playing" && state.phase !== "paused";
        });
    }
    function btn(label, act, ghost) {
        return '<button class="so-btn' + (ghost ? " ghost" : "") + '" type="button" data-act="' + act + '">' + label + "</button>";
    }
    function syncOverlays() {
        const suppress = showHelp || showCheat;
        ov.ready.hidden = state.phase !== "ready" || suppress;
        ov.over.hidden = state.phase !== "over" || suppress;
        ov.pause.hidden = state.phase !== "paused" || suppress;
        ov.cheat.hidden = !showCheat || online || showHelp;
        ov.help.hidden = !showHelp;
        if (state.phase === "ready") {
            if (online) {
                seatInfo.hidden = false;
                seatInfo.textContent = "Seats are shuffled: you are Player " + (mySeat() + 1) + ". A coin toss will decide who starts.";
                readyBtns.innerHTML = room.isHost ? btn("Start match", "start-online") + btn("How to play", "help", true) : "<p>Waiting for the host to start...</p>";
            } else {
                seatInfo.hidden = true;
                readyBtns.innerHTML = btn("Solo", "start-solo") + btn("Vs bot", "start-bot", true) + btn("How to play", "help", true);
            }
        }
        if (state.phase === "over") {
            const title = $("[data-over-title]"), reason = $("[data-over-reason]"), scoreLine = $("[data-over-score]");
            let t = "", cls = "";
            if (state.versus) {
                if (state.winner === -1) { t = "It is a draw"; cls = ""; }
                else if (state.winner === mySeat()) { t = "You win!"; cls = "win"; }
                else { t = displayName(state.winner) + " wins"; cls = "lose"; }
                scoreLine.hidden = false;
                scoreLine.textContent = displayName(0) + " " + state.scores[0] + " - " + state.scores[1] + " " + displayName(1);
            } else {
                scoreLine.hidden = false;
                scoreLine.textContent = "Score: " + state.scores[0] + (state.cheated ? " (cheated run)" : "");
                if (state.winner === 0) { t = "All panels dismantled!"; cls = "win"; }
                else { t = state.endReason === "stuck" ? "Stuck!" : "Time is up"; cls = "lose"; }
            }
            title.textContent = t;
            title.className = cls;
            const alive = state.panels.filter((p) => p.alive).length;
            if (state.endReason === "clear") reason.textContent = state.versus ? "Every panel is loose across all " + LEVEL_COUNT + " levels. Final scores decide the duel." : "Three levels, every screw turned. A master of orderly dismantling.";
            else if (state.endReason === "stuck") reason.textContent = "The tray holds " + state.slots.map((sl) => SCREW_NAME[sl.c] || sl.c).join(", ") + " and only fresh colors are reachable on level " + (state.level + 1) + "." + (state.versus ? " Scores decide the duel." : "");
            else reason.textContent = "The clock ran out on level " + (state.level + 1) + " with " + alive + " panel(s) still screwed down." + (state.versus ? " Scores decide the duel." : "");
            if (online) overBtns.innerHTML = room.isHost ? btn("Play again", "start-online") + btn("Back to lobby", "restart", true) : "<p>Waiting for the host to restart...</p>";
            else overBtns.innerHTML = btn("Play again", "again") + btn("Change mode", "restart", true);
        }
    }
    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Connecting...";
            noticeEl.textContent = "Connecting...";
            ov.ready.hidden = showHelp || showCheat;
            ov.over.hidden = true;
            ov.pause.hidden = true;
            ov.cheat.hidden = !showCheat || online;
            ov.help.hidden = !showHelp;
            seatInfo.hidden = true;
            readyBtns.innerHTML = "<p>Waiting for the room state...</p>";
            syncFreeze();
            return;
        }
        const key = state.seed + ":" + state.level + ":" + (state.panels.length ? state.panels[0].z : 0);
        const rebuilt = key !== view.key;
        if (rebuilt) { buildBoard(); view.key = key; view.prev = null; }
        const prev = view.prev;
        syncBoard(prev);
        renderTray(prev);
        syncHud();
        syncOverlays();
        svgEl.classList.toggle("so-xray", view.xray);
        view.prev = clone(state);
        syncFreeze();
    }

    /* ---------- authority drivers (pause-aware) ---------- */
    function driveLocal() {
        if (!authority || !state || destroyed) return;
        if (state.phase === "between" && !hasLater("next")) {
            later(() => {
                if (!destroyed && state && state.phase === "between") applyAction({ type: "next", first: randInt(2) }, -1);
            }, 1400, "next");
        }
        const botTurn = !online && state.versus && state.phase === "playing" && state.turn === 1;
        const autoTurn = state.autoPlay && state.phase === "playing" && (!state.versus || state.turn === 0);
        if ((botTurn || autoTurn) && !hasLater("bot")) {
            later(() => {
                if (destroyed || !state || state.phase !== "playing") return;
                const mv = bestMove(state);
                if (mv) applyAction({ type: "pick", pi: mv.pi, si: mv.si }, state.versus ? state.turn : 0);
            }, botTurn ? 700 + Math.random() * 700 : 380, "bot");
        }
    }
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        driveLocal();
    }
    function applyAction(action, actor) {
        if (!authority || !state || !action || typeof action.type !== "string") return;
        if (online && actor !== -1 && actor !== state.seatOfHost && action.type !== "pick") return;
        const next = reduce(state, action, actor);
        if (next === state) return;
        state = next;
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, online ? state.seatOfHost : 0);
    }

    /* ---------- input ---------- */
    function tryPick(pi, si) {
        if (!state || state.phase !== "playing") return;
        view.sel = { pi, si };
        updateSelection();
        const action = { type: "pick", pi, si };
        if (online) action.name = cleanName(playerName);
        submitAction(action);
    }
    function pickSelected() {
        if (!view.sel) { const acc = orderedAccessible(); if (acc.length) view.sel = { pi: acc[0].pi, si: acc[0].si }; }
        if (view.sel) tryPick(view.sel.pi, view.sel.si);
    }
    function startLocal(versus) {
        lastVersus = versus;
        submitAction({ type: "start", versus, seed: randSeed(), first: randInt(2) });
    }
    function toggleHelp(on) {
        showHelp = typeof on === "boolean" ? on : !showHelp;
        if (showHelp) showCheat = false;
        render();
        appEl.focus?.({ preventScroll: true });
    }
    function toggleCheat(on) {
        if (online) return;
        showCheat = typeof on === "boolean" ? on : !showCheat;
        if (showCheat) showHelp = false;
        render();
        appEl.focus?.({ preventScroll: true });
    }
    function restart() {
        showHelp = showCheat = false;
        if (!online || room.isHost) submitAction({ type: "restart", seed: randSeed(), seat: randInt(2) });
    }
    function togglePause() {
        if (online || !state) return;
        submitAction({ type: state.phase === "paused" ? "resume" : "pause" });
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) { toggleCheat(); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheat(false); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-resume]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) { restart(); return; }
        if (t.closest("[data-hint]")) { if (state && !online) submitAction({ type: "hint" }); return; }
        const screwEl = t.closest("[data-screw]");
        if (screwEl && svgEl.contains(screwEl)) {
            tryPick(parseInt(screwEl.dataset.pi, 10), parseInt(screwEl.dataset.si, 10));
            return;
        }
        if (showHelp || showCheat || !state) return;
        const b = t.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "help") { toggleHelp(); return; }
        if (act === "close-help") { toggleHelp(false); return; }
        if (act === "cheat") { toggleCheat(); return; }
        if (act === "close-cheat") { toggleCheat(false); return; }
        if (act === "xray") { view.xray = !view.xray; submitAction({ type: "cheatXray" }); render(); return; }
        switch (act) {
            case "start-solo": startLocal(false); break;
            case "start-bot": startLocal(true); break;
            case "start-online": submitAction({ type: "start", seed: randSeed(), first: randInt(2), name: cleanName(playerName) }); break;
            case "again": startLocal(lastVersus); break;
            case "restart": restart(); break;
            case "pause": togglePause(); break;
            case "resume": togglePause(); break;
            case "hint": if (!online) submitAction({ type: "hint" }); break;
            case "pad-prev": cycleSelection(-1); break;
            case "pad-next": cycleSelection(1); break;
            case "pad-pick": pickSelected(); break;
            default:
                if (act.indexOf("cheat") === 0 && !online) submitAction({ type: act });
        }
    }
    function onKey(e) {
        if (destroyed || !state) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const c = e.code || "";
        const k = e.key;
        /* priority: help -> cheats -> pause / Escape -> game actions */
        if (c === "KeyH" || k === "F1" || k === "?") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { toggleCheat(); e.preventDefault(); return; }
        if (c === "KeyP" || k === "Escape") {
            if (showHelp) toggleHelp(false);
            else if (showCheat) toggleCheat(false);
            else togglePause();
            e.preventDefault();
            return;
        }
        if (c === "KeyR") { restart(); e.preventDefault(); return; }
        if (showHelp || showCheat) return;
        if (c === "KeyN") { if (!online) { submitAction({ type: "hint" }); e.preventDefault(); } return; }
        if (state.phase === "ready" && k === "Enter") {
            if (!online) startLocal(lastVersus);
            else if (room.isHost) submitAction({ type: "start", seed: randSeed(), first: randInt(2), name: cleanName(playerName) });
            e.preventDefault(); return;
        }
        if (state.phase === "over" && k === "Enter" && (!online || room.isHost)) {
            if (online) submitAction({ type: "start", seed: randSeed(), first: randInt(2), name: cleanName(playerName) });
            else startLocal(lastVersus);
            e.preventDefault(); return;
        }
        if (state.phase !== "playing") return;
        if (k === "ArrowLeft" || k === "ArrowUp") { cycleSelection(-1); e.preventDefault(); return; }
        if (k === "ArrowRight" || k === "ArrowDown") { cycleSelection(1); e.preventDefault(); return; }
        if (k === "Enter" || k === " ") { pickSelected(); e.preventDefault(); return; }
        if (k >= "1" && k <= "9") {
            const acc = orderedAccessible();
            const i = parseInt(k, 10) - 1;
            if (acc[i]) { tryPick(acc[i].pi, acc[i].si); e.preventDefault(); }
        }
    }
    function onWheel(e) {
        if (!state || state.phase !== "playing" || showHelp || showCheat) return;
        e.preventDefault();
        cycleSelection(e.deltaY > 0 ? 1 : -1);
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", onKey);
    svgEl.addEventListener("wheel", onWheel, { passive: false });

    /* ---------- init / networking ---------- */
    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; render(); });
        if (room.isHost) {
            state = initialGame({ seed: randSeed(), online: true, seat: randInt(2) });
            publish();
            room.onAction((action) => { if (destroyed || !action || !state) return; applyAction(action, 1 - state.seatOfHost); });
        } else {
            room.onState((nextState) => { if (destroyed) return; state = nextState; render(); });
        }
    } else {
        state = initialGame({ seed: randSeed(), online: false });
        render();
    }
    if (authority) {
        tickTimer = setInterval(() => {
            if (!destroyed && state && state.phase === "playing" && !showHelp && !showCheat && !timeFrozen) applyAction({ type: "tick" }, -1);
        }, 1000);
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", onKey);
            svgEl.removeEventListener("wheel", onWheel);
            if (tickTimer) clearInterval(tickTimer);
            for (const rec of scheduled.values()) clearTimeout(rec.id);
            scheduled.clear(); deferred = [];
            if (fx.raf) cancelAnimationFrame(fx.raf);
            fx.bodies.length = 0; fx.flies.length = 0;
        },
    };
}
