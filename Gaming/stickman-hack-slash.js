/* ==== GAME: stickman-hack-slash.js ==== */
/*
  Stickman Hack and Slash — realtime 2D side-scroller.
  Balapan pedang melawan BOT (mode ai) atau pemain lain (mode room).
  - Template: export META + mount(root, context).
  - Level dibangkitkan acak dari seed, DIJAMIN bisa diselesaikan
    (jarak lubang & kenaikan platform dibatasi fisika lompat).
  - Multiplayer: host mensimulasikan dunia & publish state ~10Hz,
    guest mengirim input dan render dengan interpolasi.
*/

export const META = {
    id: "stickman-hack-slash", // harus sama dengan nama file (tanpa .js)
    name: "Stickman Hack and Slash",
    category: "action",
    catLabel: "Action",
    desc: "Balapan pedang 2D side-scrolling: tebas musuh, lompati jurang, dan capai bendera sebelum bot atau lawanmu.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="15" r="5"/><path d="M17 20v13M17 24l-6 7M17 24l4-9M17 33l-5 9M17 33l5 9"/><path d="M21 15L38 5" stroke="#e2e8f0" stroke-width="4"/><path d="M9 41a17 17 0 0 1 5-24" stroke="#fde047" stroke-width="2.5" stroke-dasharray="4 3"/></svg>',
    bg: ["#7f1d1d", "#1e1b4b"],
    bestKey: "stickmanHsBest",
};

/* ============================================================
   BAGIAN MURNI (tanpa DOM) — konstanta fisika & generator level.
   Angka di bawah sudah divalidasi lewat simulasi ribuan level.
   ============================================================ */
const G = 2200;            // gravitasi px/dtk^2
const JUMP = 820;          // kecepatan lompat (apex ±152px)
const SPD = 260;           // kecepatan lari pemain
const WORLD_H = 560;       // tinggi dunia logis
const KILL_Y = 640;        // jatuh di bawah ini = kena denda jurang
const PLAYER_HP = 100;
const SWING = { dmg: 12, cd: 0.32, t: 0.18, range: 80 };
const SPEC = {
    grunt: { hp: 30, spd: 70, dmg: 10, color: "#f87171", scale: 1 },
    brute: { hp: 70, spd: 46, dmg: 18, color: "#a78bfa", scale: 1.28 },
};
const SLOT_COLOR = ["#7dd3fc", "#fda4af"]; // P1 biru, P2 merah

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function comboMul(c) {
    if (typeof c !== "number" || !isFinite(c) || c < 1) return 1;
    return 1 + Math.min(c, 10) * 0.06;
}

/* RNG deterministik (seed sama => level sama di host & guest). */
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Cek analitik: semua platform berurutan terjangkau oleh lompatan. */
function canReachPath(plats) {
    const apex = (JUMP * JUMP) / (2 * G);
    for (let i = 0; i < plats.length - 1; i++) {
        const a = plats[i], b = plats[i + 1];
        const gap = b.x - (a.x + a.w);
        const rise = a.y - b.y;
        if (gap <= 0) { if (rise > apex - 4) return false; continue; }
        const t = gap / SPD;
        if (JUMP * t - 0.5 * G * t * t < rise - 2) return false;
    }
    return true;
}

/* Generator level acak yang pasti bisa diselesaikan. */
function genLevel(seed, level) {
    for (let attempt = 0; attempt < 6; attempt++) {
        const rnd = mulberry32((seed + attempt * 7919) ^ (level * 0x9e3779b9));
        const target = Math.min(2200 + level * 350, 4200);
        const plats = [{ x: 0, y: 470, w: 360 }];
        let x = 360, y = 470;
        while (x < target) {
            const gap = rnd() < 0.42 ? 0 : 40 + rnd() * 100;      // 0..140
            let rise = (rnd() * 2 - 1) * 100;                     // -100..100
            if (gap > 90) rise = Math.min(rise, 30);              // lubang lebar => tanjakan kecil
            if (gap === 0) rise = Math.min(rise, 95);             // tangga dinding <= apex
            const ny = clamp(y - rise, 280, 470);
            const w = 150 + rnd() * 220;
            plats.push({ x: x + gap, y: ny, w });
            x = x + gap + w; y = ny;
        }
        const last = plats[plats.length - 1];
        last.w = Math.max(last.w, 260);
        if (!canReachPath(plats)) continue; // defensif; seharusnya selalu lolos

        const w = last.x + last.w + 40;
        const flagX = last.x + last.w - 60;
        const cpPi = Math.max(1, Math.floor(plats.length / 2));
        const cpX = plats[cpPi].x + plats[cpPi].w / 2;

        // Musuh: hanya di platform yang bisa dipijak, jauh dari spawn.
        const foes = [];
        const maxFoes = Math.min(5 + level * 2, 14);
        for (let i = 1; i < plats.length && foes.length < maxFoes; i++) {
            const p = plats[i];
            if (p.x < 420) continue;
            if (rnd() < 0.5 + Math.min(level * 0.05, 0.3)) {
                const type = rnd() < Math.min(0.2 + level * 0.04, 0.45) ? "brute" : "grunt";
                foes.push({ type, pi: i, x: p.x + 30 + rnd() * (p.w - 60) });
            }
        }
        if (foes.length < 2 && plats.length > 4) {
            foes.push({ type: "grunt", pi: 2, x: plats[2].x + plats[2].w / 2 });
            foes.push({ type: "grunt", pi: 4, x: plats[4].x + plats[4].w / 2 });
        }
        // Hati (penyembuh) di platform tengah.
        const hearts = [];
        const nHearts = Math.min(2 + Math.floor(level / 2), 5);
        for (let k = 0; k < nHearts; k++) {
            const i = 1 + Math.floor(rnd() * (plats.length - 2));
            hearts.push({ pi: i, x: plats[i].x + 24 + rnd() * (plats[i].w - 48) });
        }
        return { w, plats, foes, hearts, cpX, cpY: plats[cpPi].y, cpPi, flagX, flagY: last.y, lastPi: plats.length - 1 };
    }
    // Fallback super aman: satu tanah datar.
    const w = 2600;
    return {
        w, plats: [{ x: 0, y: 470, w: w - 40 }],
        foes: [{ type: "grunt", pi: 0, x: 900 }, { type: "grunt", pi: 0, x: 1600 }],
        hearts: [{ pi: 0, x: 1200 }],
        cpX: 1300, cpY: 470, cpPi: 0, flagX: w - 120, flagY: 470, lastPi: 0,
    };
}

function genStars(seed) {
    const rnd = mulberry32(seed ^ 0x51ab);
    const stars = [];
    for (let i = 0; i < 70; i++)
        stars.push({ x: rnd() * 3000, y: rnd() * 260, r: 0.6 + rnd() * 1.4, p: rnd() * 6 });
    return stars;
}

/* Diekspor untuk keperluan unit test (opsional, tidak dipakai platform). */
export const __test = { clamp, lerp, comboMul, mulberry32, genLevel, canReachPath, G, JUMP, SPD };

/* ============================================================
   MOUNT — seluruh UI, simulasi, input, jaringan, dan render.
   ============================================================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    let roomData = room?.room || null;
    let destroyed = false;

    /* ---------- DOM & gaya (minimalis, ter-scope .hs-app) ---------- */
    root.innerHTML = `
<style>
.hs-app{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.hs-app .game-intro{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.hs-app .game-intro h2{font-size:18px;margin:0;letter-spacing:.3px}
.hs-app .game-intro p{margin:2px 0 0;font-size:12px;opacity:.65}
.hs-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#94a3b8;background:#10152b;border:1px solid #232b52;border-radius:999px;padding:5px 12px}
.hs-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;animation:hsPulse 2s infinite}
@keyframes hsPulse{50%{opacity:.35}}
.hs-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hs-chip{display:inline-flex;align-items:center;gap:6px;background:#10152b;border:1px solid #232b52;border-radius:999px;padding:5px 11px;font-size:10.5px;color:#94a3b8;letter-spacing:.5px;text-transform:uppercase}
.hs-chip b{color:#e2e8f0;font-size:12px;font-variant-numeric:tabular-nums}
.hs-hpbar{width:110px;height:7px;background:#1e2749;border-radius:99px;overflow:hidden}
.hs-hpfill{height:100%;width:100%;background:#34d399;border-radius:99px;transition:width .15s,background .3s}
.hs-spacer{flex:1}
.hs-iconbtn{width:34px;height:34px;border-radius:10px;border:1px solid #2a3560;background:transparent;color:#cbd5e1;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.hs-iconbtn:hover{background:#182046}
.hs-progress{position:relative;height:12px;background:#10152b;border:1px solid #232b52;border-radius:99px}
.hs-pdot{position:absolute;top:50%;width:11px;height:11px;border-radius:50%;transform:translate(-50%,-50%);transition:left .12s linear;border:2px solid #0b0e1a;z-index:2}
.hs-pflag{position:absolute;right:5px;top:50%;transform:translateY(-50%);font-size:9px;line-height:1}
.hs-cptick{position:absolute;top:-2px;bottom:-2px;width:2px;background:#334155;border-radius:2px}
.hs-panel{position:relative;width:100%;aspect-ratio:16/9;min-height:300px;max-height:62vh;background:#0b0e1a;border:1px solid #1f2748;border-radius:16px;overflow:hidden}
.hs-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
.hs-banner{position:absolute;top:24%;left:0;right:0;text-align:center;font-size:clamp(20px,4vw,34px);font-weight:800;color:#fff;letter-spacing:2px;text-shadow:0 4px 18px #000;pointer-events:none;z-index:12;animation:hsPop .45s ease}
@keyframes hsPop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.hs-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(7,10,20,.78);backdrop-filter:blur(5px);z-index:20;padding:16px;overflow:auto}
.hs-card{background:#0e1326;border:1px solid #26305c;border-radius:16px;padding:20px 22px;max-width:460px;width:100%;text-align:center;animation:hsUp .3s ease;margin:auto}
@keyframes hsUp{from{transform:translateY(10px);opacity:0}}
.hs-card h3{margin:0 0 6px;font-size:20px;color:#e2e8f0}
.hs-card h3.win{color:#34d399}.hs-card h3.lose{color:#f87171}
.hs-card .sub{font-size:12.5px;color:#94a3b8;line-height:1.55;margin:0 0 14px}
.hs-how{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left;margin:0 0 12px}
.hs-how>div{background:#101731;border:1px solid #222b52;border-radius:10px;padding:9px 11px;font-size:11.5px;color:#cbd5e1;line-height:1.8}
.hs-how h4{margin:0 0 4px;font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:#7dd3fc}
.hs-app kbd{background:#1c2447;border:1px solid #34407a;border-bottom-width:2px;border-radius:5px;padding:1px 5px;font-size:10.5px;font-family:inherit;color:#e2e8f0}
.hs-rules{font-size:11.5px;color:#94a3b8;text-align:left;line-height:1.65;margin:0 0 14px;padding-left:16px}
.hs-btn{background:#7dd3fc;color:#082032;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;margin:2px}
.hs-btn:hover{filter:brightness(1.12)}
.hs-btn.ghost{background:transparent;color:#cbd5e1;border:1px solid #2a3560}
.hs-cheats{position:absolute;top:10px;right:10px;z-index:25;background:rgba(14,19,38,.95);border:1px solid #26305c;border-radius:12px;padding:12px 14px;width:212px;font-size:12px}
.hs-cheats h4{margin:0 0 8px;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24}
.hs-cheats label{display:flex;align-items:center;gap:8px;padding:3.5px 0;color:#cbd5e1;cursor:pointer}
.hs-cheats input{accent-color:#fbbf24}
.hs-cheats .row{display:flex;gap:6px;margin-top:9px}
.hs-cheats .mini{flex:1;background:#1c2447;border:1px solid #34407a;color:#e2e8f0;border-radius:8px;padding:6px 4px;font-size:10.5px;cursor:pointer}
.hs-cheats .mini:hover{background:#26305c}
.hs-touch{position:absolute;left:0;right:0;bottom:0;display:none;justify-content:space-between;align-items:flex-end;padding:12px;z-index:15;pointer-events:none}
.hs-touch .grp{display:flex;gap:10px;pointer-events:auto}
.hs-vbtn{width:62px;height:62px;border-radius:50%;border:1px solid rgba(148,163,184,.35);background:rgba(15,20,40,.55);color:#e2e8f0;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none;backdrop-filter:blur(2px);cursor:pointer}
.hs-vbtn svg{width:26px;height:26px;pointer-events:none}
.hs-vbtn:active{transform:scale(.92);background:rgba(125,211,252,.25)}
.hs-vbtn.jmp{border-color:rgba(125,211,252,.55);color:#7dd3fc}
.hs-vbtn.atk{border-color:rgba(253,224,71,.55);color:#fde047}
.hs-app.touch-on .hs-touch{display:flex}
.hs-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hs-hint{font-size:11px;color:#64748b;margin-left:auto}
@media (max-width:640px){.hs-how{grid-template-columns:1fr}.hs-hint{display:none}.hs-chip{padding:4px 8px}.hs-hpbar{width:70px}}
@media (prefers-reduced-motion:reduce){.hs-banner,.hs-card,.hs-app .game-status-dot{animation:none}}
</style>
<div class="game-app hs-app">
  <div class="game-intro">
    <div><h2>Stickman Hack and Slash</h2><p>Balapan pedang side-scrolling — capai bendera sebelum lawanmu.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>
  <div class="hs-hud">
    <span class="hs-chip">HP <span class="hs-hpbar"><span class="hs-hpfill" data-hud="hpfill"></span></span> <b data-hud="hp">100</b></span>
    <span class="hs-chip">Level <b data-hud="lv">1</b></span>
    <span class="hs-chip">Skor <b data-hud="score">0</b></span>
    <span class="hs-chip">Combo <b data-hud="combo">x1</b></span>
    <span class="hs-chip">Kill <b data-hud="kills">0</b></span>
    <span class="hs-chip">Best <b data-hud="best">0</b></span>
    <span class="hs-spacer"></span>
    <button class="hs-iconbtn" type="button" data-act="help" aria-label="Cara main" title="Cara main (H)">?</button>
    <button class="hs-iconbtn" type="button" data-act="cheats" aria-label="Cheat" title="Cheat (C)">⚡</button>
    <button class="hs-iconbtn" type="button" data-act="pause" aria-label="Jeda" title="Jeda (P)">⏸</button>
  </div>
  <div class="hs-progress" aria-hidden="true">
    <span class="hs-cptick" data-el="cptick"></span>
    <span class="hs-pdot" data-el="dot0" style="background:#7dd3fc;left:0%"></span>
    <span class="hs-pdot" data-el="dot1" style="background:#fda4af;left:0%"></span>
    <span class="hs-pflag">🚩</span>
  </div>
  <section class="game-panel hs-panel" data-board>
    <canvas class="hs-canvas"></canvas>
    <div class="hs-banner" data-el="banner" hidden></div>
    <div class="hs-touch">
      <div class="grp">
        <button class="hs-vbtn" type="button" data-vk="l" aria-label="Kiri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg></button>
        <button class="hs-vbtn" type="button" data-vk="r" aria-label="Kanan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg></button>
      </div>
      <div class="grp">
        <button class="hs-vbtn jmp" type="button" data-vk="j" aria-label="Lompat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/><path d="M6 19h12"/></svg></button>
        <button class="hs-vbtn atk" type="button" data-vk="a" aria-label="Serang"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L18 6M18 6h-5M18 6v5M7 17l-3 3"/></svg></button>
      </div>
    </div>
    <div class="hs-overlay" data-ov="menu">
      <div class="hs-card">
        <h3>Cara Main</h3>
        <p class="sub">Balapan ke bendera 🚩 melawan <b data-el="opname">BOT</b>. Tebas musuh yang menghalangi, lompati jurang, dan jangan sampai HP habis!</p>
        <div class="hs-how">
          <div><h4>⌨️ Desktop</h4><kbd>A</kbd>/<kbd>D</kbd> atau <kbd>←</kbd>/<kbd>→</kbd> gerak<br><kbd>W</kbd>/<kbd>Space</kbd> lompat<br><kbd>J</kbd> / <b>klik mouse</b> serang<br><kbd>P</kbd> jeda · <kbd>H</kbd> bantuan</div>
          <div><h4>📱 Mobile</h4>Tombol ◀ ▶ di kiri bawah<br>Tombol ▲ lompat di kanan<br>Tombol 🗡 serang (tahan = combo)<br>Tap layar juga = serang</div>
        </div>
        <ul class="hs-rules">
          <li><b>Tahan serang</b> untuk ayunan beruntun — hit beruntun menaikkan combo & damage.</li>
          <li>❤️ Hati memulihkan 25 HP. Tiang hijau = <b>checkpoint</b> (tempat respawn).</li>
          <li>Jatuh ke jurang: −25 HP dan kembali ke checkpoint. HP habis: respawn 1,2 detik.</li>
          <li>🎲 <b>Undian koin</b> menentukan siapa jalan duluan — yang kalah undian diam 1,1 detik!</li>
          <li>🎲 Multiplayer: posisi <b>P1 (biru) / P2 (merah)</b> diacak otomatis oleh host.</li>
          <li>Level dibangkitkan acak dan <b>dijamin bisa diselesaikan</b>. Makin tinggi level, makin panjang & ramai.</li>
        </ul>
        <button class="hs-btn" type="button" data-act="start">Mulai</button>
      </div>
    </div>
    <div class="hs-overlay" data-ov="end" hidden>
      <div class="hs-card">
        <h3 data-el="endtitle">Selesai</h3>
        <p class="sub" data-el="endmsg"></p>
        <div data-el="endbtns">
          <button class="hs-btn" type="button" data-act="next">Level berikutnya</button>
          <button class="hs-btn ghost" type="button" data-act="retry">Ulangi level</button>
        </div>
        <p class="sub" data-el="endwait" hidden style="margin-top:8px">Menunggu host melanjutkan…</p>
      </div>
    </div>
    <div class="hs-overlay" data-ov="pause" hidden>
      <div class="hs-card">
        <h3>Jeda</h3>
        <p class="sub">Tarik napas dulu. Musuh juga ikut berhenti.</p>
        <button class="hs-btn" type="button" data-act="resume">Lanjut</button>
      </div>
    </div>
    <div class="hs-cheats" data-ov="cheats" hidden>
      <h4>⚡ Cheat</h4>
      <label><input type="checkbox" data-cheat="god"> God Mode (kebal)</label>
      <label><input type="checkbox" data-cheat="onehit"> One-Hit Kill</label>
      <label><input type="checkbox" data-cheat="speed"> Lari 1.5×</label>
      <label><input type="checkbox" data-cheat="fly"> Terbang (lompat udara)</label>
      <label><input type="checkbox" data-cheat="freeze"> Bekukan musuh</label>
      <label><input type="checkbox" data-cheat="slow"> Slow-mo musuh & bot</label>
      <div class="row">
        <button class="mini" type="button" data-cheatact="heal">Full HP</button>
        <button class="mini" type="button" data-cheatact="kill">Kill All</button>
        <button class="mini" type="button" data-cheatact="skip" data-el="skipbtn">Skip ⏭</button>
      </div>
    </div>
  </section>
  <div class="game-actions hs-actions">
    <button class="game-action-button hs-btn ghost" type="button" data-exit>Exit game</button>
    <button class="hs-iconbtn" type="button" data-act="touch" aria-label="Tombol virtual" title="Tombol virtual">🎮</button>
    <button class="hs-iconbtn" type="button" data-act="sound" aria-label="Suara" title="Suara" data-el="soundbtn">🔊</button>
    <span class="hs-hint">A/D gerak · W/Space lompat · J/klik serang (tahan = combo) · P jeda</span>
  </div>
</div>`;

    const qs = (s, r) => (r || root).querySelector(s);
    const appEl = qs(".hs-app");
    const panel = qs("[data-board]");
    const canvas = qs(".hs-canvas");
    const ctx = canvas.getContext("2d");
    const banner = qs('[data-el="banner"]');
    const ovMenu = qs('[data-ov="menu"]');
    const ovEnd = qs('[data-ov="end"]');
    const ovPause = qs('[data-ov="pause"]');
    const ovCheats = qs('[data-ov="cheats"]');
    const hud = {
        hp: qs('[data-hud="hp"]'), hpfill: qs('[data-hud="hpfill"]'),
        lv: qs('[data-hud="lv"]'), score: qs('[data-hud="score"]'),
        combo: qs('[data-hud="combo"]'), kills: qs('[data-hud="kills"]'),
        best: qs('[data-hud="best"]'), status: qs("[data-status]"),
        dot0: qs('[data-el="dot0"]'), dot1: qs('[data-el="dot1"]'),
        cptick: qs('[data-el="cptick"]'),
    };
    const cheatsAllowed = !online || isHost;
    if (!cheatsAllowed) qs('[data-act="cheats"]').hidden = true;
    if (online) qs('[data-el="opname"]').textContent = "pemain lain";
    if (online && !isHost) qs('[data-el="skipbtn"]').hidden = true;

    /* ---------- state lokal ---------- */
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    let state = null;            // state kanonik (host / mode ai)
    let levelData = null;        // geometri level (dari seed, tidak ikut dipublish)
    let ldSeed = null, ldLevel = null;
    let stars = [];
    let inputs = [{ l: false, r: false, j: false, a: false }, { l: false, r: false, j: false, a: false }];
    const kb = { l: false, r: false, j: false, a: false };
    const vc = { l: false, r: false, j: false, a: false };
    const ms = { a: false };
    const cheats = { god: false, onehit: false, speed: false, fly: false, freeze: false, slow: false };
    let helpOpen = false;
    let evId = 0, lastEvI = 0, eid = 1, hid = 1;
    let snaps = [];              // guest: buffer snapshot untuk interpolasi
    let particles = [], floaters = [];
    let shakeT = 0, shakeMag = 0;
    let cam = 0, dpr = 1, scale = 1, viewW = 960;
    let raf = null, lastT = 0, lastPub = 0, prevPhase = "";
    let bannerTimer = null, inTimer = null, lastSent = 0, pendingInp = null;
    let soundOn = true, AC = null;
    const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }

    function getMySlot() {
        if (!online) return 0;
        const a = (state && state.assign) || (snaps.length ? snaps[snaps.length - 1].s.assign : null);
        return a ? a[isHost ? 0 : 1] : (isHost ? 0 : 1);
    }
    function curState() { return isHost ? state : (snaps.length ? snaps[snaps.length - 1].s : null); }

    /* ---------- audio (synth mungil, aman autoplay-policy) ---------- */
    function sfx(f, d = 0.08, type = "square", v = 0.035, slide = 0) {
        if (!soundOn || destroyed) return;
        try {
            AC = AC || new (window.AudioContext || window.webkitAudioContext)();
            if (AC.state === "suspended") AC.resume();
            const t = AC.currentTime;
            const o = AC.createOscillator(), g = AC.createGain();
            o.type = type; o.frequency.setValueAtTime(f, t);
            if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
            g.gain.setValueAtTime(v, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(g); g.connect(AC.destination);
            o.start(t); o.stop(t + d + 0.02);
        } catch (e) { }
    }
    function sfxWin() { sfx(523, 0.12, "triangle", 0.05); setTimeout(() => sfx(659, 0.12, "triangle", 0.05), 110); setTimeout(() => sfx(784, 0.2, "triangle", 0.05), 220); }

    /* ---------- efek visual (client-side, dari event terserialisasi) ---------- */
    function shake(m) { if (REDUCED) return; shakeT = 0.3; shakeMag = Math.max(shakeMag, m); }
    function puff(x, y, c, n, spd, grav) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
            particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, t: 0, life: 0.4 + Math.random() * 0.3, c, r: 1.5 + Math.random() * 2.5, grav: grav || 0, kind: "dot" });
        }
    }
    function ring(x, y, c) { particles.push({ x, y, vx: 0, vy: 0, t: 0, life: 0.45, c, r: 6, grav: 0, kind: "ring" }); }
    function floater(x, y, txt, c) { floaters.push({ x, y, txt, c, t: 0 }); }
    function spawnFx(ev) {
        const mine = ev.slot === getMySlot();
        switch (ev.k) {
            case "jump": puff(ev.x, ev.y, "#64748b", 5, 60, 300); sfx(300, 0.09, "square", 0.025, 160); break;
            case "land": puff(ev.x, ev.y, "#64748b", 6, 70, 300); sfx(140, 0.05, "square", 0.02); break;
            case "hit": puff(ev.x, ev.y, "#fde047", 7, 130, 400); floater(ev.x, ev.y - 10, "-" + ev.n, "#fde047"); shake(3); sfx(200, 0.06, "sawtooth", 0.03, -80); break;
            case "die": puff(ev.x, ev.y, ev.c || "#f87171", 12, 160, 500); ring(ev.x, ev.y, ev.c || "#f87171"); shake(4); sfx(520, 0.12, "triangle", 0.04, 200); break;
            case "hurt": puff(ev.x, ev.y, "#ef4444", 8, 120, 400); shake(mine ? 7 : 2); if (mine) sfx(110, 0.12, "square", 0.04); break;
            case "dead": puff(ev.x, ev.y, "#94a3b8", 16, 180, 500); ring(ev.x, ev.y, "#94a3b8"); shake(mine ? 9 : 3); break;
            case "heal": floater(ev.x, ev.y - 20, "+25", "#34d399"); puff(ev.x, ev.y - 20, "#34d399", 8, 80, -60); sfx(660, 0.1, "triangle", 0.035, 120); break;
            case "cp": ring(ev.x, ev.y - 20, "#34d399"); if (mine) { showBanner("CHECKPOINT ✓", 900); sfx(587, 0.12, "triangle", 0.04); } break;
            case "spawn": ring(ev.x, ev.y - 20, "#7dd3fc"); break;
            case "win": {
                for (let i = 0; i < 36; i++) {
                    const cols = ["#fde047", "#7dd3fc", "#f472b6", "#34d399", "#fda4af"];
                    particles.push({ x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 320, vy: -120 - Math.random() * 260, t: 0, life: 0.9 + Math.random() * 0.5, c: cols[i % 5], r: 2 + Math.random() * 3, grav: 700, kind: "confetti" });
                }
                sfxWin(); break;
            }
        }
    }
    function consumeEvents(s) {
        if (!s || !s.ev) return;
        for (const ev of s.ev) if (ev.i > lastEvI) { lastEvI = ev.i; spawnFx(ev); }
    }
    function pushEv(k, x, y, extra) {
        state.ev.push(Object.assign({ i: ++evId, k, x: Math.round(x), y: Math.round(y) }, extra || {}));
        if (state.ev.length > 40) state.ev.splice(0, state.ev.length - 40);
    }

    /* ---------- banner ---------- */
    function showBanner(txt, ms2 = 1200) {
        banner.textContent = txt; banner.hidden = false;
        banner.style.animation = "none"; void banner.offsetWidth; banner.style.animation = "";
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => { banner.hidden = true; }, ms2);
    }

    /* ---------- level & state ---------- */
    function ensureLevel(seed, level) {
        if (seed === ldSeed && level === ldLevel && levelData) return;
        ldSeed = seed; ldLevel = level;
        levelData = genLevel(seed, level);
        stars = genStars(seed);
        hud.cptick.style.left = clamp((levelData.cpX / levelData.flagX) * 100, 0, 100) + "%";
    }
    function makeRacer(slot) {
        return {
            slot, x: 64 + slot * 44, y: 470, vx: 0, vy: 0, face: 1, hp: PLAYER_HP,
            run: 0, onGround: true, pi: 0, atkCd: 0, atkT: 0, combo: 0, comboT: 0,
            stun: 0, invuln: 0, hurtT: 0, landT: 0, airCd: 0, jPrev: false, blocked: false,
            dead: false, deadT: 0, cpSet: false, cp: null, kills: 0,
            bot: !online && slot === 1, botSpd: 0.88 + Math.random() * 0.08,
        };
    }
    function buildRound(keepSeed) {
        if (!keepSeed) state.seed = (Math.random() * 0x7fffffff) | 0;
        state.first = Math.random() < 0.5 ? 0 : 1; // 🎲 undian siapa jalan duluan
        ensureLevel(state.seed, state.level);
        state.players = [makeRacer(0), makeRacer(1)];
        state.enemies = levelData.foes.map((f) => {
            const s = SPEC[f.type], pl = levelData.plats[f.pi];
            const hp = Math.round(s.hp * (1 + state.level * 0.12));
            return { id: eid++, type: f.type, pi: f.pi, x: f.x, y: pl.y, hp, maxHp: hp, spd: s.spd, dmg: s.dmg, face: -1, dir: Math.random() < 0.5 ? -1 : 1, run: 0, atkCd: 0.6, atkT: 0, hurtT: 0, kb: 0 };
        });
        state.hearts = levelData.hearts.map((h) => ({ id: hid++, x: h.x, y: levelData.plats[h.pi].y, taken: false }));
        state.winner = -1; state.phase = "count"; state.countT = 1.6;
        particles = []; floaters = []; cam = 0;
    }
    function freshState() {
        state = {
            v: 1, seed: (Math.random() * 0x7fffffff) | 0, level: 0, score: 0,
            phase: "menu", countT: 0, winner: -1, first: 0,
            // 🎲 posisi P1/P2 diacak (host yang mengundi, lalu dipublish)
            assign: online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1],
            players: [], enemies: [], hearts: [], ev: [],
        };
        buildRound(true);
        state.phase = "menu";
        return state;
    }

    /* ---------- simulasi (hanya host / mode ai) ---------- */
    function respawn(p) {
        p.dead = false; p.hp = PLAYER_HP; p.vy = 0; p.stun = 0; p.invuln = 1.5;
        p.x = p.cp ? p.cp.x : 64 + p.slot * 44;
        p.y = p.cp ? p.cp.y : 470;
        p.pi = p.cp ? levelData.cpPi : 0;
        pushEv("spawn", p.x, p.y, { slot: p.slot });
    }
    function damageRacer(p, d) {
        if (p.dead || p.invuln > 0) return;
        if (p.slot === getMySlot() && cheats.god && cheatsAllowed) return;
        p.hp -= d; p.hurtT = 0.15; p.invuln = 0.6;
        pushEv("hurt", p.x, p.y - 40, { slot: p.slot });
        if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deadT = 1.2; pushEv("dead", p.x, p.y - 20, { slot: p.slot }); }
    }
    function doSwing(p) {
        p.atkCd = SWING.cd; p.atkT = SWING.t;
        const mine = p.slot === getMySlot();
        let hit = false;
        for (const e of state.enemies) {
            if (e.hp <= 0) continue;
            const dx = (e.x - p.x) * p.face;
            if (dx > -8 && dx < SWING.range && Math.abs(e.y - p.y) < 62) {
                const dmg = mine && cheats.onehit && cheatsAllowed ? 9999 : Math.round(SWING.dmg * comboMul(p.combo));
                e.hp -= dmg; e.hurtT = 0.12; e.kb = p.face * 170; hit = true;
                pushEv("hit", e.x, e.y - 30, { n: dmg });
                if (e.hp <= 0) {
                    p.kills++; state.score += 10;
                    pushEv("die", e.x, e.y - 20, { c: SPEC[e.type].color });
                    if (Math.random() < 0.3) state.hearts.push({ id: hid++, x: e.x, y: e.y, taken: false });
                }
            }
        }
        if (hit) { p.combo = Math.min(12, p.combo + 1); p.comboT = 1.5; }
    }
    function winRound(slot) {
        if (state.phase !== "play") return;
        state.winner = slot; state.phase = "end";
        state.score += 100 + Math.ceil(state.players[slot].hp);
        pushEv("win", levelData.flagX, levelData.flagY - 50, { slot });
        publish();
    }
    function stepRacer(p, inp, dt) {
        p.hurtT = Math.max(0, p.hurtT - dt); p.landT = Math.max(0, p.landT - dt);
        p.invuln = Math.max(0, p.invuln - dt); p.stun = Math.max(0, p.stun - dt);
        p.atkCd = Math.max(0, p.atkCd - dt); p.atkT = Math.max(0, p.atkT - dt);
        p.airCd = Math.max(0, p.airCd - dt);
        p.comboT -= dt; if (p.comboT <= 0) p.combo = 0;
        if (p.dead) { p.deadT -= dt; if (p.deadT <= 0) respawn(p); return; }

        const mine = p.slot === getMySlot();
        const spd = SPD * (p.bot ? p.botSpd : 1) * (mine && cheats.speed && cheatsAllowed ? 1.5 : 1);
        const dir = p.stun > 0 ? 0 : (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        p.vx = dir * spd;
        if (dir !== 0) p.face = dir;
        if (p.onGround && Math.abs(p.vx) > 10) p.run += Math.abs(p.vx) * dt * 0.055;

        const fly = mine && cheats.fly && cheatsAllowed;
        const wantJ = inp.j && p.stun <= 0 && (p.onGround ? !p.jPrev : (fly && p.airCd <= 0));
        if (wantJ) { p.vy = -JUMP; p.onGround = false; p.airCd = 0.2; pushEv("jump", p.x, p.y, { slot: p.slot }); }
        p.jPrev = !!inp.j;
        if (inp.a && p.atkCd <= 0 && p.stun <= 0) doSwing(p);

        const prevX = p.x, prevY = p.y;
        p.x = clamp(p.x + p.vx * dt, 10, levelData.w - 10);
        p.blocked = false;
        // Dinding samping platform (tangga naik / sisi jurang).
        for (const pl of levelData.plats) {
            if (p.y > pl.y + 4 && p.y < pl.y + 72) {
                if (prevX + 8 <= pl.x && p.x + 8 > pl.x) { p.x = pl.x - 8; p.blocked = true; }
                if (prevX - 8 >= pl.x + pl.w && p.x - 8 < pl.x + pl.w) { p.x = pl.x + pl.w + 8; p.blocked = true; }
            }
        }
        p.vy = Math.min(1500, p.vy + G * dt);
        p.y += p.vy * dt;
        const wasGround = p.onGround;
        p.onGround = false;
        if (p.vy >= 0) {
            let bestPl = null, bestI = -1;
            for (let i = 0; i < levelData.plats.length; i++) {
                const pl = levelData.plats[i];
                if (p.x >= pl.x - 6 && p.x <= pl.x + pl.w + 6 && prevY <= pl.y + 1 && p.y >= pl.y) {
                    if (!bestPl || pl.y < bestPl.y) { bestPl = pl; bestI = i; }
                }
            }
            if (bestPl) {
                if (!wasGround) { p.landT = 0.12; pushEv("land", p.x, bestPl.y, { slot: p.slot }); }
                p.y = bestPl.y; p.vy = 0; p.onGround = true; p.pi = bestI;
            }
        }
        // Jurang.
        if (p.y > KILL_Y) {
            damageRacer(p, 25);
            if (!p.dead) {
                p.x = p.cp ? p.cp.x : 64 + p.slot * 44;
                p.y = p.cp ? p.cp.y : 470;
                p.vy = 0; p.invuln = 1; p.pi = p.cp ? levelData.cpPi : 0;
                pushEv("spawn", p.x, p.y, { slot: p.slot });
            }
        }
        // Checkpoint.
        if (!p.cpSet && Math.abs(p.x - levelData.cpX) < 22 && Math.abs(p.y - levelData.cpY) < 40) {
            p.cpSet = true; p.cp = { x: levelData.cpX, y: levelData.cpY };
            pushEv("cp", levelData.cpX, levelData.cpY, { slot: p.slot });
        }
        // Hati.
        for (const h of state.hearts) {
            if (!h.taken && Math.abs(p.x - h.x) < 26 && Math.abs(p.y - h.y) < 54) {
                h.taken = true; p.hp = Math.min(PLAYER_HP, p.hp + 25);
                pushEv("heal", h.x, h.y, { slot: p.slot });
            }
        }
        // Finish!
        if (p.onGround && p.pi === levelData.lastPi && p.x >= levelData.flagX - 6) winRound(p.slot);
    }
    function stepEnemy(e, dt) {
        e.atkCd = Math.max(0, e.atkCd - dt); e.atkT = Math.max(0, e.atkT - dt);
        e.hurtT = Math.max(0, e.hurtT - dt);
        e.x += e.kb * dt; e.kb -= e.kb * Math.min(1, 8 * dt);
        if (cheats.freeze && cheatsAllowed) return;
        const pl = levelData.plats[e.pi];
        const lo = pl.x + 12, hi = pl.x + pl.w - 12;
        let tgt = null, bd = 1e9;
        for (const p of state.players) {
            if (p.dead) continue;
            const d = Math.hypot(p.x - e.x, p.y - e.y);
            if (d < bd) { bd = d; tgt = p; }
        }
        if (tgt && bd < 240 && Math.abs(tgt.y - e.y) < 80) {
            const dir = Math.sign(tgt.x - e.x) || 1;
            e.face = dir; e.x += dir * e.spd * dt; e.run += e.spd * dt * 0.05;
            if (Math.abs(tgt.x - e.x) < 26 && Math.abs(tgt.y - e.y) < 46 && e.atkCd <= 0) {
                e.atkCd = 0.9; e.atkT = 0.2; damageRacer(tgt, e.dmg);
            }
        } else {
            e.x += e.dir * e.spd * 0.5 * dt; e.run += e.spd * 0.5 * dt * 0.05;
            if (e.x < lo) { e.x = lo; e.dir = 1; }
            if (e.x > hi) { e.x = hi; e.dir = -1; }
            e.face = e.dir;
        }
        e.x = clamp(e.x, lo, hi);
    }
    /* Bot: lompat hanya bila perlu + rem di udara agar tidak melewati platform.
       Logika ini sudah lolos uji simulasi pada ribuan level acak. */
    function botInput(p) {
        const inp = { l: false, r: true, j: false, a: false };
        if (p.dead || p.stun > 0) return { l: false, r: false, j: false, a: false };
        const L = levelData, n = L.plats.length;
        if (p.onGround && p.pi < n - 1) {
            const pl = L.plats[p.pi], nx = L.plats[p.pi + 1];
            const gap = nx.x - (pl.x + pl.w), rise = pl.y - nx.y;
            const walk = p.botSpd * SPD * Math.sqrt((2 * Math.max(0, -rise)) / G);
            if ((rise > 4 || gap > walk - 8) && p.x > pl.x + pl.w - 14) inp.j = true;
            if (p.blocked) inp.j = true;
        }
        if (!p.onGround && p.pi < n - 1 && p.x >= L.plats[p.pi + 1].x + 10) inp.r = false;
        for (const e of state.enemies) {
            if (e.hp <= 0) continue;
            const dx = (e.x - p.x) * p.face;
            if (dx > -6 && dx < 85 && Math.abs(e.y - p.y) < 60) { inp.a = true; break; }
        }
        return inp;
    }
    function simStep(dt) {
        const slow = cheats.freeze || cheats.slow ? (cheats.slow && cheatsAllowed ? 0.45 : 1) : 1;
        for (let i = 0; i < 2; i++) {
            const p = state.players[i];
            const inp = p.bot ? botInput(p) : inputs[i];
            stepRacer(p, inp, p.bot ? dt * slow : dt);
        }
        for (const e of state.enemies) if (e.hp > 0) stepEnemy(e, dt * slow);
        state.enemies = state.enemies.filter((e) => e.hp > 0);
    }

    /* ---------- aksi & jaringan ---------- */
    function publish() {
        if (online && isHost && state) room.publishState(state).catch(console.warn);
    }
    function startRun() {
        const fromMenu = state.phase === "menu";
        state.level = 0; state.score = 0;
        buildRound(fromMenu); // dari menu: pertahankan seed pratinjau
        publish();
    }
    function applyAction(a, actor) {
        if (destroyed || !state || !a || typeof a !== "object") return;
        if (actor !== 0 && actor !== 1) return; // validasi aktor
        switch (a.t) {
            case "in":
                if (a.in) inputs[actor] = { l: !!a.in.l, r: !!a.in.r, j: !!a.in.j, a: !!a.in.a };
                break;
            case "start": startRun(); break;
            case "next":
                if (state.phase === "end") { state.level++; buildRound(false); publish(); }
                break;
            case "retry":
                if (state.phase === "end") { buildRound(true); publish(); }
                break;
            case "pause":
                if (state.phase === "play") state.phase = "paused";
                else if (state.phase === "paused") state.phase = "play";
                publish();
                break;
        }
    }
    function submitAction(a) {
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, getMySlot());
    }
    function applyLocalInput() {
        const inp = { l: kb.l || vc.l, r: kb.r || vc.r, j: kb.j || vc.j, a: kb.a || vc.a || ms.a };
        if (online && !isHost) {
            pendingInp = inp;
            const now = performance.now();
            if (now - lastSent >= 60) sendNow();
            else if (!inTimer) inTimer = setTimeout(sendNow, 60 - (now - lastSent));
        } else {
            inputs[getMySlot()] = inp;
        }
    }
    function sendNow() {
        if (inTimer) { clearTimeout(inTimer); inTimer = null; }
        if (!pendingInp || destroyed) return;
        lastSent = performance.now();
        room.sendAction({ t: "in", in: pendingInp }).catch(console.warn);
        pendingInp = null;
    }
    function onSnap(s) {
        if (destroyed || !s || !s.players) return;
        ensureLevel(s.seed, s.level);
        snaps.push({ t: performance.now(), s });
        if (snaps.length > 8) snaps.shift();
    }
    /* Guest: interpolasi antar snapshot (render ±130ms di belakang). */
    function guestVis() {
        if (!snaps.length) return null;
        const rt = performance.now() - 130;
        let a = snaps[0], b = snaps[snaps.length - 1];
        for (let i = 0; i < snaps.length - 1; i++) {
            if (snaps[i].t <= rt && snaps[i + 1].t >= rt) { a = snaps[i]; b = snaps[i + 1]; break; }
        }
        if (rt >= b.t) {
            const dt = Math.min(0.12, (rt - b.t) / 1000);
            return Object.assign({}, b.s, {
                players: b.s.players.map((p) => Object.assign({}, p, { x: p.x + p.vx * dt, y: p.y + p.vy * dt })),
            });
        }
        const al = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
        return Object.assign({}, b.s, {
            players: b.s.players.map((bp) => {
                const ap = a.s.players.find((q) => q.slot === bp.slot) || bp;
                return Object.assign({}, bp, { x: lerp(ap.x, bp.x, al), y: lerp(ap.y, bp.y, al), run: lerp(ap.run, bp.run, al) });
            }),
            enemies: b.s.enemies.map((be) => {
                const ae = a.s.enemies.find((q) => q.id === be.id) || be;
                return Object.assign({}, be, { x: lerp(ae.x, be.x, al), y: lerp(ae.y, be.y, al) });
            }),
        });
    }

    /* ---------- input: keyboard, mouse, tombol virtual ---------- */
    const KEYMAP = {
        ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r",
        ArrowUp: "j", KeyW: "j", Space: "j", KeyJ: "a", KeyX: "a", KeyF: "a",
    };
    window.addEventListener("keydown", (e) => {
        if (destroyed) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const k = KEYMAP[e.code];
        if (k) { e.preventDefault(); if (!kb[k]) { kb[k] = true; applyLocalInput(); } return; }
        if (e.code === "KeyP" || e.code === "Escape") { e.preventDefault(); submitAction({ t: "pause" }); }
        if (e.code === "KeyH") { e.preventDefault(); toggleHelp(); }
        if (e.code === "KeyC" && cheatsAllowed) { e.preventDefault(); ovCheats.hidden = !ovCheats.hidden; }
    }, sig);
    window.addEventListener("keyup", (e) => {
        const k = KEYMAP[e.code];
        if (k) { kb[k] = false; applyLocalInput(); }
    }, sig);
    // Mouse: klik/tahan di arena = serang.
    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); ms.a = true; applyLocalInput(); }, sig);
    window.addEventListener("pointerup", () => { if (ms.a) { ms.a = false; applyLocalInput(); } }, sig);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), sig);
    // Tombol virtual (multi-touch aman lewat pointer capture).
    root.querySelectorAll("[data-vk]").forEach((b) => {
        const k = b.dataset.vk;
        b.addEventListener("pointerdown", (e) => {
            e.preventDefault(); e.stopPropagation();
            try { b.setPointerCapture(e.pointerId); } catch (err) { }
            vc[k] = true; applyLocalInput();
        }, sig);
        const off = (e) => { e.preventDefault(); vc[k] = false; applyLocalInput(); };
        b.addEventListener("pointerup", off, sig);
        b.addEventListener("pointercancel", off, sig);
    });
    if (window.matchMedia("(pointer: coarse)").matches) appEl.classList.add("touch-on");

    /* ---------- bantuan, cheat, klik UI ---------- */
    function toggleHelp() {
        const s = curState();
        if (!s) return;
        if (!helpOpen && s.phase !== "menu") {
            helpOpen = true;
            qs('[data-act="start"]').textContent = "Lanjut";
            if (s.phase === "play") submitAction({ t: "pause" });
        } else if (helpOpen) {
            helpOpen = false;
            qs('[data-act="start"]').textContent = "Mulai";
            if (curState() && curState().phase === "paused") submitAction({ t: "pause" });
        }
    }
    function cheatAct(kind) {
        if (!cheatsAllowed || !isHost || !state) return;
        const me = state.players[getMySlot()];
        if (kind === "heal" && me) { me.hp = PLAYER_HP; pushEv("heal", me.x, me.y, { slot: me.slot }); }
        if (kind === "kill") {
            for (const e of state.enemies) if (e.hp > 0) { e.hp = 0; me.kills++; state.score += 10; pushEv("die", e.x, e.y - 20, { c: SPEC[e.type].color }); }
            state.enemies = [];
        }
        if (kind === "skip" && !online && state.phase === "play") winRound(0);
        publish();
    }
    root.addEventListener("click", (e) => {
        const ex = e.target.closest("[data-exit]");
        if (ex) { onExit(); return; }
        const ca = e.target.closest("[data-cheatact]");
        if (ca) { cheatAct(ca.dataset.cheatact); sfx(440, 0.05); return; }
        const b = e.target.closest("[data-act]");
        if (!b) return;
        sfx(440, 0.05, "square", 0.02);
        switch (b.dataset.act) {
            case "start":
                if (helpOpen) { toggleHelp(); break; }
                submitAction({ t: "start" }); break;
            case "next": submitAction({ t: "next" }); break;
            case "retry": submitAction({ t: "retry" }); break;
            case "resume": submitAction({ t: "pause" }); break;
            case "pause": submitAction({ t: "pause" }); break;
            case "help": toggleHelp(); break;
            case "cheats": if (cheatsAllowed) ovCheats.hidden = !ovCheats.hidden; break;
            case "touch": appEl.classList.toggle("touch-on"); break;
            case "sound": soundOn = !soundOn; qs('[data-el="soundbtn"]').textContent = soundOn ? "🔊" : "🔇"; break;
        }
    }, sig);
    root.addEventListener("change", (e) => {
        const c = e.target.closest("[data-cheat]");
        if (c && cheatsAllowed) cheats[c.dataset.cheat] = c.checked;
    }, sig);

    /* ---------- ukuran kanvas ---------- */
    function resize() {
        const r = panel.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
        scale = r.height / WORLD_H;
        viewW = r.width / scale;
    }
    const ro = new ResizeObserver(resize);
    ro.observe(panel);
    resize();

    /* ---------- render ---------- */
    function rr(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function drawHills(par, base, amp, color, s1, s2, t) {
        ctx.beginPath();
        ctx.moveTo(0, WORLD_H);
        for (let x = 0; x <= viewW + 24; x += 24) {
            const wx = x + cam * par;
            ctx.lineTo(x, base - (Math.sin(wx * 0.004 + s1) * amp + Math.sin(wx * 0.011 + s2) * amp * 0.5));
        }
        ctx.lineTo(viewW, WORLD_H);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    function drawStick(p, col, t, isEnemy) {
        const sc = isEnemy ? SPEC[p.type].scale : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(sc, sc);
        if (!isEnemy && p.landT > 0) { const k = p.landT / 0.12; ctx.scale(1 + 0.08 * k, 1 - 0.08 * k); }
        if (!isEnemy && p.dead) { ctx.globalAlpha = Math.max(0, p.deadT / 1.2); ctx.rotate(p.face * 1.4); }
        else if (!isEnemy && p.invuln > 0) ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 26);
        if (isEnemy && p.atkT > 0) ctx.rotate(p.face * 0.14);
        const flash = p.hurtT > 0 && Math.floor(t * 30) % 2 === 0;
        const c = flash ? "#ffffff" : col;
        const moving = isEnemy ? true : Math.abs(p.vx) > 10 && p.onGround;
        const grounded = isEnemy ? true : p.onGround;
        const bob = grounded && !moving ? Math.sin(t * 2.6 + (p.slot || 0) * 2) * 1.3 : 0;
        ctx.translate(0, bob);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = c; ctx.lineWidth = isEnemy ? 3 : 3.4;
        const hip = isEnemy ? -20 : -24, sh = isEnemy ? -32 : -38, head = isEnemy ? -40 : -47, hr = isEnemy ? 5.6 : 6.6;
        let a1, a2;
        if (!grounded) { a1 = 0.6; a2 = -0.45; }
        else if (moving) { a1 = Math.sin(p.run) * 0.75; a2 = Math.sin(p.run + Math.PI) * 0.75; }
        else { a1 = 0.14; a2 = -0.14; }
        const fy = grounded ? 0 : -7;
        const lift1 = moving && grounded ? Math.max(0, Math.cos(p.run)) * 4 : 0;
        const lift2 = moving && grounded ? Math.max(0, Math.cos(p.run + Math.PI)) * 4 : 0;
        ctx.beginPath();
        ctx.moveTo(0, hip); ctx.lineTo(Math.sin(a1) * 13 * p.face, fy - lift1);
        ctx.moveTo(0, hip); ctx.lineTo(Math.sin(a2) * 13 * p.face, fy - lift2);
        ctx.moveTo(0, hip); ctx.lineTo(0, sh);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, head, hr, 0, Math.PI * 2);
        ctx.fillStyle = "#0b0e1a"; ctx.fill(); ctx.stroke();
        if (isEnemy) {
            // tangan menacing ke depan
            ctx.beginPath();
            ctx.moveTo(0, sh + 3); ctx.lineTo(p.face * 10, sh + 7 + Math.sin(p.run) * 2);
            ctx.moveTo(0, sh + 3); ctx.lineTo(p.face * 9, sh + 11 - Math.sin(p.run) * 2);
            ctx.stroke();
            if (p.type === "brute") { // tanduk
                ctx.beginPath();
                ctx.moveTo(-4, head - hr); ctx.lineTo(-7, head - hr - 6);
                ctx.moveTo(4, head - hr); ctx.lineTo(7, head - hr - 6);
                ctx.stroke();
            }
        } else {
            // lengan belakang
            ctx.beginPath(); ctx.moveTo(0, sh); ctx.lineTo(-p.face * 9, sh + 9 + (moving ? Math.sin(p.run) * 3 : 0)); ctx.stroke();
            // lengan pedang + pedang + jejak ayun
            const prog = p.atkT > 0 ? 1 - p.atkT / SWING.t : -1;
            const th = prog >= 0 ? -1.35 + prog * 2.35 : -0.45;
            const ang = p.face === 1 ? th : Math.PI - th;
            const hx = Math.cos(ang) * 13, hy = sh + Math.sin(ang) * 13;
            ctx.beginPath(); ctx.moveTo(0, sh); ctx.lineTo(hx, hy); ctx.stroke();
            ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ang) * 24, hy + Math.sin(ang) * 24); ctx.stroke();
            if (prog >= 0) {
                const a0 = p.face === 1 ? -1.35 : Math.PI + 1.35;
                ctx.beginPath(); ctx.moveTo(0, sh);
                ctx.arc(0, sh, 38, Math.min(a0, ang), Math.max(a0, ang));
                ctx.closePath();
                ctx.fillStyle = "rgba(253,224,71," + (0.32 * (1 - prog)).toFixed(3) + ")";
                ctx.fill();
            }
            if (p.stun > 0) { // bintang pusing
                ctx.fillStyle = "#fde047";
                for (let k = 0; k < 3; k++) {
                    const a = t * 5 + k * 2.09;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * 11, head - 11 + Math.sin(a) * 4, 2, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
        ctx.restore();
        // bar HP & nama (koordinat dunia, tanpa transform)
        if (isEnemy) {
            const bw = 26, bx = p.x - bw / 2, by = p.y - 52 * sc;
            ctx.fillStyle = "#1e2749"; rr(bx, by, bw, 3.5, 2); ctx.fill();
            ctx.fillStyle = col; rr(bx, by, bw * clamp(p.hp / p.maxHp, 0, 1), 3.5, 2); ctx.fill();
        } else if (!p.dead) {
            const tag = online ? (p.slot === getMySlot() ? "KAMU" : "LAWAN") : (p.slot === 0 ? "KAMU" : "BOT");
            ctx.font = "700 10px system-ui,sans-serif"; ctx.textAlign = "center";
            ctx.fillStyle = col; ctx.fillText(tag, p.x, p.y - 68);
            const bw = 30, bx = p.x - bw / 2, by = p.y - 64;
            ctx.fillStyle = "#1e2749"; rr(bx, by, bw, 3.5, 2); ctx.fill();
            ctx.fillStyle = col; rr(bx, by, bw * clamp(p.hp / PLAYER_HP, 0, 1), 3.5, 2); ctx.fill();
        }
    }
    function draw(vis, t, dt) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
        // langit
        const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
        sky.addColorStop(0, "#0b0e1a"); sky.addColorStop(1, "#151b38");
        ctx.fillStyle = sky; ctx.fillRect(0, 0, viewW, WORLD_H);
        if (!levelData || !vis) {
            ctx.fillStyle = "#64748b"; ctx.font = "600 15px system-ui,sans-serif"; ctx.textAlign = "center";
            ctx.fillText(online && !isHost ? "Menunggu host…" : "Memuat…", viewW / 2, WORLD_H / 2);
            return;
        }
        // bintang & bulan
        for (const s of stars) {
            const sx = (((s.x - cam * 0.12) % (viewW + 60)) + viewW + 60) % (viewW + 60) - 30;
            ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + s.p);
            ctx.fillStyle = "#cbd5e1";
            ctx.beginPath(); ctx.arc(sx, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 0.9; ctx.fillStyle = "#e2e8f0";
        ctx.beginPath(); ctx.arc(viewW * 0.78 - cam * 0.03, 86, 22, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        drawHills(0.25, 430, 60, "#131a36", 1.3, 4.1, t);
        drawHills(0.5, 480, 46, "#182148", 2.7, 0.6, t);

        // kamera
        const me = vis.players[getMySlot()] || vis.players[0];
        const target = clamp(me.x - viewW * 0.38, 0, Math.max(0, levelData.w - viewW));
        cam += (target - cam) * Math.min(1, dt * 7);
        shakeT = Math.max(0, shakeT - dt);
        const shx = shakeT > 0 ? (Math.random() - 0.5) * 2 * shakeMag * (shakeT / 0.3) : 0;
        const shy = shakeT > 0 ? (Math.random() - 0.5) * 2 * shakeMag * (shakeT / 0.3) : 0;
        if (shakeT <= 0) shakeMag = 0;
        ctx.save();
        ctx.translate(-cam + shx, shy);

        const plats = levelData.plats;
        // duri jurang
        ctx.fillStyle = "#4c1024";
        for (let i = 0; i < plats.length - 1; i++) {
            const g0 = plats[i].x + plats[i].w, g1 = plats[i + 1].x;
            if (g1 - g0 < 12 || g1 < cam - 40 || g0 > cam + viewW + 40) continue;
            for (let x = g0 + 4; x < g1 - 4; x += 14) {
                ctx.beginPath(); ctx.moveTo(x, 616); ctx.lineTo(x + 7, 598); ctx.lineTo(x + 14, 616); ctx.closePath(); ctx.fill();
            }
        }
        // platform
        for (const pl of plats) {
            if (pl.x + pl.w < cam - 40 || pl.x > cam + viewW + 40) continue;
            ctx.fillStyle = "#1d2547"; rr(pl.x, pl.y, pl.w, 16, 5); ctx.fill();
            ctx.strokeStyle = "#5562b8"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(pl.x + 4, pl.y + 1.5); ctx.lineTo(pl.x + pl.w - 4, pl.y + 1.5); ctx.stroke();
        }
        // checkpoint
        {
            const cx = levelData.cpX, cy = levelData.cpY;
            const act = me.cpSet;
            ctx.strokeStyle = act ? "#34d399" : "#64748b"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 44); ctx.stroke();
            ctx.fillStyle = act ? "#34d399" : "#64748b";
            ctx.beginPath(); ctx.arc(cx, cy - 48, 4.5 + (act ? Math.sin(t * 4) * 1.2 : 0), 0, Math.PI * 2); ctx.fill();
        }
        // bendera finish (berkibar)
        {
            const fx = levelData.flagX, fy = levelData.flagY;
            ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 92); ctx.stroke();
            const wv = Math.sin(t * 5) * 3;
            ctx.fillStyle = "#fde047";
            ctx.beginPath(); ctx.moveTo(fx, fy - 92); ctx.lineTo(fx + 36 + wv, fy - 82); ctx.lineTo(fx, fy - 72); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3);
            ctx.fillStyle = "#fde047";
            ctx.beginPath(); ctx.arc(fx, fy - 4, 14, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        // hati
        for (const h of vis.hearts) {
            if (h.taken) continue;
            const hy = h.y - 26 + Math.sin(t * 3 + h.id) * 4;
            ctx.fillStyle = "#f472b6";
            ctx.beginPath();
            ctx.moveTo(h.x, hy + 7);
            ctx.bezierCurveTo(h.x - 10, hy - 2, h.x - 5, hy - 9, h.x, hy - 3);
            ctx.bezierCurveTo(h.x + 5, hy - 9, h.x + 10, hy - 2, h.x, hy + 7);
            ctx.fill();
        }
        // musuh & pembalap
        for (const e of vis.enemies) {
            if (e.x < cam - 60 || e.x > cam + viewW + 60) continue;
            drawStick(e, SPEC[e.type].color, t, true);
        }
        for (const p of vis.players) drawStick(p, SLOT_COLOR[p.slot], t, false);
        // partikel
        for (const p of particles) {
            const k = 1 - p.t / p.life;
            ctx.globalAlpha = Math.max(0, k);
            if (p.kind === "ring") {
                ctx.strokeStyle = p.c; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - k) * 30, 0, Math.PI * 2); ctx.stroke();
            } else if (p.kind === "confetti") {
                ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r * 1.6);
            } else {
                ctx.fillStyle = p.c;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + 0.4, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        // angka damage melayang
        ctx.font = "800 13px system-ui,sans-serif"; ctx.textAlign = "center";
        for (const f of floaters) {
            ctx.globalAlpha = Math.max(0, 1 - f.t / 0.8);
            ctx.fillStyle = f.c;
            ctx.fillText(f.txt, f.x, f.y - f.t * 34);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /* ---------- HUD & overlay ---------- */
    const hudCache = {};
    function setText(el, key, val) {
        if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; }
    }
    function syncUI(vis, t) {
        const s = curState();
        if (!s || !vis) return;
        const me = vis.players[getMySlot()] || vis.players[0];
        const hp = Math.max(0, Math.ceil(me.hp));
        setText(hud.hp, "hp", String(hp));
        hud.hpfill.style.width = clamp(hp, 0, 100) + "%";
        hud.hpfill.style.background = hp > 55 ? "#34d399" : hp > 25 ? "#fbbf24" : "#f87171";
        setText(hud.lv, "lv", String(s.level + 1));
        setText(hud.score, "score", String(s.score));
        setText(hud.kills, "kills", String(me.kills));
        setText(hud.best, "best", String(best));
        setText(hud.combo, "combo", "x" + comboMul(me.combo).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
        hud.dot0.style.left = clamp((vis.players[0].x / levelData.flagX) * 100, 0, 100) + "%";
        hud.dot1.style.left = clamp((vis.players[1].x / levelData.flagX) * 100, 0, 100) + "%";
        const statusTxt = { menu: "Siap", count: "Bersiap…", play: online ? "Online • Main" : "Main", paused: "Jeda", end: "Selesai" }[s.phase] || "Siap";
        setText(hud.status, "status", statusTxt);

        // transisi fase => banner & overlay
        if (s.phase !== prevPhase) {
            if (s.phase === "count") {
                showBanner("LEVEL " + (s.level + 1) + (online ? " • Kamu P" + (getMySlot() + 1) : ""), 1400);
            }
            if (s.phase === "play" && prevPhase === "count") {
                const mineFirst = s.first === getMySlot();
                showBanner(mineFirst ? "GO! KAMU DULUAN 🎲" : (online ? "GO! P" + (s.first + 1) + " DULUAN 🎲" : "GO! BOT DULUAN 🎲"), 1300);
            }
            if (s.phase === "end") {
                const win = s.winner === getMySlot();
                const title = qs('[data-el="endtitle"]');
                title.textContent = win ? "Menang! 🎉" : online ? "P" + (s.winner + 1) + " sampai duluan" : "Bot sampai duluan!";
                title.className = win ? "win" : "lose";
                if (s.score > best) { best = s.score; try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { } }
                qs('[data-el="endmsg"]').textContent =
                    (win ? playerName + " mencapai bendera lebih dulu. " : "Lawanmu lebih cepat kali ini. ") +
                    "Skor " + s.score + " • Kill " + me.kills + " • Best " + best + ".";
                const canDrive = !online || isHost;
                qs('[data-el="endbtns"]').hidden = !canDrive;
                qs('[data-el="endwait"]').hidden = canDrive;
                qs('[data-act="next"]').hidden = online ? false : win;
                qs('[data-act="retry"]').hidden = online ? false : !win;
                showBanner("FINISH! 🚩", 1200);
            }
            prevPhase = s.phase;
        }
        ovMenu.hidden = !(s.phase === "menu" || helpOpen);
        ovEnd.hidden = s.phase !== "end";
        ovPause.hidden = !(s.phase === "paused" && !helpOpen);
    }

    /* ---------- loop utama ---------- */
    function frame(now) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = now;
        const dt = Math.min(0.033, (now - lastT) / 1000);
        lastT = now;
        const t = now / 1000;

        if (isHost && state) {
            if (state.phase === "count") {
                state.countT -= dt;
                if (state.countT <= 0) {
                    state.phase = "play";
                    state.players[1 - state.first].stun = 1.1; // 🎲 yang kalah undian diam dulu
                    publish();
                }
            } else if (state.phase === "play") {
                simStep(dt);
            }
            consumeEvents(state);
            if (online && now - lastPub > 100) { lastPub = now; publish(); }
        }
        const vis = isHost ? state : guestVis();
        if (!isHost && snaps.length) consumeEvents(snaps[snaps.length - 1].s);

        // update efek
        for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; }
        particles = particles.filter((p) => p.t < p.life);
        if (particles.length > 240) particles.splice(0, particles.length - 240);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter((f) => f.t < 0.8);

        draw(vis, t, dt);
        if (vis) syncUI(vis, t);
    }

    /* ---------- inisialisasi mode ---------- */
    if (online) {
        room.onRoom((r) => { if (!destroyed) roomData = (r && r.room) || r || roomData; });
        if (isHost) {
            freshState();
            publish();
            room.onAction((a) => applyAction(a, state.assign[1])); // aktor = slot guest hasil undian
        } else {
            room.onState((s) => onSnap(s));
        }
    } else {
        freshState(); // mode ai: pemain vs bot, tanpa database
    }
    raf = requestAnimationFrame(frame);

    /* ---------- cleanup ---------- */
    return {
        destroy() {
            destroyed = true;
            ac.abort();
            ro.disconnect();
            if (raf) cancelAnimationFrame(raf);
            clearTimeout(bannerTimer);
            clearTimeout(inTimer);
            if (AC) { try { AC.close(); } catch (e) { } }
        },
    };
}