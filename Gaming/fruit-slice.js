/*
  fruit-slice.js — Fruit Slice (module template: META + mount)
  1. META.id harus sama dengan nama file tanpa .js  -> "fruit-slice"
  2. Setelah mengubah META, jalankan: node tools/build-games-manifest.mjs
*/

export const META = {
    id: "fruit-slice",
    name: "Fruit Slice",
    category: "action",
    catLabel: "Action",
    desc: "Slice flying fruit, dodge bombs, chain combos.",
    art: '<svg viewBox="0 0 48 48" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="27" r="14"/><path d="M24 13q1-5 6-6"/><path d="M24 13q-2-4-7-4"/><path d="M6 42L42 6"/></svg>',
    bg: ["#fecdd3", "#fb7185"],
    bestKey: "fruitSliceBest",
};

export function mount(root, context = {}) {
    const { mode = "ai", room = null, playerName = "Player", onExit = () => { } } = context;
    const online = mode === "room" && Boolean(room);
    const isHost = !online || Boolean(room.isHost);
    const clientIndex = online && !isHost ? 1 : 0;
    let roomData = (room && room.room) || null;

    /* ---------------- constants ---------------- */
    const W = 560, H = 520, G = 430;
    const LIVES = 3, MATCH_S = 60, HEADSTART_S = 1.6;
    const COMBO_WINDOW = 0.9, COMBO_BONUS = 5;
    const BOMB_GRACE_S = 8, BOMB_CHANCE = 0.16;
    const TRAIL_MS = 0.14, TRAIL_MAX = 14, HALF_LIFE = 0.65;
    const PUB_EVERY = 0.15, SEND_MS = 100;
    const SLOT_COLOR = ["#f43f5e", "#38bdf8"];
    const SLOT_POP = ["#fecdd3", "#bae6fd"];
    const FRUITS = [
        { kind: "apple", r: 20, pts: 10 },
        { kind: "orange", r: 18, pts: 10 },
        { kind: "melon", r: 26, pts: 15 },
    ];
    const FRUIT_STYLE = {
        apple: { skin: "#ef4444", flesh: "#fecaca", leaf: "#22c55e", r: 20 },
        orange: { skin: "#f59e0b", flesh: "#fde68a", leaf: "#16a34a", r: 18 },
        melon: { skin: "#22c55e", flesh: "#bbf7d0", leaf: "#15803d", r: 26 },
    };
    const NS = "http://www.w3.org/2000/svg";
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const mk = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    /* ---------------- pure helpers ---------------- */
    function segDist2(x1, y1, x2, y2, cx, cy) {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
        t = clamp(t, 0, 1);
        const px = x1 + t * dx, py = y1 + t * dy;
        return (px - cx) * (px - cx) + (py - cy) * (py - cy);
    }
    function segHitsCircle(x1, y1, x2, y2, cx, cy, r) {
        return segDist2(x1, y1, x2, y2, cx, cy) <= r * r;
    }
    function apexHeight(vy) { return (vy * vy) / (2 * G); }
    function tossSpec() {
        let vy = 0;
        do { vy = -(540 + Math.random() * 130); } while (apexHeight(vy) < 300);
        const vx = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 100);
        return { vx, vy, y: H + 30 };
    }

    /* ---------------- shell (minimalist, no tutorial text) ---------------- */
    root.innerHTML = `
<style>
.fs-app{--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--accent:#f43f5e;max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:12px;color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.fs-app [hidden]{display:none!important}
.fs-app .game-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.fs-app .game-intro h2{margin:0;font-size:18px;font-weight:650;letter-spacing:-.01em}
.fs-app .game-intro p{margin:2px 0 0;font-size:12px;color:var(--mut)}
.fs-app .game-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:4px 10px;white-space:nowrap}
.fs-app .game-status-dot{width:7px;height:7px;border-radius:50%;background:#94a3b8;display:inline-block}
.fs-app .game-status[data-state="playing"] .game-status-dot{background:#22c55e}
.fs-app .game-status[data-state="paused"] .game-status-dot{background:#f59e0b}
.fs-app .game-status[data-state="over"] .game-status-dot{background:#ef4444}
.fs-app .game-panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px}
.fs-hud{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:2px 4px 10px}
.fs-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut)}
.fs-chip b{color:var(--ink);font-weight:650;font-variant-numeric:tabular-nums;display:inline-block}
.fs-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.fs-flex{flex:1}
.fs-combo,.fs-combo b{color:var(--accent);font-weight:650}
.fs-hearts{display:inline-flex;gap:2px;align-items:center}
.fs-stage{position:relative;aspect-ratio:${W}/${H};border-radius:12px;overflow:hidden}
.fs-stage.shake{animation:fs-shake .3s linear}
.fs-board{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none}
.fs-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle,rgba(244,63,94,.30),rgba(244,63,94,0) 70%)}
.fs-flash.on{animation:fs-flash .35s ease-out}
.fs-ov{position:absolute;inset:0;display:grid;place-items:center;background:rgba(248,250,252,.78);backdrop-filter:blur(5px)}
.fs-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 26px;text-align:center;min-width:230px;max-width:300px;box-shadow:0 12px 32px rgba(15,23,42,.08)}
.fs-card h3{margin:0 0 12px;font-size:19px;font-weight:650}
.fs-card p{margin:-6px 0 12px;font-size:12.5px;color:var(--mut)}
.fs-card p:empty{display:none}
.fs-wait{font-size:12.5px;color:var(--mut)}
.fs-app .game-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fs-app .game-action-button{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--ink);cursor:pointer}
.fs-app .game-action-button:hover{background:#f8fafc}
.fs-app .game-action-button.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.fs-app .game-action-button.primary:hover{background:#1e293b}
.fs-seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.fs-seg button{border:0;background:#fff;padding:8px 12px;font-size:13px;color:var(--mut);cursor:pointer}
.fs-seg button[aria-pressed="true"]{background:var(--ink);color:#fff}
.fs-cdot{width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;margin-left:6px;vertical-align:middle}
.fs-cheats{text-align:left}
.fs-cheats h3{text-align:center}
.fs-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;background:none;border:0;border-bottom:1px solid var(--line);padding:9px 2px;font-size:13px;color:var(--ink);cursor:pointer}
.fs-row:last-of-type{border-bottom:0}
.fs-sw{position:relative;width:34px;height:20px;border-radius:999px;background:#e2e8f0;transition:background .15s;flex:none}
.fs-sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
.fs-row[aria-pressed="true"] .fs-sw{background:var(--ink)}
.fs-row[aria-pressed="true"] .fs-sw::after{transform:translateX(14px)}
.fs-cheat-actions{display:flex;gap:8px;justify-content:center;margin-top:14px}
.fs-bump{animation:fs-bump .18s ease-out}
.fs-app text.fs-pop{font-weight:700;font-family:system-ui,sans-serif;paint-order:stroke;stroke:#0b1220;stroke-width:3px;pointer-events:none}
@keyframes fs-bump{0%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes fs-shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-5px,2px)}40%{transform:translate(5px,-2px)}60%{transform:translate(-4px,-2px)}80%{transform:translate(3px,2px)}}
@keyframes fs-flash{0%{opacity:1}100%{opacity:0}}
</style>
<div class="game-app fs-app">
  <div class="game-intro">
    <div><h2>Fruit Slice</h2><p data-sub>Endless</p></div>
    <span class="game-status" data-state="ready"><i class="game-status-dot"></i><span data-status>Ready</span></span>
  </div>
  <section class="game-panel" data-board>
    <div class="fs-hud">
      <span class="fs-chip"><i class="fs-dot" data-hud="dot0" hidden></i><span data-hud="lab0">Score</span> <b data-hud="s0">0</b> <span class="fs-hearts" data-hud="h0"></span></span>
      <span class="fs-chip" data-hud="p2" hidden><i class="fs-dot" data-hud="dot1"></i><span data-hud="lab1">Bot</span> <b data-hud="s1">0</b> <span class="fs-hearts" data-hud="h1"></span></span>
      <span class="fs-chip fs-combo" data-hud="combo" hidden>Combo ×<b data-hud="comboN">2</b></span>
      <span class="fs-flex"></span>
      <span class="fs-chip" data-hud="timer" hidden><b data-hud="time">${MATCH_S}</b>s</span>
      <span class="fs-chip" data-hud="best">Best <b data-hud="bestN">0</b></span>
    </div>
    <div class="fs-stage" data-el="stage">
      <svg class="fs-board" data-el="board" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Fruit Slice board">
        <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#0b1220"/>
        <g data-el="halves"></g>
        <g data-el="items"></g>
        <g data-el="juice"></g>
        <g data-el="rings"></g>
        <g data-el="pops"></g>
        <g data-el="cursor" hidden><circle data-el="curRing" r="11" fill="none" stroke="#fff" stroke-width="1.5"/><circle data-el="curDot" r="2" fill="#fff"/></g>
        <polyline data-el="trail" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".8" points=""/>
      </svg>
      <div class="fs-flash" data-el="flash"></div>
      <div class="fs-ov" data-ov="start">
        <div class="fs-card">
          <h3>Fruit Slice</h3>
          <button class="game-action-button primary" type="button" data-act="start" data-el="startBtn">Start</button>
          <span class="fs-wait" data-el="wait" hidden>Waiting for host…</span>
        </div>
      </div>
      <div class="fs-ov" data-ov="over" hidden>
        <div class="fs-card">
          <h3 data-el="ovTitle">Game over</h3>
          <p data-el="ovSub"></p>
          <button class="game-action-button primary" type="button" data-act="start" data-el="again">Play again</button>
        </div>
      </div>
      <div class="fs-ov" data-ov="pause" hidden>
        <div class="fs-card">
          <h3>Paused</h3>
          <button class="game-action-button primary" type="button" data-act="resume">Resume</button>
        </div>
      </div>
      <div class="fs-ov" data-ov="cheats" hidden>
        <div class="fs-card fs-cheats">
          <h3>Cheats</h3>
          <button class="fs-row" type="button" data-cheat="lives" aria-pressed="false">Infinite lives<span class="fs-sw"></span></button>
          <button class="fs-row" type="button" data-cheat="noBomb" aria-pressed="false">No bombs<span class="fs-sw"></span></button>
          <button class="fs-row" type="button" data-cheat="slow" aria-pressed="false">Slow motion<span class="fs-sw"></span></button>
          <button class="fs-row" type="button" data-cheat="wide" aria-pressed="false">Wide blade<span class="fs-sw"></span></button>
          <button class="fs-row" type="button" data-cheat="auto" aria-pressed="false">Auto slice<span class="fs-sw"></span></button>
          <button class="fs-row" type="button" data-cheat="double" aria-pressed="false">Double points<span class="fs-sw"></span></button>
          <div class="fs-cheat-actions">
            <button class="game-action-button" type="button" data-act="cheat-add">+50 points</button>
            <button class="game-action-button primary" type="button" data-act="cheat-close">Done</button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="game-actions">
    <span class="fs-seg" data-el="seg">
      <button type="button" data-act="mode-solo" aria-pressed="true">Solo</button>
      <button type="button" data-act="mode-vs" aria-pressed="false">VS Bot</button>
    </span>
    <button class="game-action-button" type="button" data-act="restart" data-el="restartBtn">Restart</button>
    <button class="game-action-button" type="button" data-act="pause" data-el="pauseBtn">Pause</button>
    <button class="game-action-button" type="button" data-act="cheats" data-el="cheatBtn">Cheats<span class="fs-cdot" data-el="cdot" hidden></span></button>
    <span class="fs-flex"></span>
    <button class="game-action-button" type="button" data-exit>Exit game</button>
  </div>
</div>`;

    /* ---------------- refs ---------------- */
    const $ = (sel) => root.querySelector(sel);
    const show = (el) => el.removeAttribute("hidden");
    const hide = (el) => el.setAttribute("hidden", "");
    const subEl = $("[data-sub]");
    const statusWrap = $(".game-status");
    const statusEl = $("[data-status]");
    const stageEl = $('[data-el="stage"]');
    const boardEl = $('[data-el="board"]');
    const itemsG = $('[data-el="items"]');
    const halvesG = $('[data-el="halves"]');
    const juiceG = $('[data-el="juice"]');
    const ringsG = $('[data-el="rings"]');
    const popsG = $('[data-el="pops"]');
    const cursorEl = $('[data-el="cursor"]');
    const curRing = $('[data-el="curRing"]');
    const curDot = $('[data-el="curDot"]');
    const trailEl = $('[data-el="trail"]');
    const flashEl = $('[data-el="flash"]');
    const dot0 = $('[data-hud="dot0"]'), dot1 = $('[data-hud="dot1"]');
    const lab0 = $('[data-hud="lab0"]'), lab1 = $('[data-hud="lab1"]');
    const s0El = $('[data-hud="s0"]'), s1El = $('[data-hud="s1"]');
    const h0El = $('[data-hud="h0"]'), h1El = $('[data-hud="h1"]');
    const p2Chip = $('[data-hud="p2"]');
    const comboChip = $('[data-hud="combo"]'), comboN = $('[data-hud="comboN"]');
    const timerChip = $('[data-hud="timer"]'), timeEl = $('[data-hud="time"]');
    const bestChip = $('[data-hud="best"]'), bestN = $('[data-hud="bestN"]');
    const ovStart = $('[data-ov="start"]'), ovOver = $('[data-ov="over"]');
    const ovPause = $('[data-ov="pause"]'), ovCheats = $('[data-ov="cheats"]');
    const startBtn = $('[data-el="startBtn"]'), waitEl = $('[data-el="wait"]');
    const againBtn = $('[data-el="again"]');
    const ovTitle = $('[data-el="ovTitle"]'), ovSub = $('[data-el="ovSub"]');
    const segEl = $('[data-el="seg"]');
    const segSolo = $('[data-act="mode-solo"]'), segVs = $('[data-act="mode-vs"]');
    const restartBtn = $('[data-el="restartBtn"]');
    const pauseBtn = $('[data-el="pauseBtn"]');
    const cheatBtn = $('[data-el="cheatBtn"]'), cdot = $('[data-el="cdot"]');
    const cheatRows = {};
    root.querySelectorAll("[data-cheat]").forEach((el) => {
        cheatRows[el.getAttribute("data-cheat")] = el;
    });
    cursorEl.setAttribute("transform", "translate(" + W / 2 + " " + H / 2 + ")");

    /* ---------------- state ---------------- */
    let sub = online ? "vs" : "solo"; /* solo = endless, vs = 60s race */
    let state = null;
    let raf = 0, lastT = 0, pubAcc = 0, lastFlush = 0, lastSnap = 0, lastEv = 0;
    let cheatsOpen = false, pausedByCheats = false, cheatedRun = false;
    let swiping = false, botT = 1.2;
    const cheats = { lives: false, noBomb: false, slow: false, wide: false, auto: false, double: false };
    const itemEls = new Map(); /* id -> { el, kind } (DOM kept OUT of serializable state) */
    const halves = [], juice = [], pops = [], rings = [], trail = [], sendQ = [];
    const keys = { up: false, down: false, left: false, right: false, slice: false };
    const cursor = { x: W / 2, y: H / 2, visible: false };
    const offs = [];
    let best = readBest();

    function readBest() {
        try { return parseInt(localStorage.getItem(META.bestKey), 10) || 0; } catch (e) { return 0; }
    }
    function saveBest(v) {
        try { localStorage.setItem(META.bestKey, String(v)); } catch (e) { /* ignore */ }
    }
    function anyCheat() { return Object.keys(cheats).some((k) => cheats[k]); }
    function mySlot() { return online && state ? state.seats[clientIndex] : 0; }
    function botEnabled() { return !online && sub === "vs"; }
    function label(i) { return online ? "P" + (i + 1) : i === 0 ? "You" : "Bot"; }

    function freshState(s, phase) {
        return {
            v: 1, sub: s, phase: phase, t: 0,
            timeLeft: s === "vs" ? MATCH_S : 0,
            lock: s === "vs" ? HEADSTART_S : 0,
            first: Math.random() < 0.5 ? 0 : 1,                    /* random first mover */
            seats: online ? (Math.random() < 0.5 ? [0, 1] : [1, 0]) : [0, 1], /* random P1/P2 seats */
            items: [], nextId: 1, spawnT: 0.7,
            score: [0, 0], lives: [LIVES, LIVES], combo: [0, 0], comboT: [9, 9],
            winner: null, reason: "", evSeq: 0, events: [],
        };
    }

    /* ---------------- graphics ---------------- */
    function fruitEl(kind) {
        const st = FRUIT_STYLE[kind];
        const g = mk("g", {});
        g.appendChild(mk("circle", { cx: 0, cy: 0, r: st.r, fill: st.skin, stroke: "#00000030", "stroke-width": 1.5 }));
        if (kind === "melon") {
            for (let i = -1; i <= 1; i++) {
                g.appendChild(mk("path", {
                    d: "M" + i * st.r * 0.55 + " " + -st.r * 0.92 + " Q" + i * st.r * 0.75 + " 0 " + i * st.r * 0.55 + " " + st.r * 0.92,
                    fill: "none", stroke: "#15803d", "stroke-width": 3,
                }));
            }
        } else {
            g.appendChild(mk("path", {
                d: "M-4 " + (-st.r + 2) + " Q0 " + (-st.r - 5) + " 4 " + (-st.r + 2),
                fill: "none", stroke: "#7c2d12", "stroke-width": 2, "stroke-linecap": "round",
            }));
        }
        g.appendChild(mk("path", { d: "M2 " + (-st.r + 1) + " q6 -7 12 -5 q-3 7 -12 5", fill: st.leaf, stroke: "#14532d", "stroke-width": 1 }));
        return g;
    }
    function bombEl() {
        const g = mk("g", {});
        g.appendChild(mk("circle", { cx: 0, cy: 0, r: 17, fill: "#1f2937", stroke: "#4b5563", "stroke-width": 2 }));
        g.appendChild(mk("circle", { cx: -5, cy: -5, r: 4, fill: "#4b5563" }));
        g.appendChild(mk("path", { d: "M6 -14 q4 -8 12 -8", fill: "none", stroke: "#9ca3af", "stroke-width": 2, "stroke-linecap": "round" }));
        g.appendChild(mk("circle", { cx: 19, cy: -22, r: 4, fill: "#fbbf24" }));
        return g;
    }
    function heartSvg(on) {
        return '<svg viewBox="0 0 24 24" width="12" height="12" fill="' + (on ? "#ef4444" : "#e2e8f0") + '" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    }
    function bump(el) {
        el.classList.remove("fs-bump");
        void el.offsetWidth;
        el.classList.add("fs-bump");
    }

    /* ---------------- local effects (not synced) ---------------- */
    function juiceDot(x, y, color) {
        const el = mk("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 3, fill: color });
        juiceG.appendChild(el);
        juice.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 140, t: 0, el });
    }
    function pop(x, y, text, color, size) {
        const el = mk("text", { class: "fs-pop", "text-anchor": "middle", fill: color });
        el.style.fontSize = size + "px";
        el.textContent = text;
        popsG.appendChild(el);
        pops.push({ x: clamp(x, 34, W - 34), y: clamp(y, 30, H - 20), t: 0, el });
    }
    function fxSlice(it, slot, dx, dy, pts, combo) {
        const stl = FRUIT_STYLE[it.kind];
        if (!stl) return;
        const dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
        for (const side of [1, -1]) {
            const g = mk("g", {});
            const r = stl.r;
            const d = side > 0
                ? "M0 0 A" + r + " " + r + " 0 0 1 0 " + 2 * r + " Z"
                : "M0 0 A" + r + " " + r + " 0 0 0 0 " + 2 * r + " Z";
            g.appendChild(mk("path", { d, fill: stl.skin, stroke: stl.flesh, "stroke-width": 3 }));
            g.appendChild(mk("circle", { cx: 0, cy: r, r: 2.4, fill: "#00000040" }));
            halvesG.appendChild(g);
            halves.push({
                x: it.x + side * uy * 6, y: it.y - side * ux * 6,
                vx: (it.vx || 0) * 0.5 + side * uy * 130,
                vy: (it.vy || 0) * 0.35 - 60 - side * ux * 130,
                rot: 0, vr: side * 320, t: 0, el: g,
            });
        }
        for (let k = 0; k < 5; k++) juiceDot(it.x, it.y, stl.flesh);
        const col = state.sub === "vs" ? SLOT_POP[slot] : "#ffffff";
        pop(it.x, it.y - 8, "+" + pts + (combo >= 2 ? " ×" + combo : ""), col, combo >= 3 ? 19 : 15);
    }
    function fxBoom(x, y) {
        const el = mk("circle", { cx: x, cy: y, r: 8, fill: "none", stroke: "#f59e0b", "stroke-width": 3 });
        ringsG.appendChild(el);
        rings.push({ t: 0, el });
        for (let k = 0; k < 10; k++) juiceDot(x, y, k % 2 ? "#f87171" : "#fbbf24");
        flashEl.classList.remove("on"); void flashEl.offsetWidth; flashEl.classList.add("on");
        stageEl.classList.remove("shake"); void stageEl.offsetWidth; stageEl.classList.add("shake");
    }
    function updateEffects(dt) {
        for (let i = halves.length - 1; i >= 0; i--) {
            const h = halves[i];
            h.t += dt; h.vy += G * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt;
            if (h.t >= HALF_LIFE || h.y > H + 80) { h.el.remove(); halves.splice(i, 1); continue; }
            h.el.setAttribute("transform", "translate(" + h.x.toFixed(1) + " " + h.y.toFixed(1) + ") rotate(" + h.rot.toFixed(1) + ") scale(" + (1 - 0.25 * (h.t / HALF_LIFE)).toFixed(2) + ")");
            h.el.setAttribute("opacity", (1 - h.t / HALF_LIFE).toFixed(2));
        }
        for (let i = juice.length - 1; i >= 0; i--) {
            const j = juice[i];
            j.t += dt; j.vy += G * 0.8 * dt; j.x += j.vx * dt; j.y += j.vy * dt;
            if (j.t >= 0.55) { j.el.remove(); juice.splice(i, 1); continue; }
            j.el.setAttribute("cx", j.x.toFixed(1));
            j.el.setAttribute("cy", j.y.toFixed(1));
            j.el.setAttribute("opacity", (1 - j.t / 0.55).toFixed(2));
        }
        for (let i = pops.length - 1; i >= 0; i--) {
            const p = pops[i];
            p.t += dt;
            if (p.t >= 0.8) { p.el.remove(); pops.splice(i, 1); continue; }
            const k = p.t / 0.8;
            const s = 1 + 0.3 * Math.max(0, 1 - p.t / 0.12);
            p.el.setAttribute("transform", "translate(" + p.x.toFixed(1) + " " + (p.y - 46 * k).toFixed(1) + ") scale(" + s.toFixed(2) + ")");
            p.el.setAttribute("opacity", (1 - k).toFixed(2));
        }
        for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.t += dt;
            if (r.t >= 0.35) { r.el.remove(); rings.splice(i, 1); continue; }
            r.el.setAttribute("r", (8 + r.t * 480).toFixed(1));
            r.el.setAttribute("opacity", (1 - r.t / 0.35).toFixed(2));
        }
    }

    /* ---------------- events for guests ---------------- */
    function pushEv(e) {
        if (!(online && isHost)) return;
        state.evSeq++;
        state.events.push(Object.assign({ seq: state.evSeq }, e));
        if (state.events.length > 16) state.events.shift();
    }

    /* ---------------- rules ---------------- */
    function spawnItem() {
        const st = state;
        const grace = st.sub === "solo" ? BOMB_GRACE_S : 6;
        const noBomb = !online && cheats.noBomb;
        const isBomb = !noBomb && st.t > grace && Math.random() < BOMB_CHANCE;
        const spec = tossSpec();
        const f = FRUITS[(Math.random() * FRUITS.length) | 0];
        const it = {
            id: st.nextId++,
            x: 70 + Math.random() * (W - 140), y: spec.y,
            vx: isBomb ? spec.vx * 0.5 : spec.vx,
            vy: isBomb ? spec.vy * 0.92 : spec.vy,
            kind: isBomb ? "bomb" : f.kind,
            r: isBomb ? 17 : f.r, pts: isBomb ? 0 : f.pts,
            angle: Math.random() * 360, spin: (Math.random() - 0.5) * 240,
        };
        st.items.push(it);
    }
    function sliceItem(it, slot, dx, dy) {
        const st = state;
        const i = st.items.indexOf(it);
        if (i < 0) return;
        st.items.splice(i, 1);
        if (it.kind === "bomb") { bombHit(it, slot); return; }
        st.combo[slot] = st.comboT[slot] <= COMBO_WINDOW ? st.combo[slot] + 1 : 1;
        st.comboT[slot] = 0;
        const dbl = !online && cheats.double && slot === 0 ? 2 : 1;
        const pts = it.pts * dbl + (st.combo[slot] - 1) * COMBO_BONUS;
        st.score[slot] += pts;
        if (isHost) fxSlice(it, slot, dx, dy, pts, st.combo[slot]);
        pushEv({ type: "slice", x: it.x, y: it.y, slot, kind: it.kind, pts, combo: st.combo[slot], dx, dy });
        render();
    }
    function bombHit(it, slot) {
        const st = state;
        st.combo[slot] = 0; st.comboT[slot] = 9;
        const shield = !online && cheats.lives && slot === 0;
        if (!shield) st.lives[slot]--;
        if (isHost) { fxBoom(it.x, it.y); if (!shield) pop(it.x, it.y, "−1", "#f87171", 15); }
        pushEv({ type: "bomb", x: it.x, y: it.y, slot, shield });
        if (!shield && st.lives[slot] <= 0) {
            finish(st.sub === "solo" ? null : 1 - slot, "Out of lives");
        } else render();
    }
    function onMiss(it) {
        const st = state;
        if (it.kind === "bomb" || st.sub !== "solo") return;
        const shield = !online && cheats.lives;
        if (!shield) st.lives[0]--;
        if (isHost) pop(clamp(it.x, 30, W - 30), H - 26, shield ? "∞" : "−1", "#f87171", 13);
        if (!shield && st.lives[0] <= 0) finish(null, "Out of lives");
        else render();
    }
    function performSlice(slot, x1, y1, x2, y2) {
        const st = state;
        if (!st || st.phase !== "playing") return;
        const wide = !online && cheats.wide && slot === 0 ? 2.2 : 1;
        for (let i = st.items.length - 1; i >= 0; i--) {
            const it = st.items[i];
            if (segHitsCircle(x1, y1, x2, y2, it.x, it.y, it.r * wide)) {
                sliceItem(it, slot, x2 - x1, y2 - y1);
                if (st.phase !== "playing") return;
            }
        }
    }
    function finish(winner, reason) {
        const st = state;
        st.phase = "over"; st.winner = winner; st.reason = reason;
        swiping = false; keys.slice = false;
        if (st.sub === "solo" && !cheatedRun && st.score[0] > best) { best = st.score[0]; saveBest(best); }
        publish();
    }
    function clearField() {
        itemEls.forEach((rec) => rec.el.remove());
        itemEls.clear();
        halves.forEach((h) => h.el.remove()); halves.length = 0;
        juice.forEach((j) => j.el.remove()); juice.length = 0;
        pops.forEach((p) => p.el.remove()); pops.length = 0;
        rings.forEach((r) => r.el.remove()); rings.length = 0;
        trail.length = 0; trailEl.setAttribute("points", "");
        swiping = false;
    }
    function startGame() {
        if (online && !isHost) return;
        clearField();
        state = freshState(sub, "playing");
        cheatedRun = anyCheat();
        botT = 1.2; lastEv = 0; sendQ.length = 0;
        publish();
    }
    function setSub(s) {
        if (online || sub === s) return;
        sub = s;
        clearField();
        state = freshState(sub, "ready");
        cheatedRun = false;
        publish();
    }

    /* ---------------- bot ---------------- */
    function botAct() {
        const st = state;
        botT = 1.7 - 0.6 * clamp(st.t / 60, 0, 1) + Math.random() * 0.6;
        if (st.phase !== "playing") return;
        if (st.lock > 0 && st.first !== 1) { botT = 0.2; return; }
        if (Math.random() < 0.2) return; /* hesitation keeps the bot beatable */
        const bombs = st.items.filter((i) => i.kind === "bomb" && i.y < H - 40);
        if (bombs.length && Math.random() < 0.08) {
            sliceItem(bombs[(Math.random() * bombs.length) | 0], 1, 1, 0);
            publish();
            return;
        }
        const fruit = st.items.filter((i) => i.kind !== "bomb" && i.y > 40 && i.y < H - 40);
        if (!fruit.length) { botT = 0.3; return; }
        fruit.sort((a, b) => Math.abs(a.vy) - Math.abs(b.vy));
        const pick = fruit[Math.random() < 0.6 ? 0 : (Math.random() * fruit.length) | 0];
        const ang = Math.random() * Math.PI * 2;
        sliceItem(pick, 1, Math.cos(ang), Math.sin(ang));
        publish();
    }

    /* ---------------- update (host / offline only) ---------------- */
    function update(dt) {
        const st = state;
        st.t += dt;
        if (st.lock > 0) st.lock = Math.max(0, st.lock - dt);
        for (let s = 0; s < 2; s++) {
            st.comboT[s] += dt;
            if (st.comboT[s] > COMBO_WINDOW) st.combo[s] = 0;
        }
        st.spawnT -= dt;
        if (st.spawnT <= 0) {
            const t = clamp(st.t / 60, 0, 1);
            const n = st.t < 10 ? 1 : Math.random() < 0.45 ? 2 : 1;
            for (let i = 0; i < n; i++) spawnItem();
            st.spawnT = (st.sub === "solo" ? 1.35 - 0.5 * t : 1.05 - 0.3 * t) + Math.random() * (st.sub === "solo" ? 0.45 : 0.35);
        }
        if (botEnabled()) { botT -= dt; if (botT <= 0) botAct(); }
        if (!online && cheats.auto && !(st.lock > 0 && st.first !== 0)) {
            for (let i = st.items.length - 1; i >= 0; i--) {
                const it = st.items[i];
                if (it.kind !== "bomb" && it.vy > -30 && it.vy < 90 && it.y < H - 30) sliceItem(it, 0, 1, 0);
            }
        }
        for (let i = st.items.length - 1; i >= 0; i--) {
            const it = st.items[i];
            it.vy += G * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.angle += it.spin * dt;
            if (it.x < it.r && it.vx < 0) it.vx *= -0.92;
            if (it.x > W - it.r && it.vx > 0) it.vx *= -0.92;
            if (it.y > H + 60 && it.vy > 0) {
                st.items.splice(i, 1);
                onMiss(it);
                if (st.phase !== "playing") return;
            }
        }
        if (st.sub === "vs") {
            st.timeLeft -= dt;
            if (st.timeLeft <= 0) {
                st.timeLeft = 0;
                const w = st.score[0] > st.score[1] ? 0 : st.score[1] > st.score[0] ? 1 : null;
                finish(w, "Time up");
            }
        }
    }

    /* ---------------- actions (template pattern) ---------------- */
    function applyAction(action, actor) {
        if (!state || !action || action.type !== "slices") return;
        if (state.phase !== "playing") return;
        const slot = online ? state.seats[actor] : actor;
        if (slot !== 0 && slot !== 1) return;
        if (state.lock > 0 && slot !== state.first) return;
        const segs = Array.isArray(action.segs) ? action.segs.slice(0, 40) : [];
        for (const s of segs) {
            if (!Array.isArray(s) || s.length !== 4) continue;
            const x1 = Number(s[0]), y1 = Number(s[1]), x2 = Number(s[2]), y2 = Number(s[3]);
            if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
            performSlice(slot, clamp(x1, -60, W + 60), clamp(y1, -60, H + 60), clamp(x2, -60, W + 60), clamp(y2, -60, H + 60));
            if (state.phase !== "playing") break;
        }
        publish();
    }
    function submitAction(action) {
        if (online && !isHost) { room.sendAction(action).catch(console.warn); return; }
        applyAction(action, clientIndex);
    }
    function submitSeg(x1, y1, x2, y2) {
        if (!state || state.phase !== "playing") return;
        if (state.lock > 0 && mySlot() !== state.first) return;
        const seg = [x1, y1, x2, y2];
        if (online && !isHost) { sendQ.push(seg); return; } /* batched to reduce writes */
        submitAction({ type: "slices", segs: [seg] });
    }

    /* ---------------- pointer input (mouse + touch, no virtual buttons) ---------------- */
    function toSvg(e) {
        const r = boardEl.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    }
    function onDown(e) {
        if (!state) return;
        if (state.phase === "paused" && !online && !cheatsOpen) resume();
        if (state.phase !== "playing") return;
        e.preventDefault();
        try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        cursor.visible = false; hide(cursorEl);
        swiping = true; trail.length = 0;
        const p = toSvg(e);
        trail.push({ x: p.x, y: p.y, t: 0 });
    }
    function onMove(e) {
        if (!swiping || !state || state.phase !== "playing") return;
        e.preventDefault();
        const p = toSvg(e);
        const last = trail[trail.length - 1];
        if (!last) { trail.push({ x: p.x, y: p.y, t: 0 }); return; }
        submitSeg(last.x, last.y, p.x, p.y);
        trail.push({ x: p.x, y: p.y, t: 0 });
        if (trail.length > TRAIL_MAX) trail.shift();
    }
    function onUp() { swiping = false; }
    function onCtx(e) { e.preventDefault(); }

    /* ---------------- keyboard input (desktop) ---------------- */
    const MOVE_KEYS = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
    };
    function onKeyDown(e) {
        if (e.target && e.target.closest && e.target.closest("input,textarea,select")) return;
        const k = e.key;
        const move = MOVE_KEYS[k];
        if (move) {
            keys[move] = true; cursor.visible = true; show(cursorEl);
            e.preventDefault();
            return;
        }
        if (k === " ") {
            e.preventDefault();
            if (!state) return;
            if (state.phase === "ready" || state.phase === "over") { if (isHost) startGame(); return; }
            if (state.phase !== "playing") return;
            cursor.visible = true; show(cursorEl);
            if (!keys.slice) {
                submitSeg(cursor.x - 44, cursor.y, cursor.x + 44, cursor.y);
                trail.push({ x: cursor.x - 44, y: cursor.y, t: 0 });
                trail.push({ x: cursor.x + 44, y: cursor.y, t: 0 });
            }
            keys.slice = true;
            return;
        }
        if (e.repeat) return;
        if (k === "Enter") {
            if (state && (state.phase === "ready" || state.phase === "over") && isHost) { startGame(); e.preventDefault(); }
        } else if (k === "p" || k === "P") {
            if (!online && state) { togglePause(); e.preventDefault(); }
        } else if (k === "r" || k === "R") {
            if (isHost && state) { startGame(); e.preventDefault(); }
        } else if (k === "c" || k === "C") {
            if (!online) { setCheats(!cheatsOpen); e.preventDefault(); }
        } else if (k === "Escape") {
            if (cheatsOpen) { setCheats(false); e.preventDefault(); }
            else if (!online && state && state.phase === "playing") { togglePause(); e.preventDefault(); }
        }
    }
    function onKeyUp(e) {
        const move = MOVE_KEYS[e.key];
        if (move) keys[move] = false;
        if (e.key === " ") keys.slice = false;
    }
    function onBlur() {
        keys.up = keys.down = keys.left = keys.right = keys.slice = false;
        swiping = false;
    }
    function moveCursor(dt) {
        if (!cursor.visible || !state || state.phase !== "playing") return;
        let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        if (dx || dy) {
            const l = Math.hypot(dx, dy);
            dx /= l; dy /= l;
            const px = cursor.x, py = cursor.y;
            cursor.x = clamp(cursor.x + dx * 430 * dt, 10, W - 10);
            cursor.y = clamp(cursor.y + dy * 430 * dt, 10, H - 10);
            if (keys.slice && (cursor.x !== px || cursor.y !== py)) {
                submitSeg(px, py, cursor.x, cursor.y);
                trail.push({ x: cursor.x, y: cursor.y, t: 0 });
                if (trail.length > TRAIL_MAX) trail.shift();
            }
        }
        cursorEl.setAttribute("transform", "translate(" + cursor.x.toFixed(1) + " " + cursor.y.toFixed(1) + ")");
    }

    /* ---------------- pause / cheats ---------------- */
    function togglePause() {
        if (!state || online) return;
        if (cheatsOpen) { setCheats(false); return; }
        if (state.phase === "playing") { state.phase = "paused"; swiping = false; keys.slice = false; }
        else if (state.phase === "paused") { state.phase = "playing"; pausedByCheats = false; }
        publish();
    }
    function resume() {
        if (!state || state.phase !== "paused") return;
        state.phase = "playing"; pausedByCheats = false;
        publish();
    }
    function setCheats(open) {
        if (online) return;
        cheatsOpen = open;
        if (open) {
            if (state && state.phase === "playing") { state.phase = "paused"; pausedByCheats = true; }
        } else if (pausedByCheats && state && state.phase === "paused") {
            state.phase = "playing"; pausedByCheats = false;
        }
        render();
    }
    function onVis() {
        if (document.hidden && !online && state && state.phase === "playing") {
            state.phase = "paused"; swiping = false; keys.slice = false;
            render();
        }
    }

    /* ---------------- click routing (template pattern) ---------------- */
    function handleClick(event) {
        const t = event.target;
        if (t.closest("[data-exit]")) { onExit(); return; }
        const row = t.closest("[data-cheat]");
        if (row && !online) {
            const k = row.getAttribute("data-cheat");
            if (k in cheats) {
                cheats[k] = !cheats[k];
                if (anyCheat() && state && state.phase !== "over") cheatedRun = true;
                render();
            }
            return;
        }
        const act = t.closest("[data-act]");
        if (!act) return;
        switch (act.getAttribute("data-act")) {
            case "start": if (isHost) startGame(); break;
            case "restart": if (isHost && state) startGame(); break;
            case "pause": togglePause(); break;
            case "resume": resume(); break;
            case "cheats": setCheats(!cheatsOpen); break;
            case "cheat-close": setCheats(false); break;
            case "cheat-add":
                if (state && (state.phase === "playing" || state.phase === "paused")) {
                    state.score[mySlot()] += 50;
                    cheatedRun = true;
                    publish();
                }
                break;
            case "mode-solo": setSub("solo"); break;
            case "mode-vs": setSub("vs"); break;
        }
    }

    /* ---------------- render ---------------- */
    function setScore(el, v) {
        if (el.textContent !== String(v)) { el.textContent = String(v); bump(el); }
    }
    function setHearts(el, lives) {
        if (el.dataset.v === String(lives)) return;
        el.dataset.v = String(lives);
        let html = "";
        for (let i = 0; i < LIVES; i++) html += heartSvg(i < lives);
        el.innerHTML = html;
        bump(el);
    }
    function resultTitle() {
        const st = state;
        if (st.sub === "solo") return "Game over";
        if (st.winner === null) return "Draw";
        if (online) return st.winner === mySlot() ? "You win" : "P" + (st.winner + 1) + " wins";
        return st.winner === 0 ? "You win" : "Bot wins";
    }
    function resultSub() {
        const st = state;
        if (st.sub === "solo") {
            return st.reason + " · Score " + st.score[0] + " · Best " + best + (cheatedRun ? " · cheats" : "");
        }
        return st.reason + " · " + label(0) + " " + st.score[0] + " — " + label(1) + " " + st.score[1];
    }
    function statusText() {
        if (!state) return "Connecting";
        const st = state;
        if (st.phase === "ready") return "Ready";
        if (st.phase === "paused") return "Paused";
        if (st.phase === "over") return resultTitle();
        if (st.lock > 0) return label(st.first) + " first · " + st.lock.toFixed(1) + "s";
        return "Playing";
    }
    function render() {
        segEl.hidden = online;
        pauseBtn.hidden = online;
        cheatBtn.hidden = online;
        restartBtn.hidden = online && !isHost;
        segSolo.setAttribute("aria-pressed", String(sub === "solo"));
        segVs.setAttribute("aria-pressed", String(sub === "vs"));
        cdot.hidden = !anyCheat();
        for (const k in cheatRows) cheatRows[k].setAttribute("aria-pressed", String(cheats[k]));
        if (!state) {
            statusWrap.dataset.state = "ready";
            statusEl.textContent = "Connecting";
            subEl.textContent = "Multiplayer";
            show(ovStart); hide(ovOver); hide(ovPause); hide(ovCheats);
            startBtn.hidden = true; waitEl.hidden = false;
            return;
        }
        const st = state;
        const vs = st.sub === "vs";
        const my = mySlot();
        subEl.textContent = online
            ? playerName + " · You are P" + (my + 1)
            : vs ? "VS Bot · " + MATCH_S + "s match" : "Endless · Best " + best;
        dot0.hidden = !vs;
        dot0.style.background = SLOT_COLOR[0];
        dot1.style.background = SLOT_COLOR[1];
        lab0.textContent = vs ? label(0) : "Score";
        lab1.textContent = label(1);
        setScore(s0El, st.score[0]);
        setScore(s1El, st.score[1]);
        setHearts(h0El, st.lives[0]);
        setHearts(h1El, st.lives[1]);
        p2Chip.hidden = !vs;
        timerChip.hidden = !vs;
        bestChip.hidden = vs;
        bestN.textContent = String(best);
        const guest = online && !isHost;
        ovStart.hidden = st.phase !== "ready";
        startBtn.hidden = guest; waitEl.hidden = !guest;
        ovOver.hidden = st.phase !== "over";
        againBtn.hidden = guest;
        ovPause.hidden = !(st.phase === "paused" && !cheatsOpen);
        ovCheats.hidden = !cheatsOpen;
        if (st.phase === "over") { ovTitle.textContent = resultTitle(); ovSub.textContent = resultSub(); }
        statusWrap.dataset.state = st.phase;
        statusEl.textContent = statusText();
        const col = vs ? SLOT_COLOR[my] : "#ffffff";
        trailEl.setAttribute("stroke", col);
        curRing.setAttribute("stroke", col);
        curDot.setAttribute("fill", col);
    }
    function renderLite() {
        if (!state) return;
        const st = state;
        if (st.sub === "vs") timeEl.textContent = String(Math.ceil(Math.max(0, st.timeLeft)));
        statusEl.textContent = statusText();
        const my = mySlot();
        const c = st.combo[my];
        const on = st.phase === "playing" && c >= 2 && st.comboT[my] <= COMBO_WINDOW;
        comboChip.hidden = !on;
        if (on && comboN.textContent !== String(c)) { comboN.textContent = String(c); bump(comboChip); }
    }
    function publish() {
        render();
        if (online && isHost && state) room.publishState(state).catch(console.warn);
    }

    /* ---------------- drawing ---------------- */
    function guestItems() {
        const age = clamp((performance.now() - lastSnap) / 1000, 0, 0.5);
        const out = [];
        for (const it of state.items) {
            const y = it.y + it.vy * age + 0.5 * G * age * age;
            if (y > H + 80) continue;
            out.push({
                id: it.id, kind: it.kind,
                x: it.x + it.vx * age, y,
                angle: it.angle + it.spin * age,
            });
        }
        return out;
    }
    function drawItems() {
        if (!state) return;
        const list = isHost ? state.items : guestItems();
        const seen = new Set();
        for (const it of list) {
            seen.add(it.id);
            let rec = itemEls.get(it.id);
            if (!rec) {
                const el = it.kind === "bomb" ? bombEl() : fruitEl(it.kind);
                itemsG.appendChild(el);
                rec = { el, kind: it.kind };
                itemEls.set(it.id, rec);
            }
            rec.el.setAttribute("transform", "translate(" + it.x.toFixed(1) + " " + it.y.toFixed(1) + ") rotate(" + it.angle.toFixed(1) + ")");
        }
        itemEls.forEach((rec, id) => {
            if (!seen.has(id)) { rec.el.remove(); itemEls.delete(id); }
        });
    }
    function drawTrail(dt) {
        for (let i = trail.length - 1; i >= 0; i--) {
            trail[i].t += dt;
            if (trail[i].t > TRAIL_MS) trail.splice(i, 1);
        }
        let pts = "";
        for (const p of trail) pts += p.x.toFixed(1) + "," + p.y.toFixed(1) + " ";
        trailEl.setAttribute("points", pts.trim());
    }

    /* ---------------- guest snapshot ---------------- */
    function adopt(s) {
        state = s;
        lastSnap = performance.now();
        if (state.evSeq < lastEv) lastEv = 0;
        const evs = state.events || [];
        for (const ev of evs) {
            if (ev.seq <= lastEv) continue;
            lastEv = ev.seq;
            if (ev.type === "slice") {
                fxSlice({ x: ev.x, y: ev.y, kind: ev.kind, vx: 0, vy: 0 }, ev.slot, ev.dx || 1, ev.dy || 0, ev.pts, ev.combo);
            } else if (ev.type === "bomb") {
                fxBoom(ev.x, ev.y);
                if (!ev.shield) pop(ev.x, ev.y, "−1", "#f87171", 15);
            }
        }
        render();
    }

    /* ---------------- main loop ---------------- */
    function tick(t) {
        raf = requestAnimationFrame(tick);
        if (!lastT) lastT = t;
        let dt = (t - lastT) / 1000;
        lastT = t;
        dt = clamp(dt, 0, 0.05);
        if (state && state.phase === "playing" && isHost) {
            update(!online && cheats.slow ? dt * 0.55 : dt);
        }
        if (online && isHost && state && state.phase === "playing") {
            pubAcc += dt;
            if (pubAcc >= PUB_EVERY) { pubAcc = 0; room.publishState(state).catch(console.warn); }
        }
        if (online && !isHost && sendQ.length && t - lastFlush >= SEND_MS) {
            lastFlush = t;
            submitAction({ type: "slices", segs: sendQ.splice(0, 40) });
        }
        moveCursor(dt);
        updateEffects(dt);
        drawItems();
        drawTrail(dt);
        renderLite();
    }

    /* ---------------- wiring ---------------- */
    root.addEventListener("click", handleClick);
    boardEl.addEventListener("pointerdown", onDown);
    boardEl.addEventListener("pointermove", onMove);
    boardEl.addEventListener("pointerup", onUp);
    boardEl.addEventListener("pointercancel", onUp);
    boardEl.addEventListener("pointerleave", onUp);
    boardEl.addEventListener("contextmenu", onCtx);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);

    if (online) {
        const offRoom = typeof room.onRoom === "function" ? room.onRoom((next) => { roomData = next; render(); }) : null;
        if (typeof offRoom === "function") offs.push(offRoom);
        if (isHost) {
            state = freshState("vs", "ready");
            publish();
            const offAct = typeof room.onAction === "function" ? room.onAction((action) => applyAction(action, 1)) : null;
            if (typeof offAct === "function") offs.push(offAct);
        } else {
            const offState = typeof room.onState === "function" ? room.onState((s) => { if (s) adopt(s); }) : null;
            if (typeof offState === "function") offs.push(offState);
        }
    } else {
        state = freshState(sub, "ready");
        render();
    }
    raf = requestAnimationFrame(tick);

    return {
        destroy() {
            cancelAnimationFrame(raf);
            raf = 0;
            root.removeEventListener("click", handleClick);
            boardEl.removeEventListener("pointerdown", onDown);
            boardEl.removeEventListener("pointermove", onMove);
            boardEl.removeEventListener("pointerup", onUp);
            boardEl.removeEventListener("pointercancel", onUp);
            boardEl.removeEventListener("pointerleave", onUp);
            boardEl.removeEventListener("contextmenu", onCtx);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("visibilitychange", onVis);
            for (const off of offs) { try { off(); } catch (e) { /* ignore */ } }
        },
    };
}