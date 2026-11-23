/* ==== GAME: stickman-ninja.js ==== */
/*
  Stickman Ninja — realtime 2D side-scrolling stealth race.
  Template: export META + mount(root, context). Regenerate manifest:
  node tools/build-games-manifest.mjs
*/

export const META = {
    id: "stickman-ninja", // harus sama dengan nama file tanpa .js
    name: "Stickman Ninja",
    category: "action",
    catLabel: "Action",
    desc: "Menyelinap side-scroll: ambil gulungan, hindari penjaga, capai gerbang. Solo, vs bot, atau balapan online.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="13" r="5"/><path d="M12 12l-6 2 6 3"/><path d="M17 18v14"/><path d="M17 22l-8 6M17 22l8 7"/><path d="M17 32l-5 10M17 32l5 10"/><path d="M25 31L39 17" stroke="#f87171"/></svg>',
    bg: ["#3730a3", "#1e1b4b"],
    bestKey: "stickmanNinjaBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);

    /* ================= konstanta ================= */
    const VW = 960, VH = 440, GY = 380;
    const GRAV = 1500, JUMP = 560, DJUMP = 520, SPD = 232, PRW = 8;
    const GAD_MAX = { smoke: 2, stone: 3 };
    const ALARM_MAX = 3, HEADSTART = 0.9, COUNT_T = 3.4;
    const SEAT_COL = ["#22d3ee", "#fb7185"];
    const SEAT_NAME = ["Ninja Biru", "Ninja Merah"];
    const BEST_KEY = META.bestKey;

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
    const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

    function mulberry32(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

    /* segmen vs AABB (Liang-Barsky), kembalikan t masuk atau null */
    function rayRectT(x1, y1, x2, y2, r) {
        const dx = x2 - x1, dy = y2 - y1;
        let t0 = 0, t1 = 1;
        const p = [-dx, dx, -dy, dy];
        const q = [x1 - r[0], r[0] + r[2] - x1, y1 - r[1], r[1] + r[3] - y1];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return null; }
            else {
                const t = q[i] / p[i];
                if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
                else { if (t < t0) return null; if (t < t1) t1 = t; }
            }
        }
        return t0;
    }
    function rayCircleT(x1, y1, x2, y2, cx, cy, cr) {
        const dx = x2 - x1, dy = y2 - y1;
        const fx = x1 - cx, fy = y1 - cy;
        const a = dx * dx + dy * dy; if (a <= 0) return null;
        const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - cr * cr;
        let disc = b * b - 4 * a * c; if (disc < 0) return null;
        disc = Math.sqrt(disc);
        const t = (-b - disc) / (2 * a);
        if (t >= 0 && t <= 1) return t;
        const t2 = (-b + disc) / (2 * a);
        return t2 >= 0 && t2 <= 1 ? 0 : null;
    }

    /* ================= generator level (deterministik + tervalidasi) ================= */
    function genCore(seed) {
        const r = mulberry32(seed);
        const W = Math.floor(2800 + r() * 1400);
        const grounds = [[0, 520]]; const crates = []; let x = 520;
        while (x < W - 560) {
            const feat = r();
            if (feat < 0.22) {
                x += 90 + r() * 60;                       // jurang <= 150 (lompat ganda aman)
                const seg = 280 + r() * 260;
                grounds.push([x, Math.min(x + seg, W - 380)]); x += seg;
            } else {
                const seg = 320 + r() * 260;
                const g0 = x, g1 = Math.min(x + seg, W - 380);
                grounds.push([g0, g1]); x = g1;
                if (feat < 0.62 && g1 - g0 > 240) {
                    const n = 1 + Math.floor(r() * 2);
                    for (let i = 0; i < n; i++) {
                        const cx = g0 + 90 + r() * (g1 - g0 - 200);
                        const h = 40 + r() * 56;              // peti <= 96 (lompat tunggal = 104)
                        let w = h > 56 ? 30 + r() * 16 : 50 + r() * 40;
                        if (h > 56) w = Math.min(w, 46);
                        crates.push([cx, GY - h, w, h]);
                    }
                }
            }
        }
        grounds.push([W - 380, W]);
        const merged = [grounds[0].slice()];
        for (let i = 1; i < grounds.length; i++) {
            const g = grounds[i], last = merged[merged.length - 1];
            if (g[0] <= last[1] + 1) last[1] = Math.max(last[1], g[1]);
            else merged.push(g.slice());
        }
        return { W, grounds: merged, crates };
    }
    const groundAt = (L, x) => L.grounds.some((g) => x >= g[0] && x <= g[1]);

    /* walker greedy: lari ke kanan, lompat rintangan/jurang, lompat ganda di jurang */
    function validateLevel(L) {
        let x = 70, y = GY, vy = 0, on = true, jumps = 0, t = 0, stuck = 0, lastx = x;
        const target = L.W - 300;
        while (t < 90) {
            const dt = 1 / 60; t += dt;
            const crateAhead = L.crates.some((c) => c[0] - 14 < x + 34 && x < c[0] + c[2] && c[1] < GY - 18);
            const gapAhead = !groundAt(L, x + 34);
            if (on && (crateAhead || gapAhead)) { vy = -JUMP; on = false; jumps = 1; }
            else if (!on && jumps === 1 && vy > 60 && !groundAt(L, x + 10)) { vy = -DJUMP; jumps = 2; }
            x += SPD * dt;
            for (const c of L.crates)
                if (c[0] - PRW < x && x < c[0] + c[2] + PRW && y > c[1] + 6) x = Math.min(x, c[0] - PRW);
            vy = Math.min(vy + GRAV * dt, 900);
            const prev = y; y += vy * dt; on = false;
            if (groundAt(L, x) && vy >= 0 && y >= GY && prev <= GY + 1) { y = GY; vy = 0; on = true; jumps = 0; }
            for (const c of L.crates)
                if (c[0] - PRW < x && x < c[0] + c[2] + PRW && vy >= 0 && prev <= c[1] + 1 && y >= c[1]) { y = c[1]; vy = 0; on = true; jumps = 0; }
            if (y > VH + 80) return false;
            if (x >= target) return true;
            if (Math.abs(x - lastx) < 0.5) stuck += dt; else { stuck = 0; lastx = x; }
            if (stuck > 2.5) return false;
        }
        return false;
    }

    function buildLevel(seed) {
        let core = null, used = seed >>> 0;
        for (let i = 0; i < 8; i++) {
            const c = genCore((used + i) >>> 0);
            if (validateLevel(c)) { core = c; used = (used + i) >>> 0; break; }
        }
        if (!core) { core = genCore(used); core.grounds = [[0, core.W]]; core.crates = []; } // fallback: pasti rata
        const L = { seed: used, W: core.W, grounds: core.grounds, crates: core.crates, plats: [], bushes: [], lamps: [], guards: [], coins: [], cps: [], scroll: { x: core.W - 360, y: GY }, gate: { x: core.W - 110 }, hills: [], pagodas: [], stars: [] };
        const r = mulberry32(used ^ 0x9e3779b9);

        for (const g of L.grounds) {
            const len = g[1] - g[0];
            if (len > 300 && r() < 0.55) L.plats.push([g[0] + 60 + r() * (len - 220), GY - 118 - r() * 24, 90 + r() * 60]);
            if (len > 220 && r() < 0.7) L.bushes.push({ x: g[0] + 50 + r() * (len - 160), w: 70 + r() * 40 });
        }
        for (let lx = 320; lx < L.W - 320; lx += 380 + r() * 200)
            if (groundAt(L, lx)) L.lamps.push({ x: lx, r: 90 + r() * 30 });

        L.cps.push(70);
        for (let k = 1; k * 900 < L.W - 500; k++) {
            let cx = 70 + k * 900;
            const seg = L.grounds.find((g) => cx >= g[0] + 40 && cx <= g[1] - 40) || L.grounds.find((g) => g[0] > cx);
            if (seg) { cx = clamp(cx, seg[0] + 40, seg[1] - 40); L.cps.push(cx); }
        }
        const eligible = L.grounds.filter((g) => g[0] > 420 && g[1] < L.W - 420 && g[1] - g[0] > 180);
        const want = clamp(Math.round(L.W / 560), 4, 7);
        for (const g of eligible) {
            if (L.guards.length >= want) break;
            let a = g[0] + 40, b = g[1] - 40;
            const cuts = L.crates.filter((c) => c[0] > a - 30 && c[0] < b + 30).map((c) => [c[0] - 26, c[0] + c[2] + 26]).sort((p, q) => p[0] - q[0]);
            let best = [a, b], cur = a;
            for (const c of cuts) { if (c[0] - cur > best[1] - best[0]) best = [cur, c[0]]; cur = Math.max(cur, c[1]); }
            if (b - cur > best[1] - best[0]) best = [cur, b];
            a = best[0]; b = best[1];
            for (const cp of L.cps) if (cp > a - 130 && cp < b + 130) { if (cp - a < b - cp) a = Math.max(a, cp + 130); else b = Math.min(b, cp - 130); }
            if (b - a < 120) continue;
            L.guards.push({ a, b, x: a + r() * (b - a), spd: 42 + r() * 26, dir: r() < 0.5 ? -1 : 1 });
        }
        let cid = 0;
        for (const c of L.crates) if (r() < 0.5) for (let i = 0; i < 3; i++) L.coins.push({ id: cid++, x: c[0] + c[2] / 2 + (i - 1) * 26, y: c[1] - 34 - (i === 1 ? 14 : 0) });
        for (let i = 0; i < L.grounds.length - 1; i++) {
            const g0 = L.grounds[i][1], g1 = L.grounds[i + 1][0];
            if (g1 > g0) for (let k = 0; k < 3; k++) L.coins.push({ id: cid++, x: g0 + (g1 - g0) * (k + 1) / 4, y: GY - 120 - (k === 1 ? 16 : 0) });
        }
        for (const p of L.plats) for (let k = 0; k < 3; k++) L.coins.push({ id: cid++, x: p[0] + p[2] * (k + 1) / 4, y: p[1] - 22 });
        for (let i = 0; i < 40; i++) { const hx = i * 170; L.hills.push([hx, 50 + r() * 90]); }
        for (let px = 200; px < L.W * 0.45 + VW; px += 420 + r() * 260) L.pagodas.push([px, 40 + r() * 40]);
        for (let i = 0; i < 70; i++) L.stars.push([r() * VW, r() * 200, r() * 6.28]);
        return L;
    }

    /* ================= DOM & CSS (minimalis) ================= */
    root.innerHTML = `
<style>
.sn-app{--bg:#0b0f1a;--panel:#0f1526;--line:#223052;--text:#e2e8f0;--dim:#7c8db5;--acc:#22d3ee;--warn:#fbbf24;--bad:#f87171;--ok:#34d399;color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;gap:10px}
.sn-app *{box-sizing:border-box}
.sn-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sn-title{font-weight:800;font-size:16px;letter-spacing:.3px;margin-right:4px}
.sn-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:12px;color:var(--dim);white-space:nowrap}
.sn-chip b{color:var(--text);font-variant-numeric:tabular-nums}
.sn-chip.acc{border-color:#155e6b;color:#a5f3fc}
.sn-chip.bad{border-color:#7f1d1d;color:#fecaca}
.sn-spacer{flex:1}
.sn-btn{appearance:none;border:1px solid var(--line);background:#141c33;color:var(--text);border-radius:9px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;transition:border-color .15s,transform .05s,background .15s}
.sn-btn:hover{border-color:var(--acc)}
.sn-btn:active{transform:scale(.97)}
.sn-btn.primary{background:var(--acc);border-color:var(--acc);color:#06222a}
.sn-btn.primary:hover{background:#67e8f9}
.sn-btn.ghost{background:transparent}
.sn-btn[disabled]{opacity:.4;cursor:default}
.sn-icon{width:34px;height:34px;padding:0;display:grid;place-items:center;font-size:15px;border-radius:9px}
.sn-icon.on{border-color:var(--acc);color:var(--acc)}
.sn-stage{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--bg);touch-action:none}
.sn-cv{display:block;width:100%;height:auto;aspect-ratio:960/440;cursor:crosshair}
.sn-meter{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:min(240px,40%);height:6px;border-radius:3px;background:#1e293b;border:1px solid var(--line);overflow:hidden;pointer-events:none}
.sn-meter i{display:block;height:100%;width:0;background:var(--warn);transition:width .12s linear}
.sn-meter.hot i{background:var(--bad);animation:snPulse .5s infinite alternate}
@keyframes snPulse{to{opacity:.55}}
.sn-toasts{position:absolute;top:24px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;z-index:5}
.sn-toast{background:rgba(15,21,38,.92);border:1px solid var(--line);border-left:3px solid var(--acc);padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;animation:snIn .25s ease-out}
@keyframes snIn{from{opacity:0;transform:translateY(-8px)}}
.sn-count{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:6}
.sn-count b{font-size:88px;font-weight:900;color:var(--acc);text-shadow:0 0 30px rgba(34,211,238,.5);animation:snPop .9s ease-out infinite}
@keyframes snPop{0%{transform:scale(1.35);opacity:.2}30%{transform:scale(1);opacity:1}}
.sn-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(6,9,18,.74);backdrop-filter:blur(3px);z-index:10;padding:14px;overflow:auto}
.sn-ov[hidden]{display:none}
.sn-card{width:min(480px,94%);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:12px}
.sn-card h2{margin:0;font-size:22px;font-weight:800}
.sn-card p{margin:0;color:var(--dim);font-size:13px}
.sn-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sn-big{font-size:56px;font-weight:900;line-height:1;text-align:center}
.sn-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:13px;color:var(--dim)}
.sn-stats b{color:var(--text);float:right;font-variant-numeric:tabular-nums}
.sn-help{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--dim)}
.sn-help h3{margin:4px 0 0;font-size:13px;color:var(--text)}
.sn-help kbd{background:#141c33;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 6px;font:11px/1.4 ui-monospace,monospace;color:var(--text)}
.sn-help ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
.sn-cheat{position:absolute;top:12px;right:12px;width:230px;z-index:11;background:rgba(15,21,38,.96);border:1px solid #4c1d95;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.sn-cheat[hidden]{display:none}
.sn-cheat h3{margin:0;font-size:13px;color:#c4b5fd;display:flex;justify-content:space-between;align-items:center}
.sn-cheat label{display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;color:var(--text)}
.sn-cheat input{accent-color:#a78bfa;width:15px;height:15px}
.sn-cheat .sn-btn{padding:6px 10px;font-size:12px}
.sn-cheat small{color:var(--dim);font-size:11px}
.sn-touch{position:absolute;left:12px;right:12px;bottom:10px;display:none;justify-content:space-between;align-items:flex-end;pointer-events:none;z-index:8}
.sn-touch.show{display:flex}
.sn-tg{display:flex;gap:10px;align-items:flex-end}
.sn-tbtn{pointer-events:auto;width:58px;height:58px;border-radius:50%;border:1.5px solid var(--line);background:rgba(15,21,38,.72);color:var(--text);font-weight:800;font-size:13px;display:grid;place-items:center;user-select:none;-webkit-user-select:none;touch-action:none}
.sn-tbtn:active,.sn-tbtn.held{border-color:var(--acc);background:rgba(34,211,238,.2);transform:scale(.94)}
.sn-tbtn.big{width:72px;height:72px;font-size:15px;border-color:#155e6b}
.sn-tbtn.act{border-color:#7f1d1d;color:#fecaca}
.sn-tbtn.sm{width:46px;height:46px;font-size:11px;color:#c4b5fd}
.sn-foot{font-size:12px;color:var(--dim)}
.sn-rank-S{color:#fde047}.sn-rank-A{color:#34d399}.sn-rank-B{color:#22d3ee}.sn-rank-C{color:#7c8db5}
@media (max-width:640px){.sn-title{font-size:14px}.sn-chip{font-size:11px;padding:3px 8px}.sn-card{padding:16px}}
@media (prefers-reduced-motion:reduce){.sn-count b,.sn-meter.hot i{animation:none}}
</style>
<div class="sn-app">
  <div class="sn-top">
    <span class="sn-title">🥷 Stickman Ninja</span>
    <span class="sn-chip" data-h-mode>Solo</span>
    <span class="sn-chip">⏱ <b data-h-time>0.0</b>s</span>
    <span class="sn-chip" data-h-scroll>📜 —</span>
    <span class="sn-chip">⚠ <b data-h-alarm>0</b>/3</span>
    <span class="sn-chip">💨<b data-h-smk>2</b> 🪨<b data-h-stn>3</b></span>
    <span class="sn-chip" data-h-seed>Seed —</span>
    <span class="sn-chip acc" data-h-best>Best —</span>
    <span class="sn-chip bad" data-h-cheat hidden>CHEAT</span>
    <span class="sn-spacer"></span>
    <button class="sn-btn sn-icon" data-act="help" title="Cara main (H)">?</button>
    <button class="sn-btn sn-icon" data-act="sound" title="Suara (M)">🔊</button>
    <button class="sn-btn sn-icon" data-act="touch" title="Tombol virtual">🎮</button>
    <button class="sn-btn sn-icon" data-act="cheat" title="Cheat (C)" data-cheat-btn>⚡</button>
    <button class="sn-btn sn-icon" data-act="pause" title="Jeda (P)" data-pause-btn>⏸</button>
    <button class="sn-btn sn-icon" data-act="retry" title="Ulangi level (R)">↻</button>
    <button class="sn-btn sn-icon" data-act="exit" title="Keluar">✕</button>
  </div>
  <div class="sn-stage" data-stage>
    <canvas class="sn-cv" data-cv width="960" height="440"></canvas>
    <div class="sn-meter" data-meter><i></i></div>
    <div class="sn-toasts" data-toasts></div>
    <div class="sn-count" data-count hidden><b>3</b></div>
    <div class="sn-touch" data-touch>
      <div class="sn-tg">
        <button class="sn-tbtn" data-tc="l">◀</button>
        <button class="sn-tbtn" data-tc="r">▶</button>
      </div>
      <div class="sn-tg">
        <button class="sn-tbtn sm" data-tc="s1">SMK</button>
        <button class="sn-tbtn sm" data-tc="s2">STN</button>
        <button class="sn-tbtn" data-tc="c">▼</button>
        <button class="sn-tbtn act" data-tc="a">ACT</button>
        <button class="sn-tbtn big" data-tc="j">⤒</button>
      </div>
    </div>

    <div class="sn-ov" data-ov="menu">
      <div class="sn-card">
        <h2>🥷 Stickman Ninja</h2>
        <p>Lari &amp; menyelinap ke kanan, <b style="color:#fbbf24">ambil gulungan 📜</b>, lalu capai <b style="color:#34d399">gerbang ⛩️</b> — semuanya otomatis saat disentuh. Hindari kerucut pandang penjaga, merunduk di semak/gelap, dan takedown dari belakang.</p>
        <div class="sn-row" data-menu-modes>
          <button class="sn-btn primary" data-act="solo">▶ Solo</button>
          <button class="sn-btn" data-act="bot">🤖 Balapan vs Bot</button>
          <button class="sn-btn primary" data-act="online" hidden>🏁 Mulai Balapan</button>
        </div>
        <p data-menu-wait hidden>Menunggu host memulai balapan… Kamu bisa baca cara main dulu.</p>
        <div class="sn-row">
          <span class="sn-chip" data-menu-seed>Seed —</span>
          <button class="sn-btn ghost" data-act="shuffle" data-shuffle-btn>🎲 Acak Level</button>
          <span class="sn-chip acc" data-menu-best>Best —</span>
        </div>
        <div class="sn-row"><button class="sn-btn ghost" data-act="help">📖 Cara Main</button></div>
      </div>
    </div>

    <div class="sn-ov" data-ov="help" hidden>
      <div class="sn-card">
        <h2>📖 Cara Main</h2>
        <div class="sn-help">
          <h3>Tujuan</h3>
          <ul><li>Ambil 📜 lalu masuk ⛩️ (otomatis). Mode balapan: sentuh pembawa gulungan untuk <b>merebutnya</b>!</li></ul>
          <h3>Kontrol Desktop</h3>
          <ul>
            <li><kbd>A</kbd><kbd>D</kbd> / <kbd>◀</kbd><kbd>▶</kbd> gerak · <kbd>Space</kbd>/<kbd>W</kbd> / <b>klik kiri</b> lompat (2×!)</li>
            <li><kbd>S</kbd>/<kbd>▼</kbd> merunduk — sembunyi di semak &amp; gelap</li>
            <li><kbd>E</kbd> / <b>klik kanan</b> takedown (prompt <kbd>E</kbd> muncul saat bisa)</li>
            <li><kbd>1</kbd> bom asap · <kbd>2</kbd> lempar batu pengalih</li>
            <li><kbd>P</kbd> jeda · <kbd>R</kbd> ulang · <kbd>C</kbd> cheat · <kbd>H</kbd> bantuan</li>
          </ul>
          <h3>Kontrol Mobile</h3>
          <ul><li>Tombol virtual di layar · ketuk area game = lompat.</li></ul>
          <h3>Aturan</h3>
          <ul>
            <li>Meter deteksi penuh → tertangkap → ulang dari checkpoint. 3× tertangkap = gagal.</li>
            <li>Takedown berhasil dari <b>belakang</b>, saat penjaga <b>teralihkan (?)/dalam asap</b>.</li>
            <li>Lampu = terang = cepat ketahuan. Merunduk di gelap hampir tak terlihat.</li>
            <li>Siapa yang jalan duluan &amp; posisi ninja diacak tiap pertandingan.</li>
          </ul>
        </div>
        <div class="sn-row"><button class="sn-btn primary" data-act="help-close">Mengerti</button></div>
      </div>
    </div>

    <div class="sn-cheat" data-ov="cheat" hidden>
      <h3>⚡ CHEAT <button class="sn-btn ghost" data-act="cheat-close" style="padding:2px 8px">✕</button></h3>
      <label><input type="checkbox" data-cheat="god"> Kebal deteksi + takedown bebas</label>
      <label><input type="checkbox" data-cheat="speed"> Lari super (+60%)</label>
      <label><input type="checkbox" data-cheat="jump"> Lompat super</label>
      <label><input type="checkbox" data-cheat="freeze"> Bekukan penjaga</label>
      <label><input type="checkbox" data-cheat="gad"> Gadget tak terbatas</label>
      <div class="sn-row">
        <button class="sn-btn" data-act="tp-scroll">→ 📜</button>
        <button class="sn-btn" data-act="tp-gate">→ ⛩️</button>
        <button class="sn-btn" data-act="win">Menang</button>
      </div>
      <small>Skor terbaik tidak disimpan saat cheat aktif.</small>
    </div>

    <div class="sn-ov" data-ov="pause" hidden>
      <div class="sn-card"><h2>⏸ Jeda</h2>
        <div class="sn-row"><button class="sn-btn primary" data-act="resume">Lanjut</button><button class="sn-btn" data-act="menu">Menu</button></div>
      </div>
    </div>

    <div class="sn-ov" data-ov="end" hidden>
      <div class="sn-card">
        <h2 data-end-title>Misi Selesai</h2>
        <div class="sn-big" data-end-rank>S</div>
        <div class="sn-stats" data-end-stats></div>
        <div class="sn-row" data-end-btns>
          <button class="sn-btn primary" data-act="new">🎲 Level Baru</button>
          <button class="sn-btn" data-act="again">↻ Level Sama</button>
          <button class="sn-btn ghost" data-act="menu">Menu</button>
        </div>
        <p data-end-wait hidden>Menunggu host memulai level baru…</p>
      </div>
    </div>
  </div>
  <div class="sn-foot" data-foot>Keyboard: A/D gerak · Space lompat ganda · S merunduk · E takedown · 1 asap · 2 batu · klik kiri lompat, klik kanan takedown.</div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const el = {
        cv: $("[data-cv]"), stage: $("[data-stage]"), meter: $("[data-meter]"), meterFill: $("[data-meter] i"),
        toasts: $("[data-toasts]"), count: $("[data-count]"), countNum: $("[data-count] b"), touch: $("[data-touch]"),
        ovMenu: $('[data-ov="menu"]'), ovHelp: $('[data-ov="help"]'), ovCheat: $('[data-ov="cheat"]'), ovPause: $('[data-ov="pause"]'), ovEnd: $('[data-ov="end"]'),
        menuModes: $("[data-menu-modes]"), menuWait: $("[data-menu-wait]"), menuSeed: $("[data-menu-seed]"), menuBest: $("[data-menu-best]"),
        btnOnline: $('[data-act="online"]'), btnSolo: $('[data-act="solo"]'), btnBot: $('[data-act="bot"]'), btnShuffle: $("[data-shuffle-btn]"),
        endTitle: $("[data-end-title]"), endRank: $("[data-end-rank]"), endStats: $("[data-end-stats]"), endBtns: $("[data-end-btns]"), endWait: $("[data-end-wait]"),
        hMode: $("[data-h-mode]"), hTime: $("[data-h-time]"), hScroll: $("[data-h-scroll]"), hAlarm: $("[data-h-alarm]"),
        hSmk: $("[data-h-smk]"), hStn: $("[data-h-stn]"), hSeed: $("[data-h-seed]"), hBest: $("[data-h-best]"), hCheat: $("[data-h-cheat]"),
        cheatBtn: $("[data-cheat-btn]"), pauseBtn: $("[data-pause-btn]"), foot: $("[data-foot]"), soundBtn: $('[data-act="sound"]'),
    };
    const ctx = el.cv.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    el.cv.width = VW * DPR; el.cv.height = VH * DPR;

    /* ================= state ================= */
    let L = null, S = null, destroyed = false;
    let curSeed = randomSeed(), gameKind = "solo";
    let mySeat = 0, oppName = online ? "Pemain 2" : "BOT";
    let roomData = room?.room || null;
    const keys = { l: false, r: false, j: false, c: false, a: false, s1: false, s2: false };
    let inputs = [{ ...keys }, {}];
    const cheats = { god: false, speed: false, jump: false, freeze: false, gad: false };
    let camX = 0, shake = 0, hitstop = 0, menuT = 0, parts = [], leafT = 0;
    let raf = 0, lastT = 0, hudT = 0, netT = 0, hbT = 0, lastGuestInput = 0, autopilot = false;
    let best = 0; try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { }
    let muted = false; try { muted = localStorage.getItem("snMuted") === "1"; } catch (e) { }
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    let touchForce = coarse;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cheatActive = () => !online && Object.values(cheats).some(Boolean);
    const myRacer = () => (S && S.racers ? S.racers[mySeat] : null);

    /* ================= audio (synth kecil) ================= */
    let AC = null;
    function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === "suspended") AC.resume().catch(() => { }); return AC; }
    function beep(f, dur, type = "sine", vol = 0.08, slide = 0) {
        if (muted) return; const a = ac(); if (!a) return;
        try {
            const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
            o.type = type; o.frequency.setValueAtTime(f, t);
            if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
        } catch (e) { }
    }
    const snd = {
        jump: () => beep(340, 0.12, "square", 0.05, 180), dj: () => beep(430, 0.12, "square", 0.05, 220),
        coin: () => beep(880, 0.1, "triangle", 0.06, 220), ko: () => beep(140, 0.16, "sawtooth", 0.09, -60),
        alarm: () => { beep(660, 0.2, "square", 0.07, -300); setTimeout(() => beep(520, 0.25, "square", 0.06, -220), 140); },
        scroll: () => { beep(660, 0.1, "triangle", 0.07); setTimeout(() => beep(990, 0.14, "triangle", 0.07), 90); },
        win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.07), i * 110)),
        lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.22, "sawtooth", 0.06), i * 150)),
        click: () => beep(520, 0.05, "sine", 0.04), stone: () => beep(240, 0.08, "sine", 0.05, -80),
        smoke: () => beep(180, 0.25, "sine", 0.05, -60), cp: () => beep(760, 0.09, "sine", 0.05),
    };

    /* ================= partikel & toast ================= */
    function puff(x, y, n, col, spd = 60, kind = "dust") {
        if (reduceMotion) n = Math.min(n, 3);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random());
            parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: 0, life: 0.4 + Math.random() * 0.4, col, size: 2 + Math.random() * 3, kind });
        }
    }
    function confetti(x, y) {
        const cols = ["#22d3ee", "#fbbf24", "#34d399", "#fb7185", "#a78bfa"];
        for (let i = 0; i < (reduceMotion ? 12 : 60); i++)
            parts.push({ x, y, vx: (Math.random() - 0.5) * 320, vy: -120 - Math.random() * 260, t: 0, life: 1 + Math.random(), col: cols[i % 5], size: 3 + Math.random() * 3, kind: "conf" });
    }
    function toast(msg, ms = 2600) {
        const d = document.createElement("div");
        d.className = "sn-toast"; d.textContent = msg;
        el.toasts.appendChild(d);
        while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
        setTimeout(() => { d.style.opacity = "0"; d.style.transition = "opacity .3s"; setTimeout(() => d.remove(), 320); }, ms);
    }
    function netToast(msg) { if (S) S.ev.push(msg); if (isHost) toast(msg); }

    /* ================= pembuatan pertandingan ================= */
    function makeRacer(seat, x, name, bot) {
        return {
            seat, name, col: SEAT_COL[seat], x, y: GY, vx: 0, vy: 0, face: 1, crouch: false, onGround: true,
            jumps: 0, coyote: 0, jbuf: 0, prevJ: false, prevA: false, prevS1: false, prevS2: false,
            meter: 0, alarms: 0, kos: 0, coins: 0, scroll: false, gad: { ...GAD_MAX }, cpX: 70,
            stun: 0, respawn: false, stealCd: 0, actCd: 0, hidden: false, inSmoke: false, elim: false, finished: false,
            tk: -1, run: 0, flip: 0, scarf: [], spdMul: 1, bot: !!bot, botT: 0, plan: { dir: 0, crouch: false, jump: 0, act: 0, s1: 0, s2: 0 }, smokeCd: 0,
            tx: x, ty: GY,
        };
    }
    function makeGuards() {
        return L.guards.map((g, i) => ({ id: i, x: g.x, a: g.a, b: g.b, dir: g.dir, spd: g.spd, faceA: g.dir > 0 ? 0 : Math.PI, state: "patrol", pauseT: 0, investT: 0, investX: 0, alertT: 0, koT: 0, tx: g.x }));
    }
    function freshState(kind, seed) {
        gameKind = kind;
        L = buildLevel(seed); curSeed = L.seed;
        const roles = online ? (Math.random() < 0.5 ? { host: 0, guest: 1 } : { host: 1, guest: 0 }) : { host: 0, guest: 1 };
        mySeat = online ? (isHost ? roles.host : roles.guest) : 0;
        const first = Math.random() < 0.5 ? 0 : 1; // acak: siapa jalan duluan
        const two = kind !== "solo";
        const r0 = makeRacer(0, first === 0 ? 110 : 70, SEAT_NAME[0], false);
        const r1 = two ? makeRacer(1, first === 1 ? 110 : 70, SEAT_NAME[1], kind === "bot") : null;
        if (online) { r0.bot = false; r1.bot = false; }
        return {
            phase: "count", kind, seed: L.seed, t: 0, count: COUNT_T, first, roles, rel: [first === 0 ? 0 : HEADSTART, first === 1 ? 0 : HEADSTART],
            racers: two ? [r0, r1] : [r0, null], guards: makeGuards(), smokes: [], stones: [], coinsTaken: {},
            scrollTaken: -1, winner: null, cheated: false, ev: [],
        };
    }
    function menuState() {
        L = buildLevel(curSeed); curSeed = L.seed;
        return { phase: "menu", kind: gameKind, seed: L.seed, t: 0, count: 0, first: 0, roles: { host: 0, guest: 1 }, rel: [0, 0], racers: [makeRacer(0, 70, "", false), null], guards: makeGuards(), smokes: [], stones: [], coinsTaken: {}, scrollTaken: -1, winner: null, cheated: false, ev: [] };
    }
    function startMatch(kind, seed) {
        Object.keys(cheats).forEach((k) => (cheats[k] = false));
        root.querySelectorAll("[data-cheat]").forEach((c) => (c.checked = false));
        S = freshState(kind, seed);
        inputs = [{ ...keys }, {}];
        autopilot = false; lastGuestInput = performance.now();
        parts = []; camX = 0; shake = 0; hitstop = 0;
        hideAllOv(); el.count.hidden = false;
        if (online) {
            toast(`Kamu: ${SEAT_NAME[mySeat]} (${mySeat === 0 ? "P1" : "P2"}) — diacak!`);
            netToast(`${SEAT_NAME[S.first]} jalan duluan!`);
        } else if (kind === "bot") toast(`${S.first === 0 ? "Kamu" : "Bot"} jalan duluan! (diacak)`);
        publish(true);
    }
    function hideAllOv() { [el.ovMenu, el.ovHelp, el.ovPause, el.ovEnd].forEach((o) => (o.hidden = true)); el.ovCheat.hidden = true; }

    /* ================= fisika & simulasi ================= */
    function groundTopAt(x) {
        let top = VH + 400;
        for (const g of L.grounds) if (x >= g[0] && x <= g[1]) top = Math.min(top, GY);
        for (const c of L.crates) if (x >= c[0] && x <= c[0] + c[2]) top = Math.min(top, c[1]);
        return top;
    }
    function lightAt(x, y) { for (const l of L.lamps) if (dist(x, y, l.x + 12, GY - 70) < l.r) return true; return false; }
    function losBlocked(x1, y1, x2, y2) {
        for (const c of L.crates) if (rayRectT(x1, y1, x2, y2, c) !== null) return true;
        for (const p of L.plats) if (rayRectT(x1, y1, x2, y2, [p[0], p[1], p[2], 6]) !== null) return true;
        return false;
    }
    function smokeBlocked(x1, y1, x2, y2) { for (const s of S.smokes) if (rayCircleT(x1, y1, x2, y2, s.x, s.y, s.r) !== null) return true; return false; }

    function physRacer(r, inp, dt, fx) {
        const ch = r.seat === mySeat && !online ? cheats : { god: false, speed: false, jump: false };
        if (r.stun > 0) {
            r.stun -= dt; inp = { l: false, r: false, j: false, c: false, a: false, s1: false, s2: false };
            if (r.stun <= 0 && r.respawn) { r.respawn = false; r.x = r.cpX; r.y = GY; r.vy = 0; r.meter = 0; puff(r.x, r.y - 20, 10, "#94a3b8"); }
        }
        const h = r.crouch ? 28 : 44;
        const spd = SPD * (ch.speed ? 1.6 : 1) * (r.crouch ? 0.55 : 1) * r.spdMul;
        const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
        r.vx = dir * spd; if (dir) r.face = dir;
        r.crouch = Boolean(inp.c) && r.onGround;
        if (inp.j && !r.prevJ) r.jbuf = 0.12;
        r.prevJ = Boolean(inp.j);
        r.jbuf = Math.max(0, r.jbuf - dt); r.coyote = Math.max(0, r.coyote - dt);
        const jv = JUMP * (ch.jump ? 1.32 : 1);
        if (r.jbuf > 0 && r.stun <= 0) {
            if (r.onGround || r.coyote > 0) { r.vy = -jv; r.onGround = false; r.coyote = 0; r.jbuf = 0; r.jumps = 1; if (fx) { puff(r.x, r.y, 5, "#334155", 40); snd.jump(); } }
            else if (r.jumps < 2) { r.vy = -jv * 0.92; r.jumps = 2; r.jbuf = 0; r.flip = 0.35; if (fx) { puff(r.x, r.y - 10, 6, "#67e8f9", 50); snd.dj(); } }
        }
        const px0 = r.x;
        r.x = clamp(r.x + r.vx * dt, 12, L.W - 12);
        for (const c of L.crates)
            if (r.x + PRW > c[0] && r.x - PRW < c[0] + c[2] && r.y > c[1] + 4 && r.y - h < c[1] + c[3])
                r.x = px0 <= c[0] ? c[0] - PRW : c[0] + c[2] + PRW;
        r.vy = Math.min(r.vy + GRAV * dt, 900);
        const py0 = r.y; r.y += r.vy * dt;
        const wasOn = r.onGround; r.onGround = false;
        if (r.vy >= 0) {
            let top = VH + 400;
            for (const g of L.grounds) if (r.x >= g[0] && r.x <= g[1]) top = Math.min(top, GY);
            for (const c of L.crates) if (r.x + PRW > c[0] && r.x - PRW < c[0] + c[2] && py0 <= c[1] + 1) top = Math.min(top, c[1]);
            for (const p of L.plats) if (r.x + PRW > p[0] && r.x - PRW < p[0] + p[2] && py0 <= p[1] + 1) top = Math.min(top, p[1]);
            if (r.y >= top && py0 <= top + 1) {
                if (fx && !wasOn && r.vy > 420) puff(r.x, top, 6, "#334155", 50);
                r.y = top; r.vy = 0; r.onGround = true; r.jumps = 0; r.coyote = 0.1;
            }
        }
        if (wasOn && !r.onGround && r.vy >= 0) r.coyote = 0.1;
        r.run += Math.abs(r.vx) * dt * 0.055; r.flip = Math.max(0, r.flip - dt);
        if (fx) {
            r.scarf.push({ x: r.x - r.face * 5, y: r.y - h + 9 });
            if (r.scarf.length > 10) r.scarf.shift();
            if (r.onGround && Math.abs(r.vx) > 60 && Math.random() < dt * 8) puff(r.x - r.face * 8, r.y, 1, "#1e293b", 25);
        }
        if (r.y > VH + 60 && !r.elim) { // terpeleset ke jurang
            r.stun = 0.6; r.respawn = true; r.meter = Math.max(0, r.meter - 30);
            if (r.seat === mySeat) { toast("Terpeleset! Kembali ke checkpoint."); shake = Math.max(shake, 4); }
        }
    }

    function stepGuard(g, dt) {
        if (g.state === "ko") { g.koT += dt; return; }
        if (cheatActive() && cheats.freeze) return;
        g.alertT = Math.max(0, g.alertT - dt);
        const spd = g.spd * (g.alertT > 0 ? 1.45 : 1);
        if (g.state === "invest") {
            const dx = g.investX - g.x;
            if (Math.abs(dx) > 10) { g.dir = sgn(dx); g.x += g.dir * spd * 1.2 * dt; }
            else { g.investT -= dt; g.dir = Math.sin(g.investT * 5) > 0 ? 1 : -1; if (g.investT <= 0) g.state = "patrol"; }
        } else if (g.state === "pause") {
            g.pauseT -= dt; g.dir = Math.sin(g.pauseT * 4) > 0 ? g.dir : -g.dir;
            if (g.pauseT <= 0) { g.dir = -g.dir; g.state = "patrol"; }
        } else {
            if (g.x < g.a) g.dir = 1; else if (g.x > g.b) g.dir = -1;
            g.x += g.dir * spd * dt;
            if (g.x <= g.a || g.x >= g.b) { g.x = clamp(g.x, g.a, g.b); g.state = "pause"; g.pauseT = 0.8 + Math.random() * 0.8; }
        }
        const want = g.dir > 0 ? 0 : Math.PI;
        g.faceA += clamp(angDiff(want, g.faceA), -4 * dt, 4 * dt);
    }

    function guardSees(g, r) {
        if (r.hidden || r.elim || r.finished || r.stun > 0.5) return null;
        const range = 150 * (g.alertT > 0 ? 1.25 : 1) * (r.crouch ? 0.8 : 1);
        const tx = r.x, ty = r.y - (r.crouch ? 12 : 26);
        const d = dist(g.x, GY - 40, tx, ty);
        if (d > range) return null;
        if (Math.abs(angDiff(Math.atan2(ty - (GY - 40), tx - g.x), g.dir > 0 ? 0 : Math.PI)) > 0.5) return null;
        if (losBlocked(g.x, GY - 40, tx, ty) || smokeBlocked(g.x, GY - 40, tx, ty)) return null;
        return { lit: lightAt(tx, ty), close: d < 70 };
    }
    function tkEligible(g, r) {
        const behind = (r.x - g.x) * g.dir < 0;
        return behind || g.state === "invest" || r.inSmoke || (r.seat === mySeat && !online && cheats.god);
    }

    function caught(r) {
        r.alarms++; r.stun = 1.0; r.respawn = true; r.meter = 100;
        shake = Math.max(shake, 8); snd.alarm();
        for (const g of S.guards) if (g.state !== "ko") g.alertT = 5;
        puff(r.x, r.y - 20, 14, "#f87171", 90);
        netToast(`${r.seat === mySeat ? "Kamu" : r.name} tertangkap! (${r.alarms}/${ALARM_MAX})`);
        if (r.alarms >= ALARM_MAX) {
            r.elim = true;
            if (S.kind === "solo") endMatch(-1);
            else endMatch(1 - r.seat);
        }
    }
    function rating(r) {
        const s = Math.max(0, Math.round(600 - S.t * 2 - r.alarms * 90 + r.kos * 15 + r.coins * 5));
        return { score: s, rank: s >= 450 ? "S" : s >= 300 ? "A" : s >= 150 ? "B" : "C" };
    }
    function endMatch(winner) {
        if (S.phase === "end") return;
        S.winner = winner; S.phase = "end";
        const me = myRacer();
        if (winner === mySeat) { snd.win(); const gate = L.gate; confetti(gate.x, GY - 80); }
        else snd.lose();
        if (S.kind === "solo" && winner === 0 && me && !S.cheated) {
            const { score } = rating(me);
            if (score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { } }
        }
        showEnd(); publish(true);
    }

    function simRacer(r, inp, dt) {
        if (!r || r.elim || r.finished) return;
        if (S.rel[r.seat] > 0) { S.rel[r.seat] -= dt; inp = {}; }
        physRacer(r, inp, dt, true);
        r.actCd = Math.max(0, r.actCd - dt); r.stealCd = Math.max(0, r.stealCd - dt); r.smokeCd = Math.max(0, r.smokeCd - dt);
        const god = r.seat === mySeat && !online && cheats.god;
        const inf = r.seat === mySeat && !online && cheats.gad;
        r.inSmoke = S.smokes.some((s) => dist(r.x, r.y - 20, s.x, s.y) < s.r);
        const inBush = r.crouch && r.onGround && L.bushes.some((b) => r.x > b.x && r.x < b.x + b.w);
        r.hidden = god || r.inSmoke || inBush;

        /* takedown */
        r.tk = -1; let near = null;
        for (const g of S.guards) {
            if (g.state === "ko") continue;
            const d = dist(r.x, r.y - 20, g.x, GY - 20);
            if (d <= 46) { near = g; if (tkEligible(g, r)) { r.tk = g.id; break; } }
        }
        if (inp.a && !r.prevA && r.actCd <= 0 && r.stun <= 0) {
            r.actCd = 0.3;
            if (r.tk >= 0) {
                const g = S.guards.find((q) => q.id === r.tk);
                if (g) { g.state = "ko"; g.koT = 0; r.kos++; hitstop = 0.09; puff(g.x, GY - 20, 12, "#f87171", 80, "poof"); snd.ko(); if (r.seat === mySeat) toast("Takedown senyap! +15"); }
            } else if (near) { near.dir = sgn(r.x - near.x) || 1; near.state = "pause"; near.pauseT = 0.5; r.meter = clamp(r.meter + 22, 0, 100); puff(near.x, GY - 46, 4, "#fbbf24", 40); }
        }
        r.prevA = Boolean(inp.a);
        /* gadget */
        if (inp.s1 && !r.prevS1 && (r.gad.smoke > 0 || inf) && r.stun <= 0) {
            if (!inf) r.gad.smoke--;
            S.smokes.push({ x: r.x, y: r.y - 20, r: 64, t: 5 }); puff(r.x, r.y - 20, 10, "#cbd5e1", 70); snd.smoke();
        }
        r.prevS1 = Boolean(inp.s1);
        if (inp.s2 && !r.prevS2 && (r.gad.stone > 0 || inf) && r.stun <= 0) {
            if (!inf) r.gad.stone--;
            S.stones.push({ x: r.x + r.face * 10, y: r.y - 30, vx: r.face * 300, vy: -240 }); snd.stone();
        }
        r.prevS2 = Boolean(inp.s2);
        /* deteksi */
        let rate = -30;
        if (!r.hidden) {
            for (const g of S.guards) {
                if (g.state === "ko") continue;
                const v = guardSees(g, r); if (!v) continue;
                let rt = v.lit ? (r.crouch ? 38 : 70) : r.crouch ? 18 : 34;
                if (v.close) rt += 14;
                rate = Math.max(rate, rt);
            }
        } else rate = -45;
        r.meter = clamp(r.meter + rate * dt, 0, 100);
        if (r.meter >= 100 && r.stun <= 0) caught(r);
        /* checkpoint */
        for (const cp of L.cps) if (r.x > cp && cp > r.cpX) { r.cpX = cp; if (r.seat === mySeat) { snd.cp(); toast("Checkpoint ✔", 1400); } }
        /* koin */
        for (const c of L.coins) if (S.coinsTaken[c.id] === undefined && dist(r.x, r.y - 22, c.x, c.y) < 20) { S.coinsTaken[c.id] = r.seat; r.coins++; puff(c.x, c.y, 5, "#fde68a", 50, "spark"); if (r.seat === mySeat) snd.coin(); }
        /* gulungan & rebutan */
        const other = S.racers[1 - r.seat];
        if (S.scrollTaken < 0 && dist(r.x, r.y - 20, L.scroll.x, L.scroll.y - 14) < 28) {
            S.scrollTaken = r.seat; r.scroll = true; snd.scroll();
            puff(L.scroll.x, L.scroll.y - 14, 12, "#fbbf24", 70, "spark");
            netToast(`${r.seat === mySeat ? "Kamu" : r.name} mengambil gulungan!`);
        }
        if (other && !other.elim && other.scroll && !r.scroll && r.stealCd <= 0 && dist(r.x, r.y, other.x, other.y) < 32 && r.stun <= 0) {
            other.scroll = false; r.scroll = true; S.scrollTaken = r.seat; r.stealCd = 1.2; other.stun = Math.max(other.stun, 0.3);
            snd.scroll(); puff(r.x, r.y - 24, 10, "#fbbf24", 80, "spark");
            netToast(`${r.seat === mySeat ? "Kamu" : r.name} merebut gulungan!`);
        }
        /* gerbang */
        if (r.scroll && r.onGround && Math.abs(r.x - L.gate.x) < 34) { r.finished = true; endMatch(r.seat); }
    }

    /* ================= BOT AI ================= */
    function botThink(r, dt) {
        const p = r.plan;
        r.botT -= dt;
        if (r.botT <= 0) {
            r.botT = 0.14 + Math.random() * 0.16;
            const other = S.racers[1 - r.seat];
            const targetX = r.scroll ? L.gate.x : S.scrollTaken === 1 - r.seat && other ? other.x : L.scroll.x;
            let dir = Math.abs(targetX - r.x) < 18 ? 0 : sgn(targetX - r.x);
            let crouch = false;
            if (Math.random() < 0.04) dir = 0;
            /* ancaman penjaga */
            for (const g of S.guards) {
                if (g.state === "ko") continue;
                const d = Math.abs(g.x - r.x);
                const facingMe = sgn(r.x - g.x) === g.dir;
                if (d < 46 && tkEligible(g, r)) { p.act = 2; }
                else if (d < 175 && facingMe && !r.hidden && !losBlocked(g.x, GY - 40, r.x, r.y - 26)) {
                    if (d < 95 && r.gad.smoke > 0 && r.smokeCd <= 0) { p.s1 = 2; r.smokeCd = 4; }
                    else { dir = 0; crouch = true; }
                }
            }
            if (r.meter > 70 && !r.hidden) { crouch = true; }
            /* rintangan & jurang */
            const ahead = r.x + (dir || r.face) * 36;
            const crateAhead = L.crates.some((c) => c[0] - 14 < ahead && r.x < c[0] + c[2] && c[1] < GY - 18);
            const gapAhead = dir !== 0 && !groundAt(L, ahead);
            if (r.onGround && (crateAhead || gapAhead) && dir !== 0) p.jump = 2;
            /* rubber-band halus */
            const prog = (q) => q.x + (q.scroll ? 1200 : 0);
            r.spdMul = clamp(1 + (prog(other || r) - prog(r)) / 4000, 0.92, 1.12);
            p.dir = dir; p.crouch = crouch;
        }
        if (!r.onGround && r.jumps === 1 && r.vy > 60 && !groundAt(L, r.x + r.face * 10)) p.jump = 2;
        const inp = { l: p.dir < 0, r: p.dir > 0, c: p.crouch, j: p.jump > 0, a: p.act > 0, s1: p.s1 > 0, s2: p.s2 > 0 };
        p.jump = Math.max(0, p.jump - 1); p.act = Math.max(0, p.act - 1); p.s1 = Math.max(0, p.s1 - 1); p.s2 = Math.max(0, p.s2 - 1);
        return inp;
    }

    function simulate(dt) {
        S.t += dt;
        for (const s of S.smokes) s.t -= dt;
        S.smokes = S.smokes.filter((s) => s.t > 0);
        for (const st of S.stones) {
            st.vy += GRAV * dt; st.x += st.vx * dt; st.y += st.vy * dt;
            const top = groundTopAt(st.x);
            if (st.y >= top) {
                st.dead = true; puff(st.x, top, 6, "#e2e8f0", 50);
                for (const g of S.guards) if (g.state !== "ko" && Math.abs(g.x - st.x) < 130) { g.state = "invest"; g.investT = 3.2; g.investX = st.x; }
            }
        }
        S.stones = S.stones.filter((s) => !s.dead && s.y < VH + 80);
        for (const g of S.guards) stepGuard(g, dt);
        S.guards = S.guards.filter((g) => g.state !== "ko" || g.koT < 0.7);

        inputs[mySeat] = keys;
        if (S.kind === "bot" && S.racers[1]) inputs[1] = botThink(S.racers[1], dt);
        if (online && S.racers[1 - mySeat]) {
            const gs = S.roles.guest;
            if (isHost) {
                if (!autopilot && performance.now() - lastGuestInput > 6000) { autopilot = true; netToast("Pemain 2 dialihkan ke autopilot."); }
                if (autopilot) inputs[gs] = botThink(S.racers[gs], dt);
            }
        }
        for (const r of S.racers) if (r) simRacer(r, inputs[r.seat] || {}, dt);
    }

    /* ================= jaringan (host-authoritative) ================= */
    function makeSnap() {
        return {
            id: "stickman-ninja", v: 1, seed: S.seed, phase: S.phase, kind: S.kind, t: S.t, count: S.count,
            first: S.first, roles: S.roles, rel: S.rel, winner: S.winner, scrollTaken: S.scrollTaken,
            coinsTaken: Object.keys(S.coinsTaken).map(Number), ev: S.ev.splice(0),
            racers: S.racers.map((r) => r && ({
                seat: r.seat, x: r.x, y: r.y, vx: r.vx, vy: r.vy, face: r.face, crouch: r.crouch, onGround: r.onGround,
                meter: r.meter, alarms: r.alarms, kos: r.kos, coins: r.coins, scroll: r.scroll, gs: r.gad.smoke, gz: r.gad.stone,
                stun: r.stun, elim: r.elim, finished: r.finished, hidden: r.hidden, cpX: r.cpX, tk: r.tk,
            })),
            guards: S.guards.map((g) => ({ id: g.id, x: g.x, a: g.a, b: g.b, dir: g.dir, spd: g.spd, state: g.state, alertT: g.alertT, investT: g.investT, koT: g.koT })),
            smokes: S.smokes.map((s) => ({ x: s.x, y: s.y, r: s.r, t: s.t })),
        };
    }
    function publish(force) {
        if (!online || !isHost || !S) return;
        const now = performance.now();
        if (!force && now - netT < 100) return;
        netT = now;
        try { room.publishState(makeSnap()).catch(console.warn); } catch (e) { console.warn(e); }
    }
    function applyAction(action, actor) {
        if (!online || !isHost || !S || !action) return;
        if (action.type === "input" && action.k) {
            const seat = S.roles.guest;
            inputs[seat] = action.k; lastGuestInput = performance.now();
            if (autopilot) { autopilot = false; netToast("Pemain 2 kembali mengambil alih."); }
        }
    }
    function submitAction(action) {
        if (online && !isHost) { try { room.sendAction(action).catch(console.warn); } catch (e) { console.warn(e); } return; }
        applyAction(action, 0);
    }
    const sendInput = () => { if (online && !isHost) submitAction({ type: "input", k: { ...keys } }); };

    function applySnap(s) {
        if (!s || s.id !== "stickman-ninja") return;
        if (!S || S.seed !== s.seed || S.phase === "menu") {
            const keepMenu = s.phase === "menu";
            L = buildLevel(s.seed); curSeed = L.seed;
            S = freshState("online", s.seed);
            S.phase = keepMenu ? "menu" : s.phase;
            if (keepMenu) { showMenu(); return; }
            hideAllOv();
            toast(`Kamu: ${SEAT_NAME[mySeat]} — posisi diacak!`);
        }
        const prevPhase = S.phase;
        S.phase = s.phase; S.t = s.t; S.count = s.count; S.first = s.first; S.roles = s.roles; S.rel = s.rel;
        S.winner = s.winner; S.scrollTaken = s.scrollTaken;
        mySeat = S.roles.guest;
        for (const id of s.coinsTaken) if (S.coinsTaken[id] === undefined) S.coinsTaken[id] = 0;
        for (const m of s.ev || []) toast(m);
        /* racer: milik sendiri diprediksi lokal, lainnya di-lerp */
        s.racers.forEach((sr, i) => {
            if (!sr) { S.racers[i] = null; return; }
            let r = S.racers[i];
            if (!r) r = S.racers[i] = makeRacer(sr.seat, sr.x, SEAT_NAME[sr.seat], false);
            const mine = sr.seat === mySeat;
            if (mine) {
                const err = dist(r.x, r.y, sr.x, sr.y);
                if (err > 70 || sr.stun > 0 || sr.elim) { r.x = sr.x; r.y = sr.y; r.vy = sr.vy; }
                else { r.x = lerp(r.x, sr.x, 0.25); r.y = lerp(r.y, sr.y, 0.25); }
            } else { r.tx = sr.x; r.ty = sr.y; }
            Object.assign(r, { vx: sr.vx, face: sr.face, crouch: sr.crouch, onGround: sr.onGround, meter: sr.meter, alarms: sr.alarms, kos: sr.kos, coins: sr.coins, scroll: sr.scroll, stun: mine ? r.stun : sr.stun, elim: sr.elim, finished: sr.finished, hidden: sr.hidden, cpX: sr.cpX, tk: sr.tk });
            r.gad.smoke = sr.gs; r.gad.stone = sr.gz;
        });
        /* guard: cocokkan id, lerp posisi */
        const byId = new Map(S.guards.map((g) => [g.id, g]));
        S.guards = s.guards.map((sg) => {
            const g = byId.get(sg.id) || { id: sg.id, x: sg.x, faceA: sg.dir > 0 ? 0 : Math.PI, pauseT: 0, investX: 0 };
            Object.assign(g, { a: sg.a, b: sg.b, dir: sg.dir, spd: sg.spd, state: sg.state, alertT: sg.alertT, investT: sg.investT, koT: sg.koT, tx: sg.x });
            return g;
        });
        S.smokes = s.smokes;
        if (s.phase === "count") { el.count.hidden = false; hideAllOv(); el.count.hidden = false; }
        if (s.phase === "run" && prevPhase === "count") { el.count.hidden = true; toast(`${SEAT_NAME[S.first]} jalan duluan!`); }
        if (s.phase === "end" && prevPhase !== "end") { showEnd(); if (s.winner === mySeat) { snd.win(); confetti(L.gate.x, GY - 80); } else snd.lose(); }
        if (s.phase === "menu") showMenu();
    }
    function guestFrame(dt) {
        if (!S) return;
        const me = myRacer();
        if (S.phase === "run" && me && !me.elim && !me.finished) {
            physRacer(me, keys, dt, true); // prediksi lokal biar responsif
            me.run += Math.abs(me.vx) * dt * 0.055;
        }
        const k = 1 - Math.exp(-12 * dt);
        for (const r of S.racers) if (r && r.seat !== mySeat) { r.x = lerp(r.x, r.tx ?? r.x, k); r.y = lerp(r.y, r.ty ?? r.y, k); r.run += Math.abs(r.vx) * dt * 0.055; }
        for (const g of S.guards) { g.x = lerp(g.x, g.tx ?? g.x, k); const want = g.dir > 0 ? 0 : Math.PI; g.faceA += clamp(angDiff(want, g.faceA), -4 * dt, 4 * dt); }
        if (S.phase === "count") S.count = Math.max(0, S.count - dt);
        if (S.phase === "run") S.t += dt;
    }

    /* ================= rendering ================= */
    function drawNinja(x, y, face, col, r, isGuard) {
        const h = r.crouch ? 28 : 44;
        const air = !r.onGround, ph = r.run;
        const swing = air ? 0.5 : Math.sin(ph * 6) * (Math.abs(r.vx) > 20 ? 0.9 : 0.12);
        const hipY = y - (r.crouch ? 10 : 16), neckY = y - h + 10, headY = y - h + 5;
        ctx.save();
        if (r.flip > 0) { ctx.translate(x, y - h / 2); ctx.rotate((1 - r.flip / 0.35) * Math.PI * 2 * face); ctx.translate(-x, -(y - h / 2)); }
        ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x, neckY); ctx.lineTo(x, hipY); ctx.stroke();
        ctx.beginPath(); // kaki
        if (air) { ctx.moveTo(x, hipY); ctx.lineTo(x + face * 7, y - 8); ctx.moveTo(x, hipY); ctx.lineTo(x - face * 4, y - 6); }
        else { ctx.moveTo(x, hipY); ctx.lineTo(x + Math.sin(swing) * 9, y); ctx.moveTo(x, hipY); ctx.lineTo(x - Math.sin(swing) * 9, y); }
        ctx.stroke();
        ctx.beginPath(); // lengan
        ctx.moveTo(x, neckY + 4); ctx.lineTo(x - Math.sin(swing) * 8 * face, neckY + 12);
        ctx.moveTo(x, neckY + 4); ctx.lineTo(x + Math.sin(swing) * 8 * face, neckY + 12); ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = "#0b0f1f"; ctx.arc(x + face * 2, headY, 5.5, 0, 7); ctx.fill(); ctx.stroke();
        if (isGuard) { ctx.beginPath(); ctx.fillStyle = col; ctx.moveTo(x + face * 2 - 8, headY - 3); ctx.lineTo(x + face * 2 + 8, headY - 3); ctx.lineTo(x + face * 2, headY - 11); ctx.closePath(); ctx.fill(); }
        else { // syal berkibar
            ctx.strokeStyle = "#f87171"; ctx.lineWidth = 2.4; ctx.beginPath();
            const sc = r.scarf; ctx.moveTo(x, neckY);
            for (let i = sc.length - 1; i >= 0; i--) ctx.lineTo(sc[i].x, sc[i].y + Math.sin(ph * 4 + i) * 1.5);
            ctx.stroke();
            ctx.fillStyle = col; ctx.fillRect(x + face * 2 - 4, headY - 2, 8, 2.4); // ikat kepala
        }
        ctx.restore();
    }
    function drawCone(g) {
        const range = 150 * (g.alertT > 0 ? 1.25 : 1);
        const ox = g.x, oy = GY - 40, base = g.dir > 0 ? 0 : Math.PI;
        const col = g.alertT > 0 ? "#fb923c" : "#fbbf24";
        ctx.beginPath(); ctx.moveTo(ox, oy);
        for (let i = 0; i <= 12; i++) {
            const a = base - 0.5 + (i / 12);
            const ex = ox + Math.cos(a) * range, ey = oy + Math.sin(a) * range;
            let t = 1;
            for (const c of L.crates) { const tt = rayRectT(ox, oy, ex, ey, c); if (tt !== null) t = Math.min(t, tt); }
            for (const p of L.plats) { const tt = rayRectT(ox, oy, ex, ey, [p[0], p[1], p[2], 6]); if (tt !== null) t = Math.min(t, tt); }
            for (const s of S.smokes) { const tt = rayCircleT(ox, oy, ex, ey, s.x, s.y, s.r); if (tt !== null) t = Math.min(t, tt); }
            ctx.lineTo(ox + (ex - ox) * t, oy + (ey - oy) * t);
        }
        ctx.closePath();
        ctx.fillStyle = col; ctx.globalAlpha = 0.1; ctx.fill();
        ctx.globalAlpha = 0.3; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = 1;
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

    function draw() {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const me = myRacer();
        /* kamera */
        let target = 0;
        if (S.phase === "menu") target = (Math.sin(menuT * 0.08) + 1) * 0.5 * Math.min(600, L.W - VW);
        else if (me) target = clamp(me.x - VW * 0.42 + me.face * 50, 0, L.W - VW);
        camX = lerp(camX, target, 0.08);
        shake = Math.max(0, shake - 0.35);
        const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
        const T = performance.now() / 1000;

        /* langit */
        const sky = ctx.createLinearGradient(0, 0, 0, VH);
        sky.addColorStop(0, "#0b0f1a"); sky.addColorStop(1, "#0e1424");
        ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = "#e2e8f0";
        for (const s of L.stars) { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(T * 1.5 + s[2]); ctx.fillRect(s[0], s[1], 1.6, 1.6); }
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(VW - 130 - camX * 0.03, 78, 26, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        /* parallax bukit & pagoda */
        ctx.fillStyle = "#0e1526"; ctx.beginPath(); ctx.moveTo(0, VH);
        for (const hpt of L.hills) ctx.lineTo(hpt[0] - camX * 0.15, GY - 60 - hpt[1]);
        ctx.lineTo(VW + 200, VH); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#101a33";
        for (const p of L.pagodas) {
            const px = p[0] - camX * 0.4; if (px < -80 || px > VW + 80) continue;
            const bh = p[1];
            for (let tier = 0; tier < 3; tier++) {
                const tw = 56 - tier * 14, ty = GY - 30 - tier * (bh / 3);
                ctx.beginPath(); ctx.moveTo(px - tw / 2 - 8, ty); ctx.lineTo(px + tw / 2 + 8, ty); ctx.lineTo(px + tw / 2 - 4, ty - bh / 3 + 6); ctx.lineTo(px - tw / 2 + 4, ty - bh / 3 + 6); ctx.closePath(); ctx.fill();
            }
        }
        ctx.save(); ctx.translate(-camX + sx, sy);

        /* cahaya lampu */
        for (const l of L.lamps) {
            const flick = 1 + Math.sin(T * 7 + l.x) * 0.03;
            const gr = ctx.createRadialGradient(l.x + 12, GY - 70, 4, l.x + 12, GY - 70, l.r * flick);
            gr.addColorStop(0, "rgba(253,230,138,.28)"); gr.addColorStop(1, "rgba(253,230,138,0)");
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(l.x + 12, GY - 70, l.r * flick, 0, 7); ctx.fill();
        }
        /* tanah */
        for (const g of L.grounds) {
            ctx.fillStyle = "#131a2e"; ctx.fillRect(g[0], GY, g[1] - g[0], VH - GY + 40);
            ctx.strokeStyle = "#2b3a63"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g[0], GY); ctx.lineTo(g[1], GY); ctx.stroke();
            ctx.fillStyle = "#0a0e1c"; ctx.fillRect(g[0] - 3, GY, 3, VH - GY); ctx.fillRect(g[1], GY, 3, VH - GY);
        }
        /* peti & platform */
        for (const c of L.crates) {
            ctx.fillStyle = "#1a2340"; ctx.fillRect(c[0], c[1], c[2], c[3]);
            ctx.strokeStyle = "#31406e"; ctx.lineWidth = 1.5; ctx.strokeRect(c[0], c[1], c[2], c[3]);
            ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + c[2], c[1] + c[3]); ctx.moveTo(c[0] + c[2], c[1]); ctx.lineTo(c[0], c[1] + c[3]); ctx.stroke(); ctx.globalAlpha = 1;
        }
        for (const p of L.plats) { ctx.fillStyle = "#223055"; rr(p[0], p[1], p[2], 6, 3); ctx.fill(); ctx.strokeStyle = "#3a4c85"; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + p[2], p[1]); ctx.stroke(); }
        /* checkpoint */
        for (const cp of L.cps) {
            const on = me && cp <= me.cpX;
            ctx.strokeStyle = on ? "#22d3ee" : "#475569"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cp, GY); ctx.lineTo(cp, GY - 26); ctx.stroke();
            ctx.fillStyle = on ? "#22d3ee" : "#475569";
            ctx.beginPath(); ctx.moveTo(cp, GY - 26); ctx.lineTo(cp + 12 + Math.sin(T * 3 + cp) * 2, GY - 21); ctx.lineTo(cp, GY - 16); ctx.closePath(); ctx.fill();
        }
        /* gerbang torii */
        const ready = S.scrollTaken >= 0, gc = ready ? "#34d399" : "#475569", gx = L.gate.x;
        if (ready) { const bg = ctx.createLinearGradient(gx, GY - 160, gx, GY); bg.addColorStop(0, "rgba(52,211,153,0)"); bg.addColorStop(1, "rgba(52,211,153,.14)"); ctx.fillStyle = bg; ctx.fillRect(gx - 26, GY - 160, 52, 160); }
        ctx.strokeStyle = gc; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(gx - 22, GY); ctx.lineTo(gx - 22, GY - 66); ctx.moveTo(gx + 22, GY); ctx.lineTo(gx + 22, GY - 66); ctx.stroke();
        ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(gx - 34, GY - 66); ctx.lineTo(gx + 34, GY - 66); ctx.stroke();
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx - 28, GY - 54); ctx.lineTo(gx + 28, GY - 54); ctx.stroke();
        /* gulungan */
        if (S.scrollTaken < 0) {
            const px = L.scroll.x, py = L.scroll.y;
            ctx.fillStyle = "#1a2340"; ctx.fillRect(px - 14, py - 8, 28, 8);
            const pulse = 12 + Math.sin(T * 3) * 3;
            ctx.strokeStyle = "#fbbf24"; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(px, py - 16, pulse, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
            ctx.fillStyle = "#fbbf24"; rr(px - 9, py - 21, 18, 10, 3); ctx.fill();
            ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(px - 9, py - 16, 5, 0, 7); ctx.arc(px + 9, py - 16, 5, 0, 7); ctx.fill();
        }
        /* koin */
        for (const c of L.coins) {
            if (S.coinsTaken[c.id] !== undefined) continue;
            const sc = Math.abs(Math.sin(T * 3 + c.id));
            ctx.fillStyle = "#fde68a"; ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(c.x, c.y + Math.sin(T * 2 + c.id) * 2, 5 * Math.max(0.25, sc), 5, 0, 0, 7); ctx.fill(); ctx.stroke();
        }
        /* batu */
        ctx.fillStyle = "#cbd5e1";
        for (const st of S.stones) { ctx.beginPath(); ctx.arc(st.x, st.y, 3, 0, 7); ctx.fill(); }
        /* kerucut pandang & penjaga */
        for (const g of S.guards) if (g.state !== "ko") drawCone(g);
        for (const g of S.guards) {
            const col = g.alertT > 0 ? "#fb923c" : "#f87171";
            ctx.save();
            if (g.state === "ko") { ctx.globalAlpha = Math.max(0, 1 - g.koT / 0.7); ctx.translate(g.x, GY); ctx.rotate(Math.PI / 2); ctx.translate(-g.x, -GY); }
            drawNinja(g.x, GY, g.dir, col, { crouch: false, onGround: true, vx: g.state === "pause" ? 0 : g.spd, run: g.x * 0.05, flip: 0, scarf: [] }, true);
            ctx.restore();
            if (g.state === "invest") { ctx.fillStyle = "#fbbf24"; ctx.font = "bold 14px system-ui"; ctx.fillText("?", g.x - 4, GY - 56 + Math.sin(T * 6) * 2); }
            if (g.alertT > 0) { ctx.fillStyle = "#f87171"; ctx.font = "bold 16px system-ui"; ctx.fillText("!", g.x - 3, GY - 58 + Math.sin(T * 10) * 3); }
        }
        /* ninja pemain */
        if (S.phase !== "menu") for (const r of S.racers) {
            if (!r || r.elim) continue;
            ctx.save();
            if (r.hidden) ctx.globalAlpha = 0.5;
            if (r.finished) ctx.globalAlpha = 0.4;
            drawNinja(r.x, r.y, r.face, r.col, r, false);
            ctx.restore();
            /* label & meter */
            ctx.font = "600 10px system-ui"; ctx.textAlign = "center";
            ctx.fillStyle = r.seat === mySeat ? r.col : "#7c8db5";
            ctx.fillText(r.seat === mySeat ? (playerName || "KAMU").slice(0, 10).toUpperCase() : r.name.toUpperCase(), r.x, r.y - (r.crouch ? 36 : 52));
            if (r.meter > 1) { ctx.fillStyle = "#1e293b"; ctx.fillRect(r.x - 14, r.y - (r.crouch ? 32 : 48), 28, 3); ctx.fillStyle = r.meter > 60 ? "#f87171" : "#fbbf24"; ctx.fillRect(r.x - 14, r.y - (r.crouch ? 32 : 48), 28 * r.meter / 100, 3); }
            if (r.scroll) { ctx.fillStyle = "#fbbf24"; rr(r.x - 6, r.y - (r.crouch ? 46 : 62), 12, 7, 2); ctx.fill(); }
            if (r.hidden) { ctx.fillStyle = "#34d399"; ctx.font = "600 9px system-ui"; ctx.fillText("SEMBUNYI", r.x, r.y + 12); }
            if (S.rel[r.seat] > 0 && S.phase === "run") { ctx.fillStyle = "#7c8db5"; ctx.font = "700 10px system-ui"; ctx.fillText("TUNGGU…", r.x, r.y - 66); }
            if (r.stun > 0) for (let i = 0; i < 3; i++) { const a = T * 6 + i * 2.1; ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * 12, r.y - 50 + Math.sin(a) * 4, 2, 0, 7); ctx.fill(); }
            ctx.textAlign = "left";
        }
        /* prompt takedown */
        if (me && me.tk >= 0 && S.phase === "run") {
            const g = S.guards.find((q) => q.id === me.tk);
            if (g) {
                const by = GY - 74 + Math.sin(T * 6) * 3;
                ctx.fillStyle = "#0f1526"; ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.5;
                rr(g.x - 16, by - 12, 32, 18, 5); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#22d3ee"; ctx.font = "800 11px system-ui"; ctx.textAlign = "center";
                ctx.fillText(touchForce ? "ACT" : "E", g.x, by + 1); ctx.textAlign = "left";
            }
        }
        /* semak (depan ninja) */
        for (const b of L.bushes) {
            const sway = Math.sin(T * 1.3 + b.x) * 2;
            ctx.fillStyle = "rgba(18,53,36,.88)";
            ctx.beginPath();
            ctx.arc(b.x + b.w * 0.25 + sway, GY - 12, 16, 0, 7);
            ctx.arc(b.x + b.w * 0.5 + sway, GY - 18, 20, 0, 7);
            ctx.arc(b.x + b.w * 0.75 + sway, GY - 12, 16, 0, 7);
            ctx.fill();
        }
        /* asap */
        for (const s of S.smokes) {
            const fade = Math.min(1, s.t / 1);
            ctx.fillStyle = "#94a3b8"; ctx.globalAlpha = 0.35 * fade;
            ctx.beginPath(); ctx.arc(s.x + Math.sin(T * 2) * 3, s.y, s.r, 0, 7); ctx.fill();
            ctx.fillStyle = "#cbd5e1"; ctx.globalAlpha = 0.25 * fade;
            ctx.beginPath(); ctx.arc(s.x - 8, s.y - 8, s.r * 0.65, 0, 7); ctx.fill();
            ctx.globalAlpha = 1;
        }
        /* partikel */
        for (const p of parts) {
            const a = Math.max(0, 1 - p.t / p.life);
            ctx.globalAlpha = a; ctx.fillStyle = p.col;
            if (p.kind === "conf") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 8); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); ctx.restore(); }
            else if (p.kind === "spark") { ctx.fillRect(p.x - 1, p.y - p.size, 2, p.size * 2); ctx.fillRect(p.x - p.size, p.y - 1, p.size * 2, 2); }
            else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, 7); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        /* vignette */
        const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.5, VW / 2, VH / 2, VW * 0.72);
        vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.38)");
        ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    }

    /* ================= HUD & overlay ================= */
    function hud() {
        if (!S) return;
        const me = myRacer();
        el.hMode.textContent = online ? "Online" : S.kind === "bot" ? "vs Bot" : "Solo";
        el.hTime.textContent = S.t.toFixed(1);
        el.hScroll.textContent = S.scrollTaken < 0 ? "📜 belum diambil" : S.scrollTaken === mySeat ? "📜 dibawamu!" : "📜 dibawa lawan";
        el.hAlarm.textContent = me ? me.alarms : 0;
        el.hSmk.textContent = me ? (cheatActive() && cheats.gad ? "∞" : me.gad.smoke) : GAD_MAX.smoke;
        el.hStn.textContent = me ? (cheatActive() && cheats.gad ? "∞" : me.gad.stone) : GAD_MAX.stone;
        el.hSeed.textContent = "Seed " + (S.seed % 100000);
        el.hBest.textContent = "Best " + (best || "—");
        el.hCheat.hidden = !cheatActive();
        const m = me ? me.meter : 0;
        el.meterFill.style.width = m + "%";
        el.meter.classList.toggle("hot", m > 60);
        el.menuSeed.textContent = "Seed " + (curSeed % 100000);
        el.menuBest.textContent = "Best " + (best || "—");
        if (S.phase === "count") { el.count.hidden = false; el.countNum.textContent = S.count > 0.4 ? Math.ceil(S.count - 0.4) : "GO!"; }
        else el.count.hidden = true;
    }
    function showMenu() {
        hideAllOv(); el.ovMenu.hidden = false; el.count.hidden = true;
        const guest = online && !isHost;
        el.btnSolo.hidden = online; el.btnBot.hidden = online;
        el.btnOnline.hidden = !online || !isHost;
        el.menuWait.hidden = !guest;
        el.btnShuffle.hidden = guest;
        el.pauseBtn.disabled = online; el.cheatBtn.hidden = online;
        $('[data-act="retry"]').disabled = guest;
    }
    function showEnd() {
        hideAllOv(); el.ovEnd.hidden = false; el.count.hidden = true;
        const me = myRacer(), win = S.winner === mySeat;
        const winnerName = S.winner < 0 ? null : S.winner === mySeat ? "Kamu" : (S.racers[S.winner] ? S.racers[S.winner].name : "Lawan");
        el.endTitle.textContent = S.winner < 0 ? "💀 Misi Gagal" : win ? "🏆 Misi Selesai!" : `🏁 ${winnerName} Menang`;
        const rt = me ? rating(me) : { score: 0, rank: "C" };
        el.endRank.textContent = S.winner < 0 ? "✕" : rt.rank;
        el.endRank.className = "sn-big sn-rank-" + rt.rank;
        el.endStats.innerHTML = me ? `
      <span>Waktu <b>${S.t.toFixed(1)}s</b></span><span>Skor <b>${rt.score}</b></span>
      <span>Takedown <b>${me.kos}</b></span><span>Koin <b>${me.coins}</b></span>
      <span>Tertangkap <b>${me.alarms}/${ALARM_MAX}</b></span><span>Best <b>${best || "—"}</b></span>
      ${cheatActive() || S.cheated ? '<span style="grid-column:1/-1;color:#c4b5fd">Cheat aktif — skor tidak disimpan</span>' : ""}` : "";
        const guest = online && !isHost;
        el.endBtns.hidden = guest; el.endWait.hidden = !guest;
    }

    /* ================= input ================= */
    const KEYMAP = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "j", KeyW: "j", Space: "j", ArrowDown: "c", KeyS: "c", KeyE: "a", KeyJ: "a", Digit1: "s1", Numpad1: "s1", Digit2: "s2", Numpad2: "s2" };
    function onKeyDown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = KEYMAP[e.code];
        if (k) { e.preventDefault(); if (!keys[k]) { keys[k] = true; sendInput(); } return; }
        if (e.code === "KeyH") { e.preventDefault(); toggleHelp(); }
        else if (e.code === "KeyC" && !online) { e.preventDefault(); el.ovCheat.hidden = !el.ovCheat.hidden; }
        else if (e.code === "KeyP" && !online) { e.preventDefault(); togglePause(); }
        else if (e.code === "KeyM") { e.preventDefault(); toggleSound(); }
        else if (e.code === "KeyR" && (!online || isHost)) { e.preventDefault(); if (S.phase !== "menu") startMatch(S.kind, curSeed); }
        else if (e.code === "Escape") { el.ovCheat.hidden = true; if (!el.ovHelp.hidden) toggleHelp(); else if (!el.ovPause.hidden) togglePause(); }
        else if (e.code === "Enter" && S.phase === "menu" && (!online || isHost)) { e.preventDefault(); startMatch(online ? "online" : "solo", curSeed); }
    }
    function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) { keys[k] = false; sendInput(); } }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    /* mouse: klik kiri lompat, klik kanan takedown */
    el.cv.addEventListener("pointerdown", (e) => {
        e.preventDefault(); ac();
        if (e.button === 2) { keys.a = true; sendInput(); }
        else { keys.j = true; sendInput(); }
    });
    const cvUp = (e) => { if (e.button === 2) keys.a = false; else keys.j = false; sendInput(); };
    el.cv.addEventListener("pointerup", cvUp);
    el.cv.addEventListener("pointerleave", () => { keys.j = false; keys.a = false; sendInput(); });
    el.stage.addEventListener("contextmenu", (e) => e.preventDefault());

    /* tombol virtual multi-touch */
    const heldPointers = new Map();
    el.touch.addEventListener("pointerdown", (e) => {
        const b = e.target.closest("[data-tc]"); if (!b) return;
        e.preventDefault(); e.stopPropagation(); ac();
        try { b.setPointerCapture(e.pointerId); } catch (err) { }
        heldPointers.set(e.pointerId, b.dataset.tc);
        keys[b.dataset.tc] = true; b.classList.add("held"); sendInput();
    });
    const touchEnd = (e) => {
        const k = heldPointers.get(e.pointerId); if (!k) return;
        heldPointers.delete(e.pointerId);
        if (![...heldPointers.values()].includes(k)) {
            keys[k] = false;
            const b = el.touch.querySelector(`[data-tc="${k}"]`); if (b) b.classList.remove("held");
            sendInput();
        }
    };
    el.touch.addEventListener("pointerup", touchEnd);
    el.touch.addEventListener("pointercancel", touchEnd);
    function refreshTouch() {
        el.touch.classList.toggle("show", touchForce);
        el.foot.textContent = touchForce
            ? "Sentuh: ◀▶ gerak · ⤒ lompat (2×) · ▼ merunduk · ACT takedown · SMK asap · STN batu. Ketuk layar = lompat."
            : "Keyboard: A/D gerak · Space lompat ganda · S merunduk · E takedown · 1 asap · 2 batu · klik kiri lompat, klik kanan takedown.";
    }
    refreshTouch();

    /* klik UI */
    function toggleHelp() {
        const opening = el.ovHelp.hidden;
        el.ovHelp.hidden = !opening;
        if (!online && S.phase === "run") { if (opening) S.pausedByHelp = true; else if (S.pausedByHelp) { S.pausedByHelp = false; } }
    }
    function togglePause() {
        if (online || !S) return;
        if (S.phase === "run") { S.phase = "pause"; el.ovPause.hidden = false; }
        else if (S.phase === "pause") { S.phase = "run"; el.ovPause.hidden = true; }
    }
    function toggleSound() { muted = !muted; el.soundBtn.textContent = muted ? "🔇" : "🔊"; el.soundBtn.classList.toggle("on", !muted); try { localStorage.setItem("snMuted", muted ? "1" : "0"); } catch (e) { } }
    el.soundBtn.textContent = muted ? "🔇" : "🔊";

    function handleClick(e) {
        const b = e.target.closest("[data-act]"); if (!b) return;
        const a = b.dataset.act; ac(); snd.click();
        if (a === "exit") { onExit(); return; }
        if (a === "help") toggleHelp();
        else if (a === "help-close") toggleHelp();
        else if (a === "sound") toggleSound();
        else if (a === "touch") { touchForce = !touchForce; refreshTouch(); b.classList.toggle("on", touchForce); }
        else if (a === "cheat" && !online) el.ovCheat.hidden = !el.ovCheat.hidden;
        else if (a === "cheat-close") el.ovCheat.hidden = true;
        else if (a === "pause") togglePause();
        else if (a === "resume") togglePause();
        else if (a === "solo" && !online) startMatch("solo", curSeed);
        else if (a === "bot" && !online) startMatch("bot", curSeed);
        else if (a === "online" && online && isHost) startMatch("online", curSeed);
        else if (a === "shuffle" && (!online || isHost)) { curSeed = randomSeed(); S = menuState(); showMenu(); publish(true); }
        else if (a === "retry" && (!online || isHost) && S.phase !== "menu") startMatch(S.kind, curSeed);
        else if (a === "again" && (!online || isHost)) startMatch(S.kind, curSeed);
        else if (a === "new" && (!online || isHost)) startMatch(S.kind, randomSeed());
        else if (a === "menu") { S = menuState(); showMenu(); publish(true); }
        else if (a === "tp-scroll" && cheatActive()) { const r = myRacer(); if (r) { r.x = L.scroll.x - 20; r.y = GY; r.vy = 0; S.cheated = true; } }
        else if (a === "tp-gate" && cheatActive()) { const r = myRacer(); if (r) { r.x = L.gate.x - 40; r.y = GY; r.vy = 0; S.cheated = true; } }
        else if (a === "win" && cheatActive()) { const r = myRacer(); if (r && S.phase === "run") { S.cheated = true; r.scroll = true; S.scrollTaken = r.seat; r.finished = true; endMatch(r.seat); } }
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", (e) => {
        const c = e.target.closest("[data-cheat]"); if (!c || online) return;
        cheats[c.dataset.cheat] = c.checked;
        if (c.checked && S) S.cheated = true;
    });

    /* ================= loop utama ================= */
    function frame(t) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = t;
        let dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;
        if (!S || !L) return;
        menuT += dt;
        /* partikel & daun ambient (kosmetik, semua mode) */
        leafT -= dt;
        if (leafT <= 0 && !reduceMotion) { leafT = 0.8 + Math.random(); parts.push({ x: camX + Math.random() * VW, y: -10, vx: -20 - Math.random() * 30, vy: 40 + Math.random() * 30, t: 0, life: 6, col: Math.random() < 0.5 ? "#155e6b" : "#7f1d1d", size: 2.5, kind: "leaf" }); }
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === "conf" || p.kind === "dust" || p.kind === "poof") p.vy += 500 * dt; if (p.kind === "leaf") p.x += Math.sin(p.t * 3) * 20 * dt; }
        parts = parts.filter((p) => p.t < p.life && p.y < VH + 60);

        if (hitstop > 0) hitstop -= dt;
        else if (S.phase === "count") {
            S.count -= dt;
            if (S.count <= 0) { S.phase = "run"; el.count.hidden = true; publish(true); }
        } else if (S.phase === "run") {
            if (online && !isHost) guestFrame(dt);
            else if (!(S.pausedByHelp && !el.ovHelp.hidden)) simulate(dt);
        } else if (S.phase === "menu") {
            for (const g of S.guards) stepGuard(g, dt); // attract mode
        } else if (S.phase === "pause" || S.phase === "end") {
            if (online && !isHost) guestFrame(0.0001);
        }
        /* heartbeat input guest (keepalive autopilot) */
        hbT += dt;
        if (online && !isHost && hbT > 1) { hbT = 0; if (S.phase === "run") sendInput(); }
        draw();
        hudT += dt;
        if (hudT > 0.1) { hudT = 0; hud(); }
        if (online && isHost && (S.phase === "run" || S.phase === "count")) publish(false);
    }

    /* ================= inisialisasi ================= */
    S = menuState();
    showMenu();
    hud();
    const unsubs = [];
    if (online) {
        try {
            const u1 = room.onRoom((nextRoom) => {
                roomData = nextRoom;
                try {
                    const ps = roomData?.players;
                    const arr = Array.isArray(ps) ? ps : ps && typeof ps === "object" ? Object.values(ps) : [];
                    const o = arr.find((p) => p && p.name && p.name !== playerName);
                    if (o) oppName = String(o.name).slice(0, 12);
                } catch (err) { }
            });
            if (typeof u1 === "function") unsubs.push(u1);
            if (isHost) {
                const u2 = room.onAction((action) => applyAction(action, 1));
                if (typeof u2 === "function") unsubs.push(u2);
                publish(true);
            } else {
                const u3 = room.onState((nextState) => applySnap(nextState));
                if (typeof u3 === "function") unsubs.push(u3);
            }
        } catch (e) { console.warn(e); }
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            root.removeEventListener("click", handleClick);
            for (const u of unsubs) { try { u(); } catch (e) { } }
            if (AC) { try { AC.close(); } catch (e) { } AC = null; }
            heldPointers.clear(); parts = [];
            root.innerHTML = "";
        },
    };
}