/*
 * airport-manager.js — versi template mount().
 * Daftarkan metadata + path modul ini di GAMES pada app.js.
 *
 * Mode:
 *  - AI   : kamu vs bot, giliran bergantian, yang pertama jalan diacak.
 *  - Room : host otoritatif (simulasi + publish state), tamu kirim action.
 *           Slot pemain (0/1) diacak tiap game oleh host.
 */

export const META = {
    id: "airport-manager",
    name: "Airport Manager",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Clear planes to land, manage runways and gates, handle 10 flights.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 4v40M24 10l-9 7M24 10l9 7M24 30l-7 6M24 30l7 6M6 24h36"/></svg>`,
    bg: ["#a5b4fc", "#6366f1"],
};

/* ============================ ENGINE (murni) ============================ */

const MAX_DELAYS = 3;
const MAX_HOLDING = 5;
const TURN_MS = 12000;          /* batas giliran, lewat = otomatis skip */
const APPROACH_SPEED = 190;
const TAXI_SPEED = 80;
const TAKEOFF_SPEED = 240;
const ROLL_EXIT_X = 910;        /* di luar viewBox 880 -> pesawat keluar layar */

/* Geometri top-down 2D (viewBox 880x520): HOLD di atas, terminal + gate
   di tengah, dua runway horizontal di bawah, taxiway vertikal penghubung. */
const RUNWAYS = [
    { id: 0, x0: 80, x1: 800, y: 400 },
    { id: 1, x0: 80, x1: 800, y: 458 },
];
const GATES = [
    { id: 0, x: 220, y: 300 },
    { id: 1, x: 440, y: 300 },
    { id: 2, x: 660, y: 300 },
];
const HOLD = { cx: 440, cy: 120, r0: 66, r1: 104, speed: 0.7 };
const CALLSIGNS = ["TZ", "GA", "JT", "QZ", "ID", "SJ"];

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeFlight(state, spec) {
    const used = new Set(
        state.planes.filter((p) => p.phase === "holding").map((p) => p.slot),
    );
    let slot = 0;
    while (used.has(slot) && slot < MAX_HOLDING - 1) slot++;
    const id = state.nextId++;
    const ang = slot * 1.256 + (id % 7) * 0.13;
    const ring = slot < 3 ? HOLD.r0 : HOLD.r1;
    return {
        id,
        callsign: spec.callsign,
        phase: "holding", /* holding|cleared|approach|roll|taxi|unload|ready|takeoff|divert|gone */
        slot,
        ang,
        x: HOLD.cx + ring * Math.cos(ang),
        y: HOLD.cy + ring * Math.sin(ang),
        patience: spec.patience,
        patienceMax: spec.patience,
        unloadMs: spec.unloadMs,
        runway: -1,
        gate: -1,
        unloadT: 0,
        taxi: null,
        speed: 0,
        clearedBy: -1,
    };
}

function makeState(level, hostSlot, firstTurn) {
    return {
        v: 1,
        seed: level.seed,
        code: level.code,
        total: level.total,
        queue: level.flights.map((f) => ({ ...f })),
        spawned: 0,
        planes: [],
        nextId: 1,
        time: 0,
        spawnT: level.flights[0].gap,
        handled: 0,
        diverted: 0,
        delays: 0,
        scores: [0, 0],
        turn: firstTurn,
        turnEndsAt: TURN_MS,
        hostSlot,
        cheats: { freeze: false, fast: false, slow: false },
        result: null, /* { reason: done|delays|collision|cheat, winner: 0|1|null } */
    };
}

function runwayBusy(state, rid, excludeId = -1) {
    return state.planes.some(
        (p) =>
            p.id !== excludeId &&
            p.runway === rid &&
            (p.phase === "cleared" || p.phase === "approach" ||
                p.phase === "roll" || p.phase === "takeoff"),
    );
}
function gateBusy(state, gid, excludeId = -1) {
    return state.planes.some(
        (p) =>
            p.id !== excludeId &&
            p.gate === gid &&
            (p.phase === "cleared" || p.phase === "approach" || p.phase === "roll" ||
                p.phase === "taxi" || p.phase === "unload" || p.phase === "ready"),
    );
}
function canClearLanding(state, planeId, runwayId) {
    const p = state.planes.find((q) => q.id === planeId);
    if (!p || p.phase !== "holding") return false;
    if (runwayId < 0 || runwayId >= RUNWAYS.length) return false;
    return !runwayBusy(state, runwayId, planeId);
}
function canAssignGate(state, planeId, gateId) {
    const p = state.planes.find((q) => q.id === planeId);
    if (!p || p.phase !== "holding") return false;
    if (gateId < 0 || gateId >= GATES.length) return false;
    return !gateBusy(state, gateId, planeId);
}
function tryClear(state, planeId, runwayId, gateId, actor) {
    if (!canClearLanding(state, planeId, runwayId)) return false;
    if (!canAssignGate(state, planeId, gateId)) return false;
    const p = state.planes.find((q) => q.id === planeId);
    p.runway = runwayId;
    p.gate = gateId;
    p.clearedBy = actor;
    p.phase = "cleared";
    return true;
}
function startTakeoff(p) {
    const g = GATES[p.gate], r = RUNWAYS[p.runway];
    p.phase = "takeoff";
    p.taxi = [{ x: g.x, y: r.y }, { x: ROLL_EXIT_X, y: r.y }];
    p.speed = TAXI_SPEED;
}
function scoreWinner(state) {
    const [a, b] = state.scores;
    return a > b ? 0 : b > a ? 1 : null;
}
function forceDepart(state, planeId, actor) {
    const p = state.planes.find((q) => q.id === planeId);
    if (!p || (p.phase !== "unload" && p.phase !== "ready")) return "no";
    if (runwayBusy(state, p.runway, p.id)) {
        state.result = { reason: "collision", winner: 1 - actor };
        return "collision";
    }
    startTakeoff(p);
    return "ok";
}
function advanceTurn(state) {
    state.turn = 1 - state.turn;
    state.turnEndsAt = state.time + TURN_MS;
}

function stepWorld(state, dtMs) {
    if (state.result) return;
    let dt = Math.min(dtMs, 120);
    if (state.cheats.slow) dt *= 0.5;
    const s = dt / 1000;
    state.time += dt;

    /* spawn dari antrean level; kalau stack penuh, tunda ( penerbangan tak hilang ) */
    state.spawnT -= dt;
    if (state.spawnT <= 0 && state.queue.length) {
        const holding = state.planes.filter((p) => p.phase === "holding").length;
        if (holding < MAX_HOLDING) {
            const spec = state.queue.shift();
            state.planes.push(makeFlight(state, spec));
            state.spawned++;
            state.spawnT += state.queue.length ? state.queue[0].gap : 0;
        } else {
            state.spawnT = 600;
        }
    }

    state.planes.forEach((p) => {
        if (p.phase === "holding") {
            p.ang += HOLD.speed * s;
            const ring = p.slot < 3 ? HOLD.r0 : HOLD.r1;
            p.x = HOLD.cx + ring * Math.cos(p.ang);
            p.y = HOLD.cy + ring * Math.sin(p.ang);
            if (!state.cheats.freeze) {
                p.patience -= dt;
                if (p.patience <= 0) {
                    p.phase = "divert";
                    state.delays++;
                    state.diverted++;
                }
            }
        } else if (p.phase === "cleared") {
            p.phase = "approach";
            p.speed = APPROACH_SPEED;
        } else if (p.phase === "approach") {
            const r = RUNWAYS[p.runway];
            const tx = r.x0 - 10, ty = r.y;
            const dx = tx - p.x, dy = ty - p.y;
            const d = Math.hypot(dx, dy);
            const step = p.speed * s;
            if (d <= step || d < 1) {
                p.x = tx; p.y = ty;
                p.phase = "roll";
                p.speed = APPROACH_SPEED;
            } else {
                p.x += (dx / d) * step;
                p.y += (dy / d) * step;
            }
        } else if (p.phase === "roll") {
            const r = RUNWAYS[p.runway];
            p.x += p.speed * s;
            p.speed = Math.max(TAXI_SPEED, p.speed - 90 * s);
            const exitX = Math.max(r.x0 + 110, Math.min(r.x1 - 20, GATES[p.gate].x + 40));
            if (p.x >= exitX) {
                const g = GATES[p.gate];
                p.phase = "taxi";
                p.taxi = [{ x: g.x, y: r.y }, { x: g.x, y: g.y + 8 }];
                p.speed = TAXI_SPEED;
            }
        } else if (p.phase === "taxi" || p.phase === "takeoff") {
            const wp = p.taxi && p.taxi[0];
            if (wp) {
                const dx = wp.x - p.x, dy = wp.y - p.y;
                const d = Math.hypot(dx, dy);
                const step = p.speed * s;
                if (d <= step || d < 1) {
                    p.x = wp.x; p.y = wp.y;
                    p.taxi.shift();
                    if (p.phase === "takeoff")
                        p.speed = Math.min(TAKEOFF_SPEED, p.speed + 300 * s);
                    if (!p.taxi.length) {
                        if (p.phase === "taxi") {
                            p.phase = "unload";
                            p.unloadT = 0;
                        } else {
                            p.phase = "gone";
                            state.handled++;
                            if (p.clearedBy === 0 || p.clearedBy === 1)
                                state.scores[p.clearedBy]++;
                        }
                    }
                } else {
                    p.x += (dx / d) * step;
                    p.y += (dy / d) * step;
                    if (p.phase === "takeoff")
                        p.speed = Math.min(TAKEOFF_SPEED, p.speed + 300 * s);
                }
            }
        } else if (p.phase === "unload") {
            p.unloadT += dt;
            if (p.unloadT >= (state.cheats.fast ? 600 : p.unloadMs)) p.phase = "ready";
        } else if (p.phase === "ready") {
            if (!runwayBusy(state, p.runway)) startTakeoff(p);
        } else if (p.phase === "divert") {
            p.x += 190 * s;
            p.y -= 130 * s;
            if (p.x > 940 || p.y < -60) p.phase = "gone";
        }
    });

    state.planes = state.planes.filter((p) => p.phase !== "gone");

    if (state.delays >= MAX_DELAYS) {
        state.result = { reason: "delays", winner: scoreWinner(state) };
    } else if (state.spawned >= state.total && !state.queue.length && !state.planes.length) {
        state.result = { reason: "done", winner: scoreWinner(state) };
    } else if (state.time >= state.turnEndsAt) {
        advanceTurn(state); /* auto-skip biar permainan tetap mengalir */
    }
}

/* ---- Level acak yang DIJAMIN bisa diselesaikan:
   tiap kandidat divalidasi dengan simulasi greedy memakai engine yang sama. ---- */
function greedySolvable(level) {
    const st = makeState(level, 0, 0);
    for (let t = 0; t < 300000; t += 100) {
        const holding = st.planes
            .filter((p) => p.phase === "holding")
            .sort((a, b) => a.patience - b.patience);
        for (const p of holding) {
            const r = RUNWAYS.find((r) => !runwayBusy(st, r.id, p.id));
            const g = GATES.find((g) => !gateBusy(st, g.id, p.id));
            if (r && g) tryClear(st, p.id, r.id, g.id, 0);
        }
        stepWorld(st, 100);
        if (st.result) return st.result.reason === "done";
    }
    return false;
}
function generateLevel(seed) {
    for (let att = 0; att < 24; att++) {
        const s = (seed + att * 7919) >>> 0;
        const rng = mulberry32(s);
        const total = 8 + Math.floor(rng() * 5);       /* 8..12 penerbangan */
        const base = 7000 + rng() * 2000;
        const flights = [];
        for (let i = 0; i < total; i++) {
            flights.push({
                callsign: CALLSIGNS[Math.floor(rng() * CALLSIGNS.length)] + "-" + (200 + Math.floor(rng() * 700)),
                patience: 52000 + rng() * 26000,
                unloadMs: 3200 + rng() * 2200,
                gap: i === 0 ? 1200 : Math.max(5200, base - i * 140 + (rng() * 1600 - 800)),
            });
        }
        const level = {
            seed: s,
            code: s.toString(36).toUpperCase().slice(-4),
            total,
            flights,
        };
        if (greedySolvable(level)) return level;
    }
    /* fallback konservatif, pasti lolos */
    const flights = [];
    for (let i = 0; i < 8; i++)
        flights.push({ callsign: "TZ-" + (200 + i), patience: 70000, unloadMs: 4000, gap: i === 0 ? 1200 : 8000 });
    return { seed, code: "SAFE", total: 8, flights };
}

/* ---- Bot: clear pesawat paling kritis, atau depart yang aman; else skip ---- */
function pickBotAction(state, slot) {
    const holding = state.planes
        .filter((p) => p.phase === "holding")
        .sort((a, b) => a.patience - b.patience);
    for (const p of holding) {
        const r = RUNWAYS.find((r) => !runwayBusy(state, r.id, p.id));
        const g = GATES.find((g) => !gateBusy(state, g.id, p.id));
        if (r && g) return { type: "clear", planeId: p.id, runway: r.id, gate: g.id };
    }
    for (const p of state.planes) {
        if ((p.phase === "ready" || p.phase === "unload") && !runwayBusy(state, p.runway, p.id))
            return { type: "depart", planeId: p.id };
    }
    return null;
}

/* ============================ MOUNT / UI ============================ */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* Slot pemain TIDAK fixed: host mengacak hostSlot tiap game (state.hostSlot),
       tamu = 1 - hostSlot. Ini memenuhi permintaan randomisasi posisi pemain. */
    const mySlot = () => {
        if (!online) return 0;
        const hs = state ? state.hostSlot : 0;
        return room.isHost ? hs : 1 - hs;
    };

    let sel = { plane: -1, runway: -1, gate: -1 };
    let prevTurn = -1;
    let prevResult = false;
    let cheatsOpen = false;
    let tickId = null, lastT = 0, lastPub = 0, botAt = 0;
    const planeEls = new Map();
    const offs = [];
    const NS = "http://www.w3.org/2000/svg";

    root.innerHTML = `
<style>
.am-app{--acc:#6366f1;--ink:#334155;--mut:#64748b;--line:#e2e8f0;--bg:#f8fafc}
.am-app [hidden]{display:none!important}
.am-app .am-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.am-app .am-chip{font-size:12px;font-weight:600;color:var(--mut);background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap}
.am-app .am-chip b{color:var(--ink)}
.am-app .am-turn{flex:1;min-width:130px;display:flex;align-items:center;gap:8px}
.am-app .am-turnlbl{font-size:12px;font-weight:700;color:var(--ink);white-space:nowrap}
.am-app .am-turnbar{flex:1;height:4px;border-radius:2px;background:var(--line);overflow:hidden}
.am-app .am-turnbar i{display:block;height:100%;width:0;background:var(--acc);transition:width .3s linear}
.am-app .am-stage{position:relative;width:100%;max-width:880px;margin:0 auto;aspect-ratio:880/520;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--bg);touch-action:manipulation}
.am-app svg{width:100%;height:100%;display:block}
.am-app .am-plane{transition:transform .3s linear;cursor:pointer}
.am-app .am-pbody{transition:transform .3s linear}
.am-app .am-divert{opacity:.45}
.am-app .am-callsign{font-size:10px;font-weight:700;fill:#475569}
.am-app .am-lbl{font-size:11px;font-weight:700;fill:#64748b}
.am-app .am-gate,.am-app .am-runway{cursor:pointer}
.am-app .am-free rect{stroke:var(--acc);stroke-width:2;animation:am-pulse 1.2s ease-in-out infinite}
.am-app .am-picked rect{stroke:var(--acc);stroke-width:2.5}
@keyframes am-pulse{50%{opacity:.5}}
.am-app .am-pad{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px;user-select:none}
.am-app .am-group{display:flex;gap:6px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px}
.am-app .am-btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit;font-size:12px;font-weight:700;border-radius:9px;padding:7px 10px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:border-color .15s,color .15s,background .15s;touch-action:manipulation}
.am-app .am-btn:not(:disabled):hover{border-color:var(--acc);color:var(--acc)}
.am-app .am-btn:disabled{opacity:.35;cursor:default}
.am-app .am-btn.am-primary{background:var(--acc);border-color:var(--acc);color:#fff}
.am-app .am-btn.am-primary:not(:disabled):hover{color:#fff;opacity:.9}
.am-app .am-btn.am-on{background:var(--acc);border-color:var(--acc);color:#fff}
.am-app kbd{font-size:10px;font-weight:600;background:#f1f5f9;border:1px solid var(--line);border-radius:4px;padding:1px 4px;color:var(--mut)}
.am-app .am-selinfo{font-size:12px;font-weight:700;color:var(--ink);min-width:118px;text-align:center}
.am-app .am-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.88);backdrop-filter:blur(3px)}
.am-app .am-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 26px;text-align:center;max-width:320px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
.am-app .am-card h3{margin:0 0 6px;font-size:20px;color:var(--ink)}
.am-app .am-card p{margin:0 0 14px;font-size:13px;color:var(--mut)}
.am-app .am-win{color:#059669!important}
.am-app .am-lose{color:#dc2626!important}
.am-app .am-cheats{position:absolute;top:10px;right:10px;width:190px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 30px rgba(15,23,42,.1)}
.am-app .am-cheats .am-btn{justify-content:flex-start}
@media (pointer:coarse){.am-app .am-btn{min-height:44px;min-width:44px}.am-app kbd{display:none}}
@media (max-width:640px){.am-app kbd{display:none}.am-app .am-selinfo{min-width:96px}}
</style>
<div class="game-app am-app">
  <div class="game-intro">
    <div><h2>Airport Manager</h2><p data-sub>—</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Menunggu</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="am-hud">
      <span class="am-chip">Tangani <b data-hud="handled">0</b>/<b data-hud="total">0</b></span>
      <span class="am-chip">Delay <b data-hud="delays">0</b>/${MAX_DELAYS}</span>
      <span class="am-chip" data-hud="score">—</span>
      <span class="am-turn"><span class="am-turnlbl" data-turnlbl>—</span><span class="am-turnbar"><i data-turnbar></i></span></span>
    </div>
    <div class="am-stage">
      <svg viewBox="0 0 880 520" data-svg aria-hidden="true"></svg>
      <div class="am-overlay" data-wait hidden><div class="am-card"><h3>Menunggu host…</h3></div></div>
      <div class="am-overlay" data-overlay hidden>
        <div class="am-card">
          <h3 data-ov-title>—</h3>
          <p data-ov-sub>—</p>
          <button class="am-btn am-primary" type="button" data-act="restart">Main lagi <kbd>R</kbd></button>
        </div>
      </div>
      <div class="am-cheats" data-cheats hidden>
        <button class="am-btn" type="button" data-act="cheat-key" data-key="freeze">Kesabaran beku</button>
        <button class="am-btn" type="button" data-act="cheat-key" data-key="fast">Bongkar kilat</button>
        <button class="am-btn" type="button" data-act="cheat-key" data-key="slow">Slow motion</button>
        <button class="am-btn" type="button" data-act="cheat-key" data-key="reset">Reset delay</button>
        <button class="am-btn" type="button" data-act="cheat-key" data-key="auto">Auto-clear terbaik</button>
        <button class="am-btn" type="button" data-act="cheat-key" data-key="win">Menang instan</button>
        <button class="am-btn" type="button" data-act="cheat-close">Tutup</button>
      </div>
    </div>
    <div class="am-pad">
      <div class="am-group">
        <button class="am-btn" type="button" data-act="prev" aria-label="Pesawat sebelumnya">◀</button>
        <span class="am-selinfo" data-selinfo>—</span>
        <button class="am-btn" type="button" data-act="next" aria-label="Pesawat berikutnya">▶</button>
      </div>
      <div class="am-group">
        <button class="am-btn" type="button" data-act="runway" data-id="0">R1 <kbd>1</kbd></button>
        <button class="am-btn" type="button" data-act="runway" data-id="1">R2 <kbd>2</kbd></button>
      </div>
      <div class="am-group">
        <button class="am-btn" type="button" data-act="gate" data-id="0">G1 <kbd>Q</kbd></button>
        <button class="am-btn" type="button" data-act="gate" data-id="1">G2 <kbd>W</kbd></button>
        <button class="am-btn" type="button" data-act="gate" data-id="2">G3 <kbd>E</kbd></button>
      </div>
      <div class="am-group">
        <button class="am-btn" type="button" data-act="depart">Depart <kbd>⏎</kbd></button>
        <button class="am-btn" type="button" data-act="skip">Lewati <kbd>␣</kbd></button>
        <button class="am-btn" type="button" data-act="cheat" data-cheatbtn>Cheat <kbd>C</kbd></button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]');
    const elSub = $('[data-sub]'), elStatus = $('[data-status]');
    const elHandled = $('[data-hud="handled"]'), elTotal = $('[data-hud="total"]');
    const elDelays = $('[data-hud="delays"]'), elScore = $('[data-hud="score"]');
    const elTurnLbl = $('[data-turnlbl]'), elTurnBar = $('[data-turnbar]');
    const elWait = $('[data-wait]'), elOverlay = $('[data-overlay]');
    const elOvTitle = $('[data-ov-title]'), elOvSub = $('[data-ov-sub]');
    const elCheats = $('[data-cheats]'), elCheatBtn = $('[data-cheatbtn]');
    const elSelInfo = $('[data-selinfo]');

    /* ---- scenery top-down minimalis ---- */
    function buildScenery() {
        let s = '<rect x="0" y="0" width="880" height="520" fill="#f8fafc"/>';
        s += `<circle cx="${HOLD.cx}" cy="${HOLD.cy}" r="${HOLD.r0}" fill="none" stroke="#cbd5e1" stroke-dasharray="5 8"/>`;
        s += `<circle cx="${HOLD.cx}" cy="${HOLD.cy}" r="${HOLD.r1}" fill="none" stroke="#cbd5e1" stroke-dasharray="5 8"/>`;
        /* taxiway gate -> kedua runway */
        GATES.forEach((g) => {
            s += `<line x1="${g.x}" y1="${g.y + 22}" x2="${g.x}" y2="${RUNWAYS[1].y}" stroke="#e2e8f0" stroke-width="10"/>`;
            s += `<line x1="${g.x}" y1="${g.y + 22}" x2="${g.x}" y2="${RUNWAYS[1].y}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="6 8"/>`;
        });
        /* terminal + apron */
        s += '<rect x="150" y="246" width="580" height="34" rx="8" fill="#e2e8f0"/>';
        /* gates */
        GATES.forEach((g) => {
            s += `<g class="am-gate" data-gate="${g.id}">
        <rect x="${g.x - 24}" y="${g.y - 20}" width="48" height="40" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>
        <text class="am-lbl" x="${g.x}" y="${g.y - 6}" text-anchor="middle">G${g.id + 1}</text>
        <circle cx="${g.x}" cy="${g.y + 8}" r="3" fill="#cbd5e1"/></g>`;
        });
        /* runways */
        RUNWAYS.forEach((r) => {
            s += `<g class="am-runway" data-runway="${r.id}">
        <rect x="${r.x0}" y="${r.y - 14}" width="${r.x1 - r.x0}" height="28" rx="6" fill="#334155" stroke="#334155" stroke-width="1.5"/>
        <line x1="${r.x0 + 16}" y1="${r.y}" x2="${r.x1 - 70}" y2="${r.y}" stroke="#f8fafc" stroke-width="2" stroke-dasharray="22 18" opacity=".85"/>
        <text class="am-lbl" x="${r.x0}" y="${r.y - 22}">R${r.id + 1}</text></g>`;
        });
        return s;
    }
    svgEl.innerHTML = buildScenery() + '<g data-planes></g>';
    const planeLayer = $('[data-planes]');

    /* ---- helpers seleksi ---- */
    const isMine = () => !!state && !state.result && state.turn === mySlot();
    const selPlane = () => (state ? state.planes.find((p) => p.id === sel.plane) || null : null);
    const selectable = (p) => p.phase === "holding" || p.phase === "unload" || p.phase === "ready";
    const selectables = () => (state ? state.planes.filter(selectable).sort((a, b) => a.id - b.id) : []);
    const resetSel = () => { sel = { plane: -1, runway: -1, gate: -1 }; };

    /* ---- render pesawat ---- */
    function planeNode(p) {
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "am-plane");
        g.dataset.plane = String(p.id);
        g.innerHTML =
            '<circle data-ring r="20" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="126" transform="rotate(-90)" opacity="0"/>' +
            '<g class="am-pbody" data-body><path d="M-14 0 L-4 -2 L2 -12 L5 -12 L3 -2 L10 -3 L13 -6 L15 -6 L13 0 L15 6 L13 6 L10 3 L3 2 L5 12 L2 12 L-4 2 L-14 0 Z" fill="#334155" stroke="#f8fafc" stroke-width="1"/></g>' +
            `<text class="am-callsign" y="-27" text-anchor="middle">${p.callsign}</text>`;
        g._head = null;
        return g;
    }
    function rawHeading(p) {
        if (p.phase === "approach") {
            const r = RUNWAYS[p.runway];
            return (Math.atan2(r.y - p.y, r.x0 - 10 - p.x) * 180) / Math.PI;
        }
        if (p.phase === "roll") return 0;
        if (p.phase === "taxi" || p.phase === "takeoff") {
            const wp = p.taxi && p.taxi[0];
            return wp ? (Math.atan2(wp.y - p.y, wp.x - p.x) * 180) / Math.PI : 0;
        }
        if (p.phase === "unload" || p.phase === "ready") return -90;
        if (p.phase === "divert") return -34;
        return (p.ang * 180) / Math.PI + 90;
    }
    function smoothHead(n, target) {
        if (n._head == null) { n._head = target; return target; }
        const prevMod = ((n._head % 360) + 360) % 360;
        const d = ((((target - prevMod + 540) % 360) + 360) % 360) - 180;
        n._head += d;
        return n._head;
    }
    function syncPlanes() {
        state.planes.forEach((p) => {
            let n = planeEls.get(p.id);
            if (!n) { n = planeNode(p); planeLayer.appendChild(n); planeEls.set(p.id, n); }
            n.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
            n.querySelector('[data-body]').style.transform = `rotate(${smoothHead(n, rawHeading(p)).toFixed(1)}deg)`;
            n.classList.toggle('am-divert', p.phase === 'divert');
            const ring = n.querySelector('[data-ring]');
            const isSel = p.id === sel.plane;
            if (p.phase === "holding") {
                const frac = Math.max(0, p.patience / p.patienceMax);
                ring.setAttribute('opacity', '1');
                ring.setAttribute('stroke', isSel ? '#6366f1' : p.patience < 12000 ? '#ef4444' : '#f59e0b');
                ring.setAttribute('stroke-width', isSel ? '3' : '2.5');
                ring.setAttribute('stroke-dashoffset', String(126 * (1 - frac)));
            } else if (isSel) {
                ring.setAttribute('opacity', '1');
                ring.setAttribute('stroke', '#6366f1');
                ring.setAttribute('stroke-width', '3');
                ring.setAttribute('stroke-dashoffset', '0');
            } else {
                ring.setAttribute('opacity', '0');
            }
        });
        Array.from(planeEls.keys()).forEach((id) => {
            if (!state.planes.some((p) => p.id === id)) {
                planeEls.get(id).remove();
                planeEls.delete(id);
            }
        });
    }
    function syncTargets() {
        const mine = isMine(), sp = selPlane();
        const holdSel = !!(mine && sp && sp.phase === 'holding');
        svgEl.querySelectorAll('[data-runway]').forEach((el) => {
            const rid = Number(el.dataset.runway);
            el.classList.toggle('am-free', holdSel && sel.runway !== rid && canClearLanding(state, sp.id, rid));
            el.classList.toggle('am-picked', holdSel && sel.runway === rid);
        });
        svgEl.querySelectorAll('[data-gate]').forEach((el) => {
            const gid = Number(el.dataset.gate);
            el.classList.toggle('am-free', holdSel && sel.gate !== gid && canAssignGate(state, sp.id, gid));
            el.classList.toggle('am-picked', holdSel && sel.gate === gid);
        });
    }

    /* ---- render keseluruhan ---- */
    function render() {
        if (!state) {
            elWait.hidden = !online;
            elStatus.textContent = 'Menunggu host';
            root.querySelectorAll('.am-btn').forEach((b) => { b.disabled = true; });
            return;
        }
        elWait.hidden = true;
        if (state.turn !== prevTurn) { resetSel(); prevTurn = state.turn; }
        const sp = selPlane();
        if (sel.plane >= 0 && (!sp || !selectable(sp) || !isMine())) resetSel();

        const me = mySlot(), other = 1 - me;
        elSub.textContent = `Shift #${state.code} · ${state.total} penerbangan`;
        elHandled.textContent = String(state.handled);
        elTotal.textContent = String(state.total);
        elDelays.textContent = String(state.delays);
        elScore.innerHTML = `Kamu <b>${state.scores[me]}</b> · ${online ? 'Lawan' : 'Bot'} <b>${state.scores[other]}</b>`;

        const mine = isMine();
        const turnLbl = state.result ? 'Selesai' : mine ? 'Giliranmu' : online ? 'Giliran lawan' : 'Giliran Bot';
        elTurnLbl.textContent = turnLbl;
        elStatus.textContent = turnLbl;
        const remain = state.result ? 0 : Math.max(0, state.turnEndsAt - state.time);
        elTurnBar.style.width = `${Math.min(100, (remain / TURN_MS) * 100)}%`;
        elTurnBar.style.background = mine ? '#6366f1' : '#94a3b8';

        syncPlanes();
        syncTargets();

        /* pad / virtual buttons */
        const s2 = selPlane();
        const holdingSel = !!(mine && s2 && s2.phase === 'holding');
        const parkedSel = !!(mine && s2 && (s2.phase === 'unload' || s2.phase === 'ready'));
        root.querySelectorAll('[data-act="prev"],[data-act="next"]').forEach((b) => { b.disabled = !mine || selectables().length === 0; });
        root.querySelectorAll('[data-act="runway"]').forEach((b) => {
            const id = Number(b.dataset.id);
            b.disabled = !holdingSel || !canClearLanding(state, s2.id, id);
            b.classList.toggle('am-on', holdingSel && sel.runway === id);
        });
        root.querySelectorAll('[data-act="gate"]').forEach((b) => {
            const id = Number(b.dataset.id);
            b.disabled = !holdingSel || !canAssignGate(state, s2.id, id);
            b.classList.toggle('am-on', holdingSel && sel.gate === id);
        });
        root.querySelector('[data-act="depart"]').disabled = !parkedSel;
        root.querySelector('[data-act="skip"]').disabled = !mine;
        elCheatBtn.hidden = online;
        elSelInfo.textContent = s2
            ? s2.phase === 'holding'
                ? `${s2.callsign} · R${sel.runway >= 0 ? sel.runway + 1 : '–'} · G${sel.gate >= 0 ? sel.gate + 1 : '–'}`
                : `${s2.callsign} · ${s2.phase === 'ready' ? 'siap' : 'bongkar'}`
            : '—';

        /* cheat panel (hanya mode AI) */
        elCheats.hidden = online || !cheatsOpen || !!state.result;
        elCheats.querySelectorAll('[data-key]').forEach((b) => {
            const k = b.dataset.key;
            b.classList.toggle('am-on', !!state.cheats[k]);
        });

        /* hasil akhir */
        if (state.result) {
            const w = state.result.winner;
            const title = online
                ? w == null ? 'Seri' : `${w === me ? playerName : 'Lawan'} menang`
                : w === me ? 'Menang!' : w == null ? 'Seri' : 'Kalah';
            elOvTitle.textContent = title;
            elOvTitle.className = w == null ? '' : w === me ? 'am-win' : 'am-lose';
            const reasons = {
                done: 'Semua penerbangan selesai.',
                delays: 'Terlalu banyak delay.',
                collision: 'Tabrakan di runway.',
                cheat: 'Cheat aktif.',
            };
            elOvSub.textContent = `${reasons[state.result.reason] || ''} Skor ${state.scores[me]}–${state.scores[other]}.`;
            elOverlay.hidden = false;
        } else {
            elOverlay.hidden = true;
        }
    }

    /* ---- alur game ---- */
    function newGame() {
        const seed = (Math.random() * 0x7fffffff) | 0;
        const level = generateLevel(seed);
        const hostSlot = online ? (Math.random() < 0.5 ? 0 : 1) : 0; /* slot acak saat multiplayer */
        const firstTurn = Math.random() < 0.5 ? 0 : 1;              /* giliran awal acak (vs bot / multiplayer) */
        state = makeState(level, hostSlot, firstTurn);
        resetSel();
        prevTurn = -1;
        prevResult = false;
        botAt = 0;
        cheatsOpen = false;
        planeEls.forEach((n) => n.remove());
        planeEls.clear();
    }

    function applyCheat(key) {
        const c = state.cheats;
        if (key === 'freeze') c.freeze = !c.freeze;
        else if (key === 'fast') c.fast = !c.fast;
        else if (key === 'slow') c.slow = !c.slow;
        else if (key === 'reset') state.delays = 0;
        else if (key === 'auto') {
            const a = pickBotAction(state, 0);
            if (a && a.type === 'clear') tryClear(state, a.planeId, a.runway, a.gate, 0);
        } else if (key === 'win') {
            state.result = { reason: 'cheat', winner: 0 };
        }
    }

    function applyAction(action, actor) {
        if (!state || !action || typeof action.type !== 'string') return;
        if (actor !== 0 && actor !== 1) return;
        if (action.type === 'restart') { newGame(); publish(true); return; }
        if (state.result) return;
        if (action.type === 'cheat') {
            if (online || actor !== 0) return; /* cheat hanya mode AI */
            applyCheat(String(action.key));
            publish(true);
            return;
        }
        if (actor !== state.turn) return; /* validasi giliran */
        if (action.type === 'clear') {
            const pid = Number(action.planeId), rid = Number(action.runway), gid = Number(action.gate);
            if (Number.isFinite(pid) && tryClear(state, pid, rid, gid, actor)) {
                advanceTurn(state);
                publish(true);
            }
        } else if (action.type === 'depart') {
            const r = forceDepart(state, Number(action.planeId), actor);
            if (r !== 'no') {
                if (!state.result) advanceTurn(state);
                publish(true);
            }
        } else if (action.type === 'skip') {
            advanceTurn(state);
            publish(true);
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) {
            room.sendAction(action).catch(console.warn);
            return;
        }
        applyAction(action, mySlot());
    }

    function publish(force) {
        render();
        if (online && room.isHost && state) {
            const now = Date.now();
            if (force || now - lastPub >= 300) {
                lastPub = now;
                room.publishState(state).catch(console.warn);
            }
        }
    }

    function tick() {
        if (!state) return;
        const now = Date.now();
        const dt = Math.min(120, now - lastT);
        lastT = now;
        stepWorld(state, dt);
        /* bot hanya di mode AI */
        if (!online && !state.result) {
            if (state.turn === 1) {
                if (!botAt) botAt = now + 900 + Math.random() * 1300;
                if (now >= botAt) {
                    botAt = 0;
                    applyAction(pickBotAction(state, 1) || { type: 'skip' }, 1);
                }
            } else botAt = 0;
        }
        const justEnded = !!state.result && !prevResult;
        publish(justEnded);
        prevResult = !!state.result;
    }

    /* ---- interaksi ---- */
    function selectPlane(id) { sel = { plane: id, runway: -1, gate: -1 }; render(); }
    function cycle(dir) {
        const list = selectables();
        if (!list.length || !isMine()) return;
        const idx = list.findIndex((p) => p.id === sel.plane);
        const next = idx === -1 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
        selectPlane(list[next].id);
    }
    function tryCommit() {
        const sp = selPlane();
        if (isMine() && sp && sp.phase === 'holding' && sel.runway >= 0 && sel.gate >= 0 &&
            canClearLanding(state, sp.id, sel.runway) && canAssignGate(state, sp.id, sel.gate)) {
            submitAction({ type: 'clear', planeId: sp.id, runway: sel.runway, gate: sel.gate });
            resetSel();
        }
    }
    function pickRunway(rid) {
        const sp = selPlane();
        if (isMine() && sp && sp.phase === 'holding' && canClearLanding(state, sp.id, rid)) {
            sel.runway = rid;
            tryCommit();
            render();
        }
    }
    function pickGate(gid) {
        const sp = selPlane();
        if (isMine() && sp && sp.phase === 'holding' && canAssignGate(state, sp.id, gid)) {
            sel.gate = gid;
            tryCommit();
            render();
        }
    }
    function doDepart() {
        const sp = selPlane();
        if (isMine() && sp && (sp.phase === 'unload' || sp.phase === 'ready')) {
            submitAction({ type: 'depart', planeId: sp.id });
            resetSel();
            render();
        }
    }
    function doSkip() {
        if (isMine()) { submitAction({ type: 'skip' }); resetSel(); render(); }
    }

    function handleClick(event) {
        if (event.target.closest('[data-exit]')) { onExit(); return; }
        const btn = event.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        const act = btn.dataset.act;
        if (act === 'restart') { submitAction({ type: 'restart' }); return; }
        if (act === 'cheat') { if (!online) { cheatsOpen = !cheatsOpen; render(); } return; }
        if (act === 'cheat-close') { cheatsOpen = false; render(); return; }
        if (act === 'cheat-key') { submitAction({ type: 'cheat', key: btn.dataset.key }); return; }
        if (!state || state.result) return;
        if (act === 'prev') cycle(-1);
        else if (act === 'next') cycle(1);
        else if (act === 'runway') pickRunway(Number(btn.dataset.id));
        else if (act === 'gate') pickGate(Number(btn.dataset.id));
        else if (act === 'depart') doDepart();
        else if (act === 'skip') doSkip();
    }

    function onSvg(e) {
        if (!state || state.result) return;
        const planeEl = e.target.closest ? e.target.closest('[data-plane]') : null;
        if (planeEl) {
            const p = state.planes.find((q) => q.id === Number(planeEl.dataset.plane));
            if (p && selectable(p) && isMine()) selectPlane(p.id);
            return;
        }
        const rw = e.target.closest ? e.target.closest('[data-runway]') : null;
        const gt = e.target.closest ? e.target.closest('[data-gate]') : null;
        if (rw) pickRunway(Number(rw.dataset.runway));
        else if (gt) pickGate(Number(gt.dataset.gate));
        else { resetSel(); render(); }
    }

    function onKey(e) {
        if (!root.isConnected || e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
        const k = e.key;
        const over = !!state && !!state.result;
        let handled = true;
        if (k === 'Tab') cycle(e.shiftKey ? -1 : 1);
        else if (k === 'ArrowRight') cycle(1);
        else if (k === 'ArrowLeft') cycle(-1);
        else if (k === '1' || k === '2') pickRunway(Number(k) - 1);
        else if (k === 'q' || k === 'Q' || k === '3') pickGate(0);
        else if (k === 'w' || k === 'W' || k === '4') pickGate(1);
        else if (k === 'e' || k === 'E' || k === '5') pickGate(2);
        else if (k === 'Enter') doDepart();
        else if (k === ' ') { if (over) submitAction({ type: 'restart' }); else doSkip(); }
        else if (k === 's' || k === 'S') doSkip();
        else if (k === 'r' || k === 'R') { if (over) submitAction({ type: 'restart' }); else handled = false; }
        else if (k === 'c' || k === 'C') { if (!online && state && !state.result) { cheatsOpen = !cheatsOpen; render(); } }
        else if (k === 'Escape') { if (cheatsOpen) { cheatsOpen = false; render(); } else { resetSel(); render(); } }
        else handled = false;
        if (handled) e.preventDefault();
    }

    root.addEventListener('click', handleClick);
    svgEl.addEventListener('pointerdown', onSvg);
    document.addEventListener('keydown', onKey);

    /* ---- boot sesuai mode ---- */
    if (online) {
        offs.push(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            newGame();
            lastT = Date.now();
            tickId = setInterval(tick, 80);
            publish(true);
            /* aksi tamu dipetakan ke slot lawan dari hostSlot yang diacak */
            offs.push(room.onAction((action) => applyAction(action, state ? 1 - state.hostSlot : 1)));
        } else {
            offs.push(room.onState((nextState) => { if (!nextState) return; state = nextState; render(); }));
            render();
        }
    } else {
        newGame();
        render();
        lastT = Date.now();
        tickId = setInterval(tick, 80);
    }

    return {
        destroy() {
            if (tickId) { clearInterval(tickId); tickId = null; }
            root.removeEventListener('click', handleClick);
            svgEl.removeEventListener('pointerdown', onSvg);
            document.removeEventListener('keydown', onKey);
            offs.forEach((f) => { if (typeof f === 'function') f(); });
            planeEls.clear();
        },
    };
}

/* ekspor aturan murni untuk unit test */
mount._test = {
    RUNWAYS, GATES, HOLD, MAX_DELAYS, MAX_HOLDING, TURN_MS,
    makeState, generateLevel, greedySolvable, stepWorld,
    tryClear, forceDepart, canClearLanding, canAssignGate,
    runwayBusy, gateBusy, pickBotAction,
};