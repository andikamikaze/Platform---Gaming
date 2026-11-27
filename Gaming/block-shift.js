/*
  Block Shift — puzzle geser blok (vs Bot / multiplayer room).
  - Simpan sebagai JS/games/block-shift.js (id harus sama dengan nama file).
  - Jalankan: node tools/build-games-manifest.mjs
*/

import { iconSVG } from "../JS/icons.js";

export const META = {
  id: "block-shift",
  name: "Block Shift",
  category: "puzzle",
  catLabel: "Puzzle",
  desc: "Geser blok ke ruang kosong sampai polanya sama dengan target, lebih cepat dari lawan.",
  art: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="16" height="16" rx="4" fill="#fff"/><rect x="26" y="6" width="16" height="16" rx="4" fill="#fff" fill-opacity=".55"/><rect x="6" y="26" width="16" height="16" rx="4" fill="#fff" fill-opacity=".55"/><rect x="26" y="26" width="16" height="16" rx="4" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/></svg>',
  bg: ["#5eead4", "#0d9488"],
  bestKey: "blockShiftBest",
};

/* ---------- Data & helper murni ---------- */

// '.' = kosong, '#' = dinding, A-E = warna blok
const COLORS = {
  A: { c: "#e07a4f", g: "●" },
  B: { c: "#3f95a1", g: "▲" },
  C: { c: "#d9b448", g: "■" },
  D: { c: "#8f7fc7", g: "◆" },
  E: { c: "#5fa873", g: "★" },
};
const KEYS = "ABCDE";
const LEVELS = {
  easy: { label: "Mudah", n: 3, walls: 0, colors: 3, scr: 14, slip: 0.35 },
  normal: { label: "Sedang", n: 4, walls: 1, colors: 4, scr: 30, slip: 0.2 },
  hard: { label: "Sulit", n: 5, walls: 3, colors: 5, scr: 50, slip: 0.08 },
};

const isBlock = (ch) => Object.prototype.hasOwnProperty.call(COLORS, ch);
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function nbrs(i, n) {
  const r = (i / n) | 0, c = i % n, o = [];
  if (r > 0) o.push(i - n);
  if (r < n - 1) o.push(i + n);
  if (c > 0) o.push(i - 1);
  if (c < n - 1) o.push(i + 1);
  return o;
}
function legal(b, n) {
  const m = [];
  for (let i = 0; i < b.length; i++) if (isBlock(b[i])) for (const j of nbrs(i, n)) if (b[j] === ".") m.push([i, j]);
  return m;
}
function swap(b, i, j) { const a = b.split(""); [a[i], a[j]] = [a[j], a[i]]; return a.join(""); }
function wrongCount(b, t) {
  let k = 0;
  for (let i = 0; i < b.length; i++) if (isBlock(b[i]) && b[i] !== t[i]) k++;
  return k;
}

/* Level acak yang pasti bisa diselesaikan: mulai dari pola target,
   lalu acak dengan langkah legal (semua langkah bisa dibalik). */
function generate(cfg) {
  const n = cfg.n, N = n * n;
  let res = null;
  for (let tries = 0; tries < 200; tries++) {
    const idx = shuffle([...Array(N).keys()]);
    const cells = Array(N).fill(".");
    for (let k = 0; k < cfg.walls; k++) cells[idx[k]] = "#";
    idx.slice(cfg.walls + 2).forEach((c, k) => { cells[c] = KEYS[k % cfg.colors]; }); // 2 ruang kosong
    const target = cells.join("");
    let b = target, last = null;
    const st = [];
    for (let s = 0; s < cfg.scr; s++) {
      const mv = legal(b, n).filter((m) => !(last && m[0] === last[1] && m[1] === last[0]));
      if (!mv.length) break;
      const m = pick(mv);
      b = swap(b, m[0], m[1]);
      last = m;
      const top = st[st.length - 1];
      if (top && top[0] === m[1] && top[1] === m[0]) st.pop(); else st.push(m);
    }
    // path = langkah penyelesaian (kebalikan dari acakan)
    res = { target, start: b, path: st.reverse().map(([a, c]) => [c, a]) };
    if (wrongCount(b, target) >= Math.max(3, n)) break;
  }
  return res;
}

// Jaga jalur solusi tetap valid: langkah sesuai jalur -> dihapus, selain itu -> tambahkan langkah pembatal.
function trackPath(path, from, to) {
  const p = path[0];
  if (p && p[0] === from && p[1] === to) path.shift(); else path.unshift([to, from]);
}

/* ---------- Game ---------- */

export function mount(root, context = {}) {
  const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
  const online = mode === "room" && Boolean(room);
  const playerIndex = online && !room.isHost ? 1 : 0;
  let roomData = room?.room || null;
  let state = null;
  let destroyed = false;

  const ui = { diff: "normal", sel: 0, round: 0, cheatOn: false, cheated: false, saved: 0 };
  const cheats = { hint: false, wrong: false, ghost: false, freeze: false };
  let myPath = [], botPath = [], history = [], botTimer = null;

  /* UI-only modal flags + clock (no engine state touched) */
  let helpOpen = false, cheatsOpen = false, paused = false;
  let clockAt = Date.now(), freezeAt = 0, tickTimer = null;
  const isFrozen = () => paused || helpOpen || cheatsOpen;
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } },
  };
  const best = store.get(META.bestKey, {});

  root.innerHTML = `
    <div class="game-app bs game-fill" data-bs>
      <style>
        .bs{--line:rgba(148,163,184,.28);--soft:rgba(255,255,255,.04);--surface:#0b1220;--ink:#e5e7eb;--mut:#94a3b8;--acc:#2dd4bf;min-width:0;max-width:100%;overflow-x:clip;-webkit-tap-highlight-color:transparent;color:var(--ink)}
        .bs [hidden]{display:none!important}
        .bs *,.bs *::before,.bs *::after{box-sizing:border-box}
        .bs :where(svg,canvas,img){max-width:100%;height:auto}
        .bs :where(button,[role="button"],select,input){touch-action:manipulation}
        .bs :where(button,[role="button"],select,input):focus-visible{outline:2px solid currentColor;outline-offset:2px}
        /* HUD: semua info + kontrol, satu baris di atas papan */
        .bs-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
        .bs-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--soft);color:var(--mut);white-space:nowrap}
        .bs-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
        .bs-chip-note{max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;opacity:.8}
        .bs-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--line)}
        .bs-dot.you{background:var(--acc)}
        .bs-dot.foe{background:#e07a4f}
        .bs-spacer{flex:1 1 auto}
        .bs-btn,.bs-select{border:1px solid var(--line);border-radius:9px;background:var(--soft);color:var(--ink);font:inherit;padding:8px 12px;min-height:32px;cursor:pointer;font-family:inherit}
        .bs-btn:hover,.bs-select:hover{border-color:var(--acc);color:#fff}
        .bs-btn.on{border-color:var(--acc);color:var(--acc);background:rgba(45,212,191,.12)}
        .bs-btn:disabled{opacity:.45;cursor:not-allowed}
        .bs-select{padding:6px 8px}
        .bs-icon-btn{display:inline-flex;align-items:center;gap:6px}
        .bs-icon-btn svg{flex:none;display:block}
        /* Papan + arena */
        .bs-board{position:relative;display:flex;flex-direction:column;width:100%;min-height:0;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--soft);overflow:hidden}
        .bs.game-fill > .bs-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
        .bs-stage{display:flex;align-items:center;justify-content:center;gap:20px;flex:1 1 auto;min-height:0}
        .bs-main{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:0}
        .bs-side{display:flex;flex-direction:column;gap:16px;flex:0 0 150px}
        .bs-mini small{display:block;margin-bottom:6px;font-size:12px;opacity:.7}
        .bs-mini-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:3px;padding:5px;border:1px solid var(--line);border-radius:8px;background:var(--soft);aspect-ratio:1}
        .bs-mini-grid i{border-radius:3px;border:1px dashed var(--line)}
        .bs-mini-grid i.b{border:0}
        .bs-mini-grid i.w{border:0;background:rgba(127,127,127,.45)}
        .bs-grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:6px;width:min(100%,420px);aspect-ratio:1;padding:8px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
        .bs-cell{position:relative;display:grid;place-items:center;min-width:0;padding:0;border:0;border-radius:10px;font:inherit;font-size:clamp(14px,4vw,22px);color:#fff;touch-action:manipulation;cursor:pointer}
        .bs-block{background:var(--c);transition:transform .12s}
        .bs-block:active{transform:scale(.94)}
        .bs-block.is-movable{box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)}
        .bs-block.is-wrong{box-shadow:inset 0 0 0 3px #e11d48}
        .bs-empty{background:transparent;border:1.5px dashed var(--line)}
        .bs-empty.is-target{border-color:currentColor;background:var(--soft)}
        .bs-wall{background:repeating-linear-gradient(45deg,rgba(127,127,127,.5) 0 4px,rgba(127,127,127,.28) 4px 8px);cursor:default}
        .bs-cell.is-sel{outline:2px solid currentColor;outline-offset:2px;z-index:1}
        .bs-cell.is-last{animation:bs-pop .18s ease-out}
        .bs-cell.is-hint-from,.bs-cell.is-hint-to{outline:3px solid #22c55e;outline-offset:2px}
        .bs-cell.has-ghost::after{content:"";position:absolute;right:5px;bottom:5px;width:9px;height:9px;border-radius:50%;background:var(--g);border:1.5px solid #fff}
        .bs-wait{padding:40px 0;text-align:center;opacity:.7}
        .bs-pad{display:none;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,52px);gap:6px;justify-content:center;margin:12px auto 0}
        .bs-key{display:grid;place-items:center;padding:0;font-size:18px;touch-action:manipulation}
        @media (pointer:coarse),(max-width:640px){.bs-pad{display:grid}}
        /* Overlay modal (result / pause / cheat / help) */
        .bs-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(127,127,127,.2);backdrop-filter:blur(2px)}
        .bs-sheet{width:min(460px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--ink)}
        .bs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-bottom:12px}
        .bs-head h3{margin:0;font-size:16px}
        .bs-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:14px}
        .bs-help,.bs-cheats,.bs-stats{flex:1 1 auto;min-height:0;overflow:auto}
        .bs-sheet ul{margin:0 0 12px;padding-left:18px;font-size:13px;line-height:1.55}
        .bs-sheet h4{margin:14px 0 4px;font-size:13px}
        .bs-sheet kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:rgba(255,255,255,.06);color:var(--ink);font:inherit}
        .bs-cheats{display:grid;gap:8px;margin:0}
        .bs-cheats button{display:flex;justify-content:space-between;gap:10px;text-align:left}
        .bs-note-sm{margin:0;font-size:12px;opacity:.7}
        .bs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px}
        .bs-stat{border:1px solid var(--line);border-radius:10px;padding:8px}
        .bs-stat u{display:block;font-size:10px;text-decoration:none;text-transform:uppercase;opacity:.6}
        .bs-stat b{display:block;margin-top:4px;font-size:17px;font-variant-numeric:tabular-nums}
        @keyframes bs-pop{from{transform:scale(.82)}to{transform:scale(1)}}
        @media (prefers-reduced-motion:reduce){.bs-cell,.bs-cell.is-last{animation:none;transition:none}}
/* ==== FRONTEND REDESIGN · design.md — minimalist game utility ==== */
.bs :where([class*="hud"],[class*="bar"],[class*="chips"],[class*="actions"],[class*="controls"],[class*="tools"],[class*="seg"],[class*="row"]){flex-wrap:wrap;min-width:0;gap:8px}
.bs :is([class*="card"],[class*="panel"],[class*="sheet"],[class*="boardwrap"],[class*="board-wrap"],[class*="wrap"]){border-radius:12px;box-shadow:none}
.bs :where(h2,h3,h4){line-height:1.25;letter-spacing:-.01em}
.bs :where([class*="chip"],[class*="label"],[class*="meta"],[class*="hint"],[class*="note"],[class*="sub"]){font-size:12px;line-height:1.45}
@media (max-width:768px){
  .bs :where([class*="stage"],[class*="boardwrap"],[class*="board-wrap"],[class*="sheet"]){padding:12px}
}
@media (max-width:480px){
  .bs :where(kbd,[class*="kbd"]){display:none}
}
@media (pointer:coarse){
  .bs :where(button:not([aria-checked]):not([class*="switch"]),[role="button"],select){min-height:44px;min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .bs *,.bs *::before,.bs *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
/* --- fill height + mobile refinements (LAST: beat pointer:coarse 44px) --- */
@media (max-width:640px){
.bs.game-fill > .bs-board:not(:has(.bs-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
.bs.game-fill > .bs-board:has(.bs-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
.bs .bs-hud{gap:5px;margin-bottom:8px}
.bs .bs-hud .bs-chip{padding:4px 6px;font-size:9px}
.bs .bs-hud .bs-chip-note,.bs .bs-hud .bs-chip:has([data-hud="wrong"]),.bs .bs-hud .bs-chip:has([data-hud="movable"]),.bs .bs-hud .bs-chip:has([data-hud="best"]),.bs .bs-hud .bs-chip:has([data-hud="time"]){display:none}
.bs .bs-hud .bs-btn,.bs .bs-hud .bs-select{min-height:32px;min-width:0;padding:5px 9px;font-size:9px}
.bs .bs-hud .bs-btn-label,.bs .bs-hud .bs-spacer{display:none}
.bs-stage{flex-direction:column;gap:10px}
.bs-side{flex:none;width:100%;flex-direction:row;justify-content:center;gap:10px}
.bs-side .bs-mini{flex:1;max-width:140px}
.bs-grid{width:min(100%,360px);gap:4px;padding:6px}
.bs-ov{padding:8px}
.bs .bs-sheet{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.bs .bs-help,.bs .bs-cheats,.bs .bs-stats{scrollbar-width:none}
.bs .bs-help::-webkit-scrollbar,.bs .bs-cheats::-webkit-scrollbar,.bs .bs-stats::-webkit-scrollbar{display:none}
.bs .bs-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
.bs .bs-note-sm{display:none}
}
      </style>
      <div class="bs-hud">
        <span class="bs-chip">LV <b data-hud="level">1</b></span>
        <span class="bs-chip"><i class="bs-dot you"></i>YOU <b data-hud="you">0/0</b></span>
        <span class="bs-chip"><i class="bs-dot foe"></i><span data-hud="foe-name">Bot</span> <b data-hud="foe">0/0</b></span>
        <span class="bs-chip">WRONG <b data-hud="wrong">0</b></span>
        <span class="bs-chip">MOVABLE <b data-hud="movable">0</b></span>
        <span class="bs-chip">BEST <b data-hud="best">—</b></span>
        <span class="bs-chip">TIME <b data-hud="time">0:00</b></span>
        <span class="bs-chip bs-chip-note" data-hud="note"></span>
        <span class="bs-spacer"></span>
        <select class="bs-select" data-diff data-host-only aria-label="Tingkat kesulitan">
          ${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === ui.diff ? " selected" : ""}>${v.label}</option>`).join("")}
        </select>
        <button class="bs-btn bs-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bs-btn-label">Help</span></button>
        <button class="bs-btn bs-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bs-btn-label">Cheats</span></button>
        <button class="bs-btn bs-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bs-btn-label">Pause</span></button>
        <button class="bs-btn bs-icon-btn" type="button" data-restart data-host-only aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bs-btn-label">Restart</span></button>
        <button class="bs-btn bs-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bs-btn-label">Exit game</span></button>
      </div>
      <section class="game-panel bs-board" data-board>
        <div class="bs-stage" data-stage></div>
        <div class="bs-ov" data-ov="over" hidden>
          <div class="bs-sheet" role="dialog" aria-label="Hasil">
            <div class="bs-head"><h3 data-out="title">—</h3></div>
            <div class="bs-stats">
              <div class="bs-stat"><u>Langkah</u><b data-out="moves">0/0</b></div>
              <div class="bs-stat"><u>Salah</u><b data-out="wrong">0</b></div>
              <div class="bs-stat"><u>Terbaik</u><b data-out="best">—</b></div>
              <div class="bs-stat"><u>Waktu</u><b data-out="time">0:00</b></div>
            </div>
            <div class="bs-foot">
              <span class="bs-note-sm" data-out="wait" hidden>Menunggu host…</span>
              <button class="bs-btn" type="button" data-new data-host-only>Level baru</button>
            </div>
          </div>
        </div>
        <div class="bs-ov" data-ov="pause" hidden>
          <div class="bs-sheet" role="dialog" aria-label="Paused">
            <div class="bs-head"><h3>Paused</h3></div>
            <p class="bs-note-sm">Timer dan Bot dijeda selama permainan dijeda.</p>
            <div class="bs-foot"><span class="bs-note-sm"></span><button class="bs-btn" type="button" data-resume>Resume</button></div>
          </div>
        </div>
        <div class="bs-ov" data-ov="cheat" hidden>
          <div class="bs-sheet" role="dialog" aria-label="Cheats">
            <div class="bs-head"><h3>Cheats</h3><button class="bs-btn" type="button" data-cheats-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
            <div class="bs-cheats" data-cheat-grid></div>
            <div class="bs-foot"><span class="bs-note-sm">Hanya mode vs Bot · rekor tidak dicatat setelah memakai cheat</span><button class="bs-btn" type="button" data-cheats-close>Done</button></div>
          </div>
        </div>
        <div class="bs-ov" data-ov="help" hidden>
          <div class="bs-sheet" role="dialog" aria-label="How to play">
            <div class="bs-head"><h3>How to play</h3><button class="bs-btn" type="button" data-help-close aria-label="Close">${iconSVG("x", { size: 14 })}</button></div>
            <div class="bs-help">
              <div>
                <b>Controls</b>
                <ul>
                  <li><kbd>Klik</kbd> blok untuk menggesernya; klik kotak tujuan bila ada beberapa pilihan.</li>
                  <li><kbd>Panah</kbd> / <kbd>WASD</kbd> menggeser blok terpilih atau memindahkan pilihan.</li>
                  <li><kbd>H</kbd> help · <kbd>C</kbd> cheats · <kbd>P</kbd> pause · <kbd>R</kbd> restart</li>
                  <li>Di mobile, pakai tombol panah virtual di bawah papan.</li>
                </ul>
                <b>Hindari buntu</b>
                <ul>
                  <li>Jangan biarkan ruang kosong terkurung dinding atau sudut.</li>
                  <li>Blok berbingkai putih masih bisa digeser; bila tersisa 1, langkahmu hampir habis.</li>
                </ul>
              </div>
              <div>
                <b>Rules</b>
                <ul>
                  <li>Susun blok persis seperti <b>Target pola</b> lebih dulu dari lawan.</li>
                  <li>Satu langkah = geser satu blok ke kotak kosong bersebelahan. Dinding tidak bisa digeser.</li>
                  <li>Ada batas langkah; jika habis, pemenangnya yang blok salahnya paling sedikit.</li>
                  <li>Lawan Bot: siapa duluan diundi. Multiplayer: posisi P1/P2 diundi, P1 jalan lebih dulu.</li>
                </ul>
                <div class="bs-foot"><span class="bs-note-sm">Press H to reopen this guide</span><button class="bs-btn" type="button" data-help-close>Got it</button></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div class="bs-pad" data-pad aria-label="Kontrol virtual">
        <button class="bs-btn bs-key" type="button" data-dir="-1,0" style="grid-column:2" aria-label="Atas">▲</button>
        <button class="bs-btn bs-key" type="button" data-dir="0,-1" style="grid-column:1;grid-row:2" aria-label="Kiri">◀</button>
        <button class="bs-btn bs-key" type="button" data-dir="1,0" style="grid-column:2;grid-row:2" aria-label="Bawah">▼</button>
        <button class="bs-btn bs-key" type="button" data-dir="0,1" style="grid-column:3;grid-row:2" aria-label="Kanan">▶</button>
      </div>
    </div>`;

  root.querySelectorAll("[data-host-only]").forEach((el) => { el.hidden = online && !room.isHost; });
  root.querySelectorAll("[data-ai-only]").forEach((el) => { el.hidden = online; });

  const $ = (s) => root.querySelector(s);
  const stage = $("[data-stage]");
  const cheatsGrid = $("[data-cheat-grid]");
  const hud = {
    level: $('[data-hud="level"]'), you: $('[data-hud="you"]'), foe: $('[data-hud="foe"]'),
    foeName: $('[data-hud="foe-name"]'), wrong: $('[data-hud="wrong"]'),
    movable: $('[data-hud="movable"]'), best: $('[data-hud="best"]'), time: $('[data-hud="time"]'),
    note: $('[data-hud="note"]'),
  };
  const out = {
    title: $('[data-out="title"]'), moves: $('[data-out="moves"]'), wrong: $('[data-out="wrong"]'),
    best: $('[data-out="best"]'), time: $('[data-out="time"]'), wait: $('[data-out="wait"]'),
  };
  const ov = { over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'), cheat: $('[data-ov="cheat"]'), help: $('[data-ov="help"]') };
  const cheatsBtn = $("[data-cheats]");
  const pauseBtn = $("[data-pause]");
  if (online) { cheatsBtn.hidden = true; pauseBtn.hidden = true; }

  /* ----- state ----- */

  const mySeat = () => (!online || room.isHost ? state.hostSeat : 1 - state.hostSeat);
  const canAct = () => Boolean(state) && state.winner < 0 && state.turn === mySeat();

  function newState(diff) {
    const cfg = LEVELS[diff] || LEVELS.normal;
    const g = generate(cfg);
    myPath = g.path.map((m) => m.slice());
    botPath = g.path.map((m) => m.slice());
    history = [];
    Object.keys(cheats).forEach((k) => { cheats[k] = false; });
    ui.cheated = false;
    const limit = cfg.scr * 2 + 10;
    const hostSeat = online ? rand(2) : 0;       // multiplayer: posisi P1/P2 diundi
    const turn = online ? 0 : rand(2);           // vs Bot: siapa jalan duluan diundi
    const note = online ? "" : turn === 0 ? "Undian: kamu jalan lebih dulu." : "Undian: Bot jalan lebih dulu.";
    return {
      diff, n: cfg.n, target: g.target, boards: [g.start, g.start], moves: [0, 0],
      limits: [limit, limit], turn, winner: -1, hostSeat, round: (state?.round || 0) + 1, last: [-1, -1], note,
    };
  }

  const can = (s) => state.moves[s] < state.limits[s] && legal(state.boards[s], state.n).length > 0;

  function advance(just) {
    const other = 1 - just;
    if (!can(just) && !can(other)) {
      const a = wrongCount(state.boards[0], state.target), c = wrongCount(state.boards[1], state.target);
      state.winner = a === c ? 2 : a < c ? 0 : 1;
      state.note = "Batas langkah habis. Pemenang ditentukan dari jumlah blok yang paling benar.";
      return;
    }
    let next = can(other) ? other : just;
    if (!online && cheats.freeze && next === 1 && can(0)) {
      next = 0;
      state.note = "Bot dibekukan. Giliranmu lagi.";
    } else if (next === just) {
      state.note = `P${other + 1} tidak bisa melangkah. Giliran dilewati.`;
    }
    state.turn = next;
  }

  function applyAction(action, actor) {
    if (!state || !action) return;
    if (action.type === "new") {
      if (online && actor !== 0) return;
      clearTimeout(botTimer);
      botTimer = null;
      clockAt = freezeAt || Date.now();
      state = newState(LEVELS[action.diff] ? action.diff : state.diff);
      publish();
      scheduleBot();
      return;
    }
    if (action.type !== "move" || state.winner >= 0) return;
    const seat = actor === 0 ? state.hostSeat : 1 - state.hostSeat;
    if (seat !== state.turn) return;
    const { from, to } = action, b = state.boards[seat], n = state.n;
    if (!Number.isInteger(from) || !Number.isInteger(to) || !isBlock(b[from]) || b[to] !== "." || !nbrs(from, n).includes(to)) return;
    if (!online) {
      if (seat === 0) history.push({ b, p: myPath.map((m) => m.slice()) });
      trackPath(seat === 0 ? myPath : botPath, from, to);
    }
    const nb = swap(b, from, to);
    state.boards[seat] = nb;
    state.moves[seat]++;
    state.last[seat] = to;
    state.note = "";
    if (nb === state.target) state.winner = seat; else advance(seat);
    publish();
    scheduleBot();
  }

  function publish() {
    render();
    // Hanya host yang menulis state kanonik ke Firebase.
    if (online && room.isHost) room.publishState(state).catch(console.warn);
  }

  function submitAction(action) {
    if (online && !room.isHost) {
      room.sendAction(action).catch(console.warn);
      return;
    }
    applyAction(action, playerIndex);
  }

  /* ----- bot (mode vs Bot) ----- */

  function scheduleBot() {
    if (online || !state || state.winner >= 0 || state.turn !== 1 || isFrozen()) return;
    clearTimeout(botTimer);
    botTimer = setTimeout(botMove, 650 + Math.random() * 500);
  }

  function botMove() {
    if (isFrozen() || !state || state.winner >= 0 || state.turn !== 1) return;
    const b = state.boards[1], mv = legal(b, state.n);
    if (!mv.length) return;
    const p = botPath[0];
    const ok = p && isBlock(b[p[0]]) && b[p[1]] === ".";
    const m = !ok || Math.random() < LEVELS[state.diff].slip ? pick(mv) : p; // sesekali salah langkah
    applyAction({ type: "move", from: m[0], to: m[1] }, 1);
  }

  /* ----- kontrol pemain ----- */

  function step(dr, dc) {
    if (!state || isFrozen()) return;
    const n = state.n, r = ((ui.sel / n) | 0) + dr, c = (ui.sel % n) + dc;
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    const t = r * n + c, b = state.boards[mySeat()];
    if (isBlock(b[ui.sel]) && b[t] === "." && canAct()) {
      const from = ui.sel;
      ui.sel = t;
      submitAction({ type: "move", from, to: t });
      return;
    }
    ui.sel = t;
    render();
  }

  function pickCell(i) {
    if (!state || isFrozen()) return;
    const n = state.n, b = state.boards[mySeat()], ch = b[i];
    if (isBlock(ch)) {
      ui.sel = i;
      const em = nbrs(i, n).filter((j) => b[j] === ".");
      if (em.length === 1 && canAct()) {
        ui.sel = em[0];
        submitAction({ type: "move", from: i, to: em[0] });
        return;
      }
    } else if (ch === "." && isBlock(b[ui.sel]) && nbrs(ui.sel, n).includes(i) && canAct()) {
      const from = ui.sel;
      ui.sel = i;
      submitAction({ type: "move", from, to: i });
      return;
    } else {
      ui.sel = i;
    }
    render();
  }

  /* ----- cheat (hanya mode vs Bot) ----- */

  function hintMove() {
    if (online || !state || state.winner >= 0) return null;
    const m = myPath[0], b = state.boards[0];
    return m && isBlock(b[m[0]]) && b[m[1]] === "." ? m : null;
  }

  function cheat(name) {
    if (online || !state) return;
    ui.cheated = true;
    if (name === "hint") cheats.hint = !cheats.hint;
    else if (name === "wrong") cheats.wrong = !cheats.wrong;
    else if (name === "ghost") cheats.ghost = !cheats.ghost;
    else if (name === "freeze") cheats.freeze = !cheats.freeze;
    else if (name === "auto") {
      const h = hintMove();
      if (h && canAct()) { ui.sel = h[1]; submitAction({ type: "move", from: h[0], to: h[1] }); return; }
    } else if (name === "undo") undoMove();
    else if (name === "limit") state.limits[0] += 15;
    else if (name === "solve" && state.winner < 0) { state.boards[0] = state.target; state.winner = 0; }
    render();
  }

  function undoMove() {
    if (online || !state || state.winner >= 0 || state.turn !== 0 || !history.length) return;
    const h = history.pop();
    state.boards[0] = h.b;
    myPath = h.p;
    state.moves[0]--;
    state.last[0] = -1;
  }

  /* ----- render ----- */

  function miniHTML(b, n) {
    return `<div class="bs-mini-grid" style="--n:${n}">${[...b].map((ch) =>
      isBlock(ch) ? `<i class="b" style="background:${COLORS[ch].c}"></i>` : ch === "#" ? '<i class="w"></i>' : "<i></i>").join("")}</div>`;
  }

  function renderCheats() {
    const on = (v) => (v ? "ON" : "OFF");
    cheatsGrid.innerHTML = `
      <button class="bs-btn" type="button" data-cheat="hint"><span>Petunjuk langkah</span><b>${on(cheats.hint)}</b></button>
      <button class="bs-btn" type="button" data-cheat="auto"><span>Jalankan langkah terbaik</span><b>1×</b></button>
      <button class="bs-btn" type="button" data-cheat="undo"><span>Urungkan langkah (Z)</span><b>${history.length}</b></button>
      <button class="bs-btn" type="button" data-cheat="wrong"><span>Tandai blok salah</span><b>${on(cheats.wrong)}</b></button>
      <button class="bs-btn" type="button" data-cheat="ghost"><span>Tampilkan target di papan</span><b>${on(cheats.ghost)}</b></button>
      <button class="bs-btn" type="button" data-cheat="freeze"><span>Bekukan Bot</span><b>${on(cheats.freeze)}</b></button>
      <button class="bs-btn" type="button" data-cheat="limit"><span>Tambah batas langkah</span><b>+15</b></button>
      <button class="bs-btn" type="button" data-cheat="solve"><span>Selesaikan sekarang</span><b>✓</b></button>`;
  }

  function syncOverlays() {
    const over = Boolean(state && state.winner >= 0);
    ov.over.hidden = !over || helpOpen || cheatsOpen || paused;
    ov.pause.hidden = !paused || helpOpen || cheatsOpen || over || online;
    ov.cheat.hidden = !cheatsOpen || helpOpen || paused || online;
    ov.help.hidden = !helpOpen;
    const active = Object.keys(cheats).filter((k) => cheats[k]).length;
    if (cheatsBtn) {
      cheatsBtn.classList.toggle("on", cheatsOpen || active > 0);
      const label = cheatsBtn.querySelector(".bs-btn-label");
      if (label) label.textContent = active > 0 ? `Cheats ${active}` : "Cheats";
    }
    if (pauseBtn) {
      const label = pauseBtn.querySelector(".bs-btn-label");
      if (label) label.textContent = paused ? "Resume" : "Pause";
      pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
      pauseBtn.title = paused ? "Resume (P)" : "Pause (P)";
      pauseBtn.disabled = online;
    }
  }

  function render() {
    if (destroyed) return;
    if (!state) {
      hud.level.textContent = "—";
      hud.note.textContent = "Menunggu host…";
      stage.innerHTML = '<p class="bs-wait">Menunggu host menyiapkan level…</p>';
      syncOverlays();
      return;
    }
    const me = mySeat(), opp = 1 - me, n = state.n, b = state.boards[me], t = state.target;
    const over = state.winner >= 0, oppName = online ? "Lawan" : "Bot";
    if (ui.round !== state.round) {
      ui.round = state.round;
      clockAt = freezeAt || Date.now();
      const f = legal(b, n)[0];
      ui.sel = f ? f[0] : 0;
    }
    if (state.winner === me && ui.saved !== state.round) {
      ui.saved = state.round;
      if (!ui.cheated && (!best[state.diff] || state.moves[me] < best[state.diff])) {
        best[state.diff] = state.moves[me];
        store.set(META.bestKey, best);
      }
    }

    let status = over
      ? state.winner === 2 ? "Seri" : state.winner === me ? "Kamu menang!" : `${oppName} menang`
      : state.turn === me ? "Giliranmu" : online ? "Giliran lawan" : "Bot berpikir…";
    hud.level.textContent = String(state.round);
    hud.you.textContent = `${state.moves[me]}/${state.limits[me]}`;
    hud.foe.textContent = `${state.moves[opp]}/${state.limits[opp]}`;
    hud.foeName.textContent = oppName;
    hud.wrong.textContent = String(wrongCount(b, t));
    hud.best.textContent = best[state.diff] ? String(best[state.diff]) : "—";
    hud.time.textContent = fmt((freezeAt || Date.now()) - clockAt);

    let note = state.note || "";
    if (online && !note && state.moves[0] + state.moves[1] === 0) note = `Undian posisi: kamu P${me + 1}. P1 jalan lebih dulu.`;
    if (over) note = (state.winner === 2 ? "Seri." : state.winner === me ? "Pola selesai, kamu menang." : `${oppName} lebih dulu menyelesaikan pola.`) + (state.note ? ` ${state.note}` : "");
    hud.note.textContent = note;
    hud.note.title = note;

    const movable = new Set(legal(b, n).map((m) => m[0]));
    const selTargets = new Set(isBlock(b[ui.sel]) ? nbrs(ui.sel, n).filter((j) => b[j] === ".") : []);
    const hint = cheats.hint ? hintMove() : null;
    const risk = movable.size <= 1 && !over ? " · hati-hati, hampir buntu!" : "";
    hud.movable.textContent = `${movable.size}${risk ? " !" : ""}`;

    const cells = [...b].map((ch, i) => {
      if (ch === "#") return '<div class="bs-cell bs-wall" aria-label="Dinding"></div>';
      const cls = ["bs-cell"];
      if (i === ui.sel) cls.push("is-sel");
      if (state.last[me] === i) cls.push("is-last");
      let style = "";
      if (cheats.ghost && isBlock(t[i])) { cls.push("has-ghost"); style += `--g:${COLORS[t[i]].c};`; }
      if (ch === ".") {
        cls.push("bs-empty");
        if (selTargets.has(i)) cls.push("is-target");
        if (hint && hint[1] === i) cls.push("is-hint-to");
        return `<button class="${cls.join(" ")}" type="button" data-cell="${i}" style="${style}" aria-label="Kotak kosong"></button>`;
      }
      cls.push("bs-block");
      if (movable.has(i)) cls.push("is-movable");
      if (cheats.wrong && ch !== t[i]) cls.push("is-wrong");
      if (hint && hint[0] === i) cls.push("is-hint-from");
      return `<button class="${cls.join(" ")}" type="button" data-cell="${i}" style="--c:${COLORS[ch].c};${style}" aria-label="Blok ${ch}">${COLORS[ch].g}</button>`;
    }).join("");

    stage.innerHTML = `
      <div class="bs-main">
        <div class="bs-grid" style="--n:${n}">${cells}</div>
      </div>
      <div class="bs-side">
        <div class="bs-mini"><small>Target pola</small>${miniHTML(t, n)}</div>
        <div class="bs-mini"><small>${esc(oppName)} · ${state.moves[opp]}/${state.limits[opp]} langkah</small>${miniHTML(state.boards[opp], n)}</div>
      </div>`;

    if (over) {
      out.title.textContent = state.winner === 2 ? "Seri" : state.winner === me ? "Kamu menang!" : `${oppName} menang`;
      out.moves.textContent = `${state.moves[me]}/${state.limits[me]}`;
      out.wrong.textContent = String(wrongCount(b, t));
      out.best.textContent = best[state.diff] ? String(best[state.diff]) : "—";
      out.time.textContent = hud.time.textContent;
      out.wait.hidden = !(online && !room.isHost);
    }
    renderCheats();
    syncOverlays();
  }

  /* ----- pause-aware freezing: hentikan bot + geser anchor waktu UI ----- */

  function syncFreeze() {
    const next = isFrozen();
    if (next === Boolean(freezeAt)) return;
    if (next) {
      freezeAt = Date.now();
      clearTimeout(botTimer);
      botTimer = null;
    } else {
      const shift = Date.now() - freezeAt;
      freezeAt = 0;
      clockAt += shift;
      scheduleBot();
    }
  }

  function toggleHelp(on) {
    helpOpen = typeof on === "boolean" ? on : !helpOpen;
    if (helpOpen) { cheatsOpen = false; paused = false; }
    syncFreeze(); render();
  }
  function toggleCheats(on) {
    if (online) return;
    cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
    if (cheatsOpen) { helpOpen = false; paused = false; ui.cheatOn = true; }
    syncFreeze(); render();
  }
  function togglePause(on) {
    if (online) return;
    paused = typeof on === "boolean" ? on : !paused;
    if (paused) { helpOpen = false; cheatsOpen = false; }
    syncFreeze(); render();
  }
  function restart() {
    if (paused) togglePause(false);
    else if (cheatsOpen) toggleCheats(false);
    else if (helpOpen) toggleHelp(false);
    submitAction({ type: "new", diff: ui.diff });
  }

  /* ----- event ----- */

  function handleClick(event) {
    if (destroyed) return;
    const t = event.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-exit]")) { onExit(); return; }
    if (t.closest("[data-help]")) { toggleHelp(); return; }
    if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
    if (t.closest("[data-cheats]")) { toggleCheats(); return; }
    if (t.closest("[data-cheats-close]")) { toggleCheats(false); return; }
    if (t.closest("[data-pause]")) { togglePause(); return; }
    if (t.closest("[data-resume]")) { togglePause(false); return; }
    if (t.closest("[data-restart]") || t.closest("[data-new]")) { restart(); return; }
    const ch = t.closest("[data-cheat]");
    if (ch) { cheat(ch.dataset.cheat); return; }
    const d = t.closest("[data-dir]");
    if (d) { const [r, c] = d.dataset.dir.split(",").map(Number); step(r, c); return; }
    const cell = t.closest("[data-cell]");
    if (cell) pickCell(Number(cell.dataset.cell));
  }

  function handleChange(event) {
    if (event.target.matches("[data-diff]")) ui.diff = event.target.value;
  }

  const DIRS = {
    ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
    ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
    ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
    ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
  };

  /* Prioritas keyboard: help → cheats → pause → Escape → aksi game */
  function handleKey(event) {
    if (destroyed || !root.isConnected) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const code = event.code, k = (event.key || "").toLowerCase();

    // 1. help
    if (code === "KeyH") { toggleHelp(); event.preventDefault(); return; }
    if (helpOpen) {
      if (code === "Escape" || code === "Enter" || code === "KeyP") { toggleHelp(false); event.preventDefault(); }
      return;
    }
    // 2. cheats
    if (code === "KeyC") { if (!online) toggleCheats(); event.preventDefault(); return; }
    if (cheatsOpen) {
      if (k === "z" && !online) { cheat("undo"); event.preventDefault(); return; }
      if (code === "Escape" || code === "Enter" || code === "KeyP") { toggleCheats(false); event.preventDefault(); }
      return;
    }
    // 3. pause
    if (code === "KeyP") { if (!online) togglePause(); event.preventDefault(); return; }
    if (code === "Escape") { if (paused) togglePause(false); event.preventDefault(); return; }
    // 4. aksi game
    if (code === "KeyR" && (!online || room.isHost)) { restart(); event.preventDefault(); return; }
    if (isFrozen()) return;
    if (state && state.winner >= 0) {
      if (code === "Enter" || k === "n") { restart(); event.preventDefault(); }
      return;
    }
    if (DIRS[event.key]) { event.preventDefault(); step(...DIRS[event.key]); }
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKey);

  tickTimer = setInterval(() => {
    if (destroyed || !state || isFrozen()) return;
    hud.time.textContent = fmt((freezeAt || Date.now()) - clockAt);
  }, 500);

  if (!store.get("blockShiftHelpSeen", false)) {
    store.set("blockShiftHelpSeen", true);
    helpOpen = true;
  }

  if (online) {
    room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
    if (room.isHost) {
      state = newState(ui.diff);
      publish();
      room.onAction((action) => applyAction(action, 1));
    } else {
      render();
      room.onState((nextState) => { state = nextState; render(); });
    }
  } else {
    state = newState(ui.diff);
    render();
    scheduleBot();
  }

  return {
    destroy() {
      destroyed = true;
      clearTimeout(botTimer);
      clearInterval(tickTimer);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("change", handleChange);
      document.removeEventListener("keydown", handleKey);
    },
  };
}
