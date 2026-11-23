/* ==== GAME: bowling.js ==== */
/* Minimal ten-pin bowling. Real 2D physics (ball / pin / kickback collisions),
   10 frames, classic scoring. vs Bot (local) or vs friend (room, host-authoritative).
   Controls: aim (mouse / drag / arrows) + hold-release BOWL (space / button / click lane).
   No tutorial, no levels. Cheats overlay (offline only). Random first player & seats. */

export const META = {
    id: "bowling",
    name: "Bowling",
    category: "sports",
    catLabel: "Sports",
    desc: "Minimal ten-pin bowling with real physics. Beat the bot or a friend over 10 frames.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="34" r="9"/><path d="M20 28c-2-6 0-9 1-12M28 28c2-6 0-9-1-12"/><circle cx="21.5" cy="14" r="1.6" fill="currentColor" stroke="none"/><circle cx="26.5" cy="14" r="1.6" fill="currentColor" stroke="none"/></svg>',
    bg: ["#a5b4fc", "#6366f1"],
    bestKey: "bowlingBest",
};

/* ================= pure rules & physics (deterministic) ================= */
const FRAMES = 10, PINS = 10;
const LANE_X0 = 130, LANE_X1 = 330, BALL_Y = 566;
const AIM_MIN = 150, AIM_MAX = 310;
const PIN_DX = 28, HEAD_Y = 208, ROW_DY = 30;
const DT = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const allPins = () => Array.from({ length: PINS }, (_, i) => i);

/* head pin faces the bowler; rows recede up the lane */
const PIN_POS = [];
for (let row = 0; row < 4; row++)
    for (let c = 0; c <= row; c++)
        PIN_POS.push({ x: 230 - (row * PIN_DX) / 2 + c * PIN_DX, y: HEAD_Y - row * ROW_DY });

function lcg(seed) {
    let s = (seed | 0) & 0x7fffffff;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/* impulse-based circle physics: ball plows the rack, pins chain off each
   other and the kickback walls. Fixed timestep => identical on every client. */
function createSim(p, standing, cheat) {
    const rnd = lcg(p.seed);
    const ball = {
        x: p.x0, y: BALL_Y, vx: 0, vy: -(140 + 660 * p.power),
        r: cheat ? 24 : 10, m: cheat ? 30 : 12, active: true, gutter: false,
    };
    const pins = standing.map((i) => ({
        i, x: PIN_POS[i].x + (rnd() - .5) * .8, y: PIN_POS[i].y + (rnd() - .5) * .8,
        hx: PIN_POS[i].x, hy: PIN_POS[i].y, vx: 0, vy: 0, r: 7, m: 1,
        down: false, active: true,
    }));
    let t = 0, done = false;

    function collide(a, b, e) {
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) return;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const ia = 1 / a.m, ib = 1 / b.m, ov = rr - d;
        a.x -= nx * ov * ia / (ia + ib); a.y -= ny * ov * ia / (ia + ib);
        b.x += nx * ov * ib / (ia + ib); b.y += ny * ov * ib / (ia + ib);
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
            const j = -(1 + e) * rvn / (ia + ib);
            a.vx -= j * ia * nx; a.vy -= j * ia * ny;
            b.vx += j * ib * nx; b.vy += j * ib * ny;
        }
    }

    function step() {
        if (done) return;
        t += DT;
        if (ball.active) {
            if (!ball.gutter && ball.y < 430) ball.vx += p.hook * 330 * DT; /* late hook */
            const sp = Math.hypot(ball.vx, ball.vy);
            if (sp > 0) { const f = Math.max(0, sp - 14 * DT) / sp; ball.vx *= f; ball.vy *= f; }
            ball.x += ball.vx * DT; ball.y += ball.vy * DT;
            if (!ball.gutter) {
                if (ball.x - ball.r < LANE_X0) { ball.gutter = true; ball.x = LANE_X0 - 13; ball.vx = 0; }
                else if (ball.x + ball.r > LANE_X1) { ball.gutter = true; ball.x = LANE_X1 + 13; ball.vx = 0; }
            }
            if (ball.y < 40 || (sp < 20 && ball.y > 110)) ball.active = false;
        }
        for (const q of pins) {
            if (!q.active) continue;
            const sp = Math.hypot(q.vx, q.vy);
            if (sp > 0) { const f = Math.max(0, sp - 380 * DT) / sp; q.vx *= f; q.vy *= f; }
            q.x += q.vx * DT; q.y += q.vy * DT;
            if (q.y < 250) { /* kickback walls */
                if (q.x - q.r < LANE_X0 - 18) { q.x = LANE_X0 - 18 + q.r; q.vx = Math.abs(q.vx) * .6; }
                else if (q.x + q.r > LANE_X1 + 18) { q.x = LANE_X1 + 18 - q.r; q.vx = -Math.abs(q.vx) * .6; }
            }
            if (!q.down && (Math.hypot(q.x - q.hx, q.y - q.hy) > 13 || sp > 85)) q.down = true;
            if (q.x < LANE_X0 - 30 || q.x > LANE_X1 + 30 || q.y < 56 || q.y > 300) { q.active = false; q.down = true; }
        }
        if (ball.active && !ball.gutter)
            for (const q of pins) if (q.active) collide(ball, q, .55);
        for (let a = 0; a < pins.length; a++)
            for (let b = a + 1; b < pins.length; b++)
                if (pins[a].active && pins[b].active) collide(pins[a], pins[b], .65);
        const moving = pins.some((q) => q.active && (Math.abs(q.vx) > 6 || Math.abs(q.vy) > 6));
        if ((!ball.active || ball.y < 80) && !moving) done = true;
        if (t > 4.5) done = true;
    }

    return {
        ball, pins, step,
        get done() { return done; },
        get time() { return t; },
        knocked: () => pins.filter((q) => q.down).map((q) => q.i).sort((a, b) => a - b),
    };
}

function simulateRoll(p, standing, cheat) {
    const sim = createSim(p, standing, cheat);
    let n = 0;
    while (!sim.done && n++ < 1200) sim.step();
    return { knocked: cheat ? standing.slice() : sim.knocked(), dur: sim.time };
}

/* classic ten-pin scoring; cum stays null until bonuses are known */
function scoreGame(rolls) {
    const frames = [];
    let total = 0, i = 0;
    for (let f = 0; f < 9; f++) {
        const a = rolls[i], b = rolls[i + 1];
        if (a === 10) {
            const b1 = rolls[i + 1], b2 = rolls[i + 2], known = b1 !== undefined && b2 !== undefined;
            if (known) total += 10 + b1 + b2;
            frames.push({ rolls: [10], cum: known ? total : null }); i += 1;
        } else if (a !== undefined && b !== undefined && a + b === 10) {
            const b2 = rolls[i + 2], known = b2 !== undefined;
            if (known) total += 10 + b2;
            frames.push({ rolls: [a, b], cum: known ? total : null }); i += 2;
        } else if (a !== undefined && b !== undefined) {
            total += a + b; frames.push({ rolls: [a, b], cum: total }); i += 2;
        } else {
            frames.push({ rolls: a !== undefined ? [a] : [], cum: null }); i += 2;
        }
    }
    const t = rolls.slice(i);
    const complete = (t.length === 2 && t[0] + t[1] < 10) || t.length === 3;
    if (complete) total += t.reduce((s, v) => s + v, 0);
    frames.push({ rolls: t, cum: complete ? total : null, tenth: true });
    return { frames, total, complete };
}

function frameInfo(rolls) {
    let i = 0;
    for (let f = 0; f < 9; f++) {
        const a = rolls[i];
        if (a === undefined) return { frame: f, rolls: [] };
        if (a === 10) { i += 1; continue; }
        const b = rolls[i + 1];
        if (b === undefined) return { frame: f, rolls: [a] };
        i += 2;
    }
    return { frame: 9, rolls: rolls.slice(i) };
}
const tenthAllowed = (fr) =>
    fr[0] === 10 || (fr.length >= 2 && fr[0] + fr[1] === 10) ? 3 : 2;

function marks(fr) {
    const out = []; let open = true, prev = 0;
    for (const r of fr.rolls) {
        if (open && r === 10) { out.push("X"); open = true; }
        else if (!open && prev + r === 10) { out.push("/"); open = true; }
        else { out.push(r === 0 ? "–" : String(r)); open = false; }
        prev = r;
    }
    return out.join(" ");
}

/* ================= mount ================= */
export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);

    let state = null, destroyed = false;
    let animId = null, animRaf = null, meterRaf = null;
    let aiTimer = null, advanceTimer = null, bannerTimer = null;
    let aimX = 230, hookVal = 0, charging = false, chargeT0 = 0, powerVal = 0;
    let lastTurnKey = "", animRefs = null;
    const offs = [];
    const cheats = { guide: false, pocket: false, power: false, strike: false, weak: false };
    const CHEAT_ROWS = [
        ["guide", "Guide line"], ["pocket", "Pocket lock"], ["power", "Full power"],
        ["strike", "Auto strike"], ["weak", "Weak bot"],
    ];

    /* ---------- DOM ---------- */
    root.innerHTML = `
<div class="game-app bw">
<style>
.bw{max-width:480px;margin:0 auto;color:#e5e7eb;font-variant-numeric:tabular-nums}
.bw .game-intro h2{margin:0;font-size:18px;font-weight:700;letter-spacing:.02em}
.bw [hidden]{display:none!important}
.bw-panel{position:relative;display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid #ffffff14;border-radius:16px;background:#ffffff05}
.bw-score{display:grid;grid-template-columns:58px repeat(10,1fr) 34px;gap:2px;font-size:9.5px;user-select:none}
.bw-score .n{display:flex;align-items:center;font-weight:700;font-size:10px;color:#9ca3af;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-right:4px}
.bw-score .n.me{color:#a5b4fc}
.bw-score .c{border:1px solid #ffffff10;border-radius:5px;min-height:32px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.bw-score .c.cur{border-color:#818cf8}
.bw-score .m{text-align:center;color:#cbd5e1;padding:1px 0;letter-spacing:.05em}
.bw-score .t{text-align:center;font-weight:700;color:#f9fafb;border-top:1px solid #ffffff0d;padding:1px 0}
.bw-score .tot{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#a5b4fc}
.bw-lane{position:relative;width:min(100%,380px);margin:0 auto;aspect-ratio:360/620;touch-action:none;user-select:none;-webkit-user-select:none}
.bw-lane svg{width:100%;height:100%;display:block;border-radius:12px}
.bw-banner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:26px;font-weight:800;letter-spacing:.35em;color:#fff;text-shadow:0 2px 18px #000a;animation:bwpop .9s ease forwards}
@keyframes bwpop{0%{opacity:0;transform:scale(.85)}18%{opacity:1;transform:scale(1)}75%{opacity:1}100%{opacity:0}}
.bw-meter{height:4px;border-radius:99px;background:#ffffff12;overflow:hidden}
.bw-meter i{display:block;height:100%;width:0;background:#818cf8;transition:none}
.bw-pad{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bw-pad button,.bw-hooks button,.bw-cheatbtn,.bw-sheet button,.bw-over button{font:inherit;color:#e5e7eb;background:transparent;border:1px solid #ffffff1c;border-radius:10px;cursor:pointer;touch-action:manipulation}
.bw-pad button:hover,.bw-hooks button:hover,.bw-cheatbtn:hover{background:#ffffff10}
.bw-pad .nav{width:52px;height:46px;font-size:15px}
.bw-hooks{display:flex;gap:6px}
.bw-hooks button{width:44px;height:46px;font-size:15px;color:#9ca3af}
.bw-hooks button.on{border-color:#818cf8;color:#a5b4fc}
.bw button:disabled{opacity:.3;cursor:default;pointer-events:none}
.bw-bowl{width:100%;padding:14px;border:none;border-radius:12px;background:#818cf8;color:#0b1020;font:inherit;font-weight:800;font-size:14px;letter-spacing:.3em;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.bw-bowl:active{background:#6d78f0}
.bw-bowl:disabled{opacity:.3;cursor:default}
.bw-meta{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#6b7280}
.bw-cheatbtn{padding:5px 12px;font-size:11px;letter-spacing:.08em;color:#9ca3af}
.bw-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:#0b1020d9;backdrop-filter:blur(6px);border-radius:16px}
.bw-card{display:flex;flex-direction:column;gap:12px;align-items:center;padding:26px 30px;text-align:center}
.bw-card h3{margin:0;font-size:22px;font-weight:800;letter-spacing:.04em}
.bw-card p{margin:0;font-size:13px;color:#9ca3af}
.bw-card button{padding:10px 26px;font-weight:700}
.bw-card button:hover{background:#ffffff10}
.bw-sheet{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:#0b1020e6;backdrop-filter:blur(6px);border-radius:16px}
.bw-sheet .in{width:min(86%,300px);display:flex;flex-direction:column;gap:8px}
.bw-sheet .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.bw-sheet .hd b{font-size:13px;letter-spacing:.25em;color:#9ca3af}
.bw-sheet .hd button{width:30px;height:30px}
.bw-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;font-size:13px}
.bw-row .sw{width:36px;height:20px;border-radius:99px;border:1px solid #ffffff2a;position:relative}
.bw-row .sw::after{content:"";position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:99px;background:#6b7280;transition:left .15s,background .15s}
.bw-row.on .sw{border-color:#818cf8}
.bw-row.on .sw::after{left:19px;background:#818cf8}
.bw .game-status{font-size:12px;color:#9ca3af}
@media (max-width:420px){.bw-score{grid-template-columns:44px repeat(10,1fr) 28px;font-size:8.5px}.bw-score .n{font-size:9px}}
</style>
  <div class="game-intro">
    <div><h2>Bowling</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel bw-panel" data-board>
    <div class="bw-score" data-score></div>
    <div class="bw-lane" data-lane>
      <svg viewBox="0 0 360 620" data-svg aria-hidden="true"></svg>
      <div class="bw-banner" data-banner hidden></div>
    </div>
    <div class="bw-meter"><i data-mfill></i></div>
    <div class="bw-pad">
      <button type="button" class="nav" data-act="left" aria-label="Aim left">◀</button>
      <div class="bw-hooks">
        <button type="button" data-hook="-1" aria-label="Hook left">↰</button>
        <button type="button" data-hook="0" aria-label="Straight">↑</button>
        <button type="button" data-hook="1" aria-label="Hook right">↱</button>
      </div>
      <button type="button" class="nav" data-act="right" aria-label="Aim right">▶</button>
    </div>
    <button type="button" class="bw-bowl" data-act="bowl">BOWL</button>
    <div class="bw-meta">
      <button type="button" class="bw-cheatbtn" data-act="cheats" ${online ? "hidden" : ""}>CHEATS</button>
      <span data-best></span>
    </div>
    <div class="bw-ov" data-over hidden>
      <div class="bw-card">
        <h3 data-ov-title></h3>
        <p data-ov-score></p>
        <button type="button" data-act="rematch">Play again</button>
      </div>
    </div>
    <div class="bw-sheet" data-sheet hidden>
      <div class="in">
        <div class="hd"><b>CHEATS</b><button type="button" data-act="cheats">✕</button></div>
        ${CHEAT_ROWS.map(([k, label]) =>
        `<button type="button" class="bw-row" data-cheat="${k}"><span>${label}</span><span class="sw"></span></button>`
    ).join("")}
      </div>
    </div>
  </section>
  <div class="game-actions"><button class="game-action-button" type="button" data-exit>Exit game</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]'), laneEl = $('[data-lane]'), scoreEl = $('[data-score]');
    const statusEl = $('[data-status]'), bannerEl = $('[data-banner]'), mfill = $('[data-mfill]');
    const overEl = $('[data-over]'), ovTitle = $('[data-ov-title]'), ovScore = $('[data-ov-score]');
    const sheetEl = $('[data-sheet]'), bestEl = $('[data-best]');
    const bowlBtn = $('[data-act="bowl"]');
    const hookBtns = [...root.querySelectorAll('[data-hook]')];
    const navBtns = [...root.querySelectorAll('.nav')];

    /* ---------- lane svg ---------- */
    function laneSVG() {
        let s = `<rect width="360" height="620" rx="12" fill="#12151d"/>`;
        s += `<rect x="${LANE_X0 - 24}" y="0" width="24" height="620" fill="#0b0e14"/>`;
        s += `<rect x="${LANE_X1}" y="0" width="24" height="620" fill="#0b0e14"/>`;
        s += `<rect x="${LANE_X0}" y="0" width="${LANE_X1 - LANE_X0}" height="620" fill="#d8d2c6"/>`;
        for (let x = LANE_X0 + 20; x < LANE_X1; x += 20)
            s += `<line x1="${x}" y1="0" x2="${x}" y2="620" stroke="#000" opacity=".05"/>`;
        s += `<rect x="${LANE_X0 - 18}" y="56" width="${LANE_X1 - LANE_X0 + 36}" height="194" fill="#000" opacity=".05"/>`;
        s += `<line x1="${LANE_X0 - 18}" y1="56" x2="${LANE_X0 - 18}" y2="250" stroke="#fff" opacity=".14"/>`;
        s += `<line x1="${LANE_X1 + 18}" y1="56" x2="${LANE_X1 + 18}" y2="250" stroke="#fff" opacity=".14"/>`;
        s += `<rect x="${LANE_X0 - 24}" y="0" width="${LANE_X1 - LANE_X0 + 48}" height="56" fill="#0b0e14"/>`;
        s += `<line x1="${LANE_X0 - 24}" y1="${BALL_Y + 16}" x2="${LANE_X1 + 24}" y2="${BALL_Y + 16}" stroke="#8b93a7" opacity=".5"/>`;
        [200, 230, 260].forEach((x) => { s += `<path d="M${x} 468 l-5 13 h10 z" fill="#12151d" opacity=".18"/>`; });
        s += `<path data-guide fill="none" stroke="#818cf8" stroke-width="1.5" stroke-dasharray="3 6" opacity=".7"/>`;
        s += `<line data-tick stroke="#818cf8" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55"/>`;
        s += `<g data-pins></g><g data-ball></g>`;
        return s;
    }
    svgEl.innerHTML = laneSVG();
    const pinsLayer = svgEl.querySelector('[data-pins]');
    const ballLayer = svgEl.querySelector('[data-ball]');
    const guideEl = svgEl.querySelector('[data-guide]');
    const tickEl = svgEl.querySelector('[data-tick]');
    const NS = "http://www.w3.org/2000/svg";

    function pinNode(i) {
        const g = document.createElementNS(NS, "g");
        g.innerHTML = `<rect x="-4.5" y="-13" width="9" height="26" rx="4.5" fill="#f8fafc" stroke="#64748b" stroke-width="1"/><line x1="-4.5" y1="-5" x2="4.5" y2="-5" stroke="#ef4444" stroke-width="2"/>`;
        return g;
    }
    function pinTransform(i, down) {
        const p = PIN_POS[i];
        return down
            ? `translate(${p.x + (i % 2 ? 9 : -9)},${p.y + 5}) rotate(${i % 2 ? 76 : -76})`
            : `translate(${p.x},${p.y})`;
    }
    function ballNode(color, r) {
        const g = document.createElementNS(NS, "g");
        g.innerHTML = `<circle r="${r}" fill="${color}"/><circle cx="${-r * .3}" cy="${-r * .3}" r="${r * .13}" fill="#fff" opacity=".7"/><circle cx="${r * .3}" cy="${-r * .3}" r="${r * .13}" fill="#fff" opacity=".7"/><circle cx="0" cy="${r * .3}" r="${r * .13}" fill="#fff" opacity=".7"/>`;
        return g;
    }
    const seatColor = (s) => (s === 0 ? "#818cf8" : "#fb7185");
    const mySeat = () => (!state ? 0 : online ? (room.isHost ? state.seats.host : state.seats.guest) : 0);
    const canAct = () => !!state && state.phase === "aim" && !state.pending && state.turn === mySeat();

    /* ---------- rendering ---------- */
    function renderScore() {
        if (!state) return;
        const me = mySeat();
        let h = "";
        for (let s = 0; s < 2; s++) {
            const sc = scoreGame(state.rolls[s]);
            h += `<div class="n${s === me ? " me" : ""}">${esc(state.names[s])}</div>`;
            sc.frames.forEach((fr, f) => {
                const cur = state.phase !== "over" && f === state.frame && s === state.turn;
                h += `<div class="c${cur ? " cur" : ""}"><div class="m">${marks(fr)}</div><div class="t">${fr.cum === null ? "" : fr.cum}</div></div>`;
            });
            h += `<div class="tot">${sc.total}</div>`;
        }
        scoreEl.innerHTML = h;
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    function renderStatic() {
        if (!state) return;
        const standing = state.standing[state.turn];
        pinsLayer.innerHTML = "";
        for (let i = 0; i < PINS; i++) {
            const n = pinNode(i), down = !standing.includes(i);
            n.setAttribute("transform", pinTransform(i, down));
            if (down) n.setAttribute("opacity", ".28");
            pinsLayer.appendChild(n);
        }
        ballLayer.innerHTML = "";
        const b = ballNode(seatColor(state.turn), 10);
        b.setAttribute("transform", `translate(${canAct() ? aimX : 230},${BALL_Y})`);
        ballLayer.appendChild(b);
        updateAimMarks();
    }

    function updateAimMarks() {
        const show = canAct();
        tickEl.setAttribute("opacity", show ? ".55" : "0");
        if (show) {
            tickEl.setAttribute("x1", aimX); tickEl.setAttribute("x2", aimX);
            tickEl.setAttribute("y1", BALL_Y - 16); tickEl.setAttribute("y2", BALL_Y - 54);
            tickEl.setAttribute("stroke", seatColor(mySeat()));
        }
        if (show && cheats.guide) {
            let x = aimX, y = BALL_Y, vx = 0, vy = -(140 + 660 * .85), d = `M${x} ${y}`;
            for (let n = 0; n < 600 && y > 100; n++) {
                if (y < 430) vx += hookVal * 330 * DT;
                x += vx * DT; y += vy * DT;
                if (x - 10 < LANE_X0 || x + 10 > LANE_X1) break;
                if (n % 5 === 0) d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
            }
            guideEl.setAttribute("d", d);
            guideEl.setAttribute("opacity", ".7");
        } else guideEl.setAttribute("opacity", "0");
    }

    function renderStatus() {
        if (!state) return;
        const me = mySeat();
        let txt;
        if (state.phase === "over") txt = "Game over";
        else if (state.pending) txt = `${state.names[state.pending.by]} rolls…`;
        else if (state.turn === me) txt = `Frame ${state.frame + 1} · Your turn`;
        else txt = `Frame ${state.frame + 1} · ${state.names[state.turn]}…`;
        statusEl.textContent = txt;
        const dis = !canAct();
        bowlBtn.disabled = dis;
        navBtns.forEach((b) => (b.disabled = dis));
        hookBtns.forEach((b) => {
            b.disabled = dis;
            b.classList.toggle("on", Number(b.dataset.hook) === hookVal);
        });
        overEl.hidden = state.phase !== "over";
        if (state.phase === "over") {
            const a = scoreGame(state.rolls[0]).total, b = scoreGame(state.rolls[1]).total;
            const win = a === b ? -1 : a > b ? 0 : 1;
            ovTitle.textContent = win === -1 ? "Draw" : win === me ? "You win" : `${state.names[win]} wins`;
            ovScore.textContent = `${state.names[0]} ${a} — ${b} ${state.names[1]}`;
        }
        if (!online) {
            let best = 0;
            try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }
            bestEl.textContent = best ? `Best ${best}` : "";
        }
    }

    function banner(txt) {
        clearTimeout(bannerTimer);
        bannerEl.textContent = txt;
        bannerEl.hidden = false;
        bannerEl.style.animation = "none";
        void bannerEl.offsetWidth;
        bannerEl.style.animation = "";
        bannerTimer = setTimeout(() => { bannerEl.hidden = true; }, 950);
    }

    /* ---------- roll animation (same deterministic sim on every client) ---------- */
    function stopAnim() { if (animRaf) cancelAnimationFrame(animRaf); animRaf = null; animRefs = null; }

    function startRollAnim(p) {
        stopAnim();
        animId = p.id;
        pinsLayer.innerHTML = ""; ballLayer.innerHTML = "";
        tickEl.setAttribute("opacity", "0"); guideEl.setAttribute("opacity", "0");
        const refs = {};
        for (let i = 0; i < PINS; i++) {
            const n = pinNode(i);
            if (p.standing.includes(i)) refs[i] = n;
            else { n.setAttribute("transform", pinTransform(i, true)); n.setAttribute("opacity", ".28"); }
            pinsLayer.appendChild(n);
        }
        const bn = ballNode(seatColor(p.by), p.cheat ? 24 : 10);
        ballLayer.appendChild(bn);
        animRefs = { refs, bn };
        const sim = createSim(p, p.standing, p.cheat);
        let last = performance.now(), acc = 0;
        const frame = (now) => {
            if (destroyed || animId !== p.id) return;
            acc += Math.min(.1, (now - last) / 1000); last = now;
            while (acc >= DT && !sim.done) { sim.step(); acc -= DT; }
            const b = sim.ball;
            bn.setAttribute("transform", `translate(${b.x.toFixed(1)},${b.y.toFixed(1)})`);
            bn.setAttribute("opacity", b.active && b.y > 46 ? "1" : "0");
            for (const q of sim.pins) {
                const n = refs[q.i]; if (!n) continue;
                if (!q.active) { n.setAttribute("opacity", "0"); continue; }
                n.setAttribute("transform", `translate(${q.x.toFixed(1)},${q.y.toFixed(1)})${q.down ? ` rotate(${q.i % 2 ? 76 : -76})` : ""}`);
                n.setAttribute("opacity", q.down ? ".38" : "1");
            }
            if (sim.done) {
                animRaf = null;
                if (p.knocked.length === 10 && p.standing.length === 10) banner("STRIKE");
                else if (p.knocked.length === p.standing.length && p.knocked.length > 0) banner("SPARE");
                else if (p.knocked.length === 0) banner("GUTTER");
                return;
            }
            animRaf = requestAnimationFrame(frame);
        };
        animRaf = requestAnimationFrame(frame);
    }

    /* ---------- state ---------- */
    function newGame(prevNames) {
        const hostSeat = Math.random() < .5 ? 0 : 1;
        const names = prevNames || (online
            ? (hostSeat === 0 ? [playerName, "Player 2"] : ["Player 2", playerName])
            : [playerName, "Bot"]);
        const first = Math.random() < .5 ? 0 : 1;
        return {
            v: 1, seq: 0, seats: { host: hostSeat, guest: 1 - hostSeat },
            names, first, turn: first, frame: 0, phase: "aim",
            rolls: [[], []], standing: [allPins(), allPins()], pending: null,
        };
    }

    function publish() {
        sync();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function sync() {
        if (destroyed || !state) return;
        renderScore(); renderStatus();
        const key = `${state.seq}:${state.turn}:${state.frame}`;
        if (key !== lastTurnKey) {
            lastTurnKey = key;
            if (canAct()) { aimX = cheats.pocket ? 237 : 230; hookVal = 0; }
        }
        if (state.pending && state.pending.id !== animId) startRollAnim(state.pending);
        if (!state.pending && animId !== null) { animId = null; stopAnim(); renderStatic(); }
        if (!state.pending && animId === null && !animRefs) renderStatic();
        updateAimMarks();
        maybeAI();
    }

    function applyAction(a, actor) {
        if (!state || destroyed || !a) return;
        if (a.type === "hello") {
            state.names[actor] = String(a.name || "Player").slice(0, 18);
            publish(); return;
        }
        if (a.type === "rematch") {
            if (state.phase !== "over") return;
            clearTimers(); stopAnim(); animId = null;
            const names = state.names;
            state = newGame(names);
            publish();
            banner(`${state.names[state.first]} first`);
            return;
        }
        if (a.type === "roll") {
            if (state.phase !== "aim" || state.pending || actor !== state.turn) return;
            const p = {
                x0: clamp(Number(a.x0) || 230, AIM_MIN, AIM_MAX),
                hook: [-1, 0, 1].includes(a.hook) ? a.hook : 0,
                power: clamp(Number(a.power) || 0, 0, 1),
                seed: (Number(a.seed) || 1) | 0,
            };
            const cheat = !online && !!a.cheat;
            const standing = state.standing[actor].slice();
            const out = simulateRoll(p, standing, cheat);
            state.pending = {
                id: ++state.seq, by: actor, ...p, cheat, standing,
                knocked: out.knocked, dur: out.dur,
            };
            state.phase = "rolling";
            publish();
            clearTimeout(advanceTimer);
            advanceTimer = setTimeout(advance, out.dur * 1000 + 700);
        }
    }

    function advance() {
        if (!state || !state.pending || destroyed) return;
        const p = state.pending, by = p.by;
        state.standing[by] = state.standing[by].filter((i) => !p.knocked.includes(i));
        state.rolls[by].push(p.knocked.length);
        const fr = frameInfo(state.rolls[by]).rolls;
        const done = state.frame < 9
            ? fr[0] === 10 || fr.length >= 2
            : fr.length >= tenthAllowed(fr);
        if (done) {
            state.standing[by] = allPins();
            if (state.turn === state.first) { state.turn = 1 - state.first; state.phase = "aim"; }
            else {
                state.frame++;
                if (state.frame >= FRAMES) state.phase = "over";
                else { state.turn = state.first; state.phase = "aim"; }
            }
        } else {
            if (state.frame === 9 && state.standing[by].length === 0) state.standing[by] = allPins();
            state.phase = "aim";
        }
        state.pending = null;
        if (state.phase === "over" && !online) {
            const mine = scoreGame(state.rolls[0]).total;
            try {
                const best = Number(localStorage.getItem(META.bestKey)) || 0;
                if (mine > best) localStorage.setItem(META.bestKey, String(mine));
            } catch (e) { }
        }
        publish();
    }

    function submitAction(a) {
        if (online && !room.isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, mySeat());
    }

    /* ---------- bot ---------- */
    function maybeAI() {
        clearTimeout(aiTimer); aiTimer = null;
        if (online || !state || state.phase !== "aim" || state.pending || state.turn !== 1) return;
        aiTimer = setTimeout(() => {
            if (destroyed || !state || state.phase !== "aim" || state.turn !== 1) return;
            const weak = cheats.weak;
            const hook = Math.random() < .15 ? (Math.random() < .5 ? -1 : 1) : 0;
            const x0 = clamp(237 - hook * 15 + (Math.random() - .5) * (weak ? 90 : 18), AIM_MIN, AIM_MAX);
            const power = weak ? .15 + Math.random() * .3 : .55 + Math.random() * .4;
            applyAction({ type: "roll", x0, hook, power, seed: (Math.random() * 0x7fffffff) | 0 }, 1);
        }, 900);
    }

    /* ---------- input: one gesture (aim, then hold & release to bowl) ---------- */
    function setAim(x) {
        if (!canAct() || charging) return;
        aimX = clamp(x, AIM_MIN, AIM_MAX);
        const b = ballLayer.firstChild;
        if (b) b.setAttribute("transform", `translate(${aimX},${BALL_Y})`);
        updateAimMarks();
    }
    function laneX(e) {
        const r = svgEl.getBoundingClientRect();
        return ((e.clientX - r.left) / r.width) * 360;
    }
    function startCharge() {
        if (!canAct() || charging) return;
        charging = true; chargeT0 = performance.now();
        const tick = (t) => {
            if (!charging || destroyed) return;
            powerVal = 1 - Math.abs(1 - (((t - chargeT0) / 550) % 2));
            mfill.style.width = (powerVal * 100).toFixed(1) + "%";
            meterRaf = requestAnimationFrame(tick);
        };
        meterRaf = requestAnimationFrame(tick);
    }
    function releaseCharge() {
        if (!charging) return;
        charging = false;
        if (meterRaf) cancelAnimationFrame(meterRaf);
        meterRaf = null;
        const held = performance.now() - chargeT0;
        let power = held < 150 ? .85 : powerVal;   /* quick tap = solid default */
        mfill.style.width = "0";
        if (!canAct()) return;
        if (cheats.power) power = 1;
        if (cheats.pocket) aimX = 237;
        submitAction({
            type: "roll", x0: aimX, hook: hookVal, power,
            seed: (Math.random() * 0x7fffffff) | 0, cheat: cheats.strike,
        });
    }

    const onLaneDown = (e) => {
        if (!canAct()) return;
        e.preventDefault();
        setAim(laneX(e));
        if (e.pointerType === "mouse") { laneEl.setPointerCapture?.(e.pointerId); startCharge(); }
        else laneEl.setPointerCapture?.(e.pointerId); /* touch: drag to aim */
    };
    const onLaneMove = (e) => {
        if (e.pointerType === "mouse" && !charging) setAim(laneX(e));
        else if (e.pointerType !== "mouse" && e.buttons) setAim(laneX(e));
    };
    const onBowlDown = (e) => { e.preventDefault(); bowlBtn.setPointerCapture?.(e.pointerId); startCharge(); };
    const onUp = () => releaseCharge();

    laneEl.addEventListener("pointerdown", onLaneDown);
    laneEl.addEventListener("pointermove", onLaneMove);
    bowlBtn.addEventListener("pointerdown", onBowlDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    laneEl.addEventListener("contextmenu", (e) => e.preventDefault());

    const onKeyDown = (e) => {
        if (destroyed || !state) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault(); setAim(aimX + (e.key === "ArrowLeft" ? -5 : 5));
        } else if (e.key === " " || e.code === "Space") {
            e.preventDefault();
            if (state.phase === "over") { submitAction({ type: "rematch" }); return; }
            if (!e.repeat) startCharge();
        } else if (e.key === "a" || e.key === "A") { if (canAct()) { hookVal = -1; renderStatus(); updateAimMarks(); } }
        else if (e.key === "s" || e.key === "S") { if (canAct()) { hookVal = 0; renderStatus(); updateAimMarks(); } }
        else if (e.key === "d" || e.key === "D") { if (canAct()) { hookVal = 1; renderStatus(); updateAimMarks(); } }
        else if ((e.key === "c" || e.key === "C") && !online) sheetEl.hidden = !sheetEl.hidden;
        else if (e.key === "Escape") sheetEl.hidden = true;
        else if (e.key === "Enter" && state.phase === "over") submitAction({ type: "rematch" });
    };
    const onKeyUp = (e) => { if (e.key === " " || e.code === "Space") releaseCharge(); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    function handleClick(e) {
        const btn = e.target.closest?.("[data-act],[data-hook],[data-cheat],[data-exit]");
        if (!btn) return;
        if (btn.hasAttribute("data-exit")) { onExit(); return; }
        const act = btn.dataset.act;
        if (act === "cheats" && !online) { sheetEl.hidden = !sheetEl.hidden; return; }
        if (btn.dataset.cheat && !online) {
            const k = btn.dataset.cheat;
            cheats[k] = !cheats[k];
            btn.classList.toggle("on", cheats[k]);
            if (k === "pocket" && cheats.pocket && canAct()) setAim(237);
            updateAimMarks();
            return;
        }
        if (act === "rematch") { submitAction({ type: "rematch" }); return; }
        if (!canAct()) return;
        if (act === "left") setAim(aimX - 5);
        else if (act === "right") setAim(aimX + 5);
        else if (btn.dataset.hook !== undefined) {
            hookVal = Number(btn.dataset.hook); renderStatus(); updateAimMarks();
        }
    }
    root.addEventListener("click", handleClick);

    function clearTimers() {
        clearTimeout(aiTimer); clearTimeout(advanceTimer); clearTimeout(bannerTimer);
        aiTimer = advanceTimer = bannerTimer = null;
    }

    /* ---------- boot ---------- */
    if (online) {
        const offRoom = room.onRoom(() => { });
        if (typeof offRoom === "function") offs.push(offRoom);
        if (room.isHost) {
            state = newGame();
            publish();
            banner(`${state.names[state.first]} first`);
            const offAction = room.onAction((a) => applyAction(a, state ? state.seats.guest : 1));
            if (typeof offAction === "function") offs.push(offAction);
        } else {
            const offState = room.onState((s) => { if (s && !destroyed) { state = s; sync(); } });
            if (typeof offState === "function") offs.push(offState);
            room.sendAction({ type: "hello", name: playerName }).catch(console.warn);
        }
    } else {
        state = newGame();
        sync();
        banner(`${state.names[state.first]} first`);
    }

    return {
        destroy() {
            destroyed = true;
            clearTimers(); stopAnim();
            if (meterRaf) cancelAnimationFrame(meterRaf);
            charging = false;
            root.removeEventListener("click", handleClick);
            laneEl.removeEventListener("pointerdown", onLaneDown);
            laneEl.removeEventListener("pointermove", onLaneMove);
            bowlBtn.removeEventListener("pointerdown", onBowlDown);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            offs.forEach((off) => { try { off(); } catch (e) { } });
        },
    };
}