/*
 * color-sort.js — Color Sort (template ES-module)
 * Konversi dari MGP_REGISTER ke META + mount().
 * Setelah menyalin file ini, jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "color-sort", // harus sama dengan nama file (tanpa .js)
    name: "Color Sort",
    category: "puzzle",
    catLabel: "Puzzle",
    desc: "Minimal ball-sort puzzle. Solo, vs Bot, or duel a friend — every deal is solvable.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 8v26a6 6 0 0 0 12 0V8"/><path d="M8 14h16"/><circle cx="16" cy="26" r="3.2"/><path d="M32 8v26a6 6 0 0 0 12 0V8"/><path d="M30 14h16"/><circle cx="38" cy="30" r="3.2"/></svg>',
    bg: ["#e0e7ff", "#a5b4fc"],
};

/* ================= aturan murni (tanpa DOM) ================= */
const COLORS_N = 5, CAP = 4, EMPTIES = 2, MAX_TUBES = 9;

const top = (t) => t[t.length - 1];
const tubeDone = (t) => t.length === CAP && t.every((v) => v === t[0]);
const isSolved = (ts) => ts.every((t) => t.length === 0 || tubeDone(t));

function canMove(ts, s, d) {
    if (s === d) return false;
    const src = ts[s], dst = ts[d];
    // tube yang sudah lengkap dikunci (aman: 4 bola/color = posisi final di semua solusi)
    if (!src.length || tubeDone(src) || dst.length >= CAP) return false;
    return dst.length === 0 || top(dst) === top(src);
}
function applyMove(ts, s, d) {
    const n = ts.map((t) => t.slice());
    n[d].push(n[s].pop());
    return n;
}
function hasLegalMove(ts) {
    for (let s = 0; s < ts.length; s++)
        for (let d = 0; d < ts.length; d++)
            if (canMove(ts, s, d)) return true;
    return false;
}
// key kanonik: urutan tube tidak penting -> dedup simetri, solver jauh lebih cepat
const keyOf = (ts) => ts.map((t) => t.join(",")).sort().join("|");

/* DFS solver dengan move-ordering; return array [s,d] atau null */
function solve(ts, maxStates = 120000, maxDepth = 160) {
    if (isSolved(ts)) return [];
    const seen = new Set([keyOf(ts)]);
    const path = [];
    let budget = maxStates;
    function dfs(st, depth) {
        if (depth >= maxDepth || budget <= 0) return false;
        const moves = [];
        for (let s = 0; s < st.length; s++) {
            const src = st[s];
            if (!src.length || tubeDone(src)) continue;
            const uniform = src.every((v) => v === src[0]);
            for (let d = 0; d < st.length; d++) {
                if (!canMove(st, s, d)) continue;
                const dst = st[d];
                if (!dst.length && uniform) continue; // pindah run seragam ke tube kosong = sia-sia
                let sc = 0;
                if (dst.length) {
                    if (dst.length === CAP - 1 && dst.every((v) => v === top(src))) sc += 1000;
                    sc += 50 + dst.length * 5;
                } else {
                    sc += src.length > 1 && src[src.length - 2] !== top(src) ? 20 : 2;
                }
                if (src.length === 1) sc += 15;
                moves.push([sc, s, d]);
            }
        }
        moves.sort((a, b) => b[0] - a[0]);
        for (const [, s, d] of moves) {
            const nx = applyMove(st, s, d);
            const k = keyOf(nx);
            if (seen.has(k)) continue;
            seen.add(k);
            budget--;
            path.push([s, d]);
            if (isSolved(nx)) return true;
            if (dfs(nx, depth + 1)) return true;
            path.pop();
        }
        return false;
    }
    return dfs(ts.map((t) => t.slice()), 0) ? path.slice() : null;
}

/* Generator: hanya deal yang LOLOS verifikasi solver yang dipakai */
function generate() {
    for (let attempt = 0; attempt < 300; attempt++) {
        const pool = [];
        for (let c = 0; c < COLORS_N; c++) for (let k = 0; k < CAP; k++) pool.push(c);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const ts = [];
        for (let t = 0; t < COLORS_N; t++) ts.push(pool.slice(t * CAP, t * CAP + CAP));
        for (let t = 0; t < EMPTIES; t++) ts.push([]);
        if (ts.some(tubeDone)) continue; // hindari tube selesai di awal (poin duel selalu ganjil)
        if (solve(ts)) return ts;
    }
    // fallback yang trivially solvable (prakmustahil terpakai)
    const fb = [];
    for (let t = 0; t < COLORS_N; t++) fb.push([t, t, t, t]);
    fb.push([], []);
    return applyMove(applyMove(fb, 0, COLORS_N), 1, COLORS_N + 1);
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // 0 = host/lokal, 1 = guest/bot
    let roomData = room?.room || null;
    let state = null;

    let gameMode = online ? "room" : "bot"; // "solo" | "bot" | "room"
    let selected = -1, cursor = -1, bad = -1, hint = null, showCheat = false;
    let helpOpen = false, paused = false;
    let destroyed = false;
    let botTimer = null, autoTimer = null, hintTimer = null, badTimer = null;
    const pending = new Set(); // timer yang ikut dibekukan saat pause
    let pauseAt = 0;
    const unsubs = [];

    const HUES = ["#f87171", "#60a5fa", "#fbbf24", "#a78bfa", "#2dd4bf"];
    const TW = 34, TH = 132, GAP = 14, X0 = 13, Y0 = 36, BR = 12.5;
    const tubeX = (i) => X0 + i * (TW + GAP);
    const ballY = (j) => Y0 + TH - 16 - j * 27;

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("color-sort-help-seen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("color-sort-help-seen", "1"); } catch (err) { /* storage blocked */ }
    }

    root.innerHTML = `
<style>
.cs-app{--cs-accent:#6366f1;--cs-p0:#0ea5e9;--cs-p1:#f472b6;--cs-line:rgba(148,163,184,.4);min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent}
.cs-app [hidden]{display:none!important}
.cs-app *,.cs-app *::before,.cs-app *::after{box-sizing:border-box}
.cs-app :where(svg,canvas,img){max-width:100%;height:auto}
.cs-app :where(button,[role="button"],select,input){touch-action:manipulation}
.cs-app :where(button,[role="button"],select,input):focus-visible{outline:2px solid var(--cs-accent);outline-offset:2px}

/* HUD bar: semua info + kontrol, satu baris di atas board */
.cs-app .cs-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;color:#e2e8f0;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.cs-app .cs-chip{font-size:11px;padding:5px 9px;border:1px solid var(--cs-line);border-radius:999px;display:inline-flex;gap:6px;align-items:center;opacity:.85;white-space:nowrap}
.cs-app .cs-chip b{font-weight:700;font-variant-numeric:tabular-nums}
.cs-app .cs-chip.on{opacity:1;border-color:var(--cs-accent)}
.cs-app .cs-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.cs-app .cs-spacer{flex:1 1 auto}
.cs-app .cs-seg{display:inline-flex;border:1px solid var(--cs-line);border-radius:999px;overflow:hidden}
.cs-app .cs-seg button{font:inherit;font-size:11px;padding:5px 12px;background:none;border:0;color:inherit;cursor:pointer;opacity:.55}
.cs-app .cs-seg button.on{background:rgba(99,102,241,.16);opacity:1}
.cs-app .cs-btn{font:inherit;font-size:11px;padding:7px 10px;border-radius:9px;border:1px solid var(--cs-line);background:none;color:inherit;cursor:pointer}
.cs-app .cs-btn.primary{background:var(--cs-accent);border-color:transparent;color:#fff}
.cs-app .cs-btn.on{border-color:var(--cs-accent);color:var(--cs-accent)}
.cs-app .cs-btn:disabled{opacity:.45;cursor:not-allowed}
.cs-app .cs-icon-btn{display:inline-flex;align-items:center;gap:6px}
.cs-app .cs-icon-btn svg{flex:none;display:block}

/* board: mengisi tinggi, SVG tetap proporsional */
.cs-app .cs-panel{position:relative;display:flex;flex-direction:column;padding:0;border:0;background:transparent;min-height:0}
.cs-app .cs-board{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
.cs-app .cs-svg{display:block;width:100%;max-width:560px;height:auto;max-height:100%}
.cs-app .cs-tube{fill:rgba(148,163,184,.08);stroke:rgba(148,163,184,.55);stroke-width:2;cursor:pointer;transition:stroke .15s}
.cs-app .cs-tube:hover{stroke:rgba(148,163,184,.95)}
.cs-app .cs-tube.last{stroke:rgba(99,102,241,.5)}
.cs-app .cs-tube.done{stroke:#34d399}
.cs-app .cs-tube.cur{stroke:var(--cs-accent);stroke-dasharray:4 3}
.cs-app .cs-tube.sel{stroke:var(--cs-accent);stroke-width:2.5;stroke-dasharray:none}
.cs-app .cs-tube.hint{stroke:#f59e0b;animation:csPulse 1s ease infinite}
.cs-app .cs-tube.bad{stroke:#f87171;animation:csShake .3s}
.cs-app .cs-ball{stroke:rgba(2,6,23,.25);stroke-width:1;pointer-events:none}
.cs-app .cs-check{fill:#34d399;font-size:11px;text-anchor:middle}

/* touch pad: sibling setelah board, bukan penutup bidang */
.cs-app .cs-touch{display:none;gap:8px;justify-content:center;margin-top:8px}
@media (hover:none) and (pointer:coarse){.cs-app .cs-touch{display:flex}}
.cs-app .cs-touch button{min-width:54px;min-height:44px;padding:10px 14px;font-size:16px;border-radius:12px;border:1px solid var(--cs-line);background:rgba(148,163,184,.08);color:inherit;cursor:pointer}
.cs-app .cs-touch button:active{background:rgba(99,102,241,.2)}

/* overlay modal: header/footer tetap, isi bisa scroll */
.cs-app .cs-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(2,6,23,.35);backdrop-filter:blur(3px);border-radius:inherit}
.cs-app .cs-card{background:Canvas;color:Text;border:1px solid var(--cs-line);border-radius:16px;padding:18px 20px;max-width:420px;width:calc(100% - 24px);max-height:100%;display:flex;flex-direction:column;gap:10px;text-align:center}
.cs-app .cs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
.cs-app .cs-head h3{margin:0;font-size:17px}
.cs-app .cs-body{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto;text-align:left}
.cs-app .cs-foot{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;flex:none}
.cs-app .cs-card p{margin:0;font-size:12px;opacity:.65;line-height:1.45}
.cs-app .cs-cheatlist{display:flex;flex-direction:column;gap:6px}
.cs-app .cs-help b{display:block;margin-bottom:6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.cs-app .cs-help ul{margin:0 0 12px;padding-left:18px;font-size:12px;line-height:1.65}
.cs-app .cs-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--cs-line);border-bottom-width:2px;border-radius:5px;font:inherit}
@keyframes csShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@keyframes csPulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.35}}

/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.cs-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.cs-app :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.cs-app :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.cs-app :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .cs-app :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){gap:8px}
}
@media (max-width:480px){
  .cs-app :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .cs-app :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .cs-app *,.cs-app *::before,.cs-app *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}

/* ==== layout shell: override terakhir (spesifisitas > pointer:coarse) ==== */
.cs-app.game-fill>.cs-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.cs-app .cs-hud .cs-btn{min-height:32px;min-width:0;padding:6px 9px;font-size:10px}
.cs-app .cs-card{display:flex;flex-direction:column;overflow:hidden}
.cs-app .cs-head,.cs-app .cs-foot{flex:none}
.cs-app .cs-body,.cs-app .cs-cheatlist,.cs-app .cs-help{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
  .cs-app.game-fill>.cs-panel[data-board]:not(:has(.cs-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
  .cs-app.game-fill>.cs-panel[data-board]:has(.cs-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .cs-app .cs-hud{gap:5px;margin-bottom:8px}
  .cs-app .cs-hud .cs-chip{padding:4px 6px;font-size:9px}
  .cs-app .cs-hud .cs-chip[data-hud="deal"]{display:none}
  .cs-app .cs-hud .cs-btn{min-height:30px;min-width:28px;padding:5px 8px;font-size:9px}
  .cs-app .cs-hud .cs-btn-label,.cs-app .cs-hud .cs-spacer{display:none}
  .cs-app .cs-hud .cs-seg button{font-size:9px;padding:4px 8px}
  .cs-app .cs-ov{padding:8px}
  .cs-app .cs-card{width:100%;height:100%;max-height:100%;padding:12px}
  .cs-app .cs-body,.cs-app .cs-cheatlist,.cs-app .cs-help{scrollbar-width:none}
  .cs-app .cs-body::-webkit-scrollbar,.cs-app .cs-cheatlist::-webkit-scrollbar,.cs-app .cs-help::-webkit-scrollbar{display:none}
  .cs-app .cs-touch button{min-width:44px;min-height:44px;padding:8px 10px;font-size:14px}
}
</style>
<div class="game-app cs-app game-fill" data-cs>
  <div class="cs-hud">
    <span class="cs-chip"><i class="cs-dot" style="background:var(--cs-accent)"></i><b data-hud="status">Ready</b></span>
    <span class="cs-chip">SORTED <b data-hud="sorted">0</b>/${COLORS_N}</span>
    <span class="cs-chip">MOVES <b data-hud="moves">0</b></span>
    <span class="cs-chip" data-hud="deal">DEAL #1</span>
    <span class="cs-chip" data-hud="p0" hidden><i class="cs-dot" style="background:var(--cs-p0)"></i><span data-hud="p0name">P1</span> <b data-hud="p0score">0</b></span>
    <span class="cs-chip" data-hud="p1" hidden><i class="cs-dot" style="background:var(--cs-p1)"></i><span data-hud="p1name">Bot</span> <b data-hud="p1score">0</b></span>
    <span class="cs-spacer"></span>
    <span class="cs-seg" data-hud="modes">
      <button type="button" data-mode="solo" aria-label="Solo mode">Solo</button>
      <button type="button" data-mode="bot" aria-label="Vs bot mode">Bot</button>
    </span>
    <button class="cs-btn cs-icon-btn" type="button" data-undo title="Undo (U)" aria-label="Undo">${iconSVG("rotateCcw", { size: 14 })}<span class="cs-btn-label">Undo</span></button>
    <button class="cs-btn cs-icon-btn" type="button" data-new title="New deal (N)" aria-label="New deal">${iconSVG("sparkles", { size: 14 })}<span class="cs-btn-label">New deal</span></button>
    <button class="cs-btn cs-icon-btn" type="button" data-help title="How to play (H)" aria-label="How to play">${iconSVG("helpCircle", { size: 14 })}<span class="cs-btn-label">Help</span></button>
    <button class="cs-btn cs-icon-btn" type="button" data-cheats title="Cheats (C)" aria-label="Cheats">${iconSVG("wrench", { size: 14 })}<span class="cs-btn-label">Cheats</span></button>
    <button class="cs-btn cs-icon-btn" type="button" data-pause title="Pause (P)" aria-label="Pause"><span data-pause-icon>${iconSVG("pause", { size: 14 })}</span><span class="cs-btn-label">Pause</span></button>
    <button class="cs-btn cs-icon-btn" type="button" data-restart title="Restart deal (R)" aria-label="Restart">${iconSVG("refresh", { size: 14 })}<span class="cs-btn-label">Restart</span></button>
    <button class="cs-btn cs-icon-btn" type="button" data-exit title="Exit game" aria-label="Exit game">${iconSVG("logOut", { size: 14 })}<span class="cs-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel cs-panel" data-board>
    <div class="cs-board"><svg class="cs-svg" data-svg aria-label="Color Sort board"></svg></div>
    <div class="cs-ov" data-ov="cheat" hidden>
      <div class="cs-card">
        <div class="cs-head"><h3>Cheats</h3><button class="cs-btn" type="button" data-cheat="close" aria-label="Close cheats">Close</button></div>
        <div class="cs-body">
          <p>Solo only. Using cheats marks the result as assisted.</p>
          <div class="cs-cheatlist">
            <button type="button" class="cs-btn" data-cheat="hint">Hint — highlight best move</button>
            <button type="button" class="cs-btn" data-cheat="step">Auto-step — play best move</button>
            <button type="button" class="cs-btn" data-cheat="solve" data-solvelabel>Auto-solve &#9654;</button>
            <button type="button" class="cs-btn" data-cheat="tube">+1 empty tube (max ${MAX_TUBES})</button>
          </div>
        </div>
        <div class="cs-foot"><button type="button" class="cs-btn primary" data-cheat="close">Done</button></div>
      </div>
    </div>
    <div class="cs-ov" data-ov="pause" hidden>
      <div class="cs-card">
        <div class="cs-head"><h3>Paused</h3></div>
        <div class="cs-body"><p>Timer dan bot dihentikan. Lanjutkan untuk melanjutkan deal.</p></div>
        <div class="cs-foot"><button type="button" class="cs-btn primary" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="cs-ov" data-ov="result" hidden>
      <div class="cs-card">
        <div class="cs-head"><h3 data-endtitle></h3></div>
        <div class="cs-body"><p data-endsub></p></div>
        <div class="cs-foot" data-endbtns></div>
      </div>
    </div>
    <div class="cs-ov" data-ov="help" hidden>
      <div class="cs-card">
        <div class="cs-head"><h3>How to play</h3><button class="cs-btn" type="button" data-help-close aria-label="Close help">Close</button></div>
        <div class="cs-body cs-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="cs-kbd">1</span>–<span class="cs-kbd">9</span> atau klik tabung untuk memilih &amp; menjatuhkan bola.</li>
              <li><span class="cs-kbd">←</span> <span class="cs-kbd">→</span> pilih tabung, <span class="cs-kbd">Enter</span> / <span class="cs-kbd">Space</span> aksi.</li>
              <li><span class="cs-kbd">U</span> undo · <span class="cs-kbd">N</span> deal baru · <span class="cs-kbd">R</span> restart deal.</li>
              <li><span class="cs-kbd">H</span> bantuan · <span class="cs-kbd">C</span> cheats · <span class="cs-kbd">P</span> pause.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Tap tabung untuk mengambil bola, tap tabung tujuan untuk menjatuhkannya.</li>
              <li>Gunakan tombol ◀ ● ▶ untuk navigasi &amp; aksi, ↩ untuk undo (solo).</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Pindahkan satu bola ke tabung yang kosong atau bertumpuk dengan warna sama.</li>
              <li>Tabung penuh dengan empat bola warna sama terkunci dan dihitung selesai.</li>
              <li>Selesaikan kelima warna untuk menang; tumpukan sama berarti draw (vs bot/rival).</li>
              <li>Setiap deal dijamin bisa diselesaikan. Mode Solo mengizinkan undo &amp; cheats.</li>
            </ul>
          </div>
        </div>
        <div class="cs-foot"><span class="cs-note">Press H to reopen this guide</span><button type="button" class="cs-btn primary" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
  <div class="cs-touch">
    <button type="button" data-touch="left" aria-label="Previous tube">&#9664;</button>
    <button type="button" data-touch="act" aria-label="Pick or drop ball">&#9679;</button>
    <button type="button" data-touch="right" aria-label="Next tube">&#9654;</button>
    <button type="button" data-touch="undo" aria-label="Undo" data-vundo>&#8617;</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]');
    const ov = {
        cheat: $('[data-ov="cheat"]'), pause: $('[data-ov="pause"]'),
        result: $('[data-ov="result"]'), help: $('[data-ov="help"]'),
    };
    const hud = {
        status: $('[data-hud="status"]'), sorted: $('[data-hud="sorted"]'),
        moves: $('[data-hud="moves"]'), deal: $('[data-hud="deal"]'),
        modes: $('[data-hud="modes"]'),
        p0: $('[data-hud="p0"]'), p0name: $('[data-hud="p0name"]'), p0score: $('[data-hud="p0score"]'),
        p1: $('[data-hud="p1"]'), p1name: $('[data-hud="p1name"]'), p1score: $('[data-hud="p1score"]'),
    };

    /* ---------------- helpers ---------------- */
    const mySeat = () => (state ? state.seatMap[playerIndex] : 0);
    const isSolo = () => state && state.mode === "solo";
    const nameOf = (seat) => {
        if (!state || state.mode === "solo") return "You";
        const n = seat === mySeat() ? (playerName || "You") : (state.mode === "bot" ? "Bot" : "Rival");
        return String(n).slice(0, 14);
    };
    const myTurn = () => state && state.status === "playing" && (state.mode === "solo" || state.turn === mySeat());

    /* ---------------- timer yang ikut pause ----------------
     * Semua timer disimpan dengan sisa waktu. Saat pause, timer dibekukan;
     * saat resume, anchor performance.now() digeser sebesar durasi pause
     * sehingga tidak ada loncatan waktu (bot/hint/auto-solve tetap mulus). */
    function armTimer(rec) {
        rec.startedAt = performance.now();
        rec.id = setTimeout(() => {
            pending.delete(rec);
            rec.id = null;
            rec.fn();
        }, Math.max(0, rec.left));
    }
    function later(fn, ms) {
        const rec = { fn, ms, left: ms, startedAt: 0, id: null };
        pending.add(rec);
        if (!paused) armTimer(rec);
        return rec;
    }
    function cancelTimer(rec) {
        if (!rec) return;
        if (rec.id !== null) clearTimeout(rec.id);
        pending.delete(rec);
        rec.id = null;
    }
    function setPaused(on, doRender = true) {
        if (paused === on) return;
        if (on) {
            pauseAt = performance.now();
            for (const rec of pending) {
                if (rec.id !== null) { clearTimeout(rec.id); rec.id = null; }
                rec.left = Math.max(0, rec.left - (pauseAt - rec.startedAt));
            }
        } else {
            const shift = performance.now() - pauseAt;
            for (const rec of pending) { rec.startedAt += shift; armTimer(rec); }
        }
        paused = on;
        if (!on) syncBot();
        if (doRender) render();
    }
    function togglePause() {
        if (!state || state.status !== "playing") return;
        setPaused(!paused);
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) { showCheat = false; if (paused) setPaused(false, false); }
        render();
    }

    /* ---------------- match lifecycle ---------------- */
    function newMatch(keepDeal) {
        const base = keepDeal && state ? state.initial.map((t) => t.slice()) : generate();
        // random posisi pemain (P1/P2) + random giliran pertama, tiap match
        const seatMap = Math.random() < 0.5 ? [0, 1] : [1, 0];
        const first = Math.floor(Math.random() * 2);
        state = {
            v: 1, mode: gameMode,
            initial: base.map((t) => t.slice()), tubes: base.map((t) => t.slice()),
            moves: 0, history: [], scores: [0, 0],
            seatMap, first, turn: gameMode === "solo" ? 0 : first,
            status: "playing", cheated: false, last: null,
            seq: (state?.seq || 0) + 1,
        };
        selected = -1; hint = null; cursor = -1;
        stopAuto(); cancelTimer(hintTimer); hintTimer = null;
        cancelTimer(badTimer); badTimer = null;
        if (paused) setPaused(false, false);
        showCheat = false;
        publish();
    }

    /* ---------------- canonical action pipeline ---------------- */
    function applyAction(action, seat) {
        if (!state || destroyed) return;
        const t = action?.type;
        if (t === "new" || t === "retry") { newMatch(t === "retry"); return; }
        if (t === "undo") {
            if (state.mode !== "solo" || !state.history.length || state.status === "solved") return;
            const mv = state.history.pop();
            state.tubes = applyMove(state.tubes, mv.d, mv.s);
            state.moves = Math.max(0, state.moves - 1);
            state.status = "playing"; state.last = null; selected = -1;
            publish(); return;
        }
        if (t === "cheat-tube") {
            if (state.mode !== "solo" || state.tubes.length >= MAX_TUBES) return;
            state.tubes = state.tubes.concat([[]]);
            state.cheated = true; publish(); return;
        }
        if (t === "move") {
            const { s, d } = action;
            if (state.status !== "playing" || seat !== state.turn) return;
            if (!Number.isInteger(s) || !Number.isInteger(d)) return;
            if (s < 0 || d < 0 || s >= state.tubes.length || d >= state.tubes.length) return;
            if (!canMove(state.tubes, s, d)) return;
            state.tubes = applyMove(state.tubes, s, d);
            state.moves++;
            if (state.mode === "solo") state.history.push({ s, d });
            else if (tubeDone(state.tubes[d])) state.scores[seat]++;
            state.last = { s, d };
            state.turn = state.mode === "solo" ? 0 : 1 - seat;
            state.status = isSolved(state.tubes) ? "solved" : (hasLegalMove(state.tubes) ? "playing" : "stuck");
            if (state.status !== "playing") stopAuto();
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
        syncBot();
    }

    /* ---------------- bot (mode "bot" saja) ---------------- */
    function botChoose() {
        const sol = solve(state.tubes);
        if (sol && sol.length && Math.random() < 0.85) return sol[0];
        // variasi: pilih move heuristik terbaik (tetap legal)
        let best = null, bestSc = -1;
        for (let s = 0; s < state.tubes.length; s++)
            for (let d = 0; d < state.tubes.length; d++) {
                if (!canMove(state.tubes, s, d)) continue;
                const src = state.tubes[s], dst = state.tubes[d];
                let sc = Math.random() * 8;
                if (dst.length === CAP - 1 && dst.every((v) => v === top(src))) sc += 100;
                else if (dst.length) sc += 10 + dst.length;
                else if (src.every((v) => v === src[0])) sc -= 20;
                if (sc > bestSc) { bestSc = sc; best = [s, d]; }
            }
        return best;
    }
    function syncBot() {
        cancelTimer(botTimer); botTimer = null;
        if (paused || destroyed || online || !state || state.mode !== "bot") return;
        const botSeat = state.seatMap[1];
        if (state.status !== "playing" || state.turn !== botSeat) return;
        const seq = state.seq;
        botTimer = later(() => {
            botTimer = null;
            if (destroyed || paused || !state || state.seq !== seq || state.status !== "playing") return;
            const mv = botChoose();
            if (mv) applyAction({ type: "move", s: mv[0], d: mv[1] }, botSeat);
        }, 650 + Math.random() * 600);
    }

    /* ---------------- cheats (solo) ---------------- */
    function stopAuto() { cancelTimer(autoTimer); autoTimer = null; }
    function autoStep() {
        autoTimer = null;
        if (destroyed || paused || !isSolo() || state.status !== "playing") return;
        const sol = solve(state.tubes);
        if (!sol || !sol.length) return;
        applyAction({ type: "move", s: sol[0][0], d: sol[0][1] }, 0);
        if (!destroyed && !paused && isSolo() && state.status === "playing")
            autoTimer = later(autoStep, 180);
    }
    function doCheat(kind) {
        if (kind === "close") { showCheat = false; render(); return; }
        if (!isSolo() || paused) return;
        if (kind === "hint") {
            const sol = solve(state.tubes);
            if (sol && sol.length) {
                hint = { s: sol[0][0], d: sol[0][1] };
                cancelTimer(hintTimer);
                hintTimer = later(() => { hint = null; hintTimer = null; render(); }, 2200);
            }
            showCheat = false; render(); return;
        }
        if (kind === "step") {
            const sol = solve(state.tubes);
            if (sol && sol.length) {
                state.cheated = true;
                applyAction({ type: "move", s: sol[0][0], d: sol[0][1] }, 0);
            }
            showCheat = false; render(); return;
        }
        if (kind === "solve") {
            if (autoTimer) { stopAuto(); render(); return; }
            state.cheated = true;
            autoTimer = later(autoStep, 180);
            showCheat = false; render(); return;
        }
        if (kind === "tube") { applyAction({ type: "cheat-tube" }, 0); showCheat = false; render(); }
    }

    /* ---------------- interaksi papan ---------------- */
    function flashBad(i) {
        bad = i; render();
        cancelTimer(badTimer);
        badTimer = later(() => { bad = -1; badTimer = null; render(); }, 320);
    }
    function onTube(i) {
        if (!state || state.status !== "playing" || showCheat || helpOpen || paused) return;
        if (!myTurn()) { flashBad(i); return; }
        if (!Number.isInteger(i) || i < 0 || i >= state.tubes.length) return;
        cursor = i;
        if (selected === -1) {
            if (state.tubes[i].length && !tubeDone(state.tubes[i])) { selected = i; render(); }
            else flashBad(i);
            return;
        }
        if (selected === i) { selected = -1; render(); return; }
        if (canMove(state.tubes, selected, i)) {
            const mv = { type: "move", s: selected, d: i };
            selected = -1;
            submitAction(mv);
            if (online && !room.isHost) render(); // guest: tunggu state kanonik dari host
        } else {
            flashBad(i);
            selected = state.tubes[i].length && state.tubes[i].length < CAP && !tubeDone(state.tubes[i]) ? i : -1;
            render();
        }
    }

    /* ---------------- render ---------------- */
    function syncUI() {
        if (!state) {
            hud.status.textContent = "Waiting for host…";
            hud.sorted.textContent = "0";
            hud.moves.textContent = "0";
            hud.deal.textContent = "DEAL —";
            hud.modes.hidden = true;
            hud.p0.hidden = hud.p1.hidden = true;
        } else {
            const ts = state.tubes;
            hud.status.textContent =
                state.status === "solved" ? "Solved" :
                    state.status === "stuck" ? "No moves" :
                        paused ? "Paused" :
                            state.mode === "solo" ? "Your move" :
                                state.turn === mySeat() ? "Your turn" :
                                    state.mode === "bot" ? "Bot thinking…" : "Rival's turn";
            hud.sorted.textContent = ts.filter(tubeDone).length;
            hud.moves.textContent = state.moves;
            hud.deal.textContent = "DEAL #" + state.seq;
            hud.modes.hidden = online || state.mode !== "bot" && gameMode === "room";
            for (const b of hud.modes.querySelectorAll("[data-mode]"))
                b.classList.toggle("on", b.dataset.mode === gameMode);
            const duo = state.mode !== "solo";
            hud.p0.hidden = hud.p1.hidden = !duo;
            if (duo) {
                hud.p0name.textContent = nameOf(0);
                hud.p1name.textContent = nameOf(1);
                hud.p0score.textContent = state.scores[0];
                hud.p1score.textContent = state.scores[1];
                hud.p0.classList.toggle("on", state.turn === 0 && state.status === "playing");
                hud.p1.classList.toggle("on", state.turn === 1 && state.status === "playing");
            }
        }
        const undoBtn = $('[data-undo]');
        const undoOk = Boolean(state && isSolo() && state.history.length > 0 && state.status !== "solved");
        undoBtn.hidden = !state || !isSolo() || online;
        undoBtn.disabled = !undoOk;
        $('[data-vundo]').hidden = undoBtn.hidden;
        $('[data-vundo]').disabled = !undoOk;
        const cheatBtn = root.querySelector("[data-cheats]");
        cheatBtn.hidden = !state || !isSolo() || online;
        cheatBtn.classList.toggle("on", Boolean(state && state.cheated));
        const newBtn = $('[data-new]');
        newBtn.hidden = !state;
        const pauseBtn = root.querySelector("[data-pause]");
        pauseBtn.disabled = !state || state.status !== "playing";
        const pLabel = pauseBtn.querySelector(".cs-btn-label");
        if (pLabel) pLabel.textContent = paused ? "Resume" : "Pause";
        pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
        pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
        $('[data-pause-icon]').innerHTML = iconSVG(paused ? "play" : "pause", { size: 14 });
        $('[data-solvelabel]').innerHTML = autoTimer ? "Stop auto-solve &#9632;" : "Auto-solve &#9654;";

        const finished = Boolean(state && state.status !== "playing");
        ov.result.hidden = !finished || paused || showCheat || helpOpen;
        ov.pause.hidden = !paused || showCheat || helpOpen;
        ov.cheat.hidden = !showCheat || helpOpen;
        ov.help.hidden = !helpOpen;

        if (!finished) return;
        const scoreLine = nameOf(0) + " " + state.scores[0] + " — " + state.scores[1] + " " + nameOf(1);
        let title, sub;
        if (state.mode === "solo") {
            title = state.status === "solved" ? "Solved!" : "No moves left";
            sub = state.status === "solved"
                ? state.moves + " moves" + (state.cheated ? " · assisted" : "")
                : "Undo a step or deal again.";
        } else {
            const [a, b] = state.scores;
            title = a === b ? "Draw" : nameOf(a > b ? 0 : 1) + " wins!";
            sub = scoreLine + " · " + state.moves + " moves" + (state.status === "stuck" ? " · board stuck" : "");
        }
        $('[data-endtitle]').textContent = title;
        $('[data-endsub]').textContent = sub;
        $('[data-endbtns]').innerHTML =
            (state.mode === "solo" && state.status === "stuck" && state.history.length
                ? '<button type="button" class="cs-btn" data-act="undo">Undo</button>' : "") +
            '<button type="button" class="cs-btn primary" data-act="new">New deal</button>' +
            '<button type="button" class="cs-btn" data-act="retry">Retry</button>';
    }

    function render() {
        if (destroyed) return;
        if (!state) {
            svgEl.setAttribute("viewBox", "0 0 348 186");
            svgEl.innerHTML = "";
            syncUI();
            return;
        }
        const ts = state.tubes, n = ts.length;
        const W = X0 * 2 + n * TW + (n - 1) * GAP;
        svgEl.setAttribute("viewBox", "0 0 " + W + " 186");

        let html = "";
        for (let i = 0; i < n; i++) {
            const t = ts[i];
            const cls = ["cs-tube"];
            if (state.last && state.last.d === i) cls.push("last");
            if (tubeDone(t)) cls.push("done");
            if (hint && (hint.s === i || hint.d === i)) cls.push("hint");
            if (i === cursor) cls.push("cur");
            if (i === selected) cls.push("sel");
            if (i === bad) cls.push("bad");
            html += '<rect class="' + cls.join(" ") + '" data-tube="' + i + '" x="' + tubeX(i) +
                '" y="' + Y0 + '" width="' + TW + '" height="' + TH + '" rx="10"/>';
            for (let j = 0; j < t.length; j++) {
                const lift = i === selected && j === t.length - 1 ? 12 : 0;
                html += '<circle class="cs-ball" cx="' + (tubeX(i) + TW / 2) + '" cy="' + (ballY(j) - lift) +
                    '" r="' + BR + '" fill="' + HUES[t[j]] + '"/>';
            }
            if (tubeDone(t)) html += '<text class="cs-check" x="' + (tubeX(i) + TW / 2) + '" y="' + (Y0 - 8) + '">&#10003;</text>';
        }
        svgEl.innerHTML = html;
        syncUI();
    }

    /* ---------------- events: mouse / touch / virtual ---------------- */
    function handleClick(event) {
        const el = event.target;
        if (!el.closest) return;
        if (el.closest("[data-help]")) { toggleHelp(); return; }
        if (el.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (el.closest("[data-exit]")) { onExit(); return; }
        if (el.closest("[data-cheats]")) { if (isSolo() && !helpOpen && !paused) { showCheat = !showCheat; render(); } return; }
        if (el.closest("[data-pause]")) { togglePause(); return; }
        if (el.closest("[data-resume]")) { if (paused) setPaused(false); return; }
        if (el.closest("[data-restart]")) { submitAction({ type: "retry" }); return; }
        if (el.closest("[data-new]")) { submitAction({ type: "new" }); return; }
        if (el.closest("[data-undo]")) { submitAction({ type: "undo" }); return; }
        const tube = el.closest("[data-tube]");
        if (tube) { onTube(Number(tube.dataset.tube)); return; }
        const modeBtn = el.closest("[data-mode]");
        if (modeBtn && !online) {
            const m = modeBtn.dataset.mode;
            if (m !== gameMode) { gameMode = m; newMatch(false); }
            return;
        }
        const cheatBtn = el.closest("[data-cheat]");
        if (cheatBtn) { doCheat(cheatBtn.dataset.cheat); return; }
        const touch = el.closest("[data-touch]");
        if (touch && state && !paused && !helpOpen && !showCheat) {
            const k = touch.dataset.touch, n = state.tubes.length;
            if (k === "left") { cursor = cursor <= 0 ? n - 1 : cursor - 1; render(); }
            else if (k === "right") { cursor = cursor >= n - 1 ? 0 : cursor + 1; render(); }
            else if (k === "act") { if (cursor < 0) cursor = 0; onTube(cursor); }
            else if (k === "undo") submitAction({ type: "undo" });
            return;
        }
        const act = el.closest("[data-act]");
        if (!act) return;
        const a = act.dataset.act;
        if (a === "new") submitAction({ type: "new" });
        else if (a === "retry") submitAction({ type: "retry" });
        else if (a === "undo") submitAction({ type: "undo" });
    }

    /* ---------------- events: keyboard (desktop) ----------------
     * Prioritas: help → cheats → pause/Escape → aksi game. */
    function handleKey(e) {
        if (destroyed || !root.isConnected || !state) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const code = e.code, k = e.key;
        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") {
            if (!helpOpen && !paused && isSolo()) { showCheat = !showCheat; render(); }
            e.preventDefault(); return;
        }
        if (code === "KeyP" || code === "Escape" || k === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (showCheat) { showCheat = false; render(); }
            else togglePause();
            e.preventDefault(); return;
        }
        if (code === "KeyR") { submitAction({ type: "retry" }); e.preventDefault(); return; }
        if (helpOpen || showCheat || paused) { e.preventDefault(); return; }
        if (code === "KeyN") { submitAction({ type: "new" }); e.preventDefault(); return; }
        if (code === "KeyU") { submitAction({ type: "undo" }); e.preventDefault(); return; }
        if (k >= "1" && k <= "9") {
            const i = Number(k) - 1;
            if (i < state.tubes.length) { onTube(i); e.preventDefault(); }
            return;
        }
        switch (k) {
            case "ArrowLeft": cursor = cursor <= 0 ? state.tubes.length - 1 : cursor - 1; render(); e.preventDefault(); break;
            case "ArrowRight": cursor = cursor >= state.tubes.length - 1 ? 0 : cursor + 1; render(); e.preventDefault(); break;
            case "Enter": case " ": if (cursor < 0) cursor = 0; onTube(cursor); e.preventDefault(); break;
        }
    }

    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------------- init: online (host-authoritative) / lokal ---------------- */
    render();
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            newMatch(false); // host: deal + random seatMap + random giliran pertama
            const u2 = room.onAction((action) => applyAction(action, state ? state.seatMap[1] : 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                state = nextState; selected = -1; hint = null; cursor = -1; render();
            });
            if (typeof u3 === "function") unsubs.push(u3);
        }
    } else {
        newMatch(false); // lokal: mode "bot" (bisa diganti Solo via toggle)
    }

    return {
        destroy() {
            destroyed = true;
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            for (const rec of Array.from(pending)) cancelTimer(rec);
            stopAuto();
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}
