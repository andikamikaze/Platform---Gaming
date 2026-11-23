/*
 * sling-puck.js — Sling Puck
 * Template: export META + mount(root, context).
 * 1. META.id harus sama dengan nama file tanpa .js  → "sling-puck"
 * 2. Setelah edit: node tools/build-games-manifest.mjs
 * Mode: "ai" (lokal vs bot) dan "room" (online, host-authoritative).
 */

export const META = {
    id: "sling-puck",
    name: "Sling Puck",
    category: "board",
    catLabel: "Board",
    desc: "Lontarkan semua puck di areamu melewati celah tengah sebelum lawan mengosongkan areanya.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="38" height="38" rx="7"/><path d="M15 24h4"/><path d="M29 24h4"/><circle cx="13" cy="35" r="3.4" fill="currentColor" stroke="none"/><circle cx="22" cy="35" r="3.4" fill="currentColor" stroke="none"/><circle cx="35" cy="13" r="3.4"/><circle cx="26" cy="13" r="3.4"/><path d="M24 38v-6"/><path d="M21.5 33.5l2.5 4.5 2.5-4.5"/></svg>',
    bg: ["#dbeafe", "#bfdbfe"],
    bestKey: "slingPuckBestTime",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const playerIndex = online && !room.isHost ? 1 : 0;
    let roomData = room?.room || null;
    let state = null;

    /* ================= konstanta & helper ================= */
    const W = 400, H = 560;
    const RX1 = 14, RX2 = 386, RY1 = 14, RY2 = 546;
    const WALL_Y1 = 274, WALL_Y2 = 286, MID = 280;
    const R_PUCK = 12, FRICTION = 0.982, STOP_V = 7;
    const REST_WALL = 0.86, REST_HIT = 0.94, REST_BUMP = 0.88;
    const DT = 1 / 60, SPEED_CAP = 700, PULL_K = 3.4, N_SIDE = 5;
    const OPEN_LOCK = 1.5, PUB_MS = 80, GRAB_R = 34;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sideOf = (y) => (y > MID ? 0 : 1); // 0 = bawah, 1 = atas
    const fmt = (s) => { const t = Math.max(0, Math.floor(s)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
    const randSeed = () => (Math.random() * 0x7fffffff) | 0;

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function segDist(x1, y1, x2, y2, cx, cy) {
        const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
        const t = l2 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / l2, 0, 1) : 0;
        return Math.hypot(cx - (x1 + t * dx), cy - (y1 + t * dy));
    }
    function lineClear(x1, y1, x2, y2, bumpers, cr) {
        for (const b of bumpers) if (segDist(x1, y1, x2, y2, b.x, b.y) <= b.r + cr) return false;
        return true;
    }
    const losTargets = (gap) => [
        { x: gap[0] + 18, y: MID },
        { x: (gap[0] + gap[1]) / 2, y: MID },
        { x: gap[1] - 18, y: MID },
    ];
    const mkPuck = (x, y, o) => ({ x, y, vx: 0, vy: 0, r: R_PUCK, o });

    let best = null;
    try { const v = parseFloat(localStorage.getItem(META.bestKey)); if (isFinite(v)) best = v; } catch { }

    /* ================= generator level acak (dijamin solvable) =================
       - Celah >= 92px (>= 3,8x diameter puck), posisi & lebar diacak.
       - Bumper simetris 180 derajat; lorong dinding & antar bumper selalu muat puck.
       - Setiap puck spawn punya garis lurus bersih ke salah satu titik celah.
       - Fallback: layout klasik tanpa bumper. */
    function genLevel(level, seed) {
        const rnd = mulberry32(seed >>> 0);
        const gapW = clamp(132 - (level - 1) * 5, 92, 132) + rnd() * 8;
        const cMin = RX1 + 46 + gapW / 2, cMax = RX2 - 46 - gapW / 2;
        const gc = cMin + rnd() * (cMax - cMin);
        const gap = [gc - gapW / 2, gc + gapW / 2];
        const ts = losTargets(gap);
        const nB = Math.min(5, 1 + Math.floor((level - 1) / 2));
        for (let att = 0; att < 60; att++) {
            const bumpers = []; let ok = true;
            for (let i = 0; i < nB; i++) {
                let placed = false;
                for (let t = 0; t < 50 && !placed; t++) {
                    const r = 10 + rnd() * 6;
                    const x = RX1 + 34 + rnd() * (RX2 - RX1 - 68);
                    const y = WALL_Y2 + 56 + rnd() * (RY2 - 40 - (WALL_Y2 + 56));
                    if (x < RX1 + r + 26 || x > RX2 - r - 26) continue;
                    if (y > RY2 - r - 30) continue;
                    if (bumpers.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 56)) continue;
                    bumpers.push({ x, y, r }, { x: W - x, y: H - y, r });
                    placed = true;
                }
                if (!placed) { ok = false; break; }
            }
            if (!ok) continue;
            const pts = []; let fails = 0;
            while (pts.length < N_SIDE && fails < 400) {
                fails++;
                const x = RX1 + 30 + rnd() * (RX2 - RX1 - 60);
                const y = WALL_Y2 + 70 + rnd() * (RY2 - 46 - (WALL_Y2 + 70));
                if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < R_PUCK * 2.8)) continue;
                if (bumpers.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + R_PUCK + 10)) continue;
                if (!ts.some((t) => lineClear(x, y, t.x, t.y, bumpers, R_PUCK + 2))) continue;
                if (!ts.some((t) => lineClear(W - x, H - y, t.x, t.y, bumpers, R_PUCK + 2))) continue;
                pts.push({ x, y });
            }
            if (pts.length < N_SIDE) continue;
            const pucks = [];
            pts.forEach((p) => pucks.push(mkPuck(p.x, p.y, 0)));
            pts.forEach((p) => pucks.push(mkPuck(W - p.x, H - p.y, 1)));
            return { gap, bumpers, pucks };
        }
        const rows = [[104, 388], [200, 388], [296, 388], [152, 424], [248, 424]];
        const pucks = [];
        rows.forEach(([x, y]) => pucks.push(mkPuck(x, y, 0)));
        rows.forEach(([x, y]) => pucks.push(mkPuck(W - x, H - y, 1)));
        return { gap, bumpers: [], pucks };
    }

    /* ================= fisika (dari kode lama + bumper & celah dinamis) ================= */
    function launch(dx, dy) {
        let vx = -dx * PULL_K, vy = -dy * PULL_K;
        const s = Math.hypot(vx, vy);
        if (s > SPEED_CAP) { vx = (vx / s) * SPEED_CAP; vy = (vy / s) * SPEED_CAP; }
        return { vx, vy };
    }
    function stepWorld(pucks, gap, bumpers) {
        for (let sub = 0; sub < 2; sub++) {
            for (const b of pucks) if (b.vx || b.vy) { b.x += (b.vx * DT) / 2; b.y += (b.vy * DT) / 2; }
            for (const b of pucks) {
                const lo = RX1 + b.r, hx = RX2 - b.r, ty = RY1 + b.r, hy = RY2 - b.r;
                if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx) * REST_WALL; }
                else if (b.x > hx) { b.x = hx; b.vx = -Math.abs(b.vx) * REST_WALL; }
                if (b.y < ty) { b.y = ty; b.vy = Math.abs(b.vy) * REST_WALL; }
                else if (b.y > hy) { b.y = hy; b.vy = -Math.abs(b.vy) * REST_WALL; }
                if (!(b.y + b.r <= WALL_Y1 || b.y - b.r >= WALL_Y2)) {
                    const seg = b.x < gap[0] ? [RX1, gap[0]] : b.x > gap[1] ? [gap[1], RX2] : null;
                    if (seg) {
                        const cx = clamp(b.x, seg[0], seg[1]), cy = clamp(b.y, WALL_Y1, WALL_Y2);
                        const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
                        let nx = null, ny = 0;
                        if (d === 0) { nx = 0; ny = b.y < MID ? -1 : 1; b.y = ny < 0 ? WALL_Y1 - b.r - 0.1 : WALL_Y2 + b.r + 0.1; }
                        else if (d < b.r) { nx = dx / d; ny = dy / d; b.x = cx + nx * (b.r + 0.1); b.y = cy + ny * (b.r + 0.1); }
                        if (nx !== null) {
                            const vn = b.vx * nx + b.vy * ny;
                            if (vn < 0) { b.vx -= (1 + REST_WALL) * vn * nx; b.vy -= (1 + REST_WALL) * vn * ny; }
                        }
                    }
                }
                for (const o of bumpers) {
                    const dx = b.x - o.x, dy = b.y - o.y, rr = b.r + o.r, d2 = dx * dx + dy * dy;
                    if (d2 >= rr * rr || d2 === 0) continue;
                    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
                    b.x = o.x + nx * (rr + 0.1); b.y = o.y + ny * (rr + 0.1);
                    const vn = b.vx * nx + b.vy * ny;
                    if (vn < 0) { b.vx -= (1 + REST_BUMP) * vn * nx; b.vy -= (1 + REST_BUMP) * vn * ny; }
                }
            }
            for (let i = 0; i < pucks.length; i++) {
                const a = pucks[i];
                for (let j = i + 1; j < pucks.length; j++) {
                    const c = pucks[j];
                    const dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r, d2 = dx * dx + dy * dy;
                    if (d2 >= rr * rr || d2 === 0) continue;
                    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (rr - d) / 2;
                    a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
                    const rv = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
                    if (rv > 0) {
                        const jimp = ((1 + REST_HIT) * rv) / 2;
                        a.vx -= jimp * nx; a.vy -= jimp * ny; c.vx += jimp * nx; c.vy += jimp * ny;
                    }
                }
            }
        }
        for (const b of pucks) {
            if (b.vx || b.vy) {
                b.vx *= FRICTION; b.vy *= FRICTION;
                if (b.vx * b.vx + b.vy * b.vy < STOP_V * STOP_V) { b.vx = 0; b.vy = 0; }
            }
        }
    }
    const allStopped = (pucks) => pucks.every((b) => b.vx === 0 && b.vy === 0);
    const halfCounts = (pucks) => { const c = [0, 0]; for (const b of pucks) c[sideOf(b.y)]++; return c; };

    /* ================= DOM (minimalis, border tegas, arena lebih besar) ================= */
    root.innerHTML = `
<style>
.sp-game{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--blue:#2563eb;--red:#ef4444;--ok:#10b981;--bg:#f8fafc;--card:#fff;color:var(--ink);display:flex;flex-direction:column;gap:10px}
.sp-game .game-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 2px 0}
.sp-game .game-intro h2{margin:0;font-size:19px;font-weight:700;letter-spacing:-.01em}
.sp-game .game-intro p{margin:2px 0 0;font-size:12.5px;color:var(--mut);max-width:52ch;line-height:1.5}
.sp-game .game-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--mut);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 11px;white-space:nowrap}
.sp-game .game-status-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block}
.sp-hud{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sp-chip{font-size:11.5px;color:var(--mut);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px;display:inline-flex;gap:5px;align-items:center}
.sp-chip b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
.sp-chip.sp-you b{color:var(--blue)}.sp-chip.sp-foe b{color:var(--red)}
.sp-chip[hidden]{display:none}
.sp-game .game-panel{position:relative;background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px}
.sp-board-wrap{width:min(100%,54vh,520px);width:min(100%,54dvh,520px);aspect-ratio:400/560}
.sp-board{display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.sp-msg{min-height:17px;font-size:12px;color:var(--mut);text-align:center}
.sp-pad{display:none;width:100%;max-width:520px;gap:10px;align-items:flex-end;justify-content:center;flex-wrap:wrap}
.sp-pad.on{display:flex}
.sp-pad-group{display:flex;flex-direction:column;gap:4px;align-items:center}
.sp-pad-group>span{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.sp-pad-row{display:flex;gap:4px}
.sp-pad button{min-width:44px;min-height:44px;border:1px solid var(--line);background:var(--card);border-radius:10px;color:var(--ink);font-size:17px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none;padding:0 10px}
.sp-pad button:active{background:#eef2f7}
.sp-pad .sp-fire{min-width:88px;background:var(--blue);border-color:var(--blue);color:#fff;letter-spacing:.08em;font-size:13px}
.sp-pad .sp-fire:active{background:#1d4ed8}
.sp-ov{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.92);backdrop-filter:blur(3px);padding:14px;border-radius:16px}
.sp-ov[hidden]{display:none}
.sp-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;max-width:360px;width:100%;box-shadow:0 14px 40px rgba(15,23,42,.10);max-height:100%;overflow:auto}
.sp-card h3{margin:0 0 6px;font-size:17px}
.sp-card p{margin:0 0 10px;font-size:12.5px;color:var(--mut);line-height:1.55}
.sp-card .sp-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.sp-btn{border:1px solid var(--blue);background:var(--blue);color:#fff;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}
.sp-btn:active{background:#1d4ed8}
.sp-btn.ghost{background:var(--card);color:var(--ink);border-color:var(--line)}
.sp-btn.ghost:active{background:#eef2f7}
.sp-help h4{margin:12px 0 4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink)}
.sp-help ul{margin:0;padding-left:16px;font-size:12.5px;color:var(--mut);line-height:1.7}
.sp-help kbd{background:#f1f5f9;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;font-size:11px;font-family:inherit;color:var(--ink)}
.sp-cheat-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px;font-weight:600;cursor:pointer}
.sp-switch{position:relative;width:38px;height:22px;flex:none}
.sp-switch input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.sp-switch i{position:absolute;inset:0;background:#e2e8f0;border-radius:999px;transition:background .15s;pointer-events:none}
.sp-switch i::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.sp-switch input:checked+i{background:var(--blue)}
.sp-switch input:checked+i::after{left:19px}
.sp-game .game-actions{display:flex;flex-wrap:wrap;gap:8px}
.sp-game .game-action-button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer}
.sp-game .game-action-button:active{background:#eef2f7}
.sp-game .game-action-button[hidden]{display:none}
.sp-win{color:var(--ok)}.sp-lose{color:var(--red)}
@media (max-width:480px){.sp-game .game-intro{flex-direction:column}}
@media (prefers-reduced-motion:reduce){.sp-switch i,.sp-switch i::after{transition:none}}
</style>
<div class="game-app sp-game">
  <div class="game-intro">
    <div><h2>Sling Puck</h2><p>Tarik puck di areamu ke belakang, lepas untuk melontar melewati celah tengah. Area pertama yang kosong menang.</p></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status>Siap</span></span>
  </div>
  <div class="sp-hud">
    <span class="sp-chip sp-you">Kamu <b data-hud="you">5</b></span>
    <span class="sp-chip sp-foe"><span data-hud="foeLabel">AI</span> <b data-hud="foe">5</b></span>
    <span class="sp-chip">Level <b data-hud="level">1</b></span>
    <span class="sp-chip">Lontaran <b data-hud="shots">0</b></span>
    <span class="sp-chip">Waktu <b data-hud="time">0:00</b></span>
    <span class="sp-chip" data-hud="bestWrap">Terbaik <b data-hud="best">–</b></span>
  </div>
  <section class="game-panel" data-board>
    <div class="sp-board-wrap">
      <svg class="sp-board" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Papan Sling Puck">
        <g data-g="board"></g><g data-g="pucks"></g><g data-g="aim"></g>
      </svg>
    </div>
    <div class="sp-msg" data-msg></div>
    <div class="sp-pad" data-pad>
      <div class="sp-pad-group"><span>Puck</span><div class="sp-pad-row">
        <button type="button" data-pad="prev" aria-label="Puck sebelumnya"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button type="button" data-pad="next" aria-label="Puck berikutnya"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      </div></div>
      <div class="sp-pad-group"><span>Bidik</span><div class="sp-pad-row">
        <button type="button" data-pad="rotl" aria-label="Putar bidikan ke kiri"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button type="button" data-pad="rotr" aria-label="Putar bidikan ke kanan"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      </div></div>
      <div class="sp-pad-group"><span>Tenaga <b data-pad-power>65%</b></span><div class="sp-pad-row">
        <button type="button" data-pad="pwdn" aria-label="Kurangi tenaga">−</button>
        <button type="button" data-pad="pwup" aria-label="Tambah tenaga">+</button>
      </div></div>
      <button type="button" class="sp-fire" data-pad="fire" aria-label="Tembak">TEMBAK</button>
    </div>

    <div class="sp-ov" data-ov="start">
      <div class="sp-card" role="dialog" aria-modal="true" aria-label="Mulai">
        <h3>Sling Puck</h3>
        <p>Tekan puck di areamu, tarik ke belakang untuk merentangkan karet, lalu lepas untuk melontar melewati celah tengah. Area pertama yang kosong menang — puck lawan yang mendarat di areamu boleh dilontarkan balik!</p>
        <p>Setiap ronde: level acak dan undian jalan duluan. Di room online, posisi pemain juga diundi. Tampilanmu selalu di bawah.</p>
        <div class="sp-row"><button type="button" class="sp-btn" data-act="start">Mulai</button><button type="button" class="sp-btn ghost" data-ui="help">Cara main</button></div>
      </div>
    </div>
    <div class="sp-ov" data-ov="over" hidden>
      <div class="sp-card" role="dialog" aria-modal="true" aria-label="Hasil">
        <h3 data-ov-title>Selesai</h3>
        <p data-ov-reason></p>
        <div class="sp-row"><button type="button" class="sp-btn" data-act="retry">Main lagi</button><button type="button" class="sp-btn ghost" data-act="next">Level berikutnya</button></div>
      </div>
    </div>
    <div class="sp-ov sp-help" data-ov="help" hidden>
      <div class="sp-card" role="dialog" aria-modal="true" aria-label="Cara main">
        <h3>Cara main</h3>
        <h4>Tujuan</h4>
        <ul><li>Kosongkan areamu (bawah) dengan melontarkan semua puck lewat celah tengah. Puck lawan yang masuk ke areamu harus dilontarkan balik. Area pertama yang kosong menang.</li></ul>
        <h4>Sentuh &amp; mouse</h4>
        <ul><li>Tekan puck di areamu, tarik ke belakang, lepas. Arah lontaran berlawanan dengan tarikan; makin jauh tarikan, makin kencang.</li><li>Ketuk singkat = pilih puck untuk pad/keyboard. Roda mouse mengatur tenaga saat membidik. Klik kanan / Esc membatalkan tarikan.</li></ul>
        <h4>Keyboard</h4>
        <ul>
          <li><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> putar bidikan · <kbd>↑</kbd><kbd>↓</kbd> / <kbd>W</kbd><kbd>S</kbd> tenaga</li>
          <li><kbd>Q</kbd><kbd>E</kbd> ganti puck · <kbd>Spasi</kbd>/<kbd>Enter</kbd> tembak / mulai</li>
          <li><kbd>R</kbd> ulangi · <kbd>L</kbd> level acak · <kbd>H</kbd> bantuan · <kbd>C</kbd> cheat · <kbd>P</kbd> pad · <kbd>Esc</kbd> tutup/batal</li>
        </ul>
        <h4>Pad virtual</h4>
        <ul><li>Muncul otomatis di perangkat sentuh (atau tekan P / tombol "Pad kontrol"). Tahan tombol untuk mengulang.</li></ul>
        <h4>Level &amp; giliran</h4>
        <ul><li>Posisi/lebar celah, bumper, dan susunan puck diacak tiap ronde dan dijamin bisa diselesaikan. Level naik = celah menyempit + bumper bertambah.</li><li>Jalan duluan diundi; pihak yang kalah undian terkunci 1,5 detik. Di room online posisi pemain juga diundi. Saat online, permainan tetap berjalan ketika panel ini terbuka.</li></ul>
        <div class="sp-row"><button type="button" class="sp-btn" data-ui="close">Tutup</button></div>
      </div>
    </div>
    <div class="sp-ov" data-ov="cheats" hidden>
      <div class="sp-card" role="dialog" aria-modal="true" aria-label="Cheat">
        <h3>Cheat (mode AI)</h3>
        <p>Hanya tersedia saat bermain melawan AI. Memakai cheat membuat waktu terbaik tidak dicatat untuk ronde ini.</p>
        <label class="sp-cheat-row">Gerak lambat <span class="sp-switch"><input type="checkbox" data-cheat-toggle="slow"><i></i></span></label>
        <label class="sp-cheat-row">Bekukan AI <span class="sp-switch"><input type="checkbox" data-cheat-toggle="freeze"><i></i></span></label>
        <label class="sp-cheat-row">Bidik sempurna <span class="sp-switch"><input type="checkbox" data-cheat-toggle="aim"><i></i></span></label>
        <div class="sp-row">
          <button type="button" class="sp-btn ghost" data-cheat="sling1">Lontarkan 1 puck</button>
          <button type="button" class="sp-btn ghost" data-cheat="clear">Kosongkan areamu</button>
          <button type="button" class="sp-btn" data-ui="close">Tutup</button>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-exit>Keluar</button>
    <button class="game-action-button" type="button" data-ui="help">Cara main</button>
    <button class="game-action-button" type="button" data-ui="pad">Pad kontrol</button>
    <button class="game-action-button" type="button" data-ui="cheats" data-btn="cheats">Cheat</button>
    <button class="game-action-button" type="button" data-act="retry">Ulangi</button>
    <button class="game-action-button" type="button" data-act="new">Level acak</button>
  </div>
</div>`;

    /* ================= refs & state lokal ================= */
    const $ = (s, r) => (r || root).querySelector(s);
    const boardG = $('[data-g="board"]'), pucksG = $('[data-g="pucks"]'), aimG = $('[data-g="aim"]');
    const svgEl = $(".sp-board"), msgEl = $("[data-msg]"), statusEl = $("[data-status]");
    const hud = {
        you: $('[data-hud="you"]'), foe: $('[data-hud="foe"]'), foeLabel: $('[data-hud="foeLabel"]'),
        level: $('[data-hud="level"]'), shots: $('[data-hud="shots"]'), time: $('[data-hud="time"]'),
        best: $('[data-hud="best"]'), bestWrap: $('[data-hud="bestWrap"]'),
    };
    const ovStart = $('[data-ov="start"]'), ovOver = $('[data-ov="over"]');
    const ovHelp = $('[data-ov="help"]'), ovCheats = $('[data-ov="cheats"]');
    const ovTitle = $("[data-ov-title]"), ovReason = $("[data-ov-reason]");
    const padEl = $("[data-pad]"), padPower = $("[data-pad-power]"), cheatBtn = $('[data-btn="cheats"]');

    let drag = null;        // {i, ox, oy, id, cx, cy}
    let aimMode = null;     // {i, angle, power} untuk keyboard/pad
    let acc = 0, lastT = 0, raf = null, snapAt = 0, lastPub = 0, staticKey = "";
    let helpOpen = false, cheatsOpen = false, padOn = false, paused = false;
    const cheats = { slow: false, freeze: false, aim: false };
    let cheated = false;
    const cheatUsed = () => cheated || cheats.slow || cheats.freeze || cheats.aim;

    function oppName() {
        if (!online) return "AI";
        try {
            const ps = roomData && roomData.players;
            if (ps) {
                const arr = Array.isArray(ps) ? ps : Object.values(ps);
                const o = arr.find((p) => p && p.name && p.name !== playerName);
                if (o) return String(o.name);
            }
        } catch { }
        return "Lawan";
    }
    // Sisi kanonik pemain lokal. Online: diundi host (hostSide), tampilan selalu di bawah.
    const localSide = () => (online ? (room.isHost ? state?.hostSide ?? 0 : 1 - (state?.hostSide ?? 0)) : 0);
    const flip = () => localSide() === 1; // rotasi 180 derajat untuk pemain sisi atas
    const VX = (x) => (flip() ? W - x : x);
    const VY = (y) => (flip() ? H - y : y);
    const toWorld = (p) => (flip() ? { x: W - p.x, y: H - p.y } : p);
    const msg = (t) => { msgEl.textContent = t; };
    const angleToGap = (b) => Math.atan2(MID - b.y, (state.gap[0] + state.gap[1]) / 2 - b.x);

    function grabbable(side) {
        const out = [];
        if (!state || state.phase !== "playing") return out;
        state.pucks.forEach((b, i) => {
            if (sideOf(b.y) === side && b.vx * b.vx + b.vy * b.vy < 625 && state.elapsed >= state.lock[side]) out.push(i);
        });
        return out;
    }
    const canGrabLocal = (i) => grabbable(localSide()).includes(i);

    /* ================= render ================= */
    function buildStatic(foeLabel) {
        const g = state ? state.gap : [150, 250];
        const gap = flip() ? [W - g[1], W - g[0]] : g;
        const bumps = state ? state.bumpers : [];
        let s = `<rect x="4" y="4" width="392" height="552" rx="20" fill="#eef2f7" stroke="#0f172a" stroke-width="3"/>`;
        s += `<rect x="14" y="14" width="372" height="532" rx="12" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>`;
        s += `<text x="200" y="36" text-anchor="middle" font-size="10" letter-spacing="3" fill="#cbd5e1" font-weight="700" style="font-family:inherit">${foeLabel.toUpperCase()}</text>`;
        s += `<text x="200" y="534" text-anchor="middle" font-size="10" letter-spacing="3" fill="#cbd5e1" font-weight="700" style="font-family:inherit">KAMU</text>`;
        s += `<path d="M30 60h340" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="10 10"/>`;
        s += `<path d="M30 500h340" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="10 10"/>`;
        s += `<rect x="${RX1}" y="${WALL_Y1}" width="${gap[0] - RX1}" height="12" fill="#0f172a"/>`;
        s += `<rect x="${gap[1]}" y="${WALL_Y1}" width="${RX2 - gap[1]}" height="12" fill="#0f172a"/>`;
        s += `<circle cx="${gap[0]}" cy="${MID}" r="6" fill="#0f172a"/><circle cx="${gap[1]}" cy="${MID}" r="6" fill="#0f172a"/>`;
        s += `<circle cx="${gap[0]}" cy="${MID}" r="2.2" fill="#ffffff"/><circle cx="${gap[1]}" cy="${MID}" r="2.2" fill="#ffffff"/>`;
        for (const b of bumps) s += `<circle cx="${VX(b.x)}" cy="${VY(b.y)}" r="${b.r}" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>`;
        boardG.innerHTML = s;
    }

    // Guest: ekstrapolasi posisi dari snapshot terakhir (dead reckoning ringan).
    function dispPuck(b) {
        if (online && !room.isHost && state.phase === "playing") {
            const dt = Math.min(0.2, (performance.now() - snapAt) / 1000);
            let x = clamp(b.x + b.vx * dt, RX1 + b.r, RX2 - b.r);
            let y = clamp(b.y + b.vy * dt, RY1 + b.r, RY2 - b.r);
            const inGap = x > state.gap[0] + b.r && x < state.gap[1] - b.r;
            if (!inGap) {
                if (b.y <= WALL_Y1 - b.r + 1 && y > WALL_Y1 - b.r) y = WALL_Y1 - b.r;
                if (b.y >= WALL_Y2 + b.r - 1 && y < WALL_Y2 + b.r) y = WALL_Y2 + b.r;
            }
            return { x, y };
        }
        return b;
    }

    function renderPucks() {
        const local = localSide();
        let s = "";
        state.pucks.forEach((b, i) => {
            const p = dispPuck(b);
            const mine = b.o === local;
            const fill = mine ? "#2563eb" : "#ef4444", ring = mine ? "#1e40af" : "#b91c1c";
            const locked = state.phase === "playing" && state.elapsed < state.lock[sideOf(b.y)];
            const sel = (drag && drag.i === i) || (aimMode && aimMode.i === i);
            const x = VX(p.x).toFixed(1), y = VY(p.y).toFixed(1);
            if (sel) s += `<circle cx="${x}" cy="${y}" r="${b.r + 5}" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 4"/>`;
            s += `<circle cx="${x}" cy="${y}" r="${b.r}" fill="${fill}" stroke="${ring}" stroke-width="2"${locked ? ' opacity=".45"' : ""}/>`;
            s += `<circle cx="${x}" cy="${y}" r="3.2" fill="#ffffff"${locked ? ' opacity=".45"' : ""}/>`;
        });
        pucksG.innerHTML = s;
    }

    const colFor = (sp) => (sp > 570 ? "#ef4444" : sp > 340 ? "#f59e0b" : "#10b981");
    const vline = (x1, y1, x2, y2, col, w, dash) =>
        `<line x1="${VX(x1)}" y1="${VY(y1)}" x2="${VX(x2)}" y2="${VY(y2)}" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}"/>`;
    function varrow(x, y, ux, uy, len, col) {
        const ex = x + ux * len, ey = y + uy * len;
        return vline(x, y, ex, ey, col, 4, "10 7") + `<circle cx="${VX(ex)}" cy="${VY(ey)}" r="6.5" fill="${col}"/>`;
    }
    function renderAim() {
        if (!state || state.phase !== "playing") { aimG.innerHTML = ""; return; }
        let s = "";
        if (drag) {
            const b = state.pucks[drag.i];
            const dx = b.x - drag.ox, dy = b.y - drag.oy;
            if (Math.hypot(dx, dy) >= 8) {
                const v = launch(dx, dy), sp = Math.hypot(v.vx, v.vy) || 1;
                let ux = v.vx / sp, uy = v.vy / sp;
                if (cheats.aim) { const a = angleToGap(b); ux = Math.cos(a); uy = Math.sin(a); }
                s += vline(drag.ox, drag.oy, b.x, b.y, "#94a3b8", 2.5, "5 6");
                s += varrow(b.x, b.y, ux, uy, 40 + (sp / SPEED_CAP) * 110, colFor(sp));
            }
        } else if (aimMode && state.pucks[aimMode.i]) {
            const b = state.pucks[aimMode.i];
            if (cheats.aim) aimMode.angle = angleToGap(b);
            const sp = SPEED_CAP * aimMode.power;
            s += varrow(b.x, b.y, Math.cos(aimMode.angle), Math.sin(aimMode.angle), 40 + aimMode.power * 110, colFor(sp));
            if (cheats.aim) s += vline(b.x, b.y, (state.gap[0] + state.gap[1]) / 2, MID, "#2563eb", 1.5, "3 5");
        }
        aimG.innerHTML = s;
    }

    function render() {
        const local = localSide(), foeLabel = oppName();
        const key = `${state ? state.seed : "x"}|${state ? state.level : 0}|${flip()}|${foeLabel}`;
        if (key !== staticKey) { staticKey = key; buildStatic(foeLabel); }
        hud.foeLabel.textContent = foeLabel;
        hud.bestWrap.hidden = online;
        cheatBtn.hidden = online;
        if (!state) {
            pucksG.innerHTML = ""; aimG.innerHTML = "";
            statusEl.textContent = "Menunggu host…";
            ovStart.hidden = false; ovOver.hidden = true;
            return;
        }
        renderPucks(); renderAim();
        const c = halfCounts(state.pucks);
        hud.you.textContent = c[local]; hud.foe.textContent = c[1 - local];
        hud.level.textContent = state.level; hud.shots.textContent = state.shots[local];
        let el = state.elapsed;
        if (online && !room.isHost && state.phase === "playing") el += Math.min(0.25, (performance.now() - snapAt) / 1000);
        hud.time.textContent = fmt(el);
        hud.best.textContent = best == null ? "–" : fmt(best);
        if (state.phase === "ready") statusEl.textContent = `Siap${playerName ? ", " + playerName : ""} — tekan Mulai`;
        else if (state.phase === "over") statusEl.textContent = state.winner === local ? "Kamu menang!" : foeLabel + " menang";
        else {
            const rem = state.lock[local] - el;
            if (rem > 0) {
                const firstTxt = state.first === local ? "kamu duluan" : foeLabel + " duluan";
                statusEl.textContent = `Undian: ${firstTxt} · giliranmu ${rem.toFixed(1)} dtk`;
            } else statusEl.textContent = state.msg || "Lontarkan puckmu!";
        }
        ovStart.hidden = state.phase !== "ready";
        ovOver.hidden = state.phase !== "over";
        if (state.phase === "over") {
            const win = state.winner === local;
            ovTitle.textContent = win ? "Kamu menang!" : foeLabel + " menang";
            ovTitle.className = win ? "sp-win" : "sp-lose";
            ovReason.textContent = win
                ? `Areamu kosong dalam ${fmt(state.winTime)} dengan ${state.shots[local]} lontaran.${cheatUsed() ? " (cheat aktif — waktu tidak dicatat)" : ""}`
                : "Area lawan kosong lebih dulu. Coba pantulan dinding dan lontaran yang lebih kencang.";
        }
        padPower.textContent = Math.round((aimMode ? aimMode.power : 0.65) * 100) + "%";
    }

    /* ================= alur permainan & jaringan ================= */
    function makeRound(level, seed, phase) {
        const g = genLevel(level, seed);
        return {
            v: 1, phase, level, seed, gap: g.gap, bumpers: g.bumpers, pucks: g.pucks,
            hostSide: 0, first: 0, lock: [0, 0], elapsed: 0, aiAt: 1.2,
            winner: null, winTime: 0, shots: [0, 0], msg: "",
        };
    }
    function startRound(level, seed) {
        state = makeRound(level, seed, "playing");
        state.hostSide = Math.random() < 0.5 ? 0 : 1;       // undian posisi (online)
        state.first = Math.random() < 0.5 ? 0 : 1;          // undian jalan duluan
        state.lock = [state.first === 0 ? 0 : OPEN_LOCK, state.first === 1 ? 0 : OPEN_LOCK];
        state.aiAt = state.first === 1 ? 0.5 : OPEN_LOCK + 0.6 + Math.random() * 0.6;
        state.msg = "Lontarkan semua puck melewati celah tengah!";
        drag = null; aimMode = null; acc = 0; cheated = false;
        msg(state.first === localSide() ? "Undian: kamu jalan duluan!" : "Undian: " + oppName() + " duluan — tunggu sebentar");
        publish();
    }
    function checkWin() {
        if (!state || state.phase !== "playing" || drag) return;
        const c = halfCounts(state.pucks);
        const winner = c[0] === 0 ? 0 : c[1] === 0 ? 1 : null;
        if (winner == null) return;
        state.phase = "over"; state.winner = winner; state.winTime = state.elapsed;
        drag = null; aimMode = null;
        if (!online && winner === 0 && !cheatUsed()) {
            if (best == null || state.winTime < best) {
                best = state.winTime;
                try { localStorage.setItem(META.bestKey, String(best)); } catch { }
            }
        }
        publish();
    }
    function aiTick() {
        const st = state;
        if (st.phase !== "playing") return;
        if (cheats.freeze) { st.aiAt = st.elapsed + 0.5; return; }
        if (st.elapsed < st.aiAt) return;
        if (st.elapsed < st.lock[1]) { st.aiAt = st.lock[1] + 0.3; return; }
        const cands = [];
        st.pucks.forEach((b, i) => { if (sideOf(b.y) === 1 && b.vx * b.vx + b.vy * b.vy < 400) cands.push(i); });
        if (!cands.length) { st.aiAt = st.elapsed + 0.4; return; }
        const ts = losTargets(st.gap);
        const clear = cands.filter((i) => { const b = st.pucks[i]; return ts.some((t) => lineClear(b.x, b.y, t.x, t.y, st.bumpers, R_PUCK + 2)); });
        const pool = clear.length ? clear : cands;
        const i = pool[Math.floor(Math.random() * pool.length)], b = st.pucks[i];
        const good = ts.filter((t) => lineClear(b.x, b.y, t.x, t.y, st.bumpers, R_PUCK + 2));
        const tp = (good.length ? good : ts)[Math.floor(Math.random() * (good.length || ts.length))];
        const err = Math.max(0.02, 0.14 - st.level * 0.012);
        const ang = Math.atan2(tp.y - b.y, tp.x - b.x) + (Math.random() * 2 - 1) * err;
        const sp = Math.min(SPEED_CAP, 430 + Math.random() * 270);
        b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp; st.shots[1]++;
        st.aiAt = st.elapsed + Math.max(0.7, 1.7 - st.level * 0.08) + Math.random() * 0.7;
    }

    function publish() {
        render();
        if (online && room.isHost) room.publishState(state).catch(console.warn);
    }
    function applyAction(action, actor) {
        if (!state || !action) return;
        const side = online ? (actor === 0 ? state.hostSide : 1 - state.hostSide) : 0;
        switch (action.type) {
            case "start": if (state.phase !== "playing") startRound(state.level, state.seed); return;
            case "retry": startRound(state.level, state.seed); return;
            case "next": startRound(state.level + 1, randSeed()); return;
            case "new": startRound(state.level, randSeed()); return;
            case "sling": {
                if (state.phase !== "playing") return;
                const b = state.pucks[action.i];
                if (!b || sideOf(b.y) !== side) return;
                if (b.vx * b.vx + b.vy * b.vy > 625) return;
                if (state.elapsed < state.lock[side]) return;
                let vx = +action.vx, vy = +action.vy;
                if (!isFinite(vx) || !isFinite(vy)) return;
                const s = Math.hypot(vx, vy);
                if (s < 40) return;
                if (s > SPEED_CAP) { vx *= SPEED_CAP / s; vy *= SPEED_CAP / s; }
                b.vx = vx; b.vy = vy; state.shots[side]++;
                break;
            }
            default: return;
        }
        publish();
    }
    function submitAction(action) {
        if (online && !room.isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, playerIndex);
    }

    /* ================= cheat (hanya mode AI) ================= */
    function cheatSling() {
        if (online || !state || state.phase !== "playing") return;
        cheated = true;
        const ts = losTargets(state.gap), list = grabbable(0);
        if (!list.length) { msg("Tidak ada puck siap"); return; }
        let pick = list[0], tgt = ts[1];
        outer: for (const i of list) {
            const b = state.pucks[i];
            for (const t of ts) if (lineClear(b.x, b.y, t.x, t.y, state.bumpers, R_PUCK + 2)) { pick = i; tgt = t; break outer; }
        }
        const b = state.pucks[pick], d = Math.hypot(tgt.x - b.x, tgt.y - b.y) || 1;
        submitAction({ type: "sling", i: pick, vx: ((tgt.x - b.x) / d) * 600, vy: ((tgt.y - b.y) / d) * 600 });
        msg("Cheat: lontaran otomatis!");
    }
    function cheatClear() {
        if (online || !state || state.phase !== "playing") return;
        cheated = true;
        const mine = state.pucks.filter((b) => sideOf(b.y) === 0);
        for (const b of mine) { b.y = H - b.y; b.vx = 0; b.vy = 0; }
        for (let k = 0; k < 10; k++) {
            for (const b of mine) {
                b.x = clamp(b.x, RX1 + b.r, RX2 - b.r); b.y = clamp(b.y, RY1 + b.r, WALL_Y1 - b.r);
                for (const o of state.bumpers) {
                    const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), m = b.r + o.r + 1;
                    if (d < m && d > 0) { b.x = o.x + (dx / d) * m; b.y = o.y + (dy / d) * m; }
                }
                for (const p of state.pucks) {
                    if (p === b) continue;
                    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), m = b.r + p.r + 1;
                    if (d < m && d > 0) { b.x = p.x + (dx / d) * m; b.y = p.y + (dy / d) * m; }
                }
            }
        }
        publish(); checkWin();
    }

    /* ================= input: pointer (mouse + sentuh) ================= */
    function toBoard(e) {
        const r = svgEl.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    }
    function onDown(e) {
        if (!state || state.phase !== "playing") return;
        if (e.button === 2) { cancelDrag(); return; }
        const p = toWorld(toBoard(e));
        let bi = -1, bd = GRAB_R;
        state.pucks.forEach((b, i) => {
            if (!canGrabLocal(i)) return;
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d < bd) { bd = d; bi = i; }
        });
        if (bi < 0) return;
        e.preventDefault();
        const b = state.pucks[bi];
        drag = { i: bi, ox: b.x, oy: b.y, id: e.pointerId, cx: b.x, cy: b.y };
        b.vx = 0; b.vy = 0; aimMode = null;
        try { svgEl.setPointerCapture(e.pointerId); } catch { }
        svgEl.style.cursor = "grabbing";
        msg("Tarik ke belakang, lepas untuk melontar");
        render();
    }
    function onMove(e) {
        if (drag && e.pointerId === drag.id) {
            const p = toWorld(toBoard(e)), b = state.pucks[drag.i], local = localSide();
            b.x = clamp(p.x, RX1 + b.r, RX2 - b.r);
            b.y = local === 0 ? clamp(p.y, WALL_Y2 + b.r, RY2 - b.r) : clamp(p.y, RY1 + b.r, WALL_Y1 - b.r);
            for (const o of state.bumpers) {
                const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), m = b.r + o.r;
                if (d < m && d > 0) { b.x = o.x + (dx / d) * m; b.y = o.y + (dy / d) * m; }
            }
            b.x = clamp(b.x, RX1 + b.r, RX2 - b.r);
            b.y = local === 0 ? clamp(b.y, WALL_Y2 + b.r, RY2 - b.r) : clamp(b.y, RY1 + b.r, WALL_Y1 - b.r);
            drag.cx = b.x; drag.cy = b.y;
            render();
        } else if (!drag && state && state.phase === "playing") {
            const p = toWorld(toBoard(e));
            let hov = false;
            state.pucks.forEach((b, i) => { if (canGrabLocal(i) && Math.hypot(b.x - p.x, b.y - p.y) < GRAB_R) hov = true; });
            svgEl.style.cursor = hov ? "grab" : "default";
        }
    }
    function onUp(e) { if (drag && e.pointerId === drag.id) release(); }
    function release() {
        const i = drag.i, b = state.pucks[i];
        const dx = b.x - drag.ox, dy = b.y - drag.oy;
        drag = null; svgEl.style.cursor = "default";
        if (Math.hypot(dx, dy) < 14) {
            aimMode = { i, angle: angleToGap(b), power: 0.65 };
            msg("Puck dipilih — tembak dengan SPASI / TEMBAK");
            render(); return;
        }
        const v = launch(dx, dy);
        let vx = v.vx, vy = v.vy;
        if (cheats.aim) { cheated = true; const sp = Math.hypot(vx, vy), a = angleToGap(b); vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; }
        submitAction({ type: "sling", i, vx, vy });
        msg("Lontar!"); render();
    }
    function cancelDrag() {
        if (!drag) return;
        const b = state.pucks[drag.i];
        b.x = drag.ox; b.y = drag.oy;
        drag = null; svgEl.style.cursor = "default"; render();
    }
    function onWheel(e) {
        if (!aimMode || !state || state.phase !== "playing") return;
        e.preventDefault();
        powerAim(e.deltaY < 0 ? 1 : -1);
    }

    /* ================= input: keyboard & pad virtual ================= */
    function ensureAim() {
        if (aimMode && canGrabLocal(aimMode.i)) return true;
        const list = grabbable(localSide());
        if (!list.length) { msg("Belum ada puck siap di areamu"); aimMode = null; return false; }
        const i = list[0];
        aimMode = { i, angle: angleToGap(state.pucks[i]), power: 0.65 };
        return true;
    }
    function rotateAim(dir) { if (paused || !ensureAim()) return; aimMode.angle += dir * 0.06 * (flip() ? -1 : 1); render(); }
    function powerAim(dir) { if (paused || !ensureAim()) return; aimMode.power = clamp(aimMode.power + dir * 0.05, 0.15, 1); render(); }
    function cyclePuck(dir) {
        if (paused) return;
        const list = grabbable(localSide());
        if (!list.length) { msg("Belum ada puck siap di areamu"); return; }
        let idx = aimMode ? list.indexOf(aimMode.i) : -1;
        idx = idx < 0 ? (dir > 0 ? -1 : 0) : idx;
        idx = (idx + dir + list.length) % list.length;
        const i = list[idx];
        aimMode = { i, angle: angleToGap(state.pucks[i]), power: aimMode ? aimMode.power : 0.65 };
        render();
    }
    function fire() {
        if (paused || !state || state.phase !== "playing" || !ensureAim()) return;
        const b = state.pucks[aimMode.i];
        if (cheats.aim) { cheated = true; aimMode.angle = angleToGap(b); }
        const sp = SPEED_CAP * aimMode.power;
        submitAction({ type: "sling", i: aimMode.i, vx: Math.cos(aimMode.angle) * sp, vy: Math.sin(aimMode.angle) * sp });
        aimMode = null; msg("Lontar!"); render();
    }
    function onKey(e) {
        const t = e.target, k = e.code;
        if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
        if (t && t.closest && t.closest(".sp-card") && (k === "Space" || k === "Enter")) return;
        if (k === "Escape") {
            if (helpOpen || cheatsOpen) closePanels();
            else if (drag) cancelDrag();
            else if (aimMode) { aimMode = null; render(); }
            return;
        }
        if (k === "KeyH") { e.preventDefault(); toggleHelp(); return; }
        if (k === "KeyP") { e.preventDefault(); togglePad(); return; }
        if (k === "KeyC") { if (!online) { e.preventDefault(); toggleCheats(); } return; }
        if (k === "KeyR") { e.preventDefault(); submitAction({ type: "retry" }); return; }
        if (k === "KeyL") { e.preventDefault(); submitAction({ type: "new" }); return; }
        if (!state) return;
        if (k === "Space" || k === "Enter") {
            e.preventDefault();
            if (state.phase === "ready") submitAction({ type: "start" });
            else if (state.phase === "over") submitAction({ type: "retry" });
            else fire();
            return;
        }
        if (state.phase !== "playing") return;
        switch (k) {
            case "ArrowLeft": case "KeyA": e.preventDefault(); rotateAim(-1); break;
            case "ArrowRight": case "KeyD": e.preventDefault(); rotateAim(1); break;
            case "ArrowUp": case "KeyW": e.preventDefault(); powerAim(1); break;
            case "ArrowDown": case "KeyS": e.preventDefault(); powerAim(-1); break;
            case "KeyQ": e.preventDefault(); cyclePuck(-1); break;
            case "KeyE": e.preventDefault(); cyclePuck(1); break;
        }
    }
    const holdStops = [];
    function bindHold(btn, fn) {
        let to = null, iv = null;
        const start = (e) => {
            e.preventDefault(); fn();
            to = setTimeout(() => { iv = setInterval(fn, 90); }, 280);
            try { btn.setPointerCapture(e.pointerId); } catch { }
        };
        const stop = () => { clearTimeout(to); clearInterval(iv); to = iv = null; };
        btn.addEventListener("pointerdown", start);
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => btn.addEventListener(ev, stop));
        holdStops.push(stop);
    }
    const padActs = {
        prev: () => cyclePuck(-1), next: () => cyclePuck(1),
        rotl: () => rotateAim(-1), rotr: () => rotateAim(1),
        pwdn: () => powerAim(-1), pwup: () => powerAim(1),
    };
    padEl.querySelectorAll("[data-pad]").forEach((btn) => {
        const a = btn.dataset.pad;
        if (a === "fire") btn.addEventListener("click", () => { fire(); btn.blur(); });
        else if (padActs[a]) bindHold(btn, padActs[a]);
    });

    /* ================= panel & klik ================= */
    const setPaused = () => { paused = !online && (helpOpen || cheatsOpen); };
    function toggleHelp() { helpOpen = !helpOpen; cheatsOpen = false; ovHelp.hidden = !helpOpen; ovCheats.hidden = true; setPaused(); }
    function toggleCheats() { if (online) return; cheatsOpen = !cheatsOpen; helpOpen = false; ovCheats.hidden = !cheatsOpen; ovHelp.hidden = true; setPaused(); }
    function togglePad() { padOn = !padOn; padEl.classList.toggle("on", padOn); }
    function closePanels() { helpOpen = false; cheatsOpen = false; ovHelp.hidden = true; ovCheats.hidden = true; setPaused(); }

    function handleClick(event) {
        const el = event.target.closest("[data-exit],[data-act],[data-ui],[data-cheat]");
        if (!el) return;
        if (el.hasAttribute("data-exit")) { onExit(); return; }
        if (el.dataset.act) { submitAction({ type: el.dataset.act }); el.blur(); return; }
        if (el.dataset.ui) {
            const u = el.dataset.ui;
            if (u === "help") toggleHelp();
            else if (u === "cheats") toggleCheats();
            else if (u === "pad") togglePad();
            else if (u === "close") closePanels();
            return;
        }
        if (el.dataset.cheat) {
            if (el.dataset.cheat === "sling1") cheatSling();
            else if (el.dataset.cheat === "clear") cheatClear();
        }
    }
    function handleChange(e) {
        const inp = e.target.closest("[data-cheat-toggle]");
        if (!inp || online) return;
        cheats[inp.dataset.cheatToggle] = inp.checked;
        if (inp.checked) cheated = true;
    }

    /* ================= loop utama ================= */
    function frame(t) {
        raf = requestAnimationFrame(frame);
        const dtReal = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
        lastT = t;
        if (state && (!online || room.isHost) && state.phase === "playing" && !paused) {
            const scale = !online && cheats.slow ? 0.45 : 1;
            state.elapsed += dtReal * scale;
            acc += dtReal * scale;
            let g = 0;
            while (acc >= DT && g < 6) { stepWorld(state.pucks, state.gap, state.bumpers); acc -= DT; g++; }
            if (g >= 6) acc = 0;
            if (!online) aiTick();
            if (!drag && allStopped(state.pucks)) checkWin();
            if (online && t - lastPub >= PUB_MS) { lastPub = t; room.publishState(state).catch(console.warn); }
        }
        render();
    }

    /* ================= init & wiring ================= */
    root.addEventListener("click", handleClick);
    root.addEventListener("change", handleChange);
    svgEl.addEventListener("pointerdown", onDown);
    svgEl.addEventListener("pointermove", onMove);
    svgEl.addEventListener("pointerup", onUp);
    svgEl.addEventListener("pointercancel", onUp);
    svgEl.addEventListener("contextmenu", (e) => e.preventDefault());
    svgEl.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKey);
    padOn = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    padEl.classList.toggle("on", padOn);
    msg("Tekan Mulai untuk bermain");

    const subs = [];
    const keep = (u) => { if (typeof u === "function") subs.push(u); };
    if (online) {
        keep(room.onRoom((nextRoom) => { roomData = nextRoom; render(); }));
        if (room.isHost) {
            state = makeRound(1, randSeed(), "ready");
            publish();
            keep(room.onAction((action) => applyAction(action, 1)));
        } else {
            keep(room.onState((nextState) => {
                const prev = state?.phase;
                state = nextState;
                snapAt = performance.now();
                if (state && drag && state.pucks[drag.i]) {
                    const b = state.pucks[drag.i];
                    b.x = drag.cx; b.y = drag.cy; b.vx = 0; b.vy = 0;
                }
                if (state && state.phase !== "playing") { drag = null; aimMode = null; }
                if (state && prev !== "playing" && state.phase === "playing") {
                    msg(state.first === localSide() ? "Undian: kamu jalan duluan!" : "Undian: " + oppName() + " duluan — tunggu sebentar");
                }
                render();
            }));
        }
    } else {
        state = makeRound(1, randSeed(), "ready");
    }
    render();
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            if (raf) cancelAnimationFrame(raf);
            raf = null;
            document.removeEventListener("keydown", onKey);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", handleChange);
            svgEl.removeEventListener("wheel", onWheel);
            holdStops.forEach((fn) => fn());
            subs.forEach((fn) => { try { fn(); } catch { } });
        },
    };
}