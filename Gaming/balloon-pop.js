/* ==== GAME: balloon-pop.js ==== */
/* Balloon Pop — minimalist turn-based balloon duel.
   - AI mode  : you vs bot, random first turn.
   - Room mode: host-authoritative, random seat (P1/P2) + random first turn.
   - Levels are FIXED waves (no random generator), guaranteed solvable.
   - Rockets are decoys: clicking one explodes and costs a life. */

export const META = {
  id: "balloon-pop",
  name: "Balloon Pop",
  category: "kids",
  catLabel: "Kids",
  desc: "Pop only the balloons that match the target color before time ends.",
  art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="24" cy="17" rx="12" ry="15"/><path d="M24 32l-3.5 4.5h7L24 32z"/><path d="M24 37c-4 3 4 6 0 9"/></svg>`,
  bg: ["#7dd3fc", "#38bdf8"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;
    let disposed = false;

    /* Seat is randomized per match (requirement), so it is derived from
       canonical state instead of a fixed playerIndex. */
    const seat = () =>
        !online || !state ? 0 : room.isHost ? state.seats.host : 1 - state.seats.host;
    const authority = () => !online || room.isHost;

    /* ---------------- constants ---------------- */
    const COLORS = ["red", "blue", "yellow", "green", "purple"];
    const PALETTE = {
        red: { fill: "#ef4444", stroke: "#b91c1c" },
        blue: { fill: "#3b82f6", stroke: "#1d4ed8" },
        yellow: { fill: "#fbbf24", stroke: "#b45309" },
        green: { fill: "#22c55e", stroke: "#15803d" },
        purple: { fill: "#a855f7", stroke: "#7e22ce" },
    };
    const SIZES = {
        S: { r: 16, pts: 3, vy: 120 },
        M: { r: 24, pts: 2, vy: 100 },
        L: { r: 32, pts: 1, vy: 85 },
        XL: { r: 40, pts: 1, vy: 70 },
        R: { r: 26, pts: 0, vy: 110 }, /* rocket */
    };
    const TARGET = 20;          /* points to win */
    const LIVES = 3;
    const ROUNDS = 4;           /* turns per player */
    const TURN_MS = 16000;
    const SLOT_MS = 1300;       /* fixed spawn spacing inside a wave */
    const NS = "http://www.w3.org/2000/svg";
    const laneX = (l) => 60 + l * 60;
    const lifeMs = (b) => 760000 / b.vy;

    /* Fixed, hand-tuned waves. Each wave has >= 13 target points, so the
       match is always completable. No level randomness anywhere. */
    const WAVES = [
        {
            target: "red", items: [
                { lane: 1, color: "red", size: "L" }, { lane: 4, color: "blue", size: "M" },
                { lane: 6, color: "red", size: "S" }, { lane: 0, color: "green", size: "L" },
                { lane: 3, color: "red", size: "M" }, { lane: 5, rocket: true },
                { lane: 2, color: "red", size: "XL" }, { lane: 5, color: "yellow", size: "S" },
                { lane: 0, color: "red", size: "M" }, { lane: 6, color: "red", size: "S" },
                { lane: 1, rocket: true }, { lane: 3, color: "red", size: "M" },
            ]
        },
        {
            target: "blue", items: [
                { lane: 5, color: "blue", size: "M" }, { lane: 2, color: "red", size: "S" },
                { lane: 0, color: "blue", size: "L" }, { lane: 6, color: "yellow", size: "M" },
                { lane: 3, color: "blue", size: "S" }, { lane: 1, rocket: true },
                { lane: 4, color: "blue", size: "XL" }, { lane: 1, color: "purple", size: "S" },
                { lane: 6, color: "blue", size: "M" }, { lane: 0, color: "blue", size: "S" },
                { lane: 5, rocket: true }, { lane: 2, color: "blue", size: "L" },
            ]
        },
        {
            target: "yellow", items: [
                { lane: 3, color: "yellow", size: "S" }, { lane: 0, color: "green", size: "M" },
                { lane: 5, color: "yellow", size: "M" }, { lane: 2, rocket: true },
                { lane: 1, color: "yellow", size: "L" }, { lane: 6, color: "blue", size: "S" },
                { lane: 4, color: "yellow", size: "XL" }, { lane: 2, color: "yellow", size: "S" },
                { lane: 0, color: "purple", size: "M" }, { lane: 6, color: "yellow", size: "M" },
                { lane: 4, rocket: true }, { lane: 1, color: "yellow", size: "L" },
            ]
        },
        {
            target: "green", items: [
                { lane: 2, color: "green", size: "L" }, { lane: 5, color: "purple", size: "M" },
                { lane: 0, color: "green", size: "S" }, { lane: 4, color: "red", size: "L" },
                { lane: 6, color: "green", size: "M" }, { lane: 3, rocket: true },
                { lane: 1, color: "green", size: "XL" }, { lane: 3, color: "blue", size: "S" },
                { lane: 5, color: "green", size: "S" }, { lane: 0, color: "green", size: "M" },
                { lane: 6, rocket: true }, { lane: 2, color: "green", size: "M" },
            ]
        },
    ];

    /* ---------------- client-only view state (never published) ---------------- */
    const view = {
        raf: 0, waveKey: -1, lastWave: -1, shownSec: -1,
        fx: [], texts: [],
        flashUntil: 0, shakeUntil: 0, toastUntil: 0,
        auto: false, reveal: false, cheatsOpen: false, lastAuto: 0,
        nextBotAt: 0,
    };
    const els = new Map(); /* balloon id -> <g> */

    /* ---------------- markup (minimalist, no tutorial text) ---------------- */
    root.innerHTML = `
<div class="game-app bp-wrap">
<style>
.bp-wrap{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--p1:#0ea5e9;--p2:#f43f5e;
  max-width:520px;margin:0 auto;color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.bp-wrap [hidden]{display:none!important}
.bp-wrap h2{margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em}
.bp-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.bp-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);
  background:#fff;border-radius:999px;padding:4px 10px;font-size:12px;color:var(--muted)}
.bp-chip b{color:var(--ink);font-weight:700}
.bp-dot{width:10px;height:10px;border-radius:999px;background:#e2e8f0}
.bp-timechip.bp-low{color:#ef4444;border-color:#fecaca}
.bp-timechip.bp-low b{color:#ef4444}
.bp-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.bp-card{--acc:var(--p1);border:1px solid var(--line);border-radius:12px;background:#fff;
  padding:8px 10px;transition:border-color .2s,box-shadow .2s}
.bp-card.s1{--acc:var(--p2)}
.bp-card.active{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.bp-name{display:flex;justify-content:space-between;align-items:center;gap:6px;
  font-size:11.5px;font-weight:600;color:var(--muted)}
.bp-lives{color:#ef4444;font-size:11px;letter-spacing:2px}
.bp-score{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:2px}
.bp-score small{font-size:11px;font-weight:500;color:var(--muted);margin-left:2px}
.bp-shieldtag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  color:#0ea5e9;border:1px solid #bae6fd;border-radius:999px;padding:1px 6px;margin-left:6px;vertical-align:3px}
.bp-bar{height:4px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-top:6px}
.bp-bar i{display:block;height:100%;width:0;background:var(--acc);border-radius:999px;transition:width .25s}
.bp-timebar{height:3px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-bottom:8px}
.bp-timebar i{display:block;height:100%;width:100%;background:#94a3b8;border-radius:999px}
.bp-stage{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#f8fafc}
.bp-board{display:block;width:100%;height:auto;touch-action:manipulation;
  user-select:none;-webkit-user-select:none}
.bp-bal{cursor:pointer}
.bp-glow{filter:drop-shadow(0 0 6px rgba(14,165,233,.85))}
.bp-badge circle{fill:#fff;stroke:#cbd5e1;stroke-width:1}
.bp-badge text{font-size:10px;font-weight:700;fill:#64748b;text-anchor:middle;dominant-baseline:central}
.bp-flame{animation:bp-flick .3s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center top}
@keyframes bp-flick{from{transform:scaleY(.7)}to{transform:scaleY(1.15)}}
.bp-shake{animation:bp-shake .3s ease-in-out}
@keyframes bp-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}55%{transform:translateX(7px)}80%{transform:translateX(-3px)}}
.bp-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:4;
  background:#0f172a;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;border-radius:999px;
  opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.bp-toast.show{opacity:.92}
.bp-cheats{position:absolute;top:10px;right:10px;z-index:6;width:212px;background:#fff;
  border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.14);padding:10px 12px}
.bp-cheats-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
  color:var(--muted);margin-bottom:4px}
.bp-cheat-row{display:flex;justify-content:space-between;align-items:center;gap:8px;
  padding:6px 0;font-size:12.5px;border-bottom:1px dashed var(--line)}
.bp-cheat-row:last-child{border-bottom:0}
.bp-mini{border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);
  font-size:11.5px;font-weight:600;padding:3px 10px;cursor:pointer}
.bp-mini.on{background:#0f172a;color:#fff;border-color:#0f172a}
.bp-over{position:absolute;inset:0;z-index:7;display:grid;place-items:center;
  background:rgba(248,250,252,.88);backdrop-filter:blur(3px)}
.bp-over-card{text-align:center;padding:20px}
.bp-over-card h3{margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.02em}
.bp-over-card p{margin:0 0 14px;font-size:13px;color:var(--muted)}
.bp-btn{border:0;border-radius:10px;background:#0f172a;color:#fff;font-size:13px;
  font-weight:600;padding:9px 18px;cursor:pointer}
.bp-pad{display:none;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px}
@media (pointer:coarse),(max-width:640px){.bp-pad{display:grid}}
.bp-pad button{height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;
  color:var(--muted);font-size:15px;font-weight:700;cursor:pointer}
.bp-pad button:active{background:#f1f5f9;transform:scale(.95)}
</style>
  <div class="game-intro">
    <div><h2>Balloon Pop</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="bp-hud">
      <span class="bp-chip" data-el="seat">P1</span>
      <span class="bp-chip"><span class="bp-dot" data-el="tdot"></span><b data-el="tword">RED</b></span>
      <span class="bp-chip" data-el="round">Round 1/${ROUNDS}</span>
      <span class="bp-chip bp-timechip" data-el="timechip"><b data-el="secs">–</b>s</span>
    </div>
    <div class="bp-cards">
      <div class="bp-card s0" data-card="0">
        <div class="bp-name"><span data-name>Player 1</span><span class="bp-lives" data-lives></span></div>
        <div class="bp-score"><span data-score>0</span><small>/${TARGET}</small><span class="bp-shieldtag" data-shield hidden>shield</span></div>
        <div class="bp-bar"><i data-fill></i></div>
      </div>
      <div class="bp-card s1" data-card="1">
        <div class="bp-name"><span data-name>Player 2</span><span class="bp-lives" data-lives></span></div>
        <div class="bp-score"><span data-score>0</span><small>/${TARGET}</small><span class="bp-shieldtag" data-shield hidden>shield</span></div>
        <div class="bp-bar"><i data-fill></i></div>
      </div>
    </div>
    <div class="bp-timebar"><i data-el="tfill"></i></div>
    <div class="bp-stage">
      <svg class="bp-board" data-el="svg" viewBox="0 0 480 640" aria-hidden="true"></svg>
      <div class="bp-toast" data-el="toast"></div>
      <div class="bp-cheats" data-el="cheats" hidden>
        <div class="bp-cheats-title">Cheats</div>
        <div class="bp-cheat-row"><span>Auto-pop</span><button type="button" class="bp-mini" data-cheat="auto">off</button></div>
        <div class="bp-cheat-row"><span>Highlight target</span><button type="button" class="bp-mini" data-cheat="reveal">off</button></div>
        <div class="bp-cheat-row"><span>Rocket shield</span><button type="button" class="bp-mini" data-cheat="shield">off</button></div>
        <div class="bp-cheat-row"><span>+5 points</span><button type="button" class="bp-mini" data-cheat="score">add</button></div>
        <div class="bp-cheat-row"><span>+1 life</span><button type="button" class="bp-mini" data-cheat="life">add</button></div>
        <div class="bp-cheat-row"><span>+10s turn time</span><button type="button" class="bp-mini" data-cheat="time">add</button></div>
      </div>
      <div class="bp-over" data-el="over" hidden>
        <div class="bp-over-card">
          <h3 data-el="ovtitle"></h3>
          <p data-el="ovreason"></p>
          <button type="button" class="bp-btn" data-act="restart">Rematch</button>
        </div>
      </div>
    </div>
    <div class="bp-pad">
      <button type="button" data-lane="1">1</button><button type="button" data-lane="2">2</button>
      <button type="button" data-lane="3">3</button><button type="button" data-lane="4">4</button>
      <button type="button" data-lane="5">5</button><button type="button" data-lane="6">6</button>
      <button type="button" data-lane="7">7</button>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="cheats">Cheats</button>
    <button class="game-action-button" type="button" data-act="restart">Restart</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const statusEl = $("[data-status]");
    const seatChip = $('[data-el="seat"]'), tdot = $('[data-el="tdot"]'), tword = $('[data-el="tword"]');
    const roundChip = $('[data-el="round"]'), timeChip = $('[data-el="timechip"]');
    const secsEl = $('[data-el="secs"]'), tfill = $('[data-el="tfill"]');
    const svgEl = $('[data-el="svg"]'), toastEl = $('[data-el="toast"]');
    const cheatsEl = $('[data-el="cheats"]'), overEl = $('[data-el="over"]');
    const ovTitle = $('[data-el="ovtitle"]'), ovReason = $('[data-el="ovreason"]');
    const cards = [0, 1].map((i) => {
        const c = $(`[data-card="${i}"]`);
        return {
            c, name: c.querySelector("[data-name]"), score: c.querySelector("[data-score]"),
            lives: c.querySelector("[data-lives]"), fill: c.querySelector("[data-fill]"),
            shield: c.querySelector("[data-shield]")
        };
    });

    /* ---------------- board scenery (minimal) ---------------- */
    let scenery =
        '<defs><linearGradient id="bp-sky" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f0f9ff"/><stop offset="1" stop-color="#ffffff"/>' +
        "</linearGradient></defs>" +
        '<rect width="480" height="640" fill="url(#bp-sky)"/>';
    for (let l = 0; l < 7; l++)
        scenery += `<text x="${laneX(l)}" y="630" font-size="11" font-weight="600" fill="#cbd5e1" text-anchor="middle">${l + 1}</text>`;
    svgEl.innerHTML =
        scenery +
        '<g data-el="layer"></g>' +
        '<rect data-el="flash" width="480" height="640" fill="#ef4444" opacity="0" pointer-events="none"/>';
    const layer = $('[data-el="layer"]');
    const flashRect = $('[data-el="flash"]');

    /* ---------------- state helpers ---------------- */
    function startTurn(s, waveNo) {
        const w = WAVES[waveNo % WAVES.length];
        const now = Date.now();
        s.waveNo = waveNo;
        s.target = w.target;
        s.turnEndsAt = now + TURN_MS;
        s.balloons = w.items.map((it, i) => {
            const id = waveNo * 100 + i;
            const size = it.rocket ? "R" : it.size;
            return {
                id, lane: it.lane, color: it.color || null, rocket: !!it.rocket, size,
                vy: SIZES[size].vy, bornAt: now + i * SLOT_MS,
                /* deterministic wobble -> identical motion on every client */
                amp: 6 + ((id * 7) % 9), freq: 0.7 + ((id * 13) % 10) / 10,
                phase: ((id * 37) % 628) / 100,
                popped: false, poppedAt: 0, poppedBy: -1, result: null, points: 0,
            };
        });
    }

    function freshState() {
        const s = {
            v: 1, phase: "play",
            seats: { host: online ? (Math.random() < 0.5 ? 0 : 1) : 0 }, /* random P1/P2 */
            first: Math.random() < 0.5 ? 0 : 1,                          /* random first turn */
            turn: 0, waveNo: 0, turnsTaken: [0, 0], target: WAVES[0].target,
            players: [
                { score: 0, lives: LIVES, shield: false },
                { score: 0, lives: LIVES, shield: false },
            ],
            balloons: [], turnEndsAt: 0, winner: null, reason: "",
        };
        s.turn = s.first;
        startTurn(s, 0);
        return s;
    }

    function checkEnd(s) {
        for (let i = 0; i < 2; i++) {
            if (s.players[i].lives <= 0) {
                s.phase = "over"; s.winner = 1 - i;
                s.reason = `Player ${i + 1} ran out of lives.`; return;
            }
            if (s.players[i].score >= TARGET) {
                s.phase = "over"; s.winner = i;
                s.reason = `Player ${i + 1} reached ${TARGET} points.`; return;
            }
        }
    }

    function advanceTurn() {
        if (!state || state.phase !== "play") return;
        state.turnsTaken[state.turn]++;
        if (state.turnsTaken[0] >= ROUNDS && state.turnsTaken[1] >= ROUNDS) {
            const a = state.players[0].score, b = state.players[1].score;
            state.phase = "over";
            state.winner = a === b ? -1 : a > b ? 0 : 1;
            state.reason = a === b
                ? `Both players finished with ${a} points.`
                : `Final score ${a} – ${b} after ${ROUNDS} rounds.`;
        } else {
            state.turn = 1 - state.turn;
            startTurn(state, state.waveNo + 1);
        }
        publish();
    }

    const posOf = (b, now) => {
        const age = (now - b.bornAt) / 1000;
        return {
            x: laneX(b.lane) + Math.sin(b.phase + b.freq * age) * b.amp,
            y: 690 - b.vy * age,
        };
    };
    function activeBalloons(now) {
        if (!state) return [];
        return state.balloons
            .filter((b) => !b.popped && now >= b.bornAt && now <= b.bornAt + lifeMs(b))
            .map((b) => ({ b, ...posOf(b, now) }));
    }
    const nameOf = (i) =>
        i === seat() ? playerName : online ? `Player ${i + 1}` : "Bot";

    /* ---------------- svg builders ---------------- */
    const badge = (dy, n) =>
        `<g class="bp-badge" transform="translate(0 ${-dy})"><circle r="9"/><text>${n}</text></g>`;

    function balloonSvg(b) {
        const p = PALETTE[b.color], r = SIZES[b.size].r;
        return (
            `<circle r="${r + 16}" fill="none" pointer-events="all"/>` +
            `<path d="M0 ${r + 5} C 9 ${r + 14} -7 ${r + 22} 2 ${r + 32}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>` +
            `<polygon points="${(-r * 0.22).toFixed(1)},${(r - 1).toFixed(1)} ${(r * 0.22).toFixed(1)},${(r - 1).toFixed(1)} 0,${(r + 7).toFixed(1)}" fill="${p.stroke}"/>` +
            `<ellipse rx="${(r * 0.82).toFixed(1)}" ry="${r}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.5"/>` +
            `<ellipse cx="${(-r * 0.3).toFixed(1)}" cy="${(-r * 0.35).toFixed(1)}" rx="${(r * 0.2).toFixed(1)}" ry="${(r * 0.32).toFixed(1)}" fill="#fff" opacity=".5"/>` +
            badge(r + 14, b.lane + 1)
        );
    }
    function rocketSvg(b) {
        return (
            '<circle r="36" fill="none" pointer-events="all"/>' +
            '<path class="bp-flame" d="M-6 16 Q0 30 6 16 Z" fill="#fb923c"/>' +
            '<path class="bp-flame" d="M-3 16 Q0 24 3 16 Z" fill="#fde047"/>' +
            '<path d="M-10 6 L-17 18 L-10 16 Z" fill="#64748b"/>' +
            '<path d="M10 6 L17 18 L10 16 Z" fill="#64748b"/>' +
            '<rect x="-10" y="-20" width="20" height="36" rx="9" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>' +
            '<path d="M-10 -18 Q0 -36 10 -18 Z" fill="#ef4444"/>' +
            '<circle cy="-6" r="4.5" fill="#f0f9ff" stroke="#64748b" stroke-width="2"/>' +
            badge(46, b.lane + 1)
        );
    }
    function burstSvg(r, fill) {
        let s = `<circle r="${(r * 0.45).toFixed(1)}" fill="${fill}"/>`;
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            s += `<line x1="${(Math.cos(a) * r * 0.55).toFixed(1)}" y1="${(Math.sin(a) * r * 0.55).toFixed(1)}" x2="${(Math.cos(a) * r * 1.3).toFixed(1)}" y2="${(Math.sin(a) * r * 1.3).toFixed(1)}" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>`;
        }
        return s;
    }
    function boomSvg() {
        let s = '<circle r="16" fill="#fde047"/>';
        for (let i = 0; i < 10; i++) {
            const a = (Math.PI * 2 * i) / 10;
            s += `<line x1="${(Math.cos(a) * 15).toFixed(1)}" y1="${(Math.sin(a) * 15).toFixed(1)}" x2="${(Math.cos(a) * 42).toFixed(1)}" y2="${(Math.sin(a) * 42).toFixed(1)}" stroke="${i % 2 ? "#ef4444" : "#f97316"}" stroke-width="6" stroke-linecap="round"/>`;
        }
        return s;
    }
    function popText(x, y, str, fill) {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", x.toFixed(1));
        t.setAttribute("y", y.toFixed(1));
        t.setAttribute("font-size", "20");
        t.setAttribute("font-weight", "700");
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", fill);
        t.setAttribute("pointer-events", "none");
        t.textContent = str;
        layer.appendChild(t);
        view.texts.push({ el: t, x, y, born: Date.now() });
    }

    /* ---------------- board sync + fx ---------------- */
    function clearBoard() {
        els.forEach((g) => g.remove()); els.clear();
        view.fx.forEach((f) => f.g.remove()); view.fx = [];
        view.texts.forEach((t) => t.el.remove()); view.texts = [];
        flashRect.setAttribute("opacity", "0");
    }

    function spawnPopFx(b, g, now) {
        const { x, y } = posOf(b, b.poppedAt);
        const r = SIZES[b.size].r;
        g.removeAttribute("data-bal");
        g.setAttribute("pointer-events", "none");
        let kind = "pop";
        if (b.result === "pop") {
            g.innerHTML = burstSvg(r, PALETTE[b.color].fill);
            popText(x, y - r - 12, `+${b.points}`, PALETTE[b.color].stroke);
        } else if (b.result === "oops") {
            kind = "oops";
            popText(x, y - r - 12, "-1", "#ef4444");
        } else if (b.result === "boom") {
            kind = "boom";
            g.innerHTML = boomSvg();
            popText(x, y - 40, "-\u2665", "#ef4444");
            view.flashUntil = now + 260;
            view.shakeUntil = now + 320;
        } else { /* shield */
            g.innerHTML = burstSvg(26, "#0ea5e9");
            popText(x, y - 40, "safe", "#0ea5e9");
        }
        view.fx.push({ g, x, y, born: now, kind });
    }

    function syncBalloons(now) {
        if (view.waveKey !== state.waveNo) {
            clearBoard();
            view.waveKey = state.waveNo;
        }
        for (const b of state.balloons) {
            let g = els.get(b.id);
            if (b.popped) {
                if (g) { spawnPopFx(b, g, now); els.delete(b.id); }
                continue;
            }
            const age = now - b.bornAt;
            if (age < 0 || age > lifeMs(b)) {
                if (g) { g.remove(); els.delete(b.id); }
                continue;
            }
            if (!g) {
                g = document.createElementNS(NS, "g");
                g.setAttribute("class", "bp-bal");
                g.setAttribute("data-bal", String(b.id));
                g.innerHTML = b.rocket ? rocketSvg(b) : balloonSvg(b);
                layer.appendChild(g);
                els.set(b.id, g);
            }
            const { x, y } = posOf(b, now);
            g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
            g.classList.toggle("bp-glow", view.reveal && !b.rocket && b.color === state.target);
        }
    }

    function updateFx(now) {
        for (let i = view.fx.length - 1; i >= 0; i--) {
            const f = view.fx[i], t = (now - f.born) / 320;
            if (t >= 1) { f.g.remove(); view.fx.splice(i, 1); continue; }
            let tr = `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`;
            if (f.kind === "oops")
                tr += ` translate(0 ${(70 * t).toFixed(1)}) scale(${Math.max(0.08, 1 - 0.8 * t).toFixed(3)})`;
            else
                tr += ` scale(${(f.kind === "boom" ? 0.6 + 1.6 * t : 0.55 + 1.15 * t).toFixed(3)})`;
            f.g.setAttribute("transform", tr);
            f.g.setAttribute("opacity", (1 - t).toFixed(3));
        }
        for (let i = view.texts.length - 1; i >= 0; i--) {
            const f = view.texts[i], t = (now - f.born) / 650;
            if (t >= 1) { f.el.remove(); view.texts.splice(i, 1); continue; }
            f.el.setAttribute("y", (f.y - 46 * t).toFixed(1));
            f.el.setAttribute("opacity", (1 - t).toFixed(3));
        }
        flashRect.setAttribute("opacity", (Math.max(0, view.flashUntil - now) / 260 * 0.35).toFixed(3));
        svgEl.classList.toggle("bp-shake", now < view.shakeUntil);
        toastEl.classList.toggle("show", now < view.toastUntil);
    }

    function updateTimer(now) {
        if (!state) return;
        const rem = Math.max(0, state.turnEndsAt - now);
        const s = Math.ceil(rem / 1000);
        if (s !== view.shownSec) {
            view.shownSec = s;
            secsEl.textContent = String(s);
            timeChip.classList.toggle("bp-low", s <= 5);
        }
        tfill.style.width = Math.min(100, (rem / TURN_MS) * 100) + "%";
    }

    /* ---------------- render (state -> DOM) ---------------- */
    function render() {
        if (!state) {
            statusEl.textContent = online ? "Waiting for host\u2026" : "Ready";
            return;
        }
        const me = seat();
        const accent = me === 0 ? "#0ea5e9" : "#f43f5e";
        seatChip.innerHTML = `You: <b>P${me + 1}</b>`;
        seatChip.style.borderColor = accent;
        tdot.style.background = PALETTE[state.target].fill;
        tword.textContent = state.target.toUpperCase();
        roundChip.textContent = `Round ${Math.min(ROUNDS, Math.floor(state.waveNo / 2) + 1)}/${ROUNDS}`;

        for (let i = 0; i < 2; i++) {
            const p = state.players[i], c = cards[i];
            c.name.textContent = i === me ? `${playerName} (You)` : online ? `Player ${i + 1}` : "Bot";
            c.score.textContent = String(p.score);
            c.fill.style.width = Math.min(100, (p.score / TARGET) * 100) + "%";
            c.lives.textContent = "\u2665".repeat(p.lives) + "\u2661".repeat(Math.max(0, LIVES - p.lives));
            c.shield.hidden = !p.shield;
            c.c.classList.toggle("active", state.phase === "play" && state.turn === i);
        }

        statusEl.textContent =
            state.phase === "over" ? "Finished"
                : state.turn === me ? "Your turn" + (view.auto ? " \u00b7 auto" : "")
                    : `${nameOf(state.turn)}'s turn`;

        overEl.hidden = state.phase !== "over";
        if (state.phase === "over") {
            ovTitle.textContent =
                state.winner === -1 ? "Draw" : state.winner === me ? "You win" : `${nameOf(state.winner)} wins`;
            ovReason.textContent = state.reason;
        }

        cheatsEl.hidden = !view.cheatsOpen;
        const setToggle = (key, on) => {
            const b = cheatsEl.querySelector(`[data-cheat="${key}"]`);
            b.textContent = on ? "on" : "off";
            b.classList.toggle("on", on);
        };
        setToggle("auto", view.auto);
        setToggle("reveal", view.reveal);
        setToggle("shield", state.players[me].shield);

        if (view.lastWave !== state.waveNo) {
            view.lastWave = state.waveNo;
            const who = state.turn === me ? "You" : nameOf(state.turn);
            toastEl.textContent =
                state.waveNo === 0
                    ? `${who} go${state.turn === me ? "" : "es"} first`
                    : state.turn === me ? "Your turn" : `${who}'s turn`;
            view.toastUntil = Date.now() + 1600;
            if (!online && state.turn === 1) view.nextBotAt = Date.now() + 1000;
        }
    }

    function publish() {
        render();
        /* Only the host writes canonical state to Firebase. */
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    /* ---------------- canonical mutations (host / AI only) ---------------- */
    function applyAction(action, actor) {
        if (disposed || !state || !authority()) return;
        if (actor !== 0 && actor !== 1) return;
        if (!action || typeof action.type !== "string") return;

        if (action.type === "restart") {
            state = freshState(); /* re-randomizes seats + first turn */
            clearBoard();
            view.waveKey = -1;
            view.lastWave = -1;
            publish();
            return;
        }
        if (state.phase !== "play") return;

        if (action.type === "pop") {
            if (actor !== state.turn) return;
            const b = state.balloons.find((x) => x.id === action.id);
            if (!b || b.popped) return;
            const now = Date.now();
            if (now < b.bornAt || now > b.bornAt + lifeMs(b) + 300) return;
            b.popped = true; b.poppedAt = now; b.poppedBy = actor;
            const p = state.players[actor];
            if (b.rocket) {
                if (p.shield) { b.result = "shield"; b.points = 0; }
                else { p.lives = Math.max(0, p.lives - 1); b.result = "boom"; b.points = 0; }
            } else if (b.color === state.target) {
                b.points = SIZES[b.size].pts;
                p.score += b.points;
                b.result = "pop";
            } else {
                p.score = Math.max(0, p.score - 1);
                b.result = "oops"; b.points = -1;
            }
            checkEnd(state);
            publish();
        } else if (action.type === "cheat") {
            const p = state.players[actor];
            switch (action.key) {
                case "shield": p.shield = !p.shield; break;
                case "score": p.score += 5; checkEnd(state); break;
                case "life": p.lives = Math.min(5, p.lives + 1); break;
                case "time":
                    if (actor !== state.turn) return;
                    state.turnEndsAt += 10000;
                    break;
                default: return;
            }
            publish();
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, seat());
    }

    /* ---------------- bot + auto-pop cheat ---------------- */
    function botStep(now) {
        if (!state || state.phase !== "play" || state.turn !== 1) return;
        if (now < view.nextBotAt) return;
        const alive = activeBalloons(now);
        if (!alive.length) { view.nextBotAt = now + 400; return; }
        const targets = alive.filter((o) => !o.b.rocket && o.b.color === state.target);
        const decoys = alive.filter((o) => !o.b.rocket && o.b.color !== state.target);
        const rockets = alive.filter((o) => o.b.rocket);
        const r = Math.random();
        let pick = null;
        if (r < 0.75 && targets.length) pick = targets[(Math.random() * targets.length) | 0];
        else if (r < 0.94 && decoys.length) pick = decoys[(Math.random() * decoys.length) | 0];
        else if (rockets.length) pick = rockets[0];
        if (!pick) pick = targets[0] || decoys[0] || alive[0];
        applyAction({ type: "pop", id: pick.b.id }, 1);
        view.nextBotAt = now + 900 + Math.random() * 900;
    }

    function autoStep(now) {
        if (!view.auto || !state || state.phase !== "play" || state.turn !== seat()) return;
        if (now - view.lastAuto < 420) return;
        const t = activeBalloons(now)
            .filter((o) => !o.b.rocket && o.b.color === state.target)
            .sort((a, b) => a.y - b.y)[0];
        if (t) { submitAction({ type: "pop", id: t.b.id }); view.lastAuto = now; }
    }

    /* ---------------- frame loop ---------------- */
    function tick() {
        if (disposed) return;
        const now = Date.now();
        if (state) {
            if (authority() && state.phase === "play") {
                const allDone = state.balloons.length > 0 &&
                    state.balloons.every((b) => b.popped || now > b.bornAt + lifeMs(b));
                if (now >= state.turnEndsAt || allDone) advanceTurn();
                if (!online) botStep(now);
            }
            syncBalloons(now);
            autoStep(now);
            updateFx(now);
            updateTimer(now);
        }
        view.raf = requestAnimationFrame(tick);
    }

    /* ---------------- input: mouse / touch / keyboard / virtual pad ---------------- */
    function lanePop(n) {
        if (!state || state.phase !== "play" || state.turn !== seat()) return;
        const pick = activeBalloons(Date.now())
            .filter((o) => o.b.lane === n - 1)
            .sort((a, b) => a.y - b.y)[0]; /* highest balloon in that lane */
        if (pick) submitAction({ type: "pop", id: pick.b.id });
    }

    function onPointer(e) {
        if (!state || state.phase !== "play" || state.turn !== seat()) return;
        const g = e.target && e.target.closest ? e.target.closest("[data-bal]") : null;
        if (!g) return;
        e.preventDefault();
        submitAction({ type: "pop", id: Number(g.getAttribute("data-bal")) });
    }

    function onKey(e) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (k >= "1" && k <= "7") lanePop(Number(k));
        else if (k === "c" || k === "C") { view.cheatsOpen = !view.cheatsOpen; render(); }
        else if (k === "r" || k === "R") submitAction({ type: "restart" });
        else if (k === "Enter" && state && state.phase === "over") submitAction({ type: "restart" });
        else if (k === "Escape" && view.cheatsOpen) { view.cheatsOpen = false; render(); }
    }

    function handleClick(event) {
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const act = t.closest("[data-act]");
        if (act) {
            if (act.dataset.act === "restart") submitAction({ type: "restart" });
            else if (act.dataset.act === "cheats") { view.cheatsOpen = !view.cheatsOpen; render(); }
            return;
        }
        const ch = t.closest("[data-cheat]");
        if (ch) {
            const k = ch.dataset.cheat;
            if (k === "auto") { view.auto = !view.auto; render(); }
            else if (k === "reveal") { view.reveal = !view.reveal; render(); }
            else submitAction({ type: "cheat", key: k });
            return;
        }
        const lane = t.closest("[data-lane]");
        if (lane) lanePop(Number(lane.dataset.lane));
    }

    root.addEventListener("click", handleClick);
    svgEl.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);

    /* ---------------- boot: online (host/guest) or local AI ---------------- */
    const unsubs = [];
    const sub = (u) => { if (typeof u === "function") unsubs.push(u); };

    if (online) {
        sub(room.onRoom((nextRoom) => { roomData = nextRoom; if (!disposed) render(); }));
        if (room.isHost) {
            state = freshState();
            publish();
            /* guest occupies the opposite randomized seat */
            sub(room.onAction((action) => applyAction(action, 1 - state.seats.host)));
        } else {
            sub(room.onState((nextState) => { if (disposed) return; state = nextState; render(); }));
        }
    } else {
        state = freshState(); /* random first turn: you or bot */
        render();
    }
    view.raf = requestAnimationFrame(tick);

    return {
        destroy() {
            disposed = true;
            cancelAnimationFrame(view.raf);
            root.removeEventListener("click", handleClick);
            svgEl.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
            clearBoard();
        },
    };
}