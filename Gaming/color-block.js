/*
 * Color Block — duel blok 9x9 (mode AI vs Bot & mode room multiplayer).
 * 1. META.id harus sama dengan nama file tanpa .js.
 * 2. Logika game ada di mount().
 * 3. Jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "color-block",
    name: "Color Block",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Take turns placing blocks on a shared 9x9 grid. Clear rows and columns to outscore your opponent.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/><rect x="19.5" y="7" width="11" height="11" rx="2.5"/><rect x="32" y="7" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/><rect x="7" y="19.5" width="11" height="11" rx="2.5"/><rect x="19.5" y="19.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/><rect x="32" y="19.5" width="11" height="11" rx="2.5"/><rect x="7" y="32" width="11" height="11" rx="2.5"/><rect x="19.5" y="32" width="11" height="11" rx="2.5"/><rect x="32" y="32" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
    bestKey: "colorBlockBest",
};

/* ================= pure logic ================= */
const GRID = 9;
const CELL = 40;
const BOARD = GRID * CELL;
const MINI = 16;

/* 16 famili shape -> rotasi unik digenerate otomatis (38 varian) */
function rotationsOf(cells) {
    const out = [], seen = new Set();
    let cur = cells.map((c) => [...c]);
    for (let r = 0; r < 4; r++) {
        const mx = Math.min(...cur.map((c) => c[0]));
        const my = Math.min(...cur.map((c) => c[1]));
        const norm = cur.map(([x, y]) => [x - mx, y - my]);
        const key = norm.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((c) => c.join(",")).join(";");
        if (!seen.has(key)) { seen.add(key); out.push(norm); }
        cur = norm.map(([x, y]) => [-y, x]);
    }
    return out;
}

const FAMILIES = [
    { fam: "dot", color: "#06b6d4", cells: [[0, 0]] },
    { fam: "I2", color: "#eab308", cells: [[0, 0], [1, 0]] },
    { fam: "I3", color: "#8b5cf6", cells: [[0, 0], [1, 0], [2, 0]] },
    { fam: "I4", color: "#3b82f6", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { fam: "I5", color: "#0ea5e9", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { fam: "O2", color: "#22c55e", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { fam: "O3", color: "#ef4444", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] },
    { fam: "R23", color: "#60a5fa", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    { fam: "L3", color: "#f97316", cells: [[0, 0], [1, 0], [0, 1]] },
    { fam: "L4", color: "#fb923c", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
    { fam: "J4", color: "#f472b6", cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },
    { fam: "T4", color: "#a78bfa", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { fam: "S4", color: "#34d399", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    { fam: "Z4", color: "#f87171", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    { fam: "C3", color: "#14b8a6", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] },
    { fam: "X5", color: "#d946ef", cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
];

const SHAPES = [];
for (const f of FAMILIES) {
    rotationsOf(f.cells).forEach((cells, i) => {
        SHAPES.push({ id: `${f.fam}-${i}`, fam: f.fam, color: f.color, cells });
    });
}
const SHAPE_BY_ID = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
const EASY_POOL = SHAPES.filter((s) => ["dot", "I2", "L3", "O2"].includes(s.fam));
const SEAT_COLORS = ["#6366f1", "#f59e0b"];

const idx = (x, y) => y * GRID + x;

function fitsAt(board, cells, gx, gy) {
    for (const [cx, cy] of cells) {
        const x = gx + cx, y = gy + cy;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
        if (board[idx(x, y)]) return false;
    }
    return true;
}

function fitsAnywhere(board, cells) {
    for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++)
            if (fitsAt(board, cells, x, y)) return true;
    return false;
}

/* clear baris+kolom penuh sekaligus; kembalikan sel yg hancur utk animasi */
function clearLines(board) {
    const rows = [], cols = [];
    for (let y = 0; y < GRID; y++) {
        let full = true;
        for (let x = 0; x < GRID; x++) if (!board[idx(x, y)]) { full = false; break; }
        if (full) rows.push(y);
    }
    for (let x = 0; x < GRID; x++) {
        let full = true;
        for (let y = 0; y < GRID; y++) if (!board[idx(x, y)]) { full = false; break; }
        if (full) cols.push(x);
    }
    const n = rows.length + cols.length;
    if (!n) return { board, cleared: [], lines: 0, gained: 0 };
    const nb = board.slice();
    const cleared = [];
    const wipe = (x, y) => {
        const c = nb[idx(x, y)];
        if (c) { cleared.push({ x, y, color: c }); nb[idx(x, y)] = null; }
    };
    rows.forEach((y) => { for (let x = 0; x < GRID; x++) wipe(x, y); });
    cols.forEach((x) => { for (let y = 0; y < GRID; y++) wipe(x, y); });
    return { board: nb, cleared, lines: n, gained: 10 * n + 5 * n * (n - 1) };
}

function randTray(easy) {
    const pool = easy ? EASY_POOL : SHAPES;
    return [0, 1, 2].map(() => pool[Math.floor(Math.random() * pool.length)].id);
}

/* heuristic: skor langsung + jaga mobilitas tray + hindari lubang terisolasi */
function bestMove(state, seat) {
    const board = state.board;
    let best = null, bestVal = -Infinity;
    state.tray.forEach((id, slot) => {
        const sh = id && SHAPE_BY_ID[id];
        if (!sh) return;
        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                if (!fitsAt(board, sh.cells, gx, gy)) continue;
                let nb = board.slice();
                sh.cells.forEach(([cx, cy]) => { nb[idx(gx + cx, gy + cy)] = sh.color; });
                const res = clearLines(nb);
                nb = res.board;
                let rest = 0;
                state.tray.forEach((oid, oslot) => {
                    if (oslot === slot || !oid) return;
                    if (fitsAnywhere(nb, SHAPE_BY_ID[oid].cells)) rest++;
                });
                let holes = 0;
                for (let y = 0; y < GRID; y++) {
                    for (let x = 0; x < GRID; x++) {
                        if (nb[idx(x, y)]) continue;
                        const closed = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
                            const nx = x + dx, ny = y + dy;
                            return nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || nb[idx(nx, ny)];
                        });
                        if (closed) holes++;
                    }
                }
                const v = sh.cells.length + res.gained * 1.4 + rest * 0.3 - holes * 0.15 + Math.random() * 0.05;
                if (v > bestVal) { bestVal = v; best = { slot, x: gx, y: gy }; }
            }
        }
    });
    return best;
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // indeks koneksi: 0 host, 1 guest
    let roomData = room?.room || null;
    let state = null;

    let destroyed = false;
    let selected = -1;
    let cursor = { x: 4, y: 4 };
    let cheatsOpen = false;
    let botTimer = null;
    let fxTimer = null;
    let lastFxKey = null;
    let bestSavedFor = null;
    let joinSent = false;
    const offs = [];
    const cleanName = (n) => String(n || "").trim().slice(0, 20);

    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey) || 0) || 0; } catch (_) { }

    /* ---------- state factory ---------- */
    function newGame(prev) {
        // acak posisi duduk tiap match (multiplayer); mode AI: manusia selalu seat 0
        const seats = online && Math.random() < 0.5 ? [1, 0] : [0, 1];
        // acak siapa jalan duluan (semua mode)
        const turn = Math.random() < 0.5 ? 0 : 1;
        let names;
        if (prev) {
            const connNames = [prev.names[prev.seats[0]], prev.names[prev.seats[1]]];
            names = [null, null];
            names[seats[0]] = connNames[0];
            names[seats[1]] = connNames[1];
        } else if (online) {
            names = [null, null];
            names[seats[0]] = cleanName(playerName) || "Player 1";
            names[seats[1]] = "Player 2";
        } else {
            names = [cleanName(playerName) || "You", "Bot"];
        }
        return {
            gameId: (prev?.gameId || 0) + 1,
            board: new Array(GRID * GRID).fill(null), // flat, serializable
            tray: randTray(false),                    // simpan id shape
            seats, turn, names,
            scores: [0, 0],
            lines: [0, 0],
            moves: 0,
            phase: "playing",
            winner: null,
            easy: false,
            fx: null, // {key, placed[], cleared[]} utk animasi lintas klien
        };
    }

    const mySeat = () => (online ? state?.seats[playerIndex] ?? 0 : 0);
    const trayShape = (i) => (state?.tray[i] ? SHAPE_BY_ID[state.tray[i]] : null);

    /* ---------- shell (minimalis, tanpa tutorial) ---------- */
    root.innerHTML = `
<style>
.cbx{--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--soft:#f6f7f9;--accent:#4f46e5;
  max-width:460px;margin:0 auto;color:var(--ink);font:inherit;display:flex;flex-direction:column;gap:12px}
.cbx *{box-sizing:border-box}
.cbx-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cbx-title{font-size:15px;font-weight:700;letter-spacing:.01em;margin:0}
.cbx-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);
  border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:#fff;white-space:nowrap}
.cbx-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;flex:none}
.cbx-dot.me{background:#10b981}.cbx-dot.wait{background:#f59e0b}
.cbx-scores{display:flex;gap:10px}
.cbx-card{flex:1;min-width:0;border:1px solid var(--line);border-radius:14px;background:#fff;
  padding:10px 12px;transition:border-color .2s, box-shadow .2s}
.cbx-card.on{border-color:var(--seat);box-shadow:0 0 0 1px var(--seat)}
.cbx-name{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--muted);min-width:0}
.cbx-name i{width:8px;height:8px;border-radius:50%;background:var(--seat);flex:none}
.cbx-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cbx-you{font-size:10px;font-weight:700;color:var(--seat);border:1px solid var(--seat);
  border-radius:999px;padding:0 6px;flex:none}
.cbx-score{font-size:22px;font-weight:700;line-height:1.2;margin-top:2px;font-variant-numeric:tabular-nums}
.cbx-sub{font-size:11px;color:var(--muted)}
.cbx-boardwrap{position:relative;border:1px solid var(--line);border-radius:16px;background:#fff;padding:8px}
.cbx-board{display:block;width:100%;height:auto;touch-action:manipulation}
.cbx-tray{display:flex;gap:10px;justify-content:center}
.cbx-slot{position:relative;width:78px;height:78px;border:1px solid var(--line);border-radius:14px;
  background:#fff;display:grid;place-items:center;cursor:pointer;padding:0;font:inherit;
  transition:border-color .15s, box-shadow .15s, opacity .2s}
.cbx-slot:hover:not(:disabled){border-color:#c7cbd4}
.cbx-slot.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.cbx-slot:disabled{cursor:default}
.cbx-slot.empty{opacity:.35}
.cbx-slot.dead{opacity:.3;filter:grayscale(.9)}
.cbx-slot kbd{position:absolute;top:5px;left:7px;font-size:9px;color:#b0b5bf;font-family:inherit}
.cbx-slot svg{display:block}
.cbx-tools{display:flex;gap:8px;justify-content:center}
.cbx-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;
  padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
  transition:background .15s,border-color .15s}
.cbx-btn:hover:not(:disabled){background:var(--soft)}
.cbx-btn:disabled{opacity:.4;cursor:default}
.cbx-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.cbx-btn.primary:hover:not(:disabled){background:#4338ca}
.cbx-btn.toggled{border-color:var(--accent);color:var(--accent)}
.cbx-cheats{border:1px dashed #d8b4fe;background:#faf5ff;border-radius:14px;padding:10px;
  display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.cbx-cheats[hidden]{display:none}
.cbx-cheats .cbx-btn{font-size:11px;padding:6px 10px;border-color:#e9d5ff}
.cbx-veil{position:absolute;inset:0;border-radius:16px;background:rgba(255,255,255,.8);
  backdrop-filter:blur(3px);display:grid;place-items:center;z-index:2}
.cbx-veil[hidden]{display:none}
.cbx-result{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px 26px;
  text-align:center;box-shadow:0 8px 30px rgba(17,24,39,.08)}
.cbx-result h3{margin:0 0 4px;font-size:17px}
.cbx-result p{margin:0 0 14px;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.cbx-fill rect{transform-box:fill-box;transform-origin:center}
.cbx-pop{animation:cbxPop .28s cubic-bezier(.2,.9,.3,1.4)}
@keyframes cbxPop{from{transform:scale(.5);opacity:.3}to{transform:scale(1);opacity:1}}
.cbx-burst{transform-box:fill-box;transform-origin:center;animation:cbxBurst .55s ease-out forwards;pointer-events:none}
@keyframes cbxBurst{
  0%{transform:scale(1) rotate(0deg);opacity:.95}
  100%{transform:scale(1.7) rotate(14deg);opacity:0}}
@media (max-width:380px){.cbx-slot{width:66px;height:66px}.cbx-score{font-size:19px}}
</style>
<div class="game-app">
  <div class="cbx">
    <div class="cbx-head">
      <h2 class="cbx-title">Color Block</h2>
      <span class="cbx-status" role="status"><i class="cbx-dot" data-dot></i><span data-status>Ready</span></span>
    </div>
    <div class="cbx-scores" data-scores></div>
    <div class="cbx-boardwrap">
      <svg class="cbx-board" data-svg viewBox="0 0 ${BOARD} ${BOARD}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Color Block board">
        <g data-bg></g><g class="cbx-fill" data-fill></g><g data-fx></g>
        <g data-ghost></g><g data-cursor></g><g data-hit></g>
      </svg>
      <div class="cbx-veil" data-veil hidden>
        <div class="cbx-result">
          <h3 data-res-title></h3>
          <p data-res-sub></p>
          <button class="cbx-btn primary" type="button" data-act="restart">Play again</button>
        </div>
      </div>
    </div>
    <div class="cbx-tray" data-tray></div>
    <div class="cbx-tools">
      <button class="cbx-btn" type="button" data-act="cheats" data-cheats-btn>Cheats</button>
      <button class="cbx-btn" type="button" data-act="restart">Restart</button>
    </div>
    <div class="cbx-cheats" data-cheats hidden>
      <button class="cbx-btn" type="button" data-cheat="wipe">Clear board</button>
      <button class="cbx-btn" type="button" data-cheat="score">+100 points</button>
      <button class="cbx-btn" type="button" data-cheat="reroll">New pieces</button>
      <button class="cbx-btn" type="button" data-cheat="easy" data-easy-btn>Easy pieces</button>
      <button class="cbx-btn" type="button" data-cheat="best" data-best-btn>Best move</button>
    </div>
  </div>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $("[data-svg]");
    const bgG = $("[data-bg]"), fillG = $("[data-fill]"), fxG = $("[data-fx]");
    const ghostG = $("[data-ghost]"), cursorG = $("[data-cursor]"), hitG = $("[data-hit]");
    const trayEl = $("[data-tray]"), scoresEl = $("[data-scores]");
    const statusEl = $("[data-status]"), dotEl = $("[data-dot]");
    const veilEl = $("[data-veil]"), resTitle = $("[data-res-title]"), resSub = $("[data-res-sub]");
    const cheatsEl = $("[data-cheats]"), cheatsBtn = $("[data-cheats-btn]");
    const easyBtn = $("[data-easy-btn]"), bestBtn = $("[data-best-btn]");

    /* papan statis: background + hit-layer sekali saja */
    {
        let bg = "", hit = "";
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                bg += `<rect x="${x * CELL + 1}" y="${y * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="6" fill="#f1f3f7"/>`;
                hit += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="transparent" data-cell data-x="${x}" data-y="${y}"/>`;
            }
        }
        bgG.innerHTML = bg;
        hitG.innerHTML = hit;
    }

    /* ---------- render ---------- */
    function miniSvg(sh) {
        const w = (Math.max(...sh.cells.map((c) => c[0])) + 1) * MINI;
        const h = (Math.max(...sh.cells.map((c) => c[1])) + 1) * MINI;
        let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`;
        sh.cells.forEach(([x, y]) => {
            s += `<rect x="${x * MINI + 1}" y="${y * MINI + 1}" width="${MINI - 2}" height="${MINI - 2}" rx="3.5" fill="${sh.color}"/>`;
        });
        return s + "</svg>";
    }

    function renderScores() {
        const me = mySeat();
        scoresEl.innerHTML = [0, 1].map((s) => {
            const on = state.phase === "playing" && state.turn === s;
            const you = s === me ? '<em class="cbx-you">You</em>' : "";
            const sub = s === me ? `Lines ${state.lines[s]} · Best ${best}` : `Lines ${state.lines[s]}`;
            return `<div class="cbx-card${on ? " on" : ""}" style="--seat:${SEAT_COLORS[s]}">
        <div class="cbx-name"><i></i><span>${state.names[s] || "…"}</span>${you}</div>
        <div class="cbx-score">${state.scores[s]}</div>
        <div class="cbx-sub">${sub}</div></div>`;
        }).join("");
    }

    function renderBoard() {
        let s = "";
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                const c = state.board[idx(x, y)];
                if (c) s += `<rect data-idx="${idx(x, y)}" x="${x * CELL + 3}" y="${y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${c}" stroke="#00000012"/>`;
            }
        }
        fillG.innerHTML = s;
    }

    function renderTray() {
        if (selected >= 0 && !trayShape(selected)) selected = -1;
        trayEl.innerHTML = "";
        state.tray.forEach((id, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.slot = i;
            const sh = id ? SHAPE_BY_ID[id] : null;
            const dead = sh && !fitsAnywhere(state.board, sh.cells);
            b.className = "cbx-slot" + (i === selected ? " sel" : "") + (!sh ? " empty" : "") + (dead ? " dead" : "");
            b.innerHTML = `<kbd>${i + 1}</kbd>`;
            if (!sh || dead || state.phase !== "playing") b.disabled = true;
            b.setAttribute("aria-label", sh ? `Piece ${sh.fam}` : "Empty slot");
            if (sh) b.innerHTML += miniSvg(sh);
            trayEl.appendChild(b);
        });
    }

    function drawGhost() {
        const sh = selected >= 0 ? trayShape(selected) : null;
        if (!sh || state.phase !== "playing" || state.turn !== mySeat()) { ghostG.innerHTML = ""; return; }
        const ok = fitsAt(state.board, sh.cells, cursor.x, cursor.y);
        const color = ok ? "#10b981" : "#ef4444";
        let s = "";
        for (const [cx, cy] of sh.cells) {
            const x = cursor.x + cx, y = cursor.y + cy;
            if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
            s += `<rect x="${x * CELL + 3}" y="${y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${color}" fill-opacity=".25" stroke="${color}" stroke-opacity=".6" stroke-width="1.5"/>`;
        }
        ghostG.innerHTML = s;
    }

    function drawCursor() {
        if (state.phase !== "playing" || state.turn !== mySeat()) { cursorG.innerHTML = ""; return; }
        cursorG.innerHTML = `<rect x="${cursor.x * CELL + 2}" y="${cursor.y * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="7" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }

    function playFx() {
        const fx = state.fx;
        if (!fx || fx.key === lastFxKey) return;
        lastFxKey = fx.key;
        // pop-in blok yang baru dipasang
        (fx.placed || []).forEach((p) => {
            const r = fillG.querySelector(`[data-idx="${idx(p.x, p.y)}"]`);
            if (r) r.classList.add("cbx-pop");
        });
        // ledakan blok yang hancur
        let s = "";
        (fx.cleared || []).forEach((p, i) => {
            s += `<rect class="cbx-burst" style="animation-delay:${i * 18}ms" x="${p.x * CELL + 3}" y="${p.y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${p.color}"/>`;
        });
        fxG.innerHTML = s;
        clearTimeout(fxTimer);
        fxTimer = setTimeout(() => { fxG.innerHTML = ""; }, 900);
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Connecting…";
            dotEl.className = "cbx-dot wait";
            scoresEl.innerHTML = "";
            fillG.innerHTML = ""; trayEl.innerHTML = "";
            veilEl.hidden = true;
            return;
        }
        const me = mySeat();
        const mine = state.turn === me;
        const playing = state.phase === "playing";

        renderScores();
        renderBoard();
        renderTray();
        drawGhost();
        drawCursor();
        playFx();

        if (!playing) {
            statusEl.textContent = "Game over";
            dotEl.className = "cbx-dot";
            const w = state.winner;
            resTitle.textContent = w === "draw" ? "Draw" : `${state.names[w]} wins`;
            resTitle.style.color = w === "draw" ? "" : SEAT_COLORS[w];
            resSub.textContent = `${state.scores[0]} — ${state.scores[1]}`;
            veilEl.hidden = false;
            if (bestSavedFor !== state.gameId) {
                bestSavedFor = state.gameId;
                if (state.scores[me] > best) {
                    best = state.scores[me];
                    try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
                    renderScores();
                }
            }
        } else {
            veilEl.hidden = true;
            if (mine) { statusEl.textContent = "Your turn"; dotEl.className = "cbx-dot me"; }
            else {
                statusEl.textContent = !online ? "Bot is thinking…" : `${state.names[state.turn]}'s turn`;
                dotEl.className = "cbx-dot wait";
            }
        }

        cheatsEl.hidden = !cheatsOpen;
        cheatsBtn.classList.toggle("toggled", cheatsOpen);
        easyBtn.textContent = `Easy pieces: ${state.easy ? "On" : "Off"}`;
        easyBtn.classList.toggle("toggled", state.easy);
        bestBtn.disabled = !playing || !mine;
        cheatsEl.querySelectorAll("[data-cheat]").forEach((b) => {
            if (b.dataset.cheat !== "best") b.disabled = !playing;
        });
    }

    /* ---------- bot (mode AI, giliran diacak di newGame) ---------- */
    function ensureBot() {
        if (destroyed || online || botTimer) return;
        if (state?.phase === "playing" && state.turn === 1) {
            botTimer = setTimeout(() => {
                botTimer = null;
                if (destroyed || !state || state.phase !== "playing" || state.turn !== 1) return;
                const mv = bestMove(state, 1);
                if (mv) applyAction({ type: "place", ...mv }, 1);
            }, 700 + Math.random() * 600);
        }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        ensureBot();
    }

    /* ---------- mutasi state (hanya host / lokal) ---------- */
    function checkEnd() {
        if (state.phase !== "playing") return;
        const alive = state.tray.some((id) => id && fitsAnywhere(state.board, SHAPE_BY_ID[id].cells));
        if (!alive) {
            state.phase = "over";
            state.winner = state.scores[0] > state.scores[1] ? 0 : state.scores[1] > state.scores[0] ? 1 : "draw";
        }
    }

    function doPlace(seat, slot, gx, gy) {
        const id = state.tray[slot];
        const sh = id && SHAPE_BY_ID[id];
        if (!sh || !fitsAt(state.board, sh.cells, gx, gy)) return false;
        const placed = sh.cells.map(([cx, cy]) => ({ x: gx + cx, y: gy + cy }));
        placed.forEach((p) => { state.board[idx(p.x, p.y)] = sh.color; });
        state.scores[seat] += sh.cells.length;
        const res = clearLines(state.board);
        state.board = res.board;
        state.scores[seat] += res.gained;
        state.lines[seat] += res.lines;
        state.tray[slot] = null;
        if (state.tray.every((t) => !t)) state.tray = randTray(state.easy);
        state.moves++;
        state.turn = 1 - seat;
        state.fx = { key: `${state.gameId}:${state.moves}`, placed, cleared: res.cleared };
        checkEnd();
        return true;
    }

    function applyAction(action, actor) {
        if (destroyed || !action) return;
        const seat = state ? state.seats[actor] : 0;

        if (action.type === "join") {
            if (!online || actor !== 1 || !state) return;
            const nm = cleanName(action.name);
            if (nm) { state.names[state.seats[1]] = nm; publish(); }
            return;
        }
        if (action.type === "restart") {
            clearTimeout(botTimer); botTimer = null;
            selected = -1;
            state = newGame(state);
            publish();
            return;
        }
        if (!state || state.phase !== "playing") return;

        if (action.type === "place") {
            if (state.turn !== seat) return;
            const slot = Number(action.slot), gx = Number(action.x), gy = Number(action.y);
            if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
            if (!Number.isInteger(gx) || !Number.isInteger(gy)) return;
            if (doPlace(seat, slot, gx, gy)) publish();
            return;
        }
        if (action.type === "cheat") {
            const kind = action.kind;
            if (kind === "wipe") {
                const cleared = [];
                for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
                    const c = state.board[idx(x, y)];
                    if (c) { cleared.push({ x, y, color: c }); state.board[idx(x, y)] = null; }
                }
                state.moves++;
                state.fx = { key: `${state.gameId}:${state.moves}`, placed: [], cleared };
            } else if (kind === "score") {
                state.scores[seat] += 100;
            } else if (kind === "reroll") {
                state.tray = randTray(state.easy);
                checkEnd();
            } else if (kind === "easy") {
                state.easy = !state.easy;
            } else if (kind === "best") {
                if (state.turn !== seat) return;
                const mv = bestMove(state, seat);
                if (!mv || !doPlace(seat, mv.slot, mv.x, mv.y)) return;
            } else return;
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------- input: mouse / tap ---------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (!state) return;

        const act = t.closest("[data-act]");
        if (act) {
            if (act.dataset.act === "restart") submitAction({ type: "restart" });
            else if (act.dataset.act === "cheats") { cheatsOpen = !cheatsOpen; render(); }
            return;
        }
        const cheat = t.closest("[data-cheat]");
        if (cheat && !cheat.disabled) { submitAction({ type: "cheat", kind: cheat.dataset.cheat }); return; }

        const slotBtn = t.closest("[data-slot]");
        if (slotBtn && !slotBtn.disabled) {
            const i = Number(slotBtn.dataset.slot);
            selected = selected === i ? -1 : i;
            renderTray(); drawGhost();
            return;
        }
        const cell = t.closest("[data-cell]");
        if (cell) {
            cursor = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
            tryPlace();
        }
    }

    function tryPlace() {
        if (!state || state.phase !== "playing" || state.turn !== mySeat() || selected < 0) return;
        submitAction({ type: "place", slot: selected, x: cursor.x, y: cursor.y });
        selected = -1;
        if (!online) { drawGhost(); } // host: render datang dari publish
    }

    function handlePointerMove(e) {
        if (!state || state.phase !== "playing") return;
        const c = e.target.closest?.("[data-cell]");
        if (!c) return;
        cursor = { x: Number(c.dataset.x), y: Number(c.dataset.y) };
        drawGhost(); drawCursor();
    }
    function handlePointerLeave() { ghostG.innerHTML = ""; }

    /* ---------- input: keyboard (desktop) ---------- */
    function handleKey(e) {
        if (destroyed || !state || e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const k = e.code;
        const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (move) {
            e.preventDefault();
            cursor.x = Math.min(GRID - 1, Math.max(0, cursor.x + move[0]));
            cursor.y = Math.min(GRID - 1, Math.max(0, cursor.y + move[1]));
            drawGhost(); drawCursor();
            return;
        }
        if (k === "Digit1" || k === "Digit2" || k === "Digit3") {
            e.preventDefault();
            const i = Number(k.slice(-1)) - 1;
            const btn = trayEl.querySelector(`[data-slot="${i}"]`);
            if (btn && !btn.disabled) { selected = selected === i ? -1 : i; renderTray(); drawGhost(); }
            return;
        }
        if (k === "Enter" || k === "Space") {
            e.preventDefault();
            if (state.phase !== "playing" || state.turn !== mySeat()) return;
            if (selected < 0) { // pilih piece pertama yang masih hidup
                const i = state.tray.findIndex((id, j) => id && fitsAnywhere(state.board, SHAPE_BY_ID[id].cells));
                if (i >= 0) { selected = i; renderTray(); drawGhost(); }
            } else tryPlace();
            return;
        }
        if (k === "Escape") {
            if (cheatsOpen) { cheatsOpen = false; render(); }
            else { selected = -1; renderTray(); drawGhost(); }
            return;
        }
        if (k === "KeyC") { cheatsOpen = !cheatsOpen; render(); }
    }

    root.addEventListener("click", handleClick);
    svgEl.addEventListener("pointermove", handlePointerMove);
    svgEl.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("keydown", handleKey);

    /* ---------- wiring mode ---------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = newGame();
            publish();
            const offAct = room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = room.onState((nextState) => {
                state = nextState;
                if (!joinSent && state) {
                    joinSent = true;
                    room.sendAction({ type: "join", name: playerName }).catch(console.warn);
                }
                render();
            });
            if (typeof offState === "function") offs.push(offState);
            room.sendAction({ type: "join", name: playerName }).catch(console.warn);
            joinSent = true;
            render();
        }
    } else {
        state = newGame();
        render();
        ensureBot();
    }

    return {
        destroy() {
            destroyed = true;
            clearTimeout(botTimer); botTimer = null;
            clearTimeout(fxTimer); fxTimer = null;
            root.removeEventListener("click", handleClick);
            svgEl.removeEventListener("pointermove", handlePointerMove);
            svgEl.removeEventListener("pointerleave", handlePointerLeave);
            document.removeEventListener("keydown", handleKey);
            offs.forEach((off) => { try { off(); } catch (_) { } });
        },
    };
}