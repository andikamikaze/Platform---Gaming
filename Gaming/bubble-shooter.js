/* ==== GAME: bubble-shooter.js ==== */
/*
 * Template-compliant module: export META + export mount().
 * Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "bubble-shooter", // harus sama dengan nama file (tanpa .js)
    name: "Bubble Shooter",
    category: "casual",
    catLabel: "Casual",
    desc: "Minimal turn-based bubble duel — outscore your rival and clear the board.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="14" r="6"/><circle cx="31" cy="12" r="6"/><circle cx="38" cy="25" r="6"/><circle cx="13" cy="28" r="6"/><circle cx="25" cy="30" r="6"/><path d="M24 44l-5-8h10z"/></svg>',
    bg: ["#e0e7ff", "#a5b4fc"],
    bestKey: "bubbleShooterBest",
};

/* ---------------- constants ---------------- */
const COLS_A = 10, COLS_B = 9, MAX_ROWS = 16, DANGER_ROW = 15;
const DX = 30, DY = 26, OX = 20, OY = 18;
const R = 13.5, NEW_ROW_EVERY = 6, POP_MIN = 3;
const W = 320, H = 470, SHOOTER_Y = 440, SPEED = 540;
const MIN_A = -Math.PI + 0.12, MAX_A = -0.12;
const PALETTE = ["#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa"];

const colsIn = (row) => (row.off ? COLS_B : COLS_A);
const cellX = (row, c) => OX + c * DX + (row.off ? 15 : 0);
const cellY = (r) => OY + r * DY;
const clampA = (a) => Math.max(MIN_A, Math.min(MAX_A, a));
const cloneRows = (rows) => rows.map((r) => ({ off: r.off, cells: r.cells.slice() }));

/* ---------------- curated levels (no random generator, all solvable) ---------------- */
const CHAR_COLOR = { R: 0, B: 1, G: 2, Y: 3, P: 4 };
const LEVELS = [
    {
        name: "Prism", map: [
            "RRBBGGYYRR",
            "RBBGGYYRR",
            "BBGGYYRRBB",
            "BGGYYRRBB",
            "GGYYRRBBGG",
            ".GYYRRBB.",
        ]
    },
    {
        name: "Columns", map: [
            "RBGYRBGYRB",
            "RBGYRBGYR",
            "RBGYRBGYRB",
            "RBGYRBGYR",
            "RBGYRBGYRB",
        ]
    },
    {
        name: "Bloom", map: [
            "YYYYRRYYYY",
            "YYYRRRYYY",
            "YYRRBBRRYY",
            "YRRBBBRRY",
            "RRBBGGBBRR",
            "RBBGGGBBR",
        ]
    },
];
function buildLevel(idx) {
    return LEVELS[idx].map.map((s, r) => ({
        off: r % 2,
        cells: Array.from(s, (ch) => (ch === "." ? null : CHAR_COLOR[ch])),
    }));
}

/* ---------------- pure grid rules ---------------- */
function neighbors(rows, r, c) {
    const out = [[r, c - 1], [r, c + 1]];
    if (rows[r].off === 0) {
        out.push([r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]);
    } else {
        out.push([r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]);
    }
    return out.filter(
        ([rr, cc]) => rr >= 0 && rr < rows.length && cc >= 0 && cc < colsIn(rows[rr]),
    );
}
function findCluster(rows, r0, c0) {
    const color = rows[r0].cells[c0];
    if (color === null || color === undefined) return [];
    const seen = new Set([r0 + ":" + c0]);
    const out = [[r0, c0]];
    const stack = [[r0, c0]];
    while (stack.length) {
        const cur = stack.pop();
        for (const nb of neighbors(rows, cur[0], cur[1])) {
            const key = nb[0] + ":" + nb[1];
            if (seen.has(key)) continue;
            if (rows[nb[0]].cells[nb[1]] === color) {
                seen.add(key);
                out.push(nb);
                stack.push(nb);
            }
        }
    }
    return out;
}
function findFloating(rows) {
    const seen = new Set();
    const stack = [];
    if (rows.length) {
        for (let c = 0; c < colsIn(rows[0]); c++) {
            if (rows[0].cells[c] !== null) {
                seen.add("0:" + c);
                stack.push([0, c]);
            }
        }
    }
    while (stack.length) {
        const cur = stack.pop();
        for (const nb of neighbors(rows, cur[0], cur[1])) {
            const key = nb[0] + ":" + nb[1];
            if (seen.has(key)) continue;
            if (rows[nb[0]].cells[nb[1]] !== null) {
                seen.add(key);
                stack.push(nb);
            }
        }
    }
    const floating = [];
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < colsIn(rows[r]); c++) {
            if (rows[r].cells[c] !== null && !seen.has(r + ":" + c)) floating.push([r, c]);
        }
    }
    return floating;
}
/* BUG FIX: baris virtual di bawah tumpukan, agar tembakan bisa mendarat
   walau semua baris yang ada masih penuh (kondisi grid awal). */
function rowAt(rows, r) {
    if (r < rows.length) return rows[r];
    const off = rows.length ? rows[rows.length - 1].off ^ 1 : 0;
    return { off, cells: new Array(off ? COLS_B : COLS_A).fill(null) };
}
function ensureRow(rows, r) {
    while (rows.length <= r) {
        const off = rows.length ? rows[rows.length - 1].off ^ 1 : 0;
        rows.push({ off, cells: new Array(off ? COLS_B : COLS_A).fill(null) });
    }
}
function isSupported(rows, r, c) {
    if (r === 0) return true;
    const row = rowAt(rows, r);
    const up = row.off === 0 ? [[r - 1, c - 1], [r - 1, c]] : [[r - 1, c], [r - 1, c + 1]];
    for (const [rr, cc] of up) {
        if (rr >= 0 && rr < rows.length) {
            const u = rows[rr];
            if (cc >= 0 && cc < colsIn(u) && u.cells[cc] !== null) return true;
        }
    }
    if (c > 0 && row.cells[c - 1] !== null) return true;
    if (c < colsIn(row) - 1 && row.cells[c + 1] !== null) return true;
    return false;
}
function nearestCell(rows, x, y) {
    let best = null, bd = Infinity;
    const limit = Math.min(MAX_ROWS, rows.length + 1);
    for (let r = 0; r < limit; r++) {
        const row = rowAt(rows, r);
        for (let c = 0; c < colsIn(row); c++) {
            if (row.cells[c] !== null || !isSupported(rows, r, c)) continue;
            const dx = cellX(row, c) - x, dy = cellY(r) - y;
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = [r, c]; }
        }
    }
    return best;
}
function dangerBubbles(rows) {
    const out = [];
    for (let r = DANGER_ROW; r < rows.length; r++) {
        for (let c = 0; c < colsIn(rows[r]); c++) {
            if (rows[r].cells[c] !== null) out.push([r, c]);
        }
    }
    return out;
}
const gridEmpty = (rows) => rows.every((row) => row.cells.every((v) => v === null));
function colorsPresent(rows) {
    const set = new Set();
    rows.forEach((row) => row.cells.forEach((v) => { if (v !== null) set.add(v); }));
    return Array.from(set);
}

/* ---------------- deterministic shot physics (host-authoritative) ---------------- */
function simulateShot(rows, angle) {
    let x = W / 2, y = SHOOTER_Y - 16;
    let vx = Math.cos(angle) * SPEED, vy = Math.sin(angle) * SPEED;
    const path = [[x, y]];
    const dt = 1 / 120, lim = (2 * R - 2) * (2 * R - 2);
    for (let i = 0; i < 1600; i++) {
        x += vx * dt;
        y += vy * dt;
        if (x < OX + R) { x = OX + R; vx = Math.abs(vx); }
        if (x > W - OX - R + 10) { x = W - OX - R + 10; vx = -Math.abs(vx); }
        let hit = y <= OY + R;
        if (!hit) {
            outer: for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                for (let c = 0; c < colsIn(row); c++) {
                    if (row.cells[c] === null) continue;
                    const dx = cellX(row, c) - x, dy = cellY(r) - y;
                    if (dx * dx + dy * dy < lim) { hit = true; break outer; }
                }
            }
        }
        if (hit || i % 2 === 0) path.push([x, y]);
        if (hit) break;
    }
    return { path, cell: nearestCell(rows, x, y) };
}
function bestWildColor(rows, r, c, fallback) {
    const cand = new Set([fallback]);
    for (const [rr, cc] of neighbors(rows, r, c)) {
        const v = rows[rr].cells[cc];
        if (v !== null) cand.add(v);
    }
    let best = fallback, bestN = -1;
    for (const col of cand) {
        rows[r].cells[c] = col;
        const n = findCluster(rows, r, c).length;
        rows[r].cells[c] = null;
        if (n > bestN) { bestN = n; best = col; }
    }
    return best;
}

/* ---------------- state factory & shot resolution ---------------- */
function freshState() {
    const li = Math.floor(Math.random() * LEVELS.length); // pilih level kurasi, bukan generate acak
    const rows = buildLevel(li);
    const pal = colorsPresent(rows);
    const pick = () => pal[Math.floor(Math.random() * pal.length)];
    const first = Math.random() < 0.5 ? 0 : 1; // coin toss: siapa jalan duluan
    return {
        v: 1,
        phase: "playing",
        levelIdx: li,
        levelName: LEVELS[li].name,
        seats: { host: Math.random() < 0.5 ? 0 : 1 }, // posisi player diacak saat multiplayer
        first,
        turn: first,
        rows,
        loaded: pick(),
        next: pick(),
        scores: [0, 0],
        popped: [0, 0],
        shots: 0,
        sinceRow: 0,
        rowsAdded: 0,
        cheats: { wild: false, freeze: false },
        lastShot: null,
        winner: null,
        reason: "",
    };
}
function resolveShot(st, angle, actor) {
    const sim = simulateShot(st.rows, angle);
    const shot = {
        id: st.shots + 1, seat: actor, angle,
        wild: st.cheats.wild, color: st.loaded,
        path: sim.path, cell: sim.cell,
        pops: [], floats: [], rowAdded: false,
    };
    st.shots += 1;
    st.lastShot = shot;
    if (!sim.cell) {
        st.phase = "over"; st.winner = 1 - actor; st.reason = "jammed";
        return;
    }
    const [r, c] = sim.cell;
    ensureRow(st.rows, r);
    let color = st.loaded;
    if (st.cheats.wild) color = bestWildColor(st.rows, r, c, st.loaded);
    shot.color = color;
    st.rows[r].cells[c] = color;
    const cluster = findCluster(st.rows, r, c);
    if (cluster.length >= POP_MIN) {
        shot.pops = cluster.map(([rr, cc]) => [rr, cc, st.rows[rr].cells[cc]]);
        for (const [rr, cc] of cluster) st.rows[rr].cells[cc] = null;
        st.scores[actor] += cluster.length * 10;
        st.popped[actor] += cluster.length;
        const fl = findFloating(st.rows);
        if (fl.length) {
            shot.floats = fl.map(([rr, cc]) => [rr, cc, st.rows[rr].cells[cc]]);
            for (const [rr, cc] of fl) st.rows[rr].cells[cc] = null;
            st.scores[actor] += fl.length * 20;
            st.popped[actor] += fl.length;
        }
    }
    st.sinceRow += 1;
    if (gridEmpty(st.rows)) {
        st.phase = "over";
        st.winner = st.scores[0] === st.scores[1] ? -1 : st.scores[0] > st.scores[1] ? 0 : 1;
        st.reason = "clear";
        return;
    }
    if (st.sinceRow >= NEW_ROW_EVERY && !st.cheats.freeze) {
        st.sinceRow = 0;
        st.rowsAdded += 1;
        const pal = colorsPresent(st.rows).sort((a, b) => a - b);
        const off = st.rows[0].off ^ 1;
        const n = off ? COLS_B : COLS_A;
        const cells = [];
        for (let cc = 0; cc < n; cc++) cells.push(pal[(cc + st.rowsAdded) % pal.length]);
        st.rows.unshift({ off, cells });
        shot.rowAdded = true;
    }
    if (dangerBubbles(st.rows).length) {
        st.phase = "over"; st.winner = 1 - actor; st.reason = "danger";
        return;
    }
    st.loaded = st.next;
    const pal = colorsPresent(rows = st.rows); // amunisi hanya warna yang masih ada → selalu bisa diselesaikan
    st.next = pal.length ? pal[Math.floor(Math.random() * pal.length)] : 0;
    st.turn = 1 - actor;
}

/* ---------------- bot (AI mode, seat 1) ---------------- */
function botChooseAngle(st) {
    let best = -Math.PI / 2, bestScore = -Infinity;
    for (let a = MIN_A + 0.02; a <= MAX_A - 0.02; a += 0.025) {
        const sim = simulateShot(st.rows, a);
        if (!sim.cell) continue;
        const [r, c] = sim.cell;
        const cl = cloneRows(st.rows);
        ensureRow(cl, r);
        let color = st.loaded;
        if (st.cheats.wild) color = bestWildColor(cl, r, c, st.loaded);
        cl[r].cells[c] = color;
        let s = 0;
        const k = findCluster(cl, r, c);
        if (k.length >= POP_MIN) {
            s += k.length * 10;
            for (const [rr, cc] of k) cl[rr].cells[cc] = null;
            s += findFloating(cl).length * 20;
            if (gridEmpty(cl)) s += st.scores[1] >= st.scores[0] ? 400 : -400;
        } else {
            s += neighbors(cl, r, c).filter(([rr, cc]) => cl[rr].cells[cc] === color).length * 3;
        }
        s -= r * 1.5;
        if (r >= DANGER_ROW - 1) s -= 60;
        if (r >= DANGER_ROW) s -= 10000;
        s += Math.random() * 2;
        if (s > bestScore) { bestScore = s; best = a; }
    }
    return best;
}

/* ================================================================ */
/* mount                                                            */
/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    const dangerY = cellY(DANGER_ROW) + R + 3;

    /* ---- UI-local state (canonical state/engine untouched) ---- */
    let cheatsOpen = false, helpOpen = false, paused = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("bubbleShooterHelpSeen") === "1"; } catch (_) { /* storage blocked */ }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("bubbleShooterHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey) || 0) || 0; } catch (_) { /* storage blocked */ }

    root.innerHTML = `
<div class="game-app bs-app game-fill" data-bs>
<style>
.bs-app{--bs-ink:#0f172a;--bs-mut:#64748b;--bs-line:#e2e8f0;--bs-acc:#6366f1;--bg:#f8fafc;color:var(--bs-ink);gap:10px}
.bs-app [hidden]{display:none!important}
.bs-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.bs-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--bs-line);border-radius:999px;background:#fff;color:var(--bs-mut);white-space:nowrap}
.bs-chip b{color:var(--bs-ink);font-variant-numeric:tabular-nums}
.bs-chip.on{border-color:var(--bs-acc);background:#eef2ff;color:var(--bs-acc)}
.bs-chip.on b{color:var(--bs-acc)}
.bs-chip svg{display:block}
.bs-spacer{flex:1 1 auto}
.bs-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:7px 11px;border:1px solid var(--bs-line);border-radius:9px;background:#fff;color:var(--bs-ink);font:700 10px/1 ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}
.bs-btn:hover{border-color:var(--bs-acc);color:var(--bs-acc)}
.bs-btn.on{border-color:var(--bs-acc);background:#eef2ff;color:var(--bs-acc)}
.bs-btn.primary{background:var(--bs-acc);border-color:var(--bs-acc);color:#fff}
.bs-btn.primary:hover{color:#fff;opacity:.92}
.bs-btn.ghost{background:#fff}
.bs-btn:disabled{opacity:.45;cursor:not-allowed}
.bs-icon-btn svg{flex:none;display:block}
.bs-board{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:320/470;padding:0;border:1px solid var(--bs-line);border-radius:12px;background:#fff;overflow:hidden}
.bs-app.game-fill > .bs-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.bs-svg{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;user-select:none}
.bs-danger{stroke:#fca5a5;stroke-width:1.5;stroke-dasharray:6 6}
.bs-aim{stroke:#94a3b8;stroke-width:2;stroke-dasharray:4 6;stroke-linecap:round}
.bs-trace{stroke:#c7d2fe;stroke-width:2;stroke-dasharray:2 6;stroke-linecap:round;fill:none}
.bs-ghost{fill:none;stroke:#94a3b8;stroke-width:1.5;stroke-dasharray:3 4}
.bs-base{fill:#eef2ff;stroke:#c7d2fe;stroke-width:1.5}
.bs-pop{animation:bsPop .32s ease-out forwards;transform-box:fill-box;transform-origin:center}
@keyframes bsPop{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.6);opacity:0}}
.bs-pad{display:none;gap:8px;width:100%;max-width:360px;margin:0 auto}
.bs-padbtn{flex:1 1 0;min-width:0;min-height:44px;height:52px;border-radius:12px;border:1px solid var(--bs-line);background:#fafafa;font-size:16px;font-weight:600;color:var(--bs-ink);touch-action:none;user-select:none;cursor:pointer}
.bs-padbtn:active{background:#eef2ff}
.bs-fire{flex:2 1 0;background:var(--bs-acc);border-color:var(--bs-acc);color:#fff;letter-spacing:.06em}
.bs-fire:disabled{opacity:.4}
@media (pointer:coarse),(max-width:640px){.bs-pad{display:flex}}
.bs-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(248,250,252,.92)}
.bs-card{display:flex;flex-direction:column;gap:12px;width:min(420px,100%);max-height:100%;padding:16px;border:1px solid var(--bs-line);border-radius:12px;background:#fff;overflow:hidden}
.bs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.bs-head h3{margin:0;font-size:16px;font-weight:700}
.bs-card p{margin:0;font-size:12px;line-height:1.5;color:var(--bs-mut)}
.bs-cheats,.bs-stats,.bs-help{flex:1 1 auto;min-height:0;overflow:auto;display:grid;gap:8px}
.bs-help{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.bs-help b{display:block;margin-bottom:4px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.08em;color:var(--bs-ink);text-transform:uppercase}
.bs-help ul{margin:0 0 10px;padding-left:16px;font-size:11px;line-height:1.7;color:var(--bs-mut)}
.bs-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--bs-line);border-bottom-width:2px;border-radius:5px;background:var(--bg);color:var(--bs-ink);font:inherit}
.bs-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;font-size:13px;cursor:pointer}
.bs-cheatrow input{accent-color:var(--bs-acc);width:18px;height:18px}
.bs-mini{display:flex;gap:8px;flex-wrap:wrap}
.bs-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:none}
.bs-note{margin-right:auto;font-size:10px;line-height:1.4;color:var(--bs-mut)}
.bs :is(button,input):focus-visible{outline:2px solid var(--bs-acc);outline-offset:2px}
@media (max-width:640px){
.bs-app{gap:8px}
.bs-hud{gap:5px}
.bs-ov{padding:8px}
.bs-card{width:100%;height:100%;max-height:100%;padding:12px}
.bs-cheats,.bs-stats,.bs-help{scrollbar-width:none}
.bs-cheats::-webkit-scrollbar,.bs-stats::-webkit-scrollbar,.bs-help::-webkit-scrollbar{display:none}
}
/* --- fill height + mobile refinements (keep last) --- */
@media (pointer:coarse){.bs button:not(:disabled){min-height:44px}}
.bs-app .bs-hud .bs-btn{min-height:32px;padding:5px 9px;font-size:9px}
.bs-app .bs-hud .bs-chip{padding:4px 6px;font-size:9px}
@media (max-width:640px){
.bs-app .bs-hud .bs-chip[data-hud="level"]{display:none}
.bs-app .bs-hud .bs-btn-label,.bs-app .bs-hud .bs-spacer{display:none}
.bs-app.game-fill > .bs-board:not(:has(.bs-ov:not([hidden]))){aspect-ratio:320/470;flex:0 0 auto}
.bs-app.game-fill > .bs-board:has(.bs-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
}
@media (prefers-reduced-motion:reduce){.bs-app *{animation:none!important;transition:none!important}}
</style>
<div class="bs-hud">
  <span class="bs-chip" data-hud="level">—</span>
  <span class="bs-chip" data-chip="0"><span data-hud="name0">P1</span> <b data-hud="score0">0</b></span>
  <span class="bs-chip" data-chip="1"><span data-hud="name1">P2</span> <b data-hud="score1">0</b></span>
  <span class="bs-chip" data-hud="status">Ready</span>
  <span class="bs-chip" data-hud="rowin">Row in ${NEW_ROW_EVERY}</span>
  <span class="bs-chip">NEXT <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle data-hud="next" cx="8" cy="8" r="7" fill="#e2e8f0"/></svg></span>
  <span class="bs-spacer"></span>
  <button class="bs-btn bs-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bs-btn-label">Help</span></button>
  <button class="bs-btn bs-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bs-btn-label">Cheats</span></button>
  <button class="bs-btn bs-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bs-btn-label">Pause</span></button>
  <button class="bs-btn bs-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bs-btn-label">Restart</span></button>
  <button class="bs-btn bs-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bs-btn-label">Exit game</span></button>
</div>
<section class="game-panel bs-board" data-board>
  <svg class="bs-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-el="svg" aria-label="Bubble Shooter board">
    <line class="bs-danger" x1="8" y1="${dangerY}" x2="${W - 8}" y2="${dangerY}"/>
    <g data-el="grid"></g>
    <polyline class="bs-trace" data-el="trace" visibility="hidden"/>
    <line class="bs-aim" data-el="aim" visibility="hidden"/>
    <circle class="bs-ghost" data-el="ghost" r="${R}" visibility="hidden"/>
    <g data-el="fx"></g>
    <circle data-el="proj" r="${R}" visibility="hidden"/>
    <g>
      <rect class="bs-base" x="146" y="${SHOOTER_Y - 4}" width="28" height="22" rx="9"/>
      <circle data-el="loaded" cx="160" cy="${SHOOTER_Y - 16}" r="${R}" fill="#e2e8f0"/>
    </g>
  </svg>
  <div class="bs-ov" data-ov="cheat" hidden>
    <div class="bs-card">
      <div class="bs-head"><h3>Cheats</h3><button class="bs-btn" type="button" data-cheat-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
      <div class="bs-cheats">
        <label class="bs-cheatrow"><span>Wild bubble</span><input type="checkbox" data-cheat="wild"></label>
        <label class="bs-cheatrow"><span>Freeze ceiling</span><input type="checkbox" data-cheat="freeze"></label>
        <label class="bs-cheatrow"><span>Full trajectory</span><input type="checkbox" data-cheat="trace"></label>
        <div class="bs-mini">
          <button type="button" class="bs-btn ghost" data-cheat-act="score">+250 pts</button>
          <button type="button" class="bs-btn ghost" data-cheat-act="clear">Clear bottom row</button>
        </div>
      </div>
      <div class="bs-foot"><span class="bs-note">C toggles · Esc closes</span><button type="button" class="bs-btn" data-cheat-close>Close</button></div>
    </div>
  </div>
  <div class="bs-ov" data-ov="pause" hidden>
    <div class="bs-card">
      <div class="bs-head"><h3>Paused</h3></div>
      <div class="bs-stats"><p>Timers and the bot are frozen. Your turn and score are safe.</p></div>
      <div class="bs-foot">
        <button type="button" class="bs-btn primary" data-resume>Resume</button>
        <button type="button" class="bs-btn ghost" data-restart>Restart</button>
        <button type="button" class="bs-btn ghost" data-exit>Exit game</button>
      </div>
    </div>
  </div>
  <div class="bs-ov" data-ov="result" hidden>
    <div class="bs-card">
      <div class="bs-head"><h3 data-res-title>—</h3></div>
      <div class="bs-stats">
        <p data-res-sub>—</p>
        <p data-res-best>Best 0</p>
      </div>
      <div class="bs-foot">
        <button type="button" class="bs-btn primary" data-restart>Play again</button>
        <button type="button" class="bs-btn ghost" data-exit>Exit game</button>
      </div>
    </div>
  </div>
  <div class="bs-ov" data-ov="help" hidden>
    <div class="bs-card">
      <div class="bs-head"><h3>How to play</h3><button class="bs-btn" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
      <div class="bs-help">
        <div>
          <b>Desktop</b>
          <ul>
            <li>Move the mouse over the board to aim, click to fire.</li>
            <li><span class="bs-kbd">←</span> <span class="bs-kbd">→</span> fine-tune the aim.</li>
            <li><span class="bs-kbd">Space</span> / <span class="bs-kbd">Enter</span> fires.</li>
            <li><span class="bs-kbd">H</span> help · <span class="bs-kbd">C</span> cheats · <span class="bs-kbd">P</span> pause · <span class="bs-kbd">R</span> restart.</li>
          </ul>
          <b>Mobile</b>
          <ul><li>Drag on the board to aim, or use ◀ / FIRE / ▶ below it.</li></ul>
        </div>
        <div>
          <b>Rules</b>
          <ul>
            <li>Match 3+ of the same colour to pop them.</li>
            <li>Disconnected bubbles drop for bonus points.</li>
            <li>A new row is added every ${NEW_ROW_EVERY} shots.</li>
            <li>Cross the dashed danger line and you lose.</li>
            <li>Coin toss decides who shoots first; turns alternate.</li>
          </ul>
        </div>
      </div>
      <div class="bs-foot"><span class="bs-note">Press H to reopen this guide</span><button class="bs-btn primary" type="button" data-help-close>Got it</button></div>
    </div>
  </div>
</section>
<div class="bs-pad" data-padbar>
  <button type="button" class="bs-padbtn" data-pad="left" aria-label="Aim left">◀</button>
  <button type="button" class="bs-padbtn bs-fire" data-pad="fire">FIRE</button>
  <button type="button" class="bs-padbtn" data-pad="right" aria-label="Aim right">▶</button>
</div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-el="svg"]');
    const gridG = $('[data-el="grid"]');
    const aimEl = $('[data-el="aim"]');
    const traceEl = $('[data-el="trace"]');
    const ghostEl = $('[data-el="ghost"]');
    const projEl = $('[data-el="proj"]');
    const fxG = $('[data-el="fx"]');
    const loadedEl = $('[data-el="loaded"]');
    const hud = {
        level: $('[data-hud="level"]'),
        name: [$('[data-hud="name0"]'), $('[data-hud="name1"]')],
        score: [$('[data-hud="score0"]'), $('[data-hud="score1"]')],
        status: $('[data-hud="status"]'),
        rowin: $('[data-hud="rowin"]'),
        next: $('[data-hud="next"]'),
    };
    const chips = [$('[data-chip="0"]'), $('[data-chip="1"]')];
    const ov = {
        cheat: $('[data-ov="cheat"]'),
        pause: $('[data-ov="pause"]'),
        result: $('[data-ov="result"]'),
        help: $('[data-ov="help"]'),
    };
    const resTitle = $("[data-res-title]");
    const resSub = $("[data-res-sub]");
    const resBest = $("[data-res-best]");
    const cheatsBtn = $("[data-cheats]");
    const pauseBtn = $("[data-pause]");
    const padEl = $("[data-padbar]");
    const fireBtn = $('[data-pad="fire"]');
    const wildChk = $('[data-cheat="wild"]');
    const freezeChk = $('[data-cheat="freeze"]');
    const traceChk = $('[data-cheat="trace"]');

    /* ---------------- local (non-canonical) state ---------------- */
    let destroyed = false;
    let angle = -Math.PI / 2;
    let animating = false, awaiting = false;
    let shownRows = null, shownShotId = 0;
    let rafId = 0, botTimer = 0, awaitTimer = 0, holdTimer = 0;
    let botDue = 0, awaitDue = 0, botRemain = 0, awaitRemain = 0;
    let pausedAt = 0, animStart = 0, animElapsed = 0, shotFrame = null, animFrozen = false;
    let traceOn = false, savedBest = false;
    const fxTimers = new Set();
    const unsubs = [];
    const reg = (fn) => { if (typeof fn === "function") unsubs.push(fn); };

    const mySeat = () => {
        if (!online) return 0;
        const hostSeat = state?.seats?.host ?? 0;
        return room.isHost ? hostSeat : 1 - hostSeat;
    };
    const nameFor = (seat) => {
        if (!online) return seat === 0 ? (playerName || "You") : "Bot";
        return "P" + (seat + 1) + (seat === mySeat() ? " · You" : "");
    };
    const canShoot = () =>
        Boolean(state) && state.phase === "playing" &&
        state.turn === mySeat() && !animating && !awaiting &&
        !paused && !helpOpen && !cheatsOpen && !destroyed;

    /* ---------------- rendering ---------------- */
    const bubbleSvg = (x, y, color) =>
        '<circle cx="' + x + '" cy="' + y + '" r="' + R + '" fill="' + PALETTE[color] + '"/>' +
        '<circle cx="' + (x - 4) + '" cy="' + (y - 4.5) + '" r="3.2" fill="#ffffff" opacity=".45"/>';

    function renderGrid(rows) {
        let html = "";
        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < colsIn(rows[r]); c++) {
                const v = rows[r].cells[c];
                if (v !== null) html += bubbleSvg(cellX(rows[r], c), cellY(r), v);
            }
        }
        gridG.innerHTML = html;
    }
    function spawnFx(list, rowsRef) {
        if (!list || !rowsRef) return;
        for (const [r, c, color] of list) {
            if (!rowsRef[r]) continue;
            const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            el.setAttribute("class", "bs-pop");
            el.setAttribute("cx", String(cellX(rowsRef[r], c)));
            el.setAttribute("cy", String(cellY(r)));
            el.setAttribute("r", String(R));
            el.setAttribute("fill", PALETTE[color] ?? "#94a3b8");
            fxG.appendChild(el);
            const id = setTimeout(() => {
                fxTimers.delete(id);
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 340);
            fxTimers.add(id);
        }
    }
    function hideAim() {
        aimEl.setAttribute("visibility", "hidden");
        ghostEl.setAttribute("visibility", "hidden");
        traceEl.setAttribute("visibility", "hidden");
    }
    function drawAim() {
        if (!canShoot()) { hideAim(); return; }
        const cos = Math.cos(angle), sin = Math.sin(angle);
        if (traceOn) {
            aimEl.setAttribute("visibility", "hidden");
            const sim = simulateShot(state.rows, angle);
            traceEl.setAttribute("points", sim.path.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "));
            traceEl.setAttribute("visibility", "visible");
            if (sim.cell) {
                const row = rowAt(state.rows, sim.cell[0]);
                ghostEl.setAttribute("cx", String(cellX(row, sim.cell[1])));
                ghostEl.setAttribute("cy", String(cellY(sim.cell[0])));
                ghostEl.setAttribute("visibility", "visible");
            } else {
                ghostEl.setAttribute("visibility", "hidden");
            }
        } else {
            traceEl.setAttribute("visibility", "hidden");
            aimEl.setAttribute("x1", String(W / 2 + cos * 22));
            aimEl.setAttribute("y1", String(SHOOTER_Y - 16 + sin * 22));
            aimEl.setAttribute("x2", String(W / 2 + cos * 110));
            aimEl.setAttribute("y2", String(SHOOTER_Y - 16 + sin * 110));
            aimEl.setAttribute("visibility", "visible");
            ghostEl.setAttribute("cx", String(W / 2 + cos * 110));
            ghostEl.setAttribute("cy", String(SHOOTER_Y - 16 + sin * 110));
            ghostEl.setAttribute("visibility", "visible");
        }
    }
    function statusText() {
        if (!state) return "Loading…";
        if (state.phase === "over") {
            return state.winner === -1 ? "Draw game" : nameFor(state.winner) + " wins";
        }
        if (awaiting) return "Waiting for host…";
        if (state.shots === 0) return "Coin toss — " + nameFor(state.first) + " starts";
        if (state.turn === mySeat()) return "Your turn";
        return online ? "Waiting for " + nameFor(state.turn) + "…" : "Bot is thinking…";
    }
    function saveBest() {
        if (!META.bestKey || !state || state.phase !== "over" || savedBest) return;
        savedBest = true;
        try {
            const prev = Number(localStorage.getItem(META.bestKey) || 0);
            const mine = state.scores[mySeat()] || 0;
            if (mine > prev) {
                localStorage.setItem(META.bestKey, String(mine));
                best = mine;
            }
        } catch (_) { /* storage unavailable */ }
    }
    function syncCheats() {
        wildChk.checked = Boolean(state?.cheats?.wild);
        freezeChk.checked = Boolean(state?.cheats?.freeze);
        traceChk.checked = traceOn;
    }
    function syncUI() {
        if (!state) return;
        const active = ["wild", "freeze"].filter((k) => state.cheats[k]).length + (traceOn ? 1 : 0);
        cheatsBtn.classList.toggle("on", cheatsOpen || active > 0);
        const clabel = cheatsBtn.querySelector(".bs-btn-label");
        if (clabel) clabel.textContent = active > 0 && !cheatsOpen ? "Cheats " + active : "Cheats";
        pauseBtn.classList.toggle("on", paused);
        const plabel = pauseBtn.querySelector(".bs-btn-label");
        if (plabel) plabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
        pauseBtn.disabled = online && !room.isHost;
        ov.help.hidden = !helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.result.hidden = state.phase !== "over" || cheatsOpen || helpOpen || paused;
        for (let s = 0; s < 2; s++) {
            chips[s].classList.toggle("on", state.phase === "playing" && state.turn === s);
        }
        fireBtn.disabled = !canShoot();
    }
    function drawAll() {
        if (!state || destroyed) return;
        shownRows = cloneRows(state.rows);
        shownShotId = state.lastShot ? state.lastShot.id : 0;
        if (state.shots === 0) savedBest = false;
        renderGrid(state.rows);
        hud.level.textContent = state.levelName + " · " + (online ? "Online duel" : "vs Bot");
        for (let s = 0; s < 2; s++) {
            hud.name[s].textContent = nameFor(s);
            hud.score[s].textContent = String(state.scores[s]);
        }
        hud.status.textContent = statusText();
        hud.rowin.textContent = state.cheats.freeze ? "Ceiling frozen" : "Row in " + (NEW_ROW_EVERY - state.sinceRow);
        hud.next.setAttribute("fill", PALETTE[state.next] ?? "#e2e8f0");
        loadedEl.setAttribute("fill", state.cheats.wild ? "#ffffff" : PALETTE[state.loaded]);
        loadedEl.setAttribute("stroke", state.cheats.wild ? "#94a3b8" : "none");
        loadedEl.setAttribute("stroke-dasharray", state.cheats.wild ? "3 3" : "none");
        syncCheats();
        if (state.phase === "over") {
            resTitle.textContent =
                state.winner === -1 ? "Draw" : state.winner === mySeat() ? "You win" : nameFor(state.winner) + " wins";
            const why = { clear: "Board cleared", danger: "Danger line crossed", jammed: "Board jammed" }[state.reason] || "";
            resSub.textContent = nameFor(0) + " " + state.scores[0] + " — " + state.scores[1] + " " + nameFor(1) + " · " + why;
            resBest.textContent = "Best " + Math.max(best, state.scores[mySeat()] || 0);
        }
        syncUI();
        drawAim();
        saveBest();
        maybeBot();
    }
    function animateShot(ls) {
        animating = true;
        renderGrid(shownRows);
        hideAim();
        fireBtn.disabled = true;
        const pts = (ls.path || []).slice();
        if (!pts.length) pts.push([W / 2, SHOOTER_Y - 16]);
        if (pts.length < 2) pts.push(pts[pts.length - 1]);
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
            cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        }
        const total = cum[cum.length - 1] || 1;
        const dur = Math.max(160, (total / (SPEED * 1.3)) * 1000);
        projEl.setAttribute("fill", ls.wild ? "#ffffff" : PALETTE[ls.color]);
        projEl.setAttribute("stroke", ls.wild ? "#94a3b8" : "none");
        projEl.setAttribute("stroke-dasharray", ls.wild ? "3 3" : "none");
        projEl.setAttribute("visibility", "visible");
        animStart = Date.now();
        const frame = () => {
            if (destroyed || paused) return;
            const k = Math.min(1, (Date.now() - animStart) / dur);
            const d = k * total;
            let i = 1;
            while (i < cum.length - 1 && cum[i] < d) i++;
            const seg = cum[i] - cum[i - 1] || 1;
            const f = (d - cum[i - 1]) / seg;
            projEl.setAttribute("cx", String(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f));
            projEl.setAttribute("cy", String(pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f));
            if (k < 1) { rafId = requestAnimationFrame(frame); return; }
            projEl.setAttribute("visibility", "hidden");
            spawnFx(ls.pops, shownRows);
            spawnFx(ls.floats, shownRows);
            shotFrame = null;
            animFrozen = false;
            animating = false;
            drawAll();
        };
        shotFrame = frame;
        animFrozen = false;
        rafId = requestAnimationFrame(frame);
    }
    function render() {
        if (destroyed || !state) return;
        syncUI();
        if (animating) return;
        const ls = state.lastShot;
        if (ls && ls.id !== shownShotId && shownRows) animateShot(ls);
        else drawAll();
    }

    /* ---------------- networking / actions ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (destroyed || !state || !action) return;
        if (actor !== 0 && actor !== 1) return;
        if (action.type === "fire") {
            if (state.phase !== "playing" || actor !== state.turn) return;
            const a = Number(action.angle);
            if (!Number.isFinite(a)) return;
            resolveShot(state, clampA(a), actor);
            publish();
        } else if (action.type === "cheat") {
            const key = action.key;
            if (key === "wild" || key === "freeze") {
                state.cheats[key] = !state.cheats[key];
                if (key === "freeze" && state.cheats.freeze) state.sinceRow = 0;
                publish();
            } else if (key === "score" && state.phase === "playing") {
                state.scores[actor] += 250;
                publish();
            } else if (key === "clear" && state.phase === "playing") {
                let idx = -1;
                for (let r = state.rows.length - 1; r >= 0; r--) {
                    if (state.rows[r].cells.some((v) => v !== null)) { idx = r; break; }
                }
                if (idx >= 0) {
                    const list = [];
                    for (let c = 0; c < colsIn(state.rows[idx]); c++) {
                        const v = state.rows[idx].cells[c];
                        if (v !== null) { list.push([idx, c, v]); state.rows[idx].cells[c] = null; }
                    }
                    for (const [r, c] of findFloating(state.rows)) {
                        list.push([r, c, state.rows[r].cells[c]]);
                        state.rows[r].cells[c] = null;
                    }
                    spawnFx(list, state.rows);
                    if (gridEmpty(state.rows)) {
                        state.phase = "over";
                        state.winner = state.scores[0] === state.scores[1] ? -1 : state.scores[0] > state.scores[1] ? 0 : 1;
                        state.reason = "clear";
                    }
                    publish();
                }
            }
        } else if (action.type === "restart") {
            state = freshState(); // coin toss & seat diacak ulang tiap match
            savedBest = false;
            angle = -Math.PI / 2;
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
    function fire() {
        if (!canShoot()) return;
        if (online && !room.isHost) {
            awaiting = true;
            clearTimeout(awaitTimer);
            awaitDue = Date.now() + 4000;
            awaitTimer = setTimeout(() => {
                awaitTimer = 0;
                awaiting = false;
                render();
            }, 4000);
        }
        submitAction({ type: "fire", angle });
        render();
    }
    function botTick() {
        botTimer = 0;
        if (paused || helpOpen || cheatsOpen || destroyed || !state) return;
        if (state.phase !== "playing" || state.turn !== 1 || animating) return;
        applyAction({ type: "fire", angle: botChooseAngle(state) }, 1);
    }
    function scheduleBot(delay) {
        clearTimeout(botTimer);
        botTimer = 0;
        botDue = Date.now() + delay;
        botTimer = setTimeout(botTick, delay);
    }
    function maybeBot() {
        if (online || destroyed || !state || paused || helpOpen || cheatsOpen) return;
        if (state.phase !== "playing" || state.turn !== 1 || animating) return;
        scheduleBot(650 + Math.random() * 550);
    }

    /* ---------------- pause (freeze timers + shift anchors) ---------------- */
    function stopHold() { clearInterval(holdTimer); holdTimer = 0; }
    function setPaused(on) {
        if (destroyed || paused === on) return;
        if (on && online && !room.isHost) return;
        paused = on;
        if (on) {
            pausedAt = Date.now();
            if (botTimer) {
                botRemain = Math.max(0, botDue - pausedAt);
                clearTimeout(botTimer);
                botTimer = 0;
            }
            if (awaitTimer) {
                awaitRemain = Math.max(0, awaitDue - pausedAt);
                clearTimeout(awaitTimer);
                awaitTimer = 0;
            }
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
                animElapsed = Math.max(0, pausedAt - animStart);
                animFrozen = true;
            }
            stopHold();
            hideAim();
        } else {
            if (botRemain > 0) { scheduleBot(botRemain); botRemain = 0; }
            if (awaitRemain > 0) {
                awaitDue = Date.now() + awaitRemain;
                awaitTimer = setTimeout(() => {
                    awaitTimer = 0;
                    awaiting = false;
                    render();
                }, awaitRemain);
                awaitRemain = 0;
            }
            if (animFrozen && shotFrame) {
                animStart = Date.now() - animElapsed; // geser anchor setelah jeda
                animFrozen = false;
                rafId = requestAnimationFrame(shotFrame);
            }
        }
        render();
    }

    /* ---------------- pointer (mouse / touch) ---------------- */
    function svgPoint(e) {
        const rect = svgEl.getBoundingClientRect();
        const scale = Math.min(rect.width / W, rect.height / H); // preserveAspectRatio="xMidYMid meet"
        if (!scale || !Number.isFinite(scale)) return { x: W / 2, y: SHOOTER_Y };
        const ox = rect.left + (rect.width - W * scale) / 2;
        const oy = rect.top + (rect.height - H * scale) / 2;
        return { x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale };
    }
    function updateAim(px, py) {
        let a = Math.atan2(py - SHOOTER_Y, px - W / 2);
        if (a > MAX_A) a = py < SHOOTER_Y ? MAX_A : MIN_A;
        angle = clampA(a);
        drawAim();
    }
    const onMove = (e) => { if (!canShoot()) return; const p = svgPoint(e); updateAim(p.x, p.y); };
    const onDown = (e) => {
        if (!canShoot()) return;
        const p = svgPoint(e);
        updateAim(p.x, p.y);
        try { svgEl.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    };
    const onUp = () => { if (!canShoot()) return; fire(); };
    svgEl.addEventListener("pointermove", onMove);
    svgEl.addEventListener("pointerdown", onDown);
    svgEl.addEventListener("pointerup", onUp);

    /* ---------------- virtual pad (mobile) ---------------- */
    const padStep = (dir) => { if (!canShoot()) return; angle = clampA(angle + dir * 0.05); drawAim(); };
    const onPadDown = (e) => {
        const btn = e.target.closest ? e.target.closest("[data-pad]") : null;
        if (!btn || btn.dataset.pad === "fire") return;
        e.preventDefault();
        const dir = btn.dataset.pad === "left" ? -1 : 1;
        padStep(dir);
        stopHold();
        holdTimer = setInterval(() => padStep(dir), 90);
    };
    padEl.addEventListener("pointerdown", onPadDown);
    padEl.addEventListener("pointerup", stopHold);
    padEl.addEventListener("pointercancel", stopHold);
    padEl.addEventListener("pointerleave", stopHold);

    /* ---------------- overlays ---------------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        render();
    }
    function toggleCheats(on) {
        if (helpOpen) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) syncCheats();
        render();
    }

    /* ---------------- keyboard (desktop): help → cheats → pause → actions ---------------- */
    const onKey = (e) => {
        if (destroyed || !state) return;
        const k = e.code;
        if (k === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (helpOpen) {
            if (k === "Escape" || k === "Enter" || k === "Space") toggleHelp(false);
            e.preventDefault();
            return;
        }
        if (k === "KeyC") { toggleCheats(); e.preventDefault(); return; }
        if (cheatsOpen) {
            if (k === "Escape" || k === "Enter") toggleCheats(false);
            e.preventDefault();
            return;
        }
        if (k === "KeyP" || k === "Escape") { setPaused(!paused); e.preventDefault(); return; }
        if (paused) return;
        if (k === "KeyR") {
            setPaused(false);
            submitAction({ type: "restart" });
            e.preventDefault();
            return;
        }
        if (k === "ArrowLeft" || k === "ArrowRight") {
            e.preventDefault();
            if (!canShoot()) return;
            angle = clampA(angle + (k === "ArrowLeft" ? -0.035 : 0.035));
            drawAim();
        } else if (k === "Space" || k === "Enter") {
            e.preventDefault();
            fire();
        }
    };
    document.addEventListener("keydown", onKey);

    /* ---------------- clicks & cheat toggles ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (!t.closest) return;
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-restart]")) { if (paused) setPaused(false); submitAction({ type: "restart" }); return; }
        if (t.closest("[data-cheats]")) { toggleCheats(); return; }
        if (t.closest("[data-cheat-close]")) { toggleCheats(false); return; }
        if (t.closest("[data-pause]")) { setPaused(!paused); return; }
        if (t.closest("[data-resume]")) { setPaused(false); return; }
        const act = t.closest("[data-cheat-act]");
        if (act) { submitAction({ type: "cheat", key: act.dataset.cheatAct }); return; }
        if (t.closest('[data-pad="fire"]')) { fire(); return; }
    }
    function handleChange(event) {
        const el = event.target.closest ? event.target.closest("[data-cheat]") : null;
        if (!el) return;
        const key = el.dataset.cheat;
        if (key === "trace") { traceOn = el.checked; drawAim(); return; } // visual-only, lokal
        submitAction({ type: "cheat", key });
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);

    /* ---------------- boot ---------------- */
    if (online) {
        reg(room.onRoom((nextRoom) => { roomData = nextRoom; if (!destroyed) render(); }));
        if (room.isHost) {
            state = freshState();
            publish();
            reg(room.onAction((action) => applyAction(action, 1 - state.seats.host)));
        } else {
            hud.status.textContent = "Loading…";
            reg(room.onState((nextState) => {
                if (destroyed) return;
                state = nextState;
                awaiting = false;
                clearTimeout(awaitTimer);
                render();
            }));
        }
    } else {
        state = freshState();
        render();
    }

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(rafId);
            clearTimeout(botTimer);
            clearTimeout(awaitTimer);
            clearInterval(holdTimer);
            fxTimers.forEach((id) => clearTimeout(id));
            fxTimers.clear();
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svgEl.removeEventListener("pointermove", onMove);
            svgEl.removeEventListener("pointerdown", onDown);
            svgEl.removeEventListener("pointerup", onUp);
            padEl.removeEventListener("pointerdown", onPadDown);
            padEl.removeEventListener("pointerup", stopHold);
            padEl.removeEventListener("pointercancel", stopHold);
            padEl.removeEventListener("pointerleave", stopHold);
            unsubs.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
        },
    };
}
