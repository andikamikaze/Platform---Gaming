/* ================================================================ */
/* js/games/space-invaders.js                                       */
/* Space Invaders — minimalist arcade shooter (template mount/META) */
/* Solo endless + duel vs Bot + duel multiplayer (room).            */
/* Random, guaranteed-solvable levels. One enemy type, no boss.     */
/* ================================================================ */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "space-invaders", // harus sama dengan nama file (tanpa .js)
    name: "Space Invaders",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Tembak formasi invaders, hindari bom, dan selamatkan bumi. Level acak yang dijamin bisa diselesaikan.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h14v6h5v9h-5v6h-6v-5h10v-5H13v5h10v5h-6v-6H7v-9h5V8z"></path><path d="M24 32v8M18 40h12"></path></svg>',
    bg: ["#c7d2fe", "#a5b4fc"],
    bestKey: "spaceInvadersBest",
};

/* ---------------- pure helpers (module scope) ---------------- */
const W = 560, H = 520, SHIP_Y = H - 44;
const CELL_W = 44, CELL_H = 34, MAXR = 6, MAXC = 10;
const PLAYER_SPEED = 270, BULLET_V = 430;
const CD = 0.30, CD_RAPID = 0.09;
const TURN_TIME = 18, TURNS_TOTAL = 6, START_LIVES = 3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6d2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* satu jenis musuh (tanpa variasi, tanpa bos) */
const ENEMY_MAP = [
    "00100000100",
    "00010001000",
    "00111111100",
    "01101110110",
    "11111111111",
    "10111111101",
    "10100000101",
    "00011011000",
];
function spritePath(map, cell) {
    let d = "";
    for (let r = 0; r < map.length; r++)
        for (let c = 0; c < map[r].length; c++)
            if (map[r][c] === "1")
                d += "M" + c * cell + " " + r * cell + "h" + cell + "v" + cell + "h" + -cell + "z";
    return d;
}
const ENEMY_D = spritePath(ENEMY_MAP, 2); /* 22 x 16 px */
const ENEMY_HW = 11, ENEMY_HH = 8;

const PATTERNS = ["FULL", "CHECKER", "PYRAMID", "DIAMOND", "PILLARS", "SWARM", "ZIGZAG"];

function buildCells(pat, rows, cols, rnd) {
    const cells = new Array(rows * cols).fill(0);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let v = 1;
            if (pat === "CHECKER") v = (r + c) % 2 === 0 ? 1 : 0;
            else if (pat === "PYRAMID") {
                const span = Math.max(2, Math.round((cols * (r + 1)) / rows));
                const st = ((cols - span) / 2) | 0;
                v = c >= st && c < st + span ? 1 : 0;
            } else if (pat === "DIAMOND") {
                const mid = (rows - 1) / 2;
                const d = Math.abs(r - mid) / (mid || 1);
                const span = Math.max(2, Math.round(cols * (1 - d * 0.8)));
                const st = ((cols - span) / 2) | 0;
                v = c >= st && c < st + span ? 1 : 0;
            } else if (pat === "PILLARS") v = c % 3 === 2 ? 0 : 1;
            else if (pat === "ZIGZAG") v = (c + r * 2) % 4 === 3 ? 0 : 1;
            else if (pat === "SWARM") {
                if (c >= ((cols + 1) / 2 | 0)) continue;
                v = rnd() < 0.72 ? 1 : 0;
                cells[r * cols + (cols - 1 - c)] = v; /* simetris */
            }
            cells[r * cols + c] = v;
        }
    }
    return cells;
}

/* ---------------------------------------------------------------
   Random level generator — DIJAMIN bisa diselesaikan.
   Validator: estimasi waktu formasi menyentuh dasar (tBottom)
   harus >= 1.35x waktu minimum menghabisi semua musuh (tClear).
   Jika gagal, parameter dilonggarkan (baris/kolom/drop/speed)
   sampai valid; fallback terakhir adalah konfigurasi aman.
---------------------------------------------------------------- */
function genLevel(n, seed) {
    const rnd = mulberry32((seed ^ Math.imul(n, 0x9e3779b9)) >>> 0);
    let rows = clamp(3 + ((n - 1) >> 1) + (rnd() < 0.35 ? 1 : 0), 3, MAXR);
    let cols = clamp(6 + (((n - 1) / 3) | 0) + (rnd() < 0.4 ? 1 : 0), 6, MAXC);
    let pat = PATTERNS[(rnd() * PATTERNS.length) | 0];
    let base = Math.min(24 + n * 2.4, 56);
    let descent = clamp(11 + n * 0.7, 11, 17);
    const bombInt = Math.max(1.3 - n * 0.055, 0.62);
    const bombV = Math.min(128 + n * 6, 205);
    const maxBombs = Math.min(2 + ((n / 3) | 0), 4);
    const top = 64;

    for (let guard = 0; guard < 40; guard++) {
        const cells = buildCells(pat, rows, cols, rnd);
        const count = cells.reduce((a, b) => a + b, 0);
        const formW = cols * CELL_W;
        const margin = W - 16 - formW;
        const bounceT = Math.max(margin / (base * 2.1), 0.3);
        const gap = SHIP_Y - 12 - (top + rows * CELL_H);
        const steps = Math.max(Math.floor(gap / descent), 1);
        const tBottom = (steps + 0.5) * bounceT;
        const tClear = count * (CD + 0.1) + 2;
        if (count >= 8 && tBottom >= tClear * 1.35) {
            return { n, rows, cols, cells, count, pat, top, left: (W - formW) / 2, base, descent, bombInt, bombV, maxBombs };
        }
        const m = guard % 4;
        if (m === 0 && rows > 3) rows--;
        else if (m === 1 && cols > 6) cols--;
        else if (m === 2 && descent > 10) descent -= 1.5;
        else { base = Math.max(base - 4, 20); pat = "CHECKER"; }
    }
    /* fallback aman (secara matematis selalu lolos validator) */
    const cells = buildCells("FULL", 4, 7, rnd);
    return { n, rows: 4, cols: 7, cells, count: 28, pat: "FULL", top, left: (W - 7 * CELL_W) / 2, base: 26, descent: 12, bombInt: 1.1, bombV: 140, maxBombs: 3 };
}

function fleetSpeed(lvl, aliveN) {
    return lvl.base * (1 + 2.2 * (1 - aliveN / lvl.count));
}

/* ================================================================ */
/* mount                                                            */
/* ================================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room && room.isHost);
    const myConn = isHost ? 0 : 1; /* identitas koneksi: 0 host, 1 guest */
    let roomData = (room && room.room) || null;
    let state = null;

    /* ---------------- UI (HUD + board) ---------------- */
    const TUT = `
      <p>Tembak formasi invaders, hindari bom. Level acak dijamin bisa diselesaikan &mdash; satu jenis musuh, tanpa bos.</p>
      <ul>
        <li><b>Gerak</b>: <kbd>&larr;</kbd><kbd>&rarr;</kbd> / <kbd>A</kbd><kbd>D</kbd>, gerakkan mouse di papan, atau sentuh &amp; geser di papan.</li>
        <li><b>Tembak</b>: <kbd>Spasi</kbd>, klik / tahan di papan, atau tombol <b>TEMBAK</b>.</li>
        <li><b>Pintasan</b>: <kbd>H</kbd> bantuan &middot; <kbd>C</kbd> cheat &middot; <kbd>P</kbd> jeda &middot; <kbd>R</kbd> ulang &middot; <kbd>Esc</kbd> tutup panel.</li>
        <li>Habiskan formasi untuk naik level. Formasi makin cepat saat musuh menipis. Jangan biarkan mereka mendarat.</li>
        <li><b>Duel (Bot / Multiplayer)</b>: giliran bergantian 18 detik, total 6 giliran, papan &amp; level sama. Giliran berakhir saat waktu habis atau terkena bom. Skor tertinggi menang. Undian menentukan siapa jalan dulu &amp; posisi pemain.</li>
        <li><b>Skor</b>: musuh +10, level selesai +50. Satu jenis musuh, tanpa bos.</li>
      </ul>`;

    root.innerHTML = `
<style>
.si-app{--paper:#fff;--line:#e7e9ef;--ink:#171a21;--mut:#7d8595;--p1:#4f7dff;--p2:#f5a524;--bad:#e5484d;--ok:#30a46c;--board:#0d1017;max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:10px;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.si-app [hidden]{display:none!important}
.si-app .si-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.si-app .si-spacer{flex:1 1 auto}
.si-app .si-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:11.5px;color:var(--mut);background:var(--paper);white-space:nowrap}
.si-app .si-chip b{color:var(--ink);font-size:13px;font-variant-numeric:tabular-nums}
.si-app .game-status{gap:7px;border-radius:999px;padding:5px 10px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
.si-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#c3c9d4;display:inline-block}
.si-app .game-status[data-state="play"] .game-status-dot{background:var(--ok)}
.si-app .game-status[data-state="wait"] .game-status-dot{background:var(--p2)}
.si-app .game-status[data-state="over"] .game-status-dot{background:var(--bad)}
.si-app .si-chip .dot{width:8px;height:8px;border-radius:50%;flex:none}
.si-app .si-chip.s0 .dot{background:var(--p1)}
.si-app .si-chip.s1 .dot{background:var(--p2)}
.si-app .si-chip.onturn{border-color:var(--ink)}
.si-app .si-chip.cheat{color:var(--bad);border-color:var(--bad);font-weight:700;letter-spacing:.06em}
.si-app .si-lives svg{display:inline-block;vertical-align:-2px;margin-left:2px}
.si-app .si-bar-chip{padding:7px 10px}
.si-app .si-bar{width:52px;height:4px;border-radius:2px;background:var(--line);overflow:hidden}
.si-app .si-bar i{display:block;height:100%;width:100%;background:var(--p1)}
.si-app .si-btn{appearance:none;border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:10px;padding:7px 12px;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s;font-family:inherit;min-height:36px}
.si-app .si-btn:hover{background:#f4f6fa}
.si-app .si-btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.si-app .si-btn.primary:hover{background:#242938}
.si-app .si-btn.ghost{padding:6px 10px;font-size:11.5px;color:var(--mut)}
.si-app .si-btn.on{border-color:var(--p1);color:var(--p1);background:#eef2ff}
.si-app .si-btn:disabled{opacity:.45;cursor:default}
.si-app .game-panel{position:relative;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--board);padding:0}
.si-app svg.board{display:block;height:100%;max-height:100%;width:auto;max-width:100%;aspect-ratio:560/520;margin:0 auto;touch-action:none;cursor:crosshair}
.si-app .si-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(10,13,20,.62);padding:14px}
.si-app .si-card{background:var(--paper);border-radius:16px;padding:18px;width:100%;max-width:460px;max-height:100%;overflow:hidden;display:flex;flex-direction:column;gap:12px;box-shadow:none;border:1px solid var(--line)}
.si-app .si-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.si-app .si-head h3{margin:0;font-size:17px}
.si-app .si-body{min-height:0;flex:1 1 auto;overflow:auto}
.si-app .si-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none}
.si-app .si-card p{margin:0 0 10px;font-size:13px;color:var(--mut);line-height:1.5}
.si-app .si-tut{border:1px solid var(--line);border-radius:12px;padding:12px;font-size:12.5px}
.si-app .si-tut h4{margin:0 0 8px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut)}
.si-app .si-tut ul{margin:0;padding-left:16px;display:grid;gap:5px;color:#3c4250;line-height:1.45}
.si-app kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:0 5px;font-size:11px;background:#f7f8fb;font-family:inherit}
.si-app .si-cheats{display:grid;gap:8px}
.si-app .si-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:12px;padding:9px 12px;font-size:13px;cursor:pointer}
.si-app .si-switch small{display:block;color:var(--mut);font-size:11px;margin-top:1px}
.si-app .si-switch input{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:999px;background:#dfe3ea;position:relative;cursor:pointer;transition:background .15s;flex:none;margin:0}
.si-app .si-switch input:checked{background:var(--ok)}
.si-app .si-switch input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
.si-app .si-switch input:checked::after{left:18px}
.si-app .si-touch{display:flex;gap:10px;flex:none}
.si-app .si-touch button{flex:1;height:58px;border-radius:14px;border:1px solid var(--line);background:var(--paper);font-size:17px;font-weight:700;color:var(--ink);touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;font-family:inherit}
.si-app .si-touch button:active{background:#eef1f6}
.si-app .si-touch .fire{color:var(--p1);border-color:var(--p1);letter-spacing:.08em;font-size:13px}
.si-app .si-note{font-size:10.5px;color:var(--mut)}

/* --- Batch 02 design polish --- */
.si-app :focus-visible,.si-app button:focus-visible{outline:2px solid var(--p1);outline-offset:2px}
.si-app .si-btn,.si-app .si-touch button{min-height:44px}
@media (pointer:coarse){.si-app button:not(:disabled){min-height:44px}}
@media (prefers-reduced-motion:reduce){.si-app *{animation:none!important;transition:none!important}}

/* --- layout contract (paling akhir, menimpa pointer:coarse) --- */
.si-app.game-fill{flex:1 1 auto;height:100%;min-height:0}
.si-app.game-fill > .game-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.si-app .si-hud .si-icon-btn{display:inline-flex;align-items:center;gap:6px}
.si-app .si-hud .si-icon-btn svg{flex:none;display:block}
.si-app .si-hud .si-btn{min-height:32px;padding:5px 9px;font-size:10px}
.si-app .si-head,.si-app .si-foot{flex:none}
.si-app .si-body{flex:1 1 auto;min-height:0;overflow:auto}
@media (max-width:640px){
  .si-app.game-fill > .game-panel[data-board]:not(:has(.si-ov:not([hidden]))){flex:1 1 auto;min-height:0;aspect-ratio:auto}
  .si-app.game-fill > .game-panel[data-board]:has(.si-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
  .si-app.game-fill > .game-panel[data-board]:has(.si-ov:not([hidden])) svg.board{height:auto;width:100%;max-height:100%}
  .si-app .si-hud{gap:5px}
  .si-app .si-hud .si-chip{padding:4px 6px;font-size:9px}
  .si-app .si-hud .si-chip[data-chip="best"],.si-app .si-hud .si-chip[data-chip="turn"]{display:none}
  .si-app .si-hud .si-btn{min-height:32px;padding:5px 8px;font-size:9px}
  .si-app .si-hud .si-btn-label,.si-app .si-hud .si-spacer{display:none}
  .si-app .si-ov{padding:8px}
  .si-app .si-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .si-app .si-body{scrollbar-width:none}
  .si-app .si-body::-webkit-scrollbar{display:none}
  .si-app .si-foot{margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
  .si-app .si-note{display:none}
}
</style>
<div class="game-app si-app game-fill" data-si>
  <div class="si-hud">
    <span class="game-status si-chip" data-state="idle"><i class="game-status-dot"></i><span data-status>Siap</span></span>
    <span class="si-chip s0" data-chip="s0"><i class="dot"></i><span data-hud="name0">Kamu</span>&nbsp;<b data-hud="score0">0</b><span class="si-lives" data-hud="lives0"></span></span>
    <span class="si-chip s1" data-chip="s1" hidden><i class="dot"></i><span data-hud="name1">Bot</span>&nbsp;<b data-hud="score1">0</b><span class="si-lives" data-hud="lives1"></span></span>
    <span class="si-chip">LV <b data-hud="level">1</b></span>
    <span class="si-chip" data-chip="best">BEST <b data-hud="best">0</b></span>
    <span class="si-chip" data-chip="turn" hidden>TURN <b data-hud="turn">1/6</b></span>
    <span class="si-chip si-bar-chip" data-chip="timer" hidden><span class="si-bar"><i data-hud="timerbar"></i></span></span>
    <span class="si-chip cheat" data-chip="cheat" hidden>CHEAT</span>
    <span class="si-spacer"></span>
    <button class="si-btn si-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="si-btn-label">Help</span></button>
    <button class="si-btn si-icon-btn" type="button" data-cheats data-only="offline" aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="si-btn-label">Cheats</span></button>
    <button class="si-btn si-icon-btn" type="button" data-pause data-only="offline" aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="si-btn-label">Pause</span></button>
    <button class="si-btn si-icon-btn" type="button" data-act="restart" aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="si-btn-label">Restart</span></button>
    <button class="si-btn si-icon-btn" type="button" data-ui="pad" aria-label="Toggle control pad" title="Control pad (B)">${iconSVG("gamepad2", { size: 14 })}<span class="si-btn-label">Pad</span></button>
    <button class="si-btn si-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="si-btn-label">Exit game</span></button>
  </div>

  <section class="game-panel" data-board>
    <svg class="board" viewBox="0 0 560 520" preserveAspectRatio="xMidYMid meet" aria-label="Papan Space Invaders">
      <g data-el="stars"></g>
      <line x1="14" y1="504" x2="546" y2="504" stroke="#ffffff18" stroke-width="2" stroke-dasharray="4 10"></line>
      <g data-el="fleet"></g>
      <g data-el="ships"></g>
      <g data-el="bullets"></g>
      <g data-el="bombs"></g>
      <g data-el="fx"></g>
      <text data-el="msg" x="280" y="240" text-anchor="middle" font-size="32" font-weight="800" letter-spacing="4" fill="#ffffff"></text>
      <text data-el="msg2" x="280" y="270" text-anchor="middle" font-size="13" letter-spacing="1" fill="#ffffffb0"></text>
    </svg>

    <div class="si-ov" data-ov="menu">
      <div class="si-card" role="dialog" aria-modal="true" aria-label="Mulai">
        <div class="si-head"><h3>Space Invaders</h3></div>
        <div class="si-body si-tut">
          <p>Pilih mode. Level dibangkitkan acak dan dijamin bisa diselesaikan.</p>
          <ul>
            <li><b>Solo</b>: habiskan formasi, naik level, skor tertinggi disimpan.</li>
            <li><b>Duel</b>: giliran bergantian 18 detik, 6 giliran, skor tertinggi menang.</li>
            <li>Tekan <kbd>H</kbd> untuk bantuan lengkap.</li>
          </ul>
        </div>
        <div class="si-foot">
          <button class="si-btn primary" type="button" data-act="start-solo">Solo</button>
          <button class="si-btn" type="button" data-act="start-bot">Duel vs Bot</button>
          <button class="si-btn ghost" type="button" data-help>Bantuan</button>
        </div>
      </div>
    </div>

    <div class="si-ov" data-ov="lobby" hidden>
      <div class="si-card" role="dialog" aria-modal="true" aria-label="Duel multiplayer">
        <div class="si-head"><h3>Duel Multiplayer</h3></div>
        <div class="si-body si-tut">
          <p data-el="lobbyNote">Posisi pemain (P1/P2) dan giliran pertama diundi acak saat pertandingan dimulai.</p>
        </div>
        <div class="si-foot">
          <button class="si-btn primary" type="button" data-act="start-duel" data-el="lobbyStart">Mulai pertandingan</button>
          <button class="si-btn ghost" type="button" data-help>Bantuan</button>
        </div>
      </div>
    </div>

    <div class="si-ov si-help" data-ov="help" hidden>
      <div class="si-card" role="dialog" aria-modal="true" aria-label="Cara main">
        <div class="si-head"><h3>Cara main</h3><button class="si-btn ghost" type="button" data-help-close aria-label="Tutup">${iconSVG("x", { size: 14 })}</button></div>
        <div class="si-body si-tut">${TUT}</div>
        <div class="si-foot"><span class="si-note">Tekan H untuk membuka lagi</span><button class="si-btn primary" type="button" data-help-close>Mengerti</button></div>
      </div>
    </div>

    <div class="si-ov" data-ov="cheat" hidden>
      <div class="si-card" role="dialog" aria-modal="true" aria-label="Cheat">
        <div class="si-head"><h3>Cheat</h3><button class="si-btn ghost" type="button" data-act="cheat-close" aria-label="Tutup">${iconSVG("x", { size: 14 })}</button></div>
        <div class="si-body">
          <p>Skor terbaik tidak disimpan saat cheat aktif. Tidak tersedia di multiplayer.</p>
          <div class="si-cheats">
            <label class="si-switch"><span>God mode<small>Kebal terhadap bom &amp; pendaratan</small></span><input type="checkbox" data-cheat="god"></label>
            <label class="si-switch"><span>Rapid fire<small>Tembak 3x lebih cepat</small></span><input type="checkbox" data-cheat="rapid"></label>
            <label class="si-switch"><span>Slow motion<small>Armada bergerak 60% lebih lambat</small></span><input type="checkbox" data-cheat="slow"></label>
            <label class="si-switch"><span>Tanpa bom<small>Musuh berhenti menjatuhkan bom</small></span><input type="checkbox" data-cheat="nobombs"></label>
            <label class="si-switch"><span>Skor x2<small>Semua poin dikalikan dua</small></span><input type="checkbox" data-cheat="x2"></label>
          </div>
        </div>
        <div class="si-foot">
          <button class="si-btn" type="button" data-act="cheat-life">+1 nyawa</button>
          <button class="si-btn" type="button" data-act="cheat-skip">Lewati level</button>
          <button class="si-btn ghost" type="button" data-act="cheat-reset">Matikan semua</button>
          <button class="si-btn primary" type="button" data-act="cheat-close">Tutup</button>
        </div>
      </div>
    </div>

    <div class="si-ov" data-ov="pause" hidden>
      <div class="si-card" role="dialog" aria-modal="true" aria-label="Jeda">
        <div class="si-head"><h3>Jeda</h3></div>
        <div class="si-body"><p>Papan, bot, dan timer dibekukan. Tekan <kbd>P</kbd>, <kbd>Esc</kbd>, atau Lanjut untuk bermain lagi.</p></div>
        <div class="si-foot"><button class="si-btn primary" type="button" data-act="resume">Lanjut</button></div>
      </div>
    </div>

    <div class="si-ov" data-ov="over" hidden>
      <div class="si-card" role="dialog" aria-modal="true" aria-label="Hasil">
        <div class="si-head"><h3 data-el="ovTitle">Game over</h3></div>
        <div class="si-body"><p data-el="ovSub"></p></div>
        <div class="si-foot">
          <button class="si-btn primary" type="button" data-act="restart" data-el="ovAgain">Main lagi</button>
          <button class="si-btn" type="button" data-act="rematch" data-el="ovRematch" hidden>Minta rematch</button>
          <button class="si-btn" type="button" data-act="menu" data-el="ovMenu">Menu</button>
        </div>
      </div>
    </div>
  </section>

  <div class="si-touch" data-chip="touch" hidden>
    <button type="button" data-hold="l" aria-label="Gerak kiri">&#9664;</button>
    <button type="button" data-hold="r" aria-label="Gerak kanan">&#9654;</button>
    <button type="button" class="fire" data-hold="f" aria-label="Tembak">TEMBAK</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const svg = $("svg.board");
    const starsG = $('[data-el="stars"]'), fleetG = $('[data-el="fleet"]'), shipsG = $('[data-el="ships"]');
    const bulletsG = $('[data-el="bullets"]'), bombsG = $('[data-el="bombs"]'), fxG = $('[data-el="fx"]');
    const msgEl = $('[data-el="msg"]'), msg2El = $('[data-el="msg2"]');
    const statusWrap = $(".game-status"), statusEl = $("[data-status]");
    const btnPause = $("[data-pause]"), btnCheats = $("[data-cheats]");
    const labelPause = btnPause && btnPause.querySelector(".si-btn-label");
    const labelCheats = btnCheats && btnCheats.querySelector(".si-btn-label");
    const hud = {
        name: [$('[data-hud="name0"]'), $('[data-hud="name1"]')],
        score: [$('[data-hud="score0"]'), $('[data-hud="score1"]')],
        lives: [$('[data-hud="lives0"]'), $('[data-hud="lives1"]')],
        level: $('[data-hud="level"]'), best: $('[data-hud="best"]'),
        turn: $('[data-hud="turn"]'), timerbar: $('[data-hud="timerbar"]'),
    };
    const chip = {
        s: [$('[data-chip="s0"]'), $('[data-chip="s1"]')],
        best: $('[data-chip="best"]'), turn: $('[data-chip="turn"]'),
        cheat: $('[data-chip="cheat"]'), timer: $('[data-chip="timer"]'), touch: $('[data-chip="touch"]'),
    };
    const ov = {
        menu: $('[data-ov="menu"]'), lobby: $('[data-ov="lobby"]'), help: $('[data-ov="help"]'),
        cheat: $('[data-ov="cheat"]'), pause: $('[data-ov="pause"]'), over: $('[data-ov="over"]'),
    };
    const lobbyStart = $('[data-el="lobbyStart"]'), lobbyNote = $('[data-el="lobbyNote"]');
    const ovTitle = $('[data-el="ovTitle"]'), ovSub = $('[data-el="ovSub"]');
    const ovAgain = $('[data-el="ovAgain"]'), ovRematch = $('[data-el="ovRematch"]'), ovMenu = $('[data-el="ovMenu"]');

    /* ---------------- DOM pools ---------------- */
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };
    const ACC = ["#4f7dff", "#f5a524"];
    for (let i = 0; i < 26; i++) {
        starsG.appendChild(mk("circle", {
            cx: (4 + Math.random() * (W - 8)).toFixed(1), cy: (4 + Math.random() * (H - 8)).toFixed(1),
            r: (0.6 + Math.random() * 0.9).toFixed(2), fill: "#ffffff", opacity: (0.05 + Math.random() * 0.13).toFixed(2),
        }));
    }
    const fleetNodes = [];
    for (let i = 0; i < MAXR * MAXC; i++) {
        const g = mk("g", {});
        g.appendChild(mk("path", { d: ENEMY_D, fill: "#e8eaf0" }));
        g.style.display = "none";
        fleetG.appendChild(g);
        fleetNodes.push(g);
    }
    const shipNodes = ACC.map((c) => {
        const g = mk("g", {});
        g.appendChild(mk("polygon", { points: "18,1 26,11 35,11 35,21 1,21 1,11 10,11", fill: c }));
        shipsG.appendChild(g);
        return g;
    });
    const bulletPool = [], bombPool = [], fxPool = [];
    function ensurePool(pool, g, n, make) {
        while (pool.length < n) { const el = make(); g.appendChild(el); pool.push(el); }
        for (let i = n; i < pool.length; i++) pool[i].style.display = "none";
    }

    /* ---------------- runtime ---------------- */
    let raf = 0, lastT = 0, lastRenderT = 0, pubAcc = 0, pubForce = false, recvT = 0, bombT = 0.9;
    let paused = false, helpOpen = false, cheatOpen = false;

    /* Pause membekukan tick/bot; penanda Date.now() & performance.now()
       digeser saat resume supaya timer tidak meloncat. */
    let clockShift = 0, perfShift = 0, pauseWallAt = 0, pausePerfAt = 0;
    const clockNow = () => Date.now() - clockShift;
    const perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) - perfShift;

    /* Bantuan internal: tampil sekali pada launch pertama. */
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("spaceInvadersHelpSeen") === "1"; } catch (e) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("spaceInvadersHelpSeen", "1"); } catch (e) { /* storage blocked */ }
    }

    let touchOn = false;
    try { touchOn = window.matchMedia("(pointer: coarse)").matches; } catch (e) { }
    const inp = { l: false, r: false, f: false, tx: null };
    let inputDirty = false, lastSend = 0;
    const keys = [{ l: false, r: false, f: false }, { l: false, r: false, f: false }];
    const cd = [0, 0], target = [null, null];
    const cheats = { god: false, rapid: false, slow: false, nobombs: false, x2: false };
    const fx = [];
    const view = { ox: 0, oy: 0, x: [W / 2, W / 2], init: false };
    const botMem = { t: 0, err: 0, errT: 0 };
    const lastLives = [-1, -1];
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { }

    const anyCheats = () => cheats.god || cheats.rapid || cheats.slow || cheats.nobombs || cheats.x2;
    const mySlot = () => (state ? (online ? state.control[isHost ? "host" : "guest"] : 0) : 0);
    const cellX = (L, c, ox) => L.left + c * CELL_W + CELL_W / 2 + ox;
    const cellY = (L, r, oy) => L.top + r * CELL_H + CELL_H / 2 + oy;
    const simPaused = () => paused || (!online && (helpOpen || cheatOpen));

    /* ---------------- state & flow ---------------- */
    function makeSlots(m) {
        return [
            { name: m === "solo" ? playerName : "Player 1", score: 0, lives: START_LIVES, x: W / 2, invuln: 0, out: false },
            { name: m === "bot" ? "Bot" : "Player 2", score: 0, lives: START_LIVES, x: W / 2, invuln: 0, out: false },
        ];
    }
    function baseState(m, phase) {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const lvl = genLevel(1, seed);
        return {
            v: 1, mode: m, phase, seed, level: 1, lvl,
            ox: 0, oy: 0, dir: 1, aliveN: lvl.count,
            slots: makeSlots(m), control: { host: 0, guest: 1 },
            first: 0, turnIdx: 0, turnT: TURN_TIME, active: 0,
            bullets: [], bombs: [], winner: -1, reason: "", cheated: false,
            msg: "", msg2: "", msgT: 0,
        };
    }
    function setPhase(p) { state.phase = p; pubForce = true; }
    function setMsg(m, m2, t) { state.msg = m; state.msg2 = m2 || ""; state.msgT = t; }
    function regenLevel() {
        state.lvl = genLevel(state.level, state.seed);
        state.aliveN = state.lvl.count;
        state.ox = 0; state.oy = 0; state.dir = 1;
        state.bullets.length = 0; state.bombs.length = 0;
        bombT = 0.9;
    }
    function turnLabel(s) {
        if (state.mode === "bot") return s === 0 ? "GILIRAN KAMU" : "GILIRAN BOT";
        return "GILIRAN P" + (s + 1) + (s === mySlot() ? " (KAMU)" : "");
    }
    function levelIntro() {
        setPhase("intro");
        setMsg("LEVEL " + state.level, state.lvl.pat + " \u00b7 " + state.aliveN + " musuh", 1.2);
    }
    function startTurn() {
        state.active = (state.first + state.turnIdx) % 2;
        state.turnT = TURN_TIME;
        state.slots[state.active].invuln = 1.2;
        state.bullets.length = 0; state.bombs.length = 0;
        keys[0] = { l: false, r: false, f: false };
        keys[1] = { l: false, r: false, f: false };
        target[0] = null; target[1] = null;
        bombT = 0.8;
        if ((!online || isHost) && state.active === mySlot()) {
            keys[state.active] = { l: inp.l, r: inp.r, f: inp.f };
            target[state.active] = inp.tx;
        }
        setPhase("intro");
        setMsg(turnLabel(state.active), "Level " + state.level + " \u00b7 " + TURN_TIME + " detik", 1.2);
    }
    function startMatch(m) {
        if (paused) setPaused(false);
        state = baseState(m, "menu");
        if (m !== "solo") {
            state.slots[0].x = W * 0.35;
            state.slots[1].x = W * 0.65;
            /* undian posisi pemain (multiplayer) */
            if (m === "duel") state.control = Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 };
            /* undian siapa jalan duluan */
            state.first = (Math.random() * 2) | 0;
            state.active = state.first;
        }
        state.cheated = !online && anyCheats();
        paused = false; helpOpen = false; cheatOpen = false;
        keys[0] = { l: false, r: false, f: false };
        keys[1] = { l: false, r: false, f: false };
        cd[0] = 0; cd[1] = 0; target[0] = null; target[1] = null;
        inp.l = false; inp.r = false; inp.f = false; inp.tx = null;
        bombT = 0.9; fx.length = 0; view.init = false;
        if (m === "solo") levelIntro();
        else {
            setPhase("flip");
            const who = m === "bot" ? (state.first === 0 ? "Kamu" : "Bot") : "P" + (state.first + 1);
            setMsg("UNDIAN", who + " jalan dulu" + (m === "duel" ? " \u00b7 Kamu P" + (mySlot() + 1) : ""), 1.6);
        }
        pubForce = true;
    }
    function addScore(s, basePts) {
        const mult = !online && cheats.x2 ? 2 : 1;
        state.slots[s].score += basePts * mult;
        return basePts * mult;
    }
    function finish(reason) {
        setPhase("over");
        state.reason = reason;
        state.msgT = 0;
        const a = state.slots[0], b = state.slots[1];
        if (state.mode === "solo") state.winner = a.lives > 0 ? 0 : -1;
        else if (a.out && !b.out) state.winner = 1;
        else if (b.out && !a.out) state.winner = 0;
        else if (a.score !== b.score) state.winner = a.score > b.score ? 0 : 1;
        else if (a.lives !== b.lives) state.winner = a.lives > b.lives ? 0 : 1;
        else state.winner = 2;
        if (!online && state.mode === "solo" && !state.cheated && a.score > best) {
            best = a.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
        pubForce = true;
    }
    function endTurn() {
        state.turnIdx++;
        if (state.turnIdx >= TURNS_TOTAL || state.slots[0].out || state.slots[1].out) {
            finish("Pertandingan selesai (" + TURNS_TOTAL + " giliran).");
            return;
        }
        setPhase("turnend");
        setMsg("GANTI GILIRAN", turnLabel((state.first + state.turnIdx) % 2), 0.9);
    }
    function poof(x, y, c) { fx.push({ x, y, t: 0, c }); if (fx.length > 24) fx.shift(); }
    function hitPlayer(s) {
        const sl = state.slots[s];
        sl.lives--;
        poof(sl.x, SHIP_Y + 10, "#ff6b6b");
        if (state.mode === "solo") {
            if (sl.lives <= 0) finish("Pesawatmu hancur.");
            else sl.invuln = 1.8;
        } else if (sl.lives <= 0) {
            sl.out = true;
            finish((state.mode === "bot" ? (s === 0 ? "Kamu" : "Bot") : "P" + (s + 1)) + " kehabisan nyawa.");
        } else {
            sl.invuln = 0;
            endTurn();
        }
        pubForce = true;
    }
    function breach(s) {
        state.oy = 0;
        poof(W / 2, SHIP_Y - 24, "#ff6b6b");
        if (!online && cheats.god) { setMsg("MEREKA MENEROBOS", "God mode: formasi kembali ke atas", 1.0); return; }
        hitPlayer(s);
        if (state.phase === "play") setMsg("MEREKA MENEROBOS", "Formasi kembali ke atas", 1.0);
    }
    function clearLevel() {
        const pts = addScore(state.active, 50);
        state.level++;
        regenLevel();
        setMsg("LEVEL CLEAR +" + pts, "Level " + state.level + " \u00b7 " + state.lvl.pat, 1.1);
    }
    function killInvader(r, c) {
        const L = state.lvl;
        L.cells[r * L.cols + c] = 0;
        state.aliveN--;
        addScore(state.active, 10);
        poof(cellX(L, c, state.ox), cellY(L, r, state.oy), "#fde68a");
        if (state.aliveN <= 0) { clearLevel(); return true; }
        return false;
    }
    function spawnBullet(s) {
        state.bullets.push({ x: state.slots[s].x, y: SHIP_Y - 12, o: s });
    }
    function dropBomb() {
        const L = state.lvl, cands = [];
        for (let c = 0; c < L.cols; c++)
            for (let r = L.rows - 1; r >= 0; r--)
                if (L.cells[r * L.cols + c]) { cands.push([r, c]); break; }
        if (!cands.length) return;
        const p = cands[(Math.random() * cands.length) | 0];
        state.bombs.push({ x: cellX(L, p[1], state.ox), y: cellY(L, p[0], state.oy) + 10 });
    }

    /* ---------------- actions (template) ---------------- */
    function applyAction(action, actorConn) {
        if (!state || !action || typeof action !== "object") return;
        const t = action.t;
        if (t === "input") {
            const slot = state.control[actorConn === 0 ? "host" : "guest"];
            if (state.phase !== "play" || slot !== state.active) return;
            keys[slot] = { l: !!action.l, r: !!action.r, f: !!action.f };
            target[slot] = typeof action.tx === "number" ? clamp(action.tx, 22, W - 22) : null;
            return;
        }
        if (t === "start") {
            if (actorConn !== 0) return;
            const m = online ? "duel" : action.mode === "solo" ? "solo" : "bot";
            startMatch(m);
            return;
        }
        if (t === "rematch") {
            if (online && state.phase === "over") startMatch("duel");
            return;
        }
        if (online) return; /* cheat hanya offline */
        if (t === "cheat") {
            state.cheated = state.cheated || anyCheats();
            if (cheats.nobombs) state.bombs.length = 0;
            root.querySelectorAll("[data-cheat]").forEach((i) => { i.checked = cheats[i.dataset.cheat]; });
            pubForce = true;
            return;
        }
        if (t === "cheat-life") {
            const sl = state.slots[mySlot()];
            sl.lives = Math.min(sl.lives + 1, 5);
            state.cheated = true; pubForce = true;
            return;
        }
        if (t === "cheat-skip") {
            if (state.phase === "menu" || state.phase === "over") return;
            state.level++;
            regenLevel();
            state.cheated = true;
            setMsg("LEVEL " + state.level, state.lvl.pat + " \u00b7 " + state.aliveN + " musuh", 1.0);
            return;
        }
        if (t === "cheat-reset") {
            for (const k in cheats) cheats[k] = false;
            root.querySelectorAll("[data-cheat]").forEach((i) => { i.checked = false; });
            pubForce = true;
        }
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, myConn);
    }
    function publish() {
        render();
        if (online && isHost && state) {
            const snap = JSON.parse(JSON.stringify(state, (k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)));
            room.publishState(snap).catch(console.warn);
        }
    }

    /* ---------------- bot ---------------- */
    function botThink(dt) {
        const sl = state.slots[1], L = state.lvl;
        botMem.errT -= dt;
        if (botMem.errT <= 0) { botMem.errT = 0.35; botMem.err = (Math.random() * 2 - 1) * 10; }
        botMem.t -= dt;
        if (botMem.t > 0) return;
        botMem.t = 0.1 + Math.random() * 0.08;
        /* hindari bom */
        for (const b of state.bombs) {
            if (b.y > H * 0.42 && Math.abs(b.x - sl.x) < 30) {
                let d = sl.x >= b.x ? 1 : -1;
                if (sl.x > W - 60) d = -1;
                if (sl.x < 60) d = 1;
                keys[1] = { l: d < 0, r: d > 0, f: true };
                target[1] = null;
                return;
            }
        }
        /* bidik kolom terbawah terdekat, dengan sedikit error */
        const travel = (SHIP_Y - 150) / BULLET_V;
        const spd = fleetSpeed(L, state.aliveN);
        let bx = sl.x, bd = Infinity;
        for (let c = 0; c < L.cols; c++) {
            for (let r = L.rows - 1; r >= 0; r--) {
                if (!L.cells[r * L.cols + c]) continue;
                const px = cellX(L, c, state.ox) + state.dir * spd * travel;
                const d = Math.abs(px - sl.x);
                if (d < bd) { bd = d; bx = px; }
                break;
            }
        }
        const aim = clamp(bx + botMem.err, 22, W - 22);
        keys[1] = { l: sl.x > aim + 5, r: sl.x < aim - 5, f: true };
        target[1] = null;
    }

    /* ---------------- simulation (host / offline) ---------------- */
    function updateBullets(dt) {
        const L = state.lvl;
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            let rem = BULLET_V * dt, dead = false;
            while (rem > 0 && !dead) {
                const h = Math.min(rem, 8);
                b.y -= h; rem -= h;
                if (b.y < 6) { dead = true; break; }
                for (let r = 0; r < L.rows && !dead; r++) {
                    for (let c = 0; c < L.cols; c++) {
                        if (!L.cells[r * L.cols + c]) continue;
                        const cx = cellX(L, c, state.ox), cy = cellY(L, r, state.oy);
                        if (b.x > cx - 13.5 && b.x < cx + 13.5 && b.y < cy + 9 && b.y + 10 > cy - 9) {
                            if (killInvader(r, c)) return; /* level regen: array peluru dikosongkan */
                            dead = true;
                            break;
                        }
                    }
                }
            }
            if (dead) state.bullets.splice(i, 1);
        }
    }
    function updateBombs(dt) {
        const L = state.lvl, sl = state.slots[state.active];
        for (let i = state.bombs.length - 1; i >= 0; i--) {
            const b = state.bombs[i];
            let rem = L.bombV * dt, dead = false;
            while (rem > 0 && !dead) {
                const h = Math.min(rem, 8);
                b.y += h; rem -= h;
                if (b.y > H - 12) { dead = true; break; }
                if (sl.invuln <= 0 && !(!online && cheats.god) &&
                    b.x > sl.x - 16 && b.x < sl.x + 16 && b.y + 10 > SHIP_Y + 2 && b.y < SHIP_Y + 21) {
                    dead = true;
                    hitPlayer(state.active);
                    break;
                }
            }
            if (dead) state.bombs.splice(i, 1);
            if (state.phase !== "play") return;
        }
    }
    function simulate(dt) {
        if (!state) return;
        if (state.msgT > 0) state.msgT -= dt;
        const ph = state.phase;
        if (ph === "flip" && state.msgT <= 0) startTurn();
        else if (ph === "intro" && state.msgT <= 0) setPhase("play");
        else if (ph === "turnend" && state.msgT <= 0) startTurn();
        if (state.phase !== "play") return;

        const s = state.active, sl = state.slots[s], L = state.lvl;
        if (state.mode === "bot" && s === 1) botThink(dt);

        /* gerak pemain */
        const k = keys[s];
        let mv = 0;
        if (k.l) mv--;
        if (k.r) mv++;
        if (mv) { sl.x = clamp(sl.x + mv * PLAYER_SPEED * dt, 22, W - 22); target[s] = null; }
        else if (target[s] != null) {
            const d = target[s] - sl.x, step = PLAYER_SPEED * dt;
            sl.x += Math.abs(d) <= step ? d : (d > 0 ? step : -step);
        }
        /* tembak */
        cd[s] -= dt;
        if (k.f && cd[s] <= 0) {
            cd[s] = !online && cheats.rapid ? CD_RAPID : CD;
            spawnBullet(s);
        }
        /* armada */
        const spd = fleetSpeed(L, state.aliveN) * (!online && cheats.slow ? 0.4 : 1);
        state.ox += state.dir * spd * dt;
        let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let r = 0; r < L.rows; r++) {
            for (let c = 0; c < L.cols; c++) {
                if (!L.cells[r * L.cols + c]) continue;
                const cx = cellX(L, c, state.ox), cy = cellY(L, r, state.oy);
                if (cx - ENEMY_HW < minX) minX = cx - ENEMY_HW;
                if (cx + ENEMY_HW > maxX) maxX = cx + ENEMY_HW;
                if (cy + ENEMY_HH > maxY) maxY = cy + ENEMY_HH;
            }
        }
        if (state.dir > 0 && maxX >= W - 8) { state.dir = -1; state.oy += L.descent; }
        else if (state.dir < 0 && minX <= 8) { state.dir = 1; state.oy += L.descent; }
        if (maxY >= SHIP_Y - 10) {
            breach(s);
            if (state.phase !== "play") return;
        }
        /* bom */
        if (!online && cheats.nobombs) state.bombs.length = 0;
        else {
            bombT -= dt;
            if (bombT <= 0 && state.bombs.length < L.maxBombs && state.aliveN > 0) {
                dropBomb();
                bombT = L.bombInt * (0.55 + Math.random() * 0.9);
            }
        }
        updateBombs(dt);
        if (state.phase !== "play") return;
        updateBullets(dt);
        if (state.phase !== "play") return;
        /* invulnerability & timer giliran */
        for (let i = 0; i < 2; i++) if (state.slots[i].invuln > 0) state.slots[i].invuln -= dt;
        if (state.mode !== "solo") {
            state.turnT -= dt;
            if (state.turnT <= 0) endTurn();
        }
    }

    /* ---------------- render ---------------- */
    function livesHtml(n, acc) {
        let h = "";
        for (let i = 0; i < Math.max(n, 0); i++)
            h += '<svg viewBox="0 0 36 22" width="15" height="10" aria-hidden="true"><polygon points="18,1 26,11 35,11 35,21 1,21 1,11 10,11" fill="' + acc + '"></polygon></svg>';
        return h || '<span style="opacity:.4">&mdash;</span>';
    }
    function dispName(s) {
        if (state.mode === "solo") return playerName;
        if (state.mode === "bot") return s === 0 ? "Kamu" : "Bot";
        return "P" + (s + 1) + (s === mySlot() ? " (kamu)" : "");
    }
    function statusInfo() {
        const ph = state.phase;
        if (simPaused() && ph !== "menu" && ph !== "lobby" && ph !== "over") return ["Jeda", "wait"];
        if (ph === "menu") return ["Siap", "idle"];
        if (ph === "lobby") return ["Menunggu", "wait"];
        if (ph === "flip") return ["Undian\u2026", "wait"];
        if (ph === "over") {
            if (state.mode === "solo") return [state.winner === 0 ? "Selesai" : "Game over", "over"];
            return [state.winner === 2 ? "Seri" : (state.mode === "bot" ? (state.winner === 0 ? "Kamu menang" : "Bot menang") : "P" + (state.winner + 1) + " menang"), "over"];
        }
        if (state.mode === "solo") return ["Level " + state.level, "play"];
        const who = state.active === mySlot() ? "Giliranmu" : "Giliran " + (state.mode === "bot" ? "bot" : "P" + (state.active + 1));
        return [who + " \u00b7 " + Math.max(Math.ceil(state.turnT), 0) + "s", "play"];
    }
    function render() {
        if (labelPause) labelPause.textContent = paused ? "Resume" : "Pause";
        if (btnPause) {
            btnPause.setAttribute("aria-label", paused ? "Resume" : "Pause");
            btnPause.setAttribute("title", (paused ? "Resume" : "Pause") + " (P)");
        }
        if (btnCheats) btnCheats.classList.toggle("on", anyCheats());
        if (labelCheats) labelCheats.textContent = anyCheats() ? "Cheats!" : "Cheats";
        if (!state) {
            statusEl.textContent = "Menghubungkan\u2026";
            statusWrap.setAttribute("data-state", "wait");
            for (const k in ov) ov[k].hidden = k !== (helpOpen ? "help" : "lobby");
            lobbyStart.hidden = true;
            lobbyNote.textContent = "Menunggu host menyiapkan pertandingan\u2026";
            return;
        }
        const now = perfNow();
        const dtR = lastRenderT ? clamp((now - lastRenderT) / 1000, 0, 0.05) : 0.016;
        lastRenderT = now;
        const L = state.lvl;
        const guest = online && !isHost;
        const ex = guest ? clamp((now - recvT) / 1000, 0, 0.25) : 0;
        const spd = fleetSpeed(L, state.aliveN);
        const tOx = state.ox + state.dir * spd * ex;
        if (!view.init) {
            view.ox = tOx; view.oy = state.oy;
            view.x[0] = state.slots[0].x; view.x[1] = state.slots[1].x;
            view.init = true;
        }
        const sm = guest ? 1 - Math.exp(-14 * dtR) : 1;
        view.ox += (tOx - view.ox) * sm;
        view.oy += (state.oy - view.oy) * sm;
        view.x[0] += (state.slots[0].x - view.x[0]) * sm;
        view.x[1] += (state.slots[1].x - view.x[1]) * sm;

        /* formasi musuh (satu jenis, tanpa bos) */
        const total = L.rows * L.cols;
        for (let i = 0; i < fleetNodes.length; i++) {
            const node = fleetNodes[i];
            if (i < total && L.cells[i]) {
                const r = (i / L.cols) | 0, c = i % L.cols;
                node.setAttribute("transform", "translate(" + (cellX(L, c, view.ox) - ENEMY_HW).toFixed(1) + " " + (cellY(L, r, view.oy) - ENEMY_HH).toFixed(1) + ")");
                node.style.display = "";
            } else node.style.display = "none";
        }
        /* pesawat */
        const duel = state.mode !== "solo";
        for (let s = 0; s < 2; s++) {
            const node = shipNodes[s];
            if (!duel && s === 1) { node.style.display = "none"; continue; }
            node.style.display = "";
            node.setAttribute("transform", "translate(" + (view.x[s] - 18).toFixed(1) + " " + SHIP_Y + ")");
            const sl = state.slots[s];
            let op = 1;
            if (duel && s !== state.active) op = 0.22;
            else if (sl.invuln > 0 && state.phase === "play") op = Math.floor(sl.invuln * 12) % 2 ? 0.25 : 1;
            if (sl.out) op = 0.1;
            node.style.opacity = String(op);
        }
        /* peluru & bom (guest: ekstrapolasi posisi antar-snapshot) */
        ensurePool(bulletPool, bulletsG, state.bullets.length, () => mk("rect", { x: 0, y: 0, width: 3, height: 10, rx: 1.5 }));
        for (let i = 0; i < state.bullets.length; i++) {
            const b = state.bullets[i], el = bulletPool[i];
            el.setAttribute("transform", "translate(" + (b.x - 1.5).toFixed(1) + " " + (b.y - BULLET_V * ex).toFixed(1) + ")");
            el.setAttribute("fill", ACC[b.o] || ACC[0]);
            el.style.display = "";
        }
        ensurePool(bombPool, bombsG, state.bombs.length, () => mk("rect", { x: 0, y: 0, width: 4, height: 10, rx: 2, fill: "#ff6b6b" }));
        for (let i = 0; i < state.bombs.length; i++) {
            const b = state.bombs[i], el = bombPool[i];
            el.setAttribute("transform", "translate(" + (b.x - 2).toFixed(1) + " " + (b.y + L.bombV * ex).toFixed(1) + ")");
            el.style.display = "";
        }
        /* efek */
        for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dtR; if (fx[i].t >= 0.32) fx.splice(i, 1); }
        ensurePool(fxPool, fxG, fx.length, () => mk("circle", { fill: "none", "stroke-width": 3 }));
        for (let i = 0; i < fx.length; i++) {
            const p = fx[i], el = fxPool[i], k = p.t / 0.32;
            el.setAttribute("cx", p.x.toFixed(1));
            el.setAttribute("cy", p.y.toFixed(1));
            el.setAttribute("r", (4 + 14 * k).toFixed(1));
            el.setAttribute("stroke", p.c);
            el.setAttribute("opacity", (1 - k).toFixed(2));
            el.style.display = "";
        }
        /* banner */
        const mt = state.msgT - ex;
        if (mt > 0 && state.msg) {
            msgEl.textContent = state.msg;
            msg2El.textContent = state.msg2;
            const op = clamp(mt / 0.35, 0, 1).toFixed(2);
            msgEl.setAttribute("opacity", op);
            msg2El.setAttribute("opacity", op);
        } else {
            msgEl.textContent = "";
            msg2El.textContent = "";
        }
        /* HUD */
        for (let s = 0; s < 2; s++) {
            hud.name[s].textContent = dispName(s);
            hud.score[s].textContent = String(state.slots[s].score);
            if (lastLives[s] !== state.slots[s].lives) {
                lastLives[s] = state.slots[s].lives;
                hud.lives[s].innerHTML = livesHtml(state.slots[s].lives, ACC[s]);
            }
            chip.s[s].classList.toggle("onturn", duel && s === state.active && state.phase !== "over");
        }
        chip.s[1].hidden = !duel;
        chip.best.hidden = !(state.mode === "solo" || (!online && state.phase === "menu"));
        chip.turn.hidden = !duel;
        chip.timer.hidden = !duel || state.phase === "over" || state.phase === "lobby";
        chip.cheat.hidden = !state.cheated;
        chip.touch.hidden = !touchOn;
        hud.level.textContent = String(state.level);
        hud.best.textContent = String(best);
        hud.turn.textContent = Math.min(state.turnIdx + 1, TURNS_TOTAL) + "/" + TURNS_TOTAL;
        hud.timerbar.style.width = (clamp(state.turnT / TURN_TIME, 0, 1) * 100).toFixed(1) + "%";
        hud.timerbar.style.background = ACC[state.active];
        const st = statusInfo();
        statusEl.textContent = st[0];
        statusWrap.setAttribute("data-state", st[1]);
        /* overlay */
        let openOv = null;
        if (helpOpen) openOv = "help";
        else if (cheatOpen) openOv = "cheat";
        else if (paused && state.phase !== "menu" && state.phase !== "lobby" && state.phase !== "over") openOv = "pause";
        else if (state.phase === "menu") openOv = "menu";
        else if (state.phase === "lobby") openOv = "lobby";
        else if (state.phase === "over") openOv = "over";
        for (const k in ov) ov[k].hidden = k !== openOv;
        if (openOv === "lobby") {
            lobbyStart.hidden = !isHost;
            lobbyNote.textContent = isHost
                ? "Posisi pemain (P1/P2) dan giliran pertama diundi acak saat pertandingan dimulai."
                : "Menunggu host memulai pertandingan. Posisi & giliran pertama diundi acak.";
        }
        if (openOv === "over") {
            const a = state.slots[0], b = state.slots[1];
            if (state.mode === "solo") {
                ovTitle.textContent = state.winner === 0 ? "Selesai!" : "Game over";
                ovSub.textContent = state.reason + " Skor: " + a.score + " \u00b7 Level " + state.level + " \u00b7 Terbaik " + best + (state.cheated ? " \u00b7 (cheat aktif: skor tidak disimpan)" : "");
            } else if (state.mode === "bot") {
                ovTitle.textContent = state.winner === 2 ? "Seri" : state.winner === 0 ? "Kamu menang!" : "Bot menang";
                ovSub.textContent = state.reason + " Kamu " + a.score + " \u00b7 Bot " + b.score + (state.cheated ? " \u00b7 (cheat aktif)" : "");
            } else {
                ovTitle.textContent = state.winner === 2 ? "Seri" : "P" + (state.winner + 1) + " menang" + (state.winner === mySlot() ? " \u2014 itu kamu!" : "");
                ovSub.textContent = state.reason + " P1 " + a.score + " \u00b7 P2 " + b.score + " \u00b7 Kamu P" + (mySlot() + 1);
            }
            ovAgain.hidden = online && !isHost;
            ovRematch.hidden = !(online && !isHost);
            ovMenu.hidden = online;
        }
    }

    /* ---------------- input ---------------- */
    function sendInput(force) {
        const now = perfNow();
        if (!force && now - lastSend < 60) { inputDirty = true; return; }
        lastSend = now;
        inputDirty = false;
        submitAction({ t: "input", l: inp.l, r: inp.r, f: inp.f, tx: inp.tx });
    }
    function setKey(k, v) {
        if (inp[k] === v) return false;
        inp[k] = v;
        if (k !== "f" && v) inp.tx = null;
        return true;
    }
    function setPaused(v) {
        v = Boolean(v);
        if (paused === v) return;
        paused = v;
        if (v) {
            inp.l = false; inp.r = false; inp.f = false; inp.tx = null;
            sendInput(true);
            pauseWallAt = clockNow(); pausePerfAt = perfNow();
        } else {
            if (pausePerfAt) {
                clockShift += Math.max(0, clockNow() - pauseWallAt);
                perfShift += Math.max(0, perfNow() - pausePerfAt);
                pauseWallAt = 0; pausePerfAt = 0;
            }
            lastT = 0; /* tidak ada loncatan dt pada frame pertama setelah resume */
        }
        render();
    }
    function togglePause() {
        if (online || !state) return;
        const ph = state.phase;
        if (ph === "menu" || ph === "lobby" || ph === "over") return;
        setPaused(!paused);
    }
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatOpen = false;
        render();
    }
    function toggleCheat(on) {
        if (online) return;
        cheatOpen = typeof on === "boolean" ? on : !cheatOpen;
        if (cheatOpen) helpOpen = false;
        render();
    }
    function closeTop() {
        if (helpOpen) toggleHelp(false);
        else if (cheatOpen) toggleCheat(false);
        else if (paused) setPaused(false);
    }
    function doRestart() {
        if (!state) return;
        if (online) {
            if (isHost) submitAction({ t: "start", mode: "duel" });
            else if (state.phase === "over") submitAction({ t: "rematch" });
            return;
        }
        if (state.phase === "menu") return;
        submitAction({ t: "start", mode: state.mode });
    }

    function onKeyDown(e) {
        const c = e.code;
        if (c === "ArrowLeft" || c === "ArrowRight" || c === "ArrowUp" || c === "ArrowDown" || c === "Space") e.preventDefault();
        if (e.repeat) return;
        /* prioritas: help → cheats → pause → Escape → aksi game */
        if (c === "KeyH") { toggleHelp(); return; }
        if (c === "KeyC") { if (!helpOpen) toggleCheat(); return; }
        if (c === "KeyP") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheat(false);
            else togglePause();
            return;
        }
        if (c === "Escape") { closeTop(); return; }
        if (c === "KeyR") {
            if (helpOpen) toggleHelp(false);
            else if (cheatOpen) toggleCheat(false);
            else doRestart();
            return;
        }
        if (c === "KeyB") { touchOn = !touchOn; render(); return; }
        if (helpOpen || cheatOpen) return;
        let changed = false;
        if (c === "ArrowLeft" || c === "KeyA") changed = setKey("l", true);
        else if (c === "ArrowRight" || c === "KeyD") changed = setKey("r", true);
        else if (c === "Space") changed = setKey("f", true);
        if (changed) {
            if (paused && !online) setPaused(false);
            sendInput(true);
        }
    }
    function onKeyUp(e) {
        const c = e.code;
        let changed = false;
        if (c === "ArrowLeft" || c === "KeyA") changed = setKey("l", false);
        else if (c === "ArrowRight" || c === "KeyD") changed = setKey("r", false);
        else if (c === "Space") changed = setKey("f", false);
        if (changed) sendInput(true);
    }

    /* mouse & sentuh langsung di papan */
    function boardX(e) {
        const r = svg.getBoundingClientRect();
        const sc = Math.min(r.width / W, r.height / H) || 1;
        const pad = (r.width - W * sc) / 2;
        return (e.clientX - r.left - pad) / sc;
    }
    let boardDown = false;
    function onBoardMove(e) {
        if (!state || state.phase !== "play") return;
        if (e.pointerType !== "mouse" && !boardDown) return;
        const x = clamp(boardX(e), 22, W - 22);
        if (inp.tx === x) return;
        inp.tx = x; inp.l = false; inp.r = false;
        sendInput(false);
    }
    function onBoardDown(e) {
        if (!state) return;
        e.preventDefault();
        boardDown = true;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { }
        if (state.phase === "play") {
            inp.tx = clamp(boardX(e), 22, W - 22);
            inp.f = true;
            if (paused && !online) setPaused(false);
            sendInput(true);
        }
    }
    function onBoardUp() {
        boardDown = false;
        if (inp.f) { inp.f = false; sendInput(true); }
    }
    function onBoardLeave() {
        boardDown = false;
        inp.f = false; inp.tx = null;
        sendInput(true);
    }
    svg.addEventListener("pointermove", onBoardMove);
    svg.addEventListener("pointerdown", onBoardDown);
    svg.addEventListener("pointerup", onBoardUp);
    svg.addEventListener("pointercancel", onBoardUp);
    svg.addEventListener("pointerleave", onBoardLeave);

    /* tombol virtual (mobile) */
    root.querySelectorAll("[data-hold]").forEach((b) => {
        const k = b.dataset.hold;
        const down = (e) => {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { }
            if (paused && !online) setPaused(false);
            if (setKey(k, true)) sendInput(true);
        };
        const up = () => { if (setKey(k, false)) sendInput(true); };
        b.addEventListener("pointerdown", down);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("pointerleave", up);
    });

    /* klik (template handleClick) */
    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        let b = t.closest("[data-exit],[data-help],[data-help-close],[data-cheats],[data-pause],[data-resume],[data-restart],[data-ui],[data-act]");
        if (!b) return;
        if (b.hasAttribute("data-exit")) { onExit(); return; }
        if (b.hasAttribute("data-help-close")) { toggleHelp(false); b.blur(); return; }
        if (b.hasAttribute("data-help")) { toggleHelp(); b.blur(); return; }
        if (b.hasAttribute("data-cheats")) { toggleCheat(); b.blur(); return; }
        if (b.hasAttribute("data-pause")) { togglePause(); b.blur(); return; }
        if (b.hasAttribute("data-resume")) { setPaused(false); b.blur(); return; }
        if (b.hasAttribute("data-restart")) { doRestart(); b.blur(); return; }
        if (b.hasAttribute("data-ui")) {
            if (b.dataset.ui === "pad") { touchOn = !touchOn; render(); }
            b.blur();
            return;
        }
        b = t.closest("[data-act]");
        if (!b) return;
        const a = b.dataset.act;
        if (a === "start-solo") submitAction({ t: "start", mode: "solo" });
        else if (a === "start-bot") submitAction({ t: "start", mode: "bot" });
        else if (a === "start-duel") submitAction({ t: "start", mode: "duel" });
        else if (a === "restart") doRestart();
        else if (a === "rematch") submitAction({ t: "rematch" });
        else if (a === "menu") { if (!online && state) { state.phase = "menu"; pubForce = true; } }
        else if (a === "resume") setPaused(false);
        else if (a === "pause") togglePause();
        else if (a === "help") toggleHelp();
        else if (a === "help-close") toggleHelp(false);
        else if (a === "cheat-open") toggleCheat();
        else if (a === "cheat-close") toggleCheat(false);
        else if (a === "cheat-life") submitAction({ t: "cheat-life" });
        else if (a === "cheat-skip") submitAction({ t: "cheat-skip" });
        else if (a === "cheat-reset") submitAction({ t: "cheat-reset" });
        else if (a === "touch-toggle") { touchOn = !touchOn; render(); }
        if (typeof b.blur === "function") b.blur();
    }
    function handleChange(event) {
        const c = event.target.closest("[data-cheat]");
        if (!c || online) return;
        cheats[c.dataset.cheat] = c.checked;
        submitAction({ t: "cheat" });
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    const onVis = () => {
        if (document.hidden && !online && state &&
            (state.phase === "play" || state.phase === "intro" || state.phase === "flip" || state.phase === "turnend"))
            setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onVis);

    /* ---------------- mode wiring (template) ---------------- */
    const unsubs = [];
    const keep = (u) => { if (typeof u === "function") unsubs.push(u); };
    function onGuestState(next) {
        if (!next || !next.lvl) return;
        const prev = state;
        state = next;
        recvT = perfNow();
        if (prev && prev.lvl && prev.level === state.level && prev.lvl.rows === state.lvl.rows && prev.lvl.cols === state.lvl.cols) {
            for (let i = 0; i < state.lvl.cells.length; i++) {
                if (prev.lvl.cells[i] && !state.lvl.cells[i]) {
                    const r = (i / state.lvl.cols) | 0, c = i % state.lvl.cols;
                    poof(cellX(state.lvl, c, state.ox), cellY(state.lvl, r, state.oy), "#fde68a");
                }
            }
        }
        if (prev && prev.slots) {
            for (let s = 0; s < 2; s++)
                if (state.slots[s].lives < prev.slots[s].lives) poof(state.slots[s].x, SHIP_Y + 10, "#ff6b6b");
        }
        if (prev && state.phase === "play" && state.active === mySlot() && (prev.active !== state.active || prev.phase !== "play"))
            sendInput(true);
    }
    root.querySelectorAll('[data-only="offline"]').forEach((b) => { b.hidden = online; });
    if (online && !isHost) root.querySelectorAll('[data-act="restart"]').forEach((b) => { b.hidden = true; });

    if (online) {
        if (isHost) {
            state = baseState("duel", "lobby");
            publish();
            keep(room.onAction((action) => applyAction(action, 1)));
        } else {
            keep(room.onState(onGuestState));
        }
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
    } else {
        state = baseState("solo", "menu");
        render();
    }

    /* ---------------- loop ---------------- */
    function tick(t) {
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        dt = clamp(dt, 0, 0.05);
        const canSim = state && (!online || isHost) && !simPaused() &&
            (state.phase === "flip" || state.phase === "intro" || state.phase === "play" || state.phase === "turnend");
        if (canSim) simulate(dt);
        if (online && isHost && state) {
            pubAcc += dt;
            if (pubForce || pubAcc >= 0.1) { pubAcc = 0; pubForce = false; publish(); }
            else render();
        } else render();
        if (inputDirty) sendInput(false);
    }
    raf = requestAnimationFrame(tick);

    /* ---------------- destroy (template) ---------------- */
    return {
        destroy() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onVis);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svg.removeEventListener("pointermove", onBoardMove);
            svg.removeEventListener("pointerdown", onBoardDown);
            svg.removeEventListener("pointerup", onBoardUp);
            svg.removeEventListener("pointercancel", onBoardUp);
            svg.removeEventListener("pointerleave", onBoardLeave);
            unsubs.forEach((u) => { try { u(); } catch (e) { } });
        },
    };
}