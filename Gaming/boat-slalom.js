/*
 * Boat Slalom — versi template baru (META + mount).
 * Jalankan: node tools/build-games-manifest.mjs
 */

import { iconSVG } from "../JS/icons.js";

export const META = {
    id: "boat-slalom",
    name: "Boat Slalom",
    category: "racing",
    catLabel: "Racing",
    desc: "Adu cepat melewati 12 gerbang slalom di sungai berkelok. Penalti terkecil menang.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="25" r="4.5"/><circle cx="40" cy="25" r="4.5"/><path d="M24 6l8 24H16z"/><path d="M19 36h10"/><path d="M4 42h8M36 42h8"/></svg>',
    bg: ["#0c4a6e", "#075985"],
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    let roomData = room?.room || null;
    let state = null;

    /* ================= konstanta & aturan murni ================= */
    const GATES = 12, BUOY_R = 14, BOAT_HALF = 18, SPEED = 120;
    const MISS_PEN = 3, BUOY_PEN = 1, PATROL_PEN = 2;
    const DT = 1 / 60;                       // fixed timestep → hasil adil antar perangkat
    const VB_W = 460, VB_H = 640, BOAT_Y = 520;
    const HALFW = 130, SEG = 200, Z0 = -400; // setengah lebar sungai & segmen centerline
    const START_X = VB_W / 2, TRAIL_LEN = 300;
    const SVGNS = "http://www.w3.org/2000/svg";
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* Centerline sungai: random-walk dengan bias berbalik arah → tikungan & zig-zag. */
    function buildCourse(seed, calm = false) {
        const rnd = mulberry32(seed);
        const lastZ = 300 + (GATES - 1) * 230;
        const n = Math.ceil((lastZ + 800 - Z0) / SEG) + 1;
        const pts = [];
        let v = 230 + (rnd() * 60 - 30), d = rnd() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) {
            pts.push(v);
            if (calm) { v = 230; continue; }
            if (rnd() < 0.6) d = -d;
            v += d * (40 + rnd() * 55);
            if (v < 150) { v = 150; d = 1; }
            if (v > 310) { v = 310; d = -1; }
        }
        const c = { seed, pts, gates: [], patrols: [] };
        let prev = null;
        for (let i = 0; i < GATES; i++) {
            const z = 300 + i * 230;
            const gap = 120 + Math.floor(rnd() * 21);
            const cz = centerAt(c, z);
            const margin = HALFW - gap / 2 - BUOY_R - 6;
            const jit = (rnd() * 2 - 1) * (calm ? 20 : 42);
            let cx = clamp(cz + jit, cz - margin, cz + margin);
            if (prev !== null && !calm) {
                cx = clamp(cx, prev - 130, prev + 130);      // batas geser terjangkau
                if (Math.abs(cx - prev) < 30) {              // paksa swerve nyata
                    cx = prev + (jit >= 0 ? 30 : -30);
                    cx = clamp(cx, cz - margin, cz + margin);
                }
            }
            c.gates.push({ z, cx, gap });
            prev = cx;
        }
        if (!calm) {
            for (let i = 0; i < GATES - 1; i++) {
                if (rnd() < 0.5) {
                    c.patrols.push({
                        z: 300 + i * 230 + 115,
                        amp: HALFW - 46 - rnd() * 20,
                        om: 0.5 + rnd() * 0.7,
                        ph: rnd() * 6.283,
                    });
                }
            }
        }
        return c;
    }

    function centerAt(c, z) {
        const pts = c.pts;
        let i = Math.floor((z - Z0) / SEG);
        i = clamp(i, 0, pts.length - 2);
        const t = clamp((z - Z0 - i * SEG) / SEG, 0, 1);
        const s = t * t * (3 - 2 * t); // smoothstep → tikungan halus
        return pts[i] + (pts[i + 1] - pts[i]) * s;
    }

    const patrolX = (c, p, t) => centerAt(c, p.z) + p.amp * Math.sin(p.om * t + p.ph);

    function judgeGate(g, x, half, extra) {
        const gap = g.gap + extra, dx = Math.abs(x - g.cx);
        if (dx <= gap / 2 - BUOY_R) return "pass";
        if (dx <= gap / 2 + BUOY_R + half) return "hit";
        return "miss";
    }

    function steer(dt, vx, dir) {
        vx += dir * 650 * dt;
        vx *= Math.max(0, 1 - 2.4 * dt);
        return clamp(vx, -240, 240);
    }

    function clampBank(c, z, x, vx) {
        const cz = centerAt(c, z);
        const lo = cz - HALFW + BOAT_HALF + 2, hi = cz + HALFW - BOAT_HALF - 2;
        if (x < lo) { x = lo; if (vx < 0) vx = 0; }
        if (x > hi) { x = hi; if (vx > 0) vx = 0; }
        return [x, vx];
    }

    /* Simulasi autopilot: dipakai bot, auto-solver, dan cheat auto-steer. */
    function simulateRun(c, bot) {
        const ph0 = (c.seed % 628) / 100;
        let x = START_X, z = 0, vx = 0, t = 0, next = 0;
        let clean = 0, hits = 0, missed = 0, phits = 0, sAcc = 0;
        const cool = c.patrols.map(() => -9);
        const path = [];
        while (next < GATES && t < 60) {
            z += SPEED * DT;
            const g = c.gates[next];
            let target = g.cx, kp = 3, db = 12, vmax = 235;
            if (bot) {
                target += 9 * Math.sin(1.7 * t + ph0) + 5 * Math.sin(0.9 * t + ph0 * 2);
                kp = 2.7; db = 14; vmax = 225;
            }
            const des = clamp((target - x) * kp, -vmax, vmax);
            const dir = des > vx + db ? 1 : des < vx - db ? -1 : 0;
            vx = steer(DT, vx, dir);
            x += vx * DT;
            [x, vx] = clampBank(c, z, x, vx);
            c.patrols.forEach((p, j) => {
                const px = patrolX(c, p, t);
                if (Math.abs(z - p.z) < 26 && Math.abs(x - px) < 31 && t - cool[j] > 1) {
                    cool[j] = t; phits++; vx = (x >= px ? 1 : -1) * 90;
                }
            });
            if (z >= g.z) {
                const r = judgeGate(g, x, BOAT_HALF, 0);
                if (r === "pass") clean++;
                else if (r === "hit") { hits++; vx = (x >= g.cx ? -1 : 1) * 70; }
                else missed++;
                next++;
            }
            t += DT;
            sAcc += DT;
            if (sAcc >= 0.12) { sAcc = 0; path.push([+t.toFixed(2), +z.toFixed(1), +x.toFixed(1)]); }
        }
        const pens = hits * BUOY_PEN + missed * MISS_PEN + phits * PATROL_PEN;
        return {
            time: +t.toFixed(2), pens, clean, hits, missed, patrolHits: phits,
            total: +(t + pens).toFixed(2), path, done: next >= GATES, assisted: false,
        };
    }

    /* Generator acak yang DIJAMIN bisa diselesaikan: setiap kandidat diuji
       autopilot; regenerasi bila ada miss / terlalu banyak penalti. */
    function makeCourse(seed) {
        for (let k = 0; k < 48; k++) {
            const c = buildCourse((seed + k * 7919) >>> 0);
            const r = simulateRun(c, false);
            if (r.done && r.missed === 0 && r.hits + r.patrolHits <= 2) return c;
        }
        return buildCourse(seed, true); // fallback tenang, pasti selesai
    }

    /* ================= state pertandingan ================= */
    function newMatch(round) {
        const h = Math.random() < 0.5 ? 0 : 1; // posisi player diacak tiap match
        return {
            round,
            seed: (Math.random() * 1e9) | 0,
            order: Math.random() < 0.5 ? [0, 1] : [1, 0], // siapa jalan duluan diacak
            seats: online ? { host: h, guest: 1 - h } : { host: 0, guest: 1 },
            turn: 0,
            phase: "ready", // ready | running | done
            results: [null, null],
        };
    }

    const mySeat = () => !state ? -1 : online ? (room.isHost ? state.seats.host : state.seats.guest) : 0;
    const curSeat = () => state.order[state.turn];

    function sanitizeResult(p) {
        const num = (v, a, b, d) => Number.isFinite(+v) ? clamp(+v, a, b) : d;
        const int = (v, a, b) => Math.round(num(v, a, b, 0));
        const time = +num(p?.time, 5, 180, 60).toFixed(2);
        const pens = int(p?.pens, 0, 300);
        const path = Array.isArray(p?.path)
            ? p.path.filter(s => Array.isArray(s) && s.length === 3 && s.every(Number.isFinite))
                .slice(0, 900).map(s => [+s[0].toFixed(2), +s[1].toFixed(1), +s[2].toFixed(1)])
            : [];
        return {
            time, pens, total: +(time + pens).toFixed(2), path,
            clean: int(p?.clean, 0, GATES), hits: int(p?.hits, 0, GATES),
            missed: int(p?.missed, 0, GATES), patrolHits: int(p?.patrolHits, 0, 40),
            assisted: !!p?.assisted,
        };
    }

    /* ================= DOM + CSS (HUD bar + fill board, scoped .bs2) ================= */
    root.innerHTML = `
<style>
.bs2{--bs-line:rgba(148,163,184,.14);--bs-dim:#94a3b8;--bs-txt:#e2e8f0;--bs-acc:#38bdf8;color:var(--bs-txt);line-height:1.5}
.bs2 [hidden]{display:none!important}
.bs2 .bs-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.bs2 .bs-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--bs-line);border-radius:999px;background:rgba(255,255,255,.02);color:var(--bs-dim);white-space:nowrap}
.bs2 .bs-chip b{color:var(--bs-txt);font-weight:700;font-variant-numeric:tabular-nums}
.bs2 .bs-dot{width:7px;height:7px;border-radius:50%;background:#475569;display:inline-block;flex:none}
.bs2 .bs-dot.on{background:#4ade80}
.bs2 .bs-dot.wait{background:#fbbf24}
.bs2 .bs-spacer{flex:1 1 auto}
.bs2 .bs-btn{appearance:none;border:1px solid var(--bs-line);background:rgba(255,255,255,.02);color:#cbd5e1;border-radius:9px;min-height:32px;padding:6px 10px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.bs2 .bs-btn:hover{border-color:rgba(56,189,248,.5);color:#f8fafc}
.bs2 .bs-btn.on{border-color:rgba(56,189,248,.7);color:var(--bs-acc);background:rgba(56,189,248,.12)}
.bs2 .bs-btn.primary{background:var(--bs-acc);border-color:var(--bs-acc);color:#082f49}
.bs2 .bs-btn:disabled{opacity:.45;cursor:not-allowed}
.bs2 .bs-icon-btn svg{flex:none;display:block}
.bs2 .bs-board{position:relative;flex:1 1 auto;min-height:0;width:100%;padding:0;border:1px solid var(--bs-line);border-radius:12px;background:#0b1220;overflow:hidden;touch-action:none}
.bs2 .bs-board svg{display:block;width:100%;height:100%}
.bs2 .bs-ov{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:14px;background:rgba(4,10,18,.74);backdrop-filter:blur(3px)}
.bs2 .bs-card{width:min(420px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:20px;border:1px solid var(--bs-line);border-radius:14px;background:#0b1220;box-shadow:0 12px 30px rgba(0,0,0,.35);text-align:center;overflow:hidden}
.bs2 .bs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none}
.bs2 .bs-head h3{margin:0;font:700 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--bs-dim)}
.bs2 .bs-big{font-size:22px;font-weight:700;letter-spacing:.06em}
.bs2 .bs-big.win{color:#4ade80}.bs2 .bs-big.lose{color:#f87171}
.bs2 .bs-sub{font-size:13px;color:#a9b6c8;line-height:1.55}
.bs2 .bs-rows,.bs2 .bs-cheats,.bs2 .bs-help{flex:1 1 auto;min-height:0;overflow:auto}
.bs2 .bs-rows{width:100%;display:flex;flex-direction:column;gap:8px;margin:4px 0;text-align:left}
.bs2 .bs-row{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:8px 12px;border:1px solid var(--bs-line);border-radius:10px;color:#a9b6c8}
.bs2 .bs-row b{font-variant-numeric:tabular-nums;color:var(--bs-txt)}
.bs2 .bs-row.w{border-color:rgba(74,222,128,.4);color:#cbd5e1}
.bs2 .bs-cheats{width:100%;display:flex;flex-direction:column;gap:8px;text-align:left}
.bs2 .bs-cheat{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 12px;min-height:44px;border:1px solid var(--bs-line);border-radius:10px;background:rgba(255,255,255,.02);color:#cbd5e1;font-size:13px;cursor:pointer;flex:none}
.bs2 .bs-cheat i{width:36px;height:20px;border-radius:10px;background:#334155;position:relative;flex:none;transition:background .15s}
.bs2 .bs-cheat i::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#94a3b8;transition:left .15s,background .15s}
.bs2 .bs-cheat.on i{background:#0ea5e9}
.bs2 .bs-cheat.on i::after{left:19px;background:#f0f9ff}
.bs2 .bs-help{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;text-align:left}
.bs2 .bs-help b{display:block;margin-bottom:6px;font:700 10px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--bs-dim)}
.bs2 .bs-help ul{margin:0 0 12px;padding-left:16px;font:600 11px/1.7 ui-monospace,monospace;color:#a9b6c8}
.bs2 .bs-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--bs-line);border-bottom-width:2px;border-radius:5px;background:rgba(255,255,255,.04);color:var(--bs-txt);font:inherit}
.bs2 .bs-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;margin-top:2px}
.bs2 .bs-note{font:600 10px/1.4 ui-monospace,monospace;color:var(--bs-dim)}
.bs2 .bs-wait{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--bs-dim)}
.bs2 .bs-count{position:absolute;inset:0;display:grid;place-items:center;font-size:46px;font-weight:700;color:#f8fafc;pointer-events:none;z-index:4;text-shadow:0 2px 18px rgba(0,0,0,.5)}
.bs2 .bs-touch{display:none;gap:8px;flex:none}
.bs2 .bs-vbtn{flex:1;min-height:56px;border:1px solid var(--bs-line);border-radius:10px;background:rgba(255,255,255,.03);color:#cbd5e1;display:grid;place-items:center;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.bs2 .bs-vbtn:active{background:rgba(56,189,248,.15);border-color:rgba(56,189,248,.4)}
.bs2 .bs-vbtn svg{width:24px;height:24px}
@media (pointer:coarse),(max-width:640px){.bs2 .bs-touch{display:flex}}
@media (max-width:640px){
.bs2.game-fill > .bs-board:not(:has(.bs-ov:not([hidden]))){aspect-ratio:460/640;flex:0 0 auto}
.bs2.game-fill > .bs-board:has(.bs-ov:not([hidden])){aspect-ratio:auto;min-height:min(70dvh,620px);flex:0 0 auto}
.bs2 .bs-ov{padding:8px}
.bs2 .bs-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
.bs2 .bs-rows,.bs2 .bs-cheats,.bs2 .bs-help{scrollbar-width:none}
.bs2 .bs-rows::-webkit-scrollbar,.bs2 .bs-cheats::-webkit-scrollbar,.bs2 .bs-help::-webkit-scrollbar{display:none}
.bs2 .bs-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--bs-line)}
}
@media (prefers-reduced-motion:reduce){.bs2 .bs-cheat,.bs2 .bs-cheat i,.bs2 .bs-cheat i::after{transition:none}}

/* --- Batch 02 polish + fill refinements (last, highest specificity) --- */
.bs2 .bs-hud{gap:8px}
.bs2 .bs-card{box-shadow:none}
.bs2 .bs-btn{min-height:44px;padding:10px 16px;font-size:11px}
@media (pointer:coarse){.bs2 button:not(:disabled){min-height:44px}}
@media (max-width:640px){
.bs2 .bs-hud{gap:5px;margin-bottom:8px}
.bs2 .bs-hud .bs-chip{padding:4px 6px;font-size:9px}
.bs2 .bs-hud .bs-chip[data-hud="first"]{display:none}
.bs2 .bs-hud .bs-btn{min-height:32px;padding:5px 9px;font-size:9px}
.bs2 .bs-hud .bs-btn-label,.bs2 .bs-hud .bs-spacer{display:none}
}
</style>
<div class="game-app bs2 game-fill" data-bs>
  <div class="bs-hud">
    <span class="bs-chip"><i class="bs-dot" data-dot></i><span data-hud="status">Ready</span></span>
    <span class="bs-chip">ROUND <b data-hud="round">1</b></span>
    <span class="bs-chip">GATE <b><span data-hud="gate">0</span>/${GATES}</b></span>
    <span class="bs-chip">TIME <b><span data-hud="time">0.0</span>s</b></span>
    <span class="bs-chip">PEN <b><span data-hud="pen">0</span>s</b></span>
    <span class="bs-chip" data-hud="first">FIRST —</span>
    <span class="bs-spacer"></span>
    <button class="bs-btn bs-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", { size: 14 })}<span class="bs-btn-label">Help</span></button>
    <button class="bs-btn bs-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", { size: 14 })}<span class="bs-btn-label">Cheats</span></button>
    <button class="bs-btn bs-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", { size: 14 })}<span class="bs-btn-label">Pause</span></button>
    <button class="bs-btn bs-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", { size: 14 })}<span class="bs-btn-label">Restart</span></button>
    <button class="bs-btn bs-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", { size: 14 })}<span class="bs-btn-label">Exit game</span></button>
  </div>
  <section class="game-panel bs-board" data-board>
    <svg viewBox="0 0 460 640" preserveAspectRatio="xMidYMid meet" data-svg aria-hidden="true"></svg>
    <div class="bs-count" data-count hidden></div>
    <div class="bs-ov" data-ov="status" hidden></div>
    <div class="bs-ov" data-ov="cheat" hidden>
      <div class="bs-card">
        <div class="bs-head"><h3>Cheats</h3><button class="bs-btn" type="button" data-close-cheats aria-label="Close cheats" title="Close cheats">${iconSVG("x", { size: 14 })}</button></div>
        <div class="bs-cheats" data-cheatlist></div>
      </div>
    </div>
    <div class="bs-ov" data-ov="pause" hidden>
      <div class="bs-card">
        <div class="bs-big">PAUSED</div>
        <div class="bs-sub">The clock, effects and rival bot are on hold.</div>
        <div class="bs-foot"><button class="bs-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="bs-ov" data-ov="help" hidden>
      <div class="bs-card">
        <div class="bs-head"><h3>How to play</h3><button class="bs-btn" type="button" data-help-close aria-label="Close help" title="Close help">${iconSVG("x", { size: 14 })}</button></div>
        <div class="bs-help">
          <div>
            <b>Controls</b>
            <ul>
              <li><span class="bs-kbd">←</span> <span class="bs-kbd">→</span> or <span class="bs-kbd">A</span> <span class="bs-kbd">D</span> — steer</li>
              <li>Tap left / right of the river or the on-screen buttons</li>
              <li><span class="bs-kbd">Space</span> / <span class="bs-kbd">Enter</span> — start or rematch</li>
              <li><span class="bs-kbd">H</span> help · <span class="bs-kbd">C</span> cheats · <span class="bs-kbd">P</span> pause · <span class="bs-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul><li>Use the two steering buttons below the river; the HUD turns icon-only.</li></ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Pass cleanly between the buoys of all ${GATES} gates.</li>
              <li>Buoy hit +1s, gate missed +3s, patrol boat +2s added to your time.</li>
              <li>Runs alternate; the lowest total time (time + penalties) wins.</li>
              <li>A ghost of the rival's best run is shown on your second run.</li>
            </ul>
            <div class="bs-foot"><span class="bs-note">Press H to reopen this guide</span><button class="bs-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="bs-touch">
    <button class="bs-vbtn" type="button" data-dir="-1" aria-label="Steer left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>
    <button class="bs-vbtn" type="button" data-dir="1" aria-label="Steer right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg></button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const svgEl = $('[data-svg]'), board = $('[data-board]');
    const hudGate = $('[data-hud="gate"]'), hudTime = $('[data-hud="time"]'), hudPen = $('[data-hud="pen"]');
    const hudStatus = $('[data-hud="status"]'), hudRound = $('[data-hud="round"]'), hudFirst = $('[data-hud="first"]');
    const ov = {
        status: $('[data-ov="status"]'),
        cheat: $('[data-ov="cheat"]'),
        pause: $('[data-ov="pause"]'),
        help: $('[data-ov="help"]'),
    };
    const countEl = $('[data-count]'), dotEl = $('[data-dot]');
    const cheatList = $('[data-cheatlist]'), pauseBtn = $('[data-pause]'), cheatsBtn = $('[data-cheats]');

    /* ================= runtime ================= */
    let alive = true;
    let course = null, courseSeed = -1;
    let gateEls = [], patrolEls = [];
    let bankL, bankR, shoreL, shoreR, flowEl, gatesLayer, patrolsLayer, ghostEl, boatLayer, fxLayer, wake1, wake2, hull;
    let localRun = null, acc = 0, fx = [];
    let botTimer = 0;
    let rafId = 0, lastT = performance.now();
    const keys = { left: false, right: false };
    let touchL = false, touchR = false, pointerDown = false, pointerDir = 0;
    let cheatsOpen = false, helpOpen = false, paused = false, pauseAt = 0;
    let seenHelp = true;
    try { seenHelp = localStorage.getItem("boatSlalomHelpSeen") === "1"; } catch (_) { seenHelp = true; }
    if (!seenHelp) {
        helpOpen = true;
        try { localStorage.setItem("boatSlalomHelpSeen", "1"); } catch (_) { /* storage blocked */ }
    }
    const cheats = { slow: false, wide: false, free: false, ghost: false, auto: false, turbo: false, showGhost: true };
    const CHEAT_LIST = [
        ["slow", "Slow motion"], ["wide", "Wide gates"], ["free", "No penalties"],
        ["ghost", "Ghost hull"], ["auto", "Auto-steer"], ["turbo", "Turbo engine"],
        ["showGhost", "Rival ghost"],
    ];
    const unsubs = [];

    /* ================= scene ================= */
    function buildScene() {
        svgEl.innerHTML =
            `<rect width="${VB_W}" height="${VB_H}" fill="#0c3b52"/>` +
            `<path data-el="flow" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 25" opacity=".07"/>` +
            `<path data-el="bankL" fill="#101b14"/><path data-el="bankR" fill="#101b14"/>` +
            `<path data-el="shoreL" fill="none" stroke="#24402c" stroke-width="3"/>` +
            `<path data-el="shoreR" fill="none" stroke="#24402c" stroke-width="3"/>` +
            `<g data-el="gates"></g><g data-el="patrols"></g><g data-el="ghost"></g><g data-el="boat"></g><g data-el="fx"></g>`;
        bankL = $('[data-el="bankL"]'); bankR = $('[data-el="bankR"]');
        shoreL = $('[data-el="shoreL"]'); shoreR = $('[data-el="shoreR"]');
        flowEl = $('[data-el="flow"]');
        gatesLayer = $('[data-el="gates"]'); patrolsLayer = $('[data-el="patrols"]');
        ghostEl = $('[data-el="ghost"]'); boatLayer = $('[data-el="boat"]'); fxLayer = $('[data-el="fx"]');

        gateEls = course.gates.map((g, i) => {
            const el = document.createElementNS(SVGNS, "g");
            const last = i === GATES - 1;
            el.innerHTML =
                `<line y1="0" y2="0" stroke="#dbeafe" stroke-width="2" stroke-dasharray="7 9" opacity=".2"/>` +
                `<circle cy="0" r="${BUOY_R}" fill="#ef4444" stroke="#fee2e2" stroke-width="2.5"/>` +
                `<circle cy="0" r="5" fill="#fee2e2"/>` +
                `<circle cy="0" r="${BUOY_R}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5"/>` +
                `<circle cy="0" r="5" fill="#ef4444"/>` +
                `<text y="-32" font-size="${last ? 10 : 13}" letter-spacing="${last ? 2 : 0}" text-anchor="middle" fill="#b6c8d8">${last ? "FINISH" : i + 1}</text>`;
            gatesLayer.appendChild(el);
            return { g, el, line: el.children[0], bl: el.children[1], bld: el.children[2], br: el.children[3], brd: el.children[4], txt: el.children[5] };
        });

        patrolEls = course.patrols.map((p) => {
            const el = document.createElementNS(SVGNS, "g");
            el.innerHTML =
                `<path d="M-18 0 -10 -8 12 -8 18 0 12 8 -10 8Z" fill="#1e293b" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>` +
                `<circle r="3.2" fill="#fbbf24"/>`;
            patrolsLayer.appendChild(el);
            return { p, el };
        });

        const hullSvg = (fill, stroke, accent) =>
            `<polygon points="0,-26 13,-4 11,17 -11,17 -13,-4" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>` +
            `<path d="M0,-19V11" stroke="${accent}" stroke-width="3.5" stroke-linecap="round" fill="none"/>` +
            `<ellipse cx="0" cy="7" rx="5.5" ry="8" fill="${stroke}"/>` +
            `<rect x="-6" y="15" width="12" height="6" rx="2" fill="#334155"/>`;
        ghostEl.innerHTML = `<g data-el="ghull" opacity=".32">${hullSvg("#7dd3fc", "#0c4a6e", "#e0f2fe")}</g>`;
        boatLayer.innerHTML =
            `<path data-el="wake1" d="" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="11" stroke-linecap="round"/>` +
            `<path data-el="wake2" d="" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="3.5" stroke-linecap="round"/>` +
            `<g data-el="hull">${hullSvg("#f8fafc", "#1e293b", "#ef4444")}</g>`;
        wake1 = $('[data-el="wake1"]'); wake2 = $('[data-el="wake2"]'); hull = $('[data-el="hull"]');
        fx = [];
    }

    function ensureCourse() {
        if (state && state.seed !== courseSeed) {
            courseSeed = state.seed;
            course = makeCourse(state.seed);
            buildScene();
        }
    }

    /* ================= FX ================= */
    function addFx(worldZ, x, label, color) {
        const t = document.createElementNS(SVGNS, "text");
        t.setAttribute("font-size", "16"); t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-weight", "700"); t.setAttribute("fill", color);
        t.textContent = label;
        fxLayer.appendChild(t);
        fx.push({ el: t, z: worldZ, x, born: performance.now() });
    }
    function renderFx(now, z) {
        for (let i = fx.length - 1; i >= 0; i--) {
            const f = fx[i], age = (now - f.born) / 1000;
            if (age > 1.2) { f.el.remove(); fx.splice(i, 1); continue; }
            const y = BOAT_Y - (f.z - z) - 42 * age;
            f.el.setAttribute("transform", `translate(${f.x.toFixed(1)},${y.toFixed(1)})`);
            f.el.setAttribute("opacity", Math.max(0, 1 - age / 1.2).toFixed(2));
        }
    }

    /* ================= run lokal (pemain yang sedang giliran) ================= */
    function startLocalRun() {
        if (!alive || !state || state.phase !== "ready" || curSeat() !== mySeat() || localRun) return;
        localRun = {
            t: 0, elapsed: 0, z: 0, x: START_X, vx: 0, pens: 0,
            clean: 0, hits: 0, missed: 0, patrolHits: 0, next: 0,
            trail: [], path: [], sAcc: 0, cool: course.patrols.map(() => -9),
            pre: 0.9, glide: 0, assisted: false,
            token: state.seed + ":" + state.turn,
        };
        acc = 0; fx.forEach(f => f.el.remove()); fx = [];
        submitAction({ type: "begin" });
        syncUI();
    }

    function stepPhysics() {
        const r = localRun, ch = cheats;
        if (ch.slow || ch.wide || ch.free || ch.ghost || ch.auto || ch.turbo) r.assisted = true;
        r.z += SPEED * (ch.turbo ? 1.22 : 1) * DT;
        let dir;
        if (ch.auto) {
            const g = course.gates[Math.min(r.next, GATES - 1)];
            const des = clamp((g.cx - r.x) * 3, -235, 235);
            dir = des > r.vx + 12 ? 1 : des < r.vx - 12 ? -1 : 0;
        } else {
            dir = (keys.right || touchR || pointerDir > 0 ? 1 : 0) - (keys.left || touchL || pointerDir < 0 ? 1 : 0);
        }
        r.vx = steer(DT, r.vx, dir);
        r.x += r.vx * DT;
        [r.x, r.vx] = clampBank(course, r.z, r.x, r.vx);

        if (!ch.ghost) {
            course.patrols.forEach((p, j) => {
                const px = patrolX(course, p, r.t);
                if (Math.abs(r.z - p.z) < 26 && Math.abs(r.x - px) < 31 && r.t - r.cool[j] > 1) {
                    r.cool[j] = r.t; r.patrolHits++;
                    if (!ch.free) r.pens += PATROL_PEN;
                    r.vx = (r.x >= px ? 1 : -1) * 90;
                    addFx(p.z, px, ch.free ? "GHOST" : "+2s", "#fbbf24");
                }
            });
        }

        if (!r.trail.length || r.z - r.trail[r.trail.length - 1].z >= 8) r.trail.push({ z: r.z, x: r.x });
        while (r.trail.length && r.z - r.trail[0].z > TRAIL_LEN) r.trail.shift();

        r.t += DT;
        if (r.next < GATES) {
            r.elapsed += DT;
            r.sAcc += DT;
            if (r.sAcc >= 0.12) { r.sAcc = 0; r.path.push([+r.t.toFixed(2), +r.z.toFixed(1), +r.x.toFixed(1)]); }
            const extra = ch.wide ? 44 : 0;
            while (r.next < GATES && r.z >= course.gates[r.next].z) {
                const g = course.gates[r.next];
                const res = judgeGate(g, r.x, BOAT_HALF, extra);
                if (res === "pass") { r.clean++; addFx(g.z, g.cx, "CLEAN", "#4ade80"); }
                else if (res === "hit") {
                    r.hits++; if (!ch.free) r.pens += BUOY_PEN;
                    r.vx = (r.x >= g.cx ? -1 : 1) * 70;
                    addFx(g.z, g.cx, ch.free ? "BUOY" : "+1s", "#fbbf24");
                } else {
                    r.missed++; if (!ch.free) r.pens += MISS_PEN;
                    addFx(g.z, g.cx, ch.free ? "MISS" : "+3s", "#f87171");
                }
                r.next++;
                if (r.next >= GATES) r.glide = 0.6;
            }
        }
    }

    function finalizeRun() {
        const r = localRun;
        localRun = null;
        submitAction({
            type: "result",
            payload: {
                time: +r.elapsed.toFixed(2), pens: r.pens, clean: r.clean, hits: r.hits,
                missed: r.missed, patrolHits: r.patrolHits, path: r.path, assisted: r.assisted,
            },
        });
        syncUI();
    }

    /* Bot (mode AI): hasil disimulasikan instan; giliran bot diacak lewat state.order. */
    function scheduleBot() {
        if (online || paused || !state || state.phase !== "ready" || curSeat() !== 1 || botTimer) return;
        botTimer = setTimeout(() => {
            botTimer = 0;
            if (paused || !alive || !state || state.phase !== "ready" || curSeat() !== 1) return;
            applyAction({ type: "begin" }, 1);
            applyAction({ type: "result", payload: simulateRun(course, true) }, 1);
        }, 900);
    }

    /* ================= aksi & sinkronisasi room ================= */
    function publish() {
        syncUI();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }

    function applyAction(action, actor) {
        if (!state || !action) return;
        if (action.type === "begin") {
            if (state.phase !== "ready" || actor !== curSeat()) return;
            state.phase = "running";
        } else if (action.type === "result") {
            if (actor !== curSeat() || (state.phase !== "running" && state.phase !== "ready")) return;
            state.results[actor] = sanitizeResult(action.payload);
            if (state.turn === 0) { state.turn = 1; state.phase = "ready"; }
            else state.phase = "done";
        } else if (action.type === "rematch") {
            state = newMatch((state.round || 1) + 1);
        } else return;
        afterState();
        publish();
    }

    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, mySeat());
    }

    function afterState() {
        ensureCourse();
        const token = state ? state.seed + ":" + state.turn : "";
        if (localRun && (localRun.token !== token || state.phase === "done")) localRun = null;
        if (botTimer && (online || !state || state.phase !== "ready" || curSeat() !== 1)) {
            clearTimeout(botTimer); botTimer = 0;
        }
        scheduleBot();
    }

    /* ================= overlay helpers (help → cheats → pause) ================= */
    function setPause(on) {
        on = Boolean(on);
        if (paused === on) return;
        paused = on;
        if (paused) {
            pauseAt = performance.now();
            if (botTimer) { clearTimeout(botTimer); botTimer = 0; }  // bekukan bot
        } else {
            const held = performance.now() - pauseAt;                // geser anchor setelah resume
            if (held > 0) fx.forEach((f) => { f.born += held; });
            lastT = performance.now();
            acc = 0;
            scheduleBot();
        }
        syncUI();
    }

    function toggleHelp(on) {
        helpOpen = typeof on === "boolean" ? on : !helpOpen;
        if (helpOpen) cheatsOpen = false;
        syncUI();
    }

    function closeTopOverlay() {
        if (helpOpen) { toggleHelp(false); return true; }
        if (cheatsOpen) { cheatsOpen = false; syncUI(); return true; }
        if (paused) { setPause(false); return true; }
        return false;
    }

    /* ================= UI overlay / status ================= */
    const card = (title, cls, subs, btn) =>
        `<div class="bs-card"><div class="bs-big ${cls}">${title}</div>${subs.map(s => `<div class="bs-sub">${s}</div>`).join("")}${btn || ""}</div>`;

    function syncUI() {
        let html = "", status = "Ready", dot = "";
        const me = mySeat();
        if (!state) {
            html = card("CONNECTING", "", ["Waiting for room state…"]);
            status = "Connecting"; dot = "wait";
        } else if (localRun) {
            status = "Racing"; dot = "on";
        } else if (state.phase === "ready") {
            const cur = curSeat(), myTurn = cur === me, first = state.turn === 0;
            const rival = state.results[1 - me];
            const subs = [online ? `You are P${me + 1} · Round ${state.round}` : `Round ${state.round}`];
            let line = myTurn ? (first ? "You start first" : "Second run") : (first ? "Rival starts first" : "Rival runs second");
            if (rival) line += ` · Rival ${fmt(rival.total)}s`;
            subs.push(line);
            html = card(
                myTurn ? "YOUR RUN" : "RIVAL STARTS", "", subs,
                myTurn ? `<button class="bs-btn primary" type="button" data-act="start">Start</button>` : `<div class="bs-wait">Waiting…</div>`
            );
            status = myTurn ? "Your turn" : "Rival's turn"; dot = myTurn ? "on" : "wait";
        } else if (state.phase === "running") {
            html = curSeat() === me
                ? card("FINISHING", "", ["Sending result…"])
                : card("RIVAL ON COURSE", "", ["Waiting for result…"]);
            status = "Racing"; dot = "wait";
        } else {
            const r0 = state.results[0], r1 = state.results[1];
            const t0 = r0 ? r0.total : 999, t1 = r1 ? r1.total : 999;
            let title, cls;
            if (!online) { title = t0 <= t1 ? "YOU WIN" : "RIVAL WINS"; cls = t0 <= t1 ? "win" : "lose"; }
            else if (t0 === t1) { title = "DRAW"; cls = ""; }
            else { const w = t0 < t1 ? 0 : 1; title = w === me ? "YOU WIN" : "RIVAL WINS"; cls = w === me ? "win" : "lose"; }
            const row = (seat, r) => {
                const label = online ? `P${seat + 1}${seat === me ? " · You" : ""}` : (seat === 0 ? "You" : "Rival");
                const win = r && r.total === Math.min(t0, t1);
                return `<div class="bs-row${win ? " w" : ""}"><span>${label}${r?.assisted ? " *" : ""}</span><b>${r ? fmt(r.total) + "s" : "—"}</b></div>`;
            };
            const mine = state.results[me];
            const subs = [`<div class="bs-rows">${row(0, r0)}${row(1, r1)}</div>`];
            if (mine) subs.push(`Clean ${mine.clean} · Buoy ${mine.hits} · Miss ${mine.missed} · Patrol ${mine.patrolHits}`);
            if (r0?.assisted || r1?.assisted) subs.push("* assisted run");
            html = card(title, cls, subs, `<button class="bs-btn primary" type="button" data-act="rematch">Rematch</button>`);
            status = "Finished";
        }
        ov.status.hidden = !html || cheatsOpen || helpOpen || paused;
        if (!ov.status.hidden) ov.status.innerHTML = html;

        hudStatus.textContent = status;
        dotEl.className = "bs-dot " + dot;
        hudRound.textContent = state ? state.round : 1;
        hudFirst.textContent = "FIRST " + (state ? (state.order[0] === me ? "YOU" : "RIVAL") : "—");

        ov.cheat.hidden = !cheatsOpen || helpOpen;
        ov.pause.hidden = !paused || cheatsOpen || helpOpen;
        ov.help.hidden = !helpOpen;
        if (pauseBtn) {
            const label = pauseBtn.querySelector(".bs-btn-label");
            if (label) label.textContent = paused ? "Resume" : "Pause";
            pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
            pauseBtn.classList.toggle("on", paused);
        }
        if (cheatsBtn) {
            const active = Object.keys(cheats).filter((k) => k !== "showGhost" && cheats[k]).length;
            cheatsBtn.classList.toggle("on", active > 0);
            const label = cheatsBtn.querySelector(".bs-btn-label");
            if (label) label.textContent = active > 0 ? `Cheats ${active}` : "Cheats";
        }
        syncCheats();
    }

    function syncCheats() {
        ov.cheat.hidden = !cheatsOpen || helpOpen;
        if (!cheatsOpen) return;
        cheatList.innerHTML = CHEAT_LIST.map(([k, label]) =>
            `<button class="bs-cheat${cheats[k] ? " on" : ""}" type="button" data-cheat="${k}"><span>${label}</span><i></i></button>`
        ).join("") + (localRun ? `<div class="bs-note">Run held while cheats are open</div>` : "");
    }

    /* ================= render scene per frame ================= */
    function renderScene(now) {
        if (!course) return;
        const r = localRun;
        const z = r ? r.z : 0, x = r ? r.x : START_X, t = r ? r.t : 0, vx = r ? r.vx : 0;

        let L = "M0 -20", R = `M${VB_W} -20`, sl = "", sr = "", fl = "";
        for (let y = -20; y <= VB_H + 20; y += 16) {
            const cz = centerAt(course, z + (BOAT_Y - y));
            const lx = (cz - HALFW).toFixed(1), rx = (cz + HALFW).toFixed(1);
            L += `L${lx} ${y}`; R += `L${rx} ${y}`;
            sl += (sl ? "L" : "M") + lx + " " + y; sr += (sr ? "L" : "M") + rx + " " + y;
            fl += (fl ? "L" : "M") + cz.toFixed(1) + " " + y;
        }
        bankL.setAttribute("d", L + `L0 ${VB_H + 20}Z`);
        bankR.setAttribute("d", R + `L${VB_W} ${VB_H + 20}Z`);
        shoreL.setAttribute("d", sl); shoreR.setAttribute("d", sr);
        flowEl.setAttribute("d", fl);
        flowEl.setAttribute("stroke-dashoffset", String(-(z % 28)));

        const extra = cheats.wide ? 44 : 0;
        gateEls.forEach((ge, i) => {
            const y = BOAT_Y - (ge.g.z - z);
            const vis = y > -70 && y < VB_H + 50;
            ge.el.style.display = vis ? "" : "none";
            if (!vis) return;
            const judged = r ? i < r.next : false;
            const gap = ge.g.gap + extra, lx = ge.g.cx - gap / 2, rx = ge.g.cx + gap / 2;
            ge.el.setAttribute("transform", `translate(0,${y.toFixed(1)})`);
            ge.el.style.opacity = judged ? ".45" : "1";
            ge.line.setAttribute("x1", lx); ge.line.setAttribute("x2", rx);
            ge.line.setAttribute("opacity", r && i === r.next ? ".5" : judged ? ".12" : ".2");
            ge.bl.setAttribute("cx", lx); ge.bld.setAttribute("cx", lx);
            ge.br.setAttribute("cx", rx); ge.brd.setAttribute("cx", rx);
            ge.txt.setAttribute("x", ge.g.cx);
        });

        patrolEls.forEach((pe) => {
            const y = BOAT_Y - (pe.p.z - z);
            const vis = y > -40 && y < VB_H + 40;
            pe.el.style.display = vis ? "" : "none";
            if (!vis) return;
            const px = patrolX(course, pe.p, t);
            const sx = Math.cos(pe.p.om * t + pe.p.ph) >= 0 ? 1 : -1;
            pe.el.setAttribute("transform", `translate(${px.toFixed(1)},${y.toFixed(1)}) scale(${sx},1)`);
        });

        /* ghost lawan: replay berbasis waktu dari run pertama */
        const ghull = ghostEl.querySelector('[data-el="ghull"]');
        const rival = state ? state.results[1 - mySeat()] : null;
        if (r && rival && rival.path.length && cheats.showGhost) {
            const p = rival.path;
            let i = 0;
            while (i < p.length - 1 && p[i + 1][0] <= r.elapsed) i++;
            const a = p[i], b = p[Math.min(i + 1, p.length - 1)];
            const span = Math.max(0.001, b[0] - a[0]);
            const k = clamp((r.elapsed - a[0]) / span, 0, 1);
            const gz = a[1] + (b[1] - a[1]) * k, gx = a[2] + (b[2] - a[2]) * k;
            const gy = BOAT_Y - (gz - z);
            ghostEl.style.display = gy > -60 && gy < VB_H + 60 ? "" : "none";
            ghull.setAttribute("transform", `translate(${gx.toFixed(1)},${gy.toFixed(1)})`);
        } else ghostEl.style.display = "none";

        let d = "";
        if (r && r.trail.length) {
            d = "M" + x.toFixed(1) + " " + (BOAT_Y + 17);
            for (let i = r.trail.length - 1; i >= 0; i--) {
                const p = r.trail[i];
                d += "L" + p.x.toFixed(1) + " " + (BOAT_Y + (z - p.z)).toFixed(1);
            }
        }
        wake1.setAttribute("d", d); wake2.setAttribute("d", d);
        hull.setAttribute("transform", `translate(${x.toFixed(1)},${BOAT_Y}) rotate(${clamp(vx * 0.07, -16, 16).toFixed(1)})`);

        if (!paused) renderFx(now, z);

        hudGate.textContent = String(r ? Math.min(r.next, GATES) : (state?.results[mySeat()] ? GATES : 0));
        hudTime.textContent = fmt(r ? r.elapsed : (state?.results[mySeat()]?.time ?? 0));
        hudPen.textContent = String(r ? r.pens : (state?.results[mySeat()]?.pens ?? 0));

        if (r && r.pre > 0) { countEl.hidden = false; countEl.textContent = String(Math.max(1, Math.ceil(r.pre / 0.3))); }
        else countEl.hidden = true;
    }

    function frame() {
        rafId = 0;
        if (!alive) return;
        const now = performance.now();
        const dtReal = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
        lastT = now;
        if (localRun && !cheatsOpen && !helpOpen && !paused) {
            const r = localRun;
            if (r.pre > 0) r.pre -= dtReal;
            else {
                acc += dtReal * (cheats.slow ? 0.55 : 1);
                let n = 0;
                while (acc >= DT && n < 8 && localRun) { stepPhysics(); acc -= DT; n++; }
                if (localRun && r.glide > 0) {
                    r.glide -= dtReal;
                    if (r.glide <= 0) finalizeRun();
                }
            }
        }
        renderScene(now);
        rafId = requestAnimationFrame(frame);
    }

    /* ================= input: priority help → cheats → pause → Escape → game ================= */
    function onKey(e) {
        if (!alive) return;
        const down = e.type === "keydown", code = e.code;
        if (!down) {
            if (code === "ArrowLeft" || code === "KeyA") keys.left = false;
            else if (code === "ArrowRight" || code === "KeyD") keys.right = false;
            return;
        }
        if (e.repeat && (code === "KeyH" || code === "KeyC" || code === "KeyP" || code === "KeyR" || code === "Space" || code === "Enter" || e.key === "Escape")) return;

        if (code === "KeyH") { toggleHelp(); e.preventDefault(); return; }
        if (code === "KeyC") {
            if (!helpOpen) {
                if (paused) setPause(false);
                cheatsOpen = !cheatsOpen;
                syncUI();
            }
            e.preventDefault(); return;
        }
        if (code === "KeyP" || e.key === "Escape") {
            if (!closeTopOverlay()) setPause(true);
            e.preventDefault(); return;
        }
        if (helpOpen || cheatsOpen || paused) {
            if (code === "Enter" || code === "Space" || code === "KeyR") { closeTopOverlay(); e.preventDefault(); }
            return;
        }
        if (code === "ArrowLeft" || code === "KeyA") { keys.left = true; e.preventDefault(); }
        else if (code === "ArrowRight" || code === "KeyD") { keys.right = true; e.preventDefault(); }
        else if (code === "Space" || code === "Enter") {
            e.preventDefault();
            if (state?.phase === "ready" && curSeat() === mySeat()) startLocalRun();
            else if (state?.phase === "done") submitAction({ type: "rematch" });
        } else if (code === "KeyR") {
            if (state) submitAction({ type: "rematch" });
        }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);

    function updatePointerDir(e) {
        const rect = board.getBoundingClientRect();
        pointerDir = e.clientX < rect.left + rect.width / 2 ? -1 : 1;
    }
    board.addEventListener("pointerdown", (e) => {
        if (!localRun || localRun.pre > 0 || cheatsOpen || helpOpen || paused) return;
        if (e.target.closest("[data-ov],button")) return;
        e.preventDefault();
        pointerDown = true;
        updatePointerDir(e);
        try { board.setPointerCapture(e.pointerId); } catch (_) { }
    });
    board.addEventListener("pointermove", (e) => { if (pointerDown) updatePointerDir(e); });
    const clearPointer = () => { pointerDown = false; pointerDir = 0; };
    board.addEventListener("pointerup", clearPointer);
    board.addEventListener("pointercancel", clearPointer);
    board.addEventListener("contextmenu", (e) => e.preventDefault());

    root.querySelectorAll("[data-dir]").forEach((btn) => {
        const d = Number(btn.dataset.dir);
        const press = (e) => {
            e.preventDefault();
            if (d < 0) touchL = true; else touchR = true;
            try { btn.setPointerCapture(e.pointerId); } catch (_) { }
        };
        const release = () => { if (d < 0) touchL = false; else touchR = false; };
        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointercancel", release);
        btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    function handleClick(event) {
        if (!alive) return;
        const t = event.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-exit]")) { onExit(); return; }
        if (t.closest("[data-help]")) { toggleHelp(); return; }
        if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
        if (t.closest("[data-cheats]")) {
            if (!helpOpen) {
                if (paused) setPause(false);
                cheatsOpen = !cheatsOpen;
                syncUI();
            }
            return;
        }
        if (t.closest("[data-close-cheats]")) { cheatsOpen = false; syncUI(); return; }
        if (t.closest("[data-pause]")) { if (!closeTopOverlay()) setPause(true); return; }
        if (t.closest("[data-resume]")) { setPause(false); return; }
        if (t.closest("[data-restart]")) { if (state) submitAction({ type: "rematch" }); return; }
        const cheatBtn = t.closest("[data-cheat]");
        if (cheatBtn) {
            const k = cheatBtn.dataset.cheat;
            cheats[k] = !cheats[k];
            syncCheats();
            return;
        }
        const btn = t.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "start") startLocalRun();
        else if (act === "rematch") { if (state) submitAction({ type: "rematch" }); }
    }
    root.addEventListener("click", handleClick);

    /* ================= boot: AI lokal atau room online ================= */
    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (room.isHost) {
            state = newMatch(1);
            afterState();
            publish();
            const u2 = room.onAction((action) => applyAction(action, state ? state.seats.guest : 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((nextState) => {
                if (!nextState) return;
                state = nextState;
                afterState();
                syncUI();
            });
            if (typeof u3 === "function") unsubs.push(u3);
            syncUI();
        }
    } else {
        state = newMatch(1);
        afterState();
        syncUI();
    }
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);

    return {
        destroy() {
            alive = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (botTimer) clearTimeout(botTimer);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("keyup", onKey);
            root.removeEventListener("click", handleClick);
            unsubs.forEach((u) => { try { u(); } catch (_) { } });
        },
    };
}