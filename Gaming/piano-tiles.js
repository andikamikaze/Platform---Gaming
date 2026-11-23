/*
  Piano Tiles — format template baru (META + mount).
  1. META.id harus sama dengan nama file tanpa .js  → "piano-tiles"
  2. Logika game ada di mount().
  3. Setelah menyimpan file, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "piano-tiles",
    name: "Piano Tiles",
    category: "music",
    catLabel: "Music",
    desc: "Ketuk balok piano tepat di garis nada. PERFECT = poin besar, 3 miss lagu berakhir. Solo, lawan bot, atau duet online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="12" height="40" rx="2"/><rect x="18" y="4" width="12" height="40" rx="2"/><rect x="32" y="4" width="12" height="40" rx="2"/><path d="M24 30v10m0-10l-4 4m4-4l4 4"/></svg>',
    bg: ["#e9d5ff", "#a855f7"],
    bestKey: "pianoTilesBest",
};

/* ================= aturan murni (deterministik) ================= */
const LANES = 4, LANE_W = 80, BOARD_W = 320, BOARD_H = 480;
const TILE_H = 80, ZONE_TOP = 360, ZONE_CENTER = 415, ZONE_BOT = 478;
const PERFECT = 24, GOOD = 60, STRIKES = 3, WIN_ACC = 0.7;
const MIN_INTERVAL = 0.30; // detik minimum antar-balok pada kecepatan maksimum
const LANE_FREQ = [262, 330, 392, 494];
const KEYS = { d: 0, f: 1, j: 2, k: 3 };
const COLORS = ["#111827", "#0f766e"]; // P1 hitam, P2 teal

const DIFFS = {
    easy: { label: "Mudah", song: 24, speed0: 200, rate: 4, speedMax: 330, gap: 200, botMiss: 0.14 },
    normal: { label: "Normal", song: 36, speed0: 230, rate: 6, speedMax: 400, gap: 185, botMiss: 0.08 },
    hard: { label: "Sulit", song: 48, speed0: 260, rate: 8, speedMax: 470, gap: 165, botMiss: 0.045 },
};

/* PRNG ber-seed → chart sama di semua klien multiplayer (cukup kirim seed) */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Generator level acak dengan kendala kelayakan:
   - tidak pernah lajur sama dua kali berturut-turut
   - maksimal 2 lompatan lebar (jarak 3) beruntun
   - jarak antar-balok / kecepatan maksimum >= MIN_INTERVAL */
function makeChart(seed, n) {
    const rnd = mulberry32(seed);
    const out = [];
    let prev = -1, wide = 0;
    for (let i = 0; i < n; i++) {
        const cand = [];
        for (let l = 0; l < LANES; l++) {
            if (l === prev) continue;
            if (wide >= 2 && prev >= 0 && Math.abs(l - prev) === 3) continue;
            cand.push(l);
        }
        const l = cand[Math.floor(rnd() * cand.length)];
        out.push(l);
        wide = (prev >= 0 && Math.abs(l - prev) === 3) ? wide + 1 : 0;
        prev = l;
    }
    return out;
}

/* Validator: level hanya dipakai jika terbukti bisa diselesaikan */
function isSolvable(chart, c) {
    if (chart.length !== c.song) return false;
    if (c.gap / c.speedMax < MIN_INTERVAL) return false;
    if ((GOOD * 2) / c.speedMax < 0.2) return false; // waktu di zona GOOD cukup untuk manusia
    let wide = 0;
    for (let i = 0; i < chart.length; i++) {
        const l = chart[i];
        if (l < 0 || l >= LANES) return false;
        if (i > 0) {
            const d = Math.abs(l - chart[i - 1]);
            if (d === 0) return false;
            if (d === 3) { wide++; if (wide > 2) return false; }
            else wide = 0;
        }
    }
    return true;
}

function generateLevel(diffKey) {
    const d = DIFFS[diffKey] || DIFFS.normal;
    const base = (Math.random() * 0x7fffffff) | 0;
    for (let k = 0; k < 25; k++) {
        const s = (base + k * 7919) >>> 0;
        const chart = makeChart(s, d.song);
        if (isSolvable(chart, d)) return { seed: s, chart };
    }
    // fallback deterministik yang dijamin valid
    const chart = [];
    for (let i = 0; i < d.song; i++) chart.push(i % LANES);
    return { seed: 0, chart };
}

/* Posisi = fungsi murni dari waktu (kecepatan naik linear lalu capped).
   Deterministik → tidak ada drift integrasi frame, sinkron antar klien. */
function distAt(t, c) {
    if (t <= 0) return 0;
    const tc = (c.speedMax - c.speed0) / c.rate;
    if (t < tc) return c.speed0 * t + 0.5 * c.rate * t * t;
    const dc = c.speed0 * tc + 0.5 * c.rate * tc * tc;
    return dc + c.speedMax * (t - tc);
}

function judge(dist, mult) {
    const m = mult || 1, d = Math.abs(dist);
    if (d <= PERFECT * m) return "perfect";
    if (d <= GOOD * m) return "good";
    return "miss";
}

/* ============================ mount ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    /* ---- runtime lokal (tidak diserialisasi ke Firebase) ---- */
    let chart = [], tiles = [], currentKey = "";
    let simT = 0, lastT = 0, roundLocalStart = 0, rafId = 0;
    let paused = false, uiOv = null, muted = false, newBest = false;
    const cheats = { auto: false, slow: false, wide: false, shield: false, nerf: false };
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }

    /* ---- audio synth kecil (tanpa aset) ---- */
    let AC = null;
    function actx() {
        if (!AC) {
            try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { AC = null; }
        }
        if (AC && AC.state === "suspended") AC.resume();
        return AC;
    }
    function tone(freq, dur, type, vol) {
        const c = actx();
        if (!c || muted) return;
        try {
            const t = c.currentTime;
            const o = c.createOscillator(), g = c.createGain();
            o.type = type || "sine";
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol || 0.22, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + dur + 0.05);
        } catch (e) { }
    }

    /* ---- UI minimalis, semua CSS di-scope ke .pt-root ---- */
    root.classList.add("pt-root");
    root.innerHTML = `
<style>
.pt-root{--me:#111827;--op:#0f766e;--accent:#8b5cf6;--ink:#1f2937;--mut:#6b7280;--line:#e5e7eb;--bg:#fbfbfd;
  color:var(--ink);font-family:inherit;-webkit-tap-highlight-color:transparent}
.pt-root [hidden]{display:none!important}
.pt-root .pt-app{max-width:560px;margin:0 auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.pt-root .pt-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.pt-root .pt-intro h2{margin:0;font-size:20px;font-weight:700;letter-spacing:-.02em}
.pt-root .pt-intro p{margin:2px 0 0;font-size:13px;color:var(--mut)}
.pt-root .pt-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);
  border:1px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap;background:#fff}
.pt-root .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);display:inline-block}
.pt-root .pt-panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;
  display:flex;flex-direction:column;gap:10px}
.pt-root .pt-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--mut)}
.pt-root .pt-chip{border:1px solid var(--line);border-radius:999px;padding:3px 9px;background:#fff}
.pt-root .pt-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.pt-root .pt-chip.soft{background:var(--bg)}
.pt-root .pt-spacer{flex:1}
.pt-root .pt-board{position:relative;width:min(100%,340px);margin:0 auto;user-select:none}
.pt-root .pt-prog{height:3px;border-radius:2px;background:var(--line);overflow:hidden;margin-bottom:8px}
.pt-root .pt-prog i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
.pt-root .pt-svg{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:14px;
  background:var(--bg);touch-action:manipulation}
.pt-root .pt-lane{fill:#ffffff;stroke:#eef0f3;stroke-width:1;cursor:pointer}
.pt-root .pt-lane:active{fill:#f5f3ff}
.pt-root .pt-zone{fill:#8b5cf60d;stroke:#8b5cf633;stroke-dasharray:5 5}
.pt-root .pt-line{stroke:var(--accent);stroke-width:2}
.pt-root .pt-tile{stroke:none}
.pt-root .pt-tile.mine{stroke:var(--accent);stroke-width:2}
.pt-root .pt-tile.hit{fill:#86efac;opacity:.5;stroke:none}
.pt-root .pt-judge,.pt-root .pt-toast{font-family:inherit;font-weight:800;text-anchor:middle;opacity:0}
.pt-root .pt-judge{font-size:26px}
.pt-root .pt-toast{font-size:17px;fill:var(--ink)}
.pt-root .pt-judge.show{animation:ptJudge .55s ease-out}
.pt-root .pt-toast.show{animation:ptToast 1.6s ease-out}
@keyframes ptJudge{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-24px)}}
@keyframes ptToast{0%{opacity:0}12%{opacity:1}75%{opacity:1}100%{opacity:0}}
.pt-root .pt-pad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:min(100%,340px);margin:0 auto}
.pt-root .pt-key{height:56px;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
  font:inherit;font-weight:700;font-size:15px;color:var(--ink);touch-action:manipulation;transition:transform .05s}
.pt-root .pt-key i{width:22px;height:4px;border-radius:2px;background:var(--me)}
.pt-root .pt-key:active{transform:scale(.94);background:#f5f3ff;border-color:var(--accent)}
@media (hover:hover) and (pointer:fine){.pt-root .pt-key{height:42px}}
.pt-root .pt-legend{display:flex;gap:14px;justify-content:center;font-size:12px;color:var(--mut)}
.pt-root .pt-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}
.pt-root .pt-legend [data-el="swMe"]{background:var(--me)}
.pt-root .pt-legend [data-el="swOp"]{background:var(--op)}
.pt-root .pt-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:#ffffffd9;backdrop-filter:blur(3px);border-radius:14px;padding:12px;z-index:5}
.pt-root .pt-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;
  width:100%;max-width:300px;max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:10px;
  box-shadow:0 8px 30px #11182714;text-align:center}
.pt-root .pt-card h3{margin:0;font-size:18px;letter-spacing:-.02em}
.pt-root .pt-sub{margin:0;font-size:13px;color:var(--mut);line-height:1.5}
.pt-root .pt-hint{margin:0;font-size:11px;color:var(--mut)}
.pt-root .pt-rows{display:flex;flex-direction:column;gap:8px}
.pt-root .pt-row{display:flex;align-items:center;justify-content:space-between;font-size:13px;gap:8px}
.pt-root select{font:inherit;font-size:13px;border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:#fff;color:var(--ink)}
.pt-root .pt-btn{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);border-radius:10px;
  background:#fff;color:var(--ink);padding:8px 12px;cursor:pointer;transition:background .12s}
.pt-root .pt-btn:hover{background:#f3f4f6}
.pt-root .pt-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.pt-root .pt-btn.primary:hover{background:#7c3aed}
.pt-root .pt-btn:disabled{opacity:.45;cursor:not-allowed}
.pt-root .pt-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.pt-root .pt-help{text-align:left;font-size:13px;line-height:1.55;display:flex;flex-direction:column;gap:8px}
.pt-root .pt-help b{display:block;font-size:13px}
.pt-root .pt-cheatrow{display:flex;align-items:center;gap:8px;font-size:13px;text-align:left}
.pt-root .pt-cheatrow input{width:16px;height:16px;accent-color:var(--accent)}
.pt-root .pt-stats{width:100%;border-collapse:collapse;font-size:12px}
.pt-root .pt-stats td,.pt-root .pt-stats th{padding:4px 6px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums}
.pt-root .pt-stats td:first-child,.pt-root .pt-stats th:first-child{text-align:left;color:var(--mut);font-weight:400}
.pt-root .pt-badge{margin:0;font-size:11px;color:#b45309;background:#fef3c7;border-radius:8px;padding:5px 8px}
</style>
<div class="game-app pt-app">
  <div class="game-intro pt-intro">
    <div><h2>Piano Tiles</h2><p>Ketuk balok tepat di garis nada. PERFECT = poin besar, 3 miss lagu berakhir.</p></div>
    <span class="game-status pt-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>
  <section class="game-panel pt-panel" data-board>
    <div class="pt-hud">
      <span class="pt-chip">Skor <b data-hud="score">0</b></span>
      <span class="pt-chip">Combo <b data-hud="combo">0</b></span>
      <span class="pt-chip">Balok <b data-hud="tiles">0</b>/<b data-hud="song">0</b></span>
      <span class="pt-chip" data-el="oppChip" hidden><span data-el="oppName">Bot</span> <b data-hud="oscore">0</b> · <b data-hud="ostrikes">0</b>✗</span>
      <span class="pt-spacer"></span>
      <span class="pt-chip soft" data-el="modeChip">VS Bot</span>
      <span class="pt-chip soft">Rekor <b data-hud="best">0</b></span>
    </div>
    <div class="pt-board">
      <div class="pt-prog"><i data-el="prog"></i></div>
      <svg class="pt-svg" viewBox="0 0 320 480" data-el="svg" aria-label="Lajur Piano Tiles">
        <g data-el="lanes"></g>
        <rect class="pt-zone" x="0" y="360" width="320" height="118" pointer-events="none"/>
        <line class="pt-line" x1="0" y1="415" x2="320" y2="415" pointer-events="none"/>
        <g data-el="tiles" pointer-events="none"></g>
        <g data-el="strikes" transform="translate(16,18)" pointer-events="none"></g>
        <text class="pt-judge" data-el="judge" x="160" y="252" pointer-events="none"></text>
        <text class="pt-toast" data-el="toast" x="160" y="150" pointer-events="none"></text>
      </svg>

      <div class="pt-ov" data-ov="start">
        <div class="pt-card">
          <h3>Piano Tiles 🎹</h3>
          <p class="pt-sub">Balok jatuh dari atas — ketuk <b>balok milikmu</b> saat menyentuh garis ungu. Jangan ketuk lajur kosong!</p>
          <div class="pt-rows" data-el="startLocal">
            <label class="pt-row" data-el="rowMode">Mode
              <select data-el="selMode"><option value="bot" selected>VS Bot</option><option value="solo">Solo</option></select>
            </label>
            <label class="pt-row">Tingkat
              <select data-el="selDiff"><option value="easy">Mudah</option><option value="normal" selected>Normal</option><option value="hard">Sulit</option></select>
            </label>
            <button class="pt-btn primary" type="button" data-act="start">▶ Mulai</button>
          </div>
          <p class="pt-sub" data-el="startWait" hidden>Menunggu host memulai permainan…</p>
          <button class="pt-btn" type="button" data-act="tutorial">📖 Cara bermain</button>
          <p class="pt-hint">D F J K = lajur · Spasi = mulai/jeda · P = jeda · M = suara · C = cheat</p>
        </div>
      </div>

      <div class="pt-ov" data-ov="over" hidden>
        <div class="pt-card">
          <h3 data-el="ovTitle">Lagu berakhir</h3>
          <p class="pt-sub" data-el="ovReason"></p>
          <div data-el="ovStats"></div>
          <p class="pt-badge" data-el="ovBadge" hidden>🧪 Cheat aktif — rekor tidak disimpan.</p>
          <p class="pt-hint" data-el="ovBest"></p>
          <button class="pt-btn primary" type="button" data-act="restart" data-el="btnAgain">↻ Main lagi</button>
          <button class="pt-btn" type="button" data-act="menu" data-el="btnMenu">☰ Menu</button>
          <p class="pt-hint" data-el="ovWait" hidden>Host dapat memulai ulang.</p>
        </div>
      </div>

      <div class="pt-ov" data-ov="pause" hidden>
        <div class="pt-card">
          <h3>⏸ Jeda</h3>
          <button class="pt-btn primary" type="button" data-act="resume">▶ Lanjutkan</button>
          <button class="pt-btn" type="button" data-act="restart">↻ Ulang dari awal</button>
        </div>
      </div>

      <div class="pt-ov" data-ov="tutorial" hidden>
        <div class="pt-card">
          <h3>📖 Cara bermain</h3>
          <div class="pt-help">
            <div><b>🎯 Tujuan</b>Ketuk balok milikmu saat pusatnya melewati garis ungu. Solo: selesaikan lagu dengan akurasi ≥ 70%. 3 miss = lagu berakhir.</div>
            <div><b>🎮 Kontrol</b>Keyboard <b>D F J K</b>, klik lajur, atau tombol virtual di bawah papan. Spasi mulai/jeda, P jeda, M suara, C cheat, H bantuan.</div>
            <div><b>⭐ Penilaian</b>PERFECT (≤ 24px dari garis): 100 + bonus combo. GOOD (≤ 60px): 60 + bonus combo. Di luar itu / lajur kosong: MISS.</div>
            <div><b>👥 Mode</b>Solo: semua balok milikmu. VS Bot &amp; Online: balok bergantian milik dua pemain — koin menentukan siapa dapat balok pertama, dan posisi P1/P2 diacak tiap ronde. Hanya ketuk balok bergaris ungu (milikmu)!</div>
            <div><b>🧪 Cheat</b>Hanya mode lokal. Saat cheat aktif, rekor tidak disimpan.</div>
          </div>
          <button class="pt-btn primary" type="button" data-act="close">Mengerti</button>
        </div>
      </div>

      <div class="pt-ov" data-ov="cheat" hidden>
        <div class="pt-card">
          <h3>🧪 Cheat</h3>
          <p class="pt-hint">Mode lokal saja · rekor tidak disimpan saat cheat aktif.</p>
          <label class="pt-cheatrow"><input type="checkbox" data-cheat="auto"> Auto-play (balokmu diketuk sempurna)</label>
          <label class="pt-cheatrow"><input type="checkbox" data-cheat="slow"> Slow-motion (0,6×)</label>
          <label class="pt-cheatrow"><input type="checkbox" data-cheat="wide"> Zona penilaian lebar (1,8×)</label>
          <label class="pt-cheatrow"><input type="checkbox" data-cheat="shield"> Anti-miss (miss tidak menambah ✗)</label>
          <label class="pt-cheatrow" data-el="nerfRow"><input type="checkbox" data-cheat="nerf"> Bot kacau (50% gagal)</label>
          <button class="pt-btn" type="button" data-act="forcewin" data-el="btnWin">🏆 Menang instan</button>
          <button class="pt-btn primary" type="button" data-act="close">Tutup</button>
        </div>
      </div>
    </div>

    <div class="pt-pad">
      <button type="button" class="pt-key" data-lane="0" aria-label="Lajur 1 (D)"><b>D</b><i></i></button>
      <button type="button" class="pt-key" data-lane="1" aria-label="Lajur 2 (F)"><b>F</b><i></i></button>
      <button type="button" class="pt-key" data-lane="2" aria-label="Lajur 3 (J)"><b>J</b><i></i></button>
      <button type="button" class="pt-key" data-lane="3" aria-label="Lajur 4 (K)"><b>K</b><i></i></button>
    </div>
    <div class="pt-legend" data-el="legend" hidden>
      <span><i data-el="swMe"></i>Kamu</span>
      <span><i data-el="swOp"></i><span data-el="opName">Bot</span></span>
    </div>
  </section>
  <div class="game-actions pt-actions">
    <button class="game-action-button pt-btn" type="button" data-act="restart" data-el="btnRestart">↻ Ulang</button>
    <button class="game-action-button pt-btn" type="button" data-act="pause" data-el="btnPause">⏸ Jeda</button>
    <button class="game-action-button pt-btn" type="button" data-act="mute" data-el="btnMute" aria-label="Suara">🔊</button>
    <button class="game-action-button pt-btn" type="button" data-act="cheat" data-el="btnCheat">🧪 Cheat</button>
    <button class="game-action-button pt-btn" type="button" data-act="tutorial">❓ Cara main</button>
    <button class="game-action-button pt-btn" type="button" data-exit>✕ Keluar</button>
  </div>
</div>`;

    /* ---- refs ---- */
    const $ = (s) => root.querySelector(s);
    const lanesG = $('[data-el="lanes"]'), tilesG = $('[data-el="tiles"]'), strikesG = $('[data-el="strikes"]');
    const judgeEl = $('[data-el="judge"]'), toastEl = $('[data-el="toast"]'), progEl = $('[data-el="prog"]');
    const statusEl = $('[data-status]'), modeChip = $('[data-el="modeChip"]');
    const hud = {
        score: $('[data-hud="score"]'), combo: $('[data-hud="combo"]'), tiles: $('[data-hud="tiles"]'),
        song: $('[data-hud="song"]'), best: $('[data-hud="best"]'),
        oscore: $('[data-hud="oscore"]'), ostrikes: $('[data-hud="ostrikes"]'),
    };
    const ovs = {
        start: $('[data-ov="start"]'), over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'),
        tutorial: $('[data-ov="tutorial"]'), cheat: $('[data-ov="cheat"]'),
    };
    const selMode = $('[data-el="selMode"]'), selDiff = $('[data-el="selDiff"]');
    const btnRestart = $('[data-el="btnRestart"]'), btnPause = $('[data-el="btnPause"]'),
        btnMute = $('[data-el="btnMute"]'), btnCheat = $('[data-el="btnCheat"]');
    const oppChip = $('[data-el="oppChip"]'), oppName = $('[data-el="oppName"]'), legend = $('[data-el="legend"]');
    const opName = $('[data-el="opName"]'), nerfRow = $('[data-el="nerfRow"]'), btnWin = $('[data-el="btnWin"]');
    const startLocal = $('[data-el="startLocal"]'), startWait = $('[data-el="startWait"]'), rowMode = $('[data-el="rowMode"]');
    const ovTitle = $('[data-el="ovTitle"]'), ovReason = $('[data-el="ovReason"]'), ovStats = $('[data-el="ovStats"]'),
        ovBadge = $('[data-el="ovBadge"]'), ovBest = $('[data-el="ovBest"]'),
        btnAgain = $('[data-el="btnAgain"]'), btnMenu = $('[data-el="btnMenu"]'), ovWait = $('[data-el="ovWait"]');

    /* ---- helper state ---- */
    const mkPlayer = (name) => ({ name, score: 0, combo: 0, maxCombo: 0, hits: 0, perfect: 0, good: 0, misses: 0, strikes: 0 });
    const anyCheat = () => !online && Object.values(cheats).some(Boolean);
    const cfg = () => ({ song: state.song, gap: state.gap, speed0: state.speed0, rate: state.rate, speedMax: state.speedMax });
    const mySlot = () => (online && state ? (room.isHost ? state.hostSlot : 1 - state.hostSlot) : 0);
    const ownerOf = (i) => (state.modeKey === "solo" ? 0 : (state.first + i) % 2);
    const colorOf = (slot) => COLORS[slot];

    function idleState() {
        const s = {
            roundId: "idle", status: "idle", modeKey: online ? "duet" : "bot", difficulty: "normal",
            seed: 0, song: 0, gap: 185, speed0: 230, rate: 6, speedMax: 400,
            first: 0, hostSlot: 0, startAt: 0, resolved: 0, results: {},
            winner: null, striker: -1, endReason: null, cheated: false,
            players: [mkPlayer(""), mkPlayer("")],
        };
        return s;
    }
    function namePlayers(s) {
        const me = online ? (room.isHost ? s.hostSlot : 1 - s.hostSlot) : 0;
        s.players[me].name = playerName || "Kamu";
        s.players[1 - me].name = online ? "Lawan" : (s.modeKey === "bot" ? "Bot" : "—");
    }
    function ownedCount(slot) {
        if (state.modeKey === "solo") return slot === 0 ? state.song : 0;
        let n = 0;
        for (let i = 0; i < state.song; i++) if (ownerOf(i) === slot) n++;
        return n;
    }

    /* ---- rendering ---- */
    function renderLanes() {
        let h = "";
        for (let l = 0; l < LANES; l++)
            h += `<rect class="pt-lane" data-lane="${l}" x="${l * LANE_W}" y="0" width="${LANE_W}" height="${BOARD_H}"/>`;
        lanesG.innerHTML = h;
    }
    function renderTiles() {
        if (!state) { tilesG.innerHTML = ""; return; }
        let h = "";
        const me = mySlot();
        for (const t of tiles) {
            if (t.done === "gone") continue;
            const x = t.lane * LANE_W + 6, w = LANE_W - 12, ht = TILE_H - 6, y = t.y.toFixed(1);
            if (t.done === "hit") {
                if (t.y > BOARD_H + 10) continue;
                h += `<rect class="pt-tile hit" x="${x}" y="${y}" width="${w}" height="${ht}" rx="10"/>`;
            } else {
                h += `<rect class="pt-tile${t.owner === me ? " mine" : ""}" x="${x}" y="${y}" width="${w}" height="${ht}" rx="10" fill="${colorOf(t.owner)}"/>`;
            }
        }
        tilesG.innerHTML = h;
    }
    function renderStrikes() {
        const s = state ? state.players[mySlot()].strikes : 0;
        let h = "";
        for (let i = 0; i < STRIKES; i++)
            h += `<circle cx="${i * 20}" cy="0" r="6" fill="${i < s ? "#ef4444" : "#e5e7eb"}"/>`;
        strikesG.innerHTML = h;
    }
    function flashJudge(txt, color) {
        judgeEl.textContent = txt;
        judgeEl.setAttribute("fill", color);
        judgeEl.classList.remove("show");
        void judgeEl.getBoundingClientRect();
        judgeEl.classList.add("show");
    }
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.remove("show");
        void toastEl.getBoundingClientRect();
        toastEl.classList.add("show");
    }
    function missFx() { flashJudge("MISS", "#ef4444"); tone(110, 0.16, "sawtooth", 0.12); }

    function renderHud() {
        const me = mySlot();
        const p = state ? state.players[me] : null;
        const o = state ? state.players[1 - me] : null;
        hud.score.textContent = String(p ? p.score : 0);
        hud.combo.textContent = String(p ? p.combo : 0);
        hud.tiles.textContent = String(state ? state.resolved : 0);
        hud.song.textContent = String(state ? state.song : 0);
        hud.best.textContent = String(best);
        hud.oscore.textContent = String(o ? o.score : 0);
        hud.ostrikes.textContent = String(o ? o.strikes : 0);
        progEl.style.width = state && state.song ? ((state.resolved / state.song) * 100).toFixed(1) + "%" : "0";
        const mk = state ? state.modeKey : "bot";
        modeChip.textContent = mk === "solo" ? "Solo" : mk === "bot" ? "VS Bot" : `Online · Kamu P${me + 1}`;
        statusEl.textContent = !state || state.status === "idle"
            ? (online && !room.isHost ? "Menunggu" : "Siap")
            : state.status === "playing" ? (paused ? "Jeda" : "Bermain") : "Selesai";
        const duel = mk !== "solo";
        oppChip.hidden = !duel; legend.hidden = !duel;
        if (duel && o) { oppName.textContent = o.name; opName.textContent = o.name; }
        root.style.setProperty("--me", colorOf(me));
        root.style.setProperty("--op", colorOf(1 - me));
    }

    function renderOverlays() {
        let name = null;
        if (uiOv) name = uiOv;
        else if (!state || state.status === "idle") name = "start";
        else if (state.status === "finished") name = "over";
        else if (paused && !online) name = "pause";
        for (const k in ovs) ovs[k].hidden = k !== name;
    }

    function renderOverContent() {
        if (!state || state.status !== "finished") return;
        const mk = state.modeKey, me = mySlot(), w = state.winner;
        ovTitle.textContent = mk === "solo"
            ? (w === 0 ? "Lagu selesai! 🎉" : "Lagu berakhir")
            : w === -1 ? "Seri 🤝" : w === me ? "Kamu menang! 🎉" : `${state.players[w].name} menang`;
        ovReason.textContent = state.endReason === "strikes"
            ? `${state.players[state.striker].name} kehabisan nyawa (3 miss).`
            : state.endReason === "cheat" ? "Cheat: menang instan."
                : mk === "solo"
                    ? `Akurasi ${Math.round((state.players[0].hits / state.song) * 100)}% (butuh ${Math.round(WIN_ACC * 100)}%).`
                    : "Semua balok selesai — skor tertinggi menang.";
        const slots = mk === "solo" ? [0] : [0, 1];
        let h = `<table class="pt-stats"><tr><th></th>${slots.map((s) => `<th>${state.players[s].name}</th>`).join("")}</tr>`;
        const rows = [
            ["Skor", (p) => p.score], ["Perfect", (p) => p.perfect], ["Good", (p) => p.good],
            ["Miss", (p) => p.misses], ["Combo maks", (p) => p.maxCombo],
            ["Akurasi", (p, s) => { const n = ownedCount(s); return n ? Math.round((p.hits / n) * 100) + "%" : "—"; }],
        ];
        for (const [label, fn] of rows)
            h += `<tr><td>${label}</td>${slots.map((s) => `<td>${fn(state.players[s], s)}</td>`).join("")}</tr>`;
        ovStats.innerHTML = h + "</table>";
        ovBadge.hidden = !state.cheated;
        ovBest.textContent = online ? "" : `Rekor: ${best}${newBest ? " (baru! 🎉)" : ""}`;
    }

    function renderControls() {
        const guest = online && !room.isHost;
        btnRestart.hidden = guest; btnPause.hidden = online; btnCheat.hidden = online;
        btnPause.textContent = paused ? "▶ Lanjut" : "⏸ Jeda";
        rowMode.hidden = online;
        startLocal.hidden = guest; startWait.hidden = !guest;
        btnAgain.hidden = guest; btnMenu.hidden = online; ovWait.hidden = !guest;
        nerfRow.hidden = !state || state.modeKey !== "bot";
        btnWin.disabled = online || !state || state.status !== "playing";
        for (const c of root.querySelectorAll("[data-cheat]")) c.checked = cheats[c.dataset.cheat];
    }

    function render() {
        if (destroyed) return;
        syncRound();
        if (state) for (const k in state.results) {
            const t = tiles[k];
            if (t) t.done = state.results[k].j === "miss" ? "gone" : "hit";
        }
        renderHud(); renderStrikes(); renderTiles(); renderOverlays(); renderOverContent(); renderControls();
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---- sinkronisasi ronde (chart dibangun dari seed, bukan dikirim) ---- */
    function syncRound() {
        if (!state || state.status !== "playing" || state.roundId === currentKey) return;
        currentKey = state.roundId;
        chart = makeChart(state.seed, state.song);
        const bc = (DIFFS[state.difficulty] || DIFFS.normal).botMiss;
        tiles = chart.map((lane, i) => ({
            i, lane, owner: ownerOf(i), y: -state.gap * (i + 1), done: null,
            botOffset: Math.random() * 46 - 20,
            botSkip: Math.random() < (cheats.nerf ? 0.5 : bc),
            botTried: false, autoTried: false,
        }));
        roundLocalStart = Date.now(); simT = 0; lastT = 0; paused = false; newBest = false;
        toast(state.modeKey === "solo" ? "🎵 Siap…"
            : state.first === mySlot() ? "🪙 Kamu duluan!" : `🪙 ${state.players[state.first].name} duluan!`);
        kick();
    }

    /* ---- alur permainan ---- */
    function startRound(diffKey, mk) {
        const dk = DIFFS[diffKey] ? diffKey : "normal";
        const d = DIFFS[dk];
        if (online) mk = "duet";
        if (mk !== "solo" && mk !== "bot") mk = online ? "duet" : "bot";
        const lvl = generateLevel(dk);
        state = {
            roundId: lvl.seed + "-" + Date.now(), status: "playing", modeKey: mk, difficulty: dk,
            seed: lvl.seed, song: d.song, gap: d.gap, speed0: d.speed0, rate: d.rate, speedMax: d.speedMax,
            first: Math.random() < 0.5 ? 0 : 1,                    // 🪙 koin: siapa dapat balok pertama
            hostSlot: online ? (Math.random() < 0.5 ? 0 : 1) : 0,  // 🎲 posisi P1/P2 diacak tiap ronde
            startAt: Date.now(), resolved: 0, results: {},
            winner: null, striker: -1, endReason: null, cheated: anyCheat(),
            players: [mkPlayer(""), mkPlayer("")],
        };
        namePlayers(state);
        paused = false; uiOv = null;
        publish();
    }

    function saveBest() {
        if (online || !state || state.cheated) return;
        const s = state.players[mySlot()].score;
        if (s > best) {
            best = s; newBest = true;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }

    function computeFinish(reason, striker) {
        state.status = "finished";
        state.endReason = reason; state.striker = striker;
        if (reason === "cheat") state.winner = mySlot();
        else if (state.modeKey === "solo") {
            const acc = state.players[0].hits / state.song;
            state.winner = reason === "complete" && acc >= WIN_ACC ? 0 : -1;
        } else if (reason === "strikes") state.winner = 1 - striker;
        else {
            const a = state.players[0].score, b = state.players[1].score;
            state.winner = a === b ? -1 : a > b ? 0 : 1;
        }
        saveBest();
    }

    /* ---- aksi kanonik (host = wasit) ---- */
    function applyAction(a, actor) {
        if (destroyed || !state || !a) return;
        if (a.t === "res") {
            if (state.status !== "playing") return;
            const idx = a.idx | 0;
            if (idx < 0 || idx >= state.song) return;
            if (ownerOf(idx) !== actor) return;          // hanya boleh ketuk balok sendiri
            if (state.results[idx]) return;              // tidak boleh resolve dua kali
            if (a.j !== "perfect" && a.j !== "good" && a.j !== "miss") return;
            const pl = state.players[actor];
            state.results[idx] = { p: actor, j: a.j };
            state.resolved++;
            const shield = cheats.shield && !online && actor === mySlot();
            if (a.j === "miss") {
                pl.misses++; pl.combo = 0;
                if (!shield) pl.strikes++;
            } else {
                pl.hits++; pl.combo++; pl.maxCombo = Math.max(pl.maxCombo, pl.combo);
                if (a.j === "perfect") { pl.perfect++; pl.score += 100 + Math.min(40, pl.combo * 4); }
                else { pl.good++; pl.score += 60 + Math.min(20, pl.combo * 2); }
            }
            if (pl.strikes >= STRIKES) { computeFinish("strikes", actor); publish(); return; }
            if (state.resolved >= state.song) { computeFinish("complete", -1); publish(); return; }
            publish();
        } else if (a.t === "bad") {
            if (state.status !== "playing") return;
            const pl = state.players[actor];
            if (!pl) return;
            pl.combo = 0;
            if (!(cheats.shield && !online && actor === mySlot())) pl.strikes++;
            if (pl.strikes >= STRIKES) computeFinish("strikes", actor);
            publish();
        } else if (a.t === "restart") {
            if (online && !room.isHost) return;
            startRound(a.diff, a.mk);
        } else if (a.t === "forcewin") {
            if (online || state.status !== "playing") return;
            state.cheated = true;
            computeFinish("cheat", -1);
            publish();
        } else if (a.t === "menu") {
            if (online) return;
            state = idleState(); namePlayers(state);
            currentKey = ""; tiles = []; chart = []; paused = false;
            render();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySlot());
    }
    function routeAs(action, actor) {
        if (online) submitAction(action);
        else applyAction(action, actor);
    }

    /* ---- input pemain & bot ---- */
    function performTap(lane, actor) {
        if (!state || state.status !== "playing") return;
        if (!online && paused) return;
        let bestT = null;
        for (const t of tiles) {
            if (t.done || t.lane !== lane || t.owner !== actor) continue;
            const c = t.y + TILE_H / 2;
            if (c >= ZONE_TOP - 20 && c <= ZONE_BOT + 6) {
                if (!bestT || t.y > bestT.y) bestT = t; // balok paling dekat garis (fix bug pemilihan lama)
            }
        }
        if (!bestT) { wrongTap(actor); return; }
        const wide = cheats.wide && !online && actor === mySlot() ? 1.8 : 1;
        const res = judge(bestT.y + TILE_H / 2 - ZONE_CENTER, wide);
        if (res === "miss") { wrongTap(actor); return; }
        bestT.done = "hit";
        if (actor === mySlot()) {
            flashJudge(res === "perfect" ? "PERFECT" : "GOOD", res === "perfect" ? "#7c3aed" : "#0d9488");
            tone(LANE_FREQ[lane], 0.22, "triangle", 0.22);
            if (res === "perfect") tone(LANE_FREQ[lane] * 2, 0.18, "sine", 0.1);
        } else {
            tone(LANE_FREQ[lane], 0.18, "triangle", 0.08);
        }
        routeAs({ t: "res", idx: bestT.i, j: res }, actor);
    }
    function wrongTap(actor) {
        if (actor === mySlot()) missFx();
        routeAs({ t: "bad" }, actor);
    }

    /* ---- loop (satu RAF, posisi murni dari waktu) ---- */
    function kick() {
        if (!rafId && state && state.status === "playing") rafId = requestAnimationFrame(loop);
    }
    function loop(now) {
        rafId = 0;
        if (destroyed || !state || state.status !== "playing") return;
        if (!lastT) lastT = now;
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        if (online) simT = (Date.now() - roundLocalStart) / 1000;
        else if (!paused) simT += dt * (cheats.slow ? 0.6 : 1);
        const c = cfg();
        for (const t of tiles) t.y = -state.gap * (t.i + 1) + distAt(simT, c);

        if (!paused || online) {
            const me = mySlot();
            const botOn = !online && state.modeKey === "bot";
            for (const t of tiles) {
                if (t.done) continue;
                const center = t.y + TILE_H / 2;
                if (cheats.auto && !online && t.owner === me && !t.autoTried && center >= ZONE_CENTER - 4) {
                    t.autoTried = true; performTap(t.lane, me);
                }
                if (botOn && t.owner === 1 && !t.botTried && center >= ZONE_CENTER + t.botOffset) {
                    t.botTried = true;
                    if (!t.botSkip) performTap(t.lane, 1);
                }
            }
            const missLine = ZONE_CENTER + GOOD + 8;
            for (const t of tiles) {
                if (t.done) continue;
                const center = t.y + TILE_H / 2;
                if (center <= missLine) continue;
                if (!online) {
                    t.done = "gone";
                    if (t.owner === me) missFx();
                    applyAction({ t: "res", idx: t.i, j: "miss" }, t.owner);
                } else if (t.owner === me) {
                    t.done = "gone"; missFx();
                    submitAction({ t: "res", idx: t.i, j: "miss" });
                } else if (room.isHost && center > missLine + 90) {
                    // fallback host: lawan telat/disconnect → tetap miss agar lagu tidak macet
                    t.done = "gone";
                    applyAction({ t: "res", idx: t.i, j: "miss" }, t.owner);
                }
                if (state.status !== "playing") break;
            }
        }
        renderTiles();
        if (state.status === "playing") rafId = requestAnimationFrame(loop);
    }

    function togglePause() {
        if (online || !state || state.status !== "playing") return;
        paused = !paused; lastT = 0;
        render();
    }

    /* ---- events ---- */
    function handleClick(event) {
        const btn = event.target.closest ? event.target.closest("[data-act],[data-exit]") : null;
        if (!btn) return;
        if (btn.hasAttribute("data-exit")) { onExit(); return; }
        actx();
        const a = btn.dataset.act;
        if (a === "start") {
            if (online && !room.isHost) return;
            startRound(selDiff.value, online ? "duet" : selMode.value);
        } else if (a === "restart") {
            if (online && !room.isHost) return;
            startRound(state ? state.difficulty : "normal", state ? state.modeKey : online ? "duet" : "bot");
        } else if (a === "menu") applyAction({ t: "menu" }, mySlot());
        else if (a === "pause") togglePause();
        else if (a === "resume") { paused = false; lastT = 0; render(); }
        else if (a === "mute") { muted = !muted; btnMute.textContent = muted ? "🔇" : "🔊"; }
        else if (a === "cheat") { if (!online) { uiOv = uiOv === "cheat" ? null : "cheat"; render(); } }
        else if (a === "tutorial") { uiOv = uiOv === "tutorial" ? null : "tutorial"; render(); }
        else if (a === "close") { uiOv = null; render(); }
        else if (a === "forcewin") { applyAction({ t: "forcewin" }, mySlot()); uiOv = null; render(); }
    }

    function handlePointer(event) {
        actx();
        const el = event.target.closest ? event.target.closest("[data-lane]") : null;
        if (!el) return;
        event.preventDefault();
        performTap(Number(el.dataset.lane), mySlot());
    }

    function handleChange(event) {
        const c = event.target.closest ? event.target.closest("[data-cheat]") : null;
        if (!c) return;
        cheats[c.dataset.cheat] = c.checked;
        if (anyCheat() && state) state.cheated = true;
        if (c.dataset.cheat === "nerf" && state && state.status === "playing") {
            const bc = (DIFFS[state.difficulty] || DIFFS.normal).botMiss;
            for (const t of tiles)
                if (t.owner === 1 && !t.botTried) t.botSkip = Math.random() < (cheats.nerf ? 0.5 : bc);
        }
        render();
    }

    function handleKey(e) {
        if (destroyed) return;
        const tag = ((e.target && e.target.tagName) || "").toLowerCase();
        if (tag === "input" || tag === "select" || tag === "textarea") return;
        const k = (e.key || "").toLowerCase();
        if (uiOv) {
            if (k === "escape" || (k === "h" && uiOv === "tutorial") || (k === "c" && uiOv === "cheat")) {
                uiOv = null; render();
            }
            return;
        }
        if (k in KEYS) {
            if (e.repeat) return;
            e.preventDefault(); actx();
            performTap(KEYS[k], mySlot());
            return;
        }
        if (e.code === "Space" || k === " ") {
            e.preventDefault(); actx();
            const guest = online && !room.isHost;
            if (!state || state.status === "idle") {
                if (!guest) startRound(selDiff.value, online ? "duet" : selMode.value);
            } else if (state.status === "finished") {
                if (!guest) startRound(state.difficulty, state.modeKey);
            } else togglePause();
            return;
        }
        if (k === "p") togglePause();
        else if (k === "m") { muted = !muted; btnMute.textContent = muted ? "🔇" : "🔊"; }
        else if (k === "c" && !online) { uiOv = uiOv === "cheat" ? null : "cheat"; render(); }
        else if (k === "h") { uiOv = uiOv === "tutorial" ? null : "tutorial"; render(); }
    }

    function handleVis() {
        if (document.hidden && !online && state && state.status === "playing" && !paused) {
            paused = true; render(); // auto-jeda saat tab ditinggal (mode lokal)
        }
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("pointerdown", handlePointer);
    root.addEventListener("change", handleChange);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("visibilitychange", handleVis);

    /* ---- wiring online / lokal (sesuai kontrak template) ---- */
    const subs = [];
    const keep = (u) => { if (typeof u === "function") subs.push(u); };
    if (online) {
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = idleState(); namePlayers(state);
            publish();
            // slot guest = kebalikan slot host (posisi diacak tiap ronde)
            keep(room.onAction((action) => applyAction(action, state ? 1 - state.hostSlot : 1)));
        } else {
            keep(room.onState((nextState) => { if (!nextState) return; state = nextState; render(); }));
        }
    } else {
        state = idleState(); namePlayers(state);
    }

    renderLanes();
    render();

    return {
        destroy() {
            destroyed = true;
            if (rafId) cancelAnimationFrame(rafId);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("pointerdown", handlePointer);
            root.removeEventListener("change", handleChange);
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener("visibilitychange", handleVis);
            for (const u of subs) { try { u(); } catch (e) { } }
            if (AC) { try { AC.close(); } catch (e) { } AC = null; }
            root.classList.remove("pt-root");
            root.innerHTML = "";
        },
    };
}