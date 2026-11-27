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

    /* ---------- inline icons (classic MGP script, no ESM import) ---------- */
    const ICON_PATHS = {
        helpCircle: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
        wrench: ["M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z", "M6 16l-3 3", "M14.5 4.5 19 9"],
        pause: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
        refresh: ["M21 2v6h-6", "M3 12a9 9 0 0 1 15-6.7L21 8", "M3 22v-6h6", "M21 12a9 9 0 0 1-15 6.7L3 16"],
        logOut: ["m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"],
        rotateCcw: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
        rotateCw: ["M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", "M21 3v5h-5"],
        flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
    };
    function iconSVG(name, size) {
        const paths = ICON_PATHS[name] || ICON_PATHS.flag;
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + "</svg>";
    }

    MGP_REGISTER({
        id: "golf-mini",
        name: "Golf Mini",
        category: "sports",
        catLabel: "Sports",
        desc: "Six holes of mini golf: aim, charge, avoid water and sand.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5v38"/><path d="M15 8l19 6.5L15 21"/><path d="M7 43h34"/><circle cx="35" cy="36" r="6.5"/></svg>',
        bg: ["#a7f3d0", "#22c55e"],
        _test: TEST,

        build(app, context) {
            const ctx = context || {};
            const onExit = typeof ctx.onExit === "function" ? ctx.onExit : function () {
                const b = typeof document !== "undefined" && document.getElementById
                    ? document.getElementById("closeGameButton") : null;
                if (b && typeof b.click === "function") b.click();
            };
            const $ = (s) => app.querySelector(s);
            const fx = (n) => (Math.round(n * 10) / 10).toFixed(1);
            app.className = "mgp-app game-app gm game-fill";

            app.innerHTML = `
<style>
#golf-mini-app [hidden]{display:none!important}
#golf-mini-app.gm{--panel:#111a33;--court:#0b1020;--line:#ffffff1f;--ink:#e5e7eb;--mut:#9ca3af;--acc:#a3e635;--warn:#fbbf24;--danger:#f87171;display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:0}
#golf-mini-app.gm *{box-sizing:border-box}
#golf-mini-app .gm-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#golf-mini-app .gm-info{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1 1 auto;min-width:0}
#golf-mini-app .gm-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
#golf-mini-app .gm-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
#golf-mini-app .gm-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
#golf-mini-app .gm-chip[data-hud="status"]{max-width:210px;overflow:hidden;text-overflow:ellipsis}
#golf-mini-app .gm-chip .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex:none}
#golf-mini-app .gm-btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:9px;min-height:36px;padding:0 11px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#golf-mini-app .gm-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
#golf-mini-app .gm-btn:disabled{opacity:.4;cursor:default}
#golf-mini-app .gm-btn.acc{border-color:var(--acc);color:var(--acc)}
#golf-mini-app .gm-btn.on{border-color:var(--warn);color:var(--warn)}
#golf-mini-app .gm-icon-btn{display:inline-flex;align-items:center;gap:6px}
#golf-mini-app .gm-icon-btn svg{flex:none;display:block}
#golf-mini-app .gm-ctrl{display:flex;align-items:center;gap:5px;flex-wrap:nowrap}
#golf-mini-app .gm-ctrl .gm-btn{min-width:32px;padding:0 7px;font-size:13px}
#golf-mini-app .gm-board{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:560/400;border:1px solid var(--line);border-radius:10px;background:var(--court);overflow:hidden;padding:0}
#golf-mini-app .gm-svg{display:block;width:100%;height:100%;touch-action:none;user-select:none}
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
#golf-mini-app .gm-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,16,32,.78);z-index:5}
#golf-mini-app .gm-card{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;text-align:center}
#golf-mini-app .gm-card h2,#golf-mini-app .gm-card h3{margin:0;font-size:17px}
#golf-mini-app .gm-win{color:var(--acc)}
#golf-mini-app .gm-lose{color:var(--danger)}
#golf-mini-app .gm-sub{font-size:12px;line-height:1.55;color:var(--mut);margin:0}
#golf-mini-app .gm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#golf-mini-app .gm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#golf-mini-app .gm-cheats,#golf-mini-app .gm-help{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
#golf-mini-app .gm-cheats{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
#golf-mini-app .gm-help{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
#golf-mini-app .gm-help b{display:block;margin-bottom:5px;color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#golf-mini-app .gm-help ul{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
#golf-mini-app .gm-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--court);color:var(--ink);font:inherit}
#golf-mini-app .gm-note{color:var(--mut);font-size:11px;line-height:1.5}
#golf-mini-app .gm-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--court);font-size:12px;text-align:left}
#golf-mini-app .gm-switch{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid var(--line);background:var(--court);cursor:pointer;flex:none;padding:0}
#golf-mini-app .gm-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mut)}
#golf-mini-app .gm-switch[aria-pressed="true"]{border-color:var(--acc);background:rgba(163,230,53,.15)}
#golf-mini-app .gm-switch[aria-pressed="true"]:after{left:20px;background:var(--acc)}
@media (prefers-reduced-motion:reduce){#golf-mini-app *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
/* --- layout redesign overrides (keep last) --- */
#golf-mini-app.gm.game-fill > .gm-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
#golf-mini-app.gm.game-fill > .gm-board:not(:has(.gm-ov:not([hidden]))){aspect-ratio:560/400;flex:0 0 auto}
#golf-mini-app.gm.game-fill > .gm-board:has(.gm-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
#golf-mini-app .gm-hud{gap:5px;flex-direction:column;align-items:stretch}
#golf-mini-app .gm-info{gap:5px}
#golf-mini-app .gm-tools{gap:5px;flex-wrap:nowrap;justify-content:space-between}
#golf-mini-app .gm-chip{padding:4px 6px;min-height:0;font-size:9px}
#golf-mini-app .gm-chip[data-hud="status"],#golf-mini-app .gm-chip[data-hud="par"]{display:none}
#golf-mini-app .gm-ctrl{gap:3px}
#golf-mini-app .gm-btn{min-height:32px;padding:5px 6px;font-size:9px}
#golf-mini-app .gm-icon-btn .gm-label{display:none}
#golf-mini-app .gm-ov{padding:8px}
#golf-mini-app .gm-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#golf-mini-app .gm-cheats,#golf-mini-app .gm-help{scrollbar-width:none}
#golf-mini-app .gm-cheats::-webkit-scrollbar,#golf-mini-app .gm-help::-webkit-scrollbar{display:none}
#golf-mini-app .gm-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
#golf-mini-app .gm-note{display:none}
}
@media (pointer:coarse){#golf-mini-app .gm-hud .gm-btn{min-height:32px}}
</style>
<div class="gm-hud">
  <div class="gm-info">
    <span class="gm-chip game-status"><i class="game-status-dot"></i><span data-hud="status">Ready</span></span>
    <span class="gm-chip">HOLE <b data-hud="hole">1</b>/6</span>
    <span class="gm-chip">PAR <b data-hud="par">2</b></span>
    <span class="gm-chip">STROKES <b data-hud="strokes">0</b></span>
    <span class="gm-chip">TOTAL <b data-hud="score">0</b></span>
    <span class="gm-chip">AIM <b data-hud="aim">0</b>&deg;</span>
  </div>
  <div class="gm-tools">
    <div class="gm-ctrl">
      <button class="gm-btn" type="button" data-act="rotL" aria-label="Rotate aim left" title="Rotate aim left (Left arrow)">${iconSVG("rotateCcw", 14)}</button>
      <button class="gm-btn" type="button" data-act="rotR" aria-label="Rotate aim right" title="Rotate aim right (Right arrow)">${iconSVG("rotateCw", 14)}</button>
      <button class="gm-btn acc" type="button" data-act="putt" aria-label="Putt (hold)" title="Hold to charge, release to putt (Space)">PUTT</button>
    </div>
    <button class="gm-btn gm-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", 14)}<span class="gm-label">Help</span></button>
    <button class="gm-btn gm-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", 14)}<span class="gm-label">Cheats</span></button>
    <button class="gm-btn gm-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", 14)}<span class="gm-label">Pause</span></button>
    <button class="gm-btn gm-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", 14)}<span class="gm-label">Restart</span></button>
    <button class="gm-btn gm-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", 14)}<span class="gm-label">Exit</span></button>
  </div>
</div>
<section class="game-panel gm-board" data-board>
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
  <div class="gm-ov" data-ov="select">
    <div class="gm-card">
      <div class="gm-head"><h2>Golf Mini</h2><span class="gm-note">6 holes &middot; par ${PAR_TOTAL}</span></div>
      <p class="gm-sub">Rotate the aim arrow, hold Space (or PUTT) to charge, release to putt. Water costs one penalty stroke, sand slows the roll, and each hole caps at ${STROKE_CAP} strokes. Finish all six holes in ${PAR_TOTAL + 4} strokes or fewer to win.</p>
      <div class="gm-foot"><button class="gm-btn" type="button" data-help>How to play</button><button class="gm-btn acc" type="button" data-act="start">Start game</button></div>
    </div>
  </div>
  <div class="gm-ov" data-ov="over" hidden>
    <div class="gm-card">
      <div class="gm-head"><h2 data-ov="title">Course complete</h2></div>
      <p class="gm-sub" data-ov="reason"></p>
      <div class="gm-foot"><span class="gm-note">Press H to reopen the guide</span><button class="gm-btn acc" type="button" data-act="start">Play again</button></div>
    </div>
  </div>
  <div class="gm-ov" data-ov="pause" hidden>
    <div class="gm-card">
      <div class="gm-head"><h3>Paused</h3></div>
      <p class="gm-sub">Ball roll, charging and the between-hole timer are frozen.</p>
      <div class="gm-foot"><span class="gm-note">Press P or Esc to resume</span><button class="gm-btn acc" type="button" data-resume>Resume</button></div>
    </div>
  </div>
  <div class="gm-ov" data-ov="cheat" hidden>
    <div class="gm-card">
      <div class="gm-head"><h3>Cheats</h3><button class="gm-btn" type="button" data-close>Close</button></div>
      <div class="gm-cheats" data-cheatgrid></div>
      <div class="gm-cheats" data-cheatacts></div>
      <div class="gm-foot"><span class="gm-note">Toggles apply immediately</span><button class="gm-btn" type="button" data-close>Done</button></div>
    </div>
  </div>
  <div class="gm-ov" data-ov="help" hidden>
    <div class="gm-card">
      <div class="gm-head"><h3>How to play</h3><button class="gm-btn" type="button" data-help-close>Close</button></div>
      <div class="gm-help">
        <div>
          <b>Desktop</b>
          <ul>
            <li><span class="gm-kbd">Left</span> / <span class="gm-kbd">Right</span> rotate the aim arrow.</li>
            <li>Hold <span class="gm-kbd">Space</span> to charge, release to putt.</li>
            <li><span class="gm-kbd">H</span> help &middot; <span class="gm-kbd">C</span> cheats &middot; <span class="gm-kbd">P</span> pause &middot; <span class="gm-kbd">R</span> restart.</li>
          </ul>
          <b>Mobile</b>
          <ul>
            <li>Use the aim buttons and hold PUTT in the HUD to charge and release.</li>
          </ul>
        </div>
        <div>
          <b>Rules</b>
          <ul>
            <li>Six holes; water adds one penalty stroke and sand slows the ball.</li>
            <li>Each hole is capped at ${STROKE_CAP} strokes.</li>
            <li>Finish in ${PAR_TOTAL + 4} strokes or fewer with fewer than two caps to win.</li>
          </ul>
          <div class="gm-foot"><span class="gm-note">Press H to reopen this guide</span><button class="gm-btn acc" type="button" data-help-close>Got it</button></div>
        </div>
      </div>
    </div>
  </div>
</section>`;

            /* ---------------- refs ---------------- */
            const courseG = $('[data-el="course"]');
            const aimG = $('[data-el="aimG"]');
            const aimLine = $('[data-el="aimLine"]');
            const aimHead = $('[data-el="aimHead"]');
            const ballEl = $('[data-el="ball"]');
            const powerFill = $('[data-el="powerFill"]');
            const powerTxt = $('[data-el="powerTxt"]');
            const hudStatus = $('[data-hud="status"]');
            const hudHole = $('[data-hud="hole"]');
            const hudStrokes = $('[data-hud="strokes"]');
            const hudPar = $('[data-hud="par"]');
            const hudScore = $('[data-hud="score"]');
            const hudAim = $('[data-hud="aim"]');
            const ov = {
                select: $('[data-ov="select"]'),
                over: $('[data-ov="over"]'),
                pause: $('[data-ov="pause"]'),
                cheat: $('[data-ov="cheat"]'),
                help: $('[data-ov="help"]'),
            };
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');
            const cheatGrid = $('[data-cheatgrid]');
            const cheatActs = $('[data-cheatacts]');
            const pbtn = $('[data-pause]');
            const cbtn = $('[data-cheats]');
            const rotL = $('[data-act="rotL"]');
            const rotR = $('[data-act="rotR"]');
            const puttBtn = $('[data-act="putt"]');

            /* ---------------- state ---------------- */
            let active = false,
                started = false,
                over = false;
            let paused = false,
                cheatsOpen = false,
                helpOpen = false;
            const cheats = { noCap: false, noPenalty: false, maxPower: false };
            const CHEAT_LABELS = {
                noCap: "Ignore stroke cap",
                noPenalty: "No water penalty",
                maxPower: "Always full power",
            };
            const CHEAT_ACTS = [
                ["skip", "Skip to next hole"],
                ["sink", "Sink current ball"],
                ["reset", "Reset strokes"],
            ];
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

            let seenHelp = true;
            try { seenHelp = localStorage.getItem("golfMiniHelpSeen") === "1"; } catch (_) { seenHelp = true; }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("golfMiniHelpSeen", "1"); } catch (_) { /* storage blocked */ }
            }

            /* ---------------- rendering ---------------- */
            function totalTaken() {
                let t = 0;
                for (let i = 0; i < HOLES.length; i++) {
                    if (typeof totals[i] === "number") t += totals[i];
                }
                if (started && !over && typeof totals[holeIdx] !== "number") t += strokes;
                return t;
            }
            function renderCheats() {
                let h = "";
                for (const k of Object.keys(cheats)) {
                    const label = CHEAT_LABELS[k];
                    h += '<div class="gm-cheatrow"><span>' + label + '</span><button class="gm-switch" type="button" data-cheat="' + k + '" aria-pressed="' + (cheats[k] ? "true" : "false") + '" aria-label="' + label + '"></button></div>';
                }
                cheatGrid.innerHTML = h;
                let a = "";
                for (const act of CHEAT_ACTS) {
                    a += '<button class="gm-btn" type="button" data-cheatact="' + act[0] + '">' + act[1] + "</button>";
                }
                cheatActs.innerHTML = a;
            }
            function hud() {
                hudHole.textContent = String(Math.min(holeIdx + 1, HOLES.length));
                hudStrokes.textContent = String(strokes);
                hudPar.textContent = String(HOLES[Math.min(holeIdx, HOLES.length - 1)].par);
                hudScore.textContent = String(totalTaken());
                hudAim.textContent = String(Math.round(aimAngle)) + "°";
                ov.select.hidden = started || cheatsOpen || helpOpen;
                ov.over.hidden = !over || cheatsOpen || helpOpen || paused;
                ov.pause.hidden = !paused || cheatsOpen || helpOpen;
                ov.cheat.hidden = !cheatsOpen || helpOpen;
                ov.help.hidden = !helpOpen;
                const label = pbtn.querySelector(".gm-label");
                if (label) label.textContent = paused ? "Resume" : "Pause";
                pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
                pbtn.disabled = !started || over;
                cbtn.classList.toggle("on", Object.keys(cheats).some((k) => cheats[k]));
                renderCheats();
            }
            function banner(msg) {
                hudStatus.textContent = msg;
                hudStatus.setAttribute("title", msg);
            }
            function caption() {
                hudAim.textContent = String(Math.round(aimAngle)) + "°";
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
                if (mode !== "aim" || !st || st.holed || paused || cheatsOpen || helpOpen) {
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
                    st.holed ||
                    paused ||
                    cheatsOpen ||
                    helpOpen
                )
                    return;
                charging = true;
                phase = 0;
                power = 0;
            }
            function releaseCharge() {
                if (!charging) return;
                charging = false;
                if (mode === "aim" && started && !over && !paused) putt();
            }
            function putt() {
                if (mode !== "aim" || !st || st.holed) return;
                strokes++;
                shotStart = { x: st.x, y: st.y };
                const v = shotSpeed(cheats.maxPower ? 1 : power);
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
                if (!cheats.noPenalty) strokes++;
                banner(
                    cheats.noPenalty
                        ? "Splash! No penalty (cheat) - ball back at the last spot."
                        : "Splash! One stroke penalty - ball back at the last spot.",
                );
                st.x = shotStart.x;
                st.y = shotStart.y;
                st.vx = 0;
                st.vy = 0;
                renderBall();
                if (!cheats.noCap && strokes >= STROKE_CAP && !st.holed) return capOut();
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
                hud();
            }
            function onStopped() {
                if (!cheats.noCap && strokes >= STROKE_CAP) return capOut();
                mode = "aim";
                banner("Stroke " + strokes + " done. Line up the next one.");
                renderAim();
                hud();
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
                caption();
                hud();
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
                    (win ? "gm-win mgp-win" : "gm-lose mgp-lose");
                ovReason.innerHTML = reason;
                hud();
                banner(
                    win ? "Course complete - great round!" : "Course complete.",
                );
            }
            function startGame() {
                stopLoop();
                totals = [];
                cappedCount = 0;
                over = false;
                paused = false;
                started = true;
                loadHole(0);
                hud();
                ensureLoop();
            }

            /* ---------------- overlay toggles ---------------- */
            function frozen() { return helpOpen || cheatsOpen || paused; }
            function toggleHelp(on) {
                helpOpen = typeof on === "boolean" ? on : !helpOpen;
                if (helpOpen) cheatsOpen = false;
                if (helpOpen) {
                    charging = false;
                    rotDir = 0;
                    power = 0;
                    phase = 0;
                    renderPower();
                }
                hud();
                renderAim();
            }
            function toggleCheats(on) {
                cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
                if (cheatsOpen) {
                    helpOpen = false;
                    charging = false;
                    rotDir = 0;
                    power = 0;
                    phase = 0;
                    renderPower();
                }
                hud();
                renderAim();
            }
            function togglePause(on) {
                if (!started || over) return;
                paused = typeof on === "boolean" ? on : !paused;
                if (paused) {
                    charging = false;
                    rotDir = 0;
                    power = 0;
                    phase = 0;
                    renderPower();
                    renderAim();
                    stopLoop();
                } else {
                    ensureLoop();
                }
                hud();
            }
            function restart() {
                helpOpen = false;
                cheatsOpen = false;
                paused = false;
                startGame();
            }
            function cheatAction(key) {
                if (!started || over) return;
                if (key === "skip") {
                    paused = false;
                    helpOpen = false;
                    cheatsOpen = false;
                    nextHole();
                    ensureLoop();
                } else if (key === "sink") {
                    if (st && !st.holed) {
                        st.holed = true;
                        onCup();
                    }
                    paused = false;
                    ensureLoop();
                } else if (key === "reset") {
                    strokes = 0;
                    hud();
                }
                renderAim();
            }

            /* ---------------- main loop ---------------- */
            function loop(t) {
                if (!active) return;
                if (!lastT) lastT = t;
                const dt = Math.min(0.05, (t - lastT) / 1000);
                lastT = t;
                if (frozen()) {
                    rafId = requestAnimationFrame(loop);
                    return;
                }
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
                if (!rafId && !frozen()) rafId = requestAnimationFrame(loop);
            }

            /* ---------------- events ---------------- */
            const onKey = (e) => {
                if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
                const tag = e.target ? e.target.tagName : "";
                if (tag === "INPUT" || tag === "TEXTAREA") return;
                const c = e.code;
                if (c === "KeyH") { toggleHelp(); e.preventDefault(); return; }
                if (c === "KeyC") { if (!helpOpen && !paused) toggleCheats(); e.preventDefault(); return; }
                if (c === "KeyP" || c === "Escape") {
                    if (helpOpen) toggleHelp(false);
                    else if (cheatsOpen) toggleCheats(false);
                    else togglePause();
                    e.preventDefault();
                    return;
                }
                if (frozen()) { e.preventDefault(); return; }
                if (c === "KeyR") { restart(); e.preventDefault(); return; }
                if (c === "Enter") {
                    if (!started || over) startGame();
                    e.preventDefault();
                    return;
                }
                if (c === "ArrowLeft" || c === "ArrowRight") {
                    e.preventDefault();
                    if (mode === "aim" && started && !over) {
                        setAim(aimAngle + (c === "ArrowLeft" ? -2 : 2));
                    }
                    return;
                }
                if (c === "Space") {
                    e.preventDefault();
                    if (e.repeat) return;
                    if (!started || over) { startGame(); return; }
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
            const onDocUp = () => {
                if (!active) return;
                rotDir = 0;
                releaseCharge();
            };

            rotL.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (active && !helpOpen && !cheatsOpen && !paused && mode === "aim" && started && !over) rotDir = -1;
            });
            rotR.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (active && !helpOpen && !cheatsOpen && !paused && mode === "aim" && started && !over) rotDir = 1;
            });
            ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => {
                rotL.addEventListener(ev, () => { if (rotDir === -1) rotDir = 0; });
                rotR.addEventListener(ev, () => { if (rotDir === 1) rotDir = 0; });
            });
            puttBtn.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                if (!active || !started || over || mode !== "aim" || frozen()) return;
                startCharge();
            });

            app.addEventListener("pointerdown", (e) => {
                const btn = e.target.closest ? e.target.closest("button") : null;
                if (btn) e.preventDefault(); /* keep focus off buttons */
            });
            app.addEventListener("click", (e) => {
                if (!active) return;
                const t = e.target;
                if (!t || !t.closest) return;
                if (t.closest("[data-help]")) { toggleHelp(); return; }
                if (t.closest("[data-help-close]")) { toggleHelp(false); return; }
                if (t.closest("[data-exit]")) { onExit(); return; }
                if (t.closest("[data-cheats]")) { toggleCheats(); return; }
                if (t.closest("[data-close]")) { toggleCheats(false); return; }
                if (t.closest("[data-pause]")) { togglePause(); return; }
                if (t.closest("[data-resume]")) { togglePause(false); return; }
                if (t.closest("[data-restart]")) { restart(); return; }
                const sw = t.closest("[data-cheat]");
                if (sw) {
                    const k = sw.dataset.cheat;
                    if (Object.prototype.hasOwnProperty.call(cheats, k)) {
                        cheats[k] = !cheats[k];
                        hud();
                    }
                    return;
                }
                const ca = t.closest("[data-cheatact]");
                if (ca) { cheatAction(ca.dataset.cheatact); return; }
                const btn = t.closest("[data-act]");
                if (!btn) return;
                const a = btn.dataset.act;
                if (a === "start") startGame();
                else if (a === "rotL" && !frozen() && mode === "aim") setAim(aimAngle - 3);
                else if (a === "rotR" && !frozen() && mode === "aim") setAim(aimAngle + 3);
            });

            /* ---------------- open / close ---------------- */
            function open() {
                active = true;
                document.addEventListener("keydown", onKey);
                document.addEventListener("keyup", onKeyUp);
                document.addEventListener("pointerup", onDocUp);
                if (started && !over) ensureLoop();
            }
            function close() {
                active = false;
                charging = false;
                rotDir = 0;
                stopLoop();
                document.removeEventListener("keydown", onKey);
                document.removeEventListener("keyup", onKeyUp);
                document.removeEventListener("pointerup", onDocUp);
            }

            loadHole(0);
            renderPower();
            hud();
            return { open, close };
        },
    });
})();
