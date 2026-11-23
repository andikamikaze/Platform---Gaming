/* ==== GAME: golf-mini.js ==== */

/* =============================================================== */
/* Golf Mini - sports game (MGP module)                              */
/* Top-down mini golf over six hand-built holes. Rotate the aim     */
/* arrow, charge the power bar, putt, and watch the ball roll.      */
/* Water costs a penalty stroke, sand slows the roll, each hole     */
/* caps at 8 strokes.                                               */
/* =============================================================== */
(() => {
    "use strict";

    /* ---------- pure rules + physics (exposed via _test) ---------- */
    const VW = 560,
        VH = 400,
        R = 7,
        CUP_R = 11,
        CAPTURE_SPEED = 115;
    const WALL_E = 0.85,
        FRICTION_BASE = 26,
        FRICTION_K = 0.8;
    const SAND_MULT = 3.4,
        STOP_SPEED = 8;
    const MIN_SHOT = 60,
        MAX_SHOT = 440;
    const STROKE_CAP = 8;

    /* six hand-authored holes: walls are segments [x1,y1,x2,y2],
 water/sand are rects [x,y,w,h], poly is the fairway outline */
    const HOLES = [
        {
            name: "Open Lane",
            par: 2,
            poly: [
                [60, 120],
                [500, 120],
                [500, 290],
                [60, 290],
            ],
            walls: [
                [60, 120, 500, 120],
                [500, 120, 500, 290],
                [500, 290, 60, 290],
                [60, 290, 60, 120],
                [280, 120, 280, 178],
                [280, 232, 280, 290],
            ],
            water: [],
            sand: [],
            tee: { x: 105, y: 205 },
            cup: { x: 455, y: 205 },
        },
        {
            name: "Dogleg Bank",
            par: 3,
            poly: [
                [40, 240],
                [40, 360],
                [300, 360],
                [420, 240],
                [520, 240],
                [520, 60],
                [300, 60],
                [300, 240],
            ],
            walls: [
                [40, 240, 40, 360],
                [40, 360, 300, 360],
                [300, 360, 420, 240],
                [420, 240, 520, 240],
                [520, 240, 520, 60],
                [520, 60, 300, 60],
                [300, 60, 300, 240],
                [40, 240, 300, 240],
            ],
            water: [],
            sand: [],
            tee: { x: 85, y: 300 },
            cup: { x: 470, y: 140 },
        },
        {
            name: "Twin Ponds",
            par: 3,
            poly: [
                [40, 60],
                [520, 60],
                [520, 340],
                [40, 340],
            ],
            walls: [
                [40, 60, 520, 60],
                [520, 60, 520, 340],
                [520, 340, 40, 340],
                [40, 340, 40, 60],
            ],
            water: [
                [240, 100, 90, 140],
                [240, 284, 90, 56],
            ],
            sand: [],
            tee: { x: 95, y: 262 },
            cup: { x: 465, y: 262 },
        },
        {
            name: "Serpentine",
            par: 4,
            poly: [
                [40, 60],
                [520, 60],
                [520, 370],
                [40, 370],
            ],
            walls: [
                [40, 60, 520, 60],
                [520, 60, 520, 370],
                [520, 370, 40, 370],
                [40, 370, 40, 60],
                [40, 280, 440, 280],
                [120, 160, 520, 160],
            ],
            water: [],
            sand: [],
            tee: { x: 75, y: 325 },
            cup: { x: 95, y: 110 },
        },
        {
            name: "Bunker Alley",
            par: 2,
            poly: [
                [40, 60],
                [520, 60],
                [520, 360],
                [40, 360],
            ],
            walls: [
                [40, 60, 520, 60],
                [520, 60, 520, 360],
                [520, 360, 40, 360],
                [40, 360, 40, 60],
            ],
            water: [[360, 70, 160, 100]],
            sand: [
                [185, 75, 55, 55],
                [150, 150, 120, 55],
            ],
            tee: { x: 85, y: 120 },
            cup: { x: 290, y: 108 },
        },
        {
            name: "Pinch Point",
            par: 2,
            poly: [
                [40, 60],
                [520, 60],
                [520, 360],
                [40, 360],
            ],
            walls: [
                [40, 60, 520, 60],
                [520, 60, 520, 360],
                [520, 360, 40, 360],
                [40, 360, 40, 60],
                [240, 60, 340, 160],
                [240, 360, 340, 260],
            ],
            water: [],
            sand: [],
            tee: { x: 95, y: 210 },
            cup: { x: 470, y: 210 },
        },
    ];
    const PAR_TOTAL = HOLES.reduce((s, h) => s + h.par, 0);

    function clamp01(v) {
        return v < 0 ? 0 : v > 1 ? 1 : v;
    }
    function shotSpeed(power) {
        return MIN_SHOT + (MAX_SHOT - MIN_SHOT) * clamp01(power);
    }

    function closestOnSeg(px, py, ax, ay, bx, by) {
        const abx = bx - ax,
            aby = by - ay;
        const len = abx * abx + aby * aby;
        let t = len > 0 ? ((px - ax) * abx + (py - ay) * aby) / len : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        return { x: ax + abx * t, y: ay + aby * t };
    }

    /* shared physics step: friction, wall reflections (any angle),
 water detection, cup capture. Mutates st, returns an event:
 "" | "water" | "cup". st = {x,y,vx,vy,walls,waters,sands,cup} */
    function stepBall(st, dtMs) {
        const dt = Math.max(0, Math.min(100, dtMs)) / 1000;
        const n = Math.max(1, Math.ceil(dt * 120));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            if (st.holed) return "cup";
            st.x += st.vx * h;
            st.y += st.vy * h;
            /* walls: reflect off the closest point of each segment */
            const walls = st.walls || [];
            for (let k = 0; k < walls.length; k++) {
                const w = walls[k];
                const q = closestOnSeg(st.x, st.y, w[0], w[1], w[2], w[3]);
                let dx = st.x - q.x,
                    dy = st.y - q.y;
                let d = Math.hypot(dx, dy);
                if (d < R) {
                    if (d < 0.0001) {
                        dx = 1;
                        dy = 0;
                        d = 1;
                    }
                    const nx = dx / d,
                        ny = dy / d;
                    st.x = q.x + nx * R;
                    st.y = q.y + ny * R;
                    const vn = st.vx * nx + st.vy * ny;
                    if (vn < 0) {
                        st.vx -= (1 + WALL_E) * vn * nx;
                        st.vy -= (1 + WALL_E) * vn * ny;
                    }
                }
            }
            /* water: penalty is applied by the caller (ball reset) */
            const waters = st.waters || [];
            for (let k = 0; k < waters.length; k++) {
                const r = waters[k];
                if (
                    st.x > r[0] &&
                    st.x < r[0] + r[2] &&
                    st.y > r[1] &&
                    st.y < r[1] + r[3]
                ) {
                    st.vx = 0;
                    st.vy = 0;
                    return "water";
                }
            }
            /* cup capture: close enough and not too fast */
            const cd = Math.hypot(st.x - st.cup.x, st.y - st.cup.y);
            const sp = Math.hypot(st.vx, st.vy);
            if (cd < CUP_R && sp < CAPTURE_SPEED) {
                st.vx = 0;
                st.vy = 0;
                st.holed = true;
                st.x = st.cup.x;
                st.y = st.cup.y;
                return "cup";
            }
            /* rolling friction (stronger in sand) */
            const sands = st.sands || [];
            let inSand = false;
            for (let k = 0; k < sands.length; k++) {
                const s = sands[k];
                if (
                    st.x > s[0] &&
                    st.x < s[0] + s[2] &&
                    st.y > s[1] &&
                    st.y < s[1] + s[3]
                ) {
                    inSand = true;
                    break;
                }
            }
            const dec =
                (FRICTION_BASE + FRICTION_K * sp) * (inSand ? SAND_MULT : 1) * h;
            const ns = Math.max(0, sp - dec);
            if (ns < STOP_SPEED) {
                st.vx = 0;
                st.vy = 0;
            } else if (sp > 0) {
                const f = ns / sp;
                st.vx *= f;
                st.vy *= f;
            }
        }
        return "";
    }

    /* play a hole with scripted shots (fixed 16ms steps, deterministic).
 shots: [{angle, power}, ...] with angle in degrees (0 = right,
 90 = down). Returns {strokes, holed, capped, splashes, x, y}. */
    function simulateHole(holeIdx, shots) {
        const h = HOLES[holeIdx];
        const st = {
            x: h.tee.x,
            y: h.tee.y,
            vx: 0,
            vy: 0,
            holed: false,
            walls: h.walls,
            waters: h.water,
            sands: h.sand,
            cup: h.cup,
        };
        let strokes = 0,
            splashes = 0,
            capped = false;
        for (let i = 0; i < shots.length; i++) {
            if (st.holed) break;
            strokes++;
            const s = shots[i];
            const v = shotSpeed(s.power);
            const a = (s.angle * Math.PI) / 180;
            const sx = st.x,
                sy = st.y;
            st.vx = Math.cos(a) * v;
            st.vy = Math.sin(a) * v;
            let guard = 0;
            while (guard++ < 2500) {
                const ev = stepBall(st, 16);
                if (ev === "cup") break;
                if (ev === "water") {
                    strokes++;
                    splashes++;
                    st.x = sx;
                    st.y = sy;
                    st.vx = 0;
                    st.vy = 0;
                    break;
                }
                if (st.vx === 0 && st.vy === 0) break;
            }
            if (!st.holed && strokes >= STROKE_CAP) {
                capped = true;
                break;
            }
        }
        return {
            strokes: strokes,
            holed: !!st.holed,
            capped: capped,
            splashes: splashes,
            x: st.x,
            y: st.y,
        };
    }

    /* scripted completions, one list per hole, found by power search
 over the same stepBall physics; each proves the hole can be
 finished (total 10 strokes, well under the win limit of 20) */
    const SOLUTIONS = [
        [{ angle: 0, power: 0.85 }],
        [
            { angle: 0, power: 0.78 },
            { angle: 322, power: 0.29 },
        ],
        [{ angle: 0, power: 0.9 }],
        [
            { angle: 0, power: 0.86 },
            { angle: 270, power: 0.1 },
            { angle: 180, power: 0.78 },
            { angle: 264.3, power: 0.3 },
        ],
        [{ angle: 356.6, power: 0.85 }],
        [{ angle: 0, power: 0.9 }],
    ];

    const TEST = {
        HOLES,
        PAR_TOTAL,
        STROKE_CAP,
        R,
        CUP_R,
        CAPTURE_SPEED,
        MIN_SHOT,
        MAX_SHOT,
        shotSpeed,
        stepBall,
        simulateHole,
        SOLUTIONS,
    };

    MGP_REGISTER({
        id: "golf-mini",
        name: "Golf Mini",
        category: "sports",
        catLabel: "Sports",
        desc: "Six holes of mini golf: aim, charge, avoid water and sand.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5v38"/><path d="M15 8l19 6.5L15 21"/><path d="M7 43h34"/><circle cx="35" cy="36" r="6.5"/></svg>',
        bg: ["#a7f3d0", "#22c55e"],
        _test: TEST,

        build(app) {
            const $ = (s) => app.querySelector(s);
            const fx = (n) => (Math.round(n * 10) / 10).toFixed(1);

            app.innerHTML = `
<style>
#golf-mini-app [hidden]{display:none!important}
#golf-mini-app .gm-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:6px;padding:8px;min-height:0}
#golf-mini-app .gm-head{font-size:13.5px;font-weight:700;color:#c3cde2;text-align:center}
#golf-mini-app .gm-svgbox{flex:1;min-height:0;width:100%;max-width:820px;display:flex;justify-content:center}
#golf-mini-app .gm-svg{width:100%;height:100%;display:block}
#golf-mini-app .gm-fair{fill:#14532d;stroke:#052e16;stroke-width:4;stroke-linejoin:round}
#golf-mini-app .gm-wall{stroke:#e2e8f0;stroke-width:5;stroke-linecap:round}
#golf-mini-app .gm-water{fill:#2563eb;opacity:.9}
#golf-mini-app .gm-wave{stroke:#dbeafe;stroke-width:1.6;opacity:.4;stroke-linecap:round}
#golf-mini-app .gm-sand{fill:#d6b25e;opacity:.95}
#golf-mini-app .gm-cup{fill:#0b1020;stroke:#f8fafc;stroke-width:1.5}
#golf-mini-app .gm-pole{stroke:#f8fafc;stroke-width:2;stroke-linecap:round}
#golf-mini-app .gm-flag{fill:#ef4444;stroke:none}
#golf-mini-app .gm-tee{fill:#f8fafc;opacity:.5}
#golf-mini-app .gm-ball{fill:#f8fafc;stroke:#0f172a;stroke-width:1.2}
#golf-mini-app .gm-aim{stroke:#fde047;stroke-width:2.5;stroke-linecap:round}
#golf-mini-app .gm-aimhead{fill:#fde047;stroke:none}
#golf-mini-app .gm-power{fill:#1f2a55;stroke:#8792c8;stroke-width:1.5}
#golf-mini-app .gm-powerfill{fill:#a3e635}
#golf-mini-app .gm-txt{font-family:inherit;text-anchor:middle}
</style>
<div class="mgp-hud">
  <span class="mgp-title">Golf Mini</span>
  <span class="mgp-chip">Hole <b data-hud="hole">1</b>/6</span>
  <span class="mgp-chip">Strokes <b data-hud="strokes">0</b></span>
  <span class="mgp-chip">Par <b data-hud="par">2</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="gm-wrap">
    <div class="gm-head" data-el="caption">Golf Mini</div>
    <div class="gm-svgbox">
      <svg class="gm-svg" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" data-el="svg" aria-label="Mini golf course">
        <g data-el="course"></g>
        <g data-el="aimG" visibility="hidden">
          <line data-el="aimLine" x1="10" y1="0" x2="50" y2="0"/>
          <polygon data-el="aimHead" points="50,-6 64,0 50,6"/>
        </g>
        <circle class="gm-ball" data-el="ball" r="${R}"/>
        <g>
          <text class="gm-txt" x="14" y="112" font-size="11" fill="#9ca3af">Pwr</text>
          <rect class="gm-power" x="6" y="120" width="16" height="200" rx="4"/>
          <rect class="gm-powerfill" data-el="powerFill" x="8.5" y="318" width="11" height="0"/>
          <text class="gm-txt" data-el="powerTxt" x="14" y="338" font-size="11" fill="#9ca3af">0</text>
        </g>
      </svg>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Golf Mini</h2>
      <p class="mgp-ov-sub">Rotate the arrow to aim, hold Space (or the Putt button) to charge, release to putt. Water costs a one stroke penalty, sand slows the roll, and each hole caps at ${STROKE_CAP} strokes. Finish all six holes in ${PAR_TOTAL + 4} strokes or fewer to win.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Course complete</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="start">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot">
  <button class="mgp-dbtn" data-act="rotL" aria-label="Rotate aim left">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
  </button>
  <button class="mgp-dbtn" data-act="rotR" aria-label="Rotate aim right">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
  </button>
  <button class="mgp-btn" data-act="putt">Putt (hold)</button>
  <span class="mgp-hint" data-el="banner">Left/Right: aim. Hold Space: power. Release: putt.</span>
</div>`;

            /* ---------------- refs ---------------- */
            const courseG = $('[data-el="course"]');
            const aimG = $('[data-el="aimG"]');
            const aimLine = $('[data-el="aimLine"]');
            const aimHead = $('[data-el="aimHead"]');
            const ballEl = $('[data-el="ball"]');
            const powerFill = $('[data-el="powerFill"]');
            const powerTxt = $('[data-el="powerTxt"]');
            const captionEl = $('[data-el="caption"]');
            const bannerEl = $('[data-el="banner"]');
            const hudHole = $('[data-hud="hole"]');
            const hudStrokes = $('[data-hud="strokes"]');
            const hudPar = $('[data-hud="par"]');
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let mode = "aim"; /* aim | roll | between | done */
            let holeIdx = 0,
                strokes = 0;
            let totals = [],
                cappedCount = 0;
            let aimAngle = 0,
                charging = false,
                phase = 0,
                power = 0,
                rotDir = 0;
            let st = null,
                shotStart = { x: 0, y: 0 };
            let betweenT = 0;
            let rafId = 0,
                lastT = 0,
                acc = 0;

            /* ---------------- rendering ---------------- */
            function hud() {
                hudHole.textContent = String(Math.min(holeIdx + 1, HOLES.length));
                hudStrokes.textContent = String(strokes);
                hudPar.textContent = String(
                    HOLES[Math.min(holeIdx, HOLES.length - 1)].par,
                );
            }
            function banner(msg) {
                bannerEl.textContent = msg;
                bannerEl.className = "mgp-hint";
            }
            function caption() {
                const h = HOLES[Math.min(holeIdx, HOLES.length - 1)];
                captionEl.textContent =
                    "Hole " +
                    (holeIdx + 1) +
                    " of " +
                    HOLES.length +
                    " - " +
                    h.name +
                    " - Par " +
                    h.par +
                    " - Aim " +
                    Math.round(aimAngle) +
                    " deg";
            }
            function renderCourse() {
                const h = HOLES[holeIdx];
                let s =
                    '<polygon class="gm-fair" points="' +
                    h.poly.map((p) => p.join(",")).join(" ") +
                    '"/>';
                for (const r of h.sand) {
                    s +=
                        '<rect class="gm-sand" x="' +
                        r[0] +
                        '" y="' +
                        r[1] +
                        '" width="' +
                        r[2] +
                        '" height="' +
                        r[3] +
                        '"/>';
                }
                for (const r of h.water) {
                    s +=
                        '<rect class="gm-water" x="' +
                        r[0] +
                        '" y="' +
                        r[1] +
                        '" width="' +
                        r[2] +
                        '" height="' +
                        r[3] +
                        '"/>';
                    s +=
                        '<line class="gm-wave" x1="' +
                        (r[0] + 8) +
                        '" y1="' +
                        (r[1] + r[3] * 0.4) +
                        '" x2="' +
                        (r[0] + r[2] - 8) +
                        '" y2="' +
                        (r[1] + r[3] * 0.4) +
                        '"/>';
                }
                for (const w of h.walls) {
                    s +=
                        '<line class="gm-wall" x1="' +
                        w[0] +
                        '" y1="' +
                        w[1] +
                        '" x2="' +
                        w[2] +
                        '" y2="' +
                        w[3] +
                        '"/>';
                }
                s +=
                    '<circle class="gm-tee" cx="' +
                    h.tee.x +
                    '" cy="' +
                    h.tee.y +
                    '" r="3"/>';
                s +=
                    '<circle class="gm-cup" cx="' +
                    h.cup.x +
                    '" cy="' +
                    h.cup.y +
                    '" r="' +
                    CUP_R +
                    '"/>';
                s +=
                    '<line class="gm-pole" x1="' +
                    h.cup.x +
                    '" y1="' +
                    (h.cup.y - 4) +
                    '" x2="' +
                    h.cup.x +
                    '" y2="' +
                    (h.cup.y - 30) +
                    '"/>';
                s +=
                    '<polygon class="gm-flag" points="' +
                    h.cup.x +
                    "," +
                    (h.cup.y - 30) +
                    " " +
                    (h.cup.x + 16) +
                    "," +
                    (h.cup.y - 24) +
                    " " +
                    h.cup.x +
                    "," +
                    (h.cup.y - 18) +
                    '"/>';
                courseG.innerHTML = s;
            }
            function renderBall() {
                ballEl.setAttribute("cx", fx(st.x));
                ballEl.setAttribute("cy", fx(st.y));
            }
            function renderAim() {
                if (mode !== "aim" || !st || st.holed) {
                    aimG.setAttribute("visibility", "hidden");
                    return;
                }
                aimG.setAttribute("visibility", "visible");
                aimG.setAttribute(
                    "transform",
                    "translate(" +
                    fx(st.x) +
                    "," +
                    fx(st.y) +
                    ") rotate(" +
                    fx(aimAngle) +
                    ")",
                );
                const len = 26 + 40 * (charging ? power : 0);
                aimLine.setAttribute("x2", String(10 + len));
                aimHead.setAttribute(
                    "points",
                    10 + len + ",-6 " + (22 + len) + ",0 " + (10 + len) + ",6",
                );
            }
            function renderPower() {
                const p = charging ? power : 0;
                powerFill.setAttribute("y", String(318 - 194 * p));
                powerFill.setAttribute("height", String(194 * p));
                powerFill.setAttribute(
                    "fill",
                    p < 0.5 ? "#a3e635" : p < 0.8 ? "#fbbf24" : "#f87171",
                );
                powerTxt.textContent = String(Math.round(p * 100));
            }

            /* ---------------- flow ---------------- */
            function setAim(a) {
                aimAngle = (a + 720) % 360;
                caption();
                renderAim();
            }
            function startCharge() {
                if (
                    charging ||
                    mode !== "aim" ||
                    !started ||
                    over ||
                    !st ||
                    st.holed
                )
                    return;
                charging = true;
                phase = 0;
                power = 0;
            }
            function releaseCharge() {
                if (!charging) return;
                charging = false;
                if (mode === "aim" && started && !over) putt();
            }
            function putt() {
                if (mode !== "aim" || !st || st.holed) return;
                strokes++;
                shotStart = { x: st.x, y: st.y };
                const v = shotSpeed(power);
                const a = (aimAngle * Math.PI) / 180;
                st.vx = Math.cos(a) * v;
                st.vy = Math.sin(a) * v;
                power = 0;
                phase = 0;
                renderPower();
                mode = "roll";
                acc = 0;
                banner("Rolling...");
                renderAim();
                hud();
            }
            function onWater() {
                strokes++;
                banner(
                    "Splash! One stroke penalty - ball back at the last spot.",
                );
                st.x = shotStart.x;
                st.y = shotStart.y;
                st.vx = 0;
                st.vy = 0;
                renderBall();
                if (strokes >= STROKE_CAP && !st.holed) return capOut();
                mode = "aim";
                hud();
                renderAim();
            }
            function onCup() {
                totals[holeIdx] = strokes;
                const h = HOLES[holeIdx];
                banner(
                    "In the cup! Hole " +
                    (holeIdx + 1) +
                    " took " +
                    strokes +
                    " stroke" +
                    (strokes === 1 ? "" : "s") +
                    " (par " +
                    h.par +
                    ").",
                );
                renderBall();
                mode = "between";
                betweenT = 1.5;
            }
            function onStopped() {
                if (strokes >= STROKE_CAP) return capOut();
                mode = "aim";
                banner("Stroke " + strokes + " done. Line up the next one.");
                renderAim();
            }
            function capOut() {
                totals[holeIdx] = STROKE_CAP;
                cappedCount++;
                banner(
                    "Stroke cap of " +
                    STROKE_CAP +
                    " reached on hole " +
                    (holeIdx + 1) +
                    " - moving on.",
                );
                mode = "between";
                betweenT = 1.6;
                hud();
            }
            function nextHole() {
                holeIdx++;
                if (holeIdx >= HOLES.length) return finish();
                loadHole(holeIdx);
            }
            function loadHole(i) {
                const h = HOLES[i];
                holeIdx = i;
                strokes = 0;
                st = {
                    x: h.tee.x,
                    y: h.tee.y,
                    vx: 0,
                    vy: 0,
                    holed: false,
                    walls: h.walls,
                    waters: h.water,
                    sands: h.sand,
                    cup: h.cup,
                };
                aimAngle =
                    ((Math.atan2(h.cup.y - h.tee.y, h.cup.x - h.tee.x) * 180) /
                        Math.PI +
                        360) %
                    360;
                charging = false;
                power = 0;
                phase = 0;
                rotDir = 0;
                mode = "aim";
                renderCourse();
                renderBall();
                renderAim();
                renderPower();
                hud();
                caption();
                banner(
                    "Hole " + (i + 1) + ": " + h.name + ". Aim, charge, putt.",
                );
            }
            function finish() {
                over = true;
                mode = "done";
                stopLoop();
                const total = totals.reduce((s, v) => s + v, 0);
                const win = total <= PAR_TOTAL + 4 && cappedCount < 2;
                let card = "";
                for (let i = 0; i < HOLES.length; i++) {
                    card += "H" + (i + 1) + " " + totals[i] + "/" + HOLES[i].par;
                    card += i === 2 || i === 5 ? "<br>" : ", ";
                }
                let reason =
                    card +
                    "Total " +
                    total +
                    " strokes (par " +
                    PAR_TOTAL +
                    ", limit " +
                    (PAR_TOTAL + 4) +
                    ").";
                if (cappedCount >= 2)
                    reason += " Stroke cap hit on " + cappedCount + " holes.";
                else if (!win) reason += " Over the limit.";
                ovTitle.textContent = win ? "Great round!" : "Over the limit";
                ovTitle.className =
                    "mgp-ov-title " + (win ? "mgp-win" : "mgp-lose");
                ovReason.innerHTML = reason;
                ovOver.removeAttribute("hidden");
                banner(
                    win ? "Course complete - great round!" : "Course complete.",
                );
            }
            function startGame() {
                stopLoop();
                totals = [];
                cappedCount = 0;
                over = false;
                started = true;
                ovStart.setAttribute("hidden", "");
                ovOver.setAttribute("hidden", "");
                loadHole(0);
                ensureLoop();
            }

            /* ---------------- main loop ---------------- */
            function loop(t) {
                if (!active) return;
                if (!lastT) lastT = t;
                const dt = Math.min(0.05, (t - lastT) / 1000);
                lastT = t;
                if (mode === "aim") {
                    if (rotDir) setAim(aimAngle + rotDir * 140 * dt);
                    if (charging) {
                        phase += dt / 0.85; /* 0 to 1 and back in 0.85s */
                        const pp = phase % 2;
                        power = pp < 1 ? pp : 2 - pp;
                        renderPower();
                    }
                    renderAim();
                } else if (mode === "roll") {
                    acc += dt;
                    while (acc >= 0.016) {
                        acc -= 0.016;
                        const ev = stepBall(st, 16);
                        if (ev === "water") {
                            onWater();
                            break;
                        }
                        if (ev === "cup") {
                            onCup();
                            break;
                        }
                        if (st.vx === 0 && st.vy === 0) {
                            onStopped();
                            break;
                        }
                    }
                    renderBall();
                } else if (mode === "between") {
                    betweenT -= dt;
                    if (betweenT <= 0) nextHole();
                }
                if (mode === "done") {
                    rafId = 0;
                    return;
                }
                rafId = requestAnimationFrame(loop);
            }
            function stopLoop() {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                lastT = 0;
                acc = 0;
            }
            function ensureLoop() {
                if (!rafId) rafId = requestAnimationFrame(loop);
            }

            /* ---------------- events ---------------- */
            const onKey = (e) => {
                if (!active) return;
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    if (mode === "aim" && started && !over) {
                        setAim(aimAngle + (e.key === "ArrowLeft" ? -2 : 2));
                    }
                } else if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    if (!started || over) {
                        startGame();
                        return;
                    }
                    if (e.repeat) return;
                    if (mode === "aim") startCharge();
                }
            };
            const onKeyUp = (e) => {
                if (!active) return;
                if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    releaseCharge();
                }
            };
            document.addEventListener("keydown", onKey);
            document.addEventListener("keyup", onKeyUp);

            const rotL = $('[data-act="rotL"]');
            const rotR = $('[data-act="rotR"]');
            const puttBtn = $('[data-act="putt"]');
            rotL.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (active && mode === "aim" && started && !over) rotDir = -1;
            });
            rotR.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (active && mode === "aim" && started && !over) rotDir = 1;
            });
            ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => {
                rotL.addEventListener(ev, () => {
                    if (rotDir === -1) rotDir = 0;
                });
                rotR.addEventListener(ev, () => {
                    if (rotDir === 1) rotDir = 0;
                });
            });
            puttBtn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (!active || !started || over || mode !== "aim") return;
                startCharge();
            });
            document.addEventListener("pointerup", () => {
                if (!active) return;
                rotDir = 0;
                releaseCharge();
            });

            app.addEventListener("pointerdown", (e) => {
                const btn = e.target.closest ? e.target.closest("button") : null;
                if (btn) e.preventDefault(); /* keep focus off buttons */
            });
            app.addEventListener("click", (e) => {
                if (!active) return;
                const btn = e.target.closest
                    ? e.target.closest("[data-act]")
                    : null;
                if (!btn) return;
                const a = btn.dataset.act;
                if (a === "start" || a === "restart") startGame();
                else if (a === "rotL" && mode === "aim") setAim(aimAngle - 3);
                else if (a === "rotR" && mode === "aim") setAim(aimAngle + 3);
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
                if (started && !over) ensureLoop();
            }
            function close() {
                active = false;
                charging = false;
                rotDir = 0;
                stopLoop();
            }

            loadHole(0);
            renderPower();
            return { open, close };
        },
    });
})();
