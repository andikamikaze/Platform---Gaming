/*
  Petdoku — template-compatible module.
  - META.id harus sama dengan nama file tanpa .js  -> "petdoku"
  - Setelah edit: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "petdoku",
    name: "Petdoku",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Take turns placing six pets on a 6×6 grid — one per row and column, never touching.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="40" height="40" rx="6" opacity=".45"/><path stroke-width="1.3" opacity=".4" d="M24 4v40M4 24h40"/><g stroke-width="2"><circle cx="14" cy="14" r="6.5"/><circle cx="9.5" cy="8.5" r="2.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="8.5" r="2.4" fill="currentColor" stroke="none"/><circle cx="11.8" cy="13.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.2" cy="13.5" r="1.1" fill="currentColor" stroke="none"/><path d="M31 19.5 L28.6 12.5 L34.8 15 Z"/><path d="M41 19.5 L43.4 12.5 L37.2 15 Z"/><circle cx="36" cy="24" r="6.5"/><circle cx="33.5" cy="23" r="1.1" fill="currentColor" stroke="none"/><circle cx="38.5" cy="23" r="1.1" fill="currentColor" stroke="none"/><circle cx="14" cy="36" r="6.5"/><circle cx="9.5" cy="30.5" r="2.2" fill="currentColor" stroke="none"/><circle cx="18.5" cy="30.5" r="2.2" fill="currentColor" stroke="none"/><ellipse cx="11.6" cy="35.2" rx="1.9" ry="2.4" transform="rotate(-20 11.6 35.2)" fill="currentColor" stroke="none"/><ellipse cx="16.4" cy="35.2" rx="1.9" ry="2.4" transform="rotate(20 16.4 35.2)" fill="currentColor" stroke="none"/></g></svg>',
    bg: ["#fef3c7", "#fde68a"],
    bestKey: "petdokuBestTime",
};

/* ================= pure logic (no DOM) ================= */

const PETS = [
    { key: "dog", name: "Dog", kind: "brown" },
    { key: "bear", name: "Bear", kind: "brown" },
    { key: "cat", name: "Cat", kind: "grey" },
    { key: "rabbit", name: "Rabbit", kind: "white" },
    { key: "fox", name: "Fox", kind: "orange" },
    { key: "panda", name: "Panda", kind: "white" },
];
const COLORS_BUDGET = { brown: 2, grey: 1, white: 2, orange: 1 };
const SEAT_COLORS = ["#6366f1", "#f59e0b"];

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* Pure validator: cells = [{r,c,a}], 0..6 entries. */
function validatePlacement(cells) {
    if (!Array.isArray(cells)) return { ok: false, reason: "Invalid input" };
    const used = [], rows = [], cols = [];
    for (const p of cells) {
        if (!p || typeof p.r !== "number" || typeof p.c !== "number" || typeof p.a !== "number")
            return { ok: false, reason: "Invalid pet entry" };
        if (p.r < 0 || p.r > 5 || p.c < 0 || p.c > 5 || p.a < 0 || p.a > 5)
            return { ok: false, reason: "Outside the grid" };
        if (used.indexOf(p.a) >= 0) return { ok: false, reason: "Each pet can be used once" };
        if (rows.indexOf(p.r) >= 0) return { ok: false, reason: "Row already has a pet" };
        if (cols.indexOf(p.c) >= 0) return { ok: false, reason: "Column already has a pet" };
        used.push(p.a); rows.push(p.r); cols.push(p.c);
    }
    for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++)
            if (Math.abs(cells[i].r - cells[j].r) <= 1 && Math.abs(cells[i].c - cells[j].c) <= 1)
                return { ok: false, reason: "Too close to another pet" };
    const counts = {};
    for (const p of cells) counts[PETS[p.a].kind] = (counts[PETS[p.a].kind] || 0) + 1;
    for (const k in COLORS_BUDGET)
        if ((counts[k] || 0) > COLORS_BUDGET[k]) return { ok: false, reason: "Color limit reached" };
    return { ok: true, reason: "" };
}

function boardCells(board) {
    const out = [];
    for (let i = 0; i < 36; i++)
        if (board[i] >= 0) out.push({ r: (i / 6) | 0, c: i % 6, a: board[i] });
    return out;
}

/* Backtracking solver that EXTENDS the current board. Returns a full
   valid placement or null. Guarantees every generated level is solvable
   and powers hint / safe-move / auto-solve / bot. */
function solveFrom(cells) {
    const rows = cells.map((p) => p.r);
    const cols = cells.map((p) => p.c);
    const usedA = cells.map((p) => p.a);
    const rest = shuffle([0, 1, 2, 3, 4, 5].filter((a) => usedA.indexOf(a) < 0));
    const out = cells.slice();
    const fits = (r, c) => {
        for (const p of out)
            if (Math.abs(p.r - r) <= 1 && Math.abs(p.c - c) <= 1) return false;
        return true;
    };
    const bt = (k) => {
        if (k === rest.length) return true;
        const a = rest[k];
        const spots = [];
        for (let r = 0; r < 6; r++) {
            if (rows.indexOf(r) >= 0) continue;
            for (let c = 0; c < 6; c++) {
                if (cols.indexOf(c) >= 0) continue;
                if (fits(r, c)) spots.push({ r, c });
            }
        }
        shuffle(spots);
        for (const s of spots) {
            out.push({ r: s.r, c: s.c, a }); rows.push(s.r); cols.push(s.c);
            if (bt(k + 1)) return true;
            out.pop(); rows.pop(); cols.pop();
        }
        return false;
    };
    return bt(0) ? out : null;
}

function generateSolution() {
    for (let t = 0; t < 40; t++) {
        const sol = solveFrom([]);
        if (sol && validatePlacement(sol).ok) return sol;
    }
    /* Static verified fallback */
    return [
        { r: 0, c: 0, a: 0 }, { r: 1, c: 2, a: 1 }, { r: 2, c: 4, a: 2 },
        { r: 3, c: 1, a: 3 }, { r: 4, c: 3, a: 4 }, { r: 5, c: 5, a: 5 },
    ];
}

function legalMoves(board) {
    const cells = boardCells(board);
    const used = cells.map((p) => p.a);
    const mv = [];
    for (let a = 0; a < 6; a++) {
        if (used.indexOf(a) >= 0) continue;
        for (let i = 0; i < 36; i++) {
            if (board[i] >= 0) continue;
            const r = (i / 6) | 0, c = i % 6;
            let ok = true;
            for (const p of cells) {
                if (p.r === r || p.c === c || (Math.abs(p.r - r) <= 1 && Math.abs(p.c - c) <= 1)) { ok = false; break; }
            }
            if (ok) mv.push({ cell: i, pet: a });
        }
    }
    return mv;
}

function safeMoves(board) {
    const cells = boardCells(board);
    return legalMoves(board).filter((m) =>
        solveFrom(cells.concat([{ r: (m.cell / 6) | 0, c: m.cell % 6, a: m.pet }])) !== null
    );
}

const hasMove = (board) => legalMoves(board).length > 0;
const placedCount = (board) => board.reduce((n, x) => n + (x >= 0 ? 1 : 0), 0);
const coordName = (i) => "ABCDEF"[i % 6] + (((i / 6) | 0) + 1);
const fmt = (s) => ((s / 60) | 0) + ":" + String(s % 60).padStart(2, "0");

/* ================= SVG pet faces ================= */

const FACES = [
    /* dog */
    '<path d="M11 20 Q6 8 14 10 Q19 12 18 21 Z" fill="#8a5a2b"/><path d="M37 20 Q42 8 34 10 Q29 12 30 21 Z" fill="#8a5a2b"/><circle cx="24" cy="27" r="14" fill="#b98047"/><ellipse cx="24" cy="33" rx="7" ry="5.5" fill="#e8c9a0"/><circle cx="18.5" cy="24" r="2" fill="#2b1d12"/><circle cx="29.5" cy="24" r="2" fill="#2b1d12"/><ellipse cx="24" cy="30.5" rx="2.8" ry="2.2" fill="#2b1d12"/><path d="M24 32.7 L24 35.3 M24 35.3 Q21.8 37.4 19.6 36.4 M24 35.3 Q26.2 37.4 28.4 36.4" fill="none" stroke="#2b1d12" stroke-width="1.5" stroke-linecap="round"/>',
    /* bear */
    '<circle cx="12.5" cy="13.5" r="6" fill="#7c4a21"/><circle cx="35.5" cy="13.5" r="6" fill="#7c4a21"/><circle cx="12.5" cy="13.5" r="2.6" fill="#a9713d"/><circle cx="35.5" cy="13.5" r="2.6" fill="#a9713d"/><circle cx="24" cy="27" r="14" fill="#8f5a2a"/><ellipse cx="24" cy="32.5" rx="7" ry="5.5" fill="#d9b38c"/><circle cx="18.5" cy="24" r="2" fill="#241708"/><circle cx="29.5" cy="24" r="2" fill="#241708"/><ellipse cx="24" cy="30" rx="2.8" ry="2.2" fill="#241708"/><path d="M24 32.2 L24 34.6 M24 34.6 Q22 36.6 20 35.8 M24 34.6 Q26 36.6 28 35.8" fill="none" stroke="#241708" stroke-width="1.5" stroke-linecap="round"/>',
    /* cat */
    '<path d="M12.5 18 L11 7.5 L20.5 12.5 Z" fill="#9ca3af"/><path d="M35.5 18 L37 7.5 L27.5 12.5 Z" fill="#9ca3af"/><circle cx="24" cy="27.5" r="13" fill="#9ca3af"/><path d="M14.6 13.6 L13.9 9 L18.2 11.5 Z" fill="#cbd5e1"/><path d="M33.4 13.6 L34.1 9 L29.8 11.5 Z" fill="#cbd5e1"/><circle cx="19" cy="25" r="2" fill="#27303f"/><circle cx="29" cy="25" r="2" fill="#27303f"/><path d="M22.3 29.6 L25.7 29.6 L24 31.8 Z" fill="#e28ca6"/><path d="M24 31.8 Q22.4 33.8 20.6 33.2 M24 31.8 Q25.6 33.8 27.4 33.2" fill="none" stroke="#27303f" stroke-width="1.4" stroke-linecap="round"/><path d="M5.5 26 L12 27.2 M6 30.4 L12.3 29.6 M42.5 26 L36 27.2 M42 30.4 L35.7 29.6" stroke="#e2e8f0" stroke-width="1.3" stroke-linecap="round"/>',
    /* rabbit */
    '<ellipse cx="19" cy="11" rx="4.2" ry="9.5" fill="#f4f4f5" stroke="#c9ccd1" stroke-width="1.2"/><ellipse cx="29" cy="11" rx="4.2" ry="9.5" fill="#f4f4f5" stroke="#c9ccd1" stroke-width="1.2"/><ellipse cx="19" cy="12" rx="1.9" ry="5.8" fill="#f2b8c6"/><ellipse cx="29" cy="12" rx="1.9" ry="5.8" fill="#f2b8c6"/><circle cx="24" cy="30" r="12.5" fill="#f4f4f5" stroke="#c9ccd1" stroke-width="1.2"/><circle cx="19.5" cy="28" r="2" fill="#3f3f46"/><circle cx="28.5" cy="28" r="2" fill="#3f3f46"/><path d="M22.4 32.4 L25.6 32.4 L24 34.6 Z" fill="#e28ca6"/><path d="M24 34.6 Q22.4 36.6 20.6 36 M24 34.6 Q25.6 36.6 27.4 36" fill="none" stroke="#3f3f46" stroke-width="1.4" stroke-linecap="round"/>',
    /* fox */
    '<path d="M11.5 17 L9.5 6.5 L19.5 11.5 Z" fill="#ea580c"/><path d="M36.5 17 L38.5 6.5 L28.5 11.5 Z" fill="#ea580c"/><circle cx="24" cy="26" r="13.5" fill="#f97316"/><ellipse cx="24" cy="32" rx="7.5" ry="6" fill="#fff7ed"/><circle cx="18.5" cy="23" r="2" fill="#431407"/><circle cx="29.5" cy="23" r="2" fill="#431407"/><ellipse cx="24" cy="29.5" rx="2.6" ry="2" fill="#431407"/><path d="M24 31.5 L24 33.8 M24 33.8 Q22 35.8 20 35 M24 33.8 Q26 35.8 28 35" fill="none" stroke="#431407" stroke-width="1.5" stroke-linecap="round"/>',
    /* panda */
    '<circle cx="12.5" cy="13.5" r="5.8" fill="#1f2937"/><circle cx="35.5" cy="13.5" r="5.8" fill="#1f2937"/><circle cx="24" cy="26" r="14" fill="#f9fafb" stroke="#d1d5db" stroke-width="1.2"/><ellipse cx="17.5" cy="24" rx="3.6" ry="4.4" fill="#1f2937" transform="rotate(-18 17.5 24)"/><ellipse cx="30.5" cy="24" rx="3.6" ry="4.4" fill="#1f2937" transform="rotate(18 30.5 24)"/><circle cx="17.5" cy="24" r="1.3" fill="#f9fafb"/><circle cx="30.5" cy="24" r="1.3" fill="#f9fafb"/><ellipse cx="24" cy="31.5" rx="2.6" ry="2" fill="#1f2937"/><path d="M21.8 35 Q24 36.8 26.2 35" fill="none" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round"/>',
];
const faceSVG = (a) =>
    '<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">' + FACES[a] + "</svg>";

const HELP_DIAGRAM =
    '<svg viewBox="0 0 96 96" width="104" height="104" aria-hidden="true">' +
    [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
        const x = 2 + c * 32, y = 2 + r * 32, mid = r === 1 && c === 1;
        let s = '<rect x="' + x + '" y="' + y + '" width="28" height="28" rx="6" fill="' +
            (mid ? "#eef2ff" : "#f5f5f4") + '" stroke="' + (mid ? "#6366f1" : "#e7e5e4") + '"/>';
        if (!mid) s += '<path d="M' + (x + 10) + " " + (y + 10) + ' l8 8 m0 -8 l-8 8" stroke="#dc2626" stroke-width="1.6" opacity=".5" stroke-linecap="round" /> ';
        return s;
    }).join("")).join("") +
    '<circle cx="48" cy="52" r="5.5" fill="#6366f1"/><circle cx="41.5" cy="44" r="2.4" fill="#6366f1"/><circle cx="48" cy="41.5" r="2.4" fill="#6366f1"/><circle cx="54.5" cy="44" r="2.4" fill="#6366f1"/></svg>';

/* ================= mount ================= */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    root.innerHTML = `
<style>
.pd-root{--pd-bg:#fafaf9;--pd-card:#ffffff;--pd-ink:#292524;--pd-mut:#78716c;--pd-line:#e7e5e4;--pd-soft:#f5f5f4;--pd-acc:#6366f1;--pd-acc-soft:#eef2ff;--pd-warn:#dc2626;--pd-amber:#f59e0b;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--pd-ink);display:flex;flex-direction:column;gap:8px;min-height:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.pd-root *,.pd-root *::before,.pd-root *::after{box-sizing:border-box}
.pd-root [hidden]{display:none!important}
.pd-root :where(svg,canvas,img){max-width:100%}
.pd-root :where(button):focus-visible{outline:2px solid var(--pd-acc);outline-offset:2px}

/* one HUD row: info left, icon controls right */
.pd-root .pd-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:none;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.pd-root .pd-chip{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:5px 9px;border:1px solid var(--pd-line);border-radius:999px;background:var(--pd-card);color:var(--pd-mut);white-space:nowrap}
.pd-root .pd-chip b{color:var(--pd-ink);font-weight:700;font-variant-numeric:tabular-nums}
.pd-root .pd-chip .game-status-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;flex:none}
.pd-root .pd-chip .game-status-dot.pd-wait{background:var(--pd-amber)}
.pd-root .pd-chip .game-status-dot.pd-off{background:#a8a29e}
.pd-root .pd-chip .pd-seat-dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:none}
.pd-root .pd-spacer{flex:1 1 auto}
.pd-root .pd-btn{appearance:none;border:1px solid var(--pd-line);background:var(--pd-card);color:var(--pd-ink);border-radius:9px;min-height:32px;padding:6px 11px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.02em;cursor:pointer;touch-action:manipulation;user-select:none;transition:background .12s,opacity .12s}
.pd-root .pd-btn:hover:not(:disabled){background:var(--pd-soft)}
.pd-root .pd-btn:disabled{opacity:.4;cursor:default}
.pd-root .pd-btn-primary{background:var(--pd-ink);border-color:var(--pd-ink);color:#fff}
.pd-root .pd-btn-primary:hover:not(:disabled){background:#44403c}
.pd-root .pd-btn-sm{padding:5px 10px;font-size:10px}
.pd-root .pd-btn.on{border-color:var(--pd-acc);color:var(--pd-acc);background:var(--pd-acc-soft)}
.pd-root .pd-icon-btn{display:inline-flex;align-items:center;gap:6px}
.pd-root .pd-icon-btn svg{flex:none;display:block}

/* board fills the remaining height; content stays proportional and centered */
.pd-root.game-fill > .pd-panel[data-board]{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:auto;padding:0;border:1px solid var(--pd-line);border-radius:14px;background:var(--pd-bg);overflow:hidden;display:flex;align-items:center;justify-content:center}
.pd-root .pd-content{width:min(100%,520px);height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:12px;overflow:auto;scrollbar-width:none}
.pd-root .pd-content::-webkit-scrollbar{display:none}
.pd-root .pd-board{width:100%;max-width:440px;margin:0 auto;display:grid;grid-template-columns:16px repeat(6,minmax(0,1fr));gap:5px}
.pd-root .pd-lab{font-size:10px;font-weight:600;color:var(--pd-mut);display:flex;align-items:center;justify-content:center;user-select:none}
.pd-root .pd-cell{position:relative;aspect-ratio:1;background:var(--pd-card);border:1px solid var(--pd-line);border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;touch-action:manipulation;transition:background .12s,border-color .12s}
.pd-root .pd-cell:hover{background:var(--pd-soft)}
.pd-root .pd-cell svg{width:76%;height:76%;display:block}
.pd-root .pd-cell.pd-cur{outline:2px solid var(--pd-acc);outline-offset:-2px}
.pd-root .pd-cell.pd-safe{background:var(--pd-acc-soft);border-color:#c7d2fe}
.pd-root .pd-cell.pd-last{border-color:#a8a29e}
.pd-root .pd-cell.pd-hint{animation:pd-pulse 1s ease-in-out infinite}
.pd-root .pd-cell.pd-flash{animation:pd-fl .5s}
.pd-root .pd-own{position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-radius:50%}
@keyframes pd-fl{0%,100%{background:rgba(220,38,38,.28)}50%{background:rgba(220,38,38,.08)}}
@keyframes pd-pulse{0%,100%{box-shadow:inset 0 0 0 2px var(--pd-amber)}50%{box-shadow:inset 0 0 0 3px var(--pd-amber)}}
.pd-root .pd-msg{min-height:18px;font-size:12px;color:var(--pd-mut);text-align:center}
.pd-root .pd-msg.pd-err{color:var(--pd-warn);font-weight:600}
.pd-root .pd-tray{width:100%;max-width:440px;margin:0 auto;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.pd-root .pd-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px 6px;background:var(--pd-card);border:1px solid var(--pd-line);border-radius:12px;cursor:pointer;color:var(--pd-ink);font:inherit;touch-action:manipulation;transition:background .12s,border-color .12s,opacity .12s}
.pd-root .pd-tile:hover{background:var(--pd-soft)}
.pd-root .pd-tile.pd-sel{border-color:var(--pd-acc);background:var(--pd-acc-soft)}
.pd-root .pd-tile.pd-used{opacity:.3;cursor:default}
.pd-root .pd-tile svg{width:32px;height:32px}
.pd-root .pd-name{font-size:11px;font-weight:600}
.pd-root .pd-kbd{position:absolute;top:3px;left:5px;font-size:9px;color:var(--pd-mut)}
.pd-root .pd-pad{display:none;width:100%;max-width:440px;margin:0 auto;justify-content:center;gap:16px;align-items:center}
.pd-root.pd-show-pad .pd-pad{display:flex}
.pd-root .pd-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,46px);gap:6px}
.pd-root .pd-dpad .pd-btn{padding:0;font-size:16px}
.pd-root .pd-pad-acts{display:flex;flex-direction:column;gap:6px}
.pd-root .pd-pad-acts .pd-btn{height:46px;min-width:96px}
.pd-root .pd-keys{font-size:11px;color:var(--pd-mut);text-align:center}

/* overlays: card = fixed head/foot + scrollable body */
.pd-root .pd-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(250,250,249,.92);backdrop-filter:blur(3px);border-radius:14px;padding:12px}
.pd-root .pd-ov-top{z-index:7}
.pd-root .pd-card{display:flex;flex-direction:column;max-width:400px;width:100%;max-height:100%;overflow:hidden;padding:18px;border:1px solid var(--pd-line);border-radius:16px;background:var(--pd-card);box-shadow:none;text-align:center}
.pd-root .pd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:8px}
.pd-root .pd-head h3{margin:0;font-size:17px;letter-spacing:-.01em;line-height:1.25}
.pd-root .pd-body{flex:1 1 auto;min-height:0;overflow:auto}
.pd-root .pd-body p{margin:0 0 12px;font-size:13px;color:var(--pd-mut);line-height:1.55}
.pd-root .pd-foot{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;flex:none;margin-top:12px}
.pd-root .pd-card-help{max-width:460px;text-align:left}
.pd-root .pd-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.pd-root .pd-help b{display:block;margin:10px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--pd-mut)}
.pd-root .pd-help ul{margin:0;padding-left:16px;font-size:13px;line-height:1.6}
.pd-root .pd-diagram{display:flex;justify-content:center;margin:6px 0}
.pd-root .pd-cheats{display:grid;gap:8px}
.pd-root .pd-cheat{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--pd-soft);text-align:left}
.pd-root .pd-cheat b{font-size:13px;display:block}
.pd-root .pd-cheat small{font-size:11px;color:var(--pd-mut);line-height:1.4;display:block}
.pd-root .pd-note{font-size:11px;color:var(--pd-mut);margin-top:10px;line-height:1.45}
@media (pointer:coarse){.pd-root .pd-keys-desktop{display:none}.pd-root .pd-kbd{display:none}}
@media (pointer:fine){.pd-root .pd-keys-touch{display:none}}
@media (prefers-reduced-motion:reduce){.pd-root *,.pd-root *::before,.pd-root *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- layout overrides (keep last; beat pointer:coarse 44px) --- */
.pd-root.game-fill > .pd-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
.pd-root.game-fill > .pd-panel[data-board]:not(:has(.pd-ov:not([hidden]))){aspect-ratio:auto;flex:0 0 auto;width:100%;min-height:0}
.pd-root.game-fill > .pd-panel[data-board]:has(.pd-ov:not([hidden])){aspect-ratio:auto;flex:0 0 auto;min-height:min(70dvh,620px)}
.pd-root .pd-content{height:auto;min-height:0;overflow:visible;justify-content:flex-start;padding:10px}
.pd-root .pd-hud{gap:5px}
.pd-root .pd-hud .pd-chip{padding:4px 6px;min-height:0;font-size:9px}
.pd-root .pd-hud .pd-chip[data-chip="best"]{display:none}
.pd-root .pd-hud .pd-btn{min-height:32px;padding:5px 9px;font-size:9px}
.pd-root .pd-hud .pd-btn-label,.pd-root .pd-hud .pd-spacer{display:none}
.pd-root .pd-ov{padding:8px}
.pd-root .pd-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.pd-root .pd-body,.pd-root .pd-help,.pd-root .pd-cheats{scrollbar-width:none}
.pd-root .pd-body::-webkit-scrollbar,.pd-root .pd-help::-webkit-scrollbar,.pd-root .pd-cheats::-webkit-scrollbar{display:none}
.pd-root .pd-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--pd-line)}
.pd-root .pd-note{display:none}
}
@media (pointer:coarse){
.pd-root .pd-hud .pd-btn{min-height:32px;padding:5px 9px;font-size:9px}
}
</style>
<div class="game-app pd-root game-fill" data-pd>
  <div class="pd-hud">
    <span class="pd-chip"><i class="game-status-dot" data-dot></i><span data-hud="status">Ready</span></span>
    <span class="pd-chip"><span data-hud="roundlabel">Level</span> <b data-hud="round">1</b></span>
    <span class="pd-chip">Placed <b data-hud="placed">0/6</b></span>
    <span class="pd-chip">Time <b data-hud="time">0:00</b></span>
    <span class="pd-chip" data-chip="turn" hidden><span class="pd-seat-dot" data-hud="turndot"></span><b data-hud="turn">—</b></span>
    <span class="pd-chip" data-chip="score" hidden>Score <b data-hud="score">0 · 0</b></span>
    <span class="pd-chip" data-chip="best" hidden>Best <b data-hud="best">—</b></span>
    <span class="pd-chip" data-chip="assist" hidden>assisted</span>
    <span class="pd-spacer"></span>
    <button class="pd-btn pd-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="pd-btn-label">Help</span></button>
    <button class="pd-btn pd-icon-btn" type="button" data-cheats data-el="cheatbtn" hidden aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="pd-btn-label">Cheats</span></button>
    <button class="pd-btn pd-icon-btn" type="button" data-pad aria-pressed="false" aria-label="On-screen pad" title="Toggle on-screen pad">${iconSVG("gamepad2", { size: 14 })}<span class="pd-btn-label">Pad</span></button>
    <button class="pd-btn pd-icon-btn" type="button" data-pause data-el="pausebtn" aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="pd-btn-label" data-label="pause">Pause</span></button>
    <button class="pd-btn pd-icon-btn" type="button" data-restart data-el="restartbtn" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="pd-btn-label">Restart</span></button>
    <button class="pd-btn pd-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="pd-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel pd-panel" data-board>
    <div class="pd-content">
      <div class="pd-board" data-el="board" role="grid" aria-label="Petdoku 6 by 6 board"></div>
      <div class="pd-msg" data-el="msg" aria-live="polite"></div>
      <div class="pd-tray" data-el="tray"></div>
      <div class="pd-pad">
        <div class="pd-dpad">
          <span></span><button class="pd-btn" type="button" data-act="up" aria-label="Move up">↑</button><span></span>
          <button class="pd-btn" type="button" data-act="left" aria-label="Move left">←</button>
          <button class="pd-btn" type="button" data-act="down" aria-label="Move down">↓</button>
          <button class="pd-btn" type="button" data-act="right" aria-label="Move right">→</button>
        </div>
        <div class="pd-pad-acts">
          <button class="pd-btn pd-btn-primary" type="button" data-act="place">Place</button>
          <button class="pd-btn" type="button" data-act="erase" data-el="erasebtn">Erase</button>
        </div>
      </div>
      <div class="pd-keys">
        <span class="pd-keys-desktop">1–6 pick a pet · Arrows/WASD move · Enter place · Backspace remove · C cheats · H help · P pause · R restart</span>
        <span class="pd-keys-touch">Tap a pet below, then tap a cell — or use the on-screen pad.</span>
      </div>
    </div>

    <div class="pd-ov" data-ov="menu">
      <div class="pd-card">
        <div class="pd-head"><h3>Petdoku</h3><span class="pd-note">6 × 6</span></div>
        <div class="pd-body"><p>The board starts empty. Place all six pets: one per row, one per column, never touching — not even diagonally. Every level is freshly generated and guaranteed solvable.</p></div>
        <div class="pd-foot"><button class="pd-btn" type="button" data-help>How to play</button><button class="pd-btn pd-btn-primary" type="button" data-act="solo">Solo puzzle</button><button class="pd-btn" type="button" data-act="bot">VS Bot</button></div>
        <div class="pd-note" data-el="menubest" hidden></div>
      </div>
    </div>

    <div class="pd-ov" data-ov="ready" hidden>
      <div class="pd-card">
        <div class="pd-head"><h3>Multiplayer</h3><span class="pd-note">Room</span></div>
        <div class="pd-body"><p data-el="readyseat">Connecting to room…</p><p data-el="readyfirst"></p></div>
        <div class="pd-foot"><button class="pd-btn pd-btn-primary" type="button" data-act="begin" data-el="beginbtn" hidden>Start match</button></div>
        <div class="pd-note">Seats and first move are randomized. Either player can start.</div>
      </div>
    </div>

    <div class="pd-ov" data-ov="end" hidden>
      <div class="pd-card">
        <div class="pd-head"><h3 data-el="endtitle">Round over</h3><span class="pd-note">Result</span></div>
        <div class="pd-body"><p data-el="endsub"></p></div>
        <div class="pd-foot"><button class="pd-btn" type="button" data-act="reset" data-el="resetbtn" hidden>Reset match</button><button class="pd-btn pd-btn-primary" type="button" data-act="next" data-el="nextbtn">Next round</button></div>
      </div>
    </div>

    <div class="pd-ov pd-ov-top" data-ov="pause" hidden>
      <div class="pd-card">
        <div class="pd-head"><h3>Paused</h3></div>
        <div class="pd-body"><p>The board, clock and bot are frozen. Resume to continue exactly where you left off.</p></div>
        <div class="pd-foot"><button class="pd-btn pd-btn-primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>

    <div class="pd-ov pd-ov-top" data-ov="help" hidden>
      <div class="pd-card pd-card-help">
        <div class="pd-head"><h3>How to play</h3><button class="pd-btn pd-btn-sm" type="button" data-help-close aria-label="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="pd-body pd-help">
          <div>
            <b>Goal</b>
            <ul><li>Place all <b>six pets</b> on the empty 6×6 grid.</li></ul>
            <b>Rules</b>
            <ul>
              <li>Exactly <b>one pet per row</b> and <b>one per column</b>.</li>
              <li>Pets may <b>never touch</b> — sides or diagonals.</li>
              <li>Color budgets: Brown ≤2 · Grey ≤1 · White ≤2 · Orange ≤1.</li>
              <li>Each pet is used once. Every level is generated solvable.</li>
            </ul>
            <div class="pd-diagram">${HELP_DIAGRAM}</div>
          </div>
          <div>
            <b>VS Bot &amp; Multiplayer</b>
            <ul>
              <li>Players <b>alternate turns</b>, one pet per turn. Placed pets are locked.</li>
              <li>Whoever places the <b>6th pet wins</b>. No legal move on your turn = you lose.</li>
              <li>First move is a <b>coin flip</b> each round; online seats are randomized too.</li>
            </ul>
            <b>Desktop controls</b>
            <ul>
              <li><b>1–6</b> pick pet · <b>Arrows/WASD</b> move cursor · <b>Enter/Space</b> place.</li>
              <li><b>Click</b> place · <b>Right-click / Backspace</b> remove (solo) · <b>Esc</b> deselect.</li>
              <li><b>H</b> help · <b>C</b> cheats · <b>P</b> pause · <b>R</b> restart round.</li>
            </ul>
            <b>Mobile controls</b>
            <ul><li>Tap a pet, tap a cell. Use the <b>Pad</b> (d-pad + Place/Erase) if you prefer buttons.</li></ul>
          </div>
        </div>
        <div class="pd-foot"><span class="pd-note">Press H to reopen this guide</span><button class="pd-btn pd-btn-primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>

    <div class="pd-ov pd-ov-top" data-ov="cheat" hidden>
      <div class="pd-card pd-card-help">
        <div class="pd-head"><h3>Cheats</h3><button class="pd-btn pd-btn-sm" type="button" data-close aria-label="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="pd-body pd-cheats">
          <div class="pd-cheat"><span><b>Hint</b><small>Reveal a safe cell for a pet.</small></span><button class="pd-btn pd-btn-sm" type="button" data-cheat="hint">Show</button></div>
          <div class="pd-cheat"><span><b>Safe move</b><small>Auto-place one pet that keeps the puzzle solvable.</small></span><button class="pd-btn pd-btn-sm" type="button" data-cheat="safe">Place</button></div>
          <div class="pd-cheat"><span><b>X-ray</b><small>Highlight every safe cell for the selected pet.</small></span><button class="pd-btn pd-btn-sm" type="button" data-cheat="xray" data-el="xraybtn">ON</button></div>
          <div class="pd-cheat"><span><b>Undo</b><small>Take back your last move (and the bot's reply).</small></span><button class="pd-btn pd-btn-sm" type="button" data-cheat="undo" data-el="undobtn">Undo</button></div>
          <div class="pd-cheat"><span><b>Auto-solve</b><small>Finish the board instantly. Solo only.</small></span><button class="pd-btn pd-btn-sm" type="button" data-cheat="solve" data-el="solvebtn">Solve</button></div>
        </div>
        <div class="pd-foot"><span class="pd-note">Offline only · assisted rounds don't count</span><button class="pd-btn" type="button" data-close>Done</button></div>
      </div>
    </div>
  </section>
</div>`;

    const $ = (s) => root.querySelector(s);
    const appEl = $(".pd-root");
    const boardEl = $('[data-el="board"]');
    const trayEl = $('[data-el="tray"]');
    const msgEl = $('[data-el="msg"]');
    const statusEl = $('[data-hud="status"]');
    const dotEl = $("[data-dot]");
    const hud = {
        roundlabel: $('[data-hud="roundlabel"]'), round: $('[data-hud="round"]'),
        placed: $('[data-hud="placed"]'), time: $('[data-hud="time"]'),
        turnchip: $('[data-chip="turn"]'), turndot: $('[data-hud="turndot"]'), turn: $('[data-hud="turn"]'),
        scorechip: $('[data-chip="score"]'), score: $('[data-hud="score"]'),
        bestchip: $('[data-chip="best"]'), best: $('[data-hud="best"]'),
        assistchip: $('[data-chip="assist"]'),
    };
    const ov = {
        menu: $('[data-ov="menu"]'), ready: $('[data-ov="ready"]'), end: $('[data-ov="end"]'),
        help: $('[data-ov="help"]'), cheat: $('[data-ov="cheat"]'), pause: $('[data-ov="pause"]'),
    };
    const pauseBtn = $("[data-el=\"pausebtn\"]");
    const pauseLabel = $('[data-label="pause"]');
    const padBtn = $("[data-pad]");

    /* ---------- local UI state ---------- */
    let cursor = 14;
    let selectedPet = -1;
    let helpOpen = false, cheatOpen = false, paused = false, pauseAt = 0;
    let destroyed = false;
    let botTimer = null, msgTimer = null, flashTimers = [];
    let lastAnnounce = "";
    let xrayKey = "", xraySet = new Set();
    let bestTime = 0;
    try { bestTime = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("petdokuHelpSeen") === "1"; } catch (e) { }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("petdokuHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }
    const frozen = () => helpOpen || cheatOpen || paused;

    /* ---------- build board DOM (labels + 36 cells) ---------- */
    const cellEls = [];
    {
        const corner = document.createElement("div");
        corner.className = "pd-lab";
        boardEl.appendChild(corner);
        for (let c = 0; c < 6; c++) {
            const l = document.createElement("div");
            l.className = "pd-lab"; l.textContent = "ABCDEF"[c];
            boardEl.appendChild(l);
        }
        for (let r = 0; r < 6; r++) {
            const l = document.createElement("div");
            l.className = "pd-lab"; l.textContent = String(r + 1);
            boardEl.appendChild(l);
            for (let c = 0; c < 6; c++) {
                const i = r * 6 + c;
                const el = document.createElement("div");
                el.className = "pd-cell";
                el.dataset.cell = String(i);
                el.dataset.k = "";
                el.setAttribute("role", "gridcell");
                boardEl.appendChild(el);
                cellEls.push(el);
            }
        }
    }
    const tileEls = [];
    for (let a = 0; a < 6; a++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pd-tile";
        b.dataset.pet = String(a);
        b.innerHTML = '<span class="pd-kbd">' + (a + 1) + "</span>" + faceSVG(a) +
            '<span class="pd-name">' + PETS[a].name + "</span>";
        trayEl.appendChild(b);
        tileEls.push(b);
    }
    if (typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches)
        appEl.classList.add("pd-show-pad");

    /* ---------- state factory ---------- */
    function makeState(play, round, wins, seats, phase) {
        const first = play === "bot" || play === "online" ? (Math.random() < 0.5 ? 0 : 1) : 0;
        return {
            phase, play, round,
            wins: wins.slice(), seats: seats.slice(),
            first, turn: first,
            board: new Array(36).fill(-1),
            owners: new Array(36).fill(-1),
            moves: [],
            startedAt: phase === "playing" ? Date.now() : 0,
            finishedAt: 0, winner: -1, endReason: "",
            cheated: false, newBest: false, xray: false,
            hintCell: -1, lastCell: -1, deadEnd: false,
            solution: generateSolution(),
        };
    }

    const mySeat = () => (online && state ? state.seats[playerIndex] : 0);
    const yourTurn = () => state && (state.play === "solo" || state.turn === mySeat());
    const seatName = (s) => {
        if (!state || state.play === "solo") return "You";
        if (state.play === "bot") return s === 0 ? "You" : "Bot";
        return s === mySeat() ? "You" : "Opponent";
    };
    const elapsed = () => {
        if (!state || !state.startedAt) return 0;
        /* pause freezes the clock; resume shifts the anchor so time never jumps */
        const end = state.finishedAt || (paused && pauseAt ? pauseAt : Date.now());
        return Math.max(0, Math.round((end - state.startedAt) / 1000));
    };

    function shiftTimeAnchors() {
        if (!state || !pauseAt) return;
        const delta = Date.now() - pauseAt;
        pauseAt = 0;
        if (state.startedAt) state.startedAt += delta;
        if (state.finishedAt) state.finishedAt += delta;
    }
    function setPaused(on) {
        if (on === paused) return;
        if (on) {
            if (!state || state.phase !== "playing" || online) return;
            pauseAt = Date.now();
            paused = true;
            helpOpen = false; cheatOpen = false;
            if (botTimer !== null) { clearTimeout(botTimer); botTimer = null; }
        } else {
            paused = false;
            shiftTimeAnchors();
            scheduleBot();
        }
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { cheatOpen = false; setPaused(false); }
        render();
    }
    function toggleCheats(on) {
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) {
            if (online || !state || !state.play) { cheatOpen = false; return; }
            helpOpen = false; setPaused(false);
        }
        render();
    }
    function togglePause(on) {
        setPaused(typeof on === "boolean" ? on : !paused);
        render();
    }

    /* ---------- messages / flash ---------- */
    function showMsg(text, err) {
        if (msgTimer !== null) { clearTimeout(msgTimer); msgTimer = null; }
        msgEl.textContent = text;
        msgEl.className = "pd-msg" + (err ? " pd-err" : "");
        delete msgEl.dataset.dead;
        if (text) msgTimer = setTimeout(() => {
            msgTimer = null; msgEl.textContent = ""; msgEl.className = "pd-msg";
        }, 3200);
    }
    function flash(i) {
        cellEls[i].classList.add("pd-flash");
        const t = setTimeout(() => {
            flashTimers = flashTimers.filter((x) => x !== t);
            cellEls[i].classList.remove("pd-flash");
        }, 520);
        flashTimers.push(t);
    }

    /* ---------- round lifecycle helpers ---------- */
    function finishRound(winnerSeat, reason) {
        state.phase = reason === "stuck" ? "stuck" : "won";
        state.winner = winnerSeat;
        state.endReason = reason;
        state.finishedAt = Date.now();
        state.hintCell = -1;
        if (state.play !== "solo") state.wins[winnerSeat] += 1;
        if (state.play === "solo" && !state.cheated) {
            const t = elapsed();
            if (bestTime === 0 || t < bestTime) {
                bestTime = t; state.newBest = true;
                try { localStorage.setItem(META.bestKey, String(t)); } catch (e) { }
            }
        }
    }

    function doPlace(cell, pet, seat) {
        state.board[cell] = pet;
        state.owners[cell] = seat;
        state.moves.push({ cell, pet, seat });
        state.lastCell = cell;
        state.hintCell = -1;
        const n = placedCount(state.board);
        if (n === 6) { finishRound(seat, "complete"); return; }
        if (state.play === "solo") {
            state.deadEnd = !hasMove(state.board);
            state.turn = 0;
        } else if (!hasMove(state.board)) {
            finishRound(seat, "stuck"); /* opponent has no legal move */
        } else {
            state.turn = 1 - seat;
        }
    }

    function pickMove(list) {
        let pool = list;
        if (selectedPet >= 0) {
            const pref = list.filter((m) => m.pet === selectedPet);
            if (pref.length) pool = pref;
        }
        return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
    }

    /* ---------- canonical mutations ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action !== "object") return;
        const seat = online ? state.seats[actor] : actor;
        const t = action.type;

        if (t === "begin") {
            if (state.phase !== "ready") return;
            state.phase = "playing";
            state.startedAt = Date.now();
            publish(); return;
        }
        if (t === "place") {
            if (state.phase !== "playing") return;
            if (state.play !== "solo" && seat !== state.turn) return;
            const cell = action.cell, pet = action.pet;
            if (!Number.isInteger(cell) || !Number.isInteger(pet)) return;
            if (cell < 0 || cell > 35 || pet < 0 || pet > 5) return;
            if (state.board[cell] >= 0 || state.board.indexOf(pet) >= 0) return;
            const cand = boardCells(state.board);
            cand.push({ r: (cell / 6) | 0, c: cell % 6, a: pet });
            if (!validatePlacement(cand).ok) return;
            doPlace(cell, pet, seat);
            publish(); return;
        }
        if (t === "remove") {
            if (state.play !== "solo" || state.phase !== "playing") return;
            const cell = action.cell;
            if (!Number.isInteger(cell) || cell < 0 || cell > 35 || state.board[cell] < 0) return;
            state.board[cell] = -1; state.owners[cell] = -1;
            state.moves = state.moves.filter((m) => m.cell !== cell);
            state.lastCell = -1; state.hintCell = -1;
            state.deadEnd = !hasMove(state.board);
            publish(); return;
        }
        if (t === "undo") {
            if (state.play === "online" || !state.moves.length) return;
            if (state.play === "bot") {
                if (state.phase === "stuck" && state.winner === 1) {
                    state.wins[1] -= 1;
                    state.phase = "playing"; state.finishedAt = 0;
                    state.winner = -1; state.endReason = "";
                } else if (!(state.phase === "playing" && state.turn === 0)) return;
                while (state.moves.length) {
                    const m = state.moves.pop();
                    state.board[m.cell] = -1; state.owners[m.cell] = -1;
                    if (m.seat === 0) break;
                }
                state.turn = 0;
            } else {
                if (state.phase !== "playing") return;
                const m = state.moves.pop();
                state.board[m.cell] = -1; state.owners[m.cell] = -1;
            }
            state.cheated = true; state.deadEnd = false;
            state.lastCell = -1; state.hintCell = -1;
            publish(); return;
        }
        if (t === "hint") {
            if (state.play === "online" || state.phase !== "playing") return;
            if (state.play === "bot" && state.turn !== 0) return;
            if (!Number.isInteger(action.cell)) return;
            state.hintCell = action.cell;
            state.cheated = true;
            publish(); return;
        }
        if (t === "safe") {
            if (state.play === "online" || state.phase !== "playing") return;
            if (state.play === "bot" && state.turn !== 0) return;
            const m = pickMove(safeMoves(state.board));
            if (!m) return;
            state.cheated = true;
            doPlace(m.cell, m.pet, 0);
            publish(); return;
        }
        if (t === "xray") {
            if (state.play === "online") return;
            state.xray = !state.xray;
            if (state.xray) state.cheated = true;
            publish(); return;
        }
        if (t === "solve") {
            if (state.play !== "solo" || state.phase !== "playing") return;
            const sol = solveFrom(boardCells(state.board));
            if (!sol) return;
            state.cheated = true;
            for (const p of sol) {
                const i = p.r * 6 + p.c;
                if (state.board[i] < 0) {
                    state.board[i] = p.a; state.owners[i] = 0;
                    state.moves.push({ cell: i, pet: p.a, seat: 0 });
                }
            }
            finishRound(0, "complete");
            publish(); return;
        }
        if (t === "next") {
            if (state.phase !== "won" && state.phase !== "stuck") return;
            state = makeState(state.play, state.round + 1, state.wins, state.seats, "playing");
            publish(); return;
        }
        if (t === "restart") {
            if (!state.play || state.phase === "ready") return;
            state = makeState(state.play, state.round, state.wins, state.seats, "playing");
            publish(); return;
        }
        if (t === "reset") {
            if (state.play === "solo" || !state.play) return;
            const seats = online ? shuffle([0, 1]) : [0, 1];
            state = makeState(state.play, 1, [0, 0], seats, "playing");
            publish(); return;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, playerIndex);
    }

    /* ---------- bot ---------- */
    function scheduleBot() {
        if (botTimer !== null) { clearTimeout(botTimer); botTimer = null; }
        if (destroyed || online || !state || frozen()) return;
        if (state.play === "bot" && state.phase === "playing" && state.turn === 1) {
            botTimer = setTimeout(() => { botTimer = null; botPlay(); }, 650 + Math.random() * 750);
        }
    }
    function botPlay() {
        if (destroyed || !state || state.play !== "bot" || frozen()) return;
        if (state.phase !== "playing" || state.turn !== 1) return;
        const legal = legalMoves(state.board);
        if (!legal.length) return;
        let m;
        if (placedCount(state.board) === 5) {
            m = legal[(Math.random() * legal.length) | 0]; /* winning move */
        } else {
            const blunder = Math.max(0.06, 0.38 - 0.05 * (state.round - 1));
            const safe = safeMoves(state.board);
            const pool = (Math.random() < blunder || !safe.length) ? legal : safe;
            m = pool[(Math.random() * pool.length) | 0];
        }
        applyAction({ type: "place", cell: m.cell, pet: m.pet }, 1);
    }

    /* ---------- render ---------- */
    function updateClock() {
        if (state) hud.time.textContent = fmt(elapsed());
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            statusEl.textContent = "Connecting…";
            dotEl.className = "game-status-dot pd-wait";
            ov.menu.hidden = true; ov.end.hidden = true;
            ov.ready.hidden = frozen();
            ov.help.hidden = !helpOpen;
            ov.cheat.hidden = true;
            ov.pause.hidden = true;
            return;
        }
        const play = state.play;
        const match = play === "bot" || play === "online";
        const mine = yourTurn();
        const playing = state.phase === "playing";

        if (selectedPet >= 0 && state.board.indexOf(selectedPet) >= 0) selectedPet = -1;

        /* status */
        let status = "Ready", dot = "";
        if (paused) { status = "Paused"; dot = "pd-wait"; }
        else if (state.phase === "ready") { status = "Waiting to start"; dot = "pd-wait"; }
        else if (playing) {
            if (!match || mine) status = "Your move";
            else { status = play === "bot" ? "Bot is thinking…" : "Opponent's move"; dot = "pd-wait"; }
        } else if (state.phase === "won" || state.phase === "stuck") {
            status = play === "solo" ? "Level clear" : (state.winner === mySeat() ? "You win" : (play === "bot" ? "Bot wins" : "Opponent wins"));
            dot = "pd-off";
        }
        statusEl.textContent = status;
        dotEl.className = "game-status-dot" + (dot ? " " + dot : "");

        /* chips */
        hud.roundlabel.textContent = play === "solo" ? "Level" : "Round";
        hud.round.textContent = String(state.round);
        hud.placed.textContent = placedCount(state.board) + "/6";
        updateClock();
        hud.turnchip.hidden = !match;
        if (match) {
            hud.turn.textContent = playing ? seatName(state.turn) + " to move" : "—";
            hud.turndot.style.background = SEAT_COLORS[state.turn];
        }
        hud.scorechip.hidden = !match;
        if (match) hud.score.textContent = seatName(0) + " " + state.wins[0] + " · " + seatName(1) + " " + state.wins[1];
        hud.bestchip.hidden = play !== "solo";
        hud.best.textContent = bestTime ? fmt(bestTime) : "—";
        hud.assistchip.hidden = !state.cheated;
        $('[data-el="cheatbtn"]').hidden = online || !play;
        $('[data-el="restartbtn"]').disabled = !play || state.phase === "ready";
        $('[data-el="erasebtn"]').style.display = play === "solo" ? "" : "none";
        pauseBtn.disabled = online || !playing;
        if (pauseLabel) pauseLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");

        /* x-ray safe cells (cached) */
        const wantXray = state.xray && playing && selectedPet >= 0 && state.board.indexOf(selectedPet) < 0 && (!match || mine);
        if (wantXray) {
            const key = state.board.join(",") + "|" + selectedPet;
            if (key !== xrayKey) {
                xrayKey = key;
                xraySet = new Set(safeMoves(state.board).filter((m) => m.pet === selectedPet).map((m) => m.cell));
            }
        } else { xrayKey = ""; xraySet = new Set(); }

        /* cells */
        for (let i = 0; i < 36; i++) {
            const el = cellEls[i];
            const pet = state.board[i];
            const owner = state.owners[i];
            const k = pet + ":" + owner + ":" + (match ? 1 : 0);
            if (el.dataset.k !== k) {
                el.dataset.k = k;
                el.innerHTML = pet >= 0
                    ? faceSVG(pet) + (match && owner >= 0 ? '<span class="pd-own" style="background:' + SEAT_COLORS[owner] + '"></span>' : "")
                    : "";
            }
            let cls = "pd-cell";
            if (playing && (!match || mine) && cursor === i) cls += " pd-cur";
            if (xraySet.has(i)) cls += " pd-safe";
            if (state.hintCell === i) cls += " pd-hint";
            if (state.lastCell === i && pet >= 0) cls += " pd-last";
            if (el.classList.contains("pd-flash")) cls += " pd-flash";
            el.className = cls;
            el.setAttribute("aria-label", coordName(i) + ": " + (pet >= 0 ? PETS[pet].name + (match ? " (" + seatName(owner) + ")" : "") : "empty"));
        }

        /* tray */
        for (let a = 0; a < 6; a++) {
            const used = state.board.indexOf(a) >= 0;
            tileEls[a].className = "pd-tile" + (used ? " pd-used" : "") + (selectedPet === a ? " pd-sel" : "");
            tileEls[a].setAttribute("aria-pressed", selectedPet === a ? "true" : "false");
        }

        /* dead-end notice (solo, recoverable) */
        if (play === "solo" && playing && state.deadEnd) {
            if (msgTimer !== null) { clearTimeout(msgTimer); msgTimer = null; }
            msgEl.textContent = "No valid moves left — remove a pet or restart.";
            msgEl.className = "pd-msg pd-err";
            msgEl.dataset.dead = "1";
        } else if (msgEl.dataset.dead === "1") {
            showMsg("", false);
        }

        /* round announcements (works for host, guest and local) */
        if (playing) {
            const key = play + ":" + state.round + ":" + state.first + ":" + state.startedAt;
            if (key !== lastAnnounce) {
                lastAnnounce = key;
                if (play === "solo") showMsg("Level " + state.round + " — place all six pets.", false);
                else if (play === "bot") showMsg(state.first === 0 ? "Coin flip: you move first." : "Coin flip: Bot moves first.", false);
                else showMsg("Round " + state.round + " — " + (state.first === mySeat() ? "you move" : "opponent moves") + " first.", false);
            }
        }

        /* overlays — help, cheats and pause suppress each other */
        ov.menu.hidden = state.phase !== "menu" || frozen();
        const menuBest = $('[data-el="menubest"]');
        menuBest.hidden = !bestTime;
        if (bestTime) menuBest.textContent = "Best solo time: " + fmt(bestTime);

        ov.ready.hidden = !(online && state.phase === "ready") || frozen();
        if (online && state.phase === "ready" && !frozen()) {
            const ms = mySeat();
            $('[data-el="readyseat"]').innerHTML = 'You are <b style="color:' + SEAT_COLORS[ms] + '">Player ' + (ms + 1) + "</b> (" + playerName + ").";
            $('[data-el="readyfirst"]').textContent = state.first === ms ? "You move first this round." : "Opponent moves first this round.";
            $('[data-el="beginbtn"]').hidden = false;
        }

        const ended = state.phase === "won" || state.phase === "stuck";
        ov.end.hidden = !ended || frozen();
        if (ended && !frozen()) {
            const t = fmt(elapsed());
            let title, sub;
            if (play === "solo") {
                title = "Level " + state.round + " complete";
                sub = "All six pets placed in " + t + ".";
                if (state.newBest) sub += " New best time!";
                if (state.cheated) sub += " (assisted — best time not recorded)";
            } else {
                const w = state.winner;
                title = w === mySeat() ? "You win!" : (play === "bot" ? "Bot wins" : "Opponent wins");
                sub = state.endReason === "stuck"
                    ? seatName(1 - w) + " had no legal move left."
                    : seatName(w) + " placed the final pet in " + t + ".";
                sub += " Score — " + seatName(0) + " " + state.wins[0] + " · " + seatName(1) + " " + state.wins[1] + ".";
            }
            $('[data-el="endtitle"]').textContent = title;
            $('[data-el="endsub"]').textContent = sub;
            $('[data-el="nextbtn"]').textContent = play === "solo" ? "Next level" : "Next round";
            $('[data-el="resetbtn"]').hidden = play === "solo";
        }

        ov.help.hidden = !helpOpen;
        ov.cheat.hidden = !cheatOpen || online || paused;
        ov.pause.hidden = !paused || helpOpen || cheatOpen;
        if (cheatOpen && !online && !paused) {
            const canAct = playing && (!match || mine);
            $('[data-cheat="hint"]').disabled = !canAct;
            $('[data-cheat="safe"]').disabled = !canAct;
            $('[data-el="xraybtn"]').textContent = state.xray ? "ON" : "OFF";
            const undoOk = state.moves.length > 0 && (
                play === "solo" ? playing
                    : (playing && state.turn === 0) || (state.phase === "stuck" && state.winner === 1)
            );
            $('[data-el="undobtn"]').disabled = !undoOk;
            $('[data-el="solvebtn"]').disabled = !(play === "solo" && playing);
        }
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        scheduleBot();
    }

    /* ---------- UI interactions ---------- */
    function selectPet(a) {
        if (!state || state.phase !== "playing" || frozen()) return;
        if (state.board.indexOf(a) >= 0) { showMsg(PETS[a].name + " is already placed", false); return; }
        selectedPet = selectedPet === a ? -1 : a;
        render();
    }

    function activateCell(i) {
        if (!state || state.phase !== "playing" || frozen()) return;
        cursor = i;
        if (state.board[i] >= 0) {
            if (state.play === "solo") submitAction({ type: "remove", cell: i });
            else showMsg("Placed pets are locked in a match", false);
            render();
            return;
        }
        if (state.play !== "solo" && !yourTurn()) { showMsg("Wait for your turn", false); render(); return; }
        if (selectedPet < 0) { showMsg("Pick a pet from the tray first", false); render(); return; }
        const cand = boardCells(state.board);
        cand.push({ r: (i / 6) | 0, c: i % 6, a: selectedPet });
        const v = validatePlacement(cand);
        if (!v.ok) { flash(i); showMsg(v.reason, true); render(); return; }
        submitAction({ type: "place", cell: i, pet: selectedPet });
        render();
    }

    function moveCursor(dr, dc) {
        if (frozen()) return;
        const r = ((cursor / 6) | 0), c = cursor % 6;
        cursor = ((r + dr + 6) % 6) * 6 + ((c + dc + 6) % 6);
        render();
    }

    function handleCheat(kind) {
        if (!state || online || !state.play) return;
        const match = state.play === "bot";
        if (kind === "xray") { submitAction({ type: "xray" }); return; }
        if (kind === "undo") { submitAction({ type: "undo" }); return; }
        if (kind === "solve") {
            if (state.play !== "solo") { showMsg("Auto-solve is solo only", false); return; }
            cheatOpen = false;
            submitAction({ type: "solve" });
            return;
        }
        if (state.phase !== "playing" || (match && !yourTurn())) { showMsg("Wait for your turn", false); return; }
        const ms = safeMoves(state.board);
        const m = pickMove(ms);
        if (!m) { showMsg("No safe move exists — undo or restart", true); return; }
        if (kind === "hint") {
            selectedPet = m.pet; cursor = m.cell;
            submitAction({ type: "hint", cell: m.cell, pet: m.pet });
            showMsg("Hint: " + PETS[m.pet].name + " at " + coordName(m.cell), false);
        } else if (kind === "safe") {
            submitAction({ type: "safe" });
        }
    }

    function startGame(play) {
        state = makeState(play, 1, [0, 0], [0, 1], "playing");
        selectedPet = -1; cursor = 14;
        helpOpen = false; cheatOpen = false;
        setPaused(false);
        publish();
    }

    function handleClick(event) {
        const t = event.target.closest("[data-exit],[data-act],[data-cheat],[data-pet],[data-cell],[data-help],[data-help-close],[data-cheats],[data-close],[data-pause],[data-resume],[data-restart],[data-pad]");
        if (!t || !root.contains(t)) return;
        if (t.hasAttribute("data-exit")) { onExit(); return; }
        if (t.hasAttribute("data-help")) { toggleHelp(); return; }
        if (t.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (t.hasAttribute("data-cheats")) { toggleCheats(); return; }
        if (t.hasAttribute("data-close")) { toggleCheats(false); return; }
        if (t.hasAttribute("data-pause")) { togglePause(); return; }
        if (t.hasAttribute("data-resume")) { setPaused(false); render(); return; }
        if (t.hasAttribute("data-restart")) {
            helpOpen = false; cheatOpen = false; setPaused(false);
            submitAction({ type: "restart" }); render(); return;
        }
        if (t.hasAttribute("data-pad")) {
            const on = appEl.classList.toggle("pd-show-pad");
            padBtn.setAttribute("aria-pressed", on ? "true" : "false");
            return;
        }
        if (t.dataset.cheat) {
            if (!frozen()) return;
            handleCheat(t.dataset.cheat); return;
        }
        if (frozen()) return;
        if (t.dataset.pet !== undefined) { selectPet(Number(t.dataset.pet)); return; }
        if (t.dataset.cell !== undefined) { activateCell(Number(t.dataset.cell)); return; }
        const act = t.dataset.act;
        if (act === "solo") startGame("solo");
        else if (act === "bot") startGame("bot");
        else if (act === "begin") submitAction({ type: "begin" });
        else if (act === "next") submitAction({ type: "next" });
        else if (act === "reset") { cheatOpen = false; submitAction({ type: "reset" }); }
        else if (act === "up") moveCursor(-1, 0);
        else if (act === "down") moveCursor(1, 0);
        else if (act === "left") moveCursor(0, -1);
        else if (act === "right") moveCursor(0, 1);
        else if (act === "place") activateCell(cursor);
        else if (act === "erase") {
            if (state && state.play === "solo" && state.phase === "playing") {
                if (state.board[cursor] >= 0) submitAction({ type: "remove", cell: cursor });
                else showMsg("Nothing to remove here", false);
            }
        }
    }

    function handleContext(event) {
        const t = event.target.closest("[data-cell]");
        if (!t || !state || state.play !== "solo" || state.phase !== "playing" || frozen()) return;
        const i = Number(t.dataset.cell);
        if (state.board[i] >= 0) {
            event.preventDefault();
            submitAction({ type: "remove", cell: i });
        }
    }

    function handleHover(event) {
        if (event.pointerType === "touch") return;
        const t = event.target.closest("[data-cell]");
        if (!t || !state || state.phase !== "playing" || frozen()) return;
        const i = Number(t.dataset.cell);
        if (i !== cursor) { cursor = i; render(); }
    }

    function handleKey(event) {
        if (destroyed || !root.isConnected) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const k = event.key;
        const lower = k.length === 1 ? k.toLowerCase() : k;
        const hit = (code, letter) => event.code === code || lower === letter;
        /* priority: help -> cheats -> pause/escape -> restart -> game actions */
        if (hit("KeyH", "h") || k === "?") { event.preventDefault(); toggleHelp(); return; }
        if (hit("KeyC", "c")) {
            if (!helpOpen && !paused && !online && state && state.play) toggleCheats();
            event.preventDefault(); return;
        }
        if (hit("KeyP", "p") || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheats(false);
            else if (paused) { setPaused(false); render(); }
            else if (k !== "Escape") togglePause(true);
            else selectedPet = -1;
            event.preventDefault(); return;
        }
        if (hit("KeyR", "r") && state && state.play && state.phase !== "ready") {
            helpOpen = false; cheatOpen = false; setPaused(false);
            submitAction({ type: "restart" }); event.preventDefault(); return;
        }
        if (k === "Enter" || k === " ") {
            if (helpOpen) { toggleHelp(false); event.preventDefault(); return; }
            if (cheatOpen) { toggleCheats(false); event.preventDefault(); return; }
            if (paused) { setPaused(false); render(); event.preventDefault(); return; }
        }
        if (!state || frozen()) return;
        if ((state.phase === "won" || state.phase === "stuck") && (k === "Enter" || k === " ")) { event.preventDefault(); submitAction({ type: "next" }); return; }
        if (state.phase !== "playing") return;
        if (k >= "1" && k <= "6") { event.preventDefault(); selectPet(Number(k) - 1); return; }
        if (k === "ArrowUp" || k === "w" || k === "W") { event.preventDefault(); moveCursor(-1, 0); return; }
        if (k === "ArrowDown" || k === "s" || k === "S") { event.preventDefault(); moveCursor(1, 0); return; }
        if (k === "ArrowLeft" || k === "a" || k === "A") { event.preventDefault(); moveCursor(0, -1); return; }
        if (k === "ArrowRight" || k === "d" || k === "D") { event.preventDefault(); moveCursor(0, 1); return; }
        if (k === "Enter" || k === " ") { event.preventDefault(); activateCell(cursor); return; }
        if (k === "Backspace" || k === "Delete") {
            event.preventDefault();
            if (state.play === "solo") {
                if (state.board[cursor] >= 0) submitAction({ type: "remove", cell: cursor });
                else if (state.moves.length) {
                    const last = state.moves[state.moves.length - 1];
                    submitAction({ type: "remove", cell: last.cell });
                }
            }
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("contextmenu", handleContext);
    root.addEventListener("pointerover", handleHover);
    document.addEventListener("keydown", handleKey);

    const clockId = setInterval(() => {
        if (!destroyed && !paused && state && state.phase === "playing") updateClock();
    }, 500);

    /* ---------- boot: online (host/guest) vs local ---------- */
    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (room.isHost) {
            /* Random seat assignment + random first move for the match. */
            state = makeState("online", 1, [0, 0], shuffle([0, 1]), "ready");
            publish();
            room.onAction((action) => applyAction(action, 1));
        } else {
            room.onState((nextState) => { state = nextState; render(); });
        }
    } else {
        state = makeState(null, 1, [0, 0], [0, 1], "menu");
        render();
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            root.removeEventListener("contextmenu", handleContext);
            root.removeEventListener("pointerover", handleHover);
            document.removeEventListener("keydown", handleKey);
            clearInterval(clockId);
            if (botTimer !== null) clearTimeout(botTimer);
            if (msgTimer !== null) clearTimeout(msgTimer);
            flashTimers.forEach(clearTimeout);
            flashTimers = [];
        },
    };
}