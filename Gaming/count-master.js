/* ==== count-master.js ==== */
/* Count Master — crowd runner race (vs Bot / vs Player).
   Host-authoritative: host menjalankan simulasi & publish state,
   guest mengirim aksi (steer/target/cheat/restart) dan render + interpolasi. */

export const META = {
    id: "count-master", // harus sama dengan nama file (tanpa .js)
    name: "Count Master",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Steer your crowd through the better math gates, dodge hammers, and outgrow the boss before your rival.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="20" r="4" fill="currentColor" stroke="none"/><circle cx="24" cy="16" r="4" fill="currentColor" stroke="none"/><circle cx="34" cy="20" r="4" fill="currentColor" stroke="none"/><path d="M8 40V32"/><path d="M16 40V33"/><path d="M24 40V31"/><path d="M32 40V33"/><path d="M40 40V32"/><path d="M30 8h12v10"/><path d="M42 8l-4 5 4 5"/></svg>',
    bg: ["#e0e7ff", "#c7d2fe"],
    bestKey: "countMasterBest",
};

/* ================= pure logic ================= */
const W = 760, H = 620, TW = 356;
const LANES = [12, 392];
const CROWD_Y = 505, SCALE = 0.55;
const START = 10, MAX_CAP = 250;
const SPEED = 100, STEER = 250, BOT_STEER = 228;
const COUNTDOWN = 3, MIN_GAP = 190;
const NS = "http://www.w3.org/2000/svg";
const C = {
    you: "#4f46e5", rival: "#0ea5e9", good: "#059669", bad: "#dc2626",
    enemy: "#f43f5e", boss: "#111827", hammer: "#f59e0b",
};

const OFFS = [];
for (let i = 0; i < 28; i++) {
    const row = Math.floor(i / 5), col = i % 5;
    OFFS.push([(col - 2) * 14 + (row % 2 ? 5 : -2), 8 + row * 12]);
}

function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function applyOp(n, op) {
    const k = parseInt(op.slice(1), 10);
    let v = n;
    if (op[0] === "+") v = n + k;
    else if (op[0] === "-") v = n - k;
    else if (op[0] === "x") v = n * k;
    else v = Math.floor(n / k);
    return Math.max(0, Math.min(MAX_CAP, v));
}
const isGoodOp = (op) => op[0] === "+" || op[0] === "x";
const fight = (n, enemy) => { const left = Math.max(0, n - enemy); return { n: left, win: left > 0 }; };

function bestRun(c) {
    let n = START;
    for (const g of c.gates) n = Math.max(applyOp(n, g.left), applyOp(n, g.right));
    for (const e of c.enemies) { n = fight(n, e.n).n; if (!n) return 0; }
    return n;
}
function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t;
    }
}

/* Level acak, DIJAMIN bisa diselesaikan:
   - 8 gate (2 di antaranya x2), 4 hammer, 2 squad musuh, 1 boss
   - jarak antar entitas >= MIN_GAP (190) supaya tidak berdempetan
   - divalidasi: bestRun(course) > boss + 12, retry bila gagal,
     fallback nilai kuat setelah 40 percobaan (pasti lolos). */
function makeCourse(rnd) {
    let last = null;
    for (let attempt = 0; attempt < 60; attempt++) {
        const forced = attempt >= 40;
        const dA = forced ? 1 : 1 + Math.floor(rnd() * 3); // x2 awal (1..3)
        const dB = forced ? 4 : 4 + Math.floor(rnd() * 3); // x2 akhir (4..6)
        const gates = [];
        for (let i = 0; i < 8; i++) {
            const good = (i === dA || i === dB) ? "x2" : "+" + (forced ? 14 : 8 + Math.floor(rnd() * 7));
            const bad = rnd() < 0.35 ? "/2" : "-" + (5 + Math.floor(rnd() * 6));
            const flip = rnd() < 0.5;
            gates.push({ left: flip ? bad : good, right: flip ? good : bad });
        }
        const slots = [1, 2, 3, 4, 5, 6, 7, 8]; shuffle(slots, rnd);
        const extras = ["O", "O", "O", "O", "E", "E"]; shuffle(extras, rnd);
        const after = {};
        slots.slice(0, 6).forEach((sl, k) => { after[sl] = extras[k]; });
        const c = { gates: [], obstacles: [], enemies: [], boss: 0, len: 0 };
        let d = 240 + rnd() * 80, lastD = d;
        for (let i = 0; i < 8; i++) {
            c.gates.push({ d: Math.round(d), left: gates[i].left, right: gates[i].right });
            lastD = d; d += MIN_GAP + rnd() * 70;
            const ex = after[i + 1];
            if (ex === "O") {
                c.obstacles.push({ d: Math.round(d), x: Math.round(50 + rnd() * (TW - 100)) });
                lastD = d; d += MIN_GAP + rnd() * 70;
            } else if (ex === "E") {
                c.enemies.push({ d: Math.round(d), n: forced ? 6 : 6 + Math.floor(rnd() * 9) });
                lastD = d; d += MIN_GAP + rnd() * 70;
            }
        }
        c.boss = forced ? 90 : 90 + Math.floor(rnd() * 31);
        c.len = Math.round(lastD + 300);
        last = c;
        if (bestRun(c) > c.boss + 12) return c;
    }
    return last;
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0; // actor: 0 = host, 1 = guest
    const authority = !online || room.isHost;
    let roomData = room?.room || null;
    let state = null;

    root.innerHTML = `
<style>
.cm-app [hidden]{display:none!important}
.cm-app .cm-match{margin:2px 0 0;font-size:12px;color:#6b7280}
.cm-app .cm-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0}
.cm-app .cm-spacer{flex:1}
.cm-app .cm-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#374151;background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px}
.cm-app .cm-chip b{color:#111827}
.cm-app .cm-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.cm-app .cm-btn{font-size:12px;font-weight:700;color:#374151;background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:7px 14px;cursor:pointer}
.cm-app .cm-btn:hover{border-color:#c7cbd4}
.cm-app .cm-btn.primary{background:#111827;color:#fff;border-color:#111827}
.cm-app .cm-panel{padding:0;background:transparent;border:none}
.cm-app .cm-stage{position:relative}
.cm-app .cm-board{display:block;width:100%;height:auto;max-height:76vh;touch-action:none;user-select:none;-webkit-user-select:none;background:#fafafa;border-radius:16px}
.cm-app .cm-board text{font-family:inherit}
.cm-app .cm-count{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:4}
.cm-app .cm-count span{font-size:64px;font-weight:800;color:#111827;line-height:1}
.cm-app .cm-count small{margin-top:8px;font-size:13px;font-weight:600;color:#6b7280}
.cm-app .cm-cheats{position:absolute;top:12px;right:12px;z-index:5;display:flex;flex-direction:column;gap:6px;min-width:180px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;box-shadow:0 10px 30px rgba(17,24,39,.08)}
.cm-app .cm-cheats-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;letter-spacing:1px;color:#9ca3af;text-transform:uppercase}
.cm-app .cm-x{border:none;background:none;font-size:16px;line-height:1;color:#9ca3af;cursor:pointer;padding:2px 4px}
.cm-app .cm-cheat-btn{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;font-weight:600;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;cursor:pointer;text-align:left}
.cm-app .cm-cheat-btn:hover{border-color:#c7cbd4}
.cm-app .cm-cheat-btn b{color:#9ca3af;font-weight:700}
.cm-app .cm-cheat-btn.on{border-color:#059669;background:#ecfdf5}
.cm-app .cm-cheat-btn.on b{color:#059669}
.cm-app .cm-overlay{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(250,250,250,.78);border-radius:16px}
.cm-app .cm-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:22px 28px;text-align:center;max-width:340px;box-shadow:0 10px 30px rgba(17,24,39,.06)}
.cm-app .cm-res-title{margin:0 0 6px;font-size:22px;font-weight:800;color:#111827}
.cm-app .cm-res-title.win{color:#059669}
.cm-app .cm-res-title.lose{color:#dc2626}
.cm-app .cm-res-sub{margin:0 0 14px;font-size:13px;color:#6b7280}
.cm-app .cm-touch{position:absolute;left:0;right:0;bottom:12px;z-index:3;display:none;justify-content:space-between;padding:0 14px;pointer-events:none}
.cm-app .cm-touch button{pointer-events:auto;width:62px;height:62px;border-radius:50%;border:1px solid #e5e7eb;background:rgba(255,255,255,.9);color:#374151;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:pointer}
.cm-app .cm-touch button:active{background:#eef2ff}
@media (pointer:coarse),(max-width:640px){.cm-app .cm-touch{display:flex}}
@keyframes cm-float{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-34px)}}
.cm-app .cm-pop{font-size:15px;font-weight:800;paint-order:stroke;stroke:#fff;stroke-width:4px;text-anchor:middle;animation:cm-float .85s ease-out forwards;pointer-events:none}
</style>
<div class="game-app cm-app">
  <div class="game-intro">
    <div><h2>Count Master</h2><p class="cm-match" data-match></p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <div class="cm-hud">
    <span class="cm-chip"><i class="cm-dot" style="background:${C.you}"></i>You <b data-hud="you">10</b></span>
    <span class="cm-chip"><i class="cm-dot" style="background:${C.rival}"></i><span data-hud="rivalName">Bot</span> <b data-hud="rival">10</b></span>
    <span class="cm-chip">Run <b data-hud="dist">0</b></span>
    <span class="cm-chip">Best <b data-hud="best">–</b></span>
    <span class="cm-spacer"></span>
    <button class="cm-btn" type="button" data-cheats-toggle>Cheats</button>
    <button class="cm-btn" type="button" data-act="restart">Restart</button>
  </div>
  <section class="game-panel cm-panel">
    <div class="cm-stage">
      <svg class="cm-board" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Count Master race track">
        <defs>
          <clipPath id="cm-clip0"><rect x="0" y="0" width="${TW}" height="${H}" rx="14"/></clipPath>
          <clipPath id="cm-clip1"><rect x="0" y="0" width="${TW}" height="${H}" rx="14"/></clipPath>
        </defs>
        <g data-g="track"></g><g data-g="ents"></g><g data-g="crowd"></g><g data-g="fx"></g><g data-g="ui"></g>
      </svg>
      <div class="cm-count" data-count hidden><span data-count-num>3</span><small data-count-note></small></div>
      <div class="cm-cheats" data-cheats hidden>
        <div class="cm-cheats-head"><span>Cheats</span><button class="cm-x" type="button" data-cheats-close aria-label="Close">×</button></div>
        <button class="cm-cheat-btn" type="button" data-cheat="plus"><span>+25 crowd</span></button>
        <button class="cm-cheat-btn" type="button" data-cheat="double"><span>Double crowd</span></button>
        <button class="cm-cheat-btn" type="button" data-cheat="inv"><span>Invincible</span><b data-inv>off</b></button>
        <button class="cm-cheat-btn" type="button" data-cheat="slow"><span>Slow motion</span><b data-slow>off</b></button>
        <button class="cm-cheat-btn" type="button" data-cheat="skip"><span>Skip to boss</span></button>
      </div>
      <div class="cm-touch">
        <button type="button" data-vbtn="left" aria-label="Steer left"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-7 6 7 6"/></svg></button>
        <button type="button" data-vbtn="right" aria-label="Steer right"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l7 6-7 6"/></svg></button>
      </div>
      <div class="cm-overlay" data-result hidden>
        <div class="cm-card">
          <h3 class="cm-res-title" data-res-title>Draw</h3>
          <p class="cm-res-sub" data-res-sub></p>
          <button class="cm-btn primary" type="button" data-act="restart">Race again</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------- refs ---------- */
    const $ = (s) => root.querySelector(s);
    const svgEl = $(".cm-board");
    const trackG = $('[data-g="track"]'), entsG = $('[data-g="ents"]'),
        crowdG = $('[data-g="crowd"]'), fxG = $('[data-g="fx"]'), uiG = $('[data-g="ui"]');
    const hud = {
        you: $('[data-hud="you"]'), rival: $('[data-hud="rival"]'),
        dist: $('[data-hud="dist"]'), best: $('[data-hud="best"]'),
        rivalName: $('[data-hud="rivalName"]'),
    };
    const statusEl = $("[data-status]"), matchEl = $("[data-match]");
    const countEl = $("[data-count]"), countNum = $("[data-count-num]"), countNote = $("[data-count-note]");
    const resultEl = $("[data-result]"), resTitle = $("[data-res-title]"), resSub = $("[data-res-sub]");
    const cheatsEl = $("[data-cheats]");
    const invBtn = $('[data-cheat="inv"]'), slowBtn = $('[data-cheat="slow"]');
    const invState = $("[data-inv]"), slowState = $("[data-slow]");

    /* ---------- util & lifecycle ---------- */
    const ac = new AbortController();
    const signal = ac.signal;
    let timers = [];
    const later = (fn, ms) => {
        const tm = setTimeout(() => { timers = timers.filter((t) => t !== tm); fn(); }, ms);
        timers.push(tm); return tm;
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
    const unsubs = [];
    let raf = null, lastT = 0, lastPub = 0, forcePub = false;
    let curSeed = null, prevPhase = null, waitingDrawn = false;
    const seenFx = new Set();
    const disp = { t: 0, runners: [{ x: TW / 2, dist: 0 }, { x: TW / 2, dist: 0 }] };
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { }

    const myRunner = () => (state ? state.assign[playerIndex] : 0);

    /* ---------- state & reset ---------- */
    function resetGame() {
        const seed = (Math.random() * 4294967296) >>> 0;
        const rnd = rng(seed);
        const course = makeCourse(rnd);
        const assign = rnd() < 0.5 ? [0, 1] : [1, 0];   // acak posisi player (P1/P2)
        const first = rnd() < 0.5 ? 0 : 1;              // acak siapa jalan duluan
        const delays = [0, 0];
        delays[1 - first] = 0.6 + rnd() * 0.7;
        const mk = () => ({
            n: START, x: TW / 2, dist: 0, alive: true, finished: false, finishT: 0,
            steer: 0, target: null, gateIdx: 0, obstIdx: 0, enemyIdx: 0,
            hitT: -9, botGate: -1, botSide: 0, reason: "",
        });
        state = {
            seed, phase: "count", t: 0, course, assign, first, delays,
            bot: online ? -1 : 1 - assign[0],
            slow: false, inv: [false, false], cheated: [false, false],
            runners: [mk(), mk()], fx: [], fxId: 1, winner: null,
        };
        forcePub = true;
    }

    function pushFx(s, ri, text, color) {
        s.fx.push({ id: s.fxId++, r: ri, text, color, t: s.t, x: s.runners[ri].x });
        if (s.fx.length > 8) s.fx.shift();
    }
    function kill(s, r, i, reason) {
        r.alive = false; r.reason = reason;
        pushFx(s, i, "Out!", C.bad); forcePub = true;
    }

    /* ---------- simulasi (host / offline) ---------- */
    function resolve(s, r, i) {
        const c = s.course, inv = !!s.inv[i];
        while (r.gateIdx < c.gates.length && r.dist >= c.gates[r.gateIdx].d) {
            const g = c.gates[r.gateIdx];
            const op = r.x < TW / 2 ? g.left : g.right;
            r.n = applyOp(r.n, op);
            if (inv && r.n === 0) r.n = 1;
            pushFx(s, i, op + " -> " + r.n, isGoodOp(op) ? C.good : C.bad);
            if (!isGoodOp(op)) r.hitT = s.t;
            r.gateIdx++;
            if (r.n === 0) { kill(s, r, i, "A " + op + " gate erased everyone"); return; }
        }
        while (r.obstIdx < c.obstacles.length && r.dist >= c.obstacles[r.obstIdx].d) {
            const o = c.obstacles[r.obstIdx];
            if (!inv && Math.abs(r.x - o.x) < 40) {
                const lost = Math.ceil(r.n * 0.2);
                r.n = Math.max(0, r.n - lost); r.hitT = s.t;
                pushFx(s, i, "-" + lost, C.bad);
                if (r.n === 0) { kill(s, r, i, "The hammer wiped out the last runners"); return; }
            }
            r.obstIdx++;
        }
        while (r.enemyIdx < c.enemies.length && r.dist >= c.enemies[r.enemyIdx].d) {
            const e = c.enemies[r.enemyIdx];
            if (inv) pushFx(s, i, "Cleared!", C.good);
            else {
                r.n = fight(r.n, e.n).n; r.hitT = s.t;
                pushFx(s, i, r.n > 0 ? "Won! -" + e.n : "Overrun!", r.n > 0 ? C.good : C.bad);
                if (r.n === 0) { kill(s, r, i, "An enemy squad of " + e.n + " overran you"); return; }
            }
            r.enemyIdx++;
        }
        if (r.dist >= c.len) {
            r.dist = c.len;
            if (r.n > c.boss || inv) {
                r.finished = true; r.finishT = s.t;
                pushFx(s, i, "Boss down!", C.good); forcePub = true;
            } else kill(s, r, i, "The boss (" + c.boss + ") was too strong");
        }
    }

    function botThink(s, r) {
        const c = s.course;
        let target = TW / 2;
        const g = c.gates[r.gateIdx];
        if (g) {
            if (r.botGate !== r.gateIdx) {
                r.botGate = r.gateIdx;
                const L = applyOp(r.n, g.left), R = applyOp(r.n, g.right);
                let side = L >= R ? 0 : 1;
                const otherVal = side === 0 ? R : L;
                if (otherVal > 0 && Math.random() < 0.1) side = 1 - side; // bot kadang salah pilih
                r.botSide = side;
            }
            target = r.botSide === 0 ? TW * 0.25 : TW * 0.75;
        }
        const o = c.obstacles[r.obstIdx];
        if (o && o.d - r.dist < 170 && Math.abs(target - o.x) < 58) {
            target = clamp(o.x + (target >= o.x ? 72 : -72), 26, TW - 26);
        }
        r.target = target;
    }

    function finishRace(s) {
        s.phase = "done";
        const a = s.runners[0], b = s.runners[1];
        let w;
        if (a.finished && b.finished) {
            w = a.n !== b.n ? (a.n > b.n ? 0 : 1)
                : Math.abs(a.finishT - b.finishT) < 0.05 ? -1 : (a.finishT < b.finishT ? 0 : 1);
        } else if (a.finished) w = 0;
        else if (b.finished) w = 1;
        else w = Math.abs(a.dist - b.dist) < 1 ? -1 : (a.dist > b.dist ? 0 : 1);
        s.winner = w;
        forcePub = true;
    }

    function sim(dt) {
        const s = state;
        s.t += dt;
        if (s.phase === "count") {
            if (s.t >= COUNTDOWN) { s.phase = "running"; forcePub = true; }
            else return;
        }
        if (s.phase !== "running") return;
        const sp = SPEED * (s.slow ? 0.55 : 1);
        for (let i = 0; i < 2; i++) {
            const r = s.runners[i];
            if (!r.alive || r.finished) continue;
            if (s.t < COUNTDOWN + s.delays[i]) continue; // start delay acak
            if (i === s.bot) botThink(s, r);
            const rate = i === s.bot ? BOT_STEER : STEER;
            let vx = r.steer || 0;
            const tg = r.target ?? null;
            if (!vx && tg != null) {
                const dx = tg - r.x;
                if (Math.abs(dx) > 4) vx = dx > 0 ? 1 : -1;
            }
            r.x = clamp(r.x + vx * rate * dt, 26, TW - 26);
            r.dist += sp * dt;
            resolve(s, r, i);
        }
        const resolved = s.runners.every((r) => !r.alive || r.finished);
        if (resolved || s.t > 240) {
            if (!resolved) s.runners.forEach((r) => {
                if (r.alive && !r.finished) { r.alive = false; r.reason = "Time up"; }
            });
            finishRace(s);
        }
    }

    /* ---------- aksi & sinkronisasi ---------- */
    function applyAction(action, actor) {
        if (!state || !action || (actor !== 0 && actor !== 1)) return;
        const type = action.type;
        if (type === "restart") { resetGame(); return; }
        if (state.phase === "done") return;
        const ri = state.assign[actor];
        const r = state.runners[ri];
        if (type === "steer") {
            const v = Number(action.v);
            if (r.alive && !r.finished) r.steer = v === -1 || v === 1 ? v : 0;
        } else if (type === "target") {
            if (!r.alive || r.finished) return;
            r.target = action.x == null ? null : clamp(Number(action.x) || 0, 26, TW - 26);
        } else if (type === "cheat") {
            const id = action.id;
            if (id === "plus" && r.alive && !r.finished) {
                r.n = Math.min(MAX_CAP, r.n + 25); pushFx(state, ri, "+25", C.good);
            } else if (id === "double" && r.alive && !r.finished) {
                r.n = Math.min(MAX_CAP, r.n * 2); pushFx(state, ri, "x2", C.good);
            } else if (id === "inv") state.inv[ri] = !state.inv[ri];
            else if (id === "slow") state.slow = !state.slow;
            else if (id === "skip" && r.alive && !r.finished) {
                const c = state.course, nd = Math.max(r.dist, c.len - 380);
                while (r.gateIdx < c.gates.length && c.gates[r.gateIdx].d <= nd) r.gateIdx++;
                while (r.obstIdx < c.obstacles.length && c.obstacles[r.obstIdx].d <= nd) r.obstIdx++;
                while (r.enemyIdx < c.enemies.length && c.enemies[r.enemyIdx].d <= nd) r.enemyIdx++;
                r.dist = nd; pushFx(state, ri, "Skip!", C.good);
            } else return;
            state.cheated[ri] = true;
            forcePub = true;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    function publish() {
        lastPub = performance.now();
        if (online && room.isHost && state) room.publishState(state).catch(console.warn);
    }

    /* ---------- interpolasi guest ---------- */
    function syncDisp() {
        disp.t = state.t;
        for (let i = 0; i < 2; i++) {
            disp.runners[i].x = state.runners[i].x;
            disp.runners[i].dist = state.runners[i].dist;
        }
    }
    function interp(dt) {
        const s = state;
        disp.t += dt;
        if (Math.abs(disp.t - s.t) > 0.6) disp.t = s.t;
        else disp.t = Math.min(disp.t, s.t + 0.25);
        for (let i = 0; i < 2; i++) {
            const r = s.runners[i], d = disp.runners[i];
            if (s.phase !== "running" || !r.alive || r.finished) { d.x = r.x; d.dist = r.dist; continue; }
            if (s.t >= COUNTDOWN + s.delays[i])
                d.dist = Math.min(d.dist + SPEED * (s.slow ? 0.55 : 1) * dt, r.dist + 45, s.course.len);
            if (Math.abs(d.dist - r.dist) > 90) d.dist = r.dist;
            d.x += (r.x - d.x) * Math.min(1, dt * 12);
            if (Math.abs(d.x - r.x) > 120) d.x = r.x;
        }
    }

    /* ---------- render ---------- */
    const entY = (d, dist) => CROWD_Y - (d - dist) * SCALE;
    const opColor = (op) => (isGoodOp(op) ? C.good : C.bad);

    function laneTrack(i) {
        const d = disp.runners[i].dist, c = state.course;
        let out = `<g transform="translate(${LANES[i]},0)">`
            + `<rect x="0.5" y="0.5" width="${TW - 1}" height="${H - 1}" rx="14" fill="#fff" stroke="#e5e7eb"/>`
            + `<g clip-path="url(#cm-clip${i})">`;
        for (let dd = 250; dd < c.len; dd += 250) {
            const y = entY(dd, d);
            if (y < -20 || y > H + 20) continue;
            out += `<path d="M10 ${y}h${TW - 20}" stroke="#f1f5f9" stroke-width="2" stroke-dasharray="10 12"/>`
                + `<text x="${TW - 12}" y="${y - 5}" text-anchor="end" font-size="10" font-weight="600" fill="#cbd5e1">${dd}</text>`;
        }
        const fy = entY(c.len, d);
        if (fy > -20 && fy < H + 20) {
            for (let bx = 4, k = 0; bx < TW - 4; bx += 14, k++)
                out += `<rect x="${bx}" y="${fy - 4}" width="14" height="8" fill="${k % 2 ? "#fff" : "#111827"}"/>`;
        }
        return out + `</g></g>`;
    }

    function laneEnts(i) {
        const s = state, r = s.runners[i], d = disp.runners[i].dist, c = s.course;
        let out = `<g transform="translate(${LANES[i]},0)" clip-path="url(#cm-clip${i})">`;
        for (let gi = 0; gi < c.gates.length; gi++) {
            const g = c.gates[gi], y = entY(g.d, d);
            if (y < -70 || y > H + 40) continue;
            const done = gi < r.gateIdx, cl = opColor(g.left), cr = opColor(g.right);
            out += `<g opacity="${done ? 0.22 : 1}">`
                + `<rect x="4" y="${y - 28}" width="${TW / 2 - 8}" height="56" rx="10" fill="#fff" stroke="${cl}" stroke-width="2"/>`
                + `<rect x="${TW / 2 + 4}" y="${y - 28}" width="${TW / 2 - 8}" height="56" rx="10" fill="#fff" stroke="${cr}" stroke-width="2"/>`
                + `<text x="${TW * 0.25}" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="800" fill="${cl}">${g.left}</text>`
                + `<text x="${TW * 0.75}" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="800" fill="${cr}">${g.right}</text>`
                + `<path d="M${TW / 2} ${y - 32}v64" stroke="#e5e7eb" stroke-width="3" stroke-linecap="round"/>`
                + `</g>`;
        }
        for (const o of c.obstacles) {
            const y = entY(o.d, d);
            if (y < -50 || y > H + 50) continue;
            const ang = ((disp.t * 220 + o.d) % 360).toFixed(1);
            out += `<rect x="${o.x - 3}" y="${y - 30}" width="6" height="60" rx="3" fill="#e2e8f0"/>`
                + `<g transform="rotate(${ang} ${o.x} ${y})">`
                + `<rect x="${o.x - 40}" y="${y - 4}" width="80" height="8" rx="4" fill="${C.hammer}"/>`
                + `<circle cx="${o.x}" cy="${y}" r="7" fill="#fff" stroke="${C.hammer}" stroke-width="2.5"/></g>`;
        }
        c.enemies.forEach((e, ei) => {
            if (ei < r.enemyIdx) return;
            const y = entY(e.d, d);
            if (y < -80 || y > H + 60) return;
            const show = Math.min(e.n, 20);
            for (let k = 0; k < show; k++) {
                const row = Math.floor(k / 5), col = k % 5;
                out += `<circle cx="${TW / 2 + (col - 2) * 14 + (row % 2 ? 5 : -2)}" cy="${y + 8 + row * 12}" r="6" fill="${C.enemy}"/>`;
            }
            out += `<text x="${TW / 2}" y="${y - 12}" text-anchor="middle" font-size="14" font-weight="800" fill="${C.enemy}">${e.n}</text>`;
        });
        if (r.alive && !r.finished) {
            const y = entY(c.len, d);
            if (y > -80 && y < H + 80) {
                out += `<circle cx="${TW / 2}" cy="${y}" r="24" fill="${C.boss}"/>`
                    + `<text x="${TW / 2}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${c.boss}</text>`
                    + `<text x="${TW / 2}" y="${y - 32}" text-anchor="middle" font-size="10" font-weight="700" fill="#94a3b8" letter-spacing="2">BOSS</text>`;
            }
        }
        return out + `</g>`;
    }

    function laneCrowd(i, my) {
        const r = state.runners[i], dr = disp.runners[i];
        const col = i === my ? C.you : C.rival;
        let out = `<g transform="translate(${LANES[i]},0)" clip-path="url(#cm-clip${i})">`;
        if (!r.alive) {
            out += `<text x="${TW / 2}" y="${CROWD_Y}" text-anchor="middle" font-size="13" font-weight="700" fill="#9ca3af">OUT</text>`;
        } else {
            let shake = 0;
            const dtHit = disp.t - (r.hitT ?? -9);
            if (dtHit >= 0 && dtHit < 0.35) shake = Math.sin(dtHit * 50) * 6 * (1 - dtHit / 0.35);
            out += `<g transform="translate(${shake.toFixed(1)},0)">`;
            const show = Math.max(1, Math.min(r.n, 28));
            for (let k = 0; k < show; k++) {
                const [dx, dy] = OFFS[k];
                out += `<circle cx="${(dr.x + dx).toFixed(1)}" cy="${CROWD_Y + dy}" r="6" fill="${col}"/>`;
            }
            out += `<text x="${dr.x.toFixed(1)}" y="${CROWD_Y - 26}" text-anchor="middle" font-size="16" font-weight="800" fill="#111827">${r.n}</text></g>`;
        }
        return out + `</g>`;
    }

    function laneHeader(i, my) {
        const dr = disp.runners[i];
        const isMe = i === my, col = isMe ? C.you : C.rival;
        const label = isMe ? "YOU" : online ? "P" + (i + 1) : "BOT";
        const prog = clamp(dr.dist / state.course.len, 0, 1);
        return `<g transform="translate(${LANES[i]},0)">`
            + `<rect x="1" y="1" width="${TW - 2}" height="30" rx="13" fill="#fff" opacity="0.94"/>`
            + `<circle cx="16" cy="16" r="4" fill="${col}"/>`
            + `<text x="26" y="20" font-size="11" font-weight="800" fill="#374151" letter-spacing="1">${label}</text>`
            + `<rect x="96" y="13" width="${TW - 110}" height="5" rx="2.5" fill="#f1f5f9"/>`
            + `<rect x="96" y="13" width="${((TW - 110) * prog).toFixed(1)}" height="5" rx="2.5" fill="${col}"/>`
            + `</g>`;
    }

    function updateMatch() {
        const my = myRunner();
        matchEl.textContent = (online ? "You vs Player" : "You vs Bot")
            + " · you are P" + (my + 1) + " (" + (my === 0 ? "left" : "right") + " lane)";
        hud.rivalName.textContent = online ? "P" + (2 - my) : "Bot";
    }

    function maybeSaveBest() {
        const my = myRunner(), r = state.runners[my];
        if (state.winner === my && r.finished && !(state.cheated || [])[my] && r.n > best) {
            best = r.n;
            try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { }
        }
    }

    function renderWaiting() {
        if (!waitingDrawn) {
            waitingDrawn = true;
            trackG.innerHTML = `<rect width="${W}" height="${H}" fill="#fafafa"/>`
                + LANES.map((lx) => `<rect x="${lx + 0.5}" y="0.5" width="${TW - 1}" height="${H - 1}" rx="14" fill="#fff" stroke="#e5e7eb"/>`).join("")
                + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="14" font-weight="600" fill="#9ca3af">Waiting for host…</text>`;
            entsG.innerHTML = ""; crowdG.innerHTML = ""; fxG.innerHTML = ""; uiG.innerHTML = "";
        }
        statusEl.textContent = "Waiting for host";
        countEl.hidden = true; resultEl.hidden = true;
    }

    function renderFrame() {
        const s = state;
        if (!s) { renderWaiting(); return; }
        const my = myRunner();
        if (s.seed !== curSeed) {
            curSeed = s.seed; waitingDrawn = false;
            seenFx.clear(); fxG.innerHTML = "";
            syncDisp(); lastV = null; updSteer(); updateMatch();
        }
        for (const f of s.fx || []) {
            if (seenFx.has(f.id)) continue;
            seenFx.add(f.id);
            if (disp.t - f.t > 1.1) continue;
            const el = document.createElementNS(NS, "text");
            el.setAttribute("x", (LANES[f.r] + f.x).toFixed(1));
            el.setAttribute("y", CROWD_Y - 48);
            el.setAttribute("class", "cm-pop");
            el.setAttribute("fill", f.color);
            el.textContent = f.text;
            fxG.appendChild(el);
            later(() => el.remove(), 900);
        }
        let track = `<rect width="${W}" height="${H}" fill="#fafafa"/>`, ents = "", crowd = "", ui = "";
        for (let i = 0; i < 2; i++) {
            track += laneTrack(i); ents += laneEnts(i);
            crowd += laneCrowd(i, my); ui += laneHeader(i, my);
        }
        trackG.innerHTML = track; entsG.innerHTML = ents;
        crowdG.innerHTML = crowd; uiG.innerHTML = ui;

        hud.you.textContent = s.runners[my].n;
        hud.rival.textContent = s.runners[1 - my].n;
        hud.dist.textContent = Math.floor(Math.min(disp.runners[my].dist, s.course.len)) + "/" + s.course.len;
        hud.best.textContent = best > 0 ? String(best) : "–";
        const winner = s.winner ?? null;
        statusEl.textContent = s.phase === "count" ? "Starting"
            : s.phase === "running" ? "Racing"
                : winner === my ? "You won" : winner === -1 ? "Draw" : "You lost";

        if (s.phase === "count") {
            countEl.hidden = false;
            countNum.textContent = Math.max(1, Math.ceil(COUNTDOWN - disp.t));
            countNote.textContent = s.first === my ? "You start first"
                : online ? "P" + (s.first + 1) + " starts first" : "Bot starts first";
        } else if (s.phase === "running" && disp.t < COUNTDOWN + 0.6) {
            countEl.hidden = false; countNum.textContent = "GO"; countNote.textContent = "";
        } else countEl.hidden = true;

        if (s.phase === "done") {
            resTitle.textContent = winner === my ? "You win" : winner === -1 ? "Draw"
                : online ? "P" + (winner + 1) + " wins" : "Bot wins";
            resTitle.className = "cm-res-title" + (winner === my ? " win" : winner === -1 ? "" : " lose");
            const me = s.runners[my], rv = s.runners[1 - my];
            let sub = "You " + me.n + " · " + (online ? "P" + (2 - my) : "Bot") + " " + rv.n;
            if ((s.cheated || [])[my]) sub += " · cheats used";
            if (!me.alive && me.reason) sub += " — " + me.reason;
            resSub.textContent = sub;
            resultEl.hidden = false;
        } else resultEl.hidden = true;

        const invOn = !!(s.inv || [])[my], slowOn = !!s.slow;
        invBtn.classList.toggle("on", invOn); invState.textContent = invOn ? "on" : "off";
        slowBtn.classList.toggle("on", slowOn); slowState.textContent = slowOn ? "on" : "off";

        if (s.phase === "done" && prevPhase !== "done") maybeSaveBest();
        prevPhase = s.phase;
    }

    /* ---------- input: keyboard + mouse (desktop), touch + virtual button (mobile) ---------- */
    const held = { left: false, right: false };
    let lastV = null, dragging = false, lastTargetT = 0;

    function updSteer() {
        const v = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        if (v !== lastV) { lastV = v; submitAction({ type: "steer", v }); }
    }
    function canSteer() {
        const s = state;
        if (!s || s.phase === "done") return false;
        const r = s.runners[myRunner()];
        return r.alive && !r.finished;
    }
    function boardX(e) {
        const rect = svgEl.getBoundingClientRect();
        const sc = Math.min(rect.width / W, rect.height / H) || 1;
        const ox = (rect.width - W * sc) / 2;
        return (e.clientX - rect.left - ox) / sc;
    }
    function sendTarget(e, force) {
        if (!canSteer()) return;
        const now = performance.now();
        if (!force && now - lastTargetT < 60) return;
        lastTargetT = now;
        const lx = clamp(boardX(e) - LANES[myRunner()], 26, TW - 26);
        submitAction({ type: "target", x: Math.round(lx) });
    }

    function onKeyDown(e) {
        if (e.code === "ArrowLeft" || e.code === "KeyA") { e.preventDefault(); held.left = true; updSteer(); }
        else if (e.code === "ArrowRight" || e.code === "KeyD") { e.preventDefault(); held.right = true; updSteer(); }
        else if (e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "Space") e.preventDefault();
        else if (e.code === "KeyC" && !e.repeat) cheatsEl.hidden = !cheatsEl.hidden;
        else if (e.code === "KeyR" && !e.repeat) submitAction({ type: "restart" });
    }
    function onKeyUp(e) {
        if (e.code === "ArrowLeft" || e.code === "KeyA") { held.left = false; updSteer(); }
        if (e.code === "ArrowRight" || e.code === "KeyD") { held.right = false; updSteer(); }
    }
    document.addEventListener("keydown", onKeyDown, { signal });
    document.addEventListener("keyup", onKeyUp, { signal });

    svgEl.addEventListener("pointerdown", (e) => {
        if (!canSteer()) return;
        e.preventDefault(); dragging = true;
        try { svgEl.setPointerCapture(e.pointerId); } catch (err) { }
        sendTarget(e, true);
    }, { signal });
    svgEl.addEventListener("pointermove", (e) => { if (dragging) sendTarget(e, false); }, { signal });
    const endDrag = () => { if (!dragging) return; dragging = false; submitAction({ type: "target", x: null }); };
    svgEl.addEventListener("pointerup", endDrag, { signal });
    svgEl.addEventListener("pointercancel", endDrag, { signal });

    root.querySelectorAll("[data-vbtn]").forEach((b) => {
        const dir = b.dataset.vbtn;
        const on = (e) => {
            e.preventDefault(); held[dir] = true; updSteer();
            try { b.setPointerCapture(e.pointerId); } catch (err) { }
        };
        const off = () => { held[dir] = false; updSteer(); };
        b.addEventListener("pointerdown", on, { signal });
        b.addEventListener("pointerup", off, { signal });
        b.addEventListener("pointercancel", off, { signal });
        b.addEventListener("lostpointercapture", off, { signal });
    });

    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest('[data-act="restart"]')) { submitAction({ type: "restart" }); return; }
        if (t.closest("[data-cheats-toggle]")) { cheatsEl.hidden = !cheatsEl.hidden; return; }
        if (t.closest("[data-cheats-close]")) { cheatsEl.hidden = true; return; }
        const ch = t.closest("[data-cheat]");
        if (ch) submitAction({ type: "cheat", id: ch.dataset.cheat });
    }
    root.addEventListener("click", handleClick, { signal });

    /* ---------- main loop ---------- */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) { lastT = t; return; }
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (authority) {
            if (state) { sim(dt); syncDisp(); }
            if (online && state && (forcePub || t - lastPub >= 100)) { publish(); forcePub = false; }
        } else if (state) interp(dt);
        renderFrame();
    }

    /* ---------- init & room wiring ---------- */
    if (online) {
        const offRoom = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof offRoom === "function") unsubs.push(offRoom);
        if (room.isHost) {
            resetGame();
            publish();
            const offA = room.onAction((action) => applyAction(action, 1));
            if (typeof offA === "function") unsubs.push(offA);
        } else {
            const offS = room.onState((nextState) => { if (nextState) state = nextState; });
            if (typeof offS === "function") unsubs.push(offS);
        }
    } else {
        resetGame();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            if (raf) cancelAnimationFrame(raf);
            raf = null;
            ac.abort();
            clearTimers();
            unsubs.forEach((u) => { try { u(); } catch (e) { } });
        },
    };
}