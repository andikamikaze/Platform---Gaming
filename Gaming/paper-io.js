/* ==== GAME: paper-io.js ==== */

/* =============================================================
PAPER.IO - claim territory by looping out and back. Cut
enemy trails to eliminate them, guard your own trail, and
hold the biggest share when the clock ends.
============================================================= */
(() => {
    "use strict";

    /* ---------- pure logic (exposed via _test) ---------- */
    const W = 34,
        H = 34,
        SPEED = 5,
        TIME_LIMIT = 120;
    const DX = [1, 0, -1, 0],
        DY = [0, 1, 0, -1]; /* R D L U */

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

    const idx = (x, y) => y * W + x;

    function newGame(seed) {
        const rnd = rng(seed);
        const grid = new Array(W * H).fill(-1);
        const spots = [
            [5, 28, 0],
            [28, 28, 1],
            [5, 5, 2],
            [28, 5, 3],
        ];
        const players = [];
        for (let i = 0; i < 4; i++) {
            const [cx, cy, id] = spots[i];
            for (let y = cy - 2; y <= cy + 2; y++) {
                for (let x = cx - 2; x <= cx + 2; x++) grid[idx(x, y)] = id;
            }
            players.push({
                id,
                x: cx + 0.5,
                y: cy + 0.5,
                cx,
                cy,
                dir: i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 0 : 1,
                alive: true,
                trail: [],
                trailSet: new Set(),
                plan: [],
                leg: 0,
                isBot: i > 0,
            });
        }
        return {
            grid,
            players,
            t: 0,
            over: false,
            seed,
            rnd,
            kills: [0, 0, 0, 0],
        };
    }

    function areaOf(g, i) {
        let n = 0;
        for (let k = 0; k < g.grid.length; k++) if (g.grid[k] === i) n++;
        return n;
    }

    function inBounds(x, y) {
        return x >= 0 && x < W && y >= 0 && y < H;
    }

    /* trail closure: trail cells become territory, plus any
 pocket enclosed by the new territory (flood from border) */
    function closeTrail(g, p) {
        for (const c of p.trail) g.grid[c] = p.id;
        p.trail = [];
        p.trailSet.clear();
        const mark = new Uint8Array(W * H);
        const q = [];
        for (let x = 0; x < W; x++) {
            for (const y of [0, H - 1]) {
                const c = idx(x, y);
                if (g.grid[c] !== p.id && !mark[c]) {
                    mark[c] = 1;
                    q.push(c);
                }
            }
        }
        for (let y = 0; y < H; y++) {
            for (const x of [0, W - 1]) {
                const c = idx(x, y);
                if (g.grid[c] !== p.id && !mark[c]) {
                    mark[c] = 1;
                    q.push(c);
                }
            }
        }
        while (q.length) {
            const c = q.pop();
            const x = c % W,
                y = (c / W) | 0;
            for (let d = 0; d < 4; d++) {
                const nx = x + DX[d],
                    ny = y + DY[d];
                if (!inBounds(nx, ny)) continue;
                const nc = idx(nx, ny);
                if (g.grid[nc] !== p.id && !mark[nc]) {
                    mark[nc] = 1;
                    q.push(nc);
                }
            }
        }
        let gained = 0;
        for (let c = 0; c < W * H; c++) {
            if (g.grid[c] !== p.id && !mark[c]) {
                g.grid[c] = p.id;
                gained++;
            }
        }
        return gained;
    }

    function kill(g, p, deaths) {
        for (let c = 0; c < g.grid.length; c++)
            if (g.grid[c] === p.id) g.grid[c] = -1;
        p.alive = false;
        p.trail = [];
        p.trailSet.clear();
        p.plan = [];
        deaths.push(p.id);
    }

    /* entering a fresh cell: die on walls and own trail, cut
 rivals, drop trail outside home, close loops back home */
    function processEnter(g, p, nx, ny, deaths) {
        if (!inBounds(nx, ny)) {
            kill(g, p, deaths);
            return;
        }
        const c = idx(nx, ny);
        if (p.trailSet.has(c)) {
            kill(g, p, deaths);
            return;
        }
        for (const q of g.players) {
            if (q !== p && q.alive && q.trailSet.has(c)) {
                kill(g, q, deaths);
                if (p.alive && p.id === 0) g.kills[0]++;
            }
        }
        if (!p.alive) return;
        if (g.grid[c] === p.id) {
            if (p.trail.length) closeTrail(g, p);
        } else {
            p.trail.push(c);
            p.trailSet.add(c);
        }
    }

    /* --- bot brains: plan an out-side-back loop, flee danger --- */
    function deadlyAhead(g, p, d) {
        const nx = p.cx + DX[d],
            ny = p.cy + DY[d];
        if (!inBounds(nx, ny)) return true;
        return p.trailSet.has(idx(nx, ny));
    }

    function makePlan(g, p) {
        let bestD = 0,
            bestS = -1;
        for (let d = 0; d < 4; d++) {
            let s = 0;
            for (let k = 1; k <= 7; k++) {
                const nx = p.cx + DX[d] * k,
                    ny = p.cy + DY[d] * k;
                if (!inBounds(nx, ny)) break;
                if (g.grid[idx(nx, ny)] !== p.id) s += 1;
            }
            s += g.rnd() * 0.9;
            if (s > bestS) {
                bestS = s;
                bestD = d;
            }
        }
        const d1 = bestD;
        const d2 = (d1 + (g.rnd() < 0.5 ? 1 : 3)) % 4;
        const L1 = 3 + Math.floor(g.rnd() * 4);
        const L2 = 3 + Math.floor(g.rnd() * 4);
        p.plan = [
            { dir: d1, len: L1 },
            { dir: d2, len: L2 },
            { dir: (d1 + 2) % 4, len: L1 + 2 },
            { dir: (d2 + 2) % 4, len: L2 + 2 },
        ];
        p.leg = 0;
    }

    function botDir(g, p) {
        const home = g.grid[idx(p.cx, p.cy)] === p.id;
        if (
            home &&
            !p.trail.length &&
            (!p.plan.length || p.leg >= p.plan.length)
        )
            makePlan(g, p);
        if (!p.plan.length || p.leg >= p.plan.length) {
            /* emergency: head for the nearest home cell */
            let tx = -1,
                ty = -1,
                bd = 1e9;
            for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) {
                    if (g.grid[idx(x, y)] === p.id) {
                        const dd = Math.abs(x - p.cx) + Math.abs(y - p.cy);
                        if (dd < bd) {
                            bd = dd;
                            tx = x;
                            ty = y;
                        }
                    }
                }
            if (tx >= 0) {
                const sx = Math.sign(tx - p.cx),
                    sy = Math.sign(ty - p.cy);
                const dx = sx > 0 ? 0 : sx < 0 ? 2 : -1;
                const dy = sy > 0 ? 1 : sy < 0 ? 3 : -1;
                const cand = [];
                if (Math.abs(tx - p.cx) >= Math.abs(ty - p.cy)) {
                    if (dx >= 0) cand.push(dx);
                    if (dy >= 0) cand.push(dy);
                } else {
                    if (dy >= 0) cand.push(dy);
                    if (dx >= 0) cand.push(dx);
                }
                for (const d of cand) if (!deadlyAhead(g, p, d)) return d;
            }
        } else {
            const leg = p.plan[p.leg];
            if (leg.len <= 0) {
                p.leg++;
                return botDir(g, p);
            }
            if (!deadlyAhead(g, p, leg.dir)) {
                leg.len--;
                return leg.dir;
            }
            p.plan = []; /* blocked - rethink */
        }
        /* fallback: any safe perpendicular */
        for (const d of [(p.dir + 1) % 4, (p.dir + 3) % 4, p.dir]) {
            if (!deadlyAhead(g, p, d)) return d;
        }
        return p.dir;
    }

    /* advance the world by dt; want[0] is the player's desired
 dir (or -1). returns this step's events */
    function stepGame(g, dt, want) {
        const deaths = [];
        if (g.over) return { deaths, over: g.over };
        g.t += dt;
        /* choose directions once per step */
        for (const p of g.players) {
            if (!p.alive) continue;
            let wd = want && want[p.id] != null ? want[p.id] : -1;
            if (p.isBot) wd = botDir(g, p);
            if (wd >= 0 && wd !== p.dir && (wd + 2) % 4 !== p.dir) p.dir = wd;
        }
        /* sub-step so no cell boundary is ever skipped */
        let rem = dt;
        while (rem > 1e-9 && !g.over) {
            const sub = Math.min(rem, 0.18);
            rem -= sub;
            for (const p of g.players) {
                if (!p.alive) continue;
                p.x += DX[p.dir] * SPEED * sub;
                p.y += DY[p.dir] * SPEED * sub;
                const nx = Math.floor(p.x),
                    ny = Math.floor(p.y);
                if (nx !== p.cx || ny !== p.cy) {
                    p.cx = nx;
                    p.cy = ny;
                    processEnter(g, p, nx, ny, deaths);
                }
            }
        }
        if (g.t >= TIME_LIMIT) g.over = true;
        return { deaths, over: g.over };
    }

    /* ---------- inline icons (classic MGP script, no ESM import) ---------- */
    const ICON_PATHS = {
        helpCircle: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
        wrench: ["M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z", "M6 16l-3 3", "M14.5 4.5 19 9"],
        pause: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
        refresh: ["M21 2v6h-6", "M3 12a9 9 0 0 1 15-6.7L21 8", "M3 22v-6h6", "M21 12a9 9 0 0 1-15 6.7L3 16"],
        logOut: ["m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"],
    };
    function iconSVG(name, size) {
        const paths = ICON_PATHS[name] || ICON_PATHS.helpCircle;
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + "</svg>";
    }

    /* ---------- registration ---------- */
    MGP_REGISTER({
        id: "paper-io",
        name: "Paper Io",
        category: "arcade",
        catLabel: "Arcade",
        desc: "Loop out and back to claim land and cut every rival trail.",
        art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="40" height="40" rx="5" fill="#0f172a"/><rect x="6" y="26" width="16" height="16" rx="2" fill="#38bdf8" stroke="none" opacity=".9"/><path d="M22 34h12V14H18" stroke="#7dd3fc" stroke-width="4" fill="none"/><rect x="8" y="10" width="10" height="10" rx="2" fill="#f87171" stroke="none"/><circle cx="14" cy="32" r="3.5" fill="#fff" stroke="#0369a1"/></svg>',
        bg: ["#0c4a6e", "#082f49"],
        _test: {
            W,
            H,
            SPEED,
            TIME_LIMIT,
            DX,
            DY,
            rng,
            idx,
            newGame,
            areaOf,
            closeTrail,
            kill,
            processEnter,
            stepGame,
            inBounds,
        },
        build(app, context) {
            /* ---------- shell ---------- */
            const ctx = context || {};
            const onExit = typeof ctx.onExit === "function" ? ctx.onExit : function () {
                const b = typeof document !== "undefined" && document.getElementById
                    ? document.getElementById("closeGameButton") : null;
                if (b && typeof b.click === "function") b.click();
            };
            app.className = "mgp-app game-app pi game-fill";
            app.innerHTML = `
<style>
#paper-io-app [hidden]{display:none!important}
#paper-io-app.pi{--panel:#111c33;--court:#0b1220;--line:#334155;--ink:#e2e8f0;--mut:#94a3b8;--acc:#38bdf8;--danger:#f87171;
  display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:0;color:var(--ink);font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#paper-io-app.pi *{box-sizing:border-box}
#paper-io-app .pi-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#paper-io-app .pi-info{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1 1 auto;min-width:0}
#paper-io-app .pi-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);white-space:nowrap}
#paper-io-app .pi-chip b{color:var(--ink);font-variant-numeric:tabular-nums}
#paper-io-app .pi-ranks{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
#paper-io-app .pi-rank{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:var(--mut);background:var(--panel);padding:3px 8px;border-radius:99px;border:1px solid var(--line)}
#paper-io-app .pi-rank.dead{opacity:.4;text-decoration:line-through}
#paper-io-app .pi-dot{width:9px;height:9px;border-radius:3px;display:inline-block;flex:none}
#paper-io-app .pi-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
#paper-io-app .pi-spacer{flex:1 1 auto}
#paper-io-app .pi-btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:9px;min-height:36px;padding:0 11px;font:inherit;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
#paper-io-app .pi-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
#paper-io-app .pi-btn:disabled{opacity:.4;cursor:default}
#paper-io-app .pi-btn.primary{background:var(--acc);border-color:var(--acc);color:#082f49}
#paper-io-app .pi-btn.on{border-color:var(--acc);color:var(--acc)}
#paper-io-app .pi-icon-btn{display:inline-flex;align-items:center;gap:6px}
#paper-io-app .pi-icon-btn svg{flex:none;display:block}
#paper-io-app .pi-board{position:relative;width:100%;flex:1 1 auto;min-height:0;aspect-ratio:1/1;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--court);overflow:hidden}
#paper-io-app .pi-svg{display:block;width:100%;height:100%;touch-action:none;user-select:none}
#paper-io-app .pi-pad{display:none;justify-content:center;gap:8px;user-select:none}
#paper-io-app.touch .pi-pad{display:flex}
#paper-io-app .pi-dpad{display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,46px);gap:6px}
#paper-io-app .pi-dpad [data-dir="3"]{grid-area:1/2}
#paper-io-app .pi-dpad [data-dir="2"]{grid-area:2/1}
#paper-io-app .pi-dpad [data-dir="1"]{grid-area:2/2}
#paper-io-app .pi-dpad [data-dir="0"]{grid-area:2/3}
#paper-io-app .pi-dpad .pi-btn{font-size:16px;padding:0}
#paper-io-app .pi-ov{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(11,18,32,.78)}
#paper-io-app .pi-card{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;text-align:center}
#paper-io-app .pi-card h2,#paper-io-app .pi-card h3{margin:0;font-size:17px}
#paper-io-app .pi-win{color:#34d399}
#paper-io-app .pi-lose{color:var(--danger)}
#paper-io-app .pi-sub{font-size:12px;line-height:1.55;color:var(--mut);margin:0}
#paper-io-app .pi-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#paper-io-app .pi-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;text-align:left}
#paper-io-app .pi-cheats,#paper-io-app .pi-help{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto}
#paper-io-app .pi-cheats{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
#paper-io-app .pi-help{grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;text-align:left}
#paper-io-app .pi-help b{display:block;margin-bottom:5px;color:var(--mut);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
#paper-io-app .pi-help ul{margin:0 0 10px;padding-left:16px;color:var(--mut);font-size:12px;line-height:1.6}
#paper-io-app .pi-kbd{display:inline-block;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;background:var(--court);color:var(--ink);font:inherit}
#paper-io-app .pi-note{color:var(--mut);font-size:11px;line-height:1.5}
#paper-io-app .pi-sep{margin:2px 0;font:700 9px/1 ui-monospace,monospace;letter-spacing:.12em;color:var(--mut);text-transform:uppercase}
#paper-io-app .pi-cheatrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--court);font-size:11px;text-align:left}
#paper-io-app .pi-switch{position:relative;width:40px;height:22px;border-radius:999px;border:1px solid var(--line);background:var(--court);cursor:pointer;flex:none;padding:0}
#paper-io-app .pi-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mut)}
#paper-io-app .pi-switch[aria-pressed="true"]{border-color:var(--acc);background:rgba(56,189,248,.15)}
#paper-io-app .pi-switch[aria-pressed="true"]:after{left:20px;background:var(--acc)}
#paper-io-app :focus-visible,#paper-io-app button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (prefers-reduced-motion:reduce){#paper-io-app *{animation:none!important;transition:none!important}}

/* --- Batch 02 design polish --- */
#paper-io-app .pi-dpad .pi-btn{min-height:44px;border-radius:10px}
@media (pointer:coarse){#paper-io-app button:not(:disabled){min-height:44px}}

/* --- layout redesign overrides (keep last) --- */
#paper-io-app.pi.game-fill > .pi-board{flex:1 1 auto;min-height:0;aspect-ratio:auto}
@media (max-width:640px){
#paper-io-app.pi.game-fill > .pi-board:not(:has(.pi-ov:not([hidden]))){aspect-ratio:1/1;flex:0 0 auto}
#paper-io-app.pi.game-fill > .pi-board:has(.pi-ov:not([hidden])){flex:0 0 auto;min-height:min(70dvh,620px);aspect-ratio:auto}
#paper-io-app .pi-hud{gap:5px;flex-direction:column;align-items:stretch}
#paper-io-app .pi-info{gap:5px}
#paper-io-app .pi-ranks{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
#paper-io-app .pi-rank-name{display:none}
#paper-io-app .pi-chip[data-hud="kills"]{display:none}
#paper-io-app .pi-tools{gap:5px;flex-wrap:nowrap;justify-content:space-between}
#paper-io-app .pi-chip{padding:4px 6px;min-height:0;font-size:9px}
#paper-io-app .pi-btn{padding:5px 8px;font-size:9px}
#paper-io-app .pi-icon-btn .pi-btn-label{display:none}
#paper-io-app .pi-ov{padding:8px}
#paper-io-app .pi-card{width:100%;height:100%;max-height:100%;padding:12px;border-radius:12px}
#paper-io-app .pi-cheats,#paper-io-app .pi-help{scrollbar-width:none}
#paper-io-app .pi-cheats::-webkit-scrollbar,#paper-io-app .pi-help::-webkit-scrollbar{display:none}
#paper-io-app .pi-foot{position:static;margin:0;padding:10px 0 0;border-top:1px solid var(--line)}
#paper-io-app .pi-note{display:none}
}
@media (pointer:coarse){#paper-io-app .pi-hud .pi-btn{min-height:32px}}
</style>
<div class="game-app pi game-fill" data-pi>
  <div class="pi-hud">
    <div class="pi-info">
      <span class="pi-chip">TIME <b data-hud="time">2:00</b></span>
      <span class="pi-chip">LAND <b data-hud="area">2%</b></span>
      <span class="pi-chip">KILLS <b data-hud="kills">0</b></span>
      <div class="pi-ranks" data-g="ranks"></div>
      <span class="pi-spacer"></span>
    </div>
    <div class="pi-tools">
      <button class="pi-btn pi-icon-btn" type="button" data-help aria-label="How to play" title="How to play (H)">${iconSVG("helpCircle", 14)}<span class="pi-btn-label">Help</span></button>
      <button class="pi-btn pi-icon-btn" type="button" data-cheats aria-label="Cheats" title="Cheats (C)">${iconSVG("wrench", 14)}<span class="pi-btn-label">Cheats</span></button>
      <button class="pi-btn pi-icon-btn" type="button" data-pause aria-label="Pause" title="Pause (P)">${iconSVG("pause", 14)}<span class="pi-btn-label">Pause</span></button>
      <button class="pi-btn pi-icon-btn" type="button" data-restart aria-label="Restart" title="Restart (R)">${iconSVG("refresh", 14)}<span class="pi-btn-label">Restart</span></button>
      <button class="pi-btn pi-icon-btn" type="button" data-exit aria-label="Exit game" title="Exit game">${iconSVG("logOut", 14)}<span class="pi-btn-label">Exit</span></button>
    </div>
  </div>
  <section class="game-panel pi-board" data-board>
    <svg class="pi-svg" viewBox="-2 -2 38 38" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Paper io arena">
      <g data-g="cells"></g>
      <g data-g="heads"></g>
    </svg>
    <div class="pi-ov" data-ov="select">
      <div class="pi-card">
        <div class="pi-head"><h3>Paper Io</h3><button class="pi-btn" type="button" data-help>How to play</button></div>
        <p class="pi-sub">Steer your dot out of your zone, trace a loop and return home to claim everything inside. Rivals die when you cross their trail - and you die if anyone crosses yours. Walls are deadly. Biggest land share in 2 minutes wins.</p>
        <div class="pi-foot"><span class="pi-note">Arrow keys / WASD or the pad</span><button class="pi-btn primary" type="button" data-act="start">Start game</button></div>
      </div>
    </div>
    <div class="pi-ov" data-ov="over" hidden>
      <div class="pi-card">
        <div class="pi-head"><h3 data-ov="title">Game over</h3><span class="pi-chip" data-ov="score">Land 0%</span></div>
        <p class="pi-sub" data-ov="reason"></p>
        <div class="pi-foot"><span class="pi-note">Press R to restart</span><button class="pi-btn primary" type="button" data-act="again">Play again</button></div>
      </div>
    </div>
    <div class="pi-ov" data-ov="pause" hidden>
      <div class="pi-card">
        <div class="pi-head"><h3>Paused</h3></div>
        <p class="pi-sub">The clock, the rivals and the trails are frozen.</p>
        <div class="pi-foot"><span class="pi-note">Press P or Esc to resume</span><button class="pi-btn primary" type="button" data-resume>Resume</button></div>
      </div>
    </div>
    <div class="pi-ov" data-ov="cheat" hidden>
      <div class="pi-card">
        <div class="pi-head"><h3>Cheats</h3><button class="pi-btn" type="button" data-close>Close</button></div>
        <div class="pi-cheats" data-cheatgrid></div>
        <div class="pi-sep">Quick actions</div>
        <div class="pi-cheats" data-cheatacts></div>
      </div>
    </div>
    <div class="pi-ov" data-ov="help" hidden>
      <div class="pi-card">
        <div class="pi-head"><h3>How to play</h3><button class="pi-btn" type="button" data-help-close>Close</button></div>
        <div class="pi-help">
          <div>
            <b>Desktop</b>
            <ul>
              <li><span class="pi-kbd">&larr; &uarr; &darr; &rarr;</span> / <span class="pi-kbd">W A S D</span> &mdash; steer</li>
              <li><span class="pi-kbd">H</span> help &middot; <span class="pi-kbd">C</span> cheats &middot; <span class="pi-kbd">P</span> pause &middot; <span class="pi-kbd">R</span> restart</li>
            </ul>
            <b>Mobile</b>
            <ul><li>Use the D-pad below the arena to steer.</li></ul>
          </div>
          <div>
            <b>Rules</b>
            <ul>
              <li>Leave your zone to draw a trail, then return home to claim the loop.</li>
              <li>Cross a rival's trail to eliminate them; never touch your own trail or a wall.</li>
              <li>Biggest land share when the 2-minute clock ends wins.</li>
            </ul>
            <div class="pi-foot"><span class="pi-note">Press H to reopen this guide</span><button class="pi-btn primary" type="button" data-help-close>Got it</button></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="pi-pad">
    <div class="pi-dpad">
      <button class="pi-btn" type="button" data-dir="3" aria-label="up">^</button>
      <button class="pi-btn" type="button" data-dir="2" aria-label="left">&lt;</button>
      <button class="pi-btn" type="button" data-dir="1" aria-label="down">v</button>
      <button class="pi-btn" type="button" data-dir="0" aria-label="right">&gt;</button>
    </div>
  </div>
</div>`;

            const $ = (s, r) => (r || app).querySelector(s);
            const appEl = $("[data-pi]");
            const cellsG = $('[data-g="cells"]');
            const headsG = $('[data-g="heads"]');
            const ranksG = $('[data-g="ranks"]');
            const ov = {
                select: $('[data-ov="select"]'),
                over: $('[data-ov="over"]'),
                pause: $('[data-ov="pause"]'),
                cheat: $('[data-ov="cheat"]'),
                help: $('[data-ov="help"]'),
            };
            const ovTitle = $('[data-ov="title"]');
            const ovScore = $('[data-ov="score"]');
            const ovReason = $('[data-ov="reason"]');
            const cheatGrid = $('[data-cheatgrid]');
            const cheatActs = $('[data-cheatacts]');
            const pbtn = $('[data-pause]');
            const cbtn = $('[data-cheats]');
            const hbtn = $('[data-help]');
            const hud = {
                time: $('[data-hud="time"]'),
                area: $('[data-hud="area"]'),
                kills: $('[data-hud="kills"]'),
            };

            /* ---------- state ---------- */
            const COLORS = ["#38bdf8", "#f87171", "#fbbf24", "#a78bfa"];
            const TRAILS = ["#7dd3fc", "#fca5a5", "#fde68a", "#c4b5fd"];
            const NAMES = ["You", "Rex", "Ivy", "Zed"];
            let active = false,
                running = false,
                over = false;
            let g = null,
                wantDir = -1;
            let helpOpen = false,
                cheatsOpen = false,
                paused = false;
            let overDelay = 0;
            let cellEls = [],
                visCache = [];
            let raf = null,
                lastT = 0;
            const cheats = { slow: false, dodge: false };
            const CHEAT_LABELS = { slow: "Slow motion", dodge: "Auto-dodge walls" };
            const CHEAT_ACTS = [
                ["time", "+30 seconds"],
                ["land", "Claim 10% land"],
                ["clear", "Eliminate rivals"],
            ];

            let seenHelp = true;
            try { seenHelp = localStorage.getItem("paperIoHelpSeen") === "1"; } catch (_) { seenHelp = true; }
            if (!seenHelp) {
                helpOpen = true;
                try { localStorage.setItem("paperIoHelpSeen", "1"); } catch (_) { /* storage blocked */ }
            }
            let touch = false;
            try { touch = !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches); } catch (_) { touch = false; }
            if (touch) appEl.classList.add("touch");

            /* ---------- rendering ---------- */
            function buildCells() {
                let s = "";
                for (let y = 0; y < H; y++)
                    for (let x = 0; x < W; x++) {
                        s +=
                            '<rect x="' +
                            x +
                            '" y="' +
                            y +
                            '" width="1" height="1" fill="#111a2e"/>';
                    }
                cellsG.innerHTML = s;
                cellEls = Array.prototype.slice.call(cellsG.children);
                visCache = new Array(W * H).fill("#111a2e");
            }

            function cellFill(k) {
                for (const p of g.players) {
                    if (p.alive && p.trailSet.has(k)) return TRAILS[p.id];
                }
                const o = g.grid[k];
                return o >= 0 ? COLORS[o] : "#111a2e";
            }

            function renderCells() {
                for (let k = 0; k < W * H; k++) {
                    const f = cellFill(k);
                    if (f !== visCache[k]) {
                        cellEls[k].setAttribute("fill", f);
                        visCache[k] = f;
                    }
                }
            }

            function renderHeads() {
                let s = "";
                for (const p of g.players) {
                    if (!p.alive) continue;
                    s +=
                        '<rect x="' +
                        (p.x - 0.42).toFixed(2) +
                        '" y="' +
                        (p.y - 0.42).toFixed(2) +
                        '" width="0.84" height="0.84" rx="0.28" fill="' +
                        COLORS[p.id] +
                        '" stroke="' +
                        (p.id === 0 ? "#fff" : "#0b1220") +
                        '" stroke-width="0.14"/>' +
                        '<text x="' +
                        p.x.toFixed(2) +
                        '" y="' +
                        (p.y - 0.75).toFixed(2) +
                        '" font-size="1.1" text-anchor="middle" fill="' +
                        (p.id === 0 ? "#e0f2fe" : "#94a3b8") +
                        '">' +
                        NAMES[p.id][0] +
                        "</text>";
                }
                headsG.innerHTML = s;
            }

            function renderRanks() {
                if (!g) {
                    ranksG.innerHTML = '<span class="pi-rank">Ranks &mdash;</span>';
                    return;
                }
                const total = W * H;
                let s = "";
                for (const p of g.players) {
                    const pct = ((areaOf(g, p.id) / total) * 100).toFixed(1);
                    s +=
                        '<span class="pi-rank' +
                        (p.alive ? "" : " dead") +
                        '"><i class="pi-dot" style="background:' +
                        COLORS[p.id] +
                        '"></i><span class="pi-rank-name">' +
                        NAMES[p.id] +
                        " </span>" +
                        pct +
                        "%</span>";
                }
                ranksG.innerHTML = s;
            }

            function renderCheats() {
                let h = "";
                for (const k of Object.keys(cheats)) {
                    h += '<div class="pi-cheatrow"><span>' + CHEAT_LABELS[k] + '</span><button class="pi-switch" type="button" data-cheat="' + k + '" aria-pressed="' + (cheats[k] ? "true" : "false") + '" aria-label="' + CHEAT_LABELS[k] + '"></button></div>';
                }
                cheatGrid.innerHTML = h;
                let a = "";
                for (const act of CHEAT_ACTS) {
                    a += '<button class="pi-btn" type="button" data-cheatact="' + act[0] + '">' + act[1] + "</button>";
                }
                cheatActs.innerHTML = a;
            }

            function syncUI() {
                if (g) {
                    const left = Math.max(0, TIME_LIMIT - g.t);
                    const m = Math.floor(left / 60),
                        s = Math.floor(left % 60);
                    hud.time.textContent = m + ":" + (s < 10 ? "0" : "") + s;
                    hud.area.textContent =
                        ((areaOf(g, 0) / (W * H)) * 100).toFixed(1) + "%";
                    hud.kills.textContent = g.kills[0];
                    renderRanks();
                } else {
                    hud.time.textContent = "2:00";
                    hud.area.textContent = "0%";
                    hud.kills.textContent = "0";
                    renderRanks();
                }
                ov.select.hidden = !!g || helpOpen || cheatsOpen || paused;
                ov.over.hidden = !over || overDelay > 0 || helpOpen || cheatsOpen || paused;
                ov.pause.hidden = !paused || helpOpen || cheatsOpen;
                ov.cheat.hidden = !cheatsOpen || helpOpen;
                ov.help.hidden = !helpOpen;
                const label = pbtn.querySelector(".pi-btn-label");
                if (label) label.textContent = paused ? "Resume" : "Pause";
                pbtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
                pbtn.disabled = !g || over;
                hbtn.classList.toggle("on", helpOpen);
                cbtn.classList.toggle("on", cheatsOpen || Object.keys(cheats).some((k) => cheats[k]));
                cheatGrid.querySelectorAll("[data-cheat]").forEach((sw) => {
                    sw.setAttribute("aria-pressed", String(cheats[sw.dataset.cheat]));
                });
                cheatActs.querySelectorAll("[data-cheatact]").forEach((b) => {
                    b.disabled = !g || over;
                });
            }

            /* ---------- flow ---------- */
            function start() {
                g = newGame((Math.random() * 1e9) | 0);
                wantDir = -1;
                running = true;
                over = false;
                overDelay = 0;
                helpOpen = false;
                cheatsOpen = false;
                paused = false;
                lastT = 0;
                buildCells();
                renderCells();
                renderHeads();
                syncUI();
            }

            function finish(title, win, reason) {
                running = false;
                over = true;
                overDelay = 0.6;
                ovTitle.textContent = title;
                ovTitle.className = win ? "pi-win" : "pi-lose";
                ovReason.textContent = reason;
                ovScore.textContent = "Land " +
                    ((areaOf(g, 0) / (W * H)) * 100).toFixed(1) + "%";
                syncUI();
            }

            function checkEnd(deaths) {
                if (!running) return;
                if (deaths.indexOf(0) >= 0) {
                    finish(
                        "Eliminated",
                        false,
                        "Your trail was cut or you hit a wall. Land held: " +
                        ((areaOf(g, 0) / (W * H)) * 100).toFixed(1) +
                        "%.",
                    );
                    return;
                }
                if (g.players.slice(1).every((p) => !p.alive)) {
                    finish(
                        "Arena cleared",
                        true,
                        "All three rivals eliminated. Your land: " +
                        ((areaOf(g, 0) / (W * H)) * 100).toFixed(1) +
                        "%.",
                    );
                    return;
                }
                if (g.over) {
                    const areas = g.players.map((p) => areaOf(g, p.id));
                    const best = Math.max(...areas);
                    if (areas[0] === best)
                        finish(
                            "Time up - you win",
                            true,
                            "Final share " +
                            ((areas[0] / (W * H)) * 100).toFixed(1) +
                            "% - the largest in the arena.",
                        );
                    else
                        finish(
                            "Time up - you lose",
                            false,
                            "Your share " +
                            ((areas[0] / (W * H)) * 100).toFixed(1) +
                            "% - " +
                            NAMES[areas.indexOf(best)] +
                            " holds the most land.",
                        );
                }
            }

            /* ---------- overlay toggles ---------- */
            function frozen() { return helpOpen || cheatsOpen || paused; }
            function toggleHelp(on) {
                helpOpen = typeof on === "boolean" ? on : !helpOpen;
                if (helpOpen) cheatsOpen = false;
                if (!frozen()) lastT = 0;
                syncUI();
            }
            function toggleCheats(on) {
                cheatsOpen = typeof on === "boolean" ? on : !cheatsOpen;
                if (cheatsOpen) helpOpen = false;
                if (!frozen()) lastT = 0;
                syncUI();
            }
            function togglePause(on) {
                if (!g || over) return;
                paused = typeof on === "boolean" ? on : !paused;
                if (paused) cheatsOpen = false;
                if (!frozen()) lastT = 0;
                syncUI();
            }
            function cheatAction(key) {
                if (!g || over) return;
                if (key === "time") {
                    g.t = Math.max(0, g.t - 30);
                } else if (key === "land") {
                    let have = areaOf(g, 0);
                    const goal = Math.min(W * H, have + Math.floor((W * H) / 10));
                    for (let c = 0; c < W * H && have < goal; c++) {
                        if (g.grid[c] !== 0) { g.grid[c] = 0; have++; }
                    }
                } else if (key === "clear") {
                    const deaths = [];
                    for (const p of g.players) {
                        if (p.id !== 0 && p.alive) kill(g, p, deaths);
                    }
                    renderHeads();
                    checkEnd(deaths);
                }
                syncUI();
            }

            /* keep the player's next cell safe when the auto-dodge cheat is on */
            function effectiveWant() {
                if (!g || !cheats.dodge) return wantDir;
                const p = g.players[0];
                if (!p || !p.alive) return wantDir;
                const d = wantDir >= 0 ? wantDir : p.dir;
                const deadly = (dir) => {
                    const nx = p.cx + DX[dir],
                        ny = p.cy + DY[dir];
                    return !inBounds(nx, ny) || p.trailSet.has(idx(nx, ny));
                };
                if (!deadly(d)) return d;
                const cand = [(p.dir + 1) % 4, (p.dir + 3) % 4, p.dir];
                for (const dir of cand) {
                    if ((dir + 2) % 4 !== p.dir && !deadly(dir)) return dir;
                }
                return p.dir;
            }

            /* ---------- frame ---------- */
            function frame(t) {
                raf = requestAnimationFrame(frame);
                if (!lastT) lastT = t;
                const dt = Math.min(0.05, (t - lastT) / 1000);
                lastT = t;
                if (!active || !g) return;
                if (frozen()) return; /* clock, bots and trails are frozen */
                if (over) {
                    if (overDelay > 0) {
                        overDelay -= dt;
                        if (overDelay <= 0) { overDelay = 0; syncUI(); }
                    }
                    return;
                }
                if (!running) return;
                const res = stepGame(g, dt * (cheats.slow ? 0.55 : 1), [effectiveWant(), -1, -1, -1]);
                renderCells();
                renderHeads();
                syncUI();
                checkEnd(res.deaths);
            }

            /* ---------- input ---------- */
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
                if (c === "KeyR") { start(); e.preventDefault(); return; }
                if (c === "Enter") {
                    if (!g || over) start();
                    e.preventDefault();
                    return;
                }
                const map = {
                    ArrowRight: 0,
                    KeyD: 0,
                    ArrowDown: 1,
                    KeyS: 1,
                    ArrowLeft: 2,
                    KeyA: 2,
                    ArrowUp: 3,
                    KeyW: 3,
                };
                if (map[c] != null) {
                    e.preventDefault();
                    wantDir = map[c];
                }
            };
            app.addEventListener("pointerdown", (e) => {
                const b = e.target.closest && e.target.closest("[data-dir]");
                if (b && active && !frozen()) {
                    e.preventDefault();
                    wantDir = +b.dataset.dir;
                }
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
                if (t.closest("[data-restart]")) { start(); return; }
                const sw = t.closest("[data-cheat]");
                if (sw) {
                    const k = sw.dataset.cheat;
                    if (Object.prototype.hasOwnProperty.call(cheats, k)) {
                        cheats[k] = !cheats[k];
                        syncUI();
                    }
                    return;
                }
                const ca = t.closest("[data-cheatact]");
                if (ca) { cheatAction(ca.dataset.cheatact); return; }
                const b = t.closest("[data-act]");
                if (b && (b.dataset.act === "start" || b.dataset.act === "restart" || b.dataset.act === "again")) start();
            });

            /* ---------- init ---------- */
            buildCells();
            renderCheats();
            syncUI();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                    lastT = 0;
                    document.addEventListener("keydown", onKey);
                    if (!raf) raf = requestAnimationFrame(frame);
                    syncUI();
                },
                close() {
                    active = false;
                    if (raf) {
                        cancelAnimationFrame(raf);
                        raf = null;
                    }
                    document.removeEventListener("keydown", onKey);
                    g = null;
                    running = false;
                    over = false;
                    wantDir = -1;
                    helpOpen = false;
                    cheatsOpen = false;
                    paused = false;
                    overDelay = 0;
                    lastT = 0;
                    syncUI();
                },
            };
        },
    });
})();
