/* ==== GAME: bowling.js ==== */
/* Minimal ten-pin bowling. Real 2D physics (ball / pin / kickback collisions),
   10 frames, classic scoring. vs Bot (local) or vs friend (room, host-authoritative).
   Controls: aim (mouse / drag / arrows) + hold-release BOWL (space / button / click lane).
   Internal How-to-play, HUD bar, pause/resume, cheats overlay (offline only). */

import { iconSVG } from "../JS/icons.js";

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
    let animId = null, animRaf = null, meterRaf = null, animCtx = null;
    let aimX = 230, hookVal = 0, charging = false, chargeT0 = 0, powerVal = 0;
    let lastTurnKey = "", animRefs = null;
    let helpOpen = false, cheatsOpen = false, paused = false;
    let frozen = false, freezeAt = 0, clockShift = 0, perfShift = 0;
    const offs = [];
    const cheats = { guide: false, pocket: false, power: false, strike: false, weak: false };
    const CHEAT_ROWS = [
        ["guide", "Guide line"], ["pocket", "Pocket lock"], ["power", "Full power"],
        ["strike", "Auto strike"], ["weak", "Weak bot"],
    ];

    /* Stopwatch base: frozen time does not advance, so Date.now()-based
       anchors keep their meaning after a pause / overlay is dismissed. */
    const dateNow = () => Date.now() - clockShift;
    const perfNow = () => performance.now() - perfShift;

    let seenHelp = true;
    try { seenHelp = localStorage.getItem("bowlingHelpSeen") === "1"; } catch (err) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("bowlingHelpSeen", "1"); } catch (err) { /* storage blocked */ }
    }

    /* ---------- DOM ---------- */
    root.innerHTML = `
<div class="game-app bw game-fill" data-bw>
<style>
.bw{--bw-bg:#0b1020;--bw-panel:#ffffff05;--bw-line:#ffffff1c;--bw-ink:#e5e7eb;--bw-mut:#9ca3af;--bw-weak:#6b7280;--bw-acc:#818cf8;
  max-width:520px;width:100%;height:100%;margin:0 auto;display:flex;flex-direction:column;gap:8px;color:var(--bw-ink);font-variant-numeric:tabular-nums}
.bw *{box-sizing:border-box}
.bw [hidden]{display:none!important}
.bw-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.bw-hud-info,.bw-hud-ctrl,.bw-hud-btns{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.bw-hud-btns{margin-left:auto}
.bw-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--bw-line);border-radius:999px;background:var(--bw-panel);color:var(--bw-mut);white-space:nowrap}
.bw-chip b{color:var(--bw-ink);font-weight:700}
.bw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:6px 9px;font:inherit;font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--bw-ink);background:transparent;border:1px solid var(--bw-line);border-radius:9px;cursor:pointer;touch-action:manipulation;transition:border-color .16s,background .16s}
.bw-btn:hover{border-color:var(--bw-mut);background:var(--bw-panel)}
.bw-btn.on{border-color:var(--bw-acc);color:#a5b4fc}
.bw-icon svg{flex:none;display:block}
.bw-btn-label{white-space:nowrap}
.bw-meter{width:58px;height:4px;border-radius:99px;background:var(--bw-line);overflow:hidden;flex:none}
.bw-meter i{display:block;height:100%;width:0;background:var(--bw-acc);transition:none}
.bw-panel{position:relative;display:flex;flex-direction:column;gap:8px;min-height:0;padding:8px;border:1px solid var(--bw-line);border-radius:12px;background:var(--bw-panel)}
.bw.game-fill > .bw-panel[data-board]{flex:1 1 auto;min-height:0;aspect-ratio:auto}
.bw-score{flex:none;display:grid;grid-template-columns:58px repeat(10,minmax(0,1fr)) 34px;gap:2px;font-size:9.5px;user-select:none;min-width:0;overflow:hidden}
.bw-score .n{display:flex;align-items:center;font-weight:700;font-size:10px;color:var(--bw-mut);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-right:4px;min-width:0}
.bw-score .n.me{color:#a5b4fc}
.bw-score .c{border:1px solid var(--bw-line);border-radius:4px;min-height:30px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;min-width:0}
.bw-score .c.cur{border-color:var(--bw-acc)}
.bw-score .m{text-align:center;color:var(--bw-ink);padding:1px 0;letter-spacing:.05em}
.bw-score .t{text-align:center;font-weight:700;color:var(--bw-ink);border-top:1px solid var(--bw-line);padding:1px 0}
.bw-score .tot{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#a5b4fc}
.bw-lanearea{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
.bw-lane{position:relative;height:100%;max-height:100%;width:auto;max-width:100%;aspect-ratio:360/620;margin:auto;touch-action:none;user-select:none;-webkit-user-select:none}
.bw-lane svg{width:100%;height:100%;display:block;border-radius:10px}
.bw-banner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:24px;font-weight:800;letter-spacing:.3em;color:var(--bw-ink);text-shadow:0 2px 18px #000a;animation:bwpop .9s ease forwards}
@keyframes bwpop{0%{opacity:0;transform:scale(.85)}18%{opacity:1;transform:scale(1)}75%{opacity:1}100%{opacity:0}}
.bw-actions{flex:none;display:flex;justify-content:center}
.bw-bowl{width:min(100%,380px);min-height:46px;padding:10px 16px;border:1px solid var(--bw-acc);border-radius:10px;background:var(--bw-acc);color:var(--bw-bg);font:inherit;font-weight:800;font-size:14px;letter-spacing:.3em;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;transition:filter .16s}
.bw-bowl:hover{filter:brightness(1.06)}
.bw-bowl:active{background:#6d78f0}
.bw button:disabled{opacity:.3;cursor:default;pointer-events:none}
.bw-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:12px;background:#0b1020d9;backdrop-filter:blur(4px);border-radius:12px}
.bw-card{display:flex;flex-direction:column;gap:10px;align-items:stretch;width:min(340px,100%);max-height:100%;overflow:hidden;padding:16px 18px;text-align:left;border:1px solid var(--bw-line);border-radius:12px;background:var(--bw-bg)}
.bw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}
.bw-head h3{margin:0;font-size:18px;font-weight:800;letter-spacing:.04em}
.bw-body{flex:1 1 auto;min-height:0;overflow:auto}
.bw-body p{margin:0;font-size:13px;color:var(--bw-mut);line-height:1.5}
.bw-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:2px}
.bw-foot .bw-note{font-size:10px;color:var(--bw-weak)}
.bw-card button{min-height:44px;padding:10px 20px;font:inherit;font-weight:700;color:var(--bw-ink);background:transparent;border:1px solid var(--bw-line);border-radius:9px;cursor:pointer;touch-action:manipulation}
.bw-card button:hover{background:var(--bw-panel)}
.bw-card button.primary{background:var(--bw-acc);border-color:var(--bw-acc);color:var(--bw-bg)}
.bw-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.bw-help b{display:block;margin-bottom:4px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--bw-mut)}
.bw-help ul{margin:0 0 10px;padding-left:16px;font:600 11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--bw-mut)}
.bw-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--bw-line);border-bottom-width:2px;border-radius:5px;background:var(--bw-panel);color:var(--bw-ink);font:inherit}
.bw-cheats{display:flex;flex-direction:column;gap:6px}
.bw-row{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:44px;padding:8px 12px;font-size:12px}
.bw-row .sw{width:36px;height:20px;border-radius:99px;border:1px solid var(--bw-line);position:relative;flex:none}
.bw-row .sw::after{content:"";position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:99px;background:var(--bw-weak);transition:left .16s,background .16s}
.bw-row.on .sw{border-color:var(--bw-acc)}
.bw-row.on .sw::after{left:19px;background:var(--bw-acc)}
@media (max-width:420px){
  .bw-score{grid-template-columns:44px repeat(10,minmax(0,1fr)) 28px;font-size:8.5px}
  .bw-score .n{font-size:9px}
}
@media (prefers-reduced-motion:reduce){.bw *{animation-duration:.01ms!important;transition-duration:.01ms!important}}

/* --- design polish --- */
.bw :focus-visible,.bw button:focus-visible{outline:2px solid var(--bw-acc);outline-offset:2px}
.bw-chip{padding:6px 10px}
@media (pointer:coarse){.bw button:not(:disabled){min-height:44px}}

/* --- fill height + mobile refinements (keep LAST) --- */
.bw .bw-hud{gap:6px}
.bw .bw-hud .bw-btn-label{display:none}
.bw .bw-hud .bw-icon{min-width:32px}
@media (max-width:640px){
  .bw .bw-panel[data-board]:not(:has(.bw-ov:not([hidden]))){aspect-ratio:auto}
  .bw .bw-panel[data-board]:has(.bw-ov:not([hidden])){min-height:min(70dvh,620px);aspect-ratio:auto}
  .bw .bw-hud{gap:5px;margin-bottom:0}
  .bw .bw-hud .bw-chip{padding:4px 6px;font-size:9px}
  .bw .bw-hud .bw-chip[data-hud="bestChip"]{display:none}
  .bw .bw-hud .bw-btn{min-height:32px;padding:5px 9px;font-size:9px}
  .bw .bw-hud .bw-btn-label{display:none}
  .bw .bw-hud .bw-meter{width:38px}
  .bw .bw-ov{padding:8px}
  .bw .bw-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
  .bw .bw-body{scrollbar-width:none}
  .bw .bw-body::-webkit-scrollbar{display:none}
  .bw .bw-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--bw-line)}
  .bw .bw-note{display:none}
}
@media (max-width:420px){
  .bw .bw-hud{gap:4px}
  .bw .bw-hud-ctrl,.bw .bw-hud-btns{gap:3px}
  .bw .bw-hud .bw-btn{min-width:0;min-height:30px;padding:4px 6px}
  .bw .bw-hud .bw-meter{width:26px}
}
</style>
  <div class="bw-hud">
    <div class="bw-hud-info">
      <span class="bw-chip">FRAME <b data-hud="frame">1/10</b></span>
      <span class="bw-chip">TURN <b data-hud="turn">Ready</b></span>
      <span class="bw-chip">YOU <b data-hud="p0">0</b></span>
      <span class="bw-chip"><span data-hud="rivalLabel">BOT</span> <b data-hud="p1">0</b></span>
      <span class="bw-chip" data-hud="bestChip">BEST <b data-hud="best">—</b></span>
    </div>
    <div class="bw-hud-ctrl">
      <button class="bw-btn" type="button" data-act="left" aria-label="Aim left" title="Aim left (←)">◀</button>
      <button class="bw-btn" type="button" data-hook="-1" aria-label="Hook left" title="Hook left (A)">↰</button>
      <button class="bw-btn" type="button" data-hook="0" aria-label="Straight" title="Straight (S)">↑</button>
      <button class="bw-btn" type="button" data-hook="1" aria-label="Hook right" title="Hook right (D)">↱</button>
      <button class="bw-btn" type="button" data-act="right" aria-label="Aim right" title="Aim right (→)">▶</button>
      <span class="bw-meter" title="Power"><i data-mfill></i></span>
    </div>
    <div class="bw-hud-btns">
      <button class="bw-btn bw-icon" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bw-btn-label">Help</span></button>
      <button class="bw-btn bw-icon" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bw-btn-label">Cheats</span></button>
      <button class="bw-btn bw-icon" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bw-btn-label">Pause</span></button>
      <button class="bw-btn bw-icon" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bw-btn-label">Restart</span></button>
      <button class="bw-btn bw-icon" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bw-btn-label">Exit game</span></button>
    </div>
  </div>
  <section class="game-panel bw-panel" data-board>
    <div class="bw-score" data-score></div>
    <div class="bw-lanearea">
      <div class="bw-lane" data-lane>
        <svg viewBox="0 0 360 620" data-svg aria-hidden="true"></svg>
        <div class="bw-banner" data-banner hidden></div>
      </div>
    </div>
    <div class="bw-ov" data-ov="over" hidden>
      <div class="bw-card">
        <div class="bw-head"><h3 data-ov-title></h3></div>
        <div class="bw-body"><p data-ov-score></p></div>
        <div class="bw-foot"><span class="bw-note">10 frames completed</span><button class="primary" type="button" data-act="rematch">Play again</button></div>
      </div>
    </div>
    <div class="bw-ov" data-ov="pause" hidden>
      <div class="bw-card">
        <div class="bw-head"><h3>Paused</h3></div>
        <div class="bw-body"><p>Timers, the bot and the roll animation are frozen.</p></div>
        <div class="bw-foot"><span class="bw-note">Press P or Esc to resume</span><button class="primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="bw-ov" data-ov="cheat" hidden>
      <div class="bw-card">
        <div class="bw-head"><h3>Cheats</h3><button type="button" data-ov-close aria-label="Close cheats">✕</button></div>
        <div class="bw-body bw-cheats" data-cheatgrid>
          ${CHEAT_ROWS.map(([k, label]) =>
        `<button type="button" class="bw-row" data-cheat="${k}"><span>${label}</span><span class="sw"></span></button>`
    ).join("")}
        </div>
        <div class="bw-foot"><span class="bw-note">Offline only</span><button type="button" data-ov-close>Close</button></div>
      </div>
    </div>
    <div class="bw-ov" data-ov="help" hidden>
      <div class="bw-card">
        <div class="bw-head"><h3>How to play</h3><button type="button" data-help-close aria-label="Close help">✕</button></div>
        <div class="bw-body bw-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li>Move the mouse over the lane to aim, hold and release to set power.</li>
              <li><span class="bw-kbd">←</span> <span class="bw-kbd">→</span> aim · <span class="bw-kbd">A</span> <span class="bw-kbd">S</span> <span class="bw-kbd">D</span> hook left / straight / right.</li>
              <li><span class="bw-kbd">Space</span> hold &amp; release to bowl · <span class="bw-kbd">Enter</span> play again.</li>
            </ul>
            <b>Mobile</b>
            <ul>
              <li>Drag on the lane to aim, then hold &amp; release BOWL to charge.</li>
              <li>The ◀ ▶ and hook buttons above the lane also aim the ball.</li>
            </ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Ten frames; two rolls per frame (three in the tenth with a strike or spare).</li>
              <li>Strike = 10 + the next two rolls; spare = 10 + the next roll.</li>
              <li>A coin flip decides who bowls first; you alternate with the bot each frame.</li>
              <li>Your best game is saved locally. Cheats are available offline only.</li>
              <li><span class="bw-kbd">H</span> help · <span class="bw-kbd">C</span> cheats · <span class="bw-kbd">P</span> pause · <span class="bw-kbd">R</span> restart.</li>
            </ul>
          </div>
        </div>
        <div class="bw-foot"><span class="bw-note">Press H to reopen this guide</span><button class="primary" type="button" data-help-close>Got it</button></div>
      </div>
    </div>
  </section>
  <div class="bw-actions"><button type="button" class="bw-bowl" data-act="bowl">BOWL</button></div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]'), laneEl = $('[data-lane]'), scoreEl = $('[data-score]');
    const bannerEl = $('[data-banner]'), mfill = $('[data-mfill]');
    const ov = {
        over: $('[data-ov="over"]'), pause: $('[data-ov="pause"]'),
        cheat: $('[data-ov="cheat"]'), help: $('[data-ov="help"]'),
    };
    const ovTitle = $('[data-ov-title]'), ovScore = $('[data-ov-score]');
    const hud = {
        frame: $('[data-hud="frame"]'), turn: $('[data-hud="turn"]'),
        p0: $('[data-hud="p0"]'), p1: $('[data-hud="p1"]'),
        best: $('[data-hud="best"]'), bestChip: $('[data-hud="bestChip"]'),
        rival: $('[data-hud="rivalLabel"]'),
    };
    const bowlBtn = $('[data-act="bowl"]');
    const cheatBtns = [...root.querySelectorAll('[data-cheat]')];
    const hookBtns = [...root.querySelectorAll('[data-hook]')];
    const navBtns = [...root.querySelectorAll('.bw-hud-ctrl [data-act]')];

    /* ---------- freeze-aware timers & animation ---------- */
    const timerIds = { ai: null, advance: null, banner: null };
    const timerJobs = { ai: null, advance: null, banner: null };
    function setTimer(key, delay, fn) {
        if (timerIds[key]) clearTimeout(timerIds[key]);
        timerJobs[key] = { due: dateNow() + delay, left: delay, fn };
        timerIds[key] = frozen ? null : setTimeout(() => runTimer(key), delay);
    }
    function runTimer(key) {
        timerIds[key] = null;
        const job = timerJobs[key]; timerJobs[key] = null;
        if (job && !frozen) job.fn();
    }
    function clearTimer(key) {
        if (timerIds[key]) clearTimeout(timerIds[key]);
        timerIds[key] = null; timerJobs[key] = null;
    }
    function suspendClocks() {
        for (const key of Object.keys(timerIds)) {
            if (timerIds[key] != null) {
                clearTimeout(timerIds[key]); timerIds[key] = null;
                if (timerJobs[key]) timerJobs[key].left = Math.max(0, timerJobs[key].due - dateNow());
            }
        }
        if (meterRaf) cancelAnimationFrame(meterRaf);
        meterRaf = null;
        if (animRaf) cancelAnimationFrame(animRaf);
        animRaf = null;
        if (charging) { charging = false; mfill.style.width = "0"; }
    }
    function resumeClocks() {
        for (const key of Object.keys(timerIds)) {
            if (timerIds[key] == null && timerJobs[key])
                timerIds[key] = setTimeout(() => runTimer(key), timerJobs[key].left);
        }
        if (animCtx && !animRaf) {
            animCtx.last = performance.now();
            animRaf = requestAnimationFrame(animFrame);
        }
        if (!destroyed && state) maybeAI();
    }
    function updateFreeze() {
        const want = paused || helpOpen || cheatsOpen;
        if (want === frozen) return;
        if (want) {
            frozen = true; freezeAt = Date.now(); suspendClocks();
        } else {
            const away = Date.now() - freezeAt;
            clockShift += away; perfShift += away; /* shift Date.now()/performance.now() anchors */
            frozen = false; resumeClocks();
        }
    }

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
    const canAct = () => !!state && !frozen && state.phase === "aim" && !state.pending && state.turn === mySeat();

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

    function syncOverlays() {
        if (!state) return;
        ov.over.hidden = state.phase !== "over" || frozen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        const cbtn = root.querySelector("[data-cheats]");
        if (cbtn) cbtn.classList.toggle("on", Object.values(cheats).some(Boolean));
        const pbtn = root.querySelector("[data-pause]");
        if (pbtn) {
            const label = pbtn.querySelector(".bw-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pbtn.disabled = (online && !room.isHost) || state.phase === "over";
        }
        const rbtn = root.querySelector("[data-restart]");
        if (rbtn) rbtn.disabled = online && !room.isHost;
        const cbtnOnline = root.querySelector("[data-cheats]");
        if (cbtnOnline) cbtnOnline.hidden = online;
        cheatBtns.forEach((b) => b.classList.toggle("on", !!cheats[b.dataset.cheat]));
    }

    function renderStatus() {
        if (!state) return;
        const me = mySeat();
        if (state.phase === "over") hud.turn.textContent = "Game over";
        else if (state.pending) hud.turn.textContent = `${state.names[state.pending.by]} rolls…`;
        else if (state.turn === me) hud.turn.textContent = "Your turn";
        else hud.turn.textContent = `${state.names[state.turn]} to bowl`;
        hud.frame.textContent = `${state.frame + 1}/10`;
        hud.p0.textContent = scoreGame(state.rolls[0]).total;
        hud.p1.textContent = scoreGame(state.rolls[1]).total;
        hud.rival.textContent = online ? "P2" : "BOT";
        const dis = !canAct();
        bowlBtn.disabled = dis;
        navBtns.forEach((b) => (b.disabled = dis));
        hookBtns.forEach((b) => {
            b.disabled = dis;
            b.classList.toggle("on", Number(b.dataset.hook) === hookVal);
        });
        if (state.phase === "over") {
            const a = scoreGame(state.rolls[0]).total, b = scoreGame(state.rolls[1]).total;
            const win = a === b ? -1 : a > b ? 0 : 1;
            ovTitle.textContent = win === -1 ? "Draw" : win === me ? "You win" : `${state.names[win]} wins`;
            ovScore.textContent = `${state.names[0]} ${a} — ${b} ${state.names[1]}`;
        }
        if (!online) {
            let best = 0;
            try { best = Number(localStorage.getItem(META.bestKey)) || 0; } catch (e) { }
            hud.best.textContent = best ? String(best) : "—";
            hud.bestChip.hidden = false;
        } else hud.bestChip.hidden = true;
    }

    function refreshUI() { renderStatus(); syncOverlays(); }

    function banner(txt) {
        setTimer("banner", 950, () => { bannerEl.hidden = true; });
        bannerEl.textContent = txt;
        bannerEl.hidden = false;
        bannerEl.style.animation = "none";
        void bannerEl.offsetWidth;
        bannerEl.style.animation = "";
    }

    /* ---------- roll animation (same deterministic sim on every client) ---------- */
    function stopAnim() {
        if (animRaf) cancelAnimationFrame(animRaf);
        animRaf = null; animRefs = null; animCtx = null;
    }

    function animFrame(now) {
        const ctx = animCtx;
        if (!ctx || destroyed || animId !== ctx.p.id || frozen) { animRaf = null; return; }
        ctx.acc += Math.min(.1, (now - ctx.last) / 1000); ctx.last = now;
        while (ctx.acc >= DT && !ctx.sim.done) { ctx.sim.step(); ctx.acc -= DT; }
        const b = ctx.sim.ball;
        ctx.bn.setAttribute("transform", `translate(${b.x.toFixed(1)},${b.y.toFixed(1)})`);
        ctx.bn.setAttribute("opacity", b.active && b.y > 46 ? "1" : "0");
        for (const q of ctx.sim.pins) {
            const n = ctx.refs[q.i]; if (!n) continue;
            if (!q.active) { n.setAttribute("opacity", "0"); continue; }
            n.setAttribute("transform", `translate(${q.x.toFixed(1)},${q.y.toFixed(1)})${q.down ? ` rotate(${q.i % 2 ? 76 : -76})` : ""}`);
            n.setAttribute("opacity", q.down ? ".38" : "1");
        }
        if (ctx.sim.done) {
            animRaf = null;
            const p = ctx.p;
            if (p.knocked.length === 10 && p.standing.length === 10) banner("STRIKE");
            else if (p.knocked.length === p.standing.length && p.knocked.length > 0) banner("SPARE");
            else if (p.knocked.length === 0) banner("GUTTER");
            return;
        }
        animRaf = requestAnimationFrame(animFrame);
    }

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
        animCtx = { p, sim: createSim(p, p.standing, p.cheat), refs, bn, acc: 0, last: performance.now() };
        animRaf = frozen ? null : requestAnimationFrame(animFrame);
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
        syncOverlays();
    }

    function applyAction(a, actor) {
        if (!state || destroyed || !a) return;
        if (a.type === "hello") {
            state.names[actor] = String(a.name || "Player").slice(0, 18);
            publish(); return;
        }
        if (a.type === "restart") {
            if (online && !room.isHost) return;
            clearTimers(); stopAnim(); animId = null;
            const names = state.names;
            helpOpen = false; cheatsOpen = false; paused = false;
            updateFreeze();
            state = newGame(names);
            lastTurnKey = "";
            publish();
            banner(`${state.names[state.first]} first`);
            return;
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
            setTimer("advance", out.dur * 1000 + 700, advance);
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
        clearTimer("ai");
        if (frozen || online || !state || state.phase !== "aim" || state.pending || state.turn !== 1) return;
        setTimer("ai", 900, () => {
            if (destroyed || frozen || !state || state.phase !== "aim" || state.turn !== 1) return;
            const weak = cheats.weak;
            const hook = Math.random() < .15 ? (Math.random() < .5 ? -1 : 1) : 0;
            const x0 = clamp(237 - hook * 15 + (Math.random() - .5) * (weak ? 90 : 18), AIM_MIN, AIM_MAX);
            const power = weak ? .15 + Math.random() * .3 : .55 + Math.random() * .4;
            applyAction({ type: "roll", x0, hook, power, seed: (Math.random() * 0x7fffffff) | 0 }, 1);
        });
    }

    /* ---------- overlay controls ---------- */
    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        updateFreeze();
        refreshUI();
    }
    function setCheats(on) {
        if (online) return;
        cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
        if (cheatsOpen) helpOpen = false;
        updateFreeze();
        refreshUI();
    }
    function setPaused(on) {
        if (!state || state.phase === "over" || (online && !room.isHost)) return;
        paused = typeof on === "boolean" ? on : !paused;
        updateFreeze();
        refreshUI();
    }
    function restartGame() {
        if (online && !room.isHost) return;
        submitAction({ type: "restart" });
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
        charging = true; chargeT0 = perfNow();
        const tick = () => {
            if (!charging || destroyed) return;
            powerVal = 1 - Math.abs(1 - (((perfNow() - chargeT0) / 550) % 2));
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
        const held = perfNow() - chargeT0;
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
        const c = e.code;
        /* priority: help -> cheats -> pause -> escape -> game actions */
        if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (c === "KeyC") { if (!helpOpen) setCheats(); e.preventDefault(); return; }
        if (c === "KeyP") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) setCheats(false);
            else setPaused();
            e.preventDefault(); return;
        }
        if (c === "Escape") {
            if (helpOpen) toggleHelp(false);
            else if (cheatsOpen) setCheats(false);
            else if (paused) setPaused(false);
            e.preventDefault(); return;
        }
        if (frozen) return;
        if (c === "KeyR") { restartGame(); e.preventDefault(); return; }
        if (c === "ArrowLeft" || c === "ArrowRight") {
            e.preventDefault(); setAim(aimX + (c === "ArrowLeft" ? -5 : 5));
        } else if (c === "Space") {
            e.preventDefault();
            if (state.phase === "over") { submitAction({ type: "rematch" }); return; }
            if (!e.repeat) startCharge();
        } else if (c === "KeyA") { if (canAct()) { hookVal = -1; renderStatus(); updateAimMarks(); } }
        else if (c === "KeyS") { if (canAct()) { hookVal = 0; renderStatus(); updateAimMarks(); } }
        else if (c === "KeyD") { if (canAct()) { hookVal = 1; renderStatus(); updateAimMarks(); } }
        else if (c === "Enter" && state.phase === "over") submitAction({ type: "rematch" });
    };
    const onKeyUp = (e) => { if (e.code === "Space") releaseCharge(); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    function handleClick(e) {
        const btn = e.target.closest?.("button");
        if (!btn) return;
        if (btn.hasAttribute("data-help")) { toggleHelp(); return; }
        if (btn.hasAttribute("data-help-close")) { toggleHelp(false); return; }
        if (btn.hasAttribute("data-exit")) { onExit(); return; }
        if (btn.hasAttribute("data-cheats")) { setCheats(); return; }
        if (btn.hasAttribute("data-ov-close")) { setCheats(false); return; }
        if (btn.hasAttribute("data-pause")) { setPaused(); return; }
        if (btn.hasAttribute("data-resume")) { setPaused(false); return; }
        if (btn.hasAttribute("data-restart")) { restartGame(); return; }
        if (btn.dataset.act === "rematch") { submitAction({ type: "rematch" }); return; }
        if (btn.dataset.cheat && !online) {
            const k = btn.dataset.cheat;
            cheats[k] = !cheats[k];
            btn.classList.toggle("on", cheats[k]);
            if (k === "pocket" && cheats.pocket && canAct()) setAim(237);
            updateAimMarks();
            syncOverlays();
            return;
        }
        if (frozen) return;
        if (!canAct()) return;
        if (btn.dataset.act === "left") setAim(aimX - 5);
        else if (btn.dataset.act === "right") setAim(aimX + 5);
        else if (btn.dataset.hook !== undefined) {
            hookVal = Number(btn.dataset.hook); renderStatus(); updateAimMarks();
        }
    }
    root.addEventListener("click", handleClick);

    function clearTimers() { for (const key of Object.keys(timerIds)) clearTimer(key); }

    /* ---------- boot ---------- */
    updateFreeze();
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
    refreshUI();

    return {
        destroy() {
            destroyed = true;
            clearTimers(); stopAnim();
            if (meterRaf) cancelAnimationFrame(meterRaf);
            meterRaf = null;
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
