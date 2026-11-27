import { iconSVG } from "../JS/icons.js";

/* ==== GAME: tetris.js ==== */
/* ============================================================= */
/* TETRIS — template mount()/META (host-authoritative online).    */
/* Mode: Solo (level acak & dijamin bisa diselesaikan), Vs Bot,   */
/* Online (room). Fitur: UI minimalis, tutorial, cheat overlay,   */
/* tombol virtual mobile, keyboard+mouse desktop, animasi jatuh   */
/* & line-clear, giliran pertama acak (vs bot), posisi pemain     */
/* acak (multiplayer), area papan lebih besar.                    */
/* ============================================================= */

const NS = "http://www.w3.org/2000/svg";
const COLS = 10, ROWS = 20, CELL = 26;
const LINE_PTS = [0, 100, 300, 500, 800];
const BATTLE_TARGET = 12;      // target line mode battle
const HEADSTART_MS = 1200;     // head-start pemain yang jalan duluan
const CLEAR_MS = 230;          // durasi animasi line clear
const DROP_MS = 95;            // durasi animasi hard drop
const BEST_KEY = "tetrisBest";

export const META = {
    id: "tetris", // harus sama dengan nama file (tanpa .js)
    name: "Tetris",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Susun balok jatuh dan bersihkan baris. Solo dengan level acak yang dijamin bisa diselesaikan, tantang bot, atau duel online. Ada tutorial, cheat, dan kontrol sentuh.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="6" width="11" height="11" rx="2.5"/><rect x="8" y="19.5" width="11" height="11" rx="2.5"/><rect x="8" y="33" width="11" height="11" rx="2.5"/><rect x="21.5" y="33" width="11" height="11" rx="2.5"/><rect x="30" y="6" width="11" height="11" rx="2.5"/></svg>',
    bg: ["#bfdbfe", "#93c5fd"],
    bestKey: BEST_KEY,
};

/* ---------- definisi balok (palet kalem / minimalis) ---------- */
const PIECES = {
    I: { color: "#7dd3fc", m: [[1, 1, 1, 1]] },
    O: { color: "#fde68a", m: [[1, 1], [1, 1]] },
    T: { color: "#c4b5fd", m: [[0, 1, 0], [1, 1, 1]] },
    S: { color: "#86efac", m: [[0, 1, 1], [1, 1, 0]] },
    Z: { color: "#fca5a5", m: [[1, 1, 0], [0, 1, 1]] },
    J: { color: "#93c5fd", m: [[1, 0, 0], [1, 1, 1]] },
    L: { color: "#fdba74", m: [[0, 0, 1], [1, 1, 1]] },
};
const TYPES = Object.keys(PIECES);
const GARBAGE_COLOR = "#55607a";
const colorOf = (t) => (t === "G" ? GARBAGE_COLOR : PIECES[t].color);

/* ---------- util murni ---------- */
const emptyRow = () => new Array(COLS).fill(null);
const emptyBoard = () => Array.from({ length: ROWS }, emptyRow);

function rotateCW(m) {
    const rows = m.length, cols = m[0].length, out = [];
    for (let x = 0; x < cols; x++) { out.push([]); for (let y = 0; y < rows; y++) out[x][y] = m[rows - 1 - y][x]; }
    return out;
}
function rotateCCW(m) {
    const rows = m.length, cols = m[0].length, out = [];
    for (let x = 0; x < cols; x++) { out.push([]); for (let y = 0; y < rows; y++) out[x][y] = m[y][cols - 1 - x]; }
    return out;
}
function collide(board, m, px, py) {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const bx = px + x, by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
    }
    return false;
}
function eachCell(m, px, py, fn) {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) if (m[y][x]) fn(px + x, py + y);
}
function boundsOf(m) {
    let a = 9, b = -1, c = 9, d = -1;
    m.forEach((row, y) => row.forEach((v, x) => { if (v) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); } }));
    return { minX: a, maxX: b, minY: c, maxY: d };
}
function dropY(board, piece) { let y = piece.y; while (!collide(board, piece.m, piece.x, y + 1)) y++; return y; }

/* RNG deterministik per pemain (mulberry32, state tersimpan di p.rng)
   → di battle kedua pemain memakai seed sama = urutan balok identik (adil). */
function rngNext(p) {
    p.rng = (p.rng + 0x6D2B79F5) | 0;
    let t = p.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function drawBag(p) {
    if (!p.bag.length) {
        p.bag = p.easy ? ["I", "I", "O", "O", "T", "L", "J"] : TYPES.slice(); // cheat: balok mudah
        for (let i = p.bag.length - 1; i > 0; i--) {
            const j = Math.floor(rngNext(p) * (i + 1));
            [p.bag[i], p.bag[j]] = [p.bag[j], p.bag[i]];
        }
    }
    return p.bag.pop();
}
function fillQueue(p) { while (p.queue.length < 3) p.queue.push(drawBag(p)); }
const goalFor = (level) => Math.min(6 + 2 * (level - 1), 20);

/* ---------- bot: heuristic klasik (height/holes/bumpiness/clears) ---------- */
function simulate(board, m, x) {
    let y = -4;
    if (collide(board, m, x, y)) return null;
    while (!collide(board, m, x, y + 1)) y++;
    const b = board.map((r) => r.slice());
    let dead = false;
    eachCell(m, x, y, (bx, by) => { if (by < 0) dead = true; else b[by][bx] = { t: "X" }; });
    if (dead) return null;
    const full = [];
    for (let r = 0; r < ROWS; r++) if (b[r].every((c) => c)) full.push(r);
    const nb = b.filter((_, r) => !full.includes(r));
    while (nb.length < ROWS) nb.unshift(emptyRow());
    const h = new Array(COLS).fill(0);
    let holes = 0;
    for (let cx = 0; cx < COLS; cx++) {
        let seen = false;
        for (let r = 0; r < ROWS; r++) {
            if (nb[r][cx]) { if (!seen) h[cx] = ROWS - r; seen = true; }
            else if (seen) holes++;
        }
    }
    const agg = h.reduce((s, v) => s + v, 0);
    let bump = 0;
    for (let cx = 0; cx < COLS - 1; cx++) bump += Math.abs(h[cx] - h[cx + 1]);
    const score = 0.76 * full.length - 0.51 * agg - 0.9 * holes - 0.18 * bump + (Math.random() - 0.5) * 0.25;
    return { score };
}
function botPlan(p) {
    let best = null, m = p.piece.m;
    const seen = new Set();
    for (let r = 0; r < 4; r++) {
        const sig = m.map((row) => row.join("")).join("|");
        if (!seen.has(sig)) {
            seen.add(sig);
            for (let x = -3; x < COLS; x++) {
                const res = simulate(p.board, m, x);
                if (res && (!best || res.score > best.score)) best = { rot: r, x, score: res.score };
            }
        }
        m = rotateCW(m);
    }
    if (!best) best = { rot: 0, x: p.piece.x };
    return { pieceId: p.piece.id, rot: best.rot, x: best.x };
}

/* ============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = online ? Boolean(room.isHost) : true;
    const myActor = online && !room.isHost ? 1 : 0;
    const authority = () => !online || isHost;
    let roomData = room?.room || null;
    let state = null;

    /* ---------- UI state (lokal, tidak diserialisasi) ---------- */
    const ui = { cheatsOpen: false, cheat: { slow: false, freeze: false, easy: false, guard: false } };
    let helpOpen = false;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("tetrisHelpSeen") === "1"; } catch (_) { }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("tetrisHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    const anyCheatOn = () => Object.values(ui.cheat).some(Boolean);
    let best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { }

    /* ---------- timers terlacak (dibekukan saat pause, dibersihkan saat destroy) ---------- */
    const T = { grav: [null, null], bot: null, misc: new Set(), hello: null, pub: null, toast: null, repeats: new Map() };
    const offs = [];
    const nowMs = () => Date.now();
    let pausedAt = 0, toastLeft = 0, toastAt = 0;
    function after(ms, fn) {
        const rec = { fn, left: ms, at: 0, id: null };
        rec.arm = () => {
            rec.at = nowMs();
            rec.id = setTimeout(() => { T.misc.delete(rec); rec.id = null; fn(); }, Math.max(0, rec.left));
        };
        rec.arm();
        T.misc.add(rec);
        return rec;
    }
    function freezeTimers() {
        const t = nowMs();
        for (const rec of T.misc) {
            if (rec.id == null) continue;
            rec.left = Math.max(0, rec.left - (t - rec.at));
            clearTimeout(rec.id); rec.id = null;
        }
        if (T.pub) { clearTimeout(T.pub); T.pub = null; }
        if (T.toast) { toastLeft = Math.max(0, toastLeft - (t - toastAt)); clearTimeout(T.toast); T.toast = null; }
    }
    function thawTimers() {
        for (const rec of T.misc) if (rec.id == null) rec.arm();
        if (!T.toast && toastLeft > 0) armToast();
    }
    function shiftAnchors(delta) {
        if (typeof publish._last === "number") publish._last += delta;
        views.forEach((v) => { if (v.lastWheel) v.lastWheel += delta; });
    }
    function resetPauseState() {
        if (!pausedAt) return;
        pausedAt = 0;
        for (const rec of [...T.misc]) if (rec.id == null) T.misc.delete(rec);
        if (!T.toast && toastLeft > 0) { toastLeft = 0; toastEl.classList.remove("show"); }
    }
    function stopGrav(i) { clearTimeout(T.grav[i]); T.grav[i] = null; }
    function stopBot() { clearInterval(T.bot); T.bot = null; }
    function stopAll() { stopGrav(0); stopGrav(1); stopBot(); }

    /* ============================================================= */
    /* HTML + CSS (minimalis: netral gelap, 1 aksen, border tipis)    */
    /* ============================================================= */
    root.innerHTML = `
<style>
.tx-app{color:#e8ebf1;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;user-select:none;-webkit-tap-highlight-color:transparent;display:flex;flex-direction:column;gap:10px;min-height:100%}
.tx-app *{box-sizing:border-box}
.tx-app [hidden]{display:none!important}
.tx-app button{font:inherit;color:inherit}
.tx-panel{position:relative;background:#10131a;border:1px solid #ffffff12;border-radius:16px;padding:14px;max-width:960px;margin:0 auto;width:100%}
.tx-app.game-fill>.tx-board{flex:1 1 auto;min-height:0;aspect-ratio:auto;display:flex;flex-direction:column}

/* HUD bar — semua info + kontrol di satu baris di atas papan */
.tx-hud{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-height:38px}
.tx-chip{font-size:11px;font-weight:600;letter-spacing:.05em;color:#9aa3b5;border:1px solid #ffffff14;border-radius:999px;padding:5px 10px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.tx-chip b{color:#e8ebf1;font-variant-numeric:tabular-nums}
.tx-chip.warn{color:#fca5a5;border-color:#fca5a544}
.tx-dot{width:6px;height:6px;border-radius:50%;background:#86efac;display:inline-block;flex:none}
.tx-spacer{flex:1 1 auto}
.tx-btn{background:transparent;border:1px solid #ffffff1c;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}
.tx-btn:hover{background:#ffffff0d;border-color:#ffffff30}
.tx-btn:disabled{opacity:.4;cursor:not-allowed}
.tx-btn.pri{background:#8ab4ff;border-color:#8ab4ff;color:#0b1220}
.tx-btn.pri:hover{background:#a5c6ff}
.tx-btn.sm{padding:5px 10px;font-size:11.5px}
.tx-icon-btn{display:inline-flex;align-items:center;gap:6px}
.tx-icon-btn svg{flex:none;display:block}
.tx-btn.on{border-color:#8ab4ff;color:#8ab4ff;background:#8ab4ff14}

/* Arena — board SVG langsung di dalam panel, rasio 1:2 dipertahankan */
.tx-arena{display:flex;gap:14px;align-items:center;justify-content:center;width:100%;height:100%;min-height:0}
.tx-col{display:flex;flex-direction:column;gap:6px;min-width:0;justify-content:center;max-height:100%}
.tx-arena.solo .tx-col{width:var(--tx-colw,min(30vh,310px,calc(94vw - 160px)))}
.tx-arena.battle .tx-col{width:var(--tx-colw,min(26vh,250px,calc(47vw - 14px)))}
.tx-colhead{display:flex;justify-content:space-between;align-items:center;min-height:20px}
.tx-pname{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9aa3b5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tx-pname.me{color:#8ab4ff}
.tx-gbadge{font-size:10.5px;font-weight:700;color:#fca5a5;border:1px solid #fca5a544;border-radius:999px;padding:1px 7px}
.tx-nextrow{display:flex;gap:5px;align-items:center;min-height:30px}
.tx-nextlabel{font-size:9.5px;font-weight:700;letter-spacing:.08em;color:#6b7385;text-transform:uppercase;margin-right:2px}
.tx-mini{width:44px;height:28px;background:#0c0f16;border:1px solid #ffffff10;border-radius:7px;display:block}
.tx-bwrap{position:relative;background:#0b0e15;border:1px solid #ffffff14;border-radius:12px;padding:4px;width:100%;aspect-ratio:1/2;max-height:100%;margin:0 auto}
.tx-board{width:100%;height:100%;display:block;border-radius:8px}
.tx-aim{fill:#ffffff;opacity:.045;pointer-events:none}
.tx-cell{transition:transform .2s cubic-bezier(.3,.7,.3,1)}
.tx-cell rect,.tx-pieceg rect{transform-box:fill-box;transform-origin:center}
.tx-cell.is-new rect{animation:txPop .18s ease-out}
.tx-cell.is-clearing rect{animation:txClear ${CLEAR_MS}ms ease-in forwards}
.tx-pieceg{transition:transform .08s linear}
.tx-dead{position:absolute;inset:0;display:grid;place-items:center;background:#0b0e15cc;border-radius:12px;font-size:12px;font-weight:800;letter-spacing:.15em;color:#fca5a5}
.tx-colstats{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:#9aa3b5;font-weight:600}
.tx-colstats b{color:#e8ebf1;font-variant-numeric:tabular-nums}
.tx-pad{display:flex;gap:8px;justify-content:center;margin-top:2px;touch-action:none;flex:none}
.tx-padbtn{width:52px;height:44px;display:grid;place-items:center;background:#ffffff08;border:1px solid #ffffff16;border-radius:11px;cursor:pointer;touch-action:none}
.tx-padbtn:active{background:#8ab4ff2b;border-color:#8ab4ff66}
.tx-padbtn svg{width:20px;height:20px}
.tx-hint{text-align:center;font-size:10.5px;color:#6b7385;margin-top:4px;flex:none}

/* Overlays — card flex column: head/foot fix, isi bisa scroll */
.tx-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:#0a0d13c9;backdrop-filter:blur(5px);border-radius:12px;padding:14px}
.tx-ov.top{z-index:7}
.tx-card{background:#141824;border:1px solid #ffffff16;border-radius:14px;padding:22px;max-width:440px;width:100%;text-align:center;max-height:100%;overflow:hidden;display:flex;flex-direction:column}
.tx-card.wide{max-width:560px;text-align:left}
.tx-ovtitle{margin:0 0 6px;font-size:20px;font-weight:800;letter-spacing:-.01em;flex:none}
.tx-ovtitle.win{color:#86efac}.tx-ovtitle.lose{color:#fca5a5}
.tx-ovsub{margin:0 0 14px;font-size:12.5px;color:#9aa3b5;line-height:1.55;flex:none}
.tx-stats{font-size:13px;font-weight:700;color:#e8ebf1;margin:0 0 14px;font-variant-numeric:tabular-nums;flex:none}
.tx-cardbtns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;flex:none}
.tx-help,.tx-cheatbody{flex:1 1 auto;min-height:0;overflow:auto}
.tx-modecards{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:14px 0;min-height:0;overflow:auto}
.tx-modecard{flex:1;min-width:150px;max-width:200px;background:#ffffff06;border:1px solid #ffffff16;border-radius:12px;padding:14px;cursor:pointer;text-align:center;transition:border-color .15s,background .15s}
.tx-modecard:hover{border-color:#8ab4ff88;background:#8ab4ff12}
.tx-modecard b{display:block;font-size:14px;margin-bottom:4px}
.tx-modecard span{font-size:11px;color:#9aa3b5;line-height:1.4;display:block}
.tx-count{font-size:64px;font-weight:800;line-height:1;color:#8ab4ff;font-variant-numeric:tabular-nums}
.tx-countsub{font-size:12.5px;color:#9aa3b5;margin-top:10px;line-height:1.6}
.tx-help h4{margin:14px 0 5px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8ab4ff}
.tx-help ul{margin:0;padding-left:18px;font-size:12.5px;color:#c3cad6;line-height:1.7}
.tx-kbd{display:inline-block;border:1px solid #ffffff2a;border-bottom-width:2px;border-radius:5px;padding:0 6px;font-size:11px;font-weight:700;background:#ffffff0a;color:#e8ebf1}
.tx-cheatrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #ffffff0d;font-size:12.5px}
.tx-cheatrow small{display:block;color:#6b7385;font-size:10.5px}
.tx-switch{position:relative;width:36px;height:20px;flex:none;appearance:none;background:#ffffff14;border-radius:99px;cursor:pointer;transition:background .15s;border:none}
.tx-switch:checked{background:#8ab4ff}
.tx-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:99px;background:#e8ebf1;transition:left .15s}
.tx-switch:checked::after{left:18px}
.tx-cheatacts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.tx-cheatnote{font-size:10.5px;color:#fca5a5;margin:12px 0 0}
.tx-toast{position:absolute;left:50%;bottom:10px;transform:translateX(-50%) translateY(6px);z-index:8;background:#141824ee;border:1px solid #ffffff1e;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:600;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.tx-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.tx-spin{display:inline-block;width:14px;height:14px;border:2px solid #8ab4ff44;border-top-color:#8ab4ff;border-radius:99px;animation:txSpin .8s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes txPop{0%{transform:scale(1.22);filter:brightness(1.6)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes txClear{0%{filter:brightness(2.4);opacity:1}55%{filter:brightness(2.4);opacity:1}100%{transform:scale(.15);opacity:0}}
@keyframes txSpin{to{transform:rotate(360deg)}}

/* --- Batch 02 design polish --- */
.tx-app :focus-visible,.tx-app button:focus-visible{outline:2px solid #8ab4ff;outline-offset:2px}
.tx-chip{padding:6px 12px}
.tx-btn{min-height:44px;padding:10px 16px}
.tx-padbtn{min-height:44px;min-width:44px}
.tx-modecard{min-height:44px}
@media (pointer:coarse){.tx-app button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.tx-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}

/* --- Layout overrides (paling akhir, spesifisitas lebih tinggi dari pointer:coarse) --- */
.tx-app .tx-hud .tx-btn{min-height:34px;padding:6px 10px;font-size:10.5px}
.tx-app .tx-hud .tx-chip{padding:5px 9px}
@media (max-width:640px){
  .tx-app.game-fill>.tx-board:has(.tx-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .tx-app .tx-hud{gap:5px;margin-bottom:6px}
  .tx-app .tx-hud .tx-chip{padding:4px 6px;font-size:9px}
  .tx-app .tx-hud .tx-chip[data-hud="status"],
  .tx-app .tx-hud .tx-chip[data-hud="goal"],
  .tx-app .tx-hud .tx-chip[data-hud="first"],
  .tx-app .tx-hud .tx-chip[data-hud="best"]{display:none}
  .tx-app .tx-hud .tx-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .tx-app .tx-hud .tx-btn-label,
  .tx-app .tx-hud .tx-spacer{display:none}
  .tx-ov{padding:8px}
  .tx-card{width:100%;height:100%;max-height:100%;padding:14px;border-radius:12px}
  .tx-help,.tx-cheatbody,.tx-modecards{scrollbar-width:none}
  .tx-help::-webkit-scrollbar,.tx-cheatbody::-webkit-scrollbar,.tx-modecards::-webkit-scrollbar{display:none}
  .tx-pad{margin-top:6px;gap:5px}
  .tx-padbtn{width:46px;height:44px}
  .tx-hint{display:none}
}
</style>
<div class="game-app tx-app game-fill">
  <div class="tx-hud">
    <span class="tx-chip" data-hud="status"><i class="tx-dot"></i><b data-hud-status>Siap</b></span>
    <span class="tx-chip" data-hud="mode">Pilih mode</span>
    <span class="tx-chip" data-hud="lv">LV <b data-hud-lv>1</b></span>
    <span class="tx-chip">SCORE <b data-hud-score>0</b></span>
    <span class="tx-chip">LINE <b data-hud-lines>0</b></span>
    <span class="tx-chip" data-hud="goal"></span>
    <span class="tx-chip" data-hud="first" hidden>FIRST —</span>
    <span class="tx-chip">BEST <b data-hud-best>0</b></span>
    <span class="tx-chip warn" data-hud="cheat" hidden>CHEAT AKTIF</span>
    <span class="tx-spacer"></span>
    <button class="tx-btn tx-icon-btn" type="button" data-help aria-label="Help" title="How to play (H)">
      ${iconSVG("helpCircle", { size: 14 })}<span class="tx-btn-label">Help</span>
    </button>
    <button class="tx-btn tx-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">
      ${iconSVG("wrench", { size: 14 })}<span class="tx-btn-label">Cheats</span>
    </button>
    <button class="tx-btn tx-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">
      ${iconSVG("pause", { size: 14 })}<span class="tx-btn-label">Pause</span>
    </button>
    <button class="tx-btn tx-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">
      ${iconSVG("refresh", { size: 14 })}<span class="tx-btn-label">Restart</span>
    </button>
    <button class="tx-btn tx-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">
      ${iconSVG("logOut", { size: 14 })}<span class="tx-btn-label">Exit game</span>
    </button>
  </div>

  <section class="game-panel tx-panel tx-board" data-board>
    <div class="tx-arena solo" data-arena>
      ${boardColHTML(0)}
      ${boardColHTML(1)}
    </div>

    <div class="tx-ov" data-ov="intro">
      <div class="tx-card">
        <h3 class="tx-ovtitle">Tetris</h3>
        <p class="tx-ovsub">Pilih mode permainan. Skor terbaik: <b data-intro-best>0</b></p>
        <div class="tx-modecards">
          <button class="tx-modecard" type="button" data-act="solo"><b>Solo · Level</b><span>Level acak yang pasti bisa diselesaikan. Kejar target line &amp; skor terbaik.</span></button>
          <button class="tx-modecard" type="button" data-act="bot"><b>Vs Bot</b><span>Balapan ${BATTLE_TARGET} line melawan bot. Siapa yang mulai duluan diacak 🎲.</span></button>
        </div>
        <div class="tx-cardbtns"><button class="tx-btn" type="button" data-help>Cara bermain</button></div>
      </div>
    </div>

    <div class="tx-ov" data-ov="lobby" hidden>
      <div class="tx-card">
        <h3 class="tx-ovtitle">Multiplayer</h3>
        <p class="tx-ovsub"><span class="tx-spin"></span><span data-lobby-text>Menunggu lawan…</span></p>
        <p class="tx-ovsub">Posisi pemain (P1 kiri / P2 kanan) akan diacak saat pertandingan dimulai.</p>
      </div>
    </div>

    <div class="tx-ov" data-ov="count" hidden>
      <div class="tx-card">
        <div class="tx-count" data-count>3</div>
        <div class="tx-countsub" data-count-sub></div>
      </div>
    </div>

    <div class="tx-ov" data-ov="pause" hidden>
      <div class="tx-card">
        <h3 class="tx-ovtitle">Jeda</h3>
        <p class="tx-ovsub">Tekan <span class="tx-kbd">P</span> atau tombol di bawah untuk lanjut.</p>
        <div class="tx-cardbtns"><button class="tx-btn pri" type="button" data-pause>Lanjutkan</button></div>
      </div>
    </div>

    <div class="tx-ov" data-ov="levelup" hidden><div class="tx-card" data-levelup-card></div></div>
    <div class="tx-ov" data-ov="over" hidden><div class="tx-card" data-over-card></div></div>

    <div class="tx-ov top" data-ov="help" hidden>
      <div class="tx-card wide">
        <h3 class="tx-ovtitle">Cara bermain</h3>
        <div class="tx-help">
          <h4>Tujuan</h4>
          <ul>
            <li><b>Solo:</b> capai target line tiap level. Level dibangkitkan acak (terrain + kecepatan), tapi <b>dijamin bisa diselesaikan</b> — terrain hanya punya sumur terbuka, tanpa lubang tertutup.</li>
            <li><b>Vs Bot / Online:</b> balapan ${BATTLE_TARGET} line. Lawan tumbang (top-out) = kamu menang. Clear 2+ baris sekaligus mengirim <b>garbage</b> ke lawan.</li>
            <li>Urutan balok kedua pemain identik (seed sama); yang jalan duluan &amp; posisi P1/P2 diacak adil.</li>
          </ul>
          <h4>Keyboard</h4>
          <ul>
            <li><span class="tx-kbd">←</span> <span class="tx-kbd">→</span> geser · <span class="tx-kbd">↓</span> soft drop (+1/sel)</li>
            <li><span class="tx-kbd">↑</span> / <span class="tx-kbd">X</span> putar searah jarum jam · <span class="tx-kbd">Z</span> putar balik</li>
            <li><span class="tx-kbd">Space</span> hard drop (+2/sel) · <span class="tx-kbd">P</span> jeda · <span class="tx-kbd">R</span> ulang</li>
            <li><span class="tx-kbd">H</span> bantuan · <span class="tx-kbd">C</span> cheat · <span class="tx-kbd">Esc</span> tutup panel</li>
          </ul>
          <h4>Mouse (desktop)</h4>
          <ul>
            <li>Arahkan kursor → kolom sasaran ditandai.</li>
            <li><b>Klik</b> = geser balok ke kolom itu · <b>klik ganda</b> / <span class="tx-kbd">Shift</span>+klik = hard drop.</li>
            <li><b>Klik kanan</b> atau <b>scroll</b> = putar balok.</li>
          </ul>
          <h4>Sentuh (mobile)</h4>
          <ul><li>Gunakan tombol virtual di bawah papan. Tahan ◀ ▶ ▼ untuk gerakan berulang.</li></ul>
          <h4>Skor</h4>
          <ul><li>Clear 1/2/3/4 baris = 100/300/500/800 × level. Kecepatan naik seiring progres.</li></ul>
          <h4>Catatan</h4>
          <ul><li>Cheat menandai permainan (skor tidak dicatat sebagai terbaik) dan dinonaktifkan saat online. Input online diproses host, sedikit delay itu wajar.</li></ul>
        </div>
        <div class="tx-cardbtns" style="margin-top:12px"><button class="tx-btn pri" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>

    <div class="tx-ov top" data-ov="cheats" hidden>
      <div class="tx-card wide">
        <h3 class="tx-ovtitle">Cheat</h3>
        <div class="tx-cheatbody">
          <p class="tx-ovsub">Untuk santai / latihan. Tidak tersedia saat online.</p>
          <label class="tx-cheatrow"><span>Gravitasi lambat ×2.5<small>Balok jatuh lebih pelan.</small></span><input class="tx-switch" type="checkbox" data-cheat-toggle="slow"></label>
          <label class="tx-cheatrow"><span>Bekukan gravitasi<small>Balok tidak jatuh sendiri; kamu yang mengatur drop.</small></span><input class="tx-switch" type="checkbox" data-cheat-toggle="freeze"></label>
          <label class="tx-cheatrow"><span>Balok mudah<small>Tas didominasi I &amp; O.</small></span><input class="tx-switch" type="checkbox" data-cheat-toggle="easy"></label>
          <label class="tx-cheatrow"><span>Kesempatan kedua<small>Saat top-out, 8 baris terbawah otomatis dibersihkan (1× per level, mode solo).</small></span><input class="tx-switch" type="checkbox" data-cheat-toggle="guard"></label>
          <div class="tx-cheatacts">
            <button class="tx-btn sm" type="button" data-cheat="clearRow">Hapus baris terbawah</button>
            <button class="tx-btn sm" type="button" data-cheat="skipLevel" data-cheat-solo>Lewati level</button>
            <button class="tx-btn sm" type="button" data-cheat="garbage" data-cheat-battle>Kirim 2 garbage ke lawan</button>
          </div>
          <p class="tx-cheatnote">⚠ Memakai cheat menandai run ini — skor tidak disimpan sebagai terbaik.</p>
        </div>
        <div class="tx-cardbtns" style="margin-top:12px"><button class="tx-btn pri" type="button" data-cheats-close>Tutup</button></div>
      </div>
    </div>

    <div class="tx-toast" role="status" data-toast></div>
  </section>

  <div class="tx-pad" data-pad>
    <button class="tx-padbtn" type="button" data-mv="left" aria-label="Geser kiri" title="Geser kiri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
    <button class="tx-padbtn" type="button" data-mv="rotate" aria-label="Putar" title="Putar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
    <button class="tx-padbtn" type="button" data-mv="right" aria-label="Geser kanan" title="Geser kanan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
    <button class="tx-padbtn" type="button" data-mv="down" aria-label="Soft drop" title="Soft drop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
    <button class="tx-padbtn" type="button" data-mv="drop" aria-label="Hard drop" title="Hard drop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5l6 6 6-6"/><path d="M6 12l6 6 6-6"/></svg></button>
  </div>
  <div class="tx-hint">← → geser · ↓ soft drop · ↑/X putar · Z putar balik · Space hard drop · klik papan = geser ke kolom · klik kanan/scroll = putar</div>
</div>`;

    function boardColHTML(slot) {
        return `
    <div class="tx-col" data-col="${slot}">
      <div class="tx-colhead"><span class="tx-pname" data-pname>P${slot + 1}</span><span class="tx-gbadge" data-garbage hidden></span></div>
      <div class="tx-nextrow"><span class="tx-nextlabel">Next</span><span data-nextrow style="display:flex;gap:5px"></span></div>
      <div class="tx-bwrap">
        <svg class="tx-board" viewBox="0 0 ${COLS * CELL} ${ROWS * CELL}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Papan Tetris pemain ${slot + 1}">
          <g data-grid></g><g data-cells></g><g data-ghost></g><g data-piece class="tx-pieceg"></g>
          <rect data-aim class="tx-aim" x="0" y="0" width="${CELL}" height="${ROWS * CELL}" hidden></rect>
        </svg>
        <div class="tx-dead" data-dead hidden>TOP OUT</div>
      </div>
      <div class="tx-colstats"><span>Skor <b data-score>0</b></span><span>Line <b data-lines>0</b></span></div>
    </div>`;
    }

    /* ---------- refs & views ---------- */
    const $ = (s) => root.querySelector(s);
    const board = $("[data-board]");
    const arena = $("[data-arena]");
    const toastEl = $("[data-toast]");
    const hud = {
        status: $("[data-hud-status]"), mode: $('[data-hud="mode"]'), lv: $("[data-hud-lv]"),
        chipLv: $('[data-hud="lv"]'), score: $("[data-hud-score]"), lines: $("[data-hud-lines]"),
        goal: $('[data-hud="goal"]'), first: $('[data-hud="first"]'), best: $("[data-hud-best]"),
        cheat: $('[data-hud="cheat"]'),
    };
    const btnCheats = $(".tx-hud [data-cheats]");
    const btnPause = $(".tx-hud [data-pause]");
    const btnRestart = $(".tx-hud [data-restart]");
    const ov = {
        intro: $('[data-ov="intro"]'), lobby: $('[data-ov="lobby"]'), count: $('[data-ov="count"]'),
        pause: $('[data-ov="pause"]'), levelup: $('[data-ov="levelup"]'), over: $('[data-ov="over"]'),
        help: $('[data-ov="help"]'), cheats: $('[data-ov="cheats"]'),
    };
    function armToast() {
        if (!toastEl || toastLeft <= 0) return;
        toastAt = nowMs();
        T.toast = setTimeout(() => { T.toast = null; toastEl.classList.remove("show"); }, toastLeft);
    }

    const views = [0, 1].map((slot) => {
        const col = root.querySelector(`[data-col="${slot}"]`);
        const svg = col.querySelector(".tx-board");
        let g = "";
        for (let x = 1; x < COLS; x++) g += `<line x1="${x * CELL}" y1="0" x2="${x * CELL}" y2="${ROWS * CELL}" stroke="#ffffff08"/>`;
        for (let y = 1; y < ROWS; y++) g += `<line x1="0" y1="${y * CELL}" x2="${COLS * CELL}" y2="${y * CELL}" stroke="#ffffff08"/>`;
        svg.querySelector("[data-grid]").innerHTML = g;
        return {
            col, svg,
            cellsG: svg.querySelector("[data-cells]"), ghostG: svg.querySelector("[data-ghost]"),
            pieceG: svg.querySelector("[data-piece]"), aim: svg.querySelector("[data-aim]"),
            cellEls: new Map(), pieceSig: "", nextSig: "", lastWheel: 0,
            name: col.querySelector("[data-pname]"), gbadge: col.querySelector("[data-garbage]"),
            score: col.querySelector("[data-score]"), lines: col.querySelector("[data-lines]"),
            nextrow: col.querySelector("[data-nextrow]"), dead: col.querySelector("[data-dead]"),
        };
    });

    let ro = null;
    function fitBoards() {
        if (!board || !arena) return;
        const h = board.clientHeight - 30, w = board.clientWidth - 30;
        if (h <= 0 || w <= 0) return;
        const battle = Boolean(state && (state.mode === "bot" || state.mode === "online"));
        const vw = (typeof window !== "undefined" && window.innerWidth) || 800;
        const vh = (typeof window !== "undefined" && window.innerHeight) || 600;
        const capW = battle ? Math.min(250, vw * 0.46) : Math.min(310, vw * 0.88);
        const capH = vh * (battle ? 0.26 : 0.30);
        const maxByH = Math.max(90, (h - 78) / 2);
        const maxByW = battle ? Math.max(90, (w - 14) / 2) : w;
        arena.style.setProperty("--tx-colw", Math.round(Math.max(110, Math.min(capW, capH, maxByH, maxByW))) + "px");
    }

    const mySlot = () => (online && state ? state.actorSlot[myActor] : 0);

    /* ---------- state factory ---------- */
    function freshPlayer(name, bot) {
        return {
            name, bot: Boolean(bot), board: emptyBoard(), piece: null, bag: [], queue: [], rng: 1,
            score: 0, lines: 0, linesLevel: 0, pendingGarbage: 0, alive: true,
            clearing: null, clearNoScore: false, dropping: false, cheated: false, easy: false, guardUsed: false, plan: null,
        };
    }
    function baseState() {
        return {
            gid: 1, mode: null, phase: "intro", level: 1, goal: goalFor(1), target: BATTLE_TARGET,
            first: 0, actorSlot: [0, 1], count: 0, winner: null, reason: "", seq: 1, names: { 1: null },
            players: [freshPlayer(playerName, false), freshPlayer("Lawan", false)],
        };
    }

    /* ============================================================= */
    /* RENDER — sel papan direkonsiliasi per-id supaya CSS transition */
    /* menganimasikan balok yang turun saat baris di-clear.           */
    /* ============================================================= */
    function cellRectLocal(color) {
        return `<rect x="1" y="1" width="${CELL - 2}" height="${CELL - 2}" rx="5" fill="${color}" stroke="#0b102077" stroke-width="1.5"/>`;
    }
    function syncBoard(view, p, slot) {
        const clearSet = p.clearing ? new Set(p.clearing) : null;
        const seen = new Set();
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const c = p.board[y][x];
            if (!c) continue;
            seen.add(c.id);
            let el = view.cellEls.get(c.id);
            if (!el) {
                el = document.createElementNS(NS, "g");
                el.setAttribute("class", "tx-cell is-new");
                el.innerHTML = cellRectLocal(colorOf(c.t));
                view.cellEls.set(c.id, el);
                view.cellsG.appendChild(el);
            }
            el.style.transform = `translate(${x * CELL}px,${y * CELL}px)`;
            el.classList.toggle("is-clearing", Boolean(clearSet && clearSet.has(y)));
        }
        for (const [id, el] of view.cellEls) if (!seen.has(id)) { el.remove(); view.cellEls.delete(id); }

        if (p.piece) {
            const sig = p.piece.t + p.piece.m.map((r) => r.join("")).join("|");
            if (sig !== view.pieceSig) {
                view.pieceSig = sig;
                let s = "";
                p.piece.m.forEach((row, y) => row.forEach((v, x) => { if (v) s += `<g transform="translate(${x * CELL},${y * CELL})">${cellRectLocal(colorOf(p.piece.t))}</g>`; }));
                view.pieceG.innerHTML = s;
            }
            view.pieceG.style.transform = `translate(${p.piece.x * CELL}px,${p.piece.y * CELL}px)`;
            const gy = dropY(p.board, p.piece);
            let gs = "";
            if (gy > p.piece.y) eachCell(p.piece.m, p.piece.x, gy, (bx, by) => {
                if (by >= 0) gs += `<rect x="${bx * CELL + 1}" y="${by * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="5" fill="${colorOf(p.piece.t)}" opacity="0.14" stroke="${colorOf(p.piece.t)}" stroke-opacity="0.4" stroke-width="1.5"/>`;
            });
            view.ghostG.innerHTML = gs;
        } else { view.pieceG.innerHTML = ""; view.pieceSig = ""; view.ghostG.innerHTML = ""; }

        const nsig = p.queue.join("");
        if (nsig !== view.nextSig) {
            view.nextSig = nsig;
            view.nextrow.innerHTML = p.queue.map((t) => {
                const m = PIECES[t].m, b = boundsOf(m), u = 10;
                const ox = (44 - (b.maxX - b.minX + 1) * u) / 2, oy = (28 - (b.maxY - b.minY + 1) * u) / 2;
                let s = "";
                m.forEach((row, y) => row.forEach((v, x) => { if (v) s += `<rect x="${ox + (x - b.minX) * u + 0.5}" y="${oy + (y - b.minY) * u + 0.5}" width="${u - 1}" height="${u - 1}" rx="2.5" fill="${PIECES[t].color}"/>`; }));
                return `<svg class="tx-mini" viewBox="0 0 44 28" aria-hidden="true">${s}</svg>`;
            }).join("");
        }

        const me = slot === mySlot() && state.mode;
        view.name.textContent = p.name + (me ? " · Kamu" : "");
        view.name.classList.toggle("me", Boolean(me));
        view.score.textContent = p.score;
        view.lines.textContent = state.mode === "solo" ? `${p.linesLevel}/${state.goal}` : `${p.lines}/${state.target}`;
        view.gbadge.hidden = !(p.pendingGarbage > 0);
        view.gbadge.textContent = `⚠ +${p.pendingGarbage}`;
        view.dead.hidden = p.alive || state.mode === "solo" || state.phase === "intro";
        if (slot !== mySlot() || state.phase !== "playing") view.aim.setAttribute("hidden", "");
    }

    let overKey = "", levelKey = "", countKey = "";
    function render() {
        if (!state) {
            hud.status.textContent = "Menghubungkan…";
            arena.style.visibility = "hidden";
            ov.lobby.hidden = false; ov.intro.hidden = true;
            return;
        }
        arena.style.visibility = "";
        const ph = state.phase, md = state.mode, p0 = state.players[0], p1 = state.players[1];
        const battle = md === "bot" || md === "online";
        const me = state.players[mySlot()] || p0;

        hud.status.textContent = { intro: "Siap", lobby: "Menunggu lawan", countdown: "Bersiap…", playing: "Bermain", paused: "Jeda", levelup: "Level selesai", over: "Selesai" }[ph] || "Siap";
        hud.mode.textContent = md === "solo" ? `Solo · Level ${state.level}` : md === "bot" ? "Vs Bot" : md === "online" ? "Online" : "Pilih mode";
        hud.lv.textContent = state.level;
        hud.chipLv.hidden = battle;
        hud.score.textContent = me.score;
        hud.lines.textContent = battle ? `${me.lines}/${state.target}` : `${p0.linesLevel}/${state.goal}`;
        hud.goal.hidden = battle;
        hud.goal.textContent = `TARGET ${state.goal} LINE`;
        hud.first.hidden = !battle || ph === "intro";
        hud.first.textContent = `FIRST P${(state.first || 0) + 1}`;
        hud.best.textContent = best;
        hud.cheat.hidden = !p0.cheated || online;

        arena.classList.toggle("solo", !battle);
        arena.classList.toggle("battle", battle);
        views[1].col.hidden = !battle;
        syncBoard(views[0], p0, 0);
        if (battle) syncBoard(views[1], p1, 1);
        fitBoards();
        $("[data-intro-best]").textContent = best;

        btnCheats.hidden = online;
        btnCheats.classList.toggle("on", anyCheatOn());
        btnPause.hidden = online || (ph !== "playing" && ph !== "paused");
        const pLabel = btnPause.querySelector(".tx-btn-label");
        if (pLabel) pLabel.textContent = ph === "paused" ? "Resume" : "Pause";
        btnPause.setAttribute("aria-label", ph === "paused" ? "Resume" : "Pause");
        btnPause.title = ph === "paused" ? "Resume (P)" : "Pause (P)";
        btnRestart.hidden = online ? !(isHost && ph === "over") : !(md && ph !== "intro" && ph !== "countdown");

        const quiet = helpOpen || ui.cheatsOpen;
        ov.intro.hidden = ph !== "intro" || quiet;
        ov.lobby.hidden = ph !== "lobby" || quiet;
        ov.count.hidden = ph !== "countdown" || quiet;
        ov.pause.hidden = ph !== "paused" || quiet;
        ov.levelup.hidden = ph !== "levelup" || quiet;
        ov.over.hidden = ph !== "over" || quiet;
        ov.help.hidden = !helpOpen;
        ov.cheats.hidden = !ui.cheatsOpen || online || helpOpen;
        $("[data-lobby-text]").textContent = isHost ? "Menunggu lawan bergabung…" : "Menunggu host memulai…";

        if (ph === "countdown") {
            const key = `${state.count}|${state.first}|${state.actorSlot.join("")}|${p1.name}`;
            if (key !== countKey) {
                countKey = key;
                $("[data-count]").textContent = state.count;
                const ms = mySlot();
                $("[data-count-sub]").innerHTML =
                    `Posisi diacak: kamu <b>P${ms + 1}</b> (${ms === 0 ? "kiri" : "kanan"})<br>` +
                    `🎲 <b>${esc(state.players[state.first].name)}</b> jalan duluan (head-start ${HEADSTART_MS / 1000} detik)`;
            }
        }
        if (ph === "levelup") {
            const key = `${state.level}|${p0.score}|${p0.lines}`;
            if (key !== levelKey) {
                levelKey = key;
                $("[data-levelup-card]").innerHTML = `
          <h3 class="tx-ovtitle win">Level ${state.level} selesai!</h3>
          <p class="tx-stats">Skor ${p0.score} · Total line ${p0.lines}${p0.cheated ? " · (cheat)" : ""}</p>
          <p class="tx-ovsub">Level berikutnya: target ${goalFor(state.level + 1)} line, lebih cepat &amp; terrain lebih menantang.</p>
          <div class="tx-cardbtns"><button class="tx-btn pri" type="button" data-act="next-level">Level berikutnya →</button></div>`;
            }
        }
        if (ph === "over") {
            const key = `${state.gid}|${state.winner}|${state.reason}|${p0.score}|${p1.score}`;
            if (key !== overKey) {
                overKey = key;
                const ms = mySlot();
                const win = battle ? state.winner === ms : false;
                const title = battle ? (win ? "Kamu menang! 🎉" : "Kamu kalah") : "Game over";
                const stats = battle
                    ? `Kamu: ${state.players[ms].score} pts · ${state.players[ms].lines} line<br>Lawan: ${state.players[1 - ms].score} pts · ${state.players[1 - ms].lines} line`
                    : `Skor ${p0.score} · Line ${p0.lines} · Level ${state.level}${p0.cheated ? "<br><small>(cheat — skor tidak dicatat)</small>" : `<br>Terbaik ${best}`}`;
                let btns;
                if (online) btns = isHost
                    ? `<button class="tx-btn pri" type="button" data-act="rematch">Rematch (acak ulang)</button>`
                    : `<button class="tx-btn pri" type="button" data-act="ask-rematch">Minta rematch</button>`;
                else btns = `<button class="tx-btn pri" type="button" data-act="again">Main lagi</button><button class="tx-btn" type="button" data-act="menu">Ganti mode</button>`;
                $("[data-over-card]").innerHTML = `
          <h3 class="tx-ovtitle ${battle ? (win ? "win" : "lose") : "lose"}">${title}</h3>
          <p class="tx-ovsub">${esc(state.reason)}</p>
          <p class="tx-stats">${stats}</p>
          <div class="tx-cardbtns">${btns}</div>`;
            }
        }
        root.querySelectorAll("[data-cheat-toggle]").forEach((c) => { c.checked = ui.cheat[c.dataset.cheatToggle]; });
        $("[data-cheat-solo]").hidden = md !== "solo";
        $("[data-cheat-battle]").hidden = md !== "bot";
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    function publish() {
        render();
        if (!(online && isHost)) return;
        const now = nowMs();
        const send = () => { T.pub = null; publish._last = nowMs(); room.publishState(state).catch(console.warn); };
        if (now - (publish._last || 0) >= 90) send();
        else if (!T.pub) T.pub = setTimeout(send, 90 - (now - publish._last));
    }

    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        if (T.toast) { clearTimeout(T.toast); T.toast = null; }
        toastLeft = 2400; armToast();
    }

    /* ============================================================= */
    /* GAME FLOW                                                      */
    /* ============================================================= */
    function tickMsFor(p) {
        if (state.mode === "solo") {
            const sl = state.level + Math.floor(p.linesLevel / 6);
            return Math.max(90, 700 - (sl - 1) * 75);
        }
        const sl = 1 + Math.floor(p.lines / 6);
        return Math.max(110, 680 - (sl - 1) * 70);
    }
    function scheduleGrav(i) {
        stopGrav(i);
        if (!authority() || !state || state.phase !== "playing") return;
        const p = state.players[i];
        if (!p || !p.alive || p.bot || !p.piece || p.dropping || p.clearing) return;
        if (!online && i === 0 && ui.cheat.freeze) return;
        let ms = tickMsFor(p);
        if (!online && i === 0 && ui.cheat.slow) ms = Math.round(ms * 2.5);
        T.grav[i] = setTimeout(() => gravity(i), ms);
    }
    function gravity(i) {
        if (!state || state.phase !== "playing") return;
        const p = state.players[i];
        if (!p || !p.piece || p.dropping || p.clearing) return;
        if (!collide(p.board, p.piece.m, p.piece.x, p.piece.y + 1)) { p.piece.y++; publish(); scheduleGrav(i); }
        else lockPiece(i);
    }

    function spawn(i) {
        const p = state.players[i];
        fillQueue(p);
        const t = p.queue.shift();
        p.queue.push(drawBag(p));
        const m = PIECES[t].m.map((r) => r.slice());
        const x = Math.floor((COLS - m[0].length) / 2);
        if (!collide(p.board, m, x, 0)) p.piece = { t, m, x, y: 0, id: state.seq++ };
        else if (!collide(p.board, m, x, -1)) p.piece = { t, m, x, y: -1, id: state.seq++ };
        else { p.piece = null; return false; }
        p.plan = null;
        return true;
    }

    /* Generator level acak yang DIJAMIN bisa diselesaikan:
       terrain = blok penuh minus "sumur" terbuka (lebar 1–2, dalam ≤4).
       Tidak ada lubang tertutup → semua baris bisa diisi dari atas;
       7-bag menjamin I (sumur lebar 1) & O (sumur lebar 2) selalu datang. */
    function genTerrain(p, level) {
        const rows = level <= 1 ? 0 : Math.min(1 + level, 7);
        if (!rows) return { rows: 0 };
        const heights = new Array(COLS).fill(rows);
        const taken = new Set();
        const wells = level >= 4 ? 2 : 1;
        for (let w = 0; w < wells; w++) {
            const width = Math.random() < 0.5 ? 1 : 2;
            const depth = 1 + Math.floor(Math.random() * Math.min(4, rows));
            const starts = [];
            for (let x = 0; x <= COLS - width; x++) {
                let ok = true;
                for (let k = x - 1; k <= x + width; k++) if (taken.has(k)) ok = false;
                if (ok) starts.push(x);
            }
            if (!starts.length) break;
            const sx = starts[Math.floor(Math.random() * starts.length)];
            for (let k = sx - 1; k <= sx + width; k++) taken.add(k);
            for (let x = sx; x < sx + width; x++) heights[x] = rows - depth;
        }
        for (let y = ROWS - rows; y < ROWS; y++)
            for (let x = 0; x < COLS; x++)
                if (ROWS - 1 - y < heights[x]) p.board[y][x] = { t: "G", id: state.seq++ };
        return { rows };
    }

    function startSolo(level, carry) {
        resetPauseState();
        stopAll();
        state.gid++;
        state.mode = "solo"; state.level = level; state.goal = goalFor(level);
        state.winner = null; state.reason = "";
        const old = state.players[0];
        const p = freshPlayer(playerName, false);
        if (carry) { p.score = old.score; p.lines = old.lines; p.cheated = old.cheated; }
        p.easy = ui.cheat.easy;
        if (anyCheatOn()) p.cheated = true;
        p.rng = (Math.random() * 2 ** 31) | 0;
        fillQueue(p);
        const t = genTerrain(p, level);
        state.players = [p, freshPlayer("—", false)];
        state.phase = "playing";
        spawn(0);
        publish();
        scheduleGrav(0);
        toast(`Level ${level}: target ${state.goal} line${t.rows ? ` · terrain ${t.rows} baris` : ""}`);
    }

    function resetBattle(md) {
        resetPauseState();
        stopAll();
        state.gid++;
        state.mode = md; state.target = BATTLE_TARGET;
        state.first = Math.random() < 0.5 ? 0 : 1;                                  // 🎲 siapa jalan duluan
        state.actorSlot = md === "online" && Math.random() < 0.5 ? [1, 0] : [0, 1]; // 🎲 posisi P1/P2
        const seed = (Math.random() * 2 ** 31) | 0;
        const names = md === "online"
            ? [null, null].map((_, slot) => slot === state.actorSlot[0] ? playerName : (state.names?.[1] || "Lawan"))
            : [playerName, "Bot"];
        state.players = names.map((n, idx) => {
            const p = freshPlayer(n || "Lawan", md === "bot" && idx === 1);
            p.rng = seed; // seed sama → urutan balok identik
            fillQueue(p);
            return p;
        });
        if (md !== "online") { state.players[0].easy = ui.cheat.easy; if (anyCheatOn()) state.players[0].cheated = true; }
        state.phase = "countdown"; state.count = 3; state.winner = null; state.reason = "";
        publish();
        const gid = state.gid;
        after(800, () => {
            if (state.gid !== gid) return; state.count = 2; publish();
            after(800, () => {
                if (state.gid !== gid) return; state.count = 1; publish();
                after(800, () => { if (state.gid !== gid) return; beginBattlePlay(); });
            });
        });
    }
    function beginBattlePlay() {
        state.phase = "playing";
        publish();
        const f = state.first, o = 1 - f;
        scheduleGrav(f);
        after(HEADSTART_MS, () => scheduleGrav(o));
        if (state.mode === "bot") {
            if (f === 1) startBotLoop();
            else after(HEADSTART_MS, startBotLoop);
        }
        toast(`🎲 ${state.players[f].name} jalan duluan!`);
    }
    function startBotLoop() { stopBot(); T.bot = setInterval(botTick, 170); }
    function botTick() {
        if (!state || state.mode !== "bot" || state.phase !== "playing") return;
        const p = state.players[1];
        if (!p.alive || !p.piece || p.dropping || p.clearing) return;
        if (Math.random() < 0.1) return; // sedikit "ragu" supaya bisa dikalahkan
        if (!p.plan || p.plan.pieceId !== p.piece.id) p.plan = botPlan(p);
        if (p.plan.rot > 0) { const ok = doRotate(1, 1); p.plan.rot--; if (!ok) p.plan = null; return; }
        if (p.piece.x !== p.plan.x) {
            const bx = p.piece.x;
            doMove(1, Math.sign(p.plan.x - bx));
            if (p.piece && p.piece.x === bx) doHard(1);
            return;
        }
        doHard(1);
    }

    function lockPiece(i) {
        const p = state.players[i];
        if (!state || state.phase !== "playing" || !p.piece) return;
        stopGrav(i);
        let top = false;
        eachCell(p.piece.m, p.piece.x, p.piece.y, (bx, by) => {
            if (by < 0) top = true;
            else p.board[by][bx] = { t: p.piece.t, id: state.seq++ };
        });
        p.piece = null;
        if (top) { handleDeath(i, "Tumpukan mencapai puncak."); return; }
        const rows = [];
        for (let y = 0; y < ROWS; y++) if (p.board[y].every((c) => c)) rows.push(y);
        if (rows.length) {
            p.clearing = rows; // fase animasi flash + shrink
            publish();
            const gid = state.gid;
            after(CLEAR_MS, () => { if (state.gid === gid) collapse(i, rows); });
        } else afterLock(i);
    }
    function collapse(i, rows) {
        const p = state.players[i];
        const noScore = p.clearNoScore;
        p.clearNoScore = false;
        p.board = p.board.filter((_, y) => !rows.includes(y));
        while (p.board.length < ROWS) p.board.unshift(emptyRow());
        p.clearing = null; // sel survivor bergeser turun → dianimasikan CSS transition
        if (!noScore) {
            const n = rows.length;
            p.lines += n; p.linesLevel += n;
            p.score += LINE_PTS[n] * (state.mode === "solo" ? state.level : 1);
            if (state.mode === "solo") {
                if (p.linesLevel >= state.goal) { levelComplete(); return; }
            } else {
                if (n >= 2) {
                    state.players[1 - i].pendingGarbage += n - 1;
                    if (1 - i === mySlot()) toast(`⚠ Garbage +${n - 1} masuk!`);
                }
                if (p.lines >= state.target) { endBattle(i, `${p.name} mencapai ${state.target} line.`); return; }
            }
        }
        afterLock(i);
    }
    function applyGarbage(p) {
        const n = p.pendingGarbage;
        p.pendingGarbage = 0;
        const hole = Math.floor(Math.random() * COLS);
        for (let k = 0; k < n; k++) {
            const top = p.board.shift();
            if (top.some((c) => c)) return false;
            const row = emptyRow();
            for (let x = 0; x < COLS; x++) if (x !== hole) row[x] = { t: "G", id: state.seq++ };
            p.board.push(row);
        }
        return true;
    }
    function afterLock(i) {
        const p = state.players[i];
        if (state.phase !== "playing") { publish(); return; }
        if (!p.piece) {
            if (state.mode !== "solo" && p.pendingGarbage > 0 && !applyGarbage(p)) { handleDeath(i, "Tertimbun garbage."); return; }
            if (!spawn(i)) { handleDeath(i, "Tidak ada ruang untuk balok baru."); return; }
        }
        publish();
        scheduleGrav(i);
    }
    function handleDeath(i, reason) {
        const p = state.players[i];
        if (state.mode === "solo" && ui.cheat.guard && !p.guardUsed) {
            p.guardUsed = true; p.cheated = true;
            p.board.splice(ROWS - 8, 8);
            while (p.board.length < ROWS) p.board.unshift(emptyRow());
            if (p.piece || spawn(i)) { toast("🛟 Kesempatan kedua dipakai!"); publish(); scheduleGrav(i); return; }
        }
        p.alive = false;
        stopAll();
        if (state.mode === "solo") {
            state.winner = null; state.reason = reason; state.phase = "over";
            saveBest();
        } else {
            state.winner = 1 - i;
            state.reason = `${p.name} tumbang. ${reason}`;
            state.phase = "over";
        }
        publish();
    }
    function levelComplete() {
        stopAll();
        state.phase = "levelup";
        saveBest();
        publish();
    }
    function endBattle(winnerSlot, reason) {
        stopAll();
        state.winner = winnerSlot;
        state.reason = reason;
        state.phase = "over";
        publish();
    }
    function saveBest() {
        const p = state.players[0];
        if (p.cheated || online) return;
        if (p.score > best) {
            best = p.score;
            try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) { }
        }
    }
    function backToMenu() {
        resetPauseState();
        stopAll();
        state.gid++;
        state.mode = null; state.phase = "intro";
        state.players = [freshPlayer(playerName, false), freshPlayer("Lawan", false)];
        publish();
    }
    function togglePause() {
        if (online || !state) return;
        if (state.phase === "playing") {
            pausedAt = nowMs();
            freezeTimers();
            stopAll();
            state.phase = "paused"; publish();
        } else if (state.phase === "paused") {
            const delta = Math.max(0, nowMs() - pausedAt);
            shiftAnchors(delta);   // Date.now()-anchor tidak "loncat" setelah jeda
            thawTimers();
            pausedAt = 0;
            state.phase = "playing"; publish();
            scheduleGrav(0); scheduleGrav(1);
            if (state.mode === "bot") startBotLoop();
        }
    }

    /* ============================================================= */
    /* AKSI (dipakai input lokal, bot, dan applyAction online)        */
    /* ============================================================= */
    function canAct(p) { return state && state.phase === "playing" && p && p.alive && p.piece && !p.dropping && !p.clearing; }
    function doMove(i, dx) {
        const p = state.players[i];
        if (!canAct(p)) return false;
        dx = dx < 0 ? -1 : 1;
        if (collide(p.board, p.piece.m, p.piece.x + dx, p.piece.y)) return false;
        p.piece.x += dx;
        publish();
        return true;
    }
    function doRotate(i, dir) {
        const p = state.players[i];
        if (!canAct(p)) return false;
        const nm = dir < 0 ? rotateCCW(p.piece.m) : rotateCW(p.piece.m);
        for (const dy of [0, -1]) for (const dx of [0, -1, 1, -2, 2]) {
            if (!collide(p.board, nm, p.piece.x + dx, p.piece.y + dy)) {
                p.piece.m = nm; p.piece.x += dx; p.piece.y += dy;
                publish();
                return true;
            }
        }
        return false;
    }
    function doSoft(i) {
        const p = state.players[i];
        if (!canAct(p)) return;
        if (!collide(p.board, p.piece.m, p.piece.x, p.piece.y + 1)) { p.piece.y++; p.score += 1; publish(); scheduleGrav(i); }
        else lockPiece(i);
    }
    function doHard(i) {
        const p = state.players[i];
        if (!canAct(p)) return;
        const gy = dropY(p.board, p.piece);
        if (gy > p.piece.y) {
            p.score += (gy - p.piece.y) * 2;
            p.piece.y = gy;          // transisi CSS .08s → animasi balok meluncur jatuh
            p.dropping = true;
            publish();
            const gid = state.gid, pid = p.piece.id;
            after(DROP_MS, () => {
                if (state.gid !== gid) return;
                const q = state.players[i];
                if (!q.piece || q.piece.id !== pid) return;
                q.dropping = false;
                lockPiece(i);
            });
        } else lockPiece(i);
    }
    function perform(a, i) {
        if (a.type === "move") doMove(i, a.dx);
        else if (a.type === "rot") doRotate(i, a.dir);
        else if (a.type === "soft") doSoft(i);
        else if (a.type === "hard") doHard(i);
    }

    function applyAction(action, actor) {
        if (!online || !isHost || !state || !action || typeof action !== "object") return;
        if (actor !== 0 && actor !== 1) return;
        if (action.type === "hello") {
            const nm = typeof action.name === "string" ? action.name.slice(0, 18) : "Lawan";
            state.names[1] = nm || "Lawan";
            const s = state.actorSlot[1];
            if (state.players[s]) state.players[s].name = state.names[1];
            if (state.phase === "lobby") resetBattle("online");
            else publish();
            return;
        }
        if (action.type === "rematch") { if (state.phase === "over") resetBattle("online"); return; }
        if (!["move", "rot", "soft", "hard"].includes(action.type)) return;
        perform(action, state.actorSlot[actor]);
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        if (online && isHost) { applyAction(action, 0); return; }
        perform(action, 0);
    }

    /* ---------- cheat ---------- */
    function cheatMark() {
        if (!state || online) return;
        state.players[0].cheated = true;
    }
    function cheatAction(kind) {
        if (!state || online || state.phase !== "playing") return;
        const p = state.players[0];
        if (kind === "clearRow") {
            if (p.clearing || p.dropping) return;
            let r = -1;
            for (let y = ROWS - 1; y >= 0; y--) if (p.board[y].some((c) => c)) { r = y; break; }
            if (r < 0) { toast("Papan sudah kosong."); return; }
            cheatMark();
            p.clearing = [r]; p.clearNoScore = true;
            publish();
            const gid = state.gid;
            after(CLEAR_MS, () => { if (state.gid === gid) collapse(0, [r]); });
        } else if (kind === "skipLevel" && state.mode === "solo") {
            cheatMark();
            p.linesLevel = state.goal;
            levelComplete();
        } else if (kind === "garbage" && state.mode === "bot") {
            cheatMark();
            state.players[1].pendingGarbage += 2;
            toast("😈 2 garbage dikirim ke Bot!");
            publish();
        }
    }

    /* ============================================================= */
    /* INPUT                                                          */
    /* ============================================================= */
    function restartGame() {
        if (online) { if (isHost && state.phase === "over") resetBattle("online"); return; }
        if (state.mode === "solo") startSolo(1, false);
        else if (state.mode === "bot") resetBattle("bot");
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) ui.cheatsOpen = false;
        render();
    }
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) {
            if (!online) { ui.cheatsOpen = !ui.cheatsOpen; if (ui.cheatsOpen) helpOpen = false; render(); }
            return;
        }
        if (t.closest("[data-cheats-close]")) { ui.cheatsOpen = false; render(); return; }
        if (t.closest("[data-pause]")) { togglePause(); return; }
        if (t.closest("[data-restart]")) { restartGame(); return; }
        const b = t.closest("[data-act],[data-cheat]");
        if (!b) return;
        if (b.dataset.cheat) { cheatAction(b.dataset.cheat); return; }
        const act = b.dataset.act;
        if (act === "solo") startSolo(1, false);
        else if (act === "bot") resetBattle("bot");
        else if (act === "next-level") startSolo(state.level + 1, true);
        else if (act === "again") { state.mode === "solo" ? startSolo(1, false) : resetBattle(state.mode); }
        else if (act === "menu") backToMenu();
        else if (act === "rematch") resetBattle("online");
        else if (act === "ask-rematch") { submitAction({ type: "rematch" }); toast("Permintaan rematch dikirim…"); }
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat-toggle]");
        if (!c || online) return;
        const key = c.dataset.cheatToggle;
        ui.cheat[key] = c.checked;
        if (c.checked) { cheatMark(); toast("Cheat aktif — skor tidak dicatat."); }
        if (state && state.mode) {
            state.players[0].easy = ui.cheat.easy;
            if (key === "freeze" || key === "slow") scheduleGrav(0);
        }
        publish();
    }

    /* keyboard (desktop): help → cheats → pause → Escape → aksi game */
    function onKey(e) {
        if (!root.isConnected || !state) return;
        const c = e.code;
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") {
            if (!helpOpen && !online) { ui.cheatsOpen = !ui.cheatsOpen; render(); }
            e.preventDefault(); return;
        }
        if (c === "KeyP") {
            if (!helpOpen && !ui.cheatsOpen) togglePause();
            e.preventDefault(); return;
        }
        if (c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (ui.cheatsOpen) { ui.cheatsOpen = false; render(); }
            else if (state.phase === "paused") togglePause();
            e.preventDefault(); return;
        }
        if (c === "Enter") {
            if (helpOpen) toggleHelp(false);
            else if (ui.cheatsOpen) { ui.cheatsOpen = false; render(); }
            e.preventDefault(); return;
        }
        if (c === "KeyR" && !online) {
            if (!helpOpen && !ui.cheatsOpen) restartGame();
            e.preventDefault(); return;
        }
        if (helpOpen || ui.cheatsOpen) return;
        const gameKeys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"];
        if (gameKeys.includes(c)) e.preventDefault();
        if (state.phase !== "playing") return;
        if (c === "ArrowLeft") submitAction({ type: "move", dx: -1 });
        else if (c === "ArrowRight") submitAction({ type: "move", dx: 1 });
        else if (c === "ArrowDown") submitAction({ type: "soft" });
        else if (c === "ArrowUp" || c === "KeyX") submitAction({ type: "rot", dir: 1 });
        else if (c === "KeyZ") submitAction({ type: "rot", dir: -1 });
        else if (c === "Space" && !e.repeat) submitAction({ type: "hard" });
    }

    /* mouse (desktop): aim kolom, klik = geser, dblclick/shift+klik = drop, klik kanan/scroll = putar */
    function colFromEvent(view, e) {
        const r = view.svg.getBoundingClientRect();
        return Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - r.left) / r.width) * COLS)));
    }
    function slideToCol(col) {
        if (!state || state.phase !== "playing") return;
        const i = mySlot(), p = state.players[i];
        if (!canAct(p)) return;
        const b = boundsOf(p.piece.m);
        const want = col - Math.floor((b.minX + b.maxX) / 2);
        let moved = false;
        while (p.piece.x < want && !collide(p.board, p.piece.m, p.piece.x + 1, p.piece.y)) { p.piece.x++; moved = true; }
        while (p.piece.x > want && !collide(p.board, p.piece.m, p.piece.x - 1, p.piece.y)) { p.piece.x--; moved = true; }
        if (moved) publish();
    }
    views.forEach((view, slot) => {
        view.svg.addEventListener("pointermove", (e) => {
            if (e.pointerType !== "mouse" || !state || state.phase !== "playing" || slot !== mySlot()) { view.aim.setAttribute("hidden", ""); return; }
            view.aim.removeAttribute("hidden");
            view.aim.setAttribute("x", String(colFromEvent(view, e) * CELL));
        });
        view.svg.addEventListener("pointerleave", () => view.aim.setAttribute("hidden", ""));
        view.svg.addEventListener("click", (e) => {
            if (slot !== mySlot() || !state || state.mode == null) return;
            const col = colFromEvent(view, e);
            slideToCol(col);
            if (e.shiftKey) submitAction({ type: "hard" });
        });
        view.svg.addEventListener("dblclick", (e) => {
            if (slot !== mySlot()) return;
            e.preventDefault();
            slideToCol(colFromEvent(view, e));
            submitAction({ type: "hard" });
        });
        view.svg.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            if (slot === mySlot()) submitAction({ type: "rot", dir: 1 });
        });
        view.svg.addEventListener("wheel", (e) => {
            if (slot !== mySlot() || !state || state.phase !== "playing") return;
            e.preventDefault();
            const now = nowMs();
            if (now - view.lastWheel < 90) return;
            view.lastWheel = now;
            submitAction({ type: "rot", dir: e.deltaY > 0 ? 1 : -1 });
        }, { passive: false });
    });

    /* tombol virtual (mobile & mouse) dengan hold-repeat */
    const pad = $("[data-pad]");
    function padAction(mv) {
        if (mv === "left") submitAction({ type: "move", dx: -1 });
        else if (mv === "right") submitAction({ type: "move", dx: 1 });
        else if (mv === "rotate") submitAction({ type: "rot", dir: 1 });
        else if (mv === "down") submitAction({ type: "soft" });
        else if (mv === "drop") submitAction({ type: "hard" });
    }
    function stopRepeat(pid) {
        const r = T.repeats.get(pid);
        if (r) { clearTimeout(r.delay); clearInterval(r.iv); T.repeats.delete(pid); }
    }
    function onPadDown(e) {
        const b = e.target.closest("[data-mv]");
        if (!b) return;
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (_) { }
        const mv = b.dataset.mv;
        padAction(mv);
        if (mv === "left" || mv === "right" || mv === "down") {
            const delay = setTimeout(() => {
                const iv = setInterval(() => padAction(mv), 70);
                const r = T.repeats.get(e.pointerId);
                if (r) r.iv = iv; else clearInterval(iv);
            }, 180);
            T.repeats.set(e.pointerId, { delay, iv: null });
        }
    }
    function onPadUp(e) { stopRepeat(e.pointerId); }
    function onPadClick(e) { // aksesibilitas keyboard (Enter/Space pada tombol fokus)
        const b = e.target.closest("[data-mv]");
        if (b && e.detail === 0) padAction(b.dataset.mv);
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    pad.addEventListener("pointerdown", onPadDown);
    pad.addEventListener("pointerup", onPadUp);
    pad.addEventListener("pointercancel", onPadUp);
    pad.addEventListener("click", onPadClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerup", onPadUp);
    document.addEventListener("pointercancel", onPadUp);
    if (typeof ResizeObserver !== "undefined" && board) { ro = new ResizeObserver(fitBoards); ro.observe(board); }
    if (typeof window !== "undefined") window.addEventListener("resize", fitBoards);

    /* ============================================================= */
    /* INIT sesuai template (struktur if/else dirapikan)              */
    /* ============================================================= */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => {
            roomData = nextRoom;
            if (isHost && state && state.phase === "lobby") {
                const pl = roomData?.players;
                const n = Array.isArray(pl) ? pl.length : pl && typeof pl === "object" ? Object.keys(pl).length : 0;
                if (n >= 2) resetBattle("online");
            }
            render();
        });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (isHost) {
            state = baseState();
            state.mode = "online";
            state.phase = "lobby";
            publish();
            const offAct = room.onAction((action) => applyAction(action, 1));
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = room.onState((nextState) => { state = nextState; render(); });
            if (typeof offState === "function") offs.push(offState);
            // umumkan diri ke host (retry sampai pertandingan dimulai)
            T.hello = setInterval(() => {
                if (!state || state.phase === "lobby") room.sendAction({ type: "hello", name: playerName }).catch(() => { });
            }, 1300);
            room.sendAction({ type: "hello", name: playerName }).catch(() => { });
            render();
        }
    } else {
        state = baseState();
        render();
    }

    return {
        destroy() {
            stopAll();
            for (const rec of T.misc) if (rec.id != null) clearTimeout(rec.id);
            T.misc.clear();
            for (const pid of [...T.repeats.keys()]) stopRepeat(pid);
            clearInterval(T.hello);
            clearTimeout(T.pub);
            clearTimeout(T.toast);
            if (ro) { ro.disconnect(); ro = null; }
            if (typeof window !== "undefined") window.removeEventListener("resize", fitBoards);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerup", onPadUp);
            document.removeEventListener("pointercancel", onPadUp);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            offs.forEach((off) => { try { off(); } catch (_) { } });
            root.innerHTML = "";
        },
    };
}