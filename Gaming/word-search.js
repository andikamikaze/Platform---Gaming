/* ==== GAME: word-search.js ==== */
/*
  - File ini mengikuti template game baru (META + mount).
  - id harus sama dengan nama file tanpa .js  ->  "word-search"
  - Setelah menambah/mengubah file ini, jalankan:
      node tools/build-games-manifest.mjs
*/

export const META = {
    id: "word-search",
    name: "Word Search",
    category: "words",
    catLabel: "Word",
    desc: "Find six hidden words before your rival. Drag, tap, or use the keyboard — wrong guesses pass the turn, two misses unlock a hint.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="34" height="34" rx="4"/><path d="M7 15.5h34M7 24h34M7 32.5h34M15.5 7v34M24 7v34M32.5 7v34"/><rect x="9.5" y="19.8" width="29" height="8.4" rx="4.2" fill="#4f46e5" stroke="none" opacity=".85"/></svg>',
    bg: ["#eef2ff", "#c7d2fe"],
    bestKey: "wordSearchBestTime",
};

import { iconSVG } from "../JS/icons.js";

/* ============================================================
   PURE LOGIC — seeded, deterministik, bisa dites (export _test)
   ============================================================ */
const SIZE = 10;
const WORD_COUNT = 6;
const POOL = [
    "MONKEY", "PENCIL", "SAILOR", "WIZARD", "TREASURE", "VOLCANO",
    "BUTTER", "PILLOW", "CACTUS", "DINNER", "GOLDEN", "MARBLE",
];
const DIRS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function rng(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}
function genPuzzle(seed, attempts = 90) {
    const rnd = rng(seed);
    const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(""));
    const placed = [];
    for (const w of shuffle(POOL, rnd)) {
        if (placed.length >= WORD_COUNT) break;
        let done = null;
        for (let att = 0; att < attempts && !done; att++) {
            const d = DIRS[Math.floor(rnd() * DIRS.length)];
            const r0 = Math.floor(rnd() * SIZE);
            const c0 = Math.floor(rnd() * SIZE);
            const r1 = r0 + d[0] * (w.length - 1);
            const c1 = c0 + d[1] * (w.length - 1);
            if (r1 < 0 || r1 >= SIZE || c1 < 0 || c1 >= SIZE) continue;
            let ok = true;
            const cells = [];
            for (let i = 0; i < w.length; i++) {
                const r = r0 + d[0] * i, c = c0 + d[1] * i;
                if (grid[r][c] && grid[r][c] !== w[i]) { ok = false; break; }
                cells.push([r, c]);
            }
            if (ok) done = cells;
        }
        if (done) {
            done.forEach((rc, i) => { grid[rc[0]][rc[1]] = w[i]; });
            placed.push({ word: w, cells: done });
        }
    }
    const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
            if (!grid[r][c]) grid[r][c] = AZ[Math.floor(rnd() * 26)];
    return { grid, placed };
}
/* Validasi: semua 6 kata benar-benar terbaca lurus di grid */
function verifyPuzzle(p) {
    if (!p || p.placed.length !== WORD_COUNT) return false;
    for (const { word, cells } of p.placed) {
        if (cells.length !== word.length) return false;
        const a = cells[0], b = cells[cells.length - 1];
        const line = lineCells(a[0], a[1], b[0], b[1]);
        if (!line || line.length !== cells.length) return false;
        for (let i = 0; i < cells.length; i++) {
            if (line[i][0] !== cells[i][0] || line[i][1] !== cells[i][1]) return false;
            if (p.grid[cells[i][0]][cells[i][1]] !== word[i]) return false;
        }
    }
    return true;
}
/* Random level generator yang DIJAMIN bisa diselesaikan.
   Deterministik dari seed -> host & guest menghasilkan grid identik. */
function genSolvable(seed) {
    let s = seed >>> 0;
    for (let i = 0; i < 256; i++) {
        const p = genPuzzle(s);
        if (verifyPuzzle(p)) return p;
        s = (s + 0x9e3779b9) >>> 0;
    }
    for (let i = 0; i < 64; i++) {
        const p = genPuzzle(s, 500);
        if (verifyPuzzle(p)) return p;
        s = (s + 0x9e3779b9) >>> 0;
    }
    throw new Error("word-search: could not generate a solvable puzzle");
}
function lineCells(r1, c1, r2, c2) {
    const lr = Math.abs(r2 - r1), lc = Math.abs(c2 - c1);
    if (lr === 0 && lc === 0) return null;
    if (lr !== 0 && lc !== 0 && lr !== lc) return null;
    const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
    const n = Math.max(lr, lc) + 1;
    const cells = [];
    for (let i = 0; i < n; i++) cells.push([r1 + dr * i, c1 + dc * i]);
    return cells;
}
function matchLine(grid, r1, c1, r2, c2, placed) {
    const cells = lineCells(r1, c1, r2, c2);
    if (!cells) return null;
    const s = cells.map((rc) => grid[rc[0]][rc[1]]).join("");
    const rev = s.split("").reverse().join("");
    for (const p of placed) {
        if (p.found) continue;
        if (p.word === s || p.word === rev) return { word: p.word, cells };
    }
    return null;
}

export const _test = {
    SIZE, WORD_COUNT, POOL, DIRS,
    rng, shuffle, genPuzzle, genSolvable, verifyPuzzle, lineCells, matchLine,
};

/* ============================================================
   MOUNT
   ============================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;

    /* ---------- state & locals ---------- */
    let state = null;            // canonical, serializable (tanpa null -> aman RTDB)
    let puzzle = null;           // cache grid lokal, dibangun dari state.seed
    let gridSeed = -1;
    let anchor = null, cur = null, cursor = [0, 0];
    let dragging = false, dragMode = "fresh";
    let helpOpen = false, cheatOpen = false, paused = false;
    const cheats = { reveal: false, lazy: false };
    let tickTimer = null, padRepeat = null;
    let botTimer = null, flashTimer = null, noteTimer = null;
    let activeFlash = null, localNote = "", seenMoveTs = 0, recordNote = "";
    const offs = [];
    let best = null;
    try {
        const v = parseInt(localStorage.getItem(META.bestKey), 10);
        if (Number.isFinite(v) && v >= 0) best = v;
    } catch (_) { }

    /* First-run internal guide (global how-to is disabled for this game). */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("wordSearchHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("wordSearchHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }

    /* Virtual clock: help / cheats / pause freeze every Date.now()-based
       anchor and pending timer. On resume the frozen span is subtracted, so
       the clock, hint pulses and the bot never jump forward. Online rounds
       are never frozen, keeping cross-client timestamps comparable. */
    let frozenAtReal = 0, pauseShift = 0;
    let timers = [], timerTick = null;
    const now = () => (frozenAtReal || Date.now()) - pauseShift;
    const frozen = () => !online && (paused || helpOpen || cheatOpen);
    function ensureTimer() {
        if (timerTick || frozen() || !timers.length) return;
        const next = Math.min.apply(null, timers.map((t) => t.due));
        timerTick = setTimeout(() => {
            timerTick = null;
            if (frozen()) return;
            const t = now();
            const due = timers.filter((x) => x.due <= t);
            timers = timers.filter((x) => x.due > t);
            due.forEach((x) => x.fn());
            ensureTimer();
        }, Math.max(0, next - now()));
    }
    function later(fn, ms) {
        const t = { fn, due: now() + ms };
        timers.push(t);
        ensureTimer();
        return t;
    }
    function cancelLater(t) {
        if (!t) return;
        timers = timers.filter((x) => x !== t);
        if (!timers.length && timerTick) { clearTimeout(timerTick); timerTick = null; }
    }
    function clearTimers() {
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
        timers = [];
        botTimer = flashTimer = noteTimer = null;
    }
    function freezeClock() {
        if (frozenAtReal) return;
        frozenAtReal = Date.now();
        if (timerTick) { clearTimeout(timerTick); timerTick = null; }
    }
    function thawClock() {
        if (!frozenAtReal) return;
        pauseShift += Date.now() - frozenAtReal;
        frozenAtReal = 0;
        ensureTimer();
    }
    const syncFreeze = () => { if (frozen()) freezeClock(); else thawClock(); };

    const clamp = (n) => Math.max(0, Math.min(SIZE - 1, n));
    const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    const key = (r, c) => r + "," + c;

    /* Random posisi duduk (multiplayer): host bisa jadi P1 atau P2.
       Disimpan di state agar host & guest melihat hasil yang sama. */
    function mySeat() {
        if (!online) return 0;
        if (!state) return room.isHost ? 0 : 1;
        return room.isHost ? state.hostSeat : 1 - state.hostSeat;
    }
    const seatName = (seat) =>
        seat === mySeat() ? (playerName || "You") : (online ? "Opponent" : "Bot");
    const isMyTurn = () => !!state && state.phase === "play" && state.turn === mySeat();

    /* Random giliran pertama (starter) + random seed level */
    function freshState(phase) {
        const starter = Math.random() < 0.5 ? 0 : 1;
        return {
            v: 1,
            seed: (Math.random() * 0x7fffffff) | 0,
            hostSeat: online ? (Math.random() < 0.5 ? 0 : 1) : 0,
            phase,                       // 'intro' | 'play' | 'over'
            starter, turn: starter,
            foundBy: Array(WORD_COUNT).fill(-1),   // -1 belum, 0/1 pemilik kata
            misses: [0, 0],
            hints: [],                   // {word, r, c, ts}
            moves: 0,
            lastMove: { ts: 0, actor: -1, ok: false, word: "", cells: [], pass: false },
            startAt: phase === "play" ? now() : 0,
            endAt: 0,
            winner: -2,                  // -2 belum, -1 seri, 0/1 pemenang
        };
    }

    /* ---------- DOM ---------- */
    root.innerHTML = `
<style>
.ws-app{--ws-ink:#111827;--ws-muted:#6b7280;--ws-line:#e5e7eb;--ws-soft:#f6f7f9;--ws-p0:#4f46e5;--ws-p0bg:#eef2ff;--ws-p1:#d97706;--ws-p1bg:#fff7ed;--ws-cell:34px;--ws-gap:3px;color:var(--ws-ink)}
.ws-app *{box-sizing:border-box}
.ws-app [hidden]{display:none!important}
.ws-app.game-fill{display:flex;flex-direction:column}
.ws-app .ws-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font:600 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
.ws-app .ws-hud-info,.ws-app .ws-hud-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ws-app .ws-hud-actions{margin-left:auto}
.ws-app .ws-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--ws-line);border-radius:999px;background:#fff;color:var(--ws-muted);white-space:nowrap}
.ws-app .ws-chip b{color:var(--ws-ink);font-weight:700;font-variant-numeric:tabular-nums}
.ws-app .ws-dot{width:8px;height:8px;border-radius:50%;background:#9ca3af;flex:none}
.ws-app[data-turn="me"] .ws-dot{background:#16a34a}
.ws-app[data-turn="other"] .ws-dot{background:#f59e0b}
.ws-app .ws-chip.ws-turnme{background:var(--ws-p0bg);border-color:transparent;color:var(--ws-p0)}
.ws-app .ws-chip.ws-turnme b{color:var(--ws-p0)}
.ws-app .ws-btn{border:1px solid var(--ws-line);background:#fff;color:var(--ws-ink);border-radius:9px;padding:8px 12px;min-height:38px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;font-family:inherit}
.ws-app .ws-btn:hover{border-color:var(--ws-p0);color:var(--ws-p0)}
.ws-app .ws-btn.on{border-color:var(--ws-p0);color:var(--ws-p0);background:var(--ws-p0bg)}
.ws-app .ws-btn.primary{background:var(--ws-p0);border-color:var(--ws-p0);color:#fff}
.ws-app .ws-btn.primary:hover{color:#fff;opacity:.92}
.ws-app .ws-btn:disabled{opacity:.45;cursor:not-allowed}
.ws-app .ws-icon-btn{display:inline-flex;align-items:center;gap:6px}
.ws-app .ws-icon-btn svg{flex:none;display:block}
.ws-app .ws-cheatbadge{font-size:9px;font-weight:800;letter-spacing:.08em;color:#b45309;background:#fef3c7;border-radius:6px;padding:2px 6px}
.ws-app .ws-spacer{flex:1 1 auto}
.ws-app .ws-board{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid var(--ws-line);border-radius:12px;background:#fbfcfe;overflow:hidden}
.ws-app .ws-main{display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;width:100%;height:100%;min-height:0}
.ws-app .ws-boardcol{display:flex;flex-direction:column;gap:8px;align-items:center;min-width:0}
.ws-app .ws-grid{display:grid;grid-template-columns:repeat(10,var(--ws-cell));grid-auto-rows:var(--ws-cell);gap:var(--ws-gap);padding:8px;background:var(--ws-soft);border:1px solid var(--ws-line);border-radius:12px;touch-action:none;user-select:none;-webkit-user-select:none}
.ws-app .ws-grid:focus-visible{outline:2px solid var(--ws-p0);outline-offset:2px}
.ws-app .ws-cell{display:grid;place-items:center;background:#fff;border-radius:8px;box-shadow:inset 0 0 0 1px var(--ws-line);font-weight:700;font-size:15px;cursor:pointer;color:var(--ws-ink)}
.ws-app .ws-cell:hover{background:#f3f4f6}
.ws-app .ws-f0{background:var(--ws-p0bg);color:var(--ws-p0);box-shadow:inset 0 0 0 1px #c7d2fe;cursor:default}
.ws-app .ws-f1{background:var(--ws-p1bg);color:var(--ws-p1);box-shadow:inset 0 0 0 1px #fed7aa;cursor:default}
.ws-app .ws-reveal{box-shadow:inset 0 0 0 1.5px #a5b4fc;background:#fafaff}
.ws-app .ws-hint{box-shadow:inset 0 0 0 2px #f59e0b}
.ws-app .ws-hintpulse{animation:wsPulse 1s ease-in-out 3}
@keyframes wsPulse{50%{background:#fef3c7}}
.ws-app .ws-sel{background:var(--ws-p0)!important;color:#fff!important;box-shadow:none}
.ws-app .ws-cur{outline:2px solid var(--ws-ink);outline-offset:-2px}
.ws-app .ws-good{background:#dcfce7!important;color:#166534!important;box-shadow:none}
.ws-app .ws-bad{background:#fee2e2!important;color:#b91c1c!important;box-shadow:none}
.ws-app .ws-msg{min-height:18px;margin:0;font-size:12.5px;color:var(--ws-muted);text-align:center}
.ws-app .ws-side{display:flex;flex-direction:column;gap:12px;width:220px;min-width:0}
.ws-app .ws-side h3{margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ws-muted)}
.ws-app .ws-list,.ws-app .ws-hints{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ws-app .ws-item{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;letter-spacing:.08em}
.ws-app .ws-item .ws-dot{width:8px;height:8px;border-radius:50%;flex:none}
.ws-app .ws-item.ws-done{color:#9ca3af;text-decoration:line-through}
.ws-app .ws-coord{margin-left:auto;font-style:normal;font-weight:600;font-size:10.5px;color:var(--ws-p0);letter-spacing:0}
.ws-app .ws-hintchip{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 8px}
.ws-app .ws-padwrap{display:none;flex-direction:column;gap:8px;align-items:center;margin-top:10px}
@media (pointer:coarse){.ws-app .ws-padwrap{display:flex}}
.ws-app.ws-pad-on .ws-padwrap{display:flex}
.ws-app .ws-pad{display:grid;grid-template-areas:". u ." "l ok r" ". d .";gap:8px}
.ws-app .ws-padbtn{width:48px;height:44px;border:1px solid var(--ws-line);background:#fff;border-radius:10px;font-size:15px;cursor:pointer;touch-action:manipulation;color:var(--ws-ink)}
.ws-app .ws-padbtn:focus-visible{outline:2px solid var(--ws-p0);outline-offset:2px}
.ws-app .ws-padbtn:active{background:var(--ws-soft)}
.ws-app .ws-up{grid-area:u}.ws-app .ws-left{grid-area:l}.ws-app .ws-right{grid-area:r}.ws-app .ws-down{grid-area:d}
.ws-app .ws-ok{grid-area:ok;background:var(--ws-p0);border-color:var(--ws-p0);color:#fff;font-weight:700;font-size:13px}
.ws-app .ws-padcancel{border:1px solid var(--ws-line);background:#fff;color:var(--ws-muted);font-size:11px;cursor:pointer;font-weight:600;border-radius:9px;padding:7px 12px;min-height:38px;font-family:inherit}
.ws-app .ws-padcancel:focus-visible{outline:2px solid var(--ws-p0);outline-offset:2px}
.ws-app .ws-padcancel:disabled{opacity:.4;cursor:default}
.ws-app .ws-ov{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:12px;background:rgba(249,250,251,.9);backdrop-filter:blur(3px);overflow:auto}
.ws-app .ws-ov[data-ov="help"]{z-index:50}
.ws-app .ws-card{display:flex;flex-direction:column;width:100%;max-width:460px;max-height:100%;padding:16px 18px;background:#fff;border:1px solid var(--ws-line);border-radius:12px;box-shadow:0 4px 16px rgba(15,23,42,.06);overflow:hidden}
.ws-app .ws-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:8px}
.ws-app .ws-head h3{margin:0;font-size:19px}
.ws-app .ws-body{flex:1 1 auto;min-height:0;overflow:auto}
.ws-app .ws-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.ws-app .ws-card p{margin:0 0 8px;font-size:13px;line-height:1.6;color:#374151}
.ws-app .ws-rules{margin:12px 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:#374151}
.ws-app .ws-meta,.ws-app .ws-note{font-size:12px;color:var(--ws-muted)}
.ws-app .ws-ovbtns{display:flex;gap:8px;flex-wrap:wrap}
.ws-app .ws-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--ws-soft);font-size:13px;font-weight:600}
.ws-app .ws-toggle,.ws-app .ws-mini{border:1px solid var(--ws-line);background:#fff;border-radius:999px;padding:6px 12px;min-height:38px;font-size:12px;font-weight:700;cursor:pointer;color:var(--ws-ink);font-family:inherit}
.ws-app .ws-toggle:focus-visible,.ws-app .ws-mini:focus-visible{outline:2px solid var(--ws-p0);outline-offset:2px}
.ws-app .ws-toggle.ws-on{background:var(--ws-p0);border-color:var(--ws-p0);color:#fff}
.ws-app .ws-mini:disabled,.ws-app .ws-toggle:disabled{opacity:.4;cursor:default}
.ws-app .ws-help h4{margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--ws-muted)}
.ws-app .ws-help ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;color:#374151}
.ws-app kbd{border:1px solid var(--ws-line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;font-size:11px;background:var(--ws-soft);font-family:inherit}
@media (max-width:760px){
.ws-app{--ws-cell:min(8.2vw,32px);--ws-gap:2px}
.ws-app .ws-cell{font-size:13px;border-radius:6px}
.ws-app .ws-grid{padding:6px;border-radius:12px}
.ws-app .ws-main{gap:12px}
.ws-app .ws-side{width:100%;max-width:420px}
.ws-app .ws-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}
}
@media (max-width:390px){.ws-app{--ws-cell:min(7.6vw,30px)}.ws-app .ws-side{max-width:100%}}
@media (prefers-reduced-motion:reduce){.ws-app *{animation:none!important;transition:none!important}}

/* --- fill height + mobile refinements (PALING AKHIR) --- */
.ws-icon-btn svg{flex:none;display:block}
.ws-card{overflow:hidden}
.ws-head,.ws-foot{flex:none}
.ws-body{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
.ws-app.game-fill > .ws-board:not(:has(.ws-ov:not([hidden]))){flex:1 1 auto;min-height:0}
.ws-app.game-fill > .ws-board:has(.ws-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px)}
.ws-app .ws-hud{gap:5px;margin-bottom:8px}
.ws-app .ws-hud-info,.ws-app .ws-hud-actions{gap:5px}
.ws-app .ws-hud .ws-chip{padding:4px 6px;font-size:9px;min-height:0}
.ws-app .ws-hud .ws-chip[data-hud="pchip1"],.ws-app .ws-hud .ws-chip[data-hud="bestchip"]{display:none}
.ws-app .ws-hud .ws-btn{min-height:32px;padding:5px 8px;font-size:9px}
.ws-app .ws-hud .ws-btn-label,.ws-app .ws-hud .ws-spacer{display:none}
.ws-app .ws-main{gap:10px}
.ws-app .ws-ov{padding:8px}
.ws-app .ws-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.ws-app .ws-body{scrollbar-width:none}
.ws-app .ws-body::-webkit-scrollbar{display:none}
.ws-app .ws-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--ws-line)}
.ws-app .ws-note{display:none}
}
@media (max-width:390px){.ws-app{--ws-cell:min(7.6vw,30px)}.ws-app .ws-side{max-width:100%}}
</style>
<div class="game-app ws-app game-fill" data-turn="idle" data-ws>
  <div class="ws-hud">
    <div class="ws-hud-info">
      <span class="ws-chip"><i class="ws-dot"></i><b data-status>Ready</b></span>
      <span class="ws-chip">FOUND <b data-found>0/6</b></span>
      <span class="ws-chip">TIME <b data-time>0:00</b></span>
      <span class="ws-chip" data-turnchip>Ready</span>
      <span class="ws-chip" data-hud="pchip0"><i class="ws-dot" style="background:var(--ws-p0)"></i><span data-name0>Player 1</span> · <b data-score0>0</b></span>
      <span class="ws-chip" data-hud="pchip1"><i class="ws-dot" style="background:var(--ws-p1)"></i><span data-name1>Player 2</span> · <b data-score1>0</b></span>
      <span class="ws-chip" data-hud="bestchip">BEST <b data-best>—</b></span>
      <b class="ws-cheatbadge" data-cheatbadge hidden>CHEATS</b>
    </div>
    <span class="ws-spacer"></span>
    <div class="ws-hud-actions">
      <button class="ws-btn ws-icon-btn" type="button" data-act="pad" aria-label="Toggle D-pad" title="Toggle D-pad (G)" aria-pressed="false">${iconSVG("gamepad2", { size: 14 })}<span class="ws-btn-label">D-pad</span></button>
      <button class="ws-btn ws-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="ws-btn-label">Help</span></button>
      <button class="ws-btn ws-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="ws-btn-label">Cheats</span></button>
      <button class="ws-btn ws-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="ws-btn-label">Pause</span></button>
      <button class="ws-btn ws-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="ws-btn-label">Restart</span></button>
      <button class="ws-btn ws-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="ws-btn-label">Exit game</span></button>
    </div>
  </div>

  <section class="game-panel ws-board" data-board>
    <div class="ws-main">
      <div class="ws-boardcol">
        <div class="ws-grid" data-grid tabindex="0" aria-label="Word search grid"></div>
        <p class="ws-msg" data-msg aria-live="polite"></p>
      </div>
      <aside class="ws-side">
        <div><h3>Hidden words</h3><ul class="ws-list" data-list></ul></div>
        <div data-hintwrap hidden><h3>Hints</h3><ul class="ws-hints" data-hints></ul></div>
      </aside>
    </div>

    <div class="ws-ov" data-ov="intro">
      <div class="ws-card">
        <div class="ws-head"><h3>Word Search</h3><span class="ws-meta" data-intro-meta></span></div>
        <div class="ws-body">
          <p>Six words hide in the grid — forwards, backwards, across, down, diagonally. Take turns with your rival; each found word scores a point. Most words wins.</p>
          <ul class="ws-rules">
            <li>✔ Correct word = 1 point, then the turn passes.</li>
            <li>✘ Wrong line = turn passes. Two misses in a row reveal a hint.</li>
            <li>⌨ Arrows/WASD + Enter · 🖱 drag or click both ends · 📱 D-pad below the board.</li>
          </ul>
        </div>
        <div class="ws-foot"><span class="ws-note">Press H for the guide</span><div class="ws-ovbtns">
          <button class="ws-btn primary" type="button" data-act="start">Start game</button>
          <button class="ws-btn" type="button" data-act="help">How to play</button>
        </div></div>
      </div>
    </div>

    <div class="ws-ov" data-ov="over" hidden>
      <div class="ws-card">
        <div class="ws-head"><h3 data-over-title>Finished</h3></div>
        <div class="ws-body"><p data-over-sub></p></div>
        <div class="ws-foot"><span class="ws-note">Best is kept on this device</span><div class="ws-ovbtns">
          <button class="ws-btn primary" type="button" data-restart>Play again</button>
          <button class="ws-btn" type="button" data-exit>Exit game</button>
        </div></div>
      </div>
    </div>

    <div class="ws-ov" data-ov="pause" hidden>
      <div class="ws-card">
        <div class="ws-head"><h3>Paused</h3></div>
        <div class="ws-body"><p>The clock, the bot and pending timers are frozen. Online rounds never pause.</p></div>
        <div class="ws-foot"><span class="ws-note">Press P or Esc to resume</span><button class="ws-btn primary" type="button" data-act="resume">Resume</button></div>
      </div>
    </div>

    <div class="ws-ov" data-ov="cheats" hidden>
      <div class="ws-card">
        <div class="ws-head"><h3>Cheats</h3><button class="ws-btn" type="button" data-act="cheatsclose" aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ws-body">
          <p>Casual helpers. “Reveal” &amp; “Lazy bot” are local-only; the rest go through normal game actions.</p>
          <div class="ws-cheatrow"><span>Reveal hidden words</span><button type="button" class="ws-toggle" data-act="cheat-reveal" data-cheat="reveal">Off</button></div>
          <div class="ws-cheatrow" data-row-lazy><span>Lazy bot (slower &amp; clumsy)</span><button type="button" class="ws-toggle" data-act="cheat-lazy" data-cheat="lazy">Off</button></div>
          <div class="ws-cheatrow"><span>Hint now</span><button type="button" class="ws-mini" data-act="cheat-hint">Use</button></div>
          <div class="ws-cheatrow"><span>Auto-find one word</span><button type="button" class="ws-mini" data-act="cheat-find">Find</button></div>
          <div class="ws-cheatrow"><span>Solve everything</span><button type="button" class="ws-mini" data-act="cheat-solve">Solve</button></div>
          <div class="ws-cheatrow" data-row-skip><span>Skip bot turn</span><button type="button" class="ws-mini" data-act="cheat-skip">Skip</button></div>
        </div>
        <div class="ws-foot"><span class="ws-note">Solo helpers are local-only</span><button class="ws-btn" type="button" data-act="cheatsclose">Close</button></div>
      </div>
    </div>

    <div class="ws-ov" data-ov="help" hidden>
      <div class="ws-card">
        <div class="ws-head"><h3>How to play</h3><button class="ws-btn" type="button" data-act="helpclose" aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="ws-body ws-help">
          <h4>Goal</h4>
          <p>Find the six hidden words in the 10×10 grid. Words run in straight lines — horizontal, vertical, diagonal — and may read backwards. Each word you lock in scores one point; the highest score when all six are found wins.</p>
          <h4>Turns &amp; hints</h4>
          <p>Players alternate turns (the starting player is a coin toss). A correct selection scores and passes the turn. A wrong selection also passes the turn — and after <b>two misses in a row</b>, a hint reveals where one hidden word starts (its first cell pulses amber).</p>
          <h4>Desktop — mouse &amp; keyboard</h4>
          <p>Mouse: drag from the first letter to the last, or click the first letter then the last.<br>
          Keyboard: <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>WASD</kbd> move the cursor · <kbd>Enter</kbd>/<kbd>Space</kbd> set the start, then the end · <kbd>Esc</kbd> cancel · <kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>R</kbd> new game · <kbd>G</kbd> D-pad · <kbd>?</kbd> this guide.</p>
          <h4>Mobile</h4>
          <p>Drag on the grid, or tap the first letter then the last. Prefer buttons? Toggle the D-pad in the HUD: arrows move the cursor, <b>OK</b> sets start/end, <b>Cancel selection</b> resets.</p>
        </div>
        <div class="ws-foot"><span class="ws-note">Press H to reopen this guide</span><button class="ws-btn primary" type="button" data-act="helpclose">Got it</button></div>
      </div>
    </div>
  </section>

  <div class="ws-padwrap">
    <div class="ws-pad" data-pad>
      <button type="button" class="ws-padbtn ws-up" data-dir="up" aria-label="Move up">▲</button>
      <button type="button" class="ws-padbtn ws-left" data-dir="left" aria-label="Move left">◀</button>
      <button type="button" class="ws-padbtn ws-ok" data-act="pad-ok" aria-label="Select">OK</button>
      <button type="button" class="ws-padbtn ws-right" data-dir="right" aria-label="Move right">▶</button>
      <button type="button" class="ws-padbtn ws-down" data-dir="down" aria-label="Move down">▼</button>
    </div>
    <button type="button" class="ws-btn ws-padcancel" data-act="pad-cancel">Cancel selection</button>
  </div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s, r) => (r || root).querySelector(s);
    const wrapper = $(".ws-app");
    const gridEl = $("[data-grid]");
    const listEl = $("[data-list]");
    const hintsEl = $("[data-hints]");
    const hintWrap = $("[data-hintwrap]");
    const msgEl = $("[data-msg]");
    const statusEl = $("[data-status]");
    const cheatBadge = $("[data-cheatbadge]");
    const foundEl = $("[data-found]");
    const timeEl = $("[data-time]");
    const turnChip = $("[data-turnchip]");
    const bestEl = $("[data-best]");
    const bestChip = $('[data-hud="bestchip"]');
    const nameEls = [$("[data-name0]"), $("[data-name1]")];
    const scoreEls = [$("[data-score0]"), $("[data-score1]")];
    const ovIntro = $('[data-ov="intro"]');
    const ovOver = $('[data-ov="over"]');
    const ovPause = $('[data-ov="pause"]');
    const ovHelp = $('[data-ov="help"]');
    const ovCheats = $('[data-ov="cheats"]');
    const introMeta = $("[data-intro-meta]");
    const overTitle = $("[data-over-title]");
    const overSub = $("[data-over-sub]");
    const startBtn = $('[data-act="start"]', ovIntro);
    const padCancel = $('[data-act="pad-cancel"]');
    const cheatBtns = {
        reveal: $('[data-cheat="reveal"]'),
        lazy: $('[data-cheat="lazy"]'),
        hint: $('[data-act="cheat-hint"]'),
        find: $('[data-act="cheat-find"]'),
        solve: $('[data-act="cheat-solve"]'),
        skip: $('[data-act="cheat-skip"]'),
    };
    const rowLazy = $("[data-row-lazy]");
    const rowSkip = $("[data-row-skip]");

    const cellEls = [];
    for (let r = 0; r < SIZE; r++) {
        cellEls.push([]);
        for (let c = 0; c < SIZE; c++) {
            const d = document.createElement("div");
            d.className = "ws-cell";
            d.dataset.cell = "1";
            d.dataset.r = r;
            d.dataset.c = c;
            gridEl.appendChild(d);
            cellEls[r].push(d);
        }
    }

    /* ---------- puzzle cache & helpers ---------- */
    function ensurePuzzle() {
        if (!state) return;
        if (!puzzle || puzzle.seed !== state.seed) {
            puzzle = genSolvable(state.seed);
            puzzle.seed = state.seed;
            gridSeed = -1;
        }
    }
    function placedView() {
        return puzzle.placed.map((p, i) => ({
            word: p.word, cells: p.cells, found: state.foundBy[i] !== -1,
        }));
    }
    function unfoundList() {
        return puzzle.placed
            .map((p, i) => ({ p, i }))
            .filter((x) => state.foundBy[x.i] === -1);
    }
    function scores() {
        const s = [0, 0];
        state.foundBy.forEach((v) => { if (v === 0 || v === 1) s[v]++; });
        return s;
    }
    function elapsed() {
        if (!state || !state.startAt) return 0;
        const end = state.phase === "over" ? state.endAt : now();
        return Math.max(0, Math.floor((end - state.startAt) / 1000));
    }
    function note(text) {
        localNote = text;
        if (noteTimer) cancelLater(noteTimer);
        noteTimer = later(() => { localNote = ""; noteTimer = null; render(); }, 1800);
    }
    function flashCells(cells, cls) {
        if (flashTimer) cancelLater(flashTimer);
        activeFlash = { set: new Set(cells.map((rc) => key(rc[0], rc[1]))), cls };
        flashTimer = later(() => { activeFlash = null; flashTimer = null; render(); }, 700);
    }
    function addHint() {
        const un = unfoundList().filter((x) => !state.hints.some((h) => h.word === x.p.word));
        if (!un.length) return;
        const { p } = un[(Math.random() * un.length) | 0];
        state.hints.push({ word: p.word, r: p.cells[0][0], c: p.cells[0][1], ts: now() });
    }
    function finish() {
        state.phase = "over";
        state.endAt = now();
        const s = scores();
        state.winner = s[0] === s[1] ? -1 : (s[0] > s[1] ? 0 : 1);
        if (!online && state.winner === 0) {
            const t = elapsed();
            if (best == null || t < best) {
                best = t;
                recordNote = " New best!";
                try { localStorage.setItem(META.bestKey, String(t)); } catch (_) { }
            }
        }
    }

    /* ---------- render ---------- */
    function render() {
        if (!state) {
            statusEl.textContent = "Connecting…";
            ovIntro.hidden = helpOpen || cheatOpen || paused;
            introMeta.textContent = "Waiting for room state…";
            startBtn.disabled = true;
            ovOver.hidden = true;
            ovPause.hidden = !paused || helpOpen || cheatOpen;
            ovCheats.hidden = !cheatOpen || helpOpen || paused;
            ovHelp.hidden = !helpOpen;
            syncHudButtons();
            return;
        }
        startBtn.disabled = false;
        ensurePuzzle();

        if (gridSeed !== state.seed) {
            for (let r = 0; r < SIZE; r++)
                for (let c = 0; c < SIZE; c++)
                    cellEls[r][c].textContent = puzzle.grid[r][c];
            gridSeed = state.seed;
        }

        const me = mySeat();
        const myTurn = isMyTurn();
        const owner = {}, reveal = new Set(), hintSet = new Set(), pulseSet = new Set();
        puzzle.placed.forEach((p, i) => {
            const o = state.foundBy[i];
            if (o !== -1) p.cells.forEach((rc) => { owner[key(rc[0], rc[1])] = o; });
            else if (cheats.reveal) p.cells.forEach((rc) => reveal.add(key(rc[0], rc[1])));
        });
        state.hints.forEach((h) => {
            const idx = puzzle.placed.findIndex((p) => p.word === h.word);
            if (idx === -1 || state.foundBy[idx] !== -1) return;
            hintSet.add(key(h.r, h.c));
            if (now() - h.ts < 4000) pulseSet.add(key(h.r, h.c));
        });
        const sel = new Set();
        if (state.phase === "play" && anchor) {
            const line = cur ? lineCells(anchor[0], anchor[1], cur[0], cur[1]) : null;
            (line || [anchor, cur].filter(Boolean)).forEach((rc) => sel.add(key(rc[0], rc[1])));
        }

        for (let r = 0; r < SIZE; r++)
            for (let c = 0; c < SIZE; c++) {
                const k = key(r, c);
                let cls = "ws-cell";
                if (owner[k] !== undefined) cls += owner[k] === 0 ? " ws-f0" : " ws-f1";
                else if (reveal.has(k)) cls += " ws-reveal";
                if (hintSet.has(k)) cls += " ws-hint" + (pulseSet.has(k) ? " ws-hintpulse" : "");
                if (sel.has(k) && owner[k] === undefined) cls += " ws-sel";
                if (activeFlash && activeFlash.set.has(k)) cls += " " + activeFlash.cls;
                if (myTurn && cursor[0] === r && cursor[1] === c) cls += " ws-cur";
                cellEls[r][c].className = cls;
            }

        listEl.innerHTML = puzzle.placed.map((p, i) => {
            const o = state.foundBy[i];
            const dot = o === -1 ? "" :
                '<i class="ws-dot" style="background:' + (o === 0 ? "var(--ws-p0)" : "var(--ws-p1)") + '"></i>';
            const coord = cheats.reveal && o === -1
                ? '<em class="ws-coord">R' + (p.cells[0][0] + 1) + "C" + (p.cells[0][1] + 1) + "</em>" : "";
            return '<li class="ws-item' + (o !== -1 ? " ws-done" : "") + '">' + dot +
                "<span>" + p.word + "</span>" + coord + "</li>";
        }).join("");

        hintWrap.hidden = state.hints.length === 0;
        hintsEl.innerHTML = state.hints.map((h) =>
            '<li class="ws-hintchip"><b>' + h.word + "</b> starts at R" + (h.r + 1) + "·C" + (h.c + 1) + "</li>"
        ).join("");

        const s = scores();
        const found = state.foundBy.filter((v) => v !== -1).length;
        foundEl.textContent = found + "/" + WORD_COUNT;
        timeEl.textContent = fmt(elapsed());
        bestEl.textContent = best == null ? "—" : fmt(best);
        bestChip.hidden = best == null;
        nameEls[0].textContent = seatName(0) + (me === 0 ? " · you" : "");
        nameEls[1].textContent = seatName(1) + (me === 1 ? " · you" : "");
        scoreEls[0].textContent = s[0];
        scoreEls[1].textContent = s[1];

        const turnText = state.phase === "play"
            ? (myTurn ? "Your turn" : seatName(state.turn) + "’s turn")
            : (state.phase === "over" ? "Finished" : "Ready");
        turnChip.textContent = turnText;
        turnChip.classList.toggle("ws-turnme", myTurn);
        statusEl.textContent = state.phase === "play" && !myTurn && !online
            ? "Bot is thinking…" : turnText;
        wrapper.dataset.turn = myTurn ? "me" : (state.phase === "play" ? "other" : "idle");
        cheatBadge.hidden = !(cheats.reveal || cheats.lazy);

        const lm = state.lastMove;
        const lastHint = state.hints[state.hints.length - 1];
        let msg = "";
        if (localNote) msg = localNote;
        else if (lastHint && lastHint.ts > (lm ? lm.ts : 0))
            msg = "Hint unlocked: " + lastHint.word + " starts at R" + (lastHint.r + 1) + "·C" + (lastHint.c + 1) + ".";
        else if (lm && lm.ts > 0) {
            const who = lm.actor === me ? "You" : seatName(lm.actor);
            if (lm.pass) msg = who + " skipped a turn.";
            else if (lm.ok) msg = lm.word === "ALL"
                ? who + " solved everything! (cheat)"
                : who + " found " + lm.word + " ✔";
            else msg = "No word there — turn passes.";
        } else if (state.phase === "play") msg = myTurn ? "Select a word." : "Waiting for " + seatName(state.turn) + "…";
        msgEl.textContent = msg;

        ovIntro.hidden = state.phase !== "intro" || helpOpen || cheatOpen || paused;
        ovOver.hidden = state.phase !== "over" || helpOpen || cheatOpen || paused;
        ovPause.hidden = !paused || helpOpen || cheatOpen;
        ovCheats.hidden = !cheatOpen || helpOpen || paused;
        ovHelp.hidden = !helpOpen;

        if (state.phase === "intro") {
            introMeta.textContent = "Coin toss: " +
                (state.starter === me ? "you start" : seatName(state.starter) + " starts") +
                " · You play as " + (me === 0 ? "Player 1 (indigo)" : "Player 2 (amber)") + ".";
        }
        if (state.phase === "over") {
            overTitle.textContent = state.winner === -1 ? "It’s a draw"
                : state.winner === me ? "You win! 🎉"
                    : seatName(state.winner) + " wins";
            overSub.textContent = "All six words found in " + fmt(elapsed()) + " · " +
                seatName(0) + " " + s[0] + " — " + s[1] + " " + seatName(1) +
                (!online && best != null ? " · Best " + fmt(best) + recordNote : "");
        }

        cheatBtns.reveal.textContent = cheats.reveal ? "On" : "Off";
        cheatBtns.reveal.classList.toggle("ws-on", cheats.reveal);
        cheatBtns.lazy.textContent = cheats.lazy ? "On" : "Off";
        cheatBtns.lazy.classList.toggle("ws-on", cheats.lazy);
        rowLazy.hidden = online;
        rowSkip.hidden = online;
        cheatBtns.hint.disabled = !myTurn;
        cheatBtns.find.disabled = !myTurn || unfoundList().length === 0;
        cheatBtns.solve.disabled = !myTurn;
        cheatBtns.skip.disabled = !(!online && state.phase === "play" && state.turn === 1);
        padCancel.disabled = !anchor;
        syncHudButtons();
    }

    /* Update label spans only — never button.textContent (it kills the icon). */
    function syncHudButtons() {
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".ws-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pbtn.setAttribute("title", paused ? "Resume (P)" : "Pause (P)");
            pbtn.disabled = online;
        }
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) {
            const active = cheats.reveal || cheats.lazy;
            cbtn.classList.toggle("on", active || cheatOpen);
            const label = cbtn.querySelector(".ws-btn-label");
            if (label) label.textContent = cheatOpen ? "Close cheats" : (active ? "Cheats •" : "Cheats");
        }
        const padbtn = root.querySelector('[data-act="pad"]');
        if (padbtn) padbtn.setAttribute("aria-pressed", String(wrapper.classList.contains("ws-pad-on")));
    }

    /* ---------- canonical state flow (host-authoritative) ---------- */
    function publish() {
        syncFromState();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function syncFromState() {
        ensurePuzzle();
        const lm = state.lastMove;
        if (lm && lm.ts > 0 && lm.ts !== seenMoveTs) {
            seenMoveTs = lm.ts;
            if (lm.cells && lm.cells.length) flashCells(lm.cells, lm.ok ? "ws-good" : "ws-bad");
        }
        render();
        scheduleBot();
    }
    function adoptState(next) {
        const seedChanged = !state || state.seed !== next.seed;
        state = next;
        if (seedChanged) {
            anchor = cur = null;
            cursor = [0, 0];
            activeFlash = null;
            seenMoveTs = next.lastMove ? next.lastMove.ts : 0;
            recordNote = "";
        }
        syncFromState();
    }

    function applyAction(action, actor) {
        if (!state || !action || (actor !== 0 && actor !== 1)) return;
        ensurePuzzle();
        const t = action.type;

        if (t === "start") {
            if (state.phase !== "intro") return;
            state.phase = "play";
            state.startAt = now();
        } else if (t === "restart") {
            const keepSeat = state.hostSeat;
            state = freshState("play");
            state.hostSeat = keepSeat;
            anchor = cur = null;
            cursor = [0, 0];
            activeFlash = null;
            seenMoveTs = 0;
            recordNote = "";
            paused = false;
            frozenAtReal = 0;
            pauseShift = 0;
            clearTimers();
        } else if (t === "select") {
            if (state.phase !== "play" || actor !== state.turn) return;
            const { r1, c1, r2, c2 } = action;
            if (![r1, c1, r2, c2].every((n) => Number.isInteger(n) && n >= 0 && n < SIZE)) return;
            const cells = lineCells(r1, c1, r2, c2);
            if (!cells) return;
            const hit = matchLine(puzzle.grid, r1, c1, r2, c2, placedView());
            state.moves++;
            if (hit) {
                const idx = puzzle.placed.findIndex((p) => p.word === hit.word);
                state.foundBy[idx] = actor;
                state.misses[actor] = 0;
                state.lastMove = { ts: now(), actor, ok: true, word: hit.word, cells, pass: false };
                if (state.foundBy.every((v) => v !== -1)) finish();
                else state.turn = 1 - actor;
            } else {
                state.misses[actor]++;
                state.lastMove = { ts: now(), actor, ok: false, word: "", cells, pass: false };
                if (state.misses[actor] >= 2) { addHint(); state.misses[actor] = 0; }
                state.turn = 1 - actor;
            }
        } else if (t === "hint") {
            if (state.phase !== "play" || actor !== state.turn) return;
            addHint();
        } else if (t === "pass") {
            if (state.phase !== "play" || actor !== state.turn) return;
            state.turn = 1 - actor;
            state.lastMove = { ts: now(), actor, ok: false, word: "", cells: [], pass: true };
        } else if (t === "solve") {
            if (state.phase !== "play" || actor !== state.turn) return;
            state.foundBy = state.foundBy.map((v) => (v === -1 ? actor : v));
            state.lastMove = { ts: now(), actor, ok: true, word: "ALL", cells: [], pass: false };
            finish();
        } else return;

        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySeat());
    }

    /* ---------- bot (AI mode) ---------- */
    function scheduleBot() {
        if (botTimer) cancelLater(botTimer);
        if (online || !state) return;
        if (state.phase !== "play" || state.turn !== 1 || helpOpen || paused || cheatOpen) return;
        const delay = cheats.lazy ? 3200 + Math.random() * 2000 : 1100 + Math.random() * 1200;
        botTimer = later(() => { botTimer = null; botMove(); }, delay);
    }
    function botMove() {
        if (!state || state.phase !== "play" || state.turn !== 1) return;
        ensurePuzzle();
        const un = unfoundList();
        if (!un.length) return;
        const acc = cheats.lazy ? 0.35 : 0.7;
        if (Math.random() < acc) {
            const { p } = un[(Math.random() * un.length) | 0];
            const a = p.cells[0], b = p.cells[p.cells.length - 1];
            applyAction({ type: "select", r1: a[0], c1: a[1], r2: b[0], c2: b[1] }, 1);
        } else {
            /* garis pendek 2–4 huruf: tidak mungkin cocok (semua kata >= 6 huruf) */
            for (let t = 0; t < 20; t++) {
                const d = DIRS[(Math.random() * DIRS.length) | 0];
                const len = 2 + ((Math.random() * 3) | 0);
                const r1 = (Math.random() * SIZE) | 0, c1 = (Math.random() * SIZE) | 0;
                const r2 = r1 + d[0] * (len - 1), c2 = c1 + d[1] * (len - 1);
                if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
                applyAction({ type: "select", r1, c1, r2, c2 }, 1);
                return;
            }
            applyAction({ type: "pass" }, 1);
        }
    }

    /* ---------- selection: mouse / touch / keyboard / pad ---------- */
    function cellFromPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        const c = el && el.closest ? el.closest("[data-cell]") : null;
        if (!c || !gridEl.contains(c)) return null;
        return [+c.dataset.r, +c.dataset.c];
    }
    function trySelect(a, b) {
        if (!a || !b) return;
        const line = lineCells(a[0], a[1], b[0], b[1]);
        if (!line) { note("Straight lines only — across, down or diagonal."); return; }
        submitAction({ type: "select", r1: a[0], c1: a[1], r2: b[0], c2: b[1] });
        anchor = cur = null;
    }
    function confirmSelect() {
        if (!isMyTurn()) return;
        if (!anchor) { anchor = [...cursor]; cur = [...cursor]; }
        else if (cur && cur[0] === anchor[0] && cur[1] === anchor[1]) anchor = cur = null;
        else trySelect(anchor, cur || cursor);
        render();
    }
    function stepCursor(v) {
        if (helpOpen || cheatOpen || paused) return;
        cursor = [clamp(cursor[0] + v[0]), clamp(cursor[1] + v[1])];
        if (anchor) cur = [...cursor];
        render();
    }

    function onGridDown(e) {
        if (!isMyTurn() || helpOpen || cheatOpen || paused) return;
        const cell = e.target.closest && e.target.closest("[data-cell]");
        if (!cell) return;
        e.preventDefault();
        try { gridEl.setPointerCapture(e.pointerId); } catch (_) { }
        const rc = [+cell.dataset.r, +cell.dataset.c];
        if (anchor && (rc[0] !== anchor[0] || rc[1] !== anchor[1])) {
            dragMode = "complete"; cur = rc;
        } else {
            dragMode = "fresh"; anchor = rc; cur = rc; cursor = [...rc];
        }
        dragging = true;
        render();
    }
    function onGridMove(e) {
        if (!dragging) return;
        const rc = cellFromPoint(e.clientX, e.clientY);
        if (rc) { cur = rc; cursor = [...rc]; render(); }
    }
    function onGridCancel() {
        dragging = false;
        cur = anchor ? [...anchor] : null;
        render();
    }
    function onDocPointerUp(e) {
        stopPadRepeat();
        if (!dragging) return;
        dragging = false;
        cur = cellFromPoint(e.clientX, e.clientY) || cur;
        if (anchor && cur) {
            if (cur[0] === anchor[0] && cur[1] === anchor[1]) {
                if (dragMode === "complete") anchor = cur = null; /* tap sama = batal */
                /* tap pertama: anchor tetap menunggu ujung kedua */
            } else trySelect(anchor, cur);
        }
        render();
    }

    /* virtual D-pad (mobile) — tahan tombol arah untuk repeat */
    const PAD_DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    function stopPadRepeat() {
        if (padRepeat) { clearInterval(padRepeat); padRepeat = null; }
    }
    function padPointerDown(e) {
        const b = e.target.closest && e.target.closest("[data-dir]");
        if (!b || !root.contains(b)) return;
        e.preventDefault();
        const v = PAD_DIRS[b.dataset.dir];
        if (!v) return;
        stepCursor(v);
        stopPadRepeat();
        padRepeat = setInterval(() => stepCursor(v), 150);
    }

    /* keyboard (desktop) */
    const KEYMAP = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
    };
    /* Overlays are mutually exclusive and share the frozen clock. */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatOpen = false; paused = false; }
        stopPadRepeat();
        syncFreeze();
        render();
        scheduleBot();
    }
    function toggleCheats(on) {
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) { helpOpen = false; paused = false; }
        stopPadRepeat();
        syncFreeze();
        render();
        scheduleBot();
    }
    function setPaused(on) {
        if (online) return;
        paused = typeof on === "boolean" ? on : !paused;
        if (paused) { helpOpen = false; cheatOpen = false; }
        stopPadRepeat();
        syncFreeze();
        render();
        scheduleBot();
    }
    function togglePad() {
        const on = wrapper.classList.toggle("ws-pad-on");
        const b = root.querySelector('[data-act="pad"]');
        if (b) b.setAttribute("aria-pressed", String(on));
    }
    function restartGame() {
        if (!state) return;
        paused = false;
        frozenAtReal = 0;
        pauseShift = 0;
        clearTimers();
        stopPadRepeat();
        submitAction({ type: "restart" });
    }

    function onKey(e) {
        if (!root.isConnected || e.defaultPrevented) return;
        const t = e.target;
        if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key, code = e.code || "";
        const hit = (c) => code === c || String(k).toLowerCase() === c.slice(3).toLowerCase();
        /* priority: help → cheats → pause/Escape → restart → game actions */
        if (hit("KeyH") || k === "?") { toggleHelp(); e.preventDefault(); return; }
        if (hit("KeyC")) { if (!helpOpen) toggleCheats(); e.preventDefault(); return; }
        if (hit("KeyP")) {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else setPaused();
            e.preventDefault(); return;
        }
        if (k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) setPaused(false);
            else if (anchor) { anchor = cur = null; render(); }
            e.preventDefault(); return;
        }
        if (hit("KeyR") || hit("KeyN")) { restartGame(); e.preventDefault(); return; }
        if (hit("KeyG")) { togglePad(); e.preventDefault(); return; }
        if (helpOpen || cheatOpen || paused) return;
        if (!state) return;
        const onButton = t && t.closest && t.closest("button");
        if (state.phase === "intro" && (k === "Enter" || k === " ") && !onButton) {
            submitAction({ type: "start" }); e.preventDefault(); return;
        }
        const mv = KEYMAP[k] || KEYMAP[String(k).toLowerCase()];
        if (mv) { stepCursor(mv); e.preventDefault(); return; }
        if ((k === "Enter" || k === " ") && !onButton) { confirmSelect(); e.preventDefault(); }
    }

    /* ---------- click delegation ---------- */
    function cheatFind() {
        if (!isMyTurn()) return;
        ensurePuzzle();
        const un = unfoundList();
        if (!un.length) return;
        const { p } = un[(Math.random() * un.length) | 0];
        const a = p.cells[0], b = p.cells[p.cells.length - 1];
        submitAction({ type: "select", r1: a[0], c1: a[1], r2: b[0], c2: b[1] });
    }
    function handleClick(e) {
        const el = e.target.closest && e.target.closest("[data-exit],[data-act],[data-help],[data-cheats],[data-pause],[data-restart]");
        if (!el || !root.contains(el)) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.hasAttribute("data-help")) { toggleHelp(); return; }
        if (el.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (el.hasAttribute("data-pause")) { setPaused(); return; }
        if (el.hasAttribute("data-restart")) { restartGame(); return; }
        switch (el.dataset.act) {
            case "start": submitAction({ type: "start" }); break;
            case "restart": restartGame(); break;
            case "help": toggleHelp(); break;
            case "helpclose": toggleHelp(false); break;
            case "cheats": toggleCheats(); break;
            case "cheatsclose": toggleCheats(false); break;
            case "resume": setPaused(false); break;
            case "pad": togglePad(); break;
            case "pad-ok": confirmSelect(); break;
            case "pad-cancel": anchor = cur = null; render(); break;
            case "cheat-reveal": cheats.reveal = !cheats.reveal; render(); break;
            case "cheat-lazy": cheats.lazy = !cheats.lazy; render(); scheduleBot(); break;
            case "cheat-hint": if (isMyTurn()) submitAction({ type: "hint" }); break;
            case "cheat-find": cheatFind(); break;
            case "cheat-solve": if (isMyTurn()) submitAction({ type: "solve" }); break;
            case "cheat-skip":
                if (!online && state && state.phase === "play" && state.turn === 1)
                    applyAction({ type: "pass" }, 1);
                break;
        }
    }

    /* ---------- wiring ---------- */
    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", padPointerDown);
    gridEl.addEventListener("pointerdown", onGridDown);
    gridEl.addEventListener("pointermove", onGridMove);
    gridEl.addEventListener("pointercancel", onGridCancel);
    document.addEventListener("pointerup", onDocPointerUp);
    document.addEventListener("keydown", onKey);
    tickTimer = setInterval(() => {
        if (frozen()) return;
        if (state && state.phase !== "intro") timeEl.textContent = fmt(elapsed());
    }, 500);
    syncFreeze();

    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = freshState("intro");   // host: random seed, random starter, random hostSeat
            publish();
            const offAction = room.onAction((action) =>
                applyAction(action, state ? 1 - state.hostSeat : 1)); // aksi guest = kursi guest
            if (typeof offAction === "function") offs.push(offAction);
        } else {
            const offState = room.onState((nextState) => { if (nextState) adoptState(nextState); });
            if (typeof offState === "function") offs.push(offState);
            render();
        }
    } else {
        state = freshState("intro");     // vs bot: random starter
        render();
    }

    return {
        destroy() {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", padPointerDown);
            gridEl.removeEventListener("pointerdown", onGridDown);
            gridEl.removeEventListener("pointermove", onGridMove);
            gridEl.removeEventListener("pointercancel", onGridCancel);
            document.removeEventListener("pointerup", onDocPointerUp);
            document.removeEventListener("keydown", onKey);
            if (tickTimer) clearInterval(tickTimer);
            clearTimers();
            stopPadRepeat();
            offs.forEach((off) => { try { off(); } catch (_) { } });
            state = null;
        },
    };
}