/* ==== games/badminton.js ==== */
/* Top-down badminton · template module (mount/destroy).
   Rally scoring to 11 (win by 2, cap 15). No tutorial, no levels,
   no virtual buttons. Gestures on mobile, keyboard+mouse on desktop.
   Host-authoritative multiplayer, local AI otherwise. */

export const META = {
    id: "badminton",
    name: "Badminton",
    category: "sports",
    catLabel: "Sports",
    desc: "Rally scoring to 11: clear, drop and smash past the AI shuttler.",
    art: `<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 40 L30 18"/><circle cx="33" cy="15" r="5"/><path d="M36 12l6-6M38 15l5-3M33 10l3-6"/></svg>`,
    bg: ["#5eead4", "#14b8a6"],
};

/* ---------------- pure rules / physics (testable) ---------------- */
const W = 480, H = 840;
const CX0 = 70, CX1 = 410, CY0 = 70, CY1 = 770;   // doubles court rect
const SX0 = 92, SX1 = 388;                        // singles sidelines
const NET_Y = 420, NET_Z = 78, SSL = 100;         // net line, net height, short service line
const GRAV = 900, DRAG = 0.0035;
const TARGET = 11, CAP = 15;
const REACH = 58, AI_REACH = 50, SWING_CD = 320;
const HIT_MAX_Z = 170, SMASH_MIN_Z = 112;
const P_SPEED = 330, AI_SPEED = 240;
const X_MIN = 30, X_MAX = W - 30;
const HALF = { B: { lo: NET_Y + 26, hi: H - 28 }, T: { lo: 42, hi: NET_Y - 26 } };

const SHOTS = {
    clear: { h: 1000, u: 1100, t: 1.50, col: "#7dd3fc", dur: 260, a0: 2.4, a1: -1.6 },
    drop: { h: 275, u: 375, t: 0.95, col: "#fcd34d", dur: 200, a0: 1.2, a1: -0.5 },
    smash: { h: 1150, u: 0, t: 0.35, col: "#f87171", dur: 120, a0: 2.0, a1: -2.2 },
    serve: { h: 1150, u: 1150, t: 1.42, col: "#a7f3d0", dur: 220, a0: 0.9, a1: -0.9 },
};
const SHOT_ORDER = ["auto", "clear", "drop", "smash"];

function makeShuttle(x, y, z, vx, vy, vz, last) {
    return { x, y, z, vx, vy, vz, last, prevY: y, live: true, serving: false };
}

/* one physics step; returns null | {type:"net"|"land", ...} */
function stepShuttle(s, dtMs) {
    const dt = Math.min(dtMs, 40) / 1000;
    s.vz -= GRAV * dt;
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    const f = Math.max(0, 1 - DRAG * sp * dt);
    s.vx *= f; s.vy *= f; s.vz *= f;
    s.prevY = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;

    if ((s.prevY - NET_Y) * (s.y - NET_Y) < 0 && s.z < NET_Z) {
        s.y = NET_Y; s.live = false;
        return { type: "net", winner: 1 - s.last, x: s.x, y: NET_Y };
    }
    if (s.z <= 0) {
        s.z = 0; s.live = false;
        const topOwner = s.sideTop;                       // index owning top half
        const landOwner = s.y < NET_Y ? topOwner : 1 - topOwner;
        const inCourt = s.x >= SX0 && s.x <= SX1 && s.y >= CY0 && s.y <= CY1;
        const oppSide = landOwner !== s.last;
        const shortServe = s.serving && oppSide && Math.abs(s.y - NET_Y) < SSL;
        const winner = oppSide && inCourt && !shortServe ? s.last : 1 - s.last;
        return { type: "land", winner, x: s.x, y: s.y, in: inCourt && !shortServe };
    }
    return null;
}

/* adaptive smash: skim ~18px above the tape; downgrades when impossible */
function resolveShot(s, type, by, aimX, sideTop) {
    const dir = by === sideTop ? 1 : -1;                // top hits toward +y
    const dist = Math.abs(s.y - NET_Y);
    if (type === "smash" && (s.z < SMASH_MIN_Z || dist > 170)) type = "clear";
    const p = SHOTS[type];
    let vz = p.u;
    if (type === "smash") {
        const t = dist / (p.h * 0.72);
        vz = Math.max(-650, Math.min(-80, (NET_Z + 18 - s.z) / t - 0.5 * GRAV * t));
    }
    const vx = Math.max(-300, Math.min(300, (aimX - s.x) / p.t));
    s.vx = vx; s.vy = p.h * dir; s.vz = vz;
    s.last = by; s.serving = type === "serve"; s.sideTop = sideTop;
    return type;
}

function autoShot(s, r) {
    const dist = Math.abs(s.y - NET_Y);
    if (s.z >= SMASH_MIN_Z && dist <= 150) return r < 0.55 ? "smash" : r < 0.8 ? "drop" : "clear";
    if (dist <= 160 && s.z >= 55) return r < 0.55 ? "drop" : "clear";
    return "clear";
}

function pointsWon(a, b) {
    if (a >= TARGET && a - b >= 2) return 0;
    if (b >= TARGET && b - a >= 2) return 1;
    if (a >= CAP) return 0;
    if (b >= CAP) return 1;
    return null;
}

export const _test = {
    W, H, NET_Y, NET_Z, SSL, GRAV, DRAG, TARGET, CAP, SHOTS,
    makeShuttle, stepShuttle, resolveShot, autoShot, pointsWon
};

/* ---------------- module ---------------- */

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const authority = !online || room.isHost;
    let roomData = room?.room || null;
    let state = null;
    let destroyed = false;

    const myName = (playerName || "You").slice(0, 12);
    const oppName = online ? "Rival" : "Bot";
    const COL_ME = "#60a5fa", COL_OP = "#fb7185";

    /* ---------------- markup (minimal, scoped) ---------------- */
    root.innerHTML = `
<style>
.bdm{--bdm-fg:#e7ecf2;--bdm-mut:#8b95a3;--bdm-line:#ffffff16;--bdm-bg:#0f1216;
  color:var(--bdm-fg);font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto}
.bdm [hidden]{display:none!important}
.bdm .game-intro{display:flex;align-items:center;gap:12px;padding:4px 2px 12px}
.bdm .game-intro h2{margin:0;font-size:18px;font-weight:700;letter-spacing:.2px}
.bdm .game-intro p{margin:2px 0 0;font-size:12px;color:var(--bdm-mut)}
.bdm .bdm-spacer{flex:1}
.bdm .game-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--bdm-mut);
  border:1px solid var(--bdm-line);border-radius:999px;padding:5px 11px;white-space:nowrap}
.bdm .game-status-dot{width:7px;height:7px;border-radius:50%;background:#34d399;display:inline-block}
.bdm-btn{appearance:none;background:none;border:1px solid var(--bdm-line);color:var(--bdm-fg);
  border-radius:999px;padding:6px 13px;font-size:12px;font-weight:600;cursor:pointer;transition:border-color .15s}
.bdm-btn:hover{border-color:#ffffff40}
.bdm-btn.solid{background:#e7ecf2;color:#0f1216;border-color:transparent}
.bdm-btn .bdm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-left:6px;vertical-align:1px}
.bdm .game-panel{position:relative;border:1px solid var(--bdm-line);border-radius:18px;overflow:hidden;background:var(--bdm-bg)}
.bdm canvas{display:block;width:100%;aspect-ratio:480/840;touch-action:none;cursor:crosshair}
.bdm-score{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;
  background:#0f1216d9;border:1px solid var(--bdm-line);border-radius:999px;padding:6px 16px;font-size:13px;font-weight:700;pointer-events:none}
.bdm-score .n{display:flex;align-items:center;gap:6px}
.bdm-score .me{color:${COL_ME}} .bdm-score .op{color:${COL_OP}}
.bdm-score .sv{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:0}
.bdm-score .sv.on{opacity:1}
.bdm-score .num{font-size:17px;font-variant-numeric:tabular-nums}
.bdm-score .sep{color:var(--bdm-mut);font-weight:400}
.bdm-mp{font-size:10px;color:#f59e0b;border:1px solid #f59e0b55;border-radius:999px;padding:2px 7px;font-weight:700}
.bdm-shot{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;
  letter-spacing:.8px;color:var(--bdm-mut);background:#0f1216cc;border:1px solid var(--bdm-line);border-radius:999px;padding:5px 11px;pointer-events:none}
.bdm-shot i{width:7px;height:7px;border-radius:50%;background:#8b95a3}
.bdm-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0f1216b8;backdrop-filter:blur(3px)}
.bdm-card>div{background:#141920;border:1px solid var(--bdm-line);border-radius:16px;padding:22px 26px;text-align:center;min-width:220px}
.bdm-card h3{margin:0 0 4px;font-size:19px}
.bdm-card p{margin:0 0 16px;font-size:13px;color:var(--bdm-mut)}
.bdm-cheats{position:absolute;top:52px;right:10px;width:210px;background:#141920f2;border:1px solid var(--bdm-line);
  border-radius:14px;padding:12px 14px;font-size:12.5px}
.bdm-cheats header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:700;font-size:12px;letter-spacing:.6px;color:var(--bdm-mut)}
.bdm-cheats header button{background:none;border:none;color:var(--bdm-mut);cursor:pointer;font-size:15px;padding:0 2px}
.bdm-cheats label{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;cursor:pointer;border-top:1px solid #ffffff0d}
.bdm-cheats input{appearance:none;width:30px;height:17px;border-radius:999px;background:#2a323d;position:relative;cursor:pointer;transition:background .15s;flex:none}
.bdm-cheats input::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#8b95a3;transition:all .15s}
.bdm-cheats input:checked{background:#0ea5e9}
.bdm-cheats input:checked::after{left:15px;background:#fff}
.bdm-cheats .row{display:flex;gap:6px;margin-top:10px}
.bdm-cheats .row .bdm-btn{flex:1;padding:6px 4px;font-size:11.5px}
.bdm .game-actions{display:flex;justify-content:flex-end;padding-top:12px}
.bdm .game-action-button{appearance:none;background:none;border:1px solid var(--bdm-line);color:var(--bdm-mut);
  border-radius:999px;padding:7px 16px;font-size:12px;cursor:pointer}
.bdm .game-action-button:hover{color:var(--bdm-fg);border-color:#ffffff40}
</style>
<div class="game-app bdm">
  <div class="game-intro">
    <div><h2>Badminton</h2><p>${online ? "Online match" : "vs Bot"}</p></div>
    <span class="bdm-spacer"></span>
    ${online ? "" : '<button class="bdm-btn" type="button" data-cheats>Cheats<span class="bdm-dot" data-cheat-dot hidden></span></button>'}
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <canvas data-canvas></canvas>
    <div class="bdm-score">
      <span class="n me"><i class="sv" data-sv-me></i><span>${myName}</span><b class="num" data-sc-me>0</b></span>
      <span class="sep">:</span>
      <span class="n op"><b class="num" data-sc-op>0</b><span>${oppName}</span><i class="sv" data-sv-op></i></span>
      <span class="bdm-mp" data-mp hidden>MP</span>
    </div>
    <div class="bdm-shot"><i data-shot-dot></i><span data-shot-label>AUTO</span></div>
    <div class="bdm-cheats" data-cheat-panel hidden>
      <header><span>CHEATS</span><button type="button" data-cheat-close aria-label="Close">×</button></header>
      <label>Auto swing<input type="checkbox" data-cheat="auto"></label>
      <label>Big reach<input type="checkbox" data-cheat="reach"></label>
      <label>Slow shuttle<input type="checkbox" data-cheat="slow"></label>
      <label>Freeze bot<input type="checkbox" data-cheat="freeze"></label>
      <div class="row">
        <button class="bdm-btn" type="button" data-cheat-act="point">+1 point</button>
        <button class="bdm-btn" type="button" data-cheat-act="win">Win match</button>
      </div>
    </div>
    <div class="bdm-card" data-over hidden>
      <div>
        <h3 data-over-title>Match over</h3>
        <p data-over-score></p>
        <button class="bdm-btn solid" type="button" data-rematch>Rematch</button>
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const canvas = $("[data-canvas]"), ctx = canvas.getContext("2d");
    const elStatus = $("[data-status]"), elScMe = $("[data-sc-me]"), elScOp = $("[data-sc-op]");
    const elSvMe = $("[data-sv-me]"), elSvOp = $("[data-sv-op]"), elMp = $("[data-mp]");
    const elShotL = $("[data-shot-label]"), elShotD = $("[data-shot-dot]");
    const elOver = $("[data-over]"), elOverT = $("[data-over-title]"), elOverS = $("[data-over-score]");
    const elCheatPanel = $("[data-cheat-panel]"), elCheatDot = $("[data-cheat-dot]");

    /* ---------------- local (non-synced) ---------------- */
    const cheats = { auto: false, reach: false, slow: false, freeze: false };
    const keys = {};
    let shotSel = "auto";
    let me = { x: 240, y: 640, tx: 240, ty: 640 };       // local intent (world coords)
    let sm = null;                                       // guest smoothing
    let lastPhase = null, lastRally = -1, lastEvSeq = 0;
    const swingAnim = [null, null], lastSwingSeq = [0, 0];
    let trail = [], effects = [], shakeT = 0, netWobbleT = 0;
    let rafId = null, lastT = 0, acc = 0, lastPub = 0, lastMoveSend = 0;
    let aiThink = 0, aiTX = 240, aiTY = 200;
    const unsubs = [];

    const mySide = () => (state ? state.sides[playerIndex] : "B");
    const flip = () => mySide() === "T";
    const TX = (x) => (flip() ? W - x : x);
    const TY = (y) => (flip() ? H - y : y);
    const TA = (a) => (flip() ? a + Math.PI : a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function clampHalf(side, x, y) {
        const h = HALF[side];
        return { x: clamp(x, X_MIN, X_MAX), y: clamp(y, h.lo, h.hi) };
    }
    function toNorm(side, x, y) {
        const p = clampHalf(side, x, y), h = HALF[side];
        const v = side === "B" ? (p.y - h.lo) / (h.hi - h.lo) : (h.hi - p.y) / (h.hi - h.lo);
        return { u: (p.x - X_MIN) / (X_MAX - X_MIN), v: clamp(v, 0, 1) };
    }
    function fromNorm(side, u, v) {
        const h = HALF[side];
        const x = X_MIN + clamp(u, 0, 1) * (X_MAX - X_MIN);
        const y = side === "B" ? h.lo + clamp(v, 0, 1) * (h.hi - h.lo)
            : h.hi - clamp(v, 0, 1) * (h.hi - h.lo);
        return { x, y };
    }

    /* ---------------- canonical state (host / AI) ---------------- */
    function freshMatch() {
        const sides = online ? (Math.random() < 0.5 ? ["B", "T"] : ["T", "B"]) : ["B", "T"];
        const server = Math.random() < 0.5 ? 0 : 1;        // coin toss: who serves first
        const st = {
            v: 1, sides, score: [0, 0], server, phase: "serve", until: 0,
            players: [{ x: 240, y: 640, tx: 240, ty: 640, sw: 0, swType: "clear" },
            { x: 240, y: 200, tx: 240, ty: 200, sw: 0, swType: "clear" }],
            shuttle: null, rally: 0, winner: null, ev: { seq: 0, kind: "none" },
        };
        placeForServe(st);
        st.ev = { seq: 1, kind: "toss", server };
        return st;
    }
    function placeForServe(st) {
        const s = st.server, side = st.sides[s];
        const y = side === "B" ? CY1 - 55 : CY0 + 55;
        const x = 240 + (Math.random() * 80 - 40);
        st.players[s].x = st.players[s].tx = x;
        st.players[s].y = st.players[s].ty = y;
        st.phase = "serve";
        st.until = performance.now() + (isHuman(st, s) ? 3200 : 950);
        st.shuttle = null;
    }
    const isHuman = (st, i) => !online ? i === 0 : true;

    function publish() {
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function setEv(kind, data) {
        state.ev = { seq: state.ev.seq + 1, kind, ...data };
    }

    function doServe(i) {
        const p = state.players[i], side = state.sides[i];
        const dir = side === "B" ? -1 : 1;
        const topIdx = state.sides[0] === "T" ? 0 : 1;
        const opp = state.players[1 - i];
        const aimX = opp.x < 240 ? SX1 - 30 : SX0 + 30;
        const sh = makeShuttle(p.x, p.y + dir * 22, 50, 0, 0, 0, i);
        resolveShot(sh, "serve", i, aimX, topIdx);
        state.shuttle = sh;
        state.phase = "rally"; state.rally++;
        p.sw++; p.swType = "serve";
        publish();
    }

    function tryHit(i, shot) {
        const p = state.players[i], sh = state.shuttle;
        const now = performance.now();
        if (now - (p.lastSwing || 0) < SWING_CD) return;
        p.lastSwing = now;
        p.sw++;                                             // animate every attempt
        const reach = (!online && i === 0 && cheats.reach) ? REACH * 1.9 : (i === 1 && !online ? AI_REACH : REACH);
        const side = state.sides[i];
        const ownSide = side === "B" ? sh && sh.y > NET_Y : sh && sh.y < NET_Y;
        if (state.phase !== "rally" || !sh || !sh.live || sh.last === i || !ownSide ||
            sh.z > HIT_MAX_Z || Math.hypot(sh.x - p.x, sh.y - p.y) > reach) {
            p.swType = shot === "auto" ? "clear" : shot;
            return;
        }
        const topIdx = state.sides[0] === "T" ? 0 : 1;
        const opp = state.players[1 - i];
        let aimX = opp.x < 240 ? SX1 - 40 : SX0 + 40;
        if (!online && i === 1) aimX += Math.random() * 60 - 30;   // bot imperfection
        const type = shot === "auto"
            ? autoShot(sh, i === 1 && !online ? Math.random() : 0.3)
            : shot;
        const actual = resolveShot(sh, type, i, aimX, topIdx);
        p.swType = actual;
        publish();
    }

    function doSwing(i, shot) {
        if (!state) return;
        if (state.phase === "serve" && state.server === i) doServe(i);
        else if (state.phase === "rally") tryHit(i, shot);
    }

    function scorePoint(winner, cause, x, y, inCourt) {
        state.score[winner]++;
        state.server = winner;
        state.shuttle = null;
        setEv("point", { winner, cause, x, y, in: inCourt });
        const done = pointsWon(state.score[0], state.score[1]);
        if (done !== null) { endMatch(done); return; }
        state.phase = "point";
        state.until = performance.now() + 1250;
        publish();
    }

    function endMatch(winner) {
        state.winner = winner;
        state.phase = "over";
        setEv("over", { winner });
        publish();
    }

    function resetMatch() {
        const evSeq = state ? state.ev.seq : 0;
        state = freshMatch();
        state.ev.seq = evSeq + 1;
        lastRally = -1;
        publish();
    }

    /* ---------------- actions (template contract) ---------------- */
    function applyAction(action, actor) {
        if (!state || destroyed || (actor !== 0 && actor !== 1) || !action) return;
        switch (action.t) {
            case "move": {
                if (!Number.isFinite(action.u) || !Number.isFinite(action.v)) return;
                const p = fromNorm(state.sides[actor], action.u, action.v);
                state.players[actor].tx = p.x; state.players[actor].ty = p.y;
                break;
            }
            case "swing": {
                const shot = SHOT_ORDER.includes(action.shot) ? action.shot : "auto";
                doSwing(actor, shot);
                break;
            }
            case "rematch":
                if (state.phase === "over") resetMatch();
                break;
        }
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ---------------- AI ---------------- */
    function aiTick(dt, now) {
        const i = 1, p = state.players[i], sh = state.shuttle;
        if (state.phase === "serve" && state.server === i && now > state.until) { doServe(i); return; }
        if (cheats.freeze) return;
        const speed = AI_SPEED * (cheats.slow ? 0.55 : 1);
        if (state.phase === "rally" && sh && sh.live) {
            if (now > aiThink) {
                const topIdx = state.sides[0] === "T" ? 0 : 1;
                const sim = makeShuttle(sh.x, sh.y, sh.z, sh.vx, sh.vy, sh.vz, sh.last);
                sim.serving = sh.serving; sim.sideTop = topIdx;
                let guard = 0;
                while (sim.live && guard++ < 900) stepShuttle(sim, 16);
                const c = clampHalf("T", sim.x, Math.min(sim.y, NET_Y - 40));
                aiTX = c.x; aiTY = c.y;
                aiThink = now + 220;
            }
            p.tx = aiTX; p.ty = aiTY;
            if (sh.last !== i && sh.y < NET_Y && sh.z <= HIT_MAX_Z &&
                Math.hypot(sh.x - p.x, sh.y - p.y) <= AI_REACH) {
                doSwing(i, "auto");
            }
        } else {
            p.tx = 240; p.ty = 200;
        }
        moveToward(p, speed, dt);
    }

    function moveToward(p, speed, dt) {
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
            const step = Math.min(d, speed * dt);
            p.x += (dx / d) * step; p.y += (dy / d) * step;
            p.moving = true;
        } else p.moving = false;
    }

    /* ---------------- simulation tick (authority only) ---------------- */
    function tick(dt, now) {
        const pi = playerIndex;
        state.players[pi].tx = me.tx; state.players[pi].ty = me.ty;
        moveToward(state.players[pi], P_SPEED, dt);
        if (!online) aiTick(dt, now);
        else moveToward(state.players[1 - pi], P_SPEED, dt);

        if (state.phase === "serve") {
            if (isHuman(state, state.server) && now > state.until) doServe(state.server);
            if (!online && cheats.auto && state.server === 0) doServe(0);
        } else if (state.phase === "point") {
            if (now > state.until) { placeForServe(state); publish(); }
        } else if (state.phase === "rally" && state.shuttle) {
            const sh = state.shuttle;
            const scale = !online && cheats.slow ? 0.55 : 1;
            acc += dt * scale;
            const step = 1 / 120; let n = 0;
            while (acc >= step && n++ < 6 && sh.live) {
                acc -= step;
                const ev = stepShuttle(sh, step * 1000);
                if (ev) { scorePoint(ev.winner, ev.type, ev.x, ev.y, ev.in); break; }
            }
            if (!online && cheats.auto && state.phase === "rally") tryHit(0, "auto");
        }
    }

    /* ---------------- effects & animation watchers ---------------- */
    function spawnFromState(now) {
        if (!state) return;
        for (let i = 0; i < 2; i++) {
            const p = state.players[i];
            if (p.sw !== lastSwingSeq[i]) {
                lastSwingSeq[i] = p.sw;
                swingAnim[i] = { type: p.swType, start: now };
                if (p.swType === "smash") {
                    effects.push({ kind: "spark", x: p.x, y: p.y, start: now, dur: 260, col: SHOTS.smash.col });
                    shakeT = now;
                }
            }
        }
        if (state.rally !== lastRally) { lastRally = state.rally; trail = []; }
        const ev = state.ev;
        if (ev.seq !== lastEvSeq) {
            lastEvSeq = ev.seq;
            if (ev.kind === "toss") {
                effects.push({
                    kind: "text", start: now, dur: 1300, size: 24,
                    text: ev.server === playerIndex ? "Your serve" : `${oppName} serves`,
                    col: ev.server === playerIndex ? COL_ME : COL_OP
                });
            } else if (ev.kind === "point") {
                const col = ev.winner === playerIndex ? COL_ME : COL_OP;
                if (ev.cause === "net") netWobbleT = now;
                if (ev.x != null) {
                    effects.push({
                        kind: "ring", x: ev.x, y: ev.y, start: now, dur: 600,
                        col: ev.in ? col : "#9aa4af"
                    });
                    if (!ev.in) effects.push({ kind: "label", x: ev.x, y: ev.y, start: now, dur: 800, text: "OUT", col: "#9aa4af" });
                }
                effects.push({
                    kind: "text", start: now, dur: 1100, size: 30,
                    text: ev.winner === playerIndex ? `${myName} +1` : `${oppName} +1`, col
                });
            }
        }
        if (state.phase !== lastPhase) {
            lastPhase = state.phase;
            if (state.phase === "serve" && state.server === playerIndex) {
                const p = state.players[playerIndex];
                me.x = me.tx = p.x; me.y = me.ty = p.y;
                if (sm) { sm.players[playerIndex].x = p.x; sm.players[playerIndex].y = p.y; }
            }
            elOver.hidden = state.phase !== "over";
            if (state.phase === "over") {
                const win = state.winner === playerIndex;
                elOverT.textContent = win ? "You win" : `${oppName} wins`;
                elOverT.style.color = win ? COL_ME : COL_OP;
                elOverS.textContent = `${state.score[playerIndex]} : ${state.score[1 - playerIndex]}`;
            }
        }
    }

    /* ---------------- rendering ---------------- */
    let scale = 1;
    function resize() {
        const w = canvas.clientWidth || 480;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(w * (H / W) * dpr);
        scale = canvas.width / W;
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function guestSmooth(dt) {
        if (!state) return null;
        if (!sm) sm = { players: state.players.map((p) => ({ x: p.x, y: p.y })), shuttle: null };
        for (let i = 0; i < 2; i++) {
            sm.players[i].x += (state.players[i].x - sm.players[i].x) * 0.35;
            sm.players[i].y += (state.players[i].y - sm.players[i].y) * 0.35;
        }
        const sh = state.shuttle;
        if (sh && sh.live) {
            if (!sm.shuttle) sm.shuttle = { ...sh };
            else {
                sm.shuttle.x += sm.shuttle.vx * dt; sm.shuttle.y += sm.shuttle.vy * dt;
                sm.shuttle.z = Math.max(0, sm.shuttle.z + sm.shuttle.vz * dt);
                sm.shuttle.x += (sh.x - sm.shuttle.x) * 0.4;
                sm.shuttle.y += (sh.y - sm.shuttle.y) * 0.4;
                sm.shuttle.z += (sh.z - sm.shuttle.z) * 0.4;
                sm.shuttle.vx = sh.vx; sm.shuttle.vy = sh.vy; sm.shuttle.vz = sh.vz;
            }
        } else sm.shuttle = null;
        const rs = { ...state, players: state.players.map((p, i) => ({ ...p, ...sm.players[i] })) };
        rs.players[playerIndex].x = me.x; rs.players[playerIndex].y = me.y;
        rs.shuttle = sm.shuttle;
        return rs;
    }

    function drawCourt(now) {
        ctx.fillStyle = "#0f1216"; ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (flip()) { ctx.translate(W, H); ctx.rotate(Math.PI); }
        ctx.fillStyle = "#12303b";
        ctx.fillRect(CX0 - 14, CY0 - 14, CX1 - CX0 + 28, CY1 - CY0 + 28);
        ctx.strokeStyle = "#dbe4ea"; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
        ctx.strokeRect(CX0, CY0, CX1 - CX0, CY1 - CY0);
        ctx.beginPath();
        ctx.moveTo(SX0, CY0); ctx.lineTo(SX0, CY1); ctx.moveTo(SX1, CY0); ctx.lineTo(SX1, CY1);
        ctx.moveTo(CX0, NET_Y - SSL); ctx.lineTo(CX1, NET_Y - SSL);
        ctx.moveTo(CX0, NET_Y + SSL); ctx.lineTo(CX1, NET_Y + SSL);
        ctx.moveTo(CX0, CY0 + 38); ctx.lineTo(CX1, CY0 + 38);
        ctx.moveTo(CX0, CY1 - 38); ctx.lineTo(CX1, CY1 - 38);
        ctx.moveTo(240, CY0); ctx.lineTo(240, NET_Y - SSL);
        ctx.moveTo(240, NET_Y + SSL); ctx.lineTo(240, CY1);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const wob = now - netWobbleT < 350 ? Math.sin((now - netWobbleT) / 28) * 5 * (1 - (now - netWobbleT) / 350) : 0;
        ctx.strokeStyle = "#e8edf2"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(CX0 - 10, NET_Y);
        ctx.quadraticCurveTo(240, NET_Y + wob, CX1 + 10, NET_Y); ctx.stroke();
        ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(CX0 - 10, NET_Y + 5); ctx.lineTo(CX1 + 10, NET_Y + 5); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath(); ctx.arc(CX0 - 10, NET_Y, 4, 0, 7); ctx.arc(CX1 + 10, NET_Y, 4, 0, 7); ctx.fill();
        ctx.restore();
    }

    function drawPlayer(p, i, rs, now) {
        const isMe = i === playerIndex;
        const col = isMe ? COL_ME : COL_OP;
        const x = TX(p.x), y = TY(p.y);
        const side = rs.sides[i];
        const facing = TA(side === "B" ? -Math.PI / 2 : Math.PI / 2);
        if (rs.phase === "serve" && rs.server === i) {
            const pulse = 1 + Math.sin(now / 220) * 0.12;
            ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 22 * pulse, 0, 7); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        const bob = p.moving ? Math.sin(now / 85) * 1.3 : 0;
        let ang = facing + 0.55, trailArc = null;
        const an = swingAnim[i];
        if (an) {
            const prof = SHOTS[an.type] || SHOTS.clear;
            const t = (now - an.start) / prof.dur;
            if (t < 1.35) {
                const e = 1 - Math.pow(1 - Math.min(1, t), 3);
                ang = facing + prof.a0 + (prof.a1 - prof.a0) * e;
                if (t < 1) trailArc = { from: facing + prof.a0, to: ang, col: prof.col, a: 1 - t };
            } else swingAnim[i] = null;
        }
        if (trailArc) {
            ctx.strokeStyle = trailArc.col; ctx.globalAlpha = trailArc.a * 0.55; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y + bob, 25, Math.min(trailArc.from, trailArc.to), Math.max(trailArc.from, trailArc.to));
            ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * 10, y + bob + Math.sin(ang) * 10);
        ctx.lineTo(x + Math.cos(ang) * 24, y + bob + Math.sin(ang) * 24); ctx.stroke();
        ctx.strokeStyle = "#e8edf2"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * 29, y + bob + Math.sin(ang) * 29, 5.5, 7.5, ang, 0, 7); ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y + bob, 13, 0, 7); ctx.fill();
        ctx.fillStyle = "#0f1216"; ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.arc(x, y + bob, 13, 0, 7); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y + bob, 10, 0, 7); ctx.fill();
        ctx.fillStyle = "#e8edf2";
        ctx.beginPath(); ctx.arc(x + Math.cos(facing) * 3, y + bob + Math.sin(facing) * 3 - 2, 4.5, 0, 7); ctx.fill();
    }

    function drawShuttle(sh, rs, now) {
        let x, y, z, vx, vy, vz;
        if (sh && sh.live) { ({ x, y, z, vx, vy, vz } = sh); }
        else if (rs.phase === "serve") {
            const p = rs.players[rs.server], dir = rs.sides[rs.server] === "B" ? -1 : 1;
            x = p.x; y = p.y + dir * 20; z = 40; vx = 0; vy = dir * 10; vz = 0;
        } else return;
        const gx = TX(x), gy = TY(y);
        const hFade = clamp(1 - z / 520, 0.25, 1);
        ctx.fillStyle = "#000"; ctx.globalAlpha = 0.3 * hFade;
        ctx.beginPath(); ctx.ellipse(gx, gy, 7 * hFade + 2, 3.5 * hFade + 1, 0, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        const sx = gx, sy = gy - z * 0.5;
        const svx = flip() ? -vx : vx, svy = (flip() ? -vy : vy) - vz * 0.5;
        const ang = Math.atan2(svy, svx);
        const sc = 1 + z / 420;
        const col = SHOTS[rs.players[sh ? sh.last : rs.server]?.swType]?.col || "#e8edf2";
        if (sh && sh.live) {
            trail.push({ x: sx, y: sy, col });
            if (trail.length > 14) trail.shift();
            for (let i = 1; i < trail.length; i++) {
                ctx.strokeStyle = trail[i].col; ctx.globalAlpha = (i / trail.length) * 0.35;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(ang); ctx.scale(sc, sc);
        ctx.fillStyle = "#f8fafc"; ctx.strokeStyle = "#0f1216"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-9, -6); ctx.lineTo(-6, 0); ctx.lineTo(-9, 6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-13, -8); ctx.moveTo(-6, 0); ctx.lineTo(-13, 0);
        ctx.moveTo(-9, 6); ctx.lineTo(-13, 8); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(3.5, 0, 3.4, 0, 7); ctx.fill();
        ctx.restore();
    }

    function drawEffects(now) {
        effects = effects.filter((e) => now - e.start < e.dur);
        for (const e of effects) {
            const t = (now - e.start) / e.dur;
            if (e.kind === "ring") {
                ctx.strokeStyle = e.col; ctx.globalAlpha = 1 - t; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(TX(e.x), TY(e.y), 6 + t * 30, 0, 7); ctx.stroke();
            } else if (e.kind === "spark") {
                ctx.strokeStyle = e.col; ctx.globalAlpha = 1 - t; ctx.lineWidth = 2;
                const x = TX(e.x), y = TY(e.y);
                for (let k = 0; k < 8; k++) {
                    const a = (k / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * (14 + t * 16), y + Math.sin(a) * (14 + t * 16));
                    ctx.lineTo(x + Math.cos(a) * (22 + t * 26), y + Math.sin(a) * (22 + t * 26));
                    ctx.stroke();
                }
            } else if (e.kind === "label") {
                ctx.globalAlpha = 1 - t; ctx.fillStyle = e.col;
                ctx.font = "700 12px system-ui"; ctx.textAlign = "center";
                ctx.fillText(e.text, TX(e.x), TY(e.y) - 14 - t * 10);
            } else if (e.kind === "text") {
                ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
                ctx.fillStyle = e.col; ctx.font = `300 ${e.size}px system-ui`; ctx.textAlign = "center";
                ctx.fillText(e.text, W / 2, H * 0.42);
            }
            ctx.globalAlpha = 1;
        }
    }

    const hudCache = {};
    function setText(el, key, val) { if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; } }

    function render(now, dt) {
        spawnFromState(now);
        const rs = authority ? state : guestSmooth(dt);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        if (now - shakeT < 150) {
            const s = 3 * (1 - (now - shakeT) / 150);
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        drawCourt(now);
        if (!rs) { setText(elStatus, "st", "Waiting for host"); return; }
        drawPlayer(rs.players[1 - playerIndex], 1 - playerIndex, rs, now);
        drawPlayer(rs.players[playerIndex], playerIndex, rs, now);
        drawShuttle(rs.shuttle, rs, now);
        drawEffects(now);

        setText(elScMe, "sm", String(rs.score[playerIndex]));
        setText(elScOp, "so", String(rs.score[1 - playerIndex]));
        elSvMe.classList.toggle("on", rs.server === playerIndex && rs.phase !== "over");
        elSvOp.classList.toggle("on", rs.server !== playerIndex && rs.phase !== "over");
        const a = rs.score[playerIndex], b = rs.score[1 - playerIndex];
        elMp.hidden = !((a >= TARGET - 1 || b >= TARGET - 1) && Math.abs(a - b) >= 1 && rs.phase !== "over");
        const st = rs.phase === "serve" ? (rs.server === playerIndex ? "Your serve" : `${oppName} serves`)
            : rs.phase === "rally" ? "Rally" : rs.phase === "point" ? "Point" : "Match over";
        setText(elStatus, "st", st);
        setText(elShotL, "sh", shotSel.toUpperCase());
        elShotD.style.background = shotSel === "auto" ? "#8b95a3" : SHOTS[shotSel].col;
    }

    /* ---------------- main loop ---------------- */
    function loop(t) {
        if (destroyed) return;
        const dt = Math.min(0.04, (t - lastT) / 1000 || 0.016);
        lastT = t;
        const now = performance.now();

        /* local intent from keyboard */
        let kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        let ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        if (kx || ky) {
            const f = flip() ? -1 : 1;
            const n = Math.hypot(kx, ky);
            me.tx += (kx / n) * P_SPEED * dt * f;
            me.ty += (ky / n) * P_SPEED * dt * f;
            const c = clampHalf(mySide(), me.tx, me.ty);
            me.tx = c.x; me.ty = c.y;
        }
        if (authority) {
            if (state) tick(dt, now);
            if (online && state && now - lastPub > 80) { lastPub = now; publish(); }
        } else {
            const c = clampHalf(mySide(), me.tx, me.ty);
            me.tx = c.x; me.ty = c.y;
            me.x += (me.tx - me.x) * Math.min(1, dt * 14);
            me.y += (me.ty - me.y) * Math.min(1, dt * 14);
            if (state && now - lastMoveSend > 60) {
                lastMoveSend = now;
                const n = toNorm(mySide(), me.tx, me.ty);
                room.sendAction({ t: "move", u: n.u, v: n.v }).catch(console.warn);
            }
        }
        render(now, dt);
        rafId = requestAnimationFrame(loop);
    }

    /* ---------------- input: keyboard + mouse + touch ---------------- */
    function cycleShot(dirn) {
        const i = (SHOT_ORDER.indexOf(shotSel) + dirn + SHOT_ORDER.length) % SHOT_ORDER.length;
        shotSel = SHOT_ORDER[i];
    }
    function swingInput() {
        if (!state) return;
        if (state.phase === "over") { submitAction({ t: "rematch" }); return; }
        submitAction({ t: "swing", shot: shotSel });
    }

    const onKeyDown = (e) => {
        if (destroyed) return;
        const k = e.key;
        const map = {
            ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right",
            ArrowUp: "up", w: "up", ArrowDown: "down", s: "down"
        };
        if (map[k]) { e.preventDefault(); keys[map[k]] = true; return; }
        if (k === " " || k === "Enter" || k === "j") { e.preventDefault(); swingInput(); }
        else if (k === "1" || k === "c" || k === "C") shotSel = "clear";
        else if (k === "2" || k === "v" || k === "V") shotSel = "drop";
        else if (k === "3" || k === "x" || k === "X") shotSel = "smash";
        else if (k === "0" || k === "q" || k === "Q") shotSel = "auto";
        else if (k === "r" || k === "R") { if (state?.phase === "over") submitAction({ t: "rematch" }); }
        else if (k === "Escape") elCheatPanel.hidden = true;
        else if (k === "`" && !online) elCheatPanel.hidden = !elCheatPanel.hidden;
    };
    const onKeyUp = (e) => {
        const map = {
            ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right",
            ArrowUp: "up", w: "up", ArrowDown: "down", s: "down"
        };
        if (map[e.key]) keys[map[e.key]] = false;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    function canvasPos(e) {
        const r = canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        const y = ((e.clientY - r.top) / r.height) * H;
        return { x: flip() ? W - x : x, y: flip() ? H - y : y };   // world coords
    }
    let ptr = null, touchCount = 0;
    const onPointerDown = (e) => {
        canvas.setPointerCapture?.(e.pointerId);
        touchCount++;
        if (e.pointerType !== "mouse" && touchCount >= 2) { cycleShot(1); ptr = null; return; }
        const p = canvasPos(e);
        ptr = { id: e.pointerId, sx: p.x, sy: p.y, px: me.tx, py: me.ty, t: performance.now(), moved: 0, mouse: e.pointerType === "mouse" };
        if (ptr.mouse) { const c = clampHalf(mySide(), p.x, p.y); me.tx = c.x; me.ty = c.y; }
    };
    const onPointerMove = (e) => {
        const p = canvasPos(e);
        if (e.pointerType === "mouse" && (!ptr || ptr.id === e.pointerId)) {
            const c = clampHalf(mySide(), p.x, p.y); me.tx = c.x; me.ty = c.y;
        }
        if (ptr && ptr.id === e.pointerId) {
            const dx = p.x - ptr.sx, dy = p.y - ptr.sy;
            ptr.moved = Math.max(ptr.moved, Math.hypot(dx, dy));
            if (!ptr.mouse) {
                const c = clampHalf(mySide(), ptr.px + dx * 1.35, ptr.py + dy * 1.35);
                me.tx = c.x; me.ty = c.y;
            }
        }
    };
    const onPointerUp = (e) => {
        touchCount = Math.max(0, touchCount - 1);
        if (ptr && ptr.id === e.pointerId) {
            if (performance.now() - ptr.t < 230 && ptr.moved < 12) swingInput();
            ptr = null;
        }
    };
    const onWheel = (e) => { e.preventDefault(); cycleShot(e.deltaY > 0 ? 1 : -1); };
    const onCtx = (e) => e.preventDefault();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onCtx);

    /* ---------------- click delegation (template contract) ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-rematch]")) { submitAction({ t: "rematch" }); return; }
        if (!online) {
            if (t.closest("[data-cheats]")) { elCheatPanel.hidden = !elCheatPanel.hidden; return; }
            if (t.closest("[data-cheat-close]")) { elCheatPanel.hidden = true; return; }
            const cb = t.closest("[data-cheat]");
            if (cb) {
                cheats[cb.dataset.cheat] = cb.checked;
                elCheatDot.hidden = !Object.values(cheats).some(Boolean);
                return;
            }
            const ca = t.closest("[data-cheat-act]");
            if (ca && state && authority) {
                if (ca.dataset.cheatAct === "point" && state.phase !== "over") scorePoint(0, "cheat");
                else if (ca.dataset.cheatAct === "win" && state.phase !== "over") {
                    state.score[0] = Math.min(CAP, Math.max(TARGET, state.score[1] + 2));
                    endMatch(0);
                }
            }
        }
    }
    root.addEventListener("click", handleClick);

    /* ---------------- boot / networking ---------------- */
    if (online) {
        const u = room.onRoom((nextRoom) => { if (!destroyed) roomData = nextRoom; });
        if (typeof u === "function") unsubs.push(u);
        if (room.isHost) {
            state = freshMatch();
            me = { x: state.players[0].x, y: state.players[0].y, tx: state.players[0].x, ty: state.players[0].y };
            publish();
            const ua = room.onAction((action) => applyAction(action, 1));
            if (typeof ua === "function") unsubs.push(ua);
        } else {
            const us = room.onState((nextState) => {
                if (destroyed || !nextState) return;
                const first = !state;
                state = nextState;
                if (first) {
                    const p = state.players[playerIndex];
                    me = { x: p.x, y: p.y, tx: p.x, ty: p.y };
                }
            });
            if (typeof us === "function") unsubs.push(us);
        }
    } else {
        state = freshMatch();
        me = { x: state.players[0].x, y: state.players[0].y, tx: state.players[0].x, ty: state.players[0].y };
    }
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);

    return {
        destroy() {
            destroyed = true;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            ro.disconnect();
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            root.removeEventListener("click", handleClick);
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointermove", onPointerMove);
            canvas.removeEventListener("pointerup", onPointerUp);
            canvas.removeEventListener("pointercancel", onPointerUp);
            canvas.removeEventListener("wheel", onWheel);
            canvas.removeEventListener("contextmenu", onCtx);
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}