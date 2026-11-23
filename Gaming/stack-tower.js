/* ==== GAME: stack-tower.js ==== */
/*
  Stack Tower — versi template baru (META + mount).
  - Mode AI  : vs Bot, siapa jalan duluan diacak (coin toss).
  - Mode Room: multiplayer turn-based, seat (P1/P2) & giliran pertama diacak host.
  - Level dibangkitkan dari seed + disimulasikan dulu agar pasti bisa diselesaikan.
  - Cheat overlay hanya aktif di mode AI (fair play online).
  Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "stack-tower", // harus sama dengan nama file (tanpa .js)
    name: "Stack Tower",
    category: "casual",
    catLabel: "Casual",
    desc: "Jatuhkan blok yang bergerak tepat di atas tumpukan. Bagian menggantung terpotong — meleset total, menara runtuh.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="34" width="28" height="8" rx="2"/><rect x="13" y="26" width="22" height="8" rx="2"/><rect x="17" y="18" width="15" height="8" rx="2"/><rect x="20" y="10" width="9" height="8" rx="2"/><path d="M40 14v-6h-6"/></svg>',
    bg: ["#c7d2fe", "#6366f1"],
    bestKey: "stackTowerBest",
};

/* ================= konstanta & aturan murni ================= */
const W = 340, H = 480, BH = 24, PAD = 6, VIEW_N = 12, CX = W / 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function gauss(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function speedAt(lv, drops) {
    return Math.min(lv.speedMax, lv.speed0 + drops * lv.speedInc);
}
/* Hasil drop: perfect / terpotong / null (meleset total) */
function resolveDrop(lv, prev, x, w) {
    if (Math.abs(prev.x - x) <= lv.tol &&
        Math.abs(prev.x + prev.w - (x + w)) <= Math.max(lv.tol * 2, 10)) {
        return { x: prev.x, w: prev.w, perfect: true };
    }
    const l = Math.max(x, prev.x), r = Math.min(x + w, prev.x + prev.w);
    if (r - l < lv.minW) return null;
    return { x: l, w: r - l, perfect: false };
}

/* ---- Random level generator + verifikasi "bisa diselesaikan" ----
   Konfigurasi diacak dari seed, lalu disimulasikan Monte-Carlo dengan
   model pemain manusia (error ~ reaksi). Hanya lolos bila win-rate >= 25%. */
function simulateWinRate(lv) {
    const rng = mulberry32((lv.seed ^ 0x9e3779b9) >>> 0);
    const N = 90;
    let wins = 0;
    for (let s = 0; s < N; s++) {
        let prev = { x: CX - lv.baseW / 2, w: lv.baseW };
        let streak = 0, done = 0;
        for (let d = 0; d < lv.target; d++) {
            const sp = speedAt(lv, d);
            const x = prev.x + gauss(rng) * (sp * 0.05 + 1.5);
            const landed = resolveDrop(lv, prev, x, prev.w);
            if (!landed) break;
            if (landed.perfect) {
                streak++;
                if (lv.regen && streak % 3 === 0 && landed.w < lv.baseW) {
                    const grow = Math.min(lv.regen, lv.baseW - landed.w);
                    landed.x = clamp(landed.x - grow / 2, PAD, W - PAD - landed.w - grow);
                    landed.w += grow;
                }
            } else streak = 0;
            prev = landed; done++;
        }
        if (done >= lv.target) wins++;
    }
    return wins / N;
}
function generateLevel(seed) {
    const rng = mulberry32(seed);
    let lv = null;
    for (let i = 0; i < 24; i++) {
        lv = {
            seed,
            target: 8 + Math.floor(rng() * 7),          // 8..14 level
            baseW: 150 + Math.floor(rng() * 46),        // 150..195 px
            speed0: Math.round(105 + rng() * 45),
            speedInc: +(8 + rng() * 7).toFixed(1),
            speedMax: Math.round(230 + rng() * 110),
            tol: +(4 + rng() * 2.5).toFixed(1),
            minW: 8,
            regen: rng() < 0.5 ? 10 : 0,                // bonus lebar tiap 3 perfect beruntun
            botSkill: +(0.55 + rng() * 0.35).toFixed(2),
        };
        if (i > 7) { lv.speedMax = Math.round(lv.speedMax * 0.92); lv.baseW = Math.min(210, lv.baseW + 6); }
        lv.rate = simulateWinRate(lv);
        if (lv.rate >= 0.25) break;                   // tersertifikasi bisa diselesaikan
    }
    return lv;
}

/* ---- gerak blok deterministik (triangle wave, berbasis waktu) ----
   Semua klien menghitung posisi dari data state yang sama → tidak perlu
   menulis posisi ke Firebase tiap frame. */
function movingX(st, now, factor = 1) {
    const w = st.spawn.w;
    const minX = PAD, maxX = W - PAD - w;
    const range = Math.max(1, maxX - minX);
    const t = Math.max(0, (now - st.turnStartedAt) / 1000) * st.spawn.speed * factor;
    const m = t % (2 * range);
    const off = m <= range ? m : 2 * range - m;
    return st.spawn.side === "L" ? minX + off : maxX - off;
}
function spawnFor(st, now) {
    const prev = st.blocks[st.blocks.length - 1];
    st.spawn = {
        side: st.blocks.length % 2 === 1 ? "L" : "R",
        w: prev.w,
        speed: speedAt(st.level, st.drops),
    };
    st.turnStartedAt = now;
}
const rollSeats = () => (Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 });
const rollFirst = () => (Math.random() < 0.5 ? 0 : 1);
const newSeed = () => ((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0xffff);

function freshState(seed, seats, first) {
    const level = generateLevel(seed);
    return {
        v: 1, seed, level, seats, first,
        turn: first,
        phase: "ready",                               // ready | playing | ended
        blocks: [{ x: CX - level.baseW / 2, w: level.baseW, by: -1, perfect: false }],
        spawn: null, turnStartedAt: 0,
        scores: [0, 0], perfects: [0, 0], streak: [0, 0],
        drops: 0, lastEvent: null, result: null,
    };
}

/* ============================ MOUNT ============================ */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ---- lokal (tidak dipublish) ---- */
    const unsubs = [];
    let raf = 0, destroyed = false;
    let paused = false, pauseAt = 0;
    let uiOverlay = null;            // null | "help" | "cheat"
    let dismissedEnd = false;
    let botPlan = null;
    let pendingDrop = false;         // guest: tunggu state balik dari host
    let clockOffset = 0;             // guest: kompensasi jam host di depan
    let fxKey = 0;
    const fxTimers = new Set();
    const cheats = { slow: false, freeze: false, auto: false, wide: false, guide: false };
    let frozenAt = 0, cheated = false;
    let best = 0;
    try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (_) { }

    const mySeat = () => (online ? (room.isHost ? state.seats.host : state.seats.guest) : 0);
    const botSeat = 1;
    const canManage = () => !online || room.isHost;
    const seatName = (s) => (online ? (s === mySeat() ? "Kamu" : "Lawan") : s === 0 ? "Kamu" : "Bot");
    const slowF = () => (!online && cheats.slow ? 0.5 : 1);
    const effNow = () => (paused ? pauseAt : !online && cheats.freeze && frozenAt ? frozenAt : Date.now() + clockOffset);

    /* ---------------- UI (minimalis, scoped .st-app) ---------------- */
    root.innerHTML = `
<div class="game-app st-app">
  <style>
    .st-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--bg:#f8fafc;--acc:#4f46e5;color:var(--ink)}
    .st-app [hidden]{display:none!important}
    .st-app .st-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0}
    .st-app .st-chip{font-size:12px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--mut);font-variant-numeric:tabular-nums}
    .st-app .st-chip b{color:var(--ink)}
    .st-app .st-chip.warn{border-color:#fecaca;background:#fef2f2;color:#b91c1c;font-weight:700}
    .st-app .st-spacer{flex:1}
    .st-app .st-ico{width:34px;height:34px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;font-size:15px;line-height:1;color:var(--ink)}
    .st-app .st-ico:hover{border-color:var(--acc);color:var(--acc)}
    .st-app .st-boardwrap{position:relative;max-width:380px;margin:0 auto}
    .st-app .st-svg{display:block;width:100%;height:auto;background:var(--bg);border:1px solid var(--line);border-radius:16px;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
    .st-app .st-boardwrap.mine .st-svg{border-color:var(--acc);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
    .st-app .st-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.88);backdrop-filter:blur(3px);border-radius:16px;padding:14px;overflow:auto}
    .st-app .st-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;max-width:320px;width:100%;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    .st-app .st-card h3{margin:0 0 8px;font-size:17px}
    .st-app .st-card p,.st-app .st-card li{font-size:12.5px;color:var(--mut);line-height:1.55;margin:4px 0}
    .st-app .st-card ul{margin:6px 0;padding-left:18px}
    .st-app .st-btn{display:inline-block;margin-top:10px;padding:9px 16px;border:0;border-radius:10px;background:var(--acc);color:#fff;font-weight:600;font-size:13px;cursor:pointer}
    .st-app .st-btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line);margin-left:6px}
    .st-app .st-btn.danger{background:#dc2626}
    .st-app .st-controls{max-width:380px;margin:10px auto 0}
    .st-app .st-drop{width:100%;padding:14px;font-size:15px;font-weight:700;border-radius:12px;background:var(--acc);color:#fff;border:0;cursor:pointer;touch-action:manipulation}
    .st-app .st-drop:disabled{background:#e2e8f0;color:#94a3b8;cursor:default}
    .st-app .st-hint{max-width:380px;margin:8px auto 0;text-align:center;font-size:11.5px;color:var(--mut)}
    .st-app kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;background:#fff}
    .st-app .st-cheatrow{display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px dashed var(--line);font-size:12.5px}
    .st-app .st-cheatrow input{margin-top:2px;accent-color:var(--acc)}
    .st-app .st-cut{fill:#fca5a5;animation:stFall .7s ease-in forwards}
    .st-app .st-flash{fill:none;stroke:#eab308;stroke-width:3;animation:stFlash .5s ease-out 2}
    .st-app .st-guide{fill:rgba(34,197,94,.14);stroke:rgba(34,197,94,.55);stroke-dasharray:3 3}
    .st-app .st-target{fill:none;stroke:rgba(148,163,184,.5);stroke-dasharray:4 4}
    @keyframes stFall{to{transform:translateY(160px) rotate(14deg);opacity:0}}
    @keyframes stFlash{0%,100%{opacity:0}50%{opacity:1}}
    @media (pointer:coarse){.st-app .st-drop{padding:18px;font-size:16px}}
  </style>
  <div class="game-intro">
    <div><h2>Stack Tower</h2><p>Susun menara setinggi target. Presisi = lebar blok utuh, meleset = runtuh.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Siap</span></span>
  </div>
  <div class="st-hud">
    <span class="st-chip">Tinggi <b data-hud="height">0</b>/<b data-hud="target">0</b></span>
    <span class="st-chip">Kamu <b data-hud="me">0</b></span>
    <span class="st-chip"><span data-el="opplabel">Bot</span> <b data-hud="opp">0</b></span>
    <span class="st-chip">Perfect <b data-hud="perfect">0</b></span>
    <span class="st-chip" data-el="bestchip">Best <b data-hud="best">0</b></span>
    <span class="st-chip">Lv <b data-hud="lvl">–</b></span>
    <span class="st-chip warn" data-el="cheatbadge" hidden>CHEAT</span>
    <span class="st-spacer"></span>
    <button class="st-ico" type="button" data-act="help" title="Panduan (H)" aria-label="Panduan">?</button>
    <button class="st-ico" type="button" data-act="cheat" data-el="cheatbtn" title="Cheat (C)" aria-label="Cheat">🛠</button>
    <button class="st-ico" type="button" data-act="pause" data-el="pausebtn" title="Jeda (P)" aria-label="Jeda">⏸</button>
    <button class="st-ico" type="button" data-act="restart" data-el="restartbtn" title="Level baru (R)" aria-label="Ulang">↻</button>
  </div>
  <section class="game-panel" data-board>
    <div class="st-boardwrap" data-el="wrap">
      <svg class="st-svg" viewBox="0 0 ${W} ${H}" data-el="svg" role="img" aria-label="Papan Stack Tower">
        <g data-el="blocks"></g>
        <g data-el="fx"></g>
      </svg>
      <div class="st-ov" data-el="ov" data-ovback hidden></div>
    </div>
    <div class="st-controls">
      <button class="st-drop" type="button" data-act="drop" data-el="drop">⬇ JATUHKAN BLOK</button>
    </div>
    <p class="st-hint">Klik papan / tombol, atau <kbd>Space</kbd> · <kbd>P</kbd> jeda · <kbd>R</kbd> level baru · <kbd>H</kbd> panduan · <kbd>C</kbd> cheat</p>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-el="svg"]'), blocksG = $('[data-el="blocks"]'), fxG = $('[data-el="fx"]');
    const ovEl = $('[data-el="ov"]'), wrapEl = $('[data-el="wrap"]'), dropBtn = $('[data-el="drop"]');
    const statusEl = $('[data-status]');
    const hud = {
        height: $('[data-hud="height"]'), target: $('[data-hud="target"]'),
        me: $('[data-hud="me"]'), opp: $('[data-hud="opp"]'),
        perfect: $('[data-hud="perfect"]'), best: $('[data-hud="best"]'), lvl: $('[data-hud="lvl"]'),
    };

    /* ---------------- render papan (per frame) ---------------- */
    const PAL = [
        ["#6366f1", "#818cf8", "#4f46e5", "#a5b4fc"], // P1 indigo
        ["#f59e0b", "#fbbf24", "#d97706", "#fcd34d"], // P2 amber
    ];
    const scrollN = () => Math.max(0, state.blocks.length + 1 - VIEW_N);
    const blockY = (i) => H - 26 - (i - scrollN() + 1) * BH;

    function renderBoard() {
        if (!state) { blocksG.innerHTML = ""; return; }
        const sc = scrollN();
        let html = `<rect x="0" y="${H - 22}" width="${W}" height="3" rx="1.5" fill="#e2e8f0"/>`;
        const goalY = H - 26 - (1 + state.level.target - sc) * BH;
        if (goalY > 8) {
            html += `<line x1="10" y1="${goalY}" x2="${W - 10}" y2="${goalY}" stroke="#cbd5e1" stroke-dasharray="5 5"/>` +
                `<text x="${W - 12}" y="${goalY - 5}" text-anchor="end" font-size="9" fill="#94a3b8">TARGET</text>`;
        }
        for (let i = sc; i < state.blocks.length; i++) {
            const b = state.blocks[i];
            const fill = b.by < 0 ? "#94a3b8" : PAL[b.by][i % 4];
            const stroke = b.perfect ? "#eab308" : "rgba(15,23,42,.10)";
            html += `<rect x="${b.x}" y="${blockY(i)}" width="${b.w}" height="${BH - 2}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${b.perfect ? 1.6 : 1}"/>`;
        }
        if (state.spawn && state.phase === "playing") {
            const y = blockY(state.blocks.length);
            const prev = state.blocks[state.blocks.length - 1];
            const x = movingX(state, effNow(), slowF());
            html += `<rect class="st-target" x="${prev.x}" y="${y}" width="${prev.w}" height="${BH - 2}" rx="4"/>`;
            if (!online && cheats.guide && state.turn === mySeat()) {
                html += `<rect class="st-guide" x="${prev.x - state.level.tol}" y="${y}" width="${state.level.tol * 2}" height="${BH - 2}" rx="3"/>`;
            }
            html += `<rect x="${x}" y="${y}" width="${state.spawn.w}" height="${BH - 2}" rx="4" fill="${PAL[state.turn][state.blocks.length % 4]}" stroke="#334155" stroke-width="1.2"/>`;
        }
        blocksG.innerHTML = html;
        renderFx();
    }

    function renderFx() {
        const ev = state.lastEvent;
        if (!ev || ev.at === fxKey) return;
        fxKey = ev.at;
        const y = blockY(ev.row);
        let html = "";
        if (ev.type === "miss") {
            html = `<rect class="st-cut" x="${ev.x}" y="${y}" width="${ev.w}" height="${BH - 2}" rx="3"/>`;
        } else if (ev.type === "cut") {
            if (ev.x < ev.kept.x) html += `<rect class="st-cut" x="${ev.x}" y="${y}" width="${ev.kept.x - ev.x}" height="${BH - 2}" rx="3"/>`;
            const kr = ev.kept.x + ev.kept.w;
            if (ev.x + ev.w > kr) html += `<rect class="st-cut" x="${kr}" y="${y}" width="${ev.x + ev.w - kr}" height="${BH - 2}" rx="3"/>`;
        } else if (ev.type === "perfect") {
            html = `<rect class="st-flash" x="${ev.kept.x}" y="${y}" width="${ev.kept.w}" height="${BH - 2}" rx="4"/>`;
        }
        fxG.innerHTML = html;
        const t = setTimeout(() => { fxG.innerHTML = ""; fxTimers.delete(t); }, 750);
        fxTimers.add(t);
    }

    /* ---------------- render UI (saat state berubah) ---------------- */
    function renderUi() {
        if (!state) { statusEl.textContent = "Menghubungkan…"; dropBtn.disabled = true; ovEl.hidden = true; return; }
        const me = mySeat(), opp = 1 - me, lv = state.level;
        hud.height.textContent = state.drops;
        hud.target.textContent = lv.target;
        hud.me.textContent = state.scores[me];
        hud.opp.textContent = state.scores[opp];
        hud.perfect.textContent = state.perfects[me];
        hud.best.textContent = best;
        hud.lvl.textContent = (lv.seed % 900) + 100;
        $('[data-el="opplabel"]').textContent = online ? "Lawan" : "Bot";
        $('[data-el="bestchip"]').hidden = online;
        $('[data-el="cheatbtn"]').hidden = online;
        $('[data-el="pausebtn"]').hidden = online;
        $('[data-el="restartbtn"]').hidden = !canManage();
        $('[data-el="cheatbadge"]').hidden = !cheated;
        $('[data-el="pausebtn"]').textContent = paused ? "▶" : "⏸";

        const mine = state.phase === "playing" && state.turn === me;
        wrapEl.classList.toggle("mine", mine && !paused);
        dropBtn.disabled = !(mine && !paused && !uiOverlay && !pendingDrop);
        dropBtn.textContent = mine ? "⬇ JATUHKAN BLOK" : state.phase === "playing" ? `Menunggu ${seatName(state.turn)}…` : "⬇ JATUHKAN BLOK";

        if (state.phase === "ready") statusEl.textContent = online && !room.isHost ? "Menunggu host memulai…" : "Siap — tekan Start";
        else if (state.phase === "ended") statusEl.textContent = state.result.winner === me ? "🏆 Kamu menang!" : `${seatName(state.result.winner)} menang`;
        else if (paused) statusEl.textContent = "Dijeda";
        else statusEl.textContent = mine ? "Giliranmu — jatuhkan!" : `Giliran ${seatName(state.turn)}…`;

        renderOverlay();
    }

    function tossText() {
        const f = state.first;
        return online
            ? `Undian: kamu pemain <b>P${mySeat() + 1}</b>, ${f === mySeat() ? "kamu" : "lawan"} jalan duluan.`
            : `Undian koin: <b>${f === 0 ? "kamu" : "Bot"}</b> jalan duluan.`;
    }
    function howToHtml() {
        return `<ul>
      <li>Blok bergerak kiri–kanan. <b>Klik papan</b>, tombol jatuh, atau <kbd>Space</kbd> untuk menjatuhkan.</li>
      <li>Bagian yang menggantung <b>terpotong</b> — blok berikutnya makin sempit.</li>
      <li>Mendarat dalam <b>±${state.level.tol}px</b> = <b>PERFECT</b> (+50, lebar utuh)${state.level.regen ? `, dan tiap 3 perfect beruntun lebar +${state.level.regen}px` : ""}.</li>
      <li>Tidak ada overlap = <b>runtuh</b> dan kalah. Capai tinggi <b>${state.level.target}</b> untuk menang.</li>
      <li>Giliran bergantian — blok berwarna <b>ungu = P1</b>, <b>kuning = P2</b>.</li>
    </ul>`;
    }
    function renderOverlay() {
        let html = "";
        if (uiOverlay === "help") {
            html = `<div class="st-card"><h3>Cara Bermain</h3>${howToHtml()}
        <p><b>Kontrol:</b> <kbd>Space</kbd>/<kbd>Enter</kbd>/<kbd>↓</kbd> jatuh · <kbd>P</kbd> jeda · <kbd>R</kbd> level baru · <kbd>C</kbd> cheat (offline) · <kbd>Esc</kbd> tutup.</p>
        <p>Level #${(state.level.seed % 900) + 100} dibangkitkan acak dan <b>terverifikasi bisa diselesaikan</b> (simulasi menang ${Math.round(state.level.rate * 100)}%).</p>
        <button class="st-btn" type="button" data-act="closeov">Tutup</button></div>`;
        } else if (uiOverlay === "cheat") {
            const row = (k, label, sub) => `<label class="st-cheatrow"><input type="checkbox" data-cheat="${k}" ${cheats[k] ? "checked" : ""}><span><b>${label}</b><br>${sub}</span></label>`;
            html = `<div class="st-card"><h3>🛠 Cheat (mode offline)</h3>
        ${row("slow", "Slow motion ×0.5", "Blok bergerak setengah kecepatan.")}
        ${row("freeze", "Bekukan blok", "Blok berhenti bergerak sampai dimatikan.")}
        ${row("auto", "Auto perfect", "Drop milikmu selalu mendarat sempurna.")}
        ${row("wide", "Lebar minimum 60px", "Blok tidak bisa menipis di bawah 60px.")}
        ${row("guide", "Garis panduan", "Tampilkan zona perfect hijau.")}
        <p>Skor best <b>tidak disimpan</b> saat cheat aktif. Cheat dinonaktifkan saat online.</p>
        <button class="st-btn danger" type="button" data-act="cheatwin">Menang instan</button>
        <button class="st-btn ghost" type="button" data-act="closeov">Tutup</button></div>`;
        } else if (state.phase === "ready") {
            html = `<div class="st-card"><h3>Stack Tower</h3>${howToHtml()}<p>${tossText()}</p>
        ${canManage() ? `<button class="st-btn" type="button" data-act="start">Mulai game</button>` : `<p><i>Menunggu host memulai…</i></p>`}</div>`;
        } else if (paused && !online) {
            html = `<div class="st-card"><h3>⏸ Dijeda</h3><p>Tekan <kbd>P</kbd> atau tombol di bawah untuk lanjut.</p>
        <button class="st-btn" type="button" data-act="pause">Lanjutkan</button></div>`;
        } else if (state.phase === "ended" && !dismissedEnd) {
            const r = state.result, win = r.winner === me;
            const reason = r.reason === "miss" ? `Blok ${seatName(1 - r.winner)} meleset — menara runtuh di tinggi ${state.drops}.`
                : r.reason === "cheat" ? "Menang lewat cheat 😉"
                    : `Target ${state.level.target} tingkat tercapai!`;
            html = `<div class="st-card"><h3>${win ? "🏆 Kamu menang!" : "💥 " + seatName(r.winner) + " menang"}</h3>
        <p>${reason}</p>
        <p>Skor — Kamu: <b>${state.scores[me]}</b> (${state.perfects[me]} perfect) · ${seatName(1 - me)}: <b>${state.scores[1 - me]}</b> (${state.perfects[1 - me]} perfect).</p>
        ${!online ? `<p>Best: <b>${best}</b>${cheated ? " (cheat aktif — skor tidak dicatat)" : ""}</p>` : ""}
        ${canManage() ? `<button class="st-btn" type="button" data-act="restart">Main lagi · level baru</button>` : `<p><i>Menunggu host memulai ulang…</i></p>`}
        <button class="st-btn ghost" type="button" data-act="closeov">Lihat papan</button></div>`;
        }
        ovEl.hidden = !html;
        ovEl.innerHTML = html;
    }
    function render() { renderUi(); renderBoard(); }

    /* ---------------- state & aksi (host otoritatif) ---------------- */
    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function saveBest() {
        if (online || cheated) return;
        if (state.scores[0] > best) {
            best = state.scores[0];
            try { localStorage.setItem(META.bestKey, String(best)); } catch (_) { }
        }
    }
    function resetLocalRound() {
        paused = false; pauseAt = 0; botPlan = null; uiOverlay = null;
        dismissedEnd = false; pendingDrop = false; fxKey = 0;
        Object.keys(cheats).forEach((k) => (cheats[k] = false));
        frozenAt = 0; cheated = false;
        fxTimers.forEach(clearTimeout); fxTimers.clear(); fxG.innerHTML = "";
    }
    function newRound(autoStart) {
        // Random: seed level, seat P1/P2 (online), dan siapa jalan duluan.
        state = freshState(newSeed(), online ? rollSeats() : { host: 0, guest: 1 }, rollFirst());
        resetLocalRound();
        if (autoStart) { state.phase = "playing"; spawnFor(state, Date.now()); }
        publish();
    }

    function applyAction(action, actorSeat) {
        if (!state || !action || typeof action !== "object") return;
        if (action.seed !== undefined && action.seed !== state.seed) return; // aksi basi lintas ronde
        const now = Date.now();

        if (action.type === "start") {
            if (!canManage() || state.phase !== "ready") return;
            state.phase = "playing";
            spawnFor(state, now);
        } else if (action.type === "restart") {
            if (!canManage()) return;
            newRound(true);
            return; // newRound sudah publish
        } else if (action.type === "drop") {
            if (state.phase !== "playing" || !state.spawn || actorSeat !== state.turn) return;
            if (typeof action.x !== "number" || !isFinite(action.x)) return;
            const minX = PAD, maxX = W - PAD - state.spawn.w;
            const x = clamp(action.x, minX, maxX);
            const w = state.spawn.w;
            const prev = state.blocks[state.blocks.length - 1];
            const lv = !online && cheats.wide ? { ...state.level, minW: 2 } : state.level;
            let landed = resolveDrop(lv, prev, x, w);

            if (!landed) {
                state.lastEvent = { type: "miss", x, w, row: state.blocks.length, by: actorSeat, at: now };
                state.phase = "ended";
                state.result = { winner: 1 - actorSeat, reason: "miss" };
                state.spawn = null;
                saveBest();
            } else {
                if (landed.perfect) {
                    state.perfects[actorSeat]++; state.streak[actorSeat]++; state.scores[actorSeat] += 50;
                    if (state.level.regen && state.streak[actorSeat] % 3 === 0 && landed.w < state.level.baseW) {
                        const grow = Math.min(state.level.regen, state.level.baseW - landed.w);
                        landed.x = clamp(landed.x - grow / 2, PAD, W - PAD - landed.w - grow);
                        landed.w += grow;
                    }
                } else state.streak[actorSeat] = 0;
                if (!online && cheats.wide && landed.w < 60) {
                    const c = landed.x + landed.w / 2;
                    landed.w = 60; landed.x = clamp(c - 30, PAD, W - PAD - 60);
                }
                state.scores[actorSeat] += 10 + Math.round(landed.w / 10);
                state.blocks.push({ x: landed.x, w: landed.w, perfect: landed.perfect, by: actorSeat });
                state.drops++;
                state.lastEvent = {
                    type: landed.perfect ? "perfect" : "cut",
                    x, w, kept: { x: landed.x, w: landed.w },
                    row: state.blocks.length - 1, by: actorSeat, at: now,
                };
                if (state.drops >= state.level.target) {
                    state.phase = "ended";
                    state.result = { winner: actorSeat, reason: "target" };
                    state.spawn = null;
                    saveBest();
                } else {
                    state.turn = 1 - state.turn;
                    spawnFor(state, now);
                }
            }
        } else return;
        publish();
    }

    function submitAction(action) {
        action.seed = state.seed;
        if (online && !room.isHost) {
            pendingDrop = action.type === "drop";
            renderUi();
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, online ? state.seats.host : 0);
    }

    function attemptDrop() {
        if (!state || state.phase !== "playing" || paused || uiOverlay || pendingDrop) return;
        if (state.turn !== mySeat()) return;
        let x = movingX(state, effNow(), slowF());
        if (!online && cheats.auto) x = state.blocks[state.blocks.length - 1].x;
        submitAction({ type: "drop", x });
    }

    /* ---------------- Bot (mode AI) ---------------- */
    function planBot() {
        const prev = state.blocks[state.blocks.length - 1];
        const skill = state.level.botSkill;
        const sigma = (1 - skill) * prev.w * 0.5 + state.spawn.speed * 0.03;
        const target = clamp(prev.x + gauss(Math.random) * sigma, PAD, W - PAD - state.spawn.w);
        botPlan = { target, readyAt: effNow() + 350 + Math.random() * 550, prevX: null };
    }
    function botMaybeDrop(x, now) {
        if (!botPlan) planBot();
        if (now >= botPlan.readyAt && botPlan.prevX !== null &&
            (botPlan.prevX - botPlan.target) * (x - botPlan.target) <= 0) {
            const bx = x; botPlan = null;
            applyAction({ type: "drop", x: bx, seed: state.seed }, botSeat);
            return;
        }
        botPlan.prevX = x;
    }

    /* ---------------- cheat & jeda (offline) ---------------- */
    function shiftTime(d) {
        if (state?.spawn) state.turnStartedAt += d;
        if (botPlan) botPlan.readyAt += d;
        if (frozenAt) frozenAt += d;
    }
    function toggleCheat(key, on) {
        if (online || !(key in cheats)) return;
        const now = Date.now();
        if (key === "slow") {
            const oldF = slowF(), newF = on ? 0.5 : 1;
            if (state?.spawn) state.turnStartedAt = Math.round(now - (now - state.turnStartedAt) * oldF / newF);
            cheats.slow = on;
        } else if (key === "freeze") {
            if (on) { cheats.freeze = true; frozenAt = now; }
            else { cheats.freeze = false; shiftTime(now - frozenAt); frozenAt = 0; }
        } else cheats[key] = on;
        if (on) cheated = true;
        renderUi();
    }
    function cheatWin() {
        if (online || !state || state.phase !== "playing") return;
        cheated = true;
        while (state.drops < state.level.target) {
            const p = state.blocks[state.blocks.length - 1];
            state.blocks.push({ x: p.x, w: p.w, perfect: true, by: 0 });
            state.drops++;
        }
        state.phase = "ended";
        state.result = { winner: 0, reason: "cheat" };
        state.spawn = null;
        uiOverlay = null;
        publish();
    }
    function togglePause() {
        if (online || !state || state.phase !== "playing") return;
        if (!paused) { paused = true; pauseAt = Date.now(); }
        else { shiftTime(Date.now() - pauseAt); paused = false; pauseAt = 0; }
        renderUi();
    }

    /* ---------------- events: mouse / touch / keyboard ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const btn = t.closest("[data-act]");
        if (btn) {
            const a = btn.dataset.act;
            if (a === "drop") attemptDrop();
            else if (a === "start" || a === "restart") submitAction({ type: a });
            else if (a === "pause") togglePause();
            else if (a === "help") { uiOverlay = uiOverlay === "help" ? null : "help"; renderUi(); }
            else if (a === "cheat") { if (!online) { uiOverlay = uiOverlay === "cheat" ? null : "cheat"; renderUi(); } }
            else if (a === "cheatwin") cheatWin();
            else if (a === "closeov") { uiOverlay = null; dismissedEnd = true; renderUi(); }
            return;
        }
        if (t.hasAttribute && t.hasAttribute("data-ovback") && uiOverlay) { uiOverlay = null; renderUi(); }
    }
    function handleChange(event) {
        const cb = event.target.closest("[data-cheat]");
        if (cb) toggleCheat(cb.dataset.cheat, cb.checked);
    }
    function handlePointer(event) {
        event.preventDefault();
        attemptDrop();
    }
    function handleKey(e) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest && e.target.closest("button,input,textarea") && (e.key === " " || e.key === "Enter")) return;
        switch (e.code) {
            case "Space": case "Enter": case "ArrowDown":
                e.preventDefault(); attemptDrop(); break;
            case "KeyP": togglePause(); break;
            case "KeyR": if (canManage()) submitAction({ type: "restart" }); break;
            case "KeyH": uiOverlay = uiOverlay === "help" ? null : "help"; renderUi(); break;
            case "KeyC": if (!online) { uiOverlay = uiOverlay === "cheat" ? null : "cheat"; renderUi(); } break;
            case "Escape": if (uiOverlay) { uiOverlay = null; renderUi(); } break;
        }
    }
    function handleVis() {
        if (document.hidden && !online && state?.phase === "playing" && !paused) togglePause();
    }

    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    svgEl.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("visibilitychange", handleVis);

    /* ---------------- loop animasi ---------------- */
    function frame() {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!state) return;
        if (state.phase === "playing" && state.spawn) {
            if (!online && state.turn === botSeat && !paused && !uiOverlay) {
                botMaybeDrop(movingX(state, effNow(), slowF()), effNow());
            } else if (state.turn !== botSeat) botPlan = null;
        }
        renderBoard();
    }

    /* ---------------- inisialisasi mode ---------------- */
    const sub = (u) => { if (typeof u === "function") unsubs.push(u); };
    if (online) {
        sub(room.onRoom((next) => { roomData = next; renderUi(); }));
        if (room.isHost) {
            newRound(false); // host: buat ronde (seat & giliran pertama acak) lalu publish
            sub(room.onAction((action) => applyAction(action, state ? state.seats.guest : 1)));
        } else {
            sub(room.onState((next) => {
                if (!next) return;
                state = next;
                pendingDrop = false; botPlan = null;
                const d = state.turnStartedAt - Date.now();
                clockOffset = d > 0 ? d : Math.max(0, clockOffset - 50);
                render();
            }));
        }
    } else {
        newRound(false); // offline: coin toss kamu vs Bot
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svgEl.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener("visibilitychange", handleVis);
            fxTimers.forEach(clearTimeout); fxTimers.clear();
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}