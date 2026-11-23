/*
 * Cats Wars - clone artileri turn-based 2D (kucing vs kucing).
 * 1. File ini bernama cats-wars.js (META.id harus sama).
 * 2. Jalankan: node tools/build-games-manifest.mjs
 *
 * Fitur: terrain destruktif, 2 tim, giliran + timer, 6 senjata, angin, peti,
 * AI (3 level), multiplayer room (host otoritatif, tamu kirim input),
 * level acak yang selalu bisa dijelajahi, cheat overlay, tutorial,
 * kontrol keyboard + mouse + tombol layar untuk mobile.
 */

export const META = {
    id: "cats-wars",
    name: "Cats Wars",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Kucing vs kucing: bidik, tembak, hancurkan tanah lawan. Main vs Bot, 2 pemain lokal, atau online.",
    art: '<svg viewBox="0 0 48 48"><path d="M9 22 11 6l11 7h4l11-7 2 16v8c0 9-8 14-15 14S9 39 9 30z" fill="#fff"/><circle cx="18" cy="26" r="2.4" fill="#0f172a"/><circle cx="30" cy="26" r="2.4" fill="#0f172a"/><path d="M22 32h4l-2 3z" fill="#f97316"/></svg>',
    bg: ["#fdba74", "#f97316"],
    bestKey: "catsWarsWins",
};

const W = 960, H = 540, WL = H - 30, DT = 1 / 60, G = 0.2;
const TEAMS = [
    { n: "Oranye", c: "#f97316" },
    { n: "Teal", c: "#0d9488" },
];
const WEAPONS = [
    { id: "bazooka", n: "Bazoka", i: "🚀", ammo: -1 },
    { id: "grenade", n: "Granat", i: "💣", ammo: 5 },
    { id: "shotgun", n: "Shotgun", i: "🔫", ammo: 6 },
    { id: "dynamite", n: "Dinamit", i: "🧨", ammo: 2 },
    { id: "airstrike", n: "Air Strike", i: "✈️", ammo: 2 },
    { id: "punch", n: "Pukulan", i: "👊", ammo: -1 },
];
const NAMES = ["Mochi", "Luna", "Oreo", "Simba", "Milo", "Nala", "Tiger", "Kiki", "Boba", "Coco", "Felix", "Pixel", "Ziggy", "Momo", "Garfy"];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mkRng = (s) => () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rndSeed = () => (Math.random() * 1e9) | 0;

const CSS = `
.cw{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;max-width:980px;margin:0 auto}
.cw *{box-sizing:border-box}
.cw-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.cw-top h2{margin:0;font-size:18px;letter-spacing:-.01em}
.cw-top p{margin:0;font-size:12px;color:#64748b}
.cw-tools{display:flex;gap:6px;flex-wrap:wrap}
.cw-btn{border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:6px 10px;font-size:13px;cursor:pointer;color:#0f172a;font-family:inherit}
.cw-btn:hover{background:#f1f5f9}
.cw-btn.on{background:#0f172a;color:#fff;border-color:#0f172a}
.cw-btn.pri{background:#f97316;border-color:#f97316;color:#fff;font-weight:600}
.cw-btn:focus-visible{outline:2px solid #0d9488;outline-offset:2px}
.cw-btn[disabled]{opacity:.4;cursor:not-allowed}
.cw-stage{position:relative;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#f8fafc;touch-action:none}
.cw-stage canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;cursor:crosshair}
.cw-ov{position:absolute;inset:0;background:rgba(248,250,252,.93);display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;z-index:2}
.cw-ov[hidden]{display:none}
.cw-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;max-width:480px;width:100%;font-size:13px;line-height:1.55}
.cw-card h3{margin:0 0 6px;font-size:16px}
.cw-card p{margin:4px 0}
.cw-card ul{margin:4px 0 4px 16px;padding:0}
.cw-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}
.cw-row>b{width:92px;font-weight:600;color:#64748b;font-size:12px}
.cw-wb{display:flex;gap:6px;overflow-x:auto;padding:8px 0 2px}
.cw-wb .cw-btn{flex:0 0 auto;white-space:nowrap}
.cw-pad{display:none;justify-content:space-between;align-items:center;gap:10px;margin-top:6px;user-select:none;-webkit-user-select:none;touch-action:none}
.cw-pad.on{display:flex}
@media (pointer:coarse){.cw-pad{display:flex}}
.cw-g{display:flex;gap:6px}
.cw-pad button{width:52px;height:52px;border-radius:14px;border:1px solid #cbd5e1;background:#fff;font-size:18px;color:#0f172a;touch-action:none}
.cw-pad button:active{background:#e2e8f0}
.cw-pad .cw-fire{width:96px;background:#f97316;border-color:#f97316;color:#fff;font-weight:700;font-size:14px}
.cw-act{display:flex;justify-content:flex-end;margin-top:8px}
`;

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const isHost = !online || room.isHost;
    const sim = isHost; // hanya host / lokal yang menjalankan logika game
    let roomData = room?.room || null;
    let state = null;

    const ui = { setup: isHost, help: false, cheat: false, pad: false, muted: false };
    const setup = { mode: online ? "room" : mode === "local" ? "local" : "ai", diff: "medium", cats: 3, time: 30, seed: rndSeed() };
    const cheats = { god: -1, inf: false, freeze: false, noWind: false, max: false, big: false, tp: false };
    let seenHelp = false;
    try { seenHelp = localStorage.getItem("catsWarsHelp") === "1"; } catch (_) { }
    if (!seenHelp) ui.help = true;

    root.innerHTML = `
  <style>${CSS}</style>
  <div class="game-app cw">
    <div class="cw-top">
      <div><h2>Cats Wars</h2><p><span data-status>Siap</span></p></div>
      <div class="cw-tools">
        <button class="cw-btn" data-help type="button">? Cara main</button>
        ${online ? "" : '<button class="cw-btn" data-cheat type="button">Cheat</button>'}
        <button class="cw-btn" data-padtoggle type="button">Tombol layar</button>
        <button class="cw-btn" data-mute type="button">Suara</button>
      </div>
    </div>
    <section class="cw-stage game-panel" data-board>
      <canvas width="${W}" height="${H}" data-cv></canvas>

      <div class="cw-ov" data-ov="setup" hidden><div class="cw-card">
        <h3>Cats Wars</h3>
        <p style="color:#64748b">Hancurkan semua kucing lawan. Peta dibuat acak dan selalu bisa dilalui.</p>
        <div class="cw-row" data-local><b>Mode</b>
          <button class="cw-btn" data-set="mode:ai" type="button">Vs Bot</button>
          <button class="cw-btn" data-set="mode:local" type="button">2 Pemain lokal</button></div>
        <div class="cw-row" data-local data-aionly><b>Level bot</b>
          <button class="cw-btn" data-set="diff:easy" type="button">Mudah</button>
          <button class="cw-btn" data-set="diff:medium" type="button">Sedang</button>
          <button class="cw-btn" data-set="diff:hard" type="button">Sulit</button></div>
        <div class="cw-row"><b>Kucing / tim</b>
          ${[1, 2, 3, 4, 5].map((n) => `<button class="cw-btn" data-set="cats:${n}" type="button">${n}</button>`).join("")}</div>
        <div class="cw-row"><b>Waktu giliran</b>
          ${[20, 30, 45, 60].map((n) => `<button class="cw-btn" data-set="time:${n}" type="button">${n}d</button>`).join("")}</div>
        <div class="cw-row"><b>Peta</b><button class="cw-btn" data-newmap type="button">🎲 Acak peta</button><span data-seed style="color:#64748b;font-size:12px"></span></div>
        <div class="cw-row"><button class="cw-btn pri" data-start type="button">Mulai</button><button class="cw-btn" data-exit type="button">Keluar</button></div>
        <p data-wins style="color:#64748b;font-size:12px"></p>
      </div></div>

      <div class="cw-ov" data-ov="wait" hidden><div class="cw-card"><h3>Menunggu host…</h3><p>Host sedang menyiapkan permainan. Posisi tim kamu akan diacak otomatis.</p>
        <div class="cw-row"><button class="cw-btn" data-exit type="button">Keluar</button></div></div></div>

      <div class="cw-ov" data-ov="over" hidden><div class="cw-card"><h3 data-overtitle>Selesai</h3><p data-oversub></p>
        <div class="cw-row"><button class="cw-btn pri" data-again type="button">Main lagi</button><button class="cw-btn" data-exit type="button">Keluar</button></div></div></div>

      <div class="cw-ov" data-ov="help" hidden><div class="cw-card">
        <h3>Cara bermain</h3>
        <p><b>Tujuan:</b> habiskan semua kucing lawan. Kucing mati jika HP habis atau jatuh ke air. Tiap giliran memakai satu kucing, ada batas waktu.</p>
        <p><b>Keyboard:</b></p>
        <ul><li>← → / A D: jalan (di mode Air Strike: geser target)</li><li>↑ ↓ / W S: atur sudut bidik</li><li>Enter: lompat</li><li>Spasi: tahan untuk isi power, lepas untuk menembak</li><li>1–6 atau Q / E: ganti senjata</li></ul>
        <p><b>Mouse:</b> gerakkan untuk membidik, tahan klik lalu lepas untuk menembak, scroll untuk ganti senjata. Air Strike: klik titik target, lalu Spasi.</p>
        <p><b>Mobile:</b> pakai tombol layar (◀ ▶ ⤒ ▲ ▼ dan TEMBAK, tahan lalu lepas).</p>
        <p><b>Senjata:</b> Bazoka (terpengaruh angin), Granat (memantul, meledak 3 detik), Shotgun (3 peluru), Dinamit (taruh lalu lari), Air Strike (5 rudal), Pukulan (jarak dekat).</p>
        <p><b>Tips:</b> perhatikan panah angin, ambil peti 🟩 (HP) dan 🟫 (amunisi), gali tanah di bawah lawan agar jatuh.</p>
        <div class="cw-row"><button class="cw-btn pri" data-help type="button">Mengerti</button></div>
      </div></div>

      <div class="cw-ov" data-ov="cheat" hidden><div class="cw-card">
        <h3>Cheat</h3>
        <div class="cw-row"><button class="cw-btn" data-ch="god" type="button">Kebal</button><button class="cw-btn" data-ch="inf" type="button">Amunisi tak terbatas</button><button class="cw-btn" data-ch="freeze" type="button">Bekukan waktu</button></div>
        <div class="cw-row"><button class="cw-btn" data-ch="noWind" type="button">Tanpa angin</button><button class="cw-btn" data-ch="max" type="button">Power penuh instan</button><button class="cw-btn" data-ch="big" type="button">Ledakan besar</button></div>
        <div class="cw-row"><button class="cw-btn" data-ch="heal" type="button">Pulihkan HP</button><button class="cw-btn" data-ch="ammo" type="button">Isi amunisi</button><button class="cw-btn" data-ch="crates" type="button">Jatuhkan peti</button></div>
        <div class="cw-row"><button class="cw-btn" data-ch="tp" type="button">Teleport (klik peta)</button><button class="cw-btn" data-ch="skip" type="button">Lewati giliran</button><button class="cw-btn" data-ch="kill" type="button">Habisi lawan</button></div>
        <div class="cw-row"><button class="cw-btn pri" data-cheat type="button">Tutup</button></div>
      </div></div>
    </section>

    <div class="cw-wb" data-wb></div>

    <div class="cw-pad" data-pad>
      <div class="cw-g"><button data-hold="l" type="button" aria-label="Kiri">◀</button><button data-hold="r" type="button" aria-label="Kanan">▶</button><button data-jump type="button" aria-label="Lompat">⤒</button></div>
      <div class="cw-g"><button data-hold="u" type="button" aria-label="Bidik naik">▲</button><button data-hold="d" type="button" aria-label="Bidik turun">▼</button></div>
      <button class="cw-fire" data-fire type="button">TEMBAK</button>
    </div>
    <div class="game-actions cw-act"><button class="game-action-button cw-btn" type="button" data-exit>Exit game</button></div>
  </div>`;

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => [...root.querySelectorAll(s)];
    const cv = $("[data-cv]");
    const ctx = cv.getContext("2d");
    const statusEl = $("[data-status]");

    // ---------------------------------------------------------------- terrain
    const tc = document.createElement("canvas");
    tc.width = W; tc.height = H;
    const tctx = tc.getContext("2d");
    const mask = new Uint8Array(W * H);
    let builtSeed = null, applied = 0;

    const solid = (x, y) => {
        x = Math.floor(x); y = Math.floor(y);
        return x >= 0 && x < W && y >= 0 && y < H && mask[y * W + x] === 1;
    };
    const surfY = (x) => {
        x = clamp(Math.floor(x), 0, W - 1);
        for (let y = 0; y < H; y++) if (mask[y * W + x]) return y;
        return H;
    };

    // Terrain acak. Kemiringan dibatasi <= 1 px per kolom sehingga kucing selalu bisa
    // berjalan ke mana saja, dan seluruh daratan dijaga di atas permukaan air.
    function genHeights(seed) {
        const r = mkRng(seed), h = new Float32Array(W);
        const base = H * 0.52 + (r() - 0.5) * 60;
        const waves = [0, 1, 2, 3].map((i) => ({
            a: (46 - i * 9) * (0.5 + r()),
            f: ((1 + i * 1.7) * (0.8 + r() * 0.4) * Math.PI * 2) / W,
            p: r() * 6.28,
        }));
        for (let x = 0; x < W; x++) h[x] = base + waves.reduce((s, w) => s + w.a * Math.sin(w.f * x + w.p), 0);
        for (let x = 1; x < W; x++) h[x] = clamp(h[x], h[x - 1] - 1, h[x - 1] + 1);
        for (let x = W - 2; x >= 0; x--) h[x] = clamp(h[x], h[x + 1] - 1, h[x + 1] + 1);
        for (let x = 0; x < W; x++) h[x] = clamp(h[x], 150, WL - 50);
        return h;
    }

    function buildTerrain(seed) {
        const h = genHeights(seed);
        const img = tctx.createImageData(W, H), d = img.data;
        mask.fill(0);
        for (let x = 0; x < W; x++) {
            const top = Math.ceil(h[x]);
            for (let y = top; y < H; y++) {
                mask[y * W + x] = 1;
                const o = (y * W + x) * 4, dep = y - top;
                let c;
                if (dep < 4) c = [148, 163, 184];
                else { const sh = ((y >> 3) + (x >> 5)) & 1 ? 0 : 7; c = [71 - sh, 85 - sh, 105 - sh]; }
                d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
            }
        }
        tctx.clearRect(0, 0, W, H);
        tctx.putImageData(img, 0, 0);
        builtSeed = seed; applied = 0;
        return h;
    }

    function carve(x, y, r) {
        tctx.save();
        tctx.globalCompositeOperation = "destination-out";
        tctx.beginPath(); tctx.arc(x, y, r, 0, 7); tctx.fill();
        tctx.restore();
        const r2 = r * r;
        for (let yy = Math.max(0, y - r); yy < Math.min(H, y + r + 1); yy++)
            for (let xx = Math.max(0, x - r); xx < Math.min(W, x + r + 1); xx++)
                if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) mask[yy * W + xx] = 0;
    }

    function syncCraters() {
        if (!state) return;
        if (state.seed !== builtSeed) buildTerrain(state.seed);
        for (; applied < state.craters.length; applied++) {
            const [x, y, r] = state.craters[applied];
            carve(x, y, r);
        }
    }

    // ---------------------------------------------------------------- sound
    let ac = null;
    function audio() {
        if (ui.muted) return null;
        try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (_) { return null; }
        return ac;
    }
    function tone(f0, f1, dur, type = "square", vol = 0.08) {
        const a = audio(); if (!a) return;
        const o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), a.currentTime + dur);
        g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    }
    function noise(dur, vol = 0.2) {
        const a = audio(); if (!a) return;
        const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = a.createBufferSource(), g = a.createGain();
        s.buffer = b; g.gain.value = vol; s.connect(g); g.connect(a.destination); s.start();
    }
    const sfx = (k) => {
        if (k === "boom") noise(0.4, 0.25);
        else if (k === "shot") tone(320, 90, 0.14, "sawtooth", 0.07);
        else if (k === "hit") tone(220, 110, 0.09, "square", 0.07);
        else if (k === "splash") noise(0.2, 0.1);
        else if (k === "pick") tone(600, 1000, 0.14, "sine", 0.09);
    };

    // ---------------------------------------------------------------- helpers
    const myTeam = () => (!state ? 0 : playerIndex === 0 ? state.hostTeam : 1 - state.hostTeam);
    const localTeam = (t) => (online ? t === myTeam() : state.mode === "ai" ? t === 0 : true);
    const kd = { l: 0, r: 0, u: 0, d: 0 };
    const keysFor = (t) => (localTeam(t) ? kd : state.keys[t] || {});
    const alive = (t) => state.cats.filter((c) => c.team === t && c.alive);

    function pushEvt(x, y, r, s, x2 = 0, y2 = 0) {
        state.evN++;
        state.evts.push({ n: state.evN, x: Math.round(x), y: Math.round(y), r: Math.round(r), s, x2: Math.round(x2), y2: Math.round(y2) });
        if (state.evts.length > 14) state.evts.shift();
    }
    const normalize = (s) => {
        s.projs = s.projs || []; s.crates = s.crates || []; s.craters = s.craters || [];
        s.evts = s.evts || []; s.keys = s.keys || [{}, {}]; s.winner = s.winner ?? null;
        return s;
    };

    // ---------------------------------------------------------------- game setup
    function startGame() {
        const seed = setup.seed, h = buildTerrain(seed), r = mkRng(seed ^ 0x5bd1);
        const n = setup.cats, cats = [];
        const teams = [];
        for (let i = 0; i < n; i++) teams.push(0, 1);
        for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[teams[i], teams[j]] = [teams[j], teams[i]]; }
        const names = [...NAMES].sort(() => r() - 0.5);
        teams.forEach((t, i) => {
            const x = Math.round(70 + ((W - 140) * (i + 0.5)) / teams.length + (r() - 0.5) * 20);
            cats.push({ id: i, team: t, name: names[i % names.length], x, y: Math.ceil(h[x]), vx: 0, vy: 0, hp: 100, dir: x < W / 2 ? 1 : -1, alive: true, g: true });
        });
        state = {
            seed, craters: [], mode: online ? "room" : setup.mode, diff: setup.diff, cfg: { cats: n, time: setup.time },
            cats, projs: [], crates: [], evts: [], evN: 0,
            turnTeam: Math.random() < 0.5 ? 0 : 1, // siapa jalan duluan diacak
            hostTeam: Math.random() < 0.5 ? 0 : 1, // posisi tim host diacak (online)
            hostName: playerName,
            cur: 0, phase: "aim", timer: setup.time, wind: 0, weapon: 0, aim: 35, power: 0, charging: false, airX: W / 2,
            ammo: [WEAPONS.map((w) => w.ammo), WEAPONS.map((w) => w.ammo)], keys: [{}, {}], next: [0, 0],
            retreat: 0, settle: 0, winner: null, banner: "", bannerT: 0,
        };
        applied = 0; lastEv = 0; parts = []; rings = []; traces = [];
        Object.assign(cheats, { god: -1, inf: false, freeze: false, noWind: false, max: false, big: false, tp: false });
        ui.setup = false;
        startTurn(state.turnTeam);
        publish(true); render();
    }

    function startTurn(team) {
        const s = state;
        s.turnTeam = team;
        const list = alive(team);
        const c = list[s.next[team]++ % list.length];
        s.cur = s.cats.indexOf(c);
        s.phase = "aim"; s.timer = s.cfg.time; s.weapon = 0; s.power = 0; s.charging = false;
        s.retreat = 0; s.settle = 0; s.keys = [{}, {}];
        s.wind = cheats.noWind ? 0 : Math.round(Math.random() * 20 - 10);
        const who = s.mode === "ai" ? (team === 0 ? "Giliranmu" : "Giliran Bot") : s.mode === "room" ? (team === myTeam() ? "Giliranmu" : "Giliran lawan") : `Giliran Tim ${TEAMS[team].n}`;
        s.banner = `${who} · ${c.name}`; s.bannerT = 1.8;
        if (Math.random() < 0.4) spawnCrate();
        botReset();
    }

    function spawnCrate() {
        const x = Math.round(40 + Math.random() * (W - 80));
        if (surfY(x) < WL - 20) state.crates.push({ k: Math.random() < 0.5 ? "h" : "a", x, y: 0, vy: 0, w: 1 + ((Math.random() * 4) | 0) });
    }

    function endTurn() {
        const s = state, a = [alive(0).length, alive(1).length];
        if (!a[0] || !a[1]) {
            s.phase = "over"; s.winner = a[0] ? 0 : a[1] ? 1 : -1;
            if (s.mode === "ai" && s.winner === 0) {
                try { localStorage.setItem(META.bestKey, String((+localStorage.getItem(META.bestKey) || 0) + 1)); } catch (_) { }
            }
            publish(true); return;
        }
        startTurn(a[1 - s.turnTeam] ? 1 - s.turnTeam : s.turnTeam);
    }

    // ---------------------------------------------------------------- physics
    const groundAt = (x, y) => solid(x, y) || solid(x - 3, y) || solid(x + 3, y);
    function bodyHit(x, y) {
        return solid(x, y - 1) || solid(x, y - 7) || solid(x, y - 13) || solid(x - 4, y - 7) || solid(x + 4, y - 7) || solid(x - 4, y - 13) || solid(x + 4, y - 13);
    }

    function hurt(c, dmg) {
        if (!sim || !c.alive || dmg <= 0 || cheats.god === c.team) return;
        c.hp -= dmg;
        if (c.hp <= 0) { c.hp = 0; c.alive = false; pushEvt(c.x, c.y - 7, 16, "boom"); }
        else pushEvt(c.x, c.y - 8, 0, "hit");
    }

    function stepCat(c) {
        if (!c.alive) return;
        if (Math.abs(c.vx) > 0.05) {
            let rem = Math.abs(c.vx); const sg = Math.sign(c.vx);
            while (rem > 0) {
                const st = Math.min(1, rem), nx = c.x + sg * st; let ok = false;
                for (let k = 0; k <= (c.g ? 6 : 2) && !ok; k++) if (!bodyHit(nx, c.y - k)) { c.x = nx; c.y -= k; ok = true; }
                if (!ok) { c.vx *= -0.25; break; }
                rem -= st;
            }
        }
        c.vx *= c.g ? 0.82 : 0.995;
        if (Math.abs(c.vx) < 0.05) c.vx = 0;
        if (c.vy < 0) {
            const n = Math.ceil(-c.vy);
            for (let i = 0; i < n; i++) { if (bodyHit(c.x, c.y - 1)) { c.vy = 0; break; } c.y--; }
            c.vy += G; c.g = false;
        } else if (groundAt(c.x, c.y)) {
            if (!c.g && c.vy > 6.5) hurt(c, Math.floor((c.vy - 6.5) * 6));
            c.g = true; c.vy = 0;
        } else {
            let landed = false;
            if (c.g && c.vy === 0) for (let k = 1; k <= 4; k++) if (groundAt(c.x, c.y + k)) { c.y += k; landed = true; break; }
            if (!landed) {
                c.g = false; c.vy = Math.min(c.vy + G, 12);
                for (let i = 0, n = Math.ceil(c.vy); i < n; i++) { if (groundAt(c.x, c.y)) break; c.y++; }
            }
        }
        if (sim && (c.y > WL + 6 || c.x < -20 || c.x > W + 20)) {
            c.alive = false; c.hp = 0; pushEvt(clamp(c.x, 0, W), WL, 0, "splash");
        }
    }

    function walk(c, d) {
        c.dir = d;
        if (!c.g) return;
        const nx = c.x + d * 1.1;
        for (let k = 0; k <= 6; k++) if (!bodyHit(nx, c.y - k)) { c.x = nx; c.y -= k; return; }
    }

    function boom(x, y, r, dmg, kb) {
        if (cheats.big && state.turnTeam === (state.mode === "ai" ? 0 : state.turnTeam)) { r *= 1.5; dmg *= 1.5; }
        state.craters.push([Math.round(x), Math.round(y), Math.round(r)]);
        syncCraters();
        pushEvt(x, y, r, "boom");
        const R = r + 12;
        for (const c of state.cats) {
            if (!c.alive) continue;
            const dx = c.x - x, dy = c.y - 7 - y, d = Math.hypot(dx, dy);
            if (d < R) {
                const f = 1 - d / R, a = Math.atan2(dy, dx);
                hurt(c, Math.round(dmg * f));
                c.vx += Math.cos(a) * kb * f; c.vy += Math.sin(a) * kb * f - 1.2 * f; c.g = false;
            }
        }
        state.crates = state.crates.filter((cr) => Math.hypot(cr.x - x, cr.y - y) > r);
    }

    const hitsCat = (x, y, me) => state.cats.some((c) => c.alive && c !== me && Math.hypot(c.x - x, c.y - 7 - y) < 8);

    function stepProjs() {
        const s = state;
        for (let i = s.projs.length - 1; i >= 0; i--) {
            const p = s.projs[i]; p.age++;
            let gone = false;
            if (p.k === "r" || p.k === "m") {
                p.vy += p.k === "r" ? 0.15 : 0.05;
                if (p.k === "r") p.vx += s.wind * 0.0012;
                const n = Math.ceil(Math.hypot(p.vx, p.vy));
                for (let j = 0; j < n; j++) {
                    p.x += p.vx / n; p.y += p.vy / n;
                    if (solid(p.x, p.y) || (p.age > 12 && hitsCat(p.x, p.y, null)) || (p.k === "r" && p.age <= 12 && hitsCat(p.x, p.y, s.cats[s.cur]) && false)) {
                        if (p.k === "r") boom(p.x, p.y, 34, 45, 6); else boom(p.x, p.y, 26, 30, 5);
                        gone = true; break;
                    }
                }
                if (!gone && (p.x < -80 || p.x > W + 80 || p.y > WL)) { if (p.y > WL && p.x > 0 && p.x < W) pushEvt(p.x, WL, 0, "splash"); gone = true; }
            } else {
                p.t -= DT; p.vy += G * 0.75;
                const e = p.k === "g" ? 0.55 : 0.12, n = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy), 1));
                for (let j = 0; j < n; j++) {
                    const nx = p.x + p.vx / n, ny = p.y + p.vy / n;
                    if (solid(nx, ny)) {
                        let sx = 0, sy = 0;
                        for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) if (!solid(p.x + ox, p.y + oy)) { sx += ox; sy += oy; }
                        let m = Math.hypot(sx, sy); if (!m) { sx = 0; sy = -1; m = 1; }
                        sx /= m; sy /= m;
                        const dot = p.vx * sx + p.vy * sy;
                        if (dot < 0) { p.vx -= (1 + e) * dot * sx; p.vy -= (1 + e) * dot * sy; }
                        p.vx *= 0.8;
                        if (Math.hypot(p.vx, p.vy) < 0.5) { p.vx = 0; p.vy = 0; }
                        break;
                    }
                    p.x = nx; p.y = ny;
                }
                if (p.t <= 0) { if (p.k === "g") boom(p.x, p.y, 42, 55, 7); else boom(p.x, p.y, 58, 80, 8); gone = true; }
                else if (p.y > WL) { pushEvt(p.x, WL, 0, "splash"); gone = true; }
            }
            if (gone) s.projs.splice(i, 1);
        }
    }

    function stepCrates() {
        const s = state;
        for (let i = s.crates.length - 1; i >= 0; i--) {
            const cr = s.crates[i];
            if (!solid(cr.x, cr.y + 6) && !solid(cr.x - 5, cr.y + 6) && !solid(cr.x + 5, cr.y + 6)) { cr.vy = Math.min(cr.vy + 0.1, 3); cr.y += cr.vy; }
            else cr.vy = 0;
            if (!sim) continue;
            if (cr.y > WL) { s.crates.splice(i, 1); continue; }
            const c = s.cats.find((t) => t.alive && Math.abs(t.x - cr.x) < 12 && Math.abs(t.y - 7 - cr.y) < 14);
            if (c) {
                if (cr.k === "h") c.hp = Math.min(100, c.hp + 30);
                else if (s.ammo[c.team][cr.w] >= 0) s.ammo[c.team][cr.w] += 2;
                pushEvt(cr.x, cr.y, 0, "pick");
                s.banner = cr.k === "h" ? `${c.name} +30 HP` : `${c.name} +2 ${WEAPONS[cr.w].n}`; s.bannerT = 1.4;
                s.crates.splice(i, 1);
            }
        }
    }

    // ---------------------------------------------------------------- firing
    function fire() {
        const s = state;
        if (s.phase !== "aim") return;
        const c = s.cats[s.cur], w = WEAPONS[s.weapon], t = s.turnTeam;
        if (s.ammo[t][s.weapon] === 0) { s.charging = false; s.power = 0; return; }
        if (s.ammo[t][s.weapon] > 0 && !cheats.inf) s.ammo[t][s.weapon]--;
        const a = (s.aim * Math.PI) / 180, dx = c.dir * Math.cos(a), dy = -Math.sin(a), sp = 2 + s.power * 0.08;
        const ox = c.x + dx * 12, oy = c.y - 8 + dy * 12;
        pushEvt(ox, oy, 0, "shot");
        if (w.id === "bazooka") s.projs.push({ k: "r", x: ox, y: oy, vx: dx * sp, vy: dy * sp, age: 0 });
        else if (w.id === "grenade") s.projs.push({ k: "g", x: ox, y: oy, vx: dx * sp, vy: dy * sp, t: 3, age: 0 });
        else if (w.id === "dynamite") { s.projs.push({ k: "d", x: c.x, y: c.y - 6, vx: c.dir * 0.8, vy: -1, t: 4, age: 0 }); s.retreat = 4.5; }
        else if (w.id === "airstrike") for (let i = 0; i < 5; i++) s.projs.push({ k: "m", x: s.airX + (i - 2) * 30 + (Math.random() - 0.5) * 10, y: -20 - i * 45, vx: 0, vy: 3, age: 0 });
        else if (w.id === "shotgun") {
            for (let i = 0; i < 3; i++) {
                const aa = a + (i - 1) * 0.05, ddx = c.dir * Math.cos(aa), ddy = -Math.sin(aa);
                let x = c.x + ddx * 8, y = c.y - 8 + ddy * 8;
                for (let d = 0; d < 220; d++) {
                    x += ddx * 2; y += ddy * 2;
                    const t2 = s.cats.find((o) => o !== c && o.alive && Math.hypot(o.x - x, o.y - 7 - y) < 7);
                    if (t2) { hurt(t2, 18); t2.vx += ddx * 3; t2.vy -= 1.5; t2.g = false; break; }
                    if (solid(x, y)) { boom(x, y, 9, 4, 1.5); break; }
                    if (x < 0 || x > W || y > WL) break;
                }
                pushEvt(c.x + ddx * 8, c.y - 8 + ddy * 8, 0, "tr", x, y);
            }
        } else if (w.id === "punch") {
            for (const o of s.cats) {
                if (o === c || !o.alive) continue;
                const dxx = (o.x - c.x) * c.dir;
                if (dxx > -4 && dxx < 22 && Math.abs(o.y - c.y) < 16) { hurt(o, 25); o.vx += c.dir * 4; o.vy = -3.5; o.g = false; }
            }
        }
        s.charging = false; s.power = 0; s.phase = "resolve"; s.settle = 0;
    }

    function applyAction(a, actor) {
        const s = state;
        if (!s) return;
        const team = online ? (actor === 0 ? s.hostTeam : 1 - s.hostTeam) : actor;
        if (s.phase !== "aim" && s.phase !== "resolve") return;
        if (team !== s.turnTeam) return;
        const c = s.cats[s.cur];
        if (!c || !c.alive) return;
        const aim = s.phase === "aim";
        switch (a.type) {
            case "keys": s.keys[team] = { l: a.l ? 1 : 0, r: a.r ? 1 : 0, u: a.u ? 1 : 0, d: a.d ? 1 : 0 }; break;
            case "jump": if (c.g && (aim || s.retreat > 0)) { c.vy = -4.2; c.vx = c.dir * 1.6; c.g = false; } break;
            case "weapon": if (aim && !s.charging) s.weapon = clamp(a.w | 0, 0, WEAPONS.length - 1); break;
            case "aim": if (aim) { c.dir = a.dir > 0 ? 1 : -1; s.aim = clamp(+a.a || 0, -60, 85); } break;
            case "airx": if (aim) s.airX = clamp(+a.x || 0, 10, W - 10); break;
            case "charge": if (aim && !s.charging && s.ammo[team][s.weapon] !== 0) { s.charging = true; s.power = cheats.max ? 100 : 0; } break;
            case "release": if (aim && s.charging) fire(); break;
            default: break;
        }
    }

    function submitAction(a) {
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, online ? 0 : state.turnTeam);
    }

    function canAct() {
        const s = state;
        if (!s || ui.setup && isHost && false) return false;
        if (s.phase !== "aim" && s.phase !== "resolve") return false;
        return online ? s.turnTeam === myTeam() : s.mode === "local" || s.turnTeam === 0;
    }
    const act = (a) => { if (canAct()) submitAction(a); };

    // ---------------------------------------------------------------- bot
    let bot = {};
    const botReset = () => { bot = { st: "wait", w: 0.9, mv: 0, lx: 0, lt: 0, flee: 0 }; };

    function simRocket(x, y, vx, vy, wind, tx, ty, me) {
        for (let i = 0; i < 500; i++) {
            vy += 0.15; vx += wind * 0.0012;
            const n = Math.ceil(Math.hypot(vx, vy));
            for (let j = 0; j < n; j++) {
                x += vx / n; y += vy / n;
                if (solid(x, y) || hitsCat(x, y, me)) {
                    let pen = 0;
                    for (const o of state.cats) if (o.alive && o !== me && o.team === me.team && Math.hypot(o.x - x, o.y - 7 - y) < 40) pen += 150;
                    if (Math.hypot(me.x - x, me.y - 7 - y) < 48) pen += 250;
                    return Math.hypot(x - tx, y - ty) + pen;
                }
            }
            if (x < -50 || x > W + 50 || y > H) return 1e9;
        }
        return 1e9;
    }

    function solveRocket(c, dir, t, wind) {
        let best = { d: 1e9, a: 30, p: 60 };
        for (let a = -15; a <= 80; a += 2.5) for (let p = 20; p <= 100; p += 4) {
            const r = (a * Math.PI) / 180, spd = 2 + p * 0.08;
            const d = simRocket(c.x + dir * Math.cos(r) * 12, c.y - 8 - Math.sin(r) * 12, dir * Math.cos(r) * spd, -Math.sin(r) * spd, wind, t.x, t.y - 7, c);
            if (d < best.d) best = { d, a, p };
        }
        return best;
    }

    function botPlan(c) {
        const s = state, df = s.diff;
        const enemies = alive(0);
        const score = (t) => Math.abs(t.x - c.x) + (df === "easy" ? 0 : t.hp * (df === "medium" ? 1.2 : 2.5));
        const t = enemies.sort((a, b) => score(a) - score(b))[0];
        bot.t = t;
        const dx = t.x - c.x, ad = Math.abs(dx);
        let gx = c.x;
        if (ad > 380) gx = c.x + Math.sign(dx) * (ad - 340); // mendekat
        else if (df !== "easy" && ad > 60) { // cari tempat tinggi
            let by = surfY(c.x), bx = c.x;
            for (let x = c.x - 90; x <= c.x + 90; x += 6) {
                if (x < 20 || x > W - 20) continue;
                const y = surfY(x); if (y < by - 10) { by = y; bx = x; }
            }
            gx = bx;
        }
        bot.gx = clamp(gx, 16, W - 16); bot.st = "move"; bot.mv = 0; bot.lx = c.x; bot.lt = 0;
    }

    function botSolve(c) {
        const s = state;
        const t = bot.t && bot.t.alive ? bot.t : alive(0)[0];
        if (!t) { bot.shot = { w: 0, aim: 30, pow: 50, dir: c.dir }; return; }
        const dx = t.x - c.x, dy = c.y - 8 - (t.y - 7), ad = Math.abs(dx), dir = dx >= 0 ? 1 : -1;
        const E = { easy: [10, 18], medium: [4, 7], hard: [1.2, 2] }[s.diff];
        const rnd = () => Math.random() * 2 - 1, has = (w) => s.ammo[1][w] !== 0;
        let sh = null;
        if (ad < 22 && Math.abs(dy) < 16) sh = { w: 5, aim: 0, pow: 1 };
        else if (ad < 48 && s.diff !== "easy" && has(3) && Math.random() < 0.7) sh = { w: 3, aim: 0, pow: 1 };
        else if (ad < 240 && has(2) && Math.random() < 0.45) sh = { w: 2, aim: clamp((Math.atan2(dy, ad) * 180) / Math.PI + rnd() * E[0], -60, 85), pow: 1 };
        else if (ad > 220 && has(4) && s.diff !== "easy" && Math.random() < 0.4) sh = { w: 4, aim: 0, pow: 1, ax: clamp(t.x + rnd() * E[0] * 8, 10, W - 10) };
        if (!sh) {
            const b = solveRocket(c, dir, t, s.wind);
            sh = { w: 0, aim: clamp(b.a + rnd() * E[0], -60, 85), pow: clamp(b.p * (1 + (rnd() * E[1]) / 100), 10, 100) };
        }
        sh.dir = dir; bot.shot = sh;
    }

    function botStep() {
        const s = state;
        if (s.mode !== "ai" || s.turnTeam !== 1) return;
        const c = s.cats[s.cur];
        if (!c || !c.alive) return;
        const k = (s.keys[1] = { l: 0, r: 0, u: 0, d: 0 });
        if (s.phase === "resolve") { if (s.retreat > 0 && bot.flee) (bot.flee > 0 ? (k.r = 1) : (k.l = 1)); return; }
        if (s.phase !== "aim") return;
        if (s.timer < 1.5 && bot.st !== "shoot") { botSolve(c); bot.st = "shoot"; }
        if (bot.st === "wait") { bot.w -= DT; if (bot.w <= 0) botPlan(c); return; }
        if (bot.st === "move") {
            const dx = bot.gx - c.x; bot.mv += DT;
            if (Math.abs(dx) < 5 || bot.mv > 7) { botSolve(c); bot.st = "shoot"; return; }
            dx > 0 ? (k.r = 1) : (k.l = 1);
            bot.lt += DT;
            if (bot.lt > 0.5) { if (Math.abs(c.x - bot.lx) < 3) applyAction({ type: "jump" }, 1); bot.lx = c.x; bot.lt = 0; }
            return;
        }
        if (bot.st === "shoot") {
            const sh = bot.shot;
            c.dir = sh.dir; s.weapon = sh.w; if (sh.w === 4) s.airX = sh.ax;
            const da = sh.aim - s.aim;
            if (Math.abs(da) > 1.2) { s.aim += Math.sign(da) * Math.min(Math.abs(da), 70 * DT); return; }
            s.aim = sh.aim;
            if (!s.charging) { applyAction({ type: "charge" }, 1); return; }
            if (s.power >= sh.pow) { if (sh.w === 3) bot.flee = -sh.dir; applyAction({ type: "release" }, 1); bot.st = "done"; }
        }
    }

    // ---------------------------------------------------------------- main step
    function control(c) {
        const s = state, k = keysFor(s.turnTeam) || {};
        if (s.phase === "aim") {
            if (!s.charging) {
                if (s.weapon === 4) { if (k.l) s.airX = clamp(s.airX - 4, 10, W - 10); if (k.r) s.airX = clamp(s.airX + 4, 10, W - 10); }
                else if (k.l) walk(c, -1); else if (k.r) walk(c, 1);
            }
            if (k.u) s.aim = clamp(s.aim + 60 * DT, -60, 85);
            if (k.d) s.aim = clamp(s.aim - 60 * DT, -60, 85);
        } else if (s.phase === "resolve" && s.retreat > 0) {
            if (k.l) walk(c, -1); else if (k.r) walk(c, 1);
        }
    }

    function motion() { // dipakai tamu: hanya gerakan, tanpa logika game
        const s = state;
        for (const p of s.projs) { p.x += p.vx; p.y += p.vy; p.vy += p.k === "m" ? 0.05 : 0.12; }
        if (s.phase === "aim") s.timer = Math.max(0, s.timer - DT);
        if (s.charging) s.power = Math.min(100, s.power + 70 * DT);
    }

    function step() {
        const s = state;
        if (!s) return;
        if (s.bannerT > 0) s.bannerT -= DT;
        s.cats.forEach(stepCat);
        stepCrates();
        if (!sim) { motion(); return; }
        stepProjs();
        if (s.phase === "over") return;
        const c = s.cats[s.cur];
        botStep();
        if (c && c.alive) control(c);
        if (s.charging) { s.power = Math.min(100, s.power + 70 * DT); if (s.power >= 100) fire(); }
        if (s.phase === "aim") {
            if (!cheats.freeze) s.timer -= DT;
            if (s.timer <= 0 || !c || !c.alive) { s.timer = 0; s.charging = false; s.power = 0; s.phase = "resolve"; s.settle = 0; }
        } else if (s.phase === "resolve") {
            if (s.retreat > 0) s.retreat -= DT;
            const busy = s.projs.length > 0 || s.cats.some((t) => t.alive && (!t.g || Math.abs(t.vx) > 0.1)) || s.crates.some((cr) => cr.vy > 0);
            if (!busy && s.retreat <= 0) { s.settle += DT; if (s.settle > 0.8) endTurn(); } else s.settle = 0;
        }
    }

    // ---------------------------------------------------------------- effects + drawing
    let parts = [], rings = [], traces = [], lastEv = 0;
    function processEvents() {
        for (const e of state.evts) {
            if (e.n <= lastEv) continue;
            lastEv = e.n;
            const cols = e.s === "splash" ? ["#38bdf8", "#bae6fd"] : e.s === "hit" ? ["#ef4444", "#fca5a5"] : ["#fb923c", "#64748b"];
            const cnt = e.s === "boom" ? 12 + e.r / 2 : e.s === "pick" || e.s === "shot" || e.s === "tr" ? 0 : 8;
            for (let i = 0; i < cnt; i++) parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.9) * 6, l: 1, c: cols[i % 2], z: 2 + Math.random() * 3 });
            if (e.s === "boom") rings.push({ x: e.x, y: e.y, r: e.r, l: 1 });
            if (e.s === "tr") traces.push({ x: e.x, y: e.y, x2: e.x2, y2: e.y2, l: 1 });
            sfx(e.s === "tr" ? "shot" : e.s);
        }
    }

    function drawCat(g, c, isCur, T) {
        const col = TEAMS[c.team].c;
        g.save(); g.translate(c.x, c.y);
        g.fillStyle = col;
        g.beginPath(); g.ellipse(0, -7, 6.5, 7, 0, 0, 7); g.fill();
        g.beginPath(); g.moveTo(-6, -11); g.lineTo(-5, -18); g.lineTo(-1, -13); g.fill();
        g.beginPath(); g.moveTo(6, -11); g.lineTo(5, -18); g.lineTo(1, -13); g.fill();
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(-c.dir * 6, -3); g.quadraticCurveTo(-c.dir * 13, -6, -c.dir * 11, -13); g.stroke();
        g.fillStyle = "#fff";
        for (const ex of [-2.4, 2.4]) { g.beginPath(); g.arc(c.dir * 1.5 + ex, -9, 1.9, 0, 7); g.fill(); }
        g.fillStyle = "#0f172a";
        for (const ex of [-2.4, 2.4]) { g.beginPath(); g.arc(c.dir * 2.2 + ex, -9, 0.9, 0, 7); g.fill(); }
        g.restore();
        g.font = "600 11px system-ui,sans-serif"; g.textAlign = "center";
        const label = isCur ? `${c.name} ${c.hp}` : `${c.hp}`, tw = g.measureText(label).width + 8;
        g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(c.x - tw / 2, c.y - 34, tw, 14);
        g.fillStyle = col; g.fillText(label, c.x, c.y - 23);
        if (isCur && state.phase === "aim") {
            const by = Math.sin(T * 6) * 2;
            g.fillStyle = "#0f172a"; g.beginPath(); g.moveTo(c.x - 5, c.y - 46 + by); g.lineTo(c.x + 5, c.y - 46 + by); g.lineTo(c.x, c.y - 39 + by); g.fill();
        }
    }

    function drawFrame() {
        const g = ctx, s = state, T = performance.now() / 1000;
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#f8fafc"); gr.addColorStop(1, "#dbeafe");
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.drawImage(tc, 0, 0);
        const water = () => {
            g.fillStyle = "rgba(56,189,248,.45)"; g.beginPath(); g.moveTo(0, H);
            for (let x = 0; x <= W; x += 16) g.lineTo(x, WL + Math.sin(x * 0.03 + T * 2) * 2.5);
            g.lineTo(W, H); g.fill();
        };
        if (!s) { water(); return; }
        processEvents();
        for (const cr of s.crates) {
            g.fillStyle = cr.k === "h" ? "#22c55e" : "#a16207"; g.fillRect(cr.x - 6, cr.y - 6, 12, 12);
            g.fillStyle = "#fff";
            if (cr.k === "h") { g.fillRect(cr.x - 1.5, cr.y - 4, 3, 8); g.fillRect(cr.x - 4, cr.y - 1.5, 8, 3); } else { g.beginPath(); g.arc(cr.x, cr.y, 2.5, 0, 7); g.fill(); }
        }
        s.cats.forEach((c, i) => c.alive && drawCat(g, c, i === s.cur && s.phase !== "over", T));
        for (const p of s.projs) {
            if (p.k === "r") { g.fillStyle = "#0f172a"; g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill(); g.strokeStyle = "#f97316"; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); g.stroke(); }
            else if (p.k === "m") { g.fillStyle = "#ef4444"; g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill(); }
            else {
                g.fillStyle = p.k === "g" ? "#334155" : "#dc2626";
                if (p.k === "g") { g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill(); } else g.fillRect(p.x - 2, p.y - 6, 4, 10);
                g.fillStyle = "#0f172a"; g.font = "700 10px system-ui"; g.textAlign = "center"; g.fillText(Math.max(0, Math.ceil(p.t)), p.x, p.y - 10);
            }
        }
        water();
        // aim UI
        const c = s.cats[s.cur];
        if (c && c.alive && s.phase === "aim") {
            if (s.weapon === 4) {
                g.strokeStyle = "#ef4444"; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(s.airX, 0); g.lineTo(s.airX, surfY(s.airX)); g.stroke(); g.setLineDash([]);
                g.fillStyle = "#ef4444"; g.beginPath(); g.moveTo(s.airX - 6, 0); g.lineTo(s.airX + 6, 0); g.lineTo(s.airX, 9); g.fill();
            } else if (s.weapon !== 5) {
                const a = (s.aim * Math.PI) / 180, dx = c.dir * Math.cos(a), dy = -Math.sin(a);
                if (s.charging) { g.strokeStyle = TEAMS[c.team].c; g.lineWidth = 3; g.beginPath(); g.moveTo(c.x + dx * 16, c.y - 8 + dy * 16); g.lineTo(c.x + dx * (16 + s.power * 0.5), c.y - 8 + dy * (16 + s.power * 0.5)); g.stroke(); }
                const rx = c.x + dx * 38, ry = c.y - 8 + dy * 38;
                g.strokeStyle = "#0f172a"; g.lineWidth = 1.5; g.beginPath(); g.arc(rx, ry, 4, 0, 7); g.moveTo(rx - 7, ry); g.lineTo(rx + 7, ry); g.moveTo(rx, ry - 7); g.lineTo(rx, ry + 7); g.stroke();
            }
        }
        for (const t of traces) { g.strokeStyle = `rgba(15,23,42,${t.l})`; g.lineWidth = 1; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x2, t.y2); g.stroke(); t.l -= 0.08; }
        traces = traces.filter((t) => t.l > 0);
        for (const r of rings) { g.strokeStyle = `rgba(249,115,22,${r.l})`; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, r.r * (1.4 - r.l * 0.4), 0, 7); g.stroke(); r.l -= 0.06; }
        rings = rings.filter((r) => r.l > 0);
        for (const p of parts) { g.globalAlpha = Math.max(0, p.l); g.fillStyle = p.c; g.fillRect(p.x, p.y, p.z, p.z); p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.l -= 0.025; }
        g.globalAlpha = 1; parts = parts.filter((p) => p.l > 0);
        // HUD
        g.font = "600 12px system-ui,sans-serif";
        for (const t of [0, 1]) {
            const hp = s.cats.filter((k) => k.team === t).reduce((a, k) => a + k.hp, 0), max = s.cfg.cats * 100, x = t === 0 ? 14 : W - 174;
            g.textAlign = "left"; g.fillStyle = "#475569";
            const me = s.mode === "room" ? (t === myTeam() ? " (kamu)" : "") : s.mode === "ai" ? (t === 0 ? " (kamu)" : " (bot)") : "";
            g.fillText(`${TEAMS[t].n}${me} · ${alive(t).length}`, x, 20);
            g.fillStyle = "#e2e8f0"; g.fillRect(x, 26, 160, 7); g.fillStyle = TEAMS[t].c; g.fillRect(x, 26, (160 * hp) / max, 7);
            if (t === s.turnTeam && s.phase !== "over") { g.fillStyle = "#0f172a"; g.fillRect(x, 36, 160, 2); }
        }
        g.textAlign = "center"; g.fillStyle = "#0f172a"; g.font = "700 26px system-ui,sans-serif";
        g.fillText(s.phase === "aim" ? Math.ceil(s.timer) : "·", W / 2, 34);
        g.font = "600 11px system-ui,sans-serif"; g.fillStyle = "#64748b"; g.fillText("angin", W / 2, 52);
        g.strokeStyle = "#0f172a"; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, 60); g.lineTo(W / 2 + s.wind * 6, 60); g.stroke();
        if (s.wind) { const d = Math.sign(s.wind); g.fillStyle = "#0f172a"; g.beginPath(); g.moveTo(W / 2 + s.wind * 6, 60); g.lineTo(W / 2 + s.wind * 6 - d * 6, 56); g.lineTo(W / 2 + s.wind * 6 - d * 6, 64); g.fill(); }
        if (s.charging) { g.fillStyle = "#e2e8f0"; g.fillRect(W / 2 - 60, 70, 120, 6); g.fillStyle = "#f97316"; g.fillRect(W / 2 - 60, 70, 1.2 * s.power, 6); }
        if (s.bannerT > 0) { g.globalAlpha = Math.min(1, s.bannerT); g.font = "700 20px system-ui,sans-serif"; g.fillStyle = "#0f172a"; g.fillText(s.banner, W / 2, 120); g.globalAlpha = 1; }
    }

    // ---------------------------------------------------------------- DOM render
    let wbSig = "";
    function render() {
        const s = state;
        const show = (n, v) => { const el = $(`[data-ov="${n}"]`); if (el) el.hidden = !v; };
        show("setup", ui.setup && isHost && !ui.help);
        show("wait", !isHost && !s && !ui.help);
        show("over", !!s && s.phase === "over" && !ui.help);
        show("help", ui.help);
        show("cheat", ui.cheat && !online);
        $$("[data-set]").forEach((b) => { const [k, v] = b.dataset.set.split(":"); b.classList.toggle("on", String(setup[k]) === v); });
        $$("[data-local]").forEach((el) => (el.hidden = online));
        $$("[data-aionly]").forEach((el) => (el.hidden = online || setup.mode !== "ai"));
        const seedEl = $("[data-seed]"); if (seedEl) seedEl.textContent = `#${setup.seed}`;
        const wins = $("[data-wins]");
        if (wins) { let n = 0; try { n = +localStorage.getItem(META.bestKey) || 0; } catch (_) { } wins.textContent = n ? `Kemenangan vs Bot: ${n}` : ""; }
        $$("[data-ch]").forEach((b) => { const k = b.dataset.ch; if (k in cheats) b.classList.toggle("on", k === "god" ? cheats.god >= 0 : !!cheats[k]); });
        $("[data-padtoggle]").classList.toggle("on", ui.pad);
        $("[data-pad]").classList.toggle("on", ui.pad);
        $("[data-mute]").classList.toggle("on", ui.muted);
        const ct = $("[data-cheat]"); if (ct) ct.classList.toggle("on", ui.cheat);
        if (s && s.phase === "over") {
            const w = s.winner;
            let title = "Seri", sub = "Semua kucing tumbang.";
            if (w >= 0) {
                title = s.mode === "room" ? (w === myTeam() ? "Kamu menang! 🎉" : "Kamu kalah") : s.mode === "ai" ? (w === 0 ? "Kamu menang! 🎉" : "Bot menang") : `Tim ${TEAMS[w].n} menang!`;
                sub = `Tim ${TEAMS[w].n} bertahan sampai akhir.`;
            }
            $("[data-overtitle]").textContent = title; $("[data-oversub]").textContent = sub;
            $("[data-again]").hidden = !isHost;
            if (!isHost) $("[data-oversub]").textContent += " Menunggu host memulai ulang.";
        }
        // status
        let st = !s ? (isHost ? "Atur permainan lalu mulai" : "Menunggu host…") : "Selesai";
        if (s && s.phase !== "over") {
            const c = s.cats[s.cur], mine = online ? s.turnTeam === myTeam() : false;
            st = `Tim ${TEAMS[s.turnTeam].n} · ${c ? c.name : ""}${mine ? " (giliranmu)" : ""}${online ? ` · kamu Tim ${TEAMS[myTeam()].n}` : ""}`;
        }
        statusEl.textContent = st;
        // weapon bar
        const t = s ? s.turnTeam : 0, can = canAct();
        const sig = s ? `${t}|${s.weapon}|${s.ammo[t].join(",")}|${can}|${cheats.inf}` : "";
        if (sig !== wbSig) {
            wbSig = sig;
            $("[data-wb]").innerHTML = s ? WEAPONS.map((w, i) => {
                const a = s.ammo[t][i];
                return `<button class="cw-btn${i === s.weapon ? " on" : ""}" data-w="${i}" type="button"${a === 0 || !can ? " disabled" : ""}>${w.i} ${w.n}${a >= 0 ? ` ×${a}` : ""}</button>`;
            }).join("") : "";
        }
    }

    // ---------------------------------------------------------------- sync / publish
    let lastPub = 0;
    function publish(force) {
        if (online && isHost && state) {
            const n = performance.now();
            if (force || n - lastPub > 110) { lastPub = n; room.publishState(state).catch(console.warn); }
        }
    }

    // ---------------------------------------------------------------- input
    const toGame = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height }; };
    let mouse = { x: W / 2, y: H / 2 }, lastAimSend = 0, lastAimVal = 999, mouseCharging = false;

    function syncKeys() {
        if (online && !isHost) {
            const sig = `${kd.l}${kd.r}${kd.u}${kd.d}`;
            if (sig !== syncKeys.last) { syncKeys.last = sig; room.sendAction({ type: "keys", l: kd.l, r: kd.r, u: kd.u, d: kd.d }).catch(console.warn); }
        }
    }
    const cycle = (d) => {
        if (!state) return;
        let w = state.weapon;
        for (let i = 0; i < WEAPONS.length; i++) { w = (w + d + WEAPONS.length) % WEAPONS.length; if (state.ammo[state.turnTeam][w] !== 0) break; }
        act({ type: "weapon", w });
    };

    function onKey(e, down) {
        if (e.target && e.target.closest && e.target.closest("input,textarea")) return;
        const k = e.key; let used = true;
        switch (k) {
            case "ArrowLeft": case "a": case "A": kd.l = down ? 1 : 0; break;
            case "ArrowRight": case "d": case "D": kd.r = down ? 1 : 0; break;
            case "ArrowUp": case "w": case "W": kd.u = down ? 1 : 0; break;
            case "ArrowDown": case "s": case "S": kd.d = down ? 1 : 0; break;
            case "Enter": if (down && !e.repeat) act({ type: "jump" }); break;
            case " ": if (down) { if (!e.repeat) act({ type: "charge" }); } else act({ type: "release" }); break;
            case "1": case "2": case "3": case "4": case "5": case "6": if (down) act({ type: "weapon", w: +k - 1 }); break;
            case "q": case "Q": if (down) cycle(-1); break;
            case "e": case "E": if (down) cycle(1); break;
            case "h": case "H": if (down) { ui.help = !ui.help; render(); } break;
            default: used = false;
        }
        if (used && state && !ui.help) e.preventDefault();
        syncKeys();
    }
    const kdown = (e) => onKey(e, true), kup = (e) => onKey(e, false);
    const blur = () => { kd.l = kd.r = kd.u = kd.d = 0; syncKeys(); if (mouseCharging) { mouseCharging = false; act({ type: "release" }); } };
    const winUp = () => { if (mouseCharging) { mouseCharging = false; act({ type: "release" }); } };
    document.addEventListener("keydown", kdown);
    document.addEventListener("keyup", kup);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerup", winUp);

    cv.addEventListener("pointermove", (e) => {
        mouse = toGame(e);
        if (e.pointerType !== "mouse" || !state || !canAct() || state.phase !== "aim" || state.weapon === 4 || state.weapon === 5) return;
        const c = state.cats[state.cur]; if (!c) return;
        const dx = mouse.x - c.x, dy = c.y - 8 - mouse.y, a = clamp((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI, -60, 85);
        const now = performance.now();
        if (Math.abs(a - lastAimVal) > 0.8 && now - lastAimSend > 60) { lastAimVal = a; lastAimSend = now; act({ type: "aim", dir: dx >= 0 ? 1 : -1, a }); }
    });
    cv.addEventListener("pointerdown", (e) => {
        mouse = toGame(e);
        if (!state) return;
        if (cheats.tp && !online) {
            const c = state.cats[state.cur];
            if (c) { c.x = clamp(mouse.x, 10, W - 10); c.y = solid(mouse.x, mouse.y) ? surfY(mouse.x) : mouse.y; c.vx = c.vy = 0; c.g = false; }
            cheats.tp = false; render(); return;
        }
        if (!canAct()) return;
        if (state.weapon === 4) { act({ type: "airx", x: mouse.x }); return; }
        mouseCharging = true; act({ type: "charge" });
    });
    cv.addEventListener("wheel", (e) => { if (!state) return; e.preventDefault(); cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });

    // tombol layar (mobile)
    $$("[data-hold]").forEach((b) => {
        const key = b.dataset.hold;
        const set = (v) => { kd[key] = v; syncKeys(); };
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(1); });
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => b.addEventListener(ev, () => set(0)));
    });
    $("[data-jump]").addEventListener("pointerdown", (e) => { e.preventDefault(); act({ type: "jump" }); });
    const fireBtn = $("[data-fire]");
    fireBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); fireBtn.setPointerCapture?.(e.pointerId); act({ type: "charge" }); });
    ["pointerup", "pointercancel"].forEach((ev) => fireBtn.addEventListener(ev, () => act({ type: "release" })));

    function cheatAction(k) {
        const s = state, ct = s ? (s.mode === "ai" ? 0 : s.turnTeam) : 0;
        if (k in cheats && typeof cheats[k] === "boolean") { cheats[k] = !cheats[k]; if (k === "noWind" && cheats.noWind && s) s.wind = 0; }
        else if (k === "god") cheats.god = cheats.god >= 0 ? -1 : ct;
        else if (!s) return;
        else if (k === "heal") s.cats.forEach((c) => { if (c.team === ct && c.alive) c.hp = 100; });
        else if (k === "ammo") s.ammo[ct] = s.ammo[ct].map((a) => (a < 0 ? a : 9));
        else if (k === "crates") for (let i = 0; i < 3; i++) spawnCrate();
        else if (k === "skip") { if (s.phase === "aim") { s.charging = false; s.phase = "resolve"; s.settle = 0; } }
        else if (k === "kill") { s.cats.forEach((c) => { if (c.team !== ct && c.alive) { c.hp = 0; c.alive = false; pushEvt(c.x, c.y - 7, 16, "boom"); } }); if (s.phase === "aim") { s.phase = "resolve"; s.settle = 0; } }
        if (k === "god") cheats.god = cheats.god >= 0 ? cheats.god : -1;
        render();
    }

    function handleClick(event) {
        const b = event.target.closest("button");
        if (!b) return;
        if (b.matches("[data-exit]")) { onExit(); return; }
        if (b.dataset.set) { const [k, v] = b.dataset.set.split(":"); setup[k] = /^\d+$/.test(v) ? +v : v; render(); return; }
        if (b.matches("[data-newmap]")) { setup.seed = rndSeed(); buildTerrain(setup.seed); render(); return; }
        if (b.matches("[data-start]")) { startGame(); return; }
        if (b.matches("[data-again]")) { if (isHost) { setup.seed = rndSeed(); startGame(); } return; }
        if (b.matches("[data-help]")) { ui.help = !ui.help; if (!ui.help) { try { localStorage.setItem("catsWarsHelp", "1"); } catch (_) { } } render(); return; }
        if (b.matches("[data-cheat]")) { ui.cheat = !ui.cheat; render(); return; }
        if (b.matches("[data-padtoggle]")) { ui.pad = !ui.pad; render(); return; }
        if (b.matches("[data-mute]")) { ui.muted = !ui.muted; render(); return; }
        if (b.dataset.ch) { cheatAction(b.dataset.ch); return; }
        if (b.dataset.w !== undefined) { act({ type: "weapon", w: +b.dataset.w }); wbSig = ""; render(); }
    }
    root.addEventListener("click", handleClick);

    // ---------------------------------------------------------------- loop + online wiring
    let raf = 0, last = performance.now(), acc = 0, frame = 0, lastTurnSeen = -1;
    function loop(now) {
        raf = requestAnimationFrame(loop);
        acc += Math.min(0.1, (now - last) / 1000); last = now;
        while (acc >= DT) { step(); acc -= DT; }
        if (state && !sim && state.turnTeam !== lastTurnSeen) { lastTurnSeen = state.turnTeam; syncKeys.last = ""; syncKeys(); }
        drawFrame();
        publish(false);
        if (++frame % 6 === 0) { if (state && state.phase !== "over" && state.phase !== "setup") wbSig = wbSig; render(); }
    }

    if (online) {
        room.onRoom((nextRoom) => { roomData = nextRoom; render(); });
        if (isHost) room.onAction((action) => applyAction(action, 1));
        else {
            room.onState((next) => {
                if (!next) return;
                state = normalize(next);
                ui.setup = false;
                syncCraters();
                render();
            });
        }
    }
    if (isHost) buildTerrain(setup.seed);
    render();
    raf = requestAnimationFrame(loop);

    return {
        destroy() {
            cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", kdown);
            document.removeEventListener("keyup", kup);
            window.removeEventListener("blur", blur);
            window.removeEventListener("pointerup", winUp);
            try { ac && ac.close(); } catch (_) { }
        },
    };
}