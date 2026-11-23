/*
  PIPE CONNECT — format template baru (META + mount).
  1. Simpan file ini sebagai games/pipe-connect.js (id META = nama file).
  2. Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "pipe-connect",
    name: "Pipe Connect",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Putar pipa, alirkan air dari katup START ke meteran FINISH. Adu cepat lawan bot atau teman satu room.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 24h10"/><path d="M16 24v-8h8"/><circle cx="24" cy="16" r="4"/><path d="M32 24h10"/><path d="M32 24V14"/><path d="M32 24v8"/><path d="M24 38h8"/><path d="M16 30v8h8"/><circle cx="12" cy="24" r="2.5" fill="currentColor" stroke="none"/></svg>',
    bg: ["#e0f2fe", "#bae6fd"],
    bestKey: "pipeConnectBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ================= pure logic ================= */
    /* bit arah: N=1 E=2 S=4 W=8 */
    const SIZE = 6;
    const MOVE_LIMIT = 60;
    const CELL = 64;
    const BOARD = SIZE * CELL;
    const OPP = { 1: 4, 4: 1, 2: 8, 8: 2 };
    const DIRS = [[1, -1, 0], [2, 0, 1], [4, 1, 0], [8, 0, -1]];

    const rotOnce = (m) => ((m << 1) | (m >>> 3)) & 15;
    function rotate(m, times) {
        let v = m & 15;
        for (let i = 0; i < (times & 3); i++) v = rotOnce(v);
        return v;
    }
    function dirFromTo(a, b) {
        if (b[0] === a[0] - 1) return 1;
        if (b[1] === a[1] + 1) return 2;
        if (b[0] === a[0] + 1) return 4;
        return 8;
    }

    /* Transformasi orientasi papan: sumber bisa di sisi L/T/R/B.
       Peta titik + peta bit arah agar jalur tetap tersambung. */
    const PT = [
        (r, c) => [r, c],
        (r, c) => [c, r],
        (r, c) => [r, SIZE - 1 - c],
        (r, c) => [SIZE - 1 - c, r],
    ];
    const DM = [
        { 1: 1, 2: 2, 4: 4, 8: 8 },
        { 1: 8, 2: 4, 4: 2, 8: 1 },
        { 1: 1, 2: 8, 4: 4, 8: 2 },
        { 1: 8, 2: 1, 4: 2, 8: 4 },
    ];
    const SIDES = [["L", "R"], ["T", "B"], ["R", "L"], ["B", "T"]];
    const OUT_BIT = { L: 8, R: 2, T: 1, B: 4 };
    function tmask(m, mode) {
        let out = 0;
        for (const b of [1, 2, 4, 8]) if (m & b) out |= DM[mode][b];
        return out;
    }

    /* Generator level: jalur solusi dibuat lebih dulu (dijamin solvable),
       lalu diacak. Limbah hanya ditaruh di luar jalur solusi. */
    function makeLevel(rnd) {
        const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
        const mode = Math.floor(rnd() * 4);
        const rows = [Math.floor(rnd() * SIZE)];
        for (let c = 1; c < SIZE - 1; c++) {
            const step = pick([-2, -1, -1, 0, 0, 1, 1, 2]);
            rows.push(Math.max(0, Math.min(SIZE - 1, rows[c - 1] + step)));
        }
        rows.push(Math.floor(rnd() * SIZE));

        const cells = [[rows[0], 0]];
        for (let c = 1; c < SIZE; c++) {
            const from = rows[c - 1], to = rows[c];
            const step = to > from ? 1 : -1;
            for (let r = from; r !== to; r += step) cells.push([r, c]);
            cells.push([to, c]);
        }
        const seen = new Set();
        const path = cells.filter(([r, c]) => {
            const k = r * SIZE + c;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });

        const sol = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
        path.forEach(([r, c], i) => {
            let m = 0;
            if (i > 0) m |= dirFromTo([r, c], path[i - 1]);
            if (i < path.length - 1) m |= dirFromTo([r, c], path[i + 1]);
            sol[r][c] = m;
        });

        /* variasi: sebagian pipa jalur di-upgrade jadi T / silang (superset, tetap solvable) */
        for (let i = 1; i < path.length - 1; i++) {
            const [r, c] = path[i];
            const m = sol[r][c];
            if (m === 0 || (m & (m - 1)) === 0 || m === 15) continue;
            const bits = [1, 2, 4, 8].filter((b) => m & b);
            if (bits.length !== 2) continue;
            const p = rnd();
            if (p < 0.08) sol[r][c] = 15;
            else if (p < 0.26) {
                const missing = [];
                for (const [b, dr, dc] of DIRS) {
                    if (m & b) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nc >= 0 && nr < SIZE && nc < SIZE) missing.push(b);
                }
                if (missing.length) sol[r][c] = m | pick(missing);
            }
        }

        const src = path[0], dst = path[path.length - 1];
        const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (!sol[r][c]) continue;
                const isEnd = (r === src[0] && c === src[1]) || (r === dst[0] && c === dst[1]);
                if (isEnd) { grid[r][c] = sol[r][c]; continue; }
                const ks = [1, 2, 3].filter((k) => rotate(sol[r][c], k) !== sol[r][c]);
                grid[r][c] = ks.length ? rotate(sol[r][c], pick(ks)) : sol[r][c];
            }
        }

        /* sel non-jalur: limbah (-1, terkunci) + filler pipa bervariasi */
        const off = [];
        for (let r = 0; r < SIZE; r++)
            for (let c = 0; c < SIZE; c++) if (!sol[r][c]) off.push([r, c]);
        for (let i = off.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [off[i], off[j]] = [off[j], off[i]];
        }
        const nBlock = 4 + Math.floor(rnd() * 3);
        off.forEach(([r, c], i) => {
            if (i < nBlock) { grid[r][c] = -1; return; }
            const p = rnd();
            const base = p < 0.34 ? 5 : p < 0.64 ? 3 : p < 0.8 ? 7 : p < 0.9 ? 1 : 15;
            grid[r][c] = rotate(base, Math.floor(rnd() * 4));
        });

        /* putar orientasi papan (variasi posisi start) */
        const g2 = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
        const s2 = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const [nr, nc] = PT[mode](r, c);
                g2[nr][nc] = grid[r][c] < 0 ? -1 : tmask(grid[r][c], mode);
                s2[nr][nc] = tmask(sol[r][c], mode);
            }
        }
        return {
            grid: g2, sol: s2,
            src: PT[mode](src[0], src[1]),
            dst: PT[mode](dst[0], dst[1]),
            srcSide: SIDES[mode][0], dstSide: SIDES[mode][1],
        };
    }

    const maskAt = (g, r, c) => (g[r][c] > 0 ? g[r][c] : 0);
    function flowCells(level) {
        const g = level.grid;
        const seen = new Set([level.src[0] * SIZE + level.src[1]]);
        const q = [[level.src[0], level.src[1]]];
        while (q.length) {
            const [r, c] = q.shift();
            const m = maskAt(g, r, c);
            for (const [d, dr, dc] of DIRS) {
                if (!(m & d)) continue;
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) continue;
                if (!(maskAt(g, nr, nc) & OPP[d])) continue;
                const k = nr * SIZE + nc;
                if (seen.has(k)) continue;
                seen.add(k);
                q.push([nr, nc]);
            }
        }
        return seen;
    }
    const solved = (level) => flowCells(level).has(level.dst[0] * SIZE + level.dst[1]);

    function freshLevel() {
        for (let i = 0; i < 25; i++) {
            const L = makeLevel(Math.random);
            if (!solved(L)) return L; /* jangan mulai dengan papan yang sudah tersambung */
        }
        return makeLevel(Math.random);
    }

    /* Bot: 65% langkah pintar (mendekati solusi), 35% acak (bisa salah). */
    function botPick(level) {
        const g = level.grid, s = level.sol;
        const isEnd = (r, c) =>
            (r === level.src[0] && c === level.src[1]) ||
            (r === level.dst[0] && c === level.dst[1]);
        const cands = [];
        const free = [];
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (isEnd(r, c) || g[r][c] <= 0) continue;
                free.push([r, c]);
                if (s[r][c] > 0 && g[r][c] !== s[r][c]) {
                    let k = 9;
                    for (let t = 1; t <= 3; t++) if (rotate(g[r][c], t) === s[r][c]) { k = t; break; }
                    cands.push([k, r, c]);
                }
            }
        }
        if (cands.length && Math.random() < 0.65) {
            const best = Math.min(...cands.map((x) => x[0]));
            const pool = cands.filter((x) => x[0] === best);
            const [, r, c] = pool[Math.floor(Math.random() * pool.length)];
            return { r, c };
        }
        const [r, c] = free[Math.floor(Math.random() * free.length)];
        return { r, c };
    }

    /* ================= state ================= */
    function newState() {
        return {
            v: 1,
            phase: "ready", /* ready | playing | won | lost */
            level: freshLevel(),
            turns: MOVE_LIMIT,
            moves: 0,
            turnOf: Math.random() < 0.5 ? 0 : 1,          /* undian giliran pertama */
            firstSeat: 0,
            seatOf: online && Math.random() < 0.5 ? [1, 0] : [0, 1], /* undian posisi P1/P2 */
            winner: null,
            botFrozen: false,
            unlimited: false,
            cheated: false,
        };
    }
    function initState() {
        const s = newState();
        s.firstSeat = s.turnOf;
        return s;
    }

    /* ================= ikon SVG (tanpa emoji) ================= */
    const IC = {
        cw: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        ccw: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.12-9.36L1 10"/></svg>',
        up: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>',
        down: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
        left: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18"/></svg>',
        right: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>',
    };
    function miniPipe(mask, color) {
        let s = "";
        if (mask & 1) s += '<path d="M20 20V2"/>';
        if (mask & 2) s += '<path d="M20 20h18"/>';
        if (mask & 4) s += '<path d="M20 20v18"/>';
        if (mask & 8) s += '<path d="M20 20H2"/>';
        return `<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="${color}" stroke-width="7" aria-hidden="true">${s}<circle cx="20" cy="20" r="6" fill="#fff" stroke-width="2.5"/></svg>`;
    }
    const MINI = {
        straight: miniPipe(5, "#94a3b8"),
        elbow: miniPipe(3, "#94a3b8"),
        tee: miniPipe(7, "#94a3b8"),
        cross: miniPipe(15, "#94a3b8"),
        cap: miniPipe(1, "#94a3b8"),
        wet: miniPipe(5, "#0ea5e9"),
        waste: '<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#d97706" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="32" height="32" rx="7" fill="#fffbeb" stroke="#fde68a"/><path d="M13 15h14"/><path d="M17 15v-2h6v2"/><rect x="15" y="15" width="10" height="13" rx="2"/><path d="M18 19v6M22 19v6"/></svg>',
        src: '<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#0284c7" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="20" cy="20" r="10" fill="#e0f2fe"/><path d="M20 12v16M12 20h16"/><circle cx="20" cy="20" r="3" fill="#0284c7" stroke="none"/></svg>',
        dst: '<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="#059669" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="20" cy="20" r="10" fill="#fff"/><path d="M20 20l5-5"/><circle cx="20" cy="20" r="2" fill="#059669" stroke="none"/></svg>',
    };

    /* ================= shell (design minimalis) ================= */
    root.innerHTML = `
<style>
.pc-app{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;display:flex;flex-direction:column;gap:14px;width:100%;max-width:560px;margin:0 auto;padding:4px 0}
.pc-app .game-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.pc-app .game-intro h2{margin:0;font-size:20px;letter-spacing:-.01em}
.pc-app .game-intro p{margin:4px 0 0;font-size:13px;color:#64748b;line-height:1.5}
.pc-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:6px 12px;white-space:nowrap}
.pc-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block}
.pc-app .game-status.pc-s-turn .game-status-dot{background:#0284c7}
.pc-app .game-status.pc-s-wait .game-status-dot{background:#d97706}
.pc-app .game-status.pc-s-win .game-status-dot{background:#059669}
.pc-app .game-status.pc-s-bad .game-status-dot{background:#e11d48}
.pc-app .game-panel{position:relative;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.pc-app .pc-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
.pc-app .pc-chip{font-size:12px;color:#64748b;background:#f8fafc;border:1px solid #eef2f7;border-radius:999px;padding:5px 10px;font-weight:600}
.pc-app .pc-chip b{color:#0f172a;font-variant-numeric:tabular-nums}
.pc-app .pc-chip.pc-you{color:#0284c7;border-color:#bae6fd;background:#f0f9ff}
.pc-app .pc-chip.pc-cheat{color:#d97706;border-color:#fde68a;background:#fffbeb}
.pc-app .pc-board-wrap{width:100%;max-width:460px;margin:0 auto;aspect-ratio:1/1;background:#fbfcfe;border:1px solid #e8eef5;border-radius:14px;padding:6px}
.pc-app .pc-board{width:100%;height:100%;display:block;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.pc-app .pc-hit rect{cursor:pointer}
.pc-app .pc-legend{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:11.5px;color:#64748b;align-items:center}
.pc-app .pc-legend span{display:inline-flex;align-items:center;gap:5px}
.pc-app .pc-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.pc-app .pc-sq{width:10px;height:10px;border-radius:3px;display:inline-block}
.pc-app .pc-msg{min-height:20px;text-align:center;font-size:13px;font-weight:600;color:#64748b}
.pc-app .pc-msg.pc-good{color:#0284c7}
.pc-app .pc-msg.pc-bad{color:#e11d48}
.pc-app .pc-pad{display:none;justify-content:center;align-items:center;gap:24px;padding:2px 0}
@media (hover:none),(max-width:720px){.pc-app .pc-pad{display:flex}}
.pc-app.pc-pad-on .pc-pad{display:flex}
.pc-app .pc-dpad{display:grid;grid-template-areas:". u ." "l . r" ". d .";gap:6px}
.pc-app .pc-u{grid-area:u}.pc-app .pc-d{grid-area:d}.pc-app .pc-l{grid-area:l}.pc-app .pc-r{grid-area:r}
.pc-app .pc-pad-btn{width:46px;height:46px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;color:#334155;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.pc-app .pc-pad-btn:active{background:#f0f9ff;border-color:#bae6fd}
.pc-app .pc-pad-btn:disabled{opacity:.4;cursor:default}
.pc-app .pc-rot{width:56px;height:56px;border-radius:16px}
.pc-app .pc-rot-main{background:#0284c7;color:#fff;border-color:#0284c7}
.pc-app .pc-rot-main:active{background:#0369a1}
.pc-app .pc-pad-col{display:flex;flex-direction:column;gap:8px;align-items:center}
.pc-app .pc-pad-cap{font-size:10.5px;color:#94a3b8;font-weight:600}
.pc-app .game-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.pc-app .pc-btn,.pc-app .game-action-button{border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:12px;padding:10px 14px;font-size:13.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;justify-content:center;font-family:inherit}
.pc-app .pc-btn:hover,.pc-app .game-action-button:hover{background:#f8fafc}
.pc-app .pc-btn:disabled{opacity:.45;cursor:default}
.pc-app .pc-btn-main{background:#0f172a;color:#fff;border-color:#0f172a}
.pc-app .pc-btn-main:hover{background:#1e293b}
.pc-app .pc-kbd-hint{font-size:11.5px;color:#94a3b8;text-align:center;line-height:1.7}
@media (hover:none){.pc-app .pc-kbd-hint{display:none}}
.pc-app .pc-kbd{background:#f1f5f9;border:1px solid #e2e8f0;border-bottom-width:2px;border-radius:6px;padding:1px 6px;font-size:11px;font-family:ui-monospace,SFMono-Regular,monospace;color:#475569}
.pc-app .pc-ov{position:absolute;inset:0;background:rgba(248,250,252,.93);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:5;border-radius:18px;animation:pc-fade .22s ease-out}
.pc-app [hidden]{display:none !important}
.pc-app .pc-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;max-width:410px;width:100%;box-shadow:0 12px 32px rgba(15,23,42,.10);max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:12px}
.pc-app .pc-card h3{margin:0;font-size:18px;letter-spacing:-.01em}
.pc-app .pc-card h3.pc-win{color:#059669}
.pc-app .pc-card h3.pc-lose{color:#e11d48}
.pc-app .pc-ov-sub{margin:0;font-size:13.5px;color:#64748b;line-height:1.55}
.pc-app .pc-draw{font-size:13px;color:#334155;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:10px 12px;line-height:1.6}
.pc-app .pc-row{display:flex;gap:8px;flex-wrap:wrap}
.pc-app .pc-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin:4px 0 0}
.pc-app .pc-tut-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.pc-app .pc-tut-item{display:flex;align-items:center;gap:8px;border:1px solid #eef2f7;border-radius:10px;padding:7px 9px;background:#f8fafc;font-size:11.5px;color:#475569;font-weight:600}
.pc-app .pc-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #eef2f7;border-radius:12px;padding:10px 12px;background:#f8fafc}
.pc-app .pc-cheat-row b{font-size:13px;display:block}
.pc-app .pc-cheat-row small{font-size:11.5px;color:#64748b;line-height:1.4;display:block;margin-top:2px}
.pc-app .pc-pill{font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 8px;background:#e2e8f0;color:#64748b}
.pc-app .pc-pill.pc-on{background:#fef3c7;color:#d97706}
.pc-app .pc-note{font-size:11.5px;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 10px;line-height:1.5}
@keyframes pc-fade{from{opacity:0}to{opacity:1}}
@keyframes pc-cw{from{transform:rotate(-90deg)}to{transform:rotate(0deg)}}
@keyframes pc-ccw{from{transform:rotate(90deg)}to{transform:rotate(0deg)}}
.pc-app .pc-anim-cw{transform-box:fill-box;transform-origin:center;animation:pc-cw .18s ease-out}
.pc-app .pc-anim-ccw{transform-box:fill-box;transform-origin:center;animation:pc-ccw .18s ease-out}
@keyframes pc-pulse{0%,100%{opacity:.55}50%{opacity:.12}}
.pc-app .pc-halo{animation:pc-pulse 2.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.pc-app *{animation:none !important}}
</style>
<div class="game-app pc-app">
  <div class="game-intro">
    <div><h2>Pipe Connect</h2><p data-intro>Putar pipa, alirkan air dari katup START ke meteran FINISH.</p></div>
    <span class="game-status" data-status-wrap><i class="game-status-dot"></i><span data-status aria-live="polite">Siap</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="pc-hud">
      <span class="pc-chip">Langkah <b data-hud="turns">–</b></span>
      <span class="pc-chip">Aliran <b data-hud="flow">–</b></span>
      <span class="pc-chip pc-you">Kamu <b data-hud="seat">–</b></span>
      <span class="pc-chip" data-best-chip>Rekor <b data-hud="best">–</b></span>
      <span class="pc-chip pc-cheat" data-cheat-badge hidden>cheat aktif</span>
    </div>
    <div class="pc-board-wrap">
      <svg class="pc-board" viewBox="-34 -34 ${BOARD + 68} ${BOARD + 68}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Papan Pipe Connect" tabindex="0">
        <g data-g="board"></g>
        <g data-g="cursor"></g>
        <g data-g="hit" class="pc-hit"></g>
      </svg>
    </div>
    <div class="pc-legend">
      <span><i class="pc-dot" style="background:#0284c7"></i>START (katup, terkunci)</span>
      <span><i class="pc-dot" style="background:#059669"></i>FINISH (meteran, terkunci)</span>
      <span><i class="pc-sq" style="background:#fde68a"></i>Limbah (terkunci)</span>
      <span><i class="pc-dot" style="background:#0ea5e9"></i>Pipa teraliri air</span>
    </div>
    <div class="pc-msg" data-msg aria-live="polite"></div>
    <div class="pc-pad">
      <div class="pc-dpad">
        <button type="button" class="pc-pad-btn pc-u" data-pad="up" aria-label="Pilih sel atas">${IC.up}</button>
        <button type="button" class="pc-pad-btn pc-l" data-pad="left" aria-label="Pilih sel kiri">${IC.left}</button>
        <button type="button" class="pc-pad-btn pc-r" data-pad="right" aria-label="Pilih sel kanan">${IC.right}</button>
        <button type="button" class="pc-pad-btn pc-d" data-pad="down" aria-label="Pilih sel bawah">${IC.down}</button>
      </div>
      <div class="pc-pad-col">
        <div style="display:flex;gap:10px">
          <button type="button" class="pc-pad-btn pc-rot" data-pad="ccw" aria-label="Putar berlawanan jarum jam">${IC.ccw}</button>
          <button type="button" class="pc-pad-btn pc-rot pc-rot-main" data-pad="cw" aria-label="Putar searah jarum jam">${IC.cw}</button>
        </div>
        <span class="pc-pad-cap">putar pipa terpilih</span>
      </div>
    </div>

    <div class="pc-ov" data-ov="start" hidden>
      <div class="pc-card" role="dialog" aria-modal="true" aria-label="Mulai permainan">
        <h3>Pipe Connect</h3>
        <p class="pc-ov-sub" data-start-desc></p>
        <div class="pc-draw" data-start-draw></div>
        <div class="pc-row">
          <button type="button" class="pc-btn pc-btn-main" data-act="start">Mulai</button>
          <button type="button" class="pc-btn" data-act="tutorial">Cara bermain</button>
        </div>
      </div>
    </div>
    <div class="pc-ov" data-ov="result" hidden>
      <div class="pc-card" role="dialog" aria-modal="true" aria-label="Hasil permainan">
        <h3 data-res-title>Selesai</h3>
        <p class="pc-ov-sub" data-res-reason></p>
        <div class="pc-row">
          <button type="button" class="pc-btn pc-btn-main" data-act="restart">Main lagi</button>
          <button type="button" class="pc-btn" data-act="dismiss">Lihat papan</button>
        </div>
      </div>
    </div>
    <div class="pc-ov" data-ov="tutorial" hidden>
      <div class="pc-card" role="dialog" aria-modal="true" aria-label="Cara bermain">
        <h3>Cara bermain</h3>
        <p class="pc-sec">Tujuan</p>
        <p class="pc-ov-sub">Sambugkan air dari katup <b>START</b> (biru, berdenyut) ke meteran <b>FINISH</b> (hijau). Pipa yang teraliri air berubah biru. Setiap putaran mengurangi satu langkah bersama.</p>
        <p class="pc-sec">Giliran</p>
        <p class="pc-ov-sub">Lawan bot / pemain room: bergiliran memutar satu pipa. <b>Pemain yang putarannya membuat air sampai ke meteran menang.</b> Giliran pertama diundi acak; di mode room, posisi P1/P2 juga diundi. Jika langkah habis, semua kalah.</p>
        <p class="pc-sec">Kontrol desktop</p>
        <p class="pc-ov-sub">Klik kiri: putar searah jarum jam · klik kanan: berlawanan.<br>
        <span class="pc-kbd">←↑↓→</span>/<span class="pc-kbd">WASD</span> pilih sel · <span class="pc-kbd">Spasi</span>/<span class="pc-kbd">Enter</span>/<span class="pc-kbd">E</span> putar · <span class="pc-kbd">Q</span> putar balik · <span class="pc-kbd">R</span> papan baru · <span class="pc-kbd">T</span> tutorial · <span class="pc-kbd">C</span> cheat · <span class="pc-kbd">H</span> bocoran solusi · <span class="pc-kbd">Esc</span> tutup.</p>
        <p class="pc-sec">Kontrol mobile</p>
        <p class="pc-ov-sub">Ketuk pipa untuk memutar, atau pilih sel dengan D-pad lalu tekan tombol putar biru (searah jarum jam) / putih (berlawanan).</p>
        <p class="pc-sec">Jenis pipa & petak</p>
        <div class="pc-tut-grid">
          <div class="pc-tut-item">${MINI.straight}Lurus</div>
          <div class="pc-tut-item">${MINI.elbow}Belok</div>
          <div class="pc-tut-item">${MINI.tee}Cabang-T</div>
          <div class="pc-tut-item">${MINI.cross}Silang</div>
          <div class="pc-tut-item">${MINI.cap}Buntu</div>
          <div class="pc-tut-item">${MINI.wet}Teraliri air</div>
          <div class="pc-tut-item">${MINI.src}Katup START</div>
          <div class="pc-tut-item">${MINI.dst}Meteran FINISH</div>
          <div class="pc-tut-item">${MINI.waste}Limbah: terkunci, air tidak bisa lewat</div>
        </div>
        <p class="pc-sec">Tips</p>
        <p class="pc-ov-sub">Telusuri glow biru dari START untuk menemukan sambungan yang putus.Katup, meteran, dan limbah tidak bisa diputar. Lawan bisa saja "mencuri" kemenangan dari sambungan yang kamu siapkan — hati-hati!</p>
        <div class="pc-row"><button type="button" class="pc-btn pc-btn-main" data-act="close-tutorial">Tutup</button></div>
      </div>
    </div>
    <div class="pc-ov" data-ov="cheat" hidden>
      <div class="pc-card" role="dialog" aria-modal="true" aria-label="Menu cheat">
        <h3>Cheat</h3>
        <div class="pc-cheat-row"><div><b>+15 langkah</b><small>Tambah jatah langkah bersama.</small></div><button type="button" class="pc-btn" data-cheat="turns">Pakai</button></div>
        <div class="pc-cheat-row"><div><b>Perbaiki 1 pipa</b><small>Satu pipa jalur langsung diputar ke orientasi benar (tanpa耗费 langkah).</small></div><button type="button" class="pc-btn" data-cheat="fix">Pakai</button></div>
        <div class="pc-cheat-row"><div><b>Lihat solusi</b><small>Bayangan hijau menunjukkan orientasi benar pipa jalur (hanya di layarmu).</small></div><button type="button" class="pc-btn" data-cheat="hint"><span class="pc-pill" data-cs="hint">OFF</span></button></div>
        <div class="pc-cheat-row" data-freeze-row><div><b>Bekukan bot</b><small>Bot melewati semua gilirannya — main santai sendiri.</small></div><button type="button" class="pc-btn" data-cheat="freeze"><span class="pc-pill" data-cs="freeze">OFF</span></button></div>
        <div class="pc-cheat-row"><div><b>Langkah tak terbatas</b><small>Putaran tidak lagi mengurangi jatah langkah.</small></div><button type="button" class="pc-btn" data-cheat="unlimited"><span class="pc-pill" data-cs="unlimited">OFF</span></button></div>
        <div class="pc-cheat-row"><div><b>Menang instan</b><small>Semua pipa jalur langsung tersambung atas namamu.</small></div><button type="button" class="pc-btn" data-cheat="win">Pakai</button></div>
        <p class="pc-note" data-cheat-note>Cheat menandai papan dengan badge "cheat aktif".</p>
        <div class="pc-row"><button type="button" class="pc-btn pc-btn-main" data-act="close-cheat">Tutup</button></div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button type="button" class="game-action-button" data-act="tutorial">Tutorial</button>
    <button type="button" class="game-action-button" data-act="cheat">Cheat</button>
    <button type="button" class="game-action-button" data-act="pad">Pad</button>
    <button type="button" class="game-action-button" data-act="restart" data-btn-restart>Ulang</button>
    <button type="button" class="game-action-button" data-exit>Keluar</button>
  </div>
  <div class="pc-kbd-hint">Klik: putar · klik kanan: putar balik · <span class="pc-kbd">←↑↓→</span> pilih · <span class="pc-kbd">Spasi</span> putar · <span class="pc-kbd">C</span> cheat · <span class="pc-kbd">T</span> tutorial</div>
</div>`;

    /* ================= refs & lokal ================= */
    const $ = (s) => root.querySelector(s);
    const boardG = $('[data-g="board"]');
    const cursorG = $('[data-g="cursor"]');
    const hitG = $('[data-g="hit"]');
    const msgEl = $("[data-msg]");
    const statusEl = $("[data-status]");
    const statusWrap = $("[data-status-wrap]");
    const hud = {
        turns: $('[data-hud="turns"]'), flow: $('[data-hud="flow"]'),
        seat: $('[data-hud="seat"]'), best: $('[data-hud="best"]'),
    };
    const ov = {
        start: $('[data-ov="start"]'), result: $('[data-ov="result"]'),
        tutorial: $('[data-ov="tutorial"]'), cheat: $('[data-ov="cheat"]'),
    };
    const appWrap = $(".pc-app");
    let sel = { r: 2, c: 1 };
    let hintOn = false, tutOpen = false, cheatOpen = false, dismissed = false;
    let lastAnim = null, destroyed = false, lastPhase = null;
    let timers = [], botTimer = null;
    const unsubs = [];

    const later = (fn, ms) => {
        const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms);
        timers.push(t);
        return t;
    };
    function clearTimers() {
        timers.forEach(clearTimeout);
        timers = [];
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    }
    function msg(text, mood) {
        msgEl.textContent = text;
        msgEl.className = "pc-msg" + (mood ? " pc-" + mood : "");
    }

    const mySeat = () => (state ? state.seatOf[playerIndex] : 0);
    const isMyTurn = () => Boolean(state && state.phase === "playing" && state.turnOf === mySeat());
    const canStartOrRestart = () => !online || room.isHost;
    function nameForSeat(seat) {
        if (!state) return "–";
        const actor = state.seatOf.indexOf(seat);
        if (actor === playerIndex) return playerName + " (kamu)";
        if (!online) return "Bot";
        return roomData?.players?.[actor]?.name || (actor === 0 ? "Host" : "Tamu");
    }
    function readBest() {
        try { return Number(localStorage.getItem(META.bestKey)) || 0; } catch { return 0; }
    }
    function writeBest(moves) {
        try {
            const b = readBest();
            if (!b || moves < b) localStorage.setItem(META.bestKey, String(moves));
        } catch { /* abaikan */ }
    }

    /* ================= render ================= */
    function armsSvg(mask, col, w, dash) {
        const d = dash ? ' stroke-dasharray="4 4"' : "";
        let s = "";
        if (mask & 1) s += `<path d="M32 32V0" stroke="${col}" stroke-width="${w}"${d}/>`;
        if (mask & 2) s += `<path d="M32 32H64" stroke="${col}" stroke-width="${w}"${d}/>`;
        if (mask & 4) s += `<path d="M32 32V64" stroke="${col}" stroke-width="${w}"${d}/>`;
        if (mask & 8) s += `<path d="M32 32H0" stroke="${col}" stroke-width="${w}"${d}/>`;
        return s;
    }
    function wasteSvg(r, c) {
        const v = (r * 31 + c * 17) % 2;
        const icon = v === 0
            ? '<path d="M22 25h20"/><path d="M28 25v-3h8v3"/><rect x="24" y="25" width="16" height="19" rx="2.5"/><path d="M29 30v9M35 30v9"/>'
            : '<rect x="23" y="21" width="18" height="23" rx="3.5"/><path d="M23 29h18M23 37h18"/>';
        return `<rect x="4" y="4" width="56" height="56" rx="10" fill="#fffbeb" stroke="#fde68a" stroke-dasharray="4 3"/><g fill="none" stroke="#d97706" stroke-width="2.4" stroke-linecap="round">${icon}</g>`;
    }
    function cellSvg(level, r, c, wet) {
        const m = level.grid[r][c];
        const tile = '<rect x="1" y="1" width="62" height="62" rx="9" fill="#ffffff" stroke="#eef2f7"/>';
        if (m < 0) return `<g transform="translate(${c * CELL},${r * CELL})">${tile}${wasteSvg(r, c)}</g>`;
        const isSrc = r === level.src[0] && c === level.src[1];
        const isDst = r === level.dst[0] && c === level.dst[1];
        const col = wet ? "#0ea5e9" : "#94a3b8";
        let inner = "";
        if (isSrc) inner += '<circle cx="32" cy="32" r="27" fill="none" stroke="#0284c7" stroke-width="2" class="pc-halo"/>';
        if (isDst) inner += '<circle cx="32" cy="32" r="27" fill="none" stroke="#059669" stroke-width="2" class="pc-halo"/>';
        if (hintOn && level.sol[r][c] > 0 && m !== level.sol[r][c] && !isSrc && !isDst)
            inner += `<g opacity=".65">${armsSvg(level.sol[r][c], "#34d399", 4, true)}</g>`;
        let dm = m;
        if (isSrc) dm |= OUT_BIT[level.srcSide];
        if (isDst) dm |= OUT_BIT[level.dstSide];
        inner += armsSvg(dm, col, 10);
        if (isSrc) {
            inner += '<circle cx="32" cy="32" r="10.5" fill="#e0f2fe" stroke="#0284c7" stroke-width="2.5"/><path d="M32 24v16M24 32h16" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="3.2" fill="#0284c7"/>';
        } else if (isDst) {
            const gc = wet ? "#059669" : "#94a3b8";
            inner += `<circle cx="32" cy="32" r="10.5" fill="#fff" stroke="${gc}" stroke-width="2.5"/><path d="M25.5 27l1.8 1.8M38.5 27l-1.8 1.8M32 23.5v2.5" stroke="${gc}" stroke-width="1.6" stroke-linecap="round"/><path d="${wet ? "M32 32L38.5 25.5" : "M32 32L25.5 25.5"}" stroke="${gc}" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="2" fill="${gc}"/>`;
        } else {
            inner += `<circle cx="32" cy="32" r="10.5" fill="${wet ? "#e0f2fe" : "#fff"}" stroke="${col}" stroke-width="2.5"/><circle cx="32" cy="32" r="3" fill="${wet ? "#0284c7" : "#cbd5e1"}"/>`;
        }
        const key = r * SIZE + c;
        const anim = lastAnim && lastAnim.k === key ? (lastAnim.ccw ? "pc-anim-ccw" : "pc-anim-cw") : "";
        return `<g transform="translate(${c * CELL},${r * CELL})">${tile}<g${anim ? ` class="${anim}"` : ""}>${inner}</g></g>`;
    }
    function connectorSvg(level, dstWet) {
        const label = (x, y, text, fill) =>
            `<text x="${x}" y="${y}" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1.2" fill="${fill}">${text}</text>`;
        const piece = (side, r, c, color, text, outward) => {
            const x = c * CELL + 32, y = r * CELL + 32;
            let s = "";
            if (side === "L") {
                s += `<path d="M-16 ${y}H0" stroke="${color}" stroke-width="10"/><circle cx="-16" cy="${y}" r="5.5" fill="${color}"/>`;
                s += outward ? `<path d="M-11 ${y - 5}L-3 ${y}L-11 ${y + 5}Z" fill="${color}"/>` : `<path d="M-3 ${y - 5}L-11 ${y}L-3 ${y + 5}Z" fill="${color}"/>`;
                s += label(-14, y - 13, text, color);
            } else if (side === "R") {
                s += `<path d="M${BOARD} ${y}h16" stroke="${color}" stroke-width="10"/><circle cx="${BOARD + 16}" cy="${y}" r="5.5" fill="${color}"/>`;
                s += `<path d="M${BOARD + 5} ${y - 5}L${BOARD + 13} ${y}L${BOARD + 5} ${y + 5}Z" fill="${color}"/>`;
                s += label(BOARD + 14, y - 13, text, color);
            } else if (side === "T") {
                s += `<path d="M${x} -16V0" stroke="${color}" stroke-width="10"/><circle cx="${x}" cy="-16" r="5.5" fill="${color}"/>`;
                s += outward ? `<path d="M${x - 5} -11L${x} -3L${x + 5} -11Z" fill="${color}"/>` : `<path d="M${x - 5} -3L${x} -11L${x + 5} -3Z" fill="${color}"/>`;
                s += label(x, -25, text, color);
            } else {
                s += `<path d="M${x} ${BOARD}v16" stroke="${color}" stroke-width="10"/><circle cx="${x}" cy="${BOARD + 16}" r="5.5" fill="${color}"/>`;
                s += `<path d="M${x - 5} ${BOARD + 5}L${x} ${BOARD + 13}L${x + 5} ${BOARD + 5}Z" fill="${color}"/>`;
                s += label(x, BOARD + 31, text, color);
            }
            return s;
        };
        return (
            piece(level.srcSide, level.src[0], level.src[1], "#0284c7", "START", false) +
            piece(level.dstSide, level.dst[0], level.dst[1], dstWet ? "#059669" : "#94a3b8", "FINISH", true)
        );
    }
    function renderBoard() {
        if (!state) {
            boardG.innerHTML = `<text x="${BOARD / 2}" y="${BOARD / 2}" text-anchor="middle" font-size="14" fill="#94a3b8">Menunggu papan dari host…</text>`;
            cursorG.innerHTML = "";
            return;
        }
        const level = state.level;
        const wet = flowCells(level);
        let s = `<rect x="-1" y="-1" width="${BOARD + 2}" height="${BOARD + 2}" rx="12" fill="#fbfcfe" stroke="#e8eef5"/>`;
        for (let r = 0; r < SIZE; r++)
            for (let c = 0; c < SIZE; c++)
                s += cellSvg(level, r, c, wet.has(r * SIZE + c));
        s += connectorSvg(level, wet.has(level.dst[0] * SIZE + level.dst[1]));
        boardG.innerHTML = s;
        lastAnim = null;
        hud.flow.textContent = wet.size;
        renderCursor();
    }
    function renderCursor() {
        if (!state) { cursorG.innerHTML = ""; return; }
        cursorG.innerHTML = `<rect x="${sel.c * CELL + 2.5}" y="${sel.r * CELL + 2.5}" width="59" height="59" rx="10" fill="rgba(2,132,199,.05)" stroke="#0284c7" stroke-width="2" stroke-dasharray="5 4"/>`;
    }
    function render() {
        /* HUD & status */
        if (state) {
            if (state.phase === "ready" && lastPhase !== "ready") {
                sel = { r: state.level.src[0], c: state.level.src[1] };
                dismissed = false;
            }
            lastPhase = state.phase;
            hud.turns.textContent = state.unlimited ? "∞" : state.turns;
            hud.seat.textContent = "P" + (mySeat() + 1);
            $('[data-cheat-badge]').hidden = !state.cheated;
            $('[data-best-chip]').hidden = online;
            hud.best.textContent = readBest() || "–";
            let st = "Siap", cls = "";
            if (state.phase === "playing") {
                if (isMyTurn()) { st = "Giliranmu"; cls = "pc-s-turn"; }
                else { st = nameForSeat(state.turnOf) + " berpikir…"; cls = "pc-s-wait"; }
            } else if (state.phase === "won") {
                st = state.winner === mySeat() ? "Kamu menang" : nameForSeat(state.winner) + " menang";
                cls = state.winner === mySeat() ? "pc-s-win" : "pc-s-bad";
            } else if (state.phase === "lost") { st = "Langkah habis"; cls = "pc-s-bad"; }
            statusEl.textContent = st;
            statusWrap.className = "game-status" + (cls ? " " + cls : "");
            $('[data-intro]').textContent = online
                ? "Duel pipa 2 pemain: yang menyambungkan air ke meteran menang. Posisi P1/P2 dan giliran pertama diundi acak."
                : "Duel pipa lawan bot: yang menyambungkan air ke meteran menang. Giliran pertama diundi acak.";
        } else {
            statusEl.textContent = "Menunggu host…";
            statusWrap.className = "game-status pc-s-wait";
            hud.turns.textContent = "–"; hud.flow.textContent = "–"; hud.seat.textContent = "–";
        }
        renderBoard();

        /* overlay start */
        ov.start.hidden = !(state && state.phase === "ready") || tutOpen || cheatOpen;
        if (state && state.phase === "ready") {
            const first = nameForSeat(state.firstSeat);
            $('[data-start-desc]').textContent = online
                ? "Bergiliran memutar satu pipa. Pemain yang putarannya membuat air mencapai meteran FINISH menang. Langkah bersifat bersama."
                : "Bergiliran dengan bot memutar satu pipa. Pemain yang putarannya membuat air mencapai meteran FINISH menang. Langkah bersifat bersama.";
            $('[data-start-draw]').innerHTML = online
                ? `Posisi diacak: kamu <b>P${mySeat() + 1}</b>, lawan <b>P${(1 - mySeat()) + 1}</b>.<br>Giliran pertama (undian): <b>${first}</b>.`
                : `Giliran pertama (undian): <b>${first}</b>.`;
            const b = ov.start.querySelector('[data-act="start"]');
            b.disabled = !canStartOrRestart();
            b.textContent = canStartOrRestart() ? "Mulai" : "Menunggu host…";
        }

        /* overlay hasil */
        const ended = state && (state.phase === "won" || state.phase === "lost");
        ov.result.hidden = !ended || dismissed || tutOpen || cheatOpen;
        if (ended) {
            const t = $('[data-res-title]');
            const iWon = state.phase === "won" && state.winner === mySeat();
            if (state.phase === "lost") {
                t.textContent = "Langkah habis"; t.className = "pc-lose";
                $('[data-res-reason]').textContent = "Jatah langkah bersama habis sebelum air sampai ke meteran. Telusuri glow biru dari START untuk menemukan sambungan yang putus.";
            } else if (iWon) {
                t.textContent = "Kamu menang!"; t.className = "pc-win";
                $('[data-res-reason]').textContent = `Air sampai ke meteran dalam ${state.moves} langkah (sisa ${state.unlimited ? "tak terbatas" : state.turns}).` + (state.cheated ? " Menggunakan cheat." : " Kerja pipa yang rapi!");
            } else {
                t.textContent = nameForSeat(state.winner) + " menang"; t.className = "pc-lose";
                $('[data-res-reason]').textContent = online
                    ? "Lawan menyambungkan aliran lebih dulu. Papan baru, undian baru — coba lagi."
                    : "Bot menyambungkan aliran lebih dulu. Awasi pipa yang hampir tersambung, atau pakai cheat.";
            }
            const rb = ov.result.querySelector('[data-act="restart"]');
            rb.disabled = !canStartOrRestart();
            rb.textContent = canStartOrRestart() ? "Main lagi" : "Tunggu host…";
        }

        ov.tutorial.hidden = !tutOpen;
        ov.cheat.hidden = !cheatOpen;

        /* tombol & pad */
        $('[data-btn-restart]').disabled = !canStartOrRestart();
        const rotDisabled = !isMyTurn();
        root.querySelector('[data-pad="cw"]').disabled = rotDisabled;
        root.querySelector('[data-pad="ccw"]').disabled = rotDisabled;

        /* label cheat */
        const pill = (k, on) => {
            const el = root.querySelector(`[data-cs="${k}"]`);
            el.textContent = on ? "ON" : "OFF";
            el.className = "pc-pill" + (on ? " pc-on" : "");
        };
        pill("hint", hintOn);
        pill("freeze", Boolean(state && state.botFrozen));
        pill("unlimited", Boolean(state && state.unlimited));
        $('[data-freeze-row]').hidden = online;
        $('[data-cheat-note]').textContent = online
            ? "Dalam mode room, cheat (kecuali Lihat solusi) berlaku untuk semua pemain dan terlihat sebagai badge."
            : "Cheat menandai papan dengan badge \"cheat aktif\".";
    }

    /* ================= alur state (template) ================= */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        if (!online) maybeScheduleBot();
    }

    function maybeScheduleBot() {
        if (botTimer) { clearTimeout(botTimer); botTimer = null; }
        if (online || !state || state.phase !== "playing" || state.turnOf !== state.seatOf[1]) return;
        botTimer = later(() => {
            botTimer = null;
            if (!state || state.phase !== "playing" || state.turnOf !== state.seatOf[1]) return;
            if (state.botFrozen) {
                state.turnOf = state.seatOf[0];
                msg("Bot dilewati (dibekukan) — giliranmu lagi", "good");
                publish();
                return;
            }
            const mv = botPick(state.level);
            applyAction({ type: "rotate", r: mv.r, c: mv.c }, 1);
        }, 900);
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        const local = actor === playerIndex;
        const seat = state.seatOf[actor];
        const level = state.level;

        if (action.type === "start") {
            if (online && actor !== 0) return;
            if (state.phase !== "ready") return;
            state.phase = "playing";
            msg(state.turnOf === mySeat() ? "Kamu jalan duluan — putar satu pipa" : nameForSeat(state.turnOf) + " jalan duluan");
            publish();
            return;
        }
        if (action.type === "restart") {
            if (online && actor !== 0) { if (local) msg("Hanya host yang bisa mengulang papan", "bad"); return; }
            clearTimers();
            state = initState();
            hintOn = false; dismissed = false; lastAnim = null;
            msg("Papan baru — posisi & giliran pertama diundi ulang");
            publish();
            return;
        }
        if (action.type === "rotate") {
            if (state.phase !== "playing") { if (local) msg("Tekan Mulai dulu", "bad"); return; }
            if (seat !== state.turnOf) { if (local) msg("Bukan giliranmu — tunggu sebentar", "bad"); return; }
            const r = Number(action.r), c = Number(action.c);
            if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
            const isEnd = (r === level.src[0] && c === level.src[1]) || (r === level.dst[0] && c === level.dst[1]);
            if (isEnd) { if (local) msg("Katup START dan meteran FINISH terkunci", "bad"); return; }
            if (level.grid[r][c] < 0) { if (local) msg("Petak limbah terkunci — tidak bisa diputar", "bad"); return; }
            level.grid[r][c] = rotate(level.grid[r][c], action.ccw ? 3 : 1);
            state.moves += 1;
            if (!state.unlimited) state.turns -= 1;
            lastAnim = { k: r * SIZE + c, ccw: Boolean(action.ccw) };
            if (solved(level)) {
                state.phase = "won";
                state.winner = seat;
                if (!online && seat === mySeat()) writeBest(state.moves);
                msg(seat === mySeat() ? "Tersambung! Kamu menang" : nameForSeat(seat) + " menyambungkan aliran", seat === mySeat() ? "good" : "bad");
            } else if (state.turns <= 0) {
                state.phase = "lost";
                msg("Langkah habis — tidak ada yang tersambung", "bad");
            } else {
                state.turnOf = 1 - seat;
                if (local) {
                    const wet = flowCells(level);
                    msg(wet.has(r * SIZE + c) ? "Air mengalir di pipa ini" : "Pipa diputar", wet.has(r * SIZE + c) ? "good" : "");
                }
            }
            publish();
            return;
        }
        if (action.type === "cheat") {
            const kind = action.kind;
            if (kind === "freeze") {
                if (online) return;
                state.botFrozen = !state.botFrozen;
                if (state.botFrozen) state.cheated = true;
                msg(state.botFrozen ? "Bot dibekukan" : "Bot aktif kembali");
                publish();
                return;
            }
            if (kind === "unlimited") {
                state.unlimited = !state.unlimited;
                if (state.unlimited) state.cheated = true;
                msg(state.unlimited ? "Langkah tak terbatas aktif" : "Langkah kembali terbatas");
                publish();
                return;
            }
            if (state.phase !== "playing") { if (local) msg("Mulai permainan dulu sebelum pakai cheat ini", "bad"); return; }
            if (kind === "turns") {
                state.turns = Math.min(99, state.turns + 15);
                state.cheated = true;
                msg("+15 langkah ditambahkan", "good");
            } else if (kind === "fix") {
                const pool = [];
                for (let r = 0; r < SIZE; r++)
                    for (let c = 0; c < SIZE; c++)
                        if (level.sol[r][c] > 0 && level.grid[r][c] > 0 && level.grid[r][c] !== level.sol[r][c]) pool.push([r, c]);
                if (!pool.length) { if (local) msg("Semua pipa jalur sudah benar"); return; }
                const [r, c] = pool[Math.floor(Math.random() * pool.length)];
                level.grid[r][c] = level.sol[r][c];
                lastAnim = { k: r * SIZE + c, ccw: false };
                state.cheated = true;
                msg("Satu pipa diperbaiki ke orientasi benar", "good");
                if (solved(level)) {
                    state.phase = "won"; state.winner = seat;
                    if (!online && seat === mySeat()) writeBest(state.moves);
                }
            } else if (kind === "win") {
                for (let r = 0; r < SIZE; r++)
                    for (let c = 0; c < SIZE; c++)
                        if (level.sol[r][c] > 0) level.grid[r][c] = level.sol[r][c];
                state.phase = "won"; state.winner = seat; state.cheated = true;
                msg("Cheat: papan langsung tersambung", "good");
            } else return;
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ================= input ================= */
    function moveSel(dr, dc) {
        if (!state) return;
        sel = { r: Math.max(0, Math.min(SIZE - 1, sel.r + dr)), c: Math.max(0, Math.min(SIZE - 1, sel.c + dc)) };
        renderCursor();
    }
    const rotateSel = (ccw) => submitAction({ type: "rotate", r: sel.r, c: sel.c, ccw });
    function closeTopOverlay() {
        if (cheatOpen) { cheatOpen = false; render(); return; }
        if (tutOpen) { tutOpen = false; render(); return; }
        if (state && (state.phase === "won" || state.phase === "lost")) { dismissed = true; render(); }
    }

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const pad = t.closest("[data-pad]");
        if (pad) {
            const k = pad.dataset.pad;
            if (k === "up") moveSel(-1, 0);
            else if (k === "down") moveSel(1, 0);
            else if (k === "left") moveSel(0, -1);
            else if (k === "right") moveSel(0, 1);
            else if (k === "cw") rotateSel(false);
            else if (k === "ccw") rotateSel(true);
            return;
        }
        const cell = t.closest("[data-cell]");
        if (cell && state) {
            sel = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
            renderCursor();
            submitAction({ type: "rotate", r: sel.r, c: sel.c, ccw: false });
            return;
        }
        const cheat = t.closest("[data-cheat]");
        if (cheat) {
            const kind = cheat.dataset.cheat;
            if (kind === "hint") { hintOn = !hintOn; render(); return; }
            submitAction({ type: "cheat", kind });
            return;
        }
        const act = t.closest("[data-act]");
        if (!act) return;
        const a = act.dataset.act;
        if (a === "start" || a === "restart") submitAction({ type: a });
        else if (a === "tutorial") { tutOpen = true; cheatOpen = false; render(); }
        else if (a === "cheat") { cheatOpen = true; tutOpen = false; render(); }
        else if (a === "close-tutorial") { tutOpen = false; render(); }
        else if (a === "close-cheat") { cheatOpen = false; render(); }
        else if (a === "dismiss") { dismissed = true; render(); }
        else if (a === "pad") { appWrap.classList.toggle("pc-pad-on"); }
    }

    function handleContext(event) {
        const cell = event.target.closest("[data-cell]");
        if (!cell || !state) return;
        event.preventDefault();
        sel = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
        renderCursor();
        submitAction({ type: "rotate", r: sel.r, c: sel.c, ccw: true });
    }
    function handleHover(event) {
        const cell = event.target.closest("[data-cell]");
        if (!cell || !state) return;
        sel = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
        renderCursor();
    }
    function handleKey(e) {
        if (destroyed || !root.isConnected) return;
        if (e.target && e.target.closest && e.target.closest("input,textarea,select")) return;
        const k = e.key;
        if (k === "Escape") { closeTopOverlay(); return; }
        if (k === "t" || k === "T") { tutOpen = !tutOpen; if (tutOpen) cheatOpen = false; render(); e.preventDefault(); return; }
        if (k === "c" || k === "C") { cheatOpen = !cheatOpen; if (cheatOpen) tutOpen = false; render(); e.preventDefault(); return; }
        if (k === "h" || k === "H") { hintOn = !hintOn; render(); return; }
        if (tutOpen || cheatOpen) return;
        if (state && state.phase === "ready" && (k === "Enter" || k === " ")) {
            if (canStartOrRestart()) submitAction({ type: "start" });
            e.preventDefault();
            return;
        }
        if (k === "r" || k === "R") { submitAction({ type: "restart" }); return; }
        const dirs = {
            ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
            w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
            W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
        };
        if (dirs[k]) { moveSel(dirs[k][0], dirs[k][1]); e.preventDefault(); return; }
        if (k === " " || k === "Enter" || k === "e" || k === "E") { rotateSel(false); e.preventDefault(); }
        else if (k === "q" || k === "Q") { rotateSel(true); e.preventDefault(); }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleContext);
    root.addEventListener("mouseover", handleHover);
    document.addEventListener("keydown", handleKey);

    /* ================= init: hit layer + wiring room ================= */
    {
        let hit = "";
        for (let r = 0; r < SIZE; r++)
            for (let c = 0; c < SIZE; c++)
                hit += `<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="transparent" data-cell data-r="${r}" data-c="${c}"/>`;
        hitG.innerHTML = hit;
    }

    const keep = (u) => { if (typeof u === "function") unsubs.push(u); };
    if (online) {
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = initState();
            publish();
            keep(room.onAction((action) => applyAction(action, 1)));
        } else {
            render(); /* placeholder menunggu state host */
            keep(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        state = initState();
        msg("Tekan Mulai — giliran pertama akan diundi");
        render();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers();
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleContext);
            root.removeEventListener("mouseover", handleHover);
            document.removeEventListener("keydown", handleKey);
            unsubs.forEach((u) => { try { u(); } catch { /* abaikan */ } });
        },
    };
}