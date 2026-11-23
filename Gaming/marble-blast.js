/* =============================================================
   MARBLE BLAST - games/marble-blast.js
   Template: export META + export mount(root, context).
   META.id must equal the filename without .js.
   After changing META run: node tools/build-games-manifest.mjs

   Modes:
   - "ai"   : you vs bot, random first turn every level
   - "room" : online 1v1, host-authoritative, random player slots
   - other  : solo
   ============================================================= */

export const META = {
    id: "marble-blast",
    name: "Marble Blast",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Turn-based marble blasting on a spiral track - solo, vs bot, or online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6a18 18 0 1 1-12.7 5.3" stroke="#818cf8"/><circle cx="24" cy="24" r="12" stroke="#64748b"/><circle cx="24" cy="24" r="5" fill="#1e293b" stroke="none"/><circle cx="24" cy="12" r="4" fill="#f87171" stroke="none"/><circle cx="34" cy="18" r="4" fill="#fbbf24" stroke="none"/><circle cx="34" cy="30" r="4" fill="#34d399" stroke="none"/></svg>',
    bg: ["#1e3a8a", "#312e81"],
    bestKey: "marbleBlastBest",
};

/* ---------- tuning ---------- */
const COLORS = ["#ef6a6a", "#f2b544", "#4fc08d", "#5aa2f0", "#b78af7"];
const ACCENTS = ["#7dd3fc", "#f9a8d4"];
const WILD = -1;
const R = 13;            /* marble radius */
const S = 26;            /* resting spacing along the track */
const W = 640, H = 430, CX = 320, CY = 215;
const FSPEED = 460;      /* projectile speed */
const TURN_TIME = 15;    /* seconds per turn (vs modes) */
const SPAWN_V = 90;      /* entry speed of a freshly spawned ball */
const DRAG = 5;          /* velocity relaxation toward crawl speed */
const PUSH_BONUS = 6;    /* the rear ball always pushes forward */
const MAGNET_V = 70;     /* gap-closing speed after a blast */
const REST = 0.85;       /* collision restitution */
/* Every color count is a multiple of 6 and the shooter only offers
   colors present in the chain -> every generated level is solvable. */
const LEVELS = [
    { counts: [6, 6, 6], speed: 10, spawnEvery: 0.55 },
    { counts: [6, 6, 6, 6], speed: 11, spawnEvery: 0.5 },
    { counts: [6, 6, 6, 6, 6], speed: 12, spawnEvery: 0.45 },
];

/* ---------- pure helpers ---------- */
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function buildPath() {
    const r0 = 184, r1 = 36, turns = 2.4, N = 760;
    const pts = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const r = r0 + (r1 - r0) * t;
        const a = t * turns * Math.PI * 2 + Math.PI * 0.75;
        pts.push([CX + r * Math.cos(a), CY + r * Math.sin(a)]);
    }
    const cum = [0];
    for (let i = 1; i <= N; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return { pts, cum, total: cum[N] };
}

function posAt(path, d) {
    const dd = Math.max(0, Math.min(path.total, d));
    const cum = path.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < dd) lo = mid + 1;
        else hi = mid;
    }
    const i = Math.max(1, lo);
    const t = (dd - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const p = path.pts[i - 1], q = path.pts[i];
    return { x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t };
}

const PATH = buildPath();
const HOLE_D = PATH.total - 24;
const HOLE = posAt(PATH, PATH.total);
const START = posAt(PATH, 0);

function tangentAt(d) {
    const p = posAt(PATH, Math.max(0, d - 3));
    const q = posAt(PATH, Math.min(PATH.total, d + 3));
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
}

function colorsOf(s) { return s.balls.map(function (b) { return b.c; }); }

function runAt(colors, idx, min) {
    if (idx < 0 || idx >= colors.length) return null;
    const c = colors[idx];
    let i0 = idx, i1 = idx;
    while (i0 > 0 && colors[i0 - 1] === c) i0--;
    while (i1 < colors.length - 1 && colors[i1 + 1] === c) i1++;
    const len = i1 - i0 + 1;
    return len >= (min || 3) ? { i0: i0, i1: i1, len: len } : null;
}

function presentColors(s) {
    const set = [];
    for (const b of s.balls) if (set.indexOf(b.c) < 0) set.push(b.c);
    if (!set.length) for (const c of s.queue) if (set.indexOf(c) < 0) set.push(c);
    return set;
}

function pickColor(rnd, s, avoid) {
    const present = presentColors(s);
    if (!present.length) return 0;
    let c = present[(rnd() * present.length) | 0];
    if (avoid !== undefined && present.length > 1 && c === avoid) {
        c = present[(present.indexOf(c) + 1) % present.length];
    }
    return c;
}

/* Runs of 2, shuffled so equal colors never touch; per-color totals
   are multiples of 3 -> the chain can always be fully cleared. */
function genQueue(rnd, li) {
    const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, li))];
    const pool = [];
    cfg.counts.forEach(function (n, c) { for (let k = 0; k < n / 2; k++) pool.push(c); });
    const out = [];
    let last = -1;
    while (pool.length) {
        let options = pool.filter(function (c) { return c !== last; });
        if (!options.length) options = pool;
        const c = options[(rnd() * options.length) | 0];
        pool.splice(pool.indexOf(c), 1);
        out.push(c, c);
        last = c;
    }
    return out;
}

function esc(v) {
    return String(v)
        .split("&").join("&amp;")
        .split("<").join("&lt;")
        .split(">").join("&gt;")
        .split('"').join("&quot;")
        .split("'").join("&#39;");
}

/* =============================================================
   mount
============================================================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const vsBot = !online && mode === "ai";
    const vs = online || vsBot;
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost;
    let roomData = (room && room.room) || null;
    let state = null;

    const matchRnd = rng((Math.random() * 1e9) | 0);
    const shotRnd = rng((Math.random() * 1e9) | 0);

    root.innerHTML = `
<style>
.mb-app{--mb-line:rgba(148,163,184,.16);--mb-mut:#8b93a7;--mb-fg:#e7eaf3;max-width:760px;margin:0 auto}
.mb-app *{box-sizing:border-box}
.mb-app .game-intro h2{margin:0;font-size:17px;font-weight:600;letter-spacing:.01em}
.mb-app .game-panel{padding:0;background:transparent;border:0;box-shadow:none}
.mb-panel{display:flex;flex-direction:column;gap:10px}
.mb-hud{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.mb-players{display:flex;gap:6px;min-width:0;flex-wrap:wrap}
.mb-pill{display:flex;align-items:center;gap:7px;padding:5px 10px;border:1px solid var(--mb-line);border-radius:999px;font-size:12px;color:var(--mb-mut)}
.mb-pill i{width:7px;height:7px;border-radius:50%;flex:none}
.mb-pill b{color:var(--mb-fg);font-variant-numeric:tabular-nums}
.mb-pill .you{font-size:10px;opacity:.65}
.mb-meta{display:flex;align-items:center;gap:6px}
.mb-chip{font-size:12px;color:var(--mb-mut);padding:5px 9px;border:1px solid var(--mb-line);border-radius:999px;white-space:nowrap}
.mb-chip b{color:var(--mb-fg)}
.mb-icon{width:30px;height:30px;border-radius:9px;border:1px solid var(--mb-line);background:transparent;color:var(--mb-mut);cursor:pointer;font-size:14px;line-height:1;padding:0}
.mb-icon:hover{color:var(--mb-fg);border-color:rgba(148,163,184,.4)}
.mb-icon.on{color:#fbbf24;border-color:rgba(251,191,36,.4)}
.mb-timer{height:2px;background:rgba(148,163,184,.12);border-radius:2px;overflow:hidden}
.mb-timer i{display:block;height:100%;width:100%;background:#7dd3fc}
.mb-stage{position:relative}
.mb-board{display:block;width:100%;background:#0a0f1e;border:1px solid var(--mb-line);border-radius:14px;touch-action:none;cursor:crosshair}
.mb-drain{animation:mbPulse 2.2s ease-in-out infinite}
.mb-danger .mb-drain{animation:mbPulse .5s ease-in-out infinite}
.mb-danger .mb-drainring{stroke:#ef6a6a}
@keyframes mbPulse{0%,100%{opacity:.65}50%{opacity:1}}
.mb-pop{animation:mbPop .5s ease-out forwards;transform-box:fill-box;transform-origin:center}
@keyframes mbPop{from{transform:scale(.35);opacity:1}to{transform:scale(1.8);opacity:0}}
.mb-rise{animation:mbRise .8s ease-out forwards;font-size:13px;font-weight:600}
@keyframes mbRise{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-26px)}}
.mb-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(10,15,30,.88);border:1px solid var(--mb-line);color:var(--mb-fg);font-size:12px;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.mb-toast.show{opacity:1}
.mb-cheats{position:absolute;top:10px;right:10px;width:212px;background:rgba(10,15,30,.94);border:1px solid var(--mb-line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;backdrop-filter:blur(4px)}
.mb-cheats[hidden]{display:none}
.mb-cheats-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mb-fg);margin-bottom:2px}
.mb-cheats-head button{background:none;border:0;color:var(--mb-mut);cursor:pointer;font-size:13px;padding:2px 4px}
.mb-crow{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mb-mut);padding:6px 8px;border-radius:8px;cursor:pointer}
.mb-crow:hover{background:rgba(148,163,184,.07)}
.mb-crow i{width:26px;height:14px;border-radius:999px;background:rgba(148,163,184,.2);position:relative;transition:background .15s;flex:none}
.mb-crow i::after{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#cbd5e1;transition:left .15s}
.mb-crow.on{color:var(--mb-fg)}
.mb-crow.on i{background:#7dd3fc}
.mb-crow.on i::after{left:14px;background:#0a0f1e}
.mb-cbtn{font-size:12px;color:var(--mb-mut);background:transparent;border:1px solid var(--mb-line);border-radius:8px;padding:7px 8px;cursor:pointer;text-align:left}
.mb-cbtn:hover{color:var(--mb-fg);border-color:rgba(148,163,184,.4)}
.mb-over{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,9,18,.72);border-radius:14px;backdrop-filter:blur(3px)}
.mb-over[hidden]{display:none}
.mb-card{width:min(86%,300px);background:#0d1426;border:1px solid var(--mb-line);border-radius:14px;padding:18px;text-align:center;display:flex;flex-direction:column;gap:10px}
.mb-card h3{margin:0;font-size:17px;color:var(--mb-fg)}
.mb-card .sub{margin:0;font-size:12px;color:var(--mb-mut)}
.mb-scores{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--mb-mut)}
.mb-scores div{display:flex;justify-content:space-between;gap:10px}
.mb-scores b{color:var(--mb-fg)}
.mb-best{font-size:11px;color:var(--mb-mut)}
.mb-btn{padding:9px 12px;border-radius:10px;border:1px solid rgba(125,211,252,.5);background:rgba(125,211,252,.12);color:#7dd3fc;font-size:13px;cursor:pointer}
.mb-btn:hover{background:rgba(125,211,252,.2)}
.mb-wait{font-size:12px;color:var(--mb-mut)}
.mb-touch{display:none;gap:10px;justify-content:center;align-items:center;padding-top:2px}
.mb-touch button{width:54px;height:54px;border-radius:50%;border:1px solid var(--mb-line);background:rgba(148,163,184,.06);color:var(--mb-fg);font-size:18px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;padding:0}
.mb-touch button:active{background:rgba(148,163,184,.18)}
.mb-touch .fire{width:66px;height:66px;border-color:rgba(125,211,252,.5);background:rgba(125,211,252,.12);color:#7dd3fc;font-size:20px}
.mb-touch button.off{opacity:.35}
@media (pointer:coarse),(max-width:720px){.mb-touch{display:flex}}
@media (prefers-reduced-motion:reduce){.mb-drain,.mb-pop,.mb-rise{animation:none}}
</style>
<div class="game-app mb-app">
  <div class="game-intro">
    <div><h2>Marble Blast</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel mb-panel" data-board>
    <div class="mb-hud">
      <div class="mb-players" data-players></div>
      <div class="mb-meta">
        <span class="mb-chip">Lv <b data-level>1</b>/3</span>
        <span class="mb-chip"><b data-left>0</b> left</span>
        <button class="mb-icon" type="button" data-cheatsbtn title="Cheats" aria-label="Cheats">&#9889;</button>
        <button class="mb-icon" type="button" data-restart title="Restart" aria-label="Restart">&#8634;</button>
      </div>
    </div>
    <div class="mb-timer" data-timerwrap><i data-timer></i></div>
    <div class="mb-stage">
      <svg class="mb-board" data-svg viewBox="0 0 640 430" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Marble Blast board">
        <g data-g="track"></g><g data-g="chain"></g><g data-g="fx"></g><g data-g="shot"></g>
      </svg>
      <div class="mb-toast" data-toast></div>
      <div class="mb-cheats" data-cheats hidden>
        <div class="mb-cheats-head"><span>Cheats</span><button type="button" data-cheatclose aria-label="Close">&#10005;</button></div>
        <div class="mb-crow" data-toggle="freeze"><span>Freeze chain</span><i></i></div>
        <div class="mb-crow" data-toggle="slow"><span>Slow motion</span><i></i></div>
        <div class="mb-crow" data-toggle="wild"><span>Rainbow shot</span><i></i></div>
        <div class="mb-crow" data-toggle="assist"><span>Aim assist</span><i></i></div>
        <button class="mb-cbtn" type="button" data-cheat="blast">Blast current color</button>
        <button class="mb-cbtn" type="button" data-cheat="pushback">Push chain back</button>
        <button class="mb-cbtn" type="button" data-cheat="skip">Skip level</button>
      </div>
      <div class="mb-over" data-over hidden></div>
    </div>
    <div class="mb-touch" data-touch>
      <button type="button" data-v="left" aria-label="Aim left">&#10226;</button>
      <button type="button" data-v="swap" aria-label="Swap marble">&#8644;</button>
      <button type="button" class="fire" data-v="fire" aria-label="Fire">&#9679;</button>
      <button type="button" data-v="right" aria-label="Aim right">&#10227;</button>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = function (sel) { return root.querySelector(sel); };
    const svgEl = $("[data-svg]");
    const trackG = $('[data-g="track"]');
    const chainG = $('[data-g="chain"]');
    const fxG = $('[data-g="fx"]');
    const shotG = $('[data-g="shot"]');
    const playersEl = $("[data-players]");
    const statusEl = $("[data-status]");
    const levelEl = $("[data-level]");
    const leftEl = $("[data-left]");
    const timerEl = $("[data-timer]");
    const timerWrap = $("[data-timerwrap]");
    const toastEl = $("[data-toast]");
    const cheatsBtn = $("[data-cheatsbtn]");
    const restartBtn = $("[data-restart]");
    const cheatPanel = $("[data-cheats]");
    const overEl = $("[data-over]");
    const touchEl = $("[data-touch]");

    /* ---------- local (per-client) state ---------- */
    let aim = -Math.PI / 2, rotL = false, rotR = false;
    let raf = null, lastT = 0, snapAt = 0;
    let lastFxId = 0, lastNoticeId = 0, lastMatchId = null, lastOverKey = "";
    let pubAcc = 0, lastPubRev = -1;
    let toastTimer = null, cheatsOpen = false, boardPointer = null;
    let destroyed = false;
    const timers = new Set();
    const unsubs = [];

    function later(fn, ms) {
        const id = setTimeout(function () { timers.delete(id); if (!destroyed) fn(); }, ms);
        timers.add(id);
        return id;
    }
    function canManage(actor) { return !online || actor === 0; }
    function slotOf(actor) { return state ? state.slots.indexOf(actor) : 0; }
    function accentOf(actor) { const sl = slotOf(actor); return ACCENTS[sl >= 0 ? sl : 0]; }
    function nameOf(actor) {
        if (!vs) return playerName || "Player";
        if (vsBot) return actor === 0 ? (playerName || "You") : "Bot";
        return (state && state.names && state.names[actor]) || (actor === 0 ? "Host" : "Guest");
    }
    function guestName() {
        const p = roomData && (roomData.players || roomData.users);
        if (!p) return "Guest";
        if (Array.isArray(p)) { const g = p[1]; return (g && (g.name || g.displayName)) || "Guest"; }
        if (p.guest && (p.guest.name || p.guest.displayName)) return p.guest.name || p.guest.displayName;
        const keys = Object.keys(p).filter(function (k) { return k !== "host" && k !== "0"; });
        for (const k of keys) { const v = p[k]; if (v && (v.name || v.displayName)) return v.name || v.displayName; }
        return "Guest";
    }

    /* ---------- state factory ---------- */
    function notice(s, text) { s.noticeSeq++; s.notice = { id: s.noticeSeq, text: text }; }
    function pushFx(s, e) {
        s.fxSeq++;
        s.fx.push({ id: s.fxSeq, x: e.x, y: e.y, c: e.c, big: Boolean(e.big), score: e.score || 0, owner: e.owner || 0 });
        if (s.fx.length > 12) s.fx.shift();
    }

    function freshLevel(s, li) {
        const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, li))];
        s.level = li;
        s.speed = cfg.speed;
        s.spawnEvery = cfg.spawnEvery;
        s.queue = genQueue(matchRnd, li);
        s.balls = [];
        s.spawnIn = 0.2;
        s.proj = null;
        s.combo = 0;
        s.lastOwner = 0;
        s.settleT = 0;
        s.clearT = 0;
        s.phase = "aim";
        s.turn = vs ? ((matchRnd() * 2) | 0) : 0; /* random first turn */
        s.turnT = TURN_TIME;
        s.botT = 0.9 + matchRnd() * 0.9;
        s.shots = [{ cur: 0, next: 0 }, { cur: 0, next: 0 }];
        for (let a = 0; a < 2; a++) {
            s.shots[a].cur = pickColor(matchRnd, s);
            s.shots[a].next = pickColor(matchRnd, s, s.shots[a].cur);
        }
        if (li === 0) {
            notice(s, vsBot ? (s.turn === 0 ? "You start" : "Bot starts")
                : online ? ((s.names[s.turn] || "Player") + " starts")
                    : "Level 1");
        } else {
            notice(s, "Level " + (li + 1));
        }
        s.rev++;
    }

    function freshState() {
        const s = {
            matchId: (Math.random() * 1e9) | 0,
            level: 0,
            phase: "aim",
            slots: vs ? (matchRnd() < 0.5 ? [0, 1] : [1, 0]) : [0], /* random player slots */
            names: vs ? [playerName || (vsBot ? "You" : "Host"), vsBot ? "Bot" : guestName()] : [playerName || "Player"],
            scores: [0, 0],
            shots: [{ cur: 0, next: 0 }, { cur: 0, next: 0 }],
            balls: [],
            queue: [],
            spawnIn: 0.2,
            spawnEvery: LEVELS[0].spawnEvery,
            speed: LEVELS[0].speed,
            proj: null,
            turn: 0,
            turnT: TURN_TIME,
            botT: 1,
            settleT: 0,
            clearT: 0,
            combo: 0,
            lastOwner: 0,
            cheats: { freeze: false, slow: false, wild: false, assist: false },
            cheated: false,
            fx: [],
            fxSeq: 0,
            notice: null,
            noticeSeq: 0,
            result: null,
            rev: 0,
        };
        freshLevel(s, 0);
        return s;
    }

    /* ---------- physics (host / offline only) ---------- */
    function collide(s, i) {
        const f = s.balls[i - 1], r = s.balls[i];
        const gap = f.d - r.d;
        if (gap < S - 0.05) {
            f.d += S - gap; /* contacts only ever shove the front ball forward */
            if (r.v > f.v) {
                const vf = f.v, vr = r.v;
                f.v = ((1 - REST) * vf + (1 + REST) * vr) / 2;
                r.v = ((1 + REST) * vf + (1 - REST) * vr) / 2;
            }
        }
    }

    function popRun(s, run, owner, reaction) {
        const removed = s.balls.splice(run.i0, run.len);
        if (!removed.length) return;
        if (reaction) s.combo++;
        const gained = removed.length * 10 * (1 + s.combo);
        s.scores[owner] += gained;
        if (run.i0 > 0 && run.i0 < s.balls.length) s.balls[run.i0].magnet = true;
        for (let j = run.i0; j < s.balls.length; j++) s.balls[j].v += 20;
        const mid = removed[(removed.length / 2) | 0];
        const p = posAt(PATH, mid.d);
        pushFx(s, { x: p.x, y: p.y, c: removed[0].c, big: s.combo > 0, score: gained, owner: owner });
        s.rev++;
    }

    function simulate(s, dt) {
        const ts = s.cheats.slow ? 0.35 : 1;
        const frozen = s.cheats.freeze;
        const crawl = frozen ? 0 : s.speed * ts;

        /* one-by-one spawn: each entering ball rolls in and shoves the chain */
        if (!frozen && s.queue.length) {
            s.spawnIn -= dt * ts;
            if (s.spawnIn <= 0) {
                const rear = s.balls[s.balls.length - 1];
                if (!rear || rear.d >= S) {
                    s.balls.push({ c: s.queue.shift(), d: 0, v: SPAWN_V * ts, spin: 0, magnet: false });
                    s.spawnIn = s.spawnEvery;
                    s.rev++;
                } else {
                    s.spawnIn = 0;
                }
            }
        }

        let magnetFrom = Infinity;
        for (let i = 0; i < s.balls.length; i++) {
            if (s.balls[i].magnet) { magnetFrom = i; break; }
        }

        const last = s.balls.length - 1;
        for (let i = 0; i < s.balls.length; i++) {
            const b = s.balls[i];
            let target = crawl;
            if (i === last && !frozen) target += PUSH_BONUS * ts; /* rear ball always pushes forward */
            if (i >= magnetFrom && !frozen) target = Math.max(target, crawl + MAGNET_V * ts);
            b.v += (target - b.v) * Math.min(1, DRAG * dt);
            if (frozen) b.v = 0;
            if (b.v < 0) b.v = 0;
            b.d += b.v * dt;
            b.spin += (b.v * dt) / R; /* rolling */
        }

        for (let pass = 0; pass < 4; pass++) {
            for (let i = 1; i < s.balls.length; i++) collide(s, i);
            for (let i = s.balls.length - 1; i >= 1; i--) collide(s, i);
        }

        /* magnet gaps closing -> chain reactions */
        let guard = 0, again = true;
        while (again && guard++ < 12) {
            again = false;
            for (let i = 1; i < s.balls.length; i++) {
                const b = s.balls[i];
                if (!b.magnet) continue;
                if (s.balls[i - 1].d - b.d <= S + 0.6) {
                    b.magnet = false;
                    if (s.balls[i - 1].c === b.c) {
                        const run = runAt(colorsOf(s), i, 3);
                        if (run) { popRun(s, run, s.lastOwner, true); again = true; break; }
                    }
                }
            }
        }
    }

    function hitChain(s, idx, pr) {
        const b = s.balls[idx];
        const p = posAt(PATH, b.d);
        const t = tangentAt(b.d);
        const ahead = (pr.x - p.x) * t.x + (pr.y - p.y) * t.y > 0;
        let c = pr.c, min = 3;
        if (c === WILD) { c = b.c; min = 2; } /* rainbow shot pops any pair */
        const at = ahead ? idx : idx + 1;
        const d = Math.max(0, ahead ? b.d + S : b.d - S);
        s.balls.splice(at, 0, { c: c, d: d, v: Math.max(b.v, s.speed) + 30, spin: 0, magnet: false });
        for (let pass = 0; pass < 6; pass++) {
            for (let i = 1; i < s.balls.length; i++) collide(s, i);
        }
        const run = runAt(colorsOf(s), at, min);
        if (run) popRun(s, run, pr.owner, false);
        s.lastOwner = pr.owner;
        s.proj = null;
        s.phase = "settle";
        s.settleT = 0.5;
        s.rev++;
    }

    function flightStep(s, dt, ts) {
        const p = s.proj;
        if (!p) return;
        const dist = FSPEED * ts * dt;
        const steps = Math.max(1, Math.ceil(dist / 9));
        for (let k = 0; k < steps && s.proj; k++) {
            p.x += (p.vx * dist) / steps;
            p.y += (p.vy * dist) / steps;
            p.spin += dist / steps / R;
            let hit = -1;
            for (let i = 0; i < s.balls.length; i++) {
                const bp = posAt(PATH, s.balls[i].d);
                const dx = p.x - bp.x, dy = p.y - bp.y;
                if (dx * dx + dy * dy < (2 * R - 3) * (2 * R - 3)) { hit = i; break; }
            }
            if (hit >= 0) { hitChain(s, hit, p); break; }
            if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
                s.proj = null;
                s.phase = "settle";
                s.settleT = 0.2;
                s.rev++;
            }
        }
    }

    /* ---------- game flow ---------- */
    function passTurn(s) {
        if (vs) s.turn = 1 - s.turn;
        const present = presentColors(s);
        for (let a = 0; a < 2; a++) {
            const sh = s.shots[a];
            if (present.length) {
                if (present.indexOf(sh.cur) < 0) sh.cur = pickColor(shotRnd, s);
                if (present.indexOf(sh.next) < 0) sh.next = pickColor(shotRnd, s, sh.cur);
            }
        }
        s.turnT = TURN_TIME;
        s.botT = 0.8 + shotRnd() * 0.9;
        s.phase = "aim";
        s.rev++;
    }

    function levelCleared(s) {
        if (s.phase === "end" || s.phase === "clear") return;
        if (!vs) s.scores[0] += 100;
        if (s.level + 1 < LEVELS.length) {
            s.phase = "clear";
            s.clearT = 1.4;
            notice(s, "Level " + (s.level + 2));
        } else {
            endMatch(s, "clear");
        }
        s.rev++;
    }

    function endMatch(s, kind) {
        s.phase = "end";
        s.proj = null;
        let winner;
        if (vs) winner = s.scores[0] === s.scores[1] ? -1 : (s.scores[0] > s.scores[1] ? 0 : 1);
        else winner = kind === "clear" ? 0 : -1;
        s.result = { kind: kind, winner: winner };
        s.rev++;
    }

    function fireAction(s, actor, angle) {
        if (s.phase !== "aim") return;
        if (vs ? actor !== s.turn : actor !== 0) return;
        const a = Number(angle);
        if (!Number.isFinite(a)) return;
        const c = s.cheats.wild ? WILD : s.shots[actor].cur;
        s.proj = {
            x: CX + Math.cos(a) * 20, y: CY + Math.sin(a) * 20,
            vx: Math.cos(a), vy: Math.sin(a),
            c: c, owner: actor, spin: 0,
        };
        s.shots[actor].cur = s.shots[actor].next;
        s.shots[actor].next = pickColor(shotRnd, s);
        s.combo = 0;
        s.lastOwner = actor;
        s.phase = "flight";
        s.rev++;
    }

    function swapAction(s, actor) {
        if (s.phase !== "aim") return;
        if (vs ? actor !== s.turn : actor !== 0) return;
        const sh = s.shots[actor];
        const t = sh.cur;
        sh.cur = sh.next;
        sh.next = t;
        s.rev++;
    }

    function botAct(s) {
        if (!s.balls.length) { fireAction(s, 1, shotRnd() * Math.PI * 2); return; }
        const cols = colorsOf(s);
        function targetFor(c) {
            let best = null, bestLen = 0;
            for (let i = 0; i < cols.length; i++) {
                if (cols[i] !== c) continue;
                const run = runAt(cols, i, 1);
                if (run && run.len > bestLen) { bestLen = run.len; best = run.i0 + ((run.len / 2) | 0); }
            }
            return { idx: best, len: bestLen };
        }
        const tCur = targetFor(s.shots[1].cur);
        const tNext = targetFor(s.shots[1].next);
        const useNext = tNext.len > tCur.len;
        if (useNext) swapAction(s, 1);
        let idx = useNext ? tNext.idx : tCur.idx;
        if (idx === null || idx === undefined) idx = (shotRnd() * s.balls.length) | 0;
        const b = s.balls[idx];
        const bp = posAt(PATH, b.d);
        const flight = Math.sqrt((bp.x - CX) * (bp.x - CX) + (bp.y - CY) * (bp.y - CY)) / FSPEED;
        const p = posAt(PATH, Math.min(HOLE_D, b.d + b.v * flight));
        const angle = Math.atan2(p.y - CY, p.x - CX) + (shotRnd() - 0.5) * 0.07;
        fireAction(s, 1, angle);
    }

    function applyCheat(s, a) {
        const k = a && a.key;
        if (k && Object.prototype.hasOwnProperty.call(s.cheats, k)) {
            s.cheats[k] = Boolean(a.on);
            if (a.on) s.cheated = true;
        } else if (k === "blast") {
            s.cheated = true;
            const cols = colorsOf(s);
            let c = s.shots[s.turn].cur;
            if (cols.indexOf(c) < 0) {
                let best = -1, bestN = 0;
                for (const cc of cols) {
                    const n = cols.filter(function (x) { return x === cc; }).length;
                    if (n > bestN) { bestN = n; best = cc; }
                }
                c = best;
            }
            if (c >= 0) {
                const removed = s.balls.filter(function (b) { return b.c === c; });
                if (removed.length) {
                    s.balls = s.balls.filter(function (b) { return b.c !== c; });
                    for (let i = 1; i < s.balls.length; i++) {
                        if (s.balls[i - 1].d - s.balls[i].d > S + 1) s.balls[i].magnet = true;
                    }
                    s.scores[s.turn] += removed.length * 5;
                    removed.slice(0, 10).forEach(function (b) {
                        const p = posAt(PATH, b.d);
                        pushFx(s, { x: p.x, y: p.y, c: c, big: false, score: 0, owner: s.turn });
                    });
                    const p0 = posAt(PATH, removed[0].d);
                    pushFx(s, { x: p0.x, y: p0.y, c: c, big: true, score: removed.length * 5, owner: s.turn });
                }
            }
        } else if (k === "pushback") {
            s.cheated = true;
            if (s.balls.length) {
                const shift = Math.min(150, s.balls[s.balls.length - 1].d);
                for (const b of s.balls) b.d -= shift;
                notice(s, "Chain pushed back");
            }
        } else if (k === "skip") {
            s.cheated = true;
            levelCleared(s);
        }
        s.rev++;
    }

    /* ---------- actions / networking ---------- */
    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== "string") return;
        if (actor !== 0 && actor !== 1) return;
        if (action.type === "fire") fireAction(state, actor, action.angle);
        else if (action.type === "swap") swapAction(state, actor);
        else if (action.type === "cheat") { if (canManage(actor)) applyCheat(state, action); }
        else if (action.type === "restart") {
            if (canManage(actor)) { state = freshState(); lastOverKey = ""; }
        }
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            try {
                const p = room.sendAction(action);
                if (p && p.catch) p.catch(console.warn);
            } catch (err) { console.warn(err); }
            return;
        }
        applyAction(action, playerIndex);
    }

    function pushState(s) {
        try {
            const p = room.publishState(JSON.parse(JSON.stringify(s)));
            if (p && p.catch) p.catch(console.warn);
        } catch (err) { console.warn(err); }
    }

    function publish() {
        render();
        if (online && room.isHost && state) {
            lastPubRev = state.rev;
            pushState(state);
        }
    }

    /* ---------- frame loop ---------- */
    function tick(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
        lastT = t;
        if (rotL) aim -= 2.4 * dt;
        if (rotR) aim += 2.4 * dt;

        if (authority && state) {
            const s = state;
            const ts = s.cheats.slow ? 0.35 : 1;
            const simActive = s.phase === "aim" || s.phase === "flight" || s.phase === "settle";
            if (simActive) {
                simulate(s, dt);
                if (s.proj) flightStep(s, dt, ts);
                if (s.phase === "aim") {
                    if (vs && !s.cheats.freeze) {
                        s.turnT -= dt * ts;
                        if (s.turnT <= 0) {
                            notice(s, nameOf(s.turn) + " timed out");
                            passTurn(s);
                        }
                    }
                    if (vsBot && s.turn === 1 && s.phase === "aim") {
                        s.botT -= dt;
                        if (s.botT <= 0) botAct(s);
                    }
                } else if (s.phase === "settle") {
                    s.settleT -= dt;
                    const magnets = s.balls.some(function (b) { return b.magnet; });
                    if (s.settleT <= 0 && (!magnets || s.settleT <= -1.2)) passTurn(s);
                }
                if (!s.balls.length && !s.queue.length && !s.proj) levelCleared(s);
                else if (s.balls.length && s.balls[0].d >= HOLE_D) endMatch(s, "drain");
            } else if (s.phase === "clear") {
                s.clearT -= dt;
                if (s.clearT <= 0) freshLevel(s, s.level + 1);
            }
            if (online && room.isHost) {
                pubAcc += dt;
                if (s.rev !== lastPubRev || ((simActive || s.phase === "clear") && pubAcc >= 0.1)) {
                    pubAcc = 0;
                    lastPubRev = s.rev;
                    pushState(s);
                }
            }
        }
        renderFrame();
    }

    /* ---------- rendering ---------- */
    function viewState() {
        if (!state) return null;
        if (authority) return state;
        /* guest: dead-reckon between 10 Hz snapshots for smooth motion */
        const s = state;
        const moving = s.phase === "aim" || s.phase === "flight" || s.phase === "settle";
        const ts = s.cheats.slow ? 0.35 : 1;
        const el = Math.min(0.35, Math.max(0, (performance.now() - snapAt) / 1000));
        const k = s.cheats.freeze || !moving ? 0 : el * ts;
        const balls = s.balls.map(function (b) {
            return { c: b.c, d: Math.min(HOLE_D + 20, b.d + b.v * k), v: b.v, spin: b.spin + (b.v * k) / R, magnet: b.magnet };
        });
        const proj = s.proj ? {
            x: s.proj.x + s.proj.vx * FSPEED * k, y: s.proj.y + s.proj.vy * FSPEED * k,
            vx: s.proj.vx, vy: s.proj.vy, c: s.proj.c, owner: s.proj.owner, spin: s.proj.spin || 0,
        } : null;
        return Object.assign({}, s, { balls: balls, proj: proj, turnT: Math.max(0, s.turnT - el) });
    }

    function ballSvg(x, y, c, r, spin) {
        if (c === WILD) {
            let out = '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="#eef2ff" stroke="#0a0f1e" stroke-width="1.5"/>';
            for (let i = 0; i < 3; i++) {
                const a = spin + (i * Math.PI * 2) / 3;
                out += '<circle cx="' + (x + Math.cos(a) * r * 0.5).toFixed(1) + '" cy="' + (y + Math.sin(a) * r * 0.5).toFixed(1) + '" r="' + (r * 0.22).toFixed(1) + '" fill="' + COLORS[i] + '"/>';
            }
            return out;
        }
        const hx = x + Math.cos(spin) * r * 0.42, hy = y + Math.sin(spin) * r * 0.42;
        return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + COLORS[c] + '" stroke="#0a0f1e" stroke-width="1.5"/>' +
            '<circle cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" r="' + (r * 0.26).toFixed(1) + '" fill="#ffffff" opacity=".45"/>';
    }

    function renderTrack() {
        const d = "M" + PATH.pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("L");
        trackG.innerHTML =
            '<path d="' + d + '" fill="none" stroke="#141c33" stroke-width="' + (S + 6) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="' + d + '" fill="none" stroke="#2b3a63" stroke-width="1.5" stroke-dasharray="3 9"/>' +
            '<circle cx="' + START.x.toFixed(1) + '" cy="' + START.y.toFixed(1) + '" r="' + (R + 3) + '" fill="none" stroke="#2b3a63" stroke-width="1.5"/>' +
            '<g class="mb-drain"><circle class="mb-drainring" cx="' + HOLE.x.toFixed(1) + '" cy="' + HOLE.y.toFixed(1) + '" r="18" fill="#05070f" stroke="#3a4666" stroke-width="2.5"/>' +
            '<circle cx="' + HOLE.x.toFixed(1) + '" cy="' + HOLE.y.toFixed(1) + '" r="6" fill="#0d1426" stroke="#3a4666" stroke-width="1.5"/></g>';
    }

    function renderChain(s, pts) {
        if (!s) { chainG.innerHTML = ""; return; }
        let out = "";
        for (let i = 0; i < s.balls.length; i++) {
            out += ballSvg(pts[i].x, pts[i].y, s.balls[i].c, R, s.balls[i].spin);
        }
        chainG.innerHTML = out;
    }

    function predictHit(s, pts) {
        const dx = Math.cos(aim), dy = Math.sin(aim);
        for (let d = 30; d < 560; d += 6) {
            const x = CX + dx * d, y = CY + dy * d;
            for (let i = 0; i < pts.length; i++) {
                const ddx = x - pts[i].x, ddy = y - pts[i].y;
                if (ddx * ddx + ddy * ddy < (2 * R - 3) * (2 * R - 3)) {
                    return { x: x, y: y, bx: pts[i].x, by: pts[i].y };
                }
            }
        }
        return null;
    }

    function renderShot(s, pts) {
        if (!s) { shotG.innerHTML = ""; return; }
        let out = "";
        if (s.proj) out += ballSvg(s.proj.x, s.proj.y, s.proj.c, R, s.proj.spin || 0);
        const active = s.phase === "aim";
        const myTurn = !vs || s.turn === playerIndex;
        const accent = accentOf(s.turn);
        const sh = s.shots[s.turn] || s.shots[0];
        const curC = s.cheats.wild ? WILD : sh.cur;
        const nextC = s.cheats.wild ? WILD : sh.next;
        let endX = CX + Math.cos(aim) * 108, endY = CY + Math.sin(aim) * 108;
        let target = null;
        if (s.cheats.assist) {
            target = predictHit(s, pts);
            if (target) { endX = target.x; endY = target.y; }
            else { endX = CX + Math.cos(aim) * 300; endY = CY + Math.sin(aim) * 300; }
        }
        out += '<line x1="' + (CX + Math.cos(aim) * 36).toFixed(1) + '" y1="' + (CY + Math.sin(aim) * 36).toFixed(1) +
            '" x2="' + endX.toFixed(1) + '" y2="' + endY.toFixed(1) +
            '" stroke="' + (myTurn && active ? accent : "#94a3b8") + '" stroke-opacity="' + (myTurn && active ? ".55" : ".18") +
            '" stroke-width="1.5" stroke-dasharray="4 8"/>';
        if (target) {
            out += '<circle cx="' + target.bx.toFixed(1) + '" cy="' + target.by.toFixed(1) + '" r="' + (R + 4) +
                '" fill="none" stroke="' + accent + '" stroke-width="1.5" stroke-dasharray="3 4"/>';
        }
        out += '<line x1="' + (CX + Math.cos(aim) * 12).toFixed(1) + '" y1="' + (CY + Math.sin(aim) * 12).toFixed(1) +
            '" x2="' + (CX + Math.cos(aim) * 30).toFixed(1) + '" y2="' + (CY + Math.sin(aim) * 30).toFixed(1) +
            '" stroke="#3a4666" stroke-width="8" stroke-linecap="round"/>';
        out += '<circle cx="' + CX + '" cy="' + CY + '" r="16" fill="#0d1426" stroke="' + accent + '" stroke-width="2"/>';
        out += ballSvg(CX, CY, curC, 9.5, 0);
        out += ballSvg(CX - Math.cos(aim) * 27, CY - Math.sin(aim) * 27, nextC, 6.5, 0);
        shotG.innerHTML = out;
    }

    function renderHud(s) {
        levelEl.textContent = s ? s.level + 1 : 1;
        leftEl.textContent = s ? s.balls.length + s.queue.length : 0;
        let ph = "";
        if (s) {
            const order = vs ? s.slots : [0];
            for (const actor of order) {
                const slot = slotOf(actor);
                const acc = ACCENTS[slot >= 0 ? slot : 0];
                const isActive = vs && s.phase !== "end" && s.turn === actor;
                const you = actor === playerIndex;
                ph += '<div class="mb-pill"' + (isActive ? ' style="border-color:' + acc + ';color:' + acc + '"' : "") + ">" +
                    '<i style="background:' + acc + '"></i>' +
                    "<span>" + esc(nameOf(actor)) + (you ? ' <span class="you">you</span>' : "") + "</span>" +
                    "<b>" + s.scores[actor] + "</b></div>";
            }
        }
        playersEl.innerHTML = ph;
        if (s && vs && s.phase === "aim") {
            timerWrap.style.visibility = "visible";
            timerEl.style.width = Math.max(0, Math.min(100, (s.turnT / TURN_TIME) * 100)) + "%";
            timerEl.style.background = accentOf(s.turn);
        } else {
            timerWrap.style.visibility = "hidden";
        }
        let st = "Ready";
        if (!s) st = online ? "Waiting for host..." : "Ready";
        else if (s.phase === "end") st = s.result && s.result.kind === "drain" ? "Drain reached" : "Chain cleared";
        else if (s.phase === "clear") st = "Level " + (s.level + 2);
        else if (s.phase === "aim") st = !vs ? "Your turn" : s.turn === playerIndex ? "Your turn" : vsBot ? "Bot is aiming..." : "Opponent's turn";
        else st = "...";
        statusEl.textContent = st;
        const danger = Boolean(s && s.balls.length && HOLE_D - s.balls[0].d < 150);
        svgEl.classList.toggle("mb-danger", danger);
        cheatsBtn.hidden = !canManage(playerIndex);
        restartBtn.hidden = !canManage(playerIndex);
        const canFire = Boolean(s && s.phase === "aim" && (!vs || s.turn === playerIndex));
        touchEl.querySelectorAll("button").forEach(function (b) { b.classList.toggle("off", !canFire); });
    }

    function renderCheatPanel(s) {
        const allowed = canManage(playerIndex);
        cheatPanel.hidden = !allowed || !cheatsOpen || !s;
        cheatsBtn.classList.toggle("on", Boolean(s && (s.cheats.freeze || s.cheats.slow || s.cheats.wild || s.cheats.assist)));
        if (!s) return;
        cheatPanel.querySelectorAll("[data-toggle]").forEach(function (row) {
            row.classList.toggle("on", Boolean(s.cheats[row.dataset.toggle]));
        });
    }

    function renderOverlay(s) {
        if (!s || s.phase !== "end") { overEl.hidden = true; lastOverKey = ""; return; }
        const key = s.matchId + ":" + s.rev;
        if (key === lastOverKey) return;
        lastOverKey = key;
        const r = s.result || { kind: "clear", winner: -1 };
        let title, sub;
        if (!vs) {
            title = r.kind === "clear" ? "Cleared" : "Drain reached";
            sub = r.kind === "clear" ? "All 3 chains cleared." : "The chain reached the drain.";
        } else {
            title = r.winner === -1 ? "Draw" : nameOf(r.winner) + " wins";
            sub = r.kind === "drain" ? "The chain reached the drain." : "All 3 chains cleared.";
        }
        let bestLine = "";
        const myScore = s.scores[playerIndex] || 0;
        try {
            const prev = Number(localStorage.getItem(META.bestKey) || 0);
            if (!s.cheated && myScore > prev) localStorage.setItem(META.bestKey, String(myScore));
            const best = Math.max(prev, s.cheated ? 0 : myScore);
            if (best > 0) bestLine = '<div class="mb-best">Best ' + best + (s.cheated ? " - cheats used" : "") + "</div>";
        } catch (err) { /* storage unavailable */ }
        let scores = "";
        const order = vs ? s.slots : [0];
        for (const actor of order) {
            scores += "<div><span>" + esc(nameOf(actor)) + (actor === playerIndex ? " (you)" : "") +
                "</span><b>" + s.scores[actor] + "</b></div>";
        }
        const btn = canManage(playerIndex)
            ? '<button class="mb-btn" type="button" data-act="again">Play again</button>'
            : '<div class="mb-wait">Waiting for host...</div>';
        overEl.innerHTML = '<div class="mb-card"><h3>' + esc(title) + '</h3><p class="sub">' + esc(sub) +
            '</p><div class="mb-scores">' + scores + "</div>" + bestLine + btn + "</div>";
        overEl.hidden = false;
    }

    function showToast(text) {
        toastEl.textContent = text;
        toastEl.classList.add("show");
        if (toastTimer) { clearTimeout(toastTimer); timers.delete(toastTimer); }
        toastTimer = later(function () { toastEl.classList.remove("show"); toastTimer = null; }, 1800);
    }

    function burst(e) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
        el.setAttribute("pointer-events", "none");
        const col = e.c === WILD ? "#eef2ff" : (COLORS[e.c] || "#eef2ff");
        let inner = '<g class="mb-pop">';
        const n = e.big ? 8 : 6;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            inner += '<circle cx="' + (e.x + Math.cos(a) * 18).toFixed(1) + '" cy="' + (e.y + Math.sin(a) * 18).toFixed(1) +
                '" r="' + (e.big ? 5 : 3.5) + '" fill="' + col + '"/>';
        }
        inner += "</g>";
        if (e.score > 0) {
            inner += '<text class="mb-rise" x="' + e.x.toFixed(1) + '" y="' + (e.y - 16).toFixed(1) +
                '" text-anchor="middle" fill="' + accentOf(e.owner) + '">+' + e.score + "</text>";
        }
        el.innerHTML = inner;
        fxG.appendChild(el);
        later(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 850);
    }

    function renderFrame() {
        const s = viewState();
        if (state) {
            if (state.matchId !== lastMatchId) {
                lastMatchId = state.matchId;
                lastFxId = 0;
                lastNoticeId = 0;
                lastOverKey = "";
                fxG.innerHTML = "";
            }
            for (const e of state.fx) {
                if (e.id > lastFxId) { lastFxId = e.id; burst(e); }
            }
            if (state.notice && state.notice.id > lastNoticeId) {
                lastNoticeId = state.notice.id;
                showToast(state.notice.text);
            }
        }
        const pts = s ? s.balls.map(function (b) { return posAt(PATH, b.d); }) : [];
        renderChain(s, pts);
        renderShot(s, pts);
        renderHud(s);
        renderOverlay(s);
        renderCheatPanel(s);
    }

    function render() { renderFrame(); }

    /* ---------- input ---------- */
    function toBoard(e) {
        const r = svgEl.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    }
    function setAimFromEvent(e) {
        const p = toBoard(e);
        aim = Math.atan2(p.y - CY, p.x - CX);
    }
    function onBoardDown(e) {
        if (e.button === 2) { submitAction({ type: "swap" }); return; }
        if (e.pointerType === "mouse" && e.button !== 0) return;
        boardPointer = e.pointerId;
        try { svgEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        setAimFromEvent(e);
        e.preventDefault();
    }
    function onBoardMove(e) {
        if (e.pointerType === "mouse" || boardPointer === e.pointerId) setAimFromEvent(e);
    }
    function onBoardUp(e) {
        if (boardPointer !== e.pointerId) return;
        boardPointer = null;
        setAimFromEvent(e);
        submitAction({ type: "fire", angle: aim });
    }
    function onBoardCancel(e) {
        if (boardPointer === e.pointerId) boardPointer = null;
    }
    function onCtx(e) { e.preventDefault(); }

    function onVirtualDown(e) {
        const b = e.target.closest("[data-v]");
        if (!b) return;
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        const v = b.dataset.v;
        if (v === "left") rotL = true;
        else if (v === "right") rotR = true;
        else if (v === "fire") submitAction({ type: "fire", angle: aim });
        else if (v === "swap") submitAction({ type: "swap" });
    }
    function onVirtualUp(e) {
        const b = e.target.closest("[data-v]");
        if (!b) return;
        if (b.dataset.v === "left") rotL = false;
        if (b.dataset.v === "right") rotR = false;
    }
    function onVirtualLeave() { rotL = false; rotR = false; }

    function onKeyDown(e) {
        if (destroyed) return;
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.code === "ArrowLeft" || e.code === "KeyA") { e.preventDefault(); rotL = true; }
        else if (e.code === "ArrowRight" || e.code === "KeyD") { e.preventDefault(); rotR = true; }
        else if (e.code === "Space") { e.preventDefault(); if (!e.repeat) submitAction({ type: "fire", angle: aim }); }
        else if (e.code === "KeyS") { e.preventDefault(); if (!e.repeat) submitAction({ type: "swap" }); }
        else if (e.code === "KeyC") { if (!e.repeat && canManage(playerIndex)) { cheatsOpen = !cheatsOpen; renderCheatPanel(state); } }
        else if (e.code === "KeyR") { if (!e.repeat && canManage(playerIndex)) submitAction({ type: "restart" }); }
        else if (e.code === "Escape") { cheatsOpen = false; renderCheatPanel(state); }
    }
    function onKeyUp(e) {
        if (e.code === "ArrowLeft" || e.code === "KeyA") rotL = false;
        if (e.code === "ArrowRight" || e.code === "KeyD") rotR = false;
    }
    function onBlur() { rotL = false; rotR = false; }

    function handleClick(event) {
        if (event.target.closest("[data-exit]")) { onExit(); return; }
        if (event.target.closest('[data-act="again"]')) { submitAction({ type: "restart" }); return; }
        if (event.target.closest("[data-cheatsbtn]")) { cheatsOpen = !cheatsOpen; renderCheatPanel(state); return; }
        if (event.target.closest("[data-cheatclose]")) { cheatsOpen = false; renderCheatPanel(state); return; }
        if (event.target.closest("[data-restart]")) { submitAction({ type: "restart" }); return; }
        const tog = event.target.closest("[data-toggle]");
        if (tog && state) {
            submitAction({ type: "cheat", key: tog.dataset.toggle, on: !state.cheats[tog.dataset.toggle] });
            return;
        }
        const cb = event.target.closest("[data-cheat]");
        if (cb) { submitAction({ type: "cheat", key: cb.dataset.cheat }); }
    }

    /* ---------- init ---------- */
    function sub(fn) {
        try { const u = fn(); if (typeof u === "function") unsubs.push(u); }
        catch (err) { console.warn(err); }
    }

    renderTrack();
    if (online) {
        sub(function () {
            return room.onRoom(function (next) {
                roomData = next;
                if (room.isHost && state) {
                    const gn = guestName();
                    if (gn !== "Guest" && state.names[1] !== gn) { state.names[1] = gn; state.rev++; }
                }
                render();
            });
        });
        if (room.isHost) {
            state = freshState();
            publish();
            sub(function () { return room.onAction(function (action) { applyAction(action, 1); }); });
        } else {
            sub(function () {
                return room.onState(function (next) {
                    if (!next) return;
                    state = next;
                    snapAt = performance.now();
                    render();
                });
            });
        }
    } else {
        state = freshState();
    }

    root.addEventListener("click", handleClick);
    svgEl.addEventListener("pointerdown", onBoardDown);
    svgEl.addEventListener("pointermove", onBoardMove);
    svgEl.addEventListener("pointerup", onBoardUp);
    svgEl.addEventListener("pointercancel", onBoardCancel);
    svgEl.addEventListener("contextmenu", onCtx);
    touchEl.addEventListener("pointerdown", onVirtualDown);
    touchEl.addEventListener("pointerup", onVirtualUp);
    touchEl.addEventListener("pointercancel", onVirtualLeave);
    touchEl.addEventListener("pointerleave", onVirtualLeave);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            destroyed = true;
            if (raf) cancelAnimationFrame(raf);
            raf = null;
            timers.forEach(function (id) { clearTimeout(id); });
            timers.clear();
            unsubs.forEach(function (u) { try { u(); } catch (err) { /* ignore */ } });
            root.removeEventListener("click", handleClick);
            svgEl.removeEventListener("pointerdown", onBoardDown);
            svgEl.removeEventListener("pointermove", onBoardMove);
            svgEl.removeEventListener("pointerup", onBoardUp);
            svgEl.removeEventListener("pointercancel", onBoardCancel);
            svgEl.removeEventListener("contextmenu", onCtx);
            touchEl.removeEventListener("pointerdown", onVirtualDown);
            touchEl.removeEventListener("pointerup", onVirtualUp);
            touchEl.removeEventListener("pointercancel", onVirtualLeave);
            touchEl.removeEventListener("pointerleave", onVirtualLeave);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        },
    };
}