/* ==== GAME: star-catcher.js ==== */
/*
  Star Catcher — template baru (META + mount).
  - Solo: level acak yang dijamin bisa diselesaikan, kejar target bintang.
  - VS Bot / Room: race, coin toss menentukan siapa jalan duluan,
    kursi pemain (ship mana yang kamu kendalikan) diacak tiap race.
  - Cheats hanya offline; skor best tidak disimpan saat cheat dipakai.
  Jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "star-catcher", // harus sama dengan nama file (tanpa .js)
    name: "Star Catcher",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Fly the rocket, catch twinkling stars and dodge asteroids. Random solvable levels, solo or race.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 36l10-8"/><path d="M14 40l8-9"/><circle cx="34" cy="14" r="3" fill="currentColor" stroke="none"/><path d="M34 5l2.4 6.6L43 14l-6.6 2.4L34 23l-2.4-6.6L25 14l6.6-2.4z" fill="currentColor" stroke="none"/><path d="M22 34l14-16 6 5-14 16-7 3z" fill="currentColor" stroke="none"/><circle cx="16" cy="40" r="2" fill="currentColor" stroke="none"/><circle cx="41" cy="34" r="2" fill="currentColor" stroke="none"/></svg>',
    bg: ["#c7d2fe", "#818cf8"],
    bestKey: "starCatcherBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ================= konstanta & util ================= */
    const W = 800, H = 520;
    const HEALTH = 3, MAX_SPEED = 340, ACCEL = 430;
    const ROCKET_R = 15, STAR_R = 26;
    const TURN = 12;            // rad/dtk — kecepatan belok hidung roket
    const STAGGER = 1200;       // ms head start pemenang coin toss
    const PUB_MS = 120;         // throttle publish state host
    const AIM_MS = 80;          // throttle kirim aim guest
    const DIRS = ["up", "down", "left", "right"];
    const KEYMAP = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
    };

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hitTest(ax, ay, ar, bx, by, br) {
        const dx = ax - bx, dy = ay - by, rr = ar + br;
        return dx * dx + dy * dy < rr * rr;
    }

    /* ================= generator level acak (dijamin solvable) =================
       Batas keamanan: asteroid tercepat <= 85% kecepatan roket, interval spawn
       >= 500ms, jumlah asteroid hidup <= 14, waktu >= 3.2s per bintang + buffer.
       Jika sebuah kandidat gagal predikat, kesulitan direlaksasi lalu diuji lagi. */
    function levelSolvable(c) {
        return (
            c.timeMs >= c.target * 3200 + 6000 &&
            260 * c.speedMul <= MAX_SPEED * 0.85 &&
            c.spawnFloor >= 500 &&
            c.maxAsts <= 14 &&
            c.target <= 20
        );
    }

    function makeLevel(level, seed) {
        const r = rng(seed);
        let c = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            const target = 8 + Math.min(10, level + Math.floor(r() * 3));
            c = {
                target,
                timeMs: Math.round((target * (3400 + r() * 900) + 9000) / 1000) * 1000,
                spawnStart: 1500 - Math.min(500, (level - 1) * 60) + r() * 250,
                spawnFloor: Math.max(520, 900 - level * 45 - r() * 120),
                ramp: 10 + Math.min(14, level * 1.5) + r() * 6,
                speedMul: 1 + Math.min(0.1, (level - 1) * 0.015 + r() * 0.03),
                maxAsts: Math.min(14, 6 + Math.ceil(level * 0.8) + Math.floor(r() * 3)),
            };
            if (levelSolvable(c)) return c;
            c.speedMul *= 0.95; c.spawnFloor += 40; c.maxAsts -= 1; c.timeMs += 4000;
        }
        return c;
    }

    function spawnInterval(cfg, elapsedMs) {
        return Math.max(cfg.spawnFloor, cfg.spawnStart - Math.floor(elapsedMs / 1000) * cfg.ramp);
    }

    /* ================= spawn bintang & asteroid ================= */
    function spawnStar(rnd, w, h, avoid) {
        let best = null, bestD = -1;
        for (let i = 0; i < 60; i++) {
            const x = 50 + rnd() * (w - 100);
            const y = 50 + rnd() * (h - 100);
            let d = Infinity;
            for (const a of avoid || []) d = Math.min(d, Math.hypot(a.x - x, a.y - y));
            if (d > bestD) { bestD = d; best = { x, y }; }
            if (d >= 130) return { x, y };
        }
        return best || { x: w / 2, y: h / 2 }; // tidak mungkin (0,0)
    }

    /* 4 variasi asteroid: rock, ice (berkelok), iron (besar/lambat), comet (cepat berekor) */
    function spawnAsteroid(rnd, w, h, cfg) {
        const roll = rnd();
        const kind = roll < 0.44 ? "rock" : roll < 0.68 ? "ice" : roll < 0.88 ? "iron" : "comet";
        let r, sp, verts, nCr;
        if (kind === "rock") { r = 10 + rnd() * 8; sp = 70 + rnd() * 80; verts = 7 + Math.floor(rnd() * 3); nCr = 1 + Math.floor(rnd() * 2); }
        else if (kind === "ice") { r = 7 + rnd() * 5; sp = 130 + rnd() * 80; verts = 6; nCr = 0; }
        else if (kind === "iron") { r = 16 + rnd() * 8; sp = 45 + rnd() * 50; verts = 8 + Math.floor(rnd() * 3); nCr = 2 + Math.floor(rnd() * 2); }
        else { r = 6 + rnd() * 4; sp = 180 + rnd() * 80; verts = 0; nCr = 0; }
        sp *= cfg.speedMul;

        const side = Math.floor(rnd() * 4);
        let x, y;
        if (side === 0) { x = rnd() * w; y = -24; }
        else if (side === 1) { x = w + 24; y = rnd() * h; }
        else if (side === 2) { x = rnd() * w; y = h + 24; }
        else { x = -24; y = rnd() * h; }
        const tx = w * (0.2 + 0.6 * rnd()), ty = h * (0.2 + 0.6 * rnd());
        const d = Math.hypot(tx - x, ty - y) || 1;
        const vx = ((tx - x) / d) * sp, vy = ((ty - y) / d) * sp;

        const pts = [];
        for (let i = 0; i < verts; i++) {
            const ang = (i / verts) * Math.PI * 2;
            let f;
            if (kind === "ice") f = (i % 2 ? 0.55 : 1.0) + rnd() * 0.1;
            else if (kind === "iron") f = 0.82 + 0.22 * rnd();
            else f = 0.72 + 0.34 * rnd();
            pts.push([+(Math.cos(ang) * r * f).toFixed(1), +(Math.sin(ang) * r * f).toFixed(1)]);
        }
        const craters = [];
        for (let i = 0; i < nCr; i++) {
            craters.push({
                cx: +((rnd() - 0.5) * r * 0.9).toFixed(1),
                cy: +((rnd() - 0.5) * r * 0.9).toFixed(1),
                cr: +(r * (0.12 + rnd() * 0.14)).toFixed(1),
            });
        }
        return {
            kind, x, y, vx, vy, r, pts, craters,
            rot: kind === "comet" ? Math.atan2(vy, vx) * 180 / Math.PI : rnd() * 360,
            spin: kind === "comet" ? 0 : (rnd() - 0.5) * (kind === "iron" ? 80 : 160),
            wa: kind === "ice" ? 30 + rnd() * 30 : 0,   // amplitudo kelok (px/dtk)
            wf: kind === "ice" ? 1.5 + rnd() * 1.5 : 0, // frekuensi
            wp: rnd() * Math.PI * 2,                    // fase
        };
    }

    /* ================= state ================= */
    function freshShip(x, y) {
        return {
            x, y, vx: 0, vy: 0, ang: -Math.PI / 2, tAng: -Math.PI / 2,
            hp: HEALTH, stars: 0, alive: true, unlockAt: 0, inv: 0,
            held: { up: false, down: false, left: false, right: false }, aim: null,
            jt: 0, ja: 0, // jitter bot
        };
    }
    const baseShips = (m) => m === "solo" ? [freshShip(W / 2, H / 2)] : [freshShip(W * 0.28, H / 2), freshShip(W * 0.72, H / 2)];

    function newStar(st, skipId) {
        const avoid = [];
        st.ships.forEach((s) => { if (s.alive) avoid.push({ x: s.x, y: s.y }); });
        st.stars.forEach((s) => { if (s.id !== skipId) avoid.push(s); });
        st.asts.forEach((a) => avoid.push(a));
        const p = spawnStar(Math.random, W, H, avoid);
        return { id: st.nextId++, x: p.x, y: p.y };
    }

    function idleState() {
        const m = online ? "online" : "solo";
        const st = {
            phase: "idle", mode: m, race: false, level: 1, raceRound: 0,
            seed: 20261121, cfg: makeLevel(1, 20261121),
            gt: 0, countT: 0, nextSpawn: 0, nextId: 1,
            slots: online ? [0, 1] : [0], first: 0,
            ships: baseShips(m), stars: [], asts: [],
            result: null, score: 0, cheated: false, paused: false,
            cheats: { god: false, slow: false, magnet: false, freeze: false },
        };
        st.stars = [newStar(st, -1), newStar(st, -1)];
        return st;
    }

    const myIdx = () => (state && state.slots.indexOf(playerIndex) >= 0 ? state.slots.indexOf(playerIndex) : 0);
    const myShip = () => state.ships[myIdx()];
    const firstIsMine = () => state.first === myIdx();
    const authority = () => !online || room.isHost;

    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { }
    function saveBest() {
        if (!state.cheated && state.score > best) {
            best = state.score;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }

    function startRun(m) {
        const st = idleState();
        st.mode = online ? "online" : (m === "bot" ? "bot" : "solo");
        st.ships = baseShips(st.mode);
        if (online) {
            st.raceRound = (state ? state.raceRound : 0) + 1;
            st.level = st.raceRound;
        }
        state = st;
        beginLevel();
    }

    function beginLevel() {
        const st = state;
        st.seed = (Math.random() * 0x7fffffff) | 0;
        st.cfg = makeLevel(st.level, st.seed);
        st.race = st.mode !== "solo";
        // ACAK kursi pemain (online) + ACAK siapa jalan duluan (race)
        st.slots = online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : st.mode === "bot" ? [0, 1] : [0];
        st.first = st.race ? (Math.random() < 0.5 ? 0 : 1) : 0;
        st.ships.forEach((s, i) => {
            s.hp = HEALTH; s.stars = 0; s.alive = true; s.vx = 0; s.vy = 0; s.inv = 0;
            s.aim = null; s.held = { up: false, down: false, left: false, right: false };
            s.ang = -Math.PI / 2; s.tAng = s.ang; s.unlockAt = 0;
            s.x = st.race ? (i === 0 ? W * 0.28 : W * 0.72) : W / 2;
            s.y = H / 2;
        });
        st.asts = []; st.stars = [];
        st.stars = [newStar(st, -1), newStar(st, -1)];
        st.gt = 0; st.countT = st.race ? 3200 : 1400;
        st.nextSpawn = st.cfg.spawnStart;
        st.result = null; st.phase = "count"; st.paused = false;
        viewCache.clear();
        publish();
        if (st.race) toast("You are Pilot " + (myIdx() + 1) + " · coin toss: " + (firstIsMine() ? "you" : "rival") + " first");
    }

    function finishSoloClear() {
        const st = state;
        const left = Math.max(0, st.cfg.timeMs - st.gt);
        const gained = st.cfg.target * 100 + myShip().hp * 75 + Math.ceil(left / 1000) * 10;
        st.score += gained;
        st.result = { gained, left: Math.ceil(left / 1000) };
        st.phase = "clear";
        saveBest();
        publish();
    }

    function finishOver(winner, reason) {
        state.phase = "over";
        state.result = { winner, reason };
        if (state.mode === "solo") saveBest();
        publish();
    }

    /* ================= shell (design minimalis) ================= */
    const chev = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';

    root.innerHTML = `
<style>
.sc-app{--line:#e6e8ef;--ink:#111827;--mut:#6b7280;--acc:#4f46e5;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink)}
.sc-app [hidden]{display:none!important}
.sc-app .sc-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.sc-app .sc-chip{display:inline-flex;align-items:baseline;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:#fff}
.sc-app .sc-chip small{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.sc-app .sc-chip b{font-size:14px;font-variant-numeric:tabular-nums}
.sc-app .sc-flex{flex:1}
.sc-app .sc-pips i{display:inline-block;width:9px;height:9px;border-radius:3px;background:#e5e7eb;margin-left:3px}
.sc-app .sc-pips i.on{background:var(--acc)}
.sc-app .sc-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer}
.sc-app .sc-btn:hover{background:#f5f6fa}
.sc-app .sc-btn.primary{background:var(--acc);border-color:transparent;color:#fff}
.sc-app .sc-btn.primary:hover{background:#4338ca}
.sc-app .sc-stage{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#0d1126;aspect-ratio:800/520;max-height:70vh}
.sc-app .sc-stage svg{display:block;width:100%;height:100%;touch-action:none}
.sc-app .sc-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(13,17,38,.55);backdrop-filter:blur(3px);padding:16px;overflow:auto}
.sc-app .sc-card{background:#fff;border:1px solid var(--line);border-radius:14px;max-width:520px;width:100%;padding:20px 22px;box-shadow:0 12px 40px rgba(15,23,42,.18)}
.sc-app .sc-card h3{margin:0 0 6px;font-size:18px}
.sc-app .sc-card h4{margin:14px 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.sc-app .sc-card p{margin:0 0 12px;color:var(--mut);font-size:13px;line-height:1.55}
.sc-app .sc-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.sc-app .sc-note{font-size:11.5px;color:#9ca3af;margin:10px 0 0}
.sc-app .sc-list{display:grid;gap:8px;margin:0 0 12px}
.sc-app .sc-switch{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;font-size:13px;color:var(--ink)}
.sc-app .sc-switch .pill{font-size:10px;letter-spacing:.06em;padding:3px 8px;border-radius:999px;background:#eef0f4;color:var(--mut)}
.sc-app .sc-switch[aria-pressed="true"]{border-color:var(--acc);background:#f5f6ff}
.sc-app .sc-switch[aria-pressed="true"] .pill{background:var(--acc);color:#fff}
.sc-app kbd{border:1px solid #d6d9e0;border-bottom-width:2px;border-radius:6px;padding:1px 6px;font-size:11px;background:#f8f9fb;font-family:ui-monospace,monospace}
.sc-app .sc-legend{display:grid;grid-template-columns:34px 1fr;gap:8px 10px;align-items:center;font-size:12.5px;color:#374151;margin:0 0 12px}
.sc-app .sc-count{position:absolute;inset:0;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;pointer-events:none;color:#fff;text-align:center}
.sc-app .sc-count b{font-size:56px;line-height:1;text-shadow:0 4px 24px rgba(0,0,0,.5)}
.sc-app .sc-count span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#c7d2fe}
.sc-app .sc-toast{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(17,24,39,.9);color:#fff;padding:7px 14px;border-radius:999px;font-size:12px;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.sc-app .sc-toast.show{opacity:1}
.sc-app .sc-pad{display:none;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,56px);gap:8px;justify-content:center;margin-top:12px}
.sc-app .sc-pad button{border:1px solid var(--line);background:#fff;border-radius:12px;color:var(--ink);touch-action:none;cursor:pointer;padding:14px}
.sc-app .sc-pad button:active{background:#eef2ff;border-color:var(--acc);color:var(--acc)}
.sc-app .sc-pad svg{width:100%;height:100%}
.sc-app .sc-hint{margin:10px 2px 0;font-size:11.5px;color:#9ca3af}
@media (pointer:coarse){.sc-app .sc-pad{display:grid}}
@media (max-width:720px){.sc-app .sc-pad{display:grid}}
@keyframes sc-tw{0%,100%{transform:scale(1)}50%{transform:scale(.72)}}
.sc-app .sc-star{transform-box:fill-box;transform-origin:center;animation:sc-tw 1.15s ease-in-out infinite}
</style>
<div class="game-app sc-app">
  <div class="game-intro">
    <div><h2>Star Catcher</h2><p>Fly the rocket, catch stars, dodge asteroids. Random solvable levels — solo, vs bot, or race a friend.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="sc-hud">
      <span class="sc-chip"><small>Level</small><b data-hud="level">1</b></span>
      <span class="sc-chip" data-chip="solo"><small>Stars</small><b><span data-hud="stars">0</span>/<span data-hud="target">10</span></b></span>
      <span class="sc-chip" data-chip="race" hidden><small>You</small><b data-hud="you">0</b><small>Rival</small><b data-hud="rival">0</b><small>to</small><b data-hud="rtarget">10</b></span>
      <span class="sc-chip"><small>Hull</small><span class="sc-pips" data-hud="pips"><i></i><i></i><i></i></span></span>
      <span class="sc-chip"><small>Time</small><b data-hud="time">0</b><small>s</small></span>
      <span class="sc-chip" data-chip="solo2"><small>Score</small><b data-hud="score">0</b></span>
      <span class="sc-chip" data-chip="best"><small>Best</small><b data-hud="best">0</b></span>
      <span class="sc-flex"></span>
      <button class="sc-btn" type="button" data-act="howto">How to play</button>
      <button class="sc-btn" type="button" data-act="cheats" data-only="offline">Cheats</button>
      <button class="sc-btn" type="button" data-act="pause" data-only="offline">Pause</button>
      <button class="sc-btn" type="button" data-act="restart" data-only="host">Restart</button>
    </div>
    <div class="sc-stage">
      <svg data-svg viewBox="0 0 800 520" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Star Catcher field">
        <g data-g="bg"></g><g data-g="stars"></g><g data-g="asts"></g><g data-g="ship"></g>
      </svg>
      <div class="sc-count" data-count hidden><b data-count-n>3</b><span data-count-t></span></div>
      <div class="sc-toast" data-toast></div>
      <div class="sc-ov" data-ov hidden></div>
    </div>
    <div class="sc-pad" data-pad aria-label="Touch controls">
      <span></span><button type="button" data-dir="up" aria-label="Up">${chev("M6 15l6-7 6 7")}</button><span></span>
      <button type="button" data-dir="left" aria-label="Left">${chev("M15 6l-7 6 7 6")}</button>
      <button type="button" data-dir="down" aria-label="Down">${chev("M6 9l6 7 6-7")}</button>
      <button type="button" data-dir="right" aria-label="Right">${chev("M9 6l7 6-7 6")}</button>
    </div>
    <p class="sc-hint">Desktop: <b>WASD / arrows</b>, or press &amp; drag on the field. Mobile: drag on the field or use the pad. <b>P</b> = pause, <b>Esc</b> = close panel.</p>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ================= refs ================= */
    const $ = (s) => root.querySelector(s);
    const svg = $("[data-svg]");
    const bgG = $('[data-g="bg"]'), starsG = $('[data-g="stars"]'), astsG = $('[data-g="asts"]'), shipG = $('[data-g="ship"]');
    const hud = {
        level: $('[data-hud="level"]'), stars: $('[data-hud="stars"]'), target: $('[data-hud="target"]'),
        you: $('[data-hud="you"]'), rival: $('[data-hud="rival"]'), rtarget: $('[data-hud="rtarget"]'),
        pips: $('[data-hud="pips"]'), time: $('[data-hud="time"]'), score: $('[data-hud="score"]'), best: $('[data-hud="best"]'),
        status: $("[data-status]"),
    };
    const chipSolo = $('[data-chip="solo"]'), chipSolo2 = $('[data-chip="solo2"]'), chipRace = $('[data-chip="race"]'), chipBest = $('[data-chip="best"]');
    const ov = $("[data-ov]"), countBox = $("[data-count]"), countN = $("[data-count-n]"), countT = $("[data-count-t]"), toastEl = $("[data-toast]");
    const restartBtn = $('[data-act="restart"]');
    if (online) {
        root.querySelectorAll('[data-only="offline"]').forEach((b) => { b.hidden = true; });
        if (!room.isHost) restartBtn.hidden = true;
        else restartBtn.textContent = "New race";
    }

    /* ================= timers & toast ================= */
    let timers = [];
    const later = (fn, ms) => { const tm = setTimeout(() => { timers = timers.filter((x) => x !== tm); fn(); }, ms); timers.push(tm); return tm; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
    let toastTm = null;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        if (toastTm) clearTimeout(toastTm);
        toastTm = later(() => toastEl.classList.remove("show"), 2200);
    }

    /* ================= drawing ================= */
    const viewCache = new Map(); // interpolasi posisi untuk guest
    let lastDt = 0.016;
    function smooth(id, x, y, rotDeg) {
        if (!(online && !room.isHost)) return { x, y, rot: rotDeg };
        let v = viewCache.get(id);
        if (!v) { v = { x, y, rot: rotDeg }; viewCache.set(id, v); }
        const k = 1 - Math.exp(-14 * lastDt);
        v.x += (x - v.x) * k; v.y += (y - v.y) * k;
        let da = ((rotDeg - v.rot + 540) % 360) - 180;
        v.rot += da * k;
        return v;
    }

    /* FIX bug pojok kiri atas: posisi di grup LUAR, animasi scale di grup DALAM,
       sehingga CSS transform tidak menimpa translate. */
    function starSvg(s) {
        const p = smooth("s" + s.id, s.x, s.y, 0);
        return (
            '<g transform="translate(' + p.x.toFixed(1) + "," + p.y.toFixed(1) + ')">' +
            '<circle r="20" fill="#fde047" opacity="0.12"/>' +
            '<g class="sc-star"><path d="M0 -16L4.5 -4.5 16 0 4.5 4.5 0 16-4.5 4.5-16 0-4.5-4.5z" fill="#fde047" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></g></g>'
        );
    }

    function astSvg(a) {
        const p = smooth("a" + a.id, a.x, a.y, a.rot);
        const open = '<g transform="translate(' + p.x.toFixed(1) + "," + p.y.toFixed(1) + ") rotate(" + p.rot.toFixed(1) + ')">';
        if (a.kind === "comet") {
            const r = a.r;
            return open +
                '<polygon points="0,' + (r * 0.75).toFixed(1) + " " + (-r * 3.6).toFixed(1) + ",0 0," + (-r * 0.75).toFixed(1) + '" fill="#fb923c" opacity="0.45"/>' +
                '<polygon points="0,' + (r * 0.4).toFixed(1) + " " + (-r * 2.2).toFixed(1) + ",0 0," + (-r * 0.4).toFixed(1) + '" fill="#fde68a" opacity="0.6"/>' +
                '<circle r="' + r.toFixed(1) + '" fill="#fdba74" stroke="#f97316" stroke-width="2"/></g>';
        }
        const fills = {
            rock: ["#57534e", "#a8a29e", "#78716c"],
            ice: ["#bae6fd", "#7dd3fc", "#e0f2fe"],
            iron: ["#475569", "#94a3b8", "#334155"],
        };
        const f = fills[a.kind];
        let s = open + '<polygon points="' + a.pts.map((q) => q[0] + "," + q[1]).join(" ") + '" fill="' + f[0] + '" stroke="' + f[1] + '" stroke-width="2.5" stroke-linejoin="round"/>';
        a.craters.forEach((c) => { s += '<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + c.cr + '" fill="' + f[2] + '"/>'; });
        if (a.kind === "ice") s += '<path d="M' + (-a.r * 0.3) + " " + (-a.r * 0.4) + " L" + (a.r * 0.25) + " " + (a.r * 0.1) + '" stroke="#ffffff" stroke-width="1.5" opacity="0.7" stroke-linecap="round"/>';
        return s + "</g>";
    }

    function shipSvg(s, i) {
        const st = state;
        const p = smooth("ship" + i, s.x, s.y, s.ang * 180 / Math.PI + 90);
        const col = i === 0 ? { hull: "#eef2ff", line: "#6366f1", glass: "#6366f1" } : { hull: "#fff7ed", line: "#f97316", glass: "#f97316" };
        const blink = st.gt < s.inv ? (Math.floor(st.gt / 110) % 2 ? 0.3 : 1) : 1;
        const op = s.alive ? blink : 0.25;
        const thrust = s.alive && st.phase === "play" && st.gt >= s.unlockAt && (s.held.up || s.held.down || s.held.left || s.held.right || s.aim);
        let out = '<g opacity="' + op + '" transform="translate(' + p.x.toFixed(1) + "," + p.y.toFixed(1) + ") rotate(" + p.rot.toFixed(1) + ')">';
        if (thrust) out += '<polygon points="-5,14 5,14 0,26" fill="#fb923c"/>';
        out += '<polygon points="-11,12 11,12 0,-16" fill="' + (s.alive ? col.hull : "#cbd5e1") + '" stroke="' + col.line + '" stroke-width="2.5" stroke-linejoin="round"/>';
        out += '<polygon points="-4,6 4,6 0,-8" fill="' + col.glass + '"/></g>';
        if (st.race) {
            const tag = i === myIdx() ? "YOU" : st.mode === "bot" ? "BOT" : "RIVAL";
            out += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 26).toFixed(1) + '" text-anchor="middle" font-size="10" letter-spacing="2" fill="#c7d2fe">' + tag + "</text>";
        }
        if (s.alive && st.phase === "play" && st.gt < s.unlockAt) {
            out += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="24" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 5"/>' +
                '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 42).toFixed(1) + '" text-anchor="middle" font-size="9" letter-spacing="2" fill="#94a3b8">WAIT</text>';
        }
        return out;
    }

    /* ================= overlay ================= */
    const ui = { overlay: null, ovKey: "" };
    const miniAst = (kind) => {
        if (kind === "comet") return '<svg viewBox="-24 -10 34 20" width="30" height="20"><polygon points="0,5 -20,0 0,-5" fill="#fb923c" opacity=".5"/><circle r="5" fill="#fdba74" stroke="#f97316" stroke-width="1.5"/></svg>';
        const f = { rock: ["#57534e", "#a8a29e"], ice: ["#bae6fd", "#7dd3fc"], iron: ["#475569", "#94a3b8"] }[kind];
        const pts = kind === "ice" ? "0,-9 3,-3 9,0 3,3 0,9 -3,3 -9,0 -3,-3" : "-8,-5 -2,-9 6,-7 9,0 5,8 -4,8 -9,2";
        return '<svg viewBox="-12 -12 24 24" width="26" height="26"><polygon points="' + pts + '" fill="' + f[0] + '" stroke="' + f[1] + '" stroke-width="1.5"/></svg>';
    };

    function howtoHtml() {
        return (
            "<h3>How to play</h3>" +
            "<p>Catch the twinkling stars before the timer runs out. Every asteroid hit costs one of your 3 hull points. Levels are randomly generated within safety limits — asteroids are always slower than your rocket and density is capped, so every level is beatable.</p>" +
            "<h4>Controls</h4>" +
            '<p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to fly · press &amp; drag on the field to steer with mouse/touch · virtual pad on mobile · <kbd>P</kbd> pause · <kbd>Esc</kbd> close panels. The rocket nose always turns toward the direction you steer.</p>' +
            "<h4>Hazards</h4>" +
            '<div class="sc-legend">' +
            miniAst("rock") + "<span><b>Rock</b> — standard drifter, medium speed.</span>" +
            miniAst("ice") + "<span><b>Ice</b> — small and fast, weaves side to side.</span>" +
            miniAst("iron") + "<span><b>Iron</b> — big and slow, hard to squeeze past.</span>" +
            miniAst("comet") + "<span><b>Comet</b> — very fast, flies straight. Watch the edges.</span>" +
            "</div>" +
            "<h4>Modes</h4>" +
            "<p><b>Solo</b>: clear the star target to advance to a harder random level. <b>VS bot / multiplayer</b>: first to the target wins. A coin toss decides who moves first (1.2s head start), and in multiplayer your ship seat is randomized every race.</p>" +
            '<div class="sc-row"><button class="sc-btn primary" type="button" data-act="closeov">Got it</button></div>'
        );
    }

    function cheatsHtml(st) {
        const t = (key, label) =>
            '<button class="sc-switch" type="button" data-cheat="' + key + '" aria-pressed="' + st.cheats[key] + '"><span>' + label + '</span><span class="pill">' + (st.cheats[key] ? "ON" : "OFF") + "</span></button>";
        return (
            "<h3>Cheats</h3><p>Training wheels. Best score is not saved while cheats are used.</p>" +
            '<div class="sc-list">' +
            t("god", "Invincible hull") + t("slow", "Slow asteroids (45%)") + t("magnet", "Star magnet") + t("freeze", "Freeze asteroids") +
            "</div>" +
            '<div class="sc-row">' +
            '<button class="sc-btn" type="button" data-cheatact="time">+10 seconds</button>' +
            '<button class="sc-btn" type="button" data-cheatact="hull">Repair hull</button>' +
            (st.mode === "solo" ? '<button class="sc-btn" type="button" data-cheatact="skip">Skip level</button>' : "") +
            '<button class="sc-btn primary" type="button" data-act="closeov">Close</button>' +
            "</div>" +
            (st.cheated ? '<p class="sc-note">Cheats active — this run will not be saved to Best.</p>' : "")
        );
    }

    function idleHtml() {
        if (online) {
            if (room.isHost)
                return "<h3>Ready to race?</h3><p>First to the star target wins. Ship seats and the first mover are randomized every race.</p>" +
                    '<div class="sc-row"><button class="sc-btn primary" type="button" data-act="start" data-mode="online">Start race</button><button class="sc-btn" type="button" data-act="howto">How to play</button></div>';
            return "<h3>Waiting for host</h3><p>The host starts the race. Your ship seat will be assigned randomly.</p>" +
                '<div class="sc-row"><button class="sc-btn" type="button" data-act="howto">How to play</button></div>';
        }
        return (
            "<h3>Star Catcher</h3><p>Steer the rocket, catch stars, dodge asteroids. Each level is randomly generated — and guaranteed solvable.</p>" +
            '<div class="sc-row"><button class="sc-btn primary" type="button" data-act="start" data-mode="solo">Solo run</button>' +
            '<button class="sc-btn" type="button" data-act="start" data-mode="bot">Race vs bot</button>' +
            '<button class="sc-btn" type="button" data-act="howto">How to play</button></div>' +
            '<p class="sc-note">VS bot: a coin toss decides who moves first (1.2s head start).</p>'
        );
    }

    function clearHtml(st) {
        return (
            "<h3>Level " + st.level + " clear</h3>" +
            "<p>+" + st.result.gained + " points · " + st.result.left + "s to spare · hull " + myShip().hp + "/3. Score " + st.score + " · Best " + best + ".</p>" +
            '<div class="sc-row"><button class="sc-btn primary" type="button" data-act="next">Next level</button><button class="sc-btn" type="button" data-act="howto">How to play</button></div>' +
            (st.cheated ? '<p class="sc-note">Cheats used — score not saved to Best.</p>' : "")
        );
    }

    function overHtml(st) {
        const r = st.result || {};
        if (st.race) {
            const title = r.winner === -1 ? "Draw" : r.winner === myIdx() ? "You win!" : st.mode === "bot" ? "Bot wins" : "Rival wins";
            const you = st.ships[myIdx()].stars, rival = st.ships[1 - myIdx()].stars;
            const btn = !online || room.isHost
                ? '<button class="sc-btn primary" type="button" data-act="start" data-mode="online">Rematch</button>'
                : "";
            return "<h3>" + title + "</h3><p>" + (r.reason || "") + " Stars " + you + " – " + rival + ".</p>" +
                '<div class="sc-row">' + btn + '<button class="sc-btn" type="button" data-act="howto">How to play</button></div>' +
                (!online || room.isHost ? '<p class="sc-note">Rematch reshuffles seats and the coin toss.</p>' : '<p class="sc-note">Waiting for host to rematch…</p>');
        }
        return (
            "<h3>Game over</h3><p>" + (r.reason || "") + "</p>" +
            "<p>Score " + st.score + " · Best " + best + (st.cheated ? " (cheats used — not saved)" : "") + ".</p>" +
            '<div class="sc-row"><button class="sc-btn primary" type="button" data-act="start" data-mode="' + st.mode + '">Try again</button><button class="sc-btn" type="button" data-act="howto">How to play</button></div>'
        );
    }

    function syncOverlay() {
        const st = state;
        let key = "", html = "";
        if (ui.overlay === "howto") { key = "howto"; html = howtoHtml(); }
        else if (ui.overlay === "cheats" && st) { key = "cheats" + JSON.stringify(st.cheats) + st.cheated + st.mode; html = cheatsHtml(st); }
        else if (!st) { key = "conn"; html = "<h3>Connecting to room…</h3><p>Waiting for the host's game state.</p>"; }
        else if (st.phase === "idle") { key = "idle" + (online ? room.isHost : ""); html = idleHtml(); }
        else if (st.phase === "clear") { key = "clear" + st.level + st.score; html = clearHtml(st); }
        else if (st.phase === "over") { key = "over" + JSON.stringify(st.result) + st.score; html = overHtml(st); }
        else if (st.paused && !online) { key = "pause"; html = "<h3>Paused</h3><p>Press P or Resume to continue.</p><div class=\"sc-row\"><button class=\"sc-btn primary\" type=\"button\" data-act=\"pause\">Resume</button><button class=\"sc-btn\" type=\"button\" data-act=\"howto\">How to play</button></div>"; }
        if (key !== ui.ovKey) {
            ui.ovKey = key;
            ov.hidden = !html;
            ov.innerHTML = html ? '<div class="sc-card">' + html + "</div>" : "";
        }
    }

    /* ================= render ================= */
    function render() {
        const st = state;
        if (!st) { starsG.innerHTML = astsG.innerHTML = shipG.innerHTML = ""; syncOverlay(); hud.status.textContent = "Connecting"; return; }
        starsG.innerHTML = st.stars.map(starSvg).join("");
        astsG.innerHTML = st.asts.map(astSvg).join("");
        shipG.innerHTML = st.ships.map(shipSvg).join("");

        const me = myShip(), rival = st.race ? st.ships[1 - myIdx()] : null;
        hud.level.textContent = st.level;
        chipSolo.hidden = chipSolo2.hidden = st.race;
        chipRace.hidden = !st.race;
        chipBest.hidden = st.race;
        if (st.race) { hud.you.textContent = me.stars; hud.rival.textContent = rival.stars; hud.rtarget.textContent = st.cfg.target; }
        else { hud.stars.textContent = me.stars; hud.target.textContent = st.cfg.target; hud.score.textContent = st.score; }
        hud.best.textContent = best;
        [...hud.pips.children].forEach((el, i) => el.classList.toggle("on", i < me.hp));
        const leftMs = st.phase === "idle" || st.phase === "count" ? st.cfg.timeMs : Math.max(0, st.cfg.timeMs - st.gt);
        hud.time.textContent = Math.ceil(leftMs / 1000);

        countBox.hidden = st.phase !== "count";
        if (st.phase === "count") {
            countN.textContent = Math.max(1, Math.ceil(st.countT / 1000));
            countT.textContent = st.race
                ? "Coin toss — " + (firstIsMine() ? "you start first" : "rival starts first")
                : "Level " + st.level + " — get ready";
        }
        hud.status.textContent =
            st.phase === "idle" ? "Ready" :
                st.phase === "count" ? "Get set" :
                    st.phase === "clear" ? "Level clear" :
                        st.phase === "over" ? "Finished" :
                            st.paused ? "Paused" :
                                st.race && st.gt < me.unlockAt ? "Wait…" : st.race ? "Racing" : "Flying";
        syncOverlay();
    }

    function publish() {
        render();
        // Hanya host yang menulis state kanonik ke Firebase.
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ================= simulasi (host / offline) ================= */
    function botInput(s, st, dt) {
        s.jt -= dt * 1000;
        if (s.jt <= 0) { s.jt = 300 + Math.random() * 250; s.ja = (Math.random() - 0.5) * 0.6; }
        let target = null, bd = Infinity;
        for (const star of st.stars) { const d = Math.hypot(star.x - s.x, star.y - s.y); if (d < bd) { bd = d; target = star; } }
        if (!target) return [0, 0];
        let ax = (target.x - s.x) / (bd || 1), ay = (target.y - s.y) / (bd || 1);
        const ca = Math.cos(s.ja), sa = Math.sin(s.ja);
        const rx = ax * ca - ay * sa; ay = ax * sa + ay * ca; ax = rx;
        for (const a of st.asts) {
            const dx = s.x - a.x, dy = s.y - a.y, d = Math.hypot(dx, dy), R = a.r + 120;
            if (d < R && d > 0.01) { const wgt = (1 - d / R) * 2.4; ax += (dx / d) * wgt; ay += (dy / d) * wgt; }
        }
        if (s.x < 60) ax += 0.8; if (s.x > W - 60) ax -= 0.8;
        if (s.y < 60) ay += 0.8; if (s.y > H - 60) ay -= 0.8;
        const L = Math.hypot(ax, ay) || 1;
        return [ax / L, ay / L];
    }

    /* FIX arah: hidung roket selalu berbelok menghadap arah input lalu melaju ke sana. */
    function physics(s, ax, ay, dt, accel, max) {
        if (ax || ay) {
            const d = Math.hypot(ax, ay);
            s.vx += (ax / d) * accel * dt; s.vy += (ay / d) * accel * dt;
            s.tAng = Math.atan2(ay, ax);
        } else if (Math.hypot(s.vx, s.vy) > 30) {
            s.tAng = Math.atan2(s.vy, s.vx);
        }
        const fr = Math.exp(-2.6 * dt);
        s.vx *= fr; s.vy *= fr;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > max) { s.vx = (s.vx / sp) * max; s.vy = (s.vy / sp) * max; }
        s.x = clamp(s.x + s.vx * dt, 16, W - 16);
        s.y = clamp(s.y + s.vy * dt, 16, H - 16);
        const da = wrapPi(s.tAng - s.ang), turn = TURN * dt;
        s.ang += clamp(da, -turn, turn);
    }

    function step(dt) {
        const st = state;
        if (st.phase === "count") {
            st.countT -= dt * 1000;
            if (st.countT <= 0) {
                st.phase = "play"; st.gt = 0;
                st.ships.forEach((s, i) => { s.unlockAt = st.race ? (i === st.first ? 0 : STAGGER) : 0; });
                publish();
            }
            return;
        }
        if (st.phase !== "play") return;
        st.gt += dt * 1000;
        if (st.gt >= st.cfg.timeMs) {
            if (st.race) {
                const a = st.ships[0].stars, b = st.ships[1].stars;
                finishOver(a === b ? -1 : a > b ? 0 : 1, "Time ran out.");
            } else finishOver(null, "Time ran out with " + st.ships[0].stars + " of " + st.cfg.target + " stars.");
            return;
        }

        /* kontrol -> fisika */
        st.ships.forEach((s, i) => {
            if (!s.alive) return;
            let ax = 0, ay = 0;
            if (st.gt >= s.unlockAt) {
                if (st.mode === "bot" && i === 1) [ax, ay] = botInput(s, st, dt);
                else {
                    ax = (s.held.right ? 1 : 0) - (s.held.left ? 1 : 0);
                    ay = (s.held.down ? 1 : 0) - (s.held.up ? 1 : 0);
                    if (s.aim) {
                        const dx = s.aim.x - s.x, dy = s.aim.y - s.y, d = Math.hypot(dx, dy);
                        if (d > 14) { ax = dx / d; ay = dy / d; }
                    }
                }
            }
            const isBot = st.mode === "bot" && i === 1;
            physics(s, ax, ay, dt, isBot ? ACCEL * 0.92 : ACCEL, isBot ? MAX_SPEED * 0.88 : MAX_SPEED);
        });

        /* spawn asteroid (densitas dibatasi agar level tetap solvable) */
        if (st.gt >= st.nextSpawn) {
            if (st.asts.length < st.cfg.maxAsts) {
                const a = spawnAsteroid(Math.random, W, H, st.cfg);
                a.id = st.nextId++;
                st.asts.push(a);
                st.nextSpawn = st.gt + spawnInterval(st.cfg, st.gt);
            } else st.nextSpawn = st.gt + 250;
        }

        /* gerak asteroid + tabrakan */
        const slowF = !online && st.cheats.slow ? 0.45 : 1;
        const frozen = !online && st.cheats.freeze;
        for (let i = st.asts.length - 1; i >= 0; i--) {
            const a = st.asts[i];
            if (!frozen) {
                a.x += a.vx * slowF * dt; a.y += a.vy * slowF * dt;
                if (a.kind === "ice") {
                    const sp = Math.hypot(a.vx, a.vy) || 1;
                    const w = Math.cos(st.gt * 0.001 * a.wf + a.wp) * a.wa;
                    a.x += (-a.vy / sp) * w * slowF * dt;
                    a.y += (a.vx / sp) * w * slowF * dt;
                }
                if (a.kind === "comet") a.rot = Math.atan2(a.vy, a.vx) * 180 / Math.PI;
                else a.rot += a.spin * slowF * dt;
            }
            if (a.x < -90 || a.x > W + 90 || a.y < -90 || a.y > H + 90) { st.asts.splice(i, 1); continue; }
            for (let si = 0; si < st.ships.length; si++) {
                const s = st.ships[si];
                if (!s.alive || st.gt < s.inv) continue;
                if (!online && st.cheats.god && si === myIdx()) continue;
                if (hitTest(a.x, a.y, a.r * 0.85, s.x, s.y, ROCKET_R)) {
                    s.hp -= 1;
                    st.asts.splice(i, 1);
                    if (s.hp <= 0) {
                        s.alive = false;
                        if (st.race) finishOver(1 - si, (si === myIdx() ? "Your" : "Rival") + " hull was destroyed.");
                        else finishOver(null, "Hull destroyed with " + s.stars + " of " + st.cfg.target + " stars.");
                        return;
                    }
                    s.inv = st.gt + 1400;
                    const dx = s.x - a.x, dy = s.y - a.y, d = Math.hypot(dx, dy) || 1;
                    s.vx = (dx / d) * 260; s.vy = (dy / d) * 260;
                    break;
                }
            }
        }

        /* bintang: magnet cheat + koleksi */
        const me = myShip();
        for (let i = 0; i < st.stars.length; i++) {
            const star = st.stars[i];
            if (!online && st.cheats.magnet && me.alive) {
                const dx = me.x - star.x, dy = me.y - star.y, d = Math.hypot(dx, dy);
                if (d < 170 && d > 1) { star.x += (dx / d) * 260 * dt; star.y += (dy / d) * 260 * dt; }
            }
            for (let si = 0; si < st.ships.length; si++) {
                const s = st.ships[si];
                if (!s.alive) continue;
                if (hitTest(star.x, star.y, STAR_R - 10, s.x, s.y, ROCKET_R)) {
                    s.stars += 1;
                    if (s.stars >= st.cfg.target) {
                        if (st.race) finishOver(si, "Star target reached first.");
                        else finishSoloClear();
                        return;
                    }
                    st.stars[i] = newStar(st, star.id);
                    break;
                }
            }
        }
    }

    /* ================= aksi (template) ================= */
    function applyAction(action, actor) {
        const st = state;
        if (!st || !action || typeof action.type !== "string") return;
        const seat = st.slots.indexOf(actor);
        switch (action.type) {
            case "input": {
                if (seat < 0 || !DIRS.includes(action.dir)) return;
                st.ships[seat].held[action.dir] = !!action.down;
                break;
            }
            case "aim": {
                if (seat < 0) return;
                st.ships[seat].aim =
                    Number.isFinite(action.x) && Number.isFinite(action.y)
                        ? { x: clamp(action.x, 0, W), y: clamp(action.y, 0, H) }
                        : null;
                break;
            }
            case "start":
                if (online) { if (actor !== 0 || !room.isHost) return; startRun("online"); }
                else startRun(action.mode === "bot" ? "bot" : "solo");
                return;
            case "next":
                if (online || st.phase !== "clear") return;
                st.level += 1; beginLevel();
                return;
            case "restart":
                if (online && actor !== 0) return;
                startRun(st.mode);
                return;
            case "pause":
                if (online) return;
                if (st.phase === "play" || st.phase === "count") st.paused = !st.paused;
                break;
            case "cheat":
                if (online || !(action.key in st.cheats)) return;
                st.cheats[action.key] = !st.cheats[action.key];
                if (st.cheats[action.key]) st.cheated = true;
                toast(action.key + " " + (st.cheats[action.key] ? "ON" : "OFF"));
                break;
            case "cheatact":
                if (online) return;
                st.cheated = true;
                if (action.key === "time") { st.cfg.timeMs += 10000; toast("+10 seconds"); }
                else if (action.key === "hull") { myShip().hp = HEALTH; toast("Hull repaired"); }
                else if (action.key === "skip" && st.mode === "solo" && st.phase === "play") { finishSoloClear(); return; }
                else return;
                break;
            default: return;
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        const b = event.target.closest("[data-act],[data-cheat],[data-cheatact]");
        if (!b) return;
        if (b.dataset.cheat) { submitAction({ type: "cheat", key: b.dataset.cheat }); return; }
        if (b.dataset.cheatact) { submitAction({ type: "cheatact", key: b.dataset.cheatact }); return; }
        const act = b.dataset.act;
        if (act === "start") { if (online && !room.isHost) return; ui.overlay = null; submitAction({ type: "start", mode: b.dataset.mode }); }
        else if (act === "next") { ui.overlay = null; submitAction({ type: "next" }); }
        else if (act === "restart") { ui.overlay = null; submitAction({ type: "restart" }); }
        else if (act === "pause") submitAction({ type: "pause" });
        else if (act === "howto") { ui.overlay = "howto"; render(); }
        else if (act === "cheats") { ui.overlay = "cheats"; render(); }
        else if (act === "closeov") { ui.overlay = null; render(); }
    }

    /* ================= input: keyboard, mouse, pad ================= */
    const ac = new AbortController();
    const sig = { signal: ac.signal };

    function onKeyDown(e) {
        const dir = KEYMAP[e.code];
        if (dir) {
            if (state && (state.phase === "play" || state.phase === "count") && !ui.overlay) {
                e.preventDefault();
                if (!e.repeat) submitAction({ type: "input", dir, down: true });
            }
            return;
        }
        if (e.code === "KeyP" && !online && state && (state.phase === "play" || state.phase === "count")) {
            e.preventDefault(); submitAction({ type: "pause" });
        } else if (e.code === "Escape" && ui.overlay) { ui.overlay = null; render(); }
    }
    function onKeyUp(e) {
        const dir = KEYMAP[e.code];
        if (dir) submitAction({ type: "input", dir, down: false });
    }
    document.addEventListener("keydown", onKeyDown, sig);
    document.addEventListener("keyup", onKeyUp, sig);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && !online && state && (state.phase === "play" || state.phase === "count") && !state.paused)
            submitAction({ type: "pause" });
    }, sig);

    root.querySelectorAll("[data-pad] button[data-dir]").forEach((b) => {
        const dir = b.dataset.dir;
        b.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            b.setPointerCapture?.(e.pointerId);
            submitAction({ type: "input", dir, down: true });
        }, sig);
        const off = () => submitAction({ type: "input", dir, down: false });
        b.addEventListener("pointerup", off, sig);
        b.addEventListener("pointercancel", off, sig);
        b.addEventListener("pointerleave", off, sig);
    });
    root.querySelector("[data-pad]").addEventListener("contextmenu", (e) => e.preventDefault(), sig);

    let lastAimSend = 0;
    function sendAim(p, force) {
        const now = performance.now();
        if (!force && now - lastAimSend < AIM_MS) return;
        lastAimSend = now;
        submitAction({ type: "aim", x: p ? p.x : null, y: p ? p.y : null });
    }
    function aimFromEvent(e) {
        const r = svg.getBoundingClientRect();
        return { x: clamp((e.clientX - r.left) * (W / r.width), 0, W), y: clamp((e.clientY - r.top) * (H / r.height), 0, H) };
    }
    svg.addEventListener("pointerdown", (e) => {
        if (!state || state.phase !== "play" || ui.overlay) return;
        e.preventDefault();
        svg.setPointerCapture?.(e.pointerId);
        sendAim(aimFromEvent(e), true);
    }, sig);
    svg.addEventListener("pointermove", (e) => {
        if (!state || state.phase !== "play" || ui.overlay) return;
        if (e.buttons) sendAim(aimFromEvent(e), false);
    }, sig);
    const stopAim = () => sendAim(null, true);
    svg.addEventListener("pointerup", stopAim, sig);
    svg.addEventListener("pointercancel", stopAim, sig);

    root.addEventListener("click", handleClick, sig);

    /* ================= main loop ================= */
    let raf = null, lastT = 0, lastPub = 0, destroyed = false;
    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!lastT) { lastT = t; return; }
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t; lastDt = dt;
        const blocked = !online && (ui.overlay === "howto" || ui.overlay === "cheats");
        if (authority() && state && !state.paused && !blocked) step(dt);
        render();
        if (online && room.isHost && state && (state.phase === "count" || state.phase === "play") && t - lastPub > PUB_MS) {
            lastPub = t; publish();
        }
    }

    /* ================= init ================= */
    {
        const r = rng(42);
        let dots = "";
        for (let i = 0; i < 46; i++) {
            dots += '<circle cx="' + (r() * W).toFixed(1) + '" cy="' + (r() * H).toFixed(1) + '" r="' + (0.7 + r() * 1.6).toFixed(1) + '" fill="#ffffff" opacity="' + (0.25 + r() * 0.5).toFixed(2) + '"/>';
        }
        bgG.innerHTML = '<rect width="' + W + '" height="' + H + '" fill="#0d1126"/>' + dots;
    }

    const subs = [];
    const listen = (u) => { if (typeof u === "function") subs.push(u); };
    if (online) {
        listen(room.onRoom((nextRoom) => { roomData = nextRoom; }));
        if (room.isHost) {
            state = idleState();
            publish();
            listen(room.onAction((action) => applyAction(action, 1)));
        } else {
            state = null;
            listen(room.onState((nextState) => { state = nextState; render(); }));
        }
    } else {
        state = idleState();
    }
    render();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            clearTimers();
            ac.abort(); // lepas semua listener (root, svg, pad, document)
            subs.forEach((u) => { try { u(); } catch (e) { } });
            viewCache.clear();
            state = null;
        },
    };
}