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

    /* ---------- registration ---------- */
    MGP_REGISTER({
        id: "paper-io",
        name: "Paper.io",
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
        build(app) {
            /* ---------- shell ---------- */
            app.innerHTML = `
<style>
#paper-io-app .pi-wrap{width:min(94%,520px)}
#paper-io-app .pi-board{display:block;width:100%;background:#0b1220;border-radius:12px;border:2px solid #334155;touch-action:none}
#paper-io-app .pi-ranks{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:6px 0}
#paper-io-app .pi-rank{display:flex;align-items:center;gap:5px;font-size:12px;color:#cbd5e1;background:#1e293b;padding:3px 9px;border-radius:99px}
#paper-io-app .pi-dot{width:10px;height:10px;border-radius:3px;display:inline-block}
#paper-io-app .pi-rank.dead{opacity:.4;text-decoration:line-through}
#paper-io-app .pi-dpad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(2,40px);gap:5px;justify-content:center;margin-top:8px}
#paper-io-app .pi-dpad button{border:1px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:9px;font-size:16px;cursor:pointer;font-weight:700}
#paper-io-app .pi-dpad button:active{background:#334155}
</style>
<div class="mgp-bar">
  <span class="mgp-title">Paper.io</span>
  <span class="mgp-chip">Time <b data-hud="time">2:00</b></span>
  <span class="mgp-chip">Land <b data-hud="area">2%</b></span>
  <span class="mgp-chip">Kills <b data-hud="kills">0</b></span>
  <span class="mgp-spacer"></span>
  <button class="mgp-btn ghost" data-act="restart">Restart</button>
</div>
<div class="mgp-stage">
  <div class="pi-wrap">
    <div class="pi-ranks" data-g="ranks"></div>
    <svg class="pi-board" viewBox="-2 -2 38 38" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Paper io arena">
      <g data-g="cells"></g>
      <g data-g="heads"></g>
    </svg>
    <div class="pi-dpad">
      <span></span><button data-dir="3" aria-label="up">^</button><span></span>
      <button data-dir="2" aria-label="left">&lt;</button><button data-dir="1" aria-label="down">v</button><button data-dir="0" aria-label="right">&gt;</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="start">
    <div class="mgp-card">
      <h2 class="mgp-ov-title">Paper.io</h2>
      <p class="mgp-ov-sub">Steer your dot out of your zone, trace a loop and return home to claim everything inside. Rivals die when you cross their trail - and you die if anyone crosses yours. Walls are deadly. Biggest land share in 2 minutes wins.</p>
      <button class="mgp-btn" data-act="start">Start game</button>
    </div>
  </div>
  <div class="mgp-overlay" data-ov="over" hidden>
    <div class="mgp-card">
      <h2 class="mgp-ov-title" data-ov="title">Game over</h2>
      <p class="mgp-ov-sub" data-ov="reason"></p>
      <button class="mgp-btn" data-act="again">Play again</button>
    </div>
  </div>
</div>
<div class="mgp-foot"><span class="mgp-hint">Arrow keys / WASD to steer, or use the pad below. Never touch a wall or your own trail.</span></div>`;

            const $ = (s, r) => (r || app).querySelector(s);
            const svgEl = $(".pi-board");
            const cellsG = $('[data-g="cells"]');
            const headsG = $('[data-g="heads"]');
            const ranksG = $('[data-g="ranks"]');
            const ovStart = $('[data-ov="start"]');
            const ovOver = $('[data-ov="over"]');
            const ovTitle = $('[data-ov="title"]');
            const ovReason = $('[data-ov="reason"]');
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
                running = false;
            let g = null,
                wantDir = -1;
            let cellEls = [],
                visCache = [];
            let raf = null,
                lastT = 0;

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
                const total = W * H;
                let s = "";
                for (const p of g.players) {
                    const pct = ((areaOf(g, p.id) / total) * 100).toFixed(1);
                    s +=
                        '<span class="pi-rank' +
                        (p.alive ? "" : " dead") +
                        '"><i class="pi-dot" style="background:' +
                        COLORS[p.id] +
                        '"></i>' +
                        NAMES[p.id] +
                        " " +
                        pct +
                        "%</span>";
                }
                ranksG.innerHTML = s;
            }

            function updateHud() {
                const left = Math.max(0, TIME_LIMIT - g.t);
                const m = Math.floor(left / 60),
                    s = Math.floor(left % 60);
                hud.time.textContent = m + ":" + (s < 10 ? "0" : "") + s;
                hud.area.textContent =
                    ((areaOf(g, 0) / (W * H)) * 100).toFixed(1) + "%";
                hud.kills.textContent = g.kills[0];
            }

            /* ---------- flow ---------- */
            function start() {
                g = newGame((Math.random() * 1e9) | 0);
                wantDir = -1;
                running = true;
                ovStart.hidden = true;
                ovOver.hidden = true;
                buildCells();
                renderCells();
                renderHeads();
                renderRanks();
                updateHud();
            }

            function finish(title, win, reason) {
                running = false;
                ovTitle.textContent = title;
                ovTitle.className =
                    "mgp-ov-title " + (win ? "mgp-win" : "mgp-lose");
                ovReason.textContent = reason;
                setTimeout(() => {
                    if (!running) ovOver.hidden = false;
                }, 600);
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

            /* ---------- frame ---------- */
            function frame(t) {
                raf = requestAnimationFrame(frame);
                if (!lastT) lastT = t;
                const dt = Math.min(0.05, (t - lastT) / 1000);
                lastT = t;
                if (!active || !running || !g) return;
                const res = stepGame(g, dt, [wantDir, -1, -1, -1]);
                renderCells();
                renderHeads();
                renderRanks();
                updateHud();
                checkEnd(res.deaths);
            }

            /* ---------- input ---------- */
            document.addEventListener("keydown", (e) => {
                if (!active) return;
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
                if (map[e.code] != null) {
                    e.preventDefault();
                    wantDir = map[e.code];
                }
            });
            app.addEventListener("pointerdown", (e) => {
                const b = e.target.closest("[data-dir]");
                if (b && active) {
                    e.preventDefault();
                    wantDir = +b.dataset.dir;
                }
            });
            app.addEventListener("click", (e) => {
                const b = e.target.closest("[data-act]");
                if (!b) return;
                const a = b.dataset.act;
                if (a === "start" || a === "restart" || a === "again") start();
            });

            /* ---------- init ---------- */
            buildCells();

            /* ---------- open / close ---------- */
            return {
                open() {
                    active = true;
                    lastT = 0;
                    if (!raf) raf = requestAnimationFrame(frame);
                },
                close() {
                    active = false;
                    running = false;
                    if (raf) {
                        cancelAnimationFrame(raf);
                        raf = null;
                    }
                },
            };
        },
    });
})();
