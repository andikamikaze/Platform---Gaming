/* ==== traffic-control.js ==== */
/*
  Traffic Control — module format (META + mount).
  1. File name must match META.id ("traffic-control").
  2. Regenerate manifest: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "traffic-control",
    name: "Traffic Control",
    category: "simulation",
    catLabel: "Simulation",
    desc: "Switch the lights, time the yellow, and keep four-way traffic flowing — solo, vs bot, or an online duel.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="19" width="40" height="10" rx="2"/><rect x="19" y="4" width="10" height="40" rx="2"/><circle cx="24" cy="24" r="3.4"/><path d="M14 24h4M30 24h4M24 14v4M24 30v4"/></svg>',
    bg: ["#bfdbfe", "#3b82f6"],
    bestKey: "trafficControlBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost; /* only host/local runs the simulation */
    let roomData = room?.room || null;
    let state = null;

    /* ---------------- constants ---------------- */
    const VIEW_W = 960, VIEW_H = 820;
    const CAR_LEN = 34, CAR_W = 18, GAP = 42;
    const ACCEL = 3.5, BRAKE = 10;          /* brakes stronger than engine -> no queue overshoot */
    const APPROACH_K = 2.4, FOLLOW_K = 3.0;
    const RUNNER_WINDOW = 60, RUNNER_MIN_V = 50;
    const SHIFT_MS = 12000;                 /* duel/online: control alternates every 12 s */
    const LANE_KEYS = ["sb", "nb", "wb", "eb"];
    const LANE_NAME = { sb: "north", nb: "south", wb: "east", eb: "west" };
    const CAR_COLORS = { sb: "#ef4444", nb: "#3b82f6", wb: "#f59e0b", eb: "#10b981" };
    const THEMES = [
        { name: "Paper", ground: "#f3f5f7", block: "#e7ecf1", road: "#5b6472", line: "#f8fafc", build: "#d3dbe3", tree: "#9ec9a8" },
        { name: "Mint", ground: "#eef4ef", block: "#e0ebe2", road: "#5f6b63", line: "#f7faf7", build: "#cddcd2", tree: "#8fc49a" },
        { name: "Sand", ground: "#f6f1e7", block: "#ece4d4", road: "#6b6257", line: "#fbf7ee", build: "#ddd2bd", tree: "#a9c98f" },
        { name: "Slate", ground: "#e9edf3", block: "#dde3ec", road: "#4b5563", line: "#f1f5f9", build: "#c6cfdb", tree: "#93b7a0" },
    ];
    const NAME_A = ["Maple", "Harbor", "Cedar", "Union", "King", "Elm", "Bay", "North", "Willow", "Granite"];
    const NAME_B = ["Junction", "Crossing", "Square", "Gate", "Yard", "Corners"];

    /* ---------------- seeded rng ---------------- */
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---------------- geometry (derived from map) ---------------- */
    const laneCache = new Map();
    function lanesFor(m) {
        if (laneCache.has(m.seed)) return laneCache.get(m.seed);
        const off = m.roadW / 4, e = m.roadW / 2;
        const L = {
            sb: { axis: "v", x: m.cx - off, dir: 1, stop: m.cy - e - m.pad, spawn: -70 },
            nb: { axis: "v", x: m.cx + off, dir: -1, stop: m.cy + e + m.pad, spawn: m.h + 70 },
            wb: { axis: "h", y: m.cy - off, dir: -1, stop: m.cx + e + m.pad, spawn: m.w + 70 },
            eb: { axis: "h", y: m.cy + off, dir: 1, stop: m.cx - e - m.pad, spawn: -70 },
        };
        laneCache.set(m.seed, L);
        return L;
    }
    function toLine(c, L) { return L.dir === 1 ? L.stop - c.p : c.p - L.stop; }
    function carRect(c, L) {
        if (L.axis === "v")
            return { x: L.x - CAR_W / 2, y: L.dir === 1 ? c.p - CAR_LEN : c.p, w: CAR_W, h: CAR_LEN };
        return { x: L.dir === 1 ? c.p - CAR_LEN : c.p, y: L.y - CAR_W / 2, w: CAR_LEN, h: CAR_W };
    }
    function overlaps(a, b, tol) {
        return a.x < b.x + b.w - tol && b.x < a.x + a.w - tol &&
            a.y < b.y + b.h - tol && b.y < a.y + a.h - tol;
    }

    /* ---------------- random map generator (validated solvable) ---------------- */
    function genMap(seed, rng, level) {
        const roadW = [104, 120, 136][Math.floor(rng() * 3)];
        const m = {
            seed, level,
            name: NAME_A[Math.floor(rng() * NAME_A.length)] + " " + NAME_B[Math.floor(rng() * NAME_B.length)],
            theme: Math.floor(rng() * THEMES.length),
            w: VIEW_W, h: VIEW_H,
            roadW,
            pad: Math.round((10 + rng() * 10) * 10) / 10,
            cx: Math.round((480 + (rng() - 0.5) * 140) * 10) / 10,
            cy: Math.round((410 + (rng() - 0.5) * 100) * 10) / 10,
            cruise: Math.round((72 + rng() * 20) * 10) / 10,
            yellow: Math.round(850 + rng() * 250),
            gridlock: roadW >= 136 ? 6 : (rng() < 0.5 ? 6 : 7),
            target: Math.min(40, 22 + Math.floor(rng() * 8) + 2 * (level - 1)),
            burstChance: 0.16,
            burstMax: rng() < 0.25 ? 3 : 2,
            rampMin: 0.8,
            bases: {}, tries: 0,
        };
        const bias = 0.75 + rng() * 0.7;
        const hot = LANE_KEYS[Math.floor(rng() * 4)];
        LANE_KEYS.forEach((k) => {
            let b = 5600 + rng() * 3400;
            if (k === "sb" || k === "nb") b *= bias;
            if (k === hot) b *= 0.8;
            m.bases[k] = Math.round(b);
        });
        return m;
    }

    /* Headless proof: a competent controller must be able to win this map. */
    function validateMap(m) {
        const rng = mulberry32((m.seed ^ 0x9e3779b9) >>> 0);
        const lanes = lanesFor(m);
        const st = makeState(m, { mode: "solo", phase: "running", level: m.level });
        let cd = 0;
        while (st.time < 240000) {
            stepSpawns(st, m, lanes, 60, rng);
            stepSim(st, m, lanes, 60);
            cd -= 60;
            if (cd <= 0) { decideSwitch(st, m, lanes, 1, rng); cd = 320; }
            if (st.crash || st.gridlock) return false;
            if (st.passed >= m.target) return true;
        }
        return false;
    }
    function genValidatedMap(level) {
        const seed = (Math.random() * 0x7fffffff) >>> 0;
        const m = genMap(seed, mulberry32(seed), level);
        for (let i = 0; i < 10; i++) {
            if (validateMap(m)) { m.tries = i; return m; }
            LANE_KEYS.forEach((k) => { m.bases[k] = Math.round(m.bases[k] * 1.15); });
            m.burstChance *= 0.75;
        }
        m.bases = { sb: 8200, nb: 8200, wb: 8200, eb: 8200 };
        m.burstChance = 0; m.tries = 10;
        return m;
    }

    /* ---------------- state ---------------- */
    function makeState(map, opts = {}) {
        const md = opts.mode || "solo";
        const duel = md !== "solo";
        const first = duel ? (Math.random() < 0.5 ? 0 : 1) : 0; /* random first controller */
        return {
            v: 1, phase: opts.phase || "intro", mode: md, level: opts.level || 1, map,
            green: "ns", yellow: 0, greenFor: 0, time: 0,
            cars: [], nextId: 1,
            spawnIn: { sb: 1200, nb: 2600, wb: 4000, eb: 5400 }, pending: [],
            passed: 0, scores: [0, 0],
            controller: first, first, shiftLeft: SHIFT_MS,
            seatSwap: md === "online" ? Math.random() < 0.5 : false, /* random seat assignment */
            botIn: 900, autoIn: 300,
            crash: false, gridlock: false, crashPos: null, jamLane: null, over: null,
            cheated: false,
            cheats: { ghost: false, noJam: false, freeze: false, slow: false, auto: false },
        };
    }

    /* ---------------- pure simulation ---------------- */
    function mayEnter(st, c, L) {
        if (c.runner) return true;
        return ((L.axis === "v") === (st.green === "ns")) && st.yellow <= 0;
    }
    function spawnSpace(st, k, L, m) {
        const cars = st.cars.filter((c) => c.lane === k);
        if (cars.length >= m.gridlock + 1) return false;
        if (!cars.length) return true;
        let tail = cars[0];
        cars.forEach((c) => { if (c.p * L.dir < tail.p * L.dir) tail = c; });
        return (tail.p - L.spawn) * L.dir >= CAR_LEN + GAP + 10;
    }
    function pushCar(st, k, L, m) {
        st.cars.push({ id: st.nextId++, lane: k, p: L.spawn, v: m.cruise, runner: false });
    }
    function stepSpawns(st, m, lanes, dt, rnd) {
        LANE_KEYS.forEach((k) => {
            st.spawnIn[k] -= dt;
            if (st.spawnIn[k] <= 0) {
                const L = lanes[k];
                if (spawnSpace(st, k, L, m)) {
                    pushCar(st, k, L, m);
                    if (rnd() < m.burstChance) { /* occasional platoon */
                        const n = 2 + Math.floor(rnd() * (m.burstMax - 1));
                        const gapMs = ((CAR_LEN + GAP + 16) / m.cruise) * 1000;
                        for (let i = 1; i < n; i++) st.pending.push({ lane: k, t: gapMs * i });
                    }
                    const t = Math.min(1, st.passed / m.target);
                    st.spawnIn[k] = m.bases[k] * (0.6 + rnd() * 0.8) * (1 - (1 - m.rampMin) * t);
                } else st.spawnIn[k] = 500; /* road full: car waits to enter */
            }
        });
        st.pending = st.pending.filter((p) => {
            p.t -= dt;
            if (p.t > 0) return true;
            const L = lanes[p.lane];
            if (spawnSpace(st, p.lane, L, m)) { pushCar(st, p.lane, L, m); return false; }
            p.t = 300;
            return true;
        });
    }
    function stepSim(st, m, lanes, dtMs) {
        const dt = Math.min(dtMs, 120) / 1000;
        st.time += dtMs;
        if (st.yellow > 0) {
            st.yellow -= dtMs;
            if (st.yellow <= 0) {
                st.yellow = 0;
                st.green = st.green === "ns" ? "ew" : "ns";
                st.greenFor = 0;
            }
        } else st.greenFor += dtMs;

        const byLane = {};
        st.cars.forEach((c) => { (byLane[c.lane] = byLane[c.lane] || []).push(c); });
        Object.keys(byLane).forEach((k) => {
            byLane[k].sort((a, b) => (b.p - a.p) * lanes[k].dir);
        });

        st.cars.forEach((c) => {
            const L = lanes[c.lane];
            const tl = toLine(c, L);
            const committed = tl < -4;
            let target = m.cruise;
            if (!committed && !mayEnter(st, c, L))
                target = tl <= 2 ? 0 : Math.min(m.cruise, Math.max(0, (tl - 2) * APPROACH_K));
            const q = byLane[c.lane], idx = q.indexOf(c);
            if (idx > 0) {
                const gap = (q[idx - 1].p - c.p) * L.dir - CAR_LEN;
                if (gap < GAP)
                    target = Math.min(target, gap <= 2 ? 0 : Math.max(0, (gap - 2) * FOLLOW_K));
            }
            const rate = target < c.v ? BRAKE : ACCEL;
            c.v += (target - c.v) * Math.min(1, rate * dt);
            if (c.v < 1 && target === 0) c.v = 0;
            c.p += c.v * dt * L.dir;
        });

        if (!st.crash && !st.cheats.ghost) {
            for (let i = 0; i < st.cars.length && !st.crash; i++) {
                for (let j = i + 1; j < st.cars.length && !st.crash; j++) {
                    const a = st.cars[i], b = st.cars[j];
                    const La = lanes[a.lane], Lb = lanes[b.lane];
                    if (La.axis === Lb.axis) continue;
                    const ra = carRect(a, La), rb = carRect(b, Lb);
                    if (overlaps(ra, rb, 2)) {
                        st.crash = true;
                        st.crashPos = {
                            x: (ra.x + ra.w / 2 + rb.x + rb.w / 2) / 2,
                            y: (ra.y + ra.h / 2 + rb.y + rb.h / 2) / 2,
                        };
                    }
                }
            }
        }

        if (!st.gridlock && !st.cheats.noJam) {
            LANE_KEYS.forEach((k) => {
                const waiting = st.cars.filter((c) => c.lane === k && toLine(c, lanes[k]) > -2).length;
                if (waiting >= m.gridlock) { st.gridlock = true; st.jamLane = k; }
            });
        }

        st.cars = st.cars.filter((c) => {
            const L = lanes[c.lane];
            const end = L.axis === "v" ? m.h : m.w;
            const gone = L.dir === 1 ? c.p - CAR_LEN > end + 70 : c.p + CAR_LEN < -70;
            if (gone) { st.passed++; st.scores[st.controller]++; }
            return !gone;
        });
    }
    function switchLights(st, m, lanes) {
        if (st.yellow > 0) return false;
        st.yellow = m.yellow;
        LANE_KEYS.forEach((k) => {
            const L = lanes[k];
            if ((L.axis === "v") !== (st.green === "ns")) return;
            const cands = st.cars
                .filter((c) => c.lane === k && c.v > RUNNER_MIN_V && toLine(c, L) < RUNNER_WINDOW && toLine(c, L) > -4)
                .sort((a, b) => toLine(a, L) - toLine(b, L));
            if (cands.length) cands[0].runner = true;
        });
        return true;
    }
    /* Shared brain: map validator (skill 1), duel bot (.95), autopilot cheat (1). */
    function decideSwitch(st, m, lanes, skill, rnd) {
        if (st.yellow > 0) return false;
        const span = m.roadW + 2 * m.pad + CAR_LEN + 10;
        const gk = st.green === "ns" ? ["sb", "nb"] : ["wb", "eb"];
        const rk = st.green === "ns" ? ["wb", "eb"] : ["sb", "nb"];
        for (const c of st.cars) {
            if (!gk.includes(c.lane)) continue;
            const past = -toLine(c, lanes[c.lane]);
            if ((past > 4 && past < span) || (past > -100 && past <= 4 && c.v > RUNNER_MIN_V)) return false;
        }
        const demand = (keys) => st.cars.filter((c) => keys.includes(c.lane) && toLine(c, lanes[c.lane]) > -2).length;
        const gD = demand(gk), rD = demand(rk);
        let rMax = 0;
        rk.forEach((k) => {
            const n = st.cars.filter((c) => c.lane === k && toLine(c, lanes[k]) > -2).length;
            if (n > rMax) rMax = n;
        });
        const want = (gD === 0 && rD > 0) || rD >= gD + 2 ||
            (st.greenFor > 7000 && rD >= 2) || (rMax >= m.gridlock - 2 && rD > gD);
        if (want && rnd() < skill) return switchLights(st, m, lanes);
        return false;
    }

    /* ---------------- best score ---------------- */
    let best = 0;
    try { best = parseInt(localStorage.getItem(META.bestKey) || "0", 10) || 0; } catch (e) { /* ignore */ }
    function saveBest() { try { localStorage.setItem(META.bestKey, String(best)); } catch (e) { /* ignore */ } }

    function evaluateEnd(st) {
        if (st.phase !== "running") return;
        const m = st.map, duel = st.mode !== "solo";
        let over = null;
        if (st.crash) over = { kind: "crash", fault: st.controller, winner: duel ? 1 - st.controller : null };
        else if (st.gridlock) over = { kind: "jam", fault: st.controller, winner: duel ? 1 - st.controller : null };
        else if (st.passed >= m.target)
            over = { kind: "win", winner: duel ? (st.scores[0] === st.scores[1] ? -1 : (st.scores[0] > st.scores[1] ? 0 : 1)) : null };
        if (!over) return;
        st.over = over;
        st.phase = "over";
        if (st.mode === "solo" && !st.cheated && st.passed > best) { best = st.passed; saveBest(); }
    }

    /* ---------------- authority step ---------------- */
    function stepGame(st, dtMs) {
        const m = st.map, lanes = lanesFor(m);
        if (!st.cheats.freeze) stepSpawns(st, m, lanes, dtMs, Math.random);
        stepSim(st, m, lanes, dtMs);
        if (st.mode !== "solo") {
            st.shiftLeft -= dtMs;
            if (st.shiftLeft <= 0) { st.controller = 1 - st.controller; st.shiftLeft += SHIFT_MS; }
        }
        if (st.mode === "duel" && st.controller === 1) {
            st.botIn -= dtMs;
            if (st.botIn <= 0) { decideSwitch(st, m, lanes, 0.95, Math.random); st.botIn = 520 + Math.random() * 420; }
        }
        if (st.cheats.auto && (st.mode === "solo" || st.controller === 0)) {
            st.autoIn -= dtMs;
            if (st.autoIn <= 0) { decideSwitch(st, m, lanes, 1, Math.random); st.autoIn = 300; }
        }
        evaluateEnd(st);
    }

    /* ---------------- HTML skeleton (minimalist) ---------------- */
    root.innerHTML = `
<div class="game-app tc-app">
<style>
.tc-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--paper:#fff;--bg:#f6f8fa;--acc:#2563eb;--ok:#16a34a;--warn:#d97706;--bad:#dc2626;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink)}
.tc-app [hidden]{display:none!important}
.tc-app .game-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.tc-app .game-intro h2{margin:0 0 2px;font-size:20px;letter-spacing:-.01em}
.tc-app .game-intro p{margin:0;color:var(--mut);font-size:13px}
.tc-app .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--mut);border:1px solid var(--line);background:var(--paper);padding:6px 11px;border-radius:999px;white-space:nowrap}
.tc-app .game-status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block}
.tc-app .game-panel{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:14px}
.tc-hud{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.tc-chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 11px;background:var(--bg)}
.tc-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
.tc-chip.warn b{color:var(--bad)}
.tc-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block}
.tc-turnbar{width:46px;height:4px;border-radius:2px;background:var(--line);overflow:hidden;display:inline-block}
.tc-turnbar i{display:block;height:100%;background:var(--acc);width:100%}
.tc-cheatbadge{color:var(--warn);border-color:#fde68a;background:#fffbeb;font-weight:600}
.tc-stage{position:relative;width:100%;max-width:920px;margin:0 auto;aspect-ratio:960/820;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#f3f5f7;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.tc-stage[data-live="1"]{cursor:pointer}
.tc-stage svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.tc-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(246,248,250,.88);backdrop-filter:blur(3px);padding:16px;overflow:auto;z-index:5}
.tc-card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px 22px;max-width:560px;width:100%;box-shadow:0 8px 30px rgba(15,23,42,.06);animation:tcPop .18s ease-out}
@keyframes tcPop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.tc-card h3{margin:0 0 8px;font-size:19px}
.tc-card p{margin:6px 0;font-size:13.5px;color:var(--mut);line-height:1.55}
.tc-card p b{color:var(--ink)}
.tc-mapinfo{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.tc-ov-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.tc-btn{appearance:none;border:1px solid var(--acc);background:var(--acc);color:#fff;font-weight:600;font-size:14px;font-family:inherit;border-radius:10px;padding:10px 18px;cursor:pointer}
.tc-btn.ghost{background:var(--paper);color:var(--ink);border-color:var(--line)}
.tc-btn:disabled{opacity:.5;cursor:default}
.tc-seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:4px 0}
.tc-seg button{border:0;background:var(--paper);padding:8px 14px;font-size:13px;font-family:inherit;color:var(--mut);cursor:pointer}
.tc-seg button.on{background:var(--acc);color:#fff;font-weight:600}
.tc-steps{display:grid;gap:9px;margin:10px 0}
.tc-step{display:flex;gap:10px;font-size:13px;color:var(--mut);line-height:1.5}
.tc-step b{color:var(--ink)}
.tc-num{flex:0 0 22px;height:22px;border-radius:50%;background:var(--bg);border:1px solid var(--line);display:grid;place-items:center;font-size:11.5px;color:var(--ink);font-weight:600}
.tc-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line);font-size:13.5px}
.tc-cheatrow small{display:block;color:var(--mut);font-size:11.5px}
.tc-toggle{border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12px;font-family:inherit;background:var(--bg);color:var(--mut);cursor:pointer;min-width:52px}
.tc-toggle.on{background:#dcfce7;border-color:#86efac;color:#166534;font-weight:600}
.tc-controls{display:flex;gap:8px;margin:12px auto 0;max-width:920px}
.tc-switch{flex:1;min-height:56px;border:0;border-radius:12px;background:var(--acc);color:#fff;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;touch-action:manipulation}
.tc-switch b{font-size:16px}
.tc-switch small{font-size:11.5px;opacity:.85}
.tc-switch:disabled{background:#e2e8f0;color:#94a3b8;cursor:default}
.tc-icon{flex:0 0 44px;min-height:44px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink);font-size:17px;font-family:inherit;cursor:pointer;touch-action:manipulation}
.tc-keys{font-size:12px;color:var(--mut);text-align:center;margin:10px 0 0}
.tc-touch{display:none;font-size:12px;color:var(--mut);text-align:center;margin:10px 0 0}
.tc-app .game-actions{margin-top:12px;display:flex;justify-content:flex-end}
.tc-app .game-action-button{border:1px solid var(--line);background:var(--paper);color:var(--mut);border-radius:10px;padding:9px 16px;font-size:13px;font-family:inherit;cursor:pointer}
@media (max-width:640px){
  .tc-keys{display:none}.tc-touch{display:block}
  .tc-switch{min-height:62px}.tc-app .game-panel{padding:10px}.tc-card{padding:16px}
}
</style>
<div class="game-intro">
  <div><h2>Traffic Control</h2><p>Switch the lights, time the yellow, keep the junction alive.</p></div>
  <span class="game-status"><i class="game-status-dot" data-dot></i><span data-status>Ready</span></span>
</div>
<section class="game-panel" data-board>
  <div class="tc-hud">
    <span class="tc-chip">Passed <b data-hud-passed>0</b>/<b data-hud-target>–</b></span>
    <span class="tc-chip" data-chip-queue>Queue <b data-hud-queue>0</b>/<b data-hud-qlimit>–</b></span>
    <span class="tc-chip"><i class="tc-dot" data-green-dot></i><b data-hud-green>N–S</b></span>
    <span class="tc-chip" data-chip-turn hidden><b data-turn-name>You</b><span data-turn-time>12s</span><span class="tc-turnbar"><i data-turn-bar></i></span></span>
    <span class="tc-chip" data-chip-map>–</span>
    <span class="tc-chip" data-chip-best hidden>Best <b data-hud-best>0</b></span>
    <span class="tc-chip tc-cheatbadge" data-chip-cheat hidden>CHEATS</span>
  </div>
  <div class="tc-stage" data-stage>
    <svg data-svg viewBox="0 0 960 820" aria-hidden="true"></svg>
    <div class="tc-ov" data-ov-wait hidden><div class="tc-card"><h3>Waiting for host…</h3><p>Hi <b data-player></b> — the host is setting up the junction. The game will appear here automatically.</p></div></div>
    <div class="tc-ov" data-ov-intro hidden><div class="tc-card">
      <h3>Traffic Control</h3>
      <p>Green serves one axis. Switch with the big button, <b>Space</b>, or a click on the junction. A fast car near the stop line <b>runs the yellow</b> — switch only on a clear crossing, and never let a road fill up.</p>
      <div class="tc-mapinfo" data-intro-info></div>
      <div class="tc-seg" data-mode-row>
        <button type="button" data-act="mode" data-mode="solo">Solo</button>
        <button type="button" data-act="mode" data-mode="duel">Vs Bot</button>
      </div>
      <p data-first-note></p>
      <div class="tc-ov-actions">
        <button class="tc-btn" type="button" data-act="start" data-btn-start>Start game</button>
        <button class="tc-btn ghost" type="button" data-act="reroll" data-btn-reroll>🎲 New map</button>
        <button class="tc-btn ghost" type="button" data-act="help">How to play</button>
      </div>
      <p data-guest-note hidden>Only the host can start. You'll be assigned a random seat.</p>
    </div></div>
    <div class="tc-ov" data-ov-over hidden><div class="tc-card">
      <h3 data-over-title>Game over</h3>
      <p data-over-reason></p>
      <p data-over-scores></p>
      <div class="tc-ov-actions">
        <button class="tc-btn" type="button" data-act="restart">Play again</button>
        <button class="tc-btn ghost" type="button" data-act="next" data-btn-next hidden>Next level →</button>
        <button class="tc-btn ghost" type="button" data-act="reroll" data-btn-reroll2>🎲 New map</button>
      </div>
    </div></div>
    <div class="tc-ov" data-ov-pause hidden><div class="tc-card"><h3>Paused</h3><p>Take a breath. The cars will wait.</p><div class="tc-ov-actions"><button class="tc-btn" type="button" data-act="pause">Resume</button></div></div></div>
    <div class="tc-ov" data-ov-help hidden><div class="tc-card">
      <h3>How to play</h3>
      <div class="tc-steps">
        <div class="tc-step"><span class="tc-num">1</span><span><b>One green at a time.</b> North–South or East–West flows; the rest queue at the stop line.</span></div>
        <div class="tc-step"><span class="tc-num">2</span><span><b>Switch:</b> big button, <b>Space</b>, or click/tap the junction. A short yellow plays before the other axis goes green.</span></div>
        <div class="tc-step"><span class="tc-num">3</span><span><b>Yellow runners:</b> a car at speed near the line will not stop (amber outline). Switch while one is crossing and it gets hit — crash = game over.</span></div>
        <div class="tc-step"><span class="tc-num">4</span><span><b>Gridlock:</b> if one approach fills up, the city jams. Watch the Queue chip and give the busy road green in time.</span></div>
        <div class="tc-step"><span class="tc-num">5</span><span><b>Duel (bot / online):</b> control alternates every 12 s. Cars that exit during your shift score for you; a crash or jam on your shift loses the duel. First controller and seats are random.</span></div>
      </div>
      <p><b>Keys:</b> Space switch · P pause · R restart · H help · C cheats · Esc close.</p>
      <div class="tc-ov-actions"><button class="tc-btn" type="button" data-act="help-close">Got it</button></div>
    </div></div>
    <div class="tc-ov" data-ov-cheats hidden><div class="tc-card">
      <h3>Cheats</h3>
      <p>Local mode only. Using any cheat disables best-score saving.</p>
      <div class="tc-cheatrow"><span>Ghost mode<small>Collisions are ignored</small></span><button class="tc-toggle" type="button" data-act="cheat-toggle" data-key="ghost">OFF</button></div>
      <div class="tc-cheatrow"><span>No gridlock<small>Full roads never jam</small></span><button class="tc-toggle" type="button" data-act="cheat-toggle" data-key="noJam">OFF</button></div>
      <div class="tc-cheatrow"><span>Freeze spawns<small>No new cars enter</small></span><button class="tc-toggle" type="button" data-act="cheat-toggle" data-key="freeze">OFF</button></div>
      <div class="tc-cheatrow"><span>Slow motion<small>Everything at 55% speed</small></span><button class="tc-toggle" type="button" data-act="cheat-toggle" data-key="slow">OFF</button></div>
      <div class="tc-cheatrow"><span>Autopilot<small>Smart switching on your shift</small></span><button class="tc-toggle" type="button" data-act="cheat-toggle" data-key="auto">OFF</button></div>
      <div class="tc-ov-actions">
        <button class="tc-btn ghost" type="button" data-act="cheat-btn" data-key="pass5">+5 passed</button>
        <button class="tc-btn ghost" type="button" data-act="cheat-btn" data-key="clear">Clear traffic</button>
        <button class="tc-btn ghost" type="button" data-act="cheat-btn" data-key="skip">Skip yellow</button>
        <button class="tc-btn" type="button" data-act="cheats-close">Close</button>
      </div>
    </div></div>
  </div>
  <div class="tc-controls">
    <button class="tc-switch" type="button" data-act="switch"><b>Switch lights</b><small data-switch-sub>Green: N–S</small></button>
    <button class="tc-icon" type="button" data-act="pause" data-btn-pause title="Pause (P)" aria-label="Pause">⏸</button>
    <button class="tc-icon" type="button" data-act="restart" title="Restart (R)" aria-label="Restart">↻</button>
    <button class="tc-icon" type="button" data-act="help" title="How to play (H)" aria-label="Help">?</button>
    <button class="tc-icon" type="button" data-act="cheats" data-btn-cheats title="Cheats (C)" aria-label="Cheats">⚙</button>
  </div>
  <p class="tc-keys">Space / click junction — switch · P pause · R restart · H help · C cheats</p>
  <p class="tc-touch">Tap the junction or the big button to switch the lights.</p>
</section>
<div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]'), stageEl = $('[data-stage]');
    const hudPassed = $('[data-hud-passed]'), hudQueue = $('[data-hud-queue]');
    const hudTarget = $('[data-hud-target]'), hudQLimit = $('[data-hud-qlimit]');
    const chipQueue = $('[data-chip-queue]'), greenDot = $('[data-green-dot]'), hudGreen = $('[data-hud-green]');
    const chipTurn = $('[data-chip-turn]'), turnName = $('[data-turn-name]'), turnTime = $('[data-turn-time]'), turnBar = $('[data-turn-bar]');
    const chipMap = $('[data-chip-map]'), chipBest = $('[data-chip-best]'), hudBest = $('[data-hud-best]'), chipCheat = $('[data-chip-cheat]');
    const statusEl = $('[data-status]'), dotEl = $('[data-dot]');
    const ovWait = $('[data-ov-wait]'), ovIntro = $('[data-ov-intro]'), ovOver = $('[data-ov-over]');
    const ovPause = $('[data-ov-pause]'), ovHelp = $('[data-ov-help]'), ovCheats = $('[data-ov-cheats]');
    const introInfo = $('[data-intro-info]'), modeRow = $('[data-mode-row]'), firstNote = $('[data-first-note]');
    const btnStart = $('[data-btn-start]'), btnReroll = $('[data-btn-reroll]'), btnReroll2 = $('[data-btn-reroll2]');
    const guestNote = $('[data-guest-note]'), btnNext = $('[data-btn-next]');
    const overTitle = $('[data-over-title]'), overReason = $('[data-over-reason]'), overScores = $('[data-over-scores]');
    const switchBtn = $('[data-act="switch"]'), switchSub = $('[data-switch-sub]');
    const btnPause = $('[data-btn-pause]'), btnCheats = $('[data-btn-cheats]');
    $('[data-player]').textContent = playerName;

    /* ---------------- rendering ---------------- */
    let builtSeed = null, carLayer = null, fxLayer = null, sigEls = [], barEls = [];
    const carEls = new Map();
    let helpOpen = false, cheatsOpen = false, structKey = "";

    function buildScene(m) {
        const t = THEMES[m.theme], rng = mulberry32((m.seed ^ 0x51ab3c) >>> 0);
        const e = m.roadW / 2, off = m.roadW / 2;
        const rx0 = m.cx - e, rx1 = m.cx + e, ry0 = m.cy - e, ry1 = m.cy + e;
        const L = lanesFor(m);
        const s = [];
        s.push(`<rect width="${m.w}" height="${m.h}" fill="${t.ground}"/>`);
        const blocks = [
            { x: 8, y: 8, w: rx0 - 18, h: ry0 - 18 },
            { x: rx1 + 10, y: 8, w: m.w - rx1 - 18, h: ry0 - 18 },
            { x: 8, y: ry1 + 10, w: rx0 - 18, h: m.h - ry1 - 18 },
            { x: rx1 + 10, y: ry1 + 10, w: m.w - rx1 - 18, h: m.h - ry1 - 18 },
        ];
        blocks.forEach((b) => {
            s.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="${t.block}"/>`);
            const n = 2 + Math.floor(rng() * 3);
            for (let i = 0; i < n; i++) {
                const bw = 34 + rng() * 46, bh = 26 + rng() * 40;
                const bx = b.x + 18 + rng() * Math.max(1, b.w - bw - 36);
                const by = b.y + 18 + rng() * Math.max(1, b.h - bh - 36);
                s.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${t.build}"/>`);
            }
            const nt = 1 + Math.floor(rng() * 2);
            for (let i = 0; i < nt; i++) {
                const tx = b.x + 24 + rng() * (b.w - 48), ty = b.y + 24 + rng() * (b.h - 48);
                s.push(`<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${(6 + rng() * 5).toFixed(1)}" fill="${t.tree}"/>`);
            }
        });
        s.push(`<rect x="${rx0}" y="0" width="${m.roadW}" height="${m.h}" fill="${t.road}"/>`);
        s.push(`<rect x="0" y="${ry0}" width="${m.w}" height="${m.roadW}" fill="${t.road}"/>`);
        const dash = (x1, y1, x2, y2) =>
            s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${t.line}" stroke-width="2" stroke-dasharray="14 12" opacity=".5"/>`);
        dash(m.cx, 0, m.cx, L.sb.stop - 10);
        dash(m.cx, L.nb.stop + 10, m.cx, m.h);
        dash(0, m.cy, L.eb.stop - 10, m.cy);
        dash(L.wb.stop + 10, m.cy, m.w, m.cy);
        s.push(`<circle cx="${m.cx}" cy="${m.cy}" r="3" fill="${t.line}" opacity=".3"/>`);
        const bar = (x, y, w, h, axis) =>
            s.push(`<rect data-bar data-axis="${axis}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${t.line}" opacity=".9"/>`);
        bar(rx0 + 3, L.sb.stop, off - 6, 4, "v");
        bar(m.cx + 3, L.nb.stop - 4, off - 6, 4, "v");
        bar(L.wb.stop, ry0 + 3, 4, off - 6, "h");
        bar(L.eb.stop - 4, m.cy + 3, 4, off - 6, "h");
        s.push('<g data-cars></g><g data-fx></g>');
        const heads = [
            { x: rx0 - 16, y: ry0 - 16, axis: "v" }, { x: rx1 + 16, y: ry1 + 16, axis: "v" },
            { x: rx1 + 16, y: ry0 - 16, axis: "h" }, { x: rx0 - 16, y: ry1 + 16, axis: "h" },
        ];
        heads.forEach((h) =>
            s.push(`<circle data-sig data-axis="${h.axis}" cx="${h.x}" cy="${h.y}" r="9" fill="#ef4444" stroke="#ffffff" stroke-width="2.5"/>`));
        svgEl.innerHTML = s.join("");
        carLayer = svgEl.querySelector('[data-cars]');
        fxLayer = svgEl.querySelector('[data-fx]');
        sigEls = Array.from(svgEl.querySelectorAll('[data-sig]'));
        barEls = Array.from(svgEl.querySelectorAll('[data-bar]'));
        carEls.forEach((g) => g.remove());
        carEls.clear();
        builtSeed = m.seed;
    }

    function carSvg(c) {
        const col = CAR_COLORS[c.lane], L = lanesFor(state.map)[c.lane];
        const hw = CAR_W - 6;
        if (L.axis === "v") {
            const y = L.dir === 1 ? -CAR_LEN : 0, wy = L.dir === 1 ? -13 : 7;
            return `<rect x="${-CAR_W / 2}" y="${y}" width="${CAR_W}" height="${CAR_LEN}" rx="5" fill="${col}" stroke="none" stroke-width="2.5"/><rect x="${-hw / 2}" y="${wy}" width="${hw}" height="6" rx="2" fill="#0f172a" opacity=".35"/>`;
        }
        const x = L.dir === 1 ? -CAR_LEN : 0, wx = L.dir === 1 ? -13 : 7;
        return `<rect x="${x}" y="${-CAR_W / 2}" width="${CAR_LEN}" height="${CAR_W}" rx="5" fill="${col}" stroke="none" stroke-width="2.5"/><rect x="${wx}" y="${-hw / 2}" width="6" height="${hw}" rx="2" fill="#0f172a" opacity=".35"/>`;
    }

    function seatOf(p) { return state && state.seatSwap ? 1 - p : p; }
    function mySeat() { return online ? seatOf(playerIndex) : 0; }
    function isMyTurn() {
        return !!state && state.phase === "running" &&
            (state.mode === "solo" || state.controller === mySeat());
    }
    function nameOf(s) {
        if (!state || state.mode === "solo") return "You";
        if (state.mode === "duel") return s === 0 ? "You" : "Bot";
        return (s === mySeat() ? "You" : "Rival") + " (P" + (s + 1) + ")";
    }
    function uiHalt() { return !online && (helpOpen || cheatsOpen); }

    function demandStars(m) {
        let util = 0;
        LANE_KEYS.forEach((k) => { util += (1000 / m.bases[k]) * (1.5 * (CAR_LEN + GAP) / m.cruise); });
        const n = util < 0.32 ? 1 : util < 0.45 ? 2 : 3;
        return "●".repeat(n) + "○".repeat(3 - n);
    }

    function render() {
        const guest = online && !room.isHost;
        ovWait.toggleAttribute("hidden", !!state);
        ovIntro.toggleAttribute("hidden", !state || state.phase !== "intro");
        ovOver.toggleAttribute("hidden", !state || state.phase !== "over");
        ovPause.toggleAttribute("hidden", !state || state.phase !== "paused");
        ovHelp.toggleAttribute("hidden", !helpOpen);
        ovCheats.toggleAttribute("hidden", !cheatsOpen || online);
        btnCheats.hidden = online;
        btnPause.hidden = online;
        if (!state) { statusEl.textContent = "Waiting for host…"; return; }

        const m = state.map;
        if (builtSeed !== m.seed) buildScene(m);

        /* fx layer: crash marker / jammed approach */
        let fx = "";
        if (state.crash && state.crashPos) {
            const p = state.crashPos;
            fx = `<circle cx="${p.x}" cy="${p.y}" r="17" fill="none" stroke="#dc2626" stroke-width="3"/><path d="M${p.x - 8} ${p.y - 8}L${p.x + 8} ${p.y + 8}M${p.x + 8} ${p.y - 8}L${p.x - 8} ${p.y + 8}" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>`;
        }
        if (state.gridlock && state.jamLane) {
            const L = lanesFor(m)[state.jamLane], e = m.roadW / 2;
            let r;
            if (state.jamLane === "sb") r = { x: m.cx - e, y: 0, w: e, h: L.stop };
            else if (state.jamLane === "nb") r = { x: m.cx, y: L.stop, w: e, h: m.h - L.stop };
            else if (state.jamLane === "wb") r = { x: L.stop, y: m.cy - e, w: m.w - L.stop, h: e };
            else r = { x: 0, y: m.cy, w: L.stop, h: e };
            fx += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#dc2626" opacity=".12"/>`;
        }
        fxLayer.innerHTML = fx;

        hudTarget.textContent = String(m.target);
        hudQLimit.textContent = String(m.gridlock - 1);
        chipMap.textContent = "Lv " + state.level + " · " + m.name;
        chipBest.hidden = state.mode !== "solo" || best <= 0;
        hudBest.textContent = String(best);
        chipTurn.hidden = state.mode === "solo";
        chipCheat.hidden = online || !(state.cheated || Object.values(state.cheats).some(Boolean));

        /* intro */
        introInfo.innerHTML =
            `<span class="tc-chip"><b>${m.name}</b></span>` +
            `<span class="tc-chip">${THEMES[m.theme].name} · seed ${m.seed}</span>` +
            `<span class="tc-chip">Target <b>${m.target}</b> cars</span>` +
            `<span class="tc-chip">Jam at <b>${m.gridlock}</b></span>` +
            `<span class="tc-chip">Demand <b>${demandStars(m)}</b></span>` +
            `<span class="tc-chip">✓ verified solvable</span>`;
        modeRow.hidden = online;
        modeRow.querySelectorAll("[data-mode]").forEach((b) =>
            b.classList.toggle("on", b.dataset.mode === state.mode));
        if (state.mode === "solo")
            firstNote.innerHTML = "Green starts <b>N–S</b>. You have the wheel, " + escapeName(playerName) + ".";
        else if (state.mode === "duel")
            firstNote.innerHTML = "🪙 Coin flip: <b>" + (state.first === 0 ? "you" : "the bot") +
                "</b> take the first 12-second shift. Cars exiting on your shift score for you.";
        else
            firstNote.innerHTML = "🎲 You are <b>P" + (mySeat() + 1) + "</b>. <b>P" + (seatOf(state.first) + 1) +
                "</b> takes the first 12-second shift. Only the controller can switch.";
        btnStart.hidden = guest;
        btnReroll.hidden = guest;
        guestNote.hidden = !guest;

        /* over */
        if (state.phase === "over" && state.over) {
            const o = state.over, duel = state.mode !== "solo";
            const iWin = duel ? o.winner === mySeat() : o.kind === "win";
            if (o.kind === "win") {
                overTitle.textContent = !duel ? "Traffic flowing!" :
                    o.winner === -1 ? "Dead heat!" : (iWin ? "You win the duel!" : nameOf(o.winner) + " wins the duel");
                overReason.textContent = !duel
                    ? "You guided " + m.target + " cars through " + m.name + " without a scratch." +
                    (state.cheated ? " (cheats were on — best score not saved)" : "")
                    : "Target reached. Every car that exited on a shift scored for its controller.";
            } else if (o.kind === "crash") {
                overTitle.textContent = duel ? nameOf(o.fault) + " caused a crash" : "Crash!";
                overReason.textContent = "Two cars met inside the junction — a fast car ran the yellow. Wait for the crossing to clear before you switch." +
                    (duel ? " The other seat wins the duel." : "");
            } else {
                overTitle.textContent = duel ? nameOf(o.fault) + " let it jam" : "Gridlock!";
                overReason.textContent = "The " + LANE_NAME[state.jamLane || "sb"] + " approach filled up (" +
                    m.gridlock + " cars). Give the busy road green more often." +
                    (duel ? " The other seat wins the duel." : "");
            }
            overTitle.style.color = iWin ? "var(--ok)" : (duel && o.winner === -1 ? "var(--warn)" : "var(--bad)");
            overScores.textContent = duel
                ? nameOf(0) + " " + state.scores[0] + " — " + state.scores[1] + " " + nameOf(1)
                : "Level " + state.level + " · " + state.passed + " passed";
            btnNext.hidden = !(o.kind === "win" && state.mode === "solo" && authority);
            btnReroll2.hidden = guest;
        }

        /* cheats panel */
        if (!online) {
            ovCheats.querySelectorAll("[data-key]").forEach((b) => {
                if (b.dataset.act !== "cheat-toggle") return;
                const on = !!state.cheats[b.dataset.key];
                b.classList.toggle("on", on);
                b.textContent = on ? "ON" : "OFF";
            });
        }
    }
    function escapeName(s) { const d = document.createElement("i"); d.textContent = s; return d.innerHTML; }

    function ensureStruct() {
        const key = !state ? "wait" :
            [state.phase, state.map.seed, state.mode, state.level, state.cheated,
            state.over ? state.over.kind + state.over.winner : "", state.seatSwap,
                helpOpen, cheatsOpen, best].join("|");
        if (key !== structKey) { structKey = key; render(); }
    }

    function renderDynamic(now) {
        if (!state) return;
        const m = state.map, lanes = lanesFor(m);
        const ex = (online && !room.isHost && state.phase === "running")
            ? Math.min(0.45, (now - recvT) / 1000) : 0; /* guest dead-reckoning */

        state.cars.forEach((c) => {
            let g = carEls.get(c.id);
            if (!g) {
                g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.innerHTML = carSvg(c);
                carLayer.appendChild(g);
                carEls.set(c.id, g);
            }
            const L = lanes[c.lane];
            const p = c.p + c.v * L.dir * ex;
            const x = L.axis === "v" ? L.x : p, y = L.axis === "v" ? p : L.y;
            g.setAttribute("transform", "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ")");
            g.firstElementChild.setAttribute("stroke", c.runner ? "#f59e0b" : "none");
        });
        Array.from(carEls.keys()).forEach((id) => {
            if (!state.cars.some((c) => c.id === id)) { carEls.get(id).remove(); carEls.delete(id); }
        });

        const nsG = state.green === "ns", yel = state.yellow > 0;
        const fillFor = (axis) => ((axis === "v") === nsG) ? (yel ? "#f59e0b" : "#22c55e") : "#ef4444";
        sigEls.forEach((el) => el.setAttribute("fill", fillFor(el.dataset.axis)));
        barEls.forEach((el) => el.setAttribute("fill", fillFor(el.dataset.axis)));
        greenDot.style.background = yel ? "#d97706" : "#16a34a";
        hudGreen.textContent = (nsG ? "N–S" : "E–W") + (yel ? " · yellow" : "");

        let longest = 0;
        LANE_KEYS.forEach((k) => {
            const n = state.cars.filter((c) => c.lane === k && toLine(c, lanes[k]) > -2).length;
            if (n > longest) longest = n;
        });
        hudPassed.textContent = String(state.passed);
        hudQueue.textContent = String(longest);
        chipQueue.classList.toggle("warn", longest >= m.gridlock - 2);

        if (state.mode !== "solo") {
            const left = Math.max(0, state.shiftLeft - ex * 1000);
            turnName.textContent = nameOf(state.controller);
            turnTime.textContent = Math.ceil(left / 1000) + "s";
            turnBar.style.width = Math.round((left / SHIFT_MS) * 100) + "%";
        }

        const mine = isMyTurn();
        switchBtn.disabled = !(mine && state.yellow <= 0 && !uiHalt());
        switchSub.textContent = state.phase !== "running" ? "Green: " + (nsG ? "N–S" : "E–W")
            : yel ? "Yellow…" : !mine && state.mode !== "solo" ? nameOf(state.controller) + " is driving"
                : "Green: " + (nsG ? "N–S" : "E–W");
        stageEl.dataset.live = mine && !helpOpen && !cheatsOpen ? "1" : "0";
        btnPause.textContent = state.phase === "paused" ? "▶" : "⏸";

        let txt, col;
        if (state.phase === "intro") { txt = "Ready"; col = "#94a3b8"; }
        else if (state.phase === "paused") { txt = "Paused"; col = "#94a3b8"; }
        else if (state.phase === "over") {
            const o = state.over, duel = state.mode !== "solo";
            const iWin = duel ? o.winner === mySeat() : o.kind === "win";
            txt = iWin ? "You win!" : (duel && o.winner === -1 ? "Draw" : "Game over");
            col = iWin ? "#16a34a" : (duel && o.winner === -1 ? "#d97706" : "#dc2626");
        } else if (state.mode === "solo" || mine) { txt = "Your turn"; col = "#16a34a"; }
        else { txt = nameOf(state.controller) + " is driving"; col = "#d97706"; }
        statusEl.textContent = txt;
        dotEl.style.background = col;
    }

    /* ---------------- networking / actions ---------------- */
    let destroyed = false, raf = 0, lastT = 0, lastPub = 0, recvT = 0;

    function pushIfHost() {
        if (online && room.isHost) {
            lastPub = performance.now();
            room.publishState(state).catch(console.warn);
        }
    }
    function newGame(level, md, phase) {
        state = makeState(genValidatedMap(level), { mode: md, phase: phase || "intro", level });
    }
    function applyAction(action, actorSeat) {
        if (!state || !action) return;
        const st = state;
        switch (action.type) {
            case "switch":
                if (st.phase === "running" && actorSeat === st.controller && !uiHalt())
                    switchLights(st, st.map, lanesFor(st.map));
                break;
            case "start":
                if (st.phase === "intro" && authority) st.phase = "running";
                break;
            case "restart":
                newGame(st.level, st.mode, "running");
                break;
            case "reroll":
                if (authority && (st.phase === "intro" || st.phase === "over"))
                    newGame(st.level, st.mode, "intro");
                break;
            case "next":
                if (authority && st.phase === "over" && st.over && st.over.kind === "win" && st.mode === "solo")
                    newGame(st.level + 1, st.mode, "running");
                break;
            case "mode":
                if (!online && st.phase === "intro" && (action.value === "solo" || action.value === "duel")) {
                    st.mode = action.value;
                    st.controller = st.first = action.value === "duel" ? (Math.random() < 0.5 ? 0 : 1) : 0;
                    st.scores = [0, 0];
                    st.shiftLeft = SHIFT_MS;
                }
                break;
            case "pause":
                if (!online) {
                    if (st.phase === "running") st.phase = "paused";
                    else if (st.phase === "paused") st.phase = "running";
                }
                break;
            case "cheat": {
                if (online) break;
                st.cheated = true;
                const key = action.key;
                if (action.op === "toggle" && key in st.cheats) st.cheats[key] = !st.cheats[key];
                else if (key === "pass5" && st.phase === "running") {
                    st.passed += 5; st.scores[st.controller] += 5; evaluateEnd(st);
                } else if (key === "clear") { st.cars = []; st.pending = []; }
                else if (key === "skip" && st.yellow > 0) {
                    st.yellow = 0; st.green = st.green === "ns" ? "ew" : "ns"; st.greenFor = 0;
                }
                break;
            }
        }
        ensureStruct();
        renderDynamic(performance.now());
        pushIfHost();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }
    function trySwitch() {
        if (state && state.phase === "running" && isMyTurn() && state.yellow <= 0 && !helpOpen && !cheatsOpen)
            submitAction({ type: "switch" });
    }

    /* ---------------- main loop ---------------- */
    function frame(now) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(120, now - (lastT || now));
        lastT = now;
        if (state && authority && state.phase === "running" && !uiHalt()) {
            stepGame(state, dt * (state.cheats.slow ? 0.55 : 1));
            if (state.phase !== "running") { ensureStruct(); pushIfHost(); }
            else if (online && room.isHost && now - lastPub > 250) pushIfHost();
        }
        if (state) { ensureStruct(); renderDynamic(now); }
    }

    /* ---------------- events ---------------- */
    function handleClick(e) {
        if (destroyed) return;
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const btn = e.target.closest("[data-act]");
        if (btn) {
            const act = btn.dataset.act;
            if (act === "switch") trySwitch();
            else if (act === "start" || act === "restart" || act === "reroll" || act === "next" || act === "pause")
                submitAction({ type: act });
            else if (act === "mode") submitAction({ type: "mode", value: btn.dataset.mode });
            else if (act === "help") { helpOpen = true; cheatsOpen = false; ensureStruct(); }
            else if (act === "help-close") { helpOpen = false; ensureStruct(); }
            else if (act === "cheats" && !online) { cheatsOpen = !cheatsOpen; helpOpen = false; ensureStruct(); }
            else if (act === "cheats-close") { cheatsOpen = false; ensureStruct(); }
            else if (act === "cheat-toggle") submitAction({ type: "cheat", op: "toggle", key: btn.dataset.key });
            else if (act === "cheat-btn") submitAction({ type: "cheat", op: btn.dataset.key, key: btn.dataset.key });
            return;
        }
        if (e.target.closest("[data-stage]") && !e.target.closest(".tc-ov")) trySwitch();
    }
    function handleKey(e) {
        if (destroyed || !state) return;
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const k = e.key;
        if (k === " " || e.code === "Space") {
            e.preventDefault();
            if (e.repeat || helpOpen || cheatsOpen) return;
            if (state.phase === "intro") { if (authority) submitAction({ type: "start" }); }
            else if (state.phase === "over") submitAction({ type: "restart" });
            else if (state.phase === "paused") submitAction({ type: "pause" });
            else trySwitch();
        } else if (k === "p" || k === "P") {
            if (!online && (state.phase === "running" || state.phase === "paused")) submitAction({ type: "pause" });
        } else if (k === "r" || k === "R") {
            if (state.phase !== "intro") submitAction({ type: "restart" });
        } else if (k === "h" || k === "H") {
            helpOpen = !helpOpen; cheatsOpen = false; ensureStruct();
        } else if (k === "c" || k === "C") {
            if (!online) { cheatsOpen = !cheatsOpen; helpOpen = false; ensureStruct(); }
        } else if (k === "Escape") {
            if (helpOpen || cheatsOpen) { helpOpen = false; cheatsOpen = false; ensureStruct(); }
            else if (state.phase === "paused") submitAction({ type: "pause" });
        }
    }
    root.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    /* ---------------- boot ---------------- */
    if (online) {
        room.onRoom((nextRoom) => { if (destroyed) return; roomData = nextRoom; ensureStruct(); });
        if (room.isHost) {
            newGame(1, "online", "intro");
            pushIfHost();
            room.onAction((action) => { if (!destroyed) applyAction(action, seatOf(1)); });
        } else {
            room.onState((nextState) => {
                if (destroyed || !nextState) return;
                state = nextState;
                recvT = performance.now();
                ensureStruct();
                renderDynamic(recvT);
            });
        }
    } else {
        newGame(1, "solo", "intro");
    }
    ensureStruct();
    renderDynamic(performance.now());
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            root.removeEventListener("click", handleClick);
            document.removeEventListener("keydown", handleKey);
            carEls.clear();
            laneCache.clear();
        },
    };
}