/* ==== circuit-sprint.js ==== */
/*
 * Circuit Sprint — template-compliant (META + mount).
 * id harus sama dengan nama file tanpa .js.
 * Setelah mengubah file ini, jalankan: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "circuit-sprint",
    name: "Circuit Sprint",
    category: "racing",
    catLabel: "Racing",
    desc: "Sprint three laps against bots or a friend on five hand-built circuits.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17h24a7.5 7.5 0 0 1 0 14H12a7.5 7.5 0 0 1 0-14Z"/><path d="M17 20.5h14a3.5 3.5 0 0 1 0 7H17a3.5 3.5 0 0 1 0-7Z"/><path d="M24 12v5M24 31v5"/></svg>',
    bg: ["#334155", "#0f172a"],
    bestKey: "circuitSprintBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    const isHost = !online || room.isHost; // sisi authoritative (AI mode = host)
    let roomData = room?.room || null;

    /* ---------------- constants ---------------- */
    const W = 880, H = 520, HALF = 40;
    const LAPS = 3, GATES = 10, GATE_R = 85;
    const GRIP = 240, STEER_RATE = 3.0;
    const COAST = 22, GRASS_CAP = 90, GRASS_DRAG = 340;
    const COLORS = ["#3b82f6", "#f97316", "#22c55e"];
    const STEP = 1000 / 120;
    const TAU = Math.PI * 2;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
    const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };

    /* ---------------- curated tracks (semua dijamin completable) ---------------- */
    const TRACKS = [
        { id: "oval", name: "Oval", pts: [[250, 440], [440, 440], [630, 440], [720, 415], [786, 350], [810, 260], [786, 170], [720, 105], [630, 80], [440, 80], [250, 80], [160, 105], [94, 170], [70, 260], [94, 350], [160, 415]] },
        { id: "club", name: "Club", pts: [[180, 430], [460, 450], [700, 430], [780, 330], [770, 190], [660, 110], [430, 90], [220, 110], [110, 210], [100, 340]] },
        { id: "kidney", name: "Kidney", pts: [[240, 450], [440, 455], [640, 450], [790, 370], [810, 260], [770, 150], [620, 90], [440, 170], [260, 90], [110, 150], [70, 260], [90, 370]] },
        { id: "chicane", name: "Chicane", pts: [[160, 430], [440, 455], [700, 430], [790, 300], [740, 150], [600, 95], [450, 150], [300, 95], [160, 150], [90, 300]] },
        { id: "delta", name: "Delta", pts: [[440, 455], [660, 430], [790, 300], [700, 140], [440, 80], [180, 140], [90, 300], [220, 430]] },
    ];
    const TRACK_IDS = TRACKS.map((t) => t.id);
    const trackCache = {};

    function cr(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        return { x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) };
    }

    function buildTrack(def) {
        const cp = def.pts, n = cp.length, SEG = 26;
        let pts = [];
        for (let i = 0; i < n; i++)
            for (let j = 0; j < SEG; j++)
                pts.push(cr(cp[(i - 1 + n) % n], cp[i], cp[(i + 1) % n], cp[(i + 2) % n], j / SEG));
        // titik start = bagian bawah-tengah lintasan, heading ke kanan
        let bi = 0, bd = Infinity;
        pts.forEach((p, i) => { const d = (p.x - 440) ** 2 + (p.y - 462) ** 2; if (d < bd) { bd = d; bi = i; } });
        pts = pts.slice(bi).concat(pts.slice(0, bi));
        const m = pts.length;
        const seg = [], cum = [0];
        for (let i = 0; i < m; i++) { seg.push(Math.hypot(pts[(i + 1) % m].x - pts[i].x, pts[(i + 1) % m].y - pts[i].y)); if (i > 0) cum.push(cum[i - 1] + seg[i - 1]); }
        const L = cum[m - 1] + seg[m - 1];
        const tan = [], curv = [];
        for (let i = 0; i < m; i++) {
            const dx = pts[(i + 1) % m].x - pts[(i - 1 + m) % m].x, dy = pts[(i + 1) % m].y - pts[(i - 1 + m) % m].y;
            const d = Math.hypot(dx, dy) || 1;
            tan.push({ x: dx / d, y: dy / d });
        }
        for (let i = 0; i < m; i++) {
            const da = wrapA(Math.atan2(tan[(i + 1) % m].y, tan[(i + 1) % m].x) - Math.atan2(tan[(i - 1 + m) % m].y, tan[(i - 1 + m) % m].x));
            curv.push(Math.abs(da) / (seg[(i - 1 + m) % m] + seg[i]));
        }
        const idxAt = (s) => { s = ((s % L) + L) % L; let lo = 0, hi = m - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; } return lo; };
        const gates = [];
        for (let g = 0; g < GATES; g++) gates.push(pts[idxAt((g * L) / GATES)]);
        return { id: def.id, name: def.name, pts, seg, cum, L, m, tan, curv, gates, idxAt };
    }

    function getTrack(id) {
        if (!trackCache[id]) trackCache[id] = buildTrack(TRACKS.find((t) => t.id === id) || TRACKS[0]);
        return trackCache[id];
    }

    function pointAt(T, s) {
        s = ((s % T.L) + T.L) % T.L;
        const i = T.idxAt(s), t = T.seg[i] > 0 ? (s - T.cum[i]) / T.seg[i] : 0;
        const a = T.pts[i], b = T.pts[(i + 1) % T.m];
        const tx = T.tan[i].x, ty = T.tan[i].y;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx, ty, nx: -ty, ny: tx };
    }

    function nearest(T, x, y, hint) {
        let best = Infinity, bi = hint;
        for (let o = -50; o <= 50; o++) {
            const i = (hint + o + T.m) % T.m;
            const d = (T.pts[i].x - x) ** 2 + (T.pts[i].y - y) ** 2;
            if (d < best) { best = d; bi = i; }
        }
        if (best > 19600) for (let i = 0; i < T.m; i++) {
            const d = (T.pts[i].x - x) ** 2 + (T.pts[i].y - y) ** 2;
            if (d < best) { best = d; bi = i; }
        }
        return { i: bi, d: Math.sqrt(best), s: T.cum[bi] };
    }

    /* ---------------- state ---------------- */
    let active = true;
    let state = null;          // canonical (host) / replica (guest)
    let disp = null;           // guest: posisi display yang dihaluskan
    let recvTime = 0;          // guest: waktu terima state terakhir
    let guestCtl = { u: 0, d: 0, s: 0 }; // host: input guest terakhir
    let localCtl = { up: false, down: false, steer: 0 };
    let topSpeed = 0, cheated = false;
    let rafId = 0, lastT = 0, acc = 0, lastPub = 0, lastSend = 0, lastSentKey = "";
    let hiddenTimer = 0;
    const unsubs = [];
    const cheats = { turbo: false, grip: false, grass: false, slow: false, ghost: false, auto: false };
    const keys = new Set();
    const mouse = { down: false, right: false, x: 0, y: 0 };
    const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0, steer: 0, brake: false, second: false };

    const myIdx = () => (online && state && state.seats ? state.seats[playerIndex] : 0);
    const anyCheat = () => Object.values(cheats).some(Boolean);

    function initialState() {
        return {
            v: 1, phase: "setup", track: "oval", pick: "oval",
            seats: online ? [0, 1] : [0],
            names: online ? [String(playerName).slice(0, 18), "Guest"] : ["You"],
            karts: [], countMs: 0, raceMs: 0, results: null,
        };
    }

    function makeKarts() {
        const T = getTrack(state.track);
        const perm = shuffle([0, 1, 2]);                 // grid acak: siapa yang start paling depan
        state.seats = online ? shuffle([0, 1]) : [0];    // seat acak saat multiplayer
        const tops = [260, 260, 260];
        if (online) { const bot = [0, 1, 2].find((i) => !state.seats.includes(i)); tops[bot] = 218; }
        else { tops[1] = 226; tops[2] = 213; }
        const slots = [[140, -0.35], [95, 0.35], [50, -0.35]];
        return [0, 1, 2].map((i) => {
            const [s, off] = slots[perm[i]];
            const p = pointAt(T, s);
            return {
                x: p.x + p.nx * off * HALF, y: p.y + p.ny * off * HALF,
                h: Math.atan2(p.ty, p.tx), sp: 0, steer: 0,
                lap: 0, gate: 1, idx: T.idxAt(s), s, off: 0, prog: s,
                fin: false, finMs: 0, top: tops[i],
            };
        });
    }

    function kartName(i) {
        if (!online) return i === 0 ? "You" : "Bot " + i;
        const actor = state.seats.indexOf(i);
        return actor >= 0 ? state.names[actor] || "Player" : "Bot";
    }

    /* ---------------- DOM + CSS (minimalist, scoped) ---------------- */
    root.innerHTML = `
<style>
.cs-root{color:#e7e9ee;font-size:14px}
.cs-root [hidden]{display:none!important}
.cs-root .game-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.cs-root .game-intro h2{margin:0;font-size:18px;font-weight:650;letter-spacing:.2px}
.cs-root .game-panel{padding:0;background:none;border:0}
.cs-stage{position:relative;width:100%;max-width:940px;margin-inline:auto;aspect-ratio:880/520}
.cs-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:16px;background:#101418;border:1px solid #ffffff12;touch-action:none;cursor:crosshair}
.cs-hud{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none;z-index:2}
.cs-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;background:#0b0d10b8;border:1px solid #ffffff14;backdrop-filter:blur(4px);font-size:12px;color:#9aa1ad;letter-spacing:.3px}
.cs-chip b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums}
.cs-dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.cs-overlay{position:absolute;inset:0;display:grid;place-items:center;background:#0b0d10c9;backdrop-filter:blur(6px);border-radius:16px;z-index:3}
.cs-card{display:grid;gap:14px;justify-items:center;text-align:center;padding:24px;max-width:440px}
.cs-kicker{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#9aa1ad}
.cs-title{font-size:30px;font-weight:700;margin:0}
.cs-sub{font-size:13px;color:#9aa1ad;margin:0;font-variant-numeric:tabular-nums}
.cs-tracks{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.cs-track{padding:7px 15px;border-radius:999px;border:1px solid #ffffff1f;background:#ffffff08;color:#dfe4ea;font-size:12.5px;cursor:pointer;transition:border-color .15s,background .15s}
.cs-track:hover{border-color:#ffffff3d}
.cs-track.on{border-color:#3b82f6;background:#3b82f61f;color:#fff}
.cs-btn{padding:10px 24px;border-radius:12px;border:0;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:filter .15s}
.cs-btn:hover{filter:brightness(1.1)}
.cs-btn.ghost{background:transparent;border:1px solid #ffffff22;color:#dfe4ea;font-weight:500}
.cs-btn.ghost:hover{border-color:#ffffff40;filter:none}
.cs-rows{display:grid;gap:6px;width:250px}
.cs-row{display:flex;align-items:center;gap:9px;font-size:13px}
.cs-row .cs-pos{width:22px;color:#9aa1ad;font-variant-numeric:tabular-nums}
.cs-row .cs-name{flex:1;text-align:left}
.cs-row .cs-time{color:#9aa1ad;font-variant-numeric:tabular-nums}
.cs-cheats{position:absolute;top:46px;right:10px;width:228px;background:#0d1014f2;border:1px solid #ffffff18;border-radius:14px;padding:14px;display:grid;gap:10px;z-index:4}
.cs-cheats-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9aa1ad}
.cs-cheats-close{background:none;border:0;color:#9aa1ad;font-size:16px;cursor:pointer;padding:0 2px}
.cs-cheat{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;cursor:pointer}
.cs-cheat input{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:999px;background:#ffffff22;position:relative;cursor:pointer;transition:background .15s;flex:none;margin:0}
.cs-cheat input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.cs-cheat input:checked{background:#3b82f6}
.cs-cheat input:checked::after{transform:translateX(16px)}
.cs-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.cs-actions .spacer{flex:1}
.cs-note{font-size:12.5px;color:#9aa1ad}
@media (max-width:560px){.cs-chip{font-size:11px;padding:3px 8px}.cs-title{font-size:24px}}
</style>
<div class="game-app cs-root">
  <div class="game-intro">
    <div><h2>Circuit Sprint</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="cs-stage" data-stage>
      <canvas data-canvas></canvas>
      <div class="cs-hud">
        <span class="cs-chip">Lap <b data-hud="lap">1/${LAPS}</b></span>
        <span class="cs-chip">Pos <b data-hud="pos">–</b></span>
        <span class="cs-chip">Speed <b data-hud="spd">0</b></span>
        <span class="cs-chip">Time <b data-hud="time">0.0</b></span>
        <span class="cs-chip"><i class="cs-dot" data-seat-dot></i><b data-seat-name>You</b></span>
      </div>
      <div class="cs-overlay" data-ov="setup">
        <div class="cs-card">
          <span class="cs-kicker">Select circuit</span>
          <div class="cs-tracks" data-tracks></div>
          <span class="cs-note" data-best>Best —</span>
          <button class="cs-btn" type="button" data-act="start" data-start>Start race</button>
          <span class="cs-note" data-wait hidden>Waiting for host…</span>
        </div>
      </div>
      <div class="cs-overlay" data-ov="over" hidden>
        <div class="cs-card">
          <span class="cs-kicker">Race result</span>
          <h3 class="cs-title" data-res-title>P1</h3>
          <p class="cs-sub" data-res-stats></p>
          <div class="cs-rows" data-rows></div>
          <div style="display:flex;gap:8px">
            <button class="cs-btn" type="button" data-act="restart">Race again</button>
            <button class="cs-btn ghost" type="button" data-act="setup">Circuits</button>
          </div>
        </div>
      </div>
      <div class="cs-cheats" data-cheats hidden>
        <div class="cs-cheats-head"><span>Cheats</span><button class="cs-cheats-close" type="button" data-cheats-close aria-label="Close">✕</button></div>
        <label class="cs-cheat"><span>Turbo engine</span><input type="checkbox" data-cheat="turbo"></label>
        <label class="cs-cheat"><span>Perfect grip</span><input type="checkbox" data-cheat="grip"></label>
        <label class="cs-cheat"><span>Grass grip</span><input type="checkbox" data-cheat="grass"></label>
        <label class="cs-cheat"><span>Slow bots</span><input type="checkbox" data-cheat="slow"></label>
        <label class="cs-cheat"><span>Ghost mode</span><input type="checkbox" data-cheat="ghost"></label>
        <label class="cs-cheat"><span>Autopilot</span><input type="checkbox" data-cheat="auto"></label>
      </div>
    </div>
  </section>
  <div class="game-actions cs-actions">
    <button class="cs-btn ghost" type="button" data-cheats-toggle data-cheats-btn>Cheats</button>
    <button class="cs-btn ghost" type="button" data-act="restart">Restart</button>
    <span class="spacer"></span>
    <button class="game-action-button cs-btn ghost" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const $ = (s) => root.querySelector(s);
    const stage = $("[data-stage]");
    const canvas = $("[data-canvas]");
    const ctx = canvas.getContext("2d");
    const hud = { lap: $('[data-hud="lap"]'), pos: $('[data-hud="pos"]'), spd: $('[data-hud="spd"]'), time: $('[data-hud="time"]') };
    const seatDot = $("[data-seat-dot]"), seatName = $("[data-seat-name]");
    const ovSetup = $('[data-ov="setup"]'), ovOver = $('[data-ov="over"]');
    const tracksEl = $("[data-tracks]"), bestEl = $("[data-best]");
    const startBtn = $("[data-start]"), waitNote = $("[data-wait]");
    const resTitle = $("[data-res-title]"), resStats = $("[data-res-stats]"), rowsEl = $("[data-rows]");
    const cheatsPanel = $("[data-cheats]"), cheatsBtn = $("[data-cheats-btn]");
    const statusEl = $("[data-status]");

    tracksEl.innerHTML =
        TRACKS.map((t) => `<button class="cs-track" type="button" data-track="${t.id}">${t.name}</button>`).join("") +
        `<button class="cs-track" type="button" data-track="random">Random</button>`;

    /* ---------------- canvas / static track layer ---------------- */
    let staticLayer = null, staticDirty = true, staticTrack = "";
    let scale = 1;

    function rr(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function resize() {
        const cssW = stage.clientWidth || 880;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssW * dpr * (H / W));
        scale = canvas.width / W;
        staticDirty = true;
    }

    function rebuildStatic() {
        const T = getTrack(state ? state.track : "oval");
        staticLayer = document.createElement("canvas");
        staticLayer.width = canvas.width; staticLayer.height = canvas.height;
        const c = staticLayer.getContext("2d");
        c.setTransform(scale, 0, 0, scale, 0, 0);
        c.fillStyle = "#101418"; c.fillRect(0, 0, W, H);
        const path = new Path2D();
        path.moveTo(T.pts[0].x, T.pts[0].y);
        for (let i = 1; i < T.m; i++) path.lineTo(T.pts[i].x, T.pts[i].y);
        path.closePath();
        c.lineJoin = "round"; c.lineCap = "round";
        c.strokeStyle = "#c9d1d9"; c.lineWidth = HALF * 2 + 6; c.stroke(path);
        c.strokeStyle = "#262c35"; c.lineWidth = HALF * 2; c.stroke(path);
        // curbs hanya di tikungan tajam
        for (let i = 0; i < T.m; i += 2) {
            if (T.curv[i] < 0.0075) continue;
            const p = T.pts[i], t = T.tan[i], nx = -t.y, ny = t.x;
            c.strokeStyle = (i >> 1) % 2 ? "#dc2626" : "#e8ecf2";
            c.lineWidth = 6;
            for (const side of [-1, 1]) {
                const ox = p.x + nx * side * (HALF + 2), oy = p.y + ny * side * (HALF + 2);
                c.beginPath();
                c.moveTo(ox - t.x * T.seg[i], oy - t.y * T.seg[i]);
                c.lineTo(ox + t.x * T.seg[i], oy + t.y * T.seg[i]);
                c.stroke();
            }
        }
        c.strokeStyle = "#ffffff29"; c.lineWidth = 2; c.setLineDash([16, 22]); c.stroke(path); c.setLineDash([]);
        // garis start kotak-kotak
        const sp = pointAt(T, 0);
        c.save();
        c.translate(sp.x, sp.y); c.rotate(Math.atan2(sp.ty, sp.tx));
        for (let col = 0; col < 2; col++) for (let r = 0; r < 8; r++) {
            c.fillStyle = (col + r) % 2 ? "#12161d" : "#eef2f7";
            c.fillRect(-10 + col * 10, -HALF + r * 10, 10, 10);
        }
        c.restore();
        staticDirty = false; staticTrack = T.id;
    }

    function drawKart(k, color, mine) {
        ctx.save();
        ctx.translate(k.x, k.y); ctx.rotate(k.h);
        if (mine) { ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(1, 3, 15, 8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#0d1117";
        for (const [wx, wy] of [[-11, -9], [-11, 6], [6, -9], [6, 6]]) ctx.fillRect(wx, wy, 6, 3);
        rr(ctx, -13, -7, 26, 14, 5); ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = "#0b0d10"; ctx.lineWidth = 1.5; ctx.stroke();
        rr(ctx, 8, -5, 5, 10, 2); ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fill();
        rr(ctx, -5, -4, 9, 8, 3); ctx.fillStyle = "rgba(11,13,16,.6)"; ctx.fill();
        ctx.restore();
    }

    /* ---------------- physics + AI ---------------- */
    function playerStats() {
        return {
            max: cheats.turbo ? 330 : 260, accel: cheats.turbo ? 230 : 150,
            brake: 300, grip: cheats.grip ? 560 : GRIP, grassCap: cheats.grass ? 210 : GRASS_CAP,
        };
    }

    function aiControl(k, ki) {
        const T = getTrack(state.track);
        const aim = pointAt(T, k.s + 70 + k.sp * 0.33);
        const t = T.tan[k.idx];
        let shift = Math.sin(k.s * 0.008 + ki * 2.4) * 0.3 * HALF;
        for (const o of state.karts) {
            if (o === k) continue;
            const dx = o.x - k.x, dy = o.y - k.y;
            const fwd = dx * Math.cos(k.h) + dy * Math.sin(k.h);
            const lat = -dx * Math.sin(k.h) + dy * Math.cos(k.h);
            if (fwd > 0 && fwd < 70 && Math.abs(lat) < 26) shift += (lat > 0 ? -1 : 1) * 0.55 * HALF;
        }
        const ax = aim.x - t.y * shift, ay = aim.y + t.x * shift;
        const steer = clamp(wrapA(Math.atan2(ay - k.y, ax - k.x) - k.h) * 2.5, -1, 1);
        let kmax = 1e-4;
        for (let ss = k.s + 15; ss < k.s + 60 + k.sp * 0.55; ss += 15) kmax = Math.max(kmax, T.curv[T.idxAt(ss)]);
        let top = k.top;
        if (!online && ki !== 0) {
            top += clamp((state.karts[0].prog - k.prog) / 60, -12, 14); // rubber-band halus
            if (cheats.slow) top *= 0.72;
        }
        const vT = clamp(Math.sqrt((GRIP * 0.9) / kmax), 95, top);
        return { up: k.sp < vT - 2, down: k.sp > vT + 6, steer };
    }

    function physics(k, ctl, dt, human) {
        const T = getTrack(state.track);
        const st = human ? playerStats() : { max: k.top, accel: 110, brake: 260, grip: GRIP, grassCap: GRASS_CAP };
        k.steer += (ctl.steer - k.steer) * Math.min(1, dt * 12);
        if (ctl.up) k.sp += st.accel * dt; else k.sp -= COAST * dt;
        if (ctl.down) k.sp -= st.brake * dt;
        if (k.sp < 0) k.sp = 0;
        const cap = k.off > HALF ? st.grassCap : st.max;
        if (k.sp > cap) k.sp = Math.max(cap, k.sp - GRASS_DRAG * dt);
        // grip limit: belok terlalu cepat di speed tinggi = understeer (melebar), BUKAN spin
        let w = k.steer * STEER_RATE;
        const wm = st.grip / Math.max(k.sp, 50);
        w = clamp(w, -wm, wm);
        k.h += w * dt;
        k.sp -= Math.abs(w) * k.sp * 0.06 * dt;
        k.x = clamp(k.x + Math.cos(k.h) * k.sp * dt, 12, W - 12);
        k.y = clamp(k.y + Math.sin(k.h) * k.sp * dt, 12, H - 12);
        const nr = nearest(T, k.x, k.y, k.idx);
        k.idx = nr.i; k.off = nr.d; k.s = nr.s;
        const g = T.gates[k.gate];
        if ((k.x - g.x) ** 2 + (k.y - g.y) ** 2 < GATE_R * GATE_R) {
            if (k.gate === 0) {
                k.lap++; k.gate = 1;
                if (k.lap >= LAPS) { k.fin = true; k.finMs = state.raceMs; }
            } else k.gate = (k.gate + 1) % GATES;
        }
        k.prog = k.lap * T.L + (k.s > T.L - 100 ? k.s - T.L : k.s);
    }

    function stepSim(dt) {
        if (state.phase === "count") {
            state.countMs -= dt * 1000;
            if (state.countMs <= 0) { state.phase = "race"; state.raceMs = 0; publishNow(); syncOverlays(); }
            return;
        }
        if (state.phase !== "race") return;
        state.raceMs += dt * 1000;
        const my = myIdx();
        const ctls = state.karts.map((k, i) => {
            if (i === my) return !online && cheats.auto ? aiControl(k, i) : localCtl;
            if (online && i === state.seats[1]) return { up: !!guestCtl.u, down: !!guestCtl.d, steer: guestCtl.s };
            return aiControl(k, i);
        });
        state.karts.forEach((k, i) => {
            if (k.fin) return;
            const human = i === my || (online && state.seats.includes(i));
            physics(k, ctls[i], dt, human);
        });
        // tabrakan antar kart
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
            if (!online && cheats.ghost && (i === 0 || j === 0)) continue;
            const a = state.karts[i], b = state.karts[j];
            const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
            if (d > 0.01 && d < 30) {
                const push = (30 - d) / 2, ux = dx / d, uy = dy / d;
                a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push;
                a.sp *= 0.97; b.sp *= 0.97;
            }
        }
        if (state.karts[my].sp > topSpeed) topSpeed = state.karts[my].sp;
        if (state.karts.some((k) => k.fin)) endRace();
    }

    /* ---------------- flow ---------------- */
    function readBest(id) {
        try { const v = parseFloat(localStorage.getItem(META.bestKey + ":" + id)); return isFinite(v) ? v : null; } catch { return null; }
    }
    function saveBest() {
        if (online || cheated) return;
        const my = myIdx();
        if (!state.karts[my].fin || state.results.order[0].i !== my) return;
        const t = state.raceMs / 1000;
        try {
            const prev = readBest(state.track);
            if (prev === null || t < prev) localStorage.setItem(META.bestKey + ":" + state.track, t.toFixed(1));
            const all = parseFloat(localStorage.getItem(META.bestKey));
            if (!isFinite(all) || t < all) localStorage.setItem(META.bestKey, t.toFixed(1));
        } catch { /* storage tidak tersedia */ }
    }

    function startRace() {
        state.track = state.pick === "random" ? TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)] : state.pick;
        state.karts = makeKarts();
        state.phase = "count"; state.countMs = 3000; state.raceMs = 0; state.results = null;
        topSpeed = 0; cheated = anyCheat(); acc = 0;
        staticDirty = true;
        publishNow(); syncOverlays();
    }

    function endRace() {
        state.phase = "over";
        const order = [0, 1, 2].sort((a, b) => {
            const ka = state.karts[a], kb = state.karts[b];
            if (ka.fin && kb.fin) return ka.finMs - kb.finMs;
            if (ka.fin) return -1; if (kb.fin) return 1;
            return kb.prog - ka.prog;
        });
        state.results = { order: order.map((i) => ({ i, ms: state.karts[i].fin ? state.karts[i].finMs : null })) };
        saveBest();
        publishNow(); syncOverlays();
    }

    function toSetup() {
        state.phase = "setup";
        state.karts = makeKarts();
        publishNow(); syncOverlays();
    }

    /* ---------------- networking (pola template) ---------------- */
    function serialize() {
        const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
        return {
            v: 1, phase: state.phase, track: state.track, pick: state.pick,
            seats: state.seats, names: state.names,
            countMs: Math.round(state.countMs), raceMs: Math.round(state.raceMs), results: state.results,
            karts: state.karts.map((k) => ({ x: r1(k.x), y: r1(k.y), h: r3(k.h), sp: r1(k.sp), lap: k.lap, gate: k.gate, idx: k.idx, s: r1(k.s), off: r1(k.off), prog: r1(k.prog), fin: k.fin, finMs: Math.round(k.finMs), top: k.top })),
        };
    }
    function publish() { if (online && isHost && active && state) room.publishState(serialize()).catch(console.warn); }
    function publishNow() { lastPub = performance.now(); publish(); }
    function publishThrottled(ts) { if (ts - lastPub >= 100 && state && state.phase !== "setup") { lastPub = ts; publish(); } }

    function applyAction(a, actor) {
        if (!a || typeof a !== "object" || !state) return;
        if (a.t === "input" && actor === 1) { guestCtl = { u: a.u ? 1 : 0, d: a.d ? 1 : 0, s: clamp(+a.s || 0, -1, 1) }; return; }
        if (a.t === "hello" && actor === 1) { state.names[1] = String(a.name || "Guest").slice(0, 18); publishNow(); return; }
        if (a.t === "track" && state.phase === "setup" && (TRACK_IDS.includes(a.id) || a.id === "random")) {
            state.pick = a.id;
            if (a.id !== "random") { state.track = a.id; state.karts = makeKarts(); staticDirty = true; }
            publishNow(); syncOverlays(); return;
        }
        if (a.t === "start" && state.phase === "setup") { startRace(); return; }
        if (a.t === "restart" && state.phase !== "count") { startRace(); return; }
        if (a.t === "setup" && state.phase === "over") { toSetup(); return; }
    }

    function submitAction(a) {
        if (online && !isHost) { room.sendAction(a).catch(console.warn); return; }
        applyAction(a, playerIndex);
    }

    /* ---------------- input: keyboard + mouse + touch (tanpa virtual button) ---------------- */
    const KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", W: "up", s: "down", S: "down", a: "left", A: "left", d: "right", D: "right", " ": "brake" };

    function onKeyDown(e) {
        if (!active) return;
        const k = KEYMAP[e.key];
        if (k) { if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault(); keys.add(k); return; }
        if (e.repeat) return;
        if (e.key === "Enter" && state) { if (state.phase === "setup") submitAction({ t: "start" }); else if (state.phase === "over") submitAction({ t: "restart" }); }
        else if ((e.key === "r" || e.key === "R") && state && state.phase !== "count") submitAction({ t: "restart" });
        else if ((e.key === "c" || e.key === "C") && !online) cheatsPanel.hidden = !cheatsPanel.hidden;
        else if (e.key === "Escape") cheatsPanel.hidden = true;
    }
    function onKeyUp(e) { const k = KEYMAP[e.key]; if (k) keys.delete(k); }
    function onBlur() { keys.clear(); mouse.down = mouse.right = false; touch.id = null; touch.brake = touch.second = false; }

    function worldPos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    }

    function onPointerDown(e) {
        if (!active) return;
        e.preventDefault();
        canvas.setPointerCapture?.(e.pointerId);
        const p = worldPos(e);
        if (e.pointerType === "touch") {
            if (touch.id === null) { touch.id = e.pointerId; touch.ox = touch.x = p.x; touch.oy = touch.y = p.y; touch.steer = 0; touch.brake = false; }
            else { touch.second = true; touch.brake = true; }
        } else {
            if (e.button === 2) mouse.right = true; else mouse.down = true;
            mouse.x = p.x; mouse.y = p.y;
        }
    }
    function onPointerMove(e) {
        const p = worldPos(e);
        if (e.pointerType === "touch") {
            if (e.pointerId !== touch.id) return;
            touch.x = p.x; touch.y = p.y;
            touch.steer = clamp((p.x - touch.ox) / 70, -1, 1);
            touch.brake = p.y - touch.oy > 55 || touch.second;
        } else { mouse.x = p.x; mouse.y = p.y; }
    }
    function onPointerUp(e) {
        if (e.pointerType === "touch") {
            if (e.pointerId === touch.id) { touch.id = null; touch.steer = 0; touch.brake = touch.second; }
            else { touch.second = false; touch.brake = touch.id !== null && touch.y - touch.oy > 55; }
        } else { if (e.button === 2) mouse.right = false; else mouse.down = false; }
    }
    function onCtx(e) { e.preventDefault(); }

    function readPlayerCtl() {
        if (!state || !state.karts.length) return { up: false, down: false, steer: 0 };
        const k = state.karts[myIdx()];
        let steer = 0;
        const kd = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
        if (kd !== 0) steer = kd;
        else if (mouse.down) {
            const dx = mouse.x - k.x, dy = mouse.y - k.y;
            if (dx * dx + dy * dy > 676) { const d = wrapA(Math.atan2(dy, dx) - k.h); steer = Math.abs(d) < 0.05 ? 0 : clamp(d * 3, -1, 1); }
        } else if (touch.id !== null) steer = touch.steer;
        return {
            up: keys.has("up") || mouse.down || (touch.id !== null && !touch.brake),
            down: keys.has("down") || keys.has("brake") || mouse.right || touch.brake,
            steer,
        };
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("contextmenu", onCtx);

    function handleClick(e) {
        if (!active) return;
        const el = e.target.closest ? e.target.closest("[data-exit],[data-act],[data-track],[data-cheats-toggle],[data-cheats-close]") : null;
        if (!el) return;
        el.blur?.();
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.hasAttribute("data-cheats-toggle")) { cheatsPanel.hidden = !cheatsPanel.hidden; return; }
        if (el.hasAttribute("data-cheats-close")) { cheatsPanel.hidden = true; return; }
        if (el.dataset.track) { submitAction({ t: "track", id: el.dataset.track }); return; }
        if (el.dataset.act === "start") submitAction({ t: "start" });
        else if (el.dataset.act === "restart") submitAction({ t: "restart" });
        else if (el.dataset.act === "setup") submitAction({ t: "setup" });
    }
    function handleChange(e) {
        const el = e.target;
        if (el.dataset && el.dataset.cheat && !online) {
            cheats[el.dataset.cheat] = el.checked;
            if (el.checked && state && state.phase === "race") cheated = true;
        }
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);

    /* ---------------- HUD + overlays ---------------- */
    const setTxt = (el, v) => { if (el.textContent !== v) el.textContent = v; };
    const fmt = (ms) => (ms / 1000).toFixed(1) + "s";

    function updateHud(src) {
        if (!state || !state.karts.length) return;
        const my = myIdx(), k = state.karts[my];
        const progs = state.karts.map((x) => x.prog);
        const pos = 1 + progs.reduce((n, v) => n + (v > progs[my] ? 1 : 0), 0);
        setTxt(hud.lap, Math.min(k.lap + 1, LAPS) + "/" + LAPS);
        setTxt(hud.pos, pos + "/3");
        setTxt(hud.spd, String(Math.round(src[my].sp)));
        const t = state.phase === "race" && !isHost ? state.raceMs + (performance.now() - recvTime) : state.raceMs;
        setTxt(hud.time, (t / 1000).toFixed(1));
    }

    function syncOverlays() {
        if (!state) return;
        const ph = state.phase;
        ovSetup.hidden = ph !== "setup";
        ovOver.hidden = ph !== "over";
        cheatsBtn.hidden = online;
        if (online) cheatsPanel.hidden = true;
        startBtn.hidden = online && !isHost;
        waitNote.hidden = !(online && !isHost && ph === "setup");
        tracksEl.querySelectorAll(".cs-track").forEach((b) => b.classList.toggle("on", b.dataset.track === state.pick));
        const best = state.pick === "random" ? null : readBest(state.pick);
        setTxt(bestEl, best === null ? "Best —" : "Best " + best.toFixed(1) + "s");
        setTxt(statusEl, ph === "setup" ? (online ? "Lobby" : "Ready") : ph === "count" ? "Set…" : ph === "race" ? "Racing" : "Finished");
        seatDot.style.background = COLORS[myIdx()];
        setTxt(seatName, online ? state.names[playerIndex] || "You" : "You");
        if (ph === "over" && state.results) {
            const my = myIdx();
            const pos = state.results.order.findIndex((r) => r.i === my) + 1;
            setTxt(resTitle, pos === 1 ? "You win!" : "P" + pos);
            const myMs = state.karts[my].fin ? state.karts[my].finMs : state.raceMs;
            setTxt(resStats, "Time " + fmt(myMs) + " · Top " + Math.round(topSpeed));
            rowsEl.innerHTML = state.results.order.map((r, p) =>
                `<div class="cs-row"><span class="cs-pos">P${p + 1}</span><i class="cs-dot" style="background:${COLORS[r.i]}"></i><span class="cs-name">${kartName(r.i)}</span><span class="cs-time">${r.ms !== null ? fmt(r.ms) : "—"}</span></div>`
            ).join("");
        }
        if (staticTrack !== state.track) staticDirty = true;
    }

    /* ---------------- render ---------------- */
    function guestInterp(dt) {
        if (!state || !state.karts.length) return;
        if (!disp || disp.length !== state.karts.length) disp = state.karts.map((k) => ({ x: k.x, y: k.y, h: k.h, sp: k.sp }));
        const since = Math.min(0.25, (performance.now() - recvTime) / 1000);
        const f = 1 - Math.exp(-12 * dt);
        state.karts.forEach((k, i) => {
            const d = disp[i];
            if (state.phase !== "race") { d.x = k.x; d.y = k.y; d.h = k.h; d.sp = k.sp; return; }
            const tx = k.x + Math.cos(k.h) * k.sp * since, ty = k.y + Math.sin(k.h) * k.sp * since;
            d.x += (tx - d.x) * f; d.y += (ty - d.y) * f;
            d.h += wrapA(k.h - d.h) * f; d.sp += (k.sp - d.sp) * f;
        });
        const my = myIdx();
        if (disp[my].sp > topSpeed) topSpeed = disp[my].sp;
    }

    function render() {
        if (!state) return;
        if (staticDirty || !staticLayer) rebuildStatic();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(staticLayer, 0, 0);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const src = isHost ? state.karts : disp || state.karts;
        const my = myIdx();
        for (let i = 0; i < src.length; i++) if (i !== my) drawKart(src[i], COLORS[i], false);
        if (src[my]) drawKart(src[my], COLORS[my], true);
        // countdown
        const now = performance.now();
        const cm = isHost ? state.countMs : state.countMs - (now - recvTime);
        const rm = isHost ? state.raceMs : state.raceMs + (now - recvTime);
        let cd = null, alpha = 1;
        if (state.phase === "count") cd = String(clamp(Math.ceil(cm / 1000), 1, 3));
        else if (state.phase === "race" && rm < 600) { cd = "GO"; alpha = 1 - rm / 600; }
        if (cd) {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = "700 92px system-ui, sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.lineWidth = 8; ctx.strokeStyle = "#0b0d10";
            ctx.strokeText(cd, W / 2, H / 2);
            ctx.fillStyle = cd === "GO" ? "#4ade80" : "#f5f7fa";
            ctx.fillText(cd, W / 2, H / 2);
            ctx.restore();
        }
        // indikator sentuh samar (bukan tombol)
        if (touch.id !== null) {
            ctx.save();
            ctx.strokeStyle = "#ffffff2e"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 16, 0, TAU); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(touch.ox, touch.oy); ctx.lineTo(touch.x, touch.y); ctx.stroke();
            ctx.fillStyle = "#ffffff40";
            ctx.beginPath(); ctx.arc(touch.x, touch.y, 5, 0, TAU); ctx.fill();
            ctx.restore();
        }
        updateHud(src);
    }

    /* ---------------- loop ---------------- */
    function advance(ms) {
        if (!state || (state.phase !== "count" && state.phase !== "race")) return;
        localCtl = readPlayerCtl();
        acc += ms;
        let n = 0;
        while (acc >= STEP && n < 16) { stepSim(STEP / 1000); acc -= STEP; n++; if (state.phase === "over") { acc = 0; break; } }
    }

    function frame(ts) {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(100, ts - lastT || 16);
        lastT = ts;
        if (isHost) advance(dt);
        else {
            guestInterp(dt / 1000);
            // kirim input guest hanya saat berubah (hemat bandwidth)
            const c = readPlayerCtl();
            const key = (c.up ? 1 : 0) + "|" + (c.down ? 1 : 0) + "|" + Math.round(c.steer * 20);
            if (key !== lastSentKey && ts - lastSend > 30) {
                lastSentKey = key; lastSend = ts;
                submitAction({ t: "input", u: c.up ? 1 : 0, d: c.down ? 1 : 0, s: Math.round(c.steer * 100) / 100 });
            }
        }
        render();
        if (online && isHost) publishThrottled(ts);
    }

    // host: tetap simulasi saat tab hidden (rAF berhenti) agar guest tidak freeze
    function onVis() {
        if (document.hidden) {
            if (isHost && !hiddenTimer) hiddenTimer = setInterval(() => { if (active) { advance(100); if (online) publishThrottled(performance.now()); } }, 100);
        } else if (hiddenTimer) { clearInterval(hiddenTimer); hiddenTimer = 0; lastT = performance.now(); acc = 0; }
    }
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(() => resize());
    ro.observe(stage);

    /* ---------------- boot ---------------- */
    if (isHost) {
        state = initialState();
        state.karts = makeKarts();
    } else {
        state = { v: 1, phase: "setup", track: "oval", pick: "oval", seats: [0, 1], names: ["Host", "You"], karts: [], countMs: 0, raceMs: 0, results: null };
    }
    resize();
    syncOverlays();
    render();

    if (online) {
        const u1 = room.onRoom((nextRoom) => { roomData = nextRoom; });
        if (typeof u1 === "function") unsubs.push(u1);
        if (isHost) {
            publishNow();
            const u2 = room.onAction((a) => applyAction(a, 1));
            if (typeof u2 === "function") unsubs.push(u2);
        } else {
            const u3 = room.onState((next) => {
                if (!next) return;
                const trackChanged = !state || next.track !== state.track;
                state = next; recvTime = performance.now();
                if (trackChanged) staticDirty = true;
                syncOverlays();
            });
            if (typeof u3 === "function") unsubs.push(u3);
            submitAction({ t: "hello", name: playerName });
        }
    }

    lastT = performance.now();
    rafId = requestAnimationFrame(frame);

    /* ---------------- destroy ---------------- */
    return {
        destroy() {
            active = false;
            cancelAnimationFrame(rafId);
            if (hiddenTimer) clearInterval(hiddenTimer);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("blur", onBlur);
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointermove", onPointerMove);
            canvas.removeEventListener("pointerup", onPointerUp);
            canvas.removeEventListener("pointercancel", onPointerUp);
            canvas.removeEventListener("contextmenu", onCtx);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            ro.disconnect();
            unsubs.forEach((u) => { try { u(); } catch { /* noop */ } });
        },
    };
}