/* ==== JS/games/cat-crash.js ==== */
/*
 * CAT CRASH — Angry-Birds-inspired, 2D side-scrolling.
 * Template: export META + mount(root, context). Host-authoritative saat online.
 * Setelah edit: node tools/build-games-manifest.mjs
 */

export const META = {
    id: "cat-crash",
    name: "Cat Crash",
    category: "arcade",
    catLabel: "Arcade",
    desc: "Sling cats, topple the kennels, and knock out every dog across three arenas.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 42h40" stroke="#d6d3d1" stroke-width="3"/><path d="M10 42V26m0 4l-6-6m6 6l6-6" stroke="#78716c" stroke-width="3.5"/><circle cx="26" cy="18" r="9" fill="#f59e0b" stroke="#b45309" stroke-width="2"/><path d="M20 12l-1.5-6 5 3M32 12l1.5-6-5 3" fill="#f59e0b" stroke="#b45309" stroke-width="2"/><circle cx="23" cy="17" r="1.6" fill="#292524" stroke="none"/><circle cx="29" cy="17" r="1.6" fill="#292524" stroke="none"/><rect x="34" y="30" width="10" height="12" rx="2" fill="#e8cfa7" stroke="#caa06b" stroke-width="2"/><circle cx="39" cy="26" r="5" fill="#d6d3d1" stroke="#78716c" stroke-width="2"/><path d="M35 23l-2-3m10 3l2-3" stroke="#78716c" stroke-width="2"/></svg>',
    bg: ["#fde68a", "#f59e0b"],
    bestKey: "catCrashBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const solo = mode === "solo";
    const netRole = online && !room.isHost ? 1 : 0; // 0 = host, 1 = guest (identitas jaringan)
    const authority = !online || room.isHost;
    let roomData = room?.room || null;

    /* ---------- konstanta dunia (side-scrolling) ---------- */
    const VIEW_W = 960, VIEW_H = 540, WORLD_W = 1760;
    const GROUND = 470, GRAV = 980, CAP = 1250;
    const ANCHOR = { x: 150, y: 352 };
    const CAM_MAX = WORLD_W - VIEW_W;
    const CAT_KEYS = ["tabby", "zip", "chunk", "boom"];
    const CATS = {
        tabby: { r: 13, mul: 1.0, damp: 0.60, rest: 0.35, fill: "#f59e0b", line: "#b45309" },
        zip: { r: 11, mul: 0.85, damp: 0.55, rest: 0.40, fill: "#475569", line: "#1e293b" },
        chunk: { r: 17, mul: 2.2, damp: 0.82, rest: 0.15, fill: "#a8a29e", line: "#57534e" },
        boom: { r: 15, mul: 0.9, damp: 0.50, rest: 0.35, fill: "#fafaf9", line: "#64748b" },
    };
    const DOG_KINDS = {
        small: { r: 14, hp: 2, score: 500, fill: "#d6d3d1", line: "#78716c" },
        bulldog: { r: 16, hp: 4, score: 800, fill: "#a8a29e", line: "#57534e" },
        boss: { r: 18, hp: 6, score: 1500, fill: "#fbbf24", line: "#b45309", gold: true },
    };
    const MATS = {
        wood: { hp: 3, score: 50, fill: "#e8cfa7", line: "#caa06b" },
        glass: { hp: 1, score: 30, fill: "#dbeafe", line: "#93c5fd" },
        stone: { hp: 6, score: 80, fill: "#e2e8f0", line: "#94a3b8" },
    };
    const P_COLOR = ["#f59e0b", "#0ea5e9"];

    /* ---------- level handcrafted (tanpa RNG geometri, dijamin solvable) ---------- */
    const B = (mat, x, y, w, h) => ({ x, y, w, h, mat, hp: MATS[mat].hp, max: MATS[mat].hp });
    const D = (kind, x, y) => ({ x, y, kind, r: DOG_KINDS[kind].r, hp: DOG_KINDS[kind].hp, max: DOG_KINDS[kind].hp });
    const LEVELS = [
        {
            name: "Warm-up Yard",
            blocks: [B("wood", 760, 390, 16, 80), B("wood", 854, 390, 16, 80), B("wood", 752, 374, 126, 16),
            B("glass", 1180, 406, 14, 64), B("glass", 1262, 406, 14, 64), B("wood", 1172, 390, 112, 16)],
            dogs: [D("small", 815, 456), D("small", 815, 360), D("bulldog", 1226, 454)]
        },
        {
            name: "Triple Kennels",
            blocks: [B("stone", 700, 406, 16, 64), B("stone", 788, 406, 16, 64), B("wood", 692, 390, 120, 16),
            B("wood", 1080, 374, 16, 96), B("wood", 1176, 374, 16, 96), B("wood", 1072, 358, 128, 16),
            B("glass", 1104, 318, 14, 40), B("glass", 1150, 318, 14, 40), B("wood", 1096, 302, 76, 16),
            B("glass", 1460, 406, 14, 64), B("glass", 1544, 406, 14, 64), B("stone", 1452, 390, 114, 16)],
            dogs: [D("small", 752, 456), D("small", 752, 376), D("bulldog", 1136, 454), D("small", 1134, 288), D("bulldog", 1509, 454)]
        },
        {
            name: "The Big Kennel",
            blocks: [B("stone", 950, 390, 20, 80), B("stone", 1150, 390, 20, 80), B("stone", 1350, 390, 20, 80), B("stone", 1580, 390, 20, 80),
            B("wood", 942, 374, 236, 16), B("wood", 1342, 374, 266, 16),
            B("wood", 1000, 310, 16, 64), B("wood", 1120, 310, 16, 64), B("wood", 992, 294, 152, 16),
            B("glass", 1400, 310, 14, 64), B("glass", 1520, 310, 14, 64), B("wood", 1392, 294, 150, 16)],
            dogs: [D("boss", 1260, 452), D("small", 1200, 456), D("small", 1050, 456), D("bulldog", 1470, 454),
            D("small", 1068, 280), D("bulldog", 1466, 278)]
        },
    ];

    /* ---------- util ---------- */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const coin = () => (Math.random() < 0.5 ? 0 : 1);
    const freshAmmo = () => ({ tabby: 1, zip: 1, chunk: 1, boom: 1 });

    let destroyed = false, gen = 0;
    const timers = new Set(), intervals = new Set(), unsubs = [];
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); return id; };
    const every = (fn, ms) => { const id = setInterval(fn, ms); intervals.add(id); return id; };
    const sub = (u) => { if (typeof u === "function") unsubs.push(u); };

    /* ---------- shell UI (minimalis, tanpa tutorial) ---------- */
    root.innerHTML = `
<style>
.cc-app{--ink:#292524;--line:#e7e5e4;--paper:#fafaf9;--accent:#f59e0b;color:var(--ink)}
.cc-app [hidden]{display:none!important}
.cc-panel{padding:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}
.cc-hud{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line);font-size:12px}
.cc-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--line);border-radius:999px;background:var(--paper);font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.cc-spacer{flex:1}
.cc-ammo{display:flex;gap:6px}
.cc-ammo button{width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:#fff;display:grid;place-items:center;cursor:pointer;padding:0;position:relative}
.cc-ammo button.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.cc-ammo button:disabled{opacity:.3;cursor:default}
.cc-ammo .n{position:absolute;right:3px;bottom:1px;font-size:9px;color:#78716c}
.cc-stage{position:relative}
.cc-svg{display:block;width:100%;aspect-ratio:16/9;touch-action:none;cursor:crosshair;background:#f8fafc}
.cc-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-top:1px solid var(--line);background:var(--paper)}
.cc-group{display:flex;align-items:center;gap:6px}
.cc-lbl{font-size:10px;letter-spacing:.08em;color:#78716c}
.cc-val{min-width:42px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}
.cc-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;line-height:1}
.cc-btn:hover{border-color:#d6d3d1}
.cc-btn:disabled{opacity:.35;cursor:default}
.cc-btn.icon{width:34px;height:34px;padding:0;display:grid;place-items:center;font-size:15px}
.cc-btn.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
.cc-fire{min-width:88px;height:38px}
.cc-ability{height:38px;border-color:var(--accent);color:#b45309}
.cc-fire-group{margin-left:auto}
.cc-banner,.cc-over{position:absolute;inset:0;display:grid;place-items:center;background:rgba(250,250,249,.82);backdrop-filter:blur(2px)}
.cc-banner{pointer-events:none}
.cc-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 22px;text-align:center;max-width:320px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
.cc-card h3{margin:0 0 6px;font-size:18px}
.cc-card p{margin:0 0 12px;font-size:13px;color:#57534e}
.cc-row{display:flex;gap:8px;justify-content:center}
.cc-cheats{position:absolute;top:10px;right:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;width:212px;font-size:12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.cc-cheats h4{margin:0;font-size:11px;letter-spacing:.1em;color:#78716c}
.cc-cheats label{display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer}
.cc-cheats input{accent-color:var(--accent)}
.cc-cheats .cc-btn{flex:1;padding:6px 8px;font-size:11px}
.cc-debris{animation:cc-fall .6s ease-in forwards}
@keyframes cc-fall{to{transform:translateY(46px) rotate(80deg);opacity:0}}
.cc-pop{animation:cc-rise .8s ease-out forwards;font:600 13px system-ui,sans-serif;fill:#292524}
@keyframes cc-rise{to{transform:translateY(-30px);opacity:0}}
.cc-ring{animation:cc-ring .45s ease-out forwards;transform-box:fill-box;transform-origin:center}
@keyframes cc-ring{to{transform:scale(2.4);opacity:0}}
.cc-streak{animation:cc-fade .4s ease-out forwards}
@keyframes cc-fade{to{opacity:0}}
@media (max-width:640px){.cc-fire-group{margin-left:0;flex:1}.cc-fire{flex:1}.cc-hud{font-size:11px}}
</style>
<div class="game-app cc-app">
  <div class="game-intro">
    <div><h2>Cat Crash</h2></div>
    <span class="game-status"><i class="game-status-dot"></i><span data-status aria-live="polite">Ready</span></span>
  </div>
  <section class="game-panel cc-panel" data-board>
    <div class="cc-hud">
      <span class="cc-chip">LV <b data-hud="level">1</b>/3</span>
      <span class="cc-chip"><i class="cc-dot" style="background:${P_COLOR[0]}"></i><span data-hud="p1">P1</span>&nbsp;<b data-hud="s1">0</b></span>
      <span class="cc-chip" data-hud="p2wrap"><i class="cc-dot" style="background:${P_COLOR[1]}"></i><span data-hud="p2">P2</span>&nbsp;<b data-hud="s2">0</b></span>
      <span class="cc-chip"><i class="cc-dot" data-hud="turndot"></i><span data-hud="turn">—</span></span>
      <span class="cc-spacer"></span>
      <span class="cc-ammo" data-ammo></span>
    </div>
    <div class="cc-stage">
      <svg class="cc-svg" data-svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cat Crash arena">
        <rect x="0" y="0" width="${WORLD_W}" height="${VIEW_H}" fill="#f8fafc"/>
        <g data-far></g>
        <g data-near></g>
        <g>
          <rect x="0" y="${GROUND}" width="${WORLD_W}" height="${VIEW_H - GROUND}" fill="#eceae7"/>
          <path d="M0 ${GROUND}H${WORLD_W}" stroke="#d6d3d1" stroke-width="2"/>
          <g data-sling></g>
          <g data-blocks></g>
          <g data-dogs></g>
          <g data-aim></g>
          <g data-cat></g>
          <g data-fx></g>
          <g data-marker></g>
        </g>
      </svg>
      <div class="cc-banner" data-banner hidden><div class="cc-card"><h3 data-banner-title></h3><p data-banner-sub></p></div></div>
      <div class="cc-over" data-over hidden>
        <div class="cc-card"><h3 data-over-title></h3><p data-over-sub></p>
          <div class="cc-row"><button class="cc-btn primary" type="button" data-act="rematch">Rematch</button><button class="cc-btn" type="button" data-exit>Exit</button></div>
        </div>
      </div>
      <div class="cc-cheats" data-cheats hidden>
        <h4>CHEATS</h4>
        <label>Infinite ammo <input type="checkbox" data-cheat="ammo"></label>
        <label>One-hit KO <input type="checkbox" data-cheat="onehit"></label>
        <label>Max power +35% <input type="checkbox" data-cheat="power"></label>
        <label>Slow motion <input type="checkbox" data-cheat="slow"></label>
        <label>Long trajectory <input type="checkbox" data-cheat="arc"></label>
        <div class="cc-row"><button class="cc-btn" type="button" data-act="cheat-ammo">+Ammo</button></div>
        <div class="cc-row"><button class="cc-btn" type="button" data-act="cheat-clear">Clear</button><button class="cc-btn" type="button" data-act="cheat-skip">Skip</button></div>
      </div>
    </div>
    <div class="cc-controls">
      <div class="cc-group">
        <button class="cc-btn icon" type="button" data-hold="panL" aria-label="Pan camera left"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="cc-btn icon" type="button" data-hold="panR" aria-label="Pan camera right"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="cc-btn icon" type="button" data-act="home" aria-label="Back to slingshot"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 0v3M7 11v3M0 7h3M11 7h3" stroke="currentColor" stroke-width="1.6"/></svg></button>
      </div>
      <div class="cc-group"><span class="cc-lbl">ANG</span>
        <button class="cc-btn icon" type="button" data-hold="angD" aria-label="Lower angle">−</button><b class="cc-val" data-val="angle">45°</b><button class="cc-btn icon" type="button" data-hold="angU" aria-label="Raise angle">+</button>
      </div>
      <div class="cc-group"><span class="cc-lbl">PWR</span>
        <button class="cc-btn icon" type="button" data-hold="powD" aria-label="Less power">−</button><b class="cc-val" data-val="power">62%</b><button class="cc-btn icon" type="button" data-hold="powU" aria-label="More power">+</button>
      </div>
      <div class="cc-group cc-fire-group">
        <button class="cc-btn cc-ability" type="button" data-act="ability" hidden>Ability</button>
        <button class="cc-btn primary cc-fire" type="button" data-act="fire">Fire</button>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <button class="game-action-button" type="button" data-act="cheats" data-cheats-btn>Cheats</button>
    <button class="game-action-button" type="button" data-act="rematch">Rematch</button>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    const $ = (s, r) => (r || root).querySelector(s);
    const svg = $("[data-svg]");
    const farG = $("[data-far]"), nearG = $("[data-near]"), slingG = $("[data-sling]");
    const blocksG = $("[data-blocks]"), dogsG = $("[data-dogs]"), aimG = $("[data-aim]");
    const catG = $("[data-cat]"), fxG = $("[data-fx]"), markerG = $("[data-marker]");
    const banner = $("[data-banner]"), bannerT = $("[data-banner-title]"), bannerS = $("[data-banner-sub]");
    const over = $("[data-over]"), overT = $("[data-over-title]"), overS = $("[data-over-sub]");
    const cheatPanel = $("[data-cheats]"), cheatBtn = $("[data-cheats-btn]");
    const ammoWrap = $("[data-ammo]"), fireBtn = $('[data-act="fire"]'), abilityBtn = $('[data-act="ability"]');
    const statusEl = $("[data-status]");
    const hud = {
        level: $('[data-hud="level"]'), p1: $('[data-hud="p1"]'), p2: $('[data-hud="p2"]'),
        s1: $('[data-hud="s1"]'), s2: $('[data-hud="s2"]'), p2wrap: $('[data-hud="p2wrap"]'),
        turn: $('[data-hud="turn"]'), turndot: $('[data-hud="turndot"]')
    };
    const valAngle = $('[data-val="angle"]'), valPower = $('[data-val="power"]');
    if (online) { cheatBtn.hidden = true; cheatPanel.hidden = true; }
    if (solo) hud.p2wrap.hidden = true;

    /* ---------- state & lokal ---------- */
    let state = null;
    let camX = 0, camTarget = 0;
    let localAim = { angle: 45, power: 0.62 };
    let localSel = "tabby";
    let drag = null, tap = null, holdId = null;
    let displayCat = null, pendingLaunch = false;
    let raf = null, lastT = 0, lastPub = 0;
    let flightT = 0, fuse = -1, botPlan = null;
    const cheats = { ammo: false, onehit: false, power: false, slow: false, arc: false };

    const slotOf = (role) => (role === 0 ? state.hostSlot : 1 - state.hostSlot);
    const mySlot = () => (online ? slotOf(netRole) : 0);
    const freeAmmo = (slot) => !online && cheats.ammo && slot === 0;
    const hasAmmo = (slot) => freeAmmo(slot) || CAT_KEYS.some((k) => state.ammo[slot][k] > 0);
    const firstAvail = (slot) => CAT_KEYS.find((k) => state.ammo[slot][k] > 0) || "tabby";
    const nameOf = (slot) => {
        if (!online) return slot === 0 ? (playerName || "You") : "Bot";
        const role = state ? (slot === state.hostSlot ? 0 : 1) : slot;
        let n = null;
        try { const p = roomData?.players?.[role]; n = p?.name || p?.playerName || null; } catch { }
        if (!n) n = role === netRole ? (playerName || "You") : "Opponent";
        return String(n).slice(0, 12);
    };

    /* ---------- fisika ---------- */
    const damageOf = (speed, type) =>
        !online && cheats.onehit ? 99 : Math.max(1, Math.round(Math.max(1, Math.floor(speed / 80)) * CATS[type].mul));
    const reflect = (vx, vy, nx, ny, rest) => {
        const dot = vx * nx + vy * ny;
        return { vx: vx - (1 + rest) * dot * nx, vy: vy - (1 + rest) * dot * ny };
    };
    function resolveRect(c, b) {
        const nx = clamp(c.x, b.x, b.x + b.w), ny = clamp(c.y, b.y, b.y + b.h);
        const dx = c.x - nx, dy = c.y - ny, d = Math.hypot(dx, dy);
        if (d > c.r) return null;
        if (d > 1e-6) { const p = c.r - d + 0.5, ux = dx / d, uy = dy / d; c.x += ux * p; c.y += uy * p; return { x: ux, y: uy }; }
        const l = c.x - b.x, r = b.x + b.w - c.x, t = c.y - b.y, bo = b.y + b.h - c.y, m = Math.min(l, r, t, bo);
        if (m === l) { c.x = b.x - c.r - 0.5; return { x: -1, y: 0 }; }
        if (m === r) { c.x = b.x + b.w + c.r + 0.5; return { x: 1, y: 0 }; }
        if (m === t) { c.y = b.y - c.r - 0.5; return { x: 0, y: -1 }; }
        c.y = b.y + b.h + c.r + 0.5; return { x: 0, y: 1 };
    }

    /* ---------- FX (pure SVG) ---------- */
    const svgNode = (html, life) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.innerHTML = html; fxG.appendChild(g);
        later(() => { if (g.parentNode) g.parentNode.removeChild(g); }, life);
    };
    const debris = (x, y, w, h, color) => {
        let s = "";
        for (let i = 0; i < 4; i++)
            s += `<rect class="cc-debris" x="${(x + Math.random() * w).toFixed(1)}" y="${(y + Math.random() * h).toFixed(1)}" width="7" height="7" rx="1.5" fill="${color}"/>`;
        svgNode(s, 650);
    };
    const pop = (x, y, txt) => svgNode(`<text class="cc-pop" x="${x}" y="${y}" text-anchor="middle">+${txt}</text>`, 850);
    const ring = (x, y) => svgNode(`<circle class="cc-ring" cx="${x}" cy="${y}" r="46" fill="none" stroke="#f59e0b" stroke-width="5"/>`, 500);
    const streak = (x, y, ang) => svgNode(`<path class="cc-streak" d="M${x} ${y}l${-Math.cos(ang) * 42} ${Math.sin(ang) * 42}" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>`, 450);

    /* ---------- damage & skor ---------- */
    function damageBlock(b, dmg, owner) {
        b.hp -= dmg; b.cool = 0.12;
        if (b.hp <= 0 && !b.dead) {
            b.dead = true; state.scores[owner] += MATS[b.mat].score;
            debris(b.x, b.y, b.w, b.h, MATS[b.mat].fill); pop(b.x + b.w / 2, b.y, MATS[b.mat].score);
            renderBlocks(); renderHud();
        }
    }
    function damageDog(d, dmg, owner) {
        d.hp -= dmg; d.cool = 0.12;
        if (d.hp <= 0 && !d.dead) {
            d.dead = true; state.scores[owner] += DOG_KINDS[d.kind].score; state.lastKO = owner;
            debris(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2, DOG_KINDS[d.kind].fill); pop(d.x, d.y - d.r, DOG_KINDS[d.kind].score);
            renderDogs(); renderHud();
        }
    }
    function explode(x, y, owner) {
        ring(x, y);
        for (const b of state.blocks) {
            if (b.dead) continue;
            const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
            if (d < 140) damageBlock(b, Math.max(2, Math.ceil(7 * (1 - d / 140))), owner);
        }
        for (const d of state.dogs) {
            if (d.dead) continue;
            const dist = Math.hypot(d.x - x, d.y - y);
            if (dist < 130) damageDog(d, Math.max(2, Math.ceil(6 * (1 - dist / 140))), owner);
        }
    }
    function triggerAbility() {
        const c = state.cat;
        if (!c || c.used) return;
        if (c.type === "zip") {
            c.used = true;
            const sp = Math.hypot(c.vx, c.vy) || 1, k = Math.min(1500 / sp, 1.55);
            streak(c.x, c.y, Math.atan2(c.vy, c.vx));
            c.vx *= k; c.vy *= k;
            publish(true);
        } else if (c.type === "boom") {
            c.used = true;
            const { x, y, owner } = c;
            state.cat = null; explode(x, y, owner); endFlight();
        }
    }

    /* ---------- alur pertandingan ---------- */
    function newMatch() {
        gen++;
        state = {
            v: 1, phase: "aim", level: 0,
            hostSlot: online ? coin() : 0,          // random posisi P1/P2 saat multiplayer
            firstTurn: 0, turn: 0,
            scores: [0, 0], ammo: [freshAmmo(), freshAmmo()],
            blocks: [], dogs: [], cat: null,
            aim: { angle: 45, power: 0.62, cat: "tabby" },
            msg: "", winner: null, lastKO: null,
        };
        startLevel(0);
        if (online) showBanner("Match start", `You play as P${mySlot() + 1}`, 1500);
    }

    function startLevel(li) {
        gen++;
        const L = LEVELS[li];
        state.level = li;
        state.blocks = L.blocks.map((b) => ({ ...b, dead: false, cool: 0 }));
        state.dogs = L.dogs.map((d) => ({ ...d, dead: false, cool: 0 }));
        state.ammo = [freshAmmo(), freshAmmo()];
        state.firstTurn = solo ? 0 : coin();       // random siapa jalan duluan
        state.turn = state.firstTurn;
        state.phase = "aim"; state.cat = null; state.msg = ""; state.lastKO = null;
        botPlan = null; fuse = -1; flightT = 0; pendingLaunch = false;
        localAim = { angle: 45, power: 0.62 }; localSel = firstAvail(mySlot());
        camTarget = 0; displayCat = null;
        over.hidden = true;
        renderAll(); publish(true);
        showBanner(`Level ${li + 1} — ${L.name}`, `${nameOf(state.firstTurn)} starts`, 1500);
        maybeBot();
    }

    function showBanner(title, subTxt, ms) {
        bannerT.textContent = title; bannerS.textContent = subTxt; banner.hidden = false;
        const g = gen; later(() => { if (g === gen) banner.hidden = true; }, ms);
    }

    function doLaunch(angle, power, type, slot) {
        const cap = CAP * (!online && cheats.power ? 1.35 : 1);
        const th = (angle * Math.PI) / 180, v = power * cap;
        const dir = { x: Math.cos(th), y: -Math.sin(th) }, pull = power * 46;
        state.cat = {
            x: ANCHOR.x - dir.x * pull, y: ANCHOR.y - dir.y * pull,
            vx: dir.x * v, vy: dir.y * v, type, r: CATS[type].r, owner: slot, used: false
        };
        state.aim = { angle, power, cat: type };
        state.phase = "flight"; flightT = 0; fuse = -1;
        banner.hidden = true;
        renderAll(); publish(true);
    }

    function endFlight() {
        if (state.phase !== "flight") return;
        state.phase = "resolve"; botPlan = null;
        renderAll(); publish(true);
        const g = gen; later(() => { if (g === gen) resolveTurn(); }, 550);
    }

    function resolveTurn() {
        state.cat = null;
        const cleared = state.dogs.every((d) => d.dead);
        const empty0 = !hasAmmo(0), empty1 = solo || !hasAmmo(1);
        if (cleared || (empty0 && empty1)) { finishLevel(cleared); return; }
        let next = solo ? 0 : 1 - state.turn;
        if (!hasAmmo(next)) next = state.turn;
        state.turn = next; state.phase = "aim";
        localAim = { angle: 45, power: 0.62 };
        if (next === mySlot()) localSel = firstAvail(next);
        camTarget = 0; pendingLaunch = false;
        renderAll(); publish(true); maybeBot();
    }

    function finishLevel(cleared) {
        gen++;
        state.phase = "levelend"; state.cat = null;
        let subTxt;
        if (cleared) {
            if (state.lastKO != null) state.scores[state.lastKO] += 1000;
            for (let s = 0; s < 2; s++)
                state.scores[s] += 250 * CAT_KEYS.reduce((n, k) => n + state.ammo[s][k], 0);
            subTxt = `Clear bonus +1000 · spare ammo +250 each`;
        } else subTxt = `${state.dogs.filter((d) => !d.dead).length} dog(s) survived`;
        state.msg = subTxt;
        if (solo && !cleared) { gameOver(false); return; }
        renderAll(); publish(true);
        showBanner(cleared ? `Level ${state.level + 1} cleared` : `Level ${state.level + 1} over`, subTxt, 1800);
        const g = gen;
        later(() => { if (g !== gen) return; state.level < LEVELS.length - 1 ? startLevel(state.level + 1) : gameOver(true); }, 1900);
    }

    function gameOver(finished) {
        gen++;
        state.phase = "over"; state.cat = null; banner.hidden = true;
        const [a, b] = state.scores;
        state.winner = solo ? (finished ? 0 : null) : a > b ? 0 : b > a ? 1 : "draw";
        overT.textContent = solo
            ? (finished ? "All dogs knocked out!" : "Out of ammo")
            : state.winner === "draw" ? "Draw!" : `${nameOf(state.winner)} wins!`;
        overS.textContent = solo ? `Final score ${a}` : `P1 ${a} — P2 ${b}`;
        over.hidden = false;
        try {
            const my = state.scores[mySlot()], prev = Number(localStorage.getItem(META.bestKey)) || 0;
            if (my > prev) localStorage.setItem(META.bestKey, String(my));
        } catch { }
        renderAll(); publish(true);
    }

    /* ---------- aksi (host-authoritative) ---------- */
    function applyAction(a, role) {
        if (!state || !a) return;
        if (a.t === "restart") { newMatch(); return; }
        const slot = slotOf(role);
        if (a.t === "launch") {
            if (state.phase !== "aim" || state.turn !== slot || !CATS[a.cat]) return;
            const free = freeAmmo(slot);
            if (state.ammo[slot][a.cat] <= 0 && !free) return;
            const angle = clamp(Number(a.angle) || 45, 2, 88);
            const power = clamp(Number(a.power) || 0.5, 0.12, 1);
            if (!free) state.ammo[slot][a.cat]--;
            doLaunch(angle, power, a.cat, slot);
        } else if (a.t === "ability") {
            if (state.phase !== "flight" || !state.cat || state.cat.owner !== slot) return;
            triggerAbility();
        }
    }
    function submitAction(a) {
        if (online && !room.isHost) {
            if (a.t === "launch") { pendingLaunch = true; renderControls(); }
            room.sendAction(a).catch(console.warn);
            return;
        }
        applyAction(a, netRole);
    }
    function publish(force) {
        if (!(online && room.isHost) || !state) return;
        const now = performance.now();
        if (force || now - lastPub > 120) { lastPub = now; room.publishState(state).catch(console.warn); }
    }

    /* ---------- bot ---------- */
    function solveShot(tx, ty) {
        const dx = tx - ANCHOR.x, dy = ty - ANCHOR.y;
        for (const ang of [52, 45, 58, 40, 62]) {
            const th = (ang * Math.PI) / 180;
            const den = 2 * Math.cos(th) ** 2 * (dy + dx * Math.tan(th));
            if (den <= 0) continue;
            const v = Math.sqrt((GRAV * dx * dx) / den);
            if (v <= CAP * 0.98) return { angle: ang, power: v / CAP };
        }
        return { angle: 45, power: 1 };
    }
    function maybeBot() {
        if (!authority || online || solo) return;
        if (state.phase === "aim" && state.turn === 1) {
            const g = gen; later(() => { if (g === gen) botThink(); }, 900);
        }
    }
    function botThink() {
        if (state.phase !== "aim" || state.turn !== 1) return;
        const alive = state.dogs.filter((d) => !d.dead);
        if (!alive.length) return;
        const target = alive[Math.floor(Math.random() * alive.length)];
        const avail = CAT_KEYS.filter((k) => state.ammo[1][k] > 0);
        if (!avail.length) return;
        const cluster = alive.filter((d) => Math.hypot(d.x - target.x, d.y - target.y) < 140).length;
        let type = "tabby";
        if (cluster >= 2 && avail.includes("boom")) type = "boom";
        else if (target.x - ANCHOR.x > 1000 && avail.includes("zip")) type = "zip";
        else if (avail.includes("chunk") && state.blocks.some((b) => !b.dead && b.mat === "stone" && Math.abs(b.x - target.x) < 120)) type = "chunk";
        if (!avail.includes(type)) type = avail[0];
        const s = solveShot(target.x, target.y);
        const angle = clamp(s.angle + rand(-2.5, 2.5), 2, 88);
        const power = clamp(s.power + rand(-0.05, 0.05), 0.15, 1);
        botPlan = { type, tx: target.x, boostX: ANCHOR.x + (target.x - ANCHOR.x) * 0.6 };
        state.aim = { angle, power, cat: type };
        renderAll(); publish(true);
        const g = gen;
        later(() => { if (g === gen) applyAction({ t: "launch", angle, power, cat: type }, 1); }, 650);
    }

    /* ---------- simulasi (hanya host / offline) ---------- */
    function sim(dt) {
        if (!state.cat) return;
        dt *= !online && cheats.slow ? 0.45 : 1;
        flightT += dt;
        const SUB = 4, h = dt / SUB;
        for (let k = 0; k < SUB; k++) {
            const c = state.cat;
            if (!c) return;
            c.x += c.vx * h; c.y += c.vy * h; c.vy += GRAV * h;
            const T = CATS[c.type];
            for (const b of state.blocks) {
                if (b.dead) continue;
                b.cool = Math.max(0, b.cool - h);
                const n = resolveRect(c, b);
                if (!n) continue;
                const speed = Math.hypot(c.vx, c.vy);
                if (b.cool <= 0) damageBlock(b, damageOf(speed, c.type), c.owner);
                if (c.vx * n.x + c.vy * n.y < 0) {
                    const v2 = reflect(c.vx, c.vy, n.x, n.y, T.rest);
                    c.vx = v2.vx * T.damp; c.vy = v2.vy * T.damp;
                }
                if (c.type === "boom" && fuse < 0) fuse = 0.3;
                break;
            }
            for (const d of state.dogs) {
                if (d.dead) continue;
                d.cool = Math.max(0, d.cool - h);
                const dx = c.x - d.x, dy = c.y - d.y, dist = Math.hypot(dx, dy), rr = c.r + d.r;
                if (dist >= rr) continue;
                const ux = dist > 1e-6 ? dx / dist : 0, uy = dist > 1e-6 ? dy / dist : -1;
                c.x = d.x + ux * (rr + 0.5); c.y = d.y + uy * (rr + 0.5);
                const speed = Math.hypot(c.vx, c.vy);
                if (d.cool <= 0) damageDog(d, damageOf(speed, c.type), c.owner);
                if (c.vx * ux + c.vy * uy < 0) {
                    const v2 = reflect(c.vx, c.vy, ux, uy, 0.45);
                    c.vx = v2.vx * 0.65; c.vy = v2.vy * 0.65;
                }
                if (c.type === "boom" && fuse < 0) fuse = 0.3;
                break;
            }
            if (c.y >= GROUND - c.r) {
                c.y = GROUND - c.r;
                if (c.vy > 0) { c.vy = -c.vy * 0.3; c.vx *= 0.72; }
                if (c.type === "boom" && fuse < 0 && Math.abs(c.vy) > 60) fuse = 0.3;
            }
            if (c.type === "boom" && fuse >= 0) {
                fuse -= h;
                if (fuse <= 0) { const { x, y, owner } = c; state.cat = null; explode(x, y, owner); endFlight(); return; }
            }
        }
        const c = state.cat;
        if (!c) return;
        if (!online && !solo && state.turn === 1 && botPlan && !c.used) {
            if (c.type === "zip" && c.x >= botPlan.boostX) triggerAbility();
            else if (c.type === "boom" && state.dogs.some((d) => !d.dead && Math.hypot(d.x - c.x, d.y - c.y) < 95)) triggerAbility();
        }
        if (!state.cat) return;
        const sp = Math.hypot(c.vx, c.vy);
        if ((sp < 60 && c.y >= GROUND - c.r - 1) || flightT > 9 || c.x < -40 || c.x > WORLD_W + 40) endFlight();
    }

    /* ---------- render ---------- */
    function renderStatic() {
        slingG.innerHTML =
            `<path d="M${ANCHOR.x} ${GROUND}V${ANCHOR.y + 12}M${ANCHOR.x - 12} ${ANCHOR.y}L${ANCHOR.x} ${ANCHOR.y + 12}L${ANCHOR.x + 12} ${ANCHOR.y}" stroke="#78716c" stroke-width="7" stroke-linecap="round" fill="none"/>`;
        let far = `<circle cx="820" cy="86" r="30" fill="#fde68a"/>`;
        for (const [cx, cy, w] of [[240, 120, 90], [620, 90, 120], [1120, 130, 100], [1520, 95, 130]])
            far += `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="18" fill="#ffffff" stroke="#eef2f7" stroke-width="2"/>`;
        far += `<path d="M0 ${GROUND}Q300 300 620 ${GROUND}T1300 ${GROUND}T1760 ${GROUND}V${GROUND}H0Z" fill="#f1f5f9"/>`;
        farG.innerHTML = far;
        nearG.innerHTML = `<path d="M0 ${GROUND}Q420 350 860 ${GROUND}T1760 ${GROUND}V${GROUND}H0Z" fill="#e9edf2"/>`;
    }
    function renderBlocks() {
        if (!state) { blocksG.innerHTML = ""; return; }
        blocksG.innerHTML = state.blocks.map((b) => {
            if (b.dead) return "";
            const M = MATS[b.mat], hurt = b.hp < b.max;
            return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="${M.fill}" stroke="${M.line}" stroke-width="1.6" opacity="${b.mat === "glass" ? 0.8 : 1}"/>` +
                (hurt ? `<path d="M${b.x + 3} ${b.y + b.h - 3}L${b.x + b.w - 3} ${b.y + 3}" stroke="${M.line}" stroke-width="1.2" opacity=".7"/>` : "");
        }).join("");
    }
    function dogSVG(d) {
        const K = DOG_KINDS[d.kind];
        let s = `<g transform="translate(${d.x} ${d.y})">`;
        s += `<path d="M${-d.r * 0.7} ${-d.r * 0.55}q-5 -7 -9 -2M${d.r * 0.7} ${-d.r * 0.55}q5 -7 9 -2" fill="none" stroke="${K.line}" stroke-width="3" stroke-linecap="round"/>`;
        s += `<circle r="${d.r}" fill="${K.fill}" stroke="${K.line}" stroke-width="2"/>`;
        if (K.gold) s += `<path d="M-8 ${-d.r - 1}l3 -6 5 4 5 -4 3 6z" fill="#f59e0b" stroke="#b45309" stroke-width="1.4" stroke-linejoin="round"/>`;
        s += `<circle cx="${-d.r * 0.32}" cy="-2" r="1.8" fill="#292524"/><circle cx="${d.r * 0.32}" cy="-2" r="1.8" fill="#292524"/>`;
        s += `<ellipse cx="0" cy="${d.r * 0.35}" rx="4.5" ry="3.2" fill="${K.line}"/>`;
        if (d.hp < d.max) s += `<rect x="${-d.r}" y="${-d.r - 8}" width="${d.r * 2}" height="3" rx="1.5" fill="#e7e5e4"/><rect x="${-d.r}" y="${-d.r - 8}" width="${(d.r * 2 * d.hp) / d.max}" height="3" rx="1.5" fill="#ef4444"/>`;
        return s + "</g>";
    }
    function renderDogs() {
        dogsG.innerHTML = state ? state.dogs.filter((d) => !d.dead).map(dogSVG).join("") : "";
    }
    function catSVG(x, y, angle, type) {
        const T = CATS[type], r = T.r;
        let s = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(angle || 0).toFixed(1)})">`;
        s += `<path d="M${-r * 0.7} 2q-9 4-6 10" fill="none" stroke="${T.line}" stroke-width="3" stroke-linecap="round"/>`;
        s += `<circle r="${r}" fill="${T.fill}" stroke="${T.line}" stroke-width="2"/>`;
        s += `<path d="M${-r * 0.7} ${-r * 0.4}l-2 -7 6 3zM${r * 0.7} ${-r * 0.4}l2 -7 -6 3z" fill="${T.fill}" stroke="${T.line}" stroke-width="2" stroke-linejoin="round"/>`;
        s += `<circle cx="-4" cy="-1" r="1.8" fill="#0b1020"/><circle cx="4" cy="-1" r="1.8" fill="#0b1020"/>`;
        s += `<path d="M-3 4q3 2.5 6 0" fill="none" stroke="#0b1020" stroke-width="1.6" stroke-linecap="round"/>`;
        if (type === "boom") s += `<path d="M0 ${-r}q2 -5 5 -6" fill="none" stroke="#64748b" stroke-width="2"/><circle cx="5" cy="${-r - 6}" r="2" fill="#f59e0b"/>`;
        if (type === "chunk") s += `<path d="M-6 6q6 4 12 0" fill="none" stroke="${T.line}" stroke-width="1.6"/>`;
        return s + "</g>";
    }
    const aimActive = () => state && state.phase === "aim" && (state.turn === mySlot() || (!online && !solo && state.turn === 1));
    const activeAim = () => (state.turn === mySlot() ? localAim : state.aim);
    const pullPos = (a) => {
        const th = (a.angle * Math.PI) / 180, p = a.power * 46;
        return { x: ANCHOR.x - Math.cos(th) * p, y: ANCHOR.y + Math.sin(th) * p };
    };
    function renderAim() {
        if (!aimActive()) { aimG.innerHTML = ""; return; }
        const a = activeAim(), pp = pullPos(a);
        const cap = CAP * (!online && cheats.power ? 1.35 : 1);
        const th = (a.angle * Math.PI) / 180, v = a.power * cap;
        let s = `<path d="M${ANCHOR.x - 12} ${ANCHOR.y}L${pp.x.toFixed(1)} ${pp.y.toFixed(1)}L${ANCHOR.x + 12} ${ANCHOR.y}" stroke="#ef4444" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        let p = { x: pp.x, y: pp.y, vx: Math.cos(th) * v, vy: -Math.sin(th) * v };
        const n = !online && cheats.arc ? 70 : 26;
        for (let i = 0; i < n; i++) {
            p = { x: p.x + p.vx * 0.05, y: p.y + p.vy * 0.05, vx: p.vx, vy: p.vy + GRAV * 0.05 };
            if (p.y > GROUND - 4) break;
            s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(1.4, 3 - i * 0.06).toFixed(1)}" fill="#a8a29e" opacity=".65"/>`;
        }
        aimG.innerHTML = s;
    }
    function renderCat() {
        if (!state) { catG.innerHTML = ""; return; }
        if ((state.phase === "flight" || state.phase === "resolve") && (online && !room.isHost ? displayCat : state.cat)) {
            const c = online && !room.isHost ? displayCat : state.cat;
            catG.innerHTML = catSVG(c.x, c.y, (Math.atan2(c.vy, c.vx) * 180) / Math.PI + 90, c.type);
        } else if (aimActive()) {
            const a = activeAim(), pp = pullPos(a);
            catG.innerHTML = catSVG(pp.x, pp.y, 0, state.turn === mySlot() ? localSel : state.aim.cat || "tabby");
        } else catG.innerHTML = "";
    }
    function renderMarker() {
        const c = state && (online && !room.isHost ? displayCat : state.cat);
        markerG.innerHTML = c && c.y < 6 && (state.phase === "flight")
            ? `<path d="M${clamp(c.x, camX + 16, camX + VIEW_W - 16)} 8l-7 12h14z" fill="#78716c"/>` : "";
    }
    function renderHud() {
        if (!state) { statusEl.textContent = "Waiting for host…"; return; }
        hud.level.textContent = state.level + 1;
        hud.p1.textContent = `P1 ${nameOf(0)}${online && mySlot() === 0 ? " ·you" : ""}`;
        hud.p2.textContent = `P2 ${nameOf(1)}${online && mySlot() === 1 ? " ·you" : ""}`;
        hud.s1.textContent = state.scores[0]; hud.s2.textContent = state.scores[1];
        hud.turndot.style.background = P_COLOR[state.turn];
        hud.turn.textContent = state.phase === "over" ? "Finished" : nameOf(state.turn);
        const mine = state.turn === mySlot();
        statusEl.textContent =
            state.phase === "aim" ? (mine ? "Your turn" : online ? "Opponent's turn" : "Bot is thinking…")
                : state.phase === "flight" ? "In flight"
                    : state.phase === "levelend" ? state.msg || "Level over"
                        : state.phase === "over" ? overT.textContent : "…";
    }
    function renderAmmo() {
        if (!state) { ammoWrap.innerHTML = ""; return; }
        const slot = state.turn, mine = slot === mySlot();
        ammoWrap.innerHTML = CAT_KEYS.map((k, i) => {
            const T = CATS[k], n = state.ammo[slot][k];
            const sel = mine && k === localSel ? " sel" : "";
            const dis = !mine || state.phase !== "aim" || (n <= 0 && !freeAmmo(slot)) ? " disabled" : "";
            return `<button type="button" class="${sel}" data-cat="${k}"${dis} aria-label="${k}">
        <svg width="20" height="20" viewBox="-12 -14 24 26"><circle r="9" fill="${T.fill}" stroke="${T.line}" stroke-width="1.6"/><path d="M-6 -4l-1.5 -5 4 2M6 -4l1.5 -5 -4 2" fill="${T.fill}" stroke="${T.line}" stroke-width="1.4"/></svg>
        <span class="n">${freeAmmo(slot) ? "∞" : n}</span></button>`;
        }).join("");
    }
    function renderControls() {
        const a = state && state.turn === mySlot() ? localAim : state ? state.aim : localAim;
        valAngle.textContent = `${Math.round(a.angle)}°`;
        valPower.textContent = `${Math.round(a.power * 100)}%`;
        const canFire = state && state.phase === "aim" && state.turn === mySlot() && !pendingLaunch &&
            (state.ammo[mySlot()][localSel] > 0 || freeAmmo(mySlot()));
        fireBtn.disabled = !canFire;
        const c = state && state.cat;
        abilityBtn.hidden = !(state && state.phase === "flight" && c && c.owner === mySlot() && !c.used && (c.type === "zip" || c.type === "boom"));
    }
    function renderAll() { renderBlocks(); renderDogs(); renderHud(); renderAmmo(); renderControls(); }

    /* ---------- kamera & loop ---------- */
    function applyCamera(dt) {
        const c = state && (online && !room.isHost ? displayCat : state.cat);
        if (state && state.phase === "flight" && c) camTarget = clamp(c.x - VIEW_W * 0.4, 0, CAM_MAX);
        camX += (camTarget - camX) * Math.min(1, dt * 6);
        if (Math.abs(camX - camTarget) < 0.5) camX = camTarget;
        svg.setAttribute("viewBox", `${camX.toFixed(1)} 0 ${VIEW_W} ${VIEW_H}`);
        farG.setAttribute("transform", `translate(${(camX * 0.75).toFixed(1)} 0)`);
        nearG.setAttribute("transform", `translate(${(camX * 0.45).toFixed(1)} 0)`);
    }
    function guestSmooth(dt) {
        if (!(online && !room.isHost)) return;
        if (!state || !state.cat) { displayCat = null; return; }
        if (!displayCat) displayCat = { ...state.cat };
        const k = 1 - Math.exp(-12 * dt), t = state.cat;
        displayCat.x += (t.x - displayCat.x) * k;
        displayCat.y += (t.y - displayCat.y) * k;
        displayCat.vx = t.vx; displayCat.vy = t.vy; displayCat.type = t.type;
    }
    function frame(t) {
        raf = requestAnimationFrame(frame);
        if (!lastT) { lastT = t; return; }
        const dt = Math.min(0.033, (t - lastT) / 1000);
        lastT = t;
        if (!state) return;
        if (authority && state.phase === "flight") { sim(dt); publish(false); }
        guestSmooth(dt);
        applyCamera(dt);
        renderCat(); renderAim(); renderMarker();
    }

    /* ---------- snapshot guest (FX dari diff) ---------- */
    function applySnapshot(s) {
        if (!s) return;
        const prev = state;
        state = s; pendingLaunch = false;
        if (prev && prev.level === s.level) {
            s.blocks.forEach((b, i) => { if (b.dead && prev.blocks[i] && !prev.blocks[i].dead) { debris(b.x, b.y, b.w, b.h, MATS[b.mat].fill); pop(b.x + b.w / 2, b.y, MATS[b.mat].score); } });
            s.dogs.forEach((d, i) => { if (d.dead && prev.dogs[i] && !prev.dogs[i].dead) { debris(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2, DOG_KINDS[d.kind].fill); pop(d.x, d.y - d.r, DOG_KINDS[d.kind].score); } });
            if (prev.cat && prev.cat.type === "boom" && !s.cat) ring(prev.cat.x, prev.cat.y);
        }
        if (!s.cat) displayCat = null;
        else if (!displayCat) displayCat = { ...s.cat };
        if (s.phase === "aim" && s.turn === mySlot()) localSel = firstAvail(mySlot());
        over.hidden = s.phase !== "over";
        if (s.phase === "over") { overT.textContent = s.winner === "draw" ? "Draw!" : `${nameOf(s.winner)} wins!`; overS.textContent = `P1 ${s.scores[0]} — P2 ${s.scores[1]}`; }
        renderAll();
    }

    /* ---------- input: mouse / touch ---------- */
    const toBoard = (e) => {
        const r = svg.getBoundingClientRect();
        return { x: camX + ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
    };
    const onDown = (e) => {
        if (!state) return;
        e.preventDefault();
        const p = toBoard(e);
        if (state.phase === "flight" && state.cat && state.cat.owner === mySlot()) tap = { x: p.x, y: p.y, moved: false };
        else if (state.phase === "aim" && state.turn === mySlot() && Math.hypot(p.x - ANCHOR.x, p.y - ANCHOR.y) < 130)
            drag = { mode: "aim", sx: p.x, sy: p.y, cx: p.x, cy: p.y };
        else drag = { mode: "pan", sx: e.clientX, camStart: camTarget };
        svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
        const p = toBoard(e);
        if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 8) tap.moved = true;
        if (!drag) return;
        if (drag.mode === "aim") {
            drag.cx = p.x; drag.cy = p.y;
            const dx = p.x - drag.sx, dy = p.y - drag.sy, d = Math.hypot(dx, dy);
            if (d > 6) {
                localAim = { angle: clamp((Math.atan2(dy, -dx) * 180) / Math.PI, 2, 88), power: clamp(d / 220, 0, 1) };
                renderControls();
            }
        } else {
            const r = svg.getBoundingClientRect();
            camTarget = clamp(drag.camStart - (e.clientX - drag.sx) * (VIEW_W / r.width), 0, CAM_MAX);
            camX = camTarget;
        }
    };
    const onUp = () => {
        if (tap) { if (!tap.moved) submitAction({ t: "ability" }); tap = null; }
        if (drag && drag.mode === "aim" && Math.hypot(drag.cx - drag.sx, drag.cy - drag.sy) >= 14 && localAim.power >= 0.12)
            submitAction({ t: "launch", angle: localAim.angle, power: localAim.power, cat: localSel });
        drag = null;
    };
    const onWheel = (e) => { e.preventDefault(); camTarget = clamp(camTarget + (e.deltaY + e.deltaX) * 0.5, 0, CAM_MAX); };
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("wheel", onWheel, { passive: false });

    /* ---------- input: keyboard (desktop) ---------- */
    const onKey = (e) => {
        if (destroyed || !state || !root.isConnected) return;
        if (e.target && e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) return;
        const mine = state.phase === "aim" && state.turn === mySlot();
        const k = e.key;
        const aimStep = (da, dp) => { if (!mine) return; localAim = { angle: clamp(localAim.angle + da, 2, 88), power: clamp(localAim.power + dp, 0.12, 1) }; renderControls(); e.preventDefault(); };
        if (k === "ArrowUp" || k === "w" || k === "W") aimStep(2, 0);
        else if (k === "ArrowDown" || k === "s" || k === "S") aimStep(-2, 0);
        else if (k === "ArrowRight") aimStep(0, 0.04);
        else if (k === "ArrowLeft") aimStep(0, -0.04);
        else if (k === "a" || k === "A") { camTarget = clamp(camTarget - 60, 0, CAM_MAX); e.preventDefault(); }
        else if (k === "d" || k === "D") { camTarget = clamp(camTarget + 60, 0, CAM_MAX); e.preventDefault(); }
        else if (k === " ") {
            e.preventDefault();
            if (state.phase === "flight" && state.cat && state.cat.owner === mySlot()) submitAction({ t: "ability" });
            else if (mine && !fireBtn.disabled) submitAction({ t: "launch", angle: localAim.angle, power: localAim.power, cat: localSel });
        }
        else if (k >= "1" && k <= "4") { const c = CAT_KEYS[Number(k) - 1]; if (mine && (state.ammo[mySlot()][c] > 0 || freeAmmo(mySlot()))) { localSel = c; renderAmmo(); renderControls(); } }
        else if ((k === "c" || k === "C") && !online) cheatPanel.hidden = !cheatPanel.hidden;
        else if ((k === "r" || k === "R") && state.phase === "over") submitAction({ t: "restart" });
        else if (k === "Home" || k === "h" || k === "H") camTarget = 0;
    };
    window.addEventListener("keydown", onKey);

    /* ---------- input: virtual buttons (mobile & mouse) ---------- */
    const holdStep = (k) => {
        if (!state) return;
        const mine = state.phase === "aim" && state.turn === mySlot();
        if (k === "panL") camTarget = clamp(camTarget - 40, 0, CAM_MAX);
        else if (k === "panR") camTarget = clamp(camTarget + 40, 0, CAM_MAX);
        else if (!mine) return;
        else if (k === "angU") localAim.angle = clamp(localAim.angle + 2, 2, 88);
        else if (k === "angD") localAim.angle = clamp(localAim.angle - 2, 2, 88);
        else if (k === "powU") localAim.power = clamp(localAim.power + 0.04, 0.12, 1);
        else if (k === "powD") localAim.power = clamp(localAim.power - 0.04, 0.12, 1);
        renderControls();
    };
    const stopHold = () => { if (holdId != null) { clearInterval(holdId); intervals.delete(holdId); holdId = null; } };
    const onHoldDown = (e) => {
        const b = e.target.closest("[data-hold]");
        if (!b) return;
        e.preventDefault();
        stopHold(); holdStep(b.dataset.hold);
        holdId = every(() => holdStep(b.dataset.hold), 70);
    };
    root.addEventListener("pointerdown", onHoldDown);
    window.addEventListener("pointerup", stopHold);

    /* ---------- klik & cheat ---------- */
    function handleClick(e) {
        if (e.target.closest("[data-exit]")) { onExit(); return; }
        const catBtn = e.target.closest("[data-cat]");
        if (catBtn && state && state.turn === mySlot()) { localSel = catBtn.dataset.cat; renderAmmo(); renderControls(); return; }
        const b = e.target.closest("[data-act]");
        if (!b || !state) return;
        const a = b.dataset.act;
        if (a === "fire") { if (!fireBtn.disabled) submitAction({ t: "launch", angle: localAim.angle, power: localAim.power, cat: localSel }); }
        else if (a === "ability") submitAction({ t: "ability" });
        else if (a === "home") camTarget = 0;
        else if (a === "rematch") submitAction({ t: "restart" });
        else if (a === "cheats" && !online) cheatPanel.hidden = !cheatPanel.hidden;
        else if (a === "cheat-ammo" && !online) { CAT_KEYS.forEach((k) => state.ammo[0][k]++); renderAmmo(); renderControls(); }
        else if (a === "cheat-clear" && !online && state.phase === "aim") {
            state.dogs.forEach((d) => { if (!d.dead) damageDog(d, 99, mySlot()); });
            finishLevel(true);
        }
        else if (a === "cheat-skip" && !online && state.phase === "aim") finishLevel(false);
    }
    const onChange = (e) => {
        const c = e.target.closest("[data-cheat]");
        if (c && !online) cheats[c.dataset.cheat] = c.checked;
    };
    root.addEventListener("click", handleClick);
    root.addEventListener("change", onChange);

    /* ---------- init & wiring room ---------- */
    renderStatic();
    renderAll();
    if (online) {
        sub(room.onRoom && room.onRoom((r) => { roomData = r; renderHud(); }));
        if (room.isHost) {
            newMatch();
            sub(room.onAction((action) => applyAction(action, 1)));
        } else {
            statusEl.textContent = "Waiting for host…";
            sub(room.onState((s) => applySnapshot(s)));
        }
    } else {
        newMatch();
    }
    raf = requestAnimationFrame(frame);

    return {
        destroy() {
            destroyed = true; gen++;
            if (raf) cancelAnimationFrame(raf);
            timers.forEach(clearTimeout); timers.clear();
            intervals.forEach(clearInterval); intervals.clear();
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerup", stopHold);
            root.removeEventListener("pointerdown", onHoldDown);
            root.removeEventListener("click", handleClick);
            root.removeEventListener("change", onChange);
            unsubs.forEach((u) => { try { u(); } catch { } });
            root.replaceChildren();
        },
    };
}